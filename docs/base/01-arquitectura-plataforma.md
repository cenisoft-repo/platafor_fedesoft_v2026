# Arquitectura de la plataforma — Portal único del afiliado (Fedesoft)

**FEDESOFT**

**Arquitectura de la plataforma**

Portal único del afiliado — modelo de referencia

Definición de capas y módulos para evaluar los escenarios de implementación sobre una misma base

**Documento de trabajo**

**Preparado para: Presidencia Ejecutiva**

**Septiembre de 2026**

## 1. Propósito de este documento

Este documento define la arquitectura de referencia del portal único del afiliado: un mapa neutral de las capas, los módulos y los flujos que la plataforma debe tener, independiente de la tecnología con que se construya. No recomienda un proveedor; sirve como plantilla de evaluación para medir cada escenario de implementación contra un mismo conjunto de requisitos.

La lógica de fondo es la separación en dos ejes de servicio ya acordada: un carril de autoservicio instantáneo (Eje 1) que elimina el desgaste on-demand, y un carril de alto contacto (Eje 2) que fortalece el relacionamiento con empresas grandes y proyectos. Cada módulo de la plataforma pertenece a uno de los dos ejes.

## 2. Principios de arquitectura

Cinco principios guían el diseño y sirven de criterio para descartar opciones que no encajen:

- Fuente única de verdad. Existe una sola base de datos de afiliados de la que todos los módulos leen y escriben. Nada vive en islas separadas.
- Autoservicio por defecto. Todo lo transaccional y repetible se resuelve en pantalla, sin intervención humana, 24/7.
- Propiedad del dato. Fedesoft es dueña de los datos de sus afiliados y puede exportarlos; ningún proveedor los retiene.
- Segmentación desde el acceso. La experiencia se adapta al perfil (empresa grande vs. MIPYME) desde el login.
- Cumplimiento fiscal local. La facturación electrónica DIAN y la pasarela de pago colombiana son parte del núcleo, no un añadido.

## 3. Las capas de la plataforma

La plataforma tiene tres capas técnicas. Los módulos que el afiliado usa (sección 4) se apoyan todos sobre ellas.

| # | Capa técnica | Qué hace |
|---|---|---|
| A | Núcleo de afiliación | Base de datos maestra: empresa, contactos, tipo de afiliación (activo/adherente), tamaño, estado de pago e historial. Fuente única de verdad de la que todos los módulos leen. |
| B | Identidad y acceso | Login único con múltiples contactos por empresa y roles (el gerente ve facturación; el líder de talento ve formación y comunidades). Activa la segmentación por perfil. |
| C | Motor de servicios | La lógica que alimenta cada módulo: pagos y facturación, inscripciones, emisión de documentos, gestión de contenido y datos. Se apoya en integraciones locales (facturador DIAN, pasarela). |

## 4. Los módulos del portal

Aquí está el detalle de lo que el afiliado realmente usa. Son nueve módulos; cada uno se describe con qué ve el afiliado y cómo funciona por dentro. El pago es apenas uno de ellos: la mayor parte del valor está en formación, comunidades, verticales, visibilidad y relacionamiento.

**Los módulos 1 a 6 son Eje 1 (autoservicio); los módulos 7 a 9 son Eje 2 (alto contacto).**

**Módulo 1 · Perfil y afiliación Eje 1 · Autoservicio**

El módulo base sobre el que se apoyan todos los demás. Concentra los datos de la empresa, sus contactos y su estado de afiliación en un solo lugar editable, reemplazando los formularios de actualización de datos que hoy viven dispersos.

Qué ve el afiliado: Su ficha de empresa, contactos autorizados, tipo de afiliación y estado “al día / pendiente”, todo editable.

Cómo funciona: Escribe directo en el núcleo (capa A). Al actualizar un dato, se refleja de inmediato en el directorio y en los demás módulos, sin doble digitación.

**Módulo 2 · Estado de cuenta y pago Eje 1 · Autoservicio**

Convierte el trámite de pago —hoy un formulario y una espera— en una consulta y una acción inmediata. Reemplaza la solicitud manual de estado de cuenta.

Qué ve el afiliado: Su estado de cuenta en vivo, próximos vencimientos y un botón de pago; al pagar, la factura electrónica llega sola.

Cómo funciona: El motor (capa C) procesa el pago por la pasarela local (Wompi/ePayco), emite la factura DIAN con CUFE y actualiza el estado en el núcleo automáticamente.

