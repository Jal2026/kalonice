// =====================================================
// BACKEND cierreLogicExtendido.web.js — KAMISUITE v1.1.9
// =====================================================
// v1.1.9 (5 ago 2026): "Servicios del día" muestra el PRECIO DE TARIFA.
//      Cada línea salía con el neto prorrateado (precio × factor
//      neto/bruto del pago), de modo que un ajuste en el cobro o un
//      descuento repartía céntimos entre todos los servicios y se leían
//      cosas como "Puntos de Luz 46,77€" cuando en la ficha de la cita
//      pone 57€. Aritméticamente correcto, ilegible en la práctica: ese
//      bloque es el catálogo de lo que se ha hecho, no el desglose de lo
//      que ha entrado.
//      Ahora cada servicio se lista a su precio real (precio × cantidad).
//      Dónde vive cada cifra a partir de aquí:
//        · Servicios del día      → tarifa, lo que se ha trabajado.
//        · Clientes del día       → neto cobrado por cita (el ticket).
//        · Productividad por staff→ neto cobrado (el dinero).
//      Por eso el total de un profesional en Servicios puede ser mayor
//      que en Productividad cuando ha habido descuento o ajuste: la
//      diferencia es justo lo que no se cobró.
//
// v1.1.8 (5 ago 2026): COBROS DE OTROS DÍAS + OBSERVATORIO SEMANAL.
//
//   A) `reconciliacion.cobrosDeOtrosDias` se enriquece con hora, método,
//      quién cobró y la FECHA DE LA CITA a la que corresponde el cobro
//      (una query por lote sobre las reservas referenciadas). Sin eso el
//      bloque decía que había un descuadre pero no de qué cita venía.
//
//   B) NEW `obtenerObservatorioSemanal({ fechaISO })` — semana natural
//      lunes→domingo que contiene esa fecha. Por cada día: cobrado en
//      tarjeta, efectivo, bizum, otros y total, más el estado de cuadre
//      de los tres métodos:
//        · EFECTIVO  → cuadra si el CashRegister de ese día existe, está
//          arqueado (status 'saved' o 'closed') y su `difference` es 0.
//        · TARJETA   → cuadra si `cardConfirmed` es true (alguien ha
//          confirmado que la lectura del datáfono coincide).
//        · BIZUM     → cuadra si `bizumConfirmed` es true.
//      Un método sin cobros ese día no se marca pendiente: no hay nada
//      que cuadrar. Los días futuros tampoco.
//      Requiere los campos `cardConfirmed` y `bizumConfirmed` (Booleano)
//      en CashRegister, que escribe cashRegisterLogic v1.1.4.
//
// v1.1.7 (5 ago 2026): "COBRADO POR STAFF" PASA A SER "QUIÉN COBRÓ".
//      Ese bloque agrupaba por `PaymentReservations.staff`, que guarda el
//      TITULAR de la cita — la columna del calendario —, no la persona que
//      pasó el cobro. Con el salón trabajando sin capa de acceso el reparto
//      era directamente ficticio: repartía entre las tres profesionales
//      cobros que nadie identificado hizo.
//      Ahora agrupa por `soldBy` (empleado logueado, lo graban
//      recepcionProLogic v1.0.48 para los cobros de cita y tiendaProductos
//      v1.5.13 para los productos). Vacío → cajón único "Administrador",
//      que es exactamente lo que corresponde a un día sin login y a todo
//      el histórico anterior a este cambio.
//      · `staff` sigue intacto en el CMS y se sigue usando para lo que sí
//        es: detectar externos y su comisión, y las ventas de ESPECIALES.
//      · Ningún cobro queda fuera del bloque: se elimina la exclusión de
//        TIENDA_POS, que dejaba ventas de la tienda standalone sin sumar en
//        el agregado aunque sí contaran en el total del día.
//      · rendimiento.clientes[].cobradoPor — quién cobró esa cita.
//      · rendimiento.serviciosPorStaff[].servicios[].hora — hora de la
//        fase en el calendario, para localizar el servicio de un vistazo.
//
// v1.1.6 (5 ago 2026): ATRIBUCIÓN POR FASE + DETALLE DE VENTAS.
//
//   A) EL INFORME MENTÍA SOBRE QUIÉN TRABAJA. Hasta v1.1.5,
//      procesarRendimiento agrupaba por `reserva.staffName`, el titular
//      del pack. Pero en KAMISUITE cada FASE lleva su propio `staffId`:
//      arrastrar una fase a otra columna la reasigna. El calendario
//      pinta por fase; el informe contaba por titular. Resultado real
//      del 5-ago-2026: Verónica salía con 2 citas cuando su columna
//      tenía 4 clientas (dos fases suyas vivían en packs titulados a
//      nombre de Alejandra y de Erica), y a la vez se le imputaban tres
//      fases de Mery Perona que ejecutó Alejandra.
//      Cambio: la unidad de atribución pasa a ser la LÍNEA de servicio.
//      Cada línea de `serviciosDetail` se cruza con su fase ocupante del
//      mismo label (alineando por número de ocurrencia, igual que hacen
//      quitarItemReserva y setLineWeight en recepcionProLogic) y su
//      importe se imputa al `staffId` de esa fase, resuelto contra
//      StaffConfig.wixResourceId. Sin fase propia → titular del pack.
//      Los importes se escalan por el factor neto/bruto del pago, de
//      modo que la suma por staff sigue cuadrando al céntimo con lo
//      cobrado, descuentos incluidos.
//
//   B) PRODUCTO Y SERVICIO DEJAN DE MEZCLARSE. El total de la línea de
//      cliente ya no arrastra los productos vendidos: `total` es solo
//      servicios + extras, y los productos salen en su propio detalle
//      con cliente, concepto e importe.
//
//   C) NUEVO EN EL RETURN (aditivo; nada existente cambia de nombre):
//      · rendimiento.serviciosPorStaff[] — servicios agregados por
//        profesional.
//      · rendimiento.clientesPorStaff[]  — clientas por profesional.
//      · rendimiento.clientes[].metodoPago — método de cobro de la cita.
//      · rendimiento.clientes[].staffs[]   — profesionales que la
//        atendieron (una cita repartida sale en las dos columnas).
//      · rendimiento.pendientes[] — servicios sin cobrar del día, con
//        cliente, servicio y staff, para el bloque del cierre.
//      · cierre.productosDetalle[] — una entrada por producto vendido
//        con cliente, importe, método y `soldBy` (empleado logueado que
//        despachó; vacío → el widget pinta "Administrador").
//      · cierre.especiales[].hora.
//
// v1.1.5 (4 ago 2026): DETALLE DE ESPECIALES en el Cierre Financiero.
//      Las ventas manuales de productos comerciales (Bono 🎟️, Tarjeta
//      PRIME ⭐, Tarjeta promocional 🎁) hechas desde Recepción PRO se
//      registran en PaymentReservations con staff='ESPECIALES'
//      (especialesVentaLogic v1.0.1 · registrarCobroEspecial). Hasta
//      ahora entraban en TOTAL COBRADO REAL, en "Cobrado por método de
//      pago", en el desglose de IVA y como una línea agregada
//      "ESPECIALES · N cobros" en "Cobrado por staff", pero NO se veía
//      QUÉ se había vendido ni A QUIÉN: la sección "Productos cobrados
//      hoy" se construye con parsearProductos, que solo reconoce tokens
//      con prefijo 🛒, y los especiales usan 🎟️ / ⭐ / 🎁.
//      Cambio: procesarCierre acumula además `especiales[]` (una entrada
//      por cada fila de pago con staff='ESPECIALES') con cliente,
//      concepto (la descripcion tal cual la escribió la venta), importe
//      y método de pago, más `especialesTotal`.
//      NO se altera ningún cálculo previo: el importe ya sumaba en
//      totalReal, porMetodo, IVA y staffAgg y sigue sumando exactamente
//      igual. La línea "ESPECIALES" de "Cobrado por staff" se mantiene
//      (solo TIENDA_POS está excluida de ese agregado) para que el
//      bloque siga cuadrando con el total.
//      Aditivo puro: dos campos nuevos en el return de procesarCierre.
//      Un widget antiguo que no los lea sigue funcionando igual.
//
// v1.1.4 (14 jun 2026): FILTRADO DE BLOQUEOS del informe del día.
//      Los bloqueos manuales del calendario (family='BLOQUEO' /
//      clientName con prefijo 'BLOQUEO:Almuerzo', etc.) creados por el
//      backend recepcionProLogic v1.0.20+ NO son citas reales: son
//      tramos de tiempo ocupado sin cliente, sin precio y sin staffName.
//      Si entraban en el informe, contaminaban:
//        · clientes del día → aparecería "Almuerzo · PDTE 0€" como cliente
//        · servicios del día → 0€ raros
//        · productividad por staff → bloqueos contados como citas
//      Filtro doble defensivo (family Y prefijo de clientName) por
//      compat con filas legacy.
//      Único cambio: 12 líneas tras Q1, antes de procesar reservas.
//
// v1.1.3 (10 jun 2026): FIX slice del prefijo bookingId.
//      v1.1.2 cambió "PAGO_" (5 chars) por "KRI_" (4 chars) pero
//      olvidé ajustar slice(5) → slice(4). Resultado: la reservaId
//      extraída perdía su primera letra y el lookup en pagosPorReserva
//      nunca encontraba match → Rendimiento seguía mostrando bruto.
//      Cambio: 3 ocurrencias slice(5) → slice(4).
//
// v1.1.2 (10 jun 2026): FIX prefijo bookingId.
//      El backend de cobro usa `KRI_<reservaId>` (Kamisuite Reservations
//      Internas), no `PAGO_<reservaId>`. Q2.5 y Q3 buscaban con el
//      prefijo incorrecto → `pagosPorReserva` quedaba vacío → en
//      Rendimiento Productivo no se aplicaba el neto y los descuentos
//      no se reflejaban en la sección "Clientes del día".
//      Cambio quirúrgico: 3 ocurrencias de "PAGO_" → "KRI_" en
//      procesarReconciliacion y en la carga de pagosPorReserva.
//
// v1.1.1 (10 jun 2026): Rendimiento Productivo muestra precio NETO
//      (con descuento aplicado) en lugar del bruto. Cierre Financiero
//      añade sección "Descuentos aplicados" parseando el token
//      "🏷️ Descuento ..." de PaymentReservations.descripcion.
//      Implementación:
//      (1) Q2.5 nueva: pagosPorReserva — pagos asociados a las
//          reservas del día (cualquier fecha) cargados en una query.
//      (2) procesarRendimiento recibe el mapa y para cada reserva
//          PAGADO usa pago.importeTotal como neto, calcula descuento
//          desde la descripción y lo añade a descuentos[].
//      (3) procesarCierre parsea la descripción de cada pago del día
//          y agrega descuentos[]/descuentoTotal al return.
//      (4) procesarReconciliacion reusa pagosPorReserva sin repetir
//          la query.
//      (5) Helper parsearDescuentoEnDescripcion soporta los dos
//          formatos: "-50% (-19.75€)" (modo %) y "-25€" (modo €).
//
// v1.1.0 (9 jun 2026): Informe del día partido en DOS BLOQUES + RECONCILIACIÓN.
// Informe del día partido en DOS BLOQUES + RECONCILIACIÓN:
//
//   1) RENDIMIENTO PRODUCTIVO (filtra por fechaReserva)
//      Trabajo del salón en el día. Si la cita está en calendario,
//      computa (cancelarla la saca). Responde "¿qué se trabaja hoy?"
//      → cobrado, pendiente, total, clientes, servicios, descuentos,
//        productividad por staff, productos vendidos con/sin cita,
//        servicios externos (bruto).
//
//   2) CIERRE FINANCIERO (filtra por fechaPago)
//      Dinero que entró en caja hoy. Responde "¿qué entró hoy?"
//      → total real, por método de pago, IVA, productividad por staff,
//        productos vendidos, comisiones externos.
//
//   3) RECONCILIACIÓN
//      Cruza Q1 vs Q2 para explicar diferencias:
//      · Citas del día cobradas en otro día (rendimiento sí, cierre no).
//      · Cobros de hoy de citas pasadas o futuras (cierre sí, rendimiento no).
//
// Versión: 1.1.0
// Fecha: 10 de junio de 2026
// =====================================================

