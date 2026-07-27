// =====================================================
// BACKEND memberAreaLogic.web - Mi Espacio KAMISUITE v1.0.4
// =====================================================
// ARCHIVO: backend/memberAreaLogic.web.js
//
// CAMBIOS v1.0.1:
// - FIX: queryExtendedBookings no soporta filtro contactId
//   → query por startDate, post-filtro por contactId OR email
// - getMisCitas recibe { contactId, email } para fallback
//
// CAMBIOS v1.0.3:
// - FIX: agrupación idéntica a checkout (contactId + gap 90min)
// - Widget muestra servicios desglosados dentro de cada tarjeta
// - Fases técnicas (Lavado, Secado, Proceso) ocultas en widget
//
// CAMBIOS v1.0.4:
// - PERF: 4 queries en paralelo con Promise.all (antes secuenciales)
// - PERF: bookings futuros limitados a 90 días (antes infinito)
// - PERF: cap paginación reducido de 500 a 300
//
// FUNCIONES:
//   - getMisCitas({ contactId }) → próximas + anteriores
//   - cancelarMiCita({ contactId, bookingIds }) → cancela con validación
//   - cancelarMiCitaExterno({ contactId, registroId, sessionId }) → cancela externo
//
// NOTAS:
//   - Valida ownership antes de cancelar (contactId debe coincidir)
//   - Próximas: extendedBookings + SvExternalRecords futuros
//   - Anteriores: PaymentReservations + SvExternalRecords pasados
//   - Reschedule se reutiliza desde testCheckout.web (page code importa directo)
// =====================================================

import { Permissions, webMethod } from 'wix-web-module';
import { extendedBookings } from 'wix-bookings.v2';
import { bookings as bookingsV1, sessions } from 'wix-bookings-backend';
import { elevate } from 'wix-auth';
import wixData from 'wix-data';

const TAG = '[MemberArea v1.0.4]';
const CMS_EXTERNAL_RECORDS = 'SvExternalRecords';
const CMS_PAGOS = 'PaymentReservations';
const TIMEZONE = 'Europe/Madrid';

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function safeErr(e) {
  return { message: e?.message || String(e) };
}

function formatMadridDate(isoDate) {
  if (!isoDate) return '';
  return new Date(isoDate).toLocaleDateString('es-ES', {
    timeZone: TIMEZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  });
}

