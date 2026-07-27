/**
 * ═══════════════════════════════════════════════════════════════════════════
 * B2B Backend Module - Wix Velo Web Methods
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Archivo: backend/b2b.web.js
 * VERSION: 1.1.1 - 2026-01-29 13:30
 * 
 * CAMBIOS v1.1.1:
 * - CIF añadido en notas de la cotización
 * - Descuento aplicado en lineItems.price
 * 
 * Campos de tu colección B2BProfiles:
 * - email (match con Wix Members)
 * - isB2B (boolean)
 * - couponCode
 * - usualProducts (IDs separados por coma)
 * - companyName
 * - cifNif
 * - billingAddress
 * - companyLogo
 * - discountPercent (número)
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

const VERSION = "1.1.1";

import { Permissions, webMethod } from "wix-web-module";
import wixData from "wix-data";
import { currentMember } from "wix-members-backend";
import { priceQuotes } from "wix-billing-backend";

const COLLECTION_B2B_PROFILES = "B2BProfiles";

// ═══════════════════════════════════════════════════════════════════════════
// FUNCIONES AUXILIARES
// ═══════════════════════════════════════════════════════════════════════════

async function getCurrentUserEmail() {
    try {
        const member = await currentMember.getMember({ fieldsets: ["FULL"] });
        return member?.loginEmail || member?.contactDetails?.emails?.[0] || null;
    } catch (error) {
        console.error("Error obteniendo email del usuario:", error);
        return null;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// FUNCIONES PÚBLICAS (WEB METHODS)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Verifica si el usuario actual tiene perfil B2B activo
 */
export const checkB2BStatus = webMethod(
    Permissions.Anyone,
    async () => {
        const email = await getCurrentUserEmail();
        
        if (!email) {
            return { isB2B: false, isLoggedIn: false, email: null };
        }

        try {
            const result = await wixData.query(COLLECTION_B2B_PROFILES)
                .eq("email", email)
                .eq("isB2B", true)
                .find();

            return {
                isB2B: result.items.length > 0,
                isLoggedIn: true,
                email
            };
        } catch (error) {
            console.error("Error verificando estado B2B:", error);
            return { isB2B: false, isLoggedIn: true, email };
        }
    }
);

/**
 * Obtiene el perfil B2B completo del usuario actual
 */
export const getB2BProfile = webMethod(
    Permissions.Anyone,
    async () => {
        const email = await getCurrentUserEmail();
        if (!email) return null;

        try {
            const result = await wixData.query(COLLECTION_B2B_PROFILES)
                .eq("email", email)
                .eq("isB2B", true)
                .find();

            if (result.items.length === 0) return null;
            
            const profile = result.items[0];
            return {
                email: profile.email,
                companyName: profile.companyName,
                cifNif: profile.cifNif,
                billingAddress: profile.billingAddress,
                companyLogo: profile.companyLogo,
                couponCode: profile.couponCode,
                usualProducts: profile.usualProducts
            };
        } catch (error) {
            console.error("Error obteniendo perfil B2B:", error);
            return null;
        }
    }
);

/**
 * Obtiene el código de cupón del usuario B2B
 */
export const getB2BCoupon = webMethod(
    Permissions.Anyone,
    async () => {
        const email = await getCurrentUserEmail();
        if (!email) return null;

        try {
            const result = await wixData.query(COLLECTION_B2B_PROFILES)
                .eq("email", email)
                .eq("isB2B", true)
                .find();

            if (result.items.length === 0) return null;

            const profile = result.items[0];
            return {
                code: profile.couponCode,
                companyName: profile.companyName
            };
        } catch (error) {
            console.error("Error obteniendo cupón B2B:", error);
            return null;
        }
    }
);

/**
 * Obtiene los productos frecuentes del usuario B2B
 */
export const getUsualProducts = webMethod(
    Permissions.Anyone,
    async () => {
        const email = await getCurrentUserEmail();
        if (!email) return [];

        try {
            const profileResult = await wixData.query(COLLECTION_B2B_PROFILES)
                .eq("email", email)
                .eq("isB2B", true)
                .find();

            if (profileResult.items.length === 0) return [];

            const usualProductsStr = profileResult.items[0].usualProducts;
            if (!usualProductsStr || usualProductsStr.trim() === "") return [];

            // Parsear IDs (separados por coma)
            const productIds = usualProductsStr
                .split(",")
                .map(id => id.trim())
                .filter(id => id.length > 0);

            console.log("[B2B] Buscando productos con IDs:", productIds);

            if (productIds.length === 0) return [];

            // Buscar por _id
            let productsResult = await wixData.query("Stores/Products")
                .hasSome("_id", productIds)
                .find();

            console.log("[B2B] Encontrados por _id:", productsResult.items.length);

            // Si no encuentra, buscar por handleId (campo del CSV de Wix)
            if (productsResult.items.length === 0) {
                productsResult = await wixData.query("Stores/Products")
                    .hasSome("handleId", productIds)
                    .find();
                console.log("[B2B] Encontrados por handleId:", productsResult.items.length);
            }

            return productsResult.items.map(product => ({
                _id: product._id,
                name: product.name,
                price: product.price,
                formattedPrice: product.formattedPrice,
                productPageUrl: product.productPageUrl,
                mainMedia: product.mainMedia,
                sku: product.sku,
                inStock: product.inStock
            }));

        } catch (error) {
            console.error("Error obteniendo productos frecuentes:", error);
            return [];
        }
    }
);

