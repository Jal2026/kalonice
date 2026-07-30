// =====================================================
// KAMISUITE - Editor de Productos Custom Backend
// =====================================================
// VERSION: 1.0.2
// FECHA: 22 de junio de 2026 (v1.0.2: 30 de julio de 2026)
//
// MÓDULO: PRIME + Bonos + Tarjetas Promocionales.
// PANTALLA: /gestorbonosypromociones (interna, backoffice).
//
// ARCHIVO: backend/productosKamisuiteLogic.web.js
//
// ALCANCE F1 (este archivo):
//   · Lectura/escritura de KamisuiteProductsConfig (single-row,
//     auto-inserción de defaults si está vacía).
//   · Upload de imágenes (primeImage, campañas promocionales) usando
//     mismo patrón que serviciosEdicionLogic.uploadImagenServicio v1.11.6.
//   · CRUD de KamisuitePromoCampaigns (definición de campañas).
//   · Listados read-only de:
//       - servicios con bonoActivo=true (deeplink al Editor de Servicios).
//       - TODOS los servicios activos del catálogo (selector de campañas,
//         sin filtro de bono).
//       - membresías PRIME, bonos y tarjetas promocionales emitidas.
//   · Revocación manual (status='CANCELADA') de cada emisión.
//
// FUERA DE ALCANCE F1:
//   · Wix Pay / venta online — F2.
//   · Venta presencial Recepción PRO V2 — F3.
//   · Canje de bonos en checkout — F4.
//   · Notificaciones WhatsApp — F7.
//   · Trazabilidad Área Cliente / Ficha CRM / Informe del Día — F6.
//
// PERMISOS:
//   · Permissions.SiteMember en todos los webMethods (NUNCA Admin).
//   · suppressAuth:true en todas las queries CMS.
//
// CMS REFERENCIADOS:
//   · KamisuiteProductsConfig    (single-row, configuración global)
//   · KamisuitePromoCampaigns    (definiciones de campañas)
//   · KamisuitePrimeMemberships  (read-only desde aquí en F1)
//   · KamisuiteVouchers          (read-only desde aquí en F1)
//   · KamisuitePromoCards        (read-only desde aquí en F1)
//   · ServiceCatalog             (read-only: todos / con bono activo)
//
// NOTA sobre KamisuiteProductsConfig.promoCardsActive:
//   El campo existe en el CMS pero a partir de v1.0.1 NO se edita desde
//   el editor unificado. Cada campaña tiene su propio toggle `active`;
//   un killswitch global es redundante y conceptualmente confuso. Las
//   funciones de venta online (F2) deben filtrar por
//   KamisuitePromoCampaigns.active + ventana startDate/endDate, no por
//   promoCardsActive. El campo se mantiene en el shape devuelto por
//   getProductosConfig por retrocompatibilidad.
//
// CHANGELOG:
// v1.0.2 - · listarVouchersEmitidos ahora devuelve clientName (nombre
//            del cliente) en cada bono, para que el widget muestre el
//            nombre en la columna CLIENTE en vez del contactId (UUID).
//            KamisuiteVouchers ganó el campo clientName (paridad con
//            buyerName de KamisuitePrimeMemberships/KamisuitePromoCards).
//            Sin cambios en ninguna otra función.
// v1.0.1 - · NUEVO listarTodosServiciosActivos: devuelve todos los
//            servicios activos del catálogo (excluyendo anclas técnicas),
//            sin filtro por bonoActivo. Es lo que necesita el selector
//            de servicios del modal de campañas promocionales. El
//            anterior listarServiciosConBono se mantiene intacto para
//            la vista read-only de la pestaña Bonos.
//          · Helper calcularSetAnclas añadido (copia literal de
//            serviciosEdicionLogic v1.11.6).
//          · Sin cambios en el resto: configuración, CRUD de campañas,
//            listados de emisiones, revocaciones, uploads. La gestión
//            del campo promoCardsActive sigue presente en getProductosConfig
//            y actualizarProductosConfig por retrocompatibilidad
//            (actualizarProductosConfig acepta payload parcial; si el
//            editor unificado v1.0.1 ya no lo envía, no se modifica).
// v1.0.0 - Versión inicial. F1 del módulo Productos Custom.
// =====================================================

