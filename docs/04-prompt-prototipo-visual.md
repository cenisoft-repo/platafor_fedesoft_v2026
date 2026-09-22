# Prompt para construir el prototipo visual del portal

**Versión 1.0 · 22 de septiembre de 2026**

Prototipo navegable de alta fidelidad, **sin backend**, para presentar a Presidencia Ejecutiva de Fedesoft: enamorar visualmente y dejar ver el alcance completo del proyecto.

**Cómo usarlo:** copia íntegro el bloque entre las dos líneas de corte y entrégalo a una sesión nueva de Claude Code (o al agente `a4-frontend-ux`) abierta en este repositorio. Es autocontenido: no requiere leer otros documentos, aunque los enlaza.

---

# ══════════ INICIO DEL PROMPT ══════════

## ROL

Actúas como **diseñador de producto y desarrollador frontend senior**. Vas a construir un prototipo navegable de alta fidelidad del **Portal Único del Afiliado de Fedesoft**. No es un wireframe ni un borrador desechable: es la pieza con la que la federación va a decidir si aprueba el proyecto. Debe verse y sentirse como un producto terminado.

## OBJETIVO

Un prototipo que cumpla dos cosas a la vez:

1. **Enamorar visualmente.** Que al abrirlo, la Presidencia Ejecutiva de Fedesoft piense "quiero esto ya".
2. **Mostrar el alcance.** Que se entienda, navegando, todo lo que el portal resuelve: afiliación, pago con factura electrónica, certificado, formación, comunidades, directorio, verticales, proyectos y cuenta estratégica.

**Sin backend.** Todo con datos simulados en memoria. Ninguna llamada de red, ninguna base de datos, ninguna autenticación real.

## CONTEXTO: QUÉ ES ESTO

**Fedesoft** es la Federación Colombiana de la Industria de Software y TI: más de 500 empresas afiliadas, 30 años de trayectoria, con su centro de innovación **Cenisoft** reconocido por MinCiencias.

El **Portal Único del Afiliado** unifica en un solo lugar todo lo que una empresa afiliada hace con la federación. Se organiza en dos ejes:

- **Eje 1 · Autoservicio (módulos 1–6):** perfil y afiliación, estado de cuenta y pago, certificado y sello, formación, comunidades, directorio e insights. Todo se resuelve en pantalla, 24/7, sin que intervenga nadie del equipo.
- **Eje 2 · Alto contacto (módulos 7–9):** verticales sectoriales, proyectos e internacionalización (Cenisoft), cuenta estratégica con gestor asignado (KAM). Aquí el equipo sí interviene; el portal le da contexto.

## EL CONTRASTE QUE DEBES HACER EVIDENTE

Esto es lo que da fuerza a la propuesta. Hoy la "Zona de Afiliados" de `fedesoft.org` es **un catálogo de enlaces**: cuatro tarjetas que mandan al afiliado a sistemas distintos — los pagos a otro subdominio, el directorio a otro dominio, la formación a formularios sueltos. No sabe quién entró, no se adapta a nadie, y los trámites (actualizar datos, pedir el certificado) terminan en un correo al equipo.

**El portal invierte eso: una sola puerta que ya sabe quién entra.** El prototipo debe hacer sentir esa diferencia desde la primera pantalla. No lo expliques con texto: demuéstralo con una interfaz que reconoce a la empresa, conoce su estado y le pone la acción pendiente al frente.

## STACK TÉCNICO

| Pieza | Qué usar |
|---|---|
| Framework | **Next.js (App Router) + TypeScript** |
| Estilos | **Tailwind CSS** con los tokens de marca definidos abajo |
| Iconos | `lucide-react` |
| Gráficas | `recharts`, solo si aportan (máximo dos en todo el prototipo) |
| Datos | Objetos TypeScript en `src/lib/mock/` — sin API, sin base de datos, sin `fetch` |
| Estado de demo | React Context (`DemoContext`) para el escenario activo |
| Despliegue | Debe compilar con `next build` y desplegarse en Vercel sin configuración adicional |

