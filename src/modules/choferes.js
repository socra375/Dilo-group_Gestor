// Choferes + registro de turnos (entrada/salida por día).
import * as store from '../data/store.js';
import { camposDe, PARAMETROS } from '../core/esquemas.js';
import { pantallaCrud, chipSeleccion } from '../core/crud.js';
import { hoyClave, estadoLicencia, fechaClave, horaClave, aISO, horaDespues, minutosEntre, formatoDuracion } from '../core/time.js';
import * as fmt from '../core/format.js';
import { esc, icon, toast, abrirHoja, vacio } from '../core/ui.js';
import { abrirFormulario } from '../core/form.js';

const campoEstado = camposDe('choferes').find((c) => c.clave === 'estado');
const camposTurno = camposDe('turnos');

export function avisoLicencia(chofer, hoy = hoyClave()) {
  const l = estadoLicencia(chofer.licenciaVence, hoy);
  if (l.estado === 'vencida') return { tono: 'error', texto: `Licencia vencida hace ${fmt.plural(-l.dias, 'día', 'días')}` };
  if (l.estado === 'por_vencer') return { tono: 'aviso', texto: l.dias === 0 ? 'Licencia vence hoy' : `Licencia vence en ${fmt.plural(l.dias, 'día', 'días')}` };
  return null;
}

/** Turno abierto (sin salida) más reciente de un chofer. */
export function turnoAbierto(turnos, choferId) {
  return turnos
    .filter((t) => t.choferId === choferId && !t.salida && !t.archivado)
    .sort((a, b) => b.entrada.localeCompare(a.entrada))[0] ?? null;
}

export const turnoLargo = (t, ahora = new Date()) => minutosEntre(t.entrada, ahora.toISOString()) > PARAMETROS.horasTurnoLargo * 60;

// ---------- Turnos ----------

function abrirFormTurno(chofer, turno, alGuardar) {
  abrirFormulario({
    titulo: turno ? 'Corregir turno' : `Agregar turno · ${chofer.nombre}`,
    campos: camposTurno.map((c) => (['entrada', 'salida'].includes(c.clave) ? { ...c, grupo: 'horas' } : c)),
    valores: turno
      ? { fecha: turno.fecha, entrada: horaClave(turno.entrada), salida: turno.salida ? horaClave(turno.salida) : '' }
      : { fecha: hoyClave() },
    acciones: turno
      ? [{ id: 'archivar', etiqueta: 'Archivar', icono: 'archive', ejecutar: async ({ cerrar }) => {
          await store.update('turnos', turno.id, { archivado: true });
          toast('Turno archivado.');
          await cerrar();
          alGuardar();
        } }]
      : [],
    guardar: async (v) => {
      const entrada = aISO(v.fecha, v.entrada);
      const datos = { choferId: chofer.id, fecha: v.fecha, entrada, salida: v.salida ? horaDespues(v.salida, entrada) : null };
      if (datos.salida && datos.salida === entrada) throw { errores: { salida: 'La salida debe ser distinta de la entrada.' } };
      if (turno) await store.update('turnos', turno.id, datos);
      else await store.create('turnos', datos);
      toast('Turno guardado.');
      alGuardar();
    },
  });
}

