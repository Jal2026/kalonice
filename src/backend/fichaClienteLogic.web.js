// =====================================================
// KAMISUITE - Backend Ficha Cliente CRM
// =====================================================
// VERSION: 1.9.11
// FECHA: 6 de julio de 2026
//
// v1.9.11 — HOTFIX crearContactoCRM: nunca exponer texto Wix crudo en
//   pantalla + renombrar DUPLICATE_EMAIL → DUPLICATE_PHONE.
//   Contexto del bug: al dar de alta un contacto con TELÉFONO ya usado
//   por otro contacto, Wix Contacts CREA el nuevo contacto igualmente
//   (allowDuplicates:false NO bloquea duplicados por teléfono, solo
//   por email), PERO además lanza una excepción con:
//     err.details.applicationError.code = 'DUPLICATE_CONTACT_EXISTS'
//     err.details.applicationError.data.duplicatePhone = '<teléfono>'
//     err.details.applicationError.data.duplicateContactId = '<uuid>'
//     err.message = 'A contact with the same primary email or phone
//                    already exists.'  (texto CRUDO en inglés)
//   El backend v1.9.10 capturaba esa excepción con regex /duplicate/i
//   sobre err.message y devolvía { error:{ code:'DUPLICATE_EMAIL',
//   message: <texto Wix crudo> } }. El pagecode reenviaba message tal
//   cual, y el widget acababa pintándolo en la UI — inadmisible para
//   un usuario final del software.
//
//   Cambios en este archivo (solo la función crearContactoCRM añadida
//   en v1.9.10; el resto del backend intacto):
//     · El catch de `elevatedCreate` lee ahora
//       err.details.applicationError.code y devuelve:
//         · code === 'DUPLICATE_CONTACT_EXISTS'
//              → { ok:false, error:{ code:'DUPLICATE_PHONE' } }
//                (sin campo message — el widget usa siempre su propio
//                 texto fijo en español).
//         · cualquier otro
//              → { ok:false, error:{ code:'CREATE_FAILED' } }
//                (idem, sin message).
//       El texto crudo Wix queda solo en console.warn/console.error
//       para depuración.
//     · El catch general de la función devuelve
//       { ok:false, error:{ code:'CREATE_FAILED' } } en lugar de
//       safeErr(e) — safeErr expone details.applicationError con el
//       texto Wix y la data (duplicateContactId, etc.).
//   Nota (Wix no permite email duplicado): la rama DUPLICATE_EMAIL de
//   v1.9.10 se elimina porque createContact rechaza los duplicados de
//   email con otro error diferente (o directamente no los crea);
//   nunca llegaba a activarse en producción.
//
// v1.9.10 — NEW crearContactoCRM (alta de contacto desde CRM).
//   Añade un nuevo webMethod para crear contactos en Wix CRM desde
//   la sección "Nuevo contacto" del widget CRM (widget v1.7.3 desktop
//   y v1.1.1 mobile). Paridad con Recepción PRO donde ya existía la
//   funcionalidad (patrón `ensureContactInCRM` en recepcionProLogic
//   v1.0.37, líneas 1240-1268) — replicado literalmente y ampliado con
//   los campos que el CRM edita en actualizarContactoCRM:
//     · fechaNacimiento — campo NATIVO Wix (contactInfo.birthdate),
//       formato YYYY-MM-DD. Reutiliza normalizarFechaNacimientoParaEscribir.
//     · sexo — campo personalizado plano (extendedFields['custom.sexo']),
//       patrón oficial confirmado en Guía Técnica V2.0 §32.1 y en
//       lopdClientes.web v1.2.0 (bitácora 20-jun-2026).
//   Firma:
//     crearContactoCRM({
//       nombre, apellido?, telefono?, email?,
//       fechaNacimiento?, sexo?,
//       allowDuplicates?=false
//     })
//   Respuesta OK: { ok:true, version, contactId, cliente }
//   Respuesta duplicado: { ok:false, version, error:{ code:'DUPLICATE_EMAIL',
//     message } } — cuando Wix rechaza el alta por email duplicado y el
//     widget puede reintentar con allowDuplicates=true.
//   Validación mínima replicando la del patrón existente (Recepción PRO):
//     al menos NOMBRE + (email O teléfono). Sin esos campos mínimos,
//     el backend rechaza con INVALID_INPUT.
//   Reutiliza formatearContacto para el shape del cliente devuelto
//   (mismo que getFichaCliente).
//   NO toca ninguno de los 8 webMethods existentes ni sus helpers.
//   NO toca imports ni field defs.
//
// v1.9.9 — HOTFIX URL de promociones malformada (paridad con
//   clienteAreaLogic v1.6.3).
//   - Sanitizador `sanitizarSiteUrl` que corrige "wwwX.tld" →
//     "www.X.tld" cuando alguien escribió el siteUrl en SalonConfig
//     sin el punto tras "www" (ej: "wwwsalonkami.com" en vez de
//     "www.salonkami.com"). Se aplica solo si detecta el patrón mal
//     escrito. Hosts ya bien formados no se tocan. Idempotente.
//   - El resto del flujo intacto.
//
// v1.9.8 — Añade zona Bonos y Promociones + Fecha de nacimiento.
//   - Queries locales a KamisuiteVouchers (contactId, ACTIVO),
//     KamisuitePrimeMemberships (contactId, ACTIVA),
//     KamisuitePromoCards (buyerContactId, EMITIDA, isGift!==true).
//     Patrón validado exactamente igual que clienteAreaLogic v1.6.2.
//   - Lee KamisuiteProductsConfig.primeImage (siempre visible) y
//     SalonConfig.brandName + siteUrl + promotionsPageSlug para
//     armar la URL de compra promocionesUrl.
//   - Devuelve en profile: salon.brandName, prime.{tiene,membresia,
//     imagen,urlAdquirir}, bonos.{tiene,items,urlAdquirir},
//     tarjetas.{tiene,items,urlAdquirir}.
//   - Fecha de nacimiento como campo NATIVO de Wix Contacts
//     (contact.info.birthdate, no extendedFields). Se lee en
//     cliente.fechaNacimiento y profile.fechaNacimiento. Se escribe
//     desde actualizarContactoCRM aceptando el campo
//     fechaNacimiento del payload (string YYYY-MM-DD o '' para
//     limpiar). El campo va como contactInfo.birthdate directo,
//     al mismo nivel que name/emails/phones.
//   - profile.clubKalonice sigue en el shape para no romper
//     compatibilidad, pero el widget v1.7.2 ya no lo pinta.
//   - No toca cupones, loyalty, reservas, badges, foto, historial,
//     notas públicas ni ningún flujo existente.
//
// v1.9.7 — Añade lectura CRM de notas escritas por el cliente.
//   - Lee el campo personalizado de Wix Contacts donde el cliente
//     deja notas desde Área Cliente para el salón.
//   - Clave oficial aportada: notas_fonyemjtcfteotgxzkaamjbuwmyuz.
//   - Aliases incluidos por compatibilidad con Wix: custom.notas_fony...,
//     custom.notas-fony... y notas-fony...
//   - Devuelve en profile: notasClienteSalonRaw,
//     notasClienteSalonHistorico y notasClienteSalonUltima.
//   - No escribe este campo desde CRM: es de solo lectura para el salón.
//
// v1.9.6 — FIX campos personalizados CRM Wix Contacts.
//   - Mantiene las CLAVES oficiales confirmadas desde Wix Dashboard:
//       customnotaspublicas, color, tratamientos.
//   - Añade aliases defensivos solo para lectura/resolución técnica
//     porque Wix puede devolver algunos campos como custom.<nombre>.
//   - Añade resolución real contra contacts.queryExtendedFields()
//     cuando el contacto todavía no trae valor en extendedFields.
//   - actualizarContactoCRM escribe con la key real resuelta y devuelve
//     profilePatch con los valores releídos tras guardar.
//   - No toca cupones, loyalty, reservas, badges, foto ni historial.
// =====================================================

import wixData from 'wix-data';
import { webMethod, Permissions } from 'wix-web-module';
import { elevate } from 'wix-auth';
import { contacts } from 'wix-crm-backend';
import { members } from 'wix-members.v2';
import { accounts } from 'wix-loyalty.v2';
import { mediaManager } from 'wix-media-backend';

const VERSION = '1.9.11';
const TAG = `[FichaCliente][${VERSION}]`;

// Colecciones CMS
const COLLECTION_CLIENT_PROFILE       = 'ClientProfile';
const COLLECTION_PAYMENT_RESERVATIONS = 'PaymentReservations';
const COLLECTION_CARE_PROFILE         = 'ClientCareProfile';
const COLLECTION_EXTERNAL_RECORDS     = 'SvExternalRecords';
const COLLECTION_RESERVATIONS_V2      = 'KamisuiteReservations';
const COLLECTION_MEMBERS_BADGES       = 'Members/Badges';

// v1.9.8 — Productos custom y config
const COLLECTION_VOUCHERS      = 'KamisuiteVouchers';
const COLLECTION_PRIME_MEMB    = 'KamisuitePrimeMemberships';
const COLLECTION_PROMOCARDS    = 'KamisuitePromoCards';
const COLLECTION_PRODUCTS_CFG  = 'KamisuiteProductsConfig';
const COLLECTION_SALON_CONFIG  = 'SalonConfig';

const OWNER_SITE_ID   = 'd23efee3-313e-4952-b081-e0b1b75a5c3a';
const TIMEZONE_MADRID = 'Europe/Madrid';

