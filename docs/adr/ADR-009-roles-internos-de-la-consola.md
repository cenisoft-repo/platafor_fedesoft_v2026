# ADR-009 · Roles internos de la consola

- **Estado:** Propuesto
- **Fecha:** 2026-10-07. Pasa a Aceptado cuando Fedesoft confirme las personas por rol (RQ-FED-033) y se cierre la lista de acciones con doble control (RQ-FED-035); hasta entonces rigen estos valores como propuesta de desarrollo.
- **Decisores:** A0 con revisión de A5 (seguridad). Implementa A3. Las decisiones 3, 5 y 6 recogen los hallazgos de A5 sobre la primera versión.
- **Relacionadas:** ADR-005 (consola separada), ADR-008 (identidad, sesiones y roles internos sin empresa; §7 y §9).
- **Requisitos:** RA-ACC-003 (parcial: matriz aplicada en servidor), RF-IDE-005, RA-ACC-004 / RA-ACC-005 (pendientes, ver deuda).

## Contexto

`docs/01-consola-administracion.md` §2.1 define nueve roles internos y §2.2 su matriz de permisos por recurso. La semilla solo traía cuatro (`super-admin`, `operaciones`, `kam`, `auditor`) con listas de permisos escritas de forma provisional. El prototipo visual ya usa los nueve y, en modo API, decide qué módulos de la consola abre por cadenas de permiso que lee de `GET /admin/v1/auth/session`; si el API y el prototipo no coinciden exactamente, un módulo aparece o desaparece por una diferencia de texto y no por una decisión de negocio.

Las condiciones de partida están en ADR-008: los permisos son cadenas `dominio:acción` con los comodines que resuelve `grants()` (`*`, `dominio:*`, `*:acción`), ningún comodín concede un permiso sensible (`SENSITIVE_PERMISSIONS`), un rol interno solo puede asignarse fuera de una empresa (invariante en la base) y los permisos se leen de la base en cada petición.

## Opciones consideradas

1. **Ampliar los cuatro roles actuales.** Menos filas, pero mezcla áreas que la matriz separa (cartera y afiliación, formación y comunicaciones) y obliga a dar a una persona más de lo que su área necesita. Contradice el mínimo privilegio (docs/01 §1.3).
2. **Un rol por columna de la matriz, con permisos `dominio:acción`.** Una persona puede tener varios roles (docs/01 §2.1) y recibe la unión. Es lo que el servidor ya sabe evaluar. **Elegida**, con la regla de comodines de la decisión 3.
3. **Un permiso por celda de la matriz** (`dominio.recurso.acción`, con C/R/U/S/X/P por separado). Es el destino de docs/01 §2.2, pero hoy casi todos los dominios no tienen endpoints y fijar cientos de cadenas sin consumidor es inventar nombres que luego habría que migrar. Se afina dominio por dominio, cuando exista su historia.

## Decisión

### 1. Nueve roles, con estas claves y nombres

Las claves son contrato con el prototipo y con la base (`roles.key`, único, máx. 60); no se renombran sin migrar ambos lados.

| Clave | Nombre | Código en docs/01 |
|---|---|---|
| `super-admin` | Super Admin Fedesoft | SA |
| `operaciones` | Operaciones · Afiliación | OPS |
| `cartera` | Cartera · Financiera | FIN |
| `formacion` | Formación y comunidades | TAL |
| `comunicaciones` | Comunicaciones · Contenido | COM |
| `relacionamiento` | Relacionamiento · Verticales | REL |
| `kam` | Gestor de cuenta | KAM |
| `direccion` | Dirección | DIR |
| `auditor` | Auditor | AUD |

Los roles de empresa (`gerente`, `talento`, `contacto`) no cambian.

### 2. Permisos por rol

