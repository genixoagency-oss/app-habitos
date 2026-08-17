# RESEARCH.md

Investigación previa a escribir código. App de hábitos + tareas + enfoque (iOS, SwiftUI).

Fecha: 17-08-2026
Estado: investigación cerrada. Decisión de entorno resuelta (ver §5 y §10).

---

## 0. Resumen en una página

Lo que la investigación confirma:

1. **El bloqueo de apps es viable y ScreenZen no usa ninguna magia.** Usa la Screen Time API de Apple (FamilyControls + ManagedSettings + DeviceActivity), la misma que está disponible para cualquiera. Es replicable.
2. **Pero hay un trámite con Apple que hay que empezar YA.** El bloqueo funciona en desarrollo sin permiso, pero **no se puede subir ni a TestFlight** hasta que Apple apruebe el entitlement de distribución. Tarda de 4 días a varias semanas.
3. **Confirmado lo que temíamos: una app de terceros NO puede activar un Modo de Concentración del sistema.** La API es de solo lectura. La única vía es Atajos/App Intents, como decía la especificación. Diseño validado.
4. **CloudKit impone reglas duras al modelo de datos que hay que respetar desde la primera línea.** Si el modelo de la Fase 1 no las cumple, la Fase 2 (sync) obliga a rehacerlo entero. Detalle en §6.
5. **La especificación tiene un hueco real de arquitectura**: falta separar la *definición* de una actividad de sus *ocurrencias* diarias. Sin eso no hay rachas, ni estado parcial, ni estadísticas. Propuesta en §7. **Esto es lo más importante de todo el documento.**
6. **El stack se reparte en dos etapas**, no cambia. Justificación en §5.

---

## 1. Bloqueo de apps en iOS — la Screen Time API

### 1.1 Los tres frameworks

| Framework | Para qué sirve |
|---|---|
| `FamilyControls` | Pedir permiso al usuario y mostrar el selector de apps del sistema (`FamilyActivityPicker`). Devuelve un `FamilyActivitySelection`. |
| `ManagedSettings` | Aplicar la restricción de verdad. Un `ManagedSettingsStore` con `store.shield.applications = tokens`. Poner a `nil` para desbloquear. |
| `DeviceActivity` | Programar cuándo se aplica (`DeviceActivitySchedule` con hora inicio/fin) y reaccionar a eventos vía una extensión `DeviceActivityMonitor`. |

Cómo encajan: cuando llamas a `DeviceActivityCenter().startMonitoring(nombre, during: horario)`, el sistema busca el `ManagedSettingsStore` que tenga **ese mismo nombre** y aplica sus reglas durante ese intervalo.

Autorización: `try await AuthorizationCenter.shared.requestAuthorization(for: .individual)` — `.individual` es el modo correcto para nuestro caso (adulto que se bloquea a sí mismo, sin Family Sharing de por medio). Sí, **un adulto puede bloquearse sus propias apps**; no hace falta que sea un control parental.

### 1.2 El entitlement — plan de acción

Hay **dos** permisos distintos y esto es la clave de toda la planificación:

- **Family Controls (Development)** — aparece en Xcode si tienes cuenta de desarrollador de pago. **Funciona en el momento, sin pedir nada a Apple.** Con esto se puede construir y probar toda la Fase 3 en un iPhone real.
- **Family Controls (Distribution)** — hay que solicitarlo a Apple por formulario, explicando el caso de uso. **Sin esto no se puede subir ni siquiera a TestFlight.**

Qué mandar en la solicitud: el bundle ID de la app **y un bundle ID por cada extensión** (DeviceActivityMonitor, ShieldConfiguration, ShieldAction...). Cada una necesita su propia solicitud. Plazo real reportado por otros desarrolladores: de 4 días laborables a varias semanas.

Apple valora que: el propósito central de la app requiera de verdad esta funcionalidad, que encaje en "bienestar digital / control parental", y que **no** se usen los datos de uso para publicidad o perfilado. Nuestro caso encaja bien.

> **Decisión:** empezar el trámite en cuanto exista el bundle ID, aunque el código de la Fase 3 no esté escrito. No cuesta nada y el reloj corre.

Aviso adicional encontrado en los foros: Apple exige **Family Sharing activado** para cualquier uso del entitlement, incluso sin compras dentro de la app.

