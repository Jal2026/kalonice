/**
 * ============================================================
 *  googleCalendarSync.web.js  —  KAMISUITE Google Calendar Sync
 * ============================================================
 *  v1.1.0  ·  29 Mayo 2026
 * ------------------------------------------------------------
 *  Sincronización unidireccional: KAMISUITE → Google Calendar.
 *  Se ejecuta vía CRON diario, NO desde el page code.
 *  Lee staff + reservas + colores internamente.
 *
 *  CREDENCIALES: secreto KAMISUITE_GOOGLE_CALENDAR en Wix Secrets Manager
 *  Formato JSON: { client_id, client_secret, refresh_token, calendar_id }
 *
 *  COLORES: lee CalendarViewSettings.settingsJson (fila "default")
 *  para obtener el hex de cada empleado y mapearlo al colorId
 *  más cercano de Google Calendar. Zero hardcoding.
 *
 *  ANTI-DUPLICADOS: usa bookingId (sin guiones) como eventId de Google
 *  Calendar. Es determinista — si el evento ya existe, Google devuelve
 *  409 y se salta. Imposible duplicar.
 *
 *  CHANGELOG
 *  ---------
 *  v1.1.0 (29-May-2026) — Cron autónomo + colores CMS
 *    - ejecutarSyncCalendar: función principal para cron.
 *      Importa staff y reservas de calendarioVista.web.js.
 *      Lee colores de CalendarViewSettings (CMS).
 *      Sincroniza HOY + MAÑANA (staff ve mañana la noche antes).
 *    - IDs deterministas: bookingId sin guiones como eventId de Google.
 *    - _hexToGCalColor: mapea hex del CMS al colorId de GCal más cercano.
 *    - Eliminado acoplamiento con page code.
 *  v1.0.x — Versiones acopladas a page code (retiradas)
 * ============================================================
 */

import { Permissions, webMethod } from 'wix-web-module';
import { getSecret } from 'wix-secrets-backend';
import { fetch } from 'wix-fetch';
import wixData from 'wix-data';
import {
    getStaffResources,
    getTodasReservasDia
} from 'backend/calendarioVista.web.js';

// ── Constantes ──────────────────────────────────────────────
const TAG = '[GCalSync v1.1.0]';
const GOOGLE_OAUTH_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_CAL_BASE = 'https://www.googleapis.com/calendar/v3';
const TIMEZONE = 'Europe/Madrid';

// Google Calendar colorId → hex (los 11 colores fijos de GCal)
const GCAL_COLOR_MAP = {
    '1':  [121, 134, 203], // Lavender
    '2':  [51, 182, 121],  // Sage
    '3':  [142, 36, 170],  // Grape (morado)
    '4':  [230, 124, 115], // Flamingo (rosa)
    '5':  [246, 191, 38],  // Banana (amarillo)
    '6':  [244, 81, 30],   // Tangerine (naranja)
    '7':  [3, 155, 229],   // Peacock (azul)
    '8':  [97, 97, 97],    // Graphite (gris)
    '9':  [63, 81, 181],   // Blueberry (azul oscuro)
    '10': [11, 128, 67],   // Basil (verde)
    '11': [213, 0, 0]      // Tomato (rojo)
};

// ── Caché ───────────────────────────────────────────────────
let _credCache = null;
let _credCacheTs = 0;
const CRED_CACHE_TTL = 10 * 60 * 1000;

let _accessToken = null;
let _accessTokenTs = 0;
const ACCESS_TOKEN_TTL = 50 * 60 * 1000;


// ═════════════════════════════════════════════════════════════
//  FUNCIONES INTERNAS — Credenciales y Token
// ═════════════════════════════════════════════════════════════

async function _getCredentials() {
    const now = Date.now();
    if (_credCache && (now - _credCacheTs) < CRED_CACHE_TTL) {
        return _credCache;
    }
    try {
        const raw = await getSecret('KAMISUITE_GOOGLE_CALENDAR');
        _credCache = JSON.parse(raw);
        _credCacheTs = now;
        console.log(TAG, `Credenciales cargadas: calendar_id=${_credCache.calendar_id || '?'}`);
        return _credCache;
    } catch (err) {
        console.error(TAG, 'Error obteniendo KAMISUITE_GOOGLE_CALENDAR:', err.message);
        return null;
    }
}