| Clave | Permisos |
|---|---|
| `super-admin` | `*`, `role:assign`, `session:inspect`, `user:read-affiliates` |
| `operaciones` | `organization:*`, `affiliation:read`, `affiliation:create`, `affiliation:update`, `affiliation:change-status`, `certificate:read`, `billing:read`, `training:read`, `community:read`, `content:read`, `directory:read`, `directory:verify`, `interaction:read`, `analytics:read` |
| `cartera` | `billing:read`, `billing:reconcile`, `billing:export`, `organization:read`, `affiliation:read`, `certificate:read`, `content:read`, `analytics:read` |
| `formacion` | `training:*`, `community:*`, `organization:read`, `content:read`, `analytics:read` |
| `comunicaciones` | `content:read`, `content:create`, `content:update`, `content:change-status`, `directory:read`, `directory:create`, `directory:update`, `directory:change-status`, `organization:read`, `certificate:read`, `training:read`, `community:read`, `community:update`, `vertical:read`, `analytics:read` |
| `relacionamiento` | `opportunity:*`, `vertical:*`, `organization:read`, `content:read`, `interaction:read`, `analytics:read` |
| `kam` | `organization:read`, `affiliation:read`, `billing:read`, `certificate:read`, `training:read`, `community:read`, `directory:read`, `vertical:read`, `opportunity:read`, `interaction:read`, `interaction:create`, `interaction:update`, `analytics:read` |
| `direccion` | `*:read`, `analytics:export` |
| `auditor` | `*:read`, `analytics:export`, `audit:export`, `session:inspect`, `user:read-affiliates` |

Cambios frente a la semilla anterior de cuatro roles:

- `operaciones` (antes «Operaciones Fedesoft»): pierde `billing:reconcile`, porque la conciliación es de Cartera (docs/01 §5.3), y baja de `training:*` a `training:read`; `affiliation:*` pasa a cuatro acciones explícitas; gana lectura de certificados, comunidades, contenidos, directorio, interacciones y analítica, y `directory:verify`. Conserva `organization:*` y `billing:read`.
- `kam`: `interaction:*` pasa a leer, crear y editar; gana lectura de afiliación, cartera, certificados, formación, comunidades, directorio, verticales y analítica. Conserva `organization:read` y `opportunity:read`.
- `auditor`: gana `analytics:export`, `audit:export` y los dos permisos literales de la decisión 5.
- `super-admin`: gana esos mismos dos permisos literales.
- `cartera`, `formacion`, `comunicaciones`, `relacionamiento` y `direccion` son nuevos.

### 3. Cómo se componen las listas

- **Comodín de dominio solo con CRUSX completo.** En un rol interno, `dominio:*` se concede únicamente si la matriz de docs/01 §2.2 da crear, ver, editar, cambiar estado y exportar sobre ese recurso: hoy Operaciones en `organization`, Formación en `training` y `community`, y Relacionamiento en `opportunity` y `vertical`. Donde falta una letra se listan las acciones, con estos nombres: C `create`, R `read`, U `update`, S `change-status`, X `export`. Así una acción futura (`export`, `approve`, `publish`…) nunca llega a un rol por arrastre. Es el caso de Operaciones en Solicitudes (CRUS), Comunicaciones en Contenido y Directorio (CRUS) y el KAM en Cuentas (CRU).
- **`*:read` solo para lectura global.** Lo llevan Dirección y Auditor, y nadie más.
- **Permisos sensibles, literales y a quien se indica.** Ningún comodín los concede, ni siquiera `*`. Los únicos que se otorgan son `role:assign`, `session:inspect` y `user:read-affiliates` (decisión 5), al Super Admin y, los dos últimos, también al Auditor. `affiliation:approve` está declarado sensible desde ya y no lo lleva nadie.
- **`audit:read` solo para Super Admin, Dirección y Auditor.** La matriz da «propia área» a los demás roles, pero el servidor no filtra por área (b): dárselo hoy sería abrir el registro completo. Vuelve a las áreas y al KAM cuando exista el filtro.

### 4. Qué alcanza cada rol en cada módulo de la consola

Cada módulo se abre con un permiso de lectura y se modifica con uno de escritura. El par es el contrato con el prototipo y lo fija la prueba `apps/api/test/roles-internos.test.ts` con un oráculo escrito a mano, no calculado desde las listas.

| Módulo | Lectura | Escritura |
|---|---|---|
| Afiliados | `organization:read` | `organization:update` |
| Solicitudes | `affiliation:read` | `affiliation:update` |
| Cartera | `billing:read` | `billing:reconcile` |
| Formación | `training:read` | `training:update` |
| Contenidos | `content:read` | `content:update` |
| Relacionamiento | `vertical:read` | `opportunity:update` |
| Cuentas | `interaction:read` | `interaction:create` |
| Resultados | `analytics:read` | `analytics:export` |
| Usuarios | `user:read` | `role:assign` |
| Auditoría | `audit:read` | `audit:export` |

