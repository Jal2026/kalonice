// =====================================================
// KAMISUITE — Backend: MEMORIA (histórico legacy SABDE)
// =====================================================
// VERSION: 1.0.3
// FECHA:   3 de agosto de 2026
// ARCHIVO: backend/memoriaLegacyLogic.web.js
//
// CHANGELOG
//   v1.0.3 (3-Ago-2026) — NUEVO getFichaTecnicaCliente().
//     Ficha TÉCNICA para el personal de sala (botón en la barra de
//     Recepción PRO, junto a ALMACÉN y ESPECIALES).
//
//     ⚠️ SIN NINGÚN DATO ECONÓMICO. Requisito explícito de Jal: a los
//     informes con dinero solo accede la gerencia; la sala necesita la
//     información técnica y nada más.
//
//     El filtrado es EN EL BACKEND, no en el widget. Esta función no
//     construye ni envía importe, método de pago, gasto acumulado ni
//     ticket medio en ningún nivel del payload. Ocultarlo por CSS o
//     en el render sería inútil: cualquiera lo vería en el inspector
//     del navegador. Lo que no sale del backend no existe en el cliente.
//
//     Devuelve por visita: fecha, hora, profesional, nombres de los
//     servicios y la fórmula literal. Nada más.
//
//   v1.0.2 (3-Ago-2026) — Producto identificado por referencia.
//     El CSV v3 resuelve el nombre real de cada producto cruzando el
//     NroProd del ticket con la columna Prod del listado de almacén de
//     SADPE (27 de 32 referencias de 2026, 97,5% del importe), y añade
//     `p` (referencia) y `m` (marca) a cada línea de venta.
//     · shapeTicket expone refProducto y marca.
//     · NUEVO helper claveServicio(): TODAS las ventas comparten el
//       código 'VN', así que agrupar por código las fundiría en una
//       sola fila con el nombre del primer producto que apareciera.
//       Las líneas de VENTA se agrupan por 'VN:<referencia>'; el resto
//       sigue agrupándose por código. Aplicado en getMemoriaResumen y
//       en getMemoriaCliente.
//     · NUEVO bloque `porMarca` en getMemoriaResumen (solo líneas de
//       venta; las que no tienen ficha en el almacén caen en
//       'SIN MARCA', no se inventan).
//     · getMemoriaServicio acepta ahora la clave compuesta 'VN:<ref>'
//       además del código simple.
//   v1.0.1 (3-Ago-2026) — FIX lectura del campo `lineas`.
//     El CSV v1 escribía un ARRAY JSON directo `[{...}]`, que dispara
//     el triángulo amarillo de Wix tanto en campo Text como en Object.
//     Regla documentada en serviciosEdicionLogic v1.11.3: Wix avisa
//     ante array directo y NO avisa ante objeto envuelto {items:[...]}.
//     Por eso existe allí el helper wrapItems().
//     · `lineas` pasa a almacenarse como { "items": [ ... ] } y el
//       campo a tipo Object/JSON.
//     · parseLineas() sustituido por jsonIn(), helper LITERAL de
//       widgetPublicoLogic v0.7.7 / catalogoConsultaLogic v1.0.1:
//       tolera objeto envuelto {items|ids|names}, array directo
//       (formato del import v1) y string JSON legacy. La lectura
//       funciona con cualquiera de los tres, así que no hay ventana
//       de rotura entre desplegar el backend y reimportar el CSV.
//
//   v1.0.0 (3-Ago-2026) — Versión inicial. Lectura del histórico
//     legacy importado desde SABDE (ficheros de facturación cabecera
//     + detalle de líneas + tarifa de precios). SOLO LECTURA.
//
// PROPÓSITO
//   Servir el módulo MEMORIA: consulta y análisis del histórico de
//   facturación anterior a KAMISUITE. Es una VITRINA, no una fuente
//   operativa.
//
// ⚠️ REGLA DURA — QUÉ NO ES ESTE BACKEND
//   Los datos que sirve NO son contables ni operativos:
//     · NO alimentan el Cierre Financiero ni el Rendimiento Productivo.
//     · NO alimentan el arqueo de caja.
//     · NO son base fiscal (no hay desglose de IVA en el origen).
//     · NO se cruzan automáticamente con ServiceCatalog: los códigos
//       legacy (TRZ, CLO, CS…) se sirven LITERALES con la descripción
//       de la tarifa del salón. El mapeo automático legacy→V2 es
//       exactamente lo que rompió la migración de reservas SABDE
//       (31-jul-2026, dos tandas, ~20 servicios duplicados).
//   Este archivo NO escribe. No hay insert, update ni remove.
//
// ORIGEN DEL DATO (verificado sobre los ficheros reales)
//   2.019 tickets · 7-ene-2026 → 25-jun-2026 · 94.499,62 €
//   885 clientes · 93 códigos de servicio · 3 oficiales
//   Integridad comprobada antes del import: 2.019 cabeceras ↔ 2.019
//   tickets con líneas, 0 descuadres, suma cabeceras = suma líneas.
//   Tramo 26-jun → 30-jul PENDIENTE de entrega por el salón.
//
// COLECCIONES (solo lectura, suppressAuth)
//   - KamisuiteLegacyTickets  (1 fila por ticket; campo `lineas` de
//                              tipo Object/JSON con forma { items: [...] })
//   - KamisuiteLegacyMensual  (1 fila por mes; agregados en JSON)
//
// NOTA SOBRE FIELD IDs
//   Todos los field IDs están centralizados en los objetos F_TICKET y
//   F_MES de este archivo. Si Wix generó algún ID distinto al nombre
//   del prompt de creación, se corrige AHÍ y en ningún otro sitio.
//   getMemoriaDiagnostico() devuelve las claves reales de la primera
//   fila de cada colección para verificarlo sin abrir el CMS.
//
// NOTA SOBRE FECHAS
//   El campo de fecha es de tipo Date. Se normaliza SIEMPRE con
//   toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' }),
//   patrón fijado en Conceptos Fundacionales §20. Madrid va siempre
//   por delante de UTC, así que una medianoche UTC nunca retrocede
//   de día al convertir. La hora viaja aparte como texto 'HH:mm'
//   justamente para no depender de conversión horaria.
//
// PATRÓN REUTILIZADO (literal, del repo de producción KALÓNICE)
//   - paymentReservationsLogic.web.js v1.3.3 → listarPaymentReservations:
//     query().limit(1000).find({suppressAuth:true}) + while(hasNext())
//     result = await result.next().
//   - observatorioClientesLogic.web.js v1.1.1 → estructura de módulo,
//     helpers toNum/safeErr, constantes de colección, TAG versionado.
//   - cierreLogicExtendido.web.js v1.1.4 → cargarStaff con try/catch
//     que degrada a array vacío en vez de reventar.
//
// FUNCIONES EXPORTADAS
//   getMemoriaResumen()        → KPIs, serie mensual, grupos, servicios,
//                                marcas, staff, métodos de pago, día semana
//   getMemoriaClientes()       → índice agregado por cliente (buscador)
//   getMemoriaCliente()        → ficha legacy de un cliente + fórmulas
//   getMemoriaDia()            → "Aquel día": tickets de una fecha
//   getMemoriaServicio()       → evolución de un código de servicio
//   getMemoriaFormulas()       → buscador de texto sobre fórmulas
//   getMemoriaDiagnostico()    → field IDs reales + conteos (soporte)
//   getFichaTecnicaCliente()   → historial TÉCNICO sin datos económicos
// =====================================================

