// =====================================================
// KAMISUITE — Page Code: Catálogo Servicios
// =====================================================
// Página: Lectura Servicios (actualizada para widget)
// Elemento: #widgetCatalogo (HtmlComponent)
// Backend: diagnosticoServicios.web.js v1.1
// =====================================================

import { listarServicios } from 'backend/diagnosticoServicios.web';

$w.onReady(function () {

  const widget = $w('#widgetCatalogo');

  widget.onMessage((event) => {
    const msg = event.data;
    if (!msg || typeof msg !== 'object') return;

    if (msg.type === 'ready') {
      cargarServicios();
    }
  });

  async function cargarServicios() {
    try {
      const result = await listarServicios();

      if (!result.ok) {
        widget.postMessage({
          type: 'error',
          message: result.error || 'Error desconocido'
        });
        return;
      }

      widget.postMessage({
        type: 'data',
        payload: {
          servicios: result.servicios,
          staffCatalog: result.staffCatalog || []
        }
      });

    } catch (e) {
      console.error('[CatalogoServicios] Error:', e);
      widget.postMessage({
        type: 'error',
        message: e.message || String(e)
      });
    }
  }
});
