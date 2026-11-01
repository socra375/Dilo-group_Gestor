// Fechas y horas en la zona del negocio (America/Santo_Domingo por defecto).
// Todos los instantes se guardan como ISO UTC; "fecha clave" = 'YYYY-MM-DD' y "hora clave" = 'HH:MM'
// siempre interpretadas en la zona del negocio, sin importar la zona del teléfono.
import { CONFIG } from '../config.js';

const MIN = 60000;
const ZONA = CONFIG.empresa.zona;

const formateadores = new Map();
function partes(fecha, tz) {
  let f = formateadores.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    formateadores.set(tz, f);
  }
  const p = {};
  for (const { type, value } of f.formatToParts(fecha)) p[type] = Number(value);
  return p;
}

/** Diferencia en minutos entre la hora local de `tz` y UTC en ese instante. */
export function desfaseMin(fecha, tz = ZONA) {
  const p = partes(fecha, tz);
  const comoUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((comoUTC - Math.floor(fecha.getTime() / 1000) * 1000) / MIN);
}

/** 'YYYY-MM-DD' + 'HH:MM' en la zona del negocio → ISO UTC. */
export function aISO(fechaClave, horaClave, tz = ZONA) {
  const [y, m, d] = fechaClave.split('-').map(Number);
  const [hh, mm] = horaClave.split(':').map(Number);
  const supuesto = Date.UTC(y, m - 1, d, hh, mm);
  let ts = supuesto - desfaseMin(new Date(supuesto), tz) * MIN;
  // Segunda pasada por si el desfase cambia justo en ese tramo (horario de verano en otras zonas).
  ts = supuesto - desfaseMin(new Date(ts), tz) * MIN;
  return new Date(ts).toISOString();
}

const dos = (n) => String(n).padStart(2, '0');

/** Instante → 'YYYY-MM-DD' en la zona del negocio. */
export function fechaClave(instante, tz = ZONA) {
  const p = partes(new Date(instante), tz);
  return `${p.year}-${dos(p.month)}-${dos(p.day)}`;
}

/** Instante → 'HH:MM' (24 h) en la zona del negocio. Útil para valores de <input type="time">. */
export function horaClave(instante, tz = ZONA) {
  const p = partes(new Date(instante), tz);
  return `${dos(p.hour)}:${dos(p.minute)}`;
}

export function hoyClave(ahora = new Date(), tz = ZONA) {
  return fechaClave(ahora, tz);
}

/** Aritmética de calendario sobre fechas clave. */
export function sumarDias(clave, n) {
  const [y, m, d] = clave.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${dos(t.getUTCMonth() + 1)}-${dos(t.getUTCDate())}`;
}

/** Día de la semana de una fecha clave: 0 = domingo … 6 = sábado. */
export function diaSemana(clave) {
  const [y, m, d] = clave.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Lunes de la semana de una fecha clave. */
export function inicioSemana(clave) {
  const dia = diaSemana(clave);
  return sumarDias(clave, dia === 0 ? -6 : 1 - dia);
}

/** Días de calendario entre dos fechas clave (b − a). */
export function diasEntre(a, b) {
  const t = (c) => Date.UTC(...c.split('-').map((n, i) => Number(n) - (i === 1 ? 1 : 0)));
  return Math.round((t(b) - t(a)) / 86400000);
}

export function minutosEntre(desdeISO, hastaISO) {
  return Math.round((new Date(hastaISO) - new Date(desdeISO)) / MIN);
}

export function sumarMinutos(iso, min) {
  return new Date(new Date(iso).getTime() + min * MIN).toISOString();
}

/**
 * Convierte 'HH:MM' en el instante MÁS CERCANO a `referenciaISO` (ayer, hoy o mañana).
 * Así una llegada real a las 00:10 de un viaje programado para las 23:55 cae en el día siguiente,
 * y una llegada a las 23:50 de un viaje programado para las 00:05 cae en el día anterior.
 */
export function horaCercana(hora, referenciaISO, tz = ZONA) {
  const base = fechaClave(referenciaISO, tz);
  const ref = new Date(referenciaISO).getTime();
  let mejor = null;
  for (const d of [-1, 0, 1]) {
    const iso = aISO(sumarDias(base, d), hora, tz);
    const dist = Math.abs(new Date(iso).getTime() - ref);
    if (!mejor || dist < mejor.dist) mejor = { iso, dist };
  }
  return mejor.iso;
}

/** Convierte 'HH:MM' en el primer instante igual o posterior a `desdeISO` (cruce de medianoche). */
export function horaDespues(hora, desdeISO, tz = ZONA) {
  const iso = aISO(fechaClave(desdeISO, tz), hora, tz);
  return new Date(iso) < new Date(desdeISO) ? aISO(sumarDias(fechaClave(desdeISO, tz), 1), hora, tz) : iso;
}

/** 75 → '1 h 15 min'; 40 → '40 min'. */
export function formatoDuracion(min) {
  const m = Math.abs(Math.round(min));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

/**
 * Estado de un viaje.
 *   estado:      'programado' | 'en_ruta' | 'sin_llegada' | 'completado'
 *   puntualidad: 'a_tiempo' | 'retrasado' | null (solo para completados)
 *   retrasoMin:  llegada real − llegada programada (negativo = llegó antes); null si no ha llegado
 * Un viaje cuenta como retrasado solo si el retraso SUPERA la tolerancia.
 */
export function estadoViaje(viaje, ahora = new Date(), toleranciaMin = CONFIG.viajes.tolerancia_min) {
  const t = new Date(ahora).getTime();
  if (viaje.llegadaReal) {
    const retrasoMin = minutosEntre(viaje.llegadaProg, viaje.llegadaReal);
    const tarde = retrasoMin > toleranciaMin;
    return {
      estado: 'completado',
      puntualidad: tarde ? 'retrasado' : 'a_tiempo',
      retrasoMin,
      salidaAtrasada: false,
      etiqueta: tarde ? `Retrasado (+${formatoDuracion(retrasoMin)})` : 'A tiempo',
    };
  }
  const base = { puntualidad: null, retrasoMin: null };
  if (t > new Date(viaje.llegadaProg).getTime()) {
    return { ...base, estado: 'sin_llegada', salidaAtrasada: !viaje.salidaReal, etiqueta: 'Sin llegada registrada' };
  }
  if (viaje.salidaReal) return { ...base, estado: 'en_ruta', salidaAtrasada: false, etiqueta: 'En ruta' };
  return {
    ...base,
    estado: 'programado',
    salidaAtrasada: t > new Date(viaje.salidaProg).getTime(),
    etiqueta: 'Programado',
  };
}

/** Estado de una licencia: null (sin fecha), 'vigente', 'por_vencer' (≤ dias) o 'vencida'. */
export function estadoLicencia(venceClave, hoy, dias = Math.max(...CONFIG.avisos.licencia.dias)) {
  if (!venceClave) return { estado: null, dias: null };
  const d = diasEntre(hoy, venceClave);
  return { estado: d < 0 ? 'vencida' : d <= dias ? 'por_vencer' : 'vigente', dias: d };
}
