// Formularios generados desde los esquemas (src/core/esquemas.js) y CONFIG: render, lectura, validación y hoja inferior.
import { esc, abrirHoja, toast, icon } from './ui.js';
import { unidad, telefono, cedula, horaTexto } from './format.js';
import { reducirImagen, pintarFotos, olvidarFoto, LADO_FOTO } from './fotos.js';
import { guardarFoto, borrarFoto } from '../data/store.js';
import { CONFIG } from '../config.js';
import { horaAhora } from './time.js';

const solo = (v, re) => String(v ?? '').replace(re, '');

function opcionesReferencia(campo, refs, valor) {
  const lista = (refs[campo.coleccion] || []).filter((x) => !x.archivado || x.id === valor);
  const ops = lista
    .slice()
    .sort((a, b) => String(a[campo.mostrar]).localeCompare(String(b[campo.mostrar]), 'es'))
    .map((x) => `<option value="${esc(x.id)}" ${x.id === valor ? 'selected' : ''}>${esc(x[campo.mostrar])}${x.archivado ? ' (archivado)' : ''}</option>`);
  return `<option value="">Selecciona…</option>${ops.join('')}`;
}

const chipHora = (h) => `<li class="chip chip--neutro chip--plain hora-chip">${esc(horaTexto(h))}<button type="button" class="hora-chip__quitar" data-quitar-hora="${esc(h)}" aria-label="Quitar ${esc(horaTexto(h))}">${icon('x', 'icon--sm')}</button></li>`;

function controlHTML(c, valor, refs) {
  const id = `f-${c.clave}`;
  const describe = `${id}-err${c.soloAdvertir ? ` ${id}-warn` : ''}${c.ayuda ? ` ${id}-help` : ''}`;
  const comun = `id="${id}" name="${c.clave}" aria-describedby="${describe}" ${c.requerido ? 'aria-required="true"' : ''}`;
  let v = valor ?? '';
  if (c.tipo === 'telefono') v = telefono(v).replace(/[()]/g, '').replace(' ', '-');
  if (c.tipo === 'cedula') v = cedula(v);
  switch (c.tipo) {
    case 'foto':
      // El valor es el id de la foto guardada; las nuevas se reducen al elegirlas y se guardan al enviar.
      return `<div class="foto-campo" data-foto-campo="${c.clave}">
        <span class="foto-campo__marco" data-foto-marco>${v ? `<img alt="Foto actual" data-foto="${esc(v)}">` : icon('camera')}</span>
        <span class="foto-campo__acciones">
          <label class="btn btn--secondary btn--sm" for="${id}">${icon('camera', 'icon--sm')}<span data-foto-texto>${v ? 'Cambiar foto' : 'Agregar foto'}</span></label>
          <button type="button" class="btn btn--ghost btn--sm" data-quitar-foto ${v ? '' : 'hidden'}>Quitar</button>
        </span>
        <input type="hidden" name="${c.clave}" value="${esc(v)}">
        <input type="file" accept="image/*" id="${id}" class="sr-only" data-foto-archivo="${c.clave}" aria-describedby="${describe}">
      </div>`;
    case 'horas': {
      const lista = Array.isArray(valor) ? valor : [];
      return `<div class="horas" data-horas="${c.clave}">
        <input type="hidden" name="${c.clave}" value="${esc(JSON.stringify(lista))}">
        <ul class="horas__lista" aria-live="polite">${lista.map(chipHora).join('')}</ul>
        <div class="horas__nueva"><input class="input" type="time" id="${id}" aria-describedby="${describe}"><button type="button" class="btn btn--secondary btn--sm" data-agregar-hora>${icon('plus', 'icon--sm')}Agregar</button></div>
      </div>`;
    }
    case 'notas':
      return `<textarea class="textarea" ${comun} maxlength="${c.max || 500}" rows="3">${esc(v)}</textarea>`;
    case 'seleccion':
      return `<select class="select" ${comun}>${c.requerido ? '' : '<option value="">—</option>'}${c.opciones
        .map((o) => `<option value="${esc(o.valor)}" ${o.valor === (v || c.porDefecto) ? 'selected' : ''}>${esc(o.etiqueta)}</option>`)
        .join('')}</select>`;
    case 'referencia':
      return `<select class="select" ${comun}>${opcionesReferencia(c, refs, v)}</select>`;
    case 'fecha':
      return `<input class="input" type="date" ${comun} value="${esc(v)}">`;
    case 'hora': {
      const entrada = `<input class="input" type="time" ${comun} value="${esc(v)}">`;
      // Atajo "Ahora": solo rellena el campo con la hora actual; no guarda nada (CONFIG.viajes.atajo_ahora).
      return c.ahora && CONFIG.viajes.atajo_ahora
        ? `<div class="hora-ahora">${entrada}<button type="button" class="btn btn--ghost btn--sm" data-ahora="${c.clave}" aria-label="Poner la hora actual en ${esc(c.etiqueta)}">Ahora</button></div>`
        : entrada;
    }
    case 'motivo': {
      // Chips de motivos rápidos + texto libre. El valor guardado es el texto (un chip lo rellena).
      const opciones = c.opciones || [];
      return `<div class="motivo" data-motivo="${c.clave}">
        <div class="motivo__chips" role="radiogroup" aria-label="Motivos frecuentes">${opciones
          .map((o) => `<button type="button" class="filter" role="radio" aria-checked="${o === v}" data-motivo-op="${esc(o)}">${esc(o)}</button>`)
          .join('')}</div>
        <input class="input" type="text" autocomplete="off" maxlength="${c.max || 200}" placeholder="Elige un motivo o escríbelo" ${comun} value="${esc(v)}">
      </div>`;
    }
    case 'telefono':
      return `<input class="input" type="tel" inputmode="tel" autocomplete="off" placeholder="809-555-0000" ${comun} value="${esc(v)}">`;
    case 'cedula':
      return `<input class="input" type="text" inputmode="numeric" autocomplete="off" placeholder="001-0000000-0" ${comun} value="${esc(v)}">`;
    case 'placa':
      return `<input class="input" type="text" autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="I000000" ${comun} value="${esc(v)}">`;
    case 'dinero':
      return `<div class="input-affix input-affix--prefix"><span class="input-affix__text">RD$</span><input class="input tabular" type="text" inputmode="decimal" autocomplete="off" placeholder="0.00" ${comun} value="${esc(v)}"></div>`;
    case 'numero': {
      const input = `<input class="input tabular" type="text" inputmode="${c.entero ? 'numeric' : 'decimal'}" autocomplete="off" ${comun} value="${esc(v)}">`;
      const suf = c.unidad === 'combustible' ? unidad('corta') : c.sufijo;
      return suf ? `<div class="input-affix input-affix--suffix">${input}<span class="input-affix__text">${esc(suf)}</span></div>` : input;
    }
    default:
      return `<input class="input" type="text" autocomplete="off" ${c.max ? `maxlength="${c.max}"` : ''} ${comun} value="${esc(v)}">`;
  }
}

