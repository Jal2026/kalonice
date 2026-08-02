// =====================================================
// KAMISUITE - Page Code: Nueva Recepción PRO (CMS-first)
// =====================================================
// VERSION: 1.0.34
// FECHA: 1 de agosto de 2026
// ARCHIVO: page code de la página de la NUEVA Recepción PRO
//
// v1.0.34: + POPUP ALMACÉN (widget v1.1.76). Import de listarConsumibles,
//          tirarPapelera y registrarMovimiento (con alias
//          registrarMovimientoStock, porque registrarMovimiento ya está
//          ocupado por los movimientos de CAJA de cashRegisterLogic) de
//          stockLogic.web v1.0.2.
//          Tres handlers y tres cases nuevos:
//            'getAlmacenConsumibles' → 'almacenData'
//            'almacenPapelera'       → 'almacenAccion'  (bote terminado)
//            'almacenSacar'          → 'almacenAccion'  (APERTURA_MANUAL)
//          Ninguna de las dos acciones relee la lista: el widget se
//          actualiza con los contadores que devuelve el backend.
//          Cambio ADITIVO: no se toca ningún handler existente.
// v1.0.33: + Fondo inicial EDITABLE desde el arqueo. Import
//          setOpeningBalance de cashRegisterLogic v1.1.1. Handler
//          handleCajaSetFondo (mensaje 'caja-set-fondo' → responde
//          'caja-fondo-guardado'). Fija openingBalance del día exista o
//          no la caja. Sin campos nuevos en el CMS. + 1 case.
//
// v1.0.32: + APERTURA DE CAJA (fondo inicial del día). Imports abrirCaja
//          y getFondoSugerido de cashRegisterLogic v1.1.0. Nuevos handlers:
//            · handleCheckApertura — lee SalonConfig.arqueoActivo; si el
//              módulo está activo y no hay caja hoy, responde
//              'caja-fondo-sugerido' con el fondo sugerido (fondo fijo del
//              salón / cierre de ayer / 0). Si no, 'apertura-estado'.
//            · handleAbrirCaja — llama abrirCaja con firma automática del
//              empleado logueado (recordedBy). Responde 'caja-abierta'.
//          + 2 cases nuevos ('check-apertura-caja', 'caja-abrir') y entrada
//          'caja-abrir' → 'apertura_caja' en LOG_EVENT_MAP.
//
// v1.0.31: + ESPECIALES. Enganche del modal de venta manual (PRIME / Bonos /
//          Tarjetas) con especialesVentaLogic. Nuevos handlers:
//            · espBuscarCliente / espCrearCliente — selector de cliente del
//              modal, reutilizan cacheContactos + crearContacto con canal
//              propio para no colisionar con la búsqueda del aside.
//            · getEspecialesData — config PRIME + servicios con bono +
//              campañas de tarjeta vigentes.
//            · emitirBono / emitirPrime / emitirTarjeta — emiten y cobran.
//          + imports especialesVentaLogic + productosKamisuiteLogic. + 6 cases.
//
// v1.0.30: + Puente redimensionar-fase. Nuevo handler handleRedimensionarFase
//          que llama a redimensionarFase (recepcionProLogic v1.0.39) y
//          responde al widget con 'fase-redimensionada'. Permite ajustar la
//          duración de cualquier fase ocupante de la cascada (el backend
//          desplaza las posteriores). + import redimensionarFase, + case
//          'redimensionar-fase' en el switch, + entrada en LOG_EVENT_MAP.
//          Puramente aditivo: cero cambios en el resto del page code.
//
// v1.0.29: + Puente salonNombres. Nuevo handler handleSalonNombres que
//          llama al backend existente getSalonConfig (salonConfigLogic.web,
//          NO se toca) y responde al widget con { brandName, legalName }
//          para las cabeceras del texto copiable del informe del día.
//          + import getSalonConfig, + case 'salonNombres' en el switch.
//          Puramente aditivo: cero cambios en el resto del page code.
//
// v1.0.28: Cierre de externos V2. handleCierreDia añade la llamada al
//          backend dedicado cierreExternosLogic.obtenerDatosCierreExternos
//          (lee PagoreservasExternos + cruza ExternalServices) al
//          Promise.all y transporta su resultado al widget en
//          data.externosV2. Cero cambios en las otras 5 llamadas ni en
//          el resto del page code.
//
// v1.0.27: 🧾 FACTURACIÓN — bridge a facturacionSalonLogic.web v1.0.1.
//          Tres handlers nuevos que envuelven literalmente las 3
//          funciones públicas del backend de facturación:
//            · handleObtenerDocumento(msg) → obtenerDocumentoReserva
//              Recibe { reservaId }. Responde 'documentoCita' con
//              { ok, existe, documento? }. El widget lo llama al abrir
//              el modal de cita PAGADA: si la cita ya tiene factura/
//              ticket, pinta un badge con el número y un 🔗 al PDF en
//              lugar de los botones de emisión. Permite recuperar el
//              PDF si el operador perdió la copia impresa.
//            · handleGenerarTicket(msg) → generarTicketCita
//              Recibe { reservaId }. Responde 'ticketGenerado' con
//              { ok, invoiceNumber, pdfUrl, totalAmount, ..., duplicado }.
//              Factura simplificada (F2 Verifactu). Idempotente: doble
//              click no emite dos veces.
//            · handleGenerarFactura(msg) → generarFacturaCita
//              Recibe { reservaId, vatId?, legalName? }. Responde
//              'facturaGenerada' con la misma forma. Factura completa
//              (F1 Verifactu). Si el cliente CRM no tiene CIF y no
//              se pasa vatId, el backend devuelve error; el widget
//              v1.1.56+ ya despliega su form inline para pedirlo.
//
//          3 cases nuevos en el switch:
//            · 'obtenerDocumento' → handleObtenerDocumento(msg)
//            · 'generarTicket'    → handleGenerarTicket(msg)
//            · 'generarFactura'   → handleGenerarFactura(msg)
//
//          Cero cambios en el resto del page code (cobro, descuentos,
//          extras, complementos, productos, bloqueos, login, settings,
//          F4/F5 productos custom). Puramente aditivo.
//
//          Esta versión también recoge el bump TAG cosmético de v1.0.26
//          (el TAG estaba colgado en '[RecepcionProCMS v1.0.23]' aunque
//          la cabecera dijera v1.0.25/v1.0.26 — ahora coincide con la
//          versión real).
//
// v1.0.26: 🩹 FIX cosmético TAG — la constante TAG no se había bumpeado
//          en v1.0.24 ni v1.0.25 (solo se cambió la cabecera VERSION).
//          Resultado: los logs salían como "[RecepcionProCMS v1.0.23]"
//          aunque el código fuera v1.0.25, confundiendo la trazabilidad
//          ("¿está desplegada la versión nueva o no?").
//
//          Cambio único: TAG pasa de '[RecepcionProCMS v1.0.23]' a
//          '[RecepcionProCMS v1.0.26]'. Tras publicar esta versión, los
//          logs DEBEN salir como "[RecepcionProCMS v1.0.26]". Si tras
//          publish + hard refresh siguen saliendo como v1.0.23, el
//          problema NO es del código — es de despliegue de Wix
//          (Save vs Publish, caché navegador, caché CDN).
//
//          Cero cambios funcionales. Mismo código que v1.0.25, solo se
//          actualiza el string del log.
//
// v1.0.25: F4/F5 — Auto-detección de Productos Custom del cliente al abrir
//          el modal de cobro. Complementa v1.0.24 incorporando la 3ª
//          función del backend (getProductosCustomCliente) que en la
//          versión minimalista anterior se había dejado sin usar.
//
//          1 import nuevo: getProductosCustomCliente.
//          1 handler nuevo: handleGetProductosCustom — recibe { contactId }
//            del widget al abrir el modal y devuelve { prime, bonos,
//            tarjetas } del cliente como 'productosCustomCliente'.
//          1 case nuevo en el switch: 'getProductosCustom'.
//
//          Permite que el widget v1.1.51+ pinte automáticamente los
//          bonos y tarjetas del cliente con un botón "Usar" — el operador
//          ya no tiene que recordar/escribir el código manualmente para
//          un bono que el cliente ya pagó por adelantado. El input manual
//          se mantiene como alternativa para tarjetas regalo recibidas en
//          papel (sin contactId asociado al portador).
//
// v1.0.24: F4+F5 — Productos Custom (Bonos y Tarjetas Promocionales) en
//          el cobro de la cita. Capa fina sobre el backend
//          recepcionProLogic v1.0.31.
//
//          2 imports nuevos: aplicarCanjeProducto, confirmarCanjeProducto.
//          getProductosCustomCliente NO se importa todavía: la versión 1
//          minimalista (sesión 26-jun) solo expone INPUT MANUAL de código
//          en el modal; el auto-listado de bonos/tarjetas del cliente se
//          deja para v2 cuando el flujo base esté validado en producción.
//
//          2 handlers nuevos:
//            · handleAplicarCanje(msg): envuelve aplicarCanjeProducto.
//              Recibe { reservaId, codigoProducto }. NO escribe nada en
//              CMS; solo valida y devuelve { nuevoImporte, ahorro,
//              descripcionToken, codigo, tipo, voucherId|promoCardId }
//              para que el widget repinte el modal y guarde el canje en
//              memoria local hasta el cobro.
//            · handleConfirmarCanje(msg): envuelve confirmarCanjeProducto.
//              Recibe { reservaId, codigoProducto, staff, activationMethod }.
//              Se llama TRAS reservaPagada ok desde el widget. Idempotente
//              en el backend: doble click no descuenta dos usos.
//
//          2 cases nuevos en el switch:
//            · 'aplicarCanje'   → handleAplicarCanje(msg)
//            · 'confirmarCanje' → handleConfirmarCanje(msg)
//
//          handlePagarReserva NO se toca. El widget incorpora el ahorro
//          del canje en el importeNeto + descripcionExtra que ya pasa hoy
//          a marcarPagadoReserva (parámetros v1.0.4). Cero cambios en el
//          flujo de cobro existente; F4/F5 se integran sin abrir esa
//          función crítica.
//
//          Cero cambios en el resto del page code (cobro, descuentos,
//          extras, complementos, productos, bloqueos, login, settings).
//
// v1.0.23: FIX — handleUsersActivation NO propagaba el campo timeOut del
//          backend al widget. El backend recepcionAccessLogic v1.0.4 devuelve
//          { usersActivation, timeOut } pero el page code solo reenviaba
//          usersActivation → el widget nunca recibía la duración configurada
//          en SalonConfig.timeOut y se quedaba siempre en su default de 60s.
//          Ahora reenvía timeOut (segundos, validado >0) al widget.
//
// v1.0.22: LOGIN MOVIDO AL SHADOW DOM del Custom Element. Se RETIRA toda la
//          maquinaria del iframe externo de login que NO conseguía tapar las
//          citas (vivían en el Shadow DOM del Custom Element). Eliminado:
//          LOGIN_ID (#htmlRecepcionLogin), _loginEl, sendToLogin,
//          mostrarLogin, ocultarLogin, handleLoginPin, _resetInactivity,
//          _clearInactivity, INACTIVITY_MS, el _loginEl.onMessage del onReady,
//          la rama getUsersActivation().then() del onReady y los _el.hide()/
//          show() de la v1.0.21.
//          · El page code ahora es solo PUENTE al backend recepcionAccessLogic
//            (sin cambios). Nuevos handlers que responden a mensajes del
//            widget v1.1.45 vía sendResponse:
//              · 'usersActivation' → getUsersActivation()   → 'usersActivation'
//              · 'staffLogin'      → getStaffLogin()        → 'staffLogin'
//              · 'validatePin'     → validateLoginPin()     → 'pinValidated'
//              · 'logEvent'        → registrarEvento()      (fire-and-forget)
//          · El timer de inactividad 60s YA NO vive aquí: vive en el widget
//            (detecta actividad real sobre la agenda). El page code solo
//            recibe 'login'/'timeout' por 'logEvent'.
//          · El log centralizado de acciones de NEGOCIO (LOG_EVENT_MAP +
//            _registrar) se MANTIENE intacto: el empleado activo lo conoce el
//            page code desde la validación del PIN.
//          · TODO lo demás (32 handlers de negocio + fix v1.0.19 de
//            CalendarViewSettings) intacto. El backend NO se toca.
//
// v1.0.21: El overlay de login (iframe) OCULTABA el Custom Element de
//          Recepción PRO mientras estaba activo (_el.hide()) para que sus
//          elementos sticky no se colaran por encima. SUPERADO por v1.0.22
//          (el login ya vive dentro del Shadow DOM y tapa las citas sin
//          necesidad de ocultar el Custom Element).
//
// v1.0.20: + CAPA DE ACCESO + LOG DE ACTIVIDAD (opcional por salón).
//          · Flag SalonConfig.usersActivation: si true → overlay de login
//            por PIN (HTML Component #htmlRecepcionLogin) que bloquea
//            Recepción PRO hasta identificarse. Si false → acceso directo,
//            sin overlay y sin logs (idéntico a v1.0.19).
//          · Backend nuevo recepcionAccessLogic.web (getUsersActivation,
//            getStaffLogin, validateLoginPin, registrarEvento). NO toca
//            recepcionProLogic ni ningún otro backend.
//          · Timeout de inactividad 60s → vuelve al login (evento 'timeout').
//          · Log centralizado vía LOG_EVENT_MAP (reserva, cambio_reserva,
//            cobro, acceso_arqueo, acceso_informe) — SIN tocar los handlers
//            de negocio existentes. Solo se añade una rama al inicio del
//            listener de 'recepcion-message'.
//          · TODO lo demás (incl. fix v1.0.19 de CalendarViewSettings)
//            intacto. Puramente aditivo.
//
// v1.0.19: 🎨 FIX DEFINITIVO persistencia CalendarViewSettings (color/orden
//          de columnas no se guardaba + duplicación de filas).
//          CAUSA: la fila se identificaba por _owner (memberId), pero
//          wixData.save NO permite fijar _owner (lo asigna Wix al miembro
//          que ejecuta). Cada contexto de sesión con memberId distinto
//          creaba su propia fila 'recepcionPRO-<memberId>' → se guardaba en
//          una fila y se leía de otra → los cambios no se reflejaban, y se
//          acumulaban filas duplicadas.
//          SOLUCIÓN: una sola fila por CMS (cada salón es su cuenta Wix).
//          _consolidarSettingsRow() coge la ÚLTIMA CREADA de entre todas las
//          'recepcionPRO*' (descending _createdDate) y BORRA el resto. Así
//          el sistema se auto-sana: aunque existan N filas legacy, en la
//          siguiente lectura/guardado quedan reducidas a UNA. El guardado
//          actualiza siempre esa fila por _id (nunca crea duplicados).
//          NO toca filas de otras pantallas ('mobile', 'default').
//          Import currentMember retirado (ya no se usa).
//
// v1.0.17: + handlers de BLOQUEOS PERSISTENTES (vacaciones/almuerzos/
//          descansos del staff). 3 handlers nuevos que pegan literal a
//          recepcionProLogic.web v1.0.20 (crearBloqueo, eliminarBloqueo,
//          actualizarBloqueo). 3 cases nuevos en el switch:
//            · 'crearBloqueo'      → 'bloqueoCreado'
//            · 'eliminarBloqueo'   → 'bloqueoEliminado'
//            · 'actualizarBloqueo' → 'bloqueoActualizado'
//          El widget v1.1.40 ya NO mantiene this._customBlocks en memoria;
//          los bloqueos viven en KamisuiteReservations y llegan al widget
//          por la query habitual de getReservasPorFecha.
//
// v1.0.16: + handler editarContacto + case 'editarContacto' en el switch.
//          Permite que el widget edite nombre/apellido/email/teléfono de
//          un contacto existente vía editarContacto() del backend
//          recepcionLogic.web.js (función V1, no se toca el backend).
//          Patrón copiado literal de pagecode_recepcionPRO_v2_1_5.js.
//
// v1.0.15: + handler 'agregar-servicio' (botón + Servicio adicional del
//          modal de cita). Llama al backend `agregarServicioReserva`.
//
// v1.0.14: + handler 'mover-fase'.
//
// v1.0.13: + Propagación de MISSING_VARIANT al widget. Si el backend
//          tiendaProductos.web v1.5.11+ devuelve error MISSING_VARIANT
//          (producto con variantes sin variantId), el response al
//          widget incluye `missingVariants[]` para que pueda mostrar
//          selector. Sin esto, el widget recibía un error genérico
//          y el operador no entendía por qué fallaba la venta.
//
// v1.0.12: La respuesta 'cierre-data' ahora incluye la `fecha` solicitada.
//          para que el widget (v1.1.20+) pueda descartar responses tardíos
//          de fechas ya no visibles. Bug del informe que se desincronizaba.
//
// v1.0.11: + quitar-item.
//          + case 'quitar-item' → 'item-quitado'. Permite borrar una
//          línea individual del listado de servicios del modal de cita.
//
// v1.0.10.1: log diagnóstico en vender-productos-cita. La venta de productos ahora invoca directamente
//          `venderProductosDesdeAgenda` de `tiendaProductos.web` (función
//          V1, conoce la colección y campos reales) en lugar de
//          `agregarProductoReserva` que fallaba por colección "Productos"
//          inexistente. Quitado handler 'agregar-producto', añadido
//          'vender-productos-cita'. listarProductos devuelve {ok,productos}
//          con items {id,name,sku,price,inStock} — el normalizado se hace
//          aquí en handleGetProductos.
//
// v1.0.9: ANTES DE COBRAR — handlers para los 4 botones del modal de cita.
//         · NEW imports backend recepcionProLogic v1.0.10:
//           reprogramarReserva, agregarExtraReserva,
//           agregarComplementoReserva, agregarProductoReserva.
//         · NEW import tiendaProductos: listarProductos.
//         · NEW cases: 'reprogramar-reserva' → 'reserva-reprogramada',
//           'agregar-extra' → 'extra-agregado',
//           'agregar-complemento' → 'complemento-agregado',
//           'agregar-producto' → 'producto-agregado',
//           'get-productos' → 'productos-cargados'.
//
// v1.0.8: EXTENSIÓN de citas (drag del resize handle).
//         · NEW imports: extenderReserva, quitarExtension de
//           recepcionProLogic v1.0.9.
//         · NEW handler 'extender-reserva' → invoca extenderReserva
//           y devuelve 'extension-actualizada'.
//         · NEW handler 'quitar-extension' → invoca quitarExtension
//           y devuelve 'extension-actualizada'.
//
// v1.0.7: SERVICIO A MEDIDA = reserva, NO cobro adelantado.
//         · handleServicioMedida ahora llama al backend crearReservaMedida
//           (recepcionProLogic v1.0.5). Se crea una fila en
//           KamisuiteReservations con family='medida' que se pinta en
//           el calendario. Cobro posterior (cualquier método) vía
//           tarjeta de cita normal.
//         · NEW handleGetPagoByReserva: dada una reservaId, devuelve la
//           fila de PaymentReservations asociada (bookingId KRI_<id>).
//           Lo usa el widget para mostrar el chip "con descuento" en
//           el modal de citas ya cobradas.
//         · Respuestas renombradas: 'servicio-medida-creado' (en vez de
//           '-ok'), 'pago-encontrado'.
// v1.0.6: NEW Descuento aplicado + Servicio a medida (Opción B standalone).
//         · handlePagarReserva propaga al backend 2 nuevos params opcionales:
//           importeNeto (precio ya descontado) y descripcionExtra (token
//           "🏷️ Descuento -X% (-Y€)"). Requiere recepcionProLogic >= v1.0.4.
//         · NEW handleServicioMedida: crea una fila standalone en
//           PaymentReservations vía wixData.insert directo (sin tocar el
//           pack de reservas, sin vinculación a ServiceCatalog). bookingId
//           con prefijo MEDIDA-<ts> para distinguirla. Mismo CMS y formato
//           de tokens que un cobro normal, compatible con cierre del día.
//         · NEW case 'servicio-medida' en el switch. Respuesta
//           'servicio-medida-ok' { ok, _id, importeTotal }.
// v1.0.5: NEW Cierre del día + Settings persistidos en CMS.
//         · Imports: wix-data, testCheckout (obtenerDatosCierreDia,
//           obtenerPagos), cierreLogicExtendido (obtenerDatosCierreExtendidos).
//         · Handler 'cierre-dia': llama en paralelo a obtenerDatosCierreDia,
//           obtenerPagos, obtenerDatosCierreExtendidos, calcularEfectivoEsperado
//           y getCajaDia. Devuelve 'cierre-data' con { pagos, cierreDia,
//           extendido, financiero, arqueo }. NO modifica ningún backend.
//         · Handlers 'get-settings' / 'save-settings': lectura/escritura
//           directa en CMS CalendarViewSettings (campos settingsJson + title)
//           vía wixData, sin backend nuevo. Filtra por _owner del usuario.
// v1.0.2: NEW carga y búsqueda de clientes (import recepcionLogic.web:
//         cargarTodosContactos + crearContacto). Cache en memoria +
//         filtro por nombre/email/teléfono (patrón legacy literal).
//         Mensajes: buscarCliente, crearCliente, clientesReady,
//         clientesLoading, clientesEncontrados, clienteCreado.
// v1.0.1: FIX carga de catálogo. Se pide getCatalogo en $w.onReady
//         directamente (no depender solo del 'ready' del widget, que
//         puede llegar antes de registrar el listener — race condition).
//
// PROPÓSITO:
//   Bridge entre el widget de la nueva Recepción PRO (Custom Element)
//   y el backend recepcionProLogic.web.js v1.0.0.
//
// INDEPENDIENTE del page code legacy (pagecode_recepcionPRO_v2_1_5.js).
//   No lo toca, no lo reemplaza. Convive hasta migración completa.
//
// PATRÓN (copiado literal de pagecode_recepcionPRO_v2_1_5.js):
//   - Custom Element + _el.on('recepcion-message') + sendResponse vía
//     setAttribute('response', ...).
//   - El widget escucha el atributo 'response' del Custom Element.
//
// CONTRATO DE MENSAJES (widget → page code):
//   { type: 'getCatalogo' }
//   { type: 'getReservas', fecha }
//   { type: 'crearReserva', payload:{ fecha, horaHHmm, principalSetupUid,
//        complementosSetupUid[], staffId, staffName, contactDetails{},
//        memberContactId, notas } }
//   { type: 'pagarReserva', reservaId, metodoPago, desglosemetodopago }
//   { type: 'cancelarReserva', reservaId }
//   { type: 'crearBloqueo', fechaISO, horaHHmm, duracionMin, staffId, motivo }   // v1.0.17
//   { type: 'eliminarBloqueo', id }                                              // v1.0.17
//   { type: 'actualizarBloqueo', id, fechaISO?, horaHHmm?, duracionMin?, motivo? }// v1.0.17
//
// RESPUESTAS (page code → widget) vía sendResponse(type, data):
//   'catalogoData'     { ok, servicios }
//   'reservasData'     { ok, reservas }
//   'reservaCreada'    { ok, reservaId, sessionIds, fases, precioTotal, ... }
//   'reservaPagada'    { ok, reservaId, metodoPago }
//   'reservaCancelada' { ok, reservaId, sessionesBorradas }
//   'bloqueoCreado'    { ok, bloqueoId, fechaReserva, duracionTotal, motivo, staffId }
//   'bloqueoEliminado' { ok, id }
//   'bloqueoActualizado'{ ok, id, motivo, duracionTotal, fechaReserva }
//   'error'            { message }
//
// NOTA WIX: Custom Element. NUNCA html.on('message') (no funciona en Wix).
// =====================================================

