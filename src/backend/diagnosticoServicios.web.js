// =====================================================
// KAMISUITE - Diagnóstico: Leer TODOS los servicios
// =====================================================
// Página: Lectura Servicios
// Elemento: #listadoServicios (Text)  →  ahora HtmlComponent (widget)
// Versión: 1.1 — Añade nombres de staff dinámicos
// =====================================================

import { webMethod, Permissions } from 'wix-web-module';
import { elevate } from 'wix-auth';
import { services, serviceOptionsAndVariants } from 'wix-bookings.v2';
import { resources as resourcesBackend } from 'wix-bookings-backend'; // ★ NUEVO v1.1

const TAG = '[DiagServicios]';

// ★ NUEVO v1.1 — Misma lógica que coloracionLogic/mechasLogic
const STAFF_BLOCKLIST_NAMES = new Set(['PROCESO', 'CUALQUIERA']);

function normalizeStaffLabel(raw) {
  return (raw || '').trim().replace(/\s+/g, ' ');
}

function isBlockedStaffLabel(label) {
  const up = normalizeStaffLabel(label).toUpperCase();
  return STAFF_BLOCKLIST_NAMES.has(up);
}

async function listStaffResources() {
  try {
    const res = await resourcesBackend.queryResourceCatalog().find();
    const items = res?.items || [];

    const staff = [];
    const allNamed = [];

    for (const it of items) {
      const r = it?.resource || it?.resourceInfo || null;
      if (!r) continue;

      const resourceId = r._id || r.id || null;
      if (!resourceId) continue;

      const label = normalizeStaffLabel(r.name || r.displayName || r.title || '');
      if (label && !isBlockedStaffLabel(label)) {
        allNamed.push({ label, resourceId });
      }

      const tags = Array.isArray(r.tags) ? r.tags : [];
      if (!tags.includes('staff')) continue;
      if (!label || isBlockedStaffLabel(label)) continue;

      staff.push({ label, resourceId });
    }

    staff.sort((a, b) => String(a.label).localeCompare(String(b.label)));

    if (!staff.length && allNamed.length) {
      allNamed.sort((a, b) => String(a.label).localeCompare(String(b.label)));
      return allNamed;
    }

    return staff;
  } catch (e) {
    console.error(`${TAG} ERROR listStaffResources:`, e.message || e);
    return [];
  }
}
// ★ FIN NUEVO v1.1

