// =====================================================
// KAMISUITE - Backend: Gestión de Empleados Externos (V2)
// =====================================================
// VERSION: 1.0.1
// FECHA: 6 de julio de 2026
// ARCHIVO: backend/externalStaffLogic.web.js
//
// v1.0.1: updateExternalCommission acepta un tercer parámetro opcional
//         `serviceName` (String, descripción libre de los servicios
//         que hace el externo). Cuando llega definido, se escribe en la
//         fila de ExternalServices con el mismo patrón READ-MERGE-UPDATE
//         que commissionPercentage y activeStatus. Cuando no llega
//         (undefined), el campo no se toca. El campo NO participa en
//         el cálculo del cierre (cierreExternosLogic v1.1.0) — es
//         puramente informativo para el operador desde la sección
//         "Gestión Externos" del widget de Configuración Salón.
//         · listExternalStaff intacto (ya devolvía serviceName desde
//           v1.0.0).
//         · Firma de updateExternalCommission ampliada de forma
//           retrocompatible: la clave `serviceName` es opcional en
//           el payload; page code y widget se actualizan a la par
//           (pagecode_salon_config v1.0.3, widget v1.0.10).
//
// v1.0.0: Backend dedicado de la sección "Gestión Externos" del widget
//         de Configuración del Salón (widget_salon_config v1.0.9).
//         Une StaffConfig (empleados externos) con ExternalServices
//         (comisiones por empleado) mediante staffResourceId.
//
//         REGLA DE MATCHING (Conceptos Fundacionales, cuerda maestra
//         multi-tenant): la clave estable entre ambas colecciones es
//         ExternalServices.staffResourceId = StaffConfig.wixResourceId.
//         PagoreservasExternos.staff sigue guardando displayName tal
//         cual (recepcionProLogic v1.0.37 línea 2212). El cierre
//         resuelve el % vía puente StaffConfig (cierreExternosLogic
//         v1.1.0). No se modifican esas dos piezas desde este backend.
//
//         FUNCIONES EXPORTADAS:
//           · listExternalStaff() — devuelve un array por cada empleado
//             externo activo, con la fila de ExternalServices asociada.
//             Auto-migra filas legacy (por contactPerson) y auto-crea
//             filas nuevas con comisión 0% cuando falta.
//           · updateExternalCommission({ externalServicesId,
//             commissionPercentage, activeStatus }) — READ-MERGE-UPDATE
//             (regla proyecto §14) de la fila de ExternalServices.
//
//         Field IDs verificados en KamisuiteIds_ALL_fieldIDs_2.csv:
//           StaffConfig:      wixResourceId, displayName, canonicalName,
//                             isExternal, active
//           ExternalServices: staffResourceId (nuevo, tipo Texto),
//                             contactPerson, commissionPercentage,
//                             activeStatus, serviceName
//
// PATRÓN REUTILIZADO (literal):
//   · serviciosEdicionLogic.cargarStaffDesdeConfig (líneas 225-246):
//     query StaffConfig con active=true, suppressAuth.
//   · cierreExternosLogic v1.0.0 (líneas 101-105): query
//     ExternalServices con activeStatus, suppressAuth.
//   · recepcionProLogic.quitarItemReserva (líneas 2962-3001):
//     READ-MERGE-UPDATE con wixData.get + merge + wixData.update.
//
// NOTAS:
//   · Permisos: SiteMember en todos los webMethod. Acceso a CMS
//     admin-only vía suppressAuth (regla proyecto §22).
//   · La sección se maneja aparte del guardado de SalonConfig: el
//     botón GUARDAR global del widget envía un segundo mensaje
//     'externalStaffSave' al page code con los deltas.
// =====================================================

import { Permissions, webMethod } from 'wix-web-module';
import wixData from 'wix-data';

const VERSION = '1.0.1';
const TAG = `[ExternalStaff][${VERSION}]`;

const CMS_STAFF        = 'StaffConfig';
const CMS_EXT_SERVICES = 'ExternalServices';