### 1.3 Lo que NO se puede hacer (y hay que asumir en el diseño)

Confirmado. Esto no son opiniones, son limitaciones de la plataforma:

1. **La app nunca sabe qué apps ha elegido el usuario.** El selector devuelve *tokens* opacos (`ApplicationToken`, `CategoryToken`, `WebDomainToken`). No hay nombre, no hay icono accesible, no hay bundle ID. → **La interfaz no puede mostrar "Bloqueadas: Instagram, TikTok".** Como mucho: "5 apps y 2 categorías bloqueadas", y un botón que reabre el selector del sistema.
2. **No se puede abrir la app bloqueada desde su token** (FB15500695). No hay API para lanzarla.
3. **La pantalla de bloqueo (shield) solo admite 3 acciones**: `.none`, `.close`, `.defer`. **No se puede abrir nuestra app desde el shield** (FB15079668). El apaño habitual es una notificación local, que es poco fiable.
4. **Los tokens que llegan al shield son inestables** (FB14082790): iOS a veces entrega tokens nuevos, y la extensión no sabe *qué* regla ha disparado el bloqueo. Hay que diseñar el shield para que funcione sin ese contexto.
5. **Al mover apps entre `ManagedSettingsStore`s, la interfaz del shield no se actualiza** (FB14237883). → Conclusión práctica: **usar un solo store por perfil de enfoque y no mover tokens entre stores.**
6. **El permiso no se puede proteger con código.** El usuario puede revocarlo con un simple interruptor, aunque tenga el Screen Time del sistema bloqueado con contraseña (FB18794535). Es el agujero de fuga y no lo podemos tapar.
7. **La extensión `DeviceActivityMonitor` tiene un límite de 6 MB de memoria.** Es muy poco y no se puede ampliar. Si se pasa, iOS la mata y los eventos se acumulan y llegan todos de golpe. → **La extensión debe ser mínima**: nada de SwiftData ni de modelos pesados dentro. Solo leer un `UserDefaults` de App Group, aplicar el shield, y salir.

### 1.4 Cómo lo hace ScreenZen (el modelo a replicar)

- **iOS**: Screen Time API + permisos de Atajos. Nada más. Confirmado que es exactamente nuestra vía.
- **Android**: es otra historia — usa el *Accessibility Service*, "dibujar sobre otras apps", acceso a uso de datos e ignorar el ahorro de batería. Cuatro permisos delicados. Relevante solo para la fase Android.
- **La idea de producto que sí merece copiarse**: ScreenZen no bloquea en seco, **mete una pausa** antes de abrir la app. Ataca el impulso, no el acceso. Y ofrece tres niveles: pausa esquivable, desbloqueo con gesto físico deliberado, y bloqueo total no esquivable en franjas programadas.

> **Decisión de producto:** copiar los tres niveles. Encajan de forma natural con nuestros perfiles de enfoque por actividad.

---

## 2. Modos de Concentración — confirmado que no

- `INFocusStatusCenter` es **solo lectura**: `.authorizationStatus` y `.focusStatus.isFocused`. Y encima está restringido a apps con la capacidad *Communication Notifications* (apps de comunicación).
- **No existe API para activar o desactivar un Modo de Concentración.** Preguntado repetidamente en los foros de Apple, respuesta siempre negativa.
- `SetFocusFilterIntent` va **al revés** de lo que a veces se supone: es para que *nuestra app reaccione* cuando el usuario activa un Modo (ej. "en modo Trabajo, el diario muestra solo entradas de trabajo"). No lo enciende. Nota: hubo una regresión en iOS 18 donde su `perform()` no se llamaba — comprobar que esté arreglado antes de apoyarse en ello.

> **Conclusión:** la especificación acertaba. La vía es **exponer App Intents desde el principio** para que la usuaria se monte en Atajos: "cuando empiece sesión de enfoque → activa Modo Trabajo". Bloquear llamadas o mensajes de personas concretas sigue siendo imposible para terceros.

---

## 3. App Intents — lo que sí se puede

Framework `AppIntents` (iOS 16+). Es la base de Siri, Spotlight, widgets interactivos y el Botón de Acción.

Intents que la app debe exponer desde la Fase 1 (aunque el enfoque llegue en la Fase 3):

