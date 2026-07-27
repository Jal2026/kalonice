// =====================================================
// KAMISUITE - Page Code: CMS Field ID Reader
// =====================================================
// Pagina: kamisuitestats (o donde coloques el widget)
// Elemento: #htmlFieldReader (HtmlComponent)
// Backend: cmsFieldReader.web.js v1.5.0
// Coleccion: KamisuiteIds
// Version: 1.2.0
// =====================================================
// CAMBIOS v1.2.0:
// - Import nuevo: listarColeccionesV2 (backend v1.5.0)
// - Nuevo case 'listCollectionsV2' que devuelve el inventario
//   completo de colecciones del site (NATIVE / WIX_APP / EXTERNAL)
//   con dataCollectionId real, displayName y type.
//
// CAMBIOS v1.1.0:
// - Import nuevo: leerSchemaV2 (backend v1.4.0)
// - Nuevo case 'readSchemaV2' que invoca el schema nativo Wix
//   via wix-data.v2/collections.getDataCollection().
// =====================================================

import {
  leerFieldIds,
  leerSchemaV2,
  listarColeccionesV2,
  leerContactFields,
  cargarHistorial,
  eliminarRegistro,
  exportarTodas
} from 'backend/cmsFieldReader.web';

const TAG = '[FieldReaderPage v1.2.0]';

$w.onReady(function () {

  $w('#htmlFieldReader').onMessage(async (event) => {
    const msg = event.data;
    if (!msg || !msg.type) return;

    const send = function(type, data) {
      $w('#htmlFieldReader').postMessage(Object.assign({ type: type }, data));
    };

    // -- Widget arranca: cargar historial de KamisuiteIds --
    if (msg.type === 'ready' || msg.type === 'loadHistory') {
      console.log(TAG + ' Cargando historial...');
      try {
        const res = await cargarHistorial();
        send('historyLoaded', { payload: res });
      } catch (e) {
        console.error(TAG + ' Error historial:', e.message);
      }
      return;
    }

    // -- Leer field IDs de una coleccion (+ autoguarda en KamisuiteIds) --
    if (msg.type === 'readCollection') {
      console.log(TAG + ' Leyendo: ' + msg.collectionName);
      try {
        const res = await leerFieldIds({ collectionName: msg.collectionName });
        send(res && res.ok ? 'collectionData' : 'error', { payload: res });
      } catch (e) {
        send('error', { payload: { ok: false, error: e.message } });
      }
      return;
    }

    // -- v1.1.0: Leer schema V2 (tipos Wix nativos via wix-data.v2) --
    if (msg.type === 'readSchemaV2') {
      console.log(TAG + ' Leyendo schema V2 de: ' + msg.collectionName);
      try {
        const res = await leerSchemaV2({ collectionName: msg.collectionName });
        send(res && res.ok ? 'schemaV2Data' : 'error', { payload: res });
      } catch (e) {
        send('error', { payload: { ok: false, error: e.message } });
      }
      return;
    }

    // -- v1.2.0: Listar TODAS las colecciones del site (V2) --
    if (msg.type === 'listCollectionsV2') {
      console.log(TAG + ' Listando colecciones V2 del site...');
      try {
        const res = await listarColeccionesV2();
        send(res && res.ok ? 'collectionsV2List' : 'error', { payload: res });
      } catch (e) {
        send('error', { payload: { ok: false, error: e.message } });
      }
      return;
    }

    // -- Leer campos de Wix Contacts (+ autoguarda en KamisuiteIds) --
    if (msg.type === 'readContacts') {
      console.log(TAG + ' Leyendo Wix Contacts...');
      try {
        const res = await leerContactFields();
        send(res && res.ok ? 'contactsData' : 'error', { payload: res });
      } catch (e) {
        send('error', { payload: { ok: false, error: e.message } });
      }
      return;
    }

    // -- Eliminar registro de KamisuiteIds --
    if (msg.type === 'deleteFromRegistry') {
      console.log(TAG + ' Eliminando: ' + msg.collectionName);
      try {
        const res = await eliminarRegistro({ collectionName: msg.collectionName });
        send(res && res.ok ? 'registryDeleted' : 'error', { payload: res, collectionName: msg.collectionName });
      } catch (e) {
        send('error', { payload: { ok: false, error: e.message } });
      }
      return;
    }

    // -- Exportar todas las colecciones de KamisuiteIds --
    if (msg.type === 'exportAll') {
      console.log(TAG + ' Exportando todas...');
      try {
        const res = await exportarTodas();
        send(res && res.ok ? 'allExported' : 'error', { payload: res });
      } catch (e) {
        send('error', { payload: { ok: false, error: e.message } });
      }
      return;
    }
  });

});