import { Permissions, webMethod } from 'wix-web-module';
import wixData from 'wix-data';

const VERSION = '1.0.3';
const TAG = `[MemoriaLegacy][${VERSION}]`;

const CMS_TICKETS = 'KamisuiteLegacyTickets';
const CMS_MENSUAL = 'KamisuiteLegacyMensual';

const TIMEZONE_MADRID = 'Europe/Madrid';
const PAGE_SIZE = 1000;

// Cache de módulo. El histórico es inmutable (import puntual), así que
// un TTL largo es seguro. Cualquier función acepta refresh:true para
// forzar relectura tras importar el tramo pendiente.
const CACHE_TTL_MS = 10 * 60 * 1000;
let _cache = { at: 0, tickets: null, mensual: null };

// =====================================================
// FIELD IDs — punto único de verdad
// =====================================================

const F_TICKET = {
  docId:            'legacyDocId',
  ticketNum:        'legacyTicketNum',
  fecha:            'fecha',
  hora:             'hora',
  clientId:         'legacyClientId',
  clientName:       'clientName',
  clientPhone:      'clientPhone',
  importeTotal:     'importeTotal',
  importeServicios: 'importeServicios',
  importeProductos: 'importeProductos',
  efectivo:         'efectivo',
  tarjeta:          'tarjeta',
  otros:            'otros',
  pendiente:        'pendiente',
  amortizado:       'amortizado',
  metodoPago:       'metodoPago',
  staffPrincipal:   'staffPrincipal',
  staffMultiple:    'staffMultiple',
  grupoPrincipal:   'grupoPrincipal',
  codigos:          'codigosServicio',
  resumen:          'resumenServicios',
  numLineas:        'numLineas',
  formula:          'formulaTecnica',
  lineas:           'lineas',
  esAnonimo:        'esAnonimo',
  esNegativo:       'esNegativo',
  origen:           'origenLegacy'
};

const F_MES = {
  periodo:          'periodo',
  anio:             'anio',
  mes:              'mes',
  tickets:          'tickets',
  clientes:         'clientes',
  importeTotal:     'importeTotal',
  ticketMedio:      'ticketMedio',
  importeServicios: 'importeServicios',
  importeProductos: 'importeProductos',
  efectivo:         'efectivo',
  tarjeta:          'tarjeta',
  porGrupo:         'porGrupo',
  porStaff:         'porStaff',
  origen:           'origenLegacy'
};

// Claves del JSON compacto de cada línea de ticket.
// c=código, d=descripción de tarifa, g=grupo, q=cantidad,
// i=importe, of=oficial.
const L_COD = 'c', L_DESC = 'd', L_GRUPO = 'g';
const L_CANT = 'q', L_IMP = 'i', L_OFICIAL = 'of';
// Solo en líneas de venta: p = referencia legacy del producto (NroProd
// de SABDE = columna Prod del almacén), m = marca resuelta desde la ficha.
const L_REFPROD = 'p', L_MARCA = 'm';

// Grupo de tarifa que identifica una línea de venta de producto.
const GRUPO_VENTA = 'VENTA';

// =====================================================
// HELPERS
// =====================================================

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function r2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function safeErr(e) {
  return { message: e?.message || String(e) };
}

function toBool(v) {
  if (v === true || v === false) return v;
  if (typeof v === 'string') return v.trim().toLowerCase() === 'true';
  return false;
}

function txt(v) {
  return (v === null || v === undefined) ? '' : String(v).trim();
}

// Fecha → 'YYYY-MM-DD' en zona Madrid. Conceptos Fundacionales §20.
function toYmdMadrid(v) {
  if (!v) return '';
  try {
    if (typeof v === 'string') {
      const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    }
    const d = (v instanceof Date) ? v : new Date(v);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-CA', { timeZone: TIMEZONE_MADRID });
  } catch (_) {
    return '';
  }
}

// Día de la semana desde 'YYYY-MM-DD' sin pasar por zona horaria.
// 0 = lunes … 6 = domingo.
function dowFromYmd(ymd) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return -1;
  const y = Number(ymd.slice(0, 4));
  const m = Number(ymd.slice(5, 7));
  const d = Number(ymd.slice(8, 10));
  const js = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=domingo
  return (js + 6) % 7;
}

