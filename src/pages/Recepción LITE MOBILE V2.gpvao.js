// =====================================================
// KAMISUITE — Page Code: Recepción Lite Mobile (V2 CMS-first)
// =====================================================
// VERSION: 0.3.9
// FECHA: 6 de agosto de 2026
// Página: /recepcionpromobile
// Custom Element ID en Editor: kamisuiteBookingLite (tag: kamisuite-booking-lite)
//
// Comunicación (sin cambios respecto al cableado):
//   Page → Element: el.setAttribute('response', JSON.stringify({type, ...data, ts}))
//   Element → Page: el.on('booking-message', handler)  (CustomEvent)
//
// =====================================================
// v0.3.9 — ARMADO MÚLTIPLE: handler 'agregar-servicio'
// =====================================================
//   Pareja del widget v0.6.0. Permite meter varios servicios en UNA sola
//   cita (madre + hijo + hija), con un único cobro y cada servicio
//   pintado como su propio bloque en el calendario.
//
//   La primera línea la crea 'crear-reserva' (crearPackReserva). Las
//   siguientes llegan por 'agregar-servicio' y se resuelven con
//   agregarServicioReserva, el MISMO backend que usa la cadena del
//   Desktop v1.1.81. Nombres de mensaje idénticos a los del Desktop.
//
//   Cero cambios en backend: agregarServicioReserva (recepcionProLogic
//   v1.0.43+) ya acepta varianteSel y complementosSetupUid.
//
// =====================================================
// v0.3.8 — BUG RAÍZ: los mensajes al widget se pisaban entre sí
// =====================================================
//   Encontrado en la consola del navegador (6-ago-2026 02:36). El canal
//   Page → Element es un ÚNICO atributo ('response'). Dos setAttribute en
//   el mismo tick = el segundo machaca al primero y el widget solo ve el
//   último. Prueba: tras cada uno de los 12 reintentos de 'ready', el
//   widget logueaba "👥 Cache clientes: 0" (2º mensaje) y NUNCA
//   "🎯 Init:" (1º mensaje).
//
//   Es el bug que llevábamos toda la sesión persiguiendo. Antes de v0.3.7
//   los 12,5 s del volcado de contactos separaban 'init-data' de
//   'contactos-cache-ready' y el init sobrevivía por pura lentitud; al
//   quitar el volcado quedaron en el mismo tick y el canal se rompió
//   siempre. El cuelgue "aleatorio" original era el mismo mecanismo con
//   otros pares de mensajes.
//
//   FIX: sendResponse encola y drena con 60 ms entre envíos. Un
//   setAttribute por tick. Ningún mensaje puede pisar a otro. Firma
//   idéntica: ningún handler cambia.
//
// =====================================================
// v0.3.7 — FUERA el volcado de contactos: búsqueda server-side
// =====================================================
//   PROBLEMA MEDIDO (logs producción KALÓNICE 6-ago-2026 02:18):
//     02:18:00.679  👂 Listener activo
//     02:18:00.984  🎯 Init OK: 3 staff · 129 servicios
//     02:18:01.177  Cargando TODOS los contactos...   ← 5 páginas
//     02:18:13.453  📅 2026-08-06: 54 packs           ← 12,5 s DESPUÉS
//     02:18:14.428  👥 Cache de clientes lista: 4619
//     02:18:18.954  📅 2026-08-07: 30 packs           ← preload aún más tarde
//   El `await cargarTodosContactos()` de handleReady dejaba la cola de
//   mensajes del custom element parada 12,5 segundos. La agenda del día
//   NO se pintaba hasta que terminaba el volcado, pese a que
//   getReservasPorFecha tarda 0,3 s. `cargarCacheContactosBackground` se
//   llamaba "background" pero no lo era.
//
//   Contexto de uso (Jal, 6-ago-2026): Lite Mobile se usa en sesiones
//   cortas desde el móvil, a menudo solo de consulta. Cada regreso a la
//   app recarga la página, así que ese coste se pagaba una y otra vez.
//   Descartada la caché en CMS (duplicar el CRM = desincronización
//   permanente).
//
//   CAMBIOS:
//   1) handleReady YA NO llama a cargarCacheContactosBackground(). Esa
//      función y toda la caché en memoria (_cacheContactos, _cacheReady,
//      _cacheLoading) se eliminan. El import de cargarTodosContactos
//      desaparece; `crearContacto` de recepcionLogic se mantiene.
//   2) handleBuscarCliente pasa a ASÍNCRONA y consulta el backend NUEVO
//      `contactSearchLogic.buscarContactosRapido({ query })`, que
//      pregunta a Wix CRM solo por lo tecleado (startsWith sobre
//      info.name.first, info.name.last, info.phones.phone e
//      info.emails.email). ~200-300 ms por búsqueda, sin volcado.
//   3) handleReady envía 'contactos-cache-ready' INMEDIATAMENTE tras
//      'init-data'. El widget usa ese mensaje para poner
//      _cacheContactosReady = true y habilitar el input del buscador
//      (que hasta entonces sale deshabilitado con "Cargando clientes…").
//      Como ya no hay caché que esperar, el input está operativo desde
//      el primer segundo. CERO CAMBIOS EN EL WIDGET gracias a esto.
//   4) ensureContactId y handleCrearContacto dejan de hacer push a la
//      caché (ya no existe). El contacto recién creado es encontrable
//      por el buscador de inmediato, porque se consulta el CRM vivo.
//
//   LIMITACIÓN ACEPTADA (decisión de producto de Jal): el buscador pasa
//   de "contiene" a "empieza por". Teclear "gonz" encuentra a "María
//   González" (se consulta también el apellido); teclear "zalez" ya no.
//   Los nombres acentuados requieren teclear menos letras: "Jos"
//   encuentra "José", "Jose" no.
//
//   CERO CAMBIOS en: widget kamisuiteBookingLite, contrato de mensajes,
//   backend recepcionProLogic v1.0.49, backend recepcionLogic (intacto,
//   lista negra §19), reservas, bloqueos, settings, pre-carga.
//
// =====================================================
// v0.3.6 — handleReady IDEMPOTENTE + guarda de reentrada del cache
// =====================================================
//   PAREJA OBLIGATORIA del widget kamisuiteBookingLite v0.5.1, que
//   introduce un retry loop de 'ready' cada 700 ms (hasta 12 intentos)
//   para resolver el cuelgue aleatorio en "Cargando agenda…".
//
//   POR QUÉ ESTE PAGE CODE TIENE QUE CAMBIAR TAMBIÉN:
//   En v0.3.5 cada mensaje 'ready' recibido dispara un handleReady
//   completo: getStaffColumnas + getCatalogoReserva y, a continuación,
//   cargarCacheContactosBackground() → cargarTodosContactos(), que en
//   KALÓNICE son 5 páginas de 1.000 y 4.619 contactos, ~12 s de backend.
//   Verificado en los logs de producción del 6-ago-2026 01:06: los dos
//   handleReady solapados (kickoff proactivo + evento del CE) provocaron
//   DOS cargas completas de 4.619 contactos en paralelo:
//     01:06:34.479  Cargando TODOS los contactos...  → 4.619
//     01:06:38.240  Cargando TODOS los contactos...  → 4.619
//   Con el retry del widget y sin este fix, cada reintento lanzaría otra
//   tanda: se cambiaría un cuelgue por una tormenta de backend.
//
//   CAMBIOS QUIRÚRGICOS:
//   1) handleReady idempotente. Si _staff y _catalogo ya están en memoria
//      (de una invocación anterior de esta misma carga de página),
//      reenvía 'init-data' al instante con lo cacheado y sale — sin tocar
//      el backend. Solo la PRIMERA invocación consulta getStaffColumnas
//      y getCatalogoReserva. Nueva variable de módulo _catalogo y flag
//      _initListo.
//   2) Guarda contra invocaciones concurrentes: _initEnCurso. Si dos
//      'ready' llegan mientras la primera tanda de queries está en vuelo,
//      la segunda no relanza nada; la respuesta 'init-data' de la primera
//      llegará igual al widget (el retry del widget se corta solo al
//      recibirla).
//   3) cargarCacheContactosBackground con guarda de reentrada
//      (_cacheLoading). Si el cache ya está listo, reenvía
//      'contactos-cache-ready' al widget sin volver a llamar al backend.
//      Si está cargándose, no hace nada.
//   4) TAG corregido: la constante decía '[BookingLitePage v0.3.3]' desde
//      hace dos versiones, así que TODOS los logs de Google Cloud han
//      estado reportando una versión desplegada falsa. Ahora v0.3.6.
//
//   CERO CAMBIOS en: contrato de mensajes, backend recepcionProLogic
//   v1.0.49, backend recepcionLogic, handleGetSettings/handleSaveSettings
//   (fuente única desde Desktop, intacta desde v0.3.5), reservas,
//   bloqueos, contactos, pre-carga y cualquier otro handler.
//
// =====================================================
// v0.3.5 — Fuente ÚNICA de settings: Desktop manda, Lite Mobile lee
// =====================================================
//   · Antes: Lite Mobile leía/escribía su propia fila de CalendarViewSettings
//     (title 'recepcionLiteMobile-<memberId>', filtro por _owner). Esto
//     rompía la coherencia entre surfaces: el orden de columnas, la
//     visibilidad y los colores que el operador configuraba en Recepción
//     PRO Desktop NUNCA llegaban a Lite Mobile, porque cada surface
//     consultaba una fila distinta del CMS. Como consecuencia, la vista
//     mobile arrancaba con defaults del widget (todo el staff visible,
//     orden `order` de StaffConfig, colores de la paleta STAFF_COLORS)
//     ignorando cualquier personalización del salón.
//   · Ahora: handleGetSettings lee la MISMA fila que el pagecode Desktop
//     (`title = 'recepcionPRO'`) mediante el patrón `_leerFilaSettingsDesktop`
//     — copia literal de `_consolidarSettingsRow` de
//     pagecode_recepcionProCMS v1.0.25 líneas 790-815, con una diferencia
//     intencionada: NO borra duplicados. Desktop es la fuente autorizada
//     de escritura y ya se encarga de consolidar. Lite Mobile solo lee.
//   · Nueva constante `SETTINGS_TITLE = 'recepcionPRO'` (mismo valor que
//     Desktop). Nueva función `_leerFilaSettingsDesktop`. `_getMemberId`
//     se conserva porque `handleSaveSettings` (código muerto — el widget
//     kamisuiteBookingLite v0.4.0 no envía 'save-settings' en ningún
//     flujo, verificado) sigue usándolo. Si en el futuro un widget activa
//     escritura, lo hará en su fila propia 'recepcionLiteMobile-...' para
//     NO ensuciar la fila canónica del Desktop.
//   · Efecto: cualquier cambio de orden/visibilidad/color hecho por el
//     operador en Recepción PRO Desktop se refleja instantáneamente en
//     Lite Mobile en el siguiente `get-settings`. Una sola configuración
//     por salón, coherente entre surfaces.
//   · Cero cambios en: widget kamisuiteBookingLite v0.4.0 (recibe el mismo
//     shape en 'settings-data'), backend recepcionProLogic v1.0.36 (no
//     toca CalendarViewSettings directamente), pagecode Desktop v1.0.25
//     (fuente única de escritura, intacto). Cero cambios en contrato de
//     mensajes, cero cambios en otros handlers.
//
// =====================================================
// v0.3.4 — Fix cliente provisional: NO ensureContactId cuando esProvisional
// =====================================================
//   · Pareja del widget kamisuiteBookingLite v0.4.0 (Punto 3).
//   · BUG DE COMPORTAMIENTO en v0.3.3: aunque el widget marcase el flag
//     `esProvisional:true` en el mensaje 'crear-reserva', handleCrearReserva
//     seguía llamando a ensureContactId(...) ANTES de invocar
//     crearPackReserva. Como ensureContactId (línea ≈285) llama a
//     crearContacto cuando hay firstName/phone/email presentes en
//     `contactDetails`, el pagecode terminaba CREANDO un contacto real
//     en el CRM para cada cliente provisional. Contradictorio con la
//     intención del flujo: los provisionales son de paso, anónimos, no
//     se persisten en Wix CRM. El backend crearPackReserva v1.0.6+ ya
//     salta ensureContactInCRM cuando llega esProvisional:true, pero
//     el pagecode le anticipaba (creaba el contacto antes de pasarle
//     el mensaje al backend, así que el memberContactIdFinal enviado
//     al motor era el nuevo contactId real — ensuciando el CRM y
//     rompiendo la semántica del flujo).
//   · FIX: si esProvisional:true, saltar ensureContactId por completo
//     y forzar memberContactIdFinal = '' antes de llamar al backend.
//     Cambio quirúrgico en handleCrearReserva (rama de creación),
//     cero impacto en el flujo normal (cliente real + cliente nuevo).
//   · Sin cambios en ningún otro handler, en el contrato de mensajes,
//     ni en ningún otro export/case del switch. Cero cambios en el
//     backend recepcionProLogic ni en ninguna otra pieza del sistema.
//
// =====================================================
// v0.3.3 — Bloqueos persistentes
// =====================================================
//   · 3 handlers nuevos: handleCrearBloqueo, handleEliminarBloqueo,
//     handleActualizarBloqueo. Copia LITERAL del patrón del page code
//     desktop V2 (pagecode_recepcionProCMS v1.0.17) traspasado en el
//     documento técnico de bloqueos del 15-jun-2026.
//   · Backend: recepcionProLogic.web v1.0.20 (desplegado en producción).
//     Las funciones insertan/borran/actualizan filas en KamisuiteReservations
//     con family:'BLOQUEO' que el motor público (widgetPublicoLogic v0.6.2)
//     ya respeta automáticamente como bloqueos efectivos.
//   · Cases nuevos en el switch: 'crearBloqueo', 'eliminarBloqueo',
//     'actualizarBloqueo'.
//   · Respuestas: 'bloqueoCreado', 'bloqueoEliminado', 'bloqueoActualizado'.
//
// =====================================================
// v0.3.2 — Cancelar reserva
// =====================================================
//   · Nuevo handler 'cancelar-reserva' → llama a cancelarReserva
//     (recepcionProLogic v1.0.18). Devuelve 'reserva-cancelada'.
//     Mismo patrón que pagecode_recepcionProCMS v1.0.15 líneas 260-268.
//
// =====================================================
// v0.3.1 — Settings (CalendarViewSettings) añadidos
// =====================================================
//   · Handler 'get-settings' + response 'settings-data', copia literal
//     del patrón pagecode_recepcionProCMS v1.0.15 líneas 436-453.
//   · Handler 'save-settings' (mismo patrón, líneas 455-474).
//   · Lee/escribe settings por usuario (filtrado por _owner) en CMS
//     CalendarViewSettings. Estructura: {_id, _owner, title, settingsJson}.
//     settingsJson contiene staffConfig {[wixResourceId]:{visible, color,
//     position}}, e intervalo, rowHeight, etc.
//   · El widget consume staffConfig.color para pintar dots y bloques,
//     staffConfig.visible/position para columnas. Mismo contrato V1.
//
// =====================================================
// CAMBIO MAYOR v0.3.0 — Migración V1 → V2 (CMS-first)
// =====================================================
//   · Backend único: recepcionProLogic.web (v1.0.18) para catálogo, staff,
//     reservas del día y creación de packs.
//   · Reutilizado literal: recepcionLogic.web (cargarTodosContactos +
//     crearContacto).
//   · ELIMINADOS imports V1: calendarioVista.web, simplesLogic.web,
//     coloracionLogic.web, tratamientosLogic.web,
//     serviceCatalogLogic.getCatalogoMobile.
//   · Reservas con fases: getReservasPorFecha devuelve cada pack con
//     array fases[]. Se reenvía intacto al widget. El widget V2 itera
//     fases ocupantes y salta PROCESO (ocupa:false).
//   · Catálogo CMS-first: getCatalogoReserva entrega cada servicio
//     principal con su array complementos[] y variantes[] inline.
//   · Identidad: setupUid (no serviceIdWix).
//   · Reserva: handleCrearReserva colapsa router por family a una única
//     llamada a crearPackReserva.
//   · Handler get-service-options ELIMINADO (addons inline en el catálogo).
//   · origenRecepcion: true propagado → dispara centralita de comunicaciones.
//   · ensureContactId conservado (patrón producción PRO).
//
// CONTRATO DE MENSAJES (widget → page code):
//   { type: 'ready' }
//   { type: 'get-reservas-dia', fecha }
//   { type: 'preload-reservas', fechaBase, dias }
//   { type: 'buscar-cliente', query }
//   { type: 'crear-contacto', nombre, apellido, telefono, email }
//   { type: 'crear-reserva',
//        principalSetupUid, complementosSetupUid[],
//        fechaISO, horaHHmm, empleadoId, staffName?,
//        contactDetails{}, memberContactId?, notas?, esProvisional? }
//   { type: 'get-settings' }
//   { type: 'save-settings', settings }
//
// RESPUESTAS (page code → widget) vía sendResponse(type, data):
//   'init-data'              { staff[], catalogo[] }
//   'reservas-dia'           { fecha, reservas[] }    // shape V2: con fases[]
//   'reservas-rango'         { porFecha:{[fecha]:reservas[]} }
//   'contactos-cache-ready'  { total }
//   'clientes-encontrados'   { clientes, total, cacheReady }
//   'contacto-creado'        { data }
//   'reserva-creada'         { ok, reservaId, ... }
//   'settings-data'          { settings }            // null si no hay aún
//   'error'                  { message }
//
// NOTA WIX: Custom Element. NUNCA html.on('message') (no funciona en Wix).
// =====================================================

