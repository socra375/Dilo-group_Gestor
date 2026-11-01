// Gráfica de barras en SVG propio (sin librerías). Una sola serie con ÉNFASIS: el último día (hoy) en el color
// de acento y los demás en gris apagado. Sin leyenda (el título dice qué se grafica); etiqueta directa solo en
// hoy y en el día más alto; tooltip con ratón o teclado; tabla alternativa con todos los valores.
import { esc } from './ui.js';
import { fecha as fechaTexto } from './format.js';

const W = 340;
const H = 176;
const M = { izq: 30, der: 6, arr: 22, abajo: 34 };
const GROSOR_MAX = 24; // las barras nunca llenan el espacio: el resto es aire
const RADIO = 4; // extremo de datos redondeado; la base queda recta

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const diaSemana = (clave) => DIAS[new Date(`${clave}T12:00:00Z`).getUTCDay()];

/** Escala "agradable": máximo y paso para tener como mucho 4 divisiones, siempre con enteros. */
export function escalaEntera(max) {
  const m = Math.max(1, Math.ceil(max));
  const paso = [1, 2, 5, 10, 20, 50, 100, 200, 500].find((p) => Math.ceil(m / p) <= 4) ?? 1000;
  return { paso, tope: Math.ceil(m / paso) * paso };
}

/** Barra con el extremo superior redondeado y la base recta, anclada a la línea base. */
function trazoBarra(x, y, ancho, alto) {
  const r = Math.min(RADIO, ancho / 2, alto);
  return `M${x},${y + alto}V${y + r}Q${x},${y} ${x + r},${y}H${x + ancho - r}Q${x + ancho},${y} ${x + ancho},${y + r}V${y + alto}Z`;
}

const texto = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

/**
 * @param {{fecha:string, viajes:number, retrasos:number}[]} dias  de más antiguo a hoy (el último se resalta)
 * @param {{ titulo: string, id: string }} op
 */