const NOMBRE_DOW = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

// jsonIn defensivo — helper LITERAL de widgetPublicoLogic v0.7.7 y
// catalogoConsultaLogic v1.0.1. Un campo JSON de Wix puede llegar como:
// objeto envuelto {items:[...]} (formato canónico, sin warning),
// array directo (formato legacy) o string JSON (campo Text).
// Los tres se leen igual.
function jsonIn(v, unwrapKey) {
  if (v == null || v === '') return [];
  if (typeof v === 'string') {
    try { v = JSON.parse(v); } catch (e) { return []; }
  }
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    if (unwrapKey && Array.isArray(v[unwrapKey])) return v[unwrapKey];
    if (Array.isArray(v.items)) return v.items;
    if (Array.isArray(v.ids))   return v.ids;
    if (Array.isArray(v.names)) return v.names;
    return [];
  }
  if (Array.isArray(v)) return v;
  return [];
}

// Clave de agrupación de una línea. Todas las ventas de producto
// comparten el código 'VN' de la tarifa, de modo que agrupar por código
// las mezclaría bajo un único nombre. Para VENTA la clave incluye la
// referencia del producto; para el resto es el código de servicio.
function claveServicio(l) {
  if (l.grupo === GRUPO_VENTA && l.refProducto) return 'VN:' + l.refProducto;
  return l.codigo || '?';
}

function parseObj(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    const o = JSON.parse(String(raw));
    return (o && typeof o === 'object') ? o : {};
  } catch (_) {
    return {};
  }
}

