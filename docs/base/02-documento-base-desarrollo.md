# Documento base para iniciar el desarrollo — Portal único del afiliado (Fedesoft)

**FEDESOFT**


Portal único del afiliado · Arquitectura técnica, seguridad, agentes de IA y plan de ejecución con Claude Opus 5

| Objetivo Convertir la arquitectura funcional existente en una guía ejecutable para iniciar un desarrollo real, modular y auditable, evitando que la IA improvise arquitectura o construya módulos desconectados. |
|---|

Versión 0.1 · Documento de arranque

Fecha: septiembre de 2026

Base: Arquitectura de la plataforma Fedesoft — Portal único del afiliado

**USO PROPUESTO**

Documento rector para arquitectura, backlog, repositorio, agentes, QA, seguridad y criterios de aceptación. Puede entregarse a un equipo humano o utilizarse como contexto maestro para un entorno de desarrollo asistido por IA.

## 1. Alcance y principios no negociables

El documento de arquitectura de Fedesoft define una fuente única de verdad, autoservicio por defecto, propiedad de los datos, segmentación desde el acceso y cumplimiento fiscal local. La plataforma se organiza en tres capas: núcleo de afiliación, identidad/acceso y motor de servicios. Esta guía conserva esos principios y propone una implementación concreta sobre ellos.

| Regla de diseño Ningún módulo puede crear su propia “versión” de empresa, contacto, rol, afiliación o estado de pago. Todo debe resolver esos datos desde el núcleo. |
|---|

Una empresa puede tener múltiples contactos con permisos diferentes.

Los módulos 1 a 6 son primordialmente de autoservicio; los módulos 7 a 9 requieren intervención de alto contacto.

Facturación DIAN y pagos locales se consideran integraciones de núcleo, no extras posteriores.

El dato debe ser exportable y la arquitectura debe minimizar dependencia de un proveedor específico.

Los flujos transaccionales deben ser idempotentes, auditables y recuperables ante fallos.

## 2. Decisión de arquitectura de implementación

| Recomendación Comenzar como monolito modular con límites de dominio estrictos, API clara y eventos internos. Evitar microservicios al inicio. Se gana velocidad sin sacrificar una futura separación de servicios. |
|---|

| Decisión | Propuesta | Motivo |
|---|---|---|
| Patrón | Monolito modular + eventos de dominio | Menor complejidad operativa; permite separar servicios cuando haya volumen o equipos independientes. |
| API | REST versionada + OpenAPI | Sencilla para portal, integraciones y pruebas contractuales. |
| Persistencia | PostgreSQL como fuente única | Modelo relacional sólido, transacciones y buena portabilidad. |
| Asincronía | Cola de trabajos + outbox pattern | Facturación, correos, certificados y webhooks sin perder eventos. |
| Multiempresa | Tenant lógico por organization_id | Aislamiento consistente entre empresas afiliadas. |
| Archivos | Almacenamiento S3-compatible | Certificados, sellos, documentos de verticales y contenidos. |
| Integraciones | Adaptadores/ports | Wompi/ePayco, Siigo/Alegra u otros sin acoplar el dominio. |

## 3. Stack tecnológico recomendado

Las siguientes tecnologías son una propuesta de implementación, no una exigencia del documento funcional original. El criterio principal es control del dato, portabilidad y capacidad de automatización.

| Capa | Tecnología recomendada | Notas |
|---|---|---|
| Frontend | Next.js + TypeScript | Portal SSR/SPA híbrido, buenas capacidades de autenticación y experiencia. |
| UI | Tailwind CSS + sistema de componentes accesible | Diseño coherente, responsive y con tokens propios de Fedesoft. |
| Backend | NestJS + TypeScript | Módulos de dominio, guards, validación, OpenAPI, jobs y testing. |
| ORM | Prisma | Migraciones tipadas y acceso claro a PostgreSQL. |
| Base de datos | PostgreSQL | Fuente única de verdad. |
| Cache / Jobs | Redis + BullMQ | Sesiones/cache selectivo, colas y trabajos reintentables. |
| Identidad | OIDC/OAuth2; proveedor intercambiable | No acoplar reglas de autorización al proveedor de login. |
| Archivos | S3-compatible | Políticas de acceso y URLs firmadas. |
| CI/CD | GitHub Actions + contenedores Docker | Build reproducible, test y despliegue automatizado. |
| Observabilidad | OpenTelemetry + Sentry + métricas/logs centralizados | Trazas end-to-end, errores y salud. |
| E2E | Playwright | Pruebas de recorridos reales. |
| Unit/Integration | Jest/Vitest + testcontainers | Pruebas de negocio y contra servicios reales efímeros. |

