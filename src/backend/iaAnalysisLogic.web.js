// =====================================================
// KAMISUITE - Backend iaAnalysisLogic.web.js
// Módulo: Análisis IA — Care Profile
// =====================================================
// VERSION: 1.0.4
// FECHA: 18 de mayo de 2026
//
// CHANGELOG:
//   v1.0.4 - NEW: Informe dual — diagnosis (profesional) + clientSummary (cliente)
//            La IA genera "resumenCliente" en el JSON: texto empático, positivo,
//            sin terminología clínica, máx 4-5 líneas. Se persiste en campo
//            clientSummary (field ID confirmado) de CareVisitRecord.
//            MAX_TOKENS 2000 → 2500 para dar espacio al resumen adicional.
//   v1.0.3 - NEW: Upload imagen a Wix Media Manager antes de guardar
//            Guarda URL en visitImage del CareVisitRecord
//            Patrón de mediaManager.upload() de promoGiftCardsAdmin
//   v1.0.2 - NEW: SYSTEM_PROMPT multi-zona
//   v1.0.1 - FIX: Refuerzo SYSTEM_PROMPT
//   v1.0.0 - INICIAL
// =====================================================

import { webMethod, Permissions } from 'wix-web-module';
import { fetch } from 'wix-fetch';
import { getSecret } from 'wix-secrets-backend';
import { mediaManager } from 'wix-media-backend';
import wixData from 'wix-data';

const VERSION = '1.0.4';
const TAG = `[IA-Analysis][${VERSION}]`;

// ─────────────────────────────────────────────
// COLECCIONES
// ─────────────────────────────────────────────

const COL_CARE_PROFILE = 'ClientCareProfile';
const COL_CARE_VISIT   = 'CareVisitRecord';

// ─────────────────────────────────────────────
// CONFIGURACIÓN CLAUDE API
// ─────────────────────────────────────────────

const CLAUDE_API_URL    = 'https://api.anthropic.com/v1/messages';
const CLAUDE_MODEL      = 'claude-sonnet-4-6';
const CLAUDE_API_VERSION = '2023-06-01';
const MAX_TOKENS        = 2500;

// ─────────────────────────────────────────────
// SYSTEM PROMPT — DIAGNÓSTICO MULTI-ZONA
// ─────────────────────────────────────────────

