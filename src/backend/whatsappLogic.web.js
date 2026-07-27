/**
 * ============================================================
 *  whatsappLogic.web.js  —  KAMISUITE WhatsApp Cloud API
 * ============================================================
 *  v1.6.0  ·  17 Mayo 2026
 * ------------------------------------------------------------
 *  Backend para envío de mensajes WhatsApp vía Meta Cloud API.
 *
 *  CHANGELOG
 *  ---------
 *  v1.6.0 (17-May-2026) — Botón CTA dinámico en plantillas con imagen
 *    - _enviarTemplateConImagen: nuevo parámetro opcional buttonUrl;
 *      si se pasa, añade un componente button (sub_type url, index 0)
 *      con la URL dinámica como parámetro de texto.
 *    - enviarTemplateConImagenExport: propaga buttonUrl.
 *    - enviarBroadcast: propaga buttonUrl (por-destinatario o global).
 *
 *  v1.5.0 (15-May-2026) — Campañas marketing persistentes
 *    - guardarCampaign: guarda/actualiza campaña en MarketingCampaigns
 *    - listarCampaigns: lista campañas guardadas (filtro por template)
 *    - actualizarCampaignUso: actualiza lastUsed y timesUsed tras envío
 *
 *  v1.4.0 (15-May-2026) — Media Manager para Comunicaciones
 *    - uploadImagenMarketing, listarImagenesMedia, wixImageToPublicUrl
 *
 *  v1.3.0 (12-May-2026) — Broadcast masivo + 6 templates nuevos
 *  v1.2.0 (10-May-2026) — Plantillas multi-tenant con 8 parámetros
 *  v1.1.0 (9-May-2026) — Templates con 5 parámetros
 *  v1.0.0 (8-May-2026) — Estructura inicial
 * ============================================================
 */

import { Permissions, webMethod } from 'wix-web-module';
import { getSecret } from 'wix-secrets-backend';
import wixData from 'wix-data';
import { fetch } from 'wix-fetch';
import { mediaManager } from 'wix-media-backend';

// ── Constantes ──────────────────────────────────────────────
const TAG = '[WhatsApp v1.6.0]';
const GRAPH_API_VERSION = 'v21.0';
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

const TEMPLATE_CONFIRMACION = 'booking_confirmation_es';
const TEMPLATE_RECORDATORIO = 'booking_reminder_es';
const TEMPLATE_SALON_NEWS         = 'salon_news_es';
const TEMPLATE_FOLLOWUP           = 'appointment_followup_es';
const TEMPLATE_PROMO_SERVICE      = 'promo_service_es';
const TEMPLATE_PROMO_PRODUCT      = 'promo_product_es';
const TEMPLATE_GIFT_CARD          = 'gift_card_es';
const TEMPLATE_SPECIAL_OCCASION   = 'special_occasion_es';

const COL_COMM_LOG = 'CommunicationLog';
const COL_CAMPAIGNS = 'MarketingCampaigns';
const BROADCAST_DELAY_MS = 1000;

// ── Caché ───────────────────────────────────────────────────
let _configCache = null;
let _configCacheTs = 0;
const CONFIG_CACHE_TTL = 5 * 60 * 1000;

let _tokenCache = null;
let _tokenCacheTs = 0;
const TOKEN_CACHE_TTL = 30 * 60 * 1000;

// ═════════════════════════════════════════════════════════════
//  FUNCIONES INTERNAS
// ═════════════════════════════════════════════════════════════

async function _getSalonWhatsAppConfig() {
    const now = Date.now();
    if (_configCache && (now - _configCacheTs) < CONFIG_CACHE_TTL) {
        return _configCache;
    }

    try {
        const result = await wixData.query('SalonConfig')
            .limit(1)
            .find({ suppressAuth: true });

        if (!result.items || result.items.length === 0) {
            console.error(TAG, 'SalonConfig vacío — no se puede enviar WhatsApp');
            return null;
        }

        const salon = result.items[0];
        _configCache = {
            phoneNumberId:      salon.waPhoneId || '',
            businessAccountId:  salon.waAccountId || '',
            activo:             salon.waActive === true,
            brandName:          salon.brandName || '',
            address:            salon.address || '',
            invoiceEmail:       salon.invoiceEmail || '',
            phone:              salon.phone || '',
            senderEmail:        salon.senderEmail || '',
            senderName:         salon.senderName || ''
        };
        _configCacheTs = now;

        console.log(TAG, `Config cargada: activo=${_configCache.activo}, phoneNumberId=${_configCache.phoneNumberId ? '✓' : '✗'}, brandName="${_configCache.brandName}"`);
        return _configCache;

    } catch (err) {
        console.error(TAG, 'Error leyendo SalonConfig:', err.message);
        return null;
    }
}

