// =====================================================
// KAMISUITE - Bonos (Página Pública) - Page Code
// =====================================================
// PÁGINA: /bonos (pública, frontend)
// WIDGET: #htmlBonos (HTML embed con bonos.html)
//
// VERSIÓN: 1.0.1
// FECHA: 27 de junio de 2026
//
// Bridge entre el widget HTML público y voucherPublicLogic.web.js v1.0.0.
//
// PATRÓN WIX PAY + WIX MEMBERS + SKIN: idéntico a F2.2 (PRIME)
// y F2.1 (Tarjetas Promocionales).
//
// v1.0.1 (27 jun 2026):
//   · 🩹 FIX navegación a /tarjetaprime desde el banner primeGate del
//     widget. El botón "Hazte PRIME" del widget de bonos no funcionaba
//     (Forbidden + sin viajar a la URL). Causa raíz: el widget es un
//     HTML Component (iframe sandboxed) y un <a href="/tarjetaprime">
//     dentro intentaba navegar DENTRO del iframe (otro origin) en vez
//     de propagar la navegación al sitio padre.
//     FIX: el widget v1.0.1 envía send('navigate',{url:'/tarjetaprime'})
//     al page code, y este case nuevo llama wixLocation.to(url) que sí
//     navega el sitio padre (patrón ya validado en clienteArea, agenda).
//   · Import nuevo: wixLocation de 'wix-location' (patrón producción).
//   · 1 case nuevo en el switch: 'navigate'.
//   · Cero cambios en el resto (bootstrap, purchase, Wix Pay).
//
// MENSAJES ENTRANTES (widget → page code):
//   ready                 Cargar catálogo + info salón + estado del miembro.
//   purchase  payload     Iniciar compra (Wix Member + PRIME obligatorios).
//   navigate  { url }     v1.0.1 — Navegar el sitio padre a una URL interna.
//
// MENSAJES SALIENTES (page code → widget):
//   bootstrap         { vouchers, member, brandName, skin, termsConditionsUrl }
//   loginRequired     { }
//   needsPrime        { message }
//   alreadyHasVoucher { voucher, message }
//   purchaseSuccess   { code, issueDate, expirationDate, remainingUses, totalUses }
//   purchaseCancelled { }
//   purchaseError     { message }
//   error             { message }
//
// AJUSTE PRE-PUBLICACIÓN: confirmar el ID del HTML Component. La
// constante WIDGET_ID asume '#htmlBonos'.
// =====================================================

import {
  getVoucherSalonInfo,
  getVoucherCatalog,
  getCurrentMemberVoucherStatus,
  createVoucherCheckout,
  confirmVoucherPayment,
  cancelVoucherPayment
} from 'backend/voucherPublicLogic.web';

import wixPayFrontend from 'wix-pay-frontend';
import { authentication, currentMember } from 'wix-members-frontend';
// v1.0.1 — Navegación al sitio padre desde mensajes del widget
import wixLocation from 'wix-location';

