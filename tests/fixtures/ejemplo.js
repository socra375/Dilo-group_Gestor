// DATOS DE PRUEBA para el e2e y el QA. La app NO los trae: arranca vacía y el cliente carga lo suyo.
// Las pruebas los cargan en el navegador con sembrar() (ver scripts/ayudas.cjs). Llevan `ejemplo: true` para distinguirlos
// de lo que crea la propia prueba. Nombres, cédulas (000-…, no existen) y teléfonos (809-555-01xx, reservados para ficción)
// son inventados.
import * as store from '../../src/data/store.js';
import { CONFIG } from '../../src/config.js';
import { MOTIVOS_RETRASO } from '../../src/core/esquemas.js';
import { setPref } from '../../src/core/prefs.js';
import { aISO, hoyClave, sumarDias, sumarMinutos, diaSemana } from '../../src/core/time.js';

// Generador pseudoaleatorio con semilla: los mismos datos en cada instalación.
function azar(semilla) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PRECIO_GALON = { Gasoil: 235.1, Gasolina: 272.5 }; // SUPUESTO: precios de referencia para el ejemplo

export async function sembrar(ahora = new Date()) {
  const r = azar(20261101);
  const entre = (a, b) => a + Math.floor(r() * (b - a + 1));
  const hoy = hoyClave(ahora);
  const ahoraT = ahora.getTime();
  const ej = { ejemplo: true };

  const vehiculos = [
    { placa: 'I045821', descripcion: 'Toyota Coaster 2019 · 30 pasajeros', estado: 'disponible', seguroAseguradora: 'Aseguradora Demo', seguroPoliza: 'POL-DEMO-0001', seguroVence: sumarDias(hoy, 210), mantenimientoFecha: sumarDias(hoy, 60), mantenimientoKm: 135000 },
    // Seguro por vencer en 12 días → aviso de seguro.
    { placa: 'I067310', descripcion: 'Hyundai County 2021 · 29 pasajeros', estado: 'disponible', seguroAseguradora: 'Aseguradora Demo', seguroPoliza: 'POL-DEMO-0002', seguroVence: sumarDias(hoy, 12), mantenimientoFecha: sumarDias(hoy, 90), mantenimientoKm: 75000 },
    // Mantenimiento próximo por kilometraje (se ajusta abajo al último km registrado).
    { placa: 'I052984', descripcion: 'Nissan Urvan 2018 · 15 pasajeros', estado: 'disponible', seguroAseguradora: 'Aseguradora Demo', seguroPoliza: 'POL-DEMO-0003', seguroVence: sumarDias(hoy, 150), mantenimientoFecha: sumarDias(hoy, 40), mantenimientoKm: null },
    { placa: 'G031177', descripcion: 'Toyota Hiace 2020 · 15 pasajeros', estado: 'disponible', seguroAseguradora: 'Aseguradora Demo', seguroPoliza: 'POL-DEMO-0004', seguroVence: sumarDias(hoy, 320), mantenimientoFecha: sumarDias(hoy, 75), mantenimientoKm: 95000 },
  ].map((v, i) => ({ ...v, ...ej, id: `ej-vehiculo-${i + 1}` }));

  const choferes = [
    { nombre: 'Juan Carlos Pérez Mejía', licenciaDias: 410 },
    // Licencia por vencer en 10 días → aviso de licencia.
    { nombre: 'Ramón Antonio Féliz', licenciaDias: 10 },
    { nombre: 'María Altagracia Santos', licenciaDias: 240 },
    { nombre: 'Luis Manuel De la Cruz', licenciaDias: 95 },
    { nombre: 'Pedro José Almonte', licenciaDias: 180 },
  ].map((c, i) => ({
    ...ej,
    id: `ej-chofer-${i + 1}`,
    nombre: c.nombre,
    cedula: `000000000${i + 1}${i + 1}`.slice(-11),
    telefono: `809555010${i + 1}`,
    direccion: `Calle Ejemplo ${i + 1}, Santo Domingo`,
    licencia: `Cat. 4 · DEMO-${1000 + i}`,
    licenciaVence: sumarDias(hoy, c.licenciaDias),
    contactoNombre: `Contacto de ejemplo ${i + 1}`,
    contactoTelefono: `829555011${i + 1}`,
    vehiculoId: vehiculos[i % vehiculos.length].id,
    fechaIngreso: sumarDias(hoy, -(400 + i * 97)),
    notas: '',
  }));

  const rutas = [
    { nombre: 'R1 Alcarrizos – ZF Las Américas', origen: 'Los Alcarrizos', destino: 'Zona Franca Las Américas', duracionMin: 55, horarios: ['05:30', '15:30'], cliente: 'Cliente de ejemplo A' },
    { nombre: 'R2 Villa Mella – Haina', origen: 'Villa Mella', destino: 'Parque Industrial Haina', duracionMin: 70, horarios: ['05:45', '17:00'], cliente: 'Cliente de ejemplo B' },
    { nombre: 'R3 SDE – ZF San Isidro', origen: 'Santo Domingo Este', destino: 'Zona Franca San Isidro', duracionMin: 35, horarios: ['06:15'], cliente: 'Cliente de ejemplo A' },
    { nombre: 'R4 Herrera – Naco', origen: 'Herrera', destino: 'Ensanche Naco', duracionMin: 40, horarios: ['13:30'], cliente: 'Cliente de ejemplo C' },
    // 11:40 p. m. + 25 min → cruza la medianoche.
    { nombre: 'R5 Boca Chica – AILA', origen: 'Boca Chica', destino: 'Aeropuerto Las Américas', duracionMin: 25, horarios: ['23:40'], cliente: 'Cliente de ejemplo D' },
  ].map((x, i) => ({ ...x, ...ej, id: `ej-ruta-${i + 1}` }));

  // Quién cubre cada horario: [ruta, chofer, vehículo].
  const asignacion = { 'R1-05:30': [0, 0], 'R1-15:30': [0, 0], 'R2-05:45': [1, 1], 'R2-17:00': [1, 1], 'R3-06:15': [2, 2], 'R4-13:30': [3, 3], 'R5-23:40': [4, 3] };

  const viajes = [];
  for (let d = -13; d <= 0; d++) {
    const dia = sumarDias(hoy, d);
    const domingo = diaSemana(dia) === 0;
    rutas.forEach((ruta, ri) => {
      for (const salida of ruta.horarios) {
        if (domingo && salida > '06:00' && salida < '23:00') continue;
        const [ci, vi] = asignacion[`R${ri + 1}-${salida}`];
        const salidaProg = aISO(dia, salida);
        const llegadaProg = sumarMinutos(salidaProg, ruta.duracionMin);
        const retrasado = r() < 0.22;
        const retraso = retrasado ? entre(7, 38) : entre(-6, 4);
        const salidaReal = sumarMinutos(salidaProg, retrasado ? entre(0, 12) : entre(-3, 3));
        const llegadaReal = sumarMinutos(llegadaProg, retraso);
        const v = {
          ...ej,
          id: `ej-viaje-${dia}-${salida}-${ri}`,
          rutaId: ruta.id, choferId: choferes[ci].id, vehiculoId: vehiculos[vi].id,
          salidaProg, llegadaProg, salidaReal: null, llegadaReal: null, motivoRetraso: '', notas: '',
        };
        // Solo se registra lo que ya ocurrió respecto a "ahora".
        if (new Date(salidaReal).getTime() <= ahoraT) v.salidaReal = salidaReal;
        if (new Date(llegadaReal).getTime() <= ahoraT) {
          v.llegadaReal = llegadaReal;
          if (retraso > CONFIG.viajes.tolerancia_min) v.motivoRetraso = MOTIVOS_RETRASO[entre(0, MOTIVOS_RETRASO.length - 2)];
        }
        viajes.push(v);
      }
    });
  }
  // Uno de hoy queda "Sin llegada registrada" para que el aviso se vea.
  const deHoy = viajes.filter((v) => v.llegadaReal && v.id.includes(hoy)).sort((a, b) => a.salidaProg.localeCompare(b.salidaProg));
  const sinLlegada = deHoy[deHoy.length - 1];
  if (sinLlegada) Object.assign(sinLlegada, { llegadaReal: null, motivoRetraso: '' });

  // Combustible: cargas de tanque lleno cada 3 días por vehículo. El km sube con el uso; el
  // rendimiento normal (km/gal) es estable, salvo la última carga del County, que sale ~35 % peor
  // para activar el aviso de combustible alto.
  const RENDIMIENTO = [24, 22, 30, 32];
  const KM_DIA = [115, 140, 70, 60];
  const TIPO = ['Gasoil', 'Gasoil', 'Gasoil', 'Gasolina'];
  const kmInicial = [128400, 64250, 151900, 87600];
  const combustible = [];
  vehiculos.forEach((veh, i) => {
    let km = kmInicial[i];
    const fechas = [];
    for (let d = -15 + i; d <= 0; d += 3) fechas.push(sumarDias(hoy, d));
    fechas.forEach((dia, n) => {
      const horaCarga = `0${6 + (n % 3)}:${String(10 + i * 7).padStart(2, '0')}`;
      if (new Date(aISO(dia, horaCarga)).getTime() > ahoraT) return;
      const recorrido = n === 0 ? 0 : KM_DIA[i] * 3 + entre(-25, 25);
      km += recorrido;
      const anomalia = i === 1 && n === fechas.length - 1;
      const rend = anomalia ? RENDIMIENTO[i] * 0.65 : RENDIMIENTO[i] * (1 + entre(-4, 4) / 100);
      const galones = n === 0 ? 20 : Math.round((recorrido / rend) * 10) / 10;
      combustible.push({
        ...ej,
        id: `ej-combustible-${dia}-${i}`,
        fecha: dia, hora: horaCarga, vehiculoId: veh.id, choferId: choferes[i].id,
        cantidad: galones, monto: Math.round(galones * PRECIO_GALON[TIPO[i]] * 100) / 100,
        tipo: TIPO[i], km, estacion: `Estación de ejemplo ${i + 1}`, tanqueLleno: true, fotoId: null,
      });
    });
    // Mantenimiento por kilometraje a 350 km del último registro → aviso de mantenimiento.
    if (veh.mantenimientoKm === null) veh.mantenimientoKm = km + 350;
  });

  const asistencia = [];
  for (let d = -13; d <= 0; d++) {
    const dia = sumarDias(hoy, d);
    choferes.forEach((c, i) => {
      if (diaSemana(dia) === 0) return;
      const entrada = aISO(dia, i === 3 ? '12:45' : '05:00');
      const salida = sumarMinutos(entrada, 9 * 60 + entre(-20, 40));
      if (new Date(entrada).getTime() > ahoraT) return;
      asistencia.push({
        ...ej, id: `ej-asistencia-${dia}-${i}`, choferId: c.id, fecha: dia,
        entrada: sumarMinutos(entrada, entre(-10, 10)),
        salida: new Date(salida).getTime() <= ahoraT ? salida : null,
      });
    });
  }

  await store.createMany('vehiculos', vehiculos);
  await store.createMany('choferes', choferes);
  await store.createMany('rutas', rutas);
  await store.createMany('viajes', viajes);
  await store.createMany('combustible', combustible);
  await store.createMany('asistencia', asistencia);
  setPref('ultimoRespaldo', ahora.toISOString()); // sin recordatorio de respaldo en los datos de prueba
}

export async function borrarDatosEjemplo() {
  let total = 0;
  for (const c of store.COLECCIONES) {
    const items = (await store.list(c, { archivados: 'todos' })).filter((x) => x.ejemplo);
    for (const x of items) if (x.fotoId) await store.borrarFoto(x.fotoId);
    total += await store.removeMany(c, items.map((x) => x.id));
  }
  return total;
}
