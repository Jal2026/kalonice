// =====================================================
// KAMISUITE - Backend hairAssessmentLogic.web.js
// Módulo: Cuestionario Capilar (cara pública)
// =====================================================
// VERSION: 1.2.0
// FECHA: Abril 2026
//
// CHANGELOG:
//   v1.2.0 - NEW: consent flags en diagnosis JSON (consentTerms,
//            consentData, consentPhotos, consentCommercial)
//          - Audit trail de aceptación legal del cliente
//   v1.1.0 - NEW: productosHabituales y marcasProductos en diagnosis JSON
//          - FIX: createContact copiado de recepcionLogic (patrón producción)
//   v1.0.1 - FIX: Fotos wix:image:// → URL pública
//   v1.0.0 - INICIAL
//
// COLECCIONES CMS (YA EXISTENTES):
//   ClientCareProfile → upsert perfil + foto rostro (profileImage)
//   CareVisitRecord   → insert visita zone='hair' + foto cabello (visitImage) + source
// =====================================================

import { webMethod, Permissions } from 'wix-web-module';
import { elevate } from 'wix-auth';
import { contacts } from 'wix-crm-backend';
import { mediaManager } from 'wix-media-backend';
import wixData from 'wix-data';

const VERSION = '1.2.0';
const TAG = `[HairAssessment][${VERSION}]`;

const COL_CARE_PROFILE = 'ClientCareProfile';
const COL_CARE_VISIT   = 'CareVisitRecord';

// ─────────────────────────────────────────────
// UTILIDADES
// ─────────────────────────────────────────────

function safeErr(e) {
  return { name: e?.name || 'Error', message: e?.message || String(e) };
}

function wixMediaToPublicUrl(wixUrl) {
  if (!wixUrl) return '';
  if (wixUrl.startsWith('https://')) return wixUrl;
  const match = wixUrl.match(/wix:image:\/\/v1\/([^\/]+)\//);
  if (match && match[1]) return `https://static.wixstatic.com/media/${match[1]}`;
  console.warn(`${TAG} URL no reconocida: ${wixUrl.substring(0, 60)}`);
  return wixUrl;
}

async function findContactByEmail(email) {
  try {
    const elevatedQuery = elevate(contacts.queryContacts);
    const result = await elevatedQuery()
      .eq('info.emails.email', email.toLowerCase())
      .limit(1)
      .find();
    if (result.items && result.items.length > 0) {
      console.log(`${TAG} Contacto encontrado: ${result.items[0]._id} → ${email}`);
      return result.items[0]._id;
    }
    return null;
  } catch (e) {
    console.warn(`${TAG} findContactByEmail error:`, e.message);
    return null;
  }
}

/**
 * Crea contacto — patrón copiado de recepcionLogic.web.js (producción)
 */
async function createContact(name, email) {
  try {
    const nameParts = name.trim().split(/\s+/);
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    if (!firstName) {
      console.error(`${TAG} createContact: nombre vacío`);
      return null;
    }

    const contactInfo = {
      name: {
        first: String(firstName).trim(),
        last: String(lastName).trim()
      },
      emails: email ? [{ email: String(email).trim().toLowerCase() }] : [],
      phones: []
    };

    const elevatedCreate = elevate(contacts.createContact);
    const newContact = await elevatedCreate(contactInfo, { allowDuplicates: true, suppressAuth: true });
    const contactId = newContact?._id || newContact?.id;

    console.log(`${TAG} Contacto creado: ${contactId} → ${name} (${email})`);
    return contactId;
  } catch (e) {
    console.error(`${TAG} createContact error:`, e.message);
    return null;
  }
}

async function uploadPhoto(base64Data, contactId, type) {
  try {
    if (!base64Data) return null;
    const match = base64Data.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!match) { console.warn(`${TAG} uploadPhoto: formato base64 no válido para ${type}`); return null; }
    const mimeType = match[1];
    const pureBase64 = match[2];
    const ext = mimeType.split('/')[1] || 'jpg';
    const buffer = Buffer.from(pureBase64, 'base64');
    const fileName = `${type}_${contactId}_${Date.now()}.${ext}`;
    const folderPath = '/care-profile/';
    console.log(`${TAG} Subiendo ${type}: ${fileName} (${(buffer.length / 1024).toFixed(0)} KB)`);
    const uploadResult = await mediaManager.upload(folderPath, buffer, fileName, { mediaOptions: { mimeType } });
    const rawUrl = uploadResult?.fileUrl || null;
    const publicUrl = wixMediaToPublicUrl(rawUrl);
    console.log(`${TAG} Foto subida: ${publicUrl ? publicUrl.substring(0, 60) + '...' : 'null'}`);
    return publicUrl;
  } catch (e) {
    console.error(`${TAG} uploadPhoto (${type}) error:`, e.message);
    return null;
  }
}

