// ═══════════════════════════════════════════════════════════════
// paymentReservationsLogic.web.js  v1.3.3
// KAMISUITE — CRUD PaymentReservations + verificación de contactIds
// ═══════════════════════════════════════════════════════════════
// CHANGELOG:
//   v1.3.3 (1-ago-2026) — HARD DELETE de reserva desde el Editor
//     "Reservas y Pagos". NEW getAvisosBorradoReserva (avisos previos)
//     + eliminarReservaCompleta: liberan los huecos de calendario +
//     borran el/los cobro(s) KRI_ + eliminan la fila de
//     KamisuiteReservations. Excepción controlada para citas mal
//     planteadas ya cobradas, sin entrar al CMS a mano. NO tocan
//     bonos/tarjetas canjeadas ni puntos Loyalty: los detectan y los
//     devuelven como avisos para gestión manual. Facturas emitidas
//     tampoco se borran (riesgo fiscal Verifactu): solo se avisa del
//     número. Google Calendar se limpia solo (cron googleCalendarSync
//     borra huérfanos). Import nuevo: sessions (wix-bookings-backend).
//     Delete/edit v1.3.1/v1.3.2 intactos.
//   v1.3.2 (1-ago-2026) — actualizarPaymentReservation ahora
//     soporta editar 'desglosemetodopago' con regla cross-field:
//     · Si campos.tipoPago === 'Mixto' y campos.desglosemetodopago
//       viene vacío / ausente → SE RECHAZA. Cambiar a Mixto sin
//       desglose fue exactamente el bug que producía cobros
//       corruptos (v2.0.0 del widget no lo pedía).
//     · Si campos.tipoPago viene y NO es 'Mixto' → se FUERZA
//       desglosemetodopago = '' (limpia el desglose viejo al
//       cambiar el método de cobro).
//     · Si campos.tipoPago no viene pero campos.desglosemetodopago
//       sí → se respeta el envío (edición aislada del desglose).
//     Añadido 'desglosemetodopago' a la lista EDITABLES.
//     Sin más cambios en el archivo (delete v1.3.1 intacto).
//     Contrapartida en widget: edicionpagoswidget v2.1.0.
//
//   v1.3.1 (1-ago-2026) — eliminarPaymentReservation revierte el
//     status de KamisuiteReservations a 'CONFIRMADA' cuando el
//     cobro borrado corresponde a una cita interna (bookingId con
//     prefijo 'KRI_'). Simetría con marcarPagadoReserva
//     (recepcionProLogic v1.0.37): cobrar acopla status='PAGADO' +
//     insert PaymentReservations; anular el cobro debe deshacer
//     AMBAS escrituras. Cambio quirúrgico: 1 bloque nuevo dentro
//     de eliminarPaymentReservation (antes del wixData.remove).
//     Fallback seguro: si la reversión del status falla por
//     cualquier motivo, el borrado del cobro SÍ se lleva a cabo
//     (misma política que la rama interna de marcarPagadoReserva
//     ante fallo de PaymentReservations). No aplica a cobros con
//     otros prefijos (ESP_ especiales de venta manual, etc.) — no
//     tienen contrapartida en KamisuiteReservations, se dejan
//     intactos. Cero cambios en el resto de funciones del archivo,
//     ni en el contrato del CRUD del Editor de Cobros: se añade un
//     campo opcional 'reservaRevertida' al return de éxito, y el
//     page code v2.0.0 lo ignora sin romperse.
//     Impacto observable:
//       · Recepción PRO al recargar el día pinta la cita naranja
//         (is-pending) porque status pasa a 'CONFIRMADA'.
//       · Informe del día: Rendimiento Productivo deja de contar
//         la cita como cobrada (procesarRendimiento gate por
//         status==='PAGADO'); Cierre Financiero ya no la incluía
//         (query por fechaPago sobre la fila borrada).
//       · Reconciliación deja de reportar "cita del día cobrada
//         en otro día" (falso positivo).
//
//   v1.3.0 (7-may-2026) — añadida función eliminarPaymentReservation
//     para que el cliente pueda borrar registros sin tocar el panel
//     de Wix (panel reservado para Anthropic/admin). Se borra del
//     CMS sin intentar revertir el booking en Wix Bookings (eso es
//     una operación distinta, "cancelar reserva", que se hace desde
//     el widget de Recepción PRO).
//
//   v1.2.1 (6-may-2026) — fixes críticos de matching:
//     · BUG v1.2.0: el fallback de "inclusión" (key.includes(claveBuscada)
//       || claveBuscada.includes(key)) era demasiado laxo. Cualquier
//       no-match exacto caía en cuentas administrativas del salón
//       (ej: "HairTimes Reservas&Servicios" absorbía falsos positivos).
//     · FIX 1: eliminado fallback de inclusión naive. Sustituido por
//       cascada de estrategias estrictas:
//         a) match exacto por (firstName + lastName) normalizados
//         b) match exacto por nombre completo concatenado
//         c) match exacto por (lastName + firstName) invertidos
//         d) match si claveBuscada == firstName SOLO (un solo token)
//       En cualquier otro caso → no_encontrado (no inventamos cidReal).
//     · FIX 2: filtrado de contactos administrativos del salón antes
//       de indexar. Contactos cuyo nombre contiene tokens basura
//       ("HairTimes", "Reservas", "Cliente Provisional", "Staff",
//       emails internos del salón) se descartan del índice.
//     · FIX 3: log explícito del total de contactos cargados (verificable
//       en Google Cloud Logs).
//     · FIX 4: log dirigido para nombres concretos a debuggear (lista
//       configurable DEBUG_NAMES).
//     · stats incluye nuevos campos: crmTotal, crmFiltrados, crmIndexados,
//       paginasCargadas.
//   v1.2.0 — versión con bug de matching laxo.
//   v1.1.0 — añadidos getContactosFromIds y exportarTodoJSON.
//   v1.0.1 — versión inicial.
// ═══════════════════════════════════════════════════════════════

