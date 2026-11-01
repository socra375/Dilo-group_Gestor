// Cálculo de avisos (funciones puras, sin DOM; probadas en tests/avisos.test.js).
// Severidad: 'urgente' (vencido o muy próximo) | 'atencion'.
import { CONFIG } from '../config.js';
import { diasEntre } from './time.js';

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

/**
 * Vencimiento por fecha con umbrales escalonados (p. ej. [30, 15, 7] días).
 * null = sin fecha o todavía lejos. Vencido o dentro del umbral menor → urgente; el resto → atención.
 */
export function vencimiento(venceClave, hoy, dias) {
  if (!venceClave) return null;
  const faltan = diasEntre(hoy, venceClave);
  const umbrales = [...dias].sort((a, b) => a - b);
  if (faltan > umbrales[umbrales.length - 1]) return null;
  const severidad = faltan <= umbrales[0] ? 'urgente' : 'atencion';
  const texto = faltan < 0 ? `venció hace ${plural(-faltan, 'día', 'días')}` : faltan === 0 ? 'vence hoy' : `vence en ${plural(faltan, 'día', 'días')}`;
  // Umbral alcanzado (30, 15 o 7): útil para mostrar "a 15 días".
  const umbral = faltan < 0 ? 0 : umbrales.find((u) => faltan <= u);
  return { severidad, dias: faltan, umbral, texto, vencido: faltan < 0 };
}

export function avisoLicencia(chofer, hoy, op = CONFIG.avisos.licencia) {
  if (!op?.activo || chofer.archivado) return null;
  const v = vencimiento(chofer.licenciaVence, hoy, op.dias);
  return v && { tipo: 'licencia', ...v, texto: `Licencia ${v.texto}` };
}

export function avisoSeguro(vehiculo, hoy, op = CONFIG.avisos.seguro) {
  if (!op?.activo || vehiculo.archivado) return null;
  const v = vencimiento(vehiculo.seguroVence, hoy, op.dias);
  return v && { tipo: 'seguro', ...v, texto: `Seguro ${v.texto}` };
}

/**
 * Mantenimiento pendiente: la fecha está a `op.dias` o menos, o faltan `op.km` o menos según el último
 * kilometraje registrado (de las cargas de combustible). Si ya pasó la fecha o el km → urgente.
 */
export function avisoMantenimiento(vehiculo, hoy, ultimoKm, op = CONFIG.avisos.mantenimiento) {
  if (!op?.activo || vehiculo.archivado) return null;
  const motivos = [];
  let urgente = false;
  if (vehiculo.mantenimientoFecha) {
    const faltan = diasEntre(hoy, vehiculo.mantenimientoFecha);
    if (faltan <= op.dias) {
      motivos.push(faltan < 0 ? `fecha pasada hace ${plural(-faltan, 'día', 'días')}` : faltan === 0 ? 'toca hoy' : `toca en ${plural(faltan, 'día', 'días')}`);
      urgente ||= faltan < 0;
    }
  }
  if (vehiculo.mantenimientoKm != null && vehiculo.mantenimientoKm !== '' && ultimoKm != null) {
    const restan = Number(vehiculo.mantenimientoKm) - Number(ultimoKm);
    if (restan <= op.km) {
      motivos.push(restan < 0 ? `se pasó por ${Math.abs(restan).toLocaleString('es-DO')} km` : `faltan ${restan.toLocaleString('es-DO')} km`);
      urgente ||= restan < 0;
    }
  }
  if (!motivos.length) return null;
  return { tipo: 'mantenimiento', severidad: urgente ? 'urgente' : 'atencion', texto: `Mantenimiento: ${motivos.join(' y ')}` };
}

/** Último kilometraje registrado por vehículo (máximo de sus cargas no archivadas). */
export function ultimosKm(cargas) {
  const km = new Map();
  for (const c of cargas) {
    if (c.archivado || c.km == null || c.km === '') continue;
    km.set(c.vehiculoId, Math.max(km.get(c.vehiculoId) ?? 0, Number(c.km)));
  }
  return km;
}
