// =====================================================
// KAMISUITE - Tienda Productos (Backend)
// =====================================================
// Archivo: tiendaProductos.web.js
// Versión: 1.5.13
// =====================================================
// v1.1: wixData Stores/Products + generalInfo pickup
// v1.2: + contactos + buyerInfo + addPayments (order visible)
// v1.3: + billingInfo contactDetails + status APPROVED + limpieza debug
// v1.4: + metodoPago en registrarVenta
//       + generarFacturaProducto (Wix Invoices, patrón checkout v3.14)
//       + obtenerHistorialVentas (orders.searchOrders de eCommerce)
// v1.5: NEW venderProductosDesdeAgenda — venta multi-línea desde
//       Recepción PRO con contactId garantizado en buyerInfo.
//       Una sola order con N lineItems, una factura multi-línea, una
//       entrada en expediente. NO modifica funciones existentes.
// v1.5.1: FIX (no desplegado) email vacío en buyerInfo causaba
//       INVALID_ARGUMENT. Validación regex + omisión si no es válido.
// v1.5.2: FIX las reservas de la agenda pueden venir SIN email aunque
//       el CRM sí lo tenga. Si el booking no trae email válido, se busca
//       en el CRM por contactId (contacts.getContact). Si tampoco, la
//       venta procede solo con contactId — Wix asocia la orden al
//       contacto por contactId, el email es opcional.
//       Bonus: la factura ahora sale con el email real del CRM cuando
//       existe, en lugar del fallback genérico info@hair-times.com.
// v1.5.6: NEW registro CMS-first en PaymentReservations.
//       Tras crear la orden Wix Stores + factura, se inserta UN registro
//       en PaymentReservations con staff="TIENDA" como FUENTE DE VERDAD
//       para KAMISUITE. El cierre del día y los cards de cita leen de
//       aquí (no de Wix Stores). Wix Stores queda solo para trazabilidad
//       fiscal (factura/ticket POS). Anti-duplicado por orderId.
// v1.5.7: FIX registrarVenta (Tienda standalone) — mismos bugs que
//       v1.5.1/v1.5.2 corrigieron en venderProductosDesdeAgenda:
//       (1) Validación regex de email + fallback CRM por contactId
//       (2) buyerInfo.email condicional (solo si válido, nunca '')
//       (3) Registro en PaymentReservations (CMS-first, anti-duplicado)
//       Sin estos fixes, las ventas standalone no vinculaban contactId
//       y quedaban invisibles en Care Profile y cierre financiero.
// v1.5.8: FIX obtenerHistorialVentas — nombre del cliente se leía de
//       buyerInfo.firstName/lastName que Wix no propaga del checkout.
//       Ahora intenta billingInfo.contactDetails primero, luego
//       shippingInfo.pickupDetails.buyerDetails, luego buyerInfo.
//       FIX generarFacturaProducto — si contactName llega vacío o
//       "Sin cliente" pero hay contactId, busca nombre en CRM.
// v1.5.9: FIX generarFacturaProducto — faltaba campo fullName en
//       customer del invoice. Wix Invoices necesita fullName para
//       renderizar "Facturar a:" — mismo patrón que generarFactura
//       en testCheckout.web.js v3.17.
// v1.5.10: ANTI-DUPLICACIÓN DE FACTURAS — gestión propia vía CMS.
//       Billing/Invoices de Wix no soporta filtros (.eq() ignorado,
//       limitado a 50 items); orderInvoices en Developer Preview.
//       Solución: campo invoiceId en PaymentReservations (CMS propio).
//       (1) generarFacturaProducto: antes de crear, comprueba si el
//           registro CMS ya tiene invoiceId → devuelve previewUrl sin
//           duplicar. Tras crear, actualiza el registro con invoiceId.
//       (2) obtenerHistorialVentas: cruza orderIds con PaymentReservations
//           para devolver invoiceId al widget → botón "Ver" vs "Factura".
//       (3) venderProductosDesdeAgenda: graba invoiceId en el registro
//           CMS al insertar + fullName en customer del invoice.
// v1.5.11: SOPORTE DE VARIANTES (tamaños de bote 250ml / 1000ml).
//       Causa del EMPTY_CHECKOUT al vender desde la agenda un producto
//       con variantes: Wix Stores exige catalogReference.options.variantId
//       cuando el producto tiene variantes gestionadas. El widget
//       recepcionProCMS v1.1.25+ y el page code v1.0.13 ya lo soportaban;
//       este backend se había quedado en v1.5.10 sin devolver variantes.
//       (1) listarProductos: devuelve por producto
//           variants:[{variantId,label,choices,price,sku,inStock}] y
//           manageVariants:true SOLO cuando hay más de una variante.
//           Sin variantes → respuesta idéntica a v1.5.10 (variants:[]).
//       (2) venderProductosDesdeAgenda: acepta variantId + variantLabel
//           por item. Si llega variantId → catalogReference.options.
//           Pre-validación: item sin variantId cuyo producto tiene >1
//           variante → error 'MISSING_VARIANT' con las variantes
//           disponibles, en vez del opaco EMPTY_CHECKOUT de Wix.
//           variantLabel se añade al nombre en PaymentReservations y
//           en la factura: "🛒 ARTEMISA CHAMPÚ · 250ml (22.45€)".
//       Patrón getProductVariants copiado literal de
//       tiendaEdicionLogic.web.js (líneas 187/243/703 de este mismo
//       salón): elevate(getProductVariants)(productId) y lectura
//       defensiva Array.isArray(res) ? res : (res?.items || []).
//       NO se tocan registrarVenta, generarFacturaProducto,
//       obtenerHistorialVentas, cargarContactosTienda ni el bloque
//       CMS-first de PaymentReservations.
// v1.5.13: TRAZABILIDAD DEL VENDEDOR — campo `soldBy`.
//       El registro de venta en PaymentReservations usa `staff` como
//       DISCRIMINADOR de tipo ('TIENDA' desde la agenda, 'TIENDA_POS'
//       desde la tienda standalone), no como persona, así que no había
//       forma de saber QUIÉN despachó el producto. El informe del día
//       necesita atribuir la venta al empleado que estaba logueado en
//       Recepción.
//       Cambio: `soldBy` opcional en la firma de venderProductosDesdeAgenda
//       y de registrarVenta; se escribe tal cual en el campo `soldBy` de
//       PaymentReservations (campo CMS nuevo, Texto). Vacío = sin login
//       activo; el informe lo pinta como "Administrador".
//       `staff` NO se toca: sigue siendo TIENDA / TIENDA_POS, del que
//       dependen el cierre financiero y el cruce de productos.
//       Aditivo puro: quien llame sin soldBy funciona igual que antes.
// v1.5.12: VARIANTES EN LA TIENDA STANDALONE (registrarVenta).
//       v1.5.11 dio soporte de variantes SOLO a la venta desde la
//       Agenda. La Tienda Productos (widget tiendaproductos + page code
//       Recepción | Tienda Productos) vende por registrarVenta, que
//       seguía montando catalogReference sin options.variantId → un
//       producto con variantes (250ml / 1000ml) devolvía EMPTY_CHECKOUT.
//       (1) registrarVenta acepta variantId + variantLabel OPCIONALES.
//           Si llega variantId → catalogReference.options.variantId.
//           Si NO llega y el producto tiene más de una variante →
//           error 'MISSING_VARIANT' con las variantes disponibles
//           (mismo contrato que venderProductosDesdeAgenda), en vez del
//           opaco EMPTY_CHECKOUT de Wix.
//           variantLabel se concatena al nombre en PaymentReservations:
//           "🛒 ARTEMISA CHAMPÚ · 250ml (22.45€)".
//           Sin variantId y producto simple → comportamiento idéntico
//           a v1.5.11 (100% backwards compatible).
//       (2) Se reutilizan LITERALMENTE los helpers ya validados
//           leerVariantesCrudas / normalizarVariante de v1.5.11.
//       NO se tocan listarProductos, generarFacturaProducto,
//       obtenerHistorialVentas, cargarContactosTienda,
//       venderProductosDesdeAgenda ni el bloque CMS-first.
// =====================================================

