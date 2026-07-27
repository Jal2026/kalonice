// =====================================================
// PAGE CODE — KAMISUITE Hair Assessment (Página Pública)
// HTML Component ID: #htmlHairAssessment
// =====================================================
// VERSION: 1.0.0
// FECHA: Marzo 2026
//
// CHANGELOG:
//   v1.0.0 - INICIAL
//     - Handler submitHairAssessment → saveHairAssessment (backend)
//     - Backend escribe en ClientCareProfile + CareVisitRecord
//     - Responde assessmentSaved / assessmentError al widget
//
// NOTAS:
//   - Página PÚBLICA (cara cliente, sin login)
//   - Componente HTML: #htmlHairAssessment
// =====================================================

import { saveHairAssessment } from 'backend/hairAssessmentLogic.web';

const TAG = '[HairAssessmentPage][v1.0.0]';

// ─────────────────────────────────────────────
// HELPER: enviar mensaje al widget
// ─────────────────────────────────────────────

function sendToWidget(type, data = {}) {
  try {
    $w('#htmlHairAssessment').postMessage({ type, ...data });
  } catch (e) {
    console.error(`${TAG} sendToWidget(${type}):`, e.message);
  }
}

// ─────────────────────────────────────────────
// HANDLER: guardar assessment
// ─────────────────────────────────────────────

async function handleSubmit(payload) {
  try {
    console.log(`${TAG} Guardando assessment: ${payload?.name} (${payload?.email})`);

    const result = await saveHairAssessment({ payload });

    if (result.ok) {
      console.log(`${TAG} ✅ Guardado: visitId=${result.visitId} contactId=${result.contactId} nuevoContacto=${result.isNewContact}`);
      sendToWidget('assessmentSaved', {
        visitId:      result.visitId,
        contactId:    result.contactId,
        isNewContact: result.isNewContact,
      });
    } else {
      console.error(`${TAG} ❌ Error:`, result.error);
      sendToWidget('assessmentError', {
        message: result.error || 'Error desconocido',
      });
    }
  } catch (e) {
    console.error(`${TAG} handleSubmit ERROR:`, e.message);
    sendToWidget('assessmentError', {
      message: e.message || 'Error de conexión',
    });
  }
}

// ─────────────────────────────────────────────
// ARRANQUE
// ─────────────────────────────────────────────

$w.onReady(function () {
  console.log(`${TAG} ✅ Page ready`);

  $w('#htmlHairAssessment').onMessage(async (event) => {
    const msg = event.data;
    if (!msg || typeof msg !== 'object') return;

    console.log(`${TAG} 📨 ${msg.type}`);

    switch (msg.type) {

      case 'hairAssessmentReady':
        console.log(`${TAG} Widget listo`);
        break;

      case 'submitHairAssessment':
        if (msg.payload) {
          await handleSubmit(msg.payload);
        } else {
          sendToWidget('assessmentError', { message: 'Payload vacío' });
        }
        break;

      default:
        console.warn(`${TAG} Tipo desconocido: ${msg.type}`);
    }
  });

  console.log(`${TAG} 👂 Listener activo`);
});