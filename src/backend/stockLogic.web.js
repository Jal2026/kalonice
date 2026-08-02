// =====================================================
// KAMISUITE — ALMACÉN DE USO EN SALÓN (V2, CMS-first)
// Backend: stockLogic.web.js
// VERSION: 1.0.0
// FECHA:   2 de agosto de 2026
// =====================================================
//
// QUÉ ES
// ------
// Almacén de los productos que el salón CONSUME durante los servicios.
// NO es venta. Todo lo que se vende (online o en mostrador) vive en Wix
// Stores con su propio inventario y NO se toca desde aquí, salvo por el
// único puente que existe: el TRASPASO (ver más abajo).
//
// SUSTITUYE a almacenLogic.web.js v1.1.0, que leía los productos de
// Wix Stores filtrando por el prefijo de categoría "USO SALON-" y
// escribía en la colección KamisuiteWarehouse. Ese modelo queda
// abandonado: la colección estaba vacía en producción y el prefijo ya
// no significa nada en el modelo nuevo.
//
// LAS DOS ESTANTERÍAS
// -------------------
// Estantería de la tienda  → Wix Stores (inventario nativo de Wix).
// Estantería del salón     → KamisuiteStock (inventario nuestro).
// Un bote está en una o en la otra, NUNCA en las dos. El traspaso resta
// las unidades del inventario de Stores en el mismo acto en que las
// suma al almacén del salón.
//
// LOS DOS CONTADORES
// ------------------
//   stockStored  → botes CERRADOS en la estantería.
//   stockInUse   → botes ABIERTOS, en uso en cabina.
//   inventario del producto = stockStored + stockInUse
//
// LA PAPELERA (el corazón operativo)
// ----------------------------------
// Cuando una estilista termina un bote lo tira al cubo negro y lo tira
// también en el software. Regla, tal y como funciona físicamente:
//   1. El bote terminado sale de stockInUse.
//   2. Si queda stock cerrado, sacan uno nuevo y lo abren:
//      stockStored −1 y stockInUse +1.
//   3. Si no queda stock cerrado, solo baja stockInUse. El producto
//      llega a cero y salta como agotado.
// Un solo clic = UN SOLO movimiento en el libro (SALIDA /
// CONSUMO_SERVICIO, cantidad 1). Nunca dos, para no contar el consumo
// por duplicado en los informes.
//
// AUTOCORRECCIÓN: si un producto arranca con botes cerrados y 0 en uso
// pero físicamente ya hay uno abierto en cabina, el primer clic deja el
// reparto correcto sin necesidad de inventariar los botes abiertos.
// Ningún contador puede quedar negativo en ninguna rama.
//
// EL LIBRO DE MOVIMIENTOS
// -----------------------
// Los contadores NO se editan a mano nunca. Toda variación de stock
// pasa por una fila de KamisuiteStockMoves con su tipo, su motivo, su
// fecha y la firma del empleado. Corregir stock es un AJUSTE/RECUENTO.
//
//   moveType: ENTRADA | SALIDA | APERTURA | AJUSTE
//   reason  : ENTRADA  → STOCK_INICIAL, COMPRA, TRASPASO_TIENDA, DEVOLUCION
//             SALIDA   → CONSUMO_SERVICIO, ROTURA, CADUCIDAD, USO_INTERNO,
//                        DEVOLUCION_PROVEEDOR
//             APERTURA → APERTURA_MANUAL
//             AJUSTE   → RECUENTO, CORRECCION
//
// FIRMA DEL MOVIMIENTO
// --------------------
// staffId/staffName llegan del empleado logueado por PIN en Recepción
// PRO (_empleadoActivo del widget, alimentado por validateLoginPin de
// recepcionAccessLogic v1.0.4). Si el salón tiene usersActivation en
// false (multi-tenant), el movimiento se graba sin firma y no rompe
// nada. NO se toca ReceptionAccessLog: la firma vive en la propia fila
// del movimiento, que es donde tiene sentido.
//
// COLECCIONES (field IDs confirmados por Jal, 2-ago-2026)
// -------------------------------------------------------
// KamisuiteStock:
//   productName, brand, category, description, sku, unit,
//   stockStored, stockInUse, minStock, maxStock, unitCost,
//   retailPrice, supplier, image, active, notes,
//   legacyId, legacySale, storesProductId
//
// KamisuiteStockMoves:
//   productId, productName, moveType, reason, quantity,
//   storedBefore, storedAfter, inUseBefore, inUseAfter,
//   date, staffId, staffName, notes, storesProductId
//
// PATRONES REUTILIZADOS (literales, de código en producción)
// ----------------------------------------------------------
//   · Lectura paginada de Wix Stores con includeHiddenProducts →
//     almacenLogic.web.js v1.1.0 (listarProductosAlmacen).
//   · elevate(getProductVariants) para resolver el variantId por defecto
//     y elevate(decrementInventory) → almacenLogic v1.1.0 y
//     tiendaEdicionLogic v1.2.6.
//   · elevate(updateInventoryVariantFieldsByProductId) con quantity > 0
//     en UNA sola llamada → tiendaEdicionLogic v1.2.6
//     (activarSeguimientoStock). Aquí solo se usa para REVERTIR un
//     traspaso fallido.
//   · mediaManager.upload + wixImageToPublicUrl →
//     serviciosEdicionLogic.web.js v1.11.7 (uploadImagenServicio).
//   · READ-MERGE-UPDATE en toda escritura de CMS (wixData.update
//     reemplaza el documento entero).
//
// CERO HARDCODING: ni un UUID, ni un id de salón, ni un nombre de
// producto. Multi-tenant por construcción.
//
// CHANGELOG
// v1.0.0 (2 ago 2026): versión inicial. CRUD de productos, motor de
//         movimientos, papelera, apertura, ajuste por recuento,
//         traspaso desde Wix Stores con reversión, histórico, listado
//         para el popup de Recepción y subida de imagen.
// =====================================================