import { webMethod, Permissions } from 'wix-web-module';
import { elevate } from 'wix-auth';
import wixData from 'wix-data';
import { checkout, orderTransactions, orders } from 'wix-ecom-backend';
import { generalInfo } from 'wix-site-backend';
import { contacts } from 'wix-crm-backend';
import { invoices } from 'wix-billing-backend';
import { getProductVariants } from 'wix-stores-backend';

const TAG = '[TiendaProductos]';
const VERSION = "1.5.13";

// AppId de Wix Stores para catalogReference en eCommerce
const STORES_APP_ID = '215238eb-22a5-4c36-9e7b-e7c08025e04e';

// v1.5.6: colección CMS fuente de verdad para ventas y cobros
const COLECCION_PAGOS = 'PaymentReservations';

// v1.5.7: utilidad compartida — validación de email
const isValidEmail = (e) => typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

// =====================================================
// UTILIDADES CONTACTOS (mismo patrón que recepcionLogic)
// =====================================================

function formatearContacto(contact) {
  const infoName = contact?.info?.name || {};
  const nombre = infoName.first || contact?.name?.first || contact?.firstName || '';
  const apellido = infoName.last || contact?.name?.last || contact?.lastName || '';

  const emailsArray = contact?.info?.emails || contact?.emails || [];
  const emails = Array.isArray(emailsArray) ? emailsArray : [];
  const email = emails[0]?.email || emails[0] || contact?.primaryEmail || '';

  const phonesArray = contact?.info?.phones || contact?.phones || [];
  const phones = Array.isArray(phonesArray) ? phonesArray : [];
  const telefono = phones[0]?.phone || phones[0] || contact?.primaryPhone || '';

  return {
    contactId: contact._id || contact.id,
    nombre: String(nombre).trim(),
    apellido: String(apellido).trim(),
    nombreCompleto: `${nombre} ${apellido}`.trim(),
    email: String(email).trim(),
    telefono: String(telefono).trim()
  };
}

// =====================================================
// UTILIDADES DE VARIANTES (v1.5.11)
// =====================================================
// Patrón copiado literal de tiendaEdicionLogic.web.js (mismo salón,
// en producción): elevate(getProductVariants)(productId), y lectura
// defensiva del resultado porque Wix V1 devuelve unas veces el array
// directo y otras {items:[...]}.
//
// Wix Stores crea SIEMPRE al menos una variante por producto (la
// "default variant") aunque manageVariants sea false. Por eso el
// criterio de "producto con variantes reales" es: MÁS DE UNA variante.
// =====================================================

async function leerVariantesCrudas(productId) {
  const elevatedGetVariants = elevate(getProductVariants);
  const vResult = await elevatedGetVariants(productId);
  return Array.isArray(vResult) ? vResult : (vResult?.items || []);
}

// Normaliza una variante cruda de Wix al contrato que consume el
// widget recepcionProCMS: {variantId, label, choices, price, sku, inStock}
function normalizarVariante(v, precioProducto) {
  const variantId = v?._id || v?.id || '';
  const choices = v?.choices || v?.variant?.choices || {};

  // label = valores de las choices ("250ml", "1000ml", "Rojo · L")
  let label = '';
  try {
    const vals = Object.values(choices).filter(x => x !== null && x !== undefined && String(x).trim() !== '');
    label = vals.map(x => String(x).trim()).join(' · ');
  } catch (_) { label = ''; }
  if (!label) label = 'Variante';

  // Precio: en Wix V1 la variante expone priceData.price. Se leen los
  // paths conocidos en cascada y, como último recurso, el precio del
  // producto padre (nunca undefined hacia el widget).
  const price = Number(
    v?.variant?.priceData?.price
    ?? v?.variant?.price
    ?? v?.priceData?.price
    ?? v?.price
    ?? precioProducto
    ?? 0
  ) || 0;

  const sku = v?.variant?.sku ?? v?.sku ?? '';

  // Stock: si el seguimiento de inventario está apagado, inStock viene
  // true y quantity null. Se respeta el booleano si existe.
  let inStock = true;
  const invStatus = v?.variant?.inventoryStatus || v?.inventoryStatus || null;
  if (invStatus && typeof invStatus.inStock === 'boolean') {
    inStock = invStatus.inStock;
  } else if (typeof v?.inStock === 'boolean') {
    inStock = v.inStock;
  } else if (invStatus && typeof invStatus.quantity === 'number') {
    inStock = invStatus.quantity > 0;
  }

  return { variantId, label, choices, price: Math.round(price * 100) / 100, sku: String(sku || ''), inStock };
}

// Devuelve {variants:[], manageVariants:bool} para un producto.
// NUNCA lanza: si la lectura falla, el producto se comporta como simple
// (exactamente igual que en v1.5.10).
async function obtenerVariantesNormalizadas(productId, precioProducto) {
  try {
    const arr = await leerVariantesCrudas(productId);
    if (!Array.isArray(arr) || arr.length <= 1) {
      return { variants: [], manageVariants: false };
    }
    const variants = arr
      .map(v => normalizarVariante(v, precioProducto))
      .filter(v => v.variantId);
    return { variants, manageVariants: variants.length > 1 };
  } catch (e) {
    console.warn(`${TAG} ⚠️ getProductVariants FAIL para ${productId}:`, e.message);
    return { variants: [], manageVariants: false };
  }
}

// Ejecuta tareas en tandas para no saturar la API de Wix.
async function enTandas(lista, tamano, fn) {
  const out = [];
  for (let i = 0; i < lista.length; i += tamano) {
    const tanda = lista.slice(i, i + tamano);
    const res = await Promise.all(tanda.map(fn));
    out.push(...res);
  }
  return out;
}

