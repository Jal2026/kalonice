// =====================================================
// KAMISUITE - Tarjeta PRIME (Página Pública) Backend
// =====================================================
// VERSION: 1.0.3
// FECHA: 27 de junio de 2026
//
// v1.0.3: F7 — Email triggered de confirmación de compra de Tarjeta
//   PRIME. Mismo patrón que voucherPublicLogic v1.0.1 y
//   bonosPromosPublicLogic v1.0.1: plantilla única
//   SalonConfig.purchaseConfirmationTemplateId, fire-and-forget tras
//   confirmar el pago (status PENDING → ACTIVA). Decisión Jal 27-jun:
//   un solo template Wix Triggered (sin WhatsApp, sin Brevo).
//   Cambios:
//     · Import nuevo: triggeredEmails de 'wix-crm-backend'.
//     · 2 helpers privados: _formatearFechaES, _formatearImporte.
//     · 1 helper privado: _enviarEmailCompraPrime (no bloqueante).
//     · Al final de confirmPrimePayment, tras el update a ACTIVA,
//       _enviarEmailCompraPrime(updated).catch(() => {});
//   NO se toca el flujo de pago, ni el catálogo, ni la creación de
//   checkout. Cero cambios funcionales en lo existente.
//
// PÁGINA: /tarjetaprime (pública, frontend)
// ARCHIVO: backend/primePublicLogic.web.js
//
// ALCANCE F2.2:
//   · Lectura pública del producto PRIME (config + precio + beneficios
//     + imagen) desde KamisuiteProductsConfig, condicionada a
//     primeActive=true.
//   · Lectura del estado PRIME del Wix Member logado (si ya es PRIME
//     activo, qué membresía tiene, cuándo vence).
//   · Creación de payment con wix-pay-backend (Wix Member obligatorio,
//     bloquea duplicados si ya es PRIME activo).
//   · Confirmación post-pago: status PENDING → ACTIVA + escritura de
//     extendedFields.club_kalonice=true en Wix Contacts del comprador.
//   · Cancelación post-pago: status PENDING → CANCELADA.
//
// FUERA DE ALCANCE F2.2:
//   · Venta a un tercero / regalo (decisión cerrada: PRIME no se regala
//     en V1, solo se compra para uno mismo).
//   · Notificación WhatsApp post-emisión y recordatorios de vencimiento
//     — F7.
//   · Job nocturno que pone status=VENCIDA y club_kalonice=false al
//     pasar expirationDate — F6.
//
// PATRÓN WIX PAY: copiado literal del legacy HairTimes V1 + F2.1
// (bonosPromosPublicLogic v1.0.1).
//
// PATRÓN WIX CONTACTS: copiado literal de
// clienteAreaLogic.updatePerfilCliente (escritura de extendedFields
// vía elevate(contacts.updateContact) con identifiers
// {contactId, revision} y contactInfo.extendedFields).
//
// DECISIONES APLICADAS:
//   · Página separada /tarjetaprime (decisión Jal 23 Jun).
//   · NO regalo en V1.
//   · Si Wix Member ya tiene PRIME activa: bloqueo + info de su
//     membresía actual. createPrimeCheckout rechaza con error claro.
//   · Título visual: "Tarjeta PRIME" sin sufijo. La marca del salón va
//     embebida en la imagen primeImage (formato tarjeta 1.585:1).
//   · Código formato PR-XXXX-XXXX (8 hex + 8 hex, unicidad
//     verificada).
//   · expirationDate = issueDate + primeDurationMonths (setMonth).
//
// PERMISOS:
//   · getPrimeProduct: Permissions.Anyone.
//   · getCurrentMemberPrimeStatus, createPrimeCheckout,
//     confirmPrimePayment, cancelPrimePayment: Permissions.SiteMember.
//
// CMS REFERENCIADOS:
//   · KamisuiteProductsConfig    (read-only: config global de PRIME).
//   · KamisuitePrimeMemberships  (insert/update: membresías emitidas).
//
// CHANGELOG:
// v1.0.2 - Ampliado getPrimeSalonInfo para exponer termsConditionsUrl
//          y privacyPolicyUrl desde SalonConfig. El widget pinta un
//          checkbox de aceptación de T&C antes del botón de compra,
//          activado por defecto, con enlace a la URL pública.
// v1.0.1 - Añadido endpoint getPrimeSalonInfo (Anyone) que expone
//          brandName + salonName + widgetSkin desde SalonConfig.
//          Permite usar brandName en el widget público (banner,
//          confirmaciones, futuras notificaciones WhatsApp en F7) sin
//          depender de getSalonConfig de widgetPublicoLogic (que no
//          expone brandName).
// v1.0.0 - Versión inicial. F2.2 del módulo Productos Custom.
// =====================================================

