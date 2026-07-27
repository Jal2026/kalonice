// =====================================================
// KAMISUITE - Bonos y Promociones (Página Pública) Backend
// =====================================================
// VERSION: 1.0.3
// FECHA: 27 de junio de 2026
//
// v1.0.3: 🩹 FIX bug en _enviarEmailCompraPromoCard. Mi helper de
//   v1.0.2 leía `updated.contactId` pero en KamisuitePromoCards el
//   field ID correcto es `buyerContactId` (diferencia respecto a
//   KamisuiteVouchers y KamisuitePrimeMemberships donde el campo SÍ
//   se llama `contactId`). Resultado en v1.0.2: el guard saltaba
//   con "sin contactId, skip" en TODAS las compras y el email no
//   se enviaba nunca.
//   Cambio único: 3 referencias `updated.contactId` →
//   `updated.buyerContactId` dentro de _enviarEmailCompraPromoCard.
//   Cero cambios en el resto.
//
// v1.0.2: F7 — Email triggered de confirmación de compra (ver
//   changelog v1.0.2 abajo).
//   Promocional. Mismo patrón que voucherPublicLogic v1.0.1 y
//   primePublicLogic v1.0.3: plantilla única
//   SalonConfig.purchaseConfirmationTemplateId, fire-and-forget tras
//   confirmar el pago (status PENDING → EMITIDA). Decisión Jal 27-jun:
//   un solo template Wix Triggered (sin WhatsApp, sin Brevo).
//   Cambios:
//     · Import nuevo: triggeredEmails de 'wix-crm-backend'.
//     · Constante nueva: CMS_SALON = 'SalonConfig'.
//     · 2 helpers privados: _formatearFechaES, _formatearImporte.
//     · 1 helper privado: _enviarEmailCompraPromoCard (no bloqueante).
//     · Al final de confirmPromoCardPayment, tras el update a EMITIDA,
//       _enviarEmailCompraPromoCard(updated).catch(() => {});
//     · CASO REGALO (isGift=true): NO se envía email automático. El
//       comprador entrega el código manualmente al destinatario (en
//       una iteración posterior se podría enviar a recipientEmail con
//       triggeredEmails.emailVisitor, pero queda fuera de v1.0.2).
//   NO se toca el flujo de pago, ni el catálogo, ni la creación de
//   checkout. Cero cambios funcionales en lo existente.
//
// PÁGINA: /bonosypromociones (pública, frontend)
// ARCHIVO: backend/bonosPromosPublicLogic.web.js
//
// ALCANCE F2.1 (este archivo):
//   · Listado público de campañas activas de Tarjetas Promocionales
//     (active=true + ventana startDate/endDate).
//   · Creación de payment con wix-pay-backend (Wix Member obligatorio).
//   · Confirmación post-pago: status PENDING → EMITIDA.
//   · Cancelación post-pago: status PENDING → CANCELADA.
//
// FUERA DE ALCANCE F2.1 (vienen después):
//   · Venta de PRIME — F2.2.
//   · Venta de Bonos — F2.3.
//   · Notificaciones WhatsApp/email post-emisión — F7.
//   · Canje de la tarjeta en Recepción PRO V2 — F5.
//
// PATRÓN WIX PAY: copiado literal del legacy HairTimes V1
// (promoGiftCards.web.js):
//   1) Backend crea payment con wixPayBackend.createPayment(...) →
//      devuelve paymentId.
//   2) Page code abre popup con wixPayFrontend.startPayment(paymentId,
//      {showThankYouPage:false}).
//   3) Según paymentResult.status: 'Successful' / 'Cancelled' / otro.
//
// DIFERENCIA CON LEGACY:
//   · El legacy escribía en GiftCardOrders provisional. V2 escribe
//     directamente en KamisuitePromoCards (la colección oficial de
//     tarjetas emitidas creada en F1).
//   · La fila se crea en status='PENDING' ANTES de abrir el popup de
//     pago. Si éxito → 'EMITIDA'. Si cancelado → 'CANCELADA'. Si el
//     cliente abandona sin más → queda 'PENDING' y se limpiará en una
//     tarea posterior (F6).
//
// DECISIÓN DE PRODUCTO (aplicada en F2.1 — revisable):
//   · expirationDate de la tarjeta emitida = endDate de la campaña que
//     la originó. Si la campaña no tiene endDate, la tarjeta queda sin
//     caducidad (null). El salón controla el margen poniendo endDate
//     más allá del final comercial real de la promoción.
//
// PERMISOS:
//   · getActiveCampaigns: Permissions.Anyone (visitante puede ver
//     catálogo sin sesión).
//   · createPromoCardCheckout, confirmPromoCardPayment,
//     cancelPromoCardPayment: Permissions.SiteMember (Wix Member
//     obligatorio para comprar).
//
// CMS REFERENCIADOS:
//   · KamisuitePromoCampaigns  (read-only: definiciones de campañas).
//   · KamisuitePromoCards      (insert/update: tarjetas emitidas).
//
// CHANGELOG:
// v1.0.1 - FIX: getActiveCampaigns NO devolvía campañas aunque hubiera
//          campañas marcadas como active=true en el CMS. Causa: la
//          query Wix Data .eq('active', true) sobre booleanos no
//          funciona fiablemente — mismo problema que ya tuvo el
//          legacy HairTimes V1 (promoGiftCards.web.js comenta
//          textualmente "Filtrar en JS en vez de en la query").
//          Cambios:
//            · Query sin filtro de active. Trae todas las campañas
//              y filtra después en JS.
//            · Logs detallados de cada fila (active, fechas, tipo)
//              para diagnóstico vía Wix Cloud Logs.
//          No toca permisos ni patrón Wix Pay.
// v1.0.0 - Versión inicial. F2.1 del módulo Productos Custom.
// =====================================================

