# ADR-003 · Modelo operativo de desarrollo asistido por agentes

- **Estado:** Aceptado
- **Fecha:** 2026-09-15
- **Decisores:** Cenisoft (gestor TI) · Tech lead A0

## Contexto
El documento base define nueve responsabilidades técnicas (A1–A9) coordinadas por un orquestador (A0) y advierte contra "un agente por pantalla" y contra pedir "construye toda la plataforma". Se necesita fijar cómo se materializa eso en este repositorio con Claude Code.

## Opciones consideradas
1. **Una sola sesión que hace todo** — simple; contras: contexto saturado, sin separación de responsabilidades, sin gates de veto reales.
2. **Un agente por módulo/pantalla** — paralelismo aparente; contras: duplicación de fuente de verdad, módulos desconectados (exactamente lo que el documento prohíbe).
3. **Orquestador + subagentes por responsabilidad estable** con contratos de entrada/salida, gates de veto (A5, A7) y una épica por iteración.

## Decisión
Opción 3, implementada así:
- **A0** es la sesión principal de Claude Code (tech lead). Descompone épicas en historias, invoca subagentes, integra y abre PRs. No implementa cambios grandes sin revisión de A1.
- **A1–A9** son subagentes definidos en `.claude/agents/*.md` (mismo nombre que su rol), invocables desde la sesión principal. Cada uno tiene misión, entregables, reglas y formato de salida fijos.
- **Modelos por agente:** juicio y seguridad en el modelo de mayor capacidad (A0, A1, A5); implementación y verificación en el modelo rápido de alta calidad (A2, A3, A4, A6, A7, A8); documentación en el modelo económico (A9). Los identificadores concretos se fijan en la sección "Bajo qué modelo" del plan y se revisan al cambiar la oferta de modelos.
- **Unidad de trabajo:** una épica o historia por iteración, con criterios de aceptación verificables antes de codificar. Nunca "toda la plataforma".
- **Gates:** A5 y A7 pueden marcar `BLOCKED`; A0 integra solo sin bloqueantes y con lint/typecheck/test/build en verde.
- **Aislamiento:** implementación en ramas o worktrees por historia; cada agente trabaja solo en los archivos de su dominio.
- **Humano en el circuito:** el gestor TI de Cenisoft aprueba plan, ADRs con impacto de negocio/costo y cada PR a `main`; Fedesoft cierra las decisiones de negocio pendientes.

## Consecuencias
- Contexto de la sesión principal protegido (los subagentes traen conclusiones, no volcados) → menor costo por token y menos deriva.
- Más llamadas y coordinación por historia; se compensa con menos re-trabajo y con la trazabilidad exigida por el DoD.
- Revisar tras las primeras tres iteraciones: fusionar agentes poco usados o dividir los saturados.
