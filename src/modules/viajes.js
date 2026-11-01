// Viajes del día: estado calculado, botones rápidos "Salió ahora" / "Llegó ahora", crear/editar/archivar.
import * as store from '../data/store.js';
import { camposDe } from '../core/esquemas.js';
import { tolerancia } from '../core/prefs.js';
import {
  aISO, fechaClave, horaClave, hoyClave, sumarDias, horaDespues, horaCercana,
  estadoViaje, sumarMinutos, minutosEntre, formatoDuracion,
} from '../core/time.js';
import * as fmt from '../core/format.js';
import { abrirFormulario } from '../core/form.js';
import { cargarRefs, porId, normalizar } from '../core/crud.js';
import { esc, icon, vacio, toast, confirmar, conCarga, escalonar } from '../core/ui.js';

const campos = camposDe('viajes');
const campoMotivo = campos.find((c) => c.clave === 'motivoRetraso');
const REFS = ['rutas', 'choferes', 'vehiculos'];

// ---------- Presentación compartida (también la usa Inicio) ----------

export function chipsEstado(e) {
  const chips = [];
  if (e.estado === 'completado') {
    chips.push('<span class="chip chip--neutro">Completado</span>');
    chips.push(`<span class="chip chip--${e.puntualidad === 'retrasado' ? 'aviso' : 'ok'}">${esc(e.etiqueta)}</span>`);
  } else if (e.estado === 'sin_llegada') chips.push(`<span class="chip chip--error">${esc(e.etiqueta)}</span>`);
  else if (e.estado === 'en_ruta') chips.push('<span class="chip chip--info">En ruta</span>');
  else chips.push(e.salidaAtrasada ? '<span class="chip chip--aviso">Salida pendiente</span>' : '<span class="chip chip--neutro">Programado</span>');
  return chips.join('');
}

export function tarjetaViaje(v, refs, ahora = new Date()) {
  const e = estadoViaje(v, ahora, tolerancia());
  const ruta = refs.rutas.get(v.rutaId);
  const chofer = refs.choferes.get(v.choferId);
  const veh = refs.vehiculos.get(v.vehiculoId);
  const cruza = fechaClave(v.llegadaProg) !== fechaClave(v.salidaProg);
  let accion = '';
  if (!v.archivado && !v.salidaReal && e.estado !== 'completado') {
    accion = `<button type="button" class="btn btn--primary" data-rapido="salio" data-id="${esc(v.id)}">${icon('depart')}Salió ahora</button>`;
  } else if (!v.archivado && v.salidaReal && !v.llegadaReal) {
    accion = `<button type="button" class="btn btn--primary" data-rapido="llego" data-id="${esc(v.id)}">${icon('flag')}Llegó ahora</button>`;
  }
  const clase = e.estado === 'sin_llegada' ? 'item--error' : e.puntualidad === 'retrasado' || e.salidaAtrasada ? 'item--warn' : '';
  return `<li class="item ${clase} ${v.archivado ? 'item--archived' : ''}">
    <button type="button" class="item__main" data-editar="${esc(v.id)}" aria-label="Editar viaje ${esc(ruta?.nombre || '')} de las ${esc(fmt.hora(v.salidaProg))}">
      <span class="item__body">
        <span class="row row--between" style="align-items:flex-start">
          <span class="item__title">${esc(ruta?.nombre ?? '(ruta eliminada)')}</span>
        </span>
        <span class="row row--wrap">${v.archivado ? '<span class="chip chip--neutro">Archivado</span>' : chipsEstado(e)}</span>
        <span class="timeline" style="margin-top:var(--sp-2)">
          <span><strong>${fmt.hora(v.salidaProg)}</strong><small>${v.salidaReal ? `Salió ${fmt.hora(v.salidaReal)}` : 'Salida'}</small></span>
          <span class="timeline__line" aria-hidden="true"></span>
          <span style="text-align:right"><strong>${fmt.hora(v.llegadaProg)}</strong><small>${v.llegadaReal ? `Llegó ${fmt.hora(v.llegadaReal)}` : cruza ? 'Llegada (día sig.)' : 'Llegada'}</small></span>
        </span>
        <span class="item__meta">
          <span>${icon('user', 'icon--sm')} ${esc(chofer?.nombre ?? '—')}</span>
          <span>${icon('truck', 'icon--sm')} ${esc(veh?.placa ?? '—')}</span>
        </span>
        ${v.motivoRetraso ? `<span class="item__subtitle">Motivo: ${esc(v.motivoRetraso)}</span>` : ''}
      </span>
    </button>
    ${accion ? `<div class="item__actions">${accion}</div>` : ''}
  </li>`;
}

