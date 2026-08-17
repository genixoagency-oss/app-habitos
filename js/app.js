// app.js — arranque, pintado y gestos.

import { claveDia, sumarDias, bloqueEfectivo, aHora, Estado } from './modelo.js';
import * as estado from './estado.js';
import { pintarHoy, constantes } from './vista-hoy.js';
import { pintarHabitos } from './vista-habitos.js';
import { abrirEditor } from './editor.js';
import { abrirResumen } from './resumen.js';
import { abrirAjustes, aplicarTemaGuardado } from './ajustes.js';
import { $, avisar, esc } from './dom.js';
import { iconos } from './iconos.js';

const PX_MIN = constantes.PX_MIN;
const PASO = 5;                    // los bloques se ajustan de 5 en 5 minutos
const UMBRAL_ARRASTRE = 4;         // píxeles antes de considerar que se arrastra

const lienzo = $('#lienzo');
const barra = $('#barra');
let acabaDeArrastrar = false;

// ── Pintado ──────────────────────────────────────────────────────────────────

function pintarBarra(almacen) {
  const pestanas = [
    { id: 'hoy', texto: 'Hoy', icono: 'hoy' },
    { id: 'habitos', texto: 'Hábitos', icono: 'habitos' },
  ];
  barra.innerHTML = pestanas.map((p) => `
    <button type="button" class="barra__btn" data-accion="vista" data-vista="${p.id}"
      ${almacen.vista === p.id ? 'aria-current="page"' : ''}>${iconos[p.icono]}<span>${p.texto}</span></button>`).join('');
}

function pintar() {
  const almacen = estado.estado();
  if (!almacen.listo) return;

  // Conservar el sitio: ni el desplazamiento ni el foco deben saltar al marcar algo.
  const scroll = lienzo.scrollTop;
  const activo = document.activeElement;
  const huella = activo?.dataset?.accion ? `${activo.dataset.accion}|${activo.dataset.id ?? ''}` : null;

  lienzo.innerHTML = almacen.vista === 'habitos' ? pintarHabitos(almacen) : pintarHoy(almacen);
  pintarBarra(almacen);

  lienzo.scrollTop = scroll;
  if (huella) {
    const [accion, id] = huella.split('|');
    const destino = lienzo.querySelector(`[data-accion="${accion}"]${id ? `[data-id="${CSS.escape(id)}"]` : ''}`);
    destino?.focus({ preventScroll: true });
  }

  if (almacen.errorAlmacen && !almacen.errorAvisado) {
    almacen.errorAvisado = true;
    avisar(almacen.errorAlmacen);
  }
}

// ── Acciones ─────────────────────────────────────────────────────────────────

function alPulsar(evento) {
  const objetivo = evento.target.closest('[data-accion]');
  if (!objetivo) return;
  if (acabaDeArrastrar) { acabaDeArrastrar = false; return; }

  const { accion, id } = objetivo.dataset;
  const almacen = estado.estado();

  switch (accion) {
    case 'tocar': {
      const reg = estado.tocar(id);
      const a = estado.actividad(id);
      if (reg?.estado === Estado.SALTADA) {
        avisar(`«${a.nombre}» marcado como saltado`, { texto: 'Deshacer', hacer: () => estado.fijarEstado(id, Estado.COMPLETADA) });
      }
      break;
    }
    case 'abrir':
      abrirEditor(estado.actividad(id) ?? {});
      break;
    case 'nueva':
      // Desde el día, lo normal es una tarea suelta; desde Hábitos, un hábito.
      // Acertar el valor por defecto ahorra un toque en el caso frecuente.
      abrirEditor(
        almacen.vista === 'habitos'
          ? { fechaInicio: almacen.dia, repeticion: { tipo: 'diaria' } }
          : { fechaInicio: almacen.dia },
        () => avisar('Actividad creada'),
      );
      break;
    case 'dia':
      estado.irADia(sumarDias(almacen.dia, Number(objetivo.dataset.paso)));
      break;
    case 'ir-hoy':
      estado.irADia(claveDia());
      break;
    case 'vista':
      estado.irAVista(objetivo.dataset.vista);
      break;
    case 'resumen':
      abrirResumen();
      break;
    case 'ajustes':
      abrirAjustes();
      break;
    case 'ejemplo':
      estado.ejemplo();
      avisar('Día de ejemplo cargado. Puedes borrarlo todo cuando quieras.');
      break;
    default:
      break;
  }
}

// ── Arrastrar y estirar bloques ──────────────────────────────────────────────

