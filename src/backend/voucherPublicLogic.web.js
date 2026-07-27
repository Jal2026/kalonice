// =====================================================
// KAMISUITE - Bonos (Página Pública) Backend
// =====================================================
// VERSION: 1.0.2
// FECHA: 3 de julio de 2026
//
// v1.0.2: 🎚️ SOPORTE DE VARIANTES en la fase de compra del bono.
//   Un servicio del ServiceCatalog con hasVariants:true y variantes
//   válidas se presenta al cliente como UNA SOLA TARJETA DE BONO en
//   el widget, con chips M/L/XL dentro para elegir la variante. El
//   bono queda emitido ligado a esa variante concreta: todos los usos
//   son de esa combinación servicio+variante. Si el cliente quiere
//   otra variante, compra otro bono.
//
//   Cambios exclusivamente en cuatro funciones existentes:
//     · getVoucherCatalog         — sigue devolviendo 1 elemento por
//                                   servicio. Cuando hay variantes,
//                                   añade hasVariants:true y variantes[]
//                                   con datos por variante (idx, label,
//                                   precios, voucherKey). El widget
//                                   pinta los chips desde ese array.
//     · createVoucherCheckout     — acepta varianteIdx (opcional) en
//                                   el payload.
//     · tieneBonoActivoDelServicio — nueva firma (contactId,
//                                    serviceSetupUid, serviceLabel).
//                                    Retrocompat: si serviceLabel no
//                                    llega, comportamiento actual.
//     · getCurrentMemberVoucherStatus — expone voucherKey compuesta
//                                       para bloqueo por variante.
//
//   Formato del serviceLabel con variante — literalmente el mismo
//   que recepcionProLogic v1.0.25 (línea 1263) aplica al principal
//   cuando la cita se crea con variante:
//     `${servicio.label} · ${varianteLabel}`
//   Separador: espacio + U+00B7 (punto medio) + espacio. Es el
//   mismo string que llega a serviciosDetail de la reserva, para
//   que el match del canje (aplicarCanjeProducto) funcione contra
//   la línea de la cita sin cambios en Recepción PRO en esta fase.
//
//   voucherKey — clave unificada de bloqueo para el frontend:
//     · Sin variante: voucherKey = serviceSetupUid (comportamiento
//       actual, retrocompat).
//     · Con variante: voucherKey = `${serviceSetupUid}::${serviceLabel}`.
//   El widget usa voucherKey para bloquear en el chip correcto
//   (no en la card entera). Cada variante tiene su propia voucherKey.
//
//   Cero campos nuevos en KamisuiteVouchers. La variante viaja en
//   el serviceLabel ya existente. varianteIdx NO se persiste (no
//   hace falta: serviceLabel + serviceSetupUid identifican el bono
//   de forma inequívoca).
//
//   Lectura de variantes desde el patrón real de producción:
//     · Field names del CMS confirmados por widgetPublicoLogic
//       (línea 322): {nombre, precio, duracion, tamano_estilo}.
//     · variantes es campo Text (JSON) con shape {items:[...]}
//       (mismo shape que complementos, mapeoFases, etc.).
//     · Label de la variante: v.label || v.nombre (prioridad idéntica
//       a la que aplica recepcionProCMS_widget v1.1.43 línea 3826
//       al construir varianteSel del principal).
//     · Precio: v.precio (fallback v.price para robustez con casos
//       legacy — mismo patrón defensivo que línea 3827).
//
//   Cero cambios en: confirmVoucherPayment, cancelVoucherPayment,
//   getVoucherSalonInfo, F7 email y sus 3 helpers, wixImageToPublicUrl,
//   generarCodigoUnico, calcularExpirationDate, buscarPrimeActiva,
//   listarBonosActivosMiembro. Cero cambios en el flujo de pago Wix Pay,
//   en el shape del insert de KamisuiteVouchers (fuera de que el
//   serviceLabel ahora puede llevar variante), ni en el email F7.
//
// v1.0.1: F7 — Email triggered de confirmación de compra de bono.
//   Tras confirmar el pago en Wix Pay (status PENDING → ACTIVO),
//   se dispara triggeredEmails.emailContact contra la plantilla
//   única SalonConfig.purchaseConfirmationTemplateId (un solo template
//   compartido para Bonos, PRIME y Tarjetas Promocionales mediante
//   variables labelDetalleX/valorDetalleX). Decisión Jal 27-jun:
//   ningún WhatsApp, ningún Brevo, solo email Wix triggered.
//   Cambios:
//     · Import nuevo: triggeredEmails de 'wix-crm-backend'.
//     · 2 helpers privados: _formatearFechaES, _formatearImporte.
//     · 1 helper privado: _enviarEmailCompraVoucher (fire-and-forget,
//       no bloqueante — si el email falla, la confirmación del pago
//       NO se ve afectada).
//     · Al final de confirmVoucherPayment, tras el update a ACTIVO,
//       _enviarEmailCompraVoucher(updated).catch(() => {});
//   NO se toca el flujo de pago, ni el catálogo, ni la creación de
//   checkout. Cero cambios funcionales en lo existente.
//
//   Firma usada: triggeredEmails.emailContact(templateId, contactId,
//   { variables }) — la oficial que el editor de Wix muestra en 2026
//   al pedir snippet por template.
//
// PÁGINA: /bonos (pública, frontend)
// ARCHIVO: backend/voucherPublicLogic.web.js
//
// ALCANCE F2.3:
//   · Lectura pública del catálogo de servicios con bono activo
//     (ServiceCatalog.bonoActivo === true). Incluye imagen del servicio.
//   · Lectura del estado del Wix Member logado (¿es PRIME activo?
//     ¿qué bonos tiene ya activos?).
//   · Creación de payment con wix-pay-backend (Wix Member obligatorio
//     + PRIME activo obligatorio).
//   · Confirmación post-pago: status PENDING → ACTIVO + remainingUses
//     inicializado al totalUses.
//   · Cancelación post-pago: status PENDING → CANCELADA.
//
// FUERA DE ALCANCE F2.3:
//   · Canje del bono en Recepción PRO V2 — F4.
//   · Notificación WhatsApp post-emisión — F7.
//   · Job nocturno que pone status=CADUCADO al pasar expirationDate
//     o status=AGOTADO cuando remainingUses=0 — F6.
//
// PATRÓN WIX PAY: idéntico a F2.1 (Tarjetas Promocionales) y F2.2 (PRIME).
//
// DECISIONES APLICADAS (cerradas con Jal 24 Jun 2026):
//   A) Comprar bono requiere ser PRIME activo (D-2 del briefing).
//   B) NO regalo en V1. Solo para uno mismo. contactId = comprador.
//   C) Si el cliente ya tiene un bono ACTIVO del mismo servicio,
//      bloquear la compra (no se acumulan). Solo cuando agote el
//      anterior puede comprar otro.
//   D) Página separada /bonos.
//
// PRECIO DEL BONO:
//   precioBruto = ServiceCatalog.price × bonoNumero
//   precioBono  = precioBruto × (1 - bonoDescuento/100)
//   appliedDiscount = bonoDescuento (% guardado para histórico)
//
// VALIDEZ:
//   expirationDate = issueDate + KamisuiteProductsConfig.voucherValidityMonths
//   (default 12 meses, decisión D-1).
//
// CÓDIGO ÚNICO:
//   Formato BN-XXXX-XXXX. Unicidad verificada por query.
//
// PERMISOS:
//   · getVoucherCatalog: Permissions.Anyone (visitante puede ver el
//     catálogo aunque no esté logado).
//   · getCurrentMemberVoucherStatus, createVoucherCheckout,
//     confirmVoucherPayment, cancelVoucherPayment: Permissions.SiteMember.
//
// CMS REFERENCIADOS:
//   · ServiceCatalog              (read-only: catálogo de servicios).
//   · KamisuiteProductsConfig     (read-only: voucherValidityMonths).
//   · KamisuitePrimeMemberships   (read-only: verificar PRIME activo).
//   · KamisuiteVouchers           (insert/update: bonos emitidos).
//   · SalonConfig                 (read-only: brand + skin + T&C URL).
//
// CHANGELOG:
// v1.0.0 - Versión inicial. F2.3 del módulo Productos Custom.
// v1.0.1 - F7 email triggered de confirmación de compra.
// v1.0.2 - Soporte de variantes: 1 card por servicio con array
//          variantes[] para chips en el widget; voucherKey compuesta;
//          serviceLabel con sufijo " · <variante>".
// =====================================================

