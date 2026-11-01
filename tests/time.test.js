// Ejecutar: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  aISO, fechaClave, horaClave, sumarDias, inicioSemana, minutosEntre,
  horaCercana, horaDespues, estadoViaje, formatoDuracion,
} from '../src/core/time.js';

// Santo Domingo es UTC−4 todo el año.
test('aISO interpreta la hora en America/Santo_Domingo', () => {
  assert.equal(aISO('2026-03-10', '08:30'), '2026-03-10T12:30:00.000Z');
  assert.equal(aISO('2026-03-10', '22:15'), '2026-03-11T02:15:00.000Z');
});

test('fechaClave y horaClave usan la zona del negocio, no UTC', () => {
  const iso = '2026-03-11T02:15:00.000Z'; // 10:15 p. m. del 10 en RD
  assert.equal(fechaClave(iso), '2026-03-10');
  assert.equal(horaClave(iso), '22:15');
});

test('sumarDias cruza meses y años', () => {
  assert.equal(sumarDias('2026-12-31', 1), '2027-01-01');
  assert.equal(sumarDias('2026-03-01', -1), '2026-02-28');
});

test('inicioSemana devuelve el lunes', () => {
  assert.equal(inicioSemana('2026-10-26'), '2026-10-26'); // lunes
  assert.equal(inicioSemana('2026-11-01'), '2026-10-26'); // domingo
});

const viaje = (salida, llegada, extra = {}) => ({
  salidaProg: aISO('2026-03-10', salida),
  llegadaProg: horaDespues(llegada, aISO('2026-03-10', salida)),
  ...extra,
});

test('horaDespues: llegada programada después de medianoche cae al día siguiente', () => {
  const v = viaje('23:30', '00:25');
  assert.equal(fechaClave(v.llegadaProg), '2026-03-11');
  assert.equal(minutosEntre(v.salidaProg, v.llegadaProg), 55);
});

test('horaCercana: llegada real tras medianoche se asigna al día siguiente', () => {
  const prog = aISO('2026-03-10', '23:55');
  const real = horaCercana('00:10', prog);
  assert.equal(fechaClave(real), '2026-03-11');
  assert.equal(minutosEntre(prog, real), 15);
});

test('horaCercana: llegada real antes de medianoche para un viaje programado después', () => {
  const prog = aISO('2026-03-11', '00:05');
  const real = horaCercana('23:50', prog);
  assert.equal(fechaClave(real), '2026-03-10');
  assert.equal(minutosEntre(prog, real), -15);
});

test('retraso calculado a través de la medianoche', () => {
  const v = viaje('23:00', '23:50');
  v.salidaReal = aISO('2026-03-10', '23:05');
  v.llegadaReal = horaCercana('00:10', v.llegadaProg);
  const e = estadoViaje(v, aISO('2026-03-11', '01:00'), 5);
  assert.equal(e.estado, 'completado');
  assert.equal(e.puntualidad, 'retrasado');
  assert.equal(e.retrasoMin, 20);
  assert.equal(e.etiqueta, 'Retrasado (+20 min)');
});

test('tolerancia: igual a la tolerancia es "A tiempo", uno más es "Retrasado"', () => {
  const llegada = aISO('2026-03-10', '09:00');
  const base = { salidaProg: aISO('2026-03-10', '08:00'), llegadaProg: llegada, salidaReal: aISO('2026-03-10', '08:00') };
  const a5 = estadoViaje({ ...base, llegadaReal: aISO('2026-03-10', '09:05') }, llegada, 5);
  assert.equal(a5.puntualidad, 'a_tiempo');
  assert.equal(a5.retrasoMin, 5);
  const a6 = estadoViaje({ ...base, llegadaReal: aISO('2026-03-10', '09:06') }, llegada, 5);
  assert.equal(a6.puntualidad, 'retrasado');
  assert.equal(a6.retrasoMin, 6);
});

test('tolerancia configurable (0 y 15)', () => {
  const v = { salidaProg: aISO('2026-03-10', '08:00'), llegadaProg: aISO('2026-03-10', '09:00'), llegadaReal: aISO('2026-03-10', '09:10') };
  assert.equal(estadoViaje(v, new Date(), 0).puntualidad, 'retrasado');
  assert.equal(estadoViaje(v, new Date(), 15).puntualidad, 'a_tiempo');
});

