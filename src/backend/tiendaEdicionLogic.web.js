// =====================================================
// KAMISUITE - Edición Catálogo Productos (Backend)
// =====================================================
// Archivo: tiendaEdicionLogic.web.js
// Versión: 1.2.6
// =====================================================
// v1.0.0: Versión inicial — 7 funciones CRUD productos
// v1.0.1: FIX brand minLength + createCollection wix-stores.v2
// v1.0.2: Multi-imagen: agregarImagenesProducto,
//         eliminarImagenesProducto, mediaItems en listado
// v1.0.3: FIX mimeType dinámico via detectMimeType()
// v1.0.4: FIX eliminarImagenesProducto: wix-stores-backend
//         removeProductMedia no aceptaba [{src}] para borrar
//         imágenes específicas (error vacío). Ahora usa
//         storesProducts.removeProductMedia de wix-stores.v2
//         con mediaIds como strings extraídos del wix:image URL.
// v1.0.5: additionalInfoSections — leer y escribir los bloques
//         de información adicional del producto (Descripción corta,
//         Componentes, Usos recomendados, Ventajas del producto).
//
// v1.1.0 (24 Jun 2026): MÓDULO ALTA Y EDICIÓN PRODUCTOS
//         (rebautizado, antes "Tienda Productos · Edición").
//         · FIX OCULTOS: la query a Stores/Products devuelve ahora
//           productos ocultos (visible:false). La query sin
//           suppressAuth omitía silenciosamente los hidden;
//           el editor "podía crearlos pero no editarlos". Patrón
//           confirmado en docs Wix:
//           dev.wix.com/.../wix-stores-products-collection-fields
//           "By default, querying hidden products requires the
//            appropriate permissions. However, you can allow your
//            visitors to temporarily bypass this requirement by
//            setting the suppressAuth property to true."
//
// v1.1.1 (24 Jun 2026): FIX REAL OCULTOS + DIAGNÓSTICO COSTE
//         · suppressAuth NO basta para Stores/Products (probado en
//           producción por Jal: la query seguía devolviendo solo
//           visibles). La sintaxis correcta documentada en
//           "Querying Wix App Collections" (Wix docs) es:
//             .find({ appOptions: { includeHiddenProducts: true } })
//           Aplicada en listarProductosParaEdicion. suppressAuth se
//           mantiene como cinturón y tirantes; no estorba.
//         · obtenerCosteProducto: añadidos LOGS detallados del
//           objeto de respuesta de storesProducts.getProduct para
//           diagnosticar el path real de costAndProfitData. Si el
//           coste sigue sin leerse, el log mostrará la estructura
//           completa de la response y desde ahí ajustamos el path.
//         · Sin cambios en otras funciones.
//
// v1.2.0 (24 Jun 2026): FIX VISIBLE + COSTE en listado masivo.
//         Diagnóstico final (confirmado por docs Wix oficial
//         "Stores/Products Collection Fields"): los campos `visible`
//         y `costAndProfitData` NO están expuestos en el schema de
//         la collection Stores/Products. La query wixData los
//         devolvía como undefined, y mi código `prod.visible !== false`
//         convertía todo undefined en true → TODOS los productos
//         aparecían marcados como "visibles" en el modal, incluso
//         los que estaban ocultos en Wix Dashboard.
//         Producto reportado por Jal: HARMONIA ACONDICIONADOR
//         (oculto en Wix, marcado como visible en el editor).
//
//         Estrategia: query dual cruzada por productId.
//         · Query A (wixData.query Stores/Products) → mediaItems,
//           collections, additionalInfoSections, stock, inStock,
//           trackInventory, mainMedia, sku, ribbon, etc. Sigue
//           devolviendo TODOS los productos gracias a
//           appOptions.includeHiddenProducts:true.
//         · Query B (storesProducts.queryProducts() de wix-stores.v2)
//           → product completo con `visible` y `costAndProfitData`.
//           Es la única vía documentada para acceder a esos campos
//           desde Velo backend.
//         · Se cruzan por productId. Si la query B falla, el
//           producto queda con visible:undefined y se sigue
//           devolviendo desde A para no romper el listado.
//
//         · obtenerCosteProducto: queda como función auxiliar
//           pero ya NO la necesita el widget (el coste viene en
//           el listado). Page code y widget pueden seguir
//           llamándola sin problema.
//         · NEW lectura inventario real: quantityInStock y
//           trackInventory se devuelven en el listado (campos
//           nativos de Stores/Products). Para productos con
//           trackInventory=false se devuelve quantityInStock=null
//           (no aplica). Reemplaza el booleano inStock como única
//           señal de stock.
//         · NEW obtenerCosteProducto(productId): lee el coste
//           real del producto. Necesario porque Stores/Products
//           collection NO expone costAndProfitData en su schema
//           (campo ausente del listado oficial de fields en docs).
//           Usa storesProducts.getProduct() de wix-stores.v2 que
//           sí devuelve el Product completo con costAndProfitData.
//           Lo llama el widget al abrir el modal de edición
//           (una sola call por modal, no por listado).
//         · NEW descontarUnidadProducto(productId): resta 1
//           unidad del stock vía decrementInventory(). Como esta
//           API requiere variantId, se obtiene primero con
//           getProductVariants() (para productos sin variantes
//           devuelve el variant default).
//         · NEW setearStockProducto(productId, nuevaCantidad):
//           ajuste manual del stock (alta de lote / corrección).
//           Lee variantId + stock actual, calcula delta y aplica
//           increment/decrementInventory según el signo. Idempotente.
//         · actualizarProducto: sin cambios funcionales; el ajuste
//           de stock se hace por la función específica nueva.
//         · Compatibilidad: tiendaProductos.web.js (venta) sigue
//           usando su propia listarProductos sin tocar.
//
// v1.2.1 (24 Jun 2026): + activarSeguimientoStock (primera versión).
//         · Usaba updateInventoryVariantFieldsByProductId con
//           { trackQuantity, variants:[{variantId, inStock:true}] }.
//           NO funcionaba: Wix rechazaba con
//           "quantity must be provided and greater than 0 when
//            inventory being tracked. quantity=None".
//
// v1.2.2 (25 Jun 2026): FIX activarSeguimientoStock — quantity.
//         Diagnóstico cerrado con logs de producción + firma real
//         del objeto InventoryItemVariantInfo confirmada en el
//         editor de Velo:
//           updateInventoryVariantFieldsByProductId(productId, {
//             trackQuantity: boolean,
//             variants: [{ variantId, quantity, inStock }]
//           })
//         · Campo de cada variant: variantId (string),
//           quantity (number), inStock (boolean).
//         · trackQuantity=true → Wix EXIGE quantity > 0. inStock se
//           deriva de quantity (lo dice el propio tooltip de Velo:
//           "If trackQuantity is true, inStock is based on the
//            actual tracked quantity").
//         · trackQuantity=false → se usa inStock (modo simple).
//
//         CAMBIO DE FIRMA:
//           activarSeguimientoStock(productId, activar)
//             → activarSeguimientoStock(productId, activar, cantidad)
//         Comportamiento:
//           · activar=true + cantidad>0 → trackQuantity:true,
//             variants:[{variantId, quantity:<cantidad>}]
//           · activar=true + cantidad ausente/0 → quantity:1 por
//             defecto (mínimo técnico: Wix no acepta 0 con tracking).
//           · activar=false → trackQuantity:false,
//             variants:[{variantId, inStock:true}]
//         Esto activa tracking Y fija el stock en UNA sola llamada,
//         eliminando el encadenamiento frágil "activar → setear"
//         que rompía en producción.
//         · setearStockProducto se mantiene intacta para ajustar
//           el stock de productos que YA tienen tracking activo.
//
// v1.2.3 (25 Jun 2026): FIX VISIBILIDAD (filtros) + COSTE por modal.
//         Causa (logs producción 25-jun): storesProducts.queryProducts()
//         de wix-stores.v2 solo devolvía 92 de 231 productos (paginación
//         con cursor frágil) y NUNCA traía el coste (todos los samples
//         cost:null). Los 139 productos restantes quedaban con
//         visible:null → desaparecían de AMBOS filtros del widget.
//         · FIX visible: se elimina el cruce con queryProducts v2. Se
//           deduce la visibilidad con DOBLE QUERY A sobre la collection
//           Stores/Products: una SIN includeHiddenProducts (solo
//           visibles) y otra CON él (todos). El cruce por _id da
//           visible:true/false para los 231, sin paginación frágil.
//         · FIX coste: ya NO se intenta cruzar en el listado masivo.
//           El coste se lee por modal con obtenerCosteProducto(productId).
//           El widget debe llamarlo al abrir el modal (page code v3.x
//           + widget actualizado).
//         · Sin cambios en activarSeguimientoStock, setearStock, etc.
//
// v1.2.4 (25 Jun 2026): FIX COSTE leer + GUARDAR (BUG 1, real).
//         Causa confirmada (log producción + doc): updateProductFields
//         de V1 NO permite escribir el coste (no está en su
//         UpdateProductInfo). Y getProduct devuelve costAndProfitData:
//         null porque, con productos que tienen variantes, el coste
//         vive en la VARIANTE (costAndProfitData.itemCost), no en el
//         producto padre (que solo expone costRange, informativo).
//         · LECTURA (obtenerCosteProducto): ahora lee el coste de la
//           primera variante vía getProductVariants. Fallback a
//           costRange/costAndProfitData del padre.
//         · ESCRITURA (NEW setearCosteProducto): escribe el coste en
//           todas las variantes con updateVariantData(productId,
//           choices, {costAndProfitData:{itemCost}}). Es la única vía
//           V1 para guardar coste. Llamada por el page code cuando el
//           usuario mete coste en el modal.
//         · actualizarProducto: deja de intentar escribir coste (no
//           funcionaba); ignora campos.cost (lo gestiona la función
//           dedicada).
// =====================================================