import { Permissions, webMethod } from 'wix-web-module';
import wixData from 'wix-data';
import wixPayBackend from 'wix-pay-backend';
import { currentMember } from 'wix-members-backend';
// v1.0.1 — F7: email triggered de confirmación de compra
import { triggeredEmails } from 'wix-crm-backend';

const TAG = '[VoucherPublic][1.0.2]';

const CMS_CATALOG = 'ServiceCatalog';
const CMS_CONFIG = 'KamisuiteProductsConfig';
const CMS_PRIME = 'KamisuitePrimeMemberships';
const CMS_VOUCHERS = 'KamisuiteVouchers';
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

// Genera un código único BN-XXXX-XXXX, contra colisiones en CMS.
async function generarCodigoUnico() {
  const intentos = 5;
  for (let i = 0; i < intentos; i++) {
    const p1 = Math.random().toString(36).substring(2, 6).toUpperCase();
    const p2 = Math.random().toString(36).substring(2, 6).toUpperCase();
    const code = `BN-${p1}-${p2}`;
    const exists = await wixData.query(CMS_VOUCHERS)
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

function calcularExpirationDate(issueDate, validityMonths) {
  const dt = new Date(issueDate.getTime());
  dt.setMonth(dt.getMonth() + (validityMonths || 12));
  return dt;
}

// PRIME activo del miembro (mismo patrón que F2.2). Devuelve la fila
// o null. Filtra status y expirationDate en JS (booleanos/strings en
// .eq son frágiles en Wix Data — patrón validado del proyecto).
async function buscarPrimeActiva(contactId) {
  if (!contactId) return null;
  try {
    const result = await wixData.query(CMS_PRIME)
      .eq('contactId', contactId)
      .descending('_createdDate')
      .limit(50)
      .find({ suppressAuth: true });
    const items = result.items || [];
    const now = new Date();
    const activa = items.find(m => {
      if (m.status !== 'ACTIVA') return false;
      if (!m.expirationDate) return true;
      return new Date(m.expirationDate).getTime() >= now.getTime();
    });
    return activa || null;
  } catch (e) {
    console.error(`${TAG} ❌ buscarPrimeActiva:`, e.message);
    return null;
  }
}

// Bonos del miembro que estén ACTIVOS (status='ACTIVO' + no caducados
// + remainingUses > 0). Devuelve array.
async function listarBonosActivosMiembro(contactId) {
  if (!contactId) return [];
  try {
    const result = await wixData.query(CMS_VOUCHERS)
      .eq('contactId', contactId)
      .descending('_createdDate')
      .limit(200)
      .find({ suppressAuth: true });
    const items = result.items || [];
    const now = new Date();
    return items.filter(v => {
      if (v.status !== 'ACTIVO') return false;
      if (typeof v.remainingUses === 'number' && v.remainingUses <= 0) return false;
      if (v.expirationDate && new Date(v.expirationDate).getTime() < now.getTime()) return false;
      return true;
    });
  } catch (e) {
    console.error(`${TAG} ❌ listarBonosActivosMiembro:`, e.message);
    return [];
  }
}

// v1.0.2 — Comprueba si el miembro ya tiene un bono ACTIVO del mismo
// servicio+variante. Decisión C: NO se acumulan.
//
// Firma extendida: (contactId, serviceSetupUid, serviceLabel?).
//   · Si serviceLabel llega → match por (serviceSetupUid, serviceLabel).
//     Permite distinguir Nanoplastia · M de Nanoplastia · L (mismo
//     setupUid, distinto label).
//   · Si serviceLabel NO llega → comportamiento previo (match solo por
//     serviceSetupUid). Retrocompat con llamadores que no envíen label.
async function tieneBonoActivoDelServicio(contactId, serviceSetupUid, serviceLabel) {
  if (!contactId || !serviceSetupUid) return null;
  const activos = await listarBonosActivosMiembro(contactId);
  if (serviceLabel != null && serviceLabel !== '') {
    return activos.find(v =>
      v.serviceSetupUid === serviceSetupUid &&
      String(v.serviceLabel || '') === String(serviceLabel)
    ) || null;
  }
  return activos.find(v => v.serviceSetupUid === serviceSetupUid) || null;
}

// v1.0.2 — Lee un campo Text (JSON) del CMS con shape {items:[...]}.
// Patrón defensivo idéntico al del resto del proyecto (jsonIn de
// widgetPublicoLogic / recepcionProLogic): soporta string JSON, objeto
// con .items, array directo. Devuelve array o [].
function _leerItemsJson(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'object') {
    if (Array.isArray(raw.items)) return raw.items;
    return [];
  }
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw);
      if (Array.isArray(p)) return p;
      if (p && Array.isArray(p.items)) return p.items;
    } catch (_) {}
  }
  return [];
}

