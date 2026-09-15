# Catálogo de requerimientos — Portal Único del Afiliado

**Versión 0.1 · 15 de septiembre de 2026 · Estado: propuesto para aprobación antes de la Fase 1**

Catálogo único y trazable de lo que la plataforma debe hacer y cumplir. Deriva de `docs/base/01-arquitectura-plataforma.md` (qué), `docs/base/02-documento-base-desarrollo.md` (cómo) y `docs/01-consola-administracion.md` (operación interna). Cada requerimiento es **verificable**: si no se puede demostrar con una prueba o una demo, no es un requerimiento, es un deseo.

> **Anexo A** (al final) lista lo que **Fedesoft debe entregar, decidir o dar acceso** para que este catálogo sea ejecutable. Es la parte que se envía a la federación.

---

## 1. Cómo se lee

| Campo | Significado |
|---|---|
| **ID** | `RF` funcional · `RA` consola de administración · `RI` integración · `RD` datos · `RNF` no funcional. Estable: no se reutiliza ni se renumera |
| **Pri** | **M** imprescindible (sin esto no hay producto) · **S** importante (se entrega en su fase) · **C** deseable (backlog) |
| **Fase** | Fase del roadmap en que se entrega (`docs/00-plan-de-ejecucion.md`) |
| **Criterio de aceptación** | Condición observable que demuestra el cumplimiento |

**Reglas del catálogo**
- Un requerimiento nuevo o modificado que altere datos, seguridad o negocio exige **ADR** antes de implementarse.
- Ningún requerimiento puede violar los principios no negociables de `CLAUDE.md` (fuente única, autorización en servidor, idempotencia, propiedad del dato).
- La trazabilidad es: **requerimiento → historia → PR → pruebas → ADR**; la mantiene A9.

**Actores**: `Gerente` (contacto con permisos de facturación y perfil) · `Talento` (líder de talento humano) · `Contacto` (vista restringida) · `Público` (no autenticado) · `Sistema` (procesos automáticos) · roles internos según `docs/01-consola-administracion.md` §2.

---

## 2. Identidad y acceso (capa B)

| ID | Requerimiento | Pri | Fase | Criterio de aceptación |
|---|---|---|---|---|
| RF-IDE-001 | Inicio de sesión único mediante OIDC, con proveedor intercambiable | M | 1 | Un contacto autenticado accede al portal; cambiar de proveedor no exige cambiar reglas de autorización |
| RF-IDE-002 | Varios contactos por empresa, cada uno con su rol y permisos | M | 1 | Gerente y Talento ven menús y datos distintos con la misma empresa |
| RF-IDE-003 | Un usuario vinculado a más de una organización puede elegir con cuál opera | S | 1 | Selector de organización; el contexto activo se refleja en toda la sesión |
| RF-IDE-004 | La experiencia se adapta al rol del contacto y al segmento de la empresa desde el login | M | 1 | Una empresa grande ve el panel de cuenta estratégica; una MIPYME no |
| RF-IDE-005 | Autenticación de segundo factor: obligatoria para roles internos, disponible para gerentes | M | 1 | Un usuario interno sin MFA no puede operar; el gerente puede activarla |
| RF-IDE-006 | El gerente invita, activa y desactiva usuarios de su propia empresa | M | 1 | Invitación por correo con expiración; el desactivado pierde acceso de inmediato |
| RF-IDE-007 | Recuperación de acceso segura y con límite de intentos | M | 1 | Enlace de un solo uso con expiración; bloqueo tras N intentos |
| RF-IDE-008 | Cambiar privilegios invalida las sesiones activas del usuario afectado | M | 1 | Al quitar un rol, la siguiente petición de esa sesión es rechazada |
| RF-IDE-009 | El afiliado consulta sus sesiones activas y puede cerrarlas | C | 3 | Lista de sesiones con dispositivo y fecha; cierre remoto |

## 3. Módulo 1 · Perfil y afiliación (Eje 1)

| ID | Requerimiento | Pri | Fase | Criterio de aceptación |
|---|---|---|---|---|
| RF-AFI-001 | Solicitud de afiliación en línea con datos de la empresa, contactos y documentos soporte | M | 1 | La solicitud queda registrada con estado y número de radicado visible |
| RF-AFI-002 | NIT único y validado con dígito de verificación | M | 1 | Un NIT ya registrado es rechazado con mensaje claro; DV inválido no se acepta |
| RF-AFI-003 | El solicitante consulta el estado de su solicitud sin llamar ni escribir | M | 1 | Estados visibles: radicada, en validación, aprobada, rechazada, activada |
| RF-AFI-004 | Ficha de empresa editable por el gerente (datos, contacto, ubicación, sector, tamaño, servicios) | M | 1 | Los cambios se guardan y quedan auditados con autor y fecha |
| RF-AFI-005 | Gestión de contactos autorizados: alta, edición, baja y asignación de rol | M | 1 | El gerente administra contactos; un contacto puede existir sin usuario |
| RF-AFI-006 | Estado de afiliación siempre visible (al día, pendiente, vencida, suspendida) | M | 1 | El estado mostrado coincide con el núcleo en todo momento |
| RF-AFI-007 | Tipo de afiliación (activo/adherente) y segmento visibles y no editables por el afiliado | M | 1 | Solo Operaciones los modifica, con motivo y auditoría |
| RF-AFI-008 | Un dato actualizado en el perfil se refleja en el directorio y demás módulos sin doble digitación | M | 1 | Editar la razón social cambia la ficha del directorio sin acción adicional |
| RF-AFI-009 | Historial de afiliación consultable e inmutable | M | 1 | Cada transición registra estado anterior, nuevo, motivo, actor y fecha |
| RF-AFI-010 | Datos de facturación autogestionables por el gerente | M | 2 | El cambio aplica a las facturas siguientes, nunca a las ya emitidas |
| RF-AFI-011 | El afiliado descarga sus propios datos en formato abierto | S | 3 | Exportación en CSV/JSON con lo que la empresa registró |
| RF-AFI-012 | Solicitud de retiro voluntario desde el portal | S | 3 | Queda como solicitud para Operaciones, con motivo y confirmación |

## 4. Módulo 2 · Estado de cuenta y pago (Eje 1)

