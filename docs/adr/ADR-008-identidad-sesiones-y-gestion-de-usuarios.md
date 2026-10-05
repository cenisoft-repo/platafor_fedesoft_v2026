# ADR-008 · Identidad, sesiones y gestión de usuarios

- **Estado:** Propuesto · 5 de octubre de 2026. Pasa a Aceptado cuando Fedesoft cierre la decisión pendiente de proveedor de identidad y MFA (`docs/00-plan-de-ejecucion.md`, sección 6); hasta entonces rige la propuesta por defecto.
- **Decisores:** A0 con revisión de A5 (seguridad) y A2 (datos).
- **Relacionadas:** ADR-002 (identidad intercambiable), ADR-005 (consola separada), ADR-006 (invariantes en la base), ADR-007 (puertos y adaptadores).
- **Requisitos:** RF-IDE-001 a 008, RF-AFI-005 (parcial), RA-ACC-002, RA-ACC-003 (parcial), RA-ACC-007, RA-ACC-008, RNF-SEG-001.

## Contexto

El guard global ya negaba todo endpoint sin permiso declarado, pero nada creaba el actor: no había login, sesiones ni forma de administrar usuarios. Es el paso que el plan llama EPIC-01b + EPIC-02a y lo que bloquea que "un gerente inicie sesión y vea solo su empresa".

Dos condiciones de partida: la decisión de proveedor de identidad sigue pendiente (propuesta por defecto: Keycloak en desarrollo y staging), y el modelo de datos ya decía que en nuestra base **no vive ninguna contraseña**.

## Decisiones

### 1. OIDC detrás de un puerto; ninguna credencial en nuestra base

`IdentityProviderPort` es todo lo que el dominio conoce del proveedor. El adaptador `OidcIdentityProvider` implementa Authorization Code + PKCE S256 con cliente confidencial (`client_secret_basic`) sobre `fetch` y `jose`, para que cada verificación sea visible y esté probada: emisor publicado idéntico al configurado, firma asimétrica (sin `none` ni HS\*), audiencia, `azp` con varias audiencias, vigencia con 30 s de tolerancia y `nonce`.

Contraseñas, recuperación de acceso (RF-IDE-007), bloqueo por intentos y enrolamiento del segundo factor los hace el proveedor. Cambiar de Keycloak a Entra o Auth0 es configuración; las reglas de autorización siguen en nuestra base (RI-006).

### 2. Sesiones de servidor, no JWT en el navegador

El navegador guarda un token opaco de 256 bits; la tabla `sessions` guarda solo su SHA-256. Se descartaron JWT de acceso en el cliente porque RF-IDE-008 exige que quitar un rol corte la **siguiente** petición, y un JWT sigue siendo válido hasta que vence.

- Cookies `__Host-fs_portal` y `__Host-fs_console`: HttpOnly, Secure, SameSite=Strict, sin Domain. El prefijo impide que un subdominio del dominio institucional las fije o sobrescriba.
- Portal y consola tienen cookie y sesión propias. El middleware elige qué cookie leer según la URL (sin distinguir mayúsculas y rechazando la forma absoluta `GET http://…`), pero **el control lo hace el guard con el `@Controller` resuelto**: un controlador `admin/...` solo acepta actores internos y cualquier otro solo externos. Decidirlo por el texto de la URL fue el hallazgo crítico de A5: `/ADMIN/v1/users` llegaba al mismo controlador con una sesión de portal.
- Duración e inactividad son el parámetro versionado `identidad.sesion` (portal 12 h / 60 min; consola 8 h / 30 min, propuesta de `docs/01-consola-administracion.md` §7). Sin versión vigente, el login falla cerrado.
- Los permisos se leen de la base en cada petición. Además, desactivar, bloquear o cambiar un rol revoca las sesiones afectadas en la misma transacción.

### 3. CSRF: SameSite=Strict más token derivado

Toda petición con método no seguro que llegue con cookie de sesión debe traer `x-csrf-token = SHA-256("csrf:" + token de sesión)`. Quien no tiene la cookie no puede calcularlo; el cliente lo recibe en `GET /auth/session`, respuesta que el navegador solo entrega a orígenes permitidos por CORS. No se almacena.

### 4. El login, paso a paso, en este orden