import wixData from 'wix-data';
import { currentMember } from 'wix-members';

import {
  getCatalogoReserva,
  getStaffColumnas,
  getReservasPorFecha,
  crearPackReserva,
  cancelarReserva,
  crearBloqueo,
  eliminarBloqueo,
  actualizarBloqueo,
  // v0.3.9 — ARMADO MÚLTIPLE: añade un servicio a una reserva ya creada.
  // Mismo backend que usa Recepción PRO Desktop para su cadena v1.1.81.
  agregarServicioReserva
} from 'backend/recepcionProLogic.web';

// v0.3.7 — cargarTodosContactos YA NO se importa: el volcado completo
// desaparece. `crearContacto` sigue viniendo de recepcionLogic (intacto).
import { crearContacto } from 'backend/recepcionLogic.web';

// v0.3.7 — Backend NUEVO de búsqueda puntual contra Wix CRM.
// Archivo aditivo: no toca recepcionLogic.web.js (lista negra §19).
import { buscarContactosRapido } from 'backend/contactSearchLogic.web';

// v0.3.7 — TAG actualizado.
const TAG = '[BookingLitePage v0.3.9]';
const PRELOAD_BATCH = 5;

let _el = null;
let _staff = [];

// v0.3.6 — Estado del init, para hacer handleReady idempotente frente al
// retry de 'ready' del widget v0.5.1+.
//   _catalogo     : catálogo cacheado de esta carga de página.
//   _initListo    : true cuando staff + catálogo ya se obtuvieron una vez.
//   _initEnCurso  : true mientras la primera tanda de queries está en vuelo.
// v0.3.7 — ELIMINADOS _cacheContactos, _cacheReady y _cacheLoading: ya no
//   existe caché de contactos en memoria.
let _catalogo = [];
let _initListo = false;
let _initEnCurso = false;

