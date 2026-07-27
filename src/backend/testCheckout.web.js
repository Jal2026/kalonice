// =====================================================
// BACKEND testCheckout.web - Checkout KAMISUITE v3.26.5
// =====================================================
// ✅ Precios desde services.getService
// ✅ FIX v3.3: Ruta correcta es namespaces._user_fields.promocin
// ✅ NUEVO v3.4: Añadido método de pago MIXTO
// ✅ NUEVO v3.6: cancelarBookingsPack (borrar pack desde checkout)
// ✅ NUEVO v3.6: bookingIds (todos) en cada pack para borrado completo
// ✅ FIX v3.7: Filtro de fecha en query (antes perdía citas)
// ✅ NUEVO v3.8: Lectura campo reservaderecepcion para marcar origen
// ✅ FIX v3.9: Agrupación por contactId > email > nombre+tel (antes solo email)
// ✅ NUEVO v3.12: staffId en extraerServicio + contactId en pack
// ✅ FIX v3.13: Agrupación por contactId + staffId (SUPERADO por v3.15)
// ✅ NUEVO v3.14: generarFactura --- Wix Invoices API post-pago
// ✅ FIX v3.14b: Email fallback info@hair-times.com si cliente sin email
// ✅ FIX v3.15: Agrupación solo por contactId + contigüidad (sin staffId)
// ✅ NUEVO v3.15: staffNames en pack --- array de empleados únicos del pack
// ✅ NUEVO v3.16: Extra personalizado (extra_checkout extended field)
// ✅ FIX v3.17: Nombre en factura — fallback CRM con contacts.getContact
// ✅ NUEVO v3.17: Import wix-crm.v2 contacts
// ✅ FIX v3.18: Precio y nombre correcto para bookings con addons
// ✅ NUEVO v3.19: metodoPago en extraerServicio — lee extended fields de pago
// ✅ NUEVO v3.20: obtenerDatosCierreDia — Externos + Productos en panel cierre
// ✅ NUEVO v3.21: Productos de Wix Stores en cards de checkout (vía searchOrders)
// ✅ FIX v3.22: Anti-duplicados en PaymentReservations
// ✅ NUEVO v3.23: Cambiar fecha/hora de citas (rescheduleBooking V2)
// ✅ FIX v3.23g: contactId en PaymentReservations para filtrado por member
// ✅ NUEVO v3.24i: desglosemetodopago en PaymentReservations
// ✅ NUEVO v3.25: Auto-fetch revision en cambiarFechaBookings para drag & drop
// ✅ FIX v3.25.1–v3.25.7: Ajustes en merge productos via searchOrders
//
// ═════════════════════════════════════════════════════════════════════════
// ✅ FIX v3.26.5 (7 May 2026): FALLBACK INTELIGENTE PARA CLIENTES RECIÉN
//   CREADOS QUE NO ESTÁN EN EL CACHE CRM TODAVÍA.
//
//   CASO DETECTADO (TestC DemoDos, 7 May 09:43):
//   - Recepción crea contacto nuevo en CRM Wix → contactId 094fea08
//   - Recepción crea reserva inmediatamente
//   - Recepción cobra menos de 1 minuto después
//   - getBookingsAgrupados consulta su cache CRM con TTL 5 min, pero el
//     cache se construyó ANTES de que TestC existiera → buscarPorTelefono
//     y buscarPorNombre no encuentran nada → cae a fallback_bk
//   - bk.contactId del booking llega vacío/envenenado (d23efee3 owner)
//   - El cobro escribe d23efee3 en PaymentReservations a pesar de que
//     TestC SÍ existe correctamente en CRM con su 094fea08
//
//   En el flujo normal del salón esto no ocurre (entre crear contacto
//   y cobrar pasan al menos 25 minutos), pero queremos blindarlo igual.
//
//   SOLUCIÓN v3.26.5: cuando _resolverContactIdReal cae a fallback_bk
//   con un bk.contactId envenenado o vacío, intentar UNA query puntual
//   y elevada al CRM por teléfono/nombre del booking. Si encuentra
//   contacto → ese es el cidReal correcto. Si no encuentra → mantener
//   el comportamiento actual (devolver bk.contactId aunque sea
//   envenenado, igual que ahora — no empeora nada).
//
//   Coste: ~200ms extra solo cuando hay un fallback_bk con contactId
//   envenenado/vacío. En un día normal (logs anoche: 15 packs, 4 caen
//   a fallback_bk), eso son ~800ms extra cada refresh, despreciable.
//   Cuando todos los clientes se resuelven por cache (caso normal en
//   producción), el fix nunca se ejecuta.
//
//   Robustez: si la query puntual al CRM falla (Wix degradado, timeout),
//   el catch recoge el error y devuelve el comportamiento de v3.26.4.
//   Este fix nunca puede empeorar el resultado actual.
//
// ═════════════════════════════════════════════════════════════════════════
// ✅ FIX v3.26.4 (6 May 2026): RENDIMIENTO + CONSISTENCIA POST-COBRO
//
//   PROBLEMAS detectados en v3.26.3 (mismo día):
//
//   (1) RENDIMIENTO: el índice CRM (2284 contactos en Hair-Times) se
//       reconstruía en CADA llamada a getBookingsAgrupados. Como el
//       polling de la Agenda llama esta función cada minuto desde
//       varias pestañas/sesiones, se cargaba el CRM 30+ veces por hora.
//       Resultado: 504 timeouts intermitentes y backend ralentizado.
//
//   (2) CONSISTENCIA: cobrarBookings ejecutaba primero setBookingAsPaid
//       (rápido) y después wixData.insert (más lento bajo carga). Si el
//       insert se cortaba por timeout, la cita quedaba PAGADA en Wix
//       Bookings pero SIN fila en PaymentReservations. Inconsistencia.
//
//   SOLUCIÓN v3.26.4:
//
//   (A) Cache módulo-singleton del índice CRM con TTL 5 minutos.
//       Variable a nivel de módulo (persiste entre llamadas mientras
//       el contenedor Wix esté caliente). 1ª llamada carga el CRM
//       completo; siguientes llamadas durante 5 min usan el cache.
//       Coste: de ~30 cargas/hora a ~12 cargas/hora MÁXIMO.
//       Función nueva _invalidarCacheCRM por si en el futuro queremos
//       forzar refresco manual (p.ej. tras crear contacto desde AKIRA).
//
//   (B) Reorden en cobrarBookings: PRIMERO insert al CMS, DESPUÉS
//       setBookingAsPaid. Si el insert falla, el cobro se aborta y el
//       cliente sabe que no se cobró → reintenta. Mejor que dejar
//       una cita PAGADA en Wix sin registro de pago.
//
//   (C) Reintentos en wixData.insert: hasta 2 intentos con 500ms entre
//       ellos. Si el primero falla por blip puntual, el segundo casi
//       siempre tiene éxito. Si los 2 fallan, error duro hacia frontend.
//
//   No se toca la lógica de resolución de contactId (sigue funcionando
//   bien en producción según logs del 6 May 23:36 → 8 de 11 packs
//   resueltos al cidReal correcto, el resto son fallback_bk legítimos
//   por homónimos o nombre nulo).
//
// ═════════════════════════════════════════════════════════════════════════
// ✅ FIX v3.26.3 (6 May 2026): RESOLUCIÓN DE CONTACTID REAL — CAUSA RAÍZ
//
//   PROBLEMA RAÍZ confirmado tras Frente A (reconstrucción 509 filas):
//   bk.contactId que devuelve queryExtendedBookings llega ENVENENADO con
//   el contactId del owner del sitio (d23efee3-313e-4952-...) cuando el
//   booking se creó desde Recepción PRO (que está autenticada como member
//   admin del salón). Wix Bookings asocia el booking al member en lugar
//   del cliente real (cuyo contactDetails sí están bien rellenados).
//
//   Síntoma: 509 de 745 filas históricas en PaymentReservations llevaban
//   d23efee3 (contactId del member), aunque los datos del cliente
//   (nombre, teléfono) estaban bien.
//
//   SOLUCIÓN aquí (en getBookingsAgrupados, pack.contactId):
//
//   En lugar de confiar en bk.contactId (envenenado), resolver el
//   contactId real consultando Wix CRM por:
//     1. Teléfono normalizado (clave fiable cuando existe)
//     2. firstName + lastName exactos (fallback)
//
//   Si la búsqueda devuelve 1 contacto único → ese es el cidReal.
//   Si devuelve varios o ninguno → fallback a bk.contactId (peor que
//     el real pero al menos no rompe nada que ya funcionara).
//
//   Cache local de la consulta CRM por toda la ejecución de
//   getBookingsAgrupados para no martillear el CRM (1 sola carga
//   completa al inicio, lookups en memoria).
//
//   Filtros de basura administrativa: descarta del índice los contactos
//   "HairTimes Reservas&Servicios", "Cliente Provisional", staff del
//   salón, etc. (mismos filtros que la herramienta diagnóstica que
//   usamos en Frente A).
//
//   Impacto: el campo pack.contactId que llega al frontend será el
//   contactId REAL del cliente. Cuando el frontend reenvíe datosPack
//   a cobrarBookings, el insert en PaymentReservations llevará ya el
//   contactId limpio. Fin del envenenamiento.
//
//   No se toca cobrarBookings. No se toca confirmarEnCalendario de
//   coloracionLogic. La solución es 100% en el punto de lectura de
//   getBookingsAgrupados, donde se construye datosPack que el
//   frontend usa después.
//
// ═════════════════════════════════════════════════════════════════════════
// ✅ FIX v3.26.2 (5 May 2026): desempate por nombreCliente cuando varios
//   packs comparten el mismo contactId (CRM demo fusiona contactos
//   distintos al mismo _id interno — caso confirmado con logs:
//   Jesus, Marisa y Pepe = d23efee3...). Antes, Array.find devolvía
//   el primer pack siempre y todas las ventas caían en él. Ahora se
//   busca primero match exacto contactId+nombreCliente. Si no hay
//   match exacto, fallback al comportamiento anterior (primer pack
//   con ese contactId) para no romper el caso normal.
//
// ═════════════════════════════════════════════════════════════════════════
// ✅ FIX v3.26.1 (4 May 2026): cobrarBookings sanea datosPack para no
//   duplicar productos. Cuando un pack contiene servicios + productos
//   (estos ya cobrados por venderProductosDesdeAgenda como filas TIENDA),
//   el frontend manda datosPack.descripcion mezclando ambos. Antes, esto
//   creaba una segunda fila en PaymentReservations contando otra vez los
//   65€ del producto. Ahora se filtran tokens "🛒" de la descripción y
//   se descuenta su subtotal del importeTotal antes del insert. Si tras
//   filtrar no queda servicio neto, no se inserta nada.
//
// ═════════════════════════════════════════════════════════════════════════
// ✅ MAYOR v3.26.0 (4 May 2026): CMS-first — Wix Stores fuera del flujo de lectura
//
// PROBLEMA RAÍZ que motivó el cambio:
//   - searchOrders devuelve buyerInfo casi vacío (firstName="", email="",
//     contactId fusionado por el CRM). Bug documentado en foro Wix Studio.
//   - customFields se descartan. buyerNote llega vacío con prefix [KAMISUITE].
//   - Resultado: matching incorrecto, ventas en cards equivocados, cierre
//     duplicando servicios como productos, "Sin especificar" en métodos.
//
// SOLUCIÓN (alineada con guideline KAMISUITE de máxima independencia de
// Wix Stores): el CMS PaymentReservations es la fuente de verdad. Wix
// Stores queda solo para la trazabilidad fiscal (orden POS + factura).
//
//   - tiendaProductos v1.5.6 inserta en PaymentReservations al cerrar
//     la venta, con staff="TIENDA", descripcion="🛒 Nombre (X€), ...",
//     tipoPago, contactId, desglosemetodopago.
//
//   - getBookingsAgrupados v3.26.0: el bloque MERGE PRODUCTOS deja de
//     llamar a orders.searchOrders. Lee de PaymentReservations donde
//     staff="TIENDA" y fechaPago en el día. Parsea cada token "🛒 Nombre
//     (X€)" como entry independiente en el pack del contactId.
//
//   - obtenerDatosCierreDia v3.26.0: la sección de productos también
//     deja de llamar a Wix Stores. Lee del mismo CMS y agrupa por nombre
//     de producto.
//
// IMPACTO:
//   - Si Wix Stores cae, el cierre y los cards del día siguen funcionando.
//   - Sin matching jerárquico — contactId del CMS es 100% fiable porque
//     lo escribimos nosotros desde el pack original.
//   - El panel "Cobrado por método de pago" del cierre ahora ve productos
//     con tipoPago real (Efectivo/Tarjeta/MIXTO) y deja de mostrar
//     "Sin especificar" para ventas TIENDA.
//   - obtenerHistorialVentas (registrarVenta legacy) y otras funciones que
//     sí dependen de orders.searchOrders se mantienen sin cambios.
//
// ✅ Escritura en colección PaymentReservations
// ✅ Generación Excel (xlsx)
// ✅ Generación PDF (jspdf)
// =====================================================

