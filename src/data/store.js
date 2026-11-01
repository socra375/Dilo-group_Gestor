// Capa de datos. Interfaz única y ASÍNCRONA:
//   list(col, { archivados })  get(col, id)  create(col, datos)  update(col, id, cambios)  archive(col, id)  remove(col, id)
// Dos implementaciones detrás de la misma interfaz:
//   * IndexedDB (por defecto, modo demostración: los datos viven solo en este teléfono).
//   * Supabase (si existe src/config.local.js): Auth + tablas con RLS + fotos en un bucket privado (src/data/supabase.js).
// Los módulos de la app no saben cuál está activa. Ningún otro archivo toca IndexedDB ni Supabase.
import { crearCliente, ORDEN_TABLAS, esUuid } from './supabase.js';

export const COLECCIONES = ['choferes', 'rutas', 'vehiculos', 'viajes', 'combustible', 'asistencia'];
const FOTOS = 'fotos';
const BD = 'dilo-transporte';
const VERSION_BD = 2; // 2: la colección 'turnos' pasa a llamarse 'asistencia'

let conexion = null;
let nube = null; // cliente de Supabase cuando está configurado

function abrir() {
  if (!conexion) {
    conexion = new Promise((resolver, rechazar) => {
      if (!globalThis.indexedDB) return rechazar(new Error('Este navegador no permite guardar datos (IndexedDB no disponible).'));
      const pet = indexedDB.open(BD, VERSION_BD);
      pet.onupgradeneeded = (e) => {
        const db = pet.result;
        for (const nombre of [...COLECCIONES, FOTOS]) {
          if (!db.objectStoreNames.contains(nombre)) db.createObjectStore(nombre, { keyPath: 'id' });
        }
        // v1 → v2: lo que estaba en 'turnos' se copia a 'asistencia' dentro de esta misma transacción
        // (si algo falla, la actualización completa se deshace y no se pierde nada).
        if (e.oldVersion >= 1 && e.oldVersion < 2 && db.objectStoreNames.contains('turnos')) {
          const viejo = pet.transaction.objectStore('turnos');
          const nuevo = pet.transaction.objectStore('asistencia');
          viejo.getAll().onsuccess = (ev) => {
            for (const registro of ev.target.result) nuevo.put(registro);
            db.deleteObjectStore('turnos');
          };
        }
      };
      pet.onsuccess = () => {
        const db = pet.result;
        db.onversionchange = () => db.close(); // otra pestaña abre una versión nueva de la base
        resolver(db);
      };
      pet.onerror = () => rechazar(pet.error);
      pet.onblocked = () => rechazar(new Error('Cierra las otras pestañas de la app y vuelve a intentarlo.'));
    });
  }
  return conexion;
}

const esperar = (pet) => new Promise((ok, mal) => {
  pet.onsuccess = () => ok(pet.result);
  pet.onerror = () => mal(pet.error);
});

/** Ejecuta `fn(almacenes)` en una transacción y resuelve con su resultado cuando la transacción termina. */
async function transaccion(nombres, modo, fn) {
  const db = await abrir();
  return new Promise((resolver, rechazar) => {
    const t = db.transaction(nombres, modo);
    const almacenes = Object.fromEntries(nombres.map((n) => [n, t.objectStore(n)]));
    let resultado;
    Promise.resolve(fn(almacenes)).then((r) => { resultado = r; }, (e) => { rechazar(e); t.abort(); });
    t.oncomplete = () => resolver(resultado);
    t.onerror = () => rechazar(t.error?.name === 'QuotaExceededError'
      ? new Error('No hay espacio para guardar. Exporta un respaldo y borra fotos o datos antiguos.')
      : t.error);
    t.onabort = () => rechazar(t.error ?? new Error('No se pudo guardar.'));
  });
}

function verificar(col) {
  if (!COLECCIONES.includes(col)) throw new Error(`Colección desconocida: ${col}`);
}

function avisarCambio(col) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('datos', { detail: { col } }));
}

function nuevoId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// ---------- Interfaz principal ----------

/** @param {{ archivados?: boolean | 'todos' }} [opciones] false = solo activos (por defecto), true = solo archivados */
export async function list(col, { archivados = false } = {}) {
  verificar(col);
  if (nube) return nube.datos.list(col, { archivados });
  const items = await transaccion([col], 'readonly', (a) => esperar(a[col].getAll()));
  return archivados === 'todos' ? items : items.filter((i) => Boolean(i.archivado) === Boolean(archivados));
}

export async function get(col, id) {
  verificar(col);
  if (nube) return nube.datos.get(col, id);
  return (await transaccion([col], 'readonly', (a) => esperar(a[col].get(id)))) ?? null;
}

export async function create(col, datos) {
  verificar(col);
  const ahora = new Date().toISOString();
  const item = { archivado: false, ...datos, id: datos.id ?? nuevoId(), creado: ahora, actualizado: ahora };
  if (nube) {
    const creado = await nube.datos.create(col, item);
    avisarCambio(col);
    return creado;
  }
  await transaccion([col], 'readwrite', (a) => esperar(a[col].add(item)));
  avisarCambio(col);
  return item;
}

