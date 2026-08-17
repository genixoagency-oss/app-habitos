// ajustes.js — tema, copia de seguridad y borrado.
//
// La copia de seguridad no es un extra: en la Fase 1 todo vive sólo en este
// dispositivo y no hay sincronización. Hasta que llegue la Fase 2, exportar es
// la única red que hay, así que va en la primera versión.

import { iconos } from './iconos.js';
import { avisar, esc } from './dom.js';
import * as db from './db.js';
import * as estado from './estado.js';

const CLAVE_TEMA = 'tema';
let dialogo = null;

export async function aplicarTemaGuardado() {
  const tema = await db.leerAjuste(CLAVE_TEMA, 'sistema').catch(() => 'sistema');
  fijarTema(tema);
}

function fijarTema(tema) {
  if (tema === 'sistema') delete document.documentElement.dataset.tema;
  else document.documentElement.dataset.tema = tema;
}

function temaActual() {
  return document.documentElement.dataset.tema ?? 'sistema';
}

export function abrirAjustes() {
  if (!dialogo) {
    dialogo = document.createElement('dialog');
    dialogo.className = 'hoja';
    dialogo.setAttribute('aria-label', 'Ajustes');
    document.body.append(dialogo);
  }

  const almacen = estado.estado();
  const registros = almacen.registros.size;
  const tema = temaActual();

  dialogo.innerHTML = `
    <div class="hoja__cabecera">
      <button type="button" class="icono-btn" data-cerrar aria-label="Cerrar">${iconos.cerrar}</button>
      <h2 class="hoja__titulo">Ajustes</h2>
    </div>
    <div class="hoja__cuerpo">
      <fieldset class="campo" style="border:0;padding:0;margin-inline:0">
        <legend class="campo__etiqueta">Aspecto</legend>
        <div class="segmentado" data-grupo="tema">
          <button type="button" class="segmentado__op" data-valor="sistema" aria-pressed="${tema === 'sistema'}">Como el móvil</button>
          <button type="button" class="segmentado__op" data-valor="claro" aria-pressed="${tema === 'claro'}">Claro</button>
          <button type="button" class="segmentado__op" data-valor="oscuro" aria-pressed="${tema === 'oscuro'}">Oscuro</button>
        </div>
      </fieldset>

      <div class="campo">
        <span class="campo__etiqueta">Copia de seguridad</span>
        <p class="campo__pista" style="margin-top:0;margin-bottom:var(--e3)">
          Ahora mismo todo se guarda sólo en este dispositivo. Guarda una copia de vez en cuando:
          es un archivo que puedes volver a cargar aquí o en otro móvil.
        </p>
        <div class="grupo-h">
          <button type="button" class="btn btn--suave" data-exportar>Guardar una copia</button>
          <button type="button" class="btn btn--texto" data-importar>Cargar una copia</button>
        </div>
        <input type="file" accept="application/json,.json" id="archivo-copia" hidden>
      </div>

      <div class="campo">
        <span class="campo__etiqueta">Lo que hay guardado</span>
        <p class="campo__pista" style="margin-top:0">
          <span class="num">${almacen.actividades.length}</span> ${almacen.actividades.length === 1 ? 'actividad' : 'actividades'} ·
          <span class="num">${registros}</span> ${registros === 1 ? 'día apuntado' : 'días apuntados'}
        </p>
      </div>

      <div class="campo" style="margin-bottom:0">
        <span class="campo__etiqueta">Empezar de cero</span>
        <p class="campo__pista" style="margin-top:0;margin-bottom:var(--e3)">
          Borra los hábitos, las tareas y todo el historial. No se puede deshacer.
        </p>
        <button type="button" class="btn btn--peligro" data-borrar-todo>Borrarlo todo</button>
      </div>
    </div>`;

  dialogo.showModal();

  dialogo.addEventListener('click', async (evento) => {
    const boton = evento.target.closest('[data-grupo="tema"] button');
    if (boton) {
      for (const otro of dialogo.querySelectorAll('[data-grupo="tema"] button')) {
        otro.setAttribute('aria-pressed', otro === boton);
      }
      fijarTema(boton.dataset.valor);
      db.guardarAjuste(CLAVE_TEMA, boton.dataset.valor).catch(() => {});
      return;
    }

    if (evento.target.closest('[data-cerrar]')) { dialogo.close(); return; }

    if (evento.target.closest('[data-exportar]')) {
      const datos = await db.exportar();
      const url = URL.createObjectURL(new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json' }));
      const enlace = document.createElement('a');
      enlace.href = url;
      enlace.download = `copia-habitos-${datos.exportadoEn.slice(0, 10)}.json`;
      enlace.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      avisar('Copia guardada en tus descargas');
      return;
    }

    if (evento.target.closest('[data-importar]')) {
      dialogo.querySelector('#archivo-copia').click();
      return;
    }

    if (evento.target.closest('[data-borrar-todo]')) {
      const boton = evento.target.closest('[data-borrar-todo]');
      if (boton.dataset.seguro !== 'si') {
        boton.dataset.seguro = 'si';
        boton.textContent = 'Toca otra vez para confirmar';
        setTimeout(() => {
          if (!boton.isConnected) return;
          delete boton.dataset.seguro;
          boton.textContent = 'Borrarlo todo';
        }, 5000);
        return;
      }
      await estado.borrarTodo();
      dialogo.close();
      avisar('Todo borrado. Empiezas de cero.');
    }
  });

  dialogo.querySelector('#archivo-copia').addEventListener('change', async (evento) => {
    const archivo = evento.target.files?.[0];
    if (!archivo) return;
    try {
      await db.importar(JSON.parse(await archivo.text()));
      await estado.cargar();
      dialogo.close();
      avisar('Copia cargada');
    } catch (error) {
      avisar(`No se pudo cargar: ${esc(error.message)}`);
    }
  });
}
