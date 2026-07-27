// =====================================================
// KAMISUITE — ALMACÉN (consumo interno de salón)
// Backend: almacenLogic.web.js
// Versión: 1.0.0
// =====================================================
//
// QUÉ ES
// ------
// Módulo de control de almacén para los productos que el salón
// CONSUME durante los servicios (mascarillas, champús, toallitas,
// tintes...). NO es venta. Cuando un producto se acaba, el staff
// abre el widget y pulsa DESCONTAR (el "cubito").
//
// FUENTE DE PRODUCTOS — UNA SOLA BASE
// -----------------------------------
// Los productos viven en Wix Stores (misma base que la tienda; no
// se duplican). El Almacén SOLO lee los productos cuyas categorías
// (collections) empiezan por el prefijo PREFIJO_ALMACEN (p.ej.
// "USO SALON-MASCARILLAS", "USO SALON-CHAMPUS"...). Un producto que
// además se vende puede estar en "USO SALON-MASCARILLAS" Y en la
// categoría pública "Mascarillas" a la vez: aparece en ambos sitios
// sin estar duplicado.
//
// DATO PROPIO — COLECCIÓN KamisuiteWarehouse
// ------------------------------------------
// Wix Stores no permite escribir el coste de un producto simple
// (confirmado en producción: updateProductFields no lo acepta y
// updateVariantData exige variantes gestionadas). Por eso el coste
// y demás datos de almacén viven en NUESTRA colección CMS,
// vinculada al producto de Stores por su id.
//
// Colección: KamisuiteWarehouse
//   productId    Text     id del producto en Wix Stores (clave de cruce)
//   productName  Text     nombre (cacheado para el histórico)
//   productImage Text     url imagen (cacheada)
//   type         Text     "producto" (ficha) | "consumo" (movimiento)
//   unitCost     Number   coste unitario (lo que Stores no guarda)
//   minStock     Number   stock mínimo para avisar reposición
//   quantity     Number   en consumo: unidades descontadas
//   date         Date     fecha del movimiento de consumo
//   staffId      Text     quién descontó
//   active       Boolean  ficha activa en almacén
//
//   type="producto" → 1 fila por producto: unitCost, minStock, active
//   type="consumo"  → 1 fila por DESCONTAR: quantity, date, staffId
//
// El stock real (unidades) sigue en Wix Stores (su inventario), que
// SÍ sabemos leer y descontar. El histórico de consumo y el coste
// los lleva KamisuiteWarehouse.
//
// REGLA MULTI-TENANT: el prefijo de categoría es configurable; no se
// hardcodea ningún id de salón.
//
// CHANGELOG
// v1.0.0 (25 Jun 2026): primera versión. Listado filtrado por
//         prefijo de categoría, cruce con KamisuiteWarehouse para
//         coste/minStock, descuento de consumo (cubito) con registro
//         en histórico, y guardado de ficha (coste/minStock).
// =====================================================

import { webMethod, Permissions } from 'wix-web-module';
import { elevate } from 'wix-auth';
import wixData from 'wix-data';
import { getProductVariants, decrementInventory, updateInventoryVariantFieldsByProductId } from 'wix-stores-backend';

const VERSION = '1.1.0';
const TAG = '[Almacen]';

// Colección propia
const COL_WAREHOUSE = 'KamisuiteWarehouse';

// Prefijo de categoría que marca un producto como "de almacén".
// Multi-tenant: si en el futuro se quiere por salón, se mueve a
// SalonConfig. De momento, constante de módulo (no es id de salón).
const PREFIJO_ALMACEN = 'USO SALON-';

// Helper interno de stock (reutilizado por el webMethod y por la ficha).
async function setearStockAlmacenInterno(productId, unidades) {
  let qty = parseInt(unidades, 10);
  if (isNaN(qty) || qty < 0) throw new Error('unidades debe ser un entero >= 0');

  const elevatedGetVariants = elevate(getProductVariants);
  const vResult = await elevatedGetVariants(productId);
  const arr = Array.isArray(vResult) ? vResult : (vResult?.items || []);
  const variantId = arr[0]?._id || arr[0]?.id || null;

  const trackQty = qty >= 1 ? qty : 1;
  const inventoryInfo = {
    trackQuantity: true,
    variants: [variantId ? { variantId, quantity: trackQty } : { quantity: trackQty }]
  };
  console.log(`${TAG} 📦 Payload updateInventory: ${JSON.stringify(inventoryInfo)}`);

  const elevatedUpdate = elevate(updateInventoryVariantFieldsByProductId);
  await elevatedUpdate(productId, inventoryInfo);
  console.log(`${TAG} ✅ Stock fijado: ${productId} → ${trackQty}`);
  return { ok: true, productId, unidades: trackQty };
}