// =====================================================
// ENVÍO AL WIDGET — COLA SERIALIZADA (v0.3.8)
// =====================================================
// BUG RAÍZ ENCONTRADO (consola del navegador, 6-ago-2026 02:36):
//   El canal Page → Element es UN ÚNICO atributo ('response') del custom
//   element. Wix no entrega cada setAttribute por separado: si se hacen
//   dos en el mismo tick, el segundo MACHACA al primero y el custom
//   element solo llega a ver el último valor.
//
//   Prueba en consola: tras cada 'ready', el page code enviaba
//   'init-data' e inmediatamente después 'contactos-cache-ready'. El
//   widget logueaba SIEMPRE "👥 Cache clientes: 0 disponibles" (el
//   segundo) y NUNCA "🎯 Init:" (el primero). Doce veces seguidas,
//   una por reintento.
//
//   ESTE ES EL BUG ORIGINAL DE TODA LA SAGA. Antes de v0.3.7, entre
//   'init-data' y 'contactos-cache-ready' mediaban los 12,5 s del volcado
//   de contactos: esa lentitud era lo que separaba ambos mensajes y hacía
//   que el 'init-data' sobreviviera. Al eliminar el volcado en v0.3.7,
//   los dos envíos quedaron en el mismo tick y el canal se rompió del
//   todo. El cuelgue "aleatorio" que veníamos persiguiendo era el mismo
//   mecanismo: cualesquiera dos mensajes que cayeran demasiado juntos
//   se pisaban.
//
// SOLUCIÓN: cola FIFO drenada con separación temporal. Un setAttribute
//   cada SEND_GAP_MS. Ningún mensaje puede machacar a otro,
//   independientemente de cuántos se encolen ni desde qué handler.
//   El campo `ts` garantiza además que dos mensajes de contenido
//   idéntico no disparen la guarda `oldVal === newVal` del
//   attributeChangedCallback del widget.
//
// CERO CAMBIOS para el resto del código: la firma de sendResponse es la
//   misma, todos los handlers siguen llamándola igual.
// =====================================================

