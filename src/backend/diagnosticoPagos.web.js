// =====================================================
// KAMISUITE - Backend Diagnóstico Reservas
// =====================================================
// VERSION: 3.1.0
// FECHA: 11 de mayo de 2026
//
// CHANGELOG:
//   v3.4.0 — NEW: diagnosticarRango({ desde, hasta }). Diagnóstico de
//             todas las reservas de un rango de fechas sin filtrar por
//             cliente. Helpers de agrupación extraídos como funciones
//             compartidas (_agruparYConstruir, _resolverCidBooking).
//             Agrupación por contactId + contigüidad para rango multi-cliente.
//   v3.3.0 — Agrupación por contigüidad temporal (patrón testCheckout
//             v3.26.5, GAP ≤90 min). Fases técnicas ocultas del título.
//             Detalle expandible con servicios individuales del pack.
//             Status/Payment del grupo: peor caso gana.
//   v3.2.0 — bkContactId resuelto contra CRM por tel/nombre (patrón
//             testCheckout v3.26.5). Añadido bkNombre, bkTelefono, bkEmail
//             en cada fila para diagnóstico de contactos duplicados.
//   v3.1.0 — Búsqueda en PaymentReservations por contactId + nombre
//             (caza contactos duplicados). Filas CMS-only para registros
//             que no están en la ventana de Wix Bookings. bkContactId
//             completo (no truncado).
//   v3.0.0 — Reescritura completa. Fuente primaria Wix Bookings,
//             cruce con PaymentReservations, matching por tel/nombre.
//
// PROPÓSITO:
//   Herramienta de diagnóstico para responder "¿qué pasó con esta reserva?"
//   Cruza Wix Bookings (fuente de verdad del booking) con PaymentReservations
//   (ledger interno de cobros manuales) para dar visibilidad completa.
//
// FUNCIONES:
//   - diagnosticarCliente({ contactId, dias })
//     Devuelve todos los bookings del cliente en los últimos N días,
//     con paymentStatus, método de pago, presencia en CMS, y origen inferido.
//
// PATRONES REUTILIZADOS:
//   - queryExtendedBookings: patrón de calendarioVista.web.js v1.3.2
//   - Matching por contactId/tel/nombre: patrón de fichaClienteLogic.web.js v1.7.0
//   - Extended fields de pago: patrón de testCheckout.web.js v3.26.5
//
// PERMISOS: Permissions.Anyone + suppressAuth: true (patrón KAMISUITE confirmado)
//
// FUNCIONES:
//   - buscarContactosDiag({ query })
//     Buscador CRM con cache singleton (patrón testCheckout v3.26.4)
//   - diagnosticarCliente({ contactId, dias })
//     Diagnóstico completo de bookings del cliente
//
// ARCHIVO: backend/diagnosticoPagos.web.js
// =====================================================

import { Permissions, webMethod } from 'wix-web-module';
import { extendedBookings } from 'wix-bookings.v2';
import { elevate } from 'wix-auth';
import { contacts } from 'wix-crm-backend';
import wixData from 'wix-data';

// ═══════════════════════════════════════════════════════════════════════════
// BUSCADOR CRM — cache singleton con TTL (patrón testCheckout v3.26.4)
// ═══════════════════════════════════════════════════════════════════════════

let _contactosCache = null;
let _contactosCacheTs = 0;
const CONTACTOS_TTL_MS = 5 * 60 * 1000; // 5 minutos

