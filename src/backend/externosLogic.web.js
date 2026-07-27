// =====================================================
// KAMISUITE - Backend: Servicios Externos
// =====================================================
// VERSION: 1.1.5
// FECHA: 13 de marzo de 2026
//
// CAMBIOS v1.1.5:
// - NEW: saveExternoItem() — insert o update en SvExternos (CRUD admin)
//   · Si item tiene _id → update
//   · Si no tiene _id → insert
//   · Valida campos obligatorios (title, type)
//   · Soporta campos nuevos: appliesTo, pricePerUnit, requiresBase
// - NEW: deleteExternoItem() — elimina registro de SvExternos
//   · Valida que el _id exista antes de borrar
//   · NO elimina servicios de Wix Bookings (solo CMS catálogo)
// - TODO lo demás INTACTO desde v1.1.4
//
// CAMBIOS v1.1.4:
// - FIX CRÍTICO: ensureContactInCRM() garantiza que SIEMPRE se cree
//   contacto en Wix CRM antes de registrar la cita.
//   Cubre todos los canales (web pública, recepción, Instagram, etc.)
//   Si memberContactId llega vacío, se crea contacto a partir de
//   contactDetails (nombre, email, teléfono) con allowDuplicates:false.
//   Resuelve: citas externas sin contacto CRM asociado.
// - NEW: Import contacts desde wix-crm-backend (no existía antes).
//
// CAMBIOS v1.1.3:
// - NEW: marcarPagadoExterno() — marca cita PAGADO + escribe en PagoreservasExternos
//   · Actualiza SvExternalRecords.status = 'PAGADO'
//   · Inserta en PagoreservasExternos (colección gemela de PaymentReservations)
//   · Anti-duplicado por bookingId = 'EXT_{registroId}'
//   · NO toca facturación, pedidos ni eCommerce
//
// CAMBIOS v1.1.2:
// - crearCitaExterno recibe servicios[] (array multiservicio)
//   en vez de categoria/modalidad/extras sueltos
// - Notas y registro CMS reflejan todos los servicios del combo
// - TODO lo demás INTACTO (getExternosCatalogo, disponibilidad, resource, helpers)
//
// ARCHIVO: backend/externosLogic.web.js
//
// FUNCIONES:
//   - getExternosCatalogo() → lee CMS SvExternos
//   - consultarDisponibilidadExterno() → huecos libres del recurso
//   - crearCitaExterno() → createSession (calendario) + registro CMS
//   - marcarPagadoExterno() → pago + registro en PagoreservasExternos (v1.1.3)
//   - saveExternoItem() → insert/update en SvExternos (v1.1.5)
//   - deleteExternoItem() → eliminar de SvExternos (v1.1.5)
//
// NOTAS:
//   - Usa createSession() para pintar en calendario Wix (tipo EVENT, tag Blocked)
//   - Registra en CMS SvExternalRecords para gestión interna
//   - NO usa booking, NO usa checkout, NO genera pedido
//   - Sessions API V1 (wix-bookings-backend) — migrar a V2 antes junio 2026
// =====================================================

import { Permissions, webMethod } from 'wix-web-module';
import { elevate } from 'wix-auth';
import { sessions, resources as resourcesBackend } from 'wix-bookings-backend';
import { services, availabilityCalendar } from 'wix-bookings.v2';
import { contacts } from 'wix-crm-backend'; // v1.1.4: necesario para ensureContactInCRM
import wixData from 'wix-data';

const TAG = '[ExternosLogic][1.1.5]';
const TIMEZONE = 'Europe/Madrid';
const CMS_CATALOGO = 'SvExternos';
const CMS_REGISTRO = 'SvExternalRecords';
const CMS_PAGOS_EXTERNOS = 'PagoreservasExternos'; // v1.1.3

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