import wixData from 'wix-data';
// v1.0.6: import currentMember retirado — la fila de settings ya no se
// identifica por _owner/memberId, sino por title fijo (ver SETTINGS).

import {
  getCatalogoReserva,
  getStaffColumnas,
  crearPackReserva,
  getReservasPorFecha,
  marcarPagadoReserva,
  cancelarReserva,
  crearReservaMedida,
  extenderReserva,
  quitarExtension,
  reprogramarReserva,
  agregarExtraReserva,
  agregarComplementoReserva,
  agregarServicioReserva,
  quitarItemReserva,
  moverFase,
  redimensionarFase,
  // v1.0.17 — bloqueos persistentes
  crearBloqueo,
  eliminarBloqueo,
  actualizarBloqueo,
  // v1.0.24 — F4/F5 Productos Custom (canje de bonos y tarjetas en el cobro)
  aplicarCanjeProducto,
  confirmarCanjeProducto,
  // v1.0.25 — F4/F5 auto-detección de bonos/tarjetas del cliente al abrir modal
  getProductosCustomCliente
} from 'backend/recepcionProLogic.web';

// v1.0.10 — Productos: venta independiente (patrón V1)
import { listarProductos, venderProductosDesdeAgenda } from 'backend/tiendaProductos.web';

// Clientes: reutiliza el backend que ya usa la agenda legacy (CRM en memoria).
import { cargarTodosContactos, crearContacto, editarContacto } from 'backend/recepcionLogic.web';

