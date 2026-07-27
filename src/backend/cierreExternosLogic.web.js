// =====================================================
// KAMISUITE - Backend: Cierre de Externos (V2, dedicado)
// =====================================================
// VERSION: 1.1.0
// FECHA: 6 de julio de 2026
// ARCHIVO: backend/cierreExternosLogic.web.js
//
// v1.1.0: NUEVO MATCHING multi-externo por empleado.
//         · El % de comisión ya NO se cruza por serviceName (descripción
//           libre) con fallback global — modelo v1.0.0 que solo
//           funcionaba por accidente con un único externo activo.
//         · El % se resuelve por EMPLEADO: cada fila de ExternalServices
//           lleva staffResourceId (StaffConfig.wixResourceId). Se
//           construye el mapa displayName(UPPER) → % consultando
//           StaffConfig como puente, porque PagoreservasExternos.staff
//           es el displayName escrito por recepcionProLogic v1.0.37
//           línea 2212.
//         · Fallback COMPAT para filas legacy que aún no tienen
//           staffResourceId: se indexan por contactPerson(UPPER). En
//           cuanto el operador abre la nueva sección "Gestión Externos"
//           del widget de Configuración Salón (widget v1.0.9),
//           externalStaffLogic.listExternalStaff auto-migra la fila
//           añadiéndole staffResourceId, y este fallback deja de
//           dispararse.
//         · SIN FALLBACK GLOBAL. Si un pago externo no encaja con
//           ningún empleado del mapa, se contabiliza con 0% de
//           comisión. Modelo multi-externo lo exige: aplicar la
//           comisión de "otro" externo daría un dato erróneo.
//         · Bloque de PagoreservasExternos, agrupación por
//           serviceName para el desglose de la UI y shape de salida
//           INTACTOS respecto a v1.0.0.
//
// v1.0.0: Backend dedicado del circuito de externos V2 en el cierre del
//         día. Reemplaza, para el flujo V2, la sección de externos que en
//         V1 producía testCheckout.obtenerDatosCierreDia (backend legacy
//         de lista negra, NO se toca — Conceptos Fundacionales §19).
//
//         Fuente de datos V2:
//           · PagoreservasExternos — ledger de cobros externos del día,
//             rellenado por recepcionProLogic.marcarPagadoReserva v1.0.37
//             (rama externa, bookingId = EXT_<reservaId>).
//         Cruce de comisión:
//           · ExternalServices — config de comisiones del salón. Mapa
//             serviceName(UPPER) → commissionPercentage, con fallback al
//             primer % > 0 del catálogo. Patrón literal replicado de
//             testCheckout.obtenerDatosCierreDia v3.20+.
//
//         Devuelve el objeto `externos` con el MISMO shape que consume el
//         widget (paridad V1):
//           { citas, ventaBruta, comisionTotal, desglose:[{nombre,count,ventaBruta,comision}] }
//
//         Multi-tenant: en salones sin externos (p.ej. KALÓNICE) devuelve
//         { citas:0, ventaBruta:0, comisionTotal:0, desglose:[] } sin error.
//
//         Field IDs verificados en KamisuiteIds_ALL_fieldIDs_2.csv:
//           ExternalServices:      serviceName, contactPerson, activeStatus,
//                                  commissionPercentage, staffResourceId (v1.1.0)
//           StaffConfig:           wixResourceId, displayName, canonicalName,
//                                  isExternal, active (v1.1.0)
//           PagoreservasExternos:  bookingId, descripcion, fechaPago,
//                                  fechaReserva, importeTotal, nombreCliente,
//                                  staff, tipoPago
//
// NOTAS:
//   - El servicio de cada cobro viaja dentro de `descripcion` con el
//     formato "Nombre (Precio€), Nombre2 (Precio€)" que escribe
//     marcarPagadoReserva. El nombre para el desglose se extrae del primer
//     token, quitando el sufijo "(...)".
//   - El rango de fechas del día usa el mismo patrón que el bloque de
//     productos de obtenerDatosCierreDia: query por fechaPago entre
//     inicio y fin del día local, y filtro fino por fecha Madrid.
// =====================================================