async function _cargarContactosCache() {
  const ahora = Date.now();
  if (_contactosCache && (ahora - _contactosCacheTs) < CONTACTOS_TTL_MS) {
    return _contactosCache;
  }

  const todos = [];
  let skip = 0;
  const PAGE = 1000;
  let hasMore = true;

  try {
    const elevatedQuery = elevate(contacts.queryContacts);
    while (hasMore) {
      const result = await elevatedQuery()
        .skip(skip)
        .limit(PAGE)
        .find();
      const items = result?.items || [];
      for (const c of items) {
        const infoName = c?.info?.name || {};
        const first = String(infoName.first || '').trim();
        const last = String(infoName.last || '').trim();
        const full = `${first} ${last}`.trim();
        if (!full) continue;

        const emails = Array.isArray(c?.info?.emails) ? c.info.emails : [];
        const phones = Array.isArray(c?.info?.phones) ? c.info.phones : [];

        todos.push({
          contactId: c._id || c.id,
          nombre: first,
          apellido: last,
          nombreCompleto: full,
          email: emails[0]?.email || '',
          telefono: phones[0]?.phone || ''
        });
      }
      hasMore = items.length === PAGE;
      skip += PAGE;
      if (skip >= 10000) hasMore = false;
    }

    _contactosCache = todos;
    _contactosCacheTs = ahora;
    console.log(`${TAG} Cache contactos: ${todos.length}`);
  } catch (e) {
    console.error(`${TAG} Error cargando contactos:`, e.message);
    if (_contactosCache) return _contactosCache;
    _contactosCache = [];
  }

  return _contactosCache;
}

export const buscarContactosDiag = webMethod(
  Permissions.Anyone,
  async ({ query }) => {
    try {
      const todos = await _cargarContactosCache();
      if (!query || String(query).trim().length < 2) {
        return { ok: true, clientes: [], total: todos.length };
      }

      const tokens = String(query).toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .split(/\s+/).filter(Boolean);

      if (tokens.length === 0) {
        return { ok: true, clientes: [], total: todos.length };
      }

      const resultados = todos.filter(c => {
        const haystack = `${c.nombreCompleto} ${c.email} ${c.telefono}`
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '');
        return tokens.every(t => haystack.includes(t));
      }).slice(0, 8);

      return { ok: true, clientes: resultados, total: todos.length };
    } catch (e) {
      console.error(`${TAG} buscarContactosDiag ERROR:`, e.message);
      return { ok: false, clientes: [], total: 0, error: e.message };
    }
  }
);

const VERSION = '3.5.1';
const TAG = `[DiagPagos v${VERSION}]`;

const COLECCION_PAGOS = 'PaymentReservations';
const OWNER_SITE_ID = 'd23efee3-313e-4952-b081-e0b1b75a5c3a';
const TIMEZONE_MADRID = 'Europe/Madrid';

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS (patrón fichaClienteLogic.web.js v1.7.0)
// ═══════════════════════════════════════════════════════════════════════════

function safeErr(e) {
  return { message: e?.message || String(e) };
}

function isGuid(x) {
  return typeof x === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
}

function esOwnerSite(id) {
  return String(id || '') === OWNER_SITE_ID;
}