import { webMethod, Permissions } from 'wix-web-module';
import { elevate } from 'wix-auth';
import wixData from 'wix-data';
import wixStoresBackend from 'wix-stores-backend';
import { getProductVariants, incrementInventory, decrementInventory, updateInventoryVariantFieldsByProductId } from 'wix-stores-backend';
import { products as storesProducts } from 'wix-stores.v2';
import { mediaManager } from 'wix-media-backend';

const TAG = '[TiendaEdicion]';
const VERSION = '1.2.6';

// =====================================================
// UTILIDAD: Detectar MIME type del base64 o extensión
// =====================================================
function detectMimeType(base64Data, fileName) {
  // 1. Extraer del prefijo data URI
  if (base64Data && base64Data.startsWith('data:')) {
    const match = base64Data.match(/^data:([^;,]+)/);
    if (match && match[1]) return match[1];
  }
  // 2. Fallback: extensión del archivo
  const ext = (fileName || '').split('.').pop().toLowerCase();
  const mimeMap = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'webp': 'image/webp',
    'gif': 'image/gif',
    'bmp': 'image/bmp',
    'avif': 'image/avif',
    'svg': 'image/svg+xml'
  };
  return mimeMap[ext] || 'image/jpeg';
}

// =====================================================
// UTILIDAD: Extraer mediaId de un wix:image URL
// =====================================================
// Formato: wix:image://v1/MEDIA_ID/filename.jpg#originWidth=...
// Retorna MEDIA_ID (ej: "abc123~mv2.jpg")
// =====================================================
function extractMediaId(wixImageUrl) {
  if (!wixImageUrl) return null;
  const match = wixImageUrl.match(/wix:image:\/\/v1\/([^\/]+)/);
  return match ? match[1] : wixImageUrl;
}

// =====================================================
// UTILIDAD v1.1.0: obtener la variant default de un producto
// =====================================================
// Wix Stores siempre crea al menos una variant por producto
// (la "default variant") aunque manageVariants=false. Esa variant
// es la que tiene el stock real. Para productos con variantes
// múltiples (250ml/1000ml), el primer elemento NO es la default
// — Jal puede usar este editor solo para productos sin variantes
// gestionadas. Si más adelante se quiere gestionar stock por
// variante en este widget, hay que extender.
// =====================================================
async function obtenerVariantIdDefault(productId) {
  try {
    const elevatedGetVariants = elevate(getProductVariants);
    const vResult = await elevatedGetVariants(productId);
    const arr = Array.isArray(vResult) ? vResult : (vResult?.items || []);
    if (!arr.length) return null;
    // El primer item es la default variant para productos sin
    // gestión de variantes. Para productos con variantes
    // múltiples, devolvemos también el primero (Jal validará
    // caso por caso).
    return arr[0]?._id || arr[0]?.id || null;
  } catch (e) {
    console.warn(`${TAG} obtenerVariantIdDefault FAIL para ${productId}:`, e.message);
    return null;
  }
}