// =====================================================
// listExternalStaff
//   Devuelve [{
//     externalServicesId, staffResourceId, displayName, canonicalName,
//     contactPerson, commissionPercentage, activeStatus, serviceName
//   }] para cada empleado con isExternal=true y active=true en
//   StaffConfig. Si no hay fila en ExternalServices para ese empleado,
//   se auto-migra (por contactPerson case-insensitive) o se auto-crea.
// =====================================================

export const listExternalStaff = webMethod(
  Permissions.SiteMember,
  async () => {
    const t0 = Date.now();
    try {
      // ─── 1. StaffConfig con isExternal=true y active=true ───
      const staffResult = await wixData.query(CMS_STAFF)
        .eq('isExternal', true)
        .eq('active', true)
        .limit(100)
        .find({ suppressAuth: true });

      const staffExternos = (staffResult.items || []).filter(s => {
        return typeof s.wixResourceId === 'string' && s.wixResourceId.length > 0;
      });
      console.log(`${TAG} 👥 Staff externos activos: ${staffExternos.length}`);

      // ─── 2. ExternalServices (catálogo completo, activos e inactivos) ───
      const extResult = await wixData.query(CMS_EXT_SERVICES)
        .limit(100)
        .find({ suppressAuth: true });

      const catalogoExt = extResult.items || [];
      console.log(`${TAG} 📊 ExternalServices filas: ${catalogoExt.length}`);

      // ─── 3. Cruce por staffResourceId, con auto-migración y auto-creación ───
      const resultado = [];

      for (const staff of staffExternos) {
        const rid           = staff.wixResourceId;
        const displayName   = staff.displayName || staff.canonicalName || 'Sin nombre';
        const canonicalName = staff.canonicalName || displayName;

        // 3.a. Buscar fila por staffResourceId (clave estable)
        let fila = catalogoExt.find(x => x.staffResourceId === rid);

        // 3.b. Si no existe, buscar fila legacy por contactPerson
        //      (case-insensitive contra displayName o canonicalName) y
        //      migrar añadiéndole el staffResourceId.
        if (!fila) {
          const displayLower   = String(displayName).trim().toLowerCase();
          const canonicalLower = String(canonicalName).trim().toLowerCase();

          const filaLegacy = catalogoExt.find(x => {
            const cp = String(x.contactPerson || '').trim().toLowerCase();
            if (!cp) return false;
            // Solo migrar si esa fila NO tiene ya un staffResourceId
            // (evita robar filas ya enlazadas).
            const rid2 = x.staffResourceId;
            if (typeof rid2 === 'string' && rid2.length > 0) return false;
            return cp === displayLower || cp === canonicalLower;
          });

          if (filaLegacy) {
            filaLegacy.staffResourceId = rid;
            try {
              const migrada = await wixData.update(CMS_EXT_SERVICES, filaLegacy, { suppressAuth: true });
              console.log(`${TAG} 🔗 Migrada fila legacy → staffResourceId(${rid}) para "${displayName}"`);
              fila = migrada || filaLegacy;
            } catch (upErr) {
              console.warn(`${TAG} ⚠️ Error migrando fila legacy: ${upErr.message}`);
            }
          }
        }

        // 3.c. Si sigue sin haber fila, autocrear con 0% y activa.
        if (!fila) {
          try {
            const nueva = {
              staffResourceId:      rid,
              contactPerson:        displayName,
              commissionPercentage: 0,
              activeStatus:         true,
              serviceName:          ''
            };
            const inserted = await wixData.insert(CMS_EXT_SERVICES, nueva, { suppressAuth: true });
            console.log(`${TAG} ➕ Creada fila ExternalServices para "${displayName}" (${rid})`);
            fila = inserted;
          } catch (insErr) {
            console.warn(`${TAG} ⚠️ Error creando fila para "${displayName}": ${insErr.message}`);
            // Sin fila no puede editarse desde el widget; seguimos con el
            // resto de empleados pero omitimos éste.
            continue;
          }
        }

        resultado.push({
          externalServicesId:   fila._id,
          staffResourceId:      rid,
          displayName:          displayName,
          canonicalName:        canonicalName,
          contactPerson:        fila.contactPerson || displayName,
          commissionPercentage: Number(fila.commissionPercentage || 0),
          activeStatus:         fila.activeStatus === true,
          serviceName:          fila.serviceName || ''
        });
      }

      console.log(`${TAG} ✅ listExternalStaff: ${resultado.length} externos. ${((Date.now() - t0) / 1000).toFixed(2)}s`);
      return { ok: true, version: VERSION, staff: resultado };

    } catch (e) {
      console.error(`${TAG} ❌ listExternalStaff:`, e && e.message ? e.message : e);
      return { ok: false, version: VERSION, error: { message: e && e.message ? e.message : String(e) }, staff: [] };
    }
  }
);

