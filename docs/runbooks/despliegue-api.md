# Runbook · Despliegue del API

Cómo se publica `apps/api` en staging y producción. La imagen no depende del proveedor: corre igual en Render, Railway, Fly.io, AWS ECS o Kubernetes. El proveedor sigue siendo una decisión pendiente (ver al final).

## 1. Qué se despliega

Una sola imagen, `ghcr.io/cenisoft-repo/fedesoft-api`, con dos órdenes:

| Orden | Para qué | Cuándo |
|---|---|---|
| *(por defecto)* `node apps/api/dist/main.js` | Sirve el API en `:3000` | Siempre |
| `migrate` | Aplica las migraciones pendientes y termina. Lee `MIGRATION_DATABASE_URL` | Antes de mover el tráfico a una versión nueva, como trabajo aparte |

- **Construcción:** `apps/api/Dockerfile`, multi-etapa, con la base Node 22 fijada por digest. Dependabot propone las actualizaciones de la base.
- **Publicación:** el workflow `Imagen del API` construye la imagen y la prueba en cada push a una rama de trabajo. En la rama por defecto la construye una sola vez, la sube por digest y le pasa la prueba de humo. Solo si pasa le pone dos etiquetas:
  - `sha-<commit>`: inmutable, para producción;
  - `edge`: la última de la rama por defecto, para staging.
- **Acceso al registro:** GHCR es privado. La plataforma descarga la imagen con un token de solo lectura (`read:packages`) guardado en su gestor de secretos.
- **Cómo referenciarla:** en producción se despliega **por digest** (`…@sha256:…`). El digest aparece en el resumen del workflow.
- **Proceso:** corre como `node` (uid 1000), sin root. El código de la imagen es de solo lectura para el proceso.
- **Logs:** en producción, una línea JSON por evento.

## 2. Qué debe ofrecer la plataforma

- **Contenedores:** que permita correr `migrate` como **trabajo aparte, con su propio entorno**, antes de publicar. Sirve un `run-task` de ECS, un *Job* de Kubernetes o un servicio de un solo uso.
  - `migrate` se conecta directo a PostgreSQL, no por un *pooler* en modo transacción: las migraciones usan bloqueos de sesión.
  - La orden previa al despliegue de Render, Railway o Fly hereda el entorno del API, así que ahí no sirve.
  - En producción, el API se niega a arrancar si ve `MIGRATION_DATABASE_URL`.
- **Base de datos:** PostgreSQL 16 gestionado, con copias automáticas y restauración a un punto en el tiempo (RPO 1 h).
- **TLS:** terminado en el balanceador. El API recibe HTTP interno y declara los saltos de proxy en `TRUST_PROXY_HOPS`.
- **Gestor de secretos:** del proveedor o externo. Ningún secreto va en la imagen, en el repositorio ni en los logs.
- **Dominio — requisito duro (ADR-008):** el portal, la consola y el API deben ser **subdominios del mismo dominio institucional** (por ejemplo, `portal.`, `consola.` y `api.`).
  - Las cookies de sesión son `SameSite=Strict`. Si el portal vive en `*.vercel.app` y el API en otro dominio, el navegador no envía la cookie y nadie puede iniciar sesión.
  - Por eso el despliegue real depende de la decisión RQ-FED-009.

## 3. Variables de entorno

El API no arranca si falta una, y en producción además valida:

- que las URL usen https;
- que `CORS_ORIGINS` no esté vacío y solo tenga orígenes https exactos;
- que la credencial de migraciones no esté en su entorno;
- que los secretos no conserven el valor de ejemplo.

Esquema completo: `apps/api/src/config/env.ts`.