async function _getAccessToken() {
    const now = Date.now();
    if (_accessToken && (now - _accessTokenTs) < ACCESS_TOKEN_TTL) {
        return _accessToken;
    }
    const creds = await _getCredentials();
    if (!creds) return null;
    try {
        const response = await fetch(GOOGLE_OAUTH_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: [
                `client_id=${encodeURIComponent(creds.client_id)}`,
                `client_secret=${encodeURIComponent(creds.client_secret)}`,
                `refresh_token=${encodeURIComponent(creds.refresh_token)}`,
                `grant_type=refresh_token`
            ].join('&')
        });
        const data = await response.json();
        if (!response.ok || !data.access_token) {
            console.error(TAG, 'Error obteniendo access token:', JSON.stringify(data));
            return null;
        }
        _accessToken = data.access_token;
        _accessTokenTs = now;
        console.log(TAG, '✅ Access token obtenido');
        return _accessToken;
    } catch (err) {
        console.error(TAG, 'Error en token exchange:', err.message);
        return null;
    }
}


// ═════════════════════════════════════════════════════════════
//  FUNCIONES INTERNAS — Colores
// ═════════════════════════════════════════════════════════════

/**
 * Convierte hex (#rrggbb) a [R, G, B]
 */
function _hexToRgb(hex) {
    const clean = (hex || '').replace('#', '');
    if (clean.length !== 6) return [128, 128, 128];
    return [
        parseInt(clean.substring(0, 2), 16),
        parseInt(clean.substring(2, 4), 16),
        parseInt(clean.substring(4, 6), 16)
    ];
}

/**
 * Mapea un color hex del CMS al colorId de Google Calendar más cercano.
 * Distancia euclidiana en espacio RGB.
 */
function _hexToGCalColor(hex) {
    const [r, g, b] = _hexToRgb(hex);
    let bestId = '3';
    let bestDist = Infinity;

    for (const [colorId, [gr, gg, gb]] of Object.entries(GCAL_COLOR_MAP)) {
        const dist = Math.sqrt(
            Math.pow(r - gr, 2) +
            Math.pow(g - gg, 2) +
            Math.pow(b - gb, 2)
        );
        if (dist < bestDist) {
            bestDist = dist;
            bestId = colorId;
        }
    }

    return bestId;
}

/**
 * Lee los colores de staff desde CalendarViewSettings (CMS).
 * Devuelve { staffId: hexColor, ... }
 */
async function _getStaffColors() {
    try {
        const result = await wixData.query('CalendarViewSettings')
            .eq('title', 'default')
            .limit(1)
            .find({ suppressAuth: true });

        if (!result.items || result.items.length === 0) {
            console.warn(TAG, 'CalendarViewSettings: fila "default" no encontrada');
            return {};
        }

        const raw = result.items[0].settingsJson;
        if (!raw) {
            console.warn(TAG, 'CalendarViewSettings: settingsJson vacío');
            return {};
        }

        const settings = typeof raw === 'string' ? JSON.parse(raw) : raw;
        const staffConfig = settings.staffConfig || {};
        const colores = {};

        for (const [staffId, cfg] of Object.entries(staffConfig)) {
            if (cfg.color) {
                colores[staffId] = cfg.color;
            }
        }

        console.log(TAG, `🎨 ${Object.keys(colores).length} colores cargados de CalendarViewSettings`);
        return colores;

    } catch (err) {
        console.error(TAG, 'Error leyendo colores:', err.message);
        return {};
    }
}


// ═════════════════════════════════════════════════════════════
//  FUNCIONES INTERNAS — API Google Calendar
// ═════════════════════════════════════════════════════════════

