// =====================================================
// KAMISUITE — Page Code: Tienda Productos
// =====================================================
// Página: Recepción | Tienda Productos
// Elemento: #widgetTienda (HtmlComponent)
// Backend: tiendaProductos.web.js v1.4
// =====================================================
// v1.3: + crearContactoTienda, contactPhone
// v1.4: + metodoPago, generarFacturaProducto, obtenerHistorialVentas
// =====================================================

import { listarProductos, registrarVenta, cargarContactosTienda, crearContactoTienda, generarFacturaProducto, obtenerHistorialVentas } from 'backend/tiendaProductos.web';

$w.onReady(function () {

  const widget = $w('#widgetTienda');

  widget.onMessage(async (event) => {
    const msg = event.data;
    if (!msg || typeof msg !== 'object') return;

    // ── Widget listo → cargar productos + contactos ──
    if (msg.type === 'ready') {
      cargarDatos();
    }

    // ── Solicitud de venta desde widget ──
    if (msg.type === 'sell') {
      await procesarVenta(msg.payload);
    }

    // ── Crear contacto nuevo ──
    if (msg.type === 'crearContacto') {
      await crearNuevoContacto(msg.payload);
    }

    // ── v1.4: Generar factura de producto ──
    if (msg.type === 'generateProductInvoice') {
      await generarFactura(msg.payload);
    }

    // ── v1.4: Cargar historial de ventas ──
    if (msg.type === 'loadHistory') {
      await cargarHistorial(msg.payload);
    }
  });

  // ── SIN CAMBIOS: crearNuevoContacto ──
  async function crearNuevoContacto(payload) {
    try {
      console.log('[TiendaProductos] Creando contacto:', payload.nombre, payload.apellido);
      const result = await crearContactoTienda(payload);

      if (!result.ok) {
        widget.postMessage({
          type: 'contactoError',
          payload: { error: result.error }
        });
        return;
      }

      widget.postMessage({
        type: 'contactoCreado',
        payload: result.cliente
      });

    } catch (e) {
      console.error('[TiendaProductos] Error creando contacto:', e);
      widget.postMessage({
        type: 'contactoError',
        payload: { error: e.message || String(e) }
      });
    }
  }

  // ── SIN CAMBIOS: cargarDatos ──
  async function cargarDatos() {
    try {
      const [prodResult, contResult] = await Promise.all([
        listarProductos(),
        cargarContactosTienda()
      ]);

      if (!prodResult.ok) {
        widget.postMessage({
          type: 'error',
          message: prodResult.error || 'Error cargando productos'
        });
        return;
      }

      widget.postMessage({
        type: 'data',
        payload: {
          productos: prodResult.productos,
          collections: prodResult.collections || [],
          clientes: contResult.ok ? contResult.clientes : []
        }
      });

    } catch (e) {
      console.error('[TiendaProductos] Error cargando:', e);
      widget.postMessage({
        type: 'error',
        message: e.message || String(e)
      });
    }
  }

  // ── v1.4: MODIFICADO — pasar metodoPago ──
  async function procesarVenta(payload) {
    try {
      console.log('[TiendaProductos] Venta:', payload.productName, 'x' + payload.quantity, '| cliente:', payload.contactId || 'N/A', '| pago:', payload.metodoPago || 'N/A');

      const result = await registrarVenta({
        productId: payload.productId,
        productName: payload.productName,
        price: payload.price,
        currency: payload.currency,
        quantity: payload.quantity,
        contactId: payload.contactId || '',
        contactName: payload.contactName || '',
        contactEmail: payload.contactEmail || '',
        contactPhone: payload.contactPhone || '',
        metodoPago: payload.metodoPago || ''
      });

      if (!result.ok) {
        widget.postMessage({
          type: 'sellError',
          payload: {
            productId: payload.productId,
            error: result.error
          }
        });
        return;
      }

      widget.postMessage({
        type: 'sold',
        payload: {
          productId: payload.productId,
          productName: payload.productName,
          orderId: result.orderId,
          tiempoVenta: result.tiempoVenta,
          metodoPago: result.metodoPago
        }
      });

    } catch (e) {
      console.error('[TiendaProductos] Error venta:', e);
      widget.postMessage({
        type: 'sellError',
        payload: {
          productId: payload.productId,
          error: e.message || String(e)
        }
      });
    }
  }

  // ── v1.4: NUEVO — generar factura producto ──
  async function generarFactura(payload) {
    try {
      console.log('[TiendaProductos] Generando factura:', payload.productName);

      const result = await generarFacturaProducto({
        contactId: payload.contactId || '',
        email: payload.contactEmail || '',
        contactName: payload.contactName || '',
        contactPhone: payload.contactPhone || '',
        productName: payload.productName || '',
        price: payload.price || 0,
        quantity: payload.quantity || 1,
        currency: payload.currency || 'EUR',
        metodoPago: payload.metodoPago || '',
        orderId: payload.orderId || ''
      });

      if (result?.ok) {
        widget.postMessage({
          type: 'invoiceReady',
          payload: {
            invoiceUrl: result.previewUrl || null,
            invoiceId: result.invoiceId || null,
            orderId: payload.orderId || null
          }
        });
      } else {
        widget.postMessage({
          type: 'invoiceError',
          message: result?.error || 'Error generando factura',
          orderId: payload.orderId || null
        });
      }

    } catch (e) {
      console.error('[TiendaProductos] Error factura:', e);
      widget.postMessage({
        type: 'invoiceError',
        message: e.message || String(e)
      });
    }
  }

  // ── v1.4: NUEVO — cargar historial ──
  async function cargarHistorial(payload) {
    try {
      console.log('[TiendaProductos] Cargando historial:', payload?.fechaDesde, '-', payload?.fechaHasta);

      const result = await obtenerHistorialVentas({
        fechaDesde: payload?.fechaDesde || '',
        fechaHasta: payload?.fechaHasta || '',
        limit: payload?.limit || 50
      });

      if (result?.ok) {
        widget.postMessage({
          type: 'historyData',
          payload: {
            ventas: result.ventas || [],
            total: result.total || 0
          }
        });
      } else {
        widget.postMessage({
          type: 'historyError',
          message: result?.error || 'Error cargando historial'
        });
      }

    } catch (e) {
      console.error('[TiendaProductos] Error historial:', e);
      widget.postMessage({
        type: 'historyError',
        message: e.message || String(e)
      });
    }
  }
});