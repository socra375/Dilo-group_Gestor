// Reporte de combustible para enviar al jefe (diario o mensual): qué cargas ("facturas") entran, totales, CSV y nombres de archivo.
// Funciones puras: la pantalla (modules/reporteCombustible.js) las usa y las pruebas las cubren sin navegador.
import { rendimientos } from './avisos.js';
import * as fmt from './format.js';

const redondear = (n, d = 2) => Math.round((Number(n) || 0) * 10 ** d) / 10 ** d;
const cap = (t) => t.replace(/^./, (c) => c.toUpperCase());

/** Último día de un mes 'AAAA-MM' → 'AAAA-MM-DD'. */
export function ultimoDiaMes(ym) {
  const [a, m] = ym.split('-').map(Number);
  return `${ym}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, '0')}`;
}

/** [desde, hasta] del reporte: un día ('dia', 'AAAA-MM-DD') o un mes completo ('mes', 'AAAA-MM'). */
export function rangoReporte(tipo, clave) {
  return tipo === 'mes' ? [`${clave}-01`, ultimoDiaMes(clave)] : [clave, clave];
}

/** Cargas del periodo (sin archivadas), de la más antigua a la más nueva: así se lee como un recibo. */
export function cargasDelPeriodo(cargas, tipo, clave) {
  const [desde, hasta] = rangoReporte(tipo, clave);
  return cargas
    .filter((c) => !c.archivado && c.fecha >= desde && c.fecha <= hasta)
    .sort((a, b) => `${a.fecha} ${a.hora || ''}`.localeCompare(`${b.fecha} ${b.hora || ''}`) || String(a.creado).localeCompare(String(b.creado)));
}

/**
 * Arma el reporte con las cargas ELEGIDAS.
 * @param {object} p  { cargas (las elegidas), todas (todas las cargas, para el rendimiento), tipo, clave,
 *                      vehiculos: Map id→placa, choferes: Map id→nombre }
 */
export function armarReporte({ cargas, todas = cargas, tipo, clave, vehiculos, choferes }) {
  const rend = rendimientos(todas);
  const [desde, hasta] = rangoReporte(tipo, clave);
  const filas = cargas.map((c) => {
    const cantidad = Number(c.cantidad) || 0;
    const monto = Number(c.monto) || 0;
    return {
      id: c.id,
      fecha: c.fecha,
      hora: c.hora || '',
      placa: vehiculos.get(c.vehiculoId) ?? '(vehículo eliminado)',
      chofer: choferes.get(c.choferId) ?? '',
      tipo: c.tipo || '',
      estacion: c.estacion || '',
      cantidad,
      monto,
      precio: cantidad ? redondear(monto / cantidad) : null,
      km: c.km != null && c.km !== '' ? Number(c.km) : null,
      kmGal: rend.get(c.id)?.kmGal ?? null,
      tanqueLleno: c.tanqueLleno !== false,
      fotoId: c.fotoId || null,
    };
  });
  const cantidad = redondear(filas.reduce((s, f) => s + f.cantidad, 0), 1);
  const monto = redondear(filas.reduce((s, f) => s + f.monto, 0));
  const porPlaca = new Map();
  for (const f of filas) {
    const g = porPlaca.get(f.placa) ?? { placa: f.placa, cargas: 0, cantidad: 0, monto: 0 };
    g.cargas++;
    g.cantidad += f.cantidad;
    g.monto += f.monto;
    porPlaca.set(f.placa, g);
  }
  const periodoTexto = tipo === 'mes'
    ? `${cap(fmt.mes(clave))} · del ${fmt.fecha(desde)} al ${fmt.fecha(hasta)}`
    : `${cap(fmt.fechaLarga(clave))} · ${fmt.fecha(clave)}`;
  return {
    tipo,
    clave,
    desde,
    hasta,
    titulo: tipo === 'mes' ? 'Reporte mensual de combustible' : 'Reporte diario de combustible',
    periodoTexto,
    filas,
    totales: { cargas: filas.length, cantidad, monto, precio: cantidad ? redondear(monto / cantidad) : null, conFoto: filas.filter((f) => f.fotoId).length },
    porVehiculo: [...porPlaca.values()]
      .map((g) => ({ ...g, cantidad: redondear(g.cantidad, 1), monto: redondear(g.monto), precio: g.cantidad ? redondear(g.monto / g.cantidad) : null }))
      .sort((a, b) => b.monto - a.monto),
  };
}

/** Nombre de archivo sin acentos ni espacios: combustible-diario-2026-11-04.pdf / combustible-mensual-2026-11.csv */
export const nombreArchivo = (rep, extension) => `combustible-${rep.tipo === 'mes' ? 'mensual' : 'diario'}-${rep.clave}.${extension}`;

/** Filas para el CSV (Excel): una por carga y una fila final con los totales. */
export function csvReporte(rep) {
  const u = fmt.unidad('larga');
  const encabezados = ['Fecha', 'Hora', 'Vehículo', 'Chofer', 'Tipo', 'Estación', `Cantidad (${u})`, 'Monto (RD$)', 'Precio por unidad (RD$)', 'Kilometraje', `Rendimiento (km/${fmt.unidad()})`, 'Tanque lleno', 'Factura con foto'];
  const filas = rep.filas.map((f) => [
    fmt.fecha(f.fecha), f.hora, f.placa, f.chofer, f.tipo, f.estacion, f.cantidad, f.monto.toFixed(2), f.precio ?? '', f.km ?? '', f.kmGal ?? '', f.tanqueLleno ? 'Sí' : 'No', f.fotoId ? 'Sí' : 'No',
  ]);
  filas.push(['TOTAL', '', `${rep.totales.cargas} carga${rep.totales.cargas === 1 ? '' : 's'}`, '', '', '', rep.totales.cantidad, rep.totales.monto.toFixed(2), rep.totales.precio ?? '', '', '', '', `${rep.totales.conFoto}`]);
  return { nombre: nombreArchivo(rep, 'csv'), encabezados, filas };
}
