# Portal Único del Afiliado — Fedesoft

Contexto maestro para cualquier sesión (humana o IA) que trabaje en este repositorio. Leer completo antes de tocar código.
Idioma: documentación, UI y mensajes al usuario en **español**; código, identificadores, nombres de archivo de código y commits en **inglés**.

## Estado del proyecto

- **Fase actual:** 0 · Fundación **en curso** (EPIC-00 entregado). El monorepo existe: `apps/api`, `packages/db`, `packages/config`, `infra/docker` y CI.
- **Cómo levantarlo y la puerta de calidad:** `README.md`. Antes de tocar código: `pnpm install && pnpm db:migrate`.
- **Plan operativo:** `docs/00-plan-de-ejecucion.md` (qué, cómo, cuándo, agentes y modelo). Es el índice de trabajo.
- **Documentos rectores (fuente de verdad documental):**
  - `docs/base/01-arquitectura-plataforma.md` — qué debe hacer la plataforma: 2 ejes, 3 capas, 9 módulos, criterios de evaluación.
  - `docs/base/02-documento-base-desarrollo.md` — cómo se construye: stack, dominios, modelo de datos, seguridad, agentes, roadmap, DoD, harness.
  - `docs/01-consola-administracion.md` — operabilidad del super usuario y del equipo interno: roles y permisos, parametrización, CRUDs, gestiones operativas, analítica y resultados (EPIC-13/14).
  - `docs/02-catalogo-de-requerimientos.md` — catálogo trazable de requerimientos (RF/RA/RI/RD/RNF) con prioridad, fase y criterio de aceptación; su Anexo A lista lo que Fedesoft debe entregar, decidir o autorizar.
  - `docs/03-arquitectura-de-informacion.md` — mapa de navegación, inventario de pantallas por rol y recorridos críticos del portal del afiliado.
  - `docs/04-prompt-prototipo-visual.md` — prompt autocontenido para construir el prototipo visual navegable (sin backend) destinado a la presentación ejecutiva.
  - `docs/06-estado-vs-alcance.md` — qué demuestra hoy el prototipo frente a los nueve módulos exigidos, y la ruta en tres etapas para cerrar la brecha.
  - `docs/adr/ADR-006-fundacion-monorepo-y-datos.md` — qué se construyó en EPIC-00 y por qué las invariantes viven en la base de datos.
  - `docs/adr/ADR-007-recorrido-critico-pago-factura-certificado.md` — el recorrido pago → factura → certificado, sus controles y el orden en que se aplican.
  - `docs/adr/ADR-008-identidad-sesion-y-autorizacion.md` — de dónde sale la identidad, dónde vive la sesión, cómo se deriva la autorización y cómo se revoca.
  - `docs/adr/` — decisiones de arquitectura. Toda decisión nueva que altere datos, seguridad o negocio exige un ADR antes de implementarse.
  - `docs/audit/` — auditoría del ecosistema web actual (qué reemplaza el portal y con qué convive).
  - `docs/design/identidad-visual.md` — tokens de marca y reglas de UI.
- **Decisiones pendientes** (bloquean producción, no la fundación): `docs/00-plan-de-ejecucion.md`, sección "Decisiones pendientes".

## Principios no negociables

1. **Fuente única de verdad.** `Organization`, `Contact`, `Membership` y el estado financiero viven en el núcleo. Ningún módulo duplica estas entidades ni crea su "versión" de empresa, contacto, rol o estado de pago.
2. **Autoservicio por defecto** en los módulos 1–6; **alto contacto con contexto** en los módulos 7–9.
3. **Propiedad y portabilidad del dato.** Exportable; proveedores externos siempre detrás de adaptadores.
4. **Segmentación desde el acceso.** La experiencia depende del rol del contacto y del segmento de la empresa (grande vs. MIPYME) desde el login.
5. **Cumplimiento fiscal local es núcleo.** Factura electrónica DIAN (CUFE, UBL 2.1) y pasarela de pago colombiana.
6. **Flujos transaccionales idempotentes, auditables y recuperables** ante fallos.

