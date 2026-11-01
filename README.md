# Dilo group · Control de Transporte

[![CI](https://github.com/socra375/Transpo-IA/actions/workflows/ci.yml/badge.svg)](https://github.com/socra375/Transpo-IA/actions/workflows/ci.yml)

Web app móvil para **un supervisor** de transporte de personal en República Dominicana: viajes y retrasos, choferes y asistencia, rutas con horarios fijos, vehículos (seguro y mantenimiento), combustible con rendimiento y reportes para compartir por WhatsApp. Funciona sin internet una vez instalada.

- HTML + CSS + JavaScript (módulos ES). **Sin framework y sin build**: los archivos se publican tal cual. La única dependencia son las fuentes de Google.
- Dos modos con la misma interfaz (`src/data/store.js`): **demostración** (sin cuenta; los datos quedan en el teléfono, IndexedDB) y **nube** (Supabase: inicio de sesión, RLS y fotos en un bucket privado). Cuál corre lo decide un archivo: `src/config.local.js`.
- ⚠️ **Sin `src/config.local.js` la app está en modo demostración: no ingreses datos reales** (cédulas, direcciones, fotos de empleados). Los datos reales solo se permiten con el modo nube **ya desplegado y verificado** (sección *Supabase*, abajo). El código de la página y los datos de ejemplo son visibles para quien abra el enlace.
- Software propietario: ver [LICENSE.md](LICENSE.md). Decisiones y supuestos por confirmar: [DECISIONES.md](DECISIONES.md).

## Correr en local

Los módulos ES no cargan con `file://`; hace falta un servidor local:

```bash
npm run serve          # http://localhost:8080  (o: python3 -m http.server 8080)
```

Ábrelo con el modo "dispositivo móvil" del navegador (390 px). **La app arranca vacía**: no trae ningún dato inventado. Inicio muestra una guía de *Primeros pasos* (vehículos → choferes → rutas con horarios → viajes) que desaparece sola cuando ya hay un vehículo, un chofer y una ruta con horario. Las pruebas cargan sus propios datos desde `tests/fixtures/ejemplo.js`; eso no forma parte de la app.

## Pruebas

| Comando | Qué revisa |
|---|---|
| `npm test` | Unitarias (Node ≥ 20, sin dependencias): retrasos con medianoche, tolerancia y "sin llegada"; generación de viajes desde horarios; cada aviso (licencia, seguro, mantenimiento, combustible alto con y sin datos); rendimiento km/gal; reportes, CSV y textos de WhatsApp; lista del service worker; **cliente de Supabase** contra un servidor falso (sesión, renovación de token, aislamiento entre usuarios, claves foráneas, fotos privadas con URL firmada, paginación) y coherencia entre el SQL y el cliente; barrera contra claves `service_role`. |
| `npm run e2e` | Flujos reales en Chromium: validaciones, hora real a mano y motivo obligatorio, generar viajes, asistencia, fotos, compartir por WhatsApp (con y sin Web Share API), CSV, respaldo con fotos, migración de datos antiguos; y, aparte (`scripts/e2e-nube.cjs`), el **modo nube** completo contra el servidor falso. |
| `npm run qa` | Todas las pantallas a 390 px en claro y oscuro (y escritorio, y 360 px con letra extra grande): errores de consola, desbordes, **contraste AA**, **accesibilidad con axe-core**, movimiento reducido y apertura sin conexión; pantalla de **Entrar**. Guarda capturas en `qa/capturas/`. |

`e2e` y `qa` usan Playwright; la revisión de accesibilidad usa axe-core (solo para pruebas):

```bash
npm i --no-save playwright axe-core && npx playwright install chromium
```

Las tres corren en **GitHub Actions** en cada push (`.github/workflows/ci.yml`); las capturas quedan como artefacto. Un cambio se fusiona a `main` solo con las tres en verde (ver `CLAUDE.md`).

## Publicar en Vercel (recomendado)

Vercel importa el repositorio directo desde GitHub: **sin tokens ni flujos**. Cada fusión a `main` se publica sola y cada rama genera una vista previa. `vercel.json` ya dice cómo construir (`bash scripts/armar-sitio.sh public`) y trae las cabeceras de caché y seguridad.

1. Entra a [vercel.com](https://vercel.com) → **Sign Up → Continue with GitHub**.
2. **Add New… → Project**, busca `Dilo-group_Gestor` → **Import**. Si no aparece, pulsa *Adjust GitHub App Permissions* y dale acceso al repositorio.
3. **Framework Preset: Other**. No cambies el resto (lo lee de `vercel.json`).
4. Abre **Environment Variables** y agrega: `SUPABASE_URL` = `https://qirxfgpnjjgxdqbvghfj.supabase.co` y `SUPABASE_ANON_KEY` = la clave `anon` (pública por diseño; **nunca la `service_role`**: el armado se detiene si lo es).
5. Pulsa **Deploy**. Al terminar (1–2 minutos) Vercel muestra el enlace `https://<proyecto>.vercel.app`.
6. **Dominio propio** (opcional): *Project → Settings → Domains → Add*.

**Actualizaciones**: el service worker se registra al arrancar y, cuando llega una versión nueva, la página se recarga sola una vez (si alguien está escribiendo, espera al próximo cambio de pantalla). *Ajustes → Este dispositivo → Compilación* muestra qué versión corre.

> ⚠️ El plan gratuito *Hobby* de Vercel es para uso personal y no comercial. Para una empresa cliente, revisa si corresponde el plan *Pro*.

## Publicar en GitHub Pages (alternativa)

1. Sube el repositorio a GitHub con `index.html` en la raíz.
2. **Settings → Pages → Build and deployment → Source: Deploy from a branch**, rama **`main`**, carpeta **`/ (root)`**. Guarda.
3. En 1–2 minutos queda en `https://<usuario>.github.io/<repositorio>/`.

Todas las rutas son relativas y la navegación usa `#/pantalla`: no hay que configurar nada más. Pages sirve por HTTPS, requisito del service worker y de instalar la app.

**En cada publicación**, sube `VERSION` en `sw.js` (`'v10'` → `'v11'`): los teléfonos reciben la versión nueva la siguiente vez que abren la app. Si agregas un archivo `.js`/`.css`/imagen, añádelo a `ARCHIVOS` en `sw.js`: `npm test` falla si se te olvida.

### Instalar en el teléfono

- **iPhone (Safari):** Compartir → *Agregar a pantalla de inicio*.
- **Android (Chrome):** menú ⋮ → *Instalar app*.

> ⚠️ Mientras no exista la fase 8, los datos viven **solo en ese teléfono**. En iPhone, Safari puede borrar los datos de un sitio que no se abre en 7 días **si no está instalado**. Instálala y exporta un respaldo semanal (*Ajustes → Exportar respaldo*, incluye las fotos); Inicio avisa cuando toca.

## Cambiar el logo

1. Guarda la imagen del logo (idealmente con fondo blanco liso y sin bordes de captura de pantalla).
2. `python3 scripts/logo.py ruta/al/logo.png` genera `icons/logo.png` y `icons/logo-marca.png` con fondo transparente (necesita `pip install pillow numpy`).
3. `node scripts/iconos.cjs` regenera los íconos de la pantalla de inicio del teléfono.
4. Sube `VERSION` en `sw.js` y publica. En el celular, el ícono de la pantalla de inicio puede tardar en actualizarse: hay que quitar la app y volver a instalarla.

El logo va siempre sobre una pastilla blanca (es gris y ámbar; sobre el azul marino del encabezado no se leería).

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
index.html, manifest.webmanifest, sw.js, vercel.json, _headers, LICENSE.md, README.md, DECISIONES.md
config.example.js         plantilla de src/config.local.js (activa el modo nube; ese archivo no se sube)
supabase/001_tablas_y_seguridad.sql   tablas, RLS y bucket privado (se ejecuta una vez en Supabase)
icons/                    logo del cliente (`logo.png`, `logo-marca.png`) e íconos de la PWA (`python3 scripts/logo.py <imagen>` y luego `node scripts/iconos.cjs`)
src/app.js                arranque: apariencia, migración de datos, router, service worker
src/config.js             CONFIG del cliente: qué está activo
src/data/store.js         capa de datos: list, get, create, update, archive, remove (+ fotos); IndexedDB o Supabase
src/data/supabase.js      cliente mínimo de Supabase (Auth, PostgREST, Storage) con fetch, sin librerías
src/core/entrar.js        pantalla de inicio de sesión (solo modo nube)
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
tests/                    pruebas unitarias (node --test) y tests/fixtures/ (datos de prueba para e2e y QA, no se publican)
scripts/                  armar-sitio.sh (lo que se publica), servidor local, QA, e2e (+ modo nube), Supabase falso, generador de íconos, generador de config.local.js para publicar
.github/workflows/        ci.yml (pruebas en cada push) y pages.yml (GitHub Pages, manual)
```

## Supabase: inicio de sesión, RLS y fotos privadas (fase 8)

> ⚠️ **Estado honesto (1 de noviembre de 2026).** El SQL ya se aplicó en un proyecto real de Supabase y el **aislamiento se verificó en su Postgres**: con dos usuarios de prueba, el segundo no ve, no actualiza, no borra ni inserta a nombre del primero; `anon` no puede leer; cada usuario solo sube a su carpeta de fotos (script reutilizable: `supabase/pruebas/aislamiento.sql`). **Lo que NO se ha verificado contra el proyecto real**: el inicio de sesión por HTTP, la API REST y las URLs firmadas de Storage desde un navegador, y que el registro público esté cerrado (esas pruebas corrieron contra un servidor falso, `scripts/supabase-falso.cjs`, porque el entorno de desarrollo no tenía salida a `supabase.co`). Hasta repetir `npm run e2e` apuntando al proyecto real y cerrar el registro, **no ingreses datos reales**.

### Cómo se protege
- **Auth**: el supervisor entra con correo y contraseña. No hay registro público: el administrador crea la cuenta en el panel.
- **RLS activado y forzado en TODAS las tablas** (`vehiculos, rutas, choferes, viajes, combustible, asistencia`). Cada fila lleva `owner = auth.uid()`; la única política es "solo el dueño" para el rol `authenticated`. El rol `anon` —la clave que va en la página— no puede leer ni escribir nada.
- **Fotos** en un bucket **privado** (`fotos`, máx. 2 MB, solo JPEG/PNG/WebP), una carpeta por usuario (`<uid>/<foto>`). Se leen con **URLs firmadas de 5 minutos**; nunca hay enlace público.
- **Ningún secreto en el repositorio.** En la página solo va la clave pública (*anon* / *publishable*), en `src/config.local.js` (ignorado por git). **Nunca la `service_role`**: se salta RLS. Asume que cualquiera que abra la página ve todo su código y esa clave; lo que protege los datos es RLS, no esconder la clave.

### Pasos
1. **Proyecto**: crea uno en [supabase.com](https://supabase.com) (o usa uno propio). Región cercana (p. ej. Norteamérica Este).
2. **SQL**: *SQL Editor → New query*, pega el bloque de abajo y ejecútalo **una vez**. Está en `supabase/001_tablas_y_seguridad.sql`.
3. **Cerrar el registro**: *Authentication → Sign In / Providers → Email*: desactiva **"Allow new users to sign up"** (si no, cualquiera con la clave pública se puede crear una cuenta). Considera también exigir contraseña larga.
4. **Crear el usuario**: *Authentication → Users → Add user* con el correo y la contraseña del supervisor.
5. **Conectar la página**: copia `config.example.js` como `src/config.local.js` y pon la **URL del proyecto** y la **clave anon/publishable** (*Project Settings → API*). La clave `anon` clásica y la nueva `sb_publishable_…` funcionan; la nueva no es un JWT y el cliente la manda solo en `apikey`. Para probar en tu computadora: `npm run serve`.
6. **Prueba de aislamiento (obligatoria antes de datos reales)**: pega `supabase/pruebas/aislamiento.sql` en el SQL Editor. Crea dos usuarios de prueba, comprueba las políticas y termina con un error `RESULTADOS: …` que deshace todo; cada frase debe coincidir con lo «esperado». Después, con el supervisor real y un segundo usuario de prueba, comprueba desde la consola de un navegador que `fetch('<url>/rest/v1/choferes?select=*', { headers: { apikey, Authorization: 'Bearer ' + <token del segundo> } })` devuelve `[]`, y borra ese usuario. En *Advisors → Security* solo debe aparecer la función `rls_auto_enable` (la instala Supabase como disparador de eventos para activar RLS en tablas nuevas; no se puede invocar como RPC).
7. **Respaldo**: *Ajustes → Exportar respaldo* funciona en modo nube (incluye fotos). *Importar* **reemplaza todos los datos de tu cuenta** por los del respaldo; si la base rechaza algo a mitad de carga, se restauran los datos anteriores. Los datos de ejemplo de la demostración **no** se migran y un respaldo de la demostración se rechaza.

### Publicar con Supabase en GitHub Pages
`src/config.local.js` está en `.gitignore`, así que con *Deploy from a branch* **nunca llega a la página** y quedaría en modo demostración. Para publicar en modo nube:
1. *Settings → Secrets and variables → Actions → **Variables***: crea `SUPABASE_URL` y `SUPABASE_ANON_KEY` (la clave pública no necesita ser secreto).
2. *Settings → Pages → Source*: **GitHub Actions**.
3. *Actions → Publicar en Pages → Run workflow*. El flujo corre las pruebas, arma el sitio sin archivos de desarrollo y genera `config.local.js` **rechazando cualquier clave que no sea anon/publishable** (`scripts/generar-config-local.cjs`).

Para volver a la demostración, borra las dos variables y vuelve a ejecutar el flujo.

### Límites conocidos
- Los datos viven en la nube; **sin internet la app abre, pero no carga datos** (la demostración sí funciona sin conexión). Trabajo sin conexión con sincronización queda fuera de esta fase.
- Un solo supervisor por cuenta: `owner = auth.uid()` aísla cuentas, no hay roles ni compartir datos entre usuarios. Para varios supervisores sobre los mismos datos hay que cambiar el modelo de políticas.
- Si se borra (no archiva) un chofer, sus viajes y cargas se conservan con el chofer en blanco (`on delete set null`); su asistencia sí se borra (`cascade`). La app solo archiva; el borrado ocurre al importar un respaldo.
- La sesión se guarda en `localStorage` (como casi toda app sin servidor propio). La app no carga scripts de terceros y escapa el texto de usuario, pero **no se ha hecho una auditoría formal contra XSS** y un script inyectado podría leer la sesión: mantén las dependencias en cero y revísalo antes de usar datos reales.

### SQL completo (`supabase/001_tablas_y_seguridad.sql`)

```sql
-- Dilo group · Control de Transporte — tablas, seguridad (RLS) y almacenamiento de fotos.
-- Se ejecuta UNA vez en el SQL Editor de Supabase (o con `supabase db push`). Es idempotente donde se puede.
--
-- Modelo de seguridad:
--   * Cada fila lleva `owner` = el usuario que la creó (auth.uid()).
--   * RLS está ACTIVADO en todas las tablas y solo existen políticas para el rol `authenticated`
--     y solo sobre filas propias. El rol `anon` (la clave pública que va en la página) no puede leer ni escribir nada.
--   * Las fotos van en un bucket PRIVADO; cada usuario solo ve su carpeta (<uid>/<foto>) y se leen con URLs firmadas.
--   * IMPORTANTE (en el panel, no en SQL): Authentication → Sign In / Providers → desactiva "Allow new users to sign up",
--     y crea tú el usuario del supervisor en Authentication → Users → Add user.

-- ---------- Utilidades ----------
create or replace function public.fijar_actualizado() returns trigger
language plpgsql set search_path = public as $$
begin
  new.actualizado := now();
  return new;
end $$;

-- ---------- Tablas (orden por dependencias) ----------
create table if not exists public.vehiculos (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  placa text not null,
  descripcion text,
  estado text not null default 'disponible' check (estado in ('disponible', 'taller', 'fuera')),
  seguro_aseguradora text,
  seguro_poliza text,
  seguro_vence date,
  mantenimiento_fecha date,
  mantenimiento_km integer,
  notas text,
  archivado boolean not null default false,
  creado timestamptz not null default now(),
  actualizado timestamptz not null default now(),
  unique (owner, placa)
);

create table if not exists public.rutas (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nombre text not null,
  origen text,
  destino text,
  duracion_min integer not null check (duracion_min between 1 and 1440),
  horarios text[] not null default '{}',
  cliente text,
  km numeric,
  paradas text,
  tarifa numeric,
  notas text,
  archivado boolean not null default false,
  creado timestamptz not null default now(),
  actualizado timestamptz not null default now()
);

create table if not exists public.choferes (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nombre text not null,
  cedula text,
  telefono text,
  direccion text,
  licencia text,
  licencia_vence date,
  contacto_nombre text,
  contacto_telefono text,
  vehiculo_id uuid references public.vehiculos(id) on delete set null,
  fecha_ingreso date,
  notas text,
  foto_id uuid,
  archivado boolean not null default false,
  creado timestamptz not null default now(),
  actualizado timestamptz not null default now()
);

create table if not exists public.viajes (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  ruta_id uuid references public.rutas(id) on delete set null,
  chofer_id uuid references public.choferes(id) on delete set null,
  vehiculo_id uuid references public.vehiculos(id) on delete set null,
  salida_prog timestamptz not null,
  llegada_prog timestamptz not null,
  salida_real timestamptz,
  llegada_real timestamptz,
  motivo_retraso text,
  notas text,
  archivado boolean not null default false,
  creado timestamptz not null default now(),
  actualizado timestamptz not null default now()
);
create index if not exists viajes_owner_salida on public.viajes (owner, salida_prog);

create table if not exists public.combustible (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  fecha date not null,
  hora text check (hora is null or hora ~ '^[0-2][0-9]:[0-5][0-9]$'),
  vehiculo_id uuid references public.vehiculos(id) on delete set null,
  chofer_id uuid references public.choferes(id) on delete set null,
  cantidad numeric not null check (cantidad > 0),
  monto numeric not null check (monto > 0),
  tipo text,
  km integer,
  estacion text,
  tanque_lleno boolean not null default true,
  foto_id uuid,
  notas text,
  archivado boolean not null default false,
  creado timestamptz not null default now(),
  actualizado timestamptz not null default now()
);
create index if not exists combustible_owner_fecha on public.combustible (owner, fecha);

create table if not exists public.asistencia (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  chofer_id uuid references public.choferes(id) on delete cascade,
  fecha date not null,
  entrada timestamptz not null,
  salida timestamptz,
  archivado boolean not null default false,
  creado timestamptz not null default now(),
  actualizado timestamptz not null default now()
);
create index if not exists asistencia_owner_fecha on public.asistencia (owner, fecha);

-- ---------- Triggers de `actualizado` ----------
do $$
declare t text;
begin
  foreach t in array array['vehiculos', 'rutas', 'choferes', 'viajes', 'combustible', 'asistencia'] loop
    execute format('drop trigger if exists fijar_actualizado on public.%I', t);
    execute format('create trigger fijar_actualizado before update on public.%I for each row execute function public.fijar_actualizado()', t);
  end loop;
end $$;

-- ---------- Seguridad: RLS en TODAS las tablas ----------
do $$
declare t text;
begin
  foreach t in array array['vehiculos', 'rutas', 'choferes', 'viajes', 'combustible', 'asistencia'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('drop policy if exists "solo el dueño" on public.%I', t);
    -- (select auth.uid()) se evalúa una vez por consulta, no por fila.
    execute format($p$create policy "solo el dueño" on public.%I for all to authenticated
                      using (owner = (select auth.uid())) with check (owner = (select auth.uid()))$p$, t);
  end loop;
end $$;

-- ---------- Fotos: bucket PRIVADO, una carpeta por usuario ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = 2097152, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "fotos: solo el dueño" on storage.objects;
create policy "fotos: solo el dueño" on storage.objects for all to authenticated
  using (bucket_id = 'fotos' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'fotos' and (storage.foldername(name))[1] = (select auth.uid())::text);
```
