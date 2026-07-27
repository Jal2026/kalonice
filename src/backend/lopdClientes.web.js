// =====================================================
// backend/lopdClientes.web.js
// VERSION: v1.2.0
// CHANGELOG:
//   v1.2.0 (20 Jun 2026)
//     · Migrado a wix-crm-backend (V1), patrón idéntico a
//       marisaBilling.web.js (producción, escribe direcciones OK).
//     · createContact: name/emails/phones/addresses como ARRAY DIRECTO
//       (sin {items:[...]}). Dirección: addresses[].address con
//       streetAddress.name + formatted. Sexo en extendedFields plano.
//     · Todo en una sola llamada createContact — ya no hay segunda
//       llamada updateContact para sexo/dirección.
//     · Resuelve "Expected an object" (BAD_REQUEST) por mezcla v2/V1.
//   v1.1.0 — intento previo (mezcla v2 + addresses V1) — descartado.
//   v1.0.0 — versión inicial.
// =====================================================
import wixData from 'wix-data';
import { mediaManager } from 'wix-media-backend';
import { Permissions, webMethod } from 'wix-web-module';
import { elevate } from 'wix-auth';
import { contacts } from 'wix-crm-backend';

const VERSION = 'v1.2.0';

const COLLECTION_ID = 'ClientLopdSignatures';
const SALON_CONFIG_COLLECTION_ID = 'SalonConfig';
const MEDIA_FOLDER = '/firmas-lopd';
const SEXO_FIELD_KEY = 'custom.sexo';

export const obtenerLegalSalon = webMethod(
  Permissions.Anyone,
  async () => {
    try {
      const result = await wixData.query(SALON_CONFIG_COLLECTION_ID)
        .limit(1)
        .find({ suppressAuth: true });

      const config = result.items?.[0] || {};

      return {
        ok: true,
        privacyPolicyUrl: config.privacyPolicyUrl || '',
        termsConditionsUrl: config.termsConditionsUrl || '',
        brandName: config.brandName || '',
        legalName: config.legalName || ''
      };

    } catch (error) {
      console.error('[LOPD] obtenerLegalSalon ERROR:', error);

      return {
        ok: false,
        privacyPolicyUrl: '',
        termsConditionsUrl: '',
        brandName: '',
        legalName: '',
        message: error.message || 'No se pudo leer SalonConfig'
      };
    }
  }
);

export const registrarAltaLopd = webMethod(
  Permissions.Anyone,
  async (payload) => {
    try {
      validarPayload(payload);

      const contactId = await crearContactoWix(payload);

      const firmaImagen = await subirFirmaPng(payload.firmaDataUrl, contactId);

      const item = {
        title: `LOPD ${payload.firstName || ''} ${payload.lastName || ''}`.trim(),
        contactId,
        fechaFirma: new Date(),
        firmaImagen,
        textoLopd: payload.textoLopd,
        aceptaPrivacidad: payload.aceptaPrivacidad === true,
        aceptaTerminos: payload.aceptaTerminos === true,
        aceptaComunicaciones: payload.aceptaComunicaciones === true,
        origenFirma: payload.origenFirma || 'recepcion',
        estado: payload.estado || 'vigente'
      };

      const saved = await wixData.insert(COLLECTION_ID, item, { suppressAuth: true });

      return {
        ok: true,
        contactId,
        consentId: saved._id,
        firmaImagen
      };

    } catch (error) {
      console.error('[LOPD] registrarAltaLopd ERROR:', error);

      return {
        ok: false,
        message: error.message || 'Error guardando alta LOPD'
      };
    }
  }
);

function validarPayload(payload) {
  if (!payload) throw new Error('Payload vacío');
  if (!payload.firstName || !String(payload.firstName).trim()) throw new Error('Nombre requerido');
  if (!payload.phone || !String(payload.phone).trim()) throw new Error('Teléfono requerido');
  if (payload.aceptaPrivacidad !== true) throw new Error('Privacidad no aceptada');
  if (payload.aceptaTerminos !== true) throw new Error('Términos y Condiciones no aceptados');

  if (!payload.firmaDataUrl || !payload.firmaDataUrl.startsWith('data:image/png;base64,')) {
    throw new Error('Firma PNG requerida');
  }

  if (!payload.textoLopd || !String(payload.textoLopd).trim()) {
    throw new Error('Texto LOPD requerido');
  }
}

// Patrón V1 idéntico a marisaBilling.web.js crearContacto (producción).
// name/emails/phones/addresses como array directo. extendedFields plano.
async function crearContactoWix(payload) {
  const telefono = normalizarTelefono(payload.phone);
  const email = String(payload.email || '').trim();
  const direccion = String(payload.direccion || '').trim();
  const sexo = String(payload.sexo || '').trim();

  const contactInfo = {
    name: {
      first: String(payload.firstName || '').trim(),
      last: String(payload.lastName || '').trim()
    },
    emails: email ? [{ email: email.toLowerCase() }] : [],
    phones: telefono ? [{ phone: telefono }] : [],
    extendedFields: {}
  };

  if (direccion) {
    contactInfo.addresses = [
      { tag: 'HOME', address: { streetAddress: { name: direccion }, formatted: direccion } }
    ];
  }

  if (sexo) {
    contactInfo.extendedFields[SEXO_FIELD_KEY] = sexo;
  }

  const elevatedCreate = elevate(contacts.createContact);
  const newContact = await elevatedCreate(contactInfo, { allowDuplicates: true, suppressAuth: true });

  const contactId = newContact?._id || newContact?.id;

  if (!contactId) {
    console.error('[LOPD] createContact respuesta inesperada:', newContact);
    throw new Error('Wix Contacts no devolvió contactId');
  }

  console.log('[LOPD] Contacto Wix creado:', contactId, '| dir:', direccion ? 'sí' : 'no', '| sexo:', sexo ? 'sí' : 'no');

  return contactId;
}

async function subirFirmaPng(firmaDataUrl, contactId) {
  const base64 = firmaDataUrl.replace(/^data:image\/png;base64,/, '');
  const buffer = Buffer.from(base64, 'base64');
  const fileName = `firma-lopd-${contactId}-${Date.now()}.png`;

  const uploaded = await mediaManager.upload(
    MEDIA_FOLDER,
    buffer,
    fileName,
    {
      mediaOptions: {
        mimeType: 'image/png',
        mediaType: 'image'
      }
    }
  );

  const fileUrl =
    uploaded.fileUrl ||
    uploaded.url ||
    uploaded.media?.fileUrl;

  if (!fileUrl) {
    console.error('[LOPD] Respuesta upload inesperada:', uploaded);
    throw new Error('No se pudo obtener la URL de la firma');
  }

  return fileUrl;
}

function normalizarTelefono(phone) {
  return String(phone || '').replace(/\s+/g, '').trim();
}