import { Permissions, webMethod } from 'wix-web-module';
import wixData from 'wix-data';

const TAG = '[CierreExt v1.1.9]';
const COLECCION_PAGOS    = 'PaymentReservations';
const COLECCION_RESERVAS = 'KamisuiteReservations';
const COLECCION_STAFF    = 'StaffConfig';
const COLECCION_CONFIG   = 'SalonConfig';

// v1.1.5 — Etiqueta de staff que escribe especialesVentaLogic en
// PaymentReservations.staff para las ventas manuales de Bono / PRIME /
// Tarjeta promocional. Debe coincidir con STAFF_ESPECIALES de ese backend.
const STAFF_ESPECIALES = 'ESPECIALES';

// =====================================================
// HELPERS COMUNES
// =====================================================
function desglosarIVA(importe, rate) {
  const divisor = 1 + (rate / 100);
  const base = Math.round((importe / divisor) * 100) / 100;
  const cuota = Math.round((importe - base) * 100) / 100;
  return { base, cuota };
}

async function leerVatRate() {
  try {
    const r = await wixData.query(COLECCION_CONFIG).limit(1).find({ suppressAuth: true });
    if (r.items.length > 0) {
      const v = Number(r.items[0].vatRate);
      if (!isNaN(v) && v > 0) return v;
    }
  } catch (e) {
    console.warn(`${TAG} Error leyendo vatRate:`, e.message);
  }
  return 21;
}

function extraerPropinasDeDescripcion(descripcion) {
  if (!descripcion) return 0;
  let total = 0;
  const tokens = String(descripcion).split(/,\s*/);
  for (const raw of tokens) {
    const token = raw.trim();
    if (!token.startsWith('✏️')) continue;
    if (!token.toUpperCase().includes('PROPINA')) continue;
    const m = token.match(/\(\s*([\d.,]+)\s*€?\s*\)\s*$/);
    if (m) total += parseFloat(m[1].replace(',', '.')) || 0;
  }
  return Math.round(total * 100) / 100;
}

