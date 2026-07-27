/* ═══════════════════════════════════════════════════════════════
   pagecode_salon_config.js  v1.0.1
   KAMISUITE — Page code para página Edición Salón
   ═══════════════════════════════════════════════════════════════
   CHANGELOG
   v1.0.1 · 10 May 2026 · Fix postMessage: objeto directo, no JSON.stringify
     - Patrón estándar KAMISUITE: $w('#html').postMessage({type, data})
     - JSON.stringify causaba fallo en móvil
   v1.0.0 · 9 May 2026 · Creación inicial
   ═══════════════════════════════════════════════════════════════

   WIDGET Wix HTML: #htmlSalonConfig
   BACKEND: salonConfigLogic.web.js
   ═══════════════════════════════════════════════════════════════ */

import { getSalonConfig, updateSalonConfig } from 'backend/salonConfigLogic.web';

$w.onReady(async function () {

  const widget = $w('#htmlSalonConfig');

  // ── Escuchar mensajes del widget ──
  widget.onMessage(async (event) => {
    const msg = event.data;
    if (!msg || !msg.type) return;

    switch (msg.type) {

      // Widget inicializado → cargar config
      case 'salonConfigReady': {
        try {
          sendToWidget({ type: 'salonConfigLoading', message: 'Cargando configuración...' });
          const result = await getSalonConfig();
          if (result.ok) {
            sendToWidget({
              type: 'salonConfigData',
              config: result.config,
              isNew: result.isNew
            });
          } else {
            sendToWidget({ type: 'salonConfigError', message: result.error });
          }
        } catch (err) {
          console.error('[PageCode SalonConfig] Error cargando:', err);
          sendToWidget({ type: 'salonConfigError', message: err.message });
        }
        break;
      }

      // Widget pide guardar → actualizar CMS
      case 'salonConfigSave': {
        try {
          sendToWidget({ type: 'salonConfigSaving', message: 'Guardando...' });
          const result = await updateSalonConfig(msg.data);
          if (result.ok) {
            sendToWidget({
              type: 'salonConfigSaved',
              config: result.config
            });
          } else {
            sendToWidget({ type: 'salonConfigError', message: result.error });
          }
        } catch (err) {
          console.error('[PageCode SalonConfig] Error guardando:', err);
          sendToWidget({ type: 'salonConfigError', message: err.message });
        }
        break;
      }

      default:
        break;
    }
  });

  // ── Helper: enviar objeto directo al widget (patrón KAMISUITE) ──
  function sendToWidget(data) {
    widget.postMessage(data);
  }

});