// =====================================================
// 5. SETEAR STOCK (unidades reales) — editable desde la ficha
// =====================================================
// Activa el contador si hace falta y fija las unidades en UNA sola
// llamada. Mismo patrón ya probado en el editor de productos
// (updateInventoryVariantFieldsByProductId).
export const setearStockAlmacen = webMethod(
  Permissions.Anyone,
  async (productId, unidades) => {
    try {
      if (!productId) throw new Error('productId es requerido');
      const r = await setearStockAlmacenInterno(productId, unidades);
      return { ...r, version: VERSION };
    } catch (e) {
      console.error(`${TAG} ❌ setearStockAlmacen FAIL:`, e.message);
      return { ok: false, error: e.message };
    }
  }
);

// =====================================================
// 1. LISTAR PRODUCTOS DE ALMACÉN
// =====================================================
// Lee de Wix Stores SOLO los productos cuya categoría empieza por
// PREFIJO_ALMACEN. Cruza cada uno con su ficha en KamisuiteWarehouse
// (type="producto") para añadir unitCost y minStock. Devuelve también
// la lista de categorías de almacén para el filtro del widget.
export const listarProductosAlmacen = webMethod(
  Permissions.Anyone,
  async () => {
    try {
      console.log(`${TAG} 📦 Leyendo productos de almacén...`);

      // 1) Leer TODOS los productos de Stores (con sus categorías).
      let items = [];
      let skip = 0;
      const PAGE = 100;
      let hasMore = true;
      while (hasMore) {
        const result = await wixData.query('Stores/Products')
          .include('collections')
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
      console.log(`${TAG} 📦 ${items.length} productos totales en Stores`);

      // 2) Quedarnos solo con los que tengan ALGUNA categoría con el
      //    prefijo de almacén. Recogemos también esas categorías para
      //    el filtro del widget (sin el prefijo, para mostrar limpio).
      const categoriasAlmacen = new Map(); // id -> nombre limpio
      const productosAlmacen = [];

      for (const prod of items) {
        const cols = Array.isArray(prod.collections) ? prod.collections : [];
        const colsAlmacen = cols.filter(c =>
          typeof c?.name === 'string' &&
          c.name.toUpperCase().startsWith(PREFIJO_ALMACEN.toUpperCase())
        );
        if (colsAlmacen.length === 0) continue;

        for (const c of colsAlmacen) {
          const nombreLimpio = c.name.substring(PREFIJO_ALMACEN.length).trim();
          categoriasAlmacen.set(c._id, nombreLimpio || c.name);
        }

        // Inventario real (lo lleva Stores)
        const trackInventory = prod.trackInventory === true;
        const quantityInStock = trackInventory
          ? (typeof prod.quantityInStock === 'number' ? prod.quantityInStock : null)
          : null;

        productosAlmacen.push({
          id: prod._id,
          name: prod.name || '',
          description: (prod.description || '').replace(/<[^>]*>/g, '').trim(),
          mainMedia: prod.mainMedia || '',
          sku: prod.sku || '',
          brand: prod.brand || '',
          trackInventory,
          quantityInStock,
          // categorías de almacén de este producto (id + nombre limpio)
          categorias: colsAlmacen.map(c => ({
            id: c._id,
            name: (c.name.substring(PREFIJO_ALMACEN.length).trim()) || c.name
          })),
          // se rellenan abajo con el cruce a KamisuiteWarehouse
          unitCost: null,
          minStock: null,
          active: true
        });
      }
      console.log(`${TAG} 📦 ${productosAlmacen.length} productos de almacén (categoría ${PREFIJO_ALMACEN}*)`);

      // 3) Cruzar con KamisuiteWarehouse (fichas type="producto").
      try {
        let fichas = [];
        let fSkip = 0;
        let fMore = true;
        while (fMore) {
          const fRes = await wixData.query(COL_WAREHOUSE)
            .eq('type', 'producto')
            .limit(PAGE)
            .skip(fSkip)
            .find({ suppressAuth: true });
          const fPage = fRes.items || [];
          fichas = fichas.concat(fPage);
          fMore = fPage.length === PAGE;
          fSkip += PAGE;
        }
        const fichaById = {};
        for (const f of fichas) {
          if (f.productId) fichaById[f.productId] = f;
        }
        for (const p of productosAlmacen) {
          const f = fichaById[p.id];
          if (f) {
            p.unitCost = (typeof f.unitCost === 'number') ? f.unitCost : null;
            p.minStock = (typeof f.minStock === 'number') ? f.minStock : null;
            p.active = (f.active !== false);
          }
        }
        console.log(`${TAG} 📦 ${fichas.length} fichas cruzadas desde ${COL_WAREHOUSE}`);
      } catch (fErr) {
        console.warn(`${TAG} ⚠️ No se pudieron cruzar fichas de almacén:`, fErr.message);
      }

      // 4) Lista de categorías de almacén para el filtro del widget.
      const categorias = Array.from(categoriasAlmacen.entries())
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name));

      console.log(`${TAG} ✅ ${productosAlmacen.length} productos, ${categorias.length} categorías`);

      return {
        ok: true,
        total: productosAlmacen.length,
        productos: productosAlmacen,
        categorias,
        version: VERSION
      };
    } catch (e) {
      console.error(`${TAG} ❌ listarProductosAlmacen FAIL:`, e);
      return { ok: false, error: e.message };
    }
  }
);