// v1.0.2 — Extrae {label, price, duration} de una variante del CMS.
// Prioridades idénticas a las que aplica recepcionProCMS_widget v1.1.43
// línea 3826-3828 al construir varianteSel del principal:
//   label:    v.label || v.nombre  (fallback vacío)
//   price:    v.precio ?? v.price   (fallback 0)
//   duration: v.duracion ?? v.duration (fallback 0)
function _extraerCamposVariante(v) {
  if (!v || typeof v !== 'object') {
    return { label: '', price: 0, duration: 0 };
  }
  const label = (v.label || v.nombre) ? String(v.label || v.nombre).trim() : '';
  const priceRaw = (v.precio != null) ? v.precio : v.price;
  const price = Number(priceRaw);
  const durRaw = (v.duracion != null) ? v.duracion : v.duration;
  const duration = Number(durRaw);
  return {
    label,
    price: Number.isFinite(price) ? price : 0,
    duration: Number.isFinite(duration) ? duration : 0
  };
}

// v1.0.2 — Compone el label del bono para un servicio con variante.
// Formato IDÉNTICO al que aplica recepcionProLogic v1.0.25 línea 1263
// al principal cuando la cita se crea con variante:
//   `${servicio.label} · ${varianteLabel}`
// Separador: espacio + U+00B7 + espacio. Sin variante, label base.
function _componerServiceLabel(servicioLabel, varianteLabel) {
  const base = String(servicioLabel || '').trim();
  const v = String(varianteLabel || '').trim();
  if (!v) return base;
  return `${base} · ${v}`.trim();
}

// =====================================================
// 1. INFO DEL SALÓN (Anyone)
// =====================================================
// Lee SalonConfig y devuelve brandName + salonName + widgetSkin +
// termsConditionsUrl + privacyPolicyUrl. Igual que en F2.2.
export const getVoucherSalonInfo = webMethod(
  Permissions.Anyone,
  async () => {
    try {
      const r = await wixData.query(CMS_SALON).limit(1).find({ suppressAuth: true });
      const c = (r.items || [])[0] || {};
      return {
        success: true,
        info: {
          brandName: c.brandName || '',
          salonName: c.salonName || c.name || '',
          widgetSkin: c.widgetSkin || 'niebla',
          termsConditionsUrl: c.termsConditionsUrl || '',
          privacyPolicyUrl: c.privacyPolicyUrl || ''
        }
      };
    } catch (error) {
      console.error(`${TAG} ❌ getVoucherSalonInfo:`, error);
      return { success: false, info: { brandName: '', salonName: '', widgetSkin: 'niebla', termsConditionsUrl: '', privacyPolicyUrl: '' }, error: error.message };
    }
  }
);

