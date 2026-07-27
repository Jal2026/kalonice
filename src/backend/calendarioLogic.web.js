// =====================================================
// KAMISUITE - Lectura de Calendario
// =====================================================
// VERSION: 1.0.0
// FECHA: 11 de febrero de 2026
// 
// Backend dedicado exclusivamente a lectura de bookings.
// No modifica nada, solo consulta.
// =====================================================

import { webMethod, Permissions } from 'wix-web-module';
import { elevate } from 'wix-auth';
import { extendedBookings } from 'wix-bookings.v2';

const VERSION = '1.0.3';
const TAG = `[Calendario][${VERSION}]`;

const BUSINESS_TIMEZONE = 'Europe/Madrid';

const STAFF_NAMES = {
  '0c22fa77-3602-4876-b744-ded83ed540f8': 'Angela',
  '0e69d7a3-4e36-40ec-9f3d-348f5bf3524d': 'Raquel',
  'b888c390-361d-4b0d-80f7-e0ba808bd7ce': 'Ricardo',
  'ac0c405a-f8c7-4580-a915-da28c89b2d43': 'Proceso',
  '240bb817-cd83-4a7c-ac1a-caef60f85315': 'Cualquiera'
};

// =====================================================
// UTILIDADES
// =====================================================

function formatLocalTime(date) {
  // Cálculo manual offset Madrid (CET=UTC+1, CEST=UTC+2)
  // CEST: último domingo marzo → último domingo octubre
  const year = date.getUTCFullYear();
  const marchLast = new Date(Date.UTC(year, 2, 31));
  const marchSun = 31 - marchLast.getUTCDay();
  const cestStart = Date.UTC(year, 2, marchSun, 1, 0, 0); // 01:00 UTC
  const octLast = new Date(Date.UTC(year, 9, 31));
  const octSun = 31 - octLast.getUTCDay();
  const cestEnd = Date.UTC(year, 9, octSun, 1, 0, 0); // 01:00 UTC
  
  const ts = date.getTime();
  const offsetHours = (ts >= cestStart && ts < cestEnd) ? 2 : 1;
  
  const local = new Date(ts + offsetHours * 3600000);
  const hh = String(local.getUTCHours()).padStart(2, '0');
  const mm = String(local.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

// =====================================================
// CONSULTA BOOKINGS DEL DÍA
// =====================================================

export const getBookingsDelDia = webMethod(
  Permissions.Anyone,
  async ({ fecha, staffId }) => {
    const startTime = Date.now();

    try {
      console.log(`${TAG} 📅 getBookingsDelDia: ${fecha} | Staff: ${staffId}`);

      if (!fecha) throw new Error('fecha requerida');
      if (!staffId) throw new Error('staffId requerido');

      // Rango UTC del día completo en Madrid
      const fromUTC = `${fecha}T00:00:00.000Z`;
      const toUTC = `${fecha}T23:59:59.999Z`;

      const query = {
        filter: {
          "startDate": { "$gte": fromUTC },
          "endDate": { "$lte": toUTC },
          "bookedEntity.item.slot.resource.id": { "$eq": staffId },
          "status": { "$in": ["CONFIRMED", "PENDING"] }
        },
        sort: [{ fieldName: "startDate", order: "ASC" }],
        cursorPaging: { limit: 100 }
      };

      const elevatedQuery = elevate(extendedBookings.queryExtendedBookings);
      const response = await elevatedQuery(query);

      const items = response?.extendedBookings || [];

      console.log(`${TAG} ✅ ${items.length} bookings encontradas`);

      const ocupados = items.map(item => {
        // Estructura real: item.booking.bookedEntity.slot
        const booking = item.booking || item;
        const slot = booking?.bookedEntity?.slot;
        const rawStart = slot?.startDate;
        const rawEnd = slot?.endDate;
        
        const startDate = rawStart ? new Date(rawStart) : null;
        const endDate = rawEnd ? new Date(rawEnd) : null;

        const startHHmm = startDate ? formatLocalTime(startDate) : '??:??';
        const endHHmm = endDate ? formatLocalTime(endDate) : '??:??';

        // Nombre del servicio
        const serviceName = booking?.bookedEntity?.title 
          || slot?.serviceName 
          || '';

        // Nombre del cliente
        const contact = booking?.contactDetails || item?.contactDetails || {};
        const clientName = `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || '';

        const resourceId = slot?.resource?._id || '';

        return {
          startTime: startHHmm,
          endTime: endHHmm,
          servicio: serviceName,
          cliente: clientName,
          resourceId
        };
      });

      // Ordenar por hora de inicio
      ocupados.sort((a, b) => a.startTime.localeCompare(b.startTime));

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`${TAG} ⏱️ ${elapsed}s`);

      return {
        ok: true,
        version: VERSION,
        ocupados,
        total: ocupados.length,
        tiempo: elapsed
      };

    } catch (e) {
      console.error(`${TAG} ❌ getBookingsDelDia FAIL:`, e);
      return {
        ok: false,
        version: VERSION,
        error: { message: e?.message || String(e) }
      };
    }
  }
);