// Campos personalizados Wix Contacts
// IMPORTANTE: estos valores son las CLAVES del campo en Wix Dashboard,
// no el nombre visible. Ejemplo confirmado en captura:
//   Nombre: custom.notasPublicas
//   Clave:  customnotaspublicas
const FIELD_NOTAS_PUBLICAS  = 'customnotaspublicas';
const FIELD_NOTAS_CLIENTE   = 'notas_fonyemjtcfteotgxzkaamjbuwmyuz';
const FIELD_NOTAS_COLOR     = 'color';
const FIELD_NOTAS_TRATAM    = 'tratamientos';
const FIELD_ULTIMA_VISITA   = 'ultima_visita';
const FIELD_CLUB_KALONICE   = 'club_kalonice';
const FIELD_SEXO            = 'sexo';

const CRM_FIELD_DEFS = {
  notasPublicas: {
    key: FIELD_NOTAS_PUBLICAS,
    aliases: [
      FIELD_NOTAS_PUBLICAS,
      'customnotaspublicas',
      'custom.notasPublicas',
      'custom.notaspublicas',
      'notasPublicas',
      'notaspublicas'
    ]
  },
  notasClienteSalon: {
    key: FIELD_NOTAS_CLIENTE,
    aliases: [
      FIELD_NOTAS_CLIENTE,
      'notas_fonyemjtcfteotgxzkaamjbuwmyuz',
      'notas-fonyemjtcfteotgxzkaamjbuwmyuz',
      'custom.notas_fonyemjtcfteotgxzkaamjbuwmyuz',
      'custom.notas-fonyemjtcfteotgxzkaamjbuwmyuz',
      'customnotasfonyemjtcfteotgxzkaamjbuwmyuz',
      'notasClienteSalon',
      'notasclientesalon'
    ]
  },
  notasColor: {
    key: FIELD_NOTAS_COLOR,
    aliases: [
      FIELD_NOTAS_COLOR,
      'color',
      'custom.color',
      'notasColor',
      'notascolor'
    ]
  },
  notasTratamientos: {
    key: FIELD_NOTAS_TRATAM,
    aliases: [
      FIELD_NOTAS_TRATAM,
      'tratamientos',
      'custom.tratamientos',
      'notasTratamientos',
      'notastratamientos'
    ]
  },
  ultimaVisita: {
    key: FIELD_ULTIMA_VISITA,
    aliases: [FIELD_ULTIMA_VISITA, 'custom.ultima_visita', 'ultimaVisita', 'ultimavisita']
  },
  clubKalonice: {
    key: FIELD_CLUB_KALONICE,
    aliases: [FIELD_CLUB_KALONICE, 'custom.club_kalonice', 'clubKalonice', 'clubkalonice']
  },
  sexo: {
    key: FIELD_SEXO,
    aliases: [FIELD_SEXO, 'custom.sexo']
  }
};

let _extendedFieldsCache = null;
let _extendedFieldsCacheTs = 0;
const EXTENDED_FIELDS_CACHE_MS = 5 * 60 * 1000;

const DIAS_FUTURO_PROXIMAS = 45;
const LOYALTY_TIMEOUT_MS   = 2500;

// =====================================================
// HELPERS GENERALES
// =====================================================

function normalizarStaff(raw) {
  const s = String(raw || '').trim();
  return s.replace(/^[A-Z]_/, '') || '—';
}

function safeErr(e) {
  const out = { name: e?.name || 'Error', message: e?.message || String(e) };
  if (e?.details) out.details = e.details;
  return out;
}

function isGuid(x) {
  return typeof x === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
}

function esOwnerSite(id) {
  return String(id || '') === OWNER_SITE_ID;
}

function esTienda(staff) {
  return String(staff || '').trim() === 'TIENDA';
}

function safeJsonLog(val, max = 700) {
  let s = '';
  try {
    s = JSON.stringify(val);
  } catch (_) {
    s = String(val);
  }
  if (!s) return '';
  return s.length > max ? `${s.slice(0, max)}…[truncado]` : s;
}

function loyaltyFallback(reason = 'fallback') {
  return {
    ok: false,
    accountId: '',
    saldo: 0,
    balance: 0,
    earned: 0,
    adjusted: 0,
    redeemed: 0,
    rewardAvailable: false,
    tier: null,
    source: '',
    reason
  };
}