| ID | Requerimiento | Pri | Fase | Criterio de aceptación |
|---|---|---|---|---|
| RF-PAG-001 | Estado de cuenta en vivo: cargos, conceptos, vencimientos y saldo | M | 2 | Los importes coinciden con el núcleo; sin planillas externas |
| RF-PAG-002 | Histórico de pagos y facturas descargable | M | 2 | Cada pago enlaza su factura y su comprobante |
| RF-PAG-003 | Pago en línea con pasarela local desde el estado de cuenta | M | 2 | El gerente paga sin salir del portal ni escribir a nadie |
| RF-PAG-004 | Cada intento de pago crea un registro con clave de idempotencia | M | 2 | Dos envíos del mismo intento no generan dos cobros |
| RF-PAG-005 | La confirmación del pago es **servidor a servidor** por webhook firmado | M | 2 | Manipular la respuesta del navegador no marca el pago como exitoso |
| RF-PAG-006 | Un webhook repetido no aplica el pago más de una vez | M | 2 | Reenviar el mismo evento 5 veces deja un único pago aplicado |
| RF-PAG-007 | Un webhook con firma inválida o fuera de ventana se rechaza y se registra | M | 2 | Firma alterada → 4xx y evento de seguridad |
| RF-PAG-008 | Al aprobarse el pago, el estado de afiliación se actualiza según la regla vigente | M | 2 | La empresa queda "al día" y se habilitan certificado y sello |
| RF-PAG-009 | Notificación al afiliado de pago aprobado o rechazado | M | 2 | Correo con plantilla versionada y enlace a la factura |
| RF-PAG-010 | Recordatorios de vencimiento parametrizables (días antes y después) | S | 2 | Cambiar el parámetro cambia el envío sin desplegar código |
| RF-PAG-011 | Conciliación automática diaria contra el proveedor, con reporte de diferencias | M | 2 | Pagos sin cargo, cargos sin pago y diferencias quedan en una bandeja |
| RF-PAG-012 | Registro de pago por transferencia bancaria con soporte adjunto (desde la consola) | M | 2 | Operación registra el pago; el estado se actualiza igual que en pago en línea |
| RF-PAG-013 | Pago de varios cargos en una sola transacción | S | 2 | El afiliado selecciona cargos y paga el total; la aplicación es proporcional y trazable |

## 5. Facturación electrónica DIAN

| ID | Requerimiento | Pri | Fase | Criterio de aceptación |
|---|---|---|---|---|
| RF-FAC-001 | Emisión automática de factura electrónica al aprobarse el pago | M | 2 | Sin intervención humana; la emisión no bloquea la respuesta del webhook |
| RF-FAC-002 | Persistir número, CUFE, estado, XML y PDF, y la respuesta cruda del proveedor | M | 2 | Los artefactos se recuperan desde la consola y desde el portal |
| RF-FAC-003 | Reintento automático con espera creciente ante fallo del facturador | M | 2 | Un fallo transitorio se resuelve solo; los intentos quedan registrados |
| RF-FAC-004 | Agotados los reintentos, la factura entra en cola de atención con alerta | M | 2 | Aparece en bandeja de Cartera con el error del proveedor |
| RF-FAC-005 | Un fallo de facturación nunca pierde ni revierte el pago conciliado | M | 2 | Con el facturador caído, el pago queda aplicado y la factura pendiente |
| RF-FAC-006 | Rechazo de la DIAN visible, explicado y corregible desde la consola | M | 2 | Se corrige el dato y se reemite conservando trazabilidad |
| RF-FAC-007 | Emisión de nota crédito o anulación desde la consola, con motivo | M | 2 | Queda enlazada a la factura original y auditada |
| RF-FAC-008 | El afiliado descarga su factura (PDF y XML) desde el portal | M | 2 | Descarga con URL firmada y expiración |

## 6. Módulo 3 · Certificado y sello (Eje 1)

| ID | Requerimiento | Pri | Fase | Criterio de aceptación |
|---|---|---|---|---|
| RF-CER-001 | Descarga instantánea del certificado de afiliación si la empresa está al día | M | 2 | Un clic, sin intervención del equipo, 24/7 |
| RF-CER-002 | Si no está al día, el certificado no se emite y se explica qué falta | M | 2 | Mensaje con el saldo pendiente y acceso directo al pago |
| RF-CER-003 | Cada certificado lleva folio único y una copia del estado al momento de emitirlo | M | 2 | Folio secuencial por año, sin huecos ni duplicados |
| RF-CER-004 | Verificación pública del certificado por folio o código QR | M | 2 | Un tercero valida vigencia y titular sin iniciar sesión ni ver datos de más |
| RF-CER-005 | El certificado se revoca al perder la empresa el estado que lo habilitó | M | 2 | La verificación pública pasa a "no vigente" con la fecha del cambio |
| RF-CER-006 | Emisión manual excepcional desde la consola, con motivo y doble control | S | 2 | Queda marcada como excepción en la auditoría |
| RF-CER-007 | Descarga del sello #SoyAfiliadoFedesoft en variantes de uso | M | 2 | Disponible solo con afiliación vigente |
| RF-CER-008 | Plantilla del certificado versionada y editable sin desplegar código | S | 2 | Cambiar la plantilla no altera los certificados ya emitidos |

## 7. Módulo 4 · Formación — TrainingLAB y TIC Talks (Eje 1)

| ID | Requerimiento | Pri | Fase | Criterio de aceptación |
|---|---|---|---|---|
| RF-FOR-001 | Catálogo único de cursos, TIC Talks y sesiones informativas | M | 3 | Reemplaza los formularios externos dispersos |
| RF-FOR-002 | Inscripción de un clic para el contacto autorizado | M | 3 | Sin formularios externos ni confirmación manual |
| RF-FOR-003 | Control de cupos con lista de espera | M | 3 | Superado el cupo, la inscripción entra en espera y se avisa al liberarse |
| RF-FOR-004 | No se admiten inscripciones duplicadas | M | 3 | El segundo intento del mismo contacto es rechazado con mensaje claro |
| RF-FOR-005 | Nadie puede inscribir a personas de otra organización | M | 3 | Intento entre empresas rechazado por el servidor y registrado |
| RF-FOR-006 | Catálogo y elegibilidad filtrados por tipo de afiliación y rol | M | 3 | Talento ve la oferta que le corresponde; el resto no aparece |
| RF-FOR-007 | Historial de formación por empresa y por contacto | M | 3 | La empresa sabe quién de su equipo participó y en qué |
| RF-FOR-008 | Calendario de las sesiones inscritas, exportable | S | 3 | Exportación ICS o recordatorio por correo |
| RF-FOR-009 | Acceso a grabaciones y materiales en el mismo lugar | M | 3 | Disponibles para los inscritos según reglas de acceso |
| RF-FOR-010 | Registro de asistencia, manual o importada | M | 3 | La asistencia queda asociada a empresa y contacto |
| RF-FOR-011 | Recordatorios automáticos antes de la sesión | S | 3 | Parametrizables por tipo de actividad |
| RF-FOR-012 | Constancia de participación descargable | C | 3 | Con folio y validación, si la actividad lo define |

