// =====================================================
// KAMISUITE - Backend: Recepción PRO CMS-first
// =====================================================
// VERSION: 1.0.16
// FECHA: 10 de junio de 2026
// ARCHIVO: backend/recepcionProLogic.web.js
//
// v1.0.13: getReservasPorFecha ahora cruza con PaymentReservations para
//          asociar productos vendidos a su cita. Cada reserva devuelve
//          productosVendidos:[{nombre, cantidad, subtotal, metodoPago,
//          fechaPago, staff}]. Match heurístico por contactId + cercanía
//          temporal (venderProductosDesdeAgenda no graba reservaId en el
//          bookingId del producto). Si un cliente tiene varias reservas
//          el mismo día y compra un producto, se asocia al pack con
//          fechaReserva más cercana al fechaPago del producto.
//
// v1.0.12: NEW quitarItemReserva.
//          una línea individual del serviciosDetail del modal de cita
//          (botón ✕ junto a cada servicio en V2, igual que V1). Recalcula
//          precioTotal restando precio×cantidad de ese item. NO toca
//          fases ni duracionTotal por ahora (no descuadra el calendario).
//          Si solo queda 1 item → error "cancela la cita en su lugar".
//
// v1.0.11: FIX producto. La función agregarProductoReserva (v1.0.10)
//          consultaba la colección "Productos" — inexistente en este
//          tenant — y devolvía WD_SCHEMA_DOES_NOT_EXIST. ELIMINADA.
//          El widget llama ahora directamente a `venderProductosDesdeAgenda`
//          de `tiendaProductos.web` (función V1 que ya conoce el nombre
//          real de la colección y sus campos) vía el page code v1.0.10.
//          Los productos se registran como venta independiente vinculada
//          al packId (reservaId), igual que en V1 — no se inflan en el
//          precioTotal de la reserva.
//
// v1.0.10: ANTES DE COBRAR — 4 funciones nuevas para enriquecer la cita
//          sin generar pago. Todas READ-MERGE-UPDATE de KamisuiteReservations.
//          · NEW reprogramarReserva({reservaId, nuevaFechaISO})
//            Cambia fechaReserva y recalcula start/end de cada fase con
//            el delta. No toca precio.
//          · NEW agregarExtraReserva({reservaId, importe, descripcion})
//            Suma importe a precioTotal y añade item "[EXTRA] desc|imp|1"
//            al serviciosDetail.
//          · NEW agregarComplementoReserva({reservaId, setupUid})
//            Lee servicio del catálogo. Suma duracionTotal y precioTotal.
//            Añade fase {tipo:'servicio',ref,...,ocupa:true} al final del
//            array, con start = end de la última fase ocupante.
//          · NEW agregarProductoReserva({reservaId, productoId, cantidad})
//            Lee producto del CMS Productos. Suma precio×cant a precioTotal.
//            Añade "🛒 nombre|precio|cant" al detalle. No modifica fases
//            (los productos no ocupan tiempo).
//          · getReservasPorFecha ya devolvía todos los campos necesarios.
//
// v1.0.9: EXTENSIÓN de citas (drag del resize handle en el calendario).
//         · NEW extenderReserva({ reservaId, minutosExtra })
//           READ-MERGE-UPDATE de la fila en KamisuiteReservations,
//           escribe `extensionMin = Number(minutosExtra)`. Cero efectos
//           secundarios: no toca fases, sessions, pago. La duración
//           total visible en el calendario se calcula en el widget como
//           duracionTotal + extensionMin.
//         · NEW quitarExtension({ reservaId }) → extensionMin = 0.
//         · Persistencia en la propia fila (campo nuevo extensionMin,
//           type Number, default 0). Sin filas zombi: si se cancela
//           la reserva original, la extensión desaparece con ella.
//
// v1.0.8: Modelo cascada FILOSOFÍA LEGO completo.
//         · construirFasesPack reconoce 3 tipos de fase en mapeoFases:
//             {tipo:'aplicacion'}    → duración = principal.duration
//                                       label = principal.label
//                                       ocupa stylist
//             {tipo:'proceso'}       → duración = principal.minProceso
//                                       label = 'Proceso'
//                                       LIBERA stylist (no genera session)
//             {tipo:'servicio',ref}  → duración del servicio referenciado
//                                       (mismo flujo que v1.0.7)
//         · Compat LEGACY {tipo:'proceso',min:N}: usa min del item.
//         · Compat editor v1.11.4 (que NO guarda aplicacion explícita):
//           si mapeoFases no incluye tipo:aplicacion, se antepone al
//           inicio automáticamente. Cuando el editor permita reordenar
//           libremente y emita {tipo:'aplicacion'}, el fallback se
//           desactiva solo.
//         · Multi-tenant: cada salón configura su mapeoFases; las
//           duraciones se centralizan en el catálogo (principal.duration,
//           principal.minProceso, svc.duration por referencia).
// v1.0.7: Adoptar formato JSON envuelto en KamisuiteReservations y
//         lectura compatible para ServiceCatalog. Wix advierte (warning
//         amarillo) cuando un campo CMS contiene un array JSON directo
//         `[...]`. NO advierte cuando contiene un objeto `{...}`.
//         · ESCRITURA en KamisuiteReservations.fases:
//             antes  jsonOut(fasesPack)  → '[{...},...]'   ⚠️
//             ahora  wrapItems(fasesPack) → {items:[...]}  ✅
//         · ESCRITURA en KamisuiteReservations.sessionIds:
//             antes  jsonOut(ids)        → '["a","b"]'     ⚠️
//             ahora  wrapIds(ids)         → {ids:[...]}     ✅
//         · LECTURA defensiva: jsonIn(v, unwrapKey) acepta string JSON
//           legacy, array directo, o objeto envuelto {items|ids|<key>}.
//           Soporta filas legacy creadas con v1.0.6 sin migración.
//         · ServiceCatalog.complementos / .variantes / .mapeoFases:
//           lectura defensiva con unwrapKey 'items'. Jal está
//           restructurando filas a mano al nuevo formato; el backend
//           soporta ambos durante la transición.
// v1.0.6: NEW flag esProvisional en crearPackReserva. Si true, NO se crea
//         contacto en CRM (se salta ensureContactInCRM). Cliente
//         eventual de paso: solo se pide nombre, no recibe
//         comunicaciones (no tiene contactId), no ensucia CRM.
// v1.0.5.1: HOTFIX crearReservaMedida. madridToUTC devuelve string ISO,
//          no objeto Date; el código asumía Date y llamaba a .toISOString()
//          que rompía con "fechaReservaUTC.toISOString is not a function".
//          Fix: usar `new Date(isoStr)` para el campo CMS y devolver el
//          string ISO tal cual al cliente. Mismo patrón que crearPackReserva.
// v1.0.5: NEW crearReservaMedida — inserta una reserva STANDALONE en
//         KamisuiteReservations con family='medida' y claseServicio='medida'.
//         Sin sesiones de Wix Bookings (no necesita ancla, es una
//         entrada manual fuera de catálogo). NO escribe en
//         PaymentReservations: se cobra después abriendo la cita y
//         pulsando método de pago como cualquier otra reserva.
//         Permite pintar la cita "a medida" en calendario con su
//         hora, duración, staff y precio. setupUid 'MEDIDA-<ts>',
//         serviciosDetail '<descripcion>|<precio>' compatible con
//         el resto del flujo (lectura modal, descuento, cierre).
// v1.0.4: marcarPagadoReserva acepta 2 params OPCIONALES:
//         · importeNeto  (number)  → si se envía y es >=0, se graba en
//           importeTotal en lugar de registro.precioTotal. Permite cobrar
//           con descuento sin tocar el pack (se graba el NETO ya aplicado).
//         · descripcionExtra (string) → si se envía, se concatena al final
//           de la descripción auto-calculada. Pensado para el token
//           "🏷️ Descuento -X% (-Y€)" o cualquier nota adicional.
//         Cambios 100% backwards compatible: si no se mandan, el comportamiento
//         es idéntico al de v1.0.3.
// v1.0.2: NEW getStaffColumnas() — empleados reales desde StaffConfig
//         para las columnas del calendario. Excluye recursos internos
//         (CUALQUIERA, PROCESO) por nota/canonicalName.
//         FIX getCatalogoReserva — sin filtro por tipo (ver v1.0.1).
//
// PROPÓSITO:
//   Reserva manual de citas (bloque A, sin motor de disponibilidad)
//   sobre arquitectura CMS-first. Desacoplado de Wix Bookings como motor:
//   Wix Bookings solo aporta el SERVICIO DE ANCLAJE (wixAnclaId) cuyo
//   scheduleId recibe las sessions que pintan en el calendario.
//
//   Toda la lógica de servicios (precio, duración, fases, complementos)
//   vive en ServiceCatalog. SvMapeoServicios NO se usa.
//
// PATRÓN REUTILIZADO (literal):
//   - externosLogic.web.js v1.1.5: createSession EVENT+Blocked,
//     ensureContactInCRM, madridToUTC, marcarPagado→colección pagos.
//   - serviceCatalogLogic.web.js v1.1.0: query ServiceCatalog
//     (active + uso + suppressAuth).
//   - coloracionLogic v3.2.8: extractScheduleIdFromService.
//
// CONCEPTOS FUNDACIONALES RESPETADOS:
//   - PROCESO = hueco neutro: NO genera session, libera al stylist.
//   - Complementos al MISMO empleado que el principal.
//   - wixAnclaId resuelto por fila (NO hardcoded): es el serviceId del
//     servicio Bookings ancla de la familia. Se resuelve su scheduleId.
//   - Cascada = PACK de citas (varias sessions), no servicios Bookings.
//
// COLECCIONES:
//   - ServiceCatalog       (lectura: servicios, fases, complementos)
//   - KamisuiteReservations (escritura: el pack de reserva)
//   - PaymentReservations  (escritura: pago, bookingId = KRI_<_id>)
//
// FUNCIONES EXPORTADAS:
//   - getCatalogoReserva()          → servicios reservables + complementos
//   - crearPackReserva()            → resuelve fases, crea sessions, inserta pack
//   - getReservasPorFecha()         → packs del día (para pintar)
//   - marcarPagadoReserva()         → status PAGADO + insert PaymentReservations
//   - cancelarReserva()             → borra sessions + status CANCELADA
//
// NOTAS:
//   - Sessions API V1 (wix-bookings-backend) — migrar a V2 antes 30/06/2026.
//   - fases y sessionIds se guardan como JSON string (campo CMS tipo Text);
//     JSON.stringify de JS genera sin espacios → compatible con Wix Text.
// =====================================================

