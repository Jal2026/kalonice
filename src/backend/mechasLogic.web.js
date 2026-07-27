// backend/mechasLogic.web.js
// =====================================================
// MechasLogic v7.0.2-MEMBER-INTEGRATION
// Integración completa con Wix Members
// - Usa memberContactId cuando está disponible
// - Asocia bookings al contacto del member
// - Guarda notas en el contacto correcto
// =====================================================

import wixData from 'wix-data';
import { webMethod, Permissions } from 'wix-web-module';
import { elevate } from 'wix-auth';
import { bookings, services } from 'wix-bookings.v2';
import { resources as resourcesBackend } from 'wix-bookings-backend';
import { checkout } from 'wix-ecom-backend';
import { contacts } from 'wix-crm-backend';
import { notifications } from 'wix-crm-backend';

const VERSION = '7.0.2-MEMBER-INTEGRATION';
const TAG = `[Mechas][${VERSION}]`;

const COLLECTION_PUBLIC_SERVICES = 'Bookings/Services';
const COLLECTION_MAPEO = 'SvMapeoServicios';

const BUSINESS_TIMEZONE = 'Europe/Madrid';

const OPEN_HHMM = '10:00';
const CLOSE_HHMM = '20:00';
const STEP_MIN = 15;
const MAX_SLOTS = 12;

const STAFF_BLOCKLIST_NAMES = new Set(['PROCESO']);

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
  const v =
    serviceItem?.imageURL ||
    serviceItem?.image ||
    serviceItem?.mainImage ||
    serviceItem?.media;
  if (!v) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'object') return v.src || v.url || v.imageUrl || v.fileUrl || '';
  return '';
}

function normalizeDateISO(v) {
  const s = String(v || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
}

function normalizeHHmm(v) {
  const s = String(v || '').trim();
  return /^\d{2}:\d{2}$/.test(s) ? s : '';
}

function pad2(n) { return String(n).padStart(2, '0'); }

function buildSlotsHHmm(openHHmm, closeHHmm, stepMin) {
  const [oh, om] = openHHmm.split(':').map(Number);
  const [ch, cm] = closeHHmm.split(':').map(Number);
  const open = oh * 60 + om;
  const close = ch * 60 + cm;
  const out = [];
  for (let t = open; t <= close - stepMin; t += stepMin) {
    out.push(`${pad2(Math.floor(t / 60))}:${pad2(t % 60)}`);
  }
  return out;
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  const as = new Date(aStart).getTime();
  const ae = new Date(aEnd).getTime();
  const bs = new Date(bStart).getTime();
  const be = new Date(bEnd).getTime();
  return as < be && bs < ae;
}

// =====================================================
// TIMEZONE
// =====================================================

function madridLocalToISO(fechaISO, horaHHmm) {
  const [year, month, day] = String(fechaISO).split('-').map(Number);
  const [hour, minute] = String(horaHHmm).split(':').map(Number);
  
  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
  
  console.log(`${TAG} 🟢 Madrid local ISO: ${fechaISO} ${horaHHmm} → ${iso}`);
  
  return iso;
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
  if (!match) {
    console.error(`${TAG} Error parseando: ${madridStr}`);
    return d.toISOString();
  }
  
  const madridHour = parseInt(match[4]);
  const madridMin = parseInt(match[5]);
  
  const targetMin = hour * 60 + minute;
  const madridMin2 = madridHour * 60 + madridMin;
  const diffMin = targetMin - madridMin2;
  
  const utc = new Date(d.getTime() + (diffMin * 60000));
  
  console.log(`${TAG} 🔵 Para comparación: ${fechaISO} ${horaHHmm} Madrid → ${utc.toISOString()} UTC`);
  
  return utc.toISOString();
}

function addMinutes(iso, mins) {
  const ms = new Date(iso).getTime();
  return new Date(ms + mins * 60000).toISOString();
}

function utcISOToMadridDate(isoString) {
  try {
    const date = new Date(isoString);
    const fechaLimpia = date.toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });
    
    console.log(`[FECHA] Detectada reserva el día: ${fechaLimpia}`);
    
    return fechaLimpia;
  } catch (e) {
    return '????-??-??';
  }
}

// =====================================================
// PRECIOS
// =====================================================

