// =====================================================
// KAMISUITE - Edición de Servicios Backend
// =====================================================
// VERSION: 1.11.7
// FECHA: 7 de julio de 2026
//
// EDITOR CMS-ONLY TOTAL.
// El editor de servicios opera EXCLUSIVAMENTE sobre ServiceCatalog.
// YA NO lee ni edita NINGÚN servicio de Wix Bookings.
// YA NO toca SvMapeoServicios.
// El UUID del ancla Wix Bookings del salón es ÚNICO y vive en
// SalonConfig.wixAnclaId (v1.11.7). El editor lo lee de ahí y lo
// escribe en cada fila nueva de ServiceCatalog.
//
// ARCHIVO: backend/serviciosEdicionLogic.web.js
//
// CHANGELOG:
// v1.11.7 - 🎯 ANCLA desde SalonConfig (fuente de verdad única).
//           Antes: resolverAncla(family) buscaba en ServiceCatalog una
//           fila con el mismo family que ya tuviera wixAnclaId. La
//           práctica ha demostrado que TODOS los servicios del salón
//           (incluidos externos, simples y complejos) apuntan al mismo
//           UUID de ancla. La bifurcación por family era humo.
//           Ahora: resolverAnclaSalon() lee el UUID de
//           SalonConfig.wixAnclaId (pareja: salonConfigLogic v1.0.5 y
//           widget_salon_config v1.0.11).
//           Fallback (por robustez ante salones recién clonados sin
//           SalonConfig.wixAnclaId poblado): primer wixAnclaId no vacío
//           de ServiceCatalog, sin filtro por family. Si tampoco hay,
//           devuelve '' y el editor deja la fila con wixAnclaId vacío.
//           Cache local a nivel de módulo (_anclaSalonCache) para no
//           golpear SalonConfig en cada creación/edición dentro de la
//           misma instancia.
//           Cambios:
//             · NEW const CMS_SALON_CONFIG = 'SalonConfig'.
//             · resolverAncla(family) → resolverAnclaSalon() (sin
//               parámetro). Lógica reescrita: SalonConfig → fallback
//               ServiceCatalog sin filtro.
//             · actualizarServicio (antes línea 526-528): condición
//               deja de exigir registro.family; ahora se resuelve
//               siempre que el registro no traiga wixAnclaId.
//             · crearServicioCatalogo (antes línea 643): llamada sin
//               parámetro. familyFinal sigue calculándose exactamente
//               igual porque se sigue grabando en registro.family.
//             · duplicarServicioCatalogo: sin cambios; sigue copiando
//               el wixAnclaId de la fila original (nunca lo re-resuelve).
//           NO se toca ServiceCatalog: las 80 filas existentes siguen
//           con su wixAnclaId poblado como hoy; el motor recepcionProLogic
//           las sigue leyendo por fila sin enterarse del cambio.
// v1.11.6 - ➕ 3 funcionalidades nuevas (conexión a CMS; cálculo fuera).
//           · DUPLICAR: nueva función duplicarServicioCatalogo({catalogId})
//             clona la fila como "Copia de <nombre>" con setupUid nuevo,
//             _id nuevo y serviceIdWix vacío. Copia todos los campos de
//             catálogo. La llama el widget con type:'duplicateCatalog'.
//           · COBRO POR PESO: campos cobroporPeso (Boolean) y precioGramo
//             (Number). Lectura/escritura en listar/crear/actualizar.
//           · BONOS: bonoActivo (Boolean), bonoNumero (Number),
//             bonoDescuento (Number). Solo se conectan; el cálculo del
//             precio del bono se hace en otro sitio.
//           Números tipados con Number(); bonoDescuento acotado 0-100.
//           Widget pareja: edicionservicios v1.12.0.
// v1.11.5 - 🏷️ FIX: actualizarServicio ahora escribe `hasVariants`.
//           El payload del editor SÍ envía hasVariants (hasVariants:
//           esVariantes), y crearServicioCatalogo SÍ lo insertaba, pero
//           actualizarServicio NO lo desestructuraba ni lo escribía. Por
//           eso, al EDITAR un servicio existente para convertirlo en
//           "Simple con variantes", hasVariants quedaba en false en el CMS
//           y el servicio se trataba como sin variantes (selector no
//           aparecía en público ni en Recepción PRO). Cambios:
//             · hasVariants añadido a la desestructuración del payload.
//             · `if (hasVariants !== undefined) registro.hasVariants =
//               !!hasVariants;` junto al resto de campos.
//             · hasVariants añadido al objeto `servicio` devuelto para que
//               el widget refresque su estado local tras guardar.
//           Mismo patrón de bug que el minProceso (mostrar ≠ guardar):
//           un campo enviado por el widget que el backend de actualizar
//           no procesaba.
// v1.11.4 - Lectura + escritura de 4 campos nuevos de ServiceCatalog
//           para Tour del salón y descuentos promocionales:
//             · vistaEnTour     (Boolean) — muestra el servicio en Tour.
//             · descripcionTour (Text)    — descripción larga del Tour.
//             · descuentoActivo (Boolean) — flag de descuento activo.
//             · descuentoPromo  (Number)  — porcentaje 0-100.
//           Cambios:
//             · listarServiciosCompleto devuelve los 4 campos por servicio.
//             · actualizarServicio acepta y escribe los 4 si vienen
//               definidos en el payload (patrón `if (X !== undefined)`).
//             · crearServicioCatalogo acepta los 4 y los inserta.
//           Sin cambios estructurales: helpers, anclas, JSON envuelto y
//           resto de lógica de v1.11.3 intactos.
// v1.11.3 - Escritura JSON envuelto sin warning de Wix. Wix advierte
//           cuando un campo (Text u Object) contiene un array JSON
//           directo `[...]`. NO advierte cuando contiene un objeto
//           envuelto `{items:[...]}`. Cambios:
//           · NEW helper wrapItems(arr) → { items: [...] }.
//           · parseArrayCampo() ahora también acepta forma envuelta
//             { items:[...] } y devuelve el array (compat con legacy).
//           · ESCRITURA de mapeoFases, complementos y variantes en
//             actualizarServicio y crearServicioCatalogo: SIEMPRE como
//             objeto envuelto. Compatible con recepcionProLogic v1.0.8
//             (que ya lee con jsonIn(..., 'items')).
//           · LECTURA: listarServiciosCompleto sigue devolviendo arrays
//             al widget vía parseArrayCampo, sin cambios para el cliente.
//           · idStaff/staff: sin cambios (ya estaban como {ids}/{names}).
// v1.11.2 - Campo `claseServicio` (tipología nivel superior): se graba
//           siempre en crear/actualizar y se devuelve en listar. Valores:
//           simple | simple_variantes | complejo_fases | complejo_proceso.
//           Independiente de `tipo` (rol). Por defecto 'simple' al crear.
// v1.11.1 - CASCADA CMS-FIRST: el editor ya escribe/lee los campos
//           `complementos` (Array de setupUid) y `mapeoFases` (Array
//           ordenado de fases {tipo:'servicio',ref} | {tipo:'proceso',min}).
// v1.11.0 - CMS-ONLY TOTAL.
// v1.9.0  - genUid()/setupUid en crearServicioCatalogo (NO desplegado).
// v1.8.0  - Multi-tenant: staff de StaffConfig, campos idStaff/staff/
//           variantes/uso, suppressAuth en log.
// v1.7.x  - Sync clasificatorios, CMS-only edición, category legible.
// v1.7.0  - minProceso y ordenFases en ServiceCatalog.
// v1.6.x  - eliminarServicioCMS.
// v1.5.x  - descripcion, fix duplicado categoría.
// v1.4.0  - Sync ServiceCatalog, crearServicioCatalogo, uploadImagenServicio.
// v1.3.0  - Log de cambios.
// =====================================================

