// =====================================================
// KAMISUITE - Setup Import Servicios - Backend
// =====================================================
// VERSION: 1.2.0
// FECHA: 5 de junio de 2026
//
// PROPÓSITO
// Widget intérprete (cuenta Wix del salón). Traduce el array services[]
// del JSON de Setup Salón a filas de ServiceCatalog (fuente absoluta del
// catálogo multi-tenant). NO toca Wix Bookings ni SvMapeoServicios.
//
// CHANGELOG:
// v1.0.0 - Import 1:1 (insert siempre). previewServiciosDesdeJson +
//          importarServiciosDesdeJson + contarServiciosCatalogo.
// v1.2.0 - UPSERT POR setupUid + ANTI-COLISIÓN:
//          · Cada servicio del JSON trae `uid` (estable, generado en Setup).
//            Se guarda en ServiceCatalog.setupUid.
//          · Import deja de duplicar al reimportar: busca por setupUid.
//              - Si existe la fila → ACTUALIZA solo los campos de la "ficha"
//                que controla el Setup (label, family, group, tipo, duration,
//                price, minProceso, ordenFases, hasVariants, advancePayment,
//                advancePercent) y, para per_gram, regenera la variante
//                "Por gramo". RESPETA lo asignado dentro del salón:
//                idStaff, staff, image, uso, descripcion, order — y las
//                variantes manuales NO se tocan salvo en per_gram.
//              - Si no existe → CREA fila nueva (CMS-only, serviceIdWix='').
//          · Anti-colisión: si dentro del MISMO JSON llegan uids repetidos
//            (bug de generación en origen), se regenera el segundo y
//            siguientes antes de escribir, para no fusionar dos servicios
//            distintos bajo el mismo setupUid.
//          · Servicios del JSON SIN uid: se les asigna uno al vuelo
//            (retrocompat, aunque el Setup v15+ siempre los manda).
//          · READ-MERGE-UPDATE estricto en la rama de actualización
//            (spread del registro existente; nunca update parcial).
// =====================================================

import { Permissions, webMethod } from 'wix-web-module';
import wixData from 'wix-data';

const TAG = '[SetupImportServicios][1.2.0]';
const CMS_CATALOG = 'ServiceCatalog';

// =====================================================
// HELPERS de traducción (idénticos en intención a v1.0)
// =====================================================
function traducirTipo(type) {
  const map = { principal: 'publico', complemento: 'complemento', ambos: 'ambos', fase: 'fase' };
  return map[type] || 'publico';
}

function traducirFases(phases) {
  if (!Array.isArray(phases) || phases.length === 0) return '';
  return phases
    .filter(p => typeof p === 'string' && p.trim() !== '')
    .map(p => p.trim().toUpperCase())
    .join(', ');
}

function construirVariantesPerGram(svc) {
  if (svc.pricingModel === 'per_gram') {
    const variante = {
      nombre: 'Por gramo',
      precio: (typeof svc.pricePerGram === 'number') ? svc.pricePerGram : null,
      duracion: (typeof svc.duration === 'number') ? svc.duration : null,
      tamano_estilo: 'por gramo'
    };
    return JSON.stringify([variante]);
  }
  return null; // null = no aplica (no sobreescribir variantes en upsert)
}

// =====================================================
// HELPER: uid anti-colisión en backend (defensa de destino)
// =====================================================
let _impCounter = 0;
function genUidBackend() {
  _impCounter = (_impCounter + 1) % 1000000;
  return 'svc_' + Date.now().toString(36) + '_' + _impCounter.toString(36) + '_' + Math.random().toString(36).slice(2, 6);
}

