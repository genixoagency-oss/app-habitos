// vista-hoy.js — el timeline del día. La pantalla principal.
//
// El eje es continuo: un minuto son siempre los mismos píxeles, así que la
// altura de un bloque ES su duración y los huecos libres se ven solos. Eso es
// lo que hace que el día se entienda de un vistazo y no haya que leer horas.

import { Estado, aHora, minutosAhora, claveDia, desdeClave, bloqueEfectivo, colorHex, Repeticion } from './modelo.js';
import { agendaDelDia, repartirEnCarriles } from './repeticion.js';
import { progresoDelDia } from './progreso.js';
import { esc, tituloDia, subtituloDia, duracionTexto, plural } from './dom.js';
import { iconos } from './iconos.js';

const PX_MIN = 1.05;         // píxeles por minuto — debe coincidir con --px-min
const ALTO_MIN_BLOQUE = 44;  // objetivo táctil mínimo
const MARGEN = 30;           // aire por arriba y por abajo del primer/último bloque
const HUECO = 4;             // separación mínima entre dos bloques seguidos
const ALCANCE_AHORA = 90;    // cuánto puede estirar la ventana la marca de "ahora"
const R_ANILLO = 54;
const PERIMETRO = 2 * Math.PI * R_ANILLO;
const PERIMETRO_CHECK = 2 * Math.PI * 10.75;

/**
 * Ventana de horas que se pinta: 7:00–23:00 como mínimo, más lo que se salga.
 * Si el día que se mira es hoy, la ventana se estira para que la marca de
 * "ahora" siempre quepa: si no, a las 6 de la mañana el eje mentiría.
 */
export function ventana(items, ahora = null) {
  let desde = 7 * 60;
  let hasta = 23 * 60;
  for (const item of items) {
    const b = bloqueEfectivo(item.actividad, item.registro);
    if (!b) continue;
    desde = Math.min(desde, b.inicio - MARGEN);
    hasta = Math.max(hasta, b.fin + MARGEN);
  }
  // La marca de "ahora" estira la ventana sólo si está cerca del día real. De
  // madrugada no tiene sentido pintar seis horas de nada para poder enseñar una
  // línea: el día todavía no ha empezado y el eje se lee mejor sin ella.
  if (ahora != null && ahora >= desde - ALCANCE_AHORA && ahora <= hasta + ALCANCE_AHORA) {
    desde = Math.min(desde, ahora - MARGEN);
    hasta = Math.max(hasta, ahora + MARGEN);
  }
  return { desde: Math.max(0, Math.floor(desde / 60) * 60), hasta: Math.min(1440, Math.ceil(hasta / 60) * 60) };
}

/**
 * Coloca los bloques. Un bloque muy corto no puede medir menos que un objetivo
 * táctil, así que los de 15 minutos se pintan más altos de lo que duran; si dos
 * de esos van seguidos se solaparían. Esta pasada empuja el siguiente hacia
 * abajo lo justo. Las líneas de las horas no se tocan: siguen diciendo la
 * verdad, y sólo se desplaza lo que no cabe.
 */
export function colocar(items, desde) {
  const finPorCarril = new Map();
  let fondo = 0;
  for (const item of items) {
    const b = bloqueEfectivo(item.actividad, item.registro);
    const carril = item.carril ?? 0;
    const alto = Math.max(ALTO_MIN_BLOQUE, (b.fin - b.inicio) * PX_MIN);
    let arriba = (b.inicio - desde) * PX_MIN;
    const anterior = finPorCarril.get(carril);
    if (anterior != null) arriba = Math.max(arriba, anterior + HUECO);
    finPorCarril.set(carril, arriba + alto);
    fondo = Math.max(fondo, arriba + alto);
    item.geo = { arriba, alto };
  }
  return fondo;
}

// ── Anillo ───────────────────────────────────────────────────────────────────

