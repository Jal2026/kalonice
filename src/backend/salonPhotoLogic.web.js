// =====================================================
// KAMISUITE - Backend salonPhotoLogic.web.js
// Módulo: App Salón — Foto Capilar
// =====================================================
// VERSION: 1.2.0
// FECHA: 5 Mayo 2026
//
// CHANGELOG:
//   v1.2.0 - NEW: zone='profile' actualiza ClientCareProfile.profileImage
//     - Cuando el estilista selecciona "Foto de perfil" en la app, la
//       imagen se guarda como avatar del cliente en ClientCareProfile,
//       NO se crea un CareVisitRecord (no es una visita de tratamiento).
//     - El Care Profile widget pasa a leer profileImage de aquí (CMS)
//       en lugar del CRM de Wix Members (que no es fiable: fotos de
//       gatos, perfiles vacíos, etc.).
//     - Resto de zonas (hair, nails, lashes, skin) sin cambios:
//       crean CareVisitRecord como hasta ahora.
//   v1.1.0 - REFACTOR: eliminada rotación hairImage de ClientCareProfile
//   v1.0.2 - FIX: incluye Emy en staff / NEW: getClientCareImage
//   v1.0.1 - FIX: filtra CUALQUIERA y PROCESO
//   v1.0.0 - INICIAL
//
// FUNCIONES:
//   getSalonStaff(): staff activos, sin recursos de sistema
//   getClientCareImage(): profileImage de ClientCareProfile
//   saveSalonPhoto(): sube foto + crea CareVisitRecord, o actualiza
//                     profileImage si zone='profile'
//
// COLECCIONES CMS UTILIZADAS:
//   StaffConfig:
//     active, canonicalName, displayName, wixResourceId, isExternal
//   ClientCareProfile:
//     contactId, profileImage, notes, followUpRequired, createdDate
//   CareVisitRecord:
//     contactId, zone, bookingId, visitDate, diagnosis,
//     productsRecommended, staffId, visitImage, source
//
// DEPENDENCIAS:
//   - cargarTodosContactos() se importa en el PAGE CODE desde
//     recepcionLogic.web (NO aquí)
// =====================================================

import { webMethod, Permissions } from 'wix-web-module';
import { elevate } from 'wix-auth';
import { mediaManager } from 'wix-media-backend';
import wixData from 'wix-data';

const VERSION = '1.2.0';
const TAG = `[SalonPhoto][${VERSION}]`;

const COL_STAFF        = 'StaffConfig';
const COL_CARE_PROFILE = 'ClientCareProfile';
const COL_CARE_VISIT   = 'CareVisitRecord';

// ─────────────────────────────────────────────
// UTILIDADES
// ─────────────────────────────────────────────

function safeErr(e) {
  return { name: e?.name || 'Error', message: e?.message || String(e) };
}

/**
 * Convierte URL de Wix Media (wix:image://v1/{hash}/{filename}#...)
 * a URL pública (https://static.wixstatic.com/media/{hash}).
 * Si ya es https, la devuelve tal cual.
 */
