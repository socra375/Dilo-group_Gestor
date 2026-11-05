// Movimiento de la interfaz (sobrio, nunca bloquea): onda circular al cambiar de tema, tarjetas que entran escalonadas
// e indicador deslizante en los selectores segmentados. Todo se apaga con "reducir movimiento" del sistema.
import { reduceMotion } from './ui.js';

/**
 * Ejecuta `accion` (que cambia el tema) con una onda circular que sale de (x, y), si el navegador tiene View Transitions.
 * Sin esa API, o con reducir movimiento, la acción corre al instante y sin efecto.
 */
export function conOnda(accion, x, y) {
  if (typeof document.startViewTransition !== 'function' || reduceMotion()) return accion();
  const radio = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  const t = document.startViewTransition(accion);
  t.ready
    .then(() => document.documentElement.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radio}px at ${x}px ${y}px)`] },
      { duration: 520, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', pseudoElement: '::view-transition-new(root)' },
    ))
    .catch(() => {}); // si la transición se cancela, el tema ya cambió igual
  return undefined;
}

/** Hace que los hijos directos de `el` entren uno tras otro (hasta el octavo; el resto entra con él). */
export function escalonarHijos(el, max = 8) {
  if (!el || reduceMotion()) return;
  [...el.children].forEach((c, i) => c.style.setProperty('--i', String(Math.min(i, max))));
  el.classList.remove('entra');
  void el.offsetWidth; // reinicia la animación si ya la tenía
  el.classList.add('entra');
}

// ---------- Indicador deslizante de los selectores segmentados ----------

function colocar(seg) {
  const b = seg.querySelector('button[aria-pressed="true"]');
  if (!b || !b.offsetWidth) return; // oculto o sin opción elegida
  seg.style.setProperty('--pill-x', `${b.offsetLeft}px`);
  seg.style.setProperty('--pill-y', `${b.offsetTop}px`);
  seg.style.setProperty('--pill-w', `${b.offsetWidth}px`);
  seg.style.setProperty('--pill-h', `${b.offsetHeight}px`);
  // La primera vez se coloca sin animar; los cambios siguientes sí se deslizan.
  if (!seg.dataset.pill) requestAnimationFrame(() => { seg.dataset.pill = 'si'; });
}

export function iniciarPildoras() {
  let pendiente = false;
  const todos = () => {
    pendiente = false;
    document.querySelectorAll('.segmented').forEach(colocar);
  };
  const programar = () => {
    if (pendiente) return;
    pendiente = true;
    requestAnimationFrame(todos);
  };
  new MutationObserver(programar).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-pressed'] });
  window.addEventListener('resize', programar);
  window.addEventListener('prefs', programar); // el tamaño de letra cambia el ancho de las opciones
  programar();
}
