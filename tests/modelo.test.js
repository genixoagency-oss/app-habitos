import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Repeticion, Tipo, Estado,
  crearActividad, crearRegistro, normalizarRepeticion, normalizarObjetivo, normalizarBloque,
  validarJerarquia, hijasDe, esHabito, duracionMin, bloqueEfectivo,
  siguienteEstado, estadoSegunValor,
  claveDia, desdeClave, sumarDias, diaSemana, lunesDeLaSemana, diasEntre,
  aMinutos, aHora,
} from '../js/modelo.js';

test('fechas: clave local, ida y vuelta', () => {
  assert.equal(claveDia(new Date(2026, 7, 17)), '2026-08-17');
  assert.equal(claveDia(new Date(2026, 0, 5)), '2026-01-05');
  assert.equal(claveDia(desdeClave('2026-12-31')), '2026-12-31');
});

test('fechas: sumar cruza mes y año', () => {
  assert.equal(sumarDias('2026-08-31', 1), '2026-09-01');
  assert.equal(sumarDias('2026-01-01', -1), '2025-12-31');
  assert.equal(sumarDias('2026-03-01', -1), '2026-02-28');
});

test('fechas: sumar sobrevive al cambio de hora', () => {
  // En España el reloj cambia la última madrugada de marzo y de octubre.
  assert.equal(sumarDias('2026-03-28', 1), '2026-03-29');
  assert.equal(sumarDias('2026-03-29', 1), '2026-03-30');
  assert.equal(sumarDias('2026-10-24', 1), '2026-10-25');
  assert.equal(sumarDias('2026-10-25', 1), '2026-10-26');
  assert.equal(diasEntre('2026-03-28', '2026-03-30'), 2);
  assert.equal(diasEntre('2026-10-24', '2026-10-26'), 2);
});

test('fechas: la semana empieza en lunes', () => {
  assert.equal(diaSemana('2026-08-17'), 0, 'el 17-08-2026 es lunes');
  assert.equal(diaSemana('2026-08-23'), 6, 'el 23-08-2026 es domingo');
  assert.equal(lunesDeLaSemana('2026-08-23'), '2026-08-17');
  assert.equal(lunesDeLaSemana('2026-08-17'), '2026-08-17');
});

test('horas: minutos desde medianoche', () => {
  assert.equal(aMinutos('08:00'), 480);
  assert.equal(aMinutos('23:59'), 1439);
  assert.equal(aHora(480), '08:00');
  assert.equal(aHora(1439), '23:59');
  assert.equal(aHora(-10), '00:00');
  assert.equal(aHora(99999), '23:59');
});

test('repeticion: los siete días son "diaria"', () => {
  const r = normalizarRepeticion({ tipo: Repeticion.DIAS, dias: [0, 1, 2, 3, 4, 5, 6] });
  assert.equal(r.tipo, Repeticion.DIARIA);
});

test('repeticion: sin días válidos es una tarea suelta', () => {
  assert.equal(normalizarRepeticion({ tipo: Repeticion.DIAS, dias: [] }).tipo, Repeticion.NINGUNA);
  assert.equal(normalizarRepeticion({ tipo: Repeticion.DIAS, dias: [9, -1] }).tipo, Repeticion.NINGUNA);
});

test('repeticion: días duplicados se limpian y ordenan', () => {
  const r = normalizarRepeticion({ tipo: Repeticion.DIAS, dias: [4, 0, 4, 2] });
  assert.deepEqual(r.dias, [0, 2, 4]);
});

test('repeticion: 7 veces por semana es diaria; se acota entre 1 y 7', () => {
  assert.equal(normalizarRepeticion({ tipo: Repeticion.POR_SEMANA, veces: 7 }).tipo, Repeticion.DIARIA);
  assert.equal(normalizarRepeticion({ tipo: Repeticion.POR_SEMANA, veces: 99 }).tipo, Repeticion.DIARIA);
  assert.equal(normalizarRepeticion({ tipo: Repeticion.POR_SEMANA, veces: 0 }).veces, 1);
});

test('objetivo: "1 vez" sin unidad no es un objetivo, es un check', () => {
  assert.equal(normalizarObjetivo({ valor: 1 }), null);
  assert.equal(normalizarObjetivo(null), null);
  assert.deepEqual(normalizarObjetivo({ valor: 2 }), { valor: 2, unidad: 'veces', periodo: 'dia' });
});

test('bloque: un fin imposible se corrige a 30 minutos', () => {
  assert.deepEqual(normalizarBloque({ inicio: '08:00', fin: '07:00' }), { inicio: 480, fin: 510 });
  assert.deepEqual(normalizarBloque({ inicio: 480 }), { inicio: 480, fin: 510 });
  assert.deepEqual(normalizarBloque({ inicio: '08:00', fin: '08:20' }), { inicio: 480, fin: 500 });
  assert.equal(normalizarBloque(null), null);
});