import { Permissions, webMethod } from 'wix-web-module';
import { elevate } from 'wix-auth';
import { sessions } from 'wix-bookings-backend';
import { services } from 'wix-bookings.v2';
import { contacts } from 'wix-crm-backend';
import wixData from 'wix-data';

const VERSION = '1.0.16';
const TAG = `[RecepcionPRO][${VERSION}]`;
const TIMEZONE = 'Europe/Madrid';

const CMS_CATALOGO = 'ServiceCatalog';
const CMS_RESERVAS = 'KamisuiteReservations';
const CMS_PAGOS = 'PaymentReservations';
const CMS_STAFF = 'StaffConfig';

const USOS_VALIDOS = ['kamisuite', 'ambos'];
const PREFIJO_PAGO = 'KRI_'; // Kamisuite Reservations Internas
// Recursos internos que NUNCA son columna del calendario (CUALQUIERA, PROCESO).
// Patrón legacy: marcados con notes = "RECURSO INTERNO - no mostrar en widget".
const NOTA_RECURSO_INTERNO = 'RECURSO INTERNO';

// =====================================================
// HELPERS
// =====================================================

function safeErr(e) {
  return { message: e?.message || String(e) };
}

function isGuid(x) {
  return typeof x === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
}

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// madridToUTC — idéntico a externosLogic v1.1.5 / coloracionLogic v3.2.8
function madridToUTC(fechaISO, horaHHmm) {
  const [year, month, day] = String(fechaISO).split('-').map(Number);
  const [hour, minute] = String(horaHHmm).split(':').map(Number);

  const d = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));

  const madridStr = d.toLocaleString('en-US', {
    timeZone: 'Europe/Madrid',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });

  const match = madridStr.match(/(\d+)\/(\d+)\/(\d+),\s*(\d+):(\d+)/);
  if (!match) return d.toISOString();

  const madridHour = parseInt(match[4]);
  const madridMin = parseInt(match[5]);

  const targetMin = hour * 60 + minute;
  const madridMin2 = madridHour * 60 + madridMin;
  const diffMin = targetMin - madridMin2;

  const utc = new Date(d.getTime() + (diffMin * 60000));
  return utc.toISOString();
}

function addMinutes(iso, mins) {
  const ms = new Date(iso).getTime();
  return new Date(ms + mins * 60000).toISOString();
}