**No instales bibliotecas de componentes** (nada de MUI, Chakra, Ant, shadcn completo). Construye los componentes: es lo que garantiza que se vea a Fedesoft y no a una plantilla genérica.

## IDENTIDAD VISUAL (obligatoria)

Derivada del logo oficial: `fede` en azul marino profundo, `soft` en azul brillante, minúsculas geométricas de terminales redondeados.

### Paleta

```css
:root {
  /* Marca */
  --brand-navy: #0C2340;   /* institucional: titulares, superficies oscuras */
  --brand-azure: #0F8BFF;  /* acento: la barra, íconos, indicadores */

  /* Escalas */
  --navy-950: #071529; --navy-700: #1B3A66;
  --azure-700: #0A63BF;  /* INTERACTIVO: enlaces y botón primario */
  --azure-400: #4DA6FF; --azure-300: #8CC4FF; --azure-100: #E3F1FF;

  /* Neutros con sesgo azul — nunca gris puro */
  --bg: #F4F7FB; --surface: #FFFFFF; --ink: #14213A;
  --muted: #5B6B82; --line: #D9E2EE;

  /* Semánticos (independientes del acento) */
  --success: #157347; --success-bg: #DDF5E8;
  --warning: #8A5A10; --warning-bg: #FCEFD3;
  --danger:  #C62828; --danger-bg:  #FBE3E3;
  --info:    #0A63BF; --info-bg:    #E3F1FF;
}
```