// v1.0.31 — ESPECIALES: venta manual de PRIME / Bonos / Tarjetas.
import { emitirBonoManual, emitirPrimeManual, emitirTarjetaManual } from 'backend/especialesVentaLogic.web';
import { getProductosConfig, listarServiciosConBono, listarPromoCampaigns } from 'backend/productosKamisuiteLogic.web';

// Arqueo de caja: backend cashRegisterLogic. v1.1.0 añade getFondoSugerido
// y expone abrirCaja para el flujo de APERTURA de caja (fondo inicial).
import {
  calcularEfectivoEsperado,
  guardarArqueo,
  cerrarCaja,
  registrarMovimiento,
  getCajaDia,
  getFondoSugerido,
  abrirCaja,
  setOpeningBalance
} from 'backend/cashRegisterLogic.web';

// v1.0.5 — Cierre del día (panel inferior). Backends existentes, NO modificados.
import {
  obtenerDatosCierreDia,
  obtenerPagos
} from 'backend/testCheckout.web';

import {
  obtenerDatosCierreExtendidos
} from 'backend/cierreLogicExtendido.web';

// v1.0.28 — Cierre de externos V2 (backend dedicado, lee PagoreservasExternos).
import {
  obtenerDatosCierreExternos
} from 'backend/cierreExternosLogic.web';

// v1.0.20 — Capa de acceso + log de actividad (opcional por salón).
import {
  getUsersActivation,
  getStaffLogin,
  validateLoginPin,
  registrarEvento
} from 'backend/recepcionAccessLogic.web';

// v1.0.27 — Facturación del salón a sus clientes finales (Verifactu-ready).
// Bridge a facturacionSalonLogic.web.js. El widget v1.1.56+ invoca estos
// handlers desde el modal de cita PAGADA (botones 🧾 Ticket / 📄 Factura
// y badge de recuperación de PDF). Backend NO se toca.
import {
  obtenerDocumentoReserva,
  generarTicketCita,
  generarFacturaCita
} from 'backend/facturacionSalonLogic.web';

// v1.0.29 — Nombres del salón (brandName / legalName) para las cabeceras
// del texto que se copia desde el informe del día. Backend getSalonConfig
// existente en salonConfigLogic.web.js (Permissions.SiteMember). NO se toca.
import { getSalonConfig } from 'backend/salonConfigLogic.web';

// v1.0.34 — Almacén de uso en salón (popup de la papelera)
// OJO: registrarMovimiento ya está importado de cashRegisterLogic para
// los movimientos de CAJA. Aquí se trae con alias para no colisionar ni
// tocar nada de lo existente.
import {
  listarConsumibles,
  tirarPapelera,
  registrarMovimiento as registrarMovimientoStock
} from 'backend/stockLogic.web';

const TAG = '[RecepcionProCMS v1.0.34]';

// ID del Custom Element en la página (ajustar al ID real del editor Wix).
const ELEMENT_ID = '#recepcionProCMS';

let _el = null;

// Cache de clientes (patrón legacy: cargar todo una vez, filtrar en memoria)
let cacheContactos = [];
let cacheReady = false;

// ─── v1.0.22: Estado de la capa de acceso ───
// El page code solo recuerda el empleado activo (para el log de acciones de
// negocio) y el flag del salón. El timer de inactividad vive en el widget.
let _usersActivation = false; // flag SalonConfig: ¿login activo?
let _empleadoActivo = null;   // { _id, staffName, accessLevel, profileImage } o null

// v1.0.20 — Qué mensajes del widget se registran en el log de actividad,
// y con qué eventType. Lo que no esté aquí NO se registra (solo reinicia
// el timer de inactividad). Los tipos cubren el briefing: reservas, cambios
// en reservas, cobros, acceso a arqueo y acceso a informe del día.
const LOG_EVENT_MAP = {
  // reservas
  'crearReserva':          'reserva',
  'servicio-medida':       'reserva',
  // cambios en reservas
  'cancelarReserva':       'cambio_reserva',
  'reprogramar-reserva':   'cambio_reserva',
  'extender-reserva':      'cambio_reserva',
  'quitar-extension':      'cambio_reserva',
  'agregar-extra':         'cambio_reserva',
  'agregar-complemento':   'cambio_reserva',
  'agregar-servicio':      'cambio_reserva',
  'quitar-item':           'cambio_reserva',
  'mover-fase':            'cambio_reserva',
  'redimensionar-fase':    'cambio_reserva',
  // cobros
  'pagarReserva':          'cobro',
  'vender-productos-cita': 'cobro',
  // acceso a arqueo de caja
  'caja-calcular':         'acceso_arqueo',
  // v1.0.32 — apertura de caja (fondo inicial del día)
  'caja-abrir':            'apertura_caja',
  // acceso a informe / cierre del día
  'cierre-dia':            'acceso_informe'
};

// Detalle breve para el log (sin datos sensibles). Mejor esfuerzo.
function _logDetail(msg) {
  try {
    if (msg.type === 'crearReserva') {
      const p = msg.payload || {};
      const cd = p.contactDetails || {};
      const nombre = [cd.firstName, cd.lastName].filter(Boolean).join(' ');
      return nombre ? `Cliente: ${nombre}` : '';
    }
    if (msg.reservaId) return `Reserva ${String(msg.reservaId).slice(0, 8)}`;
    if (msg.fechaISO) return `Día ${msg.fechaISO}`;
    return '';
  } catch (e) {
    return '';
  }
}

