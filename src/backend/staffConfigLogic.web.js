// =====================================================
// KAMISUITE - Backend: Gestión de Personal (Staff Config)
// =====================================================
// VERSION: 1.3.5
// FECHA: 6 de julio de 2026
//
// ARCHIVO: backend/staffConfigLogic.web.js
//
// DESCRIPCIÓN:
//   Gestión completa del personal del salón desde KAMISUITE,
//   sin necesidad de acceder al Wix Panel.
//   Cubre staff interno (Raquel, Ricardo, Angela) y
//   staff externo en calidad de servicio (Emy y futuros).
//
// FUNCIONES EXPORTADAS:
//   - inicializarStaffDesdeWix()      → utilidad onboarding: auto-poblar StaffConfig
//   - getStaffCompleto()              → leer todos los perfiles enriquecidos
//   - getStaffHorario(staffConfigId)  → leer sesiones WORKING_HOURS actuales
//   - updateStaffDatosBasicos(...)    → actualizar nombre/email/tel + config local
//                                       Si active cambia: crea/elimina Wix Resource
//   - updateStaffHorario(...)         → reemplazar horario semanal completo
//   - updateStaffFoto(...)            → subir foto via mediaManager → StaffConfig.profileImage
//   - updateStaffExterno(...)         → comisión y estado activo de externos
//   - crearStaffMember(...)           → crear nuevo recurso Wix + registro StaffConfig
//   - eliminarStaffMember(...)        → comprueba bookings futuros, si no hay borra Wix + CMS
//   - getWixResourceIdByCanonical(...)→ helper para externosLogic
//
// CMS REQUERIDA:
//   StaffConfig — field IDs exactos:
//     wixResourceId         (Text)
//     wixScheduleId         (Text)
//     canonicalName         (Text)
//     displayName           (Text)
//     isExternal            (Boolean)
//     externalModule        (Text)
//     locationId            (Text)
//     locationName          (Text)
//     active                (Boolean)
//     commissionPercentage  (Number)
//     workingHoursSessionIds (Text)   ← JSON array
//     notes                 (Text)
//     profileImage          (Text)    ← URL wix:image:// o https://
//
// CHANGELOG:
//   v1.3.5 - 06/07/2026 - 🚫 BLOQUEOS Y CIERRES MIGRADOS A KamisuiteReservations (V2).
//                         ANTES: crearStaffBloqueo y crearCierreSalon escribían en
//                         Wix Bookings (sessions.createSession, tags:['Blocked']).
//                         Recepción PRO V2 lee bloqueos desde KamisuiteReservations
//                         (family:'BLOQUEO'), NO desde Wix Bookings → los bloqueos
//                         creados por este backend NO se veían en V2 (sí en V1).
//                         AHORA: ambas funciones delegan en crearBloqueo() de
//                         recepcionProLogic.web (patrón ya probado y desplegado,
//                         mismo import cruzado que usa clienteAreaLogic.web).
//                         La fila BLOQUEO en KamisuiteReservations es visible en
//                         Recepción V2 con su bloque visual, y el motor de huecos
//                         público la respeta (ocupa:true, status:'CONFIRMADA').
//                         + RANGO DE FECHAS: fechaFin opcional. Sin fechaFin =
//                         un solo día (compat). Con fechaFin = itera cada día del
//                         rango y bloquea el DÍA COMPLETO según el horario laboral
//                         de cada empleado (leerHorarioStaffEnDia, patrón literal
//                         de widgetPublicoLogic). Días que el empleado libra se
//                         omiten (no hay nada que bloquear).
//                         NOTA: getStaffBloqueos / eliminarStaffBloqueo /
//                         getCierresSalon / eliminarCierreSalon SIGUEN leyendo/
//                         borrando de Wix Bookings — pendiente migrarlas también a
//                         KamisuiteReservations en próxima sesión (fuera de alcance).
//   v1.3.4 - 06/07/2026 - +accessLevel (Number 1-4) en getStaffCompleto (map),
//                         updateStaffDatosBasicos (propagación READ-MERGE-UPDATE)
//                         y crearStaffMember (opcional, solo si se envía).
//                         Cierra el circuito que ya consume Recepción PRO V2
//                         (widget v1.1.61 línea 6140 → ReceptionAccessLog.accessLevel).
//                         Puramente aditivo, resto del backend intacto.
//   v1.2.1 - 13/03/2026 - FIX: scheduleId path en createResource (created.scheduleIds[0])
//   v1.2.0 - 13/03/2026 - getStaffHorario parsea sesiones Wix a [{dia,inicio,fin}],
//                          isExternal editable desde tab Datos (solo StaffConfig, no Wix)
//   v1.1.0 - 13/03/2026 - uploadImage via mediaManager, wix:image→publicUrl,
//                          enWix flag, active toggle crea/borra Wix Resource,
//                          eliminarStaffMember con comprobación bookings futuros,
//                          sin botón Sincronizar en widget
//   v1.0.2 - 13/03/2026 - FIX: foto lee/escribe StaffConfig.profileImage
//   v1.0.1 - 13/03/2026 - FIX: suppressAuth en todas las operaciones wixData
//   v1.0.0 - 13/03/2026 - Versión inicial
// =====================================================

import { Permissions, webMethod } from 'wix-web-module';
import { elevate } from 'wix-auth';
import { resources as resourcesApi, sessions, bookings } from 'wix-bookings-backend';
import wixData from 'wix-data';
import { mediaManager } from 'wix-media-backend';
// v1.3.5 — Bloqueos y cierres V2: se escriben en KamisuiteReservations vía la
// función ya probada de recepcionProLogic. Mismo patrón de import cruzado
// backend→backend que usa clienteAreaLogic.web (import { cancelarReserva }
// from 'backend/recepcionProLogic.web'). Sin dependencia circular:
// recepcionProLogic NO importa nada de staffConfigLogic.
import { crearBloqueo as crearBloqueoV2 } from 'backend/recepcionProLogic.web';

const VERSION = '1.3.5';
const TAG = `[StaffConfig][${VERSION}]`;

// ─── CMS ───────────────────────────────────────────
const CMS_STAFF            = 'StaffConfig';
const CMS_EXTERNAL_SERVICES = 'ExternalServices';

// Tags de Wix Bookings — NO modificar
const TAG_STAFF    = 'staff';
const TAG_BUSINESS = 'business';

// Recursos internos que el widget NO debe mostrar al usuario
const CANONICAL_HIDDEN = ['CUALQUIERA', 'PROCESO'];

// Días de la semana para RRULE
const RRULE_DAYS = {
  lunes:     'MO',
  martes:    'TU',
  miercoles: 'WE',
  jueves:    'TH',
  viernes:   'FR',
  sabado:    'SA',
  domingo:   'SU'
};

// =====================================================
// HELPERS
// =====================================================

function safeErr(e) {
  return { message: e?.message || String(e) };
}

/**
 * Convierte wix:image://v1/<hash>/... a URL pública https://static.wixstatic.com/media/<hash>
 * Si ya es https:// la devuelve tal cual.
 */
function wixImageToPublicUrl(wixUrl) {
  if (!wixUrl || typeof wixUrl !== 'string') return null;
  if (wixUrl.startsWith('wix:image://')) {
    try {
      const match = wixUrl.match(/wix:image:\/\/v1\/([^/]+)/);
      if (match && match[1]) return `https://static.wixstatic.com/media/${match[1]}`;
    } catch (_) {}
    return null;
  }
  return wixUrl; // ya es URL pública
}

/**
 * Construye un Date para la primera ocurrencia de un día de la semana
 * a una hora determinada, partiendo de "esta semana" en Madrid.
 */
function buildFirstOccurrence(rruleDay, horaHHmm) {
  const dayIndexMap = { MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6, SU: 0 };
  const targetDay = dayIndexMap[rruleDay];
  const [hh, mm] = horaHHmm.split(':').map(Number);

  const now = new Date();
  const current = now.getDay();
  let daysAhead = targetDay - current;
  if (daysAhead < 0) daysAhead += 7;

  const target = new Date(now);
  target.setDate(now.getDate() + daysAhead);
  target.setHours(hh, mm, 0, 0);
  return target;
}

/**
 * Lee todas las sesiones WORKING_HOURS de un scheduleId.
 * Devuelve los objetos completos de sesión.
 */
