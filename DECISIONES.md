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
| Rendimiento km/galón: solo entre cargas de **tanque lleno** (si una carga no llenó el tanque, el cálculo da números falsos y dispararía el aviso de combustible alto) | casilla "Tanque lleno", marcada por defecto | fase 4 |
| Formato de placa RD (1–2 letras + 5–6 dígitos) | patrón de validación | `esquemas.js` → `vehiculos.placa.patron` |
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
| T15 | Horas en 12 h con a. m./p. m.; fechas **dd/mm/aaaa** (la fecha larga solo en títulos); dinero RD$ con separador de miles. | Formato pedido. |

## Validaciones

- Teléfono: 10 dígitos que empiezan por 809, 829 u 849.
- Cédula: 11 dígitos, se aceptan guiones; se muestra como `001-1234567-8`. (Fase 2: si no cumple, **solo advierte**, no bloquea.)
- Placa: 1–2 letras + 5–6 dígitos.