import { Permissions, webMethod } from 'wix-web-module';
import { mediaManager } from 'wix-media-backend';
import wixData from 'wix-data';

const TAG = '[ProductosKamisuite][1.0.1]';

const CMS_CONFIG = 'KamisuiteProductsConfig';
const CMS_CAMPAIGNS = 'KamisuitePromoCampaigns';
const CMS_PRIME = 'KamisuitePrimeMemberships';
const CMS_VOUCHERS = 'KamisuiteVouchers';
const CMS_PROMOCARDS = 'KamisuitePromoCards';
const CMS_CATALOG = 'ServiceCatalog';

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

function groupSlugToLabel(slug) {
  if (!slug) return 'Otros';
  const s = String(slug).trim();
  const map = {
    'coloracion': 'Coloración',
    'cortesmujer': 'Cortes Mujer',
    'peinados': 'Peinados',
    'tratamientos': 'Tratamientos',
    'caballero': 'Caballero',
    'spa': 'Spa Capilar',
    'fases': 'Fases'
  };
  if (map[s]) return map[s];
  const limpio = s.replace(/_/g, ' ').replace(/&/g, ' & ').replace(/\s+/g, ' ').trim();
  return limpio.charAt(0).toUpperCase() + limpio.slice(1);
}

// v1.0.1 — detecta el set de wixAnclaId únicos (anclas técnicas) para
// excluirlos del listado de servicios activos. Copiado literal de
// serviciosEdicionLogic.calcularSetAnclas v1.11.6.
function calcularSetAnclas(items) {
  const anclas = new Set();
  (items || []).forEach(c => {
    if (c.wixAnclaId && typeof c.wixAnclaId === 'string' && c.wixAnclaId.trim()) {
      anclas.add(c.wixAnclaId.trim());
    }
  });
  return anclas;
}

function configDefaults() {
  return {
    primeActive: false,
    primeAnnualPrice: 0,
    primeBenefits: '',
    primeDurationMonths: 12,
    primeImage: '',
    primeReminderDays: 7,
    promoCardsActive: false,
    vouchersActive: false,
    voucherValidityMonths: 12
  };
}

function toNumber(val, clampMin, clampMax) {
  if (val === null || val === undefined || val === '') return null;
  const n = Number(val);
  if (isNaN(n)) return null;
  let out = n;
  if (typeof clampMin === 'number') out = Math.max(clampMin, out);
  if (typeof clampMax === 'number') out = Math.min(clampMax, out);
  return out;
}

// =====================================================
// 1. CONFIGURACIÓN GLOBAL DEL MÓDULO
// =====================================================

export const getProductosConfig = webMethod(
  Permissions.SiteMember,
  async () => {
    try {
      console.log(`${TAG} 📖 getProductosConfig`);

      const result = await wixData.query(CMS_CONFIG)
        .limit(1)
        .find({ suppressAuth: true });

      let row;
      if (result.items.length === 0) {
        console.log(`${TAG} 🆕 KamisuiteProductsConfig vacía, insertando defaults`);
        const inserted = await wixData.insert(CMS_CONFIG, configDefaults(), { suppressAuth: true });
        row = inserted;
      } else {
        row = result.items[0];
      }

      return {
        success: true,
        config: {
          _id: row._id,
          primeActive: row.primeActive === true,
          primeAnnualPrice: (typeof row.primeAnnualPrice === 'number') ? row.primeAnnualPrice : 0,
          primeBenefits: row.primeBenefits || '',
          primeDurationMonths: (typeof row.primeDurationMonths === 'number') ? row.primeDurationMonths : 12,
          primeImage: row.primeImage || '',
          primeImagePublicUrl: wixImageToPublicUrl(row.primeImage) || '',
          primeReminderDays: (typeof row.primeReminderDays === 'number') ? row.primeReminderDays : 7,
          promoCardsActive: row.promoCardsActive === true,
          vouchersActive: row.vouchersActive === true,
          voucherValidityMonths: (typeof row.voucherValidityMonths === 'number') ? row.voucherValidityMonths : 12
        }
      };

    } catch (error) {
      console.error(`${TAG} ❌ getProductosConfig:`, error);
      return { success: false, error: error.message };
    }
  }
);

