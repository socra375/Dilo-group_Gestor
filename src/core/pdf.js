// Generador mínimo de PDF, sin librerías: texto (Helvetica), líneas, rectángulos e imágenes JPEG.
// Lo usa el reporte de combustible. Escribe PDF 1.4 sin comprimir (los textos se pueden leer con cualquier visor y
// se pueden probar buscando cadenas). Las coordenadas son en puntos (1 pt = 1/72 pulgada) con el origen ARRIBA a la izquierda.

// Anchos de Helvetica (milésimas de em) de los caracteres ASCII 32–126. Sirven para alinear y cortar texto.
const ANCHOS = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, // 32–47
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, // 48–63
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, // 64–79
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, // 80–95
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, // 96–111
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584, // 112–126
];
const ANCHO_OTROS = { '¿': 611, '¡': 333, '·': 278, '°': 400, '…': 1000, '–': 556, '—': 1000, '•': 350, '€': 556, '“': 333, '”': 333, '‘': 222, '’': 222 };
// Los caracteres 0x80–0x9F de WinAnsi (cp1252) que no existen en Latin-1.
const WIN = { '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87, 'ˆ': 0x88, '‰': 0x89, 'Š': 0x8a, '‹': 0x8b, 'Œ': 0x8c, 'Ž': 0x8e, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '˜': 0x98, '™': 0x99, 'š': 0x9a, '›': 0x9b, 'œ': 0x9c, 'ž': 0x9e, 'Ÿ': 0x9f };

/** Texto → cadena de bytes WinAnsi (un carácter = un byte). Lo que no existe en WinAnsi se cambia por "?". */
export function aWinAnsi(texto) {
  let s = '';
  for (const ch of String(texto ?? '').replace(/[    ]/g, ' ')) {
    const c = ch.codePointAt(0);
    if (c >= 32 && c <= 126) s += ch;
    else if (c >= 0xa0 && c <= 0xff) s += ch;
    else if (WIN[ch] != null) s += String.fromCharCode(WIN[ch]);
    else s += '?';
  }
  return s;
}

/** Ancho aproximado en puntos. La negrita se calcula un 6 % más ancha (Helvetica-Bold es algo más ancha). */
export function anchoTexto(texto, tam = 10, negrita = false) {
  let u = 0;
  for (const ch of String(texto ?? '').replace(/[    ]/g, ' ')) {
    const c = ch.codePointAt(0);
    if (c >= 32 && c <= 126) u += ANCHOS[c - 32];
    else if (ANCHO_OTROS[ch] != null) u += ANCHO_OTROS[ch];
    else {
      const base = ch.normalize('NFD')[0]; // á → a, ñ → n
      const b = base.codePointAt(0);
      u += b >= 32 && b <= 126 ? ANCHOS[b - 32] : 556;
    }
  }
  return (u / 1000) * tam * (negrita ? 1.06 : 1);
}

/** Corta el texto con "…" para que quepa en `max` puntos. */
export function truncar(texto, max, tam = 10, negrita = false) {
  const t = String(texto ?? '');
  if (anchoTexto(t, tam, negrita) <= max) return t;
  let r = t;
  while (r.length > 1 && anchoTexto(`${r}…`, tam, negrita) > max) r = r.slice(0, -1);
  return `${r.trimEnd()}…`;
}

/** Ancho, alto y componentes de un JPEG (lee el marcador SOF). null si no es un JPEG válido. */
export function dimensionesJPEG(bytes) {
  if (!bytes || bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) { i++; continue; }
    const m = bytes[i + 1];
    if (m === 0xff) { i++; continue; } // relleno
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; } // marcadores sin longitud
    const largo = (bytes[i + 2] << 8) | bytes[i + 3];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      return { alto: (bytes[i + 5] << 8) | bytes[i + 6], ancho: (bytes[i + 7] << 8) | bytes[i + 8], componentes: bytes[i + 9] };
    }
    i += 2 + largo;
  }
  return null;
}

const num = (n) => (Math.round(n * 100) / 100).toString();
const color = (c) => c.map((x) => num(x)).join(' ');
const esc = (s) => aWinAnsi(s).replace(/[\\()]/g, '\\$&');

class PaginaPDF {
  constructor(doc) {
    this.doc = doc;
    this.ops = [];
    this.imagenes = new Set();
  }

  /** `y` es la línea base del texto, medida desde ARRIBA. alinear: 'izq' | 'der' | 'centro' (respecto a `x`). */
  texto(x, y, texto, { tam = 10, negrita = false, color: c = [0, 0, 0], alinear = 'izq' } = {}) {
    const ancho = anchoTexto(texto, tam, negrita);
    const x0 = alinear === 'der' ? x - ancho : alinear === 'centro' ? x - ancho / 2 : x;
    this.ops.push(`BT /${negrita ? 'F2' : 'F1'} ${num(tam)} Tf ${color(c)} rg 1 0 0 1 ${num(x0)} ${num(this.doc.alto - y)} Tm (${esc(texto)}) Tj ET`);
  }

