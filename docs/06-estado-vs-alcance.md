# Estado actual frente al alcance solicitado

**Versión 1.1 · 22 de septiembre de 2026** · Etapa A ejecutada

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

Prototipo en `cenisoft-repo/fedesoft`, commit `f4db36e`. Veintidós rutas construidas.

| # | Módulo | Eje | Estado | Qué existe | Qué falta |
|---|---|---|---|---|---|
| **1** | Perfil y afiliación | 1 | 🟢 **Completo** | `/empresa`: ficha editable, contactos con roles, afiliación e historial. `/afiliarme`: solicitud pública en cuatro pasos con radicado y consentimiento Ley 1581 | — |
| **2** | Estado de cuenta y pago | 1 | 🟢 **Completo** | `/facturacion` con cargos, total protagonista y facturas; `/facturacion/pagar` con el recorrido hasta CUFE y confirmación servidor a servidor | — |
| **3** | Certificado y sello | 1 | 🟢 **Completo** | `/facturacion/certificado` con folio, QR, sello en dos variantes y **el estado bloqueado explicado**. `/verificar/[folio]`: verificación pública sin sesión, con folio vigente, vencido e inexistente | — |
| **4** | Formación | 1 | 🟢 **Completo** | `/formacion`: catálogo con cupos, inscripción de un clic, mis inscripciones, **historial del equipo** | — |
| **5** | Comunidades | 1 | 🟢 **Completo** | `/comunidades`: elegibilidad por rol, cupos, materiales y comunidades que requieren aprobación | — |
| **6** | Directorio, visibilidad e insights | 1 | 🟢 **Completo** | `/directorio` con filtros e insignia de verificado. `/visibilidad`: ficha del directorio, mis ofertas publicadas e insights del sector, bloqueados cuando la empresa no está al día | — |
| **7** | Verticales sectoriales | 2 | 🟢 **Completo** | `/verticales`: mesas, documentos, iniciativas y participación de la empresa | — |
| **8** | Proyectos e internacionalización | 2 | 🟢 **Completo** | `/oportunidades` filtrado por perfil, con estados de postulación | — |
| **9** | Cuenta estratégica (KAM) | 2 | 🟢 **Completo** | `/cuenta-estrategica`: gestora asignada, métricas, verticales y acciones | — |

**Marcador: 9 de 9 completos.** El prototipo cubre hoy los nueve módulos del documento de arquitectura.

### Fuera de los nueve módulos

| Pieza | Estado | Nota |
|---|---|---|
| Página pública / manifiesto | 🟢 Construida | No la pedía el documento; es la que sostiene la narrativa "país origen de software" |
| Inicio de sesión | 🟢 Construido | `/entrar`: la selección de persona **es** la autenticación del prototipo, y con ella la segmentación se ve desde la primera pantalla |
| Consola de administración | 🟡 Una pantalla | Ficha 360 en `/admin`. `docs/01-consola-administracion.md` define ~15 gestiones. Es la Etapa B |
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
| Certificado y sello de descarga automática | **Sí**, incluido el bloqueo cuando no está al día y la verificación pública por folio |
| Formación con inscripción e historial | **Sí**, con historial por empresa |
| Comunidades con acceso por rol | **Sí**, con elegibilidad por rol y aprobación previa donde aplica |
| Directorio, visibilidad e insights | **Sí** — directorio, ofertas propias e insights, estos últimos condicionados al estado de pago |
| Verticales con seguimiento | **Sí** |
| Proyectos Cenisoft e internacionalización | **Sí** |
| Vista de cuenta estratégica (KAM) | **Sí** |
| Costo total a 12 meses (TCO) | Fuera del prototipo: decisión de negocio |
| Dependencia del proveedor / migrar | Fuera del prototipo: lo resuelve la arquitectura (ADR-001/002) |

