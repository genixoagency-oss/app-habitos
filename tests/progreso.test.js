import test from 'node:test';
import assert from 'node:assert/strict';
import { Repeticion, Estado, crearActividad, crearRegistro, claveRegistro } from '../js/modelo.js';
import { agendaDelDia } from '../js/repeticion.js';
import { pesoDeItem, resumenDelDia, progresoDelDia, rachas, diasPerfectos, tasa, promedioDiario } from '../js/progreso.js';

const LUNES = '2026-08-17';
const MARTES = '2026-08-18';
const MIERCOLES = '2026-08-19';
const INICIO = '2026-08-01';

function regs(...filas) {
  const m = new Map();
  for (const [actividadId, fecha, estado, valorLogrado] of filas) {
    m.set(claveRegistro(actividadId, fecha), crearRegistro({ actividadId, fecha, estado, valorLogrado }));
  }
  return m;
}

const diario = (nombre, extra = {}) =>
  crearActividad({ nombre, repeticion: { tipo: Repeticion.DIARIA }, fechaInicio: INICIO, ...extra });

test('peso: una saltada no cuenta ni arriba ni abajo', () => {
  const a = diario('Gimnasio');
  const item = { actividad: a, registro: crearRegistro({ actividadId: a.id, estado: Estado.SALTADA }), hijas: [] };
  assert.deepEqual(pesoDeItem(item), { peso: 0, hecho: 0 });
});

test('peso: una parcial con objetivo vale su fracción real', () => {
  const a = diario('Skincare', { objetivo: { valor: 2 } });
  const item = { actividad: a, registro: crearRegistro({ actividadId: a.id, estado: Estado.PARCIAL, valorLogrado: 1 }), hijas: [] };
  assert.deepEqual(pesoDeItem(item), { peso: 1, hecho: 0.5 });
});

test('peso: una parcial sin objetivo vale medio punto', () => {
  const a = diario('Estudiar');
  const item = { actividad: a, registro: crearRegistro({ actividadId: a.id, estado: Estado.PARCIAL }), hijas: [] };
  assert.deepEqual(pesoDeItem(item), { peso: 1, hecho: 0.5 });
});

test('círculo: saltar algo no baja el porcentaje', () => {
  const a = diario('A');
  const b = diario('B');
  const c = diario('C');
  const sinSaltar = progresoDelDia([a, b, c], regs([a.id, LUNES, Estado.COMPLETADA]), LUNES);
  assert.equal(sinSaltar.porcentaje, 33);

  const saltando = progresoDelDia(
    [a, b, c],
    regs([a.id, LUNES, Estado.COMPLETADA], [b.id, LUNES, Estado.SALTADA]),
    LUNES,
  );
  assert.equal(saltando.porcentaje, 50, '1 de 2 reales, no 1 de 3');
});

test('círculo: un día entero completado es 100', () => {
  const a = diario('A');
  const b = diario('B');
  const p = progresoDelDia([a, b], regs([a.id, LUNES, Estado.COMPLETADA], [b.id, LUNES, Estado.COMPLETADA]), LUNES);
  assert.equal(p.porcentaje, 100);
  assert.equal(p.completadas, 2);
  assert.equal(p.total, 2);
});

test('círculo: un día sin nada no es 0 %, es vacío', () => {
  const p = progresoDelDia([], new Map(), LUNES);
  assert.equal(p.vacio, true);
  assert.equal(p.porcentaje, 0);
});

test('círculo: mide la constancia, no los recados', () => {
  const habito = diario('Gimnasio');
  const recado = crearActividad({ nombre: 'Poner la lavadora', fechaInicio: LUNES });
  const p = progresoDelDia([habito, recado], regs([habito.id, LUNES, Estado.COMPLETADA]), LUNES);
  assert.equal(p.porcentaje, 100, 'el hábito está hecho: el círculo está lleno');
  assert.equal(p.total, 1, 'el recado no entra en el anillo');
});

test('círculo: si el día sólo tiene recados, entonces sí los mide', () => {
  const recado = crearActividad({ nombre: 'Poner la lavadora', fechaInicio: LUNES });
  const otro = crearActividad({ nombre: 'Llamar al banco', fechaInicio: LUNES });
  const p = progresoDelDia([recado, otro], regs([recado.id, LUNES, Estado.COMPLETADA]), LUNES);
  assert.equal(p.porcentaje, 50);
});

test('resumen: separa hábitos de tareas puntuales', () => {
  const habito = diario('Gimnasio');
  const recado = crearActividad({ nombre: 'Poner la lavadora', fechaInicio: LUNES });
  const r = resumenDelDia([habito, recado], regs([recado.id, LUNES, Estado.COMPLETADA]), LUNES);

  assert.equal(r.recurrentes.total, 1);
  assert.equal(r.recurrentes.completadas, 0);
  assert.equal(r.puntuales.total, 1);
  assert.equal(r.puntuales.completadas, 1);
  assert.equal(r.todo.total, 2, 'el recuento general los suma');
});