// =====================================================
// ENVÍO DE RESPUESTA AL WIDGET (patrón legacy literal)
// =====================================================
function sendResponse(type, data = {}) {
  if (!_el) return;
  const payload = { type, ...data, ts: Date.now() };
  try {
    _el.setAttribute('response', JSON.stringify(payload));
  } catch (e) {
    console.error(`${TAG} ❌ setAttribute response falló:`, e);
  }
}

// =====================================================
// ESPECIALES — Venta manual de PRIME · Bonos · Tarjetas (v1.0.31)
// =====================================================
// Enganche del modal ESPECIALES del widget con especialesVentaLogic.
// El selector de cliente reutiliza cacheContactos + crearContacto, pero
// con mensajes propios (espBuscarCliente/espCrearCliente) para no pisar la
// búsqueda de clientes del aside (buscarCliente/clientesEncontrados).

// Búsqueda de cliente para el modal (misma lógica que handleBuscarCliente,
// respuesta por canal propio 'espClientesEncontrados').
function handleEspBuscarCliente(msg) {
  const searchTerm = String(msg.query || '').trim().toLowerCase();
  if (searchTerm.length < 2) { sendResponse('espClientesEncontrados', { clientes: [] }); return; }
  const searchPhone = searchTerm.replace(/[\s\-\(\)]/g, '');
  const filtered = cacheContactos.filter(c => {
    const nombre = (c.nombreCompleto || '').toLowerCase();
    const email = (c.email || '').toLowerCase();
    const telefono = (c.telefono || '').replace(/[\s\-\(\)]/g, '');
    return nombre.includes(searchTerm) || email.includes(searchTerm) || telefono.includes(searchPhone);
  });
  const limitados = filtered.slice(0, 20);
  sendResponse('espClientesEncontrados', {
    clientes: limitados,
    totalEncontrados: filtered.length,
    mostrados: limitados.length
  });
}

// Alta de cliente nuevo desde el modal ESPECIALES.
async function handleEspCrearCliente(msg) {
  try {
    const result = await crearContacto({
      nombre: msg.nombre, apellido: msg.apellido,
      telefono: msg.telefono, email: msg.email
    });
    if (result.ok && result.cliente) cacheContactos.push(result.cliente);
    sendResponse('espClienteCreado', { data: result });
  } catch (e) {
    console.error(`${TAG} ❌ espCrearCliente:`, e);
    sendResponse('espClienteCreado', { data: { ok: false, error: { message: e?.message || 'Error' } } });
  }
}

// Datos para poblar el modal: config PRIME (precio) + servicios con bono +
// campañas de tarjeta VIGENTES (active + ventana startDate/endDate).
async function handleGetEspecialesData() {
  try {
    const [rCfg, rBonos, rCamp] = await Promise.all([
      getProductosConfig(),
      listarServiciosConBono(),
      listarPromoCampaigns()
    ]);
    const ahora = Date.now();
    const campaignsVigentes = (((rCamp && rCamp.success) ? rCamp.campaigns : []) || []).filter(c => {
      if (c.active !== true) return false;
      if (c.startDate && new Date(c.startDate).getTime() > ahora) return false;
      if (c.endDate && new Date(c.endDate).getTime() < ahora) return false;
      return true;
    });
    sendResponse('especialesData', {
      config: (rCfg && rCfg.success) ? rCfg.config : null,
      servicios: (rBonos && rBonos.success) ? rBonos.servicios : [],
      campaigns: campaignsVigentes
    });
  } catch (e) {
    console.error(`${TAG} ❌ getEspecialesData:`, e);
    sendResponse('especialesData', { config: null, servicios: [], campaigns: [], error: e?.message || 'Error' });
  }
}

// ═══════════════════════════════════════════════════════════
// v1.0.34 — ALMACÉN (popup de consumo en la barra superior)
// ═══════════════════════════════════════════════════════════

async function handleAlmacenConsumibles() {
  try {
    const r = await listarConsumibles();
    sendResponse('almacenData', {
      productos: (r && r.ok) ? (r.productos || []) : [],
      error: (r && r.ok) ? null : (r?.error || 'No se pudo leer el almacén')
    });
  } catch (e) {
    console.error(`${TAG} ❌ almacenConsumibles:`, e);
    sendResponse('almacenData', { productos: [], error: e?.message || 'Error' });
  }
}

// Bote terminado: el almacén descuenta uno cerrado y abre el siguiente.
async function handleAlmacenPapelera(msg) {
  const payload = msg.payload || {};
  try {
    const data = await tirarPapelera(payload);
    sendResponse('almacenAccion', { data, productId: payload.productId });
  } catch (e) {
    console.error(`${TAG} ❌ almacenPapelera:`, e);
    sendResponse('almacenAccion', {
      data: { ok: false, productId: payload.productId, error: e?.message || 'Error' },
      productId: payload.productId
    });
  }
}

// Sacar un bote del almacén para empezarlo, sin tirar ninguno.
// Es un movimiento APERTURA · APERTURA_MANUAL: el total no cambia,
// una unidad pasa de cerrada a en uso.
async function handleAlmacenSacar(msg) {
  const payload = msg.payload || {};
  try {
    const data = await registrarMovimientoStock({
      productId: payload.productId,
      moveType: 'APERTURA',
      reason: 'APERTURA_MANUAL',
      quantity: 1,
      staffId: payload.staffId || '',
      staffName: payload.staffName || ''
    });
    sendResponse('almacenAccion', { data, productId: payload.productId });
  } catch (e) {
    console.error(`${TAG} ❌ almacenSacar:`, e);
    sendResponse('almacenAccion', {
      data: { ok: false, productId: payload.productId, error: e?.message || 'Error' },
      productId: payload.productId
    });
  }
}

async function handleEmitirBono(msg) {
  try {
    const data = await emitirBonoManual(msg.payload || {});
    sendResponse('bonoEmitido', { data });
  } catch (e) {
    console.error(`${TAG} ❌ emitirBono:`, e);
    sendResponse('bonoEmitido', { data: { success: false, error: e?.message || 'Error' } });
  }
}

async function handleEmitirPrime(msg) {
  try {
    const data = await emitirPrimeManual(msg.payload || {});
    sendResponse('primeEmitido', { data });
  } catch (e) {
    console.error(`${TAG} ❌ emitirPrime:`, e);
    sendResponse('primeEmitido', { data: { success: false, error: e?.message || 'Error' } });
  }
}

async function handleEmitirTarjeta(msg) {
  try {
    const data = await emitirTarjetaManual(msg.payload || {});
    sendResponse('tarjetaEmitido', { data });
  } catch (e) {
    console.error(`${TAG} ❌ emitirTarjeta:`, e);
    sendResponse('tarjetaEmitido', { data: { success: false, error: e?.message || 'Error' } });
  }
}

// =====================================================
// HANDLERS
// =====================================================

async function handleGetCatalogo() {
  try {
    const result = await getCatalogoReserva();
    sendResponse('catalogoData', result);
  } catch (e) {
    console.error(`${TAG} ❌ getCatalogo:`, e);
    sendResponse('catalogoData', { ok: false, error: { message: e?.message || 'Error' }, servicios: [] });
  }
}

async function handleGetStaff() {
  try {
    const result = await getStaffColumnas();
    sendResponse('staffData', result);
  } catch (e) {
    console.error(`${TAG} ❌ getStaff:`, e);
    sendResponse('staffData', { ok: false, error: { message: e?.message || 'Error' }, staff: [] });
  }
}

async function handleGetReservas(fecha) {
  try {
    const result = await getReservasPorFecha({ fecha });
    sendResponse('reservasData', result);
  } catch (e) {
    console.error(`${TAG} ❌ getReservas:`, e);
    sendResponse('reservasData', { ok: false, error: { message: e?.message || 'Error' }, reservas: [] });
  }
}

async function handleCrearReserva(payload) {
  try {
    const result = await crearPackReserva(payload || {});
    sendResponse('reservaCreada', result);
  } catch (e) {
    console.error(`${TAG} ❌ crearReserva:`, e);
    sendResponse('reservaCreada', { ok: false, error: { message: e?.message || 'Error' } });
  }
}

async function handlePagarReserva(msg) {
  try {
    const result = await marcarPagadoReserva({
      reservaId: msg.reservaId,
      metodoPago: msg.metodoPago,
      desglosemetodopago: msg.desglosemetodopago,
      importeNeto: msg.importeNeto,           // v1.0.6 — neto ya descontado
      descripcionExtra: msg.descripcionExtra  // v1.0.6 — token 🏷️ Descuento
    });
    sendResponse('reservaPagada', result);
  } catch (e) {
    console.error(`${TAG} ❌ pagarReserva:`, e);
    sendResponse('reservaPagada', { ok: false, error: { message: e?.message || 'Error' } });
  }
}

// =====================================================
// F4/F5 — PRODUCTOS CUSTOM EN EL COBRO (v1.0.24)
// =====================================================
// Dos handlers que envuelven literalmente las funciones del backend
// recepcionProLogic v1.0.31. El widget orquesta el flujo: aplicarCanje
// solo valida y calcula (sin escribir nada en CMS); confirmarCanje se
// llama TRAS reservaPagada ok, persistiendo el canje.
//
// El cálculo final del importeNeto (con el ahorro del canje restado) y
// la descripcionExtra (con el token del bono/tarjeta concatenado) los
// hace el widget al pulsar el botón de pago. handlePagarReserva sigue
// recibiendo exactamente los mismos parámetros que antes; aquí no se
// toca esa función.
// =====================================================

async function handleAplicarCanje(msg) {
  try {
    const result = await aplicarCanjeProducto({
      reservaId: msg.reservaId,
      codigoProducto: msg.codigoProducto
    });
    sendResponse('canjeAplicado', result);
  } catch (e) {
    console.error(`${TAG} ❌ aplicarCanje:`, e);
    sendResponse('canjeAplicado', { ok: false, error: { message: e?.message || 'Error' } });
  }
}

async function handleConfirmarCanje(msg) {
  try {
    const result = await confirmarCanjeProducto({
      reservaId: msg.reservaId,
      codigoProducto: msg.codigoProducto,
      staff: msg.staff,
      activationMethod: msg.activationMethod   // 'manual' | 'auto'
    });
    sendResponse('canjeConfirmado', result);
  } catch (e) {
    console.error(`${TAG} ❌ confirmarCanje:`, e);
    sendResponse('canjeConfirmado', { ok: false, error: { message: e?.message || 'Error' } });
  }
}

