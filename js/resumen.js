// resumen.js — la hoja que se abre al tocar el círculo del día.
//
// Separa lo recurrente de lo puntual porque son dos cosas distintas: una
// lavadora sin poner no debería doler igual que un hábito roto.

import { Estado, desdeClave } from './modelo.js';
import { resumenDelDia } from './progreso.js';
import { esc, fechaLarga, plural } from './dom.js';
import { iconos } from './iconos.js';
import * as estado from './estado.js';

let dialogo = null;

const ETIQUETA = {
  [Estado.COMPLETADA]: 'hecho',
  [Estado.PARCIAL]: 'a medias',
  [Estado.SALTADA]: 'saltado',
  [Estado.PENDIENTE]: 'sin hacer',
  [Estado.EN_CURSO]: 'en curso',
};

function listaEstados(items) {
  const aplanar = (lista) => lista.flatMap((i) => (i.hijas?.length ? aplanar(i.hijas) : [i]));
  const planos = aplanar(items);
  const orden = [Estado.COMPLETADA, Estado.PARCIAL, Estado.PENDIENTE, Estado.EN_CURSO, Estado.SALTADA];
  planos.sort((a, b) => orden.indexOf(a.registro.estado) - orden.indexOf(b.registro.estado));

  return `<ul>${planos.map((i) => `
    <li class="fila" data-estado="${i.registro.estado}">
      <span class="fila__punto" aria-hidden="true" style="--color-actividad:var(--tinta-tenue)"></span>
      <span class="fila__cuerpo">
        <span class="fila__nombre">${i.actividad.icono ? `<span class="bloque__icono" aria-hidden="true">${esc(i.actividad.icono)}</span>` : ''}${esc(i.actividad.nombre)}</span>
      </span>
      <span class="fila__cifra">${
        i.actividad.objetivo && i.registro.estado === Estado.PARCIAL
          ? `${i.registro.valorLogrado} de ${i.actividad.objetivo.valor}`
          : ETIQUETA[i.registro.estado]
      }</span>
    </li>`).join('')}</ul>`;
}

function bloqueResumen(titulo, datos, vacioTexto) {
  if (datos.total === 0) {
    return `<section class="resumen__bloque">
      <h3 class="seccion__titulo">${esc(titulo)}</h3>
      <p class="campo__pista" style="padding-block:var(--e3)">${esc(vacioTexto)}</p>
    </section>`;
  }
  return `
    <section class="resumen__bloque">
      <h3 class="seccion__titulo">${esc(titulo)}<span class="seccion__cuenta num">${datos.porcentaje} %</span></h3>
      <div class="cifras">
        <span class="cifra ${datos.completadas > 0 ? 'cifra--hecho' : ''}"><span class="cifra__n num">${datos.completadas}</span><span class="cifra__t">${plural(datos.completadas, 'completada', 'completadas')}</span></span>
        ${datos.parciales > 0 ? `<span class="cifra cifra--medias"><span class="cifra__n num">${datos.parciales}</span><span class="cifra__t">a medias</span></span>` : ''}
        <span class="cifra"><span class="cifra__n num">${datos.pendientes}</span><span class="cifra__t">${plural(datos.pendientes, 'sin hacer', 'sin hacer')}</span></span>
        ${datos.saltadas > 0 ? `<span class="cifra"><span class="cifra__n num">${datos.saltadas}</span><span class="cifra__t">${plural(datos.saltadas, 'saltada', 'saltadas')}</span></span>` : ''}
      </div>
      ${listaEstados(datos.items)}
    </section>`;
}

export function abrirResumen() {
  const almacen = estado.estado();
  const r = resumenDelDia(almacen.actividades, almacen.registros, almacen.dia);

  if (!dialogo) {
    dialogo = document.createElement('dialog');
    dialogo.className = 'hoja';
    document.body.append(dialogo);
  }

  dialogo.setAttribute('aria-label', `Resumen del ${fechaLarga(desdeClave(almacen.dia))}`);
  dialogo.innerHTML = `
    <div class="hoja__cabecera">
      <button type="button" class="icono-btn" data-cerrar aria-label="Cerrar">${iconos.cerrar}</button>
      <h2 class="hoja__titulo">${esc(fechaLarga(desdeClave(almacen.dia)))}</h2>
    </div>
    <div class="hoja__cuerpo">
      ${bloqueResumen('Hábitos y rutinas', r.recurrentes, 'Hoy no tocaba ningún hábito.')}
      ${bloqueResumen('Tareas sueltas', r.puntuales, 'No pusiste ninguna tarea suelta para hoy.')}
      <p class="recuento">
        <span>En total pusiste <strong class="num">${r.todo.total}</strong> ${plural(r.todo.total, 'cosa', 'cosas')} para este día.</span>
        <strong class="num">${r.todo.completadas} ${plural(r.todo.completadas, 'hecha', 'hechas')}</strong>
      </p>
    </div>`;

  dialogo.showModal();
  dialogo.addEventListener('click', (e) => {
    if (e.target.closest('[data-cerrar]')) dialogo.close();
  });
}
