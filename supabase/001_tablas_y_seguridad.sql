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
