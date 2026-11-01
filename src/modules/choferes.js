// Choferes: ficha con Llamar y WhatsApp, foto y vencimiento de licencia. (La asistencia está en su propio módulo.)
import { pantallaCrud, avatarHTML, porId } from '../core/crud.js';
import { hoyClave } from '../core/time.js';
import { avisoLicencia as calcularLicencia } from '../core/avisos.js';
import { enlaceLlamada, enlaceWhatsApp } from '../core/share.js';
import { pintarFotos } from '../core/fotos.js';
import * as fmt from '../core/format.js';
import { esc, icon, abrirHoja } from '../core/ui.js';


/** Aviso de licencia para mostrar: { tono: 'error' | 'aviso', texto } o null. */
export function avisoLicencia(chofer, hoy = hoyClave()) {
  const a = calcularLicencia(chofer, hoy);
  return a && { tono: a.severidad === 'urgente' ? 'error' : 'aviso', texto: a.texto, severidad: a.severidad };
}

// ---------- Ficha ----------

function botonesContacto(c, compacto = false) {
  const tel = enlaceLlamada(c.telefono);
  const wa = enlaceWhatsApp(c.telefono);
  if (compacto) {
    return `${tel ? `<a class="icon-btn icon-btn--primary" href="${tel}" aria-label="Llamar a ${esc(c.nombre)}">${icon('phone')}</a>` : ''}${wa ? `<a class="icon-btn icon-btn--whatsapp" href="${wa}" target="_blank" rel="noopener" aria-label="WhatsApp a ${esc(c.nombre)}">${icon('whatsapp')}</a>` : ''}`;
  }
  if (!tel) return '<p class="muted">Sin teléfono registrado.</p>';
  return `<div class="row">
    <a class="btn btn--primary grow" href="${tel}">${icon('phone')}Llamar</a>
    <a class="btn btn--whatsapp grow" href="${wa}" target="_blank" rel="noopener">${icon('whatsapp')}WhatsApp</a>
  </div>`;
}

function abrirFicha(c, { refs, editar }) {
  const veh = porId(refs.vehiculos).get(c.vehiculoId);
  const aviso = avisoLicencia(c);
  const fila = (t, v) => (v ? `<dt>${esc(t)}</dt><dd>${v}</dd>` : '');
  const telEmergencia = enlaceLlamada(c.contactoTelefono);
  const hoja = abrirHoja({
    titulo: 'Ficha del chofer',
    contenido: `<div class="ficha">
      <div class="ficha__cabeza">${avatarHTML(c.fotoId, c.nombre, 'avatar--grande')}
        <div class="stack" style="gap:var(--sp-1)"><h3 class="ficha__nombre">${esc(c.nombre)}</h3>
          ${c.cedula ? `<span class="muted">Cédula ${esc(fmt.cedula(c.cedula))}</span>` : ''}
          ${aviso ? `<span class="chip chip--${aviso.tono}">${esc(aviso.texto)}</span>` : ''}</div>
      </div>
      ${botonesContacto(c)}
      <dl class="kv">
        ${fila('Teléfono', esc(fmt.telefono(c.telefono)))}
        ${fila('Dirección', esc(c.direccion))}
        ${fila('Licencia', esc([c.licencia, c.licenciaVence && `vence ${fmt.fecha(c.licenciaVence)}`].filter(Boolean).join(' · ')))}
        ${fila('Emergencia', c.contactoNombre || c.contactoTelefono ? `${esc(c.contactoNombre || '')}${telEmergencia ? ` · <a href="${telEmergencia}">${esc(fmt.telefono(c.contactoTelefono))}</a>` : ''}` : '')}
        ${fila('Vehículo', esc(veh ? `${veh.placa} · ${veh.descripcion || ''}` : ''))}
        ${fila('Ingreso', esc(c.fechaIngreso ? fmt.fecha(c.fechaIngreso) : ''))}
        ${fila('Notas', esc(c.notas))}
      </dl>
    </div>`,
    pie: `<button type="button" class="btn btn--primary" data-editar-ficha>${icon('edit')}Editar</button>`,
  });
  pintarFotos(hoja.el);
  hoja.el.querySelector('[data-editar-ficha]').addEventListener('click', async () => {
    await hoja.cerrar();
    editar();
  });
}

// ---------- Pantalla ----------

export default pantallaCrud({
  modulo: 'choferes',
  titulo: 'Choferes',
  pestana: 'choferes',
  icono: 'user',
  refsDe: ['vehiculos'],
  ordenar: (a, b) => a.nombre.localeCompare(b.nombre, 'es'),
  alAbrir: abrirFicha,
  describir(c, refs) {
    const aviso = avisoLicencia(c);
    const veh = porId(refs.vehiculos).get(c.vehiculoId);
    return {
      titulo: c.nombre,
      etiquetaAccion: 'Ver ficha de',
      avatar: c.fotoId || null,
      subtitulo: fmt.telefono(c.telefono),
      meta: [veh ? `Vehículo ${veh.placa}` : '', c.licenciaVence && !aviso ? `Licencia vence ${fmt.fecha(c.licenciaVence)}` : ''].filter(Boolean),
      extra: aviso ? `<span class="chip chip--${aviso.tono}">${esc(aviso.texto)}</span>` : '',
      clase: aviso ? `item--${aviso.tono === 'error' ? 'error' : 'warn'}` : '',
    };
  },
  accionesItem(c) {
    return botonesContacto(c, true);
  },
});