export function campoHTML(c, valor, refs = {}) {
  const id = `f-${c.clave}`;
  if (c.tipo === 'casilla') {
    const marcado = valor === undefined || valor === null ? c.porDefecto === true : valor === true;
    return `<div class="field field--full" data-campo="${c.clave}">
      <label class="switch" for="${id}"><span><strong>${esc(c.etiqueta)}</strong>${c.ayuda ? `<br><small class="muted" id="${id}-help">${esc(c.ayuda)}</small>` : ''}</span>
        <input type="checkbox" role="switch" id="${id}" name="${c.clave}" ${marcado ? 'checked' : ''} aria-describedby="${id}-err${c.ayuda ? ` ${id}-help` : ''}"></label>
      <p class="field__error" id="${id}-err" aria-live="polite"></p>
    </div>`;
  }
  // Las horas con atajo "Ahora" van en fila completa: en media columna el botón no cabe.
  const ancho = ['notas', 'texto', 'referencia', 'telefono', 'cedula', 'foto', 'horas', 'motivo'].includes(c.tipo) || !c.grupo || (c.ahora && CONFIG.viajes.atajo_ahora) ? 'field--full' : '';
  return `<div class="field ${ancho}" data-campo="${c.clave}">
    <label class="field__label" for="${id}">${esc(c.etiqueta)}${c.requerido ? ' <span class="req" aria-hidden="true">*</span>' : ''}</label>
    ${controlHTML(c, valor, refs)}
    ${c.ayuda ? `<p class="field__help" id="${id}-help">${esc(c.ayuda)}</p>` : ''}
    <p class="field__error" id="${id}-err" aria-live="polite"></p>
    ${c.soloAdvertir ? `<p class="field__warn" id="${id}-warn" aria-live="polite"></p>` : ''}
  </div>`;
}

