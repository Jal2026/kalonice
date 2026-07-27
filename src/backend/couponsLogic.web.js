// =====================================================
// KAMISUITE - Backend Gestor de Cupones
// =====================================================
// VERSION: 1.0.3b
// FECHA: 16 de junio de 2026
// ARCHIVO: backend/couponsLogic.web.js
//
// BASE:
//   Versión conservadora basada en la v1.0.2 que NO rompe la lectura
//   de clientes.
//
// FIX:
//   - No se toca Page Code.
//   - No se toca creación de cupones, que ya funcionaba.
//   - No se cambia la arquitectura.
//   - Solo se adapta shapeCupon() para leer también desde
//     coupon.specification, que es el shape real devuelto por
//     wix-marketing.v2.coupons.queryCoupons().
// =====================================================

import { Permissions, webMethod } from 'wix-web-module';
import { elevate } from 'wix-auth';
import { coupons } from 'wix-marketing.v2';

const VERSION = '1.0.3b';
const TAG = `[Coupons][${VERSION}]`;

// =====================================================
// HELPERS
// =====================================================

function safeErr(e) {
  const out = {
    name: e?.name || 'Error',
    message: e?.message || String(e)
  };
  if (e?.details) out.details = e.details;
  if (e?.applicationError) out.applicationError = e.applicationError;
  return out;
}

function normalizarCodigo(raw) {
  if (typeof raw !== 'string') return '';
  return raw.trim();
}

function aDateOrNull(v) {
  if (v === null || v === undefined || v === '') return null;

  if (v instanceof Date) {
    return isNaN(v.getTime()) ? null : v;
  }

  if (typeof v === 'number') {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }

  if (typeof v === 'string') {
    const limpio = v.trim();
    if (!limpio) return null;

    if (/^\d+$/.test(limpio)) {
      const dNum = new Date(Number(limpio));
      return isNaN(dNum.getTime()) ? null : dNum;
    }

    const d = new Date(limpio);
    return isNaN(d.getTime()) ? null : d;
  }

  return null;
}

function dateToWixTimestampString(d) {
  const date = aDateOrNull(d);
  if (!date) return null;
  return String(date.getTime());
}

function dateToIsoOrNull(v) {
  const d = aDateOrNull(v);
  return d ? d.toISOString() : null;
}

function toFiniteNumber(v) {
  if (v === null || v === undefined || v === '') return null;

  if (typeof v === 'number') {
    return Number.isFinite(v) ? v : null;
  }

  if (typeof v === 'string') {
    const limpio = v
      .trim()
      .replace(/\s/g, '')
      .replace('€', '')
      .replace('%', '')
      .replace(',', '.');

    if (!limpio) return null;

    const n = Number(limpio);
    return Number.isFinite(n) ? n : null;
  }

  if (typeof v === 'object') {
    if (v.amount !== undefined) return toFiniteNumber(v.amount);
    if (v.value !== undefined) return toFiniteNumber(v.value);
  }

  return null;
}

function toIntegerOrNull(v) {
  const n = toFiniteNumber(v);
  if (n === null) return null;
  return Number.isInteger(n) ? n : null;
}

function buildFieldMask(spec) {
  return Object.keys(spec || {}).filter((k) => spec[k] !== undefined);
}

function logSpecDebug(label, spec) {
  try {
    console.log(`${TAG} ${label}: ${JSON.stringify(spec)}`);
  } catch (_) {
    console.log(`${TAG} ${label}: [spec no serializable]`);
  }
}

function getSpec(c) {
  if (!c || typeof c !== 'object') return {};
  if (c.specification && typeof c.specification === 'object') return c.specification;
  return c;
}

// =====================================================
// VALIDACIÓN CREACIÓN
// =====================================================

