# Consola de administración — operabilidad del super usuario

**Versión 0.4 · 7 de octubre de 2026 · Estado: decisiones estructurales aprobadas (app separada, Opción A, BI existente, aprobación con acta); detalles pendientes en la sección 10**

*Cambios de 0.4 (7 oct 2026):* los nueve roles internos quedan sembrados con sus permisos, expandidos desde la matriz; se parten las filas de parámetros/catálogos/flags y de colas/importación, que al traducirse a permisos sobre-concedían; la convención de permisos pasa a `dominio:accion`, que es la que el guard acepta.

*Cambios de 0.3:* `DIR` pasa a solo lectura —la aprobación de afiliación la registra `OPS` con acta (ADR-005)— con las metas anuales como única excepción declarada; se especifica la vista de Dirección (sección 6.2.1) y se adelanta su `v0` a la fase 2; el diccionario gana el cruce retención–participación y los índices compuestos publican sus pesos.

La consola es el *back-office* del Portal Único del Afiliado: desde ella Fedesoft configura, opera, interviene y mide todo el sistema. Este documento define **roles internos y permisos, parametrización, CRUDs por dominio, gestiones operativas, analítica/dashboards/resultados, seguridad y arquitectura**, y su encaje en el plan. Complementa —no reemplaza— los documentos rectores de `docs/base/`.

**Regla de oro:** todo lo que el afiliado hace en autoservicio, el equipo lo puede ver, intervenir y auditar desde la consola; y todo lo que hoy es manual (afiliación, cartera, certificados, formación, convocatorias, KAM) se gestiona allí **sobre la misma fuente de verdad**. La consola no tiene datos propios: lee y escribe los mismos dominios a través de la misma API, con endpoints de administración protegidos por roles internos.

---

## 1. Principios de la consola

1. **Misma fuente de verdad.** Ningún listado, tablero o reporte vive en tablas paralelas; la analítica es una proyección derivada y de solo lectura.
2. **Toda acción administrativa queda auditada**: quién, qué, cuándo, desde dónde, valor anterior y nuevo, y **motivo obligatorio** en cambios de estado y excepciones.
3. **Mínimo privilegio.** El Super Admin es un rol de configuración y emergencia, no el rol de trabajo diario. Siempre existen al menos dos cuentas Super Admin; ninguna se usa para operar.
4. **Configurar antes que programar.** Tarifas, reglas de cartera, elegibilidades, cupos, numeraciones y plantillas son parámetros con vigencia y versión, no código.
5. **Operación segura.** MFA obligatoria, sesiones cortas, re-autenticación para acciones críticas y **doble control (cuatro ojos)** en las que mueven dinero, permisos o reglas.
6. **Observabilidad para operar.** La consola muestra colas, webhooks, fallos de integración y reintentos: el operador ve qué pasó sin llamar al desarrollador.
7. **Ficha 360 como centro.** Todo lo de una empresa (perfil, contactos, afiliación, cartera, facturas, certificados, formación, comunidades, verticales, oportunidades, KAM, auditoría) se ve y se gestiona desde un solo lugar.

---

## 2. Roles internos y permisos

### 2.1 Roles (RBAC) con alcance (ABAC)

| Rol | Quién | Alcance típico | Alcance ABAC |
|---|---|---|---|
| **Super Admin** (`SA` · `super-admin`) | Responsable técnico y suplente | Configuración global, catálogos, roles y permisos, proveedores, feature flags, usuarios internos, exportación total, auditoría, soporte controlado | Global; acciones críticas con doble control |
| **Operaciones · Afiliación** (`OPS` · `operaciones`) | Equipo de afiliación | Padrón: empresas, contactos, solicitudes y estados de afiliación, certificados, verificación del directorio, importación de padrón | Global sobre afiliados |
| **Cartera · Financiera** (`FIN` · `cartera`) | Tesorería / contabilidad | Tarifas, cargos, pagos, conciliación, ajustes, facturas electrónicas, reportes de recaudo | Global sobre cartera |
| **Formación y comunidades** (`TAL` · `formacion`) | Equipo de talento | Cursos, sesiones, cupos, inscripciones, asistencia, grabaciones, comunidades y materiales | Global sobre formación |
| **Comunicaciones · Contenido** (`COM` · `comunicaciones`) | Comunicaciones | Plantillas, campañas, anuncios, insights publicados, ofertas del directorio (moderación), sello y piezas | Global sobre contenido |
| **Relacionamiento · Verticales y Cenisoft** (`REL` · `relacionamiento`) | Cenisoft / verticales | Verticales, mesas, documentos, oportunidades y convocatorias, postulaciones | Global sobre relacionamiento |
| **KAM** (`KAM` · `kam`) | Gestores de cuenta | Cuentas estratégicas asignadas: ficha 360 de lectura, interacciones, planes de acción | Solo `organization_id` asignadas |
| **Dirección** (`DIR` · `direccion`) | Presidencia Ejecutiva / dirección | Dashboards y resultados, reportes y exportación de analítica, lectura del padrón, **metas anuales** | Global de **solo lectura**, con una sola excepción declarada: las metas anuales |
| **Auditor** (`AUD` · `auditor`) | Revisoría / control | Auditoría, reportes y exportaciones, sin mutación | Global de lectura |