import { Permissions, webMethod } from 'wix-web-module';
import { mediaManager } from 'wix-media-backend';
import wixData from 'wix-data';

const TAG = '[ServiciosEdicion][1.11.7]';
const CMS_LOG = 'ChangeLogServices';
const CMS_CATALOG = 'ServiceCatalog';
const CMS_STAFF = 'StaffConfig';
const CMS_SALON_CONFIG = 'SalonConfig';

// v1.11.7 — Cache local del UUID del ancla del salón. Se resuelve una
// vez por instancia y se reutiliza para todas las creaciones/ediciones
// hasta el próximo cold start. Si SalonConfig.wixAnclaId cambia, basta
// redeploy o esperar al siguiente arranque del módulo.
let _anclaSalonCache = null;

// =====================================================
// HELPER: wix:image:// → URL pública
// =====================================================
function wixImageToPublicUrl(wixUrl) {
  if (!wixUrl || typeof wixUrl !== 'string') return null;
  if (wixUrl.startsWith('wix:image://')) {
    try {
      const match = wixUrl.match(/wix:image:\/\/v1\/([^/]+)/);
      if (match && match[1]) return `https://static.wixstatic.com/media/${match[1]}`;
    } catch (_) {}
    return null;
  }
  return wixUrl; // ya es URL pública
}

// =====================================================
// HELPER: slug del CMS 'group' → label legible
// =====================================================
function groupSlugToLabel(slug) {
  if (!slug) return 'Otros';
  const s = String(slug).trim();
  const map = {
    'coloracion': 'Coloración',
    'cortesmujer': 'Cortes Mujer',
    'peinados': 'Peinados',
    'tratamientos': 'Tratamientos',
    'caballero': 'Caballero',
    'spa': 'Spa Capilar',
    'fases': 'Fases'
  };
  if (map[s]) return map[s];
  const limpio = s.replace(/_/g, ' ').replace(/&/g, ' & ').replace(/\s+/g, ' ').trim();
  return limpio.charAt(0).toUpperCase() + limpio.slice(1);
}

// =====================================================
// HELPERS STAFF — el campo es OBJECT en CMS
// idStaff = { ids:   [wixResourceId, ...] }
// staff   = { names: [displayName,  ...] }
// =====================================================
function parseStaffIds(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'object' && Array.isArray(value.ids)) return value.ids;
  if (typeof value === 'string') {
    try {
      const p = JSON.parse(value);
      if (Array.isArray(p)) return p;
      if (p && Array.isArray(p.ids)) return p.ids;
    } catch (_) {}
  }
  return [];
}

function parseStaffNames(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'object' && Array.isArray(value.names)) return value.names;
  if (typeof value === 'string') {
    try {
      const p = JSON.parse(value);
      if (Array.isArray(p)) return p;
      if (p && Array.isArray(p.names)) return p.names;
    } catch (_) {}
  }
  return [];
}

function buildStaffIdsObject(value) {
  return { ids: parseStaffIds(value) };
}
function buildStaffNamesObject(value) {
  return { names: parseStaffNames(value) };
}

