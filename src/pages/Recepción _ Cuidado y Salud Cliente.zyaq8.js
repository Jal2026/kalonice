// =====================================================
// PAGE CODE — KAMISUITE Care Profile
// HTML Component ID: #htmlCareProfile
// =====================================================
// VERSION: 1.5.4
// FECHA: 1 Mayo 2026
//
// CHANGELOG:
//   v1.5.4 - NEW: handler deleteCareVisit para eliminar registros del expediente
//   v1.5.3 - FIX: handleAnalyzeImage recovery tras 504. Espera 15s,
//     recarga expediente. El backend siempre completa — solo esperar.
//   v1.5.1 - FIX: import corregido (analyzeHairImage as analyzeIAImage)
//   v1.5.0 - FIX: restaurado page code correcto (estaba sobreescrito
//     con el page code de AKIRA Lab, causando TypeError: e.on)
//   v1.4.0 - NEW: handler analyzeImage → iaAnalysisLogic.web
//   v1.3.0 - NEW: handler saveCareNotes → careProfileLogic.web
//   v1.2.0 - getCareServicios reemplaza getCareBookings
//     - Lee PaymentReservations por nombreCliente (no extendedBookings)
//   v1.1.0 - buscador de clientes integrado
//   v1.0.0 - INICIAL
// =====================================================

import { cargarTodosContactos } from 'backend/recepcionLogic.web';
import {
  getCareContactData,
  getCareServicios,
  getCareProductos,
  getCareExternos,
  getCareExpediente,
  saveCareNotes,
  deleteCareVisit
} from 'backend/careProfileLogic.web';
import { analyzeHairImage as analyzeIAImage } from 'backend/iaAnalysisLogic.web';

const TAG = '[CareProfilePage][v1.5.4]';

// ─────────────────────────────────────────────
// CACHÉ DE CONTACTOS
// ─────────────────────────────────────────────

let cacheContactos = [];
let cacheReady = false;

// ─────────────────────────────────────────────
// HELPER: enviar mensaje al widget
// ─────────────────────────────────────────────

function sendToWidget(type, data = {}) {
  try {
    $w('#htmlCareProfile').postMessage({ type, ...data });
  } catch (e) {
    console.error(`${TAG} sendToWidget(${type}):`, e.message);
  }
}

// ─────────────────────────────────────────────
// CARGA CACHÉ DE CONTACTOS
// ─────────────────────────────────────────────

async function cargarCache() {
  try {
    sendToWidget('loading', { message: 'Cargando base de clientes...' });
    const result = await cargarTodosContactos();
    if (result.ok) {
      cacheContactos = result.clientes || [];
      cacheReady = true;
      sendToWidget('cacheReady', { total: cacheContactos.length });
      console.log(`${TAG} ✅ Caché lista: ${cacheContactos.length} contactos`);
    } else {
      sendToWidget('error', { message: 'Error cargando base de clientes' });
    }
  } catch (e) {
    console.error(`${TAG} cargarCache ERROR:`, e.message);
    sendToWidget('error', { message: 'Error cargando base de clientes' });
  }
}

// ─────────────────────────────────────────────
// BÚSQUEDA LOCAL EN CACHÉ
// ─────────────────────────────────────────────

function buscarLocal(query) {
  if (!cacheReady || !query) { sendToWidget('clientesEncontrados', { clientes: [] }); return; }
  const q = query.toLowerCase().trim();
  const resultados = cacheContactos.filter(c => {
    const nombre = (c.nombreCompleto || c.nombre || '').toLowerCase();
    const email  = (c.email || '').toLowerCase();
    const tel    = (c.telefono || '').toLowerCase();
    return nombre.includes(q) || email.includes(q) || tel.includes(q);
  }).slice(0, 10);
  sendToWidget('clientesEncontrados', { clientes: resultados });
}

// ─────────────────────────────────────────────
// HANDLERS DE DATOS
// ─────────────────────────────────────────────

async function handleCareContact(contactId) {
  try {
    const result = await getCareContactData({ contactId });
    if (result.ok) {
      sendToWidget('careContactData', { contact: result.contact });
    } else {
      sendToWidget('careError', { message: 'Error cargando datos del cliente' });
    }
  } catch (e) {
    console.error(`${TAG} handleCareContact:`, e.message);
    sendToWidget('careError', { message: e.message });
  }
}