async function queryWorkingHoursSessions(scheduleId) {
  try {
    const elevatedQuery = elevate(sessions.querySessions);
    // Para sesiones recurrentes (WORKING_HOURS) hay que usar query builder
    // con .ne("recurrence", null) y .eq("scheduleId", id)
    const result = await elevatedQuery()
      .eq('scheduleId', scheduleId)
      .ne('recurrence', null)
      .find({ suppressAuth: true });
    return result?.items || [];
  } catch (e) {
    console.warn(`${TAG} ⚠️ querySessions no disponible: ${e.message}`);
    return [];
  }
}

/**
 * Parsea sesiones WORKING_HOURS a tramos legibles por el widget.
 * Extrae día de la semana del RRULE (BYDAY=MO → 'lunes')
 * y horas de los timestamps start/end.
 * Devuelve [{ dia, inicio, fin }]
 */
function parsearSesionesAHorario(sesiones) {
  const RRULE_TO_DIA = { MO:'lunes', TU:'martes', WE:'miercoles', TH:'jueves', FR:'viernes', SA:'sabado', SU:'domingo' };

  const tramos = [];
  for (const s of sesiones) {
    // Extraer día del RRULE — puede venir como string directo o como objeto
    const rrule      = typeof s.recurrence === 'string' ? s.recurrence : (s.recurrence?.rule || '');
    const byDayMatch = rrule.match(/BYDAY=([A-Z]{2})/);
    if (!byDayMatch) continue;

    const dia = RRULE_TO_DIA[byDayMatch[1]];
    if (!dia) continue;

    // Leer horas: preferir localDateTime (así se guardan las recurrentes)
    const startLDT = s.start?.localDateTime;
    const endLDT   = s.end?.localDateTime;

    let inicio, fin;
    const pad = n => String(n).padStart(2, '0');

    if (startLDT && endLDT) {
      inicio = `${pad(startLDT.hourOfDay)}:${pad(startLDT.minutesOfHour)}`;
      fin    = `${pad(endLDT.hourOfDay)}:${pad(endLDT.minutesOfHour)}`;
    } else {
      // Fallback a timestamp
      const startTs = s.start?.timestamp || s.startDate;
      const endTs   = s.end?.timestamp   || s.endDate;
      if (!startTs || !endTs) continue;
      const sd = new Date(startTs);
      const ed = new Date(endTs);
      inicio = `${pad(sd.getHours())}:${pad(sd.getMinutes())}`;
      fin    = `${pad(ed.getHours())}:${pad(ed.getMinutes())}`;
    }

    tramos.push({ dia, inicio, fin });
  }
  return tramos;
}

/**
 * Comprueba si un Wix Resource tiene bookings futuros activos.
 * Devuelve array de bookings problemáticos (puede estar vacío).
 */
async function checkFutureBookings(wixResourceId) {
  try {
    const elevatedQuery = elevate(bookings.queryBookings);
    const ahora = new Date().toISOString();
    const result = await elevatedQuery({
      query: {
        filter: {
          'bookedEntity.staffMemberIds': { $hasSome: [wixResourceId] },
          startDate: { $gte: ahora }
        },
        paging: { limit: 10 }
      }
    });
    const items = result?.bookings || result?.items || [];
    return items.filter(b => !['CANCELLED', 'DECLINED'].includes(b?.status));
  } catch (e) {
    console.warn(`${TAG} ⚠️ checkFutureBookings error: ${e.message}`);
    // Si la query falla, devolvemos array vacío para no bloquear la operación
    return [];
  }
}

// =====================================================
// 1. INICIALIZAR STAFF DESDE WIX
// =====================================================
// Utilidad de onboarding: lee recursos Wix y auto-rellena
// wixResourceId + wixScheduleId en StaffConfig.
// Solo se usa en la configuración inicial de un cliente nuevo.
// NO se expone en el widget del día a día.
// =====================================================

export const inicializarStaffDesdeWix = webMethod(
  Permissions.Anyone,
  async () => {
    try {
      console.log(`${TAG} 🚀 Iniciando sincronización Staff Wix → StaffConfig`);

      const elevatedQuery = elevate(resourcesApi.queryResourceCatalog);
      const wixResult = await elevatedQuery().limit(50).find();

      const wixResources = (wixResult?.items || [])
        .filter(item => (item?.resource?.tags || []).includes(TAG_STAFF))
        .map(item => {
          const r = item?.resource || {};
          const scheduleId = r.scheduleIds?.[0] || item?.schedules?.[0]?._id || null;
          return {
            wixResourceId: r._id || '',
            wixScheduleId: scheduleId || '',
            name:  r.name  || '',
            email: r.email || r.contact?.email || '',
            phone: r.phone || r.contact?.phone || '',
          };
        }).filter(r => r.wixResourceId);

      console.log(`${TAG} 📋 ${wixResources.length} recursos Wix encontrados`);

      const cmsResult = await wixData.query(CMS_STAFF).limit(50).find({ suppressAuth: true });
      const cmsItems  = cmsResult.items || [];
      const resultados = [];

      for (const wixR of wixResources) {
        let existing = cmsItems.find(c => c.wixResourceId === wixR.wixResourceId)
                    || cmsItems.find(c =>
                         c.canonicalName && wixR.name &&
                         c.canonicalName.toLowerCase() === wixR.name.toLowerCase()
                       );

        if (existing) {
          if (existing.wixResourceId !== wixR.wixResourceId ||
              existing.wixScheduleId !== wixR.wixScheduleId) {
            await wixData.update(CMS_STAFF, {
              ...existing,
              wixResourceId: wixR.wixResourceId,
              wixScheduleId: wixR.wixScheduleId
            }, { suppressAuth: true });
            console.log(`${TAG} ✅ Actualizado: ${wixR.name}`);
            resultados.push({ name: wixR.name, accion: 'actualizado', wixResourceId: wixR.wixResourceId });
          } else {
            resultados.push({ name: wixR.name, accion: 'sin_cambios', wixResourceId: wixR.wixResourceId });
          }
        } else {
          const isHidden   = CANONICAL_HIDDEN.some(h => wixR.name.toUpperCase().includes(h.toUpperCase()));
          const nuevoRegistro = {
            wixResourceId:          wixR.wixResourceId,
            wixScheduleId:          wixR.wixScheduleId,
            canonicalName:          wixR.name,
            displayName:            wixR.name,
            isExternal:             false,
            externalModule:         '',
            locationId:             '',
            locationName:           '',
            active:                 true,
            commissionPercentage:   0,
            workingHoursSessionIds: '[]',
            notes:                  isHidden ? 'RECURSO INTERNO - no mostrar en widget' : ''
          };
          const inserted = await wixData.insert(CMS_STAFF, nuevoRegistro, { suppressAuth: true });
          console.log(`${TAG} ➕ Creado: ${wixR.name} → ${inserted._id}`);
          resultados.push({ name: wixR.name, accion: 'creado', wixResourceId: wixR.wixResourceId });
        }
      }

      console.log(`${TAG} ✅ Sincronización completada: ${resultados.length} recursos`);
      return { ok: true, resultados };

    } catch (e) {
      console.error(`${TAG} ❌ inicializarStaffDesdeWix:`, e.message);
      return { ok: false, error: safeErr(e) };
    }
  }
);

// =====================================================
// 2. LEER STAFF COMPLETO
// =====================================================
// Devuelve todos los registros StaffConfig.
// Filtra CUALQUIERA y PROCESO.
// Añade flag enWix: true si tiene wixResourceId (activo en Wix).
// Convierte profileImage wix:image:// a URL pública para el widget.
// =====================================================

