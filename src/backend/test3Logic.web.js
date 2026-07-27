// backend/test3Logic.web.js
// =====================================================
// Motor de Consultas TEST3 v3.10 - FIX SERVICE ID (_id vs id)
// BASE: v3.9 (mapeo keys SvMapeoServicios OK)
// FIX: Bookings V2: el GUID real suele venir en service._id (no en service.id)
//      -> devolver serviceId = service._id || service.id
// =====================================================

import wixData from 'wix-data';
import { webMethod, Permissions } from 'wix-web-module';
import { elevate } from 'wix-auth';
import { availabilityCalendar, services } from 'wix-bookings.v2';

const VERSION = 'TEST3-v3.10-SERVICE-_ID-FIX';
const TAG = `[Test3][${VERSION}]`;

const COLLECTION_MAPEO = 'SvMapeoServicios';
const BUSINESS_TIMEZONE = 'Europe/Madrid';

const STAFF_IDS = {
  PROCESO: 'ac0c405a-f8c7-4580-a915-da28c89b2d43',
  ANGELA: '0c22fa77-3602-4876-b744-ded83ed540f8',
  RAQUEL: '0e69d7a3-4e36-40ec-9f3d-348f5bf3524d',
  RICARDO: 'b888c390-361d-4b0d-80f7-e0ba808bd7ce',
  CUALQUIERA: '240bb817-cd83-4a7c-ac1a-caef60f85315'
};

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

// ✅ FIX clave: extraer GUID real del servicio V2
function getServiceGuid(service) {
  // En muchas cuentas V2 el GUID viene en _id
  const cand = service?._id || service?.id || service?.serviceId || null;
  return (typeof cand === 'string' && cand) ? cand : '';
}

// =====================================================
// MAPE0 CMS - SvMapeoServicios (KEYS REALES confirmadas por ti)
// =====================================================

async function getMapeoByPublicServiceId(publicServiceId) {
  console.log(`${TAG} 🔍 Buscando en CMS: idServicioPublico = ${publicServiceId}`);

  const r = await wixData.query(COLLECTION_MAPEO)
    .eq('idServicioPublico', publicServiceId)
    .limit(1)
    .find({ suppressAuth: true });

  const item = (r?.items || [])[0] || null;

  console.log(`${TAG} 🔍 Resultado CMS:`, item ? 'ENCONTRADO' : 'NULL');
  return item;
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
    matiz: toNum(item.minMatiz)
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
    matiz: item.idMatiz || ''
  };

  console.log(`${TAG} ✅ Mapeo mins:`, mins);
  console.log(`${TAG} ✅ Mapeo ids:`, ids);

  return { mins, ids };
}

// =====================================================
// WEB METHODS - LECTURA WIX BOOKINGS V2
// =====================================================

export const getCategorias = webMethod(Permissions.Anyone, async () => {
  const queryServices = elevate(services.queryServices);

  try {
    console.log(`${TAG} 📋 getCategorias: queryServices().find()...`);

    const response = await queryServices().find();
    const allServices = response.items || [];

    console.log(`${TAG} Total servicios leídos: ${allServices.length}`);

    const categoriasSet = new Set();
    allServices.forEach(service => {
      const name = service?.category?.name;
      if (name) categoriasSet.add(name);
    });

    let categorias = Array.from(categoriasSet);

    categorias = categorias.filter(cat => {
      const normalized = String(cat)
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
      return !normalized.includes("servicios tecnicos");
    });

    console.log(`${TAG} ✅ Categorías visibles (${categorias.length}):`, categorias);

    return { ok: true, categorias };

  } catch (error) {
    console.error(`${TAG} ❌ Error getCategorias:`, error);
    return { ok: false, error: safeErr(error), categorias: [] };
  }
});

export const getServiciosPorCategoria = webMethod(Permissions.Anyone, async (categoria) => {
  const queryServices = elevate(services.queryServices);

  try {
    console.log(`${TAG} 📋 getServiciosPorCategoria: "${categoria}"`);

    const response = await queryServices().find();
    const allServices = response.items || [];

    const serviciosCategoria = allServices.filter(service => service?.category?.name === categoria);

    console.log(`${TAG} Servicios en "${categoria}": ${serviciosCategoria.length}`);

    const servicios = serviciosCategoria.map(service => {
      const duracion = service?.schedule?.availabilityConstraints?.sessionDurations?.[0] || 30;

      const serviceGuid = getServiceGuid(service);

      // 🔥 Diagnóstico: si falta el GUID, lo sabrás
      if (!serviceGuid) {
        console.warn(`${TAG} ⚠️ Servicio SIN GUID detectado. name="${service?.name}" raw keys=${Object.keys(service || {})}`);
      } else if (!isGuid(serviceGuid)) {
        console.warn(`${TAG} ⚠️ GUID NO válido. name="${service?.name}" guid="${serviceGuid}"`);
      }

      return {
        serviceId: serviceGuid,         // ✅ FIX: _id || id
        serviceName: service?.name || '',
        duracion
      };
    }).filter(s => s.serviceId); // si alguno venía sin id, lo excluimos

    console.log(`${TAG} ✅ ${servicios.length} servicios mapeados (con GUID)`);

    return { ok: true, servicios };

  } catch (error) {
    console.error(`${TAG} ❌ Error getServiciosPorCategoria:`, error);
    return { ok: false, error: safeErr(error), servicios: [] };
  }
});

// =====================================================
// getMapeoMechas (requiere GUID real)
// =====================================================