// =====================================================
// 1. LISTAR PRODUCTOS (vía wixData — Stores/Products)
// =====================================================
// ── v1.5.11: + variants[] y manageVariants por producto ──
export const listarProductos = webMethod(
  Permissions.Anyone,
  async () => {
    try {
      console.log(`${TAG} 📦 Leyendo productos de la tienda...`);

      let items = [];
      let skip = 0;
      const PAGE = 100;
      let hasMore = true;

      while (hasMore) {
        const result = await wixData.query("Stores/Products")
          .include("collections")
          .limit(PAGE)
          .skip(skip)
          .find();

        const page = result.items || [];
        items = items.concat(page);
        console.log(`${TAG} 📄 Página ${skip / PAGE + 1}: ${page.length} productos (acumulado: ${items.length})`);
        hasMore = page.length === PAGE;
        skip += PAGE;
      }

      console.log(`${TAG} ✅ ${items.length} productos encontrados`);

      // Leer colecciones (categorías) disponibles
      let allCollections = [];
      try {
        const colResult = await wixData.query("Stores/Collections")
          .limit(100)
          .find();
        allCollections = (colResult.items || []).map(c => ({
          id: c._id,
          name: c.name || ''
        }));
        console.log(`${TAG} 📂 ${allCollections.length} colecciones: ${allCollections.map(c => c.name).join(', ')}`);
      } catch (colErr) {
        console.warn(`${TAG} ⚠️ No se pudieron leer Stores/Collections:`, colErr.message);
      }

      const lista = items.map(prod => {
        let prodCollections = [];
        if (Array.isArray(prod.collections)) {
          prodCollections = prod.collections.map(c => ({
            id: c._id || '',
            name: c.name || ''
          }));
        }

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
          // v1.5.11 — se rellenan más abajo. Por defecto, producto simple.
          variants: [],
          manageVariants: false
        };
      });

      // ─────────────────────────────────────────────────────────────
      // v1.5.11 — VARIANTES (tamaños de bote 250ml / 1000ml ...)
      // ─────────────────────────────────────────────────────────────
      // Wix exige catalogReference.options.variantId al vender un
      // producto con variantes. Para que el widget pueda ofrecerlas,
      // aquí se leen y se adjuntan.
      //
      // Candidatos: productos marcados en la colección como
      // manageVariants o con productOptions. Si la fila de
      // Stores/Products no expone esos campos (no hay ningún
      // candidato), se recorren TODOS los productos como red de
      // seguridad — es la única forma de garantizar que un producto
      // con dos tamaños se detecta.
      // ─────────────────────────────────────────────────────────────
      try {
        const t0v = Date.now();

        const tieneOpciones = (prod) => {
          if (prod?.manageVariants === true) return true;
          const po = prod?.productOptions;
          if (!po) return false;
          if (Array.isArray(po)) return po.length > 0;
          if (typeof po === 'object') return Object.keys(po).length > 0;
          return false;
        };

        let candidatos = items.filter(tieneOpciones);
        let modo = 'campos';
        if (candidatos.length === 0) {
          candidatos = items;
          modo = 'barrido completo';
        }
        console.log(`${TAG} 🔎 Variantes: ${candidatos.length} candidato(s) [${modo}]`);

        // Log diagnóstico de la estructura cruda (una sola vez), mismo
        // patrón que tiendaEdicionLogic usa para el coste por variante.
        if (candidatos.length) {
          try {
            const muestra = await leerVariantesCrudas(candidatos[0]._id);
            if (muestra.length) {
              console.log(`${TAG} 🔎 sample variant: ${JSON.stringify(muestra[0]).substring(0, 400)}`);
            }
          } catch (_) {}
        }

        const porId = new Map(lista.map(p => [p.id, p]));

        await enTandas(candidatos, 8, async (prod) => {
          const destino = porId.get(prod._id);
          if (!destino) return null;
          const { variants, manageVariants } = await obtenerVariantesNormalizadas(prod._id, destino.price);
          if (manageVariants) {
            destino.variants = variants;
            destino.manageVariants = true;
            console.log(`${TAG} 🎚 ${destino.name}: ${variants.length} variantes → ${variants.map(v => `${v.label} ${v.price}€`).join(' | ')}`);
          }
          return null;
        });

        const conVar = lista.filter(p => p.manageVariants).length;
        console.log(`${TAG} ✅ Variantes resueltas: ${conVar} producto(s) con variantes (${((Date.now() - t0v) / 1000).toFixed(1)}s)`);
      } catch (varErr) {
        // Best-effort: si falla, la respuesta es la de v1.5.10.
        console.warn(`${TAG} ⚠️ Bloque de variantes falló (catálogo devuelto sin variantes):`, varErr.message);
      }

      lista.forEach(p => {
        console.log(`${TAG} 📌 ${p.name} | ${p.id} | ${p.price} | stock:${p.inStock}`);
      });

      return {
        ok: true,
        total: lista.length,
        productos: lista,
        collections: allCollections
      };

    } catch (e) {
      console.error(`${TAG} ❌ listarProductos FAIL:`, e);
      return { ok: false, error: e.message };
    }
  }
);

// =====================================================
// 2. CARGAR CONTACTOS (para selector de cliente)
// =====================================================
// ── SIN CAMBIOS v1.4 ──
export const cargarContactosTienda = webMethod(
  Permissions.Anyone,
  async () => {
    try {
      console.log(`${TAG} 📇 Cargando contactos...`);

      const elevatedQuery = elevate(contacts.queryContacts);
      const allContacts = [];
      let hasMore = true;
      let skip = 0;
      const pageSize = 1000;

      while (hasMore) {
        const result = await elevatedQuery()
          .skip(skip)
          .limit(pageSize)
          .find();

        const items = result?.items || [];
        allContacts.push(...items);

        if (items.length < pageSize) {
          hasMore = false;
        } else {
          skip += pageSize;
        }

        // Límite de seguridad
        if (skip >= 10000) {
          console.warn(`${TAG} ⚠️ Límite seguridad contactos (10,000)`);
          hasMore = false;
        }
      }

      const clientes = allContacts
        .map(formatearContacto)
        .filter(c => c.nombre || c.apellido || c.email)
        .sort((a, b) => a.nombreCompleto.localeCompare(b.nombreCompleto));

      console.log(`${TAG} ✅ ${clientes.length} contactos cargados`);

      return {
        ok: true,
        version: VERSION,
        clientes,
        total: clientes.length
      };

    } catch (e) {
      console.error(`${TAG} ❌ cargarContactosTienda FAIL:`, e);
      return { ok: false, error: e.message };
    }
  }
);

// =====================================================
// 3. CREAR CONTACTO (para clientes nuevos)
// =====================================================
// ── SIN CAMBIOS v1.4 ──
export const crearContactoTienda = webMethod(
  Permissions.Anyone,
  async (payload) => {
    try {
      const { nombre, apellido, email, telefono } = payload || {};

      console.log(`${TAG} ➕ Creando contacto: ${nombre} ${apellido}`);

      if (!nombre) throw new Error('Nombre es requerido');

      const contactInfo = {
        name: {
          first: String(nombre).trim(),
          last: String(apellido || '').trim()
        },
        emails: email ? [{ email: String(email).trim() }] : [],
        phones: telefono ? [{ phone: String(telefono).trim() }] : []
      };

      const elevatedCreate = elevate(contacts.createContact);
      const newContact = await elevatedCreate(contactInfo, { allowDuplicates: true, suppressAuth: true });

      const contactId = newContact?._id || newContact?.id;
      console.log(`${TAG} ✅ Contacto creado: ${contactId}`);

      return {
        ok: true,
        contactId,
        cliente: {
          contactId,
          nombre: String(nombre).trim(),
          apellido: String(apellido || '').trim(),
          nombreCompleto: `${nombre} ${apellido || ''}`.trim(),
          email: email || '',
          telefono: telefono || ''
        }
      };

    } catch (e) {
      console.error(`${TAG} ❌ crearContactoTienda FAIL:`, e.message);
      return { ok: false, error: e.message };
    }
  }
);