Entre paréntesis, la sigla que usa este documento y la **clave del rol en la base de datos**. Los nueve están sembrados en `packages/db/prisma/seed.ts`, expandidos desde la matriz de §2.2 fila por fila —no escritos a mano—, y `apps/api/test/roles-sembrados.test.ts` comprueba que la base diga lo que dice esta tabla. Un permiso de más no haría fallar nada por sí solo: simplemente funcionaría, y de eso se encargan esas pruebas.

Un usuario interno puede tener más de un rol. La aprobación de afiliación por la Junta Directiva ocurre fuera del sistema y se modela como **aprobación registrada** por `OPS` con número de acta, fecha y aprobador (decidido, sección 10); la Junta no necesita acceso a la consola.

### 2.2 Matriz de permisos por recurso

Códigos: **C** crear · **R** ver · **U** editar · **S** cambiar estado · **X** exportar · **P** parametrizar · **✚** requiere doble control · *(a)* solo cuentas asignadas · — sin acceso.

| Recurso | SA | OPS | FIN | TAL | COM | REL | KAM | DIR | AUD |
|---|---|---|---|---|---|---|---|---|---|
| Empresas y contactos | CRUSX | CRUSX | R | R | R | R | R *(a)* | R | RX |
| Solicitudes y estados de afiliación | CRUSX | CRUS | R | — | — | — | R *(a)* | RX | RX |
| Tarifas, cargos, pagos y conciliación | CRUSX✚ | R | CRUSX (anulaciones ✚) | — | — | — | R *(a)* | R | RX |
| Facturas electrónicas | RSX | R | RSX | — | — | — | — | R | RX |
| Certificados y sello | CRSX | CRS (manual ✚) | R | — | R | — | R *(a)* | R | RX |
| Formación: cursos, sesiones, inscripciones | CRUSX | R | — | CRUSX | R | — | R *(a)* | R | RX |
| Comunidades y materiales | CRUSX | R | — | CRUSX | RU | — | R *(a)* | R | RX |
| Directorio, ofertas e insights | CRUSX | RU (verificación) | — | — | CRUS | — | R | R | RX |
| Verticales, mesas y documentos | CRUSX | — | — | — | R | CRUSX | R *(a)* | R | RX |
| Oportunidades y postulaciones | CRUSX | — | — | — | — | CRUSX | R *(a)* | R | RX |
| Cuentas estratégicas e interacciones | CRUSX | R | — | — | — | R | CRU *(a)* | R | RX |
| Plantillas, campañas y comunicaciones | CRUSX | R | R | RU (propias) | CRUS | R | — | R | RX |
| Parámetros y reglas de negocio | P✚ | R | RP *(tarifas y cartera)* ✚ | R | R | R | — | RP *(solo metas anuales)* ✚ | RX |
| Catálogos maestros | CRUSP | R | R | R | R | R | — | R | RX |
| Feature flags y pilotos | P✚ | R | — | — | — | — | — | R | RX |
| Usuarios internos y roles | CRUS✚ | — | — | — | — | — | — | R | R |
| Proveedores e integraciones | P✚ | — | R (estado) | — | — | — | — | — | R |
| Importación de padrón | CRUSX | CRX | — | — | — | — | — | — | RX |
| Colas y webhooks | CRUSX | R | R (estado) | — | — | — | — | — | RX |
| Auditoría | RX | R (propia área) | R (propia área) | R (propia área) | R (propia área) | R (propia área) | R *(a)* | R | RX |
| Analítica y dashboards | R | R (propios) | R (propios) | R (propios) | R (propios) | R (propios) | R *(a)* | RX | RX |

**Por qué `DIR` no aprueba nada (corregido, 5 oct 2026).** La matriz le daba a Dirección `RS (2.º nivel)` sobre solicitudes de afiliación. Cambiar un estado es mutar, así que ese permiso contradecía su propio alcance —"global de lectura"— y, sobre todo, contradecía la decisión 2 de la sección 10 y ADR-005: **la Junta Directiva decide fuera del sistema y Operaciones registra la aprobación con número de acta, fecha y aprobador.** No hay un segundo nivel dentro de la consola que aprobar.

Había además una asimetría difícil de defender: activar una empresa —que crea su afiliación, emite su primer cargo y le abre el portal— no exigía doble control, mientras que anular un cargo o emitir un certificado manual sí. Si en algún momento Fedesoft quiere de verdad una aprobación de segundo nivel en el sistema, entra como acción explícita, con doble control y auditoría, no como una `S` suelta en una celda.

