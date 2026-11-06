-- Prueba de aislamiento entre usuarios, contra el Postgres REAL del proyecto (RLS, permisos de anon y carpetas de fotos).
-- Pégala en el SQL Editor de Supabase. No deja nada: crea dos usuarios de prueba, comprueba y termina con una excepción
-- que deshace todo. El resultado aparece en el mensaje de error "RESULTADOS: …"; léelo contra lo esperado de cada frase.
-- Qué NO prueba: el servicio Auth ni la API HTTP (PostgREST/Storage); solo las políticas y permisos de la base.
do $$
declare
  u1 uuid := gen_random_uuid();
  u2 uuid := gen_random_uuid();
  r text := '';
  n int;
  ch1 uuid;
begin
  insert into auth.users (id, aud, role, email) values (u1, 'authenticated', 'authenticated', 'prueba1@dilo.invalid'), (u2, 'authenticated', 'authenticated', 'prueba2@dilo.invalid');

  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u1::text, true);
  set local role authenticated;
  insert into public.choferes (nombre, cedula) values ('Chofer de U1', '00112345678') returning id into ch1;
  insert into public.vehiculos (placa) values ('A111111');
  select count(*) into n from public.choferes; r := r || format('U1 ve sus choferes: %s (esperado 1); ', n);
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u2::text, true);
  set local role authenticated;
  select count(*) into n from public.choferes; r := r || format('U2 ve choferes: %s (esperado 0); ', n);
  update public.choferes set nombre = 'Robado' where id = ch1; get diagnostics n = row_count; r := r || format('U2 actualiza lo de U1: %s filas (esperado 0); ', n);
  delete from public.choferes where id = ch1; get diagnostics n = row_count; r := r || format('U2 borra lo de U1: %s filas (esperado 0); ', n);
  begin
    insert into public.choferes (owner, nombre) values (u1, 'Falso a nombre de U1');
    r := r || 'U2 inserta a nombre de U1: PERMITIDO (MAL); ';
  exception when others then r := r || 'U2 inserta a nombre de U1: rechazado (bien); ';
  end;
  begin
    insert into public.viajes (ruta_id, salida_prog, llegada_prog) values (null, now(), now());
    select count(*) into n from public.viajes; r := r || format('U2 crea su propio viaje y ve %s (esperado 1); ', n);
  exception when others then r := r || 'U2 propio viaje fallo: ' || sqlerrm || '; ';
  end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
  begin
    perform 1 from public.choferes;
    r := r || 'anon lee choferes: PERMITIDO (MAL); ';
  exception when others then r := r || 'anon lee choferes: rechazado (bien); ';
  end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u1::text, true);
  set local role authenticated;
  begin
    insert into storage.objects (bucket_id, name, owner, metadata) values ('fotos', u1::text || '/foto1', u1, '{}');
    r := r || 'U1 sube a su carpeta: permitido (bien); ';
  exception when others then r := r || 'U1 sube a su carpeta: ' || sqlerrm || ' (MAL); ';
  end;
  begin
    insert into storage.objects (bucket_id, name, owner, metadata) values ('fotos', u2::text || '/foto-ajena', u1, '{}');
    r := r || 'U1 sube a la carpeta de U2: PERMITIDO (MAL); ';
  exception when others then r := r || 'U1 sube a la carpeta de U2: rechazado (bien); ';
  end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u2::text, true);
  set local role authenticated;
  select count(*) into n from storage.objects where bucket_id = 'fotos'; r := r || format('U2 ve fotos de U1: %s (esperado 0); ', n);
  reset role;

  -- Endurecimiento (requiere haber ejecutado 002_endurecimiento.sql)
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u2::text, true);
  set local role authenticated;
  begin
    insert into public.viajes (chofer_id, salida_prog, llegada_prog) values (ch1, now(), now());
    r := r || 'U2 apunta su viaje al chofer de U1: PERMITIDO (MAL); ';
  exception when others then r := r || 'U2 apunta su viaje al chofer de U1: rechazado (bien); ';
  end;
  begin
    insert into public.choferes (nombre, notas) values ('Largo', repeat('x', 1001));
    r := r || 'notas de 1001 caracteres: PERMITIDO (MAL); ';
  exception when others then r := r || 'notas de 1001 caracteres: rechazado (bien); ';
  end;
  reset role;
  set local role anon;
  r := r || format('anon ejecuta rls_auto_enable: %s (esperado false); ', has_function_privilege('anon', 'public.rls_auto_enable()', 'execute'));
  reset role;

  raise exception 'RESULTADOS: %', r; -- deshace todo lo anterior
end $$;