import { Permissions, webMethod } from 'wix-web-module';
import wixData from 'wix-data';
import wixPayBackend from 'wix-pay-backend';
import { currentMember } from 'wix-members-backend';
// v1.0.2 — F7: email triggered de confirmación de compra
import { triggeredEmails } from 'wix-crm-backend';

const TAG = '[BonosPromosPublic][1.0.3]';

const CMS_CAMPAIGNS = 'KamisuitePromoCampaigns';
const CMS_PROMOCARDS = 'KamisuitePromoCards';
// v1.0.2 — F7: lectura de purchaseConfirmationTemplateId, brandName, siteUrl
const CMS_SALON = 'SalonConfig';

// =====================================================
// HELPERS
// =====================================================

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

// Genera un código único KP-XXXX-XXXX. Comprueba unicidad contra el CMS.
// Hasta 5 intentos antes de fallar (probabilidad de colisión despreciable).
async function generarCodigoUnico() {
  const intentos = 5;
  for (let i = 0; i < intentos; i++) {
    const p1 = Math.random().toString(36).substring(2, 6).toUpperCase();
    const p2 = Math.random().toString(36).substring(2, 6).toUpperCase();
    const code = `KP-${p1}-${p2}`;
    const exists = await wixData.query(CMS_PROMOCARDS)
      .eq('code', code)
      .limit(1)
      .find({ suppressAuth: true });
    if (exists.items.length === 0) {
      return code;
    }
    console.warn(`${TAG} ⚠️ Colisión de código ${code}, reintentando...`);
  }
  throw new Error('No se pudo generar un código único tras 5 intentos');
}

// Resuelve si una campaña está dentro de su ventana de fechas. Tolerante
// a fechas nulas: si no hay startDate/endDate, no restringe por ese lado.
function estaEnVentana(campaign, now) {
  const ts = now.getTime();
  if (campaign.startDate) {
    const start = new Date(campaign.startDate).getTime();
    if (ts < start) return false;
  }
  if (campaign.endDate) {
    // Permite el día final completo (hasta 23:59:59).
    const end = new Date(campaign.endDate).getTime() + (24 * 60 * 60 * 1000 - 1);
    if (ts > end) return false;
  }
  return true;
}

// =====================================================
// 1. LISTAR CAMPAÑAS ACTIVAS (Anyone)
// =====================================================

