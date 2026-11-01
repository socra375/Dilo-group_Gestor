// Arranque: apariencia, migración de datos, datos de ejemplo, enrutador y service worker.
import { CONFIG } from './config.js';
import { pref, setPref, letraPx } from './core/prefs.js';
import { icon } from './core/ui.js';
import { iniciarRouter, ir } from './core/router.js';
import { sembrarSiPrimeraVez, hayDatosEjemplo } from './data/seed.js';
import { pedirPersistencia, migrarDesdeLocalStorage } from './data/store.js';

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

async function actualizarInsignia() {
  document.getElementById('badge-ejemplo').hidden = !(await hayDatosEjemplo());
}

async function iniciar() {
  document.getElementById('header-company').textContent = CONFIG.empresa.nombre;
  document.getElementById('brand-name').textContent = CONFIG.empresa.nombre;
  // Altura real de la cabecera para los títulos de día "pegajosos" (cambia con la franja de ejemplo y la letra).
  const cabecera = document.querySelector('.app-header');
  new ResizeObserver(() => raiz.style.setProperty('--header-h', `${cabecera.offsetHeight}px`)).observe(cabecera);
  aplicarApariencia();
  window.addEventListener('prefs', (e) => {
    if (['tema', 'letra'].includes(e.detail.clave)) aplicarApariencia();
  });

  document.getElementById('tema-rapido').addEventListener('click', () => {
    setPref('tema', temaEfectivo() === 'oscuro' ? 'claro' : 'oscuro');
  });
  document.getElementById('badge-ejemplo').addEventListener('click', () => ir('ajustes'));
  // El enlace "Saltar al contenido" no debe cambiar el hash (el hash es la ruta).
  document.querySelector('[data-saltar]').addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('main').focus();
  });

  try {
    await migrarDesdeLocalStorage();
    await sembrarSiPrimeraVez();
  } catch (e) {
    console.error('No se pudieron preparar los datos', e);
  }
  await actualizarInsignia();
  let pendiente = null;
  window.addEventListener('datos', () => {
    clearTimeout(pendiente);
    pendiente = setTimeout(actualizarInsignia, 200);
  });

  await iniciarRouter();
  pedirPersistencia();

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Service worker no registrado', e));
  }
}

iniciar();
