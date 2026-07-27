// =====================================================
// Motor de Consultas TEST4 - Backend Híbrido
// v3.3.1 (Motor funcional) + getMapeoMechas (para complementos)
// =====================================================

import wixData from 'wix-data';
import { webMethod, Permissions } from 'wix-web-module';
import { elevate } from 'wix-auth';
import { availabilityCalendar } from 'wix-bookings.v2';

const VERSION = 'TEST4-v3.3.1-HYBRID';
const TAG = `[Test4][${VERSION}]`;

// Colección CMS
const COLLECTION_MAPEO = 'SvMapeoServicios';

// Constantes de zona horaria
const BUSINESS_TIMEZONE = 'Europe/Madrid';

// IDs de Staff (según GUIA_ids_interfaceUI.pdf)
const STAFF_IDS = {
  PROCESO: 'ac0c405a-f8c7-4580-a915-da28c89b2d43',
  ANGELA: '0c22fa77-3602-4876-b744-ded83ed540f8',
  RAQUEL: '0e69d7a3-4e36-40ec-9f3d-348f5bf3524d',
  RICARDO: 'b888c390-361d-4b0d-80f7-e0ba808bd7ce',
  CUALQUIERA: '240bb817-cd83-4a7c-ac1a-caef60f85315'
};

// =====================================================
// UTILIDADES BÁSICAS (sin toISOString)
// =====================================================

function safeErr(e) {
  const out = { 
    name: e?.name || 'Error', 
    message: e?.message || String(e) 
  };
  if (e?.details) out.details = e.details;
  return out;
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

/**
 * Formatea Date a YYYY-MM-DD en zona Madrid
 * SIN usar toISOString()
 */
function formatLocalDate(date) {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return dtf.format(date); // Retorna "YYYY-MM-DD"
}

/**
 * Formatea Date a HH:mm en zona Madrid
 * SIN usar toISOString()
 */
function formatLocalTime(date) {
  const dtf = new Intl.DateTimeFormat('en-GB', {
    timeZone: BUSINESS_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  return dtf.format(date); // Retorna "HH:mm"
}

/**
 * Calcula endTime correcto sumando duración a startTime
 * FIX v3.1: Wix API devuelve endTime incorrecto cuando la duración
 * solicitada incluye múltiples servicios (ej: Peinado + Lavado)
 * 
 * @param {string} startTime - "HH:mm" formato 24h
 * @param {number} duracionMinutos - duración total en minutos
 * @returns {string} endTime calculado en formato "HH:mm"
 */
function calcularEndTimeCorrect(startTime, duracionMinutos) {
  // Parsear hora de inicio
  const [hours, minutes] = startTime.split(':').map(Number);
  
  // Calcular minutos totales
  let totalMinutes = (hours * 60) + minutes + duracionMinutos;
  
  // Convertir de vuelta a HH:mm
  const newHours = Math.floor(totalMinutes / 60) % 24;
  const newMinutes = totalMinutes % 60;
  
  return `${String(newHours).padStart(2, '0')}:${String(newMinutes).padStart(2, '0')}`;
}

/**
 * Añade días a una fecha YYYY-MM-DD
 * SIN conversiones UTC - trabajo puro con strings
 */
function addDaysToDateString(dateStr, days) {
  // Parsear componentes
  const [year, month, day] = dateStr.split('-').map(Number);
  
  // Crear Date en contexto local (no UTC)
  const date = new Date(year, month - 1, day);
  
  // Añadir días
  date.setDate(date.getDate() + days);
  
  // Formatear de vuelta a YYYY-MM-DD usando Intl
  return formatLocalDate(date);
}

// =====================================================
// CONSULTA DE DISPONIBILIDAD INTERNA (Time Slots V2)
// =====================================================

/**
 * Función INTERNA para consultar disponibilidad de un staff específico
 * NO exportada - solo para uso interno de consultarDisponibilidad
 */
async function _consultarStaffEspecifico(payload) {
  const {
    serviceId,
    duracionMinutos,
    serviceName,
    staffId,
    selectedDate,
    specificStartTime
  } = payload;

  // fromLocalDate: ya viene como YYYY-MM-DD del frontend
  const fromLocalDate = selectedDate;
  
  // toLocalDate: día siguiente (para cubrir todo el día)
  const toLocalDate = addDaysToDateString(selectedDate, 1);

  // Preparar query para Availability Calendar
  const query = {
    filter: {
      serviceId: [serviceId],
      startDate: fromLocalDate,
      endDate: toLocalDate
    },
    timezone: BUSINESS_TIMEZONE
  };

  // Añadir filtro de staff específico
  if (staffId) {
    query.filter.resourceId = [staffId];
  }

  // Llamar a Availability Calendar con elevate
  const elevatedQueryAvailability = elevate(availabilityCalendar.queryAvailability);
  const response = await elevatedQueryAvailability(query);

  // Procesar slots
  let slots = [];
  
  if (response?.availabilityEntries) {
    for (const entry of response.availabilityEntries) {
      if (entry.slot?.startDate && entry.slot?.endDate) {
        // Crear Date objects desde las fechas de Wix
        const slotStart = new Date(entry.slot.startDate);
        const slotEnd = new Date(entry.slot.endDate);
        
        // Formatear en zona Madrid
        const startTime = formatLocalTime(slotStart);
        const endTimeFromWix = formatLocalTime(slotEnd);
        const dateFormatted = formatLocalDate(slotStart);

        // Calcular endTime correcto
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
            sessionId: entry.slot.sessionId,
            endTimeFromWix: endTimeFromWix
          }
        });
      }
    }
  }

  return slots;
}

