# Dilo group · Control de Transporte

[![CI](https://github.com/socra375/Transpo-IA/actions/workflows/ci.yml/badge.svg)](https://github.com/socra375/Transpo-IA/actions/workflows/ci.yml)

Web app móvil para **un supervisor** de transporte de personal en República Dominicana: viajes y retrasos, choferes y asistencia, rutas con horarios fijos, vehículos (seguro y mantenimiento), combustible con rendimiento y reportes para compartir por WhatsApp. Funciona sin internet una vez instalada.

- HTML + CSS + JavaScript (módulos ES). **Sin framework y sin build**: los archivos se publican tal cual. La única dependencia son las fuentes de Google.
- Datos en el teléfono (**IndexedDB**, con fotos) detrás de una capa (`src/data/store.js`) lista para cambiar a Supabase.
- ⚠️ **Modo demostración**: no ingreses datos reales (cédulas, direcciones, fotos de empleados) hasta completar la fase 8 (autenticación + RLS). El código y los datos de ejemplo son visibles para quien abra el enlace.
- Software propietario: ver [LICENSE.md](LICENSE.md). Decisiones y supuestos por confirmar: [DECISIONES.md](DECISIONES.md).

## Correr en local

Los módulos ES no cargan con `file://`; hace falta un servidor local:

```bash
npm run serve          # http://localhost:8080  (o: python3 -m http.server 8080)
```

Ábrelo con el modo "dispositivo móvil" del navegador (390 px). La primera vez se cargan los **datos de ejemplo** (con una franja visible); se borran de una vez en *Más → Ajustes*.

## Pruebas

| Comando | Qué revisa |
|---|---|
| `npm test` | Unitarias (Node ≥ 20, sin dependencias): retrasos con medianoche, tolerancia y "sin llegada"; generación de viajes desde horarios; cada aviso (licencia, seguro, mantenimiento, combustible alto con y sin datos); rendimiento km/gal; reportes, CSV y textos de WhatsApp; lista del service worker. |
| `npm run e2e` | Flujos reales en Chromium: validaciones, hora real a mano y motivo obligatorio, generar viajes, asistencia, fotos, compartir por WhatsApp (con y sin Web Share API), CSV, respaldo con fotos, migración de datos antiguos. |
| `npm run qa` | Todas las pantallas a 390 px en claro y oscuro (y escritorio, y 360 px con letra extra grande): errores de consola, desbordes, **contraste AA**, **accesibilidad con axe-core**, movimiento reducido y apertura sin conexión. Guarda capturas en `qa/capturas/`. |

`e2e` y `qa` usan Playwright; la revisión de accesibilidad usa axe-core (solo para pruebas):

```bash
npm i --no-save playwright axe-core && npx playwright install chromium
```

Las tres corren en **GitHub Actions** en cada push (`.github/workflows/ci.yml`); las capturas quedan como artefacto. Un cambio se fusiona a `main` solo con las tres en verde (ver `CLAUDE.md`).

## Publicar en GitHub Pages

1. Sube el repositorio a GitHub con `index.html` en la raíz.
2. **Settings → Pages → Build and deployment → Source: Deploy from a branch**, rama **`main`**, carpeta **`/ (root)`**. Guarda.
3. En 1–2 minutos queda en `https://<usuario>.github.io/<repositorio>/`.

Todas las rutas son relativas y la navegación usa `#/pantalla`: no hay que configurar nada más. Pages sirve por HTTPS, requisito del service worker y de instalar la app.

**En cada publicación**, sube `VERSION` en `sw.js` (`'v9'` → `'v10'`): los teléfonos reciben la versión nueva la siguiente vez que abren la app. Si agregas un archivo `.js`/`.css`/imagen, añádelo a `ARCHIVOS` en `sw.js`: `npm test` falla si se te olvida.

### Instalar en el teléfono

- **iPhone (Safari):** Compartir → *Agregar a pantalla de inicio*.
- **Android (Chrome):** menú ⋮ → *Instalar app*.

> ⚠️ Mientras no exista la fase 8, los datos viven **solo en ese teléfono**. En iPhone, Safari puede borrar los datos de un sitio que no se abre en 7 días **si no está instalado**. Instálala y exporta un respaldo semanal (*Ajustes → Exportar respaldo*, incluye las fotos); Inicio avisa cuando toca.

## Cambiar un campo o un aviso desde config

Qué está activo se decide en **`src/config.js`** (`CONFIG`); cómo es cada campo (tipo, etiqueta, validación), en `src/core/esquemas.js`. **Cambiar un campo es editar una línea:**

| Quiero… | Edito |
|---|---|
| Mostrar u ocultar un campo | `CONFIG.<módulo>.campos.<campo>: true/false` — p. ej. `CONFIG.rutas.campos.km = true` |
| Cambiar el nombre de la empresa | `CONFIG.empresa.nombre` |
| Color principal / acento | `CONFIG.tema.color`, `CONFIG.tema.acento` (el tema oscuro se deriva solo) |
| Tema y letra por defecto | `CONFIG.tema.modo` (`claro`/`oscuro`), `CONFIG.tema.letra` (`normal`/`grande`/`extra`) |
| Tolerancia de retraso | `CONFIG.viajes.tolerancia_min` (también se cambia en Ajustes) |
| Quitar el atajo "Ahora" o el generador de viajes | `CONFIG.viajes.atajo_ahora`, `CONFIG.viajes.generar_desde_horarios` |
| Que el motivo del retraso sea opcional | `CONFIG.viajes.motivo` (cualquier valor distinto de `'obligatorio_si_retraso'`) |
| Tipos de combustible | `CONFIG.combustible.tipos` |
| Encender o apagar un reporte, o el CSV | `CONFIG.reportes.<reporte>`, `CONFIG.reportes.csv` |
| Encender o apagar un aviso, o sus umbrales por defecto | `CONFIG.avisos.<aviso>` (el supervisor ajusta los umbrales en Ajustes) |
| Ocultar la asistencia de choferes | `CONFIG.modulos.asistencia = false` (desaparecen la pantalla y su acceso) |
| Hacer obligatorio un campo, cambiar su etiqueta o validación | su entrada en `src/core/esquemas.js` (`requerido`, `etiqueta`, `patron`…) |

Los módulos futuros (sueldos, mantenimiento completo, servicios del vehículo, mapa, acceso de choferes) tienen una carpeta en `src/modules/extensiones/<carpeta>/` con una línea de instrucciones y su interruptor en `CONFIG.modulos` (en `false`).

## Estructura

```
index.html, manifest.webmanifest, sw.js, LICENSE.md, README.md, DECISIONES.md
config.example.js         plantilla de src/config.local.js (fase 8; ese archivo no se sube)
icons/                    íconos de la PWA (SVG fuente + PNG; `node scripts/iconos.cjs`)
src/app.js                arranque: apariencia, migración de datos, datos de ejemplo, router, service worker
src/config.js             CONFIG del cliente: qué está activo
src/data/store.js         capa de datos: list, get, create, update, archive, remove (+ fotos)
src/data/seed.js          datos de ejemplo
src/core/esquemas.js      campos de cada módulo (tipo, etiqueta, validación) y parámetros
src/core/router.js        rutas por hash        src/core/ui.js      hoja inferior, confirmación, toasts
src/core/form.js          formularios generados desde esquemas (fotos, horarios, motivos)
src/core/crud.js          lista/buscar/crear/editar/archivar genérico
src/core/time.js          zona horaria, medianoche, estado y retraso de viajes, generar viajes
src/core/avisos.js        los 5 avisos y el rendimiento km/gal
src/core/agregados.js     cálculos de reportes y CSV    src/core/share.js   WhatsApp y llamadas
src/core/grafica.js       gráfica de barras en SVG      src/core/fotos.js   reducir y mostrar fotos
src/modules/              una pantalla por archivo (+ extensiones/ reservadas)
src/styles/               tokens, base, componentes, animaciones
tests/                    pruebas unitarias (node --test)
scripts/                  servidor local, QA, e2e, generador de íconos
```

## Migrar el store a Supabase (fase 8)

**Pendiente.** Se hace tocando **solo `src/data/store.js`** (los módulos llaman a `list / get / create / update / archive / remove` y a las funciones de fotos, todas asíncronas) y agregando el inicio de sesión. Cuando esté lista, esta sección traerá el SQL de las tablas, las políticas RLS en **todas** las tablas, el bucket **privado** de fotos con URLs firmadas y los pasos de configuración. Hasta entonces **no ingreses datos reales**.