## 8. Módulo 5 · Comunidades (Eje 1)

| ID | Requerimiento | Pri | Fase | Criterio de aceptación |
|---|---|---|---|---|
| RF-CMD-001 | Listado de comunidades a las que el contacto puede pertenecer según su rol y perfil | M | 3 | El filtro ocurre en el servidor, no ocultando botones |
| RF-CMD-002 | Inscripción directa con control de cupos | M | 3 | Sin formularios independientes por comunidad |
| RF-CMD-003 | Aprobación previa cuando la comunidad lo exige | S | 3 | Estado "solicitada" visible; Talento aprueba o rechaza con motivo |
| RF-CMD-004 | Acceso a sesiones, agenda y materiales de la comunidad | M | 3 | Solo para participantes activos |
| RF-CMD-005 | La participación queda registrada contra el perfil de la empresa | M | 3 | Aparece en la ficha 360 y en el historial |
| RF-CMD-006 | Baja voluntaria de la comunidad | S | 3 | El contacto se retira y deja de recibir comunicaciones de esa comunidad |

## 9. Módulo 6 · Directorio, visibilidad e insights (Eje 1)

| ID | Requerimiento | Pri | Fase | Criterio de aceptación |
|---|---|---|---|---|
| RF-DIR-001 | Ficha del afiliado en el directorio alimentada por el perfil del núcleo | M | 3 | Sin carga aparte ni doble digitación |
| RF-DIR-002 | La marca "verificado" deriva del estado real de afiliación | M | 3 | Una empresa no vigente pierde la marca automáticamente |
| RF-DIR-003 | Búsqueda y filtros del directorio (sector, región, tamaño, servicios) | M | 3 | Resultados consistentes y paginados |
| RF-DIR-004 | La empresa controla qué datos son públicos en su ficha | M | 3 | Campos con visibilidad configurable; datos personales protegidos |
| RF-DIR-005 | Publicación de ofertas #AfiliadosFedesoft con vigencia | S | 3 | La oferta expira sola en la fecha definida |
| RF-DIR-006 | Moderación de ofertas antes de publicarse | S | 3 | Comunicaciones aprueba o rechaza con motivo |
| RF-DIR-007 | Insights sectoriales y revenue por empleado según tipo de afiliación | M | 3 | El contenido servido depende del derecho de acceso, validado en servidor |
| RF-DIR-008 | Reportes e indicadores descargables | S | 3 | Con registro de quién descargó qué |
| RF-DIR-009 | API pública de solo lectura del directorio para el sitio institucional | S | 3 | Sin datos personales; con límite de tasa y caché |

## 10. Módulo 7 · Verticales sectoriales (Eje 2)

| ID | Requerimiento | Pri | Fase | Criterio de aceptación |
|---|---|---|---|---|
| RF-VER-001 | El afiliado ve las verticales en las que participa | M | 4 | Salud, Financiera, Educación, Seguridad Digital y las que se creen |
| RF-VER-002 | Agenda de mesas de trabajo con fecha, lugar y tema | M | 4 | Visible para los participantes de esa vertical |
| RF-VER-003 | Repositorio de documentos de trabajo y actas por vertical | M | 4 | Acceso restringido a participantes; descargas auditadas |
| RF-VER-004 | Registro de participación por empresa y contacto | M | 4 | Alimenta la ficha 360 y el panel de relacionamiento |
| RF-VER-005 | Solicitud de vinculación a una vertical | S | 4 | El equipo aprueba; el afiliado ve el estado |
| RF-VER-006 | Directorio de contactos de la vertical sujeto a consentimiento | C | 4 | Solo contactos que autorizaron compartir sus datos |

## 11. Módulo 8 · Proyectos e internacionalización — Cenisoft (Eje 2)

| ID | Requerimiento | Pri | Fase | Criterio de aceptación |
|---|---|---|---|---|
| RF-OPO-001 | Tablero de oportunidades y convocatorias filtrado por el perfil de la empresa | M | 4 | Reemplaza los formularios de convocatoria sueltos |
| RF-OPO-002 | Detalle con requisitos, fechas, entidad y estado | M | 4 | Información suficiente para decidir sin escribir al equipo |
| RF-OPO-003 | Postulación en línea con adjuntos | M | 4 | Confirmación inmediata y radicado |
| RF-OPO-004 | Seguimiento del estado de la postulación | M | 4 | Estados explícitos hasta el cierre, con notificación de cambios |
| RF-OPO-005 | Aviso de nuevas oportunidades aplicables al perfil | S | 4 | Notificación según preferencias del contacto |
| RF-OPO-006 | Programas de internacionalización y encadenamiento en el mismo tablero | S | 4 | Mismo flujo de postulación y seguimiento |

## 12. Módulo 9 · Cuenta estratégica — KAM (Eje 2)

| ID | Requerimiento | Pri | Fase | Criterio de aceptación |
|---|---|---|---|---|
| RF-KAM-001 | El panel de cuenta estratégica se activa solo para las empresas segmentadas como tales | M | 4 | Una MIPYME no puede acceder ni por URL directa |
| RF-KAM-002 | La empresa ve su KAM asignado y un canal directo de contacto | M | 4 | Nombre, medio de contacto y tiempo de respuesta esperado |
| RF-KAM-003 | El panel consolida formación, verticales, proyectos y estado desde los dominios originales | M | 4 | Sin tablas paralelas: los datos se leen de su dominio |
| RF-KAM-004 | El KAM registra interacciones y planes de acción con seguimiento | M | 4 | Con responsable y fecha; las acciones vencidas se alertan |
| RF-KAM-005 | Un KAM solo accede a las empresas que tiene asignadas | M | 4 | Acceso a una empresa no asignada rechazado y registrado |

## 13. Notificaciones y comunicaciones

| ID | Requerimiento | Pri | Fase | Criterio de aceptación |
|---|---|---|---|---|
| RF-NOT-001 | Correos transaccionales con plantillas versionadas y variables tipadas | M | 1 | Vista previa y envío de prueba antes de publicar la plantilla |
| RF-NOT-002 | Preferencias de notificación por contacto | S | 3 | El contacto elige qué recibe, salvo avisos obligatorios |
| RF-NOT-003 | Lista de supresión, rebotes y reintentos | M | 2 | Nunca se envía a una dirección suprimida |
| RF-NOT-004 | Registro de entregas consultable desde la consola | M | 2 | Estado por envío con motivo de fallo |
| RF-NOT-005 | Campañas segmentadas por estado, segmento, rol o vertical | S | 3 | Segmento calculado desde el núcleo, no desde listas manuales |

---

## 14. Consola de administración

Detalle completo en `docs/01-consola-administracion.md`. Aquí van los requerimientos verificables.

### 14.1 Acceso y control interno