// Devuelve solo campañas con active=true Y dentro de su ventana de
// fechas. v1.0.1: el filtro active SE HACE EN JS (no en query) porque
// .eq('active', true) sobre booleanos no funciona fiablemente en Wix
// Data — patrón validado por el legacy HairTimes V1.
export const getActiveCampaigns = webMethod(
  Permissions.Anyone,
  async () => {
    try {
      console.log(`${TAG} 📋 getActiveCampaigns`);

      const result = await wixData.query(CMS_CAMPAIGNS)
        .ascending('promoPrice')
        .limit(500)
        .find({ suppressAuth: true });

      const items = result.items || [];
      console.log(`${TAG} 📊 Total filas en KamisuitePromoCampaigns: ${items.length}`);

      // Diagnóstico fila a fila (active + tipo + ventana de fechas).
      items.forEach((c, i) => {
        console.log(
          `${TAG}   Fila ${i}: "${c.label}" → active=${c.active} (${typeof c.active}), ` +
          `startDate=${c.startDate || '(null)'}, endDate=${c.endDate || '(null)'}`
        );
      });

      // Paso 1: filtrar active === true en JS.
      const activeOnly = items.filter(c => c.active === true);
      console.log(`${TAG} 📊 Tras filtro active===true: ${activeOnly.length} / ${items.length}`);

      // Paso 2: filtrar ventana de fechas.
      const now = new Date();
      const filtered = activeOnly.filter(c => estaEnVentana(c, now));
      console.log(`${TAG} 📊 Tras filtro ventana fechas (now=${now.toISOString()}): ${filtered.length} / ${activeOnly.length}`);

      const campaigns = filtered.map(c => ({
        _id: c._id,
        label: c.label || '',
        serviceSetupUid: c.serviceSetupUid || '',
        serviceLabel: c.serviceLabel || '',
        retailPrice: (typeof c.retailPrice === 'number') ? c.retailPrice : 0,
        promoPrice: (typeof c.promoPrice === 'number') ? c.promoPrice : 0,
        description: c.description || '',
        imagePublicUrl: wixImageToPublicUrl(c.image) || '',
        startDate: c.startDate || null,
        endDate: c.endDate || null
      }));

      console.log(`${TAG} ✅ Devolviendo ${campaigns.length} campañas al widget`);

      return { success: true, campaigns };

    } catch (error) {
      console.error(`${TAG} ❌ getActiveCampaigns:`, error);
      return { success: false, campaigns: [], error: error.message };
    }
  }
);

// =====================================================
// 2. CREAR CHECKOUT DE TARJETA PROMOCIONAL (SiteMember)
// =====================================================

