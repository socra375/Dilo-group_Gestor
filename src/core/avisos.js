// Cálculo de avisos (funciones puras, sin DOM; probadas en tests/avisos.test.js).
// Severidad: 'urgente' (vencido o muy próximo) | 'atencion'.
import { CONFIG } from '../config.js';
import { avisosConfig } from './prefs.js';
import { diasEntre, estadoViaje, fechaClave, sumarDias, formatoDuracion } from './time.js';

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

export function avisoLicencia(chofer, hoy, op = avisosConfig().licencia) {
  if (!op?.activo || chofer.archivado) return null;
  const v = vencimiento(chofer.licenciaVence, hoy, op.dias);
  return v && { tipo: 'licencia', ...v, texto: `Licencia ${v.texto}` };
}

export function avisoSeguro(vehiculo, hoy, op = avisosConfig().seguro) {
  if (!op?.activo || vehiculo.archivado) return null;
  const v = vencimiento(vehiculo.seguroVence, hoy, op.dias);
  return v && { tipo: 'seguro', ...v, texto: `Seguro ${v.texto}` };
}

/**
 * Mantenimiento pendiente: la fecha está a `op.dias` o menos, o faltan `op.km` o menos según el último
 * kilometraje registrado (de las cargas de combustible). Si ya pasó la fecha o el km → urgente.
 */
