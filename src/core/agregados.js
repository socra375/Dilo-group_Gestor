// Cálculos de reportes (puros, sin DOM) y generación de CSV.
import { estadoViaje, fechaClave, inicioSemana, sumarDias } from './time.js';

/**
 * Retrasos agrupados por `campo` ('choferId' | 'rutaId') para viajes con salida en [desde, hasta].
 * Solo cuentan los viajes completados para la puntualidad; "sin llegada" se reporta aparte.
 */
export function retrasosPor(viajes, campo, { desde, hasta, tolerancia, ahora = new Date() }) {
  const grupos = new Map();
  for (const v of viajes) {
    if (v.archivado) continue;
    const dia = fechaClave(v.salidaProg);
    if (dia < desde || dia > hasta) continue;
    const e = estadoViaje(v, ahora, tolerancia);
    const g = grupos.get(v[campo]) ?? { id: v[campo], viajes: 0, completados: 0, retrasados: 0, minRetraso: 0, sinLlegada: 0 };
    g.viajes++;
    if (e.estado === 'completado') {
      g.completados++;
      if (e.puntualidad === 'retrasado') {
        g.retrasados++;
        g.minRetraso += e.retrasoMin;
      }
    } else if (e.estado === 'sin_llegada') g.sinLlegada++;
    grupos.set(v[campo], g);
  }
  return [...grupos.values()]
    .map((g) => ({
      ...g,
      pctATiempo: g.completados ? Math.round(((g.completados - g.retrasados) / g.completados) * 100) : null,
      promRetraso: g.retrasados ? Math.round(g.minRetraso / g.retrasados) : 0,
    }))
    .sort((a, b) => b.retrasados - a.retrasados || b.minRetraso - a.minRetraso);
}

export function totalesRetrasos(filas) {
  const t = filas.reduce(
    (s, g) => ({ viajes: s.viajes + g.viajes, completados: s.completados + g.completados, retrasados: s.retrasados + g.retrasados, minRetraso: s.minRetraso + g.minRetraso, sinLlegada: s.sinLlegada + g.sinLlegada }),
    { viajes: 0, completados: 0, retrasados: 0, minRetraso: 0, sinLlegada: 0 },
  );
  return {
    ...t,
    pctATiempo: t.completados ? Math.round(((t.completados - t.retrasados) / t.completados) * 100) : null,
    promRetraso: t.retrasados ? Math.round(t.minRetraso / t.retrasados) : 0,
  };
}

/** Combustible por 'semana' (lunes) o 'mes', de los últimos `n` periodos hasta `hoy` (incluye periodos vacíos). */
export function combustiblePor(cargas, periodo, { hoy, n }) {
  const claveDe = (fecha) => (periodo === 'semana' ? inicioSemana(fecha) : `${fecha.slice(0, 7)}-01`);
  const claves = [];
  let k = claveDe(hoy);
  for (let i = 0; i < n; i++) {
    claves.unshift(k);
    k = periodo === 'semana' ? sumarDias(k, -7) : claveDe(sumarDias(k, -1));
  }
  const grupos = new Map(claves.map((c) => [c, { periodo: c, cargas: 0, cantidad: 0, monto: 0 }]));
  for (const c of cargas) {
    if (c.archivado) continue;
    const g = grupos.get(claveDe(c.fecha));
    if (!g) continue;
    g.cargas++;
    g.cantidad += c.cantidad || 0;
    g.monto += c.monto || 0;
  }
  return [...grupos.values()].map((g) => ({ ...g, cantidad: Math.round(g.cantidad * 10) / 10, monto: Math.round(g.monto * 100) / 100 }));
}

/** CSV compatible con Excel (BOM UTF-8, coma, CRLF). */
export function aCSV(encabezados, filas) {
  const celda = (v) => {
    const t = v == null ? '' : String(v);
    return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  return `﻿${[encabezados, ...filas].map((f) => f.map(celda).join(',')).join('\r\n')}\r\n`;
}

/**
 * Retrasos por día de los últimos `dias` días (el último es `hoy`). Un viaje cuenta en el día de su salida
 * programada; "retraso" = llegó más tarde que la tolerancia. Siempre devuelve `dias` entradas (con ceros).
 */
export function retrasosPorDia(viajes, { hoy, dias = 7, tolerancia, ahora = new Date() }) {
  const lista = [];
  for (let i = dias - 1; i >= 0; i--) lista.push({ fecha: sumarDias(hoy, -i), viajes: 0, retrasos: 0, minutos: 0 });
  const porFecha = new Map(lista.map((d) => [d.fecha, d]));
  for (const v of viajes) {
    if (v.archivado) continue;
    const d = porFecha.get(fechaClave(v.salidaProg));
    if (!d) continue;
    d.viajes++;
    const e = estadoViaje(v, ahora, tolerancia);
    if (e.puntualidad === 'retrasado') {
      d.retrasos++;
      d.minutos += e.retrasoMin;
    }
  }
  return lista;
}
