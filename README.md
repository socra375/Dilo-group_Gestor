# Dilo group · Control de Transporte

[![CI](https://github.com/socra375/Transpo-IA/actions/workflows/ci.yml/badge.svg)](https://github.com/socra375/Transpo-IA/actions/workflows/ci.yml)

Web app móvil para **un supervisor** de transporte de personal en República Dominicana: viajes y retrasos, choferes y turnos, rutas, vehículos, combustible y reportes. Funciona sin internet una vez instalada.

- HTML + CSS + JavaScript (módulos ES). **Sin framework y sin build**: los archivos se publican tal cual.
- Datos en el teléfono (**IndexedDB**, con fotos) detrás de una capa (`src/data/store.js`) lista para cambiar a Supabase.
- ⚠️ **Modo demostración**: no ingreses datos reales (cédulas, direcciones, fotos) hasta completar la fase 8 (autenticación + RLS).
- Software propietario: ver [LICENSE.md](LICENSE.md).
- Qué está activo vive en **`src/config.js`**; cómo es cada campo, en `src/core/esquemas.js` (ver [DECISIONES.md](DECISIONES.md)).

## Probar en tu computadora

Los módulos ES no cargan con `file://`; hace falta un servidor local:

```bash
npm run serve          # http://localhost:8080  (o: python3 -m http.server 8080)
```

Abre la dirección con el modo "dispositivo móvil" del navegador (390 px). La primera vez se cargan los **datos de ejemplo**; se borran desde *Más → Ajustes*.

## Pruebas

| Comando | Qué revisa |
|---|---|
| `npm test` | Pruebas unitarias (Node ≥ 20, sin dependencias): retrasos con medianoche, tolerancia y "sin llegada", licencias, reportes, CSV y lista del service worker. |
| `npm run e2e` | Flujos reales en Chromium headless: validaciones, viaje nocturno, Salió/Llegó ahora, turnos, archivar, CSV, tolerancia, tema, respaldo exportar → importar. |
| `npm run qa` | Todas las pantallas a 390 px en tema claro y oscuro: errores de consola, desbordes horizontales, contraste AA de cada texto y apertura sin conexión. Guarda capturas en `qa/capturas/`. |

`e2e` y `qa` usan Playwright (`npm i --no-save playwright && npx playwright install chromium` si no lo tienes).

Las tres corren en **GitHub Actions** en cada push y PR (`.github/workflows/ci.yml`). Las capturas de QA quedan como artefacto `capturas-qa` en cada ejecución. Un cambio se fusiona a `main` solo si ese check está en verde (ver `CLAUDE.md`).

## Publicar en GitHub Pages

1. Sube el repositorio a GitHub con estos archivos en la raíz (`index.html` en la raíz).
2. En GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch**. Elige la rama (`main`) y la carpeta **`/ (root)`**. Guarda.
3. En 1–2 minutos queda en `https://<usuario>.github.io/<repositorio>/`.

Todas las rutas son relativas y la navegación usa `#/pantalla`, así que no hay que configurar nada más. GitHub Pages sirve por HTTPS, requisito para el service worker y para instalar la app.

**Cada vez que publiques cambios**, sube `VERSION` en `sw.js` (`'v1'` → `'v2'`). Los teléfonos reciben la versión nueva la siguiente vez que abren la app. Si agregas un archivo `.js`/`.css`, añádelo a `ARCHIVOS` en `sw.js`: `npm test` falla si se te olvida.

### Instalar en el teléfono

- **iPhone (Safari):** botón Compartir → *Agregar a pantalla de inicio*.
- **Android (Chrome):** menú ⋮ → *Instalar app*.

> ⚠️ **Importante para los datos.** Mientras no exista la fase 8 (Supabase), los datos existen **solo en ese teléfono**. En iPhone, Safari borra los datos de un sitio que no se abre en 7 días **si no está instalado** en la pantalla de inicio. Instálala y exporta un respaldo semanal (*Ajustes → Exportar respaldo*); Inicio avisa cuando toca.

## Configurar (respuestas del cliente)

Qué está activo se decide en `src/config.js` (`CONFIG`); cómo es cada campo, en `src/core/esquemas.js`. **Cambiar un campo es editar una línea**:

| Quiero… | Edito |
|---|---|
| Cambiar el nombre de la empresa | `CONFIG.empresa.nombre` |
| Cambiar color principal / acento | `CONFIG.tema.color`, `CONFIG.tema.acento` (el tema oscuro se deriva solo) |
| Tema y letra por defecto | `CONFIG.tema.modo` (`claro`/`oscuro`), `CONFIG.tema.letra` (`normal`/`grande`/`extra`) |
| Tolerancia de retraso | `CONFIG.viajes.tolerancia_min` (el usuario también la cambia en Ajustes) |
| Ocultar o mostrar un campo | `CONFIG.<módulo>.campos.<campo>: true/false` (p. ej. `CONFIG.rutas.campos.km = true`) |
| Hacer un campo obligatorio, cambiar su etiqueta o validación | su entrada en `src/core/esquemas.js` (`requerido`, `etiqueta`, `patron`…) |
| Encender o apagar un aviso | `CONFIG.avisos.<aviso>` |
| Activar un módulo futuro | `CONFIG.modulos.<id>: true` + su `index.js` en `src/modules/extensiones/<carpeta>/` |

Si cambias el color principal, regenera los íconos (`icons/icon.svg` → `node scripts/iconos.cjs`) y actualiza `theme_color` en `manifest.webmanifest`.

## Estructura

```
index.html, manifest.webmanifest, sw.js
icons/                    íconos de la PWA (SVG fuente + PNG)
src/app.js                arranque: apariencia, datos de ejemplo, router, service worker
src/config.js             CONFIG del cliente: qué está activo
src/core/esquemas.js      campos de cada módulo (tipo, etiqueta, validación)
src/data/store.js         capa de datos (list, get, create, update, remove)
src/data/seed.js          datos de ejemplo
src/core/router.js        rutas por hash
src/core/ui.js            hoja inferior, confirmación, toasts, vacíos, esqueleto, contadores
src/core/form.js          formularios generados desde config + validación
src/core/crud.js          pantalla genérica lista/buscar/crear/editar/archivar
src/core/time.js          zona horaria, medianoche y estado/retraso de viajes
src/core/format.js        horas 12 h, RD$, fechas, teléfono y cédula
src/core/agregados.js     cálculos de reportes y CSV
src/core/prefs.js         preferencias de este dispositivo
src/modules/              una pantalla por archivo (+ extensiones/ reservadas)
src/styles/               tokens, base, componentes, animaciones
tests/                    pruebas unitarias (node --test)
scripts/                  servidor local, QA, flujos e2e, generador de íconos
```

## Migrar el store a Supabase

Los módulos solo llaman a `store.list / get / create / update / remove`, todas **asíncronas**, y a `createMany / removeMany / exportAll / replaceAll` (respaldo y datos de ejemplo). Para pasar a Supabase se reescribe **solo `src/data/store.js`** con la misma firma.

### 1. Tablas

Una tabla por colección. Para que el código no cambie, las columnas usan los mismos nombres (camelCase, entre comillas) que hoy:

```sql
create table choferes (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users,
  nombre text not null, telefono text, cedula text, licencia text,
  "licenciaVence" date, estado text not null default 'activo', notas text,
  archivado boolean not null default false, ejemplo boolean not null default false,
  creado timestamptz not null default now(), actualizado timestamptz not null default now()
);
create table rutas (
  id uuid primary key default gen_random_uuid(), owner uuid not null default auth.uid() references auth.users,
  nombre text not null, origen text, destino text, "duracionMin" int not null, notas text,
  archivado boolean not null default false, ejemplo boolean not null default false,
  creado timestamptz not null default now(), actualizado timestamptz not null default now()
);
create table vehiculos (
  id uuid primary key default gen_random_uuid(), owner uuid not null default auth.uid() references auth.users,
  placa text not null, descripcion text, estado text not null default 'disponible', notas text,
  archivado boolean not null default false, ejemplo boolean not null default false,
  creado timestamptz not null default now(), actualizado timestamptz not null default now(),
  unique (owner, placa)
);
create table viajes (
  id uuid primary key default gen_random_uuid(), owner uuid not null default auth.uid() references auth.users,
  "rutaId" uuid references rutas, "choferId" uuid references choferes, "vehiculoId" uuid references vehiculos,
  "salidaProg" timestamptz not null, "llegadaProg" timestamptz not null,
  "salidaReal" timestamptz, "llegadaReal" timestamptz, "motivoRetraso" text,
  archivado boolean not null default false, ejemplo boolean not null default false,
  creado timestamptz not null default now(), actualizado timestamptz not null default now()
);
create index on viajes (owner, "salidaProg");
create table combustible (
  id uuid primary key default gen_random_uuid(), owner uuid not null default auth.uid() references auth.users,
  fecha date not null, "vehiculoId" uuid references vehiculos, "choferId" uuid references choferes,
  cantidad numeric(8,1) not null, monto numeric(12,2) not null, notas text,
  archivado boolean not null default false, ejemplo boolean not null default false,
  creado timestamptz not null default now(), actualizado timestamptz not null default now()
);
create table turnos (
  id uuid primary key default gen_random_uuid(), owner uuid not null default auth.uid() references auth.users,
  "choferId" uuid references choferes, fecha date not null, entrada timestamptz not null, salida timestamptz,
  archivado boolean not null default false, ejemplo boolean not null default false,
  creado timestamptz not null default now(), actualizado timestamptz not null default now()
);

-- Seguridad: cada usuario ve solo lo suyo (repetir para las 6 tablas).
alter table viajes enable row level security;
create policy "solo dueño" on viajes for all using (owner = auth.uid()) with check (owner = auth.uid());
```

Los IDs de los datos de ejemplo (`ej-chofer-1`…) no son UUID: bórralos antes de migrar, o cambia `id` a `text`.

### 2. Reescribir `store.js`

Se puede usar la API REST de Supabase con `fetch`, sin librerías. Esquema (falta el inicio de sesión: Supabase Auth con enlace por correo, que entrega el `token`):

```js
const URL = 'https://<proyecto>.supabase.co/rest/v1';
const KEY = '<anon key>';           // pública; la protección real es RLS
let token = null;                    // access_token de la sesión de Supabase Auth

async function api(ruta, op = {}) {
  const r = await fetch(`${URL}/${ruta}`, {
    ...op,
    headers: { apikey: KEY, Authorization: `Bearer ${token ?? KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...op.headers },
  });
  if (!r.ok) throw new Error((await r.json()).message || 'Error de conexión');
  return r.status === 204 ? null : r.json();
}

