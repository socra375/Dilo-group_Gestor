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
