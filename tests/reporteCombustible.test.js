// Reporte de combustible para el jefe: qué cargas entran, totales, CSV, texto de WhatsApp y PDF.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ultimoDiaMes, rangoReporte, cargasDelPeriodo, armarReporte, csvReporte, nombreArchivo } from '../src/core/reporteCombustible.js';
import { reporteCombustibleTexto } from '../src/core/share.js';
import { DocumentoPDF, dimensionesJPEG, aWinAnsi, anchoTexto, truncar } from '../src/core/pdf.js';
import { pdfReporteCombustible } from '../src/core/pdfCombustible.js';

// JPEG real de 16×24 px (para probar que se incrusta en el PDF).
const JPEG = new Uint8Array(Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA0JCgsKCA0LCgsODg0PEyAVExISEyccHhcgLikxMC4pLSwzOko+MzZGNywtQFdBRkxOUlNSMj5aYVpQYEpRUk//2wBDAQ4ODhMREyYVFSZPNS01T09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0//wAARCAAYABADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDfooorzDpCiiigD//Z', 'base64'));
const veh = new Map([['v1', 'I045821'], ['v2', 'I067310']]);
const cho = new Map([['c1', 'Juan Carlos Pérez'], ['c2', 'Ramón Féliz']]);
const carga = (id, fecha, extra = {}) => ({ id, fecha, hora: '06:00', vehiculoId: 'v1', choferId: 'c1', cantidad: 10, monto: 2351, tipo: 'Gasoil', estacion: 'Texaco', km: 1000, tanqueLleno: true, archivado: false, creado: `${fecha}T10:00:00Z`, ...extra });

test('ultimoDiaMes: meses de 30 y 31 días, febrero y año bisiesto', () => {
  assert.equal(ultimoDiaMes('2026-11'), '2026-11-30');
  assert.equal(ultimoDiaMes('2026-12'), '2026-12-31');
  assert.equal(ultimoDiaMes('2026-02'), '2026-02-28');
  assert.equal(ultimoDiaMes('2028-02'), '2028-02-29');
});

test('rangoReporte: un día es [día, día]; un mes va del 1 al último día', () => {
  assert.deepEqual(rangoReporte('dia', '2026-11-04'), ['2026-11-04', '2026-11-04']);
  assert.deepEqual(rangoReporte('mes', '2026-11'), ['2026-11-01', '2026-11-30']);
});

test('cargasDelPeriodo: solo el periodo, sin archivadas, de la más antigua a la más nueva', () => {
  const todas = [carga('c', '2026-11-04', { hora: '12:00' }), carga('a', '2026-11-03'), carga('b', '2026-11-04', { hora: '05:00' }), carga('x', '2026-11-04', { archivado: true }), carga('o', '2026-10-31'), carga('d', '2026-12-01')];
  assert.deepEqual(cargasDelPeriodo(todas, 'dia', '2026-11-04').map((c) => c.id), ['b', 'c']);
  assert.deepEqual(cargasDelPeriodo(todas, 'mes', '2026-11').map((c) => c.id), ['a', 'b', 'c'], 'octubre, diciembre y archivadas quedan fuera');
});

test('armarReporte: totales, precio por unidad y resumen por vehículo ordenado por monto', () => {
  const cargas = [carga('1', '2026-11-04'), carga('2', '2026-11-04', { vehiculoId: 'v2', cantidad: 20, monto: 5000, choferId: 'c2' }), carga('3', '2026-11-04', { fotoId: 'f1' })];
  const r = armarReporte({ cargas, tipo: 'dia', clave: '2026-11-04', vehiculos: veh, choferes: cho });
  assert.equal(r.titulo, 'Reporte diario de combustible');
  assert.deepEqual(r.totales, { cargas: 3, cantidad: 40, monto: 9702, precio: 242.55, conFoto: 1 });
  assert.deepEqual(r.porVehiculo.map((g) => [g.placa, g.cargas, g.monto]), [['I067310', 1, 5000], ['I045821', 2, 4702]]);
  assert.equal(r.filas[0].chofer, 'Juan Carlos Pérez');
  assert.equal(r.filas[2].fotoId, 'f1');
});

test('armarReporte: lo que el jefe recibe son SOLO las cargas elegidas; el rendimiento usa todas', () => {
  const todas = [carga('1', '2026-11-01', { km: 1000 }), carga('2', '2026-11-04', { km: 1300, cantidad: 10 })];
  const r = armarReporte({ cargas: [todas[1]], todas, tipo: 'dia', clave: '2026-11-04', vehiculos: veh, choferes: cho });
  assert.equal(r.totales.cargas, 1);
  assert.equal(r.filas[0].kmGal, 30, '300 km con 10 galones, usando la carga anterior que no va en el reporte');
});

test('armarReporte: vehículo eliminado y reporte vacío no rompen nada', () => {
  const r = armarReporte({ cargas: [carga('1', '2026-11-04', { vehiculoId: 'borrado', choferId: 'no' })], tipo: 'dia', clave: '2026-11-04', vehiculos: veh, choferes: cho });
  assert.equal(r.filas[0].placa, '(vehículo eliminado)');
  assert.equal(r.filas[0].chofer, '');
  const vacio = armarReporte({ cargas: [], tipo: 'mes', clave: '2026-11', vehiculos: veh, choferes: cho });
  assert.deepEqual(vacio.totales, { cargas: 0, cantidad: 0, monto: 0, precio: null, conFoto: 0 });
  assert.equal(vacio.titulo, 'Reporte mensual de combustible');
});

test('nombreArchivo y CSV: nombre sin espacios ni acentos, una fila por carga y fila de total', () => {
  const r = armarReporte({ cargas: [carga('1', '2026-11-04'), carga('2', '2026-11-04', { fotoId: 'f' })], tipo: 'dia', clave: '2026-11-04', vehiculos: veh, choferes: cho });
  assert.equal(nombreArchivo(r, 'pdf'), 'combustible-diario-2026-11-04.pdf');
  const m = armarReporte({ cargas: [], tipo: 'mes', clave: '2026-11', vehiculos: veh, choferes: cho });
  assert.equal(nombreArchivo(m, 'csv'), 'combustible-mensual-2026-11.csv');
  const csv = csvReporte(r);
  assert.equal(csv.filas.length, 3);
  assert.equal(csv.filas[0][2], 'I045821');
  assert.equal(csv.filas[1].at(-1), 'Sí', 'marca cuál factura tiene foto');
  assert.equal(csv.filas[2][0], 'TOTAL');
  assert.equal(csv.filas[2][7], '4702.00');
});

test('texto de WhatsApp: el diario lista cada factura; el mensual resume por vehículo; nunca "galone"', () => {
  const cargas = [carga('1', '2026-11-04'), carga('2', '2026-11-04', { vehiculoId: 'v2', cantidad: 20, monto: 5000 })];
  const d = reporteCombustibleTexto(armarReporte({ cargas, tipo: 'dia', clave: '2026-11-04', vehiculos: veh, choferes: cho }));
  assert.match(d, /\*Total:\* 30 galones · RD\$7,351\.00 \(2 cargas\)/);
  assert.match(d, /\*Facturas\*/);
  assert.match(d, /• .*I067310 · .*20 galones/);
  assert.doesNotMatch(d, /galone\b/);
  const mes = reporteCombustibleTexto(armarReporte({ cargas, tipo: 'mes', clave: '2026-11', vehiculos: veh, choferes: cho }));
  assert.match(mes, /Combustible del mes/);
  assert.doesNotMatch(mes, /\*Facturas\*/, 'el detalle de cada carga va en el PDF y el CSV, no en el mensaje');
  assert.match(mes, /\*Por vehículo\*/);
  assert.match(reporteCombustibleTexto(armarReporte({ cargas: [], tipo: 'dia', clave: '2026-11-04', vehiculos: veh, choferes: cho })), /sin cargas/);
});

// ---------- PDF ----------

test('aWinAnsi: acentos y símbolos a un byte; lo que no existe se vuelve "?"', () => {
  assert.equal(aWinAnsi('Ramón').charCodeAt(3), 0xf3);
  assert.equal(aWinAnsi('—').charCodeAt(0), 0x97);
  assert.equal(aWinAnsi('a b'), 'a b', 'el espacio duro de Intl se vuelve espacio normal');
  assert.equal(aWinAnsi('🚚'), '?');
});

test('anchoTexto y truncar: la negrita es más ancha y el texto largo se corta con "…" dentro del ancho', () => {
  assert.ok(anchoTexto('Hola', 10, true) > anchoTexto('Hola', 10));
  assert.ok(anchoTexto('WWW', 10) > anchoTexto('iii', 10));
  const t = truncar('Estación Shell Autopista Duarte', 60, 8.5);
  assert.ok(t.endsWith('…') && anchoTexto(t, 8.5) <= 60);
  assert.equal(truncar('Texaco', 60, 8.5), 'Texaco');
});

test('dimensionesJPEG: lee ancho y alto; rechaza lo que no es JPEG', () => {
  assert.deepEqual(dimensionesJPEG(JPEG), { ancho: 16, alto: 24, componentes: 3 });
  assert.equal(dimensionesJPEG(new Uint8Array([1, 2, 3, 4, 5])), null);
});

/** Comprueba la estructura del PDF: cabecera, %%EOF y que cada entrada de la tabla xref apunte a "N 0 obj". */
function validarPDF(bytes) {
  const t = Buffer.from(bytes).toString('latin1');
  assert.ok(t.startsWith('%PDF-1.4'));
  assert.ok(t.trimEnd().endsWith('%%EOF'));
  const inicio = Number(t.match(/startxref\n(\d+)\n%%EOF/)[1]);
  assert.ok(t.slice(inicio).startsWith('xref'));
  const total = Number(t.slice(inicio).match(/^xref\n0 (\d+)/)[1]);
  const lineas = t.slice(inicio).split('\n').slice(3, 3 + total - 1);
  lineas.forEach((l, i) => {
    const off = Number(l.slice(0, 10));
    assert.ok(t.slice(off).startsWith(`${i + 1} 0 obj`), `objeto ${i + 1}: la tabla xref apunta mal`);
  });
  return t;
}

test('PDF básico: estructura válida, páginas y texto con acentos', () => {
  const d = new DocumentoPDF();
  d.nuevaPagina().texto(40, 60, 'Ramón (prueba) \\ ok');
  d.nuevaPagina().texto(40, 60, 'Segunda');
  const t = validarPDF(d.generar());
  assert.match(t, /\/Count 2/);
  assert.ok(t.includes('Ram\xf3n \\(prueba\\) \\\\ ok'), 'paréntesis y barra invertida van escapados');
});

test('PDF del reporte: título, periodo, totales y número de página', () => {
  const cargas = [carga('1', '2026-11-04'), carga('2', '2026-11-04', { vehiculoId: 'v2', monto: 5000 })];
  const r = armarReporte({ cargas, tipo: 'dia', clave: '2026-11-04', vehiculos: veh, choferes: cho });
  const t = validarPDF(pdfReporteCombustible(r, new Map(), new Date('2026-11-04T20:00:00Z')));
  for (const s of ['Reporte diario de combustible', 'I045821', 'I067310', 'TOTAL', 'RD$7,351.00', 'P\xe1gina 1 de 1', 'Dilo group']) assert.ok(t.includes(s), `falta "${s}" en el PDF`);
  assert.ok(!t.includes('/DCTDecode'), 'sin fotos no hay imágenes');
});

test('PDF del reporte: con fotos las incrusta; con muchas cargas pagina y repite el encabezado de la tabla', () => {
  const muchas = Array.from({ length: 60 }, (_, i) => carga(String(i), `2026-11-${String(1 + (i % 28)).padStart(2, '0')}`, { fotoId: i % 10 === 0 ? `f${i}` : null }));
  const r = armarReporte({ cargas: cargasDelPeriodo(muchas, 'mes', '2026-11'), tipo: 'mes', clave: '2026-11', vehiculos: veh, choferes: cho });
  const fotos = new Map(r.filas.filter((f) => f.fotoId).map((f) => [f.fotoId, JPEG]));
  const t = validarPDF(pdfReporteCombustible(r, fotos));
  assert.ok(Number(t.match(/\/Count (\d+)/)[1]) >= 3, 'más de una página');
  assert.equal((t.match(/\/Subtype \/Image/g) || []).length, 6, 'una imagen por cada factura con foto');
  assert.ok(t.includes('/DCTDecode'));
  assert.ok(t.includes('Facturas \\(6\\)'), 'en PDF los paréntesis van escapados');
  assert.ok((t.match(/Detalle de cargas|Fecha/g) || []).length >= 2, 'el encabezado de la tabla se repite en cada página');
});

test('PDF del reporte: una foto que no es JPEG válido no rompe el documento', () => {
  const r = armarReporte({ cargas: [carga('1', '2026-11-04', { fotoId: 'mala' })], tipo: 'dia', clave: '2026-11-04', vehiculos: veh, choferes: cho });
  const t = validarPDF(pdfReporteCombustible(r, new Map([['mala', new Uint8Array([9, 9, 9, 9])]])));
  assert.ok(t.includes('No se pudo incluir esta foto'));
});