import { Permissions, webMethod } from 'wix-web-module';
import wixData from 'wix-data';

const VERSION = '1.1.0';
const TAG = `[CierreExternos][${VERSION}]`;
const TIMEZONE_MADRID = 'Europe/Madrid';

const CMS_EXTERNAL_SERVICES = 'ExternalServices';
const CMS_PAGOS_EXTERNOS    = 'PagoreservasExternos';
const CMS_STAFF             = 'StaffConfig';

// =====================================================
// HELPERS
// =====================================================

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

// Extrae el nombre de servicio del primer token de `descripcion`.
// Formato esperado (escrito por marcarPagadoReserva):
//   "Corte (12€), Peinado (8€)"  →  "Corte"
//   "Manicura completa (25€)"    →  "Manicura completa"
// Si no hay paréntesis de precio, devuelve el token tal cual.
function nombreServicioDesdeDescripcion(descripcion) {
  const primerToken = String(descripcion || '').split(',')[0].trim();
  if (!primerToken) return '';
  const idxParen = primerToken.lastIndexOf('(');
  const nombre = idxParen > 0 ? primerToken.slice(0, idxParen).trim() : primerToken;
  return nombre;
}

// =====================================================
// obtenerDatosCierreExternos
//   Devuelve la sección de externos del cierre del día para el shape
//   que consume el widget: { ok, externos:{citas,ventaBruta,comisionTotal,desglose[]} }
// =====================================================

