// Cliente de Supabase (src/data/supabase.js) contra un servidor FALSO (scripts/supabase-falso.cjs) que lee las tablas
// de supabase/001_tablas_y_seguridad.sql. Prueba el contrato cliente↔API y que el SQL y el cliente coincidan.
// NO prueba que el SQL corra en un Postgres real: eso solo se comprueba aplicándolo en un proyecto (ver README).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import falso from '../scripts/supabase-falso.cjs';
import { crearCliente, COLUMNAS, ORDEN_TABLAS, aFila, aRegistro, esUuid } from '../src/data/supabase.js';

const { crear, ESQUEMA, SQL } = falso;
const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const snake = (k) => k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const ANON = 'anon-publica-de-prueba';
const jpg = (n = 8) => new Blob([new Uint8Array(n).fill(7)], { type: 'image/jpeg' });

async function entorno(opciones = {}) {
  const servidor = await crear({ usuarios: { 'ana@dilo.test': 'clave-ana', 'luis@dilo.test': 'clave-luis' }, ...opciones });
  const nuevo = (extra = {}) => crearCliente({ url: servidor.url, anonKey: ANON }, extra);
  return { servidor, nuevo };
}
const conSesion = async (e, correo = 'ana@dilo.test', clave = 'clave-ana', extra) => {
  const c = e.nuevo(extra);
  await c.entrar(correo, clave);
  return c;
};

// ---------- SQL ↔ cliente ----------

test('SQL: cada colección de la app es una tabla y sus columnas existen en el SQL', () => {
  assert.deepEqual([...ORDEN_TABLAS].sort(), Object.keys(ESQUEMA).sort());
  for (const [col, campos] of Object.entries(COLUMNAS)) {
    const columnas = ESQUEMA[col].columnas;
    for (const c of [...campos, 'archivado', 'creado', 'actualizado']) {
      assert.ok(columnas[snake(c)], `${col}.${c} (${snake(c)}) no existe en el SQL`);
    }
  }
});

test('SQL: las columnas obligatorias sin valor por defecto están en el cliente (si no, crear fallaría)', () => {
  for (const [col, campos] of Object.entries(COLUMNAS)) {
    const mapa = new Set(campos.map(snake));
    for (const [nombre, d] of Object.entries(ESQUEMA[col].columnas)) {
      if (!d.nulo && !d.defecto && nombre !== 'id') assert.ok(mapa.has(nombre), `${col}.${nombre} es NOT NULL sin default y el cliente no lo envía`);
    }
  }
});

test('SQL: RLS activado y forzado en TODAS las tablas, sin permisos para anon, bucket privado con URLs firmadas', () => {
  const lista = SQL.match(/foreach t in array array\[([^\]]+)\] loop\s+execute format\('alter table public\.%I enable row level security'/);
  assert.ok(lista, 'no se encontró el bloque que activa RLS');
  const protegidas = [...lista[1].matchAll(/'(\w+)'/g)].map((m) => m[1]).sort();
  assert.deepEqual(protegidas, Object.keys(ESQUEMA).sort(), 'hay tablas sin RLS');
  assert.match(SQL, /force row level security/);
  assert.match(SQL, /revoke all on public\.%I from anon/);
  assert.doesNotMatch(SQL, /to anon|to public/i, 'ninguna política debe abrirse a anon ni a public');
  assert.match(SQL, /values \('fotos', 'fotos', false/, 'el bucket debe ser privado');
  assert.match(SQL, /\(storage\.foldername\(name\)\)\[1\] = \(select auth\.uid\(\)\)::text/);
});

test('seguridad: ningún archivo servido por la página usa la clave service_role ni trae una clave real', () => {
  const archivos = [];
  const recorrer = (d) => {
    for (const f of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, f.name);
      if (f.isDirectory()) recorrer(p);
      else if (/\.(js|html|css|webmanifest)$/.test(f.name)) archivos.push(p);
    }
  };
  recorrer(path.join(raiz, 'src'));
  for (const f of ['index.html', 'sw.js', 'config.example.js']) archivos.push(path.join(raiz, f));
  for (const f of archivos) {
    // Los comentarios pueden decir "nunca service_role"; lo que no puede haber es código que la use.
    const t = fs.readFileSync(f, 'utf8').split('\n').filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l)).join('\n');
    assert.doesNotMatch(t, /service_role/i, `${path.relative(raiz, f)} menciona service_role`);
    assert.doesNotMatch(t, /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\./, `${path.relative(raiz, f)} parece traer un JWT`);
    assert.doesNotMatch(t, /sb_secret_/, `${path.relative(raiz, f)} trae una clave secreta`);
  }
  assert.match(fs.readFileSync(path.join(raiz, '.gitignore'), 'utf8'), /src\/config\.local\.js/);
});