function wixMediaToPublicUrl(wixUrl) {
  if (!wixUrl) return '';
  if (wixUrl.startsWith('https://')) return wixUrl;
  const match = wixUrl.match(/wix:image:\/\/v1\/([^\/]+)\//);
  if (match && match[1]) {
    return `https://static.wixstatic.com/media/${match[1]}`;
  }
  console.warn(`${TAG} URL no reconocida: ${wixUrl.substring(0, 60)}`);
  return wixUrl;
}

/**
 * Sube foto base64 a Wix Media Manager.
 * @param {string} base64DataUrl - data:image/jpeg;base64,...
 * @param {string} contactId - ID del contacto
 * @param {string} prefix - prefijo del filename (default 'salon_hair')
 * @returns {string|null} URL pública o null si falla
 */
async function uploadPhoto(base64DataUrl, contactId, prefix = 'salon_hair') {
  if (!base64DataUrl) return null;
  try {
    const base64Data = base64DataUrl.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    const filename = `${prefix}_${contactId}_${Date.now()}.jpg`;

    const elevatedUpload = elevate(mediaManager.upload);
    const result = await elevatedUpload(
      '/care-salon-photos/',
      buffer,
      filename,
      { mediaOptions: { mimeType: 'image/jpeg', mediaType: 'image' } }
    );

    const publicUrl = wixMediaToPublicUrl(result.fileUrl);
    console.log(`${TAG} Foto subida: ${publicUrl ? publicUrl.substring(0, 60) + '...' : 'null'}`);
    return publicUrl;
  } catch (e) {
    console.error(`${TAG} uploadPhoto error:`, e.message);
    return null;
  }
}

/**
 * v1.2.0: Upsert de profileImage en ClientCareProfile.
 * Si existe el perfil → actualiza solo el campo profileImage.
 * Si no existe → crea perfil con la foto y campos por defecto.
 * Devuelve el _id del registro afectado.
 */
async function upsertProfileImage(contactId, photoUrl) {
  const existing = await wixData.query(COL_CARE_PROFILE)
    .eq('contactId', contactId)
    .limit(1)
    .find({ suppressAuth: true });

  if (existing?.items?.length) {
    const profile = existing.items[0];
    profile.profileImage = photoUrl;
    const updated = await wixData.update(COL_CARE_PROFILE, profile, { suppressAuth: true });
    console.log(`${TAG} ClientCareProfile.profileImage ACTUALIZADO: ${updated._id}`);
    return updated._id;
  } else {
    const newProfile = {
      contactId,
      profileImage:     photoUrl,
      notes:            '',
      followUpRequired: false,
      createdDate:      new Date(),
    };
    const saved = await wixData.insert(COL_CARE_PROFILE, newProfile, { suppressAuth: true });
    console.log(`${TAG} ClientCareProfile CREADO con profileImage: ${saved._id}`);
    return saved._id;
  }
}

// ─────────────────────────────────────────────
// 1. OBTENER LISTA DE EMPLEADOS DEL SALÓN
// Lee StaffConfig: activos, no externos, no recursos de sistema
// CUALQUIERA y PROCESO son recursos de sistema, NO humanos.
// TODO multi-tenant: crear campo isSystem en StaffConfig
// ─────────────────────────────────────────────

const SYSTEM_RESOURCES = ['cualquiera', 'proceso'];

function isSystemResource(canonicalName) {
  if (!canonicalName) return false;
  const lower = canonicalName.toLowerCase();
  return SYSTEM_RESOURCES.some(sr => lower.includes(sr));
}

export const getSalonStaff = webMethod(
  Permissions.Anyone,
  async () => {
    try {
      console.log(`${TAG} getSalonStaff`);

      const result = await wixData.query(COL_STAFF)
        .eq('active', true)
        .find({ suppressAuth: true });

      const staff = (result?.items || [])
        .filter(s => !isSystemResource(s.canonicalName))
        .map(s => ({
          canonicalName: s.canonicalName || '',
          displayName:   s.displayName || s.canonicalName || '',
          wixResourceId: s.wixResourceId || '',
          profileImage:  s.profileImage || '',
        }));

      console.log(`${TAG} getSalonStaff → ${staff.length} empleados (excluidos: ${SYSTEM_RESOURCES.join(', ')})`);
      return { ok: true, staff };
    } catch (e) {
      console.error(`${TAG} getSalonStaff ERROR:`, e.message);
      return { ok: false, error: safeErr(e).message, staff: [] };
    }
  }
);

// ─────────────────────────────────────────────
// 2. OBTENER IMAGEN DE PERFIL DEL CLIENTE
// Lee ClientCareProfile.profileImage para mostrar en el avatar
// ─────────────────────────────────────────────

export const getClientCareImage = webMethod(
  Permissions.Anyone,
  async ({ contactId }) => {
    try {
      console.log(`${TAG} getClientCareImage: ${contactId}`);

      const result = await wixData.query(COL_CARE_PROFILE)
        .eq('contactId', contactId)
        .limit(1)
        .find({ suppressAuth: true });

      const profile = result?.items?.[0] || null;
      const profileImage = profile ? wixMediaToPublicUrl(profile.profileImage) : '';

      console.log(`${TAG} getClientCareImage → ${profileImage ? 'sí' : 'sin imagen'}`);
      return { ok: true, profileImage };
    } catch (e) {
      console.error(`${TAG} getClientCareImage ERROR:`, e.message);
      return { ok: true, profileImage: '' };
    }
  }
);

// ─────────────────────────────────────────────
// 3. GUARDAR FOTO DEL SALÓN
// v1.2.0: ramificación según zone:
//   - zone='profile' → upsert ClientCareProfile.profileImage. NO crea
//     CareVisitRecord (no es una visita de tratamiento).
//   - zone='hair'|'nails'|'lashes'|'skin' → comportamiento original:
//     crea CareVisitRecord + asegura ClientCareProfile vacío. La
//     evolución capilar se lee de los últimos CareVisitRecord.
// ─────────────────────────────────────────────

export const saveSalonPhoto = webMethod(
  Permissions.Anyone,
  async ({ contactId, photoBase64, staffId, staffName, note, zone }) => {
    try {
      const VALID_ZONES = ['profile', 'hair', 'nails', 'lashes', 'skin'];
      const safeZone = VALID_ZONES.includes(zone) ? zone : 'hair';

      console.log(`${TAG} saveSalonPhoto: contactId=${contactId} staff=${staffName} zone=${safeZone}`);

      if (!contactId) {
        return { ok: false, error: 'contactId es obligatorio' };
      }
      if (!photoBase64) {
        return { ok: false, error: 'No se ha recibido foto' };
      }

      // ── 1. Subir foto ──
      // Prefijo del filename diferente para profile (queda más limpio en Media Manager)
      const filenamePrefix = safeZone === 'profile' ? 'profile' : 'salon_hair';
      const photoUrl = await uploadPhoto(photoBase64, contactId, filenamePrefix);
      if (!photoUrl) {
        return { ok: false, error: 'Error subiendo la foto' };
      }

      // ─────────────────────────────────────────────────────────
      // RAMA A: FOTO DE PERFIL (avatar del cliente)
      // ─────────────────────────────────────────────────────────
      if (safeZone === 'profile') {
        const profileId = await upsertProfileImage(contactId, photoUrl);
        return {
          ok: true,
          profileId,
          photoUrl,
          isProfile: true,
        };
      }

      // ─────────────────────────────────────────────────────────
      // RAMA B: FOTO DE TRATAMIENTO (hair/nails/lashes/skin)
      // ─────────────────────────────────────────────────────────

      // ── 2. Asegurar que existe ClientCareProfile (sin tocar imágenes de cabello) ──
      const profileResult = await wixData.query(COL_CARE_PROFILE)
        .eq('contactId', contactId)
        .limit(1)
        .find({ suppressAuth: true });

      if (!profileResult?.items?.length) {
        // Crear perfil vacío si no existe
        const newProfile = {
          contactId,
          profileImage:     '',
          notes:            '',
          followUpRequired: false,
          createdDate:      new Date(),
        };
        const saved = await wixData.insert(COL_CARE_PROFILE, newProfile, { suppressAuth: true });
        console.log(`${TAG} ClientCareProfile CREADO: ${saved._id}`);
      }

      // ── 3. Crear CareVisitRecord ──
      const diagnosis = JSON.stringify({
        salonNote: (note || '').substring(0, 500),
        staffName: staffName || '',
        capturedAt: new Date().toISOString(),
      });

      const visitRecord = {
        contactId,
        zone:                safeZone,
        bookingId:           '',
        visitDate:           new Date(),
        diagnosis,
        productsRecommended: '',
        staffId:             staffId || '',
        visitImage:          photoUrl,
        source:              'salon',
      };

      const savedVisit = await wixData.insert(COL_CARE_VISIT, visitRecord, { suppressAuth: true });
      console.log(`${TAG} CareVisitRecord CREADO: ${savedVisit._id} (zone: ${safeZone}, source: salon, staff: ${staffName})`);

      return { ok: true, visitId: savedVisit._id, photoUrl };
    } catch (e) {
      console.error(`${TAG} saveSalonPhoto ERROR:`, e.message);
      return { ok: false, error: safeErr(e).message };
    }
  }
);