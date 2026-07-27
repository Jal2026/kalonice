// =====================================================
// KAMISUITE — Backend: akiraEntrenador.web.js
// Módulo: Entrenador AKIRA (patrón EGAEL)
// =====================================================
// VERSION: 1.0.0
// FECHA: 23 Abril 2026
//
// FUNCIONES PÚBLICAS (webMethods):
//   cargarConfigEntrenador() — carga alignment + documentos para la UI
//   guardarAlignment({ config }) — guarda borrador
//   publicarAlignment({ alignmentId }) — publica versión
//   testAkira({ message, configOverride }) — prueba respuesta con config
//   generarPromptAkira({ descripcion }) — genera prompt base con IA
//   crearDocumento({ titulo, tipo, contenido, resumen }) — crea recurso
//   toggleDocumento({ documentoId, activo }) — activa/desactiva
//   eliminarDocumento({ documentoId }) — elimina recurso
//
// FUNCIONES EXPORTADAS (no web, para consoleIA.web.js):
//   getPublishedAlignment() — alignment publicado actual
//   getActiveDocuments() — documentos activos ordenados
//   buildAkiraSystemPrompt() — monta el prompt desde CMS
//
// COLECCIONES CMS:
//   AkiraAlignment — configuración del comportamiento
//   AkiraDocuments — documentos de conocimiento del salón
//
// ARQUITECTURA:
//   Patrón EGAEL: conocimiento en documentos editables, no en código.
//   El dueño del salón edita documentos y reglas desde el Entrenador.
//   Al publicar, AKIRA usa la nueva config en sus respuestas.
//   consoleIA.web.js importa buildAkiraSystemPrompt() para buildResponse.
// =====================================================
import { webMethod, Permissions } from 'wix-web-module';
import { fetch } from 'wix-fetch';
import wixData from 'wix-data';
import { getSecret } from 'wix-secrets-backend';

const VERSION = '1.0.0';
const TAG = `[AkiraEntrenador][${VERSION}]`;
const AUTH = { suppressAuth: true };

// ═══════════════════════════════════════════════════════════════════════════
// FUNCIONES COMPARTIDAS — usadas por consoleIA.web.js
// ═══════════════════════════════════════════════════════════════════════════

// Caché del alignment publicado (se refresca cada 5 min)
let cachedAlignment = null;
let alignmentCacheTs = 0;
const ALIGNMENT_CACHE_TTL = 5 * 60 * 1000;

export async function getPublishedAlignment() {
  const now = Date.now();
  if (cachedAlignment && (now - alignmentCacheTs) < ALIGNMENT_CACHE_TTL) {
    return cachedAlignment;
  }
  console.log(`${TAG} Leyendo AkiraAlignment publicado...`);
  const result = await wixData.query('AkiraAlignment')
    .eq('status', 'publicado')
    .descending('publicationDate')
    .limit(1)
    .find(AUTH);
  cachedAlignment = result.items.length > 0 ? result.items[0] : null;
  alignmentCacheTs = now;
  if (cachedAlignment) {
    console.log(`${TAG} Alignment v${cachedAlignment.version} cargado`);
  } else {
    console.log(`${TAG} Sin alignment publicado — se usará fallback`);
  }
  return cachedAlignment;
}

// Caché de documentos activos (se refresca cada 5 min)
let cachedDocuments = null;
let documentsCacheTs = 0;
const DOCUMENTS_CACHE_TTL = 5 * 60 * 1000;

export async function getActiveDocuments() {
  const now = Date.now();
  if (cachedDocuments && (now - documentsCacheTs) < DOCUMENTS_CACHE_TTL) {
    return cachedDocuments;
  }
  console.log(`${TAG} Leyendo AkiraDocuments activos...`);
  const result = await wixData.query('AkiraDocuments')
    .eq('activo', true)
    .ascending('orden')
    .limit(50)
    .find(AUTH);
  cachedDocuments = result.items || [];
  documentsCacheTs = now;
  console.log(`${TAG} ${cachedDocuments.length} documentos activos cargados`);
  return cachedDocuments;
}