async function handleCareServicios(contactId) {
  try {
    const result = await getCareServicios({ contactId });
    sendToWidget('careServicios', {
      servicios:    result.servicios    || [],
      tratamientos: result.tratamientos || [],
      totalVisitas: result.totalVisitas || 0
    });
  } catch (e) {
    console.error(`${TAG} handleCareServicios:`, e.message);
    sendToWidget('careServicios', { servicios: [], tratamientos: [] });
  }
}

async function handleCareProductos(contactId) {
  try {
    const result = await getCareProductos({ contactId });
    sendToWidget('careProductos', { productos: result.productos || [] });
  } catch (e) {
    console.error(`${TAG} handleCareProductos:`, e.message);
    sendToWidget('careProductos', { productos: [] });
  }
}

async function handleCareExternos(contactId) {
  try {
    const result = await getCareExternos({ contactId });
    sendToWidget('careExternos', { externos: result.externos || [] });
  } catch (e) {
    console.error(`${TAG} handleCareExternos:`, e.message);
    sendToWidget('careExternos', { externos: [] });
  }
}

async function handleCareExpediente(contactId) {
  try {
    const result = await getCareExpediente({ contactId });
    sendToWidget('careExpediente', {
      profile: result.profile || null,
      visits:  result.visits  || [],
      media:   result.media   || []
    });
  } catch (e) {
    console.error(`${TAG} handleCareExpediente:`, e.message);
    sendToWidget('careExpediente', { profile: null, visits: [], media: [] });
  }
}

// ─────────────────────────────────────────────
// CARGA COMPLETA DE UN CLIENTE
// ─────────────────────────────────────────────

async function cargarDatosCliente(contactId) {
  console.log(`${TAG} Cargando contactId: ${contactId}`);
  sendToWidget('careLoading', { message: 'Cargando datos del cliente...' });
  await handleCareContact(contactId);
  await Promise.all([
    handleCareServicios(contactId),
    handleCareProductos(contactId),
    handleCareExternos(contactId),
    handleCareExpediente(contactId)
  ]);
  console.log(`${TAG} ✅ Carga completa: ${contactId}`);
}

// ─────────────────────────────────────────────
// HANDLER: GUARDAR NOTAS (v1.3.0)
// ─────────────────────────────────────────────

async function handleSaveCareNotes(contactId, notes) {
  try {
    console.log(`${TAG} Guardando notas para ${contactId}`);
    const result = await saveCareNotes({ contactId, notes });
    if (result.ok) {
      sendToWidget('careNotesSaved', { notes });
    } else {
      sendToWidget('careNotesError', { message: result.error || 'Error guardando notas' });
    }
  } catch (e) {
    console.error(`${TAG} handleSaveCareNotes:`, e.message);
    sendToWidget('careNotesError', { message: e.message });
  }
}

// ─────────────────────────────────────────────
// HANDLER: ELIMINAR VISITA (v1.5.4)
// ─────────────────────────────────────────────

async function handleDeleteCareVisit(visitId, contactId) {
  try {
    console.log(`${TAG} 🗑️ Eliminando visita ${visitId}`);
    sendToWidget('careLoading', { message: 'Eliminando registro...' });
    const result = await deleteCareVisit({ visitId });
    if (result.ok) {
      console.log(`${TAG} ✅ Visita eliminada`);
      await handleCareExpediente(contactId);
    } else {
      sendToWidget('careError', { message: result.error || 'Error eliminando' });
    }
  } catch (e) {
    console.error(`${TAG} handleDeleteCareVisit:`, e.message);
    sendToWidget('careError', { message: e.message });
  }
}

// ─────────────────────────────────────────────
// HANDLER: ANÁLISIS IA (v1.4.0, fix v1.5.3)
// v1.5.3: tras 504, espera 15s y recarga expediente. El backend SIEMPRE
//   guarda el resultado — solo necesitamos tiempo para que termine.
// ─────────────────────────────────────────────

