// =====================================================
// KAMISUITE — Backend: Catálogo de Consulta (uso interno Recepción)
// =====================================================
// VERSION: 1.0.1
// FECHA: 22 de julio de 2026
// ARCHIVO: backend/catalogoConsultaLogic.web.js
//
// CHANGELOG
//   v1.0.1 (22-Jul-2026) — FIX imágenes wix:image:// → URL pública.
//     · adaptarServicio ahora normaliza `image` vía wixImageToPublicUrl
//       (helper LITERAL de serviciosEdicionLogic v1.11.7). El campo
//       Image de Wix se persiste en el CMS con protocolo interno
//       `wix:image://v1/<mediaId>/...` y el navegador NO lo resuelve.
//       En v1.0.0 se pasaba tal cual → cards y modal con imagen rota.
//     · Mismo helper aplicado a StaffConfig.profileImage.
//     · Cero cambios en el contrato del backend ni en el widget.
//
// PROPÓSITO:
//   Backend del módulo "Recepción | Listado de Servicios" v2 (sustituye
//   al legacy Listado de Servicios V1 que leía SvMapeoServicios + Wix
//   Bookings). El módulo es la HERRAMIENTA DE CONSULTA del salón:
//   cualquier miembro del equipo puede ver precio, duración y descripción
//   de cualquier servicio, y opcionalmente construir una simulación de
//   presupuesto para copiar / enviar por WhatsApp / email al cliente.
//
//   El backend NO gestiona catálogo (eso lo hace serviciosEdicionLogic).
//   Solo LEE. Único punto de escritura: la traza opcional del presupuesto
//   enviado en CommunicationLog (event='presupuesto').
//
// PAREJAS:
//   - Page code: Recepción | Listado de Servicios.gstnd.js v2.0.0
//   - Widget:    catalogoservicios (reemplazo interior)
//
// CONTRATO PRINCIPAL:
//   getCatalogoConsulta() — 1 sola llamada devuelve todo lo necesario
//   para pintar el módulo:
//     · servicios[]   — catálogo completo (activos + inactivos + todo uso).
//                       Shape reutiliza adaptarServicio() del widget público
//                       (para reusar la lógica de variantes/complementos
//                       ya probada) + campos extra propios del catálogo
//                       interno (active, uso, cobroporPeso, precioGramo,
//                       bonoActivo/Numero/Descuento).
//     · staff[]       — empleados de StaffConfig (para filtro por empleado
//                       y para etiquetar quién hace cada servicio).
//     · salonConfig   — brandName/phone/address/widgetSkin (para formato
//                       del presupuesto y para aplicar la piel visual).
//     · contactos[]   — clientes CRM formateados
//                       ({contactId, nombre, apellido, nombreCompleto,
//                         email, telefono}), reutilizados de recepcionLogic.
//                       Cero backend duplicado.
//
//   logPresupuesto({ channel, recipient, clientName, textoPresupuesto,
//                    totalPrecio, duracionTotal }) — inserta traza en
//   CommunicationLog con event='presupuesto'. Fire-and-forget desde el
//   widget: si falla no bloquea el copiar / abrir wa.me / abrir mailto.
//
// FIELD IDs verificados en producción (Hair-Times V2, 22-Jul-2026):
//   ServiceCatalog:  IDS_QUE_SIEMPRE_PEDIMOS.md §ServiceCatalog + campos
//                    v1.11.7 (cobroporPeso, precioGramo, bonoActivo,
//                    bonoNumero, bonoDescuento, vistaEnTour, descuentoActivo,
//                    descuentoPromo, claseServicio, mapeoFases, complementos).
//   StaffConfig:     recepcionProLogic getStaffColumnas (wixResourceId,
//                    displayName, canonicalName, profileImage, isExternal,
//                    order, active, notes).
//   SalonConfig:     salonConfigLogic v1.0.5 ALL_FIELDS (brandName, phone,
//                    address, widgetSkin).
//   CommunicationLog: whatsappLogic _registrarLog (event, channel,
//                     recipient, clientName, services, result, errorDetail).
// =====================================================

import { Permissions, webMethod } from 'wix-web-module';
import wixData from 'wix-data';

// Reutilización de cargarTodosContactos — YA cachea internamente y es
// el patrón usado en producción por pagecode_recepcionProCMS (Recepción
// PRO CMS) y pagecode_comunicaciones (Comunicaciones). Cero duplicación.
import { cargarTodosContactos } from 'backend/recepcionLogic.web';

