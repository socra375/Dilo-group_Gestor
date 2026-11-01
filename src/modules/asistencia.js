// Asistencia del chofer (SUPUESTO: lo mencionó en la llamada, no en el cuestionario). Simple a propósito:
// la lista del día con "Marcar entrada / Marcar salida" (hora editable) y, por chofer, un historial para corregir.
// Se oculta con CONFIG.modulos.asistencia = false.
import * as store from '../data/store.js';
import { camposDe, PARAMETROS } from '../core/esquemas.js';
import { avatarHTML } from '../core/crud.js';
import { pintarFotos } from '../core/fotos.js';
import { aISO, horaClave, horaDespues, hoyClave, sumarDias, fechaClave, minutosEntre, formatoDuracion, horaAhora } from '../core/time.js';
import * as fmt from '../core/format.js';
import { abrirFormulario } from '../core/form.js';
import { esc, icon, vacio, toast, abrirHoja, conCarga, escalonar } from '../core/ui.js';

const campos = camposDe('asistencia');
const campoHora = (clave) => ({ ...campos.find((c) => c.clave === clave), grupo: undefined, ayuda: undefined });

/** Registro de asistencia abierto (sin salida) más reciente de un chofer, de cualquier día. */
export const turnoAbierto = (registros, choferId) =>
  registros.filter((r) => r.choferId === choferId && !r.salida && !r.archivado).sort((a, b) => b.entrada.localeCompare(a.entrada))[0] ?? null;

export const turnoLargo = (r, ahora = new Date()) => !r.salida && minutosEntre(r.entrada, new Date(ahora).toISOString()) > PARAMETROS.horasTurnoLargo * 60;

const duracion = (r) => formatoDuracion(minutosEntre(r.entrada, r.salida));

/** "Entró 5:02 a. m. · Salió 2:10 p. m. (9 h 8 min)". La salida de otro día lleva "(día sig.)". */
function lineaRegistro(r) {
  if (!r.salida) return `Entró ${fmt.hora(r.entrada)} · en turno`;
  const otroDia = fechaClave(r.salida) !== fechaClave(r.entrada);
  return `Entró ${fmt.hora(r.entrada)} · Salió ${fmt.hora(r.salida)}${otroDia ? ' (día sig.)' : ''} · ${duracion(r)}`;
}

// ---------- Marcar entrada o salida (hora editable) ----------

function abrirMarcar(tipo, chofer, registros, fecha, alGuardar) {
  const abierto = turnoAbierto(registros, chofer.id);
  const esEntrada = tipo === 'entrada';
  const clave = esEntrada ? 'entrada' : 'salida';
  const hoja = abrirFormulario({
    titulo: `${esEntrada ? 'Marcar entrada' : 'Marcar salida'} · ${chofer.nombre.split(' ').slice(0, 2).join(' ')}`,
    antes: `<p class="muted" style="margin-bottom:var(--sp-3)">${esEntrada ? `Día ${esc(fmt.fecha(fecha))}.` : `Entró ${esc(fmt.hora(abierto?.entrada))}.`} La hora se puede cambiar.</p>`,
    campos: [{ ...campoHora(clave), requerido: true, etiqueta: esEntrada ? 'Hora de entrada' : 'Hora de salida' }],
    // Hoy se propone la hora actual (editable); otro día se deja en blanco para escribirla.
    valores: { [clave]: fecha === hoyClave() ? horaAhora() : '' },
    validarExtra(v) {
      if (esEntrada && abierto) return { entrada: `Ya tiene una entrada abierta (${fmt.hora(abierto.entrada)}). Marca primero su salida.` };
      if (!esEntrada && abierto && v.salida && horaDespues(v.salida, abierto.entrada) === abierto.entrada) return { salida: 'La salida debe ser distinta de la entrada.' };
      return {};
    },
    guardar: async (v) => {
      if (esEntrada) {
        await store.create('asistencia', { choferId: chofer.id, fecha, entrada: aISO(fecha, v.entrada), salida: null });
        toast(`Entrada marcada: ${fmt.horaTexto(v.entrada)}`);
      } else {
        const salida = horaDespues(v.salida, abierto.entrada);
        await store.update('asistencia', abierto.id, { salida });
        toast(`Salida marcada · ${formatoDuracion(minutosEntre(abierto.entrada, salida))} de turno`);
      }
      alGuardar();
    },
  });
  return hoja;
}

