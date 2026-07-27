// =====================================================
// KAMISUITE - Tarjeta PRIME (Página Pública) - Page Code
// =====================================================
// PÁGINA: /tarjetaprime (pública, frontend)
// WIDGET: #htmlTarjetaPrime (HTML embed con tarjetaprime.html)
//
// VERSIÓN: 1.0.0
// FECHA: 23 de junio de 2026
//
// Bridge entre el widget HTML público de PRIME y el backend
// primePublicLogic.web.js v1.0.0.
//
// PATRÓN WIX PAY + WIX MEMBERS + SKIN: idéntico a F2.1
// (pagecode_bonosypromociones v1.0.1).
//
// MENSAJES ENTRANTES (widget → page code):
//   ready                 Cargar producto + skin + estado del miembro.
//   purchase              Iniciar compra (Wix Member obligatorio).
//
// MENSAJES SALIENTES (page code → widget):
//   bootstrap         { product, skin, member }
//   loginRequired     { }
//   purchaseSuccess   { code, issueDate, expirationDate }
//   purchaseCancelled { }
//   purchaseError     { message }
//   alreadyPrime      { membership }
//   error             { message }
//
// AJUSTE PRE-PUBLICACIÓN: confirmar el ID exacto del HTML Component.
// La constante WIDGET_ID asume '#htmlTarjetaPrime'.
// =====================================================

import {
  getPrimeSalonInfo,
  getPrimeProduct,
  getCurrentMemberPrimeStatus,
  createPrimeCheckout,
  confirmPrimePayment,
  cancelPrimePayment
} from 'backend/primePublicLogic.web';

import wixPayFrontend from 'wix-pay-frontend';
import { authentication, currentMember } from 'wix-members-frontend';

const TAG = '[TarjetaPrime v1.0.2]';
const WIDGET_ID = '#htmlTarjetaPrime';

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
// BOOTSTRAP — producto + skin + estado del miembro
// ═══════════════════════════════════════════════════
async function enviarBootstrap(widget) {
  // Paralelizamos. getCurrentMemberPrimeStatus es SiteMember-only y
  // fallará silencioso para un visitante no logado — devolvemos un
  // estado vacío en ese caso. La compra exigirá login después igualmente.
  const [rProduct, rSalon, rMember] = await Promise.all([
    getPrimeProduct(),
    getPrimeSalonInfo().catch(e => {
      console.warn(`${TAG} ⚠️ getPrimeSalonInfo falló:`, e && e.message);
      return null;
    }),
    getCurrentMemberPrimeStatus().catch(e => {
      console.log(`${TAG} ℹ️ getCurrentMemberPrimeStatus sin sesión:`, e && e.message);
      return null;
    })
  ]);

  const info = (rSalon && rSalon.info) || { brandName: '', salonName: '', widgetSkin: 'niebla', termsConditionsUrl: '', privacyPolicyUrl: '' };

  widget.postMessage({
    type: 'bootstrap',
    payload: {
      product: (rProduct && rProduct.success && rProduct.disponible) ? rProduct.product : null,
      disponible: !!(rProduct && rProduct.disponible),
      skin: info.widgetSkin || 'niebla',
      brandName: info.brandName || '',
      salonName: info.salonName || '',
      termsConditionsUrl: info.termsConditionsUrl || '',
      privacyPolicyUrl: info.privacyPolicyUrl || '',
      member: rMember && rMember.success ? {
        isMember: !!rMember.isMember,
        hasPrime: !!rMember.hasPrime,
        membership: rMember.membership || null
      } : { isMember: false, hasPrime: false, membership: null }
    }
  });
}

// ═══════════════════════════════════════════════════
// FLUJO DE COMPRA
// ═══════════════════════════════════════════════════
async function procesarCompra(widget, payload) {
  // 1) Verificar Wix Member logado.
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
      console.log(`${TAG} 🔒 Login cancelado`);
      return;
    }
    return;
  }

  // 2) Crear checkout en backend (valida no-duplicado, inserta PENDING,
  //    crea payment).
  const r = await createPrimeCheckout(payload || {});

  // Si ya es PRIME activo, el backend devuelve alreadyPrime con info.
  if (!r.success && r.alreadyPrime) {
    widget.postMessage({
      type: 'alreadyPrime',
      payload: { membership: r.membership || null, message: r.error }
    });
    return;
  }

  if (!r.success) {
    widget.postMessage({ type: 'purchaseError', message: r.error || 'No se pudo iniciar la compra' });
    return;
  }

  const { paymentId, code, primeMembershipId } = r;
  console.log(`${TAG} 💳 Iniciando popup de pago: paymentId=${paymentId}`);

  // 3) Abrir popup de Wix Pay.
  let paymentResult;
  try {
    paymentResult = await wixPayFrontend.startPayment(paymentId, {
      showThankYouPage: false
    });
  } catch (payErr) {
    console.error(`${TAG} ❌ Error en startPayment:`, payErr);
    await cancelPrimePayment({ primeMembershipId, paymentId });
    widget.postMessage({ type: 'purchaseError', message: 'Error en la pasarela de pago' });
    return;
  }

  console.log(`${TAG} 💳 paymentResult.status =`, paymentResult && paymentResult.status);

  // 4) Resolver según resultado.
  if (paymentResult && paymentResult.status === 'Successful') {
    const c = await confirmPrimePayment({ primeMembershipId, paymentId });
    if (c.success) {
      widget.postMessage({
        type: 'purchaseSuccess',
        payload: {
          code: c.code,
          issueDate: c.issueDate || null,
          expirationDate: c.expirationDate || null
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
    await cancelPrimePayment({ primeMembershipId, paymentId });
    widget.postMessage({ type: 'purchaseCancelled' });
    return;
  }

  // Otro estado.
  await cancelPrimePayment({ primeMembershipId, paymentId });
  widget.postMessage({
    type: 'purchaseError',
    message: (paymentResult && paymentResult.status) ? `El pago no se completó (${paymentResult.status})` : 'El pago no se completó'
  });
}