L = lectura, E = lectura y escritura, `-` = sin acceso.

| Módulo | SA | OPS | FIN | TAL | COM | REL | KAM | DIR | AUD |
|---|---|---|---|---|---|---|---|---|---|
| Afiliados | E | E | L | L | L | L | L | L | L |
| Solicitudes | E | E | L | - | - | - | L | L | L |
| Cartera | E | L | E | - | - | - | L | L | L |
| Formación | E | L | - | E | L | - | L | L | L |
| Contenidos | E | L | L | L | E | L | - | L | L |
| Relacionamiento | E | - | - | - | L | E | L | L | L |
| Cuentas | E | L | - | - | - | L | E | L | L |
| Resultados | E | L | L | L | L | L | L | E | E |
| Usuarios | E | - | - | - | - | - | - | L | L |
| Auditoría | E | - | - | - | - | - | - | L | E |

### 5. Usuarios: quién muta y quién ve qué

**Quién muta.** Los endpoints de `/admin/v1/users` exigen `user:read` (buscar, ver ficha y listar roles) o, para mutar, `role:assign` (asignar o quitar rol interno), `user:block` (bloquear y desbloquear) y `session:revoke` (cierre forzado). Ninguna lista de arriba nombra esas tres cadenas; solo `*` del Super Admin cubre `user:block` y `session:revoke`, y `role:assign` es sensible, así que `super-admin` lo lleva literal. Las guardas de ADR-008 §9 (dos Super Admin mínimos, nadie se asigna roles a sí mismo, techo de privilegios con `canDelegate`) no cambian y se aplican igual a los roles nuevos. Para que el Super Admin pueda otorgar el rol Auditor, el techo exige que lleve literales los permisos sensibles de ese rol: por eso los tiene.

**Quién ve qué.** `user:read` llega a Dirección y Auditor por `*:read`, y por sí solo habría dado la ficha de todas las personas del sistema, afiliadas incluidas, con las sesiones activas y su IP y agente de usuario. La matriz da R solo sobre «Usuarios internos y roles». Dos permisos literales y sensibles acotan la lectura:

| Permiso | Qué abre | Quién lo tiene |
|---|---|---|
| `user:read` | Buscar y ver fichas de **personas con rol interno**, sus roles y sus sesiones sin IP ni agente | SA, DIR, AUD |
| `user:read-affiliates` | Buscar y ver fichas de personas afiliadas, con sus empresas | SA, AUD |
| `session:inspect` | IP y agente de usuario de las sesiones activas | SA, AUD |

Sin `user:read-affiliates`, la búsqueda ni lista ni cuenta a las personas sin rol interno, y su ficha responde el mismo 404 que un identificador inexistente, para no confirmar que existe. Las respuestas traen `visibility` para que la pantalla explique qué se le ocultó; decidirlo sigue siendo del servidor, y lo oculto va como `null`, nunca como vacío.

Se eligió un permiso y no otra cosa por tres razones. Se evalúa con `grants()` como todo lo demás, queda en la lista del rol (visible, editable por el Super Admin, auditable) y no ata la regla al nombre de un rol en el código. Se descartaron filtrar por la clave del rol («si es `direccion`, solo internos»), porque un rol nuevo la saltaría y RA-ACC-003 pide permisos editables, y abrir un endpoint aparte para afiliados, porque duplica la superficie. Ambos son sensibles porque son datos personales de terceros (Ley 1581): ni `*` ni un `user:*` futuro los reparten por arrastre; y `*:read` no los alcanza porque la acción se llama `read-affiliates`.

### 6. Usuarios de desarrollo y guarda de la semilla

La semilla crea un usuario sintético por rol (`superadmin1@`, `superadmin2@`, `operaciones@`, `cartera@`, `formacion@`, `comunicaciones@`, `relacionamiento@`, `kam@`, `direccion@`, `auditor@`, todos `@fedesoft-dev.test`) y el realm de Keycloak de desarrollo los trae con la misma contraseña de desarrollo. Los siete nuevos llevan un segundo factor TOTP preconfigurado con un secreto distinto por usuario, público y solo para desarrollo (`infra/docker/keycloak/README.md`).

