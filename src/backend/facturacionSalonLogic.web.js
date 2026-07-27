// =============================================================
// facturacionSalonLogic.web.js
// KAMISUITE V2 — Módulo de Facturación del Salón a sus Clientes
// VERSION: 1.0.3
// TAG: facturacion-salon-v1.0.3
// =============================================================
// CHANGELOG:
// v1.0.3 (2026-06-28) — Upgrade Ticket → Factura completa (rectificativa)
//   - Escenario real: clienta recibe ticket porque no recuerda CIF/DNI,
//     vuelve más tarde con los datos para que se le emita la factura
//     completa. Hasta ahora el botón Factura quedaba bloqueado por la
//     idempotencia cruzada (una reserva = un documento).
//   - SOLUCIÓN: idempotencia REFINADA, no plana. Reglas:
//       · Si no hay documento previo: emite normal.
//       · Si hay ticket vigente y se pide factura: EMITE factura nueva
//         como RECTIFICATIVA del ticket. El ticket queda con
//         status='rectificada' (no se contabiliza). La factura nueva
//         apunta al ticket en rectifiesInvoiceNumber + notes describe
//         el reemplazo. Mismo importe, mismo IVA, número F- nuevo.
//       · Si hay ticket vigente y se pide otro ticket: bloqueado
//         (devuelve duplicado, mismo flujo de v1.0.2).
//       · Si hay factura vigente: bloqueado (no se "rebaja" a ticket
//         ni se reemite factura).
//   - LEGALIDAD: equivale a "factura rectificativa que reemplaza a
//     factura simplificada" del RD 1619/2012. Ingreso contable = 1
//     (solo cuenta la factura). El ticket rectificado queda en CMS
//     para auditoría pero no aparece en cierres / IVA / arqueo cuando
//     esos filtros incluyan status='emitida' (actualizar consumidores
//     si los hay; verificado: hoy no hay consumidor que sume Invoices).
//   - _buscarDocumentoExistente ahora filtra por status NE 'rectificada'
//     para que un ticket ya rectificado no bloquee operaciones futuras
//     ni confunda al frontend.
//   - Tras insertar la factura rectificativa, se hace wixData.update
//     atómico (READ-MERGE-UPDATE) sobre el ticket original para
//     marcarlo como rectificada. Si ese update fallase, se hace rollback
//     de la factura recién creada para mantener consistencia.
//   - Devuelve flag `rectifica` en la respuesta para que el widget
//     pueda mostrar un toast informativo distinto.
//   - Cero cambios en el resto: contadores, generación PDF, subida,
//     resolución URL HTTPS (v1.0.2), reescalado líneas, Verifactu.
//
// v1.0.2 (2026-06-28) — URL pública HTTPS del PDF (resuelve enlaces rotos)
//   - El operador no podía abrir el PDF desde el badge del modal:
//     mediaManager.upload devuelve fileUrl en formato interno Wix
//     (wix:document://v1/HASH.pdf/FILENAME.pdf) que no es navegable
//     desde el browser. window.open(wix:document://...) hacía que
//     Chrome lo tratase como query de Google y se perdía.
//   - FIX: nuevo helper _resolverPdfUrlHttps() que usa
//     mediaManager.getDownloadUrl(fileUrl, 3600) para obtener una
//     URL HTTPS firmada con 1h de validez. Esta URL sí es navegable
//     desde un browser y abre el PDF en pestaña nueva.
//   - _subirPdf() resuelve la URL ANTES de devolverla al flujo
//     principal, así toda factura nueva se guarda con pdfUrl HTTPS
//     ya en formato navegable.
//   - obtenerDocumentoReserva() y los returns de "duplicado" de
//     generarTicketCita / generarFacturaCita ahora también resuelven
//     al vuelo. Cubre el caso de facturas YA EXISTENTES que se
//     guardaron con la URL interna v1.0.0/v1.0.1 — al consultarlas
//     se devuelve la URL HTTPS sin tocar el CMS.
//   - Cero cambios en otros flujos: idempotencia, contador,
//     desglose IVA, reescalado líneas, JSON Verifactu-reservado.
//
// v1.0.1 (2026-06-28) — Fixes tras validación end-to-end
//   - FIX raya tachada en cabecera de tabla del PDF: eliminada
//     la línea horizontal que cruzaba el primer ítem.
//   - FIX idempotencia devolvía baseAmount/vatAmount/vatRate como
//     undefined cuando el documento ya existía. Ahora devuelve el
//     objeto completo igual que en la emisión nueva.
//   - FIX líneas no cuadraban con total cuando había descuento:
//     reescalado proporcional de cada línea para que la suma
//     coincida exactamente con totalAmount cobrado (consistencia
//     legal manteniendo "factura limpia" sin línea de descuento).
//
// v1.0.0 (2026-06-28) — Implementación inicial
//   - Dos webMethods: generarTicketCita / generarFacturaCita
//   - Arquitectura CMS-first (Opción B): NO usa wix-billing-backend.
//     El documento legal vive ÍNTEGRO en la colección Invoices.
//   - PDF propio con jsPDF (mismo patrón validado en testCheckout V1
//     y categoriasEditorLogic para subida a Wix Media).
//   - Multi-tenant: emisor (legalName, taxId, address, phone,
//     invoiceEmail, vatRate, invoiceSeries, ticketSeries,
//     invoiceStartNumber, ticketStartNumber) se lee siempre de
//     SalonConfig. CERO hardcoding del salón.
//   - Importe neto desde PaymentReservations (factura limpia: el
//     descuento ya está aplicado en el importe cobrado y no aparece
//     como línea explícita en la factura — confirmado por Jal).
//   - Contador atómico propio en InvoiceCounters (una fila por
//     seriesCode + year). Numeración custom controlada por KAMISUITE,
//     no por Wix.
//   - Idempotencia cruzada por reservaId: una reserva genera UN único
//     documento (ticket o factura, mutuamente excluyentes). Si ya
//     existe, se devuelve el existente con flag duplicado:true.
//   - 10 campos Verifactu reservados (tipoOperacion, fechaOperacion,
//     previousHash, currentHash, qrCode, pdfUrl, aeatStatus,
//     invoiceLines, rectifiesInvoiceNumber, notes). Hoy se rellenan
//     los que aplican (tipoOperacion, fechaOperacion, pdfUrl,
//     aeatStatus='no_aplica', invoiceLines, notes). Los criptográficos
//     y de envío AEAT (previousHash, currentHash, qrCode) quedan null
//     hasta que el RD Verifactu entre en vigor (moratoria hasta 2027).
//
// CONTRATO CON EL FRONTEND:
//   generarTicketCita({ reservaId })
//     → emite ticket (factura simplificada). Customer mínimo:
//       firstName + email del cliente. Sin CIF, sin razón social.
//   generarFacturaCita({ reservaId, vatId?, legalName? })
//     → emite factura completa. Si vatId/legalName se pasan en el
//       parámetro (input inline del modal), se persisten en el CRM
//       del contacto antes de emitir. Si no se pasan, se leen del CRM
//       (extendedFields['invoices.vatId']). Si faltan, error claro.
//   obtenerDocumentoReserva({ reservaId })
//     → consulta auxiliar para que el modal sepa si la reserva ya
//       tiene documento emitido y muestre badge en vez de botones.
//
// SEGURIDAD:
//   Permissions.SiteMember (operador autenticado en Recepción PRO).
//   Todas las queries a CMS con suppressAuth:true porque el operador
//   actúa sobre datos del salón, no sobre datos propios suyos.
//
// PATRONES REUTILIZADOS (verificados línea por línea):
//   - leerVatRate (cierreLogicExtendido_v1_1_4 línea 93)
//   - extraerServiciosFacturables (cierreLogicExtendido_v1_1_4 línea ~280)
//   - mediaManager.upload (categoriasEditorLogic_web línea 233)
//   - jsPDF backend (testCheckout v3.26.5 línea ~1500)
//   - contacts.getContact elevado (invoiceLogic kamisuite.com v1.3.0)
//   - bookingId = 'KRI_' + reservaId (recepcionProLogic_v1_0_31)
//   - READ-MERGE-UPDATE estricto en wixData.update
// =============================================================

