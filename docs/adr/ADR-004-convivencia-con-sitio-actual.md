# ADR-004 · Convivencia del portal con el ecosistema web actual (WordPress)

- **Estado:** Propuesto (requiere validación de Fedesoft)
- **Fecha:** 2026-09-15
- **Decisores:** Fedesoft (Presidencia Ejecutiva / comunicaciones) · Cenisoft · Tech lead A0

## Contexto
Hoy la presencia digital está repartida en varios sitios (ver `docs/audit/2026-09-ecosistema-web-actual.md`): `fedesoft.org` (sitio institucional y zona de afiliados), `afiliaciones.fedesoft.org` (proceso de afiliación), `pagos.fedesoft.org` (recaudo), `fedesoft.co` (directorio de afiliados) y formularios externos. Esa fragmentación es el problema que el portal resuelve, pero el sitio institucional (noticias, eventos, posicionamiento gremial) no es parte del portal del afiliado.

## Opciones consideradas
1. **Reemplazar todo** (sitio público + portal) en Next.js — un solo stack; contras: alcance mucho mayor, el equipo de comunicaciones pierde su CMS, retrasa el valor para el afiliado.
2. **Portal dentro de WordPress** (plugins de membresía) — velocidad aparente; contras: viola fuente única, sin facturación DIAN nativa, seguridad y datos atados a plugins (ya descartado por el documento de arquitectura).
3. **Portal independiente en subdominio propio** (p. ej. `portal.fedesoft.org`), WordPress sigue como sitio público; la zona de afiliados, afiliaciones, pagos y directorio migran al portal con redirecciones 301 y enlaces profundos desde el sitio.

## Decisión
Opción 3. El portal es la fuente única del afiliado; WordPress conserva contenido institucional y marketing. Reglas de convivencia:
- El directorio público de afiliados se sirve desde el portal (o vía API pública de solo lectura consumida por el sitio), nunca se mantiene a mano en WordPress.
- Formularios de trámites (afiliación, actualización de datos, certificado, pagos, inscripciones) se retiran del sitio y de Google Forms al activarse cada módulo.
- Misma identidad visual (tokens en `docs/design/identidad-visual.md`) para que el paso sitio → portal sea transparente.
- Login único del portal; el sitio público no autentica afiliados.
- Plan de redirecciones y comunicación por módulo en la Fase 5.

## Consecuencias
- Alcance del portal acotado al afiliado; comunicaciones mantiene su herramienta.
- Dos sistemas que operar durante la transición; se mitiga con el plan de redirecciones y la API pública del directorio.
- Pendiente de Fedesoft: nombre del subdominio, dueño del DNS y fecha de retiro de `afiliaciones.` y `pagos.`.