// v1.0.25 — F4/F5 auto-detección de bonos/tarjetas del cliente.
// El widget llama esto al abrir el modal de cobro con el contactId de la
// reserva. La respuesta contiene { prime, bonos, tarjetas } activos del
// cliente (filtrado en backend: status ACTIVO, remainingUses>0, no
// caducados). Para cliente provisional (contactId vacío) devuelve listas
// vacías y el widget cae al input manual.
async function handleGetProductosCustom(msg) {
  try {
    const result = await getProductosCustomCliente({ contactId: msg.contactId });
    sendResponse('productosCustomCliente', result);
  } catch (e) {
    console.error(`${TAG} ❌ getProductosCustom:`, e);
    sendResponse('productosCustomCliente', { ok: false, error: { message: e?.message || 'Error' } });
  }
}

// =====================================================
// FACTURACIÓN — v1.0.27
//   Bridge a facturacionSalonLogic.web v1.0.1. El backend ya hace
//   READ-MERGE-UPDATE atómico, idempotencia cruzada (una reserva = un
//   documento), numeración propia en InvoiceCounters, y persistencia
//   de CIF en CRM al emitir factura completa. Aquí solo envolvemos
//   las 3 funciones públicas con manejo de error coherente con el
//   resto de handlers del page code.
// =====================================================

async function handleObtenerDocumento(msg) {
  try {
    const result = await obtenerDocumentoReserva({ reservaId: msg.reservaId });
    sendResponse('documentoCita', result);
  } catch (e) {
    console.error(`${TAG} ❌ obtenerDocumento:`, e);
    sendResponse('documentoCita', { ok: false, error: { message: e?.message || 'Error' } });
  }
}

async function handleGenerarTicket(msg) {
  try {
    const result = await generarTicketCita({ reservaId: msg.reservaId });
    sendResponse('ticketGenerado', result);
  } catch (e) {
    console.error(`${TAG} ❌ generarTicket:`, e);
    sendResponse('ticketGenerado', { ok: false, error: { message: e?.message || 'Error' } });
  }
}

async function handleGenerarFactura(msg) {
  try {
    const result = await generarFacturaCita({
      reservaId: msg.reservaId,
      vatId: msg.vatId,
      legalName: msg.legalName
    });
    sendResponse('facturaGenerada', result);
  } catch (e) {
    console.error(`${TAG} ❌ generarFactura:`, e);
    sendResponse('facturaGenerada', { ok: false, error: { message: e?.message || 'Error' } });
  }
}

async function handleCancelarReserva(msg) {
  try {
    const result = await cancelarReserva({ reservaId: msg.reservaId });
    sendResponse('reservaCancelada', result);
  } catch (e) {
    console.error(`${TAG} ❌ cancelarReserva:`, e);
    sendResponse('reservaCancelada', { ok: false, error: { message: e?.message || 'Error' } });
  }
}

// =====================================================
// BLOQUEOS PERSISTENTES (v1.0.17)
//   3 handlers que envuelven literalmente las 3 funciones nuevas del
//   backend recepcionProLogic.web v1.0.20. El widget v1.1.40 envía estos
//   mensajes en lugar de gestionar bloqueos en memoria local.
// =====================================================

async function handleCrearBloqueo(msg) {
  try {
    const result = await crearBloqueo({
      fechaISO: msg.fechaISO,
      horaHHmm: msg.horaHHmm,
      duracionMin: msg.duracionMin,
      staffId: msg.staffId,
      motivo: msg.motivo
    });
    sendResponse('bloqueoCreado', result);
  } catch (e) {
    console.error(`${TAG} ❌ crearBloqueo:`, e);
    sendResponse('bloqueoCreado', { ok: false, error: { message: e?.message || 'Error' } });
  }
}

async function handleEliminarBloqueo(msg) {
  try {
    const result = await eliminarBloqueo({ id: msg.id });
    sendResponse('bloqueoEliminado', result);
  } catch (e) {
    console.error(`${TAG} ❌ eliminarBloqueo:`, e);
    sendResponse('bloqueoEliminado', { ok: false, error: { message: e?.message || 'Error' } });
  }
}

async function handleActualizarBloqueo(msg) {
  try {
    const result = await actualizarBloqueo({
      id: msg.id,
      fechaISO: msg.fechaISO,
      horaHHmm: msg.horaHHmm,
      duracionMin: msg.duracionMin,
      motivo: msg.motivo
    });
    sendResponse('bloqueoActualizado', result);
  } catch (e) {
    console.error(`${TAG} ❌ actualizarBloqueo:`, e);
    sendResponse('bloqueoActualizado', { ok: false, error: { message: e?.message || 'Error' } });
  }
}

// =====================================================
// CLIENTES (patrón legacy literal: cargar todo + filtrar en memoria)
// =====================================================

async function cargarCacheClientes() {
  sendResponse('clientesLoading', { message: 'Cargando base de clientes…' });
  try {
    const result = await cargarTodosContactos();
    if (result.ok) {
      cacheContactos = result.clientes || [];
      cacheReady = true;
      sendResponse('clientesReady', { total: cacheContactos.length });
    } else {
      sendResponse('error', { message: 'Error cargando base de clientes' });
    }
  } catch (e) {
    console.error(`${TAG} ❌ cargarCacheClientes:`, e);
    sendResponse('error', { message: 'Error cargando base de clientes' });
  }
}

function handleBuscarCliente(msg) {
  const searchTerm = String(msg.query || '').trim().toLowerCase();
  if (searchTerm.length < 2) { sendResponse('clientesEncontrados', { clientes: [] }); return; }
  const searchPhone = searchTerm.replace(/[\s\-\(\)]/g, '');
  const filtered = cacheContactos.filter(c => {
    const nombre = (c.nombreCompleto || '').toLowerCase();
    const email = (c.email || '').toLowerCase();
    const telefono = (c.telefono || '').replace(/[\s\-\(\)]/g, '');
    return nombre.includes(searchTerm) || email.includes(searchTerm) || telefono.includes(searchPhone);
  });
  const limitados = filtered.slice(0, 20);
  sendResponse('clientesEncontrados', {
    clientes: limitados,
    totalEncontrados: filtered.length,
    mostrados: limitados.length
  });
}

async function handleCrearCliente(msg) {
  try {
    const result = await crearContacto({
      nombre: msg.nombre, apellido: msg.apellido,
      telefono: msg.telefono, email: msg.email
    });
    if (result.ok && result.cliente) cacheContactos.push(result.cliente);
    sendResponse('clienteCreado', { data: result });
  } catch (e) {
    console.error(`${TAG} ❌ crearCliente:`, e);
    sendResponse('clienteCreado', { data: { ok: false, error: { message: e?.message || 'Error' } } });
  }
}

// v1.0.16 — Editar contacto existente. Patrón copiado literal de
// pagecode_recepcionPRO_v2_1_5.js (V1). La función editarContacto
// del backend recepcionLogic.web.js ya existe desde V1.
async function handleEditarContacto(msg) {
  try {
    const result = await editarContacto({
      contactId: msg.contactId,
      nombre: msg.nombre,
      apellido: msg.apellido,
      email: msg.email,
      telefono: msg.telefono
    });
    if (result.ok && result.cliente) {
      const idx = cacheContactos.findIndex(c => c.contactId === msg.contactId);
      if (idx >= 0) cacheContactos[idx] = result.cliente;
    }
    sendResponse('contactoEditado', { data: result });
  } catch (e) {
    console.error(`${TAG} ❌ editarContacto:`, e);
    sendResponse('contactoEditado', { data: { ok: false, error: { message: e?.message || 'Error' } } });
  }
}

// =====================================================
// ARQUEO DE CAJA (firmas copiadas literal del legacy)
// =====================================================

async function handleCajaCalcular(msg) {
  try {
    const [calcResult, cajaResult] = await Promise.all([
      calcularEfectivoEsperado({ fechaISO: msg.fechaISO }),
      getCajaDia({ fechaISO: msg.fechaISO })
    ]);
    if (!calcResult.ok) { sendResponse('caja-data', { data: { error: calcResult.error } }); return; }
    sendResponse('caja-data', { data: { ...calcResult, registro: cajaResult?.registro || null } });
  } catch (e) {
    console.error(`${TAG} ❌ caja-calcular:`, e);
    sendResponse('caja-data', { data: { error: e.message } });
  }
}

async function handleCajaGuardar(msg) {
  try {
    const result = await guardarArqueo({ fechaISO: msg.fechaISO, countedCash: msg.countedCash, countBreakdown: msg.countBreakdown || '', differenceNote: msg.differenceNote || '', closedBy: msg.closedBy || '' });
    sendResponse('caja-guardada', result);
  } catch (e) { sendResponse('caja-guardada', { ok: false, error: e.message }); }
}

async function handleCajaCerrar(msg) {
  try {
    await guardarArqueo({ fechaISO: msg.fechaISO, countedCash: msg.countedCash, countBreakdown: msg.countBreakdown || '', differenceNote: msg.differenceNote || '', closedBy: msg.closedBy || '' });
    const result = await cerrarCaja({ fechaISO: msg.fechaISO, closedBy: msg.closedBy || '' });
    sendResponse('caja-cerrada', result);
  } catch (e) { sendResponse('caja-cerrada', { ok: false, error: e.message }); }
}

async function handleCajaMovimiento(msg) {
  try {
    const result = await registrarMovimiento({ fechaISO: msg.fechaISO, movementType: msg.movementType, amount: msg.amount, description: msg.description || '', recordedBy: msg.recordedBy || '', registerId: msg.registerId || '' });
    sendResponse('caja-movimiento-ok', result);
  } catch (e) { sendResponse('caja-movimiento-ok', { ok: false, error: e.message }); }
}

// =====================================================
// APERTURA DE CAJA (fondo inicial del día)  v1.0.32
//   El arqueo es un MÓDULO OPCIONAL. handleCheckApertura decide, leyendo
//   SalonConfig.arqueoActivo, si el widget debe ofrecer la apertura:
//     - arqueoActivo !== true            → 'apertura-estado' { activo:false }
//     - activo pero ya hay caja hoy      → 'apertura-estado' { activo:true, hayCaja:true }
//     - activo y sin caja hoy            → 'caja-fondo-sugerido' { fondoSugerido, origen, fechaOrigen }
//   El flag se comprueba en el backend/page code; el widget solo reacciona.
// =====================================================

