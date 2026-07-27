// =====================================================
// KAMISUITE - Bonos y Promociones (Página Pública) - Page Code
// =====================================================
// PÁGINA: /bonosypromociones (pública, frontend)
// WIDGET: #htmlBonosPromos (HTML embed con bonosypromociones.html)
//
// VERSIÓN: 1.0.2
// FECHA: 24 de junio de 2026
//
// Bridge entre el widget HTML público y el backend
// bonosPromosPublicLogic.web.js v1.0.1.
//
// PATRÓN WIX PAY: copiado literal del legacy HairTimes V1
// (pagecode_PromoGiftCards).
//
// PATRÓN HTML COMPONENT (NO Custom Element): widget.onMessage(event) +
// widget.postMessage(obj). NUNCA html.on('message') (no funciona en Wix).
//
// CHANGELOG:
// v1.0.2 - Propaga termsConditionsUrl al widget en el bootstrap. El
//          widget pinta un checkbox de aceptación de T&C en la vista
//          de checkout, antes del botón Pagar, activado por defecto.
//          termsConditionsUrl viene de SalonConfig vía getSalonConfig()
//          (ya en producción, sin cambios en backend).
// v1.0.1 - · Lee SalonConfig.widgetSkin (campo Text existente en
//            SalonConfig, default 'niebla') vía getSalonConfig() del
//            backend de producción widgetPublicoLogic.web. La misma
//            fuente de verdad que usa el widget público de reservas.
//          · Bootstrap paraleliza dos llamadas (getActiveCampaigns +
//            getSalonConfig) y envía el skin al widget junto con las
//            campañas. Una sola elección visual para todo el salón.
// v1.0.0 - Versión inicial F2.1.
//
// MENSAJES ENTRANTES (widget → page code):
//   ready                  Cargar catálogo + skin del salón.
//   purchase  payload:{...} Iniciar compra (validar login + crear payment).
//
// MENSAJES SALIENTES (page code → widget):
//   bootstrap        { campaigns, skin }     ← v1.0.1
//   loginRequired    { }
//   purchaseSuccess  { code, expirationDate, isGift, recipientName, recipientEmail }
//   purchaseCancelled{ }
//   purchaseError    { message }
//   error            { message }
//
// AJUSTE PRE-PUBLICACIÓN: confirmar el ID exacto del HTML Component en
// el editor Wix. La constante WIDGET_ID asume '#htmlBonosPromos'.
// =====================================================

import {
  getActiveCampaigns,
  createPromoCardCheckout,
  confirmPromoCardPayment,
  cancelPromoCardPayment
} from 'backend/bonosPromosPublicLogic.web';

// v1.0.1 — Fuente del skin del salón. Misma función que usa el widget
// público de reservas (kami-reserva) para mantener identidad visual
// unificada del salón.
import { getSalonConfig } from 'backend/widgetPublicoLogic.web';

import wixPayFrontend from 'wix-pay-frontend';
import { authentication, currentMember } from 'wix-members-frontend';

const TAG = '[BonosPromosPublic v1.0.2]';
const WIDGET_ID = '#htmlBonosPromos';

$w.onReady(function () {
  console.log(`${TAG} ✅ Página pública cargada`);

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

        case 'purchase':
          await procesarCompra(widget, msg.payload);
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
// BOOTSTRAP — carga campañas + skin del salón
// ═══════════════════════════════════════════════════
async function enviarBootstrap(widget) {
  const [rCampaigns, rSalon] = await Promise.all([
    getActiveCampaigns(),
    getSalonConfig().catch(e => {
      // getSalonConfig puede no estar disponible o fallar; el widget
      // tira con 'niebla' por defecto si no llega skin.
      console.warn(`${TAG} ⚠️ getSalonConfig falló, usando default niebla:`, e && e.message);
      return null;
    })
  ]);

  // Resolución defensiva: el backend devuelve { ok, config } o
  // { success, config } según la versión. Toleramos ambas formas.
  let skin = 'niebla';
  let termsConditionsUrl = '';
  if (rSalon) {
    const cfg = rSalon.config || rSalon;
    if (cfg && cfg.widgetSkin && typeof cfg.widgetSkin === 'string') {
      skin = cfg.widgetSkin;
    }
    if (cfg && cfg.termsConditionsUrl && typeof cfg.termsConditionsUrl === 'string') {
      termsConditionsUrl = cfg.termsConditionsUrl;
    }
  }

  widget.postMessage({
    type: 'bootstrap',
    payload: {
      campaigns: (rCampaigns && rCampaigns.success) ? rCampaigns.campaigns : [],
      skin: skin,
      termsConditionsUrl: termsConditionsUrl
    }
  });
}

// ═══════════════════════════════════════════════════
// FLUJO DE COMPRA
// ═══════════════════════════════════════════════════
async function procesarCompra(widget, payload) {
  // 1) Verificar Wix Member logado. Si no, abrir prompt de login y abortar.
  let logged = false;
  try {
    const member = await currentMember.getMember();
    logged = !!(member && member._id);
  } catch (_) {
    logged = false;
  }

  if (!logged) {
    console.log(`${TAG} 🔒 No logado, abriendo prompt de login`);
    widget.postMessage({ type: 'loginRequired' });
    try {
      await authentication.promptLogin({ mode: 'login' });
    } catch (loginErr) {
      console.log(`${TAG} 🔒 Login cancelado por el usuario`);
      return;
    }
    return;
  }

  // 2) Crear checkout en backend.
  const r = await createPromoCardCheckout(payload || {});
  if (!r.success) {
    widget.postMessage({ type: 'purchaseError', message: r.error || 'No se pudo iniciar la compra' });
    return;
  }

  const { paymentId, code, promoCardId } = r;
  console.log(`${TAG} 💳 Iniciando popup de pago: paymentId=${paymentId}`);

  // 3) Abrir popup nativo de Wix Pay.
  let paymentResult;
  try {
    paymentResult = await wixPayFrontend.startPayment(paymentId, {
      showThankYouPage: false
    });
  } catch (payErr) {
    console.error(`${TAG} ❌ Error en startPayment:`, payErr);
    await cancelPromoCardPayment({ promoCardId, paymentId });
    widget.postMessage({ type: 'purchaseError', message: 'Error en la pasarela de pago' });
    return;
  }

  console.log(`${TAG} 💳 paymentResult.status =`, paymentResult && paymentResult.status);

  // 4) Resolver según resultado.
  if (paymentResult && paymentResult.status === 'Successful') {
    const c = await confirmPromoCardPayment({ promoCardId, paymentId });
    if (c.success) {
      widget.postMessage({
        type: 'purchaseSuccess',
        payload: {
          code: c.code,
          expirationDate: c.expirationDate || null,
          isGift: !!c.isGift,
          recipientName: c.recipientName || '',
          recipientEmail: c.recipientEmail || ''
        }
      });
    } else {
      widget.postMessage({
        type: 'purchaseError',
        message: c.error || 'El pago se completó pero la confirmación falló. Contacta con el salón.'
      });
    }
    return;
  }

  if (paymentResult && paymentResult.status === 'Cancelled') {
    await cancelPromoCardPayment({ promoCardId, paymentId });
    widget.postMessage({ type: 'purchaseCancelled' });
    return;
  }

  // Otro estado (Failed, Pending, etc.).
  await cancelPromoCardPayment({ promoCardId, paymentId });
  widget.postMessage({
    type: 'purchaseError',
    message: (paymentResult && paymentResult.status) ? `El pago no se completó (${paymentResult.status})` : 'El pago no se completó'
  });
}