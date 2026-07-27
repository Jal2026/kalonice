// =====================================================
// KAMISUITE - Edición Categorías (Tour de Servicios) - Backend
// =====================================================
// VERSION: 1.1.0
// FECHA: 8 de julio de 2026
// ARCHIVO: backend/categoriasEditorLogic.web.js
//
// CHANGELOG:
//
// v1.1.0 (8-jul-2026) — CRUD COMPLETO. El editor se vuelve autosuficiente:
//   deja de requerir el dashboard de Wix para gobernar el Tour público.
//
//   Nuevas funciones:
//   · crearCategoria(payload)              → alta de categoría nueva
//   · eliminarCategoria({catId})           → borrado hard
//   · duplicarCategoria({catId, nuevoTitle}) → clona una existente
//
//   SALVAGUARDAS crítica en toda escritura que pueda generar/impactar
//   el slug de la página dinámica ITEM (link-servicios-title):
//
//   [SG1] Anti-colisión pre-escritura:
//     Antes de insert o de update-con-title-cambiado, se calcula el
//     slug propuesto (helper normalizarSlug) y se compara contra el
//     slug equivalente de todas las filas existentes. Si coincide con
//     alguna (excluyéndose a sí misma en updates), se rechaza la
//     operación con mensaje explícito. Motivo: Wix deriva el slug del
//     `title` por defecto y dos títulos que produzcan el mismo slug
//     dejarían la segunda categoría sin URL única en Tour.
//
//   [SG2] Verificación post-insert + rollback:
//     Tras cada wixData.insert se relee la fila y se comprueba que
//     link-servicios-title vino poblado por Wix. Si viniera vacío
//     (edge case de configuración de página dinámica), se hace
//     wixData.remove inmediato de la fila y se devuelve error. Nunca
//     queda una categoría rota en el CMS.
//
//   Anti-cambios silenciosos:
//   · actualizarCategoria ahora valida SG1 también cuando el usuario
//     cambia el `title` de una categoría existente.
//   · crearCategoria fuerza `activo:false` y `visible:false` para
//     evitar categoría fantasma en Tour (sin imagen / sin grupos)
//     durante los primeros segundos post-alta.
//   · duplicarCategoria copia todos los campos editables del origen
//     (subtitle, description, groupCatalog, image, orden) salvo el
//     título (obligatorio nuevo) y estado (`activo:false`).
//
// v1.0.0 (21-jun-2026) — Versión inicial. Solo edición y toggle.
//
// PROPÓSITO:
//   Editor del CMS HairSalonServices — el PRIMER NIVEL de Tour de
//   Servicios (la página pública de CATEGORÍAS). Cada fila es una
//   categoría de marketing (Coloración, Cortes Mujer, Tratamientos…)
//   con su foto, título, subtítulo y descripción, más el campo
//   `groupCatalog` que la conecta con los `group` de ServiceCatalog.
//
// ⚠️ SLUGS DE PÁGINA DINÁMICA — NUNCA SE ESCRIBEN:
//   Los campos `link-servicios-title` y `link-servicios-all` los genera
//   Wix automáticamente y apuntan a las páginas dinámicas LISTAR/ITEM.
//   Este backend los LEE (para mostrarlos / depurar / SG2) pero JAMÁS
//   los incluye en un update o insert. Tocarlos rompería el enrutado.
//
// CAMPOS CMS (field IDs confirmados por widgetPublicoLogic en producción
//   y verificados en export CSV 8-jul-2026):
//   title (Text), subtitle (Text), description (Text), image (Image),
//   orden (Number), activo (Boolean), visible (Boolean),
//   groupCatalog (Text),
//   link-servicios-title (Text/URL — solo lectura, generado por Wix),
//   link-servicios-all   (Text/URL — solo lectura, generado por Wix)
//
// PATRÓN REUTILIZADO (literal, de serviciosEdicionLogic v1.11.7):
//   - mediaManager.upload (subida de imagen)
//   - wixImageToPublicUrl (URL pública para el preview)
//   - READ-MERGE-UPDATE en cada actualización
//   - Permissions.SiteMember + suppressAuth en queries
//
// FUNCIONES EXPORTADAS:
//   - listarCategorias()                     → categorías para las cards
//   - crearCategoria(payload)                → v1.1.0 · alta nueva
//   - actualizarCategoria(payload)           → edita textos + groupCatalog
//   - duplicarCategoria({catId, nuevoTitle}) → v1.1.0 · clona una existente
//   - eliminarCategoria({catId})             → v1.1.0 · borra fila
//   - toggleCategoriaActiva({catId, on})     → activo true/false
//   - uploadImagenCategoria(payload)         → sube imagen y la enlaza
// =====================================================

