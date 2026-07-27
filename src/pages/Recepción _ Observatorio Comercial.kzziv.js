// =====================================================
// KAMISUITE — Page code: Observatorio Clientes
// =====================================================
// VERSION: 1.1.0
// FECHA:   23 de julio de 2026
// ARCHIVO: pages/Observatorio Clientes.<pageId>.js
//
// CHANGELOG
//   v1.1.0 (23-Jul-2026) — Añadido handler getObservatorioGlobal.
//     · handleReady ahora carga getObservatorioGlobal por defecto:
//       vista comercial AGREGADA del salón (PRIME, Bonos, Tarjetas,
//       Regalos, Reservas, Cupones, KPIs macro).
//     · handleGetDetalleCliente sigue disponible para el drill-down
//       cuando el operador pincha en un evento.
//     · Cache in-memory del observatorio global (TTL 10 min).
//
//   v1.0.0 (23-Jul-2026) — Versión inicial.
//
// CONTRATO DE MENSAJES
//   Widget → Page code:
//     · { type: 'ready' }              → responde 'observatorioGlobal'
//     · { type: 'refreshGlobal' }      → invalida cache y recarga
//     · { type: 'getDetalleCliente', contactId } → drill-down cliente
//     · { type: 'updateContacto', contactId, cambios }
//     · { type: 'refreshCupones' }
//     · { type: 'scrollToTop' }
//
//   Page code → Widget:
//     · { type: 'observatorioGlobal', ... }
//     · { type: 'observatorioGlobalError', error }
//     · { type: 'detalleCliente', ... }
//     · { type: 'detalleClienteError', ... }
//     · { type: 'contactoActualizado', ... }
//     · { type: 'cuponesActualizados', ... }
// =====================================================

import {
  getObservatorioGlobal,
  getDetalleCliente,
  updateContactoObservatorio
} from 'backend/observatorioClientesLogic.web';

import { listarCupones } from 'backend/couponsLogic.web';

const TAG = '[Observatorio v1.1.0]';
const WIDGET_ID = '#htmlObservatorioClientes';

// ── Cache observatorio global ──
let _cacheGlobal = null;
let _cacheGlobalTs = 0;
const CACHE_GLOBAL_TTL_MS = 10 * 60 * 1000;
let _inflightGlobal = null;

// ── Cache detalle por contactId (drill-down) ──
const _cacheDetalle = new Map();
const CACHE_DETALLE_TTL_MS = 5 * 60 * 1000;
const _inflightDetalle = new Map();

function sendResponse(type, data = {}) {
  try {
    $w(WIDGET_ID).postMessage({ type, ...data, ts: Date.now() });
  } catch (e) {
    console.warn(`${TAG} ⚠️ postMessage falló:`, e.message);
  }
}

$w.onReady(function () {
  console.log(`${TAG} Página lista`);

  $w(WIDGET_ID).onMessage(async (event) => {
    const msg = event.data;
    if (!msg || !msg.type) return;
    console.log(`${TAG} ← Widget:`, msg.type);

    switch (msg.type) {
      case 'ready':
        await handleReady();
        break;
      case 'refreshGlobal':
        await handleRefreshGlobal();
        break;
      case 'getDetalleCliente':
        await handleGetDetalleCliente(msg);
        break;
      case 'refreshDetalleCliente':
        await handleGetDetalleCliente(msg, true);
        break;
      case 'updateContacto':
        await handleUpdateContacto(msg);
        break;
      case 'refreshCupones':
        await handleRefreshCupones();
        break;
      case 'scrollToTop':
        try { $w(WIDGET_ID).scrollTo(); } catch (e) {}
        break;
      default:
        console.warn(`${TAG} ⚠️ mensaje desconocido:`, msg.type);
    }
  });
});