const VERSION = '1.0.1';
const TAG = `[CatalogoConsulta][${VERSION}]`;

const CMS_CATALOG = 'ServiceCatalog';
const CMS_STAFF   = 'StaffConfig';
const CMS_CONFIG  = 'SalonConfig';
const CMS_LOG     = 'CommunicationLog';

const NOTA_RECURSO_INTERNO = 'RECURSO INTERNO';

// =====================================================
// HELPERS (idénticos al patrón de widgetPublicoLogic / recepcionProLogic)
// =====================================================

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function safeErr(e) {
  return { message: e?.message || String(e) };
}

// v1.0.1 — Helper LITERAL de serviciosEdicionLogic v1.11.7.
// Convierte `wix:image://v1/<mediaId>/<originalName>...` a URL pública
// `https://static.wixstatic.com/media/<mediaId>`. Devuelve tal cual si
// ya es URL pública (https://...) o null si es null/vacío/no-string.
// El campo Image del CMS de Wix se persiste con protocolo interno;
// el navegador NO lo resuelve. Sin este helper, las cards y el modal
// muestran imagen rota (fue el fallo de v1.0.0).
function wixImageToPublicUrl(wixUrl) {
  if (!wixUrl || typeof wixUrl !== 'string') return null;
  if (wixUrl.startsWith('wix:image://')) {
    try {
      const match = wixUrl.match(/wix:image:\/\/v1\/([^/]+)/);
      if (match && match[1]) return `https://static.wixstatic.com/media/${match[1]}`;
    } catch (_) {}
    return null;
  }
  return wixUrl; // ya es URL pública (o algo raro que dejamos pasar)
}

// jsonIn defensivo: Wix Text/Object puede tener: string JSON legacy,
// array directo, o objeto envuelto con claves canónicas {items|ids|names}.
// Patrón LITERAL de widgetPublicoLogic v0.7.7.
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

// Lectura defensiva de idStaff (Object {ids:[...]}, array legacy, o
// string JSON legacy). Patrón LITERAL de widgetPublicoLogic v0.7.7.
function parseIdStaff(raw) {
  let arr = [];
  if (raw) {
    if (Array.isArray(raw.ids)) arr = raw.ids;
    else if (Array.isArray(raw)) arr = raw;
    else if (typeof raw === 'string') {
      try {
        const p = JSON.parse(raw);
        if (Array.isArray(p?.ids)) arr = p.ids;
        else if (Array.isArray(p)) arr = p;
      } catch (_) {}
    }
  }
  return arr.filter(s => typeof s === 'string' && s.length > 0);
}

// Lectura defensiva de staff (Object {names:[...]}, array legacy, o
// string JSON legacy). Mismo patrón que parseIdStaff.
function parseStaffNames(raw) {
  let arr = [];
  if (raw) {
    if (Array.isArray(raw.names)) arr = raw.names;
    else if (Array.isArray(raw)) arr = raw;
    else if (typeof raw === 'string') {
      try {
        const p = JSON.parse(raw);
        if (Array.isArray(p?.names)) arr = p.names;
        else if (Array.isArray(p)) arr = p;
      } catch (_) {}
    }
  }
  return arr.filter(s => typeof s === 'string' && s.length > 0);
}