// ---------- Conversión ----------

test('aFila: camelCase → snake_case, "" → null, solo columnas conocidas', () => {
  const f = aFila('choferes', { id: 'x', nombre: 'Pedro', cedula: '', licenciaVence: '2027-01-01', vehiculoId: null, intruso: 1, owner: 'otro' });
  assert.deepEqual(f, { id: 'x', nombre: 'Pedro', cedula: null, licencia_vence: '2027-01-01', vehiculo_id: null });
});

test('aRegistro: snake_case → camelCase, sin owner, marcas de tiempo en ISO con Z', () => {
  const r = aRegistro('viajes', { id: 'a', owner: 'o', salida_prog: '2026-03-01T10:00:00+00:00', salida_real: null, creado: '2026-03-01T10:00:00.5+00:00', archivado: false });
  assert.equal(r.owner, undefined);
  assert.equal(r.salidaProg, '2026-03-01T10:00:00.000Z');
  assert.equal(r.salidaReal, null);
  assert.equal(r.creado, '2026-03-01T10:00:00.500Z');
});

test('esUuid distingue UUID de los ids antiguos de la demo', () => {
  assert.ok(esUuid(crypto.randomUUID()));
  assert.ok(!esUuid('veh_1a2b3c') && !esUuid('') && !esUuid(null));
});

test('clave sb_publishable_: va solo en apikey (no es un JWT) y el flujo completo funciona; la anon clásica sí va como Bearer sin sesión', async () => {
  const e = await entorno();
  try {
    const vistos = [];
    const espia = (...a) => { vistos.push(a[1]?.headers ?? {}); return fetch(...a); };
    const c = crearCliente({ url: e.servidor.url, anonKey: 'sb_publishable_abcdef123456' }, { fetchFn: espia });
    await c.entrar('ana@dilo.test', 'clave-ana');
    await c.datos.create('choferes', { nombre: 'X' });
    assert.equal(vistos[0].Authorization, undefined, 'el login con clave publishable no manda Authorization');
    assert.equal(vistos[0].apikey, 'sb_publishable_abcdef123456');
    assert.match(vistos.at(-1).Authorization, /^Bearer acc\./, 'con sesión va el token del usuario, nunca la clave');
    const jwtAnon = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.firma';
    const vistos2 = [];
    const c2 = crearCliente({ url: e.servidor.url, anonKey: jwtAnon }, { fetchFn: (...a) => { vistos2.push(a[1]?.headers ?? {}); return fetch(...a); } });
    await c2.entrar('ana@dilo.test', 'clave-ana').catch(() => {});
    assert.equal(vistos2[0].Authorization, `Bearer ${jwtAnon}`);
  } finally { await e.servidor.cerrar(); }
});

// ---------- Auth ----------

test('Auth: credenciales malas dan un mensaje en español; buenas guardan la sesión', async () => {
  const e = await entorno();
  try {
    const c = e.nuevo();
    await assert.rejects(() => c.entrar('ana@dilo.test', 'mala'), /Correo o contraseña incorrectos/);
    assert.equal(c.sesion(), null);
    const u = await c.entrar('ana@dilo.test', 'clave-ana');
    assert.equal(u.email, 'ana@dilo.test');
    assert.ok(esUuid(c.sesion().id));
  } finally { await e.servidor.cerrar(); }
});

test('Auth: sin sesión no se toca la red de datos', async () => {
  const e = await entorno();
  try {
    await assert.rejects(() => e.nuevo().datos.list('choferes'), /Inicia sesión/);
    assert.equal(e.servidor.estado.peticiones.filter((p) => p.ruta.startsWith('/rest/')).length, 0);
  } finally { await e.servidor.cerrar(); }
});

