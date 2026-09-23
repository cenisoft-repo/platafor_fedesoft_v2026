import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { MembershipStatus, Segment } from "@fedesoft/db";
import { PERMISSION_KEY, PUBLIC_KEY, SESSION_KEY, SENSITIVE_PERMISSIONS, grants } from "./permissions.js";

/**
 * Quién pide, desde qué empresa y con qué puede operar.
 *
 * Lo construye el middleware de sesión en cada petición a partir del rol
 * vigente de la organización activa (ADR-008). No se copia en la sesión ni se
 * cachea: quitar un rol debe sentirse en la petición siguiente.
 */
export interface ActorContext {
  userId: string;
  sessionId: string;
  organizationId: string | null;
  roleKey: string | null;
  permissions: string[];
  internal: boolean;
  /** El rol activo exige segundo factor (`Role.mfaRequired`). */
  mfaRequired: boolean;
  /** El proveedor de identidad acreditó el segundo factor en esta sesión. */
  mfaSatisfied: boolean;
  /** Atributos de la empresa activa: son la parte ABAC de la decisión. */
  segment: Segment | null;
  membershipStatus: MembershipStatus | null;
}

/**
 * Denegar por defecto.
 *
 * Un endpoint sin `@RequirePermission`, sin `@RequireSession` y sin `@Public`
 * no se sirve: el olvido falla cerrado, no abierto. Es la traducción literal
 * de la regla del proyecto — la autorización vive en el servidor, y ocultar un
 * botón en el frontend no es un control.
 */
@Injectable()
export class DenyByDefaultGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const objetivos = [context.getHandler(), context.getClass()];

    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, objetivos)) return true;

    const soloSesion = this.reflector.getAllAndOverride<boolean>(SESSION_KEY, objetivos);
    const requerido = this.reflector.getAllAndOverride<string>(PERMISSION_KEY, objetivos);
    if (!requerido && !soloSesion) {
      throw new ForbiddenException(
        "Endpoint sin permiso declarado. Añade @RequirePermission, @RequireSession o @Public de forma explícita.",
      );
    }

    const request = context.switchToHttp().getRequest<{ actor?: ActorContext }>();
    const actor = request.actor;
    if (!actor) throw new ForbiddenException({ code: "no_session", message: "Sin sesión." });

    /* Un perfil interno sin segundo factor no opera. La regla es del rol, no
       de la ruta: si mañana aparece un endpoint interno nuevo, ya está
       cubierto sin que nadie tenga que acordarse. Se miran las dos cosas —que
       el rol sea interno y que exija factor— para que una fila mal sembrada no
       abra la consola. */
    if ((actor.internal || actor.mfaRequired) && !actor.mfaSatisfied) {
      throw new ForbiddenException({ code: "mfa_required", message: "Esta sesión necesita segundo factor." });
    }

    if (!requerido) return true;

    /* Y un permiso sensible tampoco se ejerce sin segundo factor, aunque el
       rol sea externo: mueven dinero o reparten privilegios. */
    if (SENSITIVE_PERMISSIONS.has(requerido) && !actor.mfaSatisfied) {
      throw new ForbiddenException({ code: "mfa_required", message: "Esta sesión necesita segundo factor." });
    }

    if (!grants(actor.permissions, requerido)) {
      /* El código lo lee el portal para decidir si reintenta con segundo
         factor o si simplemente esconde la opción. El actor ya está
         autenticado: aquí no se filtra nada que no sepa. */
      throw new ForbiddenException({ code: "insufficient_permission", message: "Permiso insuficiente." });
    }
    return true;
  }
}
