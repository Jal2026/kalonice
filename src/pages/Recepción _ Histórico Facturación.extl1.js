// =====================================================
// KAMISUITE — Page code: MEMORIA (histórico legacy)
// =====================================================
// VERSION: 1.0.0
// FECHA:   3 de agosto de 2026
// ARCHIVO: pages/Recepción _ Memoria.<pageId>.js
//
// CHANGELOG
//   v1.0.0 (3-Ago-2026) — Versión inicial. Bridge entre el widget
//     MEMORIA y backend/memoriaLegacyLogic.web.js v1.0.0.
//
// PROPÓSITO
//   Servir el módulo MEMORIA: consulta del histórico de facturación
//   anterior a KAMISUITE (import legacy SABDE).
//
// ⚠️ PÁGINA INDEPENDIENTE — decisión deliberada
//   MEMORIA vive en su propia página de back-office, NO dentro de
//   Recepción PRO. Motivo: el page code de Recepción PRO acumula ~15
//   imports de backends distintos y ya provocó una colisión de nombres
//   real (registrarMovimiento de cashRegisterLogic vs stockLogic,
//   2-ago-2026, que habría tumbado toda la Recepción). MEMORIA es
//   consulta de back-office, no operativa de mostrador: no gana nada
//   viviendo ahí y añade riesgo a la pantalla más crítica del salón.
//   Si más adelante se quiere un acceso desde Recepción PRO, se hace
//   con navegación a esta página, no importando este backend allí.
//
// PATRÓN REUTILIZADO (literal, del repo de producción KALÓNICE)
//   - pages/Recepción _ Observatorio Comercial.kzziv.js v1.1.2:
//     $w(WIDGET_ID).onMessage(...) + sendResponse vía postMessage,
//     cache in-memory con TTL, control de peticiones en vuelo.
//
// ⚠️ NUNCA html.on('message') — no funciona en Wix. Solo onMessage.
//
// ID DEL HTML COMPONENT
//   Este page code espera un HtmlComponent con ID '#htmlMemoria'.
//   Si en el editor tiene otro ID, cambiar SOLO la constante WIDGET_ID.
//
// CONTRATO DE MENSAJES
//   Widget → Page code:
//     { type: 'ready' }                          → 'memoriaResumen'
//     { type: 'refresh' }                        → invalida cache y recarga
//     { type: 'getClientes' }                    → 'memoriaClientes'
//     { type: 'getCliente', clientId, telefono } → 'memoriaCliente'
//     { type: 'getDia', fecha }                  → 'memoriaDia'
//     { type: 'getServicio', codigo }            → 'memoriaServicio'
//     { type: 'getFormulas', q, limit }          → 'memoriaFormulas'
//     { type: 'getDiagnostico' }                 → 'memoriaDiagnostico'
//
//   Page code → Widget:
//     { type: 'memoriaResumen', data }
//     { type: 'memoriaClientes', data }
//     { type: 'memoriaCliente', data }
//     { type: 'memoriaDia', data }
//     { type: 'memoriaServicio', data }
//     { type: 'memoriaFormulas', data }
//     { type: 'memoriaDiagnostico', data }
//     { type: 'memoriaError', scope, error }
// =====================================================

import {
  getMemoriaResumen,
  getMemoriaClientes,
  getMemoriaCliente,
  getMemoriaDia,
  getMemoriaServicio,
  getMemoriaFormulas,
  getMemoriaDiagnostico
} from 'backend/memoriaLegacyLogic.web';

const VERSION = '1.0.0';
const TAG = `[Memoria][PageCode][${VERSION}]`;
const WIDGET_ID = '#htmlMemoria';

// ── Cache de resumen e índice de clientes (los dos pesados) ──
const CACHE_TTL_MS = 10 * 60 * 1000;

let _cacheResumen = null;
let _cacheResumenTs = 0;
let _inflightResumen = null;

let _cacheClientes = null;
let _cacheClientesTs = 0;
let _inflightClientes = null;

// ── Cache de fichas de cliente ya consultadas (drill-down) ──
const _cacheFicha = new Map();
const CACHE_FICHA_TTL_MS = 5 * 60 * 1000;

function sendResponse(type, data = {}) {
  try {
    $w(WIDGET_ID).postMessage({ type, ...data, ts: Date.now() });
  } catch (e) {
    console.warn(`${TAG} ⚠️ postMessage falló:`, e.message);
  }
}

function sendError(scope, e) {
  console.error(`${TAG} ❌ ${scope}:`, e);
  sendResponse('memoriaError', { scope, error: { message: e?.message || String(e) } });
}

function vigente(ts, ttl) {
  return ts > 0 && (Date.now() - ts) < ttl;
}

// =====================================================
// $w.onReady
// =====================================================

$w.onReady(function () {
  console.log(`${TAG} Página lista`);

  $w(WIDGET_ID).onMessage(async (event) => {
    const msg = event?.data;
    if (!msg || !msg.type) return;
    console.log(`${TAG} ← Widget:`, msg.type);

    try {
      switch (msg.type) {
        case 'ready':
          await handleResumen(false);
          break;

        case 'refresh':
          await handleRefresh();
          break;

        case 'getClientes':
          await handleClientes(!!msg.refresh);
          break;

        case 'getCliente':
          await handleCliente(msg);
          break;

        case 'getDia':
          await handleDia(msg);
          break;

        case 'getServicio':
          await handleServicio(msg);
          break;

        case 'getFormulas':
          await handleFormulas(msg);
          break;

        case 'getDiagnostico':
          await handleDiagnostico();
          break;

        default:
          console.warn(`${TAG} Mensaje no reconocido:`, msg.type);
      }
    } catch (e) {
      sendError(msg.type, e);
    }
  });
});

