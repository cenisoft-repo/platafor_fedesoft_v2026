# ADR-008 · Identidad, sesión y autorización

**Estado:** Aceptada · 23 de septiembre de 2026
**Contexto:** EPIC-01b/02 — capa B del documento de arquitectura.
**Relacionadas:** ADR-002 (stack e identidad OIDC intercambiable), ADR-006 (fundación e invariantes), ADR-007 (recorrido crítico).

---

## Contexto

La capa B es el bloqueador estructural del proyecto. El guard global exige un `req.actor` que **ningún middleware llenaba**: hasta hoy el API denegaba el cien por ciento de sus peticiones, y ningún módulo del portal podía existir.

Fedesoft todavía no decide su proveedor de identidad (`RQ-FED-008`). La pregunta era si eso bloqueaba la capa B. **No la bloquea**, por la misma razón que no bloqueó el recorrido crítico: el dominio habla con un puerto y el proveedor vive en un adaptador.

Esta decisión define de dónde sale la identidad, dónde vive la sesión, cómo se deriva la autorización y cómo se revoca.

## Decisiones

### 1. La identidad es federada y el proveedor es intercambiable

`IdentityProviderPort` es todo lo que el dominio conoce: construir la URL de autorización, canjear el código y cerrar la sesión del proveedor. El adaptador `OidcIdentityProvider` implementa OIDC estándar con descubrimiento y JWKS, así que sirve para Keycloak, Auth0 o Entra sin tocar una sola regla de autorización; cuál se usa es una variable de entorno.

**No guardamos contraseñas, ni las guardaremos.** `User` no tiene campo de credencial: la autenticación es del proveedor. Con eso, la recuperación de acceso (RF-IDE-007) también es suya, que es donde debe estar.

El adaptador `StubIdentityProvider` existe para desarrollo y pruebas. No es un bypass del middleware —recorre el mismo flujo y crea la misma sesión—, es otro proveedor, y la decisión 11 explica los dos cercos que impiden que quede activo donde no debe.

### 2. El usuario se resuelve por el sujeto del proveedor, no por el correo

El vínculo es `(issuer, subject)`. El correo solo sirve para enlazar por primera vez a un usuario invitado, y **únicamente si el proveedor lo declara verificado**: aceptar un correo no verificado como llave de identidad es regalar la cuenta a quien registre ese correo en el IdP.

Guardar el emisor junto al sujeto es lo que permite cambiar de proveedor sin perder la identidad: son dos columnas distintas, no una cadena concatenada.

### 3. La sesión es opaca y vive en PostgreSQL

El navegador recibe un identificador aleatorio de 256 bits en una cookie `__Host-`, `HttpOnly`, `Secure` y `SameSite=Lax`. **No un JWT con permisos dentro.** Un token autocontenido no se puede revocar a tiempo, y RF-IDE-008 exige que quitar un rol se sienta en la petición siguiente.

La sesión vive en la base, no en Redis, por dos razones. La primera es el principio de fuente única: revocar privilegios y matar sesiones ocurre en **la misma transacción** que el cambio de rol, y eso con dos almacenes es un problema de consistencia distribuida que nadie necesita tener. La segunda es operativa: el CI ya levanta PostgreSQL y no levanta Redis; una garantía de seguridad que no se prueba en cada PR no es una garantía. Si algún día el volumen lo exige, `SessionStore` es un puerto y Redis entra como caché de lectura detrás de él, con la base como verdad.

El token de refresco del proveedor, cuando exista, se queda del lado del servidor asociado a la sesión. Nunca viaja al navegador.

### 4. Los permisos se derivan en cada petición, de la organización activa

En la sesión no se congela una lista de permisos. En cada petición se leen el rol y el estado vigentes de la organización activa y se construye el `ActorContext`. Un usuario con rol de gerente en una empresa y de contacto en otra **no acumula**: opera con lo que le da la empresa en la que está parado.

El coste es una consulta por petición; la alternativa —confiar en lo que se copió en la sesión— es exactamente la fuga que RF-IDE-008 prohíbe.

### 5. La revocación es una sola cosa, no dos

Se evaluó añadir un contador de época de privilegios junto a la tabla de sesiones, como defensa en profundidad. **Se descartó.** Con las sesiones en la misma base que los roles, un respaldo restaura ambos a la vez y la época se restauraría con ellos: no protege de nada que la tabla no proteja ya, y sí abre la puerta a que los dos estados se desincronicen. Dos fuentes de verdad para la misma pregunta es exactamente lo que este proyecto prohíbe.

Queda entonces un solo mecanismo, y es suficiente porque son dos capas distintas: quitar un rol se siente de inmediato porque los permisos **se derivan en cada petición** (decisión 4), y desactivar a una persona o suspender a una empresa revoca sus sesiones en la misma transacción del cambio. Una sesión revocada no vuelve; una sesión viva siempre refleja el rol de ahora, no el de cuando entró.

### 6. El `organization_id` activo sale de la sesión, siempre

Nunca del cuerpo, ni de la query, ni de una cabecera. Cambiar de organización (RF-IDE-003) es un endpoint dedicado que revalida la membresía y **rota el identificador de sesión**, como lo rota el login. Del cuerpo salen identificadores de objetos, y cada uno se verifica contra la organización en sesión.

