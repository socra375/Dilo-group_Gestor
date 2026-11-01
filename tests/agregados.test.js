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