export function graficaRetrasosHTML(dias, { titulo, id }) {
  const maxValor = Math.max(0, ...dias.map((d) => d.retrasos));
  const { paso, tope } = escalaEntera(maxValor);
  const ancho = W - M.izq - M.der;
  const alto = H - M.arr - M.abajo;
  const base = M.arr + alto;
  const slot = ancho / dias.length;
  const grosor = Math.min(GROSOR_MAX, slot - 14);
  const y = (v) => base - (v / tope) * alto;
  const hoy = dias.length - 1;
  const iMax = maxValor > 0 ? dias.findIndex((d) => d.retrasos === maxValor) : -1;

  let rejilla = '';
  for (let v = 0; v <= tope; v += paso) {
    rejilla += `<line class="graf__rejilla${v === 0 ? ' graf__rejilla--base' : ''}" x1="${M.izq}" x2="${W - M.der}" y1="${y(v)}" y2="${y(v)}"/>`;
    rejilla += `<text class="graf__eje" x="${M.izq - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
  }

  const columnas = dias.map((d, i) => {
    const cx = M.izq + slot * i + slot / 2;
    const hAlto = d.retrasos > 0 ? Math.max(RADIO + 1, (d.retrasos / tope) * alto) : 0;
    const esHoy = i === hoy;
    const etiqueta = d.retrasos > 0 && (esHoy || i === iMax) ? d.retrasos : esHoy ? 0 : null;
    const nombre = `${diaSemana(d.fecha)} ${fechaTexto(d.fecha)}${esHoy ? ' (hoy)' : ''}`;
    const aria = `${nombre}: ${texto(d.retrasos, 'retraso', 'retrasos')} de ${texto(d.viajes, 'viaje', 'viajes')}`;
    return `<g class="graf__col${esHoy ? ' graf__col--hoy' : ''}" tabindex="0" role="img" aria-label="${esc(aria)}"
        data-i="${i}" data-cx="${cx.toFixed(1)}">
      <rect class="graf__area" x="${(cx - slot / 2).toFixed(1)}" y="${M.arr - 14}" width="${slot.toFixed(1)}" height="${alto + 14}" fill="transparent"/>
      ${hAlto ? `<path class="graf__barra" d="${trazoBarra(+(cx - grosor / 2).toFixed(1), +(base - hAlto).toFixed(1), grosor, +hAlto.toFixed(1))}"/>` : ''}
      ${etiqueta !== null ? `<text class="graf__valor" x="${cx.toFixed(1)}" y="${(base - hAlto - 6).toFixed(1)}" text-anchor="middle">${etiqueta}</text>` : ''}
      <text class="graf__x${esHoy ? ' graf__x--hoy' : ''}" x="${cx.toFixed(1)}" y="${base + 15}" text-anchor="middle">${esHoy ? 'hoy' : diaSemana(d.fecha)}</text>
      <text class="graf__x graf__x--dia${esHoy ? ' graf__x--hoy' : ''}" x="${cx.toFixed(1)}" y="${base + 28}" text-anchor="middle">${Number(d.fecha.slice(8))}</text>
    </g>`;
  }).join('');

  const filas = dias.map((d, i) => `<tr${i === hoy ? ' class="graf__fila-hoy"' : ''}><th scope="row">${esc(diaSemana(d.fecha))} ${esc(fechaTexto(d.fecha))}${i === hoy ? ' (hoy)' : ''}</th><td>${d.viajes}</td><td>${d.retrasos}</td></tr>`).join('');

  return `<figure class="graf" data-graf="${esc(id)}">
    <figcaption class="graf__titulo"><strong>${esc(titulo)}</strong><span class="muted">Últimos ${dias.length} días</span></figcaption>
    <div class="graf__lienzo">
      <svg viewBox="0 0 ${W} ${H}" role="group" aria-label="${esc(titulo)}: barras por día, la de hoy resaltada">${rejilla}${columnas}</svg>
      <div class="graf__tip" role="status" hidden></div>
    </div>
    <details class="graf__tabla">
      <summary>Ver como tabla</summary>
      <table class="table"><caption class="sr-only">${esc(titulo)}</caption>
        <thead><tr><th scope="col">Día</th><th scope="col">Viajes</th><th scope="col">Retrasos</th></tr></thead>
        <tbody>${filas}</tbody></table>
    </details>
  </figure>`;
}

/** Tooltip al pasar el ratón o enfocar con el teclado (los valores salen de `dias`, nunca del HTML). */
export function activarGrafica(raiz, dias) {
  const fig = raiz.querySelector('[data-graf]');
  if (!fig) return;
  const lienzo = fig.querySelector('.graf__lienzo');
  const tip = fig.querySelector('.graf__tip');
  const svg = fig.querySelector('svg');

  const mostrar = (col) => {
    const d = dias[Number(col.dataset.i)];
    const caja = svg.getBoundingClientRect();
    const escala = caja.width / W;
    tip.replaceChildren();
    const valor = document.createElement('strong');
    valor.textContent = texto(d.retrasos, 'retraso', 'retrasos');
    const detalle = document.createElement('span');
    detalle.textContent = `de ${texto(d.viajes, 'viaje', 'viajes')} · ${diaSemana(d.fecha)} ${fechaTexto(d.fecha)}`;
    tip.append(valor, detalle);
    tip.hidden = false;
    // Centrado sobre la columna, sin salirse del lienzo.
    const mitad = tip.offsetWidth / 2;
    const x = Math.min(Math.max(Number(col.dataset.cx) * escala, mitad), caja.width - mitad);
    tip.style.left = `${x}px`;
    tip.style.top = `${(M.arr - 6) * escala}px`;
    fig.querySelectorAll('.graf__col--activa').forEach((c) => c.classList.remove('graf__col--activa'));
    col.classList.add('graf__col--activa');
  };
  const ocultar = () => {
    tip.hidden = true;
    fig.querySelectorAll('.graf__col--activa').forEach((c) => c.classList.remove('graf__col--activa'));
  };

  for (const col of fig.querySelectorAll('.graf__col')) {
    col.addEventListener('pointerenter', () => mostrar(col));
    col.addEventListener('pointermove', () => mostrar(col));
    col.addEventListener('focus', () => mostrar(col));
    col.addEventListener('blur', ocultar);
  }
  lienzo.addEventListener('pointerleave', ocultar);
  fig.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') ocultar();
  });
}