async function _getToken() {
    const now = Date.now();
    if (_tokenCache && (now - _tokenCacheTs) < TOKEN_CACHE_TTL) {
        return _tokenCache;
    }

    try {
        _tokenCache = await getSecret('KAMISUITE_WHATSAPP_TOKEN');
        _tokenCacheTs = now;
        return _tokenCache;
    } catch (err) {
        console.error(TAG, 'Error obteniendo KAMISUITE_WHATSAPP_TOKEN:', err.message);
        return null;
    }
}

function _formatPhoneNumber(phone) {
    if (!phone) return null;

    let clean = String(phone).replace(/[^\d]/g, '');

    if (clean.startsWith('0034')) {
        clean = clean.substring(2);
    }

    if (!clean.startsWith('34') && clean.length === 9) {
        clean = '34' + clean;
    }

    if (clean.length < 11) {
        console.warn(TAG, `Teléfono inválido tras normalizar: "${phone}" → "${clean}"`);
        return null;
    }

    return clean;
}

async function _callWhatsAppAPI({ phoneNumberId, endpoint, body }) {
    const token = await _getToken();
    if (!token) {
        return { ok: false, status: 0, data: { error: 'Token no disponible' } };
    }

    const url = `${GRAPH_API_BASE}/${phoneNumberId}/${endpoint}`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        const data = await response.json();

        if (!response.ok) {
            console.error(TAG, `API Error ${response.status}:`, JSON.stringify(data));
            return { ok: false, status: response.status, data };
        }

        console.log(TAG, `Mensaje enviado OK → ${body.to || 'desconocido'}`, data.messages?.[0]?.id || '');
        return { ok: true, status: response.status, data };

    } catch (err) {
        console.error(TAG, 'Error en fetch a Graph API:', err.message);
        return { ok: false, status: 0, data: { error: err.message } };
    }
}

async function _enviarTemplate({ telefono, templateName, parameters }) {
    const config = await _getSalonWhatsAppConfig();

    if (!config) return { ok: false, error: 'SalonConfig no disponible' };
    if (!config.activo) {
        console.log(TAG, 'WhatsApp desactivado para este salón — template no enviado');
        return { ok: false, error: 'WhatsApp desactivado en SalonConfig' };
    }
    if (!config.phoneNumberId) return { ok: false, error: 'whatsappPhoneNumberId no configurado en SalonConfig' };

    const to = _formatPhoneNumber(telefono);
    if (!to) return { ok: false, error: `Teléfono inválido: ${telefono}` };

    const body = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: to,
        type: 'template',
        template: {
            name: templateName,
            language: { code: 'es' },
            components: [
                {
                    type: 'body',
                    parameters: parameters.map(p => ({
                        type: 'text',
                        text: String(p)
                    }))
                }
            ]
        }
    };

    console.log(TAG, `Enviando template "${templateName}" a ${to} (${parameters.length} params)`);

    const result = await _callWhatsAppAPI({
        phoneNumberId: config.phoneNumberId,
        endpoint: 'messages',
        body
    });

    return { ...result, telefono: to };
}

async function _enviarTemplateConImagen({ telefono, templateName, parameters, imageUrl, buttonUrl }) {
    const config = await _getSalonWhatsAppConfig();

    if (!config) return { ok: false, error: 'SalonConfig no disponible' };
    if (!config.activo) return { ok: false, error: 'WhatsApp desactivado en SalonConfig' };
    if (!config.phoneNumberId) return { ok: false, error: 'whatsappPhoneNumberId no configurado en SalonConfig' };

    const to = _formatPhoneNumber(telefono);
    if (!to) return { ok: false, error: `Teléfono inválido: ${telefono}` };

    const components = [];

    if (imageUrl) {
        components.push({
            type: 'header',
            parameters: [
                {
                    type: 'image',
                    image: { link: imageUrl }
                }
            ]
        });
    }

    components.push({
        type: 'body',
        parameters: parameters.map(p => ({
            type: 'text',
            text: String(p)
        }))
    });

    // v1.6.0: soporte botón CTA dinámico
    if (buttonUrl) {
        components.push({
            type: 'button',
            sub_type: 'url',
            index: 0,
            parameters: [{
                type: 'text',
                text: String(buttonUrl)
            }]
        });
    }

    const body = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: to,
        type: 'template',
        template: {
            name: templateName,
            language: { code: 'es' },
            components
        }
    };

    console.log(TAG, `Enviando template+img "${templateName}" a ${to} (${parameters.length} params)`);

    const result = await _callWhatsAppAPI({
        phoneNumberId: config.phoneNumberId,
        endpoint: 'messages',
        body
    });

    return { ...result, telefono: to };
}

