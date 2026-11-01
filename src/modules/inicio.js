// Inicio: totales del día, avisos y viajes de hoy.
import * as store from '../data/store.js';
import { CONFIG } from '../config.js';
import { PARAMETROS } from '../core/esquemas.js';
import { pref, tolerancia } from '../core/prefs.js';
import { hoyClave, sumarDias, fechaClave, estadoViaje, diasEntre } from '../core/time.js';
import * as fmt from '../core/format.js';
import { esc, icon, vacio, animarContador, escalonar, conCarga } from '../core/ui.js';
import { tarjetaViaje, refsViajes, abrirRegistro, abrirViaje } from './viajes.js';
import { calcularAvisos } from '../core/avisos.js';

let contadoresAnimados = false;

// Provisional: la fase 5 rehace Inicio como "Resumen con números" (4 tarjetas, avisos y gráfica).
const INICIO = {
  bloques: [{ id: 'totales', activo: true }, { id: 'avisos', activo: true }, { id: 'viajesHoy', activo: true }],
  totales: [
    { id: 'viajes', etiqueta: 'Viajes hoy', activo: true },
    { id: 'retrasos', etiqueta: 'Retrasos', activo: true },
    { id: 'combustible', etiqueta: 'Combustible', activo: true },
  ],
  avisos: { sinLlegada: true, salidaPendiente: true, licencias: CONFIG.avisos.licencia.activo, turnoLargo: true, respaldo: true },
};

function saludo() {
  const h = Number(new Intl.DateTimeFormat('en-US', { timeZone: CONFIG.empresa.zona, hour: 'numeric', hourCycle: 'h23' }).format(new Date()));
  return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
}

function calcular({ viajes, combustible, choferes, refs }) {
  const ahora = new Date();
  const hoy = hoyClave();
  const tol = tolerancia();
  const activos = viajes.filter((v) => !v.archivado);
  const conEstado = activos.map((v) => ({ v, e: estadoViaje(v, ahora, tol) }));
  const deHoy = conEstado.filter(({ v }) => fechaClave(v.salidaProg) === hoy);
  const cargasHoy = combustible.filter((c) => !c.archivado && c.fecha === hoy);

  const totales = {
    viajes: { valor: deHoy.length, nota: `${deHoy.filter(({ e }) => e.estado === 'completado').length} completados` },
    retrasos: {
      valor: deHoy.filter(({ e }) => e.puntualidad === 'retrasado').length,
      nota: `de ${deHoy.filter(({ e }) => e.estado === 'completado').length} llegados`,
    },
    combustible: {
      valor: cargasHoy.reduce((s, c) => s + (c.monto || 0), 0),
      nota: fmt.cantidad(Math.round(cargasHoy.reduce((s, c) => s + (c.cantidad || 0), 0) * 10) / 10),
      dinero: true,
    },
  };

  // Los 5 avisos del cliente (viaje retrasado, licencia, seguro, mantenimiento, combustible alto).
  const avisos = calcularAvisos({ viajes, choferes, combustible, vehiculos: refs.listas.vehiculos, rutas: refs.listas.rutas }, { hoy, ahora, tolerancia: tol })
    .map((a) => ({ tono: a.severidad === 'urgente' ? 'error' : 'aviso', titulo: a.titulo, texto: a.texto, href: a.href }));
  // SUPUESTO: recordatorio de respaldo mientras los datos vivan solo en este teléfono.
  const reales = [viajes, combustible, choferes].some((l) => l.some((x) => !x.ejemplo));
  const ultimo = pref('ultimoRespaldo');
  const dias = ultimo ? diasEntre(fechaClave(ultimo), hoy) : null;
  if (reales && (dias === null || dias > PARAMETROS.diasAvisoRespaldo)) {
    avisos.push({ tono: 'info', titulo: 'Haz un respaldo de tus datos', texto: dias === null ? 'Aún no has exportado ningún respaldo.' : `El último fue hace ${fmt.plural(dias, 'día', 'días')}.`, href: '#/ajustes' });
  }

  const orden = { sin_llegada: 0, en_ruta: 1, programado: 2, completado: 3 };
  const pendientes = deHoy
    .filter(({ e }) => e.estado !== 'completado')
    .sort((a, b) => orden[a.e.estado] - orden[b.e.estado] || a.v.salidaProg.localeCompare(b.v.salidaProg))
    .map(({ v }) => v);
  // Viajes nocturnos de ayer aún abiertos también se muestran.
  const deAyer = conEstado.filter(({ v, e }) => fechaClave(v.salidaProg) === sumarDias(hoy, -1) && e.estado !== 'completado').map(({ v }) => v);
  return { totales, avisos, pendientes: [...deAyer, ...pendientes], totalHoy: deHoy.length, hoy };
}

