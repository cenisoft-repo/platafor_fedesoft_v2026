# Prompts para Google Stitch — portal del afiliado

**Versión 1.0 · 22 de septiembre de 2026**

Prompts listos para pegar en [Google Stitch](https://stitch.withgoogle.com). El primero fija la dirección visual; los demás generan pantalla por pantalla. Úsalos en orden: Stitch conserva mejor la coherencia si el estilo se establece primero.

**Por qué esta dirección.** El primer prototipo quedó plano: tarjetas blancas sobre gris claro, sin jerarquía ni carácter. La corrección es dar **profundidad y peso institucional**: una banda lateral marino profundo que ancla la marca, cifras grandes, aire generoso y el azul brillante usado con precisión quirúrgica, no repartido.

---

## 0 · Estilo maestro (pégalo primero)

```
Diseña un sistema visual para el portal web de afiliados de Fedesoft, la federación
colombiana de la industria de software y TI. Público: gerentes de empresas de
tecnología. Tono: institucional, confiable y moderno; serio pero no burocrático.

PALETA
- Azul marino profundo #0C2340 — barra lateral, superficies oscuras, titulares
- Azul brillante #0F8BFF — acento puntual: indicadores, íconos activos, barras
- Azul interactivo #0A63BF — botones primarios y enlaces
- Fondo #F4F7FB, superficies blancas #FFFFFF
- Texto #14213A, texto secundario #5B6B82, bordes #D9E2EE
- Éxito #157347, advertencia #8A5A10, error #C62828

TIPOGRAFÍA
- Titulares: Nunito ExtraBold, minúsculas naturales, tracking ajustado
- Cuerpo: Source Sans 3
- Cifras e identificadores: JetBrains Mono con números tabulares

ESTRUCTURA
- Barra lateral fija en azul marino profundo con el logo arriba y navegación con
  iconos; el elemento activo lleva una barra azul brillante de 3px a su izquierda
- Área de contenido clara y aireada, ancho máximo generoso, respiración amplia
- Encabezado superior con estado de la empresa, buscador y avatar

CARÁCTER VISUAL
- Cifras grandes y protagonistas: montos en 36-44px, peso extrabold
- Profundidad con sombras suaves y muy difusas, nunca bordes duros por todas partes
- Una sola tarjeta destacada por pantalla, con borde superior azul brillante
- Espacio en blanco abundante; menos tarjetas, más jerarquía tipográfica
- Esquinas de 12px, iconografía lineal fina y consistente

EVITAR
- Que todo sea una tarjeta blanca con borde gris
- Degradados morados o azul-violeta genéricos de plantilla
- Emojis como iconos
- Sombras duras o bordes de 1px en cada elemento
```

---

## 1 · Inicio del afiliado

```
Pantalla de inicio del portal, para Camilo Restrepo, gerente de Datalabs Andina S.A.S.

Barra lateral marino oscuro con: Inicio (activo), Mi empresa, Facturación, Formación,
Directorio, Oportunidades. Abajo, el avatar del usuario con su empresa.

Contenido:
- Saludo grande "Hola, Camilo" con el nombre de la empresa y su NIT 901.487.203-6
  en tipografía monoespaciada
- Insignia verde "Afiliación al día · vigente hasta 31 dic 2026"
- TARJETA DESTACADA con borde superior azul: icono de alerta ámbar, título
  "Tu cuota anual vence en 23 días", el monto $ 2.450.000 en cifra grande, y dos
  botones: "Ver estado de cuenta" y "Pagar ahora"
- Fila de cuatro accesos rápidos con iconos: Estado de cuenta, Certificado y sello,
  Formación, Mis datos
- Dos columnas: "Tus próximas sesiones" con una tarjeta de curso
  (BigQuery: el oráculo de datos para la era de la IA · TrainingLAB · 1 oct 2026),
  y "Novedades para ti" con oportunidades y verticales

Español de Colombia, montos con punto de miles.
```

---

## 2 · Estado de cuenta

```
Pantalla de estado de cuenta de una empresa afiliada.

A la izquierda, tabla de cargos con columnas Concepto, Vence, Monto, Estado.
Una fila: "Cuota de afiliación anual 2026", vence 15 oct 2026, $ 2.450.000,
insignia ámbar "Pendiente". Debajo, lista de facturas electrónicas con su número
FES-8841, fecha y CUFE truncado en monoespaciada, con botón de descarga PDF.

A la derecha, panel destacado con borde superior azul brillante: el texto
"Total por pagar" pequeño en mayúsculas, debajo la cifra $ 2.450.000 en 44px
extrabold, una línea explicando que al pagar la factura electrónica se emite
automáticamente ante la DIAN, y un botón primario ancho "Pagar ahora".

Mucho aire, cifras protagonistas, sin exceso de bordes.
```

---

## 3 · Pago aprobado con factura electrónica

```
Pantalla de confirmación tras un pago exitoso en el portal.

Arriba, indicador de pasos horizontal: Resumen · Pago · Confirmación · Listo,
con los tres primeros completados en verde.

Tarjeta principal con borde superior azul: círculo verde con check, título grande
"Pago aprobado", y el texto "Recibimos $ 2.450.000 de Datalabs Andina S.A.S.
Tu afiliación quedó al día hasta el 31 dic 2026".

Debajo, tarjeta "Factura electrónica emitida" con insignia verde "Validada ante
la DIAN", y una rejilla de datos: Número FES-8967, Fecha 22 sep 2026, y el CUFE
en un bloque monoespaciado con botón de copiar.

Al final, tarjeta con icono de medalla: "Tu certificado ya está disponible" y un
botón "Ir al certificado".

Sensación de logro y solidez, celebración sobria sin confeti.
```

---

## 4 · Certificado de afiliación

```
Pantalla de descarga del certificado de afiliación.

Columna izquierda ancha: vista previa realista del certificado sobre un fondo
sutilmente texturizado. El documento muestra el logotipo fedesoft (fede en marino,
soft en azul), el folio FS-2026-00184 en monoespaciada arriba a la derecha, el texto
"CERTIFICA QUE" en mayúsculas espaciadas, la razón social "Datalabs Andina S.A.S."
en grande, el NIT, un párrafo de certificación, y abajo la fecha de expedición junto
a un código QR. Debajo del documento, botones "Descargar certificado" y
"Enviar por correo".

Columna derecha, dos tarjetas: el sello #SoyAfiliadoFedesoft con dos variantes
descargables (una sobre fondo marino, otra monocroma), y un bloque de verificación
pública mostrando la URL portal.fedesoft.org/verificar/FS-2026-00184.

El certificado debe verse como un documento oficial real, elegante, no como una
tarjeta de interfaz.
```

---

## 5 · Certificado bloqueado (estado de regla de negocio)

```
Misma pantalla de certificado, pero para una empresa con la cuota vencida.

En lugar del certificado, una tarjeta con banda superior roja suave: icono de
candado, título "Tu certificado no está disponible", y la explicación de que el
certificado solo se emite con la afiliación vigente, mencionando el cargo vencido
de $ 2.450.000 del 15 ago 2026.

Debajo, tres pasos numerados en círculos: 1) Pagar el cargo pendiente,
2) La afiliación pasa a al día apenas se confirma el pago, 3) El certificado y el
sello se habilitan solos. El primero en rojo, los demás en gris.

Botón primario "Regularizar ahora".

Tono claro y útil, nunca punitivo. Se explica qué falta, no se esconde.
```

---

## 6 · Catálogo de formación

```
Catálogo de formación del portal, con pestañas: Catálogo, Mis inscripciones,
Historial del equipo.

Rejilla de tarjetas de curso, tres por fila. Cada tarjeta tiene una banda superior
de color según el programa, insignias pequeñas (TrainingLAB, Exclusivo afiliados),
el título del curso, y una fila de metadatos con iconos: fecha, modalidad virtual
o presencial, y cupos ocupados como "41 de 60". Botón "Inscribirme" al pie; las
que están llenas dicen "Entrar a lista de espera".

Cursos reales: "BigQuery: el oráculo de datos para la era de la IA",
"Identidad digital: el nuevo perímetro del negocio",
"El VAR de los negocios" de Series C+I,
"Agentes de IA y talento humano en acción" de TIC Talk,
"Arquitecturas resilientes y recuperación sin drama en AWS".

Las tarjetas deben tener carácter, no ser rectángulos blancos idénticos.
```

---

## 7 · Panel de cuenta estratégica

```
Panel para una empresa grande afiliada, Sistemas Vértice S.A., con gestora de
cuenta asignada.

Arriba, tarjeta ancha en azul marino profundo con texto claro: avatar circular con
iniciales MO, nombre "Marcela Ospina", cargo "Gestora de Cuenta Estratégica", y
botones de contacto directo. Debe sentirse premium y diferenciada del resto.

Debajo, fila de cuatro métricas grandes: Estado financiero (Al día), Verticales
activas (3), Participación en formación (12), Cuota anual ($ 8.900.000). Cifras
en 32px extrabold con su etiqueta pequeña en mayúsculas arriba.

Dos columnas: "Verticales en las que participas" listando Financiera, Educación y
Seguridad Digital con su próxima mesa; y "Proyectos y acciones" con oportunidades
Cenisoft y una lista de acciones acordadas con viñetas de color.

Sensación de atención personalizada y visión consolidada.
```

---

## Cómo usarlos

1. Pega primero el **estilo maestro** y deja que Stitch establezca el sistema.
2. Genera pantalla por pantalla, empezando por **Inicio** — es la que define el resto.
3. Si una pantalla se desvía del estilo, repite las líneas de paleta y estructura al final del prompt de esa pantalla.
4. Exporta los diseños que te gusten y pásamelos: los implemento en el código del prototipo conservando el comportamiento que ya funciona (selector de escenarios, recorrido de pago, estados bloqueados).

## Qué NO delegar a Stitch

Stitch diseña pantallas, no reglas. Lo que ya está resuelto en el prototipo y debe conservarse al implementar:

- El selector de escenarios que recompone la aplicación completa.
- La lógica de que el certificado se bloquea con la afiliación vencida.
- Que el líder de talento no vea facturación, con pantalla de "sin permiso" explícita.
- Los formatos colombianos: NIT con dígito de verificación, pesos, CUFE, folio.
- La regla de contraste: el azul de marca #0F8BFF no se usa en texto de cuerpo.
