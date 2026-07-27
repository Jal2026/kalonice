// =====================================================
// PAGE CODE — Gestión de Personal KAMISUITE
// HTML Component ID: #htmlStaffConfig
// =====================================================
// VERSION: 1.3.4
// FECHA: 6 de julio de 2026
//
// CHANGELOG:
//   v1.3.4 - 06/07/2026 - Reenvía fechaFin (rango de fechas) a crearStaffBloqueo
//            y crearCierreSalon. Cambio funcional puro: solo se añade el campo
//            fechaFin al payload; el resto de handlers permanecen intactos.
//   v1.1.0 - Eliminado sincronizarStaff (onboarding only)
//            updateFoto recibe base64/fileName/mimeType
//            Añadido eliminarStaff con comprobación bookings
//   v1.0.0 - Versión inicial
// =====================================================

import {
  getStaffCompleto,
  getStaffHorario,
  updateStaffDatosBasicos,
  updateStaffHorario,
  updateStaffFoto,
  updateStaffExterno,
  crearStaffMember,
  eliminarStaffMember,
  getStaffBloqueos,
  crearStaffBloqueo,
  eliminarStaffBloqueo,
  crearCierreSalon,
  getCierresSalon,
  eliminarCierreSalon
} from 'backend/staffConfigLogic.web';

const VERSION = '1.3.4';
const TAG = `[StaffPage][${VERSION}]`;

// ─── HELPER ──────────────────────────────────────────
function sendToWidget(type, data = {}) {
  try {
    $w('#htmlStaffConfig').postMessage({ type, ...data });
  } catch (e) {
    console.error(`${TAG} ❌ sendToWidget(${type}):`, e.message);
  }
}

// ─── HANDLERS ────────────────────────────────────────

async function handleLoadStaff() {
  try {
    console.log(`${TAG} 📋 Cargando staff completo`);
    const result = await getStaffCompleto();
    if (!result.ok) throw new Error(result.error?.message || 'Error al cargar staff');
    sendToWidget('staffLoaded', { staff: result.staff });
  } catch (e) {
    console.error(`${TAG} ❌ handleLoadStaff:`, e.message);
    sendToWidget('error', { error: { message: e.message } });
  }
}

async function handleLoadHorario(msg) {
  try {
    console.log(`${TAG} 📅 Cargando horario: ${msg.staffConfigId}`);
    const result = await getStaffHorario({ staffConfigId: msg.staffConfigId });
    sendToWidget('horarioCargado', {
      staffConfigId: msg.staffConfigId,
      horario:       result.horario || []
    });
  } catch (e) {
    console.error(`${TAG} ❌ handleLoadHorario:`, e.message);
  }
}

async function handleUpdateDatosBasicos(msg) {
  try {
    console.log(`${TAG} ✏️ Actualizando datos: ${msg.staffConfigId}`);
    const result = await updateStaffDatosBasicos({
      staffConfigId: msg.staffConfigId,
      datos:         msg.datos
    });
    if (!result.ok) throw new Error(result.error?.message || 'Error al guardar');
    sendToWidget('datosGuardadosOk', { staffConfigId: msg.staffConfigId });
  } catch (e) {
    console.error(`${TAG} ❌ handleUpdateDatosBasicos:`, e.message);
    sendToWidget('error', { error: { message: e.message } });
  }
}

async function handleUpdateHorario(msg) {
  try {
    console.log(`${TAG} 📅 Actualizando horario: ${msg.staffConfigId}`);
    const result = await updateStaffHorario({
      staffConfigId:  msg.staffConfigId,
      horarioSemanal: msg.horarioSemanal
    });
    if (!result.ok) throw new Error(result.error?.message || 'Error al actualizar horario');
    sendToWidget('horarioGuardadoOk', {
      staffConfigId: msg.staffConfigId,
      creadas:       result.creadas,
      eliminadas:    result.eliminadas
    });
  } catch (e) {
    console.error(`${TAG} ❌ handleUpdateHorario:`, e.message);
    sendToWidget('error', { error: { message: e.message } });
  }
}

