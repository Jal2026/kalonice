// =====================================================
// KAMISUITE - Edición Servicios - Page Code
// =====================================================
// PÁGINA: Edición Servicios (admin)
// WIDGET: #htmlEdicionServicios (HTML embed con widget_edicion_servicios_v1.html)
//
// VERSIÓN: 1.6.0
// FECHA: 21 de junio de 2026
//
// CHANGELOG:
// v1.6.0 - Soporte para DUPLICAR servicio CMS-only (duplicateCatalog →
//          duplicarServicioCatalogo). Mismo patrón que deleteCatalog:
//          recibe { catalogId }, llama al backend y responde con
//          'catalogDuplicated' (ok) o 'catalogDuplicateError' (error).
//          Backend pareja: serviciosEdicionLogic v1.11.6.
// v1.5.1 - (sin cambios funcionales documentados)
// v1.5.0 - Soporte para eliminar servicios CMS-only (deleteCatalog)
// v1.4.0 - Soporte para crear servicio CMS-only y subir imagen
// v1.3.0 - Soporte para historial de cambios
// v1.2.0 - Soporte para vista GAP (registros CMS)
// =====================================================

import {
  listarServiciosCompleto,
  actualizarServicio,
  listarRegistrosGAP,
  actualizarRegistroGAP,
  listarHistorial,
  crearServicioCatalogo,
  uploadImagenServicio,
  eliminarServicioCMS,
  duplicarServicioCatalogo
} from 'backend/serviciosEdicionLogic.web';

const TAG = '[EdicionServicios]';

$w.onReady(async function () {
  console.log(`${TAG} ✅ Página cargada`);

  const widget = $w('#htmlEdicionServicios');

  // ═══════════════════════════════════════════════════
  // ESCUCHAR MENSAJES DEL WIDGET
  // ═══════════════════════════════════════════════════
  widget.onMessage(async (event) => {
    const msg = event.data;
    if (!msg || typeof msg !== 'object') return;

    console.log(`${TAG} 📩 Mensaje recibido:`, msg.type);

    // ─── Widget listo → cargar datos ───
    if (msg.type === 'ready') {
      await cargarDatos(widget);
    }

    // ─── Guardar cambios servicio ───
    if (msg.type === 'save') {
      await guardarCambios(widget, msg.payload);
    }

    // ─── Cargar registros GAP ───
    if (msg.type === 'loadGAP') {
      await cargarRegistrosGAP(widget);
    }

    // ─── Guardar cambios GAP ───
    if (msg.type === 'saveGAP') {
      await guardarCambiosGAP(widget, msg.payload);
    }

    // ─── Cargar historial ───
    if (msg.type === 'loadHistorial') {
      await cargarHistorial(widget);
    }

    // ─── Crear servicio CMS-only ───
    if (msg.type === 'createCatalog') {
      await crearServicio(widget, msg.payload);
    }

    // ─── Subir imagen servicio ───
    if (msg.type === 'uploadServiceImage') {
      await subirImagenServicio(widget, msg.payload);
    }

    // ─── Eliminar servicio CMS-only (v1.5.0) ───
    if (msg.type === 'deleteCatalog') {
      await eliminarServicio(widget, msg.payload);
    }

    // ─── Duplicar servicio CMS-only (v1.6.0) ───
    if (msg.type === 'duplicateCatalog') {
      await duplicarServicio(widget, msg.payload);
    }
  });
});

// ═══════════════════════════════════════════════════
// CARGAR DATOS
// ═══════════════════════════════════════════════════
async function cargarDatos(widget) {
  try {
    console.log(`${TAG} 📋 Cargando servicios...`);

    const result = await listarServiciosCompleto();

    if (result.success) {
      console.log(`${TAG} ✅ ${result.totalServicios} servicios cargados`);
      console.log(`${TAG}    - Con mapeo CMS: ${result.totalConMapeo}`);
      console.log(`${TAG}    - Con GAP: ${result.totalConGAP}`);

      widget.postMessage({
        type: 'data',
        payload: {
          servicios: result.servicios,
          staff: result.staff
        }
      });
    } else {
      console.error(`${TAG} ❌ Error:`, result.error);
      widget.postMessage({
        type: 'error',
        message: result.error
      });
    }

  } catch (error) {
    console.error(`${TAG} ❌ Error cargando:`, error);
    widget.postMessage({
      type: 'error',
      message: error.message
    });
  }
}

// ═══════════════════════════════════════════════════
// GUARDAR CAMBIOS SERVICIO
// ═══════════════════════════════════════════════════
async function guardarCambios(widget, payload) {
  try {
    console.log(`${TAG} 💾 Guardando cambios:`, payload);

    const result = await actualizarServicio(payload);

    if (result.success) {
      console.log(`${TAG} ✅ Servicio actualizado`);
      widget.postMessage({
        type: 'saved',
        payload: result
      });
    } else {
      console.error(`${TAG} ❌ Error:`, result.error);
      widget.postMessage({
        type: 'saveError',
        message: result.error
      });
    }

  } catch (error) {
    console.error(`${TAG} ❌ Error guardando:`, error);
    widget.postMessage({
      type: 'saveError',
      message: error.message
    });
  }
}

// ═══════════════════════════════════════════════════
// CARGAR REGISTROS GAP (CMS)
// ═══════════════════════════════════════════════════
async function cargarRegistrosGAP(widget) {
  try {
    console.log(`${TAG} 📋 Cargando registros GAP...`);

    const result = await listarRegistrosGAP();

    if (result.success) {
      console.log(`${TAG} ✅ ${result.total} registros GAP cargados`);

      widget.postMessage({
        type: 'gapData',
        payload: result
      });
    } else {
      console.error(`${TAG} ❌ Error:`, result.error);
      widget.postMessage({
        type: 'gapData',
        payload: { success: false, error: result.error }
      });
    }

  } catch (error) {
    console.error(`${TAG} ❌ Error cargando GAP:`, error);
    widget.postMessage({
      type: 'gapData',
      payload: { success: false, error: error.message }
    });
  }
}

