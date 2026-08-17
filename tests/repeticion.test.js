import test from 'node:test';
import assert from 'node:assert/strict';
import { Repeticion, Estado, crearActividad, crearRegistro, claveRegistro } from '../js/modelo.js';
import { tocaEl, estaVigente, hechasEstaSemana, agendaDelDia, huecos, repartirEnCarriles } from '../js/repeticion.js';

const LUNES = '2026-08-17';
const MARTES = '2026-08-18';
const MIERCOLES = '2026-08-19';
const DOMINGO = '2026-08-23';

/** Mapa de registros a partir de una lista de [actividadId, fecha, estado]. */
function regs(...filas) {
  const m = new Map();
  for (const [actividadId, fecha, estado, valorLogrado] of filas) {
    const r = crearRegistro({ actividadId, fecha, estado, valorLogrado });
    m.set(claveRegistro(actividadId, fecha), r);
  }
  return m;
}

test('vigencia: respeta fecha de inicio, de fin y el archivado', () => {
  const a = crearActividad({ nombre: 'X', fechaInicio: '2026-08-10', fechaFin: '2026-08-20' });
  assert.equal(estaVigente(a, '2026-08-09'), false);
  assert.equal(estaVigente(a, '2026-08-10'), true);
  assert.equal(estaVigente(a, '2026-08-20'), true);
  assert.equal(estaVigente(a, '2026-08-21'), false);
  assert.equal(estaVigente({ ...a, archivada: true }, '2026-08-15'), false);
});

test('diaria: toca todos los días desde su inicio', () => {
  const a = crearActividad({ nombre: 'Desayunar', repeticion: { tipo: Repeticion.DIARIA }, fechaInicio: LUNES });
  assert.equal(tocaEl(a, LUNES), true);
  assert.equal(tocaEl(a, DOMINGO), true);
  assert.equal(tocaEl(a, '2026-08-16'), false, 'antes de empezar, no');
});

test('días concretos: sólo esos días', () => {
  const a = crearActividad({
    nombre: 'Gimnasio',
    repeticion: { tipo: Repeticion.DIAS, dias: [0, 2, 4] }, // lunes, miércoles, viernes
    fechaInicio: LUNES,
  });
  assert.equal(tocaEl(a, LUNES), true);
  assert.equal(tocaEl(a, MARTES), false);
  assert.equal(tocaEl(a, MIERCOLES), true);
  assert.equal(tocaEl(a, DOMINGO), false);
});

test('tarea suelta: ocurre exactamente el día en que se puso', () => {
  const a = crearActividad({ nombre: 'Poner la lavadora', fechaInicio: MARTES });
  assert.equal(tocaEl(a, LUNES), false);
  assert.equal(tocaEl(a, MARTES), true);
  assert.equal(tocaEl(a, MIERCOLES), false);
});

test('X veces por semana: aparece hasta cumplir el cupo y luego desaparece', () => {
  const a = crearActividad({
    nombre: 'Correr',
    repeticion: { tipo: Repeticion.POR_SEMANA, veces: 2 },
    fechaInicio: LUNES,
  });
  assert.equal(tocaEl(a, MIERCOLES, new Map()), true, 'sin nada hecho, aparece');

  const unaHecha = regs([a.id, LUNES, Estado.COMPLETADA]);
  assert.equal(tocaEl(a, MIERCOLES, unaHecha), true, 'con 1 de 2, sigue apareciendo');

  const dosHechas = regs([a.id, LUNES, Estado.COMPLETADA], [a.id, MARTES, Estado.COMPLETADA]);
  assert.equal(hechasEstaSemana(a, MIERCOLES, dosHechas), 2);
  assert.equal(tocaEl(a, MIERCOLES, dosHechas), false, 'cumplido el cupo, se retira');
  assert.equal(tocaEl(a, LUNES, dosHechas), true, 'el día en que se hizo sigue visible para poder deshacerlo');
});

test('X veces por semana: el cupo se reinicia el lunes siguiente', () => {
  const a = crearActividad({
    nombre: 'Correr',
    repeticion: { tipo: Repeticion.POR_SEMANA, veces: 2 },
    fechaInicio: LUNES,
  });
  const hechas = regs([a.id, LUNES, Estado.COMPLETADA], [a.id, MARTES, Estado.COMPLETADA]);
  assert.equal(tocaEl(a, '2026-08-24', hechas), true, 'lunes siguiente: cupo nuevo');
});