import { Permissions, webMethod } from 'wix-web-module';
import { mediaManager } from 'wix-media-backend';
import { elevate } from 'wix-auth';
import wixData from 'wix-data';
import {
  getProductVariants,
  decrementInventory,
  updateInventoryVariantFieldsByProductId
} from 'wix-stores-backend';

const VERSION = '1.0.0';
const TAG = `[Stock][${VERSION}]`;

const CMS_STOCK = 'KamisuiteStock';
const CMS_MOVES = 'KamisuiteStockMoves';
const CMS_STORES = 'Stores/Products';

const AUTH = { suppressAuth: true };
const PAGE = 100;

// Tipos y motivos admitidos. El backend es la defensa final: cualquier
// valor fuera de estas listas se rechaza aunque el widget lo mande.
const MOVE_TYPES = ['ENTRADA', 'SALIDA', 'APERTURA', 'AJUSTE'];

const REASONS_BY_TYPE = {
  ENTRADA: ['STOCK_INICIAL', 'COMPRA', 'TRASPASO_TIENDA', 'DEVOLUCION'],
  SALIDA: ['CONSUMO_SERVICIO', 'ROTURA', 'CADUCIDAD', 'USO_INTERNO', 'DEVOLUCION_PROVEEDOR'],
  APERTURA: ['APERTURA_MANUAL'],
  AJUSTE: ['RECUENTO', 'CORRECCION']
};

// =====================================================
// HELPERS
// =====================================================