function validarSpecification(input) {
  if (!input || typeof input !== 'object') {
    return { ok: false, error: { message: 'specification requerido' } };
  }

  const code = normalizarCodigo(input.code);
  if (!code) {
    return { ok: false, error: { message: 'El código del cupón es obligatorio' } };
  }
  if (code.length > 100) {
    return { ok: false, error: { message: 'El código no puede superar 100 caracteres' } };
  }

  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name) {
    return { ok: false, error: { message: 'El nombre del cupón es obligatorio' } };
  }
  if (name.length > 200) {
    return { ok: false, error: { message: 'El nombre no puede superar 200 caracteres' } };
  }

  const tienePct =
    input.percentOffRate !== undefined &&
    input.percentOffRate !== null &&
    input.percentOffRate !== '';

  const tieneFijo =
    input.moneyOffAmount !== undefined &&
    input.moneyOffAmount !== null &&
    input.moneyOffAmount !== '';

  if (tienePct && tieneFijo) {
    return {
      ok: false,
      error: { message: 'No se pueden mezclar porcentaje e importe fijo en el mismo cupón' }
    };
  }

  if (!tienePct && !tieneFijo) {
    return {
      ok: false,
      error: { message: 'Debes indicar percentOffRate o moneyOffAmount' }
    };
  }

  let percentOffRate = null;
  let moneyOffAmount = null;

  if (tienePct) {
    const n = toFiniteNumber(input.percentOffRate);
    if (n === null || n < 1 || n > 100) {
      return { ok: false, error: { message: 'El porcentaje debe ser un número entre 1 y 100' } };
    }
    percentOffRate = n;
  }

  if (tieneFijo) {
    const n = toFiniteNumber(input.moneyOffAmount);
    if (n === null || n <= 0) {
      return { ok: false, error: { message: 'El importe fijo debe ser mayor que 0' } };
    }
    moneyOffAmount = n;
  }

  if (
    input.minimumSubtotal === undefined ||
    input.minimumSubtotal === null ||
    input.minimumSubtotal === ''
  ) {
    return {
      ok: false,
      error: { message: 'minimumSubtotal es obligatorio para el modo checkout custom' }
    };
  }

  const minimumSubtotal = toFiniteNumber(input.minimumSubtotal);
  if (minimumSubtotal === null || minimumSubtotal < 0) {
    return { ok: false, error: { message: 'minimumSubtotal debe ser un número >= 0' } };
  }

  const startDate = aDateOrNull(input.startTime) || new Date();

  let expirationDate = null;
  if (
    input.expirationTime !== undefined &&
    input.expirationTime !== null &&
    input.expirationTime !== ''
  ) {
    expirationDate = aDateOrNull(input.expirationTime);
    if (!expirationDate) {
      return { ok: false, error: { message: 'expirationTime no es una fecha válida' } };
    }
    if (expirationDate.getTime() <= startDate.getTime()) {
      return { ok: false, error: { message: 'La fecha final debe ser posterior a la fecha de inicio' } };
    }
  }

  let usageLimit = null;
  if (input.usageLimit !== undefined && input.usageLimit !== null && input.usageLimit !== '') {
    usageLimit = toIntegerOrNull(input.usageLimit);
    if (usageLimit === null || usageLimit < 1) {
      return { ok: false, error: { message: 'usageLimit debe ser un entero >= 1' } };
    }
  }

  let limitPerCustomer = null;
  if (
    input.limitPerCustomer !== undefined &&
    input.limitPerCustomer !== null &&
    input.limitPerCustomer !== ''
  ) {
    limitPerCustomer = toIntegerOrNull(input.limitPerCustomer);
    if (limitPerCustomer === null || limitPerCustomer < 1) {
      return { ok: false, error: { message: 'limitPerCustomer debe ser un entero >= 1' } };
    }
  }

  const active = input.active === undefined ? true : !!input.active;

  const appliesToSubscriptions =
    input.appliesToSubscriptions !== undefined
      ? !!input.appliesToSubscriptions
      : input.includesSubscriptions !== undefined
        ? !!input.includesSubscriptions
        : undefined;

  const limitedToOneItem =
    input.limitedToOneItem === undefined ? undefined : !!input.limitedToOneItem;

  const spec = {
    name,
    code,
    startTime: dateToWixTimestampString(startDate),
    minimumSubtotal,
    active
  };

  if (percentOffRate !== null) spec.percentOffRate = percentOffRate;
  if (moneyOffAmount !== null) spec.moneyOffAmount = moneyOffAmount;
  if (expirationDate) spec.expirationTime = dateToWixTimestampString(expirationDate);
  if (usageLimit !== null) spec.usageLimit = usageLimit;
  if (limitPerCustomer !== null) spec.limitPerCustomer = limitPerCustomer;
  if (appliesToSubscriptions !== undefined) spec.appliesToSubscriptions = appliesToSubscriptions;
  if (limitedToOneItem !== undefined) spec.limitedToOneItem = limitedToOneItem;

  return { ok: true, spec };
}