const SYSTEM_PROMPT = `Eres un asistente profesional de diagnóstico estético integrado en KAMISUITE, un software de gestión para salones de peluquería y estética. Tu función es analizar fotografías de clientes según la ZONA indicada (cabello, piel, uñas o pestañas) y generar un informe estructurado.

REGLA FUNDAMENTAL — LA IMAGEN MANDA:
- Tu diagnóstico se basa EXCLUSIVAMENTE en lo que VES en la fotografía.
- El historial del cliente es contexto secundario. NUNCA dejes que el historial contradiga lo que ves en la foto.
- Si hay contradicción entre lo que ves y el historial, describe lo que ves y menciona la discrepancia.
- NO suavices ni atenúes tu evaluación para que encaje con un historial de mejora.

IMPORTANTE:
- NO eres médico ni dermatólogo. No diagnosticas enfermedades.
- Describes lo que observas visualmente y clasificas según criterios profesionales.
- Siempre usas lenguaje profesional pero accesible.
- Si observas algo que requiere atención médica, lo mencionas sugiriendo consultar a un especialista.

═══════════════════════════════════════════
ZONA: CABELLO (hair)
═══════════════════════════════════════════
Criterios:
1. TIPO DE CABELLO: 1-Liso, 2A/2B/2C-Ondulado, 3A/3B/3C-Rizado, 4A/4B/4C-Afro
2. GROSOR DEL TALLO: Fino / Medio / Grueso
3. DENSIDAD: Baja / Media / Alta
4. CUERO CABELLUDO: Normal / Graso / Seco / Mixto + condiciones (descamación, caspa, irritación)
5. NIVEL DE DAÑO (1-5): 1=Sano, 2=Leve, 3=Moderado, 4=Severo, 5=Extremo
6. POROSIDAD: Baja / Media / Alta
7. ESTADO QUÍMICO: Virgen / Teñido / Decolorado / Mechas / Alisado químico
8. CRECIMIENTO RAÍZ: Sin raíz visible / <1cm / 1-3cm / 3-6cm / >6cm

═══════════════════════════════════════════
ZONA: UÑAS (nails)
═══════════════════════════════════════════
Criterios:
1. FORMA: Ovalada / Cuadrada / Almendra / Stiletto / Coffin / Natural sin forma definida
2. LARGO: Muy cortas / Cortas / Medias / Largas / Muy largas
3. ESTADO DE LA SUPERFICIE: Lisa y uniforme / Estrías verticales / Estrías horizontales (Beau) / Ondulaciones / Rugosa
4. COLOR: Rosado natural / Amarillento / Blanquecino / Manchas blancas (leuconiquia) / Manchas oscuras / Decoloración
5. CUTÍCULA: Sana y retraída / Seca / Agrietada / Sobrecrecida / Inflamada
6. NIVEL DE DAÑO (1-5): 1=Sanas, 2=Daño leve (sequedad), 3=Moderado (fragilidad, descamación), 4=Severo (rotura, deformación), 5=Extremo (requiere atención médica)
7. ESTADO DE ESMALTE/GEL: Sin esmalte / Esmalte normal / Semipermanente / Gel / Acrílico / Levantado / Descascarado
8. PIEL PERIUNGUEAL: Sana / Seca / Padrastros / Enrojecida / Inflamada

═══════════════════════════════════════════
ZONA: PESTAÑAS (lashes)
═══════════════════════════════════════════
Criterios:
1. DENSIDAD: Escasas / Normales / Abundantes
2. LARGO: Cortas / Medias / Largas
3. CURVATURA: Rectas / Ligeramente curvadas / Curvadas / Muy curvadas
4. ESTADO: Sanas / Debilitadas / Quebradizas / Caída visible
5. EXTENSIONES: Sin extensiones / Con extensiones (pelo a pelo / rusa / efecto) / Restos de adhesivo / Extensiones dañadas
6. NIVEL DE DAÑO (1-5): 1=Sanas, 2=Leve, 3=Moderado, 4=Severo (pérdida visible), 5=Extremo
7. PIEL PÁRPADO: Normal / Enrojecida / Irritada / Hinchada
8. CEJAS (si visibles): Estado general, forma, densidad

═══════════════════════════════════════════
ZONA: PIEL (skin)
═══════════════════════════════════════════
Criterios:
1. TIPO DE PIEL: Normal / Grasa / Seca / Mixta / Sensible
2. TONO: Uniforme / Con manchas / Hiperpigmentación / Rojeces
3. TEXTURA: Suave / Poros visibles / Rugosa / Descamación
4. HIDRATACIÓN: Bien hidratada / Deshidratada / Tirante / Escamosa
5. ARRUGAS/LÍNEAS: Sin líneas / Líneas finas / Arrugas moderadas / Arrugas profundas
6. NIVEL DE DAÑO (1-5): 1=Sana, 2=Leve, 3=Moderado, 4=Severo, 5=Extremo
7. CONDICIONES: Acné / Rosácea / Manchas solares / Cicatrices / Piel reactiva
8. ZONA ANALIZADA: Rostro / Cuello / Escote / Manos / Otra

═══════════════════════════════════════════
FORMATO DE RESPUESTA
═══════════════════════════════════════════
Responde EXCLUSIVAMENTE con un objeto JSON válido, sin texto adicional, sin backticks, sin explicaciones fuera del JSON.

Usa SIEMPRE esta estructura. Adapta los campos según la zona analizada:
- Para CABELLO: tipoCabello=tipo pelo, grosorCabello=grosor, cueroCabelludo=estado cuero, estadoQuimico=procesos, crecimientoRaiz=raíz
- Para UÑAS: tipoCabello=forma uña, grosorCabello=largo, cueroCabelludo=estado superficie, estadoQuimico=tipo esmalte/gel, crecimientoRaiz=estado cutícula
- Para PESTAÑAS: tipoCabello=densidad, grosorCabello=largo, cueroCabelludo=estado párpado, estadoQuimico=extensiones, crecimientoRaiz=curvatura
- Para PIEL: tipoCabello=tipo piel, grosorCabello=textura, cueroCabelludo=tono, estadoQuimico=hidratación, crecimientoRaiz=zona analizada

{
  "tipoCabello": "string — según zona",
  "grosorCabello": "string — según zona",
  "densidad": "string — Baja / Media / Alta",
  "cueroCabelludo": "string — según zona",
  "nivelDano": "number — 1 a 5",
  "nivelDanoDescripcion": "string — descripción del nivel",
  "porosidad": "string — según zona (porosidad para pelo, absorción para piel, flexibilidad para uñas)",
  "estadoQuimico": "string — según zona",
  "crecimientoRaiz": "string — según zona",
  "problemas": ["array de strings — problemas detectados visualmente"],
  "observaciones": "string — descripción detallada de lo que se observa en la imagen",
  "recomendacionesTratamiento": ["array de strings — tratamientos sugeridos"],
  "recomendacionesProductos": ["array de strings — productos recomendados"],
  "proximaVisita": "string — sugerencia de cuándo volver",
  "alertaMedica": "string o null — solo si requiere atención médica",
  "confianza": "string — Alta / Media / Baja",
  "notasCalidadFoto": "string — observaciones sobre la foto",
  "source": "ia-claude",
  "resumenCliente": "string — OBLIGATORIO — resumen para el CLIENTE (ver reglas abajo)"
}

═══════════════════════════════════════════
REGLAS DEL CAMPO "resumenCliente"
═══════════════════════════════════════════
Este campo es lo que el CLIENTE verá. Es completamente diferente del resto del informe, que es para uso interno del profesional. Reglas estrictas:

1. EXTENSIÓN: Máximo 4-5 frases cortas. Nunca más.
2. TONO: Cálido, cercano, positivo. Como una conversación amable con tu estilista de confianza.
3. SIEMPRE EMPIEZA EN POSITIVO: Destaca primero algo bueno que observas ("Tu cabello tiene buena densidad", "El color se mantiene muy bonito", "Tus uñas tienen buena forma natural").
4. NUNCA uses terminología técnica ni clínica: Prohibido "porosidad", "cutícula", "fibra capilar", "queratina", "descamación", "cuero cabelludo", "estado químico", "nivel de daño". El cliente no es profesional.
5. NUNCA cuantifiques daño con números ni escalas: Prohibido "3/5", "nivel moderado", "grado severo".
6. NUNCA uses palabras alarmistas: Prohibido "daño", "deterioro", "progresión", "severo", "extremo", "quebradizo", "rotura", "pérdida". En su lugar usa "necesita algo de mimo", "le vendrá genial un tratamiento de...", "vamos a darle un extra de hidratación".
7. Los problemas se presentan como OPORTUNIDADES DE MEJORA: "Las puntas agradecerán un buen corte" en vez de "puntas abiertas y dañadas".
8. SIEMPRE termina con la recomendación de próxima visita en tono positivo: "Te esperamos en X semanas para seguir cuidándolo" — nunca "debes volver urgentemente".
9. INCLUYE una recomendación de producto para casa en lenguaje sencillo: "En casa, una mascarilla hidratante un par de veces por semana hará maravillas" — nunca listas técnicas de productos.
10. El objetivo es que el cliente se sienta CUIDADO y MOTIVADO, nunca asustado ni culpable.`;

