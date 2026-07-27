// =====================================================
// BACKEND - Cancelación Reservas KAMISUITE v1.1
// =====================================================
// ✅ Formato web.js (actual, no .jsw deprecated)
// ✅ Filtro $and correcto para Wix Query Language
// ✅ Filtros: rango fechas, staff, estado, cliente
// ✅ Cancelación con V1 (borra sesiones automáticamente)
//
// CAMBIOS v1.1:
// - NEW: obtenerReservasFiltradas también lee SvExternalRecords
//   Las citas externas se mapean al mismo formato con isExterno=true
// - NEW: cancelarReservas detecta isExterno y usa deleteSession + remove CMS
//   en vez de cancelBooking
// - NEW: imports de wixData y sessions para gestionar externos
// - TODO lo demás INTACTO (obtenerListaStaff, testPing)
// =====================================================

import { Permissions, webMethod } from 'wix-web-module';
import { extendedBookings } from 'wix-bookings.v2';
import { bookings as bookingsV1, sessions, resources as resourcesBackend } from 'wix-bookings-backend';
import { elevate } from 'wix-auth';
import wixData from 'wix-data';

const TAG = '[CancelReservas v1.1]';
const CMS_REGISTRO = 'SvExternalRecords';
const TIMEZONE = 'Europe/Madrid';

// ═══════════════════════════════════════════════════════════════════════════
// OBTENER RESERVAS CON FILTROS
// ═══════════════════════════════════════════════════════════════════════════

