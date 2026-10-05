# Keycloak de desarrollo

Proveedor OIDC local para el login del portal y la consola (ADR-008). **Solo para desarrollo:** usuarios, contraseñas y secretos de este realm son sintéticos y públicos. Ningún otro entorno los usa; allí el secreto del cliente sale del gestor de secretos.

- Consola de Keycloak: http://localhost:8080 (`admin` / `fedesoft_local`).
- Realm `fedesoft`, cliente confidencial `portal-api` con PKCE S256. Registro abierto desactivado: al portal se entra por invitación.
- Flujo de navegador `fedesoft-browser`: contraseña → `amr: pwd`; OTP → `amr: otp`. La API solo deja entrar a la consola si el ID token trae `otp`.

| Usuario (contraseña `Fedesoft.dev1`) | Rol en la API | Segundo factor |
|---|---|---|
| `superadmin1@fedesoft-dev.test` | Super Admin | TOTP ya configurado (secreto abajo) |
| `superadmin2@fedesoft-dev.test` | Super Admin | Keycloak pide configurarlo al entrar |
| `operaciones@fedesoft-dev.test` | Operaciones | Keycloak pide configurarlo al entrar |
| `camilo.restrepo@datalabs-andina.test` | Gerente (Datalabs Andina) | — |
| `diana.salazar@datalabs-andina.test` | Talento (Datalabs Andina) | — |

Secreto TOTP de `superadmin1`, para añadirlo a una app autenticadora (base32): `MZSWIZLTN5THILLEMV3C25DPORYC243PNRXS23DPMNQWY`.

Los usuarios de la semilla (`pnpm db:seed`) no traen sujeto OIDC: se vinculan en el primer login por correo verificado. Si recreas Keycloak después de haber entrado, los sujetos cambian y la API rechaza con `identidad-en-conflicto` (es el control funcionando); recrea también la base o limpia `users.auth_subject` en desarrollo.