## Arquitectura y stack (ver ADR-001 y ADR-002)

- Monolito modular con límites de dominio estrictos y eventos internos (patrón outbox). Sin microservicios al inicio.
- `apps/web` (portal del afiliado) y `apps/admin` (consola interna, ADR-005) en Next.js + TypeScript + Tailwind · `apps/api` NestJS + TypeScript (endpoints `/v1` y `/admin/v1`) · `apps/worker` BullMQ.
- Reglas de negocio configurables viven en el dominio Config (parámetros con alcance, vigencia y versión), nunca como constantes en código. La analítica es un esquema `analytics` derivado y de solo lectura.
- PostgreSQL (Prisma) como fuente única · Redis · almacenamiento S3-compatible · identidad OIDC intercambiable.
- REST versionada + OpenAPI. `organization_id` es frontera de seguridad. Autorización **siempre en servidor** (RBAC + ABAC).
- Observabilidad: OpenTelemetry + Sentry; `correlation_id` de extremo a extremo (web → API → jobs).

## Reglas no negociables

- No inventar esquemas paralelos para Organization/Contact/Membership.
- No confiar en autorización de frontend; denegar por defecto en cada endpoint y acción.
- No guardar secretos en el repositorio ni en logs.
- No procesar webhooks sin verificación criptográfica de firma, protección de replay e idempotencia.
- No marcar pagos ni facturas como exitosos por respuesta del navegador; solo confirmación server-to-server.
- No hacer migraciones destructivas sin plan expand/contract; migraciones forward-only.
- No integrar un proveedor (Wompi, ePayco, Siigo, Alegra…) directamente en el dominio; solo en adaptadores de infraestructura.
- No aceptar una historia sin pruebas proporcionales al riesgo.
- No declarar "terminado" si lint, typecheck, test, build y migraciones no se ejecutaron en un entorno limpio.
- No tocar módulos fuera del alcance de la tarea "para arreglar rápido": crear una tarea para el agente dueño del dominio.
- No exponer un endpoint sin `@RequirePermission`, `@RequireSession` o `@Public`: el guard global deniega, y quitarlo no es una opción.
- No entregar al navegador un token autocontenido con permisos: la sesión es opaca, vive en la base y se revoca (ADR-008).
- No debilitar una invariante de la base de datos para que pase una prueba. Si estorba, discutir la regla en un ADR.
- No cambiar la respuesta del webhook de pagos para que distinga motivos de fallo: sería un oráculo para el atacante. El detalle va al log y a la auditoría.
- No leer el `organization_id` del cuerpo de una petición: sale de la sesión. Del cuerpo salen los identificadores de objetos, y siempre se verifica que pertenezcan a la empresa en sesión.

## Protocolo por tarea (resumen del harness, sección 18 del documento base)

1. Leer el requerimiento y listar supuestos. Si falta una decisión que altera datos, seguridad o negocio: detenerse y señalarla.
2. Identificar dominios y archivos afectados; no tocar áreas no relacionadas.
3. Definir criterios de aceptación verificables **antes** de escribir código.
4. A1/A2 revisan arquitectura y datos; A5 revisa amenazas si hay auth, PII, pagos, archivos o roles.
5. Implementar el cambio mínimo completo, incluyendo estados de error, carga y vacío.
6. Crear/actualizar pruebas unit, integration y E2E según riesgo.
7. Ejecutar lint, typecheck, test, build y migraciones en entorno limpio.
8. A7 valida criterios y regresión; A5 valida controles. Ambos pueden marcar **BLOCKED**.
9. A8 verifica despliegue, telemetría y rollback si el cambio es operativo.
10. Entregar resumen: qué cambió, archivos, migraciones, pruebas, riesgos, deuda técnica y siguiente paso.