// =====================================================
// 2. CATÁLOGO DE BONOS (Anyone)
// =====================================================
// Lista servicios del catálogo con bonoActivo===true. Filtra en JS
// (patrón validado: .eq sobre Boolean no funciona fiable en Wix Data).
// Devuelve precio del bono calculado, imagen del servicio convertida
// a URL pública, y metadatos.
//
// v1.0.2 — SIGUE devolviendo UN ELEMENTO POR SERVICIO. Cuando el
// servicio tiene hasVariants:true y variantes válidas, se añaden
// dos campos nuevos al shape:
//   · hasVariants (Boolean) — true si se generaron variantes válidas.
//   · variantes[] (Array)   — una entrada por variante válida, con
//                             {idx, label, precioServicio, precioBruto,
//                              precioBono, voucherKey}. El widget
//                             pinta los chips iterando este array.
// Cuando no hay variantes válidas: hasVariants:false, variantes:[],
// y los campos precioServicio/precioBruto/precioBono/voucherKey a
// nivel raíz mantienen su significado previo (comportamiento actual
// literal).
//
// voucherKey — clave unificada para el bloqueo "YA LO TIENES" en el
// widget:
//   · Sin variante: voucherKey = serviceSetupUid.
//   · Con variante: voucherKey = `${serviceSetupUid}::${serviceLabel}`.
// El widget la usa como key del set de bloqueados, tanto a nivel card
// como a nivel chip. Cada variante tiene su propia voucherKey.
export const getVoucherCatalog = webMethod(
  Permissions.Anyone,
  async () => {
    try {
      console.log(`${TAG} 📋 getVoucherCatalog`);

      const result = await wixData.query(CMS_CATALOG)
        .ascending('order')
        .limit(1000)
        .find({ suppressAuth: true });

      const items = result.items || [];
      const conBono = items.filter(c => c.bonoActivo === true);
      console.log(`${TAG} 📊 Servicios con bonoActivo===true: ${conBono.length} / ${items.length}`);

      const vouchers = conBono.map(c => {
        const setupUid = c.setupUid || c._id;
        const numero = (typeof c.bonoNumero === 'number') ? c.bonoNumero : 0;
        const descuento = (typeof c.bonoDescuento === 'number') ? c.bonoDescuento : 0;
        const baseLabel = c.label || '';

        // Detectar variantes válidas del servicio (mismo criterio que
        // aplicaremos también en createVoucherCheckout para consistencia).
        const tieneFlagVariantes = c.hasVariants === true;
        const rawVariantes = tieneFlagVariantes ? _leerItemsJson(c.variantes) : [];
        const variantesOut = [];
        if (tieneFlagVariantes && rawVariantes.length > 0) {
          for (let i = 0; i < rawVariantes.length; i++) {
            const vx = _extraerCamposVariante(rawVariantes[i]);
            if (!vx.label || vx.price <= 0) continue; // solo variantes válidas
            const precioBruto = Math.round(vx.price * numero * 100) / 100;
            const precioBono = Math.round(precioBruto * (1 - descuento / 100) * 100) / 100;
            const serviceLabelVariante = _componerServiceLabel(baseLabel, vx.label);
            variantesOut.push({
              idx: i,
              label: vx.label,                         // "M" / "L" / "XL"
              serviceLabel: serviceLabelVariante,      // "Nanoplastia · L"
              precioServicio: vx.price,                // precio base de la variante
              precioBruto,
              precioBono,
              voucherKey: `${setupUid}::${serviceLabelVariante}`
            });
          }
        }
        const hasVariants = variantesOut.length > 0;

        // Campos a nivel raíz: cuando NO hay variantes, mantienen el
        // significado y valores del comportamiento previo. Cuando SÍ
        // hay variantes, los precios raíz quedan en 0/0 porque el
        // widget lee de variantes[] (no ambigüedad).
        let precioServicio = 0, precioBruto = 0, precioBono = 0, voucherKey = setupUid;
        if (!hasVariants) {
          precioServicio = (typeof c.price === 'number') ? c.price : 0;
          precioBruto = Math.round(precioServicio * numero * 100) / 100;
          precioBono = Math.round(precioBruto * (1 - descuento / 100) * 100) / 100;
          voucherKey = setupUid;
        }

        return {
          serviceSetupUid: setupUid,                   // ID estable del servicio (padre)
          serviceCatalogId: c._id,                     // referencia interna
          serviceLabel: baseLabel,                     // label BASE del servicio, sin variante
          serviceFamily: c.family || '',
          serviceGroup: c.group || '',
          imagePublicUrl: wixImageToPublicUrl(c.image) || '',
          precioServicio,
          bonoNumero: numero,
          bonoDescuento: descuento,
          precioBruto,
          precioBono,
          voucherKey,
          hasVariants,
          variantes: variantesOut
        };
      });

      return { success: true, vouchers };

    } catch (error) {
      console.error(`${TAG} ❌ getVoucherCatalog:`, error);
      return { success: false, vouchers: [], error: error.message };
    }
  }
);