// =====================================================
// HELPER: traducir un servicio del JSON → "ficha" (campos del Setup)
// =====================================================
// Devuelve solo los campos que el Setup controla. La variante per_gram se
// devuelve aparte (puede ser null si no aplica).
function traducirFicha(svc) {
  const avisos = [];

  const minProceso = (typeof svc.processDuration === 'number' && svc.processDuration > 0)
    ? svc.processDuration
    : null;

  let price = null;
  if (svc.price === 0) price = 0;
  else if (typeof svc.price === 'number') price = svc.price;
  else price = null;

  const esPerGram = svc.pricingModel === 'per_gram';
  if (esPerGram) avisos.push('Precio por gramo → variante "Por gramo"');
  if (price === null && !esPerGram) avisos.push('Precio sin definir (a valorar en salón)');

  const ficha = {
    label: (svc.label || '').trim(),
    family: svc.family || 'simple',
    group: svc.group || '',
    tipo: traducirTipo(svc.type),
    duration: (typeof svc.duration === 'number') ? svc.duration : 0,
    price: price,
    minProceso: minProceso,
    ordenFases: traducirFases(svc.phases),
    hasVariants: !!svc.hasVariants,
    advancePayment: !!svc.advancePayment,
    advancePercent: (typeof svc.advancePercent === 'number') ? svc.advancePercent : 0
  };

  const variantePerGram = construirVariantesPerGram(svc); // string JSON o null

  return { ficha, variantePerGram, aviso: avisos.length ? avisos.join(' · ') : null };
}

// =====================================================
// HELPER: extraer servicios + normalizar uids del JSON
// =====================================================
// - Acepta JSON completo { services:[...] } o array directo.
// - Garantiza uid en cada servicio (asigna si falta).
// - Anti-colisión: si un uid se repite dentro del mismo lote, regenera.
function extraerServiciosNormalizados(input) {
  let data = input;
  if (typeof input === 'string') data = JSON.parse(input); // puede lanzar
  let arr = null;
  if (Array.isArray(data)) arr = data;
  else if (data && Array.isArray(data.services)) arr = data.services;
  if (!arr) return null;

  const vistos = new Set();
  const normalizados = arr.map(svc => {
    let uid = (svc && typeof svc.uid === 'string' && svc.uid.trim()) ? svc.uid.trim() : '';
    if (!uid) uid = genUidBackend();
    if (vistos.has(uid)) {
      // Colisión dentro del lote → regenerar para no fusionar servicios
      uid = genUidBackend();
    }
    vistos.add(uid);
    return { ...svc, uid };
  });

  return normalizados;
}

// =====================================================
// 1. PREVIEW — traduce sin escribir
// =====================================================
export const previewServiciosDesdeJson = webMethod(
  Permissions.Anyone,
  async ({ json }) => {
    try {
      const servicios = extraerServiciosNormalizados(json);
      if (!servicios) {
        return { success: false, error: 'El JSON no contiene un array de servicios válido (services[]).' };
      }

      console.log(`${TAG} 🔍 Preview de ${servicios.length} servicios`);

      // Para el preview indicamos qué servicios ya existen (por setupUid)
      const existentes = await cargarSetupUidsExistentes();

      const preview = servicios.map((svc, i) => {
        const { ficha, variantePerGram, aviso } = traducirFicha(svc);
        const yaExiste = existentes.has(svc.uid);
        return {
          indice: i,
          uid: svc.uid,
          yaExiste: yaExiste,
          label: ficha.label,
          family: ficha.family,
          group: ficha.group,
          tipo: ficha.tipo,
          duration: ficha.duration,
          price: ficha.price,
          minProceso: ficha.minProceso,
          ordenFases: ficha.ordenFases,
          hasVariants: ficha.hasVariants,
          advancePayment: ficha.advancePayment,
          advancePercent: ficha.advancePercent,
          variantePerGram: variantePerGram,
          aviso: aviso
        };
      });

      return {
        success: true,
        total: preview.length,
        conAviso: preview.filter(p => p.aviso).length,
        sinNombre: preview.filter(p => !p.label).length,
        yaExisten: preview.filter(p => p.yaExiste).length,
        preview: preview
      };

    } catch (error) {
      console.error(`${TAG} ❌ Error en preview:`, error);
      return { success: false, error: error.message };
    }
  }
);

// =====================================================
// HELPER: set de setupUid ya presentes en ServiceCatalog
// =====================================================
async function cargarSetupUidsExistentes() {
  const set = new Set();
  try {
    let skip = 0;
    const pageSize = 500;
    let hasMore = true;
    while (hasMore) {
      const res = await wixData.query(CMS_CATALOG)
        .isNotEmpty('setupUid')
        .skip(skip)
        .limit(pageSize)
        .find({ suppressAuth: true });
      (res.items || []).forEach(it => { if (it.setupUid) set.add(it.setupUid); });
      if ((res.items || []).length < pageSize) hasMore = false;
      else skip += pageSize;
    }
  } catch (e) {
    console.error(`${TAG} ⚠️ Error cargando setupUids existentes:`, e.message);
  }
  return set;
}