| Variable | Ejemplo (staging) | Secreto | Nota |
|---|---|---|---|
| `DATABASE_URL` | `postgresql://fedesoft_app:…@…/fedesoft?sslmode=require` | Sí | Credencial **del API**, sin DDL (§5) |
| `MIGRATION_DATABASE_URL` | `postgresql://fedesoft_owner:…@…/fedesoft?sslmode=require` | Sí | **Solo en el trabajo `migrate`.** Nunca en el entorno del API |
| `PAYMENT_WEBHOOK_SECRET` | — | Sí | ≥ 32 caracteres; lo entrega la pasarela |
| `OIDC_CLIENT_SECRET` | — | Sí | ≥ 16 caracteres; lo emite el proveedor de identidad |
| `API_PUBLIC_URL` | `https://api.<dominio>` | No | De aquí salen las `redirect_uri` |
| `PORTAL_URL` | `https://portal.<dominio>` | No | |
| `CONSOLE_URL` | `https://consola.<dominio>` | No | |
| `CORS_ORIGINS` | `https://portal.<dominio>,https://consola.<dominio>` | No | Orígenes https exactos: sin comodín, sin ruta ni barra final |
| `OIDC_ISSUER_URL` | `https://<idp>/realms/fedesoft` | No | |
| `OIDC_CLIENT_ID` | `portal-api` | No | |
| `OIDC_MFA_VALUES` | `otp,mfa` | No | Valores de `amr`/`acr` que cuentan como segundo factor |
| `OIDC_CONSOLE_MAX_AGE_SEC` | `900` | No | |
| `TRUST_PROXY_HOPS` | `1` | No | **Exacto.** Si es mayor de lo real, cualquiera falsifica su IP y elude el límite de peticiones |
| `PORT` | `3000` | No | Ya viene en la imagen |

**Cliente OIDC.** Es confidencial y se registra en el proveedor con:

- **Redirect URIs:** `https://api.<dominio>/v1/auth/callback` y `https://api.<dominio>/admin/v1/auth/callback`.
- **Post-logout redirect URIs:** exactamente `PORTAL_URL` y `CONSOLE_URL`, sin comodines. Un comodín convierte el cierre de sesión en una redirección abierta.
- **Flujo:** Authorization Code con PKCE S256.
- **Segundo factor:** para la consola, el proveedor debe informar el segundo factor en `amr` o `acr`. `infra/docker/keycloak/fedesoft-realm.json` sirve de referencia.

## 4. Sondas

| Sonda | Ruta | Respuesta | Úsala para |
|---|---|---|---|
| Vida (*liveness*) | `GET /health/live` | 200 mientras el proceso responde | **Reiniciar** el contenedor |
| Disponibilidad (*readiness*) | `GET /health/ready` | 200 con base; **503** sin base | **Enrutar** tráfico: la réplica sale del balanceador y vuelve sola cuando la base vuelve |

- **No se usa `ready` para reiniciar.** Si la plataforma solo admite una sonda (Render, Railway), se configura `live`. Con `ready`, una caída de la base reiniciaría todas las réplicas a la vez y no arreglaría nada.
- **Límite de peticiones:** las sondas no cuentan para él.
- **Cierre:** con `SIGTERM` el API cierra de forma ordenada. Se configura un periodo de gracia de 20 s. En Fly, `kill_timeout = 20`, porque por defecto son 5 s.

## 5. Secuencia de una publicación

Hoy existe el paso 1, la publicación de la imagen. Los pasos 2 a 4 son el flujo objetivo: se conectan cuando haya proveedor (§8).

1. Se integra un PR en la rama principal y el workflow publica `sha-<commit>` y `edge`.
2. **Staging (automático):** se ejecuta el trabajo `migrate` contra la base de staging. Si termina bien, se despliega la imagen nueva. Si `migrate` falla, el despliegue se detiene y la versión anterior sigue sirviendo.
3. **Verificación en staging:**
   - `/health/ready` responde 200;
   - el login del portal y el de la consola funcionan;
   - el recorrido de pago de prueba completa.
4. **Producción (manual, con checks verdes):** se repite el paso 2 con el **mismo digest** probado en staging.

**Mínimo privilegio en la base.** Se usan dos credenciales:

- **`fedesoft_owner`** (dueña del esquema): solo la usa el trabajo `migrate`, a través de `MIGRATION_DATABASE_URL`.
- **`fedesoft_app`** (el API): no es dueña de nada y no tiene DDL, `TRUNCATE`, `TRIGGER` ni `REFERENCES`. Sobre la auditoría solo puede leer y añadir.
  - Los disparadores de `audit_events` bloquean `UPDATE` y `DELETE` fila por fila, pero no `TRUNCATE` ni la desactivación de los propios disparadores. Esas dos puertas las cierra este permiso.