export async function refsViajes() {
  const r = await cargarRefs(REFS);
  return { listas: r, rutas: porId(r.rutas), choferes: porId(r.choferes), vehiculos: porId(r.vehiculos) };
}

/** Botones rápidos. Devuelve true si cambió algo. */
export async function accionRapida(tipo, id) {
  const v = await store.get('viajes', id);
  if (!v) return false;
  const ahora = new Date().toISOString();
  if (tipo === 'salio') {
    await store.update('viajes', id, { salidaReal: ahora });
    toast(`Salida registrada: ${fmt.hora(ahora)}`);
    return true;
  }
  const act = await store.update('viajes', id, { llegadaReal: ahora });
  const e = estadoViaje(act, new Date(), tolerancia());
  if (e.puntualidad === 'retrasado') {
    toast(`Llegó con ${formatoDuracion(e.retrasoMin)} de retraso.`, 'info');
    if (campoMotivo && (campoMotivo.activo || campoMotivo.fijo)) await pedirMotivo(act, e);
  } else toast(`Llegada registrada: ${fmt.hora(ahora)} · A tiempo`);
  return true;
}

function pedirMotivo(viaje, e) {
  return new Promise((resolve) => {
    abrirFormulario({
      titulo: 'Motivo del retraso',
      antes: `<p class="muted" style="margin-bottom:var(--sp-3)">Llegó ${esc(formatoDuracion(e.retrasoMin))} tarde. Puedes dejarlo en blanco.</p>`,
      campos: [{ ...campoMotivo, etiqueta: 'Motivo (opcional)' }],
      valores: { motivoRetraso: viaje.motivoRetraso || '' },
      acciones: [{ id: 'omitir', etiqueta: 'Omitir', ejecutar: async ({ cerrar }) => cerrar() }],
      guardar: async (val) => {
        await store.update('viajes', viaje.id, { motivoRetraso: val.motivoRetraso });
      },
    }).el.addEventListener('close', () => resolve(), { once: true });
  });
}

// ---------- Formulario ----------

function aFormulario(v) {
  return {
    rutaId: v.rutaId, choferId: v.choferId, vehiculoId: v.vehiculoId,
    fecha: fechaClave(v.salidaProg),
    salidaProg: horaClave(v.salidaProg), llegadaProg: horaClave(v.llegadaProg),
    salidaReal: v.salidaReal ? horaClave(v.salidaReal) : '', llegadaReal: v.llegadaReal ? horaClave(v.llegadaReal) : '',
    motivoRetraso: v.motivoRetraso || '',
  };
}

/** Convierte los valores del formulario a instantes, resolviendo cruces de medianoche. */
export function deFormulario(f) {
  const salidaProg = aISO(f.fecha, f.salidaProg);
  const llegadaProg = horaDespues(f.llegadaProg, salidaProg);
  const salidaReal = f.salidaReal ? horaCercana(f.salidaReal, salidaProg) : null;
  const llegadaReal = f.llegadaReal ? horaCercana(f.llegadaReal, llegadaProg) : null;
  return {
    rutaId: f.rutaId, choferId: f.choferId || null, vehiculoId: f.vehiculoId || null,
    salidaProg, llegadaProg, salidaReal, llegadaReal, motivoRetraso: f.motivoRetraso || '',
  };
}

function validarViaje(f) {
  const err = {};
  if (!f.fecha || !f.salidaProg || !f.llegadaProg) return err;
  const d = deFormulario(f);
  if (minutosEntre(d.salidaProg, d.llegadaProg) === 0) err.llegadaProg = 'La llegada debe ser distinta de la salida.';
  if (f.llegadaReal && !f.salidaReal) err.salidaReal = 'Registra la salida real antes de la llegada real.';
  if (d.salidaReal && d.llegadaReal && d.llegadaReal <= d.salidaReal) err.llegadaReal = 'La llegada real debe ser después de la salida real.';
  return err;
}

