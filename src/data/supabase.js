// Cliente mínimo de Supabase (Auth + PostgREST + Storage) con fetch, sin librerías.
// Lo usa src/data/store.js cuando existe src/config.local.js. Los módulos de la app no lo conocen.
//
// Seguridad: aquí solo vive la clave pública "anon"; lo que protege los datos son las políticas RLS del servidor
// (supabase/001_tablas_y_seguridad.sql). Nunca pongas la clave "service_role" en ningún archivo de esta página.

const SESION = 'ct:sesion';
const PAGINA = 1000; // PostgREST devuelve como mucho 1000 filas por petición: se pide por páginas

// ---------- Nombres: la app usa camelCase, la base snake_case ----------
const aSnake = (k) => k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const aCamel = (k) => k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());

/** Columnas de cada colección en la app (camelCase). Deben ser un subconjunto de supabase/001_tablas_y_seguridad.sql. */
export const COLUMNAS = {
  vehiculos: ['placa', 'descripcion', 'estado', 'seguroAseguradora', 'seguroPoliza', 'seguroVence', 'mantenimientoFecha', 'mantenimientoKm', 'notas'],
  rutas: ['nombre', 'origen', 'destino', 'duracionMin', 'horarios', 'cliente', 'km', 'paradas', 'tarifa', 'notas'],
  choferes: ['nombre', 'cedula', 'telefono', 'direccion', 'licencia', 'licenciaVence', 'contactoNombre', 'contactoTelefono', 'vehiculoId', 'fechaIngreso', 'notas', 'fotoId'],
  viajes: ['rutaId', 'choferId', 'vehiculoId', 'salidaProg', 'llegadaProg', 'salidaReal', 'llegadaReal', 'motivoRetraso', 'notas'],
  combustible: ['fecha', 'hora', 'vehiculoId', 'choferId', 'cantidad', 'monto', 'tipo', 'km', 'estacion', 'tanqueLleno', 'fotoId', 'notas'],
  asistencia: ['choferId', 'fecha', 'entrada', 'salida'],
};
const COMUNES = ['archivado', 'creado', 'actualizado'];
const MARCAS = { vehiculos: [], rutas: [], choferes: [], viajes: ['salidaProg', 'llegadaProg', 'salidaReal', 'llegadaReal'], combustible: [], asistencia: ['entrada', 'salida'] };
export const ORDEN_TABLAS = ['vehiculos', 'rutas', 'choferes', 'viajes', 'combustible', 'asistencia']; // por dependencias

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const esUuid = (v) => typeof v === 'string' && UUID.test(v);

/** Registro de la app → fila de la base: solo columnas conocidas, en snake_case, '' → null. */
export function aFila(col, item) {
  const fila = {};
  for (const k of [...COLUMNAS[col], ...COMUNES, 'id']) {
    if (!(k in item)) continue;
    const v = item[k];
    fila[aSnake(k)] = v === '' || v === undefined ? null : v;
  }
  return fila;
}

/** Fila de la base → registro de la app: camelCase, y las marcas de tiempo siempre en ISO con "Z". */
export function aRegistro(col, fila) {
  const item = {};
  for (const [k, v] of Object.entries(fila)) {
    if (k === 'owner') continue;
    item[aCamel(k)] = v;
  }
  for (const k of [...MARCAS[col], 'creado', 'actualizado']) {
    if (item[k]) item[k] = new Date(item[k]).toISOString(); // la base devuelve "+00:00"; la app compara cadenas ISO con "Z"
  }
  return item;
}

// ---------- Sesión (Auth) ----------
const leerSesion = () => {
  try {
    return JSON.parse(localStorage.getItem(SESION) || 'null');
  } catch {
    return null;
  }
};