export function avisoMantenimiento(vehiculo, hoy, ultimoKm, op = avisosConfig().mantenimiento) {
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

// ---------- Combustible: rendimiento (km/galón) ----------

const ordenCarga = (a, b) => `${a.fecha} ${a.hora || '00:00'}`.localeCompare(`${b.fecha} ${b.hora || '00:00'}`);
const tieneKm = (c) => c.km != null && c.km !== '' && Number.isFinite(Number(c.km));

/**
 * Rendimiento de cada carga, método "tanque lleno a tanque lleno": en una carga de tanque lleno,
 * km/gal = (km actual − km de la carga llena anterior) ÷ galones echados desde esa carga (incluida esta).
 * Así las cargas parciales intermedias cuentan sin falsear el cálculo.
 * Devuelve Map(idCarga → { kmGal, distancia, galones } | { kmGal: null, motivo }).
 *   motivos: 'primera' (no hay carga llena anterior), 'parcial' (esta no llenó el tanque),
 *            'sin_km' (falta kilometraje), 'km_inconsistente' (el km no subió)
 */
export function rendimientos(cargas) {
  const res = new Map();
  const porVehiculo = new Map();
  for (const c of cargas) {
    if (c.archivado) continue;
    if (!porVehiculo.has(c.vehiculoId)) porVehiculo.set(c.vehiculoId, []);
    porVehiculo.get(c.vehiculoId).push(c);
  }
  for (const lista of porVehiculo.values()) {
    lista.sort(ordenCarga);
    let ultimaLlena = null; // índice
    lista.forEach((c, i) => {
      if (c.tanqueLleno === false) return res.set(c.id, { kmGal: null, motivo: 'parcial' });
      if (ultimaLlena === null) {
        ultimaLlena = i;
        return res.set(c.id, { kmGal: null, motivo: 'primera' });
      }
      const anterior = lista[ultimaLlena];
      ultimaLlena = i;
      if (!tieneKm(c) || !tieneKm(anterior)) return res.set(c.id, { kmGal: null, motivo: 'sin_km' });
      const distancia = Number(c.km) - Number(anterior.km);
      if (distancia <= 0) return res.set(c.id, { kmGal: null, motivo: 'km_inconsistente' });
      const galones = lista.slice(lista.indexOf(anterior) + 1, i + 1).reduce((s, x) => s + (Number(x.cantidad) || 0), 0);
      if (galones <= 0) return res.set(c.id, { kmGal: null, motivo: 'sin_km' });
      res.set(c.id, { kmGal: Math.round((distancia / galones) * 10) / 10, distancia, galones: Math.round(galones * 10) / 10 });
    });
  }
  return res;
}

export const MOTIVOS_SIN_RENDIMIENTO = {
  primera: 'Primera carga de tanque lleno: el rendimiento sale en la próxima.',
  parcial: 'No llenó el tanque: se calcula en la próxima carga llena.',
  sin_km: 'Falta el kilometraje para calcular el rendimiento.',
  km_inconsistente: 'El kilometraje no subió respecto a la carga anterior: revísalo.',
};

const MIN_CARGAS_PROMEDIO = 2; // SUPUESTO: con menos de 2 rendimientos previos no hay "normal" con qué comparar

/**
 * Combustible más alto de lo normal: el rendimiento de la ÚLTIMA carga con rendimiento de un vehículo es
 * peor (menos km/gal) que su promedio de los últimos `ventana_dias` (sin contar esa carga) por más de `umbral_pct`.
 * Sin suficientes datos no avisa.
 */
export function avisoCombustibleAlto(vehiculo, cargas, op = avisosConfig().combustible_alto, rend = rendimientos(cargas)) {
  if (!op?.activo || vehiculo.archivado) return null;
  const propias = cargas
    .filter((c) => !c.archivado && c.vehiculoId === vehiculo.id && rend.get(c.id)?.kmGal != null)
    .sort(ordenCarga);
  const ultima = propias[propias.length - 1];
  if (!ultima) return null;
  const desde = sumarDiasLocal(ultima.fecha, -op.ventana_dias);
  const previas = propias.slice(0, -1).filter((c) => c.fecha >= desde);
  if (previas.length < MIN_CARGAS_PROMEDIO) return null;
  const promedio = previas.reduce((s, c) => s + rend.get(c.id).kmGal, 0) / previas.length;
  const actual = rend.get(ultima.id).kmGal;
  const peorPct = Math.round(((promedio - actual) / promedio) * 100);
  if (peorPct <= op.umbral_pct) return null;
  return {
    tipo: 'combustible_alto', severidad: 'atencion', cargaId: ultima.id, peorPct,
    texto: `Rindió ${actual.toLocaleString('es-DO')} km/gal en la última carga, ${peorPct} % peor que su promedio (${(Math.round(promedio * 10) / 10).toLocaleString('es-DO')} km/gal)`,
  };
}

function sumarDiasLocal(clave, n) {
  const [y, m, d] = clave.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

// ---------- Todos los avisos (Inicio) ----------

const ORDEN_TIPO = { viaje_retrasado: 0, licencia: 1, seguro: 2, mantenimiento: 3, combustible_alto: 4 };
const horaTxt = (iso, tz = CONFIG.empresa.zona) => new Intl.DateTimeFormat('es-DO', { timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(iso));

/**
 * Lista de avisos activos, urgentes primero. Cada uno: { id, tipo, severidad, titulo, texto, href }.
 * `href` abre la ficha correspondiente (chofer, vehículo, viaje o carga).
 * Viajes: los de hoy que llegaron tarde (atención) y los de hoy o ayer cuya llegada programada + tolerancia ya
 * pasó sin llegada registrada (urgente: el supervisor debe averiguar qué pasó).
 */
export function calcularAvisos(datos, { hoy, ahora = new Date(), tolerancia = CONFIG.viajes.tolerancia_min, op = avisosConfig() } = {}) {
  const { viajes = [], choferes = [], vehiculos = [], combustible = [], rutas = [] } = datos;
  const nombreRuta = new Map(rutas.map((r) => [r.id, r.nombre]));
  const lista = [];

  if (op.viaje_retrasado) {
    const ayer = sumarDias(hoy, -1);
    for (const v of viajes) {
      if (v.archivado) continue;
      const dia = fechaClave(v.salidaProg);
      if (dia !== hoy && dia !== ayer) continue;
      const e = estadoViaje(v, ahora, tolerancia);
      const titulo = `${nombreRuta.get(v.rutaId) ?? 'Viaje'} · ${horaTxt(v.salidaProg)}`;
      const href = `#/viajes?fecha=${dia}&abrir=${v.id}`;
      if (dia === hoy && e.puntualidad === 'retrasado') {
        lista.push({ id: `retraso-${v.id}`, tipo: 'viaje_retrasado', severidad: 'atencion', titulo, texto: `Llegó ${formatoDuracion(e.retrasoMin)} tarde${v.motivoRetraso ? ` · ${v.motivoRetraso}` : ''}`, href });
      } else if (e.estado === 'sin_llegada' && (new Date(ahora) - new Date(v.llegadaProg)) / 60000 > tolerancia) {
        lista.push({ id: `sinllegada-${v.id}`, tipo: 'viaje_retrasado', severidad: 'urgente', titulo, texto: `Sin llegada registrada: debía llegar ${horaTxt(v.llegadaProg)}`, href });
      }
    }
  }
  for (const c of choferes) {
    const a = avisoLicencia(c, hoy, op.licencia);
    if (a) lista.push({ id: `licencia-${c.id}`, tipo: 'licencia', severidad: a.severidad, titulo: c.nombre, texto: a.texto, href: `#/choferes?abrir=${c.id}` });
  }
  const km = ultimosKm(combustible);
  const rend = rendimientos(combustible);
  for (const v of vehiculos) {
    const href = `#/vehiculos?abrir=${v.id}`;
    const s = avisoSeguro(v, hoy, op.seguro);
    if (s) lista.push({ id: `seguro-${v.id}`, tipo: 'seguro', severidad: s.severidad, titulo: v.placa, texto: s.texto, href });
    const m = avisoMantenimiento(v, hoy, km.get(v.id), op.mantenimiento);
    if (m) lista.push({ id: `mantenimiento-${v.id}`, tipo: 'mantenimiento', severidad: m.severidad, titulo: v.placa, texto: m.texto, href });
    const c = avisoCombustibleAlto(v, combustible, op.combustible_alto, rend);
    if (c) lista.push({ id: `combustible-${v.id}`, tipo: 'combustible_alto', severidad: c.severidad, titulo: v.placa, texto: c.texto, href: `#/combustible?abrir=${c.cargaId}` });
  }
  return lista.sort((a, b) => (a.severidad === b.severidad ? 0 : a.severidad === 'urgente' ? -1 : 1) || ORDEN_TIPO[a.tipo] - ORDEN_TIPO[b.tipo]);
}
