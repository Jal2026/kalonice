/* =====================================================================
 * KAMISUITE — Widget Nueva Recepción PRO (CMS-first)
 * Custom Element: <recepcion-pro-cms>
 * VERSION: 1.1.87  ·  CAPA TÁCTIL — arrastrar con el dedo (tablet)
 *
 * v1.1.87 (5 ago 2026) — ARRASTRE CON EL DEDO. Los cuatro arrastres del
 *   calendario estaban escritos exclusivamente contra mousedown /
 *   mousemove / mouseup, y en un navegador táctil esa secuencia no
 *   existe: un dedo que se desplaza produce touchmove y scroll, nunca
 *   mousemove. En tablet quedaban muertos MOVER FASE, REDIMENSIONAR
 *   FASE, EXTENDER CITA y CREAR BLOQUEO — este último de forma
 *   silenciosa (un toque da mousedown+mouseup en el mismo punto, la
 *   duración sale 0 y no se crea nada ni se avisa).
 *
 *   SOLUCIÓN — capa de traducción, no reescritura. La lógica de
 *   arrastre NO se toca: se le entregan eventos de ratón sintéticos
 *   construidos a partir del gesto del dedo. Cero cambios en el camino
 *   de ratón; el mostrador de escritorio se comporta exactamente igual
 *   que en v1.1.86.
 *     · _fireSyntheticMouse(target, tipo, x, y) — el mousedown se
 *       despacha sobre el elemento REAL tocado (para que los guardias
 *       e.target.closest(...) sigan funcionando) y el mousemove/mouseup
 *       sobre `document` con bubbles:true, que alcanza tanto a los
 *       listeners de document (_bindFaseDrag) como a los de window
 *       (_bindResizeExt, _bindBlockDrag), porque document propaga a
 *       window.
 *     · _bindTouchLongPressDrag(el, opts) — PULSACIÓN LARGA de 450ms
 *       quieto y luego arrastrar. Se usa en los bloques de cita y en las
 *       columnas libres. No es capricho: si el arrastre arrancase al
 *       primer movimiento, el dedo apoyado sobre una cita o una columna
 *       ya no podría hacer scroll vertical del calendario, y con la
 *       agenda llena eso es casi toda la pantalla. Con pulsación larga
 *       conviven los tres gestos: toque corto abre la cita, arrastre
 *       directo hace scroll, mantener + arrastrar mueve.
 *       Antes de armarse NO se llama a preventDefault, de modo que el
 *       scroll y el click nativo siguen intactos. Al armar, clase
 *       `is-touch-armed` (+ vibración breve donde exista) para que el
 *       operador vea que el bloque ya está enganchado.
 *     · _bindTouchImmediateDrag(el) — arrastre inmediato para las dos
 *       asas de resize, que son objetivos deliberados y nunca superficie
 *       de scroll.
 *
 *   CSS — primera media query del archivo, `@media (hover: none)`, que
 *   por definición no aplica en escritorio con ratón:
 *     · .ks-appt-timeadj (el 🕑 que ajusta la hora de la fase SIN
 *       arrastrar) vivía con opacity:0 y solo se revelaba en :hover →
 *       era invisible con el dedo. Ahora es permanente y de 20×20px.
 *     · .ks-appt-resize conserva su aspecto (28×4px) pero gana zona de
 *       impacto por pseudo-elemento (~56px de ancho) y touch-action:none.
 *     · -webkit-touch-callout / user-select desactivados en cita y
 *       columna, para que iOS no abra el menú de selección al mantener.
 *
 *   NO se toca: page code, backends, contrato de mensajes ('mover-fase',
 *   'redimensionar-fase', 'extender-reserva', 'crearBloqueo'), ni ningún
 *   flujo de negocio.
 *
 * v1.1.86  ·  TIENDA — CIF/DNI antes de cobrar
 *
 * v1.1.86 (4 ago 2026) — El CIF/DNI se pide en el paso de cliente, antes
 *   de la venta, que es cuando el cliente está delante del mostrador. En
 *   v1.1.85 solo aparecía después de cobrar, dentro del formulario de
 *   factura. Ahora el paso de cliente se muestra siempre —también con un
 *   cliente ya cargado en el aside, en cuyo caso los datos personales
 *   salen rellenos y bloqueados y solo queda añadir los fiscales— y lo
 *   capturado se arrastra al formulario de factura ya relleno.
 *   Dejarlo vacío sigue permitiendo emitir ticket y convertirlo después.
 *
 * v1.1.85  ·  TIENDA con ticket / factura y CIF-DNI
 *
 * v1.1.85 (4 ago 2026) — La venta de TIENDA ya emite documento KAMISUITE.
 *   Al registrar la venta el modal deja de cerrarse: muestra el resultado
 *   y ofrece 🧾 Ticket (factura simplificada) o 📄 Factura completa. La
 *   factura pide CIF/DNI y razón social, que se guardan en la ficha del
 *   cliente para las próximas veces. Si ya se emitió ticket, aparece
 *   "Convertir a factura" y el backend la emite como rectificativa, misma
 *   mecánica que en el modal de cita.
 *   El documento se ancla al cobro por `sourceKey` (el orderId de la
 *   venta, que es el bookingId de su fila en PaymentReservations), no a
 *   una reserva. Requiere facturacionSalonLogic v1.0.4, los campos
 *   sourceType y sourceKey en Invoices, y page code v1.0.38.
 *
 * v1.1.84  ·  Botón TIENDA — venta de productos sin cita
 *
 * v1.1.84 (4 ago 2026) — TIENDA. Botón nuevo en la barra superior, junto a
 *   FICHA TÉCNICA, para vender productos a quien entra sin cita. Abre el
 *   MISMO modal de venta que ya existe dentro de la cita: buscador,
 *   carrito, variantes, métodos de pago y el flujo MISSING_VARIANT. La
 *   única diferencia es que no viaja packId, así que la venta queda
 *   registrada contra el contacto y sin cita asociada.
 *
 *   Cliente: usa el que esté cargado en el aside. Si no hay ninguno, o el
 *   que hay es provisional, pide nombre + teléfono o email y da de alta el
 *   contacto por el circuito existente ('crearCliente'), encadenando
 *   después la venta. NO hay venta anónima: venderProductosDesdeAgenda
 *   aborta sin contactId porque genera un pedido real de tienda.
 *
 *   Gated con _puede('cobrar'), igual criterio que el resto de acciones
 *   con dinero. Cero backend nuevo y cero cambios en el page code.
 *
 * v1.1.83  ·  Variantes al añadir complemento
 *
 * v1.1.83 (4 ago 2026) — El modal "⛓ Complemento" del modal de cita ya
 *   permite elegir VARIANTE. Antes solo mandaba el setupUid y un
 *   complemento con variantes (Peinado M/L/XL) entraba siempre a precio y
 *   duración base. Mismo patrón que v1.1.81 hizo con "+ Servicio
 *   adicional". El botón Añadir se rehabilita si el backend da error.
 *   Requiere backend v1.0.44 y page code v1.0.37.
 *
 * v1.1.82  ·  Panel sin "Complementos de fases"
 *
 * v1.1.82 (4 ago 2026) — El grupo "Complementos de fases" deja de listarse
 *   en la columna de servicios. Son piezas que el motor materializa dentro
 *   de la cascada de otro servicio, y verlas sueltas entre los principales
 *   confunde. Siguen accesibles en la pestaña "Complementos" del filtro de
 *   rol. Solo cambia _buildGroups; el catálogo y el backend no se tocan.
 *
 * v1.1.81  ·  Armado múltiple, cantidad y variantes al añadir
 *
 * v1.1.81 (4 ago 2026) — ARMADO MÚLTIPLE + CANTIDAD + VARIANTES AL AÑADIR.
 *   Tres cosas que ahorran pasos en el mostrador, sobre una única cita.
 *
 *   1) CANTIDAD en el popup de servicio. Caso real: una madre trae dos
 *      niños al mismo corte. Antes había que repetir el proceso entero
 *      (armar, clicar calendario, y otra vez). Ahora se elige cantidad 2
 *      y los dos cortes se encadenan uno detrás del otro según duración.
 *
 *   2) VARIOS SERVICIOS armados antes de pintar. El popup, si ya hay algo
 *      armado, cambia el botón a "＋ Añadir a la cita". La cabecera del
 *      calendario muestra la lista completa y el orden de colocación.
 *      Al encadenar líneas NO se ofrecen complementos opcionales ni
 *      grupos exclusivos (premisa de diseño: elegirlos por línea haría el
 *      popup inmanejable). Sí se mantienen las fases OBLIGATORIAS con
 *      variantes (CASO B), porque sin esa elección el motor no puede
 *      construir el servicio.
 *
 *   3) Selector "Mismo profesional" / "Elegir por servicio" en la
 *      cabecera, visible solo cuando hay más de una línea. Con "mismo
 *      profesional" un único clic coloca toda la cita. Con "elegir por
 *      servicio" el operador clica una columna y hora por cada servicio.
 *
 *   ARQUITECTURA — es UNA SOLA CITA, no varias:
 *     · Línea 1  → 'crearReserva'    (crearPackReserva) crea la fila.
 *     · Líneas 2+ → 'agregar-servicio' (agregarServicioReserva) se suman a
 *       ESA fila, exactamente igual que el botón "+ Servicio adicional"
 *       del modal de cita, que es como se viene haciendo desde la V1.
 *   Resultado: un total, un cobro unificado y UN SOLO WhatsApp/email al
 *   cliente — la centralita de comunicaciones solo la dispara
 *   crearPackReserva; agregarServicioReserva no notifica nada.
 *   En modo "elegir por servicio", tras añadir la línea sus fases se
 *   reubican en la columna elegida con el contrato existente 'mover-fase',
 *   SIEMPRE de una en una: moverFase reescribe la fila entera y dos
 *   movimientos en paralelo se pisarían.
 *
 *   4) "+ SERVICIO ADICIONAL" DEL MODAL DE CITA — ahora con elección de
 *      VARIANTE. Antes solo viajaba el setupUid: un servicio con variantes
 *      (Corte Mujer M/L/XL) se añadía siempre a precio y duración BASE, y
 *      un servicio con fases obligatorias con variantes (Botox →
 *      Planchado M/L/XL) fallaba con "Falta elegir variante de: …" sin
 *      forma de añadirlo. Corregido en las tres capas.
 *      Además, el botón "Añadir" vuelve a habilitarse si el backend
 *      devuelve error (antes había que cerrar el modal para reintentar).
 *
 *   REQUIERE: backend recepcionProLogic v1.0.43 y page code v1.0.36.
 *   Desplegar el backend y el page code ANTES que este widget: sin ellos,
 *   varianteSel y complementosSetupUid se ignoran y las líneas con
 *   variantes entrarían a precio base.
 *
 *   NO se toca: cobro, descuentos, canje de bonos, facturación, cierre,
 *   arqueo, ALMACÉN, ESPECIALES, ficha técnica, bloqueos, drag&drop de
 *   fases, login PIN, ni el flujo de una sola línea (idéntico a v1.1.80).
 *
 * v1.1.80  ·  Informe del día — detalle de ESPECIALES vendidos
 *
 * v1.1.80 (4 ago 2026) — CIERRE FINANCIERO: nueva sección "🎟️ Especiales
 *   vendidos hoy" con el detalle de cada venta manual de Bono / Tarjeta
 *   PRIME / Tarjeta promocional (concepto + cliente + método + importe y
 *   línea de total). Hasta ahora esas ventas solo se veían agregadas como
 *   "ESPECIALES · N cobros" en "Cobrado por staff", sin decir qué se había
 *   vendido — un bono podía pasarse por alto leyendo el informe.
 *   Se alimenta de cierre.especiales / cierre.especialesTotal que devuelve
 *   el backend cierreLogicExtendido v1.1.5. Si el backend no está
 *   desplegado, los campos llegan undefined y la sección simplemente no se
 *   pinta (cero regresión).
 *   También se añade el mismo bloque al texto del botón 📋 COPIAR del
 *   cierre financiero (_cierreBloqueATexto('fin')).
 *   NO se toca: rendimiento productivo, métodos de pago, IVA, cobrado por
 *   staff, productos, externos, arqueo, ESPECIALES (venta), ALMACÉN, ficha
 *   técnica, calendario, cobro, login PIN ni ningún otro flujo.
 *
 * v1.1.79  ·  FICHA TÉCNICA — fix del cliente precargado
 *
 * v1.1.79 (3 ago 2026) — FIX: el popup se reabría siempre con el cliente
 *   de la última CITA abierta, ignorando el que el operador acabara de
 *   seleccionar en el aside. Seleccionar cliente en el aside escribe en
 *   this._cliente y no pasa por _openModal, así que _ftUltimoCliente no
 *   se actualizaba y el popup quedaba clavado en el cliente anterior.
 *
 *   Orden de precarga ahora:
 *     1) this._cliente  — el del aside. Es lo que el operador tiene
 *        delante en el paso 1 del asistente; manda sobre lo demás.
 *     2) this._ftUltimoCliente — última cita abierta en el calendario.
 *     3) ninguno → el popup abre con el buscador vacío.
 *
 *   Solo cambia _openFichaTecnica(). Backend y page code sin tocar.
 *
 * v1.1.78  ·  Popup FICHA TÉCNICA — historial de color destacado
 *
 * v1.1.78 (3 ago 2026) — FICHA TÉCNICA: las fórmulas suben a su propio
 *   bloque, delante del historial de visitas. En v1.1.77 iban dentro de
 *   cada visita, y como solo el 15,7% de los tickets tiene fórmula
 *   anotada, obligaba a rebuscar por el historial para encontrarlas.
 *   Mismo criterio que el widget MEMORIA: Historial de color primero,
 *   todas las visitas después. Se elimina el toggle 'Solo con fórmula',
 *   que deja de tener sentido con los dos bloques separados.
 *   Solo cambia _renderFt(). Backend y page code sin tocar.
 *
 * v1.1.77  ·  Popup FICHA TÉCNICA (histórico de color)
 *
 * v1.1.77 (3 ago 2026) — POPUP FICHA TÉCNICA en la barra superior, junto
 *   a ALMACÉN y ESPECIALES. Consulta el histórico de color del sistema
 *   anterior (2.019 tickets de 2026, 318 fórmulas técnicas) sin salir de
 *   Recepción. Requiere page code v1.0.35 y memoriaLegacyLogic v1.0.3.
 *
 *   ⚠️ SIN DATOS ECONÓMICOS. Es la razón de existir de este popup: los
 *   informes con dinero son de gerencia; la sala necesita la técnica.
 *   El filtro está en el BACKEND (getFichaTecnicaCliente no envía
 *   importes). Aquí no hay nada que ocultar porque nada llega.
 *
 *   Cliente precargado: _openModal guarda el último cliente cuya cita se
 *   abrió (_ftUltimoCliente). Al pulsar el botón, si hay uno, se carga
 *   directo; el buscador sigue disponible para cambiar. Se guarda al
 *   abrir la cita, no al cerrarla, porque el modal tapa la barra y el
 *   flujo real es: abrir cita → cerrar → consultar ficha.
 *
 *   Cambio ADITIVO y aislado: clases .ks-fichatec y .ft-*, mensajes
 *   propios (ftBuscarCliente/getFichaTecnica → ftClientesEncontrados/
 *   fichaTecnicaData). No se toca el calendario, el cobro, el arqueo,
 *   el cierre, ESPECIALES ni el ALMACÉN.
 *
 * v1.1.76  ·  Popup ALMACÉN (papelera y sacar de almacén)
 * FECHA: 1 de agosto de 2026 (v1.1.75: 2 de agosto de 2026)
 * ---------------------------------------------------------------------
 * v1.1.76 (2 ago 2026) — POPUP ALMACÉN en la barra superior, junto a
 *   ESPECIALES. Botón turquesa "ALMACÉN" que abre un modal con los
 *   productos de uso en salón que tienen existencias, buscador y filtro
 *   por categoría, y DOS acciones por producto:
 *     🗑️ TIRAR   → bote terminado. El almacén descuenta uno cerrado y
 *                  abre el siguiente (stockLogic.tirarPapelera).
 *     📤 SACAR   → coger un bote del almacén para empezarlo, sin tirar
 *                  ninguno (movimiento APERTURA · APERTURA_MANUAL).
 *   Los contadores se actualizan en local con lo que devuelve el
 *   backend: sin recargar la agenda ni releer la lista entera.
 *   Ambas acciones están permitidas a CUALQUIER nivel de acceso: no son
 *   administración, son registrar lo que se acaba de hacer físicamente.
 *   El movimiento se firma con _empleadoActivo (mismo mecanismo que
 *   _logEvent); sin capa de login, se graba sin firma.
 *   Cambio ADITIVO y aislado: clases .ks-almacen y .alm-*, mensajes
 *   propios. NO se toca ESPECIALES, ni el calendario, ni el cobro, ni
 *   el arqueo. Requiere page code v1.0.34 y stockLogic v1.0.2.
 * v1.1.75 (2 ago 2026) — DESCUENTO MANUAL en el modal ESPECIALES (venta
 *   manual de PRIME/Bono/Tarjeta). Reutiliza LITERAL el patrón %/€ del
 *   cobro normal (misma card .ks-disc-*, misma lógica que _calcDescuento,
 *   mismo token "🏷️ Descuento -X% (-Y€)"). La card solo se pinta cuando
 *   hay un producto elegido con precio > 0. Aplica sobre _espPrecioActual()
 *   (vale igual en las tres pestañas). El botón "Emitir y cobrar" muestra
 *   el NETO. En _espEmitir, si hay descuento, se añaden al payload
 *   `importeNeto` (neto ya calculado) + `descripcionExtra` (token). El
 *   backend especialesVentaLogic v1.0.1 los graba en importeTotal (cierre)
 *   y paidPrice (Observatorio). Con 100% (o € = precio) el neto queda a 0 =
 *   "regalar". Cambio aislado a la zona ESPECIALES; nada más se toca.
 * v1.1.74 (1 ago 2026) — Evidencia persistente "✓ Arqueo guardado"
 *   debajo del botón Guardar arqueo. Antes solo había un toast fugaz y
 *   el botón quedaba activo, sin señal de que el guardado había ido
 *   bien. Ahora, cuando el registro del día está en status 'saved', se
 *   pinta bajo el botón "✓ Arqueo guardado · dif X€" en verde. Como se
 *   basa en el estado del registro, sobrevive al refresco (no es
 *   fugaz). El botón sigue activo a propósito (permite re-guardar tras
 *   cambiar el conteo). Cambio aislado a _renderCajaBody.
 * v1.1.73 (1 ago 2026) — FONDO INICIAL arrastra el cash de ayer +
 *   "Forzar fondo inicial". El "Fondo inicial" del arqueo ya no es un
 *   input: es texto que muestra el fondo del día, que el backend
 *   (v1.1.2) rellena arrastrando el efectivo contado del cierre
 *   anterior. Debajo, una fila "Forzar fondo inicial" con input + botón
 *   "Forzar" permite sobrescribir ese valor cuando el arranque real es
 *   distinto (el placeholder muestra el fondo actual). Con el campo
 *   vacío no fuerza nada. Mensaje/handler 'caja-set-fondo' sin cambios;
 *   solo cambia el texto (Forzar) y el toast.
 * v1.1.72 (1 ago 2026) — FONDO INICIAL editable directamente en el
 *   cuadro del arqueo (🏦). El "Fondo inicial" deja de ser texto fijo:
 *   si la caja no está cerrada, es un input con botón "Guardar" que
 *   escribe openingBalance del día (mensaje 'caja-set-fondo' → backend
 *   setOpeningBalance v1.1.1, exista o no la caja). El "Efectivo
 *   esperado" se recalcula al instante. Sin campos nuevos en el CMS,
 *   sin depender de qué día sea ni de ningún toggle. Cambio aislado a
 *   la línea del Fondo inicial en _renderCajaBody + 1 handler de
 *   respuesta. Todo lo demás intacto.
 * v1.1.71 (1 ago 2026) — APERTURA DE CAJA (fondo inicial del día). El
 *   arqueo es un módulo OPCIONAL: cuando el salón tiene SalonConfig.
 *   arqueoActivo=true, al abrir Recepción PRO por la mañana aparece un
 *   modal profesional de apertura con el fondo inicial SUGERIDO ya
 *   pre-rellenado (fondo fijo del salón, o el efectivo contado al cerrar
 *   ayer, o 0 si no hay historial). El operador confirma en un click o
 *   pulsa "Saltar hoy". El flag arqueoActivo y la sugerencia se calculan
 *   en el backend/page code (check-apertura-caja → caja-fondo-sugerido);
 *   el widget solo dispara el check una vez para HOY y reacciona.
 *   · Estado nuevo: _aperturaChequeada (¿ya se pidió el check?),
 *     _aperturaSaltadaFecha (fecha para la que se saltó la apertura),
 *     _aperturaFondo (importe editable del modal).
 *   · connectedCallback dispara _maybeCheckApertura() — solo si la fecha
 *     mostrada es HOY (todayISO). Navegar a otro día no re-dispara.
 *   · Handlers nuevos en _handleResponse: 'caja-fondo-sugerido' (abre el
 *     modal, con guards de HOY / no-saltado / sin otro modal abierto),
 *     'caja-abierta' (toast + refresca el arqueo si está abierto),
 *     'apertura-estado' (informativo, no pinta nada).
 *   · Modal _openAperturaModal reutiliza las clases del modal existente
 *     (ks-modal-scrim, ks-modal, ks-disc-row, ks-pay pay-efectivo…). Sin
 *     CSS nuevo. No cierra al clicar fuera (acto consciente): solo
 *     "Saltar hoy" o "Confirmar apertura". Firma automática con el
 *     empleado logueado la resuelve el page code (recordedBy).
 *   · FUERA DE ALCANCE (sesión futura si se quiere): botón manual
 *     "Registrar fondo inicial" DENTRO del arqueo para un registro ya
 *     creado con fondo 0 — requiere una función backend que ACTUALICE
 *     openingBalance de un registro existente (abrirCaja solo crea). No
 *     se toca ahora para mantener el cambio quirúrgico. El workaround
 *     de apuntar el fondo como "+ Entrada" sigue disponible.
 *   · NO se toca: arqueo/cierre existente, ESPECIALES, cobro, drag&drop,
 *     login PIN, calendario, banner promo, ni ningún flujo de negocio.
 *     Solo se AÑADE el flujo de apertura (estado + 1 disparo + 3
 *     handlers + 1 modal), todo add-only.
 * v1.1.70 (31 jul 2026) — ESPECIALES · buen gusto en las respuestas. Los
 *   avisos del modal (bloqueo por no-PRIME, bono ya activo, PRIME ya activa,
 *   éxito) dejan de pintarse como toast negro al pie y se muestran DENTRO del
 *   modal, con tono cálido y una salida útil (el bloqueo por PRIME ofrece un
 *   botón "Dar de alta PRIME" que salta a esa pestaña). Validaciones de campo
 *   (nombre, destinatario del regalo) con resaltado suave sin perder lo escrito.
 * v1.1.69 (31 jul 2026) — ESPECIALES. El botón AKIRA (zombi) pasa a ESPECIALES
 *   y abre un modal de venta manual de los tres productos comerciales; se
 *   elimina el botón Inicio (zombi). El modal reutiliza la búsqueda de clientes
 *   (mensajes propios espBuscarCliente/espClientesEncontrados), tres pestañas
 *   PRIME/Bono/Tarjeta pobladas por getEspecialesData, método de pago y emisión
 *   (emitirBono/emitirPrime/emitirTarjeta). Sin selector de variante: ningún
 *   servicio con bono de KALÓNICE tiene variantes.
 * v1.1.68 (30 jul 2026) — FIX del plegado de servicios de 1 min (widget-only).
 *   El plegado (v1.1.67) se anclaba a la PRIMERA fase ocupante de la cascada,
 *   no a la principal. Si la primera fase era corta (p.ej. "Lavado previo" de
 *   15 min, por debajo de la altura mínima de la línea plegada) la leyenda no
 *   cabía y desaparecía (ni plegada en un bloque ni pintada como fase suelta).
 *   Se veía bien en KALONICE solo porque allí la primera fase (Bigudis) era
 *   larga. Ahora el plegado se ancla a la fase PRINCIPAL, identificada por su
 *   tipo — 'APLICACION' (complejo) o 'SERVICIO' (simple); los complementos son
 *   'COMPLEMENTO'/'INCLUIDA' — que es la fase larga y visible. Fallbacks: por
 *   label del principal (1er item de serviciosDetail) y, en último caso, la
 *   primera fase normal. Nada más cambia.
 * ---------------------------------------------------------------------
 * v1.1.67 (29 jul 2026) — Servicios de 1 min legibles (widget-only). Las
 *   fases ocupantes de ≤1 min (marcadores tipo tamaño de pelo) ya NO se
 *   pintan como bloque propio ilegible: su leyenda se pliega como una línea
 *   nueva en la cartela de la fase PRINCIPAL, entre el cliente y el rango, y
 *   su minuto se suma al rango mostrado (p.ej. 10:15-10:44 → 10:15-10:45).
 *   Solo cambia lo VISUAL: la fase sigue intacta en datos, ledger y CRM
 *   (serviciosDetail, cobro, ficha). Se pliega en `_apptHTML` (clasifica
 *   tiny vs normal, ancla en firstIdxGlobal) y se pinta en `_apptBloqueHTML`
 *   (nueva línea .ks-appt-fold + rango extendido `rangoEndMin`). Caso borde
 *   cubierto: si TODAS las fases son de 1 min (servicio suelto), se pinta
 *   normal (no hay principal donde plegar). El tooltip de v1.1.66 se
 *   mantiene (ayuda con otros bloques cortos), pero ya no hace falta para
 *   los marcadores de tamaño.
 * ---------------------------------------------------------------------
 * v1.1.66 (29 jul 2026) — Dos arreglos (widget-only):
 *   A) FIX "Catálogo Cargando…" colgado. Cuando Wix desconecta+reconecta el
 *      custom element (2º connectedCallback), _renderShell repintaba el
 *      placeholder estático "Cargando catálogo…" pero el catálogo ya había
 *      llegado (_loading=false) y el retry no re-disparaba → el panel se
 *      quedaba colgado hasta tocar un filtro. Ahora, tras _renderShell, se
 *      repintan panel y agenda con lo que ya haya en memoria (en el 1er
 *      montaje es inocuo: muestra "Cargando…" normal / no-op sin staff).
 *   B) Tooltip nativo en el bloque de cita (atributo title con
 *      "servicio · hora · cliente"). Permite leer la cartela de servicios
 *      muy cortos (p.ej. variantes de tamaño de pelo de 1 min, que ni a
 *      máximo zoom caben en altura) sin falsear la duración ni desplazar
 *      nada.
 * ---------------------------------------------------------------------
 * v1.1.65 (29 jul 2026) — Extender cualquier servicio de la cascada, no
 *   solo el último. El asa de resize (borde inferior del bloque) ahora
 *   aparece en TODAS las fases ocupantes (antes solo en la última). Al
 *   arrastrarla se ajusta la DURACIÓN de esa fase; el backend nuevo
 *   redimensionarFase (recepcionProLogic v1.0.39, calcado de moverFase)
 *   desplaza las fases posteriores para mantener la secuencia. Envía el
 *   mensaje nuevo 'redimensionar-fase' { reservaId, faseIndex, nuevaDur }
 *   (page code v1.0.30, handler handleRedimensionarFase). El preview
 *   muestra el bloque creciendo con su nueva duración y horario.
 *   · COMPAT: el camino legacy de extensión (extensionMin, buffer rayado
 *     tras la última fase) se conserva íntegro para reservas SIN fases
 *     (faseIndex = -1): esas siguen usando 'extender-reserva'. La rama se
 *     decide en _bindResizeExt por data-fase-idx. El render legacy
 *     (_extensionHTML) y quitarExtension no se tocan.
 *   · Nueva respuesta 'fase-redimensionada' en _handleResponse. Gates
 *     intactos: PAGADO no muestra asa (no redimensionable).
 * ---------------------------------------------------------------------
 * v1.1.64 (29 jul 2026) — Ajustes de agenda operativa (widget-only, CERO
 *   backend / CERO page code / CERO URL / CERO IDs de colección):
 *   1) GRID 15': default de _settings.interval 30 → 15 (3 inits + radio
 *      checked). El intervalo ya se soportaba; ahora es el baseline. Los
 *      ajustes guardados (CalendarViewSettings) mandan sobre el default.
 *   2) LÍNEAS +DEFINIDAS: solo las variables del grid --ks-line2
 *      (0.948→0.905) y --ks-line (0.905→0.865). Nada más se toca; el resto
 *      del CSS hereda estas dos.
 *   3) POPUP CONFIRMAR HORA antes de pintar: el click en columna (con
 *      servicio armado) ya no pinta directo; abre _openHoraPicker precargado
 *      con la hora del click. Selector grande HH:MM (1 min) + ±5/±15 +
 *      Confirmar → recién ahí _colocarReserva(staffId, hhmm).
 *   4) ZOOM: slider #sliderSpacing 28–84 → 24–160 (más rango de ampliado).
 *      Las citas no se descuadran: el render usa ppm = rowPx/60 dinámico.
 *   5) MOVER EN VIVO: el ghost del drag de fase muestra la hora destino
 *      HH:MM en vivo; snap del movimiento desacoplado del grid a 5 min.
 *   6) CARD CON TIEMPOS: cada línea de servicio del modal de cita muestra su
 *      duración (minutos ocupados de las fases ocupantes; fallback
 *      duracionTotal si es 1 sola línea). Aditivo, no toca totales.
 *   7) SERVICIOS 1 MIN: "a medida" min 5→1 / step 5→1 / validación <5→<1;
 *      suelo visual del bloque 26→10px (y extensión 22→10). La duración
 *      guardada ya era exacta; solo se elimina el condicionamiento visual.
 *   8) REAJUSTAR FASE: icono 🕑 (aparece al pasar el ratón sobre el bloque,
 *      solo en fases movibles = no pagadas) abre el mismo _openHoraPicker en
 *      modo 'fase' → envía el 'mover-fase' existente (mismo reservaId,
 *      faseIndex, MISMA fecha, MISMO staff). Reutiliza backend moverFase.
 *   Nuevo método _openHoraPicker (modos 'colocar'/'fase'). Nuevas clases CSS
 *   .ks-horapick*, .ks-appt-timeadj, .ks-item-dur, .g-time. Gates existentes
 *   respetados (PAGADO/_puede) exactamente como el drag/colocar previos.
 * ---------------------------------------------------------------------
 * v1.1.63 (6 jul 2026):
 *   · COPIAR el informe del día al portapapeles, un botón por bloque:
 *     "📋 COPIAR" en el título de Rendimiento productivo y de Cierre
 *     financiero. Copia texto plano estructurado (patrón copyText del
 *     CRM Móvil: navigator.clipboard.writeText + fallback execCommand,
 *     textarea anclado al Shadow DOM), listo para pegar en WhatsApp o
 *     documento. Cabecera: bloque productivo → brandName; financiero →
 *     legalName. Ambos nombres llegan del page code v1.0.29 (mensaje
 *     'salonNombres' → backend getSalonConfig, que NO se toca).
 *     Nuevos helpers _copyText / _copyFallback / _cierreBloqueATexto.
 *     Los botones se cablean tras cada render del informe. CSS nuevo
 *     .cierre-copybtn. CERO backend nuevo, CERO URL, IDs existentes
 *     intactos. Chip de versión visible (v1.1.8) sin tocar.
 *
 * v1.1.62 (6 jul 2026):
 *   · NIVELES DE ACCESO en Recepción PRO (capa de front, widget only).
 *     Nuevo helper _puede(accion) que gobierna la UI según
 *     _empleadoActivo.accessLevel (StaffConfig · Number 1-4), que ya llega
 *     desde validateLoginPin (backend recepcionAccessLogic v1.0.4, sin
 *     tocar). Solo actúa con la capa de login activa (this._usersActivation
 *     ← SalonConfig.usersActivation). Sin login o sin empleado → acceso
 *     total (comportamiento previo idéntico). Sin nivel válido → N4.
 *       · N1 Administrador: todo.
 *       · N2 Encargado: todo salvo informe/cierre de días anteriores
 *         (solo el día en curso). Arqueo, ajustes y bloqueos permitidos.
 *       · N3 Recepción: todas las funciones sobre citas (crear, cobrar,
 *         cancelar, reprogramar, añadir/quitar). Sin arqueo, cierre,
 *         ajustes ni bloqueos.
 *       · N4 Básico: visualiza el calendario y abre citas en modo lectura.
 *         No crea, no edita, no cobra, no bloquea. Botones bloqueados
 *         responden "No tienes permiso para esta acción".
 *     Intercepciones (7): btnArqueo, btnCierre, btnAjustes (topbar),
 *     _colocarReserva (crear), _bindBlockDrag mousedown (bloqueo por
 *     arrastre), cobro .ks-pay[data-m] + acciones de edición del modal
 *     (if !paid → editarCita, con rama de aviso para N4).
 *     CERO backend, CERO HTML/markup nuevo, CERO IDs cambiados, CERO URLs.
 *     Chip de versión visible (v1.1.8) sin tocar.
 *
 * v1.1.61 (5 jul 2026):
 *   · Nueva sección "Servicios externos" en el informe de cierre
 *     (_renderCierre), alimentada por data.externosV2 que produce el
 *     backend dedicado cierreExternosLogic.obtenerDatosCierreExternos
 *     (lee PagoreservasExternos + cruza ExternalServices). Muestra
 *     desglose por servicio, Venta bruta externa y Comisión del salón.
 *     Render condicionado a externosV2.citas > 0. El color del título y
 *     de la comisión se resuelve con _staffColor() del empleado que
 *     tiene isExternal:true en this._staff (mismo patrón que el render
 *     del calendario) — sin color hardcodeado. Cambio ADITIVO: no toca
 *     la sección previa "Comisiones externos" ni ninguna otra parte del
 *     render.
 * ---------------------------------------------------------------------
 * v1.1.60 (4 jul 2026):
 *   · 🧹 LIMPIEZA del popup Armar servicio. Se ELIMINAN del render dos
 *     bloques que introducían ruido visual sin aportar valor operativo
 *     al estilista:
 *       · El párrafo con la descripción larga del servicio
 *         (`s.descripcion`, en `.ks-detail-note-simple` bajo la cabecera).
 *       · El bloque "CASCADA DE FASES" (`cascadeHTML`), compuesto por
 *         segmentos horizontales proporcionales al `mapeoFases`, la
 *         leyenda "Ocupado / PROCESO libre" y la nota final.
 *     Ambos vienen de v1.1.44 y anteriores; nunca llegaron a ser útiles
 *     en producción (la representación era estática, no reflejaba la
 *     selección real del estilista y confundía más que aclaraba).
 *     Cambio quirúrgico: solo se retiran las dos interpolaciones del
 *     `pop.innerHTML` en `_renderDetail`. Las funciones auxiliares
 *     `_resolverFases` y el CSS `.ks-cascade-*` se dejan intactas por
 *     si se retoma en el futuro una representación distinta; no se
 *     ejecutan al no invocarlas.
 *   · Cero cambios en: complementos, grupos exclusivos (v1.1.59),
 *     variantes del principal, cabecera, botones, comportamiento del
 *     armado, cascada visual del calendario, resto del widget.
 *
 * v1.1.59 (4 jul 2026):
 *   · 🔗 GRUPO EXCLUSIVO en el popup del servicio.
 *     Backend pareja: recepcionProLogic v1.0.36 (expone `mapeoFases`).
 *
 *     Cuando el `mapeoFases` del servicio armado contiene items
 *     tipo:'exclusivo' (grupo exclusivo definido con el chip rojo del
 *     editor v1.14.0+), el popover de detalle pinta un bloque nuevo
 *     bajo "Complementos" titulado "Grupos exclusivos" con una sección
 *     por grupo. Cada sección muestra el label del grupo ("Tratamiento")
 *     y las opciones como botones radio-like: primero "No añadir", luego
 *     una opción por cada ref válido con label/price/duration leídos de
 *     `this._porSetupUid` (catálogo vivo, cero hardcoding).
 *
 *     Estado guardado en `this._exclusivosSel[groupKey] = uid del servicio
 *     elegido`; ausencia del key = "No añadir".
 *
 *     `_armarServicio` recorre los items tipo:'exclusivo' del mapeoFases
 *     y, por cada elección guardada, empuja al array `complementosSetupUid`
 *     un objeto { uid, varianteId, varianteLabel, price, duration } — mismo
 *     shape que las variantes de complemento (patrón v1.1.44). El motor
 *     `construirFasesPack` v1.0.34 detecta el uid dentro de `f.refs` y
 *     materializa el servicio en la posición del chip rojo.
 *
 *     `_openDetail` resetea `this._exclusivosSel = {}` al abrir un servicio.
 *
 *   · Cero cambios en: cliente, calendario, sesiones, cobro, cierre,
 *     mensajes, staff, layout general, cascada visual, factura, arqueo,
 *     complementos con/sin variantes existentes.
 *
 * v1.1.58 (28 jun 2026):
 *   · 🐛 FIX: el botón "📄 Convertir a factura" del badge del ticket
 *     introducido en v1.1.57 no abría el formulario inline. Click
 *     visiblemente correcto, pero el modal volvía a pintar el mismo
 *     badge con el botón otra vez, sin form.
 *
 *   · DIAGNÓSTICO: en _renderFacturaSlot las ramas se evaluaban en
 *     orden A (generando) → B (documento existente) → C (form inline)
 *     → D (botones por defecto). Cuando el operador pulsa "Convertir
 *     a factura", el handler setea this._facturaForm = true y llama
 *     _renderFacturaSlot. Pero this._facturaDoc SIGUE poblado (el
 *     ticket existe en CMS y se cargó al abrir el modal). La rama B
 *     se evalúa antes que la C, así que se repinta el badge y nunca
 *     se llega a la rama C que mostraría el form. _facturaForm queda
 *     en true en memoria pero invisible en la UI.
 *
 *   · FIX: añadir guard `&& !this._facturaForm` a la condición de la
 *     rama B. Cuando el operador activa el form (vía botón Factura
 *     normal o vía botón Convertir a factura), la rama B se salta y
 *     la rama C dibuja el form correctamente. Al cancelar (set
 *     _facturaForm=false), volver a pintar la rama B con badge.
 *
 *   · Cambio QUIRÚRGICO de una sola línea (la condición del if de la
 *     rama B). Cero efectos colaterales: el flujo de emisión de
 *     factura desde el badge funciona ahora idéntico al flujo del
 *     botón Factura inicial, validado en v1.1.56.
 *
 *   · NO se toca: backend (v1.0.3 sigue valiendo), page code (v1.0.27
 *     sigue valiendo), CMS, ni cualquier otra rama del widget.
 *
 * v1.1.57 (28 jun 2026):
 *   · 🔄 BOTÓN "📄 Convertir a factura" al lado del badge de un ticket
 *     existente. Permite emitir una factura completa rectificativa cuando
 *     la clienta vuelve más tarde con su CIF/DNI. Escenario real validado
 *     contra el RD 1619/2012 (Reglamento de Facturación): factura
 *     rectificativa que reemplaza a factura simplificada.
 *
 *   · Comportamiento por estado:
 *       - Sin documento     → 2 botones: Ticket | Factura (sin cambio).
 *       - Ticket vigente    → badge T- + 🔗 + 📄 Convertir a factura.
 *       - Factura vigente   → badge F- + 🔗 (sin más botones — ya no
 *                              hay nada que hacer).
 *
 *   · Click en "Convertir a factura": mismo flujo que el botón Factura
 *     original (form inline CIF + Razón social). Al confirmar, el
 *     backend v1.0.3+ emite la factura F- nueva, marca el ticket T-
 *     original como `status='rectificada'` y rellena
 *     `rectifiesInvoiceNumber` para auditoría. El widget recibe
 *     'facturaGenerada' y repinta el slot mostrando la factura nueva.
 *
 *   · Toast informativo distinto cuando es upgrade ("Factura F-XXXX
 *     emitida · reemplaza al ticket T-YYYY").
 *
 *   · El badge del ticket ahora añade un tooltip recordatorio: "Click
 *     en 'Convertir a factura' si la cliente quiere factura completa
 *     con su CIF/DNI".
 *
 *   · NO se toca: backend (¡SÍ se toca, v1.0.3!), CMS Invoices /
 *     InvoiceCounters (estructura igual), page code (los handlers ya
 *     soportan vatId/legalName desde v1.0.27 y no cambian), botones
 *     Ticket/Factura iniciales, formulario inline CIF, badge de factura,
 *     línea método de cobro, ni nada más del modal.
 *
 * v1.1.56 (28 jun 2026):
 *   · 🧾 BOTONES TICKET / FACTURA en el modal de cita PAGADA. Sustituyen
 *     al botón "🗓 Cambiar fecha" (sin sentido en una cita ya realizada
 *     y pagada). Mismo espacio del footer:
 *       [ 🧾 Ticket ] [ 📄 Factura ]        [ Cerrar ]
 *
 *     Click en Ticket  → genera factura simplificada (T-2026-XXXX).
 *     Click en Factura → factura completa (F-2026-XXXX).
 *
 *     Si el cliente NO tiene CIF/NIF en el CRM, el botón Factura
 *     despliega un FORMULARIO INLINE dentro del propio modal con
 *     dos inputs (CIF/NIF obligatorio + Razón social opcional) y
 *     botones [Emitir factura] / [Cancelar]. Sin sub-modal, sin
 *     romper el flujo. El backend persiste el CIF en el contacto
 *     CRM al emitir, así que la próxima factura para ese cliente
 *     ya no preguntará.
 *
 *   · 🔁 RECUPERACIÓN DE FACTURA EXTRAVIADA. Al abrir una cita PAGADA
 *     el widget consulta el backend (obtenerDocumentoReserva). Si la
 *     cita YA tiene factura/ticket emitido, en lugar de los botones
 *     aparece un BADGE con el número del documento + icono 🔗 que
 *     abre el PDF en pestaña nueva. Si el operador perdió la copia
 *     impresa, abre la cita y vuelve a tener el PDF a un click. No
 *     re-emite, no toca contador, no duplica filas — solo abre el
 *     PDF existente.
 *
 *   · 💳 MÉTODO DE COBRO VISIBLE en el modal de cita PAGADA. Antes
 *     no se veía si la cita se había cobrado con Efectivo, Tarjeta,
 *     Bizum, Mixto o Canje. Ahora se muestra en una línea propia
 *     bajo los datos de cliente, con el icono correspondiente. Si
 *     fue Mixto, además aparece el desglose (T:XX€ · E:YY€ · B:ZZ€).
 *
 *     El dato viene de PaymentReservations.tipoPago, ya consultado
 *     por la respuesta 'pago-encontrado' existente; aquí solo se
 *     pinta en la UI.
 *
 *   · 📨 Mensajes nuevos hacia el page code v1.0.27+:
 *       'obtenerDocumento'   { reservaId } → 'documentoCita'
 *       'generarTicket'      { reservaId } → 'ticketGenerado'
 *       'generarFactura'     { reservaId, vatId?, legalName? } → 'facturaGenerada'
 *     Si el page code está aún en v1.0.26 (sin esos handlers), los
 *     botones se quedarán inactivos pero el modal sigue funcionando
 *     normalmente — no rompe nada existente.
 *
 *   · Estado nuevo en el modal: _facturaDoc, _facturaForm,
 *     _facturaGenerando, _pagoCita. Todos se resetean en _openModal.
 *
 *   · NO se toca: estética del modal, banner promo arco iris, borde
 *     dorado, bloque TOTAL, chip de descuento pagado, bloque canje
 *     box, layout, fuentes, colores, ni ningún flujo de cobro,
 *     cancelación, drag&drop, login PIN, calendario, ni nada más.
 *     Cambio AISLADO al footer y la zona post-total del modal de
 *     cita PAGADA, más una línea informativa con el método de cobro.
 *
 * v1.1.55 (28 jun 2026):
 *   · 🩹 FIX race condition primer render (caso "Cargando agenda…" que
 *     se queda colgado en la primera carga, y al refrescar funciona).
 *     v1.1.54 protegía _renderCalendar de pintar mensaje engañoso cuando
 *     this._staff aún estaba vacío, pero el problema raíz seguía: el
 *     widget enviaba 'ready' una vez (luego retry hasta recibir
 *     catalogoData) pero NO tenía retry independiente para staffData.
 *     Si la respuesta 'staffData' del page code caía en una ventana
 *     temporal mala (antes de que attributeChangedCallback estuviera
 *     totalmente armado, o tras el primer ready perdido), nunca llegaba
 *     un segundo intento → this._staff = [] permanentemente → calendario
 *     se quedaba en el placeholder inicial.
 *
 *   · SOLUCIÓN: añadido retry loop independiente para 'getStaff',
 *     mismo patrón que ya existe para 'ready' (catalogoData) y
 *     'usersActivation'. Reenvía cada 600ms hasta recibir staffData
 *     o agotar 15 intentos. Tres flags nuevos: _staffRecibido,
 *     _staffTimer, _staffTries. Cleanup en disconnectedCallback.
 *
 *   · 🎨 Tipografía citas menos tosca. .ks-appt-time pasa de
 *     font-weight 700 → 500 (hora, secundaria). .ks-appt-client
 *     pasa de 700 → 600 (cliente/servicio, sigue legible sobre el
 *     fondo de color del staff pero ya no "grita"). Cambio puramente
 *     cosmético, dos reglas CSS.
 *
 *   · NO se toca ninguna otra función ni flujo. Cero impacto sobre
 *     handlers, modal cobro, F4/F5, drag&drop, calendar render,
 *     cierre del día, login PIN, ni nada existente.
 *
 * v1.1.54 (26 jun 2026):
 *   · 🩹 FIX race condition en el primer render. El mensaje "Sin empleados
 *     visibles (revisa Ajustes ⚙)" aparecía la primera vez que se cargaba
 *     Recepción PRO, y al refrescar la página ya funcionaba bien.
 *
 *   · DIAGNÓSTICO: `_renderCalendar()` se invoca desde 3 sitios distintos
 *     (response staffData, reservasData, settings-data). Si reservasData o
 *     settings-data llegan ANTES que staffData (cuestión del orden de
 *     respuestas del page code / backend / Wix Data), this._staff todavía
 *     es [] cuando se ejecuta `_getVisibleStaff()`, que devuelve [], y se
 *     pinta el mensaje "Sin empleados visibles" SIN que sea cierto.
 *     Al refrescar, el orden de respuestas cambia (probablemente por
 *     cache de cliente CRM / settings ya cargados) y staffData llega
 *     primero — race "afortunada" → sin error visible.
 *
 *   · CAUSA RAÍZ: el mensaje confunde dos estados distintos:
 *       A) `this._staff = []` (estado TRANSITORIO mientras llega la
 *          respuesta del backend; el placeholder inicial "Cargando agenda…"
 *          es lo correcto aquí).
 *       B) `this._staff` con contenido pero `_getVisibleStaff() === []`
 *          (el operador ocultó TODOS los empleados en Ajustes — esto sí
 *          es config a revisar y el mensaje "Sin empleados visibles
 *          (revisa Ajustes ⚙)" es correcto).
 *     La versión actual trata A como si fuera B.
 *
 *   · FIX: en `_renderCalendar()`, si `this._staff` aún está vacío
 *     (caso A), salir temprano sin tocar el DOM. El placeholder
 *     "Cargando agenda…" que pinta `_renderShell()` se mantiene. Cuando
 *     staffData llegue, el case 'staffData' en el listener llamará a
 *     `_renderCalendar()` de nuevo y ahora sí pintará la cuadrícula.
 *
 *   · Cambio: UNA línea añadida al inicio de `_renderCalendar`. Cero
 *     impacto en el resto del flujo, en el caso B (que sigue mostrando
 *     el mensaje correcto), ni en ningún otro render del widget.
 *
 * v1.1.53 (26 jun 2026):
 *   · COLUMNA LATERAL COLAPSABLE para que Recepción PRO Full sea usable
 *     en móvil horizontal / tablet pequeña (<1024px de ancho) sin que la
 *     columna de servicios (que en escritorio mide 360px) tape la mitad
 *     del calendario y obligue a scroll lateral.
 *
 *   · Implementación minimalista (alcance v1.1.53):
 *       · Botón flotante <button.ks-aside-toggle> anclado al borde
 *         superior izquierdo del .ks-main (z-index alto, sobre el
 *         calendario). Visible siempre.
 *       · Click → alterna clase `.is-collapsed` en .ks-aside.
 *         Cuando colapsada, width pasa a 0px y desaparece el border-right
 *         (el calendario ocupa el 100% del ancho restante).
 *       · Icono del botón: ⇤ cuando expandida (acción: colapsar),
 *         ⇥ cuando colapsada (acción: expandir).
 *       · Estado nuevo this._sidebarCollapsed. Default según viewport:
 *         viewports < 1024px arrancan COLAPSADOS; viewports ≥ 1024px
 *         arrancan EXPANDIDOS (= comportamiento histórico, cero cambio
 *         en escritorio).
 *
 *   · Fuera de alcance (para v1.1.54+ si se quiere):
 *       · Auto-colapso tras armar servicio + click en calendario.
 *         Requiere tocar el flujo _colocarReserva y casa con la regla
 *         "cambios quirúrgicos": se deja para una sesión dedicada.
 *       · Persistencia del estado entre recargas (sessionStorage).
 *       · Animación CSS transition: width (purely cosmético).
 *
 *   · NO se toca: estructura del HTML del aside ni del main, layout
 *     interno del aside (panel cliente + panel servicios), calendario,
 *     modal cita, modal cobro, banner arco iris, ningún flujo de negocio.
 *     Solo se añade UN botón + UNA clase CSS + UN estado en el componente.
 *
 * v1.1.52 (26 jun 2026):
 *   · LÉXICO. Los bonos se CANJEAN, no se cobran. Obligar al operador a
 *     pulsar "Efectivo" para una cita 100% cubierta por un bono era una
 *     chapuza contranatura — sugería ingreso en caja cuando NO HAY
 *     ingreso (el dinero ya entró cuando el cliente compró el bono).
 *
 *   · Cambio en _renderModal: si el TOTAL del modal es 0€ Y hay canje
 *     activo (this._canjeActivo), los 4 botones de pago (Efectivo /
 *     Tarjeta / Bizum / Mixto) DESAPARECEN y son sustituidos por UN
 *     ÚNICO botón "Marcar como canjeado". Mismo estilo visual que los
 *     botones de pago para no romper la estética del modal, pero
 *     semánticamente correcto.
 *
 *   · El click en "Marcar como canjeado" llama a _pagar('Canje', '').
 *     marcarPagadoReserva graba tipoPago='Canje' en PaymentReservations.
 *     Esto deja la cita PAGADA (status correcto, paridad con el resto
 *     del flujo) pero el arqueo / cierre financiero no la cuenta como
 *     ingreso en caja (importeTotal=0, tipoPago≠Efectivo/Tarjeta/Bizum).
 *     Productividad sí la cuenta porque el servicio se hizo (línea
 *     "Servicios del día" en el informe del día — paridad confirmada
 *     en producción 26-jun).
 *
 *   · NO se toca el caso normal (total > 0): cuando hay un canje
 *     parcial (futuro: bono con descuento, tarjeta con promoPrice > 0,
 *     etc.) o no hay canje, los 4 botones de pago se pintan como hasta
 *     ahora porque sí hay efectivo/tarjeta/bizum que entra a caja.
 *
 *   · Backend NO se toca: marcarPagadoReserva ya acepta cualquier
 *     string en metodoPago. Page code NO se toca: handlePagarReserva
 *     pasa el metodoPago tal cual al backend.
 *
 * v1.1.51 (26 jun 2026):
 *   · F4/F5 AUTO-DETECCIÓN. Al abrir el modal de cobro de una cita con
 *     contactId, el widget envía 'getProductosCustom' al page code
 *     (v1.0.25+) y recibe { prime, bonos, tarjetas } activos del cliente.
 *     Los bonos y tarjetas se PINTAN automáticamente en el bloque
 *     canjeBox con un botón "Usar" en cada uno → click auto-aplica sin
 *     que el operador tenga que escribir el código.
 *
 *   · El input manual de código se mantiene visible como alternativa al
 *     final del bloque (para tarjetas regalo recibidas en papel o casos
 *     edge en que el portador no coincide con el contactId de la cita).
 *
 *   · BONO CUBRE EL 100% DEL SERVICIO (alineado con backend v1.0.32).
 *     El cliente ya pagó el servicio cuando compró el bono. El ahorro
 *     que devuelve el backend ya es el precio entero del servicio
 *     (precioLinea), no un porcentaje sobre él. El widget no calcula
 *     nada en este aspecto: solo confía en el `ahorro` del backend.
 *     El descripcionToken ahora dice "Bono BN-XXXX cubre Corte Caballero
 *     (-20€)" en lugar del erróneo "-25% sobre Corte Caballero" de v1.1.50.
 *
 *   · Estado nuevo this._productosCliente:
 *       { prime, bonos:[{ code, serviceLabel, remainingUses, totalUses,
 *                         expirationDate, voucherImage }],
 *         tarjetas:[{ code, serviceLabel, expirationDate, promoCardImage }] }
 *     Se resetea a null en _openModal y se rellena al recibir
 *     'productosCustomCliente'. _renderCanjeBox lo usa para la lista.
 *
 *   · _renderCanjeBox refactorizado en 3 estados:
 *       A) Canje aplicado → token + Quitar (como v1.1.50).
 *       B) Cliente con bonos/tarjetas activos → lista de cards con "Usar"
 *          + input manual al final.
 *       C) Cliente sin productos custom (o provisional) → solo input manual
 *          (= comportamiento v1.1.50).
 *
 *   · El click en "Usar" de un bono/tarjeta de la lista llama al mismo
 *     flujo de 'aplicarCanje' que el input manual (con el código del item
 *     ya rellenado). Cero duplicación de lógica.
 *
 *   · NO se toca: estética del modal, banner arco iris, borde dorado,
 *     bloque TOTAL, chip de descuento pagado, layout, fonts, colores,
 *     margins, padding, animaciones, el resto de handlers/flujos.
 *
 * v1.1.50 (26 jun 2026):
 *   · F4/F5 — Identificación y canje de Bonos (BN-...) y Tarjetas
 *     Promocionales (KP-...) en el modal de cobro de la cita.
 *     Versión MINIMALISTA (sesión 26-jun): solo input manual de código.
 *     Sin auto-listado de bonos/tarjetas del cliente todavía; ese
 *     auto-listado es v2 cuando este flujo base esté validado.
 *
 *   · Nuevo bloque en _renderModal, INSERTADO debajo del bloque
 *     "Descuento manual" existente. Layout:
 *       [ input código BN-/KP- ]  [ Aplicar ]
 *     Si hay canje aplicado:
 *       🎟️ Bono BN-XXXX-XXXX -25% sobre Corte Caballero  [ ✕ Quitar ]
 *       (y el TOTAL del modal repinta restando el ahorro del canje)
 *
 *   · Estado nuevo this._canjeActivo (null por defecto):
 *       {
 *         tipo: 'bono' | 'tarjeta',
 *         codigo: 'BN-...' | 'KP-...',
 *         ahorro: number,                   // euros
 *         descripcionToken: 'Bono BN-... -25% sobre Corte Caballero',
 *         serviceLabel, precioLinea, descuentoPct (bono) | precioPromo (tarjeta),
 *         voucherId | promoCardId
 *       }
 *     Se rellena al recibir 'canjeAplicado' ok del page code y se
 *     pierde al cerrar el modal (_openModal lo resetea a null).
 *
 *   · Flujo del cobro (orquestación):
 *       1) Operador escribe BN-TEST-0001 → click Aplicar
 *          → _sendToPage('aplicarCanje', { reservaId, codigoProducto })
 *       2) page code llama backend aplicarCanjeProducto (valida + calcula
 *          sin escribir). Responde 'canjeAplicado'.
 *       3) Widget recibe respuesta. Si ok → guarda this._canjeActivo y
 *          re-renderiza modal. Si error → toast con el mensaje.
 *       4) Modal muestra el token y recalcula TOTAL = subtotal − discEur
 *          (descuento manual) − this._canjeActivo.ahorro (canje).
 *       5) Operador pulsa botón de pago → _pagar() incluye en
 *          descripcionExtra el descripcionToken del canje (concatenado a
 *          los tokens existentes 🌈 Promo / 🏷️ Descuento) y resta el
 *          ahorro del importeNeto. Envía 'pagarReserva' como hoy.
 *       6) Tras recibir 'reservaPagada' ok del page code, si había
 *          canje activo → _sendToPage('confirmarCanje', { reservaId,
 *          codigoProducto, staff, activationMethod:'manual' }).
 *          Idempotente en backend: doble click no descuenta dos usos.
 *
 *   · marcarPagadoReserva NO se toca (parámetros importeNeto +
 *     descripcionExtra existen desde v1.0.4). Aquí solo se ENRIQUECE lo
 *     que el widget ya manda hoy. handlePagarReserva del page code sigue
 *     igual.
 *
 *   · NO se toca: estética del modal, banner arco iris, borde dorado,
 *     bloque TOTAL existente, chip de descuento pagado, layout, fonts,
 *     colores, margins, padding, animaciones. Solo se AÑADE un bloque
 *     justo debajo del descuento manual.
 *
 * v1.1.48 (21 jun 2026):
 *   · La duración del timeout de inactividad se lee de SalonConfig.timeOut
 *     (campo número, en SEGUNDOS) en lugar de estar fija a 60s. El backend
 *     recepcionAccessLogic v1.0.4 la devuelve junto al flag usersActivation
 *     (misma llamada, sin query extra). Si el campo no existe o no es un
 *     número > 0, se mantiene el default de 60s.
 *   · El valor llega en segundos y el widget lo convierte a ms (×1000).
 *   · Sin otros cambios respecto a v1.1.47.
 *
 * VERSION: 1.1.47  ·  FIX timeout de inactividad nunca se disparaba
 * FECHA: 21 de junio de 2026
 * ---------------------------------------------------------------------
 * v1.1.47 (21 jun 2026):
 *   · FIX: el timeout de inactividad de 60s NO se disparaba nunca. Causa:
 *     el listener de actividad incluía 'pointermove', que reinicia el timer
 *     en CADA píxel que el operador mueve el cursor. Con un humano delante
 *     el ratón se mueve constantemente → el timer no llegaba jamás a 60s.
 *   · SOLUCIÓN: la inactividad se mide por ACCIONES reales (click + tecla),
 *     no por movimiento del ratón. Quitado 'pointermove' del attach/detach.
 *   · Sin otros cambios respecto a v1.1.46.
 *
 * VERSION: 1.1.46  ·  FIX race condition: usersActivation no llegaba al page code
 * FECHA: 21 de junio de 2026
 * ---------------------------------------------------------------------
 * v1.1.46 (21 jun 2026):
 *   · FIX: el login no aparecía y NO había rastro de 'usersActivation' en
 *     los logs de Wix. Causa: el widget enviaba 'usersActivation' UNA sola
 *     vez en connectedCallback, pero el page code engancha su listener
 *     'recepcion-message' en su onReady. Por la carrera de tiempos en Wix,
 *     ese primer (y único) envío caía antes de que el listener existiera y
 *     se perdía silenciosamente. 'ready' sobrevivía porque ya tenía retry
 *     loop; 'usersActivation' no.
 *   · SOLUCIÓN: 'usersActivation' se REENVÍA dentro del mismo retry loop que
 *     'ready' (cada 700ms) hasta recibir la respuesta. Nuevo flag
 *     _usersActivationRecibido detiene el reintento al llegar la respuesta.
 *     Mismo patrón postMessage-retry ya usado para 'ready'.
 *   · Sin otros cambios respecto a v1.1.45.
 *
 * VERSION: 1.1.45  ·  Capa de acceso / login por PIN dentro del Custom Element
 * FECHA: 21 de junio de 2026
 * ---------------------------------------------------------------------
 * v1.1.45 (21 jun 2026):
 *   · CAPA DE ACCESO (login por PIN) MOVIDA AL SHADOW DOM del Custom Element.
 *     Antes vivía en un HTML Component externo (iframe) que NO conseguía
 *     tapar las citas .ks-appt (position:absolute, z-index alto dentro del
 *     Shadow DOM): ninguna caja nativa, z-index ni _el.hide() las cubría.
 *     Ahora el login es un overlay .ks-login-scrim (z-index 200) DENTRO del
 *     mismo Shadow DOM que las citas, así que las tapa por completo.
 *   · Solo se activa si el salón tiene la capa de acceso (flag leído por el
 *     page code; el widget pregunta con 'usersActivation' al montar). Si no
 *     está activa, Recepción PRO funciona EXACTAMENTE igual que en v1.1.44.
 *   · Flujo: rejilla de tarjetas de empleado (aro de color + foto/inicial)
 *     → teclado PIN de 4 dígitos → validación. Tema claro mimético con los
 *     tokens --ks-*, Bai Jamjuree heredada del :host.
 *   · Timeout de inactividad 60s con actividad REAL (click/keydown/
 *     pointermove en el Shadow DOM) → vuelve al login. Ventaja sobre el
 *     iframe: detecta actividad real del operador sobre la propia agenda.
 *   · Log de actividad: 'login' y 'timeout' se envían al page code con
 *     'logEvent' (fire-and-forget). El page code mapea el resto de acciones
 *     de negocio en su listener; el backend recepcionAccessLogic NO se toca.
 *   · Mensajes nuevos al page code: 'usersActivation', 'staffLogin',
 *     'validatePin', 'logEvent'. Respuestas escuchadas: 'usersActivation',
 *     'staffLogin', 'pinValidated'.
 *   · NO se toca NINGUNA otra función ni estética del widget. Puramente
 *     aditivo sobre v1.1.44.
 *
 * v1.1.44 (19 jun 2026):
 *   · Complementos con VARIANTES en Recepción PRO. Antes el complemento era
 *     siempre un toggle sí/no que mandaba solo el uid → un complemento con
 *     variantes (Planchado M/L/XL) solo aplicaba la opción base. Ahora:
 *       - Complemento sin variantes → toggle (igual que antes).
 *       - Complemento con variantes → selector de variante (chips con
 *         precio/duración). Si es `required` (está como fase del mapeoFases),
 *         hay que elegir una variante para poder armar (no hay "no añadir").
 *     Al armar se envía cada complemento elegido como objeto
 *     { uid, varianteId, varianteLabel, price, duration } (o string si es
 *     simple). crearPackReserva v1.0.23+ ya lo procesa (normaliza + fusiona).
 *     Backend getCatalogoReserva v1.0.26 incluye hasVariants/variantes/required
 *     por complemento.
 * ---------------------------------------------------------------------
 * v1.1.43 (19 jun 2026):
 *   · FIX: al armar un servicio con variantes (Corte Mujer M/L/XL), la
 *     variante elegida NO aplicaba precio/duración — se creaba con el base.
 *     El widget guardaba variantIdx pero NO lo enviaba al backend. Ahora
 *     _submit envía `varianteSel {idx,label,price,duration}` en el payload
 *     de crearReserva; crearPackReserva v1.0.25 aplica ese precio/duración.
 *   · El selector de variante muestra ahora precio (o "incluido") y duración.
 *   · FIX variantes "[object Object]" cubierto por backend v1.0.24 (label).
 *   · Incluye el fix v1.1.42: tras staffData, re-pedir get-settings para
 *     aplicar colores/posiciones persistidos sin depender del orden.
 * ---------------------------------------------------------------------
 * v1.1.40:
 *   · ELIMINADA la gestión local de bloqueos en memoria (this._customBlocks
 *     desaparece del constructor y de todo el render). Antes los bloqueos
 *     dibujados a mano (vacaciones / almuerzos / descansos) vivían SOLO
 *     en memoria del widget → se perdían al recargar la página y el
 *     widget público de reservas NO los veía → un cliente podía reservar
 *     online en franjas que el salón había bloqueado manualmente. BUG GRAVE.
 *   · AHORA los bloqueos son filas reales en KamisuiteReservations con
 *     family='BLOQUEO' y clientName con prefijo fijo 'BLOQUEO:<motivo>'
 *     (ej. 'BLOQUEO:Almuerzo'). Sobreviven a recargas y el motor de
 *     huecos público (widgetPublicoLogic.getHuecosDisponibles) los ve
 *     automáticamente porque ya consulta esa colección — cero cambios
 *     en widgetPublicoLogic.
 *   · El render del rayado diagonal (.ks-customblock) sigue siendo
 *     idéntico visualmente. Lo que cambia es de DÓNDE vienen los datos:
 *     ahora se iteran `this._reservas.filter(r => r.family === 'BLOQUEO'
 *     && r.staffId === s.wixResourceId)` en lugar de this._customBlocks.
 *   · Las citas REALES se filtran al revés para que los bloqueos no
 *     aparezcan en _apptHTML, en el cálculo de lanes side-by-side
 *     (v1.1.36), en el semáforo de solapes (v1.1.30) ni en el contador
 *     de citas del topbar.
 *   · 3 nuevos mensajes hacia el page code v1.0.17:
 *       · 'crearBloqueo'      { fechaISO, horaHHmm, duracionMin, staffId, motivo }
 *       · 'eliminarBloqueo'   { id }
 *       · 'actualizarBloqueo' { id, motivo }
 *     Y 3 respuestas escuchadas (bloqueoCreado / bloqueoEliminado /
 *     bloqueoActualizado) que refrescan el calendario.
 *   · El drag para crear bloqueo, el click ✕ y el click para editar
 *     motivo SIGUEN funcionando exactamente igual desde el punto de
 *     vista del operador. Lo que cambia es que ahora se persisten en BD.
 *   · NO se toca: estética del rayado, drag de citas, modal popup,
 *     banner descuento promocional (v1.1.38/39), polling adaptativo
 *     (v1.1.35), overlap rendering (v1.1.36), semáforo solapes (v1.1.30),
 *     drag&drop de fases (v1.1.29), ni ninguna otra función del widget.
 *
 * v1.1.39:  ·  Descuento promocional aplicado al TOTAL (neto)
 * FECHA: 14 de junio de 2026
 * ---------------------------------------------------------------------
 * v1.1.39:
 *   · El descuento promocional del servicio (r.tienePromoServicio /
 *     r.descuentoServicioTotal, calculado en backend recepcionProLogic
 *     v1.0.19+) AHORA se APLICA al TOTAL del modal de cita. Antes (v1.1.38)
 *     solo se pintaba el banner arco iris arriba pero el TOTAL seguía
 *     mostrando el precio sin descontar — incoherente con la expectativa
 *     del operador.
 *   · El render del TOTAL usa EXACTAMENTE el mismo patrón visual que el
 *     descuento manual ad-hoc del operador: subtotal original tachado +
 *     nota naranja `-X,XX€` + total neto en negrita. Estética intacta:
 *     mismo color naranja #d48a1a, mismo font-size 11px, mismo borde
 *     dorado heredado de v1.1.38, mismo separador ` · ` ya usado en el
 *     código.
 *   · El % manual del operador (botón "+ Aplicar descuento") se aplica
 *     SOBRE el subtotal post-promo. Encadenado igual que V1:
 *       subtotal 16€ → −1,60€ promo → 14,40€ post-promo
 *                    → −15% manual → 12,24€ TOTAL neto.
 *     Cuando hay AMBOS, la nota del TOTAL muestra los dos tokens
 *     concatenados: "-1,60€ · -15% (-2,16€)".
 *   · Al cobrar (Efectivo/Tarjeta/Bizum/Mixto): el `importeNeto` enviado
 *     al backend ya está descontado tanto por promo como por manual.
 *     `descripcionExtra` incluye token "🌈 Promo -X,XX€" si la cita lleva
 *     descuento de servicio, concatenado con el token "🏷️ Descuento -Y%
 *     (-Z€)" del manual cuando aplica. PaymentReservations recibe el
 *     importe correcto + trazabilidad del desglose en descripción.
 *   · _renderDescuentoChipPagado: incluye el token de promo en el flash
 *     UI inmediatamente post-cobro cuando la cita tenía descuento de
 *     servicio (caso edge: pago de cita con promo+manual simultáneos).
 *   · NO se toca: banner arco iris arriba del modal, borde dorado del
 *     modal, layout, clases CSS, colores, fuentes, copy del banner ni
 *     ninguna otra función del widget. Solo lógica de cálculo + render
 *     del bloque TOTAL + descripcionExtra del cobro.
 *
 * v1.1.38:  ·  Banner arco iris descuento promocional (modal cita)
 * FECHA: 14 de junio de 2026
 * ---------------------------------------------------------------------
 * v1.1.38:
 *   · Paridad V1 literal: cuando un servicio del pack tiene descuento
 *     promocional activo (ServiceCatalog.descuentoActivo + descuentoPromo),
 *     el modal popup de la cita pinta un banner arco iris en la parte
 *     superior con el ahorro total: "Servicio con descuento promocional
 *     -X,XX€" en chip rojo.
 *   · Borde dorado sutil en .ks-modal cuando hay promo del servicio.
 *   · Solo visual: NO toca el cálculo del TOTAL ni el descuento manual
 *     ad-hoc del operador. La lógica de cobro existente sigue funcionando.
 *   · Datos vienen del backend recepcionProLogic v1.0.18+ vía:
 *       r.tienePromoServicio (boolean)
 *       r.descuentoServicioTotal (number)
 *       r.serviciosPromo (array, no usado aquí pero disponible).
 *   · NO se aplica al bloque de cita del calendario (border-left verde/
 *     naranja por pagado/pendiente sigue intacto). En V1 el arco iris
 *     también vive solo en el modal popup.
 *
 * v1.1.37:  ·  Fix datepicker posicionamiento
 * FECHA: 13 de junio de 2026
 * ---------------------------------------------------------------------
 * v1.1.37:
 *   · Fix datepicker: añadidos `top:100%; left:0` a `.dp-popover` para
 *     que el calendario aparezca DEBAJO de la barra de navegación de
 *     fechas en lugar de a su misma altura. La cabecera del mes
 *     ("Junio 2026") ya no queda tapada por la topbar.
 *   · ÚNICO cambio: dos propiedades CSS añadidas en una regla. Nada más
 *     se modifica del datepicker (ancho, padding, colores, contenido,
 *     animaciones, etc).
 *
 * v1.1.36:  ·  Side-by-side overlap rendering
 * FECHA: 12 de junio de 2026
 * ---------------------------------------------------------------------
 * v1.1.36:
 *   · Las citas que coinciden total o parcialmente en la misma columna
 *     de staff ya NO se superponen. Se dividen horizontalmente el ancho
 *     de la columna en proporción al número de citas solapadas (mismo
 *     patrón que Google Calendar, Outlook).
 *   · Algoritmo: por cada columna de staff, recopila los bloques (citas
 *     legacy + fases ocupantes), los ordena por hora de inicio, asigna
 *     a cada uno el primer lane libre, y calcula el total de lanes del
 *     "cluster" de solape mediante Union-Find. Cada bloque queda en
 *     `left = lane * (100/total)%`, `width = (100/total)% - gap`.
 *   · Bloques sin solape se renderizan como antes (CSS por defecto
 *     left:5px right:5px) — sin overhead visual.
 *   · Gap visual de 3px entre lanes para que no se peguen.
 *   · Funciona con fases multi-staff (drag&drop) y con extensiones manuales.
 *   · Migra parte del comportamiento de la agenda V1 a V2.
 *
 * v1.1.35:  ·  Auto-refresh adaptativo de la agenda
 * FECHA: 12 de junio de 2026
 * ---------------------------------------------------------------------
 * v1.1.35:
 *   · Polling adaptativo cada 30s de la agenda (getReservas) — SOLO
 *     mientras la pestaña tiene foco (document.visibilityState === 'visible').
 *   · Pausa automática al perder foco (otra pestaña, minimizado, móvil
 *     en segundo plano). Cero queries hasta que el operador vuelva.
 *   · Query inmediata al recuperar foco (sin esperar 30s) para ver el
 *     estado actualizado de un vistazo.
 *   · Necesario porque el widget público pone reservas en KamisuiteReservations
 *     en paralelo y antes la agenda Recepción no se enteraba hasta cambio
 *     manual de fecha. Reportado por Jal: tenía que retroceder un día y
 *     volver para ver la reserva web.
 *   · Multi-tenant: con 30 salones * 3 operadores * 8h, este patrón ahorra
 *     ~80% de queries vs polling fijo cuando hay pestañas en background.
 *   · Spinning visual en el botón ↻ Recargar al pulsarlo, hasta que
 *     llegue la respuesta (o 5s como tope de seguridad).
 *   · disconnectedCallback limpia timers + listeners para no dejar zombi.
 *
 * v1.1.34:  ·  Banner ficha incompleta (B04 del checklist V1→V2)
 * FECHA: 12 de junio de 2026
 * ---------------------------------------------------------------------
 * v1.1.34:
 *   · Nuevos helpers _checkClienteIncompleto() + _warnHTML() copiados
 *     literal del patrón V1 (kamisuite-agenda v2.0.5 — F05 del briefing).
 *     Detecta:
 *       · Email vacío o genérico (booking@hair-times.com, info@…).
 *       · Sin apellido.
 *       · Sin teléfono.
 *   · Banner naranja con dot rojo parpadeante (animación warnBlink) en:
 *       · _renderClienteSelected — sidebar tras elegir cliente.
 *       · _renderModal — sobre los datos de cliente en el modal de cita.
 *   · NO se aplica a clientes provisionales (su badge ya advierte).
 *   · Keyframes warnBlink añadido al CSS.
 *   · Cierra parte de B04 del checklist V1→V2 (queda pendiente: semáforo
 *     individual del cliente y semáforo del día en topbar).
 *
 * v1.1.33:  ·  Editar contacto + warning falta tlf/email + prefijo país
 *   · Botón ✎ Editar en la ficha del cliente (solo si no es provisional
 *     y tiene contactId). Abre modal _openEditarCliente con datos
 *     pre-rellenados y envía 'editarContacto' al page code.
 *   · Warning en _emitirReserva: si el cliente no es provisional y no
 *     tiene teléfono ni email → confirm() pidiendo continuar igualmente.
 *     No se aplica a provisionales (su badge ya advierte).
 *   · Selector de prefijo país (component compartido) en los modales de
 *     crear cliente y editar cliente. Lista corta: ES, PT, FR, IT, GB,
 *     DE, MA, AR, MX, US. Default ES (+34). Al guardar: concatena como
 *     "+34 676123456". Al editar: parsea prefijo del teléfono existente.
 *   · Listener 'contactoEditado' tras la respuesta del page code.
 *   · Requiere page code v1.0.16 (handler editarContacto).
 *
 * v1.1.32:  ·  Badge origen Recepción/Web en modal
 * FECHA: 11 de junio de 2026
 * ---------------------------------------------------------------------
 * v1.1.32:
 *   · Badge "💼 Recepción" o "🌐 Web" en el header del modal de cita,
 *     leyendo r.origenRecepcion. Misma pieza visual que el badge
 *     "Provisional" — pequeña píldora junto al estado de pago.
 *     Útil para que el operador sepa al vuelo si la cita la creó
 *     un cliente desde la web o un compañero en mostrador.
 *     Requiere backend recepcionProLogic v1.0.17 (origenRecepcion
 *     opcional en crearPackReserva).
 *
 * v1.1.31:
 *   (1) z-index del bloqueo bajado de 6 a 2. Antes el rayado quedaba
 *       ENCIMA de la cita; si el operador metía una cita en una franja
 *       bloqueada (caso de compromiso especial), la cita quedaba
 *       tapada por el bloqueo. Ahora la cita se ve encima del rayado.
 *   (2) Título editable en el bloqueo:
 *       · Al crear (drag): prompt "Motivo del bloqueo (opcional)".
 *         Vacío / cancelar → "Bloqueado" (default actual).
 *       · Click en el bloqueo (no en el ✕) → prompt para editar.
 *       Ejemplo de uso: "Visita comercial KERASTASE".
 *
 * v1.1.30: Semáforo solapes + snap configurable + + Servicio.
 *   (1) SEMÁFORO DE SOLAPAMIENTOS en topbar (verde / naranja / rojo).
 *       Verde: sin solapes. Naranja: ≤15 min. Rojo: >15 min.
 *       Calcula el peor solape entre FASES ocupantes por staff
 *       (incluye fases con staffId override por drag&drop). Se
 *       actualiza tras cada render.
 *   (2) SNAP CONFIGURABLE en el drag de fase: atado a
 *       settings.interval (10/15/30) si está seteado; fallback 5 min.
 *   (3) + SERVICIO ADICIONAL: nuevo modal que lista los servicios
 *       principales del catálogo. Al elegir uno, llama al backend
 *       `agregarServicioReserva` que arma la cascada del nuevo
 *       servicio (cascada completa si es complejo, una fase si
 *       simple) y la encadena al final de la cita existente.
 *
 * v1.1.29: Drag&drop de fases individuales.
 *          otra hora (misma columna) o a otra columna (otro staff).
 *          · Cada bloque ocupante (no PROCESO) es draggable salvo si la
 *            cita está PAGADA.
 *          · Mismo patrón V1: threshold 5px, ghost siguiendo el cursor,
 *            resaltado de la columna destino, snap a 5 min al soltar.
 *          · Backend `moverFase` actualiza fases[idx].start/end y, si
 *            el staff destino difiere del raíz, añade staffId override.
 *            Si staff destino = staff raíz, elimina el override.
 *          · Render: cada columna pinta las fases con
 *            (f.staffId || r.staffId) === columna. Una cita con fases
 *            asignadas a varios staffs aparece partida en sus columnas
 *            correspondientes. La cita "pertenece" al staffId raíz para
 *            cobro, expediente y comisiones — V1 ya hacía esto al ser
 *            cada fase booking independiente; en V2 lo replicamos en
 *            el array `fases[]` de KamisuiteReservations.
 *
 * v1.1.28: Banner Reconciliación oculto + fix neto Rendimiento.
 *          layout de 2 columnas (Rendimiento izquierda, Cierre derecha)
 *          empujando Cierre a una fila inferior. El backend lo sigue
 *          calculando para auditar pero el widget no lo pinta.
 *          (2) Acompañado del fix backend v1.1.3 slice(4): ahora los
 *          netos con descuento sí se aplican en Rendimiento Productivo.
 *
 * v1.1.27: Informe del día refleja descuentos correctamente.
 *         · Rendimiento Productivo: en "Clientes del día", si la cita
 *           se cobró con descuento, muestra el bruto tachado + label
 *           (-50% o -25€) + neto en color normal.
 *           Ejemplo: ~39.50€~ -50% 19.75€
 *         · Cierre Financiero: nueva sección "🏷️ Descuentos aplicados"
 *           justo después de "Cobrado por método de pago". Lista cada
 *           cliente con su descuento y el total de descuentos del día.
 *         Requiere backend cierreLogicExtendido v1.1.1+ que cruza
 *         pagos y reservas para obtener el neto real cobrado.
 *
 * v1.1.26: Descuento con dos modos: % y €.
 *         seleccionables con toggle [%] [€] a la izquierda del input.
 *         · Modo % (default): valor 0-100, descuento = subtotal × pct.
 *         · Modo €: valor libre, descuento = importe fijo en euros
 *           (capped al subtotal para no quedar negativo).
 *         Al cobrar, descripcionExtra refleja el modo elegido:
 *           "🏷️ Descuento -50% (-19.75€)"   (modo %)
 *           "🏷️ Descuento -25€"             (modo €)
 *         El importeNeto enviado al backend ya está rebajado igual
 *         que antes — backend y page code no se tocan.
 *
 * v1.1.25: Variantes de productos (250ml / 1000ml).
 *         varias variantes (ej. 250ml / 1000ml) ahora se muestran
 *         como header expandible (▸) con un contador "X variantes".
 *         Al pulsar, se expanden las variantes como sub-items
 *         indentados (↳ 250ml / 19.85€). Click en una variante la
 *         añade al carrito conservando productId + variantId. El
 *         carrito acepta el mismo producto con distintas variantes
 *         (clave única cartKey = productId + ':' + variantId). El
 *         envío al backend incluye variantId + variantLabel por item.
 *         Requiere backend tiendaProductos v1.5.11+ (devuelve variants
 *         en listarProductos y acepta variantId en items).
 *
 * v1.1.24: Productos vendidos visibles en la tarjeta de cita.
 *         adicionales en el modal de esa cita (igual que V1). Cada línea
 *         con marker 🛒, color verde, badge "VENDIDO" — indica que el
 *         producto ya está cobrado (no se incluye en el TOTAL del pack
 *         porque es venta independiente). NO tiene ✕ porque no se quita
 *         desde aquí (ya está vendido).
 *         Requiere backend recepcionProLogic v1.0.13+ que ahora cruza
 *         cada reserva con PaymentReservations por contactId + cercanía
 *         temporal y devuelve productosVendidos[] en cada reserva.
 *
 * v1.1.23: Botón recargar catálogo de servicios.
 *         el panel izquierdo de servicios. Al pulsarlo reenvía 'ready'
 *         al page code, que vuelve a leer ServiceCatalog del CMS y
 *         repinta la lista. Spinning visual durante la carga. Necesario
 *         tras crear/editar servicios desde otra pestaña o desde Setup
 *         Salón sin tener que recargar la página completa.
 *
 *         AGENDA: NO hay auto-refresh por temporizador en esta versión.
 *         El refresco de reservas se dispara solo en acciones (cambio
 *         de fecha, crear cita, cancelar, cobrar, etc).
 *
 * v1.1.22: + Botón recargar en el Informe del día.
 *         Al pulsarlo limpia caché y pide datos frescos al backend sin
 *         tener que cerrar y volver a abrir. Spinning visual mientras
 *         carga. Útil cuando se ha cobrado/cancelado/quitado item de
 *         una cita y quieres ver el informe actualizado.
 *
 * v1.1.21: REDISEÑO Informe del día en 2 bloques + reconciliación.
 *         con criterios de filtrado distintos:
 *
 *         📈 RENDIMIENTO PRODUCTIVO (filtra por fechaReserva)
 *           Trabajo del salón en el día. Si la cita está en agenda,
 *           computa (cancelarla la saca). Responde "¿qué se trabaja hoy?"
 *           Bloques: cobrado/pendiente/total + clientes, servicios,
 *           clientes por hora, descuentos, productividad staff,
 *           productos vendidos, externos (bruto).
 *
 *         💰 CIERRE FINANCIERO (filtra por fechaPago)
 *           Dinero entrado en caja hoy. Responde "¿qué entró hoy?"
 *           Bloques: total real + nº transacciones, métodos de pago,
 *           desglose fiscal IVA, productividad staff (cobrado), productos
 *           cobrados, comisiones externos, arqueo de efectivo.
 *
 *         🔀 BANNER RECONCILIACIÓN entre ambos bloques cuando hay
 *           diferencias: cobros de hoy de citas de otros días, citas
 *           del día cobradas en otros días (bonos online, etc.).
 *
 *         Requiere backend cierreLogicExtendido v1.1.0+ (devuelve
 *         d.extendido.rendimiento / .cierre / .reconciliacion). Si el
 *         backend está desactualizado, muestra aviso.
 *
 * v1.1.20: FIX informe del día se desincronizaba con la fecha.
 *         calendario (flechas, calendario o "Hoy") con el panel del
 *         informe abierto, los datos no se refrescaban y la UI quedaba
 *         mostrando información del día anterior. Bug raíz: _setFecha
 *         no tocaba _cierreData ni el panel.
 *         · _setFecha: al cambiar fecha real, limpia _cierreData/loading
 *           y cierra el panel si estaba abierto. Hay que pulsar 📊
 *           explícitamente para cargar el informe del nuevo día.
 *         · Salvaguarda: la respuesta 'cierre-data' lleva el campo
 *           `fecha`. Si el widget recibe una respuesta cuya fecha no
 *           coincide con la actual (response tardío de la fecha anterior),
 *           se descarta sin renderizar.
 *
 * v1.1.19: ✕ quitar item del modal de cita.
 *         quitar un complemento, extra o producto individualmente sin
 *         tener que cancelar la cita entera. Solo aparece si hay 2+
 *         items (no se permite vaciar la cita, en su lugar Cancelar).
 *         · Hover sobre la fila → ✕ visible al 100%.
 *         · Click → envía 'quitar-item' al page code v1.0.11 → backend
 *           v1.0.12 quitarItemReserva(reservaId, itemIndex). Recalcula
 *           precioTotal restando ese item; NO toca fases/duracionTotal.
 *         · Tras éxito: toast "-XX€" y recarga reservas del día.
 *
 * v1.1.18: FIX popup servicio se hunde con muchos complementos.
 *         cuando el servicio tenía varios complementos asignados. Antes
 *         calculaba el top suponiendo altura fija 420px y al desplegarse
 *         más alto (Color Atelier con 5+ complementos) quedaba abajo,
 *         el botón "Armar servicio" no era accesible.
 *         · CSS: .ks-detail ahora con max-height: calc(100vh - 32px) +
 *           overflow-y: auto (salvaguarda si la altura excede pantalla).
 *         · JS: top provisional al pintar; tras appendChild se mide la
 *           altura REAL del popup y, si excede el viewport, se reubica
 *           para que quepa entero con 16px de margen.
 *         · Sin cambios funcionales más allá del posicionamiento.
 *
 * v1.1.17: PRODUCTOS modal completo estilo V1.
 *         que enviaba 'agregar-producto' y fallaba (colección "Productos"
 *         inexistente). Ahora es modal completo estilo V1:
 *         · Buscador en vivo (debounced 150ms).
 *         · Lista de productos del catálogo (vía listarProductos de
 *           tiendaProductos, mismo backend que V1).
 *         · Carrito con cantidades + - ×, total acumulado.
 *         · Selector de método de pago: EFECTIVO / TARJETA / BIZUM.
 *         · Botón REGISTRAR VENTA · TOTAL€ — envía 'vender-productos-cita'
 *           que llama a venderProductosDesdeAgenda (V1) con packId =
 *           reservaId. La venta queda vinculada a la cita pero NO se
 *           mete en precioTotal de la reserva (es venta independiente,
 *           se cobra al instante igual que V1).
 *         · Si el cliente es provisional (sin contactId): toast informa
 *           "convierte el cliente primero". No se permite vender.
 *         · Cache local: this._productosCache evita recargar el catálogo
 *           en cada apertura.
 *
 * v1.1.16: ANTES DE COBRAR (4 acciones conectadas).
 *         mostraban toast "pendiente"):
 *         · 🗓 CAMBIAR FECHA → submodal con datetime-local. Envía
 *           'reprogramar-reserva' al page code v1.0.9 → backend v1.0.10
 *           reprogramarReserva(reservaId, nuevaFechaISO). Recalcula
 *           start/end de todas las fases con el delta.
 *         · ✎ EXTRA → submodal con concepto + importe. Envía
 *           'agregar-extra'. Suma a precioTotal y añade item
 *           "[EXTRA] concepto|importe|1" al serviciosDetail.
 *         · ⛓ COMPLEMENTO → submodal con selector filtrado del catálogo
 *           (tipo Complemento o Ambos). Envía 'agregar-complemento'.
 *           Añade fase al final del pack y suma duración+precio.
 *         · 🛍 PRODUCTO → submodal con lista del CMS Productos (vía
 *           listarProductos del módulo tiendaProductos). Envía
 *           'agregar-producto'. Suma precio×cantidad a precioTotal
 *           (no afecta calendario).
 *         · + Servicio adicional sigue como toast (entrega siguiente).
 *         · NEW infraestructura _openSubModal / _closeSubModal:
 *           segundo scrim apilado sobre el modal de la cita.
 *
 * v1.1.15: Informe del día · nombre cliente + rename.
 *         · FIX bug en sección "Clientes del día": leía c.cliente /
 *           c.clientName pero el backend cierreLogicExtendido devuelve
 *           el campo c.nombre. Resultado: las líneas mostraban "—"
 *           donde debía ir el nombre del cliente. Ahora muestra el
 *           nombre en negrita: "12:17 · Mercedes Romero — Color Atelier".
 *         · Rename "Cierre del día" → "Informe del día" (más fiel a
 *           lo que es: consultable a cualquier hora, no destructivo).
 *           Icono 💰 → 📊 en el botón de la barra superior y en la
 *           cabecera del modal.
 * v1.1.14: Extensión (resize handle estilo V1).
 *         · Resize handle (asa) en el borde inferior de la ÚLTIMA fase
 *           ocupante de cada cita. Arrastrar hacia abajo crea/modifica
 *           la extensión. Suelta envía 'extender-reserva' al page code.
 *         · Snap a 5 min. Mientras dura el drag, preview rayado en
 *           tiempo real con la duración en MIN.
 *         · La extensión se pinta como bloque .ks-appt-ext bajo la
 *           última fase, con rayado diagonal del color del staff,
 *           label "EXTENSIÓN · N MIN" y botón ✕ para quitarla.
 *         · Lectura: r.extensionMin (Number, viene del backend v1.0.9).
 *         · Escritura: mensaje 'extender-reserva'/'quitar-extension'
 *           hacia el page code v1.0.8.
 *         · NO toca fases, sessions ni pagos. Solo extensionMin de
 *           la fila en KamisuiteReservations.
 * v1.1.13: Cascada en N bloques separados (estilo V1).
 *         · Cada fase con ocupa:true se pinta como un bloque .ks-appt
 *           SEPARADO en la columna del stylist. Click sobre cualquier
 *           bloque abre el modal de la reserva completa (mismo data-id).
 *         · Las fases con ocupa:false (PROCESO) NO se pintan: la columna
 *           del stylist queda físicamente libre durante ese tramo, que
 *           es la esencia de KAMISUITE (stylist puede atender otra
 *           clienta durante el proceso del color/tratamiento).
 *         · ELIMINADO el sub-bloque <span class="ks-seg-proceso"> con
 *           "LIBRE · Xmin" dentro de la cita: era diseño anti-V1.
 *         · La PRIMERA fase ocupante muestra cliente + servicio principal.
 *           Las siguientes muestran cliente + label de la fase concreta
 *           (Lavado, Secado, Planchado…).
 *         · Cuando hay 2+ fases ocupantes, la primera lleva el flag
 *           ⛓ cascada para identificar el pack.
 *         · Si height ≥ 60px añade una tercera línea hh:mm — hh:mm con
 *           la hora del bloque.
 * v1.1.12: Cliente provisional + servicio a medida (flujo armar).
 *         · Servicio a medida: el modal ya NO pide hora/staff. Solo
 *           descripción + duración + precio + botón "Armar". El usuario
 *           lo coloca con click sobre la columna del staff y hora deseados,
 *           idéntico al flujo de un servicio del catálogo. _colocarReserva
 *           detecta this._armed.medida=true y envía 'servicio-medida'
 *           al page code (que llama a crearReservaMedida del backend).
 *         · NEW Cliente provisional: nuevo botón "+ Cliente provisional"
 *           bajo "+ Cliente nuevo". Modal mínimo con solo nombre. Crea
 *           objeto local { nombre, esProvisional:true, contactId:'',
 *           telefono:'', email:'' }. NO se persiste en CRM. Badge
 *           "provisional" visible en (a) chip de cliente seleccionado
 *           del panel y (b) tarjeta de cita al abrirla. Como contactId
 *           es vacío, no recibe comunicaciones automáticamente. La
 *           reserva (normal o a medida) propaga esProvisional:true al
 *           backend → crearPackReserva v1.0.6 salta ensureContactInCRM.
 *           Si el cliente vuelve días después, no se recupera: hay que
 *           crearlo provisional otra vez o promocionarlo a Cliente nuevo
 *           pidiéndole los datos completos. Provisional es anónimo.
 *         · Modal de cita: si la reserva no tiene contactId NI teléfono
 *           NI email, se considera provisional y se pinta el mismo badge
 *           + se sustituye la fila de contacto por "Cliente eventual de
 *           paso · sin contacto".
 * v1.1.11: Cambios funcionales solicitados por Jal:
 *         · Servicio a medida ahora es una RESERVA en calendario, no un
 *           cobro adelantado. Modal pide: descripción, hora (con default
 *           inteligente), duración, precio, personal (de los visibles).
 *           Envía 'servicio-medida' al page code → crearReservaMedida del
 *           backend (recepcionProLogic v1.0.5) → fila en KamisuiteReservations
 *           con family='medida'. El cobro se hace después abriendo la tarjeta.
 *         · Estética en calendar de cita "a medida": fondo gris medio
 *           (#b5b5bd) + outline 2px del color del staff, conservando el
 *           border-left verde/naranja del estado de pago. Clase .ks-appt.is-medida.
 *         · Cierre del día · sección "Descuentos aplicados" ahora muestra
 *           <primer servicio> · <cliente> en vez de solo el cliente.
 *           Parseado desde el primer token (Nombre (X€)) de pagos.descripcion.
 *         · Modal de cita ya PAGADA: lanza handler 'get-pago-by-reserva'
 *           que devuelve el pago real desde PaymentReservations. Si lleva
 *           token 🏷️ descuento, el modal repinta el TOTAL con subtotal
 *           tachado + chip "-X% (-Y€)" + neto. Sin tocar CMS de reservas.
 *         · Renamed response: 'servicio-medida-creado' (acepta también el
 *           legacy 'servicio-medida-ok' por compat).
 * v1.1.10.1: HOTFIX. En la sección "Descuentos aplicados" del cierre del
 *           día se usaba `pagosNoCanc` que no existe; la variable correcta
 *           es `pagosNoCancelados`. ESLint no-undef rompía el deploy.
 *           Sin cambios funcionales más allá del fix.
 * v1.1.10: Dos cambios funcionales solicitados por Jal:
 *         · Descuento del modal de cobro pasa de € a %. _disc ahora es 0-100.
 *           Cálculo: neto = subtotal - subtotal*pct/100. El widget envía al
 *           page code 2 params nuevos: importeNeto (neto ya calculado) y
 *           descripcionExtra (token "🏷️ Descuento -X% (-Y€)" que se
 *           concatena a la descripción del cobro en PaymentReservations).
 *           Requiere backend recepcionProLogic >= v1.0.4 y page code
 *           >= v1.0.6. El total tachado y el chip "-X%" se muestran en
 *           el modal en vivo y se recalculan al cambiar el descuento.
 *         · Servicio a medida (modal blank): antes solo mostraba toast.
 *           Ahora crea una fila STANDALONE en PaymentReservations vía
 *           handler 'servicio-medida' del page code (wixData.insert).
 *           Pide cliente (debe estar seleccionado), descripción, importe
 *           y método de pago (incl. Mixto con desglose). Token "✏️ <desc>
 *           (<importe>€)" en descripcion. bookingId con prefijo MEDIDA-<ts>.
 *           No toca ServiceCatalog ni KamisuiteReservations.
 *         · Cierre del día: nueva sección "🏷️ Descuentos aplicados" que
 *           parsea los tokens 🏷️ de pagos.descripcion. Sin tocar backend.
 * v1.1.9: Fix solicitado por Jal: el selector de Intervalo (30/15/10 min)
 *         no pintaba subdivisiones visuales en la rejilla. Cambios:
 *         · Cada .ks-hourcell recibe ahora un background-image con
 *           repeating-linear-gradient que dibuja líneas horizontales
 *           internas a cada interval minutos (color var(--ks-line2)).
 *           Para interval=30: 1 línea a 50%. Para 15: 3 líneas a 25/50/75%.
 *           Para 10: 5 líneas a 16.7/33.3/50/66.7/83.3%.
 *         · El gutter de horas añade etiquetas .ks-timelabel-sub para
 *           los minutos intermedios (:30, :15/:30/:45, :10/:20/.../:50).
 *         · El snap del click/drag ya respetaba interval desde v1.1.8.
 *         Cero cambios fuera del render del calendario.
 * v1.1.8: Tres bloques completos portados literal desde V1
 *         (kamisuite-agenda v2.2.9):
 *         · DATEPICKER: chip de mes/día en navbar abre popover con
 *           calendario mensual, navegación ‹ ›, día seleccionado y hoy
 *           destacados. CSS .dp-* literal V1.
 *         · SETTINGS (⚙): panel lateral derecho deslizante con 4 secciones
 *           (Espaciado, Título cita, Intervalo, Personal). Lista de staff
 *           con visibilidad/color (color picker)/posición. Persistencia
 *           directa en CMS CalendarViewSettings vía wix-data (sin backend
 *           nuevo). _settings aplica rowHeight, titleMode, interval y
 *           staffConfig.visible/position/color al render del calendar y
 *           citas. NO aplica a panel de servicios (mantiene hueColor por
 *           familia, decisión Jal: muchos servicios distinguen mejor así).
 *         · CIERRE DEL DÍA (💰): panel inferior consultable a cualquier
 *           hora, NO destructivo. Bloques V1 literales: Cobrado/Pendiente/
 *           Total, Métodos pago, Servicios del día, Externos+comisión,
 *           Productos, Cierre financiero, IVA, Clientes del día, Ventas
 *           POS, Arqueo embebido (lectura). Botón 💰 ya NO abre modal de
 *           arqueo; abre panel. Arqueo 🏦 se queda idéntico (incluye
 *           botón "Cerrar día" como en V1).
 *         Cero cambios en handlers de reservas/cobro/cancelación/modal cita.
 * v1.1.7: Ajustes estéticos quirúrgicos pedidos por Jal tras comparar
 *         visualmente V2 vs V1 (kamisuite-agenda v2.2.9):
 *         · Panel aside: ancho 322→360 + overflow hidden para que las
 *           tarjetas no se corten visualmente contra el borde del calendario.
 *         · Citas (.ks-appt): se quita el outline grueso (box-shadow inset)
 *           y se sustituye por border-left:4px verde (#2a9d54 pagado) /
 *           naranja (#d48a1a pendiente) — patrón literal de V1. Fuentes
 *           reducidas (client 12→11, time 10→9.5, svc 11→10), padding
 *           más compacto (6/9 → 4/8), radius 8→6.
 *         · Bloqueos (.ks-customblock): rayado diagonal con color del
 *           staff + misma color oscurecida 30% (patrón hexDarken de V1)
 *           y label blanco. _blockHTML pasa --staff inline.
 *         Cero cambios en handlers, lógica, backend, render principal.
 * v1.1.0: Reescritura visual completa. Porta styles.css del prototipo
 *         aprobado de Claude Design (clases ks-*) al Shadow DOM. Mantiene
 *         el motor ya validado (clientes, staff, reservar, cobrar).
 *         Incluye: topbar + navegación de fecha, leyenda, panel con
 *         grupos plegables + tarjetas, detail con cascada/variantes/
 *         complementos, calendario con citas grandes y segmentos PROCESO
 *         (LIBRE), modal de cobro con descuento, servicio a medida,
 *         bloqueo por arrastre.
 *
 * Contrato de mensajes con page code (sin cambios respecto a v1.0.x):
 *   envía:  ready, getCatalogo, getStaff, getReservas, crearReserva,
 *           pagarReserva, cancelarReserva, buscarCliente, crearCliente
 *   recibe: catalogoData, staffData, reservasData, reservaCreada,
 *           reservaPagada, reservaCancelada, clientesLoading,
 *           clientesReady, clientesEncontrados, clienteCreado, error
 * ===================================================================== */
(function () {
  'use strict';

  const TAG = '[RecepcionProCMS-Widget v1.1.87]';

  // ─── helpers ───
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function todayISO() { return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' }); }
  function prettifyGroup(slug) {
    return String(slug || '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^\w/, c => c.toUpperCase());
  }
  function hhmmToMin(s) { const [h, m] = String(s).split(':').map(Number); return h * 60 + m; }
  function minToHHMM(m) { return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); }

  const CLASE_LABEL = { simple_unico: 'Simple', simple_variantes: 'Variantes', complejo_fases: 'Cascada', complejo_proceso: 'Cascada' };
  const ROLE_SHORT = { principal: 'P', complemento: 'C', ambos: 'P·C' };

  // v1.1.81 — tope de repeticiones de una misma línea del armado. 10 es
  // holgado para el caso real (familias) y evita que un dedo pegado al ＋
  // genere una cadena interminable de llamadas al backend.
  const CANT_MAX_LINEA = 10;

  // v1.1.82 — Grupo del catálogo que NO se lista en la columna de servicios
  // salvo que el filtro de rol sea explícitamente "Complementos". Son piezas
  // que el motor materializa dentro de la cascada de otro servicio; verlas
  // sueltas junto a los principales confunde al operador.
  // Se compara normalizado (sin guiones, sin acentos, sin mayúsculas) para
  // que dé igual cómo esté escrito el `group` en ServiceCatalog.
  const GRUPO_OCULTO_PANEL = 'complementos de fases';
  function normGrupo(g) {
    return String(g || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[-_]+/g, ' ').replace(/\s+/g, ' ')
      .trim().toLowerCase();
  }

  // calendario
  const CAL_START = 9, CAL_END = 21, SLOT_MIN = 30;
  const ROW_PX = 56;                       // alto de fila por hora (legible)
  const PX_PER_MIN = ROW_PX / 60;
  const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const DIAS = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];

  // colores por familia (oklch) para acentos de servicio/cita
  const FAMILY_HUE = {
    coloracion:            { h: 50,  c: 0.13 },   // ámbar
    cortesmujer:           { h: 250, c: 0.14 },   // azul
    peinados:              { h: 310, c: 0.14 },   // violeta
    tratamientos:          { h: 352, c: 0.14 },   // magenta
    tratamiento_faciales:  { h: 20,  c: 0.13 },   // coral
    caballero:             { h: 230, c: 0.10 },   // azul acero
    spa:                   { h: 160, c: 0.12 },   // verde agua
    masajes:               { h: 140, c: 0.12 },   // verde
    presoterapia:          { h: 190, c: 0.12 },   // cian
    'manicura_&_pedicura': { h: 330, c: 0.14 },   // rosa
    depilacion_femenina:   { h: 290, c: 0.13 },   // púrpura
    depilacion_masculina:  { h: 270, c: 0.12 },   // índigo
    'novias_&_recogidos':  { h: 85,  c: 0.13 },   // lima
    'comuniones_&_eventos':{ h: 110, c: 0.12 },   // verde claro
    ninos:                 { h: 70,  c: 0.14 },   // oro-verde
    club_kalonice:         { h: 30,  c: 0.14 },   // naranja
    externo:               { h: 175, c: 0.10 },   // teal
    default:               { h: 250, c: 0.04 }
  };
  function hueColor(key, l = 0.52) { const f = FAMILY_HUE[key] || FAMILY_HUE.default; return `oklch(${l} ${f.c} ${f.h})`; }
  function hueSoft(key, l = 0.96, c = 0.03) { const f = FAMILY_HUE[key] || FAMILY_HUE.default; return `oklch(${l} ${c} ${f.h})`; }
  // paleta de columnas por empleado (espectro amplio, colores vivos y separados)
  const STAFF_COLORS = [
    '#e8542e', // rojo-naranja
    '#7b3ff2', // violeta
    '#c2185b', // magenta
    '#2e9e5b', // verde
    '#2f6fd9', // azul
    '#e89c1c', // ámbar
    '#0f9b9b', // teal
    '#9c4dcc', // púrpura
    '#d81b60', // rosa fuerte
    '#558b2f', // verde oliva
    '#1565c0', // azul oscuro
    '#ef6c00'  // naranja oscuro
  ];

  // paleta para el color picker del configurador (16 colores, V1 literal)
  const PALETTE = [
    '#e8542e', '#7b3ff2', '#c2185b', '#2e9e5b',
    '#2f6fd9', '#e89c1c', '#0f9b9b', '#9c4dcc',
    '#d81b60', '#558b2f', '#1565c0', '#ef6c00',
    '#6b7280', '#1a1d23', '#a78bfa', '#06b6d4'
  ];

  // formateador euro y MONTHS para datepicker
  const eur = n => (Number(n) || 0).toFixed(2).replace('.', ',') + '€';
  const MONTHS_FULL = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const STYLES = `/* =====================================================================
   styles.css — Recepción PRO (tema claro · KAMISUITE)
   ===================================================================== */
:host { all: initial; display:block; height:100%; font-family: 'Bai Jamjuree', system-ui, sans-serif; color: var(--ks-ink); -webkit-font-smoothing: antialiased; }
:host {
  --ks-paper:  oklch(0.985 0.004 95);
  --ks-paper2: oklch(0.972 0.005 95);
  --ks-panel:  #ffffff;
  --ks-ink:    oklch(0.29 0.012 265);
  --ks-ink2:   oklch(0.47 0.012 265);
  --ks-ink3:   oklch(0.63 0.010 265);
  --ks-line:   oklch(0.865 0.005 265);
  --ks-line2:  oklch(0.905 0.005 265);
  --ks-accent: #c9a44a;
  --ks-accent-ink: oklch(0.46 0.072 80);
  --ks-accent-soft: oklch(0.96 0.03 86);
  --ks-shadow: 0 1px 2px rgba(20,22,30,.04), 0 2px 8px rgba(20,22,30,.05);
  --ks-shadow-lg: 0 8px 30px rgba(20,22,30,.13), 0 2px 8px rgba(20,22,30,.08);
  --ks-radius: 11px;
  --ks-aside-w: 360px;
}

* { box-sizing: border-box; }


button { font-family: inherit; cursor: pointer; }


.ks-app { height: 100%; display: flex; flex-direction: column; overflow: hidden; }

/* ============================ TOPBAR ============================ */
.ks-topbar { flex: none; background: var(--ks-panel); border-bottom: 1px solid var(--ks-line); z-index: 30; }
.ks-brandbar {
  display: flex; align-items: center; gap: 18px;
  padding: 9px 20px; border-bottom: 1px solid var(--ks-line2);
}
.ks-brand { display: flex; align-items: center; gap: 12px; }
.ks-logo { font-weight: 700; font-size: 17px; letter-spacing: 1px; color: var(--ks-ink); }
.ks-logo-accent { color: var(--ks-accent-ink); }
.ks-datebadge {
  display: grid; place-items: center; width: 30px; height: 30px;
  background: var(--ks-ink); color: #fff; border-radius: 8px;
  font-weight: 700; font-size: 15px;
}
.ks-brandhint { color: var(--ks-ink3); font-size: 12.5px; font-weight: 500; letter-spacing: .2px; }
.ks-brandactions { margin-left: auto; display: flex; align-items: center; gap: 9px; }
.ks-especiales {
  border: 1px solid var(--ks-accent); background: var(--ks-accent); color: #fff;
  padding: 7px 13px; border-radius: 8px; font-size: 12.5px; font-weight: 700; cursor: pointer;
}
.ks-especiales:hover { filter: brightness(1.06); }
/* ── v1.1.77 · Botón y modal FICHA TÉCNICA ── */
.ks-fichatec {
  border: 1px solid #7d5bb5; background: #7d5bb5; color: #fff;
  padding: 7px 13px; border-radius: 8px; font-size: 12.5px; font-weight: 700; cursor: pointer;
  margin-right: 8px;
}
.ks-fichatec:hover { filter: brightness(1.08); }
/* ── v1.1.84 · Botón TIENDA (venta de productos sin cita) ── */
.ks-tienda {
  border: 1px solid #0f766e; background: #0f766e; color: #fff;
  padding: 7px 13px; border-radius: 8px; font-size: 12.5px; font-weight: 700; cursor: pointer;
  margin-right: 8px;
}
.ks-tienda:hover { filter: brightness(1.08); }
.ft-scrim { position: fixed; inset: 0; background: rgba(0,0,0,.35); z-index: 200; display: flex; align-items: center; justify-content: center; padding: 20px; }
.ft-modal { background: #fff; border-radius: 14px; width: min(760px,96vw); max-height: 92vh; display: flex; flex-direction: column; box-shadow: 0 20px 60px rgba(0,0,0,.3); }
.ft-head { display: flex; align-items: center; justify-content: space-between; padding: 15px 20px; border-bottom: 1px solid var(--ks-line); }
.ft-title { font-size: 15px; font-weight: 700; color: var(--ks-ink); }
.ft-sub { font-size: 12px; color: var(--ks-ink3); margin-top: 2px; }
.ft-x { border: none; background: transparent; font-size: 19px; cursor: pointer; color: #9ca3af; line-height: 1; }
.ft-search { padding: 13px 20px; border-bottom: 1px solid var(--ks-line); }
.ft-input { width: 100%; box-sizing: border-box; padding: 9px 11px; border: 1px solid var(--ks-line); border-radius: 8px; font-size: 13px; font-family: inherit; }
.ft-results { border: 1px solid var(--ks-line); border-radius: 8px; margin-top: 6px; max-height: 190px; overflow: auto; }
.ft-cli { padding: 9px 12px; border-bottom: 1px solid var(--ks-line); cursor: pointer; }
.ft-cli:last-child { border-bottom: none; }
.ft-cli:hover { background: var(--ks-paper2); }
.ft-cli-name { font-size: 13px; font-weight: 600; color: var(--ks-ink); }
.ft-cli-tel { font-size: 12px; color: var(--ks-ink3); }
.ft-body { padding: 15px 20px; overflow: auto; flex: 1; }
.ft-kpis { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 14px; }
.ft-kpi { flex: 1; min-width: 96px; border: 1px solid var(--ks-line); border-radius: 8px; padding: 9px 11px; }
.ft-kpi-l { font-size: 10.5px; font-weight: 600; color: var(--ks-ink3); text-transform: uppercase; letter-spacing: .3px; }
.ft-kpi-v { font-size: 17px; font-weight: 800; color: var(--ks-ink); line-height: 1.2; }
.ft-sec { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .4px; color: var(--ks-ink3); margin: 16px 0 8px; }
.ft-habit { display: flex; gap: 6px; flex-wrap: wrap; }
.ft-tag { display: inline-flex; align-items: center; gap: 5px; padding: 4px 9px; border: 1px solid var(--ks-line); border-radius: 999px; font-size: 12px; color: var(--ks-ink); }
.ft-tag b { color: var(--ks-accent-ink); font-weight: 700; }
.ft-visita { border: 1px solid var(--ks-line); border-radius: 10px; padding: 11px 13px; margin-bottom: 9px; }
.ft-vh { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 6px; }
.ft-vfecha { font-size: 13px; font-weight: 700; color: var(--ks-ink); }
.ft-vof { font-size: 11.5px; font-weight: 600; color: #fff; background: var(--ks-ink); padding: 2px 8px; border-radius: 999px; }
.ft-vsrv { font-size: 12.5px; color: var(--ks-ink2); }
.ft-formula { margin-top: 8px; background: #fbf7ec; border: 1px solid #e6d9b4; border-left: 3px solid var(--ks-accent); border-radius: 8px; padding: 9px 11px; font-size: 13px; line-height: 1.5; color: var(--ks-ink); white-space: pre-wrap; word-break: break-word; }
.ft-empty { text-align: center; padding: 30px 16px; color: var(--ks-ink3); font-size: 13px; }
.ft-color { border: 1px solid #e6d9b4; background: #fdfbf5; border-radius: 10px; padding: 11px 13px; margin-bottom: 9px; }
.ft-color-h { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 6px; }
.ft-color-srv { font-size: 12px; color: var(--ks-ink3); margin-top: 6px; }
.ft-nocolor { border: 1px dashed var(--ks-line); border-radius: 10px; padding: 16px; text-align: center; color: var(--ks-ink3); font-size: 12.5px; }
.ft-foot { padding: 11px 20px; border-top: 1px solid var(--ks-line); font-size: 11px; color: #9ca3af; }

/* ── v1.1.76 · Botón y modal ALMACÉN ── */
.ks-almacen {
  border: 1px solid #1c9c93; background: #1c9c93; color: #fff;
  padding: 7px 13px; border-radius: 8px; font-size: 12.5px; font-weight: 700; cursor: pointer;
  margin-right: 8px;
}
.ks-almacen:hover { filter: brightness(1.08); }
.alm-scrim { position: fixed; inset: 0; background: rgba(0,0,0,.35); z-index: 200; display: flex; align-items: center; justify-content: center; padding: 20px; }
.alm-modal { background: #fff; border-radius: 14px; width: min(680px,96vw); max-height: 92vh; display: flex; flex-direction: column; box-shadow: 0 20px 60px rgba(0,0,0,.3); }
.alm-head { display: flex; align-items: center; justify-content: space-between; padding: 15px 20px; border-bottom: 1px solid var(--ks-line); }
.alm-title { font-size: 15px; font-weight: 700; color: var(--ks-ink); }
.alm-x { border: none; background: transparent; font-size: 19px; cursor: pointer; color: #9ca3af; line-height: 1; }
.alm-filters { display: flex; gap: 8px; padding: 13px 20px; border-bottom: 1px solid var(--ks-line); flex-wrap: wrap; }
.alm-input { flex: 1; min-width: 170px; box-sizing: border-box; padding: 9px 11px; border: 1px solid var(--ks-line); border-radius: 8px; font-size: 13px; font-family: inherit; }
.alm-input:focus { outline: none; border-color: #1c9c93; }
.alm-sel { padding: 9px 10px; border: 1px solid var(--ks-line); border-radius: 8px; font-size: 12.5px; font-family: inherit; background: #fff; max-width: 190px; }
.alm-list { overflow-y: auto; padding: 6px 20px 14px; flex: 1; }
.alm-row { display: flex; align-items: center; gap: 11px; padding: 9px 0; border-bottom: 1px solid var(--ks-line); }
.alm-row:last-child { border-bottom: none; }
.alm-img { width: 38px; height: 38px; border-radius: 8px; object-fit: cover; background: #f3f4f6; flex-shrink: 0; }
.alm-main { flex: 1; min-width: 0; }
.alm-name { font-size: 13px; font-weight: 700; color: var(--ks-ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.alm-meta { font-size: 10.5px; color: #9ca3af; margin-top: 1px; }
.alm-cnt { text-align: center; min-width: 46px; flex-shrink: 0; }
.alm-cnt b { display: block; font-size: 16px; font-weight: 800; color: var(--ks-ink); line-height: 1.1; }
.alm-cnt span { font-size: 8.5px; letter-spacing: .4px; text-transform: uppercase; color: #9ca3af; font-weight: 700; }
.alm-cnt.use b { color: #1c9c93; }
.alm-acts { display: flex; gap: 6px; flex-shrink: 0; }
.alm-btn { border: 1px solid var(--ks-line); background: #fff; border-radius: 8px; padding: 6px 9px; font-size: 15px; cursor: pointer; line-height: 1; font-family: inherit; }
.alm-btn:hover { border-color: #1c9c93; }
.alm-btn:disabled { opacity: .35; cursor: not-allowed; }
.alm-btn small { display: block; font-size: 8.5px; font-weight: 700; letter-spacing: .3px; color: #6b7280; margin-top: 2px; }
.alm-low { color: #d97706; font-weight: 700; }
.alm-empty { text-align: center; padding: 34px 10px; color: #9ca3af; font-size: 13px; }
.alm-foot { padding: 11px 20px; border-top: 1px solid var(--ks-line); font-size: 11px; color: #9ca3af; }

/* ── Modal ESPECIALES (venta manual) ── */
.esp-scrim { position: fixed; inset: 0; background: rgba(0,0,0,.35); z-index: 200; display: flex; align-items: center; justify-content: center; padding: 20px; }
.esp-modal { background: #fff; border-radius: 14px; width: min(560px,96vw); max-height: 92vh; overflow: auto; box-shadow: 0 20px 60px rgba(0,0,0,.3); }
.esp-head { display: flex; align-items: center; justify-content: space-between; padding: 15px 20px; border-bottom: 1px solid var(--ks-line); position: sticky; top: 0; background: #fff; z-index: 1; }
.esp-title { font-size: 15px; font-weight: 700; color: var(--ks-ink); }
.esp-x { border: none; background: transparent; font-size: 19px; cursor: pointer; color: #9ca3af; line-height: 1; }
.esp-body { padding: 16px 20px; }
.esp-sec { margin-bottom: 16px; }
.esp-eyebrow { font-size: 10.5px; font-weight: 700; letter-spacing: .6px; text-transform: uppercase; color: #9ca3af; margin-bottom: 7px; display: block; }
.esp-input { width: 100%; box-sizing: border-box; padding: 9px 11px; border: 1px solid var(--ks-line); border-radius: 8px; font-size: 13px; font-family: inherit; }
.esp-select { width: 100%; box-sizing: border-box; padding: 9px 11px; border: 1px solid var(--ks-line); border-radius: 8px; font-size: 13px; font-family: inherit; background: #fff; }
.esp-cli-results { border: 1px solid var(--ks-line); border-radius: 8px; margin-top: 6px; max-height: 180px; overflow: auto; }
.esp-cli-item { padding: 8px 11px; cursor: pointer; border-bottom: 1px solid var(--ks-paper2); }
.esp-cli-item:last-child { border-bottom: none; }
.esp-cli-item:hover { background: var(--ks-paper2); }
.esp-cli-name { font-size: 13px; font-weight: 600; color: var(--ks-ink); }
.esp-cli-sub { font-size: 11px; color: #9ca3af; }
.esp-chip { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 10px 12px; border: 1px solid var(--ks-accent); border-radius: 8px; background: var(--ks-paper2); }
.esp-tabs { display: flex; gap: 6px; margin-bottom: 10px; }
.esp-tab { flex: 1; padding: 9px 4px; border: 1px solid var(--ks-line); background: #fff; border-radius: 8px; font-size: 12.5px; font-weight: 600; cursor: pointer; color: var(--ks-ink); }
.esp-tab.active { background: var(--ks-accent); color: #fff; border-color: var(--ks-accent); }
.esp-price { margin-top: 9px; font-size: 14px; font-weight: 700; color: var(--ks-ink); }
.esp-price small { font-weight: 500; color: #9ca3af; font-size: 11px; }
.esp-pay { display: flex; gap: 6px; }
.esp-paybtn { flex: 1; padding: 9px; border: 1px solid var(--ks-line); background: #fff; border-radius: 8px; font-size: 12.5px; font-weight: 600; cursor: pointer; color: var(--ks-ink); }
.esp-paybtn.active { background: var(--ks-ink); color: #fff; border-color: var(--ks-ink); }
.esp-emit { width: 100%; margin-top: 4px; padding: 13px; border: none; border-radius: 10px; background: var(--ks-accent); color: #fff; font-size: 14px; font-weight: 700; cursor: pointer; }
.esp-emit:disabled { opacity: .45; cursor: not-allowed; }
.esp-row2 { display: flex; gap: 8px; }
.esp-row2 > * { flex: 1; }
.esp-link { background: none; border: none; color: var(--ks-accent); font-size: 12px; font-weight: 600; cursor: pointer; padding: 6px 0; }
.esp-gift { margin-top: 10px; }
.esp-muted { font-size: 12px; color: #9ca3af; }
.esp-notice { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 14px; border-radius: 11px; font-size: 12.5px; line-height: 1.5; margin-bottom: 12px; }
.esp-notice.warn { background: #fbf4e6; border: 1px solid #ecd9ae; color: #7a5714; }
.esp-notice.ok { background: #eef8f1; border: 1px solid #c4e4cd; color: #1f7a3d; }
.esp-notice-act { flex-shrink: 0; background: var(--ks-accent); color: #fff; border: none; border-radius: 8px; padding: 8px 13px; font-size: 12px; font-weight: 700; cursor: pointer; white-space: nowrap; }
.esp-notice-act:hover { filter: brightness(1.06); }
.ks-automodel {
  border: 1px solid var(--ks-line); background: var(--ks-paper2); color: var(--ks-ink2);
  padding: 7px 13px; border-radius: 8px; font-size: 12.5px; font-weight: 600;
}
.ks-automodel:hover { background: #fff; color: var(--ks-ink); }
.ks-homebtn {
  width: 34px; height: 34px; border: 1px solid var(--ks-line); background: #fff;
  border-radius: 8px; font-size: 16px; color: var(--ks-ink2);
}
.ks-homebtn:hover { background: var(--ks-paper2); }

.ks-toolbar { display: flex; align-items: center; gap: 22px; padding: 11px 20px; }
.ks-toolbar-l { display: flex; align-items: center; gap: 20px; }
.ks-apptitle { margin: 0; font-size: 16px; font-weight: 700; letter-spacing: .2px; display: flex; align-items: baseline; gap: 8px; }
.ks-ver { font-size: 10.5px; font-weight: 600; color: var(--ks-accent-ink); background: var(--ks-accent-soft); padding: 2px 7px; border-radius: 999px; letter-spacing: .3px; }
.ks-datenav { display: flex; align-items: center; gap: 7px; }
.ks-today {
  border: 1px solid var(--ks-accent); color: var(--ks-accent-ink); background: var(--ks-accent-soft);
  padding: 6px 13px; border-radius: 8px; font-size: 12.5px; font-weight: 700;
}
.ks-navarrow {
  width: 30px; height: 30px; border: 1px solid var(--ks-line); background: #fff;
  border-radius: 8px; font-size: 16px; line-height: 1; color: var(--ks-ink2);
}
.ks-navarrow:hover { background: var(--ks-paper2); color: var(--ks-ink); }
.ks-monthchip { font-weight: 600; font-size: 13.5px; padding: 5px 12px; border: 1px solid var(--ks-line); border-radius: 8px; background: #fff; }
.ks-dayline { display: flex; align-items: center; gap: 7px; color: var(--ks-ink2); font-size: 13px; font-weight: 500; }
.ks-livedot { width: 8px; height: 8px; border-radius: 50%; background: oklch(0.7 0.16 150); box-shadow: 0 0 0 3px oklch(0.7 0.16 150 / .2); }
.ks-toolbar-r { margin-left: auto; display: flex; align-items: center; gap: 16px; }
.ks-countpill { font-size: 13px; color: var(--ks-ink2); display: flex; align-items: center; gap: 6px; }
.ks-countpill strong { color: var(--ks-ink); font-weight: 700; }
/* v1.1.30 — Semáforo de solapamientos (verde / naranja / rojo). Umbral 15min. */
.ks-overlap-dot { display: inline-block; width: 11px; height: 11px; border-radius: 50%; margin-left: 2px;
  border: 1.5px solid rgba(255,255,255,.8); box-shadow: 0 0 0 1px rgba(0,0,0,.12); cursor: help; transition: background .15s; }
.ks-overlap-dot.is-green  { background: #15803d; }
.ks-overlap-dot.is-orange { background: #d48a1a; box-shadow: 0 0 0 1px rgba(0,0,0,.12), 0 0 6px rgba(212,138,26,.6); }
.ks-overlap-dot.is-red    { background: #d93636; box-shadow: 0 0 0 1px rgba(0,0,0,.12), 0 0 8px rgba(217,54,54,.7); animation: ksPulse 1.4s ease-in-out infinite; }
@keyframes ksPulse { 0%,100% { opacity: 1; } 50% { opacity: .5; } }
.ks-countsep { color: var(--ks-line); }
.ks-blockcount { color: var(--ks-ink3); }
.ks-toolactions { display: flex; align-items: center; gap: 6px; }
.ks-tool {
  width: 36px; height: 36px; border: 1px solid var(--ks-line); background: #fff;
  border-radius: 9px; font-size: 16px; line-height: 1;
}
.ks-tool:hover { background: var(--ks-paper2); border-color: var(--ks-ink3); }

/* ============================ STAGE ============================ */
.ks-stage { flex: 1; display: flex; min-height: 0; }
.ks-aside { width: var(--ks-aside-w); flex: none; border-right: 1px solid var(--ks-line); background: var(--ks-panel); display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.ks-main { flex: 1; min-width: 0; background: var(--ks-paper); display: flex; flex-direction: column; position: relative; }
.ks-main-scroll { flex: 1; overflow: auto; min-height: 0; }
/* v1.1.53 — Columna lateral colapsable (viewports estrechos) */
.ks-aside { transition: width .18s ease-out; }
.ks-aside.is-collapsed { width: 0; border-right: 0; overflow: hidden; }
.ks-aside-toggle {
  position: absolute; top: 8px; left: 6px; z-index: 25;
  width: 28px; height: 28px; border-radius: 8px;
  background: var(--ks-panel); border: 1px solid var(--ks-line2);
  color: var(--ks-ink2); font-size: 14px; font-weight: 700;
  display: grid; place-items: center; cursor: pointer;
  box-shadow: 0 1px 3px rgba(20,22,30,.08);
  transition: background .12s, border-color .12s;
}
.ks-aside-toggle:hover { background: var(--ks-paper2); border-color: var(--ks-line); }
.ks-caltoolbar { flex: none; display: flex; align-items: center; gap: 22px; padding: 8px 18px; background: var(--ks-panel); border-bottom: 1px solid var(--ks-line2); flex-wrap: wrap; }
.ks-legendgroup { display: flex; align-items: center; gap: 8px; }
.ks-legendgroup-end { margin-left: auto; }
.ks-legtitle { font-size: 9.5px; font-weight: 700; letter-spacing: .8px; text-transform: uppercase; color: var(--ks-ink3); }
.ks-legchip { font-size: 10.5px; font-weight: 600; padding: 3px 9px 3px 20px; border-radius: 6px; position: relative; color: var(--ks-ink2); background: var(--ks-paper2); border: 1px solid var(--ks-line2); }
.ks-legchip::before { content: ''; position: absolute; left: 7px; top: 50%; transform: translateY(-50%); width: 9px; height: 9px; border-radius: 3px; }
.leg-work::before { background: oklch(0.45 0.06 265); }
.leg-proceso { padding-left: 22px; }
.leg-proceso::before { background: var(--ks-paper); border: 1.5px dashed color-mix(in oklab, var(--ks-ink3) 60%, #fff); border-radius: 3px; }
.leg-paid::before { background: oklch(0.72 0.16 150); }
.leg-pending::before { background: var(--ks-accent); }
.leg-block::before { background: repeating-linear-gradient(135deg, oklch(0.62 0.13 350 / .5) 0 3px, transparent 3px 6px); border-radius: 2px; }
/* v1.1.81 — stepper de cantidad del popup de detalle */
.ks-qty-row { display: flex; align-items: center; gap: 10px; }
.ks-qty-btn { width: 40px; min-width: 40px; justify-content: center; font-size: 16px; font-weight: 700; }
.ks-qty-val { min-width: 30px; text-align: center; font-weight: 700; font-size: 15px; color: var(--ks-ink); }
/* v1.1.81 — cabecera del armado múltiple */
.ks-armed-wrap { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.ks-armed-count { font-size: 10.5px; font-weight: 700; padding: 3px 8px; border-radius: 6px; color: #fff; background: var(--ks-accent); }
.ks-armed-list { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }
.ks-armed-item { font-size: 10.5px; font-weight: 600; padding: 3px 8px; border-radius: 6px; color: var(--ks-ink2); background: var(--ks-paper2); border: 1px solid var(--ks-line2); }
.ks-armed-item.is-now { color: var(--ks-ink); border-color: var(--ks-accent); }
.ks-armed-mode { display: flex; align-items: center; gap: 0; border: 1px solid var(--ks-line2); border-radius: 7px; overflow: hidden; }
.ks-armed-modebtn { font-family: inherit; font-size: 10.5px; font-weight: 600; padding: 4px 9px; border: 0; cursor: pointer; color: var(--ks-ink2); background: var(--ks-paper2); }
.ks-armed-modebtn.active { color: #fff; background: var(--ks-ink); }

/* ============================ PANEL ============================ */
.ks-panel { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.ks-eyebrow {
  font-size: 10.5px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase;
  color: var(--ks-ink3);
}
.ks-panel-clienthead { padding: 15px 16px 13px; border-bottom: 1px solid var(--ks-line2); }
.ks-clientsearch { display: flex; align-items: center; gap: 8px; margin-top: 8px; border: 1px solid var(--ks-line); border-radius: 9px; padding: 0 11px; background: var(--ks-paper2); }
.ks-clientsearch:focus-within { background: #fff; border-color: var(--ks-accent); }
.ks-clientsearch input { flex: 1; border: 0; background: transparent; outline: none; padding: 9px 0; font-size: 13px; color: var(--ks-ink); }
.ks-search-ico { color: var(--ks-ink3); font-size: 15px; }
.ks-newclient {
  margin-top: 8px; width: 100%; border: 1px dashed var(--ks-line); background: #fff;
  color: var(--ks-ink2); padding: 9px; border-radius: 9px; font-size: 12.5px; font-weight: 600;
}
.ks-newclient:hover { border-color: var(--ks-accent); color: var(--ks-accent-ink); background: var(--ks-accent-soft); }
.ks-provclient { margin-top: 6px; width: 100%; border: 1px solid var(--ks-line); background: var(--ks-paper2); color: var(--ks-ink2); padding: 8px; border-radius: 9px; font-size: 12px; font-weight: 600; display: flex; align-items: center; justify-content: center; gap: 7px; }
.ks-provclient:hover { border-color: var(--ks-ink3); color: var(--ks-ink); background: #fff; }
.ks-prov-dot { width: 7px; height: 7px; border-radius: 50%; background: oklch(0.72 0.15 60); box-shadow: 0 0 0 3px oklch(0.72 0.15 60 / .18); }
.ks-flowsteps { display: flex; gap: 4px; margin-top: 11px; }
.ks-flowstep { flex: 1; text-align: center; font-size: 9.5px; font-weight: 700; letter-spacing: .2px; color: var(--ks-ink3); background: var(--ks-paper2); border: 1px solid var(--ks-line2); padding: 4px 2px; border-radius: 6px; white-space: nowrap; }
.ks-flowstep.is-now { color: oklch(0.46 0.13 150); background: transparent; border-color: oklch(0.62 0.15 150); }
.ks-flowsteps-top { display: flex; align-items: center; gap: 7px; }
.ks-flowsteps-top .ks-flowstep { flex: none; padding: 5px 13px; font-size: 11px; border-radius: 7px; }
.ks-flowarrow { color: var(--ks-ink3); font-size: 13px; }

.ks-panel-svchead { padding: 13px 16px 11px; border-bottom: 1px solid var(--ks-line2); background: var(--ks-paper); }
.ks-svchead-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.ks-catstatus { display: flex; align-items: center; gap: 5px; font-size: 10.5px; color: var(--ks-ink3); font-weight: 500; }
.ks-catsrc { font-weight: 700; color: var(--ks-ink2); letter-spacing: .2px; }
.ks-cat-reload { background: transparent; border: 0; cursor: pointer; font-size: 11px; color: #9ca3af; padding: 2px 4px; margin-left: 4px; border-radius: 4px; transition: color .15s, background .15s, transform .15s; opacity: .65; }
.ks-cat-reload:hover { opacity: 1; color: var(--ks-ink); background: rgba(0,0,0,.05); }
.ks-cat-reload.spinning { animation: cierre-spin 0.7s linear infinite; opacity: 1; }
.ks-catsep { opacity: .5; }
.ks-catok { color: oklch(0.62 0.15 150); font-weight: 700; }
.ks-syncdot { width: 7px; height: 7px; border-radius: 50%; background: oklch(0.66 0.15 150); }
.ks-syncdot.loading { background: var(--ks-accent); animation: ks-pulse 1s infinite; }
@keyframes ks-pulse { 0%,100% { opacity: 1; } 50% { opacity: .3; } }

.ks-search { display: flex; align-items: center; gap: 8px; margin-top: 10px; border: 1px solid var(--ks-line); border-radius: 9px; padding: 0 11px; background: #fff; }
.ks-search:focus-within { border-color: var(--ks-accent); }
.ks-search input { flex: 1; border: 0; outline: none; padding: 8px 0; font-size: 13px; background: transparent; }
.ks-search-clr { border: 0; background: transparent; color: var(--ks-ink3); font-size: 12px; }

.ks-rolefilter { display: flex; gap: 5px; background: var(--ks-paper2); padding: 3px; border-radius: 9px; border: 1px solid var(--ks-line2); flex: 1; }
.ks-svchead-tools { display: flex; align-items: stretch; gap: 6px; margin-top: 10px; }
.ks-collapseall { flex: none; width: 34px; border: 1px solid var(--ks-line); background: #fff; border-radius: 9px; font-size: 15px; color: var(--ks-ink2); line-height: 1; }
.ks-collapseall:hover { background: var(--ks-paper2); color: var(--ks-ink); border-color: var(--ks-ink3); }
.ks-blankbtn { margin-top: 8px; width: 100%; border: 1px dashed var(--ks-line); background: #fff; color: var(--ks-ink2); padding: 9px; border-radius: 9px; font-size: 12px; font-weight: 600; }
.ks-blankbtn:hover { border-color: var(--ks-accent); color: var(--ks-accent-ink); background: var(--ks-accent-soft); }
.ks-rolebtn { flex: 1; border: 0; background: transparent; padding: 6px 4px; border-radius: 7px; font-size: 11.5px; font-weight: 600; color: var(--ks-ink3); }
.ks-rolebtn:hover { color: var(--ks-ink2); }
.ks-rolebtn.active { background: #fff; color: var(--ks-ink); box-shadow: var(--ks-shadow); }

.ks-panel-scroll { flex: 1; overflow-y: auto; overflow-x: hidden; padding: 6px 14px 18px; min-height: 0; }
.ks-panel-foot { flex: none; padding: 11px 14px; border-top: 1px solid var(--ks-line2); }
.ks-blockbtn { width: 100%; border: 1px dashed var(--ks-line); background: var(--ks-paper2); color: var(--ks-ink3); padding: 10px; border-radius: 9px; font-size: 12px; font-weight: 600; }
.ks-blockbtn:hover { border-color: var(--ks-ink3); color: var(--ks-ink2); }
.ks-empty { padding: 30px 10px; text-align: center; color: var(--ks-ink3); font-size: 13px; }

/* ---- group header (botón de categoría plegable) ---- */
.ks-group { margin-top: 7px; }
.ks-grouphead, .ks-rowgrouphead { display: flex; align-items: center; gap: 9px; padding: 9px 11px; width: 100%; background: var(--ks-paper2); border: 1px solid var(--ks-line2); border-radius: 9px; cursor: pointer; text-align: left; transition: background .12s, border-color .12s; }
.ks-grouphead:hover, .ks-rowgrouphead:hover { background: #fff; border-color: var(--ks-line); }
.ks-grouphead.is-open, .ks-rowgrouphead.is-open { background: #fff; border-color: var(--ks-line); }
.ks-grouptoggle { margin-left: 4px; width: 20px; height: 20px; flex: none; display: grid; place-items: center; border-radius: 6px; background: var(--ks-panel); border: 1px solid var(--ks-line2); color: var(--ks-ink2); font-size: 14px; font-weight: 800; line-height: 1; transition: transform .15s; }
.ks-grouphead.is-open .ks-grouptoggle, .ks-rowgrouphead.is-open .ks-grouptoggle { transform: rotate(90deg); color: var(--ks-accent-ink); border-color: var(--ks-accent); }
.ks-groupbar { width: 4px; height: 13px; border-radius: 3px; flex: none; }
.ks-grouplabel { font-size: 11px; font-weight: 700; letter-spacing: .8px; text-transform: uppercase; }
.ks-groupcount { margin-left: auto; font-size: 10.5px; font-weight: 600; color: var(--ks-ink3); background: var(--ks-paper2); border: 1px solid var(--ks-line2); padding: 1px 7px; border-radius: 999px; }

/* ---- role pill / clase tag ---- */
.ks-rolepill { font-size: 9px; font-weight: 800; padding: 1px 5px; border-radius: 5px; line-height: 1.5; letter-spacing: .3px; }
.ks-clasetag { display: inline-flex; align-items: center; gap: 3px; font-size: 10px; font-weight: 600; color: var(--ks-ink3); background: var(--ks-paper2); border: 1px solid var(--ks-line2); padding: 2px 7px; border-radius: 6px; }
.ks-clasetag.is-cascade { color: var(--ks-accent-ink); background: var(--ks-accent-soft); border-color: transparent; }
.ks-clasetag.is-variants { color: oklch(0.46 0.1 305); background: oklch(0.96 0.03 305); border-color: transparent; }
.ks-clase-ico { font-size: 10px; }
.ks-mini-cascade { color: var(--ks-accent-ink); font-size: 11px; }
.ks-mini-var { color: oklch(0.5 0.1 305); font-size: 12px; font-weight: 800; }

/* ============== DIR 1 · CLÁSICO+ ============== */
.ks-btngrid { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; }
.ks-svcbtn {
  position: relative; display: flex; flex-direction: column; align-items: flex-start; gap: 4px;
  border: 1px solid var(--ks-line); background: #fff; border-radius: 10px;
  padding: 9px 10px 9px 13px; text-align: left; overflow: hidden; min-height: 44px;
  transition: border-color .12s, transform .06s, box-shadow .12s;
}
.ks-svcbtn-rail { position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: var(--fam); opacity: .85; }
.ks-svcbtn:hover { border-color: color-mix(in oklab, var(--fam) 55%, var(--ks-line)); box-shadow: var(--ks-shadow); transform: translateY(-1px); }
.ks-svcbtn:active { transform: translateY(0); }
.ks-svcbtn-label { font-size: 12.5px; font-weight: 600; color: var(--ks-ink); line-height: 1.2; }
.ks-svcbtn-meta { display: flex; align-items: center; gap: 5px; }
.dens-compact .ks-svcbtn { padding: 7px 8px 7px 11px; min-height: 38px; }
.dens-compact .ks-svcbtn-label { font-size: 12px; }
.dens-comfy .ks-svcbtn { padding: 12px 12px 12px 15px; min-height: 52px; }

/* ============== DIR 2 · BUSCADOR-FIRST ============== */
.ks-rowgroup { margin-top: 10px; }
.ks-rowgrouphead { background: transparent; border: 0; cursor: pointer; }
.ks-caret { font-size: 10px; color: var(--ks-ink3); transition: transform .15s; }
.ks-rows { display: flex; flex-direction: column; gap: 2px; }
.ks-svcrow {
  display: flex; align-items: center; gap: 9px; width: 100%; text-align: left;
  border: 0; background: transparent; border-radius: 8px; padding: 8px 9px; color: var(--ks-ink);
}
.ks-svcrow:hover { background: var(--ks-paper2); }
.ks-svcrow-dot { width: 7px; height: 7px; border-radius: 50%; flex: none; }
.ks-svcrow-label { font-size: 13px; font-weight: 600; }
.ks-svcrow-tags { display: flex; align-items: center; gap: 5px; }
.ks-svcrow-meta { margin-left: auto; display: flex; align-items: center; gap: 9px; font-size: 11.5px; }
.ks-dur { color: var(--ks-ink3); font-variant-numeric: tabular-nums; }
.ks-price { color: var(--ks-ink2); font-weight: 700; font-variant-numeric: tabular-nums; }

/* ============== DIR 3 · TARJETAS ============== */
.ks-cardgrid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.ks-svccard {
  display: flex; flex-direction: column; gap: 9px; text-align: left;
  border: 1px solid var(--ks-line); background: #fff; border-radius: 12px; padding: 11px;
  border-left: 3px solid var(--fam); transition: box-shadow .12s, transform .06s, border-color .12s;
}
.ks-svccard:hover { box-shadow: var(--ks-shadow); transform: translateY(-1px); }
.ks-svccard-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 6px; }
.ks-svccard-label { font-size: 13px; font-weight: 700; color: var(--ks-ink); line-height: 1.2; }
.ks-svccard-bottom { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
.ks-svccard-meta { display: flex; align-items: center; gap: 8px; font-size: 11.5px; }

/* ---- skeleton ---- */
.ks-skel-group { margin-top: 16px; }
.ks-skel-head { height: 11px; border-radius: 5px; background: var(--ks-line2); margin: 4px 2px 12px; }
.ks-skel-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; }
.ks-skel-btn { height: 44px; border-radius: 10px; background: linear-gradient(100deg, var(--ks-line2) 30%, oklch(0.97 0.004 265) 50%, var(--ks-line2) 70%); background-size: 200% 100%; animation: ks-shimmer 1.3s infinite; }
@keyframes ks-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

/* ============================ GRID ============================ */
.ks-grid { min-width: max-content; }
.ks-grid-headrow { display: flex; position: sticky; top: 0; z-index: 20; background: var(--ks-panel); border-bottom: 1px solid var(--ks-line); }
.ks-timegutter-head { width: 58px; flex: none; border-right: 1px solid var(--ks-line2); }
.ks-colhead-cell { flex: 1; min-width: 178px; border-right: 1px solid var(--ks-line2); padding: 10px 14px; }
.ks-colhead { display: flex; align-items: center; gap: 8px; }
.ks-colhead-dot { width: 11px; height: 11px; border-radius: 50%; flex: none; }
.ks-colhead-name { font-size: 13.5px; font-weight: 700; color: var(--ks-ink); }
.ks-ext-tag { font-size: 9px; font-weight: 700; letter-spacing: .4px; color: oklch(0.45 0.1 155); background: oklch(0.95 0.04 155); padding: 1px 6px; border-radius: 5px; text-transform: uppercase; }
.ks-colhead.is-comodin { border: 1px dashed color-mix(in oklab, #2f6fd9 55%, var(--ks-line)); border-radius: 8px; padding: 5px 9px; background: oklch(0.97 0.02 255); }
.ks-comodin-star { color: #2f6fd9; font-weight: 800; font-size: 15px; }
.ks-comodin-tag { font-size: 9px; font-weight: 700; letter-spacing: .4px; color: #2f6fd9; background: oklch(0.93 0.04 255); padding: 1px 6px; border-radius: 5px; text-transform: uppercase; margin-left: auto; }

.ks-grid-body { display: flex; }
.ks-timegutter { width: 58px; flex: none; border-right: 1px solid var(--ks-line2); }
.ks-timecell { position: relative; }
.ks-timelabel { position: absolute; top: -8px; right: 9px; font-size: 11px; color: var(--ks-ink3); font-variant-numeric: tabular-nums; font-weight: 500; }
.ks-timelabel-sub { position: absolute; right: 9px; transform: translateY(-50%); font-size: 9px; color: oklch(0.72 0.008 265); font-variant-numeric: tabular-nums; font-weight: 400; }
.ks-cols { flex: 1; display: flex; position: relative; }
.ks-col { flex: 1; min-width: 178px; position: relative; border-right: 1px solid var(--ks-line2); }
.ks-hourcell { border-bottom: 1px solid var(--ks-line2); }
.ks-hourcell:nth-child(odd) { background: color-mix(in oklab, var(--ks-paper2) 40%, transparent); }
.ks-col.is-comodin { background: repeating-linear-gradient(135deg, oklch(0.975 0.012 255) 0 10px, oklch(0.965 0.012 255) 10px 20px); }
.ks-col.is-ext .ks-hourcell:nth-child(odd) { background: color-mix(in oklab, oklch(0.97 0.03 155) 35%, transparent); }

.ks-nowline { position: absolute; left: 0; right: 0; height: 0; border-top: 2px dashed oklch(0.62 0.18 25 / .55); z-index: 6; pointer-events: none; }
.ks-nowdot { position: absolute; left: -4px; top: -5px; width: 8px; height: 8px; border-radius: 50%; background: oklch(0.62 0.18 25); }

.ks-block-overlay { position: absolute; inset: 0; background: repeating-linear-gradient(135deg, oklch(0.62 0.13 350 / .14) 0 9px, oklch(0.62 0.13 350 / .05) 9px 18px); display: grid; place-items: center; z-index: 4; }
.ks-block-lbl { font-size: 12px; font-weight: 700; color: oklch(0.45 0.12 350); background: #fff; border: 1px solid oklch(0.85 0.06 350); padding: 5px 12px; border-radius: 8px; letter-spacing: .3px; }
.ks-comodin-note { position: absolute; top: 10px; left: 10px; right: 10px; font-size: 10.5px; line-height: 1.4; color: #2f6fd9; background: oklch(0.97 0.02 255 / .9); border: 1px dashed color-mix(in oklab, #2f6fd9 40%, var(--ks-line)); border-radius: 8px; padding: 7px 9px; z-index: 3; }

/* ---- appt block ---- */
.ks-appt {
  position: absolute; left: 5px; right: 5px; z-index: 5;
  border: 0; border-left: 4px solid rgba(0,0,0,.2); border-radius: 6px;
  padding: 0; overflow: hidden; text-align: left;
  background: var(--staff); box-shadow: 0 1px 3px rgba(20,22,30,.18);
  transition: transform .08s, box-shadow .12s;
}
.ks-appt:hover { transform: translateY(-1px); box-shadow: var(--ks-shadow-lg); z-index: 8; }
.ks-appt-inner { position: relative; z-index: 2; display: flex; flex-direction: column; gap: 1px; padding: 4px 8px; color: #fff; height: 100%; }
.ks-appt-topline { display: flex; align-items: baseline; gap: 5px; min-width: 0; padding-right: 18px; }
/* v1.1.55 — bajada de tosquedad: hora 700→500, cliente 700→600. */
.ks-appt-time { font-size: 9.5px; font-weight: 500; opacity: .82; font-variant-numeric: tabular-nums; flex: none; }
.ks-appt-client { font-size: 11px; font-weight: 600; line-height: 1.15; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ks-appt-svc { font-size: 10px; font-weight: 500; opacity: .92; line-height: 1.2; display: flex; flex-wrap: wrap; align-items: center; gap: 5px; }
.ks-appt-fold { font-size: 10px; font-weight: 500; opacity: .85; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ks-appt-rango { font-size: 10px; font-weight: 500; opacity: .75; margin-top: 1px; }
/* v1.1.14 — resize handle (asa en el borde inferior del último bloque) */
.ks-appt-resize { position: absolute; left: 50%; bottom: 2px; transform: translateX(-50%);
  width: 28px; height: 4px; border-radius: 2px; background: rgba(255,255,255,.4);
  cursor: ns-resize; z-index: 3; transition: background .15s, height .15s; }
.ks-appt-resize:hover { background: rgba(255,255,255,.85); height: 6px; }
/* v1.1.14 — bloque extensión (rayado diagonal, mismo color del staff) */
.ks-appt-ext { position: absolute; left: 3px; right: 3px; border-radius: 6px;
  background: repeating-linear-gradient(135deg, var(--staff), var(--staff) 5px,
    color-mix(in oklab, var(--staff) 60%, #000 40%) 5px, color-mix(in oklab, var(--staff) 60%, #000 40%) 10px);
  color: #fff; font-size: 11px; font-weight: 700; display: flex; align-items: center;
  justify-content: space-between; padding: 2px 8px; z-index: 2;
  border-left: 3px solid color-mix(in oklab, var(--staff) 50%, #000 50%); }
.ks-appt-ext-lbl { letter-spacing: .5px; }
.ks-appt-ext-rm { background: transparent; border: 0; color: #fff; cursor: pointer;
  font-size: 14px; font-weight: 700; padding: 0 4px; opacity: .85; }
.ks-appt-ext-rm:hover { opacity: 1; }
.ks-appt-resize-preview { position: absolute; left: 3px; right: 3px; border-radius: 6px;
  background: repeating-linear-gradient(135deg, rgba(255,200,100,.6), rgba(255,200,100,.6) 5px,
    rgba(255,160,40,.7) 5px, rgba(255,160,40,.7) 10px);
  color: #fff; font-size: 11px; font-weight: 700; display: flex; align-items: center;
  justify-content: center; pointer-events: none; z-index: 5;
  border: 1px dashed rgba(255,255,255,.7); }
/* v1.1.17 — Modal productos (estilo V1) */
.pd-search { width: 100%; padding: 9px 12px; border: 1px solid var(--ks-line); border-radius: 8px;
  font-size: 13px; font-family: inherit; margin-bottom: 10px; box-sizing: border-box; }
.pd-list { max-height: 220px; overflow-y: auto; border: 1px solid var(--ks-line2);
  border-radius: 8px; background: var(--ks-paper2); }
.pd-item { display: flex; align-items: center; justify-content: space-between; gap: 8px;
  padding: 8px 12px; cursor: pointer; font-size: 12px; border-bottom: 1px solid var(--ks-line2); }
.pd-item:last-child { border-bottom: 0; }
.pd-item:hover:not(.pd-disabled) { background: #fff; }
.pd-item.pd-disabled { opacity: .5; cursor: not-allowed; }
.pd-item-name { flex: 1; color: var(--ks-ink); font-weight: 500; }
.pd-item-price { color: #15803d; font-weight: 700; }
/* v1.1.25 — Variantes (250ml/1000ml) */
.pd-item-parent { background: rgba(0,0,0,0.02); font-weight: 600; }
.pd-arrow { display: inline-block; width: 12px; color: var(--ks-ink2); font-size: 11px; }
.pd-variant-count { font-size: 10px; color: var(--ks-ink2); margin-left: 4px; font-style: italic; }
.pd-variant-row { display: flex; align-items: center; justify-content: space-between; gap: 8px;
  padding: 6px 12px 6px 28px; cursor: pointer; font-size: 12px; border-bottom: 1px solid var(--ks-line2);
  background: #fafafa; }
.pd-variant-row:hover:not(.pd-disabled) { background: #fff; }
.pd-variant-row.pd-disabled { opacity: .5; cursor: not-allowed; }
.pd-variant-label { flex: 1; color: var(--ks-ink); font-weight: 500; }
.pd-variant-price { color: #15803d; font-weight: 700; }
.pd-cart { margin-top: 12px; padding: 10px; background: rgba(21,128,61,.05);
  border: 1px solid rgba(21,128,61,.2); border-radius: 8px; }
.pd-cart-title { font-size: 11px; font-weight: 700; color: #15803d; letter-spacing: .5px;
  margin-bottom: 8px; }
.pd-cart-line { display: flex; align-items: center; gap: 6px; padding: 4px 0; font-size: 12px; }
.pd-cart-name { flex: 1; color: var(--ks-ink); }
.pd-qty { width: 22px; height: 22px; border: 1px solid var(--ks-line); background: #fff;
  border-radius: 5px; font-weight: 700; cursor: pointer; font-family: inherit; }
.pd-qty-val { min-width: 22px; text-align: center; font-weight: 700; }
.pd-cart-sub { min-width: 50px; text-align: right; color: #15803d; font-weight: 700; }
.pd-cart-rm { background: transparent; border: 0; color: #b91c1c; cursor: pointer;
  font-size: 13px; font-weight: 700; padding: 0 4px; }
.pd-total { display: flex; justify-content: space-between; align-items: center;
  margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(21,128,61,.2);
  font-weight: 800; font-size: 14px; }
.pd-total-val { color: #15803d; }
.pd-pay-row { display: flex; gap: 6px; margin-top: 10px; }
.pd-pay { flex: 1; padding: 8px; border: 1px solid var(--ks-line); background: #fff;
  border-radius: 8px; font-size: 11px; font-weight: 700; letter-spacing: .5px;
  cursor: pointer; font-family: inherit; color: var(--ks-ink); }
.pd-pay.sel { background: #15803d; color: #fff; border-color: #15803d; }
.pd-confirm-row { display: flex; gap: 8px; margin-top: 12px; }
.ks-cascade-flag { font-size: 9px; font-weight: 700; background: rgba(255,255,255,.22); padding: 1px 6px; border-radius: 5px; }
.ks-appt-statusdot { position: absolute; top: 5px; right: 5px; z-index: 3; width: 15px; height: 15px; border-radius: 50%; display: grid; place-items: center; font-size: 9px; font-weight: 800; }
.ks-appt.is-paid { border-left-color: #2a9d54; box-shadow: 0 1px 3px rgba(20,22,30,.16); }
.ks-appt.is-paid .ks-appt-statusdot { background: #2a9d54; color: #fff; }
.ks-appt.is-pending { border-left-color: #d48a1a; box-shadow: 0 1px 3px rgba(20,22,30,.18); }
.ks-appt.is-pending .ks-appt-statusdot { background: #fff; color: #d48a1a; }
/* v1.1.11 — servicio a medida: outline color staff + relleno gris medio */
.ks-appt.is-medida { background: #b5b5bd; border: 2px solid var(--staff); border-left: 4px solid var(--staff); box-shadow: 0 1px 3px rgba(20,22,30,.14); }
.ks-appt.is-medida .ks-appt-inner { color: #fff; }
.ks-appt.is-medida.is-paid { border-left-color: #2a9d54; }
.ks-appt.is-medida.is-pending { border-left-color: #d48a1a; }

/* proceso = capacidad LIBRE que el PROCESO crea (encajable) */
.ks-seg-proceso { position: absolute; left: 3px; right: 3px; z-index: 3;
  background: var(--ks-paper);
  border: 1.5px dashed color-mix(in oklab, var(--staff) 55%, #fff);
  border-radius: 6px;
  display: flex; align-items: center; justify-content: center; gap: 6px;
  cursor: cell; transition: background .12s; overflow: hidden; }
.ks-seg-proceso:hover { background: color-mix(in oklab, var(--staff) 8%, var(--ks-paper)); }
.ks-proceso-lbl { font-size: 9px; font-weight: 800; letter-spacing: .4px; color: var(--ks-ink2); text-transform: uppercase; white-space: nowrap; }
.ks-proceso-hint { font-size: 8.5px; font-weight: 700; color: color-mix(in oklab, var(--staff) 70%, var(--ks-ink2)); white-space: nowrap; display: none; }
.ks-seg-proceso:hover .ks-proceso-hint { display: inline; }

/* tirador inferior — añadir tiempo extra (como el original, drag de borde) */
.ks-extend-handle { position: absolute; left: 0; right: 0; bottom: 0; height: 13px; z-index: 4;
  display: flex; align-items: center; justify-content: center; gap: 5px; cursor: ns-resize;
  opacity: 0; transition: opacity .12s; }
.ks-appt:hover .ks-extend-handle { opacity: 1; }
.ks-extend-grip { position: absolute; bottom: 3px; left: 50%; transform: translateX(-50%); width: 26px; height: 3px; border-radius: 2px; background: rgba(255,255,255,.75); }
.ks-extend-lbl { font-size: 8.5px; font-weight: 700; color: #fff; background: rgba(0,0,0,.28); padding: 0 6px; border-radius: 5px; position: relative; bottom: 1px; }
.ks-appt.is-unassigned .ks-extend-handle, .ks-appt.is-unassigned:hover .ks-extend-handle { display: none; }

/* cita sin asignar (comodín) */
.ks-appt.is-unassigned { background: #fff; border: 1.5px dashed #2f6fd9; box-shadow: none; display: flex; flex-direction: column; gap: 2px; padding: 7px 9px; }
.ks-appt.is-unassigned .ks-appt-time { color: #2f6fd9; opacity: 1; }
.ks-appt.is-unassigned .ks-appt-client { color: var(--ks-ink); }
.ks-appt.is-unassigned .ks-appt-svc { color: var(--ks-ink2); }
.ks-assign-pill { margin-top: 3px; align-self: flex-start; font-size: 10px; font-weight: 700; color: #fff; background: #2f6fd9; padding: 2px 9px; border-radius: 999px; }

/* ============================ DETAIL POPOVER ============================ */
.ks-detail-scrim { position: fixed; inset: 0; z-index: 50; }
.ks-detail { position: fixed; z-index: 51; width: 340px; max-width: calc(100vw - 32px); max-height: calc(100vh - 32px); overflow-y: auto; background: #fff; border: 1px solid var(--ks-line); border-radius: 14px; box-shadow: var(--ks-shadow-lg); animation: ks-pop .14s ease-out; }
@keyframes ks-pop { from { transform: translateY(6px) scale(.98); } }
.ks-detail-head { padding: 14px 15px 13px; border-bottom: 1px solid var(--ks-line2); border-top: 3px solid var(--fam); }
.ks-detail-headtop { display: flex; align-items: center; justify-content: space-between; }
.ks-detail-groupchip { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .5px; padding: 2px 8px; border-radius: 6px; }
.ks-detail-close { width: 24px; height: 24px; border: 0; background: var(--ks-paper2); border-radius: 7px; color: var(--ks-ink2); font-size: 12px; }
.ks-detail-title { font-size: 17px; font-weight: 700; margin-top: 9px; }
.ks-detail-tags { display: flex; flex-wrap: wrap; align-items: center; gap: 7px; margin-top: 9px; }
.ks-detail-dur { font-size: 11.5px; font-weight: 600; color: var(--ks-ink2); }
.ks-detail-price { font-size: 11.5px; font-weight: 800; color: var(--ks-ink); }
.ks-detail-body { padding: 14px 15px; }
.ks-detail-block { margin-bottom: 15px; }
.ks-detail-blocklbl { font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .7px; color: var(--ks-ink3); margin-bottom: 9px; display: flex; align-items: center; gap: 7px; }
.ks-detail-blocklbl-hint { font-family: ui-monospace, monospace; font-size: 9.5px; font-weight: 600; color: var(--ks-ink3); background: var(--ks-paper2); padding: 1px 5px; border-radius: 4px; letter-spacing: 0; text-transform: none; }
.ks-variant-list { display: flex; flex-direction: column; gap: 6px; }
.ks-variant { text-align: left; border: 1px solid var(--ks-line); background: #fff; border-radius: 8px; padding: 8px 11px; font-size: 12.5px; font-weight: 600; color: var(--ks-ink2); }
.ks-variant:hover { border-color: var(--ks-accent); }
.ks-variant.active { border-color: var(--ks-accent); background: var(--ks-accent-soft); color: var(--ks-accent-ink); }

/* cascade timeline */
.ks-cascade-track { display: flex; gap: 3px; height: 52px; }
.ks-cascade-seg { display: flex; flex-direction: column; justify-content: center; gap: 2px; padding: 4px 6px; border-radius: 7px; background: oklch(0.45 0.04 265); color: #fff; min-width: 0; overflow: hidden; }
.ks-cascade-seg-label { font-size: 9.5px; font-weight: 600; line-height: 1.1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ks-cascade-seg-dur { font-size: 9px; opacity: .8; font-variant-numeric: tabular-nums; }
.ks-cascade-seg.is-proceso { background: repeating-linear-gradient(135deg, var(--ks-paper2) 0 6px, #fff 6px 12px); color: var(--ks-ink2); border: 1.5px dashed var(--ks-accent); }
.ks-cascade-seg.is-active { background: transparent; color: oklch(0.48 0.13 150); border: 1.5px solid oklch(0.62 0.15 150); }
.ks-cascade-seg.is-active .ks-cascade-seg-dur { opacity: .9; }
.ks-cascade-legend { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-top: 10px; font-size: 10.5px; color: var(--ks-ink2); }
.ks-cascade-legitem { display: flex; align-items: center; gap: 5px; }
.ks-leg-sw { width: 12px; height: 12px; border-radius: 4px; }
.ks-leg-sw.work { background: oklch(0.45 0.04 265); }
.ks-leg-sw.active { background: transparent; border: 1.5px solid oklch(0.62 0.15 150); }
.ks-leg-sw.proceso { background: repeating-linear-gradient(135deg, var(--ks-paper2) 0 4px, #fff 4px 8px); border: 1px dashed var(--ks-accent); }
.ks-cascade-total { margin-left: auto; font-weight: 700; color: var(--ks-ink); }
.ks-detail-note { font-size: 11.5px; line-height: 1.5; color: var(--ks-ink2); margin: 10px 0 0; padding: 9px 11px; background: var(--ks-accent-soft); border-radius: 8px; }
.ks-detail-note strong { color: var(--ks-accent-ink); }
.ks-detail-note-simple { background: var(--ks-paper2); }
.ks-detail-uid { font-size: 10px; color: var(--ks-ink3); }
.ks-detail-uid code { font-family: ui-monospace, monospace; color: var(--ks-ink2); }
.ks-detail-foot { display: flex; gap: 9px; padding: 12px 15px; border-top: 1px solid var(--ks-line2); background: var(--ks-paper); }
.ks-detail-cancel { flex: none; border: 1px solid var(--ks-line); background: #fff; border-radius: 9px; padding: 9px 15px; font-size: 12.5px; font-weight: 600; color: var(--ks-ink2); }
.ks-detail-add { flex: 1; border: 0; background: var(--ks-ink); color: #fff; border-radius: 9px; padding: 9px; font-size: 12.5px; font-weight: 700; }
.ks-detail-add:hover { background: #000; }

/* ============================ LOGIN SCRIM (v1.1.45 · capa de acceso) ============================ */
/* Vive DENTRO del Shadow DOM (igual que .ks-modal-scrim) para poder tapar
   las citas .ks-appt, que también viven aquí. z-index 200 (> .ks-modal-scrim 60
   y > .ks-grid-headrow 20). Tema claro mimético con los tokens --ks-*. */
.ks-login-scrim { position: fixed; inset: 0; z-index: 200; background: var(--ks-paper2); display: grid; place-items: center; padding: 28px; }
.ks-login-card { width: 480px; max-width: 100%; background: var(--ks-panel); border-radius: 18px; box-shadow: var(--ks-shadow-lg); border-top: 3px solid var(--ks-accent); padding: 26px 28px 28px; animation: ks-pop .16s ease-out; }
.ks-login-brand { display: flex; align-items: center; justify-content: center; gap: 10px; margin-bottom: 4px; }
.ks-login-logo { font-weight: 700; font-size: 18px; letter-spacing: 1px; color: var(--ks-ink); }
.ks-login-logo-accent { color: var(--ks-accent-ink); }
.ks-login-eyebrow { text-align: center; font-size: 10.5px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase; color: var(--ks-ink3); margin-bottom: 20px; }
.ks-login-staffgrid { display: flex; flex-wrap: wrap; justify-content: center; gap: 14px; }
.ks-login-staff { display: flex; flex-direction: column; align-items: center; gap: 8px; border: 0; background: transparent; padding: 6px; border-radius: 12px; width: 92px; transition: transform .08s; }
.ks-login-staff:hover { transform: translateY(-2px); }
.ks-login-staff:active { transform: translateY(0); }
.ks-login-avatar { width: 64px; height: 64px; border-radius: 50%; display: grid; place-items: center; font-size: 24px; font-weight: 700; color: #fff; border: 3px solid var(--aro, var(--ks-accent)); box-shadow: var(--ks-shadow); background-size: cover; background-position: center; }
.ks-login-staff-name { font-size: 12.5px; font-weight: 600; color: var(--ks-ink); text-align: center; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 88px; }
.ks-login-empty { text-align: center; color: var(--ks-ink3); font-size: 13px; padding: 24px 0; }
/* paso PIN */
.ks-login-pinhead { display: flex; align-items: center; gap: 12px; margin-bottom: 18px; }
.ks-login-pinback { width: 32px; height: 32px; flex: none; border: 1px solid var(--ks-line); background: #fff; border-radius: 9px; font-size: 16px; color: var(--ks-ink2); line-height: 1; }
.ks-login-pinback:hover { background: var(--ks-paper2); color: var(--ks-ink); }
.ks-login-pinwho { display: flex; align-items: center; gap: 10px; }
.ks-login-pinavatar { width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center; font-size: 16px; font-weight: 700; color: #fff; border: 2px solid var(--aro, var(--ks-accent)); background-size: cover; background-position: center; }
.ks-login-pinname { font-size: 15px; font-weight: 700; color: var(--ks-ink); }
.ks-login-pindots { display: flex; justify-content: center; gap: 12px; margin: 6px 0 18px; }
.ks-login-pindot { width: 14px; height: 14px; border-radius: 50%; border: 2px solid var(--ks-line); background: transparent; transition: background .12s, border-color .12s; }
.ks-login-pindot.filled { background: var(--ks-accent); border-color: var(--ks-accent); }
.ks-login-pindot.error { border-color: oklch(0.6 0.16 25); animation: ks-pinerr .35s ease; }
@keyframes ks-pinerr { 0%,100% { transform: translateX(0); } 25% { transform: translateX(-5px); } 75% { transform: translateX(5px); } }
.ks-login-keys { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; max-width: 260px; margin: 0 auto; }
.ks-login-key { height: 56px; border: 1px solid var(--ks-line); background: #fff; border-radius: 12px; font-size: 22px; font-weight: 600; color: var(--ks-ink); transition: background .1s, border-color .1s, transform .06s; font-family: inherit; }
.ks-login-key:hover { background: var(--ks-paper2); border-color: var(--ks-ink3); }
.ks-login-key:active { transform: scale(.96); }
.ks-login-key.is-action { font-size: 18px; color: var(--ks-ink2); background: var(--ks-paper2); }
.ks-login-key.is-empty { border: 0; background: transparent; pointer-events: none; }
.ks-login-pinerr-msg { text-align: center; font-size: 12px; font-weight: 600; color: oklch(0.55 0.16 25); margin-top: 14px; min-height: 16px; }
.ks-login-pinsetup { text-align: center; font-size: 12px; font-weight: 600; color: var(--ks-accent-ink); background: var(--ks-accent-soft); padding: 10px 12px; border-radius: 9px; margin-top: 14px; }

/* ============================ MODAL ============================ */
.ks-modal-scrim { position: fixed; inset: 0; z-index: 60; background: oklch(0.3 0.02 265 / .32); backdrop-filter: blur(2px); display: grid; place-items: center; padding: 24px; }
.ks-modal { width: 440px; max-width: 100%; background: #fff; border-radius: 16px; box-shadow: var(--ks-shadow-lg); padding: 20px 22px; animation: ks-pop .16s ease-out; }
.ks-modal-head { display: flex; align-items: center; gap: 10px; }
.ks-modal-staff { font-size: 11px; font-weight: 800; letter-spacing: .6px; }
.ks-modal-status { font-size: 10px; font-weight: 800; letter-spacing: .5px; padding: 3px 9px; border-radius: 999px; text-transform: uppercase; }
.ks-modal-status.pending { color: #2a230f; background: var(--ks-accent); }
.ks-modal-status.paid { color: #fff; background: oklch(0.66 0.15 150); }
.ks-modal-x { margin-left: auto; width: 28px; height: 28px; border: 0; background: var(--ks-paper2); border-radius: 8px; color: var(--ks-ink2); font-size: 13px; }
.ks-modal-client { font-size: 21px; font-weight: 700; margin-top: 10px; }
.ks-modal-meta { font-size: 13px; color: var(--ks-ink2); font-weight: 600; margin-top: 4px; font-variant-numeric: tabular-nums; }
.ks-modal-contact { display: flex; flex-wrap: wrap; gap: 14px; font-size: 12.5px; color: var(--ks-ink2); margin-top: 7px; padding-bottom: 14px; border-bottom: 1px solid var(--ks-line2); }
.ks-modal-items { padding: 13px 0; display: flex; flex-direction: column; gap: 2px; }
.ks-modal-item { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 7px 0; }
.ks-item-label { font-size: 13.5px; color: var(--ks-ink); display: flex; align-items: center; gap: 7px; }
.ks-modal-item.is-compl .ks-item-label { color: var(--ks-ink2); padding-left: 4px; }
.ks-item-complflag { color: var(--ks-accent-ink); font-size: 12px; }
.ks-modal-item.is-prod .ks-item-label { color: #166534; padding-left: 4px; }
.ks-item-prodflag { font-size: 12px; margin-right: 2px; }
.ks-prod-badge { background: rgba(21,128,61,.12); color: #15803d; font-size: 9px; font-weight: 700; letter-spacing: .5px; padding: 1px 5px; border-radius: 4px; margin-left: 6px; vertical-align: middle; }
.ks-item-right { display: flex; align-items: center; gap: 12px; }
.ks-item-price { font-size: 13.5px; font-weight: 700; font-variant-numeric: tabular-nums; }
.ks-item-right { display: inline-flex; align-items: center; gap: 8px; }
.ks-item-rm { background: transparent; border: 0; color: #b91c1c; cursor: pointer; font-size: 13px; font-weight: 700; padding: 2px 6px; border-radius: 6px; opacity: .45; transition: opacity .12s, background .12s; }
.ks-modal-item:hover .ks-item-rm { opacity: 1; }
.ks-item-rm:hover { background: rgba(185,28,28,.08); }
.ks-item-rm:disabled { opacity: .25; cursor: wait; }
.ks-item-rm { border: 0; background: transparent; color: oklch(0.6 0.16 25); font-size: 13px; }
.ks-modal-total { display: flex; align-items: center; justify-content: space-between; padding: 13px 0; border-top: 2px solid var(--ks-ink); font-weight: 800; font-size: 15px; }
.ks-total-val { font-size: 20px; font-variant-numeric: tabular-nums; }
.ks-modal-pays { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 6px; }
.ks-pay { flex: 1; min-width: 72px; border: 0; border-radius: 9px; padding: 10px 8px; font-size: 12px; font-weight: 700; color: #fff; }
.ks-pay:disabled { opacity: .4; cursor: not-allowed; }
.pay-efectivo { background: oklch(0.42 0.13 350); }
.pay-tarjeta { background: oklch(0.5 0.1 165); }
.pay-bizum { background: var(--ks-accent); color: #2a230f; }
.pay-mixto { background: oklch(0.5 0.13 255); }
.ks-pay.pay-cancel { flex: none; background: #fff; color: oklch(0.5 0.14 25); border: 1px solid oklch(0.85 0.06 25); }
.ks-modal-adds { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; margin-top: 11px; }
.ks-add { border: 1px solid var(--ks-line); background: #fff; border-radius: 9px; padding: 10px; font-size: 12px; font-weight: 600; color: var(--ks-ink2); text-align: center; }
.add-svc:hover { border-color: oklch(0.6 0.13 255); color: oklch(0.45 0.13 255); background: oklch(0.97 0.03 255); }
.add-compl:hover { border-color: oklch(0.6 0.13 305); color: oklch(0.45 0.13 305); background: oklch(0.97 0.03 305); }
.add-prod:hover { border-color: var(--ks-ink3); color: var(--ks-ink); }
.add-extra:hover { border-color: var(--ks-accent); color: var(--ks-accent-ink); background: var(--ks-accent-soft); }
.ks-modal-foot { display: flex; align-items: center; justify-content: space-between; margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--ks-line2); }
.ks-changedate { border: 1px solid var(--ks-line); background: #fff; border-radius: 9px; padding: 9px 14px; font-size: 12.5px; font-weight: 600; color: var(--ks-ink2); }
.ks-modal-close { border: 1px solid var(--ks-line); background: var(--ks-paper2); border-radius: 9px; padding: 9px 18px; font-size: 12.5px; font-weight: 700; color: var(--ks-ink); }

/* ============================ TOAST ============================ */
.ks-toast { position: fixed; bottom: 22px; left: 50%; transform: translateX(-50%); z-index: 70; background: var(--ks-ink); color: #fff; padding: 11px 18px; border-radius: 11px; font-size: 13px; font-weight: 600; box-shadow: var(--ks-shadow-lg); animation: ks-toastin .2s ease-out; }
@keyframes ks-toastin { from { transform: translate(-50%, 10px); } }

/* v1.1.34 — Dot rojo parpadeante del warn-banner (ficha incompleta). */
@keyframes warnBlink { 0%, 100% { opacity: 1; } 50% { opacity: .25; } }

/* v1.1.35 — Spinning del botón ↻ Recargar mientras espera respuesta. */
@keyframes ksSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
.ks-tool.is-spinning { animation: ksSpin .8s linear infinite; pointer-events: none; opacity: .65; }

/* ============================ SERVICIO A MEDIDA ============================ */
.ks-blankform { width: 420px; max-width: 100%; background: #fff; border-radius: 16px; box-shadow: var(--ks-shadow-lg); padding: 20px 22px; animation: ks-pop .16s ease-out; }
.ks-blank-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.ks-blank-head > div:first-child { flex: 1; min-width: 0; }
.ks-blank-title { white-space: nowrap; }
.ks-blank-eyebrow { font-size: 10.5px; font-weight: 700; letter-spacing: .8px; text-transform: uppercase; color: var(--ks-accent-ink); }
.ks-blank-title { margin: 3px 0 0; font-size: 19px; font-weight: 700; }
.ks-blank-note { font-size: 11.5px; line-height: 1.5; color: var(--ks-ink2); background: var(--ks-paper2); padding: 9px 11px; border-radius: 8px; margin: 12px 0 14px; }
.ks-blank-note code { font-family: ui-monospace, monospace; color: var(--ks-ink); }
.ks-field { display: flex; flex-direction: column; gap: 5px; margin-bottom: 12px; }
.ks-field > span { font-size: 11px; font-weight: 600; color: var(--ks-ink2); }
.ks-field input { border: 1px solid var(--ks-line); border-radius: 9px; padding: 9px 11px; font-size: 13px; font-family: inherit; outline: none; background: var(--ks-paper); color: var(--ks-ink); }
.ks-field input:focus { border-color: var(--ks-accent); background: #fff; }
.ks-field-row { display: flex; gap: 12px; }
.ks-field-row .ks-field { flex: 1; }
.ks-blank-foot { display: flex; gap: 9px; margin-top: 6px; }
.ks-blank-foot .ks-detail-cancel { flex: none; }
.ks-blank-foot .ks-detail-add { flex: 1; }

/* ============================ DESCUENTO (card) ============================ */
.ks-modal-disc { margin-top: 2px; }
.ks-disc-toggle { border: 1px dashed var(--ks-line); background: #fff; color: var(--ks-ink2); padding: 7px 12px; border-radius: 8px; font-size: 12px; font-weight: 600; }
.ks-disc-toggle:hover { border-color: var(--ks-accent); color: var(--ks-accent-ink); background: var(--ks-accent-soft); }
.ks-disc-row { display: flex; align-items: center; gap: 10px; padding: 6px 0; }
.ks-disc-lbl { font-size: 13px; color: var(--ks-ink2); font-weight: 600; }
/* v1.1.26 — toggle modo % / € */
.ks-disc-mode { margin-left: auto; display: inline-flex; border: 1px solid var(--ks-line); border-radius: 8px; overflow: hidden; }
.ks-disc-mbtn { background: #fff; border: 0; padding: 6px 10px; font-size: 12px; font-weight: 700; color: var(--ks-ink2); cursor: pointer; font-family: inherit; transition: background .12s, color .12s; }
.ks-disc-mbtn + .ks-disc-mbtn { border-left: 1px solid var(--ks-line); }
.ks-disc-mbtn:hover:not(.sel) { background: var(--ks-accent-soft); color: var(--ks-accent-ink); }
.ks-disc-mbtn.sel { background: var(--ks-ink); color: #fff; }
.ks-disc-input { display: flex; align-items: center; gap: 5px; border: 1px solid var(--ks-line); border-radius: 8px; padding: 0 10px; }
.ks-disc-input:focus-within { border-color: var(--ks-accent); }
.ks-disc-input input { width: 64px; border: 0; outline: none; padding: 7px 0; font-size: 13px; text-align: right; font-family: inherit; background: transparent; color: var(--ks-ink); }
.ks-disc-clear { border: 0; background: transparent; color: oklch(0.6 0.16 25); font-size: 13px; }
.ks-total-wrap { display: flex; align-items: baseline; gap: 9px; }
.ks-total-strike { font-size: 14px; color: var(--ks-ink3); text-decoration: line-through; font-variant-numeric: tabular-nums; }

/* ============================ BLOQUEO POR ARRASTRE ============================ */
.ks-col.is-blockable { cursor: cell; }
/* v1.1.29 — drag&drop por fase */
.ks-col.is-drop { background: rgba(201, 164, 74, .15); outline: 2px dashed #c9a44a; outline-offset: -2px; }
.ks-appt.is-dragging { opacity: .5; }
.ks-fase-ghost { position: fixed; pointer-events: none; z-index: 9999;
  background: var(--ks-ink); color: #fff; padding: 7px 10px; border-radius: 8px;
  box-shadow: 0 8px 22px rgba(0,0,0,.25); font-size: 11px; font-weight: 600;
  max-width: 220px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ks-fase-ghost .g-cli { font-weight: 700; }
.ks-fase-ghost .g-svc { font-weight: 500; opacity: .85; margin-top: 2px; }
/* v1.1.64 — hora destino en vivo dentro del ghost del drag de fase */
.ks-fase-ghost .g-time { font-weight: 800; margin-top: 3px; font-size: 13px; font-variant-numeric: tabular-nums; letter-spacing: .5px; }
/* v1.1.64 — icono ajustar hora de inicio de fase (aparece al pasar el ratón sobre el bloque) */
.ks-appt-timeadj { position: absolute; top: 4px; right: 23px; z-index: 4; width: 16px; height: 16px; border-radius: 5px; display: grid; place-items: center; font-size: 10px; line-height: 1; background: rgba(0,0,0,.30); color: #fff; cursor: pointer; opacity: 0; transition: opacity .12s, background .12s; }
.ks-appt:hover .ks-appt-timeadj { opacity: 1; }
.ks-appt-timeadj:hover { background: rgba(0,0,0,.6); }
/* v1.1.64 — duración por servicio en la card de la cita */
.ks-item-dur { font-size: 10.5px; color: var(--ks-ink3); font-weight: 600; font-variant-numeric: tabular-nums; }
/* v1.1.64 — selector de hora (confirmar antes de pintar / reajustar fase) */
.ks-horapick { position: relative; z-index: 1; width: min(340px, 92vw); background: #fff; border-radius: 16px; box-shadow: var(--ks-shadow-lg); padding: 18px 20px 16px; }
.ks-horapick-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; margin-bottom: 4px; }
.ks-horapick-eyebrow { font-size: 10px; font-weight: 700; letter-spacing: .8px; text-transform: uppercase; color: var(--ks-accent-ink); }
.ks-horapick-title { margin: 2px 0 0; font-size: 17px; font-weight: 700; color: var(--ks-ink); }
.ks-horapick-sub { font-size: 12px; color: var(--ks-ink2); margin-top: 3px; }
.ks-horapick-display { text-align: center; font-size: 46px; font-weight: 800; letter-spacing: 1px; color: var(--ks-ink); font-variant-numeric: tabular-nums; margin: 10px 0 14px; }
.ks-horapick-steppers { display: flex; align-items: center; justify-content: center; gap: 6px; margin-bottom: 16px; flex-wrap: wrap; }
.ks-horapick-step { border: 1px solid var(--ks-line); background: var(--ks-paper2); color: var(--ks-ink2); border-radius: 9px; padding: 8px 10px; font-size: 13px; font-weight: 700; min-width: 46px; }
.ks-horapick-step:hover { border-color: var(--ks-accent); color: var(--ks-accent-ink); }
.ks-horapick-input { font-family: inherit; font-size: 20px; font-weight: 700; text-align: center; border: 1px solid var(--ks-line); border-radius: 10px; padding: 6px 8px; color: var(--ks-ink); width: 116px; font-variant-numeric: tabular-nums; }
.ks-horapick-foot { display: flex; gap: 10px; }
.ks-horapick-foot .ks-detail-cancel, .ks-horapick-foot .ks-detail-add { flex: 1; }
.ks-blockpreview { position: absolute; left: 4px; right: 4px; z-index: 7; pointer-events: none; white-space: nowrap;
  background: repeating-linear-gradient(135deg, oklch(0.45 0.03 260 / .18) 0 7px, oklch(0.45 0.03 260 / .06) 7px 14px);
  border: 1.5px dashed var(--ks-ink3); border-radius: 7px;
  display: grid; place-items: center; font-size: 11px; font-weight: 800; color: var(--ks-ink2); letter-spacing: .3px; }
.ks-customblock { position: absolute; left: 4px; right: 4px; z-index: 2;
  /* v1.1.31 — z-index BAJO la cita (.ks-appt z:5). El operador puede meter
     una cita encima del bloqueo a propósito y la cita debe quedar visible. */
  background: repeating-linear-gradient(135deg, var(--staff) 0 4px, color-mix(in oklab, var(--staff) 70%, #000) 4px 8px);
  border: 0; border-radius: 6px;
  display: flex; align-items: center; justify-content: center; padding: 4px 8px; }
.ks-customblock-lbl { font-size: 11px; font-weight: 700; color: #fff; text-align: center; line-height: 1.2; letter-spacing: .3px; }
.ks-customblock-rm { position: absolute; top: 4px; right: 5px; border: 0; background: rgba(255,255,255,.7); border-radius: 5px; width: 18px; height: 18px; font-size: 11px; color: var(--ks-ink2); opacity: 0; transition: opacity .12s; }
.ks-customblock:hover .ks-customblock-rm { opacity: 1; }

/* steppers de hora en el popup de bloqueo */
.ks-timefields { display: flex; gap: 12px; margin-bottom: 14px; }
.ks-timefield { flex: 1; display: flex; flex-direction: column; gap: 6px; }
.ks-timefield > span { font-size: 11px; font-weight: 600; color: var(--ks-ink2); }
.ks-stepper { display: flex; align-items: center; justify-content: space-between; gap: 4px; border: 1px solid var(--ks-line); border-radius: 9px; padding: 4px; background: var(--ks-paper); }
.ks-stepper b { font-size: 14px; font-variant-numeric: tabular-nums; font-weight: 700; }
.ks-stepper button { width: 26px; height: 26px; flex: none; border: 1px solid var(--ks-line); background: #fff; border-radius: 7px; font-size: 15px; font-weight: 700; color: var(--ks-ink2); line-height: 1; }
.ks-stepper button:hover { border-color: var(--ks-accent); color: var(--ks-accent-ink); }
.ks-durpill { display: grid; place-items: center; height: 36px; border-radius: 9px; background: var(--ks-paper2); border: 1px solid var(--ks-line2); font-size: 14px; font-weight: 700; color: var(--ks-ink); font-variant-numeric: tabular-nums; white-space: nowrap; }

/* extras widget vanilla */
.ks-cli-results { position:absolute; left:0; right:0; top:4px; z-index:30; background:#fff; border:1px solid var(--ks-line); border-radius:10px; box-shadow:var(--ks-shadow-lg); max-height:260px; overflow:auto; }
.ks-cli-item { padding:9px 12px; cursor:pointer; border-bottom:1px solid var(--ks-line2); }
.ks-cli-item:last-child { border-bottom:0; }
.ks-cli-item:hover { background:var(--ks-paper2); }
.ks-cli-name { font-size:13px; font-weight:600; color:var(--ks-ink); }
.ks-cli-sub { font-size:11px; color:var(--ks-ink3); }
.ks-cli-selected { margin-top:8px; padding:9px 11px; background:oklch(0.97 0.02 255); border:1px solid color-mix(in oklab,#2f6fd9 30%,var(--ks-line)); border-radius:9px; display:flex; align-items:center; justify-content:space-between; }
.ks-cli-sname { font-size:13px; font-weight:700; color:#2f6fd9; }
.ks-cli-ssub { font-size:11px; color:var(--ks-ink2); }
.ks-cli-srm { border:0; background:transparent; color:var(--ks-ink3); font-size:13px; }
.ks-grid-headrow-wrap { position:sticky; top:0; z-index:20; }
.ks-mixtobox { }

/* ============================ DATEPICKER (V1 literal) ============================ */
.ks-monthchip { cursor:pointer; user-select:none; }
.ks-monthchip:hover { background: var(--ks-accent-soft); color: var(--ks-accent-ink); }
.dp-popover { position:absolute; top:100%; left:0; z-index:50; background:#fff; border-radius:10px; box-shadow:0 8px 32px rgba(0,0,0,.15); padding:14px; width:270px; display:none; margin-top:6px; }
.dp-popover.open { display:block; }
.dp-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; }
.dp-month { font-size:14px; font-weight:700; text-transform:capitalize; }
.dp-nav { display:flex; align-items:center; justify-content:center; width:26px; height:26px; border:1px solid #e2e5ea; border-radius:6px; background:#fff; cursor:pointer; font-size:14px; color:#6b7280; }
.dp-nav:hover { background:#f7f8fa; color:#c9a44a; }
.dp-weekdays { display:grid; grid-template-columns:repeat(7,1fr); text-align:center; margin-bottom:4px; }
.dp-weekdays span { font-size:10px; font-weight:600; color:#9ca3af; padding:3px 0; }
.dp-days { display:grid; grid-template-columns:repeat(7,1fr); gap:2px; }
.dp-day { display:flex; align-items:center; justify-content:center; width:32px; height:32px; border-radius:50%; font-size:12px; font-weight:500; cursor:pointer; margin:0 auto; }
.dp-day:hover { background:rgba(201,164,74,.1); color:#c9a44a; }
.dp-day.other { color:#e2e5ea; }
.dp-day.today { border:2px solid #c9a44a; font-weight:700; }
.dp-day.selected { background:#c9a44a; color:#fff; font-weight:700; }

/* ============================ SETTINGS PANEL (V1 literal) ============================ */
.settings-overlay { position:fixed; inset:0; background:rgba(0,0,0,.25); z-index:100; display:none; }
.settings-overlay.open { display:block; }
.settings-panel { position:fixed; top:0; right:-360px; width:340px; height:100%; background:#fff; box-shadow:0 8px 32px rgba(0,0,0,.15); z-index:101; transition:right .3s; display:flex; flex-direction:column; }
.settings-panel.open { right:0; }
.settings-header { display:flex; align-items:center; justify-content:space-between; padding:14px 18px; border-bottom:1px solid #e2e5ea; }
.settings-title { font-size:15px; font-weight:700; }
.settings-body { flex:1; overflow-y:auto; padding:14px 18px; }
.settings-section { margin-bottom:20px; }
.settings-section-title { font-size:12px; font-weight:700; margin-bottom:10px; }
.settings-reset { font-size:12px; border:none; color:#c9a44a; background:none; cursor:pointer; }
.settings-close { border:0; background:transparent; font-size:18px; color:#9ca3af; cursor:pointer; padding:4px 8px; }
.staff-config-row { display:grid; grid-template-columns:22px 1fr 28px 48px; align-items:center; gap:6px; padding:6px 8px; background:#f7f8fa; border-radius:6px; margin-bottom:6px; }
.staff-check { width:14px; height:14px; accent-color:#c9a44a; cursor:pointer; }
.staff-name-label { font-size:12px; font-weight:500; }
.staff-color-btn { width:24px; height:24px; border-radius:5px; border:2px solid #e2e5ea; cursor:pointer; }
.staff-color-btn:hover { border-color:#c9a44a; }
.staff-pos-input { width:44px; height:26px; border:1px solid #e2e5ea; border-radius:4px; text-align:center; font-size:11px; font-family:inherit; }
.slider-row { display:flex; align-items:center; gap:8px; }
.slider-row label { font-size:11px; color:#6b7280; white-space:nowrap; min-width:55px; }
.slider-row input[type="range"] { flex:1; -webkit-appearance:none; height:5px; background:#e2e5ea; border-radius:3px; outline:none; }
.slider-row input[type="range"]::-webkit-slider-thumb { -webkit-appearance:none; width:14px; height:14px; background:#c9a44a; border-radius:50%; cursor:pointer; }
.option-group { display:flex; flex-direction:column; gap:6px; }
.option-item { display:flex; align-items:center; gap:6px; font-size:12px; cursor:pointer; }
.option-item input { width:14px; height:14px; accent-color:#c9a44a; }

/* ============================ COLOR PICKER (V1 literal) ============================ */
.color-popover { position:fixed; z-index:200; background:#fff; border-radius:10px; box-shadow:0 8px 32px rgba(0,0,0,.15); padding:10px; display:none; }
.color-popover.open { display:block; }
.color-grid { display:grid; grid-template-columns:repeat(6,1fr); gap:5px; }
.color-swatch { width:28px; height:28px; border-radius:5px; cursor:pointer; border:2px solid transparent; }
.color-swatch:hover { transform:scale(1.15); border-color:#1a1d23; }
.color-swatch.active { border-color:#1a1d23; box-shadow:0 0 0 2px #fff,0 0 0 4px #1a1d23; }

/* ============================ CIERRE DEL DÍA (V1 literal) ============================ */
.cierre-panel { display:none; margin:10px 18px 18px; background:#fff; border:1px solid #e2e5ea; border-radius:10px; padding:16px; }
.cierre-panel.visible { display:block; }
.cierre-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; padding-bottom:8px; border-bottom:1px solid #e2e5ea; }
.cierre-title { font-size:14px; font-weight:800; }
.cierre-close { background:none; border:none; font-size:18px; cursor:pointer; color:#9ca3af; padding:4px 8px; transition:color .15s, transform .15s; }
.cierre-close:hover { color:var(--ks-ink); }
.cierre-close.spinning { animation: cierre-spin 0.7s linear infinite; }
@keyframes cierre-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
.cierre-grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
.cierre-box { background:#f7f8fa; border-radius:6px; padding:12px; text-align:center; }
.cierre-box.cobrado { border-left:3px solid #2a9d54; }
.cierre-box.pendiente { border-left:3px solid #d48a1a; }
.cierre-box.total { grid-column:1/-1; border-left:3px solid #c9a44a; background:rgba(201,164,74,.08); }
.cierre-label { font-size:10px; font-weight:600; color:#9ca3af; text-transform:uppercase; letter-spacing:.5px; }
.cierre-valor { font-size:20px; font-weight:800; margin-top:3px; }
.cierre-detalle { font-size:10px; color:#9ca3af; margin-top:2px; }
.cierre-section { grid-column:1/-1; margin-top:4px; }
.cierre-section-title { font-size:10px; font-weight:700; color:#c9a44a; text-transform:uppercase; letter-spacing:.6px; margin-bottom:6px; border-bottom:1px solid #e2e5ea; padding-bottom:4px; }
.cierre-row { display:flex; justify-content:space-between; align-items:center; padding:4px 8px; font-size:11px; }
.cierre-row:nth-child(odd) { background:rgba(0,0,0,.03); border-radius:4px; }
/* v1.1.21 — bloques rendimiento / cierre + banner reconciliación */
.cierre-block { border-radius:12px; padding:14px; margin-bottom:14px; border:1px solid var(--ks-line); background:#fff; }
.cierre-block-rend { border-left:4px solid #15803d; }
.cierre-block-fin  { border-left:4px solid #c9a44a; }
.cierre-block-title { font-size:14px; font-weight:800; color:var(--ks-ink); margin-bottom:10px; display:flex; align-items:baseline; gap:8px; }
.cierre-copybtn { margin-left:auto; align-self:center; font-family:inherit; font-size:10px; font-weight:700; letter-spacing:.4px; color:var(--ks-ink); background:#f4f5f7; border:1px solid #e2e5ea; border-radius:6px; padding:4px 9px; cursor:pointer; white-space:nowrap; }
.cierre-copybtn:hover { background:#e9ebee; }
.cierre-copybtn:active { transform:translateY(1px); }
.cierre-block-emoji { font-size:18px; }
.cierre-block-sub { font-size:10px; font-weight:500; color:#9ca3af; text-transform:lowercase; letter-spacing:.2px; margin-left:auto; }
.cierre-headergrid { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:10px; }
.cierre-headercard { padding:12px; border-radius:10px; text-align:center; background:#f7f8fa; border-left:3px solid #9ca3af; }
.cierre-headercard.ok   { border-left-color:#15803d; }
.cierre-headercard.pdte { border-left-color:#c9a44a; }
.cierre-headercard-label { font-size:9px; font-weight:700; color:#9ca3af; letter-spacing:1px; text-transform:uppercase; }
.cierre-headercard-val { font-size:22px; font-weight:800; color:var(--ks-ink); margin-top:4px; font-variant-numeric:tabular-nums; }
.cierre-headercard-sub { font-size:10px; color:#9ca3af; margin-top:2px; }
.cierre-headertotal { padding:12px; border-radius:10px; text-align:center; background:rgba(201,164,74,.08); border:1px solid rgba(201,164,74,.3); margin-bottom:12px; }
.cierre-headertotal-label { font-size:10px; font-weight:700; color:#9ca3af; letter-spacing:1px; text-transform:uppercase; }
.cierre-headertotal-val { font-size:26px; font-weight:800; color:var(--ks-ink); margin-top:2px; font-variant-numeric:tabular-nums; }
.cierre-headertotal-sub { font-size:11px; color:#9ca3af; margin-top:2px; }
.cierre-reconc { border:1px dashed #a78bfa; background:rgba(167,139,250,.04); border-radius:10px; padding:12px; margin-bottom:14px; }
.cierre-reconc-title { font-size:12px; font-weight:800; color:#5b21b6; display:flex; align-items:baseline; gap:8px; }
.cierre-reconc-diff { font-size:14px; font-weight:800; margin-left:auto; font-variant-numeric:tabular-nums; }
.cierre-reconc-sub { font-size:10px; color:#9ca3af; margin-top:4px; margin-bottom:8px; font-style:italic; }
.cierre-reconc-row { margin-top:8px; padding:8px; background:#fff; border-radius:6px; border:1px solid rgba(167,139,250,.2); }
.cierre-reconc-rowtitle { font-size:11px; color:var(--ks-ink); margin-bottom:4px; }
.cierre-reconc-line { font-size:10.5px; color:#666; padding:2px 0; }
.cierre-nombre { color:#6b7280; flex:1; }
.cierre-importe { font-weight:700; }
.cierre-metodo-icon { display:inline-block; width:8px; height:8px; border-radius:50%; margin-right:6px; }
.cierre-banner { background:#fff5e6; border:1px solid #d48a1a; color:#d48a1a; padding:8px 12px; border-radius:6px; font-size:12px; font-weight:600; margin-bottom:10px; grid-column:1/-1; }

/* ============================================================
   v1.1.87 — CAPA TÁCTIL (tablet)
   Estado "armado" tras pulsación larga. Se aplica también con
   ratón si alguna vez se dispara, pero solo lo activa el gesto
   táctil, así que en escritorio nunca aparece.
   ============================================================ */
.ks-appt.is-touch-armed { box-shadow: var(--ks-shadow-lg); outline: 2px solid #fff; outline-offset: -2px; transform: scale(1.03); z-index: 9; }
.ks-col.is-touch-armed { background: rgba(201, 164, 74, .10); outline: 2px dashed #c9a44a; outline-offset: -2px; }

@media (hover: none) {
  /* El 🕑 ajusta la hora de la fase sin arrastrar. Vivía solo en
     :hover → invisible con el dedo. Aquí permanente y más grande. */
  .ks-appt-timeadj { opacity: 1; width: 20px; height: 20px; font-size: 12px; top: 3px; right: 21px; background: rgba(0,0,0,.42); }

  /* Asa de resize: mismo aspecto, zona de impacto ampliada. */
  .ks-appt-resize { touch-action: none; }
  .ks-appt-resize::after { content: ''; position: absolute; left: -14px; right: -14px; top: -9px; bottom: -6px; }

  /* iOS abre el callout de selección al mantener pulsado si no se corta. */
  .ks-appt, .ks-col { -webkit-touch-callout: none; -webkit-user-select: none; user-select: none; }
}
`;

  class RecepcionProCMS extends HTMLElement {
    static get observedAttributes() { return ['response']; }

    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this._fecha = todayISO();
      this._servicios = [];
      this._porSetupUid = {};
      this._loading = true;
      this._role = 'todos';
      this._query = '';
      this._collapsed = {};            // {slug:true} colapsado
      this._detail = null;
      this._variantIdx = 0;
      this._complSel = {};
      this._cliente = null;
      this._clientesReady = false;
      this._buscarTimer = null;
      this._staff = [];
      this._reservas = [];
      this._armed = null;              // servicio armado para colocar
      // v1.1.81 — ARMADO MÚLTIPLE. `_armed` sigue siendo la línea que se
      // está colocando ahora (todo el render existente lo lee tal cual).
      // Las líneas siguientes esperan en `_armedQueue` y se añaden a la
      // MISMA cita con `agregar-servicio`, que es lo que ya hace el botón
      // "+ Servicio adicional" del modal: una fila, un total, un cobro,
      // un solo WhatsApp (la centralita solo la dispara crearPackReserva).
      this._armedQueue = [];           // líneas pendientes tras la actual
      this._armedStaffMode = 'same';   // 'same' = todo al mismo profesional
                                       // 'each' = elegir columna por servicio
      this._packReservaId = null;      // id de la cita en curso (líneas 2..N)
      this._packStaffId = null;        // columna donde se colocó la línea 1
      this._chainActivo = false;       // distingue cadena de armado del
                                       // "+ Servicio adicional" del modal
      this._pendingMove = null;        // {staffId, mins} destino de la línea
      this._moveQueue = [];            // movimientos de fase pendientes,
                                       // SIEMPRE secuenciales: wixData.update
                                       // reemplaza el documento entero y dos
                                       // moverFase en paralelo se pisarían.
      this._cantidad = 1;              // cantidad elegida en el popup
      this._chainMoving = false;       // reubicando fases de la cadena
      this._addSvcUid = '';            // "+ Servicio adicional": selección
      this._addSvcVarIdx = 0;
      this._addSvcComplSel = {};
      this._addCmpUid = '';            // "⛓ Complemento": selección
      this._addCmpVarIdx = 0;
      this._tiendaEsperandoCliente = false;  // alta de cliente desde TIENDA
      this._ventaTiendaActiva = false;       // el modal de venta viene de TIENDA
      this._ventaTiendaKey = '';             // sourceKey (bookingId) de la venta
      this._ventaTiendaTotal = 0;
      this._ventaDoc = null;                 // documento emitido de la venta
      this._ventaForm = false;               // form CIF/DNI abierto
      this._ventaGenerando = false;
      this._tiendaVatId = '';                // CIF/DNI capturado en TIENDA
      this._tiendaLegalName = '';            // razón social capturada en TIENDA
      this._reservando = false;
      this._pagando = false;
      this._modalReserva = null;
      this._disc = 0;
      this._canjeActivo = null;        // v1.1.50 — F4/F5 canje activo del modal de cobro
      this._productosCliente = null;   // v1.1.51 — F4/F5 { prime, bonos, tarjetas } del cliente
      // v1.1.53 — Columna lateral colapsable. Default según ancho de viewport:
      // < 1024px (móvil horizontal / tablet pequeña) → colapsada de inicio
      //          para que el calendario tenga el ancho completo.
      // ≥ 1024px (escritorio / mostrador) → expandida = comportamiento histórico.
      try {
        this._sidebarCollapsed = (typeof window !== 'undefined' && window.innerWidth > 0)
          ? window.innerWidth < 1024
          : false;
      } catch (_) { this._sidebarCollapsed = false; }
      this._catalogoRecibido = false;
      this._readyTimer = null;
      this._readyTries = 0;
      // v1.1.55 — retry loop independiente para staffData (mismo patrón que
      // _catalogoRecibido / _usersActivationRecibido). Sin esto, si la
      // primera respuesta 'staffData' cae en una ventana temporal mala, el
      // calendario se queda en el placeholder "Cargando agenda…" hasta que
      // se refresca la página manualmente.
      this._staffRecibido = false;
      this._staffTimer = null;
      this._staffTries = 0;
      this._blockDraft = null;         // {staffId, startMin, endMin}
      // v1.1.40 — this._customBlocks ELIMINADO. Los bloqueos persisten en
      // KamisuiteReservations con family='BLOQUEO' y se leen vía this._reservas.
      // v1.1.8 — settings + datepicker + cierre
      this._settings = { rowHeight: 56, titleMode: 'servicio', interval: 15, staffConfig: {} };
      this._settingsLoaded = false;
      this._saveSettingsTimer = null;
      this._dpYear = null;
      this._dpMonth = null;
      this._activeColorStaffId = null;
      this._cierreData = null;
      this._cierreLoading = false;
      // v1.1.63 — nombres del salón para las cabeceras del texto copiable
      // del informe del día. Los pide al montar (salonNombres → page code
      // → getSalonConfig). brandName para el bloque productivo, legalName
      // para el financiero.
      this._salonBrandName = '';
      this._salonLegalName = '';
      // ─── v1.1.45: capa de acceso / login por PIN (Shadow DOM) ───
      this._usersActivation = false;   // flag del salón: ¿login activo?
      this._usersActivationRecibido = false; // v1.1.46 — respuesta recibida (corta retry)
      this._loginVisible = false;      // overlay de login pintado
      this._loginStaff = [];           // tarjetas de empleado
      this._loginSel = null;           // empleado elegido (paso PIN)
      this._loginPin = '';             // PIN tecleado
      this._empleadoActivo = null;     // empleado logueado
      this._inactivityTimer = null;    // timeout 60s
      this._inactivityMs = 60000;      // v1.1.48 — duración configurable (SalonConfig.timeOut). Default 60s.
      this._loginActivityHandler = null;
      // v1.1.56 — Estado de facturación (módulo Ticket/Factura en cita PAGADA).
      // Todos se resetean en _openModal. Si el page code aún está en
      // v1.0.26 (sin los handlers de facturación), el modal de cita
      // PAGADA se queda mostrando los botones sin respuesta — no rompe
      // nada existente.
      this._facturaDoc = null;          // documento ya emitido {modo, invoiceNumber, pdfUrl, baseAmount, vatAmount, vatRate, totalAmount}
      this._facturaForm = false;        // ¿mostrando form inline para CIF?
      this._facturaFormVatId = '';      // valor input CIF (preserva entre repaints)
      this._facturaFormLegalName = '';  // valor input razón social
      this._facturaGenerando = false;   // pulsado Ticket o Factura, esperando respuesta
      this._pagoCita = null;            // datos pago {tipoPago, desglose...} para mostrar método
      // v1.1.71 — Apertura de caja (fondo inicial del día). Módulo opcional
      // gobernado por SalonConfig.arqueoActivo (lo decide el page code).
      this._aperturaChequeada = false;   // ¿ya se disparó check-apertura-caja?
      this._aperturaSaltadaFecha = null; // fecha para la que el operador saltó
      this._aperturaFondo = 0;           // importe editable del modal de apertura
    }

    connectedCallback() {
      if (!document.getElementById('kamisuite-font-rpcms')) {
        const link = document.createElement('link');
        link.id = 'kamisuite-font-rpcms';
        link.rel = 'stylesheet';
        link.href = 'https://fonts.googleapis.com/css2?family=Bai+Jamjuree:wght@300;400;500;600;700&display=swap';
        document.head.appendChild(link);
      }
      this._renderShell();
      this._updateSteps();
      // v1.1.66 — FIX "Catálogo Cargando" colgado. Si Wix desconecta+reconecta
      // el custom element (2º connectedCallback, habitual en Wix durante la
      // hidratación/relayout), _renderShell repinta el placeholder estático
      // "Cargando catálogo…", pero el catálogo YA llegó (_loading=false,
      // _servicios poblado) y el retry de 'ready' no re-dispara porque
      // _catalogoRecibido ya es true → el panel se queda colgado hasta tocar
      // un filtro. La agenda se rescata sola por el polling de 30s; el panel
      // no tiene rescate. Repintamos ambos con lo que ya haya en memoria:
      // en el 1er montaje _loading=true → _renderPanel muestra "Cargando…"
      // normal y _renderCalendar es no-op (aún sin staff); en la reconexión
      // pintan los datos reales al instante.
      this._renderPanel();
      this._renderCalendar();
      this._sendToPage('ready', {});
      this._sendToPage('get-settings', {});
      // v1.1.63 — pedir nombres del salón (brandName/legalName) para las
      // cabeceras del texto copiable del informe del día.
      this._sendToPage('salonNombres', {});
      // v1.1.45 — preguntar si el salón tiene la capa de acceso activa.
      // Si la tiene, el page code responderá 'usersActivation' y pintamos
      // el login scrim sobre todo hasta validar PIN.
      // v1.1.46 — se REENVÍA dentro del retry loop (igual que 'ready'): el
      // page code engancha su listener en onReady y, por la carrera de
      // tiempos en Wix, el primer envío puede caer antes de que el listener
      // exista (se perdía sin dejar rastro en logs). Se reintenta hasta
      // recibir la respuesta 'usersActivation'.
      this._sendToPage('usersActivation', {});
      // v1.1.49 — temporizador PROPIO e independiente para usersActivation,
      // separado del retry de 'ready'. Reenvía cada 600ms hasta recibir
      // respuesta o agotar 20 intentos. Con log en consola del navegador
      // para verificar que el dispatch ocurre. No depende de _catalogoRecibido.
      this._uaTries = 0;
      this._uaTimer = setInterval(() => {
        if (this._usersActivationRecibido || this._uaTries >= 20) {
          clearInterval(this._uaTimer); this._uaTimer = null; return;
        }
        this._uaTries++;
        console.log(`${TAG} → reintento usersActivation #${this._uaTries}`);
        this._sendToPage('usersActivation', {});
      }, 600);
      this._readyTimer = setInterval(() => {
        const fin = this._catalogoRecibido || this._readyTries >= 12;
        if (fin) { clearInterval(this._readyTimer); return; }
        this._readyTries++;
        this._sendToPage('ready', {});
      }, 700);

      // v1.1.55 — retry independiente para 'getStaff'. Idéntico patrón que
      // los retries de 'ready' y 'usersActivation'. Resuelve el síntoma
      // "Cargando agenda…" colgado en la primera carga: si la respuesta
      // 'staffData' inicial se pierde por carrera de tiempos en Wix
      // (listener del page code no enganchado todavía, o setAttribute
      // disparado antes del attributeChangedCallback armado), reenviamos
      // 'getStaff' cada 600ms hasta recibir respuesta o agotar 15 intentos.
      this._sendToPage('getStaff', {});
      this._staffTries = 0;
      this._staffTimer = setInterval(() => {
        if (this._staffRecibido || this._staffTries >= 15) {
          clearInterval(this._staffTimer); this._staffTimer = null; return;
        }
        this._staffTries++;
        console.log(`${TAG} → reintento getStaff #${this._staffTries}`);
        this._sendToPage('getStaff', {});
      }, 600);

      // v1.1.35 — Auto-refresh adaptativo de la agenda.
      // Polling cada 30s SOLO mientras la pestaña tiene foco (visible).
      // Pausa al ocultarse (otra pestaña, minimizado, móvil en background).
      // Query inmediata al volver a ser visible — el operador ve el estado
      // actualizado de un vistazo sin tener que pulsar ↻ ni navegar.
      // Multi-tenant: con 30 salones * 3 operadores * 8h, ahorra ~80% de
      // queries vs polling fijo cuando hay pestañas abiertas en background.
      this._startAutoRefresh();

      // v1.1.71 — Apertura de caja: pedir el check UNA vez y solo para HOY.
      // El page code decide (según SalonConfig.arqueoActivo) si responde con
      // una sugerencia de fondo ('caja-fondo-sugerido') o no hace nada
      // ('apertura-estado'). Fire-and-forget: nunca bloquea el montaje.
      this._maybeCheckApertura();

      console.log(`${TAG} Montado.`);
    }

    // ═══════════════════════════════════════════════════
    // v1.1.71 — APERTURA DE CAJA (fondo inicial del día)
    // ═══════════════════════════════════════════════════
    _maybeCheckApertura() {
      if (this._aperturaChequeada) return;
      if (this._fecha !== todayISO()) return;   // solo para HOY
      this._aperturaChequeada = true;
      this._sendToPage('check-apertura-caja', { fechaISO: this._fecha });
    }

    _onFondoSugerido(p) {
      // Guards: solo HOY, solo si no se ha saltado hoy, y sin otro modal
      // de caja/apertura ya abierto (no interrumpir un arqueo en curso).
      if (this._fecha !== todayISO()) return;
      if (this._aperturaSaltadaFecha === this._fecha) return;
      if (this.shadowRoot.getElementById('aperturaScrim')) return;
      if (this.shadowRoot.getElementById('cajaScrim')) return;
      this._openAperturaModal({
        fondoSugerido: Number(p.fondoSugerido || 0),
        origen: p.origen || 'cero',
        fechaOrigen: p.fechaOrigen || ''
      });
    }

    _onCajaAbierta(p) {
      if (p && p.ok) {
        const fondo = Number((p.registro && p.registro.openingBalance) || 0);
        this._toast(`Caja abierta ✓ · fondo ${fondo}€`);
        this._cerrarApertura();
        // Si el arqueo está abierto en este momento, refrescar para que el
        // "Fondo inicial" y el "Efectivo esperado" reflejen el nuevo fondo.
        this._cajaRefresh();
      } else {
        this._toast(`No se pudo abrir la caja${p && p.error ? ': ' + p.error : ''}`);
      }
    }

    _origenAperturaTexto(origen, fechaOrigen, fondo) {
      const eur = `${fondo || 0}€`;
      switch (origen) {
        case 'fondoFijo':
          return `Fondo fijo configurado para tu salón: <strong>${eur}</strong>.`;
        case 'cierreAyer':
          return `Efectivo contado al cerrar caja el <strong>${esc(fechaOrigen || 'día anterior')}</strong>: <strong>${eur}</strong>.`;
        case 'esperadoAyer':
          return `Último efectivo registrado el <strong>${esc(fechaOrigen || 'día anterior')}</strong>: <strong>${eur}</strong>.`;
        default:
          return `No hay historial previo de caja. Empezamos desde <strong>0€</strong> (edítalo si tu caja arranca con otro fondo).`;
      }
    }

    _openAperturaModal({ fondoSugerido, origen, fechaOrigen }) {
      const root = this.shadowRoot;
      root.getElementById('aperturaScrim')?.remove();
      this._aperturaFondo = Number(fondoSugerido || 0);

      const scrim = document.createElement('div');
      scrim.className = 'ks-modal-scrim';
      scrim.id = 'aperturaScrim';
      // La apertura es un acto consciente: NO se cierra al clicar fuera.
      // Solo "Saltar hoy" o "Confirmar apertura" cierran el modal.

      const modal = document.createElement('div');
      modal.className = 'ks-modal';
      modal.id = 'aperturaModal';
      modal.innerHTML = `
        <div class="ks-modal-head">
          <span class="ks-modal-staff">🌅 APERTURA DE CAJA</span>
          <span class="ks-modal-status pending">Nuevo día</span>
        </div>
        <div class="ks-modal-meta">${this._fecha}</div>
        <p class="ks-detail-note">${this._origenAperturaTexto(origen, fechaOrigen, this._aperturaFondo)}</p>
        <div class="ks-disc-row">
          <span class="ks-disc-lbl">💶 Fondo inicial</span>
          <div class="ks-disc-input"><input id="aperturaInput" type="number" min="0" step="0.01" value="${this._aperturaFondo || ''}" placeholder="0"><span>€</span></div>
        </div>
        <div class="ks-modal-pays" style="margin-top:12px">
          <button class="ks-pay" id="aperturaSaltar" style="flex:1;background:#fff;color:var(--ks-ink);border:1px solid var(--ks-line)">Saltar hoy</button>
          <button class="ks-pay pay-efectivo" id="aperturaConfirm" style="flex:1">Confirmar apertura</button>
        </div>`;
      scrim.appendChild(modal);
      root.appendChild(scrim);

      const inp = modal.querySelector('#aperturaInput');
      inp?.addEventListener('input', e => { this._aperturaFondo = parseFloat(e.target.value) || 0; });
      modal.querySelector('#aperturaSaltar')?.addEventListener('click', () => {
        this._aperturaSaltadaFecha = this._fecha;
        this._cerrarApertura();
      });
      modal.querySelector('#aperturaConfirm')?.addEventListener('click', () => {
        this._sendToPage('caja-abrir', { fechaISO: this._fecha, openingBalance: this._aperturaFondo });
      });
      setTimeout(() => { try { inp?.focus(); inp?.select(); } catch (_) {} }, 60);
    }

    _cerrarApertura() {
      this.shadowRoot.getElementById('aperturaScrim')?.remove();
    }

    // v1.1.35 — Polling adaptativo
    _startAutoRefresh() {
      if (this._autoRefreshStarted) return;
      this._autoRefreshStarted = true;
      const REFRESH_MS = 30000; // 30 segundos

      const tickIfVisible = () => {
        // Solo refresca si la pestaña es visible y ya tenemos fecha cargada
        if (document.visibilityState !== 'visible') return;
        if (!this._fecha) return;
        // No molesta si hay un modal abierto en medio del cobro, etc.
        // El page code de todos modos ignora mensajes duplicados rápidos.
        this._sendToPage('getReservas', { fecha: this._fecha });
      };

      const startInterval = () => {
        if (this._refreshInterval) return;
        this._refreshInterval = setInterval(tickIfVisible, REFRESH_MS);
      };
      const stopInterval = () => {
        if (this._refreshInterval) {
          clearInterval(this._refreshInterval);
          this._refreshInterval = null;
        }
      };

      // Listener de cambios de visibilidad
      this._visibilityHandler = () => {
        if (document.visibilityState === 'visible') {
          // Volvió a primer plano → query inmediata + arrancar polling
          tickIfVisible();
          startInterval();
        } else {
          // Se fue a background → para el polling, ahorra queries
          stopInterval();
        }
      };
      document.addEventListener('visibilitychange', this._visibilityHandler);

      // Si arrancamos visible, ya iniciamos el interval
      if (document.visibilityState === 'visible') startInterval();
    }

    _stopAutoRefresh() {
      if (this._refreshInterval) { clearInterval(this._refreshInterval); this._refreshInterval = null; }
      if (this._visibilityHandler) {
        document.removeEventListener('visibilitychange', this._visibilityHandler);
        this._visibilityHandler = null;
      }
      this._autoRefreshStarted = false;
    }

    disconnectedCallback() {
      // v1.1.35 — Cleanup correcto para no dejar timers ni listeners zombi
      // si el custom element se elimina del DOM (cambios de página en Wix,
      // hot reload del editor, etc.).
      this._stopAutoRefresh();
      if (this._readyTimer) { clearInterval(this._readyTimer); this._readyTimer = null; }
      if (this._uaTimer) { clearInterval(this._uaTimer); this._uaTimer = null; }  // v1.1.49
      if (this._staffTimer) { clearInterval(this._staffTimer); this._staffTimer = null; }  // v1.1.55
      // v1.1.45 — limpiar capa de acceso (timer + listeners de actividad)
      this._clearInactivity();
      this._detachLoginActivity();
    }

    attributeChangedCallback(name, oldVal, newVal) {
      if (name !== 'response' || !newVal || oldVal === newVal) return;
      let p; try { p = JSON.parse(newVal); } catch (e) { return; }
      this._handleResponse(p);
    }

    _sendToPage(type, data = {}) {
      this.dispatchEvent(new CustomEvent('recepcion-message', { detail: { type, ...data }, bubbles: true, composed: true }));
    }

    // ═══════════════════════════════════════════════════
    // RESPUESTAS DEL BACKEND
    // ═══════════════════════════════════════════════════
    _handleResponse(p) {
      switch (p.type) {
        case 'catalogoData':
          this._catalogoRecibido = true;
          if (this._readyTimer) clearInterval(this._readyTimer);
          this._loading = false;
          if (p.ok) {
            this._servicios = p.servicios || [];
            this._porSetupUid = {};
            for (const s of this._servicios) if (s.setupUid) this._porSetupUid[s.setupUid] = s;
            this._renderPanel();
            this._sendToPage('getReservas', { fecha: this._fecha });
          } else { this._renderPanel(); this._toast('Error cargando catálogo'); }
          // v1.1.23 — quitar spinning del botón recargar catálogo
          {
            const cb = this.shadowRoot.getElementById('catReload');
            if (cb) cb.classList.remove('spinning');
          }
          break;
        case 'staffData':
          // v1.1.55 — confirmar recepción y parar retry independiente.
          this._staffRecibido = true;
          if (this._staffTimer) { clearInterval(this._staffTimer); this._staffTimer = null; }
          if (p.ok) {
            this._staff = (p.staff || []).map((s, i) => ({ ...s, color: STAFF_COLORS[i % STAFF_COLORS.length] }));
            this._initStaffConfig();
            this._renderCalendar();
            // v1.1.42 — re-pedir settings con el staff ya cargado, para que
            // los colores/posiciones persistidos se apliquen sin depender del
            // orden de llegada staff/settings.
            this._sendToPage('get-settings', {});
          }
          break;
        case 'reservasData':
          if (p.ok) { this._reservas = p.reservas || []; this._renderCalendar(); this._updateStats(); }
          // v1.1.35 — Quitar spinning del botón ↻ si estaba activo
          this.shadowRoot.getElementById('btnReload')?.classList.remove('is-spinning');
          if (this._reloadSpinTimer) { clearTimeout(this._reloadSpinTimer); this._reloadSpinTimer = null; }
          break;
        case 'reservaCreada':
          this._reservando = false;
          if (p.ok) {
            // v1.1.81 — ¿quedan líneas del armado múltiple? Entonces esta
            // reserva es la cita CONTENEDORA y el resto de servicios se
            // añaden dentro de ella (un total, un cobro, un WhatsApp).
            if (this._armedQueue.length && p.reservaId) {
              this._packReservaId = p.reservaId;
              this._chainActivo = true;
              this._armed = this._armedQueue.shift();
              this._renderArmedHint();
              if (this._armedStaffMode === 'same') {
                this._reservando = true;
                this._enviarAgregarServicio(this._armed, null);
              } else {
                this._toast(`Cita creada · elige columna para ${this._armed.servicio.label}`);
                this._sendToPage('getReservas', { fecha: this._fecha });
              }
              break;
            }
            this._toast(`Reserva creada · ${p.precioTotal}€`);
            this._desarmar();
            this._sendToPage('getReservas', { fecha: this._fecha });
          } else this._toast('Error: ' + (p.error?.message || 'no se pudo crear'));
          break;
        case 'reservaPagada':
          this._pagando = false;
          if (p.ok) {
            this._toast(p.yaEstabaPagado ? 'Ya estaba cobrada' : 'Cobro registrado ✓');
            // v1.1.50 — F4/F5: si había canje pendiente de confirmar
            // (capturado en _pagar antes del cobro), dispararlo ahora.
            // Idempotente en backend: doble envío no descuenta dos usos.
            // NO bloqueante para el cierre del modal: si el confirmarCanje
            // falla, el cobro YA está hecho; el operador recibirá toast con
            // el aviso para reintentar manualmente desde el caso edge.
            if (this._canjePendienteConfirmar && this._canjePendienteConfirmar.codigoProducto) {
              const c = this._canjePendienteConfirmar;
              this._canjePendienteConfirmar = null;
              this._sendToPage('confirmarCanje', {
                reservaId: c.reservaId,
                codigoProducto: c.codigoProducto,
                staff: c.staff || '',
                activationMethod: 'manual'
              });
            }
            this._closeModal();
            this._sendToPage('getReservas', { fecha: this._fecha });
          } else { this._toast('Error: ' + (p.error?.message || 'no se pudo cobrar')); this.shadowRoot.querySelectorAll('.ks-pay').forEach(b => b.disabled = false); }
          break;
        // v1.1.50 — F4/F5 Productos Custom
        case 'canjeAplicado':
          this._canjeAplicando = false;
          if (p.ok) {
            // Guardar estado del canje. _renderModal repintará todo
            // incorporando el ahorro al TOTAL y mostrando el token en
            // el bloque canjeBox.
            this._canjeActivo = {
              tipo: p.tipo,
              codigo: p.codigo,
              ahorro: Number(p.ahorro) || 0,
              descripcionToken: p.descripcionToken || '',
              serviceLabel: p.serviceLabel || '',
              precioLinea: Number(p.precioLinea) || 0,
              descuentoPct: Number(p.descuentoPct) || 0,
              precioPromo: Number(p.precioPromo) || 0,
              voucherId: p.voucherId || '',
              promoCardId: p.promoCardId || ''
            };
            this._toast(`Canje aplicado · -${(p.ahorro || 0).toFixed(2)}€`);
            this._renderModal();
          } else {
            // Re-pinta el bloque para devolver el botón a estado "Aplicar"
            this._renderCanjeBox();
            this._toast('Error: ' + (p.error?.message || 'no se pudo aplicar'));
          }
          break;
        case 'canjeConfirmado':
          // El cobro ya está cerrado a estas alturas. Si falla, mostramos
          // warning para que el operador sepa que el bono/tarjeta no se
          // marcó como canjeado en el CMS (caso edge: incidencia para
          // soporte). El cobro de la cita en sí NO se ve afectado.
          if (!p.ok) {
            this._toast('⚠ Canje aplicado al cobro pero no marcado en CMS: ' + (p.error?.message || 'error desconocido'));
          }
          break;
        // v1.1.51 — F4/F5 auto-detección bonos/tarjetas del cliente
        case 'productosCustomCliente':
          if (p.ok) {
            this._productosCliente = {
              prime: p.prime || null,
              bonos: Array.isArray(p.bonos) ? p.bonos : [],
              tarjetas: Array.isArray(p.tarjetas) ? p.tarjetas : []
            };
            // Solo re-pintar el bloque (no todo el modal) y solo si el
            // modal sigue abierto sobre la misma reserva del cliente.
            // _renderCanjeBox sabe leer this._productosCliente y elegir
            // el estado correcto.
            if (this._modalReserva) this._renderCanjeBox();
          } else {
            // Silencioso: si falla la consulta, el bloque cae al input
            // manual; no hay nada que mostrar al operador.
            this._productosCliente = { prime: null, bonos: [], tarjetas: [] };
            if (this._modalReserva) this._renderCanjeBox();
          }
          break;
        case 'reservaCancelada':
          if (p.ok) { this._toast('Cita cancelada'); this._closeModal(); this._sendToPage('getReservas', { fecha: this._fecha }); }
          else this._toast('Error al cancelar');
          break;
        // v1.1.40 — bloqueos persistentes
        case 'bloqueoCreado':
          if (p.ok) {
            this._toast(`Bloqueo creado · ${esc(p.motivo || 'Bloqueado')}`);
            this._sendToPage('getReservas', { fecha: this._fecha });
          } else {
            this._toast('Error al crear bloqueo: ' + (p.error?.message || p.error || 'desconocido'));
          }
          break;
        case 'bloqueoEliminado':
          if (p.ok) {
            this._toast('Bloqueo eliminado');
            this._sendToPage('getReservas', { fecha: this._fecha });
          } else {
            this._toast('Error al eliminar bloqueo: ' + (p.error?.message || p.error || 'desconocido'));
          }
          break;
        case 'bloqueoActualizado':
          if (p.ok) {
            this._toast(`Bloqueo actualizado · ${esc(p.motivo || '')}`);
            this._sendToPage('getReservas', { fecha: this._fecha });
          } else {
            this._toast('Error al actualizar bloqueo: ' + (p.error?.message || p.error || 'desconocido'));
          }
          break;
        case 'extension-actualizada':
          if (p.ok) {
            this._toast(p.extensionMin > 0 ? `Extensión: +${p.extensionMin} min` : 'Extensión quitada');
            this._sendToPage('getReservas', { fecha: this._fecha });
          } else {
            this._toast('Error: ' + (p.error || 'no se pudo extender'));
          }
          break;
        // v1.1.16 — respuestas "antes de cobrar"
        case 'reserva-reprogramada':
          if (p.ok) { this._toast('Cita reprogramada'); this._closeSubModal(); this._closeModal(); this._sendToPage('getReservas', { fecha: this._fecha }); }
          else this._toast('Error: ' + (p.error || 'no se pudo reprogramar'));
          break;
        case 'fase-movida':
          // v1.1.81 — si la cadena del armado está reubicando las fases del
          // servicio recién añadido, encadenar el siguiente movimiento antes
          // de nada. Van de uno en uno a propósito (ver _enviarSiguienteMovimiento).
          if (this._chainActivo && this._chainMoving) {
            if (!p.ok) this._toast('Aviso: no se pudo colocar una fase (' + (p.error || '') + ')');
            if (this._moveQueue.length) { this._enviarSiguienteMovimiento(); break; }
            this._chainMoving = false;
            this._avanzarCadena();
            break;
          }
          // v1.1.29 — drag&drop por fase
          if (p.ok) { this._toast('Fase movida ✓'); this._sendToPage('getReservas', { fecha: this._fecha }); }
          else this._toast('Error: ' + (p.error || 'no se pudo mover la fase'));
          break;
        case 'fase-redimensionada':
          // v1.1.65 — redimensionar duración de fase (empuja las posteriores)
          if (p.ok) { this._toast('Duración ajustada ✓'); this._sendToPage('getReservas', { fecha: this._fecha }); }
          else this._toast('Error: ' + (p.error || 'no se pudo ajustar la duración'));
          break;
        case 'extra-agregado':
          if (p.ok) { this._toast(`Extra añadido (+${p.precioTotal}€ total)`); this._closeSubModal(); this._closeModal(); this._sendToPage('getReservas', { fecha: this._fecha }); }
          else this._toast('Error: ' + (p.error || 'no se pudo añadir extra'));
          break;
        case 'complemento-agregado':
          if (p.ok) { this._toast(`Complemento añadido: ${p.label}`); this._closeSubModal(); this._closeModal(); this._sendToPage('getReservas', { fecha: this._fecha }); }
          else {
            this._toast('Error: ' + (p.error || 'no se pudo añadir complemento'));
            // v1.1.83 — rehabilitar el botón para poder reintentar sin cerrar.
            const bCmp = this.shadowRoot.getElementById('cmOk');
            if (bCmp) bCmp.disabled = false;
          }
          break;
        case 'servicio-agregado':
          // v1.1.81 — dos orígenes posibles para esta respuesta:
          //   · cadena del armado múltiple (_chainActivo) → seguir la cadena
          //   · botón "+ Servicio adicional" del modal → comportamiento v1.1.30
          if (this._chainActivo) {
            this._reservando = false;
            if (!p.ok) {
              // La cita creada NO se toca: se corta la cadena y se avisa de
              // qué servicio ha fallado, con el motivo del backend.
              this._toast('Error añadiendo servicio: ' + (p.error || 'desconocido'));
              this._desarmar();
              this._sendToPage('getReservas', { fecha: this._fecha });
              break;
            }
            {
              const mv = this._pendingMove;
              this._pendingMove = null;
              if (mv) this._prepararMovimientos(p.fasesNuevas, mv);
            }
            if (this._moveQueue.length) { this._enviarSiguienteMovimiento(); break; }
            this._avanzarCadena();
            break;
          }
          // v1.1.30 — + Servicio adicional
          if (p.ok) { this._toast(`Servicio añadido: ${p.label} (+${p.precio}€)`); this._closeSubModal(); this._closeModal(); this._sendToPage('getReservas', { fecha: this._fecha }); }
          else {
            this._toast('Error: ' + (p.error || 'no se pudo añadir servicio'));
            // v1.1.81 — reactivar el botón: antes quedaba deshabilitado tras
            // un error y había que cerrar el modal para reintentar.
            const bAdd = this.shadowRoot.getElementById('svOk');
            if (bAdd) bAdd.disabled = false;
          }
          break;
        // v1.1.85 — documentos de la venta de TIENDA
        case 'ticketVentaGenerado':
        case 'facturaVentaGenerada': {
          this._ventaGenerando = false;
          if (p.ok) {
            this._ventaDoc = {
              modo: p.modo || (p.type === 'ticketVentaGenerado' ? 'ticket' : 'factura'),
              invoiceNumber: p.invoiceNumber || '',
              pdfUrl: p.pdfUrl || ''
            };
            this._toast(p.duplicado ? 'Esta venta ya tenía documento' : `Documento emitido · ${p.invoiceNumber || ''}`);
          } else {
            this._toast('Error: ' + (p.error?.message || p.error || 'no se pudo emitir'));
          }
          this._renderVentaDocPanel();
          break;
        }
        case 'documentoVenta':
          if (p.ok && p.existe && p.documento) {
            this._ventaDoc = {
              modo: p.documento.modo,
              invoiceNumber: p.documento.invoiceNumber || '',
              pdfUrl: p.documento.pdfUrl || ''
            };
            this._renderVentaDocPanel();
          }
          break;
        case 'producto-agregado':
          // v1.1.16 legacy — ya no se usa, mantenemos por compatibilidad
          break;
        case 'productos-venta-result':
          if (p.ok) {
            this._toast('Venta de productos registrada ✓');
            // v1.1.85 — venta desde TIENDA: el modal se queda abierto para
            // emitir ticket o factura. La clave del documento es el orderId,
            // que es el bookingId con el que el cobro entra en
            // PaymentReservations.
            if (this._ventaTiendaActiva) {
              const pl = p.payload || {};
              this._ventaTiendaKey = String(pl.orderId || '');
              this._ventaTiendaTotal = Number(pl.total) || 0;
              this._ventaDoc = null;
              this._ventaForm = false;
              this._ventaGenerando = false;
              this._renderVentaDocPanel();
              break;
            }
            this._closeProductoModal();
            this._closeModal();
            this._sendToPage('getReservas', { fecha: this._fecha });
          } else {
            this._toast('Error: ' + (p.error || 'no se pudo vender'));
            // Reactivar el botón
            const btn = this.shadowRoot.getElementById('pdConfirm');
            if (btn) { btn.disabled = false; btn.textContent = 'REGISTRAR VENTA'; }
          }
          break;
        case 'productos-cargados':
          this._renderProductosModal(p.productos || []);
          break;
        case 'item-quitado':
          if (p.ok) {
            this._toast(`Quitado · -${p.subtotalRemoved}€`);
            this._closeModal();
            this._sendToPage('getReservas', { fecha: this._fecha });
          } else {
            this._toast('Error: ' + (p.error || 'no se pudo quitar'));
            // Reactivar los botones ✕ del modal
            this.shadowRoot.querySelectorAll('.ks-item-rm').forEach(b => b.disabled = false);
          }
          break;
        case 'clientesLoading': { const b = this.shadowRoot.getElementById('cliBuscar'); if (b) b.placeholder = p.message || 'Cargando…'; break; }
        case 'clientesReady': {
          this._clientesReady = true;
          const b = this.shadowRoot.getElementById('cliBuscar');
          if (b) { b.placeholder = `Buscar entre ${p.total || '?'} clientes…`; b.disabled = false; }
          break;
        }
        case 'clientesEncontrados': this._renderCliResults(p.clientes || []); break;
        // v1.1.69 — ESPECIALES (venta manual)
        case 'espClientesEncontrados': this._renderEspCli(p.clientes || []); break;
        case 'ftClientesEncontrados': this._renderFtCli(p.clientes || []); break;
        case 'fichaTecnicaData':      this._onFichaTecnica(p); break;
        case 'espClienteCreado': this._onEspClienteCreado(p.data); break;
        // v1.1.76 — ALMACÉN
        case 'almacenData':     this._onAlmData(p); break;
        case 'almacenAccion':   this._onAlmAccion(p); break;
        case 'especialesData': this._onEspData(p); break;
        case 'bonoEmitido': this._onEspEmitido('bono', p.data); break;
        case 'primeEmitido': this._onEspEmitido('prime', p.data); break;
        case 'tarjetaEmitido': this._onEspEmitido('tarjeta', p.data); break;
        case 'clienteCreado': {
          const r = p.data || {};
          if (r.ok && r.cliente) {
            this._closeBlankForm();
            this._seleccionarCliente(r.cliente);
            this._toast('Cliente creado');
            // v1.1.84 — si el alta venía del botón TIENDA, encadenar la venta.
            if (this._tiendaEsperandoCliente) {
              this._tiendaEsperandoCliente = false;
              this._abrirVentaTienda();
            }
          } else {
            this._toast('Error: ' + (r.error?.message || 'no se pudo crear'));
            if (this._tiendaEsperandoCliente) {
              this._tiendaEsperandoCliente = false;
              const bTd = this.shadowRoot.getElementById('tdOk');
              if (bTd) bTd.disabled = false;
            }
          }
          break;
        }
        // v1.1.33 — Respuesta al editar contacto.
        case 'contactoEditado': {
          const data = p.data || {};
          if (data.ok && data.cliente) {
            this._cliente = {
              contactId: data.cliente.contactId,
              nombre: data.cliente.nombreCompleto || `${data.cliente.nombre || ''} ${data.cliente.apellido || ''}`.trim(),
              telefono: data.cliente.telefono || '',
              email: data.cliente.email || '',
              esProvisional: false
            };
            this._closeBlankForm();
            this._renderClienteSelected();
            this._toast('Cliente actualizado ✓');
          } else {
            this._toast('Error al editar: ' + (data.error?.message || 'desconocido'));
          }
          break;
        }
        case 'error': this._toast(p.message || 'Error'); break;
        case 'caja-data':
          this._cajaData = p.data || {};
          this._renderCajaBody();
          break;
        case 'caja-guardada':
          if (p.ok) { this._toast(`Arqueo guardado · dif ${p.diferencia}€`); this._cajaRefresh(); }
          else this._toast('Error: ' + (p.error || 'no se pudo guardar'));
          break;
        case 'caja-cerrada':
          if (p.ok) { this._toast('Caja cerrada ✓'); this._cajaRefresh(); }
          else this._toast('Error: ' + (p.error || 'no se pudo cerrar'));
          break;
        case 'caja-movimiento-ok':
          if (p.ok) { this._toast('Movimiento registrado'); this._cajaRefresh(); }
          else this._toast('Error: ' + (p.error || 'movimiento'));
          break;
        case 'settings-data':
          if (p.settings) {
            this._settings = { ...this._settings, ...p.settings };
            if (this._staff && this._staff.length) this._initStaffConfig();
          }
          this._settingsLoaded = true;
          this._renderCalendar();
          break;
        case 'cierre-data':
          // v1.1.20 — Sólo aceptar la respuesta si corresponde al día que
          // se está visualizando. Si llega tarde (porque el usuario cambió
          // de día mientras cargaba), se descarta.
          if (p.fecha && p.fecha !== this._fecha) {
            this._cierreLoading = false;
            break;
          }
          this._cierreData = p.data || null;
          this._cierreFecha = p.fecha || this._fecha;
          this._cierreLoading = false;
          this._renderCierre();
          // v1.1.22 — quitar spinning del botón recargar tras llegar respuesta
          {
            const recBtn = this.shadowRoot.getElementById('btnRecargarCierre');
            if (recBtn) recBtn.classList.remove('spinning');
          }
          break;
        case 'servicio-medida-ok':
        case 'servicio-medida-creado':
          if (p.ok) {
            this._toast(`Cita "a medida" creada · ${p.precioTotal || ''}€`.replace(/ · €$/, ''));
            this._closeBlankForm();
            this._sendToPage('getReservas', { fecha: this._fecha });
          } else {
            this._toast('Error: ' + (p.error?.message || p.error || 'no se pudo crear'));
            const btn = this.shadowRoot.querySelector('#blankScrim #bsave');
            if (btn) { btn.textContent = 'Crear cita'; btn.disabled = false; }
          }
          break;
        case 'pago-encontrado':
          if (p.ok && p.pago) {
            // v1.1.56 — capturar tipoPago + desglose para pintar la línea
            // "💳 Método de cobro" del modal. Esto NO sustituye al chip de
            // descuento existente; ambos conviven.
            this._pagoCita = {
              tipoPago: p.pago.tipoPago || '',
              desglose: p.pago.desglosemetodopago || '',
              importeTotal: Number(p.pago.importeTotal || 0)
            };
            if (this._modalReserva) this._renderMetodoCobroLine();
            // Chip de descuento (v1.1.11 — comportamiento original)
            const desc = String(p.pago.descripcion || '');
            const m = desc.match(/🏷️?\s*Descuento\s*-(\d+(?:[.,]\d+)?)\s*%\s*\(-\s*(\d+(?:[.,]\d+)?)\s*€\)/);
            if (m && this._modalReserva && this._pagoChipReservaId === this._modalReserva._id) {
              const pct = parseFloat(m[1].replace(',', '.')) || 0;
              const eurv = parseFloat(m[2].replace(',', '.')) || 0;
              const importeNeto = Number(p.pago.importeTotal || 0);
              this._renderDescuentoChipPagado(pct, eurv, importeNeto);
            }
          }
          break;
        // v1.1.56 — Facturación: documento existente, ticket nuevo, factura nueva
        case 'documentoCita':
          if (p.ok && p.existe && p.documento) {
            this._facturaDoc = {
              modo: p.documento.modo || '',
              invoiceNumber: p.documento.invoiceNumber || '',
              pdfUrl: p.documento.pdfUrl || '',
              totalAmount: Number(p.documento.totalAmount || 0)
            };
          } else {
            this._facturaDoc = null;
          }
          if (this._modalReserva) this._renderFacturaSlot();
          break;
        case 'ticketGenerado':
        case 'facturaGenerada':
          this._facturaGenerando = false;
          if (p.ok) {
            this._facturaDoc = {
              modo: p.modo || (p.type === 'ticketGenerado' ? 'ticket' : 'factura'),
              invoiceNumber: p.invoiceNumber || '',
              pdfUrl: p.pdfUrl || '',
              totalAmount: Number(p.totalAmount || 0)
            };
            this._facturaForm = false;
            if (p.duplicado) {
              this._toast(`Documento ${this._facturaDoc.invoiceNumber} ya existía · recuperado`);
            } else if (p.rectifica && p.rectifica.invoiceNumber) {
              // v1.1.57: upgrade ticket→factura
              this._toast(`Factura ${this._facturaDoc.invoiceNumber} emitida · reemplaza al ticket ${p.rectifica.invoiceNumber} ✓`);
            } else {
              this._toast(`${this._facturaDoc.modo === 'factura' ? 'Factura' : 'Ticket'} ${this._facturaDoc.invoiceNumber} emitido ✓`);
            }
          } else {
            this._toast('Error: ' + (p.error?.message || p.error || 'no se pudo emitir'));
          }
          if (this._modalReserva) this._renderFacturaSlot();
          break;
        // ─── v1.1.63: nombres del salón para el texto copiable ───
        case 'salonNombres':
          this._salonBrandName = p.brandName || '';
          this._salonLegalName = p.legalName || '';
          break;
        // ─── v1.1.45: capa de acceso ───
        case 'usersActivation':
          this._usersActivationRecibido = true;   // v1.1.46 — detiene el retry
          if (this._uaTimer) { clearInterval(this._uaTimer); this._uaTimer = null; }  // v1.1.49
          this._usersActivation = !!p.usersActivation;
          // v1.1.48 — duración del timeout de inactividad desde SalonConfig.
          // El backend manda timeOut en SEGUNDOS (>0) o null. Si viene válido
          // se aplica (×1000 → ms); si no, se mantiene el default (60s).
          {
            const segs = Number(p.timeOut);
            if (Number.isFinite(segs) && segs > 0) this._inactivityMs = segs * 1000;
          }
          if (this._usersActivation && !this._empleadoActivo) {
            // Login activo y nadie identificado → pintar overlay y pedir staff.
            this._mostrarLogin();
          }
          break;
        case 'staffLogin':
          this._loginStaff = Array.isArray(p.staff) ? p.staff : [];
          if (this._loginVisible && !this._loginSel) this._renderLogin();
          break;
        case 'pinValidated':
          this._onPinValidated(p);
          break;
        // ─── v1.1.71: apertura de caja (fondo inicial del día) ───
        case 'caja-fondo-sugerido':
          this._onFondoSugerido(p);
          break;
        case 'caja-abierta':
          this._onCajaAbierta(p);
          break;
        case 'apertura-estado':
          // Informativo: módulo inactivo, o ya hay caja hoy. Nada que pintar.
          break;
        // v1.1.73 — fondo inicial forzado desde el arqueo
        case 'caja-fondo-guardado':
          if (p && p.ok) {
            this._toast(`Fondo inicial forzado: ${Number((p.registro && p.registro.openingBalance) || 0)}€`);
            this._cajaRefresh();
          } else {
            this._toast(`No se pudo forzar el fondo${p && p.error ? ': ' + p.error : ''}`);
          }
          break;
        default: break;
      }
    }

    // ═══════════════════════════════════════════════════
    // SHELL
    // ═══════════════════════════════════════════════════
    _renderShell() {
      this.shadowRoot.innerHTML = `
        <style>${STYLES}</style>
        <div class="ks-app">
          ${this._topbarHTML()}
          <div class="ks-stage">
            <aside class="ks-aside">
              <div class="ks-panel">
                <div class="ks-panel-clienthead">
                  <span class="ks-eyebrow">Cliente</span>
                  <div class="ks-clientsearch">
                    <span class="ks-search-ico">⌕</span>
                    <input id="cliBuscar" placeholder="Cargando clientes…" disabled autocomplete="off" />
                    <button class="ks-search-clr" id="cliClear" style="display:none">✕</button>
                  </div>
                  <div id="cliResultsWrap" style="position:relative"></div>
                  <div id="cliSelected"></div>
                  <button class="ks-newclient" id="cliNew">+ Cliente nuevo</button>
                  <button class="ks-newclient" id="cliProv" style="margin-top:6px;background:transparent;border-style:dashed;color:#7a7f8b">+ Cliente provisional</button>
                </div>
                <div class="ks-panel-svchead">
                  <div class="ks-svchead-row">
                    <span class="ks-eyebrow">Servicios</span>
                    <div class="ks-catstatus" id="catstatus"><span class="ks-syncdot loading"></span><span class="ks-catsrc">ServiceCatalog</span><span class="ks-catsep">·</span><span>sincronizando…</span></div>
                  </div>
                  <div class="ks-search"><span class="ks-search-ico">⌕</span><input id="svcSearch" placeholder="Buscar servicio…"><button class="ks-search-clr" id="svcClear" style="display:none">✕</button></div>
                  <div class="ks-svchead-tools">
                    <div class="ks-rolefilter">
                      <button class="ks-rolebtn active" data-role="todos">Todos</button>
                      <button class="ks-rolebtn" data-role="principal">Principales</button>
                      <button class="ks-rolebtn" data-role="complemento">Complementos</button>
                    </div>
                    <button class="ks-collapseall" id="collapseAll" title="Expandir/contraer">⊞</button>
                  </div>
                  <button class="ks-blankbtn" id="blankBtn">＋ Servicio a medida</button>
                </div>
                <div class="ks-panel-scroll" id="panelscroll"><div class="ks-empty">Cargando catálogo…</div></div>
                <div class="ks-panel-foot"><button class="ks-blockbtn" id="blockHint">⤡ Arrastra en el calendario para bloquear</button></div>
              </div>
            </aside>
            <main class="ks-main">
              <!-- v1.1.53 — botón colapsar/expandir columna lateral -->
              <button class="ks-aside-toggle" id="asideToggle" title="Mostrar / ocultar columna de servicios" aria-label="Mostrar u ocultar columna de servicios">⇤</button>
              <div class="ks-caltoolbar">
                <div class="ks-flowsteps-top">
                  <span class="ks-flowstep is-now" id="step1">1 · Cliente</span>
                  <span class="ks-flowarrow">→</span>
                  <span class="ks-flowstep" id="step2">2 · Servicio</span>
                  <span class="ks-flowarrow">→</span>
                  <span class="ks-flowstep" id="step3">3 · Staff</span>
                  <span class="ks-flowarrow">→</span>
                  <span class="ks-flowstep" id="step4">4 · Hora</span>
                </div>
                <div class="ks-legendgroup ks-legendgroup-end" id="armedHint"></div>
              </div>
              <div class="ks-main-scroll" id="calWrap"><div class="ks-empty">Cargando agenda…</div></div>
              <div class="cierre-panel" id="cierrePanel">
                <div class="cierre-header"><span class="cierre-title">📊 Informe del día</span><div style="display:flex;align-items:center;gap:4px;"><button class="cierre-close" id="btnRecargarCierre" title="Recargar informe">🔄</button><button class="cierre-close" id="btnCerrarCierre">✕</button></div></div>
                <div class="cierre-grid" id="cierreGrid"></div>
              </div>
            </main>
          </div>
          <div class="settings-overlay" id="settingsOverlay"></div>
          <div class="settings-panel" id="settingsPanel">
            <div class="settings-header">
              <span class="settings-title">Ajustes</span>
              <div style="display:flex;gap:4px;">
                <button class="settings-reset" id="btnResetSettings">Restablecer</button>
                <button class="settings-close" id="btnCloseSettings">✕</button>
              </div>
            </div>
            <div class="settings-body">
              <div class="settings-section">
                <div class="settings-section-title">Espaciado</div>
                <div class="slider-row"><label>Compacto</label><input type="range" id="sliderSpacing" min="24" max="160" value="56"><label>Amplio</label></div>
              </div>
              <div class="settings-section">
                <div class="settings-section-title">Título cita</div>
                <div class="option-group">
                  <label class="option-item"><input type="radio" name="titleMode" value="servicio" checked>Servicio</label>
                  <label class="option-item"><input type="radio" name="titleMode" value="cliente">Cliente</label>
                </div>
              </div>
              <div class="settings-section">
                <div class="settings-section-title">Intervalo</div>
                <div class="option-group">
                  <label class="option-item"><input type="radio" name="interval" value="30">30 min</label>
                  <label class="option-item"><input type="radio" name="interval" value="15" checked>15 min</label>
                  <label class="option-item"><input type="radio" name="interval" value="10">10 min</label>
                </div>
              </div>
              <div class="settings-section">
                <div class="settings-section-title">Personal</div>
                <div id="staffConfigList"></div>
              </div>
            </div>
          </div>
          <div class="color-popover" id="colorPicker"><div class="color-grid" id="colorGrid"></div></div>
        </div>
      `;
      this._bindShell();
    }

    _topbarHTML() {
      const d = new Date(this._fecha + 'T12:00:00');
      const diaNum = d.getDate();
      const mes = MESES[d.getMonth()] + ' ' + d.getFullYear();
      const diaSem = DIAS[d.getDay()];
      return `
        <header class="ks-topbar">
          <div class="ks-brandbar">
            <div class="ks-brand">
              <span class="ks-logo">KAMI<span class="ks-logo-accent">SUITE</span></span>
              <span class="ks-datebadge">${diaNum}</span>
            </div>
            <div class="ks-brandhint">Recepción PRO · agenda operativa · CMS-first</div>
            <div class="ks-brandactions">
              <button class="ks-tienda" id="tiendaBtn">🛍 TIENDA</button>
              <button class="ks-fichatec" id="ftBtn">🎨 FICHA TÉCNICA</button>
              <button class="ks-almacen" id="almBtn">🗄️ ALMACÉN</button>
              <button class="ks-especiales" id="espBtn">✦ ESPECIALES</button>
              <button class="ks-automodel">Modelo automático</button>
            </div>
          </div>
          <div class="ks-toolbar">
            <div class="ks-toolbar-l">
              <h1 class="ks-apptitle">Recepción PRO <span class="ks-ver">v1.1.8</span></h1>
              <div class="ks-datenav" style="position:relative">
                <button class="ks-today" id="navHoy">Hoy</button>
                <button class="ks-navarrow" id="navPrev">‹</button>
                <button class="ks-navarrow" id="navNext">›</button>
                <span class="ks-monthchip" id="navMonth" title="Cambiar fecha">${mes}</span>
                <span class="ks-dayline" id="navDay" title="Cambiar fecha" style="cursor:pointer">${diaSem} ${diaNum} <span class="ks-livedot"></span></span>
                <div class="dp-popover" id="dpPopover">
                  <div class="dp-header"><button class="dp-nav" id="dpPrevM">‹</button><span class="dp-month" id="dpMonth"></span><button class="dp-nav" id="dpNextM">›</button></div>
                  <div class="dp-weekdays"><span>lun</span><span>mar</span><span>mie</span><span>jue</span><span>vie</span><span>sab</span><span>dom</span></div>
                  <div class="dp-days" id="dpDays"></div>
                </div>
              </div>
            </div>
            <div class="ks-toolbar-r">
              <div class="ks-countpill"><strong id="statCitas">0</strong> citas</div>
              <span class="ks-overlap-dot is-green" id="overlapDot" title="Sin solapamientos"></span>
              <div class="ks-toolactions">
                <button class="ks-tool" id="btnArqueo" title="Arqueo de caja">🏦</button>
                <button class="ks-tool" id="btnCierre" title="Informe del día">📊</button>
                <button class="ks-tool" id="btnReload" title="Recargar">↻</button>
                <button class="ks-tool" id="btnAjustes" title="Ajustes">⚙</button>
              </div>
            </div>
          </div>
        </header>`;
    }

    // v1.1.53 — Sincroniza la clase .is-collapsed del aside y el icono
    // del botón con this._sidebarCollapsed. Llamado al montar la shell
    // (estado inicial) y en cada click del toggle.
    _applySidebarState() {
      const root = this.shadowRoot;
      const aside = root.querySelector('.ks-aside');
      const toggle = root.getElementById('asideToggle');
      if (aside) aside.classList.toggle('is-collapsed', !!this._sidebarCollapsed);
      if (toggle) {
        toggle.textContent = this._sidebarCollapsed ? '⇥' : '⇤';
        toggle.setAttribute('title', this._sidebarCollapsed
          ? 'Mostrar columna de servicios'
          : 'Ocultar columna de servicios');
      }
    }

    _bindShell() {
      const root = this.shadowRoot;
      // v1.1.53 — Botón colapsar/expandir columna lateral.
      // Aplica el estado inicial leído del constructor (this._sidebarCollapsed,
      // que en viewports <1024px arranca true) y engancha el toggle.
      this._applySidebarState();
      const asideToggle = root.getElementById('asideToggle');
      if (asideToggle) {
        asideToggle.addEventListener('click', () => {
          this._sidebarCollapsed = !this._sidebarCollapsed;
          this._applySidebarState();
        });
      }
      // cliente
      const buscar = root.getElementById('cliBuscar');
      buscar.addEventListener('input', e => {
        const q = e.target.value;
        root.getElementById('cliClear').style.display = q ? 'inline' : 'none';
        clearTimeout(this._buscarTimer);
        if (q.trim().length < 2) { this._renderCliResults([]); return; }
        this._buscarTimer = setTimeout(() => this._sendToPage('buscarCliente', { query: q }), 250);
      });
      root.getElementById('cliClear').addEventListener('click', () => { buscar.value = ''; root.getElementById('cliClear').style.display = 'none'; this._renderCliResults([]); });
      root.getElementById('cliNew').addEventListener('click', () => this._openBlankCliente());
      root.getElementById('cliProv').addEventListener('click', () => this._openClienteProvisional());
      // servicios
      const svcS = root.getElementById('svcSearch');
      svcS.addEventListener('input', e => { this._query = e.target.value; root.getElementById('svcClear').style.display = e.target.value ? 'inline' : 'none'; this._renderPanel(); });
      root.getElementById('svcClear').addEventListener('click', () => { svcS.value = ''; this._query = ''; root.getElementById('svcClear').style.display = 'none'; this._renderPanel(); });
      root.querySelectorAll('.ks-rolebtn').forEach(btn => btn.addEventListener('click', () => {
        this._role = btn.getAttribute('data-role');
        root.querySelectorAll('.ks-rolebtn').forEach(b => b.classList.toggle('active', b === btn));
        this._renderPanel();
      }));
      root.getElementById('collapseAll').addEventListener('click', () => this._toggleAll());
      root.getElementById('blankBtn').addEventListener('click', () => this._openBlankServicio());
      root.getElementById('blockHint').addEventListener('click', () => this._toast('Arrastra verticalmente sobre una columna libre para bloquear ese tramo.'));
      // navegación fecha
      root.getElementById('navHoy').addEventListener('click', () => this._setFecha(todayISO()));
      root.getElementById('navPrev').addEventListener('click', () => this._shiftFecha(-1));
      root.getElementById('navNext').addEventListener('click', () => this._shiftFecha(1));
      root.getElementById('btnReload').addEventListener('click', () => {
        // v1.1.35 — Recarga manual con feedback visual.
        const btn = root.getElementById('btnReload');
        btn.classList.add('is-spinning');
        this._sendToPage('getReservas', { fecha: this._fecha });
        this._toast('Recargando…');
        // El indicador se quita cuando llega la respuesta (ver _handleResponse)
        // o tras 5s por seguridad.
        clearTimeout(this._reloadSpinTimer);
        this._reloadSpinTimer = setTimeout(() => btn.classList.remove('is-spinning'), 5000);
      });
      root.getElementById('btnArqueo').addEventListener('click', () => {
        if (!this._puede('arqueo')) { this._toast('No tienes permiso para esta acción'); return; }
        this._openCaja('arqueo');
      });
      root.getElementById('btnCierre').addEventListener('click', () => {
        if (!this._puede('cierre')) { this._toast('No tienes permiso para esta acción'); return; }
        this._toggleCierre();
      });
      root.getElementById('btnAjustes').addEventListener('click', () => {
        if (!this._puede('ajustes')) { this._toast('No tienes permiso para esta acción'); return; }
        this._openSettings();
      });

      // v1.1.69 — ESPECIALES: venta manual de PRIME/Bonos/Tarjetas
      const espBtnEl = root.getElementById('espBtn');
      if (espBtnEl) espBtnEl.addEventListener('click', () => this._openEspeciales());

      // v1.1.76 — ALMACÉN: papelera y sacar de almacén
      const almBtnEl = root.getElementById('almBtn');
      if (almBtnEl) almBtnEl.addEventListener('click', () => this._openAlmacen());

      // v1.1.77 — FICHA TÉCNICA
      const ftBtnEl = root.getElementById('ftBtn');
      if (ftBtnEl) ftBtnEl.addEventListener('click', () => this._openFichaTecnica());
      // v1.1.84 — TIENDA: venta de productos a alguien que entra sin cita.
      const tiendaBtnEl = root.getElementById('tiendaBtn');
      if (tiendaBtnEl) tiendaBtnEl.addEventListener('click', () => this._openTiendaModal());

      // ── Datepicker (V1) ──
      const openDp = (e) => { e.stopPropagation(); this._openDatePicker(); };
      root.getElementById('navMonth').addEventListener('click', openDp);
      root.getElementById('navDay').addEventListener('click', openDp);
      root.getElementById('dpPrevM').addEventListener('click', (e) => { e.stopPropagation(); this._dpMonth--; if (this._dpMonth < 1) { this._dpMonth = 12; this._dpYear--; } this._renderDatePicker(); });
      root.getElementById('dpNextM').addEventListener('click', (e) => { e.stopPropagation(); this._dpMonth++; if (this._dpMonth > 12) { this._dpMonth = 1; this._dpYear++; } this._renderDatePicker(); });
      root.addEventListener('click', (e) => { if (!e.target.closest('.dp-popover') && !e.target.closest('#navMonth') && !e.target.closest('#navDay')) this._closeDatePicker(); });

      // ── Settings (V1) ──
      root.getElementById('settingsOverlay').addEventListener('click', () => this._closeSettings());
      root.getElementById('btnCloseSettings').addEventListener('click', () => this._closeSettings());
      root.getElementById('btnResetSettings').addEventListener('click', () => {
        this._settings = { rowHeight: 56, titleMode: 'servicio', interval: 15, staffConfig: {} };
        this._initStaffConfig();
        this._applySettingsUI();
        this._renderStaffSettings();
        this._renderCalendar();
        this._saveSettings();
      });
      root.getElementById('sliderSpacing').addEventListener('input', e => { this._settings.rowHeight = parseInt(e.target.value); this._saveSettings(); this._renderCalendar(); });
      root.querySelectorAll('input[name="titleMode"]').forEach(r => r.addEventListener('change', e => { this._settings.titleMode = e.target.value; this._saveSettings(); this._renderCalendar(); }));
      root.querySelectorAll('input[name="interval"]').forEach(r => r.addEventListener('change', e => { this._settings.interval = parseInt(e.target.value); this._saveSettings(); this._renderCalendar(); }));

      // ── Color picker (V1) ──
      this._initColorPicker();

      // ── Cierre panel ──
      root.getElementById('btnCerrarCierre').addEventListener('click', () => this._closeCierre());
      root.getElementById('btnRecargarCierre').addEventListener('click', () => this._recargarCierre());
    }

    _setFecha(iso) {
      const cambio = (this._fecha !== iso);
      this._fecha = iso;
      this._refreshTopbarDate();
      this._sendToPage('getReservas', { fecha: this._fecha });
      // v1.1.20 — Al cambiar de día, el informe del día anterior deja de ser válido.
      // Limpia caché y cierra el panel si estaba abierto. Si el usuario quiere
      // ver el informe del nuevo día, debe pulsar 📊 otra vez.
      if (cambio) {
        this._cierreData = null;
        this._cierreLoading = false;
        const cp = this.shadowRoot.getElementById('cierrePanel');
        if (cp && cp.classList.contains('visible')) {
          this._closeCierre();
        }
      }
    }
    _shiftFecha(days) {
      const d = new Date(this._fecha + 'T12:00:00'); d.setDate(d.getDate() + days);
      this._setFecha(d.toLocaleDateString('en-CA'));
    }
    _refreshTopbarDate() {
      const root = this.shadowRoot;
      const d = new Date(this._fecha + 'T12:00:00');
      const diaNum = d.getDate();
      root.getElementById('navMonth').textContent = MESES[d.getMonth()] + ' ' + d.getFullYear();
      root.getElementById('navDay').innerHTML = `${DIAS[d.getDay()]} ${diaNum} <span class="ks-livedot"></span>`;
      const badge = root.querySelector('.ks-datebadge'); if (badge) badge.textContent = diaNum;
    }
    _updateStats() {
      const el = this.shadowRoot.getElementById('statCitas');
      // v1.1.40 — Los bloqueos NO cuentan como cita.
      if (el) el.textContent = (this._reservas || []).filter(r => r.status !== 'CANCELADA' && r.family !== 'BLOQUEO').length;
      // v1.1.30 — Semáforo de solapamientos
      this._updateOverlapDot();
    }
    // v1.1.30 — Calcula el peor solapamiento entre FASES ocupantes por staff.
    //   verde:   sin solapes
    //   naranja: ≤15 min de solape
    //   rojo:    >15 min de solape
    _updateOverlapDot() {
      const dot = this.shadowRoot.getElementById('overlapDot');
      if (!dot) return;
      const byStaff = {};
      for (const r of (this._reservas || [])) {
        if (r.status === 'CANCELADA') continue;
        // v1.1.40 — Los bloqueos no son citas, no se cuentan como solape
        // entre clientes. Su impacto sobre el calendario se ve en el
        // rayado diagonal pero no necesita semáforo.
        if (r.family === 'BLOQUEO') continue;
        const fasesRaw = Array.isArray(r.fases) ? r.fases : (r.fases?.items || []);
        if (!fasesRaw.length) {
          // Legacy: sin fases → bloque único con duracionTotal
          if (!r.fechaReserva || !r.staffId) continue;
          const sm = this._isoToMinMadrid(r.fechaReserva);
          const dur = Number(r.duracionTotal) || 0;
          if (sm == null || !dur) continue;
          if (!byStaff[r.staffId]) byStaff[r.staffId] = [];
          byStaff[r.staffId].push({ sm, em: sm + dur });
          continue;
        }
        for (const f of fasesRaw) {
          if (!f || !f.ocupa) continue;
          if (!f.start || !f.end) continue;
          const sid = f.staffId || r.staffId;
          if (!sid) continue;
          const sm = this._isoToMinMadrid(f.start);
          const em = this._isoToMinMadrid(f.end);
          if (sm == null || em == null) continue;
          if (!byStaff[sid]) byStaff[sid] = [];
          byStaff[sid].push({ sm, em });
        }
      }
      let maxOverlap = 0;
      for (const sid in byStaff) {
        const bks = byStaff[sid].sort((a, b) => a.sm - b.sm);
        for (let i = 0; i < bks.length; i++) {
          for (let j = i + 1; j < bks.length; j++) {
            if (bks[j].sm < bks[i].em) {
              const overlap = Math.min(bks[i].em, bks[j].em) - bks[j].sm;
              if (overlap > maxOverlap) maxOverlap = overlap;
            } else break;
          }
        }
      }
      let cls, title;
      if (maxOverlap === 0)      { cls = 'is-green';  title = 'Sin solapamientos'; }
      else if (maxOverlap <= 15) { cls = 'is-orange'; title = `Solapamiento ≤15 min (${maxOverlap}′)`; }
      else                       { cls = 'is-red';    title = `Solapamiento >15 min (${maxOverlap}′)`; }
      dot.className = 'ks-overlap-dot ' + cls;
      dot.title = title;
    }
    // v1.1.30 — Convierte ISO a minutos absolutos del día en zona Madrid.
    // Devuelve null si no es válido.
    _isoToMinMadrid(iso) {
      try {
        const d = new Date(iso);
        if (isNaN(d.getTime())) return null;
        const hhmm = d.toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hour12: false });
        return hhmmToMin(hhmm);
      } catch { return null; }
    }
    _updateSteps() {
      const root = this.shadowRoot;
      // 1 Cliente → 2 Servicio (armado) → 3 Staff/4 Hora (al colocar)
      let active = 1;
      if (this._cliente) active = 2;
      if (this._armed) active = 3;
      for (let i = 1; i <= 4; i++) {
        const el = root.getElementById('step' + i);
        if (el) el.classList.toggle('is-now', i === active);
      }
    }

    // ═══════════════════════════════════════════════════
    // CLIENTES
    // ═══════════════════════════════════════════════════
    _renderCliResults(clientes) {
      const wrap = this.shadowRoot.getElementById('cliResultsWrap');
      if (!wrap) return;
      if (!clientes || clientes.length === 0) { wrap.innerHTML = ''; return; }
      this._ultimosClientes = clientes;
      wrap.innerHTML = `<div class="ks-cli-results">${clientes.map((c, i) => `
        <div class="ks-cli-item" data-idx="${i}">
          <div class="ks-cli-name">${esc(c.nombreCompleto || c.nombre || 'Sin nombre')}</div>
          <div class="ks-cli-sub">${esc(c.telefono || '')}${c.email ? ' · ' + esc(c.email) : ''}</div>
        </div>`).join('')}</div>`;
      wrap.querySelectorAll('.ks-cli-item').forEach(it => it.addEventListener('click', () => {
        this._seleccionarCliente(this._ultimosClientes[parseInt(it.getAttribute('data-idx'), 10)]);
      }));
    }
    _seleccionarCliente(c) {
      this._cliente = { contactId: c.contactId || '', nombre: c.nombreCompleto || c.nombre || '', telefono: c.telefono || '', email: c.email || '', esProvisional: false };
      const root = this.shadowRoot;
      root.getElementById('cliResultsWrap').innerHTML = '';
      root.getElementById('cliBuscar').value = '';
      root.getElementById('cliClear').style.display = 'none';
      this._renderClienteSelected();
      this._updateSteps();
    }
    _renderClienteSelected() {
      const root = this.shadowRoot;
      const sel = root.getElementById('cliSelected');
      if (!sel || !this._cliente) { if (sel) sel.innerHTML = ''; return; }
      const c = this._cliente;
      const prov = c.esProvisional ? `<span style="display:inline-block;margin-left:8px;padding:2px 7px;border-radius:999px;background:#fff3d6;color:#a55b00;font-size:10px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;border:1px solid #f0c879">provisional</span>` : '';
      const sub = c.esProvisional
        ? `<span style="color:#a55b00;font-style:italic;">sin datos · no recibe comunicaciones</span>`
        : `${esc(c.telefono || '')}${c.email ? ' · ' + esc(c.email) : ''}`;
      // v1.1.33 — botón ✎ Editar solo para clientes reales (no provisionales).
      // Reutiliza el mismo modal que crear cliente pero pre-rellenado.
      const puedeEditar = !c.esProvisional && c.contactId;
      const btnEdit = puedeEditar
        ? `<button class="ks-cli-srm" id="cliEdit" title="Editar datos del cliente" style="margin-right:4px;">✎</button>`
        : '';

      // v1.1.34 — Warning ficha incompleta (banner naranja). Solo para
      // clientes reales; provisionales ya tienen su badge. Calcula
      // apellido desde el nombre completo (último o únicos espacios).
      let warnBanner = '';
      if (!c.esProvisional) {
        const parts = String(c.nombre || '').trim().split(/\s+/);
        const apellido = parts.length > 1 ? parts.slice(1).join(' ') : '';
        const warnings = this._checkClienteIncompleto({
          email: c.email,
          apellido,
          telefono: c.telefono
        });
        warnBanner = this._warnHTML(warnings);
      }

      sel.innerHTML = `<div class="ks-cli-selected">
        <div style="flex:1;"><div class="ks-cli-sname">${esc(c.nombre)}${prov}</div>
        <div class="ks-cli-ssub">${sub}</div>${warnBanner}</div>
        <div style="display:flex;align-items:center;">${btnEdit}<button class="ks-cli-srm" id="cliRm">✕</button></div></div>`;
      sel.querySelector('#cliRm').addEventListener('click', () => { this._cliente = null; sel.innerHTML = ''; this._updateSteps(); });
      if (puedeEditar) {
        sel.querySelector('#cliEdit').addEventListener('click', () => this._openEditarCliente(c));
      }
    }
    // v1.1.34 — Detección de ficha incompleta (patrón V1 literal de
    // kamisuite-agenda v2.0.5). Banner en sidebar cliente + modal cita.
    // Los emails genéricos del salón se tratan como "vacío" porque no
    // identifican al cliente real ni reciben confirmaciones.
    _emailsGenericos() {
      return new Set([
        'booking@hair-times.com',
        'info@hairtimes.com',
        'info@hair-times.com',
        ''
      ]);
    }

    _checkClienteIncompleto(opts) {
      const warnings = [];
      const email = String(opts?.email || '').trim().toLowerCase();
      const apellido = String(opts?.apellido || '').trim();
      const telefono = String(opts?.telefono || '').trim();
      const genericos = this._emailsGenericos();
      if (!email || genericos.has(email)) warnings.push('Email genérico o vacío');
      if (!apellido) warnings.push('Sin apellido');
      if (!telefono) warnings.push('Sin teléfono');
      return warnings;
    }

    _warnHTML(warnings) {
      if (!warnings || !warnings.length) return '';
      return `<div class="warn-banner" style="display:flex;align-items:center;gap:8px;margin-top:8px;padding:6px 10px;background:#fff3d6;border:1px solid #f0c879;border-radius:8px;color:#7a4500;font-size:11px;font-weight:600;">
        <span class="warn-dot" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#d24a3a;animation:warnBlink 1.2s ease-in-out infinite;"></span>
        <span class="warn-text">${esc(warnings.join(' · '))}</span>
      </div>`;
    }

    // v1.1.34 — Lista corta de prefijos país (formulario alta/edición).
    // Si necesitas añadir más mercados, amplía aquí.
    _prefijosPais() {
      return [
        { flag: '🇪🇸', code: '+34',  label: 'España' },
        { flag: '🇵🇹', code: '+351', label: 'Portugal' },
        { flag: '🇫🇷', code: '+33',  label: 'Francia' },
        { flag: '🇮🇹', code: '+39',  label: 'Italia' },
        { flag: '🇬🇧', code: '+44',  label: 'Reino Unido' },
        { flag: '🇩🇪', code: '+49',  label: 'Alemania' },
        { flag: '🇲🇦', code: '+212', label: 'Marruecos' },
        { flag: '🇦🇷', code: '+54',  label: 'Argentina' },
        { flag: '🇲🇽', code: '+52',  label: 'México' },
        { flag: '🇺🇸', code: '+1',   label: 'EE.UU. / Canadá' }
      ];
    }

    // Devuelve HTML del selector de prefijo. selected = prefijo a marcar
    // (ej. '+34'). idSel se usa como id del <select>.
    _renderSelectorPrefijo(selected = '+34', idSel = 'cfTelPre') {
      const opts = this._prefijosPais().map(p =>
        `<option value="${p.code}"${p.code === selected ? ' selected' : ''}>${p.flag} ${p.code}</option>`
      ).join('');
      return `<select id="${idSel}" style="padding:8px 10px;border:1px solid #d8dbe2;border-radius:8px;background:#fff;font:inherit;min-width:96px;">${opts}</select>`;
    }

    // Parsea un teléfono guardado en CRM y separa prefijo + número.
    // Si empieza por '+', extrae el prefijo más largo que coincida con
    // la lista conocida. Si no, asume '+34' y deja el número limpio.
    _parsearTelefono(tel) {
      const raw = String(tel || '').trim();
      if (!raw) return { prefijo: '+34', numero: '' };
      if (raw.startsWith('+')) {
        const conocidos = this._prefijosPais()
          .map(p => p.code)
          .sort((a, b) => b.length - a.length); // primero los más largos
        for (const pre of conocidos) {
          if (raw.startsWith(pre)) {
            const numero = raw.slice(pre.length).trim().replace(/^\s+/, '');
            return { prefijo: pre, numero };
          }
        }
        // Prefijo desconocido pero empieza por '+': intentar separar.
        const m = raw.match(/^(\+\d{1,4})\s*(.*)$/);
        if (m) return { prefijo: m[1], numero: m[2].trim() };
      }
      return { prefijo: '+34', numero: raw };
    }

    _openBlankCliente() {
      const root = this.shadowRoot;
      this._closeBlankForm();
      const scrim = document.createElement('div'); scrim.className = 'ks-modal-scrim'; scrim.id = 'blankScrim';
      scrim.addEventListener('click', e => { if (e.target === scrim) this._closeBlankForm(); });
      const form = document.createElement('div'); form.className = 'ks-blankform';
      form.innerHTML = `
        <div class="ks-blank-head"><div><span class="ks-blank-eyebrow">Nuevo</span><h3 class="ks-blank-title">Cliente nuevo</h3></div><button class="ks-modal-x" id="bx">✕</button></div>
        <div class="ks-field-row"><label class="ks-field"><span>Nombre</span><input id="cfNombre" autofocus></label><label class="ks-field"><span>Apellido</span><input id="cfApellido"></label></div>
        <label class="ks-field"><span>Teléfono</span><div style="display:flex;gap:8px;align-items:stretch;">${this._renderSelectorPrefijo('+34', 'cfTelPre')}<input id="cfTel" style="flex:1;" placeholder="Número sin prefijo"></div></label>
        <label class="ks-field"><span>Email (opcional)</span><input id="cfEmail"></label>
        <div class="ks-blank-foot"><button class="ks-detail-cancel" id="bcancel">Cancelar</button><button class="ks-detail-add" id="bsave">Crear</button></div>`;
      scrim.appendChild(form); root.appendChild(scrim);
      form.querySelector('#bx').addEventListener('click', () => this._closeBlankForm());
      form.querySelector('#bcancel').addEventListener('click', () => this._closeBlankForm());
      form.querySelector('#bsave').addEventListener('click', () => {
        const nombre = form.querySelector('#cfNombre').value.trim();
        if (!nombre) { this._toast('Falta el nombre'); return; }
        const prefijo = form.querySelector('#cfTelPre').value;
        const numero = form.querySelector('#cfTel').value.trim();
        const telefono = numero ? `${prefijo} ${numero}` : '';
        this._sendToPage('crearCliente', { nombre, apellido: form.querySelector('#cfApellido').value.trim(), telefono, email: form.querySelector('#cfEmail').value.trim() });
        const b = form.querySelector('#bsave'); b.textContent = 'Creando…'; b.disabled = true;
      });
    }

    // v1.1.33 — Modal de edición de contacto existente.
    // Misma estructura que _openBlankCliente pero pre-rellenado y
    // envía 'editarContacto' con contactId en lugar de 'crearCliente'.
    _openEditarCliente(c) {
      if (!c || !c.contactId) return;
      const root = this.shadowRoot;
      this._closeBlankForm();
      // Separar nombre + apellido. Si solo hay nombre, apellido queda vacío.
      const parts = String(c.nombre || '').split(' ');
      const firstName = parts.shift() || '';
      const lastName = parts.join(' ');
      const { prefijo, numero } = this._parsearTelefono(c.telefono);

      const scrim = document.createElement('div'); scrim.className = 'ks-modal-scrim'; scrim.id = 'blankScrim';
      scrim.addEventListener('click', e => { if (e.target === scrim) this._closeBlankForm(); });
      const form = document.createElement('div'); form.className = 'ks-blankform';
      form.innerHTML = `
        <div class="ks-blank-head"><div><span class="ks-blank-eyebrow">Editar</span><h3 class="ks-blank-title">Editar cliente</h3></div><button class="ks-modal-x" id="bx">✕</button></div>
        <div class="ks-field-row"><label class="ks-field"><span>Nombre</span><input id="cfNombre" autofocus value="${esc(firstName)}"></label><label class="ks-field"><span>Apellido</span><input id="cfApellido" value="${esc(lastName)}"></label></div>
        <label class="ks-field"><span>Teléfono</span><div style="display:flex;gap:8px;align-items:stretch;">${this._renderSelectorPrefijo(prefijo, 'cfTelPre')}<input id="cfTel" style="flex:1;" placeholder="Número sin prefijo" value="${esc(numero)}"></div></label>
        <label class="ks-field"><span>Email (opcional)</span><input id="cfEmail" value="${esc(c.email || '')}"></label>
        <div class="ks-blank-foot"><button class="ks-detail-cancel" id="bcancel">Cancelar</button><button class="ks-detail-add" id="bsave">Guardar</button></div>`;
      scrim.appendChild(form); root.appendChild(scrim);
      form.querySelector('#bx').addEventListener('click', () => this._closeBlankForm());
      form.querySelector('#bcancel').addEventListener('click', () => this._closeBlankForm());
      form.querySelector('#bsave').addEventListener('click', () => {
        const nombre = form.querySelector('#cfNombre').value.trim();
        if (!nombre) { this._toast('Falta el nombre'); return; }
        const pre = form.querySelector('#cfTelPre').value;
        const num = form.querySelector('#cfTel').value.trim();
        const telefono = num ? `${pre} ${num}` : '';
        this._sendToPage('editarContacto', {
          contactId: c.contactId,
          nombre,
          apellido: form.querySelector('#cfApellido').value.trim(),
          telefono,
          email: form.querySelector('#cfEmail').value.trim()
        });
        const b = form.querySelector('#bsave'); b.textContent = 'Guardando…'; b.disabled = true;
      });
    }

    _closeBlankForm() { const s = this.shadowRoot.getElementById('blankScrim'); if (s) s.remove(); }

    // ═══════════════════════════════════════════════════
    // CLIENTE PROVISIONAL — v1.1.12
    //   Cliente eventual de paso. Solo se pide nombre. NO se persiste en CRM.
    //   contactId vacío → no recibe comunicaciones, no ensucia el CRM.
    //   Si vuelve días después, se crea como provisional otra vez o se
    //   promociona a Cliente nuevo. Provisional es anónimo por diseño.
    // ═══════════════════════════════════════════════════
    _openClienteProvisional() {
      const root = this.shadowRoot;
      this._closeBlankForm();
      const scrim = document.createElement('div'); scrim.className = 'ks-modal-scrim'; scrim.id = 'blankScrim';
      scrim.addEventListener('click', e => { if (e.target === scrim) this._closeBlankForm(); });
      const form = document.createElement('div'); form.className = 'ks-blankform';
      form.innerHTML = `
        <div class="ks-blank-head"><div><span class="ks-blank-eyebrow" style="color:#7a7f8b">Provisional</span><h3 class="ks-blank-title">Cliente eventual</h3></div><button class="ks-modal-x" id="bx">✕</button></div>
        <p class="ks-blank-note">Cliente de paso. Solo se pide el nombre. <b>No se guarda en CRM</b> ni recibe comunicaciones. Si vuelve otro día, hay que pedirle los datos completos como cliente nuevo.</p>
        <label class="ks-field"><span>Nombre</span><input id="cpNombre" autofocus placeholder="Nombre (cualquiera identificable)"></label>
        <div class="ks-blank-foot"><button class="ks-detail-cancel" id="bcancel">Cancelar</button><button class="ks-detail-add" id="bsave">Usar provisional</button></div>`;
      scrim.appendChild(form); root.appendChild(scrim);
      form.querySelector('#bx').addEventListener('click', () => this._closeBlankForm());
      form.querySelector('#bcancel').addEventListener('click', () => this._closeBlankForm());
      form.querySelector('#cpNombre').addEventListener('keydown', e => { if (e.key === 'Enter') form.querySelector('#bsave').click(); });
      form.querySelector('#bsave').addEventListener('click', () => {
        const nombre = form.querySelector('#cpNombre').value.trim();
        if (!nombre) { this._toast('Falta el nombre'); return; }
        this._cliente = { nombre, esProvisional: true, contactId: '', telefono: '', email: '' };
        this._closeBlankForm();
        this._renderClienteSelected();
        this._updateSteps();
        this._toast(`Provisional · ${nombre}`);
      });
    }

    // ═══════════════════════════════════════════════════
    // PANEL DE SERVICIOS
    // ═══════════════════════════════════════════════════
    _buildGroups() {
      const q = (this._query || '').trim().toLowerCase();
      const visible = this._servicios.filter(s => {
        // v1.1.82 — "Complementos de fases" fuera del listado, salvo que el
        // operador pida expresamente la pestaña Complementos.
        if (this._role !== 'complemento' && normGrupo(s.group) === GRUPO_OCULTO_PANEL) return false;
        if (this._role === 'principal' && s.tipo === 'complemento') return false;
        if (this._role === 'complemento' && s.tipo === 'principal') return false;
        if (q && !(s.label || '').toLowerCase().includes(q)) return false;
        return true;
      });
      const bySlug = {};
      visible.forEach(s => { (bySlug[s.group] = bySlug[s.group] || []).push(s); });
      return Object.keys(bySlug).map(slug => ({
        slug, label: prettifyGroup(slug),
        services: bySlug[slug].sort((a, b) => (a.order || 0) - (b.order || 0))
      })).sort((a, b) => a.label.localeCompare(b.label));
    }
    _isCollapsed(slug) { return this._collapsed[slug] !== false; }
    _toggleAll() {
      const groups = this._buildGroups();
      const allOpen = groups.length && groups.every(g => this._collapsed[g.slug] === false);
      const m = {}; if (!allOpen) groups.forEach(g => m[g.slug] = false);
      this._collapsed = m; this._renderPanel();
    }
    // v1.1.23 — Recargar catálogo manualmente desde el CMS
    _recargarCatalogo() {
      const btn = this.shadowRoot.getElementById('catReload');
      if (btn) btn.classList.add('spinning');
      this._loading = true;
      this._catalogoRecibido = false;
      this._renderPanel();
      // Reenvía 'ready' al page code → dispara handleGetCatalogo otra vez
      this._sendToPage('ready', {});
    }
    _renderPanel() {
      const root = this.shadowRoot;
      const cs = root.getElementById('catstatus');
      if (cs) cs.innerHTML = this._loading
        ? `<span class="ks-syncdot loading"></span><span class="ks-catsrc">ServiceCatalog</span><span class="ks-catsep">·</span><span>sincronizando…</span>`
        : `<span class="ks-syncdot"></span><span class="ks-catsrc">ServiceCatalog</span><span class="ks-catsep">·</span><span>${this._servicios.length} activos</span><span class="ks-catok">✓</span><button class="ks-cat-reload" id="catReload" title="Recargar catálogo desde el CMS">🔄</button>`;
      const reloadBtn = root.getElementById('catReload');
      if (reloadBtn && !reloadBtn._wired) {
        reloadBtn._wired = true;
        reloadBtn.addEventListener('click', () => this._recargarCatalogo());
      }
      const cont = root.getElementById('panelscroll');
      if (!cont) return;
      if (this._loading) { cont.innerHTML = `<div class="ks-empty">Cargando catálogo…</div>`; return; }
      const groups = this._buildGroups();
      if (!groups.length) { cont.innerHTML = `<div class="ks-empty">Sin servicios para este filtro.</div>`; return; }

      cont.innerHTML = groups.map(g => {
        const col = this._isCollapsed(g.slug);
        return `<div class="ks-group">
          <button class="ks-grouphead ${col ? '' : 'is-open'}" data-slug="${esc(g.slug)}">
            <span class="ks-groupbar" style="background:${hueColor(g.slug, 0.55)}"></span>
            <span class="ks-grouplabel" style="color:${hueColor(g.slug, 0.42)}">${esc(g.label)}</span>
            <span class="ks-groupcount">${g.services.length}</span>
            <span class="ks-grouptoggle">›</span>
          </button>
          ${col ? '' : `<div class="ks-cardgrid" style="margin-top:7px">${g.services.map(s => this._cardHTML(s)).join('')}</div>`}
        </div>`;
      }).join('');

      cont.querySelectorAll('.ks-grouphead').forEach(h => h.addEventListener('click', () => {
        const slug = h.getAttribute('data-slug'); this._collapsed[slug] = !this._isCollapsed(slug) ? true : false; this._renderPanel();
      }));
      cont.querySelectorAll('.ks-svccard').forEach(b => b.addEventListener('click', e => {
        const svc = this._porSetupUid[b.getAttribute('data-uid')]; if (svc) this._openDetail(svc, e.clientX, e.clientY);
      }));
    }
    _cardHTML(s) {
      const cascade = s.claseServicio === 'complejo_proceso' || s.claseServicio === 'complejo_fases';
      const variants = s.claseServicio === 'simple_variantes' || s.hasVariants;
      const rolePill = (s.tipo && s.tipo !== 'principal') ? `<span class="ks-rolepill" style="background:${hueSoft(s.group, 0.95, 0.04)};color:${hueColor(s.group, 0.42)}">${ROLE_SHORT[s.tipo] || ''}</span>` : '';
      return `<button class="ks-svccard" data-uid="${esc(s.setupUid)}" style="--fam:${hueColor(s.group, 0.55)}">
        <span class="ks-svccard-top"><span class="ks-svccard-label">${esc(s.label)}</span>${rolePill}</span>
        <span class="ks-svccard-bottom">
          <span class="ks-clasetag ${cascade ? 'is-cascade' : (variants ? 'is-variants' : '')}">${cascade ? '<span class="ks-clase-ico">⛓</span>' : ''}${variants && !cascade ? '<span class="ks-clase-ico">⋮</span>' : ''}${CLASE_LABEL[s.claseServicio] || 'Simple'}</span>
          <span class="ks-svccard-meta"><span class="ks-dur">${s.duration || 0}′</span>${s.price ? `<span class="ks-price">${s.price}€</span>` : ''}</span>
        </span>
      </button>`;
    }

    // ═══════════════════════════════════════════════════
    // DETAIL POPOVER
    // ═══════════════════════════════════════════════════
    _resolverFases(svc) {
      const mapeo = Array.isArray(svc.mapeoFases) ? svc.mapeoFases : (typeof svc.mapeoFases === 'string' ? this._tryParse(svc.mapeoFases) : []);
      if (!Array.isArray(mapeo) || !mapeo.length) return [];
      const out = [];
      for (const f of mapeo) {
        if (f && f.tipo === 'proceso') out.push({ label: 'Proceso', kind: 'proceso', dur: Number(f.min) || 0 });
        else if (f && f.tipo === 'servicio' && f.ref) { const r = this._porSetupUid[f.ref]; out.push({ label: r ? r.label : '(falta)', kind: 'work', dur: r ? (Number(r.duration) || 0) : 0 }); }
      }
      return out;
    }
    _tryParse(s) { try { return JSON.parse(s); } catch (e) { return []; } }

    _openDetail(svc, x, y) { this._detail = svc; this._variantIdx = 0; this._complSel = {}; this._exclusivosSel = {}; this._cantidad = 1; this._renderDetail(x, y); }
    _closeDetail() { this._detail = null; const r = this.shadowRoot; r.getElementById('detailScrim')?.remove(); r.getElementById('detailPop')?.remove(); }

    _renderDetail(x, y) {
      const s = this._detail; if (!s) return;
      const root = this.shadowRoot;
      root.getElementById('detailScrim')?.remove(); root.getElementById('detailPop')?.remove();
      const cascade = s.claseServicio === 'complejo_proceso' || s.claseServicio === 'complejo_fases';
      const fam = hueColor(s.group, 0.55);

      const variantes = Array.isArray(s.variantes) ? s.variantes : [];
      const variantHTML = (s.hasVariants && variantes.length) ? `
        <div class="ks-detail-block"><div class="ks-detail-blocklbl">Variante</div>
          <div class="ks-variant-list">${variantes.map((v, i) => {
            const vLabel = (typeof v === 'string') ? v : (v.label || v.nombre || '');
            const vPrice = (typeof v === 'object') ? Number(v.precio != null ? v.precio : v.price) : NaN;
            const vDur = (typeof v === 'object') ? Number(v.duracion != null ? v.duracion : v.duration) : NaN;
            const meta = [];
            if (!isNaN(vPrice)) meta.push(vPrice > 0 ? `${vPrice}€` : 'incluido');
            if (!isNaN(vDur) && vDur > 0) meta.push(`${vDur}′`);
            const metaHTML = meta.length ? `<span class="ks-dur">${meta.join(' · ')}</span>` : '';
            return `<button class="ks-variant ${i === this._variantIdx ? 'active' : ''}" data-vi="${i}" style="display:flex;justify-content:space-between;align-items:center"><span>${esc(vLabel)}</span>${metaHTML}</button>`;
          }).join('')}</div></div>` : '';

      const fases = cascade ? this._resolverFases(s) : [];
      const total = fases.reduce((a, f) => a + f.dur, 0);
      const cascadeHTML = (cascade && fases.length) ? `
        <div class="ks-detail-block"><div class="ks-detail-blocklbl">Cascada de fases <span class="ks-detail-blocklbl-hint">mapeoFases</span></div>
          <div class="ks-cascade-track">${fases.map(f => `<div class="ks-cascade-seg ${f.kind === 'proceso' ? 'is-proceso' : ''}" style="flex:${Math.max(f.dur, 1)}" title="${esc(f.label)} · ${f.dur}′"><span class="ks-cascade-seg-label">${esc(f.label)}</span><span class="ks-cascade-seg-dur">${f.dur}′</span></div>`).join('')}</div>
          <div class="ks-cascade-legend"><span class="ks-cascade-legitem"><span class="ks-leg-sw work"></span>Ocupado</span><span class="ks-cascade-legitem"><span class="ks-leg-sw proceso"></span>PROCESO libre</span><span class="ks-cascade-total">${total} min</span></div>
          <p class="ks-detail-note">Durante el <strong>PROCESO</strong> la columna no se ocupa: el profesional queda libre para otra cita.</p></div>` : '';

      // v1.1.81 — ¿Estamos AÑADIENDO una línea a un armado ya iniciado?
      // Si _armed existe, este popup no arma una cita nueva: encola otro
      // servicio dentro de la misma cita.
      const enCola = !!this._armed;

      const compsAll = Array.isArray(s.complementos) ? s.complementos : [];
      // v1.1.81 — En modo "añadir a la cita" los complementos OPCIONALES no
      // se ofrecen: elegirlos línea a línea haría el popup inmanejable
      // (premisa de diseño). Los OBLIGATORIOS con variantes (CASO B, tipo
      // Planchado M/L/XL dentro del Botox) SÍ se mantienen: sin esa
      // elección el motor no puede construir las fases del servicio y la
      // línea fallaría con "Falta elegir variante de: …".
      const comps = enCola ? compsAll.filter(c => c && c.required) : compsAll;
      // v1.1.44 — Complementos. Dos casos:
      //   · Sin variantes → botón toggle (sí/no), como siempre.
      //   · Con variantes → una fila por variante (chips). Si el complemento
      //     es `required` (está como fase del mapeoFases), debe elegirse una
      //     variante para poder armar (no hay "no añadir"). Si es opcional,
      //     elegir una variante lo añade; volver a pulsarla lo quita.
      const complHTML = comps.length ? `
        <div class="ks-detail-block"><div class="ks-detail-blocklbl">Complementos${enCola ? ' <span class="ks-detail-blocklbl-hint">solo obligatorios al encadenar</span>' : ''}</div>
          ${comps.map(c => {
            const cvars = Array.isArray(c.variantes) ? c.variantes : [];
            if (c.hasVariants && cvars.length) {
              const sel = this._complSel[c.setupUid]; // {varianteIdx} | undefined
              const selIdx = (sel && typeof sel === 'object') ? sel.varianteIdx : -1;
              const reqTag = c.required ? ` <span class="ks-dur" style="color:var(--ks-accent)">· obligatorio</span>` : '';
              return `<div style="margin-bottom:6px">
                <div class="ks-detail-blocklbl" style="font-size:11px;margin:4px 0">⛓ ${esc(c.label)}${reqTag}</div>
                <div class="ks-variant-list">${cvars.map((v, vi) => {
                  const vLabel = (typeof v === 'string') ? v : (v.label || v.nombre || '');
                  const vPrice = (typeof v === 'object') ? Number(v.precio != null ? v.precio : v.price) : NaN;
                  const vDur = (typeof v === 'object') ? Number(v.duracion != null ? v.duracion : v.duration) : NaN;
                  const meta = [];
                  if (!isNaN(vPrice)) meta.push(vPrice > 0 ? `${vPrice}€` : 'incluido');
                  if (!isNaN(vDur) && vDur > 0) meta.push(`${vDur}′`);
                  const metaHTML = meta.length ? `<span class="ks-dur">${meta.join(' · ')}</span>` : '';
                  return `<button class="ks-variant ks-compl-var ${vi === selIdx ? 'active' : ''}" data-cuid="${esc(c.setupUid)}" data-cvi="${vi}" style="display:flex;justify-content:space-between;align-items:center"><span>${esc(vLabel)}</span>${metaHTML}</button>`;
                }).join('')}</div></div>`;
            }
            // Sin variantes → toggle
            return `<div class="ks-variant-list"><button class="ks-variant ks-compl ${this._complSel[c.setupUid] ? 'active' : ''}" data-cuid="${esc(c.setupUid)}" style="display:flex;justify-content:space-between"><span>⛓ ${esc(c.label)}</span><span class="ks-dur">${c.price ? c.price + '€' : '—'} · ${c.duration || 0}′</span></button></div>`;
          }).join('')}</div>` : '';

      // v1.1.59 — Bloque de GRUPOS EXCLUSIVOS del mapeoFases.
      // Cada item tipo:'exclusivo' se pinta como un mini-selector con
      // botones radio-like: primero "No añadir", luego una opción por
      // cada ref válido. Estado en this._exclusivosSel[groupKey] (uid
      // del elegido) o ausencia si es "No añadir".
      const mapeoParaExcl = Array.isArray(s.mapeoFases)
        ? s.mapeoFases
        : (typeof s.mapeoFases === 'string' ? this._tryParse(s.mapeoFases) : []);
      const exclusivos = Array.isArray(mapeoParaExcl)
        ? mapeoParaExcl
            .map((f, idx) => ({ f, idx }))
            .filter(x => x.f && x.f.tipo === 'exclusivo' && Array.isArray(x.f.refs) && x.f.refs.length > 0)
        : [];
      // v1.1.81 — los grupos exclusivos son elección opcional: se ocultan
      // al encadenar líneas, por la misma premisa que los complementos.
      const exclHTML = (exclusivos.length && !enCola) ? `
        <div class="ks-detail-block"><div class="ks-detail-blocklbl">Grupos exclusivos <span class="ks-detail-blocklbl-hint">elige uno o ninguno</span></div>
          ${exclusivos.map(({ f, idx }) => {
            const groupKey = 'exc:' + idx;
            const selUid = this._exclusivosSel && this._exclusivosSel[groupKey];
            const opts = f.refs
              .map(r => this._porSetupUid[r])
              .filter(Boolean);
            const labelGrupo = (typeof f.label === 'string' && f.label.trim()) ? f.label.trim() : 'Grupo';
            const noneActive = !selUid;
            return `<div style="margin-bottom:8px">
              <div class="ks-detail-blocklbl" style="font-size:11px;margin:4px 0;color:#ff8a8a">🎯 ${esc(labelGrupo)}</div>
              <div class="ks-variant-list">
                <button class="ks-variant ks-excl-opt ${noneActive ? 'active' : ''}" data-gk="${esc(groupKey)}" data-uid="" style="display:flex;justify-content:space-between;align-items:center"><span>No añadir</span><span class="ks-dur">—</span></button>
                ${opts.map(svcRef => {
                  const isSel = selUid === svcRef.setupUid;
                  const priceTxt = (svcRef.price != null && svcRef.price > 0) ? `${svcRef.price}€` : '—';
                  const durTxt = svcRef.duration ? `${svcRef.duration}′` : '';
                  return `<button class="ks-variant ks-excl-opt ${isSel ? 'active' : ''}" data-gk="${esc(groupKey)}" data-uid="${esc(svcRef.setupUid)}" style="display:flex;justify-content:space-between;align-items:center"><span>${esc(svcRef.label || '')}</span><span class="ks-dur">${priceTxt}${durTxt ? ' · ' + durTxt : ''}</span></button>`;
                }).join('')}
              </div>
            </div>`;
          }).join('')}</div>` : '';

      // v1.1.81 — CANTIDAD. Caso real: una madre trae dos niños al mismo
      // corte. Cantidad 2 = el servicio se encadena dos veces detrás de sí
      // mismo según su duración, dentro de la MISMA cita: un total, un
      // cobro, un solo aviso al cliente.
      const cantidadHTML = `
        <div class="ks-detail-block"><div class="ks-detail-blocklbl">Cantidad</div>
          <div class="ks-qty-row">
            <button class="ks-variant ks-qty-btn" id="dQtyMinus" aria-label="Quitar uno">−</button>
            <span class="ks-qty-val" id="dQtyVal">${this._cantidad}</span>
            <button class="ks-variant ks-qty-btn" id="dQtyPlus" aria-label="Añadir uno">＋</button>
            <span class="ks-dur" id="dQtyHint">${this._cantidad > 1 ? this._cantidad + ' pases encadenados' : 'un solo pase'}</span>
          </div></div>`;

      const scrim = document.createElement('div'); scrim.className = 'ks-detail-scrim'; scrim.id = 'detailScrim';
      scrim.addEventListener('click', () => this._closeDetail());
      const pop = document.createElement('div'); pop.className = 'ks-detail'; pop.id = 'detailPop'; pop.style.setProperty('--fam', fam);
      // v1.1.18 — top provisional (luego se reajusta tras pintar)
      const topProv = Math.max((y || 120) - 40, 16);
      pop.style.top = topProv + 'px'; pop.style.left = Math.min((x || 360) + 14, window.innerWidth - 360) + 'px';
      pop.innerHTML = `
        <div class="ks-detail-head" style="--fam:${fam}">
          <div class="ks-detail-headtop"><span class="ks-detail-groupchip" style="color:${hueColor(s.group, 0.42)};background:${hueSoft(s.group, 0.96, 0.04)}">${esc(prettifyGroup(s.group))}</span><button class="ks-detail-close" id="dClose">✕</button></div>
          <div class="ks-detail-title">${esc(s.label)}</div>
          <div class="ks-detail-tags"><span class="ks-clasetag ${cascade ? 'is-cascade' : (s.claseServicio === 'simple_variantes' ? 'is-variants' : '')}">${cascade ? '⛓ ' : ''}${CLASE_LABEL[s.claseServicio] || 'Simple'}</span><span class="ks-detail-dur">${s.duration || 0} min</span>${s.price ? `<span class="ks-detail-price">${s.price}€</span>` : ''}</div>
        </div>
        <div class="ks-detail-body">
          ${variantHTML}${complHTML}${exclHTML}${cantidadHTML}
          <p class="ks-detail-note ks-detail-note-simple">${enCola
            ? 'Se añadirá a la cita que estás montando, detrás del servicio anterior según su duración.'
            : 'Pulsa <strong>Armar servicio</strong> y haz clic en la columna del empleado y la hora en el calendario.'}</p>
          <div class="ks-detail-uid">setupUid · <code>${esc(s.setupUid)}</code></div>
        </div>
        <div class="ks-detail-foot"><button class="ks-detail-cancel" id="dCancel">Cancelar</button><button class="ks-detail-add" id="dAdd">${enCola ? '＋ Añadir a la cita' : 'Armar servicio'}</button></div>`;
      root.appendChild(scrim); root.appendChild(pop);
      // v1.1.18 — Reposicionar verticalmente si la altura real desborda
      // la ventana (caso típico con muchos complementos asignados).
      requestAnimationFrame(() => {
        const h = pop.offsetHeight || 0;
        const margen = 16;
        if (h && (topProv + h) > (window.innerHeight - margen)) {
          const nuevoTop = Math.max(margen, window.innerHeight - h - margen);
          pop.style.top = nuevoTop + 'px';
        }
      });
      pop.querySelector('#dClose').addEventListener('click', () => this._closeDetail());
      pop.querySelector('#dCancel').addEventListener('click', () => this._closeDetail());
      pop.querySelectorAll('.ks-variant:not(.ks-compl):not(.ks-compl-var)').forEach(v => v.addEventListener('click', () => {
        this._variantIdx = parseInt(v.getAttribute('data-vi'), 10) || 0;
        pop.querySelectorAll('.ks-variant:not(.ks-compl):not(.ks-compl-var)').forEach(x => x.classList.toggle('active', x === v));
      }));
      pop.querySelectorAll('.ks-compl:not(.ks-compl-var)').forEach(c => c.addEventListener('click', () => {
        const uid = c.getAttribute('data-cuid'); this._complSel[uid] = !this._complSel[uid]; c.classList.toggle('active', !!this._complSel[uid]);
      }));
      // v1.1.44 — variante de complemento: selecciona una opción del
      // complemento con variantes. Guarda {varianteIdx}. Re-pulsar la misma
      // la deselecciona SOLO si el complemento es opcional (no required).
      pop.querySelectorAll('.ks-compl-var').forEach(btn => btn.addEventListener('click', () => {
        const uid = btn.getAttribute('data-cuid');
        const vi = parseInt(btn.getAttribute('data-cvi'), 10) || 0;
        const compMeta = (this._detail.complementos || []).find(x => x.setupUid === uid) || {};
        const yaSel = this._complSel[uid] && typeof this._complSel[uid] === 'object' && this._complSel[uid].varianteIdx === vi;
        if (yaSel && !compMeta.required) {
          // opcional + ya seleccionada → quitar
          delete this._complSel[uid];
        } else {
          this._complSel[uid] = { varianteIdx: vi };
        }
        // re-render del grupo de este complemento: marcar la activa
        pop.querySelectorAll(`.ks-compl-var[data-cuid="${uid}"]`).forEach(b => {
          const bvi = parseInt(b.getAttribute('data-cvi'), 10) || 0;
          const act = this._complSel[uid] && typeof this._complSel[uid] === 'object' && this._complSel[uid].varianteIdx === bvi;
          b.classList.toggle('active', !!act);
        });
      }));
      // v1.1.59 — GRUPO EXCLUSIVO. Opciones del grupo con radio-like:
      // click en una opción la selecciona (deseleccionando cualquier otra
      // del mismo grupo). Si es "No añadir" (data-uid vacío), borra la
      // selección del grupo. Estado en this._exclusivosSel[groupKey].
      pop.querySelectorAll('.ks-excl-opt').forEach(btn => btn.addEventListener('click', () => {
        const gk = btn.getAttribute('data-gk');
        const uid = btn.getAttribute('data-uid') || '';
        if (!this._exclusivosSel) this._exclusivosSel = {};
        if (uid) this._exclusivosSel[gk] = uid;
        else delete this._exclusivosSel[gk];
        pop.querySelectorAll(`.ks-excl-opt[data-gk="${gk}"]`).forEach(b => {
          b.classList.toggle('active', b === btn);
        });
      }));
      // v1.1.81 — stepper de cantidad. No re-renderiza el popup entero
      // (perdería el scroll y las variantes marcadas): solo repinta el
      // número y la coletilla.
      {
        const val = pop.querySelector('#dQtyVal');
        const hint = pop.querySelector('#dQtyHint');
        const pinta = () => {
          if (val) val.textContent = String(this._cantidad);
          if (hint) hint.textContent = this._cantidad > 1 ? `${this._cantidad} pases encadenados` : 'un solo pase';
        };
        pop.querySelector('#dQtyMinus')?.addEventListener('click', () => {
          this._cantidad = Math.max(1, (Number(this._cantidad) || 1) - 1); pinta();
        });
        pop.querySelector('#dQtyPlus')?.addEventListener('click', () => {
          this._cantidad = Math.min(CANT_MAX_LINEA, (Number(this._cantidad) || 1) + 1); pinta();
        });
      }
      pop.querySelector('#dAdd').addEventListener('click', () => this._armarServicio());
    }

    _armarServicio() {
      if (!this._detail) return;
      if (!this._cliente || !this._cliente.nombre) { this._toast('Selecciona o crea un cliente primero'); return; }
      // v1.1.81 — El servicio A MEDIDA va por otro circuito
      // ('servicio-medida' → crearReservaMedida) y no participa en la
      // cadena de agregar-servicio. No se encadena nada sobre él: si se
      // permitiera, las líneas encoladas quedarían huérfanas.
      if (this._armed && this._armed.medida) {
        this._toast('Coloca primero el servicio a medida · luego añade el resto');
        return;
      }

      // v1.1.44 — Construir la lista de complementos elegidos. Cada entrada de
      // _complSel puede ser:
      //   · true                → complemento simple (toggle) → se manda el uid (string).
      //   · { varianteIdx }     → complemento con variante → objeto con la variante.
      // Además, validar que los complementos OBLIGATORIOS (required) tengan
      // variante elegida; si falta alguno, no se arma.
      const comps = Array.isArray(this._detail.complementos) ? this._detail.complementos : [];
      const complementosSetupUid = [];
      for (const c of comps) {
        const sel = this._complSel[c.setupUid];
        const tieneVars = c.hasVariants && Array.isArray(c.variantes) && c.variantes.length;
        if (tieneVars) {
          if (sel && typeof sel === 'object') {
            const v = c.variantes[sel.varianteIdx];
            if (v) {
              complementosSetupUid.push({
                uid: c.setupUid,
                varianteId: (typeof v === 'object' && v.tamano_estilo) ? v.tamano_estilo : String(sel.varianteIdx),
                varianteLabel: (typeof v === 'object') ? (v.label || v.nombre || '') : String(v),
                price: (typeof v === 'object') ? Number(v.precio != null ? v.precio : v.price) || 0 : 0,
                duration: (typeof v === 'object') ? Number(v.duracion != null ? v.duracion : v.duration) || 0 : 0
              });
            }
          } else if (c.required) {
            this._toast(`Elige una opción de "${c.label}" (obligatorio)`);
            return;
          }
        } else {
          if (sel === true) complementosSetupUid.push(c.setupUid);
          else if (c.required) { this._toast(`"${c.label}" es obligatorio`); return; }
        }
      }

      // v1.1.59 — GRUPO EXCLUSIVO: añadir opciones elegidas al array
      // `complementosSetupUid` antes de armar. Recorre los items
      // tipo:'exclusivo' del mapeoFases; si hay elección guardada en
      // this._exclusivosSel[groupKey] (uid), la empuja con el mismo
      // shape que las variantes de complemento (patrón v1.1.44). El
      // motor recepcionProLogic v1.0.34 (rama tipo:'exclusivo' de
      // construirFasesPack) detecta el uid dentro de f.refs y
      // materializa el servicio en la posición del grupo.
      const mapeoArm = Array.isArray(this._detail.mapeoFases)
        ? this._detail.mapeoFases
        : (typeof this._detail.mapeoFases === 'string' ? this._tryParse(this._detail.mapeoFases) : []);
      if (Array.isArray(mapeoArm) && this._exclusivosSel) {
        mapeoArm.forEach((f, idx) => {
          if (!f || f.tipo !== 'exclusivo') return;
          const gk = 'exc:' + idx;
          const uidElegido = this._exclusivosSel[gk];
          if (!uidElegido) return;
          const svcRef = this._porSetupUid[uidElegido];
          if (!svcRef) return;
          complementosSetupUid.push({
            uid: svcRef.setupUid,
            varianteId: svcRef.setupUid,
            varianteLabel: svcRef.label || '',
            price: Number(svcRef.price) || 0,
            duration: Number(svcRef.duration) || 0
          });
        });
      }

      // v1.1.81 — ARMADO MÚLTIPLE + CANTIDAD.
      // La línea armada se repite `cantidad` veces. La PRIMERA de todas
      // ocupa this._armed (crea la cita con crearPackReserva, con sus
      // variantes y complementos). Las demás esperan en _armedQueue y se
      // añaden a esa misma cita con `agregar-servicio`.
      const cantidad = Math.max(1, Math.min(CANT_MAX_LINEA, Number(this._cantidad) || 1));
      const linea = {
        servicio: this._detail,
        variantIdx: this._variantIdx,
        complementosSetupUid
      };

      let nuevas = 0;
      for (let i = 0; i < cantidad; i++) {
        // Copia superficial por línea: cada una viaja al backend por
        // separado y no deben compartir el array de complementos.
        const copia = {
          servicio: linea.servicio,
          variantIdx: linea.variantIdx,
          complementosSetupUid: complementosSetupUid.slice()
        };
        if (!this._armed) this._armed = copia;
        else this._armedQueue.push(copia);
        nuevas++;
      }

      this._closeDetail();
      this._renderArmedHint();
      this._renderCalendar();
      this._updateSteps();

      const totalLineas = 1 + this._armedQueue.length;
      if (totalLineas > 1) {
        // _toast usa textContent: nada que escapar, y esc() metería entidades.
        this._toast(`${linea.servicio.label} ×${nuevas} · ${totalLineas} servicios en la cita`);
      } else {
        this._toast('Servicio armado · clic en el calendario para colocar');
      }
    }

    // v1.1.81 — Limpia TODO el armado (línea actual + cola + estado de la
    // cadena en curso). Se llama al cancelar y al terminar de colocar.
    _desarmar() {
      this._armed = null;
      this._armedQueue = [];
      this._packReservaId = null;
      this._packStaffId = null;
      this._chainActivo = false;
      this._chainMoving = false;
      this._pendingMove = null;
      this._moveQueue = [];
      this._reservando = false;
      this._renderArmedHint();
      this._renderCalendar();
      this._updateSteps();
    }

    _renderArmedHint() {
      const el = this.shadowRoot.getElementById('armedHint');
      if (!el) return;
      if (!this._armed) { el.innerHTML = ''; return; }

      const pendientes = this._armedQueue.length;
      const total = 1 + pendientes;

      if (total === 1) {
        // Caso clásico de una sola línea: hint idéntico al de siempre.
        el.innerHTML = `<span class="ks-legchip leg-pending" style="padding-left:9px">Colocando: ${esc(this._armed.servicio.label)}</span><button class="ks-tool" id="armedCancel" title="Cancelar">✕</button>`;
      } else {
        // v1.1.81 — varias líneas: número de orden, lista completa y
        // selector de profesional. El chip resaltado es el que se coloca
        // con el siguiente clic en el calendario.
        const colocadas = this._packReservaId ? (total - pendientes - 1) : 0;
        const items = [this._armed].concat(this._armedQueue)
          .map((l, i) => `<span class="ks-armed-item ${i === 0 ? 'is-now' : ''}">${esc(l.servicio.label)}</span>`)
          .join('');
        el.innerHTML = `
          <div class="ks-armed-wrap">
            <span class="ks-armed-count">${colocadas + 1} / ${colocadas + total}</span>
            <div class="ks-armed-list">${items}</div>
            <div class="ks-armed-mode" title="¿Todos los servicios con el mismo profesional?">
              <button class="ks-armed-modebtn ${this._armedStaffMode === 'same' ? 'active' : ''}" id="armedModeSame">Mismo profesional</button>
              <button class="ks-armed-modebtn ${this._armedStaffMode === 'each' ? 'active' : ''}" id="armedModeEach">Elegir por servicio</button>
            </div>
            <button class="ks-tool" id="armedCancel" title="Cancelar armado">✕</button>
          </div>`;
      }

      const c = this.shadowRoot.getElementById('armedCancel');
      if (c) c.addEventListener('click', () => this._cancelarArmado());
      const bSame = this.shadowRoot.getElementById('armedModeSame');
      const bEach = this.shadowRoot.getElementById('armedModeEach');
      // El modo se puede cambiar mientras no haya empezado la cadena: una
      // vez creada la cita, cambiar de criterio a media colocación solo
      // genera confusión.
      if (bSame) bSame.addEventListener('click', () => {
        if (this._packReservaId) { this._toast('La cita ya está empezada · termina de colocarla'); return; }
        this._armedStaffMode = 'same'; this._renderArmedHint();
      });
      if (bEach) bEach.addEventListener('click', () => {
        if (this._packReservaId) { this._toast('La cita ya está empezada · termina de colocarla'); return; }
        this._armedStaffMode = 'each'; this._renderArmedHint();
      });
    }

    // v1.1.81 — Cancelar desde la cabecera. Si la cita YA se creó y quedan
    // líneas por colocar, el ✕ no borra nada del calendario: la cita creada
    // se queda como está y solo se descarta lo que faltaba por añadir. Se
    // avisa para que el operador no crea que ha cancelado la cita entera.
    _cancelarArmado() {
      const habiaCita = !!this._packReservaId;
      const pendientes = this._armedQueue.length + (this._armed ? 1 : 0);
      this._desarmar();
      if (habiaCita && pendientes > 0) {
        this._toast(`Cita creada · se descartan ${pendientes} servicio(s) sin colocar`);
        this._sendToPage('getReservas', { fecha: this._fecha });
      }
    }

    // ═══════════════════════════════════════════════════
    // CALENDARIO
    // ═══════════════════════════════════════════════════
    _renderCalendar() {
      const root = this.shadowRoot;
      const wrap = root.getElementById('calWrap');
      if (!wrap) return;
      // v1.1.54 — FIX race condition primer render. Si this._staff aún
      // está vacío, es porque el backend todavía no respondió 'staffData'
      // — estado TRANSITORIO, no es un error de config. Salir sin tocar
      // el DOM mantiene el placeholder "Cargando agenda…" intacto, y
      // cuando staffData llegue se re-llamará a _renderCalendar y pintará
      // bien. Si después de tener staff cargado _getVisibleStaff() devuelve
      // [], ESO sí significa "todos ocultos en Ajustes" y el mensaje de
      // abajo es correcto.
      if (!Array.isArray(this._staff) || this._staff.length === 0) return;
      // v1.1.8 — usar visible/ordered desde settings
      const staff = this._getVisibleStaff();
      if (!staff.length) { wrap.innerHTML = `<div class="ks-empty">Sin empleados visibles (revisa Ajustes ⚙).</div>`; return; }

      // v1.1.8 — rowHeight aplicable; PX_PER_MIN se mantiene constante para no descuadrar citas existentes
      const rowPx = this._settings.rowHeight || ROW_PX;
      const ppm = rowPx / 60; // alto por minuto del render actual
      // v1.1.9 — subdivisiones por hora según interval (1=60, 2=30, 4=15, 6=10)
      const interval = this._settings.interval || 30;
      const subdiv = Math.max(1, Math.round(60 / interval));
      // Background con líneas internas a cada interval (excluye bordes 0 y 100% que ya son border-top/bottom de la celda)
      const subBg = subdiv > 1
        ? `background-image:repeating-linear-gradient(to bottom, transparent 0, transparent calc(100% / ${subdiv} - 1px), var(--ks-line2) calc(100% / ${subdiv} - 1px), var(--ks-line2) calc(100% / ${subdiv}));`
        : '';
      // Etiquetas de minutos en el gutter (a cada interval, salvo en :00 que ya está)
      let subTimeLabels = '';
      if (subdiv > 1) {
        for (let k = 1; k < subdiv; k++) {
          const pct = (100 / subdiv) * k;
          const mm = String(k * interval).padStart(2, '0');
          subTimeLabels += `<span class="ks-timelabel-sub" style="top:${pct}%">:${mm}</span>`;
        }
      }

      const totalMin = (CAL_END - CAL_START) * 60;
      const nHours = CAL_END - CAL_START;
      const armable = !!this._armed;

      // v1.1.36 — Cálculo de lanes (side-by-side overlap rendering).
      // Por cada columna de staff, agrupa los bloques que se solapan
      // total o parcialmente y los divide horizontalmente para que NO
      // se pinten unos encima de otros. Mismo patrón que Google Calendar.
      const lanesPorStaff = this._calcularLanesAgenda(staff);

      let head = `<div class="ks-grid-headrow"><div class="ks-timegutter-head"></div>`;
      for (const s of staff) {
        const col = this._staffColor(s.wixResourceId);
        head += `<div class="ks-colhead-cell"><div class="ks-colhead"><span class="ks-colhead-dot" style="background:${col}"></span><span class="ks-colhead-name">${esc(s.displayName)}</span>${s.isExternal ? '<span class="ks-ext-tag">ext</span>' : ''}</div></div>`;
      }
      head += `</div>`;

      let gutter = `<div class="ks-timegutter">`;
      for (let h = CAL_START; h < CAL_END; h++) gutter += `<div class="ks-timecell" style="height:${rowPx}px;position:relative"><span class="ks-timelabel">${String(h).padStart(2, '0')}:00</span>${subTimeLabels}</div>`;
      gutter += `</div>`;

      let cols = '';
      for (const s of staff) {
        let hourcells = '';
        for (let h = CAL_START; h < CAL_END; h++) hourcells += `<div class="ks-hourcell" style="height:${rowPx}px;${subBg}"></div>`;
        // v1.1.29 — Una reserva puede aparecer parcialmente en varias columnas si
        // tiene fases con staffId propio distinto al raíz. Cribado por reserva:
        // se incluye si tiene staffId raíz = s OR alguna fase ocupante con staffId = s.
        // v1.1.40 — Excluir family='BLOQUEO': los bloqueos NO se pintan como
        // cita normal (no tienen cliente, no tienen modal, no entran en
        // lanes, no entran en stats, no entran en semáforo de solapes).
        // Tienen su propio render rayado diagonal más abajo.
        const appts = this._reservas.filter(r => {
          if (r.status === 'CANCELADA') return false;
          if (r.family === 'BLOQUEO') return false;
          if (r.staffId === s.wixResourceId) return true;
          const fases = Array.isArray(r.fases) ? r.fases : (r.fases?.items || []);
          return fases.some(f => f && f.ocupa && f.staffId === s.wixResourceId);
        });
        // v1.1.36 — pasamos el mapa de lanes de ESTA columna al render.
        const lanesMap = lanesPorStaff[s.wixResourceId] || {};
        const apptHTML = appts.map(r => this._apptHTML(r, { ...s, color: this._staffColor(s.wixResourceId), lanesMap }, ppm)).join('');
        // v1.1.40 — Bloqueos persistentes desde this._reservas (no de un
        // array local). Cada fila con family='BLOQUEO' que toque ESTA
        // columna se pinta como .ks-customblock (rayado diagonal).
        const bloqueos = this._reservas.filter(r =>
          r.family === 'BLOQUEO' &&
          r.staffId === s.wixResourceId &&
          r.status !== 'CANCELADA'
        );
        const blocks = bloqueos.map(b => this._blockHTML(b, ppm)).join('');
        cols += `<div class="ks-col ${s.isExternal ? 'is-ext' : ''} ${armable ? 'is-blockable' : ''}" data-staff="${esc(s.wixResourceId)}">${hourcells}${apptHTML}${blocks}</div>`;
      }

      let now = '';
      if (this._fecha === todayISO()) {
        const nm = this._madridNowMin() - CAL_START * 60;
        if (nm >= 0 && nm < totalMin) now = `<div class="ks-nowline" style="top:${nm * ppm}px"><span class="ks-nowdot"></span></div>`;
      }

      wrap.innerHTML = `<div class="ks-grid"><div class="ks-grid-headrow-wrap">${head}</div><div class="ks-grid-body">${gutter}<div class="ks-cols">${now}${cols}</div></div></div>`;

      // clic en columna (armado) o arrastre (bloqueo)
      wrap.querySelectorAll('.ks-col').forEach(col => {
        const staffId = col.getAttribute('data-staff');
        if (armable) {
          col.addEventListener('click', e => {
            if (e.target.closest('.ks-appt')) return;
            // v1.1.64 — pre-check de cliente antes de abrir el selector (mismo
            // criterio que _colocarReserva, para feedback inmediato).
            if (!this._cliente || !this._cliente.nombre) { this._toast('Selecciona un cliente'); return; }
            const rect = col.getBoundingClientRect();
            const y = e.clientY - rect.top;
            const snap = this._settings.interval && [10, 15, 30].includes(this._settings.interval) ? this._settings.interval : 5;
            const mins = CAL_START * 60 + Math.round((y / ppm) / snap) * snap;
            // v1.1.64 — confirmar hora antes de pintar. El pintado real ocurre
            // al Confirmar dentro de _openHoraPicker → _colocarReserva.
            const svcSub = (this._armed && this._armed.servicio) ? this._armed.servicio.label : '';
            const cliSub = (this._cliente && this._cliente.nombre) ? this._cliente.nombre : '';
            this._openHoraPicker({ mode: 'colocar', staffId, mins, title: 'Hora de inicio', subtitle: [svcSub, cliSub].filter(Boolean).join(' · ') });
          });
        } else {
          this._bindBlockDrag(col, staffId, ppm);
        }
      });
      wrap.querySelectorAll('.ks-appt').forEach(a => a.addEventListener('click', e => {
        // v1.1.14 — el resize handle no debe abrir el modal
        if (e.target.closest('.ks-appt-resize')) return;
        // v1.1.64 — el icono de ajustar hora tampoco abre el modal
        if (e.target.closest('.ks-appt-timeadj')) return;
        // v1.1.29 — si terminamos drag de fase, no abrir modal
        if (this._suppressApptClick) return;
        e.stopPropagation();
        const r = this._reservas.find(x => x._id === a.getAttribute('data-id')); if (r) this._openModal(r);
      }));
      // v1.1.29 — drag&drop por fase (mover bloque a otra hora/staff)
      wrap.querySelectorAll('.ks-appt[data-draggable="1"][data-fase-idx]').forEach(b => {
        if (b.getAttribute('data-fase-idx') === '-1') return;   // legacy sin fase
        this._bindFaseDrag(wrap, b, ppm);
      });
      // v1.1.64 — icono 🕑: reajustar la hora de inicio de la fase con el
      // mismo selector que el pintado. Mismo gate que el drag (solo
      // draggable=1 → fases no pagadas con índice real). Envía el
      // 'mover-fase' existente (MISMA fecha, MISMO staff de la columna).
      wrap.querySelectorAll('.ks-appt-timeadj').forEach(icon => icon.addEventListener('click', e => {
        e.stopPropagation();
        const appt = icon.closest('.ks-appt'); if (!appt) return;
        const reservaId = appt.getAttribute('data-id');
        const faseIndex = parseInt(appt.getAttribute('data-fase-idx'), 10);
        if (isNaN(faseIndex) || faseIndex < 0) return;
        const startISO = appt.getAttribute('data-fase-start');
        const faseDur = parseInt(appt.getAttribute('data-fase-dur'), 10) || 30;
        const staffId = appt.closest('.ks-col')?.getAttribute('data-staff') || '';
        const r = this._reservas.find(x => x._id === reservaId) || {};
        let minsAct = CAL_START * 60;
        if (startISO) {
          const dd = new Date(startISO);
          const hh = dd.toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hour12: false });
          minsAct = hhmmToMin(hh);
        }
        this._openHoraPicker({ mode: 'fase', reservaId, faseIndex, mins: minsAct, staffId, faseDur, title: 'Ajustar inicio de fase', subtitle: r.clientName || '' });
      }));
      // v1.1.14 — drag del resize handle (extensión)
      wrap.querySelectorAll('.ks-appt-resize').forEach(h => this._bindResizeExt(wrap, h));
      // v1.1.14 — click ✕ en la extensión rayada → quitar extensión
      wrap.querySelectorAll('.ks-appt-ext-rm').forEach(b => b.addEventListener('click', e => {
        e.stopPropagation();
        const id = b.getAttribute('data-id');
        if (!id) return;
        this._sendToPage('quitar-extension', { reservaId: id });
      }));
      // v1.1.40 — Click ✕: enviar eliminarBloqueo al backend (no tocar
      // array local, ya no existe). El backend valida family='BLOQUEO'
      // antes de borrar; al recibir 'bloqueoEliminado' refrescamos.
      wrap.querySelectorAll('.ks-customblock-rm').forEach(b => b.addEventListener('click', e => {
        e.stopPropagation();
        const id = b.getAttribute('data-bid');
        if (!id) return;
        if (!confirm('¿Quitar este bloqueo?')) return;
        this._sendToPage('eliminarBloqueo', { id });
      }));
      // v1.1.40 — Click en el bloqueo (no en el ✕): editar motivo via
      // prompt + actualizarBloqueo en backend. Read-merge-update en
      // backend mantiene fecha y duración intactas si solo cambia motivo.
      wrap.querySelectorAll('.ks-customblock').forEach(b => b.addEventListener('click', e => {
        if (e.target.closest('.ks-customblock-rm')) return;
        e.stopPropagation();
        const id = b.getAttribute('data-bid');
        if (!id) return;
        const reserva = (this._reservas || []).find(r => r._id === id);
        if (!reserva) return;
        // Recuperar motivo actual: 1º fase, 2º clientName con prefijo.
        const fasesArr = Array.isArray(reserva.fases) ? reserva.fases : (reserva.fases?.items || []);
        let actual = (fasesArr[0] && fasesArr[0].label) || '';
        if (!actual && typeof reserva.clientName === 'string' && reserva.clientName.startsWith('BLOQUEO:')) {
          actual = reserva.clientName.substring(8).trim();
        }
        if (actual === 'Bloqueado') actual = '';
        const nuevo = window.prompt('Motivo del bloqueo:', actual);
        if (nuevo === null) return;   // cancelar
        const motivoFinal = nuevo.trim() || 'Bloqueado';
        this._sendToPage('actualizarBloqueo', { id, motivo: motivoFinal });
      }));
    }

    // ── v1.1.87 · CAPA TÁCTIL ─────────────────────────────────
    // Traduce el gesto del dedo a eventos de ratón sintéticos. La lógica
    // de arrastre (ghost, snap a 5 min, preview, commit al page code) no
    // se toca: recibe exactamente los mismos eventos que recibiría de un
    // ratón real.
    //
    //   · mousedown → sobre el elemento REAL tocado, para que los
    //     guardias e.target.closest('.ks-appt-resize' / '.ks-appt-timeadj')
    //     de los handlers existentes sigan funcionando igual.
    //   · mousemove / mouseup → sobre `document` con bubbles:true. Alcanza
    //     a los listeners de document (_bindFaseDrag) y a los de window
    //     (_bindResizeExt, _bindBlockDrag), porque document propaga hacia
    //     window.
    _fireSyntheticMouse(target, type, x, y) {
      if (!target) return;
      try {
        target.dispatchEvent(new MouseEvent(type, {
          bubbles: true, cancelable: true, composed: true, view: window,
          button: 0, buttons: (type === 'mouseup' ? 0 : 1),
          clientX: x, clientY: y
        }));
      } catch (_) { /* navegador sin constructor MouseEvent: se ignora */ }
    }

    // PULSACIÓN LARGA (450ms quieto) + arrastrar. Para elementos que
    // además son superficie de scroll: bloques de cita y columnas libres.
    // Mientras no está armado NO se llama a preventDefault → el scroll
    // vertical del calendario y el click nativo (abrir cita) siguen
    // funcionando exactamente igual.
    // opts: { skipSelector, armedClass }
    _bindTouchLongPressDrag(el, opts) {
      const o = opts || {};
      const HOLD_MS = 450;
      const SLOP = 10;
      let timer = null, armed = false, downTarget = null;
      let x0 = 0, y0 = 0, lastX = 0, lastY = 0;

      const limpiar = () => {
        if (timer) { clearTimeout(timer); timer = null; }
        if (armed && o.armedClass) el.classList.remove(o.armedClass);
        armed = false; downTarget = null;
      };

      el.addEventListener('touchstart', e => {
        if (!e.touches || e.touches.length !== 1) { limpiar(); return; }
        const tgt = e.target;
        // Mismos guardias que el camino de ratón.
        if (o.skipSelector && tgt && tgt.closest && tgt.closest(o.skipSelector)) return;
        const t = e.touches[0];
        downTarget = tgt;
        x0 = lastX = t.clientX; y0 = lastY = t.clientY;
        armed = false;
        timer = setTimeout(() => {
          timer = null; armed = true;
          if (o.armedClass) el.classList.add(o.armedClass);
          try { if (navigator.vibrate) navigator.vibrate(15); } catch (_) {}
          this._fireSyntheticMouse(downTarget, 'mousedown', lastX, lastY);
        }, HOLD_MS);
      }, { passive: false });

      el.addEventListener('touchmove', e => {
        const t = e.touches && e.touches[0]; if (!t) return;
        lastX = t.clientX; lastY = t.clientY;
        if (!armed) {
          // Aún en la ventana de espera: si el dedo se mueve es un scroll,
          // no un arrastre. Se cancela y se deja pasar el gesto al navegador.
          if (Math.abs(lastX - x0) > SLOP || Math.abs(lastY - y0) > SLOP) limpiar();
          return;
        }
        e.preventDefault();          // el gesto es nuestro: no hay scroll
        this._fireSyntheticMouse(document, 'mousemove', lastX, lastY);
      }, { passive: false });

      el.addEventListener('touchend', e => {
        if (timer) { clearTimeout(timer); timer = null; }
        if (!armed) { downTarget = null; return; }
        const t = (e.changedTouches && e.changedTouches[0]) || null;
        const fx = t ? t.clientX : lastX, fy = t ? t.clientY : lastY;
        if (o.armedClass) el.classList.remove(o.armedClass);
        armed = false; downTarget = null;
        e.preventDefault();          // evita el click fantasma al soltar
        this._fireSyntheticMouse(document, 'mouseup', fx, fy);
      }, { passive: false });

      el.addEventListener('touchcancel', () => {
        if (timer) { clearTimeout(timer); timer = null; }
        if (!armed) { downTarget = null; return; }
        if (o.armedClass) el.classList.remove(o.armedClass);
        armed = false; downTarget = null;
        this._fireSyntheticMouse(document, 'mouseup', lastX, lastY);
      }, { passive: false });
    }

    // ARRASTRE INMEDIATO. Para las dos asas de resize: objetivos
    // deliberados y diminutos, nunca superficie de scroll. preventDefault
    // en touchstart impide que la rejilla se desplace y suprime el click.
    _bindTouchImmediateDrag(el) {
      let lastX = 0, lastY = 0, activo = false;

      el.addEventListener('touchstart', e => {
        if (!e.touches || e.touches.length !== 1) return;
        const t = e.touches[0];
        lastX = t.clientX; lastY = t.clientY; activo = true;
        e.preventDefault(); e.stopPropagation();
        this._fireSyntheticMouse(el, 'mousedown', lastX, lastY);
      }, { passive: false });

      el.addEventListener('touchmove', e => {
        if (!activo) return;
        const t = e.touches && e.touches[0]; if (!t) return;
        lastX = t.clientX; lastY = t.clientY;
        e.preventDefault(); e.stopPropagation();
        this._fireSyntheticMouse(document, 'mousemove', lastX, lastY);
      }, { passive: false });

      const fin = e => {
        if (!activo) return;
        activo = false;
        const t = (e.changedTouches && e.changedTouches[0]) || null;
        const fx = t ? t.clientX : lastX, fy = t ? t.clientY : lastY;
        e.preventDefault(); e.stopPropagation();
        this._fireSyntheticMouse(document, 'mouseup', fx, fy);
      };
      el.addEventListener('touchend', fin, { passive: false });
      el.addEventListener('touchcancel', fin, { passive: false });
    }

    // v1.1.29 — DRAG&DROP DE FASE
    //   Mantén pulsado un bloque ocupante y arrástralo: aparece un ghost que
    //   sigue el cursor. Al soltar sobre otra celda → moverFase con la nueva
    //   hora y el staff de la columna destino. Si se suelta sobre la misma
    //   columna y misma hora (o muy cerca), cancela y trata como click.
    //   Snap a 5 min. PAGADO no es draggable (data-draggable="0").
    _bindFaseDrag(wrap, btn, ppm) {
      const _ppm = ppm || PX_PER_MIN;
      const reservaId = btn.dataset.id;
      const faseIdx = parseInt(btn.dataset.faseIdx, 10);
      const faseDur = parseInt(btn.dataset.faseDur, 10) || 30;
      const THRESHOLD = 5;
      let downX = 0, downY = 0, ghost = null, dragging = false;

      btn.addEventListener('mousedown', e => {
        if (e.button !== 0) return;
        // Si se toca el resize handle, dejarlo
        if (e.target.closest('.ks-appt-resize')) return;
        // v1.1.64 — el icono de ajustar hora no inicia arrastre
        if (e.target.closest('.ks-appt-timeadj')) return;
        downX = e.clientX; downY = e.clientY;
        dragging = false;
        const onMove = (ev) => {
          const dx = ev.clientX - downX, dy = ev.clientY - downY;
          if (!dragging && (Math.abs(dx) > THRESHOLD || Math.abs(dy) > THRESHOLD)) {
            dragging = true;
            this._suppressApptClick = true;
            btn.classList.add('is-dragging');
            ghost = document.createElement('div');
            ghost.className = 'ks-fase-ghost';
            const cliente = (this._reservas.find(r => r._id === reservaId) || {}).clientName || '';
            const labelTxt = btn.querySelector('.ks-appt-svc, .ks-appt-client')?.textContent || 'Servicio';
            ghost.innerHTML = `<div class="g-cli">${esc(cliente)}</div><div class="g-svc">${esc(labelTxt)} · ${faseDur}′</div><div class="g-time"></div>`;
            this.shadowRoot.appendChild(ghost);
          }
          if (dragging && ghost) {
            ghost.style.left = (ev.clientX + 12) + 'px';
            ghost.style.top  = (ev.clientY - 8)  + 'px';
            // Resaltar columna destino
            this.shadowRoot.querySelectorAll('.ks-col.is-drop').forEach(c => c.classList.remove('is-drop'));
            const cells = wrap.querySelectorAll('.ks-col');
            for (const c of cells) {
              const r = c.getBoundingClientRect();
              if (ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom) {
                c.classList.add('is-drop'); break;
              }
            }
            // v1.1.64 — hora destino en vivo (snap 5 min, independiente del grid)
            const gt = ghost.querySelector('.g-time');
            const dropCol = this.shadowRoot.querySelector('.ks-col.is-drop');
            if (gt) {
              if (dropCol) {
                const rr = dropCol.getBoundingClientRect();
                let mm = CAL_START * 60 + Math.round(((ev.clientY - rr.top) / _ppm) / 5) * 5;
                mm = Math.max(CAL_START * 60, Math.min((CAL_END * 60) - faseDur, mm));
                gt.textContent = '🕑 ' + minToHHMM(mm);
              } else {
                gt.textContent = '';
              }
            }
          }
        };
        const onUp = (ev) => {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
          btn.classList.remove('is-dragging');
          this.shadowRoot.querySelectorAll('.ks-col.is-drop').forEach(c => c.classList.remove('is-drop'));
          if (ghost) { ghost.remove(); ghost = null; }
          if (!dragging) { this._suppressApptClick = false; return; }
          // Calcular columna y hora destino
          const cols = wrap.querySelectorAll('.ks-col');
          let target = null;
          for (const c of cols) {
            const r = c.getBoundingClientRect();
            if (ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom) { target = c; break; }
          }
          // Pequeño delay para que el click stopPropagation no abra el modal
          setTimeout(() => { this._suppressApptClick = false; }, 80);
          if (!target) { this._toast('Drop fuera del calendario'); return; }
          const staffIdDest = target.getAttribute('data-staff');
          const rect = target.getBoundingClientRect();
          const yIn = ev.clientY - rect.top;
          const minDesdeInicioGrid = yIn / _ppm;
          // v1.1.64 — snap del movimiento desacoplado del grid: siempre 5 min
          // (el grid puede ser de 15, pero mover una cita va de 5 en 5).
          const SNAP = 5;
          let minutosAbsolutos = CAL_START * 60 + Math.round(minDesdeInicioGrid / SNAP) * SNAP;
          if (minutosAbsolutos < CAL_START * 60) minutosAbsolutos = CAL_START * 60;
          if (minutosAbsolutos > (CAL_END * 60) - faseDur) minutosAbsolutos = (CAL_END * 60) - faseDur;
          // Componer fecha ISO en Madrid → UTC ISO
          const [yyyy, mm, dd] = this._fecha.split('-').map(Number);
          // Construir fecha en zona Madrid (CEST = UTC+2 en junio, CET = UTC+1 en invierno).
          // Usamos el truco: Date asume local del navegador; trabajamos con el offset que ya tiene
          // la cita actual de esta reserva (fechaReserva) para preservar la zona horaria del browser.
          // Estrategia robusta: tomar la fecha actual de la reserva, conservar el ISO date Y-M-D
          // si coincide con _fecha, y substituir solo HH:MM. Si no coincide, generar nueva en local.
          const hh = Math.floor(minutosAbsolutos / 60), mi = minutosAbsolutos % 60;
          // Fecha local del usuario en Madrid: el calendario está en Madrid, asume browser en Madrid.
          const nuevaLocal = new Date(yyyy, mm - 1, dd, hh, mi, 0, 0);
          const nuevaISO = nuevaLocal.toISOString();
          this._toast(`Moviendo a ${this._staffName(staffIdDest) || 'columna'} ${String(hh).padStart(2,'0')}:${String(mi).padStart(2,'0')}…`);
          this._sendToPage('mover-fase', {
            reservaId,
            faseIndex: faseIdx,
            nuevoStartISO: nuevaISO,
            nuevoStaffId: staffIdDest
          });
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });

      // v1.1.87 — mismo arrastre con el dedo: pulsación larga de 450ms y
      // luego mover. El toque corto sigue abriendo el modal de la cita y el
      // arrastre directo sigue haciendo scroll del calendario.
      this._bindTouchLongPressDrag(btn, {
        skipSelector: '.ks-appt-resize, .ks-appt-timeadj, .ks-appt-ext-rm',
        armedClass: 'is-touch-armed'
      });
    }

    // v1.1.14 — drag del resize handle para crear/modificar extensión.
    // Snap a 5 min. Al soltar envía 'extender-reserva' al page code.
    _bindResizeExt(wrap, handle) {
      const _ppm = parseFloat(handle.dataset.ppm) || PX_PER_MIN;
      const reservaId = handle.dataset.id;
      const appt = handle.closest('.ks-appt');
      if (!appt) return;
      const faseIndex = parseInt(handle.dataset.faseIdx, 10);

      // ── v1.1.65 — REDIMENSIONAR la duración de la fase (cualquier fase
      //    ocupante, faseIndex >= 0). El bloque crece/mengua al arrastrar y
      //    el backend redimensionarFase desplaza las fases posteriores para
      //    mantener la secuencia de la cascada. Envía 'redimensionar-fase'.
      if (faseIndex >= 0) {
        const durBase = parseInt(handle.dataset.faseDur, 10) || 30;
        const startMin = parseInt(handle.dataset.startMin, 10) || 0;
        let preview = null, startY = 0, curDur = durBase, dragging = false;
        handle.addEventListener('mousedown', e => {
          e.preventDefault(); e.stopPropagation();
          dragging = true; startY = e.clientY; curDur = durBase;
          // preview: el propio bloque creciendo desde su borde superior
          preview = document.createElement('div');
          preview.className = 'ks-appt-resize-preview';
          preview.style.top = appt.offsetTop + 'px';
          preview.style.height = Math.max(curDur * _ppm, 1) + 'px';
          preview.textContent = `${curDur}′`;
          appt.parentElement.appendChild(preview);
          const onMove = ev => {
            if (!dragging) return;
            const dy = ev.clientY - startY;
            let nd = durBase + Math.round((dy / _ppm) / 5) * 5;   // snap 5 min
            if (nd < 1) nd = 1;
            curDur = nd;
            preview.style.height = Math.max(nd * _ppm, 1) + 'px';
            preview.textContent = `${nd}′ · ${minToHHMM(startMin)}–${minToHHMM(startMin + nd)}`;
          };
          const onUp = () => {
            dragging = false;
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
            if (preview) { preview.remove(); preview = null; }
            if (curDur !== durBase) {
              this._toast(`Ajustando duración a ${curDur} min…`);
              this._sendToPage('redimensionar-fase', { reservaId, faseIndex, nuevaDur: curDur });
            }
          };
          window.addEventListener('mousemove', onMove);
          window.addEventListener('mouseup', onUp);
        });
        // v1.1.87 — misma asa con el dedo, arrastre inmediato.
        this._bindTouchImmediateDrag(handle);
        return;
      }

      // ── LEGACY (faseIndex = -1, reservas SIN fases): extensión con
      //    extensionMin (buffer rayado tras el bloque). Comportamiento previo
      //    intacto; envía 'extender-reserva'.
      const endMinBase = parseInt(handle.dataset.endMin, 10);   // min absoluto donde acaba la última fase (sin extensión)
      const extActual = Math.max(0, parseInt(handle.dataset.ext, 10) || 0);
      let preview = null, startY = 0, currentExt = extActual, dragging = false;
      handle.addEventListener('mousedown', e => {
        e.preventDefault(); e.stopPropagation();
        dragging = true; startY = e.clientY;
        currentExt = extActual;
        // preview rayado
        preview = document.createElement('div');
        preview.className = 'ks-appt-resize-preview';
        // Posición inicial debajo del último bloque
        const top = appt.offsetTop + appt.offsetHeight;
        const h = Math.max(currentExt * _ppm, 1);
        preview.style.top = (top) + 'px';
        preview.style.height = h + 'px';
        preview.textContent = currentExt > 0 ? `EXTENSIÓN · ${currentExt} MIN` : '';
        appt.parentElement.appendChild(preview);
        const onMove = ev => {
          if (!dragging) return;
          const dy = ev.clientY - startY;
          let extras = Math.max(0, Math.round((dy / _ppm) / 5) * 5);
          currentExt = extras;
          preview.style.height = Math.max(extras * _ppm, 1) + 'px';
          preview.textContent = extras > 0 ? `EXTENSIÓN · ${extras} MIN` : '';
        };
        const onUp = () => {
          dragging = false;
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
          if (preview) { preview.remove(); preview = null; }
          // Solo enviar si cambió respecto al actual
          if (currentExt !== extActual) {
            this._sendToPage('extender-reserva', { reservaId, minutosExtra: currentExt });
          }
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
      });
      // v1.1.87 — misma asa con el dedo, arrastre inmediato.
      this._bindTouchImmediateDrag(handle);
    }

    _madridNowMin() {
      const hhmm = new Date().toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hour12: false });
      return hhmmToMin(hhmm);
    }

    // v1.1.13 — devuelve N bloques (uno por fase con ocupa:true) en lugar
    // de 1 envolvente. Las fases con ocupa:false (proceso) NO se pintan:
    // la columna del stylist queda libre en ese tramo (F13 documentado).
    // v1.1.14 — marca la última fase ocupante (lleva resize handle) y, si
    // r.extensionMin > 0, añade un bloque rayado tras ella.
    // v1.1.36 — Side-by-side overlap rendering.
    // Genera el mapa de lanes por columna de staff:
    //   { staffId: { 'reservaId__faseIdx': { lane, total } } }
    // - lane:  0-indexed posición del bloque dentro del grupo de solape
    // - total: número total de lanes del grupo (max simultáneos)
    // Bloques con total=1 NO se reposicionan (el CSS por defecto los deja
    // ocupar todo el ancho de la columna con left:5px right:5px).
    _calcularLanesAgenda(staffArr) {
      const out = {};
      for (const s of staffArr) {
        const staffId = s.wixResourceId;
        const bloques = [];

        for (const r of this._reservas) {
          if (r.status === 'CANCELADA') continue;
          // v1.1.40 — Bloqueos no entran en lanes (se pintan aparte como
          // .ks-customblock con left:4px right:4px, sin division horizontal).
          if (r.family === 'BLOQUEO') continue;
          const fasesRaw = Array.isArray(r.fases) ? r.fases : (r.fases?.items || []);

          // Caso legacy: sin fases o todas no-ocupantes → 1 bloque con duracionTotal
          // en la columna del staff raíz.
          const fasesOcupantes = fasesRaw.filter(f => f && f.ocupa);
          if (fasesOcupantes.length === 0) {
            if (fasesRaw.length === 0 && r.staffId === staffId && r.fechaReserva && r.duracionTotal) {
              const startMin = this._isoToMadridMin(r.fechaReserva);
              if (startMin == null) continue;
              const dur = Number(r.duracionTotal) || 30;
              bloques.push({ key: `${r._id}__-1`, startMin, endMin: startMin + dur });
            }
            continue;
          }

          // Multi-fase: una entrada por fase ocupante que toque esta columna.
          for (let i = 0; i < fasesRaw.length; i++) {
            const f = fasesRaw[i];
            if (!f || !f.ocupa) continue;
            const fStaff = f.staffId || r.staffId;
            if (fStaff !== staffId) continue;
            const startISO = f.start || r.fechaReserva;
            const startMin = this._isoToMadridMin(startISO);
            if (startMin == null) continue;
            let dur = Number(f.dur) || 0;
            if (!dur && f.end && f.start) dur = Math.max(1, (new Date(f.end).getTime() - new Date(f.start).getTime()) / 60000);
            if (!dur) dur = 30;
            bloques.push({ key: `${r._id}__${i}`, startMin, endMin: startMin + dur });
          }
        }

        out[staffId] = this._asignarLanes(bloques);
      }
      return out;
    }

    // Algoritmo Google Calendar:
    //   1) Ordena por startMin ASC, endMin DESC (los más largos primero
    //      entre los que empiezan a la vez → mejor empaquetado).
    //   2) Asigna lane: primer lane cuyo último endMin <= bloque.startMin.
    //   3) Agrupa bloques solapados (Union-Find) para calcular total del grupo.
    _asignarLanes(bloques) {
      const result = {};
      const n = bloques.length;
      if (!n) return result;

      bloques.sort((a, b) => (a.startMin - b.startMin) || (b.endMin - a.endMin));

      const lanesEnd = []; // lanesEnd[i] = endMin del último bloque colocado en lane i
      for (const b of bloques) {
        let lane = -1;
        for (let i = 0; i < lanesEnd.length; i++) {
          if (lanesEnd[i] <= b.startMin) { lane = i; break; }
        }
        if (lane === -1) { lane = lanesEnd.length; lanesEnd.push(0); }
        lanesEnd[lane] = b.endMin;
        b.lane = lane;
      }

      // Union-Find por solape transitivo (clusters de bloques conectados).
      const parent = bloques.map((_, i) => i);
      const find = i => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
      const union = (a, c) => { const ra = find(a), rb = find(c); if (ra !== rb) parent[ra] = rb; };

      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          // ordenados por start → si j.start >= i.end no hay solape (ni con los siguientes que empiezan después).
          if (bloques[j].startMin >= bloques[i].endMin) break;
          union(i, j);
        }
      }

      // max(lane+1) por cluster
      const clusterMax = new Map();
      for (let i = 0; i < n; i++) {
        const root = find(i);
        clusterMax.set(root, Math.max(clusterMax.get(root) || 0, bloques[i].lane + 1));
      }

      for (let i = 0; i < n; i++) {
        const root = find(i);
        result[bloques[i].key] = { lane: bloques[i].lane, total: clusterMax.get(root) || 1 };
      }
      return result;
    }

    // Helper: ISO → minutos desde medianoche en Madrid.
    _isoToMadridMin(iso) {
      if (!iso) return null;
      try {
        const d = new Date(iso);
        if (isNaN(d.getTime())) return null;
        const hhmm = d.toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hour12: false });
        return hhmmToMin(hhmm);
      } catch (_) { return null; }
    }

    _apptHTML(r, staff, ppm) {
      if (!r.fechaReserva) return '';
      // v1.1.29 — admite fases con staffId propio. Filtra solo las que tocan
      // esta columna. Mantiene el ÍNDICE ORIGINAL del array (necesario para
      // mover por fase desde el backend).
      const fasesRaw = Array.isArray(r.fases) ? r.fases : (r.fases?.items || []);
      const fasesIdx = fasesRaw.map((f, idx) => ({ ...f, idx }));
      const fasesEnColTodas = fasesIdx.filter(f => {
        if (!f) return false;
        const fStaff = f.staffId || r.staffId;
        return fStaff === staff.wixResourceId;
      });
      const fasesOcupanCol = fasesEnColTodas.filter(f => f && f.ocupa);

      // Caso legacy: reserva sin fases o todas no-ocupantes → 1 bloque con duracionTotal
      // (solo se pinta en la columna del staff raíz)
      if (fasesOcupanCol.length === 0) {
        if (fasesRaw.length === 0 && r.staffId === staff.wixResourceId) {
          return this._apptBloqueHTML(r, staff, ppm, {
            startISO: r.fechaReserva,
            dur: Number(r.duracionTotal) || 30,
            label: (r.serviciosDetail || '').split(';;')[0]?.split('|')[0] || r.title || 'Servicio',
            esFasePrincipal: true,
            esUltimaFase: true,
            cascada: false,
            faseIndex: -1,   // -1 = sin índice, legacy
            laneInfo: staff.lanesMap?.[`${r._id}__-1`] || null   // v1.1.36
          }) + this._extensionHTML(r, staff, ppm, r.fechaReserva, Number(r.duracionTotal) || 30);
        }
        return '';
      }

      // Multi-bloque: una etiqueta por fase ocupante visible en ESTA columna
      // La cascada visual / última fase se refiere al conjunto GLOBAL de la cita.
      const fasesOcupanTodas = fasesIdx.filter(f => f && f.ocupa);
      const esCascada = fasesOcupanTodas.length > 1;
      const lastIdxGlobal = fasesOcupanTodas.length ? fasesOcupanTodas[fasesOcupanTodas.length - 1].idx : -1;
      const firstIdxGlobal = fasesOcupanTodas.length ? fasesOcupanTodas[0].idx : -1;

      // v1.1.67 — Fases de 1 min (marcadores tipo tamaño de pelo) NO se pintan
      // como bloque propio (ilegible): su leyenda se pliega en la cartela de la
      // fase principal y su minuto se suma al rango mostrado de esa fase. Es
      // SOLO visual: la fase sigue intacta en datos/ledger/CRM.
      const _durFase = (f) => {
        let d = Number(f.dur) || 0;
        if (!d && f.end && f.start) d = Math.max(1, (new Date(f.end).getTime() - new Date(f.start).getTime()) / 60000);
        return d || 30;
      };
      const _esTiny = (f) => Math.round(_durFase(f)) <= 1;
      const tinyCol = fasesOcupanCol.filter(_esTiny);
      const normalCol = fasesOcupanCol.filter(f => !_esTiny(f));
      // Solo se pliega si hay al menos una fase normal donde anclar; si todas
      // son tiny (servicio suelto de 1 min), se pinta todo normal.
      const plegar = normalCol.length > 0 && tinyCol.length > 0;
      // v1.1.68 — FIX: anclar el plegado a la fase PRINCIPAL, NO a la primera
      // fase de la cascada. La principal es SIEMPRE fase 'APLICACION' (complejo)
      // o 'SERVICIO' (simple); los complementos son 'COMPLEMENTO'/'INCLUIDA'.
      // Antes se anclaba a firstIdxGlobal: si la primera fase era corta (p.ej.
      // "Lavado previo" de 15 min < altura mínima de la línea plegada) la
      // leyenda no cabía y desaparecía (ni plegada ni como bloque). La
      // principal suele ser la fase larga → visible. Fallbacks: por label del
      // principal (1er item de serviciosDetail) y, en último caso, 1ª normal.
      const _principalLabel = String((String(r.serviciosDetail || '').split(';;')[0] || '').split('|')[0] || '').trim();
      const _anchorFase = plegar
        ? (normalCol.find(f => f && (f.fase === 'APLICACION' || f.fase === 'SERVICIO'))
           || normalCol.find(f => _principalLabel && String(f.label || '').trim() === _principalLabel)
           || normalCol[0])
        : null;
      const anchorIdx = _anchorFase ? _anchorFase.idx : -999;
      const foldLabels = plegar ? tinyCol.map(f => f.label || 'Servicio') : [];
      let foldMaxEndMin = null;
      if (plegar) {
        for (const f of tinyCol) {
          const endISO = f.end || new Date(new Date(f.start || r.fechaReserva).getTime() + _durFase(f) * 60000).toISOString();
          const m = this._isoToMadridMin(endISO);
          if (m != null && (foldMaxEndMin == null || m > foldMaxEndMin)) foldMaxEndMin = m;
        }
      }
      const fasesAPintar = plegar ? normalCol : fasesOcupanCol;

      // Fin de la última fase ocupante GLOBAL en esta columna (incl. tiny),
      // para la extensión legacy (extensionMin). Independiente del plegado.
      const _ultCol = fasesOcupanCol.find(f => f.idx === lastIdxGlobal);
      let lastFaseEndISO = _ultCol
        ? (_ultCol.end || new Date(new Date(_ultCol.start || r.fechaReserva).getTime() + _durFase(_ultCol) * 60000).toISOString())
        : null;

      let html = fasesAPintar.map(f => {
        const startISO = f.start || r.fechaReserva;
        const dur = _durFase(f);
        // Rango extendido con el minuto de las tiny SOLO en la fase ancla.
        let rangoEndMin = null;
        if (plegar && f.idx === anchorIdx && foldMaxEndMin != null) {
          const propioEndMin = this._isoToMadridMin(startISO) + Math.round(dur);
          rangoEndMin = Math.max(propioEndMin, foldMaxEndMin);
        }
        return this._apptBloqueHTML(r, staff, ppm, {
          startISO,
          dur,
          label: f.label || 'Servicio',
          esFasePrincipal: (f.idx === firstIdxGlobal),
          esUltimaFase: (f.idx === lastIdxGlobal),
          cascada: esCascada,
          faseIndex: f.idx,
          laneInfo: staff.lanesMap?.[`${r._id}__${f.idx}`] || null,   // v1.1.36
          foldLabels: (f.idx === anchorIdx) ? foldLabels : null,       // v1.1.67
          rangoEndMin                                                  // v1.1.67
        });
      }).join('');
      // Extensión: solo en la columna donde está la última fase
      if (lastFaseEndISO) html += this._extensionHTML(r, staff, ppm, lastFaseEndISO, 0);
      return html;
    }
    // v1.1.14 — Pinta el bloque rayado "EXTENSIÓN · N MIN" debajo de la
    // última fase ocupante. Sólo aparece si r.extensionMin > 0.
    _extensionHTML(r, staff, ppm, anchorISO, _unused) {
      const min = Number(r.extensionMin) || 0;
      if (min <= 0) return '';
      const _ppm = ppm || PX_PER_MIN;
      const d = new Date(anchorISO);
      const hhmm = d.toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hour12: false });
      const startMin = hhmmToMin(hhmm);
      const top = (startMin - CAL_START * 60) * _ppm;
      const height = Math.max(min * _ppm, 10);
      return `<div class="ks-appt-ext" data-id="${esc(r._id)}" style="top:${top}px;height:${height}px;--staff:${staff.color}">
        <span class="ks-appt-ext-lbl">EXTENSIÓN · ${min} MIN</span>
        <button class="ks-appt-ext-rm" data-id="${esc(r._id)}" title="Quitar extensión">✕</button>
      </div>`;
    }
    _apptBloqueHTML(r, staff, ppm, opts) {
      const _ppm = ppm || PX_PER_MIN;
      const d = new Date(opts.startISO);
      const hhmm = d.toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hour12: false });
      const startMin = hhmmToMin(hhmm);
      const top = (startMin - CAL_START * 60) * _ppm;
      const dur = Number(opts.dur) || 30;
      // v1.1.64 — suelo visual mínimo bajado a 10px para no condicionar
      // servicios cortos (p.ej. 1 min). La duración real (dur) es exacta.
      const height = Math.max(dur * _ppm, 10);
      const endHHMM = minToHHMM(startMin + Math.round(dur));
      // Resolver grupo del servicio principal para el color de familia
      let grupo = '';
      const primerLabel = (r.serviciosDetail || '').split(';;')[0]?.split('|')[0];
      if (primerLabel) {
        const match = (this._servicios || []).find(s => s.label === primerLabel);
        if (match) grupo = match.group || '';
      }
      const fam = hueColor(grupo || r.family || 'default', 0.5);
      const paid = r.status === 'PAGADO';
      const esMedida = (r.family === 'medida') || (typeof r.setupUid === 'string' && r.setupUid.startsWith('MEDIDA-'));
      const titleMode = this._settings?.titleMode || 'cliente';
      const labelFase = opts.label || 'Servicio';
      const cliente = r.clientName || '';
      const lineaArriba = titleMode === 'servicio'
        ? `<span class="ks-appt-time">${hhmm}</span><span class="ks-appt-client">${esc(labelFase)}${opts.cascada && opts.esFasePrincipal ? ' <span class="ks-cascade-flag">⛓ cascada</span>' : ''}</span>`
        : `<span class="ks-appt-time">${hhmm}</span><span class="ks-appt-client">${esc(cliente)}</span>`;
      const lineaAbajo = titleMode === 'servicio'
        ? `<span class="ks-appt-svc">${esc(cliente)}</span>`
        : `<span class="ks-appt-svc">${esc(labelFase)}${opts.cascada && opts.esFasePrincipal ? '<span class="ks-cascade-flag">⛓ cascada</span>' : ''}</span>`;
      // v1.1.67 — rango extendido con el minuto de las fases plegadas (tiny),
      // y línea de leyenda plegada (marcadores de 1 min, p.ej. tamaño de pelo).
      const rangoEndTxt = (opts.rangoEndMin != null) ? minToHHMM(opts.rangoEndMin) : endHHMM;
      const foldLine = (opts.foldLabels && opts.foldLabels.length)
        ? `<span class="ks-appt-fold">${opts.foldLabels.map(esc).join(' · ')}</span>`
        : '';
      const lineaHora = height >= 60 ? `<span class="ks-appt-rango">${hhmm} - ${rangoEndTxt}</span>` : '';
      // v1.1.29 — atributos para drag&drop por fase. Cita PAGADA no es draggable.
      const draggable = (!paid && opts.faseIndex >= 0) ? 1 : 0;
      // v1.1.36 — Side-by-side overlap rendering.
      // Si esta cita comparte slot con otra(s) en la misma columna de staff,
      // dividimos el ancho proporcionalmente en lugar de superponer. El CSS
      // por defecto deja `left:5px right:5px`; aquí lo sobreescribimos solo
      // cuando hay solapamiento real (laneInfo.total > 1).
      let lanePos = '';
      const li = opts.laneInfo;
      if (li && li.total > 1) {
        const w = 100 / li.total;
        const left = li.lane * w;
        // 3px de gap visual entre lanes.
        lanePos = `left:calc(${left}% + 3px);width:calc(${w}% - 6px);right:auto;`;
      }
      return `<button class="ks-appt ${paid ? 'is-paid' : 'is-pending'}${esMedida ? ' is-medida' : ''}" data-id="${esc(r._id)}" data-fase-idx="${opts.faseIndex}" data-fase-dur="${dur}" data-fase-start="${esc(opts.startISO)}" data-draggable="${draggable}" title="${esc(labelFase)} · ${hhmm}–${endHHMM}${cliente ? ' · ' + esc(cliente) : ''}" style="top:${top}px;height:${height}px;${lanePos}--staff:${staff.color};--fam:${fam}">
        <span class="ks-appt-statusdot">${paid ? '✓' : '€'}</span>
        ${draggable ? `<span class="ks-appt-timeadj" title="Ajustar hora de inicio">🕑</span>` : ''}
        <span class="ks-appt-inner">
          <span class="ks-appt-topline">${lineaArriba}</span>
          ${height >= 44 ? lineaAbajo : ''}
          ${height >= 44 ? foldLine : ''}
          ${lineaHora}
        </span>
        ${(!paid && (opts.faseIndex >= 0 || opts.esUltimaFase)) ? `<span class="ks-appt-resize" data-id="${esc(r._id)}" data-ppm="${_ppm}" data-fase-idx="${opts.faseIndex}" data-fase-dur="${Math.round(dur)}" data-start-min="${startMin}" data-end-iso="${esc(opts.startISO)}" data-end-min="${startMin + Math.round(dur)}" data-ext="${Number(r.extensionMin) || 0}" title="${opts.faseIndex >= 0 ? 'Arrastra para ajustar la duración de este servicio' : 'Arrastra para extender'}"></span>` : ''}
      </button>`;
    }
    // v1.1.40 — _blockHTML ahora recibe una RESERVA con family='BLOQUEO'
    // (no un objeto local). Calcula startMin/endMin desde r.fechaReserva
    // + r.duracionTotal en zona Madrid (mismo helper que el resto del
    // widget). El motivo se lee de la fase única o, como fallback,
    // se extrae quitando el prefijo 'BLOQUEO:' del clientName.
    _blockHTML(r, ppm) {
      const _ppm = ppm || PX_PER_MIN;
      if (!r.fechaReserva) return '';
      // Hora de inicio del bloqueo en minutos desde medianoche (Madrid).
      const startMinAbs = this._isoToMadridMin(r.fechaReserva);
      if (startMinAbs == null) return '';
      const dur = Number(r.duracionTotal) || 0;
      if (!dur) return '';
      const startMin = startMinAbs;
      const endMin = startMinAbs + dur;
      const top = (startMin - CAL_START * 60) * _ppm;
      const h = (endMin - startMin) * _ppm;
      const color = this._staffColor(r.staffId);
      // Motivo: 1º intento la fase, 2º intento parseando clientName,
      // 3º fallback 'Bloqueado'.
      const fasesArr = Array.isArray(r.fases) ? r.fases : (r.fases?.items || []);
      const faseLabel = (fasesArr[0] && fasesArr[0].label) ? fasesArr[0].label : '';
      let reason = faseLabel;
      if (!reason && typeof r.clientName === 'string' && r.clientName.startsWith('BLOQUEO:')) {
        reason = r.clientName.substring(8).trim();
      }
      if (!reason) reason = 'Bloqueado';
      return `<div class="ks-customblock" data-bid="${esc(r._id)}" title="Click: editar motivo" style="top:${top}px;height:${h}px;--staff:${color};cursor:pointer"><span class="ks-customblock-lbl">${esc(reason)}</span><button class="ks-customblock-rm" data-bid="${esc(r._id)}">✕</button></div>`;
    }

    _bindBlockDrag(col, staffId, ppm) {
      const _ppm = ppm || PX_PER_MIN;
      let dragging = false, startY = 0, preview = null;
      const yToMin = clientY => { const r = col.getBoundingClientRect(); return Math.max(CAL_START * 60, CAL_START * 60 + Math.round(((clientY - r.top) / _ppm) / 5) * 5); };
      col.addEventListener('mousedown', e => {
        if (e.target.closest('.ks-appt') || e.target.closest('.ks-customblock')) return;
        if (!this._puede('bloqueo')) { this._toast('No tienes permiso para esta acción'); return; }
        dragging = true; startY = yToMin(e.clientY);
        preview = document.createElement('div'); preview.className = 'ks-blockpreview'; col.appendChild(preview);
        const move = ev => {
          if (!dragging) return; const cur = yToMin(ev.clientY);
          const a = Math.min(startY, cur), b = Math.max(startY, cur);
          preview.style.top = ((a - CAL_START * 60) * _ppm) + 'px';
          preview.style.height = ((b - a) * _ppm) + 'px';
          preview.textContent = `Bloquear ${b - a} min`;
        };
        const up = ev => {
          dragging = false; window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up);
          const cur = yToMin(ev.clientY); const a = Math.min(startY, cur), b = Math.max(startY, cur);
          if (preview) preview.remove();
          if (b - a >= 10) {
            // v1.1.31 — prompt para nombrar el bloqueo. Cancelar / vacío → "Bloqueado".
            const motivo = (window.prompt('Motivo del bloqueo (opcional):', '') || '').trim();
            const motivoFinal = motivo || 'Bloqueado';
            // v1.1.40 — En lugar de push al array local (que no existe ya),
            // enviar 'crearBloqueo' al page code v1.0.17 → backend v1.0.20
            // crearBloqueo que inserta una fila en KamisuiteReservations
            // con family='BLOQUEO' y prefijo 'BLOQUEO:' en clientName.
            const horaInicio = minToHHMM(a);
            const duracion = b - a;
            this._sendToPage('crearBloqueo', {
              fechaISO: this._fecha,
              horaHHmm: horaInicio,
              duracionMin: duracion,
              staffId,
              motivo: motivoFinal
            });
            this._toast(`Bloqueando ${minToHHMM(a)}–${minToHHMM(b)}${motivo ? ' · ' + motivo : ''}…`);
          }
        };
        window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
      });

      // v1.1.87 — crear bloqueo con el dedo: pulsación larga de 450ms
      // sobre la columna libre y luego arrastrar verticalmente. Hasta que
      // no se arma, el dedo sigue haciendo scroll del calendario.
      this._bindTouchLongPressDrag(col, {
        skipSelector: '.ks-appt, .ks-customblock',
        armedClass: 'is-touch-armed'
      });
    }

    _colocarReserva(staffId, horaHHmm) {
      if (this._reservando || !this._armed) return;
      if (!this._puede('crearReserva')) { this._toast('No tienes permiso para esta acción'); return; }
      if (!this._cliente || !this._cliente.nombre) { this._toast('Selecciona un cliente'); return; }
      const staffObj = this._staff.find(s => s.wixResourceId === staffId) || {};
      const a = this._armed;
      const cli = this._cliente;
      const parts = (cli.nombre || '').split(' ');
      const firstName = parts.shift() || ''; const lastName = parts.join(' ');
      const esProvisional = !!cli.esProvisional;

      // v1.1.81 — Si la cita YA está creada, esta línea del armado no crea
      // una cita nueva: se añade a la que está en curso (modo "elegir por
      // servicio", donde el operador clica una columna por cada servicio).
      // El aviso de teléfono/email no se repite: ya se dio al crearla.
      if (this._packReservaId) {
        this._reservando = true;
        this._enviarAgregarServicio(this._armed, { staffId, horaHHmm });
        return;
      }

      // v1.1.33 — Warning falta teléfono y/o email.
      // No bloquea pero pide confirmación explícita: ese cliente no
      // recibirá WhatsApp ni email de confirmación/recordatorio. No se
      // aplica a provisionales (ya tienen badge que avisa).
      const sinTelf = !String(cli.telefono || '').trim();
      const sinEmail = !String(cli.email || '').trim();
      if (!esProvisional && sinTelf && sinEmail) {
        if (!confirm('Este cliente no tiene teléfono ni email. No recibirá confirmación ni recordatorio. ¿Continuar igualmente?')) {
          this._reservando = false;
          return;
        }
      }

      this._reservando = true;
      this._toast(a.medida ? 'Creando servicio a medida…' : 'Creando reserva…');

      // v1.1.12 — si está armado un servicio a medida, enviar 'servicio-medida'
      if (a.medida) {
        const svc = a.servicio || {};
        this._sendToPage('servicio-medida', {
          fechaISO: this._fecha,
          horaHHmm,
          duracionMin: Number(svc.duration) || 30,
          staffId,
          staffName: staffObj.displayName || '',
          descripcion: svc.label || 'Servicio a medida',
          precio: Number(svc.price) || 0,
          contactDetails: { firstName, lastName, email: cli.email || '', phone: cli.telefono || '' },
          memberContactId: esProvisional ? '' : (cli.contactId || ''),
          esProvisional
        });
        return;
      }

      // Reserva normal del catálogo
      // v1.1.43 — incluir la variante elegida del principal (si el servicio
      // tiene variantes). El backend (crearPackReserva v1.0.25) usa su
      // precio/duración en vez del base. Sin variante → null (precio base).
      // v1.1.81 — extracción a _varianteSelDeLinea (misma lógica, ahora
      // compartida con las líneas que se añaden vía agregar-servicio).
      const varianteSel = this._varianteSelDeLinea(a);
      // v1.1.81 — columna donde queda la línea 1: es la de la cita, y la
      // que heredan las fases añadidas si el modo es "mismo profesional".
      this._packStaffId = staffId;
      this._sendToPage('crearReserva', { payload: {
        fecha: this._fecha, horaHHmm,
        principalSetupUid: a.servicio.setupUid,
        complementosSetupUid: a.complementosSetupUid || [],
        varianteSel,
        staffId, staffName: staffObj.displayName || '',
        contactDetails: { firstName, lastName, email: cli.email || '', phone: cli.telefono || '' },
        memberContactId: esProvisional ? '' : (cli.contactId || ''),
        notas: '',
        esProvisional
      }});
    }

    // ═══════════════════════════════════════════════════
    // v1.1.81 — CADENA DEL ARMADO MÚLTIPLE
    //
    // Línea 1  → crearReserva  (crearPackReserva: crea la cita, dispara la
    //            única notificación al cliente).
    // Líneas 2+ → agregar-servicio (agregarServicioReserva: encadena detrás
    //            de la última fase que ocupa, dentro de la MISMA fila).
    // Resultado: una cita, un total, un cobro, un WhatsApp.
    //
    // En modo 'each' cada línea se coloca donde el operador clique; tras
    // añadirla se reubican sus fases con `mover-fase` (contrato existente).
    // ═══════════════════════════════════════════════════

    // Variante elegida de una línea armada, o null si el servicio no tiene
    // variantes. Misma forma que consume el backend desde v1.0.25.
    _varianteSelDeLinea(linea) {
      const sv = (linea && linea.servicio) || {};
      const vars = Array.isArray(sv.variantes) ? sv.variantes : [];
      const vi = Number(linea && linea.variantIdx) || 0;
      if (!sv.hasVariants || !vars.length || !vars[vi]) return null;
      const v = vars[vi];
      return {
        idx: vi,
        label: (v && (v.label || v.nombre)) ? String(v.label || v.nombre) : '',
        price: Number(v && v.precio != null ? v.precio : (v && v.price)) || 0,
        duration: Number(v && v.duracion != null ? v.duracion : (v && v.duration)) || 0
      };
    }

    // Envía una línea a la cita en curso. `dest` solo llega en modo 'each'
    // (columna y hora que ha elegido el operador para ESE servicio).
    _enviarAgregarServicio(linea, dest) {
      if (!linea || !this._packReservaId) return;
      this._pendingMove = (this._armedStaffMode === 'each' && dest) ? { ...dest } : null;
      this._toast(`Añadiendo ${linea.servicio.label}…`);
      this._sendToPage('agregar-servicio', {
        reservaId: this._packReservaId,
        setupUid: linea.servicio.setupUid,
        varianteSel: this._varianteSelDeLinea(linea),
        complementosSetupUid: linea.complementosSetupUid || []
      });
    }

    // Prepara la cola de reubicación de las fases recién añadidas,
    // conservando los desfases internos de la cascada respecto a la hora
    // elegida. Backend agregarServicioReserva v1.0.43 devuelve `fasesNuevas`
    // con su índice real dentro del array de fases de la reserva.
    _prepararMovimientos(fasesNuevas, dest) {
      const ocup = (Array.isArray(fasesNuevas) ? fasesNuevas : []).filter(f => f && f.ocupa && f.start);
      if (!ocup.length || !dest) return;
      const baseMs = Math.min.apply(null, ocup.map(f => new Date(f.start).getTime()));
      if (!isFinite(baseMs)) return;
      const [yyyy, mm, dd] = String(this._fecha).split('-').map(Number);
      const [hh, mi] = String(dest.horaHHmm || '00:00').split(':').map(Number);
      // Mismo patrón de construcción de ISO que el drag de fase y el
      // selector de hora (navegador del salón en Madrid).
      const destinoMs = new Date(yyyy, mm - 1, dd, hh || 0, mi || 0, 0, 0).getTime();
      this._moveQueue = ocup.map(f => ({
        faseIndex: f.index,
        nuevoStartISO: new Date(destinoMs + (new Date(f.start).getTime() - baseMs)).toISOString(),
        staffId: dest.staffId
      }));
      this._chainMoving = this._moveQueue.length > 0;
    }

    // Los movimientos van de UNO EN UNO. moverFase hace read-merge-update de
    // la fila completa: dos en paralelo se pisarían y se perdería una fase.
    _enviarSiguienteMovimiento() {
      const mv = this._moveQueue.shift();
      if (!mv) { this._chainMoving = false; this._avanzarCadena(); return; }
      this._sendToPage('mover-fase', {
        reservaId: this._packReservaId,
        faseIndex: mv.faseIndex,
        nuevoStartISO: mv.nuevoStartISO,
        nuevoStaffId: mv.staffId
      });
    }

    // Pasa a la siguiente línea pendiente, o cierra la cadena.
    _avanzarCadena() {
      this._chainMoving = false;
      if (this._armedQueue.length) {
        this._armed = this._armedQueue.shift();
        this._renderArmedHint();
        if (this._armedStaffMode === 'same') {
          this._reservando = true;
          this._enviarAgregarServicio(this._armed, null);
        } else {
          this._reservando = false;
          this._toast(`Elige columna y hora para ${this._armed.servicio.label}`);
          this._sendToPage('getReservas', { fecha: this._fecha });
        }
        return;
      }
      this._toast('Cita completa ✓');
      this._desarmar();
      this._sendToPage('getReservas', { fecha: this._fecha });
    }

    // ═══════════════════════════════════════════════════
    // v1.1.64 — SELECTOR DE HORA (confirmar antes de pintar / reajustar fase)
    //   Popup mínimo: display grande HH:MM + input time (paso 1 min) + ±5/±15
    //   + Confirmar. Dos modos:
    //     · 'colocar' → al confirmar llama _colocarReserva(staffId, hhmm)
    //       (crea la cita/cascada del servicio armado desde esa hora).
    //     · 'fase'    → al confirmar envía 'mover-fase' (contrato existente,
    //       backend moverFase) con la nueva hora, MISMA fecha y MISMO staff.
    //   Cero backend nuevo, cero colecciones, cero IDs.
    // ═══════════════════════════════════════════════════
    _openHoraPicker(opts) {
      const o = opts || {};
      const root = this.shadowRoot;
      root.getElementById('horaPickScrim')?.remove();

      const durGuard = (o.mode === 'fase') ? (Number(o.faseDur) || 0) : 0;
      const minMin = CAL_START * 60;
      const maxMin = (CAL_END * 60) - Math.max(1, durGuard);
      const clamp = (m) => Math.max(minMin, Math.min(maxMin, Math.round(m)));
      let mins = Number(o.mins);
      if (!isFinite(mins)) mins = minMin;
      mins = clamp(mins);

      const scrim = document.createElement('div');
      scrim.className = 'ks-modal-scrim'; scrim.id = 'horaPickScrim';
      scrim.addEventListener('click', (e) => { if (e.target === scrim) scrim.remove(); });

      const box = document.createElement('div');
      box.className = 'ks-horapick';
      const eyebrow = o.mode === 'fase' ? 'Reajustar fase' : 'Confirmar hora';
      const title = o.title || (o.mode === 'fase' ? 'Ajustar inicio' : 'Hora de inicio');
      const sub = o.subtitle ? `<div class="ks-horapick-sub">${esc(o.subtitle)}</div>` : '';
      box.innerHTML = `
        <div class="ks-horapick-head">
          <div><span class="ks-horapick-eyebrow">${eyebrow}</span><h3 class="ks-horapick-title">${esc(title)}</h3>${sub}</div>
          <button class="ks-modal-x" id="hpX">✕</button>
        </div>
        <div class="ks-horapick-display" id="hpDisplay">${minToHHMM(mins)}</div>
        <div class="ks-horapick-steppers">
          <button class="ks-horapick-step" data-d="-15">−15</button>
          <button class="ks-horapick-step" data-d="-5">−5</button>
          <input type="time" id="hpTime" class="ks-horapick-input" step="60" value="${minToHHMM(mins)}">
          <button class="ks-horapick-step" data-d="5">+5</button>
          <button class="ks-horapick-step" data-d="15">+15</button>
        </div>
        <div class="ks-horapick-foot">
          <button class="ks-detail-cancel" id="hpCancel">Cancelar</button>
          <button class="ks-detail-add" id="hpOk">Confirmar</button>
        </div>`;
      scrim.appendChild(box); root.appendChild(scrim);

      const input = box.querySelector('#hpTime');
      const display = box.querySelector('#hpDisplay');
      const setMins = (m) => { mins = clamp(m); input.value = minToHHMM(mins); display.textContent = minToHHMM(mins); };
      input.addEventListener('input', () => { if (input.value) { mins = clamp(hhmmToMin(input.value)); display.textContent = minToHHMM(mins); } });
      input.addEventListener('change', () => setMins(input.value ? hhmmToMin(input.value) : mins));
      box.querySelectorAll('.ks-horapick-step').forEach(b => b.addEventListener('click', () => {
        setMins(mins + (parseInt(b.getAttribute('data-d'), 10) || 0));
      }));
      box.querySelector('#hpX').addEventListener('click', () => scrim.remove());
      box.querySelector('#hpCancel').addEventListener('click', () => scrim.remove());
      box.querySelector('#hpOk').addEventListener('click', () => {
        const finalMin = clamp(mins);
        const hhmm = minToHHMM(finalMin);
        scrim.remove();
        if (o.mode === 'fase') {
          // Reajuste de hora de inicio de fase: MISMA fecha, MISMO staff.
          // Construye el ISO igual que el drag (navegador en Madrid).
          const [yyyy, mm, dd] = String(this._fecha).split('-').map(Number);
          const hh = Math.floor(finalMin / 60), mi = finalMin % 60;
          const nuevaISO = new Date(yyyy, mm - 1, dd, hh, mi, 0, 0).toISOString();
          this._toast(`Ajustando a ${hhmm}…`);
          this._sendToPage('mover-fase', {
            reservaId: o.reservaId,
            faseIndex: o.faseIndex,
            nuevoStartISO: nuevaISO,
            nuevoStaffId: o.staffId
          });
        } else {
          // Colocar el servicio armado desde esta hora (las validaciones de
          // cliente/permiso/armado viven en _colocarReserva).
          this._colocarReserva(o.staffId, hhmm);
        }
      });
      setTimeout(() => { try { input.focus(); } catch (_) {} }, 30);
    }

    // ═══════════════════════════════════════════════════
    // MODAL DE CITA + COBRO
    // ═══════════════════════════════════════════════════
    _openModal(r) {
      this._modalReserva = r;
      // v1.1.77 — cliente para precargar la FICHA TÉCNICA. Se guarda al
      // ABRIR la cita: el modal tapa la barra, así que el flujo real es
      // abrir cita → cerrar → pulsar Ficha Técnica.
      if (r && r.clientName && r.family !== 'BLOQUEO') {
        this._ftUltimoCliente = { nombre: r.clientName, telefono: r.clientPhone || '' };
      }
      this._disc = 0;
      this._discMode = 'pct';
      this._canjeActivo = null;
      this._productosCliente = null;   // v1.1.51 — resetear lista; se rellenará al recibir respuesta
      // v1.1.56 — resetear estado de facturación
      this._facturaDoc = null;
      this._facturaForm = false;
      this._facturaFormVatId = '';
      this._facturaFormLegalName = '';
      this._facturaGenerando = false;
      this._pagoCita = null;
      this._renderModal();
      // v1.1.51 — F4/F5 auto-detección: si la cita tiene contactId real,
      // pedimos al page code los bonos/tarjetas activos del cliente para
      // pintarlos en canjeBox automáticamente. Para reservas provisionales
      // (contactId vacío) no se hace nada y el bloque cae al input manual.
      // La respuesta llega como 'productosCustomCliente' y dispara
      // _renderCanjeBox() de nuevo con la lista ya cargada.
      if (r && r.contactId && !r._paid && r.status !== 'PAGADO' && r.status !== 'CANCELADA') {
        this._sendToPage('getProductosCustom', { contactId: r.contactId });
      }
      // v1.1.56 — Si la cita está PAGADA, consultamos si ya existe
      // documento (ticket o factura) emitido. La respuesta llega como
      // 'documentoCita' y dispara _renderFacturaSlot() con badge en
      // lugar de los botones. Si no hay documento, _renderFacturaSlot
      // mantiene los botones por defecto.
      if (r && r.status === 'PAGADO') {
        this._sendToPage('obtenerDocumento', { reservaId: r._id });
      }
    }
    _closeModal() { this._modalReserva = null; this._pagoChipReservaId = null; this.shadowRoot.getElementById('modalScrim')?.remove(); }

    _renderModal() {
      const r = this._modalReserva; if (!r) return;
      const root = this.shadowRoot;
      root.getElementById('modalScrim')?.remove();
      const paid = r.status === 'PAGADO';
      const d = r.fechaReserva ? new Date(r.fechaReserva) : null;
      const hhmm = d ? d.toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hour12: false }) : '';
      const endH = d ? minToHHMM(hhmmToMin(hhmm) + (Number(r.duracionTotal) || 0)) : '';
      const items = (r.serviciosDetail || '').split(';;').filter(Boolean).map(x => { const [l, p] = x.split('|'); return { label: l || '', price: Number(p) || 0 }; });
      // v1.1.64 — minutos ocupados por servicio (de las fases ocupantes de la
      // reserva), para mostrar el tiempo de cada línea en la card de la cita.
      const _fasesModal = Array.isArray(r.fases) ? r.fases : (r.fases?.items || []);
      const _labelDur = {};
      for (const f of _fasesModal) {
        if (!f || !f.ocupa) continue;
        const _l = String(f.label || '').trim(); if (!_l) continue;
        let _d = Number(f.dur) || 0;
        if (!_d && f.end && f.start) _d = Math.max(1, (new Date(f.end).getTime() - new Date(f.start).getTime()) / 60000);
        _labelDur[_l] = (_labelDur[_l] || 0) + _d;
      }
      const _durLinea = (label) => {
        let _d = _labelDur[String(label || '').trim()] || 0;
        if (!_d && items.length <= 1) _d = Number(r.duracionTotal) || 0;
        return _d > 0 ? `<span class="ks-item-dur">${Math.round(_d)}′</span>` : '';
      };
      const itemsHTML = (items.length ? items : [{ label: r.title || 'Servicio', price: Number(r.precioTotal) || 0 }]).map((it, i) => `<div class="ks-modal-item ${i > 0 ? 'is-compl' : ''}" data-i="${i}"><span class="ks-item-label">${i > 0 ? '<span class="ks-item-complflag">⛓</span>' : ''}${esc(it.label)}</span><span class="ks-item-right">${_durLinea(it.label)}<span class="ks-item-price">${it.price}€</span>${items.length > 1 ? `<button class="ks-item-rm" data-i="${i}" title="Quitar este servicio" aria-label="Quitar">✕</button>` : ''}</span></div>`).join('');
      // v1.1.24 — Productos vendidos asociados a esta cita
      const productosVendidos = Array.isArray(r.productosVendidos) ? r.productosVendidos : [];
      const productosHTML = productosVendidos.map(p => {
        const qty = p.cantidad > 1 ? ` <span style="color:#9ca3af;font-size:10px;">×${p.cantidad}</span>` : '';
        return `<div class="ks-modal-item is-prod"><span class="ks-item-label"><span class="ks-item-prodflag">🛒</span>${esc(p.nombre)}${qty} <span class="ks-prod-badge">VENDIDO</span></span><span class="ks-item-right"><span class="ks-item-price">${p.subtotal}€</span></span></div>`;
      }).join('');
      // v1.1.26 — cálculo unificado del descuento (% o €)
      // v1.1.39 — soporta promo del servicio encadenada con manual operador.
      const { subtotal, discPct, discEur, subtotalOriginal, ahorroPromo, tienePromo } = this._calcDescuento();
      // v1.1.50 — F4/F5: ahorro adicional del canje de bono/tarjeta (si hay
      // canje activo). Se RESTA al total junto con el descuento manual.
      // El backend ya valida que ahorro ≥ 0; aquí solo lo sumamos al cómputo.
      const ahorroCanje = (this._canjeActivo && this._canjeActivo.ahorro > 0)
        ? Math.round(this._canjeActivo.ahorro * 100) / 100
        : 0;
      const total = Math.max(0, Math.round((subtotal - discEur - ahorroCanje) * 100) / 100);
      // Tokens del resumen del TOTAL: promo primero, manual después.
      // Mismo formato visual que el manual ya existente (color naranja).
      const _promoNote = tienePromo && ahorroPromo > 0 ? `-${ahorroPromo.toFixed(2)}€` : '';
      const _manualNote = discEur > 0
        ? (this._discMode === 'eur'
            ? `-${discEur}€`
            : `-${discPct}% (-${discEur}€)`)
        : '';
      // v1.1.50 — token del canje (3er bloque del note, mismo estilo)
      const _canjeNote = ahorroCanje > 0 ? `-${ahorroCanje.toFixed(2)}€` : '';
      const _noteParts = [_promoNote, _manualNote, _canjeNote].filter(Boolean);
      const noteText = _noteParts.join(' · ');
      const mostrarTachado = tienePromo || discEur > 0 || ahorroCanje > 0;
      const staffName = r.staffName || 'Sin asignar';

      const scrim = document.createElement('div'); scrim.className = 'ks-modal-scrim'; scrim.id = 'modalScrim';
      scrim.addEventListener('click', e => { if (e.target === scrim) this._closeModal(); });
      const modal = document.createElement('div'); modal.className = 'ks-modal';
      // v1.1.12 — detectar reserva con cliente provisional
      // Marcador: contactId vacío + sin teléfono ni email (cliente anónimo de paso).
      const esProvisional = !r.contactId && !r.clientPhone && !r.clientEmail;
      const provBadge = esProvisional
        ? `<span style="display:inline-block;margin-left:8px;padding:2px 7px;border-radius:999px;background:#fff3d6;color:#a55b00;font-size:10px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;border:1px solid #f0c879;vertical-align:middle">provisional</span>`
        : '';
      const contactRow = esProvisional
        ? `<div class="ks-modal-contact" style="color:#a55b00;font-style:italic;">Cliente eventual de paso · sin contacto</div>`
        : `<div class="ks-modal-contact">${r.clientPhone ? `<span>📞 ${esc(r.clientPhone)}</span>` : ''}${r.clientEmail ? `<span>✉ ${esc(r.clientEmail)}</span>` : ''}</div>`;

      // v1.1.32 — Badge de origen de la cita (Recepción vs Web pública).
      // r.origenRecepcion === false indica cita creada desde el widget público.
      // (Default true en backend para retrocompatibilidad de filas antiguas.)
      const esWeb = r.origenRecepcion === false;
      const origenBadge = esWeb
        ? `<span style="display:inline-block;margin-left:8px;padding:2px 7px;border-radius:999px;background:oklch(94% 0.05 220);color:oklch(38% 0.13 240);font-size:10px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;border:1px solid oklch(76% 0.09 235);vertical-align:middle">🌐 Web</span>`
        : `<span style="display:inline-block;margin-left:8px;padding:2px 7px;border-radius:999px;background:oklch(95% 0.005 250);color:oklch(40% 0.012 258);font-size:10px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;border:1px solid oklch(85% 0.008 252);vertical-align:middle">💼 Recepción</span>`;

      // v1.1.34 — Warning ficha incompleta dentro del modal de cita.
      // No se aplica a provisionales (su badge ya advierte).
      let modalWarn = '';
      if (!esProvisional) {
        const parts = String(r.clientName || '').trim().split(/\s+/);
        const apellido = parts.length > 1 ? parts.slice(1).join(' ') : '';
        const warnings = this._checkClienteIncompleto({
          email: r.clientEmail,
          apellido,
          telefono: r.clientPhone
        });
        modalWarn = this._warnHTML(warnings);
      }

      // v1.1.38 — Banner arco iris cuando el servicio tiene descuento
      // promocional (paridad V1 literal de kamisuite-agenda_2_2_9). El
      // backend (recepcionProLogic v1.0.18+) marca r.tienePromoServicio
      // y r.descuentoServicioTotal cruzando con ServiceCatalog.
      // Solo visual: NO toca el cálculo del TOTAL ni el descuento manual
      // ad-hoc del operador (siguen funcionando como antes).
      const tienePromoSvc = r.tienePromoServicio === true && (r.descuentoServicioTotal || 0) > 0;
      const promoBanner = tienePromoSvc
        ? `<div style="background:linear-gradient(135deg,#FF6B6B 0%,#FFE66D 50%,#4ECDC4 100%);color:#1a1a2e;padding:6px 10px;margin:-20px -22px 12px;text-align:center;font-weight:700;font-size:11px;border-radius:16px 16px 0 0;letter-spacing:.4px;">Servicio con descuento promocional <span style="background:rgba(255,255,255,.85);color:#d63031;padding:1px 6px;border-radius:10px;font-weight:800;font-size:10px;margin-left:4px;">-${(r.descuentoServicioTotal || 0).toFixed(2)}€</span></div>`
        : '';
      // Borde dorado sutil en el modal cuando hay promo de servicio
      if (tienePromoSvc) {
        modal.style.border = '1px solid rgba(255,230,109,.45)';
        modal.style.boxShadow = '0 8px 32px rgba(255,180,80,.15), var(--ks-shadow-lg)';
      } else {
        modal.style.border = '';
        modal.style.boxShadow = '';
      }

      modal.innerHTML = `
        ${promoBanner}
        <div class="ks-modal-head"><span class="ks-modal-staff">${esc(staffName.toUpperCase())}</span><span class="ks-modal-status ${paid ? 'paid' : 'pending'}">${paid ? 'Cobrada' : 'Pendiente'}</span>${origenBadge}<button class="ks-modal-x" id="mX">✕</button></div>
        <div class="ks-modal-client">${esc(r.clientName || '')}${provBadge}</div>
        <div class="ks-modal-meta">${hhmm}${endH ? '–' + endH : ''}</div>
        ${contactRow}
        ${modalWarn}
        <div class="ks-modal-items">${itemsHTML}${productosHTML}</div>
        ${paid ? '' : `<div class="ks-modal-disc" id="discBox"></div>`}
        ${paid ? '' : `<div class="ks-modal-canje" id="canjeBox" style="margin-top:6px"></div>`}
        <div class="ks-modal-total"><span>TOTAL</span><span class="ks-total-wrap">${mostrarTachado ? `<span class="ks-total-strike">${subtotalOriginal}€</span> <span class="ks-total-discnote" style="font-size:11px;color:#d48a1a;font-weight:600">${noteText}</span>` : ''}<span class="ks-total-val">${total}€</span></span></div>
        ${paid ? '' : (
          (total === 0 && this._canjeActivo)
            ? `<div class="ks-modal-pays">
                <button class="ks-pay pay-canje" data-m="Canje" style="flex:1;background:oklch(0.55 0.13 70);">Marcar como canjeado</button>
                <button class="ks-pay pay-cancel" id="mCancelRes">⌫ Cancelar</button>
              </div>`
            : `<div class="ks-modal-pays">
                <button class="ks-pay pay-efectivo" data-m="Efectivo">Efectivo</button>
                <button class="ks-pay pay-tarjeta" data-m="Tarjeta">Tarjeta</button>
                <button class="ks-pay pay-bizum" data-m="Bizum">Bizum</button>
                <button class="ks-pay pay-mixto" data-m="Mixto">Mixto</button>
                <button class="ks-pay pay-cancel" id="mCancelRes">⌫ Cancelar</button>
              </div>`
        )}
        <div class="ks-mixtobox" id="mixtoBox" style="display:none"></div>
        ${paid ? '' : `<div class="ks-modal-adds">
          <button class="ks-add add-svc" id="addSvc">+ Servicio adicional</button>
          <button class="ks-add add-compl" id="addCompl">⛓ Complemento</button>
          <button class="ks-add add-prod" id="addProd">🛍 Producto</button>
          <button class="ks-add add-extra" id="addExtra">✎ Extra</button>
        </div>`}
        ${paid ? `<div id="metodoCobroLine" class="ks-modal-metodo" style="margin-top:8px;font-size:12.5px;color:var(--ks-ink2);font-weight:600;display:flex;align-items:center;gap:6px;"></div>` : ''}
        <div class="ks-modal-foot">${paid ? `<div id="facturaSlot" style="flex:1;display:flex;gap:7px;align-items:center;min-height:36px;"></div>` : `<button class="ks-changedate" id="mChangeDate">🗓 Cambiar fecha</button>`}<button class="ks-modal-close" id="mClose">Cerrar</button></div>`;
      scrim.appendChild(modal); root.appendChild(scrim);

      modal.querySelector('#mX').addEventListener('click', () => this._closeModal());
      // v1.1.19 — ✕ junto a cada línea de servicio
      modal.querySelectorAll('.ks-item-rm').forEach(btn => btn.addEventListener('click', e => {
        e.stopPropagation();
        const i = parseInt(btn.getAttribute('data-i'), 10);
        if (isNaN(i)) return;
        btn.disabled = true;
        this._sendToPage('quitar-item', { reservaId: r._id, itemIndex: i });
      }));
      modal.querySelector('#mClose').addEventListener('click', () => this._closeModal());
      if (!paid && this._puede('editarCita')) {
        this._renderDiscBox();
        this._renderCanjeBox();  // v1.1.50 — F4/F5 bloque bono/tarjeta
        modal.querySelectorAll('.ks-pay[data-m]').forEach(b => b.addEventListener('click', () => {
          const m = b.getAttribute('data-m');
          // v1.1.10 — recalcular total con el descuento actual
          const rNow = this._modalReserva;
          const subN = Number(rNow.precioTotal) || 0;
          const dPctN = Math.min(100, Math.max(0, Number(this._disc) || 0));
          const totalN = Math.max(0, Math.round((subN - subN * dPctN / 100) * 100) / 100);
          if (m === 'Mixto') this._openMixto(totalN); else this._pagar(m, '');
        }));
        modal.querySelector('#mCancelRes')?.addEventListener('click', () => {
          if (confirm('¿Cancelar esta cita? Se borrarán sus huecos del calendario.')) this._sendToPage('cancelarReserva', { reservaId: r._id });
        });
        modal.querySelector('#addSvc')?.addEventListener('click', () => this._openAddServicioModal(r));
        modal.querySelector('#addCompl')?.addEventListener('click', () => this._openAddComplementoModal(r));
        modal.querySelector('#addProd')?.addEventListener('click', () => this._openAddProductoModal(r));
        modal.querySelector('#addExtra')?.addEventListener('click', () => this._openAddExtraModal(r));
        modal.querySelector('#mChangeDate')?.addEventListener('click', () => this._openReprogramarModal(r));
      } else if (!paid) {
        // v1.1.62 — Nivel 4 (Básico): cita NO pagada abierta en modo lectura.
        // Los botones se pintan igual (no se toca el markup) pero cablean al
        // aviso de permiso en lugar de las acciones reales. Regla: todo lo
        // bloqueado responde "No tienes permiso para esta acción".
        const _sinPermiso = () => this._toast('No tienes permiso para esta acción');
        modal.querySelectorAll('.ks-pay[data-m]').forEach(b => b.addEventListener('click', _sinPermiso));
        modal.querySelector('#mCancelRes')?.addEventListener('click', _sinPermiso);
        modal.querySelector('#addSvc')?.addEventListener('click', _sinPermiso);
        modal.querySelector('#addCompl')?.addEventListener('click', _sinPermiso);
        modal.querySelector('#addProd')?.addEventListener('click', _sinPermiso);
        modal.querySelector('#addExtra')?.addEventListener('click', _sinPermiso);
        modal.querySelector('#mChangeDate')?.addEventListener('click', _sinPermiso);
      } else {
        // v1.1.11 — cita ya cobrada: pedir el pago para mostrar chip si lleva descuento
        this._pagoChipReservaId = r._id;
        this._sendToPage('get-pago-by-reserva', { reservaId: r._id });
        // v1.1.56 — pintar slot de facturación (estado actual: por defecto
        // muestra los 2 botones, o el badge si _facturaDoc ya está cargado
        // por una respuesta 'documentoCita' recibida antes del re-render).
        this._renderFacturaSlot();
      }
    }
    // v1.1.56 — Línea "💳 Método de cobro" del modal de cita PAGADA.
    // Se rellena al recibir 'pago-encontrado' (que ya se pedía para el
    // chip de descuento). Si el método es Mixto, también pinta el desglose.
    _renderMetodoCobroLine() {
      const line = this.shadowRoot.getElementById('metodoCobroLine');
      if (!line) return;
      const p = this._pagoCita;
      if (!p || !p.tipoPago) { line.innerHTML = ''; return; }
      const iconos = {
        'Efectivo': '💶',
        'Tarjeta':  '💳',
        'Bizum':    '📱',
        'Mixto':    '🔀',
        'Canje':    '🎟️'
      };
      const ico = iconos[p.tipoPago] || '💰';
      let desgloseHTML = '';
      if (p.tipoPago === 'Mixto' && p.desglose) {
        try {
          const d = JSON.parse(p.desglose);
          const parts = [];
          if (d.Tarjeta)  parts.push(`T: ${d.Tarjeta}€`);
          if (d.Efectivo) parts.push(`E: ${d.Efectivo}€`);
          if (d.Bizum)    parts.push(`B: ${d.Bizum}€`);
          if (parts.length) {
            desgloseHTML = ` <span style="color:var(--ks-ink3);font-weight:500;font-size:11px;">· ${esc(parts.join(' / '))}</span>`;
          }
        } catch (_) { /* desglose no parseable, lo omitimos sin romper */ }
      }
      line.innerHTML = `<span style="color:var(--ks-ink3);font-size:11px;text-transform:uppercase;letter-spacing:.5px;font-weight:700;">Cobrado con</span> <span style="font-size:14px;">${ico}</span> <span>${esc(p.tipoPago)}</span>${desgloseHTML}`;
    }

    // v1.1.56 — Slot de facturación en el footer del modal de cita PAGADA.
    // Tres estados:
    //   A) _facturaGenerando=true → spinner con texto "Generando…"
    //   B) _facturaDoc presente   → badge con número del documento + 🔗 al PDF
    //   C) _facturaForm=true      → form inline con CIF + razón social + emitir
    //   D) Default                → 2 botones: 🧾 Ticket + 📄 Factura
    _renderFacturaSlot() {
      const slot = this.shadowRoot.getElementById('facturaSlot');
      if (!slot) return;
      const r = this._modalReserva; if (!r) return;

      // ── A) Generando ──────────────────────────────────────────
      if (this._facturaGenerando) {
        slot.innerHTML = `<span style="color:var(--ks-ink2);font-size:12px;font-weight:600;display:flex;align-items:center;gap:6px;">
          <span style="display:inline-block;width:12px;height:12px;border:2px solid var(--ks-line);border-top-color:var(--ks-accent);border-radius:50%;animation:ksSpin .7s linear infinite;"></span>
          Generando documento…
        </span>`;
        return;
      }

      // ── B) Documento ya emitido → badge recuperación ──────────
      // v1.1.58: guard `!this._facturaForm` para que cuando el operador
      // pulsa "Convertir a factura" sobre un ticket existente, esta
      // rama se salte y se llegue a la rama C (form inline). Sin
      // este guard, el badge se repintaba indefinidamente y el form
      // nunca aparecía.
      if (this._facturaDoc && this._facturaDoc.invoiceNumber && !this._facturaForm) {
        const d = this._facturaDoc;
        const esTicket = d.modo === 'ticket';
        const icono = esTicket ? '🧾' : '📄';
        const colorBg = esTicket ? 'var(--ks-paper2)' : 'var(--ks-accent-soft)';
        const colorBorde = esTicket ? 'var(--ks-line)' : 'var(--ks-accent)';
        const colorInk = esTicket ? 'var(--ks-ink)' : 'var(--ks-accent-ink)';
        const badgeTitle = esTicket
          ? 'Ticket emitido. Si la cliente trae CIF/DNI, pulsa "Convertir a factura" para emitir la factura completa.'
          : 'Factura emitida.';
        // v1.1.57: cuando hay TICKET vigente, mostrar botón "Convertir a
        // factura" junto al badge. Backend v1.0.3+ trata la solicitud como
        // rectificativa: emite la factura nueva y marca el ticket como
        // rectificada en el CMS. Si hay factura vigente, solo el badge
        // (no se "rebaja" a ticket ni se reemite).
        const upgradeBtn = esTicket
          ? `<button id="btnUpgradeFactura" title="Emitir factura completa que reemplaza a este ticket" style="background:#15803d;color:#fff;border:0;border-radius:8px;padding:7px 11px;font-size:11.5px;font-weight:700;cursor:pointer;font-family:inherit;letter-spacing:.3px;display:inline-flex;align-items:center;gap:5px;">
              📄 Convertir a factura
            </button>`
          : '';
        slot.innerHTML = `<span title="${esc(badgeTitle)}" style="display:inline-flex;align-items:center;gap:7px;background:${colorBg};border:1px solid ${colorBorde};border-radius:8px;padding:6px 12px;font-size:12.5px;font-weight:700;color:${colorInk};">
          <span>${icono}</span>
          <span>${esc(d.invoiceNumber)}</span>
          <a href="#" id="facturaOpenPdf" title="Abrir PDF" style="text-decoration:none;color:inherit;font-size:14px;margin-left:2px;">🔗</a>
        </span>${upgradeBtn}`;
        const link = slot.querySelector('#facturaOpenPdf');
        if (link) {
          link.addEventListener('click', e => {
            e.preventDefault();
            if (d.pdfUrl) {
              window.open(d.pdfUrl, '_blank', 'noopener');
            } else {
              this._toast('El documento no tiene PDF asociado');
            }
          });
        }
        const upBtn = slot.querySelector('#btnUpgradeFactura');
        if (upBtn) {
          upBtn.addEventListener('click', () => {
            // Mismo flujo que el botón Factura: abrir form inline CIF.
            // El backend ya sabe que hay un ticket vigente y al emitir
            // la factura lo marcará como rectificada. No tenemos que
            // hacer nada especial aquí; solo lanzar la emisión.
            this._facturaForm = true;
            this._facturaFormVatId = '';
            this._facturaFormLegalName = '';
            this._renderFacturaSlot();
          });
        }
        return;
      }

      // ── C) Form inline CIF (botón Factura pulsado sin vatId en CRM) ─
      if (this._facturaForm) {
        slot.innerHTML = `<div style="flex:1;display:flex;flex-direction:column;gap:7px;width:100%;">
          <div style="font-size:10.5px;font-weight:700;color:var(--ks-ink3);letter-spacing:.5px;text-transform:uppercase;">Datos para factura completa</div>
          <input id="facVatId" placeholder="CIF / NIF (obligatorio)" value="${esc(this._facturaFormVatId)}" style="border:1px solid var(--ks-line);border-radius:8px;padding:7px 10px;font-size:12.5px;font-family:inherit;outline:none;background:#fff;" />
          <input id="facLegalName" placeholder="Razón social (opcional)" value="${esc(this._facturaFormLegalName)}" style="border:1px solid var(--ks-line);border-radius:8px;padding:7px 10px;font-size:12.5px;font-family:inherit;outline:none;background:#fff;" />
          <div style="display:flex;gap:6px;margin-top:2px;">
            <button id="facEmitir" style="flex:1;background:#15803d;color:#fff;border:0;border-radius:8px;padding:8px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;letter-spacing:.3px;">EMITIR FACTURA</button>
            <button id="facCancel" style="background:#fff;color:var(--ks-ink2);border:1px solid var(--ks-line);border-radius:8px;padding:8px 14px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;">Cancelar</button>
          </div>
        </div>`;
        const vatInp = slot.querySelector('#facVatId');
        const lnInp  = slot.querySelector('#facLegalName');
        const emit   = slot.querySelector('#facEmitir');
        const cancel = slot.querySelector('#facCancel');
        // Preservar valores entre repaints
        vatInp.addEventListener('input', e => { this._facturaFormVatId = e.target.value; });
        lnInp.addEventListener('input', e => { this._facturaFormLegalName = e.target.value; });
        vatInp.focus();
        cancel.addEventListener('click', () => {
          this._facturaForm = false;
          this._facturaFormVatId = '';
          this._facturaFormLegalName = '';
          this._renderFacturaSlot();
        });
        emit.addEventListener('click', () => {
          const vatId = (this._facturaFormVatId || '').trim();
          const legalName = (this._facturaFormLegalName || '').trim();
          if (!vatId) { this._toast('Introduce el CIF/NIF para emitir la factura'); vatInp.focus(); return; }
          this._facturaGenerando = true;
          this._renderFacturaSlot();
          this._sendToPage('generarFactura', { reservaId: r._id, vatId, legalName });
        });
        return;
      }

      // ── D) Estado por defecto: dos botones ────────────────────
      slot.innerHTML = `
        <button id="btnTicket" style="background:var(--ks-paper2);color:var(--ks-ink);border:1px solid var(--ks-line);border-radius:8px;padding:8px 14px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;letter-spacing:.3px;display:inline-flex;align-items:center;gap:6px;">
          🧾 Ticket
        </button>
        <button id="btnFactura" style="background:#15803d;color:#fff;border:0;border-radius:8px;padding:8px 14px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;letter-spacing:.3px;display:inline-flex;align-items:center;gap:6px;">
          📄 Factura
        </button>`;
      slot.querySelector('#btnTicket').addEventListener('click', () => {
        this._facturaGenerando = true;
        this._renderFacturaSlot();
        this._sendToPage('generarTicket', { reservaId: r._id });
      });
      slot.querySelector('#btnFactura').addEventListener('click', () => {
        // Si el cliente ya tiene CIF en CRM, emisión directa (el backend
        // lo detecta cuando llamamos sin vatId — lee del contacto y, si
        // lo tiene, lo usa). Si no lo tiene, el backend devuelve error
        // y nosotros mostramos el form inline.
        //
        // Para evitar el round-trip de error, abrimos el form directamente.
        // Esto es coherente con el patrón "el operador decide qué
        // datos pasa". El backend acepta vatId/legalName explícitos y
        // los persiste en CRM al emitir.
        this._facturaForm = true;
        this._facturaFormVatId = '';
        this._facturaFormLegalName = '';
        this._renderFacturaSlot();
      });
    }

    _renderDescuentoChipPagado(pct, eurv, importeNeto) {
      const root = this.shadowRoot;
      const wrap = root.querySelector('#modalScrim .ks-total-wrap');
      if (!wrap) return;
      const r = this._modalReserva; if (!r) return;
      const subtotal = Number(r.precioTotal) || 0;
      // v1.1.39 — incluir token de promo si la cita la lleva, para que la
      // "cuenta" del tachado cuadre con el importeNeto realmente cobrado
      // (que descontó promo + manual). Sin promo, el render es idéntico
      // a v1.1.38 (1 solo token manual).
      const tienePromo = r.tienePromoServicio === true && (Number(r.descuentoServicioTotal) || 0) > 0;
      const ahorroPromo = tienePromo ? Math.round((Number(r.descuentoServicioTotal) || 0) * 100) / 100 : 0;
      const _tokens = [];
      if (tienePromo && ahorroPromo > 0) _tokens.push(`-${ahorroPromo.toFixed(2)}€`);
      if (pct > 0) _tokens.push(`-${pct}% (-${eurv}€)`);
      const noteText = _tokens.join(' · ');
      wrap.innerHTML = `<span class="ks-total-strike">${subtotal}€</span> <span class="ks-total-discnote" style="font-size:11px;color:#d48a1a;font-weight:600">${noteText}</span><span class="ks-total-val">${importeNeto}€</span>`;
    }
    _renderDiscBox() {
      const box = this.shadowRoot.getElementById('discBox'); if (!box) return;
      if (this._disc > 0 || this._discOpen) {
        const mode = this._discMode || 'pct';
        const maxAttr = mode === 'eur' ? '' : 'max="100"';
        const stepAttr = mode === 'eur' ? 'step="0.01"' : 'step="1"';
        const unitSymbol = mode === 'eur' ? '€' : '%';
        box.innerHTML = `<div class="ks-disc-row">
          <span class="ks-disc-lbl">🏷 Descuento</span>
          <div class="ks-disc-mode">
            <button class="ks-disc-mbtn ${mode === 'pct' ? 'sel' : ''}" data-mode="pct" title="Porcentaje">%</button>
            <button class="ks-disc-mbtn ${mode === 'eur' ? 'sel' : ''}" data-mode="eur" title="Importe en euros">€</button>
          </div>
          <div class="ks-disc-input">
            <input id="discInput" type="number" min="0" ${maxAttr} ${stepAttr} value="${this._disc || ''}" placeholder="0">
            <span>${unitSymbol}</span>
          </div>
          <button class="ks-disc-clear" id="discClear">✕</button>
        </div>`;
        const inp = box.querySelector('#discInput');
        inp.addEventListener('input', e => {
          let v = parseFloat(e.target.value) || 0;
          if (v < 0) v = 0;
          if (this._discMode === 'pct' && v > 100) v = 100;
          this._disc = v;
          this._updateTotal();
        });
        box.querySelectorAll('.ks-disc-mbtn').forEach(b => b.addEventListener('click', () => {
          const nuevo = b.getAttribute('data-mode');
          if (nuevo === this._discMode) return;
          this._discMode = nuevo;
          // Si el nuevo modo es pct y el valor actual supera 100, se ajusta
          if (nuevo === 'pct' && this._disc > 100) this._disc = 100;
          this._renderDiscBox();
          this._updateTotal();
        }));
        box.querySelector('#discClear').addEventListener('click', () => { this._disc = 0; this._discOpen = false; this._discMode = 'pct'; this._renderModal(); });
        inp.focus();
      } else {
        box.innerHTML = `<button class="ks-disc-toggle" id="discToggle">＋ Aplicar descuento</button>`;
        box.querySelector('#discToggle').addEventListener('click', () => { this._discOpen = true; this._renderDiscBox(); });
      }
    }

    // ═══════════════════════════════════════════════════════════════════
    // F4/F5 — BLOQUE BONO/TARJETA EN EL MODAL DE COBRO  (v1.1.51)
    //
    // Pinta DENTRO de #canjeBox (insertado en _renderModal debajo de
    // #discBox). Tres estados según contexto del cliente y canje actual:
    //
    //   A) CANJE APLICADO (this._canjeActivo presente):
    //      🎟️ <descripcionToken>   [ ✕ Quitar ]
    //      Quitar → this._canjeActivo = null + re-render del modal.
    //
    //   B) CLIENTE CON BONOS/TARJETAS ACTIVOS (this._productosCliente
    //      con bonos.length>0 || tarjetas.length>0):
    //      Lista de cards con datos del bono/tarjeta + botón "Usar":
    //         🎟️ Bono BN-XXXX · Corte Caballero · 3/3 usos · [ Usar ]
    //      Click en "Usar" rellena el código y dispara aplicarCanje (mismo
    //      flujo que el input manual). Debajo de la lista, separador y el
    //      input manual sigue disponible para tarjetas regalo / casos edge.
    //
    //   C) CLIENTE SIN PRODUCTOS CUSTOM (this._productosCliente null
    //      tras la consulta, o vacío, o reserva sin contactId):
    //      Solo input manual de código (= comportamiento v1.1.50).
    //
    // Estilos INLINE para no tocar la hoja de estilos del Shadow DOM
    // existente (regla absoluta 13-jun).
    // ═══════════════════════════════════════════════════════════════════
    _renderCanjeBox() {
      const box = this.shadowRoot.getElementById('canjeBox');
      if (!box) return;
      const r = this._modalReserva;
      if (!r) { box.innerHTML = ''; return; }

      // ─── ESTADO A: canje aplicado ──────────────────────────────────
      if (this._canjeActivo && this._canjeActivo.codigo) {
        const c = this._canjeActivo;
        const icon = c.tipo === 'tarjeta' ? '🎫' : '🎟️';
        const texto = c.descripcionToken || `${c.codigo}`;
        box.innerHTML = `
          <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:#fff7e0;border:1px solid #f0c879;border-radius:8px;font-size:12px;font-weight:600;color:#7a4a00;">
            <span style="font-size:14px;">${icon}</span>
            <span style="flex:1;">${this._escHTML(texto)} <span style="color:#a55b00;font-weight:700;">(-${(c.ahorro || 0).toFixed(2)}€)</span></span>
            <button id="canjeClear" style="background:none;border:1px solid #d8a85f;color:#7a4a00;border-radius:6px;padding:3px 8px;font-size:11px;font-weight:700;cursor:pointer;">✕ Quitar</button>
          </div>`;
        box.querySelector('#canjeClear').addEventListener('click', () => {
          this._canjeActivo = null;
          this._renderModal();
        });
        return;
      }

      // Helper para disparar aplicarCanje con un código dado (compartido
      // por la lista de "Usar" y el input manual).
      const aplicar = (codigo) => {
        const code = String(codigo || '').trim().toUpperCase();
        if (!code) return;
        if (this._canjeAplicando) return;
        this._canjeAplicando = true;
        // Feedback visual: deshabilitar todos los botones del bloque
        // mientras la llamada está en curso.
        box.querySelectorAll('button').forEach(b => { b.disabled = true; });
        this._sendToPage('aplicarCanje', {
          reservaId: r._id,
          codigoProducto: code
        });
      };

      // ─── Construir lista de cards (si hay productos del cliente) ────
      const pc = this._productosCliente;
      const bonos = (pc && Array.isArray(pc.bonos)) ? pc.bonos : [];
      const tarjetas = (pc && Array.isArray(pc.tarjetas)) ? pc.tarjetas : [];
      const hayProductos = bonos.length > 0 || tarjetas.length > 0;

      let listaHTML = '';
      if (hayProductos) {
        const cardsHTML = [
          ...bonos.map(b => {
            const codigo = this._escHTML(b.code || '');
            const svc = this._escHTML(b.serviceLabel || 'Servicio');
            const usos = `${b.remainingUses || 0}/${b.totalUses || 0} usos`;
            return `
              <div style="display:flex;align-items:center;gap:8px;padding:7px 10px;background:#fafafa;border:1px solid #e0e0e0;border-radius:8px;font-size:12px;">
                <span style="font-size:14px;">🎟️</span>
                <div style="flex:1;min-width:0;">
                  <div style="font-weight:700;color:#1a1a2e;">Bono ${codigo}</div>
                  <div style="font-size:10.5px;color:#666;">${svc} · ${usos}</div>
                </div>
                <button class="canjeUsar" data-code="${codigo}" style="padding:5px 11px;background:#1a1a2e;color:#fff;border:none;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;letter-spacing:.3px;">Usar</button>
              </div>`;
          }),
          ...tarjetas.map(t => {
            const codigo = this._escHTML(t.code || '');
            const svc = this._escHTML(t.serviceLabel || 'Servicio');
            return `
              <div style="display:flex;align-items:center;gap:8px;padding:7px 10px;background:#fafafa;border:1px solid #e0e0e0;border-radius:8px;font-size:12px;">
                <span style="font-size:14px;">🎫</span>
                <div style="flex:1;min-width:0;">
                  <div style="font-weight:700;color:#1a1a2e;">Tarjeta ${codigo}</div>
                  <div style="font-size:10.5px;color:#666;">${svc}</div>
                </div>
                <button class="canjeUsar" data-code="${codigo}" style="padding:5px 11px;background:#1a1a2e;color:#fff;border:none;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;letter-spacing:.3px;">Usar</button>
              </div>`;
          })
        ].join('');
        listaHTML = `<div style="display:flex;flex-direction:column;gap:6px;">${cardsHTML}</div>`;
      }

      // ─── Input manual (siempre visible como alternativa) ────────────
      const inputHTML = `
        <div style="display:flex;align-items:center;gap:6px;${hayProductos ? 'margin-top:8px;padding-top:8px;border-top:1px dashed #d0d0d0;' : ''}">
          <input id="canjeInput" type="text" placeholder="${hayProductos ? 'Otro código (regalo, ...)' : 'Bono BN-... / Tarjeta KP-...'}" style="flex:1;padding:6px 9px;border:1px solid #d0d0d0;border-radius:6px;font-size:12px;font-family:inherit;text-transform:uppercase;" />
          <button id="canjeApply" style="padding:6px 12px;background:#1a1a2e;color:#fff;border:none;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;letter-spacing:.3px;">Aplicar</button>
        </div>`;

      box.innerHTML = listaHTML + inputHTML;

      // Eventos: botones "Usar" de las cards (si las hay)
      box.querySelectorAll('.canjeUsar').forEach(btn => {
        btn.addEventListener('click', () => {
          aplicar(btn.getAttribute('data-code'));
        });
      });

      // Eventos: input manual + botón Aplicar
      const inp = box.querySelector('#canjeInput');
      const btn = box.querySelector('#canjeApply');
      if (inp && btn) {
        btn.addEventListener('click', () => aplicar(inp.value));
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); aplicar(inp.value); } });
      }
    }

    // Helper minimalista de escape para evitar inyección de HTML en el
    // descripcionToken devuelto por el backend (códigos y labels son
    // controlados, pero por defensa en profundidad).
    _escHTML(s) {
      return String(s || '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
      }[c]));
    }

    // v1.1.26 — Cálculo unificado del descuento según modo (% o €)
    _calcDescuento() {
      // v1.1.39 — El subtotal sobre el que se aplica el % manual del operador
      // pasa a ser el POST-PROMO (subtotalOriginal − ahorroPromo). Esto
      // encadena correctamente promo + manual igual que en V1.
      // El shape se EXTIENDE con subtotalOriginal / ahorroPromo / tienePromo
      // para que los renders puedan tachar el precio "público" del catálogo.
      // Compat: los llamadores existentes (línea 3064, 3255, 3732) leen
      // `subtotal`, `discPct`, `discEur` igual; el cálculo
      // `subtotal − discEur` sigue devolviendo el total neto correcto.
      const r = this._modalReserva;
      const subtotalOriginal = Number(r?.precioTotal) || 0;
      const tienePromo = r?.tienePromoServicio === true && (Number(r?.descuentoServicioTotal) || 0) > 0;
      const ahorroPromo = tienePromo
        ? Math.min(subtotalOriginal, Math.round((Number(r.descuentoServicioTotal) || 0) * 100) / 100)
        : 0;
      const subtotal = Math.max(0, Math.round((subtotalOriginal - ahorroPromo) * 100) / 100);
      const v = Math.max(0, Number(this._disc) || 0);
      let discEur, discPct;
      if (this._discMode === 'eur') {
        discEur = Math.min(v, subtotal);  // no más que el subtotal post-promo
        discPct = subtotal > 0 ? Math.round((discEur / subtotal) * 10000) / 100 : 0;
      } else {
        discPct = Math.min(100, v);
        discEur = Math.round(subtotal * discPct) / 100;
      }
      return { subtotal, discPct, discEur, subtotalOriginal, ahorroPromo, tienePromo };
    }
    _updateTotal() {
      const r = this._modalReserva; if (!r) return;
      const { subtotal, discPct, discEur, subtotalOriginal, ahorroPromo, tienePromo } = this._calcDescuento();
      const total = Math.max(0, subtotal - discEur);
      const wrap = this.shadowRoot.querySelector('.ks-total-wrap');
      if (!wrap) return;
      // v1.1.39 — mismo render que _renderModal: tokens encadenados promo+manual
      const _promoNote = tienePromo && ahorroPromo > 0 ? `-${ahorroPromo.toFixed(2)}€` : '';
      const _manualNote = discEur > 0
        ? (this._discMode === 'eur'
            ? `-${discEur}€`
            : `-${discPct}% (-${discEur}€)`)
        : '';
      const noteText = [_promoNote, _manualNote].filter(Boolean).join(' · ');
      const mostrarTachado = tienePromo || discEur > 0;
      wrap.innerHTML = `${mostrarTachado ? `<span class="ks-total-strike">${subtotalOriginal}€</span> <span class="ks-total-discnote" style="font-size:11px;color:#d48a1a;font-weight:600">${noteText}</span>` : ''}<span class="ks-total-val">${total}€</span>`;
    }
    // v1.1.16 — MODAL SECUNDARIO (genérico): scrim apilado encima del modal de cita
    _openSubModal(htmlContent) {
      const root = this.shadowRoot;
      const scrim = document.createElement('div');
      scrim.className = 'ks-modal-scrim';
      scrim.id = 'subModalScrim';
      scrim.style.zIndex = '70';
      scrim.addEventListener('click', e => { if (e.target === scrim) this._closeSubModal(); });
      const box = document.createElement('div');
      box.className = 'ks-modal';
      box.style.width = '380px';
      box.innerHTML = htmlContent;
      scrim.appendChild(box);
      root.appendChild(scrim);
      return box;
    }
    _closeSubModal() {
      this.shadowRoot.getElementById('subModalScrim')?.remove();
    }
    // v1.1.16 — REPROGRAMAR (cambiar fecha y hora)
    _openReprogramarModal(r) {
      const d = new Date(r.fechaReserva);
      // Componer valor para datetime-local en hora local Madrid
      const pad = n => String(n).padStart(2, '0');
      // Truco simple: tomar la hora visible del calendario (Madrid). Usamos el getter:
      const hhmm = d.toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hour12: false });
      // Fecha YYYY-MM-DD en Madrid
      const fechaMadrid = d.toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' }); // YYYY-MM-DD
      const inicial = `${fechaMadrid}T${hhmm}`;
      const box = this._openSubModal(`
        <div class="ks-modal-head"><span class="ks-modal-staff">🗓 CAMBIAR FECHA</span><button class="ks-modal-x" id="rpX">✕</button></div>
        <div style="margin-top:14px;font-size:13px;color:var(--ks-ink2);">Cita actual: <b>${esc(r.clientName || '')}</b> · ${esc(hhmm)}</div>
        <div style="margin-top:14px;">
          <label style="font-size:11px;font-weight:700;letter-spacing:.5px;color:var(--ks-ink2);">NUEVA FECHA Y HORA</label>
          <input type="datetime-local" id="rpFecha" value="${esc(inicial)}" style="width:100%;margin-top:6px;padding:10px;border:1px solid var(--ks-line);border-radius:8px;font-size:14px;font-family:inherit;">
        </div>
        <div class="ks-modal-foot" style="margin-top:18px;">
          <button class="ks-modal-close" id="rpCancel">Cancelar</button>
          <button class="ks-pay" id="rpOk" style="background:var(--ks-ink);color:#fff;">Reprogramar</button>
        </div>`);
      box.querySelector('#rpX').addEventListener('click', () => this._closeSubModal());
      box.querySelector('#rpCancel').addEventListener('click', () => this._closeSubModal());
      box.querySelector('#rpOk').addEventListener('click', () => {
        const valor = box.querySelector('#rpFecha').value;  // "YYYY-MM-DDTHH:mm"
        if (!valor) { this._toast('Selecciona fecha y hora'); return; }
        // Construir ISO en hora local del navegador (no Madrid). El backend recibe ISO UTC.
        const isoLocal = new Date(valor).toISOString();
        box.querySelector('#rpOk').disabled = true;
        this._sendToPage('reprogramar-reserva', { reservaId: r._id, nuevaFechaISO: isoLocal });
      });
    }
    // v1.1.16 — EXTRA (cargo manual)
    _openAddExtraModal(r) {
      const box = this._openSubModal(`
        <div class="ks-modal-head"><span class="ks-modal-staff">✎ AÑADIR EXTRA</span><button class="ks-modal-x" id="exX">✕</button></div>
        <div style="margin-top:14px;">
          <label style="font-size:11px;font-weight:700;letter-spacing:.5px;color:var(--ks-ink2);">CONCEPTO</label>
          <input type="text" id="exDesc" placeholder="ej. Subida por mechas extra largas" style="width:100%;margin-top:6px;padding:10px;border:1px solid var(--ks-line);border-radius:8px;font-size:14px;font-family:inherit;">
        </div>
        <div style="margin-top:12px;">
          <label style="font-size:11px;font-weight:700;letter-spacing:.5px;color:var(--ks-ink2);">IMPORTE (€)</label>
          <input type="number" id="exImp" min="0" step="0.5" placeholder="0,00" style="width:100%;margin-top:6px;padding:10px;border:1px solid var(--ks-line);border-radius:8px;font-size:14px;font-family:inherit;">
        </div>
        <div class="ks-modal-foot" style="margin-top:18px;">
          <button class="ks-modal-close" id="exCancel">Cancelar</button>
          <button class="ks-pay" id="exOk" style="background:var(--ks-ink);color:#fff;">Añadir</button>
        </div>`);
      box.querySelector('#exX').addEventListener('click', () => this._closeSubModal());
      box.querySelector('#exCancel').addEventListener('click', () => this._closeSubModal());
      box.querySelector('#exOk').addEventListener('click', () => {
        const descripcion = box.querySelector('#exDesc').value.trim();
        const importe = parseFloat(box.querySelector('#exImp').value);
        if (!descripcion) { this._toast('Indica el concepto'); return; }
        if (!importe || importe <= 0) { this._toast('Importe inválido'); return; }
        box.querySelector('#exOk').disabled = true;
        this._sendToPage('agregar-extra', { reservaId: r._id, importe, descripcion });
      });
    }
    // v1.1.16 — COMPLEMENTO (servicio del catálogo con tipo complemento/ambos)
    // ⛓ AÑADIR COMPLEMENTO (desde el modal de la cita)
    // v1.1.83 — con ELECCIÓN DE VARIANTE. Antes solo viajaba el setupUid:
    //   un complemento con variantes (Peinado M/L/XL) se añadía siempre a
    //   precio y duración BASE. Requiere backend v1.0.44 y page code v1.0.37.
    _openAddComplementoModal(r) {
      const catalogo = Array.isArray(this._servicios) ? this._servicios : [];
      // Filtrar: tipo complemento o ambos, activo, con setupUid
      const candidatos = catalogo
        .filter(s => s && s.active !== false && s.setupUid && /complemento|ambos/i.test(String(s.tipo || '')))
        .sort((a, b) => String(a.label || '').localeCompare(String(b.label || '')));
      let opts = '<option value="">— Elegir complemento —</option>';
      candidatos.forEach(s => {
        const varTag = s.hasVariants ? ' · variantes' : '';
        opts += `<option value="${esc(s.setupUid)}">${esc(s.label)} · ${Number(s.duration) || 0}min · ${Number(s.price) || 0}€${varTag}</option>`;
      });
      const vacio = candidatos.length === 0;

      this._addCmpUid = '';
      this._addCmpVarIdx = 0;

      const box = this._openSubModal(`
        <div class="ks-modal-head"><span class="ks-modal-staff">⛓ AÑADIR COMPLEMENTO</span><button class="ks-modal-x" id="cmX">✕</button></div>
        <div style="margin-top:14px;font-size:13px;color:var(--ks-ink2);">Se añadirá al final del pack y sumará tiempo + precio.</div>
        <div style="margin-top:14px;">
          <label style="font-size:11px;font-weight:700;letter-spacing:.5px;color:var(--ks-ink2);">COMPLEMENTO</label>
          <select id="cmSel" style="width:100%;margin-top:6px;padding:10px;border:1px solid var(--ks-line);border-radius:8px;font-size:14px;font-family:inherit;">${opts}</select>
          ${vacio ? '<div style="margin-top:10px;color:#a55b00;font-size:12px;font-style:italic;">No hay servicios marcados como Complemento/Ambos en el catálogo.</div>' : ''}
        </div>
        <div id="cmOpts" style="margin-top:6px;"></div>
        <div class="ks-modal-foot" style="margin-top:18px;">
          <button class="ks-modal-close" id="cmCancel">Cancelar</button>
          <button class="ks-pay" id="cmOk" style="background:var(--ks-ink);color:#fff;" ${vacio ? 'disabled' : ''}>Añadir</button>
        </div>`);
      box.querySelector('#cmX').addEventListener('click', () => this._closeSubModal());
      box.querySelector('#cmCancel').addEventListener('click', () => this._closeSubModal());

      const sel = box.querySelector('#cmSel');
      sel.addEventListener('change', () => {
        this._addCmpUid = sel.value || '';
        this._addCmpVarIdx = 0;
        this._renderAddComplementoOpts(box);
      });

      box.querySelector('#cmOk').addEventListener('click', () => {
        const setupUid = this._addCmpUid || sel.value;
        if (!setupUid) { this._toast('Elige un complemento'); return; }
        const svc = this._porSetupUid[setupUid];
        const varianteSel = svc
          ? this._varianteSelDeLinea({ servicio: svc, variantIdx: this._addCmpVarIdx })
          : null;
        box.querySelector('#cmOk').disabled = true;
        this._sendToPage('agregar-complemento', { reservaId: r._id, setupUid, varianteSel });
      });
    }

    // v1.1.83 — Variantes del complemento elegido. Solo variantes: los
    // complementos no arrastran cascada propia en este circuito.
    _renderAddComplementoOpts(box) {
      const cont = box.querySelector('#cmOpts');
      if (!cont) return;
      const svc = this._addCmpUid ? this._porSetupUid[this._addCmpUid] : null;
      const vars = (svc && Array.isArray(svc.variantes)) ? svc.variantes : [];
      if (!svc || !svc.hasVariants || !vars.length) { cont.innerHTML = ''; return; }

      cont.innerHTML = `<div style="margin-top:12px"><label style="font-size:11px;font-weight:700;letter-spacing:.5px;color:var(--ks-ink2);">VARIANTE</label>
        <div class="ks-variant-list" style="margin-top:6px">${vars.map((v, i) => {
          const vLabel = (typeof v === 'string') ? v : (v.label || v.nombre || '');
          const vPrice = (typeof v === 'object') ? Number(v.precio != null ? v.precio : v.price) : NaN;
          const vDur = (typeof v === 'object') ? Number(v.duracion != null ? v.duracion : v.duration) : NaN;
          const meta = [];
          if (!isNaN(vPrice)) meta.push(vPrice > 0 ? `${vPrice}€` : 'incluido');
          if (!isNaN(vDur) && vDur > 0) meta.push(`${vDur}′`);
          const metaHTML = meta.length ? `<span class="ks-dur">${meta.join(' · ')}</span>` : '';
          return `<button class="ks-variant ${i === this._addCmpVarIdx ? 'active' : ''}" data-cmvi="${i}" style="display:flex;justify-content:space-between;align-items:center"><span>${esc(vLabel)}</span>${metaHTML}</button>`;
        }).join('')}</div></div>`;

      cont.querySelectorAll('[data-cmvi]').forEach(b => b.addEventListener('click', () => {
        this._addCmpVarIdx = parseInt(b.getAttribute('data-cmvi'), 10) || 0;
        this._renderAddComplementoOpts(box);
      }));
    }

    // v1.1.30 — SERVICIO ADICIONAL: añade un servicio principal NUEVO al
    // final de la cita existente. La cascada del nuevo servicio (si es
    // complejo) se construye en el backend reutilizando construirFasesPack.
    // Regla pedida por Jal: se encadena después de la última fase ocupante.
    // ═══════════════════════════════════════════════════
    // + SERVICIO ADICIONAL (desde el modal de la cita)
    // v1.1.81 — Ahora con ELECCIÓN DE VARIANTE. Antes solo se mandaba el
    //   setupUid: un servicio con variantes (Corte Mujer M/L/XL) se añadía
    //   siempre a precio y duración BASE, y un servicio con fases
    //   obligatorias con variantes (CASO B: Botox → Planchado M/L/XL)
    //   fallaba con "Falta elegir variante de: …" y no había manera de
    //   añadirlo. Requiere backend v1.0.43 y page code v1.0.36.
    //   Los complementos OPCIONALES no se ofrecen aquí: para eso está el
    //   botón "⛓ Complemento" del propio modal de la cita.
    // ═══════════════════════════════════════════════════
    _openAddServicioModal(r) {
      const catalogo = Array.isArray(this._servicios) ? this._servicios : [];
      // Filtrar: tipo principal o ambos, activo, con setupUid
      const candidatos = catalogo
        .filter(s => s && s.active !== false && s.setupUid && /principal|ambos/i.test(String(s.tipo || '')))
        .sort((a, b) => String(a.label || '').localeCompare(String(b.label || '')));
      let opts = '<option value="">— Elegir servicio —</option>';
      candidatos.forEach(s => {
        const dur = Number(s.duration) || 0;
        const px = Number(s.price) || 0;
        const claseTag = s.claseServicio === 'complejo_fases' || s.claseServicio === 'complejo_proceso' ? ' · cascada' : '';
        const varTag = s.hasVariants ? ' · variantes' : '';
        opts += `<option value="${esc(s.setupUid)}" data-precio="${px}">${esc(s.label)} · ${dur}min · ${px}€${claseTag}${varTag}</option>`;
      });
      const vacio = candidatos.length === 0;

      // Estado de la selección (se reinicia cada vez que se abre)
      this._addSvcUid = '';
      this._addSvcVarIdx = 0;
      this._addSvcComplSel = {};

      const box = this._openSubModal(`
        <div class="ks-modal-head"><span class="ks-modal-staff">+ AÑADIR SERVICIO</span><button class="ks-modal-x" id="svX">✕</button></div>
        <div style="margin-top:14px;font-size:13px;color:var(--ks-ink2);">Se añadirá al final de la cita actual y sumará tiempo + precio.</div>
        <div style="margin-top:14px;">
          <label style="font-size:11px;font-weight:700;letter-spacing:.5px;color:var(--ks-ink2);">SERVICIO</label>
          <select id="svSel" style="width:100%;margin-top:6px;padding:10px;border:1px solid var(--ks-line);border-radius:8px;font-size:14px;font-family:inherit;">${opts}</select>
          ${vacio ? '<div style="margin-top:10px;color:#a55b00;font-size:12px;font-style:italic;">No hay servicios principales en el catálogo.</div>' : ''}
        </div>
        <div id="svOpts" style="margin-top:6px;"></div>
        <div class="ks-modal-foot" style="margin-top:18px;">
          <button class="ks-modal-close" id="svCancel">Cancelar</button>
          <button class="ks-pay" id="svOk" style="background:var(--ks-ink);color:#fff;" ${vacio ? 'disabled' : ''}>Añadir</button>
        </div>`);
      box.querySelector('#svX').addEventListener('click', () => this._closeSubModal());
      box.querySelector('#svCancel').addEventListener('click', () => this._closeSubModal());

      const sel = box.querySelector('#svSel');
      sel.addEventListener('change', () => {
        this._addSvcUid = sel.value || '';
        this._addSvcVarIdx = 0;
        this._addSvcComplSel = {};
        this._renderAddServicioOpts(box);
      });

      box.querySelector('#svOk').addEventListener('click', () => {
        const setupUid = this._addSvcUid || sel.value;
        if (!setupUid) { this._toast('Elige un servicio'); return; }
        const svc = this._porSetupUid[setupUid];
        if (!svc) { this._toast('Servicio no encontrado en el catálogo'); return; }

        // Variante del propio servicio
        const varianteSel = this._varianteSelDeLinea({ servicio: svc, variantIdx: this._addSvcVarIdx });

        // Fases obligatorias con variantes (CASO B): sin elección el motor
        // no puede construir las fases y el backend rechaza la operación.
        // Se valida aquí para dar el aviso antes de la ida y vuelta.
        const comps = Array.isArray(svc.complementos) ? svc.complementos : [];
        const complementosSetupUid = [];
        for (const c of comps) {
          if (!c || !c.required) continue;
          const cvars = Array.isArray(c.variantes) ? c.variantes : [];
          if (c.hasVariants && cvars.length) {
            const elegida = this._addSvcComplSel[c.setupUid];
            if (!elegida || typeof elegida !== 'object') {
              this._toast(`Elige una opción de "${c.label}" (obligatorio)`);
              return;
            }
            const v = cvars[elegida.varianteIdx];
            if (!v) { this._toast(`Opción no válida en "${c.label}"`); return; }
            complementosSetupUid.push({
              uid: c.setupUid,
              varianteId: (typeof v === 'object' && v.tamano_estilo) ? v.tamano_estilo : String(elegida.varianteIdx),
              varianteLabel: (typeof v === 'object') ? (v.label || v.nombre || '') : String(v),
              price: (typeof v === 'object') ? Number(v.precio != null ? v.precio : v.price) || 0 : 0,
              duration: (typeof v === 'object') ? Number(v.duracion != null ? v.duracion : v.duration) || 0 : 0
            });
          } else {
            // Obligatorio sin variantes que aun así llega al widget: se
            // manda tal cual para que el motor lo materialice.
            complementosSetupUid.push(c.setupUid);
          }
        }

        box.querySelector('#svOk').disabled = true;
        this._sendToPage('agregar-servicio', {
          reservaId: r._id,
          setupUid,
          varianteSel,
          complementosSetupUid
        });
      });
    }

    // v1.1.81 — Bloque de opciones del servicio elegido en "+ Servicio
    // adicional": variantes del propio servicio y fases obligatorias con
    // variantes. Se repinta entero en cada cambio (bloque pequeño y aislado).
    _renderAddServicioOpts(box) {
      const cont = box.querySelector('#svOpts');
      if (!cont) return;
      const svc = this._addSvcUid ? this._porSetupUid[this._addSvcUid] : null;
      if (!svc) { cont.innerHTML = ''; return; }

      const chip = (label, price, dur, active, attrs) => {
        const meta = [];
        if (!isNaN(price)) meta.push(price > 0 ? `${price}€` : 'incluido');
        if (!isNaN(dur) && dur > 0) meta.push(`${dur}′`);
        const metaHTML = meta.length ? `<span class="ks-dur">${meta.join(' · ')}</span>` : '';
        return `<button class="ks-variant ${active ? 'active' : ''}" ${attrs} style="display:flex;justify-content:space-between;align-items:center"><span>${esc(label)}</span>${metaHTML}</button>`;
      };

      let html = '';

      const vars = Array.isArray(svc.variantes) ? svc.variantes : [];
      if (svc.hasVariants && vars.length) {
        html += `<div style="margin-top:12px"><label style="font-size:11px;font-weight:700;letter-spacing:.5px;color:var(--ks-ink2);">VARIANTE</label>
          <div class="ks-variant-list" style="margin-top:6px">${vars.map((v, i) => {
            const vLabel = (typeof v === 'string') ? v : (v.label || v.nombre || '');
            const vPrice = (typeof v === 'object') ? Number(v.precio != null ? v.precio : v.price) : NaN;
            const vDur = (typeof v === 'object') ? Number(v.duracion != null ? v.duracion : v.duration) : NaN;
            return chip(vLabel, vPrice, vDur, i === this._addSvcVarIdx, `data-svvi="${i}"`);
          }).join('')}</div></div>`;
      }

      const comps = (Array.isArray(svc.complementos) ? svc.complementos : [])
        .filter(c => c && c.required && c.hasVariants && Array.isArray(c.variantes) && c.variantes.length);
      for (const c of comps) {
        const sel = this._addSvcComplSel[c.setupUid];
        const selIdx = (sel && typeof sel === 'object') ? sel.varianteIdx : -1;
        html += `<div style="margin-top:12px"><label style="font-size:11px;font-weight:700;letter-spacing:.5px;color:var(--ks-ink2);">⛓ ${esc(c.label)} · OBLIGATORIO</label>
          <div class="ks-variant-list" style="margin-top:6px">${c.variantes.map((v, vi) => {
            const vLabel = (typeof v === 'string') ? v : (v.label || v.nombre || '');
            const vPrice = (typeof v === 'object') ? Number(v.precio != null ? v.precio : v.price) : NaN;
            const vDur = (typeof v === 'object') ? Number(v.duracion != null ? v.duracion : v.duration) : NaN;
            return chip(vLabel, vPrice, vDur, vi === selIdx, `data-svcuid="${esc(c.setupUid)}" data-svcvi="${vi}"`);
          }).join('')}</div></div>`;
      }

      cont.innerHTML = html;

      cont.querySelectorAll('[data-svvi]').forEach(b => b.addEventListener('click', () => {
        this._addSvcVarIdx = parseInt(b.getAttribute('data-svvi'), 10) || 0;
        this._renderAddServicioOpts(box);
      }));
      cont.querySelectorAll('[data-svcuid]').forEach(b => b.addEventListener('click', () => {
        const uid = b.getAttribute('data-svcuid');
        const vi = parseInt(b.getAttribute('data-svcvi'), 10) || 0;
        this._addSvcComplSel[uid] = { varianteIdx: vi };
        this._renderAddServicioOpts(box);
      }));
    }

    // v1.1.17 — PRODUCTO (modal completo estilo V1: buscador + lista
    // + carrito + métodos de pago + REGISTRAR VENTA). Venta independiente
    // vinculada al packId (reservaId), no se mete en precioTotal.
    // ═══════════════════════════════════════════════════
    // v1.1.84 — TIENDA · venta de productos SIN CITA
    //
    // Reutiliza íntegro el modal de venta desde cita (buscador, carrito,
    // variantes, métodos de pago, MISSING_VARIANT). La única diferencia es
    // que no viaja `packId`: la venta queda registrada contra el contacto,
    // sin cita asociada.
    //
    // Cliente: se toma el que esté cargado en el aside. Si no hay ninguno,
    // o el que hay es provisional, se pide nombre + teléfono o email y se
    // crea el contacto al vuelo (mismo circuito que "+ Cliente nuevo").
    // No hay venta anónima: venderProductosDesdeAgenda exige contactId
    // porque genera un pedido real de tienda.
    // ═══════════════════════════════════════════════════
    // v1.1.85 — Tras registrar una venta de TIENDA, el modal no se cierra:
    // muestra el resultado y ofrece TICKET (factura simplificada) o FACTURA
    // completa con CIF/DNI, con la misma mecánica que el modal de cita.
    // El documento se ancla al cobro por `sourceKey` (bookingId de la venta),
    // no a una reserva — backend facturacionSalonLogic v1.0.4.
    _renderVentaDocPanel() {
      const body = this.shadowRoot.querySelector('#pdBody');
      if (!body) return;
      const cli = this._cliente || {};
      const total = Number(this._ventaTiendaTotal) || 0;

      let slot = '';
      if (this._ventaGenerando) {
        slot = `<div style="display:flex;align-items:center;gap:7px;color:var(--ks-ink2);font-size:12.5px;font-weight:600">
          <span style="display:inline-block;width:12px;height:12px;border:2px solid var(--ks-line);border-top-color:var(--ks-accent);border-radius:50%;animation:ksSpin .7s linear infinite;"></span>
          Generando documento…</div>`;
      } else if (this._ventaDoc && this._ventaDoc.invoiceNumber) {
        const d = this._ventaDoc;
        const esTicket = d.modo === 'ticket';
        slot = `<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <span style="display:inline-flex;align-items:center;gap:7px;background:${esTicket ? 'var(--ks-paper2)' : 'var(--ks-accent-soft)'};border:1px solid ${esTicket ? 'var(--ks-line)' : 'var(--ks-accent)'};border-radius:8px;padding:6px 12px;font-size:12.5px;font-weight:700;color:${esTicket ? 'var(--ks-ink)' : 'var(--ks-accent-ink)'}">
              <span>${esTicket ? '🧾' : '📄'}</span><span>${esc(d.invoiceNumber)}</span>
              <a href="#" id="vtPdf" title="Abrir PDF" style="text-decoration:none;color:inherit;font-size:14px;margin-left:2px">🔗</a>
            </span>
            ${esTicket ? '<button id="vtUpgrade" style="background:#15803d;color:#fff;border:0;border-radius:8px;padding:7px 11px;font-size:11.5px;font-weight:700;cursor:pointer;font-family:inherit">📄 Convertir a factura</button>' : ''}
          </div>`;
      } else if (this._ventaForm) {
        slot = `<div style="display:flex;flex-direction:column;gap:7px">
            <div style="font-size:10.5px;font-weight:700;color:var(--ks-ink3);letter-spacing:.5px;text-transform:uppercase">Datos para factura completa</div>
            <input id="vtVat" placeholder="CIF / DNI *" value="${esc(this._tiendaVatId || '')}" style="width:100%;box-sizing:border-box;padding:9px;border:1px solid var(--ks-line);border-radius:8px;font-size:13px;font-family:inherit">
            <input id="vtLegal" placeholder="Razón social o nombre fiscal" value="${esc(this._tiendaLegalName || '')}" style="width:100%;box-sizing:border-box;padding:9px;border:1px solid var(--ks-line);border-radius:8px;font-size:13px;font-family:inherit">
            <div style="display:flex;gap:7px">
              <button id="vtEmitir" style="flex:1;background:var(--ks-ink);color:#fff;border:0;border-radius:8px;padding:9px;font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit">Emitir factura</button>
              <button id="vtFormCancel" style="background:var(--ks-paper2);color:var(--ks-ink2);border:1px solid var(--ks-line);border-radius:8px;padding:9px 12px;font-size:12.5px;font-weight:600;cursor:pointer;font-family:inherit">Cancelar</button>
            </div>
            <div style="font-size:11px;color:var(--ks-ink3)">El CIF/DNI se guarda en la ficha del cliente para las próximas veces.</div>
          </div>`;
      } else {
        const conCif = !!(this._tiendaVatId || '').trim();
        slot = `<div style="display:flex;gap:8px">
            <button id="vtTicket" style="flex:1;background:var(--ks-paper2);color:var(--ks-ink);border:1px solid var(--ks-line);border-radius:8px;padding:10px;font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit">🧾 Ticket</button>
            <button id="vtFactura" style="flex:1;background:var(--ks-ink);color:#fff;border:0;border-radius:8px;padding:10px;font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit">📄 Factura</button>
          </div>${conCif ? `<div style="margin-top:7px;font-size:11px;color:var(--ks-ink3)">CIF/DNI recogido: <strong>${esc(this._tiendaVatId)}</strong></div>` : ''}`;
      }

      body.innerHTML = `
        <div style="text-align:center;padding:6px 0 12px">
          <div style="font-size:26px">✓</div>
          <div style="font-size:14px;font-weight:700;color:var(--ks-ink);margin-top:4px">Venta registrada</div>
          <div style="font-size:12.5px;color:var(--ks-ink2);margin-top:2px">${esc(cli.nombre || '')} · ${total}€</div>
        </div>
        <div style="border-top:1px solid var(--ks-line2);padding-top:12px">
          <div style="font-size:10.5px;font-weight:700;color:var(--ks-ink3);letter-spacing:.5px;text-transform:uppercase;margin-bottom:8px">Documento</div>
          ${slot}
        </div>
        <div class="ks-modal-foot" style="margin-top:16px">
          <button class="ks-modal-close" id="vtCerrar">Cerrar</button>
        </div>`;

      body.querySelector('#vtCerrar')?.addEventListener('click', () => {
        this._closeProductoModal();
        this._sendToPage('getReservas', { fecha: this._fecha });
      });
      body.querySelector('#vtTicket')?.addEventListener('click', () => {
        if (!this._ventaTiendaKey) { this._toast('No se puede identificar la venta'); return; }
        this._ventaGenerando = true; this._renderVentaDocPanel();
        this._sendToPage('generarTicketVenta', { sourceKey: this._ventaTiendaKey });
      });
      body.querySelector('#vtFactura')?.addEventListener('click', () => {
        this._ventaForm = true; this._renderVentaDocPanel();
      });
      body.querySelector('#vtUpgrade')?.addEventListener('click', () => {
        this._ventaForm = true; this._ventaDoc = null; this._renderVentaDocPanel();
      });
      body.querySelector('#vtFormCancel')?.addEventListener('click', () => {
        this._ventaForm = false; this._renderVentaDocPanel();
      });
      body.querySelector('#vtEmitir')?.addEventListener('click', () => {
        const vatId = body.querySelector('#vtVat').value.trim();
        const legalName = body.querySelector('#vtLegal').value.trim();
        if (!vatId) { this._toast('El CIF/DNI es obligatorio para la factura completa'); return; }
        if (!this._ventaTiendaKey) { this._toast('No se puede identificar la venta'); return; }
        this._ventaForm = false;
        this._ventaGenerando = true;
        this._renderVentaDocPanel();
        this._sendToPage('generarFacturaVenta', { sourceKey: this._ventaTiendaKey, vatId, legalName });
      });
      body.querySelector('#vtPdf')?.addEventListener('click', e => {
        e.preventDefault();
        const url = this._ventaDoc && this._ventaDoc.pdfUrl;
        if (url) window.open(url, '_blank', 'noopener');
        else this._toast('El documento no tiene PDF asociado');
      });
    }

    _openTiendaModal() {
      if (!this._puede('cobrar')) { this._toast('No tienes permiso para esta acción'); return; }
      // v1.1.86 — El paso de cliente se muestra SIEMPRE, también cuando ya
      // hay uno cargado en el aside: es donde se captura el CIF/DNI, que
      // hay que pedir con el cliente delante y no después de cobrar. Si el
      // cliente ya existe, el formulario viene relleno y basta con
      // continuar.
      this._tiendaVatId = '';
      this._tiendaLegalName = '';
      this._openTiendaClienteForm();
    }

    // Mini-formulario de identificación. Se prerrellena con lo que haya
    // en el aside (caso típico: cliente provisional con solo el nombre).
    _openTiendaClienteForm() {
      const cli = this._cliente || {};
      const yaIdentificado = !!(cli.contactId && !cli.esProvisional);
      const partes = String(cli.nombre || '').trim().split(' ');
      const nomPrev = partes.shift() || '';
      const apePrev = partes.join(' ');
      const box = this._openSubModal(`
        <div class="ks-modal-head"><span class="ks-modal-staff">🛍 TIENDA · CLIENTE</span><button class="ks-modal-x" id="tdX">✕</button></div>
        <div style="margin-top:14px;font-size:13px;color:var(--ks-ink2);">${yaIdentificado
          ? 'Cliente cargado. Añade el CIF/DNI si va a querer factura completa.'
          : 'La venta se registra a nombre de un cliente. Indica sus datos para darlo de alta.'}</div>
        <div style="margin-top:14px;display:grid;gap:8px">
          <input id="tdNombre" placeholder="Nombre *" value="${esc(nomPrev)}" ${yaIdentificado ? 'disabled' : ''} style="width:100%;box-sizing:border-box;padding:10px;border:1px solid var(--ks-line);border-radius:8px;font-size:14px;font-family:inherit;${yaIdentificado ? 'background:var(--ks-paper2);color:var(--ks-ink2);' : ''}">
          <input id="tdApellido" placeholder="Apellidos" value="${esc(apePrev)}" ${yaIdentificado ? 'disabled' : ''} style="width:100%;box-sizing:border-box;padding:10px;border:1px solid var(--ks-line);border-radius:8px;font-size:14px;font-family:inherit;${yaIdentificado ? 'background:var(--ks-paper2);color:var(--ks-ink2);' : ''}">
          <input id="tdTelefono" placeholder="Teléfono" value="${esc(cli.telefono || '')}" ${yaIdentificado ? 'disabled' : ''} style="width:100%;box-sizing:border-box;padding:10px;border:1px solid var(--ks-line);border-radius:8px;font-size:14px;font-family:inherit;${yaIdentificado ? 'background:var(--ks-paper2);color:var(--ks-ink2);' : ''}">
          <input id="tdEmail" placeholder="Email" value="${esc(cli.email || '')}" ${yaIdentificado ? 'disabled' : ''} style="width:100%;box-sizing:border-box;padding:10px;border:1px solid var(--ks-line);border-radius:8px;font-size:14px;font-family:inherit;${yaIdentificado ? 'background:var(--ks-paper2);color:var(--ks-ink2);' : ''}">
        </div>
        <div style="margin-top:14px;border-top:1px solid var(--ks-line2);padding-top:12px;">
          <div style="font-size:10.5px;font-weight:700;color:var(--ks-ink3);letter-spacing:.5px;text-transform:uppercase;margin-bottom:7px">Datos fiscales · solo si quiere factura</div>
          <div style="display:grid;gap:8px">
            <input id="tdVatId" placeholder="CIF / DNI" value="${esc(this._tiendaVatId || '')}" style="width:100%;box-sizing:border-box;padding:10px;border:1px solid var(--ks-line);border-radius:8px;font-size:14px;font-family:inherit;">
            <input id="tdLegal" placeholder="Razón social o nombre fiscal" value="${esc(this._tiendaLegalName || '')}" style="width:100%;box-sizing:border-box;padding:10px;border:1px solid var(--ks-line);border-radius:8px;font-size:14px;font-family:inherit;">
          </div>
          <div style="margin-top:7px;font-size:11px;color:var(--ks-ink3);">Si lo dejas vacío podrás emitir ticket, y añadir el CIF más tarde para convertirlo en factura.</div>
        </div>
        <div style="margin-top:10px;font-size:11.5px;color:var(--ks-ink3);">${yaIdentificado ? '' : 'Nombre y, al menos, teléfono o email.'}</div>
        <div class="ks-modal-foot" style="margin-top:16px;">
          <button class="ks-modal-close" id="tdCancel">Cancelar</button>
          <button class="ks-pay" id="tdOk" style="background:var(--ks-ink);color:#fff;">Continuar</button>
        </div>`);
      box.querySelector('#tdX').addEventListener('click', () => this._closeSubModal());
      box.querySelector('#tdCancel').addEventListener('click', () => this._closeSubModal());
      box.querySelector('#tdOk').addEventListener('click', () => {
        // Los datos fiscales se guardan siempre: viajan al paso de factura
        // y se persisten en la ficha del cliente al emitirla.
        this._tiendaVatId = box.querySelector('#tdVatId').value.trim();
        this._tiendaLegalName = box.querySelector('#tdLegal').value.trim();

        if (yaIdentificado) { this._abrirVentaTienda(); return; }

        const nombre = box.querySelector('#tdNombre').value.trim();
        const apellido = box.querySelector('#tdApellido').value.trim();
        const telefono = box.querySelector('#tdTelefono').value.trim();
        const email = box.querySelector('#tdEmail').value.trim();
        if (!nombre) { this._toast('El nombre es obligatorio'); return; }
        if (!telefono && !email) { this._toast('Indica teléfono o email'); return; }
        box.querySelector('#tdOk').disabled = true;
        // Bandera: al llegar 'clienteCreado' se abre la venta directamente.
        this._tiendaEsperandoCliente = true;
        this._sendToPage('crearCliente', { nombre, apellido, telefono, email });
      });
    }

    // Abre el modal de venta con el cliente cargado y SIN cita asociada.
    _abrirVentaTienda() {
      const cli = this._cliente;
      if (!cli || !cli.contactId) { this._toast('Falta identificar al cliente'); return; }
      this._closeSubModal();
      this._ventaTiendaActiva = true;
      this._ventaTiendaKey = '';
      this._ventaTiendaTotal = 0;
      this._ventaDoc = null;
      this._ventaForm = false;
      this._ventaGenerando = false;
      this._openAddProductoModal({
        _id: '',                       // sin cita → el page code manda packId vacío
        contactId: cli.contactId,
        clientName: cli.nombre || '',
        clientEmail: cli.email || '',
        clientPhone: cli.telefono || ''
      }, { titulo: `🛍 TIENDA · ${esc(cli.nombre || '')}` });
    }

    // v1.1.84 — `opts.titulo` permite reutilizar este mismo modal desde el
    // botón TIENDA (venta sin cita). Sin opts, comportamiento de siempre.
    _openAddProductoModal(r, opts) {
      // Sin contactId no hay venta: venderProductosDesdeAgenda crea un
      // pedido real de tienda contra un contacto y aborta sin él.
      const esProvisional = !r.contactId;
      if (esProvisional) {
        this._toast('Cliente provisional · convierte el cliente primero para vender productos');
        return;
      }
      const tituloModal = (opts && opts.titulo) ? opts.titulo : `🛍 AÑADIR PRODUCTO · ${esc(r.clientName || '')}`;
      this._pendingProdReserva = r;
      this._productoCart = [];
      this._productoSearchQ = '';
      this._productoMetodoPago = 'Efectivo';
      this._productosCache = this._productosCache || null;
      const box = this._openSubModal(`
        <div class="ks-modal-head"><span class="ks-modal-staff">${tituloModal}</span><button class="ks-modal-x" id="pdX">✕</button></div>
        <div id="pdBody" style="margin-top:14px;font-size:13px;color:var(--ks-ink2);">Cargando catálogo…</div>
      `);
      box.id = 'subModalProducto';
      box.style.width = '420px';
      box.querySelector('#pdX').addEventListener('click', () => this._closeProductoModal());
      // Si ya tenemos cache, pintar; si no, pedir
      if (this._productosCache && this._productosCache.length) {
        this._renderProductoPanel();
      } else {
        this._sendToPage('get-productos', {});
      }
    }
    _closeProductoModal() {
      this._pendingProdReserva = null;
      // v1.1.85 — limpiar el estado de la venta de TIENDA
      this._ventaTiendaActiva = false;
      this._ventaTiendaKey = '';
      this._ventaTiendaTotal = 0;
      this._ventaDoc = null;
      this._ventaForm = false;
      this._ventaGenerando = false;
      this._productoCart = [];
      this._productoSearchQ = '';
      this._closeSubModal();
    }
    _renderProductoPanel() {
      const root = this.shadowRoot;
      const body = root.querySelector('#pdBody');
      if (!body) return;
      const productos = this._productosCache || [];
      const q = String(this._productoSearchQ || '').toLowerCase().trim();
      const filtrados = q
        ? productos.filter(p => (p.name || '').toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q))
        : productos;
      const visibles = q ? filtrados.slice(0, 50) : filtrados.slice(0, 18);

      // Lista
      let listaHTML = '';
      if (!productos.length) {
        listaHTML = '<div style="padding:10px;color:#7a7f8b;font-size:12px;font-style:italic;">Catálogo vacío</div>';
      } else if (!filtrados.length) {
        listaHTML = `<div style="padding:10px;color:#7a7f8b;font-size:12px;font-style:italic;">Sin resultados para "${esc(q)}"</div>`;
      } else {
        this._productoExpand = this._productoExpand || {};
        for (const p of visibles) {
          const sinStock = p.inStock === false;
          // v1.1.25 — Productos con variantes (250ml / 1000ml ...)
          if (p.manageVariants && Array.isArray(p.variants) && p.variants.length > 1) {
            const expanded = !!this._productoExpand[p.id];
            const arrow = expanded ? '▾' : '▸';
            const priceRange = (() => {
              const ps = p.variants.map(v => Number(v.price) || 0).filter(x => x > 0);
              if (!ps.length) return `${Number(p.price) || 0}€`;
              const min = Math.min(...ps);
              const max = Math.max(...ps);
              return min === max ? `${min}€` : `${min}€ – ${max}€`;
            })();
            const stockTag = sinStock ? '<span style="color:#b91c1c;font-size:9px;font-weight:700;letter-spacing:.5px;margin-left:5px;">SIN STOCK</span>' : '';
            listaHTML += `<div class="pd-item pd-item-parent ${sinStock ? 'pd-disabled' : ''}" data-toggle-prod="${esc(p.id)}">
              <span class="pd-item-name"><span class="pd-arrow">${arrow}</span> ${esc(p.name)} <span class="pd-variant-count">${p.variants.length} variantes</span>${stockTag}</span>
              <span class="pd-item-price">${priceRange}</span>
            </div>`;
            if (expanded) {
              for (const v of p.variants) {
                const cartKey = `${p.id}:${v.variantId}`;
                const enCarrito = (this._productoCart || []).some(c => c.cartKey === cartKey);
                const vSinStock = v.inStock === false;
                const disabled = vSinStock && !enCarrito;
                const enTag = enCarrito ? ' <span style="color:#15803d;font-weight:700;font-size:10px;">✓</span>' : '';
                const vStockTag = vSinStock ? '<span style="color:#b91c1c;font-size:9px;font-weight:700;letter-spacing:.5px;margin-left:5px;">SIN STOCK</span>' : '';
                listaHTML += `<div class="pd-variant-row ${disabled ? 'pd-disabled' : ''}"
                    data-prod-id="${esc(p.id)}"
                    data-prod-name="${esc(p.name)}"
                    data-prod-price="${Number(v.price) || 0}"
                    data-variant-id="${esc(v.variantId)}"
                    data-variant-label="${esc(v.label)}">
                  <span class="pd-variant-label">↳ ${esc(v.label)}${enTag}${vStockTag}</span>
                  <span class="pd-variant-price">${Number(v.price) || 0}€</span>
                </div>`;
              }
            }
          } else {
            // Producto simple — comportamiento V1
            const enCarrito = (this._productoCart || []).some(c => c.cartKey === `${p.id}:`);
            const disabled = sinStock && !enCarrito;
            const enTag = enCarrito ? ' <span style="color:#15803d;font-weight:700;font-size:10px;">✓</span>' : '';
            const stockTag = sinStock ? '<span style="color:#b91c1c;font-size:9px;font-weight:700;letter-spacing:.5px;margin-left:5px;">SIN STOCK</span>' : '';
            listaHTML += `<div class="pd-item ${disabled ? 'pd-disabled' : ''}" data-prod-id="${esc(p.id)}" data-prod-name="${esc(p.name)}" data-prod-price="${Number(p.price) || 0}">
              <span class="pd-item-name">${esc(p.name)}${enTag}${stockTag}</span>
              <span class="pd-item-price">${Number(p.price) || 0}€</span>
            </div>`;
          }
        }
        if (!q && filtrados.length > 18) {
          listaHTML += `<div style="padding:6px 10px;font-size:10px;color:#7a7f8b;font-style:italic;">…${filtrados.length - 18} más. Usa el buscador.</div>`;
        }
      }

      // Carrito
      let cartHTML = '';
      let total = 0;
      if (this._productoCart.length) {
        cartHTML += '<div class="pd-cart"><div class="pd-cart-title">🛍 Carrito</div>';
        for (const c of this._productoCart) {
          const sub = Math.round((Number(c.price) || 0) * (c.quantity || 1) * 100) / 100;
          total += sub;
          const displayName = c.variantLabel ? `${c.productName} · ${c.variantLabel}` : c.productName;
          cartHTML += `<div class="pd-cart-line">
            <span class="pd-cart-name">${esc(displayName)}</span>
            <button class="pd-qty" data-prod-dec="${esc(c.cartKey)}">−</button>
            <span class="pd-qty-val">${c.quantity}</span>
            <button class="pd-qty" data-prod-inc="${esc(c.cartKey)}">+</button>
            <span class="pd-cart-sub">${sub}€</span>
            <button class="pd-cart-rm" data-prod-rm="${esc(c.cartKey)}" title="Quitar">✕</button>
          </div>`;
        }
        total = Math.round(total * 100) / 100;
        cartHTML += `<div class="pd-total"><span>TOTAL</span><span class="pd-total-val">${total}€</span></div></div>`;
      }

      // Métodos de pago
      const mp = this._productoMetodoPago || 'Efectivo';
      const payHTML = this._productoCart.length ? `<div class="pd-pay-row">
        <button class="pd-pay ${mp === 'Efectivo' ? 'sel' : ''}" data-mp="Efectivo">EFECTIVO</button>
        <button class="pd-pay ${mp === 'Tarjeta' ? 'sel' : ''}" data-mp="Tarjeta">TARJETA</button>
        <button class="pd-pay ${mp === 'Bizum' ? 'sel' : ''}" data-mp="Bizum">BIZUM</button>
      </div>` : '';

      const confirmDisabled = this._productoCart.length === 0;
      const confirmHTML = `<div class="pd-confirm-row">
        <button class="ks-modal-close" id="pdCancel">Cerrar</button>
        <button class="ks-pay" id="pdConfirm" ${confirmDisabled ? 'disabled' : ''} style="background:#15803d;color:#fff;font-weight:700;flex:1;">REGISTRAR VENTA${total > 0 ? ` · ${total}€` : ''}</button>
      </div>`;

      body.innerHTML = `
        <input type="text" class="pd-search" id="pdSearch" placeholder="Buscar producto…" value="${esc(this._productoSearchQ || '')}">
        <div class="pd-list">${listaHTML}</div>
        ${cartHTML}
        ${payHTML}
        ${confirmHTML}
      `;
      this._attachProductoEvents();
    }
    _attachProductoEvents() {
      const root = this.shadowRoot;
      const body = root.querySelector('#pdBody');
      if (!body) return;
      // Buscador
      const search = body.querySelector('#pdSearch');
      if (search) {
        search.addEventListener('input', e => {
          this._productoSearchQ = e.target.value;
          clearTimeout(this._productoSearchT);
          this._productoSearchT = setTimeout(() => this._renderProductoPanel(), 150);
        });
      }
      // v1.1.25 — Click en producto con variantes → toggle expansión
      body.querySelectorAll('[data-toggle-prod]').forEach(el => {
        el.addEventListener('click', () => {
          if (el.classList.contains('pd-disabled')) return;
          const id = el.getAttribute('data-toggle-prod');
          this._productoExpand = this._productoExpand || {};
          this._productoExpand[id] = !this._productoExpand[id];
          this._renderProductoPanel();
        });
      });
      // Click en variante (sub-item) → añade al carrito con variantId
      body.querySelectorAll('.pd-variant-row').forEach(it => {
        it.addEventListener('click', () => {
          if (it.classList.contains('pd-disabled')) return;
          const id = it.dataset.prodId;
          const variantId = it.dataset.variantId;
          const variantLabel = it.dataset.variantLabel;
          const cartKey = `${id}:${variantId}`;
          const existente = this._productoCart.find(c => c.cartKey === cartKey);
          if (existente) {
            existente.quantity = (existente.quantity || 1) + 1;
          } else {
            this._productoCart.push({
              cartKey,
              productId: id,
              productName: it.dataset.prodName,
              variantId,
              variantLabel,
              price: Number(it.dataset.prodPrice) || 0,
              quantity: 1
            });
          }
          this._renderProductoPanel();
        });
      });
      // Click en producto simple (sin variantes) → añade directo
      body.querySelectorAll('.pd-item:not(.pd-item-parent)').forEach(it => {
        it.addEventListener('click', () => {
          if (it.classList.contains('pd-disabled')) return;
          const id = it.dataset.prodId;
          const cartKey = `${id}:`;
          const existente = this._productoCart.find(c => c.cartKey === cartKey);
          if (existente) {
            existente.quantity = (existente.quantity || 1) + 1;
          } else {
            this._productoCart.push({
              cartKey,
              productId: id,
              productName: it.dataset.prodName,
              variantId: null,
              variantLabel: null,
              price: Number(it.dataset.prodPrice) || 0,
              quantity: 1
            });
          }
          this._renderProductoPanel();
        });
      });
      // +/-/× — v1.1.25 usan cartKey en lugar de solo productId
      body.querySelectorAll('[data-prod-inc]').forEach(b => b.addEventListener('click', e => {
        e.stopPropagation();
        const k = b.getAttribute('data-prod-inc');
        const it = this._productoCart.find(c => c.cartKey === k);
        if (it) { it.quantity++; this._renderProductoPanel(); }
      }));
      body.querySelectorAll('[data-prod-dec]').forEach(b => b.addEventListener('click', e => {
        e.stopPropagation();
        const k = b.getAttribute('data-prod-dec');
        const it = this._productoCart.find(c => c.cartKey === k);
        if (it) {
          it.quantity = Math.max(1, (it.quantity || 1) - 1);
          this._renderProductoPanel();
        }
      }));
      body.querySelectorAll('[data-prod-rm]').forEach(b => b.addEventListener('click', e => {
        e.stopPropagation();
        const k = b.getAttribute('data-prod-rm');
        this._productoCart = this._productoCart.filter(c => c.cartKey !== k);
        this._renderProductoPanel();
      }));
      // Métodos
      body.querySelectorAll('[data-mp]').forEach(b => b.addEventListener('click', () => {
        this._productoMetodoPago = b.getAttribute('data-mp');
        this._renderProductoPanel();
      }));
      // Cerrar + Confirmar
      body.querySelector('#pdCancel')?.addEventListener('click', () => this._closeProductoModal());
      body.querySelector('#pdConfirm')?.addEventListener('click', () => {
        const r = this._pendingProdReserva;
        if (!r || !this._productoCart.length) return;
        body.querySelector('#pdConfirm').disabled = true;
        body.querySelector('#pdConfirm').textContent = 'Registrando…';
        this._sendToPage('vender-productos-cita', {
          reservaId: r._id,
          contactId: r.contactId || '',
          contactName: r.clientName || '',
          contactEmail: r.clientEmail || '',
          contactPhone: r.clientPhone || '',
          items: this._productoCart.map(c => ({
            productId: c.productId,
            productName: c.productName,
            variantId: c.variantId || undefined,
            variantLabel: c.variantLabel || undefined,
            price: c.price,
            quantity: c.quantity
          })),
          metodoPago: this._productoMetodoPago || 'Efectivo'
        });
      });
    }
    _renderProductosModal(productos) {
      // v1.1.17 — entry point para el case 'productos-cargados': cachea
      // catálogo y repinta panel si el modal está abierto.
      this._productosCache = Array.isArray(productos) ? productos : [];
      const body = this.shadowRoot.querySelector('#pdBody');
      if (body) this._renderProductoPanel();
    }
    _openMixto(total) {
      const box = this.shadowRoot.getElementById('mixtoBox'); if (!box) return;
      box.style.display = 'block';
      box.innerHTML = `
        <div style="background:var(--ks-paper2);border:1px solid var(--ks-line2);border-radius:9px;padding:11px;margin-top:8px">
          <div style="font-size:11px;font-weight:700;color:oklch(0.5 0.13 255);text-align:center;margin-bottom:8px">PAGO MIXTO · total ${total}€</div>
          <div class="ks-disc-row"><span class="ks-disc-lbl">Tarjeta</span><div class="ks-disc-input"><input id="mxT" type="number" min="0" placeholder="0"><span>€</span></div></div>
          <div class="ks-disc-row"><span class="ks-disc-lbl">Efectivo</span><div class="ks-disc-input"><input id="mxE" type="number" min="0" placeholder="0"><span>€</span></div></div>
          <div class="ks-disc-row"><span class="ks-disc-lbl">Bizum</span><div class="ks-disc-input"><input id="mxB" type="number" min="0" placeholder="0"><span>€</span></div></div>
          <div id="mxSum" style="text-align:right;font-size:11px;font-weight:700;color:oklch(0.6 0.16 25);padding-top:6px">Suma: 0€ / ${total}€</div>
          <div style="display:flex;gap:8px;margin-top:8px"><button class="ks-detail-cancel" id="mxCancel" style="flex:1">Cancelar</button><button class="ks-detail-add" id="mxOk" style="flex:1" disabled>Cobrar mixto</button></div>
        </div>`;
      const t = box.querySelector('#mxT'), e = box.querySelector('#mxE'), b = box.querySelector('#mxB'), sum = box.querySelector('#mxSum'), ok = box.querySelector('#mxOk');
      const recalc = () => {
        const s = (parseFloat(t.value) || 0) + (parseFloat(e.value) || 0) + (parseFloat(b.value) || 0);
        sum.textContent = `Suma: ${s}€ / ${total}€`;
        const match = Math.abs(s - total) < 0.01 && s > 0;
        sum.style.color = match ? 'oklch(0.5 0.14 150)' : 'oklch(0.6 0.16 25)';
        ok.disabled = !match;
      };
      [t, e, b].forEach(i => i.addEventListener('input', recalc));
      box.querySelector('#mxCancel').addEventListener('click', () => { box.style.display = 'none'; box.innerHTML = ''; });
      ok.addEventListener('click', () => {
        const dd = {}; const vt = parseFloat(t.value) || 0, ve = parseFloat(e.value) || 0, vb = parseFloat(b.value) || 0;
        if (vt > 0) dd.Tarjeta = vt; if (ve > 0) dd.Efectivo = ve; if (vb > 0) dd.Bizum = vb;
        this._pagar('Mixto', JSON.stringify(dd));
      });
    }
    _pagar(metodoPago, desglosemetodopago) {
      if (this._pagando || !this._modalReserva) return;
      this._pagando = true;
      this.shadowRoot.querySelectorAll('.ks-pay').forEach(b => b.disabled = true);
      // v1.1.26 — calcular neto y token descuento (soporta % y €)
      // v1.1.39 — _calcDescuento ya aplica la promo: subtotal es post-promo,
      //   por lo que (subtotal − discEur) es el NETO FINAL ya descontado por
      //   promo + manual. descripcionExtra incluye token de promo si aplica.
      // v1.1.50 — F4/F5: si hay canje activo (this._canjeActivo) se RESTA su
      //   ahorro al importeNeto y se CONCATENA su descripcionToken (prefijado
      //   con 🎟️/🎫) a los tokens existentes. Se captura también el código
      //   en this._canjePendienteConfirmar para enviar 'confirmarCanje' al
      //   recibir 'reservaPagada' ok del page code.
      const r = this._modalReserva;
      const { subtotal, discPct, discEur, ahorroPromo, tienePromo } = this._calcDescuento();
      const ahorroCanje = (this._canjeActivo && this._canjeActivo.ahorro > 0)
        ? Math.round(this._canjeActivo.ahorro * 100) / 100
        : 0;
      const importeNeto = Math.max(0, Math.round((subtotal - discEur - ahorroCanje) * 100) / 100);
      const _tokens = [];
      if (tienePromo && ahorroPromo > 0) {
        _tokens.push(`🌈 Promo -${ahorroPromo.toFixed(2)}€`);
      }
      if (discEur > 0) {
        _tokens.push(this._discMode === 'eur'
          ? `🏷️ Descuento -${discEur}€`
          : `🏷️ Descuento -${discPct}% (-${discEur}€)`);
      }
      if (ahorroCanje > 0 && this._canjeActivo) {
        const icon = this._canjeActivo.tipo === 'tarjeta' ? '🎫' : '🎟️';
        _tokens.push(`${icon} ${this._canjeActivo.descripcionToken || this._canjeActivo.codigo}`);
      }
      const descripcionExtra = _tokens.join(', ');
      // v1.1.50 — Capturar canje pendiente de confirmar ANTES de cobrar.
      // Se confirmará tras recibir 'reservaPagada' ok del page code.
      // Se guarda en variable independiente porque _canjeActivo se podría
      // reasignar si el operador toca algo durante el cobro (no debería,
      // pero defensivo).
      if (this._canjeActivo && this._canjeActivo.codigo) {
        this._canjePendienteConfirmar = {
          reservaId: r._id,
          codigoProducto: this._canjeActivo.codigo,
          staff: r.staffName || r.staffId || ''
        };
      } else {
        this._canjePendienteConfirmar = null;
      }
      this._toast('Cobrando…');
      this._sendToPage('pagarReserva', {
        reservaId: r._id,
        metodoPago,
        desglosemetodopago: desglosemetodopago || '',
        importeNeto,
        descripcionExtra
      });
    }

    // ═══════════════════════════════════════════════════
    // SERVICIO A MEDIDA — v1.1.12
    //   Modal mínimo: solo descripción + duración + precio + botón "Armar".
    //   Una vez armado, el usuario coloca la cita haciendo click sobre la
    //   columna del staff y hora deseados (mismo flujo que un servicio ordinario).
    //   La creación real (con staff+hora) ocurre en _colocarReserva al detectar
    //   that._armed.medida === true → envía 'servicio-medida' al page code.
    // ═══════════════════════════════════════════════════
    _openBlankServicio() {
      const root = this.shadowRoot;
      this._closeBlankForm();
      if (!this._cliente || !this._cliente.nombre) { this._toast('Selecciona un cliente primero'); return; }

      const scrim = document.createElement('div'); scrim.className = 'ks-modal-scrim'; scrim.id = 'blankScrim';
      scrim.addEventListener('click', e => { if (e.target === scrim) this._closeBlankForm(); });
      const form = document.createElement('div'); form.className = 'ks-blankform';
      form.innerHTML = `
        <div class="ks-blank-head"><div><span class="ks-blank-eyebrow">Servicio a medida</span><h3 class="ks-blank-title">Fuera de catálogo</h3></div><button class="ks-modal-x" id="bx">✕</button></div>
        <p class="ks-blank-note">Cliente: <b>${esc(this._cliente.nombre)}</b>. Al armar, haz click sobre la columna del personal y hora deseados (igual que un servicio del catálogo).</p>
        <label class="ks-field"><span>Descripción del servicio</span><input id="bDesc" placeholder="Ej. Tratamiento especial" autofocus></label>
        <div class="ks-field-row">
          <label class="ks-field"><span>Duración (min)</span><input id="bDur" type="number" min="1" step="1" value="30"></label>
          <label class="ks-field"><span>Precio (€)</span><input id="bPrice" type="number" min="0" step="0.01" placeholder="0"></label>
        </div>
        <div class="ks-blank-foot"><button class="ks-detail-cancel" id="bcancel">Cancelar</button><button class="ks-detail-add" id="bsave">Armar</button></div>`;
      scrim.appendChild(form); root.appendChild(scrim);
      form.querySelector('#bx').addEventListener('click', () => this._closeBlankForm());
      form.querySelector('#bcancel').addEventListener('click', () => this._closeBlankForm());
      form.querySelector('#bsave').addEventListener('click', () => {
        const desc = form.querySelector('#bDesc').value.trim();
        const dur = parseInt(form.querySelector('#bDur').value, 10) || 0;
        const precio = parseFloat(form.querySelector('#bPrice').value) || 0;
        if (!desc) { this._toast('Falta descripción'); return; }
        if (!dur || dur < 1) { this._toast('Duración mínimo 1 min'); return; }
        if (precio < 0) { this._toast('Precio inválido'); return; }
        // Armar como un servicio normal pero con flag medida
        this._armed = {
          medida: true,
          servicio: {
            label: desc,
            setupUid: 'MEDIDA-armed-' + Date.now(),
            duration: dur,
            price: precio,
            group: 'medida',
            claseServicio: 'medida'
          }
        };
        this._closeBlankForm();
        this._renderArmedHint();
        this._renderCalendar();
        this._updateSteps();
        this._toast('Servicio a medida armado · click sobre columna+hora');
      });
    }

    // ═══════════════════════════════════════════════════
    // ARQUEO / CIERRE DE CAJA
    // ═══════════════════════════════════════════════════
    _openCaja(modo) {
      this._cajaModo = modo;          // 'arqueo' | 'cierre'
      this._cajaData = null;
      this._cajaContado = 0;
      this._cajaNota = '';
      const root = this.shadowRoot;
      root.getElementById('cajaScrim')?.remove();
      const scrim = document.createElement('div'); scrim.className = 'ks-modal-scrim'; scrim.id = 'cajaScrim';
      scrim.addEventListener('click', e => { if (e.target === scrim) this._closeCaja(); });
      const modal = document.createElement('div'); modal.className = 'ks-modal'; modal.id = 'cajaModal';
      modal.innerHTML = `
        <div class="ks-modal-head"><span class="ks-modal-staff">${modo === 'cierre' ? '📊 INFORME DEL DÍA' : '🏦 ARQUEO DE CAJA'}</span><span class="ks-modal-status pending" id="cajaStatus">…</span><button class="ks-modal-x" id="cajaX">✕</button></div>
        <div class="ks-modal-meta">${this._fecha}</div>
        <div id="cajaBody"><div class="ks-empty">Calculando efectivo esperado…</div></div>`;
      scrim.appendChild(modal); root.appendChild(scrim);
      modal.querySelector('#cajaX').addEventListener('click', () => this._closeCaja());
      this._sendToPage('caja-calcular', { fechaISO: this._fecha });
    }
    _closeCaja() { this.shadowRoot.getElementById('cajaScrim')?.remove(); this._cajaData = null; }
    _cajaRefresh() { if (this.shadowRoot.getElementById('cajaScrim')) this._sendToPage('caja-calcular', { fechaISO: this._fecha }); }

    _renderCajaBody() {
      const body = this.shadowRoot.getElementById('cajaBody');
      if (!body) return;
      const d = this._cajaData || {};
      if (d.error) { body.innerHTML = `<div class="ks-empty">Error: ${esc(d.error)}</div>`; return; }
      const cerrada = d.registro && d.registro.status === 'closed';
      const guardado = d.registro && d.registro.status === 'saved';
      const st = this.shadowRoot.getElementById('cajaStatus');
      if (st) { st.textContent = cerrada ? 'Cerrada' : (d.registro?.status === 'saved' ? 'Guardada' : 'Abierta'); st.className = 'ks-modal-status ' + (cerrada ? 'paid' : 'pending'); }

      const esperado = Number(d.esperado || 0);
      const contado = Number(this._cajaContado || 0);
      const dif = Math.round((contado - esperado) * 100) / 100;
      const movimientos = d.movimientos || [];

      body.innerHTML = `
        <div class="ks-modal-items">
          <div class="ks-modal-item"><span class="ks-item-label">Fondo inicial</span><span class="ks-item-price">${Number(d.fondoInicial || 0)}€</span></div>
          ${cerrada ? '' : `<div class="ks-disc-row" style="margin:2px 0 6px"><span class="ks-disc-lbl" style="font-size:11px;color:var(--ks-ink2)">Forzar fondo inicial</span><div class="ks-disc-input" style="display:flex;align-items:center;gap:6px"><input id="cajaFondo" type="number" min="0" step="0.01" value="" placeholder="${Number(d.fondoInicial || 0)}" style="width:72px;text-align:right;border:1px solid var(--ks-line);border-radius:6px;padding:3px 6px;font:inherit;color:var(--ks-ink)"><span>€</span><button id="cajaFondoSave" style="border:0;background:var(--ks-accent);color:#2a230f;border-radius:6px;padding:4px 9px;font-size:11px;font-weight:700;cursor:pointer">Forzar</button></div></div>`}
          <div class="ks-modal-item"><span class="ks-item-label">Cobros en efectivo</span><span class="ks-item-price">${Number(d.cobrosEfectivo || 0)}€</span></div>
          ${d.entradas ? `<div class="ks-modal-item"><span class="ks-item-label">+ Entradas manuales</span><span class="ks-item-price">${d.entradas}€</span></div>` : ''}
          ${d.salidas ? `<div class="ks-modal-item is-compl"><span class="ks-item-label">− Salidas</span><span class="ks-item-price">${d.salidas}€</span></div>` : ''}
          ${d.retiradas ? `<div class="ks-modal-item is-compl"><span class="ks-item-label">− Retiradas</span><span class="ks-item-price">${d.retiradas}€</span></div>` : ''}
        </div>
        <div class="ks-modal-total"><span>EFECTIVO ESPERADO</span><span class="ks-total-val">${esperado}€</span></div>
        ${d.sinEspecificar ? `<p class="ks-detail-note">⚠ Hay ${d.sinEspecificar}€ en cobros sin método asignado (no contados como efectivo).</p>` : ''}
        ${cerrada ? `<p class="ks-detail-note ks-detail-note-simple">Caja cerrada por ${esc(d.registro.closedBy || '—')}. Contado: ${Number(d.registro.countedCash || 0)}€ · Diferencia: ${Number(d.registro.difference || 0)}€</p>` : `
        <div class="ks-disc-row"><span class="ks-disc-lbl">💶 Efectivo contado</span><div class="ks-disc-input"><input id="cajaContado" type="number" min="0" value="${this._cajaContado || ''}" placeholder="0"><span>€</span></div></div>
        <div class="ks-modal-total" style="border-top:1px solid var(--ks-line2)"><span>DIFERENCIA</span><span class="ks-total-val" id="cajaDif" style="color:${dif === 0 ? 'var(--ks-ink)' : (dif > 0 ? 'oklch(0.5 0.14 150)' : 'oklch(0.55 0.18 25)')}">${dif > 0 ? '+' : ''}${dif}€</span></div>
        <label class="ks-field" style="margin-top:8px"><span>Nota (opcional)</span><input id="cajaNota" placeholder="Motivo de la diferencia, etc." value="${esc(this._cajaNota || '')}"></label>
        <div class="ks-modal-adds" style="grid-template-columns:1fr 1fr 1fr">
          <button class="ks-add" id="movEntry">＋ Entrada</button>
          <button class="ks-add" id="movExit">− Salida</button>
          <button class="ks-add" id="movWithdraw">↑ Retirada</button>
        </div>
        <div class="ks-modal-pays" style="margin-top:10px">
          <button class="ks-pay pay-tarjeta" id="cajaGuardar" style="flex:1">Guardar arqueo</button>
          ${this._cajaModo === 'cierre' ? `<button class="ks-pay pay-efectivo" id="cajaCerrar" style="flex:1">🔒 Cerrar día</button>` : ''}
        </div>
        ${guardado ? `<div style="text-align:center;margin-top:8px;font-size:12px;font-weight:800;color:oklch(0.5 0.14 150)">✓ Arqueo guardado${d.registro && d.registro.difference != null ? ` · dif ${Number(d.registro.difference)}€` : ''}</div>` : ''}`}
        ${movimientos.length ? `<div class="ks-modal-items" style="border-top:1px solid var(--ks-line2);margin-top:8px"><div class="ks-eyebrow" style="padding:6px 0">Movimientos del día</div>${movimientos.map(m => `<div class="ks-modal-item"><span class="ks-item-label">${esc(this._movLabel(m.movementType))} · ${esc(m.description || '')}</span><span class="ks-item-price">${Number(m.amount || 0)}€</span></div>`).join('')}</div>` : ''}
        <div class="ks-modal-foot"><span></span><button class="ks-modal-close" id="cajaClose">Cerrar</button></div>`;

      body.querySelector('#cajaClose')?.addEventListener('click', () => this._closeCaja());
      if (!cerrada) {
        const inp = body.querySelector('#cajaContado');
        inp?.addEventListener('input', e => {
          this._cajaContado = parseFloat(e.target.value) || 0;
          const nd = Math.round((this._cajaContado - esperado) * 100) / 100;
          const el = body.querySelector('#cajaDif');
          if (el) { el.textContent = (nd > 0 ? '+' : '') + nd + '€'; el.style.color = nd === 0 ? 'var(--ks-ink)' : (nd > 0 ? 'oklch(0.5 0.14 150)' : 'oklch(0.55 0.18 25)'); }
        });
        body.querySelector('#cajaNota')?.addEventListener('input', e => { this._cajaNota = e.target.value; });
        body.querySelector('#movEntry')?.addEventListener('click', () => this._cajaMovimiento('entry'));
        body.querySelector('#movExit')?.addEventListener('click', () => this._cajaMovimiento('exit'));
        body.querySelector('#movWithdraw')?.addEventListener('click', () => this._cajaMovimiento('withdrawal'));
        // v1.1.73 — Forzar fondo inicial: sobrescribe openingBalance del día.
        // Con el campo vacío no hace nada (evita forzar 0 por accidente).
        body.querySelector('#cajaFondoSave')?.addEventListener('click', () => {
          const raw = body.querySelector('#cajaFondo')?.value;
          if (raw === '' || raw == null) { this._toast('Escribe un importe para forzar el fondo'); return; }
          const v = parseFloat(raw) || 0;
          this._sendToPage('caja-set-fondo', { fechaISO: this._fecha, openingBalance: v });
        });
        body.querySelector('#cajaGuardar')?.addEventListener('click', () => {
          this._sendToPage('caja-guardar', { fechaISO: this._fecha, countedCash: this._cajaContado, differenceNote: this._cajaNota, countBreakdown: '', closedBy: '' });
        });
        body.querySelector('#cajaCerrar')?.addEventListener('click', () => {
          if (confirm('¿Cerrar la caja del día? No podrás modificarla después.')) this._sendToPage('caja-cerrar', { fechaISO: this._fecha, countedCash: this._cajaContado, differenceNote: this._cajaNota, closedBy: '' });
        });
      }
    }
    _movLabel(t) { return ({ entry: 'Entrada', exit: 'Salida', withdrawal: 'Retirada', tip: 'Propina', minor_purchase: 'Compra menor', regularization: 'Regularización' })[t] || t; }
    _cajaMovimiento(tipo) {
      const amount = parseFloat(prompt(`Importe de ${this._movLabel(tipo).toLowerCase()} (€):`) || '0');
      if (!amount || amount <= 0) return;
      const description = prompt('Descripción:') || '';
      this._sendToPage('caja-movimiento', { fechaISO: this._fecha, movementType: tipo, amount, description, recordedBy: '', registerId: this._cajaData?.registroId || '' });
    }

    // ═══════════════════════════════════════════════════
    // v1.1.8 — STAFF CONFIG (visible/posición/color desde settings)
    // ═══════════════════════════════════════════════════
    _initStaffConfig() {
      const cfg = this._settings.staffConfig || {};
      let pos = 1;
      for (const s of this._staff) {
        if (!cfg[s.wixResourceId]) {
          cfg[s.wixResourceId] = { visible: true, color: s.color || STAFF_COLORS[(pos - 1) % STAFF_COLORS.length], position: pos };
        } else if (!cfg[s.wixResourceId].color) {
          cfg[s.wixResourceId].color = s.color || STAFF_COLORS[(pos - 1) % STAFF_COLORS.length];
        }
        pos++;
      }
      this._settings.staffConfig = cfg;
    }
    _getVisibleStaff() {
      const cfg = this._settings.staffConfig || {};
      return (this._staff || []).filter(s => cfg[s.wixResourceId]?.visible !== false)
        .sort((a, b) => (cfg[a.wixResourceId]?.position || 99) - (cfg[b.wixResourceId]?.position || 99));
    }
    _staffColor(wixResourceId) {
      return this._settings.staffConfig?.[wixResourceId]?.color
        || (this._staff.find(s => s.wixResourceId === wixResourceId) || {}).color
        || '#6b7280';
    }
    _staffName(wixResourceId) {
      const s = (this._staff || []).find(x => x.wixResourceId === wixResourceId);
      return s?.displayName || s?.canonicalName || '';
    }

    // ═══════════════════════════════════════════════════
    // v1.1.8 — DATEPICKER (V1 literal)
    // ═══════════════════════════════════════════════════
    _openDatePicker() {
      const [y, m] = this._fecha.split('-').map(Number);
      this._dpYear = y;
      this._dpMonth = m;
      this._renderDatePicker();
      this.shadowRoot.getElementById('dpPopover').classList.add('open');
    }
    _closeDatePicker() {
      const dp = this.shadowRoot.getElementById('dpPopover');
      if (dp) dp.classList.remove('open');
    }
    _renderDatePicker() {
      const root = this.shadowRoot;
      root.getElementById('dpMonth').textContent = `${MONTHS_FULL[this._dpMonth - 1]} ${this._dpYear}`;
      const todayStr = todayISO(), selStr = this._fecha;
      const fd = new Date(this._dpYear, this._dpMonth - 1, 1);
      let sd = fd.getDay(); sd = sd === 0 ? 6 : sd - 1;
      const dim = new Date(this._dpYear, this._dpMonth, 0).getDate();
      const dipm = new Date(this._dpYear, this._dpMonth - 1, 0).getDate();
      let html = '';
      for (let i = sd - 1; i >= 0; i--) {
        const d = dipm - i;
        const pm = this._dpMonth === 1 ? 12 : this._dpMonth - 1;
        const py = this._dpMonth === 1 ? this._dpYear - 1 : this._dpYear;
        html += `<div class="dp-day other" data-date="${py}-${String(pm).padStart(2, '0')}-${String(d).padStart(2, '0')}">${d}</div>`;
      }
      for (let d = 1; d <= dim; d++) {
        const iso = `${this._dpYear}-${String(this._dpMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        let cls = 'dp-day';
        if (iso === todayStr) cls += ' today';
        if (iso === selStr) cls += ' selected';
        html += `<div class="${cls}" data-date="${iso}">${d}</div>`;
      }
      const tc = sd + dim;
      const rem = tc % 7 === 0 ? 0 : 7 - (tc % 7);
      for (let d = 1; d <= rem; d++) {
        const nm = this._dpMonth === 12 ? 1 : this._dpMonth + 1;
        const ny = this._dpMonth === 12 ? this._dpYear + 1 : this._dpYear;
        html += `<div class="dp-day other" data-date="${ny}-${String(nm).padStart(2, '0')}-${String(d).padStart(2, '0')}">${d}</div>`;
      }
      const container = root.getElementById('dpDays');
      container.innerHTML = html;
      container.querySelectorAll('.dp-day').forEach(el => el.addEventListener('click', () => {
        if (el.dataset.date) { this._setFecha(el.dataset.date); this._closeDatePicker(); }
      }));
    }

    // ═══════════════════════════════════════════════════
    // v1.1.8 — SETTINGS (V1 literal, persistido en CalendarViewSettings)
    // ═══════════════════════════════════════════════════
    _openSettings() {
      this._applySettingsUI();
      this.shadowRoot.getElementById('settingsOverlay').classList.add('open');
      this.shadowRoot.getElementById('settingsPanel').classList.add('open');
      this._renderStaffSettings();
    }
    _closeSettings() {
      this.shadowRoot.getElementById('settingsOverlay').classList.remove('open');
      this.shadowRoot.getElementById('settingsPanel').classList.remove('open');
      this._closeColorPicker();
    }
    _applySettingsUI() {
      const R = this.shadowRoot;
      const sl = R.getElementById('sliderSpacing'); if (sl) sl.value = this._settings.rowHeight || 56;
      const tr = R.querySelector(`input[name="titleMode"][value="${this._settings.titleMode || 'servicio'}"]`); if (tr) tr.checked = true;
      const ir = R.querySelector(`input[name="interval"][value="${this._settings.interval || 30}"]`); if (ir) ir.checked = true;
    }
    _renderStaffSettings() {
      const list = this.shadowRoot.getElementById('staffConfigList');
      if (!list) return;
      const cfg = this._settings.staffConfig || {};
      const sorted = [...(this._staff || [])].sort((a, b) => (cfg[a.wixResourceId]?.position || 99) - (cfg[b.wixResourceId]?.position || 99));
      list.innerHTML = sorted.map(s => {
        const c = cfg[s.wixResourceId] || {};
        return `<div class="staff-config-row">
          <input type="checkbox" class="staff-check" data-id="${s.wixResourceId}" ${c.visible !== false ? 'checked' : ''}>
          <span class="staff-name-label">${esc(s.displayName || s.name || '')}</span>
          <button class="staff-color-btn" data-id="${s.wixResourceId}" style="background:${c.color || '#6b7280'}"></button>
          <input type="number" class="staff-pos-input" data-id="${s.wixResourceId}" value="${c.position || 1}" min="1" max="20">
        </div>`;
      }).join('');
      list.querySelectorAll('.staff-check').forEach(cb => cb.addEventListener('change', e => {
        this._settings.staffConfig[e.target.dataset.id].visible = e.target.checked;
        this._saveSettings(); this._renderCalendar(); this._updateStats();
      }));
      list.querySelectorAll('.staff-pos-input').forEach(inp => inp.addEventListener('change', e => {
        this._settings.staffConfig[e.target.dataset.id].position = parseInt(e.target.value) || 1;
        this._saveSettings(); this._renderCalendar();
      }));
      list.querySelectorAll('.staff-color-btn').forEach(btn => btn.addEventListener('click', e => {
        e.stopPropagation(); this._openColorPicker(btn, btn.dataset.id);
      }));
    }
    _saveSettings() {
      clearTimeout(this._saveSettingsTimer);
      this._saveSettingsTimer = setTimeout(() => this._sendToPage('save-settings', { settings: this._settings }), 800);
    }

    // ═══════════════════════════════════════════════════
    // v1.1.8 — COLOR PICKER (V1 literal)
    // ═══════════════════════════════════════════════════
    _initColorPicker() {
      const g = this.shadowRoot.getElementById('colorGrid');
      if (!g) return;
      g.innerHTML = PALETTE.map(c => `<div class="color-swatch" style="background:${c}" data-color="${c}"></div>`).join('');
      g.addEventListener('click', e => {
        const s = e.target.closest('.color-swatch');
        if (!s || !this._activeColorStaffId) return;
        this._settings.staffConfig[this._activeColorStaffId].color = s.dataset.color;
        this._saveSettings();
        this._renderStaffSettings();
        this._renderCalendar();
        this._closeColorPicker();
      });
    }
    _openColorPicker(anchor, staffId) {
      this._activeColorStaffId = staffId;
      const p = this.shadowRoot.getElementById('colorPicker');
      const r = anchor.getBoundingClientRect();
      p.style.top = `${r.bottom + 4}px`;
      p.style.left = `${Math.max(8, r.left - 100)}px`;
      p.classList.add('open');
      p.querySelectorAll('.color-swatch').forEach(s => s.classList.toggle('active', s.dataset.color === this._settings.staffConfig[staffId]?.color));
    }
    _closeColorPicker() {
      const p = this.shadowRoot.getElementById('colorPicker');
      if (p) p.classList.remove('open');
      this._activeColorStaffId = null;
    }

    // ═══════════════════════════════════════════════════
    // v1.1.8 — CIERRE DEL DÍA (panel inferior, no destructivo)
    // ═══════════════════════════════════════════════════
    _toggleCierre() {
      const cp = this.shadowRoot.getElementById('cierrePanel');
      if (cp.classList.contains('visible')) { this._closeCierre(); return; }
      this._cierreLoading = true;
      this._cierreData = null;
      cp.classList.add('visible');
      const grid = this.shadowRoot.getElementById('cierreGrid');
      grid.innerHTML = `<div class="cierre-section" style="text-align:center;padding:20px;color:#9ca3af;">Cargando datos del día…</div>`;
      this._sendToPage('cierre-dia', { fechaISO: this._fecha });
    }
    _closeCierre() {
      const cp = this.shadowRoot.getElementById('cierrePanel');
      if (cp) cp.classList.remove('visible');
    }
    // v1.1.22 — Recargar informe sin cerrar el panel
    _recargarCierre() {
      const btn = this.shadowRoot.getElementById('btnRecargarCierre');
      if (btn) btn.classList.add('spinning');
      this._cierreLoading = true;
      this._cierreData = null;
      this._cierreFecha = null;
      const grid = this.shadowRoot.getElementById('cierreGrid');
      if (grid) grid.innerHTML = `<div class="cierre-section" style="text-align:center;padding:20px;color:#9ca3af;">Recargando datos del día…</div>`;
      this._sendToPage('cierre-dia', { fechaISO: this._fecha });
    }
    _renderCierre() {
      const grid = this.shadowRoot.getElementById('cierreGrid');
      if (!grid) return;
      const d = this._cierreData || {};
      if (d.error) { grid.innerHTML = `<div class="cierre-section" style="color:#d93636;padding:14px;">Error: ${esc(d.error)}</div>`; return; }

      // v1.1.21 — Si el backend NO devuelve los nuevos bloques, mostrar aviso.
      const extendido = d.extendido || {};
      const rendimiento = extendido.rendimiento || null;
      const cierre = extendido.cierre || null;
      const reconciliacion = extendido.reconciliacion || null;
      const arq = d.arqueo || null;

      if (!rendimiento || !cierre) {
        grid.innerHTML = `<div class="cierre-section" style="padding:14px;color:#a55b00;background:#fff7e6;border:1px solid #f0c97e;border-radius:8px;">⚠️ Backend del informe desactualizado. Despliega <b>cierreLogicExtendido v1.1.0</b> para ver el informe partido en 2 bloques.</div>`;
        return;
      }

      let h = '';

      // ═══════════════════════════════════════════════════
      // BLOQUE 1 — RENDIMIENTO PRODUCTIVO
      // ═══════════════════════════════════════════════════
      h += `<div class="cierre-block cierre-block-rend">`;
      h += `<div class="cierre-block-title"><span class="cierre-block-emoji">📈</span> Rendimiento productivo<span class="cierre-block-sub">trabajo del día — filtra por fecha de cita</span><button id="btnCopiarRend" class="cierre-copybtn" title="Copiar rendimiento productivo">📋 COPIAR</button></div>`;

      // Header cobrado/pendiente/total
      h += `<div class="cierre-headergrid">
        <div class="cierre-headercard ok"><div class="cierre-headercard-label">COBRADO</div><div class="cierre-headercard-val">${eur(rendimiento.cobrado)}</div><div class="cierre-headercard-sub">${rendimiento.clientesCobrados} clientes</div></div>
        <div class="cierre-headercard pdte"><div class="cierre-headercard-label">PENDIENTE</div><div class="cierre-headercard-val">${eur(rendimiento.pendiente)}</div><div class="cierre-headercard-sub">${rendimiento.clientesPendientes} clientes</div></div>
      </div>`;
      h += `<div class="cierre-headertotal"><div class="cierre-headertotal-label">TOTAL DEL DÍA</div><div class="cierre-headertotal-val">${eur(rendimiento.total)}</div><div class="cierre-headertotal-sub">${rendimiento.clientesTotal} clientes</div></div>`;

      // Servicios del día
      if (rendimiento.servicios?.length) {
        h += `<div class="cierre-section"><div class="cierre-section-title">✂️ Servicios del día</div>`;
        for (const s of rendimiento.servicios) {
          const subtitle = s.cantidad > 1 ? ` <span style="color:#9ca3af;font-size:10px;">${eur(s.total / s.cantidad)} ×${s.cantidad} =</span>` : '';
          h += `<div class="cierre-row"><span class="cierre-nombre">${esc(s.nombre)}${subtitle}</span><span class="cierre-importe">${eur(s.total)}</span></div>`;
        }
        h += `</div>`;
      }

      // Clientes del día
      if (rendimiento.clientes?.length) {
        h += `<div class="cierre-section" style="margin-top:12px;"><div class="cierre-section-title">👥 Clientes del día (${rendimiento.clientes.length})</div>`;
        for (const c of rendimiento.clientes) {
          const svcs = (c.servicios || []).map(s => esc(s.nombre)).filter(Boolean).join(' · ');
          const badge = c.status === 'PAGADO'
            ? '<span style="color:#15803d;font-size:9px;font-weight:700;letter-spacing:.5px;background:rgba(21,128,61,.12);padding:1px 5px;border-radius:4px;margin-left:6px;">PAGADO</span>'
            : '<span style="color:#a55b00;font-size:9px;font-weight:700;letter-spacing:.5px;background:rgba(165,91,0,.12);padding:1px 5px;border-radius:4px;margin-left:6px;">PDTE</span>';
          // v1.1.27 — si hay descuento, mostrar bruto tachado + neto
          const hayDesc = c.descLabel && c.bruto && c.bruto > c.total;
          const importeHTML = hayDesc
            ? `<span style="color:#9ca3af;text-decoration:line-through;font-size:10.5px;margin-right:4px;">${eur(c.bruto)}</span><span style="color:#d48a1a;font-size:10px;font-weight:700;margin-right:4px;">${esc(c.descLabel)}</span>${eur(c.total)}`
            : `${eur(c.total)}`;
          h += `<div class="cierre-row"><span class="cierre-nombre"><b>${esc(c.hora || '')}</b> · <b>${esc(c.nombre)}</b>${svcs ? ' — ' + svcs : ''}${badge}</span><span class="cierre-importe">${importeHTML}</span></div>`;
        }
        h += `</div>`;
      }

      // Descuentos aplicados
      if (rendimiento.descuentos?.length) {
        h += `<div class="cierre-section" style="margin-top:12px;"><div class="cierre-section-title">🏷️ Descuentos aplicados</div>`;
        for (const desc of rendimiento.descuentos) {
          const tag = desc.labelDesc ? ` <span style="color:#d48a1a;font-size:10px;font-weight:700;">${esc(desc.labelDesc)}</span>` : '';
          h += `<div class="cierre-row"><span class="cierre-nombre">${esc(desc.label)} · ${esc(desc.cliente)}${tag}</span><span class="cierre-importe" style="color:#d93636;">-${eur(desc.importe)}</span></div>`;
        }
        h += `<div class="cierre-row" style="border-top:1px solid #e2e5ea;margin-top:4px;padding-top:6px;"><span class="cierre-nombre" style="font-weight:700;">Total descuentos</span><span class="cierre-importe" style="color:#d93636;font-weight:700;">-${eur(rendimiento.descuentoTotal)}</span></div>`;
        h += `</div>`;
      }

      // Productividad por staff (rendimiento)
      if (rendimiento.staff?.length) {
        h += `<div class="cierre-section" style="margin-top:12px;"><div class="cierre-section-title">💼 Productividad por staff</div>`;
        for (const s of rendimiento.staff) {
          const ext = s.isExternal ? ` <span style="color:#a78bfa;font-size:9px;font-weight:700;background:rgba(167,139,250,.12);padding:1px 5px;border-radius:4px;">EXT</span>` : '';
          h += `<div class="cierre-row"><span class="cierre-nombre"><b>${esc(s.staffName)}</b>${ext} <span style="color:#9ca3af;font-size:10px;">${s.citas} citas</span></span><span class="cierre-importe"><span style="color:#15803d;">${eur(s.cobrado)}</span>${s.pendiente > 0 ? ` <span style="color:#a55b00;font-size:11px;">+${eur(s.pendiente)} pdte</span>` : ''}</span></div>`;
        }
        h += `</div>`;
      }

      // Productos vendidos (rendimiento)
      if (rendimiento.productos?.length) {
        h += `<div class="cierre-section" style="margin-top:12px;"><div class="cierre-section-title">🛒 Productos vendidos</div>`;
        for (const p of rendimiento.productos) {
          const sub = p.cantidad > 1 ? ` <span style="color:#9ca3af;font-size:10px;">×${p.cantidad}</span>` : '';
          h += `<div class="cierre-row"><span class="cierre-nombre">${esc(p.nombre)}${sub}</span><span class="cierre-importe">${eur(p.total)}</span></div>`;
        }
        h += `</div>`;
      }

      // Externos (bruto)
      if (rendimiento.externos?.length) {
        h += `<div class="cierre-section" style="margin-top:12px;"><div class="cierre-section-title">🔗 Servicios externos (bruto)</div>`;
        for (const e of rendimiento.externos) {
          const badge = e.status === 'PAGADO' ? '✓' : '€';
          h += `<div class="cierre-row"><span class="cierre-nombre">${badge} ${esc(e.cliente)} · ${esc(e.servicio)} <span style="color:#9ca3af;font-size:10px;">${esc(e.staffName)}</span></span><span class="cierre-importe">${eur(e.importe)}</span></div>`;
        }
        h += `<div class="cierre-row" style="border-top:1px solid #e2e5ea;margin-top:4px;padding-top:6px;"><span class="cierre-nombre" style="font-weight:700;">Bruto externos</span><span class="cierre-importe" style="font-weight:700;">${eur(rendimiento.externosTotal)}</span></div>`;
        h += `</div>`;
      }

      h += `</div>`;  // /cierre-block-rend

      // v1.1.28 — Banner Reconciliación ELIMINADO del render por petición.
      // El backend lo sigue calculando y devolviendo en `extendido.reconciliacion`
      // por si se quiere auditar, pero el widget no lo pinta para mantener
      // limpio el layout de 2 columnas (Rendimiento izquierda, Cierre derecha).

      // ═══════════════════════════════════════════════════
      // BLOQUE 2 — CIERRE FINANCIERO
      // ═══════════════════════════════════════════════════
      h += `<div class="cierre-block cierre-block-fin">`;
      h += `<div class="cierre-block-title"><span class="cierre-block-emoji">💰</span> Cierre financiero<span class="cierre-block-sub">dinero entrado en caja — filtra por fecha de pago</span><button id="btnCopiarFin" class="cierre-copybtn" title="Copiar cierre financiero">📋 COPIAR</button></div>`;

      h += `<div class="cierre-headergrid">
        <div class="cierre-headercard ok" style="grid-column:span 2;"><div class="cierre-headercard-label">TOTAL COBRADO REAL</div><div class="cierre-headercard-val">${eur(cierre.totalReal)}</div><div class="cierre-headercard-sub">${cierre.transacciones} transacciones</div></div>
      </div>`;

      // Métodos de pago
      if (cierre.porMetodo?.length) {
        h += `<div class="cierre-section"><div class="cierre-section-title">💳 Cobrado por método de pago</div>`;
        const metodoCol = { Efectivo: '#2a9d54', Tarjeta: '#2f6fd9', Bizum: '#a78bfa', Mixto: '#c9a44a' };
        for (const m of cierre.porMetodo) {
          const col = metodoCol[m.metodo] || '#9ca3af';
          h += `<div class="cierre-row"><span class="cierre-nombre"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${col};margin-right:6px;"></span>${esc(m.metodo)}</span><span class="cierre-importe">${eur(m.importe)}</span></div>`;
        }
        h += `</div>`;
      }

      // v1.1.27 — Descuentos aplicados en el Cierre Financiero
      if (cierre.descuentos?.length) {
        h += `<div class="cierre-section" style="margin-top:12px;"><div class="cierre-section-title">🏷️ Descuentos aplicados</div>`;
        for (const desc of cierre.descuentos) {
          const tag = desc.labelDesc ? ` <span style="color:#d48a1a;font-size:10px;font-weight:700;">${esc(desc.labelDesc)}</span>` : '';
          h += `<div class="cierre-row"><span class="cierre-nombre">${esc(desc.cliente || 'Sin cliente')}${tag}</span><span class="cierre-importe" style="color:#d93636;">-${eur(desc.importe)}</span></div>`;
        }
        h += `<div class="cierre-row" style="border-top:1px solid #e2e5ea;margin-top:4px;padding-top:6px;"><span class="cierre-nombre" style="font-weight:700;">Total descuentos</span><span class="cierre-importe" style="color:#d93636;font-weight:700;">-${eur(cierre.descuentoTotal || 0)}</span></div>`;
        h += `</div>`;
      }

      // Desglose fiscal
      if (cierre.iva) {
        const iva = cierre.iva;
        h += `<div class="cierre-section" style="margin-top:12px;"><div class="cierre-section-title">📄 Desglose fiscal (IVA ${iva.vatRate}%)</div>`;
        h += `<div class="cierre-row"><span class="cierre-nombre">Total cobrado (IVA incluido)</span><span class="cierre-importe">${eur(iva.totalSinPropinas)}</span></div>`;
        if (iva.totalPropinas > 0) h += `<div class="cierre-row"><span class="cierre-nombre" style="color:#9ca3af;font-size:11px;">(propinas excluidas: ${eur(iva.totalPropinas)})</span><span></span></div>`;
        h += `<div class="cierre-row"><span class="cierre-nombre" style="font-weight:700;">Base imponible</span><span class="cierre-importe">${eur(iva.baseImponible)}</span></div>`;
        h += `<div class="cierre-row"><span class="cierre-nombre" style="color:#5b21b6;font-weight:700;">Cuota IVA (${iva.vatRate}%)</span><span class="cierre-importe" style="color:#5b21b6;">${eur(iva.cuotaIVA)}</span></div>`;
        h += `</div>`;
      }

      // Productividad staff financiera
      if (cierre.staff?.length) {
        h += `<div class="cierre-section" style="margin-top:12px;"><div class="cierre-section-title">💼 Cobrado por staff</div>`;
        for (const s of cierre.staff) {
          const ext = s.isExternal ? ` <span style="color:#a78bfa;font-size:9px;font-weight:700;background:rgba(167,139,250,.12);padding:1px 5px;border-radius:4px;">EXT</span>` : '';
          h += `<div class="cierre-row"><span class="cierre-nombre"><b>${esc(s.staffName)}</b>${ext} <span style="color:#9ca3af;font-size:10px;">${s.citas} cobros</span></span><span class="cierre-importe">${eur(s.cobrado)}</span></div>`;
        }
        h += `</div>`;
      }

      // Productos
      if (cierre.productos?.length) {
        h += `<div class="cierre-section" style="margin-top:12px;"><div class="cierre-section-title">🛒 Productos cobrados hoy</div>`;
        for (const p of cierre.productos) {
          const sub = p.cantidad > 1 ? ` <span style="color:#9ca3af;font-size:10px;">×${p.cantidad}</span>` : '';
          h += `<div class="cierre-row"><span class="cierre-nombre">${esc(p.nombre)}${sub}</span><span class="cierre-importe">${eur(p.total)}</span></div>`;
        }
        h += `</div>`;
      }

      // v1.1.80 — Especiales vendidos hoy (Bono 🎟️ / PRIME ⭐ / Tarjeta 🎁).
      // Requiere backend cierreLogicExtendido v1.1.5+. Si no está desplegado,
      // cierre.especiales llega undefined y la sección no se pinta.
      if (cierre.especiales?.length) {
        h += `<div class="cierre-section" style="margin-top:12px;"><div class="cierre-section-title">🎟️ Especiales vendidos hoy</div>`;
        for (const e of cierre.especiales) {
          const quien = e.cliente ? ` · <b>${esc(e.cliente)}</b>` : '';
          const met = e.metodo ? ` <span style="color:#9ca3af;font-size:10px;">${esc(e.metodo)}</span>` : '';
          h += `<div class="cierre-row"><span class="cierre-nombre">${esc(e.concepto)}${quien}${met}</span><span class="cierre-importe">${eur(e.importe)}</span></div>`;
        }
        h += `<div class="cierre-row" style="border-top:1px solid #e2e5ea;margin-top:4px;padding-top:6px;"><span class="cierre-nombre" style="font-weight:700;">Total especiales</span><span class="cierre-importe" style="font-weight:700;">${eur(cierre.especialesTotal || 0)}</span></div>`;
        h += `</div>`;
      }

      // Comisiones externos
      if (cierre.externos?.length) {
        h += `<div class="cierre-section" style="margin-top:12px;"><div class="cierre-section-title">🔗 Comisiones externos</div>`;
        for (const e of cierre.externos) {
          h += `<div class="cierre-row"><span class="cierre-nombre">${esc(e.cliente)} <span style="color:#9ca3af;font-size:10px;">${esc(e.staffName)} · ${e.pct}%</span></span><span class="cierre-importe">${eur(e.comision)}</span></div>`;
        }
        h += `<div class="cierre-row" style="border-top:1px solid #e2e5ea;margin-top:4px;padding-top:6px;"><span class="cierre-nombre" style="font-weight:700;">Total comisiones</span><span class="cierre-importe" style="font-weight:700;">${eur(cierre.externosComisionTotal)}</span></div>`;
        h += `</div>`;
      }

      // v1.1.61 — Servicios externos V2 (desde PagoreservasExternos vía
      // cierreExternosLogic). Aditivo: no toca la sección previa
      // "Comisiones externos". Solo se pinta si hay cobros externos.
      const extV2 = d.externosV2 || null;
      if (extV2 && extV2.citas > 0) {
        const staffExt = (this._staff || []).find(s => s.isExternal);
        const colExt = staffExt ? this._staffColor(staffExt.wixResourceId) : '';
        const cStyle = colExt ? ` style="color:${colExt};"` : '';
        h += `<div class="cierre-section" style="margin-top:12px;"><div class="cierre-section-title"${cStyle}>Servicios externos</div>`;
        for (const it of (extV2.desglose || [])) {
          if (it.count && it.count > 1) {
            const unit = it.count > 0 ? Math.round((it.ventaBruta / it.count) * 100) / 100 : 0;
            h += `<div class="cierre-row"><span class="cierre-nombre">${esc(it.nombre)}</span><span style="color:#9ca3af;font-size:10px;margin:0 8px;">${eur(unit)} ×${it.count} =</span><span class="cierre-importe">${eur(it.ventaBruta)}</span></div>`;
          } else {
            h += `<div class="cierre-row"><span class="cierre-nombre">${esc(it.nombre)}</span><span class="cierre-importe">${eur(it.ventaBruta)}</span></div>`;
          }
        }
        h += `<div class="cierre-row" style="border-top:1px solid #e2e5ea;margin-top:4px;padding-top:6px;"><span class="cierre-nombre" style="font-weight:700;">Venta bruta externa</span><span class="cierre-importe">${eur(extV2.ventaBruta)}</span></div>`;
        h += `<div class="cierre-row"><span class="cierre-nombre" style="font-weight:700;"${cStyle}>Comisión del salón</span><span class="cierre-importe"${cStyle}>${eur(extV2.comisionTotal)}</span></div>`;
        h += `</div>`;
      }

      // Arqueo
      if (arq) {
        const statusTag = arq.status === 'closed' ? ' <span style="color:#2a9d54;font-size:10px;">[CERRADA]</span>' : arq.status === 'saved' ? ' <span style="color:#d48a1a;font-size:10px;">[guardada]</span>' : '';
        const fi = arq.fondoInicial || 0, ce = arq.cobrosEfectivo || 0, ent = arq.entradas || 0, sal = arq.salidas || 0, ret = arq.retiradas || 0, e = arq.esperado || 0, contado = arq.contado || 0, nota = arq.nota || '', hasArqueo = !!arq.status, sinEsp = arq.sinEspecificar || 0;
        h += `<div class="cierre-section" style="margin-top:12px;border-top:2px solid #c9a44a;padding-top:12px;">`;
        h += `<div class="cierre-section-title" style="font-size:13px;">🏦 Arqueo de efectivo${statusTag}</div>`;
        h += `<div class="cierre-row"><span class="cierre-nombre">Fondo inicial</span><span class="cierre-importe">${eur(fi)}</span></div>`;
        h += `<div class="cierre-row"><span class="cierre-nombre">Cobros en efectivo</span><span class="cierre-importe" style="color:#2a9d54;">+${eur(ce)}</span></div>`;
        if (ent) h += `<div class="cierre-row"><span class="cierre-nombre">Entradas manuales</span><span class="cierre-importe" style="color:#2a9d54;">+${eur(ent)}</span></div>`;
        if (sal) h += `<div class="cierre-row"><span class="cierre-nombre">Salidas manuales</span><span class="cierre-importe" style="color:#d93636;">-${eur(sal)}</span></div>`;
        if (ret) h += `<div class="cierre-row"><span class="cierre-nombre">Retiradas</span><span class="cierre-importe" style="color:#d93636;">-${eur(ret)}</span></div>`;
        h += `<div class="cierre-row" style="border-top:1px solid #e2e5ea;padding-top:6px;margin-top:4px;"><span class="cierre-nombre" style="font-weight:700;">Efectivo esperado</span><span class="cierre-importe" style="font-weight:700;">${eur(e)}</span></div>`;
        if (hasArqueo) {
          h += `<div class="cierre-row"><span class="cierre-nombre">Efectivo contado</span><span class="cierre-importe">${eur(contado)}</span></div>`;
          const dif = Math.round((contado - e) * 100) / 100;
          const cuadra = Math.abs(dif) < 0.01;
          h += `<div class="cierre-row"><span class="cierre-nombre" style="color:${cuadra ? '#2a9d54' : '#d93636'};font-weight:700;">${cuadra ? '✅ Caja cuadrada' : '⚠️ Diferencia'}</span><span class="cierre-importe" style="color:${cuadra ? '#2a9d54' : '#d93636'};">${dif >= 0 ? '+' : ''}${eur(dif)}</span></div>`;
          if (nota) h += `<div class="cierre-row" style="margin-top:4px;"><span class="cierre-nombre" style="color:#9ca3af;font-size:11px;font-style:italic;">"${esc(nota)}"</span></div>`;
        } else {
          h += `<div class="cierre-row" style="margin-top:4px;"><span class="cierre-nombre" style="color:#9ca3af;font-size:11px;font-style:italic;">Arqueo no realizado — pulsa 🏦 para contar</span></div>`;
        }
        if (sinEsp > 0) h += `<div class="cierre-row" style="margin-top:4px;"><span class="cierre-nombre" style="color:#d48a1a;font-size:10px;">⚠️ ${eur(sinEsp)} cobrados sin método asignado (no cuentan como efectivo)</span></div>`;
        h += `</div>`;
      }

      h += `</div>`;  // /cierre-block-fin

      grid.innerHTML = h || `<div class="cierre-section" style="text-align:center;padding:20px;color:#9ca3af;">Sin datos para hoy.</div>`;

      // v1.1.63 — cablear botones COPIAR de cada bloque (se recrean en cada
      // render del informe, por eso el binding va aquí tras pintar el grid).
      const bR = grid.querySelector('#btnCopiarRend');
      if (bR) bR.addEventListener('click', () => {
        const t = this._cierreBloqueATexto('rend');
        if (t) this._copyText(t, 'Rendimiento productivo copiado'); else this._toast('Sin datos para copiar');
      });
      const bF = grid.querySelector('#btnCopiarFin');
      if (bF) bF.addEventListener('click', () => {
        const t = this._cierreBloqueATexto('fin');
        if (t) this._copyText(t, 'Cierre financiero copiado'); else this._toast('Sin datos para copiar');
      });
    }

    // ═══════════════════════════════════════════════════
    // v1.1.45 — CAPA DE ACCESO / LOGIN POR PIN (Shadow DOM)
    //   El login vive DENTRO del Custom Element para poder tapar las citas
    //   (.ks-appt), que comparten Shadow DOM. Usa .ks-login-scrim (z-index
    //   200). Identidad por PIN (mismo del módulo Control Horario). Timeout
    //   de inactividad 60s con actividad REAL (click/keydown/pointermove en
    //   el Shadow DOM). El backend NO se toca: el page code hace de puente.
    // ═══════════════════════════════════════════════════
    _mostrarLogin() {
      this._loginVisible = true;
      this._loginSel = null;
      this._loginPin = '';
      this._empleadoActivo = null;
      this._clearInactivity();
      this._renderLogin();
      // Pedir las tarjetas de empleado al page code (responde 'staffLogin').
      this._sendToPage('staffLogin', {});
    }

    _ocultarLogin() {
      this._loginVisible = false;
      this.shadowRoot.getElementById('loginScrim')?.remove();
    }

    // Avatar: foto si la hay, si no inicial sobre color del aro.
    _loginAvatarStyle(s) {
      const aro = s.color || s.staffColor || 'var(--ks-accent)';
      const foto = s.profileImage || s.staffPhoto || '';
      if (foto) return `--aro:${aro};background-image:url('${esc(foto)}')`;
      // color de relleno derivado del aro (tono apagado), inicial encima
      return `--aro:${aro};background:${aro}`;
    }
    _loginInicial(nombre) {
      const n = String(nombre || '').trim();
      return n ? n.charAt(0).toUpperCase() : '·';
    }

    _renderLogin() {
      const root = this.shadowRoot;
      let scrim = root.getElementById('loginScrim');
      if (!scrim) {
        scrim = document.createElement('div');
        scrim.className = 'ks-login-scrim';
        scrim.id = 'loginScrim';
        root.appendChild(scrim);
      }
      if (!this._loginSel) {
        // ── Paso 1: rejilla de empleados ──
        const staff = this._loginStaff || [];
        const cards = staff.length
          ? staff.map((s, i) => {
              const nombre = s.staffName || s.displayName || s.name || '';
              return `<button class="ks-login-staff" data-idx="${i}">
                <span class="ks-login-avatar" style="${this._loginAvatarStyle(s)}">${(s.profileImage || s.staffPhoto) ? '' : esc(this._loginInicial(nombre))}</span>
                <span class="ks-login-staff-name">${esc(nombre)}</span>
              </button>`;
            }).join('')
          : `<div class="ks-login-empty">Cargando personal…</div>`;
        scrim.innerHTML = `
          <div class="ks-login-card">
            <div class="ks-login-brand"><span class="ks-login-logo">KAMI<span class="ks-login-logo-accent">SUITE</span></span></div>
            <div class="ks-login-eyebrow">Identifícate para continuar</div>
            <div class="ks-login-staffgrid">${cards}</div>
          </div>`;
        scrim.querySelectorAll('.ks-login-staff').forEach(b => b.addEventListener('click', () => {
          const idx = parseInt(b.getAttribute('data-idx'), 10);
          this._loginSel = this._loginStaff[idx];
          this._loginPin = '';
          this._loginPinError = false;
          this._loginNeedsSetup = false;
          this._renderLogin();
        }));
      } else {
        // ── Paso 2: teclado PIN ──
        const s = this._loginSel;
        const nombre = s.staffName || s.displayName || s.name || '';
        const dots = [0, 1, 2, 3].map(i => {
          const filled = i < this._loginPin.length ? ' filled' : '';
          const err = this._loginPinError ? ' error' : '';
          return `<span class="ks-login-pindot${filled}${err}"></span>`;
        }).join('');
        const keys = ['1','2','3','4','5','6','7','8','9','clear','0','del'].map(k => {
          if (k === 'clear') return `<button class="ks-login-key is-action" data-k="clear" title="Borrar todo">C</button>`;
          if (k === 'del') return `<button class="ks-login-key is-action" data-k="del" title="Borrar">⌫</button>`;
          return `<button class="ks-login-key" data-k="${k}">${k}</button>`;
        }).join('');
        const setupMsg = this._loginNeedsSetup
          ? `<div class="ks-login-pinsetup">Este usuario no tiene PIN configurado. Defínelo en Control Horario.</div>`
          : '';
        const errMsg = this._loginPinError && !this._loginNeedsSetup
          ? `PIN incorrecto`
          : '';
        scrim.innerHTML = `
          <div class="ks-login-card">
            <div class="ks-login-pinhead">
              <button class="ks-login-pinback" id="loginBack" title="Volver">‹</button>
              <div class="ks-login-pinwho">
                <span class="ks-login-pinavatar" style="${this._loginAvatarStyle(s)}">${(s.profileImage || s.staffPhoto) ? '' : esc(this._loginInicial(nombre))}</span>
                <span class="ks-login-pinname">${esc(nombre)}</span>
              </div>
            </div>
            <div class="ks-login-pindots">${dots}</div>
            <div class="ks-login-keys">${keys}</div>
            <div class="ks-login-pinerr-msg">${esc(errMsg)}</div>
            ${setupMsg}
          </div>`;
        scrim.querySelector('#loginBack')?.addEventListener('click', () => {
          this._loginSel = null; this._loginPin = ''; this._loginPinError = false; this._renderLogin();
        });
        scrim.querySelectorAll('.ks-login-key[data-k]').forEach(b => b.addEventListener('click', () => {
          this._onLoginKey(b.getAttribute('data-k'));
        }));
      }
    }

    _onLoginKey(k) {
      this._loginPinError = false;
      this._loginNeedsSetup = false;
      if (k === 'clear') { this._loginPin = ''; this._renderLogin(); return; }
      if (k === 'del') { this._loginPin = this._loginPin.slice(0, -1); this._renderLogin(); return; }
      if (!/^\d$/.test(k)) return;
      if (this._loginPin.length >= 4) return;
      this._loginPin += k;
      this._renderLogin();
      if (this._loginPin.length === 4) {
        // Validar contra el backend vía page code.
        const staffId = this._loginSel?._id || this._loginSel?.staffId || this._loginSel?.wixResourceId || '';
        this._sendToPage('validatePin', { staffId, pin: this._loginPin });
      }
    }

    _onPinValidated(p) {
      if (p && p.valid) {
        // Login correcto: guardar empleado activo, ocultar overlay, arrancar
        // timeout de inactividad y registrar el evento de login.
        this._empleadoActivo = p.staff || this._loginSel || null;
        this._ocultarLogin();
        this._logEvent('login');
        this._attachLoginActivity();
        this._resetInactivity();
        this._loginPin = '';
        this._loginSel = null;
        this._loginPinError = false;
      } else {
        // PIN incorrecto o sin configurar.
        this._loginPin = '';
        this._loginPinError = true;
        this._loginNeedsSetup = !!(p && p.needsSetup);
        this._renderLogin();
      }
    }

    // ── Timeout de inactividad (60s) con actividad REAL ──
    _attachLoginActivity() {
      if (!this._usersActivation) return;
      if (this._loginActivityHandler) return;
      this._loginActivityHandler = () => this._resetInactivity();
      const root = this.shadowRoot;
      // v1.1.47 — Inactividad = ausencia de ACCIONES (click/tecla), NO de
      // movimiento de ratón. 'pointermove' reiniciaba el timer en cada píxel
      // que el operador movía el cursor → el timeout de 60s NUNCA llegaba.
      root.addEventListener('click', this._loginActivityHandler, true);
      root.addEventListener('keydown', this._loginActivityHandler, true);
    }
    _detachLoginActivity() {
      if (!this._loginActivityHandler) return;
      const root = this.shadowRoot;
      root.removeEventListener('click', this._loginActivityHandler, true);
      root.removeEventListener('keydown', this._loginActivityHandler, true);
      this._loginActivityHandler = null;
    }
    _resetInactivity() {
      if (!this._usersActivation || !this._empleadoActivo) return;
      this._clearInactivity();
      this._inactivityTimer = setTimeout(() => {
        // 60s sin actividad → registrar timeout y volver al login.
        this._logEvent('timeout');
        this._empleadoActivo = null;
        this._detachLoginActivity();
        this._mostrarLogin();
      }, this._inactivityMs);
    }
    _clearInactivity() {
      if (this._inactivityTimer) { clearTimeout(this._inactivityTimer); this._inactivityTimer = null; }
    }

    // ── Log de actividad (fire-and-forget vía page code) ──
    _logEvent(eventType, detail = '') {
      if (!this._usersActivation || !this._empleadoActivo) return;
      const s = this._empleadoActivo;
      this._sendToPage('logEvent', {
        staffId: s._id || s.staffId || s.wixResourceId || '',
        staffName: s.staffName || s.displayName || s.name || '',
        accessLevel: s.accessLevel || '',
        staffPhoto: s.profileImage || s.staffPhoto || '',
        eventType,
        detail
      });
    }

    // ─── v1.1.62 · Niveles de acceso (capa de front) ───
    // Gobierna qué acciones puede ejecutar el empleado logueado según su
    // accessLevel (StaffConfig · Number 1-4), que llega en _empleadoActivo
    // desde validateLoginPin. Solo actúa si la capa de login está activa
    // (this._usersActivation, flag SalonConfig.usersActivation). Sin login
    // activo o sin empleado → acceso total (comportamiento previo intacto).
    //   1 Administrador · 2 Encargado · 3 Recepción · 4 Básico
    // Sin nivel válido asignado → se trata como 4 (más restrictivo).
    _puede(accion) {
      if (!this._usersActivation || !this._empleadoActivo) return true;
      const raw = Number(this._empleadoActivo.accessLevel);
      const nv = (raw === 1 || raw === 2 || raw === 3) ? raw : 4;
      switch (accion) {
        case 'crearReserva':
        case 'editarCita':
        case 'cobrar':
          return nv <= 3;
        case 'bloqueo':
        case 'arqueo':
        case 'ajustes':
          return nv <= 2;
        case 'cierre':
          // N1 cualquier día; N2 solo el día en curso.
          return nv === 1 || (nv === 2 && this._fecha === todayISO());
        default:
          return false;
      }
    }

    // ─── v1.1.63 · Copiar al portapapeles (patrón copyText del CRM Móvil) ───
    // Texto plano con fallback execCommand para navegadores/contextos que
    // no exponen navigator.clipboard. El textarea del fallback se ancla al
    // Shadow DOM (this.shadowRoot) por ser un Custom Element.
    _copyText(texto, msg) {
      const ok = () => this._toast(msg || 'Copiado');
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(texto).then(ok).catch(() => this._copyFallback(texto, ok));
      } else {
        this._copyFallback(texto, ok);
      }
    }
    _copyFallback(texto, ok) {
      try {
        const ta = document.createElement('textarea');
        ta.value = texto;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        (this.shadowRoot || document.body).appendChild(ta);
        ta.focus(); ta.select();
        document.execCommand('copy');
        ta.remove();
        ok();
      } catch (e) {
        this._toast('No se pudo copiar');
      }
    }

    // ─── v1.1.63 · Componer texto plano de un bloque del informe del día ───
    // tipo: 'rend' (rendimiento productivo, cabecera brandName) |
    //       'fin'  (cierre financiero, cabecera legalName).
    // Lee this._cierreData (mismos datos que pinta _renderCierre). No parsea
    // HTML: usa las propiedades del objeto directamente. eur() ya existe.
    _cierreBloqueATexto(tipo) {
      const d = this._cierreData || {};
      const ext = d.extendido || {};
      const fecha = this._cierreFecha || this._fecha || '';
      const L = [];

      if (tipo === 'rend') {
        const r = ext.rendimiento;
        if (!r) return '';
        const cab = this._salonBrandName ? `${this._salonBrandName} · ` : '';
        L.push('📈 RENDIMIENTO PRODUCTIVO');
        L.push(`${cab}${fecha}`);
        L.push('');
        L.push(`COBRADO: ${eur(r.cobrado)} (${r.clientesCobrados} clientes)`);
        L.push(`PENDIENTE: ${eur(r.pendiente)} (${r.clientesPendientes} clientes)`);
        L.push(`TOTAL DEL DÍA: ${eur(r.total)} (${r.clientesTotal} clientes)`);

        if (r.servicios && r.servicios.length) {
          L.push('');
          L.push('✂️ Servicios del día');
          for (const s of r.servicios) {
            const mult = s.cantidad > 1 ? ` (${eur(s.total / s.cantidad)} ×${s.cantidad})` : '';
            L.push(`- ${s.nombre}${mult}: ${eur(s.total)}`);
          }
        }
        if (r.clientes && r.clientes.length) {
          L.push('');
          L.push(`👥 Clientes del día (${r.clientes.length})`);
          for (const c of r.clientes) {
            const svcs = (c.servicios || []).map(s => s.nombre).filter(Boolean).join(' · ');
            const estado = c.status === 'PAGADO' ? '[PAGADO]' : '[PDTE]';
            L.push(`- ${c.hora || ''} ${c.nombre}${svcs ? ' — ' + svcs : ''} ${estado}: ${eur(c.total)}`);
          }
        }
        if (r.descuentos && r.descuentos.length) {
          L.push('');
          L.push('🏷️ Descuentos aplicados');
          for (const desc of r.descuentos) {
            const tag = desc.labelDesc ? ` (${desc.labelDesc})` : '';
            L.push(`- ${desc.label} · ${desc.cliente}${tag}: -${eur(desc.importe)}`);
          }
          L.push(`Total descuentos: -${eur(r.descuentoTotal)}`);
        }
        if (r.staff && r.staff.length) {
          L.push('');
          L.push('💼 Productividad por staff');
          for (const s of r.staff) {
            const e = s.isExternal ? ' [EXT]' : '';
            const pdte = s.pendiente > 0 ? ` (+${eur(s.pendiente)} pdte)` : '';
            L.push(`- ${s.staffName}${e} · ${s.citas} citas: ${eur(s.cobrado)}${pdte}`);
          }
        }
        if (r.productos && r.productos.length) {
          L.push('');
          L.push('🛒 Productos vendidos');
          for (const p of r.productos) {
            const mult = p.cantidad > 1 ? ` ×${p.cantidad}` : '';
            L.push(`- ${p.nombre}${mult}: ${eur(p.total)}`);
          }
        }
        if (r.externos && r.externos.length) {
          L.push('');
          L.push('🔗 Servicios externos (bruto)');
          for (const e of r.externos) {
            L.push(`- ${e.cliente} · ${e.servicio} (${e.staffName}): ${eur(e.importe)}`);
          }
          L.push(`Bruto externos: ${eur(r.externosTotal)}`);
        }
        return L.join('\n');
      }

      if (tipo === 'fin') {
        const c = ext.cierre;
        if (!c) return '';
        const cab = this._salonLegalName ? `${this._salonLegalName} · ` : '';
        L.push('💰 CIERRE FINANCIERO');
        L.push(`${cab}${fecha}`);
        L.push('');
        L.push(`TOTAL COBRADO REAL: ${eur(c.totalReal)} (${c.transacciones} transacciones)`);

        if (c.porMetodo && c.porMetodo.length) {
          L.push('');
          L.push('💳 Cobrado por método de pago');
          for (const m of c.porMetodo) L.push(`- ${m.metodo}: ${eur(m.importe)}`);
        }
        if (c.descuentos && c.descuentos.length) {
          L.push('');
          L.push('🏷️ Descuentos aplicados');
          for (const desc of c.descuentos) {
            const tag = desc.labelDesc ? ` (${desc.labelDesc})` : '';
            L.push(`- ${desc.cliente || 'Sin cliente'}${tag}: -${eur(desc.importe)}`);
          }
          L.push(`Total descuentos: -${eur(c.descuentoTotal || 0)}`);
        }
        if (c.iva) {
          const iva = c.iva;
          L.push('');
          L.push(`📄 Desglose fiscal (IVA ${iva.vatRate}%)`);
          L.push(`Total cobrado (IVA incluido): ${eur(iva.totalSinPropinas)}`);
          if (iva.totalPropinas > 0) L.push(`(propinas excluidas: ${eur(iva.totalPropinas)})`);
          L.push(`Base imponible: ${eur(iva.baseImponible)}`);
          L.push(`Cuota IVA (${iva.vatRate}%): ${eur(iva.cuotaIVA)}`);
        }
        if (c.staff && c.staff.length) {
          L.push('');
          L.push('💼 Cobrado por staff');
          for (const s of c.staff) {
            const e = s.isExternal ? ' [EXT]' : '';
            L.push(`- ${s.staffName}${e} · ${s.citas} cobros: ${eur(s.cobrado)}`);
          }
        }
        if (c.productos && c.productos.length) {
          L.push('');
          L.push('🛒 Productos cobrados hoy');
          for (const p of c.productos) {
            const mult = p.cantidad > 1 ? ` ×${p.cantidad}` : '';
            L.push(`- ${p.nombre}${mult}: ${eur(p.total)}`);
          }
        }
        // v1.1.80 — Especiales vendidos hoy
        if (c.especiales && c.especiales.length) {
          L.push('');
          L.push('🎟️ Especiales vendidos hoy');
          for (const e of c.especiales) {
            const quien = e.cliente ? ` · ${e.cliente}` : '';
            const met = e.metodo ? ` (${e.metodo})` : '';
            L.push(`- ${e.concepto}${quien}${met}: ${eur(e.importe)}`);
          }
          L.push(`Total especiales: ${eur(c.especialesTotal || 0)}`);
        }
        if (c.externos && c.externos.length) {
          L.push('');
          L.push('🔗 Comisiones externos');
          for (const e of c.externos) {
            L.push(`- ${e.cliente} (${e.staffName} · ${e.pct}%): ${eur(e.comision)}`);
          }
          L.push(`Total comisiones: ${eur(c.externosComisionTotal)}`);
        }
        const extV2 = d.externosV2;
        if (extV2 && extV2.citas > 0) {
          L.push('');
          L.push('Servicios externos');
          for (const it of (extV2.desglose || [])) {
            const mult = (it.count && it.count > 1) ? ` ×${it.count}` : '';
            L.push(`- ${it.nombre}${mult}: ${eur(it.ventaBruta)}`);
          }
          L.push(`Venta bruta externa: ${eur(extV2.ventaBruta)}`);
          L.push(`Comisión del salón: ${eur(extV2.comisionTotal)}`);
        }
        const arq = d.arqueo;
        if (arq) {
          L.push('');
          L.push('🏦 Arqueo de efectivo');
          L.push(`Fondo inicial: ${eur(arq.fondoInicial || 0)}`);
          L.push(`Cobros en efectivo: +${eur(arq.cobrosEfectivo || 0)}`);
          if (arq.entradas) L.push(`Entradas manuales: +${eur(arq.entradas)}`);
          if (arq.salidas) L.push(`Salidas manuales: -${eur(arq.salidas)}`);
          if (arq.retiradas) L.push(`Retiradas: -${eur(arq.retiradas)}`);
          L.push(`Efectivo esperado: ${eur(arq.esperado || 0)}`);
          if (arq.status) {
            L.push(`Efectivo contado: ${eur(arq.contado || 0)}`);
            const dif = Math.round(((arq.contado || 0) - (arq.esperado || 0)) * 100) / 100;
            L.push(Math.abs(dif) < 0.01 ? 'Caja cuadrada' : `Diferencia: ${dif >= 0 ? '+' : ''}${eur(dif)}`);
          }
        }
        return L.join('\n');
      }

      return '';
    }

    // ─── toast ───
    _toast(msg) {
      const root = this.shadowRoot;
      root.getElementById('toast')?.remove();
      const t = document.createElement('div'); t.className = 'ks-toast'; t.id = 'toast'; t.textContent = msg;
      root.appendChild(t);
      clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(() => t.remove(), 2600);
    }


    // ═══════════════════════════════════════════════════
    // v1.1.76 — ALMACÉN (papelera y sacar de almacén)
    // ═══════════════════════════════════════════════════
    // Superficie de trabajo diario, no de administración: solo dos
    // acciones, ambas permitidas a cualquier nivel de acceso. La gestión
    // del almacén (alta, coste, mínimos, traspasos) vive en su pantalla.
    _openAlmacen() {
      this._almProductos = [];
      this._almQ = '';
      this._almCat = '';
      this._almCargando = true;
      this._almOcupado = {};
      const root = this.shadowRoot;
      root.getElementById('almScrim')?.remove();
      const scrim = document.createElement('div');
      scrim.className = 'alm-scrim';
      scrim.id = 'almScrim';
      root.appendChild(scrim);
      this._renderAlmacen();
      this._sendToPage('getAlmacenConsumibles', {});
    }

    _closeAlmacen() {
      this.shadowRoot.getElementById('almScrim')?.remove();
    }

    _almFiltrados() {
      const q = (this._almQ || '').trim().toLowerCase();
      const cat = this._almCat || '';
      return (this._almProductos || []).filter(p => {
        if (cat && (p.category || '') !== cat) return false;
        if (!q) return true;
        return `${p.productName} ${p.brand} ${p.category}`.toLowerCase().includes(q);
      });
    }

    _renderAlmacen() {
      const scrim = this.shadowRoot.getElementById('almScrim');
      if (!scrim) return;

      const cats = Array.from(new Set((this._almProductos || [])
        .map(p => (p.category || '').trim()).filter(c => c)))
        .sort((a, b) => a.localeCompare(b, 'es'));

      const lista = this._almFiltrados();

      let cuerpo;
      if (this._almCargando) {
        cuerpo = '<div class="alm-empty">Cargando productos…</div>';
      } else if (!lista.length) {
        cuerpo = '<div class="alm-empty">No hay productos que coincidan.</div>';
      } else {
        cuerpo = lista.map(p => {
          const ocupado = this._almOcupado[p.id] === true;
          const meta = [p.brand, p.category, p.unit].filter(x => x).join(' · ');
          return `<div class="alm-row" data-id="${esc(p.id)}">
            ${p.imageUrl ? `<img class="alm-img" src="${esc(p.imageUrl)}" alt=""/>` : '<div class="alm-img"></div>'}
            <div class="alm-main">
              <div class="alm-name">${esc(p.productName)}</div>
              <div class="alm-meta">${esc(meta)}${p.needsRestock ? ' · <span class="alm-low">⚠ reponer</span>' : ''}</div>
            </div>
            <div class="alm-cnt"><b>${p.stockStored}</b><span>Cerrados</span></div>
            <div class="alm-cnt use"><b>${p.stockInUse}</b><span>En uso</span></div>
            <div class="alm-acts">
              <button class="alm-btn" data-alm="tirar" data-id="${esc(p.id)}" title="Bote terminado: tirar a la basura"${ocupado || p.total <= 0 ? ' disabled' : ''}>🗑️<small>TIRAR</small></button>
              <button class="alm-btn" data-alm="sacar" data-id="${esc(p.id)}" title="Sacar un bote del almacén para empezarlo"${ocupado || p.stockStored <= 0 ? ' disabled' : ''}>📤<small>SACAR</small></button>
            </div>
          </div>`;
        }).join('');
      }

      scrim.innerHTML = `<div class="alm-modal">
        <div class="alm-head">
          <span class="alm-title">🗄️ ALMACÉN · consumo del día</span>
          <button class="alm-x" id="almX">✕</button>
        </div>
        <div class="alm-filters">
          <input class="alm-input" id="almQ" type="text" placeholder="Buscar producto, marca o categoría…" value="${esc(this._almQ || '')}"/>
          <select class="alm-sel" id="almCat">
            <option value="">Todas las categorías</option>
            ${cats.map(c => `<option value="${esc(c)}"${this._almCat === c ? ' selected' : ''}>${esc(c)}</option>`).join('')}
          </select>
        </div>
        <div class="alm-list">${cuerpo}</div>
        <div class="alm-foot">🗑️ TIRAR: bote terminado — descuenta uno del almacén y abre el siguiente. &nbsp;·&nbsp; 📤 SACAR: coger un bote para empezarlo, sin tirar ninguno.</div>
      </div>`;

      this._almRewire();
    }

    _almRewire() {
      const scrim = this.shadowRoot.getElementById('almScrim');
      if (!scrim) return;

      scrim.addEventListener('click', (e) => { if (e.target === scrim) this._closeAlmacen(); }, { once: true });
      scrim.querySelector('#almX')?.addEventListener('click', () => this._closeAlmacen());

      const inp = scrim.querySelector('#almQ');
      if (inp) {
        inp.addEventListener('input', () => {
          this._almQ = inp.value;
          this._renderAlmacen();
          // Devolver el foco y el cursor al final tras repintar.
          const nuevo = this.shadowRoot.querySelector('#almQ');
          if (nuevo) { nuevo.focus(); nuevo.setSelectionRange(nuevo.value.length, nuevo.value.length); }
        });
      }
      scrim.querySelector('#almCat')?.addEventListener('change', (e) => {
        this._almCat = e.target.value;
        this._renderAlmacen();
      });

      scrim.querySelectorAll('[data-alm]').forEach(b => {
        b.addEventListener('click', () => this._almAccion(b.dataset.alm, b.dataset.id));
      });
    }

    // Firma del movimiento: el empleado logueado por PIN. Sin capa de
    // login activa (usersActivation en false) se graba sin firma, igual
    // que hace _logEvent.
    _almFirma() {
      const s = this._empleadoActivo;
      if (!this._usersActivation || !s) return { staffId: '', staffName: '' };
      return {
        staffId: s._id || s.staffId || s.wixResourceId || '',
        staffName: s.staffName || s.displayName || s.name || ''
      };
    }

    _almAccion(accion, id) {
      const p = (this._almProductos || []).find(x => x.id === id);
      if (!p || this._almOcupado[id]) return;
      if (accion === 'tirar' && p.total <= 0) return;
      if (accion === 'sacar' && p.stockStored <= 0) return;

      this._almOcupado[id] = true;
      this._renderAlmacen();
      this._sendToPage(accion === 'tirar' ? 'almacenPapelera' : 'almacenSacar', {
        payload: { productId: id, ...this._almFirma() }
      });
      this._toast(accion === 'tirar' ? `🗑️ ${p.productName}` : `📤 ${p.productName}`);
    }

    _onAlmData(p) {
      this._almCargando = false;
      this._almProductos = Array.isArray(p.productos) ? p.productos : [];
      if (p.error) this._toast('Almacén: ' + p.error);
      this._renderAlmacen();
    }

    // Actualización en local con los contadores que devuelve el backend:
    // no se relee la lista entera por cada clic.
    _onAlmAccion(p) {
      const d = p.data || {};
      const id = d.productId || p.productId;
      if (id) this._almOcupado[id] = false;

      if (!d.ok) {
        this._toast('Almacén: ' + (d.error || 'no se pudo registrar'));
        this._renderAlmacen();
        return;
      }

      const i = (this._almProductos || []).findIndex(x => x.id === id);
      if (i >= 0) {
        const it = this._almProductos[i];
        it.stockStored = d.stockStored;
        it.stockInUse = d.stockInUse;
        it.total = (typeof d.total === 'number') ? d.total : (d.stockStored + d.stockInUse);
        if (typeof d.needsRestock === 'boolean') it.needsRestock = d.needsRestock;
        // Un producto que llega a cero sale del listado de consumo.
        if (it.total <= 0) this._almProductos.splice(i, 1);
      }
      this._renderAlmacen();
    }


    // ═══════════════════════════════════════════════════
    // v1.1.77 — FICHA TÉCNICA (histórico de color)
    // ═══════════════════════════════════════════════════
    // Consulta del histórico del sistema anterior para la sala.
    // NO muestra dinero porque el backend NO lo envía: ver
    // getFichaTecnicaCliente en memoriaLegacyLogic v1.0.3.

    _openFichaTecnica() {
      this._ftCliente = null;
      this._ftData = null;
      this._ftCargando = false;
      const root = this.shadowRoot;
      root.getElementById('ftScrim')?.remove();
      const scrim = document.createElement('div');
      scrim.className = 'ft-scrim';
      scrim.id = 'ftScrim';
      root.appendChild(scrim);
      this._renderFt();

      // v1.1.79 — Precarga por orden de proximidad al operador:
      // 1º el cliente del aside (lo que tiene delante ahora mismo),
      // 2º el de la última cita abierta en el calendario.
      // Sin este orden el popup se quedaba pegado al cliente anterior.
      let pre = null;
      const cliAside = this._cliente;
      if (cliAside && cliAside.nombre) {
        pre = { nombre: cliAside.nombre, telefono: cliAside.telefono || '' };
      } else {
        const u = this._ftUltimoCliente;
        if (u && (u.telefono || u.nombre)) pre = u;
      }
      if (pre) this._ftCargar(pre.nombre, pre.telefono);
    }

    _closeFichaTecnica() {
      this.shadowRoot.getElementById('ftScrim')?.remove();
    }

    _ftCargar(nombre, telefono) {
      this._ftCliente = { nombre: nombre || '', telefono: telefono || '' };
      this._ftData = null;
      this._ftCargando = true;
      this._renderFt();
      this._sendToPage('getFichaTecnica', {
        telefono: telefono || '',
        clientName: nombre || ''
      });
    }

    _onFichaTecnica(p) {
      this._ftCargando = false;
      this._ftData = (p && p.data) ? p.data : { ok: false };
      this._renderFt();
    }

    _renderFtCli(clientes) {
      const box = this.shadowRoot.getElementById('ftResults');
      if (!box) return;
      if (!clientes.length) { box.innerHTML = ''; box.style.display = 'none'; return; }
      box.style.display = 'block';
      box.innerHTML = clientes.map(c => `
        <div class="ft-cli" data-tel="${esc(c.telefono || '')}" data-nom="${esc(c.nombreCompleto || '')}">
          <div class="ft-cli-name">${esc(c.nombreCompleto || '—')}</div>
          <div class="ft-cli-tel">${esc(c.telefono || 'Sin teléfono')}</div>
        </div>`).join('');
      box.querySelectorAll('.ft-cli').forEach(el => {
        el.addEventListener('click', () => {
          const q = this.shadowRoot.getElementById('ftQuery');
          if (q) q.value = '';
          box.innerHTML = ''; box.style.display = 'none';
          this._ftCargar(el.getAttribute('data-nom'), el.getAttribute('data-tel'));
        });
      });
    }

    _ftFecha(ymd) {
      if (!ymd || ymd.length < 10) return '—';
      const M = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
      return Number(ymd.slice(8,10)) + ' ' + (M[Number(ymd.slice(5,7)) - 1] || '') + ' ' + ymd.slice(0,4);
    }

    _renderFt() {
      const scrim = this.shadowRoot.getElementById('ftScrim');
      if (!scrim) return;
      const cli = this._ftCliente;
      const d = this._ftData;

      let cuerpo = '';
      if (this._ftCargando) {
        cuerpo = `<div class="ft-empty">Buscando el historial…</div>`;
      } else if (!cli) {
        cuerpo = `<div class="ft-empty">Busca una clienta para ver su historial de color.</div>`;
      } else if (!d || !d.ok) {
        cuerpo = `<div class="ft-empty">No se ha podido consultar el historial.</div>`;
      } else if (!d.encontrado) {
        cuerpo = `<div class="ft-empty">Sin historial anterior para <b>${esc(cli.nombre)}</b>.<br>Es clienta nueva o entró ya con el sistema actual.</div>`;
      } else {
        const c = d.cliente || {};
        const habituales = d.habituales || [];
        const visitas = d.visitas || [];

        // v1.1.78 — las fórmulas van PRIMERO y en bloque propio. Es el
        // dato por el que se abre este popup; enterrarlo dentro del
        // historial obliga a rebuscar (solo ~16% de visitas lo tienen).
        const conFormula = visitas.filter(v => v.formula);

        cuerpo = `
          <div class="ft-kpis">
            <div class="ft-kpi"><div class="ft-kpi-l">Visitas</div><div class="ft-kpi-v">${c.visitas || 0}</div></div>
            <div class="ft-kpi"><div class="ft-kpi-l">Fórmulas</div><div class="ft-kpi-v">${c.formulas || 0}</div></div>
            <div class="ft-kpi"><div class="ft-kpi-l">Primera</div><div class="ft-kpi-v" style="font-size:13px">${esc(this._ftFecha(c.primeraVisita))}</div></div>
            <div class="ft-kpi"><div class="ft-kpi-l">Última</div><div class="ft-kpi-v" style="font-size:13px">${esc(this._ftFecha(c.ultimaVisita))}</div></div>
          </div>

          <div class="ft-sec">Historial de color (${conFormula.length})</div>
          ${conFormula.length ? conFormula.map(v => `
            <div class="ft-color">
              <div class="ft-color-h">
                <span class="ft-vfecha">${esc(this._ftFecha(v.fecha))}</span>
                ${v.profesional ? `<span class="ft-vof">${esc(v.profesional)}</span>` : ''}
              </div>
              <div class="ft-formula">${esc(v.formula)}</div>
              <div class="ft-color-srv">${esc((v.servicios || []).map(x => x.servicio || x.codigo).join(' + ') || '')}</div>
            </div>`).join('')
            : `<div class="ft-nocolor">Sin fórmulas anotadas en el sistema anterior.</div>`}

          ${habituales.length ? `<div class="ft-sec">Lo que se le hace</div><div class="ft-habit">${
            habituales.map(h => `<span class="ft-tag">${esc(h.servicio || h.codigo)} <b>×${h.veces}</b></span>`).join('')
          }</div>` : ''}

          <div class="ft-sec">Todas sus visitas (${visitas.length})</div>
          ${visitas.length ? visitas.map(v => `
            <div class="ft-visita">
              <div class="ft-vh">
                <span class="ft-vfecha">${esc(this._ftFecha(v.fecha))}</span>
                ${v.hora ? `<span class="ft-cli-tel">${esc(v.hora)}</span>` : ''}
                ${v.profesional ? `<span class="ft-vof">${esc(v.profesional)}</span>` : ''}
              </div>
              <div class="ft-vsrv">${esc((v.servicios || []).map(x => x.servicio || x.codigo).join(' + ') || '—')}</div>
            </div>`).join('') : `<div class="ft-empty">Sin visitas registradas.</div>`}
        `;
      }

      scrim.innerHTML = `
        <div class="ft-modal">
          <div class="ft-head">
            <div>
              <div class="ft-title">🎨 Ficha técnica${cli && cli.nombre ? ' · ' + esc(cli.nombre) : ''}</div>
              <div class="ft-sub">Historial de color del sistema anterior</div>
            </div>
            <button class="ft-x" id="ftClose">✕</button>
          </div>
          <div class="ft-search">
            <input class="ft-input" id="ftQuery" type="search" placeholder="Buscar clienta por nombre o teléfono…" autocomplete="off">
            <div class="ft-results" id="ftResults" style="display:none"></div>
          </div>
          <div class="ft-body">${cuerpo}</div>
          <div class="ft-foot">Solo consulta técnica. Los datos económicos están en Histórico de Facturación.</div>
        </div>`;

      scrim.querySelector('#ftClose')?.addEventListener('click', () => this._closeFichaTecnica());
      scrim.addEventListener('click', (e) => { if (e.target === scrim) this._closeFichaTecnica(); });

      const q = scrim.querySelector('#ftQuery');
      if (q) {
        q.addEventListener('input', () => {
          const val = q.value.trim();
          clearTimeout(this._ftBuscarTimer);
          if (val.length < 2) { this._renderFtCli([]); return; }
          this._ftBuscarTimer = setTimeout(() => this._sendToPage('ftBuscarCliente', { query: val }), 250);
        });
      }

    }

    // ═══════════════════════════════════════════════════
    // v1.1.69 — ESPECIALES (venta manual PRIME/Bonos/Tarjetas)
    // ═══════════════════════════════════════════════════
    _openEspeciales() {
      this._espCliente = null;
      this._espNuevoAbierto = false;
      this._espTab = 'bono';
      this._espBonoIdx = -1;
      this._espCampIdx = -1;
      this._espRegalo = false;
      this._espMetodo = 'Efectivo';
      this._espEmitiendo = false;
      this._espMsg = null;
      // v1.1.75 — descuento manual del operador (mismo modelo que el cobro normal)
      this._espDisc = 0;
      this._espDiscMode = 'pct';
      this._espDiscOpen = false;
      const root = this.shadowRoot;
      root.getElementById('espScrim')?.remove();
      const scrim = document.createElement('div');
      scrim.className = 'esp-scrim';
      scrim.id = 'espScrim';
      root.appendChild(scrim);
      this._renderEsp();
      // Datos frescos: config PRIME + servicios con bono + campañas vigentes.
      this._sendToPage('getEspecialesData', {});
    }

    _closeEspeciales() {
      this.shadowRoot.getElementById('espScrim')?.remove();
    }

    _renderEsp() {
      const scrim = this.shadowRoot.getElementById('espScrim');
      if (!scrim) return;
      const cli = this._espCliente;
      const data = this._espData;
      const tab = this._espTab;

      // ── Bloque cliente ──
      let cliHTML;
      if (cli) {
        cliHTML = `<div class="esp-chip">
          <div><div class="esp-cli-name">${esc(cli.nombre || 'Cliente')}</div>
          <div class="esp-cli-sub">${esc(cli.telefono || '')}${cli.email ? ' · ' + esc(cli.email) : ''}</div></div>
          <button class="esp-link" id="espCliChange">Cambiar</button>
        </div>`;
      } else if (this._espNuevoAbierto) {
        const d = this._espNvDraft || {};
        cliHTML = `<div class="esp-row2">
            <input class="esp-input" id="espNvNombre" placeholder="Nombre *" autocomplete="off" value="${esc(d.nombre || '')}" />
            <input class="esp-input" id="espNvApellido" placeholder="Apellido" autocomplete="off" value="${esc(d.apellido || '')}" />
          </div>
          <div class="esp-row2" style="margin-top:8px;">
            <input class="esp-input" id="espNvTel" placeholder="Teléfono" autocomplete="off" value="${esc(d.telefono || '')}" />
            <input class="esp-input" id="espNvEmail" placeholder="Email" autocomplete="off" value="${esc(d.email || '')}" />
          </div>
          <div class="esp-row2" style="margin-top:8px;">
            <button class="esp-link" id="espNvCancel">Cancelar</button>
            <button class="esp-emit" id="espNvSave" style="margin-top:0;padding:9px;">Guardar cliente</button>
          </div>`;
      } else {
        cliHTML = `<input class="esp-input" id="espCliBuscar" placeholder="Buscar por nombre, teléfono o email…" autocomplete="off" />
          <div id="espCliResults"></div>
          <button class="esp-link" id="espCliNuevo">+ Cliente nuevo</button>`;
      }

      // ── Bloque producto ──
      let prodHTML = '';
      if (!data) {
        prodHTML = `<div class="esp-muted">Cargando productos…</div>`;
      } else if (tab === 'prime') {
        const cfg = data.config || {};
        const precio = (typeof cfg.primeAnnualPrice === 'number') ? cfg.primeAnnualPrice : 0;
        const meses = (typeof cfg.primeDurationMonths === 'number') ? cfg.primeDurationMonths : 12;
        prodHTML = `<div class="esp-price">Tarjeta PRIME — ${precio}€ <small>· ${meses} meses de vigencia</small></div>`;
      } else if (tab === 'bono') {
        const servicios = data.servicios || [];
        if (!servicios.length) {
          prodHTML = `<div class="esp-muted">No hay servicios con bono activo.</div>`;
        } else {
          const opts = servicios.map((s, i) => `<option value="${i}"${i === this._espBonoIdx ? ' selected' : ''}>${esc(s.label)}</option>`).join('');
          prodHTML = `<select class="esp-select" id="espBonoSel"><option value="-1">— Elige un servicio con bono —</option>${opts}</select>`;
          const s = servicios[this._espBonoIdx];
          if (s) {
            prodHTML += `<div class="esp-price">${s.bonoNumero} sesiones — ${s.precioBonoCalculado}€ <small>· ${s.bonoDescuento}% dto sobre ${s.precioBrutoCalculado}€</small></div>`;
          }
        }
      } else if (tab === 'tarjeta') {
        const camps = data.campaigns || [];
        if (!camps.length) {
          prodHTML = `<div class="esp-muted">No hay campañas de tarjeta vigentes.</div>`;
        } else {
          const opts = camps.map((c, i) => `<option value="${i}"${i === this._espCampIdx ? ' selected' : ''}>${esc(c.name || c.serviceLabel || 'Tarjeta')}</option>`).join('');
          prodHTML = `<select class="esp-select" id="espCampSel"><option value="-1">— Elige una campaña —</option>${opts}</select>`;
          const c = camps[this._espCampIdx];
          if (c) {
            prodHTML += `<div class="esp-price">${c.promoPrice}€${c.serviceLabel ? ` <small>· ${esc(c.serviceLabel)}</small>` : ''}</div>`;
            prodHTML += `<div class="esp-gift">
              <label class="esp-muted"><input type="checkbox" id="espRegalo"${this._espRegalo ? ' checked' : ''}/> Es un regalo</label>
              ${this._espRegalo ? `<div class="esp-row2" style="margin-top:8px;">
                <input class="esp-input" id="espRecNombre" placeholder="Nombre destinatario *" autocomplete="off" />
                <input class="esp-input" id="espRecEmail" placeholder="Email destinatario *" autocomplete="off" />
              </div>
              <input class="esp-input" id="espRecMsg" placeholder="Mensaje (opcional)" autocomplete="off" style="margin-top:8px;" />` : ''}
            </div>`;
          }
        }
      }

      const precio = this._espPrecioActual();
      const payHTML = ['Efectivo', 'Tarjeta', 'Bizum']
        .map(m => `<button class="esp-paybtn${this._espMetodo === m ? ' active' : ''}" data-m="${m}">${m}</button>`).join('');
      const puede = this._espPuedeEmitir();

      // v1.1.75 — Card de descuento manual (misma UI %/€ que el cobro normal,
      // clases .ks-disc-*). Solo cuando hay producto elegido con precio > 0.
      const _disc = this._espCalcDescuento();
      const hayDesc = _disc.discEur > 0;
      const precioNeto = _disc.neto;
      let discHTML = '';
      if (precio > 0) {
        let inner;
        if (this._espDisc > 0 || this._espDiscOpen) {
          const mode = this._espDiscMode || 'pct';
          const maxAttr = mode === 'eur' ? '' : 'max="100"';
          const stepAttr = mode === 'eur' ? 'step="0.01"' : 'step="1"';
          const unit = mode === 'eur' ? '€' : '%';
          inner = `<div class="ks-disc-row">
            <span class="ks-disc-lbl">🏷 Descuento</span>
            <div class="ks-disc-mode">
              <button class="ks-disc-mbtn ${mode === 'pct' ? 'sel' : ''}" data-espmode="pct" title="Porcentaje">%</button>
              <button class="ks-disc-mbtn ${mode === 'eur' ? 'sel' : ''}" data-espmode="eur" title="Importe en euros">€</button>
            </div>
            <div class="ks-disc-input">
              <input id="espDiscInput" type="number" min="0" ${maxAttr} ${stepAttr} value="${this._espDisc || ''}" placeholder="0">
              <span>${unit}</span>
            </div>
            <button class="ks-disc-clear" id="espDiscClear">✕</button>
          </div>`;
        } else {
          inner = `<button class="ks-disc-toggle" id="espDiscToggle">＋ Aplicar descuento</button>`;
        }
        const resLine = `<div id="espDiscResult" style="margin-top:8px;font-size:12px;color:var(--ks-ink2)">${hayDesc ? `Cobrará <b style="color:var(--ks-ink)">${precioNeto}€</b> · antes <span style="text-decoration:line-through">${precio}€</span>` : ''}</div>`;
        discHTML = `<div class="esp-sec"><span class="esp-eyebrow">Descuento (opcional)</span>${inner}${resLine}</div>`;
      }
      const emitLabel = this._espEmitiendo
        ? 'Emitiendo…'
        : (precio > 0 ? `Emitir y cobrar · ${hayDesc ? precioNeto : precio}€` : 'Emitir y cobrar');

      scrim.innerHTML = `<div class="esp-modal">
        <div class="esp-head"><span class="esp-title">✦ ESPECIALES · Venta manual</span><button class="esp-x" id="espX">✕</button></div>
        <div class="esp-body">
          <div class="esp-sec"><span class="esp-eyebrow">Cliente</span>${cliHTML}</div>
          <div class="esp-sec"><span class="esp-eyebrow">Producto</span>
            <div class="esp-tabs">
              <button class="esp-tab${tab === 'prime' ? ' active' : ''}" data-tab="prime">⭐ PRIME</button>
              <button class="esp-tab${tab === 'bono' ? ' active' : ''}" data-tab="bono">🎟️ Bono</button>
              <button class="esp-tab${tab === 'tarjeta' ? ' active' : ''}" data-tab="tarjeta">🎁 Tarjeta</button>
            </div>
            ${prodHTML}
          </div>
          <div class="esp-sec"><span class="esp-eyebrow">Método de pago</span><div class="esp-pay">${payHTML}</div></div>
          ${discHTML}
          ${this._espMsg ? `<div class="esp-notice ${this._espMsg.tipo}"><span>${esc(this._espMsg.texto)}</span>${this._espMsg.accion ? `<button class="esp-notice-act" id="espMsgAct">${esc(this._espMsg.accion.label)}</button>` : ''}</div>` : ''}
          <button class="esp-emit" id="espEmit"${puede ? '' : ' disabled'}>${emitLabel}</button>
        </div>
      </div>`;
      this._espRewire();
    }

    _espRewire() {
      const scrim = this.shadowRoot.getElementById('espScrim');
      if (!scrim) return;
      const $ = (id) => scrim.querySelector('#' + id);
      const clr = () => { this._espMsg = null; };

      $('espX') && $('espX').addEventListener('click', () => this._closeEspeciales());

      const buscar = $('espCliBuscar');
      if (buscar) {
        buscar.addEventListener('input', e => {
          const q = e.target.value;
          clearTimeout(this._espBuscarTimer);
          if (q.trim().length < 2) { this._renderEspCli([]); return; }
          this._espBuscarTimer = setTimeout(() => this._sendToPage('espBuscarCliente', { query: q }), 250);
        });
      }
      $('espCliNuevo') && $('espCliNuevo').addEventListener('click', () => { clr(); this._espNvDraft = {}; this._espNuevoAbierto = true; this._renderEsp(); });
      $('espCliChange') && $('espCliChange').addEventListener('click', () => { clr(); this._espCliente = null; this._renderEsp(); });
      $('espNvCancel') && $('espNvCancel').addEventListener('click', () => { clr(); this._espNuevoAbierto = false; this._renderEsp(); });
      $('espNvSave') && $('espNvSave').addEventListener('click', () => this._espGuardarNuevo());

      scrim.querySelectorAll('.esp-tab').forEach(b => b.addEventListener('click', () => {
        clr(); this._espTab = b.getAttribute('data-tab'); this._renderEsp();
      }));

      $('espBonoSel') && $('espBonoSel').addEventListener('change', e => { clr(); this._espBonoIdx = parseInt(e.target.value, 10); this._renderEsp(); });
      $('espCampSel') && $('espCampSel').addEventListener('change', e => { clr(); this._espCampIdx = parseInt(e.target.value, 10); this._renderEsp(); });
      $('espRegalo') && $('espRegalo').addEventListener('change', e => { clr(); this._espRegalo = e.target.checked; this._renderEsp(); });

      scrim.querySelectorAll('.esp-paybtn').forEach(b => b.addEventListener('click', () => {
        this._espMetodo = b.getAttribute('data-m'); this._renderEsp();
      }));

      // v1.1.75 — Descuento manual. Input: actualización en sitio (sin re-render,
      // para no perder el foco). Modo/toggle/limpiar: re-render completo.
      const espDiscInput = $('espDiscInput');
      if (espDiscInput) {
        espDiscInput.addEventListener('input', e => {
          let v = parseFloat(e.target.value) || 0;
          if (v < 0) v = 0;
          if (this._espDiscMode === 'pct' && v > 100) v = 100;
          this._espDisc = v;
          this._espUpdateEmit();
        });
      }
      scrim.querySelectorAll('.ks-disc-mbtn[data-espmode]').forEach(b => b.addEventListener('click', () => {
        const nuevo = b.getAttribute('data-espmode');
        if (nuevo === this._espDiscMode) return;
        this._espDiscMode = nuevo;
        if (nuevo === 'pct' && this._espDisc > 100) this._espDisc = 100;
        this._renderEsp();
      }));
      $('espDiscToggle') && $('espDiscToggle').addEventListener('click', () => { this._espDiscOpen = true; this._renderEsp(); });
      $('espDiscClear') && $('espDiscClear').addEventListener('click', () => { this._espDisc = 0; this._espDiscOpen = false; this._espDiscMode = 'pct'; this._renderEsp(); });

      $('espMsgAct') && $('espMsgAct').addEventListener('click', () => {
        const a = this._espMsg && this._espMsg.accion;
        this._espMsg = null;
        if (a && a.tipo === 'prime') this._espTab = 'prime';
        this._renderEsp();
      });

      $('espEmit') && $('espEmit').addEventListener('click', () => this._espEmitir());
    }

    _renderEspCli(clientes) {
      const scrim = this.shadowRoot.getElementById('espScrim');
      if (!scrim) return;
      const wrap = scrim.querySelector('#espCliResults');
      if (!wrap) return;
      if (!clientes || !clientes.length) { wrap.innerHTML = ''; return; }
      this._espUltimosCli = clientes;
      wrap.innerHTML = `<div class="esp-cli-results">${clientes.map((c, i) => `
        <div class="esp-cli-item" data-idx="${i}">
          <div class="esp-cli-name">${esc(c.nombreCompleto || c.nombre || 'Sin nombre')}</div>
          <div class="esp-cli-sub">${esc(c.telefono || '')}${c.email ? ' · ' + esc(c.email) : ''}</div>
        </div>`).join('')}</div>`;
      wrap.querySelectorAll('.esp-cli-item').forEach(it => it.addEventListener('click', () => {
        this._espSelectCliente(this._espUltimosCli[parseInt(it.getAttribute('data-idx'), 10)]);
      }));
    }

    _espSelectCliente(c) {
      if (!c) return;
      this._espCliente = { contactId: c.contactId || '', nombre: c.nombreCompleto || c.nombre || '', telefono: c.telefono || '', email: c.email || '' };
      this._espNuevoAbierto = false;
      this._renderEsp();
    }

    _espGuardarNuevo() {
      const scrim = this.shadowRoot.getElementById('espScrim');
      if (!scrim) return;
      const elNom = scrim.querySelector('#espNvNombre');
      const nombre = (elNom?.value || '').trim();
      // Guardamos lo escrito por si la creación falla y hay que repintar el form.
      this._espNvDraft = {
        nombre,
        apellido: (scrim.querySelector('#espNvApellido')?.value || '').trim(),
        telefono: (scrim.querySelector('#espNvTel')?.value || '').trim(),
        email: (scrim.querySelector('#espNvEmail')?.value || '').trim()
      };
      if (!nombre) { if (elNom) { elNom.style.borderColor = '#d9a54d'; elNom.focus(); } return; }
      this._sendToPage('espCrearCliente', this._espNvDraft);
    }

    _onEspClienteCreado(data) {
      if (data && data.ok && data.cliente) {
        this._espNvDraft = {};
        this._espSelectCliente(data.cliente);
      } else {
        this._espMsg = { tipo: 'warn', texto: 'No se ha podido guardar el cliente. Revisa los datos e inténtalo de nuevo.' };
        this._renderEsp();
      }
    }

    _onEspData(p) {
      this._espData = { config: p.config || null, servicios: p.servicios || [], campaigns: p.campaigns || [] };
      if (this.shadowRoot.getElementById('espScrim') && !this._espNuevoAbierto) this._renderEsp();
    }

    _espPrecioActual() {
      const d = this._espData; if (!d) return 0;
      if (this._espTab === 'prime') return (d.config && typeof d.config.primeAnnualPrice === 'number') ? d.config.primeAnnualPrice : 0;
      if (this._espTab === 'bono') { const s = (d.servicios || [])[this._espBonoIdx]; return s ? (s.precioBonoCalculado || 0) : 0; }
      if (this._espTab === 'tarjeta') { const c = (d.campaigns || [])[this._espCampIdx]; return c ? (c.promoPrice || 0) : 0; }
      return 0;
    }

    // v1.1.75 — Descuento manual del operador. Calcado de _calcDescuento (cobro
    // normal) pero sobre el precio de la pestaña activa (sin promo encadenada:
    // ESPECIALES no tiene descuento promocional de servicio). Modo % o €.
    _espCalcDescuento() {
      const subtotal = Math.round((this._espPrecioActual() || 0) * 100) / 100;
      const v = Math.max(0, Number(this._espDisc) || 0);
      let discEur, discPct;
      if (this._espDiscMode === 'eur') {
        discEur = Math.min(v, subtotal);                                   // no más que el subtotal
        discPct = subtotal > 0 ? Math.round((discEur / subtotal) * 10000) / 100 : 0;
      } else {
        discPct = Math.min(100, v);
        discEur = Math.round(subtotal * discPct) / 100;
      }
      const neto = Math.max(0, Math.round((subtotal - discEur) * 100) / 100);
      return { subtotal, discPct, discEur, neto };
    }

    // v1.1.75 — Actualiza SOLO el botón y la línea de resultado sin re-render
    // (para no perder el foco del input mientras se teclea el descuento),
    // igual que _updateTotal hace en el cobro normal.
    _espUpdateEmit() {
      const scrim = this.shadowRoot.getElementById('espScrim');
      if (!scrim) return;
      const precio = this._espPrecioActual();
      const { discEur, neto } = this._espCalcDescuento();
      const hayDesc = discEur > 0;
      const btn = scrim.querySelector('#espEmit');
      if (btn && !this._espEmitiendo) {
        btn.innerHTML = precio > 0 ? `Emitir y cobrar · ${hayDesc ? neto : precio}€` : 'Emitir y cobrar';
      }
      const res = scrim.querySelector('#espDiscResult');
      if (res) {
        res.innerHTML = hayDesc
          ? `Cobrará <b style="color:var(--ks-ink)">${neto}€</b> · antes <span style="text-decoration:line-through">${precio}€</span>`
          : '';
      }
    }

    _espPuedeEmitir() {
      if (this._espEmitiendo) return false;
      if (!this._espCliente || !this._espCliente.contactId) return false;
      if (this._espTab === 'prime') return true;
      if (this._espTab === 'bono') return this._espBonoIdx >= 0 && !!((this._espData && this._espData.servicios) || [])[this._espBonoIdx];
      if (this._espTab === 'tarjeta') return this._espCampIdx >= 0 && !!((this._espData && this._espData.campaigns) || [])[this._espCampIdx];
      return false;
    }

    _espEmitir() {
      if (!this._espPuedeEmitir()) return;
      this._espMsg = null;
      const cli = this._espCliente;
      const base = { contactId: cli.contactId, clientName: cli.nombre, buyerEmail: cli.email || '', buyerPhone: cli.telefono || '', metodoPago: this._espMetodo };
      // v1.1.75 — Descuento manual: se manda el NETO ya calculado + el token
      // (mismo formato exacto que el cobro normal). El backend clampa a [0..base].
      const { discPct, discEur, neto } = this._espCalcDescuento();
      if (discEur > 0) {
        base.importeNeto = neto;
        base.descripcionExtra = this._espDiscMode === 'eur'
          ? `🏷️ Descuento -${discEur}€`
          : `🏷️ Descuento -${discPct}% (-${discEur}€)`;
      }
      const scrim = this.shadowRoot.getElementById('espScrim');

      if (this._espTab === 'prime') {
        this._espEmitiendo = true; this._renderEsp();
        this._sendToPage('emitirPrime', { payload: base });

      } else if (this._espTab === 'bono') {
        const s = this._espData.servicios[this._espBonoIdx];
        this._espEmitiendo = true; this._renderEsp();
        this._sendToPage('emitirBono', { payload: Object.assign({}, base, { serviceSetupUid: s.setupUid }) });

      } else if (this._espTab === 'tarjeta') {
        const c = this._espData.campaigns[this._espCampIdx];
        const payload = Object.assign({}, base, { campaignId: c._id, isGift: this._espRegalo });
        if (this._espRegalo && scrim) {
          const rn = scrim.querySelector('#espRecNombre'), re = scrim.querySelector('#espRecEmail');
          payload.recipientName = (rn?.value || '').trim();
          payload.recipientEmail = (re?.value || '').trim();
          payload.recipientMessage = (scrim.querySelector('#espRecMsg')?.value || '').trim();
          if (!payload.recipientName || !payload.recipientEmail) {
            if (!payload.recipientName && rn) { rn.style.borderColor = '#d9a54d'; rn.focus(); }
            if (!payload.recipientEmail && re) { re.style.borderColor = '#d9a54d'; if (payload.recipientName) re.focus(); }
            return;
          }
        }
        this._espEmitiendo = true; this._renderEsp();
        this._sendToPage('emitirTarjeta', { payload });
      }
    }

    _onEspEmitido(tipo, data) {
      this._espEmitiendo = false;
      const nom = (this._espCliente && this._espCliente.nombre ? this._espCliente.nombre.split(/\s+/)[0] : 'el cliente');
      if (data && data.success) {
        const label = { bono: 'El bono', prime: 'La tarjeta PRIME', tarjeta: 'La tarjeta' }[tipo] || 'El producto';
        this._espMsg = { tipo: 'ok', texto: `¡Listo! ${label} ya está activa para ${nom}.` };
        this._renderEsp();
        clearTimeout(this._espCloseTimer);
        this._espCloseTimer = setTimeout(() => this._closeEspeciales(), 1700);
        return;
      }
      if (data && data.needsPrime) {
        this._espMsg = {
          tipo: 'warn',
          texto: `Los bonos son un detalle para socios del Club PRIME, y ${nom} todavía no forma parte. Puedes darle de alta la tarjeta PRIME y, ya dentro, ofrecerle el bono.`,
          accion: { label: 'Dar de alta PRIME', tipo: 'prime' }
        };
      } else if (data && data.alreadyHasVoucher) {
        const svc = (this._espData && this._espData.servicios[this._espBonoIdx] && this._espData.servicios[this._espBonoIdx].label) || 'ese servicio';
        this._espMsg = { tipo: 'warn', texto: `${nom} ya tiene un bono en marcha de ${svc}. Cuando lo termine, podrás ofrecerle uno nuevo.` };
      } else if (data && data.alreadyActive) {
        this._espMsg = { tipo: 'warn', texto: `${nom} ya es socio del Club PRIME, no hace falta activarla de nuevo.` };
      } else {
        this._espMsg = { tipo: 'warn', texto: 'No se ha podido completar la venta. Inténtalo de nuevo en un momento.' };
      }
      this._renderEsp();
    }
  }

  if (!customElements.get('recepcion-pro-cms')) customElements.define('recepcion-pro-cms', RecepcionProCMS);
})();
