// =====================================================
// KAMISUITE - Setup Import Servicios - Page Code
// =====================================================
// PÁGINA: Import de servicios (onboarding salón, cuenta Wix del salón)
// WIDGET: #htmlImportServicios (HTML Component con setupImportServicios.html)
//
// VERSIÓN: 1.0.0
// FECHA: 5 de junio de 2026
//
// Cartero entre el widget y el backend setupImportServicios.web.
// No transforma datos: reenvía payload y devuelve la respuesta.
//
// CHANGELOG:
// v1.0.0 - Versión inicial: ready, contar, preview, import.
// =====================================================

import {
  previewServiciosDesdeJson,
  importarServiciosDesdeJson,
  contarServiciosCatalogo
} from 'backend/setupImportServicios.web';

const TAG = '[ImportServicios]';

$w.onReady(function () {
  console.log(`${TAG} ✅ Página cargada`);

  const widget = $w('#htmlImportServicios');

  widget.onMessage(async (event) => {
    const msg = event.data;
    if (!msg || typeof msg !== 'object') return;

    console.log(`${TAG} 📩 Mensaje recibido:`, msg.type);

    // ─── Widget listo → enviar conteo actual del catálogo ───
    if (msg.type === 'ready') {
      await enviarConteo(widget);
    }

    // ─── Recontar catálogo (tras import) ───
    if (msg.type === 'contar') {
      await enviarConteo(widget);
    }

    // ─── Preview (traduce sin escribir) ───
    if (msg.type === 'preview') {
      await hacerPreview(widget, msg.payload);
    }

    // ─── Import (traduce y escribe) ───
    if (msg.type === 'import') {
      await hacerImport(widget, msg.payload);
    }
  });
});

// ═══════════════════════════════════════════════════
// CONTEO ACTUAL DEL CATÁLOGO
// ═══════════════════════════════════════════════════
async function enviarConteo(widget) {
  try {
    const result = await contarServiciosCatalogo();
    widget.postMessage({ type: 'conteo', payload: result });
  } catch (error) {
    console.error(`${TAG} ❌ Error contando:`, error);
    widget.postMessage({ type: 'conteo', payload: { success: false, error: error.message } });
  }
}

// ═══════════════════════════════════════════════════
// PREVIEW
// ═══════════════════════════════════════════════════
async function hacerPreview(widget, payload) {
  try {
    console.log(`${TAG} 🔍 Preview solicitado`);
    const result = await previewServiciosDesdeJson({ json: payload.json });
    widget.postMessage({ type: 'previewResult', payload: result });
  } catch (error) {
    console.error(`${TAG} ❌ Error en preview:`, error);
    widget.postMessage({ type: 'previewResult', payload: { success: false, error: error.message } });
  }
}

// ═══════════════════════════════════════════════════
// IMPORT
// ═══════════════════════════════════════════════════
async function hacerImport(widget, payload) {
  try {
    console.log(`${TAG} 📥 Import solicitado`);
    const result = await importarServiciosDesdeJson({ json: payload.json });
    widget.postMessage({ type: 'importResult', payload: result });
  } catch (error) {
    console.error(`${TAG} ❌ Error en import:`, error);
    widget.postMessage({ type: 'importResult', payload: { success: false, error: error.message } });
  }
}