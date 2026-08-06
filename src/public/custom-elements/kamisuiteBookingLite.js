/* ═══════════════════════════════════════════════════════════════════════════
 * KAMISUITE — Recepción Lite Mobile (Wix Custom Element)
 * Archivo:  kamisuiteBookingLite.js
 * Ubicación en Wix: public/custom-elements/
 * Tag name: kamisuite-booking-lite
 * Página:   /recepcionpromobile
 * VERSION:  0.6.3
 * FECHA:    6 Agosto 2026
 *
 * v0.6.3 — El botón "Añadir otro servicio" se mueve JUNTO al servicio
 *   elegido, justo debajo de su panel de addons.
 *
 *   En v0.6.2 se pintaba al final del paso 2, después de todos los grupos
 *   del catálogo: había que hacer scroll hasta abajo del todo para verlo,
 *   lo que en móvil equivale a que no exista. Ahora aparece pegado a la
 *   fila del servicio seleccionado, que es donde está mirando el operador
 *   cuando acaba de elegirlo.
 *
 * v0.6.2 — El botón "Añadir otro servicio" se pinta SIEMPRE en el paso 2,
 *   deshabilitado mientras no haya servicio elegido. En v0.6.1 estaba
 *   condicionado a `if (b.service)`, así que no existía en el DOM hasta
 *   elegir servicio. Ahora está siempre presente: la función es visible
 *   desde el primer momento y no depende de ninguna condición de render.
 *
 * v0.6.1 — FIX: el botón "Añadir otro servicio" no aparecía en servicios
 *   sin variantes ni complementos.
 *
 *   En v0.6.0 el botón se pintaba dentro de _renderAddonPanel, que hace
 *   `return ''` cuando el servicio no tiene variantes NI complementos
 *   (`if (!variantes.length && !complementos.length) return '';`). En
 *   Corte Femenino y demás servicios simples —justo los más habituales
 *   para encadenar cortes de familia— el panel entero no se pinta y el
 *   botón se iba con él.
 *
 *   Ahora el botón se pinta al final de _renderStepService, condicionado
 *   solo a que haya un servicio elegido, y su listener vive junto al
 *   resto de listeners del paso 2 (no en _wireAddonEvents, que solo se
 *   ejecuta cuando hay panel).
 *
 * v0.6.0 — ARMADO MÚLTIPLE. Varios servicios en una sola cita.
 *
 *   CASO DE USO (Jal): una madre reserva su corte + el corte del hijo +
 *   el de la hija. Los tres servicios se PINTAN como bloques propios en
 *   el calendario, pero pertenecen a UNA sola reserva → un único cobro.
 *
 *   PARIDAD LITERAL CON RECEPCIÓN PRO DESKTOP v1.1.81:
 *   La primera línea crea la cita con crearPackReserva. Las siguientes se
 *   añaden a ESA MISMA reserva con agregarServicioReserva. El backend
 *   encadena cada servicio nuevo a partir de MAX(end) de las fases
 *   ocupantes, así que quedan secuenciales con el mismo profesional.
 *   Cada fase ocupante se pinta como su propia .appt — el calendario no
 *   necesita ningún cambio.
 *
 *   CAMBIOS EN EL WIDGET:
 *   1) Estado nuevo en _emptyBooking: `lineas[]` (servicios ya añadidos),
 *      `cadenaPendiente[]` y `cadenaReservaId`. `service`, `variantIdx`,
 *      `complementosSel` y `exclusivosSel` pasan a ser la LÍNEA EN
 *      EDICIÓN.
 *   2) Helpers nuevos: _complementosDeLinea (extraído de _confirmBooking
 *      v0.5.5 sin cambios de lógica), _varianteSelDeLinea, _precioDeLinea,
 *      _labelDeLinea, _añadirLineaActual, _quitarLinea, _totalLineas,
 *      _numLineas.
 *   3) Paso 2: sobre el catálogo se pintan las líneas ya añadidas, cada
 *      una con su precio y un ✕ para quitarla. Dentro del panel de addons,
 *      botón "+ Añadir otro servicio a esta cita".
 *   4) El botón Continuar del paso 2 cierra automáticamente la línea en
 *      edición. El flujo de UN servicio queda EXACTAMENTE igual que antes:
 *      elegir servicio → Continuar.
 *   5) Paso 4: resumen con todas las líneas, su precio y el total, con la
 *      nota "N servicios · un solo cobro".
 *   6) _confirmBooking envía la línea 1 y deja el resto en
 *      cadenaPendiente. _onReservaCreada detecta cola pendiente y arranca
 *      la cadena en vez de cerrar. Case nuevo 'servicio-agregado' la
 *      consume una a una. El botón informa: "Añadiendo servicio 2 de 3…".
 *   7) Si una línea de la cadena falla, la cita contenedora YA existe: se
 *      cierra el sheet, se avisa y se refresca la agenda para que el
 *      operador vea qué entró y decida.
 *
 *   PAREJA OBLIGATORIA: page code v0.3.9, que añade el handler
 *   'agregar-servicio' → agregarServicioReserva → 'servicio-agregado'.
 *   Mismos nombres de mensaje que Desktop.
 *
 *   Cero cambios en el backend: agregarServicioReserva (recepcionProLogic
 *   v1.0.43+) ya acepta varianteSel y complementosSetupUid.
 *
 * v0.5.5 — El cliente sobrevive TAMBIÉN a la reserva creada.
 *
 *   SÍNTOMA (Jal, 6-ago-2026): al pintar la reserva se reseteaba el
 *   cliente. Caso de uso real: una madre reserva su corte + el corte del
 *   hijo + el de la hija. Tras cada reserva había que volver a buscarla.
 *
 *   CAUSA: regresión introducida en v0.5.4, que limpiaba
 *   _clientePendiente en _onReservaCreada "para que la siguiente reserva
 *   arranque limpia". Ese razonamiento ignoraba el encadenado familiar.
 *
 *   PARIDAD CON DESKTOP (verificada en recepcionProCMS_widget, case
 *   'reservaCreada'): al crear la reserva llama a _desarmar() —que resetea
 *   el SERVICIO armado— pero NUNCA toca this._cliente. El cliente vive en
 *   el aside y persiste hasta que el operador lo quita con #cliRm. Lite
 *   Mobile hacía lo contrario.
 *
 *   CAMBIOS:
 *   1) _onReservaCreada llama a _guardarClientePendiente(true) en lugar de
 *      limpiar. El cliente queda disponible para la siguiente apertura del
 *      sheet.
 *   2) _guardarClientePendiente acepta `forzar`: guarda aunque b.done sea
 *      true (tras reserva creada).
 *   3) CLIENTE_TTL_MS de 5 → 15 min. Encadenar tres reservas eligiendo
 *      servicio, empleado y hora en cada una se pasa de 5 minutos. El `ts`
 *      se refresca en cada guardado: la ventana cuenta desde la última
 *      reserva, no desde la primera.
 *
 *   El chip del cliente con botón "Quitar" (v0.5.4) sigue siendo la
 *   salvaguarda: el operador ve siempre a quién le está reservando y puede
 *   soltarlo en un toque.
 *
 * v0.5.4 — El cliente elegido sobrevive al cierre accidental del sheet.
 *
 *   SÍNTOMA (Jal, 6-ago-2026): eliges cliente en el paso 1, pasas al paso 2
 *   a buscar servicio, cierras con la ✕ (a menudo sin querer) y al volver
 *   a abrir el sheet el cliente ha desaparecido. Hay que buscarlo otra vez.
 *
 *   CAUSA: _openBookingSheet arranca con `this._booking = this._emptyBooking()`,
 *   que arrasa el estado completo — cliente incluido.
 *
 *   CAMBIOS:
 *   1) _closeBookingSheet llama a _guardarClientePendiente(): si el sheet
 *      se cierra SIN haber completado la reserva (b.done === false) y hay
 *      un cliente elegido (real, nuevo o provisional), se guarda en
 *      this._clientePendiente junto con la query y un timestamp.
 *   2) _openBookingSheet lo restaura si sigue vigente (CLIENTE_TTL_MS =
 *      5 min). Solo el CLIENTE: servicio, complementos, empleado y hora
 *      se resetean siempre, porque la nueva apertura suele venir de tocar
 *      otro slot del calendario con otra hora y otro empleado.
 *   3) CHIP DEL CLIENTE REAL en el step 1, con botón "Quitar". Hasta ahora
 *      el cliente elegido solo se veía como fila resaltada dentro de la
 *      lista de resultados; si la lista dejaba de pintarse, parecía que no
 *      había cliente. El provisional ya tenía chip desde v0.4.0, el real
 *      no: asimetría corregida.
 *      Esto NO es cosmético: es lo que hace segura la restauración. Sin la
 *      señal visual, el operador podría reabrir el sheet con un cliente de
 *      hace rato y reservarle la cita a la persona equivocada.
 *   4) La caducidad de 5 min y el botón "Quitar" limpian
 *      _clientePendiente. Al crear la reserva con éxito también se limpia:
 *      la siguiente arranca de cero.
 *
 *   Cero cambios en page code, backend, contrato de mensajes y resto del
 *   flujo de reserva.
 *
 * v0.5.3 — GUARDA `typeof customElements === 'undefined'` al entrar al IIFE.
 *   Sin ella, evaluar este archivo en un contexto sin DOM lanza
 *   "ReferenceError: customElements is not defined" en la PRIMERA
 *   sentencia y aborta el script entero, incluido el customElements.define
 *   final. Error observado en producción KALÓNICE (6-ago-2026 02:05:33).
 *   Deuda preexistente desde v0.1.0; misma carencia en kamisuiteAgenda.js,
 *   kamisuiteMobile.js y akiraConsole.js. Cambio aditivo puro: en
 *   navegador el comportamiento es idéntico a v0.5.2.
 *
 * v0.5.2 — FIX de la regresión introducida por v0.5.1 (agenda vacía al cargar).
 *
 *   SÍNTOMA: tras desplegar v0.5.1 la agenda ya no cargaba nunca en la
 *   primera pantalla. Había que avanzar al día siguiente y volver a hoy
 *   para ver las citas.
 *
 *   CAUSA (verificada en logs de producción KALÓNICE 6-ago-2026 00:01):
 *   entre "🎯 Init OK" y la navegación manual del operador no aparece
 *   ningún "📅 <fecha>: N packs" ni el "📦 Pre-carga iniciada: 30 días"
 *   que sí figuraba en los logs previos al despliegue. La cola de
 *   peticiones que dispara case 'init-data' no se envió.
 *
 *   La responsable es la guarda `_initDuplicado` que v0.5.1 añadió para
 *   evitar repetir el preload de 30 días cuando un retry de 'ready' se
 *   cruzaba con el 'init-data' original. Optimización defensiva que acabó
 *   suprimiendo la carga inicial de la agenda.
 *
 *   CAMBIOS:
 *   1) ELIMINADA la guarda `_initDuplicado`. Las tres peticiones de cola
 *      ('get-reservas-dia', 'preload-reservas', 'get-settings') se envían
 *      SIEMPRE en cada 'init-data', como en v0.5.0. No volver a
 *      condicionarlas: un preload repetido cuesta 30 queries; no enviarlas
 *      cuesta una agenda en blanco.
 *   2) El rescate de remontaje pide además 'get-reservas-dia', para que un
 *      remontaje del custom element no deje las columnas pintadas y sin
 *      citas hasta el siguiente tick de 10 s.
 *
 *   El resto de v0.5.1 (retry de 'ready', disconnectedCallback, handles de
 *   timers) se mantiene íntegro: es el fix real del cuelgue en
 *   "Cargando agenda…".
 *
 * v0.5.1 — FIX "Cargando agenda…" colgado aleatoriamente en la primera carga.
 *
 *   SÍNTOMA (reportado por Jal 6-ago-2026): la pantalla se queda en
 *   "Cargando agenda…" indefinidamente. A veces carga, a veces no. Es
 *   aleatorio y se resuelve recargando la página.
 *
 *   DIAGNÓSTICO (verificado en logs de producción KALÓNICE 01:06 del
 *   6-ago-2026, no especulado):
 *
 *   1) El evento 'ready' de connectedCallback NUNCA llega al page code.
 *      En los logs solo aparece UN "📱 CE listo" por carga, 3 ms después
 *      de "👂 Listener activo" — es el kickoff proactivo del final del
 *      $w.onReady del page code, no el evento del custom element. El
 *      dispatchEvent del connectedCallback se emite antes de que
 *      _el.on('booking-message') exista y se pierde sin dejar rastro.
 *      Mismo fenómeno documentado en el widget Desktop
 *      recepcionProCMS_widget v1.1.46 y v1.1.55.
 *
 *   2) Por tanto, la carga de la agenda dependía al 100% de que el
 *      kickoff proactivo del page code ganase la carrera de tiempos
 *      contra el montaje del custom element. Sin red de seguridad: si la
 *      pierde (setAttribute('response') disparado antes de que el
 *      attributeChangedCallback esté armado), 'init-data' se pierde y NO
 *      hay segundo intento.
 *
 *   3) Sin 'init-data' no hay salida del placeholder. _renderCalendarHeader()
 *      es la ÚNICA función que sustituye el <div class="cal-loading">
 *      del shell, y solo se invoca desde case 'init-data' y case
 *      'settings-data' — y 'settings-data' solo se pide DENTRO de
 *      case 'init-data'. Cuelgue permanente para esa carga.
 *
 *   4) El refresh de 10 s NO rescataba. En los logs de la sesión colgada
 *      se ve el widget pidiendo datos cada 10 s exactos y el page code
 *      respondiendo "📅 2026-08-06: 54 packs"… con la pantalla en
 *      "Cargando agenda…". Motivo: _renderCalendarBody() hace
 *      getElementById('calBody') y sale con return en seco porque el
 *      header nunca se pintó y #calBody no existe. Los 54 packs se
 *      descartaban en silencio cada 10 segundos.
 *
 *   CAMBIOS QUIRÚRGICOS (patrón copiado LITERAL del widget Desktop
 *   recepcionProCMS_widget, en producción desde v1.1.55):
 *
 *   1) Constructor: nuevos flags _initRecibido, _readyTries y handles
 *      _readyTimer / _refreshTimer inicializados a null.
 *
 *   2) connectedCallback: retry loop de 'ready' cada 700 ms hasta recibir
 *      'init-data' o agotar 12 intentos (mismo intervalo y mismo tope que
 *      el _readyTimer del Desktop). Con log por reintento.
 *
 *   3) case 'init-data': marca this._initRecibido = true y corta el retry.
 *
 *   4) disconnectedCallback NUEVO. Hasta v0.5.0 el setInterval de refresh
 *      de 10 s se creaba en CADA connectedCallback sin guardarse ni
 *      limpiarse: si Wix desconecta y reconecta el custom element
 *      (habitual durante hidratación/relayout, documentado en Desktop
 *      v1.1.66) se acumulaban intervals huérfanos, cada uno pidiendo
 *      reservas cada 10 s. Ahora el handle se guarda en _refreshTimer y
 *      ambos timers se limpian al desconectar.
 *
 *   5) connectedCallback: rescate de remontaje (patrón Desktop v1.1.66).
 *      Si al montar YA hay staff en memoria (_staff.length > 0), se
 *      repinta el calendario con lo que hay en vez de dejar el placeholder
 *      estático que acaba de repintar _renderShell. En el primer montaje
 *      _staff está vacío y no hace nada — comportamiento idéntico al
 *      actual.
 *
 *   PAREJA OBLIGATORIA: page code v0.3.6. Sin él, cada reintento de
 *   'ready' dispararía un handleReady completo (getStaffColumnas +
 *   getCatalogoReserva + cargarTodosContactos = 4.619 contactos, ~12 s de
 *   backend). El v0.3.6 hace handleReady idempotente y añade guarda de
 *   reentrada al cache de contactos: un reintento cuesta un setAttribute,
 *   no una tanda de queries.
 *
 *   CERO CAMBIOS en: contrato de mensajes, backend recepcionProLogic
 *   v1.0.49, CSS, lógica de reserva, bloqueos, variantes, settings,
 *   month picker, detail sheet y cualquier otro handler.
 *
 * v0.5.0 — VARIANTE BASE del principal + envío de varianteSel al backend.
 *   Doble fix necesario para que servicios simple_variantes (Corte Mujer
 *   M/L/XL, Corte Niño S/M/L, etc.) se reserven con precio/duración
 *   correcta desde Lite Mobile.
 *
 *   Bug 1: el selector de variante nunca ha incluido la BASE del
 *   catálogo. Solo iteraba `svc.variantes.forEach((v, i))` — es decir,
 *   pintaba L, XL, XXL pero NUNCA la M base (`svc.price` + `svc.duration`
 *   del propio ServiceCatalog). El operador estaba obligado a elegir
 *   siempre una variante del array; no podía reservar la base. Documenta-
 *   do en Bitácora 03Jul2026 §2.3 para bonos: "el precio base del
 *   servicio (ServiceCatalog.price) actúa como variante M, las variantes
 *   del array son adicionales". Bonos ya se corrigió el 3 Jul; aquí se
 *   aplica el mismo patrón.
 *
 *   Bug 2: aunque el operador eligiera L o XL, el widget NO enviaba
 *   varianteSel en el payload de 'crear-reserva'. Backend crearPackReserva
 *   v1.0.25 (desplegado desde 19 Jun) YA acepta varianteSel {idx, label,
 *   price, duration} para aplicar precio/duración de la variante — pero
 *   Lite Mobile nunca lo usó. La reserva se creaba SIEMPRE con precio
 *   base aunque en la UI se hubiera elegido XL. Paridad rota con
 *   Recepción PRO Desktop v1.1.43 que sí lo envía desde entonces.
 *
 *   Cambios quirúrgicos:
 *   1) _emptyBooking: variantIdx: 0 → variantIdx: -1 (base seleccionada).
 *   2) _renderStepService (row click): reset variantIdx a -1 al cambiar
 *      de servicio.
 *   3) _renderAddonPanel: chip "base" antes del forEach de variantes,
 *      pintando svc.label + svc.duration + svc.price. Cada chip de
 *      variante muestra ahora también precio y duración (antes solo
 *      label). Data-vi=-1 en el chip base; data-vi=i en los del array.
 *   4) _wireAddonEvents: handler acepta -1 correctamente
 *      (Number.isInteger + fallback -1 en vez de || 0).
 *   5) _confirmBooking: payload envía varianteSel {idx, label, price,
 *      duration} SOLO si variantIdx >= 0. Si variantIdx === -1 (base),
 *      NO se envía → backend usa precio/duración base como siempre
 *      (retrocompatible).
 *   6) _renderConfirmStep: en el resumen, "Variante: X" solo si el
 *      operador eligió variante ≠ base. Antes forzaba mostrar la
 *      variante 0 (bug al reflejar el paso 1 en la confirmación).
 *
 *   Cero cambios en backend recepcionProLogic v1.0.36 (crearPackReserva
 *   v1.0.25+ ya soporta varianteSel), en pagecode v0.3.5 (contrato de
 *   mensajes intacto), en el CSS (solo un chip más en la fila existente,
 *   sin clases nuevas). Cero impacto en servicios sin variantes
 *   (variantes.length === 0 → no se pinta bloque, mismo comportamiento).
 *
 * v0.4.0 — Cuatro mejoras + cabecera "LITE" (motor recepcionProLogic v1.0.36,
 *   patrón literal del Desktop recepcionProCMS_widget v1.1.60 para grupo
 *   exclusivo y cliente provisional).
 *
 *   1) GRUPO EXCLUSIVO en el step 2. Cuando el servicio armado tiene
 *      items tipo:'exclusivo' en su svc.mapeoFases (chip rojo del editor
 *      v1.14.0+, patrón Desktop v1.1.59), _renderAddonPanel pinta un
 *      bloque bajo "Complementos" titulado "🎯 Grupo exclusivo" con una
 *      sección por grupo. Cada sección muestra el label del grupo y las
 *      opciones como chips radio-like: primero "No añadir", luego una
 *      opción por cada ref válido con label/price/duration leídos del
 *      catálogo vivo (this._serviciosMap). Estado guardado en
 *      b.exclusivosSel[groupKey] = uid del elegido; ausencia = No añadir.
 *      _confirmBooking recorre items tipo:'exclusivo' del mapeoFases y,
 *      por cada elección guardada, empuja al array complementosSetupUid
 *      un objeto { uid, varianteId, varianteLabel, price, duration } —
 *      mismo shape que las variantes de complemento (patrón v0.3.9). El
 *      motor construirFasesPack v1.0.34 detecta el uid dentro de f.refs
 *      y materializa el servicio en la posición del grupo. Cero cambios
 *      en pagecode ni backend.
 *      Cliente Provisional NO SE PIDEN LOS COMPLEMENTOS CASO A (Lavado,
 *      Secado dentro de un Color): el motor v1.0.36 ya los filtra del
 *      array `complementos` del shape del servicio, así que el widget ni
 *      los ve. Cero UI para ellos, materializados en backend.
 *
 *   2) DETALLE ESPECÍFICO DE FASE al pulsar un bloque del calendario.
 *      Antes _renderDetailBody mostraba SIEMPRE la RESERVA completa
 *      (cliente/servicio principal/hora total), sin importar en qué fase
 *      hizo click el operador. Ahora: si el bloque clicado corresponde a
 *      una fase concreta (no legacy), el detail muestra un chip con la
 *      fase clicada (label + hora + duración) junto al resto de datos de
 *      la reserva. _openApptDetail acepta segundo parámetro `fase`;
 *      _renderDetailBody y _adaptDetailData lo usan para pintar el chip.
 *      Además: leyendas de fase visibles a partir de 20px de alto (antes
 *      32px), aumentando la información visible en bloques cortos.
 *
 *   3) CLIENTE PROVISIONAL en el step 1. Botón "+ Cliente provisional"
 *      bajo "+ Cliente nuevo". Al pulsarlo, campo mínimo con solo nombre
 *      (no se persiste en CRM). Estado guardado en b.provClient =
 *      { nombre, esProvisional:true }. Chip visible con badge "provisional"
 *      naranja en el step 1. Al confirmar, el payload lleva
 *      esProvisional:true y memberContactId vacío; el backend
 *      crearPackReserva (v1.0.6+) salta ensureContactInCRM. El pagecode
 *      v0.3.3 ya acepta esProvisional en el contrato de mensajes; cero
 *      cambios en pagecode. Patrón literal del Desktop v1.1.12.
 *
 *   4) BLOQUEOS: chip "DÍA COMPLETO" + chip "Personalizado". El sheet
 *      de nuevo bloqueo tenía chips fijos [15,30,45,60,90,120]. Ahora se
 *      añade "Día completo" (bloquea de 09:00 a 21:00 = 720 min) que
 *      además fija time=09:00 automáticamente, y "Personalizado" que
 *      abre un input numérico donde el operador escribe la duración en
 *      minutos (mín. 5, máx. 720). Sin dependencias de backend nuevo:
 *      crearBloqueo (recepcionProLogic v1.0.20 desplegado) ya acepta
 *      duracionMin arbitrario mínimo 5. Cero cambios en pagecode.
 *
 *   Cabecera visible en el shell:
 *     "KAMISUITE / Recepción Mobile" → "KAMISUITE / Recepción Mobile LITE"
 *     Cambio único en <span class="sub"> del <header class="header">.
 *
 *   Cero cambios en: calendario base, cache de contactos, refresh
 *   automático, cancelar cita, bloqueos crear/editar/eliminar (backend),
 *   extensiones visuales, staff/settings, mensajes del pagecode
 *   (contrato intacto), CSS existente (solo se AÑADEN reglas nuevas para
 *   chip radio-like del grupo exclusivo y chip provisional).
 *
 * v0.3.9 — Complementos con VARIANTES (paridad con Recepción PRO Desktop v1.1.44).
 *   El widget Lite Mobile estaba detrás del Desktop: todos los complementos
 *   se pintaban como toggle ON/OFF (modelo `complementosSel: {[uid]:bool}`)
 *   ignorando `c.hasVariants` y `c.variantes`. Con la nueva semántica de
 *   obligatoriedad (backend recepcionProLogic v1.0.27→v1.0.30) un Color
 *   Atelier mostraba Peinado y Tratamiento como toggles sin opciones de
 *   variante (S/M/L/XL, Sin/HairTimes/KERASTASE/Matiz). Bloqueante:
 *   imposible reservar correctamente desde móvil.
 *
 *   Cambios (patrón literal del Desktop recepcionProCMS_widget v1.1.44):
 *     · Modelo `complementosSel` admite ahora dos formas por uid:
 *         - `true`                → complemento simple (toggle).
 *         - `{ varianteIdx: N }`  → complemento con variante elegida.
 *     · `_renderAddonPanel`:
 *         - Complemento SIN variantes → toggle ON/OFF (igual que antes).
 *         - Complemento CON variantes → bloque con etiqueta "⛓ <label>"
 *           (+ " · obligatorio" si c.required) y una fila de chips, una
 *           por variante con su precio/duración.
 *     · `_wireAddonEvents`: nuevo listener para chips de variante de
 *       complemento (`.chip[data-compl-uid]`). Click guarda
 *       { varianteIdx }; re-click sobre la misma chip deselecciona SOLO
 *       si el complemento es opcional (required=false).
 *     · Construcción del payload de reserva: cada entrada de
 *       `complementosSel` se convierte a:
 *         - string uid                  (si valor === true)
 *         - { uid, varianteId, varianteLabel, price, duration }
 *                                       (si valor es objeto con varianteIdx)
 *       crearPackReserva v1.0.30 ya procesa ambas formas.
 *     · `_canAdvanceStep` (paso 2 → paso 3): bloquea si hay complemento
 *       `required:true` con variantes y no se ha elegido variante. Toast
 *       al usuario indicando cuáles faltan.
 *
 *   Cero cambios estéticos: reutiliza las clases `.chip` y `.sel` ya
 *   existentes. Cero cambios en otras funcionalidades del widget
 *   (bloqueos, calendario, FAB, detail sheet, settings, etc.).
 *   El page code (pagecode_recepcionpromobile v0.3.3) no se toca: pasa
 *   `complementosSetupUid` tal cual al backend.
 *
 * v0.3.8 — Bloqueo rayado con el color del staff.
 *   · El gradient base ahora usa el color del staff dueño del bloqueo
 *     (no gris fijo). Patrón literal del v0.2.1 línea 1010:
 *     repeating-linear-gradient(135deg, ${color}, ${color} 4px,
 *                                       rgba(0,0,0,.3) 4px,
 *                                       rgba(0,0,0,.3) 8px)
 *   · Identificación visual inmediata de a qué staff pertenece cada
 *     bloqueo, igual que en V1.
 *
 * v0.3.7 — Creación de bloqueos desde Mobile.
 *   · Reintroducido FAB naranja (+) abajo-derecha (CSS literal del
 *     v0.2.1 original) pero ahora ABRE EL SHEET DE BLOQUEO (no reserva).
 *   · Sheet nuevo "Nuevo bloqueo": input time nativo + chips de
 *     duración (15/30/45/60/90/120) + chips de staff visible + input
 *     opcional motivo + botón "Crear bloqueo".
 *   · Envía 'crearBloqueo' al page code con el payload del documento
 *     sec. 3.1 ({ fechaISO, horaHHmm, duracionMin, staffId, motivo }).
 *   · La reserva normal sigue creándose tocando un slot vacío del
 *     calendario (slot tap), igual que en v0.3.6.
 *
 * v0.3.6 — Bloqueos persistentes (lectura + editar + borrar).
 *   · Lee bloqueos de KamisuiteReservations (family:'BLOQUEO') tal cual
 *     los devuelve getReservasPorFecha. Patrón literal del documento
 *     de traspaso del 15-jun-2026 (sección 5).
 *   · Filtra family==='BLOQUEO' del bucle normal de fases (no son citas).
 *   · Pinta cada bloqueo como bloque rayado gris en la columna de
 *     r.staffId, con la etiqueta del motivo (desde fases.items[0].label
 *     o desde clientName tras quitar el prefijo 'BLOQUEO:').
 *   · Click en el bloqueo → menú: editar motivo / eliminar / cancelar.
 *     window.prompt para el motivo, confirm() para borrar.
 *   · Respuestas nuevas: bloqueoCreado/Eliminado/Actualizado → toast +
 *     refresh del día.
 *   · NO incluye creación táctil aún (long-press): pendiente de
 *     siguiente iteración si lo necesitas.
 *
 * v0.3.5 — Fix render de extensiones (no se pintaban).
 *   · La extensión va SIEMPRE a la columna de r.staffId (raíz de la
 *     reserva), no a la columna del staff de la última fase ocupante.
 *   · Coincide con el algoritmo literal de widgetPublicoLogic v0.6.2
 *     (motor getHuecosDisponibles): "extensionMin bloquea al r.staffId
 *     desde el final de la última fase ocupante".
 *   · Defensivo: r.fases acepta Array o {items:[]}.
 *   · Log de descartes por staff no visible o por reserva sin fases.
 *
 * v0.3.4 — Pinta extensionMin de las reservas.
 *   · Mobile lee r.extensionMin (Number, viene del backend) y, tras la
 *     última fase ocupante de la reserva, añade un bloque rayado
 *     "EXTENSIÓN · N MIN" en la columna de ese staff. Mismo patrón que
 *     recepcionProCMS_widget v1.1.38 _extensionHTML (líneas 2876-2889).
 *   · Las extensiones SÍ son reales en backend (KamisuiteReservations.
 *     extensionMin) y SÍ son tratadas como bloqueos por el motor
 *     getHuecosDisponibles v0.6.2 (widget público).
 *   · Solo VISUALIZACIÓN en Mobile (extender / quitar extensión sigue
 *     siendo exclusivo de la Recepción PRO desktop por ahora).
 *
 * v0.3.3 — Filtrar canceladas + botón refresh manual.
 *   · FIX: _renderCalendarBody descarta reservas con status === 'CANCELADA'.
 *     Mismo patrón que recepcionProCMS_widget v1.1.38 línea 2714. El
 *     backend getReservasPorFecha NO filtra por status, devuelve todas;
 *     el filtro vive en el cliente (igual que desktop V2). Eso explica
 *     que Mobile mostraba más reservas que Desktop.
 *   · Botón refresh manual en el header (al lado de HOY): icono ↻.
 *     Click → pide get-reservas-dia del día actual.
 *
 * v0.3.2 — Eliminado FAB (+) + Cancelar cita desde el detail.
 *   · FAB eliminado: ya no tiene sentido. En móvil se añade reserva
 *     tocando una columna del calendario (slot tap). Eliminado:
 *     CSS .fab, el botón #fab del shell, el listener.
 *   · Cancelar cita: botón rojo "Cancelar cita" al final del detail
 *     del appointment. Pide confirmación nativa (confirm()) y envía
 *     'cancelar-reserva' al page code con la reservaId. Tras respuesta
 *     'reserva-cancelada' OK, cierra detail, muestra toast y pide
 *     refresh del día. Patrón idéntico al desktop V2.
 *
 * v0.3.1 — Fix columna fantasma + Acordeón estricto en step 2.
 *   · FIX columnas dinámicas: ancho de columna se recalcula según
 *     visible.length y ancho disponible. Si las columnas no llenan el
 *     viewport, se estiran (cada una = (ancho - gutter) / N). Si son
 *     muchas y no caben, se mantienen en MIN_COL_W=112 con scroll
 *     horizontal. Adiós a la columna vacía a la derecha.
 *   · Step 2 BookingSheet: acordeón estricto. Todos los grupos plegados
 *     al abrir. Click en cabecera → expande ese grupo y cierra el
 *     anterior. Click en cabecera del grupo abierto → lo cierra.
 *
 * v0.3.0 — Migración V1 → V2 (CMS-first). Compatible con page code v0.3.1+.
 *   CAMBIOS FUNCIONALES (cero estética):
 *   · Staff V2 (getStaffColumnas): normaliza wixResourceId→id, displayName→name.
 *     Color por defecto desde paleta STAFF_COLORS (literal de desktop V2). Si
 *     llega settings-data con staffConfig.color, prevalece (mismo patrón V1).
 *   · Catálogo CMS-first: identidad por setupUid. Mapa _serviciosMap indexado
 *     por setupUid. Complementos[] y variantes[] vienen inline en cada
 *     servicio principal (desde getCatalogoReserva).
 *   · Render del calendario: itera fases[] por reserva. PROCESO (ocupa:false)
 *     NO se pinta — deja hueco (concepto fundacional). Una .appt por fase
 *     ocupante, en columna (f.staffId || r.staffId). Click → abre detail con
 *     la reserva entera (no la fase).
 *   · Step 2 BookingSheet: variantes (chips required) + complementos (toggles
 *     bool) construidos localmente desde svc.variantes[] y svc.complementos[].
 *     SIN llamada get-service-options. SIN backend extra.
 *   · crear-reserva: payload V2 {principalSetupUid, complementosSetupUid[],
 *     fechaISO, horaHHmm, empleadoId, staffName, contactDetails, memberContactId}.
 *   · NEW response handler 'settings-data' (CalendarViewSettings, mismo
 *     patrón que desktop V2).
 *   · Pide get-settings tras init-data (no bloqueante).
 *   · CSS, iconos, HTML del Shell, navegación, weekbar, FAB, MonthPicker,
 *     toast, fuente: SIN TOCAR.
 *
 * v0.2.1 — FIX crítico: patrón staff/visible EXACTO de kamisuiteAgenda.js
 *   líneas 763-765 (_initStaffConfig + _getVisibleStaff + _staffColor).
 *   Antes inventé el campo 'orden' cuando producción usa 'position'.
 *   Antes no inicializaba staffConfig si estaba vacío.
 *   Añadido refresh automático cada 10s (igual que PRO líneas 612-617).
 *   Añadido descarte de respuestas de fecha distinta (race condition fix).
 *
 * v0.2.0 — Fase 1+2+3: BookingSheet completo, MonthPicker, AppointmentDetail.
 *   · Flujo de reserva 4 pasos: cliente → servicio (+ addons dinámicos) → empleado+hora → confirmar
 *   · Addons genéricos (chip groups + toggles) construidos en page code desde mapeo.
 *   · Soporta servicios SIMPLES (con o sin variantes), COLORACIÓN, TRATAMIENTO.
 *   · MonthPicker bottom sheet para fechas lejanas.
 *   · AppointmentDetail bottom sheet al pulsar una cita.
 *   · Multi-tenant: cero IDs/nombres/colores hardcoded.
 *
 * v0.1.1 — FIX: nombres de campos correctos en reservas (resourceId, startTime,
 *   durMin, servicio, cliente, tipo). Color del bloque = color del staff.
 *
 * v0.1.0 — FASE 0: Calendario read-only multi-tenant.
 *
 * Comunicación (patrón AKIRA / Agenda):
 *   Element → Page: dispatchEvent(new CustomEvent('booking-message', {detail}))
 *   Page → Element: setAttribute('response', JSON.stringify({type, ...data, ts}))
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  // v0.5.3 — GUARDA DE ENTORNO. Hasta v0.5.2 la primera sentencia
  // ejecutable era `customElements.get(...)` sin comprobar que
  // `customElements` existiera. Cuando Wix evalúa este archivo en un
  // contexto sin DOM, eso lanza:
  //     ReferenceError: customElements is not defined
  // y aborta el script COMPLETO — incluido el customElements.define del
  // final. Verificado en producción KALÓNICE (log 6-ago-2026 02:05:33,
  // inmediatamente después de "Running the code for the Recepción LITE
  // MOBILE V2 page").
  //
  // Deuda compartida: kamisuiteAgenda.js, kamisuiteMobile.js y
  // akiraConsole.js tienen exactamente el mismo patrón sin guarda.
  //
  // Salida limpia en ese caso; en navegador el comportamiento es idéntico.
  if (typeof customElements === 'undefined') {
    return;
  }
  if (customElements.get('kamisuite-booking-lite')) {
    console.log('[KamisuiteBookingLite] Ya registrado.');
    return;
  }
  const VERSION = '0.6.3';
  const TAG = `[BookingLite v${VERSION}]`;

  // ── Constantes de calendario ──
  const CAL_START_H = 9;
  const CAL_END_H = 21;
  const SLOT_MIN = 30;
  const PRELOAD_DAYS = 30;
  const MIN_COL_W = 112;    // v0.3.1 — ancho mínimo de columna; si caben más anchas, se estiran
  // v0.5.4 — Vigencia del cliente conservado entre aperturas del sheet.
  // Pasado este tiempo no se restaura, para no arrastrar un cliente
  // antiguo a una reserva que no le corresponde.
  // v0.5.5 — Subido de 5 a 15 min: encadenar las reservas de una familia
  // (madre + dos hijos, eligiendo servicio, empleado y hora en cada una)
  // se pasa de 5 minutos con facilidad. El `ts` se refresca en cada
  // guardado, así que la ventana cuenta desde la última reserva, no desde
  // la primera.
  const CLIENTE_TTL_MS = 15 * 60 * 1000;

  // ── v0.3.0 — Paleta de colores por empleado (literal de desktop V2,
  //    recepcionProCMS_widget línea 544). Coherencia visual entre apps. ──
  const STAFF_COLORS = [
    '#e8542e', '#7b3ff2', '#c2185b', '#2e9e5b', '#2f6fd9',
    '#e89c1c', '#0f9b9b', '#9c4dcc', '#d81b60', '#558b2f', '#1565c0'
  ];

  // ── Helpers de fecha ──
  function todayISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  function addDaysISO(iso, delta) {
    const d = new Date(iso + 'T12:00:00');
    d.setDate(d.getDate() + delta);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  function diffDaysISO(isoA, isoB) {
    const a = new Date(isoA + 'T12:00:00').getTime();
    const b = new Date(isoB + 'T12:00:00').getTime();
    return Math.round((b - a) / 86400000);
  }
  function parseTimeMin(t) {
    if (!t || typeof t !== 'string') return null;
    const p = t.split(':');
    if (p.length < 2) return null;
    return parseInt(p[0], 10) * 60 + parseInt(p[1], 10);
  }
  function fmtTime(absMin) {
    const hh = Math.floor(absMin / 60);
    const mm = absMin % 60;
    return `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
  }
  function esc(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function escAttr(s) {
    return String(s||'').replace(/'/g,'&#39;').replace(/"/g,'&quot;');
  }
  function initials(name) {
    return String(name||'').trim().split(/\s+/).slice(0,2).map(s => s[0]||'').join('').toUpperCase() || '·';
  }
  function mondayIndex(date) { return (date.getDay() + 6) % 7; }
  function startOfWeekISO(iso) {
    const d = new Date(iso + 'T12:00:00');
    d.setDate(d.getDate() - mondayIndex(d));
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  const WEEKDAY_LETTERS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
  const DAY_ABBR_ES = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  const MONTHS_ES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

  function isoDate(iso) { return new Date(iso + 'T12:00:00'); }

  function madridNowMin() {
    const n = new Date();
    const y = n.getUTCFullYear();
    const mL = new Date(Date.UTC(y, 2, 31));
    const mS = 31 - mL.getUTCDay();
    const cS = Date.UTC(y, 2, mS, 1);
    const oL = new Date(Date.UTC(y, 9, 31));
    const oS = 31 - oL.getUTCDay();
    const cE = Date.UTC(y, 9, oS, 1);
    const off = (n.getTime() >= cS && n.getTime() < cE) ? 2 : 1;
    return (n.getUTCHours() + off) * 60 + n.getUTCMinutes();
  }

  // v0.3.0 — Conversión ISO UTC → minutos absolutos del día en Madrid.
  // Patrón literal de recepcionProCMS_widget v1.1.38 línea 1949.
  function isoToMinMadrid(iso) {
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return null;
      const hhmm = d.toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hour12: false });
      return parseTimeMin(hhmm);
    } catch { return null; }
  }
  function isoToHHmmMadrid(iso) {
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return '';
      return d.toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hour12: false });
    } catch { return ''; }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CSS del Shadow DOM
  // ─────────────────────────────────────────────────────────────────────────
  const CSS = `
:host {
  --bg: #0f1117;
  --surface: #181b23;
  --surface2: #1e222c;
  --surface3: #252a36;
  --border: rgba(255,255,255,0.08);
  --border-hover: rgba(255,255,255,0.18);
  --text: #e8e9ed;
  --text2: rgba(255,255,255,0.65);
  --muted: rgba(255,255,255,0.40);
  --accent: #c9a44a;
  --orange: #e87722;
  --purple: #7c3aed;
  --green: #059669;
  --red: #dc2626;
  --radius: 10px;
  --radius-sm: 6px;
  --gutter-w: 46px;
  --col-w: 112px;
  --slot-h: 56px;
  --header-h: 56px;
  --datenav-h: 92px;
  display: block;
  font-family: "Bai Jamjuree", system-ui, sans-serif;
  color: var(--text);
}
* { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }

.phone {
  width: 100%;
  max-width: 480px;
  height: 100vh;
  height: 100dvh;
  margin: 0 auto;
  background: var(--bg);
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

button { font-family: inherit; cursor: pointer; border: none; background: none; color: inherit; padding: 0; }
input, textarea { font-family: inherit; }

/* Header */
.header {
  flex: 0 0 auto;
  height: var(--header-h);
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 16px;
  border-bottom: 1px solid var(--border);
  background: var(--bg);
  z-index: 30;
}
.brand { display: flex; flex-direction: column; gap: 1px; line-height: 1; }
.brand .logo {
  font-size: 18px; font-weight: 700;
  color: var(--accent);
  letter-spacing: 0.14em;
}
.brand .sub {
  font-size: 10px; font-weight: 500;
  color: var(--muted);
  letter-spacing: 0.16em;
  text-transform: uppercase;
}
.btn-today {
  font-size: 11px; font-weight: 600;
  letter-spacing: 0.1em;
  color: var(--text);
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 8px 14px;
  text-transform: uppercase;
  transition: background 0.15s, border-color 0.15s;
}
.btn-today:active { background: var(--surface3); border-color: var(--border-hover); }
.btn-today.is-today { color: var(--muted); }