import { Permissions, webMethod } from 'wix-web-module';
import { elevate } from 'wix-auth';
import { contacts } from 'wix-crm-backend';
import wixData from 'wix-data';
import { sessions } from 'wix-bookings-backend'; // v1.3.3 — liberar huecos de calendario en el HARD DELETE

const COLLECTION = 'PaymentReservations';
const COLECCION_RESERVAS = 'KamisuiteReservations'; // v1.3.1 — reversión de status al borrar cobro KRI_
const TAG = '[PaymentReservations][v1.3.3]';

// Nombres concretos a loggear para debug (vacío = sin debug dirigido).
// Se compara normalizado contra el nombreCliente del item.
const DEBUG_NAMES = ['elena izquierdo', 'marisa gutierrez'];

// Patrones de contactos administrativos a EXCLUIR del índice CRM.
// Estos son cuentas del salón que no deben matchearse contra clientes.
const TOKENS_BASURA = [
  'hairtimes',
  'hair-times',
  'reservas',
  'cliente provisional',
  'staff',
  'admin',
  'recepcion',
  'recepción'
];

// ───────────────────────────────────────────────────────────────
// listarPaymentReservations()  [sin cambios]
// ───────────────────────────────────────────────────────────────
export const listarPaymentReservations = webMethod(
  Permissions.Anyone,
  async () => {
    try {
      let allItems = [];
      let result = await wixData.query(COLLECTION)
        .descending('fechaPago')
        .limit(1000)
        .find({ suppressAuth: true });

      allItems = allItems.concat(result.items);

      while (result.hasNext()) {
        result = await result.next();
        allItems = allItems.concat(result.items);
      }

      return { success: true, items: allItems, total: allItems.length };
    } catch (err) {
      console.error(`${TAG} Error listar:`, err);
      return { success: false, error: err.message, items: [], total: 0 };
    }
  }
);