// =====================================================
// VALIDACIÓN EDICIÓN
// =====================================================

function validarCambiosEdicion(cambios, cuponOriginal) {
  if (!cambios || typeof cambios !== 'object') {
    return { ok: false, error: { message: 'cambios requerido' } };
  }

  const originalSpec = getSpec(cuponOriginal);

  const tipoOriginalPct =
    originalSpec?.percentOffRate !== undefined &&
    originalSpec?.percentOffRate !== null;

  const tipoOriginalFijo =
    originalSpec?.moneyOffAmount !== undefined &&
    originalSpec?.moneyOffAmount !== null;

  const intentaPct =
    cambios.percentOffRate !== undefined &&
    cambios.percentOffRate !== null &&
    cambios.percentOffRate !== '';

  const intentaFijo =
    cambios.moneyOffAmount !== undefined &&
    cambios.moneyOffAmount !== null &&
    cambios.moneyOffAmount !== '';

  if (intentaPct && intentaFijo) {
    return { ok: false, error: { message: 'No se pueden mezclar porcentaje e importe fijo' } };
  }

  if (intentaPct && !tipoOriginalPct) {
    return {
      ok: false,
      error: { message: 'No se puede convertir un cupón de importe fijo a porcentaje. Crea un cupón nuevo.' }
    };
  }

  if (intentaFijo && !tipoOriginalFijo) {
    return {
      ok: false,
      error: { message: 'No se puede convertir un cupón de porcentaje a importe fijo. Crea un cupón nuevo.' }
    };
  }

  const out = {};

  if (cambios.name !== undefined) {
    const n = String(cambios.name || '').trim();
    if (!n) return { ok: false, error: { message: 'El nombre no puede quedar vacío' } };
    if (n.length > 200) {
      return { ok: false, error: { message: 'El nombre no puede superar 200 caracteres' } };
    }
    out.name = n;
  }

  if (intentaPct) {
    const n = toFiniteNumber(cambios.percentOffRate);
    if (n === null || n < 1 || n > 100) {
      return { ok: false, error: { message: 'El porcentaje debe ser un número entre 1 y 100' } };
    }
    out.percentOffRate = n;
  }

  if (intentaFijo) {
    const n = toFiniteNumber(cambios.moneyOffAmount);
    if (n === null || n <= 0) {
      return { ok: false, error: { message: 'El importe fijo debe ser mayor que 0' } };
    }
    out.moneyOffAmount = n;
  }

  if (cambios.minimumSubtotal !== undefined) {
    const n = toFiniteNumber(cambios.minimumSubtotal);
    if (n === null || n < 0) {
      return { ok: false, error: { message: 'minimumSubtotal debe ser un número >= 0' } };
    }
    out.minimumSubtotal = n;
  }

  if (cambios.startTime !== undefined) {
    const d = aDateOrNull(cambios.startTime);
    if (!d) return { ok: false, error: { message: 'startTime no es una fecha válida' } };
    out.startTime = dateToWixTimestampString(d);
  }

  if (cambios.expirationTime !== undefined) {
    if (cambios.expirationTime === null || cambios.expirationTime === '') {
      out.expirationTime = null;
    } else {
      const d = aDateOrNull(cambios.expirationTime);
      if (!d) return { ok: false, error: { message: 'expirationTime no es una fecha válida' } };

      const startOrig = aDateOrNull(originalSpec?.startTime);
      const startCambios = cambios.startTime !== undefined ? aDateOrNull(cambios.startTime) : null;
      const startBase = startCambios || startOrig;

      if (startBase && d.getTime() <= startBase.getTime()) {
        return { ok: false, error: { message: 'La fecha final debe ser posterior a la fecha de inicio' } };
      }

      out.expirationTime = dateToWixTimestampString(d);
    }
  }

  if (cambios.usageLimit !== undefined) {
    if (cambios.usageLimit === null || cambios.usageLimit === '') {
      out.usageLimit = null;
    } else {
      const n = toIntegerOrNull(cambios.usageLimit);
      if (n === null || n < 1) {
        return { ok: false, error: { message: 'usageLimit debe ser un entero >= 1' } };
      }
      out.usageLimit = n;
    }
  }

  if (cambios.limitPerCustomer !== undefined) {
    if (cambios.limitPerCustomer === null || cambios.limitPerCustomer === '') {
      out.limitPerCustomer = null;
    } else {
      const n = toIntegerOrNull(cambios.limitPerCustomer);
      if (n === null || n < 1) {
        return { ok: false, error: { message: 'limitPerCustomer debe ser un entero >= 1' } };
      }
      out.limitPerCustomer = n;
    }
  }

  if (cambios.active !== undefined) {
    out.active = !!cambios.active;
  }

  if (cambios.appliesToSubscriptions !== undefined) {
    out.appliesToSubscriptions = !!cambios.appliesToSubscriptions;
  } else if (cambios.includesSubscriptions !== undefined) {
    out.appliesToSubscriptions = !!cambios.includesSubscriptions;
  }

  if (cambios.limitedToOneItem !== undefined) {
    out.limitedToOneItem = !!cambios.limitedToOneItem;
  }

  const fieldMask = buildFieldMask(out);

  if (!fieldMask.length) {
    return { ok: false, error: { message: 'No hay cambios efectivos para aplicar' } };
  }

  return { ok: true, spec: out, fieldMask };
}