// Flujo:
//   1) Verifica Wix Member logado y carga su contactId.
//   2) Carga la campaña, valida que está activa y en ventana.
//   3) Valida payload (buyer obligatorio, recipient si isGift).
//   4) Genera código único KP-XXXX-XXXX.
//   5) Inserta fila en KamisuitePromoCards con status='PENDING'.
//   6) Crea payment con wixPayBackend.createPayment.
//   7) Actualiza la fila con paymentId.
//   8) Devuelve { paymentId, code, promoCardId } al page code.
//
// La fila queda 'PENDING' hasta que el page code llame a
// confirmPromoCardPayment (post-popup) o cancelPromoCardPayment.
export const createPromoCardCheckout = webMethod(
  Permissions.SiteMember,
  async (payload) => {
    const {
      campaignId,
      buyerName,
      buyerEmail,
      buyerPhone,
      isGift,
      recipientName,
      recipientEmail,
      recipientMessage
    } = payload || {};

    try {
      console.log(`${TAG} 🛒 createPromoCardCheckout | campaign=${campaignId} | isGift=${!!isGift}`);

      // 1) Wix Member logado.
      const member = await currentMember.getMember();
      if (!member || !member._id) {
        return { success: false, error: 'Debes iniciar sesión para comprar una tarjeta' };
      }
      const buyerContactId = member.contactId || '';

      // 2) Cargar campaña y validar.
      if (!campaignId) {
        return { success: false, error: 'Falta identificador de campaña' };
      }
      const campaign = await wixData.get(CMS_CAMPAIGNS, campaignId, { suppressAuth: true });
      if (!campaign) {
        return { success: false, error: 'Campaña no encontrada' };
      }
      if (campaign.active !== true) {
        return { success: false, error: 'La campaña ya no está disponible' };
      }
      if (!estaEnVentana(campaign, new Date())) {
        return { success: false, error: 'La campaña está fuera de su ventana de fechas' };
      }

      const promoPrice = (typeof campaign.promoPrice === 'number') ? campaign.promoPrice : 0;
      if (promoPrice <= 0) {
        return { success: false, error: 'Precio de la campaña no válido' };
      }

      // 3) Validar payload.
      const buyerNameClean = String(buyerName || '').trim();
      const buyerEmailClean = String(buyerEmail || '').trim();
      if (!buyerNameClean || !buyerEmailClean) {
        return { success: false, error: 'Faltan tus datos de comprador (nombre y email)' };
      }
      const esRegalo = isGift === true;
      let recipientNameClean = '';
      let recipientEmailClean = '';
      let recipientMessageClean = '';
      if (esRegalo) {
        recipientNameClean = String(recipientName || '').trim();
        recipientEmailClean = String(recipientEmail || '').trim();
        recipientMessageClean = String(recipientMessage || '').trim();
        if (!recipientNameClean || !recipientEmailClean) {
          return { success: false, error: 'Faltan los datos del beneficiario del regalo' };
        }
      }

      // 4) Código único.
      const code = await generarCodigoUnico();

      // 5) expirationDate = endDate de la campaña (o null si no hay).
      const expirationDate = campaign.endDate ? new Date(campaign.endDate) : null;

      // 6) Insertar fila PENDING en KamisuitePromoCards.
      const registro = {
        code,
        promoTypeId: campaign._id,
        serviceSetupUid: campaign.serviceSetupUid || '',
        serviceLabel: campaign.serviceLabel || '',
        retailPrice: (typeof campaign.retailPrice === 'number') ? campaign.retailPrice : 0,
        paidPrice: promoPrice,
        buyerName: buyerNameClean,
        buyerEmail: buyerEmailClean,
        buyerPhone: String(buyerPhone || '').trim(),
        buyerContactId,
        recipientName: recipientNameClean,
        recipientEmail: recipientEmailClean,
        recipientMessage: recipientMessageClean,
        isGift: esRegalo,
        issueDate: null,                  // se rellena en confirm
        expirationDate,
        paymentId: '',                    // se rellena tras createPayment
        paymentReservationId: '',
        paymentMethod: 'Wix Pay',
        status: 'PENDING',
        salonId: ''
      };

      const inserted = await wixData.insert(CMS_PROMOCARDS, registro, { suppressAuth: true });
      console.log(`${TAG} ✅ PromoCard PENDING insertada: ${inserted._id} (code=${code})`);

      // 7) Crear payment con Wix Pay.
      const itemName = `Tarjeta Promocional · ${campaign.label || campaign.serviceLabel || 'Servicio'}`;
      const payment = await wixPayBackend.createPayment({
        items: [{
          name: itemName,
          price: promoPrice,
          quantity: 1
        }],
        amount: promoPrice,
        currency: 'EUR',
        userInfo: {
          email: buyerEmailClean,
          firstName: buyerNameClean
        }
      });

      if (!payment || !payment.id) {
        // Si Wix Pay falla, dejamos la fila como CANCELADA para no
        // ensuciar el CMS con basura PENDING.
        try {
          inserted.status = 'CANCELADA';
          await wixData.update(CMS_PROMOCARDS, inserted, { suppressAuth: true });
        } catch (_) {}
        return { success: false, error: 'No se pudo iniciar el pago' };
      }

      // 8) Actualizar fila con paymentId.
      inserted.paymentId = payment.id;
      await wixData.update(CMS_PROMOCARDS, inserted, { suppressAuth: true });
      console.log(`${TAG} ✅ Payment creado: ${payment.id}`);

      return {
        success: true,
        paymentId: payment.id,
        code,
        promoCardId: inserted._id
      };

    } catch (error) {
      console.error(`${TAG} ❌ createPromoCardCheckout:`, error);
      return { success: false, error: error.message };
    }
  }
);

// =====================================================
// v1.0.2 — F7: HELPERS DE EMAIL DE CONFIRMACIÓN DE COMPRA
// =====================================================
// Mismo patrón que voucherPublicLogic v1.0.1 y primePublicLogic v1.0.3:
// fire-and-forget, plantilla única SalonConfig.purchaseConfirmationTemplateId.
// CASO REGALO: si la tarjeta es isGift=true, NO se envía email automático
// (el comprador entrega manualmente el código al destinatario).
// =====================================================