test('llegar antes de lo programado es "A tiempo" con retraso negativo', () => {
  const v = { salidaProg: aISO('2026-03-10', '08:00'), llegadaProg: aISO('2026-03-10', '09:00'), llegadaReal: aISO('2026-03-10', '08:48') };
  const e = estadoViaje(v, new Date(), 5);
  assert.equal(e.puntualidad, 'a_tiempo');
  assert.equal(e.retrasoMin, -12);
});

test('sin llegada real y hora programada pasada → "Sin llegada registrada"', () => {
  const v = viaje('08:00', '09:00', { salidaReal: aISO('2026-03-10', '08:02') });
  const e = estadoViaje(v, aISO('2026-03-10', '09:01'), 5);
  assert.equal(e.estado, 'sin_llegada');
  assert.equal(e.etiqueta, 'Sin llegada registrada');
  assert.equal(e.retrasoMin, null);
});

test('sin llegada se evalúa con la llegada del día siguiente en viajes nocturnos', () => {
  const v = viaje('23:30', '00:25', { salidaReal: aISO('2026-03-10', '23:31') });
  assert.equal(estadoViaje(v, aISO('2026-03-11', '00:20')).estado, 'en_ruta');
  assert.equal(estadoViaje(v, aISO('2026-03-11', '00:26')).estado, 'sin_llegada');
});

test('programado, salida atrasada y en ruta', () => {
  const v = viaje('08:00', '09:00');
  const antes = estadoViaje(v, aISO('2026-03-10', '07:00'));
  assert.equal(antes.estado, 'programado');
  assert.equal(antes.salidaAtrasada, false);
  const tarde = estadoViaje(v, aISO('2026-03-10', '08:10'));
  assert.equal(tarde.estado, 'programado');
  assert.equal(tarde.salidaAtrasada, true);
  const enRuta = estadoViaje({ ...v, salidaReal: aISO('2026-03-10', '08:10') }, aISO('2026-03-10', '08:30'));
  assert.equal(enRuta.estado, 'en_ruta');
});

test('formatoDuracion', () => {
  assert.equal(formatoDuracion(40), '40 min');
  assert.equal(formatoDuracion(60), '1 h');
  assert.equal(formatoDuracion(75), '1 h 15 min');
});

test('diasEntre', async () => {
  const { diasEntre } = await import('../src/core/time.js');
  assert.equal(diasEntre('2026-10-26', '2026-11-13'), 18);
  assert.equal(diasEntre('2026-10-26', '2026-10-20'), -6);
});

test('estadoLicencia', async () => {
  const { estadoLicencia } = await import('../src/core/time.js');
  assert.equal(estadoLicencia('2026-11-13', '2026-10-26', 30).estado, 'por_vencer');
  assert.equal(estadoLicencia('2026-10-25', '2026-10-26', 30).estado, 'vencida');
  assert.equal(estadoLicencia('2026-10-26', '2026-10-26', 30).estado, 'por_vencer');
  assert.equal(estadoLicencia('2027-10-26', '2026-10-26', 30).estado, 'vigente');
  assert.equal(estadoLicencia('', '2026-10-26', 30).estado, null);
});

// ---- Retraso de salida y generación de viajes desde horarios ----
import { retrasoSalida, viajesDesdeHorarios } from '../src/core/time.js';

test('retraso de salida es un dato aparte: no cambia el estado', () => {
  const v = {
    salidaProg: aISO('2026-03-10', '08:00'), salidaReal: aISO('2026-03-10', '08:12'),
    llegadaProg: aISO('2026-03-10', '09:00'), llegadaReal: aISO('2026-03-10', '09:03'),
  };
  assert.equal(retrasoSalida(v), 12);
  const e = estadoViaje(v, new Date(), 5);
  assert.equal(e.retrasoSalidaMin, 12);
  assert.equal(e.puntualidad, 'a_tiempo'); // cuenta la llegada (+3), no la salida (+12)
  assert.equal(retrasoSalida({ salidaProg: v.salidaProg }), null);
});

const RUTAS = [
  { id: 'r1', duracionMin: 55, horarios: ['15:30', '05:30'] },
  { id: 'r5', duracionMin: 25, horarios: ['23:40'] },
  { id: 'r9', duracionMin: 30, horarios: ['07:00'], archivado: true },
  { id: 'r0', duracionMin: 30 },
];