/**
 * Obtiene los datos fiscales del usuario B2B
 */
export const getBillingData = webMethod(
    Permissions.Anyone,
    async () => {
        const email = await getCurrentUserEmail();
        if (!email) return null;

        try {
            const result = await wixData.query(COLLECTION_B2B_PROFILES)
                .eq("email", email)
                .eq("isB2B", true)
                .find();

            if (result.items.length === 0) return null;

            const profile = result.items[0];
            return {
                companyName: profile.companyName,
                cifNif: profile.cifNif,
                billingAddress: profile.billingAddress,
                companyLogo: profile.companyLogo,
                email: profile.email
            };
        } catch (error) {
            console.error("Error obteniendo datos fiscales:", error);
            return null;
        }
    }
);

/**
 * Prepara productos frecuentes para añadir al carrito
 */
export const prepareUsualProductsForCart = webMethod(
    Permissions.Anyone,
    async (quantity = 1) => {
        const products = await getUsualProducts();
        
        if (products.length === 0) {
            return { success: false, error: "No hay productos frecuentes" };
        }

        const cartItems = products
            .filter(p => p.inStock !== false)
            .map(product => ({
                productId: product._id,
                quantity: quantity
            }));

        return {
            success: true,
            itemsToAdd: cartItems,
            totalProducts: cartItems.length
        };
    }
);

/**
 * Crea una cotización B2B con los productos indicados
 * @param {Array} items - Array de { productId, quantity, name, price }
 * @param {string} notes - Notas adicionales para la cotización
 */
export const createB2BQuote = webMethod(
    Permissions.Anyone,
    async (items, notes = "") => {
        const email = await getCurrentUserEmail();
        if (!email) {
            return { success: false, error: "Usuario no logueado" };
        }

        try {
            // Obtener perfil B2B
            const profileResult = await wixData.query(COLLECTION_B2B_PROFILES)
                .eq("email", email)
                .eq("isB2B", true)
                .find();

            if (profileResult.items.length === 0) {
                return { success: false, error: "No tienes acceso B2B" };
            }

            const profile = profileResult.items[0];
            
            // Obtener descuento del perfil
            const discountPercent = Number(profile.discountPercent) || 0;
            const discountFactor = discountPercent > 0 ? (100 - discountPercent) / 100 : 1;

            // Obtener datos del miembro para el contacto
            const member = await currentMember.getMember({ fieldsets: ["FULL"] });
            
            if (!member || !member.contactId) {
                return { success: false, error: "No se pudo obtener el ID de contacto." };
            }

            console.log("[B2B] Creando cotización para:", email, "Descuento:", discountPercent + "%");
            
            // Preparar líneas de la cotización - CON DESCUENTO APLICADO AL PRECIO
            const lineItems = items.map((item, index) => {
                const originalPrice = parseFloat(item.price) || 0;
                const discountedPrice = Math.round(originalPrice * discountFactor * 100) / 100;
                
                return {
                    name: item.name ? String(item.name).substring(0, 50) : `Producto ${index + 1}`,
                    price: discountedPrice,
                    quantity: parseInt(item.quantity) || 1
                };
            });
            
            console.log("[B2B] LineItems preparados:", lineItems.length);

            // Fechas
            const now = new Date();
            const dueDate = new Date();
            dueDate.setDate(now.getDate() + 30);

            // Customer - con datos completos de la empresa
            const customer = {
                contactId: String(member.contactId),
                email: String(email),
                company: profile.companyName || "",
                firstName: profile.cifNif || "",
                address: {
                    addressLine: profile.billingAddress || ""
                }
            };

            // Crear objeto de cotización - CIF en notas
            const cifNote = profile.cifNif ? `CIF/NIF: ${profile.cifNif}` : "";
            const discountNote = discountPercent > 0 
                ? `Descuento B2B ${discountPercent}% aplicado.`
                : "";
            const notesText = [cifNote, discountNote, "Pago por transferencia."]
                .filter(n => n)
                .join("\n");
            
            const quoteInfo = {
                title: "Cotizacion B2B",
                customer: customer,
                currency: "EUR",
                lineItems: lineItems,
                dates: {
                    issueDate: now,
                    validThroughDate: dueDate
                },
                metadata: {
                    notes: notesText
                }
            };

            console.log("[B2B] Creando cotización:", JSON.stringify(quoteInfo));

            const quote = await priceQuotes.createPriceQuote(quoteInfo);

            console.log("[B2B] Cotización creada ID:", quote.id?.id);

            // Enviar la cotización por email
            await priceQuotes.sendPriceQuote(quote.id.id, quote.id.version);

            return {
                success: true,
                quoteId: quote.id.id,
                message: `Cotización enviada a ${email}`
            };

        } catch (error) {
            console.error("[B2B] Error creando cotización:", error);
            return {
                success: false,
                error: error.message || "Error al crear la cotización"
            };
        }
    }
);