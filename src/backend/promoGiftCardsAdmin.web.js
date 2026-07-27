// ═══════════════════════════════════════════════════════════════
// BACKEND: backend/promoGiftCardsAdmin.web.js
// CRUD + Upload de imagen al Media Manager
// ═══════════════════════════════════════════════════════════════

import { Permissions, webMethod } from "wix-web-module";
import wixData from "wix-data";
import { mediaManager } from "wix-media-backend";

// ─── Listar TODAS las promos ────────────────────────────────
export const getAllPromotions = webMethod(
  Permissions.SiteMember,
  async () => {
    try {
      const results = await wixData
        .query("PromoGiftCards")
        .descending("_createdDate")
        .find();

      return {
        success: true,
        promotions: results.items.map((item) => ({
          _id: item._id,
          title: item.title,
          image: item.image
            ? (typeof item.image === "string" && item.image.startsWith("wix:image://"))
              ? `https://static.wixstatic.com/media/${item.image.replace("wix:image://v1/", "").split("/")[0]}`
              : item.image
            : "",
          imageRaw: item.image || "",
          originalPrice: item.originalPrice,
          promoPrice: item.promoPrice,
          description: item.description || "",
          validUntil: item.validUntil,
          isActive: item.isActive,
        })),
      };
    } catch (error) {
      console.error("Error getAllPromotions:", error);
      return { success: false, promotions: [], error: error.message };
    }
  }
);

// ─── Generar URL de subida para el Media Manager ────────────
export const getUploadUrl = webMethod(
  Permissions.SiteMember,
  async (fileName, mimeType) => {
    try {
      const response = await mediaManager.getUploadUrl(
        "/PromoGiftCards",
        {
          mediaOptions: {
            mimeType: mimeType || "image/jpeg",
            mediaType: "image",
          },
          metadataOptions: {
            isPrivate: false,
            isVisitorUpload: false,
            fileName: fileName,
          },
        }
      );
      return { success: true, uploadUrl: response.uploadUrl, uploadToken: response.uploadToken };
    } catch (error) {
      console.error("Error getUploadUrl:", error);
      return { success: false, error: error.message };
    }
  }
);

// ─── Subir imagen desde buffer (base64) ─────────────────────
export const uploadImage = webMethod(
  Permissions.SiteMember,
  async (base64Data, fileName, mimeType) => {
    try {
      const buffer = Buffer.from(base64Data, "base64");

      const result = await mediaManager.upload(
        "/",  // Raíz del Media Manager (siempre existe)
        buffer,
        fileName,
        {
          mediaOptions: {
            mimeType: mimeType || "image/jpeg",
            mediaType: "image",
          },
          metadataOptions: {
            isPrivate: false,
            isVisitorUpload: false,
          },
        }
      );

      console.log("Upload result:", JSON.stringify(result));

      // Extraer URL pública del fileUrl de Wix
      let publicUrl = "";
      const fileUrl = result.fileUrl || "";

      if (fileUrl.startsWith("wix:image://")) {
        // Formato: wix:image://v1/<hash>/<filename>#originWidth=X&originHeight=Y
        const parts = fileUrl.replace("wix:image://v1/", "").split("/");
        const hash = parts[0];
        publicUrl = `https://static.wixstatic.com/media/${hash}`;
      } else if (fileUrl) {
        publicUrl = fileUrl;
      }

      return {
        success: true,
        fileUrl: fileUrl,   // Para guardar en CMS
        publicUrl: publicUrl // Para preview en el widget
      };
    } catch (error) {
      console.error("Error uploadImage:", error);
      return { success: false, error: error.message };
    }
  }
);

// ─── Crear nueva promo ──────────────────────────────────────
export const createPromotion = webMethod(
  Permissions.SiteMember,
  async (promoData) => {
    try {
      const toInsert = {
        title: promoData.title,
        image: promoData.image || "",
        originalPrice: parseFloat(promoData.originalPrice) || 0,
        promoPrice: parseFloat(promoData.promoPrice) || 0,
        description: promoData.description || "",
        validUntil: promoData.validUntil ? new Date(promoData.validUntil + "T12:00:00") : null,
        isActive: promoData.isActive !== undefined ? promoData.isActive : true,
      };
      const result = await wixData.insert("PromoGiftCards", toInsert);
      return { success: true, item: result };
    } catch (error) {
      console.error("Error createPromotion:", error);
      return { success: false, error: error.message };
    }
  }
);

// ─── Actualizar promo ───────────────────────────────────────
export const updatePromotion = webMethod(
  Permissions.SiteMember,
  async (promoData) => {
    try {
      const existing = await wixData.get("PromoGiftCards", promoData._id);
      if (!existing) return { success: false, error: "No encontrada" };

      existing.title = promoData.title;
      if (promoData.image) existing.image = promoData.image;
      existing.originalPrice = parseFloat(promoData.originalPrice) || 0;
      existing.promoPrice = parseFloat(promoData.promoPrice) || 0;
      existing.description = promoData.description || "";
      if (promoData.validUntil) existing.validUntil = new Date(promoData.validUntil + "T12:00:00");
      if (promoData.isActive !== undefined) existing.isActive = promoData.isActive;

      const result = await wixData.update("PromoGiftCards", existing);
      return { success: true, item: result };
    } catch (error) {
      console.error("Error updatePromotion:", error);
      return { success: false, error: error.message };
    }
  }
);

// ─── Toggle ─────────────────────────────────────────────────
export const togglePromotion = webMethod(
  Permissions.SiteMember,
  async (promoId, isActive) => {
    try {
      const existing = await wixData.get("PromoGiftCards", promoId);
      if (!existing) return { success: false, error: "No encontrada" };
      existing.isActive = isActive;
      await wixData.update("PromoGiftCards", existing);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
);

// ─── Eliminar ───────────────────────────────────────────────
export const deletePromotion = webMethod(
  Permissions.SiteMember,
  async (promoId) => {
    try {
      await wixData.remove("PromoGiftCards", promoId);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
);