function withTimeout(promise, ms, fallbackValue) {
  let timer;
  const timeout = new Promise(resolve => {
    timer = setTimeout(() => resolve(fallbackValue), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// =====================================================
// PAYLOAD DEFENSIVO
// =====================================================

function extraerContactIdPayload(payload) {
  if (!payload) return '';

  if (typeof payload === 'string') {
    return isGuid(payload) ? payload : '';
  }

  if (typeof payload !== 'object') return '';

  const candidatos = [
    payload.contactId,
    payload.id,
    payload._id,
    payload.clienteId,
    payload.memberContactId,

    payload.cliente?.contactId,
    payload.cliente?.id,
    payload.cliente?._id,

    payload.contact?.contactId,
    payload.contact?.id,
    payload.contact?._id,

    payload.data?.contactId,
    payload.data?.id,
    payload.data?._id,

    payload.item?.contactId,
    payload.item?.id,
    payload.item?._id
  ];

  for (const c of candidatos) {
    const s = String(c || '').trim();
    if (isGuid(s)) return s;
  }

  return '';
}

function extraerMemberIdPayload(payload) {
  if (!payload || typeof payload !== 'object') return '';

  const candidatos = [
    payload.memberId,
    payload.member?.id,
    payload.member?._id,
    payload.cliente?.memberId,
    payload.data?.memberId
  ];

  for (const c of candidatos) {
    const s = String(c || '').trim();
    if (s) return s;
  }

  return '';
}

// =====================================================
// HELPERS FLEXIBLES WIX CONTACTS
// =====================================================

function normalizarClaveDebug(x) {
  return String(x == null ? '' : x)
    .trim()
    .toLowerCase()
    .replace(/^custom\./, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function esClaveCoincidente(k, baseKey, aliases = []) {
  const nk = normalizarClaveDebug(k);
  if (!nk) return false;

  const candidatos = [baseKey, ...(Array.isArray(aliases) ? aliases : [])]
    .filter(Boolean)
    .map(normalizarClaveDebug)
    .filter(Boolean);

  return candidatos.includes(nk);
}

function valorDeItemExtendedField(item) {
  if (!item || typeof item !== 'object') return item;
  const props = [
    'value', 'checked', 'checkbox', 'booleanValue', 'boolValue',
    'selected', 'isChecked', 'enabled', 'text', 'label', 'name'
  ];
  for (const p of props) {
    if (Object.prototype.hasOwnProperty.call(item, p)) return item[p];
  }
  return item;
}

function leerExtendedFieldFlexible(extendedFields, baseKey, aliases = []) {
  const ef = extendedFields && typeof extendedFields === 'object' ? extendedFields : {};
  const limpio = String(baseKey || '').trim();
  if (!limpio) return { key: '', value: undefined, path: '', source: 'empty-base' };

  const sinCustom = limpio.replace(/^custom\./i, '');
  const candidatos = [];
  [limpio, `custom.${sinCustom}`, sinCustom, ...(Array.isArray(aliases) ? aliases : [])].forEach(k => {
    if (k && !candidatos.includes(k)) candidatos.push(k);
  });

  for (const k of candidatos) {
    if (Object.prototype.hasOwnProperty.call(ef, k)) {
      return { key: k, value: ef[k], path: k, source: 'direct-exact' };
    }
  }

  for (const k of Object.keys(ef)) {
    if (esClaveCoincidente(k, limpio, aliases)) {
      return { key: k, value: ef[k], path: k, source: 'direct-fuzzy' };
    }
  }

  const arraysCandidatos = [];
  if (Array.isArray(ef)) arraysCandidatos.push({ arr: ef, path: 'extendedFields' });
  if (Array.isArray(ef.items)) arraysCandidatos.push({ arr: ef.items, path: 'extendedFields.items' });
  if (Array.isArray(ef.values)) arraysCandidatos.push({ arr: ef.values, path: 'extendedFields.values' });
  if (Array.isArray(ef.fields)) arraysCandidatos.push({ arr: ef.fields, path: 'extendedFields.fields' });

  for (const pack of arraysCandidatos) {
    for (let i = 0; i < pack.arr.length; i++) {
      const item = pack.arr[i];
      if (!item || typeof item !== 'object') continue;
      const itemKey = item.key || item.fieldKey || item.fieldName || item.name || item.id || item._id || '';
      if (esClaveCoincidente(itemKey, limpio, aliases)) {
        return {
          key: itemKey,
          value: valorDeItemExtendedField(item),
          path: `${pack.path}[${i}]`,
          source: 'items-array'
        };
      }
    }
  }

  const seen = new Set();

  function walk(obj, path, depth) {
    if (!obj || typeof obj !== 'object' || depth > 4 || seen.has(obj)) return null;
    seen.add(obj);

    const objKey = obj.key || obj.fieldKey || obj.fieldName || obj.name || obj.id || obj._id || '';
    if (esClaveCoincidente(objKey, limpio, aliases)) {
      return {
        key: objKey,
        value: valorDeItemExtendedField(obj),
        path,
        source: 'nested-key-object'
      };
    }

    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) {
        const r = walk(obj[i], `${path}[${i}]`, depth + 1);
        if (r) return r;
      }
      return null;
    }

    for (const [k, v] of Object.entries(obj)) {
      if (esClaveCoincidente(k, limpio, aliases)) {
        return { key: k, value: v, path: path ? `${path}.${k}` : k, source: 'nested-property' };
      }
      if (v && typeof v === 'object') {
        const r = walk(v, path ? `${path}.${k}` : k, depth + 1);
        if (r) return r;
      }
    }

    return null;
  }

  const nested = walk(ef, 'extendedFields', 0);
  if (nested) return nested;

  return { key: '', value: undefined, path: '', source: 'not-found' };
}

function getCampoDef(nombreCampo) {
  return CRM_FIELD_DEFS[nombreCampo] || { key: nombreCampo, aliases: [nombreCampo] };
}

function leerCampoCRM(extendedFields, nombreCampo) {
  const def = getCampoDef(nombreCampo);
  return leerExtendedFieldFlexible(extendedFields, def.key, def.aliases);
}

function normalizarDefExtendedField(item) {
  if (!item || typeof item !== 'object') return null;

  const key = String(
    item.key ||
    item.fieldKey ||
    item.name ||
    item.fieldName ||
    item.id ||
    item._id ||
    ''
  ).trim();

  const displayName = String(
    item.displayName ||
    item.display ||
    item.label ||
    item.title ||
    item.name ||
    item.fieldName ||
    ''
  ).trim();

  if (!key && !displayName) return null;

  return {
    key,
    displayName,
    raw: item
  };
}

async function listarExtendedFieldsDefinidos() {
  const ahora = Date.now();
  if (_extendedFieldsCache && (ahora - _extendedFieldsCacheTs) < EXTENDED_FIELDS_CACHE_MS) {
    return _extendedFieldsCache;
  }

  try {
    const resp = await contacts.queryExtendedFields()
      .limit(200)
      .find({ suppressAuth: true });

    const items = resp?.items || resp?._items || [];
    _extendedFieldsCache = items
      .map(normalizarDefExtendedField)
      .filter(Boolean);
    _extendedFieldsCacheTs = ahora;

    console.log(
      `${TAG} ExtendedFields definidos: ` +
      safeJsonLog(_extendedFieldsCache.map(x => ({ key: x.key, displayName: x.displayName })), 1600)
    );

    return _extendedFieldsCache;
  } catch (e) {
    console.warn(`${TAG} queryExtendedFields no disponible, uso claves literales: ${e.message}`);
    return [];
  }
}

async function resolverKeyCampoCRM(nombreCampo, currentExtendedFields = {}) {
  const def = getCampoDef(nombreCampo);

  // 1) Si el contacto ya trae el campo con valor, respetamos exactamente
  //    la key usada por Wix en info.extendedFields.
  const lecturaActual = leerExtendedFieldFlexible(currentExtendedFields, def.key, def.aliases);
  if (lecturaActual.key) {
    return { key: lecturaActual.key, source: `contact.${lecturaActual.source}` };
  }

  // 2) Si aún no hay valor en ese contacto, buscamos la definición real
  //    del campo en Wix Contacts. Esto evita escribir a una variante de
  //    key que Wix no esté usando internamente.
  const defs = await listarExtendedFieldsDefinidos();
  for (const item of defs) {
    if (esClaveCoincidente(item.key, def.key, def.aliases) ||
        esClaveCoincidente(item.displayName, def.key, def.aliases)) {
      return { key: item.key || def.key, source: 'queryExtendedFields' };
    }
  }

  // 3) Fallback final: clave literal confirmada en Dashboard.
  return { key: def.key, source: 'literal-confirmada' };
}

function parseNotasClienteSalonHistorico(raw) {
  if (!raw || typeof raw !== 'string') return [];

  return String(raw)
    .split(' | ')
    .map(s => s.trim())
    .filter(Boolean)
    .map(entry => {
      const m = entry.match(/^\[([^\]]+)\]\s*(.+)$/);
      if (m) {
        return {
          fecha: m[1].trim(),
          texto: m[2].trim()
        };
      }
      return { fecha: '', texto: entry };
    })
    .reverse();
}

function extraerPatchCamposCRM(contactRaw) {
  const ef = contactRaw?.info?.extendedFields || {};
  const ultimaVisitaRaw = leerCampoCRM(ef, 'ultimaVisita').value;

  let ultimaVisitaCustom = '';
  if (ultimaVisitaRaw) {
    if (ultimaVisitaRaw instanceof Date && !isNaN(ultimaVisitaRaw)) {
      ultimaVisitaCustom = ultimaVisitaRaw.toLocaleDateString('en-CA', { timeZone: TIMEZONE_MADRID });
    } else {
      ultimaVisitaCustom = String(ultimaVisitaRaw);
    }
  }

  const notasClienteSalonRaw = String(leerCampoCRM(ef, 'notasClienteSalon').value || '');
  const notasClienteSalonHistorico = parseNotasClienteSalonHistorico(notasClienteSalonRaw);

  return {
    notasPublicas: String(leerCampoCRM(ef, 'notasPublicas').value || ''),
    notasClienteSalonRaw,
    notasClienteSalonHistorico,
    notasClienteSalonUltima: notasClienteSalonHistorico[0] || null,
    notasColor: String(leerCampoCRM(ef, 'notasColor').value || ''),
    notasTratamientos: String(leerCampoCRM(ef, 'notasTratamientos').value || ''),
    ultimaVisitaCustom,
    clubKalonice: { activo: normalizarClubActivo(leerCampoCRM(ef, 'clubKalonice').value) },
    sexo: String(leerCampoCRM(ef, 'sexo').value || ''),
    fechaNacimiento: extraerFechaNacimientoDeContacto(contactRaw)
  };
}

function normalizarClubActivo(raw) {
  if (raw === true) return true;
  if (raw === false || raw === null || raw === undefined) return false;

  if (typeof raw === 'number') return raw === 1;

  if (typeof raw === 'string') {
    const v = raw
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    return ['true', '1', 'si', 'yes', 'y', 'checked', 'activo', 'socio', 'on', 'x'].includes(v);
  }

  if (Array.isArray(raw)) {
    return raw.some(v => normalizarClubActivo(v));
  }

  if (typeof raw === 'object') {
    const candidatos = [
      raw.value, raw.checked, raw.checkbox, raw.booleanValue, raw.boolValue,
      raw.selected, raw.isChecked, raw.enabled, raw.text, raw.label, raw.name
    ];
    return candidatos.some(v => normalizarClubActivo(v));
  }

  return false;
}

function wixImageToHttps(wixUrl) {
  if (!wixUrl || typeof wixUrl !== 'string') return '';
  if (wixUrl.startsWith('http://') || wixUrl.startsWith('https://')) return wixUrl;
  if (!wixUrl.startsWith('wix:image://')) return '';
  const m = wixUrl.match(/^wix:image:\/\/v1\/([^\/]+)/);
  return m && m[1] ? `https://static.wixstatic.com/media/${m[1]}` : '';
}

/**
 * v1.9.9 — Sanitizador defensivo del SalonConfig.siteUrl.
 * Corrige "wwwX.tld" → "www.X.tld" cuando alguien escribe el dominio
 * sin el punto tras "www". Preserva protocolo/puerto/path. Idempotente.
 * Paridad literal con clienteAreaLogic v1.6.3.
 */
function sanitizarSiteUrl(rawUrl) {
  let s = String(rawUrl || '').trim();
  if (!s) return '';
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  const patronMalformado = /^(https?:\/\/)www([^.\/][^\/]*?)(\.[^\.\/]+)(\/|$|\?|#)/i;
  if (patronMalformado.test(s)) {
    const antes = s;
    s = s.replace(patronMalformado, '$1www.$2$3$4');
    try { console.log(`[sanitizarSiteUrl] corregido "${antes}" → "${s}"`); } catch (_) {}
  }
  return s;
}

function formatearUltimaVisitaParaEscribir(valor) {
  if (valor === null || valor === undefined || valor === '') return null;

  if (valor instanceof Date && !isNaN(valor)) {
    return valor.toLocaleDateString('en-CA', { timeZone: TIMEZONE_MADRID });
  }

  const s = String(valor).trim();
  if (!s) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  try {
    const d = new Date(s);
    if (!isNaN(d)) {
      return d.toLocaleDateString('en-CA', { timeZone: TIMEZONE_MADRID });
    }
  } catch (_) {}

  return s;
}

// =====================================================
// v1.9.8 — FECHA DE NACIMIENTO (NATIVO WIX CONTACTS)
// =====================================================

function extraerFechaNacimientoDeContacto(contactRaw) {
  const bd = contactRaw?.info?.birthdate;
  if (!bd) return '';
  if (bd instanceof Date && !isNaN(bd)) {
    return bd.toLocaleDateString('en-CA', { timeZone: TIMEZONE_MADRID });
  }
  const s = String(bd).trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // Puede llegar como ISO completo
  try {
    const d = new Date(s);
    if (!isNaN(d)) return d.toLocaleDateString('en-CA', { timeZone: TIMEZONE_MADRID });
  } catch (_) {}
  return s;
}

function normalizarFechaNacimientoParaEscribir(valor) {
  // '' → limpiar el campo; YYYY-MM-DD → escribir; otros → ignorar
  if (valor === undefined || valor === null) return { ok: false, valor: '' };
  const s = String(valor).trim();
  if (s === '') return { ok: true, valor: '' };
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return { ok: true, valor: s };
  // Intento parseo defensivo
  try {
    const d = new Date(s);
    if (!isNaN(d)) return { ok: true, valor: d.toLocaleDateString('en-CA', { timeZone: TIMEZONE_MADRID }) };
  } catch (_) {}
  return { ok: false, valor: '' };
}

// =====================================================
// v1.9.8 — PRODUCTOS CUSTOM + CONFIG SALÓN (patrón v1.6.2)
// =====================================================

async function leerSalonConfigLite() {
  try {
    const r = await wixData.query(COLLECTION_SALON_CONFIG)
      .limit(1)
      .find({ suppressAuth: true });
    const cfg = (r?.items || [])[0] || {};
    const brandName = String(cfg.brandName || '').trim();
    // v1.9.9 — Sanitiza "wwwX.tld" mal escrito en CMS.
    const siteUrl   = sanitizarSiteUrl(String(cfg.siteUrl || '').trim()).replace(/\/+$/, '');
    const slug      = String(cfg.promotionsPageSlug || '').trim();
    let promotionsUrl = '';
    if (siteUrl && slug) {
      const p = slug.replace(/^\/+/, '').replace(/\/+$/, '');
      promotionsUrl = `${siteUrl}/${p}`;
    }
    return { brandName, siteUrl, promotionsPageSlug: slug, promotionsUrl };
  } catch (e) {
    console.warn(`${TAG} leerSalonConfigLite: ${e.message}`);
    return { brandName: '', siteUrl: '', promotionsPageSlug: '', promotionsUrl: '' };
  }
}

async function leerPrimeImagenPublica() {
  try {
    const r = await wixData.query(COLLECTION_PRODUCTS_CFG)
      .limit(1)
      .find({ suppressAuth: true });
    const cfg = (r?.items || [])[0] || {};
    return wixImageToHttps(String(cfg.primeImage || ''));
  } catch (e) {
    console.warn(`${TAG} leerPrimeImagenPublica: ${e.message}`);
    return '';
  }
}

function normalizarFechaISOCorta(v) {
  if (!v) return '';
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  try {
    const d = new Date(s);
    if (!isNaN(d)) return d.toISOString().slice(0, 10);
  } catch (_) {}
  return s;
}

async function leerPrimeMembershipCliente(contactId) {
  try {
    const r = await wixData.query(COLLECTION_PRIME_MEMB)
      .eq('contactId', contactId)
      .descending('_createdDate')
      .limit(50)
      .find({ suppressAuth: true });

    const items = r?.items || [];
    const now = Date.now();

    for (const it of items) {
      if (it.status !== 'ACTIVA') continue;
      if (it.expirationDate && new Date(it.expirationDate).getTime() < now) continue;
      return {
        tiene: true,
        totalRaw: items.length,
        membresia: {
          code: String(it.code || ''),
          expirationDate: normalizarFechaISOCorta(it.expirationDate)
        }
      };
    }
    return { tiene: false, totalRaw: items.length, membresia: null };
  } catch (e) {
    console.warn(`${TAG} leerPrimeMembershipCliente: ${e.message}`);
    return { tiene: false, totalRaw: 0, membresia: null };
  }
}

async function leerBonosCliente(contactId) {
  try {
    const r = await wixData.query(COLLECTION_VOUCHERS)
      .eq('contactId', contactId)
      .descending('_createdDate')
      .limit(200)
      .find({ suppressAuth: true });

    const items = r?.items || [];
    const now = Date.now();

    const activos = items.filter(v => {
      if (v.status !== 'ACTIVO') return false;
      const rem = Number(v.remainingUses || 0);
      if (rem <= 0) return false;
      if (v.expirationDate && new Date(v.expirationDate).getTime() < now) return false;
      return true;
    }).map(v => ({
      id: v._id,
      code: String(v.code || ''),
      serviceSetupUid: String(v.serviceSetupUid || ''),
      serviceLabel: String(v.serviceLabel || ''),
      remainingUses: Number(v.remainingUses || 0),
      totalUses: Number(v.totalUses || 0),
      expirationDate: normalizarFechaISOCorta(v.expirationDate)
    }));

    return { tiene: activos.length > 0, items: activos, totalRaw: items.length };
  } catch (e) {
    console.warn(`${TAG} leerBonosCliente: ${e.message}`);
    return { tiene: false, items: [], totalRaw: 0 };
  }
}

async function leerTarjetasCliente(contactId) {
  try {
    // OJO: en KamisuitePromoCards el field es buyerContactId, NO contactId.
    const r = await wixData.query(COLLECTION_PROMOCARDS)
      .eq('buyerContactId', contactId)
      .descending('_createdDate')
      .limit(200)
      .find({ suppressAuth: true });

    const items = r?.items || [];
    const now = Date.now();

    const activos = items.filter(v => {
      if (v.status !== 'EMITIDA') return false;
      if (v.isGift === true) return false; // regalos excluidos del área privada
      if (v.expirationDate && new Date(v.expirationDate).getTime() < now) return false;
      return true;
    }).map(v => ({
      id: v._id,
      code: String(v.code || ''),
      serviceSetupUid: String(v.serviceSetupUid || ''),
      serviceLabel: String(v.serviceLabel || ''),
      expirationDate: normalizarFechaISOCorta(v.expirationDate)
    }));

    return { tiene: activos.length > 0, items: activos, totalRaw: items.length };
  } catch (e) {
    console.warn(`${TAG} leerTarjetasCliente: ${e.message}`);
    return { tiene: false, items: [], totalRaw: 0 };
  }
}

// =====================================================
// FORMATEAR CONTACTO
// =====================================================

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

  const tags        = contact?.info?.labelKeys || [];
  const createdDate = contact?.createdDate || null;

  const ef = contact?.info?.extendedFields || {};
  const notasSalonHistorial = ef['custom.ficha'] || '';

  // v1.9.8 — Campo NATIVO Wix Contacts (no extendedFields)
  const fechaNacimiento = extraerFechaNacimientoDeContacto(contact);

  return {
    contactId:           contact._id || contact.id,
    nombre:              String(nombre).trim(),
    apellido:            String(apellido).trim(),
    nombreCompleto:      `${nombre} ${apellido}`.trim(),
    email:               String(email).trim(),
    telefono:            String(telefono).trim(),
    fechaNacimiento,
    tags,
    createdDate,
    notasSalonHistorial
  };
}

// =====================================================
// PAGOS / EXTERNOS / STATS / UPSERT
// =====================================================

async function leerPagosDeCliente(contactId) {
  const [directResult, ambiguoResult] = await Promise.all([
    wixData.query(COLLECTION_PAYMENT_RESERVATIONS)
      .eq('contactId', contactId)
      .descending('fechaReserva')
      .limit(500)
      .find({ suppressAuth: true }),
    wixData.query(COLLECTION_PAYMENT_RESERVATIONS)
      .eq('_cidStatus', 'ambiguo')
      .descending('fechaReserva')
      .limit(500)
      .find({ suppressAuth: true })
  ]);

  const items = (directResult?.items || []).filter(i => !esOwnerSite(i.contactId));
  const vistos = new Set(items.map(i => i._id));

  for (const item of (ambiguoResult?.items || [])) {
    if (vistos.has(item._id)) continue;
    const cands = Array.isArray(item._candidatos) ? item._candidatos : [];
    if (cands.some(c => c.contactId === contactId)) {
      vistos.add(item._id);
      items.push({ ...item, _esAmbiguo: true });
    }
  }

  items.sort((a, b) => new Date(b.fechaReserva || b.fechaPago || 0) - new Date(a.fechaReserva || a.fechaPago || 0));
  return items;
}

async function leerExternosDeCliente(contactId) {
  const result = await wixData.query(COLLECTION_EXTERNAL_RECORDS)
    .eq('contactId', contactId)
    .descending('date')
    .limit(200)
    .find({ suppressAuth: true });
  return result?.items || [];
}

function calcularStats(pagos, externosItems) {
  let totalVisitas = 0;
  let totalFacturado = 0;
  let ultimaVisita = null;
  let cidAmbiguos = 0;

  for (const p of pagos) {
    if (!esTienda(p.staff)) totalVisitas++;
    totalFacturado += Number(p.importeTotal || 0);
    if (p._esAmbiguo || p._cidStatus === 'ambiguo') cidAmbiguos++;
  }

  const extItems = Array.isArray(externosItems) ? externosItems : [];
  for (const ext of extItems) {
    totalFacturado += Number(ext.totalPrice || 0);
  }

  const primera = pagos.find(p => !esTienda(p.staff));
  if (primera) {
    ultimaVisita = primera.fechaReserva || primera.fechaPago || null;
  }

  return { totalVisitas, totalFacturado, ultimaVisita, cidAmbiguos };
}

async function upsertClientProfile(contactId, datos, profileExist) {
  const registro = { contactId, ...datos };

  if (profileExist?._id) {
    const upd = { _id: profileExist._id, ...registro };
    if (!datos.hasOwnProperty('fotoUrl'))       upd.fotoUrl       = profileExist.fotoUrl       || null;
    if (!datos.hasOwnProperty('notasSalon'))    upd.notasSalon    = profileExist.notasSalon    || '';
    if (!datos.hasOwnProperty('loyaltyPoints')) upd.loyaltyPoints = profileExist.loyaltyPoints || 0;
    if (!datos.hasOwnProperty('notasReserva'))  upd.notasReserva  = profileExist.notasReserva  || '';
    console.log(`${TAG} upsert UPDATE: ${contactId}`);
    await wixData.update(COLLECTION_CLIENT_PROFILE, upd, { suppressAuth: true });
    return upd;
  }

  console.log(`${TAG} upsert INSERT: ${contactId}`);
  return await wixData.insert(COLLECTION_CLIENT_PROFILE, registro, { suppressAuth: true });
}

// =====================================================
// WIX MEMBERS / BADGES
// =====================================================

async function resolverMemberId(contactId) {
  if (!contactId) return '';
  try {
    const r = await members
      .queryMembers({ fieldsets: ['FULL'] })
      .eq('contactId', contactId)
      .limit(1)
      .find();

    const member = r?.items?.[0] || r?._items?.[0] || null;
    return member?._id || '';
  } catch (e) {
    console.warn(`${TAG} resolverMemberId: ${e.message}`);
    return '';
  }
}

async function leerBadgesDeMember(memberId) {
  if (!memberId) return [];
  try {
    const colResp = await wixData.query(COLLECTION_MEMBERS_BADGES)
      .hasSome('members', [memberId])
      .limit(100)
      .find({ suppressAuth: true });

    return (colResp.items || []).map(b => ({
      id: b._id,
      title: b.title || '',
      description: b.description || '',
      backgroundColor: b.backgroundColor || '',
      textColor: b.textColor || '',
      icon: b.icon || '',
      slug: b.slug || ''
    }));
  } catch (e) {
    console.warn(`${TAG} leerBadgesDeMember fallback: ${e.message}`);
    return [];
  }
}

// =====================================================
// WIX LOYALTY POINTS
// =====================================================

function normalizarLoyaltyAccount(acc, source) {
  if (!acc) return null;

  const points = acc.points || {};
  const saldo = Number(points.balance) || 0;

  return {
    ok: true,
    accountId: acc._id || acc.id || '',
    saldo,
    balance: saldo,
    earned: Number(points.earned) || 0,
    adjusted: Number(points.adjusted) || 0,
    redeemed: Number(points.redeemed) || 0,
    rewardAvailable: !!acc.rewardAvailable,
    tier: acc.tier || null,
    source: source || '',
    reason: ''
  };
}

async function leerPuntosLoyaltyCliente({ contactId, memberId, email } = {}) {
  let lastError = '';

  async function probar(options, source) {
    try {
      const elevatedGet = elevate(accounts.getAccountBySecondaryId);
      const resp = await elevatedGet(options);
      const acc = resp?.account || resp || null;
      const out = normalizarLoyaltyAccount(acc, source);
      if (out) {
        console.log(`${TAG} 🏆 Loyalty OK source=${source} saldo=${out.saldo} account=${out.accountId || '-'}`);
        return out;
      }
      lastError = `sin account (${source})`;
      return null;
    } catch (e) {
      lastError = e?.message || String(e);
      console.log(`${TAG} ℹ️ Loyalty no disponible source=${source}: ${lastError}`);
      return null;
    }
  }

  if (contactId && isGuid(contactId)) {
    const r1 = await probar({ contactId }, 'contactId');
    if (r1?.ok) return r1;
  }

  if (memberId) {
    const r2 = await probar({ memberId }, 'memberId');
    if (r2?.ok) return r2;
  }

  // Fallback por duplicados de Wix Contacts con mismo email.
  if (email && String(email).includes('@')) {
    try {
      const elevatedQueryContacts = elevate(contacts.queryContacts);
      const dupResp = await elevatedQueryContacts()
        .eq('info.emails.email', String(email).trim())
        .limit(10)
        .find();

      const dupItems = dupResp?.items || [];
      for (const ct of dupItems) {
        const dupContactId = ct?._id || ct?.id || '';
        if (!dupContactId || dupContactId === contactId) continue;

        const rDup = await probar({ contactId: dupContactId }, `duplicado-email:${dupContactId}`);
        if (rDup?.ok) {
          return {
            ...rDup,
            duplicateContactId: dupContactId
          };
        }
      }
    } catch (eDup) {
      lastError = eDup?.message || String(eDup);
      console.warn(`${TAG} ⚠️ Loyalty fallback duplicados falló: ${lastError}`);
    }
  }

  return loyaltyFallback(lastError || 'loyalty-account-not-found');
}

// =====================================================
// getFichaCliente
// =====================================================

export const getFichaCliente = webMethod(Permissions.Anyone, async (payload) => {
  try {
    const contactId = extraerContactIdPayload(payload);
    const memberIdPayload = extraerMemberIdPayload(payload);

    console.log(
      `${TAG} getFichaCliente payload=${safeJsonLog(payload)} ` +
      `→ contactId=${contactId || '-'} memberId=${memberIdPayload || '-'}`
    );

    if (!contactId || !isGuid(contactId)) {
      console.warn(`${TAG} getFichaCliente SIN contactId válido | payload=${safeJsonLog(payload)}`);
      return {
        ok: false,
        version: VERSION,
        error: {
          message: 'contactId requerido',
          payloadDebug: safeJsonLog(payload)
        },
        warnings: ['SIN_CONTACT_ID']
      };
    }

    const elevatedGet = elevate(contacts.getContact);

    // v1.9.8 — Añadimos 5 queries paralelas: salonCfg, primeImagen,
    // primeMemb, bonosCli, tarjetasCli. Todo por Promise.all para no
    // penalizar la latencia.
    const [
      contactRaw, pagos, externosItems, careResult, profileResult,
      salonCfg, primeImagen, primeMemb, bonosCli, tarjetasCli
    ] = await Promise.all([
      elevatedGet(contactId),
      leerPagosDeCliente(contactId),
      leerExternosDeCliente(contactId),
      wixData.query(COLLECTION_CARE_PROFILE).eq('contactId', contactId).limit(1).find({ suppressAuth: true }),
      wixData.query(COLLECTION_CLIENT_PROFILE).eq('contactId', contactId).limit(1).find({ suppressAuth: true }),
      leerSalonConfigLite(),
      leerPrimeImagenPublica(),
      leerPrimeMembershipCliente(contactId),
      leerBonosCliente(contactId),
      leerTarjetasCliente(contactId)
    ]);

    if (!contactRaw) throw new Error(`Contacto no encontrado: ${contactId}`);

    const cliente       = formatearContacto(contactRaw);
    const profileExist  = (profileResult?.items || [])[0] || null;
    const careProfile   = (careResult?.items || [])[0] || null;
    const hasExpediente = !!careProfile;

    const ef           = contactRaw?.info?.extendedFields || {};
    const fotoContacts = contactRaw?.info?.picture?.image || '';
    const fotoCare     = careProfile?.profileImage || null;
    const fotoUrl      = fotoContacts || fotoCare || null;

    const stats = calcularStats(pagos, externosItems);

    const notasPublicas    = String(leerCampoCRM(ef, 'notasPublicas').value || '');
    const notasClienteSalonRaw = String(leerCampoCRM(ef, 'notasClienteSalon').value || '');
    const notasClienteSalonHistorico = parseNotasClienteSalonHistorico(notasClienteSalonRaw);
    const notasClienteSalonUltima = notasClienteSalonHistorico[0] || null;
    const notasColor       = String(leerCampoCRM(ef, 'notasColor').value || '');
    const notasTratamient  = String(leerCampoCRM(ef, 'notasTratamientos').value || '');
    const sexo             = String(leerCampoCRM(ef, 'sexo').value || '');
    const clubActivo       = normalizarClubActivo(leerCampoCRM(ef, 'clubKalonice').value);
    const ultimaVisitaRaw  = leerCampoCRM(ef, 'ultimaVisita').value;

    let ultimaVisitaCustom = '';
    if (ultimaVisitaRaw) {
      if (ultimaVisitaRaw instanceof Date && !isNaN(ultimaVisitaRaw)) {
        ultimaVisitaCustom = ultimaVisitaRaw.toLocaleDateString('en-CA', { timeZone: TIMEZONE_MADRID });
      } else {
        ultimaVisitaCustom = String(ultimaVisitaRaw);
      }
    }

    let memberIdFinal = memberIdPayload && isGuid(memberIdPayload) ? memberIdPayload : '';
    if (!memberIdFinal) {
      memberIdFinal = await resolverMemberId(contactId);
    }

    const badgesPromise = leerBadgesDeMember(memberIdFinal);
    const loyaltyPromise = withTimeout(
      leerPuntosLoyaltyCliente({
        contactId,
        memberId: memberIdFinal,
        email: cliente.email
      }),
      LOYALTY_TIMEOUT_MS,
      loyaltyFallback(`timeout-${LOYALTY_TIMEOUT_MS}ms`)
    );

    const [badges, loyalty] = await Promise.all([badgesPromise, loyaltyPromise]);
    const loyaltySaldo = Number(loyalty?.saldo) || 0;

    const datosSync = {
      nombre:         cliente.nombre,
      apellido:       cliente.apellido,
      email:          cliente.email,
      telefono:       cliente.telefono,
      labelKeys:      cliente.tags || [],
      hasExpediente,
      totalVisitas:   stats.totalVisitas,
      totalFacturado: stats.totalFacturado,
      ultimaVisita:   stats.ultimaVisita,
      cidAmbiguos:    stats.cidAmbiguos,
      loyaltyPoints:  loyaltySaldo
    };

    if (fotoUrl) datosSync.fotoUrl = fotoUrl;

    const profileGuardado = await upsertClientProfile(contactId, datosSync, profileExist);

    console.log(
      `${TAG} 🏷️ Config salón | brandName="${salonCfg.brandName}" | slug="${salonCfg.promotionsPageSlug}" | ` +
      `promotionsUrl="${salonCfg.promotionsUrl}" | primeImagen=${primeImagen ? 'sí' : 'no'}`
    );
    console.log(
      `${TAG} 💎 PRIME | items=${primeMemb.totalRaw} | activa=${primeMemb.tiene ? 'sí' : 'no'}` +
      (primeMemb.tiene ? ` (code=${primeMemb.membresia.code} exp=${primeMemb.membresia.expirationDate})` : '')
    );
    console.log(
      `${TAG} 🎟️ Bonos | totales=${bonosCli.totalRaw} | activos=${bonosCli.items.length}`
    );
    console.log(
      `${TAG} 🎫 Tarjetas | totales=${tarjetasCli.totalRaw} | emitidas activas=${tarjetasCli.items.length}`
    );
    console.log(
      `${TAG} OK: v=${stats.totalVisitas} f=${stats.totalFacturado}€ exp=${hasExpediente} ` +
      `foto=${!!fotoUrl} ext=${externosItems.length} club=${clubActivo} badges=${badges.length} ` +
      `memberId=${memberIdFinal || '-'} loyalty=${loyaltySaldo} source=${loyalty?.source || '-'} reason=${loyalty?.reason || '-'} ` +
      `notasClienteSalon=${notasClienteSalonHistorico.length} fnac=${cliente.fechaNacimiento || '-'}`
    );

    const warnings = [];
    if (!cliente.email || cliente.email === 'booking@hair-times.com' || cliente.email === 'info@hair-times.com') {
      warnings.push('SIN_EMAIL');
    }
    if (!cliente.telefono) warnings.push('SIN_TELEFONO');

    return {
      ok: true,
      version: VERSION,
      cliente,
      profile: {
        fotoUrl:        fotoUrl || profileGuardado.fotoUrl || null,
        hasExpediente,
        labelKeys:      profileGuardado.labelKeys || [],
        loyaltyPoints:  loyaltySaldo,
        loyalty: {
          ok:              !!loyalty?.ok,
          saldo:           loyaltySaldo,
          balance:         loyaltySaldo,
          accountId:       loyalty?.accountId || '',
          earned:          Number(loyalty?.earned) || 0,
          adjusted:        Number(loyalty?.adjusted) || 0,
          redeemed:        Number(loyalty?.redeemed) || 0,
          rewardAvailable: !!loyalty?.rewardAvailable,
          tier:            loyalty?.tier || null,
          source:          loyalty?.source || '',
          reason:          loyalty?.reason || '',
          duplicateContactId: loyalty?.duplicateContactId || ''
        },
        notasSalon:     profileGuardado.notasSalon || '',
        notasReserva:   profileGuardado.notasReserva || '',
        totalFacturado: stats.totalFacturado,
        totalVisitas:   stats.totalVisitas,
        ultimaVisita:   stats.ultimaVisita,
        cidAmbiguos:    stats.cidAmbiguos,
        profileCmsId:   profileGuardado._id || null,
        notasPublicas,
        notasClienteSalonRaw,
        notasClienteSalonHistorico,
        notasClienteSalonUltima,
        notasColor,
        notasTratamientos: notasTratamient,
        ultimaVisitaCustom,
        clubKalonice: { activo: clubActivo }, // legacy, ya no lo pinta el widget
        sexo,
        fechaNacimiento: cliente.fechaNacimiento || '',
        badges,
        memberId: memberIdFinal,

        // v1.9.8 — Bloque Bonos y Promociones
        salon: { brandName: salonCfg.brandName },
        prime: {
          tiene: primeMemb.tiene,
          membresia: primeMemb.membresia,
          imagen: primeImagen,
          urlAdquirir: salonCfg.promotionsUrl
        },
        bonos: {
          tiene: bonosCli.tiene,
          items: bonosCli.items,
          urlAdquirir: salonCfg.promotionsUrl
        },
        tarjetas: {
          tiene: tarjetasCli.tiene,
          items: tarjetasCli.items,
          urlAdquirir: salonCfg.promotionsUrl
        }
      },
      warnings
    };

  } catch (e) {
    console.error(`${TAG} getFichaCliente ERROR:`, e);
    return { ok: false, version: VERSION, error: safeErr(e) };
  }
});

// =====================================================
// getHistorialCliente
// =====================================================

export const getHistorialCliente = webMethod(Permissions.Anyone, async (payload) => {
  try {
    const { contactId } = payload || {};
    console.log(`${TAG} getHistorialCliente: ${contactId}`);
    if (!contactId || !isGuid(contactId)) throw new Error('contactId requerido');

    const pagos = await leerPagosDeCliente(contactId);
    const visitas = [];
    const ventasTienda = [];

    for (const p of pagos) {
      const item = {
        id:           p._id,
        fecha:        p.fechaReserva || p.fechaPago || null,
        descripcion:  p.descripcion || '',
        importeTotal: Number(p.importeTotal || 0),
        staff:        normalizarStaff(p.staff),
        tipoPago:     p.tipoPago || '',
        ambiguo:      !!(p._esAmbiguo || p._cidStatus === 'ambiguo')
      };

      if (esTienda(p.staff)) ventasTienda.push(item);
      else visitas.push(item);
    }

    return {
      ok: true,
      version: VERSION,
      visitas,
      ventasTienda,
      total: visitas.length,
      totalTienda: ventasTienda.length
    };

  } catch (e) {
    console.error(`${TAG} getHistorialCliente ERROR:`, e);
    return { ok: false, version: VERSION, error: safeErr(e) };
  }
});

// =====================================================
// actualizarContactoCRM
// =====================================================

export const actualizarContactoCRM = webMethod(Permissions.Anyone, async (payload) => {
  try {
    const {
      contactId,
      nombre, apellido, email, telefono,
      notasPublicas,
      notasColor,
      notasTratamientos,
      ultimaVisita,
      clubKalonice,
      sexo,
      fechaNacimiento // v1.9.8 — NATIVO Wix Contacts (contact.info.birthdate)
    } = payload || {};

    console.log(`${TAG} actualizarContactoCRM: ${contactId}`);
    if (!contactId || !isGuid(contactId)) throw new Error('contactId requerido');

    const elevatedGet = elevate(contacts.getContact);
    const current = await elevatedGet(contactId);
    if (!current || !current.revision) throw new Error('Contacto no encontrado');

    const contactInfo = {};

    if (nombre !== undefined || apellido !== undefined) {
      const name = {};
      if (nombre !== undefined)   name.first = String(nombre || '').trim();
      if (apellido !== undefined) name.last  = String(apellido || '').trim();
      contactInfo.name = name;
    }

    const nE = String(email || '').trim();
    if (nE) contactInfo.emails = [{ email: nE }];

    const nP = String(telefono || '').trim();
    if (nP) contactInfo.phones = [{ phone: nP }];

    // v1.9.8 — fechaNacimiento: campo NATIVO. Va como
    // contactInfo.birthdate directo (mismo nivel que name).
    if (fechaNacimiento !== undefined) {
      const norm = normalizarFechaNacimientoParaEscribir(fechaNacimiento);
      if (norm.ok) {
        contactInfo.birthdate = norm.valor; // '' para limpiar, YYYY-MM-DD para escribir
      } else {
        console.warn(`${TAG} fechaNacimiento formato inesperado, ignorado: ${fechaNacimiento}`);
      }
    }

    const currentEf = current?.info?.extendedFields || {};
    const ext = {};
    const extSources = {};

    async function setCampoCRM(nombreCampo, valor) {
      const resolved = await resolverKeyCampoCRM(nombreCampo, currentEf);
      ext[resolved.key] = valor;
      extSources[nombreCampo] = resolved;
    }

    if (notasPublicas !== undefined) {
      await setCampoCRM('notasPublicas', String(notasPublicas || ''));
    }
    if (notasColor !== undefined) {
      await setCampoCRM('notasColor', String(notasColor || ''));
    }
    if (notasTratamientos !== undefined) {
      await setCampoCRM('notasTratamientos', String(notasTratamientos || ''));
    }
    if (sexo !== undefined) {
      await setCampoCRM('sexo', String(sexo || ''));
    }
    if (clubKalonice !== undefined) {
      await setCampoCRM('clubKalonice', !!clubKalonice);
    }

    if (ultimaVisita !== undefined) {
      const f = formatearUltimaVisitaParaEscribir(ultimaVisita);
      if (f !== null) {
        await setCampoCRM('ultimaVisita', f);
      }
    }

    if (Object.keys(ext).length) contactInfo.extendedFields = ext;

    if (!Object.keys(contactInfo).length) {
      console.warn(`${TAG} actualizarContactoCRM: sin cambios efectivos`);
      return { ok: true, version: VERSION, sinCambios: true, cliente: formatearContacto(current) };
    }

    const elevatedUpdate = elevate(contacts.updateContact);
    const updated = await elevatedUpdate(
      { contactId, revision: current.revision },
      contactInfo,
      { suppressAuth: true }
    );

    const updatedContact = updated?.contact || updated;

    // Relectura real tras guardar: evita falsos positivos y deja trazabilidad
    // de qué key ha aceptado Wix. Si falla la relectura, no rompemos el OK.
    let after = updatedContact;
    try {
      after = await elevatedGet(contactId);
    } catch (eAfter) {
      console.warn(`${TAG} relectura post-update no disponible: ${eAfter.message}`);
    }

    const profilePatch = extraerPatchCamposCRM(after);

    console.log(
      `${TAG} actualizarContactoCRM OK: ${contactId} | ` +
      `campos=${Object.keys(contactInfo).join(',')}` +
      `${Object.keys(ext).length ? ' | ext=' + Object.keys(ext).join(',') : ''}` +
      `${Object.keys(extSources).length ? ' | resolved=' + safeJsonLog(extSources, 1200) : ''}` +
      ` | postRead=${safeJsonLog(profilePatch, 1200)}`
    );

    return {
      ok: true,
      version: VERSION,
      cliente: formatearContacto(after || updatedContact),
      profilePatch,
      debug: {
        extendedFieldsEscritos: Object.keys(ext),
        contactInfoEscritos: Object.keys(contactInfo),
        resolved: extSources
      }
    };

  } catch (e) {
    console.error(`${TAG} actualizarContactoCRM ERROR:`, e);
    return { ok: false, version: VERSION, error: safeErr(e) };
  }
});

// =====================================================
// guardarNotaSalon
// =====================================================

export const guardarNotaSalon = webMethod(Permissions.Anyone, async (payload) => {
  try {
    const { contactId, nota, autor } = payload || {};
    console.log(`${TAG} guardarNotaSalon: ${contactId}`);

    if (!contactId || !isGuid(contactId)) throw new Error('contactId requerido');
    if (!nota || !String(nota).trim()) throw new Error('nota requerida');

    const notaTexto  = String(nota).trim();
    const autorTexto = String(autor || 'Recepción').trim();
    const timestamp  = new Date().toLocaleString('es-ES', { timeZone: TIMEZONE_MADRID });
    const entrada    = `[${timestamp}] ${autorTexto}: ${notaTexto}`;

    const elevatedGet = elevate(contacts.getContact);

    const [profileResult, contactRaw] = await Promise.all([
      wixData.query(COLLECTION_CLIENT_PROFILE)
        .eq('contactId', contactId)
        .limit(1)
        .find({ suppressAuth: true }),
      elevatedGet(contactId)
    ]);

    if (!contactRaw || !contactRaw.revision) throw new Error('Contacto no encontrado');

    const profile          = (profileResult?.items || [])[0] || null;
    const fichaActual      = contactRaw?.info?.extendedFields?.['custom.ficha'] || '';
    const fichaActualizada = fichaActual ? `${fichaActual} | ${entrada}` : entrada;

    const promises = [];

    if (profile?._id) {
      console.log(`${TAG} UPDATE profile ${profile._id}`);
      promises.push(
        wixData.update(
          COLLECTION_CLIENT_PROFILE,
          { ...profile, notasSalon: notaTexto },
          { suppressAuth: true }
        )
      );
    } else {
      console.log(`${TAG} INSERT profile contactId=${contactId}`);
      promises.push(
        wixData.insert(
          COLLECTION_CLIENT_PROFILE,
          { contactId, notasSalon: notaTexto },
          { suppressAuth: true }
        )
      );
    }

    promises.push(
      elevate(contacts.updateContact)(
        { contactId, revision: contactRaw.revision },
        { extendedFields: { 'custom.ficha': fichaActualizada } },
        { suppressAuth: true }
      )
    );

    await Promise.all(promises);

    console.log(`${TAG} guardarNotaSalon OK: ${contactId}`);
    return { ok: true, version: VERSION, entrada };

  } catch (e) {
    console.error(`${TAG} guardarNotaSalon ERROR:`, e);
    return { ok: false, version: VERSION, error: safeErr(e) };
  }
});

// =====================================================
// actualizarFotoCliente
// =====================================================

export const actualizarFotoCliente = webMethod(Permissions.Anyone, async (payload) => {
  try {
    const { contactId, memberId: memberIdPayload, base64Data, fileName, mimeType } = payload || {};
    console.log(`${TAG} actualizarFotoCliente: ${contactId} memberId=${memberIdPayload || '-'}`);

    if (!contactId || !isGuid(contactId)) throw new Error('contactId requerido');
    if (!base64Data) throw new Error('base64Data requerido');

    let cleanBase64 = String(base64Data);
    if (cleanBase64.includes(',')) cleanBase64 = cleanBase64.split(',')[1];

    const buffer = Buffer.from(cleanBase64, 'base64');
    const safeName = (fileName || `perfil_${Date.now()}.jpg`).replace(/[^a-zA-Z0-9._-]/g, '_');
    const finalMime = mimeType || 'image/jpeg';

    const elevatedUpload = elevate(mediaManager.upload);
    const uploadResult = await elevatedUpload(
      '/kamisuite/perfiles',
      buffer,
      safeName,
      {
        mediaOptions: { mimeType: finalMime, mediaType: 'image' },
        metadataOptions: { isPrivate: false, isVisitorUpload: false }
      }
    );

    const fileUrl = uploadResult?.fileUrl || '';
    if (!fileUrl) throw new Error('Upload no devolvió fileUrl');

    const publicUrl = wixImageToHttps(fileUrl);
    if (!publicUrl) throw new Error('No se pudo convertir fileUrl a https');

    const elevatedGet = elevate(contacts.getContact);
    const contact = await elevatedGet(contactId);
    if (!contact || !contact.revision) throw new Error('Contacto no encontrado');

    const elevatedUpdate = elevate(contacts.updateContact);
    await elevatedUpdate(
      { contactId, revision: contact.revision },
      {
        picture: {
          image: publicUrl,
          imageProvider: 'EXTERNAL'
        }
      },
      { suppressAuth: true, allowDuplicates: false }
    );

    let memberIdFinal = memberIdPayload && isGuid(memberIdPayload) ? memberIdPayload : '';
    if (!memberIdFinal) memberIdFinal = await resolverMemberId(contactId);

    let membersUpdated = false;
    if (memberIdFinal) {
      try {
        const elevatedMemberUpdate = elevate(members.updateMember);
        await elevatedMemberUpdate(memberIdFinal, {
          profile: {
            profilePhoto: {
              url: publicUrl
            }
          }
        });
        membersUpdated = true;
      } catch (eMember) {
        console.warn(`${TAG} members.updateMember falló (Contacts SÍ actualizado): ${eMember.message || eMember}`);
      }
    } else {
      console.log(`${TAG} sin memberId → sync Wix Members omitida`);
    }

    try {
      const profileResult = await wixData.query(COLLECTION_CLIENT_PROFILE)
        .eq('contactId', contactId)
        .limit(1)
        .find({ suppressAuth: true });

      const profile = (profileResult?.items || [])[0] || null;

      if (profile?._id) {
        await wixData.update(
          COLLECTION_CLIENT_PROFILE,
          { ...profile, fotoUrl: publicUrl },
          { suppressAuth: true }
        );
      } else {
        await wixData.insert(
          COLLECTION_CLIENT_PROFILE,
          { contactId, fotoUrl: publicUrl },
          { suppressAuth: true }
        );
      }
    } catch (eProfile) {
      console.warn(`${TAG} ClientProfile.fotoUrl no se pudo persistir (no fatal): ${eProfile.message}`);
    }

    console.log(`${TAG} actualizarFotoCliente OK | ${publicUrl} | members=${membersUpdated ? 'sí' : 'no'}`);

    return {
      ok: true,
      version: VERSION,
      imageUrl: publicUrl,
      membersUpdated,
      memberId: memberIdFinal
    };

  } catch (e) {
    console.error(`${TAG} actualizarFotoCliente ERROR:`, e);
    return { ok: false, version: VERSION, error: safeErr(e) };
  }
});

// =====================================================
// sincronizarClientProfile
// =====================================================

export const sincronizarClientProfile = webMethod(Permissions.Anyone, async (payload) => {
  try {
    const { contactId } = payload || {};
    console.log(`${TAG} sincronizar: ${contactId}`);

    if (!contactId || !isGuid(contactId)) throw new Error('contactId requerido');

    const elevatedGet = elevate(contacts.getContact);

    const [contactRaw, pagos, externosItems, careResult, profileResult] = await Promise.all([
      elevatedGet(contactId),
      leerPagosDeCliente(contactId),
      leerExternosDeCliente(contactId),
      wixData.query(COLLECTION_CARE_PROFILE).eq('contactId', contactId).limit(1).find({ suppressAuth: true }),
      wixData.query(COLLECTION_CLIENT_PROFILE).eq('contactId', contactId).limit(1).find({ suppressAuth: true })
    ]);

    if (!contactRaw) throw new Error('Contacto no encontrado');

    const cliente       = formatearContacto(contactRaw);
    const profileExist  = (profileResult?.items || [])[0] || null;
    const careProfile   = (careResult?.items || [])[0] || null;
    const hasExpediente = !!careProfile;

    const fotoContacts = contactRaw?.info?.picture?.image || '';
    const fotoCare     = careProfile?.profileImage || null;
    const fotoUrl      = fotoContacts || fotoCare || null;

    const stats = calcularStats(pagos, externosItems);

    const memberIdFinal = await resolverMemberId(contactId);
    const loyalty = await withTimeout(
      leerPuntosLoyaltyCliente({
        contactId,
        memberId: memberIdFinal,
        email: cliente.email
      }),
      LOYALTY_TIMEOUT_MS,
      loyaltyFallback(`timeout-${LOYALTY_TIMEOUT_MS}ms`)
    );

    const datosSync = {
      nombre:         cliente.nombre,
      apellido:       cliente.apellido,
      email:          cliente.email,
      telefono:       cliente.telefono,
      labelKeys:      cliente.tags || [],
      hasExpediente,
      totalVisitas:   stats.totalVisitas,
      totalFacturado: stats.totalFacturado,
      ultimaVisita:   stats.ultimaVisita,
      cidAmbiguos:    stats.cidAmbiguos,
      loyaltyPoints:  Number(loyalty?.saldo) || 0
    };

    if (fotoUrl) datosSync.fotoUrl = fotoUrl;

    await upsertClientProfile(contactId, datosSync, profileExist);

    console.log(
      `${TAG} sincronizar OK: ${contactId} ext=${externosItems.length} ` +
      `loyalty=${Number(loyalty?.saldo) || 0} source=${loyalty?.source || '-'}`
    );

    return {
      ok: true,
      version: VERSION,
      ...stats,
      hasExpediente,
      loyaltyPoints: Number(loyalty?.saldo) || 0
    };

  } catch (e) {
    console.error(`${TAG} sincronizar ERROR:`, e);
    return { ok: false, version: VERSION, error: safeErr(e) };
  }
});

// =====================================================
// enviarMensajeInbox
// =====================================================

export const enviarMensajeInbox = webMethod(Permissions.Anyone, async () => {
  console.log(`${TAG} enviarMensajeInbox: DESACTIVADO (Próximamente)`);
  return {
    ok: false,
    version: VERSION,
    error: { message: 'Mensajería al Área Cliente próximamente. Usa Correo o WhatsApp.' }
  };
});

// =====================================================
// getProximasCitasCliente V2
// =====================================================

function _horaMadridDeDate(date) {
  if (!date) return '';
  try {
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d)) return '';
    return d.toLocaleTimeString('es-ES', {
      timeZone: TIMEZONE_MADRID,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  } catch (_) {
    return '';
  }
}

function _diaMadridDeDate(date) {
  if (!date) return '';
  try {
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d)) return '';
    return d.toLocaleDateString('en-CA', { timeZone: TIMEZONE_MADRID });
  } catch (_) {
    return '';
  }
}

function _fechaLargaMadridDeDate(date) {
  if (!date) return '';
  try {
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d)) return '';
    const out = d.toLocaleDateString('es-ES', {
      timeZone: TIMEZONE_MADRID,
      weekday: 'long',
      day: 'numeric',
      month: 'long'
    });
    return out.charAt(0).toUpperCase() + out.slice(1);
  } catch (_) {
    return '';
  }
}

