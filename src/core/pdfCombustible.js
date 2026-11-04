// PDF del reporte de combustible: encabezado con la empresa, totales, tabla de cargas, resumen por vehículo y,
// si se pide, las fotos de las facturas. Usa el generador mínimo de core/pdf.js (A4 vertical).
import { DocumentoPDF, truncar } from './pdf.js';
import { CONFIG } from '../config.js';
import * as fmt from './format.js';
import { hoyClave } from './time.js';

const M = 40; // margen
const AZUL = [0.07, 0.2, 0.29]; // #12334A
const AMBAR = [0.95, 0.66, 0];
const BLANCO = [1, 1, 1];
const TEXTO = [0.07, 0.11, 0.15];
const GRIS = [0.35, 0.42, 0.49];
const LINEA = [0.8, 0.84, 0.88];
const ZEBRA = [0.95, 0.96, 0.98];
const PIE = 50; // espacio reservado abajo (número de página)

/**
 * @param rep    resultado de armarReporte()
 * @param fotos  Map fotoId → bytes JPEG (solo las de las cargas elegidas, si se quiere incluirlas)
 * @returns Uint8Array con el PDF
 */
export function pdfReporteCombustible(rep, fotos = new Map(), ahora = new Date()) {
  const doc = new DocumentoPDF();
  const util = doc.ancho - 2 * M;
  const u = fmt.unidad();
  const uLarga = fmt.unidad('larga');
  let pag = null;
  let y = 0;

  const nuevaPagina = (primera = false) => {
    pag = doc.nuevaPagina();
    if (primera) {
      pag.rect(0, 0, doc.ancho, 72, { relleno: AZUL });
      pag.rect(0, 72, doc.ancho, 3, { relleno: AMBAR });
      pag.texto(M, 33, CONFIG.empresa.nombre, { tam: 19, negrita: true, color: BLANCO });
      pag.texto(M, 53, rep.titulo, { tam: 11, color: BLANCO });
      pag.texto(doc.ancho - M, 33, 'Control de Transporte', { tam: 9, color: [0.8, 0.86, 0.92], alinear: 'der' });
      y = 98;
    } else {
      pag.rect(0, 0, doc.ancho, 34, { relleno: AZUL });
      pag.texto(M, 22, `${CONFIG.empresa.nombre} · ${rep.titulo}`, { tam: 10, negrita: true, color: BLANCO });
      y = 56;
    }
  };
  const asegurar = (alto) => {
    if (y + alto > doc.alto - PIE) nuevaPagina(false);
  };

  nuevaPagina(true);
  pag.texto(M, y, rep.periodoTexto, { tam: 13, negrita: true, color: TEXTO });
  y += 15;
  pag.texto(M, y, `Generado el ${fmt.fechaNum(hoyClave(ahora))} a las ${fmt.hora(ahora.toISOString())}`, { tam: 8.5, color: GRIS });
  y += 22;

  // --- Tarjetas de totales ---
  const t = rep.totales;
  const tarjetas = [
    ['Cargas', fmt.numero(t.cargas)],
    [uLarga.replace(/^./, (c) => c.toUpperCase()), fmt.numero(t.cantidad, 1)],
    ['Monto total', fmt.dinero(t.monto)],
    [`Precio por ${u}`, t.precio != null ? fmt.dinero(t.precio) : '—'],
  ];
  const gap = 8;
  const w = (util - gap * 3) / 4;
  tarjetas.forEach(([etiqueta, valor], i) => {
    const x = M + i * (w + gap);
    pag.rect(x, y, w, 46, { relleno: ZEBRA, borde: LINEA });
    pag.rect(x, y, 3, 46, { relleno: AMBAR });
    pag.texto(x + 10, y + 15, etiqueta.toUpperCase(), { tam: 7.5, color: GRIS, negrita: true });
    pag.texto(x + 10, y + 35, truncar(valor, w - 16, 14, true), { tam: 14, negrita: true, color: TEXTO });
  });
  y += 46 + 20;

  // --- Tabla de cargas ---
  const cols = [
    { t: 'Fecha', w: 54, k: 'fecha' },
    { t: 'Hora', w: 56, k: 'hora' },
    { t: 'Vehículo', w: 54, k: 'placa' },
    { t: 'Chofer', w: 100, k: 'chofer' },
    { t: 'Estación', w: 86, k: 'estacion' },
    { t: uLarga.replace(/^./, (c) => c.toUpperCase()), w: 40, k: 'cantidad', der: true },
    { t: 'Monto', w: 78, k: 'monto', der: true },
    { t: 'Factura', w: 47, k: 'foto', centro: true },
  ];
  // Borde derecho (menos el relleno) de una columna: sirve para alinear la fila de totales con su columna.
  const bordeDer = (k) => M + cols.slice(0, cols.findIndex((c) => c.k === k) + 1).reduce((s, c) => s + c.w, 0) - 5;
  const filaH = 19;
  const celda = (c, f) => {
    switch (c.k) {
      case 'fecha': return fmt.fecha(f.fecha);
      case 'hora': return f.hora ? fmt.horaTexto(f.hora) : '—';
      case 'cantidad': return fmt.numero(f.cantidad, f.cantidad % 1 ? 1 : 0);
      case 'monto': return fmt.dinero(f.monto);
      case 'foto': return f.fotoId ? 'Sí' : 'No';
      default: return f[c.k] || '';
    }
  };
  const cabeceraTabla = () => {
    pag.rect(M, y, util, filaH, { relleno: AZUL });
    let x = M;
    for (const c of cols) {
      const tx = c.der ? x + c.w - 5 : c.centro ? x + c.w / 2 : x + 5;
      pag.texto(tx, y + 13, c.t, { tam: 8, negrita: true, color: BLANCO, alinear: c.der ? 'der' : c.centro ? 'centro' : 'izq' });
      x += c.w;
    }
    y += filaH;
  };

  pag.texto(M, y, 'Detalle de cargas', { tam: 11, negrita: true, color: TEXTO });
  y += 10;
  cabeceraTabla();
  rep.filas.forEach((f, i) => {
    if (y + filaH > doc.alto - PIE) {
      nuevaPagina(false);
      cabeceraTabla();
    }
    if (i % 2 === 0) pag.rect(M, y, util, filaH, { relleno: ZEBRA });
    let x = M;
    for (const c of cols) {
      const tx = c.der ? x + c.w - 5 : c.centro ? x + c.w / 2 : x + 5;
      const texto = truncar(celda(c, f), c.w - 10, 8.5);
      pag.texto(tx, y + 13, texto, { tam: 8.5, color: TEXTO, alinear: c.der ? 'der' : c.centro ? 'centro' : 'izq' });
      x += c.w;
    }
    y += filaH;
  });
  pag.linea(M, y, M + util, y, { color: GRIS, grosor: 0.8 });
  asegurar(filaH + 4);
  pag.texto(M + 5, y + 14, `TOTAL · ${fmt.plural(t.cargas, 'carga', 'cargas')}`, { tam: 9, negrita: true, color: TEXTO });
  pag.texto(bordeDer('cantidad'), y + 14, fmt.numero(t.cantidad, 1), { tam: 9, negrita: true, color: TEXTO, alinear: 'der' });
  pag.texto(bordeDer('monto'), y + 14, fmt.dinero(t.monto), { tam: 9, negrita: true, color: TEXTO, alinear: 'der' });
  y += filaH + 22;

  // --- Resumen por vehículo ---
  if (rep.porVehiculo.length > 1) {
    asegurar(40 + rep.porVehiculo.length * filaH);
    pag.texto(M, y, 'Resumen por vehículo', { tam: 11, negrita: true, color: TEXTO });
    y += 10;
    const cv = [
      { t: 'Vehículo', w: 150 },
      { t: 'Cargas', w: 90, der: true },
      { t: uLarga.replace(/^./, (c) => c.toUpperCase()), w: 90, der: true },
      { t: 'Monto', w: 100, der: true },
      { t: `Precio por ${u}`, w: util - 430, der: true },
    ];
    pag.rect(M, y, util, filaH, { relleno: AZUL });
    let x = M;
    for (const c of cv) {
      pag.texto(c.der ? x + c.w - 5 : x + 5, y + 13, c.t, { tam: 8, negrita: true, color: BLANCO, alinear: c.der ? 'der' : 'izq' });
      x += c.w;
    }
    y += filaH;
    rep.porVehiculo.forEach((g, i) => {
      if (i % 2 === 0) pag.rect(M, y, util, filaH, { relleno: ZEBRA });
      const vals = [g.placa, fmt.numero(g.cargas), fmt.numero(g.cantidad, 1), fmt.dinero(g.monto), g.precio != null ? fmt.dinero(g.precio) : '—'];
      let xx = M;
      cv.forEach((c, j) => {
        pag.texto(c.der ? xx + c.w - 5 : xx + 5, y + 13, truncar(vals[j], c.w - 10, 8.5), { tam: 8.5, color: TEXTO, alinear: c.der ? 'der' : 'izq' });
        xx += c.w;
      });
      y += filaH;
    });
    y += 22;
  }

  // --- Facturas (fotos) ---
  const conFoto = rep.filas.filter((f) => f.fotoId && fotos.has(f.fotoId));
  if (conFoto.length) {
    const colW = (util - 14) / 2;
    const imgH = 270;
    const celdaH = imgH + 34;
    asegurar(24 + celdaH);
    pag.texto(M, y, `Facturas (${conFoto.length})`, { tam: 11, negrita: true, color: TEXTO });
    y += 14;
    const ids = new Map();
    conFoto.forEach((f, i) => {
      if (i % 2 === 0 && i > 0) y += celdaH;
      if (i % 2 === 0) asegurar(celdaH);
      const x = M + (i % 2) * (colW + 14);
      let id = ids.get(f.fotoId);
      if (id === undefined) {
        id = doc.agregarImagen(fotos.get(f.fotoId));
        ids.set(f.fotoId, id);
      }
      pag.rect(x, y, colW, imgH, { borde: LINEA });
      if (id) {
        const im = doc.imagenes[id - 1];
        const escala = Math.min((colW - 8) / im.ancho, (imgH - 8) / im.alto);
        const iw = im.ancho * escala;
        const ih = im.alto * escala;
        pag.imagen(id, x + (colW - iw) / 2, y + (imgH - ih) / 2, iw, ih);
      } else {
        pag.texto(x + colW / 2, y + imgH / 2, 'No se pudo incluir esta foto', { tam: 9, color: GRIS, alinear: 'centro' });
      }
      pag.texto(x, y + imgH + 13, truncar(`${fmt.fecha(f.fecha)}${f.hora ? ` ${fmt.horaTexto(f.hora)}` : ''} · ${f.placa}`, colW, 9, true), { tam: 9, negrita: true, color: TEXTO });
      pag.texto(x, y + imgH + 25, truncar(`${fmt.dinero(f.monto)} · ${f.estacion || f.chofer || ''}`, colW, 8.5), { tam: 8.5, color: GRIS });
    });
  }

  // --- Pie de página ---
  const n = doc.paginas.length;
  doc.paginas.forEach((p, i) => {
    p.linea(M, doc.alto - 36, doc.ancho - M, doc.alto - 36, { color: LINEA });
    p.texto(M, doc.alto - 22, `${CONFIG.empresa.nombre} · Control de Transporte`, { tam: 8, color: GRIS });
    p.texto(doc.ancho - M, doc.alto - 22, `Página ${i + 1} de ${n}`, { tam: 8, color: GRIS, alinear: 'der' });
  });
  return doc.generar();
}