async function _callGoogleCalendar({ method, path, body, qs }) {
    const token = await _getAccessToken();
    if (!token) {
        return { ok: false, status: 0, data: { error: 'Access token no disponible' } };
    }

    let url = `${GOOGLE_CAL_BASE}${path}`;
    if (qs) {
        const params = Object.entries(qs)
            .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
            .join('&');
        url += `?${params}`;
    }

    const options = {
        method: method || 'GET',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    };

    if (body && method !== 'GET' && method !== 'DELETE') {
        options.body = JSON.stringify(body);
    }

    try {
        const response = await fetch(url, options);

        if (response.status === 204) {
            return { ok: true, status: 204, data: {} };
        }

        // 409 = evento ya existe (ID determinista) — no es error
        if (response.status === 409) {
            return { ok: false, status: 409, data: { alreadyExists: true } };
        }

        const data = await response.json();

        if (!response.ok) {
            console.error(TAG, `API Error ${response.status} ${method} ${path}:`, JSON.stringify(data));
            return { ok: false, status: response.status, data };
        }

        return { ok: true, status: response.status, data };

    } catch (err) {
        console.error(TAG, `Error en fetch ${method} ${path}:`, err.message);
        return { ok: false, status: 0, data: { error: err.message } };
    }
}

/**
 * Lista eventos KAMISUITE de un día concreto.
 * Filtra por extendedProperties.private.source=KAMISUITE.
 */
async function _listarEventosDia({ calendarId, fecha }) {
    const timeMin = `${fecha}T00:00:00+02:00`;
    const timeMax = `${fecha}T23:59:59+02:00`;

    const result = await _callGoogleCalendar({
        method: 'GET',
        path: `/calendars/${encodeURIComponent(calendarId)}/events`,
        qs: {
            timeMin,
            timeMax,
            timeZone: TIMEZONE,
            privateExtendedProperty: 'source=KAMISUITE',
            singleEvents: 'true',
            maxResults: '250'
        }
    });

    if (!result.ok) {
        console.error(TAG, `❌ Error listando eventos: ${JSON.stringify(result.data)}`);
        return [];
    }

    const items = result.data.items || [];
    console.log(TAG, `📋 Eventos KAMISUITE en GCal para ${fecha}: ${items.length}`);
    return items;
}

/**
 * Convierte un bookingId (UUID) en un eventId válido para Google Calendar.
 * Google requiere: [a-v0-9]{5,1024}, lowercase.
 */
function _bookingIdToEventId(bookingId) {
    return (bookingId || '').replace(/-/g, '').toLowerCase();
}

/**
 * Construye el objeto evento para Google Calendar.
 * Incluye id determinista basado en bookingId.
 */
function _buildEvent({ staffName, serviceName, clientName, fecha, startTime, endTime, bookingId, colorId, tipo }) {
    const cleanStaff = (staffName || '').replace(/^[A-Z]_/, '');
    const isBloqueo = tipo === 'bloqueo';

    const summary = isBloqueo
        ? `🔒 [${cleanStaff}] BLOQUEO`
        : `[${cleanStaff}] ${serviceName || 'Servicio'} · ${clientName || ''}`;

    const description = isBloqueo
        ? `Bloqueo manual — ${cleanStaff}\nSincronizado por KAMISUITE`
        : `Servicio: ${serviceName || ''}\nCliente: ${clientName || ''}\nEstilista: ${cleanStaff}\nSincronizado por KAMISUITE`;

    return {
        id: _bookingIdToEventId(bookingId),
        summary,
        description,
        start: {
            dateTime: `${fecha}T${startTime}:00`,
            timeZone: TIMEZONE
        },
        end: {
            dateTime: `${fecha}T${endTime}:00`,
            timeZone: TIMEZONE
        },
        colorId: colorId || '3',
        extendedProperties: {
            private: {
                source: 'KAMISUITE',
                bookingId: bookingId || '',
                staffName: staffName || '',
                tipo: tipo || 'booking'
            }
        },
        transparency: isBloqueo ? 'opaque' : 'transparent',
        status: 'confirmed'
    };
}