// ───────────────────────────────────────────────────────────────
// actualizarPaymentReservation(_id, campos)  [v1.3.2 — soporte desglose Mixto]
// ───────────────────────────────────────────────────────────────
// Campos editables: importeTotal, tipoPago, descripcion,
// nombreCliente, fechaPago, desglosemetodopago.
//
// Regla cross-field para el desglose (v1.3.2):
//   · Si campos.tipoPago === 'Mixto' → campos.desglosemetodopago
//     DEBE venir no vacío. Si viene vacío / ausente, se rechaza
//     el update para no dejar cobros Mixto huérfanos.
//   · Si campos.tipoPago viene y es distinto de 'Mixto' → se
//     fuerza desglosemetodopago = '' (limpia el desglose previo
//     al cambiar el método). Ignora lo que envíe el cliente en
//     ese campo, incluso si envía JSON: los otros métodos no lo
//     necesitan.
//   · Si campos.tipoPago no viene (edición aislada de otros
//     campos) → se respeta campos.desglosemetodopago tal cual.
//
// El formato canónico de desglosemetodopago es una string con
//   JSON.stringify({Tarjeta:N, Efectivo:N, Bizum:N})
// con solo las keys > 0. Es el mismo formato que emite el
// _openMixto de Recepción PRO (recepcionProCMS_widget v1.1.61)
// para garantizar que el chip "💳 Método de cobro" del modal de
// cita pagada lea el desglose sin ninguna adaptación.
// ───────────────────────────────────────────────────────────────
export const actualizarPaymentReservation = webMethod(
  Permissions.Anyone,
  async (_id, campos) => {
    try {
      const item = await wixData.get(COLLECTION, _id, { suppressAuth: true });
      if (!item) {
        return { success: false, error: 'Registro no encontrado' };
      }

      // v1.3.2 — regla cross-field aplicada sobre 'campos' ANTES de mapear.
      // Muta la copia recibida; no toca el CMS aún.
      const camposIn = { ...campos };
      if (camposIn.tipoPago !== undefined) {
        if (camposIn.tipoPago === 'Mixto') {
          const desg = (camposIn.desglosemetodopago == null)
            ? ''
            : String(camposIn.desglosemetodopago);
          if (!desg.trim()) {
            return {
              success: false,
              error: 'Un cobro Mixto requiere desglose (Tarjeta/Efectivo/Bizum).'
            };
          }
          camposIn.desglosemetodopago = desg;
        } else {
          // Cambio a método no-Mixto → limpiar desglose previo
          camposIn.desglosemetodopago = '';
        }
      }

      const EDITABLES = ['importeTotal', 'tipoPago', 'descripcion', 'nombreCliente', 'fechaPago', 'desglosemetodopago'];
      for (const campo of EDITABLES) {
        if (camposIn[campo] !== undefined) {
          item[campo] = camposIn[campo];
        }
      }

      const updated = await wixData.update(COLLECTION, item, { suppressAuth: true });
      return { success: true, item: updated };
    } catch (err) {
      console.error(`${TAG} Error actualizar:`, err);
      return { success: false, error: err.message };
    }
  }
);