async function handleReady() {
  const now = Date.now();
  if (_cacheGlobal && (now - _cacheGlobalTs) < CACHE_GLOBAL_TTL_MS) {
    sendResponse('observatorioGlobal', { ..._cacheGlobal, fromCache: true });
    return;
  }
  if (_inflightGlobal) {
    try {
      const data = await _inflightGlobal;
      sendResponse('observatorioGlobal', { ...data, fromCache: false });
    } catch (e) {
      sendResponse('observatorioGlobalError', { error: e?.message || 'Error' });
    }
    return;
  }
  _inflightGlobal = cargarGlobalFromBackend();
  try {
    const data = await _inflightGlobal;
    sendResponse('observatorioGlobal', { ...data, fromCache: false });
  } catch (e) {
    console.error(`${TAG} ❌ handleReady:`, e?.message);
    sendResponse('observatorioGlobalError', { error: e?.message || 'Error desconocido' });
  } finally {
    _inflightGlobal = null;
  }
}

async function handleRefreshGlobal() {
  console.log(`${TAG} 🔄 refreshGlobal`);
  _cacheGlobal = null;
  _cacheGlobalTs = 0;
  await handleReady();
}

async function cargarGlobalFromBackend() {
  const result = await getObservatorioGlobal();
  if (!result || !result.ok) {
    throw new Error(result?.error?.message || 'getObservatorioGlobal sin ok');
  }
  const data = {
    salonConfig:      result.salonConfig || {},
    kpisSalon:        result.kpisSalon || {},
    prime:            result.prime || { activas: [], vencidas: [], canceladas: [], pendientes: [] },
    bonos:            result.bonos || { activos: [], agotados: [], caducados: [], cancelados: [], pendientes: [] },
    tarjetas:         result.tarjetas || { emitidas: [], canjeadas: [], caducadas: [], canceladas: [], pendientes: [] },
    regalos:          result.regalos || { emitidas: [], canjeadas: [], caducadas: [], canceladas: [], pendientes: [] },
    reservasProximas: result.reservasProximas || [],
    cupones:          result.cupones || [],
    contactos:        result.contactos || [],
    warnings:         result.warnings || []
  };
  _cacheGlobal = data;
  _cacheGlobalTs = Date.now();
  console.log(`${TAG} ✅ Global cacheado`);
  return data;
}

async function handleGetDetalleCliente(msg, forceReload = false) {
  const contactId = String(msg?.contactId || '').trim();
  if (!contactId) {
    sendResponse('detalleClienteError', { contactId: '', error: 'contactId ausente' });
    return;
  }
  const now = Date.now();
  if (!forceReload) {
    const cached = _cacheDetalle.get(contactId);
    if (cached && (now - cached.ts) < CACHE_DETALLE_TTL_MS) {
      sendResponse('detalleCliente', { ...cached.data, contactId, fromCache: true });
      return;
    }
  }
  const infl = _inflightDetalle.get(contactId);
  if (infl) {
    try {
      const data = await infl;
      sendResponse('detalleCliente', { ...data, contactId, fromCache: false });
    } catch (e) {
      sendResponse('detalleClienteError', { contactId, error: e?.message || 'Error' });
    }
    return;
  }
  const p = cargarDetalleFromBackend(contactId);
  _inflightDetalle.set(contactId, p);
  try {
    const data = await p;
    sendResponse('detalleCliente', { ...data, contactId, fromCache: false });
  } catch (e) {
    console.error(`${TAG} ❌ getDetalleCliente(${contactId}):`, e?.message);
    sendResponse('detalleClienteError', { contactId, error: e?.message || 'Error' });
  } finally {
    _inflightDetalle.delete(contactId);
  }
}

async function cargarDetalleFromBackend(contactId) {
  const result = await getDetalleCliente({ contactId });
  if (!result || !result.ok) throw new Error(result?.error?.message || 'getDetalleCliente sin ok');
  const data = {
    contacto: result.contacto || null,
    kpis: result.kpis || null,
    reservasProximas: result.reservasProximas || [],
    prime: result.prime || { vigente: null, historico: [] },
    bonos: result.bonos || { vigentes: [], noVigentes: [] },
    tarjetas: result.tarjetas || { vigentes: [], noVigentes: [] },
    regalosVendidos: result.regalosVendidos || [],
    warnings: result.warnings || []
  };
  _cacheDetalle.set(contactId, { ts: Date.now(), data });
  return data;
}