// ═════════════════════════════════════════════════════════════
//  FUNCIONES INTERNAS — Sync de una fecha
// ═════════════════════════════════════════════════════════════

/**
 * Sincroniza una fecha concreta.
 * 1. Obtiene reservas de KAMISUITE para esa fecha
 * 2. Crea eventos nuevos (409 = ya existe → skip)
 * 3. Borra huérfanos (cancelados en KAMISUITE)
 */
async function _sincronizarFecha({ fecha, calendarId, staffMap, staffScheduleMap, externalResourceIds }) {
    console.log(TAG, `📅 Sincronizando ${fecha}...`);

    // ── Obtener reservas de KAMISUITE ──
    const calResult = await getTodasReservasDia({ fecha, staffScheduleMap, externalResourceIds });
    if (!calResult.ok) {
        console.error(TAG, `❌ Error obteniendo reservas para ${fecha}:`, calResult.error?.message || 'Error');
        return { fecha, creados: 0, eliminados: 0, yaExistian: 0, errores: 1 };
    }

    const reservas = calResult.reservas || [];
    const reservasValidas = reservas.filter(r =>
        r.bookingId && (r.tipo === 'booking' || r.tipo === 'bloqueo')
    );

    console.log(TAG, `${reservasValidas.length} reservas válidas de ${reservas.length} totales`);

    // ── Crear eventos nuevos (deterministic ID → 409 si ya existe) ──
    let creados = 0;
    let yaExistian = 0;
    let errores = 0;
    const bookingIdsActuales = new Set();

    for (const r of reservasValidas) {
        bookingIdsActuales.add(r.bookingId);

        const staffInfo = staffMap[r.resourceId] || { name: 'Staff', colorId: '3' };

        const evento = _buildEvent({
            staffName: staffInfo.name,
            serviceName: r.servicio,
            clientName: r.cliente,
            fecha,
            startTime: r.startTime,
            endTime: r.endTime,
            bookingId: r.bookingId,
            colorId: staffInfo.colorId,
            tipo: r.tipo
        });

        const result = await _callGoogleCalendar({
            method: 'POST',
            path: `/calendars/${encodeURIComponent(calendarId)}/events`,
            body: evento
        });

        if (result.ok) {
            creados++;
        } else if (result.status === 409) {
            yaExistian++;
        } else {
            errores++;
            console.error(TAG, `❌ Error creando: ${r.servicio} (${r.bookingId.substring(0, 8)})`);
        }
    }

    // ── Eliminar huérfanos (eventos en GCal que ya no están en KAMISUITE) ──
    let eliminados = 0;
    const eventosExistentes = await _listarEventosDia({ calendarId, fecha });

    for (const ev of eventosExistentes) {
        const bid = ev.extendedProperties?.private?.bookingId || '';
        if (bid && !bookingIdsActuales.has(bid)) {
            const delResult = await _callGoogleCalendar({
                method: 'DELETE',
                path: `/calendars/${encodeURIComponent(calendarId)}/events/${ev.id}`
            });
            if (delResult.ok) {
                eliminados++;
                console.log(TAG, `🗑️ Huérfano eliminado: ${ev.summary || bid.substring(0, 8)}`);
            } else {
                errores++;
            }
        }
    }

    console.log(TAG, `✅ ${fecha}: ${creados} creados, ${yaExistian} ya existían, ${eliminados} huérfanos, ${errores} errores`);

    return { fecha, creados, eliminados, yaExistian, errores };
}


// ═════════════════════════════════════════════════════════════
//  FUNCIONES EXPORTADAS
// ═════════════════════════════════════════════════════════════

/**
 * Función principal — llamada por el CRON diario.
 * Sincroniza HOY y MAÑANA al Google Calendar del salón.
 * Lee colores de CalendarViewSettings (CMS).
 */
