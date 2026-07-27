// =====================================================
// KAMISUITE - Edición Categorías (Tour de Servicios) - Page Code
// =====================================================
// PÁGINA: Edición Categorías (admin)
// WIDGET: #htmlEdicionCategorias (HTML embed con editor_categorias.html)
//
// VERSIÓN: 1.1.0
// FECHA: 8 de julio de 2026
//
// Edita el CMS HairSalonServices (primer nivel de Tour de Servicios).
//
// CHANGELOG:
//
// v1.1.0 (8-jul-2026) — CRUD COMPLETO. Nuevos mensajes del widget:
//   · createCategoria    → crea una categoría nueva (alta)
//   · duplicateCategoria → clona una existente con nuevo título
//   · deleteCategoria    → borrado hard con confirmación previa (widget)
//
//   Las respuestas al widget se emiten con nombres simétricos:
//   · categoriaCreated / categoriaCreateError
//   · categoriaDuplicated / categoriaDuplicateError
//   · categoriaDeleted / categoriaDeleteError
//
// v1.0.0 (21-jun-2026) — Versión inicial. Solo edición y toggle.
//
// Mensajes del widget (contrato completo v1.1.0):
//   ready                → cargar categorías
//   saveCategoria        → actualizar textos + groupCatalog + orden
//   toggleCategoria      → activo/inactivo
//   uploadCategoriaImage → subir imagen
//   createCategoria      → v1.1.0 · alta nueva
//   duplicateCategoria   → v1.1.0 · duplicar existente
//   deleteCategoria      → v1.1.0 · borrar existente
//
// IMPORTANTE: ajusta el ID del elemento HTML (#htmlEdicionCategorias) al
// que tengas en el editor de Wix si fuera distinto.
// =====================================================

import {
  listarCategorias,
  actualizarCategoria,
  toggleCategoriaActiva,
  uploadImagenCategoria,
  crearCategoria,
  duplicarCategoria,
  eliminarCategoria
} from 'backend/categoriasEditorLogic.web';

const TAG = '[EdicionCategorias][1.1.0]';

$w.onReady(async function () {
  console.log(`${TAG} ✅ Página cargada`);

  const widget = $w('#htmlEdicionCategorias');

  widget.onMessage(async (event) => {
    const msg = event.data;
    if (!msg || typeof msg !== 'object') return;

    console.log(`${TAG} 📩 Mensaje recibido:`, msg.type);

    if (msg.type === 'ready') {
      await cargarDatos(widget);
    }

    if (msg.type === 'saveCategoria') {
      await guardarCategoria(widget, msg.payload);
    }

    if (msg.type === 'toggleCategoria') {
      await toggleCategoria(widget, msg.payload);
    }

    if (msg.type === 'uploadCategoriaImage') {
      await subirImagen(widget, msg.payload);
    }

    // v1.1.0 · CRUD nuevo
    if (msg.type === 'createCategoria') {
      await crearCategoriaHandler(widget, msg.payload);
    }
    if (msg.type === 'duplicateCategoria') {
      await duplicarCategoriaHandler(widget, msg.payload);
    }
    if (msg.type === 'deleteCategoria') {
      await eliminarCategoriaHandler(widget, msg.payload);
    }
  });
});

// ═══════════════════════════════════════════════════
// CARGAR DATOS
// ═══════════════════════════════════════════════════
async function cargarDatos(widget) {
  try {
    console.log(`${TAG} 📋 Cargando categorías...`);
    const result = await listarCategorias();

    if (result.success) {
      console.log(`${TAG} ✅ ${result.categorias.length} categorías cargadas`);
      widget.postMessage({
        type: 'data',
        payload: { categorias: result.categorias }
      });
    } else {
      console.error(`${TAG} ❌ Error:`, result.error);
      widget.postMessage({ type: 'error', message: result.error });
    }
  } catch (error) {
    console.error(`${TAG} ❌ Error cargando:`, error);
    widget.postMessage({ type: 'error', message: error.message });
  }
}

// ═══════════════════════════════════════════════════
// GUARDAR CATEGORÍA (update de existente)
// ═══════════════════════════════════════════════════
async function guardarCategoria(widget, payload) {
  try {
    console.log(`${TAG} 💾 Guardando categoría:`, payload._catId);
    const result = await actualizarCategoria(payload);

    if (result.success) {
      console.log(`${TAG} ✅ Categoría actualizada`);
      widget.postMessage({ type: 'categoriaSaved', payload: result });
    } else {
      console.error(`${TAG} ❌ Error:`, result.error);
      widget.postMessage({ type: 'categoriaSaveError', message: result.error });
    }
  } catch (error) {
    console.error(`${TAG} ❌ Error guardando:`, error);
    widget.postMessage({ type: 'categoriaSaveError', message: error.message });
  }
}