test('Auth: el token se renueva antes de vencer y el refresh token sirve una sola vez', async () => {
  const e = await entorno({ expiraEn: 3600 });
  try {
    let reloj = Date.now();
    const c = await conSesion(e, undefined, undefined, { ahora: () => reloj });
    await c.datos.list('choferes');
    const antes = e.servidor.estado.peticiones.filter((p) => p.ruta === '/auth/v1/token').length;
    reloj += 3600_000 - 30_000; // faltan 30 s: debe renovar
    await c.datos.list('choferes');
    const despues = e.servidor.estado.peticiones.filter((p) => p.ruta === '/auth/v1/token').length;
    assert.equal(despues, antes + 1);
    reloj += 3600_000 - 30_000;
    await c.datos.list('choferes');
    assert.equal(e.servidor.estado.peticiones.filter((p) => p.ruta === '/auth/v1/token').length, antes + 2);
  } finally { await e.servidor.cerrar(); }
});

test('Auth: si el servidor responde 401 se renueva y se reintenta una vez; si la renovación falla, avisa que venció', async () => {
  const e = await entorno();
  try {
    let vencio = 0;
    const c = await conSesion(e, undefined, undefined, { alVencer: () => vencio++ });
    e.servidor.estado.tokens.clear(); // el servidor "olvida" el token de acceso
    await c.datos.list('choferes'); // 401 → refresh → ok
    assert.equal(vencio, 0);
    e.servidor.estado.tokens.clear();
    e.servidor.estado.refrescos.clear(); // y también el refresh token
    await assert.rejects(() => c.datos.list('choferes'), /sesión terminó/i);
    assert.equal(vencio, 1);
    assert.equal(c.sesion(), null);
  } finally { await e.servidor.cerrar(); }
});

test('Auth: varias peticiones a la vez con el token vencido renuevan UNA sola vez (el refresh token sirve una vez)', async () => {
  const e = await entorno();
  try {
    let vencio = 0;
    const c = await conSesion(e, undefined, undefined, { alVencer: () => vencio++ });
    await c.datos.create('choferes', { nombre: 'A' });
    const antes = e.servidor.estado.peticiones.filter((p) => p.ruta === '/auth/v1/token').length;
    e.servidor.estado.tokens.clear(); // el servidor rechaza el token actual: todas las peticiones reciben 401 a la vez
    const resultados = await Promise.all([c.datos.list('choferes'), c.datos.list('choferes'), c.datos.list('vehiculos'), c.datos.list('rutas')]);
    assert.equal(resultados[0].length, 1);
    assert.equal(vencio, 0, 'no debe cerrar la sesión');
    assert.equal(e.servidor.estado.peticiones.filter((p) => p.ruta === '/auth/v1/token').length - antes, 1, 'una sola renovación');
  } finally { await e.servidor.cerrar(); }
});

test('Auth: salir invalida el token en el servidor', async () => {
  const e = await entorno();
  try {
    const c = await conSesion(e);
    const token = [...e.servidor.estado.tokens.keys()][0];
    await c.salir();
    assert.equal(c.sesion(), null);
    assert.ok(!e.servidor.estado.tokens.has(token));
    await assert.rejects(() => c.datos.list('choferes'), /Inicia sesión/);
  } finally { await e.servidor.cerrar(); }
});

// ---------- Datos ----------

test('Datos: crear, leer, actualizar, archivar y borrar un chofer', async () => {
  const e = await entorno();
  try {
    const c = await conSesion(e);
    const nuevo = await c.datos.create('choferes', { nombre: 'Pedro Pérez', cedula: '', telefono: '809-555-0101', licenciaVence: '2027-05-01' });
    assert.ok(esUuid(nuevo.id));
    assert.equal(nuevo.cedula, null);
    assert.equal(nuevo.archivado, false);
    assert.match(nuevo.creado, /Z$/);
    assert.equal((await c.datos.get('choferes', nuevo.id)).nombre, 'Pedro Pérez');
    assert.equal(await c.datos.get('choferes', 'id-viejo-de-la-demo'), null);
    const act = await c.datos.update('choferes', nuevo.id, { telefono: '809-555-0202' });
    assert.equal(act.telefono, '809-555-0202');
    await c.datos.update('choferes', nuevo.id, { archivado: true });
    assert.equal((await c.datos.list('choferes')).length, 0);
    assert.equal((await c.datos.list('choferes', { archivados: true })).length, 1);
    assert.equal((await c.datos.list('choferes', { archivados: 'todos' })).length, 1);
    assert.equal(await c.datos.remove('choferes', nuevo.id), true);
    assert.equal(await c.datos.remove('choferes', nuevo.id), false);
  } finally { await e.servidor.cerrar(); }
});

