// Inicio ("Resumen con números"): encabezado con empresa y fecha, 4 tarjetas, avisos, gráfica de retrasos
// por día y lista de los viajes de hoy.
import * as store from '../data/store.js';
import { CONFIG } from '../config.js';
import { PARAMETROS } from '../core/esquemas.js';
import { pref, tolerancia } from '../core/prefs.js';
import { hoyClave, fechaClave, estadoViaje, diasEntre } from '../core/time.js';
import { calcularAvisos } from '../core/avisos.js';
import { retrasosPorDia } from '../core/agregados.js';
import { graficaRetrasosHTML, activarGrafica } from '../core/grafica.js';
import * as fmt from '../core/format.js';
import { esc, icon, vacio, animarContador, escalonar, conCarga, abrirHoja } from '../core/ui.js';
import { tarjetaViaje, refsViajes, abrirRegistro, abrirViaje } from './viajes.js';
import { escalonarHijos } from '../core/movimiento.js';

const cap = (t) => t.replace(/^./, (c) => c.toUpperCase());

function calcular({ viajes, combustible, choferes, refs }) {
  const ahora = new Date();
  const hoy = hoyClave();
  const tol = tolerancia();
  const activos = viajes.filter((v) => !v.archivado);
  const deHoy = activos
    .filter((v) => fechaClave(v.salidaProg) === hoy)
    .sort((a, b) => a.salidaProg.localeCompare(b.salidaProg));
  const estados = deHoy.map((v) => estadoViaje(v, ahora, tol));
  const cargasHoy = combustible.filter((c) => !c.archivado && c.fecha === hoy);
  const galones = cargasHoy.reduce((s, c) => s + (Number(c.cantidad) || 0), 0);

  const totales = {
    viajes: { valor: deHoy.length, nota: fmt.plural(estados.filter((e) => e.estado === 'completado').length, 'completado', 'completados'), progreso: deHoy.length ? estados.filter((e) => e.estado === 'completado').length / deHoy.length : 0 },
    retrasos: { valor: estados.filter((e) => e.puntualidad === 'retrasado').length, nota: `de ${fmt.plural(estados.filter((e) => e.estado === 'completado').length, 'llegado', 'llegados')}` },
    combustible: { valor: Math.round(galones * 10) / 10, decimales: 1, nota: `${fmt.dinero(cargasHoy.reduce((s, c) => s + (Number(c.monto) || 0), 0))} · ${fmt.plural(cargasHoy.length, 'carga', 'cargas')}` },
    // SUPUESTO: "activo" = no archivado (el cuestionario no pide un estado para los choferes).
    choferes: { valor: choferes.filter((c) => !c.archivado).length, nota: 'no archivados' },
  };

  const avisos = calcularAvisos({ viajes, choferes, combustible, vehiculos: refs.listas.vehiculos, rutas: refs.listas.rutas }, { hoy, ahora, tolerancia: tol })
    .map((a) => ({ severidad: a.severidad, titulo: a.titulo, texto: a.texto, href: a.href }));
  // SUPUESTO: recordatorio de respaldo mientras los datos vivan solo en este teléfono (en la nube no hace falta).
  const hayDatos = [viajes, combustible, choferes].some((l) => l.length);
  const ultimo = pref('ultimoRespaldo');
  const dias = ultimo ? diasEntre(fechaClave(ultimo), hoy) : null;
  if (!store.nubeActiva() && hayDatos && (dias === null || dias > PARAMETROS.diasAvisoRespaldo)) {
    avisos.push({ severidad: 'atencion', icono: 'shield', titulo: 'Haz un respaldo de tus datos', texto: dias === null ? 'Aún no has exportado ningún respaldo.' : `El último fue hace ${fmt.plural(dias, 'día', 'días')}.`, href: '#/ajustes' });
  }

  return { totales, avisos, deHoy, hoy, retrasosDia: retrasosPorDia(activos, { hoy, dias: 7, tolerancia: tol, ahora }) };
}

const filaAviso = (a) => `<li><a class="aviso aviso--${a.severidad}" href="${esc(a.href)}">
    ${icon(a.icono || 'alert')}
    <span class="aviso__cuerpo"><span class="aviso__nivel">${a.severidad === 'urgente' ? 'Urgente' : 'Atención'}</span><span class="aviso__titulo">${esc(a.titulo)}</span><span class="aviso__texto">${esc(a.texto)}</span></span>${icon('chevron', 'icon--sm')}</a></li>`;