// ─────────────────────────────────────────────
// FUNCIÓN PRINCIPAL: GUARDAR ASSESSMENT
// ─────────────────────────────────────────────

export const saveHairAssessment = webMethod(
  Permissions.Anyone,
  async ({ payload }) => {
    try {
      const {
        name, email,
        tipoCabello, largoCabello, grosorCabello, cueroCabelludo,
        tratamientosQuimicos, frecuenciaCalor, frecuenciaLavado,
        problemas, objetivos,
        productosHabituales, marcasProductos,
        comentario,
        photoFace, photoHair,
        source,
        // v1.2.0: consent flags
        consentTerms, consentData, consentPhotos, consentCommercial,
      } = payload || {};

      console.log(`${TAG} saveHairAssessment: ${name} (${email})`);

      if (!name || !email || !email.includes('@')) {
        return { ok: false, error: 'Nombre y email son obligatorios' };
      }

      // ── 1. Buscar o crear contacto ──
      let contactId = await findContactByEmail(email);
      let isNewContact = false;
      if (!contactId) {
        console.log(`${TAG} Contacto no encontrado, creando nuevo...`);
        contactId = await createContact(name, email);
        isNewContact = true;
        if (!contactId) return { ok: false, error: 'No se pudo crear el contacto' };
      }

      // ── 2. Subir fotos en paralelo ──
      const [photoFaceUrl, photoHairUrl] = await Promise.all([
        uploadPhoto(photoFace, contactId, 'face'),
        uploadPhoto(photoHair, contactId, 'hair'),
      ]);

      // ── 3. Upsert ClientCareProfile ──
      const existingProfile = await wixData.query(COL_CARE_PROFILE)
        .eq('contactId', contactId)
        .limit(1)
        .find({ suppressAuth: true });

      if (existingProfile.items && existingProfile.items.length > 0) {
        const prev = existingProfile.items[0];
        if (photoFaceUrl) {
          prev.profileImage = photoFaceUrl;
          await wixData.update(COL_CARE_PROFILE, prev, { suppressAuth: true });
          console.log(`${TAG} CareProfile actualizado con nueva foto rostro`);
        }
      } else {
        const profile = {
          contactId,
          notes: '',
          followUpRequired: false,
          profileImage: photoFaceUrl || '',
          createdDate: new Date(),
        };
        await wixData.insert(COL_CARE_PROFILE, profile, { suppressAuth: true });
        console.log(`${TAG} CareProfile CREADO para ${contactId}`);
      }

      // ── 4. Insert CareVisitRecord (zone: 'hair') ──
      const diagnosis = JSON.stringify({
        tipoCabello:          tipoCabello || '',
        largoCabello:         largoCabello || '',
        grosorCabello:        grosorCabello || '',
        cueroCabelludo:       cueroCabelludo || '',
        tratamientosQuimicos: tratamientosQuimicos || [],
        frecuenciaCalor:      frecuenciaCalor || '',
        frecuenciaLavado:     frecuenciaLavado || '',
        problemas:            problemas || [],
        objetivos:            objetivos || [],
        productosHabituales:  productosHabituales || [],
        marcasProductos:      (marcasProductos || '').substring(0, 300),
        comentario:           (comentario || '').substring(0, 500),
        clientName:           name.trim(),
        clientEmail:          email.toLowerCase(),
        // v1.2.0: consent audit trail
        consentTerms:         !!consentTerms,
        consentData:          !!consentData,
        consentPhotos:        !!consentPhotos,
        consentCommercial:    !!consentCommercial,
        consentDate:          new Date().toISOString(),
      });

      const visitRecord = {
        contactId,
        zone:                'hair',
        bookingId:           '',
        visitDate:           new Date(),
        diagnosis,
        productsRecommended: '',
        staffId:             '',
        visitImage:          photoHairUrl || '',
        source:              source || 'web',
      };

      const savedVisit = await wixData.insert(COL_CARE_VISIT, visitRecord, { suppressAuth: true });
      console.log(`${TAG} CareVisitRecord CREADO: ${savedVisit._id} (zone: hair, source: ${visitRecord.source})`);

      return { ok: true, visitId: savedVisit._id, contactId, isNewContact };
    } catch (e) {
      console.error(`${TAG} saveHairAssessment ERROR:`, e.message);
      return { ok: false, error: safeErr(e).message };
    }
  }
);