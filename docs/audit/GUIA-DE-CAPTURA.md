# Guía de captura de la zona de afiliados actual

El entorno de desarrollo no tiene acceso de red a `fedesoft.org` ni a sus subdominios, así que la auditoría de la zona autenticada depende de material capturado manualmente. Esta guía convierte esa captura en unos minutos de trabajo.

**Nunca** subas credenciales a este repositorio. Revisa cada archivo antes de confirmarlo: si aparecen datos personales de otras empresas o contactos, tacha o elimina esa parte.

---

## Opción 1 · Inventario de campos por consola (lo más valioso, 30 segundos por pantalla)

Es lo que más necesito: los campos exactos de cada formulario. No captura datos, solo la **estructura**.

1. Inicia sesión y abre la pantalla que quieras inventariar.
2. Abre las herramientas de desarrollo: `Cmd+Option+J` en Chrome (Mac).
3. Pega el bloque de abajo y pulsa Enter.
4. Copia el resultado y pégalo en el chat, o guárdalo como `docs/audit/capturas/campos-<pantalla>.json`.

```js
copy(JSON.stringify({
  url: location.href,
  titulo: document.title,
  menu: [...document.querySelectorAll('nav a, .menu a, #menu a')]
        .map(a => ({ texto: a.innerText.trim(), href: a.getAttribute('href') }))
        .filter(x => x.texto).slice(0, 60),
  formularios: [...document.forms].map(f => ({
    accion: f.getAttribute('action'), metodo: f.method,
    campos: [...f.querySelectorAll('input,select,textarea')]
      .filter(e => !['hidden','submit','button'].includes(e.type))
      .map(e => ({
        etiqueta: (e.labels?.[0]?.innerText
                || e.closest('label')?.innerText
                || e.getAttribute('aria-label')
                || e.placeholder || '').trim().slice(0, 120),
        nombre: e.name, tipo: e.type || e.tagName.toLowerCase(),
        obligatorio: e.required || e.getAttribute('aria-required') === 'true',
        maxlength: e.maxLength > 0 ? e.maxLength : undefined,
        opciones: e.tagName === 'SELECT'
          ? [...e.options].map(o => o.text.trim()).slice(0, 50) : undefined
      }))
  }))
}, null, 2)); console.log('Copiado al portapapeles');
```

> `copy()` deja el resultado en el portapapeles. Si tu navegador lo bloquea, cambia `copy(` por `console.log(` y copia desde la consola.

## Opción 2 · Guardar la página completa

En cada pantalla: `Cmd+S` → formato **"Página web, completa"** → guardar dentro de `docs/audit/capturas/`.
Conserva el HTML con sus campos y estilos, que es lo que permite reconstruir el flujo real.

## Opción 3 · Capturas de pantalla

Para lo visual y el recorrido: `Cmd+Shift+4` o captura de página completa desde el navegador. Útil sobre todo para entender la navegación y la experiencia actual.

---

## Qué capturar, en orden de valor

| # | Pantalla | Por qué importa | Nombre sugerido |
|---|---|---|---|
| 1 | **Actualización de datos / perfil de empresa** | De aquí sale el esquema real de `Organization` y `Contact` y el mapeo del padrón (`RD-004`) | `01-perfil` |
| 2 | **Inicio de sesión** | Qué identifica al usuario, recuperación de clave, segundo factor (`RF-IDE-001`) | `02-login` |
| 3 | **Página de inicio tras entrar** | El menú completo y el orden de las secciones: es la línea base de la nueva navegación | `03-inicio` |
| 4 | **Estado de cuenta y pago** | Cómo se presenta la deuda, qué hace el botón de pago, qué proveedor y qué comprobante (`RF-PAG-001`) | `04-pagos` |
| 5 | **Solicitud de certificado** | Si hoy es formulario o descarga, y qué datos pide (`RF-CER-001`) | `05-certificado` |
| 6 | **Ficha del directorio** | Campos que publica la empresa (`RF-DIR-001`) | `06-directorio` |
| 7 | **Inscripción a formación y comunidades** | Si son formularios internos o externos (`RF-FOR-002`) | `07-formacion` |
| 8 | **Vista administrativa**, si la cuenta la tiene | Insumo directo para la consola interna (`RA-OPS-001`) | `08-admin` |

Con las dos primeras ya puedo avanzar en el modelo de datos; las demás completan el mapa de trámites.

## Qué produce esto

Con el material capturado se completa `docs/audit/2026-09-ecosistema-web-actual.md` (hoy marcado como auditoría parcial), se cierra el requerimiento `RQ-FED-028` y se puede iniciar el mapeo de campos para la migración del padrón.
