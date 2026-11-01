// Servidor FALSO de Supabase para probar el cliente (src/data/supabase.js) sin un proyecto real.
// Imita lo mínimo de Auth (GoTrue), PostgREST y Storage. Sus tablas salen de supabase/001_tablas_y_seguridad.sql:
// columnas, tipos, NOT NULL, valores por defecto y claves foráneas se leen de ese archivo, así que si el cliente
// manda una columna que el SQL no tiene (o crea un viaje antes que su chofer), esta prueba falla.
//
// LÍMITE HONESTO: simula las reglas de RLS (cada usuario ve solo sus filas), pero NO ejecuta las políticas reales de
// Postgres. Demuestra que el cliente habla bien con una API que se comporta como Supabase; no demuestra que el SQL
// corra tal cual en un proyecto real. Eso solo se verifica aplicándolo en uno (ver README, fase 8).
//
// Uso:  const { crear } = require('./supabase-falso.cjs');  const s = await crear({ usuarios: {...} });  s.url  s.cerrar()
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SQL = fs.readFileSync(path.resolve(__dirname, '../supabase/001_tablas_y_seguridad.sql'), 'utf8');

/** Lee las tablas del SQL: { nombre: { columnas: { col: { tipo, nulo, defecto, ref } } } } */
function leerEsquema(sql) {
  const tablas = {};
  const re = /create table if not exists public\.(\w+) \(([\s\S]*?)\n\);/g;
  let m;
  while ((m = re.exec(sql))) {
    const columnas = {};
    for (const linea of m[2].split('\n')) {
      const c = linea.match(/^\s{2}([a-z_]+)\s+(uuid|text\[\]|text|date|timestamptz|integer|numeric|boolean)(?=[\s,]|$)(.*)$/);
      if (!c) continue;
      const resto = c[3];
      columnas[c[1]] = {
        tipo: c[2],
        nulo: !/not null|primary key/.test(resto),
        defecto: /default/.test(resto),
        ref: (resto.match(/references public\.(\w+)\(id\)/) || [])[1] || null,
        borrado: (resto.match(/on delete (set null|cascade)/) || [])[1] || null,
      };
    }
    tablas[m[1]] = { columnas };
  }
  return tablas;
}

const ESQUEMA = leerEsquema(SQL);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const uuid = () => crypto.randomUUID();

function validarTipo(col, def, v) {
  if (v === null) return def.nulo ? null : `null value in column "${col}" violates not-null constraint`;
  const mal = (t) => `invalid input syntax for type ${t}: "${v}"`;
  switch (def.tipo) {
    case 'uuid': return typeof v === 'string' && UUID.test(v) ? null : mal('uuid');
    case 'date': return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? null : mal('date');
    case 'timestamptz': return typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? null : mal('timestamp with time zone');
    case 'integer': return Number.isInteger(v) ? null : mal('integer');
    case 'numeric': return typeof v === 'number' ? null : mal('numeric');
    case 'boolean': return typeof v === 'boolean' ? null : mal('boolean');
    case 'text[]': return Array.isArray(v) && v.every((x) => typeof x === 'string') ? null : mal('text[]');
    default: return typeof v === 'string' ? null : mal('text');
  }
}

