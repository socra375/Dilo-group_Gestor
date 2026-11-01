import { test } from 'node:test';
import assert from 'node:assert/strict';
import { vencimiento, avisoLicencia, avisoSeguro, avisoMantenimiento, ultimosKm } from '../src/core/avisos.js';

const HOY = '2026-11-01';
const UMBRALES = [30, 15, 7];

test('vencimiento: fuera del umbral mayor no avisa', () => {
  assert.equal(vencimiento('2026-12-02', HOY, UMBRALES), null); // 31 días
  assert.equal(vencimiento('', HOY, UMBRALES), null);
});

test('vencimiento: 30, 15 y 7 días → atención, atención, urgente', () => {
  assert.deepEqual([vencimiento('2026-12-01', HOY, UMBRALES).severidad, vencimiento('2026-12-01', HOY, UMBRALES).umbral], ['atencion', 30]);
  assert.deepEqual([vencimiento('2026-11-16', HOY, UMBRALES).severidad, vencimiento('2026-11-16', HOY, UMBRALES).umbral], ['atencion', 15]);
  assert.deepEqual([vencimiento('2026-11-08', HOY, UMBRALES).severidad, vencimiento('2026-11-08', HOY, UMBRALES).umbral], ['urgente', 7]);
});

test('vencimiento: hoy y vencido', () => {
  assert.equal(vencimiento(HOY, HOY, UMBRALES).texto, 'vence hoy');
  const v = vencimiento('2026-10-29', HOY, UMBRALES);
  assert.equal(v.vencido, true);
  assert.equal(v.severidad, 'urgente');
  assert.equal(v.texto, 'venció hace 3 días');
});

test('licencia por vencer (10 días) avisa con atención', () => {
  const a = avisoLicencia({ licenciaVence: '2026-11-11' }, HOY, { activo: true, dias: UMBRALES });
  assert.equal(a.tipo, 'licencia');
  assert.equal(a.severidad, 'atencion');
  assert.equal(a.texto, 'Licencia vence en 10 días');
});

test('licencia: aviso apagado, chofer archivado o sin fecha no avisan', () => {
  assert.equal(avisoLicencia({ licenciaVence: '2026-11-03' }, HOY, { activo: false, dias: UMBRALES }), null);
  assert.equal(avisoLicencia({ licenciaVence: '2026-11-03', archivado: true }, HOY, { activo: true, dias: UMBRALES }), null);
  assert.equal(avisoLicencia({}, HOY, { activo: true, dias: UMBRALES }), null);
});

test('seguro por vencer y vencido', () => {
  const op = { activo: true, dias: UMBRALES };
  assert.equal(avisoSeguro({ seguroVence: '2026-11-13' }, HOY, op).texto, 'Seguro vence en 12 días');
  assert.equal(avisoSeguro({ seguroVence: '2026-10-31' }, HOY, op).severidad, 'urgente');
  assert.equal(avisoSeguro({ seguroVence: '2027-06-01' }, HOY, op), null);
});

const OP_MANT = { activo: true, dias: 7, km: 500 };

test('mantenimiento por fecha: a 7 días avisa, a 8 no', () => {
  assert.equal(avisoMantenimiento({ mantenimientoFecha: '2026-11-08' }, HOY, null, OP_MANT).severidad, 'atencion');
  assert.equal(avisoMantenimiento({ mantenimientoFecha: '2026-11-09' }, HOY, null, OP_MANT), null);
  assert.equal(avisoMantenimiento({ mantenimientoFecha: '2026-10-30' }, HOY, null, OP_MANT).severidad, 'urgente');
});

test('mantenimiento por kilometraje: 500 km o menos según el último km registrado', () => {
  assert.equal(avisoMantenimiento({ mantenimientoKm: 150500 }, HOY, 150000, OP_MANT).texto, 'Mantenimiento: faltan 500 km');
  assert.equal(avisoMantenimiento({ mantenimientoKm: 150501 }, HOY, 150000, OP_MANT), null);
  const pasado = avisoMantenimiento({ mantenimientoKm: 149800 }, HOY, 150000, OP_MANT);
  assert.equal(pasado.severidad, 'urgente');
  assert.equal(pasado.texto, 'Mantenimiento: se pasó por 200 km');
});

test('mantenimiento por kilometraje sin km registrado no avisa', () => {
  assert.equal(avisoMantenimiento({ mantenimientoKm: 100 }, HOY, null, OP_MANT), null);
});

test('mantenimiento: fecha y km a la vez se combinan en un aviso', () => {
  const a = avisoMantenimiento({ mantenimientoFecha: '2026-11-04', mantenimientoKm: 150300 }, HOY, 150000, OP_MANT);
  assert.equal(a.texto, 'Mantenimiento: toca en 3 días y faltan 300 km');
});

