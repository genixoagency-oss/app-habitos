// repeticion.js — decide qué actividades tocan un día dado.
//
// Los registros NO se crean por adelantado hasta el infinito: se calculan al
// vuelo para el día que se está mirando, y sólo se persisten cuando se tocan.
// Un día que nunca se abrió y nunca se tocó no ocupa nada.

import { Repeticion, Estado, claveDia, diaSemana, lunesDeLaSemana, sumarDias, claveRegistro, crearRegistro } from './modelo.js';

/** ¿La actividad está viva ese día? (fechaInicio / fechaFin / archivada) */
export function estaVigente(actividad, clave) {
  if (actividad.archivada) return false;
  if (actividad.fechaInicio && clave < actividad.fechaInicio) return false;
  if (actividad.fechaFin && clave > actividad.fechaFin) return false;
  return true;
}

/**
 * ¿Toca esta actividad este día?
 * `registros` sólo hace falta para "X veces por semana", donde el que toque o
 * no depende de cuántas van ya esta semana.
 */
export function tocaEl(actividad, clave, registros = new Map()) {
  if (!estaVigente(actividad, clave)) return false;

  const r = actividad.repeticion;
  switch (r.tipo) {
    case Repeticion.NINGUNA:
      // Una tarea suelta ocurre exactamente el día en que se puso.
      return actividad.fechaInicio === clave;

    case Repeticion.DIARIA:
      return true;

    case Repeticion.DIAS:
      return r.dias.includes(diaSemana(clave));

    case Repeticion.POR_SEMANA: {
      // Sin día fijo: aparece cada día mientras no se haya cumplido el cupo de
      // la semana. Si ya se hizo hoy, sigue apareciendo (para poder deshacerlo).
      const hoy = registros.get(claveRegistro(actividad.id, clave));
      if (hoy && hoy.estado !== Estado.PENDIENTE) return true;
      return hechasEstaSemana(actividad, clave, registros) < r.veces;
    }

    default:
      return false;
  }
}

/** Cuántas veces se completó esta actividad en la semana que contiene `clave`. */
export function hechasEstaSemana(actividad, clave, registros) {
  const lunes = lunesDeLaSemana(clave);
  let n = 0;
  for (let i = 0; i < 7; i++) {
    const reg = registros.get(claveRegistro(actividad.id, sumarDias(lunes, i)));
    if (reg?.estado === Estado.COMPLETADA) n++;
  }
  return n;
}

/**
 * Las actividades de un día, ya emparejadas con su registro (real o recién
 * inventado), ordenadas como se van a pintar en el timeline.
 *
 * Devuelve `{ actividad, registro, bloque, hijas }` donde `hijas` son las
 * subactividades que también tocan ese día.
 */
export function agendaDelDia(actividades, registros, clave = claveDia()) {
  const raices = [];
  const porPadre = new Map();

  for (const a of actividades) {
    if (!tocaEl(a, clave, registros)) continue;
    const item = {
      actividad: a,
      registro: registros.get(claveRegistro(a.id, clave)) ?? crearRegistro({ actividadId: a.id, fecha: clave }),
      hijas: [],
    };
    if (a.padreId) {
      if (!porPadre.has(a.padreId)) porPadre.set(a.padreId, []);
      porPadre.get(a.padreId).push(item);
    } else {
      raices.push(item);
    }
  }

  for (const item of raices) {
    item.hijas = (porPadre.get(item.actividad.id) ?? []).sort(comparar);
    porPadre.delete(item.actividad.id);
  }

  // Una hija cuyo padre no toca hoy no debe desaparecer: sube a raíz.
  for (const huerfanas of porPadre.values()) raices.push(...huerfanas);

  return raices.sort(comparar);
}

/**
 * Orden del timeline: primero lo que tiene hora, por hora. Lo que no tiene
 * hora va al final, en su orden manual. Así el eje de tiempo se lee de arriba
 * abajo sin saltos, y lo suelto queda agrupado en un "sin hora" al final.
 */
export function comparar(x, y) {
  const bx = bloqueDe(x);
  const by = bloqueDe(y);
  if (bx && by) return bx.inicio - by.inicio || bx.fin - by.fin;
  if (bx) return -1;
  if (by) return 1;
  return x.actividad.orden - y.actividad.orden || x.actividad.nombre.localeCompare(y.actividad.nombre, 'es');
}

function bloqueDe(item) {
  if (item.registro?.inicioReal != null) {
    return { inicio: item.registro.inicioReal, fin: item.registro.finReal ?? item.registro.inicioReal + 30 };
  }
  return item.actividad.bloque;
}

/** Los huecos libres del día entre `desde` y `hasta` (en minutos). */
export function huecos(agenda, desde = 6 * 60, hasta = 24 * 60) {
  const ocupados = agenda
    .map(bloqueDe)
    .filter(Boolean)
    .sort((a, b) => a.inicio - b.inicio);

  const libres = [];
  let cursor = desde;
  for (const b of ocupados) {
    if (b.inicio > cursor) libres.push({ inicio: cursor, fin: Math.min(b.inicio, hasta) });
    cursor = Math.max(cursor, b.fin);
    if (cursor >= hasta) break;
  }
  if (cursor < hasta) libres.push({ inicio: cursor, fin: hasta });
  return libres.filter((h) => h.fin - h.inicio >= 15);
}

/**
 * Reparte en columnas los bloques que se pisan.
 *
 * La clave está en hacerlo por RACIMOS: un solapamiento a las 10 de la mañana
 * no tiene por qué estrechar la cena. Cada grupo de bloques encadenados se
 * cuenta aparte, así que un día con un único choque mantiene todo lo demás a
 * anchura completa.
 */
export function repartirEnCarriles(items) {
  const conHora = items.filter((i) => bloqueDe(i));
  let racimo = [];
  let carriles = [];
  let finMax = -Infinity;

  const cerrar = () => {
    const total = Math.max(1, carriles.length);
    for (const item of racimo) item.carriles = total;
    racimo = [];
    carriles = [];
    finMax = -Infinity;
  };

  for (const item of conHora) {
    const b = bloqueDe(item);
    if (racimo.length && b.inicio >= finMax) cerrar();

    let i = 0;
    while (i < carriles.length && carriles[i] > b.inicio) i++;
    carriles[i] = b.fin;
    item.carril = i;
    racimo.push(item);
    finMax = Math.max(finMax, b.fin);
  }
  if (racimo.length) cerrar();

  return items;
}