## 4. Arquitectura lógica y dominios

### 4.1 Dominios del núcleo

| Dominio | Responsabilidad | Entidades principales |
|---|---|---|
| Membership | Afiliación y estado | Organization, Membership, MembershipStatus, MembershipHistory |
| Identity | Contactos, usuarios, roles y sesiones | User, Contact, Role, Permission, OrganizationUser |
| Billing | Estado de cuenta, cargos, pagos, conciliación | Account, Charge, Payment, PaymentAttempt, Reconciliation |
| Fiscal | Factura electrónica e integración DIAN | Invoice, FiscalDocument, ProviderResponse |
| Documents | Certificados, sellos y folios | Certificate, SealAsset, DocumentTemplate, Folio |
| Learning | TrainingLAB / TIC Talks | Course, Session, Enrollment, Attendance |
| Communities | Comunidades y cupos | Community, MembershipRequest, CommunityParticipant |
| Directory | Perfil visible y publicaciones | DirectoryProfile, Offer, InsightEntitlement |
| Verticals | Mesas sectoriales | Vertical, Meeting, Participation, WorkingDocument |
| Cenisoft | Oportunidades/proyectos | Opportunity, Application, ProjectAssignment, StatusHistory |
| KAM | Cuenta estratégica | AccountManager, StrategicAccount, Interaction, ActionItem |
| Notifications | Correo y notificaciones | Notification, Template, DeliveryAttempt |
| Audit | Trazabilidad transversal | AuditEvent, SecurityEvent |

### 4.2 Eventos de dominio mínimos

organization.updated

membership.status_changed

payment.succeeded

payment.failed

invoice.issued

invoice.rejected

certificate.generated

enrollment.created

community.joined

opportunity.published

opportunity.applied

kam.assigned

| Patrón obligatorio Los cambios críticos se confirman en base de datos y publican mediante outbox. Los consumidores deben soportar reintentos sin duplicar efectos. |
|---|

## 5. Modelo de datos inicial

El modelo debe priorizar la empresa como agregado central. Contactos, usuarios y permisos son relaciones con la empresa, no copias de la empresa en cada módulo.

| Entidad | Campos mínimos | Reglas clave |
|---|---|---|
| Organization | id, nit, legal_name, trade_name, size, segment, status, created_at | NIT único; segmentación MIPYME/grande parametrizable. |
| Contact | id, organization_id, name, email, phone, job_title | Correo normalizado; contacto puede o no tener usuario. |
| User | id, email, auth_subject, status, last_login_at | auth_subject enlaza proveedor OIDC. |
| OrganizationUser | organization_id, user_id, contact_id, role_id | Un usuario puede tener relación con una o más organizaciones si el negocio lo permite. |
| Membership | organization_id, type, status, valid_from, valid_to | Historial separado; cambios auditables. |
| Charge | organization_id, concept, amount, currency, due_date, status | Nunca recalcular retrospectivamente un cargo pagado. |
| Payment | organization_id, amount, provider, provider_reference, status | provider_reference único; idempotency_key obligatoria. |
| Invoice | organization_id, payment_id, number, cufe, status, issued_at | Respuesta fiscal persistida; estados explícitos. |
| Certificate | organization_id, membership_snapshot, folio, issued_at, file_key | Se genera solo con regla de elegibilidad vigente. |
| AuditEvent | actor, organization_id, action, object_type, object_id, metadata, created_at | Append-only; no editable desde UI. |

## 6. Identidad, roles y autorización

La autenticación determina quién es la persona; la autorización del backend determina qué puede hacer. Nunca confiar en ocultar botones como control de seguridad.

| Rol inicial | Accesos típicos |
|---|---|
| Super Admin Fedesoft | Administración global, parametrización, soporte controlado, auditoría. |
| Operaciones Fedesoft | Afiliación, cuentas, conciliación, documentos, formación. |
| KAM | Empresas asignadas, interacciones, proyectos, verticales y contexto consolidado. |
| Gerente afiliado | Perfil corporativo, estado de cuenta, pagos, facturas, certificados, directorio. |
| Talento humano afiliado | Formación, historial del equipo, comunidades elegibles. |
| Contacto afiliado | Vista restringida según permisos asignados. |
| Auditor / solo lectura | Reportes y auditoría autorizada sin mutación. |

