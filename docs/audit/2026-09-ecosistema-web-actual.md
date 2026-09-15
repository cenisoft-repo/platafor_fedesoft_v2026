# Auditoría del ecosistema web actual de Fedesoft (septiembre 2026)

## Alcance y limitación

Esta auditoría se hizo **desde afuera**: el entorno de desarrollo no tiene permitido el acceso directo a `fedesoft.org` (bloqueo de política de red), así que las fuentes fueron el índice público de buscadores (títulos, URLs y descripciones de las páginas), los documentos rectores del proyecto y los archivos del Drive institucional. No fue posible medir rendimiento, accesibilidad, cookies ni inventariar los campos de cada formulario. Esa parte queda como **pendiente** (ver al final) y se completa en cuanto se habilite el dominio o se entregue un export HTML/capturas.

## 1. Mapa del ecosistema

| Sitio / canal | Qué hace hoy | Evidencia | Tecnología probable |
|---|---|---|---|
| `fedesoft.org` | Sitio institucional: quiénes somos, servicios gremiales, noticias, unidades estratégicas, Talento TI, TrainingLAB, sesiones informativas, verticales, y una **Zona de afiliados** | Páginas indexadas `/zona-de-afiliados/`, `/espacio-de-afiliados/`, `/escritorio-servicios-para-afiliados/`, `/afiliados/`, `/afiliate/`, `/registro/`, `/traininglab/`, `/sesiones-informativas/`, `/verticales-fedesoft/`, `/directory/<empresa>/` | WordPress (formato de títulos, rutas `/directory/`) |
| `afiliaciones.fedesoft.org` | Proceso de afiliación: solicitud, validación por Junta Directiva y activación de servicios | Título por defecto "Afiliaciones FEDESOFT – Afiliaciones FEDESOFT" | WordPress independiente |
| `pagos.fedesoft.org` | Recaudo: botón de pago en línea y transferencia bancaria (Bancolombia) | Título "pagosfedesoft – Federación Colombiana…" | WordPress independiente |
| `fedesoft.co` | Directorio verificado de afiliados (≈321 perfiles) con registro y publicación de perfil | "Afiliados Fedesoft – Fedesoftco" | WordPress / plugin de directorio |
| `prueba.fedesoft.org` | Ambiente de pruebas **indexado públicamente** | Aparece en resultados de búsqueda | WordPress |
| Google Forms / hojas de cálculo | Convocatorias, encuestas, categorización de afiliados | Drive: "Convocatorias Fedesoft" (formulario + hoja), "nueva categorizacion.xlsx", "Categorizacion PARA ROll2.1.xlsx" | Google Workspace |
| Redes | Difusión de beneficios y campaña #SoyAfiliadoFedesoft | @FedesoftCol | — |

**Lectura:** al menos cuatro instalaciones web distintas más formularios sueltos sostienen el ciclo de vida del afiliado. Cada una tiene su propia base de usuarios y datos: esto es la "isla de datos" que el principio de fuente única prohíbe.

## 2. Qué existe hoy y qué módulo del portal lo reemplaza

| Servicio actual | Dónde vive | Cómo se resuelve hoy | Módulo del portal que lo absorbe |
|---|---|---|---|
| Solicitud de afiliación | `afiliaciones.fedesoft.org`, `/afiliate/`, `/registro/` | Formulario → validación de Junta → activación manual | M1 Perfil y afiliación (flujo mixto: autoservicio + aprobación interna con estados visibles) |
| Actualización de datos de empresa y contactos | Formularios dispersos | Correo / formulario → digitación interna | M1 Perfil y afiliación (edición directa sobre el núcleo) |
| Estado de cuenta y pago | `pagos.fedesoft.org`, correo | Botón de pago genérico o transferencia; conciliación y factura manuales | M2 Estado de cuenta y pago (pasarela + webhook + factura DIAN automática) |
| Certificado de afiliación | Solicitud por formulario/correo | Emisión manual | M3 Certificado (descarga instantánea si está al día, con folio) |
| Sello #SoyAfiliadoFedesoft | Zona de afiliados | Entrega manual del recurso | M3 Sello (descarga condicionada al estado) |
| TrainingLAB (IA, ciberseguridad), TIC Talks, sesiones informativas | `/traininglab/`, `/sesiones-informativas/`, formularios externos | Inscripción por formulario, sin historial por empresa | M4 Formación (catálogo, cupos, inscripción de un clic, historial) |
| Comunidades (gerentes, líderes de talento…) | Zona de afiliados, formularios | Inscripción independiente por comunidad | M5 Comunidades (acceso por rol, cupos, materiales) |
| Directorio de afiliados | `fedesoft.co`, `/directory/` | Registro y perfil aparte, sin vínculo con la afiliación real | M6 Directorio (se alimenta del perfil del núcleo; verificado por estado) |
| Revenue por empleado, normativa, insights | Zona de afiliados, "Entérate de regulaciones" | Contenido estático | M6 Visibilidad e insights (servidos por tipo de afiliación) |
| Verticales (Salud, Financiera — FinTech Radar…, Educación, Seguridad Digital) | `/verticales-fedesoft/` | Agenda y documentos por correo | M7 Verticales (agenda, documentos, participación registrada) |
| Proyectos / convocatorias Cenisoft, internacionalización | Google Forms "Convocatorias Fedesoft", correo | Convocatoria abierta sin filtro por perfil | M8 Proyectos e internacionalización (tablero filtrado por perfil, postulación con seguimiento) |
| Relación con empresas grandes | Gestión personal del equipo | Sin vista consolidada | M9 Cuenta estratégica (KAM) |
| Conexión con universidades, Talentsoft, Creadores TI | `/talento-ti/`, `/talentsoft/`, `/creadores-ti/` | Programas de talento | Fuera del alcance inicial; candidatos a M4/M6 en fases posteriores |