function anillo(progreso) {
  const relleno = progreso.vacio ? 0 : progreso.fraccion;
  const desfase = PERIMETRO * (1 - Math.min(1, relleno));
  const etiqueta = progreso.vacio
    ? 'Sin nada previsto todavía'
    : `${progreso.porcentaje} por ciento del día completado`;

  return `
    <div class="anillo" role="img" aria-label="${etiqueta}">
      <svg viewBox="0 0 120 120" focusable="false">
        <circle class="anillo__pista" cx="60" cy="60" r="${R_ANILLO}"/>
        <circle class="anillo__trazo" cx="60" cy="60" r="${R_ANILLO}"
          stroke-dasharray="${PERIMETRO.toFixed(2)}" stroke-dashoffset="${desfase.toFixed(2)}"/>
      </svg>
      <span class="anillo__centro" aria-hidden="true">
        <span class="anillo__cifra num">${progreso.vacio ? '—' : progreso.porcentaje}${progreso.vacio ? '' : '<sup>%</sup>'}</span>
      </span>
    </div>`;
}

function marcador(progreso, resumen) {
  const pie = progreso.vacio
    ? `<span class="marcador__cuenta">Día en blanco</span>
       <span class="marcador__nota">Todavía no hay nada puesto para hoy.</span>`
    : `<span class="marcador__cuenta num">${progreso.completadas} de ${progreso.total}</span>
       <span class="marcador__nota">${
         progreso.total === progreso.completadas
           ? '¡Día perfecto!'
           : `${plural(progreso.total - progreso.completadas, 'queda', 'quedan')} ${progreso.total - progreso.completadas}`
       }${resumen.puntuales.total > 0 ? ` · ${resumen.puntuales.total} ${plural(resumen.puntuales.total, 'tarea suelta', 'tareas sueltas')}` : ''}</span>`;

  return `
    <button type="button" class="marcador" data-accion="resumen">
      ${anillo(progreso)}
      <span class="marcador__pie">
        ${pie}
        <span class="marcador__enlace">Ver el resumen del día ${iconos.derecha}</span>
      </span>
    </button>`;
}

// ── Casilla de marcado ───────────────────────────────────────────────────────

export function check(actividad, registro) {
  const objetivo = actividad.objetivo;
  const etiquetas = {
    [Estado.PENDIENTE]: 'Marcar como hecho',
    [Estado.EN_CURSO]: 'Marcar como hecho',
    [Estado.PARCIAL]: objetivo ? `Sumar uno (llevas ${registro.valorLogrado} de ${objetivo.valor})` : 'Marcar como hecho',
    [Estado.COMPLETADA]: objetivo ? 'Volver a empezar' : 'Marcar como saltado',
    [Estado.SALTADA]: 'Volver a dejarlo pendiente',
  };

  let aro = '';
  if (objetivo && registro.estado === Estado.PARCIAL) {
    const desfase = PERIMETRO_CHECK * (1 - registro.valorLogrado / objetivo.valor);
    aro = `<svg class="marca-check__aro" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="10.75" stroke-dasharray="${PERIMETRO_CHECK.toFixed(2)}" stroke-dashoffset="${desfase.toFixed(2)}"/>
    </svg>`;
  }

  return `<button type="button" class="marca-check" data-accion="tocar" data-id="${esc(actividad.id)}"
    aria-label="${esc(`${etiquetas[registro.estado] ?? 'Marcar'}: ${actividad.nombre}`)}">${aro}${iconos.check}</button>`;
}

/** Segunda línea de un bloque: hora, duración, objetivo y subtareas. */
function meta(item) {
  const { actividad, registro } = item;
  const b = bloqueEfectivo(actividad, registro);
  const trozos = [];
  if (b) trozos.push(`${aHora(b.inicio)}–${aHora(b.fin)}`);
  if (b) trozos.push(duracionTexto(b.fin - b.inicio));
  if (actividad.objetivo) trozos.push(`${registro.valorLogrado} de ${actividad.objetivo.valor} ${actividad.objetivo.unidad}`);
  if (item.hijas?.length) {
    const hechas = item.hijas.filter((h) => h.registro.estado === Estado.COMPLETADA).length;
    trozos.push(`${hechas} de ${item.hijas.length} ${plural(item.hijas.length, 'subtarea')}`);
  }
  return trozos.join(' · ');
}

// ── Bloques del eje ──────────────────────────────────────────────────────────