Dirección conserva lo que necesita para decidir: ve el padrón completo y exporta analítica. Quien quiera además que la presidencia *ejerza* una acción, tendrá que pedirla por nombre.

**Y una acción sí se pide por nombre: las metas anuales.** La decisión 7 de la sección 10 dice que `DIR` las ajusta, y fijar una meta también es mutar, así que queda declarada como la única excepción a su alcance de lectura: `P` sobre el parámetro de metas y nada más, con doble control y auditoría. Es defendible porque una meta no mueve dinero ni reparte privilegios —solo dibuja la línea contra la que se mide el resto—, y porque es suya: nadie más debería poder cambiarle el número con el que la miden.

Implementación: permisos como cadenas de **exactamente dos segmentos**, `dominio:accion` (p. ej. `charge:transition`, `billing:refund`), roles como conjuntos editables por `SA` con guardas (no puede quitarse a sí mismo el rol `SA`; todo cambio de rol con motivo, doble control y notificación). Condiciones ABAC en el servidor: `organization_id` asignada, área propia, segmento.

**Dos segmentos, no tres (corregido, 7 oct 2026).** Esta sección prometía `dominio.recurso.accion`, pero el guard del API exige dos segmentos y **rechaza las cadenas de tres a propósito**: `billing:payment:refund` se partía en dominio `billing`, y entonces cualquier `billing:*` concedía un reembolso. Era escalada de privilegio por una cadena mal formada, está cerrada en `apps/api/src/common/permissions.ts` y hay prueba que lo fija. La granularidad que daba el tercer segmento se consigue con el dominio: el recurso **es** el dominio (`charge`, `payment`, `invoice`, `certificate`…).

**Por qué parámetros, catálogos y flags son tres filas (corregido, 7 oct 2026).** Estaban en una sola, con la salvedad entre paréntesis: `FIN` parametriza "(tarifas y cartera)" y `DIR` "(solo metas anuales)". Al traducir esa fila a permisos, la salvedad se perdía y las dos columnas se llevaban también los catálogos y los *feature flags*: Dirección habría podido activar un piloto, y Cartera editar cualquier catálogo del sistema. El alcance tiene que ser estructural, no una nota al margen, así que la fila se parte y cada recurso lleva su propia columna.

**Las celdas acotadas son ABAC, no RBAC.** Un permiso no sabe decir "solo las cuentas asignadas" (`KAM`), "solo tarifas y cartera" (`FIN` sobre parámetros), "solo las metas anuales" (`DIR`) ni "solo su propia área" (auditoría). El rol concede la acción; **la condición la aplica el servidor en cada endpoint**. Quien implemente uno de esos endpoints sin su condición deja la celda abierta de par en par, y el permiso no lo va a avisar.

**Los permisos sensibles no los hereda ningún comodín.** `billing:refund`, `billing:write-off`, `billing:manual-payment`, `certificate:revoke`, `parameter:approve`, `role:assign`, `user:impersonate` y `organization:delete` se conceden uno por uno, incluso a `SA`: un rol con `*` no los obtiene. Es la traducción en código de la lista de doble control de la sección 7.

---

## 3. Parametrización (sin código)

Todo parámetro tiene: clave, valor validado por esquema, **alcance** (global → segmento → empresa), **vigencia** (`valid_from`/`valid_to`), **versión**, autor y motivo. Los cambios publican `config.changed` para invalidar cachés y quedan en auditoría.

### 3.1 Catálogos maestros (CRUD simple: código, nombre, activo, orden, vigencia)
Tipos de afiliación (activo, adherente, …) · tamaños de empresa (micro, pequeña, mediana, grande) · segmentos (MIPYME, grande, cuenta estratégica) · sectores y verticales · ubicación (departamento/municipio DIVIPOLA) · cargos de contacto · motivos de cambio de estado (retiro, suspensión, mora, fusión…) · conceptos de cargo (cuota anual, inscripción, evento, otros) · métodos de pago habilitados · tipos de documento · etiquetas.

### 3.2 Reglas de negocio con vigencia (versionadas)
| Regla | Parámetros | Efectos |
|---|---|---|
| Tarifas | Tabla tipo de afiliación × tamaño × año; periodicidad; prorrateo por mes de ingreso; descuentos y condonaciones (✚) | Generación de cargos; estado de cuenta |
| "Al día" | Qué conceptos cuentan; días de gracia; umbral de mora; transición a `pendiente` → `vencida` → `suspendida` | Certificado, sello, "verificado" en directorio, acceso a beneficios |
| Vigencia y renovación | Duración; renovación automática; recordatorios (días antes/después); fecha de corte | Cargos anuales; notificaciones |
| Elegibilidad | Certificado, sello, comunidades (por rol/segmento), insights (por tipo), oportunidades (targeting) | Qué ve cada afiliado |
| Cupos y esperas | Cupos por curso/comunidad; lista de espera; cancelación y no-show | Inscripciones |
| Numeración | Prefijo y reinicio anual de folios de certificado; consecutivos internos | Documentos |
| Cuenta estratégica | Umbral (ingresos/tamaño) + marca manual; asignación de KAM | Panel KAM |
| Segmentación | Clasificación por ingresos (Decreto 957 de 2019) y reglas de reclasificación anual | Vistas y beneficios |

