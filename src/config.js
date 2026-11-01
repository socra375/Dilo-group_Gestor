// Configuración del cliente (Dilo group). Pegada tal cual de la especificación.
// Cambiar un campo o un aviso = editar una línea aquí. Los tipos y etiquetas de cada campo están en
// src/core/esquemas.js; este archivo solo decide qué está activo.
export const CONFIG = {
  empresa: { nombre: 'Dilo group', moneda: 'RD$', zona: 'America/Santo_Domingo' },
  tema: { modo: 'claro', color: '#12334A', acento: '#F2A900', letra: 'normal' }, // letra: normal | grande | extra
  inicio: { tipo: 'resumen' },
  viajes: {
    tolerancia_min: 5,                 // SUPUESTO: el cliente no respondió
    hora_manual: true,                 // el cliente eligió escribir la hora
    atajo_ahora: true,                 // SUPUESTO: rellena el campo, no guarda
    motivo: 'obligatorio_si_retraso',  // "Sí, siempre" interpretado
    generar_desde_horarios: true
  },
  choferes: { campos: { nombre: true, cedula: true, telefono: true, foto: true, direccion: true,
    licencia_vencimiento: true, contacto_emergencia: true, vehiculo_asignado: true, fecha_ingreso: true, notas: true } },
  rutas: { campos: { nombre: true, salida: true, llegada: true, duracion_min: true, horarios_fijos: true,
    cliente: true, km: false, paradas: false, tarifa: false } },
  vehiculos: { campos: { placa: true, descripcion: true, estado: true, seguro: true, proximo_mantenimiento: true } },
  combustible: { unidad: 'galones', tipos: ['Gasoil', 'Gasolina'], campos: { fecha_hora: true, vehiculo: true,
    chofer: true, cantidad: true, monto: true, tipo: true, km: true, estacion: true, foto_recibo: true } },
  reportes: { retrasos_chofer: true, retrasos_ruta: true, combustible_periodo: true, combustible_vehiculo: true,
    resumen_diario: true, horas_chofer: false, entrega: 'whatsapp', csv: true },
  avisos: {
    viaje_retrasado: true,
    licencia: { activo: true, dias: [30, 15, 7] },
    seguro: { activo: true, dias: [30, 15, 7] },                    // extra
    combustible_alto: { activo: true, umbral_pct: 20, ventana_dias: 30 },
    mantenimiento: { activo: true, dias: 7, km: 500 },
    chofer_sin_entrada: false
  },
  modulos: { asistencia: true,            // SUPUESTO por confirmar
    sueldos: false, mantenimiento_completo: false, servicios_vehiculo: false,
    mapa: false, acceso_choferes: false, renta_vehiculos: false, facturacion: false }
};
