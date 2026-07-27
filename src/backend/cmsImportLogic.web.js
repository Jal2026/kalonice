// =====================================================
// KAMISUITE - CMS Import (Backend)
// =====================================================
// Archivo: backend/cmsImportLogic.web.js
// Version: 1.0.2
// =====================================================
// CAMBIOS v1.0.2:
// - FIX ADD_FIELDS sobre colecciones existentes:
//   * Detectar collectionType (NATIVE/WIX_APP). updateDataCollection
//     no funciona sobre WIX_APP (HairSalonServices, Bookings/*, etc.).
//     Se aborta con mensaje claro en vez de fallar mudo.
//   * Filtrar campos de sistema del cur.fields antes del merge
//     (la API rechaza si vienen mezclados con flags raros).
//   * Normalizar TODOS los campos del merge (existentes + nuevos)
//     a forma minima {key, type, displayName}. La API rellena el
//     resto. Quita la fuente principal de validation errors.
//   * Log explicito del error con stack si el catch lo trae.
// Proposito: crear colecciones nuevas y anyadir campos
//   faltantes en una cuenta destino (ej. HairTimes), a
//   partir de un JSON spec generado desde la cuenta
//   master (ej. SalonKami).
// API base: wix-data.v2/collections
// Patron de update: READ-MERGE-UPDATE para no perder
//   campos existentes (la doc oficial dice que update
//   REEMPLAZA toda la coleccion).
// Permisos: por defecto ADMIN/ADMIN/ADMIN/ADMIN. El
//   usuario ajusta despues los que requieren lectura
//   publica desde la UI del CMS.
// =====================================================

import { webMethod, Permissions } from 'wix-web-module';
import { elevate } from 'wix-auth';
import { collections } from 'wix-data.v2';

const TAG = '[CMSImport v1.0.2]';

const getElevated    = elevate(collections.getDataCollection);
const listElevated   = elevate(collections.listDataCollections);
const createElevated = elevate(collections.createDataCollection);
const updateElevated = elevate(collections.updateDataCollection);

const DEFAULT_PERMISSIONS = {
  insert: 'ADMIN',
  update: 'ADMIN',
  remove: 'ADMIN',
  read:   'ADMIN'
};

function normalizeField(f) {
  // Solo key + type + displayName. No tocamos required/defaultValue.
  return {
    key: f.key,
    type: f.type,
    displayName: f.displayName || f.key
  };
}

// =====================================================
// 1. ANALIZAR — diagnostica el estado actual vs el spec
// Read-only. Devuelve plan: CREATE / ADD_FIELDS / NOOP
// =====================================================
export const analizarImport = webMethod(
  Permissions.SiteMember,
  async ({ spec }) => {
    try {
      if (!spec || !Array.isArray(spec.colecciones)) {
        return { ok: false, error: 'spec invalido: falta colecciones[]' };
      }
      console.log(TAG + ' Analizando ' + spec.colecciones.length + ' colecciones del spec');

      // Listar existentes
      const listResp = await listElevated();
      let rawList = [];
      if (listResp && Array.isArray(listResp.collections)) rawList = listResp.collections;
      else if (listResp && Array.isArray(listResp.dataCollections)) rawList = listResp.dataCollections;
      else if (Array.isArray(listResp)) rawList = listResp;

      const existingIds = new Set();
      for (var i = 0; i < rawList.length; i++) {
        const id = rawList[i].id || rawList[i]._id || rawList[i].dataCollectionId;
        if (id) existingIds.add(id);
      }

      // Diff paralelo
      const items = await Promise.all(spec.colecciones.map(function(col) {
        if (!existingIds.has(col.id)) {
          return Promise.resolve({
            id: col.id,
            action: 'CREATE',
            specFields: col.fields.length,
            missingFields: col.fields.map(f => f.key)
          });
        }
        return getElevated(col.id)
          .then(function(resp) {
            const cur = (resp && resp.collection) ? resp.collection : resp;
            const curFields = (cur && Array.isArray(cur.fields)) ? cur.fields : [];
            const curKeys = new Set(curFields.filter(f => !f.systemField && !f.system).map(f => f.key));
            const specKeys = new Set(col.fields.map(f => f.key));
            const missing = col.fields.filter(f => !curKeys.has(f.key)).map(f => f.key);
            const extra = [...curKeys].filter(k => !specKeys.has(k));
            return {
              id: col.id,
              action: missing.length > 0 ? 'ADD_FIELDS' : 'NOOP',
              specFields: col.fields.length,
              existingFields: curKeys.size,
              missingFields: missing,
              extraFields: extra
            };
          })
          .catch(function(err) {
            return { id: col.id, action: 'ERROR', error: err.message };
          });
      }));

      const summary = {
        CREATE: items.filter(x => x.action === 'CREATE').length,
        ADD_FIELDS: items.filter(x => x.action === 'ADD_FIELDS').length,
        NOOP: items.filter(x => x.action === 'NOOP').length,
        ERROR: items.filter(x => x.action === 'ERROR').length
      };
      console.log(TAG + ' Resumen plan: ' + JSON.stringify(summary));

      return { ok: true, plan: items, summary };
    } catch (err) {
      console.error(TAG + ' Error analizarImport:', err.message);
      return { ok: false, error: err.message };
    }
  }
);

