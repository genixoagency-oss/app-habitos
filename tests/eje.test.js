import test from 'node:test';
import assert from 'node:assert/strict';
import { Repeticion, crearActividad, crearRegistro } from '../js/modelo.js';
import { ventana, colocar, constantes } from '../js/vista-hoy.js';

const { PX_MIN, ALTO_MIN_BLOQUE } = constantes;

function item(inicio, fin) {
  const a = crearActividad({
    nombre: `${inicio}`,
    repeticion: { tipo: Repeticion.DIARIA },
    bloque: { inicio, fin },
  });
  return { actividad: a, registro: crearRegistro({ actividadId: a.id }), hijas: [] };
}

test('ventana: por defecto va de 7:00 a 23:00', () => {
  assert.deepEqual(ventana([]), { desde: 420, hasta: 1380 });
});

test('ventana: se estira para que quepa un bloque madrugador', () => {
  const v = ventana([item(5 * 60 + 30, 6 * 60)]);
  assert.equal(v.desde, 5 * 60, 'baja hasta la hora en punto anterior');
  assert.equal(v.hasta, 1380);
});

test('ventana: se estira para que quepa un bloque nocturno', () => {
  assert.equal(ventana([item(23 * 60 + 30, 24 * 60)]).hasta, 1440);
});

test('ventana: "ahora" la estira si está cerca del día', () => {
  const v = ventana([], 6 * 60 + 20); // 6:20, a 40 min del inicio natural
  assert.equal(v.desde, 5 * 60, 'entra en la ventana');
});

test('ventana: de madrugada "ahora" NO estira la ventana', () => {
  const v = ventana([], 2 * 60); // las 2 de la mañana
  assert.deepEqual(v, { desde: 420, hasta: 1380 }, 'no se pintan seis horas de nada');
});

test('ventana: nunca se sale del día', () => {
  const v = ventana([item(0, 30)], 1439);
  assert.ok(v.desde >= 0);
  assert.ok(v.hasta <= 1440);
});

test('colocar: un bloque normal cae en su hora exacta', () => {
  const items = [item(9 * 60, 10 * 60)];
  colocar(items, 8 * 60);
  assert.equal(items[0].geo.arriba, 60 * PX_MIN);
  assert.equal(items[0].geo.alto, 60 * PX_MIN);
});

test('colocar: un bloque muy corto nunca baja del objetivo táctil', () => {
  const items = [item(9 * 60, 9 * 60 + 10)];
  colocar(items, 9 * 60);
  assert.equal(items[0].geo.alto, ALTO_MIN_BLOQUE);
});

test('colocar: dos bloques cortos seguidos no se solapan', () => {
  const items = [item(8 * 60, 8 * 60 + 15), item(8 * 60 + 20, 8 * 60 + 35)];
  colocar(items, 8 * 60);
  const [a, b] = items;
  assert.ok(b.geo.arriba >= a.geo.arriba + a.geo.alto, 'el segundo empieza por debajo del primero');
});

test('colocar: bloques separados de verdad conservan su hora', () => {
  const items = [item(8 * 60, 9 * 60), item(12 * 60, 13 * 60)];
  colocar(items, 8 * 60);
  assert.equal(items[1].geo.arriba, 4 * 60 * PX_MIN, 'no se desplaza: hay sitio de sobra');
});

test('colocar: los que se solapan en carriles distintos no se empujan', () => {
  const items = [item(9 * 60, 11 * 60), item(9 * 60 + 30, 10 * 60)];
  items[0].carril = 0;
  items[1].carril = 1;
  colocar(items, 9 * 60);
  assert.equal(items[1].geo.arriba, 30 * PX_MIN, 'está en otra columna: se queda en su hora');
});

test('colocar: devuelve el fondo real, contando lo que se haya empujado', () => {
  const items = [item(8 * 60, 8 * 60 + 5), item(8 * 60 + 5, 8 * 60 + 10)];
  const fondo = colocar(items, 8 * 60);
  assert.equal(fondo, items[1].geo.arriba + items[1].geo.alto);
  assert.ok(fondo > 10 * PX_MIN, 'el eje crece para que quepan los dos');
});
