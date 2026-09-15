# ADR-005 · Consola de administración como aplicación separada, dominio Config y analítica como proyecciones de solo lectura

- **Estado:** Propuesto (requiere validación de Cenisoft y Fedesoft)
- **Fecha:** 2026-09-15
- **Decisores:** Gestor TI de Cenisoft · Tech lead A0 · Revisión A1/A5

## Contexto
Antes de la Fase 1 se definió la operabilidad completa del sistema desde el equipo de Fedesoft (`docs/01-consola-administracion.md`): roles internos, parametrización, CRUDs, gestiones operativas y analítica. Los documentos rectores solo preveían un "admin básico" y "parametrización" sin ubicarlos en la arquitectura. Hay que decidir dónde vive la consola, cómo se modela la configuración y cómo se sirve la analítica sin violar la fuente única de verdad.

## Opciones consideradas
1. **Área `/admin` dentro del portal (`apps/web`)** — menos piezas; contras: el bundle público incluye código interno, misma política de sesión/MFA para públicos e internos, imposible restringir por red, despliegues acoplados.
2. **Aplicación separada `apps/admin`** en el monorepo, mismo backend con endpoints `/admin/v1/*` — aislamiento de seguridad (dominio propio, allowlist, MFA obligatoria, no indexada), despliegue independiente; contras: una app más que operar (mitigado por `packages/ui` y `packages/contracts` compartidos).
3. **Herramienta de administración genérica** (admin generado sobre la BD) — rapidez inicial; contras: salta las reglas de dominio y la auditoría, viola "autorización siempre en servidor" y "ningún módulo escribe fuera del dominio".

Para la configuración: (a) constantes en código, (b) tabla clave-valor sin esquema, (c) **dominio Config** con parámetros tipados, alcance, vigencia y versión. Para la analítica: (a) consultas directas sobre tablas transaccionales, (b) tablas paralelas mantenidas por los módulos, (c) **esquema `analytics` derivado** (vistas materializadas y hechos alimentados por eventos y jobs).

## Decisión
- **Opción 2:** `apps/admin` (Next.js) separada, mismo `apps/api` con módulos de administración protegidos por roles internos (RBAC + ABAC). El portal público nunca contiene código de administración.
- **Config como dominio:** `Parameter`, `Catalog`/`CatalogItem`, `RateTable`/`Rate`, `Template` versionado, `FeatureFlag`, `ProviderSetting`; valores validados por esquema, con alcance (global → segmento → empresa), vigencia y versión; cambios auditados, con doble control donde aplique, y publicados como `config.changed`.
- **Analítica derivada:** esquema `analytics` de solo lectura con vistas materializadas y tablas de hechos, refrescado por eventos de dominio y jobs; diccionario de métricas versionado; dashboards oficiales en la consola y exploración *ad hoc* con Metabase sobre réplica de lectura. Ningún módulo mantiene tablas paralelas de reporte.
- **Nuevos dominios:** Config, Analytics, Support (soporte controlado e impersonación auditada), DataOps (importación, exportación, solicitudes de datos personales).
- **Épicas transversales:** EPIC-13 (consola y parametrización) y EPIC-14 (analítica y resultados), entregadas por rebanadas en cada fase.

## Consecuencias
- Positivas: frontera de seguridad clara entre público e interno; reglas de negocio configurables sin despliegue; un solo número por métrica; la consola opera sobre los mismos casos de uso que el portal (sin lógica duplicada).
- Negativas: una app y un esquema más que mantener; el alcance de cada fase crece (opciones A/B en `docs/01-consola-administracion.md`, sección 9).
- Revisar cuando: la analítica requiera cargas que afecten a la base transaccional (pasar a réplica dedicada o almacén analítico) o cuando la consola necesite su propio ciclo de release.
