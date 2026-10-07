# ADR-009 · Roles internos de la consola

- **Estado:** Propuesto
- **Fecha:** 2026-10-07. Pasa a Aceptado cuando Fedesoft confirme las personas por rol (RQ-FED-033) y se cierre la lista de acciones con doble control (RQ-FED-035); hasta entonces rigen estos valores como propuesta de desarrollo.
- **Decisores:** A0 con revisión de A5 (seguridad). Implementa A3.
- **Relacionadas:** ADR-005 (consola separada), ADR-008 (identidad, sesiones y roles internos sin empresa; §7 y §9).
- **Requisitos:** RA-ACC-003 (parcial: matriz aplicada en servidor), RF-IDE-005, RA-ACC-004 / RA-ACC-005 (pendientes, ver deuda).

## Contexto

`docs/01-consola-administracion.md` §2.1 define nueve roles internos y §2.2 su matriz de permisos por recurso. La semilla solo traía cuatro (`super-admin`, `operaciones`, `kam`, `auditor`) con listas de permisos escritas de forma provisional. El prototipo visual ya usa los nueve y, en modo API, decide qué módulos de la consola abre por cadenas de permiso que lee de `GET /admin/v1/auth/session`; si el API y el prototipo no coinciden exactamente, un módulo aparece o desaparece por una diferencia de texto y no por una decisión de negocio.

Las condiciones de partida están en ADR-008: los permisos son cadenas `dominio:acción` con los comodines que resuelve `grants()` (`*`, `dominio:*`, `*:acción`), ningún comodín concede un permiso sensible (`SENSITIVE_PERMISSIONS`), un rol interno solo puede asignarse fuera de una empresa (invariante en la base) y los permisos se leen de la base en cada petición.

## Opciones consideradas

1. **Ampliar los cuatro roles actuales.** Menos filas, pero mezcla áreas que la matriz separa (cartera y afiliación, formación y comunicaciones) y obliga a dar a una persona más de lo que su área necesita. Contradice el mínimo privilegio (docs/01 §1.3).
2. **Un rol por columna de la matriz, con permisos `dominio:acción` y comodines.** Una persona puede tener varios roles (docs/01 §2.1) y recibe la unión. Es lo que el servidor ya sabe evaluar. **Elegida.**
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
| `super-admin` | `*`, `role:assign` |
| `operaciones` | `organization:*`, `affiliation:*`, `certificate:read`, `billing:read`, `training:read`, `community:read`, `content:read`, `directory:read`, `directory:verify`, `interaction:read`, `analytics:read`, `audit:read` |
| `cartera` | `billing:read`, `billing:reconcile`, `billing:export`, `organization:read`, `affiliation:read`, `certificate:read`, `content:read`, `analytics:read`, `audit:read` |
| `formacion` | `training:*`, `community:*`, `organization:read`, `content:read`, `analytics:read`, `audit:read` |
| `comunicaciones` | `content:*`, `directory:*`, `organization:read`, `certificate:read`, `training:read`, `community:read`, `community:update`, `vertical:read`, `analytics:read`, `audit:read` |
| `relacionamiento` | `opportunity:*`, `vertical:*`, `organization:read`, `content:read`, `interaction:read`, `analytics:read`, `audit:read` |
| `kam` | `organization:read`, `affiliation:read`, `billing:read`, `certificate:read`, `training:read`, `community:read`, `directory:read`, `vertical:read`, `opportunity:read`, `interaction:*`, `analytics:read`, `audit:read` |
| `direccion` | `*:read`, `analytics:export` |
| `auditor` | `*:read`, `analytics:export`, `audit:export` |

Cambios frente a la semilla anterior: `operaciones` pierde `billing:reconcile` (la conciliación es de Cartera, docs/01 §5.3) y baja de `training:*` a `training:read`; `kam` gana lectura de afiliación, cartera, certificados, formación, directorio, analítica y auditoría; `auditor` gana las dos exportaciones.

### 3. Qué alcanza cada rol en cada módulo de la consola

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
| Auditoría | E | L | L | L | L | L | L | L | E |

### 4. Usuarios: solo el Super Admin muta

Los endpoints de `/admin/v1/users` exigen `user:read` (listar y ver ficha) o, para mutar, `role:assign` (asignar o quitar rol interno), `user:block` (bloquear y desbloquear) y `session:revoke` (cierre forzado). Ninguna lista de arriba nombra esas tres cadenas; solo `*` del Super Admin cubre `user:block` y `session:revoke`, y `role:assign` es sensible, así que `super-admin` lo lleva literal. Dirección y Auditor leen usuarios por `*:read` y no pueden más (docs/01 §2.2: R en "Usuarios internos y roles"). Ningún rol nuevo recibe un permiso de `SENSITIVE_PERMISSIONS`. Las guardas de ADR-008 §9 (dos Super Admin mínimos, nadie se asigna roles a sí mismo, techo de privilegios con `canDelegate`) no cambian y se aplican igual a los roles nuevos.

### 5. Usuarios de desarrollo

La semilla crea un usuario sintético por rol (`superadmin1@`, `superadmin2@`, `operaciones@`, `cartera@`, `formacion@`, `comunicaciones@`, `relacionamiento@`, `kam@`, `direccion@`, `auditor@`, todos `@fedesoft-dev.test`) y el realm de Keycloak de desarrollo los trae con la misma contraseña de desarrollo. Los siete nuevos llevan un segundo factor TOTP preconfigurado con un secreto distinto por usuario, público y solo para desarrollo (`infra/docker/keycloak/README.md`). La semilla sigue negándose a correr con `NODE_ENV=production`.