import { Permissions, webMethod } from 'wix-web-module';
import wixData from 'wix-data';
import wixPayBackend from 'wix-pay-backend';
import { currentMember } from 'wix-members-backend';
import { contacts } from 'wix-crm-backend';
import { elevate } from 'wix-auth';
// v1.0.3 — F7: email triggered de confirmación de compra
import { triggeredEmails } from 'wix-crm-backend';

const TAG = '[PrimePublic][1.0.3]';

const CMS_CONFIG = 'KamisuiteProductsConfig';
const CMS_PRIME = 'KamisuitePrimeMemberships';
const CMS_SALON = 'SalonConfig';

// Field key del custom field en Wix Contacts. Mismo literal que usa el
// código histórico (clienteAreaLogic v1.5.4): 'club_kalonice' SIN
// prefijo 'custom.'.
const FIELD_CLUB_KALONICE = 'club_kalonice';

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

// Genera un código único PR-XXXX-XXXX. Comprueba unicidad contra el CMS.
async function generarCodigoUnico() {
  const intentos = 5;
  for (let i = 0; i < intentos; i++) {
    const p1 = Math.random().toString(36).substring(2, 6).toUpperCase();
    const p2 = Math.random().toString(36).substring(2, 6).toUpperCase();
    const code = `PR-${p1}-${p2}`;
    const exists = await wixData.query(CMS_PRIME)
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

// Calcula la fecha de vencimiento sumando N meses al issueDate.
function calcularExpirationDate(issueDate, durationMonths) {
  const dt = new Date(issueDate.getTime());
  dt.setMonth(dt.getMonth() + (durationMonths || 12));
  return dt;
}

// Busca si un contactId tiene una membresía PRIME activa hoy.
// "Activa hoy" = status='ACTIVA' Y expirationDate >= now.
// Devuelve la fila o null. Filtro de status en JS (patrón validado
// F2.1: .eq sobre strings tampoco da problemas, pero por consistencia
// con .eq sobre booleans del proyecto, lo dejamos como query simple
// y filtramos en JS para tener la lógica de fechas en un solo sitio).
async function buscarPrimeActivaPorContactId(contactId) {
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
      if (!m.expirationDate) return true; // sin vencimiento → considerada activa
      return new Date(m.expirationDate).getTime() >= now.getTime();
    });
    return activa || null;
  } catch (e) {
    console.error(`${TAG} ❌ buscarPrimeActivaPorContactId:`, e.message);
    return null;
  }
}

// Escribe extendedFields.club_kalonice en Wix Contacts del comprador.
// Patrón READ-MERGE-UPDATE con revision, igual que
// clienteAreaLogic.updatePerfilCliente. No bloquea la confirmación del
// pago si falla: la membresía se queda ACTIVA igualmente y se loguea
// warning (la coherencia se podrá restablecer en F6 con un job).
async function setClubKaloniceFlag(contactId, valor) {
  if (!contactId) {
    console.warn(`${TAG} ⚠️ setClubKaloniceFlag: contactId vacío, salto`);
    return false;
  }
  try {
    const elevatedGet = elevate(contacts.getContact);
    const contact = await elevatedGet(contactId);
    if (!contact || !contact.revision) {
      console.warn(`${TAG} ⚠️ setClubKaloniceFlag: contacto ${contactId} no encontrado o sin revision`);
      return false;
    }
    const contactInfo = {
      extendedFields: { [FIELD_CLUB_KALONICE]: !!valor }
    };
    const elevatedUpdate = elevate(contacts.updateContact);
    await elevatedUpdate(
      { contactId, revision: contact.revision },
      contactInfo,
      { suppressAuth: true }
    );
    console.log(`${TAG} ✅ club_kalonice=${!!valor} aplicado en Wix Contacts ${contactId}`);
    return true;
  } catch (e) {
    console.warn(`${TAG} ⚠️ setClubKaloniceFlag falló (no crítico):`, e.message);
    return false;
  }
}