// Separación mínima entre dos setAttribute consecutivos. 60 ms es
// conservador: imperceptible para el operador y sobrado para que Wix
// propague el atributo al custom element entre uno y otro.
const SEND_GAP_MS = 60;

const _outQueue = [];
let _draining = false;

function _drainQueue() {
  if (!_outQueue.length) { _draining = false; return; }
  _draining = true;
  const payload = _outQueue.shift();
  try {
    _el.setAttribute('response', JSON.stringify(payload));
  } catch (e) {
    console.error(`${TAG} ❌ setAttribute response falló (${payload?.type}):`, e?.message);
  }
  setTimeout(_drainQueue, SEND_GAP_MS);
}

function sendResponse(type, data = {}) {
  if (!_el) return;
  _outQueue.push({ type, ...data, ts: Date.now() });
  if (!_draining) _drainQueue();
}

function addDaysISO(iso, delta) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// =====================================================
// INIT: staff + catálogo en paralelo (V2)
// =====================================================
async function handleReady() {
  // v0.3.6 — IDEMPOTENTE. El widget v0.5.1 reenvía 'ready' cada 700 ms
  // hasta recibir 'init-data' (resuelve el cuelgue de "Cargando agenda…"
  // cuando el primer dispatchEvent cae antes de que este listener exista).
  // Sin las dos guardas siguientes, cada reintento repetiría dos queries
  // al backend y una carga completa de 4.619 contactos.

  // Caso 1: ya tenemos los datos de esta carga de página → reenvío directo.
  if (_initListo) {
    console.log(`${TAG} ♻️ 'ready' repetido: reenvío init-data cacheado (${_staff.length} staff · ${_catalogo.length} servicios)`);
    sendResponse('init-data', { staff: _staff, catalogo: _catalogo });
    sendResponse('contactos-cache-ready', { total: 0 });
    return;
  }

  // Caso 2: la primera tanda de queries está en vuelo → no relanzar nada.
  // Cuando termine enviará 'init-data' y el retry del widget se cortará solo.
  if (_initEnCurso) {
    console.log(`${TAG} ⏳ 'ready' repetido mientras init en curso: ignorado`);
    return;
  }

  _initEnCurso = true;
  console.log(`${TAG} 📱 CE listo. Cargando datos iniciales en paralelo…`);
  try {
    const [staffRes, catalogoRes] = await Promise.all([
      getStaffColumnas(),
      getCatalogoReserva()
    ]);

    if (!staffRes?.ok) {
      _initEnCurso = false;
      sendResponse('error', { message: staffRes?.error?.message || 'Error staff' });
      return;
    }

    _staff = staffRes.staff || [];
    const catalogo = catalogoRes?.ok ? (catalogoRes.servicios || []) : [];

    // v0.3.6 — cachear para los reenvíos idempotentes.
    _catalogo = catalogo;
    _initListo = true;
    _initEnCurso = false;

    console.log(`${TAG} 🎯 Init OK: ${_staff.length} staff · ${catalogo.length} servicios`);
    sendResponse('init-data', { staff: _staff, catalogo });

    // v0.3.7 — El buscador de clientes está operativo DESDE YA: consulta
    // el CRM en vivo, no espera ninguna caché. Se envía
    // 'contactos-cache-ready' de inmediato para que el widget ponga
    // _cacheContactosReady = true y habilite el input del step 1 (que
    // hasta recibirlo se pinta deshabilitado con "Cargando clientes…").
    // `total: 0` es informativo: el widget solo lo usa para un console.log.
    // Esto es lo que permite no tocar el widget en absoluto.
    sendResponse('contactos-cache-ready', { total: 0 });
  } catch (e) {
    _initEnCurso = false;
    console.error(`${TAG} ❌ handleReady:`, e?.message);
    sendResponse('error', { message: 'Error cargando datos iniciales' });
  }
}