test('Datos: actualizar algo que ya no existe da un error claro', async () => {
  const e = await entorno();
  try {
    const c = await conSesion(e);
    await assert.rejects(() => c.datos.update('choferes', crypto.randomUUID(), { nombre: 'X' }), /ya no existe/);
  } finally { await e.servidor.cerrar(); }
});

test('Datos (RLS): cada usuario ve y toca solo lo suyo', async () => {
  const e = await entorno();
  try {
    const ana = await conSesion(e, 'ana@dilo.test', 'clave-ana');
    const luis = await conSesion(e, 'luis@dilo.test', 'clave-luis');
    const f = await ana.datos.create('choferes', { nombre: 'Chofer de Ana' });
    assert.equal((await luis.datos.list('choferes')).length, 0);
    assert.equal(await luis.datos.get('choferes', f.id), null);
    await assert.rejects(() => luis.datos.update('choferes', f.id, { nombre: 'Robado' }), /ya no existe/);
    assert.equal(await luis.datos.remove('choferes', f.id), false);
    assert.equal((await ana.datos.get('choferes', f.id)).nombre, 'Chofer de Ana');
  } finally { await e.servidor.cerrar(); }
});

test('Datos: el cliente no puede escribir filas a nombre de otro dueño', async () => {
  const e = await entorno();
  try {
    const ana = await conSesion(e);
    const f = await ana.datos.create('choferes', { nombre: 'A', owner: crypto.randomUUID() });
    assert.equal((await ana.datos.list('choferes')).length, 1, 'aFila descarta "owner": lo pone la base con auth.uid()');
    assert.ok(f.id);
  } finally { await e.servidor.cerrar(); }
});

test('Datos: las claves foráneas se respetan (viaje con chofer inexistente falla; al borrar el chofer queda en null)', async () => {
  const e = await entorno();
  try {
    const c = await conSesion(e);
    const ruta = await c.datos.create('rutas', { nombre: 'R1', duracionMin: 60, horarios: ['05:00'] });
    const base = { rutaId: ruta.id, salidaProg: '2026-03-02T09:00:00.000Z', llegadaProg: '2026-03-02T10:00:00.000Z' };
    await assert.rejects(() => c.datos.create('viajes', { ...base, choferId: crypto.randomUUID() }), /foreign key/);
    const ch = await c.datos.create('choferes', { nombre: 'Pedro' });
    const v = await c.datos.create('viajes', { ...base, choferId: ch.id });
    await c.datos.remove('choferes', ch.id);
    assert.equal((await c.datos.get('viajes', v.id)).choferId, null);
    assert.equal(v.salidaProg, base.salidaProg);
  } finally { await e.servidor.cerrar(); }
});

test('Datos: la placa es única por dueño y el error llega al usuario', async () => {
  const e = await entorno();
  try {
    const ana = await conSesion(e, 'ana@dilo.test', 'clave-ana');
    const luis = await conSesion(e, 'luis@dilo.test', 'clave-luis');
    await ana.datos.create('vehiculos', { placa: 'A123456' });
    await assert.rejects(() => ana.datos.create('vehiculos', { placa: 'A123456' }), /unique/);
    await luis.datos.create('vehiculos', { placa: 'A123456' }); // otro dueño: permitido
  } finally { await e.servidor.cerrar(); }
});

test('Datos: createMany/removeMany por lotes y paginación de más de 1000 filas (incluido el múltiplo exacto)', async () => {
  const e = await entorno();
  try {
    const c = await conSesion(e);
    const lote = (n) => Array.from({ length: n }, (_, i) => ({ id: crypto.randomUUID(), nombre: `Ruta ${i}`, duracionMin: 30, horarios: ['06:00'] }));
    const mil = lote(1000);
    assert.equal(await c.datos.createMany('rutas', mil), 1000);
    assert.equal((await c.datos.list('rutas')).length, 1000, 'múltiplo exacto de 1000: la página siguiente da 416 y no debe romper');
    await c.datos.createMany('rutas', lote(5));
    assert.equal((await c.datos.list('rutas')).length, 1005);
    assert.equal(await c.datos.removeMany('rutas', mil.slice(0, 250).map((r) => r.id)), 250);
    assert.equal((await c.datos.list('rutas')).length, 755);
  } finally { await e.servidor.cerrar(); }
});

