// Formularios generados desde los esquemas (src/core/esquemas.js) y CONFIG: render, lectura, validación y hoja inferior.
import { esc, abrirHoja, toast, icon } from './ui.js';
import { unidad, telefono, cedula } from './format.js';

const solo = (v, re) => String(v ?? '').replace(re, '');

function opcionesReferencia(campo, refs, valor) {
  const lista = (refs[campo.coleccion] || []).filter((x) => !x.archivado || x.id === valor);
  const ops = lista
    .slice()
    .sort((a, b) => String(a[campo.mostrar]).localeCompare(String(b[campo.mostrar]), 'es'))
    .map((x) => `<option value="${esc(x.id)}" ${x.id === valor ? 'selected' : ''}>${esc(x[campo.mostrar])}${x.archivado ? ' (archivado)' : ''}</option>`);
  return `<option value="">Selecciona…</option>${ops.join('')}`;
}

function controlHTML(c, valor, refs) {
  const id = `f-${c.clave}`;
  const comun = `id="${id}" name="${c.clave}" aria-describedby="${id}-err${c.ayuda ? ` ${id}-help` : ''}" ${c.requerido ? 'aria-required="true"' : ''}`;
  let v = valor ?? '';
  if (c.tipo === 'telefono') v = telefono(v).replace(/[()]/g, '').replace(' ', '-');
  if (c.tipo === 'cedula') v = cedula(v);
  switch (c.tipo) {
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
    case 'hora':
      return `<input class="input" type="time" ${comun} value="${esc(v)}">`;
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
  const ancho = ['notas', 'texto', 'referencia', 'telefono', 'cedula'].includes(c.tipo) || !c.grupo ? 'field--full' : '';
  return `<div class="field ${ancho}" data-campo="${c.clave}">
    <label class="field__label" for="${id}">${esc(c.etiqueta)}${c.requerido ? ' <span class="req" aria-hidden="true">*</span>' : ''}</label>
    ${controlHTML(c, valor, refs)}
    ${c.ayuda ? `<p class="field__help" id="${id}-help">${esc(c.ayuda)}</p>` : ''}
    <p class="field__error" id="${id}-err" aria-live="polite"></p>
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
      case 'cedula':
        out[c.clave] = solo(t, /\D/g);
        break;
      case 'placa':
        out[c.clave] = solo(t.toUpperCase(), /[^A-Z0-9]/g);
        break;
      case 'numero':
      case 'dinero':
        out[c.clave] = aNumero(t);
        break;
      default:
        out[c.clave] = t;
    }
  }
  return out;
}

export function validar(campos, valores) {
  const err = {};
  for (const c of campos) {
    const v = valores[c.clave];
    const vacio = v === '' || v == null;
    if (vacio) {
      if (c.requerido) err[c.clave] = ['seleccion', 'referencia'].includes(c.tipo) ? 'Selecciona una opción.' : 'Este campo es obligatorio.';
      continue;
    }
    switch (c.tipo) {
      case 'telefono':
        if (!/^(809|829|849)\d{7}$/.test(v)) err[c.clave] = 'Escribe 10 dígitos que empiecen por 809, 829 o 849.';
        break;
      case 'cedula':
        if (!/^\d{11}$/.test(v)) err[c.clave] = 'La cédula tiene 11 dígitos (ej. 001-1234567-8).';
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

export function mostrarErrores(form, errores) {
  let primero = null;
  for (const campo of form.querySelectorAll('[data-campo]')) {
    const clave = campo.dataset.campo;
    const control = campo.querySelector('input, select, textarea');
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

  form.addEventListener('input', (e) => {
    const campo = e.target.closest('[data-campo]');
    if (campo) {
      campo.querySelector('.field__error').textContent = '';
      e.target.removeAttribute('aria-invalid');
    }
  });
  if (alCambiar) form.addEventListener('change', (e) => alCambiar(leerValores(form, campos), form, e.target.name));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = leerValores(form, campos);
    const errores = { ...validar(campos, v), ...(validarExtra?.(v) || {}) };
    if (!mostrarErrores(form, errores)) return;
    enviar.disabled = true;
    try {
      await guardar(v);
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
