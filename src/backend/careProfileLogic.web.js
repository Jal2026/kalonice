// =====================================================
// KAMISUITE - Backend careProfileLogic.web.js
// Módulo: Área Salud & Cuidado — Care Profile
// =====================================================
// VERSION: 1.4.0
// FECHA: 4 Mayo 2026
//
// CHANGELOG:
//   v1.4.0 - CMS-first: getCareProductos pasa a leer PaymentReservations
//     en lugar de orders.searchOrders. Wix Stores deja de ser fuente de
//     lectura para productos del expediente — solo se usa para trazabilidad
//     fiscal en el flujo de venta. Razón: el contactId de buyerInfo de
//     Wix llega fusionado por el CRM y descarta ventas legítimas.
//     getCareServicios ahora filtra staff="TIENDA" para que las ventas
//     de producto no aparezcan en la pestaña Servicios. Tokens "🛒" en
//     registros mixtos legacy también se descartan en el parseo. Match
//     por contactId con fallback a nombreCliente para registros antiguos.
//     Import de orders eliminado (ya no se usa).
//   v1.3.0 - NEW: deleteCareVisit
//   v1.2.0 - NEW: updateCareNotes
//   v1.1.5 - FIX: getCareServicios búsqueda case-insensitive
//   v1.1.0 - REESCRITO: getCareServicios lee PaymentReservations
//   v1.0.0 - INICIAL
// =====================================================

import { webMethod, Permissions } from 'wix-web-module';
import { elevate } from 'wix-auth';
import { contacts } from 'wix-crm-backend';
import wixData from 'wix-data';

const VERSION = '1.4.0';
const TAG = `[CareProfile][${VERSION}]`;

// ─────────────────────────────────────────────
// COLECCIONES
// ─────────────────────────────────────────────

const COL_PAGOS        = 'PaymentReservations';
const COL_EXTERNAL     = 'SvExternalRecords';
const COL_CARE_PROFILE = 'ClientCareProfile';
const COL_CARE_VISIT   = 'CareVisitRecord';
const COL_CARE_MEDIA   = 'CareMedia';

// Constante discriminadora para ventas de producto
const STAFF_TIENDA = 'TIENDA';

// ─────────────────────────────────────────────
// UTILIDADES
// ─────────────────────────────────────────────

function safeErr(e) {
  return { name: e?.name || 'Error', message: e?.message || String(e) };
}

function formatearContacto(c) {
  const infoName = c?.info?.name || {};
  const nombre   = infoName.first || c?.name?.first || '';
  const apellido = infoName.last  || c?.name?.last  || '';
  const emails   = Array.isArray(c?.info?.emails) ? c.info.emails : [];
  const phones   = Array.isArray(c?.info?.phones) ? c.info.phones : [];
  const tags     = (c?.info?.labelKeys || []).map(l => l?.key || l).filter(Boolean);

  return {
    contactId:    c._id || c.id,
    fullName:     `${nombre} ${apellido}`.trim(),
    firstName:    nombre,
    lastName:     apellido,
    email:        emails[0]?.email || '',
    phone:        phones[0]?.phone || '',
    tags,
    createdDate:  c._createdDate || null,
    profileImage: c?.info?.picture?.image || null
  };
}

const KEYWORDS_TRATAMIENTO = [
  'tratamiento', 'kerastase', 'kérastase', 'hairtimes',
  'nanoplastia', 'botox', 'matiz', 'olaplex'
];

function esTratamiento(titulo) {
  if (!titulo) return false;
  return KEYWORDS_TRATAMIENTO.some(k => titulo.toLowerCase().includes(k));
}

// v1.4.0: Helper para parsear tokens de producto en descripción CMS.
// Formato: "🛒 Nombre (X€), 🛒 Nombre x2 (Y€)" → array {nombre, cantidad, subtotal, precioUnit}.
// Mismo comportamiento que parsearTokensProducto en testCheckout.web v3.26.
function parsearTokensProducto(descripcion) {
  const out = [];
  if (!descripcion || typeof descripcion !== 'string') return out;

  const tokens = descripcion.split(/,\s*/);
  for (const raw of tokens) {
    const token = raw.trim();
    if (!token.startsWith('🛒')) continue;

    const match = token.match(/^🛒\s*(.+?)\s*\(\s*([\d.,]+)\s*€?\s*\)\s*$/);
    if (!match) continue;

    let nombre = match[1].trim();
    const precioStr = match[2].replace(',', '.');
    const subtotal = parseFloat(precioStr) || 0;

    let cantidad = 1;
    const qtyMatch = nombre.match(/^(.+?)\s+x(\d+)\s*$/i);
    if (qtyMatch) {
      nombre = qtyMatch[1].trim();
      cantidad = parseInt(qtyMatch[2], 10) || 1;
    }

    const precioUnit = cantidad > 0 ? subtotal / cantidad : subtotal;
    out.push({ nombre, cantidad, subtotal, precioUnit });
  }
  return out;
}