| Modelo recomendado RBAC para permisos base + reglas ABAC para contexto: organization_id, segment, membership_status, ownership/asignación KAM y tipo de afiliación. |
|---|

## 7. Seguridad y cumplimiento

### 7.1 Controles mínimos

Autorización server-side en cada endpoint y acción; denegar por defecto.

Aislamiento por organization_id en queries, repositorios y pruebas automáticas de fuga entre tenants.

MFA obligatorio para perfiles internos privilegiados; recomendable para gerentes.

Sesiones seguras: cookies HttpOnly/Secure/SameSite, rotación y expiración; invalidación al cambiar privilegios.

Cifrado TLS en tránsito y cifrado de discos/backups en reposo.

Secretos fuera del repositorio y rotables; ambientes separados.

Webhooks con validación criptográfica, allowlist cuando aplique, replay protection e idempotencia.

Rate limiting y protección frente a abuso en login, recuperación, pagos y endpoints públicos.

Auditoría append-only de acciones sensibles, incluyendo actor, organización, IP/contexto, antes/después cuando corresponda.

Backups automáticos, pruebas periódicas de restauración y objetivos RPO/RTO definidos.

Validación de entrada con esquemas; consultas parametrizadas; CSP y protección XSS/CSRF.

Escaneo SAST/dependencias/secretos en CI y pentest antes de producción.

### 7.2 Estándares de referencia

Como guía de ingeniería se recomienda OWASP ASVS para controles de aplicación, OWASP Top 10 para amenazas comunes y una política de privacidad alineada con las obligaciones colombianas aplicables. La interpretación jurídica final debe validarse con asesoría legal.

## 8. Integraciones críticas

| Integración | Contrato interno | Requisitos |
|---|---|---|
| Pasarela de pago | PaymentGateway | createPayment, verifyWebhook, getStatus, refund si aplica; idempotencia. |
| Facturador electrónico | FiscalProvider | issueInvoice, getInvoiceStatus, downloadArtifacts; persistir CUFE y respuesta. |
| Email | EmailProvider | sendTemplate, deliveryStatus; reintentos y suppression list. |
| Almacenamiento | ObjectStorage | put/get signed URL/delete lógico; antivirus en cargas si aplica. |
| Calendario/eventos | CalendarAdapter | opcional; exportación ICS y sincronización futura. |

| Criterio El dominio nunca debe importar SDKs de Wompi, ePayco, Siigo o Alegra. Solo los adaptadores de infraestructura conocen al proveedor. |
|---|

## 9. Arquitectura del repositorio

```text
fedesoft-portal/
├── apps/
│ ├── web/ # Next.js
│ ├── api/ # NestJS
│ └── worker/ # Jobs/colas si se separa del API
├── packages/
│ ├── ui/ # Design system
│ ├── contracts/ # DTO/OpenAPI schemas compartidos
│ ├── config/ # eslint/tsconfig/env schema
│ └── testing/ # factories y helpers
├── infra/
│ ├── docker/
│ ├── migrations/
│ └── observability/
├── docs/
│ ├── adr/ # Architecture Decision Records
│ ├── api/
│ ├── security/
│ └── runbooks/
├── e2e/ # Playwright
└── .github/workflows/
```

## 10. Estrategia de agentes para Opus 5

No conviene asignar un agente por pantalla. Los agentes deben representar responsabilidades técnicas estables. Opus 5 puede actuar como orquestador y delegar trabajos con contratos de entrada/salida definidos.