test('Datos: valores inválidos los rechaza la base (y el mensaje llega)', async () => {
  const e = await entorno();
  try {
    const c = await conSesion(e);
    await assert.rejects(() => c.datos.create('combustible', { fecha: 'ayer', cantidad: 5, monto: 100 }), /date/);
    await assert.rejects(() => c.datos.create('rutas', { nombre: 'Sin duración' }), /not-null/);
  } finally { await e.servidor.cerrar(); }
});

// ---------- Fotos ----------

test('Fotos: se guardan en la carpeta del usuario y se leen con URL firmada; sin firma no se leen', async () => {
  const e = await entorno();
  try {
    const c = await conSesion(e);
    const id = crypto.randomUUID();
    await c.fotos.guardar(jpg(16), id);
    const blob = await c.fotos.leer(id);
    assert.equal(blob.size, 16);
    assert.equal(blob.type, 'image/jpeg');
    const uid = c.sesion().id;
    assert.ok(e.servidor.estado.objetos.has(`fotos/${uid}/${id}`));
    const directo = await fetch(`${e.servidor.url}/storage/v1/object/fotos/${uid}/${id}`, { headers: { apikey: ANON } });
    assert.notEqual(directo.status, 200, 'el bucket es privado: sin sesión ni firma no hay lectura');
    const sinFirma = await fetch(`${e.servidor.url}/storage/v1/object/sign/fotos/${uid}/${id}?token=inventado`, { headers: { apikey: ANON } });
    assert.equal(sinFirma.status, 400);
    assert.equal(await c.fotos.leer(crypto.randomUUID()), null);
    assert.equal(await c.fotos.leer(null), null);
  } finally { await e.servidor.cerrar(); }
});

test('Fotos: un usuario no puede firmar ni leer la foto de otro', async () => {
  const e = await entorno();
  try {
    const ana = await conSesion(e, 'ana@dilo.test', 'clave-ana');
    const luis = await conSesion(e, 'luis@dilo.test', 'clave-luis');
    const id = crypto.randomUUID();
    await ana.fotos.guardar(jpg(), id);
    assert.equal(await luis.fotos.leer(id), null, 'Luis busca en SU carpeta: la foto no existe ahí');
    assert.equal((await luis.fotos.listar()).length, 0);
    const robo = await fetch(`${e.servidor.url}/storage/v1/object/sign/fotos/${ana.sesion().id}/${id}`, {
      method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${[...e.servidor.estado.tokens.keys()].at(-1)}`, 'Content-Type': 'application/json' }, body: '{"expiresIn":300}',
    });
    assert.notEqual(robo.status, 200);
    const sube = await fetch(`${e.servidor.url}/storage/v1/object/fotos/${ana.sesion().id}/pirata`, {
      method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${[...e.servidor.estado.tokens.keys()].at(-1)}`, 'Content-Type': 'image/jpeg' }, body: jpg(),
    });
    assert.equal(sube.status, 403, 'tampoco puede escribir en la carpeta ajena');
  } finally { await e.servidor.cerrar(); }
});

test('Fotos: listar devuelve todas, borrar quita la foto, tipos no permitidos y archivos grandes se rechazan', async () => {
  const e = await entorno();
  try {
    const c = await conSesion(e);
    const [a, b] = [crypto.randomUUID(), crypto.randomUUID()];
    await c.fotos.guardar(jpg(4), a);
    await c.fotos.guardar(jpg(6), b);
    const lista = await c.fotos.listar();
    assert.deepEqual(lista.map((f) => f.id).sort(), [a, b].sort());
    assert.ok(lista.every((f) => f.blob.size > 0 && f.tipo === 'image/jpeg'));
    await c.fotos.borrar(a);
    assert.equal(await c.fotos.leer(a), null);
    await c.fotos.borrar(a); // borrar dos veces no es error
    await assert.rejects(() => c.fotos.guardar(new Blob(['<svg onload=alert(1)>'], { type: 'image/svg+xml' }), crypto.randomUUID()), /mime/i);
    await assert.rejects(() => c.fotos.guardar(jpg(2097153), crypto.randomUUID()), /exceeded|large/i);
    await c.fotos.guardar(jpg(9), b); // upsert: reemplazar la misma foto
    assert.equal((await c.fotos.leer(b)).size, 9);
  } finally { await e.servidor.cerrar(); }
});
