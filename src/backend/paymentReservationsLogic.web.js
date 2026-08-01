// ═══════════════════════════════════════════════════════════════
// paymentReservationsLogic.web.js  v1.3.2
// KAMISUITE — CRUD PaymentReservations + verificación de contactIds
// ═══════════════════════════════════════════════════════════════
// CHANGELOG:
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

const COLLECTION = 'PaymentReservations';
const COLECCION_RESERVAS = 'KamisuiteReservations'; // v1.3.1 — reversión de status al borrar cobro KRI_
const TAG = '[PaymentReservations][v1.3.2]';

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
