// =====================================================
// KAMISUITE — Page Code: Almacén
// =====================================================
// Página: Recepción | Almacén
// Elemento HTML: #widgetAlmacen  (HtmlComponent)
//
// Puente entre el widget HTML y el backend almacenLogic.web.js.
// El widget pide datos y manda acciones por postMessage; aquí se
// reciben, se llaman las funciones del backend y se devuelve el
// resultado al widget.
//
// MENSAJES QUE ENVÍA EL WIDGET (event.data.type):
//   'ready'            → el widget está listo; le mandamos los datos
//   'recargar'         → volver a cargar la lista
//   'guardar-ficha'    → guardar coste + stock mínimo de un producto
//   'descontar'        → cubito: bajar N unidades + registrar consumo
//   'ver-historico'    → pedir el histórico de consumo de un producto
//
// MENSAJES QUE ENVIAMOS AL WIDGET:
//   'data'             → { productos, categorias }
//   'ficha-guardada'   → ok de guardar ficha
//   'consumo-ok'       → ok de descontar
//   'historico'        → { productId, movimientos }
//   'error'            → mensaje de error
//
// CHANGELOG
// v1.0.0 (25 Jun 2026): primera versión del page code de Almacén.
// =====================================================

import {
  listarProductosAlmacen,
  guardarFichaAlmacen,
  descontarConsumo,
  historicoConsumo
} from 'backend/almacenLogic.web';

const VERSION = '1.0.0';

$w.onReady(function () {
  const widget = $w('#widgetAlmacen');

  // Cuando el widget envía un mensaje
  widget.onMessage((event) => {
    const msg = event.data;
    if (!msg || typeof msg !== 'object') return;

    switch (msg.type) {
      case 'ready':
        cargarDatos();
        break;
      case 'recargar':
        cargarDatos();
        break;
      case 'guardar-ficha':
        guardarFichaHandler(msg.payload);
        break;
      case 'descontar':
        descontarHandler(msg.payload);
        break;
      case 'ver-historico':
        historicoHandler(msg.payload);
        break;
      default:
        // ignorar mensajes desconocidos
        break;
    }
  });

  // Carga inicial (por si el widget ya estaba listo antes del onReady).
  // El widget reenvía 'ready' en bucle hasta recibir 'data', así que
  // esta llamada y la del 'ready' convergen sin duplicar trabajo real.
  cargarDatos();

  // ---------------------------------------------------
  async function cargarDatos() {
    try {
      const res = await listarProductosAlmacen();
      if (!res || !res.ok) {
        widget.postMessage({ type: 'error', message: res?.error || 'No se pudieron cargar los productos' });
        return;
      }
      widget.postMessage({
        type: 'data',
        payload: {
          productos: res.productos || [],
          categorias: res.categorias || [],
          total: res.total || 0
        }
      });
    } catch (e) {
      console.error('[Almacen] cargarDatos error:', e);
      widget.postMessage({ type: 'error', message: e.message || String(e) });
    }
  }

  async function guardarFichaHandler(payload) {
    try {
      const res = await guardarFichaAlmacen(payload || {});
      if (!res || !res.ok) {
        widget.postMessage({ type: 'error', message: res?.error || 'Error guardando ficha' });
        return;
      }
      widget.postMessage({ type: 'ficha-guardada', payload: { productId: payload?.productId } });
      // Releer para reflejar el cambio
      await cargarDatos();
    } catch (e) {
      console.error('[Almacen] guardarFicha error:', e);
      widget.postMessage({ type: 'error', message: e.message || String(e) });
    }
  }

  async function descontarHandler(payload) {
    try {
      const res = await descontarConsumo(payload || {});
      if (!res || !res.ok) {
        widget.postMessage({ type: 'error', message: res?.error || 'Error descontando' });
        return;
      }
      widget.postMessage({
        type: 'consumo-ok',
        payload: { productId: payload?.productId, unidades: res.unidades }
      });
      // Wix tarda ~1s en propagar el cambio de stock; damos margen.
      await new Promise(r => setTimeout(r, 1200));
      await cargarDatos();
    } catch (e) {
      console.error('[Almacen] descontar error:', e);
      widget.postMessage({ type: 'error', message: e.message || String(e) });
    }
  }

  async function historicoHandler(payload) {
    try {
      const res = await historicoConsumo(payload?.productId, payload?.limite);
      if (!res || !res.ok) {
        widget.postMessage({ type: 'error', message: res?.error || 'Error leyendo histórico' });
        return;
      }
      widget.postMessage({
        type: 'historico',
        payload: { productId: res.productId, movimientos: res.movimientos || [] }
      });
    } catch (e) {
      console.error('[Almacen] historico error:', e);
      widget.postMessage({ type: 'error', message: e.message || String(e) });
    }
  }
});