// Extrae servicios facturables ignorando fases con precio 0 y productos 🛒
function extraerServiciosFacturables(descripcion) {
  if (!descripcion) return [];
  const out = [];
  const tokens = String(descripcion).split(/,\s*/);
  for (const raw of tokens) {
    const token = raw.trim();
    if (!token) continue;
    if (token.startsWith('🛒')) continue;
    const m = token.match(/^(.+?)\s*\(\s*([\d.,]+)\s*€?\s*\)\s*$/);
    if (!m) continue;
    const nombre = m[1].trim();
    const precio = parseFloat(m[2].replace(',', '.')) || 0;
    if (precio <= 0) continue;
    out.push({ nombre, precio });
  }
  return out;
}

// v1.1.1: Extrae descuento del token "🏷️ Descuento ..." en descripcion de PaymentReservations
// Formatos soportados:
//   "🏷️ Descuento -50% (-19.75€)"   → {discPct:50, discEur:19.75, label:"-50%"}
//   "🏷️ Descuento -25€"             → {discPct:0,  discEur:25,    label:"-25€"}
function parsearDescuentoEnDescripcion(descripcion) {
  if (!descripcion) return { discPct: 0, discEur: 0, label: '' };
  const tokens = String(descripcion).split(/,\s*/);
  for (const raw of tokens) {
    const t = raw.trim();
    const tLower = t.toLowerCase();
    if (!t.startsWith('🏷') && !tLower.includes('descuento')) continue;
    // Patrón porcentaje con eur entre paréntesis:  -50% (-19.75€)
    const m1 = t.match(/-\s*([\d.,]+)\s*%\s*\(\s*-\s*([\d.,]+)\s*€?\s*\)/);
    if (m1) {
      const pct = parseFloat(m1[1].replace(',', '.')) || 0;
      const eur = parseFloat(m1[2].replace(',', '.')) || 0;
      return { discPct: pct, discEur: eur, label: `-${pct}%` };
    }
    // Patrón porcentaje sin paréntesis:  -50%
    const m1b = t.match(/-\s*([\d.,]+)\s*%/);
    if (m1b) {
      const pct = parseFloat(m1b[1].replace(',', '.')) || 0;
      return { discPct: pct, discEur: 0, label: `-${pct}%` };
    }
    // Patrón importe fijo:  -25€
    const m2 = t.match(/-\s*([\d.,]+)\s*€/);
    if (m2) {
      const eur = parseFloat(m2[1].replace(',', '.')) || 0;
      return { discPct: 0, discEur: eur, label: `-${eur}€` };
    }
  }
  return { discPct: 0, discEur: 0, label: '' };
}

// Extrae productos 🛒 de una descripción
function parsearProductos(descripcion) {
  if (!descripcion) return [];
  const out = [];
  const tokens = String(descripcion).split(/,\s*/);
  for (const raw of tokens) {
    const token = raw.trim();
    if (!token.startsWith('🛒')) continue;
    const m = token.match(/^🛒\s*(.+?)\s*\(\s*([\d.,]+)\s*€?\s*\)\s*$/);
    if (!m) continue;
    let nombre = m[1].trim();
    const subtotal = parseFloat(m[2].replace(',', '.')) || 0;
    let cantidad = 1;
    const qty = nombre.match(/^(.+?)\s+x(\d+)\s*$/i);
    if (qty) {
      nombre = qty[1].trim();
      cantidad = parseInt(qty[2], 10) || 1;
    }
    const precioUnit = cantidad > 0 ? subtotal / cantidad : subtotal;
    out.push({ nombre, cantidad, subtotal, precioUnit });
  }
  return out;
}

// Parsea serviciosDetail de KamisuiteReservations ("name|price|cant;;name|price|cant")
function parsearServiciosDetail(detalle) {
  if (!detalle) return { servicios: [], productos: [], extras: [], descuento: 0 };
  const servicios = [];
  const productos = [];
  const extras = [];
  let descuento = 0;
  const items = String(detalle).split(';;').filter(Boolean);
  for (const raw of items) {
    const t = raw.trim();
    if (!t) continue;
    const [labelRaw, priceRaw, cantRaw] = t.split('|');
    const label = (labelRaw || '').trim();
    const price = parseFloat(String(priceRaw || '0').replace(',', '.')) || 0;
    const cant  = parseInt(cantRaw || '1', 10) || 1;
    if (label.startsWith('🛒')) {
      productos.push({ nombre: label.replace(/^🛒\s*/, '').trim(), precio: price, cantidad: cant, subtotal: Math.round(price * cant * 100) / 100 });
    } else if (label.startsWith('[EXTRA]')) {
      extras.push({ concepto: label.replace(/^\[EXTRA\]\s*/, '').trim(), importe: price });
    } else if (label.toLowerCase().includes('descuento') || label.startsWith('[DESC]')) {
      descuento += Math.abs(price);
    } else {
      if (price > 0) servicios.push({ nombre: label, precio: price, cantidad: cant });
    }
  }
  return { servicios, productos, extras, descuento };
}

async function cargarStaff() {
  try {
    const r = await wixData.query(COLECCION_STAFF).limit(100).find({ suppressAuth: true });
    return r.items || [];
  } catch (e) {
    console.warn(`${TAG} Error cargando StaffConfig:`, e.message);
    return [];
  }
}

function horaMadrid(d) {
  if (!d) return '';
  const dd = (d instanceof Date) ? d : new Date(d);
  return dd.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/Madrid' });
}

// v1.1.6 — Desenvuelve un campo JSON del CMS que puede llegar como objeto
// {items:[...]}, como string JSON o como array pelado. Mismo criterio que
// jsonIn de recepcionProLogic.
function itemsDe(v, key) {
  if (!v) return [];
  let o = v;
  if (typeof o === 'string') {
    try { o = JSON.parse(o); } catch (_) { return []; }
  }
  if (Array.isArray(o)) return o;
  if (o && Array.isArray(o[key])) return o[key];
  return [];
}

// v1.1.6 — Reparte las líneas de servicio de una reserva entre las
// profesionales que las ejecutaron.
//
// El calendario asigna staff POR FASE. Una línea de `serviciosDetail` se
// corresponde con la fase ocupante `tipo:'servicio'` que lleva el mismo
// label; cuando el mismo servicio aparece dos veces en la cita, se alinean
// por número de ocurrencia. De esa fase sale el `staffId`, que se resuelve
// contra StaffConfig.wixResourceId. Si la fase no lleva staffId propio (lo
// normal cuando nadie la ha movido de columna), manda el titular del pack.
//
// Devuelve un Map staffName → { servicios:[{nombre,cantidad,precio}], bruto }.
function repartirLineasPorStaff(reserva, servicios, staffPorResourceId) {
  const titular = String(reserva.staffName || 'Sin staff').trim() || 'Sin staff';
  const fasesSvc = itemsDe(reserva.fases, 'items').filter(f => f && f.tipo === 'servicio');
  const vistas = {};
  const out = new Map();

  for (const sv of servicios) {
    const lab = String(sv.nombre || '').trim();
    const occ = vistas[lab] || 0;
    vistas[lab] = occ + 1;

    let quien = titular;
    let inicio = null;          // v1.1.7 — hora de la fase en el calendario
    if (lab) {
      let seen = 0;
      for (const f of fasesSvc) {
        if (String(f.label || '').trim() !== lab) continue;
        if (seen === occ) {
          const sid = String(f.staffId || '').trim();
          if (sid && staffPorResourceId[sid]) quien = staffPorResourceId[sid];
          if (f.start) inicio = f.start;
          break;
        }
        seen++;
      }
    }
    if (!inicio) inicio = reserva.fechaReserva || null;

    if (!out.has(quien)) out.set(quien, { servicios: [], bruto: 0 });
    const bucket = out.get(quien);
    bucket.servicios.push({
      nombre: sv.nombre,
      cantidad: sv.cantidad,
      precio: sv.precio,
      hora: horaMadrid(inicio),
      fechaMs: inicio ? new Date(inicio).getTime() : 0
    });
    bucket.bruto = Math.round((bucket.bruto + sv.precio * sv.cantidad) * 100) / 100;
  }

  // Cita sin líneas parseables (todo a 0€, solo extras, etc.): el titular
  // sigue siendo responsable de la clienta y debe aparecer en su columna.
  if (!out.size) out.set(titular, { servicios: [], bruto: 0 });
  return out;
}