// =====================================================
// 1. LISTAR PRODUCTOS PARA EDICIÓN
// =====================================================
// v1.1.0: + suppressAuth (ve ocultos) + quantityInStock + trackInventory
// =====================================================
export const listarProductosParaEdicion = webMethod(
  Permissions.Anyone,
  async () => {
    try {
      console.log(`${TAG} 📦 Leyendo productos para edición...`);

      let items = [];
      let skip = 0;
      const PAGE = 100;
      let hasMore = true;

      while (hasMore) {
        // v1.1.1: la sintaxis correcta para incluir ocultos en
        // Stores/Products es `appOptions.includeHiddenProducts:true`.
        // suppressAuth se mantiene como cinturón y tirantes pero NO
        // basta por sí solo (probado en producción 24-jun).
        const result = await wixData.query("Stores/Products")
          .include("collections")
          .limit(PAGE)
          .skip(skip)
          .find({
            suppressAuth: true,
            appOptions: { includeHiddenProducts: true }
          });

        const page = result.items || [];
        items = items.concat(page);
        hasMore = page.length === PAGE;
        skip += PAGE;
      }

      let allCollections = [];
      try {
        const colResult = await wixData.query("Stores/Collections")
          .limit(100)
          .find({ suppressAuth: true });
        allCollections = (colResult.items || []).map(c => ({
          id: c._id,
          name: c.name || ''
        }));
      } catch (colErr) {
        console.warn(`${TAG} ⚠️ No se pudieron leer Stores/Collections:`, colErr.message);
      }

      // v1.2.3: VISIBILIDAD ROBUSTA por DOBLE QUERY A.
      // ---------------------------------------------------------------
      // Antes (v1.2.0–v1.2.2) se cruzaba con storesProducts.queryProducts()
      // de wix-stores.v2 para obtener `visible`. PROBLEMA confirmado en
      // logs de producción (25-jun): esa query solo devolvía 92 de 231
      // productos (paginación con cursor frágil que no completaba todas
      // las páginas), dejando 139 productos con visible:null. Un producto
      // con visible:null desaparece de AMBOS filtros del widget
      // ("Solo VISIBLES" y "Solo OCULTOS"), porque el widget compara
      // estrictamente con true/false. Resultado: filtros rotos.
      //
      // SOLUCIÓN: no depender de queryProducts v2 para la visibilidad.
      // La collection Stores/Products (wixData) no expone el campo
      // `visible` en su schema, PERO sí respeta el flag de visibilidad
      // vía appOptions.includeHiddenProducts:
      //   · Query SIN includeHiddenProducts → SOLO productos visibles.
      //   · Query CON includeHiddenProducts → TODOS (visibles + ocultos).
      // Cruzando ambos conjuntos por _id deducimos la visibilidad real
      // de los 231 productos sin paginación frágil:
      //   visible = (el producto aparece en el set "solo visibles").
      //
      // Esto es robusto, determinista y cubre el 100% del catálogo.
      // El COSTE (cost) ya NO se intenta cruzar aquí (queryProducts v2
      // tampoco lo traía: todos los samples salían cost:null en el log).
      // El coste se lee por modal con obtenerCosteProducto(productId).
      const visibleIdSet = new Set();
      try {
        let visItems = [];
        let visSkip = 0;
        let visHasMore = true;
        while (visHasMore) {
          // SIN appOptions.includeHiddenProducts → solo visibles.
          const visResult = await wixData.query("Stores/Products")
            .limit(PAGE)
            .skip(visSkip)
            .find({ suppressAuth: true });
          const visPage = visResult.items || [];
          for (const v of visPage) {
            if (v && v._id) visibleIdSet.add(v._id);
          }
          visItems = visItems.concat(visPage);
          visHasMore = visPage.length === PAGE;
          visSkip += PAGE;
        }
        console.log(`${TAG} 🔍 Visibilidad: ${visibleIdSet.size} visibles de ${items.length} totales`);
      } catch (visErr) {
        console.warn(`${TAG} ⚠️ Query de visibilidad falló (visible quedará null):`, visErr.message);
      }

      const lista = items.map(prod => {
        let prodCollections = [];
        if (Array.isArray(prod.collections)) {
          prodCollections = prod.collections.map(c => ({
            id: c._id || '',
            name: c.name || ''
          }));
        }

        let mediaItems = [];
        if (Array.isArray(prod.mediaItems)) {
          mediaItems = prod.mediaItems.map(m => ({
            src: m.src || m.url || '',
            type: m.type || 'image'
          })).filter(m => m.src);
        }

        // v1.0.5: leer additionalInfoSections
        let additionalInfoSections = [];
        if (Array.isArray(prod.additionalInfoSections)) {
          additionalInfoSections = prod.additionalInfoSections.map(s => ({
            title: s.title || '',
            description: s.description || ''
          }));
        }

        // v1.1.0: lectura nativa de inventario desde Stores/Products
        // - trackInventory: bool — indica si Wix lleva el contador
        // - quantityInStock: number — cantidad real. Solo relevante
        //   cuando trackInventory=true (docs Wix). Si false → null.
        const trackInventory = prod.trackInventory === true;
        const quantityInStock = trackInventory
          ? (typeof prod.quantityInStock === 'number' ? prod.quantityInStock : null)
          : null;

        // v1.2.3: visible deducido por DOBLE QUERY A (robusto, 231/231).
        // Si el producto está en el set de "solo visibles" → visible:true.
        // Si NO está pero sí en el listado total → visible:false (oculto).
        // visibleIdSet vacío (query de visibilidad falló) → null (el
        // widget mostrará "?" en lugar de mentir, y el filtro lo trata
        // aparte). Garantiza true/false para los 231 cuando la query OK.
        const visibleReal = visibleIdSet.size > 0
          ? visibleIdSet.has(prod._id)
          : null;
        // v1.2.3: cost ya NO se cruza en el listado (queryProducts v2 no
        // lo traía). Se lee por modal con obtenerCosteProducto. Aquí
        // siempre null; el widget pedirá el coste real al abrir el modal.
        const costReal = null;

        return {
          id: prod._id,
          name: prod.name || '',
          price: prod.price,
          formattedPrice: prod.formattedPrice || '',
          mainMedia: prod.mainMedia || '',
          sku: prod.sku || '',
          inStock: prod.inStock !== false,
          productType: prod.productType || 'physical',
          description: prod.description || '',
          ribbon: prod.ribbon || '',
          collections: prodCollections,
          productPageUrl: prod.productPageUrl || '',
          brand: prod.brand || '',
          // v1.2.0: cost y visible vienen del Product object real
          // (wix-stores.v2), no del schema parcial de la collection.
          cost: costReal,
          visible: visibleReal,
          currency: prod.currency || 'EUR',
          mediaItems: mediaItems,
          additionalInfoSections: additionalInfoSections,
          // v1.1.0: inventario real
          trackInventory,
          quantityInStock
        };
      });

      console.log(`${TAG} ✅ ${lista.length} productos cargados para edición`);

      return {
        ok: true,
        total: lista.length,
        productos: lista,
        collections: allCollections,
        version: VERSION
      };

    } catch (e) {
      console.error(`${TAG} ❌ listarProductosParaEdicion FAIL:`, e);
      return { ok: false, error: e.message };
    }
  }
);

