# Decisiones — Dilo group · Control de Transporte

Fuente: cuestionario respondido por el cliente (William Jiménez). Todo lo configurable está en `src/config.js`
(qué está activo) y `src/core/esquemas.js` (cómo es cada campo).

## Confirmado por el cliente

- **Diseño "Claro y limpio"**: fondo claro, encabezado azul marino `#12334A`, acento ámbar `#F2A900`, tarjetas blancas. Letra normal (17 px), con grande (19) y extra grande (21) en Ajustes.
- **Inicio "Resumen con números"**: viajes de hoy, retrasos, combustible (galones), choferes activos, avisos, gráfica de retrasos por día y viajes de hoy.
- **Hora real escrita a mano** (`CONFIG.viajes.hora_manual`).
- **Motivo del retraso: "Sí, siempre"** (ver la interpretación en los supuestos).
- **Choferes**: todos los campos (nombre, cédula, teléfono, foto, dirección, licencia y vencimiento, contacto de emergencia, vehículo asignado, fecha de ingreso, notas). Botones Llamar y WhatsApp.
- **Rutas**: nombre, salida, llegada, duración normal, horarios fijos y cliente. **Sin** kilómetros, paradas ni tarifa (definidos pero apagados en `CONFIG.rutas.campos`).
- **Vehículos**: placa, descripción, estado, seguro y próximo mantenimiento.
- **Combustible**: fecha y hora, vehículo, chofer, galones, monto en RD$, tipo (Gasoil, Gasolina), kilometraje, estación y foto del recibo.
- **Reportes**: retrasos por chofer y por ruta, combustible por semana/mes y por vehículo, resumen diario. Entrega por **WhatsApp**; CSV como extra.
- **Avisos**: viaje retrasado, licencia por vencer, combustible más alto de lo normal, mantenimiento pendiente y (extra pedido en "qué le da trabajo") seguro por vencer.
- **A futuro, fuera de alcance**: sueldos, mantenimiento completo, limpieza y servicios, mapa, acceso para choferes. Hay un punto de extensión por cada uno en `src/modules/extensiones/` y `CONFIG.modulos` (en `false`).
- Moneda RD$, unidades en galones, zona `America/Santo_Domingo`.

## Supuestos por confirmar

Cada uno se cambia sin tocar la lógica, en el lugar indicado.

| Supuesto | Valor actual | Dónde se cambia |
|---|---|---|
| Nombre en el encabezado | "Dilo group" (¿"Dilo Group"?) | `CONFIG.empresa.nombre` |
| Tolerancia de retraso (no respondió) | 5 minutos | `CONFIG.viajes.tolerancia_min` y Ajustes |
| Atajo "Ahora" junto a la hora real: rellena el campo, no guarda | activo | `CONFIG.viajes.atajo_ahora` |
| "Sí, siempre" = motivo **obligatorio cuando el viaje queda Retrasado**; si no hay retraso, el campo no aparece | activo | `CONFIG.viajes.motivo` |
| Motivos rápidos en chips (el chofer elige o escribe "Otro"), para que obligatorio no signifique escribir "no sé" | Tráfico, Lluvia, Avería, Accidente en la vía, Pasajeros tarde, Otro | `MOTIVOS_RETRASO` en `esquemas.js` |
| Módulo de asistencia del chofer (lo mencionó en la llamada, no en el cuestionario) | activo | `CONFIG.modulos.asistencia` |
| "Choferes activos" = choferes no archivados (el cuestionario no pide un campo "estado" para choferes) | — | `esquemas.js` si se quiere un estado |
| Rendimiento km/galón con el método **tanque lleno a tanque lleno**: en cada carga llena, km recorridos desde la carga llena anterior ÷ galones echados en ese tramo (las parciales suman). Comparar solo "contra la carga anterior" da números falsos si esa carga no llenó el tanque | casilla "Tanque lleno", marcada por defecto | `PARAMETROS.campoTanqueLleno` en `esquemas.js` (en `false` se oculta y todas cuentan como llenas) |
| "Combustible más alto de lo normal" necesita al menos **2 rendimientos previos** del vehículo dentro de los 30 días para tener un "normal"; con menos, no avisa | 2 | `MIN_CARGAS_PROMEDIO` en `avisos.js` |
| Aviso de viaje retrasado: los de **hoy** que llegaron tarde (atención) y los de hoy o ayer cuya llegada + tolerancia pasó **sin llegada registrada** (urgente) | — | `calcularAvisos` en `avisos.js` |
| Recordatorio de **respaldo** en Inicio (no está en los 5 avisos del cliente): se mantiene mientras los datos vivan solo en el teléfono | cada 7 días | `PARAMETROS.diasAvisoRespaldo` |
| Formato de placa RD (1–2 letras + 5–6 dígitos): igual que la cédula, **solo advierte** y guarda lo escrito (hay placas especiales) | advertencia | `esquemas.js` → `vehiculos.placa` (`soloAdvertir`) |
| Respaldo recomendado cada 7 días; turno abierto largo a las 12 h | 7 días / 12 h | `PARAMETROS` en `esquemas.js` |
| Precios de combustible en los datos de ejemplo | Gasoil RD$235.10, Gasolina RD$272.50 por galón | `src/data/seed.js` |
| `renta_vehiculos` y `facturacion` quedan en `CONFIG.modulos` (venían en la config pegada) pero **sin** carpeta de extensión, porque no los pidió | `false` | — |

