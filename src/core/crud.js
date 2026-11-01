// Pantalla genérica de lista + buscar + crear + editar + archivar, generada desde config.
import * as store from '../data/store.js';
import { camposDe, META, GRUPOS } from './esquemas.js';
import { abrirFormulario } from './form.js';
import { esc, icon, vacio, confirmar, toast, conCarga, escalonar } from './ui.js';
import * as fmt from './format.js';
import { pintarFotos } from './fotos.js';

export const normalizar = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export async function cargarRefs(colecciones) {
  const pares = await Promise.all(colecciones.map(async (c) => [c, await store.list(c, { archivados: 'todos' })]));
  return Object.fromEntries(pares);
}

export const porId = (lista = []) => new Map(lista.map((x) => [x.id, x]));

/** Texto visible de un valor según el tipo de campo. */
export function textoCampo(c, v, refs = {}) {
  if (v === '' || v == null) return '';
  switch (c.tipo) {
    case 'fecha': return fmt.fecha(v);
    case 'telefono': return fmt.telefono(v);
    case 'cedula': return fmt.cedula(v);
    case 'dinero': return fmt.dinero(v);
    case 'numero': return c.unidad === 'combustible' ? fmt.cantidad(v) : fmt.numero(v, Number(v) % 1 ? 1 : 0);
    case 'seleccion': return c.opciones.find((o) => o.valor === v)?.etiqueta ?? v;
    case 'referencia': {
      const x = (refs[c.coleccion] || []).find((r) => r.id === v);
      return x ? x[c.mostrar] : '(eliminado)';
    }
    default: return String(v);
  }
}

export function chipSeleccion(c, v) {
  const o = c.opciones?.find((x) => x.valor === v);
  return o ? `<span class="chip chip--${o.tono || 'neutro'}">${esc(o.etiqueta)}</span>` : '';
}

/** Descripción por defecto a partir de `enLista` en config. */
function describirPorDefecto(campos) {
  return (item, refs) => {
    const de = (rol) => campos.filter((c) => c.enLista === rol);
    return {
      titulo: de('titulo').map((c) => textoCampo(c, item[c.clave], refs)).filter(Boolean).join(' · '),
      subtitulo: de('subtitulo').map((c) => textoCampo(c, item[c.clave], refs)).filter(Boolean).join(' → '),
      meta: de('meta').map((c) => textoCampo(c, item[c.clave], refs)).filter(Boolean),
      chips: de('chip').map((c) => chipSeleccion(c, item[c.clave])).join(''),
    };
  };
}