// ═══════════════════════════════════════════════════
// GUARDAR CAMBIOS GAP (CMS)
// ═══════════════════════════════════════════════════
async function guardarCambiosGAP(widget, payload) {
  try {
    console.log(`${TAG} 💾 Guardando cambios GAP:`, payload);

    const result = await actualizarRegistroGAP(payload);

    if (result.success) {
      console.log(`${TAG} ✅ Registro GAP actualizado`);
      widget.postMessage({
        type: 'gapSaved',
        payload: result
      });
    } else {
      console.error(`${TAG} ❌ Error:`, result.error);
      widget.postMessage({
        type: 'gapSaved',
        payload: { success: false, error: result.error }
      });
    }

  } catch (error) {
    console.error(`${TAG} ❌ Error guardando GAP:`, error);
    widget.postMessage({
      type: 'gapSaved',
      payload: { success: false, error: error.message }
    });
  }
}

// ═══════════════════════════════════════════════════
// CARGAR HISTORIAL DE CAMBIOS
// ═══════════════════════════════════════════════════
async function cargarHistorial(widget) {
  try {
    console.log(`${TAG} 📋 Cargando historial...`);

    const result = await listarHistorial(50);

    if (result.success) {
      console.log(`${TAG} ✅ ${result.total} cambios cargados`);

      widget.postMessage({
        type: 'historialData',
        payload: result
      });
    } else {
      console.error(`${TAG} ❌ Error:`, result.error);
      widget.postMessage({
        type: 'historialData',
        payload: { success: false, error: result.error }
      });
    }

  } catch (error) {
    console.error(`${TAG} ❌ Error cargando historial:`, error);
    widget.postMessage({
      type: 'historialData',
      payload: { success: false, error: error.message }
    });
  }
}

// ═══════════════════════════════════════════════════
// CREAR SERVICIO CMS-ONLY (ServiceCatalog)
// ═══════════════════════════════════════════════════
async function crearServicio(widget, payload) {
  try {
    console.log(`${TAG} 🆕 Creando servicio CMS:`, payload.label);

    const result = await crearServicioCatalogo(payload);

    if (result.success) {
      console.log(`${TAG} ✅ Servicio creado: ${result.servicio._id}`);
      widget.postMessage({
        type: 'catalogCreated',
        payload: result
      });
    } else {
      console.error(`${TAG} ❌ Error:`, result.error);
      widget.postMessage({
        type: 'catalogCreateError',
        message: result.error
      });
    }

  } catch (error) {
    console.error(`${TAG} ❌ Error creando servicio:`, error);
    widget.postMessage({
      type: 'catalogCreateError',
      message: error.message
    });
  }
}

// ═══════════════════════════════════════════════════
// SUBIR IMAGEN SERVICIO (ServiceCatalog)
// ═══════════════════════════════════════════════════
async function subirImagenServicio(widget, payload) {
  try {
    console.log(`${TAG} 📸 Subiendo imagen servicio:`, payload.catalogId);

    const result = await uploadImagenServicio(payload);

    if (result.ok) {
      console.log(`${TAG} ✅ Imagen subida`);
      widget.postMessage({
        type: 'serviceImageUploaded',
        payload: result
      });
    } else {
      console.error(`${TAG} ❌ Error:`, result.error);
      widget.postMessage({
        type: 'serviceImageError',
        message: result.error
      });
    }

  } catch (error) {
    console.error(`${TAG} ❌ Error subiendo imagen:`, error);
    widget.postMessage({
      type: 'serviceImageError',
      message: error.message
    });
  }
}

// ═══════════════════════════════════════════════════
// ELIMINAR SERVICIO CMS-ONLY (v1.5.0)
// ═══════════════════════════════════════════════════
async function eliminarServicio(widget, payload) {
  try {
    console.log(`${TAG} 🗑️ Eliminando servicio CMS:`, payload.catalogId);

    const result = await eliminarServicioCMS({ catalogId: payload.catalogId });

    if (result.success) {
      console.log(`${TAG} ✅ Servicio eliminado: ${result.nombre}`);
      widget.postMessage({
        type: 'catalogDeleted',
        payload: result
      });
    } else {
      console.error(`${TAG} ❌ Error:`, result.error);
      widget.postMessage({
        type: 'catalogDeleteError',
        message: result.error
      });
    }

  } catch (error) {
    console.error(`${TAG} ❌ Error eliminando servicio:`, error);
    widget.postMessage({
      type: 'catalogDeleteError',
      message: error.message
    });
  }
}

// ═══════════════════════════════════════════════════
// DUPLICAR SERVICIO CMS-ONLY (v1.6.0)
// ═══════════════════════════════════════════════════
async function duplicarServicio(widget, payload) {
  try {
    console.log(`${TAG} ⧉ Duplicando servicio CMS:`, payload.catalogId);

    const result = await duplicarServicioCatalogo({ catalogId: payload.catalogId });

    if (result.success) {
      console.log(`${TAG} ✅ Servicio duplicado: ${result.servicio && result.servicio.label}`);
      widget.postMessage({
        type: 'catalogDuplicated',
        payload: result
      });
    } else {
      console.error(`${TAG} ❌ Error:`, result.error);
      widget.postMessage({
        type: 'catalogDuplicateError',
        message: result.error
      });
    }

  } catch (error) {
    console.error(`${TAG} ❌ Error duplicando servicio:`, error);
    widget.postMessage({
      type: 'catalogDuplicateError',
      message: error.message
    });
  }
}