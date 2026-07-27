// ╔══════════════════════════════════════════════════════════════════╗
// ║  comunicacionesLogic.web.js — Centralita de Comunicaciones     ║
// ║  KAMISUITE · v1.2.0                                            ║
// ╚══════════════════════════════════════════════════════════════════╝
//
// FUNCIÓN: Orquestador único de todas las comunicaciones con clientes.
// Los backends de reserva llaman funciones por EVENTO DE NEGOCIO
// (confirmación, recordatorio, cancelación...) y esta centralita
// decide qué canales disparar según SalonConfig.
//
// CANALES SOPORTADOS v1.2.0:
//   - Email Wix Triggered (triggeredEmails)
//   - WhatsApp Cloud API (vía whatsappLogic.web.js v1.2.0)
//
// CHANGELOG:
//   v1.2.0 (10-May-2026) — Plantillas multi-tenant con 8 parámetros
//     - El driver WhatsApp ahora espera `fechaHora` combinado en formato
//       largo ("Martes 9 de junio a las 10:00") en lugar de `fecha` +
//       `hora` separados. Centralita construye el string antes de pasar.
//     - Nuevo helper `_formatearFechaHoraLarga(fecha, hora)` que toma
//       formatos comunes ("9/6/2026" o "9/6/26" o "2026-06-09") + hora
//       y devuelve string presentable. Si no consigue parsear, devuelve
//       fallback "fecha a las hora".
//     - Los datos del salón (brandName, address, invoiceEmail, phone)
//       se leen automáticamente por el driver desde SalonConfig.
//       La centralita NO los pasa explícitamente; solo pasa los datos
//       que cambian por cita (cliente, servicios, fecha, etc.).
//     - Multi-tenant garantizado: cada salón cliente envía sus datos
//       sin tocar código.
//
//   v1.1.0 (09-May-2026) — Soporte canalesExcluidos
//   v1.0.0 (09-May-2026) — Versión inicial

import { Permissions, webMethod } from 'wix-web-module';
import wixData from 'wix-data';
import { triggeredEmails } from 'wix-crm-backend';
import {
  enviarTemplateConfirmacion,
  enviarTemplateRecordatorio
} from 'backend/whatsappLogic.web.js';

// ─── CONSTANTES ──────────────────────────────────────────────────
const VERSION = '1.2.0';
const TAG = '[COMMS v1.2.0]';
const SALON_CONFIG_COLLECTION = 'SalonConfig';
const COMMUNICATION_LOG_COLLECTION = 'CommunicationLog';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

const CANALES_VALIDOS = new Set(['email', 'whatsapp']);

// Días y meses en español para formato largo
const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
               'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// ─── CACHÉ SALONCONFIG ──────────────────────────────────────────
let _salonConfigCache = null;
let _salonConfigCacheTime = 0;

async function _getSalonConfig() {
  const now = Date.now();
  if (_salonConfigCache && (now - _salonConfigCacheTime) < CACHE_TTL_MS) {
    return _salonConfigCache;
  }
  try {
    const result = await wixData.query(SALON_CONFIG_COLLECTION)
      .limit(1)
      .find({ suppressAuth: true });
    if (result.items.length === 0) {
      console.error(TAG, 'SalonConfig vacía — comunicaciones desactivadas');
      return null;
    }
    _salonConfigCache = result.items[0];
    _salonConfigCacheTime = now;
    return _salonConfigCache;
  } catch (err) {
    console.error(TAG, 'Error leyendo SalonConfig:', err.message);
    return null;
  }
}

// ─── FORMATO FECHA + HORA LARGO ─────────────────────────────────
/**
 * v1.2.0: Combina fecha + hora en formato largo presentable.
 *
 * Ejemplos:
 *   ("9/6/2026", "10:00") → "Martes 9 de junio a las 10:00"
 *   ("09/06/2026", "10:00") → "Martes 9 de junio a las 10:00"
 *   ("2026-06-09", "10:00") → "Martes 9 de junio a las 10:00"
 *   ("9/6/26", "10:00") → "Martes 9 de junio a las 10:00"
 *
 * Si no consigue parsear la fecha, devuelve fallback "fecha a las hora".
 *
 * @param {string} fecha - Fecha en cualquier formato común
 * @param {string} hora - Hora en formato HH:mm
 * @returns {string} Fecha+hora en formato largo o fallback
 */