test('generar viajes: uno por horario, ordenados, sin chofer ni vehículo', () => {
  const v = viajesDesdeHorarios(RUTAS, [], '2026-03-10');
  assert.deepEqual(v.map((x) => [x.rutaId, horaClave(x.salidaProg)]), [['r1', '05:30'], ['r1', '15:30'], ['r5', '23:40']]);
  assert.equal(v[0].choferId, null);
  assert.equal(v[0].vehiculoId, null);
  assert.equal(minutosEntre(v[0].salidaProg, v[0].llegadaProg), 55);
});

test('generar viajes: la llegada de un horario nocturno cae al día siguiente', () => {
  const nocturno = viajesDesdeHorarios(RUTAS, [], '2026-03-10').find((x) => x.rutaId === 'r5');
  assert.equal(fechaClave(nocturno.llegadaProg), '2026-03-11');
  assert.equal(horaClave(nocturno.llegadaProg), '00:05');
});

test('generar viajes: no duplica los que ya existen (y sí recrea si el existente está archivado)', () => {
  const existentes = [
    { rutaId: 'r1', salidaProg: aISO('2026-03-10', '05:30') },
    { rutaId: 'r5', salidaProg: aISO('2026-03-10', '23:40'), archivado: true },
  ];
  const v = viajesDesdeHorarios(RUTAS, existentes, '2026-03-10');
  assert.deepEqual(v.map((x) => [x.rutaId, horaClave(x.salidaProg)]), [['r1', '15:30'], ['r5', '23:40']]);
  // Generar dos veces seguidas no crea nada la segunda vez.
  assert.equal(viajesDesdeHorarios(RUTAS, [...existentes, ...v], '2026-03-10').length, 0);
});

test('generar viajes: rutas archivadas o sin horarios no generan nada', () => {
  assert.equal(viajesDesdeHorarios([RUTAS[2], RUTAS[3]], [], '2026-03-10').length, 0);
});

// ---------- Avance del viaje (pista de la tarjeta) ----------
import { avanceViaje } from '../src/core/time.js';

const viajeAvance = (extra = {}) => ({ salidaProg: '2026-03-02T10:00:00.000Z', llegadaProg: '2026-03-02T11:00:00.000Z', ...extra });
const estadoAvance = (extra = {}) => ({ estado: 'programado', puntualidad: null, salidaAtrasada: false, ...extra });

test('avance: programado = 0 % neutro; si ya pasó la hora de salida sin registrarla, ámbar', () => {
  assert.deepEqual(avanceViaje(viajeAvance(), estadoAvance()), { pct: 0, tono: '' });
  assert.deepEqual(avanceViaje(viajeAvance(), estadoAvance({ estado: 'sin_llegada', salidaAtrasada: true })), { pct: 0, tono: 'warn' });
});

test('avance: en ruta = tiempo transcurrido de la duración programada, entre 8 y 92 %', () => {
  const v = viajeAvance({ salidaReal: '2026-03-02T10:00:00.000Z' });
  const e = estadoAvance({ estado: 'en_ruta' });
  assert.deepEqual(avanceViaje(v, e, new Date('2026-03-02T10:30:00.000Z')), { pct: 50, tono: 'curso' });
  assert.equal(avanceViaje(v, e, new Date('2026-03-02T10:00:10.000Z')).pct, 8, 'recién salió: no queda en 0');
  assert.equal(avanceViaje(v, e, new Date('2026-03-02T13:00:00.000Z')).pct, 92, 'nunca llega a 100 sin registrar la llegada');
});

test('avance: sin llegada registrada = 92 % ámbar; completado = 100 % (verde a tiempo, rojo retrasado)', () => {
  const v = viajeAvance({ salidaReal: '2026-03-02T10:02:00.000Z' });
  assert.deepEqual(avanceViaje(v, estadoAvance({ estado: 'sin_llegada' })), { pct: 92, tono: 'warn' });
  assert.deepEqual(avanceViaje(v, estadoAvance({ estado: 'completado', puntualidad: 'a_tiempo' })), { pct: 100, tono: 'ok' });
  assert.deepEqual(avanceViaje(v, estadoAvance({ estado: 'completado', puntualidad: 'retrasado' })), { pct: 100, tono: 'error' });
});

test('avance: un viaje que cruza la medianoche usa su duración real', () => {
  const v = { salidaProg: '2026-03-02T23:40:00.000Z', llegadaProg: '2026-03-03T00:20:00.000Z', salidaReal: '2026-03-02T23:40:00.000Z' };
  assert.equal(avanceViaje(v, estadoAvance({ estado: 'en_ruta' }), new Date('2026-03-03T00:00:00.000Z')).pct, 50);
});
