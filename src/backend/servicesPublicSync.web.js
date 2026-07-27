import wixData from 'wix-data';
import { webMethod, Permissions } from 'wix-web-module';
import { syncOnePublicServiceFromCatalog } from 'backend/servicesPublicSync';

const SOURCE_COLLECTION = 'ServiceCatalog';

const DATA_OPTIONS = {
  suppressAuth: true,
  suppressHooks: true
};

export const syncPublicServicesFromCatalog = webMethod(
  Permissions.Anyone,
  async () => {
    const sourceItems = await getAllItems(SOURCE_COLLECTION);

    let synced = 0;
    let failed = 0;
    const errors = [];

    for (const item of sourceItems) {
      try {
        await syncOnePublicServiceFromCatalog(item);
        synced += 1;
      } catch (error) {
        failed += 1;
        errors.push({
          label: item.label || '',
          setupUid: item.setupUid || '',
          message: error.message || String(error)
        });
      }
    }

    return {
      ok: failed === 0,
      sourceItems: sourceItems.length,
      synced,
      failed,
      errors
    };
  }
);

async function getAllItems(collectionId) {
  let results = await wixData
    .query(collectionId)
    .limit(1000)
    .find(DATA_OPTIONS);

  let items = [...results.items];

  while (results.hasNext()) {
    results = await results.next();
    items = items.concat(results.items);
  }

  return items;
}