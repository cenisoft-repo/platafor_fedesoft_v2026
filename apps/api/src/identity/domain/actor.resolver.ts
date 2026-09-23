import { Injectable } from "@nestjs/common";
import type { Session } from "@fedesoft/db";
import { PrismaService } from "../../prisma/prisma.service.js";
import type { ActorContext } from "../../common/deny-by-default.guard.js";

/**
 * Convierte una sesión en un actor, en cada petición.
 *
 * Deliberadamente no se cachea ni se congela en la sesión: los permisos son
 * los del rol que la persona tiene **ahora** en la empresa activa. Copiarlos
 * al iniciar sesión sería dejar vivo un privilegio ya retirado hasta que
 * caduque la sesión, que es justo lo que RF-IDE-008 prohíbe.
 *
 * Un usuario con rol de gerente en una empresa y de contacto en otra no
 * acumula: opera con lo que le da la empresa en la que está parado.
 */
@Injectable()
export class ActorResolver {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(session: Session): Promise<ActorContext | null> {
    const user = await this.prisma.user.findUnique({ where: { id: session.userId } });
    /* Persona bloqueada o borrada: la sesión ya no vale, por viva que esté. */
    if (!user || user.status !== "ACTIVO") return null;

    const base: ActorContext = {
      userId: user.id,
      sessionId: session.id,
      organizationId: null,
      roleKey: null,
      permissions: [],
      internal: false,
      mfaRequired: false,
      mfaSatisfied: session.mfaSatisfiedAt !== null,
      segment: null,
      membershipStatus: null,
    };

    if (!session.activeOrganizationId) return base;

    const vinculo = await this.prisma.organizationUser.findUnique({
      where: {
        organizationId_userId: { organizationId: session.activeOrganizationId, userId: user.id },
      },
      include: {
        role: true,
        organization: {
          include: { memberships: { where: { validTo: null }, take: 1 } },
        },
      },
    });

    /* Dejó de pertenecer a esa empresa: sigue autenticado, pero sin nada que
       hacer allí. Sin permisos, el guard deniega cada endurecimiento. */
    if (!vinculo) return base;

    return {
      ...base,
      organizationId: vinculo.organizationId,
      roleKey: vinculo.role.key,
      permissions: vinculo.role.permissions,
      internal: vinculo.role.internal,
      mfaRequired: vinculo.role.mfaRequired,
      segment: vinculo.organization.segment,
      membershipStatus: vinculo.organization.memberships[0]?.status ?? null,
    };
  }

  /** Empresas entre las que esta persona puede elegir (RF-IDE-003). */
  async organizationsOf(userId: string): Promise<
    { organizationId: string; legalName: string; roleKey: string; segment: string }[]
  > {
    const vinculos = await this.prisma.organizationUser.findMany({
      where: { userId },
      include: { role: true, organization: true },
      orderBy: { createdAt: "asc" },
    });
    return vinculos.map((v) => ({
      organizationId: v.organizationId,
      legalName: v.organization.legalName,
      roleKey: v.role.key,
      segment: v.organization.segment,
    }));
  }
}
