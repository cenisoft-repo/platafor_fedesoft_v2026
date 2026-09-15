# Identidad visual — tokens y reglas de UI del portal

**Versión 0.1 · 15 de septiembre de 2026 · Estado: provisional, pendiente de manual de marca**

**Fuentes:** wordmark oficial de Fedesoft (suministrado en sesión), comunicación pública de la federación y los documentos rectores. El sitio `fedesoft.org` no fue accesible desde el entorno y no se dispone aún del manual de marca: los valores de color se tomaron del logo en pantalla y se **validaron por contraste WCAG 2.1**; deben confirmarse contra los archivos vectoriales (sección 8).

---

## 1. La marca en una lectura

- **Wordmark** `fedesoft` en minúsculas, sans geométrica de terminales redondeados, peso bold, tracking ajustado. Sin isotipo separado (por confirmar).
- **Bicromía con significado:** `fede` en azul marino profundo (institución, respaldo gremial) y `soft` en azul brillante (tecnología, energía).
- **Gesto gráfico:** las barras horizontales de la `f` inicial y de la `t` final se extienden en azul brillante y "abrazan" la palabra. Ese trazo —**la barra**— es el motivo que el portal reutiliza (sección 4).
- **Personalidad:** cercana y moderna (minúsculas, formas redondeadas) sobre una base seria (marino). Para el portal: claridad, precisión y rapidez; nada solemne ni burocrático.

## 2. Paleta (tokens)

### Marca
| Token | Hex | Uso |
|---|---|---|
| `--brand-navy` (= `navy-900`) | `#0C2340` | Titulares, texto de énfasis, superficies oscuras (con texto blanco), pie de página |
| `--brand-azure` (= `azure-500`) | `#0F8BFF` | **Acento**: la barra, íconos, indicadores, texto grande (≥ 24 px o ≥ 19 px bold), bordes de foco |

### Escalas
| Token | Hex | Uso |
|---|---|---|
| `navy-950` | `#071529` | Fondo del tema oscuro más profundo |
| `navy-700` | `#1B3A66` | Bandas y superficies medias en tema oscuro |
| `azure-700` | `#0A63BF` | **Interactivo**: enlaces, botón primario (texto blanco), texto de estado "info" |
| `azure-400` | `#4DA6FF` | Acento e íconos en tema oscuro |
| `azure-300` | `#8CC4FF` | Enlaces en tema oscuro, bandas claras |
| `azure-100` | `#E3F1FF` | Fondos de resaltado e "info" |

### Neutros (con sesgo azul, nunca gris puro)
| Token | Hex (claro) | Hex (oscuro) | Uso |
|---|---|---|---|
| `--bg` | `#F4F7FB` | `#0A1628` | Fondo de página |
| `--surface` | `#FFFFFF` | `#11223B` | Tarjetas, tablas, paneles |
| `--ink` | `#14213A` | `#E8EEF7` | Texto principal |
| `--muted` | `#5B6B82` | `#A9B7CB` | Texto secundario, etiquetas |
| `--line` | `#D9E2EE` | `#24385A` | Bordes y divisores |

### Semánticos (independientes del acento)
| Estado | Texto / ícono | Fondo suave | Uso típico |
|---|---|---|---|
| Éxito | `#157347` | `#DDF5E8` | Afiliación "Al día", pago aprobado, factura emitida |
| Advertencia | `#8A5A10` | `#FCEFD3` | Cargo próximo a vencer, afiliación "Pendiente" |
| Error | `#C62828` | `#FBE3E3` | Pago rechazado, afiliación "Vencida", factura rechazada |
| Información | `#0A63BF` | `#E3F1FF` | "En revisión", avisos |

### Reglas de contraste (medidas)
| Combinación | Ratio | Veredicto |
|---|---|---|
| `navy-900` sobre blanco | 15,8:1 | Texto de cualquier tamaño |
| `azure-700` sobre blanco / blanco sobre `azure-700` | 5,9:1 | Texto normal y botones ✓ AA |
| `azure-500` sobre blanco / blanco sobre `azure-500` | 3,4:1 | **Solo** texto grande, íconos, bordes, barras (AA para componentes). Nunca texto de cuerpo ni botón con texto blanco |
| `--muted` sobre `--bg` | 5,1:1 | Texto secundario ✓ |
| `azure-400` sobre `--surface` oscuro | 6,2:1 | Acento e íconos en oscuro ✓ |
| `azure-300` sobre `--surface` oscuro | 8,7:1 | Enlaces en oscuro ✓ |

## 3. Tipografía

| Rol | Familia (Google Fonts) | Pesos | Notas |
|---|---|---|---|
| Titulares y cifras destacadas | **Nunito** | 700, 800 | Eco del wordmark (geométrica redondeada). Titulares en minúsculas naturales, no en mayúsculas forzadas; `letter-spacing: -0.01em`; `text-wrap: balance` |
| Cuerpo e interfaz | **Source Sans 3** | 400, 600 | 16 px base, `line-height 1.5`, ancho de lectura ≤ 70 caracteres; muy legible en tablas y formularios |
| Identificadores y datos | **JetBrains Mono** | 400, 500 | NIT, CUFE, folio, número de factura, códigos (`EPIC-03`, `S7`). `font-variant-numeric: tabular-nums` en montos y columnas numéricas |