export const ejecutarSyncCalendar = webMethod(
    Permissions.SiteMember,
    async () => {
        console.log(TAG, '🚀 === INICIO SYNC DIARIO ===');

        // ── Credenciales Google ──
        const creds = await _getCredentials();
        if (!creds) {
            console.error(TAG, '❌ Sin credenciales — abortando');
            return { ok: false, error: 'Credenciales no disponibles' };
        }
        const calendarId = creds.calendar_id;
        if (!calendarId) {
            console.error(TAG, '❌ calendar_id vacío — abortando');
            return { ok: false, error: 'calendar_id no configurado' };
        }

        // ── Staff ──
        const staffResult = await getStaffResources();
        if (!staffResult.ok || !staffResult.staff?.length) {
            console.error(TAG, '❌ No se pudo obtener staff — abortando');
            return { ok: false, error: 'Error obteniendo staff' };
        }

        const staffList = staffResult.staff;
        const staffScheduleMap = {};
        const externalResourceIds = [];

        for (const s of staffList) {
            if (s.scheduleId) staffScheduleMap[s.scheduleId] = s.id;
            if (s.isExternal) externalResourceIds.push(s.id);
        }

        console.log(TAG, `👥 ${staffList.length} staff cargados`);

        // ── Colores desde CMS ──
        const staffColors = await _getStaffColors();

        // Construir staffMap: resourceId → { name, colorId }
        const staffMap = {};
        for (const s of staffList) {
            const hexColor = staffColors[s.id] || '#6b7280';
            staffMap[s.id] = {
                name: s.name || 'Staff',
                colorId: _hexToGCalColor(hexColor)
            };
        }

        // ── Calcular fechas: HOY y MAÑANA (hora Madrid) ──
        const ahora = new Date();
        const madridOffset = 2;
        const madridMs = ahora.getTime() + (madridOffset * 60 * 60 * 1000);
        const madridDate = new Date(madridMs);

        const hoy = `${madridDate.getUTCFullYear()}-${String(madridDate.getUTCMonth() + 1).padStart(2, '0')}-${String(madridDate.getUTCDate()).padStart(2, '0')}`;

        const mananaDate = new Date(madridMs + 24 * 60 * 60 * 1000);
        const manana = `${mananaDate.getUTCFullYear()}-${String(mananaDate.getUTCMonth() + 1).padStart(2, '0')}-${String(mananaDate.getUTCDate()).padStart(2, '0')}`;

        console.log(TAG, `📆 Fechas: hoy=${hoy}, mañana=${manana}`);

        // ── Sincronizar ambas fechas ──
        const resultHoy = await _sincronizarFecha({ fecha: hoy, calendarId, staffMap, staffScheduleMap, externalResourceIds });
        const resultManana = await _sincronizarFecha({ fecha: manana, calendarId, staffMap, staffScheduleMap, externalResourceIds });

        const totalCreados = resultHoy.creados + resultManana.creados;
        const totalEliminados = resultHoy.eliminados + resultManana.eliminados;
        const totalErrores = resultHoy.errores + resultManana.errores;

        console.log(TAG, `🏁 === SYNC COMPLETADO === Creados: ${totalCreados}, Eliminados: ${totalEliminados}, Errores: ${totalErrores}`);

        return {
            ok: totalErrores === 0,
            hoy: resultHoy,
            manana: resultManana,
            totalCreados,
            totalEliminados,
            totalErrores
        };
    }
);

/**
 * Test rápido: verifica que las credenciales funcionan.
 */
export const testConexion = webMethod(
    Permissions.SiteMember,
    async () => {
        console.log(TAG, '🧪 Test conexión Google Calendar...');

        const creds = await _getCredentials();
        if (!creds) return { ok: false, error: 'Credenciales no disponibles' };

        const result = await _callGoogleCalendar({
            method: 'GET',
            path: '/users/me/calendarList',
            qs: { maxResults: '10' }
        });

        if (!result.ok) {
            return { ok: false, error: result.data?.error?.message || 'Error de conexión' };
        }

        const calendars = (result.data.items || []).map(c => ({
            id: c.id,
            summary: c.summary,
            primary: c.primary || false
        }));

        console.log(TAG, `✅ Conexión OK: ${calendars.length} calendarios`);
        return { ok: true, calendars };
    }
);