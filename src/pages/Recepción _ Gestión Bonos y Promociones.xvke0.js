// =====================================================
// KAMISUITE - Editor de Productos Custom - Page Code
// =====================================================
// PÁGINA: /gestorbonosypromociones (admin, interna)
// WIDGET: #htmlGestorBonosPromos (HTML embed con gestorbonosypromociones.html)
//
// VERSIÓN: 1.0.1
// FECHA: 22 de junio de 2026
//
// Bridge entre el widget HTML del editor unificado (tres pestañas:
// PRIME · BONOS · TARJETAS PROMOCIONALES) y el backend
// productosKamisuiteLogic.web.js v1.0.1.
//
// PATRÓN: HTML Component clásico. Copia literal de
// pagecode_edicioncategorias.js v1.0.0.
//   · widget.onMessage(event)  → recibir mensajes del widget HTML
//   · widget.postMessage(obj)  → enviar respuesta al widget HTML
//   · NUNCA html.on('message') (no funciona en Wix).
//
// CHANGELOG:
// v1.0.1 - · Importa el nuevo listarTodosServiciosActivos del backend.
//          · Bootstrap paraleliza 7 queries (antes 6): añade carga de
//            todos los servicios activos para el selector de campañas.
//          · Nuevo handler 'listarTodosServicios' para refresco manual.
//          · El payload bootstrap incluye 'todosServicios'.
//          · Eliminado el handler 'uploadConfigImage' SOLO conceptualmente:
//            el front v1.0.1 ya no envía 'saveConfig' con promoCardsActive
//            (cada campaña tiene su toggle), pero el bridge no necesita
//            cambios — el backend acepta payload parcial y simplemente
//            no toca el campo si no llega.
// v1.0.0 - Versión inicial.
//
// MENSAJES ENTRANTES (widget → page code), discriminados por msg.type:
//   ready, getConfig, saveConfig, uploadConfigImage, uploadCampaignImage,
//   listarServiciosConBono, listarTodosServicios (NUEVO v1.0.1),
//   listarPromoCampaigns, crearPromoCampaign, actualizarPromoCampaign,
//   eliminarPromoCampaign,
//   listarPrimeMemberships, listarVouchers, listarPromoCards,
//   revocarPrimeMembership, revocarVoucher, revocarPromoCard.
//
// MENSAJES SALIENTES (page code → widget):
//   bootstrap, config, configSaved, configSaveError,
//   imageUploaded, imageUploadError,
//   serviciosConBono, todosServicios (NUEVO v1.0.1),
//   campaigns, campaignSaved, campaignDeleted, campaignError,
//   memberships, vouchers, cards,
//   revoked, revokeError, error.
//
// AJUSTE PRE-PUBLICACIÓN: confirmar el ID exacto del HTML Component en el
// editor Wix. La constante WIDGET_ID asume '#htmlGestorBonosPromos'.
// =====================================================

import {
  getProductosConfig,
  actualizarProductosConfig,
  uploadImagenProductos,
  listarServiciosConBono,
  listarTodosServiciosActivos,
  listarPromoCampaigns,
  crearPromoCampaign,
  actualizarPromoCampaign,
  eliminarPromoCampaign,
  listarPrimeMembershipsEmitidas,
  listarVouchersEmitidos,
  listarPromoCardsEmitidas,
  revocarPrimeMembership,
  revocarVoucher,
  revocarPromoCard
} from 'backend/productosKamisuiteLogic.web';

const TAG = '[GestorBonosPromos v1.0.1]';
const WIDGET_ID = '#htmlGestorBonosPromos';

