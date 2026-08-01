// =====================================================
// KAMISUITE - Venta manual de ESPECIALES (PRIME · Bonos · Tarjetas) - Backend
// =====================================================
// VERSION: 1.0.1
// FECHA:   31 de julio de 2026 (v1.0.1: 2 de agosto de 2026)
// ARCHIVO: backend/especialesVentaLogic.web.js
//
// PROPÓSITO
//   Emisión PRESENCIAL (venta manual) de los tres productos comerciales
//   custom, SIN Wix Pay: recepción los vende y los cobra en el salón igual
//   que un servicio terminado (efectivo/tarjeta/bizum). Es el F3 que la
//   cabecera de productosKamisuiteLogic reservó como "Venta presencial".
//
//   ADITIVO Y AUTOCONTENIDO: no toca productosKamisuiteLogic.web.js ni los
//   backends públicos. Copia literal de sus patrones de creación
//   (voucherPublicLogic / primePublicLogic / bonosPromosPublicLogic) y del
//   registro de cobro de tiendaProductos.venderProductosDesdeAgenda.
//
// DIFERENCIAS CLAVE frente al flujo público (por diseño):
//   · Sin Wix Pay: la fila CMS se emite directamente en estado FINAL
//     (ACTIVO / ACTIVA / EMITIDA), no PENDING.
//   · Cobro registrado en PaymentReservations con staff="ESPECIALES" y
//     fechaPago=hoy. El cierre (obtenerDatosCierreExtendidos, Q2) suma
//     PaymentReservations del día por importeTotal SIN filtrar por staff
//     → entra en el INFORME FINANCIERO del día. La agenda y el rendimiento
//     se calculan por reserva (staffName); una venta ESPECIALES no tiene
//     reserva → NO aparece en el rendimiento productivo. (Mismo mecanismo
//     que TIENDA_POS en la Tienda.)
//   · Cliente identificado por contactId. El page code lo resuelve o lo da
//     de alta antes; aquí no se exige Wix Member logado.
//
// REGLA DE NEGOCIO (Jal, 31-jul-2026):
//   La venta de BONO exige que el cliente esté en el listado PRIME activo
//   (guard en emitirBonoManual). PRIME y tarjetas NO llevan candado PRIME.
//
// PERMISOS: Permissions.SiteMember en todos los webMethods. suppressAuth
//   en las queries CMS. El flag de club en Wix Contacts vía elevate().
//
// CMS: KamisuitePrimeMemberships, KamisuiteVouchers, KamisuitePromoCards,
//   KamisuitePromoCampaigns, ServiceCatalog, KamisuiteProductsConfig,
//   PaymentReservations (cobro).
//
// CHANGELOG
// v1.0.1 - DESCUENTO MANUAL DEL OPERADOR (regalar/descontar en la venta).
//          Los tres métodos aceptan `importeNeto` + `descripcionExtra`
//          opcionales (mismo contrato que recepcionProLogic.marcarPagadoReserva
//          v1.0.4: el widget manda el NETO ya calculado y el token
//          "🏷️ Descuento -X% (-Y€)"). Defensa final: `importeNeto` se
//          CLAMPA a [0 … precioBase] en backend (helper resolverImporteFinal).
//          El neto va a PaymentReservations.importeTotal (→ cierre) y a
//          `paidPrice` del registro emitido (→ Observatorio muestra el valor
//          real). `retailPrice` y `appliedDiscount` INTACTOS (bruto / % de
//          catálogo histórico). Con descuento 100% (neto 0) = "regalar":
//          ningún guard de precio lo bloquea (guardan el base, no el neto).
//          Sin `importeNeto` → comportamiento idéntico a v1.0.0.
// v1.0.0 - Versión inicial. emitirBonoManual (con candado PRIME),
//          emitirPrimeManual (con flag de club), emitirTarjetaManual.
// =====================================================

import { Permissions, webMethod } from 'wix-web-module';
import wixData from 'wix-data';
import { contacts } from 'wix-crm-backend';
import { elevate } from 'wix-auth';