**La guarda es una lista permitida, no una prohibición.** Frenarla solo con `NODE_ENV=production` falla justo cuando importa: un despliegue que olvide la variable, o que la llame `staging`, la dejaría crear usuarios con contraseña pública y el rol más alto. La semilla (`packages/db/prisma/seed-guard.ts`) corre solo si se cumplen las dos condiciones:

1. `NODE_ENV` es `development`, `test` o está vacío.
2. La base es local o de CI: el host de `DATABASE_URL` es `localhost`, `127.0.0.1`, `::1` o `postgres` (el servicio de `infra/docker/compose.yml`), o la conexión es por socket local.

Lo demás se niega con un mensaje que dice por qué y nunca incluye la URL, que lleva credenciales. `ALLOW_SYNTHETIC_SEED=1` (exactamente `1`) autoriza de forma explícita un entorno remoto que no es producción, por ejemplo una demo con datos ficticios. **`NODE_ENV=production` se niega siempre, también con ese permiso**: producción no tiene excepción. El CI usa `localhost` y sigue pasando.

## Qué se deja fuera, y desviaciones declaradas

**(a) Dirección y la aprobación de 2.º nivel.** La matriz da a Dirección «RS (2.º nivel)» en Solicitudes. El flujo de segundo nivel no está definido (docs/01 §10, decisión 2: la Junta decide fuera del sistema y `OPS` registra el acta), así que `direccion` queda en solo lectura y Operaciones cambia estados con `affiliation:change-status`, sin aprobar. `affiliation:approve` será el permiso de la aprobación de 2.º nivel y **es sensible**: ya está en `SENSITIVE_PERMISSIONS`, ningún comodín lo reparte y se otorgará literal a quien el flujo decida. Cómo se registra la aprobación de la Junta con su acta queda para ese flujo.

**(b) ABAC sin aplicar.** «Solo organizaciones asignadas» del KAM (RA-ACC-004) y «propia área» en Auditoría y Resultados (docs/01 §2.2) **no se aplican en el servidor**: no existe modelo de asignación de cuentas ni de área. Consecuencias ya tomadas:

- El rol `kam` **no se puede asignar por `/admin/v1`**: asignarlo o dar de alta a alguien con él responde 422 con el motivo, y la alta no deja el usuario a medias. Quitarlo sí se permite. La semilla de desarrollo sigue creando `kam@fedesoft-dev.test` (directo en la base). El bloqueo se levanta cuando exista el modelo de cuentas asignadas (RF-KAM, fase 4).
- `audit:read` se quitó de las áreas y del KAM (decisión 3). Los módulos de Auditoría de esos roles quedan sin acceso hasta que el dominio de auditoría filtre por área.
- Los roles con `analytics:read` verán el módulo de Resultados completo. Aún no hay endpoints; cuando existan, el filtro por área («propios») se aplica con el modelo de áreas.

**(c) Doble control (✚) sin implementar.** RA-ACC-005 y RA-ACC-006 son fase 2. Hoy una acción que la matriz marca ✚ la ejecuta un solo actor con el permiso. Por eso los permisos que mueven dinero o retractan documentos (`billing:refund`, `billing:write-off`, `billing:manual-payment`, `certificate:revoke`, `parameter:approve`, `user:impersonate`, `organization:delete`) siguen sensibles y **no los lleva ningún rol, ni siquiera el Super Admin por `*`**. Los que sí se otorgan literales son `role:assign`, `session:inspect` y `user:read-affiliates` (decisión 5), y no mueven dinero.

**(d) Lo que las listas no expresan frente a la matriz.** Se implementaron tal como se acordaron; estas diferencias quedan registradas para no descubrirlas en producción:

- Exportación (X) por área, importación de padrón, emisión manual de certificados de OPS (CRS ✚), «plantillas propias» de TAL, parámetros de FIN y lectura de proveedores y colas de FIN y AUD: no hay permiso concedido porque esos dominios aún no tienen endpoints. Cada historia que cree el dominio añade sus permisos al rol y a este ADR.
- Comunicaciones lee Verticales y Certificados y no Oportunidades, como dice la matriz. Por eso la llave de lectura del módulo Relacionamiento (en el API y en el prototipo) es `vertical:read`: el módulo une verticales y convocatorias, y se entra por las verticales.
- Dirección tiene «—» en Proveedores y en Colas/webhooks, pero `*:read` le dará lectura de cualquier permiso `provider:read` o `queue:read` que se cree.
- Facturas electrónicas se asumen bajo el prefijo `billing:`. Si el dominio fiscal adopta otro, hay que repartir su lectura (R para OPS, DIR y AUD; «—» para el KAM).

