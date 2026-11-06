import { test } from 'node:test';
import assert from 'node:assert/strict';
import { retrasosPor, totalesRetrasos, combustiblePor, aCSV } from '../src/core/agregados.js';
import { aISO } from '../src/core/time.js';

const viaje = (choferId, dia, salida, llegada, llegadaReal, extra = {}) => ({
  choferId, rutaId: 'r1',
  salidaProg: aISO(dia, salida), llegadaProg: aISO(dia, llegada),
  salidaReal: llegadaReal ? aISO(dia, salida) : null,
  llegadaReal: llegadaReal ? aISO(dia, llegadaReal) : null,
  ...extra,
});

test('retrasosPor agrupa, respeta tolerancia, rango y archivados', () => {
  const viajes = [
    viaje('a', '2026-10-20', '08:00', '09:00', '09:05'), // a tiempo (igual a tolerancia)
    viaje('a', '2026-10-20', '10:00', '11:00', '11:20'), // +20
    viaje('a', '2026-10-21', '10:00', '11:00', '11:10'), // +10
    viaje('b', '2026-10-21', '10:00', '11:00', null), // sin llegada
    viaje('b', '2026-10-21', '12:00', '13:00', '13:30', { archivado: true }), // ignorado
    viaje('b', '2026-10-30', '12:00', '13:00', '13:30'), // fuera de rango
  ];
  const filas = retrasosPor(viajes, 'choferId', { desde: '2026-10-20', hasta: '2026-10-26', tolerancia: 5, ahora: new Date(aISO('2026-10-26', '12:00')) });
  const a = filas.find((f) => f.id === 'a');
  const b = filas.find((f) => f.id === 'b');
  assert.deepEqual([a.viajes, a.completados, a.retrasados, a.minRetraso, a.promRetraso, a.pctATiempo], [3, 3, 2, 30, 15, 33]);
  assert.deepEqual([b.viajes, b.completados, b.sinLlegada, b.pctATiempo], [1, 0, 1, null]);
  assert.equal(filas[0].id, 'a'); // más retrasos primero
  const t = totalesRetrasos(filas);
  assert.deepEqual([t.viajes, t.retrasados, t.sinLlegada, t.pctATiempo], [4, 2, 1, 33]);
});

test('combustiblePor semana incluye semanas vacías y agrupa por lunes', () => {
  const cargas = [
    { fecha: '2026-10-26', cantidad: 10, monto: 2351 },
    { fecha: '2026-11-01', cantidad: 5.25, monto: 1234.5 }, // domingo → semana del 26
    { fecha: '2026-10-13', cantidad: 20, monto: 4702 },
    { fecha: '2026-10-14', cantidad: 1, monto: 1, archivado: true },
  ];
  const filas = combustiblePor(cargas, 'semana', { hoy: '2026-11-01', n: 3 });
  assert.deepEqual(filas.map((f) => f.periodo), ['2026-10-12', '2026-10-19', '2026-10-26']);
  assert.deepEqual(filas.map((f) => f.cargas), [1, 0, 2]);
  assert.equal(filas[2].cantidad, 15.3);
  assert.equal(filas[2].monto, 3585.5);
});

test('combustiblePor mes cruza el año', () => {
  const filas = combustiblePor([{ fecha: '2025-12-31', cantidad: 1, monto: 100 }], 'mes', { hoy: '2026-01-15', n: 2 });
  assert.deepEqual(filas.map((f) => [f.periodo, f.monto]), [['2025-12-01', 100], ['2026-01-01', 0]]);
});

test('aCSV escapa comas, comillas y saltos de línea', () => {
  const csv = aCSV(['Nombre', 'Nota'], [['Pérez, Juan', 'dijo "hola"'], ['Ana', 'a\nb']]);
  assert.ok(csv.startsWith('﻿Nombre,Nota\r\n'));
  assert.ok(csv.includes('"Pérez, Juan","dijo ""hola"""'));
  assert.ok(csv.includes('Ana,"a\nb"'));
});

import { retrasosPorDia } from '../src/core/agregados.js';