test('resumen: un padre no puntúa aparte, lo hacen sus hijas', () => {
  const trabajar = diario('Trabajar', { bloque: { inicio: '09:00', fin: '17:00' } });
  const llamadas = diario('Llamadas', { padreId: trabajar.id });
  const informe = diario('Informe', { padreId: trabajar.id });

  const r = resumenDelDia([trabajar, llamadas, informe], regs([llamadas.id, LUNES, Estado.COMPLETADA]), LUNES);
  assert.equal(r.recurrentes.total, 2, 'cuentan las dos hijas, no el padre');
  assert.equal(r.recurrentes.porcentaje, 50);
});

test('resumen: el progreso del padre sale de sus hijas', () => {
  const trabajar = diario('Trabajar');
  const a = diario('A', { padreId: trabajar.id });
  const b = diario('B', { padreId: trabajar.id });
  const agenda = agendaDelDia([trabajar, a, b], regs([a.id, LUNES, Estado.COMPLETADA]), LUNES);
  assert.deepEqual(pesoDeItem(agenda[0]), { peso: 2, hecho: 1 });
});

test('racha: días seguidos completados', () => {
  const a = diario('Gimnasio');
  const m = regs(
    [a.id, LUNES, Estado.COMPLETADA],
    [a.id, MARTES, Estado.COMPLETADA],
    [a.id, MIERCOLES, Estado.COMPLETADA],
  );
  assert.deepEqual(rachas(a, m, MIERCOLES), { actual: 3, mejor: 3 });
});

test('racha: hoy sin terminar no la rompe', () => {
  const a = diario('Gimnasio');
  const m = regs([a.id, LUNES, Estado.COMPLETADA], [a.id, MARTES, Estado.COMPLETADA]);
  assert.equal(rachas(a, m, MIERCOLES).actual, 2, 'miércoles pendiente: la racha de 2 sigue viva');
});

test('racha: un día saltado la perdona; uno pendiente en el pasado la corta', () => {
  const a = diario('Gimnasio');
  const perdonado = regs(
    [a.id, LUNES, Estado.COMPLETADA],
    [a.id, MARTES, Estado.SALTADA],
    [a.id, MIERCOLES, Estado.COMPLETADA],
  );
  assert.equal(rachas(a, perdonado, MIERCOLES).actual, 2);

  const roto = regs([a.id, LUNES, Estado.COMPLETADA], [a.id, MIERCOLES, Estado.COMPLETADA]);
  assert.equal(rachas(a, roto, MIERCOLES).actual, 1, 'el martes en blanco la corta');
  assert.equal(rachas(a, roto, MIERCOLES).mejor, 1);
});

test('racha: los días que no tocaban no la rompen', () => {
  const a = crearActividad({
    nombre: 'Gimnasio',
    repeticion: { tipo: Repeticion.DIAS, dias: [0, 2] }, // lunes y miércoles
    fechaInicio: INICIO,
  });
  const m = regs([a.id, LUNES, Estado.COMPLETADA], [a.id, MIERCOLES, Estado.COMPLETADA]);
  assert.equal(rachas(a, m, MIERCOLES).actual, 2, 'el martes no tocaba');
});

test('racha: guarda la mejor aunque la actual esté rota', () => {
  const a = diario('Gimnasio');
  const m = regs(
    [a.id, '2026-08-10', Estado.COMPLETADA],
    [a.id, '2026-08-11', Estado.COMPLETADA],
    [a.id, '2026-08-12', Estado.COMPLETADA],
    [a.id, MIERCOLES, Estado.COMPLETADA],
  );
  const r = rachas(a, m, MIERCOLES);
  assert.equal(r.actual, 1);
  assert.equal(r.mejor, 3);
});

test('días perfectos: sólo cuentan los días con algo recurrente y todo hecho', () => {
  const a = diario('A');
  const b = diario('B');
  const m = regs(
    [a.id, LUNES, Estado.COMPLETADA],
    [b.id, LUNES, Estado.COMPLETADA],
    [a.id, MARTES, Estado.COMPLETADA],
  );
  assert.equal(diasPerfectos([a, b], m, LUNES, MARTES), 1);
});

test('tasa: completadas sobre días que tocaba, sin contar los saltados', () => {
  const a = diario('Gimnasio');
  const m = regs(
    [a.id, LUNES, Estado.COMPLETADA],
    [a.id, MARTES, Estado.SALTADA],
    [a.id, MIERCOLES, Estado.PENDIENTE],
  );
  assert.deepEqual(tasa(a, m, LUNES, MIERCOLES), { tocaba: 2, hechas: 1, porcentaje: 50 });
});

test('promedio diario de un objetivo con unidad', () => {
  const a = diario('Agua', { objetivo: { valor: 8, unidad: 'vasos' } });
  const m = regs(
    [a.id, LUNES, Estado.COMPLETADA, 8],
    [a.id, MARTES, Estado.PARCIAL, 4],
    [a.id, MIERCOLES, Estado.PENDIENTE, 0],
  );
  assert.equal(promedioDiario(a, m, LUNES, MIERCOLES), 4);
});