// ═══════════════════════════════════════════════════
// TOGGLE ACTIVO / INACTIVO
// ═══════════════════════════════════════════════════
async function toggleCategoria(widget, payload) {
  try {
    console.log(`${TAG} 🔁 Toggle categoría:`, payload.catId, '→', payload.activo);
    const result = await toggleCategoriaActiva({ catId: payload.catId, activo: payload.activo });

    if (result.success) {
      console.log(`${TAG} ✅ Estado cambiado`);
      widget.postMessage({ type: 'categoriaToggled', payload: result });
    } else {
      console.error(`${TAG} ❌ Error:`, result.error);
      widget.postMessage({ type: 'categoriaToggleError', message: result.error });
    }
  } catch (error) {
    console.error(`${TAG} ❌ Error toggle:`, error);
    widget.postMessage({ type: 'categoriaToggleError', message: error.message });
  }
}

// ═══════════════════════════════════════════════════
// SUBIR IMAGEN
// ═══════════════════════════════════════════════════
async function subirImagen(widget, payload) {
  try {
    console.log(`${TAG} 📸 Subiendo imagen categoría:`, payload.catId);
    const result = await uploadImagenCategoria(payload);

    if (result.ok) {
      console.log(`${TAG} ✅ Imagen subida`);
      widget.postMessage({ type: 'categoriaImageUploaded', payload: result });
    } else {
      console.error(`${TAG} ❌ Error:`, result.error);
      widget.postMessage({ type: 'categoriaImageError', message: result.error });
    }
  } catch (error) {
    console.error(`${TAG} ❌ Error subiendo imagen:`, error);
    widget.postMessage({ type: 'categoriaImageError', message: error.message });
  }
}

// ═══════════════════════════════════════════════════
// v1.1.0 · CREAR CATEGORÍA
// ═══════════════════════════════════════════════════
async function crearCategoriaHandler(widget, payload) {
  try {
    console.log(`${TAG} ✨ Creando categoría:`, payload && payload.title);
    const result = await crearCategoria(payload || {});

    if (result.success) {
      console.log(`${TAG} ✅ Categoría creada: ${result.categoria && result.categoria._id}`);
      widget.postMessage({ type: 'categoriaCreated', payload: result });
    } else {
      console.warn(`${TAG} ⚠️ Alta rechazada:`, result.error);
      widget.postMessage({ type: 'categoriaCreateError', message: result.error });
    }
  } catch (error) {
    console.error(`${TAG} ❌ Error creando categoría:`, error);
    widget.postMessage({ type: 'categoriaCreateError', message: error.message });
  }
}

// ═══════════════════════════════════════════════════
// v1.1.0 · DUPLICAR CATEGORÍA
// ═══════════════════════════════════════════════════
async function duplicarCategoriaHandler(widget, payload) {
  try {
    console.log(`${TAG} 📋 Duplicando categoría:`, payload && payload.catId, '→', payload && payload.nuevoTitle);
    const result = await duplicarCategoria(payload || {});

    if (result.success) {
      console.log(`${TAG} ✅ Categoría duplicada: ${result.categoria && result.categoria._id}`);
      widget.postMessage({ type: 'categoriaDuplicated', payload: result });
    } else {
      console.warn(`${TAG} ⚠️ Duplicado rechazado:`, result.error);
      widget.postMessage({ type: 'categoriaDuplicateError', message: result.error });
    }
  } catch (error) {
    console.error(`${TAG} ❌ Error duplicando:`, error);
    widget.postMessage({ type: 'categoriaDuplicateError', message: error.message });
  }
}

// ═══════════════════════════════════════════════════
// v1.1.0 · ELIMINAR CATEGORÍA
// ═══════════════════════════════════════════════════
async function eliminarCategoriaHandler(widget, payload) {
  try {
    console.log(`${TAG} 🗑️ Eliminando categoría:`, payload && payload.catId);
    const result = await eliminarCategoria(payload || {});

    if (result.success) {
      console.log(`${TAG} ✅ Categoría eliminada: "${result.titleEliminado}"`);
      widget.postMessage({ type: 'categoriaDeleted', payload: result });
    } else {
      console.warn(`${TAG} ⚠️ Borrado rechazado:`, result.error);
      widget.postMessage({ type: 'categoriaDeleteError', message: result.error });
    }
  } catch (error) {
    console.error(`${TAG} ❌ Error eliminando:`, error);
    widget.postMessage({ type: 'categoriaDeleteError', message: error.message });
  }
}