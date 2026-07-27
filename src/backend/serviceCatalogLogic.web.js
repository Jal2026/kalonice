/* ═══════════════════════════════════════════════════════════════════════════
 * KAMISUITE — Service Catalog Logic (Wix Velo Backend)
 * Archivo:  serviceCatalogLogic.web.js
 * Ubicación en Wix: backend/
 * VERSION:  1.1.0
 * FECHA:    3 Junio 2026
 *
 * v1.1.0: NEW — getCatalogoMobile(): catálogo COMPLETO para Recepción Mobile.
 *         Devuelve la lista de servicios reservables (no solo precio/duración).
 *         Filtros adicionales: tipo IN ['publico', 'ambos'].
 *         Ordenado por order. Incluye family, group, hasVariants, image.
 *         Cero modificación de getCatalogoPreciosDuraciones (PRO sigue intacto).
 *
 * v1.0.0: Lectura de ServiceCatalog (CMS) para entregar precios y duraciones
 *         al frontend (Recepción PRO y futuras pantallas KAMISUITE).
 *
 *         Fuente: colección ServiceCatalog del salón.
 *         Filtros base:
 *           - active = true
 *           - uso IN ['kamisuite', 'ambos']
 *             · 'kamisuite' → servicio de uso exclusivo de las apps KAMISUITE
 *             · 'ambos'     → servicio compartido (KAMISUITE y widget público Wix)
 *             · 'wixnativo' → IGNORADO. Variantes/duplicados del widget público
 *                             que no deben aparecer en KAMISUITE.
 *         Clave del mapa: serviceIdWix (el ID del servicio en Wix Bookings).
 *
 *         Multi-tenant nativo: cada salón tiene su propia colección
 *         ServiceCatalog en su site. No hay valores hardcoded de salón.
 *
 *         Mantenedor: KAMISUITE
 * ═══════════════════════════════════════════════════════════════════════════ */

import { Permissions, webMethod } from 'wix-web-module';
import wixData from 'wix-data';

const TAG = '[ServiceCatalogLogic v1.1.0]';
const COLLECTION = 'ServiceCatalog';
const USOS_VALIDOS = ['kamisuite', 'ambos'];
const TIPOS_RESERVABLES = ['publico', 'ambos'];

// ─────────────────────────────────────────────────────────────────────────────
// getCatalogoPreciosDuraciones (v1.0.0 — sin cambios)
//   Mapa { [serviceIdWix]: { duration, price } } para Recepción PRO.
//   Solo precio y duración. Usado por kamisuiteAgenda.js.
// ─────────────────────────────────────────────────────────────────────────────
export const getCatalogoPreciosDuraciones = webMethod(
  Permissions.SiteMember,
  async () => {
    const t0 = Date.now();
    try {
      const result = await wixData.query(COLLECTION)
        .eq('active', true)
        .hasSome('uso', USOS_VALIDOS)
        .limit(1000)
        .find({ suppressAuth: true });

      const items = result.items || [];
      const mapa = {};
      let conId = 0;
      let sinId = 0;

      for (const it of items) {
        const sid = it.serviceIdWix;
        if (typeof sid !== 'string' || sid.length < 8) { sinId++; continue; }
        mapa[sid] = {
          duration: (typeof it.duration === 'number') ? it.duration : null,
          price: (typeof it.price === 'number') ? it.price : null
        };
        conId++;
      }

      console.log(`${TAG} ✅ Mapa precios/duraciones: ${conId} servicios${sinId ? ` (${sinId} sin ID)` : ''}. ${((Date.now() - t0) / 1000).toFixed(2)}s`);
      return { ok: true, mapa, total: conId };

    } catch (e) {
      console.error(`${TAG} ❌ getCatalogoPreciosDuraciones:`, e?.message);
      return { ok: false, error: { message: e?.message || 'Error' }, mapa: {} };
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// getCatalogoMobile (v1.1.0)
//   Lista COMPLETA de servicios reservables para Recepción Mobile.
//   Filtros: active=true, uso IN ['kamisuite','ambos'], tipo IN ['publico','ambos']
//   Ordenado por campo 'order' ASC.
//   No incluye servicios técnicos (fases) ni complementos internos.
// ─────────────────────────────────────────────────────────────────────────────
export const getCatalogoMobile = webMethod(
  Permissions.SiteMember,
  async () => {
    const t0 = Date.now();
    try {
      const result = await wixData.query(COLLECTION)
        .eq('active', true)
        .hasSome('uso', USOS_VALIDOS)
        .hasSome('tipo', TIPOS_RESERVABLES)
        .ascending('order')
        .limit(1000)
        .find({ suppressAuth: true });

      const items = result.items || [];
      const servicios = [];
      let ignorados = 0;

      for (const it of items) {
        const sid = it.serviceIdWix;
        if (typeof sid !== 'string' || sid.length < 8) { ignorados++; continue; }
        servicios.push({
          id: sid,
          label: it.label || '',
          family: it.family || 'simple',
          group: it.group || '',
          duration: (typeof it.duration === 'number') ? it.duration : null,
          price: (typeof it.price === 'number') ? it.price : null,
          hasVariants: !!it.hasVariants,
          image: it.image || null,
          order: (typeof it.order === 'number') ? it.order : 999
        });
      }

      console.log(`${TAG} ✅ Catálogo mobile: ${servicios.length} servicios reservables${ignorados ? ` (${ignorados} sin ID)` : ''}. ${((Date.now() - t0) / 1000).toFixed(2)}s`);
      return { ok: true, servicios, total: servicios.length };

    } catch (e) {
      console.error(`${TAG} ❌ getCatalogoMobile:`, e?.message);
      return { ok: false, error: { message: e?.message || 'Error' }, servicios: [] };
    }
  }
);