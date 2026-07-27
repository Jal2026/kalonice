// =====================================================
// KAMISUITE - CMS Field ID Reader (Backend)
// =====================================================
// Archivo: backend/cmsFieldReader.web.js
// Version: 1.6.0
// =====================================================
// CAMBIOS v1.6.0:
// - REEMPLAZO de exportarTodas: ya NO lee KamisuiteIds (que tenia
//   tipos JS inservibles). Ahora itera listDataCollections() y por
//   cada coleccion llama getDataCollection() para devolver el
//   SCHEMA V2 completo con tipos Wix nativos (TEXT, NUMBER,
//   DATETIME, IMAGE, OBJECT, BOOLEAN, REFERENCE, etc.).
//   Salida directa para alimentar el script de bootstrap de CMS
//   en cuentas destino (KALONICE, HairTimes).
// - Misma firma export const exportarTodas - el widget no necesita
//   ningun cambio para invocarla. El CSV que descarga ahora SI
//   contiene los tipos Wix reales.
//
// CAMBIOS v1.5.0:
// - NEW: listarColeccionesV2() - lista completa del site via
//   wix-data.v2/collections.listDataCollections().
//
// CAMBIOS v1.4.0:
// - NEW: leerSchemaV2({ collectionName }) via getDataCollection().
//
// CAMBIOS v1.3.0:
// - FIX leerFieldIds: union de claves de 50 items.
//
// CAMBIOS v1.2.0:
// - FIX elevate en escrituras a KamisuiteIds.
// - NEW exportarTodas (version legacy, ahora reemplazada).
// =====================================================

import { webMethod, Permissions } from 'wix-web-module';
import { elevate } from 'wix-auth';
import wixData from 'wix-data';
import { contacts } from 'wix-crm-backend';
import { collections } from 'wix-data.v2';

const TAG = '[FieldReader v1.6.1]';
const REGISTRY = 'KamisuiteIds';

const getDataCollectionElevated = elevate(collections.getDataCollection);
const listDataCollectionsElevated = elevate(collections.listDataCollections);

// =====================================================
// HELPERS con suppressAuth para KamisuiteIds
// =====================================================

async function registryQuery(collectionName) {
  const result = await wixData.query(REGISTRY)
    .eq('collectionName', collectionName)
    .limit(1)
    .find({ suppressAuth: true });
  return result;
}

async function registryInsert(registro) {
  return await wixData.insert(REGISTRY, registro, { suppressAuth: true });
}

async function registryUpdate(registro) {
  return await wixData.update(REGISTRY, registro, { suppressAuth: true });
}

async function registryRemove(itemId) {
  return await wixData.remove(REGISTRY, itemId, { suppressAuth: true });
}

async function guardarEnRegistry(collectionName, fields) {
  try {
    const existing = await registryQuery(collectionName);
    const registro = {
      collectionName: collectionName,
      fieldsData: JSON.stringify(fields),
      totalFields: fields.length,
      lastUpdated: new Date()
    };
    if (existing.items && existing.items.length > 0) {
      registro._id = existing.items[0]._id;
      await registryUpdate(registro);
      console.log(TAG + ' Actualizado en ' + REGISTRY + ': ' + collectionName);
    } else {
      await registryInsert(registro);
      console.log(TAG + ' Insertado en ' + REGISTRY + ': ' + collectionName);
    }
    return true;
  } catch (err) {
    console.error(TAG + ' ERROR guardando en ' + REGISTRY + ':', err.message);
    return false;
  }
}

