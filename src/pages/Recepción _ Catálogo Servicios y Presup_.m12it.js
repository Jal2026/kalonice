// =====================================================
// KAMISUITE — Page code: Recepción | Listado de Servicios
// =====================================================
// VERSION: 2.0.1
// FECHA: 22 de julio de 2026
// ARCHIVO: pages/Recepción | Listado de Servicios.gstnd.js
//
// CHANGELOG
//   v2.0.1 (22-Jul-2026)
//     · Nuevo listener 'scrollToTop': el widget lo envía al abrir modal
//       o drawer para llevar la ventana padre al top del HtmlComponent.
//       Patrón validado en Área de Cliente v1.3.2 y edicionservicios
//       v1.14.4. `$w().scrollTo()` scrollea al elemento en la página
//       padre (wixWindow.scrollTo equivalente para elementos concretos).
//       Sin esto, en iframes auto-height con mucho contenido, el modal
//       fixed aparece fuera del scroll actual del usuario en móvil.
//     · Sin otros cambios: contrato y cache intactos.
//
//   v2.0.0 (22-Jul-2026) — Versión inicial.
//
// PROPÓSITO:
//   Bridge postMessage entre el widget HTML #htmlCatalogoServicios y el
//   backend catalogoConsultaLogic v1.0.0. Sustituye al page code
//   legacy v1.0.0 (que estaba enganchado a diagnosticoServicios y a
//   SvMapeoServicios V1).
//
// PAREJAS:
//   - Backend:  backend/catalogoConsultaLogic.web.js v1.0.0
//   - Widget:   #htmlCatalogoServicios (widget reemplazado por dentro,
//               ID de contenedor conservado del módulo Listado v1)
//
// CHANGELOG
//   v2.0.0 (22-Jul-2026) — Reescrito desde cero para V2.
//     - Sustituye pareja legacy (v1.0.0 → diagnosticoServicios).
//     - Contrato de mensajes minimalista: bootstrap + logPresupuesto.
//     - Cache in-memory del módulo para no repegar al backend en
//       navegaciones internas del widget (recarga solo bajo petición
//       explícita 'refreshCatalogo').
//     - Patrón postMessage retry: el widget manda 'ready' con reintentos
//       cada 700ms hasta recibir 'bootstrap'; este page code responde
//       a cada 'ready' con la cache si está caliente, o llamando al
//       backend si es la primera vez.
//
// CONTRATO DE MENSAJES
//   Widget → Page code:
//     · { type: 'ready' }
//         El widget acaba de montar. Responde con 'bootstrap' (cache
//         caliente o primera carga desde backend).
//
//     · { type: 'refreshCatalogo' }
//         El usuario pulsó refrescar en el widget. Invalida cache,
//         relee del backend, responde con 'bootstrap' nuevo.
//
//     · { type: 'logPresupuesto',
//         channel: 'whatsapp'|'email'|'copiar',
//         recipient, clientName, textoPresupuesto,
//         totalPrecio, duracionTotal }
//         Fire-and-forget. Guarda traza en CommunicationLog.
//         Responde 'presupuestoLoggeado' con { ok, _id? } pero el
//         widget no bloquea nada esperándolo.
//
//   Page code → Widget:
//     · { type: 'bootstrap',
//         servicios, staff, salonConfig, contactos, warnings,
//         fromCache: boolean }
//
//     · { type: 'bootstrapError', error }
//
//     · { type: 'presupuestoLoggeado', ok, _id? }
// =====================================================

import {
  getCatalogoConsulta,
  logPresupuesto
} from 'backend/catalogoConsultaLogic.web';

const TAG = '[ListadoServicios v2.0.1]';

// ── Cache in-memory del módulo ──
// Vive mientras la pestaña del navegador esté abierta y no navegue a
// otra página. El widget también implementa sessionStorage por su
// lado (llave 'kamisuite_contactos_cache_v1' + TTL 10min) para
// compartir entre pestañas. Aquí solo evitamos el ida-vuelta backend
// cuando el propio widget se remonta sin cambio de página.
let _cache = null;
let _cacheTs = 0;
const CACHE_TTL_MS = 10 * 60 * 1000;  // 10 minutos

// ── Anti-flood: si el widget manda ready varias veces mientras aún
// carga el backend, no lanzamos N peticiones. Guardamos la promesa
// en vuelo y todos los rebotes se agregan a ella.
let _inflightBootstrap = null;

function sendResponse(type, data = {}) {
  try {
    $w('#htmlCatalogoServicios').postMessage({ type, ...data, ts: Date.now() });
  } catch (e) {
    console.warn(`${TAG} ⚠️ postMessage falló (widget aún no montado?):`, e.message);
  }
}