- `MarcarActividadCompletada(actividad:)`
- `IniciarSesionEnfoque(actividad:, preset:)` / `TerminarSesionEnfoque()`
- `AñadirTareaHoy(nombre:, hora:)`
- `ObtenerProgresoDelDia()` → devuelve el % del círculo

Ventaja secundaria: los widgets interactivos (marcar un hábito desde la pantalla de inicio, §4.5 de la especificación) se construyen **con App Intents**. O sea, no es trabajo extra: es el mismo trabajo que ya hay que hacer para los widgets.

---

## 4. Referencias de producto

### Structured — el timeline
- Día en vertical, de la mañana a la noche. Cada cosa es un bloque de color **proporcional a su duración** (30 min ocupa la mitad que 1 h).
- Se ve el día entero de un vistazo, se arrastran los bloques y **se ven los huecos libres**.
- Tres orígenes conviviendo en el mismo timeline: tareas recurrentes (en color distinto), eventos de calendario importados, y tareas añadidas a mano.
- Sincroniza con Apple Calendar y Google Calendar.

> **Nota para nosotros:** la importación de calendario (EventKit) no está en la especificación pero es barata y es la mitad del valor de Structured. Candidata clara a Fase 2.

### Focus To-Do — el temporizador
- Pomodoro clásico, **temporizador vinculado a una tarea concreta**.
- Detalle bueno: se **estima** cuántos pomodoros va a costar una tarea, y luego se compara con los reales. Es una función de producto valiosa y casi gratis de implementar sobre el registro de sesiones que ya vamos a tener.
- Ruido blanco integrado.
- Informes: tiempo total de enfoque, distribución por proyecto, tendencias, vista de calendario diaria/semanal/mensual.

### Avid — los hábitos
No he podido encontrar documentación ni reseñas detalladas de esta app en concreto (búsquedas sin resultados fiables; se confunde con otras). **La descripción de la especificación es la fuente de verdad** para Avid, y es lo bastante detallada para trabajar con ella: icono, nombre, color, grupo, tipo construir/dejar, período y valor objetivo, días de la semana, recordatorios, alarma, gráficas, fecha inicio/fin; y estadísticas con círculo, % mensual, mejores rachas, días perfectos, promedio diario, vistas semanal/mensual/anual.

Lo que sí confirmé como estándar del sector y conviene tener: objetivos con **unidad** (minutos, vasos, veces) y no solo casilla; frecuencias tipo "3 veces por semana" además de diarias; cuadrícula de historial con color por intensidad.

**El fallo de Avid que justifica este proyecto queda confirmado**: los trackers de hábitos trabajan con franjas difusas (mañana/tarde/noche), no con horas concretas en un timeline. Ahí está el hueco de mercado.

### Journal (Apple) — Fase 5
Pendiente de confirmar con la usuaria si se refiere a la app Journal de Apple o a otra (§10 de la especificación). No se investiga en profundidad hasta la Fase 5. Solo se anota lo que condiciona el modelo de datos: entrada ligada a **un día**, con estado de ánimo, audios, fotos/vídeos, ubicaciones y logros importados de los hábitos.

---

## 5. Stack — cambio justificado (dos etapas)

La especificación pide justificar en este documento cualquier cambio de stack. Aquí está.

### 5.1 El requisito que lo fuerza

Requisito añadido por la usuaria el 17-08-2026: **la app tiene que poder usarse desde ya en tres sitios — el PC con Windows, un iPad y un iPhone.**

Una app nativa iOS no se puede usar en Windows. No es una dificultad, es imposible por diseño de la plataforma. Y una app nativa iOS tampoco se puede compilar sin un Mac. El requisito y "iOS nativo desde el minuto uno" son incompatibles.

### 5.2 Decisión: dos etapas, no un cambio de stack

**No se abandona iOS nativo. Se pospone.** El reparto se hace por lo que cada tecnología puede hacer de verdad:

| Fase | Qué necesita | Dónde va |
|---|---|---|
| 1 — Núcleo (timeline, hábitos, círculo, local) | Nada nativo | **Web (PWA)** |
| 2 — Sync, estadísticas, widgets, notificaciones | Widgets sí son nativos; el resto no | Web + los widgets esperan |
| 3 — Bloqueo de apps | **Screen Time API. Imposible en web.** | **iOS nativo, obligatorio** |
| 4 — Salud | HealthKit. Imposible en web. | **iOS nativo, obligatorio** |
| 5 — Diario | Se puede hacer en web salvo Face ID | Cualquiera |