| ID | Requerimiento | Pri | Fase | Criterio de aceptación |
|---|---|---|---|---|
| RA-ACC-001 | La consola es una aplicación separada, en dominio propio y no indexable (ADR-005) | M | 0 | `robots` bloqueado; el portal público no contiene código de administración |
| RA-ACC-002 | Segundo factor obligatorio para todo usuario interno | M | 0 | Sin MFA no se completa el acceso |
| RA-ACC-003 | Roles internos con permisos por recurso y acción, editables por el Super Admin | M | 1 | Matriz de `docs/01-consola-administracion.md` §2.2 aplicada en servidor |
| RA-ACC-004 | Alcance por asignación: el KAM solo ve sus empresas; cada área solo su ámbito | M | 4 | Acceso fuera del alcance rechazado y registrado |
| RA-ACC-005 | Doble control en acciones críticas (roles, tarifas, anulaciones, emisión manual, exportación total) | M | 2 | La acción queda pendiente hasta que un segundo autorizado la aprueba |
| RA-ACC-006 | Reautenticación antes de ejecutar una acción crítica | M | 2 | Se solicita credencial aunque la sesión esté activa |
| RA-ACC-007 | Sesiones internas cortas, con cierre por inactividad | M | 0 | Expiración y cierre forzado desde la consola |
| RA-ACC-008 | Siempre existen al menos dos cuentas Super Admin y ninguna puede autodegradarse | M | 1 | Quitar el último Super Admin es rechazado |

### 14.2 Parametrización sin código

| ID | Requerimiento | Pri | Fase | Criterio de aceptación |
|---|---|---|---|---|
| RA-PAR-001 | Catálogos maestros administrables (tipos, tamaños, segmentos, sectores, motivos, conceptos) | M | 1 | Alta, edición, activación y orden sin desplegar |
| RA-PAR-002 | Tarifas por tipo de afiliación, tamaño y año, con vigencia y prorrateo | M | 2 | Cambiar la tarifa afecta cargos futuros, nunca los ya pagados |
| RA-PAR-003 | Regla de "al día" parametrizable (conceptos, gracia, umbrales, transiciones) | M | 2 | Cambiar la gracia altera el estado de las empresas afectadas de forma auditable |
| RA-PAR-004 | Reglas de elegibilidad por módulo (certificado, comunidades, insights, oportunidades) | M | 3 | El cambio se refleja en lo que ve el afiliado sin desplegar |
| RA-PAR-005 | Cupos, listas de espera y políticas de cancelación configurables | S | 3 | Por curso y por comunidad |
| RA-PAR-006 | Numeración y folios configurables con reinicio anual | M | 2 | Sin duplicados ni huecos; cambio auditado |
| RA-PAR-007 | Todo parámetro tiene alcance, vigencia, versión, autor y motivo | M | 0 | Historial consultable de cada parámetro |
| RA-PAR-008 | Plantillas de documentos y correos versionadas, con vista previa y envío de prueba | M | 2 | Publicar una versión no altera lo ya emitido |
| RA-PAR-009 | Interruptores de funcionalidad por segmento, empresa o porcentaje (pilotos) | S | 0 | Activar un módulo para un grupo sin desplegar |
| RA-PAR-010 | Configuración de proveedores por entorno, sin exponer secretos en pantalla | M | 2 | Solo referencias; el valor nunca se muestra ni se registra |

### 14.3 Gestión operativa

| ID | Requerimiento | Pri | Fase | Criterio de aceptación |
|---|---|---|---|---|
| RA-OPS-001 | Ficha 360 de la empresa: perfil, contactos, afiliación, cartera, facturas, certificados, formación, comunidades, verticales, oportunidades, KAM y auditoría | M | 1 | Todo en una pantalla, leyendo de los dominios originales |
| RA-OPS-002 | Bandeja de solicitudes de afiliación con aprobación registrada por acta | M | 1 | Número de acta, fecha y aprobador obligatorios al aprobar |
| RA-OPS-003 | Cambio de estado de afiliación con motivo obligatorio y efectos automáticos | M | 1 | Suspender bloquea beneficios y notifica; todo queda auditado |
| RA-OPS-004 | Fusión de empresas duplicadas conservando historial | S | 1 | Una sola ficha resultante; el historial de ambas se preserva |
| RA-OPS-005 | Generación masiva de cargos por tarifa y periodo | M | 2 | Previsualización antes de ejecutar; ejecución idempotente |
| RA-OPS-006 | Bandeja de conciliación con cierre diario y mensual | M | 2 | Diferencias identificadas y resueltas con trazabilidad |
| RA-OPS-007 | Anulación y ajuste de cargos o pagos con motivo y doble control | M | 2 | Nunca se recalcula un cargo pagado; se ajusta con documento nuevo |
| RA-OPS-008 | Monitor de facturación: cola, reintentos, rechazos y cola de atención | M | 2 | El operador reintenta o corrige sin pedir ayuda a desarrollo |
| RA-OPS-009 | Administración de la oferta de formación y comunidades (alta, cupos, asistencia, materiales) | M | 3 | Talento opera sin intervención técnica |
| RA-OPS-010 | Moderación del directorio y de las ofertas | S | 3 | Aprobar, rechazar u ocultar con motivo |
| RA-OPS-011 | Administración de verticales, oportunidades y asignación de KAM | M | 4 | Publicación con segmentación por perfil |
| RA-OPS-012 | Soporte controlado: ver el portal como el afiliado, en solo lectura por defecto | M | 5 | Aviso visible, expiración, auditoría y registro visible para el afiliado |
| RA-OPS-013 | Acciones en nombre del afiliado con motivo obligatorio | S | 5 | Diferenciadas en la auditoría de las hechas por el propio afiliado |
| RA-OPS-014 | Monitor técnico: colas, webhooks fallidos, salud de proveedores y modo mantenimiento | M | 2 | Reproceso de un webhook desde la consola, sin exponer secretos |

### 14.4 Analítica, tableros y resultados