// =====================================================
// HELPER: variantes — el campo se trata como envuelto (v1.11.3)
// Antes era Array nativo, ahora se escribe como { items: [...] } para
// no warnear. parseVariantes lee ambos formatos.
// NOTA (v1.11.5): es defensivo ante datos corruptos. Si el CMS tiene un
// booleano en el campo `variantes` (p. ej. un CSV mal importado que metió
// `false`), parseVariantes devuelve []. Y como la ESCRITURA siempre pasa
// por wrapItems(parseVariantes(...)), al guardar el editor sanea la celda:
// un `false` se reescribe como { items: [] }.
// =====================================================
function parseVariantes(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object' && Array.isArray(value.items)) return value.items;
  if (typeof value === 'string' && value.trim()) {
    try {
      const p = JSON.parse(value);
      if (Array.isArray(p)) return p;
      if (p && Array.isArray(p.items)) return p.items;
    } catch (_) {}
  }
  return [];
}

// =====================================================
// HELPER: leer campo Array genérico del CMS (mapeoFases, complementos)
// Tolerante a: array directo (legacy), string JSON (legacy), objeto
// envuelto {items:[...]} (formato actual sin warning). Devuelve array.
// =====================================================
function parseArrayCampo(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object' && Array.isArray(value.items)) return value.items;
  if (typeof value === 'string' && value.trim()) {
    try {
      const p = JSON.parse(value);
      if (Array.isArray(p)) return p;
      if (p && Array.isArray(p.items)) return p.items;
    } catch (_) {}
  }
  return [];
}

// =====================================================
// HELPER (v1.11.3): envolver array en { items:[...] } para escritura
// sin warning de Wix. Llamar siempre en escritura sobre arrays JSON.
// =====================================================
function wrapItems(arr) {
  return { items: Array.isArray(arr) ? arr : [] };
}

// =====================================================
// HELPER: ID Kamisuite por servicio (formato del Setup)
// svc_<ts(base36)>_<counter(base36)>_<random(4)>
// =====================================================
let _uidCounter = 0;
function genUid() {
  _uidCounter = (_uidCounter + 1) % 1000000;
  return 'svc_' + Date.now().toString(36) + '_' + _uidCounter.toString(36) + '_' + Math.random().toString(36).slice(2, 6);
}

// =====================================================
// HELPER: cargar staff desde StaffConfig
// =====================================================
async function cargarStaffDesdeConfig() {
  try {
    const result = await wixData.query(CMS_STAFF)
      .eq('active', true)
      .limit(100)
      .find({ suppressAuth: true });

    const staff = (result.items || [])
      .filter(s => s.wixResourceId && s.wixResourceId !== '')
      .map(s => ({
        id: s.wixResourceId,
        name: s.displayName || s.canonicalName || 'Sin nombre',
        isExternal: !!s.isExternal
      }));

    console.log(`${TAG} 👥 ${staff.length} empleados activos cargados de StaffConfig`);
    return staff;
  } catch (error) {
    console.error(`${TAG} ⚠️ Error cargando StaffConfig:`, error.message);
    return [];
  }
}

// =====================================================
// HELPER: detectar si una fila es un ANCLA técnica
// =====================================================
function calcularSetAnclas(items) {
  const anclas = new Set();
  (items || []).forEach(c => {
    if (c.wixAnclaId && typeof c.wixAnclaId === 'string' && c.wixAnclaId.trim()) {
      anclas.add(c.wixAnclaId.trim());
    }
  });
  return anclas;
}

// =====================================================
// HELPER v1.11.7: resolver wixAnclaId del salón (fuente única)
// =====================================================
// Lee el UUID del servicio ancla desde SalonConfig.wixAnclaId
// (fuente de verdad). Si el campo está vacío (por ejemplo salón
// recién clonado antes de poblar SalonConfig), cae a fallback:
// primer wixAnclaId no vacío que encuentre en ServiceCatalog, sin
// filtro por family. Si tampoco hay, devuelve '' y el editor deja
// la fila con wixAnclaId vacío (recuperable en cuanto se pueble
// SalonConfig y se edite el servicio de nuevo).
//
// Cache local: una vez resuelto un UUID no vacío, se reutiliza para
// toda la vida del módulo. Si el UUID cambia en SalonConfig se
// invalida en el siguiente cold start.
async function resolverAnclaSalon() {
  if (_anclaSalonCache && typeof _anclaSalonCache === 'string' && _anclaSalonCache.trim()) {
    return _anclaSalonCache;
  }

  // 1) Fuente de verdad: SalonConfig.wixAnclaId
  try {
    const cfgResult = await wixData.query(CMS_SALON_CONFIG)
      .limit(1)
      .find({ suppressAuth: true });

    const cfg = (cfgResult.items || [])[0];
    if (cfg && cfg.wixAnclaId && typeof cfg.wixAnclaId === 'string' && cfg.wixAnclaId.trim()) {
      _anclaSalonCache = cfg.wixAnclaId.trim();
      console.log(`${TAG} ⚓ Ancla del salón (SalonConfig): ${_anclaSalonCache}`);
      return _anclaSalonCache;
    }
    console.log(`${TAG} ⚠️ SalonConfig.wixAnclaId vacío o inexistente — probando fallback ServiceCatalog`);
  } catch (error) {
    console.error(`${TAG} ⚠️ Error leyendo SalonConfig (no crítico, se probará fallback):`, error.message);
  }

  // 2) Fallback: primer wixAnclaId no vacío del catálogo (sin filtro por family)
  try {
    const catResult = await wixData.query(CMS_CATALOG)
      .limit(500)
      .find({ suppressAuth: true });

    const conAncla = (catResult.items || []).find(
      c => c.wixAnclaId && typeof c.wixAnclaId === 'string' && c.wixAnclaId.trim()
    );
    if (conAncla) {
      _anclaSalonCache = conAncla.wixAnclaId.trim();
      console.log(`${TAG} ⚓ Ancla del salón (fallback ServiceCatalog): ${_anclaSalonCache}`);
      return _anclaSalonCache;
    }
    console.log(`${TAG} ⚠️ Ningún servicio tiene wixAnclaId — queda vacío. Poblar SalonConfig.wixAnclaId.`);
    return '';
  } catch (error) {
    console.error(`${TAG} ⚠️ Error resolviendo ancla en fallback (no crítico):`, error.message);
    return '';
  }
}