function formatLocalTime(date) {
  return date.toLocaleTimeString('es-ES', {
    timeZone: TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
}

// extractScheduleIdFromService — idéntico a coloracionLogic v3.2.8
function extractScheduleIdFromService(serviceV2) {
  const candidates = [
    serviceV2?.scheduleId,
    serviceV2?.schedule?.id,
    serviceV2?.schedule?._id,
    serviceV2?.scheduling?.scheduleId,
    serviceV2?.availability?.scheduleId,
    serviceV2?.bookingPolicy?.scheduleId,
    serviceV2?.details?.scheduleId
  ].filter(v => typeof v === 'string' && v);
  return candidates[0] || null;
}

// JSON seguro para campo CMS.
// v1.0.7: Wix advierte cuando un campo (Text u Object) contiene un array
// JSON directo `[...]`. NO advierte cuando contiene un objeto `{...}`.
// Patrón estándar KAMISUITE: envolver listas en objeto con clave canónica:
//   - listas genéricas → { items: [...] }
//   - listas de identificadores → { ids: [...] }
// jsonIn es defensivo: acepta string JSON legacy, array directo, y objeto
// envuelto. Si pasas `unwrapKey`, devuelve el array de esa clave.
function jsonOut(obj) {
  try { return JSON.stringify(obj); } catch (e) { return '[]'; }
}
function jsonIn(v, unwrapKey) {
  if (v == null || v === '') return [];
  // Si llega como string, parsear primero
  if (typeof v === 'string') {
    try { v = JSON.parse(v); } catch (e) { return []; }
  }
  // Si es objeto envuelto con la clave canónica → devolver el array interior
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    if (unwrapKey && Array.isArray(v[unwrapKey])) return v[unwrapKey];
    // Tolerancia: si tiene cualquiera de las claves estándar, devolver
    if (Array.isArray(v.items)) return v.items;
    if (Array.isArray(v.ids))   return v.ids;
    return [];
  }
  // Array directo
  if (Array.isArray(v)) return v;
  return [];
}
// Helpers de escritura — formato sin warning de Wix
function wrapItems(arr) { return { items: Array.isArray(arr) ? arr : [] }; }
function wrapIds(arr)   { return { ids:   Array.isArray(arr) ? arr : [] }; }

// =====================================================
// RESOLUCIÓN DE ANCLA (wixAnclaId → scheduleId)
// Patrón: igual que externos usa el scheduleId del recurso/servicio.
// Aquí el ancla es el SERVICIO Bookings (wixAnclaId). Cache por ancla.
// =====================================================

const _scheduleCache = {}; // { [wixAnclaId]: scheduleId }

async function resolverScheduleIdAncla(wixAnclaId) {
  if (!wixAnclaId || !isGuid(wixAnclaId)) {
    console.warn(`${TAG} ⚠️ wixAnclaId inválido: ${wixAnclaId}`);
    return null;
  }
  if (_scheduleCache[wixAnclaId]) return _scheduleCache[wixAnclaId];

  try {
    const elevatedGet = elevate(services.getService);
    const svcResult = await elevatedGet(wixAnclaId);
    const svc = svcResult?.service || svcResult || {};

    const scheduleId = extractScheduleIdFromService(svc);
    if (scheduleId) {
      _scheduleCache[wixAnclaId] = scheduleId;
      console.log(`${TAG} ✅ Ancla ${wixAnclaId.substring(0, 8)} → schedule ${scheduleId.substring(0, 8)}`);
      return scheduleId;
    }

    console.error(`${TAG} ❌ Ancla ${wixAnclaId} sin scheduleId. Keys: ${Object.keys(svc).join(', ')}`);
    return null;

  } catch (e) {
    console.error(`${TAG} ❌ resolverScheduleIdAncla(${wixAnclaId}):`, e.message);
    return null;
  }
}

// =====================================================
// LECTURA DE CATÁLOGO (ServiceCatalog)
// Carga todos los servicios reservables + índice por setupUid
// para resolver fases (mapeoFases.ref) y complementos.
// =====================================================

async function cargarCatalogoCompleto() {
  const result = await wixData.query(CMS_CATALOGO)
    .eq('active', true)
    .hasSome('uso', USOS_VALIDOS)
    .limit(1000)
    .find({ suppressAuth: true });

  const items = result.items || [];
  const porSetupUid = {};

  for (const it of items) {
    if (it.setupUid) porSetupUid[it.setupUid] = it;
  }

  return { items, porSetupUid };
}

// =====================================================
// 1. GET CATÁLOGO RESERVA
// Servicios principales reservables + sus complementos compatibles.
// =====================================================
export const getCatalogoReserva = webMethod(
  Permissions.SiteMember,
  async () => {
    const t0 = Date.now();
    try {
      const { items, porSetupUid } = await cargarCatalogoCompleto();

      // TODOS los servicios activos son reservables. El rol (principal/
      // complemento/ambos) se conserva en `tipo`; el panel filtra por rol.
      // KALONICE usa tipo = principal|complemento|ambos (NO 'publico').
      const reservables = items
        .sort((a, b) => toNum(a.order) - toNum(b.order))
        .map(it => {
          // Resolver complementos compatibles desde setupUid
          const compUids = jsonIn(it.complementos, 'items');
          const complementos = (Array.isArray(compUids) ? compUids : [])
            .map(uid => porSetupUid[uid])
            .filter(Boolean)
            .map(c => ({
              setupUid: c.setupUid,
              label: c.label || '',
              price: toNum(c.price),
              duration: toNum(c.duration)
            }));

          return {
            setupUid: it.setupUid || '',
            label: it.label || '',
            descripcion: it.descripcion || '',
            family: it.family || 'simple',
            group: it.group || '',
            tipo: it.tipo || 'publico',
            claseServicio: it.claseServicio || '',
            price: toNum(it.price),
            duration: toNum(it.duration),
            hasVariants: !!it.hasVariants,
            variantes: jsonIn(it.variantes, 'items'),
            image: it.image || null,
            wixAnclaId: it.wixAnclaId || '',
            complementos,
            order: toNum(it.order)
          };
        });

      console.log(`${TAG} ✅ getCatalogoReserva: ${reservables.length} servicios. ${((Date.now() - t0) / 1000).toFixed(2)}s`);
      return { ok: true, version: VERSION, servicios: reservables };

    } catch (e) {
      console.error(`${TAG} ❌ getCatalogoReserva:`, e.message);
      return { ok: false, version: VERSION, error: safeErr(e), servicios: [] };
    }
  }
);

// =====================================================
// 1b. GET STAFF COLUMNAS
// Empleados reales para las columnas del calendario, desde StaffConfig.
// Excluye recursos internos (CUALQUIERA, PROCESO) por su nota.
// =====================================================

export const getStaffColumnas = webMethod(
  Permissions.SiteMember,
  async () => {
    const t0 = Date.now();
    try {
      const result = await wixData.query(CMS_STAFF)
        .eq('active', true)
        .limit(100)
        .find({ suppressAuth: true });

      const items = result.items || [];
      const staff = items
        .filter(it => {
          const notas = String(it.notes || '');
          // Excluir CUALQUIERA / PROCESO y cualquier recurso interno marcado
          if (notas.includes(NOTA_RECURSO_INTERNO)) return false;
          const canon = String(it.canonicalName || '').toUpperCase();
          if (canon === 'CUALQUIERA' || canon === 'PROCESO') return false;
          return true;
        })
        .map(it => ({
          wixResourceId: it.wixResourceId || it._id,
          wixScheduleId: it.wixScheduleId || '',
          displayName: (it.displayName || it.canonicalName || '')
            .replace(/^[A-Z]_/, ''),  // quita prefijo A_/B_/C_ de orden (legacy)
          isExternal: !!it.isExternal,
          profileImage: it.profileImage || ''
        }))
        .sort((a, b) => a.displayName.localeCompare(b.displayName));

      console.log(`${TAG} ✅ getStaffColumnas: ${staff.length} empleados. ${((Date.now() - t0) / 1000).toFixed(2)}s`);
      return { ok: true, version: VERSION, staff };

    } catch (e) {
      console.error(`${TAG} ❌ getStaffColumnas:`, e.message);
      return { ok: false, version: VERSION, error: safeErr(e), staff: [] };
    }
  }
);

// =====================================================
// v1.1.4 patrón: GARANTIZAR CONTACTO CRM
// Copiado de externosLogic v1.1.5 ensureContactInCRM.
// =====================================================

async function ensureContactInCRM(contactDetails, memberContactId) {
  if (memberContactId && isGuid(memberContactId)) return memberContactId;

  const firstName = contactDetails?.firstName || '';
  const lastName = contactDetails?.lastName || '';
  const email = contactDetails?.email || '';
  const phone = contactDetails?.phone || '';

  if (!firstName && !email && !phone) {
    console.warn(`${TAG} ⚠️ ensureContactInCRM: sin datos suficientes`);
    return null;
  }

  try {
    const contactInfo = {
      name: { first: firstName, last: lastName },
      emails: (email && email !== 'booking@hair-times.com') ? [{ email }] : [],
      phones: phone ? [{ phone }] : []
    };
    const elevatedCreate = elevate(contacts.createContact);
    const result = await elevatedCreate(contactInfo, { allowDuplicates: false, suppressAuth: true });
    const newId = result?.contact?._id || result?._id || null;
    if (newId) console.log(`${TAG} ✅ Contacto CRM asegurado: ${newId}`);
    return newId;
  } catch (e) {
    console.warn(`${TAG} ⚠️ ensureContactInCRM falló: ${e.message}`);
    return null;
  }
}

// =====================================================
// CONSTRUIR FASES DEL PACK (modelo CMS-first)
// Lee mapeoFases del servicio principal y resuelve cada ref por setupUid.
// - fase "servicio" → genera una cita en cascada (consume tiempo, ocupa).
// - fase "proceso"  → hueco neutro: NO genera session, libera al stylist.
//   Solo desplaza el reloj de la cascada.
// Si mapeoFases vacío → servicio simple: una sola fase con el propio servicio.
// =====================================================

function construirFasesPack({ principal, porSetupUid, horaInicioISO }) {
  const fases = [];
  let cursorISO = horaInicioISO;

  const mapeo = jsonIn(principal.mapeoFases, 'items');

  if (!Array.isArray(mapeo) || mapeo.length === 0) {
    // Servicio simple (único / variantes / complemento): una fase = el propio servicio
    const dur = toNum(principal.duration);
    const endISO = addMinutes(cursorISO, dur);
    fases.push({
      fase: 'SERVICIO',
      tipo: 'servicio',
      setupUid: principal.setupUid || '',
      label: principal.label || '',
      start: cursorISO,
      end: endISO,
      dur,
      ocupa: true
    });
    cursorISO = endISO;
    return fases;
  }

  // Servicio complejo: recorrer mapeoFases en orden literal
  // Modelo v1.0.8:
  //   {tipo:'aplicacion'}  → duración = principal.duration  | label = principal.label
  //   {tipo:'proceso'}     → duración = principal.minProceso (sin min en el item)
  //   {tipo:'proceso', min:N} (LEGACY) → duración = N
  //   {tipo:'servicio', ref:setupUid} → duración del servicio referenciado
  //
  // Compat con editor v1.11.4 que NO guarda tipo:aplicacion explícito:
  // si el mapeo no incluye aplicacion, la anteponemos al inicio. Cuando el
  // editor permita reordenar libremente y emita {tipo:'aplicacion'}, este
  // fallback se desactiva solo (el contador detecta presencia explícita).
  const tieneAplicacionExplicita = mapeo.some(f => f && f.tipo === 'aplicacion');
  const recorrido = tieneAplicacionExplicita
    ? mapeo
    : [{ tipo: 'aplicacion' }, ...mapeo];

  for (const f of recorrido) {
    // — APLICACIÓN (el propio servicio principal aplicándose): ocupa stylist
    if (f?.tipo === 'aplicacion') {
      const dur = toNum(principal.duration);
      const endISO = addMinutes(cursorISO, dur);
      fases.push({
        fase: 'APLICACION',
        tipo: 'servicio',
        setupUid: principal.setupUid || '',
        label: principal.label || 'Aplicación',
        start: cursorISO,
        end: endISO,
        dur,
        ocupa: true
      });
      cursorISO = endISO;
      continue;
    }

    // — PROCESO (tiempo neutro): libera al stylist, no genera session
    if (f?.tipo === 'proceso') {
      // Compat: si viene `min` en el item lo usamos (legacy);
      // si no, leemos minProceso del propio servicio principal (modelo v1.0.8).
      const dur = (f.min != null && !isNaN(toNum(f.min)) && toNum(f.min) > 0)
        ? toNum(f.min)
        : toNum(principal.minProceso);
      const endISO = addMinutes(cursorISO, dur);
      fases.push({
        fase: 'PROCESO',
        tipo: 'proceso',
        setupUid: '',
        label: 'Proceso',
        start: cursorISO,
        end: endISO,
        dur,
        ocupa: false
      });
      cursorISO = endISO;
      continue;
    }

    // — SERVICIO referenciado por setupUid: ocupa stylist
    if (f?.tipo === 'servicio' && f.ref) {
      const svc = porSetupUid[f.ref];
      if (!svc) {
        console.warn(`${TAG} ⚠️ Fase ref no encontrada en catálogo: ${f.ref}`);
        continue;
      }
      const dur = toNum(svc.duration);
      const endISO = addMinutes(cursorISO, dur);
      fases.push({
        fase: 'SERVICIO',
        tipo: 'servicio',
        setupUid: svc.setupUid || '',
        label: svc.label || '',
        start: cursorISO,
        end: endISO,
        dur,
        ocupa: true
      });
      cursorISO = endISO;
    }
  }

  return fases;
}

// =====================================================
// 2. CREAR PACK RESERVA
// Resuelve ancla + fases + complementos, crea sessions (solo las que
// ocupan), inserta el pack en KamisuiteReservations.
//
// payload:
//   fecha 'YYYY-MM-DD', horaHHmm 'HH:mm',
//   principalSetupUid, complementosSetupUid[] (opcional),
//   staffId, staffName, contactDetails{firstName,lastName,email,phone},
//   memberContactId (opcional), notas (opcional)
//
// BLOQUE A: reserva manual. NO valida disponibilidad. El salón decide.
// =====================================================

export const crearPackReserva = webMethod(
  Permissions.SiteMember,
  async (payload) => {
    const t0 = Date.now();
    try {
      const {
        fecha,
        horaHHmm,
        principalSetupUid,
        complementosSetupUid = [],
        staffId = '',
        staffName = '',
        contactDetails = {},
        memberContactId = '',
        notas = '',
        esProvisional = false
      } = payload || {};

      if (!fecha || !horaHHmm || !principalSetupUid) {
        return { ok: false, version: VERSION, error: { message: 'Faltan fecha, horaHHmm o principalSetupUid' } };
      }

      // ─── 1. Cargar catálogo y localizar principal ───
      const { porSetupUid } = await cargarCatalogoCompleto();
      const principal = porSetupUid[principalSetupUid];
      if (!principal) {
        return { ok: false, version: VERSION, error: { message: `Servicio principal no encontrado: ${principalSetupUid}` } };
      }

      // ─── 2. Resolver ancla → scheduleId (por familia, desde la fila) ───
      const wixAnclaId = principal.wixAnclaId || '';
      const scheduleId = await resolverScheduleIdAncla(wixAnclaId);
      if (!scheduleId) {
        return { ok: false, version: VERSION, error: { message: `No se pudo resolver scheduleId del ancla ${wixAnclaId}` } };
      }

      // ─── 3. Garantizar contacto CRM (excepto si cliente provisional) ───
      // v1.0.6 — esProvisional: cliente eventual de paso, no se persiste en CRM.
      // contactId queda vacío → no recibe comunicaciones, no ensucia CRM.
      const finalContactId = esProvisional
        ? null
        : await ensureContactInCRM(contactDetails, memberContactId);

      // ─── 4. Construir fases del principal (cascada / simple) ───
      const startISO = madridToUTC(fecha, horaHHmm);
      let fasesPack = construirFasesPack({ principal, porSetupUid, horaInicioISO: startISO });

      // ─── 5. Añadir complementos al final del pack (mismo empleado) ───
      let cursorISO = fasesPack.length ? fasesPack[fasesPack.length - 1].end : startISO;
      const compArray = Array.isArray(complementosSetupUid) ? complementosSetupUid : [];
      for (const uid of compArray) {
        const c = porSetupUid[uid];
        if (!c) {
          console.warn(`${TAG} ⚠️ Complemento no encontrado: ${uid}`);
          continue;
        }
        const dur = toNum(c.duration);
        const endISO = addMinutes(cursorISO, dur);
        fasesPack.push({
          fase: 'COMPLEMENTO',
          tipo: 'servicio',
          setupUid: c.setupUid || '',
          label: c.label || '',
          start: cursorISO,
          end: endISO,
          dur,
          ocupa: true
        });
        cursorISO = endISO;
      }

      if (fasesPack.length === 0) {
        return { ok: false, version: VERSION, error: { message: 'El pack no generó ninguna fase' } };
      }

      // ─── 6. Calcular totales (precio del catálogo, nunca hardcoded) ───
      // Precio: principal + complementos. Las fases internas de cascada
      // ya están incluidas en el precio del principal (no se re-cobran).
      let precioTotal = toNum(principal.price);
      for (const uid of compArray) {
        const c = porSetupUid[uid];
        if (c) precioTotal += toNum(c.price);
      }
      const duracionTotal = Math.round(
        (new Date(cursorISO).getTime() - new Date(startISO).getTime()) / 60000
      );

      // ─── 7. Crear sessions SOLO de las fases que ocupan ───
      // PROCESO no genera session (libera al stylist — concepto fundacional).
      const clientName = `${contactDetails?.firstName || ''} ${contactDetails?.lastName || ''}`.trim();
      const sessionIds = [];

      for (const f of fasesPack) {
        if (!f.ocupa) continue; // PROCESO: saltar

        const notesText = [
          `${f.label}`,
          clientName,
          contactDetails?.phone || '',
          staffName ? `Staff: ${staffName}` : ''
        ].filter(Boolean).join(' | ');

        const sessionInfo = {
          scheduleId,
          start: { timestamp: new Date(f.start) },
          end: { timestamp: new Date(f.end) },
          type: 'EVENT',
          tags: ['Blocked'],
          notes: notesText
        };

        try {
          const created = await sessions.createSession(sessionInfo, { suppressAuth: true });
          const sid = created?._id || created?.id || '';
          f.sessionId = sid;
          if (sid) sessionIds.push(sid);
          console.log(`${TAG} ✅ Session ${f.fase}: ${sid} | ${formatLocalTime(new Date(f.start))}`);
        } catch (sErr) {
          console.error(`${TAG} ❌ createSession ${f.fase}: ${sErr.message}`);
          // Continúa con el resto del pack; la fase queda sin sessionId.
        }
      }

      // ─── 8. serviciosDetail (formato externos: "Label|precio;;...") ───
      const detailParts = [`${principal.label}|${toNum(principal.price)}`];
      for (const uid of compArray) {
        const c = porSetupUid[uid];
        if (c) detailParts.push(`${c.label}|${toNum(c.price)}`);
      }
      const serviciosDetail = detailParts.join(';;');

      // ─── 9. title legible ───
      const labelsPrincipales = [principal.label]
        .concat(compArray.map(uid => porSetupUid[uid]?.label).filter(Boolean));
      const title = `${labelsPrincipales.join(' + ')}${clientName ? ' — ' + clientName : ''}`;

      // ─── 10. Insertar pack en KamisuiteReservations ───
      const registro = {
        title,
        family: principal.family || 'simple',
        wixAnclaId,
        fechaReserva: new Date(startISO),
        duracionTotal,
        clientName,
        clientPhone: contactDetails?.phone || '',
        clientEmail: contactDetails?.email || '',
        contactId: finalContactId || '',
        staffId: staffId || '',
        staffName: staffName || '',
        fases: wrapItems(fasesPack),       // v1.0.7 — {"items":[...]} sin warning
        sessionIds: wrapIds(sessionIds),   // v1.0.7 — {"ids":[...]} sin warning
        precioTotal,
        status: 'CONFIRMADA',
        serviciosDetail,
        notes: notas || '',
        origenRecepcion: true
      };

      const inserted = await wixData.insert(CMS_RESERVAS, registro, { suppressAuth: true });
      const reservaId = inserted?._id || '';

      const elapsed = ((Date.now() - t0) / 1000).toFixed(2);
      console.log(`${TAG} ✅ Pack creado: ${reservaId} | ${fasesPack.length} fases | ${sessionIds.length} sessions | ${precioTotal}€ | ${elapsed}s`);

      return {
        ok: true,
        version: VERSION,
        reservaId,
        sessionIds,
        fases: fasesPack,
        precioTotal,
        duracionTotal,
        contactId: finalContactId,
        tiempo: elapsed
      };

    } catch (e) {
      console.error(`${TAG} ❌ crearPackReserva:`, e.message);
      return { ok: false, version: VERSION, error: safeErr(e) };
    }
  }
);

// =====================================================
// 3. GET RESERVAS POR FECHA
// Devuelve los packs del día (para pintar en el calendario).
// Filtro por rango UTC ±3h y verificación exacta de fecha Madrid.
// =====================================================

export const getReservasPorFecha = webMethod(
  Permissions.SiteMember,
  async ({ fecha }) => {
    try {
      if (!fecha) return { ok: false, version: VERSION, error: { message: 'Falta fecha' }, reservas: [] };

      const startUTC = new Date(new Date(`${fecha}T00:00:00`).getTime() - 3 * 3600000);
      const endUTC = new Date(new Date(`${fecha}T23:59:59`).getTime() + 3 * 3600000);

      const result = await wixData.query(CMS_RESERVAS)
        .ge('fechaReserva', startUTC)
        .le('fechaReserva', endUTC)
        .ascending('fechaReserva')
        .limit(200)
        .find({ suppressAuth: true });

      const reservas = (result.items || []).filter(item => {
        if (!item.fechaReserva) return false;
        const d = new Date(item.fechaReserva);
        const madridDate = d.toLocaleDateString('en-CA', { timeZone: TIMEZONE });
        return madridDate === fecha;
      }).map(item => ({
        _id: item._id,
        title: item.title || '',
        family: item.family || '',
        wixAnclaId: item.wixAnclaId || '',
        fechaReserva: item.fechaReserva ? new Date(item.fechaReserva).toISOString() : '',
        duracionTotal: toNum(item.duracionTotal),
        clientName: item.clientName || '',
        clientPhone: item.clientPhone || '',
        clientEmail: item.clientEmail || '',
        contactId: item.contactId || '',
        staffId: item.staffId || '',
        staffName: item.staffName || '',
        fases: jsonIn(item.fases, 'items'),
        sessionIds: jsonIn(item.sessionIds, 'ids'),
        precioTotal: toNum(item.precioTotal),
        status: item.status || 'CONFIRMADA',
        serviciosDetail: item.serviciosDetail || '',
        notes: item.notes || '',
        origenRecepcion: item.origenRecepcion !== false,
        extensionMin: toNum(item.extensionMin),  // v1.0.9
        productosVendidos: []                    // v1.0.13 — se rellena abajo
      }));

      // v1.0.13 — Cruzar con productos vendidos del día asociados a cada
      // reserva por contactId + proximidad temporal. La función
      // venderProductosDesdeAgenda guarda el bookingId como UUID propio
      // (no referencia a la reserva), por eso se hace match heurístico:
      //   · descripcion empieza con 🛒
      //   · staff = TIENDA (o similar)
      //   · mismo contactId que la reserva
      //   · fechaPago dentro del día visualizado
      // Si un cliente tiene varias reservas el mismo día y compra un
      // producto, se asocia a la reserva con menor diferencia |fechaPago - fechaReserva|.
      try {
        const contactIdsDelDia = [...new Set(reservas.map(r => r.contactId).filter(Boolean))];
        if (contactIdsDelDia.length) {
          const pagosProd = await wixData.query('PaymentReservations')
            .ge('fechaPago', startUTC)
            .le('fechaPago', endUTC)
            .hasSome('contactId', contactIdsDelDia)
            .limit(500)
            .find({ suppressAuth: true });

          for (const pago of (pagosProd.items || [])) {
            const desc = String(pago.descripcion || '').trim();
            if (!desc.startsWith('🛒')) continue;  // solo productos
            const cid = pago.contactId;
            if (!cid) continue;
            // Reservas candidatas con el mismo contactId
            const candidatas = reservas.filter(r => r.contactId === cid);
            if (!candidatas.length) continue;
            // Elegir la candidata con menor delta temporal
            const fp = new Date(pago.fechaPago).getTime();
            let mejor = candidatas[0];
            let mejorDelta = Math.abs(fp - new Date(mejor.fechaReserva).getTime());
            for (let i = 1; i < candidatas.length; i++) {
              const dlt = Math.abs(fp - new Date(candidatas[i].fechaReserva).getTime());
              if (dlt < mejorDelta) { mejor = candidatas[i]; mejorDelta = dlt; }
            }
            // Parsear nombre + precio + cantidad
            const m = desc.match(/^🛒\s*(.+?)\s*\(\s*([\d.,]+)\s*€?\s*\)\s*$/);
            if (!m) continue;
            let nombre = m[1].trim();
            const subtotal = parseFloat(m[2].replace(',', '.')) || 0;
            let cantidad = 1;
            const qty = nombre.match(/^(.+?)\s+x(\d+)\s*$/i);
            if (qty) { nombre = qty[1].trim(); cantidad = parseInt(qty[2], 10) || 1; }
            mejor.productosVendidos.push({
              paymentId: pago._id,
              nombre,
              cantidad,
              subtotal: Math.round(subtotal * 100) / 100,
              metodoPago: pago.tipoPago || '',
              fechaPago: pago.fechaPago ? new Date(pago.fechaPago).toISOString() : '',
              staff: pago.staff || ''
            });
          }
        }
      } catch (eProd) {
        console.warn(`${TAG} ⚠ cruce productos:`, eProd.message);
      }

      const totalProdVend = reservas.reduce((s, r) => s + r.productosVendidos.length, 0);
      console.log(`${TAG} ✅ getReservasPorFecha ${fecha}: ${reservas.length} packs, ${totalProdVend} productos vinculados`);
      return { ok: true, version: VERSION, reservas };

    } catch (e) {
      console.error(`${TAG} ❌ getReservasPorFecha:`, e.message);
      return { ok: false, version: VERSION, error: safeErr(e), reservas: [] };
    }
  }
);

// =====================================================
// 4. MARCAR PAGADO RESERVA
// status PAGADO + insert en PaymentReservations (patrón externos/tienda).
// bookingId = KRI_<reservaId>. Anti-duplicado por bookingId.
// =====================================================

export const marcarPagadoReserva = webMethod(
  Permissions.SiteMember,
  async ({ reservaId, metodoPago, desglosemetodopago, importeNeto, descripcionExtra }) => {
    try {
      if (!reservaId) {
        return { ok: false, version: VERSION, error: { message: 'Falta reservaId' } };
      }

      let registro;
      try {
        registro = await wixData.get(CMS_RESERVAS, reservaId, { suppressAuth: true });
      } catch (e) {
        return { ok: false, version: VERSION, error: { message: `Reserva no encontrada: ${reservaId}` } };
      }
      if (!registro) {
        return { ok: false, version: VERSION, error: { message: `Reserva no encontrada: ${reservaId}` } };
      }

      if (registro.status === 'PAGADO') {
        console.warn(`${TAG} ⚠️ Ya estaba PAGADO: ${reservaId}`);
        return { ok: true, version: VERSION, yaEstabaPagado: true };
      }

      // 1. Actualizar status (READ-MERGE-UPDATE: registro completo ya leído)
      registro.status = 'PAGADO';
      await wixData.update(CMS_RESERVAS, registro, { suppressAuth: true });
      console.log(`${TAG} ✅ KamisuiteReservations → PAGADO`);

      // 2. Insert en PaymentReservations (anti-duplicado por bookingId)
      try {
        const ahora = new Date();
        const bookingIdKey = `${PREFIJO_PAGO}${reservaId}`;

        // Descripción legible desde serviciosDetail
        let descripcion = '';
        if (registro.serviciosDetail) {
          descripcion = registro.serviciosDetail.split(';;').filter(Boolean).map(s => {
            const [name, price] = s.split('|');
            return `${name || '?'} (${price || 0}€)`;
          }).join(', ');
        } else {
          descripcion = registro.title || 'Servicio salón';
        }

        // v1.0.4 — concatenar descripcionExtra (token descuento o cualquier nota)
        if (descripcionExtra && String(descripcionExtra).trim()) {
          descripcion = descripcion ? `${descripcion}, ${String(descripcionExtra).trim()}` : String(descripcionExtra).trim();
        }

        const existente = await wixData.query(CMS_PAGOS)
          .eq('bookingId', bookingIdKey)
          .limit(1)
          .find({ suppressAuth: true });

        if (existente.items.length > 0) {
          console.warn(`${TAG} ⚠️ PaymentReservations ya tiene: ${bookingIdKey}`);
        } else {
          // v1.0.4 — usar importeNeto si llega y es válido (>=0); si no, precioTotal del registro
          const importeFinal = (importeNeto != null && !isNaN(Number(importeNeto)) && Number(importeNeto) >= 0)
            ? Number(importeNeto)
            : toNum(registro.precioTotal);

          const registroPago = {
            bookingId: bookingIdKey,
            contactId: registro.contactId || '',
            descripcion,
            fechaReserva: registro.fechaReserva || ahora,
            fechaPago: ahora,
            importeTotal: importeFinal,
            nombreCliente: registro.clientName || 'Cliente',
            staff: registro.staffName || '',
            tipoPago: metodoPago || 'Efectivo',
            desglosemetodopago: desglosemetodopago || ''
          };

          await wixData.insert(CMS_PAGOS, registroPago, { suppressAuth: true });
          console.log(`${TAG} ✅ PaymentReservations insertado: ${bookingIdKey} | ${registroPago.importeTotal}€ | ${metodoPago}`);
        }
      } catch (payErr) {
        console.warn(`${TAG} ⚠️ Error PaymentReservations: ${payErr.message}`);
      }

      return { ok: true, version: VERSION, reservaId, metodoPago };

    } catch (e) {
      console.error(`${TAG} ❌ marcarPagadoReserva:`, e.message);
      return { ok: false, version: VERSION, error: safeErr(e) };
    }
  }
);

// =====================================================
// 5. CANCELAR RESERVA
// Borra las sessions del pack + status CANCELADA.
// =====================================================

export const cancelarReserva = webMethod(
  Permissions.SiteMember,
  async ({ reservaId }) => {
    try {
      if (!reservaId) {
        return { ok: false, version: VERSION, error: { message: 'Falta reservaId' } };
      }

      let registro;
      try {
        registro = await wixData.get(CMS_RESERVAS, reservaId, { suppressAuth: true });
      } catch (e) {
        return { ok: false, version: VERSION, error: { message: `Reserva no encontrada: ${reservaId}` } };
      }
      if (!registro) {
        return { ok: false, version: VERSION, error: { message: `Reserva no encontrada: ${reservaId}` } };
      }

      // 1. Borrar sessions del calendario
      const sessionIds = jsonIn(registro.sessionIds, 'ids');
      let borradas = 0;
      for (const sid of (Array.isArray(sessionIds) ? sessionIds : [])) {
        if (!sid) continue;
        try {
          await sessions.deleteSession(sid, { suppressAuth: true });
          borradas++;
        } catch (sErr) {
          console.warn(`${TAG} ⚠️ No se pudo borrar session ${sid}: ${sErr.message}`);
        }
      }

      // 2. status CANCELADA (READ-MERGE-UPDATE)
      registro.status = 'CANCELADA';
      await wixData.update(CMS_RESERVAS, registro, { suppressAuth: true });

      console.log(`${TAG} ✅ Reserva ${reservaId} CANCELADA | ${borradas} sessions borradas`);
      return { ok: true, version: VERSION, reservaId, sessionesBorradas: borradas };

    } catch (e) {
      console.error(`${TAG} ❌ cancelarReserva:`, e.message);
      return { ok: false, version: VERSION, error: safeErr(e) };
    }
  }
);

// =====================================================
// 6. CREAR RESERVA A MEDIDA (servicio fuera de catálogo)  v1.0.5
//   Inserta una fila standalone en KamisuiteReservations con family='medida'.
//   No crea sessions en Wix Bookings (no hay ancla).
//   No escribe en PaymentReservations (se cobra luego, como cualquier cita).
// =====================================================

export const crearReservaMedida = webMethod(
  Permissions.SiteMember,
  async ({ fechaISO, horaHHmm, duracionMin, staffId, staffName, descripcion, precio, contactDetails, memberContactId }) => {
    try {
      if (!fechaISO) return { ok: false, version: VERSION, error: { message: 'Falta fechaISO' } };
      if (!horaHHmm) return { ok: false, version: VERSION, error: { message: 'Falta horaHHmm' } };
      if (!staffId)  return { ok: false, version: VERSION, error: { message: 'Falta staffId' } };
      const dur = toNum(duracionMin);
      if (!dur || dur < 5) return { ok: false, version: VERSION, error: { message: 'Duración inválida (mínimo 5 min)' } };
      const price = toNum(precio);
      if (price < 0) return { ok: false, version: VERSION, error: { message: 'Precio inválido' } };
      const desc = String(descripcion || '').trim();
      if (!desc) return { ok: false, version: VERSION, error: { message: 'Falta descripción' } };

      // Combinar fechaISO + horaHHmm en Madrid → UTC (mismo helper que el resto)
      // madridToUTC devuelve STRING ISO; para insertar al CMS hace falta Date.
      const fechaReservaISO = madridToUTC(fechaISO, horaHHmm);
      if (!fechaReservaISO) return { ok: false, version: VERSION, error: { message: 'Fecha/hora inválida' } };

      const cd = contactDetails || {};
      const clientName = [cd.firstName || '', cd.lastName || ''].filter(Boolean).join(' ').trim() || 'Cliente';
      const clientPhone = cd.phone || '';
      const clientEmail = cd.email || '';

      const ts = Date.now();
      const registro = {
        title: desc,
        family: 'medida',
        claseServicio: 'medida',
        setupUid: 'MEDIDA-' + ts,
        wixAnclaId: '',
        fechaReserva: new Date(fechaReservaISO),
        duracionTotal: dur,
        precioTotal: price,
        clientName,
        clientPhone,
        clientEmail,
        contactId: memberContactId || '',
        staffId,
        staffName: staffName || '',
        fases: wrapItems([]),         // v1.0.7 — sin cascada
        sessionIds: wrapIds([]),      // v1.0.7 — sin sessions Wix Bookings
        serviciosDetail: `${desc}|${price}`,
        status: 'CONFIRMADA',
        notes: 'Servicio a medida (fuera de catálogo)',
        origenRecepcion: true
      };

      const inserted = await wixData.insert(CMS_RESERVAS, registro, { suppressAuth: true });
      console.log(`${TAG} ✅ Reserva a medida creada: ${inserted._id} | ${desc} | ${dur}min | ${price}€ | ${horaHHmm} | staff=${staffId}`);

      return {
        ok: true,
        version: VERSION,
        reservaId: inserted._id,
        fechaReserva: fechaReservaISO,
        duracionTotal: dur,
        precioTotal: price
      };

    } catch (e) {
      console.error(`${TAG} ❌ crearReservaMedida:`, e.message);
      return { ok: false, version: VERSION, error: safeErr(e) };
    }
  }
);

// =====================================================
// 7. EXTENDER / QUITAR EXTENSIÓN (v1.0.9)
// =====================================================
// La extensión se persiste en el propio registro como campo extensionMin
// (type Number, default 0). El widget pinta un bloque rayado debajo del
// último bloque ocupante cuando extensionMin > 0.
// =====================================================

export const extenderReserva = webMethod(
  Permissions.SiteMember,
  async ({ reservaId, minutosExtra }) => {
    try {
      console.log(`${TAG} 📐 Extender reserva: ${reservaId} → +${minutosExtra} min`);
      if (!reservaId) return { ok: false, error: 'reservaId requerido' };
      const min = Math.max(0, Math.round(Number(minutosExtra) || 0));

      // READ
      const result = await wixData.query(CMS_RESERVAS)
        .eq('_id', reservaId).limit(1)
        .find({ suppressAuth: true });
      if (result.items.length === 0) {
        return { ok: false, error: 'Reserva no encontrada' };
      }
      const registro = result.items[0];

      // MERGE — solo extensionMin
      registro.extensionMin = min;

      // UPDATE
      await wixData.update(CMS_RESERVAS, registro, { suppressAuth: true });
      console.log(`${TAG} ✅ extensionMin actualizado a ${min} min en ${reservaId}`);

      return { ok: true, reservaId, extensionMin: min };
    } catch (e) {
      console.error(`${TAG} ❌ extenderReserva:`, e.message);
      return { ok: false, error: e.message };
    }
  }
);

export const quitarExtension = webMethod(
  Permissions.SiteMember,
  async ({ reservaId }) => {
    try {
      console.log(`${TAG} 🗑️ Quitar extensión de reserva: ${reservaId}`);
      if (!reservaId) return { ok: false, error: 'reservaId requerido' };

      const result = await wixData.query(CMS_RESERVAS)
        .eq('_id', reservaId).limit(1)
        .find({ suppressAuth: true });
      if (result.items.length === 0) {
        return { ok: false, error: 'Reserva no encontrada' };
      }
      const registro = result.items[0];
      registro.extensionMin = 0;
      await wixData.update(CMS_RESERVAS, registro, { suppressAuth: true });
      console.log(`${TAG} ✅ extensionMin = 0 en ${reservaId}`);

      return { ok: true, reservaId };
    } catch (e) {
      console.error(`${TAG} ❌ quitarExtension:`, e.message);
      return { ok: false, error: e.message };
    }
  }
);

// =====================================================
// 8. ANTES DE COBRAR (v1.0.10): reprogramar, extra, complemento, producto
// =====================================================
// Todas las funciones siguen patrón READ-MERGE-UPDATE de KamisuiteReservations.
// No tocan sessions de Wix Bookings. No generan pago. Solo modifican la fila
// de la reserva para que al cobrar se cobre el TOTAL ya actualizado.
// =====================================================

// ─── 8.1 Reprogramar reserva (cambiar fecha/hora) ─────────────
// Recalcula `fechaReserva` + start/end de cada fase aplicando el delta.
// No toca precio ni catálogo.
export const reprogramarReserva = webMethod(
  Permissions.SiteMember,
  async ({ reservaId, nuevaFechaISO }) => {
    try {
      console.log(`${TAG} 🗓 Reprogramar ${reservaId} → ${nuevaFechaISO}`);
      if (!reservaId || !nuevaFechaISO) return { ok: false, error: 'Faltan reservaId o nuevaFechaISO' };

      const result = await wixData.query(CMS_RESERVAS)
        .eq('_id', reservaId).limit(1)
        .find({ suppressAuth: true });
      if (result.items.length === 0) return { ok: false, error: 'Reserva no encontrada' };

      const registro = result.items[0];
      const oldDate = new Date(registro.fechaReserva);
      const newDate = new Date(nuevaFechaISO);
      if (isNaN(newDate.getTime())) return { ok: false, error: 'nuevaFechaISO inválida' };

      const deltaMs = newDate.getTime() - oldDate.getTime();
      registro.fechaReserva = newDate;

      // Recalcular fases con delta
      const fasesArr = jsonIn(registro.fases, 'items');
      const fasesNew = fasesArr.map(f => {
        const nf = { ...f };
        if (f.start) nf.start = new Date(new Date(f.start).getTime() + deltaMs).toISOString();
        if (f.end) nf.end = new Date(new Date(f.end).getTime() + deltaMs).toISOString();
        return nf;
      });
      registro.fases = { items: fasesNew };

      await wixData.update(CMS_RESERVAS, registro, { suppressAuth: true });
      console.log(`${TAG} ✅ Reprogramada ${reservaId}: ${oldDate.toISOString()} → ${newDate.toISOString()}`);
      return { ok: true, reservaId, fechaReserva: newDate.toISOString() };
    } catch (e) {
      console.error(`${TAG} ❌ reprogramarReserva:`, e.message);
      return { ok: false, error: e.message };
    }
  }
);

// ─── 8.2 Añadir cargo Extra (manual) ─────────────────────────
// Suma importe a precioTotal y añade item al serviciosDetail con marker.
// Formato del item: "[EXTRA] descripcion|importe|1"  (cant=1, cabe en parser V1)
export const agregarExtraReserva = webMethod(
  Permissions.SiteMember,
  async ({ reservaId, importe, descripcion }) => {
    try {
      const imp = Math.round((Number(importe) || 0) * 100) / 100;
      const desc = String(descripcion || 'Extra').trim();
      console.log(`${TAG} ✎ Extra en ${reservaId}: ${imp}€ "${desc}"`);
      if (!reservaId) return { ok: false, error: 'reservaId requerido' };
      if (!imp || imp <= 0) return { ok: false, error: 'Importe inválido (>0)' };

      const result = await wixData.query(CMS_RESERVAS)
        .eq('_id', reservaId).limit(1)
        .find({ suppressAuth: true });
      if (result.items.length === 0) return { ok: false, error: 'Reserva no encontrada' };

      const registro = result.items[0];
      registro.precioTotal = (Number(registro.precioTotal) || 0) + imp;

      const detalleActual = String(registro.serviciosDetail || '');
      const nuevoItem = `[EXTRA] ${desc}|${imp}|1`;
      registro.serviciosDetail = detalleActual ? `${detalleActual};;${nuevoItem}` : nuevoItem;

      await wixData.update(CMS_RESERVAS, registro, { suppressAuth: true });
      console.log(`${TAG} ✅ Extra añadido. precioTotal=${registro.precioTotal}€`);
      return { ok: true, reservaId, precioTotal: registro.precioTotal };
    } catch (e) {
      console.error(`${TAG} ❌ agregarExtraReserva:`, e.message);
      return { ok: false, error: e.message };
    }
  }
);

// ─── 8.3 Añadir Complemento (servicio del catálogo) ──────────
// Lee el complemento desde ServiceCatalog (por setupUid). Suma duracionTotal
// y precioTotal. Añade al detalle. Añade una fase {tipo:'servicio',ref} al
// FINAL del array de fases, con start = end de la última fase ocupante
// (si no hay ninguna ocupante, usa fechaReserva).
export const agregarComplementoReserva = webMethod(
  Permissions.SiteMember,
  async ({ reservaId, setupUid }) => {
    try {
      console.log(`${TAG} ⛓ Complemento en ${reservaId}: setupUid=${setupUid}`);
      if (!reservaId || !setupUid) return { ok: false, error: 'Faltan reservaId o setupUid' };

      // Reserva
      const r1 = await wixData.query(CMS_RESERVAS)
        .eq('_id', reservaId).limit(1)
        .find({ suppressAuth: true });
      if (r1.items.length === 0) return { ok: false, error: 'Reserva no encontrada' };
      const registro = r1.items[0];

      // Servicio complemento del catálogo
      const r2 = await wixData.query(CMS_CATALOGO)
        .eq('setupUid', setupUid).limit(1)
        .find({ suppressAuth: true });
      if (r2.items.length === 0) return { ok: false, error: 'Complemento no encontrado en catálogo' };
      const svc = r2.items[0];
      const svcDur = Number(svc.duration) || 0;
      const svcPrice = Number(svc.price) || 0;
      const svcLabel = svc.label || 'Complemento';

      // Calcular start de la nueva fase
      // v1.0.16 FIX: tomar MAX(end) de las fases ocupantes, no la última
      // del array. Con drag&drop una fase movida más tarde puede estar
      // en posición intermedia del array → tomar la última del array
      // hacía que el nuevo bloque cayera ENCIMA de fases ya movidas.
      const fasesArr = jsonIn(registro.fases, 'items');
      let startISO;
      const ocupantesConEnd = fasesArr.filter(f => f && f.ocupa && f.end);
      if (ocupantesConEnd.length) {
        const maxEndMs = ocupantesConEnd.reduce((max, f) => {
          const e = new Date(f.end).getTime();
          return isNaN(e) ? max : Math.max(max, e);
        }, 0);
        startISO = new Date(maxEndMs).toISOString();
      } else if (registro.fechaReserva) {
        const dur = Number(registro.duracionTotal) || 0;
        startISO = new Date(new Date(registro.fechaReserva).getTime() + dur * 60000).toISOString();
      } else {
        return { ok: false, error: 'No se puede calcular start del complemento' };
      }
      const endISO = new Date(new Date(startISO).getTime() + svcDur * 60000).toISOString();

      // Añadir fase al array
      fasesArr.push({
        fase: 'COMPLEMENTO',
        tipo: 'servicio',
        setupUid: svc.setupUid,
        label: svcLabel,
        start: startISO,
        end: endISO,
        dur: svcDur,
        ocupa: true
      });
      registro.fases = { items: fasesArr };
      registro.duracionTotal = (Number(registro.duracionTotal) || 0) + svcDur;
      registro.precioTotal = (Number(registro.precioTotal) || 0) + svcPrice;

      // Detalle (formato V1: nombre|precio|1)
      const detalleActual = String(registro.serviciosDetail || '');
      const nuevoItem = `${svcLabel}|${svcPrice}|1`;
      registro.serviciosDetail = detalleActual ? `${detalleActual};;${nuevoItem}` : nuevoItem;

      await wixData.update(CMS_RESERVAS, registro, { suppressAuth: true });
      console.log(`${TAG} ✅ Complemento añadido: ${svcLabel} (+${svcDur}min, +${svcPrice}€)`);
      return { ok: true, reservaId, label: svcLabel, duracionTotal: registro.duracionTotal, precioTotal: registro.precioTotal };
    } catch (e) {
      console.error(`${TAG} ❌ agregarComplementoReserva:`, e.message);
      return { ok: false, error: e.message };
    }
  }
);

// ─── 8.4.2 Servicio adicional (nuevo servicio principal en la cita) ──
// v1.0.15: añade un servicio principal NUEVO al final de la cita existente.
// Reutiliza `construirFasesPack` para armar las fases del nuevo servicio
// (con cascada completa si es complejo, o una sola fase si es simple).
//   - reservaId: id de la reserva existente
//   - setupUid:  setupUid del nuevo servicio (puede ser simple o complejo)
//   - precioOverride: opcional, si se quiere forzar otro precio (variantes)
// Regla pedida por Jal: el servicio adicional se ENCADENA al final, después
// de la última fase ocupante de la cita actual.
export const agregarServicioReserva = webMethod(
  Permissions.SiteMember,
  async ({ reservaId, setupUid, precioOverride }) => {
    try {
      console.log(`${TAG} ➕ Servicio adicional en ${reservaId}: setupUid=${setupUid}`);
      if (!reservaId || !setupUid) return { ok: false, error: 'Faltan reservaId o setupUid' };

      // Reserva
      const r1 = await wixData.query(CMS_RESERVAS)
        .eq('_id', reservaId).limit(1)
        .find({ suppressAuth: true });
      if (r1.items.length === 0) return { ok: false, error: 'Reserva no encontrada' };
      const registro = r1.items[0];
      if (registro.status === 'PAGADO') return { ok: false, error: 'No se puede modificar una cita ya cobrada' };

      // Catálogo completo (para resolver refs de mapeoFases si el servicio nuevo
      // es complejo y referencia setupUids de otros servicios)
      const { porSetupUid } = await cargarCatalogoCompleto();
      const principal = porSetupUid[setupUid];
      if (!principal) return { ok: false, error: 'Servicio nuevo no encontrado en catálogo' };

      // Hora de inicio del NUEVO servicio = MAX(end) de fases ocupantes
      // v1.0.16 FIX: con drag&drop una fase movida más tarde puede estar
      // en posición intermedia del array. Tomar la última posición hacía
      // que el nuevo servicio se montara ENCIMA de fases ya movidas.
      const fasesArr = jsonIn(registro.fases, 'items');
      const ocupantesConEnd = fasesArr.filter(f => f && f.ocupa && f.end);
      let horaInicioISO;
      if (ocupantesConEnd.length) {
        const maxEndMs = ocupantesConEnd.reduce((max, f) => {
          const e = new Date(f.end).getTime();
          return isNaN(e) ? max : Math.max(max, e);
        }, 0);
        horaInicioISO = new Date(maxEndMs).toISOString();
      } else if (registro.fechaReserva) {
        const dur = Number(registro.duracionTotal) || 0;
        horaInicioISO = new Date(new Date(registro.fechaReserva).getTime() + dur * 60000).toISOString();
      } else {
        return { ok: false, error: 'No se puede calcular hora de inicio del servicio adicional' };
      }

      // Construir las fases del nuevo servicio (cascada o simple)
      const fasesNuevas = construirFasesPack({ principal, porSetupUid, horaInicioISO });
      if (!Array.isArray(fasesNuevas) || fasesNuevas.length === 0) {
        return { ok: false, error: 'No se pudieron construir las fases del servicio adicional' };
      }

      // Concatenar al final
      const fasesFinales = [...fasesArr, ...fasesNuevas];

      // Recalcular duración total = sumar duración del nuevo servicio
      const durNuevo = fasesNuevas.reduce((s, f) => s + (Number(f.dur) || 0), 0);
      const nuevaDuracionTotal = (Number(registro.duracionTotal) || 0) + durNuevo;

      // Precio: usar precioOverride si llega, o principal.price
      const precioNuevo = precioOverride != null ? Number(precioOverride) : (Number(principal.price) || 0);
      const nuevoPrecioTotal = (Number(registro.precioTotal) || 0) + precioNuevo;

      // Detalle (formato V1: nombre|precio|1)
      const detalleActual = String(registro.serviciosDetail || '');
      const nuevoItem = `${principal.label || 'Servicio'}|${precioNuevo}|1`;
      const detalleNuevo = detalleActual ? `${detalleActual};;${nuevoItem}` : nuevoItem;

      registro.fases = { items: fasesFinales };
      registro.duracionTotal = nuevaDuracionTotal;
      registro.precioTotal = nuevoPrecioTotal;
      registro.serviciosDetail = detalleNuevo;

      await wixData.update(CMS_RESERVAS, registro, { suppressAuth: true });
      console.log(`${TAG} ✅ Servicio añadido: ${principal.label} (+${durNuevo}min, +${precioNuevo}€) | fases nuevas: ${fasesNuevas.length}`);
      return {
        ok: true,
        reservaId,
        label: principal.label,
        precio: precioNuevo,
        duracionTotal: nuevaDuracionTotal,
        precioTotal: nuevoPrecioTotal,
        fasesAdded: fasesNuevas.length
      };
    } catch (e) {
      console.error(`${TAG} ❌ agregarServicioReserva:`, e.message);
      return { ok: false, error: e.message };
    }
  }
);

// ─── 8.4 Producto: DEPRECATED en v1.0.11 ────────────────────
// La venta de productos NO se mete en la fila de la reserva. V2 usa la
// misma función V1 `venderProductosDesdeAgenda` de `tiendaProductos.web`,
// que registra la venta como entrada independiente vinculada al packId.
// El widget llama directamente a esa función vía el page code.
// (En v1.0.10 había aquí una `agregarProductoReserva` que consultaba la
// colección "Productos" — colección inexistente en este tenant —
// causando el error WD_SCHEMA_DOES_NOT_EXIST. Eliminada.)

// ─── 8.5 Quitar Item de la reserva (✕ en cada línea del modal) ──
// Recibe el índice del item dentro de serviciosDetail (split por ';;')
// y lo elimina, recalculando precioTotal. NO toca fases ni duracionTotal
// para no descuadrar el calendario; eso queda para una iteración posterior
// si se quiere ajustar geometría tras quitar un complemento.
export const quitarItemReserva = webMethod(
  Permissions.SiteMember,
  async ({ reservaId, itemIndex }) => {
    try {
      const idx = Math.max(0, parseInt(itemIndex, 10) || 0);
      console.log(`${TAG} ✕ Quitar item ${idx} de ${reservaId}`);
      if (!reservaId) return { ok: false, error: 'reservaId requerido' };

      const result = await wixData.query(CMS_RESERVAS)
        .eq('_id', reservaId).limit(1)
        .find({ suppressAuth: true });
      if (result.items.length === 0) return { ok: false, error: 'Reserva no encontrada' };

      const registro = result.items[0];
      const detalle = String(registro.serviciosDetail || '');
      const items = detalle.split(';;').filter(Boolean);
      if (idx >= items.length) return { ok: false, error: 'Índice fuera de rango' };
      if (items.length <= 1) return { ok: false, error: 'No se puede vaciar la cita. Cancélala si no quieres ningún servicio.' };

      // Calcular precio del item eliminado: formato "label|price|cant"
      const itemFuera = items[idx];
      const partes = itemFuera.split('|');
      const precioUnit = Number(partes[1]) || 0;
      const cant = Number(partes[2]) || 1;
      const subtotal = Math.round(precioUnit * cant * 100) / 100;

      // Eliminar y recomponer
      items.splice(idx, 1);
      registro.serviciosDetail = items.join(';;');
      registro.precioTotal = Math.max(0, (Number(registro.precioTotal) || 0) - subtotal);

      await wixData.update(CMS_RESERVAS, registro, { suppressAuth: true });
      console.log(`${TAG} ✅ Item quitado: "${itemFuera}" (-${subtotal}€). Resto: ${items.length} items, precioTotal=${registro.precioTotal}€`);
      return { ok: true, reservaId, itemRemoved: itemFuera, subtotalRemoved: subtotal, precioTotal: registro.precioTotal };
    } catch (e) {
      console.error(`${TAG} ❌ quitarItemReserva:`, e.message);
      return { ok: false, error: e.message };
    }
  }
);

// =====================================================
// 8.5 MOVER FASE (drag&drop por fase)
// =====================================================
// v1.0.14: una fase del array `fases` puede asignarse a otro staff
// y/o cambiar de hora. Es la base del drag&drop de fases en V2.
//   - reservaId: id de la KamisuiteReservations
//   - faseIndex: índice de la fase en el array
//   - nuevoStartISO: ISO de la nueva hora de inicio (la duración se
//     mantiene)
//   - nuevoStaffId: id del nuevo staff. '' o null → la fase vuelve
//     a heredar el staff raíz de la reserva (sin override).
// Reglas:
//   - Reserva PAGADO no se mueve.
//   - Fase con ocupa=false (PROCESO) no es draggable; se rechaza.
//   - Recalcula fechaReserva = min start de fases ocupantes,
//     duracionTotal = max end − min start.
//   - NO valida conflictos con otras reservas (mismo comportamiento
//     que V1 con forzado:true). El operador es el responsable.

export const moverFase = webMethod(
  Permissions.SiteMember,
  async ({ reservaId, faseIndex, nuevoStartISO, nuevoStaffId }) => {
    try {
      console.log(`${TAG} 🟰 moverFase reserva=${reservaId} idx=${faseIndex} start=${nuevoStartISO} staff=${nuevoStaffId || '(raíz)'}`);
      if (!reservaId) return { ok: false, error: 'Falta reservaId' };
      if (faseIndex == null || isNaN(Number(faseIndex))) return { ok: false, error: 'faseIndex inválido' };
      if (!nuevoStartISO) return { ok: false, error: 'Falta nuevoStartISO' };

      const newStartDate = new Date(nuevoStartISO);
      if (isNaN(newStartDate.getTime())) return { ok: false, error: 'nuevoStartISO inválida' };

      let registro;
      try {
        registro = await wixData.get(CMS_RESERVAS, reservaId, { suppressAuth: true });
      } catch (e) {
        return { ok: false, error: `Reserva no encontrada: ${reservaId}` };
      }
      if (!registro) return { ok: false, error: `Reserva no encontrada: ${reservaId}` };
      if (registro.status === 'PAGADO') return { ok: false, error: 'No se puede mover una cita ya cobrada' };

      const fasesArr = jsonIn(registro.fases, 'items');
      const idx = Number(faseIndex);
      if (idx < 0 || idx >= fasesArr.length) return { ok: false, error: `faseIndex fuera de rango (0..${fasesArr.length - 1})` };

      const faseActual = fasesArr[idx];
      if (!faseActual) return { ok: false, error: 'Fase no encontrada' };
      if (faseActual.ocupa === false) return { ok: false, error: 'Las fases de proceso no son movibles' };

      // Duración: conservar la actual de la fase
      let dur = Number(faseActual.dur) || 0;
      if (!dur && faseActual.start && faseActual.end) {
        dur = Math.max(1, Math.round((new Date(faseActual.end).getTime() - new Date(faseActual.start).getTime()) / 60000));
      }
      if (!dur) dur = 30;

      const newEndDate = new Date(newStartDate.getTime() + dur * 60000);

      // Actualizar la fase concreta
      const fasesNew = fasesArr.map((f, i) => {
        if (i !== idx) return { ...f };
        const nf = { ...f, start: newStartDate.toISOString(), end: newEndDate.toISOString() };
        const staffIdLimpio = (nuevoStaffId == null || String(nuevoStaffId).trim() === '') ? null : String(nuevoStaffId).trim();
        if (staffIdLimpio && staffIdLimpio !== registro.staffId) {
          nf.staffId = staffIdLimpio;
        } else {
          delete nf.staffId;
        }
        return nf;
      });

      // Recalcular fechaReserva = min(start) y duracionTotal = max(end) − min(start)
      const ocupantes = fasesNew.filter(f => f && f.ocupa);
      let minStart = Infinity, maxEnd = -Infinity;
      for (const f of ocupantes) {
        if (f.start) {
          const s = new Date(f.start).getTime();
          if (s < minStart) minStart = s;
        }
        if (f.end) {
          const e = new Date(f.end).getTime();
          if (e > maxEnd) maxEnd = e;
        }
      }
      if (!isFinite(minStart) || !isFinite(maxEnd)) {
        minStart = newStartDate.getTime();
        maxEnd = newEndDate.getTime();
      }

      registro.fases = { items: fasesNew };
      registro.fechaReserva = new Date(minStart);
      registro.duracionTotal = Math.max(1, Math.round((maxEnd - minStart) / 60000));

      await wixData.update(CMS_RESERVAS, registro, { suppressAuth: true });
      console.log(`${TAG} ✅ Fase movida: idx=${idx} start=${newStartDate.toISOString()} staff=${nuevoStaffId || '(raíz)'} | nuevaFechaReserva=${registro.fechaReserva.toISOString()} duracionTotal=${registro.duracionTotal}min`);
      return {
        ok: true,
        reservaId,
        faseIndex: idx,
        fechaReserva: registro.fechaReserva.toISOString(),
        duracionTotal: registro.duracionTotal
      };
    } catch (e) {
      console.error(`${TAG} ❌ moverFase:`, e.message);
      return { ok: false, error: e.message };
    }
  }
);

// =====================================================
// 9. GET CONSTANTS (utilidad de diagnóstico)
// =====================================================

export const getConstants = webMethod(
  Permissions.Anyone,
  async () => {
    return {
      ok: true,
      version: VERSION,
      collections: { CMS_CATALOGO, CMS_RESERVAS, CMS_PAGOS },
      prefijoPago: PREFIJO_PAGO,
      timezone: TIMEZONE
    };
  }
);