function formatLocalTime(date) {
  return date.toLocaleTimeString('es-ES', {
    timeZone: TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
}

// =====================================================
// v1.1.4: GARANTIZAR CONTACTO CRM ANTES DE CREAR CITA
// =====================================================

async function ensureContactInCRM(contactDetails, memberContactId) {
  if (memberContactId && isGuid(memberContactId)) return memberContactId;

  const firstName = contactDetails?.firstName || '';
  const lastName = contactDetails?.lastName || '';
  const email = contactDetails?.email || '';
  const phone = contactDetails?.phone || '';

  if (!firstName && !email && !phone) {
    console.warn(`${TAG} ⚠️ ensureContactInCRM: sin datos suficientes para crear contacto`);
    return null;
  }

  try {
    console.log(`${TAG} 🔍 ensureContactInCRM: creando/buscando contacto para ${firstName} ${lastName} | ${email} | ${phone}`);
    const contactInfo = {
      name: { first: firstName, last: lastName },
      emails: (email && email !== 'booking@hair-times.com') ? [{ email }] : [],
      phones: phone ? [{ phone }] : []
    };
    const elevatedCreate = elevate(contacts.createContact);
    const result = await elevatedCreate(contactInfo, { allowDuplicates: false, suppressAuth: true });
    const newId = result?.contact?._id || result?._id || null;
    if (newId) {
      console.log(`${TAG} ✅ Contacto CRM asegurado: ${newId}`);
    } else {
      console.warn(`${TAG} ⚠️ ensureContactInCRM: createContact no devolvió ID`);
    }
    return newId;
  } catch (e) {
    console.error(`${TAG} ⚠️ ensureContactInCRM falló: ${e.message}`);
    return null;
  }
}

// =====================================================
// 1. LEER CATÁLOGO CMS (SIN CAMBIOS)
// =====================================================

export const getExternosCatalogo = webMethod(
  Permissions.Anyone,
  async () => {
    try {
      console.log(`${TAG} 📋 Leyendo catálogo SvExternos`);

      const result = await wixData.query(CMS_CATALOGO)
        .ascending('order')
        .limit(100)
        .find();

      const catalogo = (result.items || []).map(item => ({
        _id: item._id,
        title: item.title || '',
        type: item.type || '',
        category: item.category || '',
        price: item.price || 0,
        durationMin: item.durationMin || 0,
        pricePerUnit: item.pricePerUnit || false,
        requiresBase: item.requiresBase || false,
        appliesTo: item.appliesTo || '',
        active: item.active !== false,  // default true si no tiene valor
        order: item.order || 0,
        wixServiceId: item.wixServiceId || ''
      }));

      console.log(`${TAG} ✅ ${catalogo.length} items en catálogo`);
      return { ok: true, catalogo };

    } catch (e) {
      console.error(`${TAG} ❌ getExternosCatalogo:`, e.message);
      return { ok: false, error: safeErr(e), catalogo: [] };
    }
  }
);

// =====================================================
// 2. OBTENER RECURSO EXTERNO (SIN CAMBIOS)
// =====================================================

const RESOURCE_EXTERNO_ID = 'bc680326-8e9c-4a86-800b-66a07cdb03e7'; // Emy

let cachedResource = null;

async function getExternoResource(wixServiceId) {
  if (cachedResource && cachedResource.scheduleId) return cachedResource;

  try {
    const res = await resourcesBackend.queryResourceCatalog()
      .eq("_id", RESOURCE_EXTERNO_ID)
      .find();

    const items = res?.items || [];
    console.log(`${TAG} 🔍 queryResourceCatalog(.eq): ${items.length} items`);

    if (items.length > 0) {
      const item = items[0];
      const r = item?.resource || {};
      const scheduleId = r.scheduleIds?.[0]
        || r.eventsSchedule?._id
        || item.scheduleId
        || item?.schedules?.[0]?._id
        || null;

      console.log(`${TAG} 🔍 scheduleId recurso: ${scheduleId}`);

      if (scheduleId) {
        cachedResource = {
          resourceId: RESOURCE_EXTERNO_ID,
          label: r.name || 'Emy',
          scheduleId
        };
        console.log(`${TAG} ✅ Recurso externo: ${cachedResource.label} | schedule=${scheduleId}`);
        return cachedResource;
      }

      console.error(`${TAG} ❌ Recurso encontrado pero sin scheduleId`);
      console.log(`${TAG} 🔍 Keys resource:`, Object.keys(r).join(', '));
    } else {
      console.error(`${TAG} ❌ Recurso ${RESOURCE_EXTERNO_ID} no encontrado`);
    }

    if (wixServiceId) {
      const elevatedGet = elevate(services.getService);
      const svcResult = await elevatedGet(wixServiceId);
      const svc = svcResult?.service || svcResult || {};

      const svcScheduleId = svc?.scheduleId || svc?.schedule?.id || svc?.schedule?._id || null;

      if (svcScheduleId) {
        console.warn(`${TAG} ⚠️ Usando scheduleId del servicio como fallback: ${svcScheduleId}`);
        cachedResource = {
          resourceId: RESOURCE_EXTERNO_ID,
          label: 'Emy',
          scheduleId: svcScheduleId,
          isServiceSchedule: true
        };
        return cachedResource;
      }
    }

    console.error(`${TAG} ❌ No se pudo resolver scheduleId para Emy`);
    return null;

  } catch (e) {
    console.error(`${TAG} ❌ getExternoResource:`, e.message);
    return null;
  }
}

// =====================================================
// 3. CONSULTAR DISPONIBILIDAD (SIN CAMBIOS)
// =====================================================

export const consultarDisponibilidadExterno = webMethod(
  Permissions.Anyone,
  async ({ fecha, durationMinutes, wixServiceId }) => {
    const t0 = Date.now();
    try {
      console.log(`${TAG} 📅 Disponibilidad: ${fecha} | ${durationMinutes}min | service=${wixServiceId}`);

      if (!wixServiceId) {
        return { ok: false, error: { message: 'Falta wixServiceId' }, slots: [] };
      }

      const query = {
        filter: {
          serviceId: [wixServiceId],
          startDate: `${fecha}T00:00:00.000`,
          endDate: `${fecha}T23:59:59.000`
        },
        timezone: TIMEZONE
      };

      const elevatedQuery = elevate(availabilityCalendar.queryAvailability);
      const availability = await elevatedQuery(query);
      const entries = availability?.availabilityEntries || [];

      console.log(`${TAG} 📋 queryAvailability: ${entries.length} entries TOTAL`);
      if (entries.length > 0) {
        const first = entries[0];
        console.log(`${TAG} 📋 Primera entry: bookable=${first.bookable} | bookingPolicyViolations=${JSON.stringify(first.bookingPolicyViolations)} | openSpots=${first.openSpots}`);
        console.log(`${TAG} 📋 Primera entry slot: ${JSON.stringify(first.slot)}`);
      } else {
        console.log(`${TAG} 📋 0 entries. Query usada: ${JSON.stringify(query)}`);
      }

      const rawSlots = entries
        .filter(entry => entry.bookable)
        .map(entry => {
          const slot = entry.slot || {};
          if (!slot.startDate) return null;
          return {
            start: new Date(slot.startDate),
            end: new Date(slot.endDate),
            startTime: formatLocalTime(new Date(slot.startDate))
          };
        })
        .filter(Boolean);

      console.log(`${TAG} 📋 ${rawSlots.length} slots de 15min disponibles vía queryAvailability`);

      if (rawSlots.length === 0) {
        const tiempoConsulta = ((Date.now() - t0) / 1000).toFixed(1);
        return { ok: true, slots: [], tiempoConsulta };
      }

      const durMs = durationMinutes * 60000;
      const GRID_MS = 15 * 60000;

      const availableStarts = new Set(rawSlots.map(s => s.start.getTime()));

      const validSlots = [];
      for (const slot of rawSlots) {
        const requiredEnd = slot.start.getTime() + durMs;
        let fits = true;

        for (let t = slot.start.getTime(); t < requiredEnd; t += GRID_MS) {
          if (!availableStarts.has(t)) {
            fits = false;
            break;
          }
        }

        if (fits) {
          validSlots.push({ startTime: slot.startTime });
        }
      }

      // Filtrar: solo slots cada 15min (XX:00, XX:15, XX:30, XX:45)
      const SLOT_INTERVAL = 15;
      const filteredSlots = validSlots.filter(s => {
        const min = parseInt(s.startTime.split(':')[1], 10);
        return min % SLOT_INTERVAL === 0;
      });

      const tiempoConsulta = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(`${TAG} ✅ ${validSlots.length} válidos → ${filteredSlots.length} cada ${SLOT_INTERVAL}min (${tiempoConsulta}s)`);
      return { ok: true, slots: filteredSlots, tiempoConsulta };

    } catch (e) {
      const tiempoConsulta = ((Date.now() - t0) / 1000).toFixed(1);
      console.error(`${TAG} ❌ consultarDisponibilidad:`, e.message);
      return { ok: false, error: safeErr(e), slots: [], tiempoConsulta };
    }
  }
);

// =====================================================
// 4. LEER CITAS POR FECHA (para recepción)
// =====================================================

export const getExternosCitas = webMethod(
  Permissions.Anyone,
  async ({ fecha }) => {
    try {
      console.log(`${TAG} 📋 Leer citas: ${fecha}`);

      const startLocal = new Date(`${fecha}T00:00:00`);
      const endLocal = new Date(`${fecha}T23:59:59`);

      const startUTC = new Date(startLocal.getTime() - 3 * 3600000);
      const endUTC = new Date(endLocal.getTime() + 3 * 3600000);

      const result = await wixData.query(CMS_REGISTRO)
        .ge('date', startUTC)
        .le('date', endUTC)
        .ascending('date')
        .limit(50)
        .find();

      const citas = (result.items || []).filter(item => {
        if (!item.date) return false;
        const d = new Date(item.date);
        const madridDate = d.toLocaleDateString('en-CA', { timeZone: TIMEZONE });
        return madridDate === fecha;
      }).map(item => ({
        _id: item._id,
        title: item.title || '',
        clientName: item.clientName || '',
        clientEmail: item.clientEmail || '',
        clientPhone: item.clientPhone || '',
        contactId: item.contactId || '',
        category: item.category || '',
        modality: item.modality || '',
        extras: item.extras || '',
        totalPrice: item.totalPrice || 0,
        totalDuration: item.totalDuration || 0,
        date: item.date ? new Date(item.date).toISOString() : '',
        sessionId: item.sessionId || '',
        status: item.status || 'CONFIRMADA',
        notes: item.notes || '',
        serviciosDetail: item.serviciosDetail || ''
      }));

      console.log(`${TAG} ✅ ${citas.length} citas para ${fecha}`);
      return { ok: true, citas };

    } catch (e) {
      console.error(`${TAG} ❌ getExternosCitas:`, e.message);
      return { ok: false, error: safeErr(e), citas: [] };
    }
  }
);

// =====================================================
// 5. CREAR CITA EXTERNO — v1.1.2 MULTISERVICIO
// =====================================================
// v1.1.4: ensureContactInCRM antes de crear session/registro
// =====================================================

export const crearCitaExterno = webMethod(
  Permissions.Anyone,
  async ({ fecha, horaHHmm, servicios, precioTotal, duracionTotal, contactDetails, notas, memberContactId }) => {
    const t0 = Date.now();
    try {
      servicios = servicios || [];
      console.log(`${TAG} 🎯 Crear cita MULTI: ${servicios.length} servicios | ${fecha} ${horaHHmm} | ${precioTotal}€ | ${duracionTotal}min`);

      // ─── 1. Obtener scheduleId del recurso Emy ───
      const firstWixServiceId = servicios[0]?.modalidad?.wixServiceId || '';
      const resource = await getExternoResource(firstWixServiceId);
      if (!resource || !resource.scheduleId) {
        return { ok: false, error: { message: 'No se encontró scheduleId del recurso externo' } };
      }

      // ─── 2. v1.1.4: Garantizar contacto CRM — TODOS LOS CANALES ───
      const finalContactId = await ensureContactInCRM(contactDetails, memberContactId);

      // ─── 3. Construir fechas ───
      const startISO = madridToUTC(fecha, horaHHmm);
      const endISO = new Date(new Date(startISO).getTime() + duracionTotal * 60000).toISOString();

      // ─── 4. Notas para el calendario (multi-servicio) ───
      const svcLines = servicios.map(s => {
        let line = `${s.categoria}: ${s.modalidad?.title || '?'} (${s.modalidad?.price || 0}€/${s.duracion || 0}min)`;
        if (s.extra) line += ` + ${s.extra.title} (${s.extra.price}€)`;
        return line;
      });

      const notesText = [
        ...svcLines,
        `${contactDetails?.firstName || ''} ${contactDetails?.lastName || ''}`.trim(),
        contactDetails?.phone || '',
        `Total: ${precioTotal}€`,
        notas || ''
      ].filter(Boolean).join(' | ');

      // ─── 5. createSession → pinta en calendario Wix ───
      const sessionInfo = {
        scheduleId: resource.scheduleId,
        start: { timestamp: new Date(startISO) },
        end: { timestamp: new Date(endISO) },
        type: 'EVENT',
        tags: ['Blocked'],
        notes: notesText
      };

      console.log(`${TAG} 📅 createSession: schedule=${resource.scheduleId} | ${fecha} ${horaHHmm} | ${duracionTotal}min`);

      const createdSession = await sessions.createSession(sessionInfo, { suppressAuth: true });
      const sessionId = createdSession?._id || createdSession?.id || '';

      console.log(`${TAG} ✅ Session creada: ${sessionId}`);

      // ─── 6. Registrar en CMS SvExternalRecords (multi-servicio) ───
      let registroId = '';
      try {
        const serviciosSummary = servicios.map(s => {
          let line = s.modalidad?.title || s.categoria;
          if (s.extra) line += ` + ${s.extra.title}`;
          return `${line}|${s.subtotal}`;
        }).join(';;');

        const categorias = [...new Set(servicios.map(s => s.categoria))].join('+');

        const registro = {
          title: `${categorias} - ${contactDetails?.firstName || ''} ${contactDetails?.lastName || ''}`.trim(),
          clientName: `${contactDetails?.firstName || ''} ${contactDetails?.lastName || ''}`.trim(),
          clientEmail: contactDetails?.email || '',
          clientPhone: contactDetails?.phone || '',
          contactId: finalContactId || '',  // v1.1.4: contactId garantizado
          category: categorias,
          modality: servicios.map(s => s.modalidad?.title || '').join(' + '),
          extras: servicios.filter(s => s.extra).map(s => `${s.extra.title}|${s.extra.price}`).join(';;') || '',
          totalPrice: precioTotal || 0,
          totalDuration: duracionTotal || 0,
          date: new Date(startISO),
          sessionId,
          status: 'CONFIRMADA',
          notes: notas || '',
          serviciosDetail: serviciosSummary
        };

        const inserted = await wixData.insert(CMS_REGISTRO, registro);
        registroId = inserted?._id || '';
        console.log(`${TAG} ✅ Registro CMS guardado: ${registroId}`);
      } catch (regErr) {
        console.warn(`${TAG} ⚠️ Registro CMS: ${regErr.message}`);
      }

      // ─── 7. Respuesta ───
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(`${TAG} ✅ Cita MULTI creada en ${elapsed}s`);

      return {
        ok: true,
        sessionId,
        registroId,
        contactId: finalContactId,  // v1.1.4: devolver contactId para referencia
        tiempo: elapsed
      };

    } catch (e) {
      console.error(`${TAG} ❌ crearCitaExterno:`, e.message);
      return { ok: false, error: safeErr(e) };
    }
  }
);

// =====================================================
// 6. CONSULTAR SLOTS PARA BLOQUEO (SIN CAMBIOS)
// =====================================================

export const consultarSlotsBloqueo = webMethod(
  Permissions.Anyone,
  async ({ fecha }) => {
    try {
      console.log(`${TAG} 🔒 Slots bloqueo: ${fecha}`);

      const catResult = await wixData.query(CMS_CATALOGO)
        .eq('type', 'MODALIDAD')
        .limit(1)
        .find();

      const sampleServiceId = catResult.items?.[0]?.wixServiceId || '';
      if (!sampleServiceId) {
        return { ok: false, error: { message: 'No hay servicios configurados en el catálogo' }, slots: [] };
      }

      const query = {
        filter: {
          serviceId: [sampleServiceId],
          startDate: `${fecha}T00:00:00.000`,
          endDate: `${fecha}T23:59:59.000`
        },
        timezone: TIMEZONE
      };

      const elevatedQuery = elevate(availabilityCalendar.queryAvailability);
      const availability = await elevatedQuery(query);
      const entries = availability?.availabilityEntries || [];

      const libresSet = new Set();
      entries.forEach(entry => {
        if (entry.bookable) {
          const slot = entry.slot || {};
          if (slot.startDate) {
            const t = formatLocalTime(new Date(slot.startDate));
            libresSet.add(t);
          }
        }
      });

      const startUTC = new Date(new Date(`${fecha}T00:00:00`).getTime() - 3 * 3600000);
      const endUTC = new Date(new Date(`${fecha}T23:59:59`).getTime() + 3 * 3600000);

      const citasResult = await wixData.query(CMS_REGISTRO)
        .ge('date', startUTC)
        .le('date', endUTC)
        .ascending('date')
        .limit(50)
        .find();

      const ocupadosMap = {};
      (citasResult.items || []).forEach(item => {
        if (!item.date) return;
        const d = new Date(item.date);
        const madridDate = d.toLocaleDateString('en-CA', { timeZone: TIMEZONE });
        if (madridDate !== fecha) return;

        const dur = item.totalDuration || 15;
        const startMin = (() => {
          const t = d.toLocaleTimeString('es-ES', { timeZone: TIMEZONE, hour: '2-digit', minute: '2-digit', hour12: false });
          const [h, m] = t.split(':').map(Number);
          return h * 60 + m;
        })();

        const esBloq = (item.status === 'BLOQUEADO') ||
                        (item.notes && item.notes.includes('TRAMO BLOQUEADO')) ||
                        (item.category === 'BLOQUEO');

        for (let m = startMin; m < startMin + dur; m += 15) {
          const hh = String(Math.floor(m / 60)).padStart(2, '0');
          const mm = String(m % 60).padStart(2, '0');
          const key = `${hh}:${mm}`;
          ocupadosMap[key] = {
            label: esBloq ? 'Bloqueado' : (item.clientName || item.modality || 'Cita'),
            isBloqueo: esBloq
          };
        }
      });

      const slots = [];
      for (let h = 10; h < 21; h++) {
        for (let m = 0; m < 60; m += 15) {
          const time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
          const ocup = ocupadosMap[time];
          let status = 'libre';
          let label = '';

          if (ocup) {
            status = ocup.isBloqueo ? 'bloqueado' : 'ocupado';
            label = ocup.label;
          } else if (!libresSet.has(time)) {
            status = 'ocupado';
            label = 'No disponible';
          }

          slots.push({ time, status, label });
        }
      }

      console.log(`${TAG} ✅ Slots bloqueo: ${slots.filter(s => s.status === 'libre').length} libres, ${slots.filter(s => s.status === 'ocupado').length} ocupados, ${slots.filter(s => s.status === 'bloqueado').length} bloqueados`);
      return { ok: true, slots };

    } catch (e) {
      console.error(`${TAG} ❌ consultarSlotsBloqueo:`, e.message);
      return { ok: false, error: safeErr(e), slots: [] };
    }
  }
);

// =====================================================
// 7. CREAR BLOQUEO (SIN CAMBIOS)
// =====================================================

export const crearBloqueoExterno = webMethod(
  Permissions.Anyone,
  async ({ fecha, bloques }) => {
    try {
      bloques = bloques || [];
      console.log(`${TAG} 🔒 Crear bloqueo: ${fecha} | ${bloques.length} bloques`);

      const resource = await getExternoResource('');
      if (!resource || !resource.scheduleId) {
        return { ok: false, error: { message: 'No se encontró scheduleId del recurso' } };
      }

      const resultados = [];

      for (const bloque of bloques) {
        try {
          const startISO = madridToUTC(fecha, bloque.horaInicio);
          const endISO = new Date(new Date(startISO).getTime() + bloque.duracionMin * 60000).toISOString();

          const sessionInfo = {
            scheduleId: resource.scheduleId,
            start: { timestamp: new Date(startISO) },
            end: { timestamp: new Date(endISO) },
            type: 'EVENT',
            tags: ['Blocked'],
            notes: `TRAMO BLOQUEADO NO DISPONIBLE PARA HAIRTIMES | ${bloque.horaInicio} - ${bloque.duracionMin}min`
          };

          const created = await sessions.createSession(sessionInfo, { suppressAuth: true });
          const sessionId = created?._id || created?.id || '';

          const registro = {
            title: `BLOQUEO - ${bloque.horaInicio} (${bloque.duracionMin}min)`,
            clientName: 'BLOQUEO',
            clientEmail: '',
            clientPhone: '',
            contactId: '',
            category: 'BLOQUEO',
            modality: 'No disponible',
            extras: '',
            totalPrice: 0,
            totalDuration: bloque.duracionMin,
            date: new Date(startISO),
            sessionId,
            status: 'BLOQUEADO',
            notes: 'TRAMO BLOQUEADO NO DISPONIBLE PARA HAIRTIMES',
            serviciosDetail: ''
          };

          await wixData.insert(CMS_REGISTRO, registro);
          resultados.push({ horaInicio: bloque.horaInicio, sessionId, ok: true });
          console.log(`${TAG} ✅ Bloque ${bloque.horaInicio} creado: ${sessionId}`);

        } catch (blockErr) {
          console.error(`${TAG} ❌ Bloque ${bloque.horaInicio}:`, blockErr.message);
          resultados.push({ horaInicio: bloque.horaInicio, ok: false, error: blockErr.message });
        }
      }

      return { ok: true, resultados };

    } catch (e) {
      console.error(`${TAG} ❌ crearBloqueoExterno:`, e.message);
      return { ok: false, error: safeErr(e) };
    }
  }
);

// =====================================================
// 8. ELIMINAR BLOQUEO (SIN CAMBIOS)
// =====================================================

export const eliminarBloqueoExterno = webMethod(
  Permissions.Anyone,
  async ({ sessionId, registroId }) => {
    try {
      console.log(`${TAG} 🔓 Eliminar bloqueo: session=${sessionId} | registro=${registroId}`);

      if (sessionId) {
        try {
          await sessions.deleteSession(sessionId, { suppressAuth: true });
          console.log(`${TAG} ✅ Session eliminada: ${sessionId}`);
        } catch (sessErr) {
          console.warn(`${TAG} ⚠️ No se pudo eliminar session: ${sessErr.message}`);
        }
      }

      if (registroId) {
        try {
          await wixData.remove(CMS_REGISTRO, registroId);
          console.log(`${TAG} ✅ Registro CMS eliminado: ${registroId}`);
        } catch (regErr) {
          console.warn(`${TAG} ⚠️ No se pudo eliminar registro: ${regErr.message}`);
        }
      }

      return { ok: true };

    } catch (e) {
      console.error(`${TAG} ❌ eliminarBloqueoExterno:`, e.message);
      return { ok: false, error: safeErr(e) };
    }
  }
);

// =====================================================
// 9. MARCAR PAGADO EXTERNO (v1.1.3 — SIN CAMBIOS)
// =====================================================

export const marcarPagadoExterno = webMethod(
  Permissions.Anyone,
  async ({ registroId, metodoPago }) => {
    try {
      console.log(`${TAG} 💳 marcarPagadoExterno: ${registroId} | ${metodoPago}`);

      if (!registroId) {
        return { ok: false, error: { message: 'Falta registroId' } };
      }

      let registro;
      try {
        registro = await wixData.get(CMS_REGISTRO, registroId);
      } catch (e) {
        return { ok: false, error: { message: `Registro no encontrado: ${registroId}` } };
      }

      if (!registro) {
        return { ok: false, error: { message: `Registro no encontrado: ${registroId}` } };
      }

      if (registro.status === 'PAGADO') {
        console.warn(`${TAG} ⚠️ Ya estaba PAGADO: ${registroId}`);
        return { ok: true, yaEstabaPagado: true };
      }

      registro.status = 'PAGADO';
      await wixData.update(CMS_REGISTRO, registro);
      console.log(`${TAG} ✅ SvExternalRecords → PAGADO`);

      try {
        const ahora = new Date();
        const bookingIdKey = `EXT_${registroId}`;

        let descripcion = '';
        if (registro.serviciosDetail) {
          descripcion = registro.serviciosDetail.split(';;').filter(Boolean).map(s => {
            const [name, price] = s.split('|');
            return `${name || '?'} (${price || 0}€)`;
          }).join(', ');
        } else {
          descripcion = registro.modality || registro.category || 'Servicio externo';
          if (registro.totalPrice) descripcion += ` (${registro.totalPrice}€)`;
        }

        const existente = await wixData.query(CMS_PAGOS_EXTERNOS)
          .eq('bookingId', bookingIdKey)
          .limit(1)
          .find();

        if (existente.items.length > 0) {
          console.warn(`${TAG} ⚠️ PagoreservasExternos ya tiene: ${bookingIdKey}`);
        } else {
          const registroPago = {
            bookingId: bookingIdKey,
            descripcion: descripcion,
            fechaPago: ahora,
            fechaReserva: registro.date || ahora,
            importeTotal: registro.totalPrice || 0,
            nombreCliente: registro.clientName || 'Cliente externo',
            staff: 'Emy',
            tipoPago: metodoPago || 'Efectivo'
          };

          await wixData.insert(CMS_PAGOS_EXTERNOS, registroPago);
          console.log(`${TAG} ✅ PagoreservasExternos insertado: ${bookingIdKey} | ${registroPago.importeTotal}€ | ${metodoPago}`);
        }

      } catch (payErr) {
        console.warn(`${TAG} ⚠️ Error PagoreservasExternos: ${payErr.message}`);
      }

      return { ok: true, registroId, metodoPago };

    } catch (e) {
      console.error(`${TAG} ❌ marcarPagadoExterno:`, e.message);
      return { ok: false, error: { message: e.message } };
    }
  }
);

// =====================================================
// 10. GUARDAR ITEM CATÁLOGO (v1.1.5 — NUEVO)
// =====================================================
// Insert o Update en SvExternos (colección catálogo)
// Si item._id existe → update
// Si item._id no existe → insert
// Campos: title, type, category, price, durationMin, order,
//         wixServiceId, pricePerUnit, requiresBase, appliesTo
// =====================================================

export const saveExternoItem = webMethod(
  Permissions.Anyone,
  async ({ item }) => {
    try {
      console.log(`${TAG} 💾 saveExternoItem: ${item?._id ? 'UPDATE' : 'INSERT'} | ${item?.title || '?'}`);

      if (!item || !item.title || !item.type) {
        return { ok: false, error: { message: 'Faltan campos obligatorios: title, type' } };
      }

      const validTypes = ['CATEGORIA', 'MODALIDAD', 'EXTRA'];
      if (!validTypes.includes(item.type)) {
        return { ok: false, error: { message: `type debe ser: ${validTypes.join(', ')}` } };
      }

      // Construir objeto CMS con solo campos válidos
      const record = {
        title: String(item.title || '').trim(),
        type: String(item.type || '').trim(),
        category: String(item.category || '').trim(),
        price: parseFloat(item.price) || 0,
        durationMin: parseInt(item.durationMin, 10) || 0,
        order: parseInt(item.order, 10) || 0,
        wixServiceId: String(item.wixServiceId || '').trim(),
        pricePerUnit: Boolean(item.pricePerUnit),
        requiresBase: Boolean(item.requiresBase),
        appliesTo: String(item.appliesTo || '').trim(),
        active: item.active !== false  // default true si no se envía
      };

      let saved;
      if (item._id) {
        // UPDATE: mantener _id
        record._id = item._id;
        saved = await wixData.update(CMS_CATALOGO, record, { suppressAuth: true });
        console.log(`${TAG} ✅ Item actualizado: ${saved._id}`);
      } else {
        // INSERT
        saved = await wixData.insert(CMS_CATALOGO, record, { suppressAuth: true });
        console.log(`${TAG} ✅ Item insertado: ${saved._id}`);
      }

      return {
        ok: true,
        item: {
          _id: saved._id,
          title: saved.title || '',
          type: saved.type || '',
          category: saved.category || '',
          price: saved.price || 0,
          durationMin: saved.durationMin || 0,
          pricePerUnit: saved.pricePerUnit || false,
          requiresBase: saved.requiresBase || false,
          appliesTo: saved.appliesTo || '',
          active: saved.active !== false,
          order: saved.order || 0,
          wixServiceId: saved.wixServiceId || ''
        }
      };

    } catch (e) {
      console.error(`${TAG} ❌ saveExternoItem:`, e.message);
      return { ok: false, error: safeErr(e) };
    }
  }
);

// =====================================================
// 11. ELIMINAR ITEM CATÁLOGO (v1.1.5 — NUEVO)
// =====================================================
// Elimina un registro de SvExternos por _id
// NO elimina servicios de Wix Bookings (solo catálogo CMS)
// =====================================================

export const deleteExternoItem = webMethod(
  Permissions.Anyone,
  async ({ itemId }) => {
    try {
      console.log(`${TAG} 🗑️ deleteExternoItem: ${itemId}`);

      if (!itemId) {
        return { ok: false, error: { message: 'Falta itemId' } };
      }

      // Verificar que existe antes de borrar
      const existing = await wixData.get(CMS_CATALOGO, itemId, { suppressAuth: true });
      if (!existing) {
        return { ok: false, error: { message: `Item no encontrado: ${itemId}` } };
      }

      await wixData.remove(CMS_CATALOGO, itemId, { suppressAuth: true });
      console.log(`${TAG} ✅ Item eliminado: ${itemId} (${existing.title})`);

      return { ok: true, itemId, deletedTitle: existing.title || '' };

    } catch (e) {
      console.error(`${TAG} ❌ deleteExternoItem:`, e.message);
      return { ok: false, error: safeErr(e) };
    }
  }
);