Se aplica una vez por entorno, como `fedesoft_owner`:

```sql
GRANT USAGE ON SCHEMA public TO fedesoft_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO fedesoft_app;
REVOKE UPDATE, DELETE ON audit_events FROM fedesoft_app;
REVOKE ALL ON _prisma_migrations FROM fedesoft_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO fedesoft_app;
-- Lo que creen las migraciones futuras nace con los mismos permisos.
ALTER DEFAULT PRIVILEGES FOR ROLE fedesoft_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO fedesoft_app;
ALTER DEFAULT PRIVILEGES FOR ROLE fedesoft_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO fedesoft_app;
```

Una migración que cree una tabla de solo-añadir (como la auditoría) debe incluir su propio `REVOKE UPDATE, DELETE`: los privilegios por defecto no lo saben.

## 6. Rollback

- **Aplicación:** se vuelve a desplegar el digest anterior. No hay que tocar la base.
- **Datos:** las migraciones son forward-only y se escriben en expand/contract (ADR-006). Toda migración publicada debe ser compatible con la versión anterior del API: primero se añade, después se migra el código, y al final se retira lo viejo en otra publicación. Por eso el rollback de la aplicación nunca exige uno de la base.
- **Desastre:** restauración a un punto en el tiempo desde las copias del proveedor. Antes de producción se ensaya en staging (Fase 5, EPIC-12).

## 7. Probar la imagen en local

```bash
docker build -f apps/api/Dockerfile -t fedesoft-api:local .
bash apps/api/docker/smoke.sh fedesoft-api:local
```

`smoke.sh` comprueba:

- que `migrate` aplica las migraciones y que una segunda pasada no hace nada;
- que producción rechaza secretos de ejemplo y la credencial de migraciones;
- que `live` y `ready` responden 200;
- que sin sesión se recibe 401;
- que `/docs` no está expuesto;
- que los logs son JSON;
- que el proceso no corre como root, el código es de solo lectura y no quedan gestores de paquetes;
- que `ready` responde 503 sin base y se recupera solo;
- que el cierre con `SIGTERM` es ordenado.

Es lo mismo que ejecuta el CI.

## 8. Lo que falta decidir

| Decisión | Qué desbloquea | Dueño |
|---|---|---|
| Dominio institucional y responsable del DNS (RQ-FED-009) | Las URL del §3 y que la sesión funcione entre portal y API | Fedesoft |
| Proveedor de identidad para staging y producción (Keycloak propio o SaaS) | `OIDC_*` y el registro del cliente | Fedesoft + Cenisoft |
| Proveedor de contenedores y PostgreSQL gestionado (TCO a 12 meses) | Dónde corren la imagen y la base | Cenisoft + Fedesoft |

Con esas tres decisiones, publicar staging es configurar el servicio:

- imagen `edge`;
- orden previa `migrate`;
- sondas del §4;
- variables del §3.

## 9. Deuda conocida

- **Acciones de GitHub fijadas por etiqueta, no por SHA de commit:** igual que el CI actual. Se fijarán por SHA en todo el repositorio de una vez; Dependabot ya está configurado para mantenerlas.
- **CLI de Prisma dentro de la imagen del API:** se aceptó para tener una sola imagen.
  - No da más poder del que ya tiene el proceso: con la credencial del API, sin DDL, `node` puede ejecutar el mismo SQL.
  - Si se quiere separar, una etapa `migrate` del Dockerfile produce la segunda imagen.
- **Escaneo de vulnerabilidades de la imagen:** pendiente.
  - Se añadirá con una acción fijada por SHA de commit, no por etiqueta, tras elegir la herramienta.
  - Mientras tanto: `pnpm audit` cubre las dependencias de Node, y Dependabot mantiene al día la base.
- **Despachador del outbox:** sigue dentro del API y no corre solo. En producción vive en `apps/worker` (ADR-001).
- **Firma de la imagen (cosign o *attestations*):** pendiente. La imagen ya publica procedencia y SBOM.
