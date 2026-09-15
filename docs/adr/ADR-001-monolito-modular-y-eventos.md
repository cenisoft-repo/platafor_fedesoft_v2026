# ADR-001 · Monolito modular con límites de dominio y eventos internos (outbox)

- **Estado:** Aceptado (ratifica la sección 2 del documento base)
- **Fecha:** 2026-09-15
- **Decisores:** Fedesoft/Cenisoft (documento base) · Tech lead A0 · Revisión A1

## Contexto
La plataforma tiene 13 dominios y un recorrido transaccional crítico (pago → webhook → factura DIAN → afiliación → certificado) que exige consistencia, idempotencia y recuperación ante fallos. El equipo inicial es pequeño y asistido por IA; la complejidad operativa de microservicios no se justifica y fragmentaría la fuente única de verdad.

## Opciones consideradas
1. **Microservicios por dominio** — escalado y despliegue independientes; contras: complejidad operativa, transacciones distribuidas, duplicación de datos del núcleo, costo alto para un equipo pequeño.
2. **Monolito clásico sin límites** — máxima velocidad inicial; contras: acoplamiento, módulos que crean "su versión" de empresa/afiliación, imposible separar luego.
3. **Monolito modular + eventos de dominio** — un despliegue, límites de módulo estrictos, comunicación interna por eventos persistidos (outbox) y consumidores idempotentes; separable en servicios cuando haya volumen o equipos independientes.

## Decisión
Opción 3. Un solo backend (`apps/api`) organizado por módulos de dominio con API pública mínima entre módulos; efectos asíncronos críticos (facturación, correos, certificados, webhooks salientes) se confirman en la misma transacción de negocio mediante tabla `outbox` y se procesan en `apps/worker` con reintentos e idempotencia. Persistencia única en PostgreSQL con `organization_id` como frontera de aislamiento.

## Consecuencias
- Positivas: consistencia transaccional real, un solo pipeline, menos superficie operativa, refactor a servicios posible sin reescritura de dominio.
- Negativas: disciplina de límites depende de revisión (A1) y lint de dependencias entre módulos; el worker es un segundo proceso que operar.
- Revisar cuando: un módulo necesite escalado independiente o un equipo externo asuma un dominio completo.