function tarjetas(t) {
  const defs = [
    { id: 'viajes', etiqueta: 'Viajes de hoy', clase: 'stat--hero' },
    { id: 'retrasos', etiqueta: 'Retrasos de hoy', clase: t.retrasos.valor > 0 ? 'stat--error' : '' },
    { id: 'combustible', etiqueta: 'Combustible de hoy', unidad: fmt.unidad('larga') },
    { id: 'choferes', etiqueta: 'Choferes activos' },
  ];
  return `<section class="section" aria-label="Resumen de hoy"><div class="stats stats--4">${defs
    .map((d) => `<div class="stat ${d.clase || ''}">
        <span class="stat__label">${esc(d.etiqueta)}</span>
        <span class="stat__value tabular" data-contador="${d.id}">${fmt.numero(t[d.id].valor, t[d.id].decimales || 0)}</span>
        <span class="stat__note">${d.unidad ? `${esc(d.unidad)} · ` : ''}${esc(t[d.id].nota)}</span>${d.id === 'viajes' && t.viajes.valor > 0 ? `<span class="stat__barra" aria-hidden="true"><span style="--p:${Math.round(t.viajes.progreso * 100)}%"></span></span>` : ''}</div>`)
    .join('')}</div></section>`;
}

function bloqueAvisos(avisos) {
  const urgentes = avisos.filter((a) => a.severidad === 'urgente').length;
  const visibles = avisos.slice(0, PARAMETROS.avisosEnInicio);
  return `<section class="card section bento-avisos" aria-labelledby="t-avisos">
    <div class="section__head"><h2 class="section__title" id="t-avisos">Avisos</h2>
      ${avisos.length ? `<span class="muted">${urgentes ? `${urgentes} urgente${urgentes === 1 ? '' : 's'} · ` : ''}${avisos.length} en total</span>` : ''}</div>
    ${avisos.length
      ? `<ul class="list" data-avisos>${visibles.map(filaAviso).join('')}</ul>
         ${avisos.length > visibles.length ? `<button type="button" class="btn btn--secondary btn--block" data-ver-avisos>Ver todos (${avisos.length})</button>` : ''}`
      : vacio({ icono: 'check', titulo: 'Todo en orden', texto: 'No hay avisos: ni retrasos, ni vencimientos, ni mantenimientos pendientes.' })}
  </section>`;
}

/**
 * Guía para la primera vez (la app arranca vacía): qué agregar y en qué orden. Desaparece cuando ya hay al menos un
 * vehículo, un chofer y una ruta con horarios. Cada paso lleva a su pantalla.
 */
export function pasosIniciales({ vehiculos, choferes, rutas, viajes }) {
  const pasos = [
    { id: 'vehiculos', hecho: vehiculos.length > 0, titulo: 'Agrega tus vehículos', texto: 'Placa, seguro y próximo mantenimiento (de ahí salen los avisos).', href: '#/vehiculos', icono: 'truck' },
    { id: 'choferes', hecho: choferes.length > 0, titulo: 'Registra a tus choferes', texto: 'Nombre, teléfono, licencia y su vehículo asignado.', href: '#/choferes', icono: 'user' },
    { id: 'rutas', hecho: rutas.some((r) => r.horarios?.length), titulo: 'Crea tus rutas con sus horarios', texto: 'Con los horarios fijos de salida se generan los viajes del día.', href: '#/rutas', icono: 'route' },
  ];
  if (CONFIG.viajes.generar_desde_horarios) {
    pasos.push({ id: 'viajes', hecho: viajes.length > 0, titulo: 'Genera los viajes de hoy', texto: 'En Viajes, con un toque, a partir de los horarios de las rutas.', href: '#/viajes', icono: 'calendar', opcional: true });
  }
  return pasos;
}