// =====================================================
// 1. LEER FIELD IDs (lector v1.3.0 por valores de filas)
// =====================================================
export const leerFieldIds = webMethod(
  Permissions.SiteMember,
  async ({ collectionName }) => {
    try {
      console.log(TAG + ' Leyendo field IDs de: ' + collectionName);
      if (!collectionName || typeof collectionName !== 'string') {
        return { ok: false, error: 'Nombre de coleccion requerido' };
      }
      const trimmed = collectionName.trim();

      const result = await wixData.query(trimmed)
        .limit(50)
        .find();

      if (!result.items || result.items.length === 0) {
        return {
          ok: true,
          collectionName: trimmed,
          totalItems: result.totalCount || 0,
          fields: [],
          warning: 'Coleccion vacia - necesita al menos 1 registro'
        };
      }

      const allKeysSet = new Set();
      const previewSource = {};
      for (var idx = 0; idx < result.items.length; idx++) {
        var it = result.items[idx];
        var keys = Object.keys(it);
        for (var k = 0; k < keys.length; k++) {
          var key = keys[k];
          allKeysSet.add(key);
          if (!(key in previewSource)) {
            previewSource[key] = it[key];
          }
        }
      }
      const allKeys = Array.from(allKeysSet);
      const item = previewSource;

      const sysKeys = ['_id', '_owner', '_createdDate', '_updatedDate'];

      const fields = allKeys.map(function(key) {
        const value = item[key];
        let tipo = typeof value;
        if (value === null || value === undefined) tipo = 'null';
        else if (value instanceof Date) tipo = 'Date';
        else if (Array.isArray(value)) tipo = 'Array';
        else if (tipo === 'object') tipo = 'Object';

        let preview = '';
        try {
          if (value === null || value === undefined) preview = '(vacio)';
          else if (value instanceof Date) preview = value.toISOString();
          else if (typeof value === 'object') preview = JSON.stringify(value).substring(0, 120);
          else preview = String(value).substring(0, 120);
        } catch (e) {
          preview = '(error)';
        }

        return {
          fieldId: key,
          type: tipo,
          isSystem: sysKeys.includes(key),
          preview: preview
        };
      });

      fields.sort(function(a, b) {
        if (a.isSystem && !b.isSystem) return -1;
        if (!a.isSystem && b.isSystem) return 1;
        return a.fieldId.localeCompare(b.fieldId);
      });

      console.log(TAG + ' ' + fields.length + ' campos en ' + trimmed + ' (' + result.items.length + ' items leidos)');

      await guardarEnRegistry(trimmed, fields);

      return {
        ok: true,
        collectionName: trimmed,
        totalItems: result.totalCount || 0,
        fields: fields,
        totalFields: fields.length,
        userFields: fields.filter(function(f) { return !f.isSystem; }).length,
        systemFields: fields.filter(function(f) { return f.isSystem; }).length
      };

    } catch (error) {
      console.error(TAG + ' Error leyendo ' + collectionName + ':', error.message);
      return { ok: false, error: error.message, collectionName: collectionName };
    }
  }
);

// =====================================================
// 1.bis (v1.4.0) - SCHEMA V2 DE UNA COLECCION
// =====================================================
export const leerSchemaV2 = webMethod(
  Permissions.SiteMember,
  async ({ collectionName }) => {
    try {
      if (!collectionName || typeof collectionName !== 'string') {
        return { ok: false, error: 'Nombre de coleccion requerido' };
      }
      const trimmed = collectionName.trim();
      console.log(TAG + ' Leyendo schema V2 de: ' + trimmed);

      const response = await getDataCollectionElevated(trimmed);

      try {
        console.log(TAG + ' Response RAW: ' + JSON.stringify(response).substring(0, 3000));
      } catch (e) {
        console.log(TAG + ' Response RAW no serializable');
      }

      const collection = (response && response.collection) ? response.collection : response;
      const rawFields = (collection && Array.isArray(collection.fields)) ? collection.fields : [];

      const fields = rawFields.map(function(f) {
        return {
          fieldId: f.key || f.fieldKey || f.id || '(unknown)',
          type: (typeof f.type !== 'undefined') ? f.type : '(unknown)',
          displayName: f.displayName || f.name || '',
          isSystem: (f.systemField === true) || (f.system === true),
          preview: f.displayName || f.name || ''
        };
      });

      const totalFields = fields.length;
      const userFields = fields.filter(function(f){ return !f.isSystem; }).length;
      const systemFields = fields.filter(function(f){ return f.isSystem; }).length;

      console.log(TAG + ' schema V2 ' + trimmed + ': ' + totalFields + ' campos (' + userFields + ' user / ' + systemFields + ' system)');

      return {
        ok: true,
        collectionName: trimmed,
        totalFields: totalFields,
        userFields: userFields,
        systemFields: systemFields,
        fields: fields,
        rawCollection: collection
      };

    } catch (error) {
      console.error(TAG + ' Error leyendo schema V2 de ' + collectionName + ':', error.message);
      return { ok: false, error: error.message, collectionName: collectionName };
    }
  }
);

