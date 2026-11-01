import { pantallaCrud } from '../core/crud.js';
import { formatoDuracion } from '../core/time.js';
import * as fmt from '../core/format.js';

export default pantallaCrud({
  modulo: 'rutas',
  titulo: 'Rutas',
  pestana: 'mas',
  icono: 'route',
  ordenar: (a, b) => a.nombre.localeCompare(b.nombre, 'es', { numeric: true }),
  describir: (r) => ({
    titulo: r.nombre,
    subtitulo: [r.origen, r.destino].filter(Boolean).join(' → '),
    meta: [
      r.duracionMin ? `Duración: ${formatoDuracion(r.duracionMin)}` : '',
      r.horarios?.length ? `Salidas: ${r.horarios.map(fmt.horaTexto).join(', ')}` : 'Sin horarios fijos',
      r.cliente || '',
    ].filter(Boolean),
  }),
});
