// modelo.js — el dominio. Sin DOM, sin base de datos: lógica pura y testeable.
//
// Reglas heredadas de CloudKit (RESEARCH.md §6), aplicadas ya aunque el sync
// llegue en la Fase 2, para que migrar a SwiftData sea traducir y no rediseñar:
//   · identificadores UUID generados por el cliente
//   · todo campo opcional o con valor por defecto
//   · sin unicidad impuesta
//   · el orden vive en un campo `orden`, nunca en la posición de un array
//   · relaciones por id, nunca por referencia directa (evita ciclos al serializar)

export const Repeticion = Object.freeze({
  NINGUNA: 'ninguna',       // → es una tarea suelta
  DIARIA: 'diaria',
  DIAS: 'dias',             // días concretos de la semana
  POR_SEMANA: 'porSemana',  // X veces por semana, sin día fijo
});

export const Tipo = Object.freeze({
  CONSTRUIR: 'construir',
  DEJAR: 'dejar',
});

export const Estado = Object.freeze({
  PENDIENTE: 'pendiente',
  EN_CURSO: 'enCurso',
  COMPLETADA: 'completada',
  PARCIAL: 'parcial',
  SALTADA: 'saltada',
});

export const Periodo = Object.freeze({
  DIA: 'dia',
  SEMANA: 'semana',
  MES: 'mes',
});

// Profundidad máxima de la jerarquía: padre → hijo. Nada más.
// La especificación no necesita más ("dentro del hábito Trabajar, el hábito
// llamar a 10 personas") y anidar sin límite multiplica los casos raros
// sin aportar nada. Además es justo donde SwiftData + CloudKit peor se porta.
export const PROFUNDIDAD_MAX = 1;

// Colores de actividad. Son DATOS, no decoración de marca: sirven para
// distinguir una actividad de otra de un vistazo en el timeline. Apagados a
// propósito para que convivan sobre blanco sin gritar.
export const COLORES = Object.freeze([
  { id: 'pizarra', luz: 'oklch(0.55 0.045 250)', oscuro: 'oklch(0.70 0.050 250)' },
  { id: 'oceano', luz: 'oklch(0.53 0.095 230)', oscuro: 'oklch(0.70 0.090 230)' },
  { id: 'pino', luz: 'oklch(0.50 0.075 155)', oscuro: 'oklch(0.68 0.080 155)' },
  { id: 'oliva', luz: 'oklch(0.55 0.080 120)', oscuro: 'oklch(0.72 0.080 120)' },
  { id: 'ocre', luz: 'oklch(0.60 0.105 75)', oscuro: 'oklch(0.75 0.100 75)' },
  { id: 'teja', luz: 'oklch(0.55 0.120 40)', oscuro: 'oklch(0.70 0.115 40)' },
  { id: 'granate', luz: 'oklch(0.48 0.130 10)', oscuro: 'oklch(0.66 0.125 10)' },
  { id: 'ciruela', luz: 'oklch(0.47 0.115 330)', oscuro: 'oklch(0.68 0.110 330)' },
  { id: 'indigo', luz: 'oklch(0.48 0.110 285)', oscuro: 'oklch(0.68 0.105 285)' },
]);

export const COLOR_POR_DEFECTO = 'pizarra';

export function colorHex(idColor, oscuro = false) {
  const c = COLORES.find((x) => x.id === idColor) ?? COLORES[0];
  return oscuro ? c.oscuro : c.luz;
}

// ── Identificadores ──────────────────────────────────────────────────────────

export function uuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  // Reserva para entornos sin WebCrypto. No hace falta que sea criptográfico.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ── Fechas ───────────────────────────────────────────────────────────────────
// Un día se identifica por su clave local 'AAAA-MM-DD'. Nunca por un timestamp:
// un timestamp arrastra zona horaria y "hoy" deja de ser hoy al cruzar husos.