$w.onReady(async function () {
  console.log(`${TAG} ✅ Página cargada`);

  const widget = $w(WIDGET_ID);

  widget.onMessage(async (event) => {
    const msg = event.data;
    if (!msg || typeof msg !== 'object') return;

    console.log(`${TAG} 📩 ${msg.type || '(sin type)'}`);

    try {
      switch (msg.type) {

        case 'ready':
          await enviarBootstrap(widget);
          break;

        case 'getConfig':
          await enviarConfig(widget);
          break;

        case 'saveConfig':
          await guardarConfig(widget, msg.payload);
          break;

        case 'uploadConfigImage':
          await subirImagenConfig(widget, msg.payload);
          break;

        case 'uploadCampaignImage':
          await subirImagenCampaign(widget, msg.payload);
          break;

        case 'listarServiciosConBono':
          await enviarServiciosConBono(widget);
          break;

        case 'listarTodosServicios':
          await enviarTodosServicios(widget);
          break;

        case 'listarPromoCampaigns':
          await enviarCampaigns(widget);
          break;

        case 'crearPromoCampaign':
          await crearCampaign(widget, msg.payload);
          break;

        case 'actualizarPromoCampaign':
          await actualizarCampaign(widget, msg.payload);
          break;

        case 'eliminarPromoCampaign':
          await eliminarCampaign(widget, msg.payload);
          break;

        case 'listarPrimeMemberships':
          await enviarMemberships(widget, msg.payload);
          break;

        case 'listarVouchers':
          await enviarVouchers(widget, msg.payload);
          break;

        case 'listarPromoCards':
          await enviarCards(widget, msg.payload);
          break;

        case 'revocarPrimeMembership':
          await revocarMembershipHandler(widget, msg.payload);
          break;

        case 'revocarVoucher':
          await revocarVoucherHandler(widget, msg.payload);
          break;

        case 'revocarPromoCard':
          await revocarCardHandler(widget, msg.payload);
          break;

        default:
          console.warn(`${TAG} ⚠️ Mensaje no reconocido:`, msg.type);
      }

    } catch (err) {
      console.error(`${TAG} ❌ Error procesando ${msg.type}:`, err);
      widget.postMessage({ type: 'error', message: err.message || String(err) });
    }
  });
});

// ═══════════════════════════════════════════════════
// BOOTSTRAP — carga inicial de todo el estado
// ═══════════════════════════════════════════════════
async function enviarBootstrap(widget) {
  console.log(`${TAG} 🚀 Bootstrap`);

  const [
    rConfig,
    rServiciosBono,
    rTodosServicios,
    rCampaigns,
    rMemberships,
    rVouchers,
    rCards
  ] = await Promise.all([
    getProductosConfig(),
    listarServiciosConBono(),
    listarTodosServiciosActivos(),
    listarPromoCampaigns(),
    listarPrimeMembershipsEmitidas({}),
    listarVouchersEmitidos({}),
    listarPromoCardsEmitidas({})
  ]);

  widget.postMessage({
    type: 'bootstrap',
    payload: {
      config: rConfig.success ? rConfig.config : null,
      serviciosConBono: rServiciosBono.success ? rServiciosBono.servicios : [],
      todosServicios: rTodosServicios.success ? rTodosServicios.servicios : [],
      campaigns: rCampaigns.success ? rCampaigns.campaigns : [],
      memberships: rMemberships.success ? rMemberships.memberships : [],
      vouchers: rVouchers.success ? rVouchers.vouchers : [],
      cards: rCards.success ? rCards.cards : []
    }
  });

  console.log(`${TAG} ✅ Bootstrap enviado`);
}

// ═══════════════════════════════════════════════════
// CONFIG (KamisuiteProductsConfig)
// ═══════════════════════════════════════════════════
async function enviarConfig(widget) {
  const r = await getProductosConfig();
  if (r.success) {
    widget.postMessage({ type: 'config', payload: { config: r.config } });
  } else {
    widget.postMessage({ type: 'error', message: r.error });
  }
}

async function guardarConfig(widget, payload) {
  const r = await actualizarProductosConfig(payload || {});
  if (r.success) {
    widget.postMessage({ type: 'configSaved', payload: { config: r.config } });
  } else {
    widget.postMessage({ type: 'configSaveError', message: r.error });
  }
}

// ═══════════════════════════════════════════════════
// UPLOAD DE IMÁGENES
// ═══════════════════════════════════════════════════
async function subirImagenConfig(widget, payload) {
  const { base64Data, fileName, mimeType, campo } = payload || {};
  const r = await uploadImagenProductos({
    base64Data,
    fileName,
    mimeType,
    target: 'config',
    campo: campo || 'primeImage'
  });
  if (r.ok) {
    widget.postMessage({
      type: 'imageUploaded',
      payload: { target: 'config', campo: campo || 'primeImage', fileUrl: r.fileUrl, publicUrl: r.publicUrl }
    });
  } else {
    widget.postMessage({ type: 'imageUploadError', message: r.error });
  }
}

async function subirImagenCampaign(widget, payload) {
  const { campaignId, base64Data, fileName, mimeType } = payload || {};
  const r = await uploadImagenProductos({
    base64Data,
    fileName,
    mimeType,
    target: 'campaign',
    campo: 'image',
    campaignId
  });
  if (r.ok) {
    widget.postMessage({
      type: 'imageUploaded',
      payload: { target: 'campaign', campo: 'image', campaignId, fileUrl: r.fileUrl, publicUrl: r.publicUrl }
    });
  } else {
    widget.postMessage({ type: 'imageUploadError', message: r.error });
  }
}