**Módulo 3 · Certificado y sello de afiliado Eje 1 · Autoservicio**

Dos trámites que hoy pasan por formulario y emisión manual se vuelven descargas instantáneas, disponibles solo si la afiliación está al día.

Qué ve el afiliado: Botón para descargar su certificado de afiliación vigente y el sello #SoyAfiliadoFedesoft, listos al instante.

Cómo funciona: El motor valida el estado en el núcleo; si está al día, genera el certificado con fecha y folio, y entrega el sello. Sin intervención del equipo.

**Módulo 4 · Formación — TrainingLAB y TIC Talks Eje 1 · Autoservicio**

Centraliza la oferta de actualización del talento (cursos on-demand de IA, ciberseguridad, cloud; TIC Talks y sesiones informativas) con inscripción directa e historial, en lugar de formularios externos sueltos.

Qué ve el afiliado: Catálogo de cursos y sesiones con inscripción de un clic, su calendario, y el historial de formación de su equipo.

Cómo funciona: El motor gestiona cupos, confirma inscripción contra el perfil y guarda la participación por empresa; las grabaciones quedan disponibles en el mismo lugar.

**Módulo 5 · Comunidades Eje 1 · Autoservicio**

Reúne las comunidades del gremio (Gerentes, Líderes de Talento y demás) en un espacio con inscripción por cupos y contenido propio, hoy dispersas en formularios independientes.

Qué ve el afiliado: Las comunidades a las que puede pertenecer según su perfil, con inscripción directa y acceso a sus sesiones y materiales.

Cómo funciona: El acceso se filtra por rol del contacto (capa B); la inscripción y la asistencia se registran contra el perfil de la empresa.

**Módulo 6 · Directorio, visibilidad e insights Eje 1 · Autoservicio**