// =====================================================
// 1. LISTAR TODOS LOS SERVICIOS (CMS-only)
// =====================================================
export const listarServiciosCompleto = webMethod(
  Permissions.SiteMember,
  async () => {
    try {
      console.log(`${TAG} 📋 Cargando servicios desde ServiceCatalog (CMS-only)...`);

      const catalogResult = await wixData.query(CMS_CATALOG)
        .limit(1000)
        .find({ suppressAuth: true });

      const items = catalogResult.items || [];
      console.log(`${TAG} 📊 ${items.length} filas en ServiceCatalog`);

      const setAnclas = calcularSetAnclas(items);
      console.log(`${TAG} ⚓ ${setAnclas.size} ancla(s) técnica(s) detectada(s)`);

      const servicios = items
        .filter(c => {
          const sid = (c.serviceIdWix || '').trim();
          return !(sid && setAnclas.has(sid));
        })
        .map(c => ({
          id: c._id,
          _catalogId: c._id,
          name: c.label || '',
          category: groupSlugToLabel(c.group),
          hidden: c.active === false,
          duration: (typeof c.duration === 'number') ? c.duration : null,
          defaultPrice: (typeof c.price === 'number') ? c.price : null,
          rateType: (typeof c.price === 'number') ? 'FIXED' : '',
          currency: 'EUR',
          esCmsOnly: true,
          family: c.family || '',
          familia: c.family || '',
          group: c.group || '',
          tipo: c.tipo || '',
          uso: c.uso || '',
          order: (typeof c.order === 'number') ? c.order : null,
          active: c.active !== undefined ? !!c.active : true,
          hasVariants: !!c.hasVariants,
          imageUrl: wixImageToPublicUrl(c.image) || null,
          descripcion: c.descripcion || '',
          minProcesoCatalog: (typeof c.minProceso === 'number') ? c.minProceso : null,
          ordenFases: c.ordenFases || '',
          tieneGAP: (typeof c.minProceso === 'number' && c.minProceso > 0),
          idStaff: parseStaffIds(c.idStaff),
          staffNombres: parseStaffNames(c.staff),
          variantes: parseVariantes(c.variantes),
          complementos: parseArrayCampo(c.complementos),
          mapeoFases: parseArrayCampo(c.mapeoFases),
          claseServicio: c.claseServicio || '',
          wixAnclaId: c.wixAnclaId || '',
          setupUid: c.setupUid || '',
          serviceIdWix: c.serviceIdWix || '',
          // v1.11.4 — campos Tour y descuentos promocionales
          vistaEnTour: c.vistaEnTour === true,
          descripcionTour: c.descripcionTour || '',
          descuentoActivo: c.descuentoActivo === true,
          descuentoPromo: (typeof c.descuentoPromo === 'number') ? c.descuentoPromo : null,
          // v1.11.6 — cobro por peso + bonos
          cobroporPeso: c.cobroporPeso === true,
          precioGramo: (typeof c.precioGramo === 'number') ? c.precioGramo : null,
          bonoActivo: c.bonoActivo === true,
          bonoNumero: (typeof c.bonoNumero === 'number') ? c.bonoNumero : null,
          bonoDescuento: (typeof c.bonoDescuento === 'number') ? c.bonoDescuento : null
        }));

      const staff = await cargarStaffDesdeConfig();

      console.log(`${TAG} ✅ ${servicios.length} servicios listados (anclas excluidas)`);

      return {
        success: true,
        servicios: servicios,
        staff: staff,
        totalServicios: servicios.length,
        totalConGAP: servicios.filter(s => s.tieneGAP).length
      };

    } catch (error) {
      console.error(`${TAG} ❌ Error:`, error);
      return { success: false, error: error.message };
    }
  }
);

