// editor.js — la hoja de crear y editar una actividad.
//
// Principio "rapidez ante todo": lo imprescindible cabe sin desplegar nada
// (icono, nombre, color, cada cuánto y a qué hora). Todo lo demás vive detrás
// de "Más opciones". Crear un hábito son cuatro toques y escribir el nombre.

import { Repeticion, Tipo, Periodo, COLORES, colorHex, aHora, aMinutos, claveDia } from './modelo.js';
import { esc, DIAS_CORTOS, DIAS_LARGOS, duracionTexto, avisar } from './dom.js';
import { iconos } from './iconos.js';
import * as estado from './estado.js';

const EMOJIS = [
  '⭐', '💧', '🏃', '🏋️', '🧘', '🚶', '🚴', '🥗', '🍎', '🥐',
  '🍽️', '☕', '💊', '🧴', '🪥', '🛏️', '📖', '✍️', '💻', '📞',
  '✉️', '📊', '🎨', '🎸', '🎧', '🧺', '🧹', '🛒', '💶', '🐕',
  '🌱', '☀️', '🌙', '🧠', '❤️', '🎯', '🔥', '🚭', '📵', '🧊',
];

let dialogo = null;
let alGuardar = null;

function pinta(a) {
  const esNueva = !a.id;
  const rep = a.repeticion?.tipo ?? Repeticion.NINGUNA;
  const tieneHora = Boolean(a.bloque);
  const tieneObjetivo = Boolean(a.objetivo);

  const padresPosibles = estado.estado().actividades
    .filter((x) => !x.archivada && !x.padreId && x.id !== a.id)
    .filter((x) => !estado.estado().actividades.some((h) => h.padreId === a.id));

  return `
    <form method="dialog" id="form-actividad" novalidate>
      <div class="hoja__cabecera">
        <button type="button" class="icono-btn" data-cerrar aria-label="Cerrar sin guardar">${iconos.cerrar}</button>
        <h2 class="hoja__titulo">${esNueva ? 'Nueva actividad' : 'Editar'}</h2>
        ${!esNueva ? `<button type="button" class="icono-btn" data-borrar aria-label="Eliminar esta actividad">${iconos.papelera}</button>` : ''}
      </div>

      <div class="hoja__cuerpo">
        <div class="campo">
          <label class="campo__etiqueta" for="nombre">Nombre</label>
          <input class="entrada entrada--titulo" id="nombre" name="nombre" type="text" required
            autocomplete="off" enterkeyhint="done" placeholder="Gimnasio, leer, skincare…"
            value="${esc(a.nombre ?? '')}">
          <span class="campo__error" id="error-nombre" hidden>Ponle un nombre para poder guardarla.</span>
        </div>

        <fieldset class="campo" style="border:0;padding:0;margin-inline:0">
          <legend class="campo__etiqueta">Icono</legend>
          <div class="iconos" data-grupo="icono">
            <button type="button" class="iconos__i" data-valor="" aria-pressed="${!a.icono}" aria-label="Sin icono">·</button>
            ${EMOJIS.map((e) => `<button type="button" class="iconos__i" data-valor="${e}"
              aria-pressed="${a.icono === e}" aria-label="Icono ${e}">${e}</button>`).join('')}
          </div>
        </fieldset>

        <fieldset class="campo" style="border:0;padding:0;margin-inline:0">
          <legend class="campo__etiqueta">Color</legend>
          <div class="paleta" data-grupo="color">
            ${COLORES.map((c) => `<button type="button" class="paleta__c" data-valor="${c.id}"
              style="--muestra:${c.luz}" aria-pressed="${(a.color ?? 'pizarra') === c.id}"
              aria-label="Color ${c.id}"></button>`).join('')}
          </div>
        </fieldset>

        <fieldset class="campo" style="border:0;padding:0;margin-inline:0">
          <legend class="campo__etiqueta">Cada cuánto</legend>
          <div class="segmentado" data-grupo="repeticion">
            <button type="button" class="segmentado__op" data-valor="${Repeticion.NINGUNA}" aria-pressed="${rep === Repeticion.NINGUNA}">Una vez</button>
            <button type="button" class="segmentado__op" data-valor="${Repeticion.DIARIA}" aria-pressed="${rep === Repeticion.DIARIA}">Cada día</button>
            <button type="button" class="segmentado__op" data-valor="${Repeticion.DIAS}" aria-pressed="${rep === Repeticion.DIAS}">Días</button>
            <button type="button" class="segmentado__op" data-valor="${Repeticion.POR_SEMANA}" aria-pressed="${rep === Repeticion.POR_SEMANA}">A la semana</button>
          </div>

          <div data-si="${Repeticion.DIAS}" ${rep === Repeticion.DIAS ? '' : 'hidden'} style="margin-top:var(--e3)">
            <div class="dias" data-grupo="dias">
              ${DIAS_CORTOS.map((d, i) => `<button type="button" class="dias__d" data-valor="${i}"
                aria-pressed="${(a.repeticion?.dias ?? []).includes(i)}"
                aria-label="${DIAS_LARGOS[i]}"><span aria-hidden="true">${d}</span></button>`).join('')}
            </div>
            <span class="campo__pista">Sólo aparecerá los días que marques.</span>
          </div>

          <div data-si="${Repeticion.POR_SEMANA}" ${rep === Repeticion.POR_SEMANA ? '' : 'hidden'} style="margin-top:var(--e3)">
            <div class="grupo-h">
              <input class="entrada entrada--corta num" id="veces" name="veces" type="number" min="1" max="6" inputmode="numeric"
                value="${a.repeticion?.veces ?? 3}">
              <span style="color:var(--tinta-media)">veces por semana</span>
            </div>
            <span class="campo__pista">Sin día fijo: aparecerá cada día hasta que cumplas el cupo de la semana.</span>
          </div>

          <div data-si="${Repeticion.NINGUNA}" ${rep === Repeticion.NINGUNA ? '' : 'hidden'} style="margin-top:var(--e3)">
            <span class="campo__pista">Una tarea suelta: aparece sólo el día que elijas y no cuenta para las rachas.</span>
          </div>
        </fieldset>

        <div class="campo">
          <label class="campo__etiqueta" style="display:flex;align-items:center;justify-content:space-between;gap:var(--e3)">
            <span>Hora en el día</span>
            <input type="checkbox" id="con-hora" ${tieneHora ? 'checked' : ''} style="inline-size:2.75rem;block-size:1.6rem;accent-color:var(--marca)">
          </label>
          <div data-si="hora" ${tieneHora ? '' : 'hidden'}>
            <div class="grupo-h">
              <input class="entrada entrada--corta num" id="inicio" type="time" step="300"
                value="${aHora(a.bloque?.inicio ?? 8 * 60)}" aria-label="Hora de inicio">
              <span style="color:var(--tinta-media)">a</span>
              <input class="entrada entrada--corta num" id="fin" type="time" step="300"
                value="${aHora(a.bloque?.fin ?? 8 * 60 + 30)}" aria-label="Hora de fin">
              <span class="num" id="duracion" style="color:var(--tinta-media);font-size:var(--t-sm)"></span>
            </div>
            <span class="campo__pista">Ocupará ese hueco en el timeline. Luego lo puedes arrastrar.</span>
          </div>
          <span class="campo__pista" data-si="sin-hora" ${tieneHora ? 'hidden' : ''}>Sin hora: irá a la lista del final del día.</span>
        </div>

        <details style="margin-top:var(--e5)">
          <summary style="cursor:pointer;font-size:var(--t-sm);font-weight:560;color:var(--tinta-media);padding-block:var(--e2)">Más opciones</summary>

          <div style="padding-top:var(--e4)">
            <div class="campo">
              <label class="campo__etiqueta" style="display:flex;align-items:center;justify-content:space-between;gap:var(--e3)">
                <span>Objetivo con cuenta</span>
                <input type="checkbox" id="con-objetivo" ${tieneObjetivo ? 'checked' : ''} style="inline-size:2.75rem;block-size:1.6rem;accent-color:var(--marca)">
              </label>
              <div data-si="objetivo" ${tieneObjetivo ? '' : 'hidden'}>
                <div class="grupo-h">
                  <input class="entrada entrada--corta num" id="objetivo-valor" type="number" min="1" max="999" inputmode="numeric"
                    value="${a.objetivo?.valor ?? 2}" aria-label="Cuántas veces">
                  <input class="entrada" id="objetivo-unidad" type="text" style="inline-size:9rem" maxlength="20"
                    value="${esc(a.objetivo?.unidad ?? 'veces')}" aria-label="Unidad" placeholder="veces, vasos, páginas…">
                  <select class="entrada" id="objetivo-periodo" style="inline-size:7rem" aria-label="Cada">
                    <option value="${Periodo.DIA}" ${(a.objetivo?.periodo ?? Periodo.DIA) === Periodo.DIA ? 'selected' : ''}>al día</option>
                    <option value="${Periodo.SEMANA}" ${a.objetivo?.periodo === Periodo.SEMANA ? 'selected' : ''}>a la semana</option>
                  </select>
                </div>
                <span class="campo__pista">Cada toque suma uno. Hasta llegar al objetivo cuenta como a medias.</span>
              </div>
            </div>

            <fieldset class="campo" style="border:0;padding:0;margin-inline:0">
              <legend class="campo__etiqueta">Qué es</legend>
              <div class="segmentado" data-grupo="tipo">
                <button type="button" class="segmentado__op" data-valor="" aria-pressed="${!a.tipo}">Sin más</button>
                <button type="button" class="segmentado__op" data-valor="${Tipo.CONSTRUIR}" aria-pressed="${a.tipo === Tipo.CONSTRUIR}">Construir</button>
                <button type="button" class="segmentado__op" data-valor="${Tipo.DEJAR}" aria-pressed="${a.tipo === Tipo.DEJAR}">Dejar</button>
              </div>
            </fieldset>

            <div class="campo">
              <label class="campo__etiqueta" for="grupo">Grupo</label>
              <input class="entrada" id="grupo" type="text" maxlength="40" autocomplete="off"
                value="${esc(a.grupo ?? '')}" placeholder="Mañana, cuerpo, trabajo…">
            </div>

            <div class="campo">
              <label class="campo__etiqueta" for="padre">Dentro de</label>
              <select class="entrada" id="padre">
                <option value="">Nada: va suelta en el día</option>
                ${padresPosibles.map((p) => `<option value="${esc(p.id)}" ${a.padreId === p.id ? 'selected' : ''}>${esc(p.nombre)}</option>`).join('')}
              </select>
              <span class="campo__pista">Puede ser una subtarea o un hábito dentro de otro hábito, con su propia repetición.</span>
            </div>

            <div class="campo">
              <label class="campo__etiqueta" for="desde">Desde</label>
              <div class="grupo-h">
                <input class="entrada num" id="desde" type="date" style="inline-size:10.5rem" value="${esc(a.fechaInicio ?? claveDia())}">
                <span style="color:var(--tinta-media)">hasta</span>
                <input class="entrada num" id="hasta" type="date" style="inline-size:10.5rem" value="${esc(a.fechaFin ?? '')}">
              </div>
              <span class="campo__pista">Deja el final en blanco para que no termine nunca.</span>
            </div>
          </div>
        </details>
      </div>

      <div class="hoja__pie">
        <button type="button" class="btn btn--suave" data-cerrar>Cancelar</button>
        <button type="submit" class="btn btn--principal" data-guardar>${esNueva ? 'Crear' : 'Guardar'}</button>
      </div>
    </form>`;
}