// =====================================================
// Q1 — RENDIMIENTO PRODUCTIVO
// =====================================================
function procesarRendimiento(reservas, staffList, pagosPorReserva = {}) {
  const staffMap = {};
  // v1.1.6 — wixResourceId → nombre. Es el identificador que guardan las
  // fases en `staffId` (recepcionProLogic resuelve el nombre por este mismo
  // campo desde v1.0.0).
  const staffPorResourceId = {};
  for (const s of staffList) {
    const nombre = (s.displayName || s.canonicalName || '').trim();
    const key = nombre.toUpperCase();
    if (key) staffMap[key] = {
      isExternal: !!s.isExternal,
      commissionPct: Number(s.commissionPercentage) || 0
    };
    const rid = String(s.wixResourceId || '').trim();
    if (rid && nombre) staffPorResourceId[rid] = nombre;
  }

  let cobrado = 0, pendiente = 0;
  const clientesCobrados = new Set();
  const clientesPendientes = new Set();
  const serviciosAgg = new Map();
  const descuentosArr = [];
  const staffAgg = new Map();
  const productosAgg = new Map();
  const externosArr = [];
  const clientesLista = [];
  // v1.1.6 — vistas por profesional (atribución por fase)
  const svcPorStaff = new Map();      // staffName → Map(nombre → agg)
  const cliPorStaff = new Map();      // staffName → array de clientas
  const pendientesArr = [];           // servicios sin cobrar del día

  for (const r of reservas) {
    const isPagado = r.status === 'PAGADO';
    const isPendiente = r.status === 'CONFIRMADA';
    if (!isPagado && !isPendiente) continue;

    const bruto = Number(r.precioTotal) || 0;
    const claveCli = r.contactId || r.clientPhone || r.clientName || r._id;
    const staffName = (r.staffName || 'Sin staff').trim();
    const staffKey = staffName.toUpperCase();
    const staffInfo = staffMap[staffKey] || { isExternal: false, commissionPct: 0 };

    const parsed = parsearServiciosDetail(r.serviciosDetail || '');

    // v1.1.1: si pagada y hay pago asociado, usar importeTotal del pago (NETO con descuento aplicado)
    let netoPago = null;
    let descInfo = null;
    let metodoPago = '';
    let cobradoPor = '';        // v1.1.7
    if (isPagado) {
      const pago = pagosPorReserva[r._id];
      if (pago) {
        const neto = Number(pago.importeTotal);
        if (!isNaN(neto) && neto >= 0) netoPago = neto;
        descInfo = parsearDescuentoEnDescripcion(pago.descripcion);
        metodoPago = String(pago.tipoPago || '').trim();   // v1.1.6
        cobradoPor = String(pago.soldBy || '').trim();     // v1.1.7 — quién cobró
      }
    }

    // v1.1.6 — Bruto de todo lo facturable de la cita. El factor neto/bruto
    // reparte el descuento proporcionalmente entre las líneas, de modo que
    // la suma por profesional cuadra al céntimo con lo cobrado.
    const brutoSvc    = parsed.servicios.reduce((acc, sv) => acc + sv.precio * sv.cantidad, 0);
    const brutoExtras = parsed.extras.reduce((acc, e) => acc + e.importe, 0);
    const brutoProd   = parsed.productos.reduce((acc, pr) => acc + pr.subtotal, 0);
    const brutoLineas = brutoSvc + brutoExtras + brutoProd;
    const factor = (netoPago !== null && brutoLineas > 0) ? (netoPago / brutoLineas) : 1;

    // v1.1.6 — El importe de la CITA es servicios + extras. Los productos
    // NO entran: van a su propio detalle. Antes se sumaban aquí y el
    // informe mostraba un total del que no se sabía a qué correspondía.
    const importe = (netoPago !== null && brutoLineas > 0)
      ? Math.round((brutoSvc + brutoExtras) * factor * 100) / 100
      : Math.round(((brutoSvc + brutoExtras) || bruto) * 100) / 100;

    if (isPagado) { cobrado += importe; clientesCobrados.add(claveCli); }
    else          { pendiente += importe; clientesPendientes.add(claveCli); }

    for (const sv of parsed.servicios) {
      if (!serviciosAgg.has(sv.nombre)) serviciosAgg.set(sv.nombre, { nombre: sv.nombre, cantidad: 0, total: 0 });
      const agg = serviciosAgg.get(sv.nombre);
      agg.cantidad += sv.cantidad;
      agg.total = Math.round((agg.total + sv.precio * sv.cantidad) * 100) / 100;
    }
    for (const p of parsed.productos) {
      if (!productosAgg.has(p.nombre)) productosAgg.set(p.nombre, { nombre: p.nombre, cantidad: 0, total: 0 });
      const agg = productosAgg.get(p.nombre);
      agg.cantidad += p.cantidad;
      agg.total = Math.round((agg.total + p.subtotal) * 100) / 100;
    }
    // v1.1.1: descuento real desde el pago (no desde serviciosDetail)
    if (descInfo && descInfo.discEur > 0) {
      descuentosArr.push({
        label: (parsed.servicios[0]?.nombre || r.title || 'Servicio'),
        cliente: r.clientName || '',
        importe: Math.round(descInfo.discEur * 100) / 100,
        labelDesc: descInfo.label,
        bruto: Math.round(bruto * 100) / 100
      });
    }

    // ── v1.1.6 · ATRIBUCIÓN POR FASE ──────────────────────────────────
    // Cada línea va a quien la ejecutó, no al titular del pack. Los
    // extras ([EXTRA], importe manual sin fase) se quedan con el titular.
    const reparto = repartirLineasPorStaff(r, parsed.servicios, staffPorResourceId);
    const extrasNeto = Math.round(brutoExtras * factor * 100) / 100;
    const staffsDeLaCita = [];

    for (const [quien, bucket] of reparto.entries()) {
      const netoR = Math.round((bucket.bruto * factor + (quien === staffName ? extrasNeto : 0)) * 100) / 100;
      staffsDeLaCita.push(quien);

      const infoQuien = staffMap[quien.toUpperCase()] || { isExternal: false, commissionPct: 0 };
      if (!staffAgg.has(quien)) staffAgg.set(quien, { staffName: quien, cobrado: 0, pendiente: 0, total: 0, citas: 0, isExternal: infoQuien.isExternal, commissionPct: infoQuien.commissionPct });
      const stAgg = staffAgg.get(quien);
      if (isPagado) stAgg.cobrado += netoR;
      else stAgg.pendiente += netoR;
      stAgg.total += netoR;
      stAgg.citas += 1;

      // v1.1.7 — Los servicios ya no se agregan por nombre dentro de cada
      // profesional: se listan uno por uno con la HORA de su fase, que es
      // lo que permite localizarlo en el calendario. Agregar borraba
      // justamente ese dato.
      if (!svcPorStaff.has(quien)) svcPorStaff.set(quien, []);
      const listaSvc = svcPorStaff.get(quien);
      for (const sv of bucket.servicios) {
        listaSvc.push({
          hora: sv.hora,
          fechaMs: sv.fechaMs,
          nombre: sv.nombre,
          cliente: (r.clientName || '').trim(),
          cantidad: sv.cantidad,
          // v1.1.9 — precio de tarifa, SIN prorratear el descuento/ajuste
          total: Math.round(sv.precio * sv.cantidad * 100) / 100
        });
      }

      if (!cliPorStaff.has(quien)) cliPorStaff.set(quien, []);
      cliPorStaff.get(quien).push({
        hora: horaMadrid(r.fechaReserva),
        fechaMs: r.fechaReserva ? new Date(r.fechaReserva).getTime() : 0,
        nombre: (r.clientName || 'Sin nombre').trim(),
        servicios: bucket.servicios,
        total: netoR,
        status: r.status,
        metodoPago,
        cobradoPor,                                      // v1.1.7
        descLabel: descInfo?.label || '',
        compartida: reparto.size > 1
      });

      if (isPendiente) {
        pendientesArr.push({
          hora: horaMadrid(r.fechaReserva),
          fechaMs: r.fechaReserva ? new Date(r.fechaReserva).getTime() : 0,
          cliente: (r.clientName || 'Sin nombre').trim(),
          staff: quien,
          servicios: bucket.servicios.map(sv => sv.nombre).filter(Boolean),
          importe: netoR
        });
      }
    }

    if (staffInfo.isExternal) {
      externosArr.push({
        cliente: r.clientName || '',
        servicio: (parsed.servicios[0]?.nombre || r.title || ''),
        importe,
        staffName,
        status: r.status
      });
    }

    clientesLista.push({
      hora: horaMadrid(r.fechaReserva),
      fechaMs: r.fechaReserva ? new Date(r.fechaReserva).getTime() : 0,
      nombre: (r.clientName || 'Sin nombre').trim(),
      staff: staffName,
      staffs: staffsDeLaCita,                          // v1.1.6 — quién la atendió de verdad
      servicios: parsed.servicios,
      total: Math.round(importe * 100) / 100,        // neto si pagado, bruto si pendiente
      bruto: Math.round(bruto * 100) / 100,           // siempre el subtotal sin descuento
      descLabel: descInfo?.label || '',                // "-50%" o "-25€" o ""
      metodoPago,                                      // v1.1.6
      cobradoPor,                                      // v1.1.7
      status: r.status
    });
  }

  clientesLista.sort((a, b) => a.fechaMs - b.fechaMs);

  const round = v => Math.round(v * 100) / 100;
  return {
    cobrado: round(cobrado),
    pendiente: round(pendiente),
    total: round(cobrado + pendiente),
    clientesCobrados: clientesCobrados.size,
    clientesPendientes: clientesPendientes.size,
    clientesTotal: new Set([...clientesCobrados, ...clientesPendientes]).size,
    servicios: Array.from(serviciosAgg.values()).sort((a, b) => b.total - a.total),
    clientes: clientesLista,
    descuentos: descuentosArr,
    descuentoTotal: round(descuentosArr.reduce((s, d) => s + d.importe, 0)),
    staff: Array.from(staffAgg.values()).map(s => ({
      ...s, cobrado: round(s.cobrado), pendiente: round(s.pendiente), total: round(s.total)
    })).sort((a, b) => b.total - a.total),
    productos: Array.from(productosAgg.values()),
    externos: externosArr,
    externosTotal: round(externosArr.reduce((s, e) => s + e.importe, 0)),

    // ── v1.1.6 · VISTAS POR PROFESIONAL (atribución por fase) ──
    serviciosPorStaff: Array.from(svcPorStaff.entries()).map(([staffName, arr]) => {
      const servicios = arr.slice().sort((a, b) => a.fechaMs - b.fechaMs);   // v1.1.7 — cronológico
      return { staffName, servicios, total: round(servicios.reduce((acc, x) => acc + x.total, 0)) };
    }).sort((a, b) => b.total - a.total),

    clientesPorStaff: Array.from(cliPorStaff.entries()).map(([staffName, arr]) => {
      const clientes = arr.slice().sort((a, b) => a.fechaMs - b.fechaMs);
      return { staffName, clientes, total: round(clientes.reduce((acc, x) => acc + x.total, 0)) };
    }).sort((a, b) => b.total - a.total),

    pendientes: pendientesArr.sort((a, b) => a.fechaMs - b.fechaMs),
    pendientesTotal: round(pendientesArr.reduce((acc, x) => acc + x.importe, 0))
  };
}

