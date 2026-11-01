import { pantallaCrud, chipSeleccion } from '../core/crud.js';
import { camposDe } from '../core/esquemas.js';
import { hoyClave } from '../core/time.js';
import { avisoSeguro, avisoMantenimiento, ultimosKm } from '../core/avisos.js';
import * as fmt from '../core/format.js';
import { esc } from '../core/ui.js';
import * as store from '../data/store.js';

const campoEstado = camposDe('vehiculos').find((c) => c.clave === 'estado');
const tono = (a) => (a.severidad === 'urgente' ? 'error' : 'aviso');

export default pantallaCrud({
  modulo: 'vehiculos',
  titulo: 'Vehículos',
  pestana: 'mas',
  icono: 'truck',
  // El kilometraje actual sale de la última carga de combustible (para el aviso de mantenimiento).
  refsDe: ['combustible'],
  ordenar: (a, b) => a.placa.localeCompare(b.placa, 'es', { numeric: true }),
  describir(v, refs) {
    const hoy = hoyClave();
    const km = ultimosKm(refs.combustible || []).get(v.id);
    const avisos = [avisoSeguro(v, hoy), avisoMantenimiento(v, hoy, km)].filter(Boolean);
    const urgente = avisos.some((a) => a.severidad === 'urgente');
    return {
      titulo: v.placa,
      subtitulo: v.descripcion || '',
      meta: [
        km != null ? `${fmt.numero(km)} km` : '',
        v.seguroVence && !avisos.some((a) => a.tipo === 'seguro') ? `Seguro vence ${fmt.fecha(v.seguroVence)}` : '',
      ].filter(Boolean),
      chips: campoEstado ? chipSeleccion(campoEstado, v.estado) : '',
      extra: avisos.map((a) => `<span class="chip chip--${tono(a)}">${esc(a.texto)}</span>`).join(''),
      clase: avisos.length ? (urgente ? 'item--error' : 'item--warn') : '',
    };
  },
  async alGuardar(v, existente) {
    // La placa identifica al vehículo: no se permiten duplicadas.
    const otros = await store.list('vehiculos', { archivados: 'todos' });
    if (otros.some((x) => x.placa === v.placa && x.id !== existente?.id)) {
      throw { errores: { placa: 'Ya existe un vehículo con esta placa (revisa también los archivados).' } };
    }
    return v;
  },
});