export const getStaffCompleto = webMethod(
  Permissions.Anyone,
  async ({ incluirOcultos = false } = {}) => {
    try {
      console.log(`${TAG} 📋 Cargando staff completo`);

      const cmsResult = await wixData.query(CMS_STAFF)
        .ascending('canonicalName')
        .limit(50)
        .find({ suppressAuth: true });

      let staffItems = cmsResult.items || [];

      if (!incluirOcultos) {
        staffItems = staffItems.filter(s =>
          !CANONICAL_HIDDEN.some(h => (s.canonicalName || '').toUpperCase().includes(h.toUpperCase()))
        );
      }

      if (staffItems.length === 0) {
        return { ok: true, staff: [], mensaje: 'StaffConfig vacía' };
      }

      // Leer emails/teléfonos actuales desde Wix Resource
      const elevatedQuery = elevate(resourcesApi.queryResourceCatalog);
      const wixResult = await elevatedQuery().limit(50).find();
      const wixMap = {};
      (wixResult?.items || []).forEach(item => {
        const r = item?.resource || {};
        if (r._id) {
          wixMap[r._id] = {
            email: r.email || r.contact?.email || '',
            phone: r.phone || r.contact?.phone || '',
          };
        }
      });

      // Leer ExternalServices para externos
      const extResult = await wixData.query(CMS_EXTERNAL_SERVICES)
        .limit(20)
        .find({ suppressAuth: true });
      const extItems = extResult.items || [];

      const staff = staffItems.map(s => {
        const wixLive  = wixMap[s.wixResourceId] || {};
        const extRecord = s.isExternal
          ? extItems.find(e =>
              e.contactPerson && s.canonicalName &&
              e.contactPerson.toLowerCase().includes(s.canonicalName.toLowerCase())
            ) || null
          : null;

        return {
          _id:                     s._id,
          wixResourceId:           s.wixResourceId || '',
          wixScheduleId:           s.wixScheduleId || '',
          canonicalName:           s.canonicalName || '',
          displayName:             s.displayName   || s.canonicalName || '',
          isExternal:              s.isExternal    || false,
          externalModule:          s.externalModule || '',
          locationId:              s.locationId    || '',
          locationName:            s.locationName  || '',
          active:                  s.active !== false,
          enWix:                   !!(s.wixResourceId),  // flag para chip en widget
          commissionPercentage:    s.commissionPercentage || 0,
          notes:                   s.notes || '',
          // v1.3.4 — nivel de acceso (número 1-4) o null si sin asignar
          accessLevel:             (typeof s.accessLevel === 'number') ? s.accessLevel : null,
          workingHoursSessionIds:  s.workingHoursSessionIds || '[]',
          // Email/tel actuales desde Wix Resource
          email:                   wixLive.email || '',
          phone:                   wixLive.phone || '',
          // Foto desde StaffConfig.profileImage → URL pública
          image:                   wixImageToPublicUrl(s.profileImage),
          // Datos externos
          externalServiceRecordId: extRecord?._id || '',
          externalActiveStatus:    extRecord?.activeStatus    ?? s.active ?? true,
          externalCommission:      extRecord?.commissionPercentage ?? s.commissionPercentage ?? 0
        };
      });

      console.log(`${TAG} ✅ ${staff.length} miembros cargados`);
      return { ok: true, staff };

    } catch (e) {
      console.error(`${TAG} ❌ getStaffCompleto:`, e.message);
      return { ok: false, error: safeErr(e), staff: [] };
    }
  }
);

// =====================================================
// 3. LEER HORARIO ACTUAL
// =====================================================

export const getStaffHorario = webMethod(
  Permissions.Anyone,
  async ({ staffConfigId }) => {
    try {
      console.log(`${TAG} 📅 Leyendo horario: ${staffConfigId}`);

      const staffRecord = await wixData.get(CMS_STAFF, staffConfigId, { suppressAuth: true });
      if (!staffRecord) {
        return { ok: false, error: { message: 'Registro StaffConfig no encontrado' }, horario: [] };
      }

      let scheduleId = staffRecord.wixScheduleId;
      if (!scheduleId && staffRecord.wixResourceId) {
        try {
          const elevatedQuery = elevate(resourcesApi.queryResourceCatalog);
          const wixResult = await elevatedQuery().limit(50).find();
          const item = (wixResult?.items || []).find(i => i?.resource?._id === staffRecord.wixResourceId);
          scheduleId = item?.resource?.scheduleIds?.[0] || item?.schedules?.[0]?._id || '';
          if (scheduleId) {
            await wixData.update(CMS_STAFF, { ...staffRecord, wixScheduleId: scheduleId }, { suppressAuth: true });
            console.log(`${TAG} ✅ wixScheduleId recuperado: ${scheduleId}`);
          }
        } catch (_) {}
      }
      if (!scheduleId) {
        return { ok: false, error: { message: 'Sin wixScheduleId' }, horario: [] };
      }

      const sesiones = await queryWorkingHoursSessions(scheduleId);
      const sessionIds = sesiones.map(s => s._id || s.id).filter(Boolean);
      const horario    = parsearSesionesAHorario(sesiones);

      console.log(`${TAG} ✅ ${sesiones.length} sesiones → ${horario.length} tramos parseados`);

      let storedIds = [];
      try {
        storedIds = JSON.parse(staffRecord.workingHoursSessionIds || '[]');
      } catch (_) {
        storedIds = [];
      }

      return {
        ok: true,
        scheduleId,
        sessionIds,
        horario,   // [{ dia, inicio, fin }] listo para el widget
        workingHoursSessionIdsEnCMS: storedIds,
        displayName: staffRecord.displayName || staffRecord.canonicalName
      };

    } catch (e) {
      console.error(`${TAG} ❌ getStaffHorario:`, e.message);
      return { ok: false, error: safeErr(e), horario: [] };
    }
  }
);

// =====================================================
// 4. ACTUALIZAR DATOS BÁSICOS
// =====================================================
// Actualiza nombre/email/tel en Wix Resource.
// Actualiza displayName/locationId/notes/active en StaffConfig.
//
// LÓGICA DE ACTIVE:
//   inactivo → activo: crea Wix Resource, escribe wixResourceId+wixScheduleId
//   activo → inactivo: elimina Wix Resource, borra wixResourceId+wixScheduleId
// =====================================================

export const updateStaffDatosBasicos = webMethod(
  Permissions.Anyone,
  async ({ staffConfigId, datos }) => {
    try {
      console.log(`${TAG} ✏️ Actualizar datos: ${staffConfigId}`);

      if (!staffConfigId || !datos) {
        return { ok: false, error: { message: 'Faltan parámetros' } };
      }

      const staffRecord = await wixData.get(CMS_STAFF, staffConfigId, { suppressAuth: true });
      if (!staffRecord) {
        return { ok: false, error: { message: 'Registro StaffConfig no encontrado' } };
      }

      let wixResourceId   = staffRecord.wixResourceId || '';
      let wixScheduleId   = staffRecord.wixScheduleId || '';
      const eraActivo     = !!(staffRecord.wixResourceId);
      const ahoraActivo   = datos.active !== undefined ? datos.active : eraActivo;

      // ── ACTIVAR: inactivo → activo ──────────────────
      if (!eraActivo && ahoraActivo) {
        console.log(`${TAG} 🟢 Activando: crear Wix Resource para ${staffRecord.displayName}`);
        try {
          const scheduleInfo = [{ availability: { start: new Date() } }];
          const resourceInfo = {
            name:  datos.displayName || staffRecord.displayName || staffRecord.canonicalName,
            email: datos.email  || '',
            phone: datos.phone  || '',
            tags:  [TAG_STAFF]
          };
          const elevatedCreate = elevate(resourcesApi.createResource);
          const created = await elevatedCreate(resourceInfo, scheduleInfo);
          wixResourceId = created?.resource?._id || created?._id || '';
          wixScheduleId = created?.resource?.scheduleIds?.[0] || created?.scheduleIds?.[0] || created?.schedules?.[0]?._id || '';
          console.log(`${TAG} ✅ Wix Resource creado: ${wixResourceId}`);
        } catch (createErr) {
          console.error(`${TAG} ❌ Error creando Wix Resource: ${createErr.message}`);
          return { ok: false, error: { message: `Error al activar en Wix: ${createErr.message}` } };
        }
      }

      // ── DESACTIVAR: activo → inactivo ───────────────
      if (eraActivo && !ahoraActivo && wixResourceId) {
        console.log(`${TAG} 🔴 Desactivando: eliminar Wix Resource ${wixResourceId}`);
        try {
          const elevatedDelete = elevate(resourcesApi.deleteResource);
          await elevatedDelete(wixResourceId);
          console.log(`${TAG} ✅ Wix Resource eliminado: ${wixResourceId}`);
        } catch (delErr) {
          console.warn(`${TAG} ⚠️ No se pudo eliminar Wix Resource: ${delErr.message}. Continuando con baja en CMS.`);
        }
        wixResourceId = '';
        wixScheduleId = '';
      }

      // ── ACTUALIZAR DATOS EN WIX RESOURCE (si activo) ─
      if (wixResourceId) {
        const wixPayload = {};
        if (datos.displayName !== undefined) wixPayload.name  = datos.displayName;
        if (datos.email       !== undefined) wixPayload.email = datos.email;
        if (datos.phone       !== undefined) wixPayload.phone = datos.phone;

        if (Object.keys(wixPayload).length > 0) {
          try {
            const elevatedUpdate = elevate(resourcesApi.updateResource);
            await elevatedUpdate(wixResourceId, wixPayload);
            console.log(`${TAG} ✅ Wix Resource actualizado`);
          } catch (updErr) {
            console.warn(`${TAG} ⚠️ updateResource parcial: ${updErr.message}`);
          }
        }
      }

      // ── ACTUALIZAR STAFFCONFIG CMS ──────────────────
      const cmsUpdate = { ...staffRecord };
      cmsUpdate.wixResourceId = wixResourceId;
      cmsUpdate.wixScheduleId = wixScheduleId;
      if (datos.displayName          !== undefined) cmsUpdate.displayName          = datos.displayName;
      if (datos.locationId           !== undefined) cmsUpdate.locationId           = datos.locationId;
      if (datos.locationName         !== undefined) cmsUpdate.locationName         = datos.locationName;
      if (datos.active               !== undefined) cmsUpdate.active               = datos.active;
      if (datos.isExternal           !== undefined) cmsUpdate.isExternal           = datos.isExternal;
      if (datos.notes                !== undefined) cmsUpdate.notes                = datos.notes;
      if (datos.externalModule       !== undefined) cmsUpdate.externalModule       = datos.externalModule;
      if (datos.commissionPercentage !== undefined) cmsUpdate.commissionPercentage = datos.commissionPercentage;
      // v1.3.4 — nivel de acceso (Number 1-4) o null si se limpia
      if (datos.accessLevel          !== undefined) cmsUpdate.accessLevel          = datos.accessLevel;

      await wixData.update(CMS_STAFF, cmsUpdate, { suppressAuth: true });
      console.log(`${TAG} ✅ StaffConfig actualizado`);

      return { ok: true, wixResourceId };

    } catch (e) {
      console.error(`${TAG} ❌ updateStaffDatosBasicos:`, e.message);
      return { ok: false, error: safeErr(e) };
    }
  }
);