  linea(x1, y1, x2, y2, { grosor = 0.5, color: c = [0.8, 0.84, 0.88] } = {}) {
    this.ops.push(`${num(grosor)} w ${color(c)} RG ${num(x1)} ${num(this.doc.alto - y1)} m ${num(x2)} ${num(this.doc.alto - y2)} l S`);
  }

  /** `y` es el borde superior del rectángulo. */
  rect(x, y, w, h, { relleno = null, borde = null, grosor = 0.5 } = {}) {
    const p = `${num(x)} ${num(this.doc.alto - y - h)} ${num(w)} ${num(h)} re`;
    if (relleno && borde) this.ops.push(`${num(grosor)} w ${color(relleno)} rg ${color(borde)} RG ${p} B`);
    else if (relleno) this.ops.push(`${color(relleno)} rg ${p} f`);
    else if (borde) this.ops.push(`${num(grosor)} w ${color(borde)} RG ${p} S`);
  }

  /** Dibuja la imagen `id` (de agregarImagen) en el rectángulo x, y (arriba), w × h. */
  imagen(id, x, y, w, h) {
    this.imagenes.add(id);
    this.ops.push(`q ${num(w)} 0 0 ${num(h)} ${num(x)} ${num(this.doc.alto - y - h)} cm /Im${id} Do Q`);
  }
}

const bytesDe = (s) => {
  const b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 0xff;
  return b;
};

export class DocumentoPDF {
  constructor({ ancho = 595.28, alto = 841.89 } = {}) {
    this.ancho = ancho;
    this.alto = alto;
    this.paginas = [];
    this.imagenes = [];
  }

  nuevaPagina() {
    const p = new PaginaPDF(this);
    this.paginas.push(p);
    return p;
  }

  /** Registra un JPEG y devuelve su id, o null si no se puede usar (no es JPEG o tiene un espacio de color raro). */
  agregarImagen(bytes) {
    const d = dimensionesJPEG(bytes);
    if (!d || !d.ancho || !d.alto || (d.componentes !== 1 && d.componentes !== 3)) return null;
    this.imagenes.push({ bytes, ...d });
    return this.imagenes.length;
  }

  /** Devuelve el PDF como Uint8Array. */
  generar() {
    const partes = [];
    let largo = 0;
    const offsets = [];
    const poner = (x) => {
      const b = typeof x === 'string' ? bytesDe(x) : x;
      partes.push(b);
      largo += b.length;
    };
    const objeto = (n, cuerpo) => {
      offsets[n] = largo;
      poner(`${n} 0 obj\n${cuerpo}\nendobj\n`);
    };
    const flujo = (n, diccionario, datos) => {
      offsets[n] = largo;
      poner(`${n} 0 obj\n<< ${diccionario} /Length ${datos.length} >>\nstream\n`);
      poner(datos);
      poner('\nendstream\nendobj\n');
    };

    const I = this.imagenes.length;
    const base = 5 + I; // objetos de página: contenido = base + 2i, página = base + 2i + 1
    poner('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n');
    objeto(1, '<< /Type /Catalog /Pages 2 0 R >>');
    objeto(2, `<< /Type /Pages /Count ${this.paginas.length} /Kids [${this.paginas.map((_, i) => `${base + 2 * i + 1} 0 R`).join(' ')}] >>`);
    objeto(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    objeto(4, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    this.imagenes.forEach((im, i) => {
      flujo(5 + i, `/Type /XObject /Subtype /Image /Width ${im.ancho} /Height ${im.alto} /ColorSpace /${im.componentes === 1 ? 'DeviceGray' : 'DeviceRGB'} /BitsPerComponent 8 /Filter /DCTDecode`, im.bytes);
    });
    this.paginas.forEach((p, i) => {
      flujo(base + 2 * i, '', bytesDe(p.ops.join('\n')));
      const xobj = [...p.imagenes].map((id) => `/Im${id} ${4 + id} 0 R`).join(' ');
      objeto(base + 2 * i + 1, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(this.ancho)} ${num(this.alto)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >>${xobj ? ` /XObject << ${xobj} >>` : ''} >> /Contents ${base + 2 * i} 0 R >>`);
    });

    const total = base + 2 * this.paginas.length;
    const inicioXref = largo;
    let xref = `xref\n0 ${total}\n0000000000 65535 f \n`;
    for (let n = 1; n < total; n++) xref += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`;
    poner(xref);
    poner(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${inicioXref}\n%%EOF\n`);

    const salida = new Uint8Array(largo);
    let pos = 0;
    for (const p of partes) {
      salida.set(p, pos);
      pos += p.length;
    }
    return salida;
  }
}