function _formatearFechaHoraLarga(fecha, hora) {
  if (!fecha) return hora || '';

  const fechaStr = String(fecha).trim();
  const horaStr = String(hora || '').trim();

  let d = null;

  // Intento 1: formato ISO yyyy-mm-dd
  let m = fechaStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) {
    d = new Date(Date.UTC(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]), 12, 0, 0));
  }

  // Intento 2: formato d/m/yyyy o d/m/yy
  if (!d) {
    m = fechaStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    if (m) {
      let year = parseInt(m[3]);
      if (year < 100) year += 2000; // 26 → 2026
      d = new Date(Date.UTC(year, parseInt(m[2]) - 1, parseInt(m[1]), 12, 0, 0));
    }
  }

  // Intento 3: formato d-m-yyyy
  if (!d) {
    m = fechaStr.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})/);
    if (m) {
      let year = parseInt(m[3]);
      if (year < 100) year += 2000;
      d = new Date(Date.UTC(year, parseInt(m[2]) - 1, parseInt(m[1]), 12, 0, 0));
    }
  }

  // Fallback: si la fecha ya viene en formato largo (no es parseable
  // como número), la devolvemos tal cual concatenada con la hora
  if (!d || isNaN(d.getTime())) {
    return horaStr ? `${fechaStr} a las ${horaStr}` : fechaStr;
  }

  // Construir formato largo: "Martes 9 de junio a las 10:00"
  const diaSemana = DIAS_SEMANA[d.getUTCDay()];
  const dia = d.getUTCDate();
  const mes = MESES[d.getUTCMonth()];
  const diaSemanaCap = diaSemana.charAt(0).toUpperCase() + diaSemana.slice(1);

  const fechaLarga = `${diaSemanaCap} ${dia} de ${mes}`;
  return horaStr ? `${fechaLarga} a las ${horaStr}` : fechaLarga;
}

// ─── DETECCIÓN EMAIL FICTICIO ───────────────────────────────────
function _esEmailFicticio(email, config) {
  if (!email || !email.trim()) return true;

  const emailLower = email.toLowerCase().trim();

  const bookingEmail = (config.bookingEmail || '').toLowerCase().trim();
  if (bookingEmail && emailLower === bookingEmail) return true;

  const domain = (config.domain || '').toLowerCase().trim();
  if (domain && emailLower.endsWith('@' + domain)) return true;

  return false;
}

// ─── NORMALIZACIÓN canalesExcluidos ─────────────────────────────
function _normalizarCanalesExcluidos(canalesExcluidos) {
  if (!Array.isArray(canalesExcluidos) || canalesExcluidos.length === 0) {
    return new Set();
  }
  const set = new Set();
  for (const canal of canalesExcluidos) {
    const c = String(canal || '').toLowerCase().trim();
    if (CANALES_VALIDOS.has(c)) set.add(c);
  }
  return set;
}

// ─── COMMUNICATION LOG ──────────────────────────────────────────
async function _registrarLog({ event, channel, recipient, clientName, result, errorDetail, services, staffName, appointmentDate, appointmentTime }) {
  try {
    await wixData.insert(COMMUNICATION_LOG_COLLECTION, {
      event:            event || '',
      channel:          channel || '',
      recipient:        recipient || '',
      clientName:       clientName || '',
      result:           result || '',
      errorDetail:      errorDetail || '',
      services:         services || '',
      staffName:        staffName || '',
      appointmentDate:  appointmentDate || '',
      appointmentTime:  appointmentTime || ''
    }, { suppressAuth: true });
  } catch (logErr) {
    console.error(TAG, 'Error escribiendo CommunicationLog:', logErr.message);
  }
}

// ─── CANAL: EMAIL WIX TRIGGERED ─────────────────────────────────
async function _enviarEmailTriggered({ contactId, email, templateId, variables, logData, canalesExcluidosSet }, config) {
  if (canalesExcluidosSet && canalesExcluidosSet.has('email')) {
    console.log(TAG, 'Canal email excluido por el caller, no se envía triggered email');
    return;
  }

  if (!config.emailActive) {
    console.log(TAG, 'Canal email desactivado en SalonConfig');
    return;
  }

  if (_esEmailFicticio(email, config)) {
    console.log(TAG, 'Email ficticio/vacío, no se envía triggered email:', email || '(vacío)');
    return;
  }

  if (!contactId) {
    console.log(TAG, 'Sin contactId, no se puede enviar triggered email');
    return;
  }

  if (!templateId) {
    console.error(TAG, 'Sin templateId configurado en SalonConfig');
    await _registrarLog({ ...logData, channel: 'email', result: 'error', errorDetail: 'Sin templateId en SalonConfig' });
    return;
  }

  try {
    await triggeredEmails.emailContact(contactId, templateId, {
      variables: variables || {}
    });
    console.log(TAG, 'Email triggered enviado OK →', email);
    await _registrarLog({ ...logData, channel: 'email', recipient: email, result: 'ok' });
  } catch (emailErr) {
    console.error(TAG, 'Error enviando email triggered:', emailErr.message);
    await _registrarLog({ ...logData, channel: 'email', recipient: email, result: 'error', errorDetail: emailErr.message });
  }
}