// =====================================================
// 3. ESTADO DEL MIEMBRO (SiteMember)
// =====================================================
// Devuelve si el Wix Member logado es PRIME activo y las voucherKey
// de los bonos que ya tiene activos (para que el widget marque los
// chips/tarjetas correspondientes con "YA LO TIENES").
//
// v1.0.2 — serviciosBloqueados ahora es array de voucherKey compuesta
// (`${serviceSetupUid}::${serviceLabel}`), NO array de serviceSetupUid.
// Un servicio con variantes puede tener bono de una sola variante; el
// widget necesita bloquear solo el CHIP de esa variante, no la card
// entera. Cada elemento de bonosActivos añade voucherKey en el mismo
// formato para que el widget haga bonoMap[voucherKey] sin recomponer.
export const getCurrentMemberVoucherStatus = webMethod(
  Permissions.SiteMember,
  async () => {
    try {
      const member = await currentMember.getMember();
      if (!member || !member._id) {
        return { success: false, isMember: false, isPrime: false };
      }
      const contactId = member.contactId || '';

      const prime = await buscarPrimeActiva(contactId);
      const activos = await listarBonosActivosMiembro(contactId);

      // v1.0.2 — voucherKey unifica la clave con la que devuelve
      // getVoucherCatalog. `${setupUid}::${serviceLabel}`.
      const computeKey = (v) => `${v.serviceSetupUid || ''}::${v.serviceLabel || ''}`;

      const serviciosBloqueados = activos
        .map(v => v.serviceSetupUid ? computeKey(v) : '')
        .filter(Boolean);

      return {
        success: true,
        isMember: true,
        contactId,
        isPrime: !!prime,
        primeExpirationDate: prime ? (prime.expirationDate || null) : null,
        serviciosBloqueados,
        bonosActivos: activos.map(v => ({
          code: v.code,
          serviceSetupUid: v.serviceSetupUid,
          serviceLabel: v.serviceLabel,
          voucherKey: computeKey(v),
          remainingUses: v.remainingUses,
          totalUses: v.totalUses,
          expirationDate: v.expirationDate || null
        }))
      };

    } catch (error) {
      console.error(`${TAG} ❌ getCurrentMemberVoucherStatus:`, error);
      return { success: false, error: error.message };
    }
  }
);