### 3.3 Plantillas y contenido (versionadas, con vista previa y envío de prueba)
Certificado (PDF: campos, firma, logo, QR de verificación) · sello (variantes) · correos transaccionales (variables tipadas) · avisos del portal y banner de mantenimiento · textos legales (tratamiento de datos, términos, consentimientos).

### 3.4 Integraciones y proveedores
Referencias a secretos (nunca en claro), modo sandbox/producción por entorno, mapeos (ítems y cuentas del facturador, métodos de pago), políticas de reintento, rotación de secretos de webhooks, estado de salud y último error.

### 3.5 Seguridad y sesiones
Política MFA por rol · duración de sesión e inactividad · bloqueo por intentos · allowlist de IP para la consola · retención de auditoría y logs · dominios de correo permitidos para usuarios internos · acciones que exigen doble control (lista editable solo por `SA` ✚).

### 3.6 Feature flags y pilotos
Módulos habilitados por segmento, empresa o porcentaje; "modo piloto" con lista de empresas; interruptores de emergencia (p. ej. pausar pagos en línea).

### 3.7 Portal e identidad
Logo, tokens de color base, textos de bienvenida, enlaces de ayuda y contacto, avisos.

**Modelo:** `Parameter`, `Catalog` + `CatalogItem`, `RateTable` + `Rate`, `Template` (+ versiones), `FeatureFlag`, `ProviderSetting`. Dominio nuevo **Config** (ver ADR-005).

---

## 4. CRUDs requeridos por dominio

Eliminación siempre **lógica** (con motivo); la eliminación física solo por proceso de retención. Todo listado tiene filtros guardables, búsqueda, columnas configurables y exportación según permiso.

| Dominio | Entidades | Operaciones de consola | Reglas y estados |
|---|---|---|---|
| Membership | Organization, Contact, Membership, MembershipRequest, MembershipHistory | Crear/editar empresa; fusionar duplicados; cambiar NIT con motivo; contactos y roles; invitar usuario; bandeja de solicitudes; aprobar/rechazar/activar; suspender, reactivar, retirar | NIT único; toda transición con motivo y fecha; historial inmutable; efectos automáticos (bloqueos, directorio, notificaciones) |
| Identity | User, OrganizationUser, Role, Permission, InternalUser | Invitar/bloquear usuario; restablecer MFA; ver sesiones y forzar cierre; vincular contacto-usuario-rol; roles y permisos (✚) | Un contacto puede no tener usuario; cambios de privilegio invalidan sesión |
| Billing | Charge, Payment, PaymentAttempt, Account, Adjustment, Reconciliation | Cargos individuales y **masivos por tarifa**; editar antes de vencer; anular (✚); registrar pago manual (transferencia + soporte); conciliar; revertir; ajustes y notas; enviar estado de cuenta | Nunca recalcular un cargo pagado; `provider_reference` único; cierre diario y mensual |
| Fiscal | Invoice, FiscalDocument, ProviderResponse | Ver, reintentar, reemitir / nota crédito vía proveedor; descargar PDF/XML; ver respuesta DIAN; cola y dead-letter | Estados explícitos; respuesta cruda persistida |
| Documents | Certificate, SealAsset, DocumentTemplate, Folio | Ver; emisión manual excepcional (✚, motivo); revocar; verificación pública por folio/QR; plantillas versionadas | Solo con elegibilidad vigente salvo excepción auditada |
| Learning | Course, Session, Enrollment, Attendance, Recording | CRUD de oferta; publicar; cupos y esperas; inscribir/cancelar en nombre de; marcar o importar asistencia; adjuntar grabación/materiales | Sin duplicados; cupos; historial por empresa y contacto |
| Communities | Community, MembershipRequest, CommunityParticipant, Material | CRUD; elegibilidad por rol/segmento; aprobar solicitudes; remover; sesiones y materiales | Acceso filtrado por rol del contacto |
| Directory | DirectoryProfile, Offer, Insight, InsightEntitlement | Moderar y verificar perfiles; ocultar; aprobar/rechazar/expirar ofertas; publicar insights por tipo de afiliación | "Verificado" deriva del estado real de afiliación |
| Verticals | Vertical, Meeting, WorkingDocument, Participation | CRUD; agenda; convocar; actas y documentos; registrar participación | Participación queda en la ficha 360 |
| Cenisoft | Opportunity, Application, ProjectAssignment, StatusHistory | CRUD; publicar con targeting; bandeja de postulaciones y estados; asignar; seguimiento | Visibilidad filtrada por perfil |
| KAM | AccountManager, StrategicAccount, Interaction, ActionItem | Asignar/reasignar cuentas; registrar interacciones; planes de acción; alertas | KAM solo ve asignadas |
| Notifications | Template, Campaign, Notification, DeliveryAttempt, Suppression | CRUD de plantillas con prueba; campañas segmentadas; log de entregas y reintentos; lista de supresión | Sin envíos a suprimidos; métricas de entrega |
| Audit | AuditEvent, SecurityEvent | Consulta con filtros; exportación firmada | Solo lectura, append-only |
| Config | Parameter, Catalog, RateTable, Template, FeatureFlag, ProviderSetting | Sección 3 | Vigencia, versión, doble control donde aplique |
| Support | Case, ImpersonationSession | Buscar afiliado; "ver como" (solo lectura); acciones en nombre de con motivo; casos | Banner visible; expira; auditado; visible para el afiliado |
| DataOps | ImportJob, ExportJob, DataSubjectRequest | Importar padrón/cartera (CSV → validación → mapeo → previsualización → ejecución idempotente); exportar por dominio; atender solicitudes de datos personales (Ley 1581) | Reportes de calidad de datos; trazabilidad |
| Ops técnica | Queue, WebhookInbox, ProviderHealth | Ver colas; reintentar/descartar; ver payload de webhooks y reprocesar; salud de proveedores; modo mantenimiento | Sin secretos en pantalla |