import { Permissions, webMethod } from 'wix-web-module';
import wixData from 'wix-data';
import { contacts } from 'wix-crm.v2';
import { elevate } from 'wix-auth';
import { mediaManager } from 'wix-media-backend';
import { jsPDF } from 'jspdf';

// -------------------------------------------------------------
// CONSTANTES
// -------------------------------------------------------------

const VERSION = '1.0.3';
const TAG = `[FacturacionSalon][${VERSION}]`;

const COL_INVOICES    = 'Invoices';
const COL_COUNTERS    = 'InvoiceCounters';
const COL_RESERVAS    = 'KamisuiteReservations';
const COL_PAGOS       = 'PaymentReservations';
const COL_SALONCONFIG = 'SalonConfig';

const PREFIJO_PAGO = 'KRI_';                    // mismo que recepcionProLogic
const TIMEZONE     = 'Europe/Madrid';
const PDF_FOLDER   = '/Invoices';               // carpeta Wix Media

const DEFAULT_VAT_RATE       = 21;
const DEFAULT_INVOICE_SERIES = 'F';
const DEFAULT_TICKET_SERIES  = 'T';
const FIELD_VAT_ID_CRM       = 'invoices.vatId';   // system field Wix Invoices
const FIELD_LEGAL_NAME_CRM   = 'invoices.company'; // system field Wix Invoices (razón social)

const MODO_TICKET  = 'ticket';
const MODO_FACTURA = 'factura';

const TIPO_OP_TICKET  = 'F2';   // factura simplificada (Reglamento IRPF)
const TIPO_OP_FACTURA = 'F1';   // factura completa

const CMS_OPTS = { suppressAuth: true };

// =============================================================
// HELPERS — LECTURA DE DATOS
// =============================================================

// Lee la fila única de SalonConfig. Devuelve objeto con defaults
// aplicados para que el resto del código no tenga que comprobar
// cada campo. Si SalonConfig no existe (caso degradado), devuelve
// el objeto vacío con defaults para no romper la emisión.
async function _leerSalonConfig() {
  try {
    const r = await wixData.query(COL_SALONCONFIG).limit(1).find(CMS_OPTS);
    const cfg = (r.items && r.items[0]) ? r.items[0] : {};

    const vatRate = Number(cfg.vatRate);
    return {
      legalName:          String(cfg.legalName    || cfg.brandName || ''),
      brandName:          String(cfg.brandName    || cfg.legalName || ''),
      taxId:              String(cfg.taxId        || ''),
      address:            String(cfg.address      || ''),
      phone:              String(cfg.phone        || ''),
      invoiceEmail:       String(cfg.invoiceEmail || cfg.senderEmail || ''),
      vatRate:            (!isNaN(vatRate) && vatRate > 0) ? vatRate : DEFAULT_VAT_RATE,
      invoiceSeries:      String(cfg.invoiceSeries      || DEFAULT_INVOICE_SERIES),
      ticketSeries:       String(cfg.ticketSeries       || DEFAULT_TICKET_SERIES),
      invoiceStartNumber: Number(cfg.invoiceStartNumber) || 0,
      ticketStartNumber:  Number(cfg.ticketStartNumber)  || 0
    };
  } catch (e) {
    console.warn(`${TAG} Error leyendo SalonConfig: ${e.message}. Usando defaults.`);
    return {
      legalName: '', brandName: '', taxId: '', address: '', phone: '',
      invoiceEmail: '', vatRate: DEFAULT_VAT_RATE,
      invoiceSeries: DEFAULT_INVOICE_SERIES, ticketSeries: DEFAULT_TICKET_SERIES,
      invoiceStartNumber: 0, ticketStartNumber: 0
    };
  }
}