export const actualizarProductosConfig = webMethod(
  Permissions.SiteMember,
  async (payload) => {
    const {
      primeActive,
      primeAnnualPrice,
      primeBenefits,
      primeDurationMonths,
      primeImage,
      primeReminderDays,
      promoCardsActive,
      vouchersActive,
      voucherValidityMonths
    } = payload || {};

    try {
      console.log(`${TAG} 🔧 actualizarProductosConfig`);

      const result = await wixData.query(CMS_CONFIG)
        .limit(1)
        .find({ suppressAuth: true });

      let row;
      if (result.items.length === 0) {
        row = await wixData.insert(CMS_CONFIG, configDefaults(), { suppressAuth: true });
      } else {
        row = result.items[0];
      }

      if (primeActive !== undefined) row.primeActive = !!primeActive;
      if (primeAnnualPrice !== undefined) {
        const n = toNumber(primeAnnualPrice, 0);
        row.primeAnnualPrice = (n === null) ? 0 : n;
      }
      if (primeBenefits !== undefined) row.primeBenefits = String(primeBenefits || '');
      if (primeDurationMonths !== undefined) {
        const n = toNumber(primeDurationMonths, 1, 120);
        row.primeDurationMonths = (n === null) ? 12 : n;
      }
      if (primeImage !== undefined) row.primeImage = String(primeImage || '');
      if (primeReminderDays !== undefined) {
        const n = toNumber(primeReminderDays, 0, 365);
        row.primeReminderDays = (n === null) ? 7 : n;
      }
      if (promoCardsActive !== undefined) row.promoCardsActive = !!promoCardsActive;
      if (vouchersActive !== undefined) row.vouchersActive = !!vouchersActive;
      if (voucherValidityMonths !== undefined) {
        const n = toNumber(voucherValidityMonths, 1, 120);
        row.voucherValidityMonths = (n === null) ? 12 : n;
      }

      const updated = await wixData.update(CMS_CONFIG, row, { suppressAuth: true });
      console.log(`${TAG} ✅ KamisuiteProductsConfig actualizado: ${updated._id}`);

      return {
        success: true,
        config: {
          _id: updated._id,
          primeActive: updated.primeActive === true,
          primeAnnualPrice: (typeof updated.primeAnnualPrice === 'number') ? updated.primeAnnualPrice : 0,
          primeBenefits: updated.primeBenefits || '',
          primeDurationMonths: (typeof updated.primeDurationMonths === 'number') ? updated.primeDurationMonths : 12,
          primeImage: updated.primeImage || '',
          primeImagePublicUrl: wixImageToPublicUrl(updated.primeImage) || '',
          primeReminderDays: (typeof updated.primeReminderDays === 'number') ? updated.primeReminderDays : 7,
          promoCardsActive: updated.promoCardsActive === true,
          vouchersActive: updated.vouchersActive === true,
          voucherValidityMonths: (typeof updated.voucherValidityMonths === 'number') ? updated.voucherValidityMonths : 12
        }
      };

    } catch (error) {
      console.error(`${TAG} ❌ actualizarProductosConfig:`, error);
      return { success: false, error: error.message };
    }
  }
);

// =====================================================
// 2. UPLOAD DE IMÁGENES
// =====================================================

