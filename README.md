# Hoy — hábitos, tareas y enfoque

Fase 1 terminada. Web instalable (PWA) que funciona en el PC, en el iPad y en el iPhone.

**En marcha:** https://genixoagency-oss.github.io/app-habitos/

---

## Cómo ponerla en el iPhone y el iPad

1. Abre esa dirección **en Safari** (en iOS sólo Safari puede instalar).
2. Toca el botón de compartir (el cuadrado con la flecha hacia arriba).
3. **Añadir a pantalla de inicio.**

Queda con su icono, a pantalla completa y funcionando sin conexión.

## Cómo abrirla en el ordenador

Basta con abrir la dirección de arriba en el navegador. Para trabajar sobre el
código en local:

```
python -m http.server 8080
```

y abrir **http://127.0.0.1:8080**

> No vale con hacer doble clic en `index.html`. El navegador bloquea este tipo
> de apps cuando se abren como archivo suelto; hace falta el servidor.

---

## Qué hace ya

- **Timeline del día.** El día en vertical, cada bloque tan alto como dura, con
  la marca de "ahora" y los huecos libres a la vista.
- **Arrastrar y estirar.** Mueve un bloque con el dedo o el ratón; el tirador de
  abajo cambia la duración. Se ajusta de 5 en 5 minutos. **Sólo cambia ese día:
  el hábito conserva su hora.**
- **Hábitos con repetición**: cada día, días concretos de la semana, o X veces
  por semana (aparece hasta que cumples el cupo y se retira).
- **Objetivos con cuenta** (skincare 2 de 2, leer 20 páginas). Cada toque suma uno.
- **Un toque marca.** Sin objetivo: pendiente → hecho → saltado → pendiente.
- **Jerarquía.** Una actividad puede ir dentro de otra, con su propia repetición
  y su propio objetivo: un hábito dentro de un hábito.
- **Círculo de progreso.** Tócalo y se abre el resumen del día.
- **Resumen del día**, separando hábitos de tareas sueltas, con el recuento general.
- **Rachas** por hábito, en la pantalla de Hábitos.
- **Se guarda solo** en el dispositivo, y funciona sin conexión.
- **Copia de seguridad**: exportar e importar desde Ajustes.
- Modo claro y oscuro. Teclado: `←` `→` cambian de día, `T` vuelve a hoy, `N` crea.

## Decisiones que conviene conocer

- **Saltar algo no baja el porcentaje.** Si marcas algo como saltado sale de la
  cuenta del día. Castigar por ser honesta haría que dejaras de serlo.
- **El círculo mide la constancia, no los recados.** Si el día tiene hábitos, el
  anillo sólo los mide a ellos. Las tareas sueltas van aparte en el resumen. Si
  el día sólo tiene recados, entonces sí los mide, para no enseñar un 0 falso.
- **Un padre no puntúa aparte.** Su progreso es el de sus hijas, para no contar
  lo mismo dos veces.
- **Borrar conserva el historial.** Si una actividad tiene días apuntados no se
  borra: se archiva. Borrarla se llevaría por delante rachas y estadísticas.

## Qué falta

Fases 2 a 6 de la especificación. Lo siguiente sería la Fase 2: sincronizar
entre dispositivos, estadísticas completas (mensual y anual), widgets y avisos.

El bloqueo de apps (Fase 3) y Salud (Fase 4) **no se pueden hacer desde la web**:
exigen la app nativa de iPhone, y para eso hace falta un Mac. Está todo
explicado en `RESEARCH.md`.

---

## Para quien toque el código

```
index.html              la página
manifest.webmanifest    para poder instalarla
sw.js                   funcionamiento sin conexión
css/app.css             todo el sistema visual
js/modelo.js            entidades Actividad y Registro. Lógica pura
js/repeticion.js        qué toca cada día, huecos, carriles
js/progreso.js          círculo, resumen, rachas, tasas
js/db.js                IndexedDB
js/estado.js            almacén en memoria y su puente con disco
js/dom.js               utilidades de pintado y formato en español
js/iconos.js            juego de iconos de interfaz
js/vista-hoy.js         el timeline
js/vista-habitos.js     la lista de hábitos
js/editor.js            crear y editar
js/resumen.js           el resumen del día
js/ajustes.js           tema, copia de seguridad, borrado
tests/                  70 tests de la lógica
herramientas/iconos.py  genera los PNG del icono
```

Pasar los tests:

```
npm test
```

(o directamente `node --test "tests/**/*.test.js"`)

No hay paso de compilación ni dependencias. Es JavaScript de módulos nativo.

**Los iconos PNG no están en el repositorio**: los genera `herramientas/iconos.py`
al publicar. Para tenerlos en local, ejecuta `python herramientas/iconos.py`.

**Publicación.** Cada cambio en `main` dispara `.github/workflows/publicar.yml`,
que pasa los tests, genera los iconos y publica en GitHub Pages. Si los tests
fallan, no se publica nada.

**Importante para el futuro:** el modelo de datos ya cumple las reglas de
CloudKit (identificadores UUID, campos con valor por defecto, sin unicidad
impuesta, orden en un campo explícito). Cuando toque hacer la app nativa, pasar
a SwiftData será traducir, no rediseñar. Las reglas están en `RESEARCH.md` §6.