---

## 5. Gestiones operativas (cómo se opera el sistema)

| # | Gestión | Flujo (estados) | Quién | Automatizaciones |
|---|---|---|---|---|
| 5.1 | Alta de afiliado | Solicitud → validación documental → aprobación de la Junta **registrada por `OPS`** con acta → activación | OPS (`DIR` solo ve) | Crea Membership, cargo inicial prorrateado, invita contactos, publica en directorio, envía bienvenida |
| 5.2 | Ciclo de cartera | Cargos anuales masivos → recordatorios → pago (portal) o transferencia (manual + soporte) → factura → al día | FIN | Recordatorios por reglas; pago en línea 100 % automático; conciliación diaria |
| 5.3 | Conciliación | Bandeja: pagos sin cargo, cargos sin pago, diferencias proveedor vs. local → cierre diario/mensual | FIN | Job de comparación con la pasarela; reporte de cierre |
| 5.4 | Facturación | Monitor de cola → reintentos → rechazos DIAN (corrección y reemisión) → notas crédito | FIN | Reintento con backoff; dead-letter con alerta |
| 5.5 | Certificados y sello | Automático al estar al día; excepción manual con motivo; revocación; verificación pública | OPS | Folio y snapshot; revocación al perder estado |
| 5.6 | Estados de afiliación | Transición con motivo → efectos (bloqueos/desbloqueos) → notificación | OPS | Efectos derivados de reglas parametrizadas |
| 5.7 | Formación | Crear oferta → publicar → inscripciones → recordatorios → asistencia → grabación → historial | TAL | Cupos y esperas; recordatorios; certificado de asistencia opcional |
| 5.8 | Comunidades | Crear → elegibilidad → solicitudes → sesiones → materiales | TAL | Acceso por rol; recordatorios |
| 5.9 | Directorio y ofertas | Moderación de perfil → verificación por estado → ofertas con expiración | COM, OPS | Verificado automático; expiración |
| 5.10 | Verticales | Agenda → convocatoria → mesa → actas/documentos → participación registrada | REL | Registro en ficha 360 |
| 5.11 | Oportunidades Cenisoft | Publicar con targeting → postulaciones → evaluación → asignación → seguimiento | REL | Visibilidad por perfil; notificaciones de estado |
| 5.12 | Cuentas estratégicas | Asignación → interacciones → planes de acción → alertas | KAM | Alertas de vencimiento y baja participación |
| 5.13 | Comunicaciones | Plantilla → campaña segmentada (estado, segmento, rol) → envío → métricas | COM | Supresión; reintentos; métricas |
| 5.14 | Soporte | Buscar → "ver como" (solo lectura) → acción en nombre de (motivo) → caso | OPS, SA | Todo auditado y visible al afiliado |
| 5.15 | Datos | Importación/migración → exportación → solicitudes de datos personales → retención | SA, OPS, FIN | Validación, previsualización, idempotencia |
| 5.16 | Operación técnica | Salud de integraciones → colas → webhooks fallidos → flags y pilotos → mantenimiento | SA | Alertas con runbook |

---

## 6. Analítica, dashboards y resultados

### 6.1 Principios
- **Solo lectura y derivada:** un esquema `analytics` en PostgreSQL con vistas materializadas y tablas de hechos ligeras, alimentadas por eventos de dominio y jobs; nunca se edita desde la consola.
- **Diccionario de métricas** versionado: cada KPI tiene definición, fórmula, fuente y dueño, para que no existan dos números distintos para lo mismo.
- **Segmentable** por tipo de afiliación, tamaño/segmento, sector, región y periodo; **exportable** (CSV/XLSX) según permiso; sin datos personales en tableros agregados (el detalle exige permiso).
- **Dos velocidades:** operativos casi en tiempo real (colas, bandejas, recaudo del día) y gerenciales con corte diario.