export const uploadImagenProductos = webMethod(
  Permissions.SiteMember,
  async ({ base64Data, fileName, mimeType, target, campo, campaignId }) => {
    try {
      console.log(`${TAG} 📸 uploadImagenProductos | target=${target || 'none'} | campo=${campo || '-'} | file=${fileName}`);

      if (!base64Data || !fileName) {
        return { ok: false, error: 'Faltan parámetros (base64Data, fileName)' };
      }

      const buffer = Buffer.from(base64Data, 'base64');
      const uploadResult = await mediaManager.upload(
        '/KamisuiteProductos',
        buffer,
        fileName,
        {
          mediaOptions: { mimeType: mimeType || 'image/jpeg', mediaType: 'image' },
          metadataOptions: { isPrivate: false, isVisitorUpload: false }
        }
      );

      const fileUrl = uploadResult?.fileUrl || '';
      if (!fileUrl) {
        return { ok: false, error: 'Media Manager no devolvió fileUrl' };
      }

      console.log(`${TAG} ✅ Imagen subida: ${fileUrl}`);

      if (target === 'config' && campo) {
        const result = await wixData.query(CMS_CONFIG).limit(1).find({ suppressAuth: true });
        let row;
        if (result.items.length === 0) {
          row = await wixData.insert(CMS_CONFIG, configDefaults(), { suppressAuth: true });
        } else {
          row = result.items[0];
        }
        row[campo] = fileUrl;
        await wixData.update(CMS_CONFIG, row, { suppressAuth: true });
        console.log(`${TAG} ✅ KamisuiteProductsConfig.${campo} actualizado`);
      } else if (target === 'campaign' && campaignId && campo) {
        const row = await wixData.get(CMS_CAMPAIGNS, campaignId, { suppressAuth: true });
        if (!row) {
          return { ok: false, error: 'Campaña no encontrada' };
        }
        row[campo] = fileUrl;
        await wixData.update(CMS_CAMPAIGNS, row, { suppressAuth: true });
        console.log(`${TAG} ✅ KamisuitePromoCampaigns[${campaignId}].${campo} actualizado`);
      }

      return {
        ok: true,
        fileUrl,
        publicUrl: wixImageToPublicUrl(fileUrl) || ''
      };

    } catch (e) {
      console.error(`${TAG} ❌ uploadImagenProductos:`, e.message);
      return { ok: false, error: e.message };
    }
  }
);

// =====================================================
// 3a. SERVICIOS CON BONO ACTIVO (read-only, pestaña Bonos)
// =====================================================

export const listarServiciosConBono = webMethod(
  Permissions.SiteMember,
  async () => {
    try {
      console.log(`${TAG} 📋 listarServiciosConBono`);

      const result = await wixData.query(CMS_CATALOG)
        .eq('bonoActivo', true)
        .limit(1000)
        .find({ suppressAuth: true });

      const items = result.items || [];

      const servicios = items.map(c => {
        const precio = (typeof c.price === 'number') ? c.price : 0;
        const n = (typeof c.bonoNumero === 'number') ? c.bonoNumero : 0;
        const desc = (typeof c.bonoDescuento === 'number') ? c.bonoDescuento : 0;
        const precioBruto = precio * n;
        const precioBono = Math.round(precioBruto * (1 - desc / 100) * 100) / 100;

        return {
          _id: c._id,
          setupUid: c.setupUid || '',
          label: c.label || '',
          category: groupSlugToLabel(c.group),
          imageUrl: wixImageToPublicUrl(c.image) || null,
          price: precio,
          bonoActivo: c.bonoActivo === true,
          bonoNumero: n,
          bonoDescuento: desc,
          precioBrutoCalculado: Math.round(precioBruto * 100) / 100,
          precioBonoCalculado: precioBono
        };
      });

      console.log(`${TAG} ✅ ${servicios.length} servicios con bono activo`);

      return { success: true, servicios };

    } catch (error) {
      console.error(`${TAG} ❌ listarServiciosConBono:`, error);
      return { success: false, error: error.message };
    }
  }
);

// =====================================================
// 3b. TODOS LOS SERVICIOS ACTIVOS (selector de campañas) — v1.0.1
// =====================================================