| Agente | Misión | Entregables / autoridad |
|---|---|---|
| A0 · Orquestador / Tech Lead | Descomponer objetivos, coordinar agentes y mantener el plan. | Backlog, dependencias, asignación, revisión final. No implementa cambios grandes sin revisión de arquitectura. |
| A1 · Arquitectura y dominio | Proteger límites, modelo, ADR y eventos. | ADR, diagramas lógicos, contratos de dominio, revisión de PR estructural. |
| A2 · Datos y migraciones | Diseñar esquema, constraints, índices y migraciones seguras. | Prisma schema, SQL/migrations, seeds, plan de rollback, pruebas de integridad. |
| A3 · Backend/API | Implementar casos de uso y endpoints. | Módulos NestJS, services, policies, OpenAPI, unit/integration tests. |
| A4 · Frontend/UX | Construir portal accesible por rol y segmento. | Rutas Next.js, componentes, estados de error/carga, pruebas UI. |
| A5 · Seguridad | Amenazas, authorization, secretos, hardening. | Threat model, controles, tests tenant-isolation, findings bloqueantes. Puede vetar release. |
| A6 · Integraciones fiscal/pagos | Implementar adaptadores y webhooks. | PaymentGateway, FiscalProvider, sandbox tests, idempotencia, reconciliación. |
| A7 · QA y pruebas | Verificar criterios de aceptación y regresión. | Test plan, E2E Playwright, contract tests, reporte de defectos. Puede vetar release. |
| A8 · DevOps/Observabilidad | Entornos, CI/CD, métricas, backups y runbooks. | Pipelines, Docker, health checks, dashboards, rollback y restore drills. |
| A9 · Documentación / Release | Mantener documentación operativa y trazabilidad. | CHANGELOG, runbooks, manuales, release notes, matriz de cumplimiento. |

## 11. Flujo de trabajo multiagente

A0 recibe una historia o épica y valida que tenga actor, valor, reglas, riesgos y criterios de aceptación.

A1 define impacto de dominio y ADR si hay una decisión nueva. A2 valida impacto de datos.

A5 revisa amenazas y controles antes de implementar flujos de identidad, pagos, archivos o privilegios.

A3/A4 implementan en ramas o worktrees separados con alcance limitado.

A6 interviene si existe integración externa; todo se prueba primero con sandbox/mock contractual.

A7 ejecuta unit/integration/E2E y verifica escenarios negativos, no solo “happy path”.

A8 valida build reproducible, migración, health checks, telemetría y rollback.

A0 integra solo cuando A5 y A7 no tienen bloqueantes y los criterios están cumplidos.

A9 actualiza documentación y evidencia de release.

| Regla para agentes Un agente no debe modificar módulos fuera de su alcance “para arreglar rápido”. Si detecta una dependencia, genera una tarea para el agente dueño del dominio. |
|---|

## 12. Roadmap de desarrollo

| Fase | Resultado | Alcance principal |
|---|---|---|
| 0 · Preparación | Base reproducible y decisiones cerradas | Monorepo, CI, Docker, ADR, environments, modelo inicial, threat model, UX shell. |
| 1 · Núcleo e identidad | Empresa/contactos/roles operativos | Organizations, Contacts, Membership, login, RBAC/ABAC, auditoría. |
| 2 · Dinero y documentos | Recorrido crítico E2E | Estado de cuenta → pago → webhook → factura DIAN → afiliación al día → certificado/sello. |
| 3 · Autoservicio ampliado | Eje 1 completo | Formación, comunidades, directorio, visibilidad e insights. |
| 4 · Alto contacto | Eje 2 completo | Verticales, Cenisoft/oportunidades, panel KAM. |
| 5 · Hardening y salida | Producción controlada | Migración, performance, pentest, DR, observabilidad, manuales, piloto. |

## 13. Historias críticas y criterios de aceptación

### 13.1 Recorrido “pago → factura → certificado”

Dado un gerente autorizado con cargo pendiente, al iniciar pago se crea PaymentAttempt con clave de idempotencia.

Un webhook válido de pago aprobado solo puede aplicar el pago una vez aunque llegue repetido.

Al aprobarse, el sistema crea/actualiza el pago y encola la emisión fiscal sin bloquear la respuesta del webhook.

La factura emitida persiste número, CUFE, estado y artefactos/referencias del proveedor.

El estado de afiliación se actualiza conforme a la regla de negocio y queda registrado en historial.

Si queda al día, se habilita/genera certificado con folio y snapshot del estado; el usuario puede descargarlo.

Cada transición relevante genera AuditEvent y telemetría con correlation_id.

Si el facturador falla, el pago permanece conciliado y la factura entra en estado reintentable; no se pierde información.

### 13.2 Recorrido “formación por rol”

El líder de talento ve cursos elegibles para su organización y rol.

