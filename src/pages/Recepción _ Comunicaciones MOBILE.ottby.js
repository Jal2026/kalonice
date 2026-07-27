/**
 * ============================================================
 *  pagecode_comunicaciones.js — KAMISUITE Comunicaciones
 * ============================================================
 *  v1.4.0  ·  23 Mayo 2026
 * ------------------------------------------------------------
 *  CHANGELOG
 *  ---------
 *  v1.4.0 (23-May-2026) — AdServer: segmentación de audiencias
 *    - Import adserverLogic.web (getSegmentosDisponibles,
 *      getClientesPorServicio, getClientesPorLabel).
 *    - Nuevos handlers: handleGetSegmentos, handleFiltrarPorSegmento,
 *      handleFiltrarPorLabel.
 *    - Fix handleBuscarContactos: lógica especial para **ALL**
 *      que devuelve todos los contactos con teléfono.
 *  v1.3.0 (17-May-2026) — Botón CTA dinámico
 *    - handleEnviarIndividual: propaga buttonUrl a
 *      enviarTemplateConImagenExport.
 *    - handleEnviarBroadcast: propaga buttonUrl global a
 *      enviarBroadcast (fallback; el por-destinatario viaja
 *      dentro de cada objeto dest).
 *  v1.2.0 (15-May-2026) — Campañas persistentes
 *    - Handler saveCampaign, loadCampaigns, campaignSent
 *  v1.1.0 (15-May-2026) — Subida imagen + galería
 *  v1.0.0 (12-May-2026) — Versión inicial
 * ============================================================
 */

import {
    enviarTemplateGenerico,
    enviarTemplateConImagenExport,
    enviarBroadcast,
    getEstadoTemplates,
    getHistorialEnvios,
    getTemplatesDisponibles,
    uploadImagenMarketing,
    listarImagenesMedia,
    guardarCampaign,
    listarCampaigns,
    actualizarCampaignUso
} from 'backend/whatsappLogic.web';

import {
    cargarTodosContactos
} from 'backend/recepcionLogic.web';

// v1.4.0: AdServer — segmentación de audiencias
import {
    getSegmentosDisponibles,
    getClientesPorServicio,
    getClientesPorLabel
} from 'backend/adserverLogic.web';

const TAG = '[Comunicaciones v1.4.0]';

let cacheContactos = [];
let cacheReady = false;

function sendResponse(type, data = {}) {
    $w('#htmlComunicaciones').postMessage({ type, ...data, ts: Date.now() });
}

$w.onReady(function () {
    console.log(TAG, 'Página lista');

    $w('#htmlComunicaciones').onMessage(async (event) => {
        const msg = event.data;
        if (!msg || !msg.type) return;
        console.log(TAG, '← Widget:', msg.type);

        switch (msg.type) {
            case 'ready': cargarCache(); break;
            case 'getTemplates': handleGetTemplates(); break;
            case 'getEstadoMeta': handleGetEstadoMeta(); break;
            case 'getHistorial': handleGetHistorial(msg); break;
            case 'enviarBroadcast': handleEnviarBroadcast(msg); break;
            case 'enviarIndividual': handleEnviarIndividual(msg); break;
            case 'buscarContactos': handleBuscarContactos(msg); break;
            case 'uploadMarketingImage': handleUploadMarketingImage(msg); break;
            case 'listMediaImages': handleListMediaImages(msg); break;
            case 'saveCampaign': handleSaveCampaign(msg); break;
            case 'loadCampaigns': handleLoadCampaigns(msg); break;
            case 'campaignSent': handleCampaignSent(msg); break;
            // v1.4.0: AdServer
            case 'getSegmentos': handleGetSegmentos(); break;
            case 'filtrarPorSegmento': handleFiltrarPorSegmento(msg); break;
            case 'filtrarPorLabel': handleFiltrarPorLabel(msg); break;
            default: console.warn(TAG, 'Tipo desconocido:', msg.type);
        }
    });
});

// ── Cache de contactos ──────────────────────────────────────