// ─── CANAL: WHATSAPP ────────────────────────────────────────────
/**
 * Envía WhatsApp vía whatsappLogic.web.js v1.2.0.
 *
 * v1.2.0: el driver espera ahora `fechaHora` combinado (string único)
 * en lugar de `fecha` + `hora` separados. La centralita lo compone aquí.
 * Los datos del salón (brandName, address, etc.) los lee el driver
 * directamente de SalonConfig, no se pasan en `datosTemplate`.
 */
async function _enviarWhatsApp({ telefono, tipo, datosTemplate, logData, canalesExcluidosSet }, config) {
  if (canalesExcluidosSet && canalesExcluidosSet.has('whatsapp')) {
    console.log(TAG, 'Canal WhatsApp excluido por el caller, no se envía');
    return;
  }

  if (!config.waActive) {
    console.log(TAG, 'Canal WhatsApp desactivado en SalonConfig');
    return;
  }

  if (!telefono || !telefono.trim()) {
    console.log(TAG, 'Sin teléfono, no se envía WhatsApp');
    return;
  }

  // v1.2.0: componer fechaHora en formato largo
  const fechaHora = _formatearFechaHoraLarga(datosTemplate.fecha, datosTemplate.hora);

  try {
    if (tipo === 'confirmacion') {
      await enviarTemplateConfirmacion({
        telefono:       datosTemplate.telefono || telefono,
        nombreCliente:  datosTemplate.nombreCliente,
        fechaHora:      fechaHora,
        servicios:      datosTemplate.servicios,
        estilista:      datosTemplate.estilista
      });
    } else if (tipo === 'recordatorio') {
      await enviarTemplateRecordatorio({
        telefono:       datosTemplate.telefono || telefono,
        nombreCliente:  datosTemplate.nombreCliente,
        fechaHora:      fechaHora,
        servicios:      datosTemplate.servicios,
        estilista:      datosTemplate.estilista
      });
    } else {
      console.warn(TAG, 'Tipo de WhatsApp no soportado:', tipo);
      return;
    }
    console.log(TAG, 'WhatsApp', tipo, 'enviado OK →', telefono);
    await _registrarLog({ ...logData, channel: 'whatsapp', recipient: telefono, result: 'ok' });
  } catch (waErr) {
    console.error(TAG, 'Error enviando WhatsApp', tipo + ':', waErr.message);
    await _registrarLog({ ...logData, channel: 'whatsapp', recipient: telefono, result: 'error', errorDetail: waErr.message });
  }
}

// ═══════════════════════════════════════════════════════════════════
// ║  FUNCIONES PÚBLICAS — API POR EVENTO DE NEGOCIO               ║
// ═══════════════════════════════════════════════════════════════════

/**
 * CONFIRMACIÓN DE RESERVA
 * Llamar desde coloracionLogic, tratamientosLogic, simplesLogic, akiraAcciones
 * después de confirmar el booking.
 *
 * @param {object} datos
 * @param {string} datos.contactId - Wix CRM contactId
 * @param {string} datos.email - Email del cliente (puede ser ficticio)
 * @param {string} datos.telefono - Teléfono del cliente
 * @param {string} datos.nombreCliente - Nombre del cliente
 * @param {string} datos.fecha - Fecha de la cita (ej: "12/05/2026" o "2026-05-12")
 * @param {string} datos.hora - Hora de la cita (ej: "10:30")
 * @param {string} datos.servicios - Descripción de servicios (ej: "Tinte + Corte")
 * @param {string} datos.estilista - Nombre del profesional
 * @param {object} [datos.emailVariables] - Variables adicionales para el template Wix
 * @param {string[]} [datos.canalesExcluidos] - Canales a omitir: ['email'], ['whatsapp']
 */