test('ultimosKm toma el mayor kilometraje no archivado por vehículo', () => {
  const km = ultimosKm([
    { vehiculoId: 'a', km: 1000 }, { vehiculoId: 'a', km: 1500 }, { vehiculoId: 'a', km: 9999, archivado: true },
    { vehiculoId: 'b', km: 20 }, { vehiculoId: 'b' },
  ]);
  assert.equal(km.get('a'), 1500);
  assert.equal(km.get('b'), 20);
});

// ---- Combustible: rendimiento y aviso de consumo alto ----
import { rendimientos, avisoCombustibleAlto } from '../src/core/avisos.js';

const carga = (id, fecha, km, cantidad, extra = {}) => ({ id, vehiculoId: 'v1', fecha, hora: '07:00', km, cantidad, tanqueLleno: true, ...extra });
const OP_COMB = { activo: true, umbral_pct: 20, ventana_dias: 30 };

test('rendimiento: tanque lleno a tanque lleno', () => {
  const r = rendimientos([carga('a', '2026-10-01', 10000, 20), carga('b', '2026-10-04', 10480, 20)]);
  assert.equal(r.get('a').motivo, 'primera');
  assert.equal(r.get('b').kmGal, 24); // 480 km / 20 gal
});

test('rendimiento: una carga parcial intermedia suma sus galones a la siguiente llena', () => {
  const r = rendimientos([
    carga('a', '2026-10-01', 10000, 20),
    carga('p', '2026-10-02', 10200, 5, { tanqueLleno: false }),
    carga('b', '2026-10-04', 10480, 15),
  ]);
  assert.equal(r.get('p').motivo, 'parcial');
  assert.equal(r.get('b').kmGal, 24); // 480 km / (5 + 15) gal
});

test('rendimiento: sin km o km que no sube no se calcula', () => {
  const r = rendimientos([carga('a', '2026-10-01', 10000, 20), carga('b', '2026-10-04', null, 20), carga('c', '2026-10-07', 9000, 20)]);
  assert.equal(r.get('b').motivo, 'sin_km');
  assert.equal(r.get('c').motivo, 'sin_km'); // la anterior llena (b) no tiene km
  const r2 = rendimientos([carga('a', '2026-10-01', 10000, 20), carga('b', '2026-10-04', 9990, 20)]);
  assert.equal(r2.get('b').motivo, 'km_inconsistente');
});

test('rendimiento: ordena por fecha y hora y separa por vehículo; ignora archivadas', () => {
  const r = rendimientos([
    carga('b', '2026-10-04', 10480, 20),
    carga('a', '2026-10-01', 10000, 20),
    carga('x', '2026-10-02', 99999, 1, { archivado: true }),
    { id: 'otro', vehiculoId: 'v2', fecha: '2026-10-03', km: 5, cantidad: 1, tanqueLleno: true },
  ]);
  assert.equal(r.get('b').kmGal, 24);
  assert.equal(r.get('otro').motivo, 'primera');
  assert.equal(r.has('x'), false);
});

const serie = (kmPorCarga) => {
  let km = 10000;
  return kmPorCarga.map((d, i) => {
    km += d;
    return carga(`c${i}`, `2026-10-${String(1 + i * 3).padStart(2, '0')}`, km, 20);
  });
};

test('combustible alto: avisa si la última carga rinde más de 20 % peor que su promedio de 30 días', () => {
  // rendimientos previos 24, 24, 24 km/gal; la última 16 km/gal (33 % peor)
  const cargas = serie([0, 480, 480, 480, 320]);
  const a = avisoCombustibleAlto({ id: 'v1' }, cargas, OP_COMB);
  assert.equal(a.tipo, 'combustible_alto');
  assert.equal(a.peorPct, 33);
  assert.equal(a.cargaId, 'c4');
});

test('combustible alto: dentro del umbral no avisa', () => {
  const cargas = serie([0, 480, 480, 480, 400]); // 20 km/gal: 17 % peor
  assert.equal(avisoCombustibleAlto({ id: 'v1' }, cargas, OP_COMB), null);
});

test('combustible alto: sin suficientes datos no avisa', () => {
  assert.equal(avisoCombustibleAlto({ id: 'v1' }, serie([0, 480, 200]), OP_COMB), null); // solo 1 rendimiento previo
  assert.equal(avisoCombustibleAlto({ id: 'v1' }, [], OP_COMB), null);
  assert.equal(avisoCombustibleAlto({ id: 'v1' }, serie([0, 480, 480, 480, 320]), { ...OP_COMB, activo: false }), null);
});

test('combustible alto: solo cuenta la ventana de 30 días', () => {
  const cargas = serie([0, 480, 480, 480, 320]).map((c, i) => (i < 3 ? { ...c, fecha: `2026-08-0${i + 1}` } : c));
  // Los dos rendimientos "normales" quedan fuera de la ventana: no hay base suficiente.
  assert.equal(avisoCombustibleAlto({ id: 'v1' }, cargas, OP_COMB), null);
});