// =====================================================
// 2. IMPORTAR — upsert por setupUid
// =====================================================
export const importarServiciosDesdeJson = webMethod(
  Permissions.Anyone,
  async ({ json }) => {
    try {
      const servicios = extraerServiciosNormalizados(json);
      if (!servicios) {
        return { success: false, error: 'El JSON no contiene un array de servicios válido (services[]).' };
      }

      console.log(`${TAG} 📥 Upsert de ${servicios.length} servicios en ServiceCatalog`);

      const resultados = [];
      let creados = 0;
      let actualizados = 0;
      let fallidos = 0;
      let omitidos = 0;

      for (let i = 0; i < servicios.length; i++) {
        const svc = servicios[i];
        const { ficha, variantePerGram, aviso } = traducirFicha(svc);

        if (!ficha.label) {
          omitidos++;
          resultados.push({ indice: i, label: '(sin nombre)', estado: 'omitido', detalle: 'Servicio sin label' });
          continue;
        }

        try {
          // Buscar fila existente por setupUid
          const existeQ = await wixData.query(CMS_CATALOG)
            .eq('setupUid', svc.uid)
            .limit(1)
            .find({ suppressAuth: true });

          if (existeQ.items.length > 0) {
            // ─── ACTUALIZAR (respeta staff/imagen/uso/variantes manuales) ───
            const registro = existeQ.items[0];
            const merged = {
              ...registro,                  // preserva TODO lo del salón
              label: ficha.label,
              family: ficha.family,
              group: ficha.group,
              tipo: ficha.tipo,
              duration: ficha.duration,
              price: ficha.price,
              minProceso: ficha.minProceso,
              ordenFases: ficha.ordenFases,
              hasVariants: ficha.hasVariants,
              advancePayment: ficha.advancePayment,
              advancePercent: ficha.advancePercent
              // NO se tocan: idStaff, staff, image, uso, descripcion, order
            };
            // Solo en per_gram regeneramos la variante automática
            if (variantePerGram !== null) {
              merged.variantes = variantePerGram;
            }
            await wixData.update(CMS_CATALOG, merged, { suppressAuth: true });
            actualizados++;
            resultados.push({ indice: i, label: ficha.label, estado: 'actualizado', catalogId: registro._id, aviso });
          } else {
            // ─── CREAR fila nueva ───
            const nuevo = {
              ...ficha,
              setupUid: svc.uid,
              variantes: (variantePerGram !== null) ? variantePerGram : '[]',
              idStaff: '[]',
              staff: '[]',
              uso: '',
              descripcion: '',
              image: '',
              order: 99,
              active: (svc.active !== undefined) ? !!svc.active : true,
              serviceIdWix: ''
            };
            const inserted = await wixData.insert(CMS_CATALOG, nuevo, { suppressAuth: true });
            creados++;
            resultados.push({ indice: i, label: ficha.label, estado: 'creado', catalogId: inserted._id, aviso });
          }
        } catch (opErr) {
          fallidos++;
          resultados.push({ indice: i, label: ficha.label, estado: 'error', detalle: opErr.message });
          console.error(`${TAG} ⚠️ Error con "${ficha.label}":`, opErr.message);
        }
      }

      console.log(`${TAG} ✅ Upsert terminado: ${creados} creados, ${actualizados} actualizados, ${fallidos} error, ${omitidos} omitidos`);

      return {
        success: true,
        total: servicios.length,
        creados,
        actualizados,
        fallidos,
        omitidos,
        resultados
      };

    } catch (error) {
      console.error(`${TAG} ❌ Error en import:`, error);
      return { success: false, error: error.message };
    }
  }
);

// =====================================================
// 3. CONTAR servicios actuales
// =====================================================
export const contarServiciosCatalogo = webMethod(
  Permissions.Anyone,
  async () => {
    try {
      const result = await wixData.query(CMS_CATALOG).limit(1).find({ suppressAuth: true });
      return { success: true, total: result.totalCount || 0 };
    } catch (error) {
      console.error(`${TAG} ❌ Error contando catálogo:`, error);
      return { success: false, error: error.message };
    }
  }
);