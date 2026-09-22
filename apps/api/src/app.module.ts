import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { CorrelationMiddleware } from "./common/correlation.middleware.js";
import { DenyByDefaultGuard } from "./common/deny-by-default.guard.js";
import { HealthController } from "./health/health.controller.js";
import { PrismaService } from "./prisma/prisma.service.js";

@Module({
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
    consumer.apply(CorrelationMiddleware).forRoutes("*splat");
  }
}