// =====================================================
// 4. CREAR CHECKOUT (SiteMember)
// =====================================================
// Flujo:
//   1) Verifica Wix Member logado + PRIME activo.
//   2) Carga el servicio del ServiceCatalog y valida bonoActivo.
//   3) Bloquea si el miembro ya tiene un bono ACTIVO del mismo servicio.
//   4) Calcula precio del bono.
//   5) Genera código BN-XXXX-XXXX.
//   6) Lee voucherValidityMonths de KamisuiteProductsConfig.
//   7) Inserta fila PENDING en KamisuiteVouchers.
//   8) Crea payment con wixPayBackend.createPayment.
//   9) Actualiza fila con paymentId.
export const createVoucherCheckout = webMethod(
  Permissions.SiteMember,
  async (payload) => {
    const {
      serviceSetupUid,
      // v1.0.2 — índice numérico de la variante elegida (opcional).
      // Si el servicio tiene hasVariants:true, el widget lo envía con
      // el idx de la variante que la clienta seleccionó en el chip.
      // Sin varianteIdx → comportamiento previo (precio base).
      varianteIdx,
      buyerName,
      buyerEmail,
      buyerPhone
    } = payload || {};

    try {
      console.log(`${TAG} 🛒 createVoucherCheckout | service=${serviceSetupUid} | varianteIdx=${varianteIdx == null ? 'null' : varianteIdx}`);

      if (!serviceSetupUid) {
        return { success: false, error: 'Falta identificador de servicio' };
      }

      // 1) Wix Member logado.
      const member = await currentMember.getMember();
      if (!member || !member._id) {
        return { success: false, error: 'Debes iniciar sesión para comprar un bono' };
      }
      const buyerContactId = member.contactId || '';
      if (!buyerContactId) {
        return { success: false, error: 'No se pudo identificar tu contacto' };
      }

      // Decisión A: requiere PRIME activo.
      const prime = await buscarPrimeActiva(buyerContactId);
      if (!prime) {
        return {
          success: false,
          needsPrime: true,
          error: 'Los bonos están reservados a miembros PRIME. Hazte PRIME primero.'
        };
      }

      // 2) Cargar el servicio del catálogo.
      // serviceSetupUid puede coincidir con setupUid (campo estable)
      // o con _id (referencia interna). Probamos ambos.
      let svcResult = await wixData.query(CMS_CATALOG)
        .eq('setupUid', serviceSetupUid)
        .limit(1)
        .find({ suppressAuth: true });
      let servicio = (svcResult.items || [])[0];
      if (!servicio) {
        try {
          servicio = await wixData.get(CMS_CATALOG, serviceSetupUid, { suppressAuth: true });
        } catch (_) { servicio = null; }
      }
      if (!servicio) {
        return { success: false, error: 'Servicio no encontrado' };
      }
      if (servicio.bonoActivo !== true) {
        return { success: false, error: 'Este servicio no tiene bono activo' };
      }

      const numero = (typeof servicio.bonoNumero === 'number') ? servicio.bonoNumero : 0;
      const descuento = (typeof servicio.bonoDescuento === 'number') ? servicio.bonoDescuento : 0;
      if (numero <= 0) {
        return { success: false, error: 'Configuración del bono no válida' };
      }

      // v1.0.2 — Resolver precio y label del servicio en función de si
      // llega variante o no. Si el servicio tiene hasVariants:true y el
      // widget envió varianteIdx, se usa el precio/label de la variante.
      // Si no, precio base del catálogo (comportamiento previo).
      let precioServicio = 0;
      let serviceLabelFinal = servicio.label || '';

      const idxNum = (varianteIdx == null || varianteIdx === '') ? null : Number(varianteIdx);
      const hayIdx = idxNum != null && Number.isFinite(idxNum) && idxNum >= 0;

      if (servicio.hasVariants === true && hayIdx) {
        const varsArr = _leerItemsJson(servicio.variantes);
        if (!varsArr[idxNum]) {
          return { success: false, error: 'Variante no encontrada en el servicio' };
        }
        const vx = _extraerCamposVariante(varsArr[idxNum]);
        if (!vx.label || vx.price <= 0) {
          return { success: false, error: 'Variante del servicio con precio no válido' };
        }
        precioServicio = vx.price;
        serviceLabelFinal = _componerServiceLabel(servicio.label, vx.label);
      } else {
        // Sin variante: comportamiento previo.
        precioServicio = (typeof servicio.price === 'number') ? servicio.price : 0;
      }

      if (precioServicio <= 0) {
        return { success: false, error: 'Configuración del bono no válida' };
      }
      const precioBruto = Math.round(precioServicio * numero * 100) / 100;
      const precioBono = Math.round(precioBruto * (1 - descuento / 100) * 100) / 100;
      if (precioBono <= 0) {
        return { success: false, error: 'Precio del bono no válido' };
      }

      // 3) Decisión C: bloquear si ya tiene un bono activo del mismo
      // servicio+variante. v1.0.2 — match por (serviceSetupUid,
      // serviceLabelFinal) para permitir bonos de distintas variantes
      // del mismo servicio.
      const serviceUid = servicio.setupUid || servicio._id;
      const yaTiene = await tieneBonoActivoDelServicio(buyerContactId, serviceUid, serviceLabelFinal);
      if (yaTiene) {
        return {
          success: false,
          alreadyHasVoucher: true,
          error: `Ya tienes un bono activo de "${serviceLabelFinal}". Cuando lo agotes podrás comprar otro.`,
          voucher: {
            code: yaTiene.code || '',
            remainingUses: yaTiene.remainingUses,
            totalUses: yaTiene.totalUses,
            expirationDate: yaTiene.expirationDate || null
          }
        };
      }

      // Validar payload.
      const buyerNameClean = String(buyerName || '').trim();
      const buyerEmailClean = String(buyerEmail || '').trim();
      const buyerPhoneClean = String(buyerPhone || '').trim();
      if (!buyerNameClean || !buyerEmailClean) {
        return { success: false, error: 'Faltan tus datos (nombre y email)' };
      }

      // 4) Código único.
      const code = await generarCodigoUnico();

      // 5) voucherValidityMonths.
      const cfgResult = await wixData.query(CMS_CONFIG).limit(1).find({ suppressAuth: true });
      const validityMonths = (cfgResult.items.length > 0 && typeof cfgResult.items[0].voucherValidityMonths === 'number')
        ? cfgResult.items[0].voucherValidityMonths
        : 12;

      // 6) Insertar fila PENDING en KamisuiteVouchers.
      // v1.0.2 — serviceLabel puede llevar sufijo " · <variante>".
      const registro = {
        code,
        contactId: buyerContactId,
        serviceSetupUid: serviceUid,
        serviceLabel: serviceLabelFinal,
        retailPrice: precioBruto,
        paidPrice: precioBono,
        appliedDiscount: descuento,
        totalUses: numero,
        remainingUses: numero,      // se inicializa = totalUses al emitir
        issueDate: null,            // se rellena en confirm
        expirationDate: null,       // se calcula en confirm
        paymentMethod: 'Wix Pay',
        paymentId: '',
        paymentReservationId: '',
        primeMembershipId: prime._id,
        status: 'PENDING',
        salonId: ''
      };

      const inserted = await wixData.insert(CMS_VOUCHERS, registro, { suppressAuth: true });
      console.log(`${TAG} ✅ Voucher PENDING insertado: ${inserted._id} (code=${code})`);

      // 7) Crear payment con Wix Pay.
      // v1.0.2 — itemName incluye la variante si aplica (serviceLabelFinal
      // ya lleva el sufijo " · <variante>" cuando corresponde).
      const itemName = `Bono · ${serviceLabelFinal || 'Servicio'} (${numero} usos)`;
      const payment = await wixPayBackend.createPayment({
        items: [{
          name: itemName,
          price: precioBono,
          quantity: 1
        }],
        amount: precioBono,
        currency: 'EUR',
        userInfo: {
          email: buyerEmailClean,
          firstName: buyerNameClean
        }
      });

      if (!payment || !payment.id) {
        try {
          inserted.status = 'CANCELADO';
          await wixData.update(CMS_VOUCHERS, inserted, { suppressAuth: true });
        } catch (_) {}
        return { success: false, error: 'No se pudo iniciar el pago' };
      }

      // 8) Actualizar fila con paymentId.
      inserted.paymentId = payment.id;
      await wixData.update(CMS_VOUCHERS, inserted, { suppressAuth: true });

      // Guardamos también los datos del comprador para histórico (si los
      // campos buyerName/buyerEmail/buyerPhone existen en el CMS, los
      // rellenamos; si no, no pasa nada).
      try {
        const r2 = await wixData.get(CMS_VOUCHERS, inserted._id, { suppressAuth: true });
        if (r2) {
          if ('buyerName' in r2 || true) r2.buyerName = buyerNameClean;
          if ('buyerEmail' in r2 || true) r2.buyerEmail = buyerEmailClean;
          if ('buyerPhone' in r2 || true) r2.buyerPhone = buyerPhoneClean;
          await wixData.update(CMS_VOUCHERS, r2, { suppressAuth: true });
        }
      } catch (_) {
        // No bloqueante: los datos del comprador también están en el
        // payment de Wix Pay.
      }

      console.log(`${TAG} ✅ Payment creado: ${payment.id}`);

      return {
        success: true,
        paymentId: payment.id,
        code,
        voucherId: inserted._id,
        precioBono,
        validityMonths
      };

    } catch (error) {
      console.error(`${TAG} ❌ createVoucherCheckout:`, error);
      return { success: false, error: error.message };
    }
  }
);

