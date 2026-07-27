// ═══════════════════════════════════════════════════════════════
// BACKEND: backend/promoGiftCards.web.js
// Módulo web de Velo para el widget de Tarjetas Regalo Promocionales
// ═══════════════════════════════════════════════════════════════
//
// Este archivo va en: Backend & Public > backend > promoGiftCards.web.js
// Expone funciones al frontend via Wix Web Methods (fetch seguro)
//
// Colección CMS: PromoGiftCards
// Campos: title, image, originalPrice, promoPrice, description, 
//         validUntil, isActive
// ═══════════════════════════════════════════════════════════════

import { Permissions, webMethod } from "wix-web-module";
import wixData from "wix-data";
import wixPayBackend from "wix-pay-backend";

// ─── Obtener promociones activas ────────────────────────────
// Devuelve solo las promos con isActive === true y no caducadas
export const getActivePromotions = webMethod(
  Permissions.Anyone,
  async () => {
    try {
      const results = await wixData
        .query("PromoGiftCards")
        .ascending("promoPrice")
        .find();

      // DEBUG: ver qué valor tiene isActive en cada item
      results.items.forEach((item, i) => {
        console.log(`Item ${i}: "${item.title}" → isActive =`, item.isActive, `(tipo: ${typeof item.isActive})`);
      });

      // Filtrar en JS en vez de en la query
      const filtered = results.items.filter(item => item.isActive === true);

      console.log("Total:", results.items.length, "| Activas:", filtered.length);

      return {
        success: true,
        promotions: filtered.map((item) => ({
          _id: item._id,
          title: item.title,
          image: item.image
            ? (typeof item.image === "string" && item.image.startsWith("wix:image://"))
              ? `https://static.wixstatic.com/media/${item.image.replace("wix:image://v1/", "").split("/")[0]}`
              : item.image
            : "",
          originalPrice: item.originalPrice,
          promoPrice: item.promoPrice,
          description: item.description || "",
          validUntil: item.validUntil,
        })),
      };
    } catch (error) {
      console.error("Error getActivePromotions:", error);
      return { success: false, promotions: [], error: error.message };
    }
  }
);

// ─── Crear pago con Wix Pay ─────────────────────────────────
// Backend crea el payment, devuelve paymentId.
// El page code llama a wixPayFrontend.startPayment(paymentId)
// para abrir el popup de pago nativo de Wix.
export const createGiftCardCheckout = webMethod(
  Permissions.Anyone,
  async ({ promoId, senderName, recipientEmail, message }) => {
    try {
      // 1. Validar que la promo existe y está activa
      const promo = await wixData.get("PromoGiftCards", promoId);

      if (!promo || !promo.isActive) {
        return { success: false, error: "Promoción no disponible" };
      }

      // 2. Crear el payment con wix-pay-backend
      const payment = await wixPayBackend.createPayment({
        items: [{
          name: `Tarjeta Regalo: ${promo.title}`,
          price: promo.promoPrice,
          quantity: 1
        }],
        amount: promo.promoPrice,
        currency: "EUR",
        userInfo: {
          email: recipientEmail,
          firstName: senderName,
        }
      });

      // 3. Guardar el pedido en colección de seguimiento
      try {
        await wixData.insert("GiftCardOrders", {
          promoId: promo._id,
          promoTitle: promo.title,
          senderName: senderName,
          recipientEmail: recipientEmail,
          message: message || "",
          amount: promo.promoPrice,
          originalPrice: promo.originalPrice,
          paymentId: payment.id,
          status: "PENDING",
          createdDate: new Date(),
        });
      } catch (orderErr) {
        // Si falla el tracking, no bloqueamos el pago
        console.error("Error guardando orden:", orderErr);
      }

      return {
        success: true,
        paymentId: payment.id,
      };
    } catch (error) {
      console.error("Error createGiftCardCheckout:", error);
      return { success: false, error: error.message };
    }
  }
);

// ─── Verificar estado de un pedido (opcional) ───────────────
export const getOrderStatus = webMethod(
  Permissions.Anyone,
  async (checkoutId) => {
    try {
      const results = await wixData
        .query("GiftCardOrders")
        .eq("checkoutId", checkoutId)
        .find();

      if (results.items.length === 0) {
        return { success: false, error: "Pedido no encontrado" };
      }

      return {
        success: true,
        order: results.items[0],
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
);