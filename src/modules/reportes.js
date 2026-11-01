// Reportes (CONFIG.reportes decide cuáles se ven). Entrega elegida por el cliente: compartir por WhatsApp.
// Cada reporte genera un texto limpio (líneas cortas, sin tablas) y lo envía con la hoja de compartir del
// sistema; si el navegador no la tiene, abre WhatsApp con el texto ya escrito. CSV como extra.
import * as store from '../data/store.js';
import { CONFIG } from '../config.js';
import { tolerancia, avisosConfig } from '../core/prefs.js';
import { hoyClave, sumarDias, fechaClave, formatoDuracion, estadoViaje } from '../core/time.js';
import { retrasosPor, totalesRetrasos, combustiblePor, combustiblePorVehiculo, aCSV } from '../core/agregados.js';
import { calcularAvisos } from '../core/avisos.js';
import { resumenDiarioTexto, retrasosTexto, combustiblePeriodoTexto, combustibleVehiculoTexto, compartirWhatsApp } from '../core/share.js';
import { cargarRefs, porId } from '../core/crud.js';
import * as fmt from '../core/format.js';
import { esc, icon, vacio, descargar, toast, conCarga } from '../core/ui.js';

const PERIODOS = {
  '7d': { etiqueta: '7 días', rango: (h) => [sumarDias(h, -6), h] },
  '30d': { etiqueta: '30 días', rango: (h) => [sumarDias(h, -29), h] },
  mes: { etiqueta: 'Este mes', rango: (h) => [`${h.slice(0, 7)}-01`, h] },
  ant: { etiqueta: 'Mes pasado', rango: (h) => { const fin = sumarDias(`${h.slice(0, 7)}-01`, -1); return [`${fin.slice(0, 7)}-01`, fin]; } },
};

const pct = (n) => (n == null ? '—' : `${n}%`);
const textoPeriodo = (desde, hasta) => `Del ${fmt.fecha(desde)} al ${fmt.fecha(hasta)}`;

/** Botones de un reporte: WhatsApp (la entrega elegida) y CSV (extra, si está activo). */
function acciones(id, { csv = true } = {}) {
  return `<div class="row row--wrap">
    <button type="button" class="btn btn--whatsapp btn--sm" data-whatsapp="${id}">${icon('whatsapp', 'icon--sm')}Compartir por WhatsApp</button>
    ${csv && CONFIG.reportes.csv ? `<button type="button" class="btn btn--ghost btn--sm" data-csv="${id}">${icon('download', 'icon--sm')}Exportar CSV</button>` : ''}
  </div>`;
}

/** `antes`: controles sobre el contenido (p. ej. el selector de día); `pie`: botones de compartir y exportar. */
const tarjeta = (id, titulo, cuerpo, { antes = '', pie = '' } = {}) => `<section class="card section" aria-labelledby="t-${id}">
  <div class="section__head"><h2 class="section__title" id="t-${id}">${esc(titulo)}</h2></div>${antes}${cuerpo}${pie}</section>`;

function tablaRetrasos(id, titulo, filas, nombres) {
  const lleno = filas.length
    ? (() => {
        const t = totalesRetrasos(filas);
        const max = Math.max(1, ...filas.map((f) => f.retrasados));
        return `<div class="table-wrap"><table class="table">
          <thead><tr><th scope="col">${id === 'chofer' ? 'Chofer' : 'Ruta'}</th><th scope="col">Viajes</th><th scope="col">Retrasos</th><th scope="col">A tiempo</th></tr></thead>
          <tbody>${filas.map((f) => `<tr>
            <td><span style="display:grid;gap:4px">${esc(nombres.get(f.id) ?? '(eliminado)')}<span class="bar bar--warn" aria-hidden="true"><span style="width:${(f.retrasados / max) * 100}%"></span></span></span></td>
            <td>${f.viajes}</td><td>${f.retrasados}${f.retrasados ? `<br><small class="muted">prom. ${f.promRetraso} min</small>` : ''}${f.sinLlegada ? `<br><small class="muted">+${f.sinLlegada} s/l</small>` : ''}</td><td>${pct(f.pctATiempo)}</td></tr>`).join('')}</tbody>
          <tfoot><tr><td>Total</td><td>${t.viajes}</td><td>${t.retrasados}${t.retrasados ? `<br><small class="muted">prom. ${t.promRetraso} min</small>` : ''}</td><td>${pct(t.pctATiempo)}</td></tr></tfoot>
        </table></div>
        <p class="field__help">“s/l”: viajes sin llegada registrada (no cuentan en la puntualidad). prom.: retraso promedio de los viajes retrasados.</p>`;
      })()
    : vacio({ icono: 'chart', titulo: 'Sin viajes en este periodo' });
  return tarjeta(id, titulo, lleno, { pie: acciones(`retrasos-${id}`, { csv: filas.length > 0 }) });
}

