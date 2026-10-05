import { Module } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { AuditService } from "../common/audit.service.js";
import { OutboxService } from "../outbox/outbox.service.js";
import { loadEnv } from "../config/env.js";
import { IDENTITY_PROVIDER } from "./ports/identity-provider.port.js";
import { OidcIdentityProvider } from "./adapters/oidc-identity-provider.adapter.js";
import { IdentityParameters } from "./domain/identity-parameters.js";
import { SessionService } from "./domain/session.service.js";
import { LoginUseCase } from "./domain/login.use-case.js";
import { OrganizationUsersUseCase } from "./domain/organization-users.use-case.js";
import { InternalUsersUseCase } from "./domain/internal-users.use-case.js";
import { AuthHttpService, IDENTITY_URLS, type IdentityUrls } from "./http/auth-http.service.js";
import { SessionMiddleware } from "./http/session.middleware.js";
import { ConsoleAuthController, PortalAuthController } from "./auth.controller.js";
import { OrganizationUsersController } from "./organization-users.controller.js";
import { AdminUsersController } from "./admin-users.controller.js";

/**
 * Identidad y acceso (EPIC-02, ADR-008).
 *
 * Como en facturación, el proveedor se elige aquí y solo aquí: cambiar de
 * Keycloak a otro proveedor OIDC es configuración; a uno no OIDC, otro
 * adaptador del mismo puerto. Ningún caso de uso se entera.
 */
@Module({
  controllers: [PortalAuthController, ConsoleAuthController, OrganizationUsersController, AdminUsersController],
  providers: [
    PrismaService,
    AuditService,
    OutboxService,
    IdentityParameters,
    SessionService,
    LoginUseCase,
    OrganizationUsersUseCase,
    InternalUsersUseCase,
    AuthHttpService,
    SessionMiddleware,
    {
      provide: IDENTITY_PROVIDER,
      useFactory: () => {
        const env = loadEnv();
        return new OidcIdentityProvider({
          issuer: env.OIDC_ISSUER_URL,
          clientId: env.OIDC_CLIENT_ID,
          clientSecret: env.OIDC_CLIENT_SECRET,
          mfaValues: env.OIDC_MFA_VALUES.split(",").map((v) => v.trim()).filter(Boolean),
          mfaAcrRequest: env.OIDC_MFA_ACR_REQUEST,
          mfaMaxAgeSec: env.OIDC_CONSOLE_MAX_AGE_SEC,
        });
      },
    },
    {
      provide: IDENTITY_URLS,
      useFactory: (): IdentityUrls => {
        const env = loadEnv();
        return { apiPublicUrl: env.API_PUBLIC_URL, portalUrl: env.PORTAL_URL, consoleUrl: env.CONSOLE_URL };
      },
    },
  ],
  exports: [SessionMiddleware, SessionService],
})
export class IdentityModule {}