// =====================================================
// 1.ter (v1.5.0) - LISTAR TODAS LAS COLECCIONES DEL SITE
// =====================================================
export const listarColeccionesV2 = webMethod(
  Permissions.SiteMember,
  async () => {
    try {
      console.log(TAG + ' Listando colecciones V2 del site...');

      const response = await listDataCollectionsElevated();

      try {
        console.log(TAG + ' Response RAW listDataCollections: ' + JSON.stringify(response).substring(0, 4000));
      } catch (e) {
        console.log(TAG + ' Response RAW no serializable');
      }

      let rawList = [];
      if (response && Array.isArray(response.collections)) {
        rawList = response.collections;
      } else if (response && Array.isArray(response.dataCollections)) {
        rawList = response.dataCollections;
      } else if (Array.isArray(response)) {
        rawList = response;
      } else if (response && Array.isArray(response.items)) {
        rawList = response.items;
      }

      const colecciones = rawList.map(function(c) {
        return {
          id: c.id || c._id || c.dataCollectionId || '(unknown)',
          displayName: c.displayName || c.displayField || c.name || '',
          type: (typeof c.collectionType !== 'undefined') ? c.collectionType
              : (typeof c.type !== 'undefined') ? c.type
              : '(unknown)',
          fieldsCount: (c.fields && Array.isArray(c.fields)) ? c.fields.length : null
        };
      });

      colecciones.sort(function(a, b) {
        const rank = function(t) {
          var s = String(t || '').toUpperCase();
          if (s === 'NATIVE') return 0;
          if (s === 'WIX_APP') return 1;
          if (s === 'EXTERNAL') return 2;
          return 3;
        };
        const ra = rank(a.type), rb = rank(b.type);
        if (ra !== rb) return ra - rb;
        return String(a.id).localeCompare(String(b.id));
      });

      console.log(TAG + ' ' + colecciones.length + ' colecciones listadas');

      return {
        ok: true,
        total: colecciones.length,
        colecciones: colecciones,
        rawResponse: response
      };

    } catch (error) {
      console.error(TAG + ' Error listando colecciones V2:', error.message);
      return { ok: false, error: error.message };
    }
  }
);

// =====================================================
// 2. CARGAR HISTORIAL desde KamisuiteIds
// =====================================================
export const cargarHistorial = webMethod(
  Permissions.SiteMember,
  async () => {
    try {
      console.log(TAG + ' Cargando historial de ' + REGISTRY + '...');
      const result = await wixData.query(REGISTRY)
        .ascending('collectionName')
        .limit(100)
        .find();

      const items = (result.items || []).map(function(item) {
        return {
          collectionName: item.collectionName,
          totalFields: item.totalFields || 0,
          lastUpdated: item.lastUpdated
        };
      });

      console.log(TAG + ' ' + items.length + ' colecciones en historial');
      return { ok: true, colecciones: items };

    } catch (error) {
      console.error(TAG + ' Error cargando historial:', error.message);
      return { ok: false, error: error.message, colecciones: [] };
    }
  }
);

// =====================================================
// 3. OBTENER FIELD IDs DESDE KamisuiteIds
// =====================================================
export const obtenerFieldIds = webMethod(
  Permissions.SiteMember,
  async ({ collectionName }) => {
    try {
      const result = await wixData.query(REGISTRY)
        .eq('collectionName', collectionName.trim())
        .limit(1)
        .find();

      if (!result.items || result.items.length === 0) {
        return { ok: false, error: 'Coleccion no registrada en KamisuiteIds' };
      }

      const item = result.items[0];
      let fields = [];
      try {
        fields = JSON.parse(item.fieldsData || '[]');
      } catch (e) {
        fields = [];
      }

      return {
        ok: true,
        collectionName: item.collectionName,
        fields: fields,
        totalFields: item.totalFields,
        lastUpdated: item.lastUpdated
      };

    } catch (error) {
      return { ok: false, error: error.message };
    }
  }
);

// =====================================================
// 4. ELIMINAR REGISTRO de KamisuiteIds
// =====================================================
export const eliminarRegistro = webMethod(
  Permissions.SiteMember,
  async ({ collectionName }) => {
    try {
      const existing = await registryQuery(collectionName.trim());
      if (!existing.items || existing.items.length === 0) {
        return { ok: false, error: 'No encontrada' };
      }
      await registryRemove(existing.items[0]._id);
      console.log(TAG + ' Eliminado ' + collectionName + ' de ' + REGISTRY);
      return { ok: true };

    } catch (error) {
      return { ok: false, error: error.message };
    }
  }
);