const TAG = '[Bonos v1.0.1]';
const WIDGET_ID = '#htmlBonos';

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

        // v1.0.1 — Navegación a una URL interna del sitio padre (no se
        // puede hacer con <a href> directo desde el widget porque es un
        // HTML Component sandboxed; ver changelog cabecera).
        case 'navigate': {
          const url = msg.payload && msg.payload.url;
          if (url && typeof url === 'string') {
            console.log(`${TAG} 🧭 navigate → ${url}`);
            wixLocation.to(url);
          } else {
            console.warn(`${TAG} ⚠️ navigate sin url`);
          }
          break;
        }

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
// BOOTSTRAP — catálogo + info salón + estado miembro
// ═══════════════════════════════════════════════════
async function enviarBootstrap(widget) {
  const [rCatalog, rSalon, rMember] = await Promise.all([
    getVoucherCatalog(),
    getVoucherSalonInfo().catch(e => {
      console.warn(`${TAG} ⚠️ getVoucherSalonInfo falló:`, e && e.message);
      return null;
    }),
    getCurrentMemberVoucherStatus().catch(e => {
      // Visitante anónimo: el endpoint SiteMember-only rechaza. No es
      // error de verdad.
      console.log(`${TAG} ℹ️ getCurrentMemberVoucherStatus sin sesión:`, e && e.message);
      return null;
    })
  ]);

  const info = (rSalon && rSalon.info) || { brandName: '', salonName: '', widgetSkin: 'niebla', termsConditionsUrl: '', privacyPolicyUrl: '' };

  widget.postMessage({
    type: 'bootstrap',
    payload: {
      vouchers: (rCatalog && rCatalog.success) ? rCatalog.vouchers : [],
      skin: info.widgetSkin || 'niebla',
      brandName: info.brandName || '',
      salonName: info.salonName || '',
      termsConditionsUrl: info.termsConditionsUrl || '',
      privacyPolicyUrl: info.privacyPolicyUrl || '',
      member: rMember && rMember.success ? {
        isMember: !!rMember.isMember,
        isPrime: !!rMember.isPrime,
        primeExpirationDate: rMember.primeExpirationDate || null,
        serviciosBloqueados: rMember.serviciosBloqueados || [],
        bonosActivos: rMember.bonosActivos || []
      } : { isMember: false, isPrime: false, primeExpirationDate: null, serviciosBloqueados: [], bonosActivos: [] }
    }
  });
}

// ═══════════════════════════════════════════════════
// FLUJO DE COMPRA
// ═══════════════════════════════════════════════════
async function procesarCompra(widget, payload) {
  // 1) Verificar Wix Member logado. Si no, prompt login y abortar.
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

  // 2) Crear checkout en backend.
  // Posibles respuestas no-success:
  //   - { needsPrime: true } → el member no es PRIME → mensaje al widget.
  //   - { alreadyHasVoucher: true, voucher } → ya tiene bono activo del servicio.
  //   - otros errores → purchaseError.
  const r = await createVoucherCheckout(payload || {});

  if (!r.success && r.needsPrime) {
    widget.postMessage({
      type: 'needsPrime',
      payload: { message: r.error || 'Los bonos están reservados a miembros PRIME.' }
    });
    return;
  }

  if (!r.success && r.alreadyHasVoucher) {
    widget.postMessage({
      type: 'alreadyHasVoucher',
      payload: { voucher: r.voucher || null, message: r.error || 'Ya tienes un bono activo de este servicio.' }
    });
    return;
  }

  if (!r.success) {
    widget.postMessage({ type: 'purchaseError', message: r.error || 'No se pudo iniciar la compra' });
    return;
  }

  const { paymentId, code, voucherId } = r;
  console.log(`${TAG} 💳 Iniciando popup de pago: paymentId=${paymentId}`);

  // 3) Abrir popup de Wix Pay.
  let paymentResult;
  try {
    paymentResult = await wixPayFrontend.startPayment(paymentId, {
      showThankYouPage: false
    });
  } catch (payErr) {
    console.error(`${TAG} ❌ Error en startPayment:`, payErr);
    await cancelVoucherPayment({ voucherId, paymentId });
    widget.postMessage({ type: 'purchaseError', message: 'Error en la pasarela de pago' });
    return;
  }

  console.log(`${TAG} 💳 paymentResult.status =`, paymentResult && paymentResult.status);

  // 4) Resolver.
  if (paymentResult && paymentResult.status === 'Successful') {
    const c = await confirmVoucherPayment({ voucherId, paymentId });
    if (c.success) {
      widget.postMessage({
        type: 'purchaseSuccess',
        payload: {
          code: c.code,
          issueDate: c.issueDate || null,
          expirationDate: c.expirationDate || null,
          remainingUses: c.remainingUses,
          totalUses: c.totalUses
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
    await cancelVoucherPayment({ voucherId, paymentId });
    widget.postMessage({ type: 'purchaseCancelled' });
    return;
  }

  // Otro estado.
  await cancelVoucherPayment({ voucherId, paymentId });
  widget.postMessage({
    type: 'purchaseError',
    message: (paymentResult && paymentResult.status) ? `El pago no se completó (${paymentResult.status})` : 'El pago no se completó'
  });
}