async function cargarCache() {
    sendResponse('loading', { message: 'Cargando contactos...' });
    try {
        const result = await cargarTodosContactos();
        if (result.ok) {
            cacheContactos = result.clientes || [];
            cacheReady = true;
            const conTelefono = cacheContactos.filter(c => c.telefono && c.telefono.trim() !== '');
            sendResponse('cacheReady', { total: cacheContactos.length, conTelefono: conTelefono.length });
            console.log(TAG, `Caché: ${cacheContactos.length} contactos, ${conTelefono.length} con teléfono`);
        } else {
            sendResponse('error', { message: 'Error cargando contactos' });
        }
    } catch (e) {
        console.error(TAG, '❌ cargarCache:', e);
        sendResponse('error', { message: 'Error cargando contactos' });
    }
}

// ── Handlers existentes (sin cambios) ───────────────────────

async function handleGetTemplates() {
    try {
        const result = await getTemplatesDisponibles();
        sendResponse('templatesCargados', { templates: result.templates || [] });
    } catch (e) {
        console.error(TAG, '❌ getTemplates:', e);
        sendResponse('templatesCargados', { templates: [] });
    }
}

async function handleGetEstadoMeta() {
    try {
        sendResponse('loading', { message: 'Consultando META...' });
        const result = await getEstadoTemplates();
        sendResponse('estadoMeta', { ok: result.ok, templates: result.templates || [], error: result.error || '' });
    } catch (e) {
        console.error(TAG, '❌ getEstadoMeta:', e);
        sendResponse('estadoMeta', { ok: false, templates: [], error: e.message });
    }
}

async function handleGetHistorial(msg) {
    try {
        const result = await getHistorialEnvios({ channel: msg.channel || '', event: msg.event || '', limit: msg.limit || 50 });
        sendResponse('historialCargado', { registros: result.registros || [], total: result.total || 0 });
    } catch (e) {
        console.error(TAG, '❌ getHistorial:', e);
        sendResponse('historialCargado', { registros: [], total: 0 });
    }
}

// ── handleEnviarBroadcast — v1.3.0: propaga buttonUrl global ──

async function handleEnviarBroadcast(msg) {
    try {
        sendResponse('broadcastProgress', { message: `Enviando a ${(msg.destinatarios || []).length} contactos...`, fase: 'enviando' });
        const result = await enviarBroadcast({
            templateName: msg.templateName,
            destinatarios: msg.destinatarios || [],
            eventType: msg.eventType || msg.templateName,
            imageUrl: msg.imageUrl || '',
            buttonUrl: msg.buttonUrl || ''
        });
        sendResponse('broadcastCompletado', {
            ok: result.ok, total: result.total, enviados: result.enviados,
            fallidos: result.fallidos, errores: result.errores || []
        });
    } catch (e) {
        console.error(TAG, '❌ enviarBroadcast:', e);
        sendResponse('broadcastCompletado', { ok: false, total: 0, enviados: 0, fallidos: 0, errores: [{ nombre: 'Sistema', error: e.message }] });
    }
}

// ── handleEnviarIndividual — v1.3.0: propaga buttonUrl ───────

async function handleEnviarIndividual(msg) {
    try {
        let result;
        if (msg.imageUrl) {
            result = await enviarTemplateConImagenExport({
                telefono: msg.telefono,
                nombreCliente: msg.nombreCliente || '',
                templateName: msg.templateName,
                parameters: msg.parameters || [],
                imageUrl: msg.imageUrl,
                eventType: msg.eventType || msg.templateName,
                buttonUrl: msg.buttonUrl || ''
            });
        } else {
            result = await enviarTemplateGenerico({
                telefono: msg.telefono,
                nombreCliente: msg.nombreCliente || '',
                templateName: msg.templateName,
                parameters: msg.parameters || [],
                eventType: msg.eventType || msg.templateName
            });
        }
        sendResponse('envioIndividualCompletado', { ok: result.ok, telefono: result.telefono || msg.telefono, error: result.error || '' });
    } catch (e) {
        console.error(TAG, '❌ enviarIndividual:', e);
        sendResponse('envioIndividualCompletado', { ok: false, error: e.message });
    }
}

// ── handleBuscarContactos — v1.4.0: fix **ALL** ─────────────────