// =====================================================
// 5. ACTUALIZAR HORARIO SEMANAL
// =====================================================

export const updateStaffHorario = webMethod(
  Permissions.Anyone,
  async ({ staffConfigId, horarioSemanal }) => {
    try {
      console.log(`${TAG} 📅 Actualizar horario: ${staffConfigId} | ${(horarioSemanal || []).length} días`);

      if (!staffConfigId) {
        return { ok: false, error: { message: 'Falta staffConfigId' } };
      }

      const staffRecord = await wixData.get(CMS_STAFF, staffConfigId, { suppressAuth: true });
      if (!staffRecord) {
        return { ok: false, error: { message: 'Registro StaffConfig no encontrado' } };
      }

      let scheduleId = staffRecord.wixScheduleId;
      if (!scheduleId && staffRecord.wixResourceId) {
        // scheduleId no guardado — recuperar de Wix Resource
        console.log(`${TAG} ⚠️ wixScheduleId vacío para ${staffRecord.displayName}, recuperando de Wix...`);
        try {
          const elevatedQuery = elevate(resourcesApi.queryResourceCatalog);
          const wixResult = await elevatedQuery().limit(50).find();
          const item = (wixResult?.items || []).find(i => i?.resource?._id === staffRecord.wixResourceId);
          scheduleId = item?.resource?.scheduleIds?.[0] || item?.schedules?.[0]?._id || '';
          if (scheduleId) {
            // Guardar en StaffConfig para no volver a buscarlo
            await wixData.update(CMS_STAFF, { ...staffRecord, wixScheduleId: scheduleId }, { suppressAuth: true });
            console.log(`${TAG} ✅ wixScheduleId recuperado y guardado: ${scheduleId}`);
          }
        } catch (recErr) {
          console.error(`${TAG} ❌ No se pudo recuperar wixScheduleId: ${recErr.message}`);
        }
      }
      if (!scheduleId) {
        return { ok: false, error: { message: 'wixScheduleId no configurado y no se pudo recuperar de Wix' } };
      }

      // Desvincular horario del negocio antes de crear sesiones propias.
      // Si linkedSchedules contiene el schedule del negocio, Wix lo muestra
      // por encima de las sesiones custom y las ignora visualmente.
      try {
        const elevatedUpdateSchedule = elevate(resourcesApi.updateResourceSchedule);
        await elevatedUpdateSchedule(staffRecord.wixResourceId, scheduleId, {
          availability: { linkedSchedules: [] }
        });
        console.log(`${TAG} ✅ linkedSchedules vaciado para ${staffRecord.displayName}`);
      } catch (unlinkErr) {
        console.warn(`${TAG} ⚠️ No se pudo desvincular horario negocio: ${unlinkErr.message}`);
      }

      // Leer session IDs a eliminar
      const sesionesActuales = await queryWorkingHoursSessions(scheduleId);
      let sessionIdsAEliminar = sesionesActuales.map(s => s._id || s.id).filter(Boolean);
      if (sessionIdsAEliminar.length === 0) {
        try {
          sessionIdsAEliminar = JSON.parse(staffRecord.workingHoursSessionIds || '[]');
        } catch (_) {
          sessionIdsAEliminar = [];
        }
        console.log(`${TAG} 📋 Usando IDs de CMS: ${sessionIdsAEliminar.length}`);
      }

      const elevatedDelete = elevate(sessions.deleteSession);
      const elevatedCreate = elevate(sessions.createSession);

      let eliminadas = 0;
      for (const sessionId of sessionIdsAEliminar) {
        try {
          await elevatedDelete(sessionId);
          eliminadas++;
        } catch (delErr) {
          console.warn(`${TAG} ⚠️ No se pudo eliminar sesión ${sessionId}: ${delErr.message}`);
        }
      }
      console.log(`${TAG} ✅ ${eliminadas}/${sessionIdsAEliminar.length} sesiones eliminadas`);

      // Crear nuevas sesiones
      const nuevasSessionIds = [];
      const tramos = horarioSemanal || [];

      for (const tramo of tramos) {
        const rruleDay = RRULE_DAYS[tramo.dia?.toLowerCase()];
        if (!rruleDay || !tramo.inicio || !tramo.fin) continue;

        const [startHH, startMM] = tramo.inicio.split(':').map(Number);
        const [endHH,   endMM]   = tramo.fin.split(':').map(Number);

        // Calcular la fecha real de la primera ocurrencia del día
        const startDate = buildFirstOccurrence(rruleDay, tramo.inicio);
        const endDate   = buildFirstOccurrence(rruleDay, tramo.fin);

        // Para sesiones recurrentes Wix exige localDateTime, no timestamp
        const sessionInfo = {
          scheduleId,
          start: {
            localDateTime: {
              year:          startDate.getFullYear(),
              monthOfYear:   startDate.getMonth() + 1,
              dayOfMonth:    startDate.getDate(),
              hourOfDay:     startHH,
              minutesOfHour: startMM
            }
          },
          end: {
            localDateTime: {
              year:          endDate.getFullYear(),
              monthOfYear:   endDate.getMonth() + 1,
              dayOfMonth:    endDate.getDate(),
              hourOfDay:     endHH,
              minutesOfHour: endMM
            }
          },
          type:       'WORKING_HOURS',
          recurrence: `FREQ=WEEKLY;INTERVAL=1;BYDAY=${rruleDay}`,
          tags:       ['working-hours']
        };

        try {
          const created = await elevatedCreate(sessionInfo);
          const newId = created?._id || created?.id || '';
          if (newId) {
            nuevasSessionIds.push(newId);
            console.log(`${TAG} ✅ Sesión: ${tramo.dia} ${tramo.inicio}-${tramo.fin} → ${newId}`);
          } else {
            console.warn(`${TAG} ⚠️ createSession no devolvió ID para ${tramo.dia}`);
          }
        } catch (createErr) {
          console.error(`${TAG} ❌ Error sesión ${tramo.dia}: ${createErr.message}`);
        }
      }

      await wixData.update(CMS_STAFF, {
        ...staffRecord,
        workingHoursSessionIds: JSON.stringify(nuevasSessionIds)
      }, { suppressAuth: true });

      console.log(`${TAG} ✅ Horario: ${nuevasSessionIds.length} sesiones creadas`);
      return { ok: true, eliminadas, creadas: nuevasSessionIds.length, sessionIds: nuevasSessionIds };

    } catch (e) {
      console.error(`${TAG} ❌ updateStaffHorario:`, e.message);
      return { ok: false, error: safeErr(e) };
    }
  }
);