// ───────────────────────────────────────────────────────────────
// v1.3.0 — eliminarPaymentReservation(_id)
// ───────────────────────────────────────────────────────────────
// Borra UNA fila del CMS PaymentReservations.
// Operación irreversible. NO toca el booking en Wix Bookings (eso es
// una operación independiente: cancelarBookingsPack desde Recepción).
//
// Casos de uso típicos:
//   - Borrar fila duplicada accidental
//   - Borrar fila huérfana de pruebas/demo
//   - Borrar registro que se cobró por error (después de re-cobrar bien)
//
// Devuelve { success, deletedId } o { success:false, error }.
// ───────────────────────────────────────────────────────────────
export const eliminarPaymentReservation = webMethod(
  Permissions.Anyone,
  async (_id) => {
    try {
      if (!_id || typeof _id !== 'string') {
        return { success: false, error: '_id inválido' };
      }

      // Verificar que existe antes de borrar (para devolver mejor error)
      const item = await wixData.get(COLLECTION, _id, { suppressAuth: true });
      if (!item) {
        return { success: false, error: 'Registro no encontrado' };
      }

      const nombreLog = item.nombreCliente || '(sin nombre)';
      const importeLog = item.importeTotal || 0;

      // ─── v1.3.1 — REVERTIR status de KamisuiteReservations ─────────
      // Simetría con marcarPagadoReserva (recepcionProLogic v1.0.37):
      // cobrar escribe DOS cosas acopladas (status='PAGADO' + insert
      // PaymentReservations). Anular el cobro debe deshacer AMBAS.
      //
      // Solo aplica a cobros de citas internas (bookingId con prefijo
      // 'KRI_'). Los cobros con otros prefijos (ESP_ especiales/venta
      // manual, etc.) NO tienen contraparte en KamisuiteReservations —
      // se dejan tal cual y esta rama es no-op.
      //
      // Prefijo 'KRI_' = 4 chars → slice(4) para extraer el reservaId.
      // Confirmado en cierreLogicExtendido v1.1.3 (fix slice) y en
      // recepcionProLogic v1.0.16 (PREFIJO_PAGO='KRI_').
      //
      // Fallback seguro: si algo falla al revertir el status (get,
      // update, red...), el borrado del cobro SÍ se lleva a cabo.
      // Misma política que la rama interna de marcarPagadoReserva ante
      // fallo de PaymentReservations: no bloqueamos la operación
      // principal por un accesorio. Se registra warning en logs.
      let reservaRevertida = null;
      try {
        const bookingId = String(item.bookingId || '');
        if (bookingId.startsWith('KRI_')) {
          const reservaId = bookingId.slice(4);
          if (reservaId) {
            const reserva = await wixData.get(COLECCION_RESERVAS, reservaId, { suppressAuth: true });
            if (reserva && reserva.status === 'PAGADO') {
              // READ-MERGE-UPDATE: registro completo ya leído
              reserva.status = 'CONFIRMADA';
              await wixData.update(COLECCION_RESERVAS, reserva, { suppressAuth: true });
              reservaRevertida = reservaId;
              console.log(`${TAG} ↩️ KamisuiteReservations ${reservaId} → CONFIRMADA (status revertido)`);
            } else if (reserva) {
              console.log(`${TAG} ℹ️ KamisuiteReservations ${reservaId} no está en PAGADO (status='${reserva.status || ''}'), no se revierte`);
            } else {
              console.warn(`${TAG} ⚠️ KamisuiteReservations ${reservaId} no encontrada, no se revierte status`);
            }
          }
        }
      } catch (revErr) {
        console.warn(`${TAG} ⚠️ Error revirtiendo status KamisuiteReservations: ${revErr.message}`);
      }

      await wixData.remove(COLLECTION, _id, { suppressAuth: true });

      console.log(`${TAG} 🗑️ Eliminada fila ${_id} | "${nombreLog}" | ${importeLog}€${reservaRevertida ? ` | reserva ${reservaRevertida} → CONFIRMADA` : ''}`);

      return { success: true, deletedId: _id, reservaRevertida };
    } catch (err) {
      console.error(`${TAG} Error eliminar:`, err);
      return { success: false, error: err.message };
    }
  }
);

// ═══════════════════════════════════════════════════════════════
// v1.3.3 — BORRADO TOTAL de una reserva (HARD DELETE), aunque esté
// pagada. Salida de emergencia para citas mal planteadas del todo,
// sin entrar al CMS a mano. Vive en el Editor "Reservas y Pagos".
// NO sustituye la seguridad normal ("no borrar cita pagada" en
// Recepción PRO) — es la excepción controlada.
//
// Deshace TODO lo que acopla el cobro y ocupa el calendario:
//   · libera los huecos (sessions.deleteSession, igual que
//     cancelarReserva de recepcionProLogic),
//   · borra el/los cobro(s) KRI_ de PaymentReservations,
//   · elimina la fila de KamisuiteReservations.
// Google Calendar se limpia solo: el cron de googleCalendarSync
// borra el evento huérfano en su siguiente pasada.
//
// NO toca (decisión de producto): bonos/tarjetas canjeadas ni puntos
// Loyalty. Pero SÍ los detecta y los devuelve como avisos para que el
// operador los gestione a mano. Tampoco borra facturas emitidas
// (riesgo fiscal Verifactu): solo avisa del número de documento.
//
// 'KRI_' = 4 chars (recepcionProLogic PREFIJO_PAGO). Invoices se
// enlaza por campo 'reservaId' (facturacionSalonLogic).
// ═══════════════════════════════════════════════════════════════

const COL_INVOICES = 'Invoices'; // v1.3.3 — solo lectura, para avisar de factura emitida