async function handleCheckApertura(msg) {
  try {
    const cfgRes = await getSalonConfig();
    const arqueoActivo = !!(cfgRes && cfgRes.ok && cfgRes.config && cfgRes.config.arqueoActivo === true);
    if (!arqueoActivo) { sendResponse('apertura-estado', { activo: false }); return; }

    const caja = await getCajaDia({ fechaISO: msg.fechaISO });
    if (caja && caja.registro) { sendResponse('apertura-estado', { activo: true, hayCaja: true }); return; }

    const sug = await getFondoSugerido({ fechaISO: msg.fechaISO });
    sendResponse('caja-fondo-sugerido', {
      fechaISO: msg.fechaISO,
      fondoSugerido: sug && sug.ok ? Number(sug.fondoSugerido || 0) : 0,
      origen: sug && sug.origen ? sug.origen : 'cero',
      fechaOrigen: sug && sug.fechaOrigen ? sug.fechaOrigen : ''
    });
  } catch (e) {
    console.error(`${TAG} ❌ check-apertura-caja:`, e);
    sendResponse('apertura-estado', { activo: false, error: e.message });
  }
}

async function handleAbrirCaja(msg) {
  try {
    // Firma automática con el empleado logueado (patrón v1.0.22). Si no hay
    // capa de acceso activa, cae al recordedBy que mande el widget (vacío ok).
    const recordedBy = (_empleadoActivo && _empleadoActivo.staffName) || msg.recordedBy || '';
    const result = await abrirCaja({
      fechaISO: msg.fechaISO,
      openingBalance: Number(msg.openingBalance || 0),
      recordedBy
    });
    sendResponse('caja-abierta', result);
  } catch (e) {
    console.error(`${TAG} ❌ caja-abrir:`, e);
    sendResponse('caja-abierta', { ok: false, error: e.message });
  }
}

// v1.0.33 — Fija el fondo inicial del día desde el arqueo (exista o no la
// caja). Usa setOpeningBalance (openingBalance de CashRegister). Sin campos
// nuevos en el CMS.
async function handleCajaSetFondo(msg) {
  try {
    const result = await setOpeningBalance({
      fechaISO: msg.fechaISO,
      openingBalance: Number(msg.openingBalance || 0)
    });
    sendResponse('caja-fondo-guardado', result);
  } catch (e) {
    console.error(`${TAG} ❌ caja-set-fondo:`, e);
    sendResponse('caja-fondo-guardado', { ok: false, error: e.message });
  }
}

// =====================================================
// CIERRE DEL DÍA (panel inferior consultable)  v1.0.5
//   Llama en paralelo a:
//     - obtenerDatosCierreDia (testCheckout): externos + productos
//     - obtenerPagos (testCheckout):          pagos reales del día
//     - obtenerDatosCierreExtendidos (cierreLogicExtendido): IVA + clientes + POS
//     - calcularEfectivoEsperado + getCajaDia (cashRegisterLogic): arqueo embebido
//   Devuelve 'cierre-data' agregado. NO ejecuta NINGUNA acción destructiva.
// =====================================================

async function handleCierreDia(msg) {
  const fechaISO = msg.fechaISO;
  if (!fechaISO) { sendResponse('cierre-data', { fecha: '', data: { error: 'Falta fechaISO' } }); return; }
  try {
    const [dia, pagos, extendido, esp, caja, externosV2] = await Promise.all([
      obtenerDatosCierreDia({ fechaISO }).catch(e => ({ ok: false, error: e?.message || 'err' })),
      obtenerPagos({ fechaISO }).catch(e => ({ ok: false, error: e?.message || 'err' })),
      obtenerDatosCierreExtendidos({ fechaISO }).catch(e => ({ ok: false, error: e?.message || 'err' })),
      calcularEfectivoEsperado({ fechaISO }).catch(e => ({ ok: false, error: e?.message || 'err' })),
      getCajaDia({ fechaISO }).catch(e => ({ registro: null })),
      obtenerDatosCierreExternos({ fechaISO }).catch(e => ({ ok: false, error: e?.message || 'err' }))
    ]);
    // Construcción del bloque 'arqueo' (solo lectura)
    let arqueo = null;
    if (esp?.ok || caja?.registro) {
      const reg = caja?.registro || null;
      arqueo = {
        status: reg?.status || null,
        fondoInicial: Number(esp?.fondoInicial || 0),
        cobrosEfectivo: Number(esp?.cobrosEfectivo || 0),
        entradas: Number(esp?.entradas || 0),
        salidas: Number(esp?.salidas || 0),
        retiradas: Number(esp?.retiradas || 0),
        esperado: Number(esp?.esperado || 0),
        contado: reg ? Number(reg.countedCash || 0) : 0,
        nota: reg?.differenceNote || '',
        sinEspecificar: Number(esp?.sinEspecificar || 0)
      };
    }
    // Financiero: total cobrado real desde la lista de pagos no cancelados
    const pagosList = (pagos?.pagos || pagos?.data || []);
    const pagosNoCanc = pagosList.filter(p => p.status !== 'CANCELADO' && p.status !== 'cancelado');
    const totalReal = pagosNoCanc.reduce((s, p) => s + Number(p.importeTotal || p.precioTotal || 0), 0);
    const financiero = { total: totalReal, transacciones: pagosNoCanc.length };

    sendResponse('cierre-data', {
      fecha: fechaISO,
      data: {
        pagos: pagosList,
        cierreDia: dia && dia.ok ? dia : (dia || {}),
        extendido: extendido && extendido.ok ? extendido : (extendido || {}),
        externosV2: externosV2 && externosV2.ok ? (externosV2.externos || null) : null,
        financiero,
        arqueo
      }
    });
  } catch (e) {
    console.error(`${TAG} ❌ cierre-dia:`, e);
    sendResponse('cierre-data', { fecha: fechaISO, data: { error: e?.message || 'Error' } });
  }
}

// =====================================================
// SETTINGS (CalendarViewSettings) — CMS directo, sin backend  v1.0.6
//   v1.0.6 (19 Jun 2026): la fila de settings se identifica por un TITLE
//   FIJO, NO por _owner. Cada salón es una cuenta Wix independiente con su
//   CMS único, así que CalendarViewSettings contiene una sola configuración
//   (la del salón). Filtrar por _owner causaba un bug: wixData.save NO
//   permite fijar _owner (Wix lo asigna al miembro que ejecuta), así que si
//   el memberId de ejecución no coincidía con el _owner de la fila, la
//   búsqueda no la encontraba → se guardaba en una fila distinta (o se
//   creaba una nueva) mientras la lectura seguía trayendo la original →
//   los cambios de color/posición NO se reflejaban (se guardaban en otra
//   fila). Ahora: una sola fila identificada por title 'recepcionPRO'.
//   Estructura del CMS: { _id, title, settingsJson }
// =====================================================

const SETTINGS_TITLE = 'recepcionPRO';

// Devuelve la fila ÚNICA de settings: la ÚLTIMA CREADA de entre todas las
// filas 'recepcionPRO*' (canónica + legacy 'recepcionPRO-<memberId>'), y de
// paso BORRA todas las demás para que nunca queden duplicados. Si no hay
// ninguna, devuelve null. NO toca filas de otras pantallas ('mobile',
// 'default', etc.) — solo las que empiezan por 'recepcionPRO'.
async function _consolidarSettingsRow() {
  const r = await wixData.query('CalendarViewSettings')
    .startsWith('title', SETTINGS_TITLE)
    .descending('_createdDate')   // la última creada primero
    .limit(50)
    .find({ suppressAuth: true });

  const items = r.items || [];
  if (items.length === 0) return null;

  // La fila válida = la última creada.
  const principal = items[0];

  // Borrar el resto (duplicados / legacy). No-blocking: si alguno falla,
  // seguimos con la principal.
  for (let i = 1; i < items.length; i++) {
    try {
      await wixData.remove('CalendarViewSettings', items[i]._id, { suppressAuth: true });
      console.log(`${TAG} 🧹 Settings duplicado borrado: ${items[i].title} (${items[i]._id})`);
    } catch (e) {
      console.warn(`${TAG} ⚠️ No se pudo borrar duplicado ${items[i]._id}: ${e.message}`);
    }
  }

  return principal;
}

async function handleGetSettings() {
  try {
    const row = await _consolidarSettingsRow();
    if (row) {
      let parsed = null;
      try { parsed = JSON.parse(row.settingsJson || '{}'); } catch (e) { parsed = null; }
      sendResponse('settings-data', { settings: parsed });
    } else {
      sendResponse('settings-data', { settings: null });
    }
  } catch (e) {
    console.error(`${TAG} ❌ get-settings:`, e);
    sendResponse('settings-data', { settings: null });
  }
}

async function handleSaveSettings(settings) {
  try {
    // Consolidar primero (deja una sola fila: la última creada) y actualizarla.
    const existing = await _consolidarSettingsRow();

    const payload = {
      title: SETTINGS_TITLE,
      settingsJson: JSON.stringify(settings || {})
    };
    if (existing && existing._id) payload._id = existing._id;

    await wixData.save('CalendarViewSettings', payload, { suppressAuth: true });
  } catch (e) {
    console.error(`${TAG} ❌ save-settings:`, e);
  }
}

// =====================================================
// SERVICIO A MEDIDA (reserva en calendario, NO cobro adelantado)  v1.0.7
//   Llama al backend crearReservaMedida (recepcionProLogic.web v1.0.5).
//   Inserta fila en KamisuiteReservations con family='medida'.
//   El cobro se hace después abriendo la cita en el calendario.
// =====================================================

async function handleServicioMedida(msg) {
  try {
    const result = await crearReservaMedida({
      fechaISO: msg.fechaISO,
      horaHHmm: msg.horaHHmm,
      duracionMin: msg.duracionMin,
      staffId: msg.staffId,
      staffName: msg.staffName,
      descripcion: msg.descripcion,
      precio: msg.precio,
      contactDetails: msg.contactDetails || {},
      memberContactId: msg.memberContactId || ''
    });
    sendResponse('servicio-medida-creado', result);
  } catch (e) {
    console.error(`${TAG} ❌ servicio-medida:`, e);
    sendResponse('servicio-medida-creado', { ok: false, error: { message: e?.message || 'Error' } });
  }
}

