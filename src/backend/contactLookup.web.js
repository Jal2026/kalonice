// =====================================================
// KAMISUITE — Buscador de contactId (utilidad backoffice)
// =====================================================
// VERSION: 1.0.0
// FECHA: 30 de julio de 2026
// ARCHIVO: backend/contactLookup.web.js
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