export function abrirViaje(viaje, refs, { fecha, alGuardar } = {}) {
  const acciones = [];
  if (viaje) {
    acciones.push(viaje.archivado
      ? { id: 'restaurar', etiqueta: 'Restaurar', icono: 'restore', clase: 'btn--secondary', ejecutar: async ({ cerrar }) => {
          await store.update('viajes', viaje.id, { archivado: false });
          toast('Viaje restaurado.');
          await cerrar();
          alGuardar?.();
        } }
      : { id: 'archivar', etiqueta: 'Archivar', icono: 'archive', ejecutar: async ({ cerrar }) => {
          const ok = await confirmar({ titulo: '¿Archivar este viaje?', mensaje: 'No contará en Inicio ni en los reportes. Podrás restaurarlo desde “Archivados”.', confirmar: 'Archivar', peligro: true });
          if (!ok) return;
          await store.update('viajes', viaje.id, { archivado: true });
          toast('Viaje archivado.');
          await cerrar();
          alGuardar?.();
        } });
  }
  const hoja = abrirFormulario({
    titulo: viaje ? 'Editar viaje' : 'Nuevo viaje',
    campos,
    valores: viaje ? aFormulario(viaje) : { fecha: fecha || hoyClave() },
    refs: refs.listas,
    grupos: { programado: 'Horario programado', real: 'Horario real' },
    acciones,
    validarExtra: validarViaje,
    alCambiar(v, form, campo) {
      // Autocompleta la llegada programada con la duración de la ruta mientras el usuario no la toque.
      if (campo === 'llegadaProg') form.dataset.manual = '1';
      if (!['rutaId', 'salidaProg'].includes(campo) || form.dataset.manual === '1') return;
      const ruta = refs.rutas.get(v.rutaId);
      if (ruta?.duracionMin && v.salidaProg && v.fecha) {
        form.elements.llegadaProg.value = horaClave(sumarMinutos(aISO(v.fecha, v.salidaProg), ruta.duracionMin));
      }
    },
    guardar: async (f) => {
      const datos = deFormulario(f);
      if (viaje) await store.update('viajes', viaje.id, datos);
      else await store.create('viajes', datos);
      toast(viaje ? 'Viaje actualizado.' : 'Viaje creado.');
      alGuardar?.(fechaClave(datos.salidaProg));
    },
  });
  if (viaje) hoja.el.querySelector('form').dataset.manual = '1';
  return hoja;
}

// ---------- Pantalla ----------

const FILTROS = [
  ['todos', 'Todos'],
  ['pendientes', 'Pendientes'],
  ['retrasados', 'Retrasados'],
  ['completados', 'Completados'],
  ['archivados', 'Archivados'],
];

function pasaFiltro(v, e, filtro) {
  if (filtro === 'archivados') return v.archivado;
  if (v.archivado) return false;
  if (filtro === 'pendientes') return e.estado !== 'completado';
  if (filtro === 'retrasados') return e.puntualidad === 'retrasado' || e.estado === 'sin_llegada';
  if (filtro === 'completados') return e.estado === 'completado';
  return true;
}