export async function update(col, id, cambios) {
  verificar(col);
  if (nube) {
    const actualizado = await nube.datos.update(col, id, cambios);
    avisarCambio(col);
    return actualizado;
  }
  const item = await transaccion([col], 'readwrite', async (a) => {
    const actual = await esperar(a[col].get(id));
    if (!actual) throw new Error('El registro ya no existe.');
    const nuevo = { ...actual, ...cambios, id, actualizado: new Date().toISOString() };
    a[col].put(nuevo);
    return nuevo;
  });
  avisarCambio(col);
  return item;
}

/** Borrado lógico: el registro se oculta de las listas pero se conserva (y se puede restaurar). */
export function archive(col, id, archivado = true) {
  return update(col, id, { archivado });
}

/** Borrado definitivo. Devuelve true si existía. */
export async function remove(col, id) {
  verificar(col);
  if (nube) {
    const existia = await nube.datos.remove(col, id);
    if (existia) avisarCambio(col);
    return existia;
  }
  const existia = await transaccion([col], 'readwrite', async (a) => {
    const actual = await esperar(a[col].get(id));
    if (actual) a[col].delete(id);
    return Boolean(actual);
  });
  if (existia) avisarCambio(col);
  return existia;
}

// ---------- Operaciones en bloque (datos de ejemplo, respaldo) ----------

export async function createMany(col, lista) {
  verificar(col);
  if (nube) {
    const ahora = new Date().toISOString();
    const n = await nube.datos.createMany(col, lista.map((d) => ({ archivado: false, ...d, id: d.id ?? nuevoId(), creado: d.creado ?? ahora, actualizado: ahora })));
    avisarCambio(col);
    return n;
  }
  const ahora = new Date().toISOString();
  await transaccion([col], 'readwrite', (a) => {
    for (const d of lista) a[col].put({ archivado: false, ...d, id: d.id ?? nuevoId(), creado: d.creado ?? ahora, actualizado: ahora });
  });
  avisarCambio(col);
  return lista.length;
}

export async function removeMany(col, ids) {
  verificar(col);
  if (nube) {
    const n = await nube.datos.removeMany(col, ids);
    if (n) avisarCambio(col);
    return n;
  }
  const n = await transaccion([col], 'readwrite', async (a) => {
    const existentes = new Set(await esperar(a[col].getAllKeys()));
    let borrados = 0;
    for (const id of ids) {
      if (existentes.has(id)) {
        a[col].delete(id);
        borrados++;
      }
    }
    return borrados;
  });
  if (n) avisarCambio(col);
  return n;
}

/** Copia completa de todas las colecciones (sin fotos; ver listarFotos). */
export async function exportAll() {
  if (nube) return Object.fromEntries(await Promise.all(COLECCIONES.map(async (c) => [c, await nube.datos.list(c, { archivados: 'todos' })])));
  return transaccion(COLECCIONES, 'readonly', async (a) => {
    const pares = await Promise.all(COLECCIONES.map(async (c) => [c, await esperar(a[c].getAll())]));
    return Object.fromEntries(pares);
  });
}

/** Reemplaza TODAS las colecciones (restaurar respaldo). Si trae `fotos`, también las reemplaza. */
export async function replaceAll(datos, fotos = null) {
  for (const c of COLECCIONES) {
    if (!Array.isArray(datos[c])) throw new Error(`El respaldo no tiene la lista "${c}".`);
  }
  if (nube) return reemplazarEnNube(datos, fotos);
  const nombres = fotos ? [...COLECCIONES, FOTOS] : COLECCIONES;
  await transaccion(nombres, 'readwrite', (a) => {
    for (const c of COLECCIONES) {
      a[c].clear();
      for (const item of datos[c]) a[c].put(item);
    }
    if (fotos) {
      a[FOTOS].clear();
      for (const f of fotos) a[FOTOS].put(f);
    }
  });
  for (const c of COLECCIONES) avisarCambio(c);
}

// ---------- Fotos (almacén aparte: las listas no cargan imágenes) ----------

/** Guarda una imagen (Blob) y devuelve su id. */
export async function guardarFoto(blob, id = nuevoId()) {
  if (nube) return nube.fotos.guardar(blob, id);
  await transaccion([FOTOS], 'readwrite', (a) => esperar(a[FOTOS].put({ id, blob, tipo: blob.type, creado: new Date().toISOString() })));
  return id;
}

export async function leerFoto(id) {
  if (!id) return null;
  if (nube) return nube.fotos.leer(id);
  const f = await transaccion([FOTOS], 'readonly', (a) => esperar(a[FOTOS].get(id)));
  return f?.blob ?? null;
}

export async function borrarFoto(id) {
  if (!id) return;
  if (nube) return nube.fotos.borrar(id);
  await transaccion([FOTOS], 'readwrite', (a) => esperar(a[FOTOS].delete(id)));
}