**Los trece puntos demostrables están cubiertos o representados.** Los dos restantes de la lista —TCO y dependencia del proveedor— no son de prototipo: uno es decisión de negocio y el otro lo resuelve la arquitectura.

---

## 3. Cómo completar el flujo

Tres etapas. La primera cierra lo que el documento de arquitectura pide ver; las otras dos son el proyecto real.

### Etapa A · Cerrar los nueve módulos en el prototipo — ✅ **ejecutada**

Todo con datos simulados, sin backend. Commit `f4db36e`.

| Orden | Trabajo | Estado | Ruta |
|---|---|---|---|
| A1 | **Comunidades** — elegibilidad por rol, cupos, materiales, aprobación previa | ✅ | `/comunidades` |
| A2 | **Verticales** — mesas, documentos, iniciativas, participación | ✅ | `/verticales` |
| A3 | **Insights y ofertas** — cierra el módulo 6 | ✅ | `/visibilidad` |
| A4 | **Inicio de sesión** — la persona elegida define rol y segmento | ✅ | `/entrar` |
| A5 | **Verificación pública del certificado** — sin sesión, por folio | ✅ | `/verificar/[folio]` |
| A6 | **Solicitud de afiliación** — cuatro pasos hasta el radicado | ✅ | `/afiliarme` |

Marcador **nueve de nueve**, con las tres puertas de entrada al portal construidas: entrar, verificar y afiliarse.

**Tres decisiones de producto quedaron incorporadas en el prototipo** y conviene validarlas con Fedesoft antes de que se conviertan en supuestos:

1. **Los insights se bloquean cuando la empresa no está al día.** Es el incentivo económico del módulo 6; si Fedesoft prefiere que sean abiertos, cambia el argumento de valor de la afiliación.
2. **La verificación del certificado refleja el estado en el momento de la consulta**, no el del día de emisión: un certificado deja de ser vigente solo si la empresa deja de estar al día. Depende de la regla de "al día" que sigue abierta (RQ-FED, Anexo A).
3. **La solicitud de afiliación termina en un radicado, no en una afiliación.** Supone revisión interna — que es la bandeja de la Etapa B.

### Etapa B · La consola interna — siguiente

`docs/01-consola-administracion.md` define nueve roles, la parametrización, diecisiete dominios de CRUD, dieciséis gestiones operativas y siete tableros. Hoy hay **una** pantalla.

Para la presentación no hace falta construirla entera: con tres pantallas se entiende el alcance.

| | Pantalla | Por qué esa | Estado |
|---|---|---|---|
| B1 | **Ficha 360 del afiliado** | Ya existe; es la vista que usa cualquier gestión | ✅ `/admin` |
| B2 | **Bandeja de solicitudes de afiliación** | Es el otro extremo de `/afiliarme`: sin ella, el radicado que entrega el portal no lleva a ninguna parte | Pendiente |
| B3 | **Tablero de cartera** | Es donde la federación ve el dinero: quién está al día, quién por vencer, quién vencido | Pendiente |

Con B2 y B3 la presentación cierra el círculo: lo que el afiliado hace y lo que la federación hace con eso.

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

La Etapa A está ejecutada: el prototipo cubre los nueve módulos y las tres puertas de entrada, y ya se puede presentar como el alcance completo de la experiencia.

**Lo siguiente es la Etapa B**, y son dos pantallas: la bandeja de solicitudes y el tablero de cartera. Es el trabajo de mayor rendimiento que queda, porque demuestra que el proyecto no es un portal bonito sino un sistema con dos lados.

La **Etapa C no empieza** hasta que Fedesoft cierre las cuatro decisiones pendientes —proveedor de identidad, pasarela, facturador y la regla de "al día"—. Ningún diseño las destraba.

Y al presentar, decir en voz alta la distinción de la sección 0: **lo que se ve es la experiencia acordada, no el sistema funcionando.** El prototipo representa el pago y la factura con CUFE; no emite ninguna.