function handleBuscarContactos(msg) {
    const query = String(msg.query || '').trim();

    // v1.4.0: lógica especial para "Todos"
    if (query === '**ALL**') {
        const conTelefono = cacheContactos.filter(c => c.telefono && c.telefono.trim() !== '');
        sendResponse('contactosEncontrados', { contactos: conTelefono, total: conTelefono.length });
        return;
    }

    const queryLower = query.toLowerCase();
    if (queryLower.length < 2) { sendResponse('contactosEncontrados', { contactos: [], total: 0 }); return; }

    const searchPhone = queryLower.replace(/[\s\-\(\)]/g, '');
    const filtered = cacheContactos.filter(c => {
        const nombre = (c.nombreCompleto || '').toLowerCase();
        const telefono = (c.telefono || '').replace(/[\s\-\(\)]/g, '');
        const email = (c.email || '').toLowerCase();
        return nombre.includes(queryLower) || telefono.includes(searchPhone) || email.includes(queryLower);
    });
    const conTelefono = filtered.filter(c => c.telefono && c.telefono.trim() !== '');
    sendResponse('contactosEncontrados', { contactos: conTelefono.slice(0, 30), total: conTelefono.length });
}

// ── Handlers imagen v1.1.0 ──────────────────────────────────

async function handleUploadMarketingImage(msg) {
    try {
        console.log(TAG, '📸 Subiendo imagen marketing:', msg.fileName);
        sendResponse('loading', { message: 'Subiendo imagen...' });
        const result = await uploadImagenMarketing({ base64Data: msg.base64Data, fileName: msg.fileName || 'marketing_image.jpg', mimeType: msg.mimeType || 'image/jpeg' });
        if (result.ok && result.publicUrl) {
            console.log(TAG, '✅ Imagen marketing subida:', result.publicUrl);
            sendResponse('marketingImageReady', { publicUrl: result.publicUrl });
        } else {
            console.error(TAG, '❌ Error subiendo imagen marketing:', result.error);
            sendResponse('marketingImageError', { error: result.error || 'Error desconocido al subir imagen' });
        }
    } catch (e) {
        console.error(TAG, '❌ Error subiendo imagen marketing:', e);
        sendResponse('marketingImageError', { error: e.message || 'Error desconocido' });
    }
}

async function handleListMediaImages(msg) {
    try {
        console.log(TAG, '🖼️ Listando imágenes del Media Manager');
        sendResponse('loading', { message: 'Cargando galería...' });
        const result = await listarImagenesMedia({ folder: msg.folder || null, limit: msg.limit || 50 });
        if (result.ok) {
            sendResponse('mediaImagesLoaded', { imagenes: result.imagenes || [], total: result.total || 0 });
        } else {
            sendResponse('mediaImagesError', { error: result.error || 'Error listando imágenes' });
        }
    } catch (e) {
        console.error(TAG, '❌ Error listando imágenes:', e);
        sendResponse('mediaImagesError', { error: e.message || 'Error desconocido' });
    }
}

// ── Handlers campañas v1.2.0 ────────────────────────────────

async function handleSaveCampaign(msg) {
    try {
        console.log(TAG, '💾 Guardando campaña:', msg.campaignName);
        sendResponse('loading', { message: 'Guardando campaña...' });
        const result = await guardarCampaign({
            _id: msg._id || null,
            templateName: msg.templateName,
            campaignName: msg.campaignName,
            imageUrl: msg.imageUrl || '',
            parameters: msg.parameters || '[]',
            buttonUrl: msg.buttonUrl || ''
        });
        if (result.ok) {
            sendResponse('campaignSaved', { campaign: result.campaign });
        } else {
            sendResponse('campaignSaveError', { error: result.error });
        }
    } catch (e) {
        console.error(TAG, '❌ Error guardando campaña:', e);
        sendResponse('campaignSaveError', { error: e.message });
    }
}

async function handleLoadCampaigns(msg) {
    try {
        console.log(TAG, '📋 Cargando campañas:', msg.templateName || 'todas');
        const result = await listarCampaigns({ templateName: msg.templateName || '' });
        if (result.ok) {
            sendResponse('campaignsLoaded', { campaigns: result.campaigns || [] });
        } else {
            sendResponse('campaignsLoaded', { campaigns: [] });
        }
    } catch (e) {
        console.error(TAG, '❌ Error cargando campañas:', e);
        sendResponse('campaignsLoaded', { campaigns: [] });
    }
}

