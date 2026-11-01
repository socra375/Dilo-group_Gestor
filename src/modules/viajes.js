// Viajes del día: estado calculado (retraso por la LLEGADA), hora real escrita a mano con atajo "Ahora",
// motivo obligatorio si queda Retrasado, generación desde los horarios fijos de las rutas.
import * as store from '../data/store.js';
import { CONFIG } from '../config.js';
import { camposDe } from '../core/esquemas.js';
import { tolerancia } from '../core/prefs.js';
import {
  aISO, fechaClave, horaClave, hoyClave, sumarDias, horaDespues, horaCercana,
  estadoViaje, sumarMinutos, minutosEntre, formatoDuracion, viajesDesdeHorarios,
} from '../core/time.js';
import * as fmt from '../core/format.js';
import { abrirFormulario } from '../core/form.js';
import { cargarRefs, porId, normalizar } from '../core/crud.js';
import { esc, icon, vacio, toast, confirmar, conCarga, escalonar } from '../core/ui.js';

const campos = camposDe('viajes');
const REFS = ['rutas', 'choferes', 'vehiculos'];
// 'obligatorio_si_retraso': el motivo aparece y se exige cuando el viaje queda Retrasado.
// Cualquier otro valor: aparece cuando hay retraso, pero es opcional.
const MOTIVO_OBLIGATORIO = CONFIG.viajes.motivo === 'obligatorio_si_retraso';

// ---------- Presentación compartida (también la usa Inicio) ----------

/** Chips de estado con los colores pedidos: A tiempo verde, Retrasado rojo, En ruta azul, Programado gris. */
export function chipsEstado(e) {
  if (e.estado === 'completado') {
    return e.puntualidad === 'retrasado'
      ? `<span class="chip chip--error">${esc(e.etiqueta)}</span>`
      : '<span class="chip chip--ok">A tiempo</span>';
  }
  if (e.estado === 'sin_llegada') return `<span class="chip chip--aviso">${esc(e.etiqueta)}</span>`;
  if (e.estado === 'en_ruta') return '<span class="chip chip--info">En ruta</span>';
  return `<span class="chip chip--neutro">Programado</span>${e.salidaAtrasada ? '<span class="chip chip--aviso chip--plain">Salida pendiente</span>' : ''}`;
}

const conSigno = (min) => (min > 0 ? `+${formatoDuracion(min)}` : min < 0 ? `−${formatoDuracion(-min)}` : 'a la hora');