async function abrirTurnos(chofer, alCambiar) {
  const hoja = abrirHoja({
    titulo: `Turnos · ${chofer.nombre.split(' ').slice(0, 2).join(' ')}`,
    contenido: '<ul class="list" data-turnos></ul>',
    pie: `<button type="button" class="btn btn--secondary" data-agregar>${icon('plus')}Agregar turno</button>`,
  });
  const ul = hoja.el.querySelector('[data-turnos]');
  let turnos = [];
  const pintar = async () => {
    turnos = (await store.list('turnos'))
      .filter((t) => t.choferId === chofer.id)
      .sort((a, b) => b.entrada.localeCompare(a.entrada))
      .slice(0, 30);
    if (!turnos.length) {
      ul.innerHTML = `<li>${vacio({ icono: 'clock', titulo: 'Sin turnos registrados', texto: 'Usa “Marcar entrada” en la lista de choferes o agrega uno aquí.' })}</li>`;
      return;
    }
    ul.innerHTML = turnos
      .map((t) => {
        const dur = t.salida ? formatoDuracion(minutosEntre(t.entrada, t.salida)) : 'En turno';
        const cruza = t.salida && fechaClave(t.salida) !== fechaClave(t.entrada);
        return `<li class="item"><button type="button" class="item__main" data-turno="${esc(t.id)}">
          <span class="item__body">
            <span class="item__title">${esc(fmt.fecha(t.fecha))}</span>
            <span class="item__meta tabular"><span>${icon('login', 'icon--sm')} ${fmt.hora(t.entrada)}</span><span>${icon('logout', 'icon--sm')} ${t.salida ? fmt.hora(t.salida) + (cruza ? ' (día sig.)' : '') : '—'}</span></span>
          </span>
          <span class="item__aside"><span class="chip ${t.salida ? 'chip--neutro chip--plain' : 'chip--info'}">${esc(dur)}</span></span>
        </button></li>`;
      })
      .join('');
  };
  const refrescar = async () => {
    await pintar();
    alCambiar();
  };
  hoja.el.addEventListener('click', (e) => {
    const t = e.target.closest('[data-turno]');
    if (t) abrirFormTurno(chofer, turnos.find((x) => x.id === t.dataset.turno), refrescar);
    if (e.target.closest('[data-agregar]')) abrirFormTurno(chofer, null, refrescar);
  });
  await pintar();
}

// ---------- Pantalla ----------

export default pantallaCrud({
  modulo: 'choferes',
  titulo: 'Choferes',
  pestana: 'choferes',
  icono: 'user',
  refsDe: ['turnos'],
  ordenar: (a, b) => a.nombre.localeCompare(b.nombre, 'es'),
  describir(c, refs) {
    const aviso = avisoLicencia(c);
    const abierto = turnoAbierto(refs.turnos || [], c.id);
    const extras = [];
    if (abierto) {
      const largo = turnoLargo(abierto);
      extras.push(`<span class="chip chip--${largo ? 'aviso' : 'info'}">En turno desde ${esc(fmt.hora(abierto.entrada))}${largo ? ` · ${esc(formatoDuracion(minutosEntre(abierto.entrada, new Date().toISOString())))}` : ''}</span>`);
    }
    if (aviso) extras.push(`<span class="chip chip--${aviso.tono}">${esc(aviso.texto)}</span>`);
    return {
      titulo: c.nombre,
      subtitulo: fmt.telefono(c.telefono),
      meta: c.licenciaVence && !aviso ? [`Licencia vence ${fmt.fechaNum(c.licenciaVence)}`] : [],
      chips: campoEstado ? chipSeleccion(campoEstado, c.estado) : '',
      extra: extras.join(''),
      clase: aviso ? `item--${aviso.tono === 'error' ? 'error' : 'warn'}` : '',
    };
  },
  accionesItem(c, refs) {
    const abierto = turnoAbierto(refs.turnos || [], c.id);
    const turno = abierto
      ? `<button type="button" class="btn btn--secondary btn--sm" data-accion="salida" data-id="${esc(c.id)}">${icon('logout', 'icon--sm')}Marcar salida</button>`
      : `<button type="button" class="btn btn--primary btn--sm" data-accion="entrada" data-id="${esc(c.id)}">${icon('login', 'icon--sm')}Marcar entrada</button>`;
    const llamar = c.telefono ? `<a class="icon-btn" href="tel:+1${esc(c.telefono)}" aria-label="Llamar a ${esc(c.nombre)}" style="color:var(--c-primary)">${icon('phone')}</a>` : '';
    return `${turno}<button type="button" class="btn btn--ghost btn--sm" data-accion="turnos" data-id="${esc(c.id)}">${icon('clock', 'icon--sm')}Turnos</button>${llamar}`;
  },
  async alAccion(accion, chofer, { refs, recargar }) {
    if (accion === 'turnos') return abrirTurnos(chofer, recargar);
    const ahora = new Date().toISOString();
    if (accion === 'entrada') {
      await store.create('turnos', { choferId: chofer.id, fecha: hoyClave(), entrada: ahora, salida: null });
      toast(`Entrada marcada: ${fmt.hora(ahora)}`);
    } else {
      const t = turnoAbierto(refs.turnos, chofer.id);
      if (!t) return recargar();
      await store.update('turnos', t.id, { salida: ahora });
      toast(`Salida marcada · turno de ${formatoDuracion(minutosEntre(t.entrada, ahora))}`);
    }
    await recargar();
  },
});
