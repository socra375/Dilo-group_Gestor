// Componentes de interfaz: íconos, hoja inferior, confirmación, toasts, vacíos, esqueleto, contadores.

/** Escapa texto para insertarlo en plantillas HTML. */
export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export const icon = (nombre, clase = '') => `<svg class="icon ${clase}" aria-hidden="true"><use href="#i-${nombre}"></use></svg>`;

export const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function cerrarAnimado(dialog) {
  return new Promise((resolve) => {
    if (!dialog.open) return resolve();
    if (reduceMotion()) {
      dialog.close();
      return resolve();
    }
    dialog.classList.add('is-closing');
    const fin = () => {
      dialog.classList.remove('is-closing');
      dialog.close();
      resolve();
    };
    dialog.addEventListener('animationend', fin, { once: true });
    setTimeout(fin, 400); // por si el navegador no emite animationend
  });
}

/**
 * Hoja inferior. `contenido` es HTML; `pie` es HTML de botones (opcional).
 * Devuelve { el, body, cerrar }. `alCerrar` se llama siempre al cerrarse.
 */
export function abrirHoja({ titulo, contenido, pie = '', alCerrar }) {
  const d = document.createElement('dialog');
  d.className = 'sheet';
  d.setAttribute('aria-labelledby', 'sheet-title');
  d.innerHTML = `
    <div class="sheet__grab" aria-hidden="true"></div>
    <div class="sheet__head">
      <h2 class="sheet__title" id="sheet-title">${esc(titulo)}</h2>
      <button type="button" class="icon-btn" data-cerrar aria-label="Cerrar">${icon('x')}</button>
    </div>
    <div class="sheet__body">${contenido}</div>
    ${pie ? `<div class="sheet__foot">${pie}</div>` : ''}`;
  document.body.append(d);

  let cerrada = false;
  const cerrar = async () => {
    if (cerrada) return;
    cerrada = true;
    await cerrarAnimado(d);
    d.remove();
    alCerrar?.();
  };
  d.addEventListener('cancel', (e) => {
    e.preventDefault();
    cerrar();
  });
  d.addEventListener('click', (e) => {
    if (e.target === d || e.target.closest('[data-cerrar]')) cerrar();
  });
  d.showModal();
  // Foco en el primer campo solo si no es táctil: evita que el teclado tape la hoja al abrir.
  if (window.matchMedia('(hover: hover)').matches) d.querySelector('input, select, textarea')?.focus();
  else d.querySelector('[data-cerrar]')?.focus();
  return { el: d, body: d.querySelector('.sheet__body'), cerrar };
}

/** Confirmación dentro de la página. Resuelve true/false. */
export function confirmar({ titulo, mensaje = '', confirmar: ok = 'Confirmar', cancelar = 'Cancelar', peligro = false }) {
  return new Promise((resolve) => {
    const d = document.createElement('dialog');
    d.className = 'modal';
    d.setAttribute('aria-labelledby', 'modal-title');
    d.setAttribute('aria-describedby', 'modal-text');
    d.innerHTML = `
      <div class="modal__body">
        <h2 class="modal__title" id="modal-title">${esc(titulo)}</h2>
        ${mensaje ? `<p class="modal__text" id="modal-text">${esc(mensaje)}</p>` : ''}
      </div>
      <div class="modal__foot">
        <button type="button" class="btn btn--ghost" data-r="0">${esc(cancelar)}</button>
        <button type="button" class="btn ${peligro ? 'btn--danger' : 'btn--primary'}" data-r="1">${esc(ok)}</button>
      </div>`;
    document.body.append(d);
    const terminar = async (r) => {
      await cerrarAnimado(d);
      d.remove();
      resolve(r);
    };
    d.addEventListener('cancel', (e) => {
      e.preventDefault();
      terminar(false);
    });
    d.addEventListener('click', (e) => {
      const b = e.target.closest('[data-r]');
      if (b) terminar(b.dataset.r === '1');
      else if (e.target === d) terminar(false);
    });
    d.showModal();
    d.querySelector('[data-r="0"]').focus();
  });
}

/** Aviso breve. tipo: 'ok' | 'error' | 'info'. */
export function toast(mensaje, tipo = 'ok', ms = 2800) {
  const zona = document.getElementById('toasts');
  const t = document.createElement('div');
  t.className = `toast ${tipo === 'error' ? 'toast--error' : ''}`;
  t.setAttribute('role', tipo === 'error' ? 'alert' : 'status');
  t.innerHTML = `${icon(tipo === 'error' ? 'alert' : 'check')}<span>${esc(mensaje)}</span>`;
  zona.append(t);
  // Como máximo 2 a la vez: si se apilan, tapan los botones de la pantalla.
  const visibles = [...zona.children];
  for (const viejo of visibles.slice(0, Math.max(0, visibles.length - 2))) viejo.remove();
  setTimeout(() => {
    if (reduceMotion()) return t.remove();
    t.classList.add('is-leaving');
    t.addEventListener('animationend', () => t.remove(), { once: true });
    setTimeout(() => t.remove(), 400);
  }, ms);
}

export function vacio({ icono = 'inbox', titulo, texto = '', accion = '' }) {
  return `<div class="empty">${icon(icono)}<p class="empty__title">${esc(titulo)}</p>${texto ? `<p>${esc(texto)}</p>` : ''}${accion}</div>`;
}

export function esqueleto(n = 4, tipo = 'item') {
  return `<div class="stack" aria-busy="true" aria-label="Cargando">${'<div class="skeleton skeleton--' + tipo + '"></div>'.repeat(n)}</div>`;
}

/**
 * Muestra un esqueleto en `el` solo si `promesa` tarda más de 150 ms (evita parpadeos con datos locales).
 */
export async function conCarga(el, promesa, n = 4) {
  const t = setTimeout(() => {
    el.innerHTML = esqueleto(n);
  }, 150);
  try {
    return await promesa;
  } finally {
    clearTimeout(t);
  }
}

/** Numera hijos para la entrada escalonada (.stagger). */
export function escalonar(lista) {
  [...lista.children].forEach((c, i) => c.style.setProperty('--i', i));
  lista.classList.add('stagger');
}

/** Cuenta de 0 al valor final dentro de `el`. `formato` recibe el número. */
export function animarContador(el, valor, formato = (n) => String(Math.round(n)), ms = 700) {
  if (reduceMotion() || !valor) {
    el.textContent = formato(valor);
    return;
  }
  const inicio = performance.now();
  const paso = (t) => {
    const p = Math.min(1, (t - inicio) / ms);
    const suave = 1 - (1 - p) ** 3;
    el.textContent = formato(valor * suave);
    if (p < 1) requestAnimationFrame(paso);
    else el.textContent = formato(valor);
  };
  requestAnimationFrame(paso);
}

/** Descarga un archivo generado en el navegador. */
export function descargar(nombre, contenido, tipo) {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