**Regla de contraste innegociable** (ya medida): `--brand-azure` (#0F8BFF) da 3,4:1 sobre blanco. **No sirve para texto de cuerpo ni para botones con texto blanco.** Úsalo solo en la barra, íconos, bordes e indicadores. Para enlaces y botones primarios usa `--azure-700` (5,9:1 ✓ AA).

### Tipografía

| Rol | Familia | Uso |
|---|---|---|
| Titulares | **Nunito** 700/800 | Eco del logo. Minúsculas naturales, nunca mayúsculas forzadas. `letter-spacing: -0.01em`, `text-wrap: balance` |
| Cuerpo e interfaz | **Source Sans 3** 400/600 | 16 px base, interlineado 1.5, lectura ≤ 70 caracteres |
| Datos e identificadores | **JetBrains Mono** 400/500 | NIT, CUFE, folio, número de factura. `font-variant-numeric: tabular-nums` en montos |

Escala: 12 · 14 · 16 · 18 · 22 · 28 · 36 · 44 px. Etiquetas en mayúsculas con `letter-spacing: 0.08em` a 12 px.

### El motivo gráfico: "la barra"

El logo extiende las barras horizontales de la `f` y la `t` en azul brillante, abrazando la palabra. Reutiliza ese gesto: **rectángulo de 3–4 px de alto, 28–40 px de ancho, radio 2 px, en `--brand-azure`**. Úsalo delante de las etiquetas de sección, como indicador de pestaña activa y en el borde superior de la tarjeta que concentra la acción de la vista.

**Un énfasis por pantalla.** No lo estampes en cada tarjeta.

### Reglas de interfaz

- Radio de botones y tarjetas: 8–10 px. Sombras sutiles (`0 1px 2px rgba(12,35,64,.06)`), no difusas.
- **No todo es una tarjeta**: borde, relleno, radio y sombra se gastan por jerarquía, no por defecto.
- Foco visible siempre: anillo de 2 px en `--brand-azure` con desplazamiento de 2 px.
- **Tema claro y oscuro**, ambos cuidados. Define los tokens en `:root` y redefine solo los neutros en oscuro.
- Mobile-first, verificado desde 360 px. Nada de desplazamiento horizontal en el cuerpo.

## PANTALLAS A CONSTRUIR

Diez pantallas, en este orden de prioridad. Las seis primeras cuentan la historia completa; las últimas cuatro muestran la profundidad.

### 1. Inicio — `/` ⭐ la pantalla que enamora

Reemplaza las tres puertas confusas de hoy. Responde tres preguntas de un vistazo: **¿estoy bien? ¿tengo algo pendiente? ¿qué hay para mí?**

| Bloque | Contenido | Cuándo aparece |
|---|---|---|
| Saludo y estado | "Hola, Andrés · Nombre de la empresa" + chip de estado de afiliación con su vigencia | Siempre |
| Acción pendiente | El cargo por vencer o el dato incompleto, con su botón directo | Solo si existe algo pendiente — **si no hay nada, el bloque desaparece; no muestres una tarjeta vacía** |
| Accesos rápidos | Cuatro acciones según el rol: pagar, descargar certificado, inscribirse, actualizar datos | Siempre |
| Próximas sesiones | Formación y mesas donde el contacto está inscrito | Si tiene inscripciones |
| Novedades para ti | Oportunidades aplicables, cursos nuevos | Filtrado por perfil |
| Tu cuenta estratégica | KAM asignado, con foto y canal directo | Solo empresas grandes |

### 2. Estado de cuenta — `/facturacion`

Cargos con concepto, vencimiento y estado; total adeudado destacado; botón **"Pagar ahora"**. Antigüedad de cartera visible si hay mora. Montos en pesos colombianos con separador de miles y `tabular-nums`.

### 3. Pago y resultado — `/facturacion/pagar`

Resumen de lo que se paga → simulación de pasarela (Wompi) → **pantalla de resultado**. Muestra el detalle que da credibilidad: *"Confirmando tu pago..."* durante 2 segundos, luego éxito, factura electrónica emitida con su **CUFE**, y el aviso de que el certificado quedó habilitado. Es el recorrido crítico del proyecto: hazlo memorable.

### 4. Certificado y sello — `/facturacion/certificado`

Vista previa del certificado con **folio** y fecha, botón de descarga, y el sello **#SoyAfiliadoFedesoft** en sus variantes. Incluye el bloque de verificación pública con **código QR**.

**Muestra también el estado bloqueado**: si la empresa no está al día, el certificado no se emite y se explica qué falta, con acceso directo al pago. Ese contraste demuestra que las reglas de negocio existen.

### 5. Mi empresa — `/empresa`

Ficha editable: datos de la empresa, contactos autorizados con sus roles, y la afiliación con su historial. **Mensaje clave a transmitir:** al guardar un cambio aquí, se actualiza el directorio automáticamente. Hazlo explícito con un aviso discreto: *"Este dato alimenta tu ficha del directorio"*.

### 6. Formación — `/formacion`

Catálogo con filtros (modalidad, exclusivo afiliados, costo), tarjetas de curso con cupos disponibles, **inscripción de un clic** con confirmación inmediata, y la pestaña **"Historial del equipo"** que muestra quién de la empresa participó en qué. Eso último es lo que hoy no existe.

### 7. Directorio — `/directorio`

Buscador con las tres pestañas actuales — **Afiliados · Busco Proveedor · Ofertas de Servicio** — filtros por tipo de oferta y categoría, y tarjetas de empresa con **insignia de "verificado"**. Aclara que la insignia deriva del estado real de la afiliación.

### 8. Cuenta estratégica — `/cuenta-estrategica`

Solo para empresas grandes. Panel consolidado: KAM asignado con canal directo, resumen de formación, verticales, proyectos y estado financiero, más las próximas acciones acordadas. Es el "wow" para las empresas grandes.

### 9. Oportunidades — `/oportunidades`

Tablero de convocatorias y proyectos Cenisoft filtrados por el perfil de la empresa, con estado de postulación y seguimiento.

### 10. Consola interna (una sola pantalla) — `/admin`

Un vistazo de la **ficha 360** que ve el equipo de Fedesoft: una empresa con todo su contexto en una pantalla (perfil, cartera, formación, participación, auditoría). Demuestra que el proyecto también resuelve la operación interna, no solo la cara al afiliado.

## MECÁNICA DE DEMO (crítica para la presentación)

Incluye un **selector de escenario** flotante, discreto, en la esquina inferior derecha, rotulado "Modo demostración". Permite cambiar en vivo entre:

| Escenario | Qué demuestra |
|---|---|
| **Gerente · MIPYME · al día** | La experiencia feliz: todo habilitado, certificado descargable |
| **Gerente · MIPYME · pago vencido** | Las reglas de negocio: aviso persistente, certificado bloqueado con explicación, acción de regularizar |
| **Líder de talento** | La segmentación por rol: ve formación y comunidades, **no** ve facturación |
| **Gerente · empresa grande** | El Eje 2: aparece la cuenta estratégica con su KAM |

Al cambiar de escenario, toda la aplicación se adapta: navegación, datos, estados. **Esto es lo que demuestra el alcance en 30 segundos de presentación.**

Añade también un conmutador de tema claro/oscuro.

## CONTENIDO: USA DATOS REALES DE FEDESOFT

Nada de "Lorem ipsum" ni "Empresa Ejemplo S.A.". Usa el contenido real de la federación — es lo que hace que se vea verdadero:

**Formación (TrainingLAB, TIC Talks, Series C+I):**
- "BigQuery: El Oráculo de Datos para la Era de la IA" · Virtual · Exclusivo afiliados · Sin costo
- "Arquitecturas resilientes y DR 'Sin drama' en AWS" · Virtual
- "Identidad Digital: el nuevo perímetro del negocio digital" · Virtual
- "AI workspace: Potencia tu productividad con Google y la IA" · Virtual
- "El costo de decir Adiós" · Virtual
- "El VAR de los negocios: las métricas y decisiones detrás de las empresas que juegan para ganar" (Series C+I) · Presencial
- "Meet and Challenge · Tech + Seguridad" · Presencial
- "La nueva forma de operaciones: agentes de IA y talento humano en acción" (Tic Talk)
- "International Soft Route · Sesión de lanzamiento 2026"

Cada actividad lleva: **modalidad** (Virtual/Presencial), **exclusivo afiliados** (sí/no), **costo** (sí/no), cupos y estado (Registro abierto / Finalizado).

**Programas:** TrainingLAB (Hands On y On demand), CertificaTI Series, Red C+I Series, WO4TIC (Women for TIC), Premios INGENIO, Concurso Nacional de Programación, Maratón de Inmersión, RegiónLAB, SOFTIC.

**Verticales:** Salud · Financiera (FinTech Radar) · Educación · Seguridad Digital.

**Empresas del directorio:** Choucair, Comforce, OlimpIA, Optima, NovaIP, Cuántico, Firefly Software Consulting. Categoría de ejemplo: "Desarrollo a la medida / apps".

**Comunidades:** Gerentes · Líderes de Talento Humano.

**Insights:** "Revenue por empleado", "Cifras del sector".

**Servicios gremiales:** Información exclusiva para afiliados · Networking y encadenamiento · Acceso a verticales · Internacionalización.

**Formatos colombianos, correctos:**
- NIT con dígito de verificación: `901.234.567-8`
- Montos: `$ 2.450.000` (punto de miles, sin decimales)
- Fechas en interfaz: `22 sep 2026`
- CUFE: cadena larga truncada con acción de copiar
- Folio de certificado: `FS-2026-00184`

Inventa nombres de empresa y de contacto que suenen creíbles para el sector TI colombiano, pero **no uses datos personales reales de nadie**.

## REGLAS DE CALIDAD

- **Accesibilidad WCAG 2.1 AA**: contraste verificado, foco visible, navegación completa por teclado, etiquetas en los formularios, `aria-label` donde haga falta.
- **Todos los estados**: carga (con esqueletos, no ruedas giratorias), vacío, error, sin permiso. Un prototipo sin estados vacíos se nota.
- **Español claro**, en segunda persona (tuteo, como comunica Fedesoft). Los botones dicen la acción exacta: "Pagar ahora", "Descargar certificado", "Inscribirme". La confirmación usa el mismo verbo: "Certificado descargado".
- **Cero jerga técnica** de cara al afiliado: nada de "webhook", "tenant", "endpoint".
- **Responsive real**, verificado a 360 px, 768 px y 1440 px.
- **Microinteracciones con criterio**: transiciones de 150–200 ms, respeta `prefers-reduced-motion`. Que se sienta vivo, no que distraiga.
- La pantalla se ve completa **en reposo**, sin necesidad de desplazarse para que aparezca el contenido.

## LO QUE NO DEBES HACER

- Backend, base de datos, autenticación real o llamadas de red.
- Usar las credenciales o datos reales de ningún afiliado.
- Prometer en la interfaz algo que el proyecto no contempla.
- Rellenar con texto de relleno o con imágenes de archivo genéricas.
- Exceso de degradados, sombras difusas o animaciones: el sector es serio, el diseño debe ser limpio y confiable.

## ENTREGABLES

1. Proyecto Next.js compilable en `apps/prototipo/` dentro de este repositorio.
2. Las diez pantallas navegables entre sí.
3. Selector de escenarios funcionando en las cuatro combinaciones.
4. Tema claro y oscuro.
5. `README.md` con cómo ejecutarlo (`pnpm dev`) y qué muestra cada pantalla.
6. Datos simulados organizados y comentados en `src/lib/mock/`.

## CRITERIOS DE ACEPTACIÓN

- [ ] `pnpm build` termina sin errores ni advertencias de tipos.
- [ ] Las diez rutas cargan y se navega entre ellas sin callejones sin salida.
- [ ] Cambiar de escenario transforma la aplicación completa de forma coherente.
- [ ] El recorrido *estado de cuenta → pagar → resultado con CUFE → certificado habilitado* funciona de principio a fin.
- [ ] El escenario "pago vencido" bloquea el certificado **y explica por qué**.
- [ ] El líder de talento no ve la sección de facturación por ninguna vía.
- [ ] Contraste AA verificado; ningún texto sobre `#0F8BFF`.
- [ ] Legible y usable a 360 px de ancho.
- [ ] Tema oscuro cuidado, no una inversión automática.
- [ ] Ni una sola cadena de texto de relleno.

## ORDEN SUGERIDO DE TRABAJO

1. Proyecto base, tokens de Tailwind, tipografías, componentes primitivos (botón, tarjeta, chip, campo, tabla).
2. Estructura: encabezado, navegación por rol, `DemoContext` con los cuatro escenarios.
3. Datos simulados completos con el contenido real de arriba.
4. Pantalla de Inicio — la que enamora. Dedícale el mayor cuidado.
5. Recorrido de pago completo: estado de cuenta → pagar → resultado → certificado.
6. Mi empresa, Formación, Directorio.
7. Cuenta estratégica, Oportunidades, Consola.
8. Pulido: estados, accesibilidad, tema oscuro, responsive, microinteracciones.

**Antes de escribir código**, enumera tus supuestos y propón la estructura de carpetas. Después construye de corrido, sin pedir aprobación en cada paso.

# ══════════ FIN DEL PROMPT ══════════

---

## Notas para quien coordina

- **Documentos que respaldan este prompt** (por si el prototipo genera preguntas): `docs/03-arquitectura-de-informacion.md` (las 33 pantallas completas y los recorridos), `docs/design/identidad-visual.md` (tokens y su validación de contraste), `docs/02-catalogo-de-requerimientos.md` (qué debe cumplir cada módulo), `docs/audit/2026-09-ecosistema-web-actual.md` sección 6 (qué hay hoy).
- **El prototipo no es descartable**: sus componentes y tokens se convierten en `packages/ui` cuando arranque la Fase 0, y sus pantallas en el *shell* de experiencia. Por eso se pide Next.js + Tailwind y no una herramienta de maquetado.
- **Qué queda fuera a propósito**: comunidades, insights y verticales como pantallas propias. Aparecen mencionadas en Inicio y en la cuenta estratégica para que se vea el alcance, sin costar tiempo de construcción.
- **Riesgo a vigilar**: que la demostración genere la expectativa de que el portal ya existe. En la presentación conviene decir explícitamente que es un prototipo visual sin sistema detrás.