// =====================================================
// 1. INFO DEL SALÓN (Anyone, lectura pública)
// =====================================================

// Lee SalonConfig y devuelve brandName + salonName + widgetSkin. El
// page code lo usa para pintar el banner público con la marca del
// salón y aplicar el skin del salón al widget.
export const getPrimeSalonInfo = webMethod(
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
      console.error(`${TAG} ❌ getPrimeSalonInfo:`, error);
      return { success: false, info: { brandName: '', salonName: '', widgetSkin: 'niebla', termsConditionsUrl: '', privacyPolicyUrl: '' }, error: error.message };
    }
  }
);

// =====================================================
// 2. PRODUCTO PRIME (Anyone, lectura pública)
// =====================================================

// Devuelve la configuración del producto PRIME para el catálogo
// público. Si primeActive=false, devuelve disponible:false para que la
// página muestre "Próximamente" sin exponer el precio.
export const getPrimeProduct = webMethod(
  Permissions.Anyone,
  async () => {
    try {
      console.log(`${TAG} 📋 getPrimeProduct`);

      const result = await wixData.query(CMS_CONFIG)
        .limit(1)
        .find({ suppressAuth: true });

      if (result.items.length === 0) {
        return { success: true, disponible: false };
      }

      const c = result.items[0];
      if (c.primeActive !== true) {
        return { success: true, disponible: false };
      }

      return {
        success: true,
        disponible: true,
        product: {
          annualPrice: (typeof c.primeAnnualPrice === 'number') ? c.primeAnnualPrice : 0,
          durationMonths: (typeof c.primeDurationMonths === 'number') ? c.primeDurationMonths : 12,
          benefits: c.primeBenefits || '',
          imagePublicUrl: wixImageToPublicUrl(c.primeImage) || ''
        }
      };

    } catch (error) {
      console.error(`${TAG} ❌ getPrimeProduct:`, error);
      return { success: false, disponible: false, error: error.message };
    }
  }
);

// =====================================================
// 2. ESTADO PRIME DEL MIEMBRO LOGADO (SiteMember)
// =====================================================

// Devuelve si el Wix Member logado tiene PRIME activa hoy. Lo usa el
// widget para mostrar el estado en lugar del botón comprar.
export const getCurrentMemberPrimeStatus = webMethod(
  Permissions.SiteMember,
  async () => {
    try {
      const member = await currentMember.getMember();
      if (!member || !member._id) {
        return { success: false, isMember: false, hasPrime: false };
      }
      const contactId = member.contactId || '';
      if (!contactId) {
        return { success: true, isMember: true, hasPrime: false };
      }

      const activa = await buscarPrimeActivaPorContactId(contactId);
      if (!activa) {
        return { success: true, isMember: true, hasPrime: false, contactId };
      }

      return {
        success: true,
        isMember: true,
        hasPrime: true,
        contactId,
        membership: {
          code: activa.code || '',
          issueDate: activa.issueDate || null,
          expirationDate: activa.expirationDate || null,
          paidPrice: (typeof activa.paidPrice === 'number') ? activa.paidPrice : 0,
          status: activa.status || ''
        }
      };

    } catch (error) {
      console.error(`${TAG} ❌ getCurrentMemberPrimeStatus:`, error);
      return { success: false, error: error.message };
    }
  }
);

// =====================================================
// 3. CREAR CHECKOUT (SiteMember)
// =====================================================