1. `GET /v1/auth/login` (o `/admin/v1/auth/login`) crea `state`, `nonce` y verificador PKCE en `auth_flows` (state hasheado, 10 min) y ata el `state` al navegador con la cookie `__Host-fs_flow_*` (SameSite=Lax: el regreso es una navegación desde otro sitio).
2. El callback exige `state` igual a la cookie **antes** de tocar la base, y consume el flujo con un `DELETE` condicional: un callback reenviado o fabricado nunca llega a gastar el código en el proveedor (login CSRF y replay).
3. El ID token se verifica en el adaptador; `email_verified` debe ser `true`.
4. El usuario se encuentra por sujeto OIDC. Si no, por correo, **solo** si aún no tiene sujeto (primer login de un usuario invitado o dado de alta). Mismo correo con otro sujeto se rechaza: una cuenta recreada en el proveedor no hereda accesos sin intervención.
5. No hay registro abierto: sin usuario previo, se rechaza.
6. Portal: con una empresa se entra en ella; con varias, la sesión no tiene permisos de negocio hasta elegir (RF-IDE-003). Sin empresa activa solo se entra si hay invitaciones vigentes por responder. Consola: exige rol interno y segundo factor afirmado por el proveedor en `amr` o `acr` (RA-ACC-002) **y reciente**: se pide `max_age` (900 s, `OIDC_CONSOLE_MAX_AGE_SEC`) y se exige `auth_time` dentro de ese margen, para que un `otp` de hace horas no se reutilice por la sesión SSO del proveedor. Por defecto solo `otp` y `mfa` cuentan como segundo factor; `hwk`/`swk` (RFC 8176) indican posesión de una clave, no dos factores.
7. Al completar un login se revoca la sesión de la cookie anterior, si la había (equipos compartidos).
8. Los rechazos redirigen a `/acceso/error?motivo=<categoría>` de la aplicación. El detalle va a la auditoría (`identity.login.rejected`), igual que en el webhook de pagos (ADR-007 §3), con el **hash** del correo y no el correo: muchos rechazados ni siquiera son usuarios y la auditoría es para siempre.

### 5. Invitación = vínculo pendiente con vencimiento y aceptación explícita

Invitar crea (o reutiliza) el `User` global y un `OrganizationUser` en estado `INVITADO` con vencimiento (`identidad.invitacion`, 72 h). La persona entra con su correo verificado y **acepta o rechaza de forma explícita** (`POST /v1/auth/invitations/:organizationId/accept|decline`); la sesión lista las pendientes. Solo al aceptar se enlaza o crea su `Contact` en la empresa. Así un gerente no puede meterse en la lista de empresas de alguien que trabaja con otra, ni registrar datos de una persona que no ha aceptado nada (Ley 1581). No hay token en el enlace: la posesión del correo la prueba el proveedor. El evento `identity.user.invited` queda en el outbox para el correo; aún no tiene consumidor.

Retirar una invitación la borra (no la deja DESACTIVADA), y reinvitar a un desactivado se rechaza: así "reactivar" nunca da acceso a quien no aceptó, y no sirve de atajo para saltarse `user:manage`. Se descartó una tabla de invitaciones aparte: el estado del vínculo ya dice todo y la historia completa está en la auditoría.

### 6. Estado por empresa distinto del estado global

`OrganizationUser.status` (`INVITADO`, `ACTIVO`, `DESACTIVADO`) lo gobierna el gerente de esa empresa; `User.status = BLOQUEADO` lo gobierna Fedesoft desde la consola. Un gerente no puede bloquear a una persona que también trabaja con otra empresa, ni ve si Fedesoft la bloqueó.

### 7. Roles internos sin empresa

`UserInternalRole` (usuario ↔ rol interno, varios por persona). Una clave compuesta `(role_id, role_internal)` hacia `roles(id, internal)` más un CHECK de valor constante impiden **en la base** asignar un rol interno dentro de una empresa, o uno de empresa como interno. Cambiar el carácter interno de un rol ya asignado también falla.

### 8. Tercera marca explícita: `@Authenticated`

Ver la propia sesión, elegir empresa y cerrar sesión exigen sesión pero ningún permiso de negocio. Se añade `@Authenticated()` junto a `@RequirePermission` y `@Public`. La regla no cambia: un endpoint sin ninguna de las tres sigue denegado. Sin sesión, el guard responde 401 (antes 403) para que el cliente distinga "inicia sesión" de "no tienes permiso".

### 9. Guardas de negocio