const VERSION = '1.0.1';
const TAG = `[EspecialesVenta][${VERSION}]`;

const CMS_PRIME       = 'KamisuitePrimeMemberships';
const CMS_VOUCHERS    = 'KamisuiteVouchers';
const CMS_PROMOCARDS  = 'KamisuitePromoCards';
const CMS_CAMPAIGNS   = 'KamisuitePromoCampaigns';
const CMS_CATALOG     = 'ServiceCatalog';
const CMS_CONFIG      = 'KamisuiteProductsConfig';
const CMS_PAGOS       = 'PaymentReservations';

// Etiqueta de staff del cobro. El cierre la SUMA en el total financiero
// (Q2 no filtra por staff); la agenda y el rendimiento por reserva la
// ignoran (no hay reserva) → informe financiero SÍ, rendimiento NO.
const STAFF_ESPECIALES = 'ESPECIALES';

// Clave anti-duplicado del cobro en PaymentReservations.bookingId.
const PREFIJO_PAGO_ESP = 'ESP_';

// Flag de club en Wix Contacts que representa la membresía PRIME. Copiado
// literal de primePublicLogic (FIELD_CLUB_KALONICE, per-account). Si se
// quiere leer de SalonConfig en el futuro, cambiar SOLO aquí.
const FIELD_CLUB_KALONICE = 'club_kalonice';

const STATUS_PRIME_ACTIVA      = 'ACTIVA';
const STATUS_VOUCHER_ACTIVO    = 'ACTIVO';
const STATUS_PROMOCARD_EMITIDA = 'EMITIDA';

// =====================================================
// HELPERS
// =====================================================

// Genera un código único PREFIJO-XXXX-XXXX contra colisiones en su CMS.
// (Copia del patrón generarCodigoUnico de los tres backends públicos.)
async function generarCodigoUnico(prefijo, coleccion) {
  const intentos = 5;
  for (let i = 0; i < intentos; i++) {
    const p1 = Math.random().toString(36).substring(2, 6).toUpperCase();
    const p2 = Math.random().toString(36).substring(2, 6).toUpperCase();
    const code = `${prefijo}-${p1}-${p2}`;
    const exists = await wixData.query(coleccion)
      .eq('code', code)
      .limit(1)
      .find({ suppressAuth: true });
    if (exists.items.length === 0) return code;
    console.warn(`${TAG} ⚠️ Colisión de código ${code}, reintentando...`);
  }
  throw new Error('No se pudo generar un código único tras 5 intentos');
}

// Suma N meses (PRIME, y bono con validez en meses). Copia de
// primePublicLogic.calcularExpirationDate / voucherPublicLogic.
function sumarMeses(issueDate, meses) {
  const dt = new Date(issueDate.getTime());
  dt.setMonth(dt.getMonth() + (meses || 12));
  return dt;
}

// Suma N días naturales (bono con validez por servicio en días). Copia de
// voucherPublicLogic.calcularExpirationDateDias.
function sumarDias(issueDate, dias) {
  const dt = new Date(issueDate.getTime());
  dt.setDate(dt.getDate() + dias);
  return dt;
}

// PRIME activa del contacto o null. Copia literal de
// voucherPublicLogic.buscarPrimeActiva. Filtra status/expiración en JS
// (booleanos/fechas en .eq son frágiles en Wix Data — patrón del proyecto).
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
      if (m.status !== STATUS_PRIME_ACTIVA) return false;
      if (!m.expirationDate) return true;
      return new Date(m.expirationDate).getTime() >= now.getTime();
    });
    return activa || null;
  } catch (e) {
    console.error(`${TAG} ❌ buscarPrimeActiva:`, e.message);
    return null;
  }
}

// Bonos ACTIVOS del contacto (status ACTIVO + usos > 0 + no caducados).
// Copia de voucherPublicLogic.listarBonosActivosMiembro.
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
      if (v.status !== STATUS_VOUCHER_ACTIVO) return false;
      if (typeof v.remainingUses === 'number' && v.remainingUses <= 0) return false;
      if (v.expirationDate && new Date(v.expirationDate).getTime() < now.getTime()) return false;
      return true;
    });
  } catch (e) {
    console.error(`${TAG} ❌ listarBonosActivosMiembro:`, e.message);
    return [];
  }
}

