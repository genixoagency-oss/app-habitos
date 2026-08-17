// estado.js — el almacén en memoria y su puente con IndexedDB.
//
// Todo se carga al arrancar y todo se muta aquí. Las vistas se suscriben y se
// vuelven a pintar. Las escrituras a disco van detrás, sin bloquear el toque:
// marcar un hábito tiene que responder en el mismo fotograma.

import {
  crearActividad, crearRegistro, claveRegistro, claveDia,
  siguienteEstado, Estado, Repeticion,
} from './modelo.js';
import * as db from './db.js';

const almacen = {
  actividades: [],
  registros: new Map(),
  dia: claveDia(),
  vista: 'hoy',
  listo: false,
};

const oyentes = new Set();

export function suscribir(fn) {
  oyentes.add(fn);
  return () => oyentes.delete(fn);
}

function avisar() {
  for (const fn of oyentes) fn(almacen);
}

export function estado() {
  return almacen;
}

// ── Arranque ─────────────────────────────────────────────────────────────────

export async function cargar() {
  try {
    const [actividades, registros] = await Promise.all([
      db.leerTodo(db.ALMACENES.ACTIVIDADES),
      db.leerTodo(db.ALMACENES.REGISTROS),
    ]);
    almacen.actividades = actividades;
    almacen.registros = new Map(registros.map((r) => [r.id, r]));
  } catch (error) {
    // Navegación privada, cuota llena o IndexedDB bloqueado. La app sigue
    // funcionando en memoria; lo que no puede es callárselo.
    console.warn('No se pudo abrir el almacén local:', error);
    almacen.errorAlmacen = 'No se ha podido guardar en este navegador. Lo que hagas se perderá al cerrar.';
  }
  almacen.listo = true;
  avisar();
}

// ── Día visible ──────────────────────────────────────────────────────────────

export function irADia(clave) {
  almacen.dia = clave;
  avisar();
}

export function irAVista(vista) {
  almacen.vista = vista;
  avisar();
}

// ── Actividades ──────────────────────────────────────────────────────────────

export function actividad(id) {
  return almacen.actividades.find((a) => a.id === id) ?? null;
}

export function guardarActividad(datos) {
  const existente = datos.id ? actividad(datos.id) : null;
  const nueva = crearActividad({ ...(existente ?? {}), ...datos });

  if (existente) {
    almacen.actividades = almacen.actividades.map((a) => (a.id === nueva.id ? nueva : a));
  } else {
    nueva.orden = almacen.actividades.length;
    almacen.actividades = [...almacen.actividades, nueva];
  }

  avisar();
  db.guardar(db.ALMACENES.ACTIVIDADES, nueva).catch(reportar);
  return nueva;
}

/**
 * Borrar de verdad sólo tiene sentido si la actividad nunca se usó. Si tiene
 * historial se archiva: borrarla se llevaría por delante rachas y estadísticas
 * de días pasados, y eso el usuario no lo espera.
 */
export function eliminarActividad(id) {
  const hijas = almacen.actividades.filter((a) => a.padreId === id);
  const tieneHistorial = [...almacen.registros.values()].some(
    (r) => r.actividadId === id && r.estado !== Estado.PENDIENTE,
  );

  if (tieneHistorial) {
    guardarActividad({ id, archivada: true });
    for (const h of hijas) guardarActividad({ id: h.id, archivada: true });
    return { archivada: true, hijas: hijas.length };
  }

  const fuera = new Set([id, ...hijas.map((h) => h.id)]);
  almacen.actividades = almacen.actividades.filter((a) => !fuera.has(a.id));
  for (const [clave, r] of almacen.registros) {
    if (fuera.has(r.actividadId)) almacen.registros.delete(clave);
  }
  avisar();
  for (const x of fuera) db.borrar(db.ALMACENES.ACTIVIDADES, x).catch(reportar);
  return { archivada: false, hijas: hijas.length };
}

export function reordenar(ids) {
  ids.forEach((id, i) => {
    const a = actividad(id);
    if (a && a.orden !== i) guardarActividad({ id, orden: i });
  });
}

// ── Registros ────────────────────────────────────────────────────────────────

export function registro(actividadId, fecha = almacen.dia) {
  return almacen.registros.get(claveRegistro(actividadId, fecha)) ?? null;
}

function escribirRegistro(reg) {
  almacen.registros.set(reg.id, reg);
  avisar();
  db.guardar(db.ALMACENES.REGISTROS, reg).catch(reportar);
  return reg;
}

/** Un toque: avanza el ciclo de estado de esa actividad ese día. */
export function tocar(actividadId, fecha = almacen.dia) {
  const a = actividad(actividadId);
  if (!a) return null;
  const previo = registro(actividadId, fecha) ?? crearRegistro({ actividadId, fecha });
  return escribirRegistro({ ...siguienteEstado(a, previo), fecha, id: claveRegistro(actividadId, fecha) });
}

export function fijarEstado(actividadId, estadoNuevo, fecha = almacen.dia) {
  const a = actividad(actividadId);
  if (!a) return null;
  const previo = registro(actividadId, fecha) ?? crearRegistro({ actividadId, fecha });
  const valorLogrado =
    estadoNuevo === Estado.COMPLETADA ? (a.objetivo?.valor ?? 1)
    : estadoNuevo === Estado.PENDIENTE ? 0
    : previo.valorLogrado;
  return escribirRegistro({
    ...previo,
    id: claveRegistro(actividadId, fecha),
    fecha,
    estado: estadoNuevo,
    valorLogrado,
    actualizadoEn: new Date().toISOString(),
  });
}

