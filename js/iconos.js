// iconos.js — un solo juego de iconos, dibujado a mano.
// Rejilla de 24, trazo de 1.75, extremos redondeados. Sin librerías y sin
// mezclar familias: la coherencia del trazo es lo que hace que no parezcan
// pegados de sitios distintos.
//
// (Los iconos de las ACTIVIDADES son emoji y los elige la usuaria: eso es
// contenido, no interfaz, y por eso va aparte.)

const envolver = (d, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
  stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${d}</svg>`;

export const iconos = {
  mas: envolver('<path d="M12 5v14M5 12h14"/>'),
  cerrar: envolver('<path d="M6 6l12 12M18 6L6 18"/>'),
  izquierda: envolver('<path d="M15 5l-7 7 7 7"/>'),
  derecha: envolver('<path d="M9 5l7 7-7 7"/>'),
  check: envolver('<path d="M4.5 12.5l5 5 10-11"/>', 'stroke-width="2.75"'),
  hoy: envolver('<path d="M4 7.5h16M4 7.5A2.5 2.5 0 016.5 5h11A2.5 2.5 0 0120 7.5v10a2.5 2.5 0 01-2.5 2.5h-11A2.5 2.5 0 014 17.5v-10z"/><path d="M8 3.5v3M16 3.5v3"/><path d="M8 12.5h8M8 16h5"/>'),
  habitos: envolver('<circle cx="12" cy="12" r="8.25"/><path d="M12 3.75a8.25 8.25 0 018.25 8.25"/><path d="M12 8.5v4l2.5 1.5"/>'),
  papelera: envolver('<path d="M4.5 6.5h15M9.5 6.5V5a1.5 1.5 0 011.5-1.5h2A1.5 1.5 0 0114.5 5v1.5"/><path d="M6.5 6.5l.8 12a2 2 0 002 1.9h5.4a2 2 0 002-1.9l.8-12"/>'),
  reloj: envolver('<circle cx="12" cy="12" r="8.25"/><path d="M12 7v5.2l3.4 2"/>'),
  puntos: envolver('<circle cx="5.5" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="18.5" cy="12" r="1.3" fill="currentColor" stroke="none"/>'),
};

/** `<button class="icono-btn">` con icono y nombre accesible. */
export function botonIcono(nombre, etiqueta, atributos = '') {
  return `<button type="button" class="icono-btn" aria-label="${etiqueta}" title="${etiqueta}" ${atributos}>${iconos[nombre]}</button>`;
}
