// progreso.js — el círculo del día, el resumen y las rachas.
//
// Reglas de puntuación, decididas y escritas aquí para que sean una sola:
//   · completada  → 1 punto
//   · parcial     → la fracción real (1 de 2 = 0,5). Sin objetivo, medio punto.
//   · pendiente   → 0 puntos, pero cuenta en el total
//   · saltada     → NO cuenta ni arriba ni abajo. Saltar a propósito no
//                   penaliza: si no, la app castiga por ser honesta.
//   · un padre con hijas que tocan hoy NO puntúa por sí mismo: su progreso
//     es el de sus hijas. Así nada se cuenta dos veces.

import { Estado, Repeticion, claveDia, sumarDias, claveRegistro, diasEntre } from './modelo.js';
import { tocaEl, agendaDelDia } from './repeticion.js';

/** Cuánto vale un item: `hecho` sobre `peso`. Peso 0 = no entra en la cuenta. */
export function pesoDeItem(item) {
  if (item.hijas?.length) {
    return item.hijas.reduce(
      (acc, h) => {
        const p = pesoDeItem(h);
        return { peso: acc.peso + p.peso, hecho: acc.hecho + p.hecho };
      },
      { peso: 0, hecho: 0 },
    );
  }

  const { registro, actividad } = item;
  if (registro.estado === Estado.SALTADA) return { peso: 0, hecho: 0 };
  if (registro.estado === Estado.COMPLETADA) return { peso: 1, hecho: 1 };
  if (registro.estado === Estado.PARCIAL) {
    const fraccion = actividad.objetivo ? registro.valorLogrado / actividad.objetivo.valor : 0.5;
    return { peso: 1, hecho: Math.max(0, Math.min(1, fraccion)) };
  }
  return { peso: 1, hecho: 0 };
}

function contar(items) {
  const c = {
    total: 0,
    completadas: 0,
    parciales: 0,
    saltadas: 0,
    pendientes: 0,
    peso: 0,
    hecho: 0,
  };
  const recorrer = (lista) => {
    for (const item of lista) {
      if (item.hijas?.length) {
        recorrer(item.hijas);
        continue; // el padre no se cuenta aparte: ya lo cuentan sus hijas
      }
      c.total++;
      const e = item.registro.estado;
      if (e === Estado.COMPLETADA) c.completadas++;
      else if (e === Estado.PARCIAL) c.parciales++;
      else if (e === Estado.SALTADA) c.saltadas++;
      else c.pendientes++;
      const p = pesoDeItem(item);
      c.peso += p.peso;
      c.hecho += p.hecho;
    }
  };
  recorrer(items);
  c.fraccion = c.peso > 0 ? c.hecho / c.peso : 0;
  c.porcentaje = Math.round(c.fraccion * 100);
  return c;
}

/**
 * El resumen del día. Separa lo recurrente de lo puntual porque la
 * especificación lo exige: una tarea suelta que no se hizo no debe ensuciar
 * la racha de los hábitos diarios.
 */
export function resumenDelDia(actividades, registros, clave = claveDia()) {
  const agenda = agendaDelDia(actividades, registros, clave);

  const esPuntual = (item) => item.actividad.repeticion.tipo === Repeticion.NINGUNA;
  const recurrentes = agenda.filter((i) => !esPuntual(i));
  const puntuales = agenda.filter(esPuntual);

  return {
    fecha: clave,
    agenda,
    recurrentes: { items: recurrentes, ...contar(recurrentes) },
    puntuales: { items: puntuales, ...contar(puntuales) },
    todo: contar(agenda),
  };
}

/**
 * El número del círculo. Se calcula SÓLO con lo recurrente si hay algo
 * recurrente: el anillo mide la constancia, no la lista de recados. Si el día
 * sólo tiene tareas sueltas, entonces sí las mide, para no enseñar un 0 falso.
 */
export function progresoDelDia(actividades, registros, clave = claveDia()) {
  const r = resumenDelDia(actividades, registros, clave);
  const base = r.recurrentes.total > 0 ? r.recurrentes : r.puntuales;
  return {
    fraccion: base.fraccion,
    porcentaje: base.porcentaje,
    completadas: base.completadas,
    total: base.total,
    vacio: r.todo.total === 0,
  };
}

// ── Rachas ───────────────────────────────────────────────────────────────────
// Sólo cuentan los días en que la actividad TOCABA. Un hábito de lunes y
// miércoles no rompe racha por no hacerse un martes.
//   · completada → alarga la racha
//   · saltada    → ni la alarga ni la rompe (día perdonado)
//   · parcial / pendiente en un día pasado → la rompe
//   · hoy todavía pendiente → no rompe nada, el día no ha terminado

export function rachas(actividad, registros, hasta = claveDia(), limiteDias = 730) {
  let actual = 0;
  let mejor = 0;
  let corriendo = 0;
  let vivaLaActual = true;

  for (let i = 0; i < limiteDias; i++) {
    const clave = sumarDias(hasta, -i);
    if (actividad.fechaInicio && clave < actividad.fechaInicio) break;
    if (!tocaEl(actividad, clave, registros)) continue;

    const estado = registros.get(claveRegistro(actividad.id, clave))?.estado ?? Estado.PENDIENTE;

    if (estado === Estado.COMPLETADA) {
      corriendo++;
      if (vivaLaActual) actual = corriendo;
    } else if (estado === Estado.SALTADA) {
      // día perdonado: no suma ni corta
    } else if (i === 0) {
      // hoy sin terminar: la racha sigue viva, simplemente no suma
    } else {
      mejor = Math.max(mejor, corriendo);
      corriendo = 0;
      vivaLaActual = false;
    }
  }
  return { actual, mejor: Math.max(mejor, corriendo, actual) };
}

/** Días perfectos: los que tenían algo recurrente y salió todo completado. */
export function diasPerfectos(actividades, registros, desde, hasta = claveDia()) {
  let n = 0;
  const total = Math.max(0, diasEntre(desde, hasta));
  for (let i = 0; i <= total; i++) {
    const clave = sumarDias(desde, i);
    const r = resumenDelDia(actividades, registros, clave);
    if (r.recurrentes.total > 0 && r.recurrentes.completadas === r.recurrentes.total) n++;
  }
  return n;
}

/** Tasa de una actividad en un intervalo: completadas / días que tocaba. */
export function tasa(actividad, registros, desde, hasta = claveDia()) {
  let tocaba = 0;
  let hechas = 0;
  const total = Math.max(0, diasEntre(desde, hasta));
  for (let i = 0; i <= total; i++) {
    const clave = sumarDias(desde, i);
    if (!tocaEl(actividad, clave, registros)) continue;
    const estado = registros.get(claveRegistro(actividad.id, clave))?.estado;
    if (estado === Estado.SALTADA) continue;
    tocaba++;
    if (estado === Estado.COMPLETADA) hechas++;
  }
  return { tocaba, hechas, porcentaje: tocaba > 0 ? Math.round((hechas / tocaba) * 100) : 0 };
}

/** Promedio diario de una actividad con objetivo (ej. vasos de agua al día). */
export function promedioDiario(actividad, registros, desde, hasta = claveDia()) {
  let dias = 0;
  let suma = 0;
  const total = Math.max(0, diasEntre(desde, hasta));
  for (let i = 0; i <= total; i++) {
    const clave = sumarDias(desde, i);
    if (!tocaEl(actividad, clave, registros)) continue;
    dias++;
    suma += registros.get(claveRegistro(actividad.id, clave))?.valorLogrado ?? 0;
  }
  return dias > 0 ? suma / dias : 0;
}