// ─────────────────────────────────────────────
// 1. DATOS DE CONTACTO
// ─────────────────────────────────────────────

export const getCareContactData = webMethod(Permissions.Anyone, async ({ contactId }) => {
  try {
    console.log(`${TAG} getCareContactData — ${contactId}`);
    const elevatedGet = elevate(contacts.getContact);
    const c = await elevatedGet(contactId);
    return { ok: true, contact: formatearContacto(c) };
  } catch (e) {
    console.error(`${TAG} getCareContactData ERROR:`, e.message);
    return { ok: false, error: safeErr(e) };
  }
});

// ─────────────────────────────────────────────
// 2. SERVICIOS — lee PaymentReservations EXCLUYENDO staff="TIENDA"
// v1.4.0: filtra ventas de producto para que no aparezcan en Servicios.
//   - Match prioritario por contactId (registros nuevos lo tienen poblado).
//   - Fallback a nombreCliente case-insensitive (registros legacy).
//   - Tokens "🛒" en descripción se descartan en el parseo (registros
//     mixtos legacy donde se mezclaba servicio + producto en una fila).
// ─────────────────────────────────────────────

export const getCareServicios = webMethod(Permissions.Anyone, async ({ contactId }) => {
  try {
    console.log(`${TAG} getCareServicios — contactId: ${contactId}`);

    const elevatedGet = elevate(contacts.getContact);
    const c = await elevatedGet(contactId);
    const infoName  = c?.info?.name || {};
    const nombre    = infoName.first || '';
    const apellido  = infoName.last  || '';
    const nombreCompleto = `${nombre} ${apellido}`.trim();

    if (!nombreCompleto && !contactId) {
      console.warn(`${TAG} getCareServicios — sin nombre ni contactId`);
      return { ok: true, servicios: [], tratamientos: [] };
    }

    console.log(`${TAG} getCareServicios — buscando: "${nombreCompleto}" (cid=${contactId})`);

    const result = await wixData.query(COL_PAGOS)
      .descending('fechaReserva')
      .limit(500)
      .find({ suppressAuth: true });

    const nombreLower    = nombre.toLowerCase();
    const apellidoLower  = apellido.toLowerCase();

    // v1.4.0: filtro doble — excluir TIENDA + match por contactId con fallback a nombre
    const items = (result?.items || []).filter(r => {
      // Excluir ventas de producto (van a getCareProductos)
      if ((r.staff || '').trim().toUpperCase() === STAFF_TIENDA) return false;

      // Match por contactId (más fiable cuando existe)
      if (r.contactId && contactId && r.contactId === contactId) return true;

      // Fallback: match por nombre case-insensitive (registros legacy sin contactId)
      const nc = (r.nombreCliente || '').toLowerCase();
      if (!nombreLower) return false;
      return nc.includes(nombreLower) && (apellidoLower ? nc.includes(apellidoLower) : true);
    });

    console.log(`${TAG} getCareServicios — ${items.length} registros (excluido staff=TIENDA)`);

    const servicios    = [];
    const tratamientos = [];

    items.forEach(r => {
      const descripcionCompleta = r.descripcion || '---';
      const fecha    = r.fechaReserva || r.fechaPago || null;
      const staff    = r.staff    || '';
      const tipoPago = r.tipoPago || '';

      const partes = descripcionCompleta.split(', ').filter(p => p.trim());

      if (partes.length <= 1) {
        // Una única línea — si es token 🛒 (registro mixto legacy), descarta
        const trimmed = descripcionCompleta.trim();
        if (trimmed.startsWith('🛒')) return;

        const entry = {
          bookingId:   r.bookingId || '',
          descripcion: descripcionCompleta,
          fecha,
          importe:     r.importeTotal ? `${r.importeTotal} €` : '',
          staff,
          tipoPago
        };
        servicios.push(entry);
        if (esTratamiento(descripcionCompleta)) tratamientos.push(entry);
      } else {
        partes.forEach(parte => {
          const trimmed = parte.trim();
          if (!trimmed) return;
          // v1.4.0: ignorar tokens de producto dentro de descripciones mixtas
          if (trimmed.startsWith('🛒')) return;

          const precioMatch = trimmed.match(/\((\d+[,.]?\d*€?)\)$/);
          const precioStr   = precioMatch ? precioMatch[1] : '';
          const nombreSvc   = precioMatch ? trimmed.slice(0, trimmed.lastIndexOf('(')).trim() : trimmed;
          const entry = {
            bookingId:   r.bookingId || '',
            descripcion: nombreSvc || trimmed,
            fecha,
            importe:     precioStr,
            staff,
            tipoPago
          };
          servicios.push(entry);
          if (esTratamiento(trimmed)) tratamientos.push(entry);
        });
      }
    });

    // totalVisitas = registros únicos (1 cita = 1 fila CMS), no líneas parseadas
    return { ok: true, servicios, tratamientos, totalVisitas: items.length };
  } catch (e) {
    console.error(`${TAG} getCareServicios ERROR:`, e.message);
    return { ok: false, error: safeErr(e), servicios: [], tratamientos: [] };
  }
});