// =====================================================
// 5. LEER CAMPOS EXTENDIDOS DE WIX CONTACTS
// =====================================================
export const leerContactFields = webMethod(
  Permissions.SiteMember,
  async () => {
    try {
      console.log(TAG + ' Leyendo campos de Wix Contacts...');

      const elevatedQuery = elevate(contacts.queryContacts);
      const result = await elevatedQuery()
        .limit(1)
        .find();

      if (!result.items || result.items.length === 0) {
        return { ok: true, baseFields: [], extendedFields: [], totalBase: 0, totalExtended: 0, warning: 'No hay contactos' };
      }

      const contact = result.items[0];
      const baseFields = [];

      function addBase(path, value) {
        let tipo = typeof value;
        if (value === null || value === undefined) tipo = 'null';
        else if (value instanceof Date) tipo = 'Date';
        else if (Array.isArray(value)) tipo = 'Array';

        let preview = '';
        try {
          if (value === null || value === undefined) preview = '(vacio)';
          else if (typeof value === 'object') preview = JSON.stringify(value).substring(0, 120);
          else preview = String(value).substring(0, 120);
        } catch (e) { preview = ''; }

        baseFields.push({ fieldId: path, type: tipo, preview: preview, isSystem: true });
      }

      addBase('_id', contact._id);
      if (contact.info && contact.info.name) {
        addBase('info.name.first', contact.info.name.first);
        addBase('info.name.last', contact.info.name.last);
      }
      if (contact.info) {
        addBase('info.emails', contact.info.emails);
        addBase('info.phones', contact.info.phones);
        addBase('info.company', contact.info.company);
        addBase('info.jobTitle', contact.info.jobTitle);
        addBase('info.birthdate', contact.info.birthdate);
        addBase('info.locale', contact.info.locale);
        addBase('info.labelKeys', contact.info.labelKeys);
      }

      const extFields = [];
      const extended = (contact.info && contact.info.extendedFields) ? contact.info.extendedFields : {};
      if (extended && typeof extended === 'object') {
        const extKeys = Object.keys(extended);
        for (var i = 0; i < extKeys.length; i++) {
          var key = extKeys[i];
          var value = extended[key];
          let tipo = typeof value;
          if (value === null || value === undefined) tipo = 'null';
          else if (value instanceof Date) tipo = 'Date';

          let preview = '';
          try {
            if (value === null || value === undefined) preview = '(vacio)';
            else if (typeof value === 'object') preview = JSON.stringify(value).substring(0, 120);
            else preview = String(value).substring(0, 120);
          } catch (e) { preview = ''; }

          extFields.push({ fieldId: key, type: tipo, preview: preview, isSystem: false });
        }
      }

      extFields.sort(function(a, b) { return a.fieldId.localeCompare(b.fieldId); });

      var allFields = baseFields.concat(extFields.map(function(f) {
        return Object.assign({}, f, { badge: 'extended' });
      }));
      await guardarEnRegistry('WixContacts', allFields);

      return {
        ok: true,
        baseFields: baseFields,
        extendedFields: extFields,
        totalBase: baseFields.length,
        totalExtended: extFields.length
      };

    } catch (error) {
      console.error(TAG + ' Error leyendo contacts:', error.message);
      return { ok: false, error: error.message };
    }
  }
);

// =====================================================
// 6. EXPORTAR TODAS (v1.6.0) - SCHEMAS V2 NATIVOS
// Itera listDataCollections + getDataCollection por cada
// coleccion del site. Salida directa para alimentar el
// script de bootstrap de CMS en cuentas destino.
// =====================================================
export const exportarTodas = webMethod(
  Permissions.SiteMember,
  async () => {
    try {
      console.log(TAG + ' Iterando schemas V2 del site...');

      const listResp = await listDataCollectionsElevated();
      let rawList = [];
      if (listResp && Array.isArray(listResp.collections)) rawList = listResp.collections;
      else if (listResp && Array.isArray(listResp.dataCollections)) rawList = listResp.dataCollections;
      else if (Array.isArray(listResp)) rawList = listResp;
      else if (listResp && Array.isArray(listResp.items)) rawList = listResp.items;

      const ids = rawList.map(function(c) {
        return c.id || c._id || c.dataCollectionId;
      }).filter(function(id) { return !!id; });

      console.log(TAG + ' ' + ids.length + ' colecciones a procesar (paralelo)');

      const settled = await Promise.all(ids.map(function(id) {
        return getDataCollectionElevated(id)
          .then(function(resp) {
            const col = (resp && resp.collection) ? resp.collection : resp;
            const rawFields = (col && Array.isArray(col.fields)) ? col.fields : [];
            const fields = rawFields.map(function(f) {
              return {
                fieldId: f.key || f.fieldKey || f.id || '(unknown)',
                type: (typeof f.type !== 'undefined') ? f.type : '(unknown)',
                displayName: f.displayName || f.name || '',
                isSystem: (f.systemField === true) || (f.system === true)
              };
            });
            return {
              ok: true,
              data: {
                collectionName: id,
                displayName: (col && (col.displayName || col.name)) || '',
                collectionType: (col && (col.collectionType || col.type)) || '',
                fields: fields,
                totalFields: fields.length
              }
            };
          })
          .catch(function(errCol) {
            console.warn(TAG + ' Error leyendo schema de ' + id + ': ' + errCol.message);
            return { ok: false, id: id, error: errCol.message };
          });
      }));

      const colecciones = [];
      const errores = [];
      for (var i = 0; i < settled.length; i++) {
        if (settled[i].ok) colecciones.push(settled[i].data);
        else errores.push({ id: settled[i].id, error: settled[i].error });
      }

      console.log(TAG + ' Schemas V2 exportados: ' + colecciones.length + ' ok / ' + errores.length + ' fallidos');

      return {
        ok: true,
        colecciones: colecciones,
        total: colecciones.length,
        errores: errores
      };

    } catch (error) {
      console.error(TAG + ' Error exportando schemas V2:', error.message);
      return { ok: false, error: error.message };
    }
  }
);