export function crearCliente({ url, anonKey, bucketFotos = 'fotos' }, { fetchFn = (...a) => fetch(...a), ahora = () => Date.now(), alVencer = () => {} } = {}) {
  const base = url.replace(/\/+$/, '');
  let sesion = leerSesion();

  // La clave anon clásica es un JWT y puede ir también en Authorization. La clave nueva "sb_publishable_…" NO es un JWT:
  // va solo en `apikey`; mandarla como Bearer haría que la API la rechace como "JWT inválido".
  const esJwt = (k) => /^eyJ[\w-]+\.[\w-]+\.[\w-]+$/.test(k);
  const cabeceras = (extra = {}, conSesion = true) => {
    const token = conSesion && sesion ? sesion.access_token : esJwt(anonKey) ? anonKey : null;
    return { apikey: anonKey, ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra };
  };

  const mensajeDe = async (r) => {
    let cuerpo = {};
    try {
      cuerpo = await r.clone().json();
    } catch {
      /* respuesta sin JSON */
    }
    return cuerpo.error_description || cuerpo.msg || cuerpo.message || cuerpo.error || `Error ${r.status}`;
  };

  const guardar = (s) => {
    sesion = s;
    try {
      if (s) localStorage.setItem(SESION, JSON.stringify(s));
      else localStorage.removeItem(SESION);
    } catch {
      /* sin almacenamiento: la sesión dura lo que dure la pestaña */
    }
  };
  const normalizar = (d) => ({
    access_token: d.access_token,
    refresh_token: d.refresh_token,
    expira: ahora() + (Number(d.expires_in) || 3600) * 1000,
    usuario: { id: d.user?.id, email: d.user?.email },
  });

  async function entrar(email, password) {
    const r = await fetchFn(`${base}/auth/v1/token?grant_type=password`, { method: 'POST', headers: cabeceras({ 'Content-Type': 'application/json' }, false), body: JSON.stringify({ email, password }) });
    if (!r.ok) {
      const m = await mensajeDe(r);
      throw new Error(/invalid.*credentials/i.test(m) ? 'Correo o contraseña incorrectos.' : m);
    }
    guardar(normalizar(await r.json()));
    return sesion.usuario;
  }

  // Varias peticiones pueden descubrir a la vez que el token venció (la lista y las fotos, por ejemplo). El refresh token
  // sirve una sola vez: si cada una renovara por su cuenta, la segunda fallaría y cerraría la sesión. Todas esperan la misma renovación.
  let renovando = null;
  function refrescar() {
    renovando ??= renovar().finally(() => { renovando = null; });
    return renovando;
  }
  async function renovar() {
    if (!sesion?.refresh_token) throw new Error('La sesión terminó.');
    const r = await fetchFn(`${base}/auth/v1/token?grant_type=refresh_token`, { method: 'POST', headers: cabeceras({ 'Content-Type': 'application/json' }, false), body: JSON.stringify({ refresh_token: sesion.refresh_token }) });
    if (!r.ok) {
      guardar(null);
      alVencer();
      throw new Error('La sesión terminó. Vuelve a entrar.');
    }
    guardar(normalizar(await r.json()));
  }

  async function salir() {
    const token = sesion?.access_token;
    guardar(null);
    if (token) await fetchFn(`${base}/auth/v1/logout`, { method: 'POST', headers: { apikey: anonKey, Authorization: `Bearer ${token}` } }).catch(() => {});
  }

  /** Petición autenticada: renueva el token si va a vencer y reintenta una vez si el servidor dice 401. */
  async function pedir(ruta, opciones = {}, reintento = true) {
    if (!sesion) throw new Error('Inicia sesión para continuar.');
    if (sesion.expira - ahora() < 60_000) await refrescar();
    const usado = sesion.access_token;
    const r = await fetchFn(`${base}${ruta}`, { ...opciones, headers: cabeceras(opciones.headers) });
    if (r.status === 401 && reintento) {
      // Si otra petición ya renovó mientras esta viajaba, basta reintentar con el token nuevo.
      if (sesion?.access_token === usado) await refrescar();
      return pedir(ruta, opciones, false);
    }
    return r;
  }

  const json = async (r) => {
    if (!r.ok) throw new Error(await mensajeDe(r));
    // 204 y 201 con "return=minimal" llegan sin cuerpo.
    const texto = await r.text();
    return texto ? JSON.parse(texto) : null;
  };

  const filtroIds = (ids) => `id=in.(${ids.join(',')})`;

  // ---------- Datos (PostgREST) ----------
  const tabla = (col) => {
    if (!COLUMNAS[col]) throw new Error(`Colección desconocida: ${col}`);
    return `/rest/v1/${col}`;
  };

  const datos = {
    async list(col, { archivados = false } = {}) {
      const filtro = archivados === 'todos' ? '' : `&archivado=eq.${Boolean(archivados)}`;
      const filas = [];
      for (let desde = 0; ; desde += PAGINA) {
        const r = await pedir(`${tabla(col)}?select=*${filtro}&order=creado.asc,id.asc`, { headers: { 'Range-Unit': 'items', Range: `${desde}-${desde + PAGINA - 1}` } });
        if (r.status === 416) break; // una página más allá del final (la tabla tenía justo un múltiplo de 1000 filas)
        const lote = await json(r);
        filas.push(...lote);
        if (lote.length < PAGINA) break;
      }
      return filas.map((f) => aRegistro(col, f));
    },
    async get(col, id) {
      if (!esUuid(id)) return null;
      const filas = await json(await pedir(`${tabla(col)}?select=*&id=eq.${id}`));
      return filas[0] ? aRegistro(col, filas[0]) : null;
    },
    async create(col, item) {
      const filas = await json(await pedir(tabla(col), { method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify(aFila(col, item)) }));
      return aRegistro(col, filas[0]);
    },
    async update(col, id, cambios) {
      if (!esUuid(id)) throw new Error('El registro ya no existe.');
      const filas = await json(await pedir(`${tabla(col)}?id=eq.${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify(aFila(col, { ...cambios, actualizado: new Date().toISOString() })) }));
      if (!filas.length) throw new Error('El registro ya no existe.');
      return aRegistro(col, filas[0]);
    },
    async remove(col, id) {
      if (!esUuid(id)) return false;
      const filas = await json(await pedir(`${tabla(col)}?id=eq.${id}`, { method: 'DELETE', headers: { Prefer: 'return=representation' } }));
      return filas.length > 0;
    },
    async createMany(col, lista) {
      for (let i = 0; i < lista.length; i += 200) {
        await json(await pedir(tabla(col), { method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(lista.slice(i, i + 200).map((x) => aFila(col, x))) }));
      }
      return lista.length;
    },
    async removeMany(col, ids) {
      ids = ids.filter(esUuid); // un id con símbolos podría colar otro filtro en la URL de PostgREST
      let n = 0;
      for (let i = 0; i < ids.length; i += 100) {
        const filas = await json(await pedir(`${tabla(col)}?${filtroIds(ids.slice(i, i + 100))}`, { method: 'DELETE', headers: { Prefer: 'return=representation' } }));
        n += filas.length;
      }
      return n;
    },
  };

  // ---------- Fotos (Storage privado, URLs firmadas) ----------
  const carpeta = () => sesion?.usuario?.id;
  const rutaFoto = (id) => {
    if (!esUuid(id)) throw new Error('Foto no válida.'); // evita rutas tipo ../ hacia otra carpeta de Storage
    return `${carpeta()}/${id}`;
  };

  const fotos = {
    async guardar(blob, id) {
      const r = await pedir(`/storage/v1/object/${bucketFotos}/${rutaFoto(id)}`, { method: 'POST', headers: { 'Content-Type': blob.type || 'image/jpeg', 'x-upsert': 'true' }, body: blob });
      if (!r.ok) throw new Error(await mensajeDe(r));
      return id;
    },
    /** Crea una URL firmada de corta vida y descarga la imagen. null si no existe. */
    async leer(id) {
      if (!esUuid(id)) return null;
      const f = await pedir(`/storage/v1/object/sign/${bucketFotos}/${rutaFoto(id)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresIn: 300 }) });
      if (f.status === 400 || f.status === 404) return null;
      const { signedURL } = await json(f);
      const r = await fetchFn(`${base}/storage/v1${signedURL}`);
      return r.ok ? r.blob() : null;
    },
    async borrar(id) {
      if (!esUuid(id)) return;
      const r = await pedir(`/storage/v1/object/${bucketFotos}/${rutaFoto(id)}`, { method: 'DELETE' });
      if (!r.ok && r.status !== 404) throw new Error(await mensajeDe(r));
    },
    async listar() {
      const r = await pedir(`/storage/v1/object/list/${bucketFotos}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prefix: carpeta(), limit: 10000 }) });
      const objetos = await json(r);
      const salida = [];
      for (const o of objetos) {
        const blob = await fotos.leer(o.name);
        if (blob) salida.push({ id: o.name, blob, tipo: blob.type, creado: o.created_at || null });
      }
      return salida;
    },
  };

  return {
    entrar,
    salir,
    sesion: () => (sesion ? { ...sesion.usuario } : null),
    hayRefresco: () => Boolean(sesion?.refresh_token),
    /** Intenta recuperar la sesión guardada (renovándola si ya venció). true si hay sesión válida. */
    async restaurar() {
      if (!sesion) return false;
      try {
        if (sesion.expira - ahora() < 60_000) await refrescar();
        return true;
      } catch {
        return false;
      }
    },
    datos,
    fotos,
  };
}