// =====================================================
// CACHE DE CONTACTOS — ELIMINADA en v0.3.7
// =====================================================
// La función cargarCacheContactosBackground() se ha suprimido junto con
// las variables _cacheContactos / _cacheReady / _cacheLoading.
//
// Volcaba los 4.619 contactos de KALÓNICE en 5 páginas de 1.000 (~12,5 s
// medidos en producción) y, mientras su await estaba en vuelo, la cola de
// mensajes del custom element quedaba parada: la agenda del día no se
// pintaba hasta que terminaba, pese a que getReservasPorFecha tarda 0,3 s.
//
// La búsqueda de clientes la sirve ahora handleBuscarCliente contra el
// backend contactSearchLogic.buscarContactosRapido, que consulta Wix CRM
// solo por lo tecleado. Sin caché, sin volcado y sin copias del CRM.
//
// recepcionLogic.cargarTodosContactos SIGUE EXISTIENDO e intacta: la usan
// Agenda PRO, Reserva Inteligente, Cuidado y Salud, App Cuidado, Check-in
// Externos y AKIRA (lista negra §19). Aquí solo se deja de llamar.

// =====================================================
// RESERVAS — un solo día (V2)
//   Reenvío directo de la reserva con fases[] intacto. El widget V2
//   itera fases ocupantes y salta PROCESO (mismo patrón que desktop).
// =====================================================
async function handleGetReservasDia(fecha) {
  if (!fecha) return;
  try {
    const result = await getReservasPorFecha({ fecha });
    const reservas = (result?.ok ? (result.reservas || []) : []);
    console.log(`${TAG} 📅 ${fecha}: ${reservas.length} packs`);
    sendResponse('reservas-dia', { fecha, reservas });
  } catch (e) {
    console.error(`${TAG} ❌ handleGetReservasDia ${fecha}:`, e?.message);
    sendResponse('reservas-dia', { fecha, reservas: [] });
  }
}