test('agenda: ordena por hora y deja lo sin hora al final', () => {
  const gym = crearActividad({ nombre: 'Gimnasio', repeticion: { tipo: Repeticion.DIARIA }, bloque: { inicio: '18:00', fin: '19:00' }, fechaInicio: LUNES });
  const desayuno = crearActividad({ nombre: 'Desayunar', repeticion: { tipo: Repeticion.DIARIA }, bloque: { inicio: '08:00', fin: '08:20' }, fechaInicio: LUNES });
  const suelta = crearActividad({ nombre: 'Sin hora', repeticion: { tipo: Repeticion.DIARIA }, fechaInicio: LUNES });

  const agenda = agendaDelDia([gym, suelta, desayuno], new Map(), LUNES);
  assert.deepEqual(agenda.map((i) => i.actividad.nombre), ['Desayunar', 'Gimnasio', 'Sin hora']);
});

test('agenda: las hijas cuelgan de su padre y no aparecen sueltas', () => {
  const trabajar = crearActividad({ nombre: 'Trabajar', repeticion: { tipo: Repeticion.DIARIA }, bloque: { inicio: '09:00', fin: '17:00' }, fechaInicio: LUNES });
  const llamadas = crearActividad({ nombre: 'Llamar a 10 personas', repeticion: { tipo: Repeticion.DIARIA }, padreId: trabajar.id, objetivo: { valor: 10 }, fechaInicio: LUNES });

  const agenda = agendaDelDia([trabajar, llamadas], new Map(), LUNES);
  assert.equal(agenda.length, 1);
  assert.equal(agenda[0].actividad.nombre, 'Trabajar');
  assert.deepEqual(agenda[0].hijas.map((h) => h.actividad.nombre), ['Llamar a 10 personas']);
});

test('agenda: una hija cuyo padre hoy no toca sube a primer nivel y no se pierde', () => {
  const trabajar = crearActividad({
    nombre: 'Trabajar',
    repeticion: { tipo: Repeticion.DIAS, dias: [0] }, // sólo lunes
    fechaInicio: LUNES,
  });
  const llamadas = crearActividad({ nombre: 'Llamadas', repeticion: { tipo: Repeticion.DIARIA }, padreId: trabajar.id, fechaInicio: LUNES });

  const martes = agendaDelDia([trabajar, llamadas], new Map(), MARTES);
  assert.deepEqual(martes.map((i) => i.actividad.nombre), ['Llamadas']);
});

test('agenda: cada item trae su registro real si existe', () => {
  const a = crearActividad({ nombre: 'X', repeticion: { tipo: Repeticion.DIARIA }, fechaInicio: LUNES });
  const m = regs([a.id, LUNES, Estado.COMPLETADA]);
  const agenda = agendaDelDia([a], m, LUNES);
  assert.equal(agenda[0].registro.estado, Estado.COMPLETADA);

  const agendaMartes = agendaDelDia([a], m, MARTES);
  assert.equal(agendaMartes[0].registro.estado, Estado.PENDIENTE, 'otro día empieza limpio');
});

test('agenda: un bloque movido sólo hoy reordena hoy', () => {
  const gym = crearActividad({ nombre: 'Gimnasio', repeticion: { tipo: Repeticion.DIARIA }, bloque: { inicio: '18:00', fin: '19:00' }, fechaInicio: LUNES });
  const cena = crearActividad({ nombre: 'Cenar', repeticion: { tipo: Repeticion.DIARIA }, bloque: { inicio: '21:00', fin: '21:40' }, fechaInicio: LUNES });
  const m = regs([gym.id, LUNES, Estado.PENDIENTE]);
  m.get(claveRegistro(gym.id, LUNES)).inicioReal = 22 * 60;
  m.get(claveRegistro(gym.id, LUNES)).finReal = 23 * 60;

  assert.deepEqual(agendaDelDia([gym, cena], m, LUNES).map((i) => i.actividad.nombre), ['Cenar', 'Gimnasio']);
  assert.deepEqual(agendaDelDia([gym, cena], m, MARTES).map((i) => i.actividad.nombre), ['Gimnasio', 'Cenar']);
});