// ── Lectura del formulario ───────────────────────────────────────────────────

function seleccionado(raiz, grupo) {
  return raiz.querySelector(`[data-grupo="${grupo}"] [aria-pressed="true"]`)?.dataset.valor ?? '';
}

function seleccionadosVarios(raiz, grupo) {
  return [...raiz.querySelectorAll(`[data-grupo="${grupo}"] [aria-pressed="true"]`)].map((b) => Number(b.dataset.valor));
}

function leer(raiz, base) {
  const v = (id) => raiz.querySelector(`#${id}`);
  const tipoRep = seleccionado(raiz, 'repeticion') || Repeticion.NINGUNA;

  const repeticion =
    tipoRep === Repeticion.DIAS ? { tipo: Repeticion.DIAS, dias: seleccionadosVarios(raiz, 'dias') }
    : tipoRep === Repeticion.POR_SEMANA ? { tipo: Repeticion.POR_SEMANA, veces: Number(v('veces').value) }
    : { tipo: tipoRep };

  const bloque = v('con-hora').checked
    ? { inicio: aMinutos(v('inicio').value || '08:00'), fin: aMinutos(v('fin').value || '08:30') }
    : null;

  const objetivo = v('con-objetivo').checked
    ? { valor: Number(v('objetivo-valor').value), unidad: v('objetivo-unidad').value.trim() || 'veces', periodo: v('objetivo-periodo').value }
    : null;

  return {
    id: base.id,
    nombre: v('nombre').value.trim(),
    icono: seleccionado(raiz, 'icono'),
    color: seleccionado(raiz, 'color') || 'pizarra',
    grupo: v('grupo').value.trim() || null,
    tipo: seleccionado(raiz, 'tipo') || null,
    repeticion,
    bloque,
    objetivo,
    padreId: v('padre').value || null,
    fechaInicio: v('desde').value || claveDia(),
    fechaFin: v('hasta').value || null,
    orden: base.orden ?? 0,
    creadaEn: base.creadaEn,
    archivada: false,
  };
}