async function handleCampaignSent(msg) {
    try {
        if (msg._id) {
            await actualizarCampaignUso({ _id: msg._id });
            console.log(TAG, '✅ Uso de campaña actualizado:', msg._id);
        }
    } catch (e) {
        console.error(TAG, '⚠️ Error actualizando uso campaña (no crítico):', e.message);
    }
}

// ═══════════════════════════════════════════════════════════════
// v1.4.0: HANDLERS ADSERVER — Segmentación de audiencias
// ═══════════════════════════════════════════════════════════════

// ── getSegmentos: devuelve categorías disponibles al widget ──

async function handleGetSegmentos() {
    try {
        const result = await getSegmentosDisponibles();
        sendResponse('segmentosCargados', { segmentos: result.segmentos || [] });
    } catch (e) {
        console.error(TAG, '❌ getSegmentos:', e);
        sendResponse('segmentosCargados', { segmentos: [] });
    }
}

// ── filtrarPorSegmento: cruza nombres de PaymentReservations
//    con cacheContactos para devolver solo los que tienen teléfono ──

async function handleFiltrarPorSegmento(msg) {
    try {
        console.log(TAG, '🎯 Filtrar por segmento:', msg.segmento);
        sendResponse('loading', { message: 'Segmentando audiencia...' });

        const result = await getClientesPorServicio({ segmento: msg.segmento });
        if (!result.ok) {
            sendResponse('segmentoFiltrado', { contactos: [], total: 0, segmento: msg.segmento, error: result.error });
            return;
        }

        // Cruzar nombres del backend con cacheContactos
        // Mismo patrón que careProfileLogic: comparación en lowercase
        const nombresSet = new Set(result.nombres.map(n => n.toLowerCase()));

        const contactosFiltrados = cacheContactos.filter(c => {
            if (!c.telefono || !c.telefono.trim()) return false;
            const nombre = (c.nombreCompleto || '').toLowerCase();
            return nombresSet.has(nombre);
        });

        console.log(TAG, `Segmento ${msg.segmento}: ${result.total} nombres → ${contactosFiltrados.length} contactos con teléfono`);
        sendResponse('segmentoFiltrado', { contactos: contactosFiltrados, total: contactosFiltrados.length, segmento: msg.segmento });

    } catch (e) {
        console.error(TAG, '❌ filtrarPorSegmento:', e);
        sendResponse('segmentoFiltrado', { contactos: [], total: 0, segmento: msg.segmento, error: e.message });
    }
}

// ── filtrarPorLabel: filtra contactos CRM por etiqueta,
//    cruza con cacheContactos para formato consistente ──

async function handleFiltrarPorLabel(msg) {
    try {
        console.log(TAG, '🏷️ Filtrar por label:', msg.labelName);
        sendResponse('loading', { message: 'Filtrando por etiqueta...' });

        const result = await getClientesPorLabel({ labelName: msg.labelName });
        if (!result.ok) {
            sendResponse('labelFiltrado', { contactos: [], total: 0, labelName: msg.labelName, error: result.error });
            return;
        }

        // Cruzar contactos del backend con cacheContactos para usar
        // el mismo formato (nombreCompleto, telefono, contactId, email)
        // que el widget ya espera de contactosEncontrados.
        const contactIdsSet = new Set(result.contactos.map(c => c.contactId));

        const contactosFiltrados = cacheContactos.filter(c => {
            if (!c.telefono || !c.telefono.trim()) return false;
            return contactIdsSet.has(c.contactId);
        });

        console.log(TAG, `Label "${msg.labelName}": ${result.total} contactos CRM → ${contactosFiltrados.length} con teléfono en caché`);
        sendResponse('labelFiltrado', { contactos: contactosFiltrados, total: contactosFiltrados.length, labelName: msg.labelName });

    } catch (e) {
        console.error(TAG, '❌ filtrarPorLabel:', e);
        sendResponse('labelFiltrado', { contactos: [], total: 0, labelName: msg.labelName, error: e.message });
    }
}