| ID | Requerimiento | Pri | Fase | Criterio de aceptación |
|---|---|---|---|---|
| RA-BI-001 | La analítica es una proyección derivada de solo lectura; ningún módulo mantiene tablas paralelas de reporte | M | 0 | No existe escritura analítica desde la consola |
| RA-BI-002 | Diccionario de métricas versionado (definición, fórmula, fuente, dueño) | M | 0 | Un KPI tiene un único valor en toda la organización |
| RA-BI-003 | Tablero de Operaciones: bandeja, tiempos de activación, padrón por estado, tasa de autoservicio | M | 1 | Cifras reproducibles contra el detalle |
| RA-BI-004 | Tablero de Cartera: recaudo, antigüedad de cartera, conciliación, facturas con problema | M | 2 | Comparable con la contabilidad de Fedesoft |
| RA-BI-005 | Tableros de formación, comunidades y visibilidad | S | 3 | Ocupación, asistencia y participación por empresa |
| RA-BI-006 | Tablero de relacionamiento: verticales, oportunidades y salud de cuentas estratégicas | S | 4 | Acciones vencidas y baja participación destacadas |
| RA-BI-007 | Tablero de dirección con metas anuales y avance | M | 5 | Metas configurables; comparación con el año anterior |
| RA-BI-008 | Segmentación por tipo, tamaño, sector, región y periodo en todos los tableros | M | 1 | Mismo filtro disponible de forma consistente |
| RA-BI-009 | Exportación de datos y reportes según permiso, con registro de la descarga | M | 2 | Quién exportó qué y cuándo |
| RA-BI-010 | Los tableros agregados no exponen datos personales; el detalle exige permiso | M | 1 | Agregados sin identificadores personales |
| RA-BI-011 | Réplica de lectura disponible para la herramienta de BI de Fedesoft | S | 5 | Conexión sin afectar el rendimiento transaccional |
| RA-BI-012 | Reporte mensual para Junta Directiva generado desde el diccionario de métricas | S | 5 | Generación programada y envío por correo |

---

## 15. Integraciones

| ID | Requerimiento | Pri | Fase | Criterio de aceptación |
|---|---|---|---|---|
| RI-001 | Toda integración externa se consume mediante un contrato propio (port); el dominio nunca importa el SDK del proveedor | M | 0 | Una búsqueda de `wompi`, `epayco`, `siigo` o `alegra` en el dominio no arroja resultados |
| RI-002 | Pasarela de pago: crear pago, verificar webhook, consultar estado y devolución si aplica | M | 2 | Implementada contra sandbox; idempotente |
| RI-003 | Facturador electrónico: emitir, consultar estado y descargar artefactos | M | 2 | CUFE y respuesta del proveedor persistidos |
| RI-004 | Correo: envío por plantilla, estado de entrega, reintentos y supresión | M | 1 | Entregas y fallos consultables |
| RI-005 | Almacenamiento de archivos con URL firmada y expiración | M | 2 | Ningún archivo privado accesible sin firma |
| RI-006 | Proveedor de identidad OIDC intercambiable | M | 1 | Cambiar de proveedor no cambia reglas de autorización |
| RI-007 | Cada integración cuenta con un doble de pruebas contractual y casos negativos versionados | M | 2 | CI corre sin credenciales reales, cubriendo firma inválida y reenvío |
| RI-008 | Entornos de pruebas y producción de cada proveedor completamente separados | M | 2 | Credenciales por entorno; imposible operar producción desde pruebas |
| RI-009 | Exportación de calendario (ICS) para sesiones y mesas | C | 3 | Archivo válido en los clientes de calendario más usados |
| RI-010 | Salud de cada integración visible, con alerta al degradarse | M | 2 | Último error y latencia por proveedor |

## 16. Datos, migración y ciclo de vida

| ID | Requerimiento | Pri | Fase | Criterio de aceptación |
|---|---|---|---|---|
| RD-001 | Una sola base de datos relacional como fuente de verdad del afiliado | M | 0 | Ningún módulo con su propio almacén de empresa, contacto o afiliación |
| RD-002 | Aislamiento por empresa en toda consulta, repositorio y prueba | M | 1 | Suite automática que falla si un dato cruza entre empresas |
| RD-003 | Auditoría de acciones sensibles, solo de adición, con actor, contexto y antes/después | M | 1 | No editable desde ninguna interfaz |
| RD-004 | Importación del padrón actual con validación, previsualización y ejecución idempotente | M | 1 | Repetir la importación no duplica empresas ni contactos |
| RD-005 | Importación de la cartera con corte histórico definido | M | 5 | Saldos migrados cuadran contra la contabilidad |
| RD-006 | Reporte de calidad de datos de cada importación | M | 1 | Filas rechazadas con motivo y archivo de corrección |
| RD-007 | Exportación completa por dominio en formato abierto | M | 3 | Fedesoft puede llevarse todos sus datos sin intervención del proveedor |
| RD-008 | Atención de solicitudes de datos personales (acceso, rectificación, supresión) | M | 5 | Flujo trazable con plazos, según Ley 1581 de 2012 |
| RD-009 | Política de retención por tipo de dato, parametrizable | S | 5 | Auditoría, archivos y datos personales con plazos definidos |
| RD-010 | Datos de prueba sintéticos; nunca copias crudas de producción fuera de producción | M | 0 | Semillas generadas, sin datos reales |
| RD-011 | Respaldos cifrados automáticos y ensayo de restauración documentado | M | 5 | Restauración probada antes de salir a producción |
| RD-012 | Migraciones solo hacia adelante; cambios destructivos en dos etapas | M | 0 | Ninguna migración irreversible en el mismo despliegue que la usa |

## 17. Requerimientos no funcionales

### 17.1 Seguridad

| ID | Requerimiento | Pri | Fase | Criterio de aceptación |
|---|---|---|---|---|
| RNF-SEG-001 | Autorización en el servidor en cada punto de acceso y acción, denegando por defecto | M | 1 | Ocultar un botón nunca es el control; probado con peticiones directas |
| RNF-SEG-002 | Cifrado en tránsito y en reposo, incluidos respaldos | M | 0 | TLS obligatorio; discos y copias cifrados |
| RNF-SEG-003 | Secretos fuera del repositorio, rotables y por entorno | M | 0 | Escaneo de secretos en integración continua sin hallazgos |
| RNF-SEG-004 | Webhooks con verificación de firma, protección contra reenvío e idempotencia | M | 2 | Firma alterada y reenvío cubiertos por pruebas |
| RNF-SEG-005 | Límite de tasa y protección frente a abuso en acceso, recuperación, pagos y puntos públicos | M | 1 | Umbrales configurables y eventos de seguridad |
| RNF-SEG-006 | Validación de toda entrada por esquema y consultas parametrizadas | M | 1 | Sin concatenación de consultas; entradas inválidas rechazadas |
| RNF-SEG-007 | Protección frente a inyección de contenido y falsificación de peticiones | M | 1 | Política de contenido activa; tokens de formulario verificados |
| RNF-SEG-008 | Análisis de código, dependencias y secretos en cada integración | M | 0 | La integración falla ante un hallazgo crítico |
| RNF-SEG-009 | Prueba de intrusión antes de producción, con remediación de hallazgos críticos y altos | M | 5 | Informe y cierre de hallazgos documentados |
| RNF-SEG-010 | Registros sin datos personales innecesarios ni secretos | M | 0 | Revisión automatizada de patrones sensibles |
| RNF-SEG-011 | Archivos cargados verificados por tipo, tamaño y contenido | S | 3 | Rechazo de archivos no permitidos |
| RNF-SEG-012 | Guía de ingeniería alineada con OWASP ASVS y Top 10 | M | 0 | Lista de control aplicada en revisión de seguridad |