test('actividad: sin repetición es tarea suelta; con repetición es hábito', () => {
  const tarea = crearActividad({ nombre: 'Poner la lavadora' });
  const habito = crearActividad({ nombre: 'Gimnasio', repeticion: { tipo: Repeticion.DIARIA } });
  assert.equal(esHabito(tarea), false);
  assert.equal(esHabito(habito), true);
  assert.equal(tarea.tipo, null);
});

test('actividad: el nombre se recorta y la profundidad se deduce del padre', () => {
  const padre = crearActividad({ nombre: '  Trabajar  ' });
  assert.equal(padre.nombre, 'Trabajar');
  assert.equal(padre.profundidad, 0);
  const hija = crearActividad({ nombre: 'Llamar a 10 personas', padreId: padre.id });
  assert.equal(hija.profundidad, 1);
});

test('jerarquía: se rechaza ser hija de sí misma', () => {
  const a = crearActividad({ nombre: 'A' });
  assert.match(validarJerarquia([a], a.id, a.id), /sí misma/);
});

test('jerarquía: se rechaza más de un nivel', () => {
  const padre = crearActividad({ nombre: 'Trabajar' });
  const hija = crearActividad({ nombre: 'Llamadas', padreId: padre.id });
  const nieta = crearActividad({ nombre: 'Nieta' });
  assert.match(validarJerarquia([padre, hija, nieta], nieta.id, hija.id), /un nivel/);
});

test('jerarquía: una actividad con hijas no puede volverse hija', () => {
  const padre = crearActividad({ nombre: 'Trabajar' });
  const hija = crearActividad({ nombre: 'Llamadas', padreId: padre.id });
  const otro = crearActividad({ nombre: 'Otro' });
  assert.match(validarJerarquia([padre, hija, otro], padre.id, otro.id), /ya tiene hijas/);
});

test('jerarquía: un padre válido se acepta y el orden es estable', () => {
  const padre = crearActividad({ nombre: 'Trabajar' });
  const b = crearActividad({ nombre: 'B', padreId: padre.id, orden: 1 });
  const a = crearActividad({ nombre: 'A', padreId: padre.id, orden: 0 });
  assert.equal(validarJerarquia([padre, a, b], a.id, padre.id), null);
  assert.deepEqual(hijasDe([padre, b, a], padre.id).map((x) => x.nombre), ['A', 'B']);
});

test('registro: su id es determinista (uno por actividad y día)', () => {
  const r1 = crearRegistro({ actividadId: 'abc', fecha: '2026-08-17' });
  const r2 = crearRegistro({ actividadId: 'abc', fecha: '2026-08-17' });
  assert.equal(r1.id, r2.id);
  assert.equal(r1.id, 'abc|2026-08-17');
});

test('bloque efectivo: mover el bloque de hoy no toca la plantilla del hábito', () => {
  const a = crearActividad({ nombre: 'Gimnasio', bloque: { inicio: '18:00', fin: '19:00' } });
  const reg = crearRegistro({ actividadId: a.id, inicioReal: 20 * 60 });
  assert.deepEqual(bloqueEfectivo(a, reg), { inicio: 1200, fin: 1260 });
  assert.deepEqual(a.bloque, { inicio: 1080, fin: 1140 }, 'la plantilla sigue intacta');
  assert.equal(duracionMin(a), 60);
});

test('un toque sin objetivo: pendiente → completada → saltada → pendiente', () => {
  const a = crearActividad({ nombre: 'Tomar vitamina' });
  let r = crearRegistro({ actividadId: a.id });
  r = siguienteEstado(a, r); assert.equal(r.estado, Estado.COMPLETADA);
  r = siguienteEstado(a, r); assert.equal(r.estado, Estado.SALTADA);
  r = siguienteEstado(a, r); assert.equal(r.estado, Estado.PENDIENTE);
});

test('un toque con objetivo: cuenta hasta el objetivo y vuelve a cero', () => {
  const a = crearActividad({ nombre: 'Skincare', objetivo: { valor: 2 } });
  let r = crearRegistro({ actividadId: a.id });
  r = siguienteEstado(a, r);
  assert.equal(r.valorLogrado, 1);
  assert.equal(r.estado, Estado.PARCIAL, '1 de 2 es parcial');
  r = siguienteEstado(a, r);
  assert.equal(r.valorLogrado, 2);
  assert.equal(r.estado, Estado.COMPLETADA);
  r = siguienteEstado(a, r);
  assert.equal(r.valorLogrado, 0);
  assert.equal(r.estado, Estado.PENDIENTE);
});

test('estadoSegunValor cubre los tres tramos', () => {
  assert.equal(estadoSegunValor(0, 3), Estado.PENDIENTE);
  assert.equal(estadoSegunValor(2, 3), Estado.PARCIAL);
  assert.equal(estadoSegunValor(3, 3), Estado.COMPLETADA);
  assert.equal(estadoSegunValor(9, 3), Estado.COMPLETADA);
});

test('un toque sobre una actividad nunca tocada no explota', () => {
  const a = crearActividad({ nombre: 'Nueva' });
  const r = siguienteEstado(a, undefined);
  assert.equal(r.estado, Estado.COMPLETADA);
  assert.equal(r.actividadId, a.id);
});