const etiquetaPeriodo = (clave, tipo) => (tipo === 'semana' ? `Sem. ${fmt.fecha(clave).slice(0, 5)}` : fmt.mes(clave).replace(/^./, (c) => c.toUpperCase()));

function tablaCombustible(filas, tipo) {
  const max = Math.max(1, ...filas.map((f) => f.monto));
  const t = filas.reduce((s, f) => ({ cargas: s.cargas + f.cargas, cantidad: s.cantidad + f.cantidad, monto: s.monto + f.monto }), { cargas: 0, cantidad: 0, monto: 0 });
  return `<div class="segmented" role="group" aria-label="Agrupar combustible">
      <button type="button" data-comb="semana" aria-pressed="${tipo === 'semana'}">Por semana</button>
      <button type="button" data-comb="mes" aria-pressed="${tipo === 'mes'}">Por mes</button></div>
    <div class="table-wrap"><table class="table">
    <thead><tr><th scope="col">${tipo === 'semana' ? 'Semana (lunes)' : 'Mes'}</th><th scope="col">Cargas</th><th scope="col">${fmt.unidad('larga').replace(/^./, (c) => c.toUpperCase())}</th><th scope="col">Monto</th></tr></thead>
    <tbody>${filas.map((f) => `<tr><td><span style="display:grid;gap:4px">${esc(etiquetaPeriodo(f.periodo, tipo))}<span class="bar" aria-hidden="true"><span style="width:${(f.monto / max) * 100}%"></span></span></span></td><td>${f.cargas}</td><td>${fmt.numero(f.cantidad, 1)}</td><td>${fmt.dinero(f.monto)}</td></tr>`).join('')}</tbody>
    <tfoot><tr><td>Total</td><td>${t.cargas}</td><td>${fmt.numero(t.cantidad, 1)}</td><td>${fmt.dinero(t.monto)}</td></tr></tfoot>
  </table></div>`;
}

function tablaVehiculos(filas, nombres) {
  if (!filas.length) return vacio({ icono: 'fuel', titulo: 'Sin cargas en este periodo' });
  const t = filas.reduce((s, f) => ({ cargas: s.cargas + f.cargas, galones: s.galones + f.galones, monto: s.monto + f.monto }), { cargas: 0, galones: 0, monto: 0 });
  const gal = fmt.unidad('larga').replace(/^./, (c) => c.toUpperCase());
  // 4 columnas (las cargas van como nota bajo la placa) para que el rendimiento se vea sin desplazar la tabla.
  return `<div class="table-wrap"><table class="table">
    <thead><tr><th scope="col">Vehículo</th><th scope="col">${gal}</th><th scope="col">Monto</th><th scope="col">km/${fmt.unidad()}</th></tr></thead>
    <tbody>${filas.map((f) => `<tr><td>${esc(nombres.get(f.id) ?? '(eliminado)')}<br><small class="muted">${fmt.plural(f.cargas, 'carga', 'cargas')}</small></td><td>${fmt.numero(f.galones, 1)}</td><td>${fmt.dinero(f.monto)}</td><td>${f.kmGal != null ? fmt.numero(f.kmGal, 1) : '—'}</td></tr>`).join('')}</tbody>
    <tfoot><tr><td>Total<br><small class="muted">${fmt.plural(t.cargas, 'carga', 'cargas')}</small></td><td>${fmt.numero(t.galones, 1)}</td><td>${fmt.dinero(t.monto)}</td><td></td></tr></tfoot>
  </table></div>`;
}

