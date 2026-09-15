# ADR-002 · Stack tecnológico

- **Estado:** Aceptado (ratifica la sección 3 del documento base; proveedores concretos quedan como decisiones pendientes)
- **Fecha:** 2026-09-15
- **Decisores:** Fedesoft/Cenisoft (documento base) · Tech lead A0 · Revisión A1/A8

## Contexto
Criterios del documento base: control del dato, portabilidad, capacidad de automatización y encaje fiscal local. Un solo lenguaje (TypeScript) en web, API y worker reduce fricción para un equipo pequeño asistido por IA y permite compartir contratos tipados.

## Decisión

| Capa | Tecnología | Por qué |
|---|---|---|
| Monorepo | pnpm workspaces + Turborepo | Un repo, builds incrementales, contratos compartidos |
| Frontend | Next.js (App Router) + TypeScript + Tailwind CSS | SSR/SPA híbrido, auth, accesibilidad, design system propio |
| Backend | NestJS + TypeScript | Módulos de dominio, guards/policies, validación, OpenAPI, jobs, testing |
| ORM / BD | Prisma + PostgreSQL | Migraciones tipadas; fuente única relacional y portable |
| Cache / colas | Redis + BullMQ | Trabajos reintentables, outbox → consumidores, rate limiting |
| Identidad | OIDC/OAuth2 con proveedor intercambiable | Autorización en el backend, no en el proveedor de login |
| Archivos | Almacenamiento S3-compatible (MinIO en local) | URLs firmadas; certificados, sellos, documentos |
| CI/CD | GitHub Actions + Docker | Build reproducible, checks obligatorios, despliegue automatizado |
| Observabilidad | OpenTelemetry + Sentry + logs estructurados | Trazas end-to-end con `correlation_id` |
| Pruebas | Vitest (unit) · testcontainers (integration) · Playwright (E2E) | Pruebas de negocio contra servicios reales efímeros |
| Contratos | OpenAPI generado desde NestJS + tipos compartidos en `packages/contracts` | Cliente web tipado; pruebas contractuales |

Los proveedores concretos (OIDC, pasarela, facturador, cloud) no se fijan aquí: se implementan detrás de adaptadores y se deciden por ADR propio (ver decisiones pendientes en `docs/00-plan-de-ejecucion.md`).

## Consecuencias
- Un solo lenguaje y tipado extremo a extremo; onboarding rápido de agentes IA (ecosistema muy documentado).
- Dependencia de Node/TypeScript para todo; los reportes pesados o analítica futura pueden requerir herramientas aparte.
- Revisar Next.js/NestJS mayor cada 12 meses; fijar versiones exactas en EPIC-00.