// =====================================================
// 1b. OBTENER COSTE REAL DE UN PRODUCTO (v1.1.0)
// =====================================================
// El listado masivo (listarProductosParaEdicion) usa wixData.query
// sobre Stores/Products, pero ese collection schema NO expone
// costAndProfitData (campo ausente del schema oficial Wix).
// Para leer el coste real hay que pedir el Product completo via
// wix-stores.v2.products.getProduct(), que sí incluye el campo.
//
// Se llama una sola vez por modal abierto, NO en cada producto
// del listado (evita N llamadas).
// =====================================================
export const obtenerCosteProducto = webMethod(
  Permissions.Anyone,
  async (productId) => {
    try {
      if (!productId) {
        return { ok: false, error: 'productId es requerido' };
      }

      const elevatedGetProduct = elevate(storesProducts.getProduct);
      const result = await elevatedGetProduct(productId);

      // v1.1.1: LOGS DIAGNÓSTICO — la docs oficial dice que el
      // Product object incluye `costAndProfitData.itemCost`, pero
      // si la respuesta de wix-stores.v2.getProduct viene en otro
      // path, lo veremos aquí.
      try {
        console.log(`${TAG} 💰 getProduct response top-level keys: ${Object.keys(result || {}).join(', ')}`);
        if (result?.product) {
          console.log(`${TAG} 💰 result.product keys: ${Object.keys(result.product).join(', ')}`);
          console.log(`${TAG} 💰 result.product.costAndProfitData: ${JSON.stringify(result.product.costAndProfitData || null)}`);
        } else {
          console.log(`${TAG} 💰 result.costAndProfitData: ${JSON.stringify(result?.costAndProfitData || null)}`);
        }
      } catch (logErr) {
        console.warn(`${TAG} ⚠️ log diagnóstico falló:`, logErr.message);
      }

      // v1.2.4: LOG estructura de costRange (campo real del objeto,
      // confirmado en logs producción: el objeto trae `costRange`,
      // NO `costAndProfitData`, que siempre venía null).
      try {
        const prodForLog = result?.product || result;
        console.log(`${TAG} 💰 result.product.costRange: ${JSON.stringify(prodForLog?.costRange || null)}`);
      } catch (_) {}

      // v1.2.4: en productos con variantes (manageVariants), el coste
      // del producto padre viene null y el coste real vive en cada
      // VARIANTE (costAndProfitData.itemCost). Leemos de la variante.
      let cost = null;
      try {
        const elevatedGetVariants = elevate(getProductVariants);
        const vRes = await elevatedGetVariants(productId);
        const vArr = Array.isArray(vRes) ? vRes : (vRes?.items || []);
        if (vArr.length) {
          const v0 = vArr[0];
          console.log(`${TAG} 💰 variant[0] para coste: ${JSON.stringify(v0).substring(0, 400)}`);
          cost = v0?.variant?.costAndProfitData?.itemCost
            ?? v0?.costAndProfitData?.itemCost
            ?? null;
        }
      } catch (vErr) {
        console.warn(`${TAG} ⚠️ lectura de coste por variante falló:`, vErr.message);
      }

      // Fallback: paths del producto padre (por si algún producto
      // simple sin variantes los expusiera).
      const prod = result?.product || result;
      if (cost === null || cost === undefined) {
        cost = prod?.costRange?.minValue
          ?? prod?.costRange?.maxValue
          ?? prod?.costAndProfitData?.itemCost
          ?? null;
      }

      console.log(`${TAG} 💰 Coste leído para ${productId}: ${cost ?? '(sin definir)'}`);

      return {
        ok: true,
        productId,
        cost,
        version: VERSION
      };
    } catch (e) {
      console.error(`${TAG} ❌ obtenerCosteProducto FAIL:`, e.message);
      return { ok: false, error: e.message };
    }
  }
);

// =====================================================
// 2. ACTUALIZAR PRODUCTO
// =====================================================
// v1.0.5: + additionalInfoSections en updateInfo
// v1.1.0: SIN CAMBIOS funcionales. El campo quantityInStock NO se
//         actualiza desde aquí — usar setearStockProducto. Razón:
//         updateProductFields no toca el inventario nativamente
//         (eso vive en Stores/InventoryItems).
// =====================================================
export const actualizarProducto = webMethod(
  Permissions.Anyone,
  async (productId, campos) => {
    try {
      if (!productId) throw new Error('productId es requerido');
      if (!campos || typeof campos !== 'object') throw new Error('campos es requerido');

      console.log(`${TAG} ✏️ Actualizando producto ${productId}:`, Object.keys(campos).join(', '));

      const updateInfo = {};

      if (campos.name !== undefined && String(campos.name).trim()) {
        updateInfo.name = String(campos.name).trim();
      }
      if (campos.price !== undefined) {
        updateInfo.price = parseFloat(campos.price) || 0;
      }
      if (campos.visible !== undefined) {
        updateInfo.visible = Boolean(campos.visible);
      }
      if (campos.brand !== undefined && String(campos.brand).trim()) {
        updateInfo.brand = String(campos.brand).trim();
      }
      if (campos.sku !== undefined) {
        updateInfo.sku = String(campos.sku || '').trim();
      }
      if (campos.description !== undefined) {
        updateInfo.description = String(campos.description || '').trim();
      }
      if (campos.ribbon !== undefined) {
        updateInfo.ribbon = String(campos.ribbon || '').trim();
      }
      // v1.2.4: el COSTE ya NO se escribe aquí. updateProductFields
      // de V1 NO acepta el coste en su UpdateProductInfo (doc oficial:
      // los campos escribibles son name, description, media, sku,
      // currency, price, discountedPrice, ribbon — coste ausente).
      // En productos con variantes, el coste vive en la VARIANTE
      // (campo costAndProfitData.itemCost) y se escribe con
      // updateVariantData(). Lo hace setearCosteProducto (función
      // dedicada nueva), llamada por separado desde el page code.
      // Aquí se ignora campos.cost para no romper el resto del update.

      // v1.0.5: additionalInfoSections
      if (Array.isArray(campos.additionalInfoSections)) {
        updateInfo.additionalInfoSections = campos.additionalInfoSections
          .filter(s => s && typeof s === 'object')
          .map(s => ({
            title: String(s.title || '').trim(),
            description: String(s.description || '').trim()
          }));
        console.log(`${TAG} 📋 additionalInfoSections: ${updateInfo.additionalInfoSections.length} sección(es)`);
      }

      if (Object.keys(updateInfo).length === 0) {
        console.log(`${TAG} ℹ️ Sin campos que actualizar`);
        return { ok: true, productId, noChanges: true };
      }

      const elevatedUpdate = elevate(wixStoresBackend.updateProductFields);
      await elevatedUpdate(productId, updateInfo);

      console.log(`${TAG} ✅ Producto actualizado: ${productId} — campos: ${Object.keys(updateInfo).join(', ')}`);

      return {
        ok: true,
        productId,
        updatedFields: Object.keys(updateInfo),
        version: VERSION
      };

    } catch (e) {
      console.error(`${TAG} ❌ actualizarProducto FAIL:`, e.message);
      return { ok: false, error: e.message };
    }
  }
);