// =====================================================
// SHAPE DE SALIDA
// =====================================================

function shapeCupon(c) {
  if (!c || typeof c !== 'object') return null;

  const spec = getSpec(c);

  let tipo = '';
  let valorDescuento = null;

  if (spec.percentOffRate !== undefined && spec.percentOffRate !== null) {
    tipo = 'percent';
    valorDescuento = Number(spec.percentOffRate);
  } else if (spec.moneyOffAmount !== undefined && spec.moneyOffAmount !== null) {
    tipo = 'money';
    valorDescuento = Number(spec.moneyOffAmount);
  }

  const id = c._id || c.id || spec._id || spec.id || '';

  const appliesToSubscriptions =
    spec.appliesToSubscriptions !== undefined
      ? !!spec.appliesToSubscriptions
      : spec.includesSubscriptions !== undefined
        ? !!spec.includesSubscriptions
        : false;

  return {
    id,
    _id: id,
    code: spec.code || c.code || '',
    name: spec.name || c.name || '',
    tipo,
    valorDescuento,
    percentOffRate: spec.percentOffRate != null ? Number(spec.percentOffRate) : null,
    moneyOffAmount: spec.moneyOffAmount != null ? Number(spec.moneyOffAmount) : null,
    minimumSubtotal: spec.minimumSubtotal != null ? Number(spec.minimumSubtotal) : null,
    active: spec.active === undefined ? true : !!spec.active,
    startTime: dateToIsoOrNull(spec.startTime || c.startTime),
    expirationTime: dateToIsoOrNull(spec.expirationTime || c.expirationTime),
    usageLimit: spec.usageLimit != null ? Number(spec.usageLimit) : null,
    limitPerCustomer: spec.limitPerCustomer != null ? Number(spec.limitPerCustomer) : null,
    numberOfUsages: c.numberOfUsages != null ? Number(c.numberOfUsages) : 0,
    appliesToSubscriptions,
    includesSubscriptions: appliesToSubscriptions,
    limitedToOneItem: !!spec.limitedToOneItem,
    expired: !!c.expired,
    dateCreated: dateToIsoOrNull(c.dateCreated),
    type: spec.type || c.type || ''
  };
}

// =====================================================
// FILTROS LISTADO
// =====================================================

