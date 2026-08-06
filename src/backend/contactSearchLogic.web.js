// =====================================================
// KAMISUITE — Backend: Búsqueda de contactos server-side
// =====================================================
// VERSION: 1.0.0
// FECHA: 6 de agosto de 2026
// ARCHIVO: backend/contactSearchLogic.web.js
//
// v1.0.0: Búsqueda PUNTUAL de contactos contra Wix CRM, sin volcar la
//   agenda completa. Nace para eliminar los ~13 segundos que
//   `recepcionLogic.cargarTodosContactos` añadía a CADA carga de
//   Recepción Lite Mobile (medido en producción KALÓNICE 6-ago-2026:
//   5 páginas de 1.000, 4.619 contactos, 02:18:01 → 02:18:14).
//
//   PROBLEMA QUE RESUELVE:
//   Lite Mobile se usa en sesiones cortas desde el móvil. Cada vez que el
//   operador sale de la app y vuelve, Wix recarga la página. Con el
//   volcado completo, cada regreso costaba 13 s antes de poder buscar un
//   cliente. Descartada la opción de cachear el CRM en una colección CMS
//   (decisión de Jal 6-ago-2026: duplicar el CRM crea desincronización
//   permanente). Esta es la alternativa: no cachear nada y preguntar al
//   CRM solo por lo que se busca.
//
//   ARCHIVO NUEVO, NO SE TOCA NADA EXISTENTE:
//   `recepcionLogic.web.js` está en la lista negra de backends
//   compartidos (Conceptos Fundacionales §19: lo consumen Agenda PRO,
//   Reserva Inteligente, Cuidado y Salud, App Cuidado, Check-in Externos
//   y AKIRA). `cargarTodosContactos` queda intacta y sigue sirviendo a
//   todas esas superficies. Este backend es aditivo puro.
//
//   FILTROS SOPORTADOS POR queryContacts() — tabla oficial Wix
//   (dev.wix.com/docs/velo/apis/wix-crm-backend/contacts/sort-filter-and-search,
//   actualizada 26-nov-2025):
//     info.name.first    eq, ne, hasSome, startsWith, ascending, descending
//     info.name.last     eq, ne, hasSome, startsWith, ascending, descending
//     info.phones.phone  eq, ne, hasSome, startsWith
//     info.emails.email  eq, ne, hasSome, startsWith
//
//   NOTA: la cabecera de `contactLookup.web.js` v1.2.0 afirma que "Wix CRM
//   NO permite query directo por phone". Según la tabla oficial vigente,
//   `info.phones.phone` SÍ admite startsWith. Ese comentario está
//   desactualizado; no se toca ese archivo aquí.
//
//   LIMITACIONES ASUMIDAS (decisión de producto de Jal, 6-ago-2026):
//   1) startsWith es PREFIJO, no "contiene". Buscar "zalez" ya no
//      encuentra "González". Buscar "gonz" sí (se consulta el apellido
//      además del nombre).
//   2) startsWith es CASE-SENSITIVE (documentado por Wix: "TEXT" no
//      empieza por "tex"). Compensado aquí lanzando variantes de
//      capitalización en paralelo.
//   3) Los acentos se comparan letra a letra: "Jose" no encuentra "José".
//      "Jos" sí. NO compensable desde el código.
//   4) Teléfonos: si el CRM guarda "+34600123456" y se teclea
//      "600123456", el prefijo no casa. Compensado lanzando la variante
//      con el prefijo internacional en paralelo.
//
//   PATRONES COPIADOS (no inventados):
//     · formatearContacto → recepcionLogic.web.js v2.1.0 (literal)
//     · elevate(contacts.queryContacts) → recepcionLogic.web.js v2.1.0
//     · .startsWith sobre info.name.first/last → tabla oficial Wix
//     · Permissions.Anyone → mismo nivel que recepcionLogic.web.js, el
//       backend al que sustituye en esta pantalla. Ver nota al final.
//
//   POR QUÉ CONSULTAS EN PARALELO Y NO .or():
//   ContactsQueryBuilder expone .or(), pero no hay ni un solo uso de .or()
//   sobre queryContacts en el código de producción de KALÓNICE del que
//   copiar la sintaxis exacta. Se lanzan consultas independientes con
//   Promise.all y se fusionan en JS deduplicando por contactId. Mismo
//   resultado, cero sintaxis sin verificar.
//
// CMS: ninguno. Lee Wix Contacts.
// MULTI-TENANT: cero hardcoding. Consulta la CRM del sitio donde corre.
// =====================================================

