// Enrutador por hash (#/viajes?fecha=…): funciona en GitHub Pages sin configurar el servidor.
// Cada módulo exporta por defecto { titulo, pestana, render(el, params) }; render puede devolver una función de limpieza.
import { CONFIG } from '../config.js';
import { EXTENSIONES } from './esquemas.js';
import { reduceMotion, esc } from './ui.js';
import { escalonarHijos } from './movimiento.js';

const RUTAS = {
  inicio: () => import('../modules/inicio.js'),
  viajes: () => import('../modules/viajes.js'),
  choferes: () => import('../modules/choferes.js'),
  combustible: () => import('../modules/combustible.js'),
  'reporte-combustible': () => import('../modules/reporteCombustible.js'),
  mas: () => import('../modules/mas.js'),
  rutas: () => import('../modules/rutas.js'),
  vehiculos: () => import('../modules/vehiculos.js'),
  reportes: () => import('../modules/reportes.js'),
  ajustes: () => import('../modules/ajustes.js'),
};
// Módulo opcional: con CONFIG.modulos.asistencia en false, la pantalla y su acceso desaparecen.
if (CONFIG.modulos.asistencia) RUTAS.asistencia = () => import('../modules/asistencia.js');

// Extensiones activas en CONFIG.modulos (sueldos, mapa…): src/modules/extensiones/<carpeta>/index.js
for (const ext of EXTENSIONES) {
  if (ext.activo) RUTAS[ext.carpeta] = () => import(`../modules/extensiones/${ext.carpeta}/index.js`);
}

let limpiar = null;
let turno = 0;

export function leerHash() {
  const [ruta, query = ''] = location.hash.replace(/^#\/?/, '').split('?');
  return { ruta: ruta || 'inicio', params: Object.fromEntries(new URLSearchParams(query)) };
}

export function ir(ruta, params = {}) {
  const q = new URLSearchParams(params).toString();
  location.hash = `#/${ruta}${q ? `?${q}` : ''}`;
}

/** Vuelve a pintar la pantalla actual (tras guardar datos). */
export function refrescar() {
  return mostrar(false);
}

async function mostrar(animar = true) {
  const { ruta, params } = leerHash();
  const cargar = RUTAS[ruta] ?? RUTAS.inicio;
  const yo = ++turno;
  let modulo;
  try {
    modulo = (await cargar()).default;
  } catch (e) {
    console.error(e);
    modulo = { titulo: 'Error', pestana: 'inicio', render: (el) => (el.innerHTML = '<p>No se pudo abrir esta pantalla.</p>') };
  }
  if (yo !== turno) return; // el usuario ya navegó a otra pantalla

  limpiar?.();
  limpiar = null;
  // Una hoja o modal abierto no debe quedar encima de la pantalla nueva.
  for (const d of document.querySelectorAll('dialog')) {
    d.close();
    d.remove();
  }
  const vista = document.getElementById('view');
  const nueva = document.createElement('div');
  nueva.className = 'view';
  vista.replaceChildren(nueva);

  document.getElementById('header-title').textContent = modulo.titulo;
  // Línea pequeña sobre el título: la empresa, o lo que el módulo pida (Inicio muestra la fecha de hoy).
  document.getElementById('header-company').textContent = modulo.supratitulo?.() ?? CONFIG.empresa.nombre;
  document.title = modulo.titulo === CONFIG.empresa.nombre ? modulo.titulo : `${modulo.titulo} · ${CONFIG.empresa.nombre}`;
  for (const a of document.querySelectorAll('.tabbar a')) {
    if (a.dataset.tab === (modulo.pestana ?? ruta)) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }

  let r;
  try {
    r = await modulo.render(nueva, params);
  } catch (e) {
    // Con Supabase una pantalla puede fallar por falta de red o por sesión vencida. Nunca queda en blanco ni con un error sin atrapar.
    if (yo !== turno) return;
    if (document.body.classList.contains('sin-sesion')) return; // la sesión venció: la pantalla de entrar ya está puesta y repintará al entrar
    console.error(e);
    nueva.innerHTML = `<div class="alert alert--error" role="alert"><span class="alert__body"><span class="alert__title">No se pudo cargar esta pantalla</span><span class="alert__text">${esc(e?.message || 'Error desconocido.')} Revisa la conexión e inténtalo de nuevo.</span></span></div>
      <button type="button" class="btn btn--secondary" data-reintentar>Reintentar</button>`;
    nueva.querySelector('[data-reintentar]').addEventListener('click', () => mostrar(false));
    return;
  }
  if (yo !== turno) return;
  if (typeof r === 'function') limpiar = r;
  if (animar && !reduceMotion()) {
    nueva.classList.add('view--enter');
    escalonarHijos(nueva);
  }
  if (animar) {
    window.scrollTo(0, 0);
    document.getElementById('main').focus({ preventScroll: true });
  }
}

export function iniciarRouter() {
  window.addEventListener('hashchange', () => mostrar(true));
  return mostrar(false);
}