async function handleUpdateContacto(msg) {
  const contactId = String(msg?.contactId || '').trim();
  const cambios = msg?.cambios || {};
  if (!contactId) {
    sendResponse('contactoActualizado', { contactId: '', ok: false, error: 'contactId ausente' });
    return;
  }
  try {
    const result = await updateContactoObservatorio({ contactId, cambios });
    if (!result || !result.ok) {
      sendResponse('contactoActualizado', { contactId, ok: false, error: result?.error?.message || 'Error' });
      return;
    }
    _cacheDetalle.delete(contactId);

    // Reflejar cambio en el global cacheado (nombre en contactos + en eventos)
    if (_cacheGlobal && result.contacto) {
      const c = result.contacto;
      if (Array.isArray(_cacheGlobal.contactos)) {
        const idx = _cacheGlobal.contactos.findIndex(x => x.contactId === contactId);
        if (idx >= 0) {
          _cacheGlobal.contactos[idx] = {
            ..._cacheGlobal.contactos[idx],
            nombre: c.nombre || _cacheGlobal.contactos[idx].nombre,
            apellido: c.apellido || _cacheGlobal.contactos[idx].apellido,
            nombreCompleto: c.nombreCompleto || [c.nombre, c.apellido].filter(Boolean).join(' ').trim(),
            email: c.email || _cacheGlobal.contactos[idx].email,
            telefono: c.telefono || _cacheGlobal.contactos[idx].telefono
          };
        }
      }
      // Actualizar _clienteNombre y _clienteEmail en TODOS los eventos de ese contactId
      const nombreNuevo = c.nombreCompleto || [c.nombre, c.apellido].filter(Boolean).join(' ').trim();
      actualizarClienteEnEventos(_cacheGlobal, contactId, nombreNuevo, c.email || '', c.telefono || '');
    }

    sendResponse('contactoActualizado', {
      contactId, ok: true,
      contacto: result.contacto,
      camposActualizados: result.camposActualizados || [],
      sinCambios: result.sinCambios === true
    });
  } catch (e) {
    console.error(`${TAG} ❌ updateContacto:`, e?.message);
    sendResponse('contactoActualizado', { contactId, ok: false, error: e?.message || 'Error' });
  }
}

function actualizarClienteEnEventos(cache, contactId, nombre, email, telefono) {
  const patch = (arr, idField) => {
    for (const it of (arr || [])) {
      if (it[idField] === contactId) {
        it._clienteNombre = nombre;
        it._clienteEmail = email;
        it._clienteTelefono = telefono;
      }
    }
  };
  if (cache.prime) {
    patch(cache.prime.activas, 'contactId');
    patch(cache.prime.vencidas, 'contactId');
    patch(cache.prime.canceladas, 'contactId');
    patch(cache.prime.pendientes, 'contactId');
  }
  if (cache.bonos) {
    patch(cache.bonos.activos, 'contactId');
    patch(cache.bonos.agotados, 'contactId');
    patch(cache.bonos.caducados, 'contactId');
    patch(cache.bonos.cancelados, 'contactId');
    patch(cache.bonos.pendientes, 'contactId');
  }
  if (cache.tarjetas) {
    patch(cache.tarjetas.emitidas, 'buyerContactId');
    patch(cache.tarjetas.canjeadas, 'buyerContactId');
    patch(cache.tarjetas.caducadas, 'buyerContactId');
    patch(cache.tarjetas.canceladas, 'buyerContactId');
    patch(cache.tarjetas.pendientes, 'buyerContactId');
  }
  if (cache.regalos) {
    patch(cache.regalos.emitidas, 'buyerContactId');
    patch(cache.regalos.canjeadas, 'buyerContactId');
    patch(cache.regalos.caducadas, 'buyerContactId');
    patch(cache.regalos.canceladas, 'buyerContactId');
    patch(cache.regalos.pendientes, 'buyerContactId');
  }
  patch(cache.reservasProximas, 'contactId');
}

async function handleRefreshCupones() {
  try {
    const r = await listarCupones({ limit: 200 });
    if (!r || !r.success) {
      sendResponse('cuponesActualizados', { ok: false, cupones: [], error: r?.error || 'Error' });
      return;
    }
    const cupones = r.cupones || [];
    if (_cacheGlobal) _cacheGlobal.cupones = cupones;
    sendResponse('cuponesActualizados', { ok: true, cupones });
  } catch (e) {
    sendResponse('cuponesActualizados', { ok: false, cupones: [], error: e?.message || 'Error' });
  }
}