async function handleUpdateFoto(msg) {
  try {
    console.log(`${TAG} 📸 Subiendo foto: ${msg.staffConfigId} | ${msg.fileName}`);
    const result = await updateStaffFoto({
      staffConfigId: msg.staffConfigId,
      base64Data:    msg.base64Data,
      fileName:      msg.fileName,
      mimeType:      msg.mimeType
    });
    if (!result.ok) throw new Error(result.error?.message || 'Error al subir foto');
    sendToWidget('fotoGuardadaOk', {
      staffConfigId: msg.staffConfigId,
      publicUrl:     result.publicUrl
    });
  } catch (e) {
    console.error(`${TAG} ❌ handleUpdateFoto:`, e.message);
    sendToWidget('error', { error: { message: e.message } });
  }
}

async function handleUpdateExterno(msg) {
  try {
    console.log(`${TAG} 💼 Actualizando externo: ${msg.staffConfigId}`);
    const result = await updateStaffExterno({
      staffConfigId:        msg.staffConfigId,
      commissionPercentage: msg.commissionPercentage,
      activeStatus:         msg.activeStatus
    });
    if (!result.ok) throw new Error(result.error?.message || 'Error al actualizar externo');
    sendToWidget('externoGuardadoOk', { staffConfigId: msg.staffConfigId });
  } catch (e) {
    console.error(`${TAG} ❌ handleUpdateExterno:`, e.message);
    sendToWidget('error', { error: { message: e.message } });
  }
}

async function handleCrearStaff(msg) {
  try {
    console.log(`${TAG} ➕ Creando staff: ${msg.datos?.displayName}`);
    const result = await crearStaffMember({ datos: msg.datos });
    if (!result.ok) throw new Error(result.error?.message || 'Error al crear miembro');
    sendToWidget('nuevoCreado', {
      staffConfigId: result.staffConfigId,
      wixResourceId: result.wixResourceId
    });
  } catch (e) {
    console.error(`${TAG} ❌ handleCrearStaff:`, e.message);
    sendToWidget('error', { error: { message: e.message } });
  }
}

async function handleEliminarStaff(msg) {
  try {
    console.log(`${TAG} 🗑️ Eliminando staff: ${msg.staffConfigId}`);
    const result = await eliminarStaffMember({ staffConfigId: msg.staffConfigId });

    if (!result.ok && result.tieneBookingsFuturos) {
      // Devolver al widget la lista de bookings bloqueantes
      sendToWidget('errorEliminar', {
        tieneBookingsFuturos: true,
        bookingsFuturos:      result.bookingsFuturos || [],
        mensaje:              result.error?.message || 'Tiene citas pendientes'
      });
      return;
    }

    if (!result.ok) throw new Error(result.error?.message || 'Error al eliminar');

    sendToWidget('staffEliminadoOk', {
      staffConfigId: msg.staffConfigId,
      displayName:   result.displayName
    });
    // Recargar lista
    await handleLoadStaff();
  } catch (e) {
    console.error(`${TAG} ❌ handleEliminarStaff:`, e.message);
    sendToWidget('error', { error: { message: e.message } });
  }
}

async function handleGetBloqueos(msg) {
  try {
    const result = await getStaffBloqueos({ staffConfigId: msg.staffConfigId });
    sendToWidget('bloqueosCargados', {
      staffConfigId: msg.staffConfigId,
      bloqueos:      result.bloqueos || []
    });
  } catch (e) {
    console.error(`${TAG} ❌ handleGetBloqueos:`, e.message);
    sendToWidget('error', { error: { message: e.message } });
  }
}

async function handleCrearBloqueo(msg) {
  try {
    const result = await crearStaffBloqueo({
      staffConfigId: msg.staffConfigId,
      fecha:         msg.fecha,
      fechaFin:      msg.fechaFin,   // v1.3.4 — rango opcional
      inicio:        msg.inicio,
      fin:           msg.fin,
      motivo:        msg.motivo
    });
    if (!result.ok) throw new Error(result.error?.message || 'Error al crear bloqueo');
    sendToWidget('bloqueoCreado', { staffConfigId: msg.staffConfigId, sessionId: result.sessionId });
  } catch (e) {
    console.error(`${TAG} ❌ handleCrearBloqueo:`, e.message);
    sendToWidget('error', { error: { message: e.message } });
  }
}

async function handleEliminarBloqueo(msg) {
  try {
    const result = await eliminarStaffBloqueo({ sessionId: msg.sessionId });
    if (!result.ok) throw new Error(result.error?.message || 'Error al eliminar bloqueo');
    sendToWidget('bloqueoEliminado', { staffConfigId: msg.staffConfigId, sessionId: msg.sessionId });
  } catch (e) {
    console.error(`${TAG} ❌ handleEliminarBloqueo:`, e.message);
    sendToWidget('error', { error: { message: e.message } });
  }
}

async function handleCierreSalon(msg) {
  try {
    const result = await crearCierreSalon({
      fecha:    msg.fecha,
      fechaFin: msg.fechaFin,   // v1.3.4 — rango opcional
      inicio:   msg.inicio,
      fin:      msg.fin,
      motivo:   msg.motivo
    });
    if (!result.ok) throw new Error(result.error?.message || 'Error al crear cierre');
    sendToWidget('cierreSalonOk', {
      exitosos:   result.exitosos,
      total:      result.total,
      resultados: result.resultados
    });
    // Recargar lista de cierres
    await handleGetCierres();
  } catch (e) {
    console.error(`${TAG} ❌ handleCierreSalon:`, e.message);
    sendToWidget('error', { error: { message: e.message } });
  }
}

async function handleGetCierres() {
  try {
    const result = await getCierresSalon();
    sendToWidget('cierresCargados', { cierres: result.cierres || [] });
  } catch (e) {
    console.error(`${TAG} ❌ handleGetCierres:`, e.message);
  }
}

async function handleEliminarCierre(msg) {
  try {
    const result = await eliminarCierreSalon({
      fecha:  msg.fecha,
      inicio: msg.inicio,
      fin:    msg.fin
    });
    if (!result.ok) throw new Error(result.error?.message || 'Error al eliminar cierre');
    sendToWidget('cierreEliminadoOk', { eliminadas: result.eliminadas });
    await handleGetCierres();
  } catch (e) {
    console.error(`${TAG} ❌ handleEliminarCierre:`, e.message);
    sendToWidget('error', { error: { message: e.message } });
  }
}

// ─── LISTENER PRINCIPAL ──────────────────────────────
$w.onReady(() => {
  console.log(`${TAG} 🚀 Página lista`);

  $w('#htmlStaffConfig').onMessage(async e => {
    const msg = e.data || {};
    console.log(`${TAG} ← widget: ${msg.type}`);

    switch (msg.type) {
      case 'ready':
        await handleLoadStaff();
        break;
      case 'loadStaff':
        await handleLoadStaff();
        break;
      case 'loadHorario':
        await handleLoadHorario(msg);
        break;
      case 'updateDatosBasicos':
        await handleUpdateDatosBasicos(msg);
        break;
      case 'updateHorario':
        await handleUpdateHorario(msg);
        break;
      case 'updateFoto':
        await handleUpdateFoto(msg);
        break;
      case 'updateExterno':
        await handleUpdateExterno(msg);
        break;
      case 'crearStaff':
        await handleCrearStaff(msg);
        break;
      case 'eliminarStaff':
        await handleEliminarStaff(msg);
        break;
      case 'getBloqueos':
        await handleGetBloqueos(msg);
        break;
      case 'crearBloqueo':
        await handleCrearBloqueo(msg);
        break;
      case 'eliminarBloqueo':
        await handleEliminarBloqueo(msg);
        break;
      case 'cierreSalon':
        await handleCierreSalon(msg);
        break;
      case 'getCierres':
        await handleGetCierres();
        break;
      case 'eliminarCierre':
        await handleEliminarCierre(msg);
        break;
      default:
        console.warn(`${TAG} ⚠️ Mensaje desconocido: ${msg.type}`);
    }
  });
});