/* v0.3.3 — Botón refresh manual */
.btn-refresh {
  width: 36px; height: 34px;
  display: grid; place-items: center;
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text);
  transition: background 0.15s, border-color 0.15s, transform 0.4s;
  margin-right: 8px;
}
.btn-refresh:active { background: var(--surface3); border-color: var(--border-hover); }
.btn-refresh.spinning { transform: rotate(360deg); }
.btn-refresh svg { width: 16px; height: 16px; }

/* Date nav */
.datenav {
  flex: 0 0 auto;
  background: var(--bg);
  border-bottom: 1px solid var(--border);
  padding: 10px 12px 12px;
  z-index: 25;
}
.datenav-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.datenav-arrow {
  width: 40px; height: 40px;
  display: grid; place-items: center;
  border-radius: var(--radius-sm);
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text2);
  transition: background 0.15s, color 0.15s;
}
.datenav-arrow:active { background: var(--surface3); color: var(--text); }
.datenav-arrow svg { width: 18px; height: 18px; }
.datenav-label {
  text-align: center; line-height: 1.15;
  background: none; border: none; padding: 4px 8px;
  border-radius: var(--radius-sm);
  transition: background 0.15s;
}
.datenav-label:active { background: var(--surface2); }
.datenav-label .day {
  font-size: 15px; font-weight: 600; color: var(--text);
  text-transform: capitalize;
  display: inline-flex; align-items: center; gap: 5px;
}
.datenav-label .month {
  font-size: 11px; color: var(--muted);
  text-transform: lowercase;
  letter-spacing: 0.04em;
}
.datenav-caret { display: inline-flex; color: var(--muted); transform: translateY(1px); }