// ─────────────────────────────────────────────
// UTILIDADES
// ─────────────────────────────────────────────

function safeErr(e) {
  return { name: e?.name || 'Error', message: e?.message || String(e) };
}

// v1.0.3: Upload imagen a Wix Media Manager
// Patrón de promoGiftCardsAdmin.web.js
async function uploadImageToMedia(base64Data, mediaType, contactId, zone) {
  try {
    const ext = mediaType === 'image/png' ? 'png' : mediaType === 'image/webp' ? 'webp' : 'jpg';
    const fileName = `care_${zone}_${contactId}_${Date.now()}.${ext}`;
    const buffer = Buffer.from(base64Data, 'base64');

    const result = await mediaManager.upload(
      '/CareProfile',
      buffer,
      fileName,
      {
        mediaOptions: {
          mimeType: mediaType || 'image/jpeg',
          mediaType: 'image',
        },
        metadataOptions: {
          isPrivate: false,
          isVisitorUpload: false,
        },
      }
    );

    const fileUrl = result.fileUrl || '';
    console.log(`${TAG} ✅ Imagen subida: ${fileUrl.substring(0, 60)}...`);
    return fileUrl;
  } catch (e) {
    console.error(`${TAG} ⚠️ Error subiendo imagen:`, e.message);
    return '';
  }
}