export const obtenerDatosCierreExternos = webMethod(
  Permissions.SiteMember,
  async ({ fechaISO }) => {
    try {
      console.log(`${TAG} 📊 obtenerDatosCierreExternos: ${fechaISO}`);

      if (!fechaISO) {
        return { ok: false, version: VERSION, error: { message: 'Falta fechaISO' }, externos: null };
      }

      // ─── Mapa de comisiones POR EMPLEADO (v1.1.0) ─────────────────────
      //   Clave del mapa: displayName(UPPER) — coincide con lo que
      //   recepcionProLogic v1.0.37 línea 2212 escribe en
      //   PagoreservasExternos.staff.
      //   Vía: ExternalServices.staffResourceId → StaffConfig.wixResourceId
      //        → StaffConfig.displayName.
      //   Fallback compat: filas ExternalServices sin staffResourceId
      //   (legacy) se indexan por contactPerson(UPPER).
      let mapaComisiones = {};

      try {
        const extResult = await wixData.query(CMS_EXTERNAL_SERVICES)
          .eq('activeStatus', true)
          .limit(100)
          .find({ suppressAuth: true });

        const catalogoExt = extResult.items || [];
        console.log(`${TAG} 📊 ExternalServices activos: ${catalogoExt.length}`);

        // Recolectar los staffResourceId presentes para resolver
        // displayName con una sola query a StaffConfig.
        const resourceIds = [];
        for (const it of catalogoExt) {
          const rid = it.staffResourceId;
          if (typeof rid === 'string' && rid.length > 0) {
            resourceIds.push(rid);
          }
        }

        let displayNamePorResourceId = {};
        if (resourceIds.length) {
          try {
            const staffResult = await wixData.query(CMS_STAFF)
              .hasSome('wixResourceId', resourceIds)
              .limit(100)
              .find({ suppressAuth: true });

            for (const s of (staffResult.items || [])) {
              const rid = s.wixResourceId;
              if (typeof rid === 'string' && rid.length > 0) {
                const dn = s.displayName || s.canonicalName || '';
                if (dn) displayNamePorResourceId[rid] = dn;
              }
            }
            console.log(`${TAG} 👥 StaffConfig resueltos: ${Object.keys(displayNamePorResourceId).length}`);
          } catch (stErr) {
            console.warn(`${TAG} ⚠️ Error leyendo StaffConfig: ${stErr.message}`);
          }
        }

        // Construir mapa: prioridad displayName resuelto vía staffResourceId,
        // fallback compat a contactPerson.
        for (const item of catalogoExt) {
          const pct = Number(item.commissionPercentage || 0);
          const rid = item.staffResourceId;
          const displayName = (typeof rid === 'string' && rid.length > 0)
            ? (displayNamePorResourceId[rid] || '')
            : '';

          if (displayName) {
            const key = displayName.trim().toUpperCase();
            if (key) mapaComisiones[key] = pct;
          } else {
            const contact = String(item.contactPerson || '').trim().toUpperCase();
            if (contact) mapaComisiones[contact] = pct;
          }
        }
      } catch (catErr) {
        console.warn(`${TAG} ⚠️ Error leyendo ExternalServices: ${catErr.message}`);
      }

      // ─── Cobros externos del día desde PagoreservasExternos ────────────
      let externosData = { citas: 0, ventaBruta: 0, comisionTotal: 0, desglose: [] };

      try {
        const startOfDay = new Date(`${fechaISO}T00:00:00.000`);
        const endOfDay   = new Date(`${fechaISO}T23:59:59.999`);

        const pagosResult = await wixData.query(CMS_PAGOS_EXTERNOS)
          .ge('fechaPago', startOfDay)
          .le('fechaPago', endOfDay)
          .limit(500)
          .find({ suppressAuth: true });

        // Filtro fino por fecha Madrid (coherente con el patrón V1).
        const pagosDelDia = (pagosResult.items || []).filter(p => {
          if (!p.fechaPago) return false;
          const d = new Date(p.fechaPago);
          const madridDate = d.toLocaleDateString('en-CA', { timeZone: TIMEZONE_MADRID });
          return madridDate === fechaISO;
        });

        console.log(`${TAG} 📊 Cobros externos del día: ${pagosDelDia.length}`);

        let ventaBruta = 0;
        let comisionTotal = 0;
        const desglosePorServicio = {};

        for (const pago of pagosDelDia) {
          const precio = Number(pago.importeTotal || 0);
          const nombreServicio = nombreServicioDesdeDescripcion(pago.descripcion) || 'Servicio externo';

          // Cruce de comisión: POR EMPLEADO (v1.1.0). pago.staff es el
          // displayName escrito por recepcionProLogic. Sin fallback:
          // si el empleado no está en el mapa, comisión = 0.
          const staffUpper = String(pago.staff || '').trim().toUpperCase();
          const pctComision = (staffUpper && mapaComisiones[staffUpper] !== undefined)
            ? mapaComisiones[staffUpper]
            : 0;

          const comision = round2(precio * pctComision / 100);
          ventaBruta += precio;
          comisionTotal += comision;

          if (!desglosePorServicio[nombreServicio]) {
            desglosePorServicio[nombreServicio] = { nombre: nombreServicio, count: 0, ventaBruta: 0, comision: 0 };
          }
          desglosePorServicio[nombreServicio].count++;
          desglosePorServicio[nombreServicio].ventaBruta += precio;
          desglosePorServicio[nombreServicio].comision += comision;
        }

        // Redondeo final del desglose.
        const desgloseArr = Object.values(desglosePorServicio).map(it => ({
          nombre: it.nombre,
          count: it.count,
          ventaBruta: round2(it.ventaBruta),
          comision: round2(it.comision)
        }));

        externosData = {
          citas: pagosDelDia.length,
          ventaBruta: round2(ventaBruta),
          comisionTotal: round2(comisionTotal),
          desglose: desgloseArr
        };

        console.log(`${TAG} 📊 Externos: bruta=${externosData.ventaBruta}€, comisión=${externosData.comisionTotal}€`);
      } catch (extErr) {
        console.warn(`${TAG} ⚠️ Error PagoreservasExternos: ${extErr.message}`);
      }

      return { ok: true, version: VERSION, externos: externosData };

    } catch (error) {
      console.error(`${TAG} ❌ obtenerDatosCierreExternos:`, error.message);
      return { ok: false, version: VERSION, error: { message: error.message }, externos: null };
    }
  }
);