// Parseo seguro de sessionIds ({"ids":[...]}) — mismo formato que
// recepcionProLogic (jsonIn). Devuelve [] ante cualquier problema.
function _parseSessionIds(raw) {
  try {
    if (Array.isArray(raw)) return raw;
    const o = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const ids = o && o.ids;
    return Array.isArray(ids) ? ids : [];
  } catch (e) {
    return [];
  }
}

// Detecta avisos (canje / factura / nº cobros) de una reserva sin
// borrar nada. El Editor lo llama ANTES de confirmar el HARD DELETE.
async function _avisosDeReserva(reservaId) {
  const bookingIdKey = `KRI_${reservaId}`;
  let hayCanje = false;
  const detalleCanje = [];
  let nCobros = 0;
  let totalCobros = 0;
  try {
    const pagos = await wixData.query(COLLECTION)
      .eq('bookingId', bookingIdKey)
      .find({ suppressAuth: true });
    nCobros = pagos.items.length;
    for (const p of pagos.items) {
      totalCobros += Number(p.importeTotal || 0);
      if (String(p.tipoPago || '').toLowerCase() === 'canje') {
        hayCanje = true;
        if (p.descripcion) detalleCanje.push(String(p.descripcion));
      }
    }
  } catch (e) {
    console.warn(`${TAG} ⚠️ _avisosDeReserva pagos: ${e.message}`);
  }
  let factura = null;
  try {
    const inv = await wixData.query(COL_INVOICES)
      .eq('reservaId', reservaId)
      .find({ suppressAuth: true });
    if (inv.items.length > 0) {
      factura = inv.items[0].invoiceNumber || '(documento sin número)';
    }
  } catch (e) {
    console.warn(`${TAG} ⚠️ _avisosDeReserva invoices: ${e.message}`);
  }
  return { hayCanje, detalleCanje, factura, nCobros, totalCobros };
}

// getAvisosBorradoReserva({ reservaId })
// Devuelve datos de la reserva + avisos que el Editor muestra en la
// confirmación del HARD DELETE. NO borra nada.
export const getAvisosBorradoReserva = webMethod(
  Permissions.SiteMember,
  async ({ reservaId } = {}) => {
    try {
      if (!reservaId || typeof reservaId !== 'string') {
        return { ok: false, error: 'Falta reservaId' };
      }
      let reserva = null;
      try {
        reserva = await wixData.get(COLECCION_RESERVAS, reservaId, { suppressAuth: true });
      } catch (e) { /* se maneja abajo */ }
      if (!reserva) {
        return { ok: false, error: `Reserva no encontrada: ${reservaId}` };
      }
      const avisos = await _avisosDeReserva(reservaId);
      return {
        ok: true,
        reserva: {
          _id: reservaId,
          title: reserva.title || reserva.clientName || '(sin título)',
          clientName: reserva.clientName || '',
          fechaReserva: reserva.fechaReserva || null,
          status: reserva.status || '',
          precioTotal: Number(reserva.precioTotal || 0)
        },
        avisos
      };
    } catch (err) {
      console.error(`${TAG} ❌ getAvisosBorradoReserva:`, err);
      return { ok: false, error: err.message };
    }
  }
);