// ─────────────────────────────────────────────────
// $w.onReady
// ─────────────────────────────────────────────────
$w.onReady(function () {
  console.log(`${TAG} Página lista`);

  // NOTA: html.onMessage(handler) — patrón obligatorio Wix.
  //       NUNCA html.on('message'), que no es API de Velo.
  $w('#htmlCatalogoServicios').onMessage(async (event) => {
    const msg = event.data;
    if (!msg || !msg.type) return;

    console.log(`${TAG} ← Widget:`, msg.type);

    switch (msg.type) {
      case 'ready':
        await handleReady();
        break;

      case 'refreshCatalogo':
        await handleRefresh();
        break;

      case 'logPresupuesto':
        await handleLogPresupuesto(msg);
        break;

      case 'scrollToTop':
        // v2.0.1 — Widget solicita scroll al top del HtmlComponent en la
        // vista padre. Necesario en iframes auto-height con mucho contenido:
        // sin esto, modal/drawer fixed del widget quedan fuera del scroll
        // actual del usuario en móvil. `$w(el).scrollTo()` es la API oficial
        // Wix que sí encuentra el contenedor correcto (validado en Área de
        // Cliente v1.3.2). Fire-and-forget: no respondemos al widget.
        handleScrollToTop();
        break;

      default:
        console.warn(`${TAG} Tipo desconocido:`, msg.type);
    }
  });
});

// ─────────────────────────────────────────────────
// handleReady — primera carga o rebote de retry
// ─────────────────────────────────────────────────
async function handleReady() {
  // Cache caliente → respuesta inmediata sin tocar backend.
  if (_cache && (Date.now() - _cacheTs) < CACHE_TTL_MS) {
    console.log(`${TAG} ✅ ready servido desde cache (edad ${((Date.now() - _cacheTs) / 1000).toFixed(0)}s)`);
    sendResponse('bootstrap', { ..._cache, fromCache: true });
    return;
  }

  // Petición en vuelo → esperar a esa, no lanzar otra.
  if (_inflightBootstrap) {
    console.log(`${TAG} ⏳ ready mientras hay bootstrap en vuelo — espero`);
    try {
      const data = await _inflightBootstrap;
      sendResponse('bootstrap', { ...data, fromCache: false });
    } catch (e) {
      sendResponse('bootstrapError', { error: e?.message || String(e) });
    }
    return;
  }

  // Primera carga real.
  _inflightBootstrap = cargarBootstrap();
  try {
    const data = await _inflightBootstrap;
    sendResponse('bootstrap', { ...data, fromCache: false });
  } catch (e) {
    console.error(`${TAG} ❌ bootstrap error:`, e.message);
    sendResponse('bootstrapError', { error: e?.message || String(e) });
  } finally {
    _inflightBootstrap = null;
  }
}

// ─────────────────────────────────────────────────
// handleRefresh — usuario pulsa botón de refrescar
// ─────────────────────────────────────────────────
async function handleRefresh() {
  console.log(`${TAG} 🔄 refreshCatalogo — invalido cache`);
  _cache = null;
  _cacheTs = 0;
  await handleReady();
}

// ─────────────────────────────────────────────────
// cargarBootstrap — llama backend y actualiza cache
// ─────────────────────────────────────────────────
async function cargarBootstrap() {
  const t0 = Date.now();
  const r = await getCatalogoConsulta();
  const dt = ((Date.now() - t0) / 1000).toFixed(2);

  if (!r || !r.ok) {
    const errMsg = r?.error?.message || 'getCatalogoConsulta devolvió !ok';
    console.error(`${TAG} ❌ backend error: ${errMsg}`);
    // Aun así cacheamos el resultado (podría ser un parcial usable).
    // Si es un error total, el widget mostrará el error.
    throw new Error(errMsg);
  }

  const data = {
    servicios: r.servicios || [],
    staff: r.staff || [],
    salonConfig: r.salonConfig || {},
    contactos: r.contactos || [],
    warnings: r.warnings || []
  };

  _cache = data;
  _cacheTs = Date.now();

  console.log(`${TAG} ✅ bootstrap OK — ${data.servicios.length} servicios · ${data.staff.length} staff · ${data.contactos.length} contactos · ${dt}s${data.warnings.length ? ' ⚠️ ' + data.warnings.join(' | ') : ''}`);
  return data;
}

// ─────────────────────────────────────────────────
// handleScrollToTop — v2.0.1
// Widget solicita scroll al top del HtmlComponent en la vista padre.
// `$w(el).scrollTo()` es equivalente a wixWindow.scrollTo(0, offsetDelElemento)
// pero automáticamente encuentra el offset correcto.
// ─────────────────────────────────────────────────
function handleScrollToTop() {
  try {
    $w('#htmlCatalogoServicios').scrollTo();
  } catch (e) {
    console.warn(`${TAG} ⚠️ scrollTo falló (elemento no encontrado?):`, e.message);
  }
}

// ─────────────────────────────────────────────────
// handleLogPresupuesto — traza fire-and-forget
// ─────────────────────────────────────────────────
async function handleLogPresupuesto(msg) {
  try {
    const r = await logPresupuesto({
      channel: msg.channel,
      recipient: msg.recipient,
      clientName: msg.clientName,
      textoPresupuesto: msg.textoPresupuesto,
      totalPrecio: msg.totalPrecio,
      duracionTotal: msg.duracionTotal
    });
    sendResponse('presupuestoLoggeado', { ok: !!r?.ok, _id: r?._id });
  } catch (e) {
    // El widget NO depende de la respuesta. Log local y seguimos.
    console.warn(`${TAG} ⚠️ logPresupuesto excepción:`, e.message);
    sendResponse('presupuestoLoggeado', { ok: false, error: e?.message });
  }
}