# Portal Único del Afiliado — Fedesoft

Plataforma que unifica en un solo lugar todo lo que un afiliado de Fedesoft hace con la federación: perfil y afiliación, estado de cuenta y pago con factura electrónica DIAN, certificado y sello, formación (TrainingLAB / TIC Talks), comunidades, directorio e insights, verticales sectoriales, proyectos Cenisoft y cuenta estratégica (KAM).

**Estado:** Fase 0 · Fundación **en curso**. El repositorio contiene el contexto rector y la primera capa de plataforma: monorepo, modelo de datos con sus invariantes, API con autorización por defecto y CI.

| Para… | Leer |
|---|---|
| Entender el proyecto y sus reglas (humanos e IA) | [`CLAUDE.md`](CLAUDE.md) |
| Saber qué se construye, cómo, cuándo y con qué agentes | [`docs/00-plan-de-ejecucion.md`](docs/00-plan-de-ejecucion.md) |
| Catálogo de requerimientos y lo que Fedesoft debe entregar | [`docs/02-catalogo-de-requerimientos.md`](docs/02-catalogo-de-requerimientos.md) |
| Operabilidad del super usuario (consola, parametrización, analítica) | [`docs/01-consola-administracion.md`](docs/01-consola-administracion.md) |
| Navegación, pantallas y recorridos del portal | [`docs/03-arquitectura-de-informacion.md`](docs/03-arquitectura-de-informacion.md) |
| Prompt para construir el prototipo visual | [`docs/04-prompt-prototipo-visual.md`](docs/04-prompt-prototipo-visual.md) |
| Arquitectura funcional (9 módulos, 2 ejes, 3 capas) | [`docs/base/01-arquitectura-plataforma.md`](docs/base/01-arquitectura-plataforma.md) |
| Guía técnica de construcción (stack, dominios, seguridad, DoD) | [`docs/base/02-documento-base-desarrollo.md`](docs/base/02-documento-base-desarrollo.md) |
| Decisiones de arquitectura | [`docs/adr/`](docs/adr/) |
| Auditoría del ecosistema web actual | [`docs/audit/`](docs/audit/) |
| Identidad visual y tokens de UI | [`docs/design/identidad-visual.md`](docs/design/identidad-visual.md) |
| Qué demuestra el prototipo frente al alcance | [`docs/06-estado-vs-alcance.md`](docs/06-estado-vs-alcance.md) |

---

## Levantar el proyecto

Requisitos: Node 22 (`.nvmrc`), pnpm 10.33, Docker.

```bash
pnpm install
pnpm infra:up                      # PostgreSQL, Redis y almacenamiento S3
cp packages/db/.env.example packages/db/.env
cp apps/api/.env.example apps/api/.env
pnpm db:migrate && pnpm db:seed
pnpm --filter @fedesoft/api dev    # http://localhost:3000/docs
```

Comprobación de salud: `/health/live` y `/health/ready`.

### Entrar al portal en desarrollo

Sin proveedor de identidad montado, `IDENTITY_PROVIDER=stub` recorre el mismo flujo de OIDC sin pedir credenciales (ADR-008). La semilla deja tres accesos:

```bash
# gerente de una empresa afiliada
curl -i "http://localhost:3000/v1/auth/login?hint=camilo.restrepo@datalabsandina.co"
# líder de talento de la misma empresa
curl -i "http://localhost:3000/v1/auth/login?hint=diana.salazar@datalabsandina.co"
# perfil interno: añade &mfa=true, o el guard denegará por falta de segundo factor
curl -i "http://localhost:3000/v1/auth/login?hint=operaciones@fedesoft.test&mfa=true"
```

El `stub` **no arranca en producción ni donde haya TLS** (`SESSION_COOKIE_SECURE=true`): ahí `IDENTITY_PROVIDER` debe ser `oidc`, y exige emisor, cliente y secreto.

`GET /v1/session` devuelve el contexto de la sesión; `POST /v1/session/organization` cambia de empresa y rota el identificador. Todo verbo que muta exige la cabecera `x-csrf-token` con el valor de la cookie `fdsft_csrf`.

### La puerta de calidad

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Es lo mismo que corre el CI, con las migraciones sobre una base vacía. Nada se declara terminado sin que estos cinco pasen (`CLAUDE.md`, reglas no negociables).

### Estructura

```text
apps/api/        API NestJS · /v1 (afiliado) y /admin/v1 (consola)
  src/identity/  Identidad, sesión y autorización (ADR-008)
packages/db/     Esquema Prisma, migraciones, semilla e invariantes
packages/config/ tsconfig y ESLint compartidos
infra/docker/    Servicios locales
```

**Los secretos nunca entran al repositorio.** Cada paquete trae su `.env.example`; el `.env` real está en `.gitignore`.