export function tarjetaViaje(v, refs, ahora = new Date()) {
  const e = estadoViaje(v, ahora, tolerancia());
  const ruta = refs.rutas.get(v.rutaId);
  const chofer = refs.choferes.get(v.choferId);
  const veh = refs.vehiculos.get(v.vehiculoId);
  const cruza = fechaClave(v.llegadaProg) !== fechaClave(v.salidaProg);
  let accion = '';
  if (!v.archivado && !v.salidaReal && e.estado !== 'completado') {
    accion = `<button type="button" class="btn btn--primary" data-registrar="salida" data-id="${esc(v.id)}">${icon('depart')}Registrar salida</button>`;
  } else if (!v.archivado && v.salidaReal && !v.llegadaReal) {
    accion = `<button type="button" class="btn btn--primary" data-registrar="llegada" data-id="${esc(v.id)}">${icon('flag')}Registrar llegada</button>`;
  }
  const clase = e.puntualidad === 'retrasado' ? 'item--error' : e.estado === 'sin_llegada' || e.salidaAtrasada ? 'item--warn' : '';
  const sinAsignar = (texto) => `<span class="chip chip--aviso chip--plain">${texto}</span>`;
  return `<li class="item ${clase} ${v.archivado ? 'item--archived' : ''}">
    <button type="button" class="item__main" data-editar="${esc(v.id)}" aria-label="Editar viaje ${esc(ruta?.nombre || '')} de las ${esc(fmt.hora(v.salidaProg))}">
      <span class="item__body">
        <span class="item__title">${esc(ruta?.nombre ?? '(ruta eliminada)')}</span>
        <span class="row row--wrap">${v.archivado ? '<span class="chip chip--neutro">Archivado</span>' : chipsEstado(e)}</span>
        <span class="timeline" style="margin-top:var(--sp-2)">
          <span><strong>${fmt.hora(v.salidaProg)}</strong><small>${v.salidaReal ? `Salió ${fmt.hora(v.salidaReal)} (${conSigno(e.retrasoSalidaMin)})` : 'Salida'}</small></span>
          <span class="timeline__line" aria-hidden="true"></span>
          <span style="text-align:right"><strong>${fmt.hora(v.llegadaProg)}</strong><small>${v.llegadaReal ? `Llegó ${fmt.hora(v.llegadaReal)}` : cruza ? 'Llegada (día sig.)' : 'Llegada'}</small></span>
        </span>
        <span class="item__meta">
          <span>${icon('user', 'icon--sm')} ${chofer ? esc(chofer.nombre) : sinAsignar('Sin chofer')}</span>
          <span>${icon('truck', 'icon--sm')} ${veh ? esc(veh.placa) : sinAsignar('Sin vehículo')}</span>
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

// ---------- Formulario ----------

function aFormulario(v) {
  return {
    rutaId: v.rutaId, choferId: v.choferId || '', vehiculoId: v.vehiculoId || '',
    fecha: fechaClave(v.salidaProg),
    salidaProg: horaClave(v.salidaProg), llegadaProg: horaClave(v.llegadaProg),
    salidaReal: v.salidaReal ? horaClave(v.salidaReal) : '', llegadaReal: v.llegadaReal ? horaClave(v.llegadaReal) : '',
    motivoRetraso: v.motivoRetraso || '', notas: v.notas || '',
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
    salidaProg, llegadaProg, salidaReal, llegadaReal, motivoRetraso: (f.motivoRetraso || '').trim(), notas: f.notas || '',
  };
}

/** Minutos de retraso de llegada según lo escrito en el formulario (null si falta algún dato). */
function retrasoLlegada(f) {
  if (!f.fecha || !f.salidaProg || !f.llegadaProg || !f.llegadaReal) return null;
  const d = deFormulario(f);
  return minutosEntre(d.llegadaProg, d.llegadaReal);
}
const quedaRetrasado = (f) => {
  const r = retrasoLlegada(f);
  return r != null && r > tolerancia();
};

/** Muestra el motivo solo cuando el viaje queda Retrasado (el campo no aparece si no hay retraso). */
function actualizarMotivo(form, f) {
  const campo = form.querySelector('[data-campo="motivoRetraso"]');
  if (!campo) return;
  const r = retrasoLlegada(f);
  const tarde = r != null && r > tolerancia();
  campo.hidden = !tarde;
  if (tarde) {
    campo.querySelector('.field__label').innerHTML = `Motivo del retraso${MOTIVO_OBLIGATORIO ? ' <span class="req" aria-hidden="true">*</span>' : ''} <span class="muted">· llegó ${esc(formatoDuracion(r))} tarde</span>`;
  }
}

function validarViaje(f) {
  const err = {};
  if (!f.fecha || !f.salidaProg || !f.llegadaProg) return err;
  const d = deFormulario(f);
  if (minutosEntre(d.salidaProg, d.llegadaProg) === 0) err.llegadaProg = 'La llegada debe ser distinta de la salida.';
  if (f.llegadaReal && !f.salidaReal) err.salidaReal = 'Registra la salida real antes de la llegada real.';
  if (d.salidaReal && d.llegadaReal && d.llegadaReal <= d.salidaReal) err.llegadaReal = 'La llegada real debe ser después de la salida real.';
  if (MOTIVO_OBLIGATORIO && quedaRetrasado(f) && !(f.motivoRetraso || '').trim()) err.motivoRetraso = 'El viaje quedó retrasado: elige o escribe el motivo.';
  return err;
}

/** Datos a guardar: sin retraso, el motivo no aplica y se limpia. */
function paraGuardar(f) {
  const datos = deFormulario(f);
  if (!quedaRetrasado(f)) datos.motivoRetraso = '';
  return datos;
}

function avisoGuardado(datos, nuevo) {
  const e = estadoViaje(datos, new Date(), tolerancia());
  if (e.puntualidad === 'retrasado') toast(`Guardado · llegó ${formatoDuracion(e.retrasoMin)} tarde.`, 'info');
  else toast(nuevo ? 'Viaje creado.' : 'Viaje actualizado.');
}

export function abrirViaje(viaje, refs, { fecha, alGuardar } = {}) {
  const acciones = [];
  if (viaje) {
    acciones.push(viaje.archivado
      ? { id: 'restaurar', etiqueta: 'Restaurar', icono: 'restore', clase: 'btn--secondary', ejecutar: async ({ cerrar }) => {
          await store.archive('viajes', viaje.id, false);
          toast('Viaje restaurado.');
          await cerrar();
          alGuardar?.();
        } }
      : { id: 'archivar', etiqueta: 'Archivar', icono: 'archive', ejecutar: async ({ cerrar }) => {
          const ok = await confirmar({ titulo: '¿Archivar este viaje?', mensaje: 'No contará en Inicio ni en los reportes. Podrás restaurarlo desde “Archivados”.', confirmar: 'Archivar', peligro: true });
          if (!ok) return;
          await store.archive('viajes', viaje.id);
          toast('Viaje archivado.');
          await cerrar();
          alGuardar?.();
        } });
  }
  const valores = viaje ? aFormulario(viaje) : { fecha: fecha || hoyClave() };
  const hoja = abrirFormulario({
    titulo: viaje ? 'Editar viaje' : 'Nuevo viaje',
    campos,
    valores,
    refs: refs.listas,
    grupos: { programado: 'Horario programado', real: 'Horario real' },
    acciones,
    validarExtra: validarViaje,
    alCambiar(v, form, campo) {
      actualizarMotivo(form, v);
      // La llegada programada = salida + duración normal de la ruta, mientras el usuario no la cambie a mano.
      if (campo === 'llegadaProg') form.dataset.manual = '1';
      if (!['rutaId', 'salidaProg', 'fecha'].includes(campo) || form.dataset.manual === '1') return;
      const ruta = refs.rutas.get(v.rutaId);
      if (ruta?.duracionMin && v.salidaProg && v.fecha) {
        form.elements.llegadaProg.value = horaClave(sumarMinutos(aISO(v.fecha, v.salidaProg), ruta.duracionMin));
      }
    },
    guardar: async (f) => {
      const datos = paraGuardar(f);
      if (viaje) await store.update('viajes', viaje.id, datos);
      else await store.create('viajes', datos);
      avisoGuardado(datos, !viaje);
      alGuardar?.(fechaClave(datos.salidaProg));
    },
  });
  const form = hoja.el.querySelector('form');
  if (viaje) form.dataset.manual = '1';
  actualizarMotivo(form, valores);
  return hoja;
}

/**
 * Hoja corta para registrar la salida o la llegada real de un viaje: la hora se ESCRIBE a mano
 * (con el atajo "Ahora", que solo rellena). Si la llegada queda Retrasada, pide el motivo.
 */
export function abrirRegistro(tipo, viaje, refs, { alGuardar } = {}) {
  const base = aFormulario(viaje);
  const ruta = refs.rutas.get(viaje.rutaId);
  const deTipo = tipo === 'salida' ? ['salidaReal'] : ['llegadaReal', 'motivoRetraso'];
  const camposRegistro = campos
    .filter((c) => deTipo.includes(c.clave))
    .map((c) => ({ ...c, grupo: undefined, requerido: c.clave !== 'motivoRetraso' }));
  const programada = tipo === 'salida' ? viaje.salidaProg : viaje.llegadaProg;
  const hoja = abrirFormulario({
    titulo: tipo === 'salida' ? 'Registrar salida' : 'Registrar llegada',
    antes: `<p class="muted" style="margin-bottom:var(--sp-3)">${esc(ruta?.nombre ?? 'Viaje')} · ${tipo === 'salida' ? 'salida' : 'llegada'} programada ${esc(fmt.hora(programada))}</p>`,
    campos: camposRegistro,
    valores: base,
    validarExtra: (f) => validarViaje({ ...base, ...f }),
    alCambiar: (f, form) => actualizarMotivo(form, { ...base, ...f }),
    guardar: async (f) => {
      const datos = paraGuardar({ ...base, ...f });
      const cambios = tipo === 'salida'
        ? { salidaReal: datos.salidaReal }
        : { llegadaReal: datos.llegadaReal, motivoRetraso: datos.motivoRetraso };
      await store.update('viajes', viaje.id, cambios);
      if (tipo === 'salida') toast(`Salida registrada: ${fmt.hora(datos.salidaReal)}`);
      else avisoGuardado({ ...viaje, ...cambios }, false);
      alGuardar?.();
    },
  });
  actualizarMotivo(hoja.el.querySelector('form'), base);
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
      ${CONFIG.viajes.generar_desde_horarios ? `<button type="button" class="btn btn--secondary btn--block" data-generar>${icon('calendar')}<span data-generar-texto>Generar viajes de hoy</span></button>` : ''}
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
      const generar = el.querySelector('[data-generar-texto]');
      if (generar) generar.textContent = est.fecha === hoy ? 'Generar viajes de hoy' : `Generar viajes del ${fmt.fecha(est.fecha)}`;
      el.querySelector('[data-titulo]').textContent = titulo[0].toUpperCase() + titulo.slice(1);
      if (!visibles.length) {
        lista.innerHTML = `<li>${
          q || est.filtro !== 'todos'
            ? vacio({ icono: 'search', titulo: 'Sin viajes en este filtro', texto: 'Prueba con “Todos” o cambia la búsqueda.' })
            : vacio({ icono: 'bus', titulo: 'No hay viajes este día', texto: CONFIG.viajes.generar_desde_horarios ? 'Toca “Generar viajes” para crearlos desde los horarios fijos, o “Nuevo viaje”.' : 'Toca “Nuevo viaje” para programar uno.' })
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
      if (b.dataset.registrar) {
        return abrirRegistro(b.dataset.registrar, viajes.find((v) => v.id === b.dataset.id), refs, { alGuardar: () => cargar() });
      }
      if (b.hasAttribute('data-generar')) {
        const nuevos = viajesDesdeHorarios(refs.listas.rutas, viajes, est.fecha);
        if (!nuevos.length) return toast('Ya están creados todos los viajes de los horarios fijos de este día.', 'info');
        await store.createMany('viajes', nuevos);
        toast(`Se crearon ${fmt.plural(nuevos.length, 'viaje', 'viajes')}. Asigna chofer y vehículo.`);
        return cargar(true);
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