// =====================================================
// PRE-CARGA — N días en batches paralelos (V2)
// =====================================================
async function handlePreloadReservas(fechaBase, dias) {
  if (!fechaBase || !dias || dias < 1) return;
  console.log(`${TAG} 📦 Pre-carga iniciada: ${dias} días desde ${fechaBase}`);
  const t0 = Date.now();
  const fechas = [];
  for (let i = 1; i <= dias; i++) fechas.push(addDaysISO(fechaBase, i));

  let cargados = 0;
  for (let i = 0; i < fechas.length; i += PRELOAD_BATCH) {
    const batch = fechas.slice(i, i + PRELOAD_BATCH);
    const resultados = await Promise.all(batch.map(async f => {
      try {
        const r = await getReservasPorFecha({ fecha: f });
        return [f, (r?.ok ? r.reservas : []) || []];
      } catch (e) {
        return [f, []];
      }
    }));
    const porFecha = {};
    for (const [f, reservas] of resultados) porFecha[f] = reservas;
    cargados += batch.length;
    sendResponse('reservas-rango', { porFecha });
  }
  console.log(`${TAG} ✅ Pre-carga completa: ${cargados} días en ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

// =====================================================
// CLIENTES — buscar (in-memory) — sin cambios respecto a v0.2.2
// =====================================================
// v0.3.7 — ASÍNCRONA y contra el CRM vivo. Antes filtraba en memoria los
// 4.619 contactos volcados al arrancar (`_cacheContactos.filter(includes)`).
// Ahora pregunta a Wix CRM solo por lo tecleado.
//
// Diferencia funcional aceptada (decisión de Jal 6-ago-2026): el CRM solo
// admite startsWith, así que la búsqueda pasa de "contiene" a "empieza
// por". El backend consulta nombre Y apellido, de modo que "gonz"
// encuentra a "María González"; "zalez" ya no. Los acentos se comparan
// letra a letra: "Jos" encuentra "José", "Jose" no.
//
// `cacheReady: true` se envía siempre: el widget lo usa solo para habilitar
// el input, y el buscador está operativo desde el primer segundo.
async function handleBuscarCliente(msg) {
  const q = String(msg?.query || '').trim();
  if (q.length < 2) {
    sendResponse('clientes-encontrados', { clientes: [], total: 0, cacheReady: true });
    return;
  }
  try {
    const res = await buscarContactosRapido({ query: q, limit: 20 });
    const clientes = (res?.ok ? (res.clientes || []) : []);
    console.log(`${TAG} 🔎 "${q}": ${clientes.length} resultados`);
    sendResponse('clientes-encontrados', {
      clientes,
      total: res?.total || clientes.length,
      cacheReady: true
    });
  } catch (e) {
    console.error(`${TAG} ❌ handleBuscarCliente:`, e?.message);
    sendResponse('clientes-encontrados', { clientes: [], total: 0, cacheReady: true });
  }
}

// =====================================================
// CLIENTES — crear nuevo — sin cambios respecto a v0.2.2
// =====================================================
async function handleCrearContacto(msg) {
  try {
    const result = await crearContacto({
      nombre: msg.nombre || '',
      apellido: msg.apellido || '',
      telefono: msg.telefono || '',
      email: msg.email || ''
    });
    // v0.3.7 — Ya no hay caché que actualizar: el contacto recién creado
    // es encontrable de inmediato porque el buscador consulta el CRM vivo.
    sendResponse('contacto-creado', { data: result || { ok: false } });
  } catch (e) {
    sendResponse('contacto-creado', { data: { ok: false, error: { message: e?.message } } });
  }
}

// =====================================================
// ENSURE CONTACT ID — patrón producción
// =====================================================
async function ensureContactId(msg) {
  if (msg.memberContactId) return msg.memberContactId;
  const cd = msg.contactDetails || {};
  if (!cd.firstName && !cd.phone && !cd.email) return null;
  try {
    const res = await crearContacto({
      nombre: cd.firstName || '',
      apellido: cd.lastName || '',
      telefono: cd.phone || '',
      email: cd.email || ''
    });
    if (res?.ok && res?.contactId) {
      // v0.3.7 — sin push a caché (eliminada).
      return res.contactId;
    }
  } catch (e) { /* silencioso */ }
  return null;
}

// =====================================================
// CREAR RESERVA — llamada única a crearPackReserva (V2 CMS-first)
//   Mismo patrón que pagecode_recepcionProCMS v1.0.15 (desktop V2).
// =====================================================
async function handleCrearReserva(msg) {
  const {
    principalSetupUid,
    complementosSetupUid = [],
    fechaISO,
    horaHHmm,
    empleadoId,
    staffName = '',
    contactDetails = {},
    memberContactId = '',
    notas = '',
    esProvisional = false
  } = msg || {};

  if (!principalSetupUid || !fechaISO || !horaHHmm || !empleadoId) {
    sendResponse('reserva-creada', {
      ok: false,
      error: { message: 'Faltan parámetros obligatorios (principalSetupUid/fechaISO/horaHHmm/empleadoId)' }
    });
    return;
  }

  try {
    // v0.3.4 — Cliente provisional: si el widget marca esProvisional:true,
    // saltar ensureContactId para preservar la naturaleza anónima. Sin
    // este skip, aunque el widget mandara esProvisional:true, el pagecode
    // seguía llamando a crearContacto y ensuciaba el CRM con clientes de
    // paso — contradictorio con la intención del flujo v0.4.0 del widget
    // (Punto 3). Backend crearPackReserva v1.0.6+ ya sabe manejar
    // memberContactId vacío + esProvisional:true (salta ensureContactInCRM
    // también en su lado).
    const cidReal = esProvisional
      ? null
      : await ensureContactId({ memberContactId, contactDetails });
    const memberContactIdFinal = esProvisional
      ? ''
      : (cidReal || memberContactId || null);

    const result = await crearPackReserva({
      fecha: fechaISO,
      horaHHmm,
      principalSetupUid,
      complementosSetupUid: Array.isArray(complementosSetupUid) ? complementosSetupUid : [],
      staffId: empleadoId,
      staffName,
      contactDetails,
      memberContactId: memberContactIdFinal,
      notas,
      esProvisional: !!esProvisional,
      origenRecepcion: true
    });

    sendResponse('reserva-creada', result || {
      ok: false,
      error: { message: 'Sin respuesta del backend' }
    });

    if (result?.ok) {
      setTimeout(() => { handleGetReservasDia(fechaISO); }, 800);
    }
  } catch (e) {
    console.error(`${TAG} ❌ handleCrearReserva:`, e?.message);
    sendResponse('reserva-creada', { ok: false, error: { message: e?.message || 'Error creando reserva' } });
  }
}

// =====================================================
// ARMADO MÚLTIPLE — añadir servicio a una cita ya creada (v0.3.9)
// =====================================================
//   El widget v0.6.0 crea la cita con la primera línea y luego encadena
//   el resto por aquí. Backend agregarServicioReserva (recepcionProLogic
//   v1.0.43+) resuelve variante y complementos, y encadena el servicio a
//   partir de MAX(end) de las fases ocupantes de la reserva.
//
//   Resultado: UNA reserva con N servicios → un total, un cobro; y cada
//   fase ocupante se pinta como su propio bloque en el calendario.
//
//   Nombres de mensaje idénticos a los del Desktop ('agregar-servicio' /
//   'servicio-agregado') para mantener paridad entre superficies.
// =====================================================
async function handleAgregarServicio(msg) {
  const { reservaId, setupUid, varianteSel = null, complementosSetupUid = [] } = msg || {};
  if (!reservaId || !setupUid) {
    sendResponse('servicio-agregado', {
      ok: false,
      error: { message: 'Faltan reservaId o setupUid' }
    });
    return;
  }
  try {
    const result = await agregarServicioReserva({
      reservaId,
      setupUid,
      varianteSel,
      complementosSetupUid: Array.isArray(complementosSetupUid) ? complementosSetupUid : []
    });
    const ok = !!result?.ok;
    console.log(`${TAG} ➕ agregar-servicio ${setupUid} → ${ok ? 'OK' : 'ERROR'}`);
    sendResponse('servicio-agregado', result || { ok: false, error: { message: 'Sin respuesta del backend' } });
  } catch (e) {
    console.error(`${TAG} ❌ handleAgregarServicio:`, e?.message);
    sendResponse('servicio-agregado', { ok: false, error: { message: e?.message || 'Error añadiendo servicio' } });
  }
}

// =====================================================
// SETTINGS (CalendarViewSettings) — CMS directo, sin backend
//
//   v0.3.5 — FUENTE UNIFICADA con Desktop. Antes: Lite Mobile leía/escribía
//   una fila propia con title 'recepcionLiteMobile-<memberId>' y filtro por
//   _owner → los settings del salón (orden de columnas, visibilidad, colores)
//   no coincidían con los de Recepción PRO Desktop porque cada surface
//   consultaba una fila distinta del CMS. Además, el widget Lite Mobile
//   NUNCA envía 'save-settings' (verificado: cero llamadas en
//   kamisuiteBookingLite v0.4.0), así que su fila propia estaba
//   habitualmente vacía y la vista mobile arrancaba con defaults.
//
//   Ahora: handleGetSettings lee la MISMA fila que Desktop
//   (`title = 'recepcionPRO'`) mediante el patrón `_consolidarSettingsRow`
//   copiado LITERALMENTE de pagecode_recepcionProCMS v1.0.25 líneas
//   783-815, con una diferencia intencionada:
//     · Desktop borra los duplicados (Desktop es la fuente de escritura
//       autorizada; consolidar es su responsabilidad).
//     · Lite Mobile SOLO LEE; no borra nada del CMS. Simplemente devuelve
//       la última fila creada (la que Desktop mantiene viva).
//
//   handleSaveSettings queda con el patrón original (código muerto): el
//   widget kamisuiteBookingLite v0.4.0 NO envía 'save-settings' en ningún
//   flujo. Se conserva por si un futuro widget lo activa, pero manteniendo
//   la escritura en la fila propia 'recepcionLiteMobile-...' para NO
//   ensuciar la fila del Desktop. Toda la configuración de columnas la
//   controla Desktop.
//
//   Estructura del CMS: { _id, _owner, title, settingsJson }
//   Título canónico del Desktop: 'recepcionPRO' (constante SETTINGS_TITLE).
// =====================================================

const SETTINGS_TITLE = 'recepcionPRO';

async function _getMemberId() {
  try {
    const m = await currentMember.getMember();
    return m?._id || null;
  } catch (e) { return null; }
}

// v0.3.5 — Copia literal de pagecode_recepcionProCMS v1.0.25 líneas 790-815,
// SIN el bloque de borrado de duplicados (Lite Mobile es solo lectura).
// Busca la ÚLTIMA fila creada cuyo title empiece por 'recepcionPRO' (la
// fila canónica del Desktop). Si no hay ninguna, devuelve null.
async function _leerFilaSettingsDesktop() {
  const r = await wixData.query('CalendarViewSettings')
    .startsWith('title', SETTINGS_TITLE)
    .descending('_createdDate')   // la última creada primero
    .limit(50)
    .find({ suppressAuth: true });

  const items = r.items || [];
  if (items.length === 0) return null;
  return items[0];
}

async function handleGetSettings() {
  try {
    const row = await _leerFilaSettingsDesktop();
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

// v0.3.5 — Sin cambios respecto a v0.3.4. El widget kamisuiteBookingLite
// v0.4.0 no envía 'save-settings' en ningún flujo (verificado: cero
// llamadas en el widget desplegado). La configuración del salón se
// gestiona exclusivamente desde Recepción PRO Desktop. Este handler se
// conserva por compatibilidad futura; si un día se activa, escribirá en
// su fila propia (title 'recepcionLiteMobile-...') para NO ensuciar la
// fila canónica del Desktop.
async function handleSaveSettings(settings) {
  try {
    const memberId = await _getMemberId();
    let existingId = null;
    let q = wixData.query('CalendarViewSettings');
    if (memberId) q = q.eq('_owner', memberId);
    const r = await q.limit(1).find({ suppressAuth: true });
    if (r.items && r.items.length) existingId = r.items[0]._id;

    const payload = {
      title: 'recepcionLiteMobile-' + (memberId || 'shared'),
      settingsJson: JSON.stringify(settings || {})
    };
    if (existingId) payload._id = existingId;

    await wixData.save('CalendarViewSettings', payload, { suppressAuth: true });
  } catch (e) {
    console.error(`${TAG} ❌ save-settings:`, e);
  }
}

// =====================================================
// CANCELAR RESERVA (v0.3.2)
//   Mismo patrón que pagecode_recepcionProCMS v1.0.15 líneas 260-268.
// =====================================================
async function handleCancelarReserva(msg) {
  const reservaId = msg?.reservaId;
  if (!reservaId) {
    sendResponse('reserva-cancelada', { ok: false, error: { message: 'Falta reservaId' } });
    return;
  }
  try {
    const result = await cancelarReserva({ reservaId });
    sendResponse('reserva-cancelada', result || { ok: false });
  } catch (e) {
    console.error(`${TAG} ❌ cancelarReserva:`, e?.message);
    sendResponse('reserva-cancelada', { ok: false, error: { message: e?.message || 'Error' } });
  }
}

// =====================================================
// BLOQUEOS (v0.3.3) — copia LITERAL del page code desktop v1.0.17
//   Backend: recepcionProLogic.web v1.0.20.
//   Las 3 funciones insertan/borran/actualizan filas en
//   KamisuiteReservations con family:'BLOQUEO'. El motor público
//   (widgetPublicoLogic v0.6.2) ya las trata como bloqueos efectivos.
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
// MOUNT
// =====================================================
$w.onReady(() => {
  console.log(`${TAG} 👂 Listener activo`);
$w('#f6B6E28D52B24De6Aab3Ff2Ccad8E2291').hide()
  _el = $w('#kamisuiteBookingLite');
  if (!_el) { console.error(`${TAG} ❌ Elemento #kamisuiteBookingLite no encontrado.`); return; }

  _el.on('booking-message', (event) => {
    const msg = event?.detail || {};
    if (!msg.type) return;
    try {
      switch (msg.type) {
        case 'ready':              handleReady(); break;
        case 'get-reservas-dia':   handleGetReservasDia(msg.fecha); break;
        case 'preload-reservas':   handlePreloadReservas(msg.fechaBase, msg.dias); break;
        case 'buscar-cliente':     handleBuscarCliente(msg); break;
        case 'crear-contacto':     handleCrearContacto(msg); break;
        case 'crear-reserva':      handleCrearReserva(msg); break;
        case 'agregar-servicio':   handleAgregarServicio(msg); break;
        case 'get-settings':       handleGetSettings(); break;
        case 'save-settings':      handleSaveSettings(msg.settings); break;
        case 'cancelar-reserva':   handleCancelarReserva(msg); break;
        case 'crearBloqueo':       handleCrearBloqueo(msg); break;
        case 'eliminarBloqueo':    handleEliminarBloqueo(msg); break;
        case 'actualizarBloqueo':  handleActualizarBloqueo(msg); break;
        default: console.warn(`${TAG} ⚠️ Tipo desconocido: ${msg.type}`);
      }
    } catch (err) {
      console.error(`${TAG} ❌ Error handler ${msg.type}:`, err?.message);
      sendResponse('error', { message: err?.message || 'Error inesperado' });
    }
  });

  // Kickoff proactivo
  handleReady();
});