// =====================================================
// 2b. DESCONTAR 1 UNIDAD DE STOCK (v1.1.0)
// =====================================================
// Llamada por el botón 🗑️ DESCONTAR del widget. Resta 1 unidad
// del producto. Si el stock ya estaba en 0 (o trackInventory=false),
// Wix devolverá error.
//
// v1.2.0: FIX error "InventoryId and ProductId can't be both empty".
//   decrementInventory requiere productId (o inventoryId) en el
//   payload, no solo variantId. Pasamos productId + variantId.
// =====================================================
export const descontarUnidadProducto = webMethod(
  Permissions.Anyone,
  async (productId) => {
    try {
      if (!productId) throw new Error('productId es requerido');

      console.log(`${TAG} 🗑️ Descontar 1 unidad del producto: ${productId}`);

      const variantId = await obtenerVariantIdDefault(productId);
      // v1.2.0: variantId opcional. La API requiere productId
      // (o inventoryId). Si conseguimos el variantId lo añadimos
      // para apuntar a la default variant; si no, productId solo.
      const payload = { productId, decrementBy: 1 };
      if (variantId) payload.variantId = variantId;

      console.log(`${TAG} 🗑️ Payload decrementInventory: ${JSON.stringify(payload)}`);

      const elevatedDecrement = elevate(decrementInventory);
      await elevatedDecrement([payload]);

      console.log(`${TAG} ✅ 1 unidad descontada de ${productId}`);

      return {
        ok: true,
        productId,
        variantId: variantId || null,
        decrementBy: 1,
        version: VERSION
      };
    } catch (e) {
      console.error(`${TAG} ❌ descontarUnidadProducto FAIL:`, e.message);
      return { ok: false, error: e.message };
    }
  }
);

// =====================================================
// 2c. SETEAR STOCK CONCRETO (v1.1.0)
// =====================================================
// Para alta de lote / corrección manual. El widget envía la
// cantidad nueva total (no el delta). Esta función calcula el
// delta vs el stock actual y aplica increment o decrement según
// el signo.
//
// Nota: Wix no expone un endpoint "set quantity to X" para Velo
// backend (lo tiene la REST API V2 pero requiere auth de app).
// Por eso usamos increment/decrement con el delta calculado.
//
// v1.2.2: SIN CAMBIOS funcionales. Esta función se mantiene para
//   AJUSTAR el stock de productos que YA tienen tracking activo.
//   La activación inicial de tracking + cantidad la hace ahora
//   activarSeguimientoStock en una sola llamada (ver más abajo).
// =====================================================
export const setearStockProducto = webMethod(
  Permissions.Anyone,
  async (productId, nuevaCantidad) => {
    try {
      if (!productId) throw new Error('productId es requerido');
      const objetivo = parseInt(nuevaCantidad, 10);
      if (isNaN(objetivo) || objetivo < 0) {
        throw new Error('nuevaCantidad debe ser un entero >= 0');
      }

      console.log(`${TAG} 📦 Setear stock de ${productId} → ${objetivo}`);

      // Leer variant default + stock actual
      const elevatedGetVariants = elevate(getProductVariants);
      const vResult = await elevatedGetVariants(productId);
      const arr = Array.isArray(vResult) ? vResult : (vResult?.items || []);
      if (!arr.length) {
        return { ok: false, error: 'No se encontraron variantes para el producto' };
      }

      const first = arr[0];
      const variantId = first?._id || first?.id;
      if (!variantId) {
        return { ok: false, error: 'variantId default no encontrado' };
      }

      // Stock actual: en getProductVariants la cantidad vive en
      // variant.inventoryStatus.quantity (Wix V1). Si trackInventory
      // está apagado, la cantidad puede venir como null o 0.
      const stockActual = Number(
        first?.variant?.inventoryStatus?.quantity
        ?? first?.variant?.quantity
        ?? 0
      ) || 0;

      const delta = objetivo - stockActual;
      console.log(`${TAG} 📦 stockActual=${stockActual} objetivo=${objetivo} delta=${delta}`);

      if (delta === 0) {
        return { ok: true, productId, variantId, stockActual, nuevaCantidad: objetivo, noChange: true, version: VERSION };
      }

      if (delta > 0) {
        const elevatedIncrement = elevate(incrementInventory);
        const payloadInc = { productId, incrementBy: delta };
        if (variantId) payloadInc.variantId = variantId;
        console.log(`${TAG} 📦 Payload incrementInventory: ${JSON.stringify(payloadInc)}`);
        await elevatedIncrement([payloadInc]);
      } else {
        const elevatedDecrement = elevate(decrementInventory);
        const payloadDec = { productId, decrementBy: -delta };
        if (variantId) payloadDec.variantId = variantId;
        console.log(`${TAG} 📦 Payload decrementInventory: ${JSON.stringify(payloadDec)}`);
        await elevatedDecrement([payloadDec]);
      }

      console.log(`${TAG} ✅ Stock actualizado: ${productId} → ${objetivo}`);

      return {
        ok: true,
        productId,
        variantId,
        stockAnterior: stockActual,
        nuevaCantidad: objetivo,
        delta,
        version: VERSION
      };
    } catch (e) {
      console.error(`${TAG} ❌ setearStockProducto FAIL:`, e.message);
      return { ok: false, error: e.message };
    }
  }
);