// Lee KamisuiteReservations por _id. Devuelve null si no existe.
async function _leerReserva(reservaId) {
  try {
    const r = await wixData.get(COL_RESERVAS, reservaId, CMS_OPTS);
    return r || null;
  } catch (e) {
    return null;
  }
}

// Lee PaymentReservations por bookingId = KRI_${reservaId}.
// Devuelve null si no se encuentra fila de pago (la reserva no fue
// cobrada todavía → no se puede emitir documento).
async function _leerPagoDeReserva(reservaId) {
  const bookingIdKey = `${PREFIJO_PAGO}${reservaId}`;
  try {
    const r = await wixData.query(COL_PAGOS)
      .eq('bookingId', bookingIdKey)
      .limit(1)
      .find(CMS_OPTS);
    return (r.items && r.items[0]) ? r.items[0] : null;
  } catch (e) {
    console.warn(`${TAG} Error leyendo PaymentReservations: ${e.message}`);
    return null;
  }
}

// Lee contacto CRM v2 elevado. Devuelve null si falla.
async function _leerContacto(contactId) {
  if (!contactId) return null;
  try {
    const getContactElev = elevate(contacts.getContact);
    return await getContactElev(contactId);
  } catch (e) {
    console.warn(`${TAG} Error leyendo CRM contact ${contactId}: ${e.message}`);
    return null;
  }
}

// Idempotencia: ¿ya existe documento VIGENTE (ticket o factura) para esta reserva?
// v1.0.3: excluye documentos con status='rectificada' (tickets reemplazados
// por una factura completa posterior). Esos quedan en CMS para auditoría
// pero no bloquean nuevas operaciones ni se devuelven al frontend como
// "documento actual". Resultado:
//   - Si solo hay ticket vigente → devuelve el ticket
//   - Si hay factura vigente     → devuelve la factura (haya rectificado un
//                                   ticket previamente o no)
//   - Si solo hay ticket rectificado y nada más → devuelve null
//   - Sin documentos             → devuelve null
async function _buscarDocumentoExistente(reservaId) {
  try {
    const r = await wixData.query(COL_INVOICES)
      .eq('reservaId', reservaId)
      .ne('status', 'rectificada')
      .descending('_createdDate')   // por si hubiera más de uno, el más reciente
      .limit(1)
      .find(CMS_OPTS);
    return (r.items && r.items[0]) ? r.items[0] : null;
  } catch (e) {
    console.warn(`${TAG} Error en idempotencia: ${e.message}`);
    return null;
  }
}

// =============================================================
// HELPERS — PARSEO Y CÁLCULO
// =============================================================

// Parsea PaymentReservations.descripcion → array de líneas facturables.
// Patrón reutilizado de cierreLogicExtendido_v1_1_4 (extraerServiciosFacturables).
// Filtra:
//   - tokens 🛒 (productos POS): SE INCLUYEN, son facturables
//   - tokens 🌈 Promo / 🏷️ Descuento: se descartan (factura LIMPIA, confirmado)
//   - servicios con precio 0 (Lavado, Proceso, Secado): se descartan
function _parsearLineasFacturables(descripcion) {
  if (!descripcion) return [];
  const out = [];
  const tokens = String(descripcion).split(/,\s*/);
  for (const raw of tokens) {
    const token = raw.trim();
    if (!token) continue;
    // Descuentos/promos: NO entran en la factura
    if (token.startsWith('🌈') || token.startsWith('🏷')) continue;

    // Productos POS: igual que servicios pero con prefijo 🛒
    const esProducto = token.startsWith('🛒');
    const limpio = esProducto ? token.replace(/^🛒\s*/, '') : token;

    // Patrón "Nombre (X€)" o "Nombre xN (X€)"
    const m = limpio.match(/^(.+?)\s*\(\s*([\d.,]+)\s*€?\s*\)\s*$/);
    if (!m) continue;
    let nombre = m[1].trim();
    const precio = parseFloat(m[2].replace(',', '.')) || 0;
    if (precio <= 0) continue;

    // Cantidad en "Nombre xN"
    let cantidad = 1;
    const qty = nombre.match(/^(.+?)\s+x(\d+)\s*$/i);
    if (qty) {
      nombre = qty[1].trim();
      cantidad = parseInt(qty[2], 10) || 1;
    }

    out.push({
      nombre,
      cantidad,
      subtotal: precio,
      precioUnit: cantidad > 0 ? precio / cantidad : precio,
      tipo: esProducto ? 'producto' : 'servicio'
    });
  }
  return out;
}

// Desglosa un total con IVA incluido en base + cuota.
// Ej: 121€ con vatRate=21 → base=100, cuota=21.
function _desglosarIVA(totalConIVA, vatRate) {
  const total = Number(totalConIVA) || 0;
  const rate = Number(vatRate) || 0;
  const divisor = 1 + (rate / 100);
  const base = Math.round((total / divisor) * 100) / 100;
  const cuota = Math.round((total - base) * 100) / 100;
  return { base, cuota };
}

function _round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

// Formato fecha humano para PDF y concepto.
function _formatFechaCorta(d) {
  if (!d) return '';
  const dt = (d instanceof Date) ? d : new Date(d);
  if (isNaN(dt.getTime())) return '';
  return dt.toLocaleDateString('es-ES', {
    timeZone: TIMEZONE, day: '2-digit', month: '2-digit', year: 'numeric'
  });
}