async function crear({ usuarios = {}, expiraEn = 3600, puerto = 0 } = {}) {
  const estado = {
    usuarios: Object.fromEntries(Object.entries(usuarios).map(([email, password]) => [email, { id: uuid(), email, password }])),
    tokens: new Map(), // access_token → { sub, exp }
    refrescos: new Map(), // refresh_token → sub
    tablas: Object.fromEntries(Object.keys(ESQUEMA).map((t) => [t, []])),
    objetos: new Map(), // "<bucket>/<ruta>" → { blob: Buffer, tipo, creado }
    firmas: new Map(), // token firmado → "<bucket>/<ruta>"
    peticiones: [], // para las pruebas: { metodo, ruta }
    expiraEn,
  };

  const emitirSesion = (u) => {
    const access = `acc.${crypto.randomBytes(12).toString('hex')}`;
    const refresh = `ref.${crypto.randomBytes(12).toString('hex')}`;
    estado.tokens.set(access, { sub: u.id, exp: Date.now() + estado.expiraEn * 1000 });
    estado.refrescos.set(refresh, u.id);
    return { access_token: access, refresh_token: refresh, expires_in: estado.expiraEn, token_type: 'bearer', user: { id: u.id, email: u.email } };
  };

  const usuarioDe = (req) => {
    const t = estado.tokens.get((req.headers.authorization || '').replace(/^Bearer /, ''));
    return t && t.exp > Date.now() ? t.sub : null;
  };

  const cuerpo = (req) => new Promise((ok) => { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => ok(Buffer.concat(c))); });
  const enviar = (res, codigo, datos, cabeceras = {}) => {
    const buf = Buffer.isBuffer(datos) ? datos : Buffer.from(datos === undefined ? '' : JSON.stringify(datos));
    res.writeHead(codigo, { 'Content-Type': Buffer.isBuffer(datos) ? (cabeceras['Content-Type'] || 'application/octet-stream') : 'application/json', 'Content-Length': buf.length, ...cabeceras });
    res.end(buf);
  };

  // ---------- PostgREST ----------
  function filtrar(filas, params) {
    for (const [k, v] of params) {
      if (['select', 'order', 'limit', 'offset'].includes(k)) continue;
      const [op, ...resto] = v.split('.');
      const valor = resto.join('.');
      if (op === 'eq') filas = filas.filter((f) => String(f[k]) === valor);
      else if (op === 'in') filas = filas.filter((f) => valor.replace(/^\(|\)$/g, '').split(',').includes(String(f[k])));
      else throw Object.assign(new Error(`operador no soportado por el servidor falso: ${op}`), { codigo: 400 });
    }
    return filas;
  }

  function normalizarFila(tabla, fila, sub) {
    const def = ESQUEMA[tabla].columnas;
    const salida = {};
    for (const k of Object.keys(fila)) {
      if (!def[k]) throw Object.assign(new Error(`Could not find the '${k}' column of '${tabla}' in the schema cache`), { codigo: 400, pgrst: 'PGRST204' });
    }
    for (const [col, d] of Object.entries(def)) {
      let v = fila[col];
      if (v === undefined) {
        if (col === 'id') v = uuid();
        else if (col === 'owner') v = sub;
        else if (d.defecto) v = d.tipo === 'boolean' ? (col === 'archivado' ? false : true) : d.tipo === 'timestamptz' ? new Date().toISOString().replace('Z', '+00:00') : d.tipo === 'text[]' ? [] : col === 'estado' ? 'disponible' : null;
        else v = null;
      }
      const err = validarTipo(col, d, v);
      if (err) throw Object.assign(new Error(err), { codigo: 400 });
      salida[col] = v;
    }
    if (salida.owner !== sub) throw Object.assign(new Error('new row violates row-level security policy for table "' + tabla + '"'), { codigo: 403 });
    // Claves foráneas: la fila referenciada debe existir (y ser del mismo usuario, por RLS).
    for (const [col, d] of Object.entries(def)) {
      if (d.ref && salida[col] !== null && !estado.tablas[d.ref].some((f) => f.id === salida[col] && f.owner === sub)) {
        throw Object.assign(new Error(`insert or update on table "${tabla}" violates foreign key constraint on "${col}"`), { codigo: 409 });
      }
    }
    // Restricciones de unicidad del SQL de ejemplo: (owner, placa).
    if (tabla === 'vehiculos' && estado.tablas.vehiculos.some((f) => f.owner === sub && f.placa === salida.placa && f.id !== salida.id)) {
      throw Object.assign(new Error('duplicate key value violates unique constraint "vehiculos_owner_placa_key"'), { codigo: 409 });
    }
    return salida;
  }

  function borrarEnCascada(tabla, id) {
    estado.tablas[tabla] = estado.tablas[tabla].filter((f) => f.id !== id);
    for (const [t, esq] of Object.entries(ESQUEMA)) {
      for (const [col, d] of Object.entries(esq.columnas)) {
        if (d.ref !== tabla) continue;
        if (d.borrado === 'cascade') estado.tablas[t].filter((f) => f[col] === id).forEach((f) => borrarEnCascada(t, f.id));
        else if (d.borrado === 'set null') estado.tablas[t].forEach((f) => { if (f[col] === id) f[col] = null; });
      }
    }
  }

  async function rest(req, res, url, sub) {
    const tabla = url.pathname.replace('/rest/v1/', '');
    if (!ESQUEMA[tabla]) return enviar(res, 404, { code: '42P01', message: `relation "public.${tabla}" does not exist` });
    const propias = () => estado.tablas[tabla].filter((f) => f.owner === sub); // RLS simulada
    const quiere = (req.headers.prefer || '').includes('return=representation');
    try {
      if (req.method === 'GET') {
        let filas = filtrar(propias(), url.searchParams);
        const orden = (url.searchParams.get('order') || '').split(',').filter(Boolean).map((o) => o.split('.'));
        filas = [...filas].sort((a, b) => { for (const [c, d] of orden) { const x = a[c], y = b[c]; if (x !== y) return (x > y ? 1 : -1) * (d === 'desc' ? -1 : 1); } return 0; });
        const total = filas.length;
        const rango = (req.headers.range || '').match(/^(\d+)-(\d+)$/);
        if (rango) {
          const [desde, hasta] = [Number(rango[1]), Number(rango[2])];
          if (desde > 0 && desde >= total) return enviar(res, 416, { code: 'PGRST103', message: 'Requested range not satisfiable' });
          const pagina = filas.slice(desde, Math.min(hasta + 1, desde + 1000));
          return enviar(res, 206, pagina, { 'Content-Range': `${desde}-${desde + Math.max(pagina.length - 1, 0)}/*` });
        }
        return enviar(res, 200, filas.slice(0, 1000));
      }
      const cuerpoJson = JSON.parse((await cuerpo(req)).toString() || 'null');
      if (req.method === 'POST') {
        const lista = Array.isArray(cuerpoJson) ? cuerpoJson : [cuerpoJson];
        const nuevas = [];
        for (const f of lista) {
          if (f.id && estado.tablas[tabla].some((x) => x.id === f.id)) throw Object.assign(new Error('duplicate key value violates unique constraint "' + tabla + '_pkey"'), { codigo: 409 });
          const fila = normalizarFila(tabla, f, sub);
          estado.tablas[tabla].push(fila);
          nuevas.push(fila);
        }
        return quiere ? enviar(res, 201, nuevas) : enviar(res, 201, undefined);
      }
      if (req.method === 'PATCH') {
        const objetivo = filtrar(propias(), url.searchParams);
        for (const f of objetivo) {
          const nueva = normalizarFila(tabla, { ...f, ...cuerpoJson, id: f.id }, sub);
          Object.assign(f, nueva);
        }
        return quiere ? enviar(res, 200, objetivo) : enviar(res, 204, undefined);
      }
      if (req.method === 'DELETE') {
        const objetivo = filtrar(propias(), url.searchParams);
        objetivo.forEach((f) => borrarEnCascada(tabla, f.id));
        return quiere ? enviar(res, 200, objetivo) : enviar(res, 204, undefined);
      }
      return enviar(res, 405, { message: 'método no permitido' });
    } catch (e) {
      return enviar(res, e.codigo || 500, { code: e.pgrst || String(e.codigo || 500), message: e.message });
    }
  }

  // ---------- Storage ----------
  async function almacen(req, res, url, sub) {
    const partes = url.pathname.replace('/storage/v1/', '').split('/'); // object/<bucket>/<uid>/<foto>  |  object/sign/<bucket>/...  |  object/list/<bucket>
    const [, a, b, ...resto] = partes;
    const esFirma = a === 'sign';
    const esLista = a === 'list';
    const bucket = esFirma || esLista ? b : a;
    const ruta = esFirma ? resto.join('/') : esLista ? '' : [b, ...resto].join('/');
    if (bucket !== 'fotos') return enviar(res, 404, { statusCode: '404', error: 'Bucket not found', message: 'Bucket not found' });
    const clave = `${bucket}/${ruta}`;
    // GET con firma: no lleva sesión, lleva el token firmado (así se leen las fotos privadas).
    if (req.method === 'GET' && esFirma) {
      const token = url.searchParams.get('token');
      const objeto = estado.firmas.get(token) === clave && estado.objetos.get(clave);
      return objeto ? enviar(res, 200, objeto.blob, { 'Content-Type': objeto.tipo }) : enviar(res, 400, { statusCode: '400', error: 'InvalidJWT', message: 'invalid signature' });
    }
    if (!sub) return enviar(res, 401, { statusCode: '401', error: 'Unauthorized', message: 'invalid JWT' });
    const propia = (r) => r.split('/')[0] === sub; // política: carpeta = uid
    if (esLista) {
      const { prefix } = JSON.parse((await cuerpo(req)).toString());
      if (prefix !== sub) return enviar(res, 200, []);
      const lista = [...estado.objetos.entries()].filter(([k]) => k.startsWith(`fotos/${sub}/`)).map(([k, o]) => ({ name: k.slice(`fotos/${sub}/`.length), created_at: o.creado }));
      return enviar(res, 200, lista);
    }
    if (esFirma && req.method === 'POST') {
      if (!propia(ruta)) return enviar(res, 400, { statusCode: '404', error: 'not_found', message: 'Object not found' });
      if (!estado.objetos.has(clave)) return enviar(res, 400, { statusCode: '404', error: 'not_found', message: 'Object not found' });
      const token = crypto.randomBytes(8).toString('hex');
      estado.firmas.set(token, clave);
      return enviar(res, 200, { signedURL: `/object/sign/${clave}?token=${token}` });
    }
    if (req.method === 'POST') {
      if (!propia(ruta)) return enviar(res, 403, { statusCode: '403', error: 'Unauthorized', message: 'new row violates row-level security policy' });
      const datos = await cuerpo(req);
      const tipo = req.headers['content-type'] || '';
      if (!/^image\/(jpeg|png|webp)/.test(tipo)) return enviar(res, 415, { statusCode: '415', error: 'invalid_mime_type', message: 'mime type not supported' });
      if (datos.length > 2097152) return enviar(res, 413, { statusCode: '413', error: 'Payload too large', message: 'The object exceeded the maximum allowed size' });
      if (estado.objetos.has(clave) && req.headers['x-upsert'] !== 'true') return enviar(res, 400, { statusCode: '409', error: 'Duplicate', message: 'The resource already exists' });
      estado.objetos.set(clave, { blob: datos, tipo, creado: new Date().toISOString() });
      return enviar(res, 200, { Key: clave });
    }
    if (req.method === 'DELETE') {
      if (!propia(ruta)) return enviar(res, 403, { statusCode: '403', error: 'Unauthorized', message: 'new row violates row-level security policy' });
      estado.objetos.delete(clave);
      return enviar(res, 200, { message: 'Successfully deleted' });
    }
    return enviar(res, 405, { message: 'método no permitido' });
  }

  // ---------- Auth ----------
  async function auth(req, res, url) {
    const cuerpoJson = JSON.parse((await cuerpo(req)).toString() || '{}');
    const tipo = url.searchParams.get('grant_type');
    if (url.pathname === '/auth/v1/token' && tipo === 'password') {
      const u = estado.usuarios[cuerpoJson.email];
      if (!u || u.password !== cuerpoJson.password) return enviar(res, 400, { error: 'invalid_grant', error_description: 'Invalid login credentials' });
      return enviar(res, 200, emitirSesion(u));
    }
    if (url.pathname === '/auth/v1/token' && tipo === 'refresh_token') {
      const sub = estado.refrescos.get(cuerpoJson.refresh_token);
      const u = Object.values(estado.usuarios).find((x) => x.id === sub);
      if (!u) return enviar(res, 400, { error: 'invalid_grant', error_description: 'Invalid Refresh Token: Refresh Token Not Found' });
      estado.refrescos.delete(cuerpoJson.refresh_token); // un refresh token sirve una sola vez
      return enviar(res, 200, emitirSesion(u));
    }
    if (url.pathname === '/auth/v1/logout') {
      estado.tokens.delete((req.headers.authorization || '').replace(/^Bearer /, ''));
      return enviar(res, 204, undefined);
    }
    return enviar(res, 404, { message: 'no encontrado' });
  }

  const servidor = http.createServer(async (req, res) => {
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'Access-Control-Expose-Headers': 'Content-Range' };
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
    const origenEnviar = res.writeHead.bind(res);
    res.writeHead = (c, h = {}) => origenEnviar(c, { ...cors, ...h });
    const url = new URL(req.url, 'http://x');
    estado.peticiones.push({ metodo: req.method, ruta: url.pathname });
    if (!req.headers.apikey && !url.searchParams.get('token')) return enviar(res, 401, { message: 'No API key found in request' });
    if (url.pathname.startsWith('/auth/v1/')) return auth(req, res, url);
    const sub = usuarioDe(req);
    if (url.pathname.startsWith('/rest/v1/')) {
      if (!sub) return enviar(res, 401, { code: 'PGRST301', message: 'JWT expired' });
      return rest(req, res, url, sub);
    }
    if (url.pathname.startsWith('/storage/v1/')) return almacen(req, res, url, sub);
    return enviar(res, 404, { message: 'no encontrado' });
  });

  await new Promise((ok) => servidor.listen(puerto, '127.0.0.1', ok));
  return {
    url: `http://127.0.0.1:${servidor.address().port}`,
    estado,
    esquema: ESQUEMA,
    cerrar: () => new Promise((ok) => servidor.close(ok)),
  };
}

module.exports = { crear, ESQUEMA, SQL };
