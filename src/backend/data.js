// =====================================================
// KALONICE / KAMISUITE
// data.js
// Hooks automáticos sobre Service Catalog
// =====================================================

import {
  syncOnePublicServiceFromCatalog,
  hidePublicServiceFromCatalog
} from 'backend/servicesPublicSync';

export async function ServiceCatalog_afterInsert(item, context) {
  try {
    await syncOnePublicServiceFromCatalog(item);
  } catch (error) {
    console.error('[ServiceCatalog_afterInsert] Error:', error);
  }

  return item;
}

export async function ServiceCatalog_afterUpdate(item, context) {
  try {
    await syncOnePublicServiceFromCatalog(item);
  } catch (error) {
    console.error('[ServiceCatalog_afterUpdate] Error:', error);
  }

  return item;
}

export async function ServiceCatalog_beforeRemove(item, context) {
  try {
    await hidePublicServiceFromCatalog(item);
  } catch (error) {
    console.error('[ServiceCatalog_beforeRemove] Error:', error);
  }

  return item;
}