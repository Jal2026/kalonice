// =====================================================
// [DumpReservasV1 v1.2.0] - dumpReservasV1.web.js
// Backend one-shot para migración V1→V2 (Hair-Times, julio 2026).
//
// Devuelve un dump de reservas Wix Bookings V1 del rango
// [desdeISO, hastaISO] con su startDate/endDate REAL histórico
// (el que se hizo cuando se creó el session). Fuente única de
// duraciones para generar bloqueos slot-a-slot en KamisuiteReservations
// (family='BLOQUEO') durante la migración.
//
// CHANGELOG:
//   v1.0.0 — Chunks mensuales.  Julio topó con limit:100.
//   v1.1.0 — Chunks quincenales. Julio siguió topando con limit:100.
//   v1.2.0 — PAGINACIÓN CURSOR real. Patrón COPIADO LITERAL del
//            código que Jal pasó (leerReservasBookingsDesdeHoy):
//              · elevate a nivel de módulo
//              · Primera query: filter.startDate.$gte + sort + cursorPaging.limit
//              · Siguientes queries: solo cursorPaging.cursor
//              · Extracción next cursor con doble fallback
//                (pagingMetadata.cursors.next || pagingMetadata.nextCursor)
//              · Corte por hasNext y por defensa "reserva fuera de rango"
//              · Segundo argumento con opciones withBookingAllowedActions etc.
//            Devuelvo items RAW (mismo formato que v1.0.0/v1.1.0)
//            para no romper el consumidor aquí (Python que genera el CSV).
//            Firma dumpReservasV1({desdeISO, hastaISO}) idéntica para no
//            tocar http-functions.js ni page code.
// =====================================================

import { webMethod, Permissions } from 'wix-web-module';
import { elevate } from 'wix-auth';
import { extendedBookings } from 'wix-bookings.v2';

const TAG = '[DumpReservasV1 v1.2.0]';
const PAGE_LIMIT = 100;
const MAX_PAGES = 200;

// Elevate a nivel de módulo — patrón EXACTO del código pasado por Jal
const queryExtendedBookingsElevated = elevate(extendedBookings.queryExtendedBookings);

export const dumpReservasV1 = webMethod(
  Permissions.SiteMember,
  async ({ desdeISO, hastaISO } = {}) => {
    if (!desdeISO || !hastaISO) {
      return { ok: false, error: 'Faltan desdeISO / hastaISO' };
    }

    try {
      const desdeMs = new Date(desdeISO).getTime();
      const hastaMs = new Date(hastaISO).getTime();

      let cursor = null;
      let pagina = 0;
      let itemsRaw = [];
      let seguirLeyendo = true;

      while (seguirLeyendo && pagina < MAX_PAGES) {
        pagina++;

        const query = crearQueryReservas(desdeISO, cursor);

        // Segundo argumento EXACTO del código pasado por Jal
        const respuesta = await queryExtendedBookingsElevated(query, {
          withBookingAllowedActions: false,
          withBookingAttendanceInfo: true,
          withFormSubmissions: false,
          withEcomOrder: false,
          withEcomTransactions: false
        });

        const lote = extraerReservas(respuesta);
        itemsRaw = itemsRaw.concat(lote);

        console.log(`${TAG} página ${pagina}: ${lote.length} items (acumulado ${itemsRaw.length})`);

        // Defensa: si aparece una reserva con start >= hastaISO, cortar
        const hayFueraDeRango = lote.some((it) => {
          const start = it?.booking?.startDate || it?.startDate || '';
          if (!start) return false;
          return new Date(start).getTime() >= hastaMs;
        });
        if (hayFueraDeRango) {
          seguirLeyendo = false;
          break;
        }

        const nextCursor = extraerNextCursor(respuesta);
        const hasNext = respuesta?.pagingMetadata?.hasNext === true;

        if (!hasNext || !nextCursor) {
          seguirLeyendo = false;
          break;
        }

        cursor = nextCursor;
      }

      // Filtro final por rango [desdeMs, hastaMs) sobre booking.startDate
      const items = itemsRaw.filter((it) => {
        const start = it?.booking?.startDate || it?.startDate || '';
        if (!start) return false;
        const ms = new Date(start).getTime();
        return ms >= desdeMs && ms < hastaMs;
      });

      console.log(`${TAG} ✅ Total raw: ${itemsRaw.length} | Total en rango: ${items.length} | Páginas: ${pagina}`);
      return { ok: true, total: items.length, totalRaw: itemsRaw.length, paginas: pagina, items };

    } catch (e) {
      console.error(`${TAG} ❌`, e.message);
      return { ok: false, error: e.message };
    }
  }
);

// ─── Helpers COPIADOS LITERAL del código pasado por Jal ───

function crearQueryReservas(desdeISO, cursor) {
  if (cursor) {
    return {
      cursorPaging: {
        cursor
      }
    };
  }

  return {
    filter: {
      startDate: {
        $gte: desdeISO
      }
    },
    sort: [
      {
        fieldName: "startDate",
        order: "ASC"
      }
    ],
    cursorPaging: {
      limit: PAGE_LIMIT
    }
  };
}

function extraerReservas(respuesta) {
  return respuesta?.extendedBookings || respuesta?.items || respuesta?.bookings || [];
}

function extraerNextCursor(respuesta) {
  return respuesta?.pagingMetadata?.cursors?.next || respuesta?.pagingMetadata?.nextCursor || null;
}