## Qué se deja fuera, y desviaciones declaradas

**(a) Dirección y la aprobación de 2.º nivel.** La matriz da a Dirección "RS (2.º nivel)" en Solicitudes. El flujo de segundo nivel no está definido (docs/01 §10, decisión 2: la Junta decide fuera del sistema y `OPS` registra el acta), así que `direccion` queda en solo lectura. Cuando exista el flujo se añade `affiliation:approve` (o el nombre que se decida) a `direccion`.

**(b) ABAC sin aplicar.** "Solo organizaciones asignadas" del KAM (RA-ACC-004) y "propia área" en Auditoría y Resultados (docs/01 §2.2) **no se aplican en el servidor**: no existe modelo de asignación de cuentas ni de área. Hoy `kam` lee todas las empresas y los roles con `audit:read` o `analytics:read` ven el módulo completo. La restricción por `organization_id` asignada llega con el modelo de cuentas estratégicas (RF-KAM, fase 4); el ámbito por área, con el dominio de auditoría. Hasta entonces, **no se debe asignar el rol `kam` a personas reales** en un entorno con datos reales.

**(c) Doble control (✚) sin implementar.** RA-ACC-005 y RA-ACC-006 son fase 2. Hoy una acción que la matriz marca ✚ la ejecuta un solo actor con el permiso; por eso los permisos que mueven dinero o privilegios (`billing:refund`, `billing:write-off`, `billing:manual-payment`, `certificate:revoke`, `parameter:approve`, `user:impersonate`, `organization:delete`) siguen siendo sensibles: ningún rol interno los recibe, ni siquiera por comodín.

**(d) Lo que las listas no expresan frente a la matriz.** Se implementaron tal como se pidieron; estas diferencias quedan registradas para no descubrirlas en producción:

- Exportación (X) por área, importación de padrón, emisión manual de certificados de OPS (CRS ✚), "plantillas propias" de TAL, parámetros de FIN y lectura de proveedores/colas de FIN y AUD: no hay permiso concedido porque esos dominios aún no tienen endpoints. Cada historia que cree el dominio añade sus permisos al rol y a este ADR.
- Comunicaciones lee Verticales y Certificados y no Oportunidades, como dice la matriz. Por eso la llave de lectura del módulo Relacionamiento (en el API y en el prototipo) es `vertical:read`: el módulo une verticales y convocatorias, y se entra por las verticales.
- Los comodines `dominio:*` conceden también acciones futuras que la matriz no da en ese recurso: p. ej. `export` a OPS en Solicitudes y al KAM en Cuentas. Cartera no usa comodín en `billing:` (ver consecuencias).
- Dirección tiene "—" en Proveedores y en Colas/webhooks, pero `*:read` le dará lectura de cualquier permiso `provider:read` o `queue:read` que se cree.
- Facturas electrónicas se asumen bajo el prefijo `billing:`. Si el dominio fiscal adopta otro, hay que repartir su lectura (R para OPS, DIR y AUD; "—" para el KAM).

## Consecuencias

**Positivas.** El prototipo y el API coinciden por construcción y una prueba de tabla lo mantiene: cambiar una lista de permisos sin cambiar el oráculo falla el CI. Cada área recibe solo su ámbito; la conciliación deja de estar en Operaciones. Quien opera a diario no necesita el rol Super Admin (docs/01 §1.3).

**Negativas y riesgos.**

- `*:read` de Dirección y Auditor es abierto por diseño: **todo permiso de lectura que se cree en el futuro queda legible para ambos** sin tocar sus roles. Un permiso de lectura que exponga datos que Dirección no deba ver se nombra fuera de `:read` o se declara sensible.
- Cartera recibe permisos explícitos de `billing:` y no `billing:*`: así `billing:pay`, el pago del afiliado en `POST /v1/payments`, no le llega por comodín. Una prueba lo fija para todo rol interno de área. El Super Admin sí lo tiene por `*`; ahí la barrera es la separación de superficies (ADR-008 §2). Por eso cualquier endpoint de consola que mueva dinero debe usar un permiso propio y sensible.
- Las listas viven en la semilla, que no corre en producción. Hace falta un camino auditado para crear y modificar roles allá (RA-ACC-003 pide que el Super Admin los edite). Se une a la deuda de ADR-008 sobre el alta de los dos primeros Super Admin. A3 + A8, antes del piloto.
- Cambiar los permisos de un rol por la semilla surte efecto en la siguiente petición (los permisos se leen de la base), pero no cierra sesiones: un cambio en producción debe hacerse por la vía auditada que revoca las sesiones afectadas.

**Deuda asumida (con dueño y momento):**

- ABAC por cuentas asignadas y por área (b): A2 modela la asignación, A3 la aplica. Fase 4.
- Flujo de aprobación de 2.º nivel de Dirección (a): A1 define el flujo cuando Fedesoft lo decida. Fase 2.
- Doble control y reautenticación (c): A3 + A5, fase 2.
- Edición de roles por el Super Admin con motivo y auditoría: A3, junto con el doble control.
- Reducir los comodines a acciones explícitas en cada dominio cuando exista (opción 3): cada historia de dominio.
- Personas reales por rol (RQ-FED-033): Fedesoft.

**Verificado.** `apps/api/test/roles-internos.test.ts`: oráculo de módulos por rol contra los roles sembrados, nombres y claves exactas, permisos sensibles, quién muta usuarios, vista de sesión de consola con el nombre del rol, e idempotencia de la semilla.
