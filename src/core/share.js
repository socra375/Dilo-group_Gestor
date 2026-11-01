// Enlaces de contacto y compartir (WhatsApp, llamada).
// Los teléfonos dominicanos (809/829/849) se marcan con el código de país 1.

const digitos = (tel) => String(tel || '').replace(/\D/g, '');

/** Número en formato internacional para RD: '8095550101' → '18095550101'. null si no es un número usable. */
export function internacional(tel) {
  const d = digitos(tel);
  if (d.length === 10) return `1${d}`;
  if (d.length === 11 && d.startsWith('1')) return d;
  return null;
}

export function enlaceLlamada(tel) {
  const n = internacional(tel);
  return n ? `tel:+${n}` : null;
}

/** Chat de WhatsApp con un número (y texto opcional). Sin número abre "elegir contacto". */
export function enlaceWhatsApp(tel, texto = '') {
  const n = tel ? internacional(tel) : '';
  if (tel && !n) return null;
  return `https://wa.me/${n || ''}${texto ? `?text=${encodeURIComponent(texto)}` : ''}`;
}

// ---------- Reportes para WhatsApp ----------
// Texto limpio: líneas cortas, sin tablas ni columnas. WhatsApp pone en negrita lo que va entre *asteriscos*.

import { CONFIG } from '../config.js';
import { fecha as fechaTexto, fechaLarga, dinero, numero, unidad } from './format.js';
import { formatoDuracion } from './time.js';

const MAX_LINEA = 110; // una línea más larga se corta con "…" para que no se rompa fea en el teléfono
const corta = (t) => (t.length > MAX_LINEA ? `${t.slice(0, MAX_LINEA - 1).trimEnd()}…` : t);
const plural = (n, uno, varios) => `${numero(n)} ${n === 1 ? uno : varios}`;
const cap = (t) => t.replace(/^./, (c) => c.toUpperCase());
const MAX_ITEMS = 8; // por sección; el resto se resume en "y N más"

/** '38.9 galones', '1 galón', '12 litros': la palabra completa se lee mejor en un chat que "gal". */
function cantidadTexto(n) {
  const v = Math.round((Number(n) || 0) * 10) / 10;
  const nombre = CONFIG.combustible.unidad === 'litros' ? (v === 1 ? 'litro' : 'litros') : v === 1 ? 'galón' : 'galones';
  return `${numero(v, v % 1 ? 1 : 0)} ${nombre}`;
}

function lista(items, vacio) {
  if (!items.length) return [vacio];
  const lineas = items.slice(0, MAX_ITEMS).map((t) => corta(`• ${t}`));
  if (items.length > MAX_ITEMS) lineas.push(`• y ${items.length - MAX_ITEMS} más`);
  return lineas;
}

const encabezado = (titulo, subtitulo) => [`*${CONFIG.empresa.nombre} · ${titulo}*`, subtitulo, ''];

/**
 * Resumen diario del supervisor.
 * @param {object} d  { fecha, viajes, completados, sinLlegada, retrasados:[{ruta,hora,min,chofer,motivo}],
 *                      galones, monto, cargas, avisos:[{severidad,titulo,texto}] | null }
 */
export function resumenDiarioTexto(d) {
  const partesViajes = [];
  if (d.completados) partesViajes.push(plural(d.completados, 'completado', 'completados'));
  if (d.sinLlegada) partesViajes.push(`${plural(d.sinLlegada, 'sin llegada registrada', 'sin llegada registrada')}`);
  const out = [
    ...encabezado('Resumen del día', cap(fechaLarga(d.fecha)) + ` · ${fechaTexto(d.fecha)}`),
    `*Viajes:* ${numero(d.viajes)}${partesViajes.length ? ` (${partesViajes.join(', ')})` : ''}`,
    `*Retrasos:* ${numero(d.retrasados.length)}`,
    ...(d.retrasados.length ? lista(d.retrasados.map((r) => `${r.ruta} ${r.hora}: +${formatoDuracion(r.min)}${r.chofer ? ` · ${r.chofer}` : ''}${r.motivo ? ` · ${r.motivo}` : ''}`)) : []),
    `*Combustible:* ${d.cargas ? `${cantidadTexto(d.galones)} · ${dinero(d.monto)} (${plural(d.cargas, 'carga', 'cargas')})` : 'sin cargas'}`,
  ];
  if (d.avisos) {
    out.push(`*Avisos:* ${d.avisos.length ? numero(d.avisos.length) : 'ninguno'}`);
    if (d.avisos.length) out.push(...lista(d.avisos.map((a) => `${a.severidad === 'urgente' ? 'Urgente' : 'Atención'}: ${a.titulo} — ${a.texto}`)));
  }
  return out.join('\n');
}

