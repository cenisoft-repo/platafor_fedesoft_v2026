import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { CorrelationMiddleware } from "./common/correlation.middleware.js";
import { DenyByDefaultGuard } from "./common/deny-by-default.guard.js";
import { HealthController } from "./health/health.controller.js";
import { PrismaService } from "./prisma/prisma.service.js";
import { BillingModule } from "./billing/billing.module.js";
import { IdentityModule } from "./identity/identity.module.js";
import { SessionMiddleware } from "./identity/http/session.middleware.js";

@Module({
  imports: [BillingModule, IdentityModule],
  controllers: [HealthController],
  providers: [
    PrismaService,
    /* Global a propósito: el guard se aplica a todo lo que exista ahora y a
       todo lo que se añada después, sin que nadie tenga que acordarse. */
    { provide: APP_GUARD, useClass: DenyByDefaultGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    /* Orden: primero el correlation_id (la auditoría del login lo usa),
       después la sesión, que pone `req.actor` para el guard global. */
    consumer.apply(CorrelationMiddleware, SessionMiddleware).forRoutes("*splat");
  }
}