// Devuelve TODOS los servicios activos del catálogo, sin filtro por bono
// ni por descuento. Excluye solo las anclas técnicas (coloracion /
// tratamiento / simple — filas detectadas por wixAnclaId).
//
// Lo usa el modal de Tarjetas Promocionales: el salón puede crear una
// tarjeta de cualquier servicio del catálogo. NADA que ver con bonos.
//
// Patrón de exclusión de anclas copiado literal de
// serviciosEdicionLogic.listarServiciosCompleto v1.11.6.
export const listarTodosServiciosActivos = webMethod(
  Permissions.SiteMember,
  async () => {
    try {
      console.log(`${TAG} 📋 listarTodosServiciosActivos`);

      const result = await wixData.query(CMS_CATALOG)
        .limit(1000)
        .find({ suppressAuth: true });

      const items = result.items || [];
      const setAnclas = calcularSetAnclas(items);

      const servicios = items
        .filter(c => {
          // Excluir filas inactivas.
          if (c.active === false) return false;
          // Excluir las filas que SON anclas técnicas (serviceIdWix
          // coincide con un wixAnclaId del set).
          const sid = (c.serviceIdWix || '').trim();
          if (sid && setAnclas.has(sid)) return false;
          return true;
        })
        .map(c => ({
          _id: c._id,
          setupUid: c.setupUid || '',
          label: c.label || '',
          category: groupSlugToLabel(c.group),
          imageUrl: wixImageToPublicUrl(c.image) || null,
          price: (typeof c.price === 'number') ? c.price : 0,
          duration: (typeof c.duration === 'number') ? c.duration : null
        }))
        // Orden: primero por categoría, luego por nombre dentro de cada
        // categoría (el selector queda agrupable visualmente).
        .sort((a, b) => {
          const ca = (a.category || '').toLowerCase();
          const cb = (b.category || '').toLowerCase();
          if (ca !== cb) return ca < cb ? -1 : 1;
          return (a.label || '').toLowerCase() < (b.label || '').toLowerCase() ? -1 : 1;
        });

      console.log(`${TAG} ✅ ${servicios.length} servicios activos (anclas excluidas)`);

      return { success: true, servicios };

    } catch (error) {
      console.error(`${TAG} ❌ listarTodosServiciosActivos:`, error);
      return { success: false, error: error.message };
    }
  }
);

// =====================================================
// 4. PROMO CAMPAIGNS (CRUD)
// =====================================================

export const listarPromoCampaigns = webMethod(
  Permissions.SiteMember,
  async () => {
    try {
      console.log(`${TAG} 📋 listarPromoCampaigns`);

      const result = await wixData.query(CMS_CAMPAIGNS)
        .descending('_createdDate')
        .limit(500)
        .find({ suppressAuth: true });

      const campaigns = (result.items || []).map(c => ({
        _id: c._id,
        label: c.label || '',
        serviceSetupUid: c.serviceSetupUid || '',
        serviceLabel: c.serviceLabel || '',
        retailPrice: (typeof c.retailPrice === 'number') ? c.retailPrice : 0,
        promoPrice: (typeof c.promoPrice === 'number') ? c.promoPrice : 0,
        description: c.description || '',
        image: c.image || '',
        imagePublicUrl: wixImageToPublicUrl(c.image) || '',
        startDate: c.startDate || null,
        endDate: c.endDate || null,
        active: c.active === true,
        salonId: c.salonId || ''
      }));

      console.log(`${TAG} ✅ ${campaigns.length} campañas listadas`);

      return { success: true, campaigns };

    } catch (error) {
      console.error(`${TAG} ❌ listarPromoCampaigns:`, error);
      return { success: false, error: error.message };
    }
  }
);