function formatMadridTime(isoDate) {
  if (!isoDate) return '';
  return new Date(isoDate).toLocaleTimeString('es-ES', {
    timeZone: TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
}

// Servicios técnicos internos que no se muestran al cliente
const SERVICIOS_OCULTOS = new Set(['Lavado', 'Secado', 'Proceso']);

// ═══════════════════════════════════════════════════════════════════════════
// QUERY HELPERS (extraídos para paralelización)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Trae bookings futuros confirmados del salón (ventana 90 días) y
 * post-filtra por contactId/email del member.
 */
async function _fetchBookingsFuturos(contactId, emailLower, nowISO) {
  const result = [];
  try {
    const elevatedQuery = elevate(extendedBookings.queryExtendedBookings);

    // Limitar a 90 días vista (ningún cliente tiene citas más allá)
    const maxDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    const maxISO = maxDate.toISOString();

    let allItems = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore && offset < 300) {
      const res = await elevatedQuery({
        filter: {
          $and: [
            { startDate: { $gte: nowISO } },
            { startDate: { $lte: maxISO } }
          ]
        },
        paging: { limit: 100, offset: offset }
      });

      const items = res?.extendedBookings || [];
      allItems = allItems.concat(items);
      hasMore = items.length === 100;
      offset += 100;
    }

    console.log(`${TAG} 📋 Bookings futuros total (90d): ${allItems.length}`);

    // Post-filtrar: contactId OR email del booking coincide con el member
    const confirmados = allItems.filter(item => {
      if (item.booking?.status !== 'CONFIRMED') return false;
      const bk = item.booking;
      const bkContactId = bk.contactDetails?.contactId || bk.contactId || '';
      const bkEmail = (bk.contactDetails?.email || '').toLowerCase().trim();

      if (bkContactId && bkContactId === contactId) return true;
      if (emailLower && bkEmail && bkEmail === emailLower) return true;
      return false;
    });

    console.log(`${TAG} 📋 Bookings próximos confirmados: ${confirmados.length}`);

    // Agrupación idéntica a getBookingsAgrupados del checkout:
    // mismo contacto + slots contiguos (gap ≤ 90 min) = mismo pack/visita
    const GAP_MAX_MS = 90 * 60 * 1000;

    const sorted = [...confirmados].sort((a, b) => {
      const sa = new Date(a.booking?.bookedEntity?.slot?.startDate || 0).getTime();
      const sb = new Date(b.booking?.bookedEntity?.slot?.startDate || 0).getTime();
      return sa - sb;
    });

    let currentPack = null;

    for (const item of sorted) {
      const bk = item.booking;
      const start = new Date(bk.bookedEntity?.slot?.startDate || 0).getTime();
      const end = new Date(bk.bookedEntity?.slot?.endDate || 0).getTime();

      const svcInfo = {
        bookingId: bk._id,
        serviceName: bk.bookedEntity?.title || 'Servicio',
        startDate: bk.bookedEntity?.slot?.startDate,
        endDate: bk.bookedEntity?.slot?.endDate,
        staffName: bk.bookedEntity?.slot?.resource?.name || '',
        staffId: bk.bookedEntity?.slot?.resource?._id || '',
        serviceId: bk.bookedEntity?.slot?.serviceId || '',
        scheduleId: bk.bookedEntity?.slot?.scheduleId || '',
        revision: bk.revision || null
      };

      const sameGroup = currentPack && (start - currentPack.lastEnd) <= GAP_MAX_MS;

      if (sameGroup) {
        currentPack.servicios.push(svcInfo);
        if (end > currentPack.lastEnd) currentPack.lastEnd = end;
      } else {
        if (currentPack) result.push(currentPack);
        currentPack = {
          tipo: 'booking',
          servicios: [svcInfo],
          firstStart: start,
          lastEnd: end
        };
      }
    }
    if (currentPack) result.push(currentPack);

  } catch (bkErr) {
    console.warn(`${TAG} ⚠️ Error bookings próximos:`, bkErr.message);
  }
  return result;
}

/**
 * Trae SvExternalRecords futuros del contacto.
 */
async function _fetchExternosFuturos(contactId, now) {
  const result = [];
  try {
    const extResult = await wixData.query(CMS_EXTERNAL_RECORDS)
      .eq('contactId', contactId)
      .ge('date', now)
      .ascending('date')
      .limit(20)
      .find({ suppressAuth: true });

    const filtrados = (extResult.items || []).filter(item =>
      item.status !== 'BLOQUEADO' && item.category !== 'BLOQUEO'
    );

    for (const item of filtrados) {
      result.push({
        tipo: 'externo',
        registroId: item._id,
        sessionId: item.sessionId || '',
        servicios: [{
          serviceName: item.modality || item.category || 'Servicio externo',
          startDate: item.date ? new Date(item.date).toISOString() : '',
          endDate: item.date ? new Date(new Date(item.date).getTime() + (item.totalDuration || 60) * 60000).toISOString() : '',
          staffName: 'Emy'
        }],
        firstStart: item.date ? new Date(item.date).getTime() : 0,
        lastEnd: item.date ? new Date(item.date).getTime() + (item.totalDuration || 60) * 60000 : 0,
        precio: item.totalPrice || 0,
        status: item.status || ''
      });
    }
  } catch (extErr) {
    console.warn(`${TAG} ⚠️ Error externos próximos:`, extErr.message);
  }
  return result;
}

/**
 * Trae PaymentReservations del contacto (anteriores).
 */
async function _fetchPagosAnteriores(contactId) {
  const result = [];
  try {
    const pagosResult = await wixData.query(CMS_PAGOS)
      .eq('contactId', contactId)
      .descending('fechaReserva')
      .limit(30)
      .find({ suppressAuth: true });

    for (const item of (pagosResult.items || [])) {
      result.push({
        id: `ant_p_${item._id}`,
        tipo: 'booking',
        titulo: item.descripcion || 'Servicio',
        fecha: item.fechaReserva ? formatMadridDate(new Date(item.fechaReserva).toISOString()) : '',
        staff: item.staff || '',
        precio: item.importeTotal || 0,
        tipoPago: item.tipoPago || ''
      });
    }
  } catch (pagosErr) {
    console.warn(`${TAG} ⚠️ Error PaymentReservations:`, pagosErr.message);
  }
  return result;
}

/**
 * Trae SvExternalRecords pasados del contacto (anteriores).
 */
async function _fetchExternosPasados(contactId, now) {
  const result = [];
  try {
    const extPastResult = await wixData.query(CMS_EXTERNAL_RECORDS)
      .eq('contactId', contactId)
      .lt('date', now)
      .descending('date')
      .limit(20)
      .find({ suppressAuth: true });

    const filtrados = (extPastResult.items || []).filter(item =>
      item.status !== 'BLOQUEADO' && item.category !== 'BLOQUEO'
    );

    for (const item of filtrados) {
      result.push({
        id: `ant_e_${item._id}`,
        tipo: 'externo',
        titulo: item.modality || item.category || 'Servicio externo',
        fecha: item.date ? formatMadridDate(new Date(item.date).toISOString()) : '',
        staff: 'Emy',
        precio: item.totalPrice || 0,
        tipoPago: item.status === 'PAGADO' ? '✓' : ''
      });
    }
  } catch (extPastErr) {
    console.warn(`${TAG} ⚠️ Error externos pasados:`, extPastErr.message);
  }
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// GET MIS CITAS
// ═══════════════════════════════════════════════════════════════════════════

export const getMisCitas = webMethod(
  Permissions.Anyone,
  async ({ contactId, email }) => {
    try {
      if (!contactId) return { ok: false, error: 'contactId requerido' };
      console.log(`${TAG} 📋 getMisCitas: contactId=${contactId} | email=${email || 'N/A'}`);

      const now = new Date();
      const nowISO = now.toISOString();
      const emailLower = (email || '').toLowerCase().trim();

      // ─── TODAS LAS QUERIES EN PARALELO ───
      const [
        bookingsPacks,
        externosFuturos,
        pagosAnteriores,
        externosPasados
      ] = await Promise.all([
        _fetchBookingsFuturos(contactId, emailLower, nowISO),
        _fetchExternosFuturos(contactId, now),
        _fetchPagosAnteriores(contactId),
        _fetchExternosPasados(contactId, now)
      ]);

      // ─── MONTAR PRÓXIMAS ───
      const proximas = [...bookingsPacks, ...externosFuturos];
      proximas.sort((a, b) => a.firstStart - b.firstStart);

      // Formatear próximas para widget
      const proximasOut = proximas.map((p, i) => {
        const nombresVisibles = p.servicios
          .map(s => s.serviceName)
          .filter(n => n && !SERVICIOS_OCULTOS.has(n));
        const staffs = [...new Set(p.servicios.map(s => s.staffName).filter(Boolean))];
        const firstSvc = p.servicios[0] || {};
        const lastSvc = p.servicios[p.servicios.length - 1] || {};

        return {
          id: `prox_${i}`,
          tipo: p.tipo,
          titulo: nombresVisibles.join(' + ') || 'Cita',
          fecha: firstSvc.startDate ? formatMadridDate(firstSvc.startDate) : '',
          horaInicio: firstSvc.startDate ? formatMadridTime(firstSvc.startDate) : '',
          horaFin: lastSvc.endDate ? formatMadridTime(lastSvc.endDate) : '',
          staff: staffs.join(', '),
          precio: p.precio || 0,
          bookingIds: p.servicios.map(s => s.bookingId).filter(Boolean),
          serviceId: firstSvc.serviceId || '',
          staffId: firstSvc.staffId || '',
          registroId: p.registroId || '',
          sessionId: p.sessionId || '',
          servicios: p.servicios
        };
      });

      // ─── MONTAR ANTERIORES ───
      const anteriores = [...pagosAnteriores, ...externosPasados];

      console.log(`${TAG} ✅ Próximas: ${proximasOut.length} | Anteriores: ${anteriores.length}`);

      return { ok: true, proximas: proximasOut, anteriores: anteriores };

    } catch (error) {
      console.error(`${TAG} ❌ getMisCitas:`, error);
      return { ok: false, error: safeErr(error), proximas: [], anteriores: [] };
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// CANCELAR MI CITA (booking regular)
// Valida que los bookings pertenecen al contactId antes de cancelar
// ═══════════════════════════════════════════════════════════════════════════

export const cancelarMiCita = webMethod(
  Permissions.Anyone,
  async ({ contactId, bookingIds }) => {
    try {
      if (!contactId || !Array.isArray(bookingIds) || bookingIds.length === 0) {
        return { ok: false, error: 'Datos insuficientes' };
      }

      console.log(`${TAG} 🗑️ cancelarMiCita: ${bookingIds.length} bookings | contactId=${contactId}`);

      // Validar ownership: verificar que cada booking pertenece a este contacto
      const elevatedQueryBk = elevate(extendedBookings.queryExtendedBookings);

      for (const bid of bookingIds) {
        try {
          const result = await elevatedQueryBk({
            filter: { bookingId: bid },
            paging: { limit: 1 }
          });
          const bk = result?.extendedBookings?.[0]?.booking;
          const bkContactId = bk?.contactDetails?.contactId || bk?.contactId || '';
          if (bkContactId !== contactId) {
            console.warn(`${TAG} ⚠️ Booking ${bid} no pertenece a contactId ${contactId}`);
            return { ok: false, error: 'No autorizado para cancelar esta cita' };
          }
        } catch (vErr) {
          console.warn(`${TAG} ⚠️ Error validando booking ${bid}:`, vErr.message);
        }
      }

      // Cancelar bookings
      const cancelElevated = elevate(bookingsV1.cancelBooking);
      const resultados = await Promise.allSettled(
        bookingIds.map(bid =>
          cancelElevated(bid, {
            participantNotification: { notifyParticipants: false },
            flowControlSettings: { ignoreCancellationPolicy: true },
            suppressAuth: true
          })
        )
      );

      const exitosas = resultados.filter(r => r.status === 'fulfilled').length;
      const fallidas = resultados.filter(r => r.status === 'rejected');

      if (fallidas.length > 0) {
        fallidas.forEach((r, i) => {
          console.error(`${TAG} ❌ Error cancelando:`, r.reason?.message);
        });
      }

      console.log(`${TAG} ✅ Canceladas: ${exitosas}/${bookingIds.length}`);
      return { ok: exitosas > 0, exitosas, total: bookingIds.length };

    } catch (error) {
      console.error(`${TAG} ❌ cancelarMiCita:`, error);
      return { ok: false, error: safeErr(error) };
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// CANCELAR MI CITA EXTERNO
// Valida ownership → borra session del calendario → borra registro CMS
// ═══════════════════════════════════════════════════════════════════════════

export const cancelarMiCitaExterno = webMethod(
  Permissions.Anyone,
  async ({ contactId, registroId, sessionId }) => {
    try {
      if (!contactId || !registroId) {
        return { ok: false, error: 'Datos insuficientes' };
      }

      console.log(`${TAG} 🗑️ cancelarMiCitaExterno: reg=${registroId} | session=${sessionId}`);

      // Validar ownership
      const registro = await wixData.get(CMS_EXTERNAL_RECORDS, registroId, { suppressAuth: true });
      if (!registro || registro.contactId !== contactId) {
        return { ok: false, error: 'No autorizado para cancelar esta cita' };
      }

      // Borrar session del calendario Wix
      if (sessionId) {
        try {
          const elevatedDelete = elevate(sessions.deleteSession);
          await elevatedDelete(sessionId);
          console.log(`${TAG} ✅ Session eliminada: ${sessionId}`);
        } catch (sessErr) {
          console.warn(`${TAG} ⚠️ Error eliminando session:`, sessErr.message);
        }
      }

      // Borrar registro CMS
      await wixData.remove(CMS_EXTERNAL_RECORDS, registroId, { suppressAuth: true });
      console.log(`${TAG} ✅ Registro CMS eliminado: ${registroId}`);

      return { ok: true };

    } catch (error) {
      console.error(`${TAG} ❌ cancelarMiCitaExterno:`, error);
      return { ok: false, error: safeErr(error) };
    }
  }
);