function _formatearFechaES(fechaOrIso) {
  try {
    if (!fechaOrIso) return '';
    const d = (fechaOrIso instanceof Date) ? fechaOrIso : new Date(fechaOrIso);
    if (isNaN(d.getTime())) return '';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  } catch (_) { return ''; }
}

function _formatearImporte(amount, currency) {
  if (amount == null) return '';
  const n = Number(amount);
  if (!Number.isFinite(n)) return '';
  const cur = (currency === 'EUR' || !currency) ? '€' : String(currency);
  return `${n.toFixed(2).replace('.', ',')} ${cur}`;
}

async function _enviarEmailCompraPromoCard(updated) {
  try {
    // v1.0.3: el field ID en KamisuitePromoCards es `buyerContactId`,
    // NO `contactId` (que es el de KamisuiteVouchers y PrimeMemberships).
    if (!updated || !updated.buyerContactId) {
      console.warn(`${TAG} ⚠️ _enviarEmailCompraPromoCard sin buyerContactId, skip`);
      return;
    }

    // Caso regalo: no se manda email automático al comprador (sería raro
    // recibir "tu tarjeta está disponible" cuando es para otra persona).
    // El destinatario recibirá el código a mano. Iteración futura podría
    // mandar a recipientEmail con triggeredEmails.emailVisitor.
    if (updated.isGift === true) {
      console.log(`${TAG} 🎁 PromoCard isGift=true, sin email automático`);
      return;
    }

    const cfgRes = await wixData.query(CMS_SALON).limit(1).find({ suppressAuth: true });
    const cfg = (cfgRes.items && cfgRes.items[0]) || {};
    const templateId = cfg.purchaseConfirmationTemplateId || '';

    if (!templateId) {
      console.warn(`${TAG} ⚠️ SalonConfig.purchaseConfirmationTemplateId vacío — sin email`);
      return;
    }

    const brandName = cfg.brandName || '';
    const siteUrl   = cfg.siteUrl   || '';

    const buyerName = String(updated.buyerName || '').trim();
    const nombreCliente = buyerName ? buyerName.split(/\s+/)[0] : 'Cliente';

    const fechaCaducidad = _formatearFechaES(updated.expirationDate);
    const importeStr     = _formatearImporte(updated.paidPrice, 'EUR');
    const serviceLabel   = updated.serviceLabel || updated.campaignName || 'Servicio';

    const variables = {
      nombreCliente,
      tituloProducto: `Tarjeta ${serviceLabel}`,
      marca: brandName,
      labelDetalle1: 'Código',
      valorDetalle1: updated.code || '',
      labelDetalle2: 'Servicio',
      valorDetalle2: serviceLabel,
      labelDetalle3: 'Tipo',
      valorDetalle3: 'Tarjeta promocional',
      labelDetalle4: 'Validez',
      valorDetalle4: fechaCaducidad ? `Hasta el ${fechaCaducidad}` : '—',
      importe: importeStr,
      instruccionUso: 'Muestra el código al personal del salón para canjearla.',
      SITE_URL: siteUrl
    };

    await triggeredEmails.emailContact(templateId, updated.buyerContactId, { variables });
    console.log(`${TAG} 📧 Email compra-PromoCard enviado OK → buyerContactId=${updated.buyerContactId} code=${updated.code}`);
  } catch (emailErr) {
    console.error(`${TAG} ⚠️ Error enviando email compra-PromoCard (no bloqueante):`, emailErr && emailErr.message);
  }
}

// =====================================================
// 3. CONFIRMAR PAGO (SiteMember)
// =====================================================