export const notificarConfirmacion = webMethod(
  Permissions.SiteMember,
  async (datos) => {
    console.log(TAG, 'notificarConfirmacion →', datos.nombreCliente, '|', datos.servicios);

    const config = await _getSalonConfig();
    if (!config) {
      console.error(TAG, 'No se pudo leer SalonConfig — comunicaciones abortadas');
      return { ok: false, error: 'SalonConfig no disponible' };
    }

    const canalesExcluidosSet = _normalizarCanalesExcluidos(datos.canalesExcluidos);
    if (canalesExcluidosSet.size > 0) {
      console.log(TAG, 'Canales excluidos por el caller:', [...canalesExcluidosSet].join(', '));
    }

    const logData = {
      event:           'confirmacion',
      clientName:      datos.nombreCliente || '',
      services:        datos.servicios || '',
      staffName:       datos.estilista || '',
      appointmentDate: datos.fecha || '',
      appointmentTime: datos.hora || ''
    };

    const emailVariables = datos.emailVariables || {
      cliente:    datos.nombreCliente || '',
      fecha:      datos.fecha || '',
      hora:       datos.hora || '',
      servicios:  datos.servicios || '',
      estilista:  datos.estilista || '',
      siteUrl:    config.siteUrl || ''
    };

    await Promise.allSettled([
      _enviarEmailTriggered({
        contactId:  datos.contactId,
        email:      datos.email,
        templateId: config.confirmationTemplateId,
        variables:  emailVariables,
        logData,
        canalesExcluidosSet
      }, config),

      _enviarWhatsApp({
        telefono:      datos.telefono,
        tipo:          'confirmacion',
        datosTemplate: {
          telefono:       datos.telefono,
          nombreCliente:  datos.nombreCliente,
          fecha:          datos.fecha,
          hora:           datos.hora,
          servicios:      datos.servicios,
          estilista:      datos.estilista
        },
        logData,
        canalesExcluidosSet
      }, config)
    ]);

    console.log(TAG, 'notificarConfirmacion completada →', datos.nombreCliente);
    return { ok: true };
  }
);

/**
 * RECORDATORIO DE CITA (24h antes)
 * Llamar desde reminderLogic en el loop del cron job.
 *
 * NOTA: reminderLogic mantiene su propia lógica de cascada de candidatos
 * para email. Típicamente lo llama con canalesExcluidos: ['email'] para
 * que la centralita solo dispare WhatsApp.
 */
export const notificarRecordatorio = webMethod(
  Permissions.SiteMember,
  async (datos) => {
    console.log(TAG, 'notificarRecordatorio →', datos.nombreCliente, '|', datos.servicios);

    const config = await _getSalonConfig();
    if (!config) {
      console.error(TAG, 'No se pudo leer SalonConfig — comunicaciones abortadas');
      return { ok: false, error: 'SalonConfig no disponible' };
    }

    const canalesExcluidosSet = _normalizarCanalesExcluidos(datos.canalesExcluidos);
    if (canalesExcluidosSet.size > 0) {
      console.log(TAG, 'Canales excluidos por el caller:', [...canalesExcluidosSet].join(', '));
    }

    const logData = {
      event:           'recordatorio',
      clientName:      datos.nombreCliente || '',
      services:        datos.servicios || '',
      staffName:       datos.estilista || '',
      appointmentDate: datos.fecha || '',
      appointmentTime: datos.hora || ''
    };

    const emailVariables = datos.emailVariables || {
      cliente:    datos.nombreCliente || '',
      fecha:      datos.fecha || '',
      hora:       datos.hora || '',
      servicios:  datos.servicios || '',
      estilista:  datos.estilista || '',
      siteUrl:    config.siteUrl || ''
    };

    await Promise.allSettled([
      _enviarEmailTriggered({
        contactId:  datos.contactId,
        email:      datos.email,
        templateId: config.reminderTemplateId,
        variables:  emailVariables,
        logData,
        canalesExcluidosSet
      }, config),

      _enviarWhatsApp({
        telefono:      datos.telefono,
        tipo:          'recordatorio',
        datosTemplate: {
          telefono:       datos.telefono,
          nombreCliente:  datos.nombreCliente,
          fecha:          datos.fecha,
          hora:           datos.hora,
          servicios:      datos.servicios,
          estilista:      datos.estilista
        },
        logData,
        canalesExcluidosSet
      }, config)
    ]);

    console.log(TAG, 'notificarRecordatorio completada →', datos.nombreCliente);
    return { ok: true };
  }
);

/**
 * CANCELACIÓN DE CITA — Placeholder
 */
export const notificarCancelacion = webMethod(
  Permissions.SiteMember,
  async (datos) => {
    console.log(TAG, 'notificarCancelacion → PLACEHOLDER, no implementado aún');
    return { ok: true, placeholder: true };
  }
);

/**
 * MODIFICACIÓN DE CITA — Placeholder
 */
export const notificarModificacion = webMethod(
  Permissions.SiteMember,
  async (datos) => {
    console.log(TAG, 'notificarModificacion → PLACEHOLDER, no implementado aún');
    return { ok: true, placeholder: true };
  }
);