// ---------- Corregir un registro ----------

function abrirCorregir(chofer, registro, alGuardar) {
  abrirFormulario({
    titulo: registro ? 'Corregir registro' : `Agregar registro · ${chofer.nombre.split(' ').slice(0, 2).join(' ')}`,
    campos,
    valores: registro
      ? { fecha: registro.fecha, entrada: horaClave(registro.entrada), salida: registro.salida ? horaClave(registro.salida) : '' }
      : { fecha: hoyClave() },
    acciones: registro
      ? [{ id: 'archivar', etiqueta: 'Archivar', icono: 'archive', ejecutar: async ({ cerrar }) => {
          await store.archive('asistencia', registro.id);
          toast('Registro archivado.');
          await cerrar();
          alGuardar();
        } }]
      : [],
    guardar: async (v) => {
      const entrada = aISO(v.fecha, v.entrada);
      const salida = v.salida ? horaDespues(v.salida, entrada) : null;
      if (salida === entrada) throw { errores: { salida: 'La salida debe ser distinta de la entrada.' } };
      const datos = { choferId: chofer.id, fecha: v.fecha, entrada, salida };
      if (registro) await store.update('asistencia', registro.id, datos);
      else await store.create('asistencia', datos);
      toast('Registro guardado.');
      alGuardar();
    },
  });
}

async function abrirHistorial(chofer, alCambiar) {
  const hoja = abrirHoja({
    titulo: `Asistencia · ${chofer.nombre.split(' ').slice(0, 2).join(' ')}`,
    contenido: '<ul class="list" data-historial></ul>',
    pie: `<button type="button" class="btn btn--secondary" data-agregar>${icon('plus')}Agregar registro</button>`,
  });
  const ul = hoja.el.querySelector('[data-historial]');
  let lista = [];
  const pintar = async () => {
    lista = (await store.list('asistencia')).filter((r) => r.choferId === chofer.id).sort((a, b) => b.entrada.localeCompare(a.entrada)).slice(0, 30);
    ul.innerHTML = lista.length
      ? lista.map((r) => `<li class="item"><button type="button" class="item__main" data-registro="${esc(r.id)}" aria-label="Corregir el registro del ${esc(fmt.fecha(r.fecha))}">
          <span class="item__body"><span class="item__title">${esc(fmt.fecha(r.fecha))}</span><span class="item__subtitle tabular">${esc(lineaRegistro(r))}</span></span>
          <span class="item__aside">${icon('edit', 'icon--sm')}</span></button></li>`).join('')
      : `<li>${vacio({ icono: 'clock', titulo: 'Sin registros', texto: 'Marca la entrada desde la lista del día o agrega uno aquí.' })}</li>`;
  };
  const refrescar = async () => {
    await pintar();
    alCambiar();
  };
  hoja.el.addEventListener('click', (e) => {
    const r = e.target.closest('[data-registro]');
    if (r) abrirCorregir(chofer, lista.find((x) => x.id === r.dataset.registro), refrescar);
    if (e.target.closest('[data-agregar]')) abrirCorregir(chofer, null, refrescar);
  });
  await pintar();
}

// ---------- Pantalla ----------