import { Permissions, webMethod } from 'wix-web-module';
import { extendedBookings, bookings, services, availabilityCalendar } from 'wix-bookings.v2';
import { bookings as bookingsV1 } from 'wix-bookings-backend';
import { contacts } from 'wix-crm.v2';
// v3.26.3: queryContacts del CRM v1 para resolver contactId real por teléfono/nombre.
//   contacts (v2) ya está importado arriba para getContact, pero queryContacts
//   funciona mejor desde wix-crm-backend (v1). Importamos como contactsV1Backend
//   para no colisionar con el import existente.
import { contacts as contactsV1Backend } from 'wix-crm-backend';
import { elevate } from 'wix-auth';
import wixData from 'wix-data';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import { invoices } from 'wix-billing-backend';
// v3.26: import orders se mantiene SOLO por compatibilidad si alguna otra
// función futura lo necesita. getBookingsAgrupados y obtenerDatosCierreDia
// ya NO lo usan — ambos leen de PaymentReservations. Si nadie más lo usa
// se puede borrar en una limpieza posterior.
import { orders } from 'wix-ecom-backend';

const TAG = '[Checkout v3.26.5]';
const COLECCION_PAGOS = 'PaymentReservations';
const CMS_VARIANTS = 'SvSimpleServiceVariants';
const CMS_EXTERNAL_SERVICES = 'ExternalServices';
const CMS_EXTERNAL_RECORDS  = 'SvExternalRecords';
const TIMEZONE_MADRID = 'Europe/Madrid';

// ═══════════════════════════════════════════════════════════════════════════
// v3.26.3: HELPERS PARA RESOLVER contactId REAL DESDE CRM
// ═══════════════════════════════════════════════════════════════════════════
//
// Filtros de basura administrativa: contactos que NO son clientes reales
// del salón (cuentas de sistema, staff interno, contacto provisional).
// Mismos criterios que la herramienta diagnóstica usada en Frente A.
//
const TOKENS_BASURA_CRM = [
  'hairtimes',
  'hair-times',
  'reservas',
  'cliente provisional',
  'staff',
  'admin',
  'recepcion',
  'recepción'
];