// =====================================================
// 4. REGISTRAR VENTA (venta presencial en salón)
// =====================================================
// v1.4: AÑADIDO parámetro metodoPago (Efectivo/Tarjeta/Bizum)
// v1.5.7: FIX — validación email + fallback CRM + registro CMS-first
//         Mismo patrón que venderProductosDesdeAgenda (sección 7)
// v1.5.12: + variantId / variantLabel opcionales (variantes 250ml/1000ml)
// Flujo: createCheckout → createOrder → addPayments → PaymentReservations
// =====================================================
export const registrarVenta = webMethod(
  Permissions.Anyone,
  async ({ productId, productName, price, currency, quantity, contactId, contactName, contactEmail, contactPhone, metodoPago, variantId, variantLabel, soldBy }) => {
    const t0 = Date.now();
    try {
      console.log(`${TAG} 🛒 Venta: ${productName}${variantLabel ? ' · ' + variantLabel : ''} x${quantity} @ ${price}${currency || 'EUR'} | ${metodoPago || 'offline'} | contacto: ${contactId || 'anónimo'} | variantId: ${variantId || '(simple)'}`);

      if (!productId) throw new Error('productId es requerido');
      if (!price || price <= 0) throw new Error('price debe ser > 0');
      const qty = quantity || 1;
      const cur = currency || 'EUR';

      // ── 0a. v1.5.12: pre-validación de variantes ──
      // Wix Stores rechaza el checkout con EMPTY_CHECKOUT (mensaje opaco)
      // si un producto con variantes gestionadas llega sin variantId.
      // Mismo contrato de error que venderProductosDesdeAgenda v1.5.11.
      if (!variantId) {
        try {
          const arrVar = await leerVariantesCrudas(productId);
          if (Array.isArray(arrVar) && arrVar.length > 1) {
            const variantesDisponibles = arrVar
              .map(v => normalizarVariante(v, price))
              .filter(v => v.variantId);
            console.warn(`${TAG} ⛔ MISSING_VARIANT: ${productName || productId} tiene ${variantesDisponibles.length} variantes y no se envió variantId`);
            return {
              ok: false,
              error: 'MISSING_VARIANT',
              message: `Selecciona el tamaño/variante de: ${productName || productId}`,
              missingVariants: [{
                productId,
                productName: productName || '',
                variants: variantesDisponibles
              }],
              version: VERSION
            };
          }
        } catch (vErr) {
          // Si no se pueden leer las variantes, se deja continuar: el
          // comportamiento es el de v1.5.11 (Wix decidirá).
          console.warn(`${TAG} ⚠️ Pre-validación de variantes falló para ${productId}:`, vErr.message);
        }
      }

      // v1.5.12: nombre mostrado = producto + variante ("· 250ml")
      const labelVariante = (variantLabel || '').trim();
      const nombreConVariante = labelVariante
        ? `${(productName || 'Producto').trim()} · ${labelVariante}`
        : (productName || 'Producto').trim();

      // ── 0. Leer dirección del negocio (dinámica) ──
      let businessAddress;
      try {
        businessAddress = await generalInfo.getAddress();
        console.log(`${TAG} 📍 Dirección negocio:`, JSON.stringify(businessAddress));
      } catch (addrErr) {
        console.warn(`${TAG} ⚠️ No se pudo leer dirección:`, addrErr.message);
        businessAddress = { street: "Salón", city: "Madrid", country: "ES" };
      }

      // ── 1. Preparar nombres ──
      const nameParts = (contactName || 'Cliente').split(' ');
      const firstName = nameParts[0] || 'Cliente';
      const lastName = nameParts.slice(1).join(' ') || '';

      // ── 1b. v1.5.7: Email — validar y, si no es válido, buscar en CRM ──
      let emailValido = isValidEmail(contactEmail) ? contactEmail.trim() : null;
      let emailFuente = emailValido ? 'widget' : null;

      if (!emailValido && contactId) {
        try {
          const elevatedGetContact = elevate(contacts.getContact);
          const crmContact = await elevatedGetContact(contactId);
          const crmEmails = crmContact?.info?.emails || crmContact?.emails || [];
          const candidato = (Array.isArray(crmEmails) && crmEmails.length)
            ? (crmEmails[0]?.email || crmEmails[0] || '')
            : (crmContact?.primaryEmail || '');
          if (isValidEmail(candidato)) {
            emailValido = String(candidato).trim();
            emailFuente = 'crm';
            console.log(`${TAG} ✉️ Email recuperado del CRM para contactId=${contactId}`);
          }
        } catch (crmErr) {
          console.warn(`${TAG} ⚠️ No se pudo leer email del CRM (${contactId}):`, crmErr.message);
        }
      }

      console.log(`${TAG} ✉️ Email para checkout: ${emailValido || '(ninguno — solo contactId)'} [fuente: ${emailFuente || 'ninguna'}]`);

      // ── 2. Crear Checkout ──
      const contactDetails = { firstName, lastName };
      if (contactPhone) contactDetails.phone = contactPhone;

      const buyerDetails = { firstName, lastName };
      if (emailValido) buyerDetails.email = emailValido;
      if (contactPhone) buyerDetails.phone = contactPhone;

      // v1.5.12: si el producto tiene variantes, Wix exige el variantId
      // dentro de catalogReference.options. Sin él → EMPTY_CHECKOUT.
      const catalogReference = {
        appId: STORES_APP_ID,
        catalogItemId: productId
      };
      if (variantId) {
        catalogReference.options = { variantId: variantId };
      }

      const checkoutOptions = {
        lineItems: [{
          quantity: qty,
          catalogReference: catalogReference
        }],
        channelType: "POS",
        checkoutInfo: {
          billingInfo: {
            contactDetails: contactDetails,
            address: businessAddress
          },
          shippingInfo: {
            pickupDetails: {
              pickupAddress: businessAddress,
              buyerDetails: buyerDetails
            }
          }
        }
      };

      // v1.5.7: buyerInfo con email condicional (nunca '' vacío)
      if (contactId) {
        const buyerInfo = {
          contactId: contactId,
          firstName: firstName,
          lastName: lastName
        };
        if (emailValido) buyerInfo.email = emailValido;
        checkoutOptions.checkoutInfo.buyerInfo = buyerInfo;
      }

      const elevatedCreateCheckout = elevate(checkout.createCheckout);
      const checkoutResult = await elevatedCreateCheckout(checkoutOptions);

      if (!checkoutResult?._id) {
        throw new Error('No se pudo crear checkout');
      }
      console.log(`${TAG} ✅ Checkout: ${checkoutResult._id}`);

      // ── 3. Crear Order ──
      const elevatedCreateOrder = elevate(checkout.createOrder);
      const orderResult = await elevatedCreateOrder(checkoutResult._id, {
        payNow: { option: "FULL_PAYMENT_OFFLINE" }
      });

      const orderId = orderResult?.orderId || orderResult?._id || null;
      console.log(`${TAG} ✅ Order: ${orderId}`);

      // ── 4. Marcar como pagado (addPayments con status APPROVED) ──
      const totalImporte = parseFloat(price) * qty;
      if (orderId) {
        try {
          const totalAmount = totalImporte.toFixed(2);
          const elevatedAddPayments = elevate(orderTransactions.addPayments);
          await elevatedAddPayments(orderId, [{
            amount: {
              amount: totalAmount,
              currency: cur
            },
            regularPaymentDetails: {
              offlinePayment: true,
              status: "APPROVED"
            }
          }]);
          console.log(`${TAG} ✅ Pago registrado: ${totalAmount} ${cur} (${metodoPago || 'offline'})`);
        } catch (payErr) {
          console.warn(`${TAG} ⚠️ addPayments falló (order existe):`, payErr.message);
        }
      }

      // ─────────────────────────────────────────────────────────────────
      // ── 5. REGISTRAR EN PaymentReservations (staff="TIENDA_POS") ──
      // ─────────────────────────────────────────────────────────────────
      // TIENDA_POS = venta standalone desde Tienda Productos.
      // TIENDA     = venta desde Agenda (venderProductosDesdeAgenda).
      // getBookingsAgrupados solo lee "TIENDA" → la Agenda no se contamina.
      // obtenerDatosCierreDia lee "TIENDA" + "TIENDA_POS" → el cierre
      // cuenta ambas fuentes.
      // ─────────────────────────────────────────────────────────────────
      try {
        const claveCms = orderId || `prod-${Date.now()}`;

        let yaExiste = false;
        if (orderId) {
          const existente = await wixData.query(COLECCION_PAGOS)
            .eq('bookingId', orderId)
            .limit(1)
            .find();
          yaExiste = (existente.items || []).length > 0;
        }

        if (yaExiste) {
          console.log(`${TAG} ⚠️ ${COLECCION_PAGOS} ya tiene registro para orderId=${orderId}, no se duplica`);
        } else {
          const subtotal = Math.round(totalImporte * 100) / 100;
          const sufijoQty = qty > 1 ? ` x${qty}` : '';
          // v1.5.12: nombreConVariante incluye "· 250ml" cuando aplica
          const descripcionProducto = `🛒 ${nombreConVariante}${sufijoQty} (${subtotal}€)`;

          const ahora = new Date();
          const registroPago = {
            bookingId: claveCms,
            fechaReserva: ahora,
            fechaPago: ahora,
            descripcion: descripcionProducto,
            nombreCliente: (contactName || '').trim(),
            importeTotal: subtotal,
            tipoPago: metodoPago || 'Efectivo',
            staff: 'TIENDA_POS',
            contactId: contactId || '',
            soldBy: String(soldBy || '').trim()   // v1.5.13
          };

          await wixData.insert(COLECCION_PAGOS, registroPago);
          console.log(`${TAG} ✅ Venta registrada en ${COLECCION_PAGOS} [TIENDA_POS]: "${descripcionProducto}" | ${registroPago.tipoPago} | ${registroPago.importeTotal}€`);
        }
      } catch (cmsErr) {
        console.error(`${TAG} ❌ Error guardando en ${COLECCION_PAGOS}:`, cmsErr.message);
      }

      const tiempoVenta = ((Date.now() - t0) / 1000).toFixed(1);

      return {
        ok: true,
        orderId,
        checkoutId: checkoutResult._id,
        tiempoVenta,
        metodoPago: metodoPago || 'offline',
        // v1.5.12: eco de la variante vendida (el widget lo usa para la
        // factura y para el toast, sin recalcularlo)
        variantId: variantId || '',
        variantLabel: labelVariante,
        nombreConVariante
      };

    } catch (e) {
      const tiempoVenta = ((Date.now() - t0) / 1000).toFixed(1);
      console.error(`${TAG} ❌ registrarVenta FAIL:`, e.message);
      return { ok: false, error: e.message, tiempoVenta };
    }
  }
);

