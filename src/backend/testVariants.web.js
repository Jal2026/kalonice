// =====================================================
// TEST - Leer variaciones de servicio Wix
// =====================================================
// Archivo temporal para probar serviceOptionsAndVariants API
// =====================================================

import { webMethod, Permissions } from 'wix-web-module';
import { elevate } from 'wix-auth';
import { services, serviceOptionsAndVariants } from 'wix-bookings.v2';

const TAG = '[TEST-SERVICE]';

/**
 * Función de prueba para leer el servicio completo
 * 
 * Uso desde frontend:
 * import { testReadService } from 'backend/testVariants.web';
 * const result = await testReadService({ serviceId: "337650d8-3998-46a4-aaa5-fd374aa10644" });
 * console.log(result);
 */
export const testReadService = webMethod(Permissions.Anyone, async ({ serviceId }) => {
  try {
    console.log(`${TAG} 🧪 Leyendo servicio con QUERY: ${serviceId}`);
    
    if (!serviceId) {
      throw new Error('serviceId es requerido');
    }
    
    // OPCIÓN 1: Leer servicio con queryServices
    console.log(`${TAG} Método 1: queryServices...`);
    const elevatedQuery = elevate(services.queryServices);
    const queryResult = await elevatedQuery()
      .eq('_id', serviceId)
      .find();
    
    console.log(`${TAG} Query result:`, JSON.stringify(queryResult, null, 2));
    
    if (queryResult.items && queryResult.items.length > 0) {
      const svcFromQuery = queryResult.items[0];
      console.log(`${TAG} ✅ Servicio desde QUERY:`, JSON.stringify(svcFromQuery, null, 2));
      
      if (svcFromQuery.variants) {
        console.log(`${TAG} 🎉🎉🎉 VARIANTS ENCONTRADAS VIA QUERY:`, JSON.stringify(svcFromQuery.variants, null, 2));
      } else {
        console.log(`${TAG} ⚠️ No hay variants en query result`);
      }
    }
    
    // OPCIÓN 2: Leer servicio con getService (como antes)
    console.log(`${TAG} Método 2: getService...`);
    const elevatedGet = elevate(services.getService);
    const svc = await elevatedGet(serviceId);
    
    console.log(`${TAG} ✅ Servicio desde GET:`, JSON.stringify(svc, null, 2));
    
    // Extraer información relevante
    const schedule = svc?.schedule || null;
    const rate = schedule?.rate || null;
    const sessionDurations = schedule?.availabilityConstraints?.sessionDurations || [];
    const variants = svc?.variants || [];  // ← ESTO ES LO QUE BUSCAMOS
    
    console.log(`${TAG} 📊 sessionDurations:`, JSON.stringify(sessionDurations, null, 2));
    console.log(`${TAG} 💰 rate:`, JSON.stringify(rate, null, 2));
    console.log(`${TAG} 🎯 variants:`, JSON.stringify(variants, null, 2));
    
    if (variants && variants.length > 0) {
      console.log(`${TAG} ✅✅✅ VARIANTES ENCONTRADAS: ${variants.length}`);
      variants.forEach((v, idx) => {
        console.log(`${TAG} Variante ${idx + 1}:`, {
          label: v?.label,
          price: v?.price,
          duration: v?.scheduleConfig?.duration
        });
      });
    } else {
      console.log(`${TAG} ⚠️ No hay campo variants en el servicio`);
    }
    
    return {
      ok: true,
      serviceId,
      serviceName: svc?.name || 'Sin nombre',
      sessionDurations,
      rate,
      variants,
      fullService: svc
    };
    
  } catch (error) {
    console.error(`${TAG} ❌ Error leyendo servicio:`, error);
    return {
      ok: false,
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack
      }
    };
  }
});