### 17.2 Cumplimiento

| ID | Requerimiento | Pri | Fase | Criterio de aceptación |
|---|---|---|---|---|
| RNF-CUM-001 | Facturación electrónica validada ante la DIAN con CUFE en formato UBL 2.1 | M | 2 | Facturas aceptadas en el entorno de pruebas del facturador homologado |
| RNF-CUM-002 | Tratamiento de datos personales conforme a la Ley 1581 de 2012 | M | 5 | Política publicada, consentimientos registrados, derechos atendibles |
| RNF-CUM-003 | Consentimiento explícito y trazable donde se comparten datos de contacto | M | 4 | Registro de quién consintió, cuándo y para qué |
| RNF-CUM-004 | Conservación de documentos fiscales según la norma contable aplicable | M | 5 | Plazos parametrizados y respaldados |
| RNF-CUM-005 | Fedesoft es propietaria de los datos y puede exportarlos en cualquier momento | M | 3 | Exportación completa sin depender del proveedor |
| RNF-CUM-006 | Términos de uso y política de privacidad aceptados y versionados | S | 3 | Se registra qué versión aceptó cada usuario |

### 17.3 Rendimiento, disponibilidad y continuidad

| ID | Requerimiento | Pri | Fase | Criterio de aceptación |
|---|---|---|---|---|
| RNF-DIS-001 | Disponibilidad objetivo del 99,5 % mensual en horario hábil colombiano | M | 5 | Medida desde monitoreo externo |
| RNF-DIS-002 | Respuesta por debajo de 500 ms (p95) en los puntos críticos de consulta | S | 5 | Medido en ambiente de preproducción con datos representativos |
| RNF-DIS-003 | El portal soporta la carga de la temporada de renovación sin degradarse | M | 5 | Prueba de carga con el pico estimado de empresas |
| RNF-DIS-004 | Objetivo de pérdida de datos de 1 hora y de recuperación de 4 horas | M | 5 | Demostrado en el ensayo de restauración |
| RNF-DIS-005 | Los procesos asíncronos se recuperan tras una caída sin perder eventos | M | 2 | Apagar el procesador y reanudar no pierde ni duplica efectos |
| RNF-DIS-006 | Modo de mantenimiento con aviso al afiliado | S | 5 | Activable sin desplegar |

### 17.4 Usabilidad y accesibilidad

| ID | Requerimiento | Pri | Fase | Criterio de aceptación |
|---|---|---|---|---|
| RNF-USA-001 | Accesibilidad WCAG 2.1 nivel AA en portal y consola | M | 0 | Auditoría automática y revisión manual de teclado y foco |
| RNF-USA-002 | Diseño adaptable, verificado desde 360 px | M | 0 | Sin desplazamiento horizontal ni contenido cortado |
| RNF-USA-003 | Toda pantalla resuelve sus estados de carga, vacío, error y sin permiso | M | 0 | Revisión por pantalla en la definición de terminado |
| RNF-USA-004 | Interfaz y mensajes en español claro, sin jerga técnica interna | M | 0 | Ningún término de implementación visible al afiliado |
| RNF-USA-005 | Identidad visual de Fedesoft aplicada de forma consistente | M | 0 | Tokens de `docs/design/identidad-visual.md`; sin colores sueltos |
| RNF-USA-006 | Los errores explican qué pasó y cómo resolverlo | M | 0 | Sin mensajes genéricos ni códigos sin contexto |
| RNF-USA-007 | Un trámite del Eje 1 se completa sin intervención humana | M | 3 | Medido por la tasa de autoservicio por tipo de trámite |

### 17.5 Observabilidad y operación

| ID | Requerimiento | Pri | Fase | Criterio de aceptación |
|---|---|---|---|---|
| RNF-OBS-001 | Identificador de correlación de extremo a extremo (portal, servicios y procesos) | M | 0 | Un recorrido se reconstruye completo desde un solo identificador |
| RNF-OBS-002 | Registros estructurados y centralizados | M | 0 | Búsqueda por empresa, usuario y recorrido |
| RNF-OBS-003 | Métricas de pagos, facturación, procesos fallidos, latencia, errores y acceso | M | 2 | Visibles en tablero técnico |
| RNF-OBS-004 | Alertas accionables, cada una con procedimiento y responsable | M | 2 | Sin alertas sin procedimiento asociado |
| RNF-OBS-005 | Verificación de salud por aplicación y dependencia | M | 0 | Punto de salud consultado por el despliegue |
| RNF-OBS-006 | Trazas distribuidas de las llamadas a proveedores externos | S | 2 | Latencia y errores por proveedor |

### 17.6 Mantenibilidad, portabilidad y calidad

| ID | Requerimiento | Pri | Fase | Criterio de aceptación |
|---|---|---|---|---|
| RNF-MAN-001 | Arquitectura de monolito modular con límites de dominio explícitos | M | 0 | Revisión estructural en cada integración de código |
| RNF-MAN-002 | Efectos asíncronos críticos publicados de forma transaccional y consumidos de forma idempotente | M | 2 | Ningún evento perdido ni aplicado dos veces |
| RNF-MAN-003 | Interfaz documentada y versionada | M | 0 | Documentación generada y publicada por integración continua |
| RNF-MAN-004 | Ambientes reproducibles en cualquier equipo con un solo comando | M | 0 | Entorno local completo levantado sin pasos manuales |
| RNF-MAN-005 | Pruebas proporcionales al riesgo: unitarias del dominio, de integración, de contrato y de recorrido | M | 0 | Ninguna integración de código con la suite en rojo |
| RNF-MAN-006 | Independencia de proveedor: cambiar pasarela, facturador o identidad no altera el dominio | M | 2 | Demostrado con el doble de pruebas de cada contrato |
| RNF-MAN-007 | Despliegue automatizado con reversión conocida y separada de la de datos | M | 0 | Procedimiento de reversión probado |
| RNF-MAN-008 | Toda decisión estructural registrada antes de implementarse | M | 0 | Cada cambio estructural enlaza su decisión |

---

## 18. Restricciones y supuestos