// Invalidar cachés al guardar/publicar/modificar
function invalidateCache() {
  cachedAlignment = null;
  alignmentCacheTs = 0;
  cachedDocuments = null;
  documentsCacheTs = 0;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONSTRUIR SYSTEM PROMPT DESDE CMS — el corazón de EGAEL para AKIRA
// ═══════════════════════════════════════════════════════════════════════════

export async function buildAkiraSystemPrompt(fechas) {
  const alignment = await getPublishedAlignment();
  const documents = await getActiveDocuments();
  return _buildPrompt(alignment, documents, fechas);
}

// Versión interna que acepta config override (para test del entrenador)
function _buildPrompt(config, documents, fechas) {
  // ── PROMPT BASE ──
  let prompt = '';
  if (config && config.promptBase) {
    prompt = config.promptBase;
  } else {
    // Fallback mínimo si no hay alignment publicado
    prompt = 'Eres AKIRA, la IA interna del salón. Responde de forma concisa y profesional basándote en los datos proporcionados.';
  }

  // ── FECHA ──
  if (fechas) {
    prompt += `\nHOY: ${fechas.hoyNombre} ${fechas.hoyISO}`;
  }

  // ── TONO ──
  if (config) {
    const tones = {
      'formal': '\nTONO: Formal y profesional. Sin emojis ni coloquialismos.',
      'directo': '\nTONO: Directo y al grano. Mínimas palabras, máxima información.',
      'cercano': '\nTONO: Cercano y natural, como un compañero de equipo.'
    };
    prompt += tones[config.tone] || tones['directo'];

    // ── NIVEL DE DETALLE ──
    const details = {
      'breve': '\nNIVEL DE DETALLE: Respuestas breves, máximo 4 líneas.',
      'medio': '\nNIVEL DE DETALLE: Respuestas de extensión media, máximo 8 líneas.',
      'extenso': '\nNIVEL DE DETALLE: Respuestas detalladas, hasta 12 líneas.'
    };
    prompt += details[config.detailLevel] || details['medio'];
  }

  // ── GUARDRAILS ──
  if (config) {
    if (config.grOnlyQuery) {
      prompt += '\nGUARDRAIL: AKIRA es SOLO CONSULTA. NO puedes crear, modificar, cancelar ni reservar nada. Si piden una acción, responde: "No puedo gestionar reservas ni modificaciones. Hazlo desde el sistema de recepción o el calendario de KAMISUITE." NUNCA ofrezcas agendar, reservar ni registrar nada.';
    }
    if (config.grNoInvent) {
      prompt += '\nGUARDRAIL: Datos del JSON son la ÚNICA verdad. NUNCA inventes datos, festivos, nombres, servicios ni cifras que no estén en el JSON. Si no hay datos, di "no he encontrado resultados".';
    }
    if (config.grNoMarkdown) {
      prompt += '\nGUARDRAIL: Responde en texto plano. Sin markdown (**, ##, -, ```). Sin emojis. Sin listas con viñetas.';
    }
    if (config.grConcision) {
      prompt += '\nGUARDRAIL: NUNCA describas tu proceso de cálculo. NUNCA menciones "parsear", "analizar", "buscar trozos", "repaso día a día". Da el RESULTADO directo. Si tu respuesta supera el límite de líneas, ACÓRTALA.';
    }
  }

  // ── INSTRUCCIONES EXTRA DEL DUEÑO ──
  if (config && config.extraInstructions && config.extraInstructions.trim()) {
    prompt += '\n\nINSTRUCCIONES DEL SALÓN:\n' + config.extraInstructions.trim();
  }

  // ── DOCUMENTOS DE CONOCIMIENTO ──
  if (documents && documents.length > 0) {
    prompt += '\n\n=== CONOCIMIENTO DEL SALÓN ===';
    for (let i = 0; i < documents.length; i++) {
      const doc = documents[i];
      prompt += `\n\n--- [${doc.tipo || 'documento'}] ${doc.titulo || 'Documento ' + (i + 1)} ---\n`;
      prompt += (doc.contenido || '');
    }
    prompt += '\n\n=== FIN DEL CONOCIMIENTO ===';
    prompt += '\nEl material anterior es tu fuente prioritaria. Úsalo primero para responder. Si la consulta no está cubierta por los documentos, usa los datos del JSON proporcionado en cada consulta.';
  }

  // ── FORMATO ──
  prompt += '\n\nFORMATO: Texto plano, sin markdown, sin emojis. Español. Importes en euros con €.';

  return prompt;
}

// ═══════════════════════════════════════════════════════════════════════════
// CLAUDE API (para test del entrenador y generación de prompt)
// ═══════════════════════════════════════════════════════════════════════════

async function callClaude(systemPrompt, userMessage, maxTokens = 600) {
  const apiKey = await getSecret('KAMISUITE');
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }]
    })
  });
  const data = await response.json();
  if (data?.content?.[0]?.text) return data.content[0].text;
  throw new Error(data?.error?.message || 'Sin respuesta de Claude');
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. CARGAR CONFIG PARA EL ENTRENADOR
// ═══════════════════════════════════════════════════════════════════════════