La regla de revisión es mecánica: un `organizationId` en un DTO es rechazo del PR.

### 7. El segundo factor lo exige y lo demuestra el proveedor

No guardamos secretos TOTP ni códigos de recuperación: custodiar semillas de segundo factor es asumir un riesgo que el IdP ya asumió mejor. Para los perfiles internos se pide `acr_values` en la autorización y se verifica en el token que el factor ocurrió (`acr`/`amr`); la sesión anota cuándo. Un rol interno sin segundo factor en la sesión **no opera en `/admin/v1`**, y tampoco ejerce un permiso de `SENSITIVE_PERMISSIONS` aunque su rol sea externo.

### 8. El login se ata al navegador que lo empezó

`state`, `nonce` y PKCE protegen al que inicia sesión de que le manipulen el intento. **Ninguno de los tres protege a la víctima del caso inverso:** un atacante abre su propio login, se autentica de verdad, no sigue la vuelta y le entrega a la víctima la URL del callback. El servidor la procesa y le deja a la víctima, en su navegador, una sesión que es del atacante. Todo lo que suba, pague o invite después cae en la empresa del atacante.

Por eso el intento de login deja una cookie efímera —`fdsft_authtx`, `HttpOnly`, diez minutos— cuyo hash se guarda con la transacción. El callback la exige, y la comprobación va **dentro del mismo `UPDATE` que consume el `state`**: sin la cookie correcta el intento ni se consume, así que un callback ajeno tampoco puede quemar el login legítimo de otra persona.

### 9. Los verbos mutantes exigen token anti-CSRF

`SameSite=Lax` no cubre navegación de nivel superior con POST en todos los navegadores, así que va acompañado de un token por sesión, entregado en una cookie legible y exigido en cabecera. CORS ya sirve con lista de orígenes explícita.

### 10. Autenticar tiene límite de tasa y respuestas indistinguibles

Hay un tope global para todo el API y uno más estricto en inicio de sesión y callback, que es lo que se puede golpear sin credenciales. Ninguna respuesta permite distinguir "no existe" de "no autorizado": ni por cuerpo, ni por código, y el motivo real va a la auditoría.

Dos condiciones lo sostienen y hay que declararlas en el despliegue: `TRUSTED_PROXY_HOPS`, porque detrás de un balanceador sin esa configuración todas las peticiones comparten la IP del ingress y el límite se vuelve un cupo común; y un almacén compartido en cuanto haya más de una réplica, porque el actual es de memoria.

### 11. El proveedor de desarrollo tiene dos cercos, no uno

`IDENTITY_PROVIDER` no tiene valor por defecto: el valor cómodo sería el inseguro. Y `stub` se rechaza tanto con `NODE_ENV=production` como con `SESSION_COOKIE_SECURE=true`, porque un preproductivo con TLS está igual de expuesto a internet que producción aunque su `NODE_ENV` diga otra cosa.

## Consecuencias

**Lo que se destraba.** Con el actor resuelto, todo módulo del portal puede construirse: el guard ya tenía la regla y ahora tiene el sujeto. La segmentación del documento de arquitectura —experiencia distinta por rol y por tamaño de empresa— se decide en servidor desde el primer instante de la sesión.

**Lo que queda pendiente y por qué no bloquea.** `RQ-FED-008` elige el proveedor: es una variable de entorno y la URL de descubrimiento. `RQ-FED-007` fija el criterio de segmentación: hoy el segmento se lee de `Organization`, y afinar la regla es cambiar cómo se calcula ese campo, no cómo se autoriza.

**La deuda que se asume.** La invitación, activación y baja de usuarios por parte del gerente (RF-IDE-006) y el registro de aceptación de políticas (RNF-CUM-002) no entran aquí; van en el incremento siguiente sobre esta misma base. Mientras tanto, un usuario se vincula a su empresa desde la consola interna.

**La deuda de seguridad que queda abierta**, en orden de prioridad para el incremento siguiente:

1. **Frescura del segundo factor.** Hoy el guard pregunta si hubo MFA en la sesión, no cuándo. Con ocho horas de vida, un permiso sensible se ejerce con un factor de la mañana. `mfa_satisfied_at` ya está en la tabla; falta exigir que sea reciente.
2. **La mitad ABAC.** `segment` y `membershipStatus` se calculan, se publican y no deciden nada; `Organization.status` no participa en ninguna decisión. Hay que resolverlo —con un decorador explícito— antes del primer endpoint de cartera, porque la firma del actor invita a suponer que ya está aplicado.
3. **Revocación en cascada.** `revokeAllForUser` existe y no tiene quien lo llame, porque todavía no hay endpoint que cambie roles. Es criterio de aceptación bloqueante del primero que aparezca.
4. **Invitación, activación y baja por el gerente (RF-IDE-006).** Mientras no exista, el primer enlace por correo depende de que el proveedor no sea multi-inquilino sin restricción de dominio.
5. **Cierre de sesión federado.** Sin custodiar el `id_token`, el cierre es local: la sesión del proveedor sobrevive.
6. **Barrido de `auth_transactions`.** Las filas consumidas se vacían de secretos, pero nadie las borra todavía.

**Una consulta más por petición.** Derivar permisos en cada llamada cuesta un viaje a la base. Es el precio de la revocación inmediata y se paga con un índice, no con una caché que vuelva a abrir el problema.