// =====================================================
// 5. GENERAR FACTURA PRODUCTO (Wix Invoices)
// =====================================================
// Mismo patrón que generarFactura de testCheckout.web v3.14
// Precios YA incluyen IVA 21% → calculamos base ÷ 1.21
// =====================================================
export const generarFacturaProducto = webMethod(
  Permissions.Anyone,
  async ({ contactId, email, contactName, contactPhone,
           productName, price, quantity, currency,
           metodoPago, orderId }) => {
    try {
      console.log(`${TAG} 📄 generarFacturaProducto: ${contactName} | ${productName} x${quantity} | ${price}€`);

      // ─────────────────────────────────────────────────────────────────
      // v1.5.10: ANTI-DUPLICACIÓN — comprobar si ya existe factura
      // ─────────────────────────────────────────────────────────────────
      if (orderId) {
        try {
          const existente = await wixData.query(COLECCION_PAGOS)
            .eq('bookingId', orderId)
            .limit(1)
            .find();
          const registro = (existente.items || [])[0];
          if (registro && registro.invoiceId) {
            console.log(`${TAG} 📄 Factura ya existe para orderId=${orderId}: invoiceId=${registro.invoiceId} — no se duplica`);
            // Generar previewUrl de la factura existente
            let previewUrl = null;
            try {
              const elevatedGetInvoice = elevate(invoices.getInvoice);
              const existingInvoice = await elevatedGetInvoice(registro.invoiceId);
              const elevatedPreview = elevate(invoices.createInvoicePreviewUrl);
              previewUrl = await elevatedPreview(existingInvoice.id);
            } catch (urlErr) {
              console.warn(`${TAG} ⚠️ Preview URL falló para factura existente: ${urlErr.message}`);
            }
            return {
              ok: true,
              invoiceId: registro.invoiceId,
              previewUrl: previewUrl,
              existing: true
            };
          }
        } catch (checkErr) {
          console.warn(`${TAG} ⚠️ Error comprobando factura existente:`, checkErr.message);
        }
      }

      // v1.5.8: Si contactName vacío/genérico pero hay contactId, buscar en CRM
      let resolvedName = (contactName || '').trim();
      let resolvedEmail = (email || '').trim();

      const nameIsMissing = !resolvedName || resolvedName.toLowerCase() === 'sin cliente';
      if ((nameIsMissing || !resolvedEmail) && contactId) {
        try {
          const elevatedGetContact = elevate(contacts.getContact);
          const crmContact = await elevatedGetContact(contactId);
          if (nameIsMissing) {
            const crmName = crmContact?.info?.name || {};
            const crmFirst = crmName.first || '';
            const crmLast = crmName.last || '';
            const crmFull = `${crmFirst} ${crmLast}`.trim();
            if (crmFull) {
              resolvedName = crmFull;
              console.log(`${TAG} 👤 Nombre recuperado del CRM: ${resolvedName}`);
            }
          }
          if (!resolvedEmail || !isValidEmail(resolvedEmail)) {
            const crmEmails = crmContact?.info?.emails || crmContact?.emails || [];
            const candidato = (Array.isArray(crmEmails) && crmEmails.length)
              ? (crmEmails[0]?.email || crmEmails[0] || '')
              : (crmContact?.primaryEmail || '');
            if (isValidEmail(candidato)) {
              resolvedEmail = String(candidato).trim();
              console.log(`${TAG} ✉️ Email recuperado del CRM: ${resolvedEmail}`);
            }
          }
        } catch (crmErr) {
          console.warn(`${TAG} ⚠️ No se pudo leer CRM (${contactId}):`, crmErr.message);
        }
      }

      // 1. Email: si no tiene, fallback al salón
      if (!resolvedEmail) {
        resolvedEmail = 'info@hair-times.com';
        console.log(`${TAG} ℹ️ Sin email cliente — usando fallback: ${resolvedEmail}`);
      }

      // 2. Construir lineItems — precios YA incluyen IVA 21%
      const IVA_RATE = 21;
      const IVA_DIVISOR = 1 + (IVA_RATE / 100); // 1.21

      const precioConIVA = parseFloat(price) || 0;
      const qty = quantity || 1;
      const baseImponible = Math.round((precioConIVA / IVA_DIVISOR) * 100) / 100;

      const lineItems = [{
        name: (productName || 'Producto').trim(),
        description: `POS · ${metodoPago || 'Offline'}${orderId ? ' · Pedido ' + orderId.substring(0, 8) : ''}`,
        price: baseImponible,
        quantity: qty,
        taxes: [{ name: 'IVA', rate: IVA_RATE, code: 'IVA' }]
      }];

      // 3. Construir objeto factura
      const nameParts = (resolvedName || '').split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';

      const invoiceFields = {
        title: `Venta producto ${new Date().toLocaleDateString('es-ES')}`,
        customer: {
          contactId: contactId || undefined,
          email: resolvedEmail,
          phone: contactPhone || '',
          firstName: firstName,
          lastName: lastName,
          fullName: `${firstName} ${lastName}`.trim()
        },
        currency: currency || 'EUR',
        lineItems: lineItems,
        dates: {
          issueDate: new Date(),
          dueDate: new Date()
        },
        metadata: {
          notes: 'Gracias por confiar en nosotros',
          source: 'KAMISUITE',
          sourceRefId: `tienda-${orderId || new Date().toISOString().substring(0, 10)}`
        }
      };

      console.log(`${TAG} 📄 Creando factura: ${productName} x${qty}, base=${baseImponible}€`);

      // 4. Crear factura (ELEVADO)
      const elevatedCreateInvoice = elevate(invoices.createInvoice);
      const result = await elevatedCreateInvoice(invoiceFields);
      const invoiceId = result?.id?.id || result?.id || result?._id || null;

      console.log(`${TAG} ✅ Factura creada: ${invoiceId}`);

      // 5. Registrar pago (best-effort, ELEVADO para permisos)
      const totalConIVA = precioConIVA * qty;
      try {
        const elevatedAddPayment = elevate(invoices.addPayment);
        await elevatedAddPayment(result.id, {
          type: 'Offline',
          amount: totalConIVA,
          date: new Date()
        });
        console.log(`${TAG} ✅ Pago registrado en factura`);
      } catch (payErr) {
        console.warn(`${TAG} ⚠️ Error registrando pago: ${payErr.message}`);
      }

      // 6. Preview URL (ELEVADO para permisos)
      let previewUrl = null;
      try {
        const elevatedPreview = elevate(invoices.createInvoicePreviewUrl);
        previewUrl = await elevatedPreview(result.id);
        console.log(`${TAG} ✅ Preview URL generada`);
      } catch (urlErr) {
        console.warn(`${TAG} ⚠️ Error generando preview URL: ${urlErr.message}`);
      }

      // v1.5.10: Guardar invoiceId en PaymentReservations (anti-duplicación)
      if (invoiceId && orderId) {
        try {
          const cmsResult = await wixData.query(COLECCION_PAGOS)
            .eq('bookingId', orderId)
            .limit(1)
            .find();
          const registro = (cmsResult.items || [])[0];
          if (registro) {
            registro.invoiceId = invoiceId;
            await wixData.update(COLECCION_PAGOS, registro);
            console.log(`${TAG} ✅ invoiceId guardado en ${COLECCION_PAGOS} para orderId=${orderId}`);
          }
        } catch (cmsErr) {
          console.warn(`${TAG} ⚠️ No se pudo guardar invoiceId en CMS:`, cmsErr.message);
        }
      }

      return {
        ok: true,
        invoiceId: invoiceId,
        previewUrl: previewUrl
      };

    } catch (error) {
      console.error(`${TAG} ❌ Error generarFacturaProducto:`, error);
      return { ok: false, error: error.message };
    }
  }
);