function _normalizarNombre(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function _normalizarTelefono(tel) {
  return String(tel || '').replace(/\D/g, '').trim();
}

function _esContactoBasura(nombreNormalizado, contact) {
  // Por nombre
  for (const token of TOKENS_BASURA_CRM) {
    if (nombreNormalizado.includes(token)) return true;
  }
  // Por email administrativo del propio dominio del salón
  const emails = Array.isArray(contact?.info?.emails) ? contact.info.emails : [];
  for (const e of emails) {
    const email = String(e?.email || e || '').toLowerCase();
    if (!email) continue;
    if (/^(info|booking|reservas|admin|hairtimes\.staff)/i.test(email)) return true;
  }
  return false;
}

// Cache singleton durante la ejecución de getBookingsAgrupados.
// Se construye una sola vez por llamada (no se persiste entre llamadas).
// ─────────────────────────────────────────────────────────────────────────
// v3.26.4: Cache PERSISTENTE entre llamadas con TTL 5 min
// ─────────────────────────────────────────────────────────────────────────
// Variables a nivel de módulo (persisten mientras el contenedor Wix esté
// caliente). En la práctica el contenedor se mantiene caliente durante
// horas si hay tráfico continuo, así que el polling de la Agenda ya no
// martillea el CRM.
//
// Si el cliente añade un contacto nuevo en CRM justo cuando el cache está
// caliente, ese contacto no se verá hasta el siguiente refresh (max 5 min).
// Compromiso aceptable: prioriza velocidad y estabilidad sobre frescura
// instantánea. Para forzar refresco se puede llamar invalidarCacheCRM
// (función webMethod añadida abajo).
let _crmCache = null;
let _crmCacheTimestamp = 0;
const CRM_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

async function _construirIndiceCRM() {
  // Cache hit: dentro del TTL → reutilizar
  const ahora = Date.now();
  if (_crmCache && (ahora - _crmCacheTimestamp) < CRM_CACHE_TTL_MS) {
    const edadSeg = Math.round((ahora - _crmCacheTimestamp) / 1000);
    console.log(`${TAG} ⚡ Índice CRM desde cache (edad=${edadSeg}s, TTL=300s) | telKeys=${_crmCache.indicePorTel.size} nameKeys=${_crmCache.indicePorNombre.size}`);
    return _crmCache;
  }

  // Cache miss: construir desde cero
  const indicePorTel = new Map();    // telNormalizado → contactId
  const indicePorNombre = new Map(); // "first last" normalizado → [contactId, ...]
  let totalCargados = 0;
  let totalFiltrados = 0;
  let totalIndexados = 0;

  try {
    const elevatedQuery = elevate(contactsV1Backend.queryContacts);
    let hasMore = true;
    let skip = 0;
    const PAGE = 1000;

    while (hasMore) {
      const result = await elevatedQuery()
        .skip(skip)
        .limit(PAGE)
        .find();

      const page = result?.items || [];
      totalCargados += page.length;

      for (const c of page) {
        const infoName = c?.info?.name || {};
        const first = String(infoName.first || c?.name?.first || '').trim();
        const last = String(infoName.last || c?.name?.last || '').trim();
        const full = `${first} ${last}`.trim();
        if (!full) continue;

        const fullNorm = _normalizarNombre(full);

        if (_esContactoBasura(fullNorm, c)) {
          totalFiltrados++;
          continue;
        }

        const cid = c._id || c.id || null;
        if (!cid) continue;

        // Indexar por teléfono(s)
        const phones = Array.isArray(c?.info?.phones) ? c.info.phones : [];
        for (const p of phones) {
          const telNorm = _normalizarTelefono(p?.phone || p);
          if (telNorm && telNorm.length >= 6) {
            // Si dos contactos comparten teléfono, gana el primero (poco común)
            if (!indicePorTel.has(telNorm)) {
              indicePorTel.set(telNorm, cid);
            }
          }
        }

        // Indexar por nombre completo
        if (!indicePorNombre.has(fullNorm)) {
          indicePorNombre.set(fullNorm, []);
        }
        indicePorNombre.get(fullNorm).push(cid);

        totalIndexados++;
      }

      if (page.length < PAGE) hasMore = false;
      else skip += PAGE;

      if (skip >= 10000) {
        console.warn(`${TAG} Límite seguridad CRM 10000 alcanzado`);
        hasMore = false;
      }
    }

    console.log(`${TAG} 🔍 Índice CRM construido (FRESH): total=${totalCargados} filtrados=${totalFiltrados} indexados=${totalIndexados} | telKeys=${indicePorTel.size} nameKeys=${indicePorNombre.size} | TTL=300s`);

    // Guardar en cache
    _crmCache = { indicePorTel, indicePorNombre };
    _crmCacheTimestamp = ahora;

  } catch (err) {
    console.error(`${TAG} ⚠️ Error construyendo índice CRM:`, err.message);
    // Si hay un cache antiguo (incluso expirado), mejor usarlo que nada
    if (_crmCache) {
      console.warn(`${TAG} ⚠️ Usando cache CRM expirado por error en construcción`);
      return _crmCache;
    }
    return { indicePorTel: new Map(), indicePorNombre: new Map() };
  }

  return _crmCache;
}

// v3.26.4: Helper para invalidar el cache manualmente
function _invalidarCacheCRM() {
  _crmCache = null;
  _crmCacheTimestamp = 0;
  console.log(`${TAG} ⚡ Cache CRM invalidado manualmente`);
}

// Resuelve el contactId REAL de un cliente a partir del booking.
// Cascada: 1) teléfono, 2) nombre+apellido único.
// Si nada matchea, devuelve null para que el llamador use su fallback.
function _resolverContactIdReal(bk, indices) {
  const cd = bk?.contactDetails || {};
  const phone = cd.phone || '';
  const first = String(cd.firstName || '').trim();
  const last = String(cd.lastName || '').trim();

  // 1. Por teléfono
  const telNorm = _normalizarTelefono(phone);
  if (telNorm && telNorm.length >= 6) {
    const cidPorTel = indices.indicePorTel.get(telNorm);
    if (cidPorTel) return { cid: cidPorTel, via: 'tel' };
  }

  // 2. Por nombre+apellido (solo si match único)
  if (first && last) {
    const claveNombre = _normalizarNombre(`${first} ${last}`);
    const candidatos = indices.indicePorNombre.get(claveNombre) || [];
    if (candidatos.length === 1) {
      return { cid: candidatos[0], via: 'name' };
    }
    if (candidatos.length > 1) {
      // Homónimos sin teléfono → no se puede desempatar
      return { cid: null, via: 'ambiguous_name' };
    }
  }

  return { cid: null, via: 'no_match' };
}

// ─────────────────────────────────────────────────────────────────────────
// v3.26.5: Detección de contactId envenenado del owner del sitio
// ─────────────────────────────────────────────────────────────────────────
// Cuando bk.contactId viene del owner del sitio Wix (member admin), Wix
// Bookings asocia el booking a ese member en lugar del cliente real.
// Este es el bug arquitectónico que motivó toda esta saga (Frente A,B,C).
//
// Heurística: si el contactId del booking aparece repetido en muchos
// bookings de clientes distintos, es muy probable que sea el envenenado.
// Para Hair-Times sabemos que es d23efee3-313e-4952-b081-e0b1b75a5c3a,
// pero queremos algo agnóstico al tenant para multi-tenant futuro.
//
// Estrategia simple: si bk.contactId está vacío O coincide con un
// contactId que ya falló al matchear (no aparece en ningún cliente real
// del CRM por nombre o teléfono), lo tratamos como envenenado.
//
// Implementación pragmática: marcamos como "sospechoso de envenenamiento"
// cualquier contactId que cumpla:
//   - Está vacío, O
//   - bk.contactDetails tiene firstName/lastName/phone pero la búsqueda
//     en cache devolvió no_match → indica que el cliente NO está en el
//     cache aunque el booking tenga datos. Probable cliente recién creado.
function _esContactIdSospechoso(bk, viaResolucion) {
  // Vacío siempre es sospechoso
  const fallbackCid = bk?.contactDetails?.contactId || bk?.contactId || '';
  if (!fallbackCid) return true;

  // Si la resolución cayó a no_match pero el booking tiene datos de
  // contacto rellenos, el cliente probablemente acaba de crearse y no
  // está en el cache aún → vale la pena hacer query puntual al CRM.
  if (viaResolucion === 'no_match') {
    const cd = bk?.contactDetails || {};
    const tieneDatos = (cd.phone && cd.phone.length >= 6) ||
                       (cd.firstName && cd.lastName);
    if (tieneDatos) return true;
  }

  return false;
}

// v3.26.5: Wrapper que combina resolución desde cache + fallback puntual
// al CRM cuando el cache no tiene al cliente (recién creado).
async function _resolverContactIdRealConFallback(bk, indices) {
  // Primer intento: cache local (rápido)
  const resolved = _resolverContactIdReal(bk, indices);

  if (resolved.cid) {
    // Cache acertó. Listo.
    return { cid: resolved.cid, via: resolved.via };
  }

  // Cache falló. Decidir si hacer query puntual al CRM.
  if (_esContactIdSospechoso(bk, resolved.via)) {
    const cd = bk?.contactDetails || {};
    const phone = cd.phone || '';
    const first = String(cd.firstName || '').trim();
    const last = String(cd.lastName || '').trim();

    try {
      // Intento por teléfono primero
      if (phone) {
        const cidPorTelLive = await _buscarContactoEnCRMPorTelefono(phone);
        if (cidPorTelLive) {
          console.log(`${TAG} 🔄 Fallback CRM directo HIT por tel: ${cidPorTelLive.substring(0,8)} (cliente recién creado, no estaba en cache)`);
          return { cid: cidPorTelLive, via: 'crm_live_tel' };
        }
      }

      // Intento por nombre+apellido
      if (first && last) {
        const cidPorNombreLive = await _buscarContactoEnCRMPorNombre(first, last);
        if (cidPorNombreLive) {
          console.log(`${TAG} 🔄 Fallback CRM directo HIT por nombre: ${cidPorNombreLive.substring(0,8)} (cliente recién creado, no estaba en cache)`);
          return { cid: cidPorNombreLive, via: 'crm_live_name' };
        }
      }
    } catch (err) {
      console.warn(`${TAG} ⚠️ Fallback CRM directo falló (probablemente Wix degradado): ${err.message}. Cayendo a bk.contactId.`);
    }
  }

  // No se pudo resolver de ninguna manera. Comportamiento de v3.26.4:
  // devolver bk.contactId aunque sea envenenado/vacío. No empeora nada.
  const fallback = bk.contactDetails?.contactId || bk.contactId || '';
  return { cid: fallback, via: 'fallback_bk' };
}

// v3.26.5: Búsqueda LIVE puntual al CRM por teléfono.
// Solo se llama cuando el cache no encontró al cliente (caso raro).
async function _buscarContactoEnCRMPorTelefono(phone) {
  const telNorm = _normalizarTelefono(phone);
  if (!telNorm || telNorm.length < 6) return null;

  try {
    const elevatedQuery = elevate(contactsV1Backend.queryContacts);
    // queryContacts no soporta filtro directo por phone normalizado.
    // Tiramos un find sin filtro pero limitando a 50 contactos más
    // recientes (los recién creados aparecen al principio si ordenas
    // por fecha de creación descendente). Suficiente para detectar
    // un contacto creado en los últimos minutos.
    const result = await elevatedQuery()
      .descending('_createdDate')
      .limit(50)
      .find();

    const items = result?.items || [];
    for (const c of items) {
      const phones = Array.isArray(c?.info?.phones) ? c.info.phones : [];
      for (const p of phones) {
        const candidato = _normalizarTelefono(p?.phone || p);
        if (candidato && candidato === telNorm) {
          return c?._id || c?.id || null;
        }
      }
    }
    return null;
  } catch (err) {
    console.warn(`${TAG} _buscarContactoEnCRMPorTelefono fallo: ${err.message}`);
    throw err;
  }
}

// v3.26.5: Búsqueda LIVE puntual al CRM por nombre+apellido exacto.
async function _buscarContactoEnCRMPorNombre(firstName, lastName) {
  const fn = String(firstName || '').trim();
  const ln = String(lastName || '').trim();
  if (!fn || !ln) return null;

  try {
    const elevatedQuery = elevate(contactsV1Backend.queryContacts);
    const result = await elevatedQuery()
      .eq('info.name.first', fn)
      .eq('info.name.last', ln)
      .limit(10)
      .find();

    const items = result?.items || [];
    if (items.length === 1) {
      return items[0]?._id || items[0]?.id || null;
    }
    if (items.length > 1) {
      // Homónimos sin teléfono → no se desempata
      return null;
    }
    return null;
  } catch (err) {
    console.warn(`${TAG} _buscarContactoEnCRMPorNombre fallo: ${err.message}`);
    throw err;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST PING
// ═══════════════════════════════════════════════════════════════════════════

export const testPing = webMethod(
  Permissions.Anyone,
  async () => {
    return { ok: true, message: 'Backend v3.26.5 funcionando', timestamp: new Date().toISOString() };
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// HELPER: Obtener precio y tipo de UN servicio
// v3.17.2: Devuelve { precio, rateType } para detectar VARIED
// ═══════════════════════════════════════════════════════════════════════════

async function obtenerInfoPrecioServicio(serviceId) {
  try {
    const elevatedGet = elevate(services.getService);
    const srv = await elevatedGet(serviceId);

    const rateType = srv?.payment?.rateType || '';

    if (rateType === 'FIXED') {
      const precio = parseFloat(srv?.payment?.fixed?.price?.value || 0) || 0;
      return { precio, rateType };
    }

    if (rateType === 'VARIED') {
      const defaultPrice = parseFloat(srv?.payment?.varied?.defaultPrice?.value || 0) || 0;
      console.log(`${TAG} 💲 Servicio VARIED ${serviceId.substring(0,8)}... defaultPrice=${defaultPrice} FULL_PAYMENT:`, JSON.stringify(srv?.payment));
      return { precio: defaultPrice, rateType };
    }

    // NO_FEE o CUSTOM → 0
    return { precio: 0, rateType };

  } catch (error) {
    console.log(`${TAG} ⚠️ Error precio ${serviceId}: ${error.message}`);
    return { precio: 0, rateType: '' };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// v3.18: Resolver precio y nombre de addons desde SvSimpleServiceVariants
// El CMS tiene: serviceId, label, durationMinutes, priceEuro, order
// Ordena por order, filtra las que tienen peinado, y cruza por duración
// ═══════════════════════════════════════════════════════════════════════════

async function resolverPrecioAddon(bk) {
  try {
    const addOns = bk.bookedAddOns || [];
    if (addOns.length === 0) return null;

    const addon = addOns[0];
    const addonDuration = addon.durationInMinutes || 0;
    const addonName = addon.name || '';

    console.log(`${TAG} 🧩 Addon detectado: "${addonName}" (${addonDuration}min)`);

    // Leer variantes del CMS ordenadas por order
    const varResult = await wixData.query(CMS_VARIANTS)
      .ascending('order')
      .find({ suppressAuth: true });

    const variantes = varResult.items || [];
    if (variantes.length === 0) {
      console.log(`${TAG} ⚠️ No hay variantes en ${CMS_VARIANTS}`);
      return null;
    }

    // Filtrar solo variantes con peinado (descartar "Solo corte...")
    const conPeinado = variantes.filter(v => {
      const label = (v.label || '').toUpperCase();
      return !label.includes('SOLO');
    });

    if (conPeinado.length === 0) {
      console.log(`${TAG} ⚠️ No hay variantes con peinado en ${CMS_VARIANTS}`);
      return null;
    }

    let variante = null;

    if (conPeinado.length === 1) {
      variante = conPeinado[0];
    } else {
      const sorted = conPeinado.sort((a, b) => (a.order || 0) - (b.order || 0));

      const baseDur = variantes.find(v => (v.label || '').toUpperCase().includes('SOLO'));
      const baseDurMin = baseDur ? (baseDur.durationMinutes || 30) : 30;

      for (const v of sorted) {
        const peinadoDur = (v.durationMinutes || 0) - baseDurMin;
        if (peinadoDur === addonDuration) {
          variante = v;
          break;
        }
      }

      // Fallback: si no matchea por duración, usar orden por duración
      if (!variante) {
        variante = addonDuration <= 40 ? sorted[0] : sorted[sorted.length - 1];
      }
    }

    const precio = variante.priceEuro || 0;
    const label = variante.label || addonName;

    console.log(`${TAG} 🧩 Variante: "${label}" | precio=${precio}€ | order=${variante.order}`);

    return { precio, label };

  } catch (error) {
    console.log(`${TAG} ⚠️ Error resolverPrecioAddon: ${error.message}`);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// v3.26: Helper para parsear tokens de productos en descripción CMS.
// Formato esperado: "🛒 Nombre (X€), 🛒 Nombre x2 (Y€)" (tokens con 🛒).
// Devuelve array de { nombre, cantidad, subtotal, precioUnit }.
// Tolerante a variaciones (sin €, decimales, espacios extra).
// ═══════════════════════════════════════════════════════════════════════════

function parsearTokensProducto(descripcion) {
  const out = [];
  if (!descripcion || typeof descripcion !== 'string') return out;

  // Split por coma simple — los nombres de producto no suelen llevar coma
  const tokens = descripcion.split(/,\s*/);
  for (const raw of tokens) {
    const token = raw.trim();
    if (!token.startsWith('🛒')) continue;

    // Patrón: "🛒 NOMBRE (PRECIO€)"  o  "🛒 NOMBRE xN (PRECIO€)"
    // Captura nombre (greedy reverso) y precio decimal antes del cierre
    const match = token.match(/^🛒\s*(.+?)\s*\(\s*([\d.,]+)\s*€?\s*\)\s*$/);
    if (!match) continue;

    let nombre = match[1].trim();
    const precioStr = match[2].replace(',', '.');
    const subtotal = parseFloat(precioStr) || 0;

    let cantidad = 1;
    const qtyMatch = nombre.match(/^(.+?)\s+x(\d+)\s*$/i);
    if (qtyMatch) {
      nombre = qtyMatch[1].trim();
      cantidad = parseInt(qtyMatch[2], 10) || 1;
    }

    const precioUnit = cantidad > 0 ? subtotal / cantidad : subtotal;
    out.push({ nombre, cantidad, subtotal, precioUnit });
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// FUNCIÓN PRINCIPAL: Obtener bookings agrupados
// v3.26.3: pack.contactId se resuelve contra CRM real (no se confía en
//   bk.contactId que viene envenenado con el contactId del owner).
// ═══════════════════════════════════════════════════════════════════════════

export const getBookingsAgrupados = webMethod(
  Permissions.Anyone,
  async ({ fechaISO }) => {
    try {
      console.log(`${TAG} 📦 getBookingsAgrupados: ${fechaISO}`);

      const elevatedQuery = elevate(extendedBookings.queryExtendedBookings);

      // ═══════════════════════════════════════════════════════════════════
      // v3.7: Filtro de fecha directamente en la query a Wix
      // ═══════════════════════════════════════════════════════════════════
      const startOfDay = `${fechaISO}T00:00:00.000Z`;
      const endOfDay = `${fechaISO}T23:59:59.999Z`;

      let allBookings = [];
      let offset = 0;
      const pageSize = 100;
      let hasMore = true;

      while (hasMore && offset < 500) {
        const result = await elevatedQuery({
          filter: {
            $and: [
              { startDate: { $gte: startOfDay } },
              { startDate: { $lte: endOfDay } }
            ]
          },
          paging: { limit: pageSize, offset: offset }
        });

        const items = result?.extendedBookings || [];
        allBookings = allBookings.concat(items);

        hasMore = items.length === pageSize;
        offset += pageSize;
      }

      console.log(`${TAG} 📦 Bookings del día ${fechaISO}: ${allBookings.length}`);

      const bookingsConfirmados = allBookings.filter(item =>
        item.booking?.status === 'CONFIRMED'
      );

      console.log(`${TAG} ✅ Bookings confirmados: ${bookingsConfirmados.length}`);

      // Obtener serviceIds únicos
      const serviceIdsUnicos = [...new Set(
        bookingsConfirmados
          .map(item => item.booking?.bookedEntity?.slot?.serviceId)
          .filter(id => id)
      )];

      // ═══════════════════════════════════════════════════════════════════
      // v3.17.2: Obtener precios Y rateType de cada servicio
      // ═══════════════════════════════════════════════════════════════════
      const mapaPrecios = {};
      const mapaRateType = {};
      for (const serviceId of serviceIdsUnicos) {
        const info = await obtenerInfoPrecioServicio(serviceId);
        mapaPrecios[serviceId] = info.precio;
        mapaRateType[serviceId] = info.rateType;
      }

      // ═══════════════════════════════════════════════════════════════════
      // v3.18: Para bookings con addons, resolver precio real
      // ═══════════════════════════════════════════════════════════════════
      const mapaPreciosBooking = {};
      const mapaAddonLabel = {};
      for (const item of bookingsConfirmados) {
        const bk = item.booking;
        const tieneAddons = Array.isArray(bk?.bookedAddOns) && bk.bookedAddOns.length > 0;
        if (tieneAddons) {
          const addonInfo = await resolverPrecioAddon(bk);
          if (addonInfo && addonInfo.precio > 0) {
            mapaPreciosBooking[bk._id] = addonInfo.precio;
            mapaAddonLabel[bk._id] = addonInfo.label;
          }
        }
      }

      // ═══════════════════════════════════════════════════════════════════
      // v3.26.3: ÍNDICE CRM para resolver contactId real por tel/nombre
      // Se construye UNA sola vez por llamada y se reutiliza para todos
      // los bookings del día.
      // ═══════════════════════════════════════════════════════════════════
      const indicesCRM = await _construirIndiceCRM();

      // ═══════════════════════════════════════════════════════════════════
      // v3.15: REVERTIDO a contactId + contigüidad (sin staffId)
      // v3.26.3: contactId del pack viene del CRM resuelto (no de bk.contactId)
      // ═══════════════════════════════════════════════════════════════════
      const GAP_MAX_CALENDARIO_MS = 90 * 60 * 1000; // 90 minutos
      const packs = [];

      // Helper: contactId real para un booking dado
      // v3.26.5: ahora es async y usa _resolverContactIdRealConFallback
      // que hace una query puntual al CRM cuando el cache no tiene al
      // cliente (caso de cliente recién creado).
      const contactIdRealDe = async (bk) => {
        return await _resolverContactIdRealConFallback(bk, indicesCRM);
      };

      const getGroupKey = (bk) => {
        const email = bk.contactDetails?.email || '';
        const esEmailGenerico = email === 'booking@hair-times.com';

        let clientKey = '';

        const nombre = `${bk.contactDetails?.firstName || ''} ${bk.contactDetails?.lastName || ''}`.trim().toLowerCase();
        const contactId = bk.contactDetails?.contactId || bk.contactId || '';

        if (nombre) {
          clientKey = `name_${nombre}`;
        }
        else if (email && !email.includes('no-reply') && !email.includes('noreply') && !esEmailGenerico) {
          clientKey = `email_${email}`;
        }
        else if (contactId) {
          clientKey = `cid_${contactId}`;
        }
        else {
          clientKey = `unknown_${bk._id || Date.now()}`;
        }

        return clientKey;
      };

      const sorted = [...bookingsConfirmados].sort((a, b) => {
        const keyA = getGroupKey(a.booking);
        const keyB = getGroupKey(b.booking);
        if (keyA !== keyB) return keyA.localeCompare(keyB);

        const startA = new Date(a.booking?.bookedEntity?.slot?.startDate || 0).getTime();
        const startB = new Date(b.booking?.bookedEntity?.slot?.startDate || 0).getTime();
        return startA - startB;
      });

      let currentPack = null;

      for (const item of sorted) {
        const bk = item.booking;
        const groupKey = getGroupKey(bk);
        const slotStart = new Date(bk.bookedEntity?.slot?.startDate || 0).getTime();
        const slotEnd = new Date(bk.bookedEntity?.slot?.endDate || 0).getTime();

        const mismoPack = currentPack &&
          currentPack.groupKey === groupKey &&
          (slotStart - currentPack.lastSlotEnd) <= GAP_MAX_CALENDARIO_MS;

        if (mismoPack) {
          currentPack.servicios.push(extraerServicio(bk, mapaPrecios, mapaPreciosBooking, mapaAddonLabel));
          if (slotEnd > currentPack.lastSlotEnd) {
            currentPack.lastSlotEnd = slotEnd;
          }
        } else {
          if (currentPack) packs.push(currentPack);

          // v3.26.3: contactId del pack viene del CRM resuelto
          const cidResolved = await contactIdRealDe(bk);
          const nombrePack = `${bk.contactDetails?.firstName || ''} ${bk.contactDetails?.lastName || ''}`.trim();
          console.log(`${TAG} 👤 Pack "${nombrePack}" → cidReal=${(cidResolved.cid || 'VACIO').substring(0,8)} via=${cidResolved.via} | bk.contactId=${(bk.contactId || '').substring(0,8)}`);

          currentPack = {
            packId: `pack_${packs.length + 1}`,
            groupKey: groupKey,
            email: bk.contactDetails?.email || '',
            contactName: nombrePack,
            contactPhone: bk.contactDetails?.phone || '',
            contactId: cidResolved.cid,        // ← v3.26.3: REAL, no envenenado
            firstSlotStart: slotStart,
            lastSlotEnd: slotEnd,
            servicios: [extraerServicio(bk, mapaPrecios, mapaPreciosBooking, mapaAddonLabel)]
          };
        }
      }

      if (currentPack) packs.push(currentPack);

      // =================================================================
      // v3.26: MERGE PRODUCTOS DESDE PaymentReservations (CMS-first)
      // =================================================================
      // Cambio respecto a v3.21–v3.25.x: NO se consulta Wix Stores.
      // Las ventas se leen de PaymentReservations donde staff="TIENDA",
      // escritas por venderProductosDesdeAgenda (tiendaProductos v1.5.6+).
      //
      // Estructura del registro CMS (1 registro = 1 venta multi-línea):
      //   bookingId   = orderId Wix Stores (clave de trazabilidad)
      //   contactId   = contactId del cliente (nunca vacío)
      //   nombreCliente = nombre del cliente
      //   descripcion = "🛒 Producto1 (X€), 🛒 Producto2 x2 (Y€)"
      //   importeTotal, tipoPago, desglosemetodopago, fechaPago
      //   staff = "TIENDA"
      //
      // Cada token "🛒 Nombre (X€)" del campo descripcion se convierte
      // en una entry independiente del pack, igual que un servicio.
      // =================================================================
      console.log(`${TAG} 🛒 Leyendo productos del día desde ${COLECCION_PAGOS}...`);

      try {
        const ventasResult = await wixData.query(COLECCION_PAGOS)
          .ge('fechaPago', new Date(`${fechaISO}T00:00:00.000`))
          .le('fechaPago', new Date(`${fechaISO}T23:59:59.999`))
          .eq('staff', 'TIENDA')
          .limit(500)
          .find();

        const ventasProducto = ventasResult.items || [];
        console.log(`${TAG} 🛒 Ventas TIENDA del día: ${ventasProducto.length}`);

        // Log de packs visibles para diagnóstico de matching
        const packsResumen = packs.map(p => `${p.contactName||'?'}=${(p.contactId||'').substring(0,8) || 'VACIO'}`).join(' | ');
        if (ventasProducto.length > 0) {
          console.log(`${TAG} 🛒 Packs del día: ${packsResumen}`);
        }

        for (const venta of ventasProducto) {
          const ventaContactId = venta.contactId ? String(venta.contactId).trim() : '';
          const ventaCliente = (venta.nombreCliente || '').trim();
          const ventaImporte = Number(venta.importeTotal || 0);
          const ventaMetodoPago = venta.tipoPago || '';
          const ventaOrderId = venta.bookingId || null;

          // ───────────────────────────────────────────────────────────────
          // v3.26.2: Matching con desempate por nombreCliente.
          // ───────────────────────────────────────────────────────────────
          // Caso real (logs 5 May): el CRM demo de Wix fusiona contactos
          // distintos al mismo _id interno. Tres clientes diferentes
          // (Jesus, Marisa, Pepe) compartían contactId d23efee3..., y
          // Array.find devolvía siempre el primero → todas las ventas
          // se apilaban en pack_1.
          //
          // Estrategia en cascada:
          //   1º Match exacto por contactId + nombreCliente (case-insensitive).
          //      Si está, este es el pack correcto sin lugar a dudas.
          //   2º Si no hay match exacto: fallback al primer pack con ese
          //      contactId (comportamiento anterior, válido cuando solo
          //      hay un cliente con ese contactId en el día).
          //   3º Si nada matchea: crear pack solo-producto (cliente sin
          //      cita en el día).
          //
          // El nombreCliente lo escribe venderProductosDesdeAgenda v1.5.6
          // a partir del contactName del pack original, así que coincide
          // exactamente con pack.contactName.
          // ───────────────────────────────────────────────────────────────
          let targetPack = null;
          let matchType = '';

          const ventaClienteLower = ventaCliente.toLowerCase().trim();

          if (ventaContactId && ventaClienteLower) {
            // 1º: match exacto contactId + nombreCliente
            targetPack = packs.find(p => {
              const pid = p.contactId ? String(p.contactId).trim() : '';
              const pname = (p.contactName || '').toLowerCase().trim();
              return pid !== '' && pid === ventaContactId && pname === ventaClienteLower;
            });
            if (targetPack) matchType = 'cid+name';
          }

          if (!targetPack && ventaContactId) {
            // 2º: fallback solo por contactId (caso normal sin fusión)
            targetPack = packs.find(p => {
              const pid = p.contactId ? String(p.contactId).trim() : '';
              return pid !== '' && pid === ventaContactId;
            });
            if (targetPack) matchType = 'cid-only';
          }

          // Sin pack matcheado → crear pack solo-producto (cliente sin cita)
          if (!targetPack) {
            const buyerName = ventaCliente || 'Cliente';
            const fechaVenta = venta.fechaPago ? new Date(venta.fechaPago).getTime() : Date.now();
            targetPack = {
              packId: `pack_${packs.length + 1}`,
              groupKey: `cid_${ventaContactId || 'anon'}`,
              email: '',
              contactName: buyerName,
              contactPhone: '',
              contactId: ventaContactId,
              firstSlotStart: fechaVenta,
              lastSlotEnd: fechaVenta,
              servicios: []
            };
            packs.push(targetPack);
            console.log(`${TAG} 🛒 Pack nuevo (solo producto): "${buyerName}" cid=${ventaContactId.substring(0,8) || 'VACIO'}`);
          } else {
            console.log(`${TAG} 🛒 Match[${matchType}] cid=${ventaContactId.substring(0,8)} name="${ventaCliente}" → pack ${targetPack.packId} (${targetPack.contactName})`);
          }

          // Parsear tokens del campo descripcion → N entries en el pack
          const productos = parsearTokensProducto(venta.descripcion || '');
          if (productos.length === 0) {
            console.warn(`${TAG} 🛒 Venta ${venta._id?.substring(0,8)} sin tokens 🛒 parseables: "${venta.descripcion}"`);
            continue;
          }

          const fechaPagoISO = venta.fechaPago
            ? new Date(venta.fechaPago).toISOString()
            : new Date().toISOString();

          for (const prod of productos) {
            const sufijoQty = prod.cantidad > 1 ? ` x${prod.cantidad}` : '';
            const productEntry = {
              bookingId: null,
              serviceId: null,
              serviceName: `🛒 ${prod.nombre}${sufijoQty}`,
              startDate: fechaPagoISO,
              endDate: null,
              staffName: 'TIENDA',
              staffId: null,
              paymentStatus: 'PAID',
              precio: prod.subtotal,
              descuento: 0,
              precioFinal: prod.subtotal,
              promoNombre: '',
              tienePromo: false,
              origenRecepcion: false,
              extraDescripcion: '',
              extraImporte: 0,
              metodoPago: ventaMetodoPago,
              tipo: 'producto',
              orderId: ventaOrderId
            };
            targetPack.servicios.push(productEntry);
          }

          console.log(`${TAG} 🛒 Venta ${(venta._id||'').substring(0,8)}: ${productos.length} línea(s), ${ventaImporte}€ ${ventaMetodoPago} → pack ${targetPack.packId}`);
        }

      } catch (cmsErr) {
        console.error(`${TAG} ⚠️ Error leyendo ventas en ${COLECCION_PAGOS}:`, cmsErr.message);
      }

      // Calcular totales
      const packsConTotales = packs.map(pack => {
        pack.servicios.sort((a, b) =>
          (a.startDate || '').localeCompare(b.startDate || '')
        );

        const horaInicio = pack.servicios[0]?.startDate?.substring(11, 16) || '';
        const horaFin = pack.servicios[pack.servicios.length - 1]?.endDate?.substring(11, 16) || '';

        const totalPendiente = pack.servicios
          .filter(s => s.paymentStatus === 'NOT_PAID')
          .reduce((sum, s) => sum + (s.precioFinal ?? s.precio ?? 0), 0);

        let totalPack = pack.servicios
          .reduce((sum, s) => sum + (s.precioFinal ?? s.precio ?? 0), 0);

        const descuentoTotal = pack.servicios
          .reduce((sum, s) => sum + (s.descuento || 0), 0);

        const tienePromo = pack.servicios.some(s => s.descuento > 0);
        const promoInfo = pack.servicios.find(s => s.promoNombre)?.promoNombre || '';

        const todoPagado = pack.servicios.every(s =>
          s.paymentStatus === 'PAID' || s.paymentStatus === 'EXEMPT'
        );

        const serviciosPendientes = pack.servicios.filter(s => s.paymentStatus === 'NOT_PAID');

        const esRecepcion = pack.servicios.some(s => s.origenRecepcion === true);

        const staffNamesOrdered = [];
        const staffNamesSeen = new Set();
        for (const s of pack.servicios) {
          const sn = (s.staffName || '').trim();
          if (sn && !staffNamesSeen.has(sn)) {
            staffNamesSeen.add(sn);
            staffNamesOrdered.push(sn);
          }
        }

        let extra = null;
        for (const s of pack.servicios) {
          if (s.extraDescripcion && s.extraImporte > 0) {
            extra = {
              descripcion: s.extraDescripcion,
              importe: s.extraImporte
            };
            totalPack += s.extraImporte;
            console.log(`${TAG} ✏️ Extra en pack: ${extra.descripcion} (+${extra.importe}€) → totalPack=${totalPack}€`);
            break;
          }
        }

        return {
          ...pack,
          horaInicio,
          horaFin,
          totalPendiente,
          totalPack,
          descuentoTotal,
          tienePromo,
          promoInfo,
          todoPagado,
          serviciosPendientes: serviciosPendientes.length,
          bookingIdsPendientes: serviciosPendientes.map(s => s.bookingId),
          bookingIds: pack.servicios.map(s => s.bookingId).filter(Boolean),
          esRecepcion,
          staffNames: staffNamesOrdered,
          extra: extra
        };
      });

      packsConTotales.sort((a, b) =>
        (a.horaInicio || '').localeCompare(b.horaInicio || '')
      );

      return {
        ok: true,
        fecha: fechaISO,
        totalPacks: packsConTotales.length,
        packs: packsConTotales
      };

    } catch (error) {
      console.error(`${TAG} ❌ Error:`, error);
      return { ok: false, error: error.message };
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// FUNCIÓN: Extraer servicio con lectura de descuento desde extended fields
// v3.18: Acepta mapaAddonLabel para nombre enriquecido con addon
// v3.19: Lee método de pago desde extended fields
// ═══════════════════════════════════════════════════════════════════════════

function extraerServicio(bk, mapaPrecios, mapaPreciosBooking, mapaAddonLabel) {
  const serviceId = bk.bookedEntity?.slot?.serviceId;
  let precio = mapaPrecios[serviceId] || 0;

  let serviceName = bk.bookedEntity?.title || 'Sin nombre';

  if (mapaPreciosBooking && mapaPreciosBooking[bk._id] > 0) {
    const precioCalculado = mapaPreciosBooking[bk._id];
    console.log(`${TAG} 💲 Addon: ${serviceName} → ${precioCalculado}€ (era base=${precio}€)`);
    precio = precioCalculado;
  }

  if (mapaAddonLabel && mapaAddonLabel[bk._id]) {
    serviceName = `${serviceName} + ${mapaAddonLabel[bk._id]}`;
    console.log(`${TAG} 🏷️ Nombre enriquecido: ${serviceName}`);
  }

  let descuento = 0;
  let promoNombre = '';
  let origenRecepcion = false;
  let extraCheckout = '';
  let extraDescripcion = '';
  let extraImporte = 0;
  let metodoPagoDetectado = '';

  try {
    const extFields = bk.extendedFields || {};

    let promocin = '';
    let reservaderecepcion = '';

    if (extFields.namespaces?.['_user_fields']?.promocin) {
      promocin = extFields.namespaces['_user_fields'].promocin;
    } else if (extFields['_user_fields']?.promocin) {
      promocin = extFields['_user_fields'].promocin;
    } else if (extFields.promocin) {
      promocin = extFields.promocin;
    }

    if (promocin) {
      const parts = promocin.split('|');
      if (parts.length >= 2) {
        promoNombre = parts[0].trim();
        descuento = Math.abs(parseInt(parts[1], 10)) || 0;
        console.log(`${TAG} 🎉 Promo detectada: ${promoNombre} (-${descuento}€)`);
      }
    }

    if (extFields.namespaces?.['_user_fields']?.reservaderecepcion) {
      reservaderecepcion = extFields.namespaces['_user_fields'].reservaderecepcion;
    } else if (extFields['_user_fields']?.reservaderecepcion) {
      reservaderecepcion = extFields['_user_fields'].reservaderecepcion;
    } else if (extFields.reservaderecepcion) {
      reservaderecepcion = extFields.reservaderecepcion;
    }

    if (reservaderecepcion === 'RECEPCION') {
      origenRecepcion = true;
    }

    const uf = extFields.namespaces?.['_user_fields'] || extFields['_user_fields'] || extFields;
    if (uf.pago_en_efectivo) metodoPagoDetectado = 'Efectivo';
    else if (uf.pagotarjeta) metodoPagoDetectado = 'Tarjeta';
    else if (uf.pago_con_bizum) metodoPagoDetectado = 'Bizum';
    else if (uf.pago_mixto) metodoPagoDetectado = 'Mixto';

    if (extFields.namespaces?.['_user_fields']?.extra_checkout) {
      extraCheckout = extFields.namespaces['_user_fields'].extra_checkout;
    } else if (extFields['_user_fields']?.extra_checkout) {
      extraCheckout = extFields['_user_fields'].extra_checkout;
    } else if (extFields.extra_checkout) {
      extraCheckout = extFields.extra_checkout;
    }

    if (extraCheckout) {
      const ep = extraCheckout.split('|');
      if (ep.length >= 2) {
        extraDescripcion = ep[0].trim();
        extraImporte = parseFloat(ep[1]) || 0;
      }
    }

  } catch (e) {
    console.warn(`${TAG} ⚠️ Error leyendo extendedFields:`, e.message);
  }

  let addOnsTotal = 0;
  try {
    const addOns = bk.bookedAddOns || [];
    if (addOns.length > 0) {
      addOns.forEach(a => {
        const addOnPrice = parseFloat(a.price?.amount || a.price?.value || a.price || 0) || 0;
        addOnsTotal += addOnPrice;
        console.log(`${TAG} 🧩 AddOn: ${JSON.stringify(a)}`);
      });
    }
  } catch (e) {
    console.warn(`${TAG} ⚠️ Error leyendo bookedAddOns:`, e.message);
  }

  const precioFinal = precio + addOnsTotal - descuento;

  return {
    bookingId: bk._id,
    serviceId: serviceId,
    serviceName: serviceName,
    startDate: bk.bookedEntity?.slot?.startDate,
    endDate: bk.bookedEntity?.slot?.endDate,
    staffName: bk.bookedEntity?.slot?.resource?.name || 'Sin staff',
    staffId: bk.bookedEntity?.slot?.resource?._id || bk.bookedEntity?.slot?.resource?.id || null,
    paymentStatus: bk.paymentStatus,
    precio: precio,
    descuento: descuento,
    precioFinal: precioFinal,
    promoNombre: promoNombre,
    tienePromo: descuento > 0,
    origenRecepcion: origenRecepcion,
    extraDescripcion: extraDescripcion,
    extraImporte: extraImporte,
    metodoPago: metodoPagoDetectado,
    // v3.23: Para reschedule — revision + scheduleId del booking original
    revision: bk.revision || bk._revision || null,
    scheduleId: bk.bookedEntity?.slot?.scheduleId || bk.bookedEntity?.schedule?.scheduleId || null
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// FUNCIÓN: Cobrar bookings + guardar en colección
// ═══════════════════════════════════════════════════════════════════════════

// v3.26.4: Helper para insert con reintentos al CMS PaymentReservations.
// Hasta 2 intentos con 500ms de espera entre ellos. Si los 2 fallan,
// lanza el error original para que cobrarBookings aborte el flujo.
async function _insertConReintentos(coleccion, registro, maxIntentos = 2) {
  let ultimoError = null;
  for (let intento = 1; intento <= maxIntentos; intento++) {
    try {
      const inserted = await wixData.insert(coleccion, registro);
      if (intento > 1) {
        console.log(`${TAG} ✅ Insert OK en intento ${intento}/${maxIntentos}`);
      }
      return inserted;
    } catch (err) {
      ultimoError = err;
      console.warn(`${TAG} ⚠️ Insert falló intento ${intento}/${maxIntentos}: ${err.message}`);
      if (intento < maxIntentos) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
  }
  throw ultimoError;
}

export const cobrarBookings = webMethod(
  Permissions.Anyone,
  async ({ bookingIds, metodoPago, datosPack }) => {
    try {
      console.log(`${TAG} 💳 Cobrando ${bookingIds.length} bookings con: ${metodoPago}`);

      const camposPago = {
        'Efectivo': 'pago_en_efectivo',
        'Tarjeta': 'pagotarjeta',
        'Bizum': 'pago_con_bizum',
        'Mixto': 'pago_mixto'
      };

      const campoKey = camposPago[metodoPago];
      const ahora = new Date();

      // ═══════════════════════════════════════════════════════════════════
      // v3.26.4: PASO 1 — INSERT EN CMS PRIMERO (antes que Wix Bookings)
      // ═══════════════════════════════════════════════════════════════════
      // Razón del reorden: si el insert al CMS falla por timeout o error,
      // queremos abortar antes de marcar el booking como pagado en Wix.
      // Así evitamos la inconsistencia "PAGADO en Wix sin fila en CMS"
      // que vimos con TestB en v3.26.3.
      //
      // El insert al CMS es la operación CRÍTICA del cobro (sin ella no
      // tenemos registro contable). setBookingAsPaid es un side-effect
      // visual en Wix Bookings que se puede recuperar después si hace
      // falta (porque en Wix sigue como NOT_PAID se ve en checkout).
      // ═══════════════════════════════════════════════════════════════════

      let cmsInsertado = false;
      let cmsSkipped = false;
      let cmsSkipReason = '';

      if (datosPack) {
        const claveBooking = bookingIds.join(',');

        // ───────────────────────────────────────────────────────────────
        // v3.26.1: Sanitizar datosPack para no duplicar productos.
        // ───────────────────────────────────────────────────────────────
        // Los tokens "🛒 ..." en datosPack.descripcion son productos que
        // venderProductosDesdeAgenda ya registró aparte como filas con
        // staff="TIENDA". Llegan aquí porque getBookingsAgrupados v3.26
        // mergea productos en el pack visualmente, y el frontend reenvía
        // toda la descripción al cobrar. Si los dejamos pasar, el importe
        // del producto se contaría dos veces en PaymentReservations.
        //
        // Estrategia: filtrar los tokens 🛒 de la descripción y descontar
        // su subtotal del importeTotal. Si tras filtrar no queda nada
        // (todo el pack eran productos ya cobrados), no se inserta.
        // ───────────────────────────────────────────────────────────────
        const partesOriginales = String(datosPack.descripcion || '').split(/,\s*/);
        const partesServicios = [];
        let importeProductos = 0;
        for (const parte of partesOriginales) {
          const trimmed = parte.trim();
          if (!trimmed) continue;
          if (trimmed.startsWith('🛒')) {
            // Extraer subtotal del token "🛒 Nombre (X€)" o "🛒 Nombre xN (X€)"
            const m = trimmed.match(/\(\s*([\d.,]+)\s*€?\s*\)\s*$/);
            if (m) {
              importeProductos += parseFloat(m[1].replace(',', '.')) || 0;
            }
            continue;
          }
          partesServicios.push(trimmed);
        }

        const descripcionLimpia = partesServicios.join(', ');
        const importeOriginal = Number(datosPack.importeTotal || 0);
        const importeLimpio = Math.max(0, Math.round((importeOriginal - importeProductos) * 100) / 100);

        if (importeProductos > 0) {
          console.log(`${TAG} 🛒 Sanitizado descripción: -${importeProductos}€ productos (ya cobrados como TIENDA). Importe servicios neto: ${importeLimpio}€`);
        }

        // Si tras sanear no queda servicio neto, no insertar
        if (!descripcionLimpia || importeLimpio <= 0) {
          console.log(`${TAG} ℹ️ Pack sin servicios netos a registrar (todo eran productos ya cobrados). Skip insert en ${COLECCION_PAGOS}.`);
          cmsSkipped = true;
          cmsSkipReason = 'todo_productos';
        } else {
          // Anti-duplicado por bookingId
          try {
            const existente = await wixData.query(COLECCION_PAGOS)
              .eq('bookingId', claveBooking)
              .limit(1)
              .find();

            if (existente.items.length > 0) {
              console.log(`${TAG} ⚠️ Registro ya existe en ${COLECCION_PAGOS} para bookingId=${claveBooking}, no se duplica`);
              cmsSkipped = true;
              cmsSkipReason = 'duplicado';
            } else {
              const registro = {
                bookingId: claveBooking,
                fechaReserva: datosPack.fechaReserva ? new Date(datosPack.fechaReserva) : ahora,
                fechaPago: ahora,
                descripcion: descripcionLimpia,
                nombreCliente: datosPack.nombreCliente || '',
                importeTotal: importeLimpio,
                tipoPago: metodoPago,
                staff: datosPack.staff || '',
                contactId: datosPack.contactId || '',
                desglosemetodopago: datosPack.desglosemetodopago || ''
              };

              // v3.26.4: usar helper con reintentos
              await _insertConReintentos(COLECCION_PAGOS, registro, 2);
              cmsInsertado = true;
              console.log(`${TAG} ✅ Guardado en ${COLECCION_PAGOS}: "${descripcionLimpia}" | ${importeLimpio}€ ${metodoPago} (contactId=${datosPack.contactId || 'vacío'})`);
            }
          } catch (errCMS) {
            // v3.26.4: Si el insert falla tras 2 intentos → ABORTAR todo el cobro.
            console.error(`${TAG} ❌ Error guardando en ${COLECCION_PAGOS} tras reintentos:`, errCMS.message);
            console.error(`${TAG} ❌ COBRO ABORTADO antes de marcar pagado en Wix Bookings`);
            return {
              ok: false,
              error: `No se pudo registrar el pago en el sistema. Por favor, reintenta. (${errCMS.message})`,
              mensaje: 'Cobro abortado: el registro contable falló y el booking NO se marcó como pagado',
              cmsError: true
            };
          }
        }
      }

      // ═══════════════════════════════════════════════════════════════════
      // v3.26.4: PASO 2 — Marcar bookings como pagados en Wix Bookings
      // ═══════════════════════════════════════════════════════════════════
      // Solo se llega aquí si el insert al CMS fue OK (o se omitió por
      // razones legítimas: todo-productos o duplicado). Si llegamos aquí
      // con un error en Bookings, el CMS ya tiene el registro contable;
      // la inconsistencia inversa (CMS PAGADO pero Wix sin marcar) es
      // recuperable manualmente desde la UI de Wix.
      // ═══════════════════════════════════════════════════════════════════

      const resultados = [];

      for (const bookingId of bookingIds) {
        try {
          await bookingsV1.setBookingAsPaid(bookingId, { suppressAuth: true });
          console.log(`${TAG} ✅ Pagado: ${bookingId}`);

          if (campoKey) {
            const elevatedUpdate = elevate(bookings.updateExtendedFields);
            await elevatedUpdate(bookingId, '_user_fields', {
              namespaceData: { [campoKey]: true }
            });
          }

          resultados.push({ bookingId, ok: true, metodoPago });

        } catch (err) {
          if (err.message?.includes('already paid')) {
            resultados.push({ bookingId, ok: true, metodoPago, nota: 'Ya estaba pagado' });
          } else {
            // v3.26.4: si setBookingAsPaid falla, el CMS ya tiene la fila
            // (escritura en paso 1). El booking en Wix queda como NOT_PAID
            // pero el cobro contable está registrado. Recepcionista puede
            // marcarlo manualmente en Wix si hace falta.
            console.error(`${TAG} ⚠️ setBookingAsPaid falló para ${bookingId} (CMS ya escrito):`, err.message);
            resultados.push({ bookingId, ok: false, error: err.message });
          }
        }
      }

      const exitosos = resultados.filter(r => r.ok).length;

      return {
        ok: resultados.every(r => r.ok),
        mensaje: `${exitosos} de ${bookingIds.length} marcados como PAGADO (${metodoPago})`,
        metodoPago,
        resultados,
        cmsInsertado,
        cmsSkipped,
        cmsSkipReason
      };

    } catch (error) {
      console.error(`${TAG} ❌ Error:`, error);
      return { ok: false, error: error.message };
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// v3.26.4: ENDPOINT PARA INVALIDAR EL CACHE CRM MANUALMENTE
// ═══════════════════════════════════════════════════════════════════════════
// Si en el futuro queremos forzar un refresco del cache (p.ej. después de
// crear un contacto desde AKIRA o tras importación masiva), llamar a
// este endpoint desde el frontend o desde otro backend. Sin parámetros.

export const invalidarCacheCRM = webMethod(
  Permissions.Anyone,
  async () => {
    _invalidarCacheCRM();
    return { ok: true, mensaje: 'Cache CRM invalidado. Próxima llamada recargará desde CRM.' };
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// v3.6: CANCELAR BOOKINGS DE UN PACK
// ═══════════════════════════════════════════════════════════════════════════

export const cancelarBookingsPack = webMethod(
  Permissions.Anyone,
  async ({ bookingIds }) => {
    try {
      console.log(`${TAG} 🗑️ cancelarBookingsPack: ${bookingIds.length} bookings`);
      if (!Array.isArray(bookingIds) || bookingIds.length === 0) {
        return { ok: false, error: 'No se proporcionaron bookingIds' };
      }
      const cancelBookingElevated = elevate(bookingsV1.cancelBooking);
      const resultados = await Promise.allSettled(
        bookingIds.map(bookingId =>
          cancelBookingElevated(bookingId, {
            participantNotification: {
              notifyParticipants: false
            },
            flowControlSettings: {
              ignoreCancellationPolicy: true
            },
            suppressAuth: true
          })
        )
      );
      const exitosas = resultados.filter(r => r.status === 'fulfilled').length;
      const fallidas = resultados.filter(r => r.status === 'rejected');
      if (fallidas.length > 0) {
        fallidas.forEach((result, index) => {
          console.error(`${TAG} ❌ Error cancelando booking ${index + 1}:`, result.reason?.message || result.reason);
        });
      }
      console.log(`${TAG} ✅ Canceladas: ${exitosas}/${bookingIds.length}`);
      return {
        ok: true,
        mensaje: `${exitosas} de ${bookingIds.length} reservas canceladas`,
        exitosas,
        total: bookingIds.length,
        fallidas: fallidas.length
      };
    } catch (error) {
      console.error(`${TAG} ❌ Error cancelarBookingsPack:`, error);
      return { ok: false, error: error.message };
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// v3.16: GUARDAR EXTRA EN BOOKING (extended field extra_checkout)
// ═══════════════════════════════════════════════════════════════════════════

export const guardarExtra = webMethod(
  Permissions.Anyone,
  async ({ bookingId, descripcion, importe }) => {
    try {
      console.log(`${TAG} ✏️ guardarExtra: ${bookingId} → ${descripcion}|${importe}`);

      if (!bookingId) {
        return { ok: false, error: 'bookingId requerido' };
      }

      const valor = (descripcion && importe > 0)
        ? `${descripcion.trim()}|${parseFloat(importe).toFixed(2)}`
        : '';

      const elevatedUpdate = elevate(bookings.updateExtendedFields);
      await elevatedUpdate(bookingId, '_user_fields', {
        namespaceData: { extra_checkout: valor }
      });

      console.log(`${TAG} ✅ Extra guardado: ${valor || '(vacío = eliminado)'}`);
      return { ok: true, valor };

    } catch (error) {
      console.error(`${TAG} ❌ Error guardarExtra:`, error);
      return { ok: false, error: error.message };
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// FUNCIÓN: Obtener pagos de la colección
// ═══════════════════════════════════════════════════════════════════════════

export const obtenerPagos = webMethod(
  Permissions.Anyone,
  async ({ fechaDesde, fechaHasta }) => {
    try {
      console.log(`${TAG} 📊 Obteniendo pagos: ${fechaDesde} - ${fechaHasta}`);

      let query = wixData.query(COLECCION_PAGOS);

      if (fechaDesde) {
        query = query.ge('fechaPago', new Date(fechaDesde));
      }
      if (fechaHasta) {
        const hasta = new Date(fechaHasta);
        hasta.setDate(hasta.getDate() + 1);
        query = query.lt('fechaPago', hasta);
      }

      query = query.ascending('fechaPago');

      const result = await query.find();

      console.log(`${TAG} ✅ Pagos encontrados: ${result.items.length}`);

      return {
        ok: true,
        pagos: result.items,
        total: result.items.length
      };

    } catch (error) {
      console.error(`${TAG} ❌ Error:`, error);
      return { ok: false, error: error.message };
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// FUNCIÓN: Obtener estadísticas para gráficos
// ═══════════════════════════════════════════════════════════════════════════

export const obtenerEstadisticas = webMethod(
  Permissions.Anyone,
  async ({ fechaDesde, fechaHasta }) => {
    try {
      console.log(`${TAG} 📊 Obteniendo estadísticas: ${fechaDesde} - ${fechaHasta}`);

      let query = wixData.query(COLECCION_PAGOS);

      if (fechaDesde) {
        query = query.ge('fechaPago', new Date(fechaDesde));
      }
      if (fechaHasta) {
        const hasta = new Date(fechaHasta);
        hasta.setDate(hasta.getDate() + 1);
        query = query.lt('fechaPago', hasta);
      }

      query = query.limit(1000);
      const result = await query.find();
      const pagos = result.items;

      if (pagos.length === 0) {
        return { ok: true, hayDatos: false };
      }

      const ingresosPorDia = {};
      pagos.forEach(p => {
        if (p.fechaPago) {
          const dia = new Date(p.fechaPago).toISOString().split('T')[0];
          ingresosPorDia[dia] = (ingresosPorDia[dia] || 0) + (p.importeTotal || 0);
        }
      });

      const diasOrdenados = Object.keys(ingresosPorDia).sort();
      const datosIngresosDia = {
        labels: diasOrdenados.map(d => {
          const fecha = new Date(d);
          return `${fecha.getDate()}/${fecha.getMonth() + 1}`;
        }),
        valores: diasOrdenados.map(d => ingresosPorDia[d])
      };

      const porMetodo = {};
      pagos.forEach(p => {
        const metodo = p.tipoPago || 'Sin especificar';
        porMetodo[metodo] = (porMetodo[metodo] || 0) + (p.importeTotal || 0);
      });

      const datosMetodoPago = {
        labels: Object.keys(porMetodo),
        valores: Object.values(porMetodo)
      };

      const porStaff = {};
      pagos.forEach(p => {
        const staff = p.staff || 'Sin asignar';
        porStaff[staff] = (porStaff[staff] || 0) + (p.importeTotal || 0);
      });

      const staffOrdenado = Object.entries(porStaff)
        .sort((a, b) => b[1] - a[1]);

      const datosStaff = {
        labels: staffOrdenado.map(s => s[0]),
        valores: staffOrdenado.map(s => s[1])
      };

      const porServicio = {};
      pagos.forEach(p => {
        const desc = p.descripcion || '';
        const servicios = desc.split(',').map(s => s.trim());
        servicios.forEach(srv => {
          const match = srv.match(/^([^(]+)/);
          if (match) {
            const nombre = match[1].trim();
            if (nombre && nombre.length > 0) {
              const precioMatch = srv.match(/\((\d+)€\)/);
              const precio = precioMatch ? parseFloat(precioMatch[1]) : 0;
              porServicio[nombre] = (porServicio[nombre] || 0) + precio;
            }
          }
        });
      });

      const serviciosOrdenados = Object.entries(porServicio)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

      const datosServicios = {
        labels: serviciosOrdenados.map(s => s[0]),
        valores: serviciosOrdenados.map(s => s[1])
      };

      const totalIngresos = pagos.reduce((sum, p) => sum + (p.importeTotal || 0), 0);
      const totalTransacciones = pagos.length;

      console.log(`${TAG} ✅ Estadísticas: ${totalTransacciones} transacciones, ${totalIngresos}€`);

      return {
        ok: true,
        hayDatos: true,
        totalIngresos,
        totalTransacciones,
        ingresosPorDia: datosIngresosDia,
        porMetodoPago: datosMetodoPago,
        porStaff: datosStaff,
        porServicio: datosServicios
      };

    } catch (error) {
      console.error(`${TAG} ❌ Error estadísticas:`, error);
      return { ok: false, error: error.message };
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// FUNCIÓN: Generar Excel
// ═══════════════════════════════════════════════════════════════════════════

export const generarExcel = webMethod(
  Permissions.Anyone,
  async ({ fechaDesde, fechaHasta }) => {
    try {
      console.log(`${TAG} 📊 Generando Excel: ${fechaDesde} - ${fechaHasta}`);

      const resultado = await obtenerPagos({ fechaDesde, fechaHasta });

      if (!resultado.ok) {
        return { ok: false, error: resultado.error };
      }

      const pagos = resultado.pagos;

      if (pagos.length === 0) {
        return { ok: false, error: 'No hay pagos en el rango seleccionado' };
      }

      const datosExcel = pagos.map(p => ({
        'Fecha Pago': p.fechaPago ? new Date(p.fechaPago).toLocaleDateString('es-ES') : '',
        'Fecha Reserva': p.fechaReserva ? new Date(p.fechaReserva).toLocaleDateString('es-ES') : '',
        'Cliente': p.nombreCliente || '',
        'Descripción': p.descripcion || '',
        'Importe (€)': p.importeTotal || 0,
        'Tipo Pago': p.tipoPago || '',
        'Staff': p.staff || '',
        'Booking ID': p.bookingId || ''
      }));

      const ws = XLSX.utils.json_to_sheet(datosExcel);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Pagos');

      ws['!cols'] = [
        { wch: 12 },
        { wch: 12 },
        { wch: 25 },
        { wch: 40 },
        { wch: 12 },
        { wch: 10 },
        { wch: 15 },
        { wch: 40 }
      ];

      const buffer = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });

      const nombreArchivo = `pagos_${fechaDesde || 'inicio'}_${fechaHasta || 'fin'}.xlsx`;

      console.log(`${TAG} ✅ Excel generado: ${pagos.length} registros`);

      return {
        ok: true,
        archivo: buffer,
        nombreArchivo,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        totalRegistros: pagos.length
      };

    } catch (error) {
      console.error(`${TAG} ❌ Error generando Excel:`, error);
      return { ok: false, error: error.message };
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// FUNCIÓN: Generar PDF
// ═══════════════════════════════════════════════════════════════════════════

export const generarPdf = webMethod(
  Permissions.Anyone,
  async ({ fechaDesde, fechaHasta }) => {
    try {
      console.log(`${TAG} 📄 Generando PDF: ${fechaDesde} - ${fechaHasta}`);

      const resultado = await obtenerPagos({ fechaDesde, fechaHasta });

      if (!resultado.ok) {
        return { ok: false, error: resultado.error };
      }

      const pagos = resultado.pagos;

      if (pagos.length === 0) {
        return { ok: false, error: 'No hay pagos en el rango seleccionado' };
      }

      const doc = new jsPDF();

      doc.setFontSize(18);
      doc.text('Informe de Pagos - Hair Times', 14, 20);

      doc.setFontSize(11);
      const subtitulo = `Período: ${fechaDesde || 'Inicio'} - ${fechaHasta || 'Fin'}`;
      doc.text(subtitulo, 14, 28);

      doc.setLineWidth(0.5);
      doc.line(14, 32, 196, 32);

      let y = 40;
      const lineHeight = 7;
      const pageHeight = 280;

      const totalImporte = pagos.reduce((sum, p) => sum + (p.importeTotal || 0), 0);

      doc.setFontSize(10);
      doc.setFont(undefined, 'bold');
      doc.text(`Total registros: ${pagos.length}`, 14, y);
      doc.text(`Importe total: ${totalImporte.toFixed(2)} €`, 100, y);
      y += lineHeight * 2;

      doc.setFillColor(240, 240, 240);
      doc.rect(14, y - 4, 182, 8, 'F');
      doc.setFont(undefined, 'bold');
      doc.setFontSize(9);
      doc.text('Fecha', 16, y);
      doc.text('Cliente', 40, y);
      doc.text('Descripción', 80, y);
      doc.text('Importe', 145, y);
      doc.text('Tipo', 170, y);
      y += lineHeight;

      doc.setFont(undefined, 'normal');
      doc.setFontSize(8);

      for (const pago of pagos) {
        if (y > pageHeight) {
          doc.addPage();
          y = 20;
        }

        const fecha = pago.fechaPago ? new Date(pago.fechaPago).toLocaleDateString('es-ES') : '';
        const cliente = (pago.nombreCliente || '').substring(0, 20);
        const desc = (pago.descripcion || '').substring(0, 35);
        const importe = `${(pago.importeTotal || 0).toFixed(2)} €`;
        const tipo = pago.tipoPago || '';

        doc.text(fecha, 16, y);
        doc.text(cliente, 40, y);
        doc.text(desc, 80, y);
        doc.text(importe, 145, y);
        doc.text(tipo, 170, y);

        y += lineHeight;
      }

      const totalPaginas = doc.internal.getNumberOfPages();
      for (let i = 1; i <= totalPaginas; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(128);
        doc.text(`Página ${i} de ${totalPaginas}`, 14, 290);
        doc.text(`Generado: ${new Date().toLocaleString('es-ES')}`, 140, 290);
      }

      const pdfBase64 = doc.output('datauristring').split(',')[1];

      const nombreArchivo = `pagos_${fechaDesde || 'inicio'}_${fechaHasta || 'fin'}.pdf`;

      console.log(`${TAG} ✅ PDF generado: ${pagos.length} registros`);

      return {
        ok: true,
        archivo: pdfBase64,
        nombreArchivo,
        mimeType: 'application/pdf',
        totalRegistros: pagos.length
      };

    } catch (error) {
      console.error(`${TAG} ❌ Error generando PDF:`, error);
      return { ok: false, error: error.message };
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// v3.14: GENERAR FACTURA --- Wix Invoices API
// ═══════════════════════════════════════════════════════════════════════════

export const generarFactura = webMethod(
  Permissions.Anyone,
  async ({ contactId, email, contactName, contactPhone,
           servicios, totalPack, descuentoTotal, promoInfo,
           metodoPago, fechaReserva, staff, extra }) => {
    try {
      console.log(`${TAG} 📄 generarFactura: contactName="${contactName}" | email="${email}" | contactId="${contactId}" | totalPack=${totalPack}€`);

      let emailReal = (email && email !== 'booking@hair-times.com') ? email : '';
      let emailFactura = emailReal || 'info@hair-times.com';
      if (!emailReal) {
        console.log(`${TAG} ℹ️ Sin email cliente --- factura usará fallback pero sin sobrescribir nombre`);
      }

      const IVA_RATE = 21;
      const IVA_DIVISOR = 1 + (IVA_RATE / 100);

      const lineItems = (servicios || [])
        .filter(s => {
          const precio = s.precioFinal ?? s.precio ?? 0;
          return precio > 0;
        })
        .map(s => {
          const precioConIVA = s.precioFinal ?? s.precio ?? 0;
          const baseImponible = Math.round((precioConIVA / IVA_DIVISOR) * 100) / 100;
          return {
            name: (s.serviceName || 'Servicio').trim(),
            description: `${staff || ''} | ${(s.startDate || '').substring(11, 16) || ''}`.trim(),
            price: baseImponible,
            quantity: 1,
            taxes: [{ name: 'IVA', rate: IVA_RATE, code: 'IVA' }]
          };
        });

      if (extra && extra.importe > 0) {
        const extraBaseImponible = Math.round((extra.importe / IVA_DIVISOR) * 100) / 100;
        lineItems.push({
          name: (extra.descripcion || 'Extra personalizado').trim(),
          description: 'Extra añadido en checkout',
          price: extraBaseImponible,
          quantity: 1,
          taxes: [{ name: 'IVA', rate: IVA_RATE, code: 'IVA' }]
        });
        console.log(`${TAG} ✏️ Extra en factura: ${extra.descripcion} → base=${extraBaseImponible}€`);
      }

      if (lineItems.length === 0) {
        console.log(`${TAG} ⚠️ Sin servicios con precio --- no se genera factura`);
        return { ok: false, error: 'NO_ITEMS' };
      }

      let nameParts = (contactName || '').split(' ');
      let firstName = nameParts[0] || '';
      let lastName = nameParts.slice(1).join(' ') || '';

      if (!firstName && contactId) {
        try {
          const elevatedGetContact = elevate(contacts.getContact);
          const contactData = await elevatedGetContact(contactId);
          firstName = contactData?.info?.name?.first || '';
          lastName = contactData?.info?.name?.last || '';
          console.log(`${TAG} 👤 Nombre desde CRM: ${firstName} ${lastName}`);
        } catch (crmErr) {
          console.log(`${TAG} ⚠️ No se pudo obtener nombre de CRM: ${crmErr.message}`);
        }
      }

      const invoiceFields = {
        title: `Servicios ${fechaReserva || ''}`,
        customer: {
          contactId: contactId || undefined,
          email: emailFactura,
          phone: contactPhone || '',
          firstName: firstName,
          lastName: lastName,
          fullName: `${firstName} ${lastName}`.trim()
        },
        currency: 'EUR',
        lineItems: lineItems,
        dates: {
          issueDate: new Date(),
          dueDate: new Date()
        },
        metadata: {
          notes: 'Gracias por confiar en nosotros',
          source: 'KAMISUITE',
          sourceRefId: `checkout-${fechaReserva || new Date().toISOString().substring(0, 10)}`
        }
      };

      if (descuentoTotal > 0) {
        const descuentoBase = Math.round((descuentoTotal / IVA_DIVISOR) * 100) / 100;
        invoiceFields.discount = {
          value: descuentoBase,
          type: 'Fixed'
        };
      }

      console.log(`${TAG} 📄 Creando factura: ${lineItems.length} líneas, total=${totalPack}€`);

      const result = await invoices.createInvoice(invoiceFields);
      const invoiceId = result?.id?.id || result?.id || result?._id || null;
      console.log(`${TAG} ✅ Factura creada: ${invoiceId}`);

      try {
        await invoices.addPayment(result.id, {
          type: 'Offline',
          amount: totalPack || 0,
          date: new Date()
        });
        console.log(`${TAG} ✅ Pago registrado en factura`);
      } catch (payErr) {
        console.warn(`${TAG} ⚠️ Error registrando pago: ${payErr.message}`);
      }

      let previewUrl = null;
      try {
        previewUrl = await invoices.createInvoicePreviewUrl(result.id, { suppressAuth: true });
        console.log(`${TAG} ✅ Preview URL generada`);
      } catch (urlErr) {
        console.warn(`${TAG} ⚠️ Error generando preview URL: ${urlErr.message}`);
      }

      return {
        ok: true,
        invoiceId: invoiceId,
        previewUrl: previewUrl
      };

    } catch (error) {
      console.error(`${TAG} ❌ Error generarFactura:`, error);
      return { ok: false, error: error.message };
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// ✅ v3.20: OBTENER DATOS DE CIERRE DEL DÍA (Externos + Productos)
// v3.26: Productos ahora se leen de PaymentReservations (staff="TIENDA")
//        en lugar de orders.searchOrders. Externos sin cambios.
// ═══════════════════════════════════════════════════════════════════════════

export const obtenerDatosCierreDia = webMethod(
  Permissions.Anyone,
  async ({ fechaISO }) => {
    try {
      console.log(`${TAG} 📊 obtenerDatosCierreDia: ${fechaISO}`);

      // ─── EXTERNOS (sin cambios v3.20) ─────────────────────────────────
      let mapaComisiones = {};
      let comisionFallback = 0;

      try {
        const catResult = await wixData.query(CMS_EXTERNAL_SERVICES)
          .eq('activeStatus', true)
          .limit(100)
          .find();

        const catalogoExt = catResult.items || [];
        console.log(`${TAG} 📊 ExternalServices activos: ${catalogoExt.length}`);

        for (const item of catalogoExt) {
          const nombre = (item.serviceName || '').trim().toUpperCase();
          const pct = Number(item.commissionPercentage || 0);
          if (nombre) {
            mapaComisiones[nombre] = pct;
          }
          if (comisionFallback === 0 && pct > 0) {
            comisionFallback = pct;
          }
        }

        console.log(`${TAG} 📊 Mapa comisiones:`, JSON.stringify(mapaComisiones));
      } catch (catErr) {
        console.warn(`${TAG} ⚠️ Error leyendo ExternalServices:`, catErr.message);
      }

      let externosData = { citas: 0, ventaBruta: 0, comisionTotal: 0, desglose: [] };

      try {
        const startUTC = new Date(new Date(`${fechaISO}T00:00:00`).getTime() - 3 * 3600000);
        const endUTC   = new Date(new Date(`${fechaISO}T23:59:59`).getTime() + 3 * 3600000);

        const extResult = await wixData.query(CMS_EXTERNAL_RECORDS)
          .ge('date', startUTC)
          .le('date', endUTC)
          .ascending('date')
          .limit(100)
          .find();

        const citasDelDia = (extResult.items || []).filter(item => {
          if (!item.date) return false;
          const d = new Date(item.date);
          const madridDate = d.toLocaleDateString('en-CA', { timeZone: TIMEZONE_MADRID });
          if (madridDate !== fechaISO) return false;
          if (item.status === 'BLOQUEADO' || item.category === 'BLOQUEO') return false;
          return true;
        });

        console.log(`${TAG} 📊 Citas externas del día: ${citasDelDia.length}`);

        let ventaBruta = 0;
        let comisionTotal = 0;
        const desglosePorServicio = {};

        for (const cita of citasDelDia) {
          const precio = Number(cita.totalPrice || 0);
          const catUpper = (cita.category || '').trim().toUpperCase();

          let pctComision = 0;
          if (mapaComisiones[catUpper] !== undefined) {
            pctComision = mapaComisiones[catUpper];
          } else {
            const partes = catUpper.split('+').map(p => p.trim());
            for (const parte of partes) {
              if (mapaComisiones[parte] !== undefined) {
                pctComision = mapaComisiones[parte];
                break;
              }
            }
            if (pctComision === 0 && comisionFallback > 0) {
              pctComision = comisionFallback;
            }
          }

          const comision = Math.round((precio * pctComision / 100) * 100) / 100;
          ventaBruta += precio;
          comisionTotal += comision;

          const nombreServicio = cita.modality || cita.category || 'Servicio externo';
          if (!desglosePorServicio[nombreServicio]) {
            desglosePorServicio[nombreServicio] = { nombre: nombreServicio, count: 0, ventaBruta: 0, comision: 0 };
          }
          desglosePorServicio[nombreServicio].count++;
          desglosePorServicio[nombreServicio].ventaBruta += precio;
          desglosePorServicio[nombreServicio].comision += comision;
        }

        externosData = {
          citas: citasDelDia.length,
          ventaBruta: Math.round(ventaBruta * 100) / 100,
          comisionTotal: Math.round(comisionTotal * 100) / 100,
          desglose: Object.values(desglosePorServicio)
        };

        console.log(`${TAG} 📊 Externos: bruta=${externosData.ventaBruta}€, comisión=${externosData.comisionTotal}€`);
      } catch (extErr) {
        console.warn(`${TAG} ⚠️ Error SvExternalRecords:`, extErr.message);
      }

      // ─── PRODUCTOS (v3.26: ahora desde CMS, no Wix Stores) ────────────
      // Lee PaymentReservations donde staff="TIENDA" y fechaPago en el día.
      // Cada registro tiene descripcion="🛒 Producto1 (X€), 🛒 Producto2 (Y€)"
      // Parsea cada token y agrupa por nombre de producto.
      let productosData = { pedidos: 0, totalProductos: 0, desglose: [] };

      try {
        const startOfDay = new Date(`${fechaISO}T00:00:00.000`);
        const endOfDay   = new Date(`${fechaISO}T23:59:59.999`);

        const ventasResult = await wixData.query(COLECCION_PAGOS)
          .ge('fechaPago', startOfDay)
          .le('fechaPago', endOfDay)
          .eq('staff', 'TIENDA')
          .limit(500)
          .find();

        const ventas = ventasResult.items || [];
        console.log(`${TAG} 📊 Ventas TIENDA del día: ${ventas.length}`);

        let totalProductos = 0;
        const desgloseProd = {};

        for (const venta of ventas) {
          const productos = parsearTokensProducto(venta.descripcion || '');
          for (const prod of productos) {
            totalProductos += prod.subtotal;
            if (!desgloseProd[prod.nombre]) {
              desgloseProd[prod.nombre] = {
                nombre: prod.nombre,
                count: 0,
                total: 0,
                precioUnit: prod.precioUnit
              };
            }
            desgloseProd[prod.nombre].count += prod.cantidad;
            desgloseProd[prod.nombre].total += prod.subtotal;
          }
        }

        productosData = {
          pedidos: ventas.length,
          totalProductos: Math.round(totalProductos * 100) / 100,
          desglose: Object.values(desgloseProd)
        };

        console.log(`${TAG} 📊 Productos TIENDA: ${ventas.length} venta(s), total=${productosData.totalProductos}€`);
      } catch (prodErr) {
        console.warn(`${TAG} ⚠️ Error leyendo ventas TIENDA en ${COLECCION_PAGOS}:`, prodErr.message);
      }

      return { ok: true, externos: externosData, productos: productosData };

    } catch (error) {
      console.error(`${TAG} ❌ obtenerDatosCierreDia:`, error);
      return { ok: false, error: error.message, externos: null, productos: null };
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// v3.23: CONSULTAR SLOTS LIBRES PARA CAMBIAR FECHA
// ═══════════════════════════════════════════════════════════════════════════

function _madridToUTC(fechaISO, horaHHmm) {
  const [year, month, day] = String(fechaISO).split('-').map(Number);
  const [hour, minute] = String(horaHHmm).split(':').map(Number);
  const d = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const madridStr = d.toLocaleString('en-US', {
    timeZone: TIMEZONE_MADRID, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
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

function _addMinutesISO(iso, mins) {
  return new Date(new Date(iso).getTime() + mins * 60000).toISOString();
}

function _formatMadridTime(isoDate) {
  return new Date(isoDate).toLocaleTimeString('es-ES', {
    timeZone: TIMEZONE_MADRID, hour: '2-digit', minute: '2-digit', hour12: false
  });
}

export const consultarSlotsParaCambio = webMethod(
  Permissions.Anyone,
  async ({ fechaISO, serviceId, staffId }) => {
    try {
      console.log(`${TAG} 📅 consultarSlotsParaCambio: fecha=${fechaISO} svc=${serviceId?.substring(0,8)} staff=${staffId?.substring(0,8)}`);

      if (!fechaISO || !serviceId) {
        return { ok: false, error: 'Faltan parámetros (fechaISO, serviceId)', slots: [] };
      }

      const query = {
        filter: {
          serviceId: [serviceId],
          startDate: `${fechaISO}T00:00:00.000`,
          endDate: `${fechaISO}T23:59:59.000`
        },
        timezone: TIMEZONE_MADRID
      };

      const elevatedQuery = elevate(availabilityCalendar.queryAvailability);
      const availability = await elevatedQuery(query);
      const entries = availability?.availabilityEntries || [];

      console.log(`${TAG} 📅 queryAvailability: ${entries.length} entries totales`);

      const filtered = entries.filter(entry => {
        if (!entry.bookable) return false;
        if (staffId) {
          const resId = entry.slot?.resource?._id || entry.slot?.resource?.id || '';
          if (resId && resId !== staffId) return false;
        }
        return true;
      });

      const slots = filtered.map(entry => {
        const slot = entry.slot || {};
        const hora = slot.startDate ? _formatMadridTime(slot.startDate) : '';
        return {
          startDate: slot.startDate,
          endDate: slot.endDate,
          hora: hora
        };
      }).filter(s => s.hora);

      const horasVistas = new Set();
      const slotsUnicos = [];
      for (const s of slots) {
        if (!horasVistas.has(s.hora)) {
          horasVistas.add(s.hora);
          slotsUnicos.push(s);
        }
      }

      slotsUnicos.sort((a, b) => a.hora.localeCompare(b.hora));

      console.log(`${TAG} 📅 ${slotsUnicos.length} slots disponibles para staff ${staffId?.substring(0,8) || 'ANY'}`);

      return { ok: true, slots: slotsUnicos };

    } catch (error) {
      console.error(`${TAG} ❌ Error consultarSlotsParaCambio:`, error);
      return { ok: false, error: error.message, slots: [] };
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// v3.23 + v3.25: CAMBIAR FECHA/HORA DE BOOKINGS (RESCHEDULE)
// v3.25: Auto-fetch revision ANTES del sort para drag & drop
// ═══════════════════════════════════════════════════════════════════════════

export const cambiarFechaBookings = webMethod(
  Permissions.Anyone,
  async ({ servicios, nuevaFechaISO, nuevaHoraHHmm, forzado }) => {
    try {
      console.log(`${TAG} 📅 cambiarFechaBookings: ${servicios?.length || 0} bookings → ${nuevaFechaISO} ${nuevaHoraHHmm} | forzado=${forzado}`);

      if (!Array.isArray(servicios) || servicios.length === 0) {
        return { ok: false, error: 'No se proporcionaron servicios para cambiar' };
      }
      if (!nuevaFechaISO || !nuevaHoraHHmm) {
        return { ok: false, error: 'Faltan nuevaFechaISO o nuevaHoraHHmm' };
      }

      // Solo servicios de tipo booking (no productos)
      const bookingServs = servicios.filter(s => s.bookingId && s.bookingId !== null);
      if (bookingServs.length === 0) {
        return { ok: false, error: 'No hay bookings válidos para cambiar' };
      }

      // ── v3.25: Auto-fetch revision + dates para drag & drop ──
      const elevatedQueryForRev = elevate(extendedBookings.queryExtendedBookings);
      for (const svc of bookingServs) {
        if (!svc.revision || !svc.startDate || !svc.endDate) {
          try {
            console.log(`${TAG} 📅 Auto-fetching booking data: ${svc.bookingId?.substring(0,8)}...`);
            const qr = await elevatedQueryForRev({
              filter: { $and: [
                { startDate: { $gte: `${nuevaFechaISO}T00:00:00.000Z` } },
                { startDate: { $lte: `${nuevaFechaISO}T23:59:59.999Z` } }
              ]},
              paging: { limit: 100 }
            });
            const found = (qr?.extendedBookings || []).find(eb => (eb.booking?._id || eb._id) === svc.bookingId);
            const bk = found?.booking || found;
            if (bk) {
              if (!svc.revision) svc.revision = bk.revision || bk._revision;
              const slot = bk.bookedEntity?.slot || {};
              if (!svc.startDate) svc.startDate = slot.startDate || bk.startDate;
              if (!svc.endDate) svc.endDate = slot.endDate || bk.endDate;
              if (!svc.serviceId) svc.serviceId = slot.serviceId;
              if (!svc.scheduleId) svc.scheduleId = slot.resource?.scheduleId || slot.scheduleId;
              console.log(`${TAG} ✅ Auto-fetched: rev=${svc.revision} | start=${svc.startDate?.substring?.(11,16) || '?'}`);
            } else {
              console.warn(`${TAG} ⚠️ Booking ${svc.bookingId?.substring(0,8)} no encontrado en fecha ${nuevaFechaISO}`);
            }
          } catch(revErr) {
            console.warn(`${TAG} ⚠️ Auto-fetch falló: ${revErr.message}`);
          }
        }
      }

      // Ordenar por startDate original
      bookingServs.sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''));

      // Calcular offsets relativos desde el primer booking
      const firstStart = new Date(bookingServs[0].startDate).getTime();
      const offsets = bookingServs.map(s => ({
        bookingId: s.bookingId,
        serviceId: s.serviceId,
        staffId: s.staffId,
        revision: s.revision,
        scheduleId: s.scheduleId,
        offsetStartMs: new Date(s.startDate).getTime() - firstStart,
        durationMs: new Date(s.endDate).getTime() - new Date(s.startDate).getTime()
      }));

      // Nueva hora base en UTC
      const newBaseUTC = _madridToUTC(nuevaFechaISO, nuevaHoraHHmm);
      const newBaseMs = new Date(newBaseUTC).getTime();

      console.log(`${TAG} 📅 Base UTC: ${newBaseUTC} | ${offsets.length} bookings con offsets`);

      const elevatedReschedule = elevate(bookings.rescheduleBooking);

      const resultados = [];

      for (const offset of offsets) {
        try {
          if (!offset.revision) {
            resultados.push({ bookingId: offset.bookingId, ok: false, error: 'Sin revision en datos del servicio' });
            continue;
          }

          const newStartMs = newBaseMs + offset.offsetStartMs;
          const newEndMs = newStartMs + offset.durationMs;
          const newStartISO = new Date(newStartMs).toISOString();
          const newEndISO = new Date(newEndMs).toISOString();

          console.log(`${TAG} 📅 Booking ${offset.bookingId.substring(0,8)}: offset=${offset.offsetStartMs/60000}min | rev=${offset.revision} | sched=${offset.scheduleId?.substring(0,8)}`);

          const newSlot = {
            startDate: newStartISO,
            endDate: newEndISO,
            timezone: TIMEZONE_MADRID
          };
          if (offset.serviceId) newSlot.serviceId = offset.serviceId;
          if (offset.scheduleId) newSlot.scheduleId = offset.scheduleId;
          if (offset.staffId) newSlot.resource = { id: offset.staffId };

          const rescheduleOptions = {
            revision: String(offset.revision),
            participantNotification: { notifyParticipants: false },
            flowControlSettings: {
              skipAvailabilityValidation: true,
              ignoreReschedulePolicy: true
            }
          };

          console.log(`${TAG} 📅 newSlot: ${JSON.stringify(newSlot)}`);
          console.log(`${TAG} 📅 options: ${JSON.stringify(rescheduleOptions)}`);

          const rescheduleResult = await elevatedReschedule(
            offset.bookingId,
            newSlot,
            rescheduleOptions
          );

          console.log(`${TAG} ✅ Reschedule OK: ${offset.bookingId.substring(0,8)}`);
          resultados.push({ bookingId: offset.bookingId, ok: true });

        } catch (bkErr) {
          console.error(`${TAG} ❌ Error reschedule ${offset.bookingId?.substring(0,8)}:`, bkErr.message);
          resultados.push({ bookingId: offset.bookingId, ok: false, error: bkErr.message });
        }
      }

      const exitosos = resultados.filter(r => r.ok).length;
      const fallidos = resultados.filter(r => !r.ok);

      if (fallidos.length > 0) {
        console.warn(`${TAG} ⚠️ ${fallidos.length} bookings fallaron al cambiar fecha`);
        fallidos.forEach(f => console.warn(`${TAG}   - ${f.bookingId}: ${f.error}`));
      }

      console.log(`${TAG} ✅ Cambiados: ${exitosos}/${bookingServs.length}`);

      return {
        ok: exitosos > 0,
        mensaje: `${exitosos} de ${bookingServs.length} reservas cambiadas a ${nuevaFechaISO} ${nuevaHoraHHmm}`,
        exitosos,
        total: bookingServs.length,
        fallidos: fallidos.length,
        resultados
      };

    } catch (error) {
      console.error(`${TAG} ❌ Error cambiarFechaBookings:`, error);
      return { ok: false, error: error.message };
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// TEMPORAL: Diagnóstico de bookings
// ═══════════════════════════════════════════════════════════════════════════

export const diagnosticarDia = webMethod(
  Permissions.Anyone,
  async ({ fechaISO }) => {
    try {
      console.log(`${TAG} 🔍 DIAG-A: queryExtendedBookings SIN filtro para ${fechaISO}`);
      const elevatedQueryExt = elevate(extendedBookings.queryExtendedBookings);
      let allExt = [];
      let offset = 0;
      let hasMore = true;
      while (hasMore && offset < 500) {
        const result = await elevatedQueryExt({ paging: { limit: 100, offset } });
        const items = result?.extendedBookings || [];
        allExt = allExt.concat(items);
        hasMore = items.length === 100;
        offset += 100;
      }
      const extDelDia = allExt.filter(item => {
        const sd = item.booking?.bookedEntity?.slot?.startDate;
        return sd && sd.includes(fechaISO);
      });
      console.log(`${TAG} 🔍 DIAG-A: ${allExt.length} total → ${extDelDia.length} del día`);
      extDelDia.forEach((item, i) => {
        const bk = item.booking;
        console.log(`${TAG} 🔍 A[${i}] ${bk?.status} | ${bk?.bookedEntity?.title} | ${bk?.contactDetails?.firstName}`);
      });

      console.log(`${TAG} 🔍 DIAG-C: queryExtendedBookings CON filtro startDate para ${fechaISO}`);
      const startOfDay = `${fechaISO}T00:00:00.000Z`;
      const endOfDay = `${fechaISO}T23:59:59.999Z`;
      let allFiltered = [];
      offset = 0;
      hasMore = true;
      while (hasMore && offset < 500) {
        const result = await elevatedQueryExt({
          filter: {
            $and: [
              { startDate: { $gte: startOfDay } },
              { startDate: { $lte: endOfDay } }
            ]
          },
          paging: { limit: 100, offset }
        });
        const items = result?.extendedBookings || [];
        allFiltered = allFiltered.concat(items);
        hasMore = items.length === 100;
        offset += 100;
      }
      console.log(`${TAG} 🔍 DIAG-C: ${allFiltered.length} bookings con filtro startDate`);
      allFiltered.forEach((item, i) => {
        const bk = item.booking;
        console.log(`${TAG} 🔍 C[${i}] ${bk?.status} | ${bk?.bookedEntity?.title} | ${bk?.contactDetails?.firstName} | start=${bk?.bookedEntity?.slot?.startDate}`);
      });

      return { ok: true, sinFiltro: extDelDia.length, conFiltro: allFiltered.length };

    } catch (error) {
      console.error(`${TAG} ❌ Error diagnosticarDia:`, error);
      return { ok: false, error: error.message };
    }
  }
);