async function handleAnalyzeImage(contactId, imageBase64, mediaType, zone) {
  try {
    console.log(`${TAG} 🤖 Análisis IA: contactId=${contactId} zone=${zone}`);
    sendToWidget('iaAnalysisLoading', { message: 'Analizando imagen con IA...' });
    const result = await analyzeIAImage({ contactId, imageBase64, mediaType, zone });
    if (result.ok) {
      console.log(`${TAG} 🤖 Análisis IA completado: recordId=${result.recordId}`);
      sendToWidget('iaAnalysisResult', {
        analysis:  result.analysis,
        recordId:  result.recordId,
        zone:      result.zone || zone,
        timestamp: result.timestamp || new Date().toISOString()
      });
      await handleCareExpediente(contactId);
    } else {
      sendToWidget('iaAnalysisError', { message: result.error || 'Error en análisis IA' });
    }
  } catch (e) {
    console.error(`${TAG} handleAnalyzeImage 504/timeout:`, e.message);
    // v1.5.3: Backend completa siempre — esperar, recargar y extraer resultado
    console.log(`${TAG} 🔄 504 probable. Esperando 15s para que el backend termine...`);
    sendToWidget('iaAnalysisLoading', { message: 'El análisis está en proceso, espera unos segundos...' });
    await new Promise(r => setTimeout(r, 15000));
    sendToWidget('iaAnalysisLoading', { message: 'Cargando resultado...' });
    try {
      const check = await getCareExpediente({ contactId });
      if (check.ok) {
        // Enviar expediente actualizado al widget
        sendToWidget('careExpediente', {
          profile: check.profile || null,
          visits:  check.visits || [],
          media:   check.media || []
        });
        // Extraer análisis del registro más reciente
        const latest = (check.visits || [])[0];
        if (latest && latest.diagnosis) {
          let analysis = {};
          try { analysis = JSON.parse(latest.diagnosis); } catch (_) {}
          if (analysis.source === 'ia-claude') {
            console.log(`${TAG} ✅ Recovery OK: CareVisitRecord ${latest._id}`);
            sendToWidget('iaAnalysisResult', {
              analysis,
              recordId: latest._id,
              zone: latest.zone || zone,
              timestamp: latest.visitDate || new Date().toISOString()
            });
            return;
          }
        }
      }
    } catch (checkErr) {
      console.error(`${TAG} Recovery check falló:`, checkErr.message);
    }
    // Si nada funcionó, mostrar mensaje amable
    sendToWidget('iaAnalysisError', { message: 'El análisis puede tardar unos segundos más. Pulsa en otro cliente y vuelve a este para ver el resultado en el expediente.' });
  }
}

// ─────────────────────────────────────────────
// ARRANQUE
// ─────────────────────────────────────────────

$w.onReady(function () {
  console.log(`${TAG} ✅ Page ready`);

  $w('#htmlCareProfile').onMessage(async (event) => {
    const msg = event.data;
    if (!msg || typeof msg !== 'object') return;

    console.log(`${TAG} 📨 ${msg.type}`);

    switch (msg.type) {

      case 'careReady':
        if (cacheReady) {
          sendToWidget('cacheReady', { total: cacheContactos.length });
        }
        break;

      case 'buscarCliente':
        buscarLocal(msg.query);
        break;

      case 'careClienteSeleccionado':
        if (msg.contactId) {
          await cargarDatosCliente(msg.contactId);
        }
        break;

      case 'careReload':
        if (msg.contactId) {
          await cargarDatosCliente(msg.contactId);
        }
        break;

      case 'saveCareNotes':
        if (msg.contactId) {
          await handleSaveCareNotes(msg.contactId, msg.notes || '');
        }
        break;

      case 'analyzeImage':
        if (msg.contactId && msg.imageBase64) {
          await handleAnalyzeImage(msg.contactId, msg.imageBase64, msg.mediaType || 'image/jpeg', msg.zone || 'hair');
        } else {
          sendToWidget('iaAnalysisError', { message: 'Faltan datos para el análisis' });
        }
        break;

      case 'deleteCareVisit':
        if (msg.visitId && msg.contactId) {
          await handleDeleteCareVisit(msg.visitId, msg.contactId);
        }
        break;

      default:
        console.warn(`${TAG} Tipo desconocido: ${msg.type}`);
    }
  });

  // Cargar caché al arrancar la página
  cargarCache();

  console.log(`${TAG} 👂 Listener activo`);
});