import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resumenDiarioTexto, retrasosTexto, combustiblePeriodoTexto, combustibleVehiculoTexto, enlaceWhatsAppTexto, internacional, enlaceLlamada, enlaceWhatsApp } from '../src/core/share.js';

const RESUMEN = {
  fecha: '2026-11-01', viajes: 7, completados: 5, sinLlegada: 1,
  retrasados: [
    { ruta: 'R1 Alcarrizos – ZF Las Américas', hora: '5:30 a. m.', min: 25, chofer: 'Juan Carlos Pérez Mejía', motivo: 'Tráfico' },
    { ruta: 'R2 Villa Mella – Haina', hora: '5:45 a. m.', min: 62, chofer: 'Ramón Antonio Féliz', motivo: '' },
  ],
  galones: 38.94, monto: 9154.4, cargas: 2,
  avisos: [{ severidad: 'urgente', titulo: 'R2 · 5:45 a. m.', texto: 'Sin llegada registrada' }, { severidad: 'atencion', titulo: 'Ramón', texto: 'Licencia vence en 10 días' }],
};

test('resumen diario: contenido, en líneas cortas y sin tablas', () => {
  const t = resumenDiarioTexto(RESUMEN);
  assert.ok(t.startsWith('*Dilo group · Resumen del día*'));
  assert.match(t, /Domingo, 1 de noviembre · 01\/11\/2026/);
  assert.match(t, /\*Viajes:\* 7 \(5 completados, 1 sin llegada registrada\)/);
  assert.match(t, /\*Retrasos:\* 2/);
  assert.match(t, /• R1 Alcarrizos – ZF Las Américas 5:30 a\. m\.: \+25 min · Juan Carlos Pérez Mejía · Tráfico/);
  assert.match(t, /\+1 h 2 min/); // 62 min
  assert.match(t, /\*Combustible:\* 38\.9 galones · RD\$9,154\.40 \(2 cargas\)/);
  assert.match(t, /\*Avisos:\* 2/);
  assert.match(t, /• Urgente: R2 · 5:45 a\. m\. — Sin llegada registrada/);
  for (const linea of t.split('\n')) assert.ok(linea.length <= 112, `línea larga: ${linea}`);
  assert.ok(!/[|\t]/.test(t), 'sin columnas ni tablas');
});

test('resumen diario: sin retrasos, sin cargas y sin avisos', () => {
  const t = resumenDiarioTexto({ ...RESUMEN, retrasados: [], cargas: 0, galones: 0, monto: 0, avisos: [], completados: 0, sinLlegada: 0 });
  assert.match(t, /\*Retrasos:\* 0/);
  assert.match(t, /\*Combustible:\* sin cargas/);
  assert.match(t, /\*Avisos:\* ninguno/);
});

test('resumen diario: un día pasado no incluye avisos (son del presente)', () => {
  assert.ok(!resumenDiarioTexto({ ...RESUMEN, avisos: null }).includes('Avisos'));
});

test('resumen diario: más de 8 retrasos se resumen en "y N más"', () => {
  const muchos = Array.from({ length: 11 }, (_, i) => ({ ruta: `R${i}`, hora: '5:30 a. m.', min: 10, chofer: 'X', motivo: '' }));
  const t = resumenDiarioTexto({ ...RESUMEN, retrasados: muchos });
  assert.match(t, /• y 3 más/);
  assert.equal(t.split('\n').filter((l) => l.startsWith('• R')).length, 8);
});

test('una línea demasiado larga se corta con puntos suspensivos', () => {
  const t = resumenDiarioTexto({ ...RESUMEN, retrasados: [{ ruta: 'R'.repeat(200), hora: '5:30 a. m.', min: 10, chofer: 'X', motivo: '' }] });
  assert.ok(t.split('\n').every((l) => l.length <= 112));
  assert.ok(t.includes('…'));
});

test('retrasos por chofer: total y una línea por chofer', () => {
  const t = retrasosTexto({
    titulo: 'Retrasos por chofer', periodo: 'Del 26/10/2026 al 01/11/2026',
    totales: { viajes: 12, retrasados: 3, pctATiempo: 75 },
    filas: [{ nombre: 'María Altagracia Santos', viajes: 6, retrasados: 2, promRetraso: 26, sinLlegada: 1 }, { nombre: 'Luis', viajes: 6, retrasados: 1, promRetraso: 9, sinLlegada: 0 }],
  });
  assert.match(t, /\*Total:\* 12 viajes · 3 retrasos · a tiempo 75 %/);
  assert.match(t, /• María Altagracia Santos: 2 retrasos de 6 viajes \(prom\. 26 min\) · 1 sin llegada/);
  assert.match(t, /• Luis: 1 retraso de 6 viajes \(prom\. 9 min\)/);
});

test('combustible por periodo y por vehículo', () => {
  const p = combustiblePeriodoTexto({ titulo: 'Combustible por semana', filas: [{ etiqueta: 'Sem. 19/10', cargas: 3, cantidad: 60, monto: 14106 }, { etiqueta: 'Sem. 26/10', cargas: 0, cantidad: 0, monto: 0 }] });
  assert.match(p, /• Sem\. 19\/10: 60 galones · RD\$14,106\.00 \(3 cargas\)/);
  assert.ok(!p.includes('Sem. 26/10'), 'las semanas vacías no ocupan línea');
  const v = combustibleVehiculoTexto({ titulo: 'Combustible por vehículo', periodo: 'Octubre', filas: [{ placa: 'I045821', cargas: 3, galones: 60, monto: 14106, kmGal: 24.3 }, { placa: 'G031177', cargas: 1, galones: 10, monto: 2725, kmGal: null }] });
  assert.match(v, /• I045821: 60 galones · RD\$14,106\.00 · 24\.3 km\/gal/);
  assert.match(v, /• G031177: 10 galones · RD\$2,725\.00$/m);
});

test('enlace de respaldo de WhatsApp codifica el texto', () => {
  assert.equal(enlaceWhatsAppTexto('Hola *mundo*\n1 & 2'), 'https://wa.me/?text=Hola%20*mundo*%0A1%20%26%202');
});

test('teléfonos dominicanos: código de país 1', () => {
  assert.equal(internacional('809-555-0101'), '18095550101');
  assert.equal(internacional('18095550101'), '18095550101');
  assert.equal(internacional('555'), null);
  assert.equal(enlaceLlamada('8095550101'), 'tel:+18095550101');
  assert.equal(enlaceWhatsApp('8095550101', 'Hola'), 'https://wa.me/18095550101?text=Hola');
  assert.equal(enlaceWhatsApp('12'), null);
});
