# Estado actual frente al alcance solicitado

**Versión 1.0 · 22 de septiembre de 2026**

Comparación entre lo que el prototipo demuestra hoy y lo que exige `docs/base/01-arquitectura-plataforma.md`, con la ruta para cerrar la brecha.

---

## 0. La distinción que ordena todo

El documento de arquitectura pide dos cosas de naturaleza distinta, y confundirlas es el riesgo principal de esta etapa:

| | Qué exige | Quién lo resuelve |
|---|---|---|
| **La experiencia** | Nueve módulos, dos ejes, segmentación desde el acceso, autoservicio sin intervención humana | **El prototipo** — es exactamente para lo que sirve |
| **La capacidad real** | Factura DIAN con CUFE y UBL 2.1, pasarela local, fuente única exportable, independencia de proveedor | **La plataforma** — ninguna cantidad de trabajo visual la resuelve |

El prototipo hoy **representa** el recorrido de pago hasta la factura con CUFE; no emite ninguna factura. Eso está bien y es lo correcto en esta fase, pero debe decirse en voz alta en la presentación: lo que se ve es la experiencia acordada, no el sistema funcionando.

Este documento mide la **primera** columna. La segunda es el plan de ejecución (`docs/00-plan-de-ejecucion.md`) y sus decisiones pendientes.

---

## 1. Los nueve módulos: qué hay y qué falta

Prototipo en `cenisoft-repo/fedesoft`, commit `d10a010`. Once rutas construidas.

| # | Módulo | Eje | Estado | Qué existe | Qué falta |
|---|---|---|---|---|---|
| **1** | Perfil y afiliación | 1 | 🟡 **Parcial** | `/empresa`: ficha editable, contactos con roles, afiliación e historial, aviso de que el dato alimenta el directorio | Solicitud de afiliación pública y su seguimiento por radicado |
| **2** | Estado de cuenta y pago | 1 | 🟢 **Completo** | `/facturacion` con cargos, total protagonista y facturas; `/facturacion/pagar` con el recorrido hasta CUFE y confirmación servidor a servidor | — |
| **3** | Certificado y sello | 1 | 🟢 **Casi completo** | `/facturacion/certificado` con folio, QR, sello en dos variantes y **el estado bloqueado explicado** | Página pública de verificación por folio |
| **4** | Formación | 1 | 🟢 **Completo** | `/formacion`: catálogo con cupos, inscripción de un clic, mis inscripciones, **historial del equipo** | — |
| **5** | Comunidades | 1 | 🔴 **Sin pantalla** | Datos simulados listos (`COMUNIDADES`) | Toda la pantalla: elegibilidad por rol, cupos, materiales |
| **6** | Directorio, visibilidad e insights | 1 | 🟡 **Parcial** | `/directorio` con las tres pestañas reales, filtros e insignia de verificado | Publicación de ofertas y pantalla de insights (datos ya existen) |
| **7** | Verticales sectoriales | 2 | 🔴 **Sin pantalla** | Datos simulados listos (`VERTICALES`); se mencionan en inicio y cuenta estratégica | Toda la pantalla: agenda de mesas, documentos, participación |
| **8** | Proyectos e internacionalización | 2 | 🟢 **Completo** | `/oportunidades` filtrado por perfil, con estados de postulación | — |
| **9** | Cuenta estratégica (KAM) | 2 | 🟢 **Completo** | `/cuenta-estrategica`: gestora asignada, métricas, verticales y acciones | — |

**Marcador: 5 completos · 2 parciales · 2 sin construir.**

### Fuera de los nueve módulos

| Pieza | Estado | Nota |
|---|---|---|
| Página pública / manifiesto | 🟢 Construida | No la pedía el documento; es la que sostiene la narrativa "país origen de software" |
| Inicio de sesión | 🔴 Sin pantalla | El prototipo entra directo. Para la demostración es aceptable, pero es la primera impresión del afiliado |
| Consola de administración | 🟡 Una pantalla | Ficha 360 en `/admin`. `docs/01-consola-administracion.md` define ~15 gestiones |
| Notificaciones, perfil personal, ayuda | 🔴 Sin pantalla | Secundarias para la demostración |

---

## 2. Contra la lista de verificación del documento de arquitectura

Los quince puntos de la sección 6. Se marca si el **prototipo lo demuestra**, no si la plataforma lo cumple.

