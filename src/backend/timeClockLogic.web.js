// ═══════════════════════════════════════════════════════════════════════════
// KAMISUITE — timeClockLogic.web.js v1.0.8
// Control Horario — Backend
// v1.0.3: Case-insensitive system filter, defensive CMS read with diagnostics
// v1.0.4: Fix color match — use wixResourceId as key, not StaffConfig _id
// v1.0.5: Photos from StaffConfig.profileImage, removed unnecessary Resources import
// v1.0.6: Convert wix:image:// URLs to HTTPS for browser rendering
// v1.0.7: Fix permisos — Admin → SiteMember para acceso desde tablet/mobile
// v1.0.8: resetPin(staffId, masterPin) — reset protegido por masterPin de SalonConfig
// v1.0.9: getSalonHeader() — brandName + legalName para cabecera (implicación legal)
// v1.0.10: Fix resetPin — masterPin es Number en CMS, normalizar a String
// v1.0.11: registerEvent devuelve staffId en record (fusión footer en widget)
// ═══════════════════════════════════════════════════════════════════════════

import { Permissions, webMethod } from 'wix-web-module';
import wixData from 'wix-data';

const COLLECTION = 'TimeClockRecords';
const STAFF_COLLECTION = 'StaffConfig';
const SETTINGS_COLLECTION = 'CalendarViewSettings';
const SALON_COLLECTION = 'SalonConfig';
const TAG = '[TimeClock][1.0.11]';
const AUTH = { suppressAuth: true };

// Recursos del sistema KAMISUITE que no son personas — nunca fichan
const SYSTEM_RESOURCES = ['cualquiera', 'proceso'];