export const cargarConfigEntrenador = webMethod(
  Permissions.SiteMember,
  async () => {
    try {
      console.log(`${TAG} cargarConfigEntrenador`);

      // Borrador actual
      const borradorResult = await wixData.query('AkiraAlignment')
        .eq('status', 'borrador')
        .limit(1)
        .find(AUTH);

      // Publicada actual
      const publicada = await getPublishedAlignment();

      // Todos los documentos (activos e inactivos)
      const docsResult = await wixData.query('AkiraDocuments')
        .ascending('orden')
        .limit(50)
        .find(AUTH);

      const documentos = (docsResult.items || []).map(d => ({
        id: d._id,
        titulo: d.titulo,
        tipo: d.tipo,
        resumen: d.resumen,
        activo: d.activo,
        orden: d.orden
      }));

      const activosCount = documentos.filter(d => d.activo).length;

      return {
        ok: true,
        borrador: borradorResult.items.length > 0 ? borradorResult.items[0] : null,
        publicada: publicada,
        documentos: documentos,
        documentosActivos: activosCount
      };
    } catch (e) {
      console.error(`${TAG} cargarConfigEntrenador error:`, e.message);
      return { ok: false, error: e.message };
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// 2. GUARDAR ALIGNMENT (borrador)
// ═══════════════════════════════════════════════════════════════════════════

export const guardarAlignment = webMethod(
  Permissions.SiteMember,
  async ({ config }) => {
    try {
      if (!config) return { ok: false, error: 'config requerido' };
      console.log(`${TAG} guardarAlignment`);

      // Buscar borrador existente
      const existing = await wixData.query('AkiraAlignment')
        .eq('status', 'borrador')
        .limit(1)
        .find(AUTH);

      const registro = {
        promptBase: config.promptBase || '',
        tone: config.tone || 'directo',
        detailLevel: config.detailLevel || 'medio',
        grOnlyQuery: config.grOnlyQuery !== false,
        grNoInvent: config.grNoInvent !== false,
        grNoMarkdown: config.grNoMarkdown !== false,
        grConcision: config.grConcision || false,
        extraInstructions: config.extraInstructions || '',
        version: config.version || '1.0',
        status: 'borrador'
      };

      let saved;
      if (existing.items && existing.items.length > 0) {
        registro._id = existing.items[0]._id;
        registro.title = existing.items[0].title || ('Config v' + registro.version);
        saved = await wixData.update('AkiraAlignment', registro, AUTH);
      } else {
        registro.title = 'Config v' + registro.version;
        saved = await wixData.insert('AkiraAlignment', registro, AUTH);
      }

      invalidateCache();
      return { ok: true, alignmentId: saved._id, version: registro.version };
    } catch (e) {
      console.error(`${TAG} guardarAlignment error:`, e.message);
      return { ok: false, error: e.message };
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// 3. PUBLICAR ALIGNMENT
// ═══════════════════════════════════════════════════════════════════════════

export const publicarAlignment = webMethod(
  Permissions.SiteMember,
  async ({ alignmentId }) => {
    try {
      if (!alignmentId) return { ok: false, error: 'alignmentId requerido' };
      console.log(`${TAG} publicarAlignment: ${alignmentId}`);

      const item = await wixData.get('AkiraAlignment', alignmentId, AUTH);
      if (!item) return { ok: false, error: 'Configuración no encontrada' };

      // Archivar versiones publicadas anteriores
      const anteriores = await wixData.query('AkiraAlignment')
        .eq('status', 'publicado')
        .find(AUTH);
      for (const ant of (anteriores.items || [])) {
        ant.status = 'archivado';
        await wixData.update('AkiraAlignment', ant, AUTH);
      }

      // Calcular nueva versión
      const allVersions = await wixData.query('AkiraAlignment')
        .descending('version')
        .limit(1)
        .find(AUTH);
      let maxVersion = 1.0;
      if (allVersions.items.length > 0) {
        maxVersion = parseFloat(allVersions.items[0].version || '1.0');
      }

      item.status = 'publicado';
      item.publicationDate = new Date();
      item.version = (Math.round((maxVersion + 0.1) * 10) / 10).toFixed(1);
      item.title = 'Config v' + item.version;

      await wixData.update('AkiraAlignment', item, AUTH);
      invalidateCache();

      console.log(`${TAG} Publicado v${item.version}`);
      return { ok: true, version: item.version, fechaPublicacion: item.publicationDate };
    } catch (e) {
      console.error(`${TAG} publicarAlignment error:`, e.message);
      return { ok: false, error: e.message };
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// 4. TEST — probar respuesta con config actual o override
// ═══════════════════════════════════════════════════════════════════════════

export const testAkira = webMethod(
  Permissions.SiteMember,
  async ({ message, configOverride }) => {
    const startMs = Date.now();
    try {
      if (!message) return { ok: false, error: 'message requerido' };
      console.log(`${TAG} testAkira: "${message.substring(0, 50)}..."`);

      const config = configOverride || await getPublishedAlignment();
      if (!config) return { ok: false, error: 'No hay configuración. Guarda y publica una primero.' };

      const documents = await getActiveDocuments();

      // Fechas para el prompt
      const hoyISO = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });
      const dias = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
      const hoyNombre = dias[new Date(hoyISO + 'T12:00:00Z').getUTCDay()];
      const fechas = { hoyISO, hoyNombre };

      const systemPrompt = _buildPrompt(config, documents, fechas);
      const respuesta = await callClaude(systemPrompt, message, 600);

      const tiempoMs = Date.now() - startMs;

      // Guardrails activos para mostrar en UI
      const guardrails = [];
      if (config.grOnlyQuery) guardrails.push('Solo consulta');
      if (config.grNoInvent) guardrails.push('No inventar');
      if (config.grNoMarkdown) guardrails.push('Sin markdown');
      if (config.grConcision) guardrails.push('Anti-verborrea');

      return {
        ok: true,
        response: respuesta,
        systemPromptLength: systemPrompt.length,
        documentsCount: documents.length,
        config: {
          tone: config.tone,
          detailLevel: config.detailLevel,
          guardrails: guardrails,
          version: config.version
        },
        timeMs: tiempoMs
      };
    } catch (e) {
      console.error(`${TAG} testAkira error:`, e.message);
      return { ok: false, error: e.message };
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// 5. GENERAR PROMPT BASE CON IA
// ═══════════════════════════════════════════════════════════════════════════

const META_PROMPT = `Eres un diseñador de prompts experto para asistentes IA internos de negocios.

El usuario es el dueño de un salón de peluquería/belleza que te va a describir su negocio: qué servicios ofrece, quién es su equipo, a quién atiende y qué debería saber hacer su asistente IA interno.

A partir de su descripción, genera un SYSTEM PROMPT para el asistente IA. El prompt debe incluir:

1. IDENTIDAD: Quién es el asistente, para qué salón trabaja, qué nombre tiene.
2. ALCANCE: Qué puede consultar (agenda, facturación, clientes, productos, servicios).
3. EQUIPO: Quiénes son los empleados y sus roles.
4. COMPORTAMIENTO: Cómo responder — directo, conciso, sin inventar datos.
5. RESTRICCIONES: Qué NO debe hacer — inventar datos, ofrecer acciones que no puede ejecutar.
6. FORMATO: Texto plano, español, importes en euros.

REGLAS:
- Escribe el prompt en segunda persona ("Eres...", "Tu función es...", "No debes...").
- Lenguaje claro y directo.
- Solo texto plano con saltos de línea.
- Longitud: entre 150 y 300 palabras.
- Responde SOLO con el prompt generado, sin explicaciones.`;

export const generarPromptAkira = webMethod(
  Permissions.SiteMember,
  async ({ descripcion }) => {
    try {
      if (!descripcion || descripcion.trim().length < 20) {
        return { ok: false, error: 'Describe tu salón con al menos unas frases.' };
      }
      console.log(`${TAG} generarPromptAkira`);
      const prompt = await callClaude(META_PROMPT, descripcion, 800);
      if (!prompt) return { ok: false, error: 'No se pudo generar el prompt.' };
      return { ok: true, prompt };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// 6. CRUD DOCUMENTOS
// ═══════════════════════════════════════════════════════════════════════════

export const crearDocumento = webMethod(
  Permissions.SiteMember,
  async ({ titulo, tipo, contenido, resumen }) => {
    try {
      if (!titulo) return { ok: false, error: 'titulo requerido' };
      if (!contenido) return { ok: false, error: 'contenido requerido' };
      console.log(`${TAG} crearDocumento: "${titulo}" (${tipo})`);

      // Obtener orden máximo actual
      const maxOrden = await wixData.query('AkiraDocuments')
        .descending('orden')
        .limit(1)
        .find(AUTH);
      const nextOrden = maxOrden.items.length > 0 ? (maxOrden.items[0].orden || 0) + 1 : 1;

      const doc = await wixData.insert('AkiraDocuments', {
        title: titulo,
        titulo,
        tipo: tipo || 'otro',
        contenido,
        resumen: resumen || titulo,
        activo: true,
        orden: nextOrden
      }, AUTH);

      invalidateCache();

      return {
        ok: true,
        documento: {
          id: doc._id,
          titulo: doc.titulo,
          tipo: doc.tipo,
          resumen: doc.resumen,
          activo: doc.activo,
          orden: doc.orden
        }
      };
    } catch (e) {
      console.error(`${TAG} crearDocumento error:`, e.message);
      return { ok: false, error: e.message };
    }
  }
);

export const toggleDocumento = webMethod(
  Permissions.SiteMember,
  async ({ documentoId, activo }) => {
    try {
      if (!documentoId) return { ok: false, error: 'documentoId requerido' };
      const doc = await wixData.get('AkiraDocuments', documentoId, AUTH);
      if (!doc) return { ok: false, error: 'Documento no encontrado' };
      doc.activo = activo;
      await wixData.update('AkiraDocuments', doc, AUTH);
      invalidateCache();
      return { ok: true, documentoId, activo };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }
);

export const eliminarDocumento = webMethod(
  Permissions.SiteMember,
  async ({ documentoId }) => {
    try {
      if (!documentoId) return { ok: false, error: 'documentoId requerido' };
      await wixData.remove('AkiraDocuments', documentoId, AUTH);
      invalidateCache();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }
);