// =====================================================
// 6. SUBIR Y GUARDAR FOTO
// =====================================================
// Recibe base64 + fileName + mimeType.
// Sube al Media Manager de Wix en /StaffConfig/.
// Guarda fileUrl (wix:image://) en StaffConfig.profileImage.
// getStaffCompleto convierte a URL pública para el widget.
// =====================================================

export const updateStaffFoto = webMethod(
  Permissions.Anyone,
  async ({ staffConfigId, base64Data, fileName, mimeType }) => {
    try {
      console.log(`${TAG} 📸 Subir foto: ${staffConfigId} | ${fileName}`);

      if (!staffConfigId || !base64Data || !fileName) {
        return { ok: false, error: { message: 'Faltan parámetros (staffConfigId, base64Data, fileName)' } };
      }

      const staffRecord = await wixData.get(CMS_STAFF, staffConfigId, { suppressAuth: true });
      if (!staffRecord) {
        return { ok: false, error: { message: 'Registro StaffConfig no encontrado' } };
      }

      // Subir al Media Manager
      const buffer = Buffer.from(base64Data, 'base64');
      const uploadResult = await mediaManager.upload(
        '/StaffConfig',
        buffer,
        fileName,
        {
          mediaOptions: {
            mimeType:   mimeType || 'image/jpeg',
            mediaType:  'image'
          },
          metadataOptions: {
            isPrivate:        false,
            isVisitorUpload:  false
          }
        }
      );

      const fileUrl = uploadResult?.fileUrl || '';
      if (!fileUrl) {
        return { ok: false, error: { message: 'Media Manager no devolvió fileUrl' } };
      }

      console.log(`${TAG} ✅ Imagen subida: ${fileUrl}`);

      // Guardar en StaffConfig.profileImage
      await wixData.update(CMS_STAFF, {
        ...staffRecord,
        profileImage: fileUrl
      }, { suppressAuth: true });

      console.log(`${TAG} ✅ StaffConfig.profileImage actualizado`);

      // Devolver también publicUrl para preview inmediato en widget
      const publicUrl = wixImageToPublicUrl(fileUrl) || '';
      return { ok: true, fileUrl, publicUrl };

    } catch (e) {
      console.error(`${TAG} ❌ updateStaffFoto:`, e.message);
      return { ok: false, error: safeErr(e) };
    }
  }
);

// =====================================================
// 7. ACTUALIZAR DATOS EXTERNOS
// =====================================================

export const updateStaffExterno = webMethod(
  Permissions.Anyone,
  async ({ staffConfigId, commissionPercentage, activeStatus }) => {
    try {
      console.log(`${TAG} 💼 Actualizar externo: ${staffConfigId}`);

      const staffRecord = await wixData.get(CMS_STAFF, staffConfigId, { suppressAuth: true });
      if (!staffRecord) {
        return { ok: false, error: { message: 'Registro StaffConfig no encontrado' } };
      }
      if (!staffRecord.isExternal) {
        return { ok: false, error: { message: 'Este miembro no es un colaborador externo' } };
      }

      const extResult = await wixData.query(CMS_EXTERNAL_SERVICES)
        .contains('contactPerson', staffRecord.canonicalName)
        .limit(5)
        .find({ suppressAuth: true });

      const extRecord = extResult.items?.[0];
      if (extRecord) {
        const updatePayload = { ...extRecord };
        if (commissionPercentage !== undefined) updatePayload.commissionPercentage = commissionPercentage;
        if (activeStatus         !== undefined) updatePayload.activeStatus         = activeStatus;
        await wixData.update(CMS_EXTERNAL_SERVICES, updatePayload, { suppressAuth: true });
        console.log(`${TAG} ✅ ExternalServices actualizado`);
      } else {
        console.warn(`${TAG} ⚠️ No se encontró ExternalServices para ${staffRecord.canonicalName}`);
      }

      const cmsUpdate = { ...staffRecord };
      if (commissionPercentage !== undefined) cmsUpdate.commissionPercentage = commissionPercentage;
      if (activeStatus         !== undefined) cmsUpdate.active               = activeStatus;
      await wixData.update(CMS_STAFF, cmsUpdate, { suppressAuth: true });

      return { ok: true };

    } catch (e) {
      console.error(`${TAG} ❌ updateStaffExterno:`, e.message);
      return { ok: false, error: safeErr(e) };
    }
  }
);

// =====================================================
// 8. CREAR NUEVO MIEMBRO DE STAFF
// =====================================================

export const crearStaffMember = webMethod(
  Permissions.Anyone,
  async ({ datos }) => {
    try {
      console.log(`${TAG} ➕ Crear staff: ${datos?.displayName}`);

      if (!datos?.displayName || !datos?.canonicalName) {
        return { ok: false, error: { message: 'displayName y canonicalName son obligatorios' } };
      }

      let businessScheduleId = null;
      if (datos.usarHorarioNegocio) {
        try {
          const elevatedQuery = elevate(resourcesApi.queryResourceCatalog);
          const bResult = await elevatedQuery().limit(50).find();
          const bResource = (bResult?.items || [])
            .find(item => (item?.resource?.tags || []).includes(TAG_BUSINESS))
            ?.resource;
          businessScheduleId = bResource?.scheduleIds?.[0] || null;
        } catch (bErr) {
          console.warn(`${TAG} ⚠️ No se pudo obtener horario del negocio: ${bErr.message}`);
        }
      }

      const scheduleInfo = businessScheduleId
        ? [{ availability: { start: new Date(), linkedSchedules: [{ scheduleId: businessScheduleId, transparency: 'BUSY' }] } }]
        : [{ availability: { start: new Date() } }];

      const resourceInfo = {
        name:  datos.displayName,
        email: datos.email || '',
        phone: datos.phone || '',
        tags:  [TAG_STAFF]
      };

      const elevatedCreate = elevate(resourcesApi.createResource);
      const created = await elevatedCreate(resourceInfo, scheduleInfo);

      const newResourceId = created?.resource?._id || created?._id || '';
      const newScheduleId = created?.resource?.scheduleIds?.[0] || created?.scheduleIds?.[0] || created?.schedules?.[0]?._id || '';

      if (!newResourceId) {
        return { ok: false, error: { message: 'Wix no devolvió resourceId' } };
      }

      const nuevoRegistro = {
        wixResourceId:          newResourceId,
        wixScheduleId:          newScheduleId,
        canonicalName:          datos.canonicalName,
        displayName:            datos.displayName,
        isExternal:             datos.isExternal    || false,
        externalModule:         datos.externalModule || '',
        locationId:             datos.locationId    || '',
        locationName:           datos.locationName  || '',
        active:                 true,
        commissionPercentage:   datos.commissionPercentage || 0,
        workingHoursSessionIds: '[]',
        notes:                  datos.notes || ''
      };
      // v1.3.4 — accessLevel opcional en el alta (Number 1-4). Si no viene,
      // el registro se crea sin este campo y se asigna después desde el
      // tab DATOS de la edición del empleado.
      if (typeof datos.accessLevel === 'number') {
        nuevoRegistro.accessLevel = datos.accessLevel;
      }

      const inserted = await wixData.insert(CMS_STAFF, nuevoRegistro, { suppressAuth: true });
      console.log(`${TAG} ✅ StaffConfig creado: ${inserted._id}`);

      return { ok: true, staffConfigId: inserted._id, wixResourceId: newResourceId, wixScheduleId: newScheduleId };

    } catch (e) {
      console.error(`${TAG} ❌ crearStaffMember:`, e.message);
      return { ok: false, error: safeErr(e) };
    }
  }
);

// =====================================================
// 9. ELIMINAR MIEMBRO DE STAFF
// =====================================================
// Comprueba primero si tiene bookings futuros activos.
// Si los tiene → devuelve error con lista de bookings.
// Si no → elimina Wix Resource + registro StaffConfig.
//
// Este es un borrado definitivo. Para baja temporal
// usar active = false en updateStaffDatosBasicos.
// =====================================================