// =====================================================
// 2d. ACTIVAR / DESACTIVAR SEGUIMIENTO DE STOCK (v1.2.2)
// =====================================================
// Activa o desactiva el `trackQuantity` del producto sin salir del
// editor de KAMISUITE. Usa updateInventoryVariantFieldsByProductId,
// la API documentada de wix-stores-backend para tocar el inventario
// por productId.
//
// FIRMA REAL DEL OBJETO (confirmada en el editor de Velo):
//   updateInventoryVariantFieldsByProductId(productId, {
//     trackQuantity: boolean,
//     variants: [{ variantId, quantity, inStock }]
//   })
//   · quantity (number)  → cantidad real de la variante.
//   · inStock (boolean)  → disponibilidad simple. Solo se usa
//                          cuando trackQuantity=false. Cuando
//                          trackQuantity=true, inStock se deriva
//                          de quantity (tooltip oficial Velo).
//
// REGLA WIX (vista en log producción 24-jun):
//   trackQuantity=true EXIGE quantity > 0. Si no se manda, Wix
//   rechaza: "quantity must be provided and greater than 0 when
//   inventory being tracked".
//
// COMPORTAMIENTO v1.2.2:
//   · activar=true  + cantidad>0  → trackQuantity:true,
//        variants:[{variantId, quantity:<cantidad>}]
//   · activar=true  + sin cantidad/0 → quantity:1 por defecto
//        (mínimo técnico: Wix no acepta 0 con tracking activo).
//   · activar=false → trackQuantity:false,
//        variants:[{variantId, inStock:true}]
//
// Esto activa tracking Y fija el stock en UNA sola llamada,
// eliminando el encadenamiento frágil "activar → setear stock"
// que rompía en producción (efecto dominó del BUG 4).
// =====================================================
export const activarSeguimientoStock = webMethod(
  Permissions.Anyone,
  async (productId, activar, cantidad) => {
    try {
      if (!productId) throw new Error('productId es requerido');
      const track = !!activar;

      console.log(`${TAG} 🎚️ Cambiar seguimiento de stock de ${productId} → ${track} (cantidad recibida: ${cantidad})`);

      // Obtener variant default para componer el payload de la API.
      // updateInventoryVariantFieldsByProductId requiere identificar
      // al menos una variante.
      const variantId = await obtenerVariantIdDefault(productId);

      const inventoryInfo = { trackQuantity: track };

      if (track) {
        // Tracking ON → Wix EXIGE quantity > 0.
        // Si el usuario no indicó cantidad (o indicó 0), aplicamos
        // el mínimo técnico de 1 unidad para que Wix acepte activar
        // el contador. El usuario podrá ajustar después.
        let qty = parseInt(cantidad, 10);
        if (isNaN(qty) || qty < 1) {
          qty = 1;
          console.log(`${TAG} 🎚️ Sin cantidad válida → quantity:1 por defecto (mínimo técnico Wix)`);
        }
        const variantEntry = { quantity: qty };
        if (variantId) variantEntry.variantId = variantId;
        inventoryInfo.variants = [variantEntry];
      } else {
        // Tracking OFF → modo disponibilidad simple (inStock).
        const variantEntry = { inStock: true };
        if (variantId) variantEntry.variantId = variantId;
        inventoryInfo.variants = [variantEntry];
      }

      console.log(`${TAG} 🎚️ Payload updateInventoryVariantFieldsByProductId:`, JSON.stringify(inventoryInfo));

      const elevatedUpdate = elevate(updateInventoryVariantFieldsByProductId);
      await elevatedUpdate(productId, inventoryInfo);

      console.log(`${TAG} ✅ Seguimiento de stock para ${productId} ahora: ${track}`);

      return {
        ok: true,
        productId,
        trackInventory: track,
        quantityAplicada: track ? (inventoryInfo.variants[0].quantity ?? null) : null,
        version: VERSION
      };
    } catch (e) {
      console.error(`${TAG} ❌ activarSeguimientoStock FAIL:`, e.message);
      return { ok: false, error: e.message };
    }
  }
);

// =====================================================
// 2e. SETEAR COSTE DEL PRODUCTO (v1.2.4)
// =====================================================
// El coste (costAndProfitData.itemCost) NO se puede escribir con
// updateProductFields (no está en su UpdateProductInfo). En V1, con
// productos que tienen variantes (manageVariants), el coste vive en
// CADA variante. Se escribe con updateVariantData(productId, choices,
// variantInfo), donde variantInfo lleva costAndProfitData.itemCost.
//
// Estrategia: leer las variantes con getProductVariants (devuelve
// cada variante con sus `choices`), y por cada una escribir el coste
// con updateVariantData usando esas mismas choices.
//
// Confirmado: campo costAndProfitData.itemCost (Wix V1, por variante).
// =====================================================
export const setearCosteProducto = webMethod(
  Permissions.Anyone,
  async (productId, coste) => {
    try {
      if (!productId) throw new Error('productId es requerido');
      const valor = parseFloat(coste);
      if (isNaN(valor) || valor < 0) {
        throw new Error('coste debe ser un número >= 0');
      }

      console.log(`${TAG} 💰 Setear coste de ${productId} → ${valor}`);

      // Leer todas las variantes (cada una con sus choices)
      const elevatedGetVariants = elevate(getProductVariants);
      const vResult = await elevatedGetVariants(productId);
      const arr = Array.isArray(vResult) ? vResult : (vResult?.items || []);
      if (!arr.length) {
        return { ok: false, error: 'No se encontraron variantes para el producto' };
      }

      console.log(`${TAG} 💰 ${arr.length} variante(s) a actualizar con coste ${valor}`);
      console.log(`${TAG} 💰 sample variant estructura: ${JSON.stringify(arr[0]).substring(0, 400)}`);

      const elevatedUpdateVariant = elevate(wixStoresBackend.updateVariantData);
      let updated = 0;
      const errores = [];

      // v1.2.6: la firma real es updateVariantData(productId,
      // variantInfo: VariantInfo[]) — el 2º argumento ES el array
      // directamente, NO un objeto {variants:[...]} (eso daba
      // "Expected an array for field variants"). Cada entrada lleva
      // las choices de la variante + costAndProfitData.itemCost.
      const variantsPayload = arr.map(v => ({
        choices: v?.choices || {},
        costAndProfitData: { itemCost: valor }
      }));

      console.log(`${TAG} 💰 Payload updateVariantData (array): ${JSON.stringify(variantsPayload)}`);

      try {
        await elevatedUpdateVariant(productId, variantsPayload);
        updated = variantsPayload.length;
      } catch (vErr) {
        console.warn(`${TAG} ⚠️ updateVariantData falló:`, vErr.message);
        errores.push(vErr.message);
      }

      if (updated === 0) {
        return { ok: false, error: 'No se pudo actualizar el coste en ninguna variante: ' + (errores[0] || 'desconocido') };
      }

      console.log(`${TAG} ✅ Coste ${valor} aplicado a ${updated}/${arr.length} variante(s) de ${productId}`);

      return {
        ok: true,
        productId,
        coste: valor,
        variantesActualizadas: updated,
        version: VERSION
      };
    } catch (e) {
      console.error(`${TAG} ❌ setearCosteProducto FAIL:`, e.message);
      return { ok: false, error: e.message };
    }
  }
);