function bloque(item) {
  const { actividad, registro } = item;
  const { arriba, alto } = item.geo;
  const carriles = item.carriles ?? 1;
  const carril = item.carril ?? 0;
  const ancho = `calc((100% - ${(carriles - 1) * 6}px) / ${carriles})`;
  const izq = `calc((${ancho} + 6px) * ${carril})`;
  const corto = alto < 56 ? ' bloque--corto' : '';
  const movido = registro.inicioReal != null;

  return `
    <div class="bloque${corto}" data-id="${esc(actividad.id)}" data-estado="${registro.estado}"
      style="top:${arriba.toFixed(1)}px; height:${alto.toFixed(1)}px; inline-size:${ancho}; inset-inline-start:${izq};
             --color-actividad:${colorHex(actividad.color)}">
      ${check(actividad, registro)}
      <button type="button" class="bloque__cuerpo" data-accion="abrir" data-id="${esc(actividad.id)}">
        <span class="bloque__nombre">${actividad.icono ? `<span class="bloque__icono" aria-hidden="true">${esc(actividad.icono)}</span>` : ''}${esc(actividad.nombre)}</span>
        <span class="bloque__meta num">${esc(meta(item))}${movido ? ' · movido hoy' : ''}</span>
      </button>
      <button type="button" class="bloque__tirador" data-accion="estirar" data-id="${esc(actividad.id)}"
        aria-label="${esc(`Cambiar la duración de ${actividad.nombre}`)}"></button>
    </div>`;
}

function ejeDeTiempo(items, esHoy) {
  const conHora = items.filter((i) => bloqueEfectivo(i.actividad, i.registro));
  if (conHora.length === 0) return '';

  const ahora = minutosAhora();
  const { desde, hasta } = ventana(conHora, esHoy ? ahora : null);
  repartirEnCarriles(conHora);
  const fondo = colocar(conHora, desde);
  const alto = Math.max((hasta - desde) * PX_MIN, fondo);

  let horas = '';
  for (let m = desde; m <= hasta; m += 60) {
    horas += `<div class="hora" style="top:${((m - desde) * PX_MIN).toFixed(1)}px">
      <span class="hora__n num">${m >= 1440 ? '24:00' : aHora(m)}</span>
    </div>`;
  }

  const marcaAhora = esHoy && ahora >= desde && ahora <= hasta
    ? `<div class="ahora" style="top:${((ahora - desde) * PX_MIN).toFixed(1)}px">
         <span class="ahora__etiqueta num">${aHora(ahora)}</span>
         <span class="ahora__punto"></span>
         <span class="ahora__linea"></span>
       </div>`
    : '';

  return `
    <div class="eje" style="height:${alto.toFixed(1)}px" data-desde="${desde}" data-hasta="${hasta}">
      <div class="eje__horas" aria-hidden="true">${horas}</div>
      ${marcaAhora}
      <div class="eje__bloques">${conHora.map((i) => bloque(i)).join('')}</div>
    </div>`;
}

// ── Filas sin hora ───────────────────────────────────────────────────────────

export function fila(item, sangrada = false) {
  const { actividad, registro } = item;
  const textoMeta = meta(item);
  return `
    <li>
      <div class="fila" data-id="${esc(actividad.id)}" data-estado="${registro.estado}"
        style="--color-actividad:${colorHex(actividad.color)}">
        ${check(actividad, registro)}
        <button type="button" class="bloque__cuerpo fila__cuerpo" data-accion="abrir" data-id="${esc(actividad.id)}">
          <span class="fila__nombre">${actividad.icono ? `<span class="bloque__icono" aria-hidden="true">${esc(actividad.icono)}</span>` : ''}${esc(actividad.nombre)}</span>
          ${textoMeta ? `<span class="fila__meta num">${esc(textoMeta)}</span>` : ''}
        </button>
        <span class="fila__punto" aria-hidden="true"></span>
      </div>
      ${item.hijas?.length && !sangrada ? `<ul class="sublista">${item.hijas.map((h) => fila(h, true)).join('')}</ul>` : ''}
    </li>`;
}