import { Permissions, webMethod } from 'wix-web-module';
import { mediaManager } from 'wix-media-backend';
import wixData from 'wix-data';

const VERSION = '1.1.0';
const TAG = `[CategoriasEditor][${VERSION}]`;

const CMS_CATEGORIAS = 'HairSalonServices';

// =====================================================
// HELPERS
// =====================================================

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// Idéntico a serviciosEdicionLogic v1.11.7
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

// v1.1.0 — Réplica de la transformación estándar de Wix para derivar
// el slug de una página dinámica ITEM desde el campo principal (title):
//   lowercase → sin acentos → no-alfanum a guión → dedupe/trim guiones.
//
// Verificado contra el CSV real de HairSalonServices (8-jul-2026, 12 filas):
//   "Hombre"                  → "hombre"                    ✓
//   "Coloración"              → "coloracion"                ✓
//   "Tratamientos capilares"  → "tratamientos-capilares"    ✓
//   "Tratamientos faciales"   → "tratamientos-faciales"     ✓
//   "Corte Mujer"             → "corte-mujer"               ✓
//   "Peinados y Recogidos"    → "peinados-y-recogidos"      ✓
//   "Manicura y Pedicura"     → "manicura-y-pedicura"       ✓
//   "Spa Capilar"             → "spa-capilar"               ✓
//   "Especial Novias"         → "especial-novias"           ✓
//   "Depilación"              → "depilacion"                ✓
//   "Eventos"                 → "eventos"                   ✓
//   "Presoterapia"            → "presoterapia"              ✓
function normalizarSlug(text) {
  if (!text) return '';
  return String(text)
    .toLowerCase()
    .normalize('NFD')                     // separa acentos
    .replace(/[\u0300-\u036f]/g, '')      // quita marcas diacríticas
    .replace(/[^a-z0-9]+/g, '-')          // no-alfanum → guión
    .replace(/^-+|-+$/g, '')              // trim guiones bordes
    .replace(/-+/g, '-');                 // dedupe guiones internos
}

// v1.1.0 — [SG1] Devuelve la fila colisionante (o null si no hay).
// excludeId permite excluirse a sí misma en updates de title.
async function buscarColisionSlug(nuevoTitle, excludeId) {
  const slugPropuesto = normalizarSlug(nuevoTitle);
  if (!slugPropuesto) return null;

  const r = await wixData.query(CMS_CATEGORIAS)
    .limit(200)
    .find({ suppressAuth: true });

  const items = r.items || [];
  for (const it of items) {
    if (excludeId && it._id === excludeId) continue;
    if (normalizarSlug(it.title || '') === slugPropuesto) return it;
  }
  return null;
}

// Adapta un registro CMS a la forma que consume el widget.
function adaptarCategoria(it) {
  return {
    _id: it._id,
    _catId: it._id,
    title: it.title || '',
    subtitle: it.subtitle || '',
    description: it.description || '',
    image: it.image || '',
    imageUrl: wixImageToPublicUrl(it.image) || '',
    orden: toNum(it.orden),
    activo: it.activo === true,
    groupCatalog: it.groupCatalog || '',
    // Solo lectura — slugs de las páginas dinámicas (Wix los genera).
    linkServiciosTitle: it['link-servicios-title'] || '',
    linkServiciosAll: it['link-servicios-all'] || ''
  };
}

// =====================================================
// 1. LISTAR CATEGORÍAS (HairSalonServices)
// =====================================================
export const listarCategorias = webMethod(
  Permissions.SiteMember,
  async () => {
    const t0 = Date.now();
    try {
      const result = await wixData.query(CMS_CATEGORIAS)
        .ascending('orden')
        .limit(200)
        .find({ suppressAuth: true });

      const categorias = (result.items || []).map(adaptarCategoria);

      console.log(`${TAG} ✅ listarCategorias: ${categorias.length} categorías. ${((Date.now() - t0) / 1000).toFixed(2)}s`);
      return { success: true, version: VERSION, categorias };

    } catch (error) {
      console.error(`${TAG} ❌ listarCategorias:`, error.message);
      return { success: false, version: VERSION, error: error.message, categorias: [] };
    }
  }
);

