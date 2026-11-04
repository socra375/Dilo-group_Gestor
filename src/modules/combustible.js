// Combustible: cargas con precio por galón y rendimiento (km/gal, de tanque lleno a tanque lleno).
import { pantallaCrud, porId } from '../core/crud.js';
import { CONFIG } from '../config.js';
import { hoyClave, inicioSemana, horaAhora } from '../core/time.js';
import { rendimientos, avisoCombustibleAlto, MOTIVOS_SIN_RENDIMIENTO } from '../core/avisos.js';
import * as fmt from '../core/format.js';
import { esc, icon } from '../core/ui.js';

// Se recalculan en `cabecera`, que corre con la lista completa antes de pintar cada fila.
let rend = new Map();
let anomalas = new Map(); // idCarga → aviso de consumo alto

function resumen(cargas, desde) {
  const r = cargas.filter((c) => !c.archivado && c.fecha >= desde);
  return { cantidad: r.reduce((s, c) => s + (Number(c.cantidad) || 0), 0), monto: r.reduce((s, c) => s + (Number(c.monto) || 0), 0), n: r.length };
}

export default pantallaCrud({
  modulo: 'combustible',
  titulo: 'Combustible',
  pestana: 'combustible',
  icono: 'fuel',
  refsDe: ['vehiculos', 'choferes'],
  textoVacio: 'Toca “Nueva carga” para registrar la primera carga de combustible.',
  ordenar: (a, b) => `${b.fecha} ${b.hora || ''}`.localeCompare(`${a.fecha} ${a.hora || ''}`) || String(b.creado).localeCompare(String(a.creado)),
  valoresNuevos: () => ({ fecha: hoyClave(), hora: horaAhora(), tipo: CONFIG.combustible.tipos[0], tanqueLleno: true }),
  cabecera(refs, cargas) {
    rend = rendimientos(cargas);
    anomalas = new Map();
    for (const v of refs.vehiculos || []) {
      const a = avisoCombustibleAlto(v, cargas, CONFIG.avisos.combustible_alto, rend);
      if (a) anomalas.set(a.cargaId, a);
    }
    const hoy = hoyClave();
    const semana = resumen(cargas, inicioSemana(hoy));
    const mes = resumen(cargas, `${hoy.slice(0, 7)}-01`);
    const tile = (t, r) => `<div class="stat"><span class="stat__label">${t}</span><span class="stat__value stat__value--sm tabular">${fmt.cantidad(Math.round(r.cantidad * 10) / 10)}</span><span class="stat__note">${fmt.dinero(r.monto)} · ${fmt.plural(r.n, 'carga', 'cargas')}</span></div>`;
    return `<div class="stats">${tile('Esta semana', semana)}${tile('Este mes', mes)}</div>
      <a class="btn btn--secondary btn--block" href="#/reporte-combustible">${icon('file')}Reporte para el jefe</a>`;
  },
  describir(c, refs) {
    const veh = porId(refs.vehiculos).get(c.vehiculoId);
    const chofer = porId(refs.choferes).get(c.choferId);
    const precio = c.cantidad ? c.monto / c.cantidad : 0;
    const r = rend.get(c.id);
    const anomalia = anomalas.get(c.id);
    const rendimiento = r?.kmGal != null
      ? `${fmt.numero(r.kmGal, 1)} km/${fmt.unidad()}`
      : r?.motivo ? MOTIVOS_SIN_RENDIMIENTO[r.motivo].split(':')[0] : '';
    return {
      titulo: veh ? veh.placa : '(vehículo eliminado)',
      avatar: c.fotoId ? c.fotoId : undefined, // foto del recibo, si hay
      subtitulo: [chofer?.nombre, c.tipo, c.estacion].filter(Boolean).join(' · '),
      meta: [
        `${fmt.fecha(c.fecha)}${c.hora ? ` ${fmt.horaTexto(c.hora)}` : ''}`,
        fmt.cantidad(c.cantidad),
        `${fmt.dinero(precio)}/${fmt.unidad()}`,
        c.km != null && c.km !== '' ? `${fmt.numero(c.km)} km` : '',
        rendimiento,
        c.tanqueLleno === false ? 'Tanque parcial' : '',
      ].filter(Boolean),
      chips: `<strong class="tabular" style="font-size:var(--fs-lg)">${esc(fmt.dinero(c.monto))}</strong>`,
      extra: anomalia ? `<span class="chip chip--aviso">Consumo ${anomalia.peorPct} % más alto de lo normal</span>` : '',
      clase: anomalia ? 'item--warn' : '',
    };
  },
});