// =====================================================
// 6. HISTORIAL DE VENTAS (lee orders de eCommerce)
// =====================================================
// Usa orders.searchOrders() con filtro channelType=POS
// y appId de Stores para solo traer ventas de productos
// =====================================================
export const obtenerHistorialVentas = webMethod(
  Permissions.Anyone,
  async ({ fechaDesde, fechaHasta, limit }) => {
    try {
      console.log(`${TAG} 📊 Historial ventas: ${fechaDesde || 'inicio'} - ${fechaHasta || 'fin'}`);

      const elevatedSearch = elevate(orders.searchOrders);

      // Construir filtro
      const filterConditions = [
        { "channelInfo.type": "POS" }
      ];

      if (fechaDesde) {
        filterConditions.push({ "_createdDate": { "$gte": new Date(fechaDesde).toISOString() } });
      }
      if (fechaHasta) {
        const hasta = new Date(fechaHasta);
        hasta.setDate(hasta.getDate() + 1);
        filterConditions.push({ "_createdDate": { "$lt": hasta.toISOString() } });
      }

      const searchOptions = {
        search: {
          filter: filterConditions.length > 1
            ? { "$and": filterConditions }
            : filterConditions[0] || {},
          cursorPaging: {
            limit: limit || 50
          }
        }
      };

      const result = await elevatedSearch(searchOptions);
      const ordersData = result?.orders || [];

      console.log(`${TAG} ✅ ${ordersData.length} orders encontradas`);

      // Mapear a formato simplificado para el widget
      const ventas = ordersData.map(order => {
        const lineItem = order.lineItems?.[0] || {};

        // v1.5.8: Wix no propaga firstName/lastName de checkout a buyerInfo.
        // Intentar billingInfo → shippingInfo → buyerInfo como fallback.
        const billing = order.billingInfo?.contactDetails || {};
        const shipping = order.shippingInfo?.shipmentDetails?.address?.contactDetails
                      || order.shippingInfo?.pickupDetails?.buyerDetails || {};
        const buyer = order.buyerInfo || {};

        const resolvedFirst = billing.firstName || shipping.firstName || buyer.firstName || '';
        const resolvedLast = billing.lastName || shipping.lastName || buyer.lastName || '';
        const buyerName = `${resolvedFirst} ${resolvedLast}`.trim();
        const buyerEmail = buyer.email || '';

        return {
          orderId: order._id,
          fecha: order._createdDate,
          productName: lineItem.productName?.translated || lineItem.productName?.original || lineItem.name || 'Producto',
          quantity: lineItem.quantity || 1,
          precio: lineItem.price?.amount || lineItem.totalPrice?.amount || '0',
          currency: lineItem.price?.currency || 'EUR',
          totalOrder: order.priceSummary?.totalPrice?.amount || '0',
          clienteNombre: buyerName || 'Sin cliente',
          clienteEmail: buyerEmail,
          contactId: order.buyerInfo?.contactId || '',
          paymentStatus: order.paymentStatus || '',
          fulfillmentStatus: order.fulfillmentStatus || ''
        };
      });

      // ─────────────────────────────────────────────────────────────────
      // v1.5.10: Cruzar con PaymentReservations para obtener invoiceId
      // ─────────────────────────────────────────────────────────────────
      try {
        const orderIds = ventas.map(v => v.orderId).filter(Boolean);
        if (orderIds.length > 0) {
          const cmsResult = await wixData.query(COLECCION_PAGOS)
            .hasSome('bookingId', orderIds)
            .limit(orderIds.length)
            .find();
          const mapaInvoice = {};
          for (const item of (cmsResult.items || [])) {
            if (item.bookingId && item.invoiceId) {
              mapaInvoice[item.bookingId] = item.invoiceId;
            }
          }
          for (const venta of ventas) {
            venta.invoiceId = mapaInvoice[venta.orderId] || '';
          }
          const conFactura = Object.keys(mapaInvoice).length;
          if (conFactura > 0) {
            console.log(`${TAG} 📄 ${conFactura} ventas con factura vinculada`);
          }
        }
      } catch (cmsErr) {
        console.warn(`${TAG} ⚠️ Error cruzando invoiceId desde CMS:`, cmsErr.message);
      }

      return {
        ok: true,
        ventas,
        total: ventas.length,
        version: VERSION
      };

    } catch (e) {
      console.error(`${TAG} ❌ obtenerHistorialVentas FAIL:`, e);
      return { ok: false, error: e.message };
    }
  }
);