La conclusión importante: **las fases 1 y 2 no usan ni una sola API nativa.** El timeline, la jerarquía de actividades, las repeticiones, las rachas, el círculo de progreso y el resumen del día son lógica pura. Hacerlos primero en web no es una concesión técnica: es exactamente el mismo trabajo, y encima se puede usar hoy en los tres dispositivos.

Lo que sí es innegociable: **el bloqueo de apps nunca funcionará desde la web.** Cuando llegue la Fase 3 habrá que hacer la app nativa. Eso no cambia.

### 5.3 Etapa 1 — Web instalable (PWA)

- HTML + CSS + JavaScript sin framework ni paso de compilación. Motivo: menos piezas, menos que se rompa, y arranca en cualquier sitio.
- Persistencia con **IndexedDB**. Coincide con lo que ya pedía la Fase 1 de la especificación ("persistencia local", sin sync).
- `manifest.json` + Service Worker → en iPhone y iPad se añade a la pantalla de inicio y queda con icono propio, a pantalla completa y funcionando sin internet.
- Alojada en HTTPS (GitHub Pages) — requisito para poder instalarla en los dispositivos Apple.

**Modelo de datos diseñado desde el principio para migrar a SwiftData**: se aplican igualmente las reglas de CloudKit de §6 (identificadores UUID, campos opcionales o con valor por defecto, sin unicidad impuesta, orden en un campo `orden` y no implícito). Así la migración es una traducción, no un rediseño.

### 5.4 Etapa 2 — iOS nativo

Sin cambios respecto a la especificación: SwiftUI + SwiftData + CloudKit. Las cuatro funciones críticas siguen siendo API nativa de Apple y en multiplataforma la Screen Time API directamente no existe. Confirmado, no hay alternativa.

| Fase | Frameworks |
|---|---|
| 1 | SwiftUI, SwiftData |
| 2 | CloudKit, WidgetKit, UserNotifications, (EventKit) |
| 3 | AppIntents, FamilyControls, ManagedSettings, DeviceActivity, ActivityKit (Live Activity del temporizador) |
| 4 | HealthKit |
| 5 | PhotosUI, AVFoundation, MapKit, LocalAuthentication |

Requisitos para arrancarla, cuando toque: un Mac con Xcode, cuenta de desarrollador de Apple de pago (99 €/año) y un iPhone físico — la Screen Time API **no funciona en el simulador**.

---

## 6. SwiftData + CloudKit — reglas que condicionan la Fase 1

**Esto es lo que hay que respetar desde la primera línea de código, aunque el sync no llegue hasta la Fase 2.** Si el modelo no las cumple, la Fase 2 obliga a rehacerlo todo.

Reglas duras:

1. **Nada de `@Attribute(.unique)`.** CloudKit no sabe hacer comprobaciones de unicidad atómicas entre dispositivos. La unicidad se gestiona a mano.
2. **Toda propiedad debe ser opcional o tener valor por defecto.** CloudKit sincroniza datos parciales.
3. **Toda relación debe ser opcional.**
4. **Toda relación necesita su inversa declarada.**
5. **Prohibida la regla de borrado `.deny`.**
6. **Las relaciones no pueden ser ordenadas** (`.ordered`). → Si hace falta orden (subtareas, orden dentro del día), se guarda un campo `orden: Int` y se ordena en código.
7. **Una vez publicada: solo añadir.** No borrar entidades ni campos, no renombrar (CloudKit lo lee como borrar + crear), no cambiar tipos. Lo que se retire se deja marcado como obsoleto pero presente.

**Riesgo señalado — la relación padre/hijos que se refiere a sí misma.** Es exactamente el punto donde SwiftData + CloudKit da más problemas históricamente. Mitigación:

- Declarar las dos puntas explícitamente y opcionales: `var padre: Actividad?` y `@Relationship(deleteRule: .cascade, inverse: \Actividad.padre) var hijos: [Actividad]?`
- **Limitar la anidación a 2 niveles** (padre → hijo). La especificación no necesita más ("dentro del hábito Trabajar, el hábito llamar a 10 personas") y anidación infinita multiplica los casos raros sin aportar nada.
- Guardar además `profundidad: Int` para poder consultar sin recorrer el árbol.
- Prueba automatizada específica de esta relación antes de cerrar la Fase 1.