// ── Apertura y cableado ──────────────────────────────────────────────────────

export function abrirEditor(actividadOEstructura = {}, cuandoGuarde = null) {
  const a = actividadOEstructura;
  alGuardar = cuandoGuarde;

  if (!dialogo) {
    dialogo = document.createElement('dialog');
    dialogo.className = 'hoja';
    dialogo.setAttribute('aria-label', 'Editar actividad');
    document.body.append(dialogo);
  }

  dialogo.innerHTML = pinta(a);
  dialogo.showModal();

  const form = dialogo.querySelector('#form-actividad');
  const q = (sel) => dialogo.querySelector(sel);

  const refrescarDuracion = () => {
    const i = aMinutos(q('#inicio').value || '00:00');
    let f = aMinutos(q('#fin').value || '00:00');
    if (f <= i) { f = Math.min(1440, i + 30); q('#fin').value = aHora(f); }
    q('#duracion').textContent = duracionTexto(f - i);
  };
  refrescarDuracion();

  // Grupos de botones: uno solo seleccionado, salvo los días que son varios.
  dialogo.addEventListener('click', (evento) => {
    const boton = evento.target.closest('[data-grupo] button');
    if (boton) {
      const grupo = boton.closest('[data-grupo]').dataset.grupo;
      if (grupo === 'dias') {
        boton.setAttribute('aria-pressed', boton.getAttribute('aria-pressed') !== 'true');
      } else {
        for (const otro of dialogo.querySelectorAll(`[data-grupo="${grupo}"] button`)) {
          otro.setAttribute('aria-pressed', otro === boton);
        }
      }
      if (grupo === 'repeticion') {
        for (const zona of dialogo.querySelectorAll('[data-si]')) {
          if (zona.dataset.si.startsWith('hora') || ['objetivo', 'sin-hora'].includes(zona.dataset.si)) continue;
          zona.hidden = zona.dataset.si !== boton.dataset.valor;
        }
      }
      return;
    }

    if (evento.target.closest('[data-cerrar]')) { cerrar(); return; }

    if (evento.target.closest('[data-borrar]')) {
      const resultado = estado.eliminarActividad(a.id);
      cerrar();
      avisar(resultado.archivada
        ? 'Guardada en el archivo: su historial se conserva.'
        : 'Actividad eliminada.');
    }
  });

  q('#con-hora').addEventListener('change', (e) => {
    q('[data-si="hora"]').hidden = !e.target.checked;
    q('[data-si="sin-hora"]').hidden = e.target.checked;
  });
  q('#con-objetivo').addEventListener('change', (e) => {
    q('[data-si="objetivo"]').hidden = !e.target.checked;
  });
  q('#inicio').addEventListener('change', refrescarDuracion);
  q('#fin').addEventListener('change', refrescarDuracion);

  form.addEventListener('submit', (evento) => {
    evento.preventDefault();
    const datos = leer(dialogo, a);

    if (!datos.nombre) {
      const campo = q('#nombre');
      campo.setAttribute('aria-invalid', 'true');
      q('#error-nombre').hidden = false;
      campo.focus();
      return;
    }
    if (datos.repeticion.tipo === Repeticion.DIAS && datos.repeticion.dias.length === 0) {
      avisar('Marca al menos un día de la semana.');
      return;
    }

    const guardada = estado.guardarActividad(datos);
    cerrar();
    alGuardar?.(guardada);
  });

  dialogo.addEventListener('close', () => { dialogo.innerHTML = ''; }, { once: true });
  setTimeout(() => q('#nombre')?.focus(), 60);
}

function cerrar() {
  dialogo?.close();
}