// =====================================================
// 7. VENDER PRODUCTOS DESDE AGENDA (Recepción PRO)
// =====================================================
// v1.5: Venta multi-línea iniciada desde la cita activa.
// Diferencias con registrarVenta (v1.4):
//   - Acepta items[] en una sola llamada (1 orden, N líneas)
//   - contactId SIEMPRE viene de la reserva activa, garantizando
//     que la venta aparece en el expediente del cliente
//   - Genera factura multi-línea (1 factura por venta, no N)
// Mismo patrón eCommerce: createCheckout → createOrder → addPayments
// Mismo patrón Invoice: createInvoice → addPayment → previewUrl
// v1.5.6: AÑADIDO bloque 7 — registro CMS-first en PaymentReservations.
//   Tras orden + factura, se inserta UN registro con staff="TIENDA"
//   como fuente de verdad. El cierre y los cards leen de aquí.
// v1.5.7: isValidEmail extraída a utilidad compartida (línea ~56)
// =====================================================
export const venderProductosDesdeAgenda = webMethod(
  Permissions.Anyone,
  async ({ contactId, contactName, contactEmail, contactPhone, items, metodoPago, currency, bookingId, packId, desglosemetodopago, soldBy }) => {
    const t0 = Date.now();
    try {
      // ── 0. Validación de entrada ──
      if (!contactId) {
        throw new Error('contactId requerido (venta desde Recepción PRO necesita cliente identificado)');
      }
      if (!Array.isArray(items) || items.length === 0) {
        throw new Error('items[] requerido (al menos un producto)');
      }
      for (const it of items) {
        if (!it.productId) throw new Error('Cada item necesita productId');
        if (!it.price || it.price <= 0) throw new Error(`Item ${it.productName || it.productId}: price debe ser > 0`);
      }

      // ── 0b. v1.5.11: pre-validación de variantes ──
      // Wix Stores rechaza el checkout con EMPTY_CHECKOUT (mensaje
      // opaco) si un producto con variantes llega sin variantId. Aquí
      // se detecta antes y se devuelve MISSING_VARIANT con la lista de
      // variantes, que el page code v1.0.13 propaga al widget.
      const missingVariants = [];
      for (const it of items) {
        if (it.variantId) continue;
        try {
          const arr = await leerVariantesCrudas(it.productId);
          if (Array.isArray(arr) && arr.length > 1) {
            missingVariants.push({
              productId: it.productId,
              productName: it.productName || '',
              variants: arr.map(v => normalizarVariante(v, it.price)).filter(v => v.variantId)
            });
          }
        } catch (vErr) {
          // Si no se pueden leer las variantes, se deja continuar: el
          // comportamiento es el de v1.5.10 (Wix decidirá).
          console.warn(`${TAG} ⚠️ Pre-validación de variantes falló para ${it.productId}:`, vErr.message);
        }
      }
      if (missingVariants.length) {
        console.warn(`${TAG} ⛔ MISSING_VARIANT: ${missingVariants.map(m => m.productName || m.productId).join(', ')}`);
        return {
          ok: false,
          error: 'MISSING_VARIANT',
          message: `Selecciona el tamaño/variante de: ${missingVariants.map(m => m.productName || m.productId).join(', ')}`,
          missingVariants,
          version: VERSION
        };
      }

      // v1.5.11: nombre mostrado = producto + variante ("· 250ml")
      const nombreConVariante = (it) => {
        const base = (it.productName || 'Producto').trim();
        const lbl = (it.variantLabel || '').trim();
        return lbl ? `${base} · ${lbl}` : base;
      };

      const cur = currency || 'EUR';
      const totalItems = items.reduce((acc, it) => acc + (it.quantity || 1), 0);
      const totalImporte = items.reduce((acc, it) => acc + (parseFloat(it.price) * (it.quantity || 1)), 0);

      console.log(`${TAG} 🛒 Venta desde Agenda: ${items.length} producto(s), ${totalItems} unidad(es), total ${totalImporte.toFixed(2)}${cur} | ${metodoPago || 'offline'} | contacto: ${contactId}`);
      console.log(`${TAG} 🛒 Trazabilidad: packId="${packId||''}" bookingId="${bookingId||''}" contactName="${contactName||''}"`);

      // ── 1. Leer dirección del negocio (dinámica) ──
      let businessAddress;
      try {
        businessAddress = await generalInfo.getAddress();
      } catch (addrErr) {
        console.warn(`${TAG} ⚠️ No se pudo leer dirección:`, addrErr.message);
        businessAddress = { street: 'Salón', city: 'Madrid', country: 'ES' };
      }

      // ── 2. Construir buyer / billing details ──
      const nameParts = (contactName || 'Cliente').split(' ');
      const firstName = nameParts[0] || 'Cliente';
      const lastName = nameParts.slice(1).join(' ') || '';

      // ── 2b. Email — validar y, si no llega válido del booking, buscar en CRM ──
      let emailValido = isValidEmail(contactEmail) ? contactEmail.trim() : null;
      let emailFuente = emailValido ? 'booking' : null;

      if (!emailValido && contactId) {
        try {
          const elevatedGetContact = elevate(contacts.getContact);
          const crmContact = await elevatedGetContact(contactId);
          const crmEmails = crmContact?.info?.emails || crmContact?.emails || [];
          const candidato = (Array.isArray(crmEmails) && crmEmails.length)
            ? (crmEmails[0]?.email || crmEmails[0] || '')
            : (crmContact?.primaryEmail || '');
          if (isValidEmail(candidato)) {
            emailValido = String(candidato).trim();
            emailFuente = 'crm';
            console.log(`${TAG} ✉️ Email recuperado del CRM para contactId=${contactId}`);
          }
        } catch (crmErr) {
          console.warn(`${TAG} ⚠️ No se pudo leer email del CRM (${contactId}):`, crmErr.message);
        }
      }

      console.log(`${TAG} ✉️ Email para checkout: ${emailValido || '(ninguno — solo contactId)'} [fuente: ${emailFuente || 'ninguna'}]`);

      const contactDetails = { firstName, lastName };
      if (contactPhone) contactDetails.phone = contactPhone;

      const buyerDetails = { firstName, lastName };
      if (emailValido) buyerDetails.email = emailValido;
      if (contactPhone) buyerDetails.phone = contactPhone;

      // ── 3. Crear Checkout multi-línea ──
      const buyerInfo = {
        contactId: contactId,
        firstName: firstName,
        lastName: lastName
      };
      if (emailValido) buyerInfo.email = emailValido;

      const checkoutOptions = {
        lineItems: items.map(it => {
          // v1.5.11: si el item trae variantId, Wix lo exige dentro de
          // catalogReference.options. Sin él → EMPTY_CHECKOUT.
          const catalogReference = {
            appId: STORES_APP_ID,
            catalogItemId: it.productId
          };
          if (it.variantId) {
            catalogReference.options = { variantId: it.variantId };
          }
          return {
            quantity: it.quantity || 1,
            catalogReference
          };
        }),
        channelType: 'POS',
        buyerNote: `[KAMISUITE]${JSON.stringify({
          packId: packId || '',
          bookingId: bookingId || '',
          contactName: (contactName || '').trim(),
          metodoPago: metodoPago || 'Efectivo'
        })}`,
        checkoutInfo: {
          buyerInfo: buyerInfo,
          billingInfo: {
            contactDetails: contactDetails,
            address: businessAddress
          },
          shippingInfo: {
            pickupDetails: {
              pickupAddress: businessAddress,
              buyerDetails: buyerDetails
            }
          }
        }
      };

      const elevatedCreateCheckout = elevate(checkout.createCheckout);
      const checkoutResult = await elevatedCreateCheckout(checkoutOptions);

      if (!checkoutResult?._id) {
        throw new Error('No se pudo crear checkout');
      }
      console.log(`${TAG} ✅ Checkout: ${checkoutResult._id}`);

      // ── 4. Crear Order ──
      const elevatedCreateOrder = elevate(checkout.createOrder);
      const orderResult = await elevatedCreateOrder(checkoutResult._id, {
        payNow: { option: 'FULL_PAYMENT_OFFLINE' }
      });
      const orderId = orderResult?.orderId || orderResult?._id || null;
      console.log(`${TAG} ✅ Order: ${orderId}`);

      // ── 5. Marcar como pagado (addPayments con status APPROVED) ──
      if (orderId) {
        try {
          const totalAmount = totalImporte.toFixed(2);
          const elevatedAddPayments = elevate(orderTransactions.addPayments);
          await elevatedAddPayments(orderId, [{
            amount: { amount: totalAmount, currency: cur },
            regularPaymentDetails: { offlinePayment: true, status: 'APPROVED' }
          }]);
          console.log(`${TAG} ✅ Pago registrado: ${totalAmount} ${cur} (${metodoPago || 'offline'})`);
        } catch (payErr) {
          console.warn(`${TAG} ⚠️ addPayments falló (order existe):`, payErr.message);
        }
      }

      // ── 6. Generar factura multi-línea (best-effort) ──
      // Precios YA incluyen IVA 21% → base imponible ÷ 1.21
      let invoiceId = null;
      let previewUrl = null;
      try {
        const emailFactura = emailValido || 'info@hair-times.com';
        if (!emailValido) {
          console.log(`${TAG} ℹ️ Sin email cliente — factura usa fallback: ${emailFactura}`);
        }

        const IVA_RATE = 21;
        const IVA_DIVISOR = 1 + (IVA_RATE / 100);

        const lineItems = items.map(it => {
          const precioConIVA = parseFloat(it.price) || 0;
          const qty = it.quantity || 1;
          const baseImponible = Math.round((precioConIVA / IVA_DIVISOR) * 100) / 100;
          return {
            name: nombreConVariante(it),
            description: `POS · ${metodoPago || 'Offline'}${orderId ? ' · Pedido ' + orderId.substring(0, 8) : ''}`,
            price: baseImponible,
            quantity: qty,
            taxes: [{ name: 'IVA', rate: IVA_RATE, code: 'IVA' }]
          };
        });

        const invoiceFields = {
          title: `Venta producto ${new Date().toLocaleDateString('es-ES')}`,
          customer: {
            contactId: contactId,
            email: emailFactura,
            phone: contactPhone || '',
            firstName: firstName,
            lastName: lastName,
            fullName: `${firstName} ${lastName}`.trim()
          },
          currency: cur,
          lineItems: lineItems,
          dates: { issueDate: new Date(), dueDate: new Date() },
          metadata: {
            notes: 'Gracias por confiar en nosotros',
            source: 'KAMISUITE',
            sourceRefId: `agenda-${orderId || new Date().toISOString().substring(0, 10)}`
          }
        };

        const elevatedCreateInvoice = elevate(invoices.createInvoice);
        const invResult = await elevatedCreateInvoice(invoiceFields);
        invoiceId = invResult?.id?.id || invResult?.id || invResult?._id || null;
        console.log(`${TAG} ✅ Factura creada: ${invoiceId}`);

        try {
          const elevatedAddPayment = elevate(invoices.addPayment);
          await elevatedAddPayment(invResult.id, {
            type: 'Offline',
            amount: totalImporte,
            date: new Date()
          });
        } catch (payErr) {
          console.warn(`${TAG} ⚠️ Pago factura falló: ${payErr.message}`);
        }

        try {
          const elevatedPreview = elevate(invoices.createInvoicePreviewUrl);
          previewUrl = await elevatedPreview(invResult.id);
        } catch (urlErr) {
          console.warn(`${TAG} ⚠️ Preview URL falló: ${urlErr.message}`);
        }

      } catch (invErr) {
        console.warn(`${TAG} ⚠️ Factura falló (orden persistió):`, invErr.message);
      }

      // ─────────────────────────────────────────────────────────────────
      // ── 7. v1.5.6: REGISTRAR EN PaymentReservations (CMS-first) ──
      // ─────────────────────────────────────────────────────────────────
      // Esta es la fuente de verdad de KAMISUITE para ventas y cobros.
      // El cierre del día, el card de la cita y el expediente leen de
      // PaymentReservations (NO de Wix Stores).
      //
      // Convención del registro de venta de producto:
      //   staff: "TIENDA"        (discriminador producto vs servicio)
      //   descripcion: "🛒 Producto1 (X€), 🛒 Producto2 (Y€)"
      //                          (cada token con prefijo 🛒 y precio en €)
      //   bookingId: orderId Wix (trazabilidad fiscal con la orden POS)
      //
      // Anti-duplicado: si ya existe un registro con bookingId=orderId,
      // no se inserta de nuevo (protege contra reintentos).
      // ─────────────────────────────────────────────────────────────────
      try {
        const claveCms = orderId || `prod-${Date.now()}`;

        // Anti-duplicado por orderId
        let yaExiste = false;
        if (orderId) {
          const existente = await wixData.query(COLECCION_PAGOS)
            .eq('bookingId', orderId)
            .limit(1)
            .find();
          yaExiste = (existente.items || []).length > 0;
        }

        if (yaExiste) {
          console.log(`${TAG} ⚠️ ${COLECCION_PAGOS} ya tiene registro para orderId=${orderId}, no se duplica`);
        } else {
          // Construir descripción: "🛒 Producto1 (X€), 🛒 Producto2 (Y€)"
          const descripcionProductos = items.map(it => {
            const nombre = nombreConVariante(it);   // v1.5.11: "MARCA · 250ml"
            const qty = it.quantity || 1;
            const precioUnit = parseFloat(it.price) || 0;
            const subtotal = Math.round(precioUnit * qty * 100) / 100;
            const sufijoQty = qty > 1 ? ` x${qty}` : '';
            return `🛒 ${nombre}${sufijoQty} (${subtotal}€)`;
          }).join(', ');

          const ahora = new Date();
          const registroPago = {
            bookingId: claveCms,
            fechaReserva: ahora,
            fechaPago: ahora,
            descripcion: descripcionProductos,
            nombreCliente: (contactName || '').trim(),
            importeTotal: Math.round(totalImporte * 100) / 100,
            tipoPago: metodoPago || 'Efectivo',
            staff: 'TIENDA',
            contactId: contactId || '',
            desglosemetodopago: desglosemetodopago || '',
            invoiceId: invoiceId || '',
            soldBy: String(soldBy || '').trim()   // v1.5.13
          };

          await wixData.insert(COLECCION_PAGOS, registroPago);
          console.log(`${TAG} ✅ Venta registrada en ${COLECCION_PAGOS}: "${descripcionProductos}" | ${registroPago.tipoPago} | ${registroPago.importeTotal}€`);
        }
      } catch (cmsErr) {
        // Best-effort: si falla el CMS, la orden Wix sigue persistida.
        // Pero queremos un error visible en logs porque el cierre del día
        // depende de este registro.
        console.error(`${TAG} ❌ Error guardando en ${COLECCION_PAGOS}:`, cmsErr.message);
      }

      const tiempoVenta = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(`${TAG} ✅ Venta agenda completada: ${orderId} (${tiempoVenta}s)`);

      return {
        ok: true,
        orderId,
        invoiceId,
        previewUrl,
        checkoutId: checkoutResult._id,
        total: parseFloat(totalImporte.toFixed(2)),
        currency: cur,
        itemCount: items.length,
        unitCount: totalItems,
        metodoPago: metodoPago || 'offline',
        tiempoVenta,
        version: VERSION
      };

    } catch (e) {
      const tiempoVenta = ((Date.now() - t0) / 1000).toFixed(1);
      console.error(`${TAG} ❌ venderProductosDesdeAgenda FAIL:`, e.message);
      return { ok: false, error: e.message, tiempoVenta };
    }
  }
);