// =====================================================
// ADAPTER · ServiceCatalog row → shape del catálogo interno
// =====================================================
// Reutiliza la lógica de complementos / variantes / grupos exclusivos de
// widgetPublicoLogic.adaptarServicio (v0.7.7). Añade encima los campos
// extra que necesita el uso INTERNO del salón: active, uso, tipo,
// vistaEnTour, hidden (derivado), cobroporPeso, precioGramo, bonos.
//
// A diferencia del widget público, aquí NUNCA se filtra por active ni
// por uso: el operario del salón debe ver TODO el catálogo, y advertimos
// visualmente en el widget del estado real de cada servicio.
function adaptarServicio(it, porSetupUid) {
  // ── Complementos (patrón literal widgetPublicoLogic v0.7.7) ──
  const mapeo = jsonIn(it.mapeoFases, 'items');

  const fasePorRef = {};
  if (Array.isArray(mapeo)) {
    for (const f of mapeo) {
      if (f && f.tipo === 'servicio' && typeof f.ref === 'string' && f.ref) {
        fasePorRef[f.ref] = f;
      }
    }
  }

  // Set de setupUids que ya salen como opción en un mapeoFases exclusivo
  // (evita duplicación con el bloque bool/choice). Patrón v0.7.6.
  const uidsEnExclusivos = new Set();
  if (Array.isArray(mapeo)) {
    for (const f of mapeo) {
      if (!f || f.tipo !== 'exclusivo' || !Array.isArray(f.refs)) continue;
      for (const r of f.refs) if (typeof r === 'string' && r) uidsEnExclusivos.add(r);
    }
  }

  const complementosUidsRaw = jsonIn(it.complementos, 'items');
  const complementosUids = (Array.isArray(complementosUidsRaw) ? complementosUidsRaw : [])
    .filter(uid => !uidsEnExclusivos.has(uid));

  const complements = complementosUids
    .map(uid => porSetupUid[uid])
    .filter(Boolean)
    .map(c => {
      const cTieneVariantes = !!c.hasVariants;
      const faseEnMapeo = fasePorRef[c.setupUid];
      const cMandatory = !!(faseEnMapeo && faseEnMapeo.obligatorio === true);

      if (cTieneVariantes) {
        const vars = jsonIn(c.variantes, 'items');
        const opts = (Array.isArray(vars) ? vars : [])
          .map((v, i) => ({
            id: (v && typeof v.tamano_estilo === 'string' && v.tamano_estilo.trim())
                  ? v.tamano_estilo.trim()
                  : ('v' + i),
            label: (v && v.nombre) ? String(v.nombre) : ('Opción ' + (i + 1)),
            price: toNum(v && v.precio),
            duration: toNum(v && v.duracion)
          }));

        const options = cMandatory
          ? opts
          : [{ id: 'none', label: 'No añadir', price: 0, duration: 0 }, ...opts];

        return {
          id: c.setupUid,
          label: c.label || '',
          hint: c.descripcion || '',
          type: 'choice',
          required: cMandatory,
          options
        };
      }

      return {
        id: c.setupUid,
        label: c.label || '',
        hint: c.descripcion || '',
        type: 'bool',
        required: cMandatory,
        price: toNum(c.price),
        duration: toNum(c.duration)
      };
    });

  // Grupos exclusivos del mapeoFases — patrón v0.7.5.
  if (Array.isArray(mapeo)) {
    mapeo.forEach((f, idx) => {
      if (!f || f.tipo !== 'exclusivo') return;
      if (!Array.isArray(f.refs) || f.refs.length === 0) return;
      const opts = f.refs
        .map(r => porSetupUid[r])
        .filter(Boolean)
        .map(svc => ({
          id: svc.setupUid,
          label: svc.label || '',
          price: toNum(svc.price),
          duration: toNum(svc.duration)
        }));
      if (opts.length === 0) return;
      complements.push({
        id: 'exc:' + idx,
        label: (typeof f.label === 'string' && f.label.trim()) ? f.label.trim() : 'Elige uno',
        hint: '',
        type: 'exclusive',
        required: false,
        options: [{ id: 'none', label: 'No añadir', price: 0, duration: 0 }, ...opts]
      });
    });
  }

  // ── Variantes del propio servicio ──
  const hasVariants = !!it.hasVariants;
  const variantes = hasVariants ? jsonIn(it.variantes, 'items') : [];

  // ── Precio / duración base ──
  const priceNum = toNum(it.price);
  const basePrice = priceNum > 0 ? priceNum : null;
  const baseDuration = toNum(it.duration);

  // ── Staff ──
  const staffIds = parseIdStaff(it.idStaff);
  const staffNames = parseStaffNames(it.staff);

  // ── Estado real (para badge visual y filtros) ──
  const active = it.active === true;
  const uso = String(it.uso || '').toLowerCase();  // 'kamisuite' | 'wixnativo' | 'ambos' | ''
  const vistaEnTour = it.vistaEnTour === true;
  // hidden = "no visible al público" (o inactivo, o solo wixnativo interno).
  // El widget usa este flag para pintar badge de advertencia.
  const hidden = !active || (uso === 'wixnativo');

  return {
    // Identidad
    _id: it._id || '',
    setupUid: it.setupUid || '',
    label: it.label || '',
    descripcion: it.descripcion || '',
    descripcionTour: it.descripcionTour || '',
    image: wixImageToPublicUrl(it.image),  // v1.0.1

    // Clasificación
    group: it.group || '',
    family: it.family || '',
    tipo: it.tipo || '',
    claseServicio: it.claseServicio || '',
    uso,

    // Estado
    active,
    vistaEnTour,
    hidden,

    // Precio / duración base
    basePrice,
    baseDuration,
    minProceso: toNum(it.minProceso),
    order: toNum(it.order),

    // Variantes propias
    hasVariants,
    variantes,

    // Complementos (adaptados, tipo widget público)
    complements,

    // Cobro por peso (nanoplastia/keratina)
    cobroporPeso: it.cobroporPeso === true,
    precioGramo: (typeof it.precioGramo === 'number' && Number.isFinite(it.precioGramo))
      ? it.precioGramo
      : null,

    // Bonos configurados (informativo)
    bonoActivo: it.bonoActivo === true,
    bonoNumero: (typeof it.bonoNumero === 'number' && Number.isFinite(it.bonoNumero))
      ? it.bonoNumero
      : null,
    bonoDescuento: (typeof it.bonoDescuento === 'number' && Number.isFinite(it.bonoDescuento))
      ? it.bonoDescuento
      : null,

    // Staff que lo ejecuta ([] = todos)
    staffIds,
    staffNames
  };
}