export const listarServicios = webMethod(
  Permissions.Anyone,
  async () => {
    try {
      console.log(`${TAG} 📋 Leyendo todos los servicios...`);

      // ★ NUEVO v1.1 — Construir mapa staffId → nombre
      const staffList = await listStaffResources();
      const staffMap = {};
      for (const s of staffList) {
        staffMap[s.resourceId] = s.label;
      }
      console.log(`${TAG} 👥 Staff cargados: ${staffList.length} → ${staffList.map(s => s.label).join(', ')}`);

      // 1. Query todos los servicios (con paginación — Wix limita a 100 por página)
      const elevatedQuery = elevate(services.queryServices);
      let items = [];
      let skip = 0;
      const PAGE = 100;
      let hasMore = true;

      while (hasMore) {
        const result = await elevatedQuery().limit(PAGE).skip(skip).find();
        const page = result.items || [];
        items = items.concat(page);
        console.log(`${TAG} 📄 Página ${skip / PAGE + 1}: ${page.length} servicios (acumulado: ${items.length})`);
        hasMore = page.length === PAGE;
        skip += PAGE;
      }

      console.log(`${TAG} ✅ ${items.length} servicios encontrados`);

      // 2. Extraer info de cada servicio
      const lista = items.map(svc => {
        // Log payment completo de servicios VARIED
        if (svc.payment?.rateType === 'VARIED') {
          const payRaw = JSON.stringify(svc.payment) || 'null';
          console.log(`${TAG} 💰 ${svc.name} payment[0..500]: ${payRaw.substring(0, 500)}`);
          if (payRaw.length > 500) {
            console.log(`${TAG} 💰 ${svc.name} payment[500..1000]: ${payRaw.substring(500, 1000)}`);
          }
          // Log schedule completo también
          const schRaw = JSON.stringify(svc.schedule) || 'null';
          console.log(`${TAG} 📅 ${svc.name} schedule[0..500]: ${schRaw.substring(0, 500)}`);
        }

        // ★ NUEVO v1.1 — Resolver nombres de staff
        const rawIds = svc.staffMemberIds || [];
        const staffNames = rawIds.map(id => staffMap[id] || null).filter(Boolean);
        
        return {
          id: svc._id,
          name: svc.name,
          type: svc.type,
          category: svc.category?.name || '',
          hidden: svc.hidden || false,
          duration: svc.schedule?.availabilityConstraints?.sessionDurations?.[0] || null,
          defaultPrice: svc.payment?.rateType === 'FIXED' 
            ? svc.payment?.fixed?.price?.value 
            : svc.payment?.defaultPrice?.value || null,
          rateType: svc.payment?.rateType || '',
          currency: svc.payment?.fixed?.price?.currency || svc.payment?.defaultPrice?.currency || '',
          staffIds: rawIds,
          staffNames: staffNames, // ★ NUEVO v1.1
          variants: []
        };
      });

      // 3. Leer variaciones SOLO de servicios con precios variables (VARIED)
      const variedServices = lista.filter(s => s.rateType === 'VARIED');
      console.log(`${TAG} 🔀 ${variedServices.length} servicios con variaciones`);

      for (const svc of variedServices) {
        try {
          // Intentar método 1: getByServiceId
          let varResult = null;
          try {
            const elevatedGet = elevate(serviceOptionsAndVariants.getServiceOptionsAndVariantsByServiceId);
            varResult = await elevatedGet(svc.id);
          } catch (e1) {
            console.log(`${TAG} 🔀 ${svc.name} getByServiceId falló: ${e1.message?.substring(0, 80)}`);
          }

          // Intentar método 2: query filtrado
          if (!varResult) {
            try {
              const elevatedQ = elevate(serviceOptionsAndVariants.queryServiceOptionsAndVariants);
              const qResult = await elevatedQ().eq('serviceId', svc.id).find();
              console.log(`${TAG} 🔀 ${svc.name} query encontró: ${qResult.items?.length || 0} items`);
              if (qResult.items?.length > 0) {
                varResult = qResult.items[0];
              }
            } catch (e2) {
              console.log(`${TAG} 🔀 ${svc.name} query falló: ${e2.message?.substring(0, 80)}`);
            }
          }

          if (varResult) {
            const raw = JSON.stringify(varResult) || 'null';
            console.log(`${TAG} 🔀 ${svc.name} raw[0..500]: ${raw.substring(0, 500)}`);
            if (raw.length > 500) {
              console.log(`${TAG} 🔀 ${svc.name} raw[500..1000]: ${raw.substring(500, 1000)}`);
            }

            if (varResult?.options?.values) {
              svc.optionName = varResult.options.values?.[0]?.optionName || '';
            }
            
            if (varResult?.variants?.values) {
              svc.variants = varResult.variants.values.map(v => ({
                choices: v.choices || {},
                price: v.price?.value || null,
                currency: v.price?.currency || '',
                duration: v.duration || null
              }));
            }
          }
        } catch (varErr) {
          console.log(`${TAG} ⚠️ Variaciones ${svc.name}: ${varErr.message || String(varErr)}`);
        }
      }

      // 4. Log resumen
      lista.forEach(s => {
        const varInfo = s.variants.length > 0 ? ` | ${s.variants.length} variaciones` : '';
        const staffInfo = s.staffNames.length > 0 ? ` | Staff: ${s.staffNames.join(', ')}` : ''; // ★ NUEVO v1.1
        console.log(`${TAG} 📌 ${s.name} | ${s.id} | ${s.category} | ${s.duration}min | ${s.defaultPrice}${s.currency} | hidden:${s.hidden}${staffInfo}${varInfo}`);
        
        s.variants.forEach(v => {
          console.log(`${TAG}    ↳ ${JSON.stringify(v.choices)} → ${v.price}${v.currency} | ${v.duration}min`);
        });
      });

      return {
        ok: true,
        total: lista.length,
        servicios: lista,
        staffCatalog: staffList // ★ NUEVO v1.1 — Para referencia en frontend
      };

    } catch (e) {
      console.error(`${TAG} ❌ FAIL:`, e);
      return { ok: false, error: e.message };
    }
  }
);