/** Retrasos por chofer o por ruta. `filas`: [{ nombre, viajes, retrasados, pctATiempo, promRetraso, sinLlegada }] */
export function retrasosTexto({ titulo, periodo, filas, totales }) {
  const pct = (n) => (n == null ? '—' : `${n} %`);
  return [
    ...encabezado(titulo, periodo),
    `*Total:* ${plural(totales.viajes, 'viaje', 'viajes')} · ${plural(totales.retrasados, 'retraso', 'retrasos')} · a tiempo ${pct(totales.pctATiempo)}`,
    '',
    ...lista(filas.map((f) => `${f.nombre}: ${plural(f.retrasados, 'retraso', 'retrasos')} de ${plural(f.viajes, 'viaje', 'viajes')}${f.retrasados ? ` (prom. ${f.promRetraso} min)` : ''}${f.sinLlegada ? ` · ${f.sinLlegada} sin llegada` : ''}`), 'Sin viajes en este periodo.'),
  ].join('\n');
}

/** Combustible por semana o por mes. `filas`: [{ etiqueta, cargas, cantidad, monto }] */
export function combustiblePeriodoTexto({ titulo, filas }) {
  const t = filas.reduce((s, f) => ({ cargas: s.cargas + f.cargas, cantidad: s.cantidad + f.cantidad, monto: s.monto + f.monto }), { cargas: 0, cantidad: 0, monto: 0 });
  return [
    ...encabezado(titulo, `${cantidadTexto(t.cantidad)} · ${dinero(t.monto)} en total`),
    ...lista(filas.filter((f) => f.cargas).map((f) => `${f.etiqueta}: ${cantidadTexto(f.cantidad)} · ${dinero(f.monto)} (${plural(f.cargas, 'carga', 'cargas')})`), 'Sin cargas en este periodo.'),
  ].join('\n');
}

/** Combustible por vehículo. `filas`: [{ placa, cargas, galones, monto, precioGalon, kmGal }] */
export function combustibleVehiculoTexto({ titulo, periodo, filas }) {
  const total = filas.reduce((s, f) => ({ galones: s.galones + f.galones, monto: s.monto + f.monto }), { galones: 0, monto: 0 });
  return [
    ...encabezado(titulo, periodo),
    `*Total:* ${cantidadTexto(total.galones)} · ${dinero(total.monto)}`,
    '',
    ...lista(filas.map((f) => `${f.placa}: ${cantidadTexto(f.galones)} · ${dinero(f.monto)}${f.kmGal != null ? ` · ${numero(f.kmGal, 1)} km/${unidad()}` : ''}`), 'Sin cargas en este periodo.'),
  ].join('\n');
}

/** Enlace de respaldo cuando el navegador no tiene la hoja de compartir. */
export const enlaceWhatsAppTexto = (texto) => `https://wa.me/?text=${encodeURIComponent(texto)}`;

/**
 * Comparte el texto con la hoja de compartir del sistema (Web Share API); si no existe, abre WhatsApp con el
 * texto ya escrito. Devuelve 'compartido' | 'cancelado' | 'whatsapp'.
 */
export async function compartirWhatsApp(texto) {
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ text: texto });
      return 'compartido';
    } catch (e) {
      if (e?.name === 'AbortError') return 'cancelado'; // la persona cerró la hoja: no es un error
      // Cualquier otro fallo: cae al enlace de WhatsApp.
    }
  }
  window.open(enlaceWhatsAppTexto(texto), '_blank', 'noopener');
  return 'whatsapp';
}