export const getMapeoMechas = webMethod(Permissions.Anyone, async ({ serviceId }) => {
  try {
    console.log(`${TAG} ═══════════════════════════════════════════════════════`);
    console.log(`${TAG} 📡 getMapeoMechas INICIO`);
    console.log(`${TAG} ═══════════════════════════════════════════════════════`);
    console.log(`${TAG} serviceId: ${serviceId}`);

    if (!isGuid(serviceId)) {
      throw new Error(`serviceId no es GUID: ${serviceId}`);
    }

    const item = await getMapeoByPublicServiceId(serviceId);

    if (!item) {
      console.log(`${TAG} ❌ No hay mapeo en CMS para ${serviceId}`);
      throw new Error(`No mapeo para ${serviceId}`);
    }

    const mapeo = buildMapeoResponse(item);

    console.log(`${TAG} ✅ getMapeoMechas COMPLETADO`);
    console.log(`${TAG} ═══════════════════════════════════════════════════════`);

    return { ok: true, version: VERSION, serviceId, mapeo };

  } catch (e) {
    console.error(`${TAG} ❌ getMapeoMechas FAIL:`, e?.message || e);
    return { ok: false, version: VERSION, error: safeErr(e) };
  }
});

// =====================================================
// CONSULTA DE DISPONIBILIDAD (sin cambios funcionales)
// =====================================================

async function _consultarStaffEspecifico(payload) {
  const {
    serviceId,
    duracionMinutos,
    serviceName,
    staffId,
    selectedDate
  } = payload;

  const fromLocalDate = selectedDate;
  const toLocalDate = addDaysToDateString(selectedDate, 1);

  const query = {
    filter: {
      serviceId: [serviceId],
      startDate: fromLocalDate,
      endDate: toLocalDate
    },
    timezone: BUSINESS_TIMEZONE
  };

  if (staffId) {
    query.filter.resourceId = [staffId];
  }

  const elevatedQueryAvailability = elevate(availabilityCalendar.queryAvailability);
  const response = await elevatedQueryAvailability(query);

  let slots = [];

  if (response?.availabilityEntries) {
    for (const entry of response.availabilityEntries) {
      if (entry?.slot?.startDate && entry?.slot?.endDate) {
        const slotStart = new Date(entry.slot.startDate);

        const startTime = formatLocalTime(slotStart);
        const dateFormatted = formatLocalDate(slotStart);

        const endTimeCalculated = calcularEndTimeCorrect(startTime, duracionMinutos);

        slots.push({
          startTime,
          endTime: endTimeCalculated,
          date: dateFormatted,
          bookable: entry.bookable ?? true,
          openSpots: entry.openSpots,
          _raw: {
            startDate: entry.slot.startDate,
            endDate: entry.slot.endDate,
            sessionId: entry.slot.sessionId
          }
        });
      }
    }
  }

  return slots;
}

export const consultarDisponibilidad = webMethod(
  Permissions.Anyone,
  async (payload) => {
    try {
      const {
        serviceId,
        duracionMinutos,
        serviceName,
        staffId,
        selectedDate,
        specificStartTime
      } = payload || {};

      console.log(`${TAG} 🚀 consultarDisponibilidad INICIO`);
      console.log(`${TAG} Service: ${serviceName || serviceId} | Duration: ${duracionMinutos}min | Date: ${selectedDate}${specificStartTime ? ` | Time: ${specificStartTime}` : ''}`);

      if (!serviceId) throw new Error('serviceId es requerido');
      if (!duracionMinutos || duracionMinutos <= 0) throw new Error('duracionMinutos es requerido');
      if (!selectedDate) throw new Error('selectedDate es requerido');

      let slots = [];

      if (staffId === STAFF_IDS.CUALQUIERA || staffId === 'ANY') {
        console.log(`${TAG} 🎯 MODO CUALQUIERA`);

        const [slotsAngela, slotsRaquel, slotsRicardo] = await Promise.all([
          _consultarStaffEspecifico({ ...payload, staffId: STAFF_IDS.ANGELA }),
          _consultarStaffEspecifico({ ...payload, staffId: STAFF_IDS.RAQUEL }),
          _consultarStaffEspecifico({ ...payload, staffId: STAFF_IDS.RICARDO })
        ]);

        const todosSlots = [...slotsAngela, ...slotsRaquel, ...slotsRicardo];

        const slotsMap = new Map();
        todosSlots.forEach(slot => {
          const key = `${slot.date}_${slot.startTime}`;
          if (!slotsMap.has(key)) slotsMap.set(key, slot);
        });

        slots = Array.from(slotsMap.values());
        slots.sort((a, b) => a.startTime.localeCompare(b.startTime));

      } else {
        slots = await _consultarStaffEspecifico(payload);
      }

      if (specificStartTime) {
        const originalCount = slots.length;
        slots = slots.filter(slot => slot.startTime === specificStartTime);
        console.log(`${TAG} 🎯 Filtered ${specificStartTime}: ${originalCount} → ${slots.length} slots`);
      }

      console.log(`${TAG} ✅ DONE: ${slots.length} slots`);

      return {
        ok: true,
        version: VERSION,
        slots,
        totalSlots: slots.length,
        serviceInfo: {
          serviceId,
          serviceName: serviceName || 'Sin nombre',
          duration: duracionMinutos
        }
      };

    } catch (e) {
      console.error(`${TAG} ❌ ERROR consultarDisponibilidad:`, e);
      return { ok: false, version: VERSION, error: safeErr(e) };
    }
  }
);

export const getConstants = webMethod(Permissions.Anyone, async () => {
  return {
    ok: true,
    version: VERSION,
    staffIds: STAFF_IDS,
    businessTimezone: BUSINESS_TIMEZONE
  };
});