// =====================================================
// CONSULTA DE DISPONIBILIDAD PÚBLICA (Time Slots V2)
// =====================================================

/**
 * Consulta slots disponibles usando Availability Calendar
 * EVOLUCIÓN v3.0: Soporta specificStartTime para validación en cascada
 * EVOLUCIÓN v3.1: Corrige endTime calculándolo manualmente (fix Lavado Fantasma)
 * EVOLUCIÓN v3.2: Optimización de performance (deduplicación + logs reducidos)
 * EVOLUCIÓN v3.3: Fix CUALQUIERA - Valida disponibilidad real de los 3 staff
 * 
 * NOTA: Esta API está deprecada y será eliminada el 31 de marzo de 2026
 * Plan de contingencia documentado en PLAN_CONTINGENCIA_MARZO_2026.md
 * 
 * REGLAS DE ORO:
 * - timezone explícito en cada llamada
 * - startDate/endDate sin conversión UTC manual
 * - Wix maneja DST automáticamente
 */
export const consultarDisponibilidad = webMethod(
  Permissions.Anyone, 
  async (payload) => {
    try {
      const {
        serviceId,       // ID técnico directo (idAplicacion, idPeinadoS, etc.)
        duracionMinutos, // Duración del servicio
        serviceName,     // Nombre para logs
        staffId,         // Puede ser "ANY", STAFF_IDS.CUALQUIERA, o ID específico
        selectedDate,    // YYYY-MM-DD string desde el DatePicker
        specificStartTime // NUEVO: "HH:mm" para validación en cascada (opcional)
      } = payload || {};

      console.log(`${TAG} 🚀 consultarDisponibilidad v3.3 INICIO`);
      console.log(`${TAG} Service: ${serviceName || serviceId} | Duration: ${duracionMinutos}min | Date: ${selectedDate}${specificStartTime ? ` | Time: ${specificStartTime}` : ''}`);
      console.log(`${TAG} Staff: ${staffId}`);

      // Validaciones básicas
      if (!serviceId) {
        throw new Error('serviceId es requerido');
      }
      if (!duracionMinutos || duracionMinutos <= 0) {
        throw new Error('duracionMinutos es requerido y debe ser > 0');
      }
      if (!selectedDate) {
        throw new Error('selectedDate es requerido');
      }

      let slots = [];

      // 🔧 FIX v3.3: CUALQUIERA = Consultar los 3 staff reales
      if (staffId === STAFF_IDS.CUALQUIERA || staffId === 'ANY') {
        console.log(`${TAG} 🎯 MODO CUALQUIERA: Consultando Angela, Raquel, Ricardo...`);
        
        // Consultar los 3 staff en paralelo
        const [slotsAngela, slotsRaquel, slotsRicardo] = await Promise.all([
          _consultarStaffEspecifico({...payload, staffId: STAFF_IDS.ANGELA}),
          _consultarStaffEspecifico({...payload, staffId: STAFF_IDS.RAQUEL}),
          _consultarStaffEspecifico({...payload, staffId: STAFF_IDS.RICARDO})
        ]);

        console.log(`${TAG} Angela: ${slotsAngela.length} slots | Raquel: ${slotsRaquel.length} slots | Ricardo: ${slotsRicardo.length} slots`);

        // Unificar todos los slots
        const todosSlots = [...slotsAngela, ...slotsRaquel, ...slotsRicardo];
        
        // Deduplicar por startTime
        const slotsMap = new Map();
        todosSlots.forEach(slot => {
          const key = `${slot.date}_${slot.startTime}`;
          if (!slotsMap.has(key)) {
            slotsMap.set(key, slot);
          }
        });
        
        slots = Array.from(slotsMap.values());
        
        // Ordenar cronológicamente por startTime
        slots.sort((a, b) => a.startTime.localeCompare(b.startTime));
        
        console.log(`${TAG} ✅ Slots unificados, deduplicados y ordenados: ${slots.length}`);

      } else if (staffId) {
        // Staff específico (Angela, Raquel, Ricardo)
        console.log(`${TAG} 👤 MODO STAFF ESPECÍFICO: ${staffId}`);
        slots = await _consultarStaffEspecifico(payload);
        
      } else {
        // Sin filtro de staff (fallback a comportamiento anterior)
        console.log(`${TAG} ⚠️ Sin staffId - Consultando sin filtro de staff`);
        slots = await _consultarStaffEspecifico(payload);
      }

      // 🎯 FILTRO POR HORA ESPECÍFICA (si se especificó)
      if (specificStartTime) {
        const originalCount = slots.length;
        slots = slots.filter(slot => slot.startTime === specificStartTime);
        console.log(`${TAG} 🎯 Filtered ${specificStartTime}: ${originalCount} → ${slots.length} slots`);
      }

      console.log(`${TAG} ✅ DONE: ${slots.length} slots | Timezone: ${BUSINESS_TIMEZONE}`);

      return {
        ok: true,
        version: VERSION,
        slots,
        totalSlots: slots.length,
        serviceInfo: {
          serviceId,
          serviceName: serviceName || 'Sin nombre',
          duration: duracionMinutos
        },
        queryParams: {
          staffId: staffId || 'No especificado',
          date: selectedDate,
          specificStartTime: specificStartTime || null,
          timezone: BUSINESS_TIMEZONE
        },
        _deprecationWarning: 'Availability Calendar será eliminada el 31-mar-2026. Ver PLAN_CONTINGENCIA_MARZO_2026.md'
      };

    } catch (e) {
      console.error(`${TAG} ❌ ERROR en consultarDisponibilidad:`, e);
      return {
        ok: false,
        version: VERSION,
        error: safeErr(e)
      };
    }
  }
);