// =====================================================
// HANDLERS
// =====================================================

// El widget manda 'ready' en bucle hasta recibir respuesta (patrón
// obligatorio en KAMISUITE: sin reintento el widget se queda en blanco
// en móvil). Por eso hay control de petición en vuelo: varios 'ready'
// seguidos NO disparan varias cargas del backend.
async function handleResumen(refresh) {
  if (!refresh && vigente(_cacheResumenTs, CACHE_TTL_MS) && _cacheResumen) {
    sendResponse('memoriaResumen', { data: _cacheResumen, cached: true });
    return;
  }

  if (_inflightResumen) {
    const data = await _inflightResumen;
    sendResponse('memoriaResumen', { data, cached: true });
    return;
  }

  _inflightResumen = (async () => {
    const res = await getMemoriaResumen({ refresh });
    if (res?.ok) {
      _cacheResumen = res;
      _cacheResumenTs = Date.now();
    }
    return res;
  })();

  try {
    const data = await _inflightResumen;
    if (data?.ok) {
      console.log(`${TAG} ✅ Resumen: ${data.kpis?.tickets} tickets · ${data.kpis?.importeTotal}€`);
      sendResponse('memoriaResumen', { data, cached: false });
    } else {
      sendError('resumen', new Error(data?.error?.message || 'Resumen no disponible'));
    }
  } finally {
    _inflightResumen = null;
  }
}

async function handleRefresh() {
  _cacheResumen = null; _cacheResumenTs = 0;
  _cacheClientes = null; _cacheClientesTs = 0;
  _cacheFicha.clear();
  console.log(`${TAG} ♻️ Cache invalidada`);
  await handleResumen(true);
}

async function handleClientes(refresh) {
  if (!refresh && vigente(_cacheClientesTs, CACHE_TTL_MS) && _cacheClientes) {
    sendResponse('memoriaClientes', { data: _cacheClientes, cached: true });
    return;
  }

  if (_inflightClientes) {
    const data = await _inflightClientes;
    sendResponse('memoriaClientes', { data, cached: true });
    return;
  }

  _inflightClientes = (async () => {
    const res = await getMemoriaClientes({ refresh });
    if (res?.ok) {
      _cacheClientes = res;
      _cacheClientesTs = Date.now();
    }
    return res;
  })();

  try {
    const data = await _inflightClientes;
    if (data?.ok) {
      console.log(`${TAG} ✅ Clientes: ${data.total}`);
      sendResponse('memoriaClientes', { data, cached: false });
    } else {
      sendError('clientes', new Error(data?.error?.message || 'Clientes no disponibles'));
    }
  } finally {
    _inflightClientes = null;
  }
}

async function handleCliente(msg) {
  const clientId = (msg.clientId !== undefined && msg.clientId !== null && msg.clientId !== '')
    ? msg.clientId : null;
  const telefono = msg.telefono || '';

  if (clientId === null && !telefono) {
    sendError('cliente', new Error('Falta clientId o telefono'));
    return;
  }

  const key = clientId !== null ? `id:${clientId}` : `tel:${telefono}`;
  const hit = _cacheFicha.get(key);
  if (hit && vigente(hit.ts, CACHE_FICHA_TTL_MS)) {
    sendResponse('memoriaCliente', { data: hit.data, cached: true });
    return;
  }

  const data = await getMemoriaCliente({ clientId, telefono });
  if (data?.ok) {
    _cacheFicha.set(key, { ts: Date.now(), data });
    sendResponse('memoriaCliente', { data, cached: false });
  } else {
    sendError('cliente', new Error(data?.error?.message || 'Cliente no disponible'));
  }
}

async function handleDia(msg) {
  const fecha = msg.fecha || '';
  const data = await getMemoriaDia({ fecha });
  if (data?.ok) {
    sendResponse('memoriaDia', { data });
  } else {
    sendError('dia', new Error(data?.error?.message || 'Día no disponible'));
  }
}

async function handleServicio(msg) {
  const codigo = msg.codigo || '';
  const data = await getMemoriaServicio({ codigo });
  if (data?.ok) {
    sendResponse('memoriaServicio', { data });
  } else {
    sendError('servicio', new Error(data?.error?.message || 'Servicio no disponible'));
  }
}

async function handleFormulas(msg) {
  const data = await getMemoriaFormulas({ q: msg.q || '', limit: msg.limit || 200 });
  if (data?.ok) {
    sendResponse('memoriaFormulas', { data });
  } else {
    sendError('formulas', new Error(data?.error?.message || 'Fórmulas no disponibles'));
  }
}

async function handleDiagnostico() {
  const data = await getMemoriaDiagnostico();
  console.log(`${TAG} 🔎 Diagnóstico:`, JSON.stringify(data));
  sendResponse('memoriaDiagnostico', { data });
}
