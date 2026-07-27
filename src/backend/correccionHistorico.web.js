// =====================================================================
// SCRIPT CORRECCIÓN HISTÓRICO — PaymentReservations extras faltantes
// =====================================================================
// EJECUTAR UNA SOLA VEZ — después borrar el archivo
//
// QUÉ HACE:
//   1. Lee todos los registros de PaymentReservations
//   2. Para cada registro, consulta los bookings vivos en Wix
//   3. Si algún booking tiene extra_checkout (extended field),
//      suma el importe al importeTotal y añade línea a descripcion
//   4. Actualiza el registro corregido en el CMS
//
// CÓMO EJECUTAR:
//   1. Subir como backend/correccionHistorico.web.js
//   2. En page code de checkout (temporal, al final):
//      import { corregirHistorico } from 'backend/correccionHistorico.web';
//      corregirHistorico().then(res => console.log('CORRECCIÓN:', res));
//   3. Preview → F12 → ver consola
//   4. Borrar las líneas temporales del page code
//   5. Borrar backend/correccionHistorico.web.js
// =====================================================================

import { Permissions, webMethod } from 'wix-web-module';
import { extendedBookings } from 'wix-bookings.v2';
import { elevate } from 'wix-auth';
import wixData from 'wix-data';

const COLECCION_PAGOS = 'PaymentReservations';
const TAG = '[Corrección Histórico]';

export const corregirHistorico = webMethod(
  Permissions.Anyone,
  async () => {
    try {
      console.log(`${TAG} 🔧 Iniciando corrección de PaymentReservations...`);

      // ── 1. Leer todos los registros ──
      let allRecords = [];
      let skip = 0;
      const pageSize = 50;
      let hasMore = true;

      while (hasMore) {
        const result = await wixData.query(COLECCION_PAGOS)
          .skip(skip)
          .limit(pageSize)
          .find();

        allRecords = allRecords.concat(result.items);
        hasMore = result.items.length === pageSize;
        skip += pageSize;
      }

      console.log(`${TAG} 📊 Total registros en CMS: ${allRecords.length}`);

      const elevatedQuery = elevate(extendedBookings.queryExtendedBookings);

      let corregidos = 0;
      let sinCambios = 0;
      let errores = 0;
      let bookingsNoEncontrados = 0;
      const detalle = [];

      // ── 2. Para cada registro, consultar bookings y buscar extras ──
      for (const record of allRecords) {
        try {
          const bookingIdsStr = record.bookingId || '';
          if (!bookingIdsStr) {
            sinCambios++;
            continue;
          }

          const bookingIds = bookingIdsStr.split(',').map(id => id.trim()).filter(Boolean);

          let extraDescripcion = '';
          let extraImporte = 0;

          for (const bid of bookingIds) {
            try {
              // Consultar el booking por ID
              const result = await elevatedQuery({
                filter: { "_id": bid }
              });

              const items = result?.extendedBookings || [];
              if (items.length === 0) {
                bookingsNoEncontrados++;
                continue;
              }

              const bk = items[0].booking;
              const extFields = bk.extendedFields || {};

              // Buscar extra_checkout en extended fields (misma lógica que extraerServicio)
              let extraCheckout = '';
              if (extFields.namespaces?.['_user_fields']?.extra_checkout) {
                extraCheckout = extFields.namespaces['_user_fields'].extra_checkout;
              } else if (extFields['_user_fields']?.extra_checkout) {
                extraCheckout = extFields['_user_fields'].extra_checkout;
              } else if (extFields.extra_checkout) {
                extraCheckout = extFields.extra_checkout;
              }

              if (extraCheckout) {
                const ep = extraCheckout.split('|');
                if (ep.length >= 2) {
                  extraDescripcion = ep[0].trim();
                  extraImporte = parseFloat(ep[1]) || 0;
                }
              }

              // Solo necesitamos encontrar un extra por pack (break al encontrar)
              if (extraImporte > 0) break;

            } catch (bkErr) {
              // Booking puede haber sido cancelado/eliminado
              console.warn(`${TAG} ⚠️ Booking ${bid}: ${bkErr.message}`);
              bookingsNoEncontrados++;
            }
          }

          // ── 3. Si hay extra, actualizar el registro ──
          if (extraImporte > 0) {
            const oldTotal = record.importeTotal || 0;
            const newTotal = oldTotal + extraImporte;
            const oldDesc = record.descripcion || '';
            const newDesc = oldDesc + `, ✏️ ${extraDescripcion || 'Extra'} (${extraImporte}€)`;

            record.importeTotal = newTotal;
            record.descripcion = newDesc;

            await wixData.update(COLECCION_PAGOS, record);
            corregidos++;

            const info = {
              id: record._id,
              cliente: record.nombreCliente,
              extra: `${extraDescripcion} (${extraImporte}€)`,
              oldTotal,
              newTotal
            };
            detalle.push(info);
            console.log(`${TAG} ✅ ${record.nombreCliente}: ${oldTotal}€ → ${newTotal}€ (extra: ${extraDescripcion} +${extraImporte}€)`);

          } else {
            sinCambios++;
          }

        } catch (recErr) {
          errores++;
          console.error(`${TAG} ❌ Error procesando ${record._id}:`, recErr.message);
        }
      }

      // ── 4. Resumen ──
      const resumen = {
        ok: true,
        totalRegistros: allRecords.length,
        corregidos,
        sinCambios,
        errores,
        bookingsNoEncontrados,
        detalle
      };

      console.log(`${TAG} 🔧 RESULTADO: ${corregidos} corregidos, ${sinCambios} sin cambios, ${errores} errores, ${bookingsNoEncontrados} bookings no encontrados`);

      return resumen;

    } catch (error) {
      console.error(`${TAG} ❌ Error general:`, error);
      return { ok: false, error: error.message };
    }
  }
);