export function claveDia(fecha = new Date()) {
  const d = fecha instanceof Date ? fecha : new Date(fecha);
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

export function desdeClave(clave) {
  const [a, m, d] = clave.split('-').map(Number);
  return new Date(a, m - 1, d);
}

export function sumarDias(clave, n) {
  const d = desdeClave(clave);
  d.setDate(d.getDate() + n);
  return claveDia(d);
}

/** Lunes = 0 … Domingo = 6. En España la semana empieza en lunes. */
export function diaSemana(clave) {
  return (desdeClave(clave).getDay() + 6) % 7;
}

export function lunesDeLaSemana(clave) {
  return sumarDias(clave, -diaSemana(clave));
}

export function diasEntre(desde, hasta) {
  const ms = desdeClave(hasta) - desdeClave(desde);
  return Math.round(ms / 86400000);
}

// ── Horas del día en minutos desde medianoche ────────────────────────────────
// Un bloque horario es { inicio: 480, fin: 500 } = de 8:00 a 8:20.
// Enteros, no cadenas ni fechas: comparar y ordenar es trivial y no hay husos.

export function aMinutos(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + (m || 0);
}

export function aHora(minutos) {
  const m = Math.max(0, Math.min(1439, Math.round(minutos)));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export function minutosAhora(fecha = new Date()) {
  return fecha.getHours() * 60 + fecha.getMinutes();
}

// ── Actividad ────────────────────────────────────────────────────────────────
// La DEFINICIÓN. Qué es esta cosa. No guarda estado de ningún día concreto.

export function crearActividad(datos = {}) {
  const repeticion = normalizarRepeticion(datos.repeticion);
  const padreId = datos.padreId ?? null;

  return {
    id: datos.id ?? uuid(),
    nombre: (datos.nombre ?? '').trim(),
    icono: datos.icono ?? '',
    color: datos.color ?? COLOR_POR_DEFECTO,
    grupo: datos.grupo ?? null,

    // Sólo tiene sentido en hábitos. Nulo en tareas sueltas.
    tipo: datos.tipo ?? null,

    repeticion,

    // { valor: 2, unidad: 'veces', periodo: 'dia' } — o null si es un simple check
    objetivo: normalizarObjetivo(datos.objetivo),

    // { inicio, fin } en minutos desde medianoche, o null si no ocupa hueco.
    // Es la plantilla: lo que ese día pase de verdad vive en el Registro.
    bloque: normalizarBloque(datos.bloque),

    padreId,
    profundidad: padreId ? 1 : 0,
    orden: Number.isFinite(datos.orden) ? datos.orden : 0,

    fechaInicio: datos.fechaInicio ?? claveDia(),
    fechaFin: datos.fechaFin ?? null,

    // Hueco reservado para la Fase 3. Se declara ya para no tener que migrar
    // el almacén cuando llegue.
    enfoque: datos.enfoque ?? null,

    archivada: datos.archivada ?? false,
    creadaEn: datos.creadaEn ?? new Date().toISOString(),
  };
}

export function normalizarRepeticion(r) {
  if (!r || !r.tipo || r.tipo === Repeticion.NINGUNA) {
    return { tipo: Repeticion.NINGUNA, dias: [], veces: 0 };
  }
  if (r.tipo === Repeticion.DIAS) {
    // Días únicos, ordenados, dentro de rango. Sin días válidos no es
    // "días concretos": es una tarea suelta, y así se guarda.
    const dias = [...new Set((r.dias ?? []).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort((a, b) => a - b);
    if (dias.length === 0) return { tipo: Repeticion.NINGUNA, dias: [], veces: 0 };
    if (dias.length === 7) return { tipo: Repeticion.DIARIA, dias: [], veces: 0 };
    return { tipo: Repeticion.DIAS, dias, veces: 0 };
  }
  if (r.tipo === Repeticion.POR_SEMANA) {
    const veces = Math.max(1, Math.min(7, Math.round(r.veces ?? 1)));
    if (veces === 7) return { tipo: Repeticion.DIARIA, dias: [], veces: 0 };
    return { tipo: Repeticion.POR_SEMANA, dias: [], veces };
  }
  return { tipo: Repeticion.DIARIA, dias: [], veces: 0 };
}

export function normalizarObjetivo(o) {
  if (!o) return null;
  const valor = Math.max(1, Math.round(o.valor ?? 1));
  if (valor === 1 && !o.unidad) return null; // un objetivo de 1 vez es un check normal
  return {
    valor,
    unidad: o.unidad ?? 'veces',
    periodo: o.periodo ?? Periodo.DIA,
  };
}

export function normalizarBloque(b) {
  if (!b) return null;
  let inicio = typeof b.inicio === 'string' ? aMinutos(b.inicio) : b.inicio;
  let fin = typeof b.fin === 'string' ? aMinutos(b.fin) : b.fin;
  if (!Number.isFinite(inicio)) return null;
  inicio = Math.max(0, Math.min(1439, Math.round(inicio)));
  if (!Number.isFinite(fin) || fin <= inicio) fin = Math.min(1440, inicio + DURACION_POR_DEFECTO);
  return { inicio, fin: Math.max(0, Math.min(1440, Math.round(fin))) };
}

export const DURACION_POR_DEFECTO = 30;

/** Un hábito es cualquier actividad que se repite. Lo demás es tarea suelta. */
export function esHabito(actividad) {
  return actividad?.repeticion?.tipo !== Repeticion.NINGUNA;
}

export function duracionMin(actividad) {
  return actividad?.bloque ? actividad.bloque.fin - actividad.bloque.inicio : 0;
}

/**
 * Comprueba que colgar `hijoId` de `padreId` es legal.
 * Devuelve null si vale, o el motivo del rechazo.
 */
export function validarJerarquia(actividades, hijoId, padreId) {
  if (!padreId) return null;
  if (hijoId === padreId) return 'Una actividad no puede ser hija de sí misma.';
  const padre = actividades.find((a) => a.id === padreId);
  if (!padre) return 'La actividad padre no existe.';
  if (padre.padreId) return 'Sólo se permite un nivel de anidación.';
  const tieneHijos = actividades.some((a) => a.padreId === hijoId);
  if (tieneHijos) return 'Esta actividad ya tiene hijas: no puede ser hija de otra.';
  return null;
}

export function hijasDe(actividades, padreId) {
  return actividades
    .filter((a) => a.padreId === padreId && !a.archivada)
    .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es'));
}

// ── Registro ─────────────────────────────────────────────────────────────────
// La OCURRENCIA: qué pasó con una actividad EN UN DÍA concreto.
// Es lo que hace posibles las rachas, el estado parcial y el historial.

export function crearRegistro(datos = {}) {
  return {
    id: datos.id ?? `${datos.actividadId}|${datos.fecha}`, // determinista: un registro por actividad y día
    actividadId: datos.actividadId ?? null,
    fecha: datos.fecha ?? claveDia(),
    estado: datos.estado ?? Estado.PENDIENTE,
    valorLogrado: Number.isFinite(datos.valorLogrado) ? datos.valorLogrado : 0,
    // Si ese día se movió el bloque, se guarda aquí y no se toca el hábito.
    inicioReal: datos.inicioReal ?? null,
    finReal: datos.finReal ?? null,
    nota: datos.nota ?? null,
    sesiones: datos.sesiones ?? [], // Fase 3
    actualizadoEn: datos.actualizadoEn ?? new Date().toISOString(),
  };
}

export function claveRegistro(actividadId, fecha) {
  return `${actividadId}|${fecha}`;
}

/** El bloque que realmente ocupa ese día: el del registro si se movió, si no el de la plantilla. */
export function bloqueEfectivo(actividad, registro) {
  if (registro?.inicioReal != null) {
    const inicio = registro.inicioReal;
    const fin = registro.finReal ?? inicio + (duracionMin(actividad) || DURACION_POR_DEFECTO);
    return { inicio, fin };
  }
  return actividad.bloque;
}

/**
 * Aplica un toque sobre una actividad y devuelve el registro resultante.
 * Un solo gesto recorre el ciclo, que es el principio "rapidez ante todo":
 *   · sin objetivo:  pendiente → completada → saltada → pendiente
 *   · con objetivo:  pendiente → 1 de 2 (parcial) → 2 de 2 (completada) → pendiente
 */
export function siguienteEstado(actividad, registro) {
  const base = registro ?? crearRegistro({ actividadId: actividad.id });
  const objetivo = actividad.objetivo;

  if (!objetivo) {
    const ciclo = {
      [Estado.PENDIENTE]: Estado.COMPLETADA,
      [Estado.EN_CURSO]: Estado.COMPLETADA,
      [Estado.COMPLETADA]: Estado.SALTADA,
      [Estado.PARCIAL]: Estado.COMPLETADA,
      [Estado.SALTADA]: Estado.PENDIENTE,
    };
    const estado = ciclo[base.estado] ?? Estado.COMPLETADA;
    return {
      ...base,
      estado,
      valorLogrado: estado === Estado.COMPLETADA ? 1 : 0,
      actualizadoEn: new Date().toISOString(),
    };
  }

  const siguiente = base.estado === Estado.COMPLETADA ? 0 : Math.min(objetivo.valor, base.valorLogrado + 1);
  return {
    ...base,
    valorLogrado: siguiente,
    estado: estadoSegunValor(siguiente, objetivo.valor),
    actualizadoEn: new Date().toISOString(),
  };
}

export function estadoSegunValor(valor, objetivo) {
  if (valor <= 0) return Estado.PENDIENTE;
  if (valor >= objetivo) return Estado.COMPLETADA;
  return Estado.PARCIAL;
}