## 3. Hallazgos

### Arquitectura de información y datos
1. **Fragmentación:** cuatro sitios + formularios para un mismo afiliado; ninguna fuente única de empresa, contactos, estado y cartera.
2. **Directorio desacoplado:** el directorio de `fedesoft.co` se mantiene por registro aparte; puede mostrar como "afiliada" a una empresa que no está al día o ya no lo es.
3. **Pago sin cierre de ciclo:** el pago en línea no actualiza estado de cuenta ni emite factura; la transferencia obliga a conciliar a mano.
4. **Trámites de un clic hoy son tickets:** certificado, sello y actualización de datos requieren intervención del equipo (justo lo que el Eje 1 debe eliminar).

### Experiencia del afiliado
5. Tres "puertas" distintas (`Zona`, `Espacio`, `Escritorio de servicios` de afiliados) para el mismo público: confusión de navegación y de dónde iniciar sesión.
6. Sin segmentación: la misma experiencia para una empresa grande y para una MIPYME; sin roles por contacto.
7. Inscripciones a formación y comunidades sin historial por empresa: la empresa no sabe quién de su equipo participó.

### Seguridad y operación
8. **Ambiente de pruebas expuesto e indexado** (`prueba.fedesoft.org`): debe protegerse (autenticación básica, `noindex`, o retirarse).
9. Múltiples WordPress = múltiples superficies de ataque y ciclos de actualización de plugins.
10. Datos personales de contactos repartidos en varios sistemas y hojas de cálculo: dificulta cumplir Ley 1581 de 2012 (derechos de acceso, rectificación y supresión).

## 4. Qué aporta la auditoría al plan
- Confirma el alcance del portal y el orden del roadmap: el mayor dolor operativo está en M1–M3 (afiliación, pago, certificado), que es el recorrido vertical crítico.
- Identifica **fuentes de migración** del padrón: usuarios/registros de `afiliaciones.fedesoft.org`, perfiles del directorio `fedesoft.co`, hojas de categorización en Drive, cartera contable. El mapeo de campos se define en la Fase 1.
- Sustenta ADR-004 (convivencia): el sitio institucional sigue en WordPress; el portal absorbe zona de afiliados, afiliaciones, pagos y directorio.
- Aporta insumo de negocio: Fedesoft ya recauda en Bancolombia → la pasarela Wompi (de Bancolombia) es la opción natural a validar.

## 5. Pendiente para completar la auditoría (requiere acceso al dominio o un export)
- Lighthouse (rendimiento, accesibilidad, SEO, buenas prácticas) en escritorio y móvil.
- Inventario de formularios y campos (afiliación, actualización, inscripciones) para el mapeo de datos.
- Huella tecnológica exacta (tema, plugins, versiones) y estado de actualización.
- Flujo real de pago (proveedor del botón, confirmación, comprobantes) y proceso de conciliación.
- Cookies, consentimiento y política de tratamiento de datos publicada.
- Estructura exportable de WordPress (usuarios, directorio) para la migración.

**Cómo destrabarlo:** (a) permitir `fedesoft.org` y subdominios en la política de red del entorno de Claude Code, o (b) entregar un export HTML/capturas de las páginas de afiliados y el manual de marca.

---

## 6. Recorrido observado en video (septiembre 2026)

Fuente: grabación de pantalla (4:41) navegando la Zona de Afiliados de `fedesoft.org` con sesión iniciada, aportada por Cenisoft. Reemplaza parcialmente el pendiente `RQ-FED-028`: cubre la **capa pública y de navegación** de la zona; **no** aparecen las pantallas de datos propios del afiliado (ver "Lo que el video no muestra").

