# Identidad visual — tokens y reglas de UI del portal

**Versión 0.3 · 22 de septiembre de 2026 · Fuente: manual de marca oficial de Fedesoft**

Reemplaza la v0.1, que trabajaba con valores estimados del logo en pantalla. **Todos los colores y tipografías de este documento provienen del manual de marca**; lo único derivado se señala como tal.

---

## 1. Colores principales

| Token | Hex | Contraste sobre blanco | Uso |
|---|---|---|---|
| `--brand-navy` | **`#0D2343`** | **15,7:1** ✓ AA/AAA | Texto principal, titulares, superficies oscuras, pie de página |
| `--brand-azure` | **`#008BED`** | **3,6:1** ✗ texto · ✓ componentes | **Solo acento**: la barra, íconos, indicadores, bordes de foco |

> **Regla medida e innegociable.** El azul de marca no alcanza AA como texto (3,6:1). Nunca se usa en texto de cuerpo ni en botones con texto blanco. Para eso está `#11428a`.

## 2. Colores complementarios (del manual)

Los trece complementarios del manual, con su función asignada en el portal según contraste medido:

| Hex | Contraste | Función en el portal |
|---|---|---|
| `#0e2343` | — | Superficie oscura profunda |
| **`#11428a`** | **9,7:1** ✓ | **Interactivo**: botones primarios, enlaces, estado "información" |
| `#2ea0f9` | 5,6:1 sobre navy ✓ | Acento sobre fondos oscuros |
| `#3cacc8` · `#02f3f6` · `#c7feff` | `#c7feff` 14,2:1 sobre navy ✓ | Turquesas: gráficas y texto sobre superficies oscuras |
| `#fce58c` · `#fcd02f` · `#eabc12` | — | Ámbar: advertencias y destacados en tema oscuro |
| `#5c3cc8` · `#876ddc` · `#cb6ce6` | — | Serie categórica en visualización de datos |
| **`#637287`** | **4,9:1** ✓ | **Texto secundario** |
| `#a5c9e6` | 9,0:1 sobre navy ✓ | Texto secundario en tema oscuro |
| `#b4b4b4` · `#d9d9d9` | — | Bordes y divisores |
| `#737373` · `#333333` | — | Grises neutros de apoyo |

**Derivado (único valor no literal del manual):** `--navy-abismo: #071429`, un navy profundo para el lienzo cinematográfico de la página pública. Pertenece a la familia del navy principal; se usa solo como fondo, nunca como color de texto o de marca.

## 3. Tipografía

| Rol | Familia | Origen |
|---|---|---|
| Principal — titulares, cifras, interfaz | **Montserrat** | Manual de marca |
| Cuerpo y textos largos | **Lato** | Manual de marca (alterna) |
| Identificadores y datos — NIT, CUFE, folio, montos | JetBrains Mono | Funcional, no de marca: garantiza `tabular-nums` y legibilidad de códigos |

Calibri figura como alterna en el manual; se reserva para documentos ofimáticos, no para la interfaz web.

Escala (px): 12 · 14 · 16 · 18 · 22 · 28 · 36 · 44 · 64 · 104. Titulares en pesos 300 (grandes, editoriales) y 600–700 (interfaz). Etiquetas en mayúsculas con `letter-spacing: 0.08–0.2em`.

## 4. El motivo gráfico: la barra

Las horizontales de la `f` y la `t` del wordmark se extienden en azul y abrazan la palabra. El portal reutiliza ese gesto: rectángulo de 3–4 px de alto, 28–40 px de ancho, radio 2 px, en `--brand-azure`.

Usos: delante de etiquetas de sección, indicador de pestaña activa, borde superior de la tarjeta que concentra la acción. **Un énfasis por vista.**

## 5. Semánticos

| Estado | Texto | Fondo suave | Uso |
|---|---|---|---|
| Éxito | `#157347` | `#DDF5E8` | Afiliación al día, pago aprobado, factura emitida |
| Advertencia | `#8A5A10` | `#FDF3D9` | Cargo por vencer, afiliación pendiente |
| Error | `#C62828` | `#FBE3E3` | Pago rechazado, afiliación vencida |
| Información | `#11428A` | `#E6F2FD` | En revisión, avisos |

Los semánticos son independientes del acento de marca y no se sustituyen por complementarios del manual: su función es comunicar estado, no identidad.

### Regla medida: advertencia y error nunca se distinguen solo por color

El ámbar `#8A5A10` y el rojo `#C62828` se separan **ΔE 3,8 con deuteranopia** y **14,3 con visión normal** —por debajo del piso de 15—. Son dos colores que buena parte de la gente no puede diferenciar, y quien sí puede los confunde a primera vista.

No es motivo para cambiarlos: son los valores del manual y funcionan como texto. Es motivo para no apoyar información en ellos.

- **Todo estado lleva ícono y etiqueta**, no solo color. Los `Chip` del portal ya lo hacen.
- **Prohibida la barra apilada** que separe advertencia de error por color. Se usan filas separadas, cada una con su ícono, su etiqueta y su cifra.
- **Para magnitud dentro de un mismo estado** —por ejemplo la antigüedad de la mora— se usa un solo tono graduado de claro a oscuro, nunca colores distintos por tramo.
- La graduación se describe como «más intenso», no «más oscuro»: en tema oscuro el paso fuerte es el más claro.

Medido con el validador de paletas del método de visualización de datos; el criterio es ΔE ≥ 8 para daltonismo y ≥ 15 para visión normal.

## 6. Tema oscuro

| Token | Claro | Oscuro |
|---|---|---|
| Fondo | `#F5F8FC` | `#071429` |
| Superficie | `#FFFFFF` | `#0F2547` |
| Texto | `#0D2343` | `#EAF2FB` |
| Secundario | `#637287` | `#A5C9E6` |
| Borde | `#DDE5EE` | `#1D3B66` |
| Acento | `#008BED` | `#2EA0F9` |
| Interactivo | `#11428A` | `#A5C9E6` |

## 7. Implementación

Los tokens viven en `src/app/globals.css` del prototipo (`cenisoft-repo/fedesoft`), definidos en `:root` y expuestos a Tailwind con `@theme inline`. Los componentes usan siempre los nombres semánticos (`text-ink`, `bg-surface`, `border-line`, `text-link`), nunca valores hex sueltos.

## 8. Pendientes para cerrar la identidad

1. **Logo en vectores**: horizontal, vertical, negativo y monocromo, más el bloqueo conjunto `fedesoft | cenisoft` que aparece en el manual.
2. **Paleta de visualización de datos**: la serie categórica del manual (`#5c3cc8 · #876ddc · #cb6ce6`) aún no se ha validado para daltonismo. Hacerlo antes de la primera gráfica con más de dos series.
3. **Iconografía**: biblioteca base (hoy Lucide) y validación con el manual.
4. **Estilo fotográfico** para directorio, comunidades y la página pública, que hoy se resuelve con un campo generativo.