// =====================================================
// 2. ACTUALIZAR SERVICIO (CMS-only)
// =====================================================
export const actualizarServicio = webMethod(
  Permissions.SiteMember,
  async (payload) => {
    const {
      _catalogId,
      nombre,
      duracion,
      precio,
      minProceso,
      descripcion,
      ordenFases,
      family,
      group,
      tipo,
      order,
      active,
      uso,
      // v1.11.5 — hasVariants AHORA se desestructura y se escribe (antes
      // faltaba: el editor lo enviaba pero actualizar no lo guardaba).
      hasVariants,
      idStaff,
      staff,
      variantes,
      complementos,
      mapeoFases,
      claseServicio,
      // v1.11.4 — Tour y descuentos promocionales
      vistaEnTour,
      descripcionTour,
      descuentoActivo,
      descuentoPromo,
      // v1.11.6 — cobro por peso + bonos
      cobroporPeso,
      precioGramo,
      bonoActivo,
      bonoNumero,
      bonoDescuento
    } = payload;

    try {
      console.log(`${TAG} 🔧 Actualizando servicio CMS: ${_catalogId} (${nombre})`);

      if (!_catalogId) {
        return { success: false, error: 'Falta _catalogId' };
      }

      const result = await wixData.query(CMS_CATALOG)
        .eq('_id', _catalogId)
        .limit(1)
        .find({ suppressAuth: true });

      if (result.items.length === 0) {
        return { success: false, error: 'Servicio no encontrado en ServiceCatalog' };
      }

      const registro = result.items[0];
      const valoresAnteriores = {
        nombre: registro.label,
        duracion: registro.duration,
        precio: registro.price
      };

      if (nombre !== undefined && nombre !== '') registro.label = nombre;
      if (duracion !== undefined && duracion !== null) registro.duration = duracion;
      if (precio !== undefined && precio !== null) registro.price = precio;
      if (descripcion !== undefined) registro.descripcion = descripcion || '';
      if (minProceso !== undefined) {
        registro.minProceso = (minProceso === null || minProceso === '') ? null : Number(minProceso);
      }
      if (ordenFases !== undefined) registro.ordenFases = ordenFases || '';
      if (family !== undefined && family !== '') registro.family = family;
      if (group !== undefined && group !== '') registro.group = group;
      if (tipo !== undefined && tipo !== '') registro.tipo = tipo;
      if (order !== undefined && order !== null && order !== '') registro.order = Number(order);
      if (active !== undefined) registro.active = !!active;
      if (uso !== undefined) registro.uso = uso || '';
      // v1.11.5 — hasVariants: se escribe si viene en el payload.
      if (hasVariants !== undefined) registro.hasVariants = !!hasVariants;

      // Staff → OBJECT
      if (idStaff !== undefined) registro.idStaff = buildStaffIdsObject(idStaff);
      if (staff !== undefined) registro.staff = buildStaffNamesObject(staff);
      // v1.11.3 — Variantes, complementos y mapeoFases: envueltos en {items:[]}
      // (parseVariantes/parseArrayCampo sanean datos corruptos: si el CMS
      // tenía un booleano en variantes, aquí se reescribe como {items:[]}).
      if (variantes !== undefined) registro.variantes = wrapItems(parseVariantes(variantes));
      if (complementos !== undefined) registro.complementos = wrapItems(parseArrayCampo(complementos));
      if (mapeoFases !== undefined) registro.mapeoFases = wrapItems(parseArrayCampo(mapeoFases));
      if (claseServicio !== undefined && claseServicio !== '') registro.claseServicio = claseServicio;

      // v1.11.4 — Tour y descuentos promocionales
      if (vistaEnTour !== undefined) registro.vistaEnTour = !!vistaEnTour;
      if (descripcionTour !== undefined) registro.descripcionTour = descripcionTour || '';
      if (descuentoActivo !== undefined) registro.descuentoActivo = !!descuentoActivo;
      if (descuentoPromo !== undefined) {
        if (descuentoPromo === null || descuentoPromo === '') {
          registro.descuentoPromo = null;
        } else {
          const n = Number(descuentoPromo);
          registro.descuentoPromo = isNaN(n) ? null : Math.max(0, Math.min(100, n));
        }
      }

      // v1.11.6 — cobro por peso + bonos (solo conexión; cálculo fuera).
      // cobroporPeso/bonoActivo: booleanos. precioGramo/bonoNumero/
      // bonoDescuento: números (campos Number en CMS → Number() para no
      // warnear). Se conservan precio y precioGramo: no se borra ninguno
      // al cambiar de modo, ambos viajan en el payload tal cual.
      if (cobroporPeso !== undefined) registro.cobroporPeso = !!cobroporPeso;
      if (precioGramo !== undefined) {
        if (precioGramo === null || precioGramo === '') {
          registro.precioGramo = null;
        } else {
          const n = Number(precioGramo);
          registro.precioGramo = isNaN(n) ? null : n;
        }
      }
      if (bonoActivo !== undefined) registro.bonoActivo = !!bonoActivo;
      if (bonoNumero !== undefined) {
        if (bonoNumero === null || bonoNumero === '') {
          registro.bonoNumero = null;
        } else {
          const n = Number(bonoNumero);
          registro.bonoNumero = isNaN(n) ? null : n;
        }
      }
      if (bonoDescuento !== undefined) {
        if (bonoDescuento === null || bonoDescuento === '') {
          registro.bonoDescuento = null;
        } else {
          const n = Number(bonoDescuento);
          registro.bonoDescuento = isNaN(n) ? null : Math.max(0, Math.min(100, n));
        }
      }

      // v1.11.7 — Fuente de verdad: SalonConfig.wixAnclaId (no más family).
      if (!registro.wixAnclaId || !registro.wixAnclaId.trim()) {
        registro.wixAnclaId = await resolverAnclaSalon();
      }

      await wixData.update(CMS_CATALOG, registro, { suppressAuth: true });
      console.log(`${TAG} ✅ ServiceCatalog actualizado: ${registro.label}`);

      await registrarCambio({
        accion: 'EDITAR_SERVICIO_CMS',
        servicioNombre: registro.label,
        servicioId: _catalogId,
        cambios: construirCambios(valoresAnteriores, {
          nombre: nombre,
          duracion: duracion,
          precio: precio
        }),
        origen: 'Editor Servicios v1.11.5'
      });

      return {
        success: true,
        servicio: {
          id: registro._id,
          _catalogId: registro._id,
          name: registro.label,
          duration: registro.duration,
          price: registro.price,
          descripcion: registro.descripcion || '',
          minProceso: registro.minProceso ?? null,
          ordenFases: registro.ordenFases || '',
          family: registro.family || '',
          group: registro.group || '',
          tipo: registro.tipo || '',
          order: registro.order ?? null,
          active: !!registro.active,
          uso: registro.uso || '',
          // v1.11.5 — devolver hasVariants para refresco del estado local
          hasVariants: !!registro.hasVariants,
          idStaff: parseStaffIds(registro.idStaff),
          staffNombres: parseStaffNames(registro.staff),
          variantes: parseVariantes(registro.variantes),
          complementos: parseArrayCampo(registro.complementos),
          mapeoFases: parseArrayCampo(registro.mapeoFases),
          claseServicio: registro.claseServicio || '',
          wixAnclaId: registro.wixAnclaId || '',
          setupUid: registro.setupUid || '',
          // v1.11.4
          vistaEnTour: registro.vistaEnTour === true,
          descripcionTour: registro.descripcionTour || '',
          descuentoActivo: registro.descuentoActivo === true,
          descuentoPromo: (typeof registro.descuentoPromo === 'number') ? registro.descuentoPromo : null,
          // v1.11.6
          cobroporPeso: registro.cobroporPeso === true,
          precioGramo: (typeof registro.precioGramo === 'number') ? registro.precioGramo : null,
          bonoActivo: registro.bonoActivo === true,
          bonoNumero: (typeof registro.bonoNumero === 'number') ? registro.bonoNumero : null,
          bonoDescuento: (typeof registro.bonoDescuento === 'number') ? registro.bonoDescuento : null
        }
      };

    } catch (error) {
      console.error(`${TAG} ❌ Error actualizando servicio:`, error);
      return { success: false, error: error.message };
    }
  }
);

