// vista-habitos.js — todos los hábitos, agrupados, con el estado de hoy.
//
// El timeline enseña el día; esta pantalla enseña la costumbre. Por eso aquí
// lo que manda no es la hora, es la racha.

import { Estado, Repeticion, claveDia, colorHex, aHora } from './modelo.js';
import { tocaEl } from './repeticion.js';
import { rachas } from './progreso.js';
import { esc, DIAS_CORTOS, plural } from './dom.js';
import { iconos } from './iconos.js';
import { check } from './vista-hoy.js';
import { crearRegistro, claveRegistro } from './modelo.js';

function textoRepeticion(a) {
  const r = a.repeticion;
  if (r.tipo === Repeticion.DIARIA) return 'cada día';
  if (r.tipo === Repeticion.POR_SEMANA) return `${r.veces} ${plural(r.veces, 'vez', 'veces')} por semana`;
  if (r.tipo === Repeticion.DIAS) return r.dias.map((d) => DIAS_CORTOS[d]).join(' ');
  return 'una vez';
}

function meta(a, racha) {
  const trozos = [textoRepeticion(a)];
  if (a.bloque) trozos.push(aHora(a.bloque.inicio));
  if (a.objetivo) trozos.push(`${a.objetivo.valor} ${a.objetivo.unidad}`);
  if (racha.actual > 0) trozos.push(`${racha.actual} ${plural(racha.actual, 'día seguido', 'días seguidos')}`);
  return trozos.join(' · ');
}

function filaHabito(a, almacen, hoy) {
  const registro = almacen.registros.get(claveRegistro(a.id, hoy)) ?? crearRegistro({ actividadId: a.id, fecha: hoy });
  const toca = tocaEl(a, hoy, almacen.registros);
  const racha = rachas(a, almacen.registros, hoy);

  return `
    <li>
      <div class="fila" data-id="${esc(a.id)}" data-estado="${toca ? registro.estado : 'saltada'}"
        style="--color-actividad:${colorHex(a.color)}${toca ? '' : ';opacity:.5'}">
        ${toca ? check(a, registro) : '<span style="inline-size:1.75rem" aria-hidden="true"></span>'}
        <button type="button" class="bloque__cuerpo fila__cuerpo" data-accion="abrir" data-id="${esc(a.id)}">
          <span class="fila__nombre">${a.icono ? `<span class="bloque__icono" aria-hidden="true">${esc(a.icono)}</span>` : ''}${esc(a.nombre)}</span>
          <span class="fila__meta num">${esc(toca ? meta(a, racha) : `${textoRepeticion(a)} · hoy no toca`)}</span>
        </button>
        ${racha.mejor > 0 ? `<span class="fila__cifra num" title="Mejor racha">${racha.mejor} máx.</span>` : ''}
      </div>
    </li>`;
}

export function pintarHabitos(almacen) {
  const hoy = claveDia();
  const habitos = almacen.actividades
    .filter((a) => !a.archivada && a.repeticion.tipo !== Repeticion.NINGUNA)
    .sort((a, b) => (a.bloque?.inicio ?? 1e9) - (b.bloque?.inicio ?? 1e9) || a.nombre.localeCompare(b.nombre, 'es'));

  const cabecera = `
    <header class="cabecera">
      <div class="contenedor">
        <div class="cabecera__fila">
          <h1 class="fecha">
            <span class="fecha__dia">Hábitos</span>
            <span class="fecha__resto">${habitos.length} ${plural(habitos.length, 'hábito')} · el estado es el de hoy</span>
          </h1>
          <button type="button" class="icono-btn" data-accion="ajustes" aria-label="Ajustes">${iconos.puntos}</button>
          <button type="button" class="icono-btn icono-btn--principal" data-accion="nueva" aria-label="Añadir hábito">${iconos.mas}</button>
        </div>
      </div>
    </header>`;

  if (habitos.length === 0) {
    return `${cabecera}
      <div class="contenedor">
        <div class="vacio">
          <p class="vacio__titulo">Todavía no hay hábitos</p>
          <p class="vacio__texto">Un hábito es cualquier cosa que se repita: cada día, ciertos días o unas cuantas veces por semana. Se pondrá solo en tu día.</p>
          <div class="vacio__acciones">
            <button type="button" class="btn btn--principal" data-accion="nueva">Crear el primero</button>
          </div>
        </div>
      </div>`;
  }

  // Agrupados por el campo "grupo". Los sueltos van al final, sin titular.
  const grupos = new Map();
  for (const a of habitos) {
    const clave = a.grupo || '';
    if (!grupos.has(clave)) grupos.set(clave, []);
    grupos.get(clave).push(a);
  }
  const conNombre = [...grupos.entries()].filter(([k]) => k).sort((a, b) => a[0].localeCompare(b[0], 'es'));
  const sinNombre = grupos.get('') ?? [];

  const seccion = (titulo, lista) => `
    <section class="seccion">
      ${titulo ? `<h2 class="seccion__titulo">${esc(titulo)}<span class="seccion__cuenta num">${lista.length}</span></h2>` : ''}
      <ul>${lista.map((a) => filaHabito(a, almacen, hoy)).join('')}</ul>
    </section>`;

  const archivadas = almacen.actividades.filter((a) => a.archivada).length;

  return `${cabecera}
    <div class="contenedor">
      ${conNombre.map(([titulo, lista]) => seccion(titulo, lista)).join('')}
      ${sinNombre.length ? seccion(conNombre.length ? 'Sin grupo' : '', sinNombre) : ''}
      ${archivadas > 0 ? `<p class="campo__pista" style="margin-top:var(--e6);text-align:center">${archivadas} ${plural(archivadas, 'actividad archivada', 'actividades archivadas')}, con su historial a salvo.</p>` : ''}
    </div>`;
}