### 6.2 Dashboards por audiencia
| Audiencia | Qué responde | Contenido |
|---|---|---|
| **Dirección · resultados gremiales** | ¿Cómo va la federación? | Afiliados activos, altas y bajas, retención; recaudo vs. meta, % al día, cartera vencida; participación (formación, comunidades, verticales); pipeline Cenisoft; salud de cuentas estratégicas; metas anuales vs. real |
| **Operaciones · afiliación** | ¿Qué está pendiente y cuánto tarda? | Bandeja y tiempos de activación; padrón por estado; datos incompletos; certificados (automáticos vs. manuales); **tasa de autoservicio** por trámite |
| **Cartera · Financiera** | ¿Cuánto entra y qué se debe? | Recaudo diario/mensual por canal; *aging* 0-30/31-60/61-90/+90; conciliación pendiente; facturas emitidas/rechazadas/en reintento; costo por documento |
| **Formación y comunidades** | ¿Quién participa y cuánto? | Inscripciones y ocupación por curso; asistencia; empresas participantes; grabaciones vistas; evaluaciones |
| **Relacionamiento** | ¿Se mueven verticales, Cenisoft y KAM? | Participación por vertical; oportunidades, postulaciones y adjudicaciones; interacciones y planes vencidos |
| **Directorio y visibilidad** | ¿Se usa la vitrina? | Perfiles verificados; ofertas activas; consultas; insights descargados |
| **Operación técnica** | ¿Está sano el sistema? | Colas, fallos de integración, latencia y errores, logins y MFA, eventos de seguridad |

### 6.2.1 La vista de Dirección, en detalle

El cuadro anterior dice **qué datos** necesita Presidencia Ejecutiva. Esta sección dice **cómo se le presentan**, porque no es lo mismo: trece cifras sin jerarquía son un informe que se lee una vez y no se vuelve a abrir.

La vista responde tres preguntas, en este orden, y cabe en una pantalla sin desplazamiento.

#### Franja 1 · Las tres cifras

| | Pregunta | Cifra protagonista | A su lado |
|---|---|---|---|
| 1 | **¿Crece el gremio?** | Afiliados activos | Altas y bajas del periodo · retención anual · meta |
| 2 | **¿Entra la plata?** | Recaudo del año | % contra meta · % de afiliados al día · cartera vencida |
| 3 | **¿Sirve la afiliación?** | Tasa de autoservicio | Participación por empresa · **retención según participación** · meta |

Cada una lleva su variación contra el periodo anterior y, cuando las metas estén definidas (`RQ-FED-012`), su línea de meta. Nada más: la cifra, el cambio y la referencia.

La tercera es la que casi nunca aparece en un tablero gremial y es la que sostiene la cuota: **las empresas que participan renuevan más que las que no participan.** Mientras participación y retención vivan en pantallas distintas, el tablero mide actividad; juntas, miden valor, y eso es lo que se defiende ante la Junta.

#### Franja 2 · Qué cambió y qué necesita su atención

Debajo, **cinco filas como máximo**, y son excepciones, no indicadores. Una lista que crece sin tope deja de leerse:

1. Metas en riesgo según la proyección del periodo.
2. Empresas grandes o cuentas estratégicas que cayeron en mora.
3. Cuentas estratégicas sin interacción registrada en más de 60 días.
4. Verticales sin sesión en el trimestre.
5. Facturas electrónicas rechazadas acumuladas sin resolver.

Cada fila enlaza a su detalle. Ninguna es editable desde aquí: la vista señala, el dueño del dominio resuelve.

#### Detrás del clic

- El resto del diccionario de indicadores (sección 6.3), segmentable por tipo de afiliación, segmento, sector, región y periodo.
- Los tableros de las otras audiencias, de solo lectura.
- *Drill-down* hasta la ficha 360 de una empresa, con el permiso correspondiente y con la exportación trazada.

#### Con qué ritmo se abre

Una presidencia no abre un tablero todos los días, así que el artefacto principal **no es la pantalla: es el reporte mensual para Junta**, generado desde el mismo diccionario para que no haya dos cifras de lo mismo. La pantalla queda para consultar entre reportes, y un aviso por correo cubre lo que no puede esperar al cierre del mes: una meta que entra en riesgo o una cuenta estratégica que cae en mora.

#### Lo que esta vista no hace

Ningún dato personal en los agregados; ningún número sin dueño y fórmula en el diccionario; ninguna acción sobre el padrón, la cartera o los documentos. Lo único que Dirección escribe desde aquí son sus propias metas anuales, con doble control y auditoría (sección 2.2). Y los dos semánticos de advertencia y error nunca se distinguen solo por color: el ámbar y el rojo del manual de marca no se separan lo suficiente con deuteranopia, así que toda alerta lleva ícono y etiqueta además del tono (`docs/design/identidad-visual.md`).