// =====================================================
// 3. CREAR SERVICIO EN ServiceCatalog (CMS-only)
// =====================================================
export const crearServicioCatalogo = webMethod(
  Permissions.SiteMember,
  async (payload) => {
    const {
      label,
      family,
      group,
      duration,
      price,
      tipo,
      order,
      hasVariants,
      active,
      descripcion,
      minProceso,
      ordenFases,
      uso,
      idStaff,
      staff,
      variantes,
      complementos,
      mapeoFases,
      claseServicio,
      // v1.11.4 — Tour y descuentos promocionales
      vistaEnTour,
      descripcionTour,
      descuentoActivo,
      descuentoPromo,
      // v1.11.6 — cobro por peso + bonos
      cobroporPeso,
      precioGramo,
      bonoActivo,
      bonoNumero,
      bonoDescuento,
      base64Data,
      fileName,
      mimeType
    } = payload;

    try {
      console.log(`${TAG} 🆕 Creando servicio en ServiceCatalog: ${label}`);

      if (!label || !label.trim()) {
        return { success: false, error: 'El nombre del servicio es obligatorio' };
      }

      const familyFinal = family || 'simple';
      // v1.11.7 — El ancla ya no depende de family; se lee de SalonConfig.
      const wixAnclaId = await resolverAnclaSalon();

      const registro = {
        label: label.trim(),
        family: familyFinal,
        group: group || '',
        duration: duration || 0,
        price: price || 0,
        tipo: tipo || 'principal',
        order: order || 99,
        hasVariants: hasVariants || false,
        active: active !== undefined ? active : true,
        descripcion: descripcion || '',
        minProceso: (typeof minProceso === 'number') ? minProceso : null,
        ordenFases: ordenFases || '',
        uso: uso || '',
        idStaff: buildStaffIdsObject(idStaff),
        staff: buildStaffNamesObject(staff),
        // v1.11.3 — Variantes, complementos, mapeoFases: envueltos
        variantes: wrapItems(parseVariantes(variantes)),
        complementos: wrapItems(parseArrayCampo(complementos)),
        mapeoFases: wrapItems(parseArrayCampo(mapeoFases)),
        claseServicio: claseServicio || 'simple',
        serviceIdWix: '',
        wixAnclaId: wixAnclaId,
        setupUid: genUid(),
        // v1.11.4 — Tour y descuentos promocionales
        vistaEnTour: vistaEnTour === true,
        descripcionTour: descripcionTour || '',
        descuentoActivo: descuentoActivo === true,
        descuentoPromo: (() => {
          if (descuentoPromo === undefined || descuentoPromo === null || descuentoPromo === '') return null;
          const n = Number(descuentoPromo);
          return isNaN(n) ? null : Math.max(0, Math.min(100, n));
        })(),
        // v1.11.6 — cobro por peso + bonos
        cobroporPeso: cobroporPeso === true,
        precioGramo: (() => {
          if (precioGramo === undefined || precioGramo === null || precioGramo === '') return null;
          const n = Number(precioGramo);
          return isNaN(n) ? null : n;
        })(),
        bonoActivo: bonoActivo === true,
        bonoNumero: (() => {
          if (bonoNumero === undefined || bonoNumero === null || bonoNumero === '') return null;
          const n = Number(bonoNumero);
          return isNaN(n) ? null : n;
        })(),
        bonoDescuento: (() => {
          if (bonoDescuento === undefined || bonoDescuento === null || bonoDescuento === '') return null;
          const n = Number(bonoDescuento);
          return isNaN(n) ? null : Math.max(0, Math.min(100, n));
        })()
      };

      if (base64Data && fileName) {
        try {
          const buffer = Buffer.from(base64Data, 'base64');
          const uploadResult = await mediaManager.upload(
            '/ServiceCatalog',
            buffer,
            fileName,
            {
              mediaOptions: { mimeType: mimeType || 'image/jpeg', mediaType: 'image' },
              metadataOptions: { isPrivate: false, isVisitorUpload: false }
            }
          );
          const fileUrl = uploadResult?.fileUrl || '';
          if (fileUrl) {
            registro.image = fileUrl;
            console.log(`${TAG} ✅ Imagen subida: ${fileUrl}`);
          }
        } catch (imgErr) {
          console.error(`${TAG} ⚠️ Error subiendo imagen (no crítico):`, imgErr.message);
        }
      }

      const inserted = await wixData.insert(CMS_CATALOG, registro, { suppressAuth: true });
      console.log(`${TAG} ✅ Servicio creado: ${inserted._id} (setupUid=${inserted.setupUid}, ancla=${inserted.wixAnclaId || '∅'})`);

      await registrarCambio({
        accion: 'CREAR_SERVICIO_CMS',
        servicioNombre: label,
        servicioId: inserted._id,
        cambios: JSON.stringify({ label, family: familyFinal, group, duration, price, tipo, uso, wixAnclaId: inserted.wixAnclaId, setupUid: inserted.setupUid }),
        origen: 'Editor Servicios v1.11.5'
      });

      return {
        success: true,
        servicio: {
          _id: inserted._id,
          _catalogId: inserted._id,
          label: inserted.label,
          family: inserted.family,
          group: inserted.group,
          duration: inserted.duration,
          price: inserted.price,
          tipo: inserted.tipo,
          uso: inserted.uso || '',
          hasVariants: !!inserted.hasVariants,
          descripcion: inserted.descripcion || '',
          minProceso: (typeof inserted.minProceso === 'number') ? inserted.minProceso : null,
          ordenFases: inserted.ordenFases || '',
          idStaff: parseStaffIds(inserted.idStaff),
          staffNombres: parseStaffNames(inserted.staff),
          variantes: parseVariantes(inserted.variantes),
          complementos: parseArrayCampo(inserted.complementos),
          mapeoFases: parseArrayCampo(inserted.mapeoFases),
          claseServicio: inserted.claseServicio || '',
          imageUrl: wixImageToPublicUrl(inserted.image) || null,
          wixAnclaId: inserted.wixAnclaId || '',
          setupUid: inserted.setupUid || '',
          // v1.11.4
          vistaEnTour: inserted.vistaEnTour === true,
          descripcionTour: inserted.descripcionTour || '',
          descuentoActivo: inserted.descuentoActivo === true,
          descuentoPromo: (typeof inserted.descuentoPromo === 'number') ? inserted.descuentoPromo : null,
          // v1.11.6
          cobroporPeso: inserted.cobroporPeso === true,
          precioGramo: (typeof inserted.precioGramo === 'number') ? inserted.precioGramo : null,
          bonoActivo: inserted.bonoActivo === true,
          bonoNumero: (typeof inserted.bonoNumero === 'number') ? inserted.bonoNumero : null,
          bonoDescuento: (typeof inserted.bonoDescuento === 'number') ? inserted.bonoDescuento : null
        }
      };

    } catch (error) {
      console.error(`${TAG} ❌ Error creando servicio:`, error);
      return { success: false, error: error.message };
    }
  }
);