// =====================================================
// 1 · getCatalogoConsulta — TODO en una llamada
// =====================================================
// Devuelve catálogo completo + staff + salonConfig + contactos.
// Sin filtros: el widget interno muestra TODO y filtra en cliente.
// Cero paginación: el catálogo típico es 60-100 servicios y los
// contactos ya paginan internamente en cargarTodosContactos.
export const getCatalogoConsulta = webMethod(
  Permissions.SiteMember,
  async () => {
    const t0 = Date.now();
    try {
      // Cuatro cargas en paralelo. Cada una tiene su propio timeout
      // interno; si una falla, seguimos con el resto y devolvemos
      // aviso en 'warnings' (no bloquea el módulo).
      const [rCat, rStaff, rConfig, rContactos] = await Promise.allSettled([
        wixData.query(CMS_CATALOG).limit(500).find({ suppressAuth: true }),
        wixData.query(CMS_STAFF).eq('active', true).limit(100).find({ suppressAuth: true }),
        wixData.query(CMS_CONFIG).limit(1).find({ suppressAuth: true }),
        cargarTodosContactos()
      ]);

      const warnings = [];

      // ── ServiceCatalog ──
      let items = [];
      if (rCat.status === 'fulfilled') {
        items = rCat.value.items || [];
      } else {
        warnings.push('catalogo:' + (rCat.reason?.message || 'error'));
      }

      // Índice porSetupUid para resolver complementos (patrón adaptarServicio).
      const porSetupUid = {};
      for (const it of items) {
        if (it.setupUid) porSetupUid[it.setupUid] = it;
      }

      // Adaptar TODOS los servicios (sin filtro).
      const servicios = items
        .map(it => adaptarServicio(it, porSetupUid))
        .sort((a, b) => {
          // Prioridad de orden: group → order → label
          const g = (a.group || '').localeCompare(b.group || '');
          if (g !== 0) return g;
          const o = toNum(a.order) - toNum(b.order);
          if (o !== 0) return o;
          return (a.label || '').localeCompare(b.label || '');
        });

      // ── StaffConfig ──
      let staff = [];
      if (rStaff.status === 'fulfilled') {
        const staffRaw = rStaff.value.items || [];
        // Mismo filtro que getStaffColumnas: excluir CUALQUIERA / PROCESO
        // y cualquier recurso interno marcado con NOTA_RECURSO_INTERNO.
        staff = staffRaw
          .filter(it => {
            const notas = String(it.notes || '');
            if (notas.includes(NOTA_RECURSO_INTERNO)) return false;
            const canon = String(it.canonicalName || '').toUpperCase();
            if (canon === 'CUALQUIERA' || canon === 'PROCESO') return false;
            return true;
          })
          .map(it => ({
            wixResourceId: it.wixResourceId || it._id,
            displayName: (it.displayName || it.canonicalName || '').replace(/^[A-Z]_/, ''),
            canonicalName: it.canonicalName || '',
            isExternal: !!it.isExternal,
            profileImage: wixImageToPublicUrl(it.profileImage) || '',  // v1.0.1
            order: toNum(it.order)
          }))
          .sort((a, b) => toNum(a.order) - toNum(b.order));
      } else {
        warnings.push('staff:' + (rStaff.reason?.message || 'error'));
      }

      // ── SalonConfig ── (solo campos que usa el widget)
      let salonConfig = {
        brandName: '',
        phone: '',
        address: '',
        widgetSkin: 'niebla',
        defaultProfessional: '',
        reportsTitle: ''
      };
      if (rConfig.status === 'fulfilled') {
        const c = (rConfig.value.items || [])[0] || {};
        salonConfig = {
          brandName: c.brandName || '',
          phone: c.phone || '',
          address: c.address || '',
          widgetSkin: c.widgetSkin || 'niebla',
          defaultProfessional: c.defaultProfessional || '',
          reportsTitle: c.reportsTitle || ''
        };
      } else {
        warnings.push('config:' + (rConfig.reason?.message || 'error'));
      }

      // ── Contactos CRM ──
      let contactos = [];
      if (rContactos.status === 'fulfilled') {
        const rc = rContactos.value;
        if (rc && rc.ok && Array.isArray(rc.clientes)) {
          contactos = rc.clientes;
        } else if (rc && !rc.ok) {
          warnings.push('contactos:' + (rc.error?.message || 'error'));
        }
      } else {
        warnings.push('contactos:' + (rContactos.reason?.message || 'error'));
      }

      const dt = ((Date.now() - t0) / 1000).toFixed(2);
      console.log(`${TAG} ✅ getCatalogoConsulta: ${servicios.length} servicios, ${staff.length} staff, ${contactos.length} contactos. ${dt}s ${warnings.length ? '⚠️ ' + warnings.join(' | ') : ''}`);

      return {
        ok: true,
        version: VERSION,
        servicios,
        staff,
        salonConfig,
        contactos,
        warnings
      };

    } catch (e) {
      console.error(`${TAG} ❌ getCatalogoConsulta:`, e.message);
      return {
        ok: false,
        version: VERSION,
        error: safeErr(e),
        servicios: [],
        staff: [],
        salonConfig: {
          brandName: '', phone: '', address: '', widgetSkin: 'niebla',
          defaultProfessional: '', reportsTitle: ''
        },
        contactos: []
      };
    }
  }
);