### 6.3 Indicadores clave (diccionario v0)
| KPI | Definición | Fuente | Corte |
|---|---|---|---|
| Afiliados activos | Memberships en estado activo a la fecha de corte | Membership | Diario |
| % al día | Activos sin cargos vencidos pendientes ÷ activos | Membership, Charge | Diario |
| Cartera vencida | Suma de cargos con vencimiento < hoy y estado ≠ pagado/anulado, por *aging* | Charge | Diario |
| Recaudo | Pagos aprobados en el periodo, por canal y concepto | Payment | Diario |
| Retención anual | Activos al cierre que estaban activos al inicio ÷ activos al inicio | MembershipHistory | Mensual |
| Altas / bajas | Activaciones y retiros en el periodo, con motivo | MembershipHistory | Mensual |
| Tasa de autoservicio | Trámites completados sin intervención ÷ total, por tipo (pago, certificado, actualización, inscripción) | AuditEvent | Semanal |
| Tiempo de activación | Fecha de activación − fecha de solicitud (mediana y p90) | MembershipRequest | Semanal |
| Facturas con problema | Rechazadas o en reintento ÷ emitidas | Invoice | Diario |
| Ocupación de cupos | Inscritos ÷ cupos, por curso y comunidad | Enrollment | Semanal |
| Participación por empresa | Empresas con ≥ 1 participación (formación, comunidad, vertical) en el periodo ÷ activos | Learning, Communities, Verticals | Mensual |
| **Retención según participación** | Retención anual de empresas con ≥ 1 participación en el año, frente a la de empresas sin ninguna. Es el indicador que sostiene el valor de la cuota | MembershipHistory + Learning, Communities, Verticals | Mensual |
| Pipeline Cenisoft | Oportunidades publicadas, postulaciones, adjudicaciones y tasa de conversión | Cenisoft | Mensual |
| Salud de cuenta estratégica | Índice 0–100 con **pesos declarados y versionados**: al día (40), participación en el año (25), interacción en los últimos 60 días (25), acciones vencidas (−10). La vista muestra siempre los cuatro componentes junto al índice | Varios | Semanal |

**Sobre los índices compuestos.** Un número que no se puede descomponer no se puede discutir, y lo que no se discute no se usa para decidir. Cualquier índice de este diccionario publica sus pesos, los versiona como cualquier otro parámetro y se muestra junto a sus componentes. Los pesos de arriba son una propuesta de partida: los ajusta Dirección, no el código.

### 6.4 Resultados
Un **tablero de metas** con objetivos anuales configurables (afiliados, recaudo, retención, participación, autoservicio) y su avance; reporte mensual para Junta generado desde el diccionario de métricas; comparación con el año anterior; exportación programada por correo.

**Mientras `RQ-FED-012` siga abierta, la línea de meta está vacía** y la franja 1 muestra la cifra y su variación, sin referencia. No es un impedimento técnico: es que la mitad del valor de esta vista depende de cinco números que define Dirección. Conviene decírselo así de directo en la revisión del hito H1.

**Y una versión mínima no debería esperar a la fase 5.** Las cuatro cifras de la franja 1 —activos, % al día, recaudo y tasa de autoservicio— salen de datos que existen al terminar la fase 2, y son además la evidencia de que el proyecto funciona. Dejar para el final la pantalla de quien aprueba y financia el proyecto es el orden exactamente inverso al que conviene: se entrega `v0` en la fase 2 y se completa después.

### 6.5 Arquitectura de analítica
- Esquema `analytics` (vistas materializadas + hechos) refrescado por jobs BullMQ y por eventos; API `GET /admin/v1/analytics/*` con periodo y segmento.
- Dashboards embebidos en la consola (gráficas ligeras, tokens de marca, accesibles).
- Exploración *ad hoc* con la **herramienta de BI que Fedesoft ya usa (Power BI / Looker; por confirmar cuál, licencias y administrador)** conectada a una réplica de lectura del esquema `analytics`, con el diccionario de métricas como única fuente de definiciones; los tableros oficiales viven en la consola.
- Sin PII en agregados; drill-down con permiso; trazabilidad de exportaciones.

---

## 7. Seguridad de la consola

- **Aplicación separada** (`apps/admin`) en dominio propio (p. ej. `admin.portal.fedesoft.org`), no indexada, con allowlist de IP opcional; el portal público nunca contiene código de administración.
- **MFA obligatoria** para todo usuario interno; sesiones cortas (8 h, inactividad 30 min); re-autenticación (*step-up*) antes de acciones críticas.
- **Doble control (✚)** en: roles y permisos, tarifas y reglas de cartera, anulación de cargos o pagos, emisión manual de certificados, exportación total, cambios de proveedores y lista de acciones críticas.
- **Soporte controlado:** "ver como afiliado" en solo lectura por defecto; acciones en nombre de con motivo; banner visible; expiración; todo auditado y visible para el afiliado en su historial.
- **Auditoría** append-only con exportación firmada y retención parametrizada; rate limiting, CSP, CSRF; secretos en *vault*; logs sin PII.