/** Agrupa campos consecutivos con el mismo `grupo` en una fila de dos columnas. */
export function formularioHTML(campos, valores = {}, { refs = {}, grupos = {} } = {}) {
  let html = '';
  let i = 0;
  while (i < campos.length) {
    const c = campos[i];
    if (!c.grupo) {
      html += campoHTML(c, valores[c.clave], refs);
      i++;
      continue;
    }
    let bloque = '';
    const g = c.grupo;
    while (i < campos.length && campos[i].grupo === g) {
      bloque += campoHTML(campos[i], valores[campos[i].clave], refs);
      i++;
    }
    html += `<fieldset class="form__group" style="border:0;padding:0;margin:0">${grupos[g] ? `<legend class="form__legend">${esc(grupos[g])}</legend>` : ''}${bloque}</fieldset>`;
  }
  return html;
}

function aNumero(v) {
  const t = String(v ?? '').trim().replace(/[,\s]/g, '').replace(/^RD\$/i, '');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

/** Lee y normaliza los valores del formulario según el tipo de cada campo. */
export function leerValores(form, campos) {
  const fd = new FormData(form);
  const out = {};
  for (const c of campos) {
    const crudo = fd.get(c.clave);
    const t = typeof crudo === 'string' ? crudo.trim() : '';
    switch (c.tipo) {
      case 'telefono':
        out[c.clave] = solo(t, /\D/g);
        break;
      case 'cedula': {
        // Con 11 dígitos se guarda limpia; si la escribieron distinto se conserva tal cual (solo se advierte).
        const d = solo(t, /\D/g);
        out[c.clave] = d.length === 11 ? d : t;
        break;
      }
      case 'horas': {
        const lista = new Set(JSON.parse(t || '[]'));
        // Una hora escrita pero sin pulsar "Agregar" también cuenta.
        const pendiente = form.querySelector(`[data-horas="${c.clave}"] input[type="time"]`)?.value;
        if (/^\d{2}:\d{2}$/.test(pendiente || '')) lista.add(pendiente);
        out[c.clave] = [...lista].sort();
        break;
      }
      case 'placa':
        out[c.clave] = solo(t.toUpperCase(), /[^A-Z0-9]/g);
        break;
      case 'numero':
      case 'dinero':
        out[c.clave] = aNumero(t);
        break;
      case 'casilla':
        out[c.clave] = crudo === 'on';
        break;
      default:
        out[c.clave] = t;
    }
  }
  return out;
}

function revisar(campos, valores) {
  const err = {};
  for (const c of campos) {
    const v = valores[c.clave];
    const vacio = v === '' || v == null || (Array.isArray(v) && !v.length);
    if (vacio) {
      if (c.requerido) err[c.clave] = ['seleccion', 'referencia'].includes(c.tipo) ? 'Selecciona una opción.' : 'Este campo es obligatorio.';
      continue;
    }
    switch (c.tipo) {
      case 'telefono':
        if (!/^(809|829|849)\d{7}$/.test(v)) err[c.clave] = 'Escribe 10 dígitos que empiecen por 809, 829 o 849.';
        break;
      case 'cedula':
        if (!/^\d{11}$/.test(v)) err[c.clave] = 'La cédula dominicana tiene 11 dígitos (ej. 001-1234567-8). Se guardará como la escribiste.';
        break;
      case 'horas':
        if (v.some((h) => !/^\d{2}:\d{2}$/.test(h))) err[c.clave] = 'Hay una hora no válida.';
        break;
      case 'fecha':
        if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) err[c.clave] = 'Fecha no válida.';
        break;
      case 'hora':
        if (!/^\d{2}:\d{2}$/.test(v)) err[c.clave] = 'Hora no válida.';
        break;
      case 'numero':
      case 'dinero':
        if (Number.isNaN(v)) err[c.clave] = 'Escribe solo números (ej. 1250.50).';
        else if (c.entero && !Number.isInteger(v)) err[c.clave] = 'Escribe un número entero.';
        else if (c.min != null && v < c.min) err[c.clave] = `Debe ser al menos ${c.min}.`;
        else if (c.max != null && v > c.max) err[c.clave] = `No puede pasar de ${c.max}.`;
        break;
      default:
        if (c.max && String(v).length > c.max) err[c.clave] = `Máximo ${c.max} caracteres.`;
    }
    if (!err[c.clave] && c.patron && !new RegExp(c.patron).test(v)) err[c.clave] = c.mensajePatron || 'Formato no válido.';
  }
  return err;
}

/** Errores que impiden guardar (los campos `soloAdvertir` nunca bloquean). */
export function validar(campos, valores) {
  const todos = revisar(campos, valores);
  return Object.fromEntries(Object.entries(todos).filter(([k]) => !campos.find((c) => c.clave === k)?.soloAdvertir));
}