// =====================================================
// 3b. DUPLICAR SERVICIO (ServiceCatalog) — v1.11.6
// Clona una fila existente como "Copia de <nombre>". Copia TODOS los
// campos de catálogo (incluidos los nuevos: cobroporPeso, precioGramo,
// bonos, tour, descuentos, variantes, fases, complementos). Genera un
// setupUid NUEVO y deja que Wix asigne un _id nuevo. NO copia la imagen
// física (se referencia la misma URL si existía, sin re-subir).
// =====================================================
export const duplicarServicioCatalogo = webMethod(
  Permissions.SiteMember,
  async ({ catalogId }) => {
    try {
      console.log(`${TAG} ⧉ Duplicando servicio: ${catalogId}`);

      if (!catalogId || typeof catalogId !== 'string') {
        return { success: false, error: 'catalogId inválido o ausente' };
      }

      const original = await wixData.get(CMS_CATALOG, catalogId, { suppressAuth: true });
      if (!original) {
        return { success: false, error: 'Servicio original no encontrado' };
      }

      // Clonar todo el contenido salvo los campos de sistema y de identidad.
      const copia = { ...original };
      delete copia._id;
      delete copia._owner;
      delete copia._createdDate;
      delete copia._updatedDate;

      // Identidad nueva
      copia.label = 'Copia de ' + (original.label || 'servicio');
      copia.setupUid = genUid();
      // serviceIdWix vacío: la copia es CMS-only, no hereda anclaje de Wix
      // Bookings de una fila concreta (el wixAnclaId por family sí se mantiene).
      copia.serviceIdWix = '';

      const inserted = await wixData.insert(CMS_CATALOG, copia, { suppressAuth: true });
      console.log(`${TAG} ✅ Duplicado: ${inserted._id} (setupUid=${inserted.setupUid}) ← ${catalogId}`);

      await registrarCambio({
        accion: 'DUPLICAR_SERVICIO_CMS',
        servicioNombre: inserted.label,
        servicioId: inserted._id,
        cambios: JSON.stringify({ origen: catalogId, label: inserted.label, setupUid: inserted.setupUid }),
        origen: 'Editor Servicios v1.11.6'
      });

      return {
        success: true,
        servicio: {
          _id: inserted._id,
          _catalogId: inserted._id,
          label: inserted.label,
          setupUid: inserted.setupUid || ''
        }
      };

    } catch (error) {
      console.error(`${TAG} ❌ Error duplicando servicio:`, error);
      return { success: false, error: error.message };
    }
  }
);

