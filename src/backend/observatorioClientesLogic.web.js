// =====================================================
// KAMISUITE — Backend: Observatorio Clientes (uso interno)
// =====================================================
// VERSION: 1.1.0
// FECHA:   23 de julio de 2026
// ARCHIVO: backend/observatorioClientesLogic.web.js
//
// CHANGELOG
//   v1.1.0 (23-Jul-2026) — Añadido getObservatorioGlobal.
//     · NUEVO getObservatorioGlobal: retorna el flujo comercial
//       AGREGADO del salón (no por cliente). PRIME, Bonos, Tarjetas
//       y Regalos con todos sus estados, reservas próximas del salón,
//       cupones activos, KPIs macro. Cada evento lleva contactId +
//       nombre del cliente asociado para pintar la fila con contexto
//       de cliente sin lookups adicionales.
//     · getObservatorioBootstrap se mantiene por compatibilidad (para
//       la búsqueda puntual por cliente).
//     · getDetalleCliente sigue siendo el drill-down desde un evento.
//     · updateContactoObservatorio sin cambios.
//
//   v1.0.0 (23-Jul-2026) — Versión inicial (enfoque por cliente).
//
// PROPÓSITO
//   Observatorio de eventos comerciales del salón. Vista principal es
//   AGREGADA por tipo de producto (PRIME emitidas, bonos vigentes,
//   tarjetas regalo vendidas, cupones activos, reservas próximas).
//   El cliente es CONTEXTO del evento, no el eje.
//
// FIELD IDs VERIFICADOS EN PRODUCCIÓN
//   (Ver v1.0.0 header para detalle completo)
//   - KamisuitePromoCards usa buyerContactId (NO contactId) — trampa
//     documentada. Aplica igual en la vista global.
// =====================================================

import { Permissions, webMethod } from 'wix-web-module';
import wixData from 'wix-data';
import { contacts } from 'wix-crm-backend';
import { elevate } from 'wix-auth';

import { cargarTodosContactos } from 'backend/recepcionLogic.web';
import { listarCupones } from 'backend/couponsLogic.web';

const VERSION = '1.1.0';
const TAG = `[ObservatorioClientes][${VERSION}]`;

const CMS_RESERVAS   = 'KamisuiteReservations';
const CMS_PRIME      = 'KamisuitePrimeMemberships';
const CMS_VOUCHERS   = 'KamisuiteVouchers';
const CMS_PROMOCARDS = 'KamisuitePromoCards';
const CMS_PRODCONFIG = 'KamisuiteProductsConfig';
const CMS_SALON      = 'SalonConfig';

const FIELD_SEXO   = 'custom.sexo';
const FIELD_VAT_ID = 'invoices.vatId';

const DIAS_PROXIMAS = 60;
const LIMIT_HISTORICO = 200;
const LIMIT_RESERVAS  = 200;

// Límite defensivo para las queries globales. Un salón activo tiene
// típicamente ~50-200 PRIMEs/bonos/tarjetas emitidos al año. Con 500
// por colección cubrimos ~2 años de histórico sin saturar el widget.
const LIMIT_GLOBAL = 500;

// =====================================================
// HELPERS
// =====================================================

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function safeErr(e) {
  return { message: e?.message || String(e) };
}