---

## 7. El hueco de la especificación: definición ≠ ocurrencia

**Este es el hallazgo más importante para la Fase 1.**

La especificación pone `estado: pendiente | en curso | completada | parcial | saltada` dentro de `Actividad`. Eso no puede funcionar: un hábito diario es **una** definición pero tiene **un estado por cada día**. Si el estado vive en la Actividad, mañana se pierde el de hoy — y sin historial no hay rachas, ni % mensual, ni días perfectos, ni círculo de progreso de un día pasado. Se caen las secciones 4.3 y 4.4 enteras.

Hacen falta **dos** entidades, no una:

```
Actividad            ← la DEFINICIÓN (lo que la especificación describe)
  · nombre, icono, color, grupo
  · tipo, repetición, objetivo
  · bloque horario "plantilla" (8:00–8:20)
  · padre / hijos
  · fechaInicio, fechaFin
  · configuración de enfoque

Registro             ← la OCURRENCIA de esa actividad EN UN DÍA
  · actividad  →  Actividad
  · fecha (el día, normalizado a medianoche)
  · estado: pendiente | enCurso | completada | parcial | saltada
  · valorLogrado: 1 de 2
  · inicioReal / finReal      ← si ese día se movió el bloque, se guarda aquí
  · sesionesDeEnfoque: [Sesión]
```

Esto **no contradice** la decisión central de la especificación (hábito y tarea son la misma entidad). La `Actividad` sigue siendo una sola cosa. Solo se separa "qué es" de "qué pasó ese día".

Consecuencias, todas buenas:

- Una tarea suelta (repetición = ninguna) es simplemente una Actividad con **un solo** Registro.
- Mover un bloque en el timeline de hoy no cambia el hábito para siempre: modifica el Registro de hoy.
- El **estado parcial** ya tiene dónde vivir, y con él el resumen del día (§4.4).
- Las rachas se calculan recorriendo Registros. La separación que pide la especificación entre "hábitos recurrentes" y "tareas no diarias" sale sola: se filtra por `repetición == ninguna`, y las tareas sueltas **no ensucian la racha**.
- El círculo de progreso de cualquier día pasado se puede recalcular.

**Generación de registros:** no se crean por adelantado hasta el infinito. Se generan **al vuelo, solo para el día que se está mirando** (y se persisten en cuanto se toca algo). Un día que nunca se abrió y nunca se tocó no ocupa nada.

---

## 8. Otras decisiones que salen de la investigación

- **Un `ManagedSettingsStore` por perfil de enfoque, con nombre fijo.** No mover tokens entre stores (bug FB14237883).
- **La extensión DeviceActivityMonitor, mínima.** Nada de SwiftData dentro. Comunicación con la app por App Group + `UserDefaults` (los `FamilyActivitySelection` son `Codable`, así que se guardan sin problema). Límite: 6 MB.
- **La pantalla de bloqueo no puede volver a nuestra app.** Diseñarla como pantalla final: mensaje, tiempo restante, y ya. Nada de "toca aquí para volver al temporizador".
- **La interfaz de selección de apps se diseña contando con que no sabemos qué apps son.** Nunca listar nombres. Mostrar recuentos y el botón del selector del sistema.
- **Live Activity para el temporizador** (ActivityKit) — es la forma correcta de tener el pomodoro en la pantalla bloqueada y la Isla Dinámica. Fase 3.
- **Pausa antes que bloqueo** (idea de ScreenZen), con tres niveles de dureza.
- **Estimación de pomodoros por tarea** (idea de Focus To-Do), casi gratis.
- **Importar calendario con EventKit** — candidata fuerte para la Fase 2.

---

## 9. Riesgos

