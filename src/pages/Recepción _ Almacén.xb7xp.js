// =====================================================
// KAMISUITE — Page Code: Gestión de Almacén
// ARCHIVO: pagecode_almacen.js
// VERSION: 2.1.0
// FECHA:   2 de agosto de 2026
// Página:  Recepción | Almacén
// Elemento HTML: #widgetAlmacen  (HtmlComponent)
// =====================================================
//
// SUSTITUYE al page code v1.0.0, que puenteaba almacenLogic.web.js
// (modelo viejo: productos leídos de Wix Stores por prefijo de
// categoría "USO SALON-" y datos en KamisuiteWarehouse). El modelo
// nuevo es CMS-first: los productos de uso en salón viven en
// KamisuiteStock y el stock se mueve solo por movimientos firmados.
//
// BACKENDS QUE CONSUME
//   · stockLogic.web.js v1.0.0          — todo el almacén
//   · recepcionAccessLogic.web.js v1.0.4 — capa de login por PIN
//     (NO SE TOCA: se consume tal cual, mismas funciones que usa
//     Recepción PRO). Gobernada por SalonConfig.usersActivation:
//     si está en false, se entra directo y los movimientos quedan
//     sin firma. Multi-tenant sin condicionales por salón.
//
// MENSAJES QUE ENVÍA EL WIDGET (event.data.type)
//   ready              → arranque: login + datos
//   validate-pin       → { staffId, pin }
//   recargar           → releer stock + movimientos recientes
//   guardar-producto   → alta o edición de ficha
//   eliminar-producto  → { productId }
//   subir-imagen       → { productId, base64Data, fileName, mimeType }
//   movimiento         → entrada / salida / apertura / ajuste
//   papelera           → { productId, staffId, staffName }
//   historico          → { productId }
//   cargar-tienda      → productos de Wix Stores para el traspaso
//   traspasar          → { storesProductId, cantidad, ... }
//   exportar-excel     → pedir el .xlsx del almacén
//
// MENSAJES QUE ENVIAMOS AL WIDGET
//   login-config, pin-result, data, producto-guardado,
//   producto-eliminado, imagen-ok, movimiento-ok, papelera-ok,
//   historico, tienda, traspaso-ok, excel, error
//
// CHANGELOG
// v2.1.0 (2 ago 2026): + handler exportar-excel → stockLogic.exportarExcel.
//         El fichero viaja en base64 y lo descarga el widget. Mismo
//         contrato que testCheckout.generarExcel.
// v2.0.0 (2 ago 2026): reescrito sobre stockLogic + capa de login PIN.
// =====================================================

import {
  listarStock,
  guardarProducto,
  eliminarProducto,
  uploadImagenProducto,
  registrarMovimiento,
  tirarPapelera,
  historicoProducto,
  listarProductosTienda,
  traspasarDesdeTienda,
  movimientosRecientes,
  exportarExcel
} from 'backend/stockLogic.web';

import {
  getUsersActivation,
  getStaffLogin,
  validateLoginPin
} from 'backend/recepcionAccessLogic.web';

const VERSION = '2.1.0';
const TAG = `[AlmacenPage][${VERSION}]`;