const ALERTA_ICONO = { error: 'alert', aviso: 'alert', info: 'shield' };

export default {
  titulo: 'Inicio',
  pestana: 'inicio',
  async render(el) {
    el.innerHTML = '<div data-cuerpo></div>';
    const cuerpo = el.querySelector('[data-cuerpo]');

    let ultimos = { viajes: [], refs: null };
    const pintar = async (animar) => {
      const [viajes, combustible, choferes, turnos, refs] = await conCarga(
        cuerpo,
        Promise.all([
          store.list('viajes', { archivados: 'todos' }), store.list('combustible'), store.list('choferes'), store.list('turnos'), refsViajes(),
        ]),
        3,
      );
      ultimos = { viajes, refs };
      const d = calcular({ viajes, combustible, choferes, refs });
      const bloques = {
        totales: () => `<section class="section" aria-label="Totales del día"><div class="stats">${INICIO.totales
          .filter((t) => t.activo)
          .map((t, i) => `<div class="stat ${i === 0 ? 'stat--hero' : ''} ${t.id === 'retrasos' && d.totales.retrasos.valor ? 'stat--warn' : ''}">
              <span class="stat__label">${esc(t.etiqueta)}</span>
              <span class="stat__value ${d.totales[t.id].dinero ? 'stat__value--sm' : ''}" data-contador="${t.id}">${d.totales[t.id].dinero ? fmt.dineroCorto(d.totales[t.id].valor) : d.totales[t.id].valor}</span>
              <span class="stat__note">${esc(d.totales[t.id].nota)}</span></div>`)
          .join('')}</div></section>`,
        avisos: () => (d.avisos.length
          ? `<section class="section" aria-labelledby="t-avisos"><div class="section__head"><h2 class="section__title" id="t-avisos">Avisos</h2><span class="muted">${d.avisos.length}</span></div>
              <ul class="list" data-avisos>${d.avisos.map((a) => `<li><a class="alert alert--${a.tono === 'aviso' ? 'warn' : a.tono}" href="${a.href}" style="text-decoration:none">${icon(ALERTA_ICONO[a.tono])}<span class="alert__body"><span class="alert__title">${esc(a.titulo)}</span><span class="alert__text">${esc(a.texto)}</span></span>${icon('chevron', 'icon--sm')}</a></li>`).join('')}</ul></section>`
          : ''),
        viajesHoy: () => `<section class="section" aria-labelledby="t-hoy">
            <div class="section__head"><h2 class="section__title" id="t-hoy">Viajes pendientes</h2><a href="#/viajes">Ver los ${d.totalHoy} de hoy</a></div>
            ${d.pendientes.length
              ? `<ul class="list" data-lista>${d.pendientes.map((v) => tarjetaViaje(v, refs)).join('')}</ul>`
              : vacio({
                  icono: d.totalHoy ? 'check' : 'bus',
                  titulo: d.totalHoy ? 'Todo completado por hoy' : 'No hay viajes programados hoy',
                  texto: d.totalHoy ? 'Todos los viajes de hoy tienen llegada registrada.' : 'Programa el primero para empezar el día.',
                  accion: `<a class="btn btn--primary" href="#/viajes?nuevo=1">${icon('plus')}Programar viaje</a>`,
                })}
          </section>`,
      };
      cuerpo.innerHTML = `<div class="view">
          <div><p class="muted" style="font-weight:700">${esc(saludo())}</p><p style="font-family:var(--font-display);font-size:var(--fs-xl);font-weight:700">${esc(fmt.fechaLarga(d.hoy).replace(/^./, (c) => c.toUpperCase()))}</p></div>
          ${INICIO.bloques.filter((b) => b.activo && bloques[b.id]).map((b) => bloques[b.id]()).join('')}
        </div>`;

      if (animar && !contadoresAnimados) {
        contadoresAnimados = true;
        for (const t of INICIO.totales.filter((x) => x.activo)) {
          const n = cuerpo.querySelector(`[data-contador="${t.id}"]`);
          animarContador(n, d.totales[t.id].valor, d.totales[t.id].dinero ? fmt.dineroCorto : (x) => String(Math.round(x)));
        }
      }
      if (animar) {
        const l = cuerpo.querySelector('[data-lista]');
        if (l) escalonar(l);
      }
    };

    cuerpo.addEventListener('click', async (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.registrar) {
        abrirRegistro(b.dataset.registrar, ultimos.viajes.find((v) => v.id === b.dataset.id), ultimos.refs, { alGuardar: () => pintar(false) });
      } else if (b.dataset.editar) {
        abrirViaje(ultimos.viajes.find((v) => v.id === b.dataset.editar), ultimos.refs, { alGuardar: () => pintar(false) });
      }
    });

    await pintar(true);
    const reloj = setInterval(() => pintar(false), 60000);
    return () => clearInterval(reloj);
  },
};