test('retrasosPorDia: 7 días terminando hoy, con ceros, y solo cuenta retrasos sobre la tolerancia', () => {
  const v = (dia, salida, llegada, llegadaReal, extra = {}) => viaje('a', dia, salida, llegada, llegadaReal, extra);
  const viajes = [
    v('2026-10-26', '08:00', '09:00', '09:20'), // +20 → retraso (hoy)
    v('2026-10-26', '10:00', '11:00', '11:05'), // +5 = tolerancia → no
    v('2026-10-26', '12:00', '13:00', null),    // sin llegada → no cuenta como retraso
    v('2026-10-24', '08:00', '09:00', '09:40'), // +40
    v('2026-10-24', '10:00', '11:00', '11:10'), // +10
    v('2026-10-24', '12:00', '13:00', '13:30', { archivado: true }), // archivado: ignorado
    v('2026-10-19', '08:00', '09:00', '10:00'), // fuera de los 7 días
  ];
  const r = retrasosPorDia(viajes, { hoy: '2026-10-26', dias: 7, tolerancia: 5, ahora: new Date(aISO('2026-10-26', '18:00')) });
  assert.equal(r.length, 7);
  assert.equal(r[0].fecha, '2026-10-20');
  assert.equal(r[6].fecha, '2026-10-26');
  assert.deepEqual(r.map((d) => d.retrasos), [0, 0, 0, 0, 2, 0, 1]);
  assert.deepEqual([r[6].viajes, r[4].viajes], [3, 2]);
  assert.equal(r[4].minutos, 50);
});

test('retrasosPorDia: sin viajes devuelve 7 días en cero', () => {
  const r = retrasosPorDia([], { hoy: '2026-11-01', tolerancia: 5 });
  assert.deepEqual(r.map((d) => d.retrasos), [0, 0, 0, 0, 0, 0, 0]);
  assert.equal(r[0].fecha, '2026-10-26');
});

import { combustiblePorVehiculo } from '../src/core/agregados.js';

test('combustiblePorVehiculo: totales, precio por galón y rendimiento promedio; ordena por monto', () => {
  const c = (id, vehiculoId, fecha, km, cantidad, monto, extra = {}) => ({ id, vehiculoId, fecha, hora: '07:00', km, cantidad, monto, tanqueLleno: true, ...extra });
  const cargas = [
    c('a1', 'v1', '2026-09-28', 10000, 20, 4000), // fuera del periodo: solo sirve de base
    c('a2', 'v1', '2026-10-02', 10480, 20, 4000), // 24 km/gal
    c('a3', 'v1', '2026-10-05', 10880, 20, 4400), // 20 km/gal
    c('b1', 'v2', '2026-10-03', 500, 10, 2000),
    c('x', 'v1', '2026-10-04', 99999, 99, 99999, { archivado: true }),
  ];
  const r = combustiblePorVehiculo(cargas, { desde: '2026-10-01', hasta: '2026-10-31' });
  assert.deepEqual(r.map((x) => x.id), ['v1', 'v2']);
  assert.deepEqual([r[0].cargas, r[0].galones, r[0].monto, r[0].precioGalon, r[0].kmGal], [2, 40, 8400, 210, 22]);
  assert.deepEqual([r[1].cargas, r[1].kmGal], [1, null]); // una sola carga: aún sin rendimiento
  assert.deepEqual(combustiblePorVehiculo([], { desde: '2026-10-01', hasta: '2026-10-31' }), []);
});

test('aCSV neutraliza fórmulas (inyección de CSV) sin tocar números ni textos normales', () => {
  const csv = aCSV(['Texto'], [['=HYPERLINK("http://x","clic")'], ['+cmd|calc'], ['-2+3'], ['@SUM(A1)'], ['\t=1'], ['+18095551234'], [-5], ['Estación Shell'], ['08:30']]);
  const filas = csv.split('\r\n');
  assert.ok(filas[1].startsWith('"\'=HYPERLINK(""http://x"",""clic"")"'), filas[1]);
  assert.equal(filas[2], "'+cmd|calc");
  assert.equal(filas[3], "'-2+3");
  assert.equal(filas[4], "'@SUM(A1)");
  assert.ok(filas[5].startsWith("'\t=1") || filas[5].startsWith('"\'\t=1'));
  assert.equal(filas[6], '+18095551234', 'un teléfono con + es un número, no una fórmula');
  assert.equal(filas[7], '-5', 'un número real no se toca');
  assert.equal(filas[8], 'Estación Shell');
  assert.equal(filas[9], '08:30');
});