- Un gerente no se desactiva ni cambia su propio rol, y la empresa conserva al menos un usuario activo con `user:manage`. Serializado con `SELECT … FOR UPDATE` sobre la empresa.
- RA-ACC-008: siempre quedan dos Super Admin no bloqueados y ninguno se quita su propio rol. Serializado con un advisory lock.
- `role:assign` es permiso sensible: ningún comodín lo concede, ni siquiera `*`. La semilla se lo da explícitamente a `super-admin`.
- Techo de privilegios: en la consola nadie se asigna roles a sí mismo ni otorga un rol con permisos que no tiene (`canDelegate`). En la empresa, un rol que invita o administra usuarios solo lo otorga quien tiene `user:manage`.
- El mínimo de dos Super Admin cuenta solo cuentas activas y ya vinculadas a su identidad: una invitada que nunca entró no sostiene el sistema.

### 10. Límite de peticiones

Guard global `ActorThrottlerGuard`: 120 peticiones por minuto por usuario con sesión o por IP sin ella; 10 por minuto en login y callback; 30 invitaciones por hora por usuario (cada una dispara un correo con nuestro dominio). Webhooks y sondas de salud quedan fuera. La IP real depende de `TRUST_PROXY_HOPS`, que debe ser el número exacto de saltos del balanceador: de más, cualquiera falsifica su IP con `X-Forwarded-For`.

## Invariantes nuevas en la base

| Restricción | Qué impide |
|---|---|
| `sessions_console_requires_mfa` | Sesión de consola sin segundo factor o con empresa |
| `sessions_member_of_org` (FK compuesta) | Sesión de portal en una empresa a la que el usuario no pertenece; borrar el vínculo borra la sesión |
| `org_users_external_role` + `organization_users_role_is_external` | Rol interno dentro de una empresa |
| `user_internal_roles_internal_role` + `…_role_is_internal` | Rol de empresa como rol interno |
| `organization_users_invite_expires` | Invitación sin vencimiento |
| `users_email_lowercase` (`NOT VALID`) | Dos cuentas para el mismo correo con distinta capitalización. Rige para filas nuevas o modificadas; validarla sobre las existentes es el paso *contract* tras normalizar |

## Consecuencias

**Positivas.** El recorrido "gerente autenticado → estado de cuenta → pago" ya tiene su primer eslabón. Cambiar de proveedor no toca el dominio. Las reglas que más importan están en la base y probadas contra ella.

**Verificado.** Pruebas unitarias, de contrato del adaptador contra un proveedor OIDC simulado por HTTP con firmas reales (trece ataques al ID token), de integración contra PostgreSQL, pruebas de mutación sobre los controles, y un recorrido manual contra Keycloak 26.4 con TOTP real. A5 revisó el diseño y la implementación; su veredicto inicial fue BLOCKED por el hallazgo de superficie (sección 2) y los hallazgos crítico, alto, medios y la mayoría de bajos se corrigieron en este mismo cambio.

**Deuda asumida (con dueño y momento):**

- Límite de peticiones en memoria: con varias réplicas pasa a Redis, y `TRUST_PROXY_HOPS` se fija con la topología real. A8, antes de staging.
- El sujeto OIDC es único sin el emisor: al sumar o cambiar de proveedor hay que guardar `(issuer, subject)`. Exige su propio ADR y migración. A1 + A2, antes de un segundo proveedor.
- `NODE_ENV` ausente equivale a desarrollo y desactiva las comprobaciones de producción. El despliegue debe fijarlo siempre (A8); evaluar exigirlo en `env.ts`.
- Limpieza de `sessions` y `auth_flows` vencidos: hoy oportunista en el login; pasa a un job de `apps/worker`. A3 en EPIC-02b.
- Doble control y reautenticación para cambios de rol (RA-ACC-005/006): fase 2. Hoy queda auditado y protegido por las guardas de la sección 9.
- Alta de los dos primeros Super Admin en producción: hoy solo los crea la semilla de desarrollo. Hace falta un comando de arranque auditado. A3 + A8 antes del piloto.
- Correo de invitación: el evento existe; falta el adaptador de correo (A6).
- Listado y cierre de sesiones por el propio afiliado (RF-IDE-009): fase 3.
- ABAC por estado de la empresa (suspendida o retirada) y por segmento: se resuelve en cada módulo, no en el login.
- La interfaz de login y de gestión de usuarios (A4) se construye con `apps/web` y `apps/admin`.
