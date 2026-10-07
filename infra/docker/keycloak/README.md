# Keycloak de desarrollo

Proveedor OIDC local para el login del portal y la consola (ADR-008). **Solo para desarrollo:** usuarios, contraseñas y secretos de este realm son sintéticos y públicos. Ningún otro entorno los usa; allí el secreto del cliente sale del gestor de secretos.

- Consola de Keycloak: http://localhost:8080 (`admin` / `fedesoft_local`).
- Realm `fedesoft`, cliente confidencial `portal-api` con PKCE S256. Registro abierto desactivado: al portal se entra por invitación.
- Flujo de navegador `fedesoft-browser`: contraseña → `amr: pwd`; OTP → `amr: otp`. La API solo deja entrar a la consola si el ID token trae `otp`.

Todos los usuarios usan la contraseña `Fedesoft.dev1`. Los internos entran por `/admin/v1/auth/login`, que exige TOTP; los roles y sus permisos están en ADR-009 y en `packages/db/prisma/seed.ts`.

| Usuario | Rol en la API | Segundo factor |
|---|---|---|
| `superadmin1@fedesoft-dev.test` | Super Admin (`super-admin`) | TOTP ya configurado |
| `superadmin2@fedesoft-dev.test` | Super Admin (`super-admin`) | Keycloak pide configurarlo al entrar |
| `operaciones@fedesoft-dev.test` | Operaciones · Afiliación (`operaciones`) | Keycloak pide configurarlo al entrar |
| `cartera@fedesoft-dev.test` | Cartera · Financiera (`cartera`) | TOTP ya configurado |
| `formacion@fedesoft-dev.test` | Formación y comunidades (`formacion`) | TOTP ya configurado |
| `comunicaciones@fedesoft-dev.test` | Comunicaciones · Contenido (`comunicaciones`) | TOTP ya configurado |
| `relacionamiento@fedesoft-dev.test` | Relacionamiento · Verticales (`relacionamiento`) | TOTP ya configurado |
| `kam@fedesoft-dev.test` | Gestor de cuenta (`kam`) | TOTP ya configurado |
| `direccion@fedesoft-dev.test` | Dirección (`direccion`) | TOTP ya configurado |
| `auditor@fedesoft-dev.test` | Auditor (`auditor`) | TOTP ya configurado |
| `camilo.restrepo@datalabs-andina.test` | Gerente (Datalabs Andina) | — |
| `diana.salazar@datalabs-andina.test` | Talento (Datalabs Andina) | — |

`kam@fedesoft-dev.test` existe porque lo crea la semilla; la consola todavía no deja asignar el rol `kam` a nadie (ADR-009, b), así que no se pueden crear más gestores de cuenta desde ahí.

**Secretos TOTP: solo desarrollo, públicos y sintéticos.** Cada usuario con TOTP preconfigurado tiene un secreto distinto, así una app autenticadora puede guardar varios sin mezclarlos. El secreto es el texto `fedesoft-dev-totp-<clave>-solo-local` (el de `superadmin1` no lleva clave: `fedesoft-dev-totp-solo-local`); abajo, su forma base32 para añadirlo a una app autenticadora. Algoritmo SHA-1, 6 dígitos, 30 s. Ningún otro entorno los usa: allí el segundo factor lo enrola cada persona con el proveedor.

| Usuario | Secreto TOTP (base32) |
|---|---|
| `superadmin1` | `MZSWIZLTN5THILLEMV3C25DPORYC243PNRXS23DPMNQWY` |
| `cartera` | `MZSWIZLTN5THILLEMV3C25DPORYC2Y3BOJ2GK4TBFVZW63DPFVWG6Y3BNQ` |
| `formacion` | `MZSWIZLTN5THILLEMV3C25DPORYC2ZTPOJWWCY3JN5XC243PNRXS23DPMNQWY` |
| `comunicaciones` | `MZSWIZLTN5THILLEMV3C25DPORYC2Y3PNV2W42LDMFRWS33OMVZS243PNRXS23DPMNQWY` |
| `relacionamiento` | `MZSWIZLTN5THILLEMV3C25DPORYC24TFNRQWG2LPNZQW22LFNZ2G6LLTN5WG6LLMN5RWC3A` |
| `kam` | `MZSWIZLTN5THILLEMV3C25DPORYC223BNUWXG33MN4WWY33DMFWA` |
| `direccion` | `MZSWIZLTN5THILLEMV3C25DPORYC2ZDJOJSWGY3JN5XC243PNRXS23DPMNQWY` |
| `auditor` | `MZSWIZLTN5THILLEMV3C25DPORYC2YLVMRUXI33SFVZW63DPFVWG6Y3BNQ` |

Los usuarios de la semilla (`pnpm db:seed`) no traen sujeto OIDC: se vinculan en el primer login por correo verificado. Si recreas Keycloak después de haber entrado, los sujetos cambian y la API rechaza con `identidad-en-conflicto` (es el control funcionando); recrea también la base o limpia `users.auth_subject` en desarrollo.

## Usarlo con el prototipo en modo API

El prototipo visual (`cenisoft-repo/fedesoft`) puede usar este API para la identidad. Sirve portal y consola en el puerto 3001, así que en `apps/api/.env` hay que poner `PORTAL_URL` y `CONSOLE_URL` en `http://localhost:3001` (y ese origen en `CORS_ORIGINS`). Instrucciones completas en el README del prototipo, sección "Modo API".