Escala tipográfica (px): 12 · 14 · 16 · 18 · 22 · 28 · 36 · 44. Etiquetas en mayúsculas con `letter-spacing: 0.08em` y 12–13 px.
Pila de respaldo: `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif` (y `ui-monospace, Menlo, monospace` para datos).
Si el manual de marca define una tipografía institucional, reemplaza a Nunito/Source Sans 3 manteniendo los roles.

## 4. Motivo gráfico: la barra

- **Forma:** rectángulo horizontal en `azure-500`, alto 3–4 px, ancho 28–40 px, radio 2 px.
- **Usos:** delante de las etiquetas de sección (eyebrow); indicador de pestaña activa; borde superior de la tarjeta que concentra la acción de la vista (estado de cuenta, certificado listo); barra de progreso de un trámite.
- **Límite:** un énfasis por vista. No se estampa en cada tarjeta ni se usa como decoración repetida.

## 5. Componentes clave del portal

- **Estado de afiliación:** chip con texto e ícono, nunca solo color. `Al día` (éxito) · `Pendiente` (advertencia) · `Vencida` (error) · `En revisión` (información).
- **Segmento:** chip neutro `MIPYME` · `Empresa grande` · `Cuenta estratégica`. Define qué navegación y qué panel se muestran.
- **Montos:** pesos colombianos con separador de miles `.` y sin decimales por defecto (`$ 1.250.000`), `tabular-nums`, alineados a la derecha.
- **Fechas:** `15 sep 2026` en interfaz; ISO 8601 en datos y exportaciones.
- **Identificadores:** NIT con dígito de verificación (`900.123.456-7`); CUFE truncado con acción de copiar.
- **Botones:** primario fondo `azure-700` + texto blanco, radio 8 px; secundario borde `--line` + texto `navy-900`; destructivo en rojo semántico. Texto = acción exacta: "Pagar ahora", "Descargar certificado", "Inscribirme".
- **Foco visible:** anillo de 2 px en `azure-500` con desplazamiento de 2 px, en todo control.
- **Tablas:** encabezado fijo, filas de 44 px, cebra sutil con `--bg`, columnas numéricas a la derecha.
- **Estados vacíos y errores:** título claro + qué hacer a continuación; sin jerga interna (nada de "webhook" o "tenant" de cara al afiliado).
- **Sello #SoyAfiliadoFedesoft y certificado:** usan el logo oficial en vectores desde `docs/design/brand/`; nunca reconstrucciones tipográficas del wordmark.

## 6. Voz y tono

- **Tuteo**, como en la comunicación pública de Fedesoft ("Afíliate y potencia tu impacto").
- Frases cortas, voz activa, verbos de acción en controles; el resultado se confirma con el mismo verbo ("Certificado descargado").
- Términos del dominio sí (afiliación, estado de cuenta, factura electrónica, CUFE, vertical, comunidad); jerga técnica interna no.
- Errores: qué pasó y cómo resolverlo, sin disculpas ni vaguedad.

## 7. Implementación

```css
:root {
  --brand-navy: #0C2340; --brand-azure: #0F8BFF;
  --navy-950: #071529; --navy-700: #1B3A66;
  --azure-700: #0A63BF; --azure-400: #4DA6FF; --azure-300: #8CC4FF; --azure-100: #E3F1FF;
  --bg: #F4F7FB; --surface: #FFFFFF; --ink: #14213A; --muted: #5B6B82; --line: #D9E2EE;
  --success: #157347; --success-bg: #DDF5E8; --warning: #8A5A10; --warning-bg: #FCEFD3;
  --danger: #C62828; --danger-bg: #FBE3E3; --info: #0A63BF; --info-bg: #E3F1FF;
  --font-display: "Nunito", system-ui, sans-serif;
  --font-body: "Source Sans 3", system-ui, sans-serif;
  --font-data: "JetBrains Mono", ui-monospace, Menlo, monospace;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --bg: #0A1628; --surface: #11223B; --ink: #E8EEF7; --muted: #A9B7CB; --line: #24385A;
} }
:root[data-theme="dark"] { --bg: #0A1628; --surface: #11223B; --ink: #E8EEF7; --muted: #A9B7CB; --line: #24385A; }
```

En Tailwind (`packages/ui`): exponer los mismos nombres en `theme.extend.colors` y `fontFamily`, de modo que los componentes usen `text-ink`, `bg-surface`, `border-line`, `text-azure-700`, `font-display`, y nunca valores hex sueltos.

## 8. Pendientes para cerrar la identidad

1. **Manual de marca**: paleta oficial exacta, tipografía institucional, usos prohibidos, área de protección del logo.
2. **Logo en vectores** en `docs/design/brand/`: horizontal, versión negativa (sobre marino), monocroma; isotipo si existe.
3. **Iconografía** (biblioteca base, p. ej. Lucide) y **estilo fotográfico** para el directorio y comunidades.
4. **Validar los hex** de `navy-900` y `azure-500` con el archivo vectorial; hoy son estimaciones a partir del logo en pantalla.