No puede inscribir personas de otra organización.

La inscripción respeta cupos y evita duplicados.

La participación queda asociada a empresa/contacto y aparece en historial.

### 13.3 Recorrido “cuenta estratégica”

Solo empresas segmentadas como cuenta estratégica ven el panel KAM.

El KAM ve únicamente empresas asignadas salvo permiso administrativo superior.

El panel consolida formación, verticales y proyectos desde los dominios originales, sin copiar información en tablas paralelas.

## 14. Calidad, pruebas y observabilidad

| Nivel | Qué probar | Gate |
|---|---|---|
| Unitarias | Reglas de estado, elegibilidad, permisos, cálculos | Obligatorias en lógica de dominio. |
| Integración | DB, repositorios, jobs, adaptadores | Con servicios efímeros o sandbox. |
| Contract | Webhooks y proveedores externos | Fixtures versionados y casos de firma inválida/replay. |
| E2E | Recorridos de usuario por rol | Playwright sobre entorno staging. |
| Seguridad | Tenant isolation, privilege escalation, auth/session | Bloqueante antes de release. |
| Performance | Endpoints críticos y colas | SLO definidos antes de producción. |
| Restore | Recuperación desde backup | Ensayo documentado previo a go-live. |

Correlation ID desde frontend/API/jobs para reconstruir un recorrido.

Logs estructurados sin datos sensibles innecesarios.

Métricas de pagos, facturación, jobs fallidos, latencia, errores y login.

Alertas accionables con runbook y responsable.

Trazas distribuidas para integraciones externas.

## 15. DevOps, ambientes y despliegue

Environments: local, test/CI, staging y production con cuentas/secretos independientes.

Migraciones forward-only revisadas; cambios destructivos en dos etapas (expand/contract).

Feature flags para módulos de alto riesgo y habilitación por piloto.

Despliegues automatizados desde rama protegida; producción requiere checks verdes.

Rollback de aplicación independiente de rollback de datos; evitar migraciones irreversibles en el mismo release.

Backups cifrados con retención definida y restore drill periódico.

Seed de desarrollo sintético: nunca usar copias crudas de producción en entornos no productivos.

## 16. Definition of Done y puertas de calidad

| Gate | Debe cumplirse |
|---|---|
| Funcional | Criterios de aceptación demostrados y errores/estados vacíos incluidos. |
| Arquitectura | Sin duplicación de fuente de verdad; límites de dominio respetados. |
| Seguridad | Autorización server-side, aislamiento tenant, secretos y amenazas revisados. |
| Datos | Migración reversible/segura, constraints e índices revisados. |
| Pruebas | Unit/integration/E2E requeridos en verde. |
| Observabilidad | Logs, métricas y alertas para el nuevo flujo. |
| Documentación | OpenAPI/ADR/runbook/changelog actualizados cuando aplique. |
| Operación | Rollback conocido y responsable definido. |

## 17. Backlog inicial

| ID | Épica | Primer objetivo |
|---|---|---|
| EPIC-00 | Foundation | Monorepo, CI, Docker, env schema, lint/test/build, ADR-001. |
| EPIC-01 | Core Membership | Organization, Contact, Membership, history, admin básico. |
| EPIC-02 | Identity & Authorization | Login OIDC, organization context, roles, policies, MFA interno. |
| EPIC-03 | Billing | Charges, account statement, payment attempt, reconciliation. |
| EPIC-04 | Fiscal | Provider adapter, issue invoice, CUFE/status, retry/dead-letter. |
| EPIC-05 | Certificates | Eligibility, folio, PDF generation, signed download. |
| EPIC-06 | Learning | Courses, sessions, enrollment, attendance/history. |
| EPIC-07 | Communities | Eligibility, enrollment/capacity, materials. |
| EPIC-08 | Directory & Insights | Verified profile, offers, entitlements. |
| EPIC-09 | Verticals | Participation, agenda, documents, follow-up. |
| EPIC-10 | Cenisoft | Opportunities, targeting, applications/status. |
| EPIC-11 | KAM | Assignment, strategic dashboard, interactions/actions. |
| EPIC-12 | Hardening | Security tests, performance, DR, pilot migration/go-live. |

## 18. Harness maestro para Claude Opus 5

Copiar el siguiente bloque como contexto maestro del proyecto. Después, entregar a Opus una épica o historia por iteración, no “construye toda la plataforma”.