$w.onReady(function () {
  const widget = $w('#widgetAlmacen');

  widget.onMessage(async (event) => {
    const msg = event.data;
    if (!msg || typeof msg !== 'object') return;

    console.log(`${TAG} ← widget: ${msg.type}`);

    switch (msg.type) {
      case 'ready':             await arranque(); break;
      case 'validate-pin':      await validarPin(msg.payload); break;
      case 'recargar':          await cargarDatos(); break;
      case 'guardar-producto':  await guardarHandler(msg.payload); break;
      case 'eliminar-producto': await eliminarHandler(msg.payload); break;
      case 'subir-imagen':      await imagenHandler(msg.payload); break;
      case 'movimiento':        await movimientoHandler(msg.payload); break;
      case 'papelera':          await papeleraHandler(msg.payload); break;
      case 'historico':         await historicoHandler(msg.payload); break;
      case 'cargar-tienda':     await tiendaHandler(); break;
      case 'traspasar':         await traspasoHandler(msg.payload); break;
      case 'exportar-excel':    await excelHandler(); break;
      default: break;
    }
  });

  // ─────────────────────────────────────────────────────
  // ARRANQUE — capa de login + primera carga
  // ─────────────────────────────────────────────────────
  async function arranque() {
    let usersActivation = false;
    let staff = [];

    try {
      const act = await getUsersActivation();
      usersActivation = act?.usersActivation === true;

      if (usersActivation) {
        const st = await getStaffLogin();
        staff = (st?.success && Array.isArray(st.staff)) ? st.staff : [];
      }
    } catch (e) {
      // Un fallo de la capa opcional de login NUNCA bloquea el almacén.
      console.error(`${TAG} ⚠️ Capa de login no disponible:`, e.message);
      usersActivation = false;
    }

    widget.postMessage({
      type: 'login-config',
      payload: { usersActivation, staff, version: VERSION }
    });

    await cargarDatos();
  }

  async function validarPin(payload) {
    try {
      const { staffId, pin } = payload || {};
      const res = await validateLoginPin(staffId, pin);

      if (!res?.success) {
        widget.postMessage({
          type: 'pin-result',
          payload: { ok: false, error: res?.error || 'No se pudo validar el PIN', needsSetup: res?.needsSetup === true }
        });
        return;
      }
      if (res.valid !== true) {
        widget.postMessage({ type: 'pin-result', payload: { ok: false, error: 'PIN incorrecto' } });
        return;
      }
      widget.postMessage({ type: 'pin-result', payload: { ok: true, staff: res.staff } });
    } catch (e) {
      console.error(`${TAG} ❌ validarPin:`, e);
      widget.postMessage({ type: 'pin-result', payload: { ok: false, error: e.message || String(e) } });
    }
  }

  // ─────────────────────────────────────────────────────
  // CARGA DE DATOS
  // ─────────────────────────────────────────────────────
  async function cargarDatos() {
    try {
      const [stockRes, movRes] = await Promise.all([
        listarStock(),
        movimientosRecientes({ limite: 40 })
      ]);

      if (!stockRes || !stockRes.ok) {
        widget.postMessage({ type: 'error', message: stockRes?.error || 'No se pudo cargar el almacén' });
        return;
      }

      widget.postMessage({
        type: 'data',
        payload: {
          productos:  stockRes.productos  || [],
          brands:     stockRes.brands     || [],
          categories: stockRes.categories || [],
          suppliers:  stockRes.suppliers  || [],
          units:      stockRes.units      || [],
          resumen:    stockRes.resumen    || {},
          movimientos: (movRes && movRes.ok) ? (movRes.movimientos || []) : []
        }
      });
    } catch (e) {
      console.error(`${TAG} ❌ cargarDatos:`, e);
      widget.postMessage({ type: 'error', message: e.message || String(e) });
    }
  }

  // ─────────────────────────────────────────────────────
  // CRUD DE FICHA
  // ─────────────────────────────────────────────────────
  async function guardarHandler(payload) {
    try {
      const res = await guardarProducto(payload || {});
      if (!res || !res.ok) {
        widget.postMessage({ type: 'error', message: res?.error || 'Error guardando el producto' });
        return;
      }
      widget.postMessage({
        type: 'producto-guardado',
        payload: { action: res.action, producto: res.producto, warn: res.warn || '' }
      });
      await cargarDatos();
    } catch (e) {
      console.error(`${TAG} ❌ guardarHandler:`, e);
      widget.postMessage({ type: 'error', message: e.message || String(e) });
    }
  }

  async function eliminarHandler(payload) {
    try {
      const res = await eliminarProducto(payload || {});
      if (!res || !res.ok) {
        widget.postMessage({ type: 'error', message: res?.error || 'Error eliminando el producto' });
        return;
      }
      widget.postMessage({ type: 'producto-eliminado', payload: { productId: res.productId } });
      await cargarDatos();
    } catch (e) {
      console.error(`${TAG} ❌ eliminarHandler:`, e);
      widget.postMessage({ type: 'error', message: e.message || String(e) });
    }
  }

  async function imagenHandler(payload) {
    try {
      const res = await uploadImagenProducto(payload || {});
      if (!res || !res.ok) {
        widget.postMessage({ type: 'error', message: res?.error || 'Error subiendo la imagen' });
        return;
      }
      widget.postMessage({
        type: 'imagen-ok',
        payload: { productId: payload?.productId, publicUrl: res.publicUrl, fileUrl: res.fileUrl }
      });
      await cargarDatos();
    } catch (e) {
      console.error(`${TAG} ❌ imagenHandler:`, e);
      widget.postMessage({ type: 'error', message: e.message || String(e) });
    }
  }

  // ─────────────────────────────────────────────────────
  // MOVIMIENTOS
  // ─────────────────────────────────────────────────────
  async function movimientoHandler(payload) {
    try {
      const res = await registrarMovimiento(payload || {});
      if (!res || !res.ok) {
        widget.postMessage({ type: 'error', message: res?.error || 'Error registrando el movimiento' });
        return;
      }
      widget.postMessage({ type: 'movimiento-ok', payload: res });
      await cargarDatos();
    } catch (e) {
      console.error(`${TAG} ❌ movimientoHandler:`, e);
      widget.postMessage({ type: 'error', message: e.message || String(e) });
    }
  }

  // La papelera NO recarga toda la lista: el widget actualiza su estado
  // local con los contadores que devuelve el backend. Es la acción más
  // repetida del día y tiene que ser instantánea.
  async function papeleraHandler(payload) {
    try {
      const res = await tirarPapelera(payload || {});
      if (!res || !res.ok) {
        widget.postMessage({
          type: 'papelera-ok',
          payload: { ok: false, productId: payload?.productId, error: res?.error || 'Error al descontar' }
        });
        return;
      }
      widget.postMessage({ type: 'papelera-ok', payload: { ...res, ok: true } });
    } catch (e) {
      console.error(`${TAG} ❌ papeleraHandler:`, e);
      widget.postMessage({
        type: 'papelera-ok',
        payload: { ok: false, productId: payload?.productId, error: e.message || String(e) }
      });
    }
  }

  async function historicoHandler(payload) {
    try {
      const res = await historicoProducto(payload || {});
      if (!res || !res.ok) {
        widget.postMessage({ type: 'error', message: res?.error || 'Error leyendo el histórico' });
        return;
      }
      widget.postMessage({
        type: 'historico',
        payload: { productId: res.productId, movimientos: res.movimientos || [] }
      });
    } catch (e) {
      console.error(`${TAG} ❌ historicoHandler:`, e);
      widget.postMessage({ type: 'error', message: e.message || String(e) });
    }
  }

  // ─────────────────────────────────────────────────────
  // TRASPASO DESDE LA TIENDA
  // ─────────────────────────────────────────────────────
  async function tiendaHandler() {
    try {
      const res = await listarProductosTienda();
      if (!res || !res.ok) {
        widget.postMessage({ type: 'error', message: res?.error || 'Error leyendo la tienda' });
        return;
      }
      widget.postMessage({ type: 'tienda', payload: { productos: res.productos || [] } });
    } catch (e) {
      console.error(`${TAG} ❌ tiendaHandler:`, e);
      widget.postMessage({ type: 'error', message: e.message || String(e) });
    }
  }

  async function excelHandler() {
    try {
      const res = await exportarExcel();
      if (!res || !res.ok) {
        widget.postMessage({ type: 'error', message: res?.error || 'Error generando el Excel' });
        return;
      }
      widget.postMessage({
        type: 'excel',
        payload: {
          archivo: res.archivo,
          nombreArchivo: res.nombreArchivo,
          mimeType: res.mimeType,
          totalRegistros: res.totalRegistros
        }
      });
    } catch (e) {
      console.error(`${TAG} ❌ excelHandler:`, e);
      widget.postMessage({ type: 'error', message: e.message || String(e) });
    }
  }

  async function traspasoHandler(payload) {
    try {
      const res = await traspasarDesdeTienda(payload || {});
      if (!res || !res.ok) {
        widget.postMessage({ type: 'error', message: res?.error || 'Error en el traspaso' });
        return;
      }
      widget.postMessage({ type: 'traspaso-ok', payload: res });

      // Wix tarda ~1s en propagar el cambio de inventario de Stores.
      // Mismo margen anti-lag que el editor de productos (v3.4).
      await new Promise(r => setTimeout(r, 1200));
      await cargarDatos();
      await tiendaHandler();
    } catch (e) {
      console.error(`${TAG} ❌ traspasoHandler:`, e);
      widget.postMessage({ type: 'error', message: e.message || String(e) });
    }
  }
});