function buildClientContext(profile, visits) {
  const parts = [];

  if (profile && profile.notes) {
    parts.push(`NOTAS DEL PROFESIONAL SOBRE ESTE CLIENTE: ${profile.notes}`);
  }

  if (visits && visits.length > 0) {
    parts.push(`HISTORIAL DE VISITAS PREVIAS (${visits.length} registros):`);
    visits.slice(0, 5).forEach((v, i) => {
      const fecha = v.visitDate ? new Date(v.visitDate).toLocaleDateString('es-ES') : 'sin fecha';
      const zone = v.zone || 'sin zona';
      let diagSummary = 'sin diagnóstico';
      if (v.diagnosis) {
        try {
          const d = JSON.parse(v.diagnosis);
          const pieces = [];
          if (d.tipoCabello) pieces.push(`tipo: ${d.tipoCabello}`);
          if (d.nivelDano) pieces.push(`daño: ${d.nivelDano}/5`);
          if (d.problemas && d.problemas.length) pieces.push(`problemas: ${d.problemas.join(', ')}`);
          if (d.observaciones) pieces.push(`obs: ${d.observaciones.substring(0, 100)}`);
          diagSummary = pieces.join(' | ') || 'sin datos';
        } catch (_) {
          diagSummary = v.diagnosis.substring(0, 150);
        }
      }
      parts.push(`  Visita ${i + 1} (${fecha}, zona: ${zone}): ${diagSummary}`);
      if (v.productsRecommended) {
        parts.push(`    Productos recomendados: ${v.productsRecommended}`);
      }
    });
  }

  return parts.length > 0 ? parts.join('\n') : '';
}

async function callClaudeAPI(apiKey, imageBase64, mediaType, clientContext, zone) {
  const userContent = [];

  userContent.push({
    type: 'image',
    source: {
      type: 'base64',
      media_type: mediaType,
      data: imageBase64
    }
  });

  const ZONE_NAMES = { hair: 'CABELLO', nails: 'UÑAS', lashes: 'PESTAÑAS', skin: 'PIEL' };
  const zoneName = ZONE_NAMES[zone] || 'CABELLO';

  let userText = `ZONA A ANALIZAR: ${zoneName}\n\nAnaliza esta fotografía de ${zoneName.toLowerCase()} y genera el informe de diagnóstico en formato JSON. Usa los criterios de la zona ${zoneName} definidos en tus instrucciones. RECUERDA: basa tu diagnóstico EXCLUSIVAMENTE en lo que ves en la imagen. IMPORTANTE: incluye siempre el campo "resumenCliente" con el resumen para el cliente siguiendo las reglas definidas.`;
  if (clientContext) {
    userText += `\n\nCONTEXTO DEL CLIENTE (referencia secundaria, NO debe contradecir lo que ves en la foto):\n${clientContext}`;
    userText += '\n\nSi lo que ves en la foto contradice el historial, describe lo que ves y señala la discrepancia.';
  }
  userContent.push({ type: 'text', text: userText });

  const body = {
    model: CLAUDE_MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [
      { role: 'user', content: userContent }
    ]
  };

  console.log(`${TAG} Llamando a Claude API (modelo: ${CLAUDE_MODEL})...`);

  const response = await fetch(CLAUDE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': CLAUDE_API_VERSION
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error(`${TAG} Claude API error ${response.status}:`, errText);
    throw new Error(`Claude API error ${response.status}: ${errText.substring(0, 200)}`);
  }

  const data = await response.json();
  console.log(`${TAG} Claude API respondió OK — stop_reason: ${data.stop_reason}`);

  const textBlock = (data.content || []).find(b => b.type === 'text');
  if (!textBlock || !textBlock.text) {
    throw new Error('Claude API no devolvió texto en la respuesta');
  }

  return textBlock.text;
}

function parseClaudeResponse(rawText) {
  let cleaned = rawText.trim();

  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3);
  }
  cleaned = cleaned.trim();

  const parsed = JSON.parse(cleaned);
  return parsed;
}

// ─────────────────────────────────────────────
// FUNCIÓN PRINCIPAL: analyzeHairImage
// ─────────────────────────────────────────────