---

## 8. Arquitectura y encaje técnico

- `apps/admin` (Next.js) reutiliza `packages/ui` y `packages/contracts`; `apps/api` expone `/admin/v1/...` con guard de rol interno y las mismas reglas de dominio que el portal.
- Dominios nuevos: **Config**, **Analytics** (read models), **Support**, **DataOps**. Eventos nuevos: `config.changed`, `membership.approved`, `payment.reconciled`, `certificate.revoked`, `import.completed`, `impersonation.started/ended`.
- Patrones de UI: bandejas (*inbox*) con estados, listados con filtros guardados, **ficha 360**, acciones con motivo y confirmación, "deshacer" cuando aplique, comandos rápidos (buscar empresa por NIT/nombre).

---

## 9. Encaje en el plan

Dos épicas transversales, entregadas por rebanadas junto a cada fase (no al final):

| Fase | EPIC-13 · Consola y parametrización | EPIC-14 · Analítica y resultados |
|---|---|---|
| 0 · Fundación | `apps/admin` shell con guard interno y MFA; auditoría base; dominio Config con catálogos y parámetros base | Esquema `analytics` vacío; diccionario de métricas v0 |
| 1 · Núcleo | Ficha 360 (núcleo); CRUD de empresas, contactos y afiliaciones; bandeja de solicitudes; usuarios internos y roles; importación de padrón (mapeo) | Dashboard de Operaciones v1 |
| 2 · Dinero y documentos | Tarifas y cargos masivos; conciliación; facturas y colas; certificados (excepciones, revocación); monitor de webhooks | Dashboard de Cartera v1 (recaudo, *aging*, facturas); **vista de Dirección v0**: las cuatro cifras de la franja 1, sin línea de meta |
| 3 · Autoservicio ampliado | Administración de formación, comunidades, directorio y campañas | Dashboards de formación, comunidades y visibilidad |
| 4 · Alto contacto | Administración de verticales, oportunidades y cuentas estratégicas | Dashboard de relacionamiento |
| 5 · Hardening y salida | Soporte controlado endurecido; pentest de consola; feature flags de piloto | Conexión del BI existente (Power BI / Looker) a la réplica de lectura; tablero de metas y reporte mensual; exportaciones programadas |

**Impacto en el cronograma:** el alcance crece; hay dos formas de absorberlo:
- **Opción A · paralelizar:** dos hilos de frontend (portal y consola) con instancias separadas de A4, mismo backend; mantiene 20 semanas con más agentes en paralelo.
- **Opción B · extender:** +1 semana en Fase 1, +1 en Fase 2 y +1 en Fase 5 → 23 semanas, hito del recorrido crítico en S10.

**Decisión (15 sep 2026): Opción A**, con re-calibración en H2; si la revisión semanal muestra que el hilo de consola atrasa el portal, se pasa a B.

---

## 10. Decisiones a confirmar

| # | Decisión | Recomendación |
|---|---|---|
| 1 | Consola como app separada (`apps/admin`) o área `/admin` del portal | **Decidido (15 sep 2026):** app separada `apps/admin` |
| 2 | Áreas internas reales y quién aprueba la afiliación (Junta Directiva) | **Decidido:** aprobación registrada por `OPS` con número de acta, fecha y aprobador; la Junta decide fuera del sistema. **Pendiente:** confirmar nombres y personas por rol interno |
| 3 | Herramienta de BI para exploración | **Decidido:** la herramienta existente de Fedesoft (Power BI / Looker) sobre réplica de lectura. **Pendiente:** cuál es, licencias y quién la administra |
| 4 | ¿Se mantiene el pago por transferencia bancaria? | Sí durante la transición, con registro manual + soporte + conciliación; meta: minimizarlo |
| 5 | Lista de acciones con doble control | La de la sección 7; editable solo por `SA` |
| 6 | Soporte "ver como afiliado": ¿solo lectura o con acciones? | Solo lectura por defecto; acciones en nombre de con motivo y auditoría |
| 7 | Metas anuales del tablero de resultados: quién las define y cuándo | Dirección, en la revisión del hito H1; `DIR` las ajusta con doble control y auditoría — única excepción a su alcance de solo lectura (sección 2.2) |
| 8 | Profundidad de la migración inicial (padrón + cartera histórica: ¿cuántos años?) | Padrón completo + cartera de los últimos 2 años; histórico anterior como archivo |
| 9 | Opción A (paralelizar) u Opción B (extender) para absorber el alcance | **Decidido:** Opción A, re-calibración en H2 |