| Requisito | ¿Se demuestra hoy? |
|---|---|
| Núcleo: base de afiliados propia y exportable | Parcial — se ve la ficha única alimentando otros módulos; la exportación no aparece |
| Login con múltiples contactos y roles | **Sí**, mediante el selector de escenarios: gerente y líder de talento ven portales distintos |
| Segmentación grande vs. MIPYME | **Sí** — la cuenta estratégica solo aparece para la empresa grande |
| Perfil editable que alimenta el directorio | **Sí**, con el aviso explícito al guardar |
| Facturación electrónica DIAN (CUFE, UBL 2.1) | Representada: número, CUFE copiable e insignia "validada ante la DIAN" |
| Pasarela de pago local | Representada: paso de pasarela y confirmación servidor a servidor |
| Certificado y sello de descarga automática | **Sí**, incluido el bloqueo cuando no está al día |
| Formación con inscripción e historial | **Sí**, con historial por empresa |
| Comunidades con acceso por rol | **No** — falta la pantalla |
| Directorio, visibilidad e insights | Parcial — directorio sí; insights y ofertas no |
| Verticales con seguimiento | **No** — falta la pantalla |
| Proyectos Cenisoft e internacionalización | **Sí** |
| Vista de cuenta estratégica (KAM) | **Sí** |
| Costo total a 12 meses (TCO) | Fuera del prototipo: decisión de negocio |
| Dependencia del proveedor / migrar | Fuera del prototipo: lo resuelve la arquitectura (ADR-001/002) |

**Once de trece puntos demostrables están cubiertos o representados. Los dos que faltan son comunidades y verticales.**

---

## 3. Cómo completar el flujo

Tres etapas. La primera cierra lo que el documento de arquitectura pide ver; las otras dos son el proyecto real.

### Etapa A · Cerrar los nueve módulos en el prototipo

Es lo que falta para que la presentación cubra el alcance completo. Todo con datos simulados, sin backend.

| Orden | Trabajo | Por qué primero | Insumo que ya existe |
|---|---|---|---|
| A1 | **Comunidades** | Es uno de los dos huecos del Eje 1 y el más rápido: elegibilidad por rol, cupos y materiales | `COMUNIDADES` en datos |
| A2 | **Verticales** | El otro hueco; ancla el Eje 2 junto a Cenisoft y KAM | `VERTICALES` en datos |
| A3 | **Insights y ofertas** | Completa el módulo 6, hoy a medias | `INSIGHTS` en datos |
| A4 | **Inicio de sesión** | Primera impresión del afiliado y donde se hace visible la segmentación | Escenarios del selector |
| A5 | **Verificación pública del certificado** | Cierra el módulo 3 y demuestra que el certificado es verificable por terceros | Folio `FS-2026-00184` |
| A6 | **Solicitud de afiliación** | Completa el módulo 1 y muestra la puerta de entrada de una empresa nueva | — |

Con A1 a A3 el marcador queda en **nueve de nueve**. A4 a A6 lo redondean.

### Etapa B · La consola interna

`docs/01-consola-administracion.md` define nueve roles, la parametrización, diecisiete dominios de CRUD, dieciséis gestiones operativas y siete tableros. Hoy hay **una** pantalla.

Para la presentación no hace falta construirla entera: con tres pantallas se entiende el alcance — la ficha 360 que ya existe, la **bandeja de solicitudes de afiliación** y un **tablero de cartera**. Eso demuestra que el proyecto también resuelve la operación interna.

### Etapa C · Lo que ningún prototipo resuelve

Aquí no hay diseño que valga: son decisiones y construcción real, con su plan ya escrito.

- Las cuatro decisiones que siguen abiertas: proveedor de identidad, pasarela, facturador y la regla de "al día" (`docs/02-catalogo-de-requerimientos.md`, Anexo A).
- La Fase 0 de fundación: monorepo, base de datos, CI, entornos.
- El recorrido crítico real: pago → webhook firmado → factura DIAN → certificado, con idempotencia y auditoría.

---

## 4. Qué haría falta de Fedesoft para subir el nivel

Independiente del avance técnico, tres insumos cambian el resultado visible:

1. **Logo en vectores.** Hoy el wordmark se dibuja con tipografía. En el certificado y el sello —que son documentos oficiales— eso se nota.
2. **Referente de menús.** Es lo único que falta para rediseñar la navegación, la pieza que más se percibe al entrar.
3. **Material fotográfico.** La página pública usa un campo generativo; con imagen propia del sector gana verdad.

---

## 5. Recomendación

Ejecutar **A1 a A3** ahora: son los dos módulos faltantes más el que está a medias, todos con datos ya preparados, y llevan el prototipo a cubrir los nueve módulos del documento de arquitectura.

A4 a A6 y la Etapa B se deciden según la fecha de la presentación. La Etapa C no empieza hasta que Fedesoft cierre las cuatro decisiones pendientes, y eso no lo destraba ningún diseño.