/** Datos del resumen diario de `fecha` (los avisos solo se incluyen para hoy: son del presente). */
export function datosResumenDiario({ fecha, viajes, combustible, choferes, vehiculos, rutas }) {
  const hoy = hoyClave();
  const ahora = new Date();
  const tol = tolerancia();
  const nombreChofer = new Map(choferes.map((c) => [c.id, c.nombre]));
  const nombreRuta = new Map(rutas.map((r) => [r.id, r.nombre]));
  const delDia = viajes.filter((v) => !v.archivado && fechaClave(v.salidaProg) === fecha).sort((a, b) => a.salidaProg.localeCompare(b.salidaProg));
  const estados = delDia.map((v) => [v, estadoViaje(v, ahora, tol)]);
  const cargas = combustible.filter((c) => !c.archivado && c.fecha === fecha);
  return {
    fecha,
    viajes: delDia.length,
    completados: estados.filter(([, e]) => e.estado === 'completado').length,
    sinLlegada: estados.filter(([, e]) => e.estado === 'sin_llegada').length,
    retrasados: estados.filter(([, e]) => e.puntualidad === 'retrasado').map(([v, e]) => ({
      ruta: nombreRuta.get(v.rutaId) ?? 'Viaje', hora: fmt.hora(v.salidaProg), min: e.retrasoMin, chofer: nombreChofer.get(v.choferId) ?? '', motivo: v.motivoRetraso || '',
    })),
    galones: cargas.reduce((s, c) => s + (Number(c.cantidad) || 0), 0),
    monto: cargas.reduce((s, c) => s + (Number(c.monto) || 0), 0),
    cargas: cargas.length,
    avisos: fecha === hoy
      ? calcularAvisos({ viajes, choferes, vehiculos, combustible, rutas }, { hoy, ahora, tolerancia: tol, op: avisosConfig() }).map((a) => ({ severidad: a.severidad, titulo: a.titulo, texto: a.texto }))
      : null,
  };
}