| # | Restricción o supuesto |
|---|---|
| 1 | La facturación electrónica debe resolverse con un facturador homologado en Colombia; ninguna plataforma internacional factura ante la DIAN por sí sola. Un escenario que no lo resuelva queda descartado |
| 2 | La pasarela de pago debe ser local y operar en pesos colombianos |
| 3 | El sitio institucional permanece en su plataforma actual; el portal absorbe la zona de afiliados, afiliaciones, pagos y directorio (ADR-004) |
| 4 | La aprobación de afiliación la decide la Junta Directiva fuera del sistema; el portal registra la decisión con número de acta |
| 5 | La transferencia bancaria sigue siendo un medio de pago válido durante la transición, con registro y conciliación manual |
| 6 | El desarrollo se hace con datos sintéticos hasta que exista un ambiente de preproducción con datos migrados y controlados |
| 7 | Los objetivos de servicio se miden desde preproducción antes de fijarse como compromiso |

## 19. Fuera de alcance (backlog posterior)

Programas de talento (Talentsoft, Creadores TI, conexión con universidades) · gestor de contenidos del sitio institucional · aplicación móvil nativa · facturación a terceros no afiliados · pasarela de pagos propia · firma electrónica avanzada de documentos · integración contable bidireccional.

## 20. Trazabilidad por fase

| Fase | Requerimientos que se cierran |
|---|---|
| **0 · Fundación** | RA-ACC-001/002/007 · RA-PAR-007/009 · RA-BI-001/002 · RI-001 · RD-001/010/012 · RNF-SEG-002/003/008/010/012 · RNF-USA-001..006 · RNF-OBS-001/002/005 · RNF-MAN-001/003/004/005/007/008 |
| **1 · Núcleo e identidad** | RF-IDE-001..008 · RF-AFI-001..009 · RF-NOT-001 · RA-ACC-003/008 · RA-PAR-001 · RA-OPS-001..004 · RA-BI-003/008/010 · RI-004/006 · RD-002/003/004/006 · RNF-SEG-001/005/006/007 |
| **2 · Dinero y documentos** | RF-PAG-001..013 · RF-FAC-001..008 · RF-CER-001..008 · RF-AFI-010 · RF-NOT-003/004 · RA-ACC-005/006 · RA-PAR-002/003/006/008/010 · RA-OPS-005..008/014 · RA-BI-004/009 · RI-002/003/005/007/008/010 · RNF-SEG-004 · RNF-CUM-001 · RNF-DIS-005 · RNF-OBS-003/004/006 · RNF-MAN-002/006 |
| **3 · Autoservicio ampliado** | RF-FOR-001..012 · RF-CMD-001..006 · RF-DIR-001..009 · RF-AFI-011/012 · RF-NOT-002/005 · RA-PAR-004/005 · RA-OPS-009/010 · RA-BI-005 · RI-009 · RD-007 · RNF-SEG-011 · RNF-CUM-005/006 · RNF-USA-007 |
| **4 · Alto contacto** | RF-VER-001..006 · RF-OPO-001..006 · RF-KAM-001..005 · RA-ACC-004 · RA-OPS-011 · RA-BI-006 · RNF-CUM-003 |
| **5 · Hardening y salida** | RA-OPS-012/013 · RA-BI-007/011/012 · RD-005/008/009/011 · RNF-SEG-009 · RNF-CUM-002/004 · RNF-DIS-001..004/006 |

---

# Anexo A · Requerimientos hacia Fedesoft

Lo que la federación debe **entregar, decidir, autorizar o dar acceso** para que el catálogo anterior sea ejecutable. Cada punto indica **quién responde**, **para cuándo**, **qué bloquea** y **qué hacemos si no llega a tiempo**, de modo que ningún pendiente detenga el desarrollo en silencio.

**Semana de referencia:** S1 es la semana en que se aprueba el plan. Nada de este anexo bloquea la Fase 0.

## A.1 Decisiones de negocio

| ID | Requerimiento | Responde | Límite | Bloquea | Si no llega |
|---|---|---|---|---|---|
| RQ-FED-001 | **Aprobación del plan de ejecución** y de este catálogo | Presidencia Ejecutiva + Cenisoft | S1 | El arranque | No se inicia la Iteración 0 |
| RQ-FED-002 | **Reglas de cartera y de "al día"**: qué conceptos cuentan, días de gracia, vigencia de la afiliación, prorrateo por mes de ingreso, cuándo un pago deja al día | Financiera | S5 | RF-PAG-008, RA-PAR-003 | Se implementa con la propuesta por defecto, parametrizada; ajustarla después no cuesta desarrollo |
| RQ-FED-003 | **Tabla de tarifas vigente** por tipo de afiliación y tamaño de empresa, con su periodicidad | Financiera | S5 | RA-PAR-002 | Se carga una tabla de ejemplo; el dato real se parametriza sin desplegar |
| RQ-FED-004 | **Pasarela de pago**: confirmación de Wompi (Bancolombia) o ePayco, y modelo de conciliación | Financiera | S5 | RF-PAG-003, RI-002 | Se desarrolla contra el doble de pruebas; conectar el proveedor real es configuración |
| RQ-FED-005 | **Facturador electrónico homologado**: Siigo, Alegra u otro, con su plan y costo por documento | Contabilidad | S6 | RF-FAC-001, RI-003 | Se desarrolla contra el doble de pruebas contractual |
| RQ-FED-006 | **Formato legal del certificado y del sello**: texto, firma, vigencia, reglas de folio, revocación y verificación pública | Jurídica + Comunicaciones | S7 | RF-CER-003/004/008 | Se emite con plantilla provisional; la definitiva es un cambio de plantilla |
| RQ-FED-007 | **Criterio de segmentación** empresa grande vs. MIPYME y definición de cuenta estratégica | Presidencia Ejecutiva | S2 | RF-IDE-004, RF-KAM-001 | Se usa la clasificación oficial por ingresos (Decreto 957 de 2019) más marca manual |
| RQ-FED-008 | **Proveedor de identidad** y política de segundo factor | Presidencia + Cenisoft | S3 | RF-IDE-001/005 | Se usa un proveedor estándar autoalojado en desarrollo; es intercambiable por diseño |
| RQ-FED-009 | **Subdominios** del portal y de la consola, y responsable del DNS | Comunicaciones | S2 | Despliegue en preproducción | Se trabaja en un dominio temporal |
| RQ-FED-010 | **Política de tratamiento de datos personales** revisada por jurídica y publicada | Jurídica | S12 | RNF-CUM-002 | No se sale a producción sin ella |
| RQ-FED-011 | **Retención de datos**: plazos para auditoría, documentos fiscales y datos personales | Jurídica + Contabilidad | S12 | RD-009 | Se parametrizan valores propuestos, ajustables |
| RQ-FED-012 | **Metas anuales** de afiliados, recaudo, retención, participación y autoservicio | Presidencia Ejecutiva | S2 | RA-BI-007 | El tablero de resultados se entrega sin línea de meta |
| RQ-FED-013 | **Alcance de la migración de cartera**: cuántos años de histórico se migran | Financiera | S3 | RD-005 | Se migran los últimos 2 años y el resto queda como archivo |
| RQ-FED-014 | **Permanencia del pago por transferencia** y su procedimiento de registro | Financiera | S5 | RF-PAG-012 | Se mantiene con registro manual y conciliación |

