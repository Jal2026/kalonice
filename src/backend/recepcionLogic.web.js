// =====================================================
// KAMISUITE - Backend recepcionLogic.web RecepciÃƒÂ³n (BÃƒÂºsqueda Clientes)
// =====================================================
// VERSION: 2.1.0
// FECHA: 29 de abril de 2026
//
// Carga completa de contactos para cache en frontend
//
// CAMBIOS v2.1.0:
// - NEW: editarContacto() — edita nombre, apellido, email, telefono
//   de un contacto existente en Wix CRM. Primera vez que KAMISUITE
//   permite editar clientes desde el frontend (independencia de Wix panel).
// =====================================================

import { webMethod, Permissions } from 'wix-web-module';
import { elevate } from 'wix-auth';
import { contacts } from 'wix-crm-backend';

const VERSION = '2.1.0';
const TAG = `[Recepcion][${VERSION}]`;

// =====================================================
// UTILIDADES
// =====================================================

function safeErr(e) {
  const out = { name: e?.name || 'Error', message: e?.message || String(e) };
  if (e?.details) out.details = e.details;
  return out;
}

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

// =====================================================
// CARGAR TODOS LOS CONTACTOS (para cachÃƒÂ©)
// =====================================================

export const cargarTodosContactos = webMethod(Permissions.Anyone, async () => {
  try {
    console.log(`${TAG} Ã°Å¸â€œÂ¥ Cargando TODOS los contactos...`);
    
    const elevatedQuery = elevate(contacts.queryContacts);
    const allContacts = [];
    let hasMore = true;
    let skip = 0;
    const pageSize = 1000;
    
    while (hasMore) {
      console.log(`${TAG} Ã°Å¸â€œâ€ž PÃƒÂ¡gina desde ${skip}...`);
      
      const result = await elevatedQuery()
        .skip(skip)
        .limit(pageSize)
        .find();
      
      const items = result?.items || [];
      allContacts.push(...items);
      
      console.log(`${TAG} Ã¢Å“â€¦ Obtenidos: ${items.length} (total acumulado: ${allContacts.length})`);
      
      if (items.length < pageSize) {
        hasMore = false;
      } else {
        skip += pageSize;
      }
      
      if (skip >= 10000) {
        console.warn(`${TAG} Ã¢Å¡Â Ã¯Â¸Â LÃƒÂ­mite de seguridad alcanzado (10,000)`);
        hasMore = false;
      }
    }
    
    console.log(`${TAG} Ã°Å¸â€œÅ  Total contactos cargados: ${allContacts.length}`);
    
    const clientes = allContacts
      .map(formatearContacto)
      .filter(c => c.nombre || c.apellido || c.email)
      .sort((a, b) => a.nombreCompleto.localeCompare(b.nombreCompleto));
    
    console.log(`${TAG} Ã¢Å“â€¦ Contactos formateados: ${clientes.length}`);
    
    return {
      ok: true,
      version: VERSION,
      clientes,
      total: clientes.length
    };
    
  } catch (e) {
    console.error(`${TAG} Ã¢ÂÅ’ Error cargarTodosContactos:`, e);
    return { ok: false, version: VERSION, error: safeErr(e) };
  }
});

// =====================================================
// OBTENER CONTACTO ESPECÃƒÂFICO
// =====================================================

export const getContacto = webMethod(Permissions.Anyone, async (payload) => {
  try {
    const { contactId } = payload || {};
    
    console.log(`${TAG} Ã°Å¸â€œâ€¡ Obteniendo contacto: ${contactId}`);
    
    if (!contactId) {
      throw new Error('contactId requerido');
    }
    
    const elevatedGet = elevate(contacts.getContact);
    const contact = await elevatedGet(contactId);
    
    if (!contact) {
      throw new Error('Contacto no encontrado');
    }
    
    return {
      ok: true,
      version: VERSION,
      cliente: formatearContacto(contact)
    };
    
  } catch (e) {
    console.error(`${TAG} Ã¢ÂÅ’ Error getContacto:`, e);
    return { ok: false, version: VERSION, error: safeErr(e) };
  }
});

// =====================================================
// CREAR CONTACTO (para clientes nuevos)
// =====================================================

export const crearContacto = webMethod(Permissions.Anyone, async (payload) => {
  try {
    const { nombre, apellido, email, telefono } = payload || {};
    
    console.log(`${TAG} Ã¢Å¾â€¢ Creando contacto: ${nombre} ${apellido}`);
    
    if (!nombre) {
      throw new Error('Nombre es requerido');
    }
    
    const contactInfo = {
      name: {
        first: String(nombre).trim(),
        last: String(apellido || '').trim()
      },
      emails: email ? [{ email: String(email).trim() }] : [],
      phones: telefono ? [{ phone: String(telefono).trim() }] : []
    };
    
    const elevatedCreate = elevate(contacts.createContact);
    const newContact = await elevatedCreate(contactInfo, { allowDuplicates: true, suppressAuth: true });
    
    const contactId = newContact?._id || newContact?.id;
    
    console.log(`${TAG} Ã¢Å“â€¦ Contacto creado: ${contactId}`);
    
    return {
      ok: true,
      version: VERSION,
      contactId,
      cliente: {
        contactId,
        nombre,
        apellido,
        nombreCompleto: `${nombre} ${apellido}`.trim(),
        email: email || '',
        telefono: telefono || ''
      }
    };
    
  } catch (e) {
    console.error(`${TAG} Ã¢ÂÅ’ Error crearContacto:`, e);
    return { ok: false, version: VERSION, error: safeErr(e) };
  }
});

// =====================================================
// EDITAR CONTACTO (v2.1.0)
// Actualiza nombre, apellido, email, telefono de un contacto CRM.
// Obtiene revision actual -> actualiza -> devuelve contacto formateado.
// =====================================================

export const editarContacto = webMethod(Permissions.Anyone, async (payload) => {
  try {
    const { contactId, nombre, apellido, email, telefono } = payload || {};

    console.log(`${TAG} editarContacto: ${contactId} -> ${nombre} ${apellido}`);

    if (!contactId) throw new Error('contactId requerido');
    if (!nombre) throw new Error('Nombre es requerido');

    // 1) Obtener contacto actual para revision
    const elevatedGet = elevate(contacts.getContact);
    const current = await elevatedGet(contactId);

    if (!current || !current.revision) {
      throw new Error('Contacto no encontrado o sin revision');
    }

    // 2) Construir datos de actualizacion
    const contactInfo = {
      name: {
        first: String(nombre).trim(),
        last: String(apellido || '').trim()
      }
    };

    const newEmail = String(email || '').trim();
    if (newEmail) {
      contactInfo.emails = [{ email: newEmail }];
    }

    const newPhone = String(telefono || '').trim();
    if (newPhone) {
      contactInfo.phones = [{ phone: newPhone }];
    }

    // 3) Actualizar
    const identifiers = { contactId, revision: current.revision };
    const elevatedUpdate = elevate(contacts.updateContact);
    const updated = await elevatedUpdate(identifiers, contactInfo, { suppressAuth: true });

    const result = updated?.contact || updated;
    console.log(`${TAG} Contacto editado: ${contactId}`);

    return {
      ok: true,
      version: VERSION,
      cliente: formatearContacto(result)
    };

  } catch (e) {
    console.error(`${TAG} Error editarContacto:`, e);
    return { ok: false, version: VERSION, error: safeErr(e) };
  }
});