export default {
  titulo: 'Reportes',
  pestana: 'mas',
  async render(el) {
    const R = CONFIG.reportes;
    const est = { periodo: '7d', comb: 'semana', dia: hoyClave() };
    el.innerHTML = `
      <div class="segmented" role="group" aria-label="Periodo">${Object.entries(PERIODOS).map(([k, p]) => `<button type="button" data-periodo="${k}" aria-pressed="${k === est.periodo}">${p.etiqueta}</button>`).join('')}</div>
      <p class="muted" data-rango></p>
      <div class="stack" data-cuerpo style="gap:var(--sp-4)"></div>`;
    const cuerpo = el.querySelector('[data-cuerpo]');
    const [datos, refs] = await conCarga(cuerpo, Promise.all([
      Promise.all([store.list('viajes'), store.list('combustible')]),
      cargarRefs(['choferes', 'rutas', 'vehiculos']),
    ]), 3);
    const [viajes, cargas] = datos;
    const nombresChofer = new Map([...porId(refs.choferes)].map(([id, c]) => [id, c.nombre]));
    const nombresRuta = new Map([...porId(refs.rutas)].map(([id, r]) => [id, r.nombre]));
    const nombresVeh = new Map([...porId(refs.vehiculos)].map(([id, v]) => [id, v.placa]));
    let reportes = {}; // id → { texto, csv: { nombre, encabezados, filas } }

    const pintar = () => {
      const hoy = hoyClave();
      const [desde, hasta] = PERIODOS[est.periodo].rango(hoy);
      const periodo = textoPeriodo(desde, hasta);
      const op = { desde, hasta, tolerancia: tolerancia() };
      el.querySelector('[data-rango]').textContent = `${periodo} · tolerancia ${tolerancia()} min`;
      reportes = {};
      let html = '';

      if (R.resumen_diario) {
        const d = datosResumenDiario({ fecha: est.dia, viajes, combustible: cargas, choferes: refs.choferes, vehiculos: refs.vehiculos, rutas: refs.rutas });
        reportes.resumen = { texto: resumenDiarioTexto(d) };
        const linea = (t, v, nota = '') => `<div class="stat"><span class="stat__label">${t}</span><span class="stat__value stat__value--sm tabular">${v}</span>${nota ? `<span class="stat__note">${nota}</span>` : ''}</div>`;
        html += tarjeta('resumen', 'Resumen del día', `
          <div class="stats stats--resumen">
            ${linea('Viajes', d.viajes, `${d.completados} completados`)}
            ${linea('Retrasos', d.retrasados.length, d.sinLlegada ? `${d.sinLlegada} sin llegada` : 'a la llegada')}
            ${linea('Combustible', fmt.cantidad(Math.round(d.galones * 10) / 10), fmt.dinero(d.monto))}
          </div>
          ${d.retrasados.length ? `<ul class="list">${d.retrasados.map((r) => `<li class="item item--error"><span class="item__title">${esc(r.ruta)} · ${esc(r.hora)}</span><span class="item__subtitle">+${esc(formatoDuracion(r.min))}${r.chofer ? ` · ${esc(r.chofer)}` : ''}${r.motivo ? ` · ${esc(r.motivo)}` : ''}</span></li>`).join('')}</ul>` : ''}
          ${d.avisos ? `<p class="muted">${d.avisos.length ? `${d.avisos.length} aviso${d.avisos.length === 1 ? '' : 's'} activo${d.avisos.length === 1 ? '' : 's'} (van en el mensaje).` : 'Sin avisos activos.'}</p>` : '<p class="muted">Los avisos son del presente: no se incluyen en días pasados.</p>'}
          <details class="graf__tabla"><summary>Ver el mensaje</summary><pre class="mensaje" data-mensaje></pre></details>`,
        { antes: `<label class="field"><span class="field__label">Día</span><input class="input" type="date" data-dia value="${est.dia}" max="${hoy}"></label>`, pie: acciones('resumen', { csv: false }) });
      }

      if (R.retrasos_chofer) {
        const filas = retrasosPor(viajes, 'choferId', op);
        reportes['retrasos-chofer'] = {
          texto: retrasosTexto({ titulo: 'Retrasos por chofer', periodo, filas: filas.map((f) => ({ ...f, nombre: nombresChofer.get(f.id) ?? '(sin chofer)' })), totales: totalesRetrasos(filas) }),
          csv: { nombre: `retrasos-por-chofer-${desde}-a-${hasta}.csv`, encabezados: ['Chofer', 'Viajes', 'Completados', 'Retrasados', 'Sin llegada', '% a tiempo', 'Retraso promedio (min)', 'Minutos de retraso'], filas: filas.map((f) => [nombresChofer.get(f.id) ?? '(sin chofer)', f.viajes, f.completados, f.retrasados, f.sinLlegada, f.pctATiempo ?? '', f.promRetraso, f.minRetraso]) },
        };
        html += tablaRetrasos('chofer', 'Retrasos por chofer', filas, new Map([...nombresChofer, [null, '(sin chofer)'], [undefined, '(sin chofer)']]));
      }
      if (R.retrasos_ruta) {
        const filas = retrasosPor(viajes, 'rutaId', op);
        reportes['retrasos-ruta'] = {
          texto: retrasosTexto({ titulo: 'Retrasos por ruta', periodo, filas: filas.map((f) => ({ ...f, nombre: nombresRuta.get(f.id) ?? '(eliminada)' })), totales: totalesRetrasos(filas) }),
          csv: { nombre: `retrasos-por-ruta-${desde}-a-${hasta}.csv`, encabezados: ['Ruta', 'Viajes', 'Completados', 'Retrasados', 'Sin llegada', '% a tiempo', 'Retraso promedio (min)', 'Minutos de retraso'], filas: filas.map((f) => [nombresRuta.get(f.id) ?? '(eliminada)', f.viajes, f.completados, f.retrasados, f.sinLlegada, f.pctATiempo ?? '', f.promRetraso, f.minRetraso]) },
        };
        html += tablaRetrasos('ruta', 'Retrasos por ruta', filas, nombresRuta);
      }
      if (R.combustible_periodo) {
        const filas = combustiblePor(cargas, est.comb, { hoy, n: est.comb === 'semana' ? 8 : 6 });
        const titulo = `Combustible por ${est.comb}`;
        reportes['combustible-periodo'] = {
          texto: combustiblePeriodoTexto({ titulo, filas: filas.map((f) => ({ ...f, etiqueta: etiquetaPeriodo(f.periodo, est.comb) })) }),
          csv: { nombre: `combustible-por-${est.comb}-${hoy}.csv`, encabezados: [est.comb === 'semana' ? 'Semana (lunes)' : 'Mes', 'Cargas', `Cantidad (${fmt.unidad('larga')})`, 'Monto (RD$)'], filas: filas.map((f) => [f.periodo, f.cargas, f.cantidad, f.monto.toFixed(2)]) },
        };
        html += tarjeta('combustible-periodo', 'Combustible por semana o mes', tablaCombustible(filas, est.comb), { pie: acciones('combustible-periodo') });
      }
      if (R.combustible_vehiculo) {
        const filas = combustiblePorVehiculo(cargas, { desde, hasta });
        reportes['combustible-vehiculo'] = {
          texto: combustibleVehiculoTexto({ titulo: 'Combustible por vehículo', periodo, filas: filas.map((f) => ({ ...f, placa: nombresVeh.get(f.id) ?? '(eliminado)' })) }),
          csv: { nombre: `combustible-por-vehiculo-${desde}-a-${hasta}.csv`, encabezados: ['Vehículo', 'Cargas', `Cantidad (${fmt.unidad('larga')})`, 'Monto (RD$)', 'Precio por unidad (RD$)', `Rendimiento promedio (km/${fmt.unidad()})`], filas: filas.map((f) => [nombresVeh.get(f.id) ?? '(eliminado)', f.cargas, f.galones, f.monto.toFixed(2), f.precioGalon ?? '', f.kmGal ?? '']) },
        };
        html += tarjeta('combustible-vehiculo', 'Combustible por vehículo', tablaVehiculos(filas, nombresVeh), { pie: acciones('combustible-vehiculo', { csv: filas.length > 0 }) });
      }
      cuerpo.innerHTML = html || vacio({ icono: 'chart', titulo: 'No hay reportes activos', texto: 'Se activan en CONFIG.reportes.' });
      const msg = cuerpo.querySelector('[data-mensaje]');
      if (msg) msg.textContent = reportes.resumen?.texto ?? '';
    };

    el.addEventListener('change', (e) => {
      if (e.target.matches('[data-dia]') && e.target.value) {
        est.dia = e.target.value;
        pintar();
      }
    });
    el.addEventListener('click', async (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.periodo) {
        est.periodo = b.dataset.periodo;
        el.querySelectorAll('[data-periodo]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        pintar();
      } else if (b.dataset.comb) {
        est.comb = b.dataset.comb;
        pintar();
      } else if (b.dataset.whatsapp) {
        b.disabled = true;
        try {
          const r = await compartirWhatsApp(reportes[b.dataset.whatsapp].texto);
          if (r === 'whatsapp') toast('Se abrió WhatsApp con el reporte listo para enviar.');
        } finally {
          b.disabled = false;
        }
      } else if (b.dataset.csv) {
        const { nombre, encabezados, filas } = reportes[b.dataset.csv].csv;
        descargar(nombre, aCSV(encabezados, filas), 'text/csv;charset=utf-8');
        toast(`Descargado ${nombre}`);
      }
    });
    pintar();
  },
};