export default {
  titulo: 'Asistencia',
  pestana: 'mas',
  async render(el, params = {}) {
    const est = { fecha: params.fecha || hoyClave() };
    el.classList.add('view--ancha');
    el.innerHTML = `
      <div class="row" role="group" aria-label="Día">
        <button type="button" class="icon-btn" data-dia="-1" aria-label="Día anterior" style="transform:scaleX(-1)">${icon('chevron')}</button>
        <label class="grow"><span class="sr-only">Fecha</span><input class="input" type="date" data-fecha value="${est.fecha}"></label>
        <button type="button" class="icon-btn" data-dia="1" aria-label="Día siguiente">${icon('chevron')}</button>
      </div>
      <div class="day-head" data-resumen></div>
      <ul class="list" data-lista aria-live="polite"></ul>`;
    const lista = el.querySelector('[data-lista]');
    let choferes = [];
    let registros = [];

    const pintar = (animar = false) => {
      const ahora = new Date();
      const ayer = sumarDias(est.fecha, -1);
      let enTurno = 0;
      let sinRegistro = 0;
      const filas = choferes.map((c) => {
        const delDia = registros.filter((r) => r.choferId === c.id && r.fecha === est.fecha).sort((a, b) => a.entrada.localeCompare(b.entrada));
        const abierto = turnoAbierto(registros, c.id);
        // Un turno nocturno que empezó ayer y sigue abierto cuenta también en la lista de hoy.
        const heredado = abierto && abierto.fecha === ayer && !delDia.includes(abierto) ? abierto : null;
        const lineas = [...(heredado ? [heredado] : []), ...delDia];
        const enCurso = Boolean(abierto && (delDia.includes(abierto) || heredado));
        if (enCurso) enTurno++;
        if (!lineas.length) sinRegistro++;
        const largo = enCurso && turnoLargo(abierto, ahora);
        const chip = !lineas.length
          ? '<span class="chip chip--neutro">Sin registro</span>'
          : enCurso ? `<span class="chip chip--info">En turno</span>` : '<span class="chip chip--ok">Completo</span>';
        const boton = enCurso
          ? `<button type="button" class="btn btn--secondary btn--sm" data-marcar="salida" data-id="${esc(c.id)}">${icon('logout', 'icon--sm')}Marcar salida</button>`
          : `<button type="button" class="btn btn--primary btn--sm" data-marcar="entrada" data-id="${esc(c.id)}">${icon('login', 'icon--sm')}Marcar entrada</button>`;
        return `<li class="item ${largo ? 'item--warn' : ''}">
          <button type="button" class="item__main" data-historial="${esc(c.id)}" aria-label="Ver y corregir la asistencia de ${esc(c.nombre)}">
            ${avatarHTML(c.fotoId, c.nombre)}
            <span class="item__body"><span class="item__title">${esc(c.nombre)}</span>
              ${lineas.map((r) => `<span class="item__subtitle tabular">${heredado === r ? 'Desde ayer · ' : ''}${esc(lineaRegistro(r))}</span>`).join('')}
              ${largo ? `<span class="chip chip--aviso chip--plain">Más de ${PARAMETROS.horasTurnoLargo} h: ¿falta marcar la salida?</span>` : ''}</span>
            <span class="item__aside">${chip}</span>
          </button>
          <div class="item__actions">${boton}</div></li>`;
      });
      el.querySelector('[data-resumen]').textContent = `${fmt.fechaLarga(est.fecha).replace(/^./, (x) => x.toUpperCase())} · ${enTurno} en turno · ${sinRegistro} sin registro`;
      lista.innerHTML = filas.length ? filas.join('') : `<li>${vacio({ icono: 'user', titulo: 'No hay choferes', texto: 'Agrégalos en la pestaña Choferes para llevar su asistencia.' })}</li>`;
      pintarFotos(lista);
      if (animar) escalonar(lista);
    };

    const cargar = async (animar) => {
      const [c, r] = await conCarga(lista, Promise.all([store.list('choferes'), store.list('asistencia')]));
      choferes = c.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
      registros = r;
      pintar(animar);
    };

    const cambiarFecha = (f) => {
      est.fecha = f;
      el.querySelector('[data-fecha]').value = f;
      pintar(true);
    };

    el.addEventListener('change', (e) => {
      if (e.target.matches('[data-fecha]') && e.target.value) cambiarFecha(e.target.value);
    });
    el.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.dia) return cambiarFecha(sumarDias(est.fecha, Number(b.dataset.dia)));
      if (b.dataset.marcar) return abrirMarcar(b.dataset.marcar, choferes.find((c) => c.id === b.dataset.id), registros, est.fecha, () => cargar());
      if (b.dataset.historial) abrirHistorial(choferes.find((c) => c.id === b.dataset.historial), () => cargar());
    });

    await cargar(true);
    const reloj = setInterval(() => pintar(), 60000);
    return () => clearInterval(reloj);
  },
};