// =====================================================
// v1.0.1 — F7: HELPERS DE EMAIL DE CONFIRMACIÓN DE COMPRA
// =====================================================
// Tres funciones privadas, no exportadas. Implementación local
// (NO usa comunicacionesLogic) por dos razones:
//   1. La centralita no maneja todavía el evento "compra de producto
//      custom" (solo "reserva", "recordatorio", "cancelación", etc.).
//   2. Mantener el cambio aislado a este backend reduce el riesgo de
//      tocar flujos en producción de Hair-Times (reservas) que ya
//      pasan por la centralita.
// =====================================================

// Formato fecha ES (DD/MM/YYYY) a partir de un Date o string ISO.
// Devuelve '' si no se puede parsear.
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

// Formato importe ES (XX,XX €). Soporta number o string. Devuelve ''
// si no es numérico.
function _formatearImporte(amount, currency) {
  if (amount == null) return '';
  const n = Number(amount);
  if (!Number.isFinite(n)) return '';
  const cur = (currency === 'EUR' || !currency) ? '€' : String(currency);
  return `${n.toFixed(2).replace('.', ',')} ${cur}`;
}

// Dispara el triggered email de confirmación de compra de bono.
// Fire-and-forget: el llamador NO debe await este resultado. Si el
// email falla, la compra ya está confirmada y se loguea el error.
async function _enviarEmailCompraVoucher(updated) {
  try {
    if (!updated || !updated.contactId) {
      console.warn(`${TAG} ⚠️ _enviarEmailCompraVoucher sin contactId, skip`);
      return;
    }

    // Lee SalonConfig: templateId + brandName + siteUrl. Una sola query.
    const cfgRes = await wixData.query(CMS_SALON).limit(1).find({ suppressAuth: true });
    const cfg = (cfgRes.items && cfgRes.items[0]) || {};
    const templateId = cfg.purchaseConfirmationTemplateId || '';

    if (!templateId) {
      console.warn(`${TAG} ⚠️ SalonConfig.purchaseConfirmationTemplateId vacío — sin email`);
      return;
    }

    const brandName = cfg.brandName || '';
    const siteUrl   = cfg.siteUrl   || '';

    // Primer nombre del comprador. Si no hay, "Cliente" como fallback.
    const buyerName = String(updated.buyerName || '').trim();
    const nombreCliente = buyerName ? buyerName.split(/\s+/)[0] : 'Cliente';

    const fechaCaducidad = _formatearFechaES(updated.expirationDate);
    const importeStr     = _formatearImporte(updated.paidPrice, 'EUR');

    const serviceLabel = updated.serviceLabel || 'Servicio';
    const usosTotal    = Number(updated.totalUses) || 0;

    const variables = {
      nombreCliente,
      tituloProducto: `Bono ${serviceLabel}`,
      marca: brandName,
      labelDetalle1: 'Código',
      valorDetalle1: updated.code || '',
      labelDetalle2: 'Servicio',
      valorDetalle2: serviceLabel,
      labelDetalle3: 'Usos disponibles',
      valorDetalle3: `${usosTotal} ${usosTotal === 1 ? 'uso' : 'usos'}`,
      labelDetalle4: 'Validez',
      valorDetalle4: fechaCaducidad ? `Hasta el ${fechaCaducidad}` : '—',
      importe: importeStr,
      instruccionUso: 'El bono se aplicará automáticamente en tu próxima cita.',
      SITE_URL: siteUrl
    };

    await triggeredEmails.emailContact(templateId, updated.contactId, { variables });
    console.log(`${TAG} 📧 Email compra-bono enviado OK → contactId=${updated.contactId} code=${updated.code}`);
  } catch (emailErr) {
    // No bloqueante: la confirmación del pago YA está hecha. El error
    // solo se loguea para diagnóstico (incidencia manual si procede).
    console.error(`${TAG} ⚠️ Error enviando email compra-bono (no bloqueante):`, emailErr && emailErr.message);
  }
}