// Flujo:
//   1) Verifica Wix Member logado, carga contactId.
//   2) Bloquea si ya tiene PRIME activa.
//   3) Carga config (precio + duración), valida primeActive=true.
//   4) Genera código único PR-XXXX-XXXX.
//   5) Inserta fila PENDING en KamisuitePrimeMemberships.
//   6) Crea payment con wixPayBackend.createPayment.
//   7) Actualiza fila con paymentId.
//   8) Devuelve { paymentId, code, primeMembershipId } al page code.
export const createPrimeCheckout = webMethod(
  Permissions.SiteMember,
  async (payload) => {
    const { buyerName, buyerEmail, buyerPhone } = payload || {};

    try {
      console.log(`${TAG} 🛒 createPrimeCheckout`);

      // 1) Wix Member logado.
      const member = await currentMember.getMember();
      if (!member || !member._id) {
        return { success: false, error: 'Debes iniciar sesión para hacerte PRIME' };
      }
      const buyerContactId = member.contactId || '';
      if (!buyerContactId) {
        return { success: false, error: 'No se pudo identificar tu contacto' };
      }

      // 2) Bloqueo si ya es PRIME activa.
      const yaActiva = await buscarPrimeActivaPorContactId(buyerContactId);
      if (yaActiva) {
        const vence = yaActiva.expirationDate
          ? new Date(yaActiva.expirationDate).toLocaleDateString('es-ES')
          : '(sin vencimiento)';
        return {
          success: false,
          alreadyPrime: true,
          error: `Ya eres PRIME hasta ${vence}. No es necesario comprar de nuevo.`,
          membership: {
            code: yaActiva.code || '',
            expirationDate: yaActiva.expirationDate || null
          }
        };
      }

      // 3) Cargar config y validar primeActive.
      const cfgResult = await wixData.query(CMS_CONFIG).limit(1).find({ suppressAuth: true });
      if (cfgResult.items.length === 0) {
        return { success: false, error: 'Configuración del producto no disponible' };
      }
      const cfg = cfgResult.items[0];
      if (cfg.primeActive !== true) {
        return { success: false, error: 'La venta de PRIME no está activa' };
      }
      const annualPrice = (typeof cfg.primeAnnualPrice === 'number') ? cfg.primeAnnualPrice : 0;
      const durationMonths = (typeof cfg.primeDurationMonths === 'number') ? cfg.primeDurationMonths : 12;
      if (annualPrice <= 0) {
        return { success: false, error: 'Precio de PRIME no válido' };
      }

      // Validar payload comprador.
      const buyerNameClean = String(buyerName || '').trim();
      const buyerEmailClean = String(buyerEmail || '').trim();
      const buyerPhoneClean = String(buyerPhone || '').trim();
      if (!buyerNameClean || !buyerEmailClean) {
        return { success: false, error: 'Faltan tus datos (nombre y email)' };
      }

      // 4) Código único.
      const code = await generarCodigoUnico();

      // 5) Insertar fila PENDING.
      const registro = {
        code,
        contactId: buyerContactId,
        buyerName: buyerNameClean,
        buyerEmail: buyerEmailClean,
        buyerPhone: buyerPhoneClean,
        issueDate: null,             // se rellena en confirm
        expirationDate: null,        // se calcula en confirm con durationMonths
        paidPrice: annualPrice,
        paymentMethod: 'Wix Pay',
        paymentId: '',
        paymentReservationId: '',
        status: 'PENDING',
        reminderSent: false,
        salonId: '',
        internalNotes: ''
      };

      const inserted = await wixData.insert(CMS_PRIME, registro, { suppressAuth: true });
      console.log(`${TAG} ✅ PrimeMembership PENDING insertada: ${inserted._id} (code=${code})`);

      // 6) Crear payment con Wix Pay.
      const payment = await wixPayBackend.createPayment({
        items: [{
          name: 'Tarjeta PRIME',
          price: annualPrice,
          quantity: 1
        }],
        amount: annualPrice,
        currency: 'EUR',
        userInfo: {
          email: buyerEmailClean,
          firstName: buyerNameClean
        }
      });

      if (!payment || !payment.id) {
        // Limpieza: marcamos la fila como CANCELADA para no dejar PENDING basura.
        try {
          inserted.status = 'CANCELADA';
          await wixData.update(CMS_PRIME, inserted, { suppressAuth: true });
        } catch (_) {}
        return { success: false, error: 'No se pudo iniciar el pago' };
      }

      // 7) Actualizar fila con paymentId.
      inserted.paymentId = payment.id;
      await wixData.update(CMS_PRIME, inserted, { suppressAuth: true });
      console.log(`${TAG} ✅ Payment creado: ${payment.id}`);

      // 8) Devolver al page code.
      return {
        success: true,
        paymentId: payment.id,
        code,
        primeMembershipId: inserted._id,
        annualPrice,
        durationMonths
      };

    } catch (error) {
      console.error(`${TAG} ❌ createPrimeCheckout:`, error);
      return { success: false, error: error.message };
    }
  }
);