// ─────────────────────────────────────────────
// 3. PRODUCTOS COMPRADOS — v1.4.0 CMS-first
// Lee PaymentReservations donde staff="TIENDA". Cada registro tiene
// descripcion="🛒 Producto1 (X€), 🛒 Producto2 x2 (Y€)" → cada token
// genera una línea de producto en el resultado.
// Match prioritario por contactId, fallback a nombreCliente.
// Wix Stores ya no se consulta aquí — el contactId de buyerInfo viene
// fusionado por el CRM y descartaba ventas legítimas. La fuente fiable
// es PaymentReservations, que escribimos nosotros desde
// venderProductosDesdeAgenda con el contactId del pack original.
// ─────────────────────────────────────────────

export const getCareProductos = webMethod(Permissions.Anyone, async ({ contactId }) => {
  try {
    console.log(`${TAG} getCareProductos — contactId: ${contactId}`);

    // Leer nombre para fallback de matching (registros legacy sin contactId)
    let nombre = '', apellido = '';
    try {
      const elevatedGet = elevate(contacts.getContact);
      const c = await elevatedGet(contactId);
      const infoName = c?.info?.name || {};
      nombre = infoName.first || '';
      apellido = infoName.last || '';
    } catch (crmErr) {
      console.warn(`${TAG} getCareProductos — no se pudo leer CRM: ${crmErr.message}`);
    }

    const nombreLower   = nombre.toLowerCase();
    const apellidoLower = apellido.toLowerCase();

    // Query: solo ventas de producto (staff="TIENDA") ordenadas por fecha de pago
    const result = await wixData.query(COL_PAGOS)
      .eq('staff', STAFF_TIENDA)
      .descending('fechaPago')
      .limit(500)
      .find({ suppressAuth: true });

    // Filtro: match por contactId con fallback a nombre
    const items = (result?.items || []).filter(r => {
      if (r.contactId && contactId && r.contactId === contactId) return true;
      if (!nombreLower) return false;
      const nc = (r.nombreCliente || '').toLowerCase();
      return nc.includes(nombreLower) && (apellidoLower ? nc.includes(apellidoLower) : true);
    });

    console.log(`${TAG} getCareProductos — ${items.length} ventas TIENDA matcheadas`);

    // Cada venta puede contener N productos (tokens 🛒 separados por coma)
    const productos = [];
    items.forEach(r => {
      const fecha    = r.fechaPago || r.fechaReserva || null;
      const tipoPago = r.tipoPago || '';
      const orderId  = r.bookingId || r._id || '';

      const tokens = parsearTokensProducto(r.descripcion || '');
      if (tokens.length === 0) {
        console.warn(`${TAG} getCareProductos — venta sin tokens 🛒 parseables: "${r.descripcion}"`);
        return;
      }

      tokens.forEach(t => {
        productos.push({
          orderId,
          name:     t.nombre,
          quantity: t.cantidad,
          // Formateo "X €" para coincidir con el formato que el widget espera
          price:    t.subtotal ? `${t.subtotal} €` : '',
          // No guardamos imagen del producto en PaymentReservations.
          // El widget renderiza el icono 🧴 cuando imageUrl es null.
          imageUrl: null,
          date:     fecha,
          tipoPago
        });
      });
    });

    console.log(`${TAG} getCareProductos — ${productos.length} línea(s) de producto`);
    return { ok: true, productos };
  } catch (e) {
    console.error(`${TAG} getCareProductos ERROR:`, e.message);
    return { ok: false, error: safeErr(e), productos: [] };
  }
});

// ─────────────────────────────────────────────
// 4. SERVICIOS EXTERNOS (SvExternalRecords)
// ─────────────────────────────────────────────

