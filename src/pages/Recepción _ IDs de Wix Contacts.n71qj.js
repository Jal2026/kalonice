// =====================================================
// KAMISUITE — Page code · Buscador de contactId
// v1.0.0 · 30 jul 2026
// =====================================================
// Conecta el widget HTML (contactLookup.html) con el backend
// (backend/contactLookup.web.js → buscarContactoId).
//
// ANTES DE USAR:
//   1) Añade un elemento HtmlComponent a la página y pega dentro
//      contactLookup.html.
//   2) En el panel de propiedades del HtmlComponent, ponle el ID
//      "htmlBuscadorId"  (o cambia abajo la línea $w('#htmlBuscadorId')
//      por el ID que tenga tu elemento).
//   3) Sube backend/contactLookup.web.js al backend del sitio.
//
// DÓNDE: la CRM es por sitio. Para resolver contactos de KALÓNICE,
// esta página + el backend van en el Velo de KALÓNICE.
// =====================================================

import { buscarContactoId, buscarContactoIdLote } from 'backend/contactLookup.web';

$w.onReady(function () {
  const html = $w('#htmlBuscadorId'); // ← ID de tu HtmlComponent

  // html.onMessage (NO html.on('message')) — patrón KAMISUITE.
  html.onMessage(async (event) => {
    const msg = (event && event.data) || {};

    // Handshake: el widget envía {type:'ready'} hasta recibir pong.
    if (msg.type === 'ready') {
      html.postMessage({ type: 'pong' });
      return;
    }

    if (msg.type === 'search') {
      try {
        const res = await buscarContactoId(msg.payload || {});
        html.postMessage(Object.assign({ type: 'results' }, res));
      } catch (e) {
        html.postMessage({ type: 'results', ok: false, error: { message: e && e.message ? e.message : 'Error' } });
      }
    }

    if (msg.type === 'searchLote') {
      try {
        const res = await buscarContactoIdLote(msg.payload || {});
        html.postMessage(Object.assign({ type: 'resultsLote' }, res));
      } catch (e) {
        html.postMessage({ type: 'resultsLote', ok: false, error: { message: e && e.message ? e.message : 'Error' } });
      }
    }
  });
});