export const obtenerReservasFiltradas = webMethod(
  Permissions.Anyone,
  async ({ fechaInicio, fechaFin, staffId, estado, busquedaCliente }) => {
    try {
      console.log(`${TAG} 🔍 Buscando reservas: ${fechaInicio} - ${fechaFin}`);
      console.log(`${TAG} 🔍 Filtros: staff=${staffId || 'todos'}, estado=${estado || 'todos'}, cliente=${busquedaCliente || 'todos'}`);

      const elevatedQuery = elevate(extendedBookings.queryExtendedBookings);

      // ═══════════════════════════════════════════════════════════════════
      // Construir filtro con sintaxis $and correcta
      // ═══════════════════════════════════════════════════════════════════
      const startOfDay = `${fechaInicio}T00:00:00.000Z`;
      const endOfDay = `${fechaFin}T23:59:59.999Z`;

      let filterConditions = [
        { startDate: { $gte: startOfDay } },
        { startDate: { $lte: endOfDay } }
      ];

      // Filtro por staff si se especifica
      if (staffId && staffId !== 'todos') {
        filterConditions.push({ 'bookedEntity.slot.resource.id': { $eq: staffId } });
      }

      // Filtro por estado si se especifica
      if (estado && estado !== 'todos') {
        filterConditions.push({ status: { $eq: estado } });
      }

      let allBookings = [];
      let offset = 0;
      const pageSize = 100;
      let hasMore = true;

      while (hasMore && offset < 500) {
        const result = await elevatedQuery({
          filter: { $and: filterConditions },
          paging: { limit: pageSize, offset: offset }
        });

        const items = result?.extendedBookings || [];
        allBookings = allBookings.concat(items);

        hasMore = items.length === pageSize;
        offset += pageSize;
      }

      console.log(`${TAG} 📦 Bookings Wix encontrados: ${allBookings.length}`);

      // Filtrar por búsqueda de cliente (en memoria, ya que no hay filtro nativo)
      let reservasFiltradas = allBookings;

      if (busquedaCliente && busquedaCliente.trim() !== '') {
        const busqueda = busquedaCliente.toLowerCase().trim();
        reservasFiltradas = allBookings.filter(item => {
          const bk = item.booking;
          const nombre = (bk.contactDetails?.firstName || '').toLowerCase();
          const apellido = (bk.contactDetails?.lastName || '').toLowerCase();
          const email = (bk.contactDetails?.email || '').toLowerCase();
          const telefono = (bk.contactDetails?.phone || '').toLowerCase();

          return nombre.includes(busqueda) ||
                 apellido.includes(busqueda) ||
                 email.includes(busqueda) ||
                 telefono.includes(busqueda) ||
                 `${nombre} ${apellido}`.includes(busqueda);
        });
      }

      // Si no se especificó estado en el filtro API, filtrar solo confirmadas por defecto
      if (!estado || estado === 'todos') {
        reservasFiltradas = reservasFiltradas.filter(item =>
          item.booking?.status === 'CONFIRMED' || item.booking?.status === 'PENDING'
        );
      }

      console.log(`${TAG} ✅ Reservas Wix después de filtros: ${reservasFiltradas.length}`);

      // Mapear a formato limpio para el frontend
      const reservas = reservasFiltradas.map(item => {
        const bk = item.booking;
        return {
          id: bk._id,
          cliente: {
            nombre: bk.contactDetails?.firstName || '',
            apellido: bk.contactDetails?.lastName || '',
            email: bk.contactDetails?.email || '',
            telefono: bk.contactDetails?.phone || ''
          },
          servicio: bk.bookedEntity?.title || 'Sin servicio',
          fecha: bk.bookedEntity?.slot?.startDate,
          fechaFin: bk.bookedEntity?.slot?.endDate,
          staff: {
            id: bk.bookedEntity?.slot?.resource?.id || '',
            nombre: bk.bookedEntity?.slot?.resource?.name || 'Sin asignar'
          },
          estado: bk.status,
          createdDate: bk._createdDate,
          isExterno: false
        };
      });

      // ═══════════════════════════════════════════════════════════════════
      // v1.1: LEER TAMBIÉN CITAS EXTERNAS DE SvExternalRecords
      // ═══════════════════════════════════════════════════════════════════
      let reservasExternas = [];
      try {
        // Rango UTC ampliado para cubrir zona horaria Madrid
        const startUTC = new Date(new Date(`${fechaInicio}T00:00:00`).getTime() - 3 * 3600000);
        const endUTC = new Date(new Date(`${fechaFin}T23:59:59`).getTime() + 3 * 3600000);

        const cmsResult = await wixData.query(CMS_REGISTRO)
          .ge('date', startUTC)
          .le('date', endUTC)
          .ascending('date')
          .limit(200)
          .find();

        let externosItems = cmsResult.items || [];
        console.log(`${TAG} 📦 Citas externas CMS brutas: ${externosItems.length}`);

        // Filtrar por rango de fechas exacto en hora Madrid
        externosItems = externosItems.filter(item => {
          if (!item.date) return false;
          const d = new Date(item.date);
          const madridDate = d.toLocaleDateString('en-CA', { timeZone: TIMEZONE });
          return madridDate >= fechaInicio && madridDate <= fechaFin;
        });

        // Excluir BLOQUEOS (solo citas reales)
        externosItems = externosItems.filter(item =>
          item.status !== 'BLOQUEADO' && item.category !== 'BLOQUEO'
        );

        // Filtro por estado: solo CONFIRMADA si no se especifica
        if (!estado || estado === 'todos') {
          externosItems = externosItems.filter(item => item.status === 'CONFIRMADA');
        }

        // Filtro por búsqueda de cliente
        if (busquedaCliente && busquedaCliente.trim() !== '') {
          const busqueda2 = busquedaCliente.toLowerCase().trim();
          externosItems = externosItems.filter(item => {
            const n = (item.clientName || '').toLowerCase();
            const e = (item.clientEmail || '').toLowerCase();
            const t = (item.clientPhone || '').toLowerCase();
            return n.includes(busqueda2) || e.includes(busqueda2) || t.includes(busqueda2);
          });
        }

        // Mapear al mismo formato que reservas Wix
        reservasExternas = externosItems.map(item => {
          const dateObj = item.date ? new Date(item.date) : null;
          const endDate = dateObj && item.totalDuration
            ? new Date(dateObj.getTime() + item.totalDuration * 60000)
            : dateObj;

          const nombreCompleto = (item.clientName || '').trim();
          const partes = nombreCompleto.split(' ');
          const nombre = partes[0] || '';
          const apellido = partes.slice(1).join(' ') || '';

          return {
            id: item._id,
            cliente: {
              nombre,
              apellido,
              email: item.clientEmail || '',
              telefono: item.clientPhone || ''
            },
            servicio: `EXT: ${item.modality || item.category || 'Servicio externo'}`,
            fecha: dateObj ? dateObj.toISOString() : '',
            fechaFin: endDate ? endDate.toISOString() : '',
            staff: { id: '', nombre: 'EMY' },
            estado: item.status === 'CONFIRMADA' ? 'CONFIRMED' : item.status,
            createdDate: item._createdDate || '',
            isExterno: true,
            sessionId: item.sessionId || '',
            registroId: item._id
          };
        });

        console.log(`${TAG} ✅ Citas externas después de filtros: ${reservasExternas.length}`);

      } catch (extErr) {
        console.warn(`${TAG} ⚠️ Error leyendo externos: ${extErr.message}`);
        // No falla la función entera, solo no incluye externos
      }

      // ═══════════════════════════════════════════════════════════════════
      // MERGE: Wix Bookings + Externos, ordenar por fecha
      // ═══════════════════════════════════════════════════════════════════
      const todasReservas = [...reservas, ...reservasExternas];
      todasReservas.sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));

      console.log(`${TAG} ✅ Total: ${todasReservas.length} (${reservas.length} Wix + ${reservasExternas.length} externos)`);

      return {
        ok: true,
        reservas: todasReservas,
        total: todasReservas.length
      };

    } catch (error) {
      console.error(`${TAG} ❌ Error:`, error);
      return { ok: false, error: error.message, reservas: [] };
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// OBTENER LISTA DE STAFF (usando queryResourceCatalog) — SIN CAMBIOS
// ═══════════════════════════════════════════════════════════════════════════

// Solo excluir PROCESO del dropdown (CUALQUIERA sí se muestra)
const STAFF_BLOCKLIST_NAMES = new Set(['PROCESO']);

function normalizeStaffLabel(label) {
  return String(label || '').trim();
}

function isBlockedStaffLabel(label) {
  const up = normalizeStaffLabel(label).toUpperCase();
  return STAFF_BLOCKLIST_NAMES.has(up);
}

export const obtenerListaStaff = webMethod(
  Permissions.Anyone,
  async () => {
    try {
      console.log(`${TAG} 👥 Obteniendo lista de staff con queryResourceCatalog`);

      const res = await resourcesBackend.queryResourceCatalog().find();
      const items = res?.items || [];

      const staff = [];

      for (const it of items) {
        const r = it?.resource || it?.resourceInfo || null;
        if (!r) continue;

        const resourceId = r._id || r.id || null;
        if (!resourceId) continue;

        const label = normalizeStaffLabel(r.name || r.displayName || r.title || '');
        
        // Filtrar por tag 'staff' y excluir solo PROCESO
        const tags = Array.isArray(r.tags) ? r.tags : [];
        if (!tags.includes('staff')) continue;
        if (!label || isBlockedStaffLabel(label)) continue;

        staff.push({ id: resourceId, nombre: label });
      }

      // Ordenar: CUALQUIERA primero, luego el resto alfabéticamente
      staff.sort((a, b) => {
        const aIsCualquiera = a.nombre.toUpperCase() === 'CUALQUIERA';
        const bIsCualquiera = b.nombre.toUpperCase() === 'CUALQUIERA';
        if (aIsCualquiera && !bIsCualquiera) return -1;
        if (!aIsCualquiera && bIsCualquiera) return 1;
        return a.nombre.localeCompare(b.nombre);
      });

      console.log(`${TAG} ✅ Staff encontrado: ${staff.length} (incluyendo CUALQUIERA)`);

      return {
        ok: true,
        staff: staff
      };

    } catch (error) {
      console.error(`${TAG} ❌ Error:`, error);
      return { ok: false, error: error.message, staff: [] };
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// CANCELAR RESERVAS SELECCIONADAS — v1.1
// ═══════════════════════════════════════════════════════════════════════════
// CAMBIO v1.1: Ahora recibe array de objetos { id, isExterno, sessionId, registroId }
// en vez de solo bookingIds strings.
// COMPATIBILIDAD: Si recibe strings (formato antiguo), los trata como Wix Bookings.
// ═══════════════════════════════════════════════════════════════════════════

export const cancelarReservas = webMethod(
  Permissions.Anyone,
  async ({ bookingIds, notificarCliente = false }) => {
    try {
      console.log(`${TAG} 🗑️ Cancelando ${bookingIds.length} reservas`);

      if (!Array.isArray(bookingIds) || bookingIds.length === 0) {
        return { ok: false, error: 'No se proporcionaron IDs de reservas' };
      }

      const cancelBookingElevated = elevate(bookingsV1.cancelBooking);

      // Separar: Wix Bookings vs Externos
      const wixItems = [];
      const externoItems = [];

      for (const item of bookingIds) {
        if (typeof item === 'string') {
          // Formato antiguo: solo string ID → Wix Booking
          wixItems.push(item);
        } else if (item && item.isExterno) {
          externoItems.push(item);
        } else {
          wixItems.push(item.id || item);
        }
      }

      console.log(`${TAG} 📋 Wix: ${wixItems.length} | Externos: ${externoItems.length}`);

      // ─── Cancelar Wix Bookings (igual que antes) ───
      const wixResultados = await Promise.allSettled(
        wixItems.map(bookingId =>
          cancelBookingElevated(bookingId, {
            participantNotification: {
              notifyParticipants: notificarCliente
            },
            flowControlSettings: {
              ignoreCancellationPolicy: true
            },
            suppressAuth: true
          })
        )
      );

      const wixExitosas = wixResultados.filter(r => r.status === 'fulfilled').length;
      const wixFallidas = wixResultados.filter(r => r.status === 'rejected');

      if (wixFallidas.length > 0) {
        console.log(`${TAG} ⚠️ Algunas cancelaciones Wix fallaron:`);
        wixFallidas.forEach((r, i) => {
          console.error(`${TAG} Error Wix ${i + 1}:`, r.reason?.message || r.reason);
        });
      }

      // ─── Cancelar Externos: deleteSession + remove CMS ───
      let externoExitosas = 0;
      let externoFallidas = 0;

      for (const ext of externoItems) {
        try {
          // 1. Eliminar session del calendario Wix
          if (ext.sessionId) {
            try {
              await sessions.deleteSession(ext.sessionId, { suppressAuth: true });
              console.log(`${TAG} ✅ Session externa eliminada: ${ext.sessionId}`);
            } catch (sessErr) {
              console.warn(`${TAG} ⚠️ Session ${ext.sessionId}: ${sessErr.message}`);
            }
          }

          // 2. Eliminar registro del CMS
          if (ext.registroId) {
            try {
              await wixData.remove(CMS_REGISTRO, ext.registroId);
              console.log(`${TAG} ✅ Registro CMS eliminado: ${ext.registroId}`);
            } catch (regErr) {
              console.warn(`${TAG} ⚠️ Registro ${ext.registroId}: ${regErr.message}`);
            }
          }

          externoExitosas++;
        } catch (extErr) {
          console.error(`${TAG} ❌ Error cancelando externo ${ext.id}:`, extErr.message);
          externoFallidas++;
        }
      }

      const totalExitosas = wixExitosas + externoExitosas;
      const totalFallidas = wixFallidas.length + externoFallidas;
      const total = bookingIds.length;

      console.log(`${TAG} ✅ Canceladas: ${totalExitosas}/${total} (Wix: ${wixExitosas}, Ext: ${externoExitosas})`);

      return {
        ok: true,
        mensaje: `${totalExitosas} de ${total} reservas canceladas`,
        exitosas: totalExitosas,
        fallidas: totalFallidas,
        total: total
      };

    } catch (error) {
      console.error(`${TAG} ❌ Error:`, error);
      return { ok: false, error: error.message };
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// TEST PING — SIN CAMBIOS (solo versión actualizada)
// ═══════════════════════════════════════════════════════════════════════════

export const testPing = webMethod(
  Permissions.Anyone,
  async () => {
    return {
      ok: true,
      message: 'CancelacionReservas v1.1 funcionando',
      timestamp: new Date().toISOString()
    };
  }
);