// =====================================================
// 3. SUBIR Y ASIGNAR IMAGEN (reemplaza todas)
// =====================================================
export const subirYAsignarImagenProducto = webMethod(
  Permissions.Anyone,
  async (productId, base64Data, fileName) => {
    try {
      if (!productId) throw new Error('productId es requerido');
      if (!base64Data) throw new Error('base64Data es requerido');

      console.log(`${TAG} 📷 Subiendo imagen (reemplazo) para producto ${productId}`);

      const mimeType = detectMimeType(base64Data, fileName);
      console.log(`${TAG} 📷 MIME detectado: ${mimeType}`);

      let cleanBase64 = base64Data;
      if (cleanBase64.includes(',')) {
        cleanBase64 = cleanBase64.split(',')[1];
      }

      const buffer = Buffer.from(cleanBase64, 'base64');
      const safeName = (fileName || `producto_${Date.now()}.jpg`).replace(/[^a-zA-Z0-9._-]/g, '_');

      const elevatedUpload = elevate(mediaManager.upload);
      const uploadResult = await elevatedUpload(
        '/kamisuite/productos',
        buffer,
        safeName,
        {
          mediaOptions: { mimeType: mimeType, mediaType: 'image' },
          metadataOptions: { isPrivate: false, isVisitorUpload: false }
        }
      );

      const fileUrl = uploadResult?.fileUrl;
      if (!fileUrl) throw new Error('Upload devolvió sin fileUrl');

      console.log(`${TAG} ✅ Imagen subida: ${fileUrl.substring(0, 60)}...`);

      try {
        const elevatedRemove = elevate(wixStoresBackend.removeProductMedia);
        await elevatedRemove(productId);
      } catch (removeErr) {
        console.warn(`${TAG} ⚠️ removeProductMedia falló:`, removeErr.message);
      }

      const elevatedAdd = elevate(wixStoresBackend.addProductMedia);
      await elevatedAdd(productId, [{ src: fileUrl }]);

      console.log(`${TAG} ✅ Imagen asignada al producto ${productId}`);

      return { ok: true, productId, fileUrl, version: VERSION };

    } catch (e) {
      console.error(`${TAG} ❌ subirYAsignarImagenProducto FAIL:`, e.message);
      return { ok: false, error: e.message };
    }
  }
);

// =====================================================
// 3b. AGREGAR IMÁGENES (multi-imagen)
// =====================================================
export const agregarImagenesProducto = webMethod(
  Permissions.Anyone,
  async (productId, images) => {
    try {
      if (!productId) throw new Error('productId es requerido');
      if (!Array.isArray(images) || images.length === 0) {
        throw new Error('images[] es requerido (al menos una imagen)');
      }

      console.log(`${TAG} 📷 Subiendo ${images.length} imagen(es) para producto ${productId}`);

      const uploadedSrcs = [];

      for (let i = 0; i < images.length; i++) {
        const img = images[i];
        if (!img.base64) continue;

        const mimeType = detectMimeType(img.base64, img.fileName);
        console.log(`${TAG} 📷 Imagen ${i + 1}: ${img.fileName || 'sin nombre'} → ${mimeType}`);

        let cleanBase64 = img.base64;
        if (cleanBase64.includes(',')) {
          cleanBase64 = cleanBase64.split(',')[1];
        }

        const buffer = Buffer.from(cleanBase64, 'base64');
        const safeName = (img.fileName || `producto_${Date.now()}_${i}.jpg`).replace(/[^a-zA-Z0-9._-]/g, '_');

        const elevatedUpload = elevate(mediaManager.upload);
        const uploadResult = await elevatedUpload(
          '/kamisuite/productos',
          buffer,
          safeName,
          {
            mediaOptions: { mimeType: mimeType, mediaType: 'image' },
            metadataOptions: { isPrivate: false, isVisitorUpload: false }
          }
        );

        if (uploadResult?.fileUrl) {
          uploadedSrcs.push({ src: uploadResult.fileUrl });
          console.log(`${TAG} ✅ Imagen ${i + 1}/${images.length} subida`);
        } else {
          console.warn(`${TAG} ⚠️ Imagen ${i + 1} sin fileUrl`);
        }
      }

      if (uploadedSrcs.length === 0) {
        throw new Error('Ninguna imagen se pudo subir');
      }

      const elevatedAdd = elevate(wixStoresBackend.addProductMedia);
      await elevatedAdd(productId, uploadedSrcs);

      console.log(`${TAG} ✅ ${uploadedSrcs.length} imagen(es) asignadas al producto ${productId}`);

      return {
        ok: true,
        productId,
        count: uploadedSrcs.length,
        version: VERSION
      };

    } catch (e) {
      console.error(`${TAG} ❌ agregarImagenesProducto FAIL:`, e.message);
      return { ok: false, error: e.message };
    }
  }
);

// =====================================================
// 3c. ELIMINAR IMÁGENES ESPECÍFICAS
// =====================================================
// v1.0.4: Usa storesProducts.removeProductMedia de
//   wix-stores.v2 con mediaIds como strings.
//   wix-stores-backend.removeProductMedia no aceptaba
//   [{src}] para borrado selectivo (error vacío).
//   El mediaId se extrae del wix:image URL con
//   extractMediaId().
// =====================================================
export const eliminarImagenesProducto = webMethod(
  Permissions.Anyone,
  async (productId, srcs) => {
    try {
      if (!productId) throw new Error('productId es requerido');
      if (!Array.isArray(srcs) || srcs.length === 0) {
        throw new Error('srcs[] es requerido');
      }

      console.log(`${TAG} 🗑️ Eliminando ${srcs.length} imagen(es) del producto ${productId}`);

      // v1.0.4: extraer mediaIds del wix:image URL
      const mediaIds = srcs
        .filter(Boolean)
        .map(src => extractMediaId(src))
        .filter(Boolean);

      console.log(`${TAG} 🗑️ mediaIds: ${mediaIds.join(', ')}`);

      // v1.0.4: usar wix-stores.v2 en vez de wix-stores-backend
      const elevatedRemove = elevate(storesProducts.removeProductMedia);
      await elevatedRemove(productId, mediaIds);

      console.log(`${TAG} ✅ ${mediaIds.length} imagen(es) eliminadas del producto ${productId}`);

      return {
        ok: true,
        productId,
        removed: mediaIds.length,
        version: VERSION
      };

    } catch (e) {
      console.error(`${TAG} ❌ eliminarImagenesProducto FAIL:`, e.message);
      return { ok: false, error: e.message };
    }
  }
);