// Llamado por el page code tras wixPayFrontend.startPayment con
// status='Successful'. Marca la fila como EMITIDA y rellena issueDate.
//
// Idempotente: si ya estaba EMITIDA, devuelve los datos sin tocar nada.
// Si estaba CANCELADA, error (no se reactiva).
export const confirmPromoCardPayment = webMethod(
  Permissions.SiteMember,
  async ({ promoCardId, paymentId }) => {
    try {
      console.log(`${TAG} ✅ confirmPromoCardPayment | promoCardId=${promoCardId} | paymentId=${paymentId}`);

      if (!promoCardId) {
        return { success: false, error: 'Falta promoCardId' };
      }

      const registro = await wixData.get(CMS_PROMOCARDS, promoCardId, { suppressAuth: true });
      if (!registro) {
        return { success: false, error: 'Tarjeta no encontrada' };
      }

      // Doble-check de seguridad: el paymentId del payload debe coincidir
      // con el guardado en la fila.
      if (paymentId && registro.paymentId && registro.paymentId !== paymentId) {
        console.warn(`${TAG} ⚠️ paymentId divergente: payload=${paymentId} fila=${registro.paymentId}`);
        return { success: false, error: 'Conflicto en el identificador de pago' };
      }

      if (registro.status === 'EMITIDA') {
        // Idempotente.
        return {
          success: true,
          alreadyEmitida: true,
          code: registro.code,
          promoCardId: registro._id
        };
      }

      if (registro.status === 'CANCELADA') {
        return { success: false, error: 'Esta tarjeta ya estaba cancelada' };
      }

      // PENDING → EMITIDA.
      registro.status = 'EMITIDA';
      registro.issueDate = new Date();
      registro.paymentMethod = 'Wix Pay';

      const updated = await wixData.update(CMS_PROMOCARDS, registro, { suppressAuth: true });
      console.log(`${TAG} ✅ PromoCard EMITIDA: ${updated._id} (code=${updated.code})`);

      // v1.0.2 — F7: email triggered de confirmación de compra.
      // Fire-and-forget. Salta automáticamente si isGift=true (el comprador
      // entregará el código al destinatario manualmente).
      _enviarEmailCompraPromoCard(updated).catch(() => {});

      // NOTA: notificaciones WhatsApp/email NO se mandan en F2.1. Eso
      // es F7. El widget muestra el código al cliente y eso es todo.

      return {
        success: true,
        code: updated.code,
        promoCardId: updated._id,
        expirationDate: updated.expirationDate || null,
        isGift: updated.isGift === true,
        recipientName: updated.recipientName || '',
        recipientEmail: updated.recipientEmail || ''
      };

    } catch (error) {
      console.error(`${TAG} ❌ confirmPromoCardPayment:`, error);
      return { success: false, error: error.message };
    }
  }
);

// =====================================================
// 4. CANCELAR PAGO (SiteMember)
// =====================================================

// Llamado por el page code tras wixPayFrontend.startPayment con
// status='Cancelled'. Marca la fila como CANCELADA.
//
// Idempotente: si ya estaba CANCELADA, no toca. Si estaba EMITIDA, no
// la cancelamos (sería una revocación, que es otra cosa).
export const cancelPromoCardPayment = webMethod(
  Permissions.SiteMember,
  async ({ promoCardId, paymentId }) => {
    try {
      console.log(`${TAG} 🚫 cancelPromoCardPayment | promoCardId=${promoCardId}`);

      if (!promoCardId) {
        return { success: false, error: 'Falta promoCardId' };
      }

      const registro = await wixData.get(CMS_PROMOCARDS, promoCardId, { suppressAuth: true });
      if (!registro) {
        return { success: false, error: 'Tarjeta no encontrada' };
      }

      if (paymentId && registro.paymentId && registro.paymentId !== paymentId) {
        console.warn(`${TAG} ⚠️ paymentId divergente: payload=${paymentId} fila=${registro.paymentId}`);
        return { success: false, error: 'Conflicto en el identificador de pago' };
      }

      if (registro.status === 'CANCELADA') {
        return { success: true, alreadyCancelada: true };
      }

      if (registro.status === 'EMITIDA') {
        return { success: false, error: 'La tarjeta ya está emitida, no se puede cancelar desde aquí' };
      }

      registro.status = 'CANCELADA';
      const updated = await wixData.update(CMS_PROMOCARDS, registro, { suppressAuth: true });
      console.log(`${TAG} ✅ PromoCard CANCELADA: ${updated._id}`);

      return { success: true, promoCardId: updated._id };

    } catch (error) {
      console.error(`${TAG} ❌ cancelPromoCardPayment:`, error);
      return { success: false, error: error.message };
    }
  }
);