// =====================================================
// 5. CONFIRMAR PAGO (SiteMember)
// =====================================================
// PENDING → ACTIVO + issueDate=now + expirationDate=now+validityMonths.
// Idempotente.
export const confirmVoucherPayment = webMethod(
  Permissions.SiteMember,
  async ({ voucherId, paymentId }) => {
    try {
      console.log(`${TAG} ✅ confirmVoucherPayment | id=${voucherId} | paymentId=${paymentId}`);

      if (!voucherId) {
        return { success: false, error: 'Falta voucherId' };
      }

      const registro = await wixData.get(CMS_VOUCHERS, voucherId, { suppressAuth: true });
      if (!registro) {
        return { success: false, error: 'Bono no encontrado' };
      }

      if (paymentId && registro.paymentId && registro.paymentId !== paymentId) {
        console.warn(`${TAG} ⚠️ paymentId divergente: payload=${paymentId} fila=${registro.paymentId}`);
        return { success: false, error: 'Conflicto en el identificador de pago' };
      }

      if (registro.status === 'ACTIVO') {
        return {
          success: true,
          alreadyActivo: true,
          code: registro.code,
          voucherId: registro._id,
          expirationDate: registro.expirationDate || null,
          remainingUses: registro.remainingUses,
          totalUses: registro.totalUses
        };
      }

      if (registro.status === 'CANCELADO') {
        return { success: false, error: 'Este bono estaba cancelado' };
      }

      // Calcular fechas.
      const cfgResult = await wixData.query(CMS_CONFIG).limit(1).find({ suppressAuth: true });
      const validityMonths = (cfgResult.items.length > 0 && typeof cfgResult.items[0].voucherValidityMonths === 'number')
        ? cfgResult.items[0].voucherValidityMonths
        : 12;

      const now = new Date();
      registro.status = 'ACTIVO';
      registro.issueDate = now;
      registro.expirationDate = calcularExpirationDate(now, validityMonths);
      registro.paymentMethod = 'Wix Pay';

      const updated = await wixData.update(CMS_VOUCHERS, registro, { suppressAuth: true });
      console.log(`${TAG} ✅ Voucher ACTIVO: ${updated._id} | vence=${updated.expirationDate.toISOString()}`);

      // v1.0.1 — F7: email triggered de confirmación de compra.
      // Fire-and-forget: si falla NO afecta a la confirmación del pago.
      _enviarEmailCompraVoucher(updated).catch(() => {});

      // F7 (WhatsApp) no se dispara aún.

      return {
        success: true,
        code: updated.code,
        voucherId: updated._id,
        issueDate: updated.issueDate || null,
        expirationDate: updated.expirationDate || null,
        remainingUses: updated.remainingUses,
        totalUses: updated.totalUses
      };

    } catch (error) {
      console.error(`${TAG} ❌ confirmVoucherPayment:`, error);
      return { success: false, error: error.message };
    }
  }
);

// =====================================================
// 6. CANCELAR PAGO (SiteMember)
// =====================================================
export const cancelVoucherPayment = webMethod(
  Permissions.SiteMember,
  async ({ voucherId, paymentId }) => {
    try {
      console.log(`${TAG} 🚫 cancelVoucherPayment | id=${voucherId}`);

      if (!voucherId) {
        return { success: false, error: 'Falta voucherId' };
      }

      const registro = await wixData.get(CMS_VOUCHERS, voucherId, { suppressAuth: true });
      if (!registro) {
        return { success: false, error: 'Bono no encontrado' };
      }

      if (paymentId && registro.paymentId && registro.paymentId !== paymentId) {
        console.warn(`${TAG} ⚠️ paymentId divergente: payload=${paymentId} fila=${registro.paymentId}`);
        return { success: false, error: 'Conflicto en el identificador de pago' };
      }

      if (registro.status === 'CANCELADO') {
        return { success: true, alreadyCancelado: true };
      }
      if (registro.status === 'ACTIVO') {
        return { success: false, error: 'El bono ya está activo, no se puede cancelar desde aquí' };
      }

      registro.status = 'CANCELADO';
      const updated = await wixData.update(CMS_VOUCHERS, registro, { suppressAuth: true });
      console.log(`${TAG} ✅ Voucher CANCELADO: ${updated._id}`);

      return { success: true, voucherId: updated._id };

    } catch (error) {
      console.error(`${TAG} ❌ cancelVoucherPayment:`, error);
      return { success: false, error: error.message };
    }
  }
);