// =====================================================
// BACKEND cierreLogicExtendido.web.js — KAMISUITE v1.1.4
// =====================================================
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

const TAG = '[CierreExt v1.1.4]';
const COLECCION_PAGOS    = 'PaymentReservations';
const COLECCION_RESERVAS = 'KamisuiteReservations';
const COLECCION_STAFF    = 'StaffConfig';
const COLECCION_CONFIG   = 'SalonConfig';

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

// =====================================================
// Q1 — RENDIMIENTO PRODUCTIVO
// =====================================================
function procesarRendimiento(reservas, staffList, pagosPorReserva = {}) {
  const staffMap = {};
  for (const s of staffList) {
    const key = (s.displayName || s.canonicalName || '').toUpperCase();
    if (key) staffMap[key] = {
      isExternal: !!s.isExternal,
      commissionPct: Number(s.commissionPercentage) || 0
    };
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

  for (const r of reservas) {
    const isPagado = r.status === 'PAGADO';
    const isPendiente = r.status === 'CONFIRMADA';
    if (!isPagado && !isPendiente) continue;

    const bruto = Number(r.precioTotal) || 0;
    const claveCli = r.contactId || r.clientPhone || r.clientName || r._id;
    const staffName = (r.staffName || 'Sin staff').trim();
    const staffKey = staffName.toUpperCase();
    const staffInfo = staffMap[staffKey] || { isExternal: false, commissionPct: 0 };

    // v1.1.1: si pagada y hay pago asociado, usar importeTotal del pago (NETO con descuento aplicado)
    let importe = bruto;
    let descInfo = null;
    if (isPagado) {
      const pago = pagosPorReserva[r._id];
      if (pago) {
        const neto = Number(pago.importeTotal);
        if (!isNaN(neto) && neto >= 0) importe = neto;
        descInfo = parsearDescuentoEnDescripcion(pago.descripcion);
      }
    }

    if (isPagado) { cobrado += importe; clientesCobrados.add(claveCli); }
    else          { pendiente += importe; clientesPendientes.add(claveCli); }

    const parsed = parsearServiciosDetail(r.serviciosDetail || '');

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

    if (!staffAgg.has(staffName)) staffAgg.set(staffName, { staffName, cobrado: 0, pendiente: 0, total: 0, citas: 0, isExternal: staffInfo.isExternal, commissionPct: staffInfo.commissionPct });
    const stAgg = staffAgg.get(staffName);
    if (isPagado) stAgg.cobrado += importe;
    else stAgg.pendiente += importe;
    stAgg.total += importe;
    stAgg.citas += 1;

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
      servicios: parsed.servicios,
      total: Math.round(importe * 100) / 100,        // neto si pagado, bruto si pendiente
      bruto: Math.round(bruto * 100) / 100,           // siempre el subtotal sin descuento
      descLabel: descInfo?.label || '',                // "-50%" o "-25€" o ""
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
    externosTotal: round(externosArr.reduce((s, e) => s + e.importe, 0))
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
    if (staffName.toUpperCase() !== 'TIENDA_POS') {
      if (!staffAgg.has(staffName)) staffAgg.set(staffName, { staffName, cobrado: 0, citas: 0, isExternal: false, commissionPct: 0 });
      const st = staffAgg.get(staffName);
      st.cobrado += importe;
      st.citas += 1;
      const info = staffMap[staffName.toUpperCase()];
      if (info) { st.isExternal = info.isExternal; st.commissionPct = info.commissionPct; }
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
    staff: Array.from(staffAgg.values()).map(s => ({ ...s, cobrado: round(s.cobrado) })).sort((a, b) => b.cobrado - a.cobrado),
    externos: externosArr,
    externosComisionTotal: round(externosArr.reduce((s, e) => s + e.comision, 0)),
    descuentos: descuentosArr,                  // v1.1.1
    descuentoTotal: round(descuentoTotal)       // v1.1.1
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
        reservaId
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