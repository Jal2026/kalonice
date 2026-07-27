// =====================================================
// KAMISUITE - Backend Vista Calendario
// =====================================================
// VERSION: 1.3.2
// FECHA: 30 de abril de 2026
//
// CAMBIOS v1.3.2:
// - getCalendarioSettings y saveCalendarioSettings aceptan parámetro
//   opcional { source }. Si source='mobile', usa clave 'mobile' en
//   CMS en vez de 'default'. Escritorio sigue usando 'default' sin
//   cambios. Evita que móvil sobreescriba orden de columnas del escritorio.
//
// CAMBIOS v1.3.1:
// - FIX: crearExtension() acepta parámetro notes opcional.
//   Si se pasa, lo usa en vez del hardcoded 'EXTENSIÓN: bookingId'.
//   Sin cambios en el resto. Extensiones existentes siguen funcionando.
//
// CAMBIOS v1.3.0:
// - NEW: crearExtension() — crea session bloqueada tipo EXTENSIÓN
//   después de un booking para ampliar su duración visual
// - NEW: eliminarExtension() — elimina session de extensión
// - NEW: helper madridToUTC() para construir timestamps
//
// CAMBIOS v1.2.0:
// - NEW: Precio del catálogo incluido en cada reserva
//
// CAMBIOS v1.1.0:
// - NEW: Bloqueos (sessions con tag 'Blocked') incluidos en respuesta
// - NEW: Settings guardados en CMS (colección CalendarioVistaSettings)
//
// FUNCIONES:
//   - getStaffResources()  → lista de recursos/empleados activos
//   - getTodasReservasDia({ fecha, staffScheduleMap }) → bookings + bloqueos
//   - getCalendarioSettings() → lee settings de CMS
//   - saveCalendarioSettings({ settings }) → guarda settings en CMS
//   - crearExtension({ fecha, horaInicio, duracionMin, scheduleId, bookingId, notes }) → session bloqueada
//   - eliminarExtension({ sessionId }) → elimina session
//
// CMS REQUERIDO:
//   Colección: CalendarioVistaSettings
//   Campos: title (texto), settingsJson (texto)
//
// ARCHIVO: backend/calendarioVista.web.js
// =====================================================

import { webMethod, Permissions } from 'wix-web-module';
import { elevate } from 'wix-auth';
import { extendedBookings, services } from 'wix-bookings.v2';
import { sessions, resources as resourcesBackend } from 'wix-bookings-backend';
import wixData from 'wix-data';

const VERSION = '1.3.2';
const TAG = `[CalVista][${VERSION}]`;

const CMS_SETTINGS = 'CalendarViewSettings';
const CMS_STAFF_CONFIG = 'StaffConfig';
const SETTINGS_KEY = 'default';

// Excluir de la lista de personal (patrón cancelacionReservas / coloracionLogic)
const STAFF_BLOCKLIST_NAMES = new Set(['PROCESO', 'BUSINESS']);

function normalizeStaffLabel(label) {
  return String(label || '').trim();
}

function isBlockedStaffLabel(label) {
  const up = normalizeStaffLabel(label).toUpperCase();
  return STAFF_BLOCKLIST_NAMES.has(up);
}

// =====================================================
// UTILIDADES
// =====================================================