function aplicarFiltrosListado(items, filtros) {
  if (!filtros || typeof filtros !== 'object') return items;

  const ahora = new Date();
  const buscarRaw = String(filtros.buscar || '').trim().toLowerCase();
  const estado = String(filtros.estado || '').trim().toLowerCase();
  const tipo = String(filtros.tipo || '').trim().toLowerCase();

  return items.filter((c) => {
    if (buscarRaw) {
      const code = String(c.code || '').toLowerCase();
      const name = String(c.name || '').toLowerCase();
      if (!code.includes(buscarRaw) && !name.includes(buscarRaw)) return false;
    }

    if (tipo === 'percent' && c.tipo !== 'percent') return false;
    if (tipo === 'money' && c.tipo !== 'money') return false;

    if (estado === 'activos' && c.active !== true) return false;
    if (estado === 'inactivos' && c.active !== false) return false;
    if (estado === 'sin_fin' && c.expirationTime) return false;

    if (estado === 'expirados') {
      if (!c.expirationTime) return false;
      const e = new Date(c.expirationTime);
      if (isNaN(e.getTime()) || e.getTime() >= ahora.getTime()) return false;
    }

    return true;
  });
}

// =====================================================
// FUNCIONES EXPORTADAS
// =====================================================

export const crearCupon = webMethod(Permissions.SiteMember, async (payload) => {
  try {
    console.log(`${TAG} crearCupon: code=${payload?.code || '?'} name=${payload?.name || '?'}`);

    const validacion = validarSpecification(payload);
    if (!validacion.ok) {
      console.warn(`${TAG} crearCupon validación falló: ${validacion.error.message}`);
      return { ok: false, version: VERSION, error: validacion.error };
    }

    const spec = validacion.spec;
    logSpecDebug('crearCupon spec final', spec);

    const elevatedCreate = elevate(coupons.createCoupon);
    const result = await elevatedCreate(spec);

    const creado = result?.coupon || result || null;
    const couponId = creado?._id || creado?.id || result?._id || result?.id || '';

    let cuponFinal = creado ? { ...creado, _id: couponId } : null;

    if (couponId) {
      try {
        const elevatedGet = elevate(coupons.getCoupon);
        const leido = await elevatedGet(couponId);
        cuponFinal = leido?.coupon || leido || cuponFinal;
      } catch (eGet) {
        console.warn(`${TAG} crearCupon: getCoupon tras crear falló no fatal: ${eGet.message}`);
      }
    }

    console.log(`${TAG} crearCupon OK: id=${couponId} code=${spec.code}`);

    return {
      ok: true,
      version: VERSION,
      cupon: shapeCupon(cuponFinal),
      couponId
    };
  } catch (e) {
    console.error(`${TAG} crearCupon ERROR:`, e);
    return { ok: false, version: VERSION, error: safeErr(e) };
  }
});

export const listarCupones = webMethod(Permissions.SiteMember, async (payload) => {
  try {
    const limit =
      Number.isInteger(payload?.limit) &&
      payload.limit > 0 &&
      payload.limit <= 100
        ? payload.limit
        : 100;

    const filtros = payload?.filtros || {};

    console.log(`${TAG} listarCupones: limit=${limit} filtros=${JSON.stringify(filtros)}`);

    const elevatedQuery = elevate(coupons.queryCoupons);

    const r = await elevatedQuery({
      paging: { limit }
    });

    const lista = r?.coupons || r?.items || [];
    const items = lista.map(shapeCupon).filter(Boolean);
    const filtrados = aplicarFiltrosListado(items, filtros);

    console.log(`${TAG} listarCupones OK: total=${items.length} filtrados=${filtrados.length}`);

    return {
      ok: true,
      version: VERSION,
      cupones: filtrados,
      totalCargados: items.length,
      totalFiltrados: filtrados.length
    };
  } catch (e) {
    console.error(`${TAG} listarCupones ERROR:`, e);
    return { ok: false, version: VERSION, error: safeErr(e), cupones: [] };
  }
});

export const obtenerCupon = webMethod(Permissions.SiteMember, async (payload) => {
  try {
    const { couponId } = payload || {};

    console.log(`${TAG} obtenerCupon: ${couponId}`);

    if (!couponId) throw new Error('couponId requerido');

    const elevatedGet = elevate(coupons.getCoupon);
    const r = await elevatedGet(couponId);
    const c = r?.coupon || r || null;

    if (!c) {
      return { ok: false, version: VERSION, error: { message: 'Cupón no encontrado' } };
    }

    return {
      ok: true,
      version: VERSION,
      cupon: shapeCupon(c)
    };
  } catch (e) {
    console.error(`${TAG} obtenerCupon ERROR:`, e);
    return { ok: false, version: VERSION, error: safeErr(e) };
  }
});