function _logEnvio({ event, channel, recipient, clientName, result, errorDetail, services, staffName, appointmentDate, appointmentTime }) {
    const registro = {
        event:            event || '',
        channel:          channel || 'whatsapp',
        recipient:        recipient || '',
        clientName:       clientName || '',
        result:           result || 'ok',
        errorDetail:      errorDetail || '',
        services:         services || '',
        staffName:        staffName || '',
        appointmentDate:  appointmentDate || '',
        appointmentTime:  appointmentTime || ''
    };

    wixData.insert(COL_COMM_LOG, registro, { suppressAuth: true })
        .catch(err => console.error(TAG, '❌ Error logging envío:', err.message));
}

function _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function wixImageToPublicUrl(wixUrl) {
    if (!wixUrl || typeof wixUrl !== 'string') return null;
    if (wixUrl.startsWith('wix:image://')) {
        try {
            const match = wixUrl.match(/wix:image:\/\/v1\/([^/]+)/);
            if (match && match[1]) return `https://static.wixstatic.com/media/${match[1]}`;
        } catch (_) {}
        return null;
    }
    return wixUrl;
}

// ═════════════════════════════════════════════════════════════
//  FUNCIONES EXPORTADAS — v1.2.0 (sin cambios)
// ═════════════════════════════════════════════════════════════

export const enviarTemplateConfirmacion = webMethod(
    Permissions.SiteMember,
    async ({ telefono, nombreCliente, fechaHora, servicios, estilista }) => {
        console.log(TAG, `Confirmación → ${nombreCliente} (${telefono})`);

        const config = await _getSalonWhatsAppConfig();
        if (!config) return { ok: false, error: 'SalonConfig no disponible' };

        return _enviarTemplate({
            telefono,
            templateName: TEMPLATE_CONFIRMACION,
            parameters: [
                nombreCliente || 'Cliente',
                config.brandName || '',
                servicios || '',
                estilista || '',
                fechaHora || '',
                config.address || '',
                config.invoiceEmail || '',
                config.phone || ''
            ]
        });
    }
);

export const enviarTemplateRecordatorio = webMethod(
    Permissions.SiteMember,
    async ({ telefono, nombreCliente, fechaHora, servicios, estilista }) => {
        console.log(TAG, `Recordatorio → ${nombreCliente} (${telefono})`);

        const config = await _getSalonWhatsAppConfig();
        if (!config) return { ok: false, error: 'SalonConfig no disponible' };

        return _enviarTemplate({
            telefono,
            templateName: TEMPLATE_RECORDATORIO,
            parameters: [
                nombreCliente || 'Cliente',
                config.brandName || '',
                servicios || '',
                estilista || '',
                fechaHora || '',
                config.address || '',
                config.invoiceEmail || '',
                config.phone || ''
            ]
        });
    }
);

export const enviarMensajeTexto = webMethod(
    Permissions.SiteMember,
    async ({ telefono, texto }) => {
        const config = await _getSalonWhatsAppConfig();

        if (!config || !config.activo || !config.phoneNumberId) {
            return { ok: false, error: 'WhatsApp no configurado o desactivado' };
        }

        const to = _formatPhoneNumber(telefono);
        if (!to) return { ok: false, error: `Teléfono inválido: ${telefono}` };

        const body = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: to,
            type: 'text',
            text: {
                preview_url: false,
                body: texto
            }
        };

        console.log(TAG, `Texto libre → ${to} (${texto.length} chars)`);

        return _callWhatsAppAPI({
            phoneNumberId: config.phoneNumberId,
            endpoint: 'messages',
            body
        });
    }
);