export const crearPromoCampaign = webMethod(
  Permissions.SiteMember,
  async (payload) => {
    const {
      label,
      serviceSetupUid,
      serviceLabel,
      retailPrice,
      promoPrice,
      description,
      image,
      startDate,
      endDate,
      active,
      salonId
    } = payload || {};

    try {
      console.log(`${TAG} 🆕 crearPromoCampaign: ${label}`);

      if (!label || !String(label).trim()) {
        return { success: false, error: 'El nombre de la campaña es obligatorio' };
      }
      if (!serviceSetupUid) {
        return { success: false, error: 'Hay que asociar la campaña a un servicio' };
      }

      const registro = {
        label: String(label).trim(),
        serviceSetupUid: String(serviceSetupUid),
        serviceLabel: serviceLabel || '',
        retailPrice: toNumber(retailPrice, 0) ?? 0,
        promoPrice: toNumber(promoPrice, 0) ?? 0,
        description: description || '',
        image: image || '',
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        active: active === true,
        salonId: salonId || ''
      };

      const inserted = await wixData.insert(CMS_CAMPAIGNS, registro, { suppressAuth: true });
      console.log(`${TAG} ✅ Campaña creada: ${inserted._id}`);

      return {
        success: true,
        campaign: {
          _id: inserted._id,
          label: inserted.label,
          serviceSetupUid: inserted.serviceSetupUid,
          serviceLabel: inserted.serviceLabel || '',
          retailPrice: inserted.retailPrice,
          promoPrice: inserted.promoPrice,
          description: inserted.description || '',
          image: inserted.image || '',
          imagePublicUrl: wixImageToPublicUrl(inserted.image) || '',
          startDate: inserted.startDate || null,
          endDate: inserted.endDate || null,
          active: inserted.active === true,
          salonId: inserted.salonId || ''
        }
      };

    } catch (error) {
      console.error(`${TAG} ❌ crearPromoCampaign:`, error);
      return { success: false, error: error.message };
    }
  }
);

export const actualizarPromoCampaign = webMethod(
  Permissions.SiteMember,
  async (payload) => {
    const {
      _id,
      label,
      serviceSetupUid,
      serviceLabel,
      retailPrice,
      promoPrice,
      description,
      image,
      startDate,
      endDate,
      active,
      salonId
    } = payload || {};

    try {
      console.log(`${TAG} 🔧 actualizarPromoCampaign: ${_id}`);

      if (!_id) {
        return { success: false, error: 'Falta _id de la campaña' };
      }

      const registro = await wixData.get(CMS_CAMPAIGNS, _id, { suppressAuth: true });
      if (!registro) {
        return { success: false, error: 'Campaña no encontrada' };
      }

      if (label !== undefined && String(label).trim() !== '') registro.label = String(label).trim();
      if (serviceSetupUid !== undefined && serviceSetupUid !== '') registro.serviceSetupUid = String(serviceSetupUid);
      if (serviceLabel !== undefined) registro.serviceLabel = serviceLabel || '';
      if (retailPrice !== undefined) registro.retailPrice = toNumber(retailPrice, 0) ?? 0;
      if (promoPrice !== undefined) registro.promoPrice = toNumber(promoPrice, 0) ?? 0;
      if (description !== undefined) registro.description = description || '';
      if (image !== undefined) registro.image = image || '';
      if (startDate !== undefined) registro.startDate = startDate ? new Date(startDate) : null;
      if (endDate !== undefined) registro.endDate = endDate ? new Date(endDate) : null;
      if (active !== undefined) registro.active = !!active;
      if (salonId !== undefined) registro.salonId = salonId || '';

      const updated = await wixData.update(CMS_CAMPAIGNS, registro, { suppressAuth: true });
      console.log(`${TAG} ✅ Campaña actualizada: ${updated._id}`);

      return {
        success: true,
        campaign: {
          _id: updated._id,
          label: updated.label,
          serviceSetupUid: updated.serviceSetupUid,
          serviceLabel: updated.serviceLabel || '',
          retailPrice: updated.retailPrice,
          promoPrice: updated.promoPrice,
          description: updated.description || '',
          image: updated.image || '',
          imagePublicUrl: wixImageToPublicUrl(updated.image) || '',
          startDate: updated.startDate || null,
          endDate: updated.endDate || null,
          active: updated.active === true,
          salonId: updated.salonId || ''
        }
      };

    } catch (error) {
      console.error(`${TAG} ❌ actualizarPromoCampaign:`, error);
      return { success: false, error: error.message };
    }
  }
);