// Número seguro: null/''/undefined/NaN → valor por defecto.
function num(v, def = 0) {
  if (v === null || v === undefined || v === '') return def;
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

// Entero >= 0.
function intPos(v, def = 0) {
  const n = Math.trunc(num(v, def));
  return n > 0 ? n : (n === 0 ? 0 : def);
}

function str(v) {
  return (v === null || v === undefined) ? '' : String(v).trim();
}

// wix:image:// → URL pública. Copiado literal de serviciosEdicionLogic
// v1.11.7 (wixImageToPublicUrl).
function wixImageToPublicUrl(wixUrl) {
  if (!wixUrl || typeof wixUrl !== 'string') return '';
  if (wixUrl.startsWith('wix:image://')) {
    try {
      const match = wixUrl.match(/wix:image:\/\/v1\/([^/]+)/);
      if (match && match[1]) return `https://static.wixstatic.com/media/${match[1]}`;
    } catch (_) { /* cae al return de abajo */ }
    return '';
  }
  return wixUrl;
}

// Ficha de KamisuiteStock → objeto plano para el widget.
function adaptarProducto(row) {
  const stored = num(row.stockStored, 0);
  const inUse = num(row.stockInUse, 0);
  const minStock = num(row.minStock, 0);
  const total = stored + inUse;
  const unitCost = (row.unitCost === null || row.unitCost === undefined || row.unitCost === '')
    ? null : num(row.unitCost, 0);

  return {
    id: row._id,
    productName: str(row.productName),
    brand: str(row.brand),
    category: str(row.category),
    description: str(row.description),
    sku: str(row.sku),
    unit: str(row.unit),
    stockStored: stored,
    stockInUse: inUse,
    total,
    minStock,
    maxStock: num(row.maxStock, 0),
    unitCost,
    retailPrice: (row.retailPrice === null || row.retailPrice === undefined || row.retailPrice === '')
      ? null : num(row.retailPrice, 0),
    supplier: str(row.supplier),
    image: str(row.image),
    imageUrl: wixImageToPublicUrl(str(row.image)),
    active: row.active !== false,
    notes: str(row.notes),
    legacyId: str(row.legacyId),
    legacySale: row.legacySale === true,
    storesProductId: str(row.storesProductId),
    // Aviso de reposición SOLO si hay mínimo configurado (> 0). Los 349
    // registros heredados vienen con mínimo 0 y no deben llenar la
    // pantalla de avisos rojos.
    needsRestock: minStock > 0 && total <= minStock,
    outOfStock: total <= 0
  };
}

// Lectura paginada completa de una colección propia.
async function leerTodo(coleccion, filtroFn) {
  let items = [];
  let skip = 0;
  let hasMore = true;
  while (hasMore) {
    let q = wixData.query(coleccion).limit(PAGE).skip(skip);
    if (typeof filtroFn === 'function') q = filtroFn(q);
    const res = await q.find(AUTH);
    const page = res.items || [];
    items = items.concat(page);
    hasMore = page.length === PAGE;
    skip += PAGE;
  }
  return items;
}

// Inserta la fila del libro de movimientos. Devuelve la fila guardada.
async function insertarMovimiento({
  productId, productName, moveType, reason, quantity,
  storedBefore, storedAfter, inUseBefore, inUseAfter,
  staffId, staffName, notes, storesProductId
}) {
  const fila = {
    productId: str(productId),
    productName: str(productName),
    moveType: str(moveType),
    reason: str(reason),
    quantity: num(quantity, 0),
    storedBefore: num(storedBefore, 0),
    storedAfter: num(storedAfter, 0),
    inUseBefore: num(inUseBefore, 0),
    inUseAfter: num(inUseAfter, 0),
    date: new Date(),
    staffId: str(staffId),
    staffName: str(staffName),
    notes: str(notes),
    storesProductId: str(storesProductId)
  };
  return wixData.insert(CMS_MOVES, fila, AUTH);
}

// Aplica contadores a la ficha y registra el movimiento.
// READ-MERGE-UPDATE: se parte de la fila completa leída del CMS.
// Si el movimiento no se puede escribir, se REVIERTE la ficha: sin
// traza no puede quedar el stock movido.
async function aplicarMovimiento(fila, nuevoStored, nuevoInUse, datosMov) {
  const storedBefore = num(fila.stockStored, 0);
  const inUseBefore = num(fila.stockInUse, 0);

  const merged = { ...fila, stockStored: nuevoStored, stockInUse: nuevoInUse };
  await wixData.update(CMS_STOCK, merged, AUTH);

  try {
    const mov = await insertarMovimiento({
      productId: fila._id,
      productName: str(fila.productName),
      storesProductId: str(fila.storesProductId),
      storedBefore,
      storedAfter: nuevoStored,
      inUseBefore,
      inUseAfter: nuevoInUse,
      ...datosMov
    });
    return { ficha: merged, movimiento: mov };
  } catch (movErr) {
    console.error(`${TAG} ❌ Movimiento no registrado, revirtiendo contadores:`, movErr.message);
    try {
      await wixData.update(CMS_STOCK, { ...fila, stockStored: storedBefore, stockInUse: inUseBefore }, AUTH);
      console.log(`${TAG} ↩️ Contadores revertidos en ${fila._id}`);
    } catch (revErr) {
      console.error(`${TAG} ❌❌ REVERSIÓN FALLIDA en ${fila._id}:`, revErr.message);
    }
    throw new Error('No se pudo registrar el movimiento: ' + movErr.message);
  }
}

// Lee un producto de Wix Stores por id, incluyendo los ocultos del sitio.
// Se usa query (no get) porque appOptions solo está validado en query
// dentro de este proyecto (patrón de almacenLogic v1.1.0).
async function leerProductoStores(storesProductId) {
  const res = await wixData.query(CMS_STORES)
    .eq('_id', storesProductId)
    .limit(1)
    .find({ suppressAuth: true, appOptions: { includeHiddenProducts: true } });
  return (res.items || [])[0] || null;
}

// variantId por defecto de un producto de Stores.
async function resolverVariantId(storesProductId) {
  const vResult = await elevate(getProductVariants)(storesProductId);
  const arr = Array.isArray(vResult) ? vResult : (vResult?.items || []);
  return arr[0]?._id || arr[0]?.id || null;
}

// =====================================================
// 1. LISTAR ALMACÉN
// =====================================================
// Devuelve todos los productos del almacén, las taxonomías derivadas
// (marcas y categorías únicas, para filtros y autocompletado) y el
// resumen del panel superior.
//
// Las taxonomías se recalculan en CADA lectura: nunca se cachean en el
// backend. El widget debe recalcularlas también en local tras cada
// guardado (regla de UX de KAMISUITE: los desplegables derivados se
// refrescan sin recargar la página).
export const listarStock = webMethod(
  Permissions.SiteMember,
  async () => {
    try {
      const rows = await leerTodo(CMS_STOCK);
      const productos = rows.map(adaptarProducto)
        .sort((a, b) => a.productName.localeCompare(b.productName, 'es'));

      const brands = Array.from(new Set(
        productos.map(p => p.brand).filter(b => b !== '')
      )).sort((a, b) => a.localeCompare(b, 'es'));

      const categories = Array.from(new Set(
        productos.map(p => p.category).filter(c => c !== '')
      )).sort((a, b) => a.localeCompare(b, 'es'));

      const suppliers = Array.from(new Set(
        productos.map(p => p.supplier).filter(s => s !== '')
      )).sort((a, b) => a.localeCompare(b, 'es'));

      const units = Array.from(new Set(
        productos.map(p => p.unit).filter(u => u !== '')
      )).sort((a, b) => a.localeCompare(b, 'es'));

      // Resumen del panel. El valor de almacén se calcula SOLO con los
      // productos que tienen coste informado; los que no lo tienen se
      // cuentan aparte, para no dar una cifra falsa.
      const activos = productos.filter(p => p.active);
      let valorAlmacen = 0;
      let sinValorar = 0;
      for (const p of activos) {
        if (p.unitCost !== null && p.unitCost > 0) valorAlmacen += p.total * p.unitCost;
        else if (p.total > 0) sinValorar += 1;
      }

      const resumen = {
        referencias: productos.length,
        activas: activos.length,
        agotados: activos.filter(p => p.outOfStock).length,
        bajoMinimo: activos.filter(p => p.needsRestock && !p.outOfStock).length,
        unidadesTotales: activos.reduce((acc, p) => acc + p.total, 0),
        unidadesEnUso: activos.reduce((acc, p) => acc + p.stockInUse, 0),
        valorAlmacen: Math.round(valorAlmacen * 100) / 100,
        sinValorar
      };

      console.log(`${TAG} 📦 ${productos.length} referencias · ${brands.length} marcas · ${categories.length} categorías`);

      return { ok: true, productos, brands, categories, suppliers, units, resumen, version: VERSION };
    } catch (e) {
      console.error(`${TAG} ❌ listarStock:`, e.message);
      return { ok: false, error: e.message };
    }
  }
);

// =====================================================
// 2. LISTAR CONSUMIBLES (popup de Recepción)
// =====================================================
// Solo lo que las estilistas necesitan ver para tirar un bote: activos
// con inventario positivo. Payload mínimo, sin costes ni proveedores.
export const listarConsumibles = webMethod(
  Permissions.SiteMember,
  async () => {
    try {
      const rows = await leerTodo(CMS_STOCK, q => q.eq('active', true));
      const productos = rows
        .map(adaptarProducto)
        .filter(p => p.total > 0)
        .map(p => ({
          id: p.id,
          productName: p.productName,
          brand: p.brand,
          category: p.category,
          unit: p.unit,
          imageUrl: p.imageUrl,
          stockStored: p.stockStored,
          stockInUse: p.stockInUse,
          total: p.total,
          needsRestock: p.needsRestock
        }))
        .sort((a, b) => a.productName.localeCompare(b.productName, 'es'));

      console.log(`${TAG} 🗑️ ${productos.length} consumibles con inventario positivo`);
      return { ok: true, productos, version: VERSION };
    } catch (e) {
      console.error(`${TAG} ❌ listarConsumibles:`, e.message);
      return { ok: false, error: e.message };
    }
  }
);

// =====================================================
// 3. TIRAR A LA PAPELERA
// =====================================================
// La acción del cubo negro. Un clic = un bote terminado.
//   1) el bote terminado sale de stockInUse (nunca por debajo de 0)
//   2) si queda stock cerrado, se abre uno nuevo:
//      stockStored −1, stockInUse +1
// Un único movimiento SALIDA / CONSUMO_SERVICIO, cantidad 1.
export const tirarPapelera = webMethod(
  Permissions.SiteMember,
  async (datos) => {
    try {
      const { productId, staffId, staffName, notes } = datos || {};
      if (!productId) throw new Error('productId es requerido');

      const fila = await wixData.get(CMS_STOCK, productId, AUTH);
      if (!fila) throw new Error('Producto no encontrado en el almacén');

      const stored = num(fila.stockStored, 0);
      const inUse = num(fila.stockInUse, 0);

      if (stored <= 0 && inUse <= 0) {
        return { ok: false, error: 'Sin existencias: no hay nada que tirar' };
      }

      // Paso 1: el bote terminado desaparece.
      let nuevoInUse = Math.max(0, inUse - 1);
      let nuevoStored = stored;

      // Paso 2: si queda cerrado, sacan uno y lo abren.
      if (stored > 0) {
        nuevoStored = stored - 1;
        nuevoInUse = nuevoInUse + 1;
      }

      const r = await aplicarMovimiento(fila, nuevoStored, nuevoInUse, {
        moveType: 'SALIDA',
        reason: 'CONSUMO_SERVICIO',
        quantity: 1,
        staffId,
        staffName,
        notes
      });

      const total = nuevoStored + nuevoInUse;
      console.log(`${TAG} 🗑️ ${str(fila.productName)} · ${stored}/${inUse} → ${nuevoStored}/${nuevoInUse} · ${str(staffName) || 'sin firma'}`);

      return {
        ok: true,
        productId,
        stockStored: nuevoStored,
        stockInUse: nuevoInUse,
        total,
        outOfStock: total <= 0,
        needsRestock: num(fila.minStock, 0) > 0 && total <= num(fila.minStock, 0),
        movimientoId: r.movimiento._id,
        version: VERSION
      };
    } catch (e) {
      console.error(`${TAG} ❌ tirarPapelera:`, e.message);
      return { ok: false, error: e.message };
    }
  }
);

// =====================================================
// 4. REGISTRAR MOVIMIENTO (entrada · salida · apertura · ajuste)
// =====================================================
// Motor único de todas las variaciones de stock que no son la papelera
// ni el traspaso. Los contadores NUNCA se escriben por otra vía.
//
// Payload:
//   productId   (obligatorio)
//   moveType    ENTRADA | SALIDA | APERTURA | AJUSTE
//   reason      uno de los admitidos para ese tipo
//   quantity    unidades (ENTRADA, SALIDA, APERTURA)
//   fromInUse   true → la SALIDA descuenta de los botes abiertos
//   newStored / newInUse  valores absolutos (solo AJUSTE)
//   notes, staffId, staffName
export const registrarMovimiento = webMethod(
  Permissions.SiteMember,
  async (datos) => {
    try {
      const {
        productId, moveType, reason, quantity,
        fromInUse, newStored, newInUse,
        notes, staffId, staffName
      } = datos || {};

      if (!productId) throw new Error('productId es requerido');

      const tipo = str(moveType).toUpperCase();
      if (!MOVE_TYPES.includes(tipo)) {
        throw new Error(`Tipo de movimiento no admitido: ${tipo || '(vacío)'}`);
      }

      const motivo = str(reason).toUpperCase();
      if (!REASONS_BY_TYPE[tipo].includes(motivo)) {
        throw new Error(`Motivo "${motivo || '(vacío)'}" no admitido para ${tipo}`);
      }

      const fila = await wixData.get(CMS_STOCK, productId, AUTH);
      if (!fila) throw new Error('Producto no encontrado en el almacén');

      const stored = num(fila.stockStored, 0);
      const inUse = num(fila.stockInUse, 0);

      let nuevoStored = stored;
      let nuevoInUse = inUse;
      let cantidadMov = 0;

      if (tipo === 'ENTRADA') {
        const n = intPos(quantity, 0);
        if (n <= 0) throw new Error('La cantidad debe ser mayor que cero');
        nuevoStored = stored + n;
        cantidadMov = n;

      } else if (tipo === 'SALIDA') {
        const n = intPos(quantity, 0);
        if (n <= 0) throw new Error('La cantidad debe ser mayor que cero');
        if (fromInUse === true) {
          if (n > inUse) throw new Error(`Solo hay ${inUse} bote(s) abierto(s)`);
          nuevoInUse = inUse - n;
        } else {
          if (n > stored) throw new Error(`Solo hay ${stored} unidad(es) en el almacén`);
          nuevoStored = stored - n;
        }
        cantidadMov = n;

      } else if (tipo === 'APERTURA') {
        const n = intPos(quantity, 1) || 1;
        if (n > stored) throw new Error(`Solo hay ${stored} unidad(es) cerradas para abrir`);
        nuevoStored = stored - n;
        nuevoInUse = inUse + n;
        cantidadMov = n;

      } else { // AJUSTE — valores absolutos
        const sAbs = (newStored === undefined || newStored === null || newStored === '')
          ? stored : intPos(newStored, 0);
        const uAbs = (newInUse === undefined || newInUse === null || newInUse === '')
          ? inUse : intPos(newInUse, 0);
        if (sAbs < 0 || uAbs < 0) throw new Error('Los contadores no pueden ser negativos');
        if (sAbs === stored && uAbs === inUse) {
          return { ok: false, error: 'El recuento coincide con el sistema: no hay nada que ajustar' };
        }
        nuevoStored = sAbs;
        nuevoInUse = uAbs;
        // En un ajuste la cantidad es la diferencia neta del inventario.
        cantidadMov = (sAbs + uAbs) - (stored + inUse);
      }

      const r = await aplicarMovimiento(fila, nuevoStored, nuevoInUse, {
        moveType: tipo,
        reason: motivo,
        quantity: cantidadMov,
        staffId,
        staffName,
        notes
      });

      const total = nuevoStored + nuevoInUse;
      console.log(`${TAG} 📝 ${tipo}/${motivo} · ${str(fila.productName)} · ${stored}/${inUse} → ${nuevoStored}/${nuevoInUse}`);

      return {
        ok: true,
        productId,
        moveType: tipo,
        reason: motivo,
        stockStored: nuevoStored,
        stockInUse: nuevoInUse,
        total,
        movimientoId: r.movimiento._id,
        version: VERSION
      };
    } catch (e) {
      console.error(`${TAG} ❌ registrarMovimiento:`, e.message);
      return { ok: false, error: e.message };
    }
  }
);

// =====================================================
// 5. GUARDAR PRODUCTO (alta y edición)
// =====================================================
// Alta: acepta una cantidad inicial y genera el movimiento
//       ENTRADA / STOCK_INICIAL correspondiente.
// Edición: READ-MERGE-UPDATE de los datos de la ficha. NO toca los
//       contadores: el stock solo se mueve por movimientos. Los campos
//       stockStored/stockInUse que lleguen en el payload se IGNORAN
//       deliberadamente en la edición.
export const guardarProducto = webMethod(
  Permissions.SiteMember,
  async (datos) => {
    try {
      const d = datos || {};
      const nombre = str(d.productName);
      if (!nombre) throw new Error('El nombre del producto es obligatorio');

      // Campos de ficha comunes al alta y a la edición.
      const campos = {
        productName: nombre,
        brand: str(d.brand),
        category: str(d.category),
        description: str(d.description),
        sku: str(d.sku),
        unit: str(d.unit),
        minStock: intPos(d.minStock, 0),
        maxStock: intPos(d.maxStock, 0),
        unitCost: (d.unitCost === undefined || d.unitCost === null || d.unitCost === '')
          ? null : num(d.unitCost, 0),
        retailPrice: (d.retailPrice === undefined || d.retailPrice === null || d.retailPrice === '')
          ? null : num(d.retailPrice, 0),
        supplier: str(d.supplier),
        active: d.active !== false,
        notes: str(d.notes)
      };

      // ── EDICIÓN ──
      if (d.id) {
        const fila = await wixData.get(CMS_STOCK, d.id, AUTH);
        if (!fila) throw new Error('Producto no encontrado en el almacén');

        const merged = { ...fila, ...campos };
        const saved = await wixData.update(CMS_STOCK, merged, AUTH);
        console.log(`${TAG} ✏️ Ficha actualizada: ${nombre}`);
        return { ok: true, action: 'updated', producto: adaptarProducto(saved), version: VERSION };
      }

      // ── ALTA ──
      const inicial = intPos(d.stockStored, 0);
      const nueva = {
        ...campos,
        stockStored: 0,
        stockInUse: 0,
        legacyId: str(d.legacyId),
        legacySale: d.legacySale === true,
        storesProductId: str(d.storesProductId)
      };

      const creada = await wixData.insert(CMS_STOCK, nueva, AUTH);
      console.log(`${TAG} ➕ Producto creado: ${nombre} (${creada._id})`);

      if (inicial > 0) {
        try {
          await aplicarMovimiento(creada, inicial, 0, {
            moveType: 'ENTRADA',
            reason: 'STOCK_INICIAL',
            quantity: inicial,
            staffId: d.staffId,
            staffName: d.staffName,
            notes: str(d.notes)
          });
        } catch (movErr) {
          // La ficha existe; el stock queda a 0 y se puede regularizar
          // con un AJUSTE. No se borra el producto recién creado.
          console.error(`${TAG} ⚠️ Stock inicial no aplicado en ${creada._id}:`, movErr.message);
          const recargada = await wixData.get(CMS_STOCK, creada._id, AUTH);
          return {
            ok: true,
            action: 'created',
            producto: adaptarProducto(recargada),
            warn: 'Producto creado, pero el stock inicial no se pudo registrar. Regularízalo con un ajuste.',
            version: VERSION
          };
        }
      }

      const recargada = await wixData.get(CMS_STOCK, creada._id, AUTH);
      return { ok: true, action: 'created', producto: adaptarProducto(recargada), version: VERSION };
    } catch (e) {
      console.error(`${TAG} ❌ guardarProducto:`, e.message);
      return { ok: false, error: e.message };
    }
  }
);

// =====================================================
// 6. ELIMINAR PRODUCTO
// =====================================================
// Borra la ficha. Los movimientos NO se borran: el histórico del
// almacén es contabilidad y no se reescribe. Las filas conservan
// productName cacheado, así que el histórico sigue siendo legible.
// Si solo se quiere retirar el producto de la operativa diaria, la vía
// correcta es active = false, no el borrado.
export const eliminarProducto = webMethod(
  Permissions.SiteMember,
  async (datos) => {
    try {
      const { productId } = datos || {};
      if (!productId) throw new Error('productId es requerido');

      const fila = await wixData.get(CMS_STOCK, productId, AUTH);
      if (!fila) {
        console.log(`${TAG} ℹ️ Producto ya no existe (idempotente): ${productId}`);
        return { ok: true, productId, alreadyGone: true, version: VERSION };
      }

      await wixData.remove(CMS_STOCK, productId, AUTH);
      console.log(`${TAG} 🗑️ Producto eliminado: ${str(fila.productName)}`);

      return { ok: true, productId, productName: str(fila.productName), version: VERSION };
    } catch (e) {
      console.error(`${TAG} ❌ eliminarProducto:`, e.message);
      return { ok: false, error: e.message };
    }
  }
);

// =====================================================
// 7. SUBIR IMAGEN DE PRODUCTO
// =====================================================
// Patrón literal de serviciosEdicionLogic v1.11.7 (uploadImagenServicio).
export const uploadImagenProducto = webMethod(
  Permissions.SiteMember,
  async ({ productId, base64Data, fileName, mimeType }) => {
    try {
      if (!productId || !base64Data || !fileName) {
        return { ok: false, error: 'Faltan parámetros (productId, base64Data, fileName)' };
      }

      const fila = await wixData.get(CMS_STOCK, productId, AUTH);
      if (!fila) return { ok: false, error: 'Producto no encontrado en el almacén' };

      const buffer = Buffer.from(base64Data, 'base64');
      const uploadResult = await mediaManager.upload(
        '/KamisuiteStock',
        buffer,
        fileName,
        {
          mediaOptions: { mimeType: mimeType || 'image/jpeg', mediaType: 'image' },
          metadataOptions: { isPrivate: false, isVisitorUpload: false }
        }
      );

      const fileUrl = uploadResult?.fileUrl || '';
      if (!fileUrl) return { ok: false, error: 'Media Manager no devolvió fileUrl' };

      fila.image = fileUrl;
      await wixData.update(CMS_STOCK, fila, AUTH);
      console.log(`${TAG} 📸 Imagen actualizada: ${str(fila.productName)}`);

      return { ok: true, fileUrl, publicUrl: wixImageToPublicUrl(fileUrl), version: VERSION };
    } catch (e) {
      console.error(`${TAG} ❌ uploadImagenProducto:`, e.message);
      return { ok: false, error: e.message };
    }
  }
);

// =====================================================
// 8. HISTÓRICO DE MOVIMIENTOS
// =====================================================
export const historicoProducto = webMethod(
  Permissions.SiteMember,
  async (datos) => {
    try {
      const { productId, limite } = datos || {};
      if (!productId) throw new Error('productId es requerido');
      const lim = (Number.isFinite(Number(limite)) && Number(limite) > 0 && Number(limite) <= 200)
        ? Number(limite) : 50;

      const res = await wixData.query(CMS_MOVES)
        .eq('productId', productId)
        .descending('date')
        .limit(lim)
        .find(AUTH);

      const movimientos = (res.items || []).map(m => ({
        id: m._id,
        moveType: str(m.moveType),
        reason: str(m.reason),
        quantity: num(m.quantity, 0),
        storedBefore: num(m.storedBefore, 0),
        storedAfter: num(m.storedAfter, 0),
        inUseBefore: num(m.inUseBefore, 0),
        inUseAfter: num(m.inUseAfter, 0),
        date: m.date || m._createdDate || null,
        staffName: str(m.staffName),
        notes: str(m.notes)
      }));

      return { ok: true, productId, total: movimientos.length, movimientos, version: VERSION };
    } catch (e) {
      console.error(`${TAG} ❌ historicoProducto:`, e.message);
      return { ok: false, error: e.message };
    }
  }
);

// =====================================================
// 9. LISTAR PRODUCTOS DE LA TIENDA (para el traspaso)
// =====================================================
// Lee Wix Stores con paginación por skip (la paginación por cursor de
// queryProducts v2 falló en producción: devolvía 92 de 231). Incluye
// los productos ocultos del sitio, porque un producto oculto sigue
// siendo un bote en la estantería de la tienda.
export const listarProductosTienda = webMethod(
  Permissions.SiteMember,
  async () => {
    try {
      let items = [];
      let skip = 0;
      let hasMore = true;
      while (hasMore) {
        const res = await wixData.query(CMS_STORES)
          .limit(PAGE)
          .skip(skip)
          .find({ suppressAuth: true, appOptions: { includeHiddenProducts: true } });
        const page = res.items || [];
        items = items.concat(page);
        hasMore = page.length === PAGE;
        skip += PAGE;
      }

      const productos = items.map(p => ({
        storesProductId: p._id,
        name: str(p.name),
        sku: str(p.sku),
        brand: str(p.brand),
        description: str(p.description).replace(/<[^>]*>/g, '').trim(),
        mainMedia: str(p.mainMedia),
        price: num(p.price, 0),
        trackInventory: p.trackInventory === true,
        quantityInStock: (p.trackInventory === true && typeof p.quantityInStock === 'number')
          ? p.quantityInStock : null
      })).sort((a, b) => a.name.localeCompare(b.name, 'es'));

      console.log(`${TAG} 🏬 ${productos.length} productos en la tienda`);
      return { ok: true, total: productos.length, productos, version: VERSION };
    } catch (e) {
      console.error(`${TAG} ❌ listarProductosTienda:`, e.message);
      return { ok: false, error: e.message };
    }
  }
);

// =====================================================
// 10. TRASPASAR DESDE LA TIENDA
// =====================================================
// El paso de estantería: N unidades salen del inventario de Wix Stores
// y entran en el almacén del salón. Nunca están en los dos sitios.
//
// ORDEN DE ESCRITURA (deliberado): primero se descuenta de Stores y
// después se suma al almacén. Si fallara el segundo paso, las unidades
// quedan perdidas en Stores pero NO duplicadas — y se intenta revertir
// el inventario de Stores a su valor anterior.
//
// Si el producto de Stores no lleva seguimiento de inventario activado,
// se ABORTA: sin contador de origen no se puede garantizar que las
// unidades no existan en los dos sitios a la vez.
export const traspasarDesdeTienda = webMethod(
  Permissions.SiteMember,
  async (datos) => {
    try {
      const { storesProductId, cantidad, staffId, staffName, notes } = datos || {};
      if (!storesProductId) throw new Error('storesProductId es requerido');

      const n = intPos(cantidad, 0);
      if (n <= 0) throw new Error('La cantidad debe ser mayor que cero');

      const prod = await leerProductoStores(storesProductId);
      if (!prod) throw new Error('Producto no encontrado en la tienda');

      if (prod.trackInventory !== true) {
        return {
          ok: false,
          error: `"${str(prod.name)}" no tiene el seguimiento de inventario activado en la tienda. Actívalo antes de traspasar, o las unidades quedarían contadas en los dos sitios.`
        };
      }

      const disponible = (typeof prod.quantityInStock === 'number') ? prod.quantityInStock : 0;
      if (n > disponible) {
        return { ok: false, error: `La tienda solo tiene ${disponible} unidad(es) de "${str(prod.name)}"` };
      }

      // ── Paso 1: descontar del inventario de la tienda ──
      const variantId = await resolverVariantId(storesProductId);
      const payloadDec = { productId: storesProductId, decrementBy: n };
      if (variantId) payloadDec.variantId = variantId;
      console.log(`${TAG} 🏬→📦 decrementInventory: ${JSON.stringify(payloadDec)}`);
      await elevate(decrementInventory)([payloadDec]);

      // A partir de aquí, cualquier fallo debe revertir el inventario.
      const revertirStores = async (motivo) => {
        try {
          const inventoryInfo = {
            trackQuantity: true,
            variants: [variantId ? { variantId, quantity: disponible } : { quantity: disponible }]
          };
          await elevate(updateInventoryVariantFieldsByProductId)(storesProductId, inventoryInfo);
          console.log(`${TAG} ↩️ Inventario de tienda restaurado a ${disponible} (${motivo})`);
        } catch (revErr) {
          console.error(`${TAG} ❌❌ RESTAURACIÓN DE TIENDA FALLIDA (${motivo}):`, revErr.message);
        }
      };

      try {
        // ── Paso 2: localizar o crear la ficha de almacén ──
        const existeRes = await wixData.query(CMS_STOCK)
          .eq('storesProductId', storesProductId)
          .limit(1)
          .find(AUTH);

        let fila = (existeRes.items || [])[0] || null;
        let creada = false;

        if (!fila) {
          const nueva = {
            productName: str(prod.name),
            brand: str(prod.brand),
            category: '',
            description: str(prod.description).replace(/<[^>]*>/g, '').trim(),
            sku: str(prod.sku),
            unit: '',
            stockStored: 0,
            stockInUse: 0,
            minStock: 0,
            maxStock: 0,
            unitCost: null,
            retailPrice: num(prod.price, 0),
            supplier: '',
            active: true,
            notes: '',
            legacyId: '',
            legacySale: true,
            storesProductId
          };
          fila = await wixData.insert(CMS_STOCK, nueva, AUTH);
          creada = true;
          console.log(`${TAG} ➕ Ficha de almacén creada desde tienda: ${str(prod.name)}`);

          // La imagen se intenta aparte: si el campo Image rechazara el
          // valor de mainMedia, el traspaso no debe caerse por eso.
          const media = str(prod.mainMedia);
          if (media) {
            try {
              fila.image = media;
              fila = await wixData.update(CMS_STOCK, fila, AUTH);
            } catch (imgErr) {
              console.warn(`${TAG} ⚠️ Imagen no copiada desde la tienda:`, imgErr.message);
              fila = await wixData.get(CMS_STOCK, fila._id, AUTH);
            }
          }
        }

        // ── Paso 3: entrada en el almacén + movimiento ──
        const stored = num(fila.stockStored, 0);
        const inUse = num(fila.stockInUse, 0);

        const r = await aplicarMovimiento(fila, stored + n, inUse, {
          moveType: 'ENTRADA',
          reason: 'TRASPASO_TIENDA',
          quantity: n,
          staffId,
          staffName,
          notes
        });

        console.log(`${TAG} ✅ Traspaso: ${n} × ${str(prod.name)} · tienda ${disponible}→${disponible - n} · almacén ${stored}→${stored + n}`);

        return {
          ok: true,
          productId: fila._id,
          creada,
          productName: str(fila.productName),
          unidades: n,
          stockStored: stored + n,
          stockInUse: inUse,
          total: stored + n + inUse,
          tiendaRestante: disponible - n,
          movimientoId: r.movimiento._id,
          version: VERSION
        };
      } catch (errAlmacen) {
        await revertirStores('fallo al dar entrada en el almacén');
        throw new Error('El traspaso se ha deshecho: ' + errAlmacen.message);
      }
    } catch (e) {
      console.error(`${TAG} ❌ traspasarDesdeTienda:`, e.message);
      return { ok: false, error: e.message };
    }
  }
);

// =====================================================
// 11. MOVIMIENTOS RECIENTES (panel de la pantalla de almacén)
// =====================================================
export const movimientosRecientes = webMethod(
  Permissions.SiteMember,
  async (datos) => {
    try {
      const lim = (Number.isFinite(Number(datos?.limite)) && Number(datos.limite) > 0 && Number(datos.limite) <= 200)
        ? Number(datos.limite) : 40;

      const res = await wixData.query(CMS_MOVES)
        .descending('date')
        .limit(lim)
        .find(AUTH);

      const movimientos = (res.items || []).map(m => ({
        id: m._id,
        productId: str(m.productId),
        productName: str(m.productName),
        moveType: str(m.moveType),
        reason: str(m.reason),
        quantity: num(m.quantity, 0),
        date: m.date || m._createdDate || null,
        staffName: str(m.staffName),
        notes: str(m.notes)
      }));

      return { ok: true, total: movimientos.length, movimientos, version: VERSION };
    } catch (e) {
      console.error(`${TAG} ❌ movimientosRecientes:`, e.message);
      return { ok: false, error: e.message };
    }
  }
);