// =====================================================
// 2. CREAR CATEGORÍA — v1.1.0
// Alta nueva con salvaguardas SG1 (anti-colisión) + SG2 (verificación
// post-insert del slug generado por Wix, con rollback duro).
//
// Defaults forzados: activo:false, visible:false.
//   → Evita categoría fantasma en Tour (sin imagen / sin groupCatalog)
//     durante los segundos post-alta. El arquitecto la activa cuando
//     ya está lista, con el toggle ON de la card.
//
// La imagen NO se sube aquí. Se sube después con uploadImagenCategoria
// pasando el _id que devuelve esta función (mismo patrón que v1.0.0).
// =====================================================
export const crearCategoria = webMethod(
  Permissions.SiteMember,
  async (payload) => {
    try {
      const {
        title,
        subtitle,
        description,
        groupCatalog,
        orden
      } = payload || {};

      const nuevoTitle = String(title || '').trim();
      if (!nuevoTitle) {
        return { success: false, error: 'El título es obligatorio' };
      }

      console.log(`${TAG} ✨ crearCategoria: "${nuevoTitle}"`);

      // [SG1] Anti-colisión pre-insert
      const colision = await buscarColisionSlug(nuevoTitle, null);
      if (colision) {
        console.warn(`${TAG} ⚠️ Colisión con "${colision.title}" (slug equivalente)`);
        return {
          success: false,
          error: `Ya existe una categoría con nombre equivalente: "${colision.title}". Elige otro título.`
        };
      }

      // INSERT — defaults OFF, sin imagen, sin tocar slugs
      const nueva = {
        title: nuevoTitle,
        subtitle: String(subtitle || '').trim(),
        description: String(description || ''),
        groupCatalog: String(groupCatalog || '').trim(),
        orden: toNum(orden),
        activo: false,   // default OFF hasta que el arquitecto la active
        visible: false   // sincronizado con activo
      };

      const insertada = await wixData.insert(CMS_CATEGORIAS, nueva, { suppressAuth: true });

      // [SG2] Verificación post-insert + rollback duro
      const releida = await wixData.get(CMS_CATEGORIAS, insertada._id, { suppressAuth: true });
      const slugGenerado = releida ? (releida['link-servicios-title'] || '') : '';

      if (!slugGenerado) {
        // Wix no generó el slug → rollback y error explícito
        console.error(`${TAG} ❌ Wix no generó link-servicios-title. Rollback.`);
        try {
          await wixData.remove(CMS_CATEGORIAS, insertada._id, { suppressAuth: true });
        } catch (rmErr) {
          console.error(`${TAG} ❌ Rollback falló:`, rmErr.message);
        }
        return {
          success: false,
          error: 'Wix no generó la URL dinámica para la categoría. Revisa la configuración de la página dinámica ITEM.'
        };
      }

      console.log(`${TAG} ✅ Categoría creada: ${releida._id} → slug=${slugGenerado}`);
      return {
        success: true,
        version: VERSION,
        categoria: adaptarCategoria(releida)
      };

    } catch (error) {
      console.error(`${TAG} ❌ crearCategoria:`, error.message);
      return { success: false, error: error.message };
    }
  }
);

// =====================================================
// 3. ACTUALIZAR CATEGORÍA
// READ-MERGE-UPDATE. Solo toca los campos editables.
// NUNCA escribe link-servicios-title ni link-servicios-all.
//
// v1.1.0 — Añade validación SG1 cuando el usuario cambia el `title`
// (dos filas con títulos que produzcan el mismo slug quedarían sin URL
// única en Tour). Cambios de otros campos siguen sin validación de
// colisión (no impactan slug).
// =====================================================
export const actualizarCategoria = webMethod(
  Permissions.SiteMember,
  async (payload) => {
    try {
      const {
        _catId,
        title,
        subtitle,
        description,
        groupCatalog,
        orden
      } = payload || {};

      if (!_catId) {
        return { success: false, error: 'Falta _catId' };
      }

      console.log(`${TAG} 💾 Actualizando categoría: ${_catId}`);

      // READ
      const registro = await wixData.get(CMS_CATEGORIAS, _catId, { suppressAuth: true });
      if (!registro) {
        return { success: false, error: 'Categoría no encontrada' };
      }

      // v1.1.0 · [SG1] Anti-colisión cuando el title cambia
      if (title !== undefined) {
        const nuevoTitle = String(title || '').trim();
        if (!nuevoTitle) {
          return { success: false, error: 'El título es obligatorio' };
        }
        if (nuevoTitle !== (registro.title || '').trim()) {
          const colision = await buscarColisionSlug(nuevoTitle, _catId);
          if (colision) {
            console.warn(`${TAG} ⚠️ Update rechazado por colisión con "${colision.title}"`);
            return {
              success: false,
              error: `Ya existe una categoría con nombre equivalente: "${colision.title}". Elige otro título.`
            };
          }
        }
      }

      // MERGE — solo campos editables. Los slugs NO se tocan.
      if (title !== undefined) registro.title = String(title || '').trim();
      if (subtitle !== undefined) registro.subtitle = String(subtitle || '').trim();
      if (description !== undefined) registro.description = String(description || '');
      if (groupCatalog !== undefined) registro.groupCatalog = String(groupCatalog || '').trim();
      if (orden !== undefined) {
        const n = Number(orden);
        registro.orden = isNaN(n) ? toNum(registro.orden) : n;
      }

      // UPDATE (documento completo ya leído → no se pierde nada)
      const updated = await wixData.update(CMS_CATEGORIAS, registro, { suppressAuth: true });
      console.log(`${TAG} ✅ Categoría actualizada: ${updated.title}`);

      return {
        success: true,
        version: VERSION,
        categoria: adaptarCategoria(updated)
      };

    } catch (error) {
      console.error(`${TAG} ❌ actualizarCategoria:`, error.message);
      return { success: false, error: error.message };
    }
  }
);

