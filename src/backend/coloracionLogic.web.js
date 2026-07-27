// =====================================================
// KAMISUITE - Backend Unificado para Coloraciones
// =====================================================
// VERSION: 3.2.8-KAMISUITE
// FECHA: 26 de mayo de 2026
//
// CAMBIOS v3.2.8:
// - FIX CRÍTICO: skipAvailability=true en APLICACIÓN y fases POST
//   (crearComplementos), tanto desde web pública como desde recepción.
//   La disponibilidad ya se valida en consultarDisponibilidadUnificada;
//   Wix revalidaba cada fase individual causando SLOT_NOT_AVAILABLE
//   aleatorios en reservas online válidas (misma race condition que
//   tratamientosLogic v1.1.0).
//
// CAMBIOS v3.2.7:
// - MIGRACIÓN A CENTRALITA DE COMUNICACIONES.
//   El envío de la confirmación de reserva al cliente deja de hacerse
//   directamente desde este backend con triggeredEmails.emailContact.
//   Ahora se delega en `comunicacionesLogic.web.js` (centralita) que
//   se encarga de disparar email + WhatsApp + futuros canales según
//   SalonConfig.
//
//   Cambios concretos:
//   (a) Import: se elimina `triggeredEmails` de wix-crm-backend, se
//       añade import de `notificarConfirmacion` de comunicacionesLogic.
//   (b) Eliminada la constante hardcoded EMAIL_CONFIRMACION_ID = 'VA5UQRG'
//       (el template ID ahora vive en SalonConfig.confirmationTemplateId).
//   (c) Eliminada la función enviarConfirmacionReserva() completa
//       (~35 líneas). La centralita absorbe esa responsabilidad.
//   (d) En crearComplementos() la llamada a enviarConfirmacionReserva()
//       se reemplaza por notificarConfirmacion() con la misma información
//       más telefono y email para que la centralita decida canales.
//   (e) emailVariables se mantienen idénticas a las de v3.2.6 para que
//       el template Wix (VA5UQRG) reciba los mismos campos que hoy.
//
//   No se toca:
//     - ensureContactInCRM ni el bloque anti-envenenamiento (v3.2.6)
//     - confirmarEnCalendario flujo principal
//     - createAndConfirmBookingPhase
//     - Motor de disponibilidad, cascada, promo, precios, staff
//     - sendInternalAlert ni saveNotaToCRM (no son comunicación cliente)
//
//   Riesgo: bajo. El cambio es sustractivo y aislado en el bloque de
//   envío post-booking. Si la centralita falla, la reserva ya está
//   creada y confirmada — el cliente simplemente no recibe la
//   notificación, igual que si hoy fallara triggeredEmails.
//
// CAMBIOS v3.2.6:
// - FIX CRÍTICO ANTI-ENVENENAMIENTO: ensureContactInCRM reescrito.
//   Resuelve el bug por el cual reservas creadas sin contactId resuelto
//   acababan con `contactId = owner del sitio` (d23efee3...) en bookings
//   y luego en PaymentReservations al cobrarse.
//
//   Cambios concretos en ensureContactInCRM:
//   (a) BUSCAR antes de crear: queryContacts por teléfono primero,
//       luego por nombre+apellido. Si existe → devolver su contactId.
//   (b) Crear con allowDuplicates: TRUE (no false). Garantiza que
//       cuando se crea, no se fusiona con un Wix Member existente
//       (causa raíz del 'd23efee3' que aglutinaba 182 nombres).
//   (c) Filtrar también info@hair-times.com (no solo booking@).
//   (d) Extracción robusta del ID del resultado: contempla
//       result.contact._id, result._id y result.id.
//   (e) Logs explícitos del flujo (búsqueda hit/miss, creación, error).
//
//   No se toca confirmarEnCalendario ni createAndConfirmBookingPhase.
//   La validación dura (abortar si null) se evaluará en v3.2.7
//   tras observar comportamiento de v3.2.6 en producción.
//
// CAMBIOS v3.2.5:
// - FIX CRÍTICO: ensureContactInCRM() garantiza que SIEMPRE se cree
//   contacto en Wix CRM antes de escribir cualquier booking.
//   Cubre todos los canales (web pública, recepción, Instagram, etc.)
//   Si memberContactId llega vacío, se crea contacto a partir de
//   contactDetails (nombre, email, teléfono) con allowDuplicates:false.
//   Resuelve: reservas online sin contacto CRM asociado.
//
// CAMBIOS v3.2.4:
// - NEW: Solapamiento forzado en modo recepción (origenRecepcion=true)
//   createAndConfirmBookingPhase acepta skipAvailability para pasar
//   flowControlSettings.skipAvailabilityValidation=true a Wix Bookings V2.
//   Solo se activa cuando origenRecepcion===true (strict equality).
//   Flujo web de clientes NO se ve afectado (origenRecepcion=false por defecto).
// - FIX: Try/catch individual por fase en crearComplementos.
//   Una fase que falle no corta la creación de las siguientes.
//
// CAMBIOS v3.2.3:
// - FIX: Eliminados filtros hardcodeados HORA_CIERRE_MAX_MIN=20:15
//
// CAMBIOS v3.2.2:
// - FIX: CUALQUIERA resuelve a humano real libre en confirmarEnCalendario()
//   Cuando empleadoId=CUALQUIERA, busca qué humano (Angela/Raquel/Ricardo)
//   está libre a esa hora y asigna la booking a ese recurso real.
//   Distribuye carga aleatoriamente entre humanos libres.
//   (Mismo fix que tratamientosLogic v1.0.4)
//
// CAMBIOS v3.2.1:
// - NEW: Campo origenRecepcion para marcar reservas de recepción
//
// CAMBIOS v3.2.0:
// - NEW: Orden de fases dinámico desde campo ordenFases del CMS
// - Elimina secuencia hardcodeada en crearComplementos
//
// CAMBIOS v3.1.5:
// - FIX: Campo promocin ahora guarda formato completo "nombre|descuento"
// - FIX: Servicios con promo ahora visibles en checkout
//
// SERVICIOS SOPORTADOS:
// - Mechas personalizadas
// - Tinte
// - Tinte vegetal
// - Tinte Hombre
// =====================================================

import wixData from 'wix-data';
import { webMethod, Permissions } from 'wix-web-module';
import { elevate } from 'wix-auth';
import { availabilityCalendar, bookings, services } from 'wix-bookings.v2';
import { resources as resourcesBackend } from 'wix-bookings-backend';
import { checkout } from 'wix-ecom-backend';
import { contacts, notifications } from 'wix-crm-backend';

// v3.2.7: triggeredEmails ya no se importa aquí — la centralita lo hace
// v3.2.7: Centralita de comunicaciones
import { notificarConfirmacion } from 'backend/comunicacionesLogic.web.js';

const VERSION = '3.2.8-KAMISUITE';
// v3.2.8: skipAvailability=true en APLICACIÓN y fases POST (crearComplementos).
//   Mismo fix que tratamientosLogic v1.1.0. Elimina SLOT_NOT_AVAILABLE por
//   revalidación redundante de Wix en fases de cascada. origenRecepcion
// v3.2.7: Migración a centralita comunicacionesLogic. Eliminado envío directo
//   triggeredEmails y constante EMAIL_CONFIRMACION_ID. Sin cambios funcionales
//   en reserva — solo en cómo se entrega la confirmación al cliente.
// v3.2.6: ensureContactInCRM reescrito — busca antes de crear, allowDuplicates:true,
//   filtra info@hair-times.com, extracción robusta del id. Anti-envenenamiento d23efee3.
// v3.2.5: ensureContactInCRM — garantiza contacto CRM en todos los canales
// v3.2.4: Solapamiento forzado en modo recepción + try/catch individual en complementos
// v3.2.3: Eliminados filtros hardcodeados HORA_CIERRE_MAX_MIN=20:15
//   - _consultarDisponibilidadV3: eliminado filtro endTime <= 20:15
//   - consultarDisponibilidadUnificada: eliminado filtro slot.endTime > '20:15'
//   El cierre dinámico deducido (fix v3.2.3 CASCADA) ya gestiona correctamente los límites
const TAG = `[Coloracion][${VERSION}]`;

// =====================================================
// CONSTANTES
// =====================================================

const COLLECTION_PUBLIC_SERVICES = 'Bookings/Services';
const COLLECTION_MAPEO = 'SvMapeoServicios';
const COLLECTION_PROMO = 'PromoColor';
const BUSINESS_TIMEZONE = 'Europe/Madrid';

// v3.2.7: Eliminada constante EMAIL_CONFIRMACION_ID = 'VA5UQRG'
// El template ID ahora vive en SalonConfig.confirmationTemplateId
// y se gestiona desde comunicacionesLogic.web.js (centralita).

const STAFF_IDS = {
  PROCESO: 'ac0c405a-f8c7-4580-a915-da28c89b2d43',
  ANGELA: '0c22fa77-3602-4876-b744-ded83ed540f8',
  RAQUEL: '0e69d7a3-4e36-40ec-9f3d-348f5bf3524d',
  RICARDO: 'b888c390-361d-4b0d-80f7-e0ba808bd7ce',
  CUALQUIERA: '240bb817-cd83-4a7c-ac1a-caef60f85315'
};

const HUMANOS_REALES = [STAFF_IDS.ANGELA, STAFF_IDS.RAQUEL, STAFF_IDS.RICARDO];

const STAFF_NAMES = {
  [STAFF_IDS.ANGELA]: 'Angela',
  [STAFF_IDS.RAQUEL]: 'Raquel',
  [STAFF_IDS.RICARDO]: 'Ricardo'
};

const STAFF_BLOCKLIST_NAMES = new Set(['PROCESO', 'CUALQUIERA']);

// =====================================================
// UTILIDADES
// =====================================================

function safeErr(e) {
  const out = { name: e?.name || 'Error', message: e?.message || String(e) };
  if (e?.details) out.details = e.details;
  if (e?.stack) out.stack = e.stack;
  return out;
}