function _sumarMinutos(date, minutos) {
  if (!date) return null;
  const d = date instanceof Date ? new Date(date.getTime()) : new Date(date);
  if (isNaN(d)) return null;
  d.setMinutes(d.getMinutes() + (Number(minutos) || 0));
  return d;
}

export const getProximasCitasCliente = webMethod(Permissions.Anyone, async (payload) => {
  try {
    const { contactId, dias } = payload || {};
    if (!contactId || !isGuid(contactId)) throw new Error('contactId requerido');

    const ventana = Number.isInteger(dias) && dias > 0 && dias <= 90
      ? dias
      : DIAS_FUTURO_PROXIMAS;

    console.log(`${TAG} getProximasCitasCliente V2: ${contactId} (${ventana} días)`);

    const ahora = new Date();
    const limite = new Date(ahora.getTime() + ventana * 24 * 60 * 60 * 1000);

    const r = await wixData.query(COLLECTION_RESERVATIONS_V2)
      .eq('contactId', contactId)
      .ge('fechaReserva', ahora)
      .le('fechaReserva', limite)
      .ne('status', 'CANCELADA')
      .ascending('fechaReserva')
      .limit(50)
      .find({ suppressAuth: true });

    const items = r?.items || [];

    const proximas = items.map((it, idx) => {
      const fechaIni = it.fechaReserva instanceof Date
        ? it.fechaReserva
        : new Date(it.fechaReserva);

      const duracion = Number(it.duracionTotal || 0);
      const fechaFin = _sumarMinutos(fechaIni, duracion);

      const tituloRaw = String(it.title || 'Cita');
      const tituloLimpio = tituloRaw.split(' — ')[0] || tituloRaw;

      return {
        id:           it._id || `prox_${idx}`,
        titulo:       tituloLimpio,
        fecha:        _fechaLargaMadridDeDate(fechaIni),
        fechaISO:     _diaMadridDeDate(fechaIni),
        horaInicio:   _horaMadridDeDate(fechaIni),
        horaFin:      fechaFin ? _horaMadridDeDate(fechaFin) : '',
        staff:        normalizarStaff(it.staffName || ''),
        staffId:      it.staffId || '',
        family:       it.family || '',
        precioTotal:  Number(it.precioTotal || 0),
        status:       it.status || 'CONFIRMADA',
        duracionTotal: duracion,
        tipo:         'salon'
      };
    });

    console.log(`${TAG} getProximasCitasCliente V2 OK: ${proximas.length} citas`);

    return {
      ok: true,
      version: VERSION,
      proximas,
      debug: {
        fuente: COLLECTION_RESERVATIONS_V2,
        ventana,
        total: items.length
      }
    };

  } catch (e) {
    console.error(`${TAG} getProximasCitasCliente V2 ERROR:`, e);
    return { ok: false, version: VERSION, error: safeErr(e), proximas: [] };
  }
});