function _formatHora(d) {
  if (!d) return '';
  const dt = (d instanceof Date) ? d : new Date(d);
  if (isNaN(dt.getTime())) return '';
  return dt.toLocaleTimeString('es-ES', {
    timeZone: TIMEZONE, hour: '2-digit', minute: '2-digit', hour12: false
  });
}

function _formatEUR(n) {
  return `${_round2(n).toFixed(2)} €`;
}

// =============================================================
// HELPER — CONTADOR ATÓMICO
// =============================================================

// Incrementa el contador (seriesCode, year). Si la fila no existe,
// la crea inicializada con startNumber (campo de SalonConfig).
// Devuelve el número emitido (entero) o null si falla.
//
// READ-MERGE-UPDATE estricto: leemos la fila completa, mutamos
// lastNumber, y actualizamos. Nunca wixData.update con objeto parcial.
async function _incrementarContador(seriesCode, year, startNumber) {
  try {
    const r = await wixData.query(COL_COUNTERS)
      .eq('seriesCode', seriesCode)
      .eq('year', year)
      .limit(1)
      .find(CMS_OPTS);

    let row;
    if (r.items.length === 0) {
      // Primera factura del año para esta serie: inicializar
      const inicial = {
        seriesCode,
        year,
        lastNumber: Number(startNumber) || 0
      };
      row = await wixData.insert(COL_COUNTERS, inicial, CMS_OPTS);
    } else {
      row = r.items[0];
    }

    // Incrementar (READ-MERGE-UPDATE)
    const next = (Number(row.lastNumber) || 0) + 1;
    row.lastNumber = next;
    await wixData.update(COL_COUNTERS, row, CMS_OPTS);

    return next;
  } catch (e) {
    console.error(`${TAG} ❌ _incrementarContador ${seriesCode}-${year}: ${e.message}`);
    return null;
  }
}

// Formatea el número con padding fijo de 4 dígitos: F-2026-0001
function _formatearNumero(seriesCode, year, n) {
  const padded = String(n).padStart(4, '0');
  return `${seriesCode}-${year}-${padded}`;
}

// =============================================================
// HELPER — GENERACIÓN DEL PDF
// =============================================================

