// =====================================================
// KAMISUITE — Buscador de contactId (utilidad backoffice)
// =====================================================
// VERSION: 1.2.0
// FECHA: 30 de julio de 2026
// ARCHIVO: backend/contactLookup.web.js
//
// v1.2.0 — Coincidencia DIFUSA en el lote: cuando un nombre no casa exacto,
//   devuelve SUGERENCIAS (parecidos) con % — apodos (Mari→María), iniciales
//   (M.→María), prefijos (Puri→Purificación), apellido de más/menos y erratas
//   (Levenshtein). Nuevo estado 'sugerencia'. Umbral 0.70, top 4 por fila.
// v1.1.0 — Añadido buscarContactoIdLote(): resuelve una LISTA de una vez
//   (array de nombres o de objetos {nombre,telefono,email}). Vuelca la CRM
//   una sola vez y cruza en memoria; marca cada fila como ok/ambiguo/
//   no_encontrado. Cruce por email (fiable) > teléfono > nombre. El cruce
//   por nombre es orden-independiente pero COLISIONA (nombres repetidos =
//   ambiguo); con email por fila el resultado es 1:1.
//
// Buscador PUNTUAL de contactId de Wix CRM por nombre, teléfono o email.
// Pensado para resolver el dueño de bonos importados (Excel de software
// anterior) sin ir de uno en uno por el panel de Wix.
//
// PATRONES COPIADOS (no inventados) de funciones ya en producción:
//   · formatearContacto → recepcionLogic.web.js
//   · query por email (info.emails.email) → hairAssessmentLogic.web.js
//   · query por nombre (info.name.first/last) → akiraAcciones.web.js
//   · teléfono: Wix CRM NO permite query directo por phone; se vuelca
//     paginado y se cruza en JS (coloracionLogic.web.js). Cruce por los
//     últimos 9 dígitos (móvil ES) para tolerar +34/espacios/guiones
//     (patrón slice(-9) de http-functions.js).
//
// MULTI-TENANT: cero hardcoding. Consulta la CRM DEL SITIO donde corre.
//   → Para resolver contactos de KALÓNICE, desplegar en el Velo de KALÓNICE.
//
// CMS: no requiere ninguna colección nueva (lee Wix Contacts).
// =====================================================

import { webMethod, Permissions } from 'wix-web-module';
import { elevate } from 'wix-auth';
import { contacts } from 'wix-crm-backend';

const VERSION = '1.0.0';
const TAG = `[ContactLookup][${VERSION}]`;

function safeErr(e) {
  return { name: e?.name || 'Error', message: e?.message || String(e) };
}

// Extractor de contacto — mismo patrón que recepcionLogic.formatearContacto
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

// Últimos 9 dígitos para cruzar teléfonos con formatos distintos.
function tel9(tel) {
  const d = String(tel || '').replace(/\D/g, '');
  return d.length >= 9 ? d.slice(-9) : d;
}