function isGuid(s) {
  return typeof s === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

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

function toYmd(v) {
  if (!v) return '';
  try {
    if (typeof v === 'string') {
      const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (m) return `${m[1]}-${m[2]}-${m[3]}`;
      const d = new Date(v);
      if (isNaN(d.getTime())) return '';
      return d.toISOString().slice(0, 10);
    }
    if (v instanceof Date && !isNaN(v.getTime())) {
      return v.toISOString().slice(0, 10);
    }
  } catch (_) {}
  return '';
}

function epoch(v) {
  if (!v) return NaN;
  try {
    const d = (v instanceof Date) ? v : new Date(v);
    return isNaN(d.getTime()) ? NaN : d.getTime();
  } catch (_) { return NaN; }
}

// =====================================================
// SHAPES
// =====================================================

function shapeContacto(contact) {
  const info = contact?.info || {};
  const name = info.name || {};
  const ef = info.extendedFields || {};
  const email = (info.emails?.[0]?.email) || '';
  const phone = (info.phones?.[0]?.phone) || '';
  const foto = info.picture?.image || info.photoUrl || '';

  const nombre = name.first || '';
  const apellido = name.last || '';
  const nombreCompleto = [nombre, apellido].filter(Boolean).join(' ').trim();

  return {
    contactId: contact._id || '',
    nombre,
    apellido,
    nombreCompleto,
    email,
    telefono: phone,
    foto: wixImageToPublicUrl(foto) || '',
    sexo: ef[FIELD_SEXO] || '',
    dni: ef[FIELD_VAT_ID] || '',
    fechaNacimiento: toYmd(info.birthdate)
  };
}

function shapeReservaProxima(it) {
  return {
    _id: it._id || '',
    contactId: it.contactId || '',
    title: it.title || '',
    family: it.family || '',
    fechaReserva: it.fechaReserva || null,
    duracionTotal: toNum(it.duracionTotal),
    precioTotal: toNum(it.precioTotal),
    staffId: it.staffId || '',
    staffName: it.staffName || '',
    status: it.status || '',
    origenRecepcion: it.origenRecepcion === true,
    notes: it.notes || ''
  };
}

function shapePrime(it) {
  return {
    _id: it._id || '',
    contactId: it.contactId || '',
    code: it.code || '',
    status: it.status || '',
    issueDate: it.issueDate || null,
    expirationDate: it.expirationDate || null,
    paidPrice: toNum(it.paidPrice),
    paymentMethod: it.paymentMethod || '',
    buyerName: it.buyerName || '',
    buyerEmail: it.buyerEmail || '',
    buyerPhone: it.buyerPhone || '',
    membershipImage: wixImageToPublicUrl(it.membershipImage) || '',
    internalNotes: it.internalNotes || '',
    reminderSent: it.reminderSent === true
  };
}

function shapeVoucher(it) {
  return {
    _id: it._id || '',
    contactId: it.contactId || '',
    code: it.code || '',
    status: it.status || '',
    serviceSetupUid: it.serviceSetupUid || '',
    serviceLabel: it.serviceLabel || '',
    remainingUses: toNum(it.remainingUses),
    totalUses: toNum(it.totalUses),
    retailPrice: toNum(it.retailPrice),
    paidPrice: toNum(it.paidPrice),
    appliedDiscount: toNum(it.appliedDiscount),
    issueDate: it.issueDate || null,
    expirationDate: it.expirationDate || null,
    voucherImage: wixImageToPublicUrl(it.voucherImage) || '',
    primeMembershipId: it.primeMembershipId || ''
  };
}

function shapePromoCard(it) {
  return {
    _id: it._id || '',
    buyerContactId: it.buyerContactId || '',
    code: it.code || '',
    status: it.status || '',
    promoTypeId: it.promoTypeId || '',
    serviceSetupUid: it.serviceSetupUid || '',
    serviceLabel: it.serviceLabel || '',
    retailPrice: toNum(it.retailPrice),
    paidPrice: toNum(it.paidPrice),
    buyerName: it.buyerName || '',
    buyerEmail: it.buyerEmail || '',
    buyerPhone: it.buyerPhone || '',
    recipientName: it.recipientName || '',
    recipientEmail: it.recipientEmail || '',
    recipientMessage: it.recipientMessage || '',
    isGift: it.isGift === true,
    issueDate: it.issueDate || null,
    expirationDate: it.expirationDate || null,
    promoCardImage: wixImageToPublicUrl(it.promoCardImage) || '',
    redeemedInReservationId: it.redeemedInReservationId || '',
    redeemedByContactId: it.redeemedByContactId || '',
    redeemDate: it.redeemDate || null
  };
}

// Añade _clienteNombre y _clienteEmail al evento, resolviendo contra
// el mapa de contactos precomputado. contactIdField es el nombre del
// campo (`contactId` o `buyerContactId`).
function enriquecerConCliente(items, mapaContactos, contactIdField) {
  for (const it of items) {
    const cid = it[contactIdField] || '';
    const c = cid ? mapaContactos.get(cid) : null;
    it._clienteNombre = c ? c.nombreCompleto : (it.buyerName || '');
    it._clienteEmail = c ? c.email : (it.buyerEmail || '');
    it._clienteTelefono = c ? c.telefono : (it.buyerPhone || '');
  }
  return items;
}

// =====================================================
// KPIs (por cliente — sin cambios v1.0.0)
// =====================================================

function calcularKpis({ primeVigente, bonosVigentes, tarjetasVigentes }) {
  let totalPagado = 0;
  let count = 0;
  let proxVencMs = null;

  if (primeVigente) {
    totalPagado += toNum(primeVigente.paidPrice);
    count += 1;
    const ms = epoch(primeVigente.expirationDate);
    if (!isNaN(ms) && (proxVencMs === null || ms < proxVencMs)) proxVencMs = ms;
  }
  for (const v of (bonosVigentes || [])) {
    totalPagado += toNum(v.paidPrice);
    count += 1;
    if (v.expirationDate) {
      const ms = epoch(v.expirationDate);
      if (!isNaN(ms) && (proxVencMs === null || ms < proxVencMs)) proxVencMs = ms;
    }
  }
  for (const t of (tarjetasVigentes || [])) {
    totalPagado += toNum(t.paidPrice);
    count += 1;
    if (t.expirationDate) {
      const ms = epoch(t.expirationDate);
      if (!isNaN(ms) && (proxVencMs === null || ms < proxVencMs)) proxVencMs = ms;
    }
  }

  return {
    totalPagadoVigentes: Math.round(totalPagado * 100) / 100,
    productosVigentesCount: count,
    proximoVencimiento: proxVencMs !== null ? new Date(proxVencMs).toISOString() : null
  };
}

// =====================================================
// NUEVO — getObservatorioGlobal — VISTA COMERCIAL DEL SALÓN
// =====================================================
// Retorna todo el flujo comercial AGREGADO del salón: PRIME, Bonos,
// Tarjetas y Regalos con TODOS sus estados, reservas próximas del salón,
// cupones activos, KPIs macro. Cada evento lleva el nombre del cliente
// asociado para pintar la fila con contexto.
//
// Payload:
//   { ok, version, salonConfig,
//     kpisSalon: { valorEmitidoVigente, valorPendienteCanje,
//                  primeActivasCount, itemsCaducan30d,
//                  itemsCaducan90d },
//     prime:    { activas[], vencidas[], canceladas[], pendientes[] },
//     bonos:    { activos[], agotados[], caducados[], cancelados[],
//                 pendientes[] },
//     tarjetas: { emitidas[], canjeadas[], caducadas[], canceladas[],
//                 pendientes[] },
//     regalos:  { emitidas[], canjeadas[], caducadas[], canceladas[],
//                 pendientes[] },
//     reservasProximas[],
//     cupones[],
//     contactos[],
//     warnings[] }
//
// Cada evento AÑADE:
//   _clienteNombre, _clienteEmail, _clienteTelefono
// resueltos con el mapa de contactos cargado.
export const getObservatorioGlobal = webMethod(
  Permissions.SiteMember,
  async () => {
    const t0 = Date.now();
    try {
      const ahora = new Date();
      const ahoraMs = ahora.getTime();
      const limiteReservas = new Date(ahoraMs + DIAS_PROXIMAS * 86400000);
      const en30d = ahoraMs + 30 * 86400000;
      const en90d = ahoraMs + 90 * 86400000;

      // 8 cargas en paralelo. Todo con Promise.allSettled: si una falla,
      // seguimos y avisamos.
      const [
        rConfig, rProdCfg,
        rContactos, rCupones,
        rReservas, rPrime, rBonos, rTarjetas
      ] = await Promise.allSettled([
        wixData.query(CMS_SALON).limit(1).find({ suppressAuth: true }),
        wixData.query(CMS_PRODCONFIG).limit(1).find({ suppressAuth: true }),
        cargarTodosContactos(),
        listarCupones({ limit: 200 }),

        wixData.query(CMS_RESERVAS)
          .ge('fechaReserva', ahora)
          .le('fechaReserva', limiteReservas)
          .ne('status', 'CANCELADA')
          .ascending('fechaReserva')
          .limit(LIMIT_RESERVAS)
          .find({ suppressAuth: true }),
        wixData.query(CMS_PRIME)
          .descending('_createdDate')
          .limit(LIMIT_GLOBAL)
          .find({ suppressAuth: true }),
        wixData.query(CMS_VOUCHERS)
          .descending('_createdDate')
          .limit(LIMIT_GLOBAL)
          .find({ suppressAuth: true }),
        wixData.query(CMS_PROMOCARDS)
          .descending('_createdDate')
          .limit(LIMIT_GLOBAL)
          .find({ suppressAuth: true })
      ]);

      const warnings = [];

      // ── SalonConfig ──
      let salonConfig = {
        brandName: '', phone: '', address: '',
        widgetSkin: 'niebla', promotionsPageSlug: '', siteUrl: '',
        primeImage: ''
      };
      if (rConfig.status === 'fulfilled') {
        const c = (rConfig.value.items || [])[0] || {};
        salonConfig.brandName = c.brandName || '';
        salonConfig.phone = c.phone || '';
        salonConfig.address = c.address || '';
        salonConfig.widgetSkin = c.widgetSkin || 'niebla';
        salonConfig.promotionsPageSlug = c.promotionsPageSlug || '';
        salonConfig.siteUrl = c.siteUrl || '';
      } else {
        warnings.push('salonConfig:' + (rConfig.reason?.message || 'error'));
      }
      if (rProdCfg.status === 'fulfilled') {
        const c = (rProdCfg.value.items || [])[0] || {};
        salonConfig.primeImage = wixImageToPublicUrl(c.primeImage) || '';
      }

      // ── Contactos y mapa para enriquecimiento ──
      let contactos = [];
      if (rContactos.status === 'fulfilled') {
        const rc = rContactos.value;
        if (rc && rc.ok && Array.isArray(rc.clientes)) contactos = rc.clientes;
        else if (rc && !rc.ok) warnings.push('contactos:' + (rc.error?.message || 'error'));
      } else {
        warnings.push('contactos:' + (rContactos.reason?.message || 'error'));
      }
      const mapaContactos = new Map();
      for (const c of contactos) mapaContactos.set(c.contactId, c);

      // ── Cupones ──
      let cupones = [];
      if (rCupones.status === 'fulfilled') {
        const rk = rCupones.value;
        if (rk && rk.success && Array.isArray(rk.cupones)) cupones = rk.cupones;
        else if (rk && !rk.success) warnings.push('cupones:' + (rk.error || 'error'));
      } else {
        warnings.push('cupones:' + (rCupones.reason?.message || 'error'));
      }

      // ── Reservas próximas 60d ──
      let reservasProximas = [];
      if (rReservas.status === 'fulfilled') {
        reservasProximas = (rReservas.value.items || []).map(shapeReservaProxima);
        enriquecerConCliente(reservasProximas, mapaContactos, 'contactId');
      } else {
        warnings.push('reservas:' + (rReservas.reason?.message || 'error'));
      }

      // ── PRIME (clasificación por estado + vigencia) ──
      const primeAll = (rPrime.status === 'fulfilled')
        ? (rPrime.value.items || []).map(shapePrime)
        : [];
      if (rPrime.status !== 'fulfilled') {
        warnings.push('prime:' + (rPrime.reason?.message || 'error'));
      }
      enriquecerConCliente(primeAll, mapaContactos, 'contactId');
      const primeActivas = [];
      const primeVencidas = [];
      const primeCanceladas = [];
      const primePendientes = [];
      for (const p of primeAll) {
        const expMs = epoch(p.expirationDate);
        const caducada = !isNaN(expMs) && expMs < ahoraMs;
        if (p.status === 'PENDING') { primePendientes.push(p); continue; }
        if (p.status === 'CANCELADA') { primeCanceladas.push(p); continue; }
        if (p.status === 'VENCIDA' || (p.status === 'ACTIVA' && caducada)) {
          primeVencidas.push(p); continue;
        }
        if (p.status === 'ACTIVA' && !caducada) {
          primeActivas.push(p); continue;
        }
        primeVencidas.push(p);   // fallback defensivo
      }
      // Activas ordenadas por vencimiento ASC (las que caducan antes, primero)
      primeActivas.sort((a, b) => (epoch(a.expirationDate) || Infinity) - (epoch(b.expirationDate) || Infinity));

      // ── Bonos (KamisuiteVouchers) ──
      const bonosAll = (rBonos.status === 'fulfilled')
        ? (rBonos.value.items || []).map(shapeVoucher)
        : [];
      if (rBonos.status !== 'fulfilled') {
        warnings.push('bonos:' + (rBonos.reason?.message || 'error'));
      }
      enriquecerConCliente(bonosAll, mapaContactos, 'contactId');
      const bonosActivos = [];
      const bonosAgotados = [];
      const bonosCaducados = [];
      const bonosCancelados = [];
      const bonosPendientes = [];
      for (const v of bonosAll) {
        if (v.status === 'PENDING') { bonosPendientes.push(v); continue; }
        if (v.status === 'CANCELADO') { bonosCancelados.push(v); continue; }
        const expMs = epoch(v.expirationDate);
        const caducado = !isNaN(expMs) && expMs < ahoraMs;
        if (v.status === 'CADUCADO' || caducado) {
          bonosCaducados.push(v); continue;
        }
        if (v.status === 'AGOTADO' || v.remainingUses <= 0) {
          bonosAgotados.push(v); continue;
        }
        if (v.status === 'ACTIVO' && v.remainingUses > 0) {
          bonosActivos.push(v); continue;
        }
        bonosAgotados.push(v);   // fallback
      }
      bonosActivos.sort((a, b) => (epoch(a.expirationDate) || Infinity) - (epoch(b.expirationDate) || Infinity));

      // ── Tarjetas + Regalos (KamisuitePromoCards; separadas por isGift) ──
      const promoAll = (rTarjetas.status === 'fulfilled')
        ? (rTarjetas.value.items || []).map(shapePromoCard)
        : [];
      if (rTarjetas.status !== 'fulfilled') {
        warnings.push('tarjetas:' + (rTarjetas.reason?.message || 'error'));
      }
      enriquecerConCliente(promoAll, mapaContactos, 'buyerContactId');

      const tarEmitidas = [];
      const tarCanjeadas = [];
      const tarCaducadas = [];
      const tarCanceladas = [];
      const tarPendientes = [];

      const regEmitidas = [];
      const regCanjeadas = [];
      const regCaducadas = [];
      const regCanceladas = [];
      const regPendientes = [];

      for (const t of promoAll) {
        const bucket = t.isGift
          ? { em: regEmitidas, cj: regCanjeadas, cd: regCaducadas, cn: regCanceladas, pd: regPendientes }
          : { em: tarEmitidas, cj: tarCanjeadas, cd: tarCaducadas, cn: tarCanceladas, pd: tarPendientes };

        if (t.status === 'PENDING') { bucket.pd.push(t); continue; }
        if (t.status === 'CANCELADA') { bucket.cn.push(t); continue; }
        if (t.status === 'CANJEADA') { bucket.cj.push(t); continue; }
        const expMs = epoch(t.expirationDate);
        const caducada = !isNaN(expMs) && expMs < ahoraMs;
        if (t.status === 'CADUCADA' || caducada) {
          bucket.cd.push(t); continue;
        }
        if (t.status === 'EMITIDA' && !caducada) {
          bucket.em.push(t); continue;
        }
        bucket.cd.push(t);   // fallback
      }
      tarEmitidas.sort((a, b) => (epoch(a.expirationDate) || Infinity) - (epoch(b.expirationDate) || Infinity));
      regEmitidas.sort((a, b) => (epoch(a.expirationDate) || Infinity) - (epoch(b.expirationDate) || Infinity));

      // ── KPIs macro del salón ──
      // valorEmitidoVigente: suma paidPrice de PRIME activas + bonos activos +
      //                     tarjetas emitidas + regalos emitidos.
      // valorPendienteCanje: valor de bonos activos con remainingUses>0 +
      //                     tarjetas y regalos emitidos NO canjeados. Es lo
      //                     que el salón "debe" al mercado en servicios.
      // primeActivasCount: activas ahora.
      // itemsCaducan30d: total de PRIME+bonos+tarjetas+regalos con
      //                  expirationDate en próximos 30 días.
      // itemsCaducan90d: idem 90 días.
      let valorEmitidoVigente = 0;
      let valorPendienteCanje = 0;
      let itemsCaducan30d = 0;
      let itemsCaducan90d = 0;

      const contarVencimiento = (expDate) => {
        const ms = epoch(expDate);
        if (isNaN(ms) || ms < ahoraMs) return;
        if (ms <= en30d) itemsCaducan30d++;
        if (ms <= en90d) itemsCaducan90d++;
      };

      for (const p of primeActivas) {
        valorEmitidoVigente += toNum(p.paidPrice);
        // PRIME no es "canjeable como servicio" — su valor no cuenta como
        // deuda pendiente de canje (es una membresía, no un servicio prepago).
        contarVencimiento(p.expirationDate);
      }
      for (const v of bonosActivos) {
        valorEmitidoVigente += toNum(v.paidPrice);
        // Bonos: proporción del pagado × usos restantes / totales.
        // Aproximación razonable del valor no canjeado.
        const totales = toNum(v.totalUses) || 1;
        const rest = toNum(v.remainingUses);
        valorPendienteCanje += toNum(v.paidPrice) * (rest / totales);
        contarVencimiento(v.expirationDate);
      }
      for (const t of tarEmitidas) {
        valorEmitidoVigente += toNum(t.paidPrice);
        valorPendienteCanje += toNum(t.paidPrice);
        contarVencimiento(t.expirationDate);
      }
      for (const g of regEmitidas) {
        valorEmitidoVigente += toNum(g.paidPrice);
        valorPendienteCanje += toNum(g.paidPrice);
        contarVencimiento(g.expirationDate);
      }

      const kpisSalon = {
        valorEmitidoVigente: Math.round(valorEmitidoVigente * 100) / 100,
        valorPendienteCanje: Math.round(valorPendienteCanje * 100) / 100,
        primeActivasCount: primeActivas.length,
        bonosActivosCount: bonosActivos.length,
        tarjetasEmitidasCount: tarEmitidas.length,
        regalosEmitidosCount: regEmitidas.length,
        itemsCaducan30d,
        itemsCaducan90d,
        reservasProximasCount: reservasProximas.length,
        cuponesActivosCount: cupones.filter(c => c.active !== false && (
          !c.expirationTime || epoch(c.expirationTime) >= ahoraMs
        )).length
      };

      const dt = ((Date.now() - t0) / 1000).toFixed(2);
      console.log(`${TAG} ✅ getObservatorioGlobal: ` +
        `PRIME(act/venc/canc/pend)=${primeActivas.length}/${primeVencidas.length}/${primeCanceladas.length}/${primePendientes.length} ` +
        `Bonos(act/ago/cad/canc)=${bonosActivos.length}/${bonosAgotados.length}/${bonosCaducados.length}/${bonosCancelados.length} ` +
        `Tarj(em/cj/cad/canc)=${tarEmitidas.length}/${tarCanjeadas.length}/${tarCaducadas.length}/${tarCanceladas.length} ` +
        `Reg(em/cj/cad/canc)=${regEmitidas.length}/${regCanjeadas.length}/${regCaducadas.length}/${regCanceladas.length} ` +
        `Reservas=${reservasProximas.length} Cupones=${cupones.length}. ${dt}s ` +
        `${warnings.length ? '⚠️ ' + warnings.join(' | ') : ''}`);

      return {
        ok: true,
        version: VERSION,
        salonConfig,
        kpisSalon,
        prime:    { activas: primeActivas, vencidas: primeVencidas, canceladas: primeCanceladas, pendientes: primePendientes },
        bonos:    { activos: bonosActivos, agotados: bonosAgotados, caducados: bonosCaducados, cancelados: bonosCancelados, pendientes: bonosPendientes },
        tarjetas: { emitidas: tarEmitidas, canjeadas: tarCanjeadas, caducadas: tarCaducadas, canceladas: tarCanceladas, pendientes: tarPendientes },
        regalos:  { emitidas: regEmitidas, canjeadas: regCanjeadas, caducadas: regCaducadas, canceladas: regCanceladas, pendientes: regPendientes },
        reservasProximas,
        cupones,
        contactos,
        warnings
      };

    } catch (e) {
      console.error(`${TAG} ❌ getObservatorioGlobal:`, e.message);
      return {
        ok: false,
        version: VERSION,
        error: safeErr(e)
      };
    }
  }
);

// =====================================================
// getObservatorioBootstrap — MANTENIDO (compatibilidad v1.0.0)
// =====================================================
export const getObservatorioBootstrap = webMethod(
  Permissions.SiteMember,
  async () => {
    const t0 = Date.now();
    try {
      const [rConfig, rProdCfg, rContactos, rCupones] = await Promise.allSettled([
        wixData.query(CMS_SALON).limit(1).find({ suppressAuth: true }),
        wixData.query(CMS_PRODCONFIG).limit(1).find({ suppressAuth: true }),
        cargarTodosContactos(),
        listarCupones({ limit: 200 })
      ]);

      const warnings = [];
      let salonConfig = {
        brandName: '', phone: '', address: '', widgetSkin: 'niebla',
        promotionsPageSlug: '', siteUrl: '', primeImage: ''
      };
      if (rConfig.status === 'fulfilled') {
        const c = (rConfig.value.items || [])[0] || {};
        salonConfig.brandName = c.brandName || '';
        salonConfig.phone = c.phone || '';
        salonConfig.address = c.address || '';
        salonConfig.widgetSkin = c.widgetSkin || 'niebla';
        salonConfig.promotionsPageSlug = c.promotionsPageSlug || '';
        salonConfig.siteUrl = c.siteUrl || '';
      } else {
        warnings.push('salonConfig:' + (rConfig.reason?.message || 'error'));
      }
      if (rProdCfg.status === 'fulfilled') {
        const c = (rProdCfg.value.items || [])[0] || {};
        salonConfig.primeImage = wixImageToPublicUrl(c.primeImage) || '';
      }

      let contactos = [];
      if (rContactos.status === 'fulfilled') {
        const rc = rContactos.value;
        if (rc && rc.ok && Array.isArray(rc.clientes)) contactos = rc.clientes;
        else if (rc && !rc.ok) warnings.push('contactos:' + (rc.error?.message || 'error'));
      } else {
        warnings.push('contactos:' + (rContactos.reason?.message || 'error'));
      }

      let cupones = [];
      if (rCupones.status === 'fulfilled') {
        const rk = rCupones.value;
        if (rk && rk.success && Array.isArray(rk.cupones)) cupones = rk.cupones;
        else if (rk && !rk.success) warnings.push('cupones:' + (rk.error || 'error'));
      } else {
        warnings.push('cupones:' + (rCupones.reason?.message || 'error'));
      }

      const dt = ((Date.now() - t0) / 1000).toFixed(2);
      console.log(`${TAG} ✅ getObservatorioBootstrap: ${contactos.length} contactos, ${cupones.length} cupones. ${dt}s`);

      return { ok: true, version: VERSION, salonConfig, contactos, cupones, warnings };
    } catch (e) {
      console.error(`${TAG} ❌ getObservatorioBootstrap:`, e.message);
      return {
        ok: false, version: VERSION, error: safeErr(e),
        salonConfig: { brandName: '', phone: '', address: '', widgetSkin: 'niebla', promotionsPageSlug: '', siteUrl: '', primeImage: '' },
        contactos: [], cupones: [], warnings: []
      };
    }
  }
);

// =====================================================
// getDetalleCliente — MANTENIDO (drill-down desde un evento)
// =====================================================
export const getDetalleCliente = webMethod(
  Permissions.SiteMember,
  async ({ contactId } = {}) => {
    const t0 = Date.now();
    const safeCid = String(contactId || '').trim();

    if (!safeCid || !isGuid(safeCid)) {
      return { ok: false, version: VERSION, error: { message: 'contactId inválido o ausente' } };
    }

    try {
      const ahora = new Date();
      const ahoraMs = ahora.getTime();
      const limiteReservas = new Date(ahoraMs + DIAS_PROXIMAS * 86400000);

      const elevatedGet = elevate(contacts.getContact);

      const [rContact, rReservas, rPrime, rBonos, rTarjetas] = await Promise.allSettled([
        elevatedGet(safeCid),
        wixData.query(CMS_RESERVAS)
          .eq('contactId', safeCid)
          .ge('fechaReserva', ahora)
          .le('fechaReserva', limiteReservas)
          .ne('status', 'CANCELADA')
          .ascending('fechaReserva')
          .limit(LIMIT_RESERVAS)
          .find({ suppressAuth: true }),
        wixData.query(CMS_PRIME)
          .eq('contactId', safeCid)
          .descending('_createdDate')
          .limit(LIMIT_HISTORICO)
          .find({ suppressAuth: true }),
        wixData.query(CMS_VOUCHERS)
          .eq('contactId', safeCid)
          .descending('_createdDate')
          .limit(LIMIT_HISTORICO)
          .find({ suppressAuth: true }),
        wixData.query(CMS_PROMOCARDS)
          .eq('buyerContactId', safeCid)
          .descending('_createdDate')
          .limit(LIMIT_HISTORICO)
          .find({ suppressAuth: true })
      ]);

      const warnings = [];
      let contacto = {
        contactId: safeCid, nombre: '', apellido: '', nombreCompleto: '',
        email: '', telefono: '', foto: '', sexo: '', dni: '', fechaNacimiento: ''
      };
      if (rContact.status === 'fulfilled' && rContact.value) contacto = shapeContacto(rContact.value);
      else if (rContact.status === 'rejected') warnings.push('contact:' + (rContact.reason?.message || 'error'));

      let reservasProximas = [];
      if (rReservas.status === 'fulfilled') {
        reservasProximas = (rReservas.value.items || []).map(shapeReservaProxima);
      } else warnings.push('reservas:' + (rReservas.reason?.message || 'error'));

      const primeAll = (rPrime.status === 'fulfilled')
        ? (rPrime.value.items || []).map(shapePrime) : [];
      if (rPrime.status !== 'fulfilled') warnings.push('prime:' + (rPrime.reason?.message || 'error'));
      let primeVigente = null;
      for (const p of primeAll) {
        if (p.status !== 'ACTIVA') continue;
        const ms = epoch(p.expirationDate);
        if (isNaN(ms) || ms > ahoraMs) { primeVigente = p; break; }
      }

      const bonosAll = (rBonos.status === 'fulfilled')
        ? (rBonos.value.items || []).map(shapeVoucher) : [];
      if (rBonos.status !== 'fulfilled') warnings.push('bonos:' + (rBonos.reason?.message || 'error'));
      const bonosVigentes = [], bonosNoVigentes = [];
      for (const v of bonosAll) {
        const caducado = v.expirationDate && !isNaN(epoch(v.expirationDate)) && epoch(v.expirationDate) < ahoraMs;
        const esVigente = v.status === 'ACTIVO' && v.remainingUses > 0 && !caducado;
        (esVigente ? bonosVigentes : bonosNoVigentes).push(v);
      }

      const promoAll = (rTarjetas.status === 'fulfilled')
        ? (rTarjetas.value.items || []).map(shapePromoCard) : [];
      if (rTarjetas.status !== 'fulfilled') warnings.push('tarjetas:' + (rTarjetas.reason?.message || 'error'));
      const tarjetasVigentes = [], tarjetasNoVigentes = [], regalosVendidos = [];
      for (const t of promoAll) {
        if (t.isGift) { regalosVendidos.push(t); continue; }
        const caducada = t.expirationDate && !isNaN(epoch(t.expirationDate)) && epoch(t.expirationDate) < ahoraMs;
        const esVigente = t.status === 'EMITIDA' && !caducada;
        (esVigente ? tarjetasVigentes : tarjetasNoVigentes).push(t);
      }

      const kpis = calcularKpis({ primeVigente, bonosVigentes, tarjetasVigentes });

      const dt = ((Date.now() - t0) / 1000).toFixed(2);
      console.log(`${TAG} ✅ getDetalleCliente ${safeCid} ${dt}s`);

      return {
        ok: true, version: VERSION, contacto, kpis, reservasProximas,
        prime: { vigente: primeVigente, historico: primeAll },
        bonos: { vigentes: bonosVigentes, noVigentes: bonosNoVigentes },
        tarjetas: { vigentes: tarjetasVigentes, noVigentes: tarjetasNoVigentes },
        regalosVendidos, warnings
      };
    } catch (e) {
      console.error(`${TAG} ❌ getDetalleCliente:`, e.message);
      return { ok: false, version: VERSION, error: safeErr(e) };
    }
  }
);

// =====================================================
// updateContactoObservatorio — sin cambios v1.0.0
// =====================================================
export const updateContactoObservatorio = webMethod(
  Permissions.SiteMember,
  async ({ contactId, cambios } = {}) => {
    try {
      const safeCid = String(contactId || '').trim();
      if (!safeCid || !isGuid(safeCid)) return { ok: false, version: VERSION, error: { message: 'contactId inválido' } };
      if (!cambios || typeof cambios !== 'object') return { ok: false, version: VERSION, error: { message: 'cambios requerido' } };

      const elevatedGet = elevate(contacts.getContact);
      const contact = await elevatedGet(safeCid);
      if (!contact || !contact.revision) return { ok: false, version: VERSION, error: { message: 'Contacto no encontrado o sin revision' } };

      const contactInfo = {};
      const name = {};
      if (cambios.nombre !== undefined) name.first = String(cambios.nombre || '');
      if (cambios.apellido !== undefined) name.last = String(cambios.apellido || '');
      if (Object.keys(name).length) contactInfo.name = name;

      if (cambios.email) contactInfo.emails = [{ email: String(cambios.email) }];
      if (cambios.telefono) contactInfo.phones = [{ phone: String(cambios.telefono) }];

      if (cambios.fechaNacimiento !== undefined) {
        const raw = String(cambios.fechaNacimiento || '').trim();
        if (raw === '') contactInfo.birthdate = '';
        else if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) contactInfo.birthdate = raw;
        else {
          const parsed = toYmd(raw);
          if (parsed) contactInfo.birthdate = parsed;
        }
      }

      const ext = {};
      if (cambios.sexo !== undefined) ext[FIELD_SEXO] = String(cambios.sexo || '');
      if (cambios.dni !== undefined) ext[FIELD_VAT_ID] = String(cambios.dni || '');
      if (Object.keys(ext).length) contactInfo.extendedFields = ext;

      if (!Object.keys(contactInfo).length) {
        return { ok: true, version: VERSION, sinCambios: true, contacto: shapeContacto(contact) };
      }

      const identifiers = { contactId: safeCid, revision: contact.revision };
      const elevatedUpdate = elevate(contacts.updateContact);
      await elevatedUpdate(identifiers, contactInfo, { suppressAuth: true });

      const contactoFinal = await elevatedGet(safeCid);
      const shaped = shapeContacto(contactoFinal);
      const camposActualizados = Object.keys(contactInfo);

      console.log(`${TAG} ✅ updateContactoObservatorio ${safeCid} | ${camposActualizados.join(',')}`);
      return { ok: true, version: VERSION, camposActualizados, contacto: shaped };

    } catch (e) {
      console.error(`${TAG} ❌ updateContactoObservatorio:`, e.message);
      return { ok: false, version: VERSION, error: safeErr(e) };
    }
  }
);