export const getCareExternos = webMethod(Permissions.Anyone, async ({ contactId }) => {
  try {
    console.log(`${TAG} getCareExternos — contactId: ${contactId}`);
    const result = await wixData.query(COL_EXTERNAL)
      .eq('contactId', contactId)
      .descending('date')
      .limit(100)
      .find({ suppressAuth: true });

    const externos = (result?.items || []).map(r => ({
      id:           r._id,
      date:         r.date || r._createdDate || null,
      title:        r.title || '---',
      tipoServicio: r.category || '---',
      price:        r.totalPrice ? `${r.totalPrice} €` : '',
      duration:     r.totalDuration || null,
      status:       r.status || '',
      staffName:    'Emy'
    }));

    console.log(`${TAG} getCareExternos — ${externos.length} registros`);
    return { ok: true, externos };
  } catch (e) {
    console.error(`${TAG} getCareExternos ERROR:`, e.message);
    return { ok: false, error: safeErr(e), externos: [] };
  }
});

// ─────────────────────────────────────────────
// 5. EXPEDIENTE DE CUIDADO
// ─────────────────────────────────────────────

export const getCareExpediente = webMethod(Permissions.Anyone, async ({ contactId }) => {
  try {
    console.log(`${TAG} getCareExpediente — contactId: ${contactId}`);

    const profileResult = await wixData.query(COL_CARE_PROFILE)
      .eq('contactId', contactId)
      .limit(1)
      .find({ suppressAuth: true });

    const profile = profileResult?.items?.[0] || null;

    const visitsResult = await wixData.query(COL_CARE_VISIT)
      .eq('contactId', contactId)
      .descending('visitDate')
      .limit(100)
      .find({ suppressAuth: true });

    const visits = visitsResult?.items || [];

    let media = [];
    if (visits.length > 0) {
      const visitIds = visits.map(v => v._id);
      const mediaResult = await wixData.query(COL_CARE_MEDIA)
        .hasSome('visitRecordId', visitIds)
        .ascending('captureDate')
        .limit(200)
        .find({ suppressAuth: true });
      media = mediaResult?.items || [];
    }

    console.log(`${TAG} getCareExpediente — profile:${!!profile} visits:${visits.length} media:${media.length}`);
    return { ok: true, profile, visits, media };
  } catch (e) {
    console.error(`${TAG} getCareExpediente ERROR:`, e.message);
    return { ok: false, error: safeErr(e), profile: null, visits: [], media: [] };
  }
});

// ─────────────────────────────────────────────
// 6. ACTUALIZAR NOTAS (v1.2.0)
// ─────────────────────────────────────────────

export const updateCareNotes = webMethod(Permissions.Anyone, async ({ contactId, notes }) => {
  try {
    console.log(`${TAG} updateCareNotes — contactId: ${contactId}`);

    if (!contactId) {
      return { ok: false, error: 'contactId requerido' };
    }

    const trimmedNotes = (notes || '').trim();

    const existing = await wixData.query(COL_CARE_PROFILE)
      .eq('contactId', contactId)
      .limit(1)
      .find({ suppressAuth: true });

    if (existing.items && existing.items.length > 0) {
      const profile = existing.items[0];
      profile.notes = trimmedNotes;
      await wixData.update(COL_CARE_PROFILE, profile, { suppressAuth: true });
      console.log(`${TAG} Notas actualizadas para ${contactId}`);
    } else {
      const profile = {
        contactId,
        notes: trimmedNotes,
        followUpRequired: false,
        profileImage: '',
        createdDate: new Date(),
      };
      await wixData.insert(COL_CARE_PROFILE, profile, { suppressAuth: true });
      console.log(`${TAG} CareProfile CREADO con notas para ${contactId}`);
    }

    return { ok: true, notes: trimmedNotes };
  } catch (e) {
    console.error(`${TAG} updateCareNotes ERROR:`, e.message);
    return { ok: false, error: safeErr(e).message };
  }
});

// ─────────────────────────────────────────────
// 7. ELIMINAR VISITA DEL EXPEDIENTE (v1.3.0)
// ─────────────────────────────────────────────

export const deleteCareVisit = webMethod(Permissions.Anyone, async ({ visitId }) => {
  try {
    console.log(`${TAG} deleteCareVisit — visitId: ${visitId}`);

    if (!visitId) {
      return { ok: false, error: 'visitId requerido' };
    }

    const mediaResult = await wixData.query(COL_CARE_MEDIA)
      .eq('visitRecordId', visitId)
      .limit(50)
      .find({ suppressAuth: true });

    const mediaItems = mediaResult?.items || [];
    if (mediaItems.length > 0) {
      for (const m of mediaItems) {
        await wixData.remove(COL_CARE_MEDIA, m._id, { suppressAuth: true });
      }
      console.log(`${TAG} ${mediaItems.length} CareMedia eliminados`);
    }

    await wixData.remove(COL_CARE_VISIT, visitId, { suppressAuth: true });
    console.log(`${TAG} ✅ CareVisitRecord ${visitId} eliminado`);

    return { ok: true };
  } catch (e) {
    console.error(`${TAG} deleteCareVisit ERROR:`, e.message);
    return { ok: false, error: safeErr(e).message };
  }
});