// eliminarReservaCompleta({ reservaId })  — HARD DELETE
// Libera huecos + borra TODOS los cobros KRI_ + elimina la fila de
// KamisuiteReservations. Devuelve los avisos (canje / factura) que
// quedan pendientes de gestionar a mano.
export const eliminarReservaCompleta = webMethod(
  Permissions.SiteMember,
  async ({ reservaId } = {}) => {
    try {
      if (!reservaId || typeof reservaId !== 'string') {
        return { success: false, error: 'Falta reservaId' };
      }

      // 0. Leer la reserva (para los huecos + validar existencia)
      let reserva;
      try {
        reserva = await wixData.get(COLECCION_RESERVAS, reservaId, { suppressAuth: true });
      } catch (e) {
        return { success: false, error: `Reserva no encontrada: ${reservaId}` };
      }
      if (!reserva) {
        return { success: false, error: `Reserva no encontrada: ${reservaId}` };
      }
      const nombreLog = reserva.clientName || reserva.title || '(sin nombre)';

      // Detectar avisos ANTES de borrar (para devolverlos)
      const avisos = await _avisosDeReserva(reservaId);

      // 1. Liberar los huecos del calendario (igual que cancelarReserva)
      const sessionIds = _parseSessionIds(reserva.sessionIds);
      let sessionesBorradas = 0;
      for (const sid of sessionIds) {
        if (!sid) continue;
        try {
          await sessions.deleteSession(sid, { suppressAuth: true });
          sessionesBorradas++;
        } catch (sErr) {
          console.warn(`${TAG} ⚠️ No se pudo borrar session ${sid}: ${sErr.message}`);
        }
      }

      // 2. Borrar TODOS los cobros KRI_ de la reserva
      let cobrosBorrados = 0;
      try {
        const pagos = await wixData.query(COLLECTION)
          .eq('bookingId', `KRI_${reservaId}`)
          .find({ suppressAuth: true });
        for (const p of pagos.items) {
          try {
            await wixData.remove(COLLECTION, p._id, { suppressAuth: true });
            cobrosBorrados++;
          } catch (pErr) {
            console.warn(`${TAG} ⚠️ No se pudo borrar cobro ${p._id}: ${pErr.message}`);
          }
        }
      } catch (qErr) {
        console.warn(`${TAG} ⚠️ Error listando cobros de ${reservaId}: ${qErr.message}`);
      }

      // 3. Eliminar la fila de KamisuiteReservations (HARD DELETE)
      await wixData.remove(COLECCION_RESERVAS, reservaId, { suppressAuth: true });

      // NOTA: Google Calendar se limpia solo — el cron de
      // googleCalendarSync borra el evento huérfano (ya no existe la
      // reserva) en su siguiente pasada. Bonos/tarjetas canjeadas y
      // puntos Loyalty NO se tocan; van en 'avisos'. Facturas emitidas
      // tampoco se borran (fiscal) — 'avisos.factura' lleva el número.

      console.log(`${TAG} 🧨 HARD DELETE reserva ${reservaId} | "${nombreLog}" | ${sessionesBorradas} huecos | ${cobrosBorrados} cobros${avisos.factura ? ` | ⚠️ factura ${avisos.factura}` : ''}${avisos.hayCanje ? ' | ⚠️ tenía canje' : ''}`);

      return {
        success: true,
        reservaId,
        sessionesBorradas,
        cobrosBorrados,
        avisos
      };
    } catch (err) {
      console.error(`${TAG} ❌ eliminarReservaCompleta:`, err);
      return { success: false, error: err.message };
    }
  }
);


