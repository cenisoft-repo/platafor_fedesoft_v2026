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