## Decisiones técnicas

| # | Decisión | Por qué |
|---|---|---|
| T1 | La app se **evolucionó** desde la versión anterior (mismo repositorio, mismas pruebas), no se reescribió. | Conserva la lógica de retrasos y las pruebas que ya cazaron errores reales. |
| T2 | `store.js` usa **IndexedDB** (antes localStorage) con la interfaz `list / get / create / update / archive / remove`, toda **asíncrona**. | Habrá fotos (localStorage no las soporta bien) y Supabase también es asíncrono: al migrar se cambia solo ese archivo. |
| T3 | Las **fotos** van en un almacén aparte (`fotos`) y los registros guardan solo su `fotoId`. | Las listas no cargan imágenes; al migrar, ese almacén se convierte en un bucket privado de Supabase Storage. |
| T4 | Si la versión anterior dejó datos en localStorage, se copian **una vez** a IndexedDB y se borran las claves viejas. | Quien ya usaba la versión publicada no encuentra la app vacía. |
| T5 | `CONFIG` (pegado tal cual) solo dice qué está activo; los **tipos, etiquetas y validaciones** de cada campo están en `src/core/esquemas.js` (archivo agregado a la estructura pedida). Formularios y listas se generan de ahí. | El `CONFIG` de la especificación no trae tipos; mezclar ambos lo haría ilegible. |
| T6 | Las horas se guardan como **instantes ISO UTC**; la zona del negocio se aplica siempre, sin importar la zona del teléfono. | El cruce de medianoche se resuelve una vez, al capturar. |
| T7 | Rutas por **hash** (`#/viajes`). | Funciona en GitHub Pages sin configurar el servidor. |
| T8 | Archivos agregados a la estructura pedida: `src/app.js`, `src/core/esquemas.js`, `src/core/form.js`, `src/core/crud.js`, `src/core/prefs.js`, `src/core/agregados.js`, `src/modules/mas.js` y `scripts/` (servidor local, QA, e2e, íconos). | Evitan repetir lógica en cada módulo y automatizan las pruebas. |
| T9 | **Tipografías**: se mantienen Barlow Semi Condensed (títulos) y Atkinson Hyperlegible (lectura) en lugar de las sugeridas "por ejemplo" (Barlow Condensed / Source Sans 3). | Atkinson está diseñada para máxima legibilidad, útil al sol; Barlow Semi Condensed es la misma familia, un poco más ancha y legible. |
| T10 | **Tema**: claro por defecto; el oscuro se activa con el interruptor de Ajustes (y con un botón rápido en el encabezado). Ya no sigue al tema del sistema. | Lo pide la especificación ("por defecto claro"). |
| T11 | `config.example.js` va en la raíz y se copia como `src/config.local.js` (ignorado por git). | **Riesgo de la fase 8**: con "Deploy from a branch", un archivo ignorado nunca llega a GitHub Pages. Publicar con Supabase requerirá generar ese archivo en un flujo de Actions a partir de una variable del repositorio. |
| T12 | Escritorio: con mouse y ≥ 768 px, la barra inferior pasa a un riel lateral de íconos que se despliega al pasar el mouse. En el celular se mantiene la barra inferior. | Pedido del dueño del repositorio; en pantallas táctiles no existe el hover. |
| T13 | Mientras no exista la fase 8, la app muestra "Modo demostración: guardado solo en este dispositivo". **No se deben ingresar datos reales** (cédulas, direcciones, fotos) hasta tener autenticación y RLS. | Lo exige la especificación; el código y los datos de ejemplo son visibles para quien abra el enlace. |
| T14 | Sin "eliminar" en las listas: **archivar** (borrado lógico) con filtro "Archivados" para verlos y restaurarlos. | Así no se rompen viajes o cargas que apunten al registro. |
| T16 | Fotos: se reducen en el navegador antes de guardar (lado mayor 800 px; foto del chofer 400 px; JPEG 0.7) respetando la orientación de la cámara. La foto nueva se guarda solo si el registro se guarda; la reemplazada o quitada se borra después. | Lo pide la especificación y evita fotos huérfanas. |
| T17 | Tocar un chofer abre su **ficha** (foto, datos, Llamar, WhatsApp) y desde ahí "Editar". Los teléfonos se marcan con código de país 1 (`tel:+1…`, `wa.me/1…`). | La especificación pide la ficha con esos botones. |
| T18 | El botón de WhatsApp usa el verde oscuro de la marca (`#075E54`), no el verde claro (`#25D366`). | Con texto blanco, el claro tiene contraste ~2:1 y no pasa AA. |
| T19 | Vehículos: el kilometraje actual es el mayor registrado en sus cargas de combustible; con él se calcula el aviso de mantenimiento por km. | La especificación dice "según el último kilometraje registrado". |
| T20 | **Estados del viaje** (los 5 pedidos): Programado (gris), En ruta (azul), A tiempo (verde), Retrasado (+N min) (rojo) y Sin llegada registrada (ámbar: pide acción). Si pasó la hora de salida sin registrarla, se añade "Salida pendiente". El retraso que decide es el de **llegada**; el de **salida** se muestra como dato ("Salió 5:52 a. m. (+7 min)"). | Lo pide la especificación. |
| T21 | "Salió ahora / Llegó ahora" (un toque, guardaba la hora del teléfono) se reemplazó por **"Registrar salida / Registrar llegada"**: una hoja corta con la hora escrita a mano y el atajo "Ahora", que solo rellena el campo. | El cliente eligió escribir la hora a mano. |
| T22 | El motivo del retraso aparece solo cuando la llegada escrita supera la tolerancia; es obligatorio si `CONFIG.viajes.motivo = 'obligatorio_si_retraso'`. Si se corrige la hora y deja de haber retraso, el motivo se borra al guardar. | Interpretación de "Sí, siempre" (supuesto arriba). |
| T23 | "Generar viajes de hoy" (o del día elegido) crea un viaje por cada horario fijo de cada ruta activa, sin chofer ni vehículo, con la llegada = salida + duración normal. No duplica: si ya existe ese viaje (no archivado), lo omite. Por eso chofer y vehículo ya **no son obligatorios** al crear; la tarjeta muestra "Sin chofer" / "Sin vehículo". | El supervisor los asigna después, como pide la especificación. |
| T24 | Los avisos breves (toasts) no capturan toques y se ven como máximo 2 a la vez. | Las pruebas encontraron que, al encadenar acciones, se apilaban y tapaban los botones: un toque podía no responder. |
| T25 | Cada aviso tiene severidad (**urgente**: vencido, dentro del umbral menor o sin llegada; **atención**: el resto) y abre su ficha: `#/choferes?abrir=…`, `#/vehiculos?abrir=…`, `#/viajes?fecha=…&abrir=…`, `#/combustible?abrir=…`. El aviso de "turno abierto más de 12 h" de la versión anterior se quitó (no está entre los avisos pedidos; `chofer_sin_entrada` está en `false`). | Lo pide la especificación. |
| T26 | Combustible: fecha y hora como dos campos; el tipo por defecto es el primero de `CONFIG.combustible.tipos`; el kilometraje es un número entero; precio por galón y rendimiento se calculan y muestran en la lista (o el motivo por el que aún no se puede). | — |
| T27 | **Gráfica "Retrasos por día"** en SVG propio, forma de **énfasis** (una serie): hoy resaltado y los otros 6 días en gris apagado; sin leyenda (el título dice qué es). Colores validados por contraste contra la tarjeta (≥ 3:1): claro, hoy `#12334A` (13.1:1) y resto `#7D8EA0` (3.4:1); oscuro, hoy `#9FD0FF` (10.6:1) y resto `#5D7083` (3.4:1). Se descartó el ámbar para hoy: sobre blanco da 2.0:1. | La guía de visualización recomienda énfasis para una serie y exige 3:1 en las marcas. |
| T28 | La gráfica sigue la guía: barras de máximo 24 px con el extremo de datos redondeado (4 px) y la base recta, retícula fina, etiqueta directa solo en hoy y en el día más alto, área táctil de la columna entera, tooltip con ratón **y** con teclado (Escape lo cierra), el eje dice "hoy" aunque valga 0, y una **tabla alternativa** ("Ver como tabla") con todos los valores. | Accesibilidad: ningún valor depende de pasar el ratón o de ver el color. |
| T29 | En Inicio el título del encabezado es la empresa ("Dilo group") y la línea pequeña de arriba es la fecha de hoy. | La especificación pide "encabezado con nombre de la empresa y fecha de hoy". |
| T30 | Las 4 tarjetas: Viajes de hoy, Retrasos de hoy (en rojo si > 0), Combustible de hoy (galones, con el monto y las cargas) y Choferes activos. Los totales cuentan de 0 al valor una sola vez por sesión. "Retrasos" = viajes de hoy que llegaron tarde (los **sin llegada** salen en Avisos como urgentes, no aquí). | Lo pide la especificación. |
| T31 | Avisos en Inicio: los **3** primeros (urgentes primero) con su nivel escrito (Urgente / Atención) además del color; "Ver todos (N)" abre la lista completa; sin avisos, "Todo en orden". Cada uno abre su ficha. | `PARAMETROS.avisosEnInicio` en `esquemas.js` (supuesto: 3). |
| T32 | La lista de **Viajes de hoy** muestra todos los de hoy con su estado (antes solo los pendientes). Los viajes nocturnos de ayer aún sin llegada ya no se mezclan ahí: aparecen como aviso urgente. | La especificación pide "la lista de los viajes de hoy con su estado". |
| T15 | Horas en 12 h con a. m./p. m.; fechas **dd/mm/aaaa** (la fecha larga solo en títulos); dinero RD$ con separador de miles. | Formato pedido. |

## Validaciones

- Teléfono: 10 dígitos que empiezan por 809, 829 u 849.
- Cédula: 11 dígitos, se aceptan guiones; se muestra como `001-1234567-8`. (Fase 2: si no cumple, **solo advierte**, no bloquea.)
- Placa: 1–2 letras + 5–6 dígitos.