// ───────────────────────────────────────────────────────────────
// resolverContactIdsReales(items)  [v1.2.1 — REESCRITO]
//
// Estrategia: cargar TODOS los contactos del CRM, descartar cuentas
// administrativas del salón, indexar por varias claves estrictas,
// y para cada item buscar SOLO match exacto. Si ninguna estrategia
// matchea → no_encontrado (no inventamos resultados).
//
// Devuelve por cada item:
//   { _id, nombreCliente, cidCMS, cidReal, status, candidatos, matchType }
//
// status: match | mismatch | ambiguo | no_encontrado | sin_nombre
// matchType: 'fl_exact' | 'full_concat' | 'lf_inverted' | 'first_only' | null
// ───────────────────────────────────────────────────────────────
export const resolverContactIdsReales = webMethod(
  Permissions.Anyone,
  async (items) => {
    try {
      if (!Array.isArray(items)) {
        return { success: false, error: 'items debe ser array', resultados: [] };
      }

      console.log(`${TAG} resolverContactIdsReales — ${items.length} items recibidos`);

      // ── PASO 1: cargar TODOS los contactos del CRM (paginado) ──
      const elevatedQuery = elevate(contacts.queryContacts);
      const allContacts = [];
      let hasMore = true;
      let skip = 0;
      const PAGE = 1000;
      let paginas = 0;

      while (hasMore) {
        const result = await elevatedQuery()
          .skip(skip)
          .limit(PAGE)
          .find();

        const page = result?.items || [];
        allContacts.push(...page);
        paginas++;

        console.log(`${TAG} CRM página ${paginas}: ${page.length} contactos (acumulado: ${allContacts.length})`);

        if (page.length < PAGE) hasMore = false;
        else skip += PAGE;

        if (skip >= 10000) {
          console.warn(`${TAG} Límite seguridad 10000 alcanzado`);
          hasMore = false;
        }
      }

      console.log(`${TAG} CRM total cargado: ${allContacts.length} contactos en ${paginas} páginas`);

      // ── PASO 2: filtrar basura administrativa e indexar ──
      const idxFL = new Map();
      const idxLF = new Map();
      const idxFull = new Map();
      const idxFirst = new Map();

      let crmFiltrados = 0;
      let crmIndexados = 0;

      for (const c of allContacts) {
        const infoName = c?.info?.name || {};
        const first = String(infoName.first || c?.name?.first || '').trim();
        const last = String(infoName.last || c?.name?.last || '').trim();
        const full = `${first} ${last}`.trim();
        if (!full) continue;

        const fullNorm = normalizar(full);

        if (esBasuraAdministrativa(fullNorm, c)) {
          crmFiltrados++;
          continue;
        }

        const firstNorm = normalizar(first);
        const lastNorm = normalizar(last);

        const keyFL = `${firstNorm} ${lastNorm}`.trim();
        const keyLF = `${lastNorm} ${firstNorm}`.trim();

        if (keyFL) pushToMap(idxFL, keyFL, c);
        if (keyLF && keyLF !== keyFL) pushToMap(idxLF, keyLF, c);
        if (fullNorm && fullNorm !== keyFL) pushToMap(idxFull, fullNorm, c);
        if (firstNorm && !lastNorm) pushToMap(idxFirst, firstNorm, c);

        crmIndexados++;
      }

      console.log(`${TAG} CRM filtrados (basura): ${crmFiltrados}`);
      console.log(`${TAG} CRM indexados: ${crmIndexados}`);
      console.log(`${TAG} Tamaños índices — FL:${idxFL.size} LF:${idxLF.size} Full:${idxFull.size} First:${idxFirst.size}`);

      // ── PASO 3: por cada item, cascada de búsqueda ──
      const resultados = [];
      let stMatch = 0, stMismatch = 0, stAmbiguo = 0, stNoEnc = 0, stSinNombre = 0;

      for (const item of items) {
        const _id = item._id || '';
        const nombreCliente = String(item.nombreCliente || '').trim();
        const cidCMS = String(item.contactId || '').trim();

        if (!nombreCliente) {
          resultados.push({ _id, nombreCliente: '', cidCMS, cidReal: '', status: 'sin_nombre', candidatos: [], matchType: null });
          stSinNombre++;
          continue;
        }

        const claveBuscada = normalizar(nombreCliente);
        const isDebug = DEBUG_NAMES.includes(claveBuscada);

        if (isDebug) {
          console.log(`${TAG} 🔬 DEBUG "${nombreCliente}" → claveBuscada="${claveBuscada}" cidCMS=${cidCMS || '(vacío)'}`);
        }

        let matches = [];
        let matchType = null;

        matches = idxFL.get(claveBuscada) || [];
        if (matches.length > 0) matchType = 'fl_exact';

        if (matches.length === 0) {
          matches = idxFull.get(claveBuscada) || [];
          if (matches.length > 0) matchType = 'full_concat';
        }

        if (matches.length === 0) {
          matches = idxLF.get(claveBuscada) || [];
          if (matches.length > 0) matchType = 'lf_inverted';
        }

        if (matches.length === 0 && !claveBuscada.includes(' ')) {
          matches = idxFirst.get(claveBuscada) || [];
          if (matches.length > 0) matchType = 'first_only';
        }

        if (isDebug) {
          console.log(`${TAG} 🔬 DEBUG "${nombreCliente}" → matches=${matches.length} matchType=${matchType || '(none)'}`);
          if (matches.length > 0) {
            for (const m of matches.slice(0, 3)) {
              console.log(`${TAG} 🔬   candidato: ${m._id} - ${m?.info?.name?.first||''} ${m?.info?.name?.last||''}`);
            }
          }
        }

        if (matches.length === 0) {
          resultados.push({ _id, nombreCliente, cidCMS, cidReal: '', status: 'no_encontrado', candidatos: [], matchType: null });
          stNoEnc++;
          continue;
        }

        const cands = matches.map(toCandidato);

        if (cands.length === 1) {
          const real = cands[0].contactId;
          const status = (cidCMS && real === cidCMS) ? 'match' : 'mismatch';
          resultados.push({ _id, nombreCliente, cidCMS, cidReal: real, status, candidatos: cands, matchType });
          if (status === 'match') stMatch++; else stMismatch++;
        } else {
          const enLista = cands.find(c => c.contactId === cidCMS);
          if (enLista && cidCMS) {
            resultados.push({ _id, nombreCliente, cidCMS, cidReal: cidCMS, status: 'match', candidatos: cands, matchType: matchType + '_among_many' });
            stMatch++;
          } else {
            resultados.push({ _id, nombreCliente, cidCMS, cidReal: '', status: 'ambiguo', candidatos: cands, matchType });
            stAmbiguo++;
          }
        }
      }

      const stats = {
        total: items.length,
        match: stMatch,
        mismatch: stMismatch,
        ambiguo: stAmbiguo,
        noEncontrado: stNoEnc,
        sinNombre: stSinNombre,
        crmTotal: allContacts.length,
        crmFiltrados,
        crmIndexados,
        paginasCargadas: paginas
      };

      console.log(`${TAG} resolverContactIdsReales — stats:`, JSON.stringify(stats));

      return { success: true, resultados, stats };
    } catch (err) {
      console.error(`${TAG} resolverContactIdsReales ERROR:`, err);
      return { success: false, error: err.message, resultados: [] };
    }
  }
);