export const enviarMensajeBotones = webMethod(
    Permissions.SiteMember,
    async ({ telefono, texto, botones }) => {
        const config = await _getSalonWhatsAppConfig();

        if (!config || !config.activo || !config.phoneNumberId) {
            return { ok: false, error: 'WhatsApp no configurado o desactivado' };
        }

        const to = _formatPhoneNumber(telefono);
        if (!to) return { ok: false, error: `Teléfono inválido: ${telefono}` };

        const botonesLimitados = (botones || []).slice(0, 3);

        if (botonesLimitados.length === 0) {
            return { ok: false, error: 'Se requiere al menos 1 botón' };
        }

        const body = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: to,
            type: 'interactive',
            interactive: {
                type: 'button',
                body: {
                    text: texto
                },
                action: {
                    buttons: botonesLimitados.map(b => ({
                        type: 'reply',
                        reply: {
                            id: b.id,
                            title: String(b.titulo).substring(0, 20)
                        }
                    }))
                }
            }
        };

        console.log(TAG, `Botones → ${to} (${botonesLimitados.length} opciones)`);

        return _callWhatsAppAPI({
            phoneNumberId: config.phoneNumberId,
            endpoint: 'messages',
            body
        });
    }
);

// ═════════════════════════════════════════════════════════════
//  FUNCIONES EXPORTADAS — v1.3.0
// ═════════════════════════════════════════════════════════════

export const enviarTemplateGenerico = webMethod(
    Permissions.SiteMember,
    async ({ telefono, nombreCliente, templateName, parameters, eventType }) => {
        console.log(TAG, `Template genérico "${templateName}" → ${nombreCliente} (${telefono})`);

        const result = await _enviarTemplate({
            telefono,
            templateName,
            parameters: parameters || []
        });

        _logEnvio({
            event: eventType || templateName,
            channel: 'whatsapp',
            recipient: result.telefono || telefono,
            clientName: nombreCliente || '',
            result: result.ok ? 'ok' : 'error',
            errorDetail: result.ok ? '' : (result.error || JSON.stringify(result.data || ''))
        });

        return result;
    }
);

export const enviarTemplateConImagenExport = webMethod(
    Permissions.SiteMember,
    async ({ telefono, nombreCliente, templateName, parameters, imageUrl, eventType, buttonUrl }) => {
        console.log(TAG, `Template+img "${templateName}" → ${nombreCliente} (${telefono})`);

        const result = await _enviarTemplateConImagen({
            telefono,
            templateName,
            parameters: parameters || [],
            imageUrl: imageUrl || '',
            buttonUrl: buttonUrl || ''
        });

        _logEnvio({
            event: eventType || templateName,
            channel: 'whatsapp',
            recipient: result.telefono || telefono,
            clientName: nombreCliente || '',
            result: result.ok ? 'ok' : 'error',
            errorDetail: result.ok ? '' : (result.error || JSON.stringify(result.data || ''))
        });

        return result;
    }
);

export const enviarBroadcast = webMethod(
    Permissions.SiteMember,
    async ({ templateName, destinatarios, eventType, imageUrl, buttonUrl }) => {
        console.log(TAG, `📢 BROADCAST "${templateName}" → ${(destinatarios || []).length} destinatarios`);

        if (!templateName) return { ok: false, error: 'templateName requerido' };
        if (!destinatarios || destinatarios.length === 0) return { ok: false, error: 'Lista de destinatarios vacía' };

        const config = await _getSalonWhatsAppConfig();
        if (!config) return { ok: false, error: 'SalonConfig no disponible' };
        if (!config.activo) return { ok: false, error: 'WhatsApp desactivado en SalonConfig' };

        const tieneImagen = !!imageUrl;
        let enviados = 0;
        let fallidos = 0;
        const errores = [];

        for (let i = 0; i < destinatarios.length; i++) {
            const dest = destinatarios[i];

            if (!dest.telefono) {
                fallidos++;
                errores.push({ nombre: dest.nombreCliente || '(sin nombre)', error: 'Sin teléfono' });
                continue;
            }

            try {
                let result;

                if (tieneImagen) {
                    result = await _enviarTemplateConImagen({
                        telefono: dest.telefono,
                        templateName,
                        parameters: dest.parameters || [],
                        imageUrl,
                        buttonUrl: dest.buttonUrl || buttonUrl || ''
                    });
                } else {
                    result = await _enviarTemplate({
                        telefono: dest.telefono,
                        templateName,
                        parameters: dest.parameters || []
                    });
                }

                _logEnvio({
                    event: eventType || templateName,
                    channel: 'whatsapp',
                    recipient: result.telefono || dest.telefono,
                    clientName: dest.nombreCliente || '',
                    result: result.ok ? 'ok' : 'error',
                    errorDetail: result.ok ? '' : (result.error || JSON.stringify(result.data || ''))
                });

                if (result.ok) {
                    enviados++;
                } else {
                    fallidos++;
                    errores.push({
                        nombre: dest.nombreCliente || dest.telefono,
                        error: result.error || 'Error API'
                    });
                }

            } catch (err) {
                fallidos++;
                errores.push({
                    nombre: dest.nombreCliente || dest.telefono,
                    error: err.message
                });

                _logEnvio({
                    event: eventType || templateName,
                    channel: 'whatsapp',
                    recipient: dest.telefono,
                    clientName: dest.nombreCliente || '',
                    result: 'error',
                    errorDetail: err.message
                });
            }

            if (i < destinatarios.length - 1) {
                await _sleep(BROADCAST_DELAY_MS);
            }
        }

        console.log(TAG, `📢 BROADCAST completado: ${enviados} enviados, ${fallidos} fallidos de ${destinatarios.length}`);

        return {
            ok: fallidos === 0,
            total: destinatarios.length,
            enviados,
            fallidos,
            errores: errores.slice(0, 50)
        };
    }
);