```text
ROL
Actúa como Tech Lead y orquestador principal del Portal Único del Afiliado de Fedesoft. Debes coordinar subagentes especializados y producir software listo para revisión, no prototipos desechables.

FUENTE DE VERDAD
La empresa afiliada (Organization), sus contactos, afiliación y estado financiero pertenecen al núcleo. Ningún módulo puede duplicar estas entidades como su propia fuente de verdad.

ARQUITECTURA
- Monolito modular al inicio, con límites de dominio y eventos internos.
- Next.js/TypeScript para web; NestJS/TypeScript para API; PostgreSQL/Prisma; Redis/BullMQ; almacenamiento S3-compatible.
- REST/OpenAPI. Integraciones externas detrás de interfaces/adaptadores.
- organization_id es frontera de seguridad. Autorización siempre en servidor.
- Outbox + consumidores idempotentes para efectos asíncronos críticos.

AGENTES
A1 Arquitectura/Dominio; A2 Datos; A3 Backend; A4 Frontend; A5 Seguridad; A6 Integraciones fiscal/pagos; A7 QA; A8 DevOps/Observabilidad; A9 Documentación/Release.
A5 y A7 pueden marcar un cambio como BLOCKED.

PROTOCOLO DE TRABAJO PARA CADA TAREA
1. Leer requerimiento y listar supuestos. Si falta una decisión que altera datos, seguridad o negocio, detenerse y señalarla.
2. Identificar dominios y archivos afectados. No tocar áreas no relacionadas.
3. Definir criterios de aceptación verificables antes de escribir código.
4. A1/A2 revisan arquitectura/datos; A5 revisa amenazas si hay auth, PII, pagos, archivos o roles.
5. Implementar el cambio mínimo completo, incluyendo estados de error.
6. Crear/actualizar unit, integration y E2E según riesgo.
7. Ejecutar lint, typecheck, test, build y migraciones en entorno limpio.
8. A7 valida criterios y regresión; A5 valida controles.
9. A8 verifica despliegue, telemetría y rollback si el cambio es operativo.
10. Entregar resumen: qué cambió, archivos, migraciones, pruebas, riesgos, deuda técnica y siguiente paso.

REGLAS NO NEGOCIABLES
- No inventar esquemas paralelos para Organization/Contact/Membership.
- No confiar en autorización de frontend.
- No guardar secretos en repositorio ni logs.
- No procesar webhooks sin firma/idempotencia.
- No marcar pagos/facturas como exitosos por respuesta del navegador; usar confirmación server-to-server.
- No hacer migraciones destructivas sin plan expand/contract.
- No integrar un proveedor directamente en el dominio.
- No aceptar una historia sin pruebas proporcionales al riesgo.
- No declarar “terminado” si build/test no fueron ejecutados.

PRIMERA META DE SISTEMA
Implementar y demostrar el recorrido: gerente autenticado → estado de cuenta → pago → webhook aprobado → factura DIAN → actualización de afiliación → certificado/sello disponible. Debe soportar reintentos, eventos duplicados, fallos parciales y auditoría end-to-end.
```

## 19. Decisiones pendientes antes de producción

Proveedor de identidad/OIDC y política definitiva de MFA.

Pasarela de pago inicial y modelo de conciliación/settlement.

Facturador electrónico homologado y contrato técnico de sandbox/producción.

Reglas exactas de causación, cartera, vigencia de afiliación y cuándo un pago deja “al día”.

Formato legal y diseño del certificado/sello; reglas de folio, revocación y verificación.

Fuente y proceso de migración del padrón actual de empresas/contactos/cartera.

Segmentación formal de empresa grande vs. MIPYME y criterios para cuenta estratégica.

Política de retención de auditoría, archivos y datos personales.

SLO, RPO y RTO objetivos.

Proveedor cloud y restricciones presupuestales/TCO a 12 meses.

## Cierre

La arquitectura funcional ya es suficientemente clara para comenzar. La principal recomendación es construir primero el núcleo y un recorrido vertical completo de alto riesgo —pago, factura y certificado— antes de ampliar módulos. Esto obliga a resolver temprano identidad, datos, seguridad, integración fiscal, asincronía, auditoría, observabilidad y operación; los demás módulos podrán apoyarse después sobre una base probada.

