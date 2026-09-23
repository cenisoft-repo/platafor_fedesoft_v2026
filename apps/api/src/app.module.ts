import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { CorrelationMiddleware } from "./common/correlation.middleware.js";
import { DenyByDefaultGuard } from "./common/deny-by-default.guard.js";
import { HealthController } from "./health/health.controller.js";
import { PrismaService } from "./prisma/prisma.service.js";
import { BillingModule } from "./billing/billing.module.js";
import { IdentityModule } from "./identity/identity.module.js";
import { CsrfGuard } from "./identity/csrf.guard.js";

@Module({
  imports: [
    /* Tope global conservador para todo el API; los endpoints de autenticación
       llevan además el suyo, más estricto. El almacén es de memoria: con más
       de una réplica el límite se multiplica, así que al escalar pasa a un
       almacén compartido —sin tocar ningún controlador—. */
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    IdentityModule,
    BillingModule,
  ],
  controllers: [HealthController],
  providers: [
    PrismaService,
    /* Globales a propósito: se aplican a todo lo que exista ahora y a todo lo
       que se añada después, sin que nadie tenga que acordarse. El orden
       importa — primero se frena el abuso por volumen, después se comprueba
       que la petición no venga montada desde otro sitio, y al final quién es y
       qué puede. */
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: DenyByDefaultGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationMiddleware).forRoutes("*splat");
  }
}