// =====================================================
// 2 · logPresupuesto — traza de presupuesto exportado
// =====================================================
// Escribe en CommunicationLog con event='presupuesto'. El widget la
// invoca fire-and-forget tras pulsar Copiar / WhatsApp / Email — si
// falla, no bloquea la acción del usuario (que ya se ejecutó en el
// cliente vía Clipboard API / wa.me / mailto).
//
// Payload:
//   { channel: 'whatsapp' | 'email' | 'copiar',
//     recipient: string,    // email o teléfono (vacío para copiar)
//     clientName: string,   // vacío si no se eligió cliente
//     textoPresupuesto: string,
//     totalPrecio: number,
//     duracionTotal: number }
//
// Field IDs de CommunicationLog (verificados en whatsappLogic._registrarLog):
//   event, channel, recipient, clientName, result, errorDetail,
//   services, staffName, appointmentDate, appointmentTime, attachment.
//
// Solo usamos event/channel/recipient/clientName/services/result.
// Los otros los deja Wix como null (colección tolera campos ausentes).
export const logPresupuesto = webMethod(
  Permissions.SiteMember,
  async (payload) => {
    try {
      const p = payload || {};

      // Normalización defensiva de canal.
      const ch = String(p.channel || '').toLowerCase();
      const channel = (ch === 'whatsapp' || ch === 'email' || ch === 'copiar') ? ch : 'copiar';

      // El texto puede ser largo si el presupuesto lleva muchos servicios;
      // acotamos a 5000 chars por sensatez (Wix Text max ~500K, no es
      // problema técnico, pero mantenemos algo razonable para logs).
      let texto = String(p.textoPresupuesto || '');
      if (texto.length > 5000) texto = texto.slice(0, 4997) + '...';

      const registro = {
        event: 'presupuesto',
        channel,
        recipient: String(p.recipient || ''),
        clientName: String(p.clientName || ''),
        services: texto,
        result: 'ok',
        errorDetail: ''
      };

      const inserted = await wixData.insert(CMS_LOG, registro, { suppressAuth: true });
      console.log(`${TAG} ✅ logPresupuesto: ${channel} → ${registro.clientName || registro.recipient || '(sin destinatario)'} · id=${inserted._id}`);
      return { ok: true, version: VERSION, _id: inserted._id };

    } catch (e) {
      // Ojo: NO relanzar. El widget espera respuesta silenciosa.
      console.warn(`${TAG} ⚠️ logPresupuesto falló (no bloquea):`, e.message);
      return { ok: false, version: VERSION, error: safeErr(e) };
    }
  }
);