// =====================================================
// 4. SUBIR IMAGEN DE SERVICIO (ServiceCatalog)
// =====================================================
export const uploadImagenServicio = webMethod(
  Permissions.SiteMember,
  async ({ catalogId, base64Data, fileName, mimeType }) => {
    try {
      console.log(`${TAG} 📸 Subir imagen servicio: ${catalogId} | ${fileName}`);

      if (!catalogId || !base64Data || !fileName) {
        return { ok: false, error: 'Faltan parámetros (catalogId, base64Data, fileName)' };
      }

      const registro = await wixData.get(CMS_CATALOG, catalogId, { suppressAuth: true });
      if (!registro) {
        return { ok: false, error: 'Servicio no encontrado en ServiceCatalog' };
      }

      const buffer = Buffer.from(base64Data, 'base64');
      const uploadResult = await mediaManager.upload(
        '/ServiceCatalog',
        buffer,
        fileName,
        {
          mediaOptions: { mimeType: mimeType || 'image/jpeg', mediaType: 'image' },
          metadataOptions: { isPrivate: false, isVisitorUpload: false }
        }
      );

      const fileUrl = uploadResult?.fileUrl || '';
      if (!fileUrl) {
        return { ok: false, error: 'Media Manager no devolvió fileUrl' };
      }

      console.log(`${TAG} ✅ Imagen subida: ${fileUrl}`);

      registro.image = fileUrl;
      await wixData.update(CMS_CATALOG, registro, { suppressAuth: true });
      console.log(`${TAG} ✅ ServiceCatalog.image actualizado`);

      const publicUrl = wixImageToPublicUrl(fileUrl) || '';
      return { ok: true, fileUrl, publicUrl };

    } catch (e) {
      console.error(`${TAG} ❌ uploadImagenServicio:`, e.message);
      return { ok: false, error: e.message };
    }
  }
);

// =====================================================
// 5. ELIMINAR SERVICIO (ServiceCatalog)
// =====================================================
export const eliminarServicioCMS = webMethod(
  Permissions.SiteMember,
  async ({ catalogId }) => {
    try {
      console.log(`${TAG} 🗑️ Eliminar de ServiceCatalog: ${catalogId}`);

      if (!catalogId || typeof catalogId !== 'string') {
        return { success: false, error: 'catalogId inválido o ausente' };
      }

      const queryResult = await wixData.query(CMS_CATALOG)
        .eq('_id', catalogId)
        .limit(1)
        .find({ suppressAuth: true });

      if (queryResult.items.length === 0) {
        console.log(`${TAG} ℹ️ Fila ya no existe (idempotente)`);
        return { success: true, catalogId, nombre: '(ya eliminado)', alreadyGone: true };
      }

      const registro = queryResult.items[0];
      const nombreServicio = registro.label || '(sin nombre)';

      await wixData.remove(CMS_CATALOG, catalogId, { suppressAuth: true });
      console.log(`${TAG} ✅ Eliminado: ${nombreServicio} (${catalogId})`);

      await registrarCambio({
        accion: 'ELIMINAR_SERVICIO_CMS',
        servicioNombre: nombreServicio,
        servicioId: catalogId,
        cambios: JSON.stringify({
          label: registro.label,
          family: registro.family,
          group: registro.group,
          duration: registro.duration,
          price: registro.price,
          tipo: registro.tipo,
          setupUid: registro.setupUid || ''
        }),
        origen: 'Editor Servicios v1.11.5'
      });

      return { success: true, catalogId, nombre: nombreServicio };

    } catch (error) {
      console.error(`${TAG} ❌ Error eliminando:`, error);
      return { success: false, error: error.message };
    }
  }
);

// =====================================================
// 6. LISTAR HISTORIAL DE CAMBIOS
// =====================================================
export const listarHistorial = webMethod(
  Permissions.SiteMember,
  async (limite = 50) => {
    try {
      console.log(`${TAG} 📋 Cargando historial de cambios...`);

      const result = await wixData.query(CMS_LOG)
        .descending('fecha')
        .limit(limite)
        .find({ suppressAuth: true });

      const historial = (result.items || []).map(item => ({
        _id: item._id,
        fecha: item.fecha,
        usuario: item.usuario,
        accion: item.accion,
        servicioNombre: item.servicioNombre,
        servicioId: item.servicioId,
        cambios: item.cambios,
        origen: item.origen
      }));

      console.log(`${TAG} ✅ ${historial.length} cambios encontrados`);

      return { success: true, historial, total: historial.length };

    } catch (error) {
      console.error(`${TAG} ❌ Error cargando historial:`, error);
      return { success: false, error: error.message };
    }
  }
);

// =====================================================
// HELPER: Registrar cambio en ChangeLogServices
// =====================================================
async function registrarCambio(datos) {
  try {
    const logEntry = {
      fecha: new Date(),
      usuario: 'Backoffice',
      accion: datos.accion,
      servicioNombre: datos.servicioNombre,
      servicioId: datos.servicioId,
      cambios: datos.cambios,
      origen: datos.origen
    };
    await wixData.insert(CMS_LOG, logEntry, { suppressAuth: true });
    console.log(`${TAG} 📝 Log: ${datos.accion} - ${datos.servicioNombre}`);
  } catch (error) {
    console.error(`${TAG} ⚠️ Error registrando log (no crítico):`, error.message);
  }
}

// =====================================================
// HELPER: Construir objeto de cambios (antes/después)
// =====================================================
function construirCambios(antes, despues) {
  const cambios = {};
  for (const campo in despues) {
    const valorAntes = antes[campo];
    const valorDespues = despues[campo];
    if (valorDespues !== undefined && valorDespues !== null) {
      if (JSON.stringify(valorAntes) !== JSON.stringify(valorDespues)) {
        cambios[campo] = { antes: valorAntes, despues: valorDespues };
      }
    }
  }
  return JSON.stringify(cambios);
}