// =====================================================
// Q2 — CIERRE FINANCIERO
// =====================================================
function procesarCierre(pagos, staffList, vatRate) {
  const staffMap = {};
  for (const s of staffList) {
    const key = (s.displayName || s.canonicalName || '').toUpperCase();
    if (key) staffMap[key] = {
      isExternal: !!s.isExternal,
      commissionPct: Number(s.commissionPercentage) || 0
    };
  }

  const noCancelados = pagos.filter(p => String(p.status || '').toUpperCase() !== 'CANCELADO');

  let totalReal = 0, totalPropinas = 0;
  const porMetodo = {};
  const productosAgg = new Map();
  const staffAgg = new Map();
  const externosArr = [];
  const descuentosArr = [];   // v1.1.1
  let descuentoTotal = 0;     // v1.1.1
  const especialesArr = [];   // v1.1.5
  let especialesTotal = 0;    // v1.1.5
  const productosDetalle = [];  // v1.1.6 — una entrada por producto vendido

  for (const p of noCancelados) {
    const importe = Number(p.importeTotal) || 0;
    totalReal += importe;
    totalPropinas += extraerPropinasDeDescripcion(p.descripcion);

    const metodo = p.tipoPago || 'Sin especificar';
    porMetodo[metodo] = (porMetodo[metodo] || 0) + importe;

    const prods = parsearProductos(p.descripcion);
    for (const prod of prods) {
      if (!productosAgg.has(prod.nombre)) productosAgg.set(prod.nombre, { nombre: prod.nombre, cantidad: 0, total: 0 });
      const agg = productosAgg.get(prod.nombre);
      agg.cantidad += prod.cantidad;
      agg.total = Math.round((agg.total + prod.subtotal) * 100) / 100;

      // v1.1.6 — Detalle con CLIENTE y VENDEDOR. `soldBy` lo escribe
      // tiendaProductos v1.5.13 con el empleado logueado en Recepción;
      // vacío (ventas anteriores o sin capa de acceso) → el widget lo
      // pinta como "Administrador". No se usa `staff`: ahí vive el
      // discriminador TIENDA / TIENDA_POS, que no es una persona.
      productosDetalle.push({
        cliente: (p.nombreCliente || '').trim(),
        producto: prod.nombre,
        cantidad: prod.cantidad,
        importe: Math.round(prod.subtotal * 100) / 100,
        metodo: p.tipoPago || '',
        soldBy: String(p.soldBy || '').trim(),
        hora: horaMadrid(p.fechaPago),
        fechaMs: p.fechaPago ? new Date(p.fechaPago).getTime() : 0
      });
    }

    // v1.1.1: descuentos parseados desde la descripcion del pago
    const desc = parsearDescuentoEnDescripcion(p.descripcion);
    if (desc.discEur > 0) {
      descuentosArr.push({
        cliente: (p.nombreCliente || '').trim(),
        importe: Math.round(desc.discEur * 100) / 100,
        labelDesc: desc.label
      });
      descuentoTotal += desc.discEur;
    }

    const staffName = String(p.staff || 'Sin staff').trim();

    // ── v1.1.7 · QUIÉN COBRÓ ──────────────────────────────────────────
    // Agrupamos por `soldBy`, el empleado que estaba logueado al pasar el
    // cobro. `staff` NO sirve para esto: guarda el titular de la cita, o
    // sea la columna del calendario, y los discriminadores TIENDA /
    // TIENDA_POS / ESPECIALES, que no son personas.
    // Sin login (o cobro anterior a v1.0.48) → cajón único Administrador.
    // Entran TODOS los cobros, incluida la tienda standalone: antes se
    // excluía TIENDA_POS y el bloque no cuadraba con el total del día.
    const quienCobro = String(p.soldBy || '').trim() || 'Administrador';
    if (!staffAgg.has(quienCobro)) staffAgg.set(quienCobro, { staffName: quienCobro, cobrado: 0, citas: 0, isExternal: false, commissionPct: 0 });
    const st = staffAgg.get(quienCobro);
    st.cobrado += importe;
    st.citas += 1;
    const infoCobro = staffMap[quienCobro.toUpperCase()];
    if (infoCobro) { st.isExternal = infoCobro.isExternal; st.commissionPct = infoCobro.commissionPct; }

    // v1.1.5 — Detalle de ventas ESPECIALES (Bono / PRIME / Tarjeta).
    // `concepto` es la descripcion tal cual la grabó registrarCobroEspecial
    // ("🎟️ Bono · <servicio> (N usos) · N€", "⭐ Tarjeta PRIME · …",
    // "🎁 Tarjeta · …", con el token de descuento concatenado si lo hubo).
    // No se reparsea: se muestra literal para no perder ni inventar nada.
    if (staffName.toUpperCase() === STAFF_ESPECIALES) {
      especialesArr.push({
        cliente: (p.nombreCliente || '').trim(),
        concepto: String(p.descripcion || '').trim(),
        importe: Math.round(importe * 100) / 100,
        metodo: p.tipoPago || '',
        hora: horaMadrid(p.fechaPago),                     // v1.1.6
        fechaMs: p.fechaPago ? new Date(p.fechaPago).getTime() : 0
      });
      especialesTotal += importe;
    }

    const info = staffMap[staffName.toUpperCase()];
    if (info && info.isExternal) {
      const pct = info.commissionPct || 0;
      externosArr.push({
        cliente: (p.nombreCliente || '').trim(),
        servicio: p.descripcion || '',
        importe,
        comision: Math.round(importe * (pct / 100) * 100) / 100,
        staffName, pct
      });
    }
  }

  totalReal = Math.round(totalReal * 100) / 100;
  totalPropinas = Math.round(totalPropinas * 100) / 100;
  const baseConIVA = Math.round((totalReal - totalPropinas) * 100) / 100;
  const iva = desglosarIVA(baseConIVA, vatRate);

  const round = v => Math.round(v * 100) / 100;
  return {
    totalReal,
    transacciones: noCancelados.length,
    porMetodo: Object.entries(porMetodo).map(([metodo, importe]) => ({ metodo, importe: round(importe) })),
    iva: { vatRate, totalCobrado: totalReal, totalPropinas, totalSinPropinas: baseConIVA, baseImponible: iva.base, cuotaIVA: iva.cuota },
    productos: Array.from(productosAgg.values()),
    productosDetalle: productosDetalle.sort((a, b) => a.fechaMs - b.fechaMs),   // v1.1.6
    productosTotal: round(productosDetalle.reduce((acc, x) => acc + x.importe, 0)),
    staff: Array.from(staffAgg.values()).map(s => ({ ...s, cobrado: round(s.cobrado) })).sort((a, b) => b.cobrado - a.cobrado),
    externos: externosArr,
    externosComisionTotal: round(externosArr.reduce((s, e) => s + e.comision, 0)),
    descuentos: descuentosArr,                  // v1.1.1
    descuentoTotal: round(descuentoTotal),      // v1.1.1
    especiales: especialesArr,                  // v1.1.5
    especialesTotal: round(especialesTotal)     // v1.1.5
  };
}