// =====================================================
// 2. EJECUTAR LOTE — procesa un sublote del plan
// El widget partira el plan en lotes de 10 para evitar
// timeout de 14s en operaciones masivas.
// items: [{ id, action, fields }]  donde fields es:
//   - para CREATE: TODOS los campos a crear
//   - para ADD_FIELDS: SOLO los campos a anyadir
// =====================================================
export const ejecutarLote = webMethod(
  Permissions.SiteMember,
  async ({ items }) => {
    if (!Array.isArray(items)) {
      return { ok: false, error: 'items invalido' };
    }
    console.log(TAG + ' Ejecutando lote de ' + items.length);

    const results = [];

    for (var idx = 0; idx < items.length; idx++) {
      const item = items[idx];
      try {
        if (item.action === 'CREATE') {
          const newCol = {
            id: item.id,
            permissions: DEFAULT_PERMISSIONS,
            fields: (item.fields || []).map(normalizeField)
          };
          console.log(TAG + ' CREATE ' + item.id + ' (' + newCol.fields.length + ' campos)');
          await createElevated(newCol);
          results.push({ id: item.id, action: 'CREATE', ok: true, fields: newCol.fields.length });

        } else if (item.action === 'ADD_FIELDS') {
          // READ-MERGE-UPDATE robusto
          const resp = await getElevated(item.id);
          const cur = (resp && resp.collection) ? resp.collection : resp;
          if (!cur || !cur.id) {
            results.push({ id: item.id, action: 'ADD_FIELDS', ok: false, error: 'Coleccion no encontrada en getDataCollection' });
            continue;
          }

          // Bloquear WIX_APP / EXTERNAL: la API solo permite update sobre NATIVE
          const colType = cur.collectionType || cur.type || '';
          if (colType && colType !== 'NATIVE') {
            const msg = 'Coleccion de tipo ' + colType + ' (no NATIVE). updateDataCollection solo opera sobre colecciones nativas. Esta coleccion la gestiona la app de Wix correspondiente.';
            console.warn(TAG + ' SKIP ' + item.id + ': ' + msg);
            results.push({ id: item.id, action: 'ADD_FIELDS', ok: false, error: msg });
            continue;
          }

          // Limpiar campos system del cur.fields (la API los gestiona sola)
          const curFieldsClean = (cur.fields || []).filter(function(f) {
            return !(f.systemField === true) && !(f.system === true) &&
                   !(typeof f.key === 'string' && f.key.charAt(0) === '_');
          });

          // Filtrar nuevos: descartar los que ya existan por key (defensa)
          const existingKeys = new Set(curFieldsClean.map(function(f){ return f.key; }));
          const newFieldsRaw = (item.fields || []).filter(function(f){ return !existingKeys.has(f.key); });

          if (newFieldsRaw.length === 0) {
            console.log(TAG + ' NOOP-runtime ' + item.id + ' (ya todos los campos presentes)');
            results.push({ id: item.id, action: 'ADD_FIELDS', ok: true, added: 0, note: 'Ya estaban presentes' });
            continue;
          }

          // Normalizar TODOS los campos del merge a forma minima
          const mergedFields = curFieldsClean.concat(newFieldsRaw).map(normalizeField);

          const updated = {
            id: cur.id,
            revision: cur.revision,
            permissions: cur.permissions || DEFAULT_PERMISSIONS,
            fields: mergedFields
          };
          console.log(TAG + ' ADD_FIELDS ' + item.id + ' (+' + newFieldsRaw.length + ' campos, rev ' + cur.revision + ', total tras update ' + mergedFields.length + ')');
          await updateElevated(updated);
          results.push({ id: item.id, action: 'ADD_FIELDS', ok: true, added: newFieldsRaw.length });

        } else {
          results.push({ id: item.id, action: item.action, ok: false, error: 'Accion no soportada' });
        }
      } catch (err) {
        const errMsg = (err && err.message) ? err.message : String(err);
        const errStack = (err && err.stack) ? String(err.stack).split('\n').slice(0,3).join(' | ') : '';
        console.warn(TAG + ' FAIL ' + item.id + ': ' + errMsg + (errStack ? ' | ' + errStack : ''));
        results.push({ id: item.id, action: item.action, ok: false, error: errMsg });
      }
    }

    return { ok: true, results };
  }
);