## Consecuencias

**Positivas.** El prototipo y el API coinciden por construcción y una prueba de tabla lo mantiene: cambiar una lista de permisos sin cambiar el oráculo falla el CI. Cada área recibe solo su ámbito; la conciliación deja de estar en Operaciones. Quien opera a diario no necesita el rol Super Admin (docs/01 §1.3). Ninguna función que la matriz separa se reparte por comodín. Dirección ve al equipo interno y no a los afiliados.

**Negativas y riesgos.**

- `*:read` de Dirección y Auditor es abierto por diseño: **todo permiso de lectura que se cree en el futuro queda legible para ambos** sin tocar sus roles. Un permiso de lectura que exponga datos que Dirección no deba ver se nombra fuera de `:read` (como `read-affiliates`) o se declara sensible.
- Cartera recibe permisos explícitos de `billing:` y no `billing:*`: así `billing:pay`, el pago del afiliado en `POST /v1/payments`, no le llega por comodín. Una prueba lo fija para todo rol interno de área. El Super Admin sí lo tiene por `*`; ahí la barrera es la separación de superficies (ADR-008 §2). Por eso cualquier endpoint de consola que mueva dinero debe usar un permiso propio y sensible.
- Las listas viven en la semilla, que ya no corre fuera de desarrollo o CI. **Un entorno real necesita su propio arranque del catálogo de roles, sin usuarios sintéticos**, auditado y con revocación de las sesiones afectadas cuando un rol cambie (RA-ACC-003 pide que el Super Admin los edite). Se une a la deuda de ADR-008 sobre el alta de los dos primeros Super Admin. No se construye aquí. A3 + A8, antes del piloto.
- Cambiar los permisos de un rol por la semilla surte efecto en la siguiente petición (los permisos se leen de la base), pero no cierra sesiones.
- El **realm `fedesoft` de desarrollo** tiene contraseñas y secretos TOTP públicos (README del realm). Si un despliegue real apuntara por error `OIDC_ISSUER_URL` a un Keycloak con ese realm, cualquiera entraría como los usuarios de la semilla. Corrección propuesta, no aplicada: renombrarlo a `fedesoft-dev` y que, con `NODE_ENV=production`, `env.ts` rechace un emisor con ese realm y el login rechace correos `@fedesoft-dev.test`. A5 + A8, antes de staging.

**Deuda asumida (con dueño y momento):**

- ABAC por cuentas asignadas y por área (b), que levanta el bloqueo del rol `kam` y devuelve `audit:read` a las áreas: A2 modela la asignación, A3 la aplica. Fase 4.
- Flujo de aprobación de 2.º nivel de Dirección (a): A1 define el flujo cuando Fedesoft lo decida. Fase 2.
- Doble control y reautenticación (c): A3 + A5, fase 2.
- Edición de roles por el Super Admin con motivo y auditoría, y arranque del catálogo de roles sin usuarios sintéticos para entornos reales: A3 + A8, antes del piloto.
- Realm de desarrollo con credenciales públicas: A5 + A8, antes de staging.
- Lectura de la auditoría: cuando exista su endpoint, la IP de los eventos sigue la misma regla que las sesiones (`session:inspect`). A3 con el dominio de auditoría.
- Reducir los comodines que quedan a acciones explícitas cuando el dominio lo pida (opción 3): cada historia de dominio.
- Personas reales por rol (RQ-FED-033): Fedesoft.

**Verificado.** `apps/api/test/roles-internos.test.ts`: oráculo de módulos por rol contra los roles sembrados, nombres y claves exactas, permisos sensibles literales por rol, regla de comodines, funciones separadas (`affiliation:approve`, `directory:verify`, acciones de `interaction`), `audit:read`, quién muta usuarios, qué ve cada rol en búsqueda y ficha (Dirección, Auditor y Super Admin), rechazo del rol `kam`, vista de sesión de consola con el nombre del rol, e idempotencia y guarda de la semilla de extremo a extremo. `packages/db/test/semilla-guarda.test.ts`: la guarda sin base, caso por caso.
