// =====================================================
// PAGE CODE — Recepción | Diagnóstico Reservas
// =====================================================
// VERSION: 3.0.1
// FECHA: 11 de mayo de 2026
//
// Widget HTML: diagnosticopagos
// Backend: diagnosticoPagos.web.js v3.0.1
//
// Comunicación postMessage bridge puro.
// La búsqueda CRM se hace en el backend (no en page code).
// =====================================================

import { buscarContactosDiag, diagnosticarCliente, diagnosticarRango } from 'backend/diagnosticoPagos.web.js';

const TAG = '[DiagPage v3.1.0]';

$w.onReady(function () {
  const widget = $w('#diagnosticopagos');

  // Cargar total de contactos al inicio
  buscarContactosDiag({ query: '' }).then(res => {
    widget.postMessage({
      type: 'cacheReady',
      total: res.total || 0
    });
  }).catch(e => {
    console.error(`${TAG} Error inicial:`, e);
    widget.postMessage({ type: 'cacheReady', total: 0 });
  });

  // Escuchar mensajes del widget
  widget.onMessage(async (event) => {
    const msg = event.data;
    if (!msg || !msg.type) return;

    console.log(`${TAG} ← ${msg.type}`);

    switch (msg.type) {

      case 'ready':
        // Widget montado, nada que hacer (cacheReady ya enviado arriba)
        break;

      case 'buscarCliente': {
        const q = msg.query || '';
        try {
          const res = await buscarContactosDiag({ query: q });
          widget.postMessage({
            type: 'clientesEncontrados',
            clientes: res.clientes || []
          });
        } catch (e) {
          console.error(`${TAG} Error buscar:`, e);
          widget.postMessage({ type: 'clientesEncontrados', clientes: [] });
        }
        break;
      }

      case 'diagnosticar': {
        const { contactId, dias } = msg;
        if (!contactId) {
          widget.postMessage({ type: 'error', message: 'Sin contactId' });
          break;
        }

        widget.postMessage({ type: 'loading', message: 'Consultando bookings...' });

        try {
          const result = await diagnosticarCliente({ contactId, dias: dias || 90 });
          widget.postMessage({
            type: 'diagnosticoResult',
            ...result
          });
        } catch (e) {
          console.error(`${TAG} Error diagnosticar:`, e);
          widget.postMessage({ type: 'error', message: e.message || 'Error desconocido' });
        }
        break;
      }

      case 'diagnosticarRango': {
        const { desde, hasta } = msg;
        if (!desde || !hasta) {
          widget.postMessage({ type: 'error', message: 'Selecciona desde y hasta' });
          break;
        }

        widget.postMessage({ type: 'loading', message: `Consultando ${desde} → ${hasta}...` });

        try {
          const result = await diagnosticarRango({ desde, hasta });
          widget.postMessage({
            type: 'diagnosticoResult',
            ...result
          });
        } catch (e) {
          console.error(`${TAG} Error diagnosticarRango:`, e);
          widget.postMessage({ type: 'error', message: e.message || 'Error desconocido' });
        }
        break;
      }
    }
  });
});