// =====================================================
// 2. GUARDAR FICHA DE ALMACÉN (coste + stock mínimo)
// =====================================================
// READ-MERGE-UPDATE sobre KamisuiteWarehouse (type="producto").
// Si no existe ficha para el producto, la crea (insert). Si existe,
// la actualiza conservando el resto de campos.
export const guardarFichaAlmacen = webMethod(
  Permissions.Anyone,
  async (datos) => {
    try {
      const { productId, productName, productImage, unitCost, minStock, stock, active } = datos || {};
      if (!productId) throw new Error('productId es requerido');

      console.log(`${TAG} 💾 Guardar ficha de ${productId} (coste=${unitCost}, minStock=${minStock}, stock=${stock})`);

      // Si viene stock (unidades reales), fijarlo en Wix Stores.
      let stockResult = null;
      if (stock !== undefined && stock !== null && stock !== '') {
        stockResult = await setearStockAlmacenInterno(productId, stock);
      }

      // Buscar ficha existente
      const existeRes = await wixData.query(COL_WAREHOUSE)
        .eq('type', 'producto')
        .eq('productId', productId)
        .limit(1)
        .find({ suppressAuth: true });

      const yaExiste = (existeRes.items || [])[0] || null;

      const costeNum = (unitCost !== undefined && unitCost !== null && unitCost !== '')
        ? parseFloat(unitCost) : null;
      const minNum = (minStock !== undefined && minStock !== null && minStock !== '')
        ? parseInt(minStock, 10) : null;

      if (yaExiste) {
        // READ-MERGE-UPDATE: no perder otros campos
        const merged = {
          ...yaExiste,
          productName: productName ?? yaExiste.productName ?? '',
          productImage: productImage ?? yaExiste.productImage ?? '',
          unitCost: (costeNum !== null) ? costeNum : (yaExiste.unitCost ?? null),
          minStock: (minNum !== null) ? minNum : (yaExiste.minStock ?? null),
          active: (active !== undefined) ? !!active : (yaExiste.active !== false)
        };
        const saved = await wixData.update(COL_WAREHOUSE, merged, { suppressAuth: true });
        console.log(`${TAG} ✅ Ficha actualizada: ${productId}`);
        return { ok: true, action: 'updated', ficha: saved, version: VERSION };
      } else {
        const nueva = {
          type: 'producto',
          productId,
          productName: productName || '',
          productImage: productImage || '',
          unitCost: costeNum,
          minStock: minNum,
          active: (active !== undefined) ? !!active : true
        };
        const saved = await wixData.insert(COL_WAREHOUSE, nueva, { suppressAuth: true });
        console.log(`${TAG} ✅ Ficha creada: ${productId}`);
        return { ok: true, action: 'created', ficha: saved, version: VERSION };
      }
    } catch (e) {
      console.error(`${TAG} ❌ guardarFichaAlmacen FAIL:`, e.message);
      return { ok: false, error: e.message };
    }
  }
);