export default {
  titulo: 'Viajes',
  pestana: 'viajes',
  async render(el, params = {}) {
    const est = { fecha: params.fecha || hoyClave(), filtro: params.filtro || 'todos', q: '' };
    el.innerHTML = `
      <div class="row" role="group" aria-label="Día">
        <button type="button" class="icon-btn" data-dia="-1" aria-label="Día anterior" style="transform:scaleX(-1)">${icon('chevron')}</button>
        <label class="grow"><span class="sr-only">Fecha</span><input class="input" type="date" data-fecha value="${est.fecha}"></label>
        <button type="button" class="icon-btn" data-dia="1" aria-label="Día siguiente">${icon('chevron')}</button>
      </div>
      <div class="search">${icon('search')}<label class="sr-only" for="buscar-viajes">Buscar</label>
        <input class="input" id="buscar-viajes" type="search" placeholder="Buscar ruta, chofer o placa…" autocomplete="off"></div>
      <div class="filters" role="group" aria-label="Filtro">${FILTROS.map(([k, t]) => `<button type="button" class="filter" data-filtro="${k}" aria-pressed="${k === est.filtro}">${t}</button>`).join('')}</div>
      <div class="day-head" data-titulo></div>
      <ul class="list" data-lista aria-live="polite"></ul>
      <button type="button" class="btn btn--primary fab" data-nuevo>${icon('plus')}Nuevo viaje</button>`;

    const lista = el.querySelector('[data-lista]');
    let refs = null;
    let viajes = [];

    const pintar = (animar = false) => {
      const ahora = new Date();
      const q = normalizar(est.q);
      const delDia = viajes
        .filter((v) => fechaClave(v.salidaProg) === est.fecha)
        .sort((a, b) => a.salidaProg.localeCompare(b.salidaProg));
      const visibles = delDia.filter((v) => {
        if (!pasaFiltro(v, estadoViaje(v, ahora, tolerancia()), est.filtro)) return false;
        if (!q) return true;
        const t = [refs.rutas.get(v.rutaId)?.nombre, refs.choferes.get(v.choferId)?.nombre, refs.vehiculos.get(v.vehiculoId)?.placa].join(' ');
        return normalizar(t).includes(q);
      });
      const hoy = hoyClave();
      const etiquetaDia = est.fecha === hoy ? 'Hoy' : est.fecha === sumarDias(hoy, -1) ? 'Ayer' : est.fecha === sumarDias(hoy, 1) ? 'Mañana' : '';
      const activos = delDia.filter((v) => !v.archivado).length;
      const titulo = `${etiquetaDia ? `${etiquetaDia} · ` : ''}${fmt.fechaLarga(est.fecha)} · ${fmt.plural(activos, 'viaje', 'viajes')}`;
      el.querySelector('[data-titulo]').textContent = titulo[0].toUpperCase() + titulo.slice(1);
      if (!visibles.length) {
        lista.innerHTML = `<li>${
          q || est.filtro !== 'todos'
            ? vacio({ icono: 'search', titulo: 'Sin viajes en este filtro', texto: 'Prueba con “Todos” o cambia la búsqueda.' })
            : vacio({ icono: 'bus', titulo: 'No hay viajes este día', texto: 'Toca “Nuevo viaje” para programar uno.' })
        }</li>`;
        return;
      }
      lista.innerHTML = visibles.map((v) => tarjetaViaje(v, refs, ahora)).join('');
      if (animar) escalonar(lista);
    };

    const cargar = async (animar) => {
      const [r, todos] = await conCarga(lista, Promise.all([refsViajes(), store.list('viajes', { archivados: 'todos' })]));
      refs = r;
      viajes = todos;
      pintar(animar);
    };

    const cambiarFecha = (f) => {
      est.fecha = f;
      el.querySelector('[data-fecha]').value = f;
      history.replaceState(null, '', `#/viajes?fecha=${f}`);
      pintar(true);
    };

    el.addEventListener('change', (e) => {
      if (e.target.matches('[data-fecha]') && e.target.value) cambiarFecha(e.target.value);
    });
    el.addEventListener('input', (e) => {
      if (e.target.id === 'buscar-viajes') {
        est.q = e.target.value;
        pintar();
      }
    });
    el.addEventListener('click', async (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.dia) return cambiarFecha(sumarDias(est.fecha, Number(b.dataset.dia)));
      if (b.dataset.filtro) {
        est.filtro = b.dataset.filtro;
        el.querySelectorAll('[data-filtro]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        return pintar(true);
      }
      if (b.dataset.rapido) {
        b.disabled = true;
        try {
          if (await accionRapida(b.dataset.rapido, b.dataset.id)) await cargar();
        } finally {
          b.disabled = false;
        }
        return;
      }
      if (b.hasAttribute('data-nuevo')) {
        return abrirViaje(null, refs, { fecha: est.fecha, alGuardar: async (f) => { await cargar(); if (f && f !== est.fecha) cambiarFecha(f); } });
      }
      if (b.dataset.editar) abrirViaje(viajes.find((v) => v.id === b.dataset.editar), refs, { alGuardar: () => cargar() });
    });

    await cargar(true);
    if (params.nuevo === '1') abrirViaje(null, refs, { fecha: est.fecha, alGuardar: () => cargar() });

    // Los estados dependen de la hora: repintar cada minuto mientras la pantalla esté abierta.
    const reloj = setInterval(() => pintar(), 60000);
    return () => clearInterval(reloj);
  },
};

