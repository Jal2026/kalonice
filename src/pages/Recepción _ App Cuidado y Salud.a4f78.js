// =====================================================
// PAGE CODE — KAMISUITE App Salón Foto Capilar
// HTML Component ID: #htmlSalonPhoto
// =====================================================
// VERSION: 1.0.1
// FECHA: Marzo 2026
//
// CHANGELOG:
//   v1.0.1 - NEW: clienteSeleccionado handler → fetch profileImage de ClientCareProfile
//   v1.0.0 - INICIAL
//     - Carga caché de contactos (recepcionLogic.web)
//     - Carga staff del salón (salonPhotoLogic.web)
//     - Búsqueda local de clientes en caché
//     - Puente saveSalonPhoto → backend
//
// MENSAJES WIDGET → PAGE CODE:
//   salonPhotoReady    — Widget inicializado
//   buscarCliente      — { query } búsqueda de cliente
//   saveSalonPhoto     — { contactId, photoBase64, staffId, staffName, note }
//
// MENSAJES PAGE CODE → WIDGET:
//   initData           — { staff[], totalClientes }
//   clientesEncontrados — { clientes[] }
//   photoSaved         — { visitId, photoUrl }
//   photoError         — { message }
//   loading            — { message }
// =====================================================

import { cargarTodosContactos } from 'backend/recepcionLogic.web';
import {
  getSalonStaff,
  saveSalonPhoto,
  getClientCareImage
} from 'backend/salonPhotoLogic.web';

const TAG = '[SalonPhotoPage][v1.0.1]';

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
    $w('#htmlSalonPhoto').postMessage({ type, ...data });
  } catch (e) {
    console.error(`${TAG} sendToWidget(${type}):`, e.message);
  }
}

// ─────────────────────────────────────────────
// CARGA INICIAL: STAFF + CONTACTOS EN PARALELO
// ─────────────────────────────────────────────

async function cargarDatosIniciales() {
  try {
    sendToWidget('loading', { message: 'Cargando...' });

    const [staffResult, contactosResult] = await Promise.all([
      getSalonStaff(),
      cargarTodosContactos(),
    ]);

    // Staff
    const staff = staffResult?.ok ? (staffResult.staff || []) : [];
    console.log(`${TAG} Staff: ${staff.length} empleados`);

    // Contactos
    if (contactosResult?.ok) {
      cacheContactos = contactosResult.clientes || [];
      cacheReady = true;
      console.log(`${TAG} Caché: ${cacheContactos.length} contactos`);
    } else {
      console.error(`${TAG} Error cargando contactos`);
    }

    sendToWidget('initData', {
      staff,
      totalClientes: cacheContactos.length,
    });

  } catch (e) {
    console.error(`${TAG} cargarDatosIniciales ERROR:`, e.message);
    sendToWidget('photoError', { message: 'Error cargando datos iniciales' });
  }
}

// ─────────────────────────────────────────────
// BÚSQUEDA LOCAL EN CACHÉ
// ─────────────────────────────────────────────

function buscarLocal(query) {
  if (!cacheReady || !query) {
    sendToWidget('clientesEncontrados', { clientes: [] });
    return;
  }

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
// GUARDAR FOTO
// ─────────────────────────────────────────────

async function handleSaveSalonPhoto(payload) {
  try {
    sendToWidget('loading', { message: 'Guardando foto...' });

    const result = await saveSalonPhoto({
      contactId:   payload.contactId,
      photoBase64: payload.photoBase64,
      staffId:     payload.staffId   || '',
      staffName:   payload.staffName || '',
      note:        payload.note      || '',
      zone:        payload.zone      || 'hair',
    });

    if (result.ok) {
      console.log(`${TAG} ✅ Foto guardada: visitId=${result.visitId}`);
      sendToWidget('photoSaved', {
        visitId:  result.visitId,
        photoUrl: result.photoUrl,
      });
    } else {
      console.error(`${TAG} ❌ Error:`, result.error);
      sendToWidget('photoError', { message: result.error || 'Error desconocido' });
    }
  } catch (e) {
    console.error(`${TAG} handleSaveSalonPhoto ERROR:`, e.message);
    sendToWidget('photoError', { message: e.message || 'Error de conexión' });
  }
}

// ─────────────────────────────────────────────
// ARRANQUE
// ─────────────────────────────────────────────

$w.onReady(function () {
  console.log(`${TAG} ✅ Page ready`);

  $w('#htmlSalonPhoto').onMessage(async (event) => {
    const msg = event.data;
    if (!msg || typeof msg !== 'object') return;

    console.log(`${TAG} 📨 ${msg.type}`);

    switch (msg.type) {

      case 'salonPhotoReady':
        if (cacheReady) {
          sendToWidget('initData', {
            staff: [],  // ya se cargó al inicio
            totalClientes: cacheContactos.length,
          });
        }
        break;

      case 'buscarCliente':
        buscarLocal(msg.query);
        break;

      case 'clienteSeleccionado':
        if (msg.contactId) {
          // Fetch profile image asynchronously (non-blocking)
          getClientCareImage({ contactId: msg.contactId }).then(result => {
            if (result?.ok && result.profileImage) {
              sendToWidget('clientProfileImage', { 
                contactId: msg.contactId,
                profileImage: result.profileImage 
              });
            }
          }).catch(e => {
            console.warn(`${TAG} getClientCareImage:`, e.message);
          });
        }
        break;

      case 'saveSalonPhoto':
        if (msg.payload) {
          await handleSaveSalonPhoto(msg.payload);
        } else {
          sendToWidget('photoError', { message: 'Payload vacío' });
        }
        break;

      default:
        console.warn(`${TAG} Tipo desconocido: ${msg.type}`);
    }
  });

  // Carga inicial al arrancar la página
  cargarDatosIniciales();

  console.log(`${TAG} 👂 Listener activo`);
});