### 6.1 Qué es hoy la "Zona de Afiliados"

Es una **página de aterrizaje dentro del WordPress público**, con encabezado "CONOCE NUESTRA ZONA DE AFILIADOS" y un botón "INICIAR RECORRIDO". Funciona como un **lanzador**: cuatro tarjetas que enlazan hacia sistemas separados, no como un espacio de trabajo integrado con los datos de la empresa.

| Tarjeta | Botón | A dónde lleva | Módulo del portal que lo absorbe |
|---|---|---|---|
| **Pagos en línea** — "Realice pagos en línea de forma rápida, fácil y segura" | Portal de pagos | `pagos.fedesoft.org` (sistema aparte) | M2 Estado de cuenta y pago |
| **Fortalecimiento de capacidades** — "Impulse las capacidades de su equipo con formación especializada" | Ver programas | Modal con TrainingLAB (Hands On / On demand), CertificaTI Series, Red C+I Series; cada uno con "Clic aquí" | M4 Formación |
| **TIC Talks y sesiones** — "Acceda a charlas, lanzamientos y espacios de actualización" | Ver sesiones | Modal con Tic Talks y Sesiones Informativas | M4 Formación |
| **BOARD.BIT** — "Impulse la presencia de su empresa en el directorio TI de Fedesoft" | Ver directorio | Directorio de afiliados | M6 Directorio y visibilidad |

Debajo, sección **TALENTO TI** con TrainingLAB y botones "Registrarme" / "Ver sesiones pasadas".

### 6.2 Componentes recorridos

- **Directorio de afiliados** ("El directorio de las empresas de Software de Colombia"): buscador con tres pestañas — **Afiliados**, **Busco Proveedor**, **Ofertas de Servicio** — y filtros **Tipo de oferta**, **Categoría** (p. ej. "Desarrollo a la medida / apps"), botón "Buscar Afiliado". Marcas visibles: Choucair, Comforce, OlimpIA, Optima, NovaIP, Cuántico, Firefly. Es el mismo directorio de `fedesoft.co`.
- **Calendario de Eventos 2026**: rejilla mensual enero–diciembre; tarjetas de evento con **Modalidad** (Virtual/Presencial), **Exclusivo afiliados** (Sí/No), **Costo** (Sí/No), correo de contacto (`coordinaciontalentoti@fedesoft.org`, `coord.competitividad@fedesoft.org`, `gestorservicios@cenisoft.org`) y estado **Registro** o **Finalizado**. Eventos vistos: TrainingLAB (varias fechas), Series C+I, International Soft Route, Meet and Challenge, Tic Talk.
- **Directorio de universidades** (iniciativa Fedesoft + REDIS): formulario con **aviso de tratamiento de datos** citando la Ley de Habeas Data (Ley Estatutaria 1581 de 2012). Es la única pantalla con captura de datos que aparece en el video.
- **Home institucional**: Quiénes somos, Cenisoft, **Servicios gremiales** (carrusel: Información exclusiva para afiliados · Networking y encadenamiento · Acceso a verticales · Internacionalización), Cifras del sector (PIB), Noticias, banner WO4TIC / REVENUE X EMPLEADO / Verticales / Directorio.

### 6.3 Lo que el video confirma

1. **La Zona de Afiliados no es un back-office: es un catálogo de enlaces.** Reparte al afiliado hacia `pagos.`, el directorio y formularios de registro, cada uno un sistema distinto. Es exactamente la fragmentación que el portal unifica (principio de fuente única).
2. **No hay segmentación ni personalización.** La misma zona para todos; nada depende de quién inició sesión ni del estado de su afiliación.
3. **Los trámites viven fuera.** Formación y eventos se resuelven por "Registro"/correo; el pago, en otro subdominio; los datos personales se piden en formularios sueltos con su propio aviso de Habeas Data (riesgo de datos dispersos).
4. **El contenido es rico** (formación, verticales, directorio, eventos, insights como REVENUE X EMPLEADO): el valor existe, pero está desconectado del perfil del afiliado.

### 6.4 Lo que el video NO muestra (sigue pendiente para cerrar `RQ-FED-028`)

No aparecen las pantallas donde el afiliado ve o edita **sus propios datos**:
- Formulario de **actualización de datos de la empresa** (campos reales → modelo `Organization`/`Contact`).
- **Estado de cuenta** con los cargos de esa empresa y el flujo de pago dentro de `pagos.fedesoft.org`.
- **Solicitud o descarga de certificado** de afiliación.
- Cualquier **vista administrativa** del equipo de Fedesoft.

Probable causa (a confirmar): esas funciones no son pantallas integradas, sino formularios externos y sistemas separados. Confirmarlo define cuánto del "back-office" del afiliado hay que construir desde cero (casi todo) frente a cuánto se migra.
