// ═══════════════════════════════════════════════════════════════════════════
// KAMISUITE — pagecode_timeclock.js v1.0.3
// Control Horario — Page Code (postMessage bridge)
// HTML Component ID: #htmlTimeClock
// v1.0.1: handler resetPin (reset PIN protegido por masterPin de SalonConfig)
// v1.0.2: handleReady envía brandName + legalName (cabecera legal)
// v1.0.3: ocultar Wix Smart Chat en esta página interna (mismo método mobile)
// ═══════════════════════════════════════════════════════════════════════════

import {
  getActiveStaff,
  getSalonHeader,
  validatePin,
  createPin,
  resetPin,
  registerEvent,
  getStaffStatus,
  getRecords,
  getRecordsByRange,
  adminCorrectRecord,
  getWeeklySummary
} from 'backend/timeClockLogic.web';

const TAG = '[TimeClockPage][1.0.2]';

$w.onReady(function () {
  // v1.0.3: ocultar el Wix Smart Chat (asistente IA de Wix, burbuja flotante)
  // SOLO en esta página interna. Sigue activo en la web pública para clientes.
  // Mismo método y mismo ID confirmado en pagecode_recepcionpromobile v0.2.4
  // (elemento global del sitio). Solo surte efecto en el sitio PUBLICADO, no en
  // el preview del Editor. try/catch por si el elemento aún no está montado.
  try { $w('#f6B6E28D52B24De6Aab3Ff2Ccad8E2291').hide(); } catch (e) {}

  const html = $w('#htmlTimeClock');

  html.onMessage(async (event) => {
    const msg = event.data;
    if (!msg || !msg.type) return;

    console.log(`${TAG} ← widget: ${msg.type}`);

    switch (msg.type) {

      // ─── Widget inicializado, enviar staff + estado del día ───
      case 'timeClockReady':
        await handleReady(html);
        break;

      // ─── Validar PIN ───
      case 'validatePin':
        await handleValidatePin(html, msg.staffId, msg.pin);
        break;

      // ─── Crear PIN primera vez ───
      case 'createPin':
        await handleCreatePin(html, msg.staffId, msg.pin);
        break;

      // ─── Resetear PIN (protegido por masterPin) ───
      case 'resetPin':
        await handleResetPin(html, msg.staffId, msg.masterPin);
        break;

      // ─── Registrar fichaje ───
      case 'registerEvent':
        await handleRegisterEvent(html, msg.staffId, msg.eventType);
        break;

      // ─── Consultar registros del día ───
      case 'getRecords':
        await handleGetRecords(html, msg.dateISO);
        break;

      // ─── Consultar registros por rango ───
      case 'getRecordsByRange':
        await handleGetRecordsByRange(html, msg.startDate, msg.endDate);
        break;

      // ─── Corrección admin ───
      case 'adminCorrectRecord':
        await handleAdminCorrect(html, msg.recordId, msg.correctionNote, msg.newTimestamp, msg.adminName);
        break;

      // ─── Resumen semanal ───
      case 'getWeeklySummary':
        await handleWeeklySummary(html, msg.weekStartISO);
        break;

      // ─── Refrescar estado (tras fichaje u otra acción) ───
      case 'refreshStatus':
        await handleRefreshStatus(html, msg.dateISO);
        break;

      default:
        console.warn(`${TAG} Mensaje no reconocido: ${msg.type}`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// HANDLERS
// ═══════════════════════════════════════════════════════════════════════════

async function handleReady(html) {
  try {
    sendToWidget(html, 'timeClockLoading', { message: 'Cargando empleados...' });

    const todayISO = _todayMadrid();
    const [staffRes, statusRes, salonRes] = await Promise.all([
      getActiveStaff(),
      getStaffStatus(todayISO),
      getSalonHeader()
    ]);

    if (!staffRes.success) {
      sendToWidget(html, 'timeClockError', { message: staffRes.error });
      return;
    }

    sendToWidget(html, 'staffLoaded', {
      staff: staffRes.staff,
      statusMap: statusRes.success ? statusRes.statusMap : {},
      brandName: salonRes && salonRes.brandName ? salonRes.brandName : '',
      legalName: salonRes && salonRes.legalName ? salonRes.legalName : '',
      todayISO
    });

    console.log(`${TAG} ✅ staffLoaded: ${staffRes.staff.length} empleados`);
  } catch (err) {
    console.error(`${TAG} ❌ handleReady:`, err.message);
    sendToWidget(html, 'timeClockError', { message: err.message });
  }
}

async function handleValidatePin(html, staffId, pin) {
  try {
    const res = await validatePin(staffId, pin);
    sendToWidget(html, 'pinValidated', {
      staffId,
      valid: res.success && res.valid,
      needsSetup: res.needsSetup || false,
      error: res.error || ''
    });
  } catch (err) {
    console.error(`${TAG} ❌ handleValidatePin:`, err.message);
    sendToWidget(html, 'timeClockError', { message: err.message });
  }
}

async function handleCreatePin(html, staffId, pin) {
  try {
    const res = await createPin(staffId, pin);
    sendToWidget(html, 'pinCreated', {
      staffId,
      success: res.success,
      error: res.error || ''
    });
  } catch (err) {
    console.error(`${TAG} ❌ handleCreatePin:`, err.message);
    sendToWidget(html, 'timeClockError', { message: err.message });
  }
}

async function handleResetPin(html, staffId, masterPin) {
  try {
    const res = await resetPin(staffId, masterPin);
    sendToWidget(html, 'pinReset', {
      staffId,
      success: res.success,
      invalidMaster: res.invalidMaster || false,
      error: res.error || ''
    });
    if (res.success) console.log(`${TAG} ✅ pinReset OK para ${staffId}`);
  } catch (err) {
    console.error(`${TAG} ❌ handleResetPin:`, err.message);
    sendToWidget(html, 'timeClockError', { message: err.message });
  }
}

async function handleRegisterEvent(html, staffId, eventType) {
  try {
    sendToWidget(html, 'timeClockLoading', { message: 'Registrando...' });

    const res = await registerEvent(staffId, eventType);
    if (!res.success) {
      sendToWidget(html, 'timeClockError', { message: res.error });
      return;
    }

    // Refrescar estado del día tras el fichaje
    const todayISO = _todayMadrid();
    const statusRes = await getStaffStatus(todayISO);

    sendToWidget(html, 'eventRegistered', {
      record: res.record,
      statusMap: statusRes.success ? statusRes.statusMap : {}
    });

    console.log(`${TAG} ✅ eventRegistered: ${res.record.staffName} → ${eventType}`);
  } catch (err) {
    console.error(`${TAG} ❌ handleRegisterEvent:`, err.message);
    sendToWidget(html, 'timeClockError', { message: err.message });
  }
}

async function handleGetRecords(html, dateISO) {
  try {
    sendToWidget(html, 'timeClockLoading', { message: 'Cargando registros...' });
    const res = await getRecords(dateISO);
    if (!res.success) {
      sendToWidget(html, 'timeClockError', { message: res.error });
      return;
    }
    sendToWidget(html, 'recordsLoaded', { records: res.records, dateISO });
  } catch (err) {
    console.error(`${TAG} ❌ handleGetRecords:`, err.message);
    sendToWidget(html, 'timeClockError', { message: err.message });
  }
}

async function handleGetRecordsByRange(html, startDate, endDate) {
  try {
    sendToWidget(html, 'timeClockLoading', { message: 'Cargando histórico...' });
    const res = await getRecordsByRange(startDate, endDate);
    if (!res.success) {
      sendToWidget(html, 'timeClockError', { message: res.error });
      return;
    }
    sendToWidget(html, 'rangeRecordsLoaded', { records: res.records, startDate, endDate });
  } catch (err) {
    console.error(`${TAG} ❌ handleGetRecordsByRange:`, err.message);
    sendToWidget(html, 'timeClockError', { message: err.message });
  }
}

async function handleAdminCorrect(html, recordId, correctionNote, newTimestamp, adminName) {
  try {
    sendToWidget(html, 'timeClockLoading', { message: 'Aplicando corrección...' });
    const res = await adminCorrectRecord(recordId, correctionNote, newTimestamp, adminName);
    if (!res.success) {
      sendToWidget(html, 'timeClockError', { message: res.error });
      return;
    }
    sendToWidget(html, 'recordCorrected', { correctedRecord: res.correctedRecord });
    console.log(`${TAG} ✅ recordCorrected por ${adminName}`);
  } catch (err) {
    console.error(`${TAG} ❌ handleAdminCorrect:`, err.message);
    sendToWidget(html, 'timeClockError', { message: err.message });
  }
}

async function handleWeeklySummary(html, weekStartISO) {
  try {
    sendToWidget(html, 'timeClockLoading', { message: 'Calculando resumen...' });
    const res = await getWeeklySummary(weekStartISO);
    if (!res.success) {
      sendToWidget(html, 'timeClockError', { message: res.error });
      return;
    }
    sendToWidget(html, 'weeklySummary', {
      summary: res.summary,
      weekStart: res.weekStart,
      weekEnd: res.weekEnd
    });
  } catch (err) {
    console.error(`${TAG} ❌ handleWeeklySummary:`, err.message);
    sendToWidget(html, 'timeClockError', { message: err.message });
  }
}

async function handleRefreshStatus(html, dateISO) {
  try {
    const iso = dateISO || _todayMadrid();
    const statusRes = await getStaffStatus(iso);
    sendToWidget(html, 'statusRefreshed', {
      statusMap: statusRes.success ? statusRes.statusMap : {},
      dateISO: iso
    });
  } catch (err) {
    console.error(`${TAG} ❌ handleRefreshStatus:`, err.message);
    sendToWidget(html, 'timeClockError', { message: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════════════════════════════════

function sendToWidget(html, type, payload) {
  html.postMessage({ type, ...payload });
}

function _todayMadrid() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });
}