// =====================================================
// Q3 — RECONCILIACIÓN
// =====================================================
async function procesarReconciliacion(reservas, pagos, fechaISO, startOfDay, endOfDay, pagosPorReserva = null) {
  const reservaIds = reservas.map(r => r._id);
  const reservaById = new Map(reservas.map(r => [r._id, r]));

  // Pagos del día (Q2) que apuntan a una reserva NO del día
  const cobrosDeOtrosDias = [];
  for (const p of pagos) {
    const bookId = String(p.bookingId || '');
    const reservaId = bookId.startsWith('KRI_') ? bookId.slice(4) : null;
    if (reservaId && !reservaById.has(reservaId)) {
      cobrosDeOtrosDias.push({
        cliente: (p.nombreCliente || '').trim(),
        importe: Number(p.importeTotal) || 0,
        descripcion: p.descripcion || '',
        bookingId: bookId,
        reservaId,
        // v1.1.8 — contexto del cobro para poder juzgarlo de un vistazo
        hora: horaMadrid(p.fechaPago),
        metodo: p.tipoPago || '',
        cobradoPor: String(p.soldBy || '').trim(),
        fechaCita: '',        // se rellena abajo con una query por lote
        horaCita: ''
      });
    }
  }

  // Reservas del día (Q1) cobradas en otro día
  // v1.1.1: si pagosPorReserva ya viene cargado (de Q2.5), lo usamos para
  // evitar repetir la query. Si no, hacemos la query como antes.
  const cobradasFueraDelDia = [];
  if (pagosPorReserva && Object.keys(pagosPorReserva).length) {
    for (const [reservaId, pago] of Object.entries(pagosPorReserva)) {
      const fp = pago.fechaPago ? new Date(pago.fechaPago) : null;
      if (!fp) continue;
      const isHoy = fp >= startOfDay && fp <= endOfDay;
      if (!isHoy) {
        const reserva = reservaById.get(reservaId);
        cobradasFueraDelDia.push({
          cliente: (pago.nombreCliente || reserva?.clientName || '').trim(),
          importe: Number(pago.importeTotal) || 0,
          fechaPago: fp.toISOString(),
          reservaId,
          clienteCitaHora: reserva ? horaMadrid(reserva.fechaReserva) : ''
        });
      }
    }
  } else if (reservaIds.length) {
    // Fallback: query igual que v1.1.0
    const targetBookings = reservaIds.map(id => `KRI_${id}`);
    for (let i = 0; i < targetBookings.length; i += 100) {
      const batch = targetBookings.slice(i, i + 100);
      try {
        const r = await wixData.query(COLECCION_PAGOS)
          .hasSome('bookingId', batch)
          .limit(500)
          .find({ suppressAuth: true });
        for (const pago of r.items || []) {
          const fp = pago.fechaPago ? new Date(pago.fechaPago) : null;
          if (!fp) continue;
          const isHoy = fp >= startOfDay && fp <= endOfDay;
          if (!isHoy) {
            const reservaId = String(pago.bookingId || '').slice(4);
            const reserva = reservaById.get(reservaId);
            cobradasFueraDelDia.push({
              cliente: (pago.nombreCliente || reserva?.clientName || '').trim(),
              importe: Number(pago.importeTotal) || 0,
              fechaPago: fp.toISOString(),
              reservaId,
              clienteCitaHora: reserva ? horaMadrid(reserva.fechaReserva) : ''
            });
          }
        }
      } catch (e) {
        console.warn(`${TAG} Error reconciliando batch:`, e.message);
      }
    }
  }

  // v1.1.8 — Resolver la fecha de la cita de cada cobro de otro día. Sin
  // esto el bloque no puede decir "esto es del viernes", que es justo el
  // dato que explica el descuadre.
  if (cobrosDeOtrosDias.length) {
    try {
      const ids = [...new Set(cobrosDeOtrosDias.map(c => c.reservaId).filter(Boolean))];
      for (let i = 0; i < ids.length; i += 100) {
        const lote = ids.slice(i, i + 100);
        const rr = await wixData.query(COLECCION_RESERVAS)
          .hasSome('_id', lote)
          .limit(200)
          .find({ suppressAuth: true });
        const porId = new Map((rr.items || []).map(x => [x._id, x]));
        for (const c of cobrosDeOtrosDias) {
          const reserva = porId.get(c.reservaId);
          if (!reserva || !reserva.fechaReserva) continue;
          const d = new Date(reserva.fechaReserva);
          c.fechaCita = d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', timeZone: 'Europe/Madrid' });
          c.horaCita = horaMadrid(d);
          if (!c.cliente) c.cliente = (reserva.clientName || '').trim();
        }
      }
    } catch (e) {
      console.warn(`${TAG} No se pudo resolver la fecha de las citas de otros días:`, e.message);
    }
  }

  const round = v => Math.round(v * 100) / 100;
  const totalCobradoOtrosDias = round(cobrosDeOtrosDias.reduce((s, c) => s + c.importe, 0));
  const totalCobradasFueraHoy = round(cobradasFueraDelDia.reduce((s, c) => s + c.importe, 0));

  return {
    cobrosDeOtrosDias,
    totalCobrosDeOtrosDias: totalCobradoOtrosDias,
    cobradasFueraDelDia,
    totalCobradasFueraDelDia: totalCobradasFueraHoy,
    diferencia: round(totalCobradoOtrosDias - totalCobradasFueraHoy)
  };
}