export const actualizarCupon = webMethod(Permissions.SiteMember, async (payload) => {
  try {
    const { couponId, cambios } = payload || {};

    console.log(`${TAG} actualizarCupon: ${couponId}`);

    if (!couponId) throw new Error('couponId requerido');

    const elevatedGet = elevate(coupons.getCoupon);
    const rGet = await elevatedGet(couponId);
    const original = rGet?.coupon || rGet || null;

    if (!original) {
      return { ok: false, version: VERSION, error: { message: 'Cupón no encontrado' } };
    }

    const validacion = validarCambiosEdicion(cambios, original);
    if (!validacion.ok) {
      console.warn(`${TAG} actualizarCupon validación falló: ${validacion.error.message}`);
      return { ok: false, version: VERSION, error: validacion.error };
    }

    const specCambios = validacion.spec;
    const fieldMask = validacion.fieldMask;

    logSpecDebug('actualizarCupon spec final', specCambios);
    console.log(`${TAG} actualizarCupon fieldMask=${JSON.stringify(fieldMask)}`);

    const elevatedUpdate = elevate(coupons.updateCoupon);
    await elevatedUpdate(couponId, specCambios, fieldMask);

    let cuponFinal = null;

    try {
      const r2 = await elevatedGet(couponId);
      cuponFinal = r2?.coupon || r2 || null;
    } catch (eGet) {
      console.warn(`${TAG} actualizarCupon: getCoupon tras update falló no fatal: ${eGet.message}`);
    }

    console.log(`${TAG} actualizarCupon OK: ${couponId} | campos=${fieldMask.join(',')}`);

    return {
      ok: true,
      version: VERSION,
      cupon: cuponFinal ? shapeCupon(cuponFinal) : null,
      camposActualizados: fieldMask
    };
  } catch (e) {
    console.error(`${TAG} actualizarCupon ERROR:`, e);
    return { ok: false, version: VERSION, error: safeErr(e) };
  }
});

export const activarDesactivarCupon = webMethod(Permissions.SiteMember, async (payload) => {
  try {
    const { couponId, active } = payload || {};

    console.log(`${TAG} activarDesactivarCupon: ${couponId} active=${active}`);

    if (!couponId) throw new Error('couponId requerido');
    if (active === undefined || active === null) throw new Error('active requerido');

    const specCambios = { active: !!active };
    const fieldMask = ['active'];

    const elevatedUpdate = elevate(coupons.updateCoupon);
    await elevatedUpdate(couponId, specCambios, fieldMask);

    const elevatedGet = elevate(coupons.getCoupon);
    let cuponFinal = null;

    try {
      const r = await elevatedGet(couponId);
      cuponFinal = r?.coupon || r || null;
    } catch (eGet) {
      console.warn(`${TAG} activarDesactivarCupon: getCoupon tras update falló no fatal: ${eGet.message}`);
    }

    console.log(`${TAG} activarDesactivarCupon OK: ${couponId} → ${!!active}`);

    return {
      ok: true,
      version: VERSION,
      cupon: cuponFinal ? shapeCupon(cuponFinal) : null,
      active: !!active
    };
  } catch (e) {
    console.error(`${TAG} activarDesactivarCupon ERROR:`, e);
    return { ok: false, version: VERSION, error: safeErr(e) };
  }
});

export const eliminarCupon = webMethod(Permissions.SiteMember, async (payload) => {
  try {
    const { couponId } = payload || {};

    console.log(`${TAG} eliminarCupon: ${couponId}`);

    if (!couponId) throw new Error('couponId requerido');

    const elevatedDelete = elevate(coupons.deleteCoupon);
    await elevatedDelete(couponId);

    console.log(`${TAG} eliminarCupon OK: ${couponId}`);

    return {
      ok: true,
      version: VERSION,
      couponId
    };
  } catch (e) {
    console.error(`${TAG} eliminarCupon ERROR:`, e);
    return { ok: false, version: VERSION, error: safeErr(e) };
  }
});