// =====================================================
// updateExternalCommission
//   READ-MERGE-UPDATE de UNA fila de ExternalServices. Recibe:
//     · externalServicesId (obligatorio)  — _id de la fila
//     · commissionPercentage (opcional)   — Number ≥ 0
//     · activeStatus (opcional)           — Boolean
//     · serviceName (opcional, v1.0.1)    — String (descripción libre)
//   Solo escribe los campos que llegan definidos. El resto de la fila
//   (contactPerson, staffResourceId, serviceName, logo, ...) se
//   preserva íntegro (regla proyecto §14: nunca partial update sin
//   read+merge previo — wixData.update reemplaza el documento entero).
// =====================================================

export const updateExternalCommission = webMethod(
  Permissions.SiteMember,
  async ({ externalServicesId, commissionPercentage, activeStatus, serviceName }) => {
    try {
      if (!externalServicesId || typeof externalServicesId !== 'string') {
        return { ok: false, version: VERSION, error: { message: 'Falta externalServicesId' } };
      }

      // ─── READ ───
      let fila;
      try {
        fila = await wixData.get(CMS_EXT_SERVICES, externalServicesId, { suppressAuth: true });
      } catch (getErr) {
        return { ok: false, version: VERSION, error: { message: `Fila no encontrada: ${externalServicesId}` } };
      }
      if (!fila) {
        return { ok: false, version: VERSION, error: { message: `Fila no encontrada: ${externalServicesId}` } };
      }

      // ─── MERGE ───
      if (commissionPercentage !== undefined && commissionPercentage !== null) {
        const pct = Number(commissionPercentage);
        if (isNaN(pct) || pct < 0) {
          return { ok: false, version: VERSION, error: { message: 'commissionPercentage inválido' } };
        }
        fila.commissionPercentage = pct;
      }
      if (activeStatus !== undefined && activeStatus !== null) {
        fila.activeStatus = activeStatus === true;
      }
      // v1.0.1 — serviceName es String; cadena vacía es válida (permite
      // borrar el contenido desde el widget). undefined = no tocar.
      if (serviceName !== undefined && serviceName !== null) {
        fila.serviceName = String(serviceName);
      }

      // ─── UPDATE ───
      const updated = await wixData.update(CMS_EXT_SERVICES, fila, { suppressAuth: true });
      console.log(`${TAG} 💾 Actualizada ${externalServicesId}: %=${updated.commissionPercentage} activo=${updated.activeStatus} svc="${(updated.serviceName || '').slice(0, 40)}"`);

      return {
        ok: true,
        version: VERSION,
        externalServicesId:   updated._id,
        commissionPercentage: Number(updated.commissionPercentage || 0),
        activeStatus:         updated.activeStatus === true,
        serviceName:          updated.serviceName || ''
      };
    } catch (e) {
      console.error(`${TAG} ❌ updateExternalCommission:`, e && e.message ? e.message : e);
      return { ok: false, version: VERSION, error: { message: e && e.message ? e.message : String(e) } };
    }
  }
);