// Normaliza nombre: minúsculas, sin acentos, espacios colapsados.
function normNombre(s) {
  return String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

// Clave de nombre ORDEN-INDEPENDIENTE (tokens ordenados alfabéticamente):
// así "María García" y "García, María" cruzan igual.
function nombreKey(s) {
  const n = normNombre(s);
  if (!n) return '';
  return n.split(' ').filter(Boolean).sort().join(' ');
}

// ---- Coincidencia DIFUSA (para sugerencias cuando no hay match exacto) ----

// Apodos/diminutivos comunes → forma canónica (solo tokens 1:1).
const NICK = {
  mari: 'maria', meri: 'maria', mery: 'maria', cuca: 'maria',
  charo: 'rosario', lola: 'dolores', pili: 'pilar', conchi: 'concepcion',
  concha: 'concepcion', tere: 'teresa', chelo: 'consuelo', pepe: 'jose',
  paco: 'francisco', curro: 'francisco', nacho: 'ignacio', quique: 'enrique',
  kike: 'enrique', puri: 'purificacion', inma: 'inmaculada', montse: 'montserrat',
  toni: 'antonio', chus: 'jesus', susi: 'susana'
};
function canonTok(t) { return NICK[t] || t; }

function lev(a, b) {
  a = a || ''; b = b || '';
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[n];
}

// Parecido entre dos tokens de nombre (0..1): apodo / inicial / prefijo / edición.
function tokenSim(a, b) {
  const ca = canonTok(a), cb = canonTok(b);
  if (ca === cb) return 1;
  if (a === b) return 1;
  if ((a.length === 1 && b.startsWith(a)) || (b.length === 1 && a.startsWith(b))) return 0.85; // "M." → "Maria"
  const min = Math.min(a.length, b.length);
  if (min >= 2 && (a.startsWith(b) || b.startsWith(a))) return 0.92; // Mari/Maria, Puri/Puri...
  const maxLen = Math.max(a.length, b.length);
  return 1 - lev(a, b) / maxLen;
}

// Score de parecido entre dos nombres ya tokenizados (0..1).
function nameScore(inTokens, cTokens) {
  if (!inTokens.length || !cTokens.length) return 0;
  const short = inTokens.length <= cTokens.length ? inTokens : cTokens;
  const long = inTokens.length <= cTokens.length ? cTokens : inTokens;
  let sum = 0;
  for (const st of short) {
    let best = 0;
    for (const lt of long) { const s = tokenSim(st, lt); if (s > best) best = s; }
    sum += best;
  }
  const base = sum / short.length;                 // encaje de los tokens del nombre corto
  const lenPenalty = short.length / long.length;   // penaliza sobra de tokens
  return base * (0.6 + 0.4 * lenPenalty);
}

const FUZZY_MIN = 0.70;   // umbral de sugerencia
const FUZZY_TOP = 4;      // máximo de candidatos por fila

// buscarContactoId({ nombre, telefono, email })
//   Devuelve TODOS los contactos que casen (puede haber varios: nombres
//   que colisionan, emails genéricos que fusionan contactos, etc.).
//   → { ok, total, matches: [{ contactId, nombre, apellido, nombreCompleto,
//                              email, telefono, coincidePor }] }
export const buscarContactoId = webMethod(Permissions.Anyone, async (payload) => {
  try {
    const nombre = String(payload?.nombre || '').trim();
    const telefono = String(payload?.telefono || '').trim();
    const email = String(payload?.email || '').trim().toLowerCase();

    if (!nombre && !telefono && !email) {
      return { ok: false, version: VERSION, error: { message: 'Introduce nombre, teléfono o email' } };
    }

    const elevatedQuery = elevate(contacts.queryContacts);
    const encontrados = new Map(); // contactId -> objeto formateado

    // 1) EMAIL — Wix sí permite eq por info.emails.email
    if (email) {
      try {
        const r = await elevatedQuery().eq('info.emails.email', email).limit(50).find();
        for (const c of (r?.items || [])) {
          const f = formatearContacto(c);
          if (f.contactId) encontrados.set(f.contactId, { ...f, coincidePor: 'email' });
        }
      } catch (e) { console.warn(`${TAG} email: ${e.message}`); }
    }

    // 2) NOMBRE — eq por info.name.first [+ info.name.last]
    if (nombre) {
      try {
        const partes = nombre.split(/\s+/);
        const first = partes[0] || '';
        const last = partes.slice(1).join(' ').trim();
        let q = elevatedQuery().eq('info.name.first', first);
        if (last) q = q.eq('info.name.last', last);
        const r = await q.limit(50).find();
        for (const c of (r?.items || [])) {
          const f = formatearContacto(c);
          if (f.contactId && !encontrados.has(f.contactId)) {
            encontrados.set(f.contactId, { ...f, coincidePor: 'nombre' });
          }
        }
      } catch (e) { console.warn(`${TAG} nombre: ${e.message}`); }
    }

    // 3) TELÉFONO — Wix NO permite query por phone (ver coloracionLogic).
    //    Volcado paginado + cruce por últimos 9 dígitos.
    if (telefono) {
      const objetivo = tel9(telefono);
      if (objetivo.length >= 6) {
        try {
          let skip = 0;
          const pageSize = 1000;
          let hasMore = true;
          while (hasMore) {
            const r = await elevatedQuery().skip(skip).limit(pageSize).find();
            const items = r?.items || [];
            for (const c of items) {
              const phones = Array.isArray(c?.info?.phones) ? c.info.phones : [];
              const match = phones.some(p => tel9(p?.phone || p) === objetivo);
              if (match) {
                const f = formatearContacto(c);
                if (f.contactId && !encontrados.has(f.contactId)) {
                  encontrados.set(f.contactId, { ...f, coincidePor: 'telefono' });
                }
              }
            }
            if (items.length < pageSize) hasMore = false;
            else skip += pageSize;
            if (skip >= 10000) hasMore = false; // tope de seguridad
          }
        } catch (e) { console.warn(`${TAG} telefono: ${e.message}`); }
      }
    }

    const matches = Array.from(encontrados.values());
    console.log(`${TAG} 🔎 n="${nombre}" t="${telefono}" e="${email}" → ${matches.length} match(es)`);
    return { ok: true, version: VERSION, total: matches.length, matches };

  } catch (e) {
    console.error(`${TAG} ❌ buscarContactoId:`, e);
    return { ok: false, version: VERSION, error: safeErr(e) };
  }
});

// buscarContactoIdLote({ items: [ ... ] })
//   items puede ser un array de STRINGS (nombres) o de OBJETOS
//   { nombre?, telefono?, email? }. Se vuelca la CRM UNA sola vez y se cruza
//   todo en memoria (eficiente para listas largas).
//   Prioridad de cruce por fila: email (fiable) > teléfono > nombre.
//   → { ok, resumen:{total,ok,ambiguo,no_encontrado}, resultados:[
//        { entrada, nombre, telefono, email, estado, matches:[...] } ] }
//   estado: 'ok' (1 match) · 'ambiguo' (>1) · 'no_encontrado' (0)
export const buscarContactoIdLote = webMethod(Permissions.Anyone, async (payload) => {
  try {
    const items = payload && Array.isArray(payload.items) ? payload.items : null;
    if (!items || items.length === 0) {
      return { ok: false, version: VERSION, error: { message: 'Payload sin items[] o vacío' } };
    }

    // Normalizar cada entrada.
    const entradas = items.map((it) => {
      if (typeof it === 'string') {
        return { nombre: it.trim(), telefono: '', email: '', raw: it };
      }
      const nombre = String(it?.nombre || it?.name || '').trim();
      const telefono = String(it?.telefono || it?.phone || '').trim();
      const email = String(it?.email || '').trim().toLowerCase();
      return { nombre, telefono, email, raw: nombre || email || telefono || JSON.stringify(it) };
    });

    // Volcado ÚNICO de toda la CRM.
    const elevatedQuery = elevate(contacts.queryContacts);
    const todos = [];
    let skip = 0;
    const pageSize = 1000;
    let hasMore = true;
    let truncado = false;
    while (hasMore) {
      const r = await elevatedQuery().skip(skip).limit(pageSize).find();
      const its = r?.items || [];
      for (const c of its) todos.push(formatearContacto(c));
      if (its.length < pageSize) hasMore = false;
      else skip += pageSize;
      if (skip >= 20000) { hasMore = false; truncado = true; } // tope de seguridad
    }

    // Índices en memoria.
    const porEmail = new Map();   // email(lower)  -> [contactos]
    const porTel = new Map();     // tel9          -> [contactos]
    const porNombre = new Map();  // nombreKey     -> [contactos]
    for (const c of todos) {
      if (c.email) {
        const k = c.email.toLowerCase();
        if (!porEmail.has(k)) porEmail.set(k, []);
        porEmail.get(k).push(c);
      }
      if (c.telefono) {
        const k = tel9(c.telefono);
        if (k) { if (!porTel.has(k)) porTel.set(k, []); porTel.get(k).push(c); }
      }
      const nk = nombreKey(c.nombreCompleto);
      if (nk) { if (!porNombre.has(nk)) porNombre.set(nk, []); porNombre.get(nk).push(c); }
    }

    // Tokens normalizados por contacto (para el cruce difuso).
    const tokensList = todos.map((c) => ({
      c, tokens: normNombre(c.nombreCompleto).split(' ').filter(Boolean)
    })).filter((x) => x.tokens.length);

    // Cruce por fila.
    const resultados = entradas.map((e) => {
      const encontrados = new Map();
      if (e.email && porEmail.has(e.email)) {
        for (const c of porEmail.get(e.email)) encontrados.set(c.contactId, { ...c, coincidePor: 'email' });
      }
      if (e.telefono) {
        const k = tel9(e.telefono);
        if (k && porTel.has(k)) {
          for (const c of porTel.get(k)) if (!encontrados.has(c.contactId)) encontrados.set(c.contactId, { ...c, coincidePor: 'telefono' });
        }
      }
      if (e.nombre) {
        const nk = nombreKey(e.nombre);
        if (nk && porNombre.has(nk)) {
          for (const c of porNombre.get(nk)) if (!encontrados.has(c.contactId)) encontrados.set(c.contactId, { ...c, coincidePor: 'nombre' });
        }
      }
      const matches = Array.from(encontrados.values());

      let estado = 'no_encontrado';
      if (matches.length === 1) estado = 'ok';
      else if (matches.length > 1) estado = 'ambiguo';

      // Sin match exacto pero con nombre → SUGERENCIAS difusas (parecidos).
      let sugerencias = [];
      if (matches.length === 0 && e.nombre) {
        const inTok = normNombre(e.nombre).split(' ').filter(Boolean);
        if (inTok.length) {
          const scored = [];
          for (const x of tokensList) {
            const sc = nameScore(inTok, x.tokens);
            if (sc >= FUZZY_MIN) scored.push({ ...x.c, score: Math.round(sc * 100), coincidePor: 'sugerencia' });
          }
          scored.sort((a, b) => b.score - a.score);
          sugerencias = scored.slice(0, FUZZY_TOP);
          if (sugerencias.length) estado = 'sugerencia';
        }
      }

      return { entrada: e.raw, nombre: e.nombre, telefono: e.telefono, email: e.email, estado, matches, sugerencias };
    });

    const resumen = {
      total: resultados.length,
      ok: resultados.filter(r => r.estado === 'ok').length,
      ambiguo: resultados.filter(r => r.estado === 'ambiguo').length,
      sugerencia: resultados.filter(r => r.estado === 'sugerencia').length,
      no_encontrado: resultados.filter(r => r.estado === 'no_encontrado').length
    };
    console.log(`${TAG} 📋 lote: ${resumen.total} · ${resumen.ok} ok · ${resumen.ambiguo} amb · ${resumen.sugerencia} sug · ${resumen.no_encontrado} sin · CRM=${todos.length}${truncado ? ' (TRUNC 20k)' : ''}`);
    return { ok: true, version: VERSION, truncado, totalContactosCRM: todos.length, resumen, resultados };

  } catch (e) {
    console.error(`${TAG} ❌ buscarContactoIdLote:`, e);
    return { ok: false, version: VERSION, error: safeErr(e) };
  }
});
