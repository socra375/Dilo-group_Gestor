-- Dilo group · Control de Transporte — endurecimiento (se ejecuta DESPUÉS de 001_tablas_y_seguridad.sql). Idempotente.
--
-- Qué añade (defensa en profundidad; RLS de 001 sigue siendo la barrera principal):
--   1. Las referencias entre tablas (chofer, vehículo, ruta) deben ser del MISMO dueño. Una clave foránea no mira el dueño,
--      así que sin esto un usuario podría apuntar su viaje a un chofer ajeno si conociera su UUID.
--   2. Tope de longitud en los textos libres (los formularios ya limitan; la base no debe fiarse del cliente).
--   3. La función de la plataforma rls_auto_enable() (disparador de eventos) deja de ser ejecutable por RPC desde la API.

-- ---------- 1. Referencias del mismo dueño ----------
-- Se ejecuta con los permisos de quien escribe (SECURITY INVOKER), por eso la consulta pasa por RLS y solo "ve" filas propias.
create or replace function public.verificar_referencias() returns trigger
language plpgsql set search_path = public as $$
declare
  par text;
  valor uuid;
  hay int;
begin
  foreach par in array tg_argv loop
    valor := (to_jsonb(new) ->> split_part(par, ':', 1))::uuid;
    if valor is null then continue; end if;
    execute format('select 1 from public.%I where id = $1', split_part(par, ':', 2)) into hay using valor;
    if hay is null then
      raise exception 'La referencia % no existe o no es tuya', split_part(par, ':', 1) using errcode = '23503';
    end if;
  end loop;
  return new;
end $$;

drop trigger if exists verificar_referencias on public.choferes;
create trigger verificar_referencias before insert or update on public.choferes
  for each row execute function public.verificar_referencias('vehiculo_id:vehiculos');

drop trigger if exists verificar_referencias on public.viajes;
create trigger verificar_referencias before insert or update on public.viajes
  for each row execute function public.verificar_referencias('ruta_id:rutas', 'chofer_id:choferes', 'vehiculo_id:vehiculos');

drop trigger if exists verificar_referencias on public.combustible;
create trigger verificar_referencias before insert or update on public.combustible
  for each row execute function public.verificar_referencias('vehiculo_id:vehiculos', 'chofer_id:choferes');

drop trigger if exists verificar_referencias on public.asistencia;
create trigger verificar_referencias before insert or update on public.asistencia
  for each row execute function public.verificar_referencias('chofer_id:choferes');

-- ---------- 2. Longitud máxima de los textos libres ----------
do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('vehiculos', 'placa', 20), ('vehiculos', 'descripcion', 200), ('vehiculos', 'seguro_aseguradora', 200),
      ('vehiculos', 'seguro_poliza', 100), ('vehiculos', 'notas', 1000),
      ('rutas', 'nombre', 200), ('rutas', 'origen', 200), ('rutas', 'destino', 200), ('rutas', 'cliente', 200),
      ('rutas', 'paradas', 1000), ('rutas', 'notas', 1000),
      ('choferes', 'nombre', 200), ('choferes', 'cedula', 30), ('choferes', 'telefono', 30), ('choferes', 'direccion', 300),
      ('choferes', 'licencia', 100), ('choferes', 'contacto_nombre', 200), ('choferes', 'contacto_telefono', 30), ('choferes', 'notas', 1000),
      ('viajes', 'motivo_retraso', 500), ('viajes', 'notas', 1000),
      ('combustible', 'tipo', 100), ('combustible', 'estacion', 200), ('combustible', 'notas', 1000)
    ) as t(tabla, columna, largo)
  loop
    execute format('alter table public.%I drop constraint if exists %I', r.tabla, 'largo_' || r.columna);
    execute format('alter table public.%I add constraint %I check (%I is null or char_length(%I) <= %s)', r.tabla, 'largo_' || r.columna, r.columna, r.columna, r.largo);
  end loop;
  alter table public.rutas drop constraint if exists largo_horarios;
  alter table public.rutas add constraint largo_horarios check (cardinality(horarios) <= 48);
end $$;

-- ---------- 3. Funciones de la plataforma no expuestas por la API ----------
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end $$;