export const eliminarPromoCampaign = webMethod(
  Permissions.SiteMember,
  async ({ _id }) => {
    try {
      console.log(`${TAG} 🗑️ eliminarPromoCampaign: ${_id}`);

      if (!_id) {
        return { success: false, error: 'Falta _id' };
      }

      const queryResult = await wixData.query(CMS_CAMPAIGNS)
        .eq('_id', _id)
        .limit(1)
        .find({ suppressAuth: true });

      if (queryResult.items.length === 0) {
        return { success: true, _id, alreadyGone: true };
      }

      await wixData.remove(CMS_CAMPAIGNS, _id, { suppressAuth: true });
      console.log(`${TAG} ✅ Campaña eliminada: ${_id}`);

      return { success: true, _id };

    } catch (error) {
      console.error(`${TAG} ❌ eliminarPromoCampaign:`, error);
      return { success: false, error: error.message };
    }
  }
);

// =====================================================
// 5. LISTADOS READ-ONLY DE EMISIONES
// =====================================================

async function listarEmisiones(coleccion, opts) {
  const { contactId, status, codigo, desde, hasta, limit } = opts || {};
  let q = wixData.query(coleccion);

  if (contactId) q = q.eq('contactId', contactId);
  if (status) q = q.eq('status', status);
  if (codigo) q = q.eq('code', codigo);
  if (desde) q = q.ge('_createdDate', new Date(desde));
  if (hasta) q = q.le('_createdDate', new Date(hasta));

  q = q.descending('_createdDate').limit(Math.min(limit || 100, 500));
  const result = await q.find({ suppressAuth: true });
  return result.items || [];
}

export const listarPrimeMembershipsEmitidas = webMethod(
  Permissions.SiteMember,
  async (filtros) => {
    try {
      console.log(`${TAG} 📋 listarPrimeMembershipsEmitidas`, filtros || {});
      const items = await listarEmisiones(CMS_PRIME, filtros);

      const memberships = items.map(c => ({
        _id: c._id,
        code: c.code || '',
        contactId: c.contactId || '',
        buyerName: c.buyerName || '',
        buyerEmail: c.buyerEmail || '',
        buyerPhone: c.buyerPhone || '',
        issueDate: c.issueDate || null,
        expirationDate: c.expirationDate || null,
        paidPrice: (typeof c.paidPrice === 'number') ? c.paidPrice : 0,
        paymentMethod: c.paymentMethod || '',
        paymentId: c.paymentId || '',
        paymentReservationId: c.paymentReservationId || '',
        status: c.status || '',
        reminderSent: c.reminderSent === true,
        membershipImage: c.membershipImage || '',
        salonId: c.salonId || '',
        internalNotes: c.internalNotes || '',
        createdDate: c._createdDate || null
      }));

      return { success: true, memberships };
    } catch (error) {
      console.error(`${TAG} ❌ listarPrimeMembershipsEmitidas:`, error);
      return { success: false, error: error.message };
    }
  }
);

export const listarVouchersEmitidos = webMethod(
  Permissions.SiteMember,
  async (filtros) => {
    try {
      console.log(`${TAG} 📋 listarVouchersEmitidos`, filtros || {});
      const items = await listarEmisiones(CMS_VOUCHERS, filtros);

      const vouchers = items.map(c => ({
        _id: c._id,
        code: c.code || '',
        contactId: c.contactId || '',
        clientName: c.clientName || '',
        serviceSetupUid: c.serviceSetupUid || '',
        serviceLabel: c.serviceLabel || '',
        totalUses: (typeof c.totalUses === 'number') ? c.totalUses : 0,
        remainingUses: (typeof c.remainingUses === 'number') ? c.remainingUses : 0,
        retailPrice: (typeof c.retailPrice === 'number') ? c.retailPrice : 0,
        paidPrice: (typeof c.paidPrice === 'number') ? c.paidPrice : 0,
        appliedDiscount: (typeof c.appliedDiscount === 'number') ? c.appliedDiscount : 0,
        issueDate: c.issueDate || null,
        expirationDate: c.expirationDate || null,
        paymentMethod: c.paymentMethod || '',
        paymentId: c.paymentId || '',
        paymentReservationId: c.paymentReservationId || '',
        status: c.status || '',
        primeMembershipId: c.primeMembershipId || '',
        salonId: c.salonId || '',
        createdDate: c._createdDate || null
      }));

      return { success: true, vouchers };
    } catch (error) {
      console.error(`${TAG} ❌ listarVouchersEmitidos:`, error);
      return { success: false, error: error.message };
    }
  }
);