// =====================================================
// 4. CREAR PRODUCTO NUEVO
// =====================================================
export const crearProductoNuevo = webMethod(
  Permissions.Anyone,
  async (info) => {
    try {
      if (!info?.name || !String(info.name).trim()) throw new Error('name es requerido');

      console.log(`${TAG} ➕ Creando producto: ${info.name}`);

      const productInfo = {
        name: String(info.name).trim(),
        productType: info.productType || 'physical',
        price: parseFloat(info.price) || 0,
        visible: info.visible !== false
      };

      const brand = String(info.brand || '').trim();
      if (brand) productInfo.brand = brand;

      const sku = String(info.sku || '').trim();
      if (sku) productInfo.sku = sku;

      const ribbon = String(info.ribbon || '').trim();
      if (ribbon) productInfo.ribbon = ribbon;

      const description = String(info.description || '').trim();
      if (description) productInfo.description = description;

      if (info.cost !== undefined && info.cost !== null && info.cost !== '') {
        productInfo.costAndProfitData = {
          itemCost: parseFloat(info.cost) || 0
        };
      }

      console.log(`${TAG} ➕ productInfo keys: ${Object.keys(productInfo).join(', ')}`);

      const elevatedCreate = elevate(wixStoresBackend.createProduct);
      const result = await elevatedCreate(productInfo);

      const newId = result?._id || result?.id || null;
      console.log(`${TAG} ✅ Producto creado: ${newId} — ${info.name}`);

      return { ok: true, productId: newId, product: result, version: VERSION };

    } catch (e) {
      console.error(`${TAG} ❌ crearProductoNuevo FAIL:`, e.message);
      return { ok: false, error: e.message };
    }
  }
);

// =====================================================
// 5. ELIMINAR PRODUCTO
// =====================================================
export const eliminarProducto = webMethod(
  Permissions.Anyone,
  async (productId) => {
    try {
      if (!productId) throw new Error('productId es requerido');

      console.log(`${TAG} 🗑️ Eliminando producto: ${productId}`);

      const elevatedDelete = elevate(wixStoresBackend.deleteProduct);
      await elevatedDelete(productId);

      console.log(`${TAG} ✅ Producto eliminado: ${productId}`);

      return { ok: true, productId, version: VERSION };

    } catch (e) {
      console.error(`${TAG} ❌ eliminarProducto FAIL:`, e.message);
      return { ok: false, error: e.message };
    }
  }
);

// =====================================================
// 6. CREAR CATEGORÍA
// =====================================================
export const crearCategoriaNueva = webMethod(
  Permissions.Anyone,
  async (nombre) => {
    try {
      if (!nombre || !String(nombre).trim()) throw new Error('nombre es requerido');

      const nombreLimpio = String(nombre).trim();
      console.log(`${TAG} 📂 Creando categoría: ${nombreLimpio}`);

      const existente = await wixData.query("Stores/Collections")
        .eq('name', nombreLimpio)
        .limit(1)
        .find({ suppressAuth: true });

      if ((existente.items || []).length > 0) {
        const col = existente.items[0];
        console.log(`${TAG} ℹ️ Categoría ya existe: ${col._id} — ${col.name}`);
        return { ok: true, yaExistia: true, collectionId: col._id, name: col.name };
      }

      const elevatedCreateCollection = elevate(storesProducts.createCollection);
      const result = await elevatedCreateCollection({ name: nombreLimpio });

      const newCol = result?.collection || result;
      const colId = newCol?._id || newCol?.id || null;

      console.log(`${TAG} ✅ Categoría creada: ${colId} — ${nombreLimpio}`);

      return { ok: true, collectionId: colId, name: nombreLimpio, version: VERSION };

    } catch (e) {
      console.error(`${TAG} ❌ crearCategoriaNueva FAIL:`, e.message);
      return { ok: false, error: e.message };
    }
  }
);

// =====================================================
// 7. CAMBIAR CATEGORÍAS
// =====================================================
export const cambiarCategoriasProducto = webMethod(
  Permissions.Anyone,
  async (productId, addIds, removeIds) => {
    try {
      if (!productId) throw new Error('productId es requerido');

      const adds = Array.isArray(addIds) ? addIds.filter(Boolean) : [];
      const removes = Array.isArray(removeIds) ? removeIds.filter(Boolean) : [];

      console.log(`${TAG} 🏷️ Categorías producto ${productId}: +${adds.length} -${removes.length}`);

      const errores = [];

      for (const colId of adds) {
        try {
          const elevatedAdd = elevate(wixStoresBackend.addProductsToCollection);
          await elevatedAdd(colId, [productId]);
          console.log(`${TAG} ✅ Añadido a colección ${colId}`);
        } catch (addErr) {
          console.warn(`${TAG} ⚠️ Error añadiendo a ${colId}:`, addErr.message);
          errores.push(`add:${colId}:${addErr.message}`);
        }
      }

      for (const colId of removes) {
        try {
          const elevatedRemove = elevate(wixStoresBackend.removeProductsFromCollection);
          await elevatedRemove(colId, [productId]);
          console.log(`${TAG} ✅ Quitado de colección ${colId}`);
        } catch (remErr) {
          console.warn(`${TAG} ⚠️ Error quitando de ${colId}:`, remErr.message);
          errores.push(`remove:${colId}:${remErr.message}`);
        }
      }

      return {
        ok: errores.length === 0,
        productId,
        added: adds.length,
        removed: removes.length,
        errores: errores.length > 0 ? errores : undefined,
        version: VERSION
      };

    } catch (e) {
      console.error(`${TAG} ❌ cambiarCategoriasProducto FAIL:`, e.message);
      return { ok: false, error: e.message };
    }
  }
);