// Normaliza texto para búsquedas: minúsculas y sin acentos.
// Los nombres del legacy vienen en mayúsculas y las fórmulas están
// escritas a mano con acentuación irregular.
function norm(s) {
  return txt(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

// =====================================================
// CARGA (paginada, patrón literal de paymentReservationsLogic v1.3.3)
// =====================================================

async function cargarColeccion(coleccion, campoOrden) {
  let all = [];
  let result = await wixData.query(coleccion)
    .descending(campoOrden)
    .limit(PAGE_SIZE)
    .find({ suppressAuth: true });

  all = all.concat(result.items || []);

  while (result.hasNext()) {
    result = await result.next();
    all = all.concat(result.items || []);
  }

  return all;
}

// Proyecta una fila cruda del CMS al shape que consume el widget.
function shapeTicket(row) {
  const ymd = toYmdMadrid(row[F_TICKET.fecha]);
  const lineas = jsonIn(row[F_TICKET.lineas], 'items').map(l => ({
    codigo:    txt(l[L_COD]),
    servicio:  txt(l[L_DESC]),
    grupo:     txt(l[L_GRUPO]),
    cantidad:  toNum(l[L_CANT]) || 1,
    importe:   r2(l[L_IMP]),
    oficial:   txt(l[L_OFICIAL]),
    refProducto: toNum(l[L_REFPROD]) || 0,
    marca:     txt(l[L_MARCA])
  }));

  return {
    docId:      txt(row[F_TICKET.docId]),
    ticketNum:  toNum(row[F_TICKET.ticketNum]),
    fecha:      ymd,
    hora:       txt(row[F_TICKET.hora]),
    dow:        dowFromYmd(ymd),
    clientId:   toNum(row[F_TICKET.clientId]),
    clientName: txt(row[F_TICKET.clientName]),
    clientPhone: txt(row[F_TICKET.clientPhone]),
    total:      r2(row[F_TICKET.importeTotal]),
    servicios:  r2(row[F_TICKET.importeServicios]),
    productos:  r2(row[F_TICKET.importeProductos]),
    efectivo:   r2(row[F_TICKET.efectivo]),
    tarjeta:    r2(row[F_TICKET.tarjeta]),
    otros:      r2(row[F_TICKET.otros]),
    pendiente:  r2(row[F_TICKET.pendiente]),
    amortizado: r2(row[F_TICKET.amortizado]),
    metodoPago: txt(row[F_TICKET.metodoPago]),
    staff:      txt(row[F_TICKET.staffPrincipal]),
    staffMultiple: toBool(row[F_TICKET.staffMultiple]),
    grupo:      txt(row[F_TICKET.grupoPrincipal]),
    codigos:    txt(row[F_TICKET.codigos]),
    resumen:    txt(row[F_TICKET.resumen]),
    numLineas:  toNum(row[F_TICKET.numLineas]),
    formula:    txt(row[F_TICKET.formula]),
    esAnonimo:  toBool(row[F_TICKET.esAnonimo]),
    esNegativo: toBool(row[F_TICKET.esNegativo]),
    origen:     txt(row[F_TICKET.origen]),
    lineas
  };
}

function shapeMes(row) {
  return {
    periodo:   txt(row[F_MES.periodo]),
    anio:      toNum(row[F_MES.anio]),
    mes:       toNum(row[F_MES.mes]),
    tickets:   toNum(row[F_MES.tickets]),
    clientes:  toNum(row[F_MES.clientes]),
    total:     r2(row[F_MES.importeTotal]),
    ticketMedio: r2(row[F_MES.ticketMedio]),
    servicios: r2(row[F_MES.importeServicios]),
    productos: r2(row[F_MES.importeProductos]),
    efectivo:  r2(row[F_MES.efectivo]),
    tarjeta:   r2(row[F_MES.tarjeta]),
    porGrupo:  parseObj(row[F_MES.porGrupo]),
    porStaff:  parseObj(row[F_MES.porStaff]),
    origen:    txt(row[F_MES.origen])
  };
}

async function getData(refresh) {
  const ahora = Date.now();
  if (!refresh && _cache.tickets && (ahora - _cache.at) < CACHE_TTL_MS) {
    return { tickets: _cache.tickets, mensual: _cache.mensual };
  }

  const [rawT, rawM] = await Promise.all([
    cargarColeccion(CMS_TICKETS, F_TICKET.fecha),
    cargarColeccion(CMS_MENSUAL, F_MES.periodo)
  ]);

  const tickets = rawT.map(shapeTicket).filter(t => !!t.fecha);
  const mensual = rawM.map(shapeMes).sort((a, b) => a.periodo.localeCompare(b.periodo));

  _cache = { at: ahora, tickets, mensual };
  console.log(`${TAG} cargado: ${tickets.length} tickets · ${mensual.length} meses`);

  return { tickets, mensual };
}

// =====================================================
// 1. getMemoriaResumen — vista Pulso / Ritmo / mix de negocio
// =====================================================
// Devuelve SOLO agregados. Ninguna fila de ticket viaja al widget en
// esta llamada: con ~2.000 tickets el payload completo sería de casi
// 1 MB y no hace falta para pintar el resumen.
//
// Parámetros (todos opcionales):
//   desde, hasta  → 'YYYY-MM-DD' inclusive, filtro sobre el histórico
//   incluirAnonimo → por defecto false (los tickets sin cliente
//                    identificado distorsionan el análisis por cliente
//                    pero no el de facturación; se cuentan aparte)
//   refresh        → fuerza relectura del CMS
// =====================================================

export const getMemoriaResumen = webMethod(
  Permissions.SiteMember,
  async (opts = {}) => {
    try {
      const { desde = '', hasta = '', incluirAnonimo = false, refresh = false } = opts || {};
      const { tickets, mensual } = await getData(refresh);

      const enRango = tickets.filter(t => {
        if (desde && t.fecha < desde) return false;
        if (hasta && t.fecha > hasta) return false;
        return true;
      });

      const base = incluirAnonimo ? enRango : enRango.filter(t => !t.esAnonimo);

      const clientes = new Set();
      const dias = new Set();
      const porGrupo = new Map();
      const porServicio = new Map();
      const porMarca = new Map();
      const porStaff = new Map();
      const porMetodo = new Map();
      const porDow = new Map();

      let total = 0, servicios = 0, productos = 0;
      let efectivo = 0, tarjeta = 0;
      let conFormula = 0, negativos = 0, sinCobro = 0;

      for (const t of base) {
        total     += t.total;
        servicios += t.servicios;
        productos += t.productos;
        efectivo  += t.efectivo;
        tarjeta   += t.tarjeta;

        if (t.clientId) clientes.add(t.clientId);
        if (t.fecha) dias.add(t.fecha);
        if (t.formula) conFormula++;
        if (t.esNegativo) negativos++;
        if (t.total === 0) sinCobro++;

        const met = t.metodoPago || 'Sin cobro';
        const m = porMetodo.get(met) || { metodo: met, tickets: 0, importe: 0 };
        m.tickets++; m.importe += t.total;
        porMetodo.set(met, m);

        if (t.dow >= 0) {
          const d = porDow.get(t.dow) || { dow: t.dow, nombre: NOMBRE_DOW[t.dow], tickets: 0, importe: 0, dias: new Set() };
          d.tickets++; d.importe += t.total; d.dias.add(t.fecha);
          porDow.set(t.dow, d);
        }

        // Los agregados por servicio, grupo y oficial se calculan SIEMPRE
        // desde las líneas, nunca desde la cabecera: 280 tickets de 2026
        // tienen más de un oficial y la cabecera solo guarda el dominante.
        for (const l of t.lineas) {
          const g = l.grupo || 'SIN GRUPO';
          const gg = porGrupo.get(g) || { grupo: g, lineas: 0, importe: 0 };
          gg.lineas++; gg.importe += l.importe;
          porGrupo.set(g, gg);

          const key = claveServicio(l);
          const ss = porServicio.get(key) || {
            key: key, codigo: l.codigo || '?', servicio: l.servicio, grupo: g,
            marca: l.marca, refProducto: l.refProducto,
            esProducto: g === GRUPO_VENTA,
            lineas: 0, unidades: 0, importe: 0
          };
          ss.lineas++; ss.unidades += l.cantidad; ss.importe += l.importe;
          if (!ss.servicio && l.servicio) ss.servicio = l.servicio;
          if (!ss.marca && l.marca) ss.marca = l.marca;
          porServicio.set(key, ss);

          // Marca: solo tiene sentido en líneas de venta. Las referencias
          // sin ficha en el almacén van a 'SIN MARCA' — no se adivina.
          if (g === GRUPO_VENTA) {
            const mk = l.marca || 'SIN MARCA';
            const mm = porMarca.get(mk) || {
              marca: mk, lineas: 0, unidades: 0, importe: 0, refs: new Set()
            };
            mm.lineas++; mm.unidades += l.cantidad; mm.importe += l.importe;
            if (l.refProducto) mm.refs.add(l.refProducto);
            porMarca.set(mk, mm);
          }

          const of = l.oficial || 'SIN ASIGNAR';
          const st = porStaff.get(of) || { oficial: of, lineas: 0, importe: 0, tickets: new Set() };
          st.lineas++; st.importe += l.importe; st.tickets.add(t.docId);
          porStaff.set(of, st);
        }
      }

      const nTickets = base.length;
      const anonimos = enRango.filter(t => t.esAnonimo);

      const fechas = base.map(t => t.fecha).filter(Boolean).sort();

      return {
        ok: true,
        version: VERSION,
        kpis: {
          tickets: nTickets,
          clientes: clientes.size,
          diasActividad: dias.size,
          importeTotal: r2(total),
          ticketMedio: nTickets ? r2(total / nTickets) : 0,
          gastoPorCliente: clientes.size ? r2(total / clientes.size) : 0,
          ticketsPorDia: dias.size ? r2(nTickets / dias.size) : 0,
          importeServicios: r2(servicios),
          importeProductos: r2(productos),
          efectivo: r2(efectivo),
          tarjeta: r2(tarjeta),
          ticketsConFormula: conFormula,
          ticketsNegativos: negativos,
          ticketsSinCobro: sinCobro,
          ticketsAnonimos: anonimos.length,
          importeAnonimos: r2(anonimos.reduce((a, t) => a + t.total, 0)),
          primeraFecha: fechas[0] || '',
          ultimaFecha: fechas[fechas.length - 1] || ''
        },
        mensual,
        porGrupo: [...porGrupo.values()]
          .map(g => ({ ...g, importe: r2(g.importe) }))
          .sort((a, b) => b.importe - a.importe),
        porServicio: [...porServicio.values()]
          .map(s => ({ ...s, importe: r2(s.importe) }))
          .sort((a, b) => b.importe - a.importe),
        porMarca: [...porMarca.values()]
          .map(m => ({
            marca: m.marca, lineas: m.lineas, unidades: m.unidades,
            importe: r2(m.importe), referencias: m.refs.size
          }))
          .sort((a, b) => b.importe - a.importe),
        porStaff: [...porStaff.values()]
          .map(s => ({ oficial: s.oficial, lineas: s.lineas, importe: r2(s.importe), tickets: s.tickets.size }))
          .sort((a, b) => b.importe - a.importe),
        porMetodoPago: [...porMetodo.values()]
          .map(m => ({ ...m, importe: r2(m.importe) }))
          .sort((a, b) => b.importe - a.importe),
        porDiaSemana: [...porDow.values()]
          .map(d => ({
            dow: d.dow, nombre: d.nombre, tickets: d.tickets,
            importe: r2(d.importe), dias: d.dias.size,
            mediaPorDia: d.dias.size ? r2(d.importe / d.dias.size) : 0
          }))
          .sort((a, b) => a.dow - b.dow),
        filtro: { desde, hasta, incluirAnonimo }
      };

    } catch (e) {
      console.error(`${TAG} ❌ getMemoriaResumen:`, e);
      return { ok: false, error: safeErr(e) };
    }
  }
);

// =====================================================
// 2. getMemoriaClientes — índice agregado para el buscador
// =====================================================
// Una entrada por cliente legacy. No incluye tickets: el detalle se
// pide con getMemoriaCliente al seleccionar uno.
// =====================================================

export const getMemoriaClientes = webMethod(
  Permissions.SiteMember,
  async (opts = {}) => {
    try {
      const { incluirAnonimo = false, refresh = false } = opts || {};
      const { tickets } = await getData(refresh);

      const map = new Map();

      for (const t of tickets) {
        if (!incluirAnonimo && t.esAnonimo) continue;
        const id = t.clientId;
        if (!id) continue;

        let c = map.get(id);
        if (!c) {
          c = {
            clientId: id,
            clientName: t.clientName,
            clientPhone: t.clientPhone,
            tickets: 0,
            gastoTotal: 0,
            primeraVisita: t.fecha,
            ultimaVisita: t.fecha,
            formulas: 0,
            esAnonimo: t.esAnonimo,
            _serv: new Map(),
            _staff: new Map()
          };
          map.set(id, c);
        }

        // El teléfono y el nombre pueden faltar en tickets sueltos:
        // se conserva el primer valor no vacío que aparezca.
        if (!c.clientPhone && t.clientPhone) c.clientPhone = t.clientPhone;
        if (!c.clientName && t.clientName) c.clientName = t.clientName;

        c.tickets++;
        c.gastoTotal += t.total;
        if (t.fecha && t.fecha < c.primeraVisita) c.primeraVisita = t.fecha;
        if (t.fecha && t.fecha > c.ultimaVisita) c.ultimaVisita = t.fecha;
        if (t.formula) c.formulas++;

        for (const l of t.lineas) {
          if (!l.codigo) continue;
          const s = c._serv.get(l.codigo) || { codigo: l.codigo, servicio: l.servicio, veces: 0, importe: 0 };
          s.veces++; s.importe += l.importe;
          c._serv.set(l.codigo, s);

          const of = l.oficial || 'SIN ASIGNAR';
          c._staff.set(of, (c._staff.get(of) || 0) + l.importe);
        }
      }

      const clientes = [...map.values()].map(c => {
        const topServicios = [...c._serv.values()]
          .sort((a, b) => b.veces - a.veces)
          .slice(0, 5)
          .map(s => ({ codigo: s.codigo, servicio: s.servicio, veces: s.veces, importe: r2(s.importe) }));

        let habitual = '';
        let maxImp = -1;
        for (const [of, imp] of c._staff.entries()) {
          if (imp > maxImp) { maxImp = imp; habitual = of; }
        }

        return {
          clientId: c.clientId,
          clientName: c.clientName,
          clientPhone: c.clientPhone,
          tickets: c.tickets,
          gastoTotal: r2(c.gastoTotal),
          ticketMedio: c.tickets ? r2(c.gastoTotal / c.tickets) : 0,
          primeraVisita: c.primeraVisita,
          ultimaVisita: c.ultimaVisita,
          formulas: c.formulas,
          oficialHabitual: habitual,
          topServicios,
          esAnonimo: c.esAnonimo
        };
      }).sort((a, b) => b.gastoTotal - a.gastoTotal);

      return { ok: true, version: VERSION, total: clientes.length, clientes };

    } catch (e) {
      console.error(`${TAG} ❌ getMemoriaClientes:`, e);
      return { ok: false, error: safeErr(e), clientes: [] };
    }
  }
);

// =====================================================
// 3. getMemoriaCliente — ficha legacy completa de un cliente
// =====================================================
// Admite búsqueda por clientId legacy (exacto) o por teléfono.
// El teléfono se compara sin espacios ni separadores, criterio
// idéntico al del buscador de Recepción PRO (pagecode v1.0.28).
//
// ⚠️ La identidad real del cliente en KAMISUITE se establece por
// teléfono + nombre, NUNCA por email ni contactId (Guía V2 §14).
// Esta función NO resuelve contactId: devuelve el dato legacy tal
// cual y deja el emparejamiento con el CRM a la capa superior.
// =====================================================

export const getMemoriaCliente = webMethod(
  Permissions.SiteMember,
  async (opts = {}) => {
    try {
      const { clientId = null, telefono = '', refresh = false } = opts || {};
      if (!clientId && !telefono) {
        return { ok: false, error: { message: 'Falta clientId o telefono' } };
      }

      const { tickets } = await getData(refresh);
      const telBusca = txt(telefono).replace(/[\s\-()+.]/g, '');

      const suyos = tickets.filter(t => {
        if (clientId !== null && clientId !== '' && toNum(clientId) === t.clientId) return true;
        if (telBusca) {
          const tel = t.clientPhone.replace(/[\s\-()+.]/g, '');
          if (tel && tel === telBusca) return true;
        }
        return false;
      }).sort((a, b) => (b.fecha + b.hora).localeCompare(a.fecha + a.hora));

      if (!suyos.length) {
        return { ok: true, encontrado: false, cliente: null, tickets: [], formulas: [] };
      }

      const ref = suyos[0];
      let total = 0;
      const porServicio = new Map();
      const porStaff = new Map();
      const porAnio = new Map();
      const formulas = [];

      for (const t of suyos) {
        total += t.total;

        const anio = t.fecha.slice(0, 4);
        const a = porAnio.get(anio) || { anio, tickets: 0, importe: 0 };
        a.tickets++; a.importe += t.total;
        porAnio.set(anio, a);

        if (t.formula) {
          formulas.push({
            fecha: t.fecha,
            docId: t.docId,
            oficial: t.staff,
            importe: t.total,
            texto: t.formula
          });
        }

        for (const l of t.lineas) {
          if (!l.codigo) continue;
          const kSrv = claveServicio(l);
          const s = porServicio.get(kSrv) || {
            key: kSrv, codigo: l.codigo, servicio: l.servicio, grupo: l.grupo,
            marca: l.marca, esProducto: l.grupo === GRUPO_VENTA,
            veces: 0, importe: 0
          };
          s.veces++; s.importe += l.importe;
          porServicio.set(kSrv, s);

          const of = l.oficial || 'SIN ASIGNAR';
          const st = porStaff.get(of) || { oficial: of, veces: 0, importe: 0 };
          st.veces++; st.importe += l.importe;
          porStaff.set(of, st);
        }
      }

      const fechas = suyos.map(t => t.fecha).filter(Boolean).sort();

      return {
        ok: true,
        encontrado: true,
        version: VERSION,
        cliente: {
          clientId: ref.clientId,
          clientName: ref.clientName,
          clientPhone: suyos.map(t => t.clientPhone).find(Boolean) || '',
          tickets: suyos.length,
          gastoTotal: r2(total),
          ticketMedio: r2(total / suyos.length),
          primeraVisita: fechas[0] || '',
          ultimaVisita: fechas[fechas.length - 1] || '',
          formulas: formulas.length,
          esAnonimo: ref.esAnonimo
        },
        porAnio: [...porAnio.values()].map(a => ({ ...a, importe: r2(a.importe) })).sort((a, b) => a.anio.localeCompare(b.anio)),
        porServicio: [...porServicio.values()].map(s => ({ ...s, importe: r2(s.importe) })).sort((a, b) => b.veces - a.veces),
        porStaff: [...porStaff.values()].map(s => ({ ...s, importe: r2(s.importe) })).sort((a, b) => b.importe - a.importe),
        formulas,
        tickets: suyos
      };

    } catch (e) {
      console.error(`${TAG} ❌ getMemoriaCliente:`, e);
      return { ok: false, error: safeErr(e) };
    }
  }
);

// =====================================================
// 4. getMemoriaDia — "Aquel día"
// =====================================================

export const getMemoriaDia = webMethod(
  Permissions.SiteMember,
  async (opts = {}) => {
    try {
      const { fecha = '', refresh = false } = opts || {};
      if (!/^\d{4}-\d{2}-\d{2}$/.test(txt(fecha))) {
        return { ok: false, error: { message: 'Fecha requerida en formato YYYY-MM-DD' } };
      }

      const { tickets } = await getData(refresh);
      const delDia = tickets
        .filter(t => t.fecha === fecha)
        .sort((a, b) => a.hora.localeCompare(b.hora));

      let total = 0, efectivo = 0, tarjeta = 0, productos = 0;
      const clientes = new Set();
      const porStaff = new Map();

      for (const t of delDia) {
        total += t.total;
        efectivo += t.efectivo;
        tarjeta += t.tarjeta;
        productos += t.productos;
        if (t.clientId) clientes.add(t.clientId);
        for (const l of t.lineas) {
          const of = l.oficial || 'SIN ASIGNAR';
          const st = porStaff.get(of) || { oficial: of, lineas: 0, importe: 0 };
          st.lineas++; st.importe += l.importe;
          porStaff.set(of, st);
        }
      }

      const dow = dowFromYmd(fecha);

      return {
        ok: true,
        version: VERSION,
        fecha,
        diaSemana: dow >= 0 ? NOMBRE_DOW[dow] : '',
        resumen: {
          tickets: delDia.length,
          clientes: clientes.size,
          importeTotal: r2(total),
          ticketMedio: delDia.length ? r2(total / delDia.length) : 0,
          efectivo: r2(efectivo),
          tarjeta: r2(tarjeta),
          productos: r2(productos)
        },
        porStaff: [...porStaff.values()].map(s => ({ ...s, importe: r2(s.importe) })).sort((a, b) => b.importe - a.importe),
        tickets: delDia
      };

    } catch (e) {
      console.error(`${TAG} ❌ getMemoriaDia:`, e);
      return { ok: false, error: safeErr(e) };
    }
  }
);

// =====================================================
// 5. getMemoriaServicio — evolución de un código de servicio
// =====================================================
// El código es el literal del legacy (TRZ, CLO, CS, PSC…). NO se
// traduce a ServiceCatalog: ver regla dura en la cabecera.
// =====================================================

export const getMemoriaServicio = webMethod(
  Permissions.SiteMember,
  async (opts = {}) => {
    try {
      const { codigo = '', refresh = false } = opts || {};
      const cod = txt(codigo).toUpperCase();
      if (!cod) return { ok: false, error: { message: 'Falta codigo' } };

      // Clave compuesta de producto: 'VN:<referencia>'. Ver claveServicio().
      let codBase = cod;
      let refBuscada = 0;
      if (cod.indexOf(':') > 0) {
        const partes = cod.split(':');
        codBase = partes[0];
        refBuscada = toNum(partes[1]);
      }

      const { tickets } = await getData(refresh);

      let veces = 0, unidades = 0, importe = 0;
      let descripcion = '', grupo = '';
      const porMes = new Map();
      const porStaff = new Map();
      const clientes = new Map();

      let marca = '';

      for (const t of tickets) {
        for (const l of t.lineas) {
          if (txt(l.codigo).toUpperCase() !== codBase) continue;
          if (refBuscada && l.refProducto !== refBuscada) continue;

          veces++; unidades += l.cantidad; importe += l.importe;
          if (!descripcion && l.servicio) descripcion = l.servicio;
          if (!grupo && l.grupo) grupo = l.grupo;
          if (!marca && l.marca) marca = l.marca;

          const mes = t.fecha.slice(0, 7);
          const m = porMes.get(mes) || { periodo: mes, veces: 0, importe: 0 };
          m.veces++; m.importe += l.importe;
          porMes.set(mes, m);

          const of = l.oficial || 'SIN ASIGNAR';
          const st = porStaff.get(of) || { oficial: of, veces: 0, importe: 0 };
          st.veces++; st.importe += l.importe;
          porStaff.set(of, st);

          if (t.clientId) {
            const c = clientes.get(t.clientId) || {
              clientId: t.clientId, clientName: t.clientName,
              clientPhone: t.clientPhone, veces: 0, importe: 0, ultima: t.fecha
            };
            c.veces++; c.importe += l.importe;
            if (t.fecha > c.ultima) c.ultima = t.fecha;
            clientes.set(t.clientId, c);
          }
        }
      }

      return {
        ok: true,
        version: VERSION,
        codigo: cod,
        codigoBase: codBase,
        refProducto: refBuscada,
        descripcion,
        grupo,
        marca,
        totales: {
          veces,
          unidades,
          importe: r2(importe),
          importeMedio: veces ? r2(importe / veces) : 0,
          clientes: clientes.size
        },
        porMes: [...porMes.values()].map(m => ({ ...m, importe: r2(m.importe) })).sort((a, b) => a.periodo.localeCompare(b.periodo)),
        porStaff: [...porStaff.values()].map(s => ({ ...s, importe: r2(s.importe) })).sort((a, b) => b.importe - a.importe),
        clientes: [...clientes.values()].map(c => ({ ...c, importe: r2(c.importe) })).sort((a, b) => b.veces - a.veces)
      };

    } catch (e) {
      console.error(`${TAG} ❌ getMemoriaServicio:`, e);
      return { ok: false, error: safeErr(e) };
    }
  }
);

// =====================================================
// 6. getMemoriaFormulas — buscador sobre las fórmulas técnicas
// =====================================================
// Búsqueda LITERAL sobre el texto escrito a mano por el salón. No
// normaliza marcas, tonos ni volúmenes: el texto original contiene
// erratas de tecleo reales y cualquier "corrección" automática sería
// inventar dato técnico de coloración.
//
// El filtro se hace en memoria y no con wixData.contains() porque
// contains() es case-sensitive en Wix — misma razón por la que
// careProfileLogic filtra en memoria (Manual Care Profile §3.1).
// =====================================================

export const getMemoriaFormulas = webMethod(
  Permissions.SiteMember,
  async (opts = {}) => {
    try {
      const { q = '', limit = 200, refresh = false } = opts || {};
      const query = norm(q);
      const tope = Math.min(Math.max(toNum(limit) || 200, 1), 1000);

      const { tickets } = await getData(refresh);

      const conFormula = tickets.filter(t => !!t.formula);
      const filtradas = query
        ? conFormula.filter(t => norm(t.formula).includes(query))
        : conFormula;

      const ordenadas = filtradas.sort((a, b) => b.fecha.localeCompare(a.fecha));

      const clientes = new Set(ordenadas.map(t => t.clientId).filter(Boolean));

      return {
        ok: true,
        version: VERSION,
        query: txt(q),
        totalConFormula: conFormula.length,
        encontradas: ordenadas.length,
        clientesAfectados: clientes.size,
        truncado: ordenadas.length > tope,
        resultados: ordenadas.slice(0, tope).map(t => ({
          fecha: t.fecha,
          docId: t.docId,
          clientId: t.clientId,
          clientName: t.clientName,
          clientPhone: t.clientPhone,
          oficial: t.staff,
          importe: t.total,
          codigos: t.codigos,
          texto: t.formula
        }))
      };

    } catch (e) {
      console.error(`${TAG} ❌ getMemoriaFormulas:`, e);
      return { ok: false, error: safeErr(e), resultados: [] };
    }
  }
);

// =====================================================
// 7. getMemoriaDiagnostico — verificación de field IDs
// =====================================================
// Devuelve las claves REALES de la primera fila de cada colección y
// el resultado de contrastarlas contra F_TICKET / F_MES. Sirve para
// confirmar los field IDs que Wix generó al crear las colecciones sin
// tener que abrir el CMS ni desplegar código a ciegas.
// =====================================================

export const getMemoriaDiagnostico = webMethod(
  Permissions.SiteMember,
  async () => {
    try {
      const [t, m] = await Promise.all([
        wixData.query(CMS_TICKETS).limit(1).find({ suppressAuth: true }),
        wixData.query(CMS_MENSUAL).limit(1).find({ suppressAuth: true })
      ]);

      const filaT = (t.items || [])[0] || {};
      const filaM = (m.items || [])[0] || {};

      const clavesT = Object.keys(filaT);
      const clavesM = Object.keys(filaM);

      const faltanT = Object.entries(F_TICKET)
        .filter(([, id]) => clavesT.length > 0 && !clavesT.includes(id))
        .map(([alias, id]) => ({ alias, esperado: id }));

      const faltanM = Object.entries(F_MES)
        .filter(([, id]) => clavesM.length > 0 && !clavesM.includes(id))
        .map(([alias, id]) => ({ alias, esperado: id }));

      return {
        ok: true,
        version: VERSION,
        tickets: {
          coleccion: CMS_TICKETS,
          total: t.totalCount,
          clavesReales: clavesT,
          camposEsperadosQueNoAparecen: faltanT,
          muestra: filaT
        },
        mensual: {
          coleccion: CMS_MENSUAL,
          total: m.totalCount,
          clavesReales: clavesM,
          camposEsperadosQueNoAparecen: faltanM,
          muestra: filaM
        }
      };

    } catch (e) {
      console.error(`${TAG} ❌ getMemoriaDiagnostico:`, e);
      return { ok: false, error: safeErr(e) };
    }
  }
);

// =====================================================
// 8. getFichaTecnicaCliente — historial técnico para la sala
// =====================================================
// Consumida desde el botón FICHA TÉCNICA de la barra de Recepción PRO.
//
// ⚠️ CONTRATO INVIOLABLE: el payload NO contiene importes, métodos de
// pago, gasto acumulado, ticket medio ni ningún otro dato económico.
// Es la única función de este backend pensada para uso general del
// personal; el resto sirven informes de gerencia.
//
// Si alguna vez hay que añadir un campo aquí, la pregunta previa es:
// ¿un dato económico se podría deducir de él? Si la respuesta no es un
// no rotundo, no se añade.
//
// Búsqueda por teléfono (identidad real en KAMISUITE, Guía V2 §14) o
// por número de cliente legacy. El teléfono se normaliza quitando
// espacios y separadores, mismo criterio que el buscador de clientes
// de Recepción PRO (pagecode v1.0.28).
// =====================================================

export const getFichaTecnicaCliente = webMethod(
  Permissions.SiteMember,
  async (opts = {}) => {
    try {
      const { telefono = '', clientId = null, soloConFormula = false, refresh = false } = opts || {};
      if (!telefono && (clientId === null || clientId === '')) {
        return { ok: false, error: { message: 'Falta telefono o clientId' } };
      }

      const { tickets } = await getData(refresh);
      const telBusca = txt(telefono).replace(/[\s\-()+.]/g, '');

      const suyos = tickets.filter(t => {
        if (clientId !== null && clientId !== '' && toNum(clientId) === t.clientId) return true;
        if (telBusca) {
          const tel = t.clientPhone.replace(/[\s\-()+.]/g, '');
          if (tel && tel === telBusca) return true;
        }
        return false;
      }).sort((a, b) => (b.fecha + b.hora).localeCompare(a.fecha + a.hora));

      if (!suyos.length) {
        return { ok: true, encontrado: false, cliente: null, visitas: [] };
      }

      const ref = suyos[0];
      const fechas = suyos.map(t => t.fecha).filter(Boolean).sort();
      const conFormula = suyos.filter(t => !!t.formula);

      // Servicios más repetidos, por NOMBRE y número de veces. Sin importes.
      const frecuencia = new Map();
      for (const t of suyos) {
        for (const l of t.lineas) {
          if (!l.codigo) continue;
          if (l.grupo === GRUPO_VENTA) continue; // el producto no es técnica
          const k = claveServicio(l);
          const f = frecuencia.get(k) || { codigo: l.codigo, servicio: l.servicio, veces: 0 };
          f.veces++;
          frecuencia.set(k, f);
        }
      }

      const fuente = soloConFormula ? conFormula : suyos;

      // Proyección explícita campo a campo. NO se hace spread del ticket:
      // un `...t` colaría importe, método de pago y desglose de cobro.
      const visitas = fuente.map(t => ({
        fecha: t.fecha,
        hora: t.hora,
        profesional: t.staff,
        variosProfesionales: t.staffMultiple,
        servicios: t.lineas
          .filter(l => l.grupo !== GRUPO_VENTA)
          .map(l => ({ codigo: l.codigo, servicio: l.servicio, grupo: l.grupo })),
        formula: t.formula
      }));

      return {
        ok: true,
        encontrado: true,
        version: VERSION,
        cliente: {
          clientId: ref.clientId,
          clientName: ref.clientName,
          clientPhone: suyos.map(t => t.clientPhone).find(Boolean) || '',
          visitas: suyos.length,
          formulas: conFormula.length,
          primeraVisita: fechas[0] || '',
          ultimaVisita: fechas[fechas.length - 1] || ''
        },
        habituales: [...frecuencia.values()].sort((a, b) => b.veces - a.veces).slice(0, 8),
        visitas
      };

    } catch (e) {
      console.error(`${TAG} ❌ getFichaTecnicaCliente:`, e);
      return { ok: false, error: safeErr(e), visitas: [] };
    }
  }
);
