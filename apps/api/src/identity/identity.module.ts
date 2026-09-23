import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { AuditService } from "../common/audit.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { loadEnv, returnUrls, type Env } from "../config/env.js";
import { ENV, SECURE_COOKIES } from "./identity.tokens.js";
import { AuthController } from "./auth.controller.js";
import { SessionController } from "./session.controller.js";
import { SessionMiddleware } from "./session.middleware.js";
import { ActorResolver } from "./domain/actor.resolver.js";
import { SessionService } from "./domain/session.service.js";
import { StartLoginUseCase } from "./domain/start-login.use-case.js";
import { CompleteLoginUseCase } from "./domain/complete-login.use-case.js";
import { SwitchOrganizationUseCase } from "./domain/switch-organization.use-case.js";
import { LogoutUseCase } from "./domain/logout.use-case.js";
import { IDENTITY_PROVIDER, type IdentityProviderPort } from "./ports/identity-provider.port.js";
import { OidcIdentityProvider } from "./adapters/oidc-identity-provider.adapter.js";
import { StubIdentityProvider } from "./adapters/stub-identity-provider.adapter.js";

/**
 * El proveedor de identidad se elige aquí, en una sola línea, igual que la
 * pasarela en `billing.module.ts`. Cambiar de Keycloak a Auth0 o a Entra no
 * toca ninguna regla de autorización: toca esta función y el entorno.
 */
function buildIdentityProvider(env: Env): IdentityProviderPort {
  if (env.IDENTITY_PROVIDER === "oidc") {
    const { OIDC_ISSUER_URL, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET } = env;
    /* `loadEnv` ya lo exige, pero repetirlo aquí evita que un cambio futuro en
       la validación deje este adaptador arrancando sin credenciales. */
    if (!OIDC_ISSUER_URL || !OIDC_CLIENT_ID || !OIDC_CLIENT_SECRET) {
      throw new Error("Con IDENTITY_PROVIDER=oidc faltan emisor, cliente o secreto.");
    }
    return new OidcIdentityProvider({
      issuerUrl: OIDC_ISSUER_URL,
      clientId: OIDC_CLIENT_ID,
      clientSecret: OIDC_CLIENT_SECRET,
      redirectUri: env.OIDC_REDIRECT_URI,
      scope: env.OIDC_SCOPE,
      mfaAcr: env.OIDC_MFA_ACR,
    });
  }
  return new StubIdentityProvider(env.OIDC_REDIRECT_URI);
}

@Module({
  controllers: [AuthController, SessionController],
  providers: [
    PrismaService,
    AuditService,
    ActorResolver,
    CompleteLoginUseCase,
    SwitchOrganizationUseCase,
    LogoutUseCase,
    SessionMiddleware,
    { provide: ENV, useFactory: () => loadEnv() },
    { provide: SECURE_COOKIES, useFactory: (env: Env) => env.SESSION_COOKIE_SECURE, inject: [ENV] },
    { provide: IDENTITY_PROVIDER, useFactory: buildIdentityProvider, inject: [ENV] },
    {
      provide: SessionService,
      useFactory: (prisma: PrismaService, env: Env) =>
        new SessionService(prisma, {
          absoluteMinutes: env.SESSION_ABSOLUTE_MINUTES,
          idleMinutes: env.SESSION_IDLE_MINUTES,
        }),
      inject: [PrismaService, ENV],
    },
    {
      provide: StartLoginUseCase,
      useFactory: (prisma: PrismaService, provider: IdentityProviderPort, env: Env) =>
        new StartLoginUseCase(prisma, provider, returnUrls(env)),
      inject: [PrismaService, IDENTITY_PROVIDER, ENV],
    },
  ],
})
export class IdentityModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    /* En todas las rutas, incluidas las públicas: el middleware no decide
       nada, solo deja el actor si la sesión vale. */
    consumer.apply(SessionMiddleware).forRoutes("*splat");
  }
}