// =====================================================
// 🆕 FUNCIÓN PARA LEER MAPEO DE COMPLEMENTOS
// =====================================================

/**
 * Lee el mapeo de complementos desde CMS para un servicio público
 * (Adaptado del código GPT pero simplificado)
 */
export const getMapeoMechas = webMethod(Permissions.Anyone, async ({ serviceId }) => {
  try {
    console.log(`${TAG} 📋 getMapeoMechas para serviceId: ${serviceId}`);
    
    if (!serviceId) {
      throw new Error('serviceId es requerido');
    }

    // Buscar en CMS por idServicioPublico
    const result = await wixData.query(COLLECTION_MAPEO)
      .eq('idServicioPublico', serviceId)
      .limit(1)
      .find({ suppressAuth: true });

    const item = (result?.items || [])[0] || null;

    if (!item) {
      console.log(`${TAG} ⚠️ No se encontró mapeo para ${serviceId}`);
      return { 
        ok: false, 
        version: VERSION, 
        error: { message: `No se encontró mapeo para ${serviceId}` }
      };
    }

    // Construir respuesta con mins e ids
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

    console.log(`${TAG} ✅ Mapeo encontrado con ${Object.keys(ids).length} campos`);

    return {
      ok: true,
      version: VERSION,
      serviceId,
      mapeo: { mins, ids }
    };

  } catch (e) {
    console.error(`${TAG} ❌ ERROR en getMapeoMechas:`, safeErr(e));
    return {
      ok: false,
      version: VERSION,
      error: safeErr(e)
    };
  }
});

// =====================================================
// EXPORTAR CONSTANTES PARA FRONTEND
// =====================================================

export const getConstants = webMethod(Permissions.Anyone, async () => {
  return {
    ok: true,
    version: VERSION,
    staffIds: STAFF_IDS,
    businessTimezone: BUSINESS_TIMEZONE
  };
});