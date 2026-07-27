// ═══════════════════════════════════════════════════════════════════════════
// KAMISUITE — recepcionAccessLogic.web.js v1.0.4
// v1.0.4: getUsersActivation devuelve también timeOut (segundos de inactividad)
//         leído de SalonConfig.timeOut (campo número). El widget lo usa para
//         el timeout de inactividad del login; si no viene o es inválido, el
//         widget mantiene su valor por defecto (60s). Cambio aditivo: lee un
//         campo más de la MISMA fila ya consultada — sin query adicional ni
//         función nueva. 100% retrocompatible.
// v1.0.3: Fix nombre de colección → ReceptionAccessLog (inglés, era español)
// v1.0.2: Permissions.SiteMember → Anyone (login se ejecuta sin sesión de
//         miembro; SiteMember daba "No permission" en salonkami)
// v1.0.1: log diagnóstico en getUsersActivation (valor crudo + tipo)
// Capa de acceso + log de actividad de Recepción PRO
//
// PROPÓSITO:
//   1. Login por PIN (mismo pinCode de StaffConfig que Control Horario).
//   2. Registro simple de eventos de negocio por empleado en ReceptionAccessLog.
//   3. Flag usersActivation (SalonConfig) que activa/desactiva toda la capa.
//
// INDEPENDIENTE de recepcionProLogic.web.js — no lo toca, no lo reemplaza.
//
// PATRONES COPIADOS:
//   · Lectura StaffConfig + colores CalendarViewSettings + _wixImageToUrl →
//     literal de timeClockLogic.web.js v1.0.11 (ya en producción).
//   · Lectura SalonConfig (.limit(1).find suppressAuth) → patrón leerVatRate
//     de cierreLogicExtendido.web.js.
//   · Permissions.Anyone + suppressAuth → el login se ejecuta ANTES de
//     cualquier autenticación; SiteMember fallaba ("No permission") en
//     contextos sin sesión de miembro (caso salonkami).
//
// CMS ReceptionAccessLog (field IDs confirmados por Jal):
//   accessLevel, dateIso, detail, eventType, staffId, staffName, staffPhoto, timestamp
//
// CMS SalonConfig (field IDs usados aquí):
//   usersActivation (boolean), timeOut (número · segundos de inactividad)
//
// eventType admitidos:
//   login | logout | timeout | reserva | cambio_reserva | cobro |
//   acceso_arqueo | acceso_informe
// ═══════════════════════════════════════════════════════════════════════════

import { Permissions, webMethod } from 'wix-web-module';
import wixData from 'wix-data';

const LOG_COLLECTION = 'ReceptionAccessLog';
const STAFF_COLLECTION = 'StaffConfig';
const SETTINGS_COLLECTION = 'CalendarViewSettings';
const SALON_COLLECTION = 'SalonConfig';
const TAG = '[RecepcionAccess][1.0.4]';
const AUTH = { suppressAuth: true };

// Recursos del sistema KAMISUITE que no son personas — nunca se loguean
const SYSTEM_RESOURCES = ['cualquiera', 'proceso'];

// eventos válidos para el log
const VALID_EVENTS = [
  'login', 'logout', 'timeout',
  'reserva', 'cambio_reserva', 'cobro',
  'acceso_arqueo', 'acceso_informe'
];