export const getEstadoTemplates = webMethod(
    Permissions.SiteMember,
    async () => {
        const config = await _getSalonWhatsAppConfig();
        if (!config || !config.businessAccountId) return { ok: false, error: 'WABA ID no configurado' };

        const token = await _getToken();
        if (!token) return { ok: false, error: 'Token no disponible' };

        const url = `${GRAPH_API_BASE}/${config.businessAccountId}/message_templates?limit=50`;

        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            const data = await response.json();

            if (!response.ok) {
                console.error(TAG, 'Error consultando templates:', JSON.stringify(data));
                return { ok: false, error: data.error?.message || 'Error API' };
            }

            const templates = (data.data || []).map(t => ({
                name: t.name,
                status: t.status,
                category: t.category,
                language: t.language,
                id: t.id
            }));

            console.log(TAG, `Templates consultados: ${templates.length} encontrados`);
            return { ok: true, templates };

        } catch (err) {
            console.error(TAG, 'Error en getEstadoTemplates:', err.message);
            return { ok: false, error: err.message };
        }
    }
);

export const getHistorialEnvios = webMethod(
    Permissions.SiteMember,
    async ({ channel, event, limit }) => {
        try {
            let query = wixData.query(COL_COMM_LOG)
                .descending('_createdDate')
                .limit(limit || 50);

            if (channel) query = query.eq('channel', channel);
            if (event) query = query.eq('event', event);

            const result = await query.find({ suppressAuth: true });

            const registros = result.items.map(r => ({
                id: r._id,
                event: r.event || '',
                channel: r.channel || '',
                recipient: r.recipient || '',
                clientName: r.clientName || '',
                result: r.result || '',
                errorDetail: r.errorDetail || '',
                services: r.services || '',
                staffName: r.staffName || '',
                appointmentDate: r.appointmentDate || '',
                appointmentTime: r.appointmentTime || '',
                createdDate: r._createdDate
            }));

            return { ok: true, registros, total: result.totalCount };

        } catch (err) {
            console.error(TAG, 'Error en getHistorialEnvios:', err.message);
            return { ok: false, error: err.message, registros: [] };
        }
    }
);

export const getTemplatesDisponibles = webMethod(
    Permissions.SiteMember,
    async () => {
        return {
            ok: true,
            templates: [
                { name: TEMPLATE_CONFIRMACION,     label: 'Confirmación de cita',    category: 'utility',   params: 8, hasImage: false },
                { name: TEMPLATE_RECORDATORIO,     label: 'Recordatorio de cita',    category: 'utility',   params: 8, hasImage: false },
                { name: TEMPLATE_SALON_NEWS,       label: 'Noticias del salón',      category: 'utility',   params: 4, hasImage: false },
                { name: TEMPLATE_FOLLOWUP,         label: 'Seguimiento post-visita', category: 'utility',   params: 4, hasImage: false },
                { name: TEMPLATE_PROMO_SERVICE,    label: 'Promoción de servicio',   category: 'marketing', params: 6, hasImage: true },
                { name: TEMPLATE_PROMO_PRODUCT,    label: 'Promoción de producto',   category: 'marketing', params: 5, hasImage: true },
                { name: TEMPLATE_GIFT_CARD,        label: 'Tarjetas regalo',         category: 'marketing', params: 5, hasImage: true },
                { name: TEMPLATE_SPECIAL_OCCASION, label: 'Días especiales',         category: 'marketing', params: 7, hasImage: true }
            ]
        };
    }
);

