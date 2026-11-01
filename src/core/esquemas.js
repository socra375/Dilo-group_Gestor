// Catálogo de campos de cada módulo. CONFIG (src/config.js) decide cuáles están activos; aquí se
// define cómo es cada uno (tipo, etiqueta, validación, cómo se lista).
//
//   clave     nombre interno del dato (no cambiar si ya hay datos guardados)
//   cfg       interruptor en CONFIG.<modulo>.campos que lo enciende o apaga (varios campos pueden compartirlo)
//   tipo      texto | telefono | cedula | placa | fecha | hora | numero | dinero | seleccion | referencia | notas
//   fijo      lo necesita la lógica de negocio: se muestra aunque su interruptor esté apagado
//   enLista   'titulo' | 'subtitulo' | 'meta' | 'chip' | false
//   grupo     campos consecutivos con el mismo grupo se muestran juntos bajo un subtítulo
import { CONFIG } from '../config.js';

export const VERSION_APP = '0.2.0';
export const LOCALE = 'es-DO';
export const MONEDA_ISO = 'DOP'; // Intl lo muestra como "RD$" (CONFIG.empresa.moneda)
export const TAMANOS_LETRA = { normal: 17, grande: 19, extra: 21 };

// Motivos rápidos del retraso (chips). "Otro" pide escribirlo. SUPUESTO: lista por confirmar con el cliente.
export const MOTIVOS_RETRASO = ['Tráfico', 'Lluvia', 'Avería', 'Accidente en la vía', 'Pasajeros tarde', 'Otro'];

// Parámetros internos que el cliente no definió (SUPUESTOS; ver DECISIONES.md).
export const PARAMETROS = {
  diasAvisoRespaldo: 7,
  horasTurnoLargo: 12,
};

// Puntos de extensión (el cliente los quiere a futuro). Carpeta: src/modules/extensiones/<carpeta>/index.js.
export const EXTENSIONES = [
  { id: 'sueldos', carpeta: 'sueldos', titulo: 'Sueldos y pagos' },
  { id: 'mantenimiento_completo', carpeta: 'mantenimiento', titulo: 'Mantenimiento y reparaciones' },
  { id: 'servicios_vehiculo', carpeta: 'servicios-vehiculo', titulo: 'Limpieza y servicios del vehículo' },
  { id: 'mapa', carpeta: 'mapa', titulo: 'Mapa de vehículos' },
  { id: 'acceso_choferes', carpeta: 'acceso-choferes', titulo: 'Acceso de choferes' },
].map((x) => ({ ...x, activo: CONFIG.modulos[x.id] === true }));

// Subtítulos de los grupos de campos en los formularios.
export const GRUPOS = {
  licencia: 'Licencia de conducir',
  emergencia: 'Contacto de emergencia',
  seguro: 'Seguro',
  mantenimiento: 'Próximo mantenimiento',
  programado: 'Horario programado',
  real: 'Horario real',
};

export const META = {
  choferes: { singular: 'chofer' },
  rutas: { singular: 'ruta', femenino: true },
  vehiculos: { singular: 'vehículo' },
  viajes: { singular: 'viaje' },
  combustible: { singular: 'carga', femenino: true },
  turnos: { singular: 'turno' },
};