/** Mover o estirar el bloque SÓLO de ese día. La plantilla del hábito no se toca. */
export function moverBloque(actividadId, inicio, fin, fecha = almacen.dia) {
  const previo = registro(actividadId, fecha) ?? crearRegistro({ actividadId, fecha });
  return escribirRegistro({
    ...previo,
    id: claveRegistro(actividadId, fecha),
    fecha,
    inicioReal: Math.max(0, Math.min(1435, Math.round(inicio))),
    finReal: Math.max(5, Math.min(1440, Math.round(fin))),
    actualizadoEn: new Date().toISOString(),
  });
}

/** Devolver un bloque movido a la hora que dice su hábito. */
export function restaurarBloque(actividadId, fecha = almacen.dia) {
  const previo = registro(actividadId, fecha);
  if (!previo) return null;
  return escribirRegistro({ ...previo, inicioReal: null, finReal: null, actualizadoEn: new Date().toISOString() });
}

function reportar(error) {
  console.warn('No se pudo guardar:', error);
}

// ── Datos de ejemplo ─────────────────────────────────────────────────────────
// Para poder ver la app llena desde el primer minuto sin teclear nada. Se
// borra entero desde Ajustes.

export function ejemplo() {
  const hoy = claveDia();
  const ayer = claveDia(new Date(Date.now() - 86400000));
  const anteayer = claveDia(new Date(Date.now() - 2 * 86400000));

  const nuevas = [
    crearActividad({ nombre: 'Desayunar', icono: '🥐', color: 'ocre', grupo: 'Mañana', repeticion: { tipo: Repeticion.DIARIA }, bloque: { inicio: '08:00', fin: '08:25' }, fechaInicio: anteayer }),
    crearActividad({ nombre: 'Skincare', icono: '🧴', color: 'ciruela', grupo: 'Cuidado', repeticion: { tipo: Repeticion.DIARIA }, objetivo: { valor: 2, unidad: 'veces' }, bloque: { inicio: '08:30', fin: '08:45' }, fechaInicio: anteayer }),
    crearActividad({ nombre: 'Trabajar', icono: '💻', color: 'oceano', repeticion: { tipo: Repeticion.DIAS, dias: [0, 1, 2, 3, 4] }, bloque: { inicio: '09:30', fin: '14:00' }, fechaInicio: anteayer }),
    crearActividad({ nombre: 'Comer', icono: '🍽️', color: 'oliva', repeticion: { tipo: Repeticion.DIARIA }, bloque: { inicio: '14:15', fin: '15:00' }, fechaInicio: anteayer }),
    crearActividad({ nombre: 'Gimnasio', icono: '🏋️', color: 'teja', grupo: 'Cuerpo', tipo: 'construir', repeticion: { tipo: Repeticion.DIAS, dias: [0, 2, 4] }, bloque: { inicio: '18:30', fin: '19:45' }, fechaInicio: anteayer }),
    crearActividad({ nombre: 'Leer', icono: '📖', color: 'pino', repeticion: { tipo: Repeticion.POR_SEMANA, veces: 4 }, objetivo: { valor: 20, unidad: 'páginas' }, bloque: { inicio: '22:30', fin: '23:00' }, fechaInicio: anteayer }),
    crearActividad({ nombre: 'Poner la lavadora', icono: '🧺', color: 'pizarra', fechaInicio: hoy }),
  ];

  const trabajar = nuevas.find((a) => a.nombre === 'Trabajar');
  nuevas.push(
    crearActividad({ nombre: 'Llamar a 10 personas', icono: '📞', color: 'oceano', padreId: trabajar.id, repeticion: { tipo: Repeticion.DIAS, dias: [0, 1, 2, 3, 4] }, objetivo: { valor: 10, unidad: 'llamadas' }, orden: 0, fechaInicio: anteayer }),
    crearActividad({ nombre: 'Responder correos', icono: '✉️', color: 'oceano', padreId: trabajar.id, repeticion: { tipo: Repeticion.DIAS, dias: [0, 1, 2, 3, 4] }, orden: 1, fechaInicio: anteayer }),
  );

  almacen.actividades = [...almacen.actividades, ...nuevas];

  // Un poco de historial, para que la racha y el resumen tengan algo que decir.
  const desayuno = nuevas.find((a) => a.nombre === 'Desayunar');
  const skincare = nuevas.find((a) => a.nombre === 'Skincare');
  const historial = [
    crearRegistro({ actividadId: desayuno.id, fecha: anteayer, estado: Estado.COMPLETADA, valorLogrado: 1 }),
    crearRegistro({ actividadId: desayuno.id, fecha: ayer, estado: Estado.COMPLETADA, valorLogrado: 1 }),
    crearRegistro({ actividadId: desayuno.id, fecha: hoy, estado: Estado.COMPLETADA, valorLogrado: 1 }),
    crearRegistro({ actividadId: skincare.id, fecha: ayer, estado: Estado.COMPLETADA, valorLogrado: 2 }),
    crearRegistro({ actividadId: skincare.id, fecha: hoy, estado: Estado.PARCIAL, valorLogrado: 1 }),
  ];
  for (const r of historial) almacen.registros.set(r.id, r);

  avisar();
  db.guardarVarios(db.ALMACENES.ACTIVIDADES, nuevas).catch(reportar);
  db.guardarVarios(db.ALMACENES.REGISTROS, historial).catch(reportar);
}

export async function borrarTodo() {
  almacen.actividades = [];
  almacen.registros = new Map();
  avisar();
  await db.vaciarTodo().catch(reportar);
}