// =====================================================
// 4. DUPLICAR CATEGORÍA — v1.1.0
// Clona una categoría existente creando una fila nueva con:
//   · title = nuevoTitle (obligatorio, distinto del origen)
//   · subtitle, description, groupCatalog, image, orden = copia del origen
//   · activo:false, visible:false (default OFF, como crearCategoria)
//
// Aplica las mismas salvaguardas SG1 + SG2.
// =====================================================
export const duplicarCategoria = webMethod(
  Permissions.SiteMember,
  async ({ catId, nuevoTitle } = {}) => {
    try {
      if (!catId) {
        return { success: false, error: 'Falta catId (origen)' };
      }
      const nuevoT = String(nuevoTitle || '').trim();
      if (!nuevoT) {
        return { success: false, error: 'El nuevo título es obligatorio' };
      }

      console.log(`${TAG} 📋 duplicarCategoria: origen=${catId} → "${nuevoT}"`);

      // Leer origen
      const origen = await wixData.get(CMS_CATEGORIAS, catId, { suppressAuth: true });
      if (!origen) {
        return { success: false, error: 'Categoría origen no encontrada' };
      }

      // [SG1] Anti-colisión pre-insert
      const colision = await buscarColisionSlug(nuevoT, null);
      if (colision) {
        console.warn(`${TAG} ⚠️ Duplicado rechazado por colisión con "${colision.title}"`);
        return {
          success: false,
          error: `Ya existe una categoría con nombre equivalente: "${colision.title}". Elige otro título.`
        };
      }

      // INSERT — copia campos editables del origen
      const nueva = {
        title: nuevoT,
        subtitle: origen.subtitle || '',
        description: origen.description || '',
        groupCatalog: origen.groupCatalog || '',
        image: origen.image || null,   // misma imagen (reutiliza asset)
        orden: toNum(origen.orden),
        activo: false,
        visible: false
      };

      const insertada = await wixData.insert(CMS_CATEGORIAS, nueva, { suppressAuth: true });

      // [SG2] Verificación post-insert + rollback duro
      const releida = await wixData.get(CMS_CATEGORIAS, insertada._id, { suppressAuth: true });
      const slugGenerado = releida ? (releida['link-servicios-title'] || '') : '';

      if (!slugGenerado) {
        console.error(`${TAG} ❌ Wix no generó slug en duplicado. Rollback.`);
        try {
          await wixData.remove(CMS_CATEGORIAS, insertada._id, { suppressAuth: true });
        } catch (rmErr) {
          console.error(`${TAG} ❌ Rollback falló:`, rmErr.message);
        }
        return {
          success: false,
          error: 'Wix no generó la URL dinámica para la copia. Revisa la configuración de la página dinámica ITEM.'
        };
      }

      console.log(`${TAG} ✅ Categoría duplicada: ${releida._id} ← origen ${catId}`);
      return {
        success: true,
        version: VERSION,
        categoria: adaptarCategoria(releida)
      };

    } catch (error) {
      console.error(`${TAG} ❌ duplicarCategoria:`, error.message);
      return { success: false, error: error.message };
    }
  }
);