function _normalizarTextoNombre(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function _normalizarTel(tel) {
  return String(tel || '').replace(/\D/g, '').trim();
}

function formatearContacto(contact) {
  const infoName = contact?.info?.name || {};
  const nombre   = infoName.first || contact?.name?.first || contact?.firstName || '';
  const apellido = infoName.last  || contact?.name?.last  || contact?.lastName  || '';

  const emailsArr = contact?.info?.emails || contact?.emails || [];
  const emails    = Array.isArray(emailsArr) ? emailsArr : [];
  const email     = emails[0]?.email || emails[0] || contact?.primaryEmail || '';

  const phonesArr = contact?.info?.phones || contact?.phones || [];
  const phones    = Array.isArray(phonesArr) ? phonesArr : [];
  const telefono  = phones[0]?.phone || phones[0] || contact?.primaryPhone || '';

  return {
    contactId:      contact._id || contact.id,
    nombre:         String(nombre).trim(),
    apellido:       String(apellido).trim(),
    nombreCompleto: `${nombre} ${apellido}`.trim(),
    email:          String(email).trim(),
    telefono:       String(telefono).trim()
  };
}

// Determina si un booking pertenece al cliente buscado.
// Cascada: contactId (descartando owner) → teléfono → nombre+apellido
// (patrón exacto de fichaClienteLogic.web.js v1.7.0)
function _bookingEsDelCliente(bk, cliente) {
  const cd = bk?.contactDetails || {};

  // Vía 1: contactId directo, descartando owner envenenado
  const bkCid = String(cd.contactId || bk?.contactId || '').trim();
  if (bkCid && bkCid === cliente.contactId && !esOwnerSite(bkCid)) {
    return { match: true, via: 'cid' };
  }

  // Vía 2: teléfono
  const telCliente = _normalizarTel(cliente.telefono);
  const telBk = _normalizarTel(cd.phone);
  if (telCliente && telCliente.length >= 6 && telBk === telCliente) {
    return { match: true, via: 'tel' };
  }

  // Vía 3: nombre + apellido exacto
  const nomCliente = _normalizarTextoNombre(`${cliente.nombre} ${cliente.apellido}`);
  const nomBk = _normalizarTextoNombre(`${cd.firstName || ''} ${cd.lastName || ''}`);
  if (nomCliente && nomBk && nomCliente === nomBk) {
    return { match: true, via: 'name' };
  }

  return { match: false, via: 'no_match' };
}

// Hora Madrid desde ISO (patrón fichaClienteLogic.web.js)
function _horaMadridDeISO(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString('es-ES', {
      timeZone: TIMEZONE_MADRID,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  } catch (e) {
    return '';
  }
}

// Fecha Madrid desde ISO → YYYY-MM-DD
function _diaMadridDeISO(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-CA', { timeZone: TIMEZONE_MADRID });
  } catch (e) {
    return '';
  }
}

// Leer método de pago desde extended fields del booking
// (patrón extraerServicio de testCheckout.web.js v3.26.5)
function _leerMetodoPago(bk) {
  try {
    const extFields = bk.extendedFields || {};
    const uf = extFields.namespaces?.['_user_fields']
            || extFields['_user_fields']
            || extFields;

    if (uf.pago_en_efectivo) return 'Efectivo';
    if (uf.pagotarjeta) return 'Tarjeta';
    if (uf.pago_con_bizum) return 'Bizum';
    if (uf.pago_mixto) return 'Mixto';
    return '';
  } catch (e) {
    return '';
  }
}

// Leer si es reserva de recepción desde extended fields
function _leerOrigenRecepcion(bk) {
  try {
    const extFields = bk.extendedFields || {};
    let val = '';
    if (extFields.namespaces?.['_user_fields']?.reservaderecepcion) {
      val = extFields.namespaces['_user_fields'].reservaderecepcion;
    } else if (extFields['_user_fields']?.reservaderecepcion) {
      val = extFields['_user_fields'].reservaderecepcion;
    } else if (extFields.reservaderecepcion) {
      val = extFields.reservaderecepcion;
    }
    return val === 'RECEPCION';
  } catch (e) {
    return false;
  }
}

// Inferir origen de la reserva
function _inferirOrigen(bk, esRecepcion, enCMS) {
  if (esRecepcion) return 'Recepción';

  // Si paymentStatus es PAID y no tiene registro en CMS y no es recepción
  // → probablemente pagó online o se marcó desde Dashboard
  const ps = bk.paymentStatus || '';
  if (ps === 'PAID' && !enCMS) return 'Online / Dashboard';

  // Si selectedPaymentOption existe
  const spo = bk.selectedPaymentOption || '';
  if (spo === 'ONLINE') return 'Pago Online';
  if (spo === 'OFFLINE') return 'Pago en Salón';

  return 'Web / Desconocido';
}

// ═══════════════════════════════════════════════════════════════════════════
// FUNCIÓN PRINCIPAL: diagnosticarCliente
// ═══════════════════════════════════════════════════════════════════════════

export const diagnosticarCliente = webMethod(
  Permissions.Anyone,
  async ({ contactId, dias }) => {
    try {
      if (!contactId || !isGuid(contactId)) {
        return { ok: false, error: { message: 'contactId requerido (GUID)' }, bookings: [] };
      }

      const ventana = Number.isInteger(dias) && dias > 0 && dias <= 365 ? dias : 90;
      console.log(`${TAG} diagnosticarCliente: ${contactId} (${ventana} días)`);

      // ── 1. Datos del cliente para matching ────────────────────────
      const elevatedGet = elevate(contacts.getContact);
      const contactRaw = await elevatedGet(contactId);
      if (!contactRaw) {
        return { ok: false, error: { message: `Contacto no encontrado: ${contactId}` }, bookings: [] };
      }
      const cliente = formatearContacto(contactRaw);
      console.log(`${TAG} Cliente: "${cliente.nombreCompleto}" tel=${cliente.telefono} email=${cliente.email}`);

      // ── 2. Rango temporal: hoy - ventana → hoy + 7 días ──────────
      const ahora = new Date();
      const inicio = new Date(ahora);
      inicio.setDate(inicio.getDate() - ventana);
      const fin = new Date(ahora);
      fin.setDate(fin.getDate() + 7); // incluir próximos 7 días

      const inicioISO = inicio.toISOString();
      const finISO = fin.toISOString();

      // ── 3. Query a Wix Bookings (patrón calendarioVista.web.js) ───
      const elevatedQuery = elevate(extendedBookings.queryExtendedBookings);
      const PAGE = 100;
      const MAX_TOTAL = 1000;
      let allBookings = [];
      let offset = 0;
      let hasMore = true;

      while (hasMore && offset < MAX_TOTAL) {
        const result = await elevatedQuery({
          filter: {
            $and: [
              { startDate: { $gte: inicioISO } },
              { startDate: { $lte: finISO } }
            ]
          },
          sort: [{ fieldName: 'startDate', order: 'DESC' }],
          paging: { limit: PAGE, offset }
        });
        const items = result?.extendedBookings || [];
        allBookings = allBookings.concat(items);
        hasMore = items.length === PAGE;
        offset += PAGE;
      }

      console.log(`${TAG} Bookings totales en ventana: ${allBookings.length}`);

      // ── 4. Filtrar por cliente (patrón fichaClienteLogic) ─────────
      const propios = [];
      let viaStats = { cid: 0, tel: 0, name: 0 };

      for (const item of allBookings) {
        const bk = item.booking;
        if (!bk) continue;

        const matchInfo = _bookingEsDelCliente(bk, cliente);
        if (!matchInfo.match) continue;

        viaStats[matchInfo.via] = (viaStats[matchInfo.via] || 0) + 1;
        propios.push(bk);
      }

      console.log(`${TAG} Bookings del cliente: ${propios.length} (cid=${viaStats.cid} tel=${viaStats.tel} name=${viaStats.name})`);

      // ── 5. Leer PaymentReservations del cliente ───────────────────
      // Buscar por contactId directo + por nombre (para cazar contactos
      // duplicados con distinto contactId pero misma persona)
      let pagosCliente = [];
      try {
        // 5a. Por contactId directo
        const pagosDirecto = await wixData.query(COLECCION_PAGOS)
          .eq('contactId', contactId)
          .descending('fechaPago')
          .limit(500)
          .find({ suppressAuth: true });

        const directos = pagosDirecto?.items || [];
        const idVistos = new Set(directos.map(p => p._id));
        pagosCliente = [...directos];

        // 5b. Por nombre del cliente (caza duplicados con otro contactId)
        const nombreBuscar = cliente.nombreCompleto;
        if (nombreBuscar && nombreBuscar.length >= 3) {
          const pagosPorNombre = await wixData.query(COLECCION_PAGOS)
            .contains('nombreCliente', nombreBuscar.split(' ')[0]) // primer token del nombre
            .descending('fechaPago')
            .limit(200)
            .find({ suppressAuth: true });

          const porNombre = pagosPorNombre?.items || [];
          const nomNorm = _normalizarTextoNombre(nombreBuscar);

          for (const p of porNombre) {
            if (idVistos.has(p._id)) continue;
            // Match por nombre normalizado
            const pNom = _normalizarTextoNombre(p.nombreCliente || '');
            if (pNom && pNom === nomNorm) {
              idVistos.add(p._id);
              pagosCliente.push(p);
            }
          }
        }

        console.log(`${TAG} PaymentReservations: ${pagosCliente.length} registros (directos=${directos.length}, total con duplicados=${pagosCliente.length})`);
      } catch (e) {
        console.warn(`${TAG} Error leyendo PaymentReservations: ${e.message}`);
      }

      // Construir set de bookingIds que están en PaymentReservations
      // El campo bookingId en PaymentReservations puede ser un solo ID
      // o una lista separada por comas (varios bookings del pack)
      const bookingIdsEnCMS = new Set();
      for (const pago of pagosCliente) {
        const bids = String(pago.bookingId || '').split(',');
        for (const bid of bids) {
          const trimmed = bid.trim();
          if (trimmed) bookingIdsEnCMS.add(trimmed);
        }
      }

      console.log(`${TAG} BookingIds en CMS: ${bookingIdsEnCMS.size}`);

      // ── 6. Agrupar y construir resultado ──────────────────────────
      const result = await _agruparYConstruir(propios, pagosCliente, bookingIdsEnCMS);

      console.log(`${TAG} OK: ${result.bookings.length} packs (${result.grupos} Wix + ${result.bookings.length - result.grupos} CMS-only)`);

      return {
        ok: true,
        version: VERSION,
        cliente: {
          contactId: cliente.contactId,
          nombreCompleto: cliente.nombreCompleto,
          email: cliente.email,
          telefono: cliente.telefono
        },
        bookings: result.bookings,
        totalBookings: result.bookings.length,
        totalEnCMS: result.bookings.filter(b => b.enCMS).length,
        totalPagados: result.bookings.filter(b => b.paymentStatus === 'PAID').length,
        debug: {
          ventanaDias: ventana,
          bookingsTotalesEnVentana: allBookings.length,
          bookingsCliente: propios.length,
          packsAgrupados: result.grupos,
          via: viaStats,
          pagosEnCMS: pagosCliente.length
        }
      };

    } catch (e) {
      console.error(`${TAG} ERROR:`, e);
      return { ok: false, error: safeErr(e), bookings: [] };
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS COMPARTIDOS: AGRUPAR Y CONSTRUIR RESULTADO
// ═══════════════════════════════════════════════════════════════════════════

const GAP_MAX_MS = 90 * 60 * 1000;
const FASES_OCULTAS_DIAG = ['lavado', 'secado', 'proceso'];

function _esFaseTecnicaDiag(nombre) {
  const n = _normalizarTextoNombre(nombre);
  for (const f of FASES_OCULTAS_DIAG) {
    if (n.startsWith(f)) return true;
  }
  return false;
}

async function _resolverCidBooking(bk, cache) {
  const bkCidRaw = bk.contactDetails?.contactId || bk.contactId || '';
  if (bkCidRaw && bkCidRaw !== OWNER_SITE_ID) return bkCidRaw;
  const cdR = bk.contactDetails || {};
  const telBk = _normalizarTel(cdR.phone);
  const nomBk = _normalizarTextoNombre(`${cdR.firstName || ''} ${cdR.lastName || ''}`);
  if (telBk && telBk.length >= 6) {
    const m = cache.find(c => _normalizarTel(c.telefono) === telBk);
    if (m) return m.contactId;
  }
  if (nomBk) {
    const ms = cache.filter(c => _normalizarTextoNombre(c.nombreCompleto) === nomBk);
    if (ms.length === 1) return ms[0].contactId;
  }
  return bkCidRaw || '—';
}

// Recibe: bookings crudos de Wix, pagos del CMS, set de bookingIds en CMS
// Devuelve: { bookings: [...filas agrupadas...], grupos: N }
async function _agruparYConstruir(bookingsCrudos, pagosCMS, bookingIdsEnCMS) {
  const cache = await _cargarContactosCache();

  // Enriquecer
  const enriched = [];
  for (const bk of bookingsCrudos) {
    const slot = bk.bookedEntity?.slot || {};
    const startISO = slot.startDate || '';
    const endISO = slot.endDate || '';
    const cdI = bk.contactDetails || {};
    enriched.push({
      bk,
      bookingId: bk._id || '',
      startISO,
      endISO,
      startMs: startISO ? new Date(startISO).getTime() : 0,
      endMs: endISO ? new Date(endISO).getTime() : 0,
      serviceName: bk.bookedEntity?.title || 'Sin nombre',
      staffName: slot.resource?.name || '—',
      status: bk.status || 'UNKNOWN',
      paymentStatus: bk.paymentStatus || 'UNKNOWN',
      metodoPagoWix: _leerMetodoPago(bk),
      esRecepcion: _leerOrigenRecepcion(bk),
      bkContactId: await _resolverCidBooking(bk, cache),
      bkNombre: `${cdI.firstName || ''} ${cdI.lastName || ''}`.trim(),
      bkTelefono: cdI.phone || '',
      bkEmail: cdI.email || '',
      esFase: _esFaseTecnicaDiag(bk.bookedEntity?.title || '')
    });
  }
  enriched.sort((a, b) => a.startMs - b.startMs);

  // Agrupar: PRIMERO por cliente, DESPUÉS por contigüidad dentro de cada cliente
  // Si mezclamos todos en una secuencia temporal, un booking de otro cliente
  // intercalado rompe la contigüidad del pack.
  function grupoKey(item) {
    if (item.bkContactId && item.bkContactId !== '—') return `cid_${item.bkContactId}`;
    if (item.bkNombre) return `name_${_normalizarTextoNombre(item.bkNombre)}`;
    if (item.bkTelefono) return `tel_${_normalizarTel(item.bkTelefono)}`;
    return `anon_${item.bookingId}`;
  }

  // Paso A: separar por cliente
  const porCliente = new Map();
  for (const item of enriched) {
    const key = grupoKey(item);
    if (!porCliente.has(key)) porCliente.set(key, []);
    porCliente.get(key).push(item);
  }

  // Paso B: dentro de cada cliente, ordenar por startMs y agrupar por contigüidad
  const grupos = [];
  for (const [key, items] of porCliente) {
    items.sort((a, b) => a.startMs - b.startMs);
    let curGrupo = null;
    for (const item of items) {
      if (curGrupo && (item.startMs - curGrupo.lastEndMs) <= GAP_MAX_MS) {
        curGrupo.items.push(item);
        if (item.endMs > curGrupo.lastEndMs) curGrupo.lastEndMs = item.endMs;
      } else {
        if (curGrupo) grupos.push(curGrupo);
        curGrupo = { items: [item], firstStartMs: item.startMs, lastEndMs: item.endMs };
      }
    }
    if (curGrupo) grupos.push(curGrupo);
  }

  // Convertir grupos a filas
  const bookings = [];
  const bookingIdsYaVistos = new Set();

  for (const grupo of grupos) {
    const items = grupo.items;
    const allIds = items.map(i => i.bookingId).filter(Boolean);
    allIds.forEach(id => bookingIdsYaVistos.add(id));

    const visibles = items.filter(i => !i.esFase);
    const titulo = visibles.length > 0
      ? visibles.map(i => i.serviceName).join(' + ')
      : items.map(i => i.serviceName).join(' + ');

    const staffSet = new Set();
    for (const i of items) {
      if (i.staffName && i.staffName !== '—') staffSet.add(i.staffName);
    }
    const staff = Array.from(staffSet).join(', ') || '—';

    const firstItem = items[0];
    const lastItem = items[items.length - 1];
    const fecha = _diaMadridDeISO(firstItem.startISO);
    const horaInicio = _horaMadridDeISO(firstItem.startISO);
    const horaFin = _horaMadridDeISO(lastItem.endISO);

    const statuses = new Set(items.map(i => i.status));
    let groupStatus;
    if (statuses.size === 1) groupStatus = items[0].status;
    else if (statuses.has('CONFIRMED') && statuses.has('CANCELLED')) groupStatus = 'MIXED';
    else groupStatus = items[0].status;

    const payPriority = { 'NOT_PAID': 4, 'UNDEFINED': 3, 'EXEMPT': 2, 'PAID': 1, 'UNKNOWN': 3 };
    let worstPay = items[0].paymentStatus;
    for (const i of items) {
      if ((payPriority[i.paymentStatus] || 3) > (payPriority[worstPay] || 3)) {
        worstPay = i.paymentStatus;
      }
    }

    let metodoPago = '';
    for (const i of items) {
      if (i.metodoPagoWix) { metodoPago = i.metodoPagoWix; break; }
    }
    if (!metodoPago) {
      for (const id of allIds) {
        if (bookingIdsEnCMS.has(id)) {
          const pagoMatch = pagosCMS.find(p =>
            String(p.bookingId || '').split(',').map(b => b.trim()).includes(id)
          );
          if (pagoMatch?.tipoPago) { metodoPago = pagoMatch.tipoPago; break; }
        }
      }
    }

    const enCMS = allIds.some(id => bookingIdsEnCMS.has(id));
    const esRecepcion = items.some(i => i.esRecepcion);
    const origen = _inferirOrigen(firstItem.bk, esRecepcion, enCMS);
    const bkContactId = firstItem.bkContactId;

    // Buscar el registro CMS correspondiente para extraer importe
    let importeCMS = 0;
    let pagoMatchCMS = null;
    if (enCMS) {
      for (const id of allIds) {
        if (bookingIdsEnCMS.has(id)) {
          pagoMatchCMS = pagosCMS.find(p =>
            String(p.bookingId || '').split(',').map(b => b.trim()).includes(id)
          );
          if (pagoMatchCMS) {
            importeCMS = pagoMatchCMS.importeTotal || 0;
            break;
          }
        }
      }
    }

    // Estado de cruce explícito
    // ✅ CRUZADO: booking en Wix + registro en CMS
    // 🟣 SOLO_WIX: booking en Wix, sin registro en CMS (pendiente o no cobrado)
    // ⚠️ SOLO_CMS: registro en CMS sin booking en Wix (se añade abajo)
    const cruce = enCMS ? 'CRUZADO' : 'SOLO_WIX';

    bookings.push({
      bookingId: allIds.join(', '),
      fecha,
      horaInicio,
      horaFin,
      servicio: titulo,
      staff,
      status: groupStatus,
      paymentStatus: worstPay,
      metodoPago,
      enCMS,
      origen,
      esRecepcion,
      bkContactId: bkContactId || '—',
      bkNombre: firstItem.bkNombre || '',
      bkTelefono: firstItem.bkTelefono || '',
      bkEmail: firstItem.bkEmail || '',
      fuente: 'WixBookings',
      cruce,
      importeCMS,
      serviciosDetalle: items.map(i => ({
        bookingId: i.bookingId,
        servicio: i.serviceName,
        hora: _horaMadridDeISO(i.startISO) + '–' + _horaMadridDeISO(i.endISO),
        status: i.status,
        paymentStatus: i.paymentStatus,
        esFase: i.esFase
      }))
    });
  }

  // Añadir registros CMS huérfanos
  for (const pago of pagosCMS) {
    const bids = String(pago.bookingId || '').split(',').map(b => b.trim()).filter(Boolean);
    const todosVistos = bids.length > 0 && bids.every(b => bookingIdsYaVistos.has(b));
    if (todosVistos) continue;

    const fechaPago = pago.fechaPago ? _diaMadridDeISO(new Date(pago.fechaPago).toISOString()) : '—';
    const horaPago = pago.fechaPago ? _horaMadridDeISO(new Date(pago.fechaPago).toISOString()) : '';

    bookings.push({
      bookingId: pago.bookingId || '—',
      fecha: fechaPago,
      horaInicio: horaPago,
      horaFin: '',
      servicio: pago.descripcion || '(sin descripción)',
      staff: pago.staff || '—',
      status: '—',
      paymentStatus: 'PAID',
      metodoPago: pago.tipoPago || '',
      enCMS: true,
      origen: 'CMS/Ledger',
      esRecepcion: false,
      bkContactId: pago.contactId || '—',
      bkNombre: pago.nombreCliente || '',
      bkTelefono: '',
      bkEmail: '',
      fuente: 'PaymentReservations',
      cruce: 'SOLO_CMS',
      importeTotal: pago.importeTotal || 0,
      nombreCliente: pago.nombreCliente || '',
      serviciosDetalle: []
    });
  }

  bookings.sort((a, b) => (b.fecha + b.horaInicio).localeCompare(a.fecha + a.horaInicio));

  return { bookings, grupos: grupos.length };
}

// ═══════════════════════════════════════════════════════════════════════════
// FUNCIÓN: diagnosticarRango — todas las reservas de un rango de fechas
// ═══════════════════════════════════════════════════════════════════════════

export const diagnosticarRango = webMethod(
  Permissions.Anyone,
  async ({ desde, hasta }) => {
    try {
      if (!desde || !hasta) {
        return { ok: false, error: { message: 'desde y hasta requeridos (YYYY-MM-DD)' }, bookings: [] };
      }

      console.log(`${TAG} diagnosticarRango: ${desde} → ${hasta}`);

      const startISO = `${desde}T00:00:00.000Z`;
      const endISO = `${hasta}T23:59:59.999Z`;

      // ── 1. Query a Wix Bookings ───────────────────────────────────
      const elevatedQuery = elevate(extendedBookings.queryExtendedBookings);
      const PAGE = 100;
      const MAX_TOTAL = 1000;
      let allBookings = [];
      let offset = 0;
      let hasMore = true;

      while (hasMore && offset < MAX_TOTAL) {
        const result = await elevatedQuery({
          filter: {
            $and: [
              { startDate: { $gte: startISO } },
              { startDate: { $lte: endISO } }
            ]
          },
          sort: [{ fieldName: 'startDate', order: 'DESC' }],
          paging: { limit: PAGE, offset }
        });
        const items = result?.extendedBookings || [];
        allBookings = allBookings.concat(items);
        hasMore = items.length === PAGE;
        offset += PAGE;
      }

      console.log(`${TAG} Bookings totales en rango: ${allBookings.length}`);

      // Filtrar solo CONFIRMED (no cancelados para vista limpia)
      // Pero incluir CANCELLED para diagnóstico completo
      const todos = allBookings
        .map(item => item.booking)
        .filter(bk => bk && (bk.status === 'CONFIRMED' || bk.status === 'CANCELLED'));

      console.log(`${TAG} Bookings CONFIRMED+CANCELLED: ${todos.length}`);

      // ── 2. PaymentReservations del rango ───────────────────────────
      let pagosCMS = [];
      try {
        const pagosResult = await wixData.query(COLECCION_PAGOS)
          .ge('fechaPago', new Date(`${desde}T00:00:00.000`))
          .le('fechaPago', new Date(`${hasta}T23:59:59.999`))
          .descending('fechaPago')
          .limit(500)
          .find({ suppressAuth: true });
        pagosCMS = pagosResult?.items || [];
      } catch (e) {
        console.warn(`${TAG} Error leyendo PaymentReservations: ${e.message}`);
      }

      console.log(`${TAG} PaymentReservations en rango: ${pagosCMS.length}`);

      // Construir set de bookingIds en CMS
      const bookingIdsEnCMS = new Set();
      for (const pago of pagosCMS) {
        const bids = String(pago.bookingId || '').split(',');
        for (const bid of bids) {
          const trimmed = bid.trim();
          if (trimmed) bookingIdsEnCMS.add(trimmed);
        }
      }

      // ── 3. Agrupar y construir ────────────────────────────────────
      const result = await _agruparYConstruir(todos, pagosCMS, bookingIdsEnCMS);

      console.log(`${TAG} OK rango: ${result.bookings.length} packs`);

      return {
        ok: true,
        version: VERSION,
        modo: 'rango',
        desde,
        hasta,
        bookings: result.bookings,
        totalBookings: result.bookings.length,
        totalEnCMS: result.bookings.filter(b => b.enCMS).length,
        totalPagados: result.bookings.filter(b => b.paymentStatus === 'PAID').length,
        debug: {
          bookingsTotalesEnRango: allBookings.length,
          bookingsConfCancelled: todos.length,
          packsAgrupados: result.grupos,
          pagosEnCMS: pagosCMS.length
        }
      };

    } catch (e) {
      console.error(`${TAG} ERROR diagnosticarRango:`, e);
      return { ok: false, error: safeErr(e), bookings: [] };
    }
  }
);