// ═══════════════════════════════════════════════════
// SERVICIOS
// ═══════════════════════════════════════════════════
async function enviarServiciosConBono(widget) {
  const r = await listarServiciosConBono();
  if (r.success) {
    widget.postMessage({ type: 'serviciosConBono', payload: { servicios: r.servicios } });
  } else {
    widget.postMessage({ type: 'error', message: r.error });
  }
}

async function enviarTodosServicios(widget) {
  const r = await listarTodosServiciosActivos();
  if (r.success) {
    widget.postMessage({ type: 'todosServicios', payload: { servicios: r.servicios } });
  } else {
    widget.postMessage({ type: 'error', message: r.error });
  }
}

// ═══════════════════════════════════════════════════
// PROMO CAMPAIGNS (CRUD)
// ═══════════════════════════════════════════════════
async function enviarCampaigns(widget) {
  const r = await listarPromoCampaigns();
  if (r.success) {
    widget.postMessage({ type: 'campaigns', payload: { campaigns: r.campaigns } });
  } else {
    widget.postMessage({ type: 'error', message: r.error });
  }
}

async function crearCampaign(widget, payload) {
  const r = await crearPromoCampaign(payload || {});
  if (r.success) {
    widget.postMessage({ type: 'campaignSaved', payload: { campaign: r.campaign } });
  } else {
    widget.postMessage({ type: 'campaignError', message: r.error });
  }
}

async function actualizarCampaign(widget, payload) {
  const r = await actualizarPromoCampaign(payload || {});
  if (r.success) {
    widget.postMessage({ type: 'campaignSaved', payload: { campaign: r.campaign } });
  } else {
    widget.postMessage({ type: 'campaignError', message: r.error });
  }
}

async function eliminarCampaign(widget, payload) {
  const r = await eliminarPromoCampaign(payload || {});
  if (r.success) {
    widget.postMessage({ type: 'campaignDeleted', payload: { _id: r._id } });
  } else {
    widget.postMessage({ type: 'campaignError', message: r.error });
  }
}

// ═══════════════════════════════════════════════════
// LISTADOS DE EMISIONES
// ═══════════════════════════════════════════════════
async function enviarMemberships(widget, filtros) {
  const r = await listarPrimeMembershipsEmitidas(filtros || {});
  if (r.success) {
    widget.postMessage({ type: 'memberships', payload: { memberships: r.memberships } });
  } else {
    widget.postMessage({ type: 'error', message: r.error });
  }
}

async function enviarVouchers(widget, filtros) {
  const r = await listarVouchersEmitidos(filtros || {});
  if (r.success) {
    widget.postMessage({ type: 'vouchers', payload: { vouchers: r.vouchers } });
  } else {
    widget.postMessage({ type: 'error', message: r.error });
  }
}

async function enviarCards(widget, filtros) {
  const r = await listarPromoCardsEmitidas(filtros || {});
  if (r.success) {
    widget.postMessage({ type: 'cards', payload: { cards: r.cards } });
  } else {
    widget.postMessage({ type: 'error', message: r.error });
  }
}

// ═══════════════════════════════════════════════════
// REVOCACIÓN MANUAL
// ═══════════════════════════════════════════════════
async function revocarMembershipHandler(widget, payload) {
  const r = await revocarPrimeMembership(payload || {});
  if (r.success) {
    widget.postMessage({ type: 'revoked', payload: { kind: 'prime', _id: r._id, status: r.status } });
  } else {
    widget.postMessage({ type: 'revokeError', message: r.error, kind: 'prime' });
  }
}

async function revocarVoucherHandler(widget, payload) {
  const r = await revocarVoucher(payload || {});
  if (r.success) {
    widget.postMessage({ type: 'revoked', payload: { kind: 'voucher', _id: r._id, status: r.status } });
  } else {
    widget.postMessage({ type: 'revokeError', message: r.error, kind: 'voucher' });
  }
}

async function revocarCardHandler(widget, payload) {
  const r = await revocarPromoCard(payload || {});
  if (r.success) {
    widget.postMessage({ type: 'revoked', payload: { kind: 'card', _id: r._id, status: r.status } });
  } else {
    widget.postMessage({ type: 'revokeError', message: r.error, kind: 'card' });
  }
}