// ─────────────────────────────────────────────────────────────────────────
// getActiveStaff()
// Devuelve empleados humanos internos activos con color del Calendario Visual
// Excluye recursos del sistema (Cualquiera, Proceso) y externos (Emy)
// ─────────────────────────────────────────────────────────────────────────
export const getActiveStaff = webMethod(
  Permissions.SiteMember,
  async () => {
    try {
      const staffRes = await wixData.query(STAFF_COLLECTION)
        .eq('active', true)
        .eq('isExternal', false)
        .find(AUTH);

      console.log(`${TAG} Staff query: ${staffRes.items.length} items, names: ${staffRes.items.map(s => s.canonicalName || s.displayName).join(', ')}`);

      // Filtrar recursos del sistema (no humanos) — case-insensitive en canonicalName Y displayName
      const humanStaff = staffRes.items.filter(s => {
        const cn = (s.canonicalName || '').toLowerCase();
        const dn = (s.displayName || '').toLowerCase();
        return !SYSTEM_RESOURCES.includes(cn) && !SYSTEM_RESOURCES.includes(dn);
      });

      // Leer colores del CalendarViewSettings.settingsJson
      // Estructura: { staffConfig: { [staffConfigId]: { color, visible, position } } }
      let staffColorMap = {};
      try {
        const settingsRes = await wixData.query(SETTINGS_COLLECTION)
          .limit(10)
          .find(AUTH);

        console.log(`${TAG} CalendarViewSettings: ${settingsRes.items.length} filas`);

        // Buscar la fila 'default' — probar campo title
        let settingsRow = settingsRes.items.find(r => r.title === 'default');

        // Si no encuentra por title, usar la primera fila que tenga settingsJson
        if (!settingsRow) {
          console.log(`${TAG} No se encontró title='default', buscando primera fila con settingsJson`);
          settingsRow = settingsRes.items.find(r => r.settingsJson);
        }

        if (settingsRow && settingsRow.settingsJson) {
          const raw = settingsRow.settingsJson;
          const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
          if (parsed.staffConfig) {
            staffColorMap = parsed.staffConfig;
            console.log(`${TAG} ✅ Colores leídos: ${Object.keys(staffColorMap).length} empleados`);
          }
        } else {
          // Log todos los campos de la primera fila para diagnosticar
          if (settingsRes.items.length > 0) {
            console.log(`${TAG} ⚠️ Campos disponibles: ${Object.keys(settingsRes.items[0]).join(', ')}`);
          }
        }
      } catch (e) {
        console.warn(`${TAG} ❌ Error leyendo CalendarViewSettings:`, e.message);
      }

      // Foto directamente de StaffConfig.profileImage
      const staff = humanStaff.map(s => ({
        _id: s._id,
        canonicalName: s.canonicalName || '',
        displayName: s.displayName || s.canonicalName || '',
        hasPin: !!(s.pinCode && s.pinCode.length === 4),
        color: (staffColorMap[s.wixResourceId] && staffColorMap[s.wixResourceId].color) || '#4a9ec9',
        profileImage: _wixImageToUrl(s.profileImage)
      }));

      console.log(`${TAG} ✅ getActiveStaff: ${staff.length} humanos, colores: ${staff.map(s => s.displayName + '=' + s.color + ' foto:' + (s.profileImage ? 'SI' : 'NO')).join(', ')}`);
      return { success: true, staff };
    } catch (err) {
      console.error(`${TAG} ❌ getActiveStaff:`, err.message);
      return { success: false, error: err.message };
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────
// getSalonHeader()  [v1.0.9]
// Devuelve brandName (nombre comercial) y legalName (nombre jurídico) del salón
// para mostrar en la cabecera — relevante por implicación legal/administrativa.
// Mismo patrón de lectura que resetPin / leerVatRate.
// ─────────────────────────────────────────────────────────────────────────
export const getSalonHeader = webMethod(
  Permissions.SiteMember,
  async () => {
    try {
      const res = await wixData.query(SALON_COLLECTION).limit(1).find(AUTH);
      if (res.items.length === 0) {
        return { success: true, brandName: '', legalName: '' };
      }
      const row = res.items[0];
      return {
        success: true,
        brandName: row.brandName || '',
        legalName: row.legalName || ''
      };
    } catch (err) {
      console.error(`${TAG} ❌ getSalonHeader:`, err.message);
      return { success: false, error: err.message, brandName: '', legalName: '' };
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────
// validatePin(staffId, pin)
// Compara PIN introducido con el almacenado en StaffConfig
// ─────────────────────────────────────────────────────────────────────────
export const validatePin = webMethod(
  Permissions.SiteMember,
  async (staffId, pin) => {
    try {
      const item = await wixData.get(STAFF_COLLECTION, staffId, AUTH);
      if (!item) {
        return { success: false, error: 'Empleado no encontrado' };
      }
      if (!item.pinCode || item.pinCode.length !== 4) {
        return { success: false, error: 'PIN no configurado', needsSetup: true };
      }
      const valid = item.pinCode === pin;
      console.log(`${TAG} validatePin: ${item.displayName} → ${valid ? '✅' : '❌'}`);
      return { success: true, valid };
    } catch (err) {
      console.error(`${TAG} ❌ validatePin:`, err.message);
      return { success: false, error: err.message };
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────
// createPin(staffId, pin)
// Guarda PIN por primera vez (solo si pinCode está vacío)
// ─────────────────────────────────────────────────────────────────────────
export const createPin = webMethod(
  Permissions.SiteMember,
  async (staffId, pin) => {
    try {
      if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
        return { success: false, error: 'El PIN debe ser exactamente 4 dígitos numéricos' };
      }

      const item = await wixData.get(STAFF_COLLECTION, staffId, AUTH);
      if (!item) {
        return { success: false, error: 'Empleado no encontrado' };
      }
      if (item.pinCode && item.pinCode.length === 4) {
        return { success: false, error: 'Este empleado ya tiene PIN configurado' };
      }

      item.pinCode = pin;
      await wixData.update(STAFF_COLLECTION, item, AUTH);
      console.log(`${TAG} ✅ createPin: PIN creado para ${item.displayName}`);
      return { success: true };
    } catch (err) {
      console.error(`${TAG} ❌ createPin:`, err.message);
      return { success: false, error: err.message };
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────
// resetPin(staffId, masterPin)  [v1.0.8]
// Borra el pinCode del empleado tras validar el masterPin del salón.
// masterPin se lee de SalonConfig.masterPin (campo creado por Jal).
// Tras el reset, el empleado entra en flujo 'create' al volver a seleccionarse.
// READ-MERGE-UPDATE: get → modificar pinCode → update (documento completo).
// ─────────────────────────────────────────────────────────────────────────
export const resetPin = webMethod(
  Permissions.SiteMember,
  async (staffId, masterPin) => {
    try {
      if (!masterPin || !/^\d{4}$/.test(masterPin)) {
        return { success: false, error: 'PIN admin inválido' };
      }

      // Leer masterPin del salón — mismo patrón que leerVatRate (cierreLogicExtendido)
      // masterPin es tipo Number en SalonConfig → normalizar a String para comparar.
      const salonRes = await wixData.query(SALON_COLLECTION).limit(1).find(AUTH);
      const rawMaster = salonRes.items.length > 0 ? salonRes.items[0].masterPin : null;
      const salonMaster = (rawMaster === null || rawMaster === undefined || rawMaster === '')
        ? ''
        : String(rawMaster);

      if (!salonMaster || salonMaster.length !== 4) {
        return { success: false, error: 'PIN admin no configurado en el salón' };
      }
      if (salonMaster !== String(masterPin)) {
        console.log(`${TAG} resetPin: masterPin incorrecto`);
        return { success: false, error: 'PIN admin incorrecto', invalidMaster: true };
      }

      const item = await wixData.get(STAFF_COLLECTION, staffId, AUTH);
      if (!item) {
        return { success: false, error: 'Empleado no encontrado' };
      }

      item.pinCode = '';
      await wixData.update(STAFF_COLLECTION, item, AUTH);
      console.log(`${TAG} ✅ resetPin: PIN borrado para ${item.displayName}`);
      return { success: true };
    } catch (err) {
      console.error(`${TAG} ❌ resetPin:`, err.message);
      return { success: false, error: err.message };
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────
// registerEvent(staffId, eventType)
// Crea registro de fichaje con timestamp automático del sistema
// eventType: 'entrada' | 'salida' | 'pausa' | 'vuelta'
// ─────────────────────────────────────────────────────────────────────────
export const registerEvent = webMethod(
  Permissions.SiteMember,
  async (staffId, eventType) => {
    try {
      const validTypes = ['entrada', 'salida', 'pausa', 'vuelta'];
      if (!validTypes.includes(eventType)) {
        return { success: false, error: `Tipo de evento inválido: ${eventType}` };
      }

      const staff = await wixData.get(STAFF_COLLECTION, staffId, AUTH);
      if (!staff) {
        return { success: false, error: 'Empleado no encontrado' };
      }

      const now = new Date();
      const dateIso = now.toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });

      const record = {
        staffId: staffId,
        staffName: staff.displayName || staff.canonicalName || '',
        eventType: eventType,
        timestamp: now,
        dateIso: dateIso,
        autoClose: false,
        correctedBy: '',
        correctionNote: '',
        originalRecordId: '',
        isVoided: false
      };

      const inserted = await wixData.insert(COLLECTION, record, AUTH);
      console.log(`${TAG} ✅ registerEvent: ${staff.displayName} → ${eventType} (${dateIso} ${now.toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid' })})`);
      return {
        success: true,
        record: {
          _id: inserted._id,
          staffId: inserted.staffId,
          staffName: inserted.staffName,
          eventType: inserted.eventType,
          timestamp: inserted.timestamp,
          dateIso: inserted.dateIso
        }
      };
    } catch (err) {
      console.error(`${TAG} ❌ registerEvent:`, err.message);
      return { success: false, error: err.message };
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────
// getStaffStatus(dateISO)
// Para cada empleado activo, devuelve su último evento del día
// El widget determina qué botón mostrar según el estado
// ─────────────────────────────────────────────────────────────────────────
export const getStaffStatus = webMethod(
  Permissions.SiteMember,
  async (dateISO) => {
    try {
      const records = await wixData.query(COLLECTION)
        .eq('dateIso', dateISO)
        .eq('isVoided', false)
        .descending('timestamp')
        .limit(200)
        .find(AUTH);

      // Agrupar por staffId → quedarnos con el último evento (ya ordenado desc)
      const statusMap = {};
      for (const r of records.items) {
        if (!statusMap[r.staffId]) {
          statusMap[r.staffId] = {
            lastEvent: r.eventType,
            lastTimestamp: r.timestamp,
            staffName: r.staffName
          };
        }
      }

      console.log(`${TAG} ✅ getStaffStatus: ${dateISO} → ${Object.keys(statusMap).length} empleados con registros`);
      return { success: true, statusMap };
    } catch (err) {
      console.error(`${TAG} ❌ getStaffStatus:`, err.message);
      return { success: false, error: err.message };
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────
// getRecords(dateISO)
// Todos los registros del día — vista admin
// ─────────────────────────────────────────────────────────────────────────
export const getRecords = webMethod(
  Permissions.SiteMember,
  async (dateISO) => {
    try {
      const res = await wixData.query(COLLECTION)
        .eq('dateIso', dateISO)
        .ascending('timestamp')
        .limit(500)
        .find(AUTH);

      console.log(`${TAG} ✅ getRecords: ${dateISO} → ${res.items.length} registros`);
      return { success: true, records: res.items };
    } catch (err) {
      console.error(`${TAG} ❌ getRecords:`, err.message);
      return { success: false, error: err.message };
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────
// getRecordsByRange(startDate, endDate)
// Rango de fechas para histórico y exportación
// startDate/endDate en formato 'YYYY-MM-DD'
// ─────────────────────────────────────────────────────────────────────────
export const getRecordsByRange = webMethod(
  Permissions.SiteMember,
  async (startDate, endDate) => {
    try {
      const res = await wixData.query(COLLECTION)
        .ge('dateIso', startDate)
        .le('dateIso', endDate)
        .ascending('dateIso')
        .ascending('timestamp')
        .limit(1000)
        .find(AUTH);

      console.log(`${TAG} ✅ getRecordsByRange: ${startDate} → ${endDate} = ${res.items.length} registros`);
      return { success: true, records: res.items };
    } catch (err) {
      console.error(`${TAG} ❌ getRecordsByRange:`, err.message);
      return { success: false, error: err.message };
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────
// adminCorrectRecord(recordId, correctionNote, newTimestamp, adminName)
// Marca el registro original como isVoided y crea uno nuevo corregido
// ─────────────────────────────────────────────────────────────────────────
export const adminCorrectRecord = webMethod(
  Permissions.SiteMember,
  async (recordId, correctionNote, newTimestamp, adminName) => {
    try {
      const original = await wixData.get(COLLECTION, recordId, AUTH);
      if (!original) {
        return { success: false, error: 'Registro no encontrado' };
      }
      if (original.isVoided) {
        return { success: false, error: 'Este registro ya está anulado' };
      }

      // 1. Marcar original como anulado
      original.isVoided = true;
      await wixData.update(COLLECTION, original, AUTH);

      // 2. Crear registro corregido
      const corrected = {
        staffId: original.staffId,
        staffName: original.staffName,
        eventType: original.eventType,
        timestamp: new Date(newTimestamp),
        dateIso: original.dateIso,
        autoClose: false,
        correctedBy: adminName,
        correctionNote: correctionNote,
        originalRecordId: recordId,
        isVoided: false
      };

      const inserted = await wixData.insert(COLLECTION, corrected, AUTH);
      console.log(`${TAG} ✅ adminCorrectRecord: ${original.staffName} ${original.eventType} corregido por ${adminName}`);
      return { success: true, correctedRecord: inserted };
    } catch (err) {
      console.error(`${TAG} ❌ adminCorrectRecord:`, err.message);
      return { success: false, error: err.message };
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────
// getWeeklySummary(weekStartISO)
// Calcula horas efectivas por empleado para la semana
// weekStartISO = lunes de la semana en formato 'YYYY-MM-DD'
// ─────────────────────────────────────────────────────────────────────────
export const getWeeklySummary = webMethod(
  Permissions.SiteMember,
  async (weekStartISO) => {
    try {
      // Calcular domingo (weekStart + 6 días)
      const start = new Date(weekStartISO + 'T00:00:00');
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      const endISO = end.toLocaleDateString('en-CA');

      const res = await wixData.query(COLLECTION)
        .ge('dateIso', weekStartISO)
        .le('dateIso', endISO)
        .eq('isVoided', false)
        .ascending('timestamp')
        .limit(1000)
        .find(AUTH);

      // Agrupar por staffId → por día → calcular horas
      const byStaff = {};

      for (const r of res.items) {
        if (!byStaff[r.staffId]) {
          byStaff[r.staffId] = { staffName: r.staffName, days: {} };
        }
        if (!byStaff[r.staffId].days[r.dateIso]) {
          byStaff[r.staffId].days[r.dateIso] = [];
        }
        byStaff[r.staffId].days[r.dateIso].push({
          eventType: r.eventType,
          timestamp: new Date(r.timestamp)
        });
      }

      // Calcular minutos efectivos por empleado
      const summary = {};
      for (const [staffId, data] of Object.entries(byStaff)) {
        let totalMinutes = 0;
        const dailyMinutes = {};

        for (const [dateIso, events] of Object.entries(data.days)) {
          const dayMin = _calculateEffectiveMinutes(events);
          dailyMinutes[dateIso] = dayMin;
          totalMinutes += dayMin;
        }

        summary[staffId] = {
          staffName: data.staffName,
          totalMinutes,
          totalHours: Math.floor(totalMinutes / 60),
          totalRemainingMinutes: totalMinutes % 60,
          dailyMinutes
        };
      }

      console.log(`${TAG} ✅ getWeeklySummary: ${weekStartISO} → ${Object.keys(summary).length} empleados`);
      return { success: true, summary, weekStart: weekStartISO, weekEnd: endISO };
    } catch (err) {
      console.error(`${TAG} ❌ getWeeklySummary:`, err.message);
      return { success: false, error: err.message };
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────
// _calculateEffectiveMinutes(events)
// Calcula minutos efectivos descontando pausas
// events: array ordenado por timestamp [{eventType, timestamp}, ...]
// Lógica: entrada→salida = tiempo trabajado; pausa→vuelta = tiempo restado
// ─────────────────────────────────────────────────────────────────────────
function _calculateEffectiveMinutes(events) {
  let totalMinutes = 0;
  let entradaTime = null;
  let pausaTime = null;
  let pausaAccum = 0; // minutos acumulados en pausas

  for (const e of events) {
    switch (e.eventType) {
      case 'entrada':
        entradaTime = e.timestamp;
        pausaAccum = 0;
        break;

      case 'pausa':
        if (entradaTime) {
          pausaTime = e.timestamp;
        }
        break;

      case 'vuelta':
        if (pausaTime) {
          pausaAccum += (e.timestamp - pausaTime) / 60000;
          pausaTime = null;
        }
        break;

      case 'salida':
        if (entradaTime) {
          const sessionMin = (e.timestamp - entradaTime) / 60000;
          // Si hay pausa abierta al salir, cerrarla
          if (pausaTime) {
            pausaAccum += (e.timestamp - pausaTime) / 60000;
            pausaTime = null;
          }
          totalMinutes += Math.max(0, sessionMin - pausaAccum);
          entradaTime = null;
          pausaAccum = 0;
        }
        break;
    }
  }

  return Math.round(totalMinutes);
}

// ─────────────────────────────────────────────────────────────────────────
// _wixImageToUrl(raw)
// Convierte URL de Wix Media (wix:image://v1/HASH/FILE#...) a HTTPS
// Si ya es HTTPS o está vacío, devuelve tal cual
// ─────────────────────────────────────────────────────────────────────────
function _wixImageToUrl(raw) {
  if (!raw) return '';
  if (raw.startsWith('http')) return raw;
  if (raw.startsWith('wix:image://')) {
    // wix:image://v1/HASH/FILENAME#originWidth=W&originHeight=H
    const withoutPrefix = raw.replace('wix:image://v1/', '');
    const hash = withoutPrefix.split('/')[0];
    return `https://static.wixstatic.com/media/${hash}`;
  }
  return raw;
}