// =====================================================
// GET PAGO BY RESERVA (para chip de descuento en tarjeta cobrada)  v1.0.7
//   Devuelve la fila de PaymentReservations cuyo bookingId == KRI_<reservaId>.
//   Lectura barata, una sola query.
// =====================================================

async function handleGetPagoByReserva(msg) {
  try {
    if (!msg.reservaId) { sendResponse('pago-encontrado', { ok: false, pago: null }); return; }
    const bookingIdKey = 'KRI_' + msg.reservaId;
    const r = await wixData.query('PaymentReservations')
      .eq('bookingId', bookingIdKey)
      .limit(1)
      .find({ suppressAuth: true });
    if (r.items && r.items.length) {
      sendResponse('pago-encontrado', { ok: true, pago: r.items[0] });
    } else {
      sendResponse('pago-encontrado', { ok: true, pago: null });
    }
  } catch (e) {
    console.error(`${TAG} ❌ get-pago-by-reserva:`, e);
    sendResponse('pago-encontrado', { ok: false, pago: null, error: e?.message || 'Error' });
  }
}

// v1.0.8 — Extensión de citas (drag del resize handle en el calendario)
async function handleExtenderReserva(msg) {
  try {
    const reservaId = msg?.reservaId;
    const minutosExtra = msg?.minutosExtra;
    if (!reservaId) {
      sendResponse('extension-actualizada', { ok: false, error: 'reservaId requerido' });
      return;
    }
    const r = await extenderReserva({ reservaId, minutosExtra });
    sendResponse('extension-actualizada', r);
  } catch (e) {
    console.error(`${TAG} ❌ extender-reserva:`, e);
    sendResponse('extension-actualizada', { ok: false, error: e?.message || 'Error' });
  }
}

async function handleQuitarExtension(msg) {
  try {
    const reservaId = msg?.reservaId;
    if (!reservaId) {
      sendResponse('extension-actualizada', { ok: false, error: 'reservaId requerido' });
      return;
    }
    const r = await quitarExtension({ reservaId });
    sendResponse('extension-actualizada', r);
  } catch (e) {
    console.error(`${TAG} ❌ quitar-extension:`, e);
    sendResponse('extension-actualizada', { ok: false, error: e?.message || 'Error' });
  }
}

// v1.0.9 — handlers "antes de cobrar"
async function handleReprogramarReserva(msg) {
  try {
    const { reservaId, nuevaFechaISO } = msg || {};
    const r = await reprogramarReserva({ reservaId, nuevaFechaISO });
    sendResponse('reserva-reprogramada', r);
  } catch (e) {
    console.error(`${TAG} ❌ reprogramar-reserva:`, e);
    sendResponse('reserva-reprogramada', { ok: false, error: e?.message || 'Error' });
  }
}

// v1.0.14 — drag&drop por fase (mover una fase a otra hora/staff)
async function handleMoverFase(msg) {
  try {
    const { reservaId, faseIndex, nuevoStartISO, nuevoStaffId } = msg || {};
    const r = await moverFase({ reservaId, faseIndex, nuevoStartISO, nuevoStaffId });
    sendResponse('fase-movida', r);
  } catch (e) {
    console.error(`${TAG} ❌ mover-fase:`, e);
    sendResponse('fase-movida', { ok: false, error: e?.message || 'Error' });
  }
}

// v1.0.30 — redimensionar la duración de una fase (empuja las posteriores)
async function handleRedimensionarFase(msg) {
  try {
    const { reservaId, faseIndex, nuevaDur } = msg || {};
    const r = await redimensionarFase({ reservaId, faseIndex, nuevaDur });
    sendResponse('fase-redimensionada', r);
  } catch (e) {
    console.error(`${TAG} ❌ redimensionar-fase:`, e);
    sendResponse('fase-redimensionada', { ok: false, error: e?.message || 'Error' });
  }
}

async function handleAgregarExtra(msg) {
  try {
    const { reservaId, importe, descripcion } = msg || {};
    const r = await agregarExtraReserva({ reservaId, importe, descripcion });
    sendResponse('extra-agregado', r);
  } catch (e) {
    console.error(`${TAG} ❌ agregar-extra:`, e);
    sendResponse('extra-agregado', { ok: false, error: e?.message || 'Error' });
  }
}

async function handleAgregarComplemento(msg) {
  try {
    const { reservaId, setupUid } = msg || {};
    const r = await agregarComplementoReserva({ reservaId, setupUid });
    sendResponse('complemento-agregado', r);
  } catch (e) {
    console.error(`${TAG} ❌ agregar-complemento:`, e);
    sendResponse('complemento-agregado', { ok: false, error: e?.message || 'Error' });
  }
}

// v1.0.15 — añadir servicio principal NUEVO al final de la cita existente
async function handleAgregarServicio(msg) {
  try {
    const { reservaId, setupUid, precioOverride } = msg || {};
    const r = await agregarServicioReserva({ reservaId, setupUid, precioOverride });
    sendResponse('servicio-agregado', r);
  } catch (e) {
    console.error(`${TAG} ❌ agregar-servicio:`, e);
    sendResponse('servicio-agregado', { ok: false, error: e?.message || 'Error' });
  }
}

async function handleVenderProductosCita(msg) {
  try {
    const { reservaId, contactId, contactName, contactEmail, contactPhone, items, metodoPago } = msg || {};
    // v1.0.10.1 — log diagnóstico: ver qué llega del widget al backend
    console.log(`${TAG} 🛍 vender-productos-cita: contactId=${contactId} reservaId=${reservaId} metodoPago=${metodoPago}`);
    console.log(`${TAG} 🛍 items recibidos:`, JSON.stringify(items));
    if (!contactId) {
      sendResponse('productos-venta-result', { ok: false, error: 'Cliente no identificado. No se pueden vender productos a un cliente provisional.' });
      return;
    }
    if (!Array.isArray(items) || items.length === 0) {
      sendResponse('productos-venta-result', { ok: false, error: 'Carrito vacío' });
      return;
    }
    const res = await venderProductosDesdeAgenda({
      contactId,
      contactName: contactName || '',
      contactEmail: contactEmail || '',
      contactPhone: contactPhone || '',
      items,
      metodoPago: metodoPago || 'Efectivo',
      currency: 'EUR',
      packId: reservaId || '',
      bookingId: ''
    });
    console.log(`${TAG} 🛍 venderProductosDesdeAgenda result:`, JSON.stringify(res));
    if (res?.ok) {
      sendResponse('productos-venta-result', { ok: true, payload: res });
    } else if (res?.error === 'MISSING_VARIANT') {
      // v1.0.13 — Producto con variantes no resueltas; propagar al widget
      sendResponse('productos-venta-result', {
        ok: false,
        error: 'MISSING_VARIANT',
        message: res.message || 'Selecciona variante',
        missingVariants: res.missingVariants || []
      });
    } else {
      sendResponse('productos-venta-result', { ok: false, error: res?.error || 'Error registrando venta' });
    }
  } catch (e) {
    console.error(`${TAG} ❌ vender-productos-cita:`, e);
    sendResponse('productos-venta-result', { ok: false, error: e?.message || 'Error' });
  }
}

async function handleGetProductos() {
  try {
    const r = await listarProductos();
    // Patrón V1: r = { ok, productos: [...] } con items {id, name, sku, price, inStock}
    const productos = (r && r.ok && Array.isArray(r.productos)) ? r.productos
                    : Array.isArray(r) ? r
                    : (r?.productos || r?.items || []);
    sendResponse('productos-cargados', { ok: true, productos });
  } catch (e) {
    console.error(`${TAG} ❌ get-productos:`, e);
    sendResponse('productos-cargados', { ok: false, productos: [], error: e?.message || 'Error' });
  }
}

// v1.0.11 — quitar item individual del modal de cita
async function handleQuitarItem(msg) {
  try {
    const { reservaId, itemIndex } = msg || {};
    const r = await quitarItemReserva({ reservaId, itemIndex });
    sendResponse('item-quitado', r);
  } catch (e) {
    console.error(`${TAG} ❌ quitar-item:`, e);
    sendResponse('item-quitado', { ok: false, error: e?.message || 'Error' });
  }
}

// =====================================================
// v1.0.22 — CAPA DE ACCESO + LOG DE ACTIVIDAD
// Opcional por salón (SalonConfig.usersActivation). Aislada del negocio:
// si está desactivada, Recepción PRO funciona exactamente igual que antes.
//
// v1.0.22: El login se ha MOVIDO al Shadow DOM del Custom Element
//   (recepcionProCMS_widget v1.1.45) para que el overlay tape las citas.
//   Se RETIRA por completo la maquinaria del iframe externo
//   (#htmlRecepcionLogin, postMessage, _loginEl, mostrarLogin, ocultarLogin,
//   sendToLogin, _el.hide()/show()). El page code ahora solo hace de PUENTE
//   hacia el backend recepcionAccessLogic.web (que NO se toca): responde a
//   los mensajes que el widget envía por el bridge 'recepcion-message' y
//   contesta vía sendResponse (atributo 'response' del Custom Element).
// =====================================================

// v1.0.29 — Responde al widget con brandName y legalName del salón, para
// las cabeceras del texto copiable del informe del día (bloque productivo
// usa brandName; bloque financiero usa legalName). Patrón puente idéntico
// a handleUsersActivation. Ante fallo devuelve cadenas vacías: el widget
// compone igualmente el texto sin cabecera de nombre.
async function handleSalonNombres() {
  try {
    const r = await getSalonConfig();
    const cfg = (r && r.ok && r.config) ? r.config : {};
    sendResponse('salonNombres', {
      brandName: cfg.brandName || '',
      legalName: cfg.legalName || ''
    });
  } catch (e) {
    console.warn(`${TAG} ⚠️ getSalonConfig falló:`, e?.message);
    sendResponse('salonNombres', { brandName: '', legalName: '' });
  }
}