// =====================================================
// 5. ELIMINAR CATEGORÍA — v1.1.0
// Borrado hard de la fila. Al eliminarla:
//   · La URL dinámica ITEM asociada deja de existir en Tour.
//   · Los servicios (ServiceCatalog) que apuntaban a esa categoría vía
//     `groupCatalog` NO se tocan — siguen accesibles desde otras
//     categorías si comparten grupo o desde Recepción Pro.
//   · La imagen en Media Manager NO se borra (puede estar en uso por
//     otras filas o por duplicados; borrar assets es responsabilidad
//     manual del arquitecto).
//
// El widget debe confirmar con doble click / prompt antes de invocar.
// =====================================================
export const eliminarCategoria = webMethod(
  Permissions.SiteMember,
  async ({ catId } = {}) => {
    try {
      if (!catId) {
        return { success: false, error: 'Falta catId' };
      }

      console.log(`${TAG} 🗑️ eliminarCategoria: ${catId}`);

      // Lectura previa para devolver el título eliminado (para toast).
      const registro = await wixData.get(CMS_CATEGORIAS, catId, { suppressAuth: true });
      if (!registro) {
        return { success: false, error: 'Categoría no encontrada' };
      }

      const titleEliminado = registro.title || '';
      await wixData.remove(CMS_CATEGORIAS, catId, { suppressAuth: true });

      console.log(`${TAG} ✅ Categoría eliminada: "${titleEliminado}" (${catId})`);
      return { success: true, version: VERSION, catId, titleEliminado };

    } catch (error) {
      console.error(`${TAG} ❌ eliminarCategoria:`, error.message);
      return { success: false, error: error.message };
    }
  }
);

// =====================================================
// 6. TOGGLE ACTIVO / NO ACTIVO
// Escribe `activo` y sincroniza `visible` con el mismo valor (v1.1.0).
// READ-MERGE-UPDATE preserva el resto.
// =====================================================
export const toggleCategoriaActiva = webMethod(
  Permissions.SiteMember,
  async ({ catId, activo }) => {
    try {
      if (!catId) {
        return { success: false, error: 'Falta catId' };
      }

      const registro = await wixData.get(CMS_CATEGORIAS, catId, { suppressAuth: true });
      if (!registro) {
        return { success: false, error: 'Categoría no encontrada' };
      }

      const nuevoActivo = !!activo;
      registro.activo = nuevoActivo;
      // v1.1.0 — mantener `visible` sincronizado con `activo` hasta que
      // auditemos si algún dataset externo depende del campo `visible`.
      registro.visible = nuevoActivo;

      await wixData.update(CMS_CATEGORIAS, registro, { suppressAuth: true });

      console.log(`${TAG} ✅ Categoría ${catId} → activo=${nuevoActivo} (visible=${nuevoActivo})`);
      return { success: true, version: VERSION, catId, activo: nuevoActivo };

    } catch (error) {
      console.error(`${TAG} ❌ toggleCategoriaActiva:`, error.message);
      return { success: false, error: error.message };
    }
  }
);

// =====================================================
// 7. SUBIR IMAGEN DE CATEGORÍA
// Patrón literal de uploadImagenServicio (serviciosEdicionLogic v1.11.7):
// mediaManager.upload → fileUrl → READ-MERGE-UPDATE de `image`.
// =====================================================
export const uploadImagenCategoria = webMethod(
  Permissions.Anyone,
  async ({ catId, base64Data, fileName, mimeType }) => {
    try {
      console.log(`${TAG} 📸 Subir imagen categoría: ${catId} | ${fileName}`);

      if (!catId || !base64Data || !fileName) {
        return { ok: false, error: 'Faltan parámetros (catId, base64Data, fileName)' };
      }

      const registro = await wixData.get(CMS_CATEGORIAS, catId, { suppressAuth: true });
      if (!registro) {
        return { ok: false, error: 'Categoría no encontrada en HairSalonServices' };
      }

      const buffer = Buffer.from(base64Data, 'base64');
      const uploadResult = await mediaManager.upload(
        '/HairSalonServices',
        buffer,
        fileName,
        {
          mediaOptions: {
            mimeType: mimeType || 'image/jpeg',
            mediaType: 'image'
          },
          metadataOptions: {
            isPrivate: false,
            isVisitorUpload: false
          }
        }
      );

      const fileUrl = uploadResult?.fileUrl || '';
      if (!fileUrl) {
        return { ok: false, error: 'Media Manager no devolvió fileUrl' };
      }

      console.log(`${TAG} ✅ Imagen subida: ${fileUrl}`);

      // READ-MERGE-UPDATE (registro completo ya leído)
      await wixData.update(CMS_CATEGORIAS, {
        ...registro,
        image: fileUrl
      }, { suppressAuth: true });

      console.log(`${TAG} ✅ HairSalonServices.image actualizado`);

      const publicUrl = wixImageToPublicUrl(fileUrl) || '';
      return { ok: true, fileUrl, publicUrl };

    } catch (e) {
      console.error(`${TAG} ❌ uploadImagenCategoria:`, e.message);
      return { ok: false, error: e.message };
    }
  }
);