// ---- Todos los avisos ----
import { calcularAvisos } from '../src/core/avisos.js';
import { aISO } from '../src/core/time.js';

const OP_TODO = {
  viaje_retrasado: true,
  licencia: { activo: true, dias: [30, 15, 7] },
  seguro: { activo: true, dias: [30, 15, 7] },
  combustible_alto: { activo: true, umbral_pct: 20, ventana_dias: 30 },
  mantenimiento: { activo: true, dias: 7, km: 500 },
};

const DATOS = () => ({
  rutas: [{ id: 'r1', nombre: 'R1' }],
  viajes: [
    // Hoy, llegó 25 min tarde → atención
    { id: 'v1', rutaId: 'r1', salidaProg: aISO(HOY, '05:30'), llegadaProg: aISO(HOY, '06:25'), salidaReal: aISO(HOY, '05:31'), llegadaReal: aISO(HOY, '06:50'), motivoRetraso: 'Tráfico' },
    // Hoy, sin llegada y ya pasó la llegada + tolerancia → urgente
    { id: 'v2', rutaId: 'r1', salidaProg: aISO(HOY, '07:00'), llegadaProg: aISO(HOY, '08:00'), salidaReal: aISO(HOY, '07:00'), llegadaReal: null },
    // Hoy, llegó dentro de la tolerancia → nada
    { id: 'v3', rutaId: 'r1', salidaProg: aISO(HOY, '09:00'), llegadaProg: aISO(HOY, '10:00'), salidaReal: aISO(HOY, '09:00'), llegadaReal: aISO(HOY, '10:04') },
    // Hace 3 días, retrasado → no es de hoy
    { id: 'v4', rutaId: 'r1', salidaProg: aISO('2026-10-29', '05:30'), llegadaProg: aISO('2026-10-29', '06:25'), salidaReal: aISO('2026-10-29', '05:30'), llegadaReal: aISO('2026-10-29', '07:30') },
  ],
  choferes: [{ id: 'c1', nombre: 'Chofer A', licenciaVence: '2026-11-11' }, { id: 'c2', nombre: 'Chofer B', licenciaVence: '2027-11-11' }],
  vehiculos: [{ id: 'veh', placa: 'I000001', seguroVence: '2026-10-30', mantenimientoKm: 10300 }],
  combustible: [{ id: 'k1', vehiculoId: 'veh', fecha: '2026-10-30', km: 10000, cantidad: 10, tanqueLleno: true }],
});

test('calcularAvisos: viajes retrasados de hoy y sin llegada, licencia, seguro y mantenimiento', () => {
  const avisos = calcularAvisos(DATOS(), { hoy: HOY, ahora: new Date(aISO(HOY, '12:00')), tolerancia: 5, op: OP_TODO });
  const ids = avisos.map((a) => a.id);
  assert.ok(ids.includes('retraso-v1'));
  assert.ok(ids.includes('sinllegada-v2'));
  assert.ok(!ids.some((i) => i.endsWith('-v3') || i.endsWith('-v4')));
  assert.ok(ids.includes('licencia-c1') && !ids.includes('licencia-c2'));
  assert.ok(ids.includes('seguro-veh') && ids.includes('mantenimiento-veh'));
  assert.equal(avisos.find((a) => a.id === 'retraso-v1').texto, 'Llegó 25 min tarde · Tráfico');
  assert.equal(avisos.find((a) => a.id === 'retraso-v1').href, `#/viajes?fecha=${HOY}&abrir=v1`);
  assert.equal(avisos.find((a) => a.id === 'licencia-c1').href, '#/choferes?abrir=c1');
});

test('calcularAvisos: urgentes primero', () => {
  const avisos = calcularAvisos(DATOS(), { hoy: HOY, ahora: new Date(aISO(HOY, '12:00')), tolerancia: 5, op: OP_TODO });
  const primerAtencion = avisos.findIndex((a) => a.severidad === 'atencion');
  assert.ok(avisos.slice(primerAtencion).every((a) => a.severidad === 'atencion'));
  assert.equal(avisos[0].severidad, 'urgente');
});

test('calcularAvisos: sin llegada dentro de la tolerancia todavía no avisa', () => {
  const avisos = calcularAvisos(DATOS(), { hoy: HOY, ahora: new Date(aISO(HOY, '08:03')), tolerancia: 5, op: OP_TODO });
  assert.ok(!avisos.some((a) => a.id === 'sinllegada-v2'));
});

test('calcularAvisos: avisos apagados en la configuración no aparecen', () => {
  const op = { ...OP_TODO, viaje_retrasado: false, licencia: { ...OP_TODO.licencia, activo: false } };
  const avisos = calcularAvisos(DATOS(), { hoy: HOY, ahora: new Date(aISO(HOY, '12:00')), tolerancia: 5, op });
  assert.ok(!avisos.some((a) => a.tipo === 'viaje_retrasado' || a.tipo === 'licencia'));
});