async function getServicePrice(serviceId) {
  try {
    console.log(`${TAG} 💰 Leyendo precio (Híbrido V2+Legacy): ${serviceId}`);
    
    try {
      const elevatedGetService = elevate(services.getService);
      const svc = await elevatedGetService(serviceId);
      
      let price = 0;
      let currency = 'EUR';
      
      if (svc?.price?.amount) {
        price = toNum(svc.price.amount);
        if (price > 0) {
          currency = svc.price.currency || 'EUR';
          console.log(`${TAG} 💰 ✅ V2 API - Precio en svc.price.amount: ${price} ${currency}`);
          return { price, currency };
        }
      }
      
      if (svc?.paymentOptions?.wixPayOnline?.price) {
        price = toNum(svc.paymentOptions.wixPayOnline.price);
        if (price > 0) {
          currency = svc.paymentOptions.wixPayOnline.currency || 'EUR';
          console.log(`${TAG} 💰 ✅ V2 API - Precio en paymentOptions.wixPayOnline: ${price} ${currency}`);
          return { price, currency };
        }
      }
      
      if (svc?.paymentOptions?.wixPayOffline?.price) {
        price = toNum(svc.paymentOptions.wixPayOffline.price);
        if (price > 0) {
          currency = svc.paymentOptions.wixPayOffline.currency || 'EUR';
          console.log(`${TAG} 💰 ✅ V2 API - Precio en paymentOptions.wixPayOffline: ${price} ${currency}`);
          return { price, currency };
        }
      }
      
      console.log(`${TAG} ⚠️ V2 API devolvió precio = 0, pasando a fallback...`);
      
    } catch (e) {
      console.warn(`${TAG} ⚠️ V2 API falló, pasando a fallback:`, e.message);
    }
    
    console.log(`${TAG} 💰 Usando fallback wixData.get()...`);
    
    const svcLegacy = await wixData.get(COLLECTION_PUBLIC_SERVICES, serviceId, { suppressAuth: true });
    
    const price = toNum(svcLegacy?.priceAmount) || 0;
    const currency = svcLegacy?.currency || 'EUR';
    
    console.log(`${TAG} 💰 ✅ LEGACY - Precio en priceAmount: ${price} ${currency}`);
    
    return { price, currency };
    
  } catch (e) {
    console.error(`${TAG} ❌ Error crítico leyendo precio de ${serviceId}:`, e);
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
    
    breakdown.push({
      serviceId,
      price,
      currency
    });
  }
  
  console.log(`${TAG} 💰 TOTAL CALCULADO: ${total} ${currency}`);
  console.log(`${TAG} 💰 Desglose:`, breakdown);
  
  return {
    total,
    currency,
    breakdown
  };
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

      if (!label) continue;
      if (isBlockedStaffLabel(label)) continue;

      staff.push({ label, resourceId });
    }

    staff.sort((a, b) => String(a.label).localeCompare(String(b.label)));

    if (!staff.length && allNamed.length) {
      allNamed.sort((a, b) => String(a.label).localeCompare(String(b.label)));
      console.warn(`${TAG} WARN: no tags 'staff'. Devuelvo fallback allNamed=${allNamed.length}`);
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
  const locA =
    loc0?.location ||
    loc0?.businessLocation ||
    loc0 ||
    serviceV2?.location ||
    serviceV2?.defaultLocation ||
    null;

  const rawType =
    locA?.locationType ||
    locA?.type ||
    locA?.businessLocation?.locationType ||
    loc0?.locationType ||
    null;

  const locationType = normalizeLocationType(rawType);

  const locationId =
    locA?.id ||
    locA?._id ||
    locA?.businessLocation?.id ||
    null;

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
// MAPEO
// =====================================================

async function getMapeoByPublicServiceId(publicServiceId) {
  const r = await wixData.query(COLLECTION_MAPEO)
    .eq('idServicioPublico', publicServiceId)
    .limit(1)
    .find({ suppressAuth: true });
  return (r?.items || [])[0] || null;
}

function buildMapeoResponse(item) {
  if (!item) return null;
  const mins = {
    aplicacion: toNum(item.minAplicacion),
    proceso: toNum(item.minProceso),
    final: toNum(item.minFinal),
    peinadoS: toNum(item.minPeinadoS),
    peinadoM: toNum(item.minPeinadoM),
    peinadoL: toNum(item.minPeinadoL),
    peinadoXl: toNum(item.minPeinadoXl),
    corte: toNum(item.minCorte),
    tratKerastase: toNum(item.minTratKerastase),
    tratHairtimes: toNum(item.minTratHairtimes),
    matiz: toNum(item.minMatiz),
  };
  const ids = {
    aplicacion: item.idAplicacion || '',
    proceso: item.idProceso || '',
    final: item.idFinal || '',
    peinadoS: item.idPeinadoS || '',
    peinadoM: item.idPeinadoM || '',
    peinadoL: item.idPeinadoL || '',
    peinadoXl: item.idPeinadoXl || '',
    corte: item.idCorte || '',
    tratKerastase: item.idTratKerastase || '',
    tratHairtimes: item.idTratHairtimes || '',
    matiz: item.idMatiz || '',
  };
  return { mins, ids };
}

function normalizePeinadoValue(v) {
  const s = String(v || '').trim().toUpperCase();
  if (!s) return '';
  if (s === 'SIN PEINADO') return 'SIN PEINADO';
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
  if (v === 'S') return { selected: true, id: mapeo.ids.peinadoS, min: mapeo.mins.peinadoS, key: 'S' };
  if (v === 'M') return { selected: true, id: mapeo.ids.peinadoM, min: mapeo.mins.peinadoM, key: 'M' };
  if (v === 'L') return { selected: true, id: mapeo.ids.peinadoL, min: mapeo.mins.peinadoL, key: 'L' };
  if (v === 'XL') return { selected: true, id: mapeo.ids.peinadoXl, min: mapeo.mins.peinadoXl, key: 'XL' };
  throw new Error(`Peinado inválido: ${v}`);
}

function pickTratamiento(mapeo, tratamientoValue) {
  const v = normalizeTratValue(tratamientoValue);
  if (!v || v === 'SIN TRATAMIENTO') return { selected: false, id: null, min: 0, key: 'NONE' };
  if (v === 'KERASTASE') return { selected: true, id: mapeo.ids.tratKerastase, min: mapeo.mins.tratKerastase, key: 'KERASTASE' };
  if (v === 'HAIRTIMES') return { selected: true, id: mapeo.ids.tratHairtimes, min: mapeo.mins.tratHairtimes, key: 'HAIRTIMES' };
  if (v === 'MATIZ') return { selected: true, id: mapeo.ids.matiz, min: mapeo.mins.matiz, key: 'MATIZ' };
  throw new Error(`Tratamiento inválido: ${v}`);
}

// =====================================================
// BOOKINGS - DISPONIBILIDAD
// =====================================================

const fetchRawBookings = async () => {
  const options = {
    start: new Date('2024-01-01').toISOString(),
    end: new Date('2030-01-01').toISOString(),
    limit: 1000,
    includeAllSources: true,
    includeManual: true,
    includeExternal: true,
    suppressAuth: true
  };

  try {
    const result = await bookings.query(options);
    return result;
  } catch (e) {
    console.error(`${TAG} ❌ ERROR fetchRawBookings:`, e.message);
    return { bookings: [] };
  }
};

const elevatedFetch = elevate(fetchRawBookings);

async function getAllBookingsRaw() {
  try {
    const result = await elevatedFetch();
    const items = result?.bookings || result?.items || [];
    console.log(`${TAG} 📊 getAllBookingsRaw devolvió ${items.length} bookings totales`);
    return items;
  } catch (e) {
    console.error(`${TAG} ❌ ERROR getAllBookingsRaw:`, safeErr(e));
    return [];
  }
}

function filterBookingsByDateAndResource(items, targetDateISO, resourceId = null) {
  const filtered = [];
  let debugCount = 0;

  for (const item of items) {
    const slot = item?.bookedEntity?.slot || item?.slot || {};
    const startDate = slot?.startDate || item?.startDate || null;
    if (!startDate) continue;

    const bookingDate = utcISOToMadridDate(startDate);
    
    if (bookingDate === targetDateISO && debugCount < 5) {
      const resource = slot?.resource || item?.resource || {};
      const itemResourceId = resource?.id || resource?._id || slot?.resourceId || item?.resourceId || null;
      console.log(`${TAG} 🔎 Booking en ${targetDateISO}: startDate=${startDate}, resourceId=${itemResourceId}, target=${resourceId}, match=${itemResourceId === resourceId}`);
      debugCount++;
    }
    
    if (bookingDate !== targetDateISO) continue;

    const resource = slot?.resource || item?.resource || {};
    const itemResourceId = resource?.id || resource?._id || slot?.resourceId || item?.resourceId || null;

    if (resourceId && itemResourceId !== resourceId) continue;

    const endDate = slot?.endDate || item?.endDate || null;

    filtered.push({
      bookingId: item?._id || item?.id,
      status: item?.status || 'UNKNOWN',
      start: new Date(startDate).toISOString(),
      end: new Date(endDate).toISOString(),
      resourceId: itemResourceId
    });
  }

  return filtered;
}

// =====================================================
// 🆕 CREAR RESERVA CON MEMBER CONTACTID
// =====================================================

async function createAndConfirmBookingPhase({ serviceId, resourceId, startISO, endISO, notes, contactDetails, price, memberContactId }) {
  console.log(`${TAG} 🔧 createAndConfirmBookingPhase INICIO`);
  console.log(`${TAG}   serviceId: ${serviceId}`);
  console.log(`${TAG}   price: ${price}`);
  console.log(`${TAG}   memberContactId: ${memberContactId || 'NO'}`);

  const elevatedGetService = elevate(services.getService);
  const svcV2 = await elevatedGetService(serviceId);

  const location = extractLocationForBooking(svcV2);
  const scheduleId = extractScheduleIdFromService(svcV2);

  if (!isGuid(scheduleId)) {
    throw new Error(`No pude resolver scheduleId válido desde el servicio técnico ${serviceId}`);
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

  // 🆕 SI HAY MEMBER CONTACTID, AÑADIRLO AL BOOKING
  if (memberContactId && isGuid(memberContactId)) {
    bookingInfo.contactId = memberContactId;
    console.log(`${TAG} ✅ Asociando booking a member contactId: ${memberContactId}`);
  }

  const options = {
    paymentOptions: {
      wixPayOffline: {}
    },
    suppressAuth: true
  };

  console.log(`${TAG} 📋 Creando booking con paymentOptions.wixPayOffline...`);

  const elevatedCreate = elevate(bookings.createBooking);
  const created = await elevatedCreate(bookingInfo, options);

  console.log(`${TAG} ✅ Booking creado - Status: ${created?.status}`);

  const bookingId = created?._id || created?.id || created?.booking?._id;
  const revision = created?.revision || created?.booking?.revision;
  
  if (!bookingId) {
    throw new Error('createBooking no devolvió bookingId');
  }

  try {
    console.log(`${TAG} 💳 Creando Order con checkout...`);
    
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
    
    console.log(`${TAG} ✅ Checkout creado: ${checkoutResult?._id}`);
    
    const elevatedCreateOrder = elevate(checkout.createOrder);
    const orderResult = await elevatedCreateOrder(checkoutResult._id, {
      payNow: {
        option: "FULL_PAYMENT_OFFLINE"
      }
    });
    
    console.log(`${TAG} ✅ Order creado: ${orderResult?.order?._id || orderResult?._id}`);
    
  } catch (e) {
    console.error(`${TAG} ❌ Error creando Order:`, e.message);
  }

  try {
    if (revision != null && created?.status !== 'CONFIRMED') {
      console.log(`${TAG} 🔄 Confirmando booking...`);
      const elevatedConfirm = elevate(bookings.confirmBooking);
      await elevatedConfirm(bookingId, revision, { 
        participantNotification: { notifyParticipants: false } 
      });
      console.log(`${TAG} ✅ Booking confirmado`);
    }
  } catch (e) {
    console.warn(`${TAG} confirmBooking WARN`, e.message);
  }

  console.log(`${TAG} ✅ createAndConfirmBookingPhase COMPLETADO`);
  
  return bookingId;
}

function buildContactDetailsFromPayload(payload) {
  const cd = payload?.contactDetails || payload?.customer || null;

  const firstName = String(cd?.firstName || payload?.firstName || payload?.nombre || '').trim();
  const lastName = String(cd?.lastName || payload?.lastName || payload?.apellido || '').trim();
  const email = String(cd?.email || payload?.email || '').trim();
  const phone = String(cd?.phone || payload?.phone || payload?.telefono || '').trim();

  if (!firstName && !lastName && !email && !phone) {
    return {
      firstName: 'Reserva',
      lastName: 'HairTimes',
      email: 'booking@hair-times.com',
      phone: ''
    };
  }

  return {
    firstName: firstName || 'Cliente',
    lastName: lastName || '',
    email: email || 'booking@hair-times.com',
    phone
  };
}

// =====================================================
// A) ALERTA INTERNA A RECEPCIÓN
// =====================================================

async function sendInternalAlert(customerMessage, contactDetails, fechaISO, horaHHmm) {
  try {
    console.log(`${TAG} 🔔 Enviando alerta interna a recepción...`);
    
    const clienteName = `${contactDetails.firstName} ${contactDetails.lastName}`.trim() || 'Cliente';
    
    const title = `⚠️ Mensaje cliente — Reserva`;
    const body = `${horaHHmm} | MECHAS | ${clienteName}: ${customerMessage}`;
    
    console.log(`${TAG} 🔔 Título: ${title}`);
    console.log(`${TAG} 🔔 Cuerpo: ${body}`);
    
    const elevatedNotify = elevate(notifications.notify);
    
    await elevatedNotify(
      body,
      ['Dashboard'],
      {
        title: title,
        actionTitle: 'Ver reserva',
        actionTarget: { url: 'https://www.hair-times.com/dashboard/bookings' }
      }
    );
    
    console.log(`${TAG} ✅ Alerta interna enviada correctamente`);
    
  } catch (e) {
    console.error(`${TAG} ❌ Error enviando alerta interna:`, e.message);
  }
}

// =====================================================
// 🆕 B) GUARDAR NOTA EN CRM - CON MEMBER CONTACTID
// =====================================================

async function saveNotaToCRM(customerMessage, memberContactId) {
  try {
    console.log(`${TAG} ════════════════════════════════════════════════════════`);
    console.log(`${TAG} 📝 saveNotaToCRM INICIO`);
    
    console.log(`${TAG} 📋 PARÁMETROS RECIBIDOS:`);
    console.log(`${TAG}    customerMessage: "${customerMessage}"`);
    console.log(`${TAG}    memberContactId: "${memberContactId}"`);
    
    if (!memberContactId || !isGuid(memberContactId)) {
      console.error(`${TAG} ❌ memberContactId NO es GUID válido`);
      return;
    }
    
    console.log(`${TAG} 🔍 Obteniendo contacto con ID: ${memberContactId}`);
    
    const elevatedGet = elevate(contacts.getContact);
    const contact = await elevatedGet(memberContactId);
    
    if (!contact || !contact.revision) {
      console.error(`${TAG} ❌ No se encontró contacto o revision`);
      return;
    }
    
    console.log(`${TAG} ✅ Contacto obtenido - revision: ${contact.revision}`);
    
    const currentFicha = contact?.info?.extendedFields?.['custom.ficha'] || '';
    const timestamp = new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' });
    const newEntry = `[${timestamp}] ${customerMessage}`;
    const updatedFicha = currentFicha ? `${currentFicha}\n${newEntry}` : newEntry;
    
    console.log(`${TAG} 📝 Nueva nota: "${newEntry}"`);
    
    // ✅ ESTRUCTURA CORRECTA
    const identifiers = {
      contactId: memberContactId,
      revision: contact.revision
    };
    
    const contactInfo = {
      extendedFields: {
        'custom.ficha': updatedFicha
      }
    };
    
    const options = { suppressAuth: true };
    
    console.log(`${TAG} 📦 Llamando updateContact con:`);
    console.log(`${TAG}    identifiers:`, identifiers);
    console.log(`${TAG}    contactInfo.extendedFields:`, contactInfo.extendedFields);
    
    const elevatedUpdate = elevate(contacts.updateContact);
    
    // ✅ FIRMA CORRECTA: updateContact(identifiers, contactInfo, options)
    const result = await elevatedUpdate(identifiers, contactInfo, options);
    
    console.log(`${TAG} ✅ Nota guardada exitosamente`);
    console.log(`${TAG} ════════════════════════════════════════════════════════`);
    
  } catch (e) {
    console.error(`${TAG} ❌ ERROR EN saveNotaToCRM:`);
    console.error(`${TAG} ❌ ${e.message}`);
    console.error(`${TAG} ════════════════════════════════════════════════════════`);
  }
}

// =====================================================
// WEB METHODS
// =====================================================

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

export const getStaffResources = webMethod(Permissions.Anyone, async () => {
  try {
    const staff = await listStaffResources();
    return { ok: true, version: VERSION, staff };
  } catch (e) {
    console.error(`${TAG} getStaffResources FAIL`, e);
    return { ok: false, version: VERSION, error: safeErr(e) };
  }
});

export const getMapeoMechas = webMethod(Permissions.Anyone, async ({ serviceId }) => {
  try {
    if (!isGuid(serviceId)) throw new Error(`serviceId no es GUID`);
    const item = await getMapeoByPublicServiceId(serviceId);
    if (!item) throw new Error(`No mapeo para ${serviceId}`);
    return { ok: true, version: VERSION, serviceId, mapeo: buildMapeoResponse(item) };
  } catch (e) {
    console.error(`${TAG} getMapeoMechas FAIL`, e);
    return { ok: false, version: VERSION, error: safeErr(e) };
  }
});

export const getHorasDisponibles = webMethod(Permissions.Anyone, async (payload) => {
  try {
    const {
      publicServiceId,
      fechaISO,
      empleadoId,
      empleado2Id,
      peinadoValue,
      tratamientoValue,
      corteChecked
    } = payload || {};

    if (!isGuid(publicServiceId)) throw new Error('publicServiceId requerido');
    const dateISO = normalizeDateISO(fechaISO);
    if (!dateISO) throw new Error('fechaISO requerido');
    if (!isGuid(empleadoId)) throw new Error('empleadoId requerido');

    const item = await getMapeoByPublicServiceId(publicServiceId);
    if (!item) throw new Error(`No mapeo para ${publicServiceId}`);
    const mapeo = buildMapeoResponse(item);

    const minAplic = toNum(mapeo.mins.aplicacion);
    const minGap = toNum(mapeo.mins.proceso);
    const minFinal = toNum(mapeo.mins.final);

    if (!isGuid(mapeo.ids.aplicacion) || minAplic <= 0) throw new Error('Mapeo inválido: Aplicación');
    if (!isGuid(mapeo.ids.final) || minFinal <= 0) throw new Error('Mapeo inválido: Final');

    const peinado = pickPeinado(mapeo, peinadoValue);
    if (peinado.selected && (!isGuid(peinado.id) || peinado.min <= 0)) throw new Error('Mapeo inválido: Peinado');

    const trat = pickTratamiento(mapeo, tratamientoValue);
    if (trat.selected && (!isGuid(trat.id) || trat.min <= 0)) throw new Error('Mapeo inválido: Tratamiento');

    const corte = Boolean(corteChecked);
    if (corte && (!isGuid(mapeo.ids.corte) || toNum(mapeo.mins.corte) <= 0)) throw new Error('Mapeo inválido: Corte');
    const minCorte = toNum(mapeo.mins.corte);

    const hasExtra = isGuid(empleado2Id) && empleado2Id !== empleadoId;
    const staffMain = empleadoId;
    const staffExtras = hasExtra ? empleado2Id : empleadoId;

    const allItems = await getAllBookingsRaw();
    
    console.log(`${TAG} 📊 Total bookings obtenidos: ${allItems.length}`);
    console.log(`${TAG} 🔍 Filtrando por fecha: ${dateISO}, staffMain: ${staffMain}`);
    
    const mainBookings = filterBookingsByDateAndResource(allItems, dateISO, staffMain);
    const extraBookings = filterBookingsByDateAndResource(allItems, dateISO, staffExtras);
    
    console.log(`${TAG} 📊 Después de filtrar: ${mainBookings.length} main, ${extraBookings.length} extras`);

    const candidates = buildSlotsHHmm(OPEN_HHMM, CLOSE_HHMM, STEP_MIN);
    const slotsOk = [];

    for (const hhmm of candidates) {
      let ok = true;
      const startAplic = madridToUTC(dateISO, hhmm);
      const endAplic = addMinutes(startAplic, minAplic);

      for (const b of mainBookings) {
        if (overlaps(startAplic, endAplic, b.start, b.end)) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;

      let cursor = addMinutes(endAplic, minGap);

      if (peinado.selected) {
        const s = cursor;
        const e = addMinutes(s, peinado.min);
        for (const b of extraBookings) {
          if (overlaps(s, e, b.start, b.end)) {
            ok = false;
            break;
          }
        }
        if (!ok) continue;
        cursor = e;
      }

      if (trat.selected) {
        const s = cursor;
        const e = addMinutes(s, trat.min);
        for (const b of extraBookings) {
          if (overlaps(s, e, b.start, b.end)) {
            ok = false;
            break;
          }
        }
        if (!ok) continue;
        cursor = e;
      }

      if (corte) {
        const s = cursor;
        const e = addMinutes(s, minCorte);
        for (const b of extraBookings) {
          if (overlaps(s, e, b.start, b.end)) {
            ok = false;
            break;
          }
        }
        if (!ok) continue;
        cursor = e;
      }

      const startFinal = cursor;
      const endFinal = addMinutes(startFinal, minFinal);
      for (const b of mainBookings) {
        if (overlaps(startFinal, endFinal, b.start, b.end)) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;

      slotsOk.push({ label: hhmm, value: hhmm });
      if (slotsOk.length >= MAX_SLOTS) break;
    }

    const serviceIds = [mapeo.ids.aplicacion];
    if (peinado.selected) serviceIds.push(peinado.id);
    if (trat.selected) serviceIds.push(trat.id);
    if (corte) serviceIds.push(mapeo.ids.corte);
    serviceIds.push(mapeo.ids.final);

    const priceInfo = await calculateTotalPrice(serviceIds);

    return { 
      ok: true, 
      version: VERSION, 
      slots: slotsOk,
      price: priceInfo.total,
      currency: priceInfo.currency,
      priceBreakdown: priceInfo.breakdown
    };

  } catch (e) {
    console.error(`${TAG} getHorasDisponibles FAIL`, e);
    return { ok: false, version: VERSION, error: safeErr(e) };
  }
});

export const confirmarEnCalendario = webMethod(Permissions.Anyone, async (payload) => {
  try {
    console.log(`${TAG} ═══════════════════════════════════════════════════════`);
    console.log(`${TAG} 🎯 confirmarEnCalendario INICIO`);
    console.log(`${TAG} ═══════════════════════════════════════════════════════`);

    const {
      publicServiceId,
      serviceId,
      fechaISO,
      horaHHmm,
      empleadoId,
      resourceId,
      empleado2Id,
      peinadoValue,
      longitud,
      tratamientoValue,
      corteChecked,
      notes = '',
      guardarNota = false,
      memberContactId = null // 🆕 RECIBIR CONTACTID DEL MEMBER
    } = payload || {};

    const idPublico = publicServiceId || serviceId;
    const mainStaffId = resourceId || empleadoId;

    const dateISO = normalizeDateISO(fechaISO);
    const hhmm = normalizeHHmm(horaHHmm);

    if (!isGuid(idPublico)) throw new Error('publicServiceId requerido');
    if (!dateISO) throw new Error('fechaISO requerido');
    if (!hhmm) throw new Error('horaHHmm requerido');
    if (!isGuid(mainStaffId)) throw new Error('empleadoId requerido');

    const extrasStaffId = (isGuid(empleado2Id) ? empleado2Id : mainStaffId);

    const item = await getMapeoByPublicServiceId(idPublico);
    if (!item) throw new Error(`No mapeo para ${idPublico}`);
    const mapeo = buildMapeoResponse(item);

    const minAplic = toNum(mapeo.mins.aplicacion);
    const minGap = toNum(mapeo.mins.proceso);
    const minFinal = toNum(mapeo.mins.final);

    const idAplic = mapeo.ids.aplicacion;
    const idFinal = mapeo.ids.final;

    if (!isGuid(idAplic) || minAplic <= 0) throw new Error('Mapeo inválido: Aplicación');
    if (!isGuid(idFinal) || minFinal <= 0) throw new Error('Mapeo inválido: Final');

    const peinado = pickPeinado(mapeo, (peinadoValue ?? longitud));
    if (peinado.selected && (!isGuid(peinado.id) || peinado.min <= 0)) throw new Error('Mapeo inválido: Peinado');

    const trat = pickTratamiento(mapeo, tratamientoValue);
    if (trat.selected && (!isGuid(trat.id) || trat.min <= 0)) throw new Error('Mapeo inválido: Tratamiento');

    const corte = Boolean(corteChecked);
    if (corte && (!isGuid(mapeo.ids.corte) || toNum(mapeo.mins.corte) <= 0)) throw new Error('Mapeo inválido: Corte');
    const idCorte = mapeo.ids.corte;
    const minCorte = toNum(mapeo.mins.corte);

    const contactDetails = buildContactDetailsFromPayload(payload);
    
    const cd = payload?.contactDetails || {};
    const customerMessage = String(cd?.mensaje || payload?.mensaje || '').trim();
    
    console.log(`${TAG} 💬 Mensaje recibido: "${customerMessage}"`);
    console.log(`${TAG} 📌 Guardar nota: ${guardarNota}`);
    console.log(`${TAG} 🆔 Member contactId: ${memberContactId || 'NO'}`);

    console.log(`${TAG} 🟢 Convirtiendo a UTC: dateISO=${dateISO}, hhmm=${hhmm}`);
    const startAplic = madridToUTC(dateISO, hhmm);
    console.log(`${TAG} 🟢 UTC: ${startAplic}`);
    
    const endAplic = addMinutes(startAplic, minAplic);

    let cursor = addMinutes(endAplic, minGap);

    const baseNotes =
      `${notes}\n` +
      `Publico=${idPublico}\n` +
      `MainStaff=${mainStaffId}; ExtraStaff=${extrasStaffId}\n` +
      `Peinado=${peinado.selected ? peinado.key : 'NONE'}; Trat=${trat.selected ? trat.key : 'NONE'}; Corte=${corte ? 'YES' : 'NO'}\n` +
      `MinAplic=${minAplic}; MinGap=${minGap}; MinPeinado=${peinado.min}; MinTrat=${trat.min}; MinCorte=${corte ? minCorte : 0}; MinFinal=${minFinal}`;

    console.log(`${TAG} 💰 Obteniendo precios...`);
    const precioAplic = (await getServicePrice(idAplic)).price;
    const precioPeinado = peinado.selected ? (await getServicePrice(peinado.id)).price : 0;
    const precioTrat = trat.selected ? (await getServicePrice(trat.id)).price : 0;
    const precioCorte = corte ? (await getServicePrice(idCorte)).price : 0;
    const precioFinal = (await getServicePrice(idFinal)).price;
    
    console.log(`${TAG} 💰 Precios: Aplic=${precioAplic}, Peinado=${precioPeinado}, Trat=${precioTrat}, Corte=${precioCorte}, Final=${precioFinal}`);

    // 🆕 CREAR BOOKINGS CON MEMBER CONTACTID
    const bAplic = await createAndConfirmBookingPhase({
      serviceId: idAplic,
      resourceId: mainStaffId,
      startISO: startAplic,
      endISO: endAplic,
      notes: `${baseNotes}\nFASE=APLICACIÓN`,
      contactDetails,
      price: precioAplic,
      memberContactId
    });

    let bPeinado = null;
    if (peinado.selected) {
      const s = cursor;
      const e = addMinutes(s, peinado.min);
      bPeinado = await createAndConfirmBookingPhase({
        serviceId: peinado.id,
        resourceId: extrasStaffId,
        startISO: s,
        endISO: e,
        notes: `${baseNotes}\nFASE=PEINADO`,
        contactDetails,
        price: precioPeinado,
        memberContactId
      });
      cursor = e;
    }

    let bTrat = null;
    if (trat.selected) {
      const s = cursor;
      const e = addMinutes(s, trat.min);
      bTrat = await createAndConfirmBookingPhase({
        serviceId: trat.id,
        resourceId: extrasStaffId,
        startISO: s,
        endISO: e,
        notes: `${baseNotes}\nFASE=TRATAMIENTO`,
        contactDetails,
        price: precioTrat,
        memberContactId
      });
      cursor = e;
    }

    let bCorte = null;
    if (corte) {
      const s = cursor;
      const e = addMinutes(s, minCorte);
      bCorte = await createAndConfirmBookingPhase({
        serviceId: idCorte,
        resourceId: extrasStaffId,
        startISO: s,
        endISO: e,
        notes: `${baseNotes}\nFASE=CORTE`,
        contactDetails,
        price: precioCorte,
        memberContactId
      });
      cursor = e;
    }

    const startFinal = cursor;
    const endFinal = addMinutes(startFinal, minFinal);

    const bFinal = await createAndConfirmBookingPhase({
      serviceId: idFinal,
      resourceId: mainStaffId,
      startISO: startFinal,
      endISO: endFinal,
      notes: `${baseNotes}\nFASE=FINAL`,
      contactDetails,
      price: precioFinal,
      memberContactId
    });

    const serviceIds = [idAplic];
    if (peinado.selected) serviceIds.push(peinado.id);
    if (trat.selected) serviceIds.push(trat.id);
    if (corte) serviceIds.push(idCorte);
    serviceIds.push(idFinal);

    const priceInfo = await calculateTotalPrice(serviceIds);

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // PROCESAR MENSAJE (A + B)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    if (customerMessage.length > 0) {
      // A) ALERTA INTERNA (siempre que haya mensaje)
      await sendInternalAlert(customerMessage, contactDetails, dateISO, hhmm);
      
      // B) GUARDAR NOTA EN CRM (solo si checkbox marcado Y hay member)
      if (guardarNota && memberContactId && isGuid(memberContactId)) {
        await saveNotaToCRM(customerMessage, memberContactId);
      } else if (guardarNota && !memberContactId) {
        console.warn(`${TAG} ⚠️ No se puede guardar nota: no hay memberContactId`);
      }
    }

    console.log(`${TAG} ═══════════════════════════════════════════════════════`);
    console.log(`${TAG} 🎉 confirmarEnCalendario COMPLETADO - Total: ${priceInfo.total}€`);
    console.log(`${TAG} ═══════════════════════════════════════════════════════`);

    return {
      ok: true,
      version: VERSION,
      bookingIds: {
        aplicacion: bAplic,
        peinado: bPeinado,
        tratamiento: bTrat,
        corte: bCorte,
        final: bFinal
      },
      price: priceInfo.total,
      currency: priceInfo.currency,
      priceBreakdown: priceInfo.breakdown
    };
  } catch (e) {
    console.error(`${TAG} ❌ confirmarEnCalendario FAIL`, e);
    return { ok: false, version: VERSION, error: safeErr(e) };
  }
});