| Riesgo | Gravedad | Mitigación |
|---|---|---|
| Apple deniega o retrasa el entitlement de distribución | Alta si se publica | Pedirlo ya. La Fase 3 funciona en desarrollo mientras tanto. Fases 1, 2, 4 y 5 no dependen de él. |
| Relación padre/hijos + CloudKit da problemas | Alta | Limitar a 2 niveles, relaciones opcionales con inversa, test dedicado en Fase 1. |
| Modelo de datos mal cerrado en Fase 1 → rehacer en Fase 2 | Alta | Aplicar todas las reglas de §6 desde el minuto uno, aunque el sync no exista todavía. |
| Extensión de 6 MB se queda corta | Media | Extensión mínima por diseño desde el principio. |
| Bugs conocidos del shield (tokens inestables) | Media | Diseño que no dependa del contexto del token. |
| La usuaria puede revocar el permiso con un interruptor | Baja | No se puede tapar. Es una app para uno mismo, no un control parental. |
| Fase 5 (Diario) es casi una segunda app | Media | Ya está aparcada en la especificación. Correcto. Solo se deja el modelo abierto. |

---

## 10. Entorno — resuelto

**Una app iOS nativa solo se puede compilar, ejecutar y probar en un Mac con Xcode.** Este equipo es Windows 10, y la usuaria necesita usar la app desde ya en el PC, en un iPad y en un iPhone.

**Resuelto el 17-08-2026:** se construye primero la versión web instalable (PWA), que sí funciona en los tres dispositivos y cubre las Fases 1 y 2 sin perder nada. La app nativa iOS se hace cuando toque la Fase 3, que es la primera que la exige de verdad. Justificación completa en §5.

Ventaja secundaria: el método de trabajo que pide la especificación ("implementa → compila → ejecuta los tests → corrige → repite hasta verde") **sí se puede ejecutar** sobre la versión web desde este equipo. En Swift no se podía.

Pendiente para el futuro, sin prisa:
- Mac con Xcode.
- Cuenta de desarrollador de Apple de pago (99 €/año) — necesaria incluso para el Family Controls (Development).
- Un iPhone físico. La Screen Time API **no funciona en el simulador**.
- Iniciar la solicitud del entitlement de distribución en cuanto exista el bundle ID (§1.2).

---

## Fuentes

- [Requesting the Family Controls entitlement — Apple](https://developer.apple.com/documentation/familycontrols/requesting-the-family-controls-entitlement)
- [Configuring Family Controls — Apple](https://developer.apple.com/documentation/xcode/configuring-family-controls)
- [Meet the Screen Time API — WWDC21](https://developer.apple.com/videos/play/wwdc2021/10123/)
- [What's new in Screen Time API — WWDC22](https://developer.apple.com/videos/play/wwdc2022/110336/)
- [A Developer's Guide to Apple's Screen Time APIs — Julius Brussee](https://medium.com/@juliusbrussee/a-developers-guide-to-apple-s-screen-time-apis-familycontrols-managedsettings-deviceactivity-e660147367d7)
- [Apple's Screen Time API has some major issues — riedel.wtf](https://riedel.wtf/state-of-the-screen-time-api-2024/)
- [Memory limit for Device Activity Monitor Extension — Apple Forums](https://developer.apple.com/forums/thread/735454)
- [Family Controls entitlement not working on TestFlight — Apple Forums](https://developer.apple.com/forums/thread/806285)
- [How to Get the Apple Family Controls Entitlement — Newly](https://newly.app/how-to/family-controls-entitlement)
- [ScreenZen](https://screenzen.co/)
- [ScreenZen App: How It Blocks Apps, Sites, and Scrolls — Nibble](https://nibble-app.com/blog/screenzen)
- [ScreenZen review — WhistleOut](https://www.whistleout.com/CellPhones/Apps/screenzen-app-review)
- [Rules for Adapting Data Models to CloudKit — fatbobman](https://fatbobman.com/en/snippet/rules-for-adapting-data-models-to-cloudkit/)
- [SwiftData Limitations — fatbobman](https://fatbobman.com/en/posts/key-considerations-before-using-swiftdata/)
- [Some Quirks of SwiftData with CloudKit — Firewhale](https://firewhale.io/posts/swift-data-quirks/)
- [iOS api for enable disable focus mode programmatically — Apple Forums](https://developer.apple.com/forums/thread/693444)
- [Focus — App Intents, Apple](https://developer.apple.com/documentation/appintents/focus)
- [Structured App Review 2026 — daveswift](https://daveswift.com/structured/)
- [Structured — App Store](https://apps.apple.com/us/app/structured-daily-planner-todo/id1499198946)
- [Focus To-Do — App Store](https://apps.apple.com/us/app/focus-to-do-pomodoro-tasks/id1258530160)
