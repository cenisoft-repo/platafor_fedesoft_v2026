# ADR-007 · Recorrido crítico: pago → factura → certificado

**Estado:** Aceptada · 22 de septiembre de 2026
**Contexto:** Etapa C. Primer flujo transaccional del sistema.
**Relacionadas:** ADR-001 (eventos y outbox), ADR-006 (fundación e invariantes).

---

## Contexto

Es el recorrido que sostiene el modelo de negocio: una empresa paga su cuota, recibe factura electrónica válida ante la DIAN y obtiene el certificado que acredita su afiliación. También es el único lugar del sistema donde un error cuesta dinero real y confianza.

Fedesoft aún no elige pasarela ni facturador. La pregunta era si eso bloqueaba el recorrido. **No lo bloquea**, y esta decisión explica por qué.

## Decisiones

### 1. El dominio habla con puertos, no con proveedores

`PaymentGatewayPort` y `ElectronicInvoicerPort` son todo lo que el dominio conoce. Los adaptadores concretos se eligen en **una sola línea** de `billing.module.ts`.

Los adaptadores sandbox no son maquetas de conveniencia: firman y verifican HMAC-SHA256 de verdad, porque el control que hay que ejercitar es la verificación de firma, no el cobro. Wompi y ePayco firman así —cadena concatenada más secreto compartido—, de modo que el adaptador definitivo cambia el orden de los campos y los nombres de las cabeceras, no la forma del control.

**Lo que el sandbox NO hace y el adaptador real sí tendrá que hacer:** calcular el CUFE como lo exige la DIAN, que lo deriva de NIT, valores, impuestos, clave técnica y fecha con SHA-384. El sandbox genera un hash sintético de 40 hex, determinista respecto a la clave de idempotencia.

### 2. Solo el webhook firmado aprueba un pago

No hay ningún camino por el que la respuesta del navegador cambie el estado de un pago. La regla ya estaba en la base —un pago `APROBADO` exige `provider_reference` y `confirmed_at`—, y aquí se cierra: esos dos campos solo los escribe la confirmación servidor a servidor.

Orden deliberado de los controles en el webhook:

1. **Firma primero.** Un cuerpo sin verificar no se parsea para decidir nada.
2. **Comparación en tiempo constante.** `===` filtra el prefijo correcto byte a byte y permite reconstruir la firma con suficientes intentos.
3. **Ventana de replay después de la firma**, no antes. Al revés, el tiempo de respuesta le diría al atacante si su marca temporal era aceptable.
4. **Idempotencia por restricción de base**, no por consulta previa: un `SELECT` seguido de un `INSERT` deja una ventana entre ambos.
5. **El monto lo decide nuestro registro.** Si el proveedor reporta otra cifra, no se aplica y queda auditado.
6. **Transición con guarda de estado en el `WHERE`.** Dos webhooks simultáneos del mismo pago: solo uno ve `count = 1`.

### 3. La respuesta del webhook es siempre la misma

Siempre `200 {"received": true}`, distinga o no el sistema entre firma inválida, referencia desconocida y monto que no cuadra. Decirlo en la respuesta convertiría el endpoint en un oráculo para afinar el ataque. El detalle va al log y a la auditoría, que es donde lo necesita el equipo.

Y nunca `500` ante un mensaje malo: el proveedor lo reintentaría durante horas contra un error que no se arregla solo.

### 4. Factura y certificado cuelgan del outbox, no del webhook

El webhook aplica el pago y escribe el evento en la misma transacción. Emitir la factura es otro paso, con sus reintentos y su espera creciente.

La razón es de negocio, no de arquitectura: **la DIAN puede tardar o rechazar, y eso no puede deshacer un cobro que ya ocurrió.** Una factura rechazada es un problema que se gestiona; un pago perdido, uno que no.

### 5. La regla de "al día" se lee, no se codifica

`MembershipPolicy` consulta `afiliacion.dias_gracia` en cada evaluación, y el certificado guarda en su snapshot la versión que lo justificó. Meses después se puede explicar por qué se expidió, aunque la regla haya cambiado.

**Si no hay versión vigente del parámetro, la política lanza en vez de asumir un valor.** Negar es más seguro que adivinar cuántos días de gracia quiso dar la federación.

## Verificación

Doce pruebas de extremo a extremo contra base real. Además del camino feliz, cubren los ataques que este flujo concreto habilita:

| Escenario | Resultado esperado |
|---|---|
| Firma inválida | No aplica nada; el pago sigue INICIADO |
| Sin firma | Rechazado |
| Mensaje fuera de la ventana de 5 minutos | Rechazado aunque la firma sea válida |
| El mismo evento dos veces | Se aplica una vez; una sola auditoría de aprobación |
| Monto distinto al esperado | No salda el cargo; queda `payment.amount_mismatch` en auditoría |
| Pagar el cargo de otra empresa | Rechazado en el caso de uso |
| Dos webhooks simultáneos del mismo pago | Una sola transición y un solo evento de dominio |
| Reintentar la emisión tres veces | Una sola factura |
| Empresa con cargo vencido | Sin certificado |

## Consecuencias

**A favor.** El recorrido completo funciona y está probado hoy. Cuando lleguen las decisiones, lo que falta es escribir dos adaptadores contra un sandbox del proveedor, no diseñar el flujo.

**En contra.** El despachador del outbox vive hoy en el API para que el recorrido sea ejecutable de extremo a extremo sin levantar otro proceso. En producción va en `apps/worker` con BullMQ; el contrato es el mismo, pero es deuda declarada.

**Pendiente de decisión de Fedesoft.** Pasarela, facturador, y la regla de "al día" —hoy 30 días provisionales—. Además: el secreto del webhook debe rotarse, y la rotación exige aceptar dos secretos a la vez durante la ventana de cambio. No está implementado.