function activarGestos() {
  let g = null;

  lienzo.addEventListener('pointerdown', (evento) => {
    if (evento.button !== 0 && evento.pointerType === 'mouse') return;
    const bloque = evento.target.closest('.bloque');
    if (!bloque || evento.target.closest('.marca-check')) return;

    const eje = bloque.closest('.eje');
    if (!eje) return;

    g = {
      bloque,
      id: bloque.dataset.id,
      estirando: Boolean(evento.target.closest('.bloque__tirador')),
      y0: evento.clientY,
      arriba0: parseFloat(bloque.style.top),
      alto0: parseFloat(bloque.style.height),
      desde: Number(eje.dataset.desde),
      hasta: Number(eje.dataset.hasta),
      movido: false,
    };
    bloque.setPointerCapture(evento.pointerId);
  });

  lienzo.addEventListener('pointermove', (evento) => {
    if (!g) return;
    const dy = evento.clientY - g.y0;
    if (!g.movido && Math.abs(dy) < UMBRAL_ARRASTRE) return;

    if (!g.movido) {
      g.movido = true;
      g.bloque.dataset.arrastrando = 'si';
    }
    evento.preventDefault();

    const pasoPx = PASO * PX_MIN;
    const salto = Math.round(dy / pasoPx) * pasoPx;

    if (g.estirando) {
      g.bloque.style.height = `${Math.max(PASO * PX_MIN, g.alto0 + salto)}px`;
    } else {
      const maximo = (g.hasta - g.desde) * PX_MIN - g.alto0;
      g.bloque.style.top = `${Math.max(0, Math.min(maximo, g.arriba0 + salto))}px`;
    }
  });

  const soltar = () => {
    if (!g) return;
    const actual = g;
    g = null;
    delete actual.bloque.dataset.arrastrando;
    if (!actual.movido) return;

    acabaDeArrastrar = true;
    setTimeout(() => { acabaDeArrastrar = false; }, 0);

    const inicio = actual.desde + parseFloat(actual.bloque.style.top) / PX_MIN;
    const duracion = parseFloat(actual.bloque.style.height) / PX_MIN;
    aplicarBloque(actual.id, inicio, duracion);
  };

  lienzo.addEventListener('pointerup', soltar);
  lienzo.addEventListener('pointercancel', soltar);
}

function aplicarBloque(id, inicioBruto, duracionBruta) {
  const a = estado.actividad(id);
  if (!a) return;
  const inicio = Math.round(inicioBruto / PASO) * PASO;
  const duracion = Math.max(PASO, Math.round(duracionBruta / PASO) * PASO);
  const antes = bloqueEfectivo(a, estado.registro(id));

  estado.moverBloque(id, inicio, inicio + duracion);
  avisar(`${esc(a.nombre)}: ${aHora(inicio)}–${aHora(inicio + duracion)}`, {
    texto: 'Deshacer',
    hacer: () => (antes && a.bloque && antes.inicio === a.bloque.inicio
      ? estado.restaurarBloque(id)
      : estado.moverBloque(id, antes.inicio, antes.fin)),
  });
}

/** Teclado: Alt + flechas mueve el bloque; sobre el tirador, las flechas lo estiran. */
function activarTeclado() {
  lienzo.addEventListener('keydown', (evento) => {
    if (evento.key !== 'ArrowUp' && evento.key !== 'ArrowDown') return;
    const objetivo = evento.target.closest('[data-accion="estirar"], [data-accion="abrir"]');
    if (!objetivo) return;

    const estirando = objetivo.dataset.accion === 'estirar';
    if (!estirando && !evento.altKey) return;

    const a = estado.actividad(objetivo.dataset.id);
    const b = a && bloqueEfectivo(a, estado.registro(a.id));
    if (!b) return;

    evento.preventDefault();
    const delta = evento.key === 'ArrowUp' ? -PASO : PASO;
    if (estirando) {
      aplicarBloque(a.id, b.inicio, Math.max(PASO, b.fin - b.inicio + delta));
    } else {
      aplicarBloque(a.id, Math.max(0, b.inicio + delta), b.fin - b.inicio);
    }
  });
}

/** Flechas izquierda/derecha cambian de día cuando no se está escribiendo. */
function activarAtajos() {
  document.addEventListener('keydown', (evento) => {
    if (evento.target.closest('input, textarea, select, dialog')) return;
    if (evento.metaKey || evento.ctrlKey || evento.altKey) return;
    const almacen = estado.estado();
    if (almacen.vista !== 'hoy') return;

    if (evento.key === 'ArrowLeft') estado.irADia(sumarDias(almacen.dia, -1));
    else if (evento.key === 'ArrowRight') estado.irADia(sumarDias(almacen.dia, 1));
    else if (evento.key === 't' || evento.key === 'T') estado.irADia(claveDia());
    else if (evento.key === 'n' || evento.key === 'N') abrirEditor({ fechaInicio: almacen.dia });
  });
}

// ── Arranque ─────────────────────────────────────────────────────────────────

async function arrancar() {
  estado.suscribir(pintar);
  document.addEventListener('click', alPulsar);
  activarGestos();
  activarTeclado();
  activarAtajos();

  await aplicarTemaGuardado();
  await estado.cargar();

  // La marca de "ahora" tiene que ir sola: si no, mentiría.
  setInterval(() => {
    const almacen = estado.estado();
    if (almacen.vista === 'hoy' && almacen.dia === claveDia()) pintar();
  }, 60000);

  // Al volver a la app tras un rato, puede que ya sea otro día.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') pintar();
  });

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* Sin service worker la app funciona igual, sólo que no sin conexión. */
    });
  }
}

arrancar();