export async function listarFotos() {
  if (nube) return nube.fotos.listar();
  return transaccion([FOTOS], 'readonly', (a) => esperar(a[FOTOS].getAll()));
}

// ---------- Mantenimiento ----------

/**
 * La primera versión guardaba en localStorage (claves "ct:v1:<colección>"). Si quedan datos ahí y
 * IndexedDB está vacío, se copian una sola vez y se borran las claves viejas.
 */
export async function migrarDesdeLocalStorage() {
  if (nube || typeof localStorage === 'undefined') return 0;
  const LEGADO = { turnos: 'asistencia' }; // nombre viejo → nombre actual
  const claves = [...COLECCIONES.map((c) => [c, c]), ...Object.entries(LEGADO).map(([viejo, nuevo]) => [viejo, nuevo])];
  const viejas = claves.map(([clave, col]) => [col, localStorage.getItem(`ct:v1:${clave}`), clave]).filter(([, v]) => v);
  if (!viejas.length) return 0;
  const actuales = await exportAll();
  let copiados = 0;
  if (COLECCIONES.every((c) => !actuales[c].length)) {
    for (const [c, json] of viejas) {
      try {
        const items = JSON.parse(json);
        if (Array.isArray(items) && items.length) copiados += await createMany(c, items);
      } catch {
        // Datos dañados: se descartan.
      }
    }
  }
  for (const [, , clave] of viejas) localStorage.removeItem(`ct:v1:${clave}`);
  return copiados;
}

/** Pide al navegador no borrar los datos por falta de espacio o inactividad (Safari/Chrome). */
export async function pedirPersistencia() {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

// ---------- Supabase ----------

/**
 * Restaurar un respaldo en Supabase: valida primero (ids y referencias deben ser UUID: un respaldo de la
 * versión de demostración trae ids como "ej-chofer-1" y no se puede subir), luego vacía y vuelve a cargar
 * en orden de dependencias. Las fotos se suben a la carpeta del usuario (las que ya había no se borran).
 *
 * Vaciar y cargar no es una transacción (son varias peticiones). Para no dejar al supervisor sin datos si la base
 * rechaza algo a mitad de camino, antes de vaciar se guarda una copia en memoria y, si la carga falla, se restaura.
 */
async function reemplazarEnNube(datos, fotos) {
  const REFERENCIAS = ['rutaId', 'choferId', 'vehiculoId'];
  for (const col of ORDEN_TABLAS) {
    for (const x of datos[col]) {
      if (!esUuid(x.id) || [...REFERENCIAS, 'fotoId'].some((k) => x[k] && !esUuid(x[k]))) {
        throw new Error('Este respaldo es de la versión de demostración (sus identificadores no son válidos en la nube). No se importó nada.');
      }
    }
  }
  const vaciar = async () => {
    for (const col of [...ORDEN_TABLAS].reverse()) {
      const ids = (await nube.datos.list(col, { archivados: 'todos' })).map((x) => x.id);
      await nube.datos.removeMany(col, ids);
    }
  };
  const cargar = async (origen) => {
    // Una referencia a un registro que no está en el respaldo se deja vacía en vez de hacer fallar toda la carga.
    const presentes = new Set(Object.values(origen).flat().map((x) => x.id));
    for (const col of ORDEN_TABLAS) {
      const limpios = origen[col].map((x) => {
        const y = { ...x };
        for (const k of REFERENCIAS) if (y[k] && !presentes.has(y[k])) y[k] = null;
        return y;
      });
      await nube.datos.createMany(col, limpios);
    }
  };

  const copia = await exportAll();
  try {
    await vaciar();
    await cargar(datos);
  } catch (e) {
    try {
      await vaciar();
      await cargar(copia);
    } catch (e2) {
      for (const c of COLECCIONES) avisarCambio(c);
      throw new Error(`No se pudo importar (${e.message}) y tampoco se pudieron restaurar tus datos anteriores (${e2.message}). Importa tu último respaldo.`);
    }
    for (const c of COLECCIONES) avisarCambio(c);
    throw new Error(`No se pudo importar: ${e.message}. Tus datos anteriores se conservaron.`);
  }
  for (const f of fotos ?? []) await nube.fotos.guardar(f.blob, f.id);
  for (const c of COLECCIONES) avisarCambio(c);
}

/** Activa Supabase como almacén de datos. Los módulos siguen usando la misma interfaz. */
export function usarSupabase(config, opciones = {}) {
  // Si no se puede renovar la sesión, la app lo sabe (evento) y pide entrar de nuevo.
  nube = crearCliente(config, { alVencer: () => window.dispatchEvent(new CustomEvent('sesion-vencida')), ...opciones });
  return nube;
}

export const nubeActiva = () => Boolean(nube);
export const entrar = (email, password) => nube.entrar(email, password);
export const salir = () => nube.salir();
export const sesionActual = () => nube?.sesion() ?? null;
export const restaurarSesion = () => (nube ? nube.restaurar() : Promise.resolve(false));
