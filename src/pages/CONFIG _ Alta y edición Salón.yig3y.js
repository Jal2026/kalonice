/* ═══════════════════════════════════════════════════════════════
   pagecode_salon_config.js  v1.0.3
   KAMISUITE — Page code para página Edición Salón
   ═══════════════════════════════════════════════════════════════
   CHANGELOG
   v1.0.3 · 6 Jul 2026 · Editable serviceName ("Servicio/s") por externo
     - El handler 'externalStaffSave' pasa ahora al backend un cuarto
       campo por update: `serviceName` (String, opcional). Se propaga
       tal cual llega desde el widget v1.0.10.
     - Pareja backend: externalStaffLogic.web v1.0.1 (updateExternalCommission
       acepta serviceName opcional).
     - Sin cambios en el resto de handlers ni en los imports (mismos
       webMethods).
   v1.0.2 · 6 Jul 2026 · Handlers de "Gestión Externos"
     - NEW switch cases:
         · 'externalStaffReady'  → listExternalStaff() (nuevo backend
           externalStaffLogic.web). Devuelve al widget el array de
           externos con su fila de ExternalServices asociada.
         · 'externalStaffSave'   → itera msg.updates y llama
           updateExternalCommission() por cada fila modificada. Devuelve
           al widget el resultado consolidado.
     - Sin tocar los handlers 'salonConfigReady' / 'salonConfigSave'
       existentes: el guardado global de SalonConfig sigue siendo
       independiente del guardado de externos.
     - Nuevo import: externalStaffLogic.web (listExternalStaff,
       updateExternalCommission).
   v1.0.1 · 10 May 2026 · Fix postMessage: objeto directo, no JSON.stringify
     - Patrón estándar KAMISUITE: $w('#html').postMessage({type, data})
     - JSON.stringify causaba fallo en móvil
   v1.0.0 · 9 May 2026 · Creación inicial
   ═══════════════════════════════════════════════════════════════

   WIDGET Wix HTML: #htmlSalonConfig
   BACKEND: salonConfigLogic.web.js + externalStaffLogic.web.js (v1.0.2)
   ═══════════════════════════════════════════════════════════════ */

import { getSalonConfig, updateSalonConfig } from 'backend/salonConfigLogic.web';
import { listExternalStaff, updateExternalCommission } from 'backend/externalStaffLogic.web';

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

      // v1.0.2 — Widget pide la lista de externos (StaffConfig ⨯ ExternalServices)
      case 'externalStaffReady': {
        try {
          const result = await listExternalStaff();
          if (result.ok) {
            sendToWidget({
              type: 'externalStaffData',
              staff: result.staff
            });
          } else {
            sendToWidget({
              type: 'externalStaffError',
              message: (result.error && result.error.message) ? result.error.message : 'Error listando externos'
            });
          }
        } catch (err) {
          console.error('[PageCode SalonConfig] Error listExternalStaff:', err);
          sendToWidget({ type: 'externalStaffError', message: err.message });
        }
        break;
      }

      // v1.0.2 — Widget pide guardar cambios en externos
      //   msg.updates: [{ externalServicesId, commissionPercentage, activeStatus }]
      case 'externalStaffSave': {
        try {
          sendToWidget({ type: 'externalStaffSaving', message: 'Guardando externos...' });

          const updates = Array.isArray(msg.updates) ? msg.updates : [];
          const okItems = [];
          const errItems = [];

          for (const u of updates) {
            try {
              const r = await updateExternalCommission({
                externalServicesId:   u.externalServicesId,
                commissionPercentage: u.commissionPercentage,
                activeStatus:         u.activeStatus,
                serviceName:          u.serviceName   // v1.0.3 — opcional; si viene undefined el backend no lo toca
              });
              if (r.ok) {
                okItems.push({
                  externalServicesId:   r.externalServicesId,
                  commissionPercentage: r.commissionPercentage,
                  activeStatus:         r.activeStatus,
                  serviceName:          r.serviceName  // v1.0.3
                });
              } else {
                errItems.push({
                  externalServicesId: u.externalServicesId,
                  message: (r.error && r.error.message) ? r.error.message : 'Error'
                });
              }
            } catch (itemErr) {
              errItems.push({
                externalServicesId: u.externalServicesId,
                message: itemErr.message
              });
            }
          }

          sendToWidget({
            type: 'externalStaffSaved',
            saved: okItems,
            errors: errItems
          });
        } catch (err) {
          console.error('[PageCode SalonConfig] Error externalStaffSave:', err);
          sendToWidget({ type: 'externalStaffError', message: err.message });
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