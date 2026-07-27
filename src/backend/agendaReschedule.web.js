// =====================================================
// KAMISUITE — Backend: Mover Booking (Drag & Drop Agenda)
// =====================================================
// VERSION: 1.0.0
// FECHA: 28 de marzo de 2026
//
// Función ligera para mover un booking individual a otra
// hora y/o otro empleado. Obtiene revision internamente
// consultando extendedBookings (no requiere que el widget
// tenga revision en sus datos).
//
// Usado por: PageCode Agenda → moverBooking
// =====================================================

import { Permissions, webMethod } from 'wix-web-module';
import { extendedBookings, bookings } from 'wix-bookings.v2';
import { elevate } from 'wix-auth';

const TAG = '[AgendaReschedule][1.0.0]';
const TIMEZONE_MADRID = 'Europe/Madrid';

// ═══════════════════════════════════════════════════════
// HELPER: Hora Madrid → UTC ISO string
// Mismo patrón validado en testCheckout.web.js
// ═══════════════════════════════════════════════════════
function _madridToUTC(fechaISO, horaHHmm) {
  const [year, month, day] = fechaISO.split('-').map(Number);
  const [hh, mm] = horaHHmm.split(':').map(Number);

  // Calcular offset Madrid: CET (UTC+1) o CEST (UTC+2)
  const marchLast = new Date(Date.UTC(year, 2, 31));
  const marchSun = 31 - marchLast.getUTCDay();
  const cestStart = Date.UTC(year, 2, marchSun, 1, 0, 0);
  const octLast = new Date(Date.UTC(year, 9, 31));
  const octSun = 31 - octLast.getUTCDay();
  const cestEnd = Date.UTC(year, 9, octSun, 1, 0, 0);

  const localAsUTC = Date.UTC(year, month - 1, day, hh, mm, 0);
  const isCEST = localAsUTC >= cestStart && localAsUTC < cestEnd;
  const offsetHours = isCEST ? 2 : 1;

  const utcMs = localAsUTC - offsetHours * 3600000;
  return new Date(utcMs).toISOString();
}

// ═══════════════════════════════════════════════════════
// MOVER BOOKING — Drag & Drop
// ═══════════════════════════════════════════════════════
// Recibe solo bookingId + nueva fecha/hora + nuevo staff.
// Internamente consulta el booking para obtener revision,
// serviceId, scheduleId, y duración original.
// ═══════════════════════════════════════════════════════

export const moverBooking = webMethod(
  Permissions.Anyone,
  async ({ bookingId, nuevaFechaISO, nuevaHoraHHmm, nuevoStaffId }) => {
    try {
      console.log(`${TAG} 🔀 moverBooking: ${bookingId?.substring(0, 8)} → ${nuevaFechaISO} ${nuevaHoraHHmm} | staff=${nuevoStaffId?.substring(0, 8) || 'mismo'}`);

      if (!bookingId || !nuevaFechaISO || !nuevaHoraHHmm) {
        return { ok: false, error: 'Faltan parámetros: bookingId, nuevaFechaISO, nuevaHoraHHmm' };
      }

      // ── 1. Buscar el booking para obtener revision y datos ──
      const elevatedQuery = elevate(extendedBookings.queryExtendedBookings);

      // Query por rango de fecha del día actual (más eficiente que query global)
      const dayStart = new Date(`${nuevaFechaISO}T00:00:00.000Z`);
      const dayEnd = new Date(`${nuevaFechaISO}T23:59:59.999Z`);

      let found = null;
      let offset = 0;
      const MAX_SEARCH = 300;

      while (!found && offset < MAX_SEARCH) {
        const result = await elevatedQuery({
          paging: { limit: 100, offset }
        });
        const items = result?.extendedBookings || [];
        found = items.find(b => b._id === bookingId);
        if (items.length < 100) break;
        offset += 100;
      }

      if (!found) {
        console.error(`${TAG} ❌ Booking ${bookingId} no encontrado en extendedBookings`);
        return { ok: false, error: 'Booking no encontrado' };
      }

      const revision = found.revision;
      if (!revision) {
        return { ok: false, error: 'Sin revision en el booking' };
      }

      const slot = found.bookedEntity?.slot || {};
      const serviceId = slot.serviceId || null;
      const scheduleId = slot.scheduleId || null;
      const originalStaffId = slot.resource?.id || null;
      const originalStart = slot.startDate;
      const originalEnd = slot.endDate;

      if (!originalStart || !originalEnd) {
        return { ok: false, error: 'Booking sin fechas originales' };
      }

      // Duración original en ms
      const durationMs = new Date(originalEnd).getTime() - new Date(originalStart).getTime();
      const staffIdFinal = nuevoStaffId || originalStaffId;

      // ── 2. Calcular nuevos tiempos ──
      const newStartUTC = _madridToUTC(nuevaFechaISO, nuevaHoraHHmm);
      const newStartMs = new Date(newStartUTC).getTime();
      const newEndMs = newStartMs + durationMs;
      const newEndUTC = new Date(newEndMs).toISOString();

      console.log(`${TAG} 📅 ${originalStart.substring(11, 16)} → ${nuevaHoraHHmm} | staff: ${originalStaffId?.substring(0, 8)} → ${staffIdFinal?.substring(0, 8)} | rev=${revision} | dur=${durationMs / 60000}min`);

      // ── 3. Construir slot para rescheduleBooking ──
      const newSlot = {
        startDate: newStartUTC,
        endDate: newEndUTC,
        timezone: TIMEZONE_MADRID
      };
      if (serviceId) newSlot.serviceId = serviceId;
      if (scheduleId) newSlot.scheduleId = scheduleId;
      if (staffIdFinal) newSlot.resource = { id: staffIdFinal };

      const rescheduleOptions = {
        revision: String(revision),
        participantNotification: { notifyParticipants: false },
        flowControlSettings: {
          skipAvailabilityValidation: true,
          ignoreReschedulePolicy: true
        }
      };

      // ── 4. Ejecutar reschedule ──
      const elevatedReschedule = elevate(bookings.rescheduleBooking);

      // Firma Velo: rescheduleBooking(bookingId, slot, options) — 3 params separados
      await elevatedReschedule(bookingId, newSlot, rescheduleOptions);

      console.log(`${TAG} ✅ Booking ${bookingId.substring(0, 8)} movido a ${nuevaHoraHHmm}`);

      return {
        ok: true,
        mensaje: `Reserva movida a ${nuevaHoraHHmm}`
      };

    } catch (error) {
      console.error(`${TAG} ❌ Error moverBooking:`, error);
      return { ok: false, error: error.message };
    }
  }
);