export async function list(col, { archivados = false } = {}) {
  const filtro = archivados === 'todos' ? '' : `&archivado=eq.${Boolean(archivados)}`;
  return api(`${col}?select=*${filtro}`);
}
export async function get(col, id) { return (await api(`${col}?id=eq.${id}`))[0] ?? null; }
export async function create(col, datos) { return (await api(col, { method: 'POST', body: JSON.stringify(datos) }))[0]; }
export async function update(col, id, cambios) {
  return (await api(`${col}?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ ...cambios, actualizado: new Date().toISOString() }) }))[0];
}
export async function remove(col, id) { await api(`${col}?id=eq.${id}`, { method: 'DELETE' }); return true; }
// createMany: POST con un arreglo · removeMany: DELETE ?id=in.(a,b) · exportAll/replaceAll: list + POST por tabla.
```

Después de migrar, `list()` trae todas las filas. Cuando haya muchos viajes, conviene filtrar por fecha en el servidor (`salidaProg=gte.…`); es el siguiente paso natural.

Las preferencias del dispositivo (`src/core/prefs.js`) se quedan en localStorage. Si la tolerancia debe ser igual en varios teléfonos, se mueve a una tabla `ajustes`.

## Fuera de alcance (puntos de extensión)

Sueldos, renta de vehículos, mantenimiento, mapa/GPS y cuentas de choferes tienen una carpeta reservada en `src/modules/extensiones/<id>/` con instrucciones, y una entrada `activo: false` en `config.extensiones`.