// ¿Ya tiene un bono ACTIVO del mismo servicio (+variante)? Copia de
// voucherPublicLogic.tieneBonoActivoDelServicio (match por serviceSetupUid
// y serviceLabel si llega, para distinguir variantes).
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

// --- Helpers de variante (copia literal de voucherPublicLogic) ---
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

function _componerServiceLabel(servicioLabel, varianteLabel) {
  const base = String(servicioLabel || '').trim();
  const v = String(varianteLabel || '').trim();
  if (!v) return base;
  return `${base} · ${v}`.trim();
}

// Escribe extendedFields.club_kalonice en Wix Contacts del comprador.
// READ-MERGE-UPDATE con revision. NO bloquea la emisión si falla: se
// loguea warning. Copia literal de primePublicLogic.setClubKaloniceFlag.
async function setClubFlag(contactId, valor) {
  if (!contactId) {
    console.warn(`${TAG} ⚠️ setClubFlag: contactId vacío, salto`);
    return false;
  }
  try {
    const elevatedGet = elevate(contacts.getContact);
    const contact = await elevatedGet(contactId);
    if (!contact || !contact.revision) {
      console.warn(`${TAG} ⚠️ setClubFlag: contacto ${contactId} no encontrado o sin revision`);
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
    console.log(`${TAG} ✅ ${FIELD_CLUB_KALONICE}=${!!valor} aplicado en Wix Contacts ${contactId}`);
    return true;
  } catch (e) {
    console.warn(`${TAG} ⚠️ setClubFlag falló (no crítico):`, e.message);
    return false;
  }
}

// Registra el cobro de la venta en PaymentReservations con staff
// "ESPECIALES". Copia el shape de tiendaProductos.venderProductosDesdeAgenda.
// Anti-duplicado por bookingId = ESP_<recordId>. Devuelve el _id del pago
// (para enlazarlo como paymentReservationId en la fila del producto).
// `descripcion` debe llegar ya completa (con el importe en €), igual que
// la Tienda escribe "🛒 Producto (X€)".
async function registrarCobroEspecial({ recordId, contactId, clientName, descripcion, importe, metodoPago, desglosemetodopago }) {
  const claveCms = `${PREFIJO_PAGO_ESP}${recordId}`;
  try {
    const existente = await wixData.query(CMS_PAGOS)
      .eq('bookingId', claveCms)
      .limit(1)
      .find({ suppressAuth: true });
    if (existente.items.length > 0) {
      console.log(`${TAG} ⚠️ ${CMS_PAGOS} ya tiene registro para ${claveCms}, no se duplica`);
      return existente.items[0]._id;
    }

    const ahora = new Date();
    const registroPago = {
      bookingId: claveCms,
      fechaReserva: ahora,
      fechaPago: ahora,
      descripcion: descripcion,
      nombreCliente: String(clientName || '').trim(),
      importeTotal: Math.round((Number(importe) || 0) * 100) / 100,
      tipoPago: metodoPago || 'Efectivo',
      staff: STAFF_ESPECIALES,
      contactId: contactId || '',
      desglosemetodopago: desglosemetodopago || '',
      invoiceId: ''
    };

    const inserted = await wixData.insert(CMS_PAGOS, registroPago, { suppressAuth: true });
    console.log(`${TAG} ✅ Cobro registrado en ${CMS_PAGOS} [ESPECIALES]: "${descripcion}" | ${registroPago.tipoPago} | ${registroPago.importeTotal}€`);
    return inserted._id;
  } catch (e) {
    // No bloqueante: la fila CMS del producto ya se emitió. Se loguea para
    // reconciliar si hiciera falta.
    console.error(`${TAG} ❌ registrarCobroEspecial (no crítico):`, e.message);
    return '';
  }
}

// v1.0.1 — DESCUENTO MANUAL. El widget envía el NETO ya calculado (patrón de
// marcarPagadoReserva). Aquí NO se recomputa el descuento: solo se valida.
// DEFENSA FINAL del backend: si llega un importeNeto válido se clampa a
// [0 … base]; si no llega (o es inválido/negativo) se devuelve el base, con lo
// que el comportamiento es idéntico al de v1.0.0. Devuelve el importe a cobrar
// (que además se graba como paidPrice del registro).
function resolverImporteFinal(base, importeNeto) {
  const b = Math.round((Number(base) || 0) * 100) / 100;
  if (typeof importeNeto !== 'number' || !Number.isFinite(importeNeto) || importeNeto < 0) return b;
  return Math.min(b, Math.round(importeNeto * 100) / 100);
}

// v1.0.1 — Concatena el token de descuento ("🏷️ Descuento -X% (-Y€)") a la
// descripción del cobro, igual que hace el cobro normal, para que el Cierre lo
// recoja en su sección "Descuentos aplicados". Si no hay token, no cambia nada.
function componerDescripcion(descripcionBase, descripcionExtra) {
  const extra = String(descripcionExtra || '').trim();
  return extra ? `${descripcionBase} · ${extra}` : descripcionBase;
}

// =====================================================
// 1. EMITIR BONO A MANO  (con candado PRIME)
// =====================================================
// Replica el cómputo de precio/variante/validez de
// voucherPublicLogic.createVoucherCheckout, pero emite directo en ACTIVO
// (sin Wix Pay) y registra el cobro presencial.
//
// payload:
//   contactId          (obligatorio) — cliente al que se le vende
//   clientName         (obligatorio) — nombre a mostrar / en el cobro
//   serviceSetupUid    (obligatorio) — servicio del catálogo con bono
//   varianteIdx        (opcional)    — idx de variante si el servicio la tiene
//   metodoPago         (opcional)    — 'Efectivo'/'Tarjeta'/'Bizum'... (def. Efectivo)
//   desglosemetodopago (opcional)    — si el pago es partido
export const emitirBonoManual = webMethod(
  Permissions.SiteMember,
  async (payload) => {
    const {
      contactId,
      clientName,
      serviceSetupUid,
      varianteIdx,
      metodoPago,
      desglosemetodopago,
      importeNeto,          // v1.0.1 — neto ya calculado por el widget (opcional)
      descripcionExtra      // v1.0.1 — token "🏷️ Descuento -X% (-Y€)" (opcional)
    } = payload || {};

    try {
      const safeContactId = String(contactId || '').trim();
      const safeClientName = String(clientName || '').trim();
      console.log(`${TAG} 🎟️ emitirBonoManual | contacto=${safeContactId} | service=${serviceSetupUid} | varianteIdx=${varianteIdx == null ? 'null' : varianteIdx}`);

      if (!safeContactId) return { success: false, error: 'Falta el cliente (contactId)' };
      if (!serviceSetupUid) return { success: false, error: 'Falta identificador de servicio' };

      // ── CANDADO PRIME (regla de negocio): el cliente debe ser PRIME activo.
      const prime = await buscarPrimeActiva(safeContactId);
      if (!prime) {
        return {
          success: false,
          needsPrime: true,
          error: 'El cliente no es PRIME activo. No se puede vender un bono a quien no está en el listado PRIME.'
        };
      }

      // Cargar servicio del catálogo (por setupUid o _id).
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
      if (!servicio) return { success: false, error: 'Servicio no encontrado' };
      if (servicio.bonoActivo !== true) return { success: false, error: 'Este servicio no tiene bono activo' };

      const numero = (typeof servicio.bonoNumero === 'number') ? servicio.bonoNumero : 0;
      const descuento = (typeof servicio.bonoDescuento === 'number') ? servicio.bonoDescuento : 0;
      if (numero <= 0) return { success: false, error: 'Configuración del bono no válida' };

      // Precio y label según variante (o base).
      let precioServicio = 0;
      let serviceLabelFinal = servicio.label || '';

      const idxNum = (varianteIdx == null || varianteIdx === '') ? null : Number(varianteIdx);
      const hayIdx = idxNum != null && Number.isFinite(idxNum) && idxNum >= 0;

      if (servicio.hasVariants === true && hayIdx) {
        const varsArr = _leerItemsJson(servicio.variantes);
        if (!varsArr[idxNum]) return { success: false, error: 'Variante no encontrada en el servicio' };
        const vx = _extraerCamposVariante(varsArr[idxNum]);
        if (!vx.label || vx.price <= 0) return { success: false, error: 'Variante del servicio con precio no válido' };
        precioServicio = vx.price;
        serviceLabelFinal = _componerServiceLabel(servicio.label, vx.label);
      } else {
        precioServicio = (typeof servicio.price === 'number') ? servicio.price : 0;
      }

      if (precioServicio <= 0) return { success: false, error: 'Configuración del bono no válida' };
      const precioBruto = Math.round(precioServicio * numero * 100) / 100;
      const precioBono = Math.round(precioBruto * (1 - descuento / 100) * 100) / 100;
      if (precioBono <= 0) return { success: false, error: 'Precio del bono no válido' };

      // No acumular: bloquear si ya tiene un bono activo del mismo
      // servicio+variante (decisión C del flujo público).
      const serviceUid = servicio.setupUid || servicio._id;
      const yaTiene = await tieneBonoActivoDelServicio(safeContactId, serviceUid, serviceLabelFinal);
      if (yaTiene) {
        return {
          success: false,
          alreadyHasVoucher: true,
          error: `El cliente ya tiene un bono activo de "${serviceLabelFinal}". Cuando lo agote podrá comprar otro.`,
          voucher: {
            code: yaTiene.code || '',
            remainingUses: yaTiene.remainingUses,
            totalUses: yaTiene.totalUses,
            expirationDate: yaTiene.expirationDate || null
          }
        };
      }

      // Validez: por servicio en DÍAS si bonusValidityDays > 0; si no, meses
      // globales de config. Intervalo mínimo entre usos: snapshot congelado.
      const cfgResult = await wixData.query(CMS_CONFIG).limit(1).find({ suppressAuth: true });
      const validityMonths = (cfgResult.items.length > 0 && typeof cfgResult.items[0].voucherValidityMonths === 'number')
        ? cfgResult.items[0].voucherValidityMonths
        : 12;
      const validityDays = (typeof servicio.bonusValidityDays === 'number' && servicio.bonusValidityDays > 0)
        ? Math.floor(servicio.bonusValidityDays)
        : 0;
      const intervalDays = (typeof servicio.bonusUseIntervalDays === 'number' && servicio.bonusUseIntervalDays > 0)
        ? Math.floor(servicio.bonusUseIntervalDays)
        : 0;

      const code = await generarCodigoUnico('BN', CMS_VOUCHERS);
      const now = new Date();
      const expirationDate = (validityDays > 0) ? sumarDias(now, validityDays) : sumarMeses(now, validityMonths);

      // v1.0.1 — Descuento manual del operador: el importe realmente cobrado es
      // el neto (clampado). `paidPrice` refleja lo que el cliente pagó (→
      // Observatorio). `retailPrice` (bruto) y `appliedDiscount` (% de catálogo)
      // se mantienen como metadatos históricos, sin tocar.
      const importeFinal = resolverImporteFinal(precioBono, importeNeto);

      // Emitir la fila directamente en ACTIVO (sin PENDING/Wix Pay).
      const registro = {
        code,
        contactId: safeContactId,
        clientName: safeClientName,
        serviceSetupUid: serviceUid,
        serviceLabel: serviceLabelFinal,
        retailPrice: precioBruto,
        paidPrice: importeFinal,
        appliedDiscount: descuento,
        totalUses: numero,
        remainingUses: numero,
        issueDate: now,
        expirationDate: expirationDate,
        bonusUseIntervalDays: intervalDays,   // snapshot congelado (0 = LIBRE)
        paymentMethod: metodoPago || 'Efectivo',
        paymentId: '',
        paymentReservationId: '',
        primeMembershipId: prime._id,
        status: STATUS_VOUCHER_ACTIVO,
        salonId: ''
      };
      const inserted = await wixData.insert(CMS_VOUCHERS, registro, { suppressAuth: true });
      console.log(`${TAG} ✅ Bono ACTIVO emitido a mano: ${inserted._id} (code=${code}) | ${precioBono}€`);

      // Registrar el cobro presencial. La descripción base muestra el precio del
      // bono; si hubo descuento manual se concatena el token y el importe cobrado
      // es el neto (mismo criterio que el cobro normal).
      const descripcion = componerDescripcion(
        `🎟️ Bono · ${serviceLabelFinal} (${numero} usos) · ${precioBono}€`,
        descripcionExtra
      );
      const pagoId = await registrarCobroEspecial({
        recordId: inserted._id,
        contactId: safeContactId,
        clientName: safeClientName,
        descripcion,
        importe: importeFinal,
        metodoPago,
        desglosemetodopago
      });

      // Enlazar el pago con la fila del bono (trazabilidad).
      if (pagoId) {
        try {
          inserted.paymentReservationId = pagoId;
          await wixData.update(CMS_VOUCHERS, inserted, { suppressAuth: true });
        } catch (_) {}
      }

      return {
        success: true,
        tipo: 'bono',
        voucherId: inserted._id,
        code,
        serviceLabel: serviceLabelFinal,
        totalUses: numero,
        remainingUses: numero,
        precio: importeFinal,
        expirationDate: expirationDate,
        paymentReservationId: pagoId || ''
      };

    } catch (error) {
      console.error(`${TAG} ❌ emitirBonoManual:`, error);
      return { success: false, error: error.message };
    }
  }
);

// =====================================================
// 2. EMITIR PRIME A MANO
// =====================================================
// Replica primePublicLogic (precio y duración de config) emitiendo directo
// en ACTIVA (sin Wix Pay), aplica el flag de club en Wix Contacts y registra
// el cobro presencial.
//
// payload:
//   contactId          (obligatorio)
//   clientName         (obligatorio)
//   buyerEmail         (opcional)
//   buyerPhone         (opcional)
//   metodoPago         (opcional, def. Efectivo)
//   desglosemetodopago (opcional)
export const emitirPrimeManual = webMethod(
  Permissions.SiteMember,
  async (payload) => {
    const { contactId, clientName, buyerEmail, buyerPhone, metodoPago, desglosemetodopago,
      importeNeto, descripcionExtra } = payload || {};   // v1.0.1 — descuento manual (opcional)

    try {
      const safeContactId = String(contactId || '').trim();
      const safeClientName = String(clientName || '').trim();
      console.log(`${TAG} ⭐ emitirPrimeManual | contacto=${safeContactId}`);

      if (!safeContactId) return { success: false, error: 'Falta el cliente (contactId)' };
      if (!safeClientName) return { success: false, error: 'Falta el nombre del cliente' };

      // No re-vender PRIME a quien ya la tiene activa.
      const yaActiva = await buscarPrimeActiva(safeContactId);
      if (yaActiva) {
        return {
          success: false,
          alreadyActive: true,
          error: `El cliente ya tiene una tarjeta PRIME activa${yaActiva.expirationDate ? ` (vence ${new Date(yaActiva.expirationDate).toLocaleDateString('es-ES')})` : ''}.`,
          membership: { code: yaActiva.code || '', expirationDate: yaActiva.expirationDate || null }
        };
      }

      // Precio y duración desde config.
      const cfgResult = await wixData.query(CMS_CONFIG).limit(1).find({ suppressAuth: true });
      const cfg = (cfgResult.items || [])[0] || {};
      const annualPrice = (typeof cfg.primeAnnualPrice === 'number') ? cfg.primeAnnualPrice : 0;
      const durationMonths = (typeof cfg.primeDurationMonths === 'number') ? cfg.primeDurationMonths : 12;

      const code = await generarCodigoUnico('PR', CMS_PRIME);
      const now = new Date();
      const expirationDate = sumarMeses(now, durationMonths);

      // v1.0.1 — Descuento manual: paidPrice = neto realmente cobrado (clampado).
      const importeFinal = resolverImporteFinal(annualPrice, importeNeto);

      const registro = {
        code,
        contactId: safeContactId,
        buyerName: safeClientName,
        buyerEmail: String(buyerEmail || '').trim(),
        buyerPhone: String(buyerPhone || '').trim(),
        issueDate: now,
        expirationDate: expirationDate,
        paidPrice: importeFinal,
        paymentMethod: metodoPago || 'Efectivo',
        paymentId: '',
        paymentReservationId: '',
        status: STATUS_PRIME_ACTIVA,
        reminderSent: false,
        salonId: '',
        internalNotes: ''
      };
      const inserted = await wixData.insert(CMS_PRIME, registro, { suppressAuth: true });
      console.log(`${TAG} ✅ PRIME ACTIVA emitida a mano: ${inserted._id} (code=${code}) | ${annualPrice}€ | vence=${expirationDate.toISOString()}`);

      // Activar el flag de club en Wix Contacts (no bloqueante).
      await setClubFlag(safeContactId, true);

      // Registrar el cobro presencial (neto + token de descuento si lo hubo).
      const descripcion = componerDescripcion(
        `⭐ Tarjeta PRIME · ${safeClientName} · ${annualPrice}€`,
        descripcionExtra
      );
      const pagoId = await registrarCobroEspecial({
        recordId: inserted._id,
        contactId: safeContactId,
        clientName: safeClientName,
        descripcion,
        importe: importeFinal,
        metodoPago,
        desglosemetodopago
      });

      if (pagoId) {
        try {
          inserted.paymentReservationId = pagoId;
          await wixData.update(CMS_PRIME, inserted, { suppressAuth: true });
        } catch (_) {}
      }

      return {
        success: true,
        tipo: 'prime',
        membershipId: inserted._id,
        code,
        precio: importeFinal,
        expirationDate: expirationDate,
        paymentReservationId: pagoId || ''
      };

    } catch (error) {
      console.error(`${TAG} ❌ emitirPrimeManual:`, error);
      return { success: false, error: error.message };
    }
  }
);

// =====================================================
// 3. EMITIR TARJETA PROMOCIONAL A MANO
// =====================================================
// Replica bonosPromosPublicLogic (precio de la campaña) emitiendo directo
// en EMITIDA (sin Wix Pay) y registra el cobro presencial. Soporta regalo.
//
// payload:
//   contactId          (obligatorio) — comprador
//   clientName         (obligatorio) — nombre del comprador / en el cobro
//   campaignId         (obligatorio) — _id de KamisuitePromoCampaigns
//   buyerEmail         (opcional)
//   buyerPhone         (opcional)
//   isGift             (opcional)    — true si es regalo
//   recipientName      (obligatorio si isGift)
//   recipientEmail     (obligatorio si isGift)
//   recipientMessage   (opcional)
//   metodoPago         (opcional, def. Efectivo)
//   desglosemetodopago (opcional)
export const emitirTarjetaManual = webMethod(
  Permissions.SiteMember,
  async (payload) => {
    const {
      contactId, clientName, campaignId,
      buyerEmail, buyerPhone,
      isGift, recipientName, recipientEmail, recipientMessage,
      metodoPago, desglosemetodopago,
      importeNeto, descripcionExtra   // v1.0.1 — descuento manual (opcional)
    } = payload || {};

    try {
      const safeContactId = String(contactId || '').trim();
      const safeClientName = String(clientName || '').trim();
      console.log(`${TAG} 🎁 emitirTarjetaManual | contacto=${safeContactId} | campaign=${campaignId} | isGift=${!!isGift}`);

      if (!safeContactId) return { success: false, error: 'Falta el cliente (contactId)' };
      if (!campaignId) return { success: false, error: 'Falta la campaña de la tarjeta' };

      // Cargar campaña.
      let campaign;
      try {
        campaign = await wixData.get(CMS_CAMPAIGNS, campaignId, { suppressAuth: true });
      } catch (_) { campaign = null; }
      if (!campaign) return { success: false, error: 'Campaña promocional no encontrada' };

      const promoPrice = (typeof campaign.promoPrice === 'number') ? campaign.promoPrice : 0;
      if (promoPrice <= 0) return { success: false, error: 'El precio promocional de la campaña no es válido' };

      // Regalo: destinatario obligatorio.
      const esRegalo = isGift === true;
      let recipientNameClean = '';
      let recipientEmailClean = '';
      let recipientMessageClean = '';
      if (esRegalo) {
        recipientNameClean = String(recipientName || '').trim();
        recipientEmailClean = String(recipientEmail || '').trim();
        recipientMessageClean = String(recipientMessage || '').trim();
        if (!recipientNameClean || !recipientEmailClean) {
          return { success: false, error: 'Para un regalo faltan los datos del destinatario (nombre y email)' };
        }
      }

      const code = await generarCodigoUnico('KP', CMS_PROMOCARDS);
      const now = new Date();
      const expirationDate = campaign.endDate ? new Date(campaign.endDate) : null;

      // v1.0.1 — Descuento manual: paidPrice = neto realmente cobrado (clampado).
      // retailPrice (precio de mercado de la campaña) se mantiene intacto.
      const importeFinal = resolverImporteFinal(promoPrice, importeNeto);

      const registro = {
        code,
        promoTypeId: campaign._id,
        serviceSetupUid: campaign.serviceSetupUid || '',
        serviceLabel: campaign.serviceLabel || '',
        retailPrice: (typeof campaign.retailPrice === 'number') ? campaign.retailPrice : 0,
        paidPrice: importeFinal,
        buyerName: safeClientName,
        buyerEmail: String(buyerEmail || '').trim(),
        buyerPhone: String(buyerPhone || '').trim(),
        buyerContactId: safeContactId,
        recipientName: recipientNameClean,
        recipientEmail: recipientEmailClean,
        recipientMessage: recipientMessageClean,
        isGift: esRegalo,
        issueDate: now,
        expirationDate: expirationDate,
        paymentId: '',
        paymentReservationId: '',
        paymentMethod: metodoPago || 'Efectivo',
        status: STATUS_PROMOCARD_EMITIDA,
        salonId: ''
      };
      const inserted = await wixData.insert(CMS_PROMOCARDS, registro, { suppressAuth: true });
      console.log(`${TAG} ✅ Tarjeta EMITIDA a mano: ${inserted._id} (code=${code}) | ${promoPrice}€`);

      // Registrar el cobro presencial (neto + token de descuento si lo hubo).
      const etiqueta = campaign.serviceLabel || campaign.name || 'Tarjeta';
      const descripcion = componerDescripcion(
        `🎁 Tarjeta · ${etiqueta}${esRegalo ? ' (regalo)' : ''} · ${promoPrice}€`,
        descripcionExtra
      );
      const pagoId = await registrarCobroEspecial({
        recordId: inserted._id,
        contactId: safeContactId,
        clientName: safeClientName,
        descripcion,
        importe: importeFinal,
        metodoPago,
        desglosemetodopago
      });

      if (pagoId) {
        try {
          inserted.paymentReservationId = pagoId;
          await wixData.update(CMS_PROMOCARDS, inserted, { suppressAuth: true });
        } catch (_) {}
      }

      return {
        success: true,
        tipo: 'tarjeta',
        promoCardId: inserted._id,
        code,
        serviceLabel: campaign.serviceLabel || '',
        precio: importeFinal,
        isGift: esRegalo,
        expirationDate: expirationDate,
        paymentReservationId: pagoId || ''
      };

    } catch (error) {
      console.error(`${TAG} ❌ emitirTarjetaManual:`, error);
      return { success: false, error: error.message };
    }
  }
);