function isGuid(x) {
  return typeof x === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
}

function toNum(v) {
  if (v == null) return 0;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(String(v).trim());
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function pickImageUrl(serviceItem) {
  const v = serviceItem?.imageURL || serviceItem?.image || serviceItem?.mainImage || serviceItem?.media;
  if (!v) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'object') return v.src || v.url || v.imageUrl || v.fileUrl || '';
  return '';
}

function formatLocalDate(date) {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return dtf.format(date);
}

function formatLocalTime(date) {
  const dtf = new Intl.DateTimeFormat('en-GB', {
    timeZone: BUSINESS_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  return dtf.format(date);
}

function formatFechaEmail(fechaISO) {
  const [year, month, day] = fechaISO.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  
  const dias = ['Domingo', 'Lunes', 'Martes', 'Mi\u00e9rcoles', 'Jueves', 'Viernes', 'S\u00e1bado'];
  const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 
                 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  
  const diaSemana = dias[date.getDay()];
  const diaNum = date.getDate();
  const mes = meses[date.getMonth()];
  
  return `${diaSemana} ${diaNum} de ${mes}`;
}

function calcularEndTimeCorrect(startTime, duracionMinutos) {
  const [hours, minutes] = startTime.split(':').map(Number);
  let totalMinutes = (hours * 60) + minutes + duracionMinutos;
  const newHours = Math.floor(totalMinutes / 60) % 24;
  const newMinutes = totalMinutes % 60;
  return `${String(newHours).padStart(2, '0')}:${String(newMinutes).padStart(2, '0')}`;
}

function addDaysToDateString(dateStr, days) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return formatLocalDate(date);
}

function hhmmToMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function minutesToHhmm(mins) {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

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

// =====================================================
// PROMO
// =====================================================

async function getPromoActiva(nombreServicio) {
  try {
    const r = await wixData.query(COLLECTION_PROMO)
      .eq('isActive', true)
      .limit(1)
      .find({ suppressAuth: true });
    
    const promo = (r?.items || [])[0];
    if (!promo) return null;
    
    const nombreUpper = String(nombreServicio || '').toUpperCase();
    let campoActivo = false;
    
    if (nombreUpper.includes('MECHA')) {
      campoActivo = promo.idActivoMechas === true;
    } else if (nombreUpper.includes('VEGETAL')) {
      campoActivo = promo.idActivoTinteVegetal === true;
    } else if (nombreUpper.includes('TINTE')) {
      campoActivo = promo.idActivoTinte === true;
    }
    
    if (!campoActivo) return null;
    
    const discountPercent = toNum(promo.discountPercent);
    if (discountPercent <= 0) return null;
    
    return {
      promoNombre: promo.colorName || 'Promoci\u00f3n',
      discountPercent
    };
    
  } catch (e) {
    console.warn(`${TAG} \u26a0\ufe0f Error leyendo promo:`, e.message);
    return null;
  }
}

// =====================================================
// PRECIOS
// =====================================================

async function getServicePrice(serviceId) {
  try {
    console.log(`${TAG} \ud83d\udcb0 Leyendo precio: ${serviceId}`);
    
    try {
      const elevatedGetService = elevate(services.getService);
      const svc = await elevatedGetService(serviceId);
      
      let price = 0;
      let currency = 'EUR';
      
      if (svc?.price?.amount) {
        price = toNum(svc.price.amount);
        if (price > 0) {
          currency = svc.price.currency || 'EUR';
          return { price, currency };
        }
      }
      
      if (svc?.paymentOptions?.wixPayOnline?.price) {
        price = toNum(svc.paymentOptions.wixPayOnline.price);
        if (price > 0) {
          currency = svc.paymentOptions.wixPayOnline.currency || 'EUR';
          return { price, currency };
        }
      }
      
      if (svc?.paymentOptions?.wixPayOffline?.price) {
        price = toNum(svc.paymentOptions.wixPayOffline.price);
        if (price > 0) {
          currency = svc.paymentOptions.wixPayOffline.currency || 'EUR';
          return { price, currency };
        }
      }
    } catch (e) {
      console.warn(`${TAG} \u26a0\ufe0f V2 API fall\u00f3, usando fallback:`, e.message);
    }
    
    const svcLegacy = await wixData.get(COLLECTION_PUBLIC_SERVICES, serviceId, { suppressAuth: true });
    const price = toNum(svcLegacy?.priceAmount) || 0;
    const currency = svcLegacy?.currency || 'EUR';
    
    return { price, currency };
    
  } catch (e) {
    console.error(`${TAG} \u274c Error leyendo precio de ${serviceId}:`, e);
    return { price: 0, currency: 'EUR' };
  }
}

async function calculateTotalPrice(serviceIds) {
  let total = 0;
  let currency = 'EUR';
  const breakdown = [];
  
  for (const serviceId of serviceIds) {
    if (!serviceId) continue;
    const { price, currency: curr } = await getServicePrice(serviceId);
    total += price;
    currency = curr;
    breakdown.push({ serviceId, price, currency });
  }
  
  console.log(`${TAG} \ud83d\udcb0 TOTAL: ${total} ${currency}`);
  return { total, currency, breakdown };
}

// =====================================================
// STAFF
// =====================================================

function normalizeStaffLabel(label) {
  return String(label || '').trim();
}

function isBlockedStaffLabel(label) {
  const up = normalizeStaffLabel(label).toUpperCase();
  return STAFF_BLOCKLIST_NAMES.has(up);
}

function getStaffNameById(staffId) {
  return STAFF_NAMES[staffId] || 'Tu profesional';
}

async function listStaffResources() {
  try {
    const res = await resourcesBackend.queryResourceCatalog().find();
    const items = res?.items || [];

    const staff = [];
    const allNamed = [];

    for (const it of items) {
      const r = it?.resource || it?.resourceInfo || null;
      if (!r) continue;

      const resourceId = r._id || r.id || null;
      if (!resourceId) continue;

      const label = normalizeStaffLabel(r.name || r.displayName || r.title || '');
      if (label && !isBlockedStaffLabel(label)) {
        allNamed.push({ label, resourceId });
      }

      const tags = Array.isArray(r.tags) ? r.tags : [];
      if (!tags.includes('staff')) continue;
      if (!label || isBlockedStaffLabel(label)) continue;

      staff.push({ label, resourceId });
    }

    staff.sort((a, b) => String(a.label).localeCompare(String(b.label)));

    if (!staff.length && allNamed.length) {
      allNamed.sort((a, b) => String(a.label).localeCompare(String(b.label)));
      return allNamed;
    }

    return staff;
  } catch (e) {
    console.error(`${TAG} ERROR listStaffResources:`, safeErr(e));
    return [];
  }
}

// =====================================================
// LOCATION + SCHEDULE
// =====================================================

function normalizeLocationType(raw) {
  const s = String(raw || '').toUpperCase().trim();
  if (!s || s === 'UNDEFINED' || s === '0') return 'UNDEFINED';
  if (s === 'OWNER_BUSINESS' || s === '1') return 'OWNER_BUSINESS';
  if (s === 'OWNER_CUSTOM' || s === '2') return 'OWNER_CUSTOM';
  if (s === 'CUSTOM' || s === '3') return 'CUSTOM';
  if (s === 'BUSINESS' || s === 'OWNER' || s === 'BUSINESS_LOCATION') return 'OWNER_BUSINESS';
  return 'OWNER_BUSINESS';
}

function extractLocationForBooking(serviceV2) {
  const loc0 = Array.isArray(serviceV2?.locations) ? serviceV2.locations[0] : null;
  const locA = loc0?.location || loc0?.businessLocation || loc0 || serviceV2?.location || serviceV2?.defaultLocation || null;

  const rawType = locA?.locationType || locA?.type || locA?.businessLocation?.locationType || loc0?.locationType || null;
  const locationType = normalizeLocationType(rawType);
  const locationId = locA?.id || locA?._id || locA?.businessLocation?.id || null;

  return locationId ? { locationType, id: locationId } : { locationType };
}

function extractScheduleIdFromService(serviceV2) {
  const candidates = [
    serviceV2?.scheduleId,
    serviceV2?.schedule?.id,
    serviceV2?.schedule?._id,
    serviceV2?.scheduling?.scheduleId,
    serviceV2?.availability?.scheduleId,
    serviceV2?.bookingPolicy?.scheduleId,
    serviceV2?.details?.scheduleId,
  ].filter(v => typeof v === 'string' && v);
  return candidates[0] || null;
}

// =====================================================
// MAPEO CMS
// =====================================================

async function getMapeoByPublicServiceId(publicServiceId) {
  const r = await wixData.query(COLLECTION_MAPEO)
    .eq('idServicioPublico', publicServiceId)
    .limit(1)
    .find({ suppressAuth: true });
  return (r?.items || [])[0] || null;
}

async function getStaffMemberIdsFromService(serviceId) {
  if (!serviceId || !isGuid(serviceId)) return [];
  try {
    const elevatedGetService = elevate(services.getService);
    const svc = await elevatedGetService(serviceId);
    const staffIds = svc?.staffMemberIds || [];
    console.log(`${TAG} Staff asignados a ${serviceId}: ${staffIds.length} \u2192 ${staffIds.join(', ')}`);
    return staffIds;
  } catch (e) {
    console.warn(`${TAG} No pude obtener staffMemberIds de ${serviceId}:`, e.message);
    return [];
  }
}

function parseOrdenFases(ordenFasesStr) {
  if (!ordenFasesStr || typeof ordenFasesStr !== 'string') return [];
  return ordenFasesStr
    .split(',')
    .map(f => f.trim().toUpperCase())
    .filter(f => f.length > 0);
}

function buildMapeoResponse(item) {
  if (!item) return null;
  const mins = {
    aplicacion: toNum(item.minAplicacion),
    proceso: toNum(item.minProceso),
    final: toNum(item.minFinal),
    lavado: toNum(item.minLavado) || toNum(item.minFinal),
    secado: toNum(item.minSecado) || 15,
    peinadoS: toNum(item.minPeinadoS),
    peinadoM: toNum(item.minPeinadoM),
    peinadoL: toNum(item.minPeinadoL),
    peinadoXl: toNum(item.minPeinadoXl),
    corte: toNum(item.minCorte),
    tratKerastase: toNum(item.minTratKerastase),
    tratHairtimes: toNum(item.minTratHairtimes),
    matiz: toNum(item.minMatiz),
    gridVisualizacion: toNum(item.gridVisualizacion) || 15,
    total: toNum(item.minTotal),
  };
  const ids = {
    aplicacion: item.idAplicacion || '',
    proceso: item.idProceso || '',
    final: item.idFinal || '',
    lavado: item.idLavado || item.idFinal || '',
    secado: item.idSecado || '',
    peinadoS: item.idPeinadoS || '',
    peinadoM: item.idPeinadoM || '',
    peinadoL: item.idPeinadoL || '',
    peinadoXl: item.idPeinadoXl || '',
    corte: item.idCorte || '',
    tratKerastase: item.idTratKerastase || '',
    tratHairtimes: item.idTratHairtimes || '',
    matiz: item.idMatiz || '',
    total: item.idTecnicoAplicacionTotal || '',
  };
  
  const ordenFases = parseOrdenFases(item.ordenFases);
  
  return { mins, ids, ordenFases };
}

function normalizePeinadoValue(v) {
  const s = String(v || '').trim().toUpperCase();
  if (!s) return '';
  if (s === 'SIN PEINADO') return 'SIN PEINADO';
  if (s === 'SECADO') return 'SECADO';
  if (['S', 'M', 'L', 'XL'].includes(s)) return s;
  return s;
}

function normalizeTratValue(v) {
  const raw = String(v || '').trim().toUpperCase();
  if (!raw) return '';
  if (raw.includes('SIN')) return 'SIN TRATAMIENTO';
  if (raw.includes('KERASTASE')) return 'KERASTASE';
  if (raw.includes('HAIRTIMES')) return 'HAIRTIMES';
  if (raw.includes('MATIZ')) return 'MATIZ';
  return raw;
}

function pickPeinado(mapeo, peinadoValue) {
  const v = normalizePeinadoValue(peinadoValue);
  if (!v || v === 'SIN PEINADO') return { selected: false, id: null, min: 0, key: 'NONE' };
  if (v === 'SECADO') return { selected: true, id: mapeo.ids.secado || mapeo.ids.final, min: mapeo.mins.secado || 15, key: 'SECADO' };
  if (v === 'S') return { selected: true, id: mapeo.ids.peinadoS, min: mapeo.mins.peinadoS, key: 'S' };
  if (v === 'M') return { selected: true, id: mapeo.ids.peinadoM, min: mapeo.mins.peinadoM, key: 'M' };
  if (v === 'L') return { selected: true, id: mapeo.ids.peinadoL, min: mapeo.mins.peinadoL, key: 'L' };
  if (v === 'XL') return { selected: true, id: mapeo.ids.peinadoXl, min: mapeo.mins.peinadoXl, key: 'XL' };
  return { selected: false, id: null, min: 0, key: 'NONE' };
}

function pickTratamiento(mapeo, tratamientoValue) {
  const v = normalizeTratValue(tratamientoValue);
  if (!v || v === 'SIN TRATAMIENTO') return { selected: false, id: null, min: 0, key: 'NONE' };
  if (v === 'KERASTASE') return { selected: true, id: mapeo.ids.tratKerastase, min: mapeo.mins.tratKerastase, key: 'KERASTASE' };
  if (v === 'HAIRTIMES') return { selected: true, id: mapeo.ids.tratHairtimes, min: mapeo.mins.tratHairtimes, key: 'HAIRTIMES' };
  if (v === 'MATIZ') return { selected: true, id: mapeo.ids.matiz, min: mapeo.mins.matiz, key: 'MATIZ' };
  return { selected: false, id: null, min: 0, key: 'NONE' };
}

// =====================================================
// ORDEN DE FASES DIN\u00c1MICO (v3.2.0)
// =====================================================

function buildFasesOrdenadas({ ordenFases, peinado, trat, corte, mapeo }) {
  const fases = [];
  
  const ordenEfectivo = ordenFases && ordenFases.length > 0 
    ? ordenFases 
    : ['LAVADO', 'TRATAMIENTO', 'CORTE', 'SECADO', 'PEINADO'];
  
  console.log(`${TAG} \ud83d\udccb Orden de fases: ${ordenEfectivo.join(' \u2192 ')}`);
  
  for (const fase of ordenEfectivo) {
    if (fase === 'APLICACION' || fase === 'PROCESO') continue;
    
    switch (fase) {
      case 'LAVADO':
        if (mapeo.ids.lavado || mapeo.ids.final) {
          fases.push({
            fase: 'LAVADO',
            serviceId: mapeo.ids.lavado || mapeo.ids.final,
            min: mapeo.mins.lavado || mapeo.mins.final,
            label: 'Lavado'
          });
        }
        break;
        
      case 'TRATAMIENTO':
        if (trat.selected && trat.id) {
          fases.push({
            fase: 'TRATAMIENTO',
            serviceId: trat.id,
            min: trat.min,
            label: trat.key
          });
        }
        break;
        
      case 'CORTE':
        if (corte && mapeo.ids.corte) {
          fases.push({
            fase: 'CORTE',
            serviceId: mapeo.ids.corte,
            min: mapeo.mins.corte,
            label: 'Corte'
          });
        }
        break;
        
      case 'SECADO':
        if (peinado.selected && peinado.key === 'SECADO') {
          fases.push({
            fase: 'SECADO',
            serviceId: peinado.id,
            min: peinado.min,
            label: 'Secado'
          });
        }
        break;
        
      case 'PEINADO':
        if (peinado.selected && ['S', 'M', 'L', 'XL'].includes(peinado.key)) {
          fases.push({
            fase: 'PEINADO',
            serviceId: peinado.id,
            min: peinado.min,
            label: `Peinado ${peinado.key}`
          });
        }
        break;
        
      default:
        console.warn(`${TAG} \u26a0\ufe0f Fase desconocida en ordenFases: ${fase}`);
    }
  }
  
  console.log(`${TAG} \u2705 Fases a crear: ${fases.map(f => f.fase).join(' \u2192 ')}`);
  
  return fases;
}

// =====================================================
// MOTOR DE DISPONIBILIDAD v3.1
// =====================================================

async function _consultarStaffEspecifico(payload) {
  const { serviceId, duracionMinutos, staffId, selectedDate } = payload;
  
  const fromLocalDate = `${selectedDate}T00:00:00`;
  const toLocalDate = `${selectedDate}T23:59:59`;
  
  const query = {
    filter: {
      serviceId: [serviceId],
      startDate: fromLocalDate,
      endDate: toLocalDate
    },
    timezone: BUSINESS_TIMEZONE
  };
  
  if (staffId && isGuid(staffId) && staffId !== STAFF_IDS.CUALQUIERA) {
    query.filter.resourceId = [staffId];
  }
  
  try {
    const elevatedQueryAvailability = elevate(availabilityCalendar.queryAvailability);
    const response = await elevatedQueryAvailability(query);
    
    const rawSlots = response?.availabilityEntries || [];
    
    const slots = [];
    for (const entry of rawSlots) {
      const slot = entry?.slot;
      if (!slot?.startDate) continue;
      
      const startDate = new Date(slot.startDate);
      const startTime = formatLocalTime(startDate);
      const endTimeCalculated = calcularEndTimeCorrect(startTime, duracionMinutos);
      
      const slotStaffId = slot?.resource?.id || staffId;
      
      slots.push({
        startTime,
        endTime: endTimeCalculated,
        date: selectedDate,
        staffId: slotStaffId,
        bookable: entry?.bookable !== false
      });
    }
    
    return slots;
    
  } catch (e) {
    console.error(`${TAG} \u274c Error en _consultarStaffEspecifico:`, e.message);
    return [];
  }
}

async function _consultarDisponibilidadV3(payload) {
  const { serviceId, duracionMinutos, serviceName, staffId, selectedDate } = payload;
  
  console.log(`${TAG} \ud83d\udd0d consultarDisponibilidad v3.1`);
  console.log(`${TAG}    Servicio: ${serviceName || serviceId}`);
  console.log(`${TAG}    Duraci\u00f3n: ${duracionMinutos} min`);
  console.log(`${TAG}    Staff: ${staffId}`);
  console.log(`${TAG}    Fecha: ${selectedDate}`);
  
  const esCualquiera = staffId === STAFF_IDS.CUALQUIERA || staffId === 'ANY';
  
  let allSlots = [];
  
  if (esCualquiera) {
    console.log(`${TAG} \ud83d\udd04 Modo CUALQUIERA: consultando Angela, Raquel, Ricardo...`);
    
    const [slotsAngela, slotsRaquel, slotsRicardo] = await Promise.all([
      _consultarStaffEspecifico({ ...payload, staffId: STAFF_IDS.ANGELA }),
      _consultarStaffEspecifico({ ...payload, staffId: STAFF_IDS.RAQUEL }),
      _consultarStaffEspecifico({ ...payload, staffId: STAFF_IDS.RICARDO })
    ]);
    
    console.log(`${TAG}    Angela: ${slotsAngela.length} | Raquel: ${slotsRaquel.length} | Ricardo: ${slotsRicardo.length}`);
    
    allSlots = [...slotsAngela, ...slotsRaquel, ...slotsRicardo];
    
    const slotsByTime = new Map();
    for (const slot of allSlots) {
      if (!slotsByTime.has(slot.startTime)) {
        slotsByTime.set(slot.startTime, slot);
      }
    }
    allSlots = Array.from(slotsByTime.values());
    
  } else {
    allSlots = await _consultarStaffEspecifico(payload);
  }
  
  // v3.2.3: Eliminado filtro hardcodeado HORA_CIERRE_MAX_MIN = 20:15
  // El cierre lo gestiona el filtro din\u00e1mico en consultarDisponibilidadUnificada
  
  allSlots.sort((a, b) => a.startTime.localeCompare(b.startTime));
  
  console.log(`${TAG} \u2705 Slots v\u00e1lidos: ${allSlots.length}`);
  
  return allSlots;
}

// =====================================================
// v3.2.2: RESOLVER CUALQUIERA A HUMANO LIBRE
// =====================================================

async function resolverCualquieraAHumanoLibre(serviceId, fecha, horaHHmm) {
  console.log(`${TAG} \ud83d\udd04 Resolviendo CUALQUIERA \u2192 humano libre a ${horaHHmm}...`);
  
  const checks = await Promise.all(HUMANOS_REALES.map(async (staffId) => {
    const slots = await _consultarStaffEspecifico({
      serviceId,
      duracionMinutos: 15,
      staffId,
      selectedDate: fecha
    });
    const libre = slots.some(s => s.startTime === horaHHmm);
    return { staffId, libre };
  }));
  
  const libres = checks.filter(c => c.libre);
  console.log(`${TAG} \ud83d\udd04 Humanos libres a ${horaHHmm}: ${libres.map(l => STAFF_NAMES[l.staffId] || l.staffId).join(', ') || 'NINGUNO'}`);
  
  if (libres.length === 0) return null;
  
  const idx = Math.floor(Math.random() * libres.length);
  const elegido = libres[idx].staffId;
  console.log(`${TAG} \u2705 CUALQUIERA \u2192 ${STAFF_NAMES[elegido] || elegido}`);
  
  return elegido;
}

// =====================================================
// CONSULTA DISPONIBILIDAD UNIFICADA
// =====================================================

export const consultarDisponibilidadUnificada = webMethod(
  Permissions.Anyone,
  async (payload) => {
    const startTime = Date.now();
    
    try {
      const { publicServiceId, fecha, staffId, staff2Id, complementos } = payload || {};
      
      console.log(`${TAG} \ud83d\ude80 consultarDisponibilidadUnificada`);
      console.log(`${TAG}    Servicio: ${publicServiceId}`);
      console.log(`${TAG}    Fecha: ${fecha}`);
      console.log(`${TAG}    Staff1: ${staffId} | Staff2: ${staff2Id}`);
      
      if (!isGuid(publicServiceId)) throw new Error('publicServiceId requerido');
      if (!fecha) throw new Error('fecha requerida');
      
      const item = await getMapeoByPublicServiceId(publicServiceId);
      if (!item) throw new Error(`No mapeo para ${publicServiceId}`);
      const mapeo = buildMapeoResponse(item);
      
      const { mins, ids } = mapeo;
      
      const nombreServicio = item.servicioPublico || '';
      
      const peinadoKey = complementos?.peinadoKey || 'SECADO';
      const tratamientoKey = complementos?.tratamientoKey || null;
      const corteChecked = complementos?.corte || false;
      const totalChecked = complementos?.total || false;
      
      const idAplicacionReal = totalChecked && ids.total ? ids.total : ids.aplicacion;
      const duracionAplicacion = totalChecked && mins.total > 0 ? mins.total : mins.aplicacion;
      const duracionGap = mins.proceso || 0;
      const duracionFinal = mins.lavado || mins.final || 15;
      
      let duracionTramoB = duracionFinal;
      
      if (peinadoKey && peinadoKey !== 'SECADO') {
        const peinadoMins = peinadoKey === 'S' ? mins.peinadoS :
                           peinadoKey === 'M' ? mins.peinadoM :
                           peinadoKey === 'L' ? mins.peinadoL :
                           peinadoKey === 'XL' ? mins.peinadoXl : 0;
        duracionTramoB += peinadoMins;
      } else {
        duracionTramoB += mins.secado || 0;
      }
      
      if (tratamientoKey) {
        const tratMins = tratamientoKey === 'KERASTASE' ? mins.tratKerastase :
                         tratamientoKey === 'HAIRTIMES' ? mins.tratHairtimes :
                         tratamientoKey === 'MATIZ' ? mins.matiz : 0;
        duracionTramoB += tratMins;
      }
      
      if (corteChecked) {
        duracionTramoB += mins.corte || 0;
      }
      
      console.log(`${TAG}    TRAMO A: ${duracionAplicacion} min | GAP: ${duracionGap} min | TRAMO B: ${duracionTramoB} min`);
      
      const staffPrimary = staffId === 'ANY' ? 'ANY' : staffId;
      const staffSecondary = (!staff2Id || staff2Id === 'ANY') ? staffPrimary : staff2Id;
      
      const esServicioComplejo = duracionGap > 0 && duracionFinal > 0;
      
      let slotsFinales = [];
      
      if (!esServicioComplejo) {
        const result = await _consultarDisponibilidadV3({
          serviceId: idAplicacionReal,
          duracionMinutos: duracionAplicacion + duracionTramoB,
          serviceName: 'Aplicaci\u00f3n + Complementos',
          staffId: staffPrimary,
          selectedDate: fecha
        });
        slotsFinales = result;
        
      } else {
        console.log(`${TAG} \ud83d\udd04 Modo CASCADA`);
        
        const [slotsTramoA, slotsTramoB] = await Promise.all([
          _consultarDisponibilidadV3({
            serviceId: idAplicacionReal,
            duracionMinutos: duracionAplicacion,
            serviceName: 'Aplicaci\u00f3n',
            staffId: staffPrimary,
            selectedDate: fecha
          }),
          _consultarDisponibilidadV3({
            serviceId: ids.lavado || ids.final,
            duracionMinutos: duracionTramoB,
            serviceName: 'Complementos',
            staffId: staffSecondary,
            selectedDate: fecha
          })
        ]);
        
        console.log(`${TAG} \u2705 TRAMO A: ${slotsTramoA.length} slots | TRAMO B: ${slotsTramoB.length} slots`);
        
        const horasTramoB = new Set(slotsTramoB.map(s => s.startTime));
        const esCualquiera = staffPrimary === 'ANY';
        
        if (esCualquiera) {
          const tramoBMap = new Map();
          for (const slotB of slotsTramoB) {
            if (slotB.staffId) tramoBMap.set(`${slotB.staffId}_${slotB.startTime}`, slotB);
          }
          
          for (const slotA of slotsTramoA) {
            if (!slotA.staffId) continue;
            const finTramoA = calcularEndTimeCorrect(slotA.startTime, duracionAplicacion);
            const inicioTramoB = redondearAlGrid(calcularEndTimeCorrect(finTramoA, duracionGap));
            const slotB = tramoBMap.get(`${slotA.staffId}_${inicioTramoB}`);
            if (slotB) {
              slotsFinales.push({
                startTime: slotA.startTime,
                endTime: slotB.endTime || calcularEndTimeCorrect(inicioTramoB, duracionTramoB),
                staffId: slotA.staffId
              });
            }
          }
        } else {
          for (const slotA of slotsTramoA) {
            const finTramoA = calcularEndTimeCorrect(slotA.startTime, duracionAplicacion);
            const inicioTramoB = redondearAlGrid(calcularEndTimeCorrect(finTramoA, duracionGap));
            if (horasTramoB.has(inicioTramoB)) {
              const slotB = slotsTramoB.find(s => s.startTime === inicioTramoB);
              slotsFinales.push({
                startTime: slotA.startTime,
                endTime: slotB ? slotB.endTime : calcularEndTimeCorrect(inicioTramoB, duracionTramoB),
                staffId: slotA.staffId || staffPrimary
              });
            }
          }
        }

        // FIX v3.2.3: Filtrar slots donde TRAMO B completo no cabe antes del cierre
        if (slotsTramoB.length > 0) {
          const ultimoStartTramoB = slotsTramoB[slotsTramoB.length - 1].startTime;
          const cierreMin = hhmmToMinutes(ultimoStartTramoB) + duracionFinal;
          
          const antes = slotsFinales.length;
          slotsFinales = slotsFinales.filter(slot => {
            const inicioTramoBMin = hhmmToMinutes(calcularEndTimeCorrect(slot.startTime, duracionAplicacion + duracionGap));
            const finTramoBMin = inicioTramoBMin + duracionTramoB;
            return finTramoBMin <= cierreMin;
          });
          if (slotsFinales.length < antes) {
            console.log(`${TAG} \ud83d\udd12 Filtro cierre TRAMO B: ${antes} \u2192 ${slotsFinales.length} (cierre deducido: ${minutesToHhmm(cierreMin)})`);
          }
        }
        
        // FIX v3.2.3b: Validaci\u00f3n de rango continuo para TRAMO B
        if (slotsFinales.length > 0 && duracionTramoB > duracionFinal) {
          let slotStep = 5;
          if (slotsTramoB.length >= 2) {
            const first = hhmmToMinutes(slotsTramoB[0].startTime);
            const second = hhmmToMinutes(slotsTramoB[1].startTime);
            const detected = second - first;
            if (detected > 0 && detected <= 15) slotStep = detected;
          }
          
          const tramoBMinutosPorStaff = new Map();
          for (const slotB of slotsTramoB) {
            const sid = slotB.staffId || staffSecondary;
            if (!tramoBMinutosPorStaff.has(sid)) tramoBMinutosPorStaff.set(sid, new Set());
            tramoBMinutosPorStaff.get(sid).add(hhmmToMinutes(slotB.startTime));
          }
          const tramoBMinutosGlobal = new Set(slotsTramoB.map(s => hhmmToMinutes(s.startTime)));
          
          const antesRango = slotsFinales.length;
          slotsFinales = slotsFinales.filter(slot => {
            const inicioTramoBMin = hhmmToMinutes(
              calcularEndTimeCorrect(slot.startTime, duracionAplicacion + duracionGap)
            );
            const finVerificacion = inicioTramoBMin + duracionTramoB - duracionFinal;
            
            const minutosStaff = tramoBMinutosPorStaff.get(slot.staffId) || tramoBMinutosGlobal;
            
            for (let m = inicioTramoBMin; m <= finVerificacion; m += slotStep) {
              if (!minutosStaff.has(m)) return false;
            }
            return true;
          });
          
          if (slotsFinales.length < antesRango) {
            console.log(`${TAG} Filtro rango continuo TRAMO B: ${antesRango} -> ${slotsFinales.length} (step=${slotStep}min, durTB=${duracionTramoB}min)`);
          }
        }
      }
      
      const gridVisualizacion = mins.gridVisualizacion || 15;
      slotsFinales = slotsFinales.filter(slot => {
        const minutos = parseInt(slot.startTime.split(':')[1]);
        return minutos % gridVisualizacion === 0;
      });
      
      const startTimesVistos = new Set();
      slotsFinales = slotsFinales.filter(slot => {
        if (startTimesVistos.has(slot.startTime)) return false;
        startTimesVistos.add(slot.startTime);
        return true;
      });
      
      slotsFinales.sort((a, b) => a.startTime.localeCompare(b.startTime));
      
      console.log(`${TAG} \u2705 Slots finales: ${slotsFinales.length}`);
      
      const serviceIds = [];
      if (totalChecked && ids.total) {
        serviceIds.push(ids.total);
      } else {
        serviceIds.push(ids.aplicacion);
      }
      
      const peinado = pickPeinado(mapeo, peinadoKey);
      const trat = pickTratamiento(mapeo, tratamientoKey);
      
      if (peinado.selected && peinado.id) serviceIds.push(peinado.id);
      if (trat.selected && trat.id) serviceIds.push(trat.id);
      if (corteChecked && ids.corte) serviceIds.push(ids.corte);
      serviceIds.push(ids.final);
      
      const priceInfo = await calculateTotalPrice(serviceIds);
      
      let descuento = 0;
      let promoNombre = null;
      
      const nombreUpper = String(nombreServicio || '').toUpperCase();
      const esTinteSinCompleto = (nombreUpper.includes('TINTE') && !nombreUpper.includes('MECHA')) && !totalChecked;
      if (!esTinteSinCompleto) {
        const promo = await getPromoActiva(nombreServicio);
        if (promo) {
          const precioBase = priceInfo.breakdown[0]?.price || 0;
          descuento = Math.round(precioBase * promo.discountPercent / 100);
          promoNombre = promo.promoNombre;
          console.log(`${TAG} \ud83c\udf81 Promo "${promoNombre}": ${promo.discountPercent}% sobre ${precioBase}\u20ac = -${descuento}\u20ac`);
        }
      }
      
      const tiempoConsulta = ((Date.now() - startTime) / 1000).toFixed(2);
      
      console.log(`${TAG} \ud83d\udcb0 Precio: ${priceInfo.total}\u20ac (descuento: ${descuento}\u20ac)`);
      console.log(`${TAG} \u23f1\ufe0f Tiempo: ${tiempoConsulta}s`);
      
      return {
        ok: true,
        version: VERSION,
        slots: slotsFinales,
        precio: {
          subtotal: priceInfo.total,
          descuento: descuento,
          total: priceInfo.total - descuento,
          currency: priceInfo.currency,
          promoNombre: promoNombre
        },
        mapeo,
        tiempoConsulta
      };
      
    } catch (e) {
      console.error(`${TAG} \u274c consultarDisponibilidadUnificada FAIL:`, e);
      return { ok: false, version: VERSION, error: safeErr(e) };
    }
  }
);

function redondearAlGrid(horaHHMM) {
  const [hours, minutes] = horaHHMM.split(':').map(Number);
  const totalMinutes = hours * 60 + minutes;
  const rounded = Math.ceil(totalMinutes / 15) * 15;
  const newHours = Math.floor(rounded / 60) % 24;
  const newMinutes = rounded % 60;
  return `${String(newHours).padStart(2, '0')}:${String(newMinutes).padStart(2, '0')}`;
}

export const consultarDisponibilidad = webMethod(
  Permissions.Anyone, 
  async (payload) => {
    try {
      const { serviceId, duracionMinutos, serviceName, staffId, selectedDate, specificStartTime } = payload || {};

      console.log(`${TAG} \ud83d\ude80 consultarDisponibilidad`);

      if (!serviceId) throw new Error('serviceId es requerido');
      if (!duracionMinutos || duracionMinutos <= 0) throw new Error('duracionMinutos es requerido y debe ser > 0');
      if (!selectedDate) throw new Error('selectedDate es requerido');

      let slots = await _consultarDisponibilidadV3(payload);

      if (specificStartTime) {
        slots = slots.filter(slot => slot.startTime === specificStartTime);
      }

      console.log(`${TAG} \u2705 ${slots.length} slots`);

      return {
        ok: true,
        version: VERSION,
        slots,
        totalSlots: slots.length,
        serviceInfo: { serviceId, serviceName: serviceName || 'Sin nombre', duration: duracionMinutos },
        queryParams: { staffId: staffId || 'No especificado', date: selectedDate, timezone: BUSINESS_TIMEZONE }
      };

    } catch (e) {
      console.error(`${TAG} \u274c ERROR consultarDisponibilidad:`, e);
      return { ok: false, version: VERSION, error: safeErr(e) };
    }
  }
);

// =====================================================
// CREAR BOOKING
// v3.2.4: A\u00f1adido skipAvailability para solapamiento forzado en recepci\u00f3n
// =====================================================

async function createAndConfirmBookingPhase({ serviceId, resourceId, startISO, endISO, notes, contactDetails, price, memberContactId, serviceInfo, skipAvailability = false }) {
  console.log(`${TAG} \ud83d\udd27 createBooking: ${serviceId.substring(0,8)}...${skipAvailability === true ? ' [SKIP-AVAILABILITY]' : ''}`);

  let location, scheduleId;
  
  if (serviceInfo) {
    location = serviceInfo.location;
    scheduleId = serviceInfo.scheduleId;
  } else {
    const elevatedGetService = elevate(services.getService);
    const svcV2 = await elevatedGetService(serviceId);
    location = extractLocationForBooking(svcV2);
    scheduleId = extractScheduleIdFromService(svcV2);
  }

  if (!isGuid(scheduleId)) {
    throw new Error(`No scheduleId v\u00e1lido para ${serviceId}`);
  }

  const bookingInfo = {
    bookedEntity: {
      slot: {
        serviceId,
        scheduleId,
        startDate: startISO,
        endDate: endISO,
        timezone: 'Europe/Madrid',
        resource: { id: resourceId },
        location
      },
      rate: {
        labeledPriceOptions: {
          general: {
            amount: String(price || 0),
            currency: "EUR",
            downPayAmount: "0"
          }
        }
      }
    },
    numberOfParticipants: 1,
    contactDetails,
    notes,
    selectedPaymentOption: 'OFFLINE'
  };

  if (memberContactId && isGuid(memberContactId)) {
    bookingInfo.contactId = memberContactId;
  }

  const options = { paymentOptions: { wixPayOffline: {} }, suppressAuth: true };

  // v3.2.4: Solapamiento forzado cuando viene de recepci\u00f3n (strict equality)
  if (skipAvailability === true) {
    options.flowControlSettings = { skipAvailabilityValidation: true };
    console.log(`${TAG} \u26a1 flowControlSettings.skipAvailabilityValidation = true`);
  }

  const elevatedCreate = elevate(bookings.createBooking);
  const created = await elevatedCreate(bookingInfo, options);

  const bookingId = created?._id || created?.id || created?.booking?._id;
  const revision = created?.revision || created?.booking?.revision;
  
  if (!bookingId) throw new Error('createBooking no devolvi\u00f3 bookingId');

  try {
    const checkoutOptions = {
      lineItems: [{
        quantity: 1,
        catalogReference: {
          appId: "13d21c63-b5ec-5912-8397-c3a5ddb27a97",
          catalogItemId: bookingId
        }
      }],
      channelType: "WEB"
    };
    const elevatedCheckout = elevate(checkout.createCheckout);
    const checkoutResult = await elevatedCheckout(checkoutOptions);
    if (checkoutResult?._id) {
      const elevatedCreateOrder = elevate(checkout.createOrder);
      await elevatedCreateOrder(checkoutResult._id, { payNow: { option: "FULL_PAYMENT_OFFLINE" } });
    }
  } catch (e) {
    console.warn(`${TAG} \u26a0\ufe0f Order: ${e.message}`);
  }

  try {
    if (revision != null && created?.status !== 'CONFIRMED') {
      const elevatedConfirm = elevate(bookings.confirmBooking);
      await elevatedConfirm(bookingId, revision, { participantNotification: { notifyParticipants: false } });
    }
  } catch (e) {
    console.warn(`${TAG} confirmBooking WARN`, e.message);
  }

  return bookingId;
}

// =====================================================
// ACTUALIZAR CAMPO EXTENDIDO promocin
// =====================================================

async function updateBookingPromocion(bookingId, promoNombre, descuento) {
  try {
    if (!bookingId || !promoNombre || descuento === undefined) return;
    
    const promoCompleta = `${promoNombre}|${descuento}`;
    
    const elevatedUpdate = elevate(bookings.updateExtendedFields);
    await elevatedUpdate(bookingId, '_user_fields', {
      namespaceData: { promocin: promoCompleta }
    });
    
    console.log(`${TAG} \u2705 Campo promocin guardado: ${promoCompleta}`);
  } catch (e) {
    console.warn(`${TAG} \u26a0\ufe0f Error guardando promocin:`, e.message);
  }
}

// =====================================================
// MARCAR ORIGEN RECEPCI\u00d3N (v3.2.1)
// =====================================================

async function marcarOrigenRecepcion(bookingId) {
  try {
    if (!bookingId) return;
    const elevatedUpdate = elevate(bookings.updateExtendedFields);
    await elevatedUpdate(bookingId, '_user_fields', {
      namespaceData: { reservaderecepcion: "RECEPCION" }
    });
    console.log(`${TAG} \u2705 Marcado como RECEPCION: ${bookingId}`);
  } catch (e) {
    console.warn(`${TAG} \u26a0\ufe0f Error marcando origen:`, e.message);
  }
}

function buildContactDetailsFromPayload(payload) {
  const cd = payload?.contactDetails || payload?.customer || null;

  const firstName = String(cd?.firstName || payload?.firstName || payload?.nombre || '').trim();
  const lastName = String(cd?.lastName || payload?.lastName || payload?.apellido || '').trim();
  const email = String(cd?.email || payload?.email || '').trim();
  const phone = String(cd?.phone || payload?.phone || payload?.telefono || '').trim();

  if (!firstName && !lastName && !email && !phone) {
    return { firstName: 'Reserva', lastName: 'HairTimes', email: 'booking@hair-times.com', phone: '' };
  }

  return { firstName: firstName || 'Cliente', lastName: lastName || '', email: email || 'booking@hair-times.com', phone };
}

// =====================================================
// v3.2.6: GARANTIZAR CONTACTO CRM ANTES DE CREAR BOOKING
//
// FIX ANTI-ENVENENAMIENTO: el patrón anterior con allowDuplicates:false
// causaba que muchos clientes acabaran sin contactId resuelto y la
// reserva heredara el contactId del owner del sitio (d23efee3...).
//
// Nuevo flujo:
//   1. Si llega memberContactId válido → devolverlo tal cual.
//   2. Si hay teléfono → buscar en CRM por teléfono. Si existe → devolver su id.
//   3. Si hay nombre+apellido → buscar en CRM por nombre. Si existe → devolver su id.
//   4. Si no existe ningún match → crear con allowDuplicates:TRUE para que
//      siempre se cree un contacto independiente, no se fusione.
//   5. Filtrar emails genéricos del salón (booking@ e info@).
//   6. Extracción robusta del id del resultado.
//
// Devuelve null solo si CRM falla por completo. La función llamadora
// (confirmarEnCalendario) sigue usando "if (id && isGuid(id))" antes
// de asignar a bookingInfo.contactId — la validación dura se evaluará
// en v3.2.7.
// =====================================================

const EMAILS_GENERICOS_SALON = ['booking@hair-times.com', 'info@hair-times.com'];

function esEmailGenericoSalon(email) {
  if (!email) return true;
  return EMAILS_GENERICOS_SALON.includes(String(email).trim().toLowerCase());
}

function normalizarTelefono(tel) {
  return String(tel || '').replace(/\D/g, '').trim();
}

async function buscarContactoPorTelefono(phone) {
  const telNorm = normalizarTelefono(phone);
  if (!telNorm || telNorm.length < 6) return null;
  try {
    const elevatedQuery = elevate(contacts.queryContacts);
    // Wix CRM no permite query directo por phone normalizado; cargamos página
    // y filtramos en memoria. En la práctica son cientos, no miles.
    const result = await elevatedQuery().limit(1000).find();
    const items = result?.items || [];
    for (const c of items) {
      const phones = Array.isArray(c?.info?.phones) ? c.info.phones : [];
      for (const p of phones) {
        const candidato = normalizarTelefono(p?.phone || p);
        if (candidato && candidato === telNorm) {
          return c?._id || c?.id || null;
        }
      }
    }
    return null;
  } catch (e) {
    console.warn(`${TAG} buscarContactoPorTelefono fallo: ${e.message}`);
    return null;
  }
}

async function buscarContactoPorNombre(firstName, lastName) {
  const fn = String(firstName || '').trim();
  const ln = String(lastName || '').trim();
  if (!fn && !ln) return null;
  try {
    const elevatedQuery = elevate(contacts.queryContacts);
    let q = elevatedQuery();
    if (fn) q = q.eq('info.name.first', fn);
    if (ln) q = q.eq('info.name.last', ln);
    const result = await q.limit(10).find();
    const items = result?.items || [];
    if (items.length === 1) {
      return items[0]?._id || items[0]?.id || null;
    }
    if (items.length > 1) {
      // Hay homónimos. No decidimos por la máquina sin teléfono → null.
      console.warn(`${TAG} buscarContactoPorNombre: ${items.length} candidatos para "${fn} ${ln}", no se desempata`);
      return null;
    }
    return null;
  } catch (e) {
    console.warn(`${TAG} buscarContactoPorNombre fallo: ${e.message}`);
    return null;
  }
}

async function ensureContactInCRM(contactDetails, memberContactId) {
  // 1. Si ya viene un contactId válido, devolverlo
  if (memberContactId && isGuid(memberContactId)) return memberContactId;

  const { firstName, lastName, email, phone } = contactDetails || {};
  if (!firstName && !email && !phone) {
    console.warn(`${TAG} ensureContactInCRM: sin datos suficientes`);
    return null;
  }

  console.log(`${TAG} ensureContactInCRM: buscando "${firstName || ''} ${lastName || ''}" | tel=${phone || '-'} | email=${email || '-'}`);

  try {
    // 2. Buscar por teléfono (más fiable)
    if (phone) {
      const idPorTel = await buscarContactoPorTelefono(phone);
      if (idPorTel) {
        console.log(`${TAG} ensureContactInCRM: HIT por teléfono → ${idPorTel}`);
        return idPorTel;
      }
    }

    // 3. Buscar por nombre+apellido
    if (firstName && lastName) {
      const idPorNombre = await buscarContactoPorNombre(firstName, lastName);
      if (idPorNombre) {
        console.log(`${TAG} ensureContactInCRM: HIT por nombre → ${idPorNombre}`);
        return idPorNombre;
      }
    }

    // 4. No existe → crear con allowDuplicates:TRUE
    const emailLimpio = (email && !esEmailGenericoSalon(email)) ? email : '';
    const contactInfo = {
      name: { first: firstName || '', last: lastName || '' },
      emails: emailLimpio ? [{ email: emailLimpio }] : [],
      phones: phone ? [{ phone }] : []
    };

    const elevatedCreate = elevate(contacts.createContact);
    const result = await elevatedCreate(contactInfo, { allowDuplicates: true, suppressAuth: true });

    // Extracción robusta del id (Wix puede devolver distintas estructuras)
    const newId = result?.contact?._id
               || result?._id
               || result?.id
               || result?.contact?.id
               || null;

    if (newId) {
      console.log(`${TAG} ensureContactInCRM: CREADO nuevo contacto → ${newId}`);
    } else {
      console.warn(`${TAG} ensureContactInCRM: createContact no devolvió ID. result=${JSON.stringify(result).substring(0, 200)}`);
    }

    return newId;
  } catch (e) {
    console.error(`${TAG} ensureContactInCRM fallo: ${e.message}`);
    return null;
  }
}

// =====================================================
// ALERTAS Y NOTAS CRM
// =====================================================

async function sendInternalAlert(customerMessage, contactDetails, fechaISO, horaHHmm) {
  try {
    const clienteName = `${contactDetails.firstName} ${contactDetails.lastName}`.trim() || 'Cliente';
    const title = `\u26a0\ufe0f Mensaje cliente \u2014 Reserva`;
    const body = `${horaHHmm} | COLORACI\u00d3N | ${clienteName}: ${customerMessage}`;
    
    const elevatedNotify = elevate(notifications.notify);
    await elevatedNotify(body, ['Dashboard'], {
      title: title,
      actionTitle: 'Ver reserva',
      actionTarget: { url: 'https://www.hair-times.com/dashboard/bookings' }
    });
    
    console.log(`${TAG} \u2705 Alerta interna enviada`);
  } catch (e) {
    console.error(`${TAG} \u274c Error enviando alerta interna:`, e.message);
  }
}

async function saveNotaToCRM(customerMessage, memberContactId) {
  try {
    if (!memberContactId || !isGuid(memberContactId)) return;
    
    const elevatedGet = elevate(contacts.getContact);
    const contact = await elevatedGet(memberContactId);
    
    if (!contact || !contact.revision) return;
    
    const currentFicha = contact?.info?.extendedFields?.['custom.ficha'] || '';
    const timestamp = new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' });
    const newEntry = `[${timestamp}] ${customerMessage}`;
    
    const updatedFicha = currentFicha ? `${currentFicha} | ${newEntry}` : newEntry;
    
    const identifiers = { contactId: memberContactId, revision: contact.revision };
    const contactInfo = { extendedFields: { 'custom.ficha': updatedFicha } };
    
    const elevatedUpdate = elevate(contacts.updateContact);
    await elevatedUpdate(identifiers, contactInfo, { suppressAuth: true });
    
    console.log(`${TAG} \u2705 Nota guardada en CRM`);
  } catch (e) {
    console.error(`${TAG} \u274c Error guardando nota CRM:`, e.message);
  }
}

// =====================================================
// v3.2.7: ENVÍO DE CONFIRMACIÓN VÍA CENTRALITA
//
// La función enviarConfirmacionReserva() de v3.2.6 ha sido eliminada.
// La centralita comunicacionesLogic.web.js gestiona ahora el envío
// por todos los canales activos (email Wix triggered, WhatsApp, etc).
//
// Se invoca directamente desde crearComplementos() abajo.
// =====================================================

// =====================================================
// WEB METHODS P\u00daBLICOS
// =====================================================

export const getConstants = webMethod(Permissions.Anyone, async () => {
  return {
    ok: true,
    version: VERSION,
    staffIds: STAFF_IDS,
    businessTimezone: BUSINESS_TIMEZONE
  };
});

export const getStaffResources = webMethod(Permissions.Anyone, async () => {
  try {
    const staff = await listStaffResources();
    return { ok: true, version: VERSION, staff };
  } catch (e) {
    console.error(`${TAG} getStaffResources FAIL`, e);
    return { ok: false, version: VERSION, error: safeErr(e) };
  }
});

export const getServicioPublicoInfo = webMethod(Permissions.Anyone, async ({ serviceId }) => {
  try {
    if (!isGuid(serviceId)) throw new Error(`serviceId no es GUID`);
    const s = await wixData.get(COLLECTION_PUBLIC_SERVICES, serviceId);
    if (!s) throw new Error(`No encuentro servicio ${serviceId}`);
    return {
      ok: true,
      version: VERSION,
      serviceId,
      name: s.serviceName || s.name || '',
      description: String(s.description || '').trim(),
      imageUrl: pickImageUrl(s),
    };
  } catch (e) {
    console.error(`${TAG} getServicioPublicoInfo FAIL`, e);
    return { ok: false, version: VERSION, error: safeErr(e) };
  }
});

export const getMapeoMechas = webMethod(Permissions.Anyone, async ({ serviceId }) => {
  try {
    if (!isGuid(serviceId)) throw new Error(`serviceId no es GUID`);
    const item = await getMapeoByPublicServiceId(serviceId);
    if (!item) throw new Error(`No mapeo para ${serviceId}`);
    
    const mapeo = buildMapeoResponse(item);
    
    const idAplicacion = item.idAplicacion || mapeo?.ids?.aplicacion;
    let assignedStaffIds = [];
    if (idAplicacion && isGuid(idAplicacion)) {
      const rawStaffIds = await getStaffMemberIdsFromService(idAplicacion);
      assignedStaffIds = rawStaffIds.filter(id => id !== STAFF_IDS.CUALQUIERA);
      console.log(`${TAG} Staff asignados (sin CUALQUIERA): ${assignedStaffIds.length} \u2192 ${assignedStaffIds.join(', ')}`);
    }
    
    return { 
      ok: true, 
      version: VERSION, 
      serviceId, 
      mapeo,
      assignedStaffIds
    };
  } catch (e) {
    console.error(`${TAG} getMapeoMechas FAIL`, e);
    return { ok: false, version: VERSION, error: safeErr(e) };
  }
});

export const calcularPrecioConfiguracion = webMethod(Permissions.Anyone, async (payload) => {
  try {
    const { publicServiceId, peinadoValue, tratamientoValue, corteChecked, totalChecked } = payload || {};

    if (!isGuid(publicServiceId)) throw new Error('publicServiceId requerido');

    const item = await getMapeoByPublicServiceId(publicServiceId);
    if (!item) throw new Error(`No mapeo para ${publicServiceId}`);
    const mapeo = buildMapeoResponse(item);

    const peinado = pickPeinado(mapeo, peinadoValue);
    const trat = pickTratamiento(mapeo, tratamientoValue);
    const corte = Boolean(corteChecked);
    const peloEntero = Boolean(totalChecked);

    const serviceIds = [];
    
    if (peloEntero && mapeo.ids.total) {
      serviceIds.push(mapeo.ids.total);
    } else {
      serviceIds.push(mapeo.ids.aplicacion);
    }
    
    if (peinado.selected) serviceIds.push(peinado.id);
    if (trat.selected) serviceIds.push(trat.id);
    if (corte && mapeo.ids.corte) serviceIds.push(mapeo.ids.corte);
    serviceIds.push(mapeo.ids.final);

    const priceInfo = await calculateTotalPrice(serviceIds);

    return { ok: true, version: VERSION, price: priceInfo.total, currency: priceInfo.currency, breakdown: priceInfo.breakdown };
  } catch (e) {
    console.error(`${TAG} calcularPrecioConfiguracion FAIL`, e);
    return { ok: false, version: VERSION, error: safeErr(e) };
  }
});

export const confirmarEnCalendario = webMethod(Permissions.Anyone, async (payload) => {
  try {
    console.log(`${TAG} \ud83c\udfaf confirmarEnCalendario INICIO`);

    const {
      publicServiceId,
      fechaISO,
      horaHHmm,
      empleadoId,
      empleado2Id,
      peinadoValue,
      tratamientoValue,
      corteChecked,
      totalChecked,
      notes = '',
      guardarNota = false,
      origen = 'Reserva Online',
      modoPago = 'LOCAL',
      origenRecepcion = false
    } = payload || {};

    // v3.2.5: memberContactId como let para poder reasignar tras ensureContactInCRM
    let memberContactId = payload?.memberContactId || null;

    if (!isGuid(publicServiceId)) throw new Error('publicServiceId requerido');
    if (!fechaISO) throw new Error('fechaISO requerido');
    if (!horaHHmm) throw new Error('horaHHmm requerido');
    
    let empleadoIdInput = empleadoId;
    if (empleadoIdInput === 'ANY') {
      empleadoIdInput = STAFF_IDS.CUALQUIERA;
    }
    if (!isGuid(empleadoIdInput)) throw new Error('empleadoId requerido');

console.warn(`${TAG} 📅 Reserva entrante: fecha=${fechaISO} hora=${horaHHmm} servicio=${publicServiceId} peinado=${payload?.peinadoValue||'-'} tratamiento=${payload?.tratamientoValue||'-'} corte=${!!payload?.corteChecked} total=${!!payload?.totalChecked} cliente=${payload?.contactDetails?.firstName||''} ${payload?.contactDetails?.lastName||''} tel=${payload?.contactDetails?.phone||''} origen=${payload?.origen||'?'}`);

    let empleadoIdReal = empleadoIdInput;
    if (empleadoIdInput === STAFF_IDS.CUALQUIERA) {
      const item0 = await getMapeoByPublicServiceId(publicServiceId);
      const mapeo0 = buildMapeoResponse(item0);
      const peloEntero0 = Boolean(totalChecked);
      const idAplic0 = peloEntero0 && mapeo0.ids.total ? mapeo0.ids.total : mapeo0.ids.aplicacion;
      
      const humanoLibre = await resolverCualquieraAHumanoLibre(idAplic0, fechaISO, horaHHmm);
      if (!humanoLibre) {
        throw new Error('No hay profesional disponible a esa hora. Pruebe otro horario.');
      }
      empleadoIdReal = humanoLibre;
    }

    let extrasStaffId = empleadoIdReal;
    
    if (isGuid(empleado2Id) && empleado2Id !== empleadoIdReal) {
      let empleado2IdReal = empleado2Id;
      if (empleado2Id === STAFF_IDS.CUALQUIERA || empleado2Id === 'ANY') {
        empleado2IdReal = empleadoIdReal;
      }
      extrasStaffId = empleado2IdReal;
    }
    
    // v3.2.4: Log si modo recepci\u00f3n activo
    console.log(`${TAG} Staff principal: ${empleadoIdReal} (${STAFF_NAMES[empleadoIdReal] || 'N/A'}) | Staff extras: ${extrasStaffId} (${STAFF_NAMES[extrasStaffId] || 'N/A'})${origenRecepcion === true ? ' | \u26a1 MODO RECEPCI\u00d3N (solapamiento forzado)' : ''}`);

    const item = await getMapeoByPublicServiceId(publicServiceId);
    if (!item) throw new Error(`No mapeo para ${publicServiceId}`);
    const mapeo = buildMapeoResponse(item);

    const minAplic = toNum(mapeo.mins.aplicacion);
    const minGap = toNum(mapeo.mins.proceso);
    const minFinal = toNum(mapeo.mins.final);
    const minTotal = toNum(mapeo.mins.total);
    const peloEntero = Boolean(totalChecked);
    
    const idAplic = mapeo.ids.aplicacion;
    const idFinal = mapeo.ids.final;
    const idTotal = mapeo.ids.total;
    
    const idAplicacionReal = peloEntero && idTotal ? idTotal : idAplic;
    const duracionAplicacionReal = peloEntero && minTotal > 0 ? minTotal : minAplic;
    
    console.log(`${TAG} ${peloEntero ? '\u2705 TINTE COMPLETO' : '\u2139\ufe0f Solo ra\u00edz'}: Servicio=${idAplicacionReal.substring(0,8)} | Duraci\u00f3n=${duracionAplicacionReal} min`);

    if (!isGuid(idAplic) || minAplic <= 0) throw new Error('Mapeo inv\u00e1lido: Aplicaci\u00f3n');
    if (!isGuid(idFinal) || minFinal <= 0) throw new Error('Mapeo inv\u00e1lido: Final');

    const peinado = pickPeinado(mapeo, peinadoValue);
    const trat = pickTratamiento(mapeo, tratamientoValue);
    const corte = Boolean(corteChecked);
    const idCorte = mapeo.ids.corte;
    const minCorte = toNum(mapeo.mins.corte);

    const contactDetails = buildContactDetailsFromPayload(payload);

    // =====================================================
    // v3.2.5: GARANTIZAR CONTACTO CRM — TODOS LOS CANALES
    // =====================================================
    memberContactId = await ensureContactInCRM(contactDetails, memberContactId);

    const cd = payload?.contactDetails || {};
    const customerMessage = String(cd?.mensaje || payload?.mensaje || '').trim();

    const fasesOrdenadas = buildFasesOrdenadas({
      ordenFases: mapeo.ordenFases,
      peinado,
      trat,
      corte,
      mapeo
    });
    
    console.log(`${TAG} \ud83d\udccb Fases ordenadas: ${fasesOrdenadas.map(f => f.fase).join(' \u2192 ')}`);

    console.log(`${TAG} \ud83d\udcca Obteniendo serviceInfo y precios en paralelo...`);
    
    const elevatedGetService = elevate(services.getService);
    
    const serviceIdsUnicos = new Set([idAplicacionReal]);
    for (const fase of fasesOrdenadas) {
      if (fase.serviceId && isGuid(fase.serviceId)) {
        serviceIdsUnicos.add(fase.serviceId);
      }
    }
    
    const serviceInfoPromises = Array.from(serviceIdsUnicos).map(async (svcId) => {
      const svc = await elevatedGetService(svcId);
      return {
        serviceId: svcId,
        location: extractLocationForBooking(svc),
        scheduleId: extractScheduleIdFromService(svc)
      };
    });
    
    const pricePromises = Array.from(serviceIdsUnicos).map(svcId => getServicePrice(svcId));
    
    const [serviceInfoResults, priceResults] = await Promise.all([
      Promise.all(serviceInfoPromises),
      Promise.all(pricePromises)
    ]);
    
    const serviceInfoMap = {};
    serviceInfoResults.forEach(info => { serviceInfoMap[info.serviceId] = info; });
    
    const priceMap = {};
    Array.from(serviceIdsUnicos).forEach((svcId, i) => { priceMap[svcId] = priceResults[i].price; });
    
    console.log(`${TAG} \u2705 Info obtenida para ${serviceIdsUnicos.size} servicios`);

    const startAplic = madridToUTC(fechaISO, horaHHmm);
    const endAplic = addMinutes(startAplic, duracionAplicacionReal);

    const baseNotes = `Publico=${publicServiceId}\nMainStaff=${empleadoIdReal}; ExtraStaff=${extrasStaffId}`;

    console.log(`${TAG} \ud83d\udcc5 Creando booking principal...`);

    // v3.2.4: Pasar skipAvailability cuando viene de recepci\u00f3n
    const bAplic = await createAndConfirmBookingPhase({
      serviceId: idAplicacionReal,
      resourceId: empleadoIdReal,
      startISO: startAplic,
      endISO: endAplic,
      notes: `${baseNotes}\nFASE=APLICACI\u00d3N`,
      contactDetails,
      price: priceMap[idAplicacionReal],
      memberContactId,
      serviceInfo: serviceInfoMap[idAplicacionReal],
      skipAvailability: true
    });

    console.log(`${TAG} \u2705 Aplicaci\u00f3n confirmada con precio`);

    let totalPrecio = priceMap[idAplicacionReal];
    for (const fase of fasesOrdenadas) {
      if (priceMap[fase.serviceId]) {
        totalPrecio += priceMap[fase.serviceId];
      }
    }

    let descuentoConfirm = 0;
    let promoNombreConfirm = null;
    const nombreServicio = item.servicioPublico || '';
    const nombreUpperC = String(nombreServicio).toUpperCase();
    const esTinteSinCompletoC = (nombreUpperC.includes('TINTE') && !nombreUpperC.includes('MECHA')) && !peloEntero;
    if (!esTinteSinCompletoC) {
      const promo = await getPromoActiva(nombreServicio);
      if (promo) {
        const precioBase = priceMap[idAplicacionReal] || 0;
        descuentoConfirm = Math.round(precioBase * promo.discountPercent / 100);
        promoNombreConfirm = promo.promoNombre;
        console.log(`${TAG} \ud83c\udf81 Promo "${promoNombreConfirm}": -${descuentoConfirm}\u20ac`);
      }
    }

    const totalConDescuento = totalPrecio - descuentoConfirm;

    if (promoNombreConfirm && bAplic) {
      updateBookingPromocion(bAplic, promoNombreConfirm, descuentoConfirm).catch(() => {});
    }

    if (origenRecepcion && bAplic) {
      marcarOrigenRecepcion(bAplic).catch(() => {});
    }

    const nombreServicioPublico = item.nombreServicio || 'Coloraci\u00f3n';
    const staffName = getStaffNameById(empleadoIdReal);
    const fechaBonita = formatFechaEmail(fechaISO);
    
    const serviciosEmailArray = [nombreServicioPublico];
    for (const fase of fasesOrdenadas) {
      if (fase.fase !== 'LAVADO') {
        serviciosEmailArray.push(fase.label);
      }
    }
    serviciosEmailArray.push('Lavado');
    const serviciosEmailString = serviciosEmailArray.join(' + ');
    
    // v3.2.4: crearComplementos con skipAvailability + try/catch individual por fase
    // v3.2.7: notificación de confirmación delegada a centralita comunicacionesLogic
    const crearComplementos = async () => {
      try {
        let cursorBg = addMinutes(endAplic, minGap);
        let endFinalBg = cursorBg;

        for (const fase of fasesOrdenadas) {
          const s = cursorBg;
          const e = addMinutes(s, fase.min);
          
          const staffParaFase = fase.fase === 'LAVADO' ? empleadoIdReal : extrasStaffId;
          
          console.log(`${TAG} \ud83d\udcc5 Creando ${fase.fase}: ${fase.serviceId.substring(0,8)}... (${fase.min} min) con ${staffParaFase === empleadoIdReal ? 'staff principal' : 'staff extras'}`);
          
          // v3.2.4: Try/catch individual - una fase que falle NO corta las dem\u00e1s
          try {
            await createAndConfirmBookingPhase({
              serviceId: fase.serviceId,
              resourceId: staffParaFase,
              startISO: s,
              endISO: e,
              notes: `${baseNotes}\nFASE=${fase.fase}`,
              contactDetails,
              price: priceMap[fase.serviceId] || 0,
              memberContactId,
              serviceInfo: serviceInfoMap[fase.serviceId],
              skipAvailability: true
            });
          } catch (faseErr) {
            console.error(`${TAG} \u26a0\ufe0f Error creando fase ${fase.fase} (continuando con siguientes): ${faseErr.message}`);
          }
          
          cursorBg = e;
          endFinalBg = e;
        }

        const horaFinalEmail = formatLocalTime(new Date(endFinalBg));
        const importeTotalStr = descuentoConfirm > 0
          ? `${totalConDescuento}\u20ac (${promoNombreConfirm}: -${descuentoConfirm}\u20ac)`
          : `${totalPrecio}\u20ac`;
        const estadoPagoStr = modoPago === 'ONLINE' ? 'Pagado online \u2714' : 'Pago en sal\u00f3n';

        // v3.2.7: Centralita gestiona email + WhatsApp + futuros canales
        try {
          await notificarConfirmacion({
            contactId:     memberContactId,
            email:         contactDetails.email,
            telefono:      contactDetails.phone,
            nombreCliente: `${contactDetails.firstName} ${contactDetails.lastName}`.trim(),
            fecha:         fechaBonita,
            hora:          horaHHmm,
            servicios:     serviciosEmailString,
            estilista:     staffName,
            // emailVariables: idénticas a las que usaba enviarConfirmacionReserva
            // de v3.2.6, para que el template Wix VA5UQRG reciba los mismos
            // campos que hoy y no haya regresión en el email.
            emailVariables: {
              Fecha:         fechaBonita,
              Nombre:        contactDetails.firstName,
              Apellido:      contactDetails.lastName,
              servicios:     serviciosEmailString,
              profesional:   staffName,
              horaInicio:    horaHHmm,
              horaFinal:     horaFinalEmail,
              importeTotal:  importeTotalStr,
              origen:        origen,
              estadoPago:    estadoPagoStr,
              SITE_URL:      'https://www.hair-times.com'
            }
          });
        } catch (notifErr) {
          // No-blocking: si la centralita falla, la reserva ya está creada.
          console.error(`${TAG} \u26a0\ufe0f Error en notificarConfirmacion (no-blocking): ${notifErr.message}`);
        }

        console.log(`${TAG} \u2705 Complementos + notificaci\u00f3n completados en background`);
      } catch (e) {
        console.error(`${TAG} \u274c Error en complementos:`, e.message);
      }
    };

    crearComplementos();

    if (customerMessage.length > 0) {
      sendInternalAlert(customerMessage, contactDetails, fechaISO, horaHHmm).catch(() => {});
      if (guardarNota && memberContactId && isGuid(memberContactId)) {
        saveNotaToCRM(customerMessage, memberContactId).catch(() => {});
      }
    }

    let checkoutUrl = null;
    
    if (modoPago === 'ONLINE') {
      try {
        console.log(`${TAG} \ud83d\udcb3 Creando checkout para pago online...`);
        
        const servicioInfo = await wixData.get(COLLECTION_PUBLIC_SERVICES, publicServiceId, { suppressAuth: true });
        const nombreServicio = servicioInfo?.serviceName || servicioInfo?.name || 'Servicio de coloraci\u00f3n';
        
        const descripcion = `${nombreServicio} | ${fechaISO} ${horaHHmm} | ${serviciosEmailString}`;
        
        const checkoutOptions = {
          channelType: "WEB",
          customLineItems: [
            {
              quantity: 1,
              productName: {
                original: descripcion,
                translated: descripcion
              },
              price: String(totalConDescuento),
              itemType: {
                preset: "SERVICE"
              }
            }
          ],
          checkoutInfo: {
            buyerInfo: {
              email: contactDetails.email,
              firstName: contactDetails.firstName,
              lastName: contactDetails.lastName,
              phone: contactDetails.phone
            }
          }
        };
        
        const elevatedCreateCheckout = elevate(checkout.createCheckout);
        const checkoutResult = await elevatedCreateCheckout(checkoutOptions);
        
        const checkoutId = checkoutResult?._id;
        
        if (checkoutId) {
          const elevatedGetCheckoutUrl = elevate(checkout.getCheckoutUrl);
          const urlResult = await elevatedGetCheckoutUrl(checkoutId);
          checkoutUrl = urlResult?.checkoutUrl;
          
          console.log(`${TAG} \u2705 Checkout URL obtenida: ${checkoutUrl}`);
        }
        
      } catch (checkoutError) {
        console.error(`${TAG} \u26a0\ufe0f Error creando checkout:`, checkoutError.message);
      }
    }

    console.log(`${TAG} \ud83c\udf89 COMPLETADO - Total: ${totalConDescuento}\u20ac`);

    return {
      ok: true,
      version: VERSION,
      bookingIds: { aplicacion: bAplic },
      price: totalConDescuento,
      currency: 'EUR',
      modoPago,
      checkoutUrl
    };
  } catch (e) {
    console.error(`${TAG} \u274c confirmarEnCalendario FAIL`, e);
    return { ok: false, version: VERSION, error: safeErr(e) };
  }
});