// ═════════════════════════════════════════════════════════════
//  UTILIDADES — v1.2.0 (sin cambios)
// ═════════════════════════════════════════════════════════════

export const isWhatsAppActivo = webMethod(
    Permissions.SiteMember,
    async () => {
        const config = await _getSalonWhatsAppConfig();
        return config ? config.activo : false;
    }
);

export const formatearTelefono = webMethod(
    Permissions.SiteMember,
    async (telefono) => {
        return _formatPhoneNumber(telefono);
    }
);

// ═════════════════════════════════════════════════════════════
//  MEDIA MANAGER — v1.4.0 (sin cambios)
// ═════════════════════════════════════════════════════════════

export const uploadImagenMarketing = webMethod(
    Permissions.SiteMember,
    async ({ base64Data, fileName, mimeType, folder }) => {
        const carpeta = folder || '/Marketing';
        try {
            console.log(TAG, `📸 uploadImagenMarketing: ${fileName} → ${carpeta}`);

            if (!base64Data || !fileName) {
                return { ok: false, error: 'Faltan parámetros (base64Data, fileName)' };
            }

            const buffer = Buffer.from(base64Data, 'base64');
            const uploadResult = await mediaManager.upload(
                carpeta,
                buffer,
                fileName,
                {
                    mediaOptions: {
                        mimeType: mimeType || 'image/jpeg',
                        mediaType: 'image'
                    },
                    metadataOptions: {
                        isPrivate: false,
                        isVisitorUpload: false
                    }
                }
            );

            const fileUrl = uploadResult?.fileUrl || '';
            if (!fileUrl) {
                return { ok: false, error: 'Media Manager no devolvió fileUrl' };
            }

            console.log(TAG, `✅ Imagen subida: ${fileUrl}`);
            const publicUrl = wixImageToPublicUrl(fileUrl) || '';

            return { ok: true, fileUrl, publicUrl };

        } catch (e) {
            console.error(TAG, '❌ uploadImagenMarketing:', e.message);
            return { ok: false, error: e.message };
        }
    }
);

export const listarImagenesMedia = webMethod(
    Permissions.SiteMember,
    async ({ folder, limit }) => {
        const maxItems = limit || 50;
        try {
            console.log(TAG, `📋 listarImagenesMedia: carpeta=${folder || 'raíz'}, limit=${maxItems}`);

            const result = await mediaManager.listFiles(
                null,
                null,
                {
                    limit: maxItems,
                    parentFolderId: folder || undefined
                }
            );

            const archivos = (result || [])
                .filter(f => f.mediaType === 'image')
                .map(f => ({
                    fileUrl: f.fileUrl || '',
                    publicUrl: wixImageToPublicUrl(f.fileUrl) || '',
                    fileName: f.originalFileName || f.fileName || '',
                    width: f.width || 0,
                    height: f.height || 0
                }));

            console.log(TAG, `✅ ${archivos.length} imágenes encontradas`);
            return { ok: true, imagenes: archivos, total: archivos.length };

        } catch (e) {
            console.error(TAG, '❌ listarImagenesMedia:', e.message);
            return { ok: false, error: e.message, imagenes: [] };
        }
    }
);

// ═════════════════════════════════════════════════════════════
//  CAMPAÑAS MARKETING — v1.5.0
// ═════════════════════════════════════════════════════════════

/**
 * v1.5.0 — Guarda o actualiza una campaña en MarketingCampaigns.
 * Si se pasa _id, actualiza. Si no, crea nueva.
 */
