import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Logger, ValidationPipe, VersioningType } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import helmet from "helmet";
import { AppModule } from "./app.module.js";
import { loadEnv } from "./config/env.js";

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.use(helmet());

  /* Las rutas del afiliado viven en /v1 y las internas en /admin/v1. La
     separación es de URI, no solo de permiso: facilita firewall y auditoría. */
  app.setGlobalPrefix("");
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      /* Un campo no declarado es un error, no algo que se ignora en silencio. */
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const origenes = env.CORS_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean);
  app.enableCors({ origin: origenes.length > 0 ? origenes : false, credentials: true });

  if (env.NODE_ENV !== "production") {
    const doc = new DocumentBuilder()
      .setTitle("Portal Único del Afiliado — API")
      .setDescription("Endpoints /v1 (afiliado) y /admin/v1 (consola interna).")
      .setVersion("1")
      .build();
    SwaggerModule.setup("docs", app, SwaggerModule.createDocument(app, doc));
  }

  app.enableShutdownHooks();
  await app.listen(env.PORT);
  new Logger("bootstrap").log(`API escuchando en :${env.PORT} (${env.NODE_ENV})`);
}

void bootstrap();