// =====================================================
// OBSERVATORIO SEMANAL  (v1.1.8)
// =====================================================
// Semana natural lunes→domingo que contiene `fechaISO`. Por día: cobrado
// por método y estado de cuadre de los tres que se pueden cuadrar.
//
// Qué significa CUADRADO en cada método:
//   · EFECTIVO — hay arqueo hecho ese día (CashRegister en 'saved' o
//     'closed') y la diferencia entre contado y esperado es 0.
//   · TARJETA  — alguien ha confirmado que la lectura del datáfono
//     coincide con el informe (`cardConfirmed`).
//   · BIZUM    — ídem con `bizumConfirmed`.
// Un método sin cobros ese día no se marca PENDIENTE: no hay nada que
// cuadrar. Los días futuros tampoco se marcan.
const COL_CASH_REGISTER = 'CashRegister';

function _lunesDeLaSemana(fechaISO) {
  const d = new Date(`${fechaISO}T12:00:00.000`);
  const dow = d.getDay();                 // 0 domingo … 6 sábado
  const retro = (dow === 0) ? 6 : dow - 1;  // lunes como día 1
  d.setDate(d.getDate() - retro);
  return d;
}

function _iso(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

// Normaliza el tipoPago a las cuatro cestas del observatorio.
function _cesta(tipoPago) {
  const t = String(tipoPago || '').trim().toLowerCase();
  if (t === 'tarjeta') return 'tarjeta';
  if (t === 'efectivo') return 'efectivo';
  if (t === 'bizum') return 'bizum';
  return 'otros';   // Mixto, Canje, transferencia, sin especificar…
}

export const obtenerObservatorioSemanal = webMethod(
  Permissions.Anyone,
  async ({ fechaISO }) => {
    try {
      if (!fechaISO) return { ok: false, error: 'fechaISO requerido' };

      const lunes = _lunesDeLaSemana(fechaISO);
      const domingo = new Date(lunes); domingo.setDate(domingo.getDate() + 6);
      const desde = new Date(`${_iso(lunes)}T00:00:00.000`);
      const hasta = new Date(`${_iso(domingo)}T23:59:59.999`);
      console.log(`${TAG} 📅 Observatorio semanal ${_iso(lunes)} → ${_iso(domingo)}`);

      // Cobros de la semana
      let pagos = [];
      let skip = 0, hasMore = true;
      while (hasMore && skip < 5000) {
        const r = await wixData.query(COLECCION_PAGOS)
          .ge('fechaPago', desde).le('fechaPago', hasta)
          .skip(skip).limit(500)
          .find({ suppressAuth: true });
        pagos = pagos.concat(r.items || []);
        hasMore = (r.items || []).length === 500;
        skip += 500;
      }

      // Arqueos de la semana
      let registros = [];
      try {
        const rc = await wixData.query(COL_CASH_REGISTER)
          .ge('registerDate', desde).le('registerDate', hasta)
          .limit(50)
          .find({ suppressAuth: true });
        registros = rc.items || [];
      } catch (eReg) {
        console.warn(`${TAG} No se pudo leer CashRegister de la semana:`, eReg.message);
      }

      const round = v => Math.round(v * 100) / 100;
      const hoyISO = _iso(new Date());
      const NOMBRES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

      const dias = [];
      for (let i = 0; i < 7; i++) {
        const dia = new Date(lunes); dia.setDate(dia.getDate() + i);
        const iso = _iso(dia);
        const ini = new Date(`${iso}T00:00:00.000`).getTime();
        const fin = new Date(`${iso}T23:59:59.999`).getTime();

        const acc = { tarjeta: 0, efectivo: 0, bizum: 0, otros: 0 };
        for (const p of pagos) {
          if (String(p.status || '').toUpperCase() === 'CANCELADO') continue;
          const t = p.fechaPago ? new Date(p.fechaPago).getTime() : 0;
          if (t < ini || t > fin) continue;
          acc[_cesta(p.tipoPago)] += Number(p.importeTotal) || 0;
        }

        const reg = registros.find(r => {
          const t = r.registerDate ? new Date(r.registerDate).getTime() : 0;
          return t >= ini && t <= fin;
        }) || null;

        const arqueado = !!reg && (reg.status === 'saved' || reg.status === 'closed');
        const futuro = iso > hoyISO;

        // estado: 'ok' | 'pendiente' | 'na'  (na = nada que cuadrar)
        const estado = (importe, cuadrado) => {
          if (futuro) return 'na';
          if (!(importe > 0)) return 'na';
          return cuadrado ? 'ok' : 'pendiente';
        };

        dias.push({
          fechaISO: iso,
          nombre: NOMBRES[i],
          diaMes: dia.getDate(),
          esHoy: iso === hoyISO,
          futuro,
          tarjeta: round(acc.tarjeta),
          efectivo: round(acc.efectivo),
          bizum: round(acc.bizum),
          otros: round(acc.otros),
          total: round(acc.tarjeta + acc.efectivo + acc.bizum + acc.otros),
          estadoTarjeta: estado(acc.tarjeta, reg ? reg.cardConfirmed === true : false),
          estadoEfectivo: estado(acc.efectivo, arqueado && Math.abs(Number(reg.difference) || 0) < 0.005),
          estadoBizum: estado(acc.bizum, reg ? reg.bizumConfirmed === true : false),
          arqueoStatus: reg ? (reg.status || '') : ''
        });
      }

      const tot = dias.reduce((a, d) => ({
        tarjeta: a.tarjeta + d.tarjeta, efectivo: a.efectivo + d.efectivo,
        bizum: a.bizum + d.bizum, otros: a.otros + d.otros, total: a.total + d.total
      }), { tarjeta: 0, efectivo: 0, bizum: 0, otros: 0, total: 0 });

      return {
        ok: true,
        desde: _iso(lunes),
        hasta: _iso(domingo),
        dias,
        totales: {
          tarjeta: round(tot.tarjeta), efectivo: round(tot.efectivo),
          bizum: round(tot.bizum), otros: round(tot.otros), total: round(tot.total)
        }
      };
    } catch (error) {
      console.error(`${TAG} ❌ obtenerObservatorioSemanal:`, error);
      return { ok: false, error: error.message };
    }
  }
);

// =====================================================
// FUNCIÓN PRINCIPAL (REESCRITA v1.1.0)
// Mantiene nombre del export para compat con page code v1.0.x.
// Conserva `clientesDelDia` y `ventasPOS` legacy en el return.
// =====================================================
export const obtenerDatosCierreExtendidos = webMethod(
  Permissions.Anyone,
  async ({ fechaISO }) => {
    try {
      if (!fechaISO) return { ok: false, error: 'fechaISO requerido' };
      console.log(`${TAG} 📊 Informe del día: ${fechaISO}`);

      const startOfDay = new Date(`${fechaISO}T00:00:00.000`);
      const endOfDay = new Date(`${fechaISO}T23:59:59.999`);

      const staffList = await cargarStaff();

      // Q1 — Reservas por fechaReserva
      let reservas = [];
      let skipR = 0, hasMoreR = true;
      while (hasMoreR && skipR < 2000) {
        const r = await wixData.query(COLECCION_RESERVAS)
          .ge('fechaReserva', startOfDay)
          .le('fechaReserva', endOfDay)
          .skip(skipR).limit(500)
          .find({ suppressAuth: true });
        reservas = reservas.concat(r.items || []);
        hasMoreR = (r.items || []).length === 500;
        skipR += 500;
      }
      console.log(`${TAG} Q1 fechaReserva (bruto): ${reservas.length} reservas`);

      // v1.1.4 — FILTRADO DE BLOQUEOS antes de cualquier procesamiento.
      // Las filas con family='BLOQUEO' (y clientName con prefijo 'BLOQUEO:')
      // son bloqueos manuales del calendario (vacaciones, almuerzos, etc.),
      // NO clientes ni citas reales. NO deben aparecer en:
      //   · Conteo de clientes del día
      //   · Servicios del día
      //   · Productividad por staff
      //   · Reconciliación cobrado vs cobrado real
      // Filtro defensivo doble (family + prefijo) por si llega alguna fila
      // de versiones previas que no llevara family seteado pero sí prefijo.
      const reservasBrutoTotal = reservas.length;
      reservas = reservas.filter(r => {
        if (r.family === 'BLOQUEO') return false;
        if (typeof r.clientName === 'string' && r.clientName.startsWith('BLOQUEO:')) return false;
        return true;
      });
      const bloqueosFiltrados = reservasBrutoTotal - reservas.length;
      if (bloqueosFiltrados > 0) {
        console.log(`${TAG} 🚫 Q1 filtró ${bloqueosFiltrados} bloqueos (family='BLOQUEO' o clientName prefijo). Quedan ${reservas.length} reservas reales.`);
      }

      // Q2 — Pagos por fechaPago
      let pagos = [];
      let skipP = 0, hasMoreP = true;
      while (hasMoreP && skipP < 5000) {
        const r = await wixData.query(COLECCION_PAGOS)
          .ge('fechaPago', startOfDay)
          .le('fechaPago', endOfDay)
          .skip(skipP).limit(500)
          .find();
        pagos = pagos.concat(r.items || []);
        hasMoreP = (r.items || []).length === 500;
        skipP += 500;
      }
      console.log(`${TAG} Q2 fechaPago: ${pagos.length} pagos`);

      // v1.1.1: Q2.5 — Pagos asociados a las reservas del día (cualquier fecha).
      // Necesario para que Rendimiento Productivo use el NETO real cobrado
      // (con descuento aplicado) y para Reconciliación.
      const reservaIds = reservas.map(r => r._id);
      const pagosPorReserva = {};
      if (reservaIds.length) {
        const targetBookings = reservaIds.map(id => `KRI_${id}`);
        for (let i = 0; i < targetBookings.length; i += 100) {
          const batch = targetBookings.slice(i, i + 100);
          try {
            const r = await wixData.query(COLECCION_PAGOS)
              .hasSome('bookingId', batch)
              .limit(500)
              .find({ suppressAuth: true });
            for (const pago of (r.items || [])) {
              const reservaId = String(pago.bookingId || '').slice(4);
              if (reservaId) pagosPorReserva[reservaId] = pago;
            }
          } catch (e) {
            console.warn(`${TAG} Error cargando pagosPorReserva:`, e.message);
          }
        }
      }
      console.log(`${TAG} Q2.5 pagosPorReserva: ${Object.keys(pagosPorReserva).length} pagos cruzados`);

      const vatRate = await leerVatRate();
      const rendimiento = procesarRendimiento(reservas, staffList, pagosPorReserva);
      const cierre = procesarCierre(pagos, staffList, vatRate);
      const reconciliacion = await procesarReconciliacion(reservas, pagos, fechaISO, startOfDay, endOfDay, pagosPorReserva);

      // Legacy compat
      const clientesDelDia = rendimiento.clientes.map(c => ({
        hora: c.hora,
        fechaPagoMs: c.fechaMs,
        nombre: c.nombre,
        servicios: c.servicios,
        total: c.total,
        metodoPago: ''
      }));

      console.log(`${TAG} ✅ Q1: ${reservas.length}r · ${rendimiento.cobrado}€ cobrado · ${rendimiento.pendiente}€ pdte | Q2: ${pagos.length}p · ${cierre.totalReal}€ real | Reconc: diff ${reconciliacion.diferencia}€`);

      return {
        ok: true,
        rendimiento,
        cierre,
        reconciliacion,
        iva: cierre.iva,
        clientesDelDia,
        ventasPOS: [],
        totalPOS: cierre.productos.reduce((s, p) => s + p.total, 0)
      };
    } catch (error) {
      console.error(`${TAG} ❌ Error:`, error);
      return { ok: false, error: error.message };
    }
  }
);