// =====================================================
// v1.0.3 — F7: HELPERS DE EMAIL DE CONFIRMACIÓN DE COMPRA
// =====================================================
// Tres funciones privadas, no exportadas. Mismo patrón que
// voucherPublicLogic v1.0.1 (formato fecha, importe, envío fire-and-
// forget). Implementación local, no usa la centralita comunicacionesLogic.
// =====================================================

// Formato fecha ES (DD/MM/YYYY). Devuelve '' si no se puede parsear.
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

// Formato importe ES (XX,XX €).
function _formatearImporte(amount, currency) {
  if (amount == null) return '';
  const n = Number(amount);
  if (!Number.isFinite(n)) return '';
  const cur = (currency === 'EUR' || !currency) ? '€' : String(currency);
  return `${n.toFixed(2).replace('.', ',')} ${cur}`;
}

// Dispara el triggered email de confirmación de compra PRIME.
async function _enviarEmailCompraPrime(updated) {
  try {
    if (!updated || !updated.contactId) {
      console.warn(`${TAG} ⚠️ _enviarEmailCompraPrime sin contactId, skip`);
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
    const fechaAlta      = _formatearFechaES(updated.issueDate);
    const importeStr     = _formatearImporte(updated.paidPrice, 'EUR');

    const variables = {
      nombreCliente,
      tituloProducto: 'Tarjeta PRIME',
      marca: brandName,
      labelDetalle1: 'Tipo',
      valorDetalle1: 'Membresía anual',
      labelDetalle2: 'Activa desde',
      valorDetalle2: fechaAlta || '—',
      labelDetalle3: 'Validez',
      valorDetalle3: fechaCaducidad ? `Hasta el ${fechaCaducidad}` : '—',
      labelDetalle4: 'Acceso',
      valorDetalle4: 'Bonos por servicio con descuento',
      importe: importeStr,
      instruccionUso: 'Ya puedes adquirir bonos en /bonos o desde tu área de cliente.',
      SITE_URL: siteUrl
    };

    await triggeredEmails.emailContact(templateId, updated.contactId, { variables });
    console.log(`${TAG} 📧 Email compra-PRIME enviado OK → contactId=${updated.contactId}`);
  } catch (emailErr) {
    console.error(`${TAG} ⚠️ Error enviando email compra-PRIME (no bloqueante):`, emailErr && emailErr.message);
  }
}

// =====================================================
// 4. CONFIRMAR PAGO (SiteMember)
// =====================================================

// Llamado por el page code tras wixPayFrontend.startPayment con
// status='Successful'. Marca la fila como ACTIVA, calcula issueDate y
// expirationDate, y aplica club_kalonice=true en Wix Contacts.
//
// Idempotente: si ya estaba ACTIVA, devuelve los datos. Si CANCELADA,
// error (no se reactiva).
export const confirmPrimePayment = webMethod(
  Permissions.SiteMember,
  async ({ primeMembershipId, paymentId }) => {
    try {
      console.log(`${TAG} ✅ confirmPrimePayment | id=${primeMembershipId} | paymentId=${paymentId}`);

      if (!primeMembershipId) {
        return { success: false, error: 'Falta primeMembershipId' };
      }

      const registro = await wixData.get(CMS_PRIME, primeMembershipId, { suppressAuth: true });
      if (!registro) {
        return { success: false, error: 'Membresía no encontrada' };
      }

      // Doble-check paymentId.
      if (paymentId && registro.paymentId && registro.paymentId !== paymentId) {
        console.warn(`${TAG} ⚠️ paymentId divergente: payload=${paymentId} fila=${registro.paymentId}`);
        return { success: false, error: 'Conflicto en el identificador de pago' };
      }

      if (registro.status === 'ACTIVA') {
        return {
          success: true,
          alreadyActiva: true,
          code: registro.code,
          primeMembershipId: registro._id,
          expirationDate: registro.expirationDate || null
        };
      }

      if (registro.status === 'CANCELADA') {
        return { success: false, error: 'Esta membresía estaba cancelada' };
      }

      // Calcular fechas.
      const cfgResult = await wixData.query(CMS_CONFIG).limit(1).find({ suppressAuth: true });
      const durationMonths = (cfgResult.items.length > 0 && typeof cfgResult.items[0].primeDurationMonths === 'number')
        ? cfgResult.items[0].primeDurationMonths
        : 12;

      const now = new Date();
      registro.status = 'ACTIVA';
      registro.issueDate = now;
      registro.expirationDate = calcularExpirationDate(now, durationMonths);
      registro.paymentMethod = 'Wix Pay';

      const updated = await wixData.update(CMS_PRIME, registro, { suppressAuth: true });
      console.log(`${TAG} ✅ PrimeMembership ACTIVA: ${updated._id} | vence=${updated.expirationDate.toISOString()}`);

      // Aplicar flag club_kalonice=true en Wix Contacts del comprador.
      // No bloqueante: si falla, queda warning y se podrá restablecer
      // en F6 con un job de coherencia.
      await setClubKaloniceFlag(updated.contactId, true);

      // v1.0.3 — F7: email triggered de confirmación de compra.
      // Fire-and-forget: si falla NO afecta a la activación PRIME.
      _enviarEmailCompraPrime(updated).catch(() => {});

      // F7 (notificaciones WhatsApp) no se dispara aún.

      return {
        success: true,
        code: updated.code,
        primeMembershipId: updated._id,
        issueDate: updated.issueDate || null,
        expirationDate: updated.expirationDate || null
      };

    } catch (error) {
      console.error(`${TAG} ❌ confirmPrimePayment:`, error);
      return { success: false, error: error.message };
    }
  }
);

// =====================================================
// 5. CANCELAR PAGO (SiteMember)
// =====================================================

export const cancelPrimePayment = webMethod(
  Permissions.SiteMember,
  async ({ primeMembershipId, paymentId }) => {
    try {
      console.log(`${TAG} 🚫 cancelPrimePayment | id=${primeMembershipId}`);

      if (!primeMembershipId) {
        return { success: false, error: 'Falta primeMembershipId' };
      }

      const registro = await wixData.get(CMS_PRIME, primeMembershipId, { suppressAuth: true });
      if (!registro) {
        return { success: false, error: 'Membresía no encontrada' };
      }

      if (paymentId && registro.paymentId && registro.paymentId !== paymentId) {
        console.warn(`${TAG} ⚠️ paymentId divergente: payload=${paymentId} fila=${registro.paymentId}`);
        return { success: false, error: 'Conflicto en el identificador de pago' };
      }

      if (registro.status === 'CANCELADA') {
        return { success: true, alreadyCancelada: true };
      }
      if (registro.status === 'ACTIVA') {
        return { success: false, error: 'La membresía ya está activa, no se puede cancelar desde aquí' };
      }

      registro.status = 'CANCELADA';
      const updated = await wixData.update(CMS_PRIME, registro, { suppressAuth: true });
      console.log(`${TAG} ✅ PrimeMembership CANCELADA: ${updated._id}`);

      return { success: true, primeMembershipId: updated._id };

    } catch (error) {
      console.error(`${TAG} ❌ cancelPrimePayment:`, error);
      return { success: false, error: error.message };
    }
  }
);