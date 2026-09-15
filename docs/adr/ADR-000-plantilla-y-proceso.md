# ADR-000 · Plantilla y proceso de decisiones de arquitectura

- **Estado:** Aceptado
- **Fecha:** 2026-09-15
- **Decisores:** Tech lead (A0) con Fedesoft/Cenisoft; revisión A1

## Contexto
El documento base exige que ninguna decisión que altere datos, seguridad o negocio se implemente sin registro. Los ADR (Architecture Decision Records) son la memoria del proyecto y evitan re-decidir o que la IA improvise arquitectura.

## Decisión
Toda decisión relevante se registra en `docs/adr/ADR-NNN-titulo-corto.md` con esta plantilla:

```markdown
# ADR-NNN · Título

- **Estado:** Propuesto | Aceptado | Reemplazado por ADR-XXX | Rechazado
- **Fecha:** AAAA-MM-DD
- **Decisores:** quién decide y quién revisa

## Contexto
Qué problema o fuerza obliga a decidir. Enlazar requisitos del documento base.

## Opciones consideradas
1. Opción A — pros / contras
2. Opción B — pros / contras

## Decisión
Qué se decide y por qué (criterios: control del dato, encaje fiscal, TCO, velocidad, seguridad).

## Consecuencias
Positivas, negativas, deuda asumida, qué habrá que revisar y cuándo.
```

Reglas del proceso:
1. Un ADR nace en estado **Propuesto** por A1 (o A0) y pasa a **Aceptado** con visto bueno de Fedesoft cuando afecta negocio, costos o proveedores.
2. Un ADR nunca se edita para cambiar la decisión: se crea uno nuevo que lo reemplaza.
3. Las decisiones pendientes viven en `docs/00-plan-de-ejecucion.md` con una propuesta por defecto; al cerrarse, se convierten en ADR.
4. Cada PR que implemente una decisión enlaza su ADR en la descripción.

## Consecuencias
- Trazabilidad completa entre requisito → decisión → código.
- Costo pequeño y constante de documentación, compensado por menos re-trabajo y menos contexto que re-explicar a cada sesión.
