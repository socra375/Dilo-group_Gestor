// Pestaña "Más": accesos a módulos secundarios y extensiones activas.
import { CONFIG } from '../config.js';
import { EXTENSIONES } from '../core/esquemas.js';
import { esc, icon } from '../core/ui.js';

const ENTRADAS = [
  { ruta: 'rutas', titulo: 'Rutas', texto: 'Salida, llegada, duración y horarios', icono: 'route' },
  { ruta: 'vehiculos', titulo: 'Vehículos', texto: 'Placa, estado, seguro y mantenimiento', icono: 'truck' },
  ...(CONFIG.modulos.asistencia ? [{ ruta: 'asistencia', titulo: 'Asistencia', texto: 'Entrada y salida de los choferes', icono: 'clock' }] : []),
  { ruta: 'reportes', titulo: 'Reportes', texto: 'Retrasos, combustible y exportar CSV', icono: 'chart' },
  { ruta: 'ajustes', titulo: 'Ajustes', texto: 'Tema, letra, tolerancia y respaldo', icono: 'settings' },
];

export default {
  titulo: 'Más',
  pestana: 'mas',
  render(el) {
    const extras = EXTENSIONES
      .filter((x) => x.activo)
      .map((x) => ({ ruta: x.carpeta, titulo: x.titulo, texto: 'Extensión', icono: 'grid' }));
    el.innerHTML = `<ul class="menu stagger">${[...ENTRADAS, ...extras]
      .map((x, i) => `<li style="--i:${i}"><a href="#/${x.ruta}">${icon(x.icono)}<span class="menu__text"><strong>${esc(x.titulo)}</strong><small>${esc(x.texto)}</small></span>${icon('chevron', 'icon--sm')}</a></li>`)
      .join('')}</ul>`;
  },
};
