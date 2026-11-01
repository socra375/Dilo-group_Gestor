// Arranque: apariencia, migración de datos, enrutador y service worker.
import { CONFIG } from './config.js';
import { pref, setPref, letraPx } from './core/prefs.js';
import { icon } from './core/ui.js';
import { iniciarRouter, refrescar } from './core/router.js';
import { pedirPersistencia, migrarDesdeLocalStorage, usarSupabase, restaurarSesion } from './data/store.js';
import { pedirInicioSesion } from './core/entrar.js';

const raiz = document.documentElement;

export const temaEfectivo = () => (pref('tema') === 'oscuro' ? 'oscuro' : 'claro');

export function aplicarApariencia() {
  raiz.dataset.theme = temaEfectivo();
  raiz.style.fontSize = `${letraPx()}px`;
  raiz.style.setProperty('--brand', CONFIG.tema.color);
  raiz.style.setProperty('--accent', CONFIG.tema.acento);

  const oscuro = temaEfectivo() === 'oscuro';
  document.getElementById('theme-color')?.setAttribute('content', CONFIG.tema.color); // barra del sistema = encabezado
  const b = document.getElementById('tema-rapido');
  if (b) {
    b.innerHTML = icon(oscuro ? 'sun' : 'moon');
    b.setAttribute('aria-label', oscuro ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro');
  }
}

/** src/config.local.js (ignorado por git) activa Supabase. Sin ese archivo, la app corre en modo demostración. */
async function cargarNube() {
  try {
    return (await import('./config.local.js')).SUPABASE ?? null;
  } catch {
    return null;
  }
}

async function iniciar() {
  iniciarServiceWorker();
  document.getElementById('header-company').textContent = CONFIG.empresa.nombre;
  document.getElementById('brand-name').textContent = CONFIG.empresa.nombre;
  // Altura real de la cabecera para los títulos de día "pegajosos" (cambia con el tamaño de letra).
  const cabecera = document.querySelector('.app-header');
  new ResizeObserver(() => raiz.style.setProperty('--header-h', `${cabecera.offsetHeight}px`)).observe(cabecera);
  aplicarApariencia();
  window.addEventListener('prefs', (e) => {
    if (['tema', 'letra'].includes(e.detail.clave)) aplicarApariencia();
  });

  document.getElementById('tema-rapido').addEventListener('click', () => {
    setPref('tema', temaEfectivo() === 'oscuro' ? 'claro' : 'oscuro');
  });
  // El enlace "Saltar al contenido" no debe cambiar el hash (el hash es la ruta).
  document.querySelector('[data-saltar]').addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('main').focus();
  });

  const nube = await cargarNube();
  if (nube) {
    // Datos reales: nada de demostración. Hace falta una sesión antes de mostrar o pedir cualquier dato.
    usarSupabase(nube);
    document.body.classList.add('modo-nube');
    if (!(await restaurarSesion())) await pedirInicioSesion();
    // Si la sesión no se puede renovar a mitad de uso, se pide entrar de nuevo y se repinta la pantalla.
    window.addEventListener('sesion-vencida', async () => {
      await pedirInicioSesion();
      refrescar();
    });
  } else {
    try {
      await migrarDesdeLocalStorage();
    } catch (e) {
      console.error('No se pudieron preparar los datos', e);
    }
  }
  await iniciarRouter();
  pedirPersistencia();
}

/**
 * Service worker. Se registra AL ARRANCAR, antes de pedir sesión: si se registrara al final, en modo nube no ocurriría
 * hasta que alguien entrara, y quien ya tiene una versión vieja instalada seguiría viéndola (el service worker sirve la
 * copia guardada primero). Cuando una versión nueva toma el control, la página se recarga UNA vez para dejar de mostrar
 * la copia vieja; no se recarga en la primera instalación ni mientras alguien escribe (espera al próximo cambio de pantalla).
 */
function iniciarServiceWorker() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  const teniaControl = Boolean(navigator.serviceWorker.controller);
  let recargada = false;
  const escribiendo = () => Boolean(document.querySelector('dialog[open]')) || document.activeElement?.matches?.('input, textarea, select');
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!teniaControl || recargada) return;
    recargada = true;
    if (escribiendo()) window.addEventListener('hashchange', () => location.reload(), { once: true });
    else location.reload();
  });
  navigator.serviceWorker.register('sw.js').then((reg) => {
    const buscar = () => reg.update().catch(() => {});
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') buscar(); });
    setInterval(buscar, 60 * 60 * 1000); // una app instalada puede quedar abierta días
  }).catch((e) => console.warn('Service worker no registrado', e));
}

iniciar();