// Responde al widget si el salón tiene la capa de acceso activa.
async function handleUsersActivation() {
  try {
    const r = await getUsersActivation();
    _usersActivation = !!(r && r.usersActivation);
    // v1.0.23 — propagar timeOut (segundos de inactividad) del backend al
    // widget. Sin esto el widget nunca recibía el valor y se quedaba en su
    // default de 60s aunque SalonConfig.timeOut tuviera otro número.
    const timeOut = (r && Number.isFinite(Number(r.timeOut)) && Number(r.timeOut) > 0) ? Number(r.timeOut) : null;
    sendResponse('usersActivation', { usersActivation: _usersActivation, timeOut });
  } catch (e) {
    // Si falla, acceso directo (capa desactivada).
    console.warn(`${TAG} ⚠️ getUsersActivation falló, acceso directo:`, e?.message);
    _usersActivation = false;
    sendResponse('usersActivation', { usersActivation: false, timeOut: null });
  }
}

// Devuelve al widget las tarjetas de empleado para el login.
async function handleStaffLogin() {
  try {
    const staffRes = await getStaffLogin();
    sendResponse('staffLogin', { staff: staffRes && staffRes.success ? staffRes.staff : [] });
  } catch (e) {
    console.error(`${TAG} ❌ getStaffLogin:`, e);
    sendResponse('staffLogin', { staff: [] });
  }
}

// Valida el PIN tecleado en el widget y responde el resultado.
async function handleValidatePin(msg) {
  try {
    const res = await validateLoginPin(msg.staffId, msg.pin);
    if (!res || !res.success) {
      sendResponse('pinValidated', { valid: false, needsSetup: res?.needsSetup || false });
      return;
    }
    if (!res.valid) {
      sendResponse('pinValidated', { valid: false, needsSetup: false });
      return;
    }
    // Login correcto: guardar empleado activo en el page code (para el log
    // centralizado de acciones de negocio) y responder al widget.
    _empleadoActivo = res.staff;
    sendResponse('pinValidated', { valid: true, staff: res.staff });
  } catch (e) {
    console.error(`${TAG} ❌ validateLoginPin:`, e);
    sendResponse('pinValidated', { valid: false, needsSetup: false });
  }
}

// Registra un evento enviado explícitamente por el widget (login, timeout).
// El widget manda el empleado en el propio mensaje (su estado vive en el
// Shadow DOM). Fire-and-forget: nunca rompe el negocio.
function handleLogEvent(msg) {
  if (!_usersActivation) return;
  try {
    registrarEvento({
      staffId: msg.staffId || (_empleadoActivo && _empleadoActivo._id) || '',
      staffName: msg.staffName || (_empleadoActivo && _empleadoActivo.staffName) || '',
      accessLevel: msg.accessLevel || (_empleadoActivo && _empleadoActivo.accessLevel) || '',
      staffPhoto: msg.staffPhoto || (_empleadoActivo && _empleadoActivo.profileImage) || '',
      eventType: msg.eventType || '',
      detail: msg.detail || ''
    }).catch(() => {});
  } catch (e) {
    // silencioso: el log no debe interferir con la operación
  }
}

// Log fire-and-forget de acciones de NEGOCIO (reserva, cobro, etc.) según
// LOG_EVENT_MAP. El empleado activo lo conoce el page code desde la
// validación del PIN. Nunca rompe el negocio. Solo si la capa está activa.
function _registrar(eventType, detail = '') {
  if (!_usersActivation || !_empleadoActivo) return;
  try {
    registrarEvento({
      staffId: _empleadoActivo._id || '',
      staffName: _empleadoActivo.staffName || '',
      accessLevel: _empleadoActivo.accessLevel || '',
      staffPhoto: _empleadoActivo.profileImage || '',
      eventType,
      detail
    }).catch(() => {});
  } catch (e) {
    // silencioso: el log no debe interferir con la operación
  }
}

// =====================================================
// ON READY
// =====================================================

$w.onReady(function () {
  console.log(`${TAG} ✅ Page ready`);

  _el = $w(ELEMENT_ID);
  if (!_el) {
    console.error(`${TAG} ❌ Elemento ${ELEMENT_ID} no encontrado.`);
    return;
  }

  _el.on('recepcion-message', (event) => {
    const msg = event.detail || {};
    if (!msg.type) return;
    console.log(`${TAG} 📨 ${msg.type}`);

    // v1.0.22 — capa de acceso: el log de acciones de NEGOCIO se centraliza
    // aquí (sin tocar cada handler). El timer de inactividad ya NO vive en el
    // page code: vive en el widget (Shadow DOM), que detecta actividad real
    // y avisa de 'login'/'timeout' con 'logEvent'.
    if (_usersActivation) {
      const ev = LOG_EVENT_MAP[msg.type];
      if (ev) _registrar(ev, _logDetail(msg));
    }

    try {
      switch (msg.type) {
        case 'ready':            handleGetCatalogo(); handleGetStaff(); if (!cacheReady) cargarCacheClientes(); break;
        case 'getCatalogo':      handleGetCatalogo(); break;
        case 'getStaff':         handleGetStaff(); break;
        case 'getReservas':      handleGetReservas(msg.fecha); break;
        case 'crearReserva':     handleCrearReserva(msg.payload); break;
        case 'pagarReserva':     handlePagarReserva(msg); break;
        // v1.0.24 — F4/F5 Productos Custom (canje de bono/tarjeta en el cobro)
        case 'aplicarCanje':     handleAplicarCanje(msg); break;
        case 'confirmarCanje':   handleConfirmarCanje(msg); break;
        // v1.0.25 — F4/F5 auto-detección de bonos/tarjetas del cliente al abrir modal
        case 'getProductosCustom': handleGetProductosCustom(msg); break;
        case 'cancelarReserva':  handleCancelarReserva(msg); break;
        // v1.0.27 — Facturación del salón a sus clientes finales
        case 'obtenerDocumento': handleObtenerDocumento(msg); break;
        case 'generarTicket':    handleGenerarTicket(msg); break;
        case 'generarFactura':   handleGenerarFactura(msg); break;
        case 'buscarCliente':    handleBuscarCliente(msg); break;
        case 'crearCliente':     handleCrearCliente(msg); break;
        case 'editarContacto':   handleEditarContacto(msg); break;
        case 'clientesReady':    if (cacheReady) sendResponse('clientesReady', { total: cacheContactos.length }); break;
        // v1.0.31 — ESPECIALES (venta manual PRIME/Bonos/Tarjetas)
        case 'espBuscarCliente':  handleEspBuscarCliente(msg); break;
        case 'espCrearCliente':   handleEspCrearCliente(msg); break;
        case 'getEspecialesData': handleGetEspecialesData(); break;
        case 'emitirBono':        handleEmitirBono(msg); break;
        case 'emitirPrime':       handleEmitirPrime(msg); break;
        case 'emitirTarjeta':     handleEmitirTarjeta(msg); break;
        case 'caja-calcular':    handleCajaCalcular(msg); break;
        case 'caja-guardar':     handleCajaGuardar(msg); break;
        case 'caja-cerrar':      handleCajaCerrar(msg); break;
        case 'caja-movimiento':  handleCajaMovimiento(msg); break;
        // v1.0.32 — apertura de caja (fondo inicial del día)
        case 'check-apertura-caja': handleCheckApertura(msg); break;
        case 'caja-abrir':          handleAbrirCaja(msg); break;
        // v1.0.33 — fijar fondo inicial editable desde el arqueo
        case 'caja-set-fondo':      handleCajaSetFondo(msg); break;
        case 'cierre-dia':       handleCierreDia(msg); break;
        case 'get-settings':     handleGetSettings(); break;
        case 'save-settings':    handleSaveSettings(msg.settings); break;
        case 'servicio-medida':  handleServicioMedida(msg); break;
        case 'get-pago-by-reserva': handleGetPagoByReserva(msg); break;
        case 'extender-reserva': handleExtenderReserva(msg); break;
        case 'quitar-extension': handleQuitarExtension(msg); break;
        case 'reprogramar-reserva':  handleReprogramarReserva(msg); break;
        case 'agregar-extra':        handleAgregarExtra(msg); break;
        case 'agregar-complemento':  handleAgregarComplemento(msg); break;
        case 'agregar-servicio':     handleAgregarServicio(msg); break;
        case 'vender-productos-cita': handleVenderProductosCita(msg); break;
        case 'get-productos':        handleGetProductos(); break;
        case 'quitar-item':          handleQuitarItem(msg); break;
        case 'mover-fase':           handleMoverFase(msg); break;
        case 'redimensionar-fase':   handleRedimensionarFase(msg); break;
        // v1.0.17 — bloqueos persistentes
        case 'crearBloqueo':         handleCrearBloqueo(msg); break;
        case 'eliminarBloqueo':      handleEliminarBloqueo(msg); break;
        case 'actualizarBloqueo':    handleActualizarBloqueo(msg); break;
        // v1.0.22 — capa de acceso (login en el Shadow DOM del widget)
        case 'usersActivation':      handleUsersActivation(); break;
        case 'salonNombres':         handleSalonNombres(); break;
        case 'staffLogin':           handleStaffLogin(); break;
        case 'validatePin':          handleValidatePin(msg); break;
        case 'logEvent':             handleLogEvent(msg); break;
        // v1.0.34 — popup ALMACÉN
        case 'getAlmacenConsumibles': handleAlmacenConsumibles(); break;
        case 'almacenPapelera':       handleAlmacenPapelera(msg); break;
        case 'almacenSacar':          handleAlmacenSacar(msg); break;
        default: console.warn(`${TAG} ⚠️ Tipo desconocido: ${msg.type}`);
      }
    } catch (err) {
      console.error(`${TAG} ❌ Error handler ${msg.type}:`, err);
      sendResponse('error', { message: err?.message || 'Error inesperado' });
    }
  });

  console.log(`${TAG} 👂 Listener activo`);

  // Carga proactiva en onReady: catálogo + staff + clientes.
  handleGetCatalogo();
  handleGetStaff();
  cargarCacheClientes();

  // v1.0.22 — La capa de acceso ya NO se arranca aquí. El login vive en el
  // Shadow DOM del Custom Element (widget v1.1.45): al montar pregunta
  // 'usersActivation' y, si está activa, pinta su propio overlay y valida
  // el PIN, todo a través del bridge 'recepcion-message' / sendResponse.
  // El iframe externo #htmlRecepcionLogin queda jubilado.
});