.weekbar { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; margin-top: 10px; }
.weekday {
  position: relative;
  display: flex; flex-direction: column; align-items: center;
  gap: 4px; padding: 6px 0 8px;
  border-radius: var(--radius-sm);
  background: transparent;
  transition: background 0.15s;
}
.weekday:active { background: var(--surface2); }
.weekday .wd-letter { font-size: 10px; font-weight: 600; color: var(--muted); letter-spacing: 0.06em; }
.weekday .wd-num { font-size: 14px; font-weight: 500; color: var(--text2); }
.weekday.sel .wd-num { color: #fff; font-weight: 700; }
.weekday.sel .wd-letter { color: var(--text2); }
.weekday .wd-dot { position: absolute; bottom: 2px; width: 5px; height: 5px; border-radius: 50%; background: transparent; }
.weekday.sel .wd-dot { background: var(--orange); }
.weekday.has-appts:not(.sel) .wd-dot { background: var(--border-hover); }

/* Calendar */
.cal-wrap { flex: 1 1 auto; overflow: auto; position: relative; -webkit-overflow-scrolling: touch; }
.cal-inner { width: max-content; min-width: 100%; position: relative; }
.cal-headrow { position: sticky; top: 0; z-index: 20; display: flex; height: 46px; }
.cal-corner {
  position: sticky; left: 0; z-index: 22;
  width: var(--gutter-w); flex: 0 0 var(--gutter-w);
  background: var(--surface);
  border-bottom: 1px solid var(--border);
}
.emp-head {
  width: var(--col-w); flex: 0 0 var(--col-w);
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  border-left: 1px solid var(--border);
  padding: 9px 8px;
  display: flex; align-items: center; gap: 7px;
}
.emp-dot { width: 9px; height: 9px; border-radius: 50%; flex: 0 0 auto; }
.emp-name { font-size: 12px; font-weight: 600; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.cal-bodyrow { display: flex; position: relative; }
.time-gutter { position: sticky; left: 0; z-index: 15; width: var(--gutter-w); flex: 0 0 var(--gutter-w); background: var(--bg); }
.time-cell { height: var(--slot-h); display: flex; justify-content: flex-end; padding: 2px 6px 0 0; }
.time-cell .t { font-size: 10px; font-weight: 500; color: var(--muted); transform: translateY(-7px); font-variant-numeric: tabular-nums; }

.day-col { position: relative; width: var(--col-w); flex: 0 0 var(--col-w); border-left: 1px solid var(--border); }
.slot { height: var(--slot-h); border-bottom: 1px solid var(--border); transition: background 0.12s; }
.slot.half { border-bottom-color: rgba(255,255,255,0.04); }
.slot:active { background: rgba(232, 119, 34, 0.14); }

.appt {
  position: absolute; left: 3px; right: 3px;
  border-radius: var(--radius-sm); padding: 6px 7px;
  overflow: hidden; color: #fff;
  display: flex; flex-direction: column; gap: 2px;
  border: 1px solid rgba(255,255,255,0.10);
  box-shadow: 0 1px 3px rgba(0,0,0,0.35);
  transition: transform 0.12s, filter 0.12s;
  z-index: 3;   /* v0.3.6 — citas encima de bloqueos (.appt-bloq z-index:2) */
}
.appt:active { transform: scale(0.975); filter: brightness(1.1); }
.appt .ap-time { font-size: 9px; font-weight: 600; letter-spacing: 0.03em; opacity: 0.95; font-variant-numeric: tabular-nums; }
.appt .ap-client { font-size: 12px; font-weight: 600; line-height: 1.1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.appt .ap-service { font-size: 10px; font-weight: 400; opacity: 0.9; line-height: 1.1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* v0.3.4 — Bloque de extensión (rayado, no clicable, sólo informativo) */
.appt-ext {
  position: absolute; left: 3px; right: 3px;
  border-radius: var(--radius-sm); padding: 4px 7px;
  display: flex; align-items: center; justify-content: center;
  color: #fff;
  font-size: 9px; font-weight: 700; letter-spacing: 0.04em;
  border: 1px solid rgba(255,255,255,0.10);
  background: repeating-linear-gradient(135deg, var(--ext-color, #6b7280), var(--ext-color, #6b7280) 5px, rgba(255,255,255,0.15) 5px, rgba(255,255,255,0.15) 10px);
  pointer-events: none;
  overflow: hidden;
}

/* v0.3.6 — Bloqueo manual (clicable, persistente en KamisuiteReservations) */
/* v0.3.8 — Color del staff dueño del bloqueo (patrón V1 línea 1010) */
.appt-bloq {
  position: absolute; left: 3px; right: 3px;
  border-radius: var(--radius-sm); padding: 5px 7px;
  display: flex; flex-direction: column; gap: 1px;
  color: #fff;
  border: 1px solid rgba(255,255,255,0.12);
  background: repeating-linear-gradient(135deg, var(--bloq-color, #4b5563), var(--bloq-color, #4b5563) 4px, rgba(0,0,0,0.30) 4px, rgba(0,0,0,0.30) 8px);
  z-index: 2;       /* permanece bajo las .appt normales (.appt = z-index 3) */
  cursor: pointer;
  overflow: hidden;
  transition: filter 0.12s;
}
.appt-bloq:active { filter: brightness(1.15); }
.appt-bloq .bl-lbl {
  font-size: 9px; font-weight: 700; letter-spacing: 0.05em; opacity: 0.85;
}
.appt-bloq .bl-motivo {
  font-size: 11px; font-weight: 600; line-height: 1.1;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

.now-line { position: absolute; left: var(--gutter-w); right: 0; height: 0; border-top: 1.5px solid var(--orange); z-index: 12; pointer-events: none; }
.now-line::before { content: ""; position: absolute; left: -3px; top: -4px; width: 7px; height: 7px; border-radius: 50%; background: var(--orange); }

/* v0.3.7 — FAB (recuperado del v0.2.1, ahora abre el sheet de bloqueo) */
.fab {
  position: absolute; right: 18px; bottom: 22px;
  width: 56px; height: 56px;
  border-radius: 50%;
  background: var(--orange);
  color: #fff;
  display: grid; place-items: center;
  box-shadow: 0 8px 22px rgba(232,119,34,0.42), 0 2px 6px rgba(0,0,0,0.4);
  z-index: 40;
  transition: transform 0.15s;
}
.fab:active { transform: scale(0.92); }
.fab svg { width: 24px; height: 24px; }

/* v0.3.7 — Sheet de creación de bloqueo */
.bl-field { display: flex; flex-direction: column; gap: 8px; margin-bottom: 18px; }
.bl-field-label { font-size: 11px; color: var(--accent); text-transform: uppercase; letter-spacing: 0.1em; font-weight: 600; }
.bl-time-input {
  width: 100%; padding: 14px 14px; font-size: 16px;
  background: var(--surface2); color: var(--text);
  border: 1px solid var(--border); border-radius: var(--radius-sm);
  font-family: inherit;
}
.bl-text-input {
  width: 100%; padding: 12px 14px; font-size: 14px;
  background: var(--surface2); color: var(--text);
  border: 1px solid var(--border); border-radius: var(--radius-sm);
  font-family: inherit;
}
.bl-text-input::placeholder { color: var(--muted); }
.bl-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.bl-chip {
  padding: 9px 14px; font-size: 13px; font-weight: 500;
  background: var(--surface2); color: var(--text);
  border: 1px solid var(--border); border-radius: 999px;
  transition: background 0.12s, border-color 0.12s, color 0.12s;
}
.bl-chip.sel { background: var(--orange); border-color: var(--orange); color: #fff; font-weight: 600; }
.bl-chip.staff .bl-chip-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; vertical-align: middle; }

.cal-loading { position: absolute; inset: 46px 0 0 0; display: grid; place-items: center; color: var(--muted); font-size: 12px; letter-spacing: 0.04em; }

/* Toast */
.toast {
  position: absolute; left: 50%; bottom: 100px;
  transform: translateX(-50%) translateY(20px);
  background: var(--surface3);
  border: 1px solid var(--border-hover);
  color: var(--text);
  font-size: 12px; font-weight: 500;
  padding: 10px 16px;
  border-radius: 999px;
  z-index: 100;
  opacity: 0; pointer-events: none;
  transition: opacity 0.2s, transform 0.2s;
  max-width: 80%; text-align: center;
}
.toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }

.cal-wrap::-webkit-scrollbar { width: 0; height: 0; }

/* ── Sheets (bottom sheets) ── */
.scrim {
  position: absolute; inset: 0;
  background: rgba(0,0,0,0.55);
  z-index: 70;
  opacity: 0; pointer-events: none;
  transition: opacity 0.18s;
}
.scrim.open { opacity: 1; pointer-events: auto; }

.sheet {
  position: absolute; left: 0; right: 0; bottom: 0;
  z-index: 75;
  background: var(--surface);
  border-top-left-radius: 16px;
  border-top-right-radius: 16px;
  box-shadow: 0 -8px 24px rgba(0,0,0,0.5);
  transform: translateY(100%);
  transition: transform 0.22s ease-out;
  display: flex; flex-direction: column;
  max-height: 90dvh;
}
.sheet.open { transform: translateY(0); }
.sheet-grip { width: 36px; height: 4px; border-radius: 2px; background: rgba(255,255,255,0.18); margin: 8px auto 0; }

.sheet-head { flex: 0 0 auto; padding: 10px 16px 8px; border-bottom: 1px solid var(--border); }
.sheet-steps { display: flex; gap: 5px; margin-bottom: 8px; }
.step-pip { flex: 1; height: 3px; border-radius: 2px; background: rgba(255,255,255,0.10); transition: background 0.2s; }
.step-pip.active { background: var(--orange); }
.step-pip.done { background: rgba(232,119,34,0.5); }
.sheet-titlerow { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.sheet-back { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; color: var(--text2); }
.sheet-back svg { width: 14px; height: 14px; }
.sheet-stepno { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.08em; }
.sheet-title { font-size: 14px; font-weight: 600; color: var(--text); }
.sheet-close { font-size: 20px; color: var(--muted); width: 28px; height: 28px; }

.sheet-body { flex: 1 1 auto; overflow: auto; padding: 14px 16px 18px; -webkit-overflow-scrolling: touch; }

.sheet-foot {
  flex: 0 0 auto;
  padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
  border-top: 1px solid var(--border);
  background: var(--surface);
}
.btn-primary {
  width: 100%;
  background: var(--orange);
  color: #fff;
  font-weight: 600; font-size: 14px;
  padding: 14px 16px;
  border-radius: var(--radius-sm);
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  transition: background 0.15s, opacity 0.15s, transform 0.12s;
}
.btn-primary:disabled { opacity: 0.4; }
.btn-primary:active:not(:disabled) { transform: scale(0.99); }
.btn-primary svg { width: 16px; height: 16px; }
.btn-ghost {
  background: transparent; border: 1px solid var(--border);
  color: var(--text2);
  font-size: 12px; padding: 9px 14px;
  border-radius: var(--radius-sm);
}
.btn-ghost:active { background: var(--surface2); color: var(--text); }

/* Step content shared */
.field-label { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.08em; display: block; margin-bottom: 6px; }
.search {
  display: flex; align-items: center; gap: 8px;
  background: var(--surface2); border: 1px solid var(--border);
  border-radius: var(--radius-sm); padding: 10px 12px;
}
.search svg { width: 14px; height: 14px; color: var(--muted); flex: 0 0 auto; }
.search input {
  flex: 1; border: none; outline: none;
  background: transparent; color: var(--text); font-size: 14px;
}
.search input::placeholder { color: var(--muted); }

/* Client list */
.client-row {
  display: flex; align-items: center; gap: 10px;
  padding: 10px;
  border-radius: var(--radius-sm);
  margin-top: 8px;
  border: 1px solid transparent;
  transition: background 0.15s, border-color 0.15s;
}
.client-row:active { background: var(--surface2); }
.client-row.sel { border-color: var(--orange); background: rgba(232,119,34,0.10); }
.avatar { width: 36px; height: 36px; border-radius: 50%; background: var(--surface3); display: grid; place-items: center; font-size: 12px; font-weight: 600; color: var(--text); flex: 0 0 auto; }
.client-info { flex: 1; min-width: 0; }
.client-info .cn { font-size: 13px; font-weight: 600; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.client-info .cm { font-size: 11px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.client-meta { font-size: 10px; color: var(--muted); }
.empty-hint { font-size: 12px; color: var(--muted); text-align: center; padding: 12px 0; }
.new-client-btn {
  width: 100%; margin-top: 10px;
  background: var(--surface2); border: 1px dashed var(--border-hover);
  color: var(--text2); font-size: 13px;
  padding: 12px;
  border-radius: var(--radius-sm);
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
}
.new-client-btn:active { background: var(--surface3); color: var(--text); }
.new-client-btn .plus { font-size: 18px; font-weight: 700; color: var(--orange); }

/* Service categories */
.cat-group { margin-bottom: 10px; }
.cat-head {
  font-size: 11px; color: var(--accent); text-transform: uppercase;
  letter-spacing: 0.1em; font-weight: 600;
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 12px; background: var(--surface-2); border-radius: var(--radius-sm);
  cursor: pointer; user-select: none;
  transition: background 0.15s;
}
.cat-head:active { background: var(--surface-3, #1f2230); }
.cat-head.exp { margin-bottom: 8px; }
.cat-chev {
  width: 14px; height: 14px; flex: 0 0 14px;
  border-right: 2px solid var(--accent); border-bottom: 2px solid var(--accent);
  transform: rotate(-45deg); transition: transform 0.18s;
}
.cat-head.exp .cat-chev { transform: rotate(45deg); }
.svc-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px;
  background: var(--surface2);
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  margin-bottom: 6px;
  transition: background 0.15s, border-color 0.15s;
}
.svc-row:active { background: var(--surface3); }
.svc-row.sel { border-color: var(--orange); background: rgba(232,119,34,0.10); }
.svc-row.has-panel { border-bottom-left-radius: 0; border-bottom-right-radius: 0; margin-bottom: 0; }
.svc-name { font-size: 13px; font-weight: 500; color: var(--text); }
.svc-meta { font-size: 11px; color: var(--muted); font-variant-numeric: tabular-nums; }
.addon-panel {
  background: var(--surface2);
  border: 1px solid var(--orange);
  border-top: none;
  border-radius: 0 0 var(--radius-sm) var(--radius-sm);
  padding: 12px;
  margin-bottom: 6px;
}
.addon-block { margin-bottom: 12px; }
.addon-block:last-child { margin-bottom: 0; }
.addon-block .alabel { font-size: 11px; color: var(--text2); margin-bottom: 6px; display: block; font-weight: 500; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip {
  background: var(--surface3);
  border: 1px solid var(--border);
  color: var(--text2);
  font-size: 11px; font-weight: 500;
  padding: 7px 11px;
  border-radius: 999px;
  transition: all 0.15s;
}
.chip:active { background: var(--surface); }
.chip.sel { background: var(--orange); color: #fff; border-color: var(--orange); }
.toggle-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 0;
}
.toggle-row .tl { font-size: 12px; color: var(--text); }
.switch {
  position: relative;
  width: 40px; height: 22px;
  background: var(--surface3);
  border-radius: 11px;
  border: 1px solid var(--border);
  transition: background 0.18s, border-color 0.18s;
  flex: 0 0 auto;
}
.switch::after {
  content: "";
  position: absolute; left: 2px; top: 2px;
  width: 16px; height: 16px;
  background: var(--text2);
  border-radius: 50%;
  transition: transform 0.18s, background 0.18s;
}
.switch.on { background: var(--orange); border-color: var(--orange); }
.switch.on::after { transform: translateX(18px); background: #fff; }

/* Step 3: emp + time */
.emp-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 14px; }
.emp-chip {
  display: inline-flex; align-items: center; gap: 6px;
  background: var(--surface2);
  border: 1px solid var(--border);
  color: var(--text);
  font-size: 12px; font-weight: 500;
  padding: 8px 11px;
  border-radius: 999px;
}
.emp-chip:active { background: var(--surface3); }
.emp-chip.sel { background: var(--orange); border-color: var(--orange); color: #fff; }
.emp-chip .dot { width: 7px; height: 7px; border-radius: 50%; }

.time-grid {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px;
}
.time-btn {
  background: var(--surface2);
  border: 1px solid var(--border);
  color: var(--text2);
  font-size: 12px; font-weight: 600;
  padding: 11px 0;
  border-radius: var(--radius-sm);
  font-variant-numeric: tabular-nums;
  transition: all 0.15s;
}
.time-btn:active { background: var(--surface3); }
.time-btn.sel { background: var(--orange); border-color: var(--orange); color: #fff; }

/* Step 4: confirm */
.confirm-row {
  display: flex; align-items: flex-start; justify-content: space-between;
  padding: 10px 0;
  border-bottom: 1px solid var(--border);
  gap: 14px;
}
.confirm-row:last-child { border-bottom: none; }
.confirm-row .ck { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.06em; min-width: 80px; padding-top: 2px; }
.confirm-row .cv { font-size: 13px; color: var(--text); text-align: right; flex: 1; font-weight: 500; }
.confirm-row .cv .extra { font-size: 11px; color: var(--text2); display: block; font-weight: 400; margin-top: 2px; }
.confirm-row .edit-btn { font-size: 11px; color: var(--orange); padding: 2px 6px; }

/* Success view */
.success {
  display: flex; flex-direction: column; align-items: center; gap: 14px;
  padding: 36px 16px 24px; text-align: center;
}
.success-icon {
  width: 60px; height: 60px; border-radius: 50%;
  background: var(--green); color: #fff;
  display: grid; place-items: center;
}
.success-icon svg { width: 28px; height: 28px; }
.success h3 { font-size: 17px; margin: 0; color: var(--text); }
.success p { font-size: 12px; margin: 0; color: var(--text2); line-height: 1.5; }

/* Month picker */
.month-cal {
  display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px;
  padding: 10px 0;
}
.month-head-row { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; margin-bottom: 4px; }
.month-head-cell { font-size: 10px; color: var(--muted); text-align: center; font-weight: 600; letter-spacing: 0.06em; }
.month-day {
  height: 40px;
  display: grid; place-items: center;
  background: transparent; color: var(--text);
  font-size: 13px; font-weight: 500;
  border-radius: var(--radius-sm);
  position: relative;
  transition: background 0.15s;
}
.month-day.muted { color: var(--muted); }
.month-day:active { background: var(--surface2); }
.month-day.sel { background: var(--orange); color: #fff; font-weight: 700; }
.month-day.today { box-shadow: inset 0 0 0 1px var(--orange); }
.month-day .dot { position: absolute; bottom: 4px; left: 50%; transform: translateX(-50%); width: 4px; height: 4px; border-radius: 50%; background: var(--orange); opacity: 0.6; }
.month-day.sel .dot { background: #fff; opacity: 1; }
.month-nav {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 6px;
}
.month-nav .ml { font-size: 14px; font-weight: 600; color: var(--text); text-transform: capitalize; }

/* Appointment detail */
.det-block { padding: 10px 0; border-bottom: 1px solid var(--border); }
.det-block:last-child { border-bottom: none; }

/* v0.3.2 — Cancelar cita */
.det-actions { padding: 16px 0 4px; }
.btn-cancel {
  width: 100%;
  padding: 14px 16px;
  background: transparent;
  color: #ef4444;
  border: 1px solid #ef4444;
  border-radius: var(--radius-sm);
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.02em;
  cursor: pointer;
  transition: background 0.15s;
}
.btn-cancel:active { background: rgba(239, 68, 68, 0.08); }
.btn-cancel:disabled { opacity: 0.55; cursor: default; }
.det-label { font-size: 10px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 4px; display: block; }
.det-value { font-size: 14px; color: var(--text); font-weight: 500; }
.det-staff { display: inline-flex; align-items: center; gap: 6px; }
.det-staff .dot { width: 9px; height: 9px; border-radius: 50%; }
`;

  // ─────────────────────────────────────────────────────────────────────────
  // Iconos SVG
  // ─────────────────────────────────────────────────────────────────────────
  const ICONS = {
    chevronLeft: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
    chevronRight: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>',
    chevronDown: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3.55-7.16"/><path d="M21 4v5h-5"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>',
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>'
  };

  // ─────────────────────────────────────────────────────────────────────────
  // CUSTOM ELEMENT
  // ─────────────────────────────────────────────────────────────────────────
  class KamisuiteBookingLite extends HTMLElement {
    static get observedAttributes() { return ['response']; }

    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      // ── Estado base ──
      this._fecha = todayISO();
      this._staff = [];
      this._settings = { interval: 30, rowHeight: 56 };
      this._catalogo = [];
      this._serviciosMap = {};
      this._reservasCache = {};
      this._reservasDiasConCitas = new Set();
      this._toastTimer = null;
      // ── Contactos ──
      this._cacheContactosReady = false;
      this._searchResults = [];
      this._searchTimer = null;
      // ── Booking sheet ──
      this._booking = this._emptyBooking();
      // ── Month picker ──
      this._monthOpen = false;
      this._monthAnchor = null;  // ISO del 1° día del mes visualizado
      // ── Appointment detail ──
      this._detail = { open: false, data: null };
      // v0.3.7 — Sheet de creación de bloqueo
      this._bloqueo = this._emptyBloqueo();
      // ── v0.5.1 — Handshake con el page code ──
      // _initRecibido: true en cuanto llega 'init-data'. Corta el retry.
      // _readyTimer / _readyTries: retry loop de 'ready' (patrón literal
      //   del _readyTimer de recepcionProCMS_widget v1.1.55).
      // _refreshTimer: handle del setInterval de refresh de 10 s. Hasta
      //   v0.5.0 no se guardaba y no se limpiaba nunca → intervals
      //   huérfanos acumulados en cada reconexión del custom element.
      this._initRecibido = false;
      this._readyTries = 0;
      this._readyTimer = null;
      this._refreshTimer = null;
      // ── v0.5.4 — Cliente conservado entre aperturas del sheet ──
      // Al cerrar el sheet sin completar la reserva (✕, scrim, o cierre
      // accidental), se guarda aquí el cliente ya elegido para restaurarlo
      // en la siguiente apertura. Shape:
      //   { client, newClient, provClient, query, ts }
      // Caduca a los CLIENTE_TTL_MS para que no se arrastre un cliente de
      // hace media hora a una reserva que no le corresponde.
      this._clientePendiente = null;
    }

    // v0.3.7 — Estado inicial del sheet de bloqueo.
    _emptyBloqueo() {
      return {
        open: false,
        time: '10:00',         // HH:MM
        duracionMin: 30,       // chip seleccionado
        staffId: null,         // null = primer staff visible al abrir
        motivo: '',            // string libre, opcional
        creating: false
      };
    }

    _emptyBooking() {
      return {
        open: false,
        step: 1,
        client: null,            // {contactId, nombreCompleto, telefono, email}
        newClient: null,         // {nombre, apellido, telefono, email} (si crea nuevo)
        // v0.4.0 — cliente provisional (Punto 3): objeto local sin contactId,
        // no se persiste en CRM. Backend crearPackReserva v1.0.6+ salta
        // ensureContactInCRM al recibir esProvisional:true. Patrón literal
        // Desktop v1.1.12: { nombre, esProvisional:true, contactId:'',
        //                    telefono:'', email:'' }
        provClient: null,
        adding: false,
        // v0.4.0 — flag para pintar el mini-form de cliente provisional
        // en el step 1 (equivalente a `adding` pero para provisional).
        addingProv: false,
        service: null,           // svc del catálogo (V2: con setupUid) — LÍNEA EN EDICIÓN
        // v0.6.0 — ARMADO MÚLTIPLE (paridad Desktop v1.1.81).
        // `lineas` son los servicios YA añadidos a la cita. La primera
        // crea la reserva con crearPackReserva; las siguientes se añaden
        // a ESA MISMA reserva con agregarServicioReserva → un solo pack,
        // un solo total, un solo cobro, pero cada servicio se pinta como
        // su propio bloque en el calendario (una .appt por fase ocupante).
        // Shape de cada línea:
        //   { svc, variantIdx, complementosSel, exclusivosSel, label, precio }
        lineas: [],
        // Cola de líneas pendientes de añadir tras crear la reserva.
        // Se llena en _confirmBooking y se consume en _onReservaCreada /
        // case 'servicio-agregado'.
        cadenaPendiente: [],
        cadenaReservaId: null,
        // v0.3.1 — acordeón step 2: null = todos plegados; string = grupo abierto
        expandedGroup: null,
        // v0.3.0 — modelo V2 plano: variantes (índice) + complementos (Map setupUid→bool)
        // v0.5.0 — modelo con VARIANTE BASE del catálogo.
        //   variantIdx: -1  → BASE del servicio (svc.price + svc.duration
        //                     del catálogo). Es lo que actúa como "M".
        //                     Al confirmar NO se envía varianteSel — el
        //                     backend crearPackReserva usa base
        //                     (comportamiento pre-v1.0.25).
        //   variantIdx: 0..N → variante del array svc.variantes[i].
        //                     Al confirmar SE envía varianteSel con
        //                     precio/duración/label de la variante
        //                     elegida (patrón v1.0.25 del motor +
        //                     v1.1.43 del widget Desktop).
        variantIdx: -1,          // índice en svc.variantes[] (-1 = base)
        complementosSel: {},     // { [setupUid]: true|false }
        // v0.4.0 — grupo exclusivo (Punto 1). Estado por groupKey (string
        // 'exc:<idx>' donde idx es la posición del item tipo:'exclusivo' en
        // svc.mapeoFases). Valor = setupUid del servicio elegido, o
        // ausencia del key = "No añadir". Al confirmar se convierte a
        // objetos { uid, varianteId, varianteLabel, price, duration }
        // que se empujan al array complementosSetupUid — patrón Desktop
        // v1.1.59; el motor construirFasesPack v1.0.34 los materializa.
        exclusivosSel: {},
        emp: null,
        time: null,              // HH:MM
        query: '',
        creating: false,
        done: false,
        doneData: null
      };
    }

    connectedCallback() {
      if (!document.getElementById('kamisuite-bookinglite-font')) {
        const link = document.createElement('link');
        link.id = 'kamisuite-bookinglite-font';
        link.rel = 'stylesheet';
        link.href = 'https://fonts.googleapis.com/css2?family=Bai+Jamjuree:wght@300;400;500;600;700&display=swap';
        document.head.appendChild(link);
      }
      this._renderShell();
      this._bindBaseEvents();

      // v0.5.1 — RESCATE DE REMONTAJE (patrón Desktop v1.1.66).
      // Wix puede desconectar y reconectar el custom element durante la
      // hidratación o un relayout. En ese segundo connectedCallback,
      // _renderShell acaba de repintar el placeholder estático
      // "Cargando agenda…", pero los datos YA están en memoria y el retry
      // de 'ready' no re-dispara porque _initRecibido ya es true → la
      // pantalla se quedaría colgada sin rescate posible. Repintamos con
      // lo que haya. En el PRIMER montaje _staff está vacío y esto es
      // no-op: comportamiento idéntico a v0.5.0.
      if (this._staff.length) {
        this._renderCalendarHeader();
        // v0.5.2 — y refrescar las citas del día visible: si el remontaje
        // ocurrió antes de que llegaran, el calendario quedaría con las
        // columnas pintadas y sin citas hasta el siguiente tick de 10 s.
        this._sendToPage('get-reservas-dia', { fecha: this._fecha });
      }

      this._sendToPage('ready', {});

      // v0.5.1 — RETRY LOOP DE 'ready'. Copia literal del patrón
      // _readyTimer de recepcionProCMS_widget v1.1.55 (700 ms, 12 intentos).
      //
      // Motivo: el page code engancha su listener dentro de $w.onReady. Por
      // la carrera de tiempos de Wix, el dispatchEvent de arriba puede caer
      // antes de que ese listener exista y se pierde SIN dejar rastro en
      // logs (verificado en producción KALÓNICE: en los logs nunca aparece
      // un segundo "📱 CE listo" provocado por el custom element; el único
      // que aparece es el kickoff proactivo del page code). Sin este retry
      // la carga de la agenda depende de que el kickoff gane la carrera, y
      // cuando la pierde el cuelgue es permanente.
      //
      // Page code v0.3.6 hace handleReady idempotente: si ya tiene staff y
      // catálogo en memoria reenvía 'init-data' sin volver a llamar al
      // backend. Por eso reintentar es barato.
      this._readyTries = 0;
      this._readyTimer = setInterval(() => {
        if (this._initRecibido || this._readyTries >= 12) {
          clearInterval(this._readyTimer);
          this._readyTimer = null;
          return;
        }
        this._readyTries++;
        console.log(`${TAG} → reintento ready #${this._readyTries}`);
        this._sendToPage('ready', {});
      }, 700);

      // Refresh automático cada 10s (igual que kamisuiteAgenda.js líneas 612-617)
      // v0.5.1 — handle guardado en _refreshTimer para poder limpiarlo en
      // disconnectedCallback. Antes se creaba anónimo en cada montaje.
      this._refreshTimer = setInterval(() => {
        if (this._lastDateChange && Date.now() - this._lastDateChange < 5000) return;
        // No refrescar si hay sheets abiertos
        if (this._booking.open || this._monthOpen || this._detail.open || this._bloqueo.open) return;
        this._sendToPage('get-reservas-dia', { fecha: this._fecha });
      }, 10000);
      console.log(`${TAG} 📱 Montado. Fecha inicial: ${this._fecha}`);
    }

    // v0.5.1 — NUEVO. Limpia ambos timers al desconectar el elemento.
    // Sin esto, cada reconexión del custom element por parte de Wix dejaba
    // vivo el setInterval de refresh anterior: N intervals huérfanos
    // pidiendo reservas cada 10 s contra el backend.
    disconnectedCallback() {
      if (this._readyTimer) { clearInterval(this._readyTimer); this._readyTimer = null; }
      if (this._refreshTimer) { clearInterval(this._refreshTimer); this._refreshTimer = null; }
    }

    attributeChangedCallback(name, oldVal, newVal) {
      if (name !== 'response' || !newVal || oldVal === newVal) return;
      let p;
      try { p = JSON.parse(newVal); } catch (e) { console.error(`${TAG} JSON parse:`, e); return; }
      this._handleResponse(p);
    }

    _sendToPage(type, data = {}) {
      this.dispatchEvent(new CustomEvent('booking-message', {
        detail: { type, ...data },
        bubbles: true, composed: true
      }));
    }

    // ═══════════════════════════════════════════════════════════════════════
    // HANDLER DE RESPUESTAS DEL PAGE CODE
    // ═══════════════════════════════════════════════════════════════════════
    _handleResponse(p) {
      switch (p.type) {
        case 'init-data': {
          // v0.5.1 — Handshake completado: corta el retry de 'ready'.
          // v0.5.2 — ELIMINADA la guarda _initDuplicado de v0.5.1. Era una
          // optimización para no repetir el preload de 30 días si un retry
          // de 'ready' se cruzaba con el 'init-data' original, y provocó una
          // REGRESIÓN: en producción KALÓNICE (logs 6-ago-2026 00:01) la cola
          // de peticiones no se envió NUNCA tras el init — sin
          // 'get-reservas-dia' inicial la agenda quedaba vacía hasta que el
          // operador navegaba a otro día y volvía. La cola se envía siempre.
          this._initRecibido = true;
          if (this._readyTimer) { clearInterval(this._readyTimer); this._readyTimer = null; }
          // v0.3.0 — Staff V2 (getStaffColumnas): {wixResourceId, wixScheduleId,
          // displayName, isExternal, profileImage}. Normalizo a forma legacy
          // {id, name, color, scheduleId, isExternal, profileImage} para no
          // tocar el resto del widget. Color por defecto desde STAFF_COLORS
          // (paleta literal del desktop V2). settings-data puede sobreescribir
          // luego (mismo flujo V1).
          this._staff = (p.staff || []).map((s, i) => ({
            id: s.wixResourceId || s.id || '',
            name: s.displayName || s.name || '',
            color: STAFF_COLORS[i % STAFF_COLORS.length],
            scheduleId: s.wixScheduleId || s.scheduleId || '',
            isExternal: !!s.isExternal,
            profileImage: s.profileImage || ''
          }));
          this._catalogo = p.catalogo || [];
          this._serviciosMap = {};
          // v0.3.0 — Identidad CMS-first: setupUid
          this._catalogo.forEach(s => { if (s.setupUid) this._serviciosMap[s.setupUid] = s; });
          this._initStaffConfig();
          this._renderCalendarHeader();
          console.log(`${TAG} 🎯 Init: ${this._staff.length} staff, ${this._catalogo.length} servicios`);
          // v0.5.2 — Cola SIEMPRE, sin condiciones (comportamiento v0.5.0).
          // Nunca volver a condicionar estas tres líneas: son las que
          // cargan la agenda del día. Si un retry cruzado provoca un
          // segundo envío, el coste es un preload repetido; el coste de
          // no enviarlas es una agenda en blanco.
          this._sendToPage('get-reservas-dia', { fecha: this._fecha });
          this._sendToPage('preload-reservas', { fechaBase: this._fecha, dias: PRELOAD_DAYS });
          // v0.3.0 — Pide settings del usuario (CalendarViewSettings).
          // Llega como 'settings-data' y aplica staffConfig si existe.
          this._sendToPage('get-settings', {});
          break;
        }

        case 'reservas-dia':
          if (p.fecha) {
            // Race condition guard: descarta respuesta tardía si ya cambiamos de fecha
            // (mismo patrón que PRO línea 642)
            this._reservasCache[p.fecha] = p.reservas || [];
            if ((p.reservas || []).length) this._reservasDiasConCitas.add(p.fecha);
            else this._reservasDiasConCitas.delete(p.fecha);
            if (p.fecha === this._fecha) this._renderCalendarBody();
            this._updateWeekbar();
            if (this._monthOpen) this._renderMonthBody();
          }
          break;

        case 'reservas-rango':
          if (p.porFecha && typeof p.porFecha === 'object') {
            for (const fecha in p.porFecha) {
              this._reservasCache[fecha] = p.porFecha[fecha] || [];
              if ((p.porFecha[fecha] || []).length) this._reservasDiasConCitas.add(fecha);
            }
            this._updateWeekbar();
            if (this._monthOpen) this._renderMonthBody();
          }
          break;

        case 'contactos-cache-ready':
          this._cacheContactosReady = true;
          console.log(`${TAG} 👥 Cache clientes: ${p.total} disponibles`);
          // Si el sheet está abierto en step 1, refrescamos
          if (this._booking.open && this._booking.step === 1) this._renderBookingBody();
          break;

        case 'clientes-encontrados':
          this._searchResults = p.clientes || [];
          if (this._booking.open && this._booking.step === 1) this._renderBookingBody();
          break;

        case 'contacto-creado':
          this._onContactoCreado(p.data || {});
          break;

        case 'settings-data':
          // v0.3.0 — CalendarViewSettings (CMS por _owner). Mismo patrón
          // que desktop V2. Aplica staffConfig sobre el actual:
          // sobreescribe color/visible/position por wixResourceId.
          if (p.settings && typeof p.settings === 'object') {
            const incoming = p.settings.staffConfig || {};
            const cur = this._settings.staffConfig || {};
            for (const k in incoming) {
              cur[k] = { ...(cur[k] || {}), ...(incoming[k] || {}) };
            }
            this._settings = { ...this._settings, ...p.settings, staffConfig: cur };
            // Repintar columnas y reservas con los nuevos colores/orden
            this._renderCalendarHeader();
          }
          break;

        case 'reserva-creada':
          this._onReservaCreada(p);
          break;

        // v0.6.0 — ARMADO MÚLTIPLE: respuesta a 'agregar-servicio'.
        case 'servicio-agregado':
          this._onServicioAgregado(p);
          break;

        case 'reserva-cancelada':
          this._onReservaCancelada(p);
          break;

        case 'bloqueoCreado':
          this._bloqueo.creating = false;
          if (p.ok) {
            this._closeBloqueoSheet();
            this._toast(`Bloqueo creado · ${p.motivo || ''}`);
            this._sendToPage('get-reservas-dia', { fecha: this._fecha });
          } else {
            this._toast('Error: ' + (p.error?.message || 'desconocido'));
            if (this._bloqueo.open) this._renderBloqueoFoot();
          }
          break;

        case 'bloqueoEliminado':
          if (p.ok) {
            this._toast('Bloqueo eliminado');
            this._sendToPage('get-reservas-dia', { fecha: this._fecha });
          } else {
            this._toast('Error: ' + (p.error?.message || 'desconocido'));
          }
          break;

        case 'bloqueoActualizado':
          if (p.ok) {
            this._toast(`Bloqueo actualizado · ${p.motivo || ''}`);
            this._sendToPage('get-reservas-dia', { fecha: this._fecha });
          } else {
            this._toast('Error: ' + (p.error?.message || 'desconocido'));
          }
          break;

        case 'error':
          console.error(`${TAG} ❌ Error:`, p.message);
          this._toast(p.message || 'Error');
          break;

        default:
          console.warn(`${TAG} Tipo desconocido: ${p.type}`);
      }
    }

    // ─────────────────────────────────────────────────────────────────────
    // Patrón staff/visible LITERAL de kamisuiteAgenda.js (PRO) líneas 763-765.
    // No tocar la lógica ni los nombres de campo.
    // ─────────────────────────────────────────────────────────────────────
    _initStaffConfig() {
      if (!this._settings.staffConfig) this._settings.staffConfig = {};
      const cfg = this._settings.staffConfig;
      let pos = 1;
      for (const s of this._staff) {
        if (!cfg[s.id]) {
          cfg[s.id] = { visible: true, color: s.color || '#7c3aed', position: pos };
        }
        pos++;
      }
    }
    _getVisibleStaff() {
      const cfg = this._settings.staffConfig || {};
      return this._staff
        .filter(s => cfg[s.id]?.visible !== false)
        .sort((a, b) => (cfg[a.id]?.position || 99) - (cfg[b.id]?.position || 99));
    }
    _staffColor(rid) {
      return this._settings.staffConfig?.[rid]?.color || '#7c3aed';
    }

    // ═══════════════════════════════════════════════════════════════════════
    // RENDER: shell principal
    // ═══════════════════════════════════════════════════════════════════════
    _renderShell() {
      this.shadowRoot.innerHTML = `
        <style>${CSS}</style>
        <div class="phone">
          <header class="header">
            <div class="brand">
              <span class="logo">KAMISUITE</span>
              <span class="sub">Recepción Mobile LITE</span>
            </div>
            <div style="display:flex;align-items:center">
              <button class="btn-refresh" id="btnRefresh" aria-label="Actualizar">${ICONS.refresh}</button>
              <button class="btn-today" id="btnToday">Hoy</button>
            </div>
          </header>
          <div class="datenav">
            <div class="datenav-row">
              <button class="datenav-arrow" id="prevDay" aria-label="Día anterior">${ICONS.chevronLeft}</button>
              <button class="datenav-label" id="dateLabel">
                <div class="day"><span id="dayText"></span><span class="datenav-caret">${ICONS.chevronDown}</span></div>
                <div class="month" id="monthText"></div>
              </button>
              <button class="datenav-arrow" id="nextDay" aria-label="Día siguiente">${ICONS.chevronRight}</button>
            </div>
            <div class="weekbar" id="weekbar"></div>
          </div>
          <div class="cal-wrap" id="calWrap">
            <div class="cal-loading">Cargando agenda…</div>
          </div>

          <!-- v0.3.7 — FAB: abre el sheet de bloqueo manual -->
          <button class="fab" id="fab" aria-label="Nuevo bloqueo">${ICONS.plus}</button>

          <!-- ── Booking Sheet ── -->
          <div class="scrim" id="bookScrim"></div>
          <div class="sheet" id="bookSheet" role="dialog" aria-modal="true">
            <div class="sheet-grip"></div>
            <div class="sheet-head" id="bookHead"></div>
            <div class="sheet-body" id="bookBody"></div>
            <div class="sheet-foot" id="bookFoot"></div>
          </div>

          <!-- ── v0.3.7 — Bloqueo Sheet ── -->
          <div class="scrim" id="bloqScrim"></div>
          <div class="sheet" id="bloqSheet" role="dialog" aria-modal="true">
            <div class="sheet-grip"></div>
            <div class="sheet-head">
              <div class="sheet-titlerow">
                <span class="sheet-stepno">Bloqueo</span>
                <span class="sheet-title">Nuevo bloqueo</span>
                <button class="sheet-close" id="bloqClose">✕</button>
              </div>
            </div>
            <div class="sheet-body" id="bloqBody"></div>
            <div class="sheet-foot" id="bloqFoot"></div>
          </div>

          <!-- ── Month Picker Sheet ── -->
          <div class="scrim" id="monthScrim"></div>
          <div class="sheet" id="monthSheet" role="dialog" aria-modal="true">
            <div class="sheet-grip"></div>
            <div class="sheet-head">
              <div class="sheet-titlerow">
                <span class="sheet-stepno">Calendario</span>
                <span class="sheet-title" id="monthTitle"></span>
                <button class="sheet-close" id="monthClose">✕</button>
              </div>
            </div>
            <div class="sheet-body" id="monthBody"></div>
          </div>

          <!-- ── Appointment Detail Sheet ── -->
          <div class="scrim" id="detailScrim"></div>
          <div class="sheet" id="detailSheet" role="dialog" aria-modal="true">
            <div class="sheet-grip"></div>
            <div class="sheet-head">
              <div class="sheet-titlerow">
                <span class="sheet-stepno">Reserva</span>
                <span class="sheet-title">Detalle</span>
                <button class="sheet-close" id="detailClose">✕</button>
              </div>
            </div>
            <div class="sheet-body" id="detailBody"></div>
          </div>

          <div class="toast" id="toast"></div>
        </div>
      `;
      this._updateDateLabel();
      this._updateWeekbar();
    }

    _updateDateLabel() {
      const R = this.shadowRoot;
      const d = isoDate(this._fecha);
      const dayEl = R.getElementById('dayText');
      const monthEl = R.getElementById('monthText');
      if (dayEl) dayEl.textContent = `${DAY_ABBR_ES[d.getDay()]} ${d.getDate()}`;
      if (monthEl) monthEl.textContent = `${MONTHS_ES[d.getMonth()]} ${d.getFullYear()}`;
      const isToday = this._fecha === todayISO();
      const btn = R.getElementById('btnToday');
      if (btn) btn.classList.toggle('is-today', isToday);
    }

    _updateWeekbar() {
      const R = this.shadowRoot;
      const wb = R.getElementById('weekbar');
      if (!wb) return;
      const start = startOfWeekISO(this._fecha);
      let html = '';
      for (let i = 0; i < 7; i++) {
        const iso = addDaysISO(start, i);
        const d = isoDate(iso);
        const sel = iso === this._fecha;
        const hasAppts = this._reservasDiasConCitas.has(iso);
        html += `
          <button class="weekday ${sel?'sel':''} ${hasAppts?'has-appts':''}" data-iso="${iso}">
            <span class="wd-letter">${WEEKDAY_LETTERS[i]}</span>
            <span class="wd-num">${d.getDate()}</span>
            <span class="wd-dot"></span>
          </button>`;
      }
      wb.innerHTML = html;
      wb.querySelectorAll('.weekday').forEach(btn => {
        btn.addEventListener('click', () => this._navigateTo(btn.dataset.iso));
      });
    }

    _renderCalendarHeader() {
      const R = this.shadowRoot;
      const wrap = R.getElementById('calWrap');
      if (!wrap) return;
      const visible = this._getVisibleStaff();
      if (!visible.length) {
        wrap.innerHTML = '<div class="cal-loading">No hay personal configurado</div>';
        return;
      }

      // v0.3.1 — Cálculo dinámico de ancho de columna. Si las columnas no
      // llenan el viewport, se estiran para ocupar el ancho disponible
      // (adiós a la columna fantasma a la derecha). Si son muchas y no
      // caben, se mantienen en MIN_COL_W con scroll horizontal.
      const gutterW = 46;  // = var(--gutter-w)
      const wrapW = wrap.clientWidth || 0;
      const availW = Math.max(0, wrapW - gutterW);
      const minTotal = visible.length * MIN_COL_W;
      const colW = (availW > minTotal && visible.length > 0)
        ? Math.floor(availW / visible.length)
        : MIN_COL_W;
      wrap.style.setProperty('--col-w', colW + 'px');

      const headHTML = visible.map(s => `
        <div class="emp-head">
          <span class="emp-dot" style="background:${esc(this._staffColor(s.id))}"></span>
          <span class="emp-name">${esc(s.name||'')}</span>
        </div>
      `).join('');

      const totalMin = (CAL_END_H - CAL_START_H) * 60;
      const nSlots = Math.ceil(totalMin / SLOT_MIN);
      const bodyH = nSlots * 56;

      let timeCells = '';
      for (let i = 0; i < nSlots; i++) {
        const absMin = CAL_START_H * 60 + i * SLOT_MIN;
        const isHour = absMin % 60 === 0;
        timeCells += `<div class="time-cell ${isHour?'':'half'}">${isHour?`<span class="t">${fmtTime(absMin)}</span>`:''}</div>`;
      }

      let colsHTML = '';
      for (const s of visible) {
        let slotsHTML = '';
        for (let i = 0; i < nSlots; i++) {
          const absMin = CAL_START_H * 60 + i * SLOT_MIN;
          const isHour = absMin % 60 === 0;
          slotsHTML += `<div class="slot ${isHour?'':'half'}" data-staff="${esc(s.id)}" data-min="${absMin}"></div>`;
        }
        colsHTML += `<div class="day-col" style="height:${bodyH}px">${slotsHTML}</div>`;
      }

      wrap.innerHTML = `
        <div class="cal-inner">
          <div class="cal-headrow">
            <div class="cal-corner"></div>
            ${headHTML}
          </div>
          <div class="cal-bodyrow" id="calBody">
            <div class="time-gutter" style="height:${bodyH}px">${timeCells}</div>
            ${colsHTML}
          </div>
        </div>
      `;
      // Slot tap → abrir booking sheet con prefill
      wrap.querySelectorAll('.slot').forEach(slot => {
        slot.addEventListener('click', () => {
          const empId = slot.dataset.staff;
          const absMin = parseInt(slot.dataset.min, 10);
          this._openBookingSheet({ emp: empId, time: fmtTime(absMin) });
        });
      });
      this._renderCalendarBody();
    }

    _renderCalendarBody() {
      const R = this.shadowRoot;
      const calBody = R.getElementById('calBody');
      if (!calBody) return;

      calBody.querySelectorAll('.appt').forEach(el => el.remove());
      calBody.querySelectorAll('.appt-ext').forEach(el => el.remove());   // v0.3.4
      calBody.querySelectorAll('.appt-bloq').forEach(el => el.remove());  // v0.3.6
      calBody.querySelectorAll('.now-line').forEach(el => el.remove());

      // v0.3.3 — descarta canceladas (mismo patrón desktop V2)
      // v0.3.6 — separa BLOQUEOS para pintarlos en bucle aparte (patrón del doc sec. 5.1-5.2)
      const rawData = (this._reservasCache[this._fecha] || [])
        .filter(r => r && r.status !== 'CANCELADA');
      const reservas = rawData.filter(r => r.family !== 'BLOQUEO');
      const bloqueos = rawData.filter(r => r.family === 'BLOQUEO');

      const cols = Array.from(calBody.querySelectorAll('.day-col'));
      const visible = this._getVisibleStaff();
      const colByStaff = {};
      visible.forEach((s, idx) => { colByStaff[s.id] = cols[idx]; });

      let renderizados = 0;
      let descartados = 0;
      let extensiones = 0;
      let bloqRender = 0;

      // v0.3.0 — Iteración de fases. Cada reserva V2 trae fases[]. Pinta
      // UNA .appt por fase ocupante. PROCESO (ocupa:false) NO se pinta:
      // deja hueco (libera al stylist — concepto fundacional).
      // v0.3.5 — Tras la última fase ocupante de la reserva, si
      // r.extensionMin > 0, pinta un bloque rayado "EXTENSIÓN · N MIN"
      // en la columna de r.staffId (raíz). Algoritmo literal de
      // widgetPublicoLogic v0.6.2.
      for (const r of reservas) {
        // Defensivo: r.fases puede venir como Array o como {items:[...]}
        const fases = Array.isArray(r.fases)
          ? r.fases
          : (r.fases && Array.isArray(r.fases.items) ? r.fases.items : []);
        const extMin = Number(r.extensionMin) || 0;

        // Fallback: reserva sin fases (legacy o medida) → un único bloque.
        if (!fases.length) {
          const staffId = r.staffId;
          const col = colByStaff[staffId];
          if (!col) { descartados++; continue; }
          const startMin = isoToMinMadrid(r.fechaReserva);
          if (startMin == null) { descartados++; continue; }
          const dur = (typeof r.duracionTotal === 'number' && r.duracionTotal > 0) ? r.duracionTotal : 30;
          this._pintarAppt(col, staffId, startMin, dur, r.clientName || '—', r.title || '', r, null);
          renderizados++;
          // v0.3.5 — extensión tras la cita, en columna de r.staffId
          if (extMin > 0) {
            const ok = this._pintarExtension(col, startMin + dur, extMin);
            if (ok) extensiones++;
            else console.warn(`${TAG} ⚠️ extMin=${extMin} no pintada (reserva ${r._id})`);
          }
          continue;
        }

        // Trackeo del max(endMin) de las fases ocupantes para anclar la extensión
        let maxEndMin = null;

        for (const f of fases) {
          if (!f) continue;
          if (f.ocupa === false) continue;            // PROCESO: salta
          const staffId = f.staffId || r.staffId;     // override por drag&drop V2
          const col = colByStaff[staffId];
          if (!col) { descartados++; continue; }
          const startMin = isoToMinMadrid(f.start);
          if (startMin == null) { descartados++; continue; }
          let dur = (typeof f.dur === 'number' && f.dur > 0) ? f.dur : null;
          if (dur == null) {
            const endMin = isoToMinMadrid(f.end);
            dur = (endMin != null) ? (endMin - startMin) : 30;
          }
          // Title: cliente. Subtitle: label de la fase (Aplicación, Lavado, Peinado M...)
          const ok = this._pintarAppt(col, staffId, startMin, dur, r.clientName || '—', f.label || '', r, f);
          if (ok) renderizados++; else descartados++;
          const endMin = startMin + dur;
          if (maxEndMin == null || endMin > maxEndMin) maxEndMin = endMin;
        }

        // v0.3.5 — Extensión anclada al fin de la última fase ocupante,
        // en columna de r.staffId (raíz de la reserva). NO de la fase.
        if (extMin > 0 && maxEndMin != null) {
          const col = colByStaff[r.staffId];
          if (col) {
            const ok = this._pintarExtension(col, maxEndMin, extMin);
            if (ok) extensiones++;
            else console.warn(`${TAG} ⚠️ extMin=${extMin} fuera de rango (reserva ${r._id})`);
          } else {
            console.warn(`${TAG} ⚠️ extMin=${extMin} staffId raíz ${r.staffId} no visible (reserva ${r._id})`);
          }
        }
      }

      // v0.3.6 — Bucle de bloqueos (family === 'BLOQUEO').
      // Patrón literal del documento sec. 5.2-5.3: lee motivo de
      // fases.items[0].label o de clientName.startsWith('BLOQUEO:').
      for (const r of bloqueos) {
        const col = colByStaff[r.staffId];
        if (!col) { descartados++; continue; }
        const startMin = isoToMinMadrid(r.fechaReserva);
        if (startMin == null) { descartados++; continue; }
        const dur = (typeof r.duracionTotal === 'number' && r.duracionTotal > 0) ? r.duracionTotal : 30;

        const fasesArr = Array.isArray(r.fases) ? r.fases : (r.fases?.items || []);
        let motivo = (fasesArr[0] && fasesArr[0].label) || '';
        if (!motivo && typeof r.clientName === 'string' && r.clientName.startsWith('BLOQUEO:')) {
          motivo = r.clientName.substring(8).trim();   // 8 = 'BLOQUEO:'.length
        }
        if (!motivo) motivo = 'Bloqueado';

        const ok = this._pintarBloqueo(col, startMin, dur, motivo, r);
        if (ok) bloqRender++; else descartados++;
      }

      console.log(`${TAG} 🎨 Render ${this._fecha}: ${renderizados} fases · ${extensiones} extensiones · ${bloqRender} bloqueos (${descartados} descartadas)`);

      if (this._fecha === todayISO()) {
        const nowM = madridNowMin();
        if (nowM >= CAL_START_H * 60 && nowM <= CAL_END_H * 60) {
          const top = (nowM - CAL_START_H * 60) * (56 / SLOT_MIN);
          const line = document.createElement('div');
          line.className = 'now-line';
          line.style.top = top + 'px';
          calBody.appendChild(line);
        }
      }
    }

    // v0.3.4 — Helper de pintado del bloque rayado de extensión.
    // No clicable, solo informativo. Color base gris para que se note como
    // "tiempo extra que bloquea" sin confundirse con la cita en sí.
    _pintarExtension(col, startMin, extMin) {
      if (extMin <= 0) return false;
      const top = (startMin - CAL_START_H * 60) * (56 / SLOT_MIN);
      const height = Math.max(extMin * (56 / SLOT_MIN) - 4, 16);
      if (top < 0) return false;
      const el = document.createElement('div');
      el.className = 'appt-ext';
      el.style.top = (top + 2) + 'px';
      el.style.height = height + 'px';
      el.textContent = `EXTENSIÓN · ${extMin} MIN`;
      col.appendChild(el);
      return true;
    }

    // v0.3.6 — Helper de pintado del bloqueo manual. Clicable: abre el
    // menú de acciones (editar motivo / eliminar). Reserva entera en
    // closure para acceder a _id en el click.
    // v0.3.8 — Rayado con el color del staff (patrón V1).
    _pintarBloqueo(col, startMin, dur, motivo, reservaBloqueo) {
      const top = (startMin - CAL_START_H * 60) * (56 / SLOT_MIN);
      const height = Math.max(dur * (56 / SLOT_MIN) - 4, 18);
      if (top < 0) return false;
      const el = document.createElement('div');
      el.className = 'appt-bloq';
      el.style.top = (top + 2) + 'px';
      el.style.height = height + 'px';
      // v0.3.8 — color del staff dueño del bloqueo, vía CSS variable
      el.style.setProperty('--bloq-color', this._staffColor(reservaBloqueo.staffId));
      el.innerHTML = `
        <span class="bl-lbl">BLOQUEO</span>
        ${height > 30 ? `<span class="bl-motivo">${esc(motivo)}</span>` : ''}
      `;
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        this._onBloqueoClick(reservaBloqueo, motivo);
      });
      col.appendChild(el);
      return true;
    }

    // v0.3.6 — Menú nativo al pulsar un bloqueo: editar motivo o eliminar.
    // Patrón literal del documento sec. 5.5 (window.prompt + confirm).
    _onBloqueoClick(r, motivoActual) {
      const id = r?._id;
      if (!id) return;
      const opciones = `Bloqueo: "${motivoActual}"\n\n¿Qué quieres hacer?\n\n[Aceptar] Editar motivo\n[Cancelar] Eliminar bloqueo`;
      const editar = confirm(opciones);
      if (editar) {
        const nuevo = window.prompt('Motivo del bloqueo:', motivoActual);
        if (nuevo === null) return;
        this._sendToPage('actualizarBloqueo', { id, motivo: (nuevo || '').trim() || 'Bloqueado' });
      } else {
        if (!confirm('¿Eliminar este bloqueo?')) return;
        this._sendToPage('eliminarBloqueo', { id });
      }
    }

    // v0.3.0 — Helper de pintado de un bloque .appt. Click → detail con
    // la RESERVA ENTERA (no la fase), mismo patrón que desktop V2.
    _pintarAppt(col, staffId, startMin, dur, title, subtitle, reservaCompleta, fase) {
      const top = (startMin - CAL_START_H * 60) * (56 / SLOT_MIN);
      const height = dur * (56 / SLOT_MIN) - 4;
      if (height < 14 || top < 0) return false;

      const color = this._staffColor(staffId);
      const apptEl = document.createElement('div');
      apptEl.className = 'appt';
      apptEl.style.top = (top + 2) + 'px';
      apptEl.style.height = height + 'px';
      apptEl.style.background = color;

      const startHHmm = fmtTime(startMin);
      // v0.4.0 — Umbral de leyenda bajado de 32px a 20px para que
      // fases cortas (Lavado 15min, Secado 15min…) muestren su label
      // sin necesidad de abrir el detail. Antes solo se veían subtitles
      // en bloques ≥30min (32px / (56/30)) — hoy visibles ya desde
      // ≈15min (20px). El bloque mínimo pintable sigue siendo 14px (ver
      // línea `if (height < 14 || top < 0) return false;`).
      apptEl.innerHTML = `
        <span class="ap-time">${esc(startHHmm)}</span>
        <span class="ap-client">${esc(title)}</span>
        ${(height > 20 && subtitle) ? `<span class="ap-service">${esc(subtitle)}</span>` : ''}
      `;

      apptEl.addEventListener('click', (e) => {
        e.stopPropagation();
        // v0.4.0 — Pasar la fase clicada al detail para pintar chip
        // específico de esa fase (label, hora, duración). Si es legacy
        // (fase=null), _renderDetailBody no pinta el chip y se comporta
        // como antes.
        this._openApptDetail(reservaCompleta, fase);
      });

      col.appendChild(apptEl);
      return true;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // v0.6.0 — ARMADO MÚLTIPLE: helpers de línea
    //   Paridad con Recepción PRO Desktop v1.1.81. Cada "línea" es un
    //   servicio con su variante y sus complementos ya resueltos. La
    //   primera crea la reserva; el resto se añaden a la misma con
    //   agregarServicioReserva (un pack, un cobro, N bloques pintados).
    // ═══════════════════════════════════════════════════════════════════════

    // Construye el array complementosSetupUid de una línea (mezcla de
    // strings y objetos con variante). Extraído de _confirmBooking v0.5.5
    // sin cambios de lógica, para poder reutilizarlo por línea.
    _complementosDeLinea(svc, complementosSel, exclusivosSel) {
      const out = [];
      const svcComps = (svc && Array.isArray(svc.complementos)) ? svc.complementos : [];
      for (const uid of Object.keys(complementosSel || {})) {
        const val = complementosSel[uid];
        if (val === true) {
          out.push(uid);
        } else if (val && typeof val === 'object' && Number.isInteger(val.varianteIdx)) {
          const c = svcComps.find(x => x.setupUid === uid);
          const v = (c && Array.isArray(c.variantes)) ? c.variantes[val.varianteIdx] : null;
          if (v) {
            const vLabel = (typeof v === 'string') ? v : (v.label || v.nombre || '');
            const vId = (typeof v === 'object' && v.tamano_estilo) ? v.tamano_estilo : String(val.varianteIdx);
            const vPrice = (typeof v === 'object') ? Number(v.precio != null ? v.precio : v.price) || 0 : 0;
            const vDur = (typeof v === 'object') ? Number(v.duracion != null ? v.duracion : v.duration) || 0 : 0;
            out.push({ uid, varianteId: vId, varianteLabel: vLabel, price: vPrice, duration: vDur });
          }
        }
      }
      // Grupo exclusivo — mismo shape (patrón Desktop v1.1.59).
      const mapeo = Array.isArray(svc && svc.mapeoFases)
        ? svc.mapeoFases
        : (typeof (svc && svc.mapeoFases) === 'string' ? this._tryParseArr(svc.mapeoFases) : []);
      if (Array.isArray(mapeo) && exclusivosSel) {
        mapeo.forEach((f, idx) => {
          if (!f || f.tipo !== 'exclusivo') return;
          const uidElegido = exclusivosSel['exc:' + idx];
          if (!uidElegido) return;
          const svcRef = this._serviciosMap[uidElegido];
          if (!svcRef) return;
          out.push({
            uid: svcRef.setupUid,
            varianteId: svcRef.setupUid,
            varianteLabel: svcRef.label || '',
            price: Number(svcRef.price) || 0,
            duration: Number(svcRef.duration) || 0
          });
        });
      }
      return out;
    }

    // varianteSel de una línea: null si es la BASE (variantIdx === -1).
    _varianteSelDeLinea(svc, variantIdx) {
      if (!svc || !svc.hasVariants || !Array.isArray(svc.variantes)) return null;
      if (!Number.isInteger(variantIdx) || variantIdx < 0 || variantIdx >= svc.variantes.length) return null;
      const v = svc.variantes[variantIdx];
      if (!v || typeof v !== 'object') return null;
      return {
        idx: variantIdx,
        label: v.label || v.nombre || '',
        price: Number(v.precio != null ? v.precio : v.price) || 0,
        duration: Number(v.duracion != null ? v.duracion : v.duration) || 0
      };
    }

    // Precio estimado de una línea, para el resumen del sheet.
    // Es informativo: el precio real lo calcula el backend.
    _precioDeLinea(linea) {
      if (!linea || !linea.svc) return 0;
      const vs = this._varianteSelDeLinea(linea.svc, linea.variantIdx);
      let total = vs ? vs.price : (Number(linea.svc.price) || 0);
      const comps = this._complementosDeLinea(linea.svc, linea.complementosSel, linea.exclusivosSel);
      const svcComps = Array.isArray(linea.svc.complementos) ? linea.svc.complementos : [];
      for (const c of comps) {
        if (typeof c === 'string') {
          const meta = svcComps.find(x => x.setupUid === c);
          total += Number(meta?.price) || 0;
        } else {
          total += Number(c.price) || 0;
        }
      }
      return Math.round(total * 100) / 100;
    }

    // Etiqueta legible de una línea: "Corte Mujer · L"
    _labelDeLinea(linea) {
      if (!linea || !linea.svc) return '';
      const vs = this._varianteSelDeLinea(linea.svc, linea.variantIdx);
      return vs && vs.label
        ? `${linea.svc.label} · ${vs.label}`
        : (linea.svc.label || '');
    }

    // Convierte la línea EN EDICIÓN (b.service + selecciones) en una línea
    // materializada y la empuja a b.lineas. Devuelve false si falta alguna
    // variante obligatoria.
    _añadirLineaActual() {
      const b = this._booking;
      if (!b.service) return false;
      const faltan = this._faltanVariantesRequiredLabels();
      if (faltan.length) {
        this._toast(`Falta elegir variante de: ${faltan.join(', ')}`);
        return false;
      }
      const linea = {
        svc: b.service,
        variantIdx: b.variantIdx,
        complementosSel: { ...(b.complementosSel || {}) },
        exclusivosSel: { ...(b.exclusivosSel || {}) }
      };
      b.lineas.push(linea);
      // Limpia la línea en edición para poder elegir otro servicio.
      b.service = null;
      b.variantIdx = -1;
      b.complementosSel = {};
      b.exclusivosSel = {};
      return true;
    }

    _quitarLinea(idx) {
      const b = this._booking;
      if (idx < 0 || idx >= b.lineas.length) return;
      b.lineas.splice(idx, 1);
      this._renderBookingBody();
      this._renderBookingFoot();
    }

    _totalLineas() {
      const b = this._booking;
      const enEdicion = b.service
        ? [{ svc: b.service, variantIdx: b.variantIdx, complementosSel: b.complementosSel, exclusivosSel: b.exclusivosSel }]
        : [];
      return b.lineas.concat(enEdicion)
        .reduce((acc, l) => acc + this._precioDeLinea(l), 0);
    }

    _numLineas() {
      const b = this._booking;
      return b.lineas.length + (b.service ? 1 : 0);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // NAVEGACIÓN
    // ═══════════════════════════════════════════════════════════════════════
    _navigateTo(fechaISO) {
      if (!fechaISO || fechaISO === this._fecha) return;
      this._fecha = fechaISO;
      this._lastDateChange = Date.now();
      this._updateDateLabel();
      this._updateWeekbar();
      if (this._reservasCache[fechaISO] !== undefined) {
        this._renderCalendarBody();
      } else {
        const calBody = this.shadowRoot.getElementById('calBody');
        if (calBody) calBody.querySelectorAll('.appt').forEach(el => el.remove());
        this._sendToPage('get-reservas-dia', { fecha: fechaISO });
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // EVENTOS BASE
    // ═══════════════════════════════════════════════════════════════════════
    _bindBaseEvents() {
      const R = this.shadowRoot;
      R.getElementById('btnToday').addEventListener('click', () => this._navigateTo(todayISO()));
      R.getElementById('btnRefresh').addEventListener('click', () => this._manualRefresh());
      // v0.3.7 — FAB abre el sheet de bloqueo
      R.getElementById('fab').addEventListener('click', () => this._openBloqueoSheet());
      R.getElementById('bloqScrim').addEventListener('click', () => this._closeBloqueoSheet());
      R.getElementById('bloqClose').addEventListener('click', () => this._closeBloqueoSheet());
      R.getElementById('prevDay').addEventListener('click', () => this._navigateTo(addDaysISO(this._fecha, -1)));
      R.getElementById('nextDay').addEventListener('click', () => this._navigateTo(addDaysISO(this._fecha, 1)));
      R.getElementById('dateLabel').addEventListener('click', () => this._openMonthPicker());

      R.getElementById('bookScrim').addEventListener('click', () => this._closeBookingSheet());
      R.getElementById('monthScrim').addEventListener('click', () => this._closeMonthPicker());
      R.getElementById('monthClose').addEventListener('click', () => this._closeMonthPicker());
      R.getElementById('detailScrim').addEventListener('click', () => this._closeApptDetail());
      R.getElementById('detailClose').addEventListener('click', () => this._closeApptDetail());
    }

    // ═══════════════════════════════════════════════════════════════════════
    // BOOKING SHEET — open / close
    // ═══════════════════════════════════════════════════════════════════════
    _openBookingSheet(prefill) {
      this._booking = this._emptyBooking();
      this._booking.open = true;
      if (prefill) {
        if (prefill.emp) this._booking.emp = prefill.emp;
        if (prefill.time) this._booking.time = prefill.time;
      }

      // v0.5.4 — Restaura el cliente que ya estaba elegido si el sheet se
      // cerró sin completar la reserva. Cerrar con la ✕ (a menudo por
      // error) obligaba a volver a buscar el cliente desde cero, porque
      // _emptyBooking() arrasa con todo el estado.
      //
      // Solo se restaura el CLIENTE. Servicio, complementos, empleado y
      // hora se resetean siempre: la nueva apertura suele venir de tocar
      // otro slot del calendario, con otra hora y otro empleado.
      //
      // Caduca a los 5 minutos para no arrastrar un cliente antiguo a una
      // reserva que no le corresponde. El chip del step 1 lo deja siempre
      // visible con botón "Quitar" — sin esa señal visual, restaurar sería
      // peligroso (reservar a la persona equivocada sin darse cuenta).
      const cp = this._clientePendiente;
      const vigente = !!cp && (Date.now() - (cp.ts || 0) < CLIENTE_TTL_MS);
      if (vigente) {
        this._booking.client = cp.client || null;
        this._booking.newClient = cp.newClient || null;
        this._booking.provClient = cp.provClient || null;
        this._booking.query = cp.query || '';
        // _searchResults NO se vacía: la lista sigue pintándose con el
        // cliente resaltado, que es la confirmación visual de la elección.
      } else {
        this._clientePendiente = null;
        this._searchResults = [];
      }

      const R = this.shadowRoot;
      R.getElementById('bookScrim').classList.add('open');
      R.getElementById('bookSheet').classList.add('open');
      this._renderBookingSheet();
    }

    // v0.5.4 — Guarda el cliente elegido al cerrar sin completar.
    // Si la reserva se creó (b.done), NO se guarda: la siguiente reserva
    // arranca limpia.
    _guardarClientePendiente(forzar = false) {
      const b = this._booking;
      if (!b) { this._clientePendiente = null; return; }
      // v0.5.5 — `forzar` lo usa _onReservaCreada: tras crear la reserva
      // b.done pasa a true, pero el cliente debe conservarse igualmente
      // para encadenar más reservas de la misma familia.
      if (b.done && !forzar) { this._clientePendiente = null; return; }
      const hayCliente = !!(b.client || b.provClient ||
        (b.newClient && (b.newClient.nombre || b.newClient.apellido)));
      if (!hayCliente) { this._clientePendiente = null; return; }
      this._clientePendiente = {
        client: b.client || null,
        newClient: b.newClient || null,
        provClient: b.provClient || null,
        query: b.query || '',
        ts: Date.now()
      };
    }

    _closeBookingSheet() {
      // v0.5.4 — Antes de descartar el estado, conserva el cliente elegido
      // para la próxima apertura (ver _openBookingSheet).
      this._guardarClientePendiente();
      this._booking.open = false;
      const R = this.shadowRoot;
      R.getElementById('bookScrim').classList.remove('open');
      R.getElementById('bookSheet').classList.remove('open');
    }

    _renderBookingSheet() {
      this._renderBookingHead();
      this._renderBookingBody();
      this._renderBookingFoot();
    }

    _renderBookingHead() {
      const R = this.shadowRoot;
      const head = R.getElementById('bookHead');
      const b = this._booking;
      if (b.done) { head.innerHTML = ''; return; }
      const titles = ['Cliente', 'Servicio', 'Empleado y hora', 'Confirmar'];
      const pips = [1,2,3,4].map(n => {
        const cls = n < b.step ? 'done' : (n === b.step ? 'active' : '');
        return `<div class="step-pip ${cls}"></div>`;
      }).join('');
      head.innerHTML = `
        <div class="sheet-steps">${pips}</div>
        <div class="sheet-titlerow">
          ${b.step > 1
            ? `<button class="sheet-back" id="bkBack">${ICONS.chevronLeft}Atrás</button>`
            : `<span class="sheet-stepno">Paso 1 de 4</span>`}
          <span class="sheet-title">${titles[b.step-1]}</span>
          <button class="sheet-close" id="bkClose">✕</button>
        </div>
      `;
      const back = R.getElementById('bkBack');
      if (back) back.addEventListener('click', () => this._setStep(Math.max(1, b.step - 1)));
      R.getElementById('bkClose').addEventListener('click', () => this._closeBookingSheet());
    }

    _renderBookingFoot() {
      const R = this.shadowRoot;
      const foot = R.getElementById('bookFoot');
      const b = this._booking;
      if (b.done) {
        foot.innerHTML = `<button class="btn-primary" id="bkDoneOk">Cerrar</button>`;
        R.getElementById('bkDoneOk').addEventListener('click', () => this._closeBookingSheet());
        return;
      }
      const canNext = this._canAdvanceStep();
      if (b.step < 4) {
        // v0.3.9 — Paso 2: si hay servicio elegido pero faltan variantes
        // required, el botón sigue clickable para que el click muestre un
        // toast indicando qué falta (botón disabled no dispara eventos).
        // En el resto de pasos, mantiene el disabled visual cuando no se
        // puede avanzar (cliente, empleado, hora — no requieren feedback
        // textual).
        const paso2ConServicio = (b.step === 2 && !!b.service);
        const disabledAttr = (!canNext && !paso2ConServicio) ? 'disabled' : '';
        // v0.6.0 — En el paso 2 el botón muestra el recuento y el total
        // cuando hay más de un servicio armado.
        let labelNext = 'Continuar';
        if (b.step === 2) {
          const n = this._numLineas();
          if (n > 1) labelNext = `Continuar · ${n} servicios · ${this._totalLineas()}€`;
        }
        foot.innerHTML = `<button class="btn-primary" id="bkNext" ${disabledAttr}>${labelNext}</button>`;
        const btn = R.getElementById('bkNext');
        if (btn) btn.addEventListener('click', () => {
          // v0.6.0 — Al salir del paso 2, la línea en edición se cierra
          // automáticamente. Así el flujo de UN solo servicio queda
          // idéntico al de siempre: elegir servicio → Continuar.
          if (b.step === 2 && b.service) {
            if (!this._añadirLineaActual()) return;
          }
          if (this._canAdvanceStep()) {
            this._setStep(Math.min(4, b.step + 1));
          } else if (b.step === 2) {
            const faltan = this._faltanVariantesRequiredLabels();
            if (faltan.length) {
              this._toast(`Falta elegir variante de: ${faltan.join(', ')}`);
            }
          }
        });
      } else {
        // v0.6.0 — Con varias líneas el botón lo indica, y durante la
        // cadena informa de por dónde va.
        const nL = b.lineas.length;
        let labelCrear = `${ICONS.check} Crear reserva`;
        if (nL > 1) labelCrear = `${ICONS.check} Crear cita · ${nL} servicios`;
        let labelCreando = 'Creando…';
        if (b.creating && b.cadenaReservaId && b.cadenaPendiente.length) {
          const hechos = nL - b.cadenaPendiente.length;
          labelCreando = `Añadiendo servicio ${hechos + 1} de ${nL}…`;
        }
        foot.innerHTML = `<button class="btn-primary" id="bkCreate" ${b.creating?'disabled':''}>
          ${b.creating ? labelCreando : labelCrear}
        </button>`;
        const btn = R.getElementById('bkCreate');
        if (btn) btn.addEventListener('click', () => this._confirmBooking());
      }
    }

    _setStep(n) {
      this._booking.step = n;
      this._renderBookingSheet();
    }

    _canAdvanceStep() {
      const b = this._booking;
      const clientLabel = this._currentClientLabel();
      if (b.step === 1) return !!clientLabel;
      // v0.3.9 — Step 2: además de tener servicio elegido, todos los
      // complementos `required:true` con variantes deben tener una
      // variante seleccionada (no hay opción "no añadir" para required;
      // patrón Desktop v1.1.44). Backend valida también como defensa
      // (recepcionProLogic v1.0.29 devuelve faltanVariantes).
      // v0.6.0 — Con armado múltiple, basta con que haya AL MENOS una
      // línea añadida o una línea en edición válida.
      if (b.step === 2) {
        if (!b.service) return b.lineas.length > 0;
        const comps = Array.isArray(b.service.complementos) ? b.service.complementos : [];
        for (const c of comps) {
          if (!c.required) continue;
          const cTieneVars = !!(c.hasVariants && Array.isArray(c.variantes) && c.variantes.length);
          if (!cTieneVars) continue;
          const sel = b.complementosSel[c.setupUid];
          const tieneVarianteElegida = !!(sel && typeof sel === 'object' && Number.isInteger(sel.varianteIdx));
          if (!tieneVarianteElegida) return false;
        }
        return true;
      }
      if (b.step === 3) return !!b.emp && !!b.time;
      return true;
    }

    // v0.3.9 — Lista de labels de complementos required con variantes sin
    // elegir (para el toast cuando el usuario intenta avanzar y no puede).
    _faltanVariantesRequiredLabels() {
      const b = this._booking;
      const comps = (b.service && Array.isArray(b.service.complementos)) ? b.service.complementos : [];
      const faltan = [];
      for (const c of comps) {
        if (!c.required) continue;
        const cTieneVars = !!(c.hasVariants && Array.isArray(c.variantes) && c.variantes.length);
        if (!cTieneVars) continue;
        const sel = b.complementosSel[c.setupUid];
        const tieneVarianteElegida = !!(sel && typeof sel === 'object' && Number.isInteger(sel.varianteIdx));
        if (!tieneVarianteElegida) faltan.push(c.label || '');
      }
      return faltan.filter(Boolean);
    }

    _currentClientLabel() {
      const b = this._booking;
      if (b.client) return b.client.nombreCompleto || (b.client.nombre || '') + ' ' + (b.client.apellido || '');
      if (b.newClient && (b.newClient.nombre || b.newClient.apellido)) {
        return `${b.newClient.nombre || ''} ${b.newClient.apellido || ''}`.trim();
      }
      // v0.4.0 — Cliente provisional (Punto 3). Solo si NO estamos aún en
      // el mini-form (b.addingProv === true) — allí b.provClient.nombre
      // puede ser '', y el step 1 no debe considerarse completo hasta que
      // el operador escriba un nombre y cierre el form (Enter o siguiente).
      if (b.provClient && !b.addingProv && (b.provClient.nombre || '').trim()) {
        return b.provClient.nombre.trim();
      }
      return '';
    }

    // ═══════════════════════════════════════════════════════════════════════
    // BOOKING — body: renderiza el step actual
    // ═══════════════════════════════════════════════════════════════════════
    _renderBookingBody() {
      const R = this.shadowRoot;
      const body = R.getElementById('bookBody');
      const b = this._booking;
      if (b.done) {
        const cl = this._currentClientLabel();
        const empName = (this._getVisibleStaff().find(s => s.id === b.emp) || {}).name || b.emp;
        // v0.6.0 — Resumen con todos los servicios de la cita.
        const svcLabels = b.lineas.map(l => this._labelDeLinea(l)).filter(Boolean);
        const svcTxt = svcLabels.length ? svcLabels.join(' + ') : '';
        const nTxt = b.lineas.length > 1
          ? `<br><span style="color:var(--accent)">${b.lineas.length} servicios · un solo cobro</span>`
          : '';
        body.innerHTML = `
          <div class="success">
            <div class="success-icon">${ICONS.check}</div>
            <h3>Reserva creada</h3>
            <p>${esc(cl)} · ${esc(svcTxt)}<br>${esc(empName)} · ${esc(b.time || '')} · ${esc(this._fecha)}${nTxt}</p>
          </div>
        `;
        return;
      }
      if (b.step === 1) this._renderStepClient(body);
      else if (b.step === 2) this._renderStepService(body);
      else if (b.step === 3) this._renderStepEmpTime(body);
      else if (b.step === 4) this._renderStepConfirm(body);
    }

    // ── STEP 1: cliente ──
    //   v0.4.0 — Añadido Cliente provisional (Punto 3). Botón adicional
    //   "+ Cliente provisional" bajo "+ Cliente nuevo". Al pulsarlo se
    //   abre el mini-form con solo un input de nombre. Al guardar,
    //   b.provClient = { nombre, esProvisional:true } y aparece un chip
    //   naranja en el sidebar indicando el estado. Backend recibe
    //   esProvisional:true y salta ensureContactInCRM. Patrón literal
    //   Desktop v1.1.12.
    _renderStepClient(body) {
      const b = this._booking;
      const cacheReady = this._cacheContactosReady;
      const adding = b.adding;
      const addingProv = b.addingProv;
      let html = `
        <span class="field-label">Cliente</span>
      `;
      // Chip de cliente provisional ya elegido (visible si b.provClient
      // existe y NO estamos en el mini-form de creación).
      if (b.provClient && b.provClient.nombre && !addingProv && !adding) {
        html += `
          <div class="prov-chip" style="display:flex;align-items:center;gap:10px;padding:12px 14px;border:1px solid #f0c879;background:#fff7e0;border-radius:12px;margin-bottom:10px;">
            <div class="avatar" style="background:#e89c1c;color:#fff;">${esc(initials(b.provClient.nombre))}</div>
            <div class="client-info" style="flex:1;">
              <div class="cn" style="display:flex;align-items:center;gap:6px;">${esc(b.provClient.nombre)}<span style="padding:2px 7px;border-radius:999px;background:#e89c1c;color:#fff;font-size:9px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;">provisional</span></div>
              <div class="cm" style="color:#a55b00;font-style:italic;">sin datos · no recibe comunicaciones</div>
            </div>
            <button class="btn-ghost" id="bkProvClear" style="padding:6px 10px;">Quitar</button>
          </div>
        `;
      }
      if (!adding && !addingProv) {
        // v0.5.4 — CHIP DEL CLIENTE REAL SELECCIONADO.
        // Hasta v0.5.3 el cliente elegido solo se veía como fila resaltada
        // DENTRO de la lista de resultados. Si la lista dejaba de pintarse
        // (búsqueda vacía, vuelta desde otro step, reapertura del sheet),
        // parecía que no había cliente aunque sí lo hubiera.
        // El cliente provisional sí tenía chip desde v0.4.0; el real no.
        // Además es la confirmación visual que hace segura la restauración
        // del cliente al reabrir el sheet: sin ella, el operador podría
        // reservarle la cita a la persona equivocada sin enterarse.
        if (b.client) {
          const cLabel = b.client.nombreCompleto ||
            `${b.client.nombre || ''} ${b.client.apellido || ''}`.trim();
          const cMeta = b.client.telefono || b.client.email || '';
          html += `
            <div style="display:flex;align-items:center;gap:10px;padding:12px 14px;border:1px solid var(--orange);background:rgba(232,119,34,0.10);border-radius:12px;margin-bottom:10px;">
              <div class="avatar" style="background:var(--orange);color:#fff;">${esc(initials(cLabel))}</div>
              <div class="client-info" style="flex:1;min-width:0;">
                <div class="cn">${esc(cLabel || '—')}</div>
                ${cMeta ? `<div class="cm">${esc(cMeta)}</div>` : ''}
              </div>
              <button class="btn-ghost" id="bkClientClear" style="padding:6px 10px;">Quitar</button>
            </div>
          `;
        }
        html += `
          <div class="search">
            ${ICONS.search}
            <input type="text" placeholder="${cacheReady ? 'Nombre o teléfono…' : 'Cargando clientes…'}"
                   id="bkSearch" value="${esc(b.query || '')}" ${cacheReady ? '' : 'disabled'} />
          </div>
        `;
        const results = this._searchResults || [];
        if (b.query && b.query.length >= 2) {
          if (results.length) {
            html += results.map(c => {
              const sel = b.client && b.client.contactId === c.contactId;
              return `
                <div class="client-row ${sel?'sel':''}" data-cid="${esc(c.contactId)}">
                  <div class="avatar">${esc(initials(c.nombreCompleto))}</div>
                  <div class="client-info">
                    <div class="cn">${esc(c.nombreCompleto || '—')}</div>
                    <div class="cm">${esc(c.telefono || c.email || '')}</div>
                  </div>
                </div>
              `;
            }).join('');
          } else if (cacheReady) {
            html += `<div class="empty-hint">Sin resultados. Crea un cliente nuevo.</div>`;
          }
        } else if (cacheReady) {
          html += `<div class="empty-hint">Escribe al menos 2 caracteres para buscar.</div>`;
        }
        html += `<button class="new-client-btn" id="bkNewClient"><span class="plus">+</span> Cliente nuevo</button>`;
        // v0.4.0 — Cliente provisional: segundo botón bajo el de cliente
        // nuevo, con línea discontinua y color más apagado para dejar
        // claro que es un flujo alternativo (cliente de paso).
        html += `<button class="new-client-btn" id="bkProvClient" style="margin-top:8px;border-style:dashed;color:#7a7f8b;background:transparent;"><span class="plus">+</span> Cliente provisional</button>`;
      } else if (adding) {
        const nc = b.newClient || {};
        html += `
          <div class="search">
            ${ICONS.user}
            <input type="text" id="bkNcNombre" placeholder="Nombre" value="${esc(nc.nombre||'')}" />
          </div>
          <div class="search" style="margin-top:8px;">
            ${ICONS.user}
            <input type="text" id="bkNcApellido" placeholder="Apellido (opcional)" value="${esc(nc.apellido||'')}" />
          </div>
          <div class="search" style="margin-top:8px;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.13.96.36 1.9.7 2.79a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.29-1.29a2 2 0 012.11-.45c.89.34 1.83.57 2.79.7A2 2 0 0122 16.92z"/></svg>
            <input type="tel" id="bkNcTelefono" placeholder="Teléfono" value="${esc(nc.telefono||'')}" />
          </div>
          <div class="search" style="margin-top:8px;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
            <input type="email" id="bkNcEmail" placeholder="Email (opcional)" value="${esc(nc.email||'')}" />
          </div>
          <button class="btn-ghost" id="bkCancelNew" style="margin-top:10px;">Cancelar cliente nuevo</button>
        `;
      } else {
        // v0.4.0 — Mini-form de cliente provisional: solo nombre.
        const pv = b.provClient || {};
        html += `
          <div style="padding:10px 12px;background:#fff7e0;border:1px solid #f0c879;border-radius:10px;font-size:12.5px;color:#7a4500;line-height:1.5;margin-bottom:10px;">
            Cliente de paso. Solo se pide el nombre. <b>No se guarda en CRM</b> ni recibe comunicaciones. Si vuelve otro día, hay que pedirle los datos completos como cliente nuevo.
          </div>
          <div class="search">
            ${ICONS.user}
            <input type="text" id="bkProvNombre" placeholder="Nombre (cualquiera identificable)" value="${esc(pv.nombre||'')}" autofocus />
          </div>
          <button class="btn-ghost" id="bkCancelProv" style="margin-top:10px;">Cancelar</button>
        `;
      }
      body.innerHTML = html;

      const R = this.shadowRoot;
      if (!adding && !addingProv) {
        const inp = R.getElementById('bkSearch');
        if (inp) {
          inp.addEventListener('input', (e) => {
            b.query = e.target.value;
            b.client = null;
            // v0.4.0 — Si el operador empieza a buscar, se cancela el
            // provisional en curso (ha decidido buscar cliente real).
            b.provClient = null;
            clearTimeout(this._searchTimer);
            this._searchTimer = setTimeout(() => {
              this._sendToPage('buscar-cliente', { query: b.query });
            }, 220);
          });
        }
        body.querySelectorAll('.client-row').forEach(row => {
          row.addEventListener('click', () => {
            const cid = row.dataset.cid;
            const c = (this._searchResults || []).find(x => x.contactId === cid);
            if (c) { b.client = c; b.newClient = null; b.provClient = null; this._renderBookingSheet(); }
          });
        });
        const newBtn = R.getElementById('bkNewClient');
        if (newBtn) newBtn.addEventListener('click', () => {
          b.adding = true; b.client = null; b.newClient = { nombre:'', apellido:'', telefono:'', email:'' }; b.provClient = null;
          this._renderBookingBody();
          this._renderBookingFoot();
        });
        // v0.4.0 — Botón cliente provisional
        const provBtn = R.getElementById('bkProvClient');
        if (provBtn) provBtn.addEventListener('click', () => {
          b.addingProv = true; b.client = null; b.newClient = null; b.provClient = { nombre:'', esProvisional:true };
          this._renderBookingBody();
          this._renderBookingFoot();
        });
        // v0.5.4 — Quitar el cliente real seleccionado. Limpia también el
        // cliente conservado entre aperturas, para que no reaparezca al
        // volver a abrir el sheet.
        const clientClearBtn = R.getElementById('bkClientClear');
        if (clientClearBtn) clientClearBtn.addEventListener('click', () => {
          b.client = null;
          b.query = '';
          this._searchResults = [];
          this._clientePendiente = null;
          this._renderBookingBody();
          this._renderBookingFoot();
        });
        // v0.4.0 — Quitar chip de cliente provisional ya seleccionado
        const provClearBtn = R.getElementById('bkProvClear');
        if (provClearBtn) provClearBtn.addEventListener('click', () => {
          b.provClient = null;
          this._clientePendiente = null;
          this._renderBookingBody();
          this._renderBookingFoot();
        });
      } else if (adding) {
        const wire = (id, key) => {
          const el = R.getElementById(id);
          if (el) el.addEventListener('input', (e) => {
            b.newClient = { ...(b.newClient||{}), [key]: e.target.value };
            this._renderBookingFoot();
          });
        };
        wire('bkNcNombre', 'nombre');
        wire('bkNcApellido', 'apellido');
        wire('bkNcTelefono', 'telefono');
        wire('bkNcEmail', 'email');
        R.getElementById('bkCancelNew').addEventListener('click', () => {
          b.adding = false; b.newClient = null;
          this._renderBookingBody();
          this._renderBookingFoot();
        });
      } else {
        // v0.4.0 — Listeners del mini-form provisional
        const nombreEl = R.getElementById('bkProvNombre');
        if (nombreEl) {
          nombreEl.addEventListener('input', (e) => {
            b.provClient = { ...(b.provClient||{esProvisional:true}), nombre: e.target.value };
            this._renderBookingFoot();
          });
          // Enter = "Usar provisional" si hay nombre. Al confirmar el
          // nombre, salimos del mini-form y volvemos al chip (mostrando
          // el provisional ya listo). El operador avanzará al step 2.
          nombreEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && (b.provClient?.nombre || '').trim()) {
              b.addingProv = false;
              this._renderBookingBody();
              this._renderBookingFoot();
            }
          });
        }
        R.getElementById('bkCancelProv').addEventListener('click', () => {
          b.addingProv = false; b.provClient = null;
          this._renderBookingBody();
          this._renderBookingFoot();
        });
      }
    }

    // ── STEP 2: servicio + variantes/complementos del catálogo V2 ──
    //   v0.3.1 — Acordeón estricto: solo un grupo abierto a la vez. Click
    //   en cabecera abre/cierra. Estado en b.expandedGroup.
    _renderStepService(body) {
      const b = this._booking;
      // Agrupar catálogo por group
      const groups = {};
      for (const s of this._catalogo) {
        const g = s.group || 'otros';
        if (!groups[g]) groups[g] = [];
        groups[g].push(s);
      }
      const groupTitles = {
        coloracion: 'Coloración',
        cortesmujer: 'Cortes de mujer',
        peinados: 'Peinados y recogidos',
        tratamientos: 'Tratamientos',
        caballero: 'Caballero',
        spa: 'Spa capilar'
      };

      // v0.3.1 — Si el servicio seleccionado pertenece a un grupo, abrir ese
      // grupo automáticamente al volver a step 2.
      if (b.service && !b.expandedGroup) {
        b.expandedGroup = b.service.group || null;
      }

      let html = '';

      // v0.6.0 — Líneas ya añadidas a la cita, arriba del catálogo.
      // Cada una con su precio y botón para quitarla. Paridad con el
      // bloque de armado del Desktop (_renderArmedHint).
      if (b.lineas.length) {
        html += `<div style="margin-bottom:14px;">
          <span class="field-label">En esta cita (${b.lineas.length})</span>`;
        b.lineas.forEach((l, i) => {
          html += `
            <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:6px;">
              <span style="width:20px;height:20px;border-radius:50%;background:var(--orange);color:#fff;font-size:10px;font-weight:700;display:grid;place-items:center;flex:0 0 auto;">${i + 1}</span>
              <span style="flex:1;min-width:0;font-size:12.5px;font-weight:500;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(this._labelDeLinea(l))}</span>
              <span class="svc-meta">${esc(String(this._precioDeLinea(l)))}€</span>
              <button class="btn-ghost" data-rmlinea="${i}" style="padding:4px 9px;">✕</button>
            </div>`;
        });
        html += `</div>`;
      }

      for (const g in groups) {
        const list = groups[g].sort((a,b) => (a.order||999) - (b.order||999));
        const isExp = (b.expandedGroup === g);
        html += `<div class="cat-group">
          <div class="cat-head ${isExp?'exp':''}" data-group="${esc(g)}">
            <span>${esc(groupTitles[g] || g)}</span>
            <span class="cat-chev"></span>
          </div>`;
        if (isExp) {
          for (const s of list) {
            // v0.3.0 — identidad CMS-first: setupUid
            const isSel = b.service && b.service.setupUid === s.setupUid;
            const meta = (s.duration ? `${s.duration} min` : '') + (s.price != null ? ` · ${s.price}€` : '');
            html += `
              <div class="svc-row ${isSel?'sel':''} ${isSel?'has-panel':''}" data-sid="${esc(s.setupUid)}">
                <span class="svc-name">${esc(s.label)}</span>
                <span class="svc-meta">${esc(meta)}</span>
              </div>`;
            if (isSel) {
              html += this._renderAddonPanel();
              // v0.6.3 — El botón de armado múltiple va PEGADO al servicio
              // elegido, no al final del catálogo. En v0.6.2 quedaba tras
              // todos los grupos y había que hacer scroll hasta abajo para
              // verlo: en móvil, invisible en la práctica.
              html += `
                <button class="new-client-btn" id="bkAddLinea" style="margin-top:8px;margin-bottom:10px;">
                  <span class="plus">+</span> Añadir otro servicio a esta cita
                </button>`;
            }
          }
        }
        html += `</div>`;
      }

      body.innerHTML = html;

      // v0.6.1 — Listener del botón de armado múltiple. Vive aquí y no en
      // _wireAddonEvents porque ese solo se ejecuta cuando hay panel de
      // addons, y el botón debe funcionar también en servicios simples.
      const addLineaBtn = body.querySelector('#bkAddLinea');
      if (addLineaBtn) {
        addLineaBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (!this._añadirLineaActual()) return;
          this._toast(`${b.lineas.length} servicio${b.lineas.length > 1 ? 's' : ''} en la cita`);
          this._renderBookingBody();
          this._renderBookingFoot();
        });
      }

      // v0.6.0 — Quitar una línea ya añadida
      body.querySelectorAll('[data-rmlinea]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          this._quitarLinea(parseInt(btn.dataset.rmlinea, 10));
        });
      });

      // v0.3.1 — Click en cabecera = toggle de grupo (acordeón estricto)
      body.querySelectorAll('.cat-head').forEach(head => {
        head.addEventListener('click', (e) => {
          e.stopPropagation();
          const g = head.dataset.group;
          b.expandedGroup = (b.expandedGroup === g) ? null : g;
          this._renderBookingBody();
          this._renderBookingFoot();
        });
      });

      body.querySelectorAll('.svc-row').forEach(row => {
        row.addEventListener('click', () => {
          const sid = row.dataset.sid;
          const svc = this._serviciosMap[sid];
          if (!svc) return;
          if (b.service && b.service.setupUid === svc.setupUid) return;
          b.service = svc;
          // v0.3.0 — reset addons locales al cambiar de servicio
          // v0.5.0 — variantIdx arranca en -1 (base M del catálogo)
          // v0.6.0 — solo resetea la LÍNEA EN EDICIÓN; b.lineas intacto.
          b.variantIdx = -1;
          b.complementosSel = {};
          b.exclusivosSel = {};
          this._renderBookingBody();
          this._renderBookingFoot();
        });
      });
      this._wireAddonEvents();
    }

    // v0.3.0 — Panel addons CMS-first: variantes (chips, índice) +
    // complementos (toggles bool). Datos vienen inline en svc desde
    // getCatalogoReserva. SIN llamadas extra al page code.
    _renderAddonPanel() {
      const b = this._booking;
      const svc = b.service;
      if (!svc) return '';
      const variantes = (svc.hasVariants && Array.isArray(svc.variantes)) ? svc.variantes : [];
      const complementos = Array.isArray(svc.complementos) ? svc.complementos : [];
      if (!variantes.length && !complementos.length) return '';

      let html = `<div class="addon-panel">`;

      if (variantes.length) {
        // v0.5.0 — Se antepone la variante BASE del propio catálogo
        // (svc.label + svc.price + svc.duration) como primera opción.
        // Es lo que actúa como "M" en un servicio simple_variantes
        // (Corte Mujer M/L/XL). Antes se pintaban SOLO las variantes
        // del array svc.variantes[] → la base no era seleccionable y
        // el operador se veía obligado a elegir siempre L, XL, etc.
        // aunque el cliente quisiera la M base.
        //
        // Estado: b.variantIdx === -1 significa BASE; b.variantIdx >= 0
        // señala la posición en svc.variantes[]. Al confirmar, si -1
        // NO se envía varianteSel; el backend usa base como siempre.
        const baseLabelRaw = svc.label || 'Base';
        const basePrice = Number(svc.price) || 0;
        const baseDur = Number(svc.duration) || 0;
        const baseMeta = [];
        if (basePrice > 0) baseMeta.push(`${basePrice}€`);
        if (baseDur > 0) baseMeta.push(`${baseDur}′`);
        const baseMetaTxt = baseMeta.length ? ` · ${baseMeta.join(' · ')}` : '';
        const isSelBase = b.variantIdx === -1;
        html += `<div class="addon-block"><span class="alabel">Variante</span>
          <div class="chips" data-ag="__variant">
            <button class="chip ${isSelBase?'sel':''}" data-vi="-1">${esc(baseLabelRaw)}${baseMetaTxt}</button>`;
        variantes.forEach((v, i) => {
          const label = (typeof v === 'string') ? v : (v.label || ('Variante ' + (i + 1)));
          // v0.5.0 — pintar también precio y duración de la variante
          // (antes solo label). Necesario para que el operador vea el
          // impacto de elegir L o XL sobre precio/duración.
          const vPriceRaw = (typeof v === 'object') ? (v.precio != null ? v.precio : v.price) : null;
          const vDurRaw = (typeof v === 'object') ? (v.duracion != null ? v.duracion : v.duration) : null;
          const vPrice = (vPriceRaw != null) ? Number(vPriceRaw) : NaN;
          const vDur = (vDurRaw != null) ? Number(vDurRaw) : NaN;
          const meta = [];
          if (!isNaN(vPrice) && vPrice > 0) meta.push(`${vPrice}€`);
          if (!isNaN(vDur) && vDur > 0) meta.push(`${vDur}′`);
          const metaTxt = meta.length ? ` · ${meta.join(' · ')}` : '';
          const isSel = b.variantIdx === i;
          html += `<button class="chip ${isSel?'sel':''}" data-vi="${i}">${esc(label)}${metaTxt}</button>`;
        });
        html += `</div></div>`;
      }

      if (complementos.length) {
        html += `<div class="addon-block"><span class="alabel">Complementos</span></div>`;
        for (const c of complementos) {
          const cTieneVars = !!(c.hasVariants && Array.isArray(c.variantes) && c.variantes.length);

          if (cTieneVars) {
            // v0.3.9 — Complemento con variantes (Peinado S/M/L/XL,
            // Tratamiento Sin/HairTimes/KERASTASE/Matiz, Planchado M/L/XL).
            // Patrón literal del Desktop v1.1.44: una fila de chips, una
            // por variante. Si c.required (fase del mapeoFases obligatoria
            // con variantes), debe elegirse una para poder reservar. Si es
            // opcional, re-click sobre la misma deselecciona.
            const sel = b.complementosSel[c.setupUid];
            const selIdx = (sel && typeof sel === 'object') ? sel.varianteIdx : -1;
            const reqTag = c.required ? ` <span style="color:var(--accent);font-weight:600">· obligatorio</span>` : '';
            html += `<div class="addon-block" data-ag="${esc(c.setupUid)}">
              <span class="alabel">⛓ ${esc(c.label)}${reqTag}</span>
              <div class="chips" data-compl-vars="${esc(c.setupUid)}">`;
            c.variantes.forEach((v, vi) => {
              const vLabel = (typeof v === 'string') ? v : (v.label || v.nombre || ('Variante ' + (vi + 1)));
              const vPriceRaw = (typeof v === 'object') ? (v.precio != null ? v.precio : v.price) : null;
              const vDurRaw = (typeof v === 'object') ? (v.duracion != null ? v.duracion : v.duration) : null;
              const vPrice = (vPriceRaw != null) ? Number(vPriceRaw) : NaN;
              const vDur = (vDurRaw != null) ? Number(vDurRaw) : NaN;
              const meta = [];
              if (!isNaN(vPrice)) meta.push(vPrice > 0 ? `+${vPrice}€` : 'incluido');
              if (!isNaN(vDur) && vDur > 0) meta.push(`${vDur}′`);
              const metaTxt = meta.length ? ` · ${meta.join(' · ')}` : '';
              const isSel = (vi === selIdx);
              html += `<button class="chip ${isSel?'sel':''}" data-compl-uid="${esc(c.setupUid)}" data-compl-vi="${vi}">${esc(vLabel)}${metaTxt}</button>`;
            });
            html += `</div></div>`;
          } else {
            // Complemento SIN variantes: toggle ON/OFF (igual que antes).
            const on = b.complementosSel[c.setupUid] === true;
            const meta = [
              (c.duration ? `${c.duration} min` : ''),
              (c.price != null ? `+${c.price}€` : '')
            ].filter(Boolean).join(' · ');
            html += `<div class="addon-block toggle-row" data-ag="${esc(c.setupUid)}">
              <span class="tl">${esc(c.label)}${meta ? ` <span style="color:var(--muted);font-weight:400">· ${esc(meta)}</span>` : ''}</span>
              <button class="switch ${on?'on':''}" data-compl="${esc(c.setupUid)}"></button>
            </div>`;
          }
        }
      }

      // v0.4.0 — GRUPO EXCLUSIVO (Punto 1). Cada item tipo:'exclusivo' del
      // svc.mapeoFases se pinta como un mini-selector con chips radio-like:
      // primero "No añadir", luego una opción por cada ref válido leída
      // del catálogo vivo (this._serviciosMap, indexado por setupUid).
      // Estado en b.exclusivosSel[groupKey] (uid del elegido) o ausencia
      // = "No añadir". Patrón literal Desktop v1.1.59.
      const mapeoParaExcl = Array.isArray(svc.mapeoFases)
        ? svc.mapeoFases
        : (typeof svc.mapeoFases === 'string' ? this._tryParseArr(svc.mapeoFases) : []);
      const exclusivos = Array.isArray(mapeoParaExcl)
        ? mapeoParaExcl
            .map((f, idx) => ({ f, idx }))
            .filter(x => x.f && x.f.tipo === 'exclusivo' && Array.isArray(x.f.refs) && x.f.refs.length > 0)
        : [];
      if (exclusivos.length) {
        html += `<div class="addon-block"><span class="alabel">Grupo exclusivo <span style="color:var(--muted);font-weight:400">· elige uno o ninguno</span></span></div>`;
        for (const { f, idx } of exclusivos) {
          const groupKey = 'exc:' + idx;
          const selUid = b.exclusivosSel && b.exclusivosSel[groupKey];
          const opts = f.refs
            .map(r => this._serviciosMap[r])
            .filter(Boolean);
          const labelGrupo = (typeof f.label === 'string' && f.label.trim()) ? f.label.trim() : 'Grupo';
          const noneActive = !selUid;
          html += `<div class="addon-block" data-excl-group="${esc(groupKey)}">
            <span class="alabel" style="color:#c04a4a">🎯 ${esc(labelGrupo)}</span>
            <div class="chips" data-excl-vars="${esc(groupKey)}">
              <button class="chip ${noneActive?'sel':''}" data-excl-gk="${esc(groupKey)}" data-excl-uid="">No añadir</button>`;
          for (const svcRef of opts) {
            const isSel = selUid === svcRef.setupUid;
            const priceRaw = Number(svcRef.price);
            const durRaw = Number(svcRef.duration);
            const meta = [];
            if (!isNaN(priceRaw) && priceRaw > 0) meta.push(`+${priceRaw}€`);
            if (!isNaN(durRaw) && durRaw > 0) meta.push(`${durRaw}′`);
            const metaTxt = meta.length ? ` · ${meta.join(' · ')}` : '';
            html += `<button class="chip ${isSel?'sel':''}" data-excl-gk="${esc(groupKey)}" data-excl-uid="${esc(svcRef.setupUid)}">${esc(svcRef.label || '')}${metaTxt}</button>`;
          }
          html += `</div></div>`;
        }
      }

      html += `</div>`;
      return html;
    }

    // v0.4.0 — Helper defensivo para leer mapeoFases si viene como string.
    // El motor recepcionProLogic v1.0.36 lo devuelve como Array pero
    // legacy podría llegar como JSON string; defensivo, no cambia
    // comportamiento cuando ya es Array.
    _tryParseArr(s) {
      try {
        const p = JSON.parse(s);
        if (Array.isArray(p)) return p;
        if (p && Array.isArray(p.items)) return p.items;
        return [];
      } catch (e) { return []; }
    }

    _wireAddonEvents() {
      const body = this.shadowRoot.getElementById('bookBody');
      const b = this._booking;
      // Chips de variante del PRINCIPAL (selección de índice)
      // v0.5.0 — El valor `-1` señala la BASE del catálogo (variante M).
      //   Antes: `parseInt(chip.dataset.vi, 10) || 0` colapsaba -1
      //   incorrectamente porque -1 es truthy y sí pasa (`|| 0` sí lo
      //   deja), pero se documenta explícitamente para no confundir.
      body.querySelectorAll('.chips .chip[data-vi]').forEach(chip => {
        chip.addEventListener('click', (e) => {
          e.stopPropagation();
          const viRaw = parseInt(chip.dataset.vi, 10);
          const vi = Number.isInteger(viRaw) ? viRaw : -1;
          b.variantIdx = vi;
          this._renderBookingBody();
          this._renderBookingFoot();
        });
      });
      // Switches de complementos SIN variantes (toggle bool por setupUid).
      // v0.3.9 — Conserva el modelo legacy `complementosSel[uid] = true|false`
      // para este caso; los complementos con variantes usan objeto
      // `{ varianteIdx }` (ver listener inmediatamente debajo).
      body.querySelectorAll('.switch[data-compl]').forEach(sw => {
        sw.addEventListener('click', (e) => {
          e.stopPropagation();
          const uid = sw.dataset.compl;
          const cur = b.complementosSel[uid];
          if (cur === true) {
            delete b.complementosSel[uid];
          } else {
            b.complementosSel[uid] = true;
          }
          this._renderBookingBody();
          this._renderBookingFoot();
        });
      });
      // v0.3.9 — Chips de variante de COMPLEMENTOS (selección de variante).
      // Guarda { varianteIdx } en complementosSel[uid]. Re-click sobre la
      // misma chip deselecciona SOLO si el complemento es opcional
      // (c.required === false). Si es required, mantiene la selección
      // (no hay opción "no añadir" para complementos obligatorios con
      // variantes — patrón Desktop v1.1.44).
      body.querySelectorAll('.chip[data-compl-uid]').forEach(chip => {
        chip.addEventListener('click', (e) => {
          e.stopPropagation();
          const uid = chip.dataset.complUid;
          const vi = parseInt(chip.dataset.complVi, 10) || 0;
          const cur = b.complementosSel[uid];
          const yaSel = (cur && typeof cur === 'object' && cur.varianteIdx === vi);
          // Resolver c.required mirando el catálogo del servicio actual
          const svc = b.service;
          const compMeta = (svc && Array.isArray(svc.complementos))
            ? svc.complementos.find(x => x.setupUid === uid)
            : null;
          const esRequired = !!(compMeta && compMeta.required);
          if (yaSel && !esRequired) {
            delete b.complementosSel[uid];
          } else {
            b.complementosSel[uid] = { varianteIdx: vi };
          }
          this._renderBookingBody();
          this._renderBookingFoot();
        });
      });
      // v0.4.0 — GRUPO EXCLUSIVO (Punto 1). Radio-like: click en una opción
      // deselecciona cualquier otra del mismo grupo. Si es "No añadir"
      // (data-excl-uid vacío), borra la selección del grupo. Estado en
      // b.exclusivosSel[groupKey]. Los grupos exclusivos son SIEMPRE
      // opcionales (motor: mín. 0, máx. 1); nunca bloquean el avance de
      // step 2 → step 3 (ver _canAdvanceStep, sin cambios en v0.4.0).
      body.querySelectorAll('.chip[data-excl-gk]').forEach(chip => {
        chip.addEventListener('click', (e) => {
          e.stopPropagation();
          const gk = chip.dataset.exclGk;
          const uid = chip.dataset.exclUid || '';
          if (!b.exclusivosSel) b.exclusivosSel = {};
          if (uid) b.exclusivosSel[gk] = uid;
          else delete b.exclusivosSel[gk];
          this._renderBookingBody();
          this._renderBookingFoot();
        });
      });
    }

    // ── STEP 3: empleado + hora ──
    _renderStepEmpTime(body) {
      const b = this._booking;
      const visible = this._getVisibleStaff();
      let html = `<span class="field-label">Empleado</span>
        <div class="emp-chips">`;
      for (const s of visible) {
        const isSel = b.emp === s.id;
        const color = this._staffColor(s.id);
        html += `<button class="emp-chip ${isSel?'sel':''}" data-emp="${esc(s.id)}">
          <span class="dot" style="background:${esc(color)}"></span>${esc(s.name || '')}
        </button>`;
      }
      html += `</div>`;

      html += `<span class="field-label">Hora</span><div class="time-grid">`;
      const totalMin = (CAL_END_H - CAL_START_H) * 60;
      const nSlots = Math.ceil(totalMin / SLOT_MIN);
      for (let i = 0; i < nSlots; i++) {
        const absMin = CAL_START_H * 60 + i * SLOT_MIN;
        const t = fmtTime(absMin);
        const isSel = b.time === t;
        html += `<button class="time-btn ${isSel?'sel':''}" data-time="${t}">${t}</button>`;
      }
      html += `</div>`;
      body.innerHTML = html;

      body.querySelectorAll('.emp-chip').forEach(c => {
        c.addEventListener('click', () => {
          b.emp = c.dataset.emp;
          this._renderBookingBody();
          this._renderBookingFoot();
        });
      });
      body.querySelectorAll('.time-btn').forEach(t => {
        t.addEventListener('click', () => {
          b.time = t.dataset.time;
          this._renderBookingBody();
          this._renderBookingFoot();
        });
      });
    }

    // ── STEP 4: confirmar ──
    //   v0.6.0 — Lista TODAS las líneas de la cita con su precio y el
    //   total. Un solo pack, un solo cobro; cada servicio se pintará como
    //   su propio bloque en el calendario.
    _renderStepConfirm(body) {
      const b = this._booking;
      const cl = this._currentClientLabel();
      const isNew = !b.client && !!b.newClient && (b.newClient.nombre || b.newClient.apellido);
      const empName = (this._getVisibleStaff().find(s => s.id === b.emp) || {}).name || b.emp;

      const lineasHTML = b.lineas.map((l, i) => {
        const extras = [];
        const svcComps = Array.isArray(l.svc.complementos) ? l.svc.complementos : [];
        for (const c of svcComps) {
          if (l.complementosSel && l.complementosSel[c.setupUid]) extras.push(c.label);
        }
        return `
          <div class="confirm-row">
            <span class="ck">${i === 0 ? 'Servicios' : ''}</span>
            <span class="cv">${esc(this._labelDeLinea(l))} · ${esc(String(this._precioDeLinea(l)))}€
              ${extras.length ? `<span class="extra">${esc(extras.join(' · '))}</span>` : ''}
            </span>
          </div>`;
      }).join('');

      const total = this._totalLineas();
      const nLineas = b.lineas.length;

      body.innerHTML = `
        <div class="confirm-row">
          <span class="ck">Cliente</span>
          <span class="cv">${esc(cl)}${isNew ? '<span class="extra">Nuevo cliente</span>' : ''}</span>
        </div>
        ${lineasHTML}
        <div class="confirm-row">
          <span class="ck">Empleado</span>
          <span class="cv">${esc(empName)}</span>
        </div>
        <div class="confirm-row">
          <span class="ck">Fecha</span>
          <span class="cv">${esc(this._fecha)} · ${esc(b.time || '')}</span>
        </div>
        <div class="confirm-row">
          <span class="ck">Total</span>
          <span class="cv" style="font-size:16px;font-weight:700;color:var(--orange)">${esc(String(total))}€
            ${nLineas > 1 ? `<span class="extra">${nLineas} servicios · un solo cobro</span>` : ''}
          </span>
        </div>
      `;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // CONFIRMACIÓN DE RESERVA
    // ═══════════════════════════════════════════════════════════════════════
    _confirmBooking() {
      const b = this._booking;
      if (b.creating) return;
      b.creating = true;
      this._renderBookingFoot();

      // contactDetails + esProvisional
      // v0.4.0 — Cliente provisional (Punto 3): objeto local con nombre
      // solo, no persiste en CRM. Se propaga esProvisional:true en el
      // payload; backend crearPackReserva v1.0.6+ salta ensureContactInCRM.
      let contactDetails;
      let memberContactId = null;
      let esProvisional = false;
      if (b.client) {
        memberContactId = b.client.contactId;
        const parts = String(b.client.nombreCompleto || '').trim().split(/\s+/);
        contactDetails = {
          firstName: parts[0] || '',
          lastName: parts.slice(1).join(' ') || '',
          email: b.client.email || '',
          phone: b.client.telefono || ''
        };
      } else if (b.newClient) {
        contactDetails = {
          firstName: b.newClient.nombre || '',
          lastName: b.newClient.apellido || '',
          email: b.newClient.email || '',
          phone: b.newClient.telefono || ''
        };
      } else if (b.provClient && b.provClient.nombre) {
        // v0.4.0 — Provisional. Split del nombre en firstName + lastName por
        // si el operador metió varios espacios, mismo criterio que Desktop
        // v1.1.12. Sin email ni teléfono; el backend no envía comunicaciones.
        const parts = String(b.provClient.nombre || '').trim().split(/\s+/);
        contactDetails = {
          firstName: parts[0] || '',
          lastName: parts.slice(1).join(' ') || '',
          email: '',
          phone: ''
        };
        memberContactId = '';
        esProvisional = true;
      } else {
        b.creating = false;
        this._toast('Selecciona un cliente');
        return;
      }

      // v0.6.0 — ARMADO MÚLTIPLE. La PRIMERA línea crea la reserva con
      // crearPackReserva. Las demás quedan en b.cadenaPendiente y se
      // añaden a ESA MISMA reserva con agregarServicioReserva en cuanto
      // llega 'reserva-creada' OK. Paridad literal con la cadena del
      // Desktop v1.1.81 (case 'reservaCreada' → _enviarAgregarServicio).
      // Resultado: un pack, un total, un cobro; cada servicio pintado
      // como su propio bloque (una .appt por fase ocupante).
      if (!b.lineas.length) {
        b.creating = false;
        this._toast('Añade al menos un servicio');
        return;
      }

      const primera = b.lineas[0];
      b.cadenaPendiente = b.lineas.slice(1);
      b.cadenaReservaId = null;

      const principalSetupUid = primera.svc?.setupUid || '';
      const complementosSetupUid = this._complementosDeLinea(
        primera.svc, primera.complementosSel, primera.exclusivosSel
      );
      const varianteSel = this._varianteSelDeLinea(primera.svc, primera.variantIdx);

      // staffName de la lista de staff visibles (para que el backend lo
      // grabe en la reserva — mismo patrón que desktop V2).
      const staffObj = (this._getVisibleStaff().find(s => s.id === b.emp) || {});
      const staffName = staffObj.name || '';

      const payload = {
        principalSetupUid,
        complementosSetupUid,
        fechaISO: this._fecha,
        horaHHmm: b.time,
        empleadoId: b.emp,
        staffName,
        contactDetails,
        memberContactId,
        // v0.4.0 — bandera de cliente provisional. El pagecode ya acepta
        // este campo. Backend salta ensureContactInCRM cuando es true.
        esProvisional,
        // v0.5.0 — Variante del principal (null si base).
        varianteSel
      };

      console.log(`${TAG} 📨 crear-reserva`, payload);
      this._sendToPage('crear-reserva', payload);
    }

    // v0.3.3 — Refresh manual: pide el día actual y aplica un giro corto al botón
    _manualRefresh() {
      const btn = this.shadowRoot.getElementById('btnRefresh');
      if (btn) {
        btn.classList.add('spinning');
        setTimeout(() => btn.classList.remove('spinning'), 450);
      }
      this._sendToPage('get-reservas-dia', { fecha: this._fecha });
    }

    _onReservaCreada(p) {
      const b = this._booking;
      b.creating = false;
      if (p?.ok) {
        // v0.6.0 — ARMADO MÚLTIPLE. Si quedan líneas, ESTA reserva es la
        // cita contenedora y el resto de servicios se añaden dentro de
        // ella. Mismo patrón que Desktop v1.1.81 (case 'reservaCreada').
        // No se marca done hasta que la cadena termina.
        const reservaId = p.reservaId || p._id || '';
        if (b.cadenaPendiente && b.cadenaPendiente.length && reservaId) {
          b.cadenaReservaId = reservaId;
          b.creating = true;
          this._enviarSiguienteDeCadena();
          this._renderBookingSheet();
          return;
        }
        b.done = true;
        b.doneData = p;
        // v0.5.5 — El cliente SOBREVIVE a la reserva creada. Paridad con
        // Recepción PRO Desktop: su case 'reservaCreada' hace _desarmar()
        // (resetea el servicio) pero NUNCA toca this._cliente, que vive en
        // el aside y persiste.
        // Caso de uso real: una madre reserva su corte + el del hijo + el
        // de la hija. Con la limpieza de v0.5.4 había que volver a buscar
        // a la clienta después de cada reserva.
        this._guardarClientePendiente(true);
        this._renderBookingSheet();
      } else {
        const msg = p?.error?.message || 'Error al crear la reserva';
        this._toast(msg);
        this._renderBookingFoot();
      }
    }

    // v0.6.0 — Envía la siguiente línea pendiente al page code, que la
    // añade a la cita contenedora con agregarServicioReserva. El backend
    // la encadena a partir de MAX(end) de las fases ocupantes, así que
    // los servicios quedan uno detrás de otro con el mismo profesional.
    _enviarSiguienteDeCadena() {
      const b = this._booking;
      const linea = b.cadenaPendiente[0];
      if (!linea || !b.cadenaReservaId) return;
      this._toast(`Añadiendo ${this._labelDeLinea(linea)}…`);
      this._sendToPage('agregar-servicio', {
        reservaId: b.cadenaReservaId,
        setupUid: linea.svc?.setupUid || '',
        varianteSel: this._varianteSelDeLinea(linea.svc, linea.variantIdx),
        complementosSetupUid: this._complementosDeLinea(
          linea.svc, linea.complementosSel, linea.exclusivosSel
        )
      });
    }

    // v0.6.0 — Respuesta a 'agregar-servicio'. Consume la cola y, cuando
    // se vacía, cierra el flujo como una reserva normal.
    _onServicioAgregado(p) {
      const b = this._booking;
      if (!p?.ok) {
        b.creating = false;
        const msg = p?.error?.message || p?.error || 'No se pudo añadir el servicio';
        this._toast(`Error: ${msg}`);
        // La cita contenedora SÍ existe: se cierra el sheet y se refresca
        // para que el operador vea lo que sí ha entrado y decida.
        b.done = true;
        b.doneData = { reservaId: b.cadenaReservaId };
        this._guardarClientePendiente(true);
        this._renderBookingSheet();
        this._sendToPage('get-reservas-dia', { fecha: this._fecha });
        return;
      }
      b.cadenaPendiente.shift();
      if (b.cadenaPendiente.length) {
        this._enviarSiguienteDeCadena();
        return;
      }
      b.creating = false;
      b.done = true;
      b.doneData = { reservaId: b.cadenaReservaId, precioTotal: p.precioTotal };
      this._guardarClientePendiente(true);
      this._renderBookingSheet();
      this._sendToPage('get-reservas-dia', { fecha: this._fecha });
    }

    // v0.3.2 — Tras cancelar: cerrar detail, toast, refrescar día.
    _onReservaCancelada(p) {
      this._detail.canceling = false;
      if (p?.ok) {
        this._closeApptDetail();
        this._toast('Cita cancelada');
        // Refrescar el día para que el calendario repinte sin esa cita
        this._sendToPage('get-reservas-dia', { fecha: this._fecha });
      } else {
        const msg = p?.error?.message || 'No se pudo cancelar la cita';
        this._toast(msg);
        this._renderDetailBody();
      }
    }

    _onContactoCreado(data) {
      // No usado en flujo actual (crear cliente se hace inline en confirmar)
      // Reservado para futuro: si quieres crear el contacto ANTES de reservar.
    }

    // ═══════════════════════════════════════════════════════════════════════
    // v0.3.7 — BLOQUEO SHEET (creación manual)
    // ═══════════════════════════════════════════════════════════════════════
    _openBloqueoSheet() {
      this._bloqueo = this._emptyBloqueo();
      // Default: primer staff visible
      const visible = this._getVisibleStaff();
      if (visible.length) this._bloqueo.staffId = visible[0].id;
      // Default hora: si es HOY, hora actual redondeada al próximo cuarto.
      // Si no, 10:00.
      if (this._fecha === todayISO()) {
        const m = madridNowMin();
        const r = Math.ceil(m / 15) * 15;
        this._bloqueo.time = fmtTime(r);
      }
      this._bloqueo.open = true;
      const R = this.shadowRoot;
      R.getElementById('bloqScrim').classList.add('open');
      R.getElementById('bloqSheet').classList.add('open');
      this._renderBloqueoSheet();
    }

    _closeBloqueoSheet() {
      this._bloqueo.open = false;
      const R = this.shadowRoot;
      R.getElementById('bloqScrim').classList.remove('open');
      R.getElementById('bloqSheet').classList.remove('open');
    }

    _renderBloqueoSheet() {
      const b = this._bloqueo;
      const visible = this._getVisibleStaff();

      // v0.4.0 — Bloqueos (Punto 4). Añadidos "Día completo" y
      // "Personalizado" a los chips fijos [15,30,45,60,90,120].
      //   · Día completo: bloquea de 09:00 a 21:00 = 720 min. Fija además
      //     b.time = '09:00' automáticamente para que abarque toda la jornada.
      //   · Personalizado: activa un input numérico con la duración libre
      //     (mín. 5, máx. 720). Backend crearBloqueo (recepcionProLogic
      //     v1.0.20 desplegado) acepta cualquier duracionMin >= 5.
      //
      // Constantes de rango horario (mismas que CAL_START_H/CAL_END_H del
      // calendario del widget, líneas 250 aprox).
      const FULL_DAY_MIN = (CAL_END_H - CAL_START_H) * 60;  // 720
      const DURACIONES_FIJAS = [15, 30, 45, 60, 90, 120];
      const esFija = DURACIONES_FIJAS.includes(b.duracionMin);
      const esFullDay = b.duracionMin === FULL_DAY_MIN;
      const esCustom = !esFija && !esFullDay;

      const body = this.shadowRoot.getElementById('bloqBody');
      body.innerHTML = `
        <div class="bl-field">
          <span class="bl-field-label">Hora de inicio</span>
          <input class="bl-time-input" id="bloqTime" type="time" value="${esc(b.time)}" ${esFullDay ? 'disabled' : ''} />
        </div>
        <div class="bl-field">
          <span class="bl-field-label">Duración</span>
          <div class="bl-chips">
            ${DURACIONES_FIJAS.map(d => `
              <button class="bl-chip ${b.duracionMin === d ? 'sel' : ''}" data-dur="${d}">${d} min</button>
            `).join('')}
            <button class="bl-chip ${esFullDay ? 'sel' : ''}" data-dur="fullday" style="border-style:solid;font-weight:700;">Día completo</button>
            <button class="bl-chip ${esCustom ? 'sel' : ''}" data-dur="custom" style="border-style:dashed;">Personalizado</button>
          </div>
          ${esCustom ? `
            <div style="margin-top:10px;display:flex;align-items:center;gap:10px;">
              <input class="bl-time-input" id="bloqDurCustom" type="number" min="5" max="720" step="5" value="${b.duracionMin || 30}" style="flex:1;" />
              <span style="color:var(--muted);font-size:13px;">minutos</span>
            </div>
            <div style="margin-top:6px;color:var(--muted);font-size:11.5px;">Mínimo 5 min · Máximo 720 min (12 h).</div>
          ` : ''}
          ${esFullDay ? `<div style="margin-top:8px;color:#a55b00;font-size:11.5px;font-style:italic;">Bloquea toda la jornada (${String(CAL_START_H).padStart(2,'0')}:00 – ${String(CAL_END_H).padStart(2,'0')}:00).</div>` : ''}
        </div>
        <div class="bl-field">
          <span class="bl-field-label">Empleado</span>
          <div class="bl-chips">
            ${visible.map(s => `
              <button class="bl-chip staff ${b.staffId === s.id ? 'sel' : ''}" data-sid="${esc(s.id)}">
                <span class="bl-chip-dot" style="background:${esc(this._staffColor(s.id))}"></span>${esc(s.name)}
              </button>
            `).join('')}
          </div>
        </div>
        <div class="bl-field">
          <span class="bl-field-label">Motivo (opcional)</span>
          <input class="bl-text-input" id="bloqMotivo" type="text" placeholder="Bloqueado" value="${esc(b.motivo)}" maxlength="60" />
        </div>
      `;

      // Listeners chips duración
      body.querySelectorAll('.bl-chip[data-dur]').forEach(chip => {
        chip.addEventListener('click', () => {
          const raw = chip.dataset.dur;
          if (raw === 'fullday') {
            // v0.4.0 — Día completo: bloquea toda la jornada. Fija hora de
            // inicio a CAL_START_H (09:00) automáticamente.
            b.duracionMin = FULL_DAY_MIN;
            b.time = String(CAL_START_H).padStart(2, '0') + ':00';
          } else if (raw === 'custom') {
            // v0.4.0 — Personalizado: fija a un valor por defecto sensato
            // (fuera de la lista fija) y muestra el input numérico. Si ya
            // estamos en custom, no reseteamos (respetamos lo tecleado).
            if (!esCustom) b.duracionMin = 25;  // valor por defecto custom
          } else {
            b.duracionMin = parseInt(raw, 10) || 30;
          }
          this._renderBloqueoSheet();
        });
      });
      // Listeners chips staff
      body.querySelectorAll('.bl-chip[data-sid]').forEach(chip => {
        chip.addEventListener('click', () => {
          b.staffId = chip.dataset.sid;
          this._renderBloqueoSheet();
        });
      });
      // Listener input time
      body.querySelector('#bloqTime').addEventListener('change', (e) => {
        b.time = e.target.value || b.time;
      });
      // Listener input motivo
      body.querySelector('#bloqMotivo').addEventListener('input', (e) => {
        b.motivo = e.target.value || '';
      });
      // v0.4.0 — Listener input custom (duración libre en minutos).
      const durCustomEl = body.querySelector('#bloqDurCustom');
      if (durCustomEl) {
        durCustomEl.addEventListener('input', (e) => {
          let v = parseInt(e.target.value, 10);
          if (isNaN(v)) return;
          if (v < 5) v = 5;
          if (v > FULL_DAY_MIN) v = FULL_DAY_MIN;
          b.duracionMin = v;
          // NO re-renderizamos aquí para no perder el foco del input.
          // Solo actualizamos el foot para reflejar la disponibilidad
          // del botón "Crear bloqueo".
          this._renderBloqueoFoot();
        });
      }

      this._renderBloqueoFoot();
    }

    _renderBloqueoFoot() {
      const b = this._bloqueo;
      const can = !!(b.time && b.duracionMin > 0 && b.staffId);
      const foot = this.shadowRoot.getElementById('bloqFoot');
      foot.innerHTML = `
        <button class="btn-primary" id="bloqSubmit" ${(!can || b.creating) ? 'disabled' : ''}>
          ${b.creating ? 'Creando…' : 'Crear bloqueo'}
        </button>
      `;
      const btn = foot.querySelector('#bloqSubmit');
      if (btn && can && !b.creating) {
        btn.addEventListener('click', () => this._submitBloqueo());
      }
    }

    _submitBloqueo() {
      const b = this._bloqueo;
      if (b.creating) return;
      // Releer inputs por si el último change no disparó
      const timeEl = this.shadowRoot.getElementById('bloqTime');
      const motivoEl = this.shadowRoot.getElementById('bloqMotivo');
      if (timeEl) b.time = timeEl.value || b.time;
      if (motivoEl) b.motivo = motivoEl.value || '';

      if (!b.time || !b.staffId || !b.duracionMin) {
        this._toast('Faltan datos del bloqueo');
        return;
      }

      b.creating = true;
      this._renderBloqueoFoot();

      const payload = {
        fechaISO: this._fecha,
        horaHHmm: b.time,
        duracionMin: b.duracionMin,
        staffId: b.staffId,
        motivo: (b.motivo || '').trim() || 'Bloqueado'
      };
      console.log(`${TAG} 📨 crearBloqueo`, payload);
      this._sendToPage('crearBloqueo', payload);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // MONTH PICKER
    // ═══════════════════════════════════════════════════════════════════════
    _openMonthPicker() {
      this._monthOpen = true;
      const d = isoDate(this._fecha);
      this._monthAnchor = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`;
      const R = this.shadowRoot;
      R.getElementById('monthScrim').classList.add('open');
      R.getElementById('monthSheet').classList.add('open');
      this._renderMonthBody();
    }

    _closeMonthPicker() {
      this._monthOpen = false;
      const R = this.shadowRoot;
      R.getElementById('monthScrim').classList.remove('open');
      R.getElementById('monthSheet').classList.remove('open');
    }

    _renderMonthBody() {
      const R = this.shadowRoot;
      const title = R.getElementById('monthTitle');
      const body = R.getElementById('monthBody');
      if (!body || !this._monthAnchor) return;

      const anchor = isoDate(this._monthAnchor);
      const monthLabel = `${MONTHS_ES[anchor.getMonth()]} ${anchor.getFullYear()}`;
      if (title) title.textContent = monthLabel;

      // Construir días
      const firstDow = mondayIndex(anchor);
      const daysInMonth = new Date(anchor.getFullYear(), anchor.getMonth()+1, 0).getDate();
      // Días del mes anterior para rellenar
      const prevDays = firstDow;
      let html = `
        <div class="month-nav">
          <button class="datenav-arrow" id="mPrev">${ICONS.chevronLeft}</button>
          <span class="ml">${esc(monthLabel)}</span>
          <button class="datenav-arrow" id="mNext">${ICONS.chevronRight}</button>
        </div>
        <div class="month-head-row">
          ${WEEKDAY_LETTERS.map(w => `<div class="month-head-cell">${w}</div>`).join('')}
        </div>
        <div class="month-cal">
      `;
      // Días "muted" del mes anterior
      for (let i = prevDays - 1; i >= 0; i--) {
        const d = new Date(anchor.getFullYear(), anchor.getMonth(), -i);
        const iso = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        html += `<button class="month-day muted" data-iso="${iso}">${d.getDate()}</button>`;
      }
      const todayIso = todayISO();
      for (let i = 1; i <= daysInMonth; i++) {
        const iso = `${anchor.getFullYear()}-${String(anchor.getMonth()+1).padStart(2,'0')}-${String(i).padStart(2,'0')}`;
        const isSel = iso === this._fecha;
        const isToday = iso === todayIso;
        const hasAppts = this._reservasDiasConCitas.has(iso);
        html += `<button class="month-day ${isSel?'sel':''} ${isToday?'today':''}" data-iso="${iso}">
          ${i}${hasAppts?'<span class="dot"></span>':''}
        </button>`;
      }
      html += `</div>`;
      body.innerHTML = html;

      R.getElementById('mPrev').addEventListener('click', () => this._monthShift(-1));
      R.getElementById('mNext').addEventListener('click', () => this._monthShift(1));
      body.querySelectorAll('.month-day[data-iso]').forEach(d => {
        d.addEventListener('click', () => {
          this._navigateTo(d.dataset.iso);
          this._closeMonthPicker();
        });
      });
    }

    _monthShift(delta) {
      const a = isoDate(this._monthAnchor);
      a.setMonth(a.getMonth() + delta);
      this._monthAnchor = `${a.getFullYear()}-${String(a.getMonth()+1).padStart(2,'0')}-01`;
      this._renderMonthBody();
    }

    // ═══════════════════════════════════════════════════════════════════════
    // APPOINTMENT DETAIL
    // ═══════════════════════════════════════════════════════════════════════
    //   v0.4.0 — El detail acepta la FASE clicada como segundo parámetro
    //   (opcional). Si viene, _renderDetailBody pinta un chip específico
    //   con label/hora/duración de esa fase (útil cuando la reserva es
    //   una cascada de 5+ fases y el operador clicó, p. ej., en "Lavado"
    //   o "Peinado M"). Si no viene, se comporta como antes: muestra la
    //   RESERVA completa (label del principal, hora total). Patrón
    //   consistente con Desktop V2.
    _openApptDetail(r, fase = null) {
      this._detail = { open: true, data: r, fase, canceling: false };
      const R = this.shadowRoot;
      R.getElementById('detailScrim').classList.add('open');
      R.getElementById('detailSheet').classList.add('open');
      this._renderDetailBody();
    }

    _closeApptDetail() {
      this._detail = { open: false, data: null, fase: null };
      const R = this.shadowRoot;
      R.getElementById('detailScrim').classList.remove('open');
      R.getElementById('detailSheet').classList.remove('open');
    }

    _renderDetailBody() {
      const body = this.shadowRoot.getElementById('detailBody');
      const raw = this._detail.data;
      if (!body || !raw) return;
      // v0.3.0 — Adapter: si llega reserva V2 (con fases[]), construyo el
      // shape que el render espera. Si llega con el shape legacy, pasa tal cual.
      const r = this._adaptDetailData(raw);
      const staff = this._getVisibleStaff().find(s => s.id === r.resourceId);
      const color = this._staffColor(r.resourceId);
      // v0.3.2 — Estado de cancelación (loading inline)
      const canceling = !!this._detail.canceling;
      const reservaId = raw?._id || raw?.reservaId || '';

      // v0.4.0 — Chip de la fase clicada específicamente. Solo se pinta
      // si el operador clicó en una fase concreta (no legacy) Y la
      // reserva tiene 2+ fases (si es 1 sola, el chip aportaría info
      // redundante con "Servicio"). El chip incluye label + hora inicio
      // + duración de la fase concreta.
      const faseClicada = this._detail.fase;
      const fasesArr = Array.isArray(raw?.fases) ? raw.fases : (raw?.fases?.items || []);
      const fasesOcupantes = fasesArr.filter(f => f && f.ocupa !== false);
      const showFaseChip = !!faseClicada && fasesOcupantes.length > 1;
      let faseChipHTML = '';
      if (showFaseChip) {
        const faseLabel = faseClicada.label || 'Fase';
        const faseStartHHmm = (typeof isoToHHmmMadrid === 'function' && faseClicada.start)
          ? isoToHHmmMadrid(faseClicada.start)
          : '';
        let faseDur = Number(faseClicada.dur) || 0;
        if (!faseDur && faseClicada.end && faseClicada.start) {
          const s = new Date(faseClicada.start).getTime();
          const e = new Date(faseClicada.end).getTime();
          if (!isNaN(s) && !isNaN(e)) faseDur = Math.max(0, Math.round((e - s) / 60000));
        }
        const durTxt = faseDur > 0 ? ` · ${faseDur} min` : '';
        const horaTxt = faseStartHHmm ? ` · ${esc(faseStartHHmm)}` : '';
        faseChipHTML = `
          <div class="det-block" style="background:#fff7e0;border:1px solid #f0c879;border-radius:10px;padding:10px 12px;">
            <span class="det-label" style="color:#a55b00;">Fase seleccionada</span>
            <span class="det-value" style="color:#7a4500;font-weight:600;">🎯 ${esc(faseLabel)}${horaTxt}${durTxt}</span>
          </div>
        `;
      }

      // v0.4.0 — Badge cliente provisional (paridad con Desktop V2).
      // Detección: reserva sin contactId y sin teléfono/email → paso.
      const esProvisional = !raw?.contactId && !raw?.clientPhone && !raw?.clientEmail;
      const provBadge = esProvisional
        ? `<span style="display:inline-block;margin-left:8px;padding:2px 7px;border-radius:999px;background:#fff3d6;color:#a55b00;font-size:9px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;border:1px solid #f0c879;vertical-align:middle;">provisional</span>`
        : '';

      body.innerHTML = `
        ${faseChipHTML}
        <div class="det-block">
          <span class="det-label">Cliente</span>
          <span class="det-value">${esc(r.cliente || '—')}${provBadge}</span>
        </div>
        <div class="det-block">
          <span class="det-label">Servicio</span>
          <span class="det-value">${esc(r.servicio || '—')}</span>
        </div>
        <div class="det-block">
          <span class="det-label">Hora</span>
          <span class="det-value">${esc(r.startTime || '')} – ${esc(r.endTime || '')} · ${esc(String(r.durMin || 0))} min</span>
        </div>
        <div class="det-block">
          <span class="det-label">Empleado</span>
          <span class="det-value det-staff"><span class="dot" style="background:${esc(color)}"></span>${esc(staff?.name || r.resourceId)}</span>
        </div>
        ${r.precio ? `<div class="det-block"><span class="det-label">Precio</span><span class="det-value">${esc(String(r.precio))}€</span></div>` : ''}
        ${r.clientPhone && !esProvisional ? `<div class="det-block"><span class="det-label">Teléfono</span><span class="det-value">${esc(r.clientPhone)}</span></div>` : ''}
        ${r.notes ? `<div class="det-block"><span class="det-label">Notas</span><span class="det-value">${esc(r.notes)}</span></div>` : ''}
        ${reservaId ? `
          <div class="det-actions">
            <button class="btn-cancel" id="btnCancelAppt" ${canceling?'disabled':''}>
              ${canceling ? 'Cancelando…' : 'Cancelar cita'}
            </button>
          </div>` : ''}
      `;
      // v0.3.2 — Listener cancelar
      const btn = body.querySelector('#btnCancelAppt');
      if (btn && !canceling) {
        btn.addEventListener('click', () => this._onCancelClick(reservaId, r.cliente, r.startTime));
      }
    }

    // v0.3.2 — Cancelar cita: confirmación nativa + envío al page code.
    _onCancelClick(reservaId, cliente, hora) {
      if (!reservaId) return;
      const msg = `¿Cancelar la cita de ${cliente || 'este cliente'}${hora ? ' a las ' + hora : ''}?\n\nEsta acción no se puede deshacer.`;
      if (!confirm(msg)) return;
      this._detail.canceling = true;
      this._renderDetailBody();
      this._sendToPage('cancelar-reserva', { reservaId });
    }

    // v0.3.0 — Adapter reserva V2 → shape del detail legacy.
    _adaptDetailData(r) {
      // Si ya viene en shape legacy (tiene resourceId/startTime/durMin), respeta.
      if (r && r.resourceId && r.startTime) return r;
      const fases = Array.isArray(r?.fases) ? r.fases.filter(f => f && f.ocupa !== false) : [];
      const firstStart = fases.length ? fases[0].start : r?.fechaReserva;
      const lastEnd = fases.length ? fases[fases.length - 1].end : null;
      // serviciosDetail: "Servicio|precio|cant · Servicio|precio|cant ..."
      let svcLabel = r?.title || '';
      if (!svcLabel && typeof r?.serviciosDetail === 'string' && r.serviciosDetail) {
        const first = r.serviciosDetail.split('·')[0] || '';
        svcLabel = (first.split('|')[0] || '').trim();
      }
      return {
        resourceId: r?.staffId || '',
        startTime: isoToHHmmMadrid(firstStart),
        endTime: lastEnd ? isoToHHmmMadrid(lastEnd) : '',
        durMin: r?.duracionTotal || 0,
        cliente: r?.clientName || '',
        servicio: svcLabel,
        precio: r?.precioTotal || null,
        clientPhone: r?.clientPhone || '',
        notes: r?.notes || ''
      };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TOAST
    // ═══════════════════════════════════════════════════════════════════════
    _toast(msg) {
      const t = this.shadowRoot.getElementById('toast');
      if (!t) return;
      t.textContent = msg;
      t.classList.add('show');
      clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
    }
  }

  customElements.define('kamisuite-booking-lite', KamisuiteBookingLite);
  console.log(`${TAG} ✅ Custom element registrado`);
})();