const ESQUEMAS = {
  choferes: [
    { clave: 'fotoId', cfg: 'foto', etiqueta: 'Foto', tipo: 'foto', lado: 400 },
    { clave: 'nombre', cfg: 'nombre', etiqueta: 'Nombre completo', tipo: 'texto', requerido: true, fijo: true, enLista: 'titulo', buscable: true, max: 80 },
    // La spec pide validar la cédula sin bloquear: si no tiene 11 dígitos, solo se advierte.
    { clave: 'cedula', cfg: 'cedula', etiqueta: 'Cédula', tipo: 'cedula', buscable: true, soloAdvertir: true },
    { clave: 'telefono', cfg: 'telefono', etiqueta: 'Teléfono', tipo: 'telefono', enLista: 'subtitulo', buscable: true },
    { clave: 'direccion', cfg: 'direccion', etiqueta: 'Dirección', tipo: 'texto', max: 120 },
    { clave: 'licencia', cfg: 'licencia_vencimiento', etiqueta: 'Licencia (número o categoría)', tipo: 'texto', grupo: 'licencia', buscable: true, max: 30 },
    { clave: 'licenciaVence', cfg: 'licencia_vencimiento', etiqueta: 'Vence', tipo: 'fecha', grupo: 'licencia', enLista: 'meta' },
    { clave: 'contactoNombre', cfg: 'contacto_emergencia', etiqueta: 'Nombre', tipo: 'texto', grupo: 'emergencia', max: 80 },
    { clave: 'contactoTelefono', cfg: 'contacto_emergencia', etiqueta: 'Teléfono', tipo: 'telefono', grupo: 'emergencia' },
    { clave: 'vehiculoId', cfg: 'vehiculo_asignado', etiqueta: 'Vehículo asignado', tipo: 'referencia', coleccion: 'vehiculos', mostrar: 'placa' },
    { clave: 'fechaIngreso', cfg: 'fecha_ingreso', etiqueta: 'Fecha de ingreso', tipo: 'fecha' },
    { clave: 'notas', cfg: 'notas', etiqueta: 'Notas internas', tipo: 'notas', max: 300 },
  ],

  rutas: [
    { clave: 'nombre', cfg: 'nombre', etiqueta: 'Nombre de la ruta', tipo: 'texto', requerido: true, fijo: true, enLista: 'titulo', buscable: true, max: 60 },
    { clave: 'origen', cfg: 'salida', etiqueta: 'Punto de salida', tipo: 'texto', requerido: true, enLista: 'subtitulo', buscable: true, max: 60 },
    { clave: 'destino', cfg: 'llegada', etiqueta: 'Punto de llegada', tipo: 'texto', requerido: true, enLista: 'subtitulo', buscable: true, max: 60 },
    { clave: 'duracionMin', cfg: 'duracion_min', etiqueta: 'Duración normal (minutos)', tipo: 'numero', requerido: true, fijo: true, enLista: 'meta', min: 1, max: 1440, entero: true },
    { clave: 'horarios', cfg: 'horarios_fijos', etiqueta: 'Horarios fijos de salida', tipo: 'horas', ayuda: 'Con estos horarios se generan los viajes del día.' },
    { clave: 'cliente', cfg: 'cliente', etiqueta: 'Empresa o cliente que la usa', tipo: 'texto', enLista: 'meta', buscable: true, max: 60 },
    // Desactivados por decisión del cliente; quedan definidos para encenderlos con una línea en CONFIG.
    { clave: 'km', cfg: 'km', etiqueta: 'Distancia (km)', tipo: 'numero', min: 0, max: 2000 },
    { clave: 'paradas', cfg: 'paradas', etiqueta: 'Paradas', tipo: 'notas', max: 300 },
    { clave: 'tarifa', cfg: 'tarifa', etiqueta: 'Tarifa', tipo: 'dinero', min: 0, max: 1000000 },
  ],

  vehiculos: [
    // Placa RD: 1–2 letras + 5–6 dígitos (p. ej. I045821).
    { clave: 'placa', cfg: 'placa', etiqueta: 'Placa', tipo: 'placa', requerido: true, fijo: true, enLista: 'titulo', buscable: true, patron: '^[A-Z]{1,2}\\d{5,6}$', mensajePatron: 'El formato usual es 1–2 letras y 5–6 números (ej. I045821). Se guardará como la escribiste.', soloAdvertir: true },
    { clave: 'descripcion', cfg: 'descripcion', etiqueta: 'Descripción (marca, modelo, capacidad)', tipo: 'texto', enLista: 'subtitulo', buscable: true, max: 80 },
    {
      clave: 'estado', cfg: 'estado', etiqueta: 'Estado', tipo: 'seleccion', requerido: true, enLista: 'chip', porDefecto: 'disponible',
      opciones: [
        { valor: 'disponible', etiqueta: 'Disponible', tono: 'ok' },
        { valor: 'taller', etiqueta: 'En taller', tono: 'aviso' },
        { valor: 'fuera', etiqueta: 'Fuera de servicio', tono: 'error' },
      ],
    },
    { clave: 'seguroAseguradora', cfg: 'seguro', etiqueta: 'Aseguradora', tipo: 'texto', grupo: 'seguro', max: 60 },
    { clave: 'seguroPoliza', cfg: 'seguro', etiqueta: 'Póliza', tipo: 'texto', grupo: 'seguro', max: 40 },
    { clave: 'seguroVence', cfg: 'seguro', etiqueta: 'Vence', tipo: 'fecha', grupo: 'seguro' },
    { clave: 'mantenimientoFecha', cfg: 'proximo_mantenimiento', etiqueta: 'Fecha', tipo: 'fecha', grupo: 'mantenimiento' },
    { clave: 'mantenimientoKm', cfg: 'proximo_mantenimiento', etiqueta: 'Kilometraje', tipo: 'numero', grupo: 'mantenimiento', min: 0, max: 2000000, entero: true },
  ],

  viajes: [
    { clave: 'rutaId', etiqueta: 'Ruta', tipo: 'referencia', coleccion: 'rutas', mostrar: 'nombre', requerido: true, fijo: true },
    // No obligatorios: "Generar viajes de hoy" los crea sin asignar y el supervisor los completa después.
    { clave: 'choferId', etiqueta: 'Chofer', tipo: 'referencia', coleccion: 'choferes', mostrar: 'nombre' },
    { clave: 'vehiculoId', etiqueta: 'Vehículo', tipo: 'referencia', coleccion: 'vehiculos', mostrar: 'placa' },
    { clave: 'fecha', etiqueta: 'Fecha', tipo: 'fecha', requerido: true, fijo: true },
    { clave: 'salidaProg', etiqueta: 'Salida programada', tipo: 'hora', requerido: true, fijo: true, grupo: 'programado' },
    { clave: 'llegadaProg', etiqueta: 'Llegada programada', tipo: 'hora', requerido: true, fijo: true, grupo: 'programado', ayuda: 'Si es menor que la salida, se toma como el día siguiente.' },
    { clave: 'salidaReal', etiqueta: 'Salida real', tipo: 'hora', fijo: true, grupo: 'real', ahora: true },
    { clave: 'llegadaReal', etiqueta: 'Llegada real', tipo: 'hora', fijo: true, grupo: 'real', ahora: true },
    // Visible y obligatorio solo cuando el viaje queda Retrasado (CONFIG.viajes.motivo).
    { clave: 'motivoRetraso', etiqueta: 'Motivo del retraso', tipo: 'motivo', opciones: MOTIVOS_RETRASO, max: 200 },
    { clave: 'notas', etiqueta: 'Notas', tipo: 'notas', max: 300 },
  ],

  combustible: [
    { clave: 'fecha', cfg: 'fecha_hora', etiqueta: 'Fecha', tipo: 'fecha', requerido: true, fijo: true, enLista: 'meta' },
    { clave: 'vehiculoId', cfg: 'vehiculo', etiqueta: 'Vehículo', tipo: 'referencia', coleccion: 'vehiculos', mostrar: 'placa', requerido: true, enLista: 'titulo', buscable: true },
    { clave: 'choferId', cfg: 'chofer', etiqueta: 'Chofer', tipo: 'referencia', coleccion: 'choferes', mostrar: 'nombre', enLista: 'subtitulo', buscable: true },
    { clave: 'cantidad', cfg: 'cantidad', etiqueta: 'Cantidad', tipo: 'numero', requerido: true, fijo: true, enLista: 'meta', min: 0.1, max: 500, unidad: 'combustible' },
    { clave: 'monto', cfg: 'monto', etiqueta: 'Monto', tipo: 'dinero', requerido: true, fijo: true, enLista: 'meta', min: 1, max: 1000000 },
  ],

  turnos: [
    { clave: 'fecha', etiqueta: 'Fecha', tipo: 'fecha', requerido: true, fijo: true },
    { clave: 'entrada', etiqueta: 'Hora de entrada', tipo: 'hora', requerido: true, fijo: true },
    { clave: 'salida', etiqueta: 'Hora de salida', tipo: 'hora', fijo: true, ayuda: 'Si es menor que la entrada, se toma como el día siguiente.' },
  ],
};

/** ¿Está encendido el interruptor de este campo en CONFIG? Sin interruptor = siempre activo. */
function activo(modulo, campo) {
  if (campo.fijo || !campo.cfg) return true;
  return CONFIG[modulo]?.campos?.[campo.cfg] === true;
}

/** Campos visibles de un módulo, en orden. */
export function camposDe(modulo) {
  const lista = ESQUEMAS[modulo];
  if (!lista) throw new Error(`Módulo sin esquema: ${modulo}`);
  return lista.filter((c) => activo(modulo, c));
}

/** Todos los campos definidos, activos o no (para pruebas y documentación). */
export const todosLosCampos = (modulo) => ESQUEMAS[modulo] ?? [];
