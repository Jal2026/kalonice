// =====================================================
// KAMISUITE — Page Code: Tienda Productos
// =====================================================
// Página: Recepción | Tienda Productos (Edición)
// Elemento: #widgetTienda (HtmlComponent)
// =====================================================
// v1.4: + metodoPago, generarFacturaProducto, obtenerHistorialVentas
// v2.0: + edición productos (tiendaEdicionLogic.web.js)
// v2.1: + multi-imagen (agregarImagenesProducto, eliminarImagenesProducto)
// =====================================================

// ── Imports VENTA (tiendaProductos.web.js — SIN CAMBIOS) ──
import { registrarVenta, cargarContactosTienda, crearContactoTienda, generarFacturaProducto, obtenerHistorialVentas } from 'backend/tiendaProductos.web';

// ── Imports EDICIÓN (tiendaEdicionLogic.web.js) ──
// v2.1: + agregarImagenesProducto, eliminarImagenesProducto
import { listarProductosParaEdicion, actualizarProducto, agregarImagenesProducto, eliminarImagenesProducto, crearProductoNuevo, eliminarProducto, crearCategoriaNueva, cambiarCategoriasProducto } from 'backend/tiendaEdicionLogic.web';

$w.onReady(function () {

  const widget = $w('#widgetTienda');

  widget.onMessage(async (event) => {
    const msg = event.data;
    if (!msg || typeof msg !== 'object') return;

    // ══════════════════════════════════════════════════
    // HANDLERS EXISTENTES (v1.4 — SIN CAMBIOS)
    // ══════════════════════════════════════════════════

    if (msg.type === 'ready') { cargarDatos(); }
    if (msg.type === 'sell') { await procesarVenta(msg.payload); }
    if (msg.type === 'crearContacto') { await crearNuevoContacto(msg.payload); }
    if (msg.type === 'generateProductInvoice') { await generarFactura(msg.payload); }
    if (msg.type === 'loadHistory') { await cargarHistorial(msg.payload); }

    // ══════════════════════════════════════════════════
    // HANDLERS EDICIÓN (v2.0 + v2.1)
    // ══════════════════════════════════════════════════

    if (msg.type === 'guardarProducto') { await guardarProductoHandler(msg.payload); }
    if (msg.type === 'crearProducto') { await crearProductoHandler(msg.payload); }
    if (msg.type === 'eliminarProducto') { await eliminarProductoHandler(msg.payload); }
    if (msg.type === 'crearCategoria') { await crearCategoriaHandler(msg.payload); }
  });

  // ══════════════════════════════════════════════════
  // FUNCIONES EXISTENTES (v1.4 — SIN CAMBIOS)
  // ══════════════════════════════════════════════════

  async function crearNuevoContacto(payload) {
    try {
      const result = await crearContactoTienda(payload);
      if (!result.ok) { widget.postMessage({ type: 'contactoError', payload: { error: result.error } }); return; }
      widget.postMessage({ type: 'contactoCreado', payload: result.cliente });
    } catch (e) {
      widget.postMessage({ type: 'contactoError', payload: { error: e.message || String(e) } });
    }
  }

  async function cargarDatos() {
    try {
      const [prodResult, contResult] = await Promise.all([
        listarProductosParaEdicion(),
        cargarContactosTienda()
      ]);
      if (!prodResult.ok) { widget.postMessage({ type: 'error', message: prodResult.error || 'Error cargando productos' }); return; }
      widget.postMessage({
        type: 'data',
        payload: {
          productos: prodResult.productos,
          collections: prodResult.collections || [],
          clientes: contResult.ok ? contResult.clientes : []
        }
      });
    } catch (e) {
      widget.postMessage({ type: 'error', message: e.message || String(e) });
    }
  }

  async function procesarVenta(payload) {
    try {
      const result = await registrarVenta({
        productId: payload.productId, productName: payload.productName,
        price: payload.price, currency: payload.currency,
        quantity: payload.quantity, contactId: payload.contactId || '',
        contactName: payload.contactName || '', contactEmail: payload.contactEmail || '',
        contactPhone: payload.contactPhone || '', metodoPago: payload.metodoPago || ''
      });
      if (!result.ok) { widget.postMessage({ type: 'sellError', payload: { productId: payload.productId, error: result.error } }); return; }
      widget.postMessage({
        type: 'sold',
        payload: { productId: payload.productId, productName: payload.productName, orderId: result.orderId, tiempoVenta: result.tiempoVenta, metodoPago: result.metodoPago }
      });
    } catch (e) {
      widget.postMessage({ type: 'sellError', payload: { productId: payload.productId, error: e.message || String(e) } });
    }
  }

  async function generarFactura(payload) {
    try {
      const result = await generarFacturaProducto({
        contactId: payload.contactId || '', email: payload.contactEmail || '',
        contactName: payload.contactName || '', contactPhone: payload.contactPhone || '',
        productName: payload.productName || '', price: payload.price || 0,
        quantity: payload.quantity || 1, currency: payload.currency || 'EUR',
        metodoPago: payload.metodoPago || '', orderId: payload.orderId || ''
      });
      if (result?.ok) {
        widget.postMessage({ type: 'invoiceReady', payload: { invoiceUrl: result.previewUrl || null, invoiceId: result.invoiceId || null, orderId: payload.orderId || null } });
      } else {
        widget.postMessage({ type: 'invoiceError', message: result?.error || 'Error generando factura', orderId: payload.orderId || null });
      }
    } catch (e) {
      widget.postMessage({ type: 'invoiceError', message: e.message || String(e) });
    }
  }

  async function cargarHistorial(payload) {
    try {
      const result = await obtenerHistorialVentas({ fechaDesde: payload?.fechaDesde || '', fechaHasta: payload?.fechaHasta || '', limit: payload?.limit || 50 });
      if (result?.ok) { widget.postMessage({ type: 'historyData', payload: { ventas: result.ventas || [], total: result.total || 0 } }); }
      else { widget.postMessage({ type: 'historyError', message: result?.error || 'Error cargando historial' }); }
    } catch (e) {
      widget.postMessage({ type: 'historyError', message: e.message || String(e) });
    }
  }

  // ══════════════════════════════════════════════════
  // FUNCIONES EDICIÓN (v2.0 → v2.1)
  // ══════════════════════════════════════════════════

  // ── Guardar producto existente ──
  // v2.1: imagenes: { toRemove: [src...], toAdd: [{base64, fileName}...] }
  async function guardarProductoHandler(payload) {
    try {
      const { productId, campos, imagenes, categorias } = payload;
      console.log(`[TiendaEdicion] Guardando producto: ${productId}`);

      const resultados = { campos: null, imgRemove: null, imgAdd: null, categorias: null };

      // 1. Eliminar imágenes marcadas
      if (imagenes?.toRemove?.length) {
        console.log(`[TiendaEdicion] Eliminando ${imagenes.toRemove.length} imagen(es)`);
        resultados.imgRemove = await eliminarImagenesProducto(productId, imagenes.toRemove);
        if (!resultados.imgRemove.ok) {
          console.warn(`[TiendaEdicion] ⚠️ Eliminar imágenes falló: ${resultados.imgRemove.error}`);
        }
      }

      // 2. Subir imágenes nuevas
      if (imagenes?.toAdd?.length) {
        console.log(`[TiendaEdicion] Subiendo ${imagenes.toAdd.length} imagen(es)`);
        resultados.imgAdd = await agregarImagenesProducto(productId, imagenes.toAdd);
        if (!resultados.imgAdd.ok) {
          console.warn(`[TiendaEdicion] ⚠️ Subir imágenes falló: ${resultados.imgAdd.error}`);
        }
      }

      // 3. Actualizar campos
      if (campos && Object.keys(campos).length > 0) {
        resultados.campos = await actualizarProducto(productId, campos);
        if (!resultados.campos.ok) {
          console.warn(`[TiendaEdicion] ⚠️ Campos falló: ${resultados.campos.error}`);
        }
      }

      // 4. Cambiar categorías
      if (categorias && (categorias.addIds?.length || categorias.removeIds?.length)) {
        resultados.categorias = await cambiarCategoriasProducto(productId, categorias.addIds || [], categorias.removeIds || []);
        if (!resultados.categorias.ok) {
          console.warn(`[TiendaEdicion] ⚠️ Categorías falló: ${resultados.categorias.error}`);
        }
      }

      // 5. Resultado global
      const hayErrores = (resultados.campos && !resultados.campos.ok) ||
                         (resultados.imgRemove && !resultados.imgRemove.ok) ||
                         (resultados.imgAdd && !resultados.imgAdd.ok) ||
                         (resultados.categorias && !resultados.categorias.ok);

      if (hayErrores) {
        const errMsgs = [];
        if (resultados.campos && !resultados.campos.ok) errMsgs.push('Campos: ' + resultados.campos.error);
        if (resultados.imgRemove && !resultados.imgRemove.ok) errMsgs.push('Eliminar img: ' + resultados.imgRemove.error);
        if (resultados.imgAdd && !resultados.imgAdd.ok) errMsgs.push('Subir img: ' + resultados.imgAdd.error);
        if (resultados.categorias && !resultados.categorias.ok) errMsgs.push('Categorías: ' + (resultados.categorias.errores || resultados.categorias.error));
        widget.postMessage({ type: 'productoGuardadoParcial', payload: { productId, errores: errMsgs } });
      } else {
        widget.postMessage({ type: 'productoGuardado', payload: { productId } });
      }

      await cargarDatos();

    } catch (e) {
      console.error('[TiendaEdicion] Error guardando producto:', e);
      widget.postMessage({ type: 'errorEdicion', payload: { productId: payload?.productId, error: e.message || String(e) } });
    }
  }

  // ── Crear producto nuevo ──
  // v2.1: imagenes.toAdd para múltiples fotos
  async function crearProductoHandler(payload) {
    try {
      const { campos, imagenes, categorias } = payload;
      console.log(`[TiendaEdicion] Creando producto: ${campos?.name}`);

      const createResult = await crearProductoNuevo(campos);
      if (!createResult.ok) {
        widget.postMessage({ type: 'errorEdicion', payload: { error: 'Error creando producto: ' + createResult.error } });
        return;
      }

      const newProductId = createResult.productId;

      // Subir imágenes (si hay)
      if (imagenes?.toAdd?.length && newProductId) {
        try {
          await agregarImagenesProducto(newProductId, imagenes.toAdd);
        } catch (imgErr) {
          console.warn(`[TiendaEdicion] ⚠️ Imagen del nuevo producto falló:`, imgErr.message);
        }
      }

      // Asignar a categorías (si hay)
      if (categorias && categorias.length > 0 && newProductId) {
        try {
          await cambiarCategoriasProducto(newProductId, categorias, []);
        } catch (catErr) {
          console.warn(`[TiendaEdicion] ⚠️ Categorías del nuevo producto falló:`, catErr.message);
        }
      }

      widget.postMessage({ type: 'productoCreado', payload: { productId: newProductId, name: campos?.name } });
      await cargarDatos();

    } catch (e) {
      console.error('[TiendaEdicion] Error creando producto:', e);
      widget.postMessage({ type: 'errorEdicion', payload: { error: e.message || String(e) } });
    }
  }

  // ── Eliminar producto (sin cambios) ──
  async function eliminarProductoHandler(payload) {
    try {
      const { productId } = payload;
      const result = await eliminarProducto(productId);
      if (!result.ok) { widget.postMessage({ type: 'errorEdicion', payload: { productId, error: 'Error eliminando: ' + result.error } }); return; }
      widget.postMessage({ type: 'productoEliminado', payload: { productId } });
      await cargarDatos();
    } catch (e) {
      widget.postMessage({ type: 'errorEdicion', payload: { productId: payload?.productId, error: e.message || String(e) } });
    }
  }

  // ── Crear categoría (sin cambios) ──
  async function crearCategoriaHandler(payload) {
    try {
      const { nombre } = payload;
      const result = await crearCategoriaNueva(nombre);
      if (!result.ok) { widget.postMessage({ type: 'errorEdicion', payload: { error: 'Error creando categoría: ' + result.error } }); return; }
      widget.postMessage({ type: 'categoriaCreada', payload: { id: result.collectionId, name: result.name, yaExistia: result.yaExistia || false } });
      await cargarDatos();
    } catch (e) {
      widget.postMessage({ type: 'errorEdicion', payload: { error: e.message || String(e) } });
    }
  }
});