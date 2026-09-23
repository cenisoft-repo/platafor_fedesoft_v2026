import "reflect-metadata";
/* Carga `apps/api/.env` en desarrollo. En producción no hay archivo y las
   variables vienen del entorno del despliegue: `dotenv` no pisa nada que ya
   esté definido, así que el orden es seguro. */
import "dotenv/config";
import { NestFactory } from "@nestjs/core";
import { Logger, ValidationPipe, VersioningType } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import type { NestExpressApplication } from "@nestjs/platform-express";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { AppModule } from "./app.module.js";
import { loadEnv } from "./config/env.js";

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  /* rawBody: sin el cuerpo original no hay firma verificable. Reserializar
     el JSON cambia los bytes y toda firma HMAC falla. */
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    rawBody: true,
  });

  /* Detrás de un balanceador, sin esto todas las peticiones llegan con la IP
     del ingress: el límite de tasa se vuelve un cupo compartido y la
     auditoría pierde el dato. El número de saltos se declara, no se asume. */
  if (env.TRUSTED_PROXY_HOPS > 0) {
    app.set("trust proxy", env.TRUSTED_PROXY_HOPS);
  }

  app.use(helmet());
  /* La sesión viaja en cookie; sin esto no hay de dónde leerla. */
  app.use(cookieParser());

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