function formatLocalTime(date) {
  const year = date.getUTCFullYear();
  const marchLast = new Date(Date.UTC(year, 2, 31));
  const marchSun = 31 - marchLast.getUTCDay();
  const cestStart = Date.UTC(year, 2, marchSun, 1, 0, 0);
  const octLast = new Date(Date.UTC(year, 9, 31));
  const octSun = 31 - octLast.getUTCDay();
  const cestEnd = Date.UTC(year, 9, octSun, 1, 0, 0);

  const ts = date.getTime();
  const offsetHours = (ts >= cestStart && ts < cestEnd) ? 2 : 1;

  const local = new Date(ts + offsetHours * 3600000);
  const hh = String(local.getUTCHours()).padStart(2, '0');
  const mm = String(local.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function safeErr(e) {
  return { message: e?.message || String(e) };
}

// v1.3.0: Conversión Madrid hora local → UTC (patrón de externosLogic.web.js)
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

// Patrón de Tienda Productos widget
function convertWixImageUrl(wixUrl) {
  if (!wixUrl) return '';
  if (typeof wixUrl !== 'string') return '';
  if (!wixUrl.startsWith('wix:image://')) return wixUrl;
  try {
    const match = wixUrl.match(/wix:image:\/\/v1\/([^\/]+)/);
    if (match && match[1]) return 'https://static.wixstatic.com/media/' + match[1];
  } catch (e) {}
  return '';
}

// =====================================================
// v1.2.0: PRECIO DEL CATÁLOGO
// Patrón idéntico a testCheckout.web.js
// =====================================================

async function obtenerPrecioServicio(serviceId) {
  try {
    if (!serviceId) return 0;
    const elevatedGet = elevate(services.getService);
    const srv = await elevatedGet(serviceId);
    const rateType = srv?.payment?.rateType || '';
    if (rateType === 'FIXED') {
      return parseFloat(srv?.payment?.fixed?.price?.value || 0) || 0;
    }
    if (rateType === 'VARIED') {
      return parseFloat(srv?.payment?.varied?.defaultPrice?.value || 0) || 0;
    }
    return 0;
  } catch (e) {
    console.warn(`${TAG} ⚠️ Error precio ${serviceId}: ${e.message}`);
    return 0;
  }
}

// =====================================================
// 1. OBTENER RECURSOS / STAFF
// =====================================================

export const getStaffResources = webMethod(
  Permissions.Anyone,
  async () => {
    try {
      console.log(`${TAG} 👥 getStaffResources`);

      // 1. Recursos de Wix Bookings (patrón cancelacionReservas / coloracionLogic)
      const res = await resourcesBackend.queryResourceCatalog().find();
      const items = res?.items || [];

      // 2. Datos desde StaffConfig (field IDs confirmados: wixResourceId, profileImage, isExternal)
      let staffInfoMap = {}; // resourceId → { photo, isExternal }
      try {
        const scResult = await wixData.query(CMS_STAFF_CONFIG)
          .limit(50)
          .find({ suppressAuth: true });
        const scItems = scResult?.items || [];
        for (const sc of scItems) {
          const resId = sc.wixResourceId || '';
          if (resId) {
            staffInfoMap[resId] = {
              photo: convertWixImageUrl(sc.profileImage || ''),
              isExternal: sc.isExternal === true
            };
          }
        }
        console.log(`${TAG} 📸 StaffConfig: ${scItems.length} registros`);
      } catch (scErr) {
        console.warn(`${TAG} ⚠️ Error leyendo StaffConfig:`, scErr.message);
      }

      // 3. Combinar

      const staff = [];
      for (const it of items) {
        const r = it?.resource || it?.resourceInfo || null;
        if (!r) continue;

        const id = r._id || r.id || null;
        if (!id) continue;

        const name = normalizeStaffLabel(r.name || r.displayName || r.title || '');
        if (!name) continue;

        // Filtrar PROCESO y business
        if (isBlockedStaffLabel(name)) continue;

        const tags = Array.isArray(r.tags) ? r.tags : [];

        // scheduleId — patrón de externosLogic.web.js
        const scheduleId = r.scheduleIds?.[0]
          || r.eventsSchedule?._id
          || it.scheduleId
          || it?.schedules?.[0]?._id
          || '';

        staff.push({
          id,
          name,
          tags,
          scheduleId,
          profileImage: staffInfoMap[id]?.photo || '',
          isExternal: staffInfoMap[id]?.isExternal || false
        });
      }

      console.log(`${TAG} ✅ ${staff.length} recursos (excluidos PROCESO/business)`);
      return { ok: true, staff, version: VERSION };

    } catch (e) {
      console.error(`${TAG} ❌ getStaffResources:`, e.message);
      return { ok: false, error: safeErr(e), staff: [] };
    }
  }
);

// =====================================================
// 2. OBTENER TODAS LAS RESERVAS + BLOQUEOS DEL DÍA
// =====================================================

export const getTodasReservasDia = webMethod(
  Permissions.Anyone,
  async ({ fecha, staffScheduleMap, externalResourceIds }) => {
    const t0 = Date.now();
    try {
      console.log(`${TAG} 📅 getTodasReservasDia: ${fecha}`);

      if (!fecha) throw new Error('fecha requerida (YYYY-MM-DD)');

      const startOfDay = `${fecha}T00:00:00.000Z`;
      const endOfDay = `${fecha}T23:59:59.999Z`;
      const extSet = new Set(externalResourceIds || []);

      // ─── A) BOOKINGS (queryExtendedBookings) ───
      const elevatedQuery = elevate(extendedBookings.queryExtendedBookings);

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
          sort: [{ fieldName: "startDate", order: "ASC" }],
          paging: { limit: pageSize, offset }
        });

        const items = result?.extendedBookings || [];
        allBookings = allBookings.concat(items);
        hasMore = items.length === pageSize;
        offset += pageSize;
      }

      console.log(`${TAG} 📋 Bookings raw: ${allBookings.length}`);

      // Mapear bookings
      const reservas = [];

      for (const item of allBookings) {
        const booking = item.booking || item;
        const status = booking?.status || item?.status || 'UNKNOWN';

        if (status !== 'CONFIRMED' && status !== 'PENDING') continue;

        const slot = booking?.bookedEntity?.slot;
        const rawStart = slot?.startDate || booking?.startDate;
        const rawEnd = slot?.endDate || booking?.endDate;

        if (!rawStart) continue;

        const startDate = new Date(rawStart);
        const endDate = rawEnd ? new Date(rawEnd) : null;

        const startHHmm = formatLocalTime(startDate);
        const endHHmm = endDate ? formatLocalTime(endDate) : '??:??';

        const durMin = endDate
          ? Math.round((endDate.getTime() - startDate.getTime()) / 60000)
          : 0;

        const serviceName = booking?.bookedEntity?.title
          || slot?.serviceName
          || 'Sin nombre';

        const contact = booking?.contactDetails || item?.contactDetails || {};
        const clientName = `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || 'Sin cliente';
        const clientPhone = contact.phone || '';
        const clientEmail = contact.email || '';

        const resourceId = slot?.resource?.id
          || slot?.resource?._id
          || '';

        // v1.2.0: Extraer serviceId para consultar precio
        const serviceId = slot?.serviceId
          || booking?.bookedEntity?.slot?.serviceId
          || '';

        const notes = booking?.additionalFields?.notes
          || booking?.notes
          || item?.notes
          || '';

        const bookingId = booking?._id || item?._id || '';

        const location = slot?.location?.name
          || booking?.bookedEntity?.location?.name
          || '';

        reservas.push({
          bookingId,
          startTime: startHHmm,
          endTime: endHHmm,
          durMin,
          servicio: serviceName,
          cliente: clientName,
          clientPhone,
          clientEmail,
          resourceId,
          status,
          notes,
          location,
          tipo: 'booking',
          serviceId,  // v1.2.0: para mapeo de precios
          precio: 0   // v1.2.0: se rellenará después
        });
      }

      // ─── v1.2.0: BATCH FETCH PRECIOS ───
      const serviceIdsUnicos = [...new Set(
        reservas.map(r => r.serviceId).filter(id => id)
      )];

      if (serviceIdsUnicos.length > 0) {
        console.log(`${TAG} 💰 Consultando precios de ${serviceIdsUnicos.length} servicios únicos...`);
        const precioPromises = serviceIdsUnicos.map(id => obtenerPrecioServicio(id));
        const precioResults = await Promise.all(precioPromises);

        const mapaPrecios = {};
        serviceIdsUnicos.forEach((id, i) => { mapaPrecios[id] = precioResults[i]; });

        for (const r of reservas) {
          if (r.serviceId && mapaPrecios[r.serviceId] !== undefined) {
            r.precio = mapaPrecios[r.serviceId];
          }
        }
        console.log(`${TAG} 💰 Precios asignados`);
      }

      // ─── B) SESSIONS BLOQUEADAS → clasificar externo vs bloqueo real ───
      const bloqueos = [];

      if (staffScheduleMap && Object.keys(staffScheduleMap).length > 0) {
        try {
          const scheduleIds = Object.keys(staffScheduleMap);
          console.log(`${TAG} 🔒 Consultando sessions: ${scheduleIds.length} schedules | externos: ${extSet.size}`);

          // querySessions() — API V1 wix-bookings-backend
          const sessResult = await sessions.querySessions()
            .hasSome("scheduleId", scheduleIds)
            .ge("end.timestamp", startOfDay)
            .lt("start.timestamp", endOfDay)
            .hasSome("tags", ["Blocked"])
            .limit(200)
            .find({ suppressAuth: true });

          const sessItems = sessResult?.items || [];
          console.log(`${TAG} 🔒 Sessions encontradas: ${sessItems.length}`);

          for (const sess of sessItems) {
            const rawStart = sess?.start?.timestamp;
            const rawEnd = sess?.end?.timestamp;
            if (!rawStart) continue;

            const startDate = new Date(rawStart);
            const endDate = rawEnd ? new Date(rawEnd) : null;

            const startHHmm = formatLocalTime(startDate);
            const endHHmm = endDate ? formatLocalTime(endDate) : '??:??';
            const durMin = endDate
              ? Math.round((endDate.getTime() - startDate.getTime()) / 60000)
              : 0;

            const schedId = sess?.scheduleId || '';
            const resourceId = staffScheduleMap[schedId] || '';
            const notes = sess?.notes || '';
            const isExternal = extSet.has(resourceId);

            if (isExternal) {
              // ─── SERVICIO EXTERNO: parsear notas ───
              const parts = notes.split('|').map(p => p.trim());
              let servicio = 'Servicios Externos';
              let cliente = '';
              let clientPhone = '';

              const svcParts = [];
              for (const part of parts) {
                if (part.match(/^[A-ZÁÉÍÓÚÑ]+:/)) {
                  const colonIdx = part.indexOf(':');
                  svcParts.push(part.substring(colonIdx + 1).trim().split('(')[0].trim());
                } else if (part.match(/^\d{6,}/)) {
                  clientPhone = part;
                } else if (part.startsWith('Total:') || part.startsWith('HORA MANUAL') || part.startsWith('TRAMO BLOQUEADO')) {
                  // Ignorar
                } else if (part.length > 1 && !part.includes('€')) {
                  if (!cliente) cliente = part;
                }
              }

              if (svcParts.length > 0) servicio = svcParts.join(' + ');

              bloqueos.push({
                bookingId: sess?._id || '',
                startTime: startHHmm,
                endTime: endHHmm,
                durMin,
                servicio,
                cliente: cliente || 'Servicios Externos',
                clientPhone,
                clientEmail: '',
                resourceId,
                status: 'EXTERNO',
                notes,
                location: '',
                tipo: 'externo',
                precio: 0
              });

            } else {
              // ─── BLOQUEO REAL (día libre, extensión, etc.) ───
              // v1.3.0: Detectar si es extensión
              const isExtension = notes.startsWith('EXTENSIÓN:');

              bloqueos.push({
                bookingId: sess?._id || '',
                startTime: startHHmm,
                endTime: endHHmm,
                durMin,
                servicio: isExtension ? 'EXTENSIÓN' : 'Bloqueado',
                cliente: isExtension ? notes.replace('EXTENSIÓN:', '').trim() : (notes || 'Bloqueado'),
                clientPhone: '',
                clientEmail: '',
                resourceId,
                status: 'BLOCKED',
                notes,
                location: '',
                tipo: isExtension ? 'extension' : 'bloqueo',
                precio: 0
              });
            }
          }
        } catch (sessErr) {
          console.error(`${TAG} ⚠️ Error sessions bloqueadas:`, sessErr.message);
        }
      } else {
        console.log(`${TAG} ⚠️ Sin staffScheduleMap — bloqueos no consultados`);
      }

      // ─── C) COMBINAR Y ORDENAR ───
      const todo = [...reservas, ...bloqueos];
      todo.sort((a, b) => a.startTime.localeCompare(b.startTime));

      const elapsed = ((Date.now() - t0) / 1000).toFixed(2);
      console.log(`${TAG} ✅ ${reservas.length} reservas + ${bloqueos.length} bloqueos | ${elapsed}s`);

      return {
        ok: true,
        version: VERSION,
        fecha,
        reservas: todo,
        total: todo.length,
        totalBookings: reservas.length,
        totalBloqueos: bloqueos.length,
        tiempo: elapsed
      };

    } catch (e) {
      console.error(`${TAG} ❌ getTodasReservasDia:`, e.message);
      return {
        ok: false,
        version: VERSION,
        error: safeErr(e),
        reservas: [],
        total: 0
      };
    }
  }
);

// =====================================================
// 3. SETTINGS — LEER DE CMS
// =====================================================

export const getCalendarioSettings = webMethod(
  Permissions.Anyone,
  async ({ source } = {}) => {
    try {
      const key = source || SETTINGS_KEY;
      console.log(`${TAG} ⚙️ getCalendarioSettings (key=${key})`);

      const result = await wixData.query(CMS_SETTINGS)
        .eq('title', key)
        .limit(1)
        .find({ suppressAuth: true });

      const item = result?.items?.[0];
      if (!item || !item.settingsJson) {
        console.log(`${TAG} ⚙️ Sin settings guardados — devolviendo null`);
        return { ok: true, settings: null };
      }

      const settings = JSON.parse(item.settingsJson);
      console.log(`${TAG} ✅ Settings cargados`);
      return { ok: true, settings, _id: item._id };

    } catch (e) {
      console.error(`${TAG} ❌ getCalendarioSettings:`, e.message);
      return { ok: false, error: safeErr(e), settings: null };
    }
  }
);

// =====================================================
// 4. SETTINGS — GUARDAR EN CMS
// =====================================================

export const saveCalendarioSettings = webMethod(
  Permissions.Anyone,
  async ({ settings, source }) => {
    try {
      const key = source || SETTINGS_KEY;
      console.log(`${TAG} 💾 saveCalendarioSettings (key=${key})`);

      const settingsJson = JSON.stringify(settings);

      // Buscar si ya existe
      const existing = await wixData.query(CMS_SETTINGS)
        .eq('title', key)
        .limit(1)
        .find({ suppressAuth: true });

      const item = existing?.items?.[0];

      if (item) {
        item.settingsJson = settingsJson;
        await wixData.update(CMS_SETTINGS, item, { suppressAuth: true });
        console.log(`${TAG} ✅ Settings actualizados (key=${key})`);
      } else {
        await wixData.insert(CMS_SETTINGS, {
          title: key,
          settingsJson
        }, { suppressAuth: true });
        console.log(`${TAG} ✅ Settings creados (key=${key})`);
      }

      return { ok: true };

    } catch (e) {
      console.error(`${TAG} ❌ saveCalendarioSettings:`, e.message);
      return { ok: false, error: safeErr(e) };
    }
  }
);

// =====================================================
// 5. CREAR EXTENSIÓN (v1.3.0, fix v1.3.1)
// =====================================================
// Crea una session bloqueada justo después de un booking
// para ampliar visualmente su duración.
// v1.3.1: notes es parámetro opcional. Si se pasa, lo usa.
//         Si no, usa el formato original "EXTENSIÓN: bookingId".
// =====================================================

export const crearExtension = webMethod(
  Permissions.Anyone,
  async ({ fecha, horaInicio, duracionMin, scheduleId, bookingId, notes }) => {
    try {
      console.log(`${TAG} ➕ crearExtension: ${fecha} ${horaInicio} +${duracionMin}min | schedule=${scheduleId} | booking=${bookingId} | notes=${notes || '(auto)'}`);

      if (!fecha || !horaInicio || !duracionMin || !scheduleId) {
        return { ok: false, error: { message: 'Faltan parámetros (fecha, horaInicio, duracionMin, scheduleId)' } };
      }

      const startISO = madridToUTC(fecha, horaInicio);
      const endISO = new Date(new Date(startISO).getTime() + duracionMin * 60000).toISOString();

      const sessionInfo = {
        scheduleId,
        start: { timestamp: new Date(startISO) },
        end: { timestamp: new Date(endISO) },
        type: 'EVENT',
        tags: ['Blocked'],
        notes: notes || `EXTENSIÓN: ${bookingId}`
      };

      const created = await sessions.createSession(sessionInfo, { suppressAuth: true });
      const sessionId = created?._id || created?.id || '';

      console.log(`${TAG} ✅ Extensión creada: ${sessionId} | ${horaInicio} +${duracionMin}min`);

      return { ok: true, sessionId };

    } catch (e) {
      console.error(`${TAG} ❌ crearExtension:`, e.message);
      return { ok: false, error: safeErr(e) };
    }
  }
);

// =====================================================
// 6. ELIMINAR EXTENSIÓN (v1.3.0)
// =====================================================

export const eliminarExtension = webMethod(
  Permissions.Anyone,
  async ({ sessionId }) => {
    try {
      console.log(`${TAG} ➖ eliminarExtension: ${sessionId}`);

      if (!sessionId) {
        return { ok: false, error: { message: 'sessionId requerido' } };
      }

      await sessions.deleteSession(sessionId, { suppressAuth: true });
      console.log(`${TAG} ✅ Extensión eliminada: ${sessionId}`);

      return { ok: true };

    } catch (e) {
      console.error(`${TAG} ❌ eliminarExtension:`, e.message);
      return { ok: false, error: safeErr(e) };
    }
  }
);