export const guardarCampaign = webMethod(
    Permissions.SiteMember,
    async ({ _id, templateName, campaignName, imageUrl, parameters, buttonUrl }) => {
        try {
            console.log(TAG, `💾 guardarCampaign: "${campaignName}" (${templateName})`);

            if (!campaignName || !templateName) {
                return { ok: false, error: 'campaignName y templateName son obligatorios' };
            }

            if (_id) {
                // Actualizar existente
                const existing = await wixData.get(COL_CAMPAIGNS, _id, { suppressAuth: true });
                if (!existing) {
                    return { ok: false, error: 'Campaña no encontrada' };
                }

                existing.campaignName = campaignName;
                existing.templateName = templateName;
                existing.imageUrl = imageUrl || '';
                existing.parameters = parameters || '[]';
                existing.buttonUrl = buttonUrl || '';

                const updated = await wixData.update(COL_CAMPAIGNS, existing, { suppressAuth: true });
                console.log(TAG, `✅ Campaña actualizada: ${updated._id}`);

                return {
                    ok: true,
                    campaign: {
                        _id: updated._id,
                        campaignName: updated.campaignName,
                        templateName: updated.templateName,
                        imageUrl: updated.imageUrl,
                        parameters: updated.parameters,
                        lastUsed: updated.lastUsed,
                        timesUsed: updated.timesUsed,
                        active: updated.active
                    }
                };

            } else {
                // Crear nueva
                const registro = {
                    templateName: templateName,
                    campaignName: campaignName,
                    imageUrl: imageUrl || '',
                    parameters: parameters || '[]',
    buttonUrl: buttonUrl || '',
                    lastUsed: null,
                    timesUsed: 0,
                    active: true
                };

                const inserted = await wixData.insert(COL_CAMPAIGNS, registro, { suppressAuth: true });
                console.log(TAG, `✅ Campaña creada: ${inserted._id}`);

                return {
                    ok: true,
                    campaign: {
                        _id: inserted._id,
                        campaignName: inserted.campaignName,
                        templateName: inserted.templateName,
                        imageUrl: inserted.imageUrl,
                        parameters: inserted.parameters,
                        lastUsed: inserted.lastUsed,
                        timesUsed: inserted.timesUsed,
                        active: inserted.active
                    }
                };
            }

        } catch (e) {
            console.error(TAG, '❌ guardarCampaign:', e.message);
            return { ok: false, error: e.message };
        }
    }
);

/**
 * v1.5.0 — Lista campañas guardadas. Filtro opcional por templateName.
 */
export const listarCampaigns = webMethod(
    Permissions.SiteMember,
    async ({ templateName }) => {
        try {
            console.log(TAG, `📋 listarCampaigns: template=${templateName || 'todos'}`);

            let query = wixData.query(COL_CAMPAIGNS)
                .eq('active', true)
                .descending('_updatedDate')
                .limit(50);

            if (templateName) {
                query = query.eq('templateName', templateName);
            }

            const result = await query.find({ suppressAuth: true });

            const campaigns = result.items.map(c => ({
                _id: c._id,
                campaignName: c.campaignName || '',
                templateName: c.templateName || '',
                imageUrl: c.imageUrl || '',
parameters: c.parameters || '[]',
buttonUrl: c.buttonUrl || '',
                lastUsed: c.lastUsed || null,
                timesUsed: c.timesUsed || 0,
                active: c.active
            }));

            console.log(TAG, `✅ ${campaigns.length} campañas encontradas`);
            return { ok: true, campaigns, total: campaigns.length };

        } catch (e) {
            console.error(TAG, '❌ listarCampaigns:', e.message);
            return { ok: false, error: e.message, campaigns: [] };
        }
    }
);

/**
 * v1.5.0 — Actualiza lastUsed y timesUsed tras un envío.
 */
export const actualizarCampaignUso = webMethod(
    Permissions.SiteMember,
    async ({ _id }) => {
        try {
            if (!_id) return { ok: false, error: 'Falta _id' };

            const campaign = await wixData.get(COL_CAMPAIGNS, _id, { suppressAuth: true });
            if (!campaign) return { ok: false, error: 'Campaña no encontrada' };

            campaign.lastUsed = new Date();
            campaign.timesUsed = (campaign.timesUsed || 0) + 1;

            await wixData.update(COL_CAMPAIGNS, campaign, { suppressAuth: true });
            console.log(TAG, `✅ Campaña uso actualizado: ${_id} (${campaign.timesUsed} veces)`);

            return { ok: true };

        } catch (e) {
            console.error(TAG, '❌ actualizarCampaignUso:', e.message);
            return { ok: false, error: e.message };
        }
    }
);