export const analyzeHairImage = webMethod(Permissions.Anyone, async ({
  contactId,
  imageBase64,
  mediaType = 'image/jpeg',
  zone = 'hair',
  saveToRecord = true
}) => {
  try {
    console.log(`${TAG} ═══════════════════════════════════════`);
    console.log(`${TAG} analyzeHairImage — contactId: ${contactId}, zone: ${zone}, save: ${saveToRecord}`);
    console.log(`${TAG} Imagen: ${mediaType}, ~${Math.round((imageBase64 || '').length * 3 / 4 / 1024)} KB`);

    if (!contactId) {
      return { ok: false, error: 'contactId es requerido' };
    }
    if (!imageBase64) {
      return { ok: false, error: 'imageBase64 es requerido' };
    }

    let apiKey;
    try {
      apiKey = await getSecret('KAMISUITE');
    } catch (secretErr) {
      console.error(`${TAG} Error obteniendo secret KAMISUITE:`, secretErr.message);
      return { ok: false, error: 'No se pudo obtener la API key. Verifica el secreto KAMISUITE en Wix Secrets Manager.' };
    }

    if (!apiKey) {
      return { ok: false, error: 'API key vacía en Wix Secrets Manager' };
    }

    // ── Cargar historial del cliente ──
    let clientContext = '';
    try {
      const profileResult = await wixData.query(COL_CARE_PROFILE)
        .eq('contactId', contactId)
        .limit(1)
        .find({ suppressAuth: true });

      const profile = profileResult?.items?.[0] || null;

      const visitsResult = await wixData.query(COL_CARE_VISIT)
        .eq('contactId', contactId)
        .descending('visitDate')
        .limit(10)
        .find({ suppressAuth: true });

      const visits = visitsResult?.items || [];

      clientContext = buildClientContext(profile, visits);
      console.log(`${TAG} Contexto cliente: profile=${!!profile}, visits=${visits.length}`);
    } catch (ctxErr) {
      console.warn(`${TAG} No se pudo cargar contexto (no bloqueante):`, ctxErr.message);
    }

    // ── v1.0.3: Upload imagen a Wix Media en paralelo con Claude API ──
    const [rawResponse, imageWixUrl] = await Promise.all([
      callClaudeAPI(apiKey, imageBase64, mediaType, clientContext, zone),
      saveToRecord ? uploadImageToMedia(imageBase64, mediaType, contactId, zone) : Promise.resolve('')
    ]);

    console.log(`${TAG} Respuesta raw (primeros 200 chars): ${rawResponse.substring(0, 200)}...`);

    // ── Parsear respuesta ──
    let analysis;
    try {
      analysis = parseClaudeResponse(rawResponse);
    } catch (parseErr) {
      console.error(`${TAG} Error parseando JSON:`, parseErr.message);
      console.error(`${TAG} Raw completo:`, rawResponse);
      return {
        ok: false,
        error: 'La IA devolvió un formato no válido. Intenta de nuevo.',
        raw: rawResponse.substring(0, 500)
      };
    }

    console.log(`${TAG} ✅ Análisis parseado — daño: ${analysis.nivelDano}/5, confianza: ${analysis.confianza}`);

    // ── Guardar en CareVisitRecord ──
    let savedRecord = null;
    if (saveToRecord) {
      try {
        const visitRecord = {
          contactId,
          zone,
          visitDate: new Date(),
          diagnosis: JSON.stringify(analysis),
          productsRecommended: (analysis.recomendacionesProductos || []).join(', '),
          staffId: 'IA-KAMISUITE',
          bookingId: '',
          visitImage: imageWixUrl || '',
          clientSummary: analysis.resumenCliente || ''   // v1.0.4: resumen para el cliente
        };

        savedRecord = await wixData.insert(COL_CARE_VISIT, visitRecord, { suppressAuth: true });
        console.log(`${TAG} ✅ CareVisitRecord guardado — _id: ${savedRecord._id}, visitImage: ${imageWixUrl ? 'SÍ' : 'NO'}, clientSummary: ${analysis.resumenCliente ? 'SÍ' : 'NO'}`);
      } catch (saveErr) {
        console.error(`${TAG} Error guardando CareVisitRecord:`, saveErr.message);
      }
    }

    return {
      ok: true,
      analysis,
      recordId: savedRecord?._id || null,
      zone,
      timestamp: new Date().toISOString()
    };

  } catch (e) {
    console.error(`${TAG} analyzeHairImage ERROR GENERAL:`, e.message);
    return { ok: false, error: safeErr(e).message };
  }
});