Agrupa la presencia comercial del afiliado (directorio verificado, espacio #AfiliadosFedesoft para difundir su oferta) y el acceso a información sectorial como el revenue por empleado y los insights Fedesoft.

Qué ve el afiliado: Su ficha en el directorio verificado, la opción de publicar ofertas a otros afiliados, y los reportes e indicadores del sector.

Cómo funciona: El directorio se alimenta del mismo perfil (capa A), sin carga aparte. Los insights se sirven según el tipo de afiliación.

**Módulo 7 · Verticales sectoriales Eje 2 · Alto contacto**

Las mesas de trabajo con enfoque sectorial (Salud, Financiera, Educación, Seguridad Digital, entre otras) donde se generan consensos e iniciativas. Es relacionamiento de alto valor, no autoservicio.

Qué ve el afiliado: Las verticales en las que participa, su agenda de mesas, documentos de trabajo y contactos del sector.

Cómo funciona: El portal da visibilidad y contexto; la dinamización la lleva el equipo. La participación queda registrada en el perfil para dar seguimiento.

**Módulo 8 · Proyectos e internacionalización — Cenisoft Eje 2 · Alto contacto**

El espacio de las oportunidades gestionadas con el equipo: proyectos con entidades públicas o privadas vía Cenisoft, encadenamiento y programas de internacionalización.

Qué ve el afiliado: Los proyectos y oportunidades en curso que le aplican, su estado, y el canal para postularse o dar seguimiento.

Cómo funciona: El equipo publica y asigna oportunidades; el afiliado las ve filtradas por su perfil. El portal es el tablero compartido, no un trámite automático.

**Módulo 9 · Cuenta estratégica (KAM) Eje 2 · Alto contacto**

La experiencia diferenciada para empresas grandes: un gestor de cuenta asignado y una vista consolidada de todo lo que la empresa tiene en curso con la federación.

Qué ve el afiliado: Su KAM asignado con canal directo, y un resumen de sus proyectos, verticales, formación y representación en un solo panel.

Cómo funciona: La segmentación (capa B) activa esta vista solo para cuentas grandes; el KAM opera sobre el mismo núcleo, con el contexto completo del afiliado a la vista.

## 5. Cómo se conectan los módulos

El principio de fuente única hace que todos los módulos giren alrededor del núcleo. Un mismo dato —quién es la empresa, si está al día, qué rol tiene el contacto— alimenta a todos sin repetirse. Tres ejemplos de recorridos, en distintos módulos:

#### Recorrido A — Formación (módulo 4)

El líder de talento entra, el portal reconoce su rol y le muestra el catálogo. Se inscribe a un curso de un clic; el motor confirma el cupo y guarda la participación en el perfil de la empresa. Nadie del equipo interviene.

#### Recorrido B — Pago y certificado (módulos 2 y 3)

El gerente ve un pago pendiente, paga con un clic, el motor emite la factura DIAN y actualiza el estado en el núcleo. Al quedar al día, el certificado y el sello se habilitan solos para descarga.

#### Recorrido C — Relacionamiento (módulos 7 a 9)

Una empresa grande entra y ve su panel de cuenta estratégica: su KAM, las verticales en las que participa y los proyectos Cenisoft que le aplican. El equipo opera sobre el mismo perfil, con todo el contexto a la vista.

El estándar contra el que se mide cada escenario es el mismo en todos los módulos del Eje 1: si un trámite todavía necesita que alguien del equipo responda un formulario, la arquitectura no está completa. En los módulos del Eje 2 el equipo sí interviene —ahí está el valor—, pero apoyado por el contexto que el portal le da.

## 6. Lista de verificación para evaluar escenarios

Cada escenario candidato se puntúa módulo por módulo: cumple / cumple con integración / no cumple.

| Requisito por módulo | Qué observar | Cumple / Parcial / No |
|---|---|---|
| Núcleo: base de afiliados propia y exportable | ¿Fedesoft es dueña del dato? ¿Puede exportarlo completo? |   |
| Login con múltiples contactos y roles | ¿Varios usuarios por empresa con permisos distintos? |   |
| Segmentación grande vs. MIPYME | ¿El portal muestra vistas distintas según el perfil? |   |
| Perfil editable que alimenta el directorio | ¿Un solo dato sin doble digitación? |   |
| Facturación electrónica DIAN (CUFE, UBL 2.1) | ¿Nativo, vía Alegra/Siigo, o inexistente? |   |
| Pasarela de pago local (Wompi / ePayco) | ¿Pago local que actualice el estado de cuenta? |   |
| Certificado y sello de descarga automática | ¿Se emiten solos al estar al día? |   |
| Formación con inscripción e historial | ¿Cursos y TIC Talks con registro y trazabilidad por empresa? |   |
| Comunidades con acceso por rol | ¿Inscripción filtrada por perfil del contacto? |   |
| Directorio, visibilidad e insights | ¿Directorio verificado + reportes sectoriales integrados? |   |
| Verticales con seguimiento | ¿Registro de participación y agenda por vertical? |   |
| Proyectos Cenisoft e internacionalización | ¿Tablero de oportunidades filtrado por perfil? |   |
| Vista de cuenta estratégica (KAM) | ¿Panel consolidado para empresas grandes? |   |
| Costo total a 12 meses (TCO) | ¿Licencia + facturador + pasarela + implementación? |   |
| Dependencia del proveedor / migrar | ¿Qué tan atado queda Fedesoft? ¿Se puede salir con el dato? |   |

## 7. Criterios de decisión

Al comparar escenarios sobre esta arquitectura, tres criterios pesan más que el resto:

### Criterio 1 — Encaje fiscal (filtro eliminatorio)

En Colombia la facturación electrónica es obligatoria y debe validarse ante la DIAN con CUFE en formato UBL 2.1. Ninguna plataforma de membresías internacional factura ante la DIAN por sí sola. Cualquier escenario debe resolverlo con un facturador local homologado (Alegra, Siigo u otro). Si no lo resuelve, queda descartado, sin importar qué tan bueno sea el portal.

### Criterio 2 — Control vs. velocidad

El verdadero eje de la decisión. Más velocidad (plataforma especializada lista para usar) suele significar menos control y cuota en dólares. Más control (construir sobre infraestructura propia) significa mejor encaje fiscal y costo en pesos, a cambio de más tiempo e integración.

### Criterio 3 — Costo total de propiedad (TCO)

No mirar solo la licencia. El costo real suma licencia del portal, facturador (muchos cobran por documento emitido sobre un tope), comisiones de pasarela e implementación, evaluado a 12 meses para comparar en igualdad de condiciones.

### Cómo llegar a la decisión

Con la arquitectura fija, el ejercicio es directo: tomar cada escenario, puntuarlo módulo por módulo con la lista de la sección 6, aplicar el filtro fiscal del criterio 1, y ubicarlo en el eje control–velocidad. La arquitectura no cambia entre escenarios; lo que cambia es qué tecnología ocupa cada capa y módulo, y a qué costo. Eso es lo que queda por decidir en la próxima sesión.