function bloquePasos(pasos) {
  const obligatorios = pasos.filter((p) => !p.opcional);
  if (obligatorios.every((p) => p.hecho)) return '';
  const hechos = obligatorios.filter((p) => p.hecho).length;
  return `<section class="card section" aria-labelledby="t-pasos" data-pasos>
    <div class="section__head"><h2 class="section__title" id="t-pasos">Primeros pasos</h2><span class="muted">${hechos} de ${obligatorios.length}</span></div>
    <p class="muted">Aquí todavía no hay datos. Agrega los tuyos en este orden y la pantalla de Inicio se llena sola.</p>
    <ol class="pasos">${pasos.map((p, i) => `<li><a class="paso ${p.hecho ? 'paso--hecho' : ''}" href="${esc(p.href)}" data-paso="${p.id}">
        <span class="paso__marca" aria-hidden="true">${p.hecho ? icon('check', 'icon--sm') : i + 1}</span>
        <span class="paso__cuerpo"><span class="paso__titulo">${esc(p.titulo)}${p.hecho ? '<span class="sr-only"> (hecho)</span>' : ''}</span><span class="paso__texto">${esc(p.texto)}</span></span>${icon('chevron', 'icon--sm')}</a></li>`).join('')}</ol>
  </section>`;
}

export default {
  titulo: CONFIG.empresa.nombre,
  pestana: 'inicio',
  // Encabezado de Inicio: la empresa como título y la fecha de hoy arriba.
  supratitulo: () => cap(fmt.fechaLarga(hoyClave())),
  async render(el) {
    el.classList.add('view--ancha');
    el.innerHTML = '<div data-cuerpo></div>';
    const cuerpo = el.querySelector('[data-cuerpo]');
    let ultimos = { viajes: [], refs: null, avisos: [] };

    const pintar = async (animar) => {
      const [viajes, combustible, choferes, refs] = await conCarga(
        cuerpo,
        Promise.all([store.list('viajes', { archivados: 'todos' }), store.list('combustible'), store.list('choferes'), refsViajes()]),
        3,
      );
      const d = calcular({ viajes, combustible, choferes, refs });
      ultimos = { viajes, refs, avisos: d.avisos };

      cuerpo.innerHTML = `<div class="view view--bento">
        ${bloquePasos(pasosIniciales({ vehiculos: refs.listas.vehiculos, choferes, rutas: refs.listas.rutas, viajes }))}
        ${tarjetas(d.totales)}
        ${bloqueAvisos(d.avisos)}
        <section class="card section bento-graf" aria-label="Retrasos por día">${graficaRetrasosHTML(d.retrasosDia, { titulo: 'Retrasos por día', id: 'retrasos-dia' })}</section>
        <section class="section" aria-labelledby="t-hoy">
          <div class="section__head"><h2 class="section__title" id="t-hoy">Viajes de hoy</h2><a href="#/viajes">Ver todos</a></div>
          ${d.deHoy.length
            ? `<ul class="list" data-lista>${d.deHoy.map((v) => tarjetaViaje(v, refs)).join('')}</ul>`
            : vacio({
                icono: 'bus',
                titulo: 'No hay viajes programados hoy',
                texto: CONFIG.viajes.generar_desde_horarios ? 'Genera los viajes del día desde los horarios fijos de las rutas.' : 'Programa el primero para empezar el día.',
                accion: `<a class="btn btn--primary" href="#/viajes">${icon('calendar')}Ir a Viajes</a>`,
              })}
        </section>
      </div>`;

      activarGrafica(cuerpo, d.retrasosDia);
      if (animar) {
        escalonarHijos(cuerpo.firstElementChild); // las tarjetas de Inicio entran una tras otra
        for (const id of ['viajes', 'retrasos', 'combustible', 'choferes']) {
          const n = cuerpo.querySelector(`[data-contador="${id}"]`);
          const dec = d.totales[id].decimales || 0;
          animarContador(n, d.totales[id].valor, (x) => fmt.numero(x, dec));
        }
      }
      if (animar) {
        const l = cuerpo.querySelector('[data-lista]');
        if (l) escalonar(l);
      }
    };

    cuerpo.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.hasAttribute('data-ver-avisos')) {
        abrirHoja({
          titulo: `Todos los avisos (${ultimos.avisos.length})`,
          contenido: `<ul class="list">${ultimos.avisos.map(filaAviso).join('')}</ul>`,
        });
      } else if (b.dataset.registrar) {
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