// Genera el PDF del documento (ticket o factura). Devuelve Buffer
// listo para subir a Wix Media. Layout sobrio en blanco y negro,
// sin colores corporativos para mantenerlo neutral entre salones.
// El logo del salón NO se integra en v1.0.0 — requiere conversión
// de wix:image://... a base64 que es trabajo aparte. Reservado.
function _generarPdfBuffer({ documento, salonConfig, lineas, ivaDesglose }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = 210;
  let y = 18;

  // ── Cabecera: emisor ──────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  const titularLinea = salonConfig.legalName || salonConfig.brandName || '—';
  doc.text(titularLinea, 18, y);
  y += 6;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  if (salonConfig.taxId)   { doc.text(`CIF/NIF: ${salonConfig.taxId}`, 18, y); y += 4; }
  if (salonConfig.address) { doc.text(salonConfig.address, 18, y); y += 4; }
  const contactLine = [salonConfig.phone, salonConfig.invoiceEmail].filter(Boolean).join(' · ');
  if (contactLine) { doc.text(contactLine, 18, y); y += 4; }

  // ── Tipo de documento + número + fecha ────────────────────
  y += 6;
  doc.setLineWidth(0.3);
  doc.line(18, y, pageW - 18, y);
  y += 7;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  const titulo = (documento.modo === MODO_TICKET) ? 'TICKET' : 'FACTURA';
  doc.text(titulo, 18, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Nº: ${documento.invoiceNumber}`, 18, y + 6);
  doc.text(`Fecha: ${_formatFechaCorta(documento.issueDate)}`, pageW - 18, y + 6, { align: 'right' });
  y += 14;

  // ── Datos del receptor ────────────────────────────────────
  doc.setLineWidth(0.2);
  doc.line(18, y, pageW - 18, y);
  y += 6;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Cliente:', 18, y);
  y += 5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(documento.clientName || '—', 22, y);
  y += 5;
  if (documento.modo === MODO_FACTURA) {
    if (documento.clientLegalName) {
      doc.text(documento.clientLegalName, 22, y);
      y += 5;
    }
    if (documento.clientVatId) {
      doc.text(`CIF/NIF: ${documento.clientVatId}`, 22, y);
      y += 5;
    }
  }

  // ── Tabla de líneas ───────────────────────────────────────
  y += 4;
  doc.setLineWidth(0.2);
  doc.line(18, y, pageW - 18, y);
  y += 6;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('Concepto', 18, y);
  doc.text('Cant.', 130, y, { align: 'right' });
  doc.text('Importe', pageW - 18, y, { align: 'right' });
  y += 6;
  // v1.0.1: eliminada la línea horizontal bajo la cabecera que cruzaba
  // el primer ítem de la tabla. El espaciado de 6mm tras la cabecera
  // ya separa visualmente sin necesidad de una raya.

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  for (const linea of lineas) {
    if (y > 260) { doc.addPage(); y = 20; }
    const nombre = String(linea.nombre || '').substring(0, 72);
    doc.text(nombre, 18, y);
    doc.text(String(linea.cantidad || 1), 130, y, { align: 'right' });
    doc.text(_formatEUR(linea.subtotal), pageW - 18, y, { align: 'right' });
    y += 5;
  }

  // ── Totales ───────────────────────────────────────────────
  y += 4;
  doc.setLineWidth(0.3);
  doc.line(110, y, pageW - 18, y);
  y += 6;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('Base imponible:', 110, y);
  doc.text(_formatEUR(ivaDesglose.base), pageW - 18, y, { align: 'right' });
  y += 5;
  doc.text(`IVA (${documento.vatRate}%):`, 110, y);
  doc.text(_formatEUR(ivaDesglose.cuota), pageW - 18, y, { align: 'right' });
  y += 5;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('TOTAL:', 110, y);
  doc.text(_formatEUR(documento.totalAmount), pageW - 18, y, { align: 'right' });
  y += 8;

  // ── Pie: método de pago + agradecimiento ──────────────────
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  if (documento.paymentMethod) {
    doc.text(`Método de pago: ${documento.paymentMethod}`, 18, y);
    y += 5;
  }
  y += 4;
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text('Gracias por su confianza.', 18, y);

  // ── Convertir a Buffer ────────────────────────────────────
  const arrayBuffer = doc.output('arraybuffer');
  return Buffer.from(arrayBuffer);
}

// Sube el PDF a Wix Media. Devuelve fileUrl o null si falla.
// Patrón literal de categoriasEditorLogic_web línea 233.
// =============================================================
// HELPER — RESOLVER URL PÚBLICA HTTPS DEL PDF  (v1.0.2)
// =============================================================
// mediaManager.upload devuelve fileUrl en formato Wix interno
// (wix:document://v1/HASH.pdf/FILENAME.pdf). Esa URL NO es navegable
// desde un browser. Para que window.open(pdfUrl) funcione hay que
// pedirle a Wix la URL HTTPS firmada.
//
// mediaManager.getDownloadUrl(fileUrl, expirationTime) es la API
// oficial Wix para ello. expirationTime en segundos (default 600).
// Aquí 3600 = 1 hora, suficiente para una sesión de mostrador. Si
// el operador abre el modal mucho después, al volver a consultar
// la reserva (obtenerDocumentoReserva) se regenera al vuelo.
//
// Defensivo: la API puede devolver string directo o {downloadUrl}.
// Aceptamos ambos shapes.
// =============================================================
async function _resolverPdfUrlHttps(rawFileUrl) {
  if (!rawFileUrl) return '';
  // Ya HTTPS → tal cual
  if (rawFileUrl.startsWith('http://') || rawFileUrl.startsWith('https://')) {
    return rawFileUrl;
  }
  // wix:document://... → resolver con Wix Media API
  if (rawFileUrl.startsWith('wix:document://')) {
    try {
      const result = await mediaManager.getDownloadUrl(rawFileUrl, 3600);
      if (typeof result === 'string' && result) return result;
      if (result && typeof result === 'object' && result.downloadUrl) return result.downloadUrl;
      console.warn(`${TAG} ⚠️ getDownloadUrl devolvió shape inesperado:`, result);
      return rawFileUrl; // fallback: al menos devolvemos algo
    } catch (e) {
      console.error(`${TAG} ❌ getDownloadUrl falló: ${e.message}`);
      return rawFileUrl;
    }
  }
  return rawFileUrl;
}

async function _subirPdf(buffer, fileName) {
  try {
    const uploadResult = await mediaManager.upload(
      PDF_FOLDER,
      buffer,
      fileName,
      {
        mediaOptions: {
          mimeType: 'application/pdf',
          mediaType: 'document'
        },
        metadataOptions: {
          isPrivate: false,
          isVisitorUpload: false
        }
      }
    );
    const rawFileUrl = uploadResult?.fileUrl || null;
    if (!rawFileUrl) return null;
    // v1.0.2: resolver a URL HTTPS firmada para que el frontend pueda
    // abrirla directamente con window.open. La URL wix:document:// no
    // es navegable desde un browser y Chrome la trataba como query Google.
    const httpsUrl = await _resolverPdfUrlHttps(rawFileUrl);
    return httpsUrl || rawFileUrl;
  } catch (e) {
    console.error(`${TAG} ❌ Subida PDF falló: ${e.message}`);
    return null;
  }
}

// =============================================================
// HELPER — RESOLVER DATOS DEL RECEPTOR (modo factura)
// =============================================================
// Cascada:
//   1. Si vatId/legalName vienen en el parámetro del webMethod
//      (input inline del modal), se persisten en el CRM del contacto
//      y se usan tal cual.
//   2. Si no vienen, se leen del CRM (extendedFields).
//   3. Si tampoco están en CRM → error claro (el frontend debe pedirlos).
//
// Devuelve { ok, vatId, legalName, error? }.
async function _resolverDatosReceptor({ contactId, vatId, legalName }) {
  const vId = (vatId || '').trim();
  const lName = (legalName || '').trim();

  // Caso 1: el operador acaba de añadirlos → persistir y devolver.
  if (vId) {
    if (contactId) {
      try {
        const updateContactElev = elevate(contacts.updateContact);
        const ext = { [FIELD_VAT_ID_CRM]: vId };
        if (lName) ext[FIELD_LEGAL_NAME_CRM] = lName;
        await updateContactElev(contactId, {
          info: { extendedFields: { items: ext } }
        });
        console.log(`${TAG} ✅ vatId/legalName persistidos en CRM ${contactId.substring(0, 8)}`);
      } catch (e) {
        console.warn(`${TAG} ⚠️ No se pudo persistir vatId en CRM: ${e.message}. Continuando con la emisión.`);
      }
    }
    return { ok: true, vatId: vId, legalName: lName };
  }

  // Caso 2: leer del CRM
  if (!contactId) {
    return { ok: false, error: 'Cliente sin contactId — no se puede emitir factura completa.' };
  }
  const contact = await _leerContacto(contactId);
  if (!contact) {
    return { ok: false, error: 'No se pudo leer el contacto CRM.' };
  }
  const ef = contact?.info?.extendedFields || {};
  // Soporta tanto el formato plano (key→value) como items[].
  let efVat = ef[FIELD_VAT_ID_CRM] || '';
  let efLegal = ef[FIELD_LEGAL_NAME_CRM] || '';
  if (!efVat && Array.isArray(ef.items)) {
    for (const it of ef.items) {
      if (it.key === FIELD_VAT_ID_CRM) efVat = it.value || '';
      if (it.key === FIELD_LEGAL_NAME_CRM) efLegal = it.value || '';
    }
  }
  if (!efVat) {
    return { ok: false, error: 'Cliente sin CIF/NIF en su ficha — añádelo antes de emitir factura completa.' };
  }
  return { ok: true, vatId: String(efVat), legalName: String(efLegal || '') };
}

// =============================================================
// FUNCIÓN CORE — EMITIR DOCUMENTO (ticket o factura)
// =============================================================
async function _emitirDocumento({ reservaId, modo, vatId, legalName }) {
  // ── 1. Validar inputs ────────────────────────────────────
  if (!reservaId) {
    return { ok: false, version: VERSION, error: 'Falta reservaId' };
  }
  if (modo !== MODO_TICKET && modo !== MODO_FACTURA) {
    return { ok: false, version: VERSION, error: `Modo no válido: ${modo}` };
  }

  // ── 2. Idempotencia refinada (v1.0.3: permite upgrade ticket→factura) ──
  // Reglas:
  //   · Sin documento previo                       → emite normal
  //   · Ticket existente + se pide ticket          → bloqueado (duplicado)
  //   · Ticket existente + se pide factura         → UPGRADE: emite factura
  //                                                  rectificativa y marca
  //                                                  el ticket como rectificada.
  //   · Factura existente (cualquier modo pedido)  → bloqueado (duplicado)
  const existente = await _buscarDocumentoExistente(reservaId);
  let rectificaTicket = null;   // si != null, al final marcamos este ticket
  if (existente) {
    const esTicketExistente  = (existente.modo === MODO_TICKET);
    const esFacturaExistente = (existente.modo === MODO_FACTURA);
    const pideTicket  = (modo === MODO_TICKET);
    const pideFactura = (modo === MODO_FACTURA);

    // Caso UPGRADE: hay ticket vigente y se pide factura → emite rectificativa
    if (esTicketExistente && pideFactura) {
      console.log(`${TAG} 🔄 Upgrade ticket→factura: reserva ${reservaId.substring(0, 8)} tenía ${existente.invoiceNumber}, ahora se emite factura rectificativa`);
      rectificaTicket = existente;
      // Continúa con el flujo normal de emisión más abajo, pero al final
      // marcará el ticket como rectificada y rellenará rectifiesInvoiceNumber.
    } else {
      // Resto de casos: bloqueado (devuelve el documento existente).
      console.log(`${TAG} ⚠️ Reserva ${reservaId.substring(0, 8)} ya tiene documento ${existente.invoiceNumber} (modo=${existente.modo}); modo solicitado=${modo} → duplicado`);
      const pdfUrl = await _resolverPdfUrlHttps(existente.pdfUrl || '');
      return {
        ok: true,
        version: VERSION,
        duplicado: true,
        modo: existente.modo,
        invoiceNumber: existente.invoiceNumber,
        pdfUrl,
        invoiceId: existente._id,
        totalAmount: existente.totalAmount,
        baseAmount: existente.baseAmount,
        vatAmount: existente.vatAmount,
        vatRate: existente.vatRate
      };
    }
  }

  // ── 3. Leer reserva ──────────────────────────────────────
  const reserva = await _leerReserva(reservaId);
  if (!reserva) {
    return { ok: false, version: VERSION, error: `Reserva no encontrada: ${reservaId}` };
  }
  if (reserva.status !== 'PAGADO') {
    return { ok: false, version: VERSION, error: 'La reserva debe estar PAGADA para emitir documento.' };
  }

  // ── 4. Leer pago real (importe neto + descripción definitiva) ─
  const pago = await _leerPagoDeReserva(reservaId);
  if (!pago) {
    return { ok: false, version: VERSION, error: 'No se encontró el cobro de esta reserva.' };
  }
  const totalAmount = _round2(pago.importeTotal);
  if (totalAmount <= 0) {
    return { ok: false, version: VERSION, error: 'El importe cobrado es cero — no se puede emitir documento.' };
  }

  // ── 5. Leer SalonConfig ──────────────────────────────────
  const salonCfg = await _leerSalonConfig();

  // ── 6. Resolver datos del receptor (solo modo factura) ───
  let receptor = { vatId: '', legalName: '' };
  if (modo === MODO_FACTURA) {
    const res = await _resolverDatosReceptor({
      contactId: reserva.contactId || pago.contactId || '',
      vatId,
      legalName
    });
    if (!res.ok) {
      return { ok: false, version: VERSION, error: res.error };
    }
    receptor = { vatId: res.vatId, legalName: res.legalName };
  }

  // ── 7. Parsear líneas facturables ────────────────────────
  const lineas = _parsearLineasFacturables(pago.descripcion || '');
  if (lineas.length === 0) {
    // Fallback: si la descripción está vacía, una línea genérica
    lineas.push({
      nombre: reserva.title || 'Servicio',
      cantidad: 1,
      subtotal: totalAmount,
      precioUnit: totalAmount,
      tipo: 'servicio'
    });
  }

  // v1.0.1: Reescalado proporcional de líneas para que la suma cuadre
  // con totalAmount (importe neto cobrado). Necesario cuando hay
  // descuentos descartados al parsear (factura limpia, decisión Jal):
  // las líneas vienen con precios brutos pero el total es el neto.
  // Sin reescalado, la factura no cuadraría (líneas ≠ base+IVA).
  // El último ítem absorbe el residuo de redondeo para que cuadre
  // al céntimo exacto.
  {
    const sumaBruta = lineas.reduce((acc, l) => acc + (Number(l.subtotal) || 0), 0);
    if (sumaBruta > 0 && Math.abs(sumaBruta - totalAmount) > 0.01) {
      const factor = totalAmount / sumaBruta;
      for (const l of lineas) {
        l.subtotal = _round2((Number(l.subtotal) || 0) * factor);
        const cant = Number(l.cantidad) || 1;
        l.precioUnit = cant > 0 ? _round2(l.subtotal / cant) : l.subtotal;
      }
      // Ajuste residual por redondeos: última línea absorbe el delta.
      const sumaAjustada = lineas.reduce((acc, l) => acc + (Number(l.subtotal) || 0), 0);
      const delta = _round2(totalAmount - sumaAjustada);
      if (Math.abs(delta) > 0.001) {
        const last = lineas[lineas.length - 1];
        last.subtotal = _round2((Number(last.subtotal) || 0) + delta);
        const cantLast = Number(last.cantidad) || 1;
        last.precioUnit = cantLast > 0 ? _round2(last.subtotal / cantLast) : last.subtotal;
      }
      console.log(`${TAG} 🔧 Líneas reescaladas: bruto=${_round2(sumaBruta)}€ → neto=${totalAmount}€ (factor=${factor.toFixed(4)})`);
    }
  }

  // ── 8. Desglosar IVA sobre el total real cobrado ─────────
  const ivaDesglose = _desglosarIVA(totalAmount, salonCfg.vatRate);

  // ── 9. Determinar serie + incrementar contador ───────────
  const seriesCode = (modo === MODO_TICKET) ? salonCfg.ticketSeries : salonCfg.invoiceSeries;
  const startNum   = (modo === MODO_TICKET) ? salonCfg.ticketStartNumber : salonCfg.invoiceStartNumber;
  const year = new Date().getFullYear();
  const num = await _incrementarContador(seriesCode, year, startNum);
  if (!num) {
    return { ok: false, version: VERSION, error: 'No se pudo asignar número de documento.' };
  }
  const invoiceNumber = _formatearNumero(seriesCode, year, num);

  // ── 10. Construir objeto documento (en memoria) ──────────
  const issueDate = new Date();
  const fechaServicio = reserva.fechaReserva ? new Date(reserva.fechaReserva) : issueDate;
  const concept = `Servicios ${salonCfg.brandName || salonCfg.legalName || ''} - ${_formatFechaCorta(fechaServicio)}`.trim();

  const clientName = (pago.nombreCliente || reserva.clientName || 'Cliente').trim();
  const clientEmail = String(reserva.contactEmail || reserva.email || '').trim();
  const clientPhone = String(reserva.clientPhone || reserva.contactPhone || '').trim();

  const documento = {
    invoiceNumber,
    seriesCode,
    modo,
    reservaId,
    paymentReservationId: pago._id || '',
    wixInvoiceId: '',            // reservado — no usamos Wix Invoices
    wixInvoiceVersion: 0,        // reservado
    previewUrl: '',              // reservado — no usamos Wix Invoices

    clientName,
    clientEmail,
    clientPhone,
    clientVatId:    receptor.vatId,
    clientLegalName: receptor.legalName,

    concept,
    baseAmount:  ivaDesglose.base,
    vatRate:     salonCfg.vatRate,
    vatAmount:   ivaDesglose.cuota,
    totalAmount,
    paymentMethod: String(pago.tipoPago || ''),

    issueDate,
    status: 'emitida',

    // Verifactu-ready (RD moratoria hasta 2027)
    tipoOperacion: (modo === MODO_TICKET) ? TIPO_OP_TICKET : TIPO_OP_FACTURA,
    fechaOperacion: fechaServicio,
    previousHash: '',            // null hasta Verifactu activo
    currentHash: '',             // null hasta Verifactu activo
    qrCode: '',                  // null hasta Verifactu activo
    pdfUrl: '',                  // se rellena tras subida
    aeatStatus: 'no_aplica',     // hoy no aplica; cambiará cuando Verifactu
    invoiceLines: { items: lineas }, // desglose íntegro de líneas
    // v1.0.3: si es rectificativa (upgrade ticket→factura), apuntar al
    // ticket original que reemplaza y dejar nota descriptiva.
    rectifiesInvoiceNumber: rectificaTicket ? rectificaTicket.invoiceNumber : '',
    notes: rectificaTicket
      ? `Factura rectificativa. Reemplaza al ticket ${rectificaTicket.invoiceNumber} emitido el ${rectificaTicket.issueDate ? new Date(rectificaTicket.issueDate).toISOString().slice(0, 10) : ''}.`
      : ''
  };

  // ── 11. Generar PDF ──────────────────────────────────────
  let pdfBuffer;
  try {
    pdfBuffer = _generarPdfBuffer({
      documento,
      salonConfig: salonCfg,
      lineas,
      ivaDesglose
    });
  } catch (pdfErr) {
    console.error(`${TAG} ❌ Error generando PDF: ${pdfErr.message}`);
    return { ok: false, version: VERSION, error: `Error generando PDF: ${pdfErr.message}` };
  }

  // ── 12. Subir PDF a Wix Media ────────────────────────────
  const fileName = `${invoiceNumber}.pdf`;
  const pdfUrl = await _subirPdf(pdfBuffer, fileName);
  if (pdfUrl) {
    documento.pdfUrl = pdfUrl;
  } else {
    console.warn(`${TAG} ⚠️ PDF generado pero subida falló — se inserta sin pdfUrl.`);
  }

  // ── 13. Insertar en Invoices ─────────────────────────────
  let inserted;
  try {
    inserted = await wixData.insert(COL_INVOICES, documento, CMS_OPTS);
  } catch (insErr) {
    console.error(`${TAG} ❌ Error insertando en ${COL_INVOICES}: ${insErr.message}`);
    return {
      ok: false,
      version: VERSION,
      error: `Documento generado pero no se pudo guardar: ${insErr.message}`,
      invoiceNumber,
      pdfUrl: documento.pdfUrl
    };
  }

  console.log(`${TAG} ✅ ${modo.toUpperCase()} emitido: ${invoiceNumber} | total=${totalAmount}€ | reserva=${reservaId.substring(0, 8)}`);

  // ── 14. Si es rectificativa: marcar el ticket original como rectificada ──
  // READ-MERGE-UPDATE atómico (regla absoluta del proyecto: wixData.update
  // reemplaza el documento entero). Si fallase, rollback de la factura
  // recién creada para evitar quedar con dos documentos activos.
  if (rectificaTicket) {
    try {
      const ticketFresh = await wixData.get(COL_INVOICES, rectificaTicket._id, CMS_OPTS);
      if (!ticketFresh) {
        throw new Error('Ticket original ya no existe');
      }
      const merged = {
        ...ticketFresh,
        status: 'rectificada',
        notes: (ticketFresh.notes ? ticketFresh.notes + ' · ' : '') +
               `Rectificado por ${invoiceNumber} el ${new Date().toISOString().slice(0, 10)}.`
      };
      await wixData.update(COL_INVOICES, merged, CMS_OPTS);
      console.log(`${TAG} 🔁 Ticket ${rectificaTicket.invoiceNumber} marcado como rectificada por ${invoiceNumber}`);
    } catch (rectErr) {
      console.error(`${TAG} ❌ Falló marcar ticket como rectificada: ${rectErr.message} → rollback factura ${invoiceNumber}`);
      // Rollback: borrar la factura recién creada para no quedar en estado
      // inconsistente (ambos documentos activos a la vez).
      try {
        await wixData.remove(COL_INVOICES, inserted._id, CMS_OPTS);
      } catch (rbErr) {
        console.error(`${TAG} ❌ Rollback también falló: ${rbErr.message}. Estado inconsistente — revisar manualmente Invoices.`);
      }
      return {
        ok: false,
        version: VERSION,
        error: `No se pudo marcar el ticket ${rectificaTicket.invoiceNumber} como rectificado: ${rectErr.message}`
      };
    }
  }

  return {
    ok: true,
    version: VERSION,
    duplicado: false,
    modo,
    invoiceNumber,
    pdfUrl: documento.pdfUrl,
    invoiceId: inserted._id,
    totalAmount,
    baseAmount: documento.baseAmount,
    vatAmount: documento.vatAmount,
    vatRate: documento.vatRate,
    // v1.0.3: si fue upgrade ticket→factura, datos del ticket reemplazado
    rectifica: rectificaTicket ? {
      invoiceNumber: rectificaTicket.invoiceNumber,
      invoiceId: rectificaTicket._id
    } : null
  };
}

// =============================================================
// WEBMETHODS PÚBLICOS
// =============================================================

// Emitir TICKET (factura simplificada) para una cita PAGADA.
// Customer mínimo: nombre + email del cliente. Sin CIF, sin razón social.
// Límites legales (España): hasta 400€ + IVA por operación,
// hasta 3.000€ + IVA total. Estos límites NO se validan aquí —
// queda como responsabilidad del salón decidir cuándo usar ticket
// vs factura completa.
export const generarTicketCita = webMethod(
  Permissions.SiteMember,
  async ({ reservaId } = {}) => {
    return await _emitirDocumento({ reservaId, modo: MODO_TICKET });
  }
);

// Emitir FACTURA COMPLETA para una cita PAGADA.
// Si vatId/legalName se pasan en el parámetro, se persisten en el CRM
// del contacto antes de emitir. Si no vienen, se leen del CRM. Si
// tampoco están en CRM → error claro.
export const generarFacturaCita = webMethod(
  Permissions.SiteMember,
  async ({ reservaId, vatId, legalName } = {}) => {
    return await _emitirDocumento({ reservaId, modo: MODO_FACTURA, vatId, legalName });
  }
);

// Consulta auxiliar: ¿qué documento (si lo hay) tiene esta reserva?
// El frontend la usa al abrir el modal de cita PAGADA para decidir
// si muestra los botones [Ticket] [Factura] o el badge "Ya facturado".
export const obtenerDocumentoReserva = webMethod(
  Permissions.SiteMember,
  async ({ reservaId } = {}) => {
    try {
      if (!reservaId) {
        return { ok: false, version: VERSION, error: 'Falta reservaId' };
      }
      const doc = await _buscarDocumentoExistente(reservaId);
      if (!doc) {
        return { ok: true, version: VERSION, existe: false };
      }
      // v1.0.2: si el documento se guardó con la URL interna wix:document://
      // (versiones 1.0.0 y 1.0.1), la resolvemos al vuelo para que el
      // frontend reciba directamente la URL HTTPS navegable. No tocamos
      // la fila en CMS — la resolución es barata y aporta frescura del
      // token de descarga.
      const pdfUrl = await _resolverPdfUrlHttps(doc.pdfUrl || '');
      // El widget v1.1.56 lee p.documento.* (estructura anidada).
      const documento = {
        modo: doc.modo,
        invoiceNumber: doc.invoiceNumber,
        pdfUrl,
        invoiceId: doc._id,
        issueDate: doc.issueDate,
        totalAmount: doc.totalAmount,
        baseAmount: doc.baseAmount,
        vatAmount: doc.vatAmount,
        vatRate: doc.vatRate,
        clientVatId: doc.clientVatId || '',
        clientLegalName: doc.clientLegalName || ''
      };
      // Devolvemos también los campos en raíz por compat con consumidores
      // antiguos del backend (si los hubiera).
      return {
        ok: true,
        version: VERSION,
        existe: true,
        documento,
        ...documento
      };
    } catch (e) {
      console.error(`${TAG} ❌ obtenerDocumentoReserva: ${e.message}`);
      return { ok: false, version: VERSION, error: e.message };
    }
  }
);