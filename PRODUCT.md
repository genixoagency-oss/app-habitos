# PRODUCT.md

## Qué es

Una sola app que fusiona la agenda por bloques de tiempo, el seguimiento de hábitos y el temporizador de enfoque con bloqueo de apps. Más adelante, un diario.

El problema: hoy hay que meter las mismas cosas en tres apps distintas. Los hábitos se repiten solos pero no tienen hora concreta; las tareas tienen hora pero hay que escribirlas cada día. Nada vive en un solo sitio.

## Register

`product` — es una herramienta, la usuaria está en una tarea. El diseño sirve al producto, no al revés.

## Platform

`web` (PWA instalable). La app nativa iOS llega en la Fase 3, cuando el bloqueo de apps la hace obligatoria. Ver `RESEARCH.md` §5.

## Quién la usa y cuándo

Una persona sola, para sí misma. Tres momentos reales:

1. **7:00, en la cama, móvil en la mano, luz baja.** Mira qué toca hoy. 5 segundos.
2. **A lo largo del día, de refilón, en el ordenador mientras trabaja.** Marca algo hecho. 1 toque.
3. **23:00, antes de dormir.** Mira el círculo del día y el resumen. 20 segundos.

Ninguno de los tres es "sentarse a organizarse". La app tiene que desaparecer.

## Principios

1. **Minimalismo.** Anillos, números grandes, poco texto, mucho aire.
2. **Rapidez ante todo.** Marcar algo hecho: un toque. Crear un hábito: el mínimo de pasos.
3. **Nada se escribe dos veces.** Lo repetitivo se repite solo.
4. **Un solo timeline.** Todo lo del día en el mismo sitio, venga de donde venga.

## Decisión de arquitectura central

**Hábito y tarea no son dos entidades: son la misma con parámetros distintos.** Una sola entidad `Actividad`. Si `repeticion` es `ninguna` es una tarea suelta; cualquier otra cosa la convierte en hábito. El campo `padreId` da subtareas y hábitos dentro de hábitos.

**Corrección aportada en la investigación:** hace falta una segunda entidad, `Registro`, para el estado de una actividad **en un día concreto**. Sin ella no hay rachas, ni estado parcial, ni historial. `Actividad` = qué es. `Registro` = qué pasó ese día. Detalle en `RESEARCH.md` §7.

## Dirección visual

**Horario suizo, no app de hábitos.** El objeto central es el eje de tiempo vertical: una rejilla horaria con filetes finos, números tabulares, mucho aire. Más cerca de un horario de trenes bien impreso que de una cuadrícula de tarjetas de colores.

Lo que se rechaza a propósito, por ser el reflejo automático de la categoría:
- Cuadrícula de tarjetas redondeadas con icono + título + párrafo.
- Paleta pastel morado/menta de app de bienestar.
- Y también su contrario obvio: el dark mode brutalista monoespaciado.

**Color: Restrained.** Neutros con un punto de tinte hacia la marca, y un solo acento (rosa profundo, hue 340) reservado para tres cosas: la marca de "ahora", el relleno del anillo y la acción principal. Los colores de las actividades son datos, no decoración: paleta aparte, apagada, para distinguir unas de otras.

**Tema: claro por defecto**, oscuro siguiendo al sistema. La especificación pide "mucho espacio en blanco" y eso manda; el oscuro existe porque dos de los tres momentos de uso son con poca luz.

**Tipografía:** una sola familia (stack del sistema: SF Pro en Apple, Segoe en Windows). Números tabulares en las horas y en los contadores. Escala fija en rem, no fluida.

## Fases

1. **Núcleo** — modelo Actividad/Registro con jerarquía, timeline del día, crear hábitos con repetición/objetivo/bloque horario, marcar completado y parcial, círculo de progreso, persistencia local. ← *terminada*
2. **Continuidad** — sync, estadísticas completas, widgets, notificaciones.
3. **Enfoque** — temporizador con presets, registro de sesiones, bloqueo de apps (obliga a iOS nativo), App Intents.
4. **Salud** — HealthKit.
5. **Diario.**
6. **Social.**

## Fuera de alcance en Fase 1

Sync entre dispositivos, estadísticas anuales, widgets, notificaciones, temporizador, bloqueo de apps, salud, diario, social.