export const eliminarStaffMember = webMethod(
  Permissions.Anyone,
  async ({ staffConfigId }) => {
    try {
      console.log(`${TAG} 🗑️ Eliminar staff: ${staffConfigId}`);

      if (!staffConfigId) {
        return { ok: false, error: { message: 'Falta staffConfigId' } };
      }

      const staffRecord = await wixData.get(CMS_STAFF, staffConfigId, { suppressAuth: true });
      if (!staffRecord) {
        return { ok: false, error: { message: 'Registro StaffConfig no encontrado' } };
      }

      const wixResourceId = staffRecord.wixResourceId || '';

      // Comprobar bookings futuros
      if (wixResourceId) {
        const bookingsFuturos = await checkFutureBookings(wixResourceId);
        if (bookingsFuturos.length > 0) {
          console.warn(`${TAG} ⚠️ ${staffRecord.displayName} tiene ${bookingsFuturos.length} bookings futuros`);
          return {
            ok: false,
            tieneBookingsFuturos: true,
            bookingsFuturos: bookingsFuturos.map(b => ({
              id:         b._id || b.id,
              startDate:  b.startDate,
              serviceName: b.bookedEntity?.title || b.serviceName || '—'
            })),
            error: { message: `${staffRecord.displayName} tiene ${bookingsFuturos.length} cita(s) pendiente(s). Cancélalas antes de eliminar.` }
          };
        }

        // Sin bookings futuros → eliminar Wix Resource
        try {
          const elevatedDelete = elevate(resourcesApi.deleteResource);
          await elevatedDelete(wixResourceId);
          console.log(`${TAG} ✅ Wix Resource eliminado: ${wixResourceId}`);
        } catch (delErr) {
          console.warn(`${TAG} ⚠️ No se pudo eliminar Wix Resource: ${delErr.message}`);
        }
      }

      // Eliminar registro StaffConfig
      await wixData.remove(CMS_STAFF, staffConfigId, { suppressAuth: true });
      console.log(`${TAG} ✅ StaffConfig eliminado: ${staffConfigId}`);

      return { ok: true, displayName: staffRecord.displayName || staffRecord.canonicalName };

    } catch (e) {
      console.error(`${TAG} ❌ eliminarStaffMember:`, e.message);
      return { ok: false, error: safeErr(e) };
    }
  }
);

// =====================================================
// 11. BLOQUEOS — GESTIÓN DE DÍAS LIBRES / CIERRES
// =====================================================