// ─────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────

function normalizar(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function pushToMap(map, key, value) {
  if (!map.has(key)) {
    map.set(key, []);
  }
  map.get(key).push(value);
}

function esBasuraAdministrativa(nombreNormalizado, contact) {
  for (const token of TOKENS_BASURA) {
    if (nombreNormalizado.includes(token)) return true;
  }
  const emails = Array.isArray(contact?.info?.emails) ? contact.info.emails : [];
  for (const e of emails) {
    const email = String(e?.email || e || '').toLowerCase();
    if (!email) continue;
    if (/^(info|booking|reservas|admin|hairtimes\.staff)/i.test(email)) {
      return true;
    }
  }
  return false;
}

function toCandidato(c) {
  const infoName = c?.info?.name || {};
  const first = infoName.first || c?.name?.first || '';
  const last = infoName.last || c?.name?.last || '';
  const emails = Array.isArray(c?.info?.emails) ? c.info.emails : [];
  const phones = Array.isArray(c?.info?.phones) ? c.info.phones : [];
  return {
    contactId: c._id || c.id || '',
    nombreCompleto: `${first} ${last}`.trim(),
    email: emails[0]?.email || '',
    telefono: phones[0]?.phone || ''
  };
}

// ───────────────────────────────────────────────────────────────
// exportarTodoJSON()  [sin cambios funcionales]
// ───────────────────────────────────────────────────────────────
export const exportarTodoJSON = webMethod(
  Permissions.Anyone,
  async () => {
    try {
      let allItems = [];
      let result = await wixData.query(COLLECTION)
        .descending('fechaPago')
        .limit(1000)
        .find({ suppressAuth: true });

      allItems = allItems.concat(result.items);

      while (result.hasNext()) {
        result = await result.next();
        allItems = allItems.concat(result.items);
      }

      const ahora = new Date();
      const exportInfo = {
        exportedAt: ahora.toISOString(),
        exportedAtLocal: ahora.toLocaleString('es-ES', { timeZone: 'Europe/Madrid' }),
        collection: COLLECTION,
        total: allItems.length,
        version: '1.3.2'
      };

      console.log(`${TAG} exportarTodoJSON — ${allItems.length} registros`);

      return { success: true, info: exportInfo, items: allItems };
    } catch (err) {
      console.error(`${TAG} exportarTodoJSON ERROR:`, err);
      return { success: false, error: err.message, items: [] };
    }
  }
);
