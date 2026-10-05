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
- Portal y consola tienen cookie y sesión propias. El middleware elige la cookie por superficie (`/admin/*` → consola) y el guard rechaza un actor interno en el portal y uno externo en la consola.
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
6. Portal: con una empresa se entra en ella; con varias, la sesión no tiene permisos de negocio hasta elegir (RF-IDE-003). Consola: exige rol interno y segundo factor afirmado por el proveedor en `amr` o `acr` (RA-ACC-002).
7. Los rechazos redirigen a `/acceso/error?motivo=<categoría>` de la aplicación. El detalle va a la auditoría (`identity.login.rejected`), igual que en el webhook de pagos (ADR-007 §3).

### 5. Invitación = vínculo pendiente con vencimiento

Invitar crea (o reutiliza) el `User` global, el `Contact` de la empresa y un `OrganizationUser` en estado `INVITADO` con vencimiento (`identidad.invitacion`, 72 h). Entrar con ese correo verificado la acepta. No hay token en el enlace: la prueba de posesión del correo la da el proveedor, y así no hay un secreto más que guardar ni que pueda filtrarse. El evento `identity.user.invited` queda en el outbox para el correo; aún no tiene consumidor.

Se descartó una tabla de invitaciones aparte: el estado del vínculo ya dice todo y la historia completa está en la auditoría.

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

## Invariantes nuevas en la base

| Restricción | Qué impide |
|---|---|
| `sessions_console_requires_mfa` | Sesión de consola sin segundo factor o con empresa |
| `sessions_member_of_org` (FK compuesta) | Sesión de portal en una empresa a la que el usuario no pertenece; borrar el vínculo borra la sesión |
| `org_users_external_role` + `organization_users_role_is_external` | Rol interno dentro de una empresa |
| `user_internal_roles_internal_role` + `…_role_is_internal` | Rol de empresa como rol interno |
| `organization_users_invite_expires` | Invitación sin vencimiento |
| `users_email_lowercase` | Dos cuentas para el mismo correo con distinta capitalización |

## Consecuencias

**Positivas.** El recorrido "gerente autenticado → estado de cuenta → pago" ya tiene su primer eslabón. Cambiar de proveedor no toca el dominio. Las reglas que más importan están en la base y probadas contra ella.

**Verificado.** Pruebas unitarias, de contrato del adaptador contra un proveedor OIDC simulado por HTTP con firmas reales (nueve ataques al ID token), de integración contra PostgreSQL, y un recorrido manual contra Keycloak 26.4 con TOTP real.

**Deuda asumida (con dueño y momento):**

- Límite de intentos en memoria (`@nestjs/throttler`): con varias réplicas pasa a Redis. Detrás de un proxy hay que configurar `trust proxy` o el límite se aplica a la IP del proxy. A8, antes de staging.
- Limpieza de `sessions` y `auth_flows` vencidos: hoy oportunista en el login; pasa a un job de `apps/worker`. A3 en EPIC-02b.
- Doble control y reautenticación para cambios de rol (RA-ACC-005/006): fase 2. Hoy queda auditado y protegido por las guardas de la sección 9.
- Alta de los dos primeros Super Admin en producción: hoy solo los crea la semilla de desarrollo. Hace falta un comando de arranque auditado. A3 + A8 antes del piloto.
- Correo de invitación: el evento existe; falta el adaptador de correo (A6).
- Listado y cierre de sesiones por el propio afiliado (RF-IDE-009): fase 3.
- ABAC por estado de la empresa (suspendida o retirada) y por segmento: se resuelve en cada módulo, no en el login.
- La interfaz de login y de gestión de usuarios (A4) se construye con `apps/web` y `apps/admin`.