// =====================================================
// v1.9.10 — crearContactoCRM
// =====================================================
// Alta de contacto en Wix CRM desde el widget CRM Ficha Cliente.
// Patrón replicado literalmente de:
//   · recepcionProLogic.web v1.0.37 ensureContactInCRM (líneas 1240-1268)
//     — createContact con { allowDuplicates, suppressAuth }.
//   · Guía Técnica V2.0 §32.1 — extendedFields plano ('custom.sexo').
//   · lopdClientes.web v1.2.0 (bitácora 20-jun-2026) — mismo patrón
//     validado en producción para dirección + sexo.
// Reutiliza formatearContacto ya existente (línea ~832) para devolver
// el mismo shape que el resto del backend CRM.
// =====================================================

export const crearContactoCRM = webMethod(Permissions.Anyone, async (payload) => {
  try {
    const {
      nombre,
      apellido,
      telefono,
      email,
      fechaNacimiento, // opcional — nativo Wix (contactInfo.birthdate)
      sexo,            // opcional — extendedFields['custom.sexo']
      allowDuplicates  // opcional — por defecto false; el widget lo activa tras aviso
    } = payload || {};

    console.log(`${TAG} crearContactoCRM: nombre="${nombre||''}" tel="${telefono||''}" email="${email||''}"`);

    // ── Validación mínima (misma regla que Recepción PRO): NOMBRE + (email O teléfono) ──
    const nName = String(nombre || '').trim();
    const nApe  = String(apellido || '').trim();
    const nTel  = String(telefono || '').trim();
    const nMail = String(email || '').trim();
    if (!nName) {
      return {
        ok: false, version: VERSION,
        error: { code: 'INVALID_INPUT', message: 'Nombre obligatorio' }
      };
    }
    if (!nTel && !nMail) {
      return {
        ok: false, version: VERSION,
        error: { code: 'INVALID_INPUT', message: 'Debe indicar al menos email o teléfono' }
      };
    }

    // ── Construir contactInfo (patrón oficial Guía V2.0 §32.1) ──
    const contactInfo = { name: { first: nName, last: nApe } };
    if (nMail) contactInfo.emails = [{ tag: 'MAIN',   email: nMail }];
    if (nTel)  contactInfo.phones = [{ tag: 'MOBILE', phone: nTel  }];

    // ── fechaNacimiento (campo NATIVO Wix Contacts) ──
    // Reutiliza el mismo normalizador que actualizarContactoCRM.
    if (fechaNacimiento !== undefined && fechaNacimiento !== null && fechaNacimiento !== '') {
      const norm = normalizarFechaNacimientoParaEscribir(fechaNacimiento);
      if (norm.ok && norm.valor) {
        contactInfo.birthdate = norm.valor;
      } else {
        console.warn(`${TAG} crearContactoCRM: fechaNacimiento formato inesperado, ignorado: ${fechaNacimiento}`);
      }
    }

    // ── sexo (extendedFields plano — patrón §32.1) ──
    // No pasa por resolverKeyCampoCRM porque, al ser un contacto nuevo,
    // no hay contactId todavía para leer sus extendedFields; y la clave
    // canónica 'custom.sexo' está confirmada en Guía V2.0 y en
    // lopdClientes.web v1.2.0.
    const nSexo = String(sexo || '').trim();
    if (nSexo) {
      contactInfo.extendedFields = { 'custom.sexo': nSexo };
    }

    // ── createContact — patrón validado producción ──
    const elevatedCreate = elevate(contacts.createContact);
    let created;
    try {
      created = await elevatedCreate(contactInfo, {
        allowDuplicates: allowDuplicates === true,
        suppressAuth: true
      });
    } catch (createErr) {
      // v1.9.11 — Detección estructurada (NO regex sobre message crudo):
      // se lee applicationError.code. Cuando Wix devuelve
      // DUPLICATE_CONTACT_EXISTS es porque hay otro contacto con el
      // MISMO TELÉFONO (email duplicado lo rechaza Wix con otro flujo).
      // NO se propaga el texto Wix en inglés al widget: el widget usa
      // siempre su propio texto fijo en español para el aviso al operador.
      const appErr = createErr && createErr.details && createErr.details.applicationError;
      const code   = appErr && appErr.code;
      const data   = appErr && appErr.data;
      const rawMsg = String(createErr && createErr.message || '');
      console.warn(`${TAG} crearContactoCRM: excepción capturada · code="${code || '-'}" · dupPhone="${(data && data.duplicatePhone) || '-'}" · dupContactId="${(data && data.duplicateContactId) || '-'}" · raw="${rawMsg}"`);
      if (code === 'DUPLICATE_CONTACT_EXISTS') {
        return { ok: false, version: VERSION, error: { code: 'DUPLICATE_PHONE' } };
      }
      return { ok: false, version: VERSION, error: { code: 'CREATE_FAILED' } };
    }

    // Wix puede devolver el contacto directamente o dentro de .contact
    const createdContact = created?.contact || created;
    const newId = createdContact?._id || createdContact?.id || null;
    if (!newId) {
      // v1.9.11 — sin message para evitar exposición en UI
      console.warn(`${TAG} crearContactoCRM: Wix no devolvió _id del nuevo contacto`);
      return { ok: false, version: VERSION, error: { code: 'CREATE_FAILED' } };
    }

    console.log(`${TAG} crearContactoCRM OK: ${newId} | nombre="${nName}" apellido="${nApe}"`);

    return {
      ok: true,
      version: VERSION,
      contactId: newId,
      cliente: formatearContacto(createdContact)
    };

  } catch (e) {
    // v1.9.11 — safeErr expone details.applicationError (texto Wix +
    // duplicateContactId/duplicatePhone). Nunca se propaga al widget.
    // El detalle queda en console.error para depuración.
    console.error(`${TAG} crearContactoCRM ERROR:`, e);
    return { ok: false, version: VERSION, error: { code: 'CREATE_FAILED' } };
  }
});