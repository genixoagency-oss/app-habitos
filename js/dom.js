// dom.js — utilidades mínimas de pintado y formato en español.

/** Escapa texto antes de meterlo en HTML. Todo lo que escribe la usuaria pasa por aquí. */
export function esc(valor) {
  return String(valor ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export const $ = (sel, raiz = document) => raiz.querySelector(sel);
export const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

const mayus = (s) => s.charAt(0).toUpperCase() + s.slice(1);

const fmtDiaSemana = new Intl.DateTimeFormat('es-ES', { weekday: 'long' });
const fmtMes = new Intl.DateTimeFormat('es-ES', { month: 'long' });
const fmtLargo = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

export const DIAS_CORTOS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
export const DIAS_LARGOS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

export function tituloDia(fecha) {
  return `${mayus(fmtDiaSemana.format(fecha))} ${fecha.getDate()}`;
}

export function subtituloDia(fecha, esHoy) {
  const mes = fmtMes.format(fecha);
  const anio = fecha.getFullYear() === new Date().getFullYear() ? '' : ` de ${fecha.getFullYear()}`;
  return esHoy ? `${mes}${anio} · hoy` : `${mes}${anio}`;
}

export function fechaLarga(fecha) {
  return mayus(fmtLargo.format(fecha));
}

/** "1 h 15 min", "25 min". Sin ceros de relleno: se lee, no se calcula. */
export function duracionTexto(minutos) {
  if (minutos < 60) return `${minutos} min`;
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** Plural sencillo, que es donde toda app se delata. */
export function plural(n, singular, pluralForma) {
  return n === 1 ? singular : (pluralForma ?? `${singular}s`);
}

/** Aviso efímero abajo, con acción opcional para deshacer. */
let temporizadorAviso = null;
export function avisar(mensaje, accion = null) {
  let caja = $('#aviso');
  if (!caja) {
    caja = document.createElement('div');
    caja.id = 'aviso';
    caja.className = 'aviso';
    caja.setAttribute('role', 'status');
    caja.setAttribute('aria-live', 'polite');
    document.body.append(caja);
  }
  caja.innerHTML = `<div class="aviso__caja"><span>${esc(mensaje)}</span>${
    accion ? `<button type="button" data-deshacer>${esc(accion.texto)}</button>` : ''
  }</div>`;

  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(() => { caja.innerHTML = ''; }, accion ? 7000 : 3200);

  const boton = caja.querySelector('[data-deshacer]');
  if (boton) {
    boton.addEventListener('click', () => {
      clearTimeout(temporizadorAviso);
      caja.innerHTML = '';
      accion.hacer();
    }, { once: true });
  }
}
