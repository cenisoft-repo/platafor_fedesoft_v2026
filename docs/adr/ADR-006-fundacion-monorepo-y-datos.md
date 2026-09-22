# ADR-006 · Fundación: monorepo, modelo de datos e invariantes en la base

**Estado:** Aceptada · 22 de septiembre de 2026
**Contexto:** EPIC-00. Primera línea de código de aplicación del proyecto.
**Relacionadas:** ADR-001 (monolito modular), ADR-002 (stack), ADR-005 (consola separada).

---

## Contexto

El repositorio contenía solo documentación. Había que decidir dónde vive la plataforma, cómo se organiza y —lo más consecuente— dónde se hacen cumplir las reglas que el proyecto declara no negociables.

La Etapa C del plan depende de cuatro decisiones que Fedesoft aún no toma: proveedor de identidad, pasarela, facturador y la regla de "al día". **Ninguna de ellas bloquea la fundación**, y esperarlas habría dejado el proyecto parado sin necesidad.

## Decisiones

### 1. La plataforma vive en este repositorio, junto a su contexto

`platafor_fedesoft_v2026` pasa de ser un repositorio de documentos a un monorepo pnpm + Turborepo con `apps/`, `packages/` e `infra/`, según la sección 9 del documento base. El prototipo visual (`cenisoft-repo/fedesoft`) sigue aparte: es una pieza de presentación con otro ciclo de vida, y mezclarlos obligaría a versionar juntos dos cosas que cambian por razones distintas.

**Desviación de la estructura documentada:** el esquema y las migraciones de Prisma viven en `packages/db/prisma/`, no en `infra/migrations/`. Prisma espera las migraciones junto al esquema, y separarlas obliga a configurar rutas en cada comando. `infra/` queda para Docker y observabilidad.

### 2. Las invariantes críticas se hacen cumplir en la base de datos, no solo en el código

Esta es la decisión de fondo. Un control que vive únicamente en la capa de aplicación se salta con un script de migración, una consola de soporte o un bug en una ruta nueva. Lo que el proyecto declara no negociable se instala como restricción de PostgreSQL:

| Regla del proyecto | Cómo se hace cumplir |
|---|---|
| Auditoría append-only | Triggers `BEFORE UPDATE` y `BEFORE DELETE` sobre `audit_events` que lanzan excepción |
| No marcar pagos exitosos por respuesta del navegador | `CHECK`: un pago `APROBADO` exige `provider_reference` y `confirmed_at`, que solo puede poner la confirmación servidor a servidor |
| Una factura emitida es una factura con CUFE | `CHECK`: estado `EMITIDA` exige `cufe`, `number` e `issued_at` |
| Flujos idempotentes | `idempotency_key` única en `payments`; `(provider, event_id)` única en `webhook_deliveries` |
| Estado de afiliación no ambiguo | Índice único parcial: un solo período abierto (`valid_to IS NULL`) por empresa |
| Un certificado vigente por empresa | Índice único parcial sobre `status = 'VIGENTE'` |
| El dinero no se redondea por accidente | `Decimal(14,2)`, nunca punto flotante; montos con `CHECK > 0` |

Las ocho pruebas de `packages/db/test/integridad.test.ts` verifican cada una contra una base real, y corren en CI. Una regla que no se prueba es una intención.

**Límite conocido y su mitigación:** un superusuario de PostgreSQL puede desactivar un trigger. El rol que usa la aplicación **no debe ser propietario de las tablas** en los entornos desplegados. Queda como requisito de aprovisionamiento para A8.

### 3. Denegar por defecto es un guard global, no una convención

`DenyByDefaultGuard` se registra como `APP_GUARD`. Un endpoint sin `@RequirePermission` y sin `@Public` **lanza 403**, incluido el caso de olvido. La alternativa —recordar añadir el decorador— falla abierto, que es justo como ocurren estas fugas.

`@Public` existe y es explícito precisamente para que se vea en la revisión de código cuántas rutas son públicas y cuáles.

### 4. Las reglas de negocio nacen como parámetros versionados

`Parameter` + `ParameterVersion` con alcance, vigencia, versión y acto de aprobación. Un `Charge` guarda el `parameter_version_id` que lo originó, así que siempre puede explicar de dónde salió su monto.

Consecuencia práctica: **la regla de "al día", que sigue sin decidirse, ya existe como parámetro** (`afiliacion.dias_gracia`, versión 1, marcada `provisional: true`). Cuando Fedesoft decida, se crea la versión 2 — no se busca una constante por todo el repositorio.

### 5. Los proveedores no entran todavía, y por eso el trabajo pudo empezar

El modelo de datos nombra al proveedor de pago como una cadena (`payments.provider`) y guarda su respuesta cruda (`invoices.provider_payload`), sin que ninguna tabla dependa de cuál sea. `webhook_deliveries` registra firma y marca de tiempo sin conocer el algoritmo.

Esto es lo que permite construir el recorrido crítico —pago → webhook → factura → certificado— antes de que se elija Wompi o ePayco, Siigo o Alegra: lo que falta son adaptadores de infraestructura, no dominio.

## Consecuencias

**A favor.** El proyecto arranca sin esperar decisiones ajenas. Las reglas no negociables dejan de depender de que cada quien se acuerde. El CI corre migraciones desde una base vacía, así que una migración que no aplique desde cero se detecta antes del despliegue.

**En contra.** Las restricciones en la base encarecen los cambios de modelo: mover una regla exige una migración, no un `if`. Es deliberado. También hay reglas que el `CHECK` no puede expresar —la ventana de replay de un webhook, por ejemplo— y esas quedan en la aplicación, señaladas como tales.

**Pendiente.** Las tarifas de afiliación de la semilla son las del prototipo, derivadas de dos empresas de ejemplo. Fedesoft debe confirmar las reales antes de que ningún cargo se emita.