/** Foto redonda (se carga después con pintarFotos) o iniciales si no hay foto. */
export function avatarHTML(fotoId, nombre, clase = '') {
  const iniciales = String(nombre || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
  return `<span class="avatar ${clase}" aria-hidden="true">${fotoId ? `<img alt="" data-foto="${esc(fotoId)}">` : esc(iniciales)}</span>`;
}

export function itemHTML(item, d, accionesHTML = '') {
  return `<li class="item ${item.archivado ? 'item--archived' : ''} ${d.clase || ''}">
    <button type="button" class="item__main" data-editar="${esc(item.id)}" aria-label="${d.etiquetaAccion || 'Editar'} ${esc(d.titulo)}">
      ${d.avatar !== undefined ? avatarHTML(d.avatar, d.titulo) : ''}
      <span class="item__body">
        <span class="item__title">${esc(d.titulo)}</span>
        ${d.subtitulo ? `<span class="item__subtitle">${esc(d.subtitulo)}</span>` : ''}
        ${d.meta?.length ? `<span class="item__meta">${d.meta.map((m) => `<span>${esc(m)}</span>`).join('')}</span>` : ''}
        ${d.extra || ''}
      </span>
      <span class="item__aside">${item.archivado ? '<span class="chip chip--neutro">Archivado</span>' : d.chips || ''}</span>
    </button>
    ${accionesHTML ? `<div class="item__actions">${accionesHTML}</div>` : ''}
  </li>`;
}

/**
 * Opciones:
 *   modulo, titulo, pestana, refsDe: colecciones a cargar como referencia
 *   describir(item, refs) → { titulo, subtitulo, meta[], chips, extra, clase }
 *   ordenar(a, b), alEditar(item) → valores del formulario, alGuardar(valores, existente, refs) → datos a guardar
 *   validarExtra(valores), alCambiar(valores, form, campo, refs)
 *   accionesItem(item, refs) → HTML de botones con data-accion; alAccion(accion, item, ctx)
 *   cabecera(refs) → HTML sobre la lista; textoVacio
 */
export function pantallaCrud(op) {
  const meta = META[op.modulo];
  const campos = camposDe(op.modulo);
  const describir = op.describir || describirPorDefecto(campos);
  const buscables = campos.filter((c) => c.buscable);
  const singular = meta.singular;
  const nuevo = `${meta.femenino ? 'Nueva' : 'Nuevo'} ${singular}`;
  const guardado = `${singular[0].toUpperCase()}${singular.slice(1)} ${meta.femenino ? 'guardada' : 'guardado'}.`;
  const coleccion = op.coleccion || op.modulo;

  return {
    titulo: op.titulo,
    pestana: op.pestana,
    async render(el, params = {}) {
      const estado = { q: params.q || '', archivados: params.archivados === '1' };
      el.classList.add('view--ancha');
      el.innerHTML = `
        ${op.cabeceraFija || ''}
        <div class="search">${icon('search')}<label class="sr-only" for="buscar">Buscar</label>
          <input class="input" id="buscar" type="search" placeholder="Buscar ${esc(op.titulo.toLowerCase())}…" autocomplete="off" value="${esc(estado.q)}"></div>
        <div class="filters" role="group" aria-label="Filtro">
          <button type="button" class="filter" data-filtro="0" aria-pressed="${!estado.archivados}">Activos</button>
          <button type="button" class="filter" data-filtro="1" aria-pressed="${estado.archivados}">Archivados</button>
        </div>
        <div data-cabecera></div>
        <ul class="list" data-lista aria-live="polite"></ul>
        <button type="button" class="btn btn--primary fab" data-nuevo>${icon('plus')}${esc(nuevo)}</button>`;

      const lista = el.querySelector('[data-lista]');
      let refs = {};
      let items = [];

      const pintar = (animar = false) => {
        const q = normalizar(estado.q);
        const visibles = items.filter((it) => {
          if (Boolean(it.archivado) !== estado.archivados) return false;
          if (!q) return true;
          const texto = buscables.map((c) => `${it[c.clave] ?? ''} ${textoCampo(c, it[c.clave], refs)}`).join(' ');
          return normalizar(texto).includes(q);
        });
        if (!visibles.length) {
          lista.innerHTML = q
            ? `<li>${vacio({ icono: 'search', titulo: 'Sin resultados', texto: `No hay ${op.titulo.toLowerCase()} que coincidan con “${estado.q}”.` })}</li>`
            : estado.archivados
              ? `<li>${vacio({ icono: 'archive', titulo: 'Nada archivado', texto: 'Lo que archives aparecerá aquí y podrás restaurarlo.' })}</li>`
              : `<li>${vacio({ icono: op.icono || 'inbox', titulo: `Aún no hay ${op.titulo.toLowerCase()}`, texto: op.textoVacio || `Toca “${nuevo}” para agregar ${meta.femenino ? 'la primera' : 'el primero'}.` })}</li>`;
          return;
        }
        lista.innerHTML = visibles.map((it) => itemHTML(it, describir(it, refs), it.archivado ? '' : op.accionesItem?.(it, refs) || '')).join('');
        if (animar) escalonar(lista);
        pintarFotos(lista);
      };

      const cargar = async (animar) => {
        const [r, todos] = await conCarga(lista, Promise.all([cargarRefs(op.refsDe || []), store.list(coleccion, { archivados: 'todos' })]));
        refs = r;
        items = op.ordenar ? todos.sort(op.ordenar) : todos;
        el.querySelector('[data-cabecera]').innerHTML = op.cabecera?.(refs, items) || '';
        pintar(animar);
      };

      const abrir = (item) => {
        const acciones = [];
        if (item) {
          acciones.push(
            item.archivado
              ? { id: 'restaurar', etiqueta: 'Restaurar', icono: 'restore', clase: 'btn--secondary', ejecutar: async ({ cerrar }) => {
                  await store.update(coleccion, item.id, { archivado: false });
                  toast('Restaurado.');
                  await cerrar();
                  await cargar();
                } }
              : { id: 'archivar', etiqueta: 'Archivar', icono: 'archive', clase: 'btn--ghost', ejecutar: async ({ cerrar }) => {
                  const d = describir(item, refs);
                  const ok = await confirmar({
                    titulo: `¿Archivar ${d.titulo}?`,
                    mensaje: 'Dejará de aparecer en las listas y formularios. Podrás restaurarlo desde “Archivados”.',
                    confirmar: 'Archivar',
                    peligro: true,
                  });
                  if (!ok) return;
                  await store.update(coleccion, item.id, { archivado: true });
                  toast('Archivado.');
                  await cerrar();
                  await cargar();
                } },
          );
        }
        abrirFormulario({
          titulo: item ? `Editar ${singular}` : nuevo,
          campos,
          valores: item ? (op.alEditar ? op.alEditar(item) : item) : op.valoresNuevos?.(refs) || {},
          refs,
          grupos: { ...GRUPOS, ...op.grupos },
          acciones,
          validarExtra: op.validarExtra,
          alCambiar: op.alCambiar ? (v, form, campo) => op.alCambiar(v, form, campo, refs) : undefined,
          guardar: async (v) => {
            const datos = op.alGuardar ? await op.alGuardar(v, item, refs) : v;
            if (item) await store.update(coleccion, item.id, datos);
            else await store.create(coleccion, datos);
            toast(item ? 'Cambios guardados.' : guardado);
            await cargar();
          },
        });
      };

      el.addEventListener('input', (e) => {
        if (e.target.id === 'buscar') {
          estado.q = e.target.value;
          pintar();
        }
      });
      el.addEventListener('click', async (e) => {
        const f = e.target.closest('[data-filtro]');
        if (f) {
          estado.archivados = f.dataset.filtro === '1';
          el.querySelectorAll('[data-filtro]').forEach((b) => b.setAttribute('aria-pressed', String(b === f)));
          return pintar(true);
        }
        if (e.target.closest('[data-nuevo]')) return abrir(null);
        const acc = e.target.closest('[data-accion]');
        if (acc && op.alAccion) {
          const item = items.find((x) => x.id === acc.dataset.id);
          acc.disabled = true;
          try {
            await op.alAccion(acc.dataset.accion, item, { refs, recargar: cargar });
          } catch (err) {
            console.error(err);
            toast(err?.message || 'No se pudo completar la acción.', 'error');
          } finally {
            acc.disabled = false;
          }
          return;
        }
        const ed = e.target.closest('[data-editar]');
        if (!ed) return;
        const item = items.find((x) => x.id === ed.dataset.editar);
        // Algunos módulos muestran primero una ficha (p. ej. chofer con Llamar y WhatsApp) que lleva a editar.
        if (op.alAbrir && !item.archivado) op.alAbrir(item, { refs, editar: () => abrir(item), recargar: cargar });
        else abrir(item);
      });

      await cargar(true);
      if (params.nuevo === '1') abrir(null);
      // Desde un aviso: "#/vehiculos?abrir=<id>" abre la ficha o el formulario de ese registro.
      const pedido = params.abrir && items.find((x) => x.id === params.abrir);
      if (pedido) {
        if (op.alAbrir && !pedido.archivado) op.alAbrir(pedido, { refs, editar: () => abrir(pedido), recargar: cargar });
        else abrir(pedido);
      }
    },
  };
}