export const listarPromoCardsEmitidas = webMethod(
  Permissions.SiteMember,
  async (filtros) => {
    try {
      console.log(`${TAG} 📋 listarPromoCardsEmitidas`, filtros || {});
      const items = await listarEmisiones(CMS_PROMOCARDS, filtros);

      const cards = items.map(c => ({
        _id: c._id,
        code: c.code || '',
        promoTypeId: c.promoTypeId || '',
        serviceSetupUid: c.serviceSetupUid || '',
        serviceLabel: c.serviceLabel || '',
        retailPrice: (typeof c.retailPrice === 'number') ? c.retailPrice : 0,
        paidPrice: (typeof c.paidPrice === 'number') ? c.paidPrice : 0,
        buyerName: c.buyerName || '',
        buyerEmail: c.buyerEmail || '',
        buyerPhone: c.buyerPhone || '',
        buyerContactId: c.buyerContactId || '',
        recipientName: c.recipientName || '',
        recipientEmail: c.recipientEmail || '',
        recipientMessage: c.recipientMessage || '',
        isGift: c.isGift === true,
        issueDate: c.issueDate || null,
        expirationDate: c.expirationDate || null,
        paymentId: c.paymentId || '',
        paymentReservationId: c.paymentReservationId || '',
        paymentMethod: c.paymentMethod || '',
        status: c.status || '',
        redeemedInReservationId: c.redeemedInReservationId || '',
        redeemedByContactId: c.redeemedByContactId || '',
        redeemDate: c.redeemDate || null,
        promoCardImage: c.promoCardImage || '',
        salonId: c.salonId || '',
        createdDate: c._createdDate || null
      }));

      return { success: true, cards };
    } catch (error) {
      console.error(`${TAG} ❌ listarPromoCardsEmitidas:`, error);
      return { success: false, error: error.message };
    }
  }
);

// =====================================================
// 6. REVOCACIÓN MANUAL (status='CANCELADA')
// =====================================================

async function revocarRegistro(coleccion, id, etiqueta) {
  console.log(`${TAG} 🚫 revocar ${etiqueta}: ${id}`);

  if (!id) {
    return { success: false, error: `Falta _id de ${etiqueta}` };
  }

  const registro = await wixData.get(coleccion, id, { suppressAuth: true });
  if (!registro) {
    return { success: false, error: `${etiqueta} no encontrada` };
  }

  registro.status = 'CANCELADA';
  const updated = await wixData.update(coleccion, registro, { suppressAuth: true });
  console.log(`${TAG} ✅ ${etiqueta} revocada: ${updated._id}`);

  return { success: true, _id: updated._id, status: updated.status };
}

export const revocarPrimeMembership = webMethod(
  Permissions.SiteMember,
  async ({ _id }) => {
    try {
      return await revocarRegistro(CMS_PRIME, _id, 'Membresía PRIME');
    } catch (error) {
      console.error(`${TAG} ❌ revocarPrimeMembership:`, error);
      return { success: false, error: error.message };
    }
  }
);

export const revocarVoucher = webMethod(
  Permissions.SiteMember,
  async ({ _id }) => {
    try {
      return await revocarRegistro(CMS_VOUCHERS, _id, 'Bono');
    } catch (error) {
      console.error(`${TAG} ❌ revocarVoucher:`, error);
      return { success: false, error: error.message };
    }
  }
);

export const revocarPromoCard = webMethod(
  Permissions.SiteMember,
  async ({ _id }) => {
    try {
      return await revocarRegistro(CMS_PROMOCARDS, _id, 'Tarjeta Promocional');
    } catch (error) {
      console.error(`${TAG} ❌ revocarPromoCard:`, error);
      return { success: false, error: error.message };
    }
  }
);