test('huecos: encuentra el tiempo libre entre bloques', () => {
  const a = crearActividad({ nombre: 'A', repeticion: { tipo: Repeticion.DIARIA }, bloque: { inicio: '08:00', fin: '09:00' }, fechaInicio: LUNES });
  const b = crearActividad({ nombre: 'B', repeticion: { tipo: Repeticion.DIARIA }, bloque: { inicio: '12:00', fin: '13:00' }, fechaInicio: LUNES });
  const libres = huecos(agendaDelDia([a, b], new Map(), LUNES), 8 * 60, 14 * 60);
  assert.deepEqual(libres, [{ inicio: 540, fin: 720 }, { inicio: 780, fin: 840 }]);
});

test('huecos: ignora los ratos de menos de 15 minutos', () => {
  const a = crearActividad({ nombre: 'A', repeticion: { tipo: Repeticion.DIARIA }, bloque: { inicio: '08:00', fin: '09:00' }, fechaInicio: LUNES });
  const b = crearActividad({ nombre: 'B', repeticion: { tipo: Repeticion.DIARIA }, bloque: { inicio: '09:05', fin: '10:00' }, fechaInicio: LUNES });
  assert.deepEqual(huecos(agendaDelDia([a, b], new Map(), LUNES), 8 * 60, 10 * 60), []);
});

test('carriles: los bloques que se solapan se reparten en columnas', () => {
  const a = crearActividad({ nombre: 'A', repeticion: { tipo: Repeticion.DIARIA }, bloque: { inicio: '09:00', fin: '11:00' }, fechaInicio: LUNES });
  const b = crearActividad({ nombre: 'B', repeticion: { tipo: Repeticion.DIARIA }, bloque: { inicio: '10:00', fin: '12:00' }, fechaInicio: LUNES });
  const c = crearActividad({ nombre: 'C', repeticion: { tipo: Repeticion.DIARIA }, bloque: { inicio: '13:00', fin: '14:00' }, fechaInicio: LUNES });
  const items = repartirEnCarriles(agendaDelDia([a, b, c], new Map(), LUNES));
  assert.equal(items[0].carril, 0);
  assert.equal(items[1].carril, 1, 'B se solapa con A: va al carril de al lado');
  assert.equal(items[2].carril, 0, 'C ya no se solapa: vuelve al primero');
});

test('carriles: un choque a media mañana no estrecha el resto del día', () => {
  const a = crearActividad({ nombre: 'A', repeticion: { tipo: Repeticion.DIARIA }, bloque: { inicio: '09:00', fin: '11:00' }, fechaInicio: LUNES });
  const b = crearActividad({ nombre: 'B', repeticion: { tipo: Repeticion.DIARIA }, bloque: { inicio: '10:00', fin: '12:00' }, fechaInicio: LUNES });
  const cena = crearActividad({ nombre: 'Cena', repeticion: { tipo: Repeticion.DIARIA }, bloque: { inicio: '21:00', fin: '22:00' }, fechaInicio: LUNES });

  const items = repartirEnCarriles(agendaDelDia([a, b, cena], new Map(), LUNES));
  assert.equal(items[0].carriles, 2, 'A comparte fila con B');
  assert.equal(items[1].carriles, 2);
  assert.equal(items[2].carriles, 1, 'la cena se queda con todo el ancho');
});

test('carriles: tres a la vez ocupan tres columnas, y sólo ellos', () => {
  const hacer = (nombre, inicio, fin) => crearActividad({ nombre, repeticion: { tipo: Repeticion.DIARIA }, bloque: { inicio, fin }, fechaInicio: LUNES });
  const items = repartirEnCarriles(agendaDelDia(
    [hacer('A', '09:00', '12:00'), hacer('B', '09:30', '11:00'), hacer('C', '10:00', '10:30'), hacer('D', '18:00', '19:00')],
    new Map(), LUNES,
  ));
  assert.deepEqual(items.map((i) => i.carril), [0, 1, 2, 0]);
  assert.deepEqual(items.map((i) => i.carriles), [3, 3, 3, 1]);
});