function seccionSinHora(items) {
  if (items.length === 0) return '';
  const hechas = items.filter((i) => i.registro.estado === Estado.COMPLETADA).length;
  return `
    <section class="seccion">
      <h2 class="seccion__titulo">Sin hora fija
        <span class="seccion__cuenta num">${hechas} de ${items.length}</span>
      </h2>
      <ul>${items.map((i) => fila(i)).join('')}</ul>
    </section>`;
}

function subtareasVisibles(items) {
  const conHijas = items.filter((i) => i.hijas?.length && bloqueEfectivo(i.actividad, i.registro));
  if (conHijas.length === 0) return '';
  return conHijas.map((padre) => `
    <section class="seccion">
      <h2 class="seccion__titulo">${esc(padre.actividad.nombre)}
        <span class="seccion__cuenta num">${padre.hijas.filter((h) => h.registro.estado === Estado.COMPLETADA).length} de ${padre.hijas.length}</span>
      </h2>
      <ul>${padre.hijas.map((h) => fila(h, true)).join('')}</ul>
    </section>`).join('');
}

// ── Estado vacío ─────────────────────────────────────────────────────────────

function vacio(hayActividades) {
  return hayActividades
    ? `<div class="vacio">
         <p class="vacio__titulo">Hoy no toca nada</p>
         <p class="vacio__texto">Ninguno de tus hábitos cae en este día. Puedes añadir algo suelto sólo para hoy.</p>
         <div class="vacio__acciones">
           <button type="button" class="btn btn--principal" data-accion="nueva">Añadir algo</button>
         </div>
       </div>`
    : `<div class="vacio">
         <p class="vacio__titulo">Empieza por una sola cosa</p>
         <p class="vacio__texto">Ponle nombre, una hora y cada cuánto se repite. A partir de ahí aparecerá sola cada día.</p>
         <div class="vacio__acciones">
           <button type="button" class="btn btn--principal" data-accion="nueva">Crear mi primer hábito</button>
           <button type="button" class="btn btn--texto" data-accion="ejemplo">O ver un día de ejemplo</button>
         </div>
       </div>`;
}

// ── Vista completa ───────────────────────────────────────────────────────────

export function pintarHoy(almacen) {
  const fecha = desdeClave(almacen.dia);
  const esHoy = almacen.dia === claveDia();
  const agenda = agendaDelDia(almacen.actividades, almacen.registros, almacen.dia);
  const progreso = progresoDelDia(almacen.actividades, almacen.registros, almacen.dia);
  const resumen = { puntuales: { total: agenda.filter((i) => i.actividad.repeticion.tipo === Repeticion.NINGUNA).length } };

  const sinHora = agenda.filter((i) => !bloqueEfectivo(i.actividad, i.registro));
  const hayAlgo = agenda.length > 0;

  return `
    <header class="cabecera">
      <div class="contenedor">
        <div class="cabecera__fila">
          <button type="button" class="icono-btn" data-accion="dia" data-paso="-1" aria-label="Día anterior">${iconos.izquierda}</button>
          <h1 class="fecha">
            <span class="fecha__dia">${esc(tituloDia(fecha))}</span>
            <span class="fecha__resto">${esc(subtituloDia(fecha, esHoy))}</span>
          </h1>
          ${!esHoy ? `<button type="button" class="btn btn--texto" data-accion="ir-hoy">Hoy</button>` : ''}
          <button type="button" class="icono-btn" data-accion="dia" data-paso="1" aria-label="Día siguiente">${iconos.derecha}</button>
          <button type="button" class="icono-btn icono-btn--principal" data-accion="nueva" aria-label="Añadir actividad">${iconos.mas}</button>
        </div>
      </div>
    </header>

    <div class="contenedor">
      ${hayAlgo ? marcador(progreso, { puntuales: resumen.puntuales }) : ''}
      ${hayAlgo ? ejeDeTiempo(agenda, esHoy) : vacio(almacen.actividades.length > 0)}
      ${subtareasVisibles(agenda)}
      ${seccionSinHora(sinHora)}
    </div>`;
}

export const constantes = { PX_MIN, ALTO_MIN_BLOQUE };