/** Avisos que no impiden guardar (p. ej. cédula con formato distinto). */
export function advertencias(campos, valores) {
  const todos = revisar(campos, valores);
  return Object.fromEntries(Object.entries(todos).filter(([k]) => campos.find((c) => c.clave === k)?.soloAdvertir));
}

function mostrarAdvertencias(form, avisos) {
  for (const p of form.querySelectorAll('.field__warn')) {
    p.textContent = avisos[p.closest('[data-campo]').dataset.campo] || '';
  }
}

export function mostrarErrores(form, errores) {
  let primero = null;
  for (const campo of form.querySelectorAll('[data-campo]')) {
    const clave = campo.dataset.campo;
    const control = campo.querySelector('input:not([type="hidden"]), select, textarea');
    const msg = errores[clave] || '';
    campo.querySelector('.field__error').textContent = msg;
    if (msg) {
      control.setAttribute('aria-invalid', 'true');
      primero ??= control;
    } else control.removeAttribute('aria-invalid');
  }
  if (primero) {
    primero.focus({ preventScroll: true });
    primero.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
  return !primero;
}

/**
 * Formulario en hoja inferior.
 *   guardar(valores) → puede lanzar { errores: { clave: 'mensaje' } } para marcar campos.
 *   acciones: [{ id, etiqueta, clase, icono, ejecutar: async ({ cerrar }) => {} }] botones extra en el pie.
 *   alCambiar(valores, form, campoCambiado) para autocompletar.
 */
export function abrirFormulario({ titulo, campos, valores = {}, refs = {}, grupos = {}, textoGuardar = 'Guardar', acciones = [], antes = '', validarExtra, alCambiar, guardar }) {
  const accionesHTML = acciones
    .map((a) => `<button type="button" class="btn ${a.clase || 'btn--ghost'}" data-accion="${a.id}">${a.icono ? icon(a.icono) : ''}${esc(a.etiqueta)}</button>`)
    .join('');
  const hoja = abrirHoja({
    titulo,
    contenido: `${antes}<form class="form" id="sheet-form" novalidate>${formularioHTML(campos, valores, { refs, grupos })}</form>`,
    pie: `${accionesHTML}<button type="submit" form="sheet-form" class="btn btn--primary">${icon('check')}${esc(textoGuardar)}</button>`,
  });
  const form = hoja.el.querySelector('form');
  const enviar = hoja.el.querySelector('button[type="submit"]');
  const fotosNuevas = {}; // clave → Blob ya reducido, pendiente de guardar
  pintarFotos(form);

  form.addEventListener('input', (e) => {
    const campo = e.target.closest('[data-campo]');
    if (campo) {
      campo.querySelector('.field__error').textContent = '';
      e.target.removeAttribute('aria-invalid');
    }
  });
  // Las advertencias (no bloquean) se muestran al salir del campo, antes de guardar.
  form.addEventListener('change', (e) => {
    if (e.target.closest('[data-campo]') && campos.some((c) => c.soloAdvertir)) mostrarAdvertencias(form, advertencias(campos, leerValores(form, campos)));
  });
  if (alCambiar) form.addEventListener('change', (e) => alCambiar(leerValores(form, campos), form, e.target.name));

  // ---- Fotos ----
  const pintarFoto = (clave, url) => {
    const cont = form.querySelector(`[data-foto-campo="${clave}"]`);
    cont.querySelector('[data-foto-marco]').innerHTML = url ? `<img alt="Foto nueva" src="${url}">` : icon('camera');
    cont.querySelector('[data-foto-texto]').textContent = url ? 'Cambiar foto' : 'Agregar foto';
    cont.querySelector('[data-quitar-foto]').hidden = !url;
  };
  form.addEventListener('change', async (e) => {
    const entrada = e.target.closest('[data-foto-archivo]');
    if (!entrada) return;
    const clave = entrada.dataset.fotoArchivo;
    const archivo = entrada.files?.[0];
    entrada.value = '';
    if (!archivo) return;
    const error = form.querySelector(`[data-campo="${clave}"] .field__error`);
    try {
      const campo = campos.find((c) => c.clave === clave);
      fotosNuevas[clave] = await reducirImagen(archivo, campo.lado || LADO_FOTO);
      pintarFoto(clave, URL.createObjectURL(fotosNuevas[clave]));
      error.textContent = '';
    } catch (x) {
      error.textContent = x.message || 'No se pudo leer la foto.';
    }
  });

  // ---- Horarios ----
  const pintarHoras = (cont, lista) => {
    cont.querySelector('input[type="hidden"]').value = JSON.stringify(lista);
    cont.querySelector('.horas__lista').innerHTML = lista.map(chipHora).join('');
  };
  const agregarHora = (cont) => {
    const entrada = cont.querySelector('input[type="time"]');
    if (!/^\d{2}:\d{2}$/.test(entrada.value)) return;
    const lista = new Set(JSON.parse(cont.querySelector('input[type="hidden"]').value || '[]'));
    lista.add(entrada.value);
    pintarHoras(cont, [...lista].sort());
    entrada.value = '';
    entrada.focus();
  };
  form.addEventListener('keydown', (e) => {
    const cont = e.target.closest('[data-horas]');
    if (cont && e.key === 'Enter') {
      e.preventDefault(); // Enter agrega la hora, no envía el formulario
      agregarHora(cont);
    }
  });

  form.addEventListener('click', (e) => {
    const ahora = e.target.closest('[data-ahora]');
    if (ahora) {
      const entrada = form.elements[ahora.dataset.ahora];
      entrada.value = horaAhora();
      // Avisar como si el usuario la hubiera escrito (recalcula retraso y motivo); no se guarda nada.
      entrada.dispatchEvent(new Event('input', { bubbles: true }));
      entrada.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    const opcion = e.target.closest('[data-motivo-op]');
    if (opcion) {
      const cont = opcion.closest('[data-motivo]');
      const entrada = cont.querySelector('input');
      const otro = /^otro$/i.test(opcion.dataset.motivoOp);
      entrada.value = otro ? '' : opcion.dataset.motivoOp;
      cont.querySelectorAll('[data-motivo-op]').forEach((b) => b.setAttribute('aria-checked', String(b === opcion)));
      entrada.dispatchEvent(new Event('input', { bubbles: true }));
      if (otro) entrada.focus();
      return;
    }
    const quitarFoto = e.target.closest('[data-quitar-foto]');
    if (quitarFoto) {
      const cont = quitarFoto.closest('[data-foto-campo]');
      const clave = cont.dataset.fotoCampo;
      delete fotosNuevas[clave];
      cont.querySelector('input[type="hidden"]').value = '';
      pintarFoto(clave, null);
      return;
    }
    if (e.target.closest('[data-agregar-hora]')) return agregarHora(e.target.closest('[data-horas]'));
    const quitarHora = e.target.closest('[data-quitar-hora]');
    if (quitarHora) {
      const cont = quitarHora.closest('[data-horas]');
      const lista = JSON.parse(cont.querySelector('input[type="hidden"]').value || '[]').filter((h) => h !== quitarHora.dataset.quitarHora);
      pintarHoras(cont, lista);
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = leerValores(form, campos);
    const errores = { ...validar(campos, v), ...(validarExtra?.(v) || {}) };
    if (!mostrarErrores(form, errores)) return;
    const avisos = advertencias(campos, v);
    enviar.disabled = true;
    const creadas = [];
    try {
      for (const [clave, blob] of Object.entries(fotosNuevas)) {
        v[clave] = await guardarFoto(blob);
        creadas.push(v[clave]);
      }
      try {
        await guardar(v);
      } catch (err) {
        for (const id of creadas) await borrarFoto(id); // no dejar fotos huérfanas
        throw err;
      }
      // Fotos reemplazadas o quitadas: se borran solo después de guardar bien.
      for (const c of campos.filter((x) => x.tipo === 'foto')) {
        const antes = valores[c.clave];
        if (antes && antes !== v[c.clave]) {
          await borrarFoto(antes);
          olvidarFoto(antes);
        }
      }
      const primerAviso = Object.values(avisos)[0];
      if (primerAviso) toast(`Guardado. Ojo: ${primerAviso}`, 'info', 4500);
      await hoja.cerrar();
    } catch (err) {
      if (err?.errores) mostrarErrores(form, err.errores);
      else {
        console.error(err);
        toast(err?.message || 'No se pudo guardar.', 'error');
      }
    } finally {
      enviar.disabled = false;
    }
  });

  hoja.el.querySelector('.sheet__foot').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-accion]');
    if (!b) return;
    const a = acciones.find((x) => x.id === b.dataset.accion);
    b.disabled = true;
    try {
      await a.ejecutar({ cerrar: hoja.cerrar, form, valores: () => leerValores(form, campos) });
    } catch (err) {
      console.error(err);
      toast(err?.message || 'No se pudo completar la acción.', 'error');
    } finally {
      b.disabled = false;
    }
  });
  return hoja;
}