// ─────────────────────────────────────────────────────────────────────────
// getUsersActivation()
// Lee el flag usersActivation de SalonConfig. Si true → la capa de login se
// activa en Recepción PRO. Si false → acceso directo, sin login ni logs.
// v1.0.4: devuelve también timeOut (segundos de inactividad) de la MISMA
// fila. Si el campo no existe o no es un número válido (>0), devuelve null
// y el widget usa su valor por defecto.
// Mismo patrón de lectura que leerVatRate (cierreLogicExtendido).
// ─────────────────────────────────────────────────────────────────────────
export const getUsersActivation = webMethod(
  Permissions.Anyone,
  async () => {
    try {
      const res = await wixData.query(SALON_COLLECTION).limit(1).find(AUTH);
      const row = res.items.length > 0 ? res.items[0] : null;
      const raw = row ? row.usersActivation : undefined;
      // Diagnóstico: ver el valor crudo y su tipo, y si la fila existe.
      console.log(`${TAG} getUsersActivation → filas:${res.items.length} raw:${JSON.stringify(raw)} tipo:${typeof raw}`);
      const activo = raw === true;

      // v1.0.4 — timeOut (segundos). Solo si es un número finito > 0.
      let timeOut = null;
      const rawTimeout = row ? row.timeOut : undefined;
      const n = Number(rawTimeout);
      if (Number.isFinite(n) && n > 0) timeOut = n;
      console.log(`${TAG} getUsersActivation → ${activo} · timeOut:${JSON.stringify(timeOut)}`);

      return { success: true, usersActivation: activo, timeOut };
    } catch (err) {
      console.error(`${TAG} ❌ getUsersActivation:`, err.message);
      // Ante error de lectura, devolvemos false: NO bloqueamos Recepción PRO
      // por un fallo de la capa opcional de login.
      return { success: false, usersActivation: false, timeOut: null, error: err.message };
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────
// getStaffLogin()
// Empleados humanos internos activos con color + foto, para las tarjetas de
// login. Idéntico a getActiveStaff de timeClockLogic (sin novedades de PIN
// de fichaje): incluye hasPin para distinguir alta de PIN vs validación.
// ─────────────────────────────────────────────────────────────────────────
export const getStaffLogin = webMethod(
  Permissions.Anyone,
  async () => {
    try {
      const staffRes = await wixData.query(STAFF_COLLECTION)
        .eq('active', true)
        .eq('isExternal', false)
        .find(AUTH);

      // Filtrar recursos del sistema (no humanos) — case-insensitive
      const humanStaff = staffRes.items.filter(s => {
        const cn = (s.canonicalName || '').toLowerCase();
        const dn = (s.displayName || '').toLowerCase();
        return !SYSTEM_RESOURCES.includes(cn) && !SYSTEM_RESOURCES.includes(dn);
      });

      // Colores del CalendarViewSettings.settingsJson
      let staffColorMap = {};
      try {
        const settingsRes = await wixData.query(SETTINGS_COLLECTION)
          .limit(10)
          .find(AUTH);

        let settingsRow = settingsRes.items.find(r => r.title === 'default');
        if (!settingsRow) settingsRow = settingsRes.items.find(r => r.settingsJson);

        if (settingsRow && settingsRow.settingsJson) {
          const raw = settingsRow.settingsJson;
          const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
          if (parsed.staffConfig) staffColorMap = parsed.staffConfig;
        }
      } catch (e) {
        console.warn(`${TAG} ⚠️ Error leyendo CalendarViewSettings:`, e.message);
      }

      const staff = humanStaff.map(s => ({
        _id: s._id,
        canonicalName: s.canonicalName || '',
        displayName: s.displayName || s.canonicalName || '',
        hasPin: !!(s.pinCode && s.pinCode.length === 4),
        color: (staffColorMap[s.wixResourceId] && staffColorMap[s.wixResourceId].color) || '#4a9ec9',
        profileImage: _wixImageToUrl(s.profileImage)
      }));

      console.log(`${TAG} ✅ getStaffLogin: ${staff.length} empleados`);
      return { success: true, staff };
    } catch (err) {
      console.error(`${TAG} ❌ getStaffLogin:`, err.message);
      return { success: false, error: err.message };
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────
// validateLoginPin(staffId, pin)
// Valida el PIN contra StaffConfig.pinCode (mismo PIN que Control Horario).
// Devuelve datos del empleado para que el page code los conserve como
// "empleado activo" de la sesión de Recepción.
// ─────────────────────────────────────────────────────────────────────────
export const validateLoginPin = webMethod(
  Permissions.Anyone,
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
      console.log(`${TAG} validateLoginPin: ${item.displayName} → ${valid ? '✅' : '❌'}`);
      if (!valid) return { success: true, valid: false };

      return {
        success: true,
        valid: true,
        staff: {
          _id: item._id,
          staffName: item.displayName || item.canonicalName || '',
          accessLevel: item.accessLevel || '',
          profileImage: _wixImageToUrl(item.profileImage)
        }
      };
    } catch (err) {
      console.error(`${TAG} ❌ validateLoginPin:`, err.message);
      return { success: false, error: err.message };
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────
// registrarEvento({ staffId, staffName, accessLevel, staffPhoto, eventType, detail })
// Inserta una fila en ReceptionAccessLog. Fire-and-forget desde el page code:
// nunca debe romper la operación de negocio si el log falla.
// ─────────────────────────────────────────────────────────────────────────
export const registrarEvento = webMethod(
  Permissions.Anyone,
  async (evento) => {
    try {
      const {
        staffId = '',
        staffName = '',
        accessLevel = '',
        staffPhoto = '',
        eventType = '',
        detail = ''
      } = evento || {};

      if (!VALID_EVENTS.includes(eventType)) {
        return { success: false, error: `Tipo de evento inválido: ${eventType}` };
      }

      const now = new Date();
      const dateIso = now.toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });

      const row = {
        staffId,
        staffName,
        accessLevel,
        staffPhoto,
        eventType,
        detail: String(detail || ''),
        timestamp: now,
        dateIso
      };

      await wixData.insert(LOG_COLLECTION, row, AUTH);
      console.log(`${TAG} ✅ log: ${staffName || '—'} → ${eventType}${detail ? ' · ' + detail : ''}`);
      return { success: true };
    } catch (err) {
      console.error(`${TAG} ❌ registrarEvento:`, err.message);
      return { success: false, error: err.message };
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────
// getLogDia(dateISO)
// Devuelve los eventos de un día, ordenados cronológicamente. Para la futura
// vista de auditoría por empleado.
// ─────────────────────────────────────────────────────────────────────────
export const getLogDia = webMethod(
  Permissions.Anyone,
  async (dateISO) => {
    try {
      const res = await wixData.query(LOG_COLLECTION)
        .eq('dateIso', dateISO)
        .ascending('timestamp')
        .limit(1000)
        .find(AUTH);

      console.log(`${TAG} ✅ getLogDia: ${dateISO} → ${res.items.length} eventos`);
      return { success: true, eventos: res.items };
    } catch (err) {
      console.error(`${TAG} ❌ getLogDia:`, err.message);
      return { success: false, error: err.message };
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────
// _wixImageToUrl(raw)
// Convierte URL de Wix Media (wix:image://v1/HASH/FILE#...) a HTTPS.
// Literal de timeClockLogic.web.js.
// ─────────────────────────────────────────────────────────────────────────
function _wixImageToUrl(raw) {
  if (!raw) return '';
  if (raw.startsWith('http')) return raw;
  if (raw.startsWith('wix:image://')) {
    const withoutPrefix = raw.replace('wix:image://v1/', '');
    const hash = withoutPrefix.split('/')[0];
    return `https://static.wixstatic.com/media/${hash}`;
  }
  return raw;
}