// ─── HELPERS DE HORARIO (v1.3.5) ─────────────────────
// Copia LITERAL de widgetPublicoLogic.web.js (parseHHMM + leerHorarioStaffEnDia).
// Se usan para calcular el "día completo" según el horario laboral V2 de cada
// empleado cuando se bloquea un RANGO de fechas. No se inventa nada: es el mismo
// parser que el motor de huecos público ya usa en producción.
function parseHHMM(s) {
  const m = String(s || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = +m[1], mi = +m[2];
  if (h < 0 || h > 23 || mi < 0 || mi > 59) return null;
  return h * 60 + mi;
}

// Lee horario {from,to} (en minutos) del staff para un dow concreto.
// Devuelve null si está cerrado, no tiene horario configurado, o no parsea.
// staffRow = fila de StaffConfig (tiene workingHoursSessionIds en formato V2).
function leerHorarioStaffEnDia(staffRow, dow) {
  const raw = staffRow?.workingHoursSessionIds;
  if (!raw) return null;
  let items = [];
  try {
    if (typeof raw === 'string') {
      const obj = JSON.parse(raw);
      items = Array.isArray(obj?.items) ? obj.items : (Array.isArray(obj) ? obj : []);
    } else if (raw && typeof raw === 'object') {
      items = Array.isArray(raw.items) ? raw.items : (Array.isArray(raw) ? raw : []);
    }
  } catch (e) {
    console.warn(`${TAG} ⚠️ workingHours JSON inválido (${staffRow?.canonicalName || staffRow?._id}):`, e.message);
    return null;
  }
  const day = items.find(it => Number(it?.dow) === dow);
  if (!day || !day.open) return null;
  const from = parseHHMM(day.from);
  const to = parseHHMM(day.to);
  if (from == null || to == null || from >= to) return null;
  return { from, to };
}

// minutos → 'HH:MM'
function minToHHMM(min) {
  const h = Math.floor(min / 60), m = min % 60;
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

// Devuelve un array de fechas 'YYYY-MM-DD' desde fechaIni hasta fechaFin
// (ambas inclusive). Si fechaFin es falsy o igual a fechaIni → solo [fechaIni].
// Itera en horario Madrid como fecha civil (sin horas), por lo que se usa
// mediodía UTC para evitar saltos de día por DST.
function diasEnRango(fechaIni, fechaFin) {
  if (!fechaFin || fechaFin === fechaIni) return [fechaIni];
  const [y1, m1, d1] = String(fechaIni).split('-').map(Number);
  const [y2, m2, d2] = String(fechaFin).split('-').map(Number);
  const ini = new Date(Date.UTC(y1, m1 - 1, d1, 12, 0, 0));
  const fin = new Date(Date.UTC(y2, m2 - 1, d2, 12, 0, 0));
  if (fin < ini) return [fechaIni]; // rango invertido → tratar como un día
  const out = [];
  const cur = new Date(ini.getTime());
  while (cur.getTime() <= fin.getTime()) {
    const yy = cur.getUTCFullYear();
    const mm = String(cur.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(cur.getUTCDate()).padStart(2, '0');
    out.push(`${yy}-${mm}-${dd}`);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

// dow (0=Dom..6=Sab) de una fecha 'YYYY-MM-DD' interpretada como fecha civil.
function dowDeFecha(fechaISO) {
  const [y, mo, d] = String(fechaISO).split('-').map(Number);
  return new Date(y, mo - 1, d).getDay();
}

// ── Leer bloqueos de un empleado ────────────────────
export const getStaffBloqueos = webMethod(
  Permissions.Anyone,
  async ({ staffConfigId }) => {
    try {
      console.log(`${TAG} 🔒 Leyendo bloqueos: ${staffConfigId}`);

      const staffRecord = await wixData.get(CMS_STAFF, staffConfigId, { suppressAuth: true });
      if (!staffRecord?.wixScheduleId) {
        return { ok: true, bloqueos: [] };
      }

      const elevatedQuery = elevate(sessions.querySessions);
      const ahora = new Date();
      const dentroDe6Meses = new Date(ahora);
      dentroDe6Meses.setMonth(dentroDe6Meses.getMonth() + 6);

      const result = await elevatedQuery()
        .eq('scheduleId', staffRecord.wixScheduleId)
        .eq('type', 'EVENT')
        .ge('end.timestamp', ahora)
        .lt('start.timestamp', dentroDe6Meses)
        .find({ suppressAuth: true });

      const bloqueos = (result?.items || [])
        .filter(s => (s.tags || []).includes('Blocked'))
        .map(s => {
          const toMadrid = (ts) => {
            if (!ts) return '';
            const d = new Date(ts);
            return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });
          };
          const toFechaMadrid = (ts) => {
            if (!ts) return '';
            return new Date(ts).toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).split('/').reverse().join('-');
          };
          return {
            id:     s._id || s.id,
            fecha:  toFechaMadrid(s.start?.timestamp),
            inicio: toMadrid(s.start?.timestamp),
            fin:    toMadrid(s.end?.timestamp),
            motivo: s.notes || ''
          };
        });

      console.log(`${TAG} ✅ ${bloqueos.length} bloqueos encontrados`);
      return { ok: true, bloqueos };

    } catch (e) {
      console.error(`${TAG} ❌ getStaffBloqueos:`, e.message);
      return { ok: false, error: safeErr(e), bloqueos: [] };
    }
  }
);

// ── Crear bloqueo para un empleado ──────────────────
// v1.3.5 — Escribe en KamisuiteReservations (family:'BLOQUEO') vía la función
//          crearBloqueoV2 (crearBloqueo de recepcionProLogic), ya probada y
//          desplegada. Adiós a sessions.createSession de Wix Bookings: así el
//          bloqueo SÍ se ve en Recepción PRO V2 con su bloque visual.
//
// Parámetros:
//   staffConfigId : _id de la fila StaffConfig del empleado. Requerido.
//   fecha         : 'YYYY-MM-DD' fecha inicio (o día único). Requerido.
//   inicio, fin   : 'HH:MM'. Solo se usan para el DÍA ÚNICO (sin fechaFin),
//                   conservando el comportamiento previo (el usuario elige el
//                   tramo). Requeridos para el caso de día único.
//   fechaFin      : 'YYYY-MM-DD' opcional. Si llega y es > fecha → RANGO:
//                   cada día del rango se bloquea el DÍA COMPLETO según el
//                   horario laboral del empleado (leerHorarioStaffEnDia).
//                   Los días que el empleado libra se omiten.
//   motivo        : string opcional.
export const crearStaffBloqueo = webMethod(
  Permissions.Anyone,
  async ({ staffConfigId, fecha, inicio, fin, motivo, fechaFin }) => {
    try {
      console.log(`${TAG} 🔒 Crear bloqueo: ${staffConfigId} | ${fecha}${fechaFin ? '→' + fechaFin : ''} ${inicio}-${fin}`);

      if (!staffConfigId || !fecha) {
        return { ok: false, error: { message: 'Faltan parámetros: staffConfigId, fecha' } };
      }

      const staffRecord = await wixData.get(CMS_STAFF, staffConfigId, { suppressAuth: true });
      if (!staffRecord) {
        return { ok: false, error: { message: 'Empleado no encontrado en StaffConfig' } };
      }
      // El bloqueo V2 se cruza por wixResourceId (r.staffId === s.wixResourceId).
      const staffId = staffRecord.wixResourceId || '';
      if (!staffId) {
        return { ok: false, error: { message: 'El empleado no tiene wixResourceId configurado' } };
      }

      const esRango = !!(fechaFin && fechaFin !== fecha);

      // ── CASO DÍA ÚNICO ────────────────────────────────
      // Conserva el comportamiento previo: el usuario define inicio/fin.
      if (!esRango) {
        if (!inicio || !fin) {
          return { ok: false, error: { message: 'Faltan parámetros: inicio, fin' } };
        }
        const mIni = parseHHMM(inicio);
        const mFin = parseHHMM(fin);
        if (mIni == null || mFin == null || mFin <= mIni) {
          return { ok: false, error: { message: 'La hora de fin debe ser posterior a la de inicio' } };
        }
        const durMin = mFin - mIni;

        const res = await crearBloqueoV2({
          fechaISO:    fecha,
          horaHHmm:    inicio,
          duracionMin: durMin,
          staffId,
          motivo:      motivo || ''
        });

        if (!res?.ok) {
          return { ok: false, error: res?.error || { message: 'Error al crear el bloqueo V2' } };
        }

        console.log(`${TAG} ✅ Bloqueo V2 creado: ${res.bloqueoId}`);
        return { ok: true, sessionId: res.bloqueoId, creados: 1, omitidos: [] };
      }

      // ── CASO RANGO: día completo por día (horario laboral) ──
      const dias = diasEnRango(fecha, fechaFin);
      const creados = [];
      const omitidos = [];

      for (const dia of dias) {
        const dow = dowDeFecha(dia);
        const horario = leerHorarioStaffEnDia(staffRecord, dow);
        if (!horario) {
          // El empleado libra ese día → no hay nada que bloquear.
          omitidos.push({ fecha: dia, motivo: 'libra' });
          console.log(`${TAG} ⏭ ${dia} (dow ${dow}) → ${staffRecord.displayName || staffRecord.canonicalName} libra, omitido`);
          continue;
        }
        const horaHHmm = minToHHMM(horario.from);
        const durMin   = horario.to - horario.from;

        try {
          const res = await crearBloqueoV2({
            fechaISO:    dia,
            horaHHmm,
            duracionMin: durMin,
            staffId,
            motivo:      motivo || ''
          });
          if (res?.ok) {
            creados.push({ fecha: dia, bloqueoId: res.bloqueoId });
            console.log(`${TAG} ✅ ${dia} bloqueado ${horaHHmm} (${durMin}min) → ${res.bloqueoId}`);
          } else {
            omitidos.push({ fecha: dia, motivo: res?.error?.message || 'error' });
            console.warn(`${TAG} ⚠️ ${dia} no bloqueado: ${res?.error?.message}`);
          }
        } catch (errDia) {
          omitidos.push({ fecha: dia, motivo: errDia.message });
          console.error(`${TAG} ❌ ${dia} error: ${errDia.message}`);
        }
      }

      console.log(`${TAG} ✅ Rango completado: ${creados.length} creados, ${omitidos.length} omitidos`);
      return {
        ok: creados.length > 0,
        sessionId: creados[0]?.bloqueoId || '',
        creados: creados.length,
        omitidos,
        detalle: creados,
        error: creados.length === 0 ? { message: 'No se creó ningún bloqueo en el rango (¿el empleado libra todos esos días?)' } : undefined
      };

    } catch (e) {
      console.error(`${TAG} ❌ crearStaffBloqueo:`, e.message);
      return { ok: false, error: safeErr(e) };
    }
  }
);

// ── Eliminar bloqueo ─────────────────────────────────
export const eliminarStaffBloqueo = webMethod(
  Permissions.Anyone,
  async ({ sessionId }) => {
    try {
      console.log(`${TAG} 🗑️ Eliminar bloqueo: ${sessionId}`);

      if (!sessionId) {
        return { ok: false, error: { message: 'Falta sessionId' } };
      }

      const elevatedDelete = elevate(sessions.deleteSession);
      await elevatedDelete(sessionId);

      console.log(`${TAG} ✅ Bloqueo eliminado: ${sessionId}`);
      return { ok: true };

    } catch (e) {
      console.error(`${TAG} ❌ eliminarStaffBloqueo:`, e.message);
      return { ok: false, error: safeErr(e) };
    }
  }
);

// ── Cierre del salón — bloquea todos los empleados activos ──
// v1.3.5 — Escribe bloqueos en KamisuiteReservations (family:'BLOQUEO') vía
//          crearBloqueoV2 para cada empleado activo, de modo que el cierre SÍ se
//          vea en Recepción PRO V2. + Rango de fechas (fechaFin opcional).
//
// Parámetros:
//   fecha       : 'YYYY-MM-DD' inicio (o día único). Requerido.
//   inicio, fin : 'HH:MM'. Solo día único (sin fechaFin): tramo elegido por el
//                 usuario, mismo comportamiento previo. Requeridos en día único.
//   fechaFin    : 'YYYY-MM-DD' opcional. Rango → cada día completo según el
//                 horario laboral de cada empleado (los que libran ese día se
//                 omiten para ese día).
//   motivo      : string opcional.
export const crearCierreSalon = webMethod(
  Permissions.Anyone,
  async ({ fecha, inicio, fin, motivo, fechaFin }) => {
    try {
      console.log(`${TAG} 🔒 Cierre salón: ${fecha}${fechaFin ? '→' + fechaFin : ''} ${inicio}-${fin}`);

      if (!fecha) {
        return { ok: false, error: { message: 'Falta parámetro: fecha' } };
      }

      const esRango = !!(fechaFin && fechaFin !== fecha);
      const motivoCierre = motivo || 'Cierre del salón';

      // Leer todos los empleados activos con wixResourceId. Mantiene el mismo
      // criterio que la versión previa (incluye CUALQUIERA porque el motor de
      // disponibilidad consulta ese recurso).
      const cmsResult = await wixData.query(CMS_STAFF).limit(50).find({ suppressAuth: true });
      const activos = (cmsResult.items || []).filter(s =>
        s.wixResourceId
      );

      if (activos.length === 0) {
        return { ok: false, error: { message: 'No hay empleados activos configurados' } };
      }

      const resultados = [];

      // ── CASO DÍA ÚNICO ────────────────────────────────
      // El usuario define inicio/fin; se aplica el mismo tramo a todos.
      if (!esRango) {
        if (!inicio || !fin) {
          return { ok: false, error: { message: 'Faltan parámetros: inicio, fin' } };
        }
        const mIni = parseHHMM(inicio);
        const mFin = parseHHMM(fin);
        if (mIni == null || mFin == null || mFin <= mIni) {
          return { ok: false, error: { message: 'La hora de fin debe ser posterior a la de inicio' } };
        }
        const durMin = mFin - mIni;

        for (const s of activos) {
          try {
            const res = await crearBloqueoV2({
              fechaISO:    fecha,
              horaHHmm:    inicio,
              duracionMin: durMin,
              staffId:     s.wixResourceId,
              motivo:      motivoCierre
            });
            const nombre = s.displayName || s.canonicalName;
            if (res?.ok) {
              resultados.push({ nombre, ok: true, sessionId: res.bloqueoId });
              console.log(`${TAG} ✅ Cierre: ${nombre} → ${res.bloqueoId}`);
            } else {
              resultados.push({ nombre, ok: false, error: res?.error?.message });
              console.warn(`${TAG} ⚠️ Cierre no aplicado a ${nombre}: ${res?.error?.message}`);
            }
          } catch (err) {
            resultados.push({ nombre: s.displayName || s.canonicalName, ok: false, error: err.message });
            console.error(`${TAG} ❌ Cierre fallido para ${s.displayName}: ${err.message}`);
          }
        }

        const exitosos = resultados.filter(r => r.ok).length;
        console.log(`${TAG} ✅ Cierre completado: ${exitosos}/${activos.length} empleados`);
        return { ok: exitosos > 0, exitosos, total: activos.length, resultados };
      }

      // ── CASO RANGO: día completo por día (horario laboral de cada empleado) ──
      const dias = diasEnRango(fecha, fechaFin);
      let exitosos = 0;
      let intentos = 0;

      for (const dia of dias) {
        const dow = dowDeFecha(dia);
        for (const s of activos) {
          const horario = leerHorarioStaffEnDia(s, dow);
          if (!horario) {
            // Ese empleado libra ese día (o CUALQUIERA sin horario) → omitir.
            continue;
          }
          intentos++;
          const horaHHmm = minToHHMM(horario.from);
          const durMin   = horario.to - horario.from;
          const nombre   = s.displayName || s.canonicalName;
          try {
            const res = await crearBloqueoV2({
              fechaISO:    dia,
              horaHHmm,
              duracionMin: durMin,
              staffId:     s.wixResourceId,
              motivo:      motivoCierre
            });
            if (res?.ok) {
              exitosos++;
              resultados.push({ nombre, fecha: dia, ok: true, sessionId: res.bloqueoId });
              console.log(`${TAG} ✅ ${dia} cierre ${nombre} ${horaHHmm} (${durMin}min) → ${res.bloqueoId}`);
            } else {
              resultados.push({ nombre, fecha: dia, ok: false, error: res?.error?.message });
              console.warn(`${TAG} ⚠️ ${dia} ${nombre} no bloqueado: ${res?.error?.message}`);
            }
          } catch (err) {
            resultados.push({ nombre, fecha: dia, ok: false, error: err.message });
            console.error(`${TAG} ❌ ${dia} ${nombre} error: ${err.message}`);
          }
        }
      }

      console.log(`${TAG} ✅ Cierre rango completado: ${exitosos}/${intentos} bloqueos creados en ${dias.length} día(s)`);
      return {
        ok: exitosos > 0,
        exitosos,
        total: intentos,
        dias: dias.length,
        resultados,
        error: exitosos === 0 ? { message: 'No se creó ningún bloqueo (¿todos libran en el rango?)' } : undefined
      };

    } catch (e) {
      console.error(`${TAG} ❌ crearCierreSalon:`, e.message);
      return { ok: false, error: safeErr(e) };
    }
  }
);

// ── Leer cierres del salón (consulta bloqueos de CUALQUIERA) ──
export const getCierresSalon = webMethod(
  Permissions.Anyone,
  async () => {
    try {
      console.log(`${TAG} 🔒 Leyendo cierres del salón`);

      // Usar CUALQUIERA como representante del salón
      const cmsResult = await wixData.query(CMS_STAFF)
        .contains('canonicalName', 'CUALQUIERA')
        .limit(1)
        .find({ suppressAuth: true });

      const cualquiera = cmsResult.items?.[0];
      if (!cualquiera?.wixScheduleId) {
        return { ok: true, cierres: [] };
      }

      const elevatedQuery = elevate(sessions.querySessions);
      const ahora = new Date();
      const dentroDe6Meses = new Date(ahora);
      dentroDe6Meses.setMonth(dentroDe6Meses.getMonth() + 6);

      const result = await elevatedQuery()
        .eq('scheduleId', cualquiera.wixScheduleId)
        .eq('type', 'EVENT')
        .ge('end.timestamp', ahora)
        .lt('start.timestamp', dentroDe6Meses)
        .find({ suppressAuth: true });

      const toMadrid = (ts) => {
        if (!ts) return '';
        return new Date(ts).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });
      };
      const toFechaMadrid = (ts) => {
        if (!ts) return '';
        return new Date(ts).toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).split('/').reverse().join('-');
      };

      const cierres = (result?.items || [])
        .filter(s => (s.tags || []).includes('Blocked'))
        .map(s => ({
          sessionIdCualquiera: s._id || s.id,
          fecha:  toFechaMadrid(s.start?.timestamp),
          inicio: toMadrid(s.start?.timestamp),
          fin:    toMadrid(s.end?.timestamp),
          motivo: s.notes || ''
        }));

      console.log(`${TAG} ✅ ${cierres.length} cierres encontrados`);
      return { ok: true, cierres };

    } catch (e) {
      console.error(`${TAG} ❌ getCierresSalon:`, e.message);
      return { ok: false, error: safeErr(e), cierres: [] };
    }
  }
);