// =====================================================
// 3. DESCONTAR CONSUMO (el "cubito")
// =====================================================
// Baja N unidades del stock real en Wix Stores Y registra el
// movimiento en KamisuiteWarehouse (type="consumo") como histórico.
// Mismo patrón de descuento ya probado en el editor de productos:
// leer variante default → decrementInventory.
export const descontarConsumo = webMethod(
  Permissions.Anyone,
  async (datos) => {
    try {
      const { productId, productName, cantidad, staffId } = datos || {};
      if (!productId) throw new Error('productId es requerido');

      const n = parseInt(cantidad, 10);
      const unidades = (!isNaN(n) && n > 0) ? n : 1;

      console.log(`${TAG} 🗑️ Descontar ${unidades} de ${productId}`);

      // 1) Bajar stock real en Stores (si el producto lleva inventario)
      let stockDescontado = false;
      let stockError = null;
      try {
        const elevatedGetVariants = elevate(getProductVariants);
        const vResult = await elevatedGetVariants(productId);
        const arr = Array.isArray(vResult) ? vResult : (vResult?.items || []);
        const variantId = arr[0]?._id || arr[0]?.id || null;

        const payloadDec = { productId, decrementBy: unidades };
        if (variantId) payloadDec.variantId = variantId;
        console.log(`${TAG} 🗑️ Payload decrementInventory: ${JSON.stringify(payloadDec)}`);

        const elevatedDecrement = elevate(decrementInventory);
        await elevatedDecrement([payloadDec]);
        stockDescontado = true;
      } catch (decErr) {
        // No abortamos: aunque el stock no se pueda bajar (producto sin
        // tracking), el consumo SÍ se registra en el histórico.
        stockError = decErr.message;
        console.warn(`${TAG} ⚠️ No se pudo bajar stock en Stores:`, decErr.message);
      }

      // 2) Registrar el consumo en el histórico (siempre)
      const movimiento = {
        type: 'consumo',
        productId,
        productName: productName || '',
        quantity: unidades,
        date: new Date(),
        staffId: staffId || ''
      };
      const saved = await wixData.insert(COL_WAREHOUSE, movimiento, { suppressAuth: true });
      console.log(`${TAG} ✅ Consumo registrado: ${unidades} de ${productId}`);

      return {
        ok: true,
        productId,
        unidades,
        stockDescontado,
        stockError,
        movimientoId: saved._id,
        version: VERSION
      };
    } catch (e) {
      console.error(`${TAG} ❌ descontarConsumo FAIL:`, e.message);
      return { ok: false, error: e.message };
    }
  }
);

// =====================================================
// 4. HISTÓRICO DE CONSUMO DE UN PRODUCTO
// =====================================================
// Devuelve los movimientos type="consumo" de un producto, recientes
// primero. Útil para ver cuánto se gasta de cada cosa.
export const historicoConsumo = webMethod(
  Permissions.Anyone,
  async (productId, limite) => {
    try {
      if (!productId) throw new Error('productId es requerido');
      const lim = (typeof limite === 'number' && limite > 0 && limite <= 100) ? limite : 30;

      const res = await wixData.query(COL_WAREHOUSE)
        .eq('type', 'consumo')
        .eq('productId', productId)
        .descending('date')
        .limit(lim)
        .find({ suppressAuth: true });

      const movimientos = (res.items || []).map(m => ({
        id: m._id,
        quantity: m.quantity || 0,
        date: m.date || m._createdDate || null,
        staffId: m.staffId || ''
      }));

      return { ok: true, productId, total: movimientos.length, movimientos, version: VERSION };
    } catch (e) {
      console.error(`${TAG} ❌ historicoConsumo FAIL:`, e.message);
      return { ok: false, error: e.message };
    }
  }
);