import { webMethod, Permissions } from 'wix-web-module';
import { elevate } from 'wix-auth';
import { contacts } from 'wix-crm-backend';

const VERSION = '1.0.0';
const TAG = `[ContactSearch][${VERSION}]`;

// Nº máximo de resultados devueltos al frontend.
const MAX_RESULTS = 20;
// Nº máximo de resultados pedidos a CADA consulta parcial antes de fusionar.
const PER_QUERY_LIMIT = 25;
// Prefijo internacional por defecto para la variante de teléfono.
// No es hardcoding de salón: es el prefijo del país del número tecleado.
// Si el CRM guarda los teléfonos sin prefijo, la variante sin él ya se
// lanza igualmente, así que ambas formas quedan cubiertas.
const PHONE_INTL_PREFIX = '+34';

function safeErr(e) {
  const out = { name: e?.name || 'Error', message: e?.message || String(e) };
  if (e?.details) out.details = e.details;
  return out;
}

// Copia LITERAL de recepcionLogic.web.js v2.1.0 (líneas 31-51).
// Se duplica a propósito para no importar del backend de la lista negra.
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

// ¿La query parece un teléfono? Solo dígitos, espacios, guiones,
// paréntesis y el signo +. Al menos 3 dígitos para no disparar en "12".
function pareceTelefono(q) {
  const soloDigitos = q.replace(/[^\d]/g, '');
  if (soloDigitos.length < 3) return false;
  return /^[\d\s\-+()]+$/.test(q);
}

// Variantes de capitalización para compensar el case-sensitive de
// startsWith. "maria" → ["maria", "Maria"]; "MARIA" → ["MARIA", "Maria"].
// Se deduplica para no lanzar consultas idénticas.
function variantesCapitalizacion(q) {
  const lower = q.toLowerCase();
  const capitalizada = lower.charAt(0).toUpperCase() + lower.slice(1);
  const set = new Set([q, capitalizada, lower]);
  return Array.from(set).filter(Boolean);
}

// Variantes de teléfono: los dígitos tal cual y con prefijo internacional.
// Si el usuario ya tecleó el prefijo, se añade además la forma sin él.
function variantesTelefono(q) {
  const digitos = q.replace(/[^\d]/g, '');
  const set = new Set();
  if (digitos) {
    set.add(digitos);
    set.add(PHONE_INTL_PREFIX + digitos);
    // Si tecleó con prefijo (p.ej. 34600...), probar también sin él.
    const sinPrefijoPais = digitos.replace(/^34/, '');
    if (sinPrefijoPais && sinPrefijoPais !== digitos) {
      set.add(sinPrefijoPais);
      set.add(PHONE_INTL_PREFIX + sinPrefijoPais);
    }
  }
  // La forma literal tecleada (puede traer + y espacios).
  const literal = q.trim();
  if (literal) set.add(literal);
  return Array.from(set).filter(Boolean);
}

// =====================================================
// BÚSQUEDA RÁPIDA
//   payload: { query: string, limit?: number }
//   return : { ok, version, clientes[], total, modo, consultas }
// =====================================================
export const buscarContactosRapido = webMethod(Permissions.Anyone, async (payload) => {
  const t0 = Date.now();
  try {
    const raw = String(payload?.query || '').trim();
    const limit = Math.min(Number(payload?.limit) || MAX_RESULTS, 50);

    // Menos de 2 caracteres: no se consulta el CRM. Mismo umbral que el
    // buscador del widget (que ya no envía por debajo de 2, pero se
    // defiende igual aquí).
    if (raw.length < 2) {
      return { ok: true, version: VERSION, clientes: [], total: 0, modo: 'corto', consultas: 0 };
    }

    const elevatedQuery = elevate(contacts.queryContacts);
    const esTelefono = pareceTelefono(raw);
    const esEmail = raw.includes('@');

    // Construcción de las consultas parciales.
    // Cada entrada es una promesa independiente; se fusionan al final.
    const promesas = [];

    if (esTelefono) {
      for (const v of variantesTelefono(raw)) {
        promesas.push(
          elevatedQuery().startsWith('info.phones.phone', v).limit(PER_QUERY_LIMIT).find()
        );
      }
    } else if (esEmail) {
      for (const v of variantesCapitalizacion(raw)) {
        promesas.push(
          elevatedQuery().startsWith('info.emails.email', v).limit(PER_QUERY_LIMIT).find()
        );
      }
    } else {
      // Texto: nombre Y apellido, con variantes de capitalización.
      // Buscar en ambos campos es lo que permite que "gonz" encuentre a
      // "María González" pese a que startsWith sea prefijo.
      for (const v of variantesCapitalizacion(raw)) {
        promesas.push(
          elevatedQuery().startsWith('info.name.first', v).limit(PER_QUERY_LIMIT).find()
        );
        promesas.push(
          elevatedQuery().startsWith('info.name.last', v).limit(PER_QUERY_LIMIT).find()
        );
      }
      // Además, por si el operador teclea un email parcial sin @ todavía
      // o busca por dominio, se consulta el email con la forma literal.
      promesas.push(
        elevatedQuery().startsWith('info.emails.email', raw.toLowerCase()).limit(PER_QUERY_LIMIT).find()
      );
    }

    // allSettled: si una consulta parcial falla (campo no indexado en un
    // salón concreto, por ejemplo), las demás siguen sirviendo resultados.
    const resultados = await Promise.allSettled(promesas);

    const vistos = new Set();
    const clientes = [];
    let fallidas = 0;

    for (const r of resultados) {
      if (r.status !== 'fulfilled') { fallidas++; continue; }
      const items = r.value?.items || [];
      for (const c of items) {
        const f = formatearContacto(c);
        if (!f.contactId) continue;
        if (vistos.has(f.contactId)) continue;
        // Mismo filtro de calidad que cargarTodosContactos: descarta
        // contactos sin ningún dato identificable.
        if (!f.nombre && !f.apellido && !f.email) continue;
        vistos.add(f.contactId);
        clientes.push(f);
      }
    }

    clientes.sort((a, b) => a.nombreCompleto.localeCompare(b.nombreCompleto));
    const total = clientes.length;
    const recortados = clientes.slice(0, limit);

    const ms = ((Date.now() - t0) / 1000).toFixed(2);
    console.log(`${TAG} 🔎 "${raw}" (${esTelefono ? 'tel' : esEmail ? 'email' : 'texto'}): ${total} → ${recortados.length} · ${promesas.length} consultas${fallidas ? ` · ${fallidas} fallidas` : ''} · ${ms}s`);

    return {
      ok: true,
      version: VERSION,
      clientes: recortados,
      total,
      modo: esTelefono ? 'telefono' : (esEmail ? 'email' : 'texto'),
      consultas: promesas.length
    };
  } catch (e) {
    console.error(`${TAG} ❌ buscarContactosRapido:`, e?.message);
    return { ok: false, version: VERSION, error: safeErr(e), clientes: [], total: 0 };
  }
});

// =====================================================
// NOTA SOBRE PERMISOS
// =====================================================
// Se usa Permissions.Anyone + elevate(), replicando exactamente el nivel
// de `recepcionLogic.cargarTodosContactos` (Permissions.Anyone), que es la
// función a la que sustituye en esta pantalla y que lleva meses en
// producción sirviendo al mismo page code.
//
// La regla general del proyecto es Permissions.SiteMember para backends
// nuevos. Aquí se ha priorizado la paridad con el backend sustituido para
// no arriesgar un 403 en Recepción Lite Mobile, cuyo control de acceso es
// por PIN (ReceptionAccessLog) y no necesariamente por sesión de miembro
// de Wix. Si se confirma que el operador SIEMPRE es SiteMember en todos
// los salones, cambiar la línea del webMethod a Permissions.SiteMember es
// un cambio de una palabra.
// =====================================================