## A.2 Información y activos

| ID | Requerimiento | Responde | Límite | Bloquea | Si no llega |
|---|---|---|---|---|---|
| RQ-FED-015 | **Manual de marca y logo en vectores** (horizontal, vertical, negativo, monocromo) y tipografías institucionales | Comunicaciones | S2 | RNF-USA-005 | Se usan los tokens provisionales de `docs/design/identidad-visual.md`, validados por contraste |
| RQ-FED-016 | **Catálogo de beneficios por tipo de afiliación**: qué incluye ser activo y qué adherente | Servicios gremiales | S3 | RA-PAR-004 | Se parametriza una elegibilidad base |
| RQ-FED-017 | **Lista de comunidades** vigentes con su criterio de acceso y responsable | Talento | S11 | RF-CMD-001 | Se cargan las conocidas (Gerentes, Líderes de Talento) |
| RQ-FED-018 | **Lista de verticales** activas, sus mesas y responsables | Relacionamiento | S13 | RF-VER-001 | Se cargan Salud, Financiera, Educación y Seguridad Digital |
| RQ-FED-019 | **Catálogo inicial de formación**: cursos, TIC Talks y sesiones, con cupos y elegibilidad | Talento | S9 | RF-FOR-001 | Se carga una muestra para la demostración |
| RQ-FED-020 | **Proceso actual de convocatorias** Cenisoft: estados, criterios de selección y responsables | Cenisoft | S14 | RF-OPO-004 | Se modela un flujo estándar de estados |
| RQ-FED-021 | **Fuentes de los insights sectoriales** (revenue por empleado, estudios) y quién los actualiza | Estudios | S12 | RF-DIR-007 | El módulo se entrega sin contenido cargado |
| RQ-FED-022 | **Textos legales** del portal: términos de uso y aviso de privacidad | Jurídica | S12 | RNF-CUM-006 | Se usan textos provisionales marcados como tales |
| RQ-FED-023 | **Plantillas de comunicación** y tono de los correos transaccionales | Comunicaciones | S4 | RF-NOT-001 | Se redactan borradores para aprobación |

## A.3 Datos y accesos técnicos

| ID | Requerimiento | Responde | Límite | Bloquea | Si no llega |
|---|---|---|---|---|---|
| RQ-FED-024 | **Padrón actual de empresas y contactos** exportado desde los sistemas vigentes (afiliaciones, directorio, hojas de categorización) | Operaciones + Cenisoft | S3 | RD-004 | El mapeo de campos se retrasa y con él la migración |
| RQ-FED-025 | **Estado de cartera actual** por empresa | Financiera | S6 | RD-005 | La migración de cartera se difiere a la Fase 5 |
| RQ-FED-026 | **Credenciales de ambiente de pruebas** de la pasarela de pago | Financiera | S6 | RF-PAG-003 | Se desarrolla con el doble contractual |
| RQ-FED-027 | **Credenciales de ambiente de pruebas** del facturador y su contrato técnico | Contabilidad | S7 | RF-FAC-001 | Se desarrolla con el doble contractual |
| RQ-FED-028 | **Acceso o export del sitio actual** (`fedesoft.org` y subdominios) para completar la auditoría: formularios, campos y flujo de pago | Comunicaciones + TI | S3 | Auditoría pendiente (`docs/audit/`) | La auditoría queda incompleta; el mapeo de trámites se hace por entrevista |
| RQ-FED-029 | **Herramienta de inteligencia de negocio** que ya usa Fedesoft, licencias y administrador | Cenisoft | S10 | RA-BI-011 | Solo se entregan los tableros de la consola |
| RQ-FED-030 | **Proveedor de nube y presupuesto** a 12 meses | Presidencia + Cenisoft | S4 | Preproducción | Se sigue trabajando en local |
| RQ-FED-031 | **Dominio de correo saliente** y autorización para configurar su autenticación (SPF, DKIM, DMARC) | TI + Comunicaciones | S4 | RF-NOT-001 | Se usa un dominio de pruebas; los correos reales no salen a nombre de Fedesoft |

## A.4 Personas y gobierno

| ID | Requerimiento | Responde | Límite | Bloquea | Si no llega |
|---|---|---|---|---|---|
| RQ-FED-032 | **Contraparte única** por cada frente (afiliación, financiera, talento, comunicaciones, relacionamiento, jurídica) con capacidad de decidir | Presidencia Ejecutiva | S1 | Ritmo de todas las decisiones | Las decisiones se acumulan y los hitos se corren |
| RQ-FED-033 | **Personas por rol interno** de la consola: quién es Operaciones, Cartera, Formación, Comunicaciones, Relacionamiento, KAM, Dirección y Auditor | Presidencia Ejecutiva | S4 | RA-ACC-003 | Se crean roles sin usuarios asignados |
| RQ-FED-034 | **Dos responsables de Super Admin** (titular y suplente) con segundo factor | Cenisoft | S4 | RA-ACC-008 | No se habilita la consola en preproducción |
| RQ-FED-035 | **Lista definitiva de acciones con doble control** | Cenisoft + Financiera | S5 | RA-ACC-005 | Se aplica la lista propuesta, editable después |
| RQ-FED-036 | **Participación en la revisión semanal** (demostración y decisiones) | Contrapartes | Semanal | Re-planificación | Los supuestos vencidos se resuelven por defecto y se informan |
| RQ-FED-037 | **Grupo piloto de empresas** para la salida controlada | Servicios gremiales | S16 | Piloto (Fase 5) | El piloto se hace con empresas seleccionadas por Cenisoft |
| RQ-FED-038 | **Autorización para la prueba de intrusión** y ventana de ejecución | Presidencia + Cenisoft | S16 | RNF-SEG-009 | No se sale a producción sin ella |

## A.5 Acción inmediata recomendada (no espera al plan)

| # | Recomendación | Motivo |
|---|---|---|
| 1 | Proteger `prueba.fedesoft.org` con autenticación y bloqueo de indexación, o retirarlo | Hoy es un ambiente de pruebas accesible y visible en buscadores |
| 2 | Inventariar quién tiene acceso administrativo a los cuatro sitios actuales | Reducir superficie de riesgo antes de la migración |
| 3 | Congelar la creación de nuevos formularios externos para trámites de afiliados | Cada formulario nuevo es una isla de datos más que habrá que migrar |