## Agentes (`.claude/agents/`)

A0 (orquestador / tech lead) es la sesión principal. Subagentes especializados:
`a1-arquitectura-dominio`, `a2-datos-migraciones`, `a3-backend-api`, `a4-frontend-ux`, `a5-seguridad`,
`a6-integraciones-fiscal-pagos`, `a7-qa-pruebas`, `a8-devops-observabilidad`, `a9-documentacion-release`.
Cuándo invocar cada uno, en qué orden y con qué modelo: `docs/00-plan-de-ejecucion.md`, sección "Con qué agentes".

## Dominio único (regla de Cenisoft, 22 sep 2026)

**Todos los proyectos de Fedesoft y Cenisoft viven bajo un solo dominio. No se mezclan dominios ni se dispersan en subdominios de proveedores.**

- Cada despliegue (portal, consola, prototipos, demos) se sirve desde un subdominio del dominio institucional único, nunca desde `*.vercel.app`, `*.netlify.app` ni dominios de terceros salvo de forma temporal y marcada como tal.
- Un despliegue en la URL por defecto del proveedor es provisional: se le asigna el subdominio definitivo antes de compartirlo fuera del equipo.
- Nada se publica bajo el alcance o la cuenta de otro proyecto ajeno a Fedesoft/Cenisoft.
- El dominio definitivo y el responsable del DNS son la decisión pendiente `RQ-FED-009` (`docs/02-catalogo-de-requerimientos.md`, Anexo A).

## Dónde vive cada cosa

| Capa | Ruta | Nota |
|---|---|---|
| API | `apps/api` | NestJS. `/v1` afiliado, `/admin/v1` consola. Guard global de denegar por defecto |
| Identidad y sesión | `apps/api/src/identity` | Puerto `IdentityProviderPort`; el proveedor se elige en una línea de `identity.module.ts`. Sesión opaca en PostgreSQL, permisos derivados en cada petición (ADR-008) |
| Pagos y facturación | `apps/api/src/billing` | Puertos en `ports/`, proveedores solo en `adapters/`. El proveedor se elige en una línea de `billing.module.ts` |
| Outbox | `apps/api/src/outbox` | Escritura transaccional y despachador con reintentos. En producción va a `apps/worker` |
| Datos | `packages/db` | Esquema Prisma, migraciones forward-only, semilla sintética, pruebas de integridad |
| Config compartida | `packages/config` | `tsconfig.base.json` y ESLint base |
| Infraestructura local | `infra/docker` | PostgreSQL, Redis, almacenamiento S3 |
| Prototipo visual | `cenisoft-repo/fedesoft` | Repositorio aparte: otra pieza, otro ciclo de vida |

Las reglas de negocio configurables son filas de `Parameter`/`ParameterVersion`, nunca constantes. La regla de "al día" ya existe ahí como `afiliacion.dias_gracia` marcada provisional.

## Convenciones

- Monorepo con pnpm workspaces + Turborepo. Estructura objetivo: sección 9 de `docs/base/02-documento-base-desarrollo.md` (desviación documentada en ADR-006: las migraciones viven en `packages/db/prisma`).
- Commits: Conventional Commits en inglés (`feat(billing): …`, `fix(identity): …`, `docs: …`, `chore(ci): …`).
- Ramas: `feat/EPIC-xx-descripcion-corta`; integración a `main` solo por PR con checks verdes.
- Datos de prueba sintéticos; nunca copias crudas de producción en entornos no productivos.
- UI: tokens de marca de `docs/design/identidad-visual.md`; accesibilidad WCAG 2.1 AA; mobile-first.

## Disciplina de contexto (tokens)

- Empezar por este archivo y `docs/00-plan-de-ejecucion.md`; abrir `docs/base/*` solo por la sección necesaria.
- Delegar exploración amplia a subagentes y traer conclusiones, no volcados de archivos.
- No re-derivar decisiones ya registradas en ADR; enlazarlas.
