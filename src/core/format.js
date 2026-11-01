// Formatos visibles (es-DO): horas 12 h con a. m./p. m., dinero RD$, fechas cortas.
import { CONFIG } from '../config.js';
import { LOCALE as locale, MONEDA_ISO as moneda } from './esquemas.js';

const tz = CONFIG.empresa.zona;

const fmtDinero = new Intl.NumberFormat(locale, { style: 'currency', currency: moneda, minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDineroCorto = new Intl.NumberFormat(locale, { style: 'currency', currency: moneda, maximumFractionDigits: 0 });
const fmtHora = new Intl.DateTimeFormat(locale, { timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true });
const fmtFechaCorta = new Intl.DateTimeFormat(locale, { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });
const fmtFechaLarga = new Intl.DateTimeFormat(locale, { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' });
const fmtFechaNum = new Intl.DateTimeFormat(locale, { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric' });
const fmtMes = new Intl.DateTimeFormat(locale, { timeZone: 'UTC', month: 'long', year: 'numeric' });

export const dinero = (n) => fmtDinero.format(Number(n) || 0);
export const dineroCorto = (n) => fmtDineroCorto.format(Number(n) || 0);

export function numero(n, decimales = 0) {
  return new Intl.NumberFormat(locale, { minimumFractionDigits: decimales, maximumFractionDigits: decimales }).format(Number(n) || 0);
}

export const hora = (iso) => (iso ? fmtHora.format(new Date(iso)) : '—');

// Las fechas clave ('YYYY-MM-DD') se formatean a mediodía UTC para que ninguna zona las corra de día.
const deClave = (clave) => new Date(`${clave}T12:00:00Z`);
export const fecha = (clave) => (clave ? fmtFechaNum.format(deClave(clave)) : '—');
export const fechaCorta = (clave) => (clave ? fmtFechaCorta.format(deClave(clave)) : '—');
export const fechaLarga = (clave) => (clave ? fmtFechaLarga.format(deClave(clave)) : '—');
export const fechaNum = (clave) => (clave ? fmtFechaNum.format(deClave(clave)) : '—');
export const mes = (clave) => (clave ? fmtMes.format(deClave(clave)) : '—');

const UNIDADES = { galones: { corta: 'gal', larga: 'galones' }, litros: { corta: 'L', larga: 'litros' } };
export const unidad = (forma = 'corta') => (UNIDADES[CONFIG.combustible.unidad] || UNIDADES.galones)[forma];
export const cantidad = (n) => `${numero(n, Number(n) % 1 ? 1 : 0)} ${unidad()}`;

/** '8095550142' → '(809) 555-0142' */
export function telefono(v) {
  const d = String(v || '').replace(/\D/g, '');
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : v || '';
}

/** '00112345678' → '001-1234567-8' */
export function cedula(v) {
  const d = String(v || '').replace(/\D/g, '');
  return d.length === 11 ? `${d.slice(0, 3)}-${d.slice(3, 10)}-${d.slice(10)}` : v || '';
}

export function plural(n, uno, varios) {
  return `${numero(n)} ${n === 1 ? uno : varios}`;
}