// ── Eliminar cierre del salón — borra bloqueo de todos los empleados ──
export const eliminarCierreSalon = webMethod(
  Permissions.Anyone,
  async ({ fecha, inicio, fin }) => {
    try {
      console.log(`${TAG} 🗑️ Eliminar cierre salón: ${fecha} ${inicio}-${fin}`);

      if (!fecha || !inicio || !fin) {
        return { ok: false, error: { message: 'Faltan parámetros: fecha, inicio, fin' } };
      }

      // Leer todos los empleados con scheduleId (incluye CUALQUIERA)
      const cmsResult = await wixData.query(CMS_STAFF).limit(50).find({ suppressAuth: true });
      const todos = (cmsResult.items || []).filter(s => s.wixScheduleId && s.wixResourceId);

      const elevatedQuery  = elevate(sessions.querySessions);
      const elevatedDelete = elevate(sessions.deleteSession);

      const ahora = new Date();
      const dentroDe6Meses = new Date(ahora);
      dentroDe6Meses.setMonth(dentroDe6Meses.getMonth() + 6);

      let eliminadas = 0;

      for (const s of todos) {
        try {
          const result = await elevatedQuery()
            .eq('scheduleId', s.wixScheduleId)
            .eq('type', 'EVENT')
            .ge('end.timestamp', ahora)
            .lt('start.timestamp', dentroDe6Meses)
            .find({ suppressAuth: true });

          const bloqueos = (result?.items || []).filter(b => {
            if (!(b.tags || []).includes('Blocked')) return false;
            const bInicio = new Date(b.start?.timestamp).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });
            const bFin    = new Date(b.end?.timestamp).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });
            const bFecha  = new Date(b.start?.timestamp).toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).split('/').reverse().join('-');
            return bFecha === fecha && bInicio === inicio && bFin === fin;
          });

          for (const b of bloqueos) {
            await elevatedDelete(b._id || b.id);
            eliminadas++;
          }
        } catch (err) {
          console.warn(`${TAG} ⚠️ Error eliminando cierre para ${s.displayName}: ${err.message}`);
        }
      }

      console.log(`${TAG} ✅ Cierre eliminado: ${eliminadas} bloqueos borrados`);
      return { ok: true, eliminadas };

    } catch (e) {
      console.error(`${TAG} ❌ eliminarCierreSalon:`, e.message);
      return { ok: false, error: safeErr(e) };
    }
  }
);


// resourceId de Emy sin hardcoding.
// =====================================================

export const getWixResourceIdByCanonical = webMethod(
  Permissions.Anyone,
  async ({ canonicalName }) => {
    try {
      if (!canonicalName) {
        return { ok: false, error: { message: 'canonicalName requerido' } };
      }

      const result = await wixData.query(CMS_STAFF)
        .eq('canonicalName', canonicalName)
        .limit(1)
        .find({ suppressAuth: true });

      const record = result.items?.[0];
      if (!record) {
        return { ok: false, error: { message: `No se encontró staff con canonicalName='${canonicalName}'` } };
      }

      return {
        ok: true,
        wixResourceId: record.wixResourceId || '',
        wixScheduleId: record.wixScheduleId || '',
        staffConfigId: record._id,
        isExternal:    record.isExternal || false,
        active:        record.active !== false
      };

    } catch (e) {
      console.error(`${TAG} ❌ getWixResourceIdByCanonical:`, e.message);
      return { ok: false, error: safeErr(e) };
    }
  }
);