// ═══════════════════════════════════════════════════════════════
// Page Code — PaymentReservations Editor  v2.0.0
// Bridge entre widget HTML y paymentReservationsLogic.web.js
// ═══════════════════════════════════════════════════════════════
// CHANGELOG:
//   v2.0.0 (25-jun-2026) — SIMPLIFICACIÓN CRUD PURO.
//     · Eliminados imports de resolverContactIdsReales y exportarTodoJSON
//       (el widget ya no expone diagnóstico CRM ni exportación).
//     · Eliminados handlers 'resolveRealCids' y 'exportJSON' (muertos).
//     · Se conservan: 'ready', 'refresh', 'save', 'delete' — el contrato
//       postMessage del CRUD queda intacto.
//   v1.3.0 (7-may-2026) — handlers 'delete' y 'refresh'.
//   v1.2.1/v1.2.0/v1.1.0/v1.0.0 — diagnóstico CRM (retirado en v2.0.0).
// ═══════════════════════════════════════════════════════════════

import {
  listarPaymentReservations,
  actualizarPaymentReservation,
  eliminarPaymentReservation
} from 'backend/paymentReservationsLogic.web';

$w.onReady(function () {
  const widget = $w('#htmlPaymentReservations');

  widget.onMessage(async (event) => {
    const msg = event.data;
    if (!msg || typeof msg !== 'object') return;

    // ── Widget listo: cargar datos ──
    if (msg.type === 'ready') {
      try {
        const result = await listarPaymentReservations();
        if (result.success) {
          widget.postMessage({
            type: 'data',
            payload: { items: result.items, total: result.total }
          });
        } else {
          widget.postMessage({
            type: 'error',
            message: result.error || 'Error cargando datos'
          });
        }
      } catch (err) {
        widget.postMessage({
          type: 'error',
          message: err.message || 'Error inesperado'
        });
      }
    }

    // ── Refrescar lista completa (mismo handler que ready) ──
    if (msg.type === 'refresh') {
      try {
        const result = await listarPaymentReservations();
        if (result.success) {
          widget.postMessage({
            type: 'data',
            payload: { items: result.items, total: result.total, isRefresh: true }
          });
        } else {
          widget.postMessage({
            type: 'refreshError',
            message: result.error || 'Error refrescando datos'
          });
        }
      } catch (err) {
        widget.postMessage({
          type: 'refreshError',
          message: err.message || 'Error inesperado'
        });
      }
    }

    // ── Guardar edición ──
    if (msg.type === 'save') {
      try {
        const { _id, campos } = msg.payload;
        const result = await actualizarPaymentReservation(_id, campos);
        if (result.success) {
          widget.postMessage({
            type: 'saved',
            payload: { item: result.item }
          });
        } else {
          widget.postMessage({
            type: 'saveError',
            message: result.error || 'Error guardando'
          });
        }
      } catch (err) {
        widget.postMessage({
          type: 'saveError',
          message: err.message || 'Error inesperado'
        });
      }
    }

    // ── Eliminar registro ──
    if (msg.type === 'delete') {
      try {
        const { _id } = msg.payload || {};
        if (!_id) {
          widget.postMessage({
            type: 'deleteError',
            message: '_id no proporcionado'
          });
          return;
        }
        const result = await eliminarPaymentReservation(_id);
        if (result.success) {
          widget.postMessage({
            type: 'deleted',
            payload: { deletedId: result.deletedId }
          });
        } else {
          widget.postMessage({
            type: 'deleteError',
            message: result.error || 'Error eliminando'
          });
        }
      } catch (err) {
        widget.postMessage({
          type: 'deleteError',
          message: err.message || 'Error inesperado'
        });
      }
    }
  });
});