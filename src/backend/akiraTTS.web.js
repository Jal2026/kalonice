/* ═══════════════════════════════════════════════════════════════════════════
 * KAMISUITE — AKIRA TTS Backend (Wix Velo)
 * Archivo:  backend/akiraTTS.web.js
 * VERSION:  1.0.1
 * FECHA:    17 Julio 2026
 *
 * CAMBIOS v1.0.0 → v1.0.1 — FIX: EL BOTÓN "ESCUCHAR" SE APAGABA SIN AUDIO.
 *   akiraSynthesize era webMethod con Permissions.SiteMember. http-functions
 *   es un endpoint PÚBLICO que corre SIN sesión de miembro → la llamada era
 *   rechazada y el widget recibía un error, encendiendo y apagando el botón.
 *   CATHOVIA usa Permissions.Anyone en egaelSynthesize precisamente por esto.
 *   FIX: akiraSynthesizeCore (función pura, la que llama http-functions) +
 *   wrapper webMethod Anyone. Mismo patrón que askAkiraCore.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * QUÉ ES ESTE ARCHIVO
 * ───────────────────────────────────────────────────────────────────────────
 *
 * Text-to-Speech de AKIRA. CLON de egaelTTS.web.js v1.3.0 (proyecto CATHOVIA
 * / SABIO VALLEY), adaptado a KAMISUITE. La lógica de síntesis, el OAuth2 y
 * el catálogo de voces son LITERALES: no se ha reinventado nada.
 *
 * NO es Gemini: es Google Cloud Text-to-Speech, autenticado con Service
 * Account (JWT RS256 → OAuth2). Devuelve MP3 base64 reproducible con <audio>.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * DIFERENCIAS CON egaelTTS v1.3.0 (y por qué)
 * ───────────────────────────────────────────────────────────────────────────
 *
 *   1. SIN cursoId. En KAMISUITE no hay cursos. Cada cuenta Wix ES un salón,
 *      así que la voz se lee de SalonConfig (fila única), no de EgaelCourses.
 *   2. Log a AkiraLog, no a EgaelLog.
 *   3. Permissions.Anyone en los wrappers webMethod — IGUAL que egaelSynthesize.
 *      No es dejadez: http-functions corre SIN sesión de miembro y SiteMember
 *      rompería la única ruta que usa el widget. La voz no expone datos del
 *      salón: solo sintetiza el texto recibido.
 *   4. El resto —voces, OAuth2, sanitización, detección de familia,
 *      audioConfig— es copia literal.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * LA VOZ SE ELIGE DESDE CMS — CERO HARDCODING (requisito de Jal)
 * ───────────────────────────────────────────────────────────────────────────
 *
 * Campos NUEVOS a crear en SalonConfig:
 *   · voiceId     TEXT    — id de la voz (p.ej. 'es-ES-Neural2-C')
 *   · voiceRate   NUMBER  — velocidad (solo Neural2). 1.0 = normal
 *   · voicePitch  NUMBER  — tono (solo Neural2). 0.0 = normal
 *
 * Cascada: parámetro explícito > SalonConfig > DEFAULT_VOICE. Cambiar la voz
 * de un salón = editar SalonConfig. Sin tocar código, sin desplegar.
 *
 * ⚠️ Para que el editor de configuración los gestione hay que añadirlos
 * también a ALL_FIELDS de salonConfigLogic.web.js (y voiceRate/voicePitch a
 * NUMBER_FIELDS). Si no, este backend los lee igual pero no habrá UI.
 *
 * akiraListVoices() devuelve el catálogo para pintar un selector.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ⚠️ EL TECHO DE 14s — LEER ANTES DE DAR LA VOZ POR BUENA
 * ───────────────────────────────────────────────────────────────────────────
 *
 * MEDIDO EN PRODUCCIÓN (CATHOVIA, Site Monitoring): el endpoint TTS tiene
 * P95 de 16.954ms y 5,9% de error. REVIENTA el techo de 14s de Wix por la
 * misma razón que la respuesta de texto.
 *
 * Y aquí NO hay red de seguridad: la respuesta de texto se recupera por
 * polling porque queda guardada en AkiraMessages. El audio NO se guarda en
 * ninguna colección → si el fetch se corta, el audio se pierde. Sin más.
 *
 * CONSECUENCIA PRÁCTICA: la voz funcionará bien en respuestas cortas y
 * fallará en las largas. Un consultor que desglosa por profesional genera
 * respuestas largas. Es un límite de la plataforma, no del código.
 *
 * MITIGACIÓN APLICADA: MAX_TEXT = 5000 (igual que EGAEL). Si se quisiera
 * blindar, habría que trocear el texto y encadenar audios — trabajo aparte.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * Precios (referencia, con free tier de 1M chars/mes cada familia):
 *   Neural2:    $16 / 1M chars
 *   Chirp 3 HD: $30 / 1M chars
 *
 * Secret requerido: GOOGLE_SA_JSON  (Service Account de Google Cloud con la
 * API Text-to-Speech habilitada). NO es el mismo que el secret KAMISUITE.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { webMethod, Permissions } from 'wix-web-module';
import { fetch } from 'wix-fetch';
import wixData from 'wix-data';
import { getSecret } from 'wix-secrets-backend';
import crypto from 'crypto';

const AUTH = { suppressAuth: true };
const V = 'AKIRA_TTS v1.0.1';

const TTS_ENDPOINT   = 'https://texttospeech.googleapis.com/v1/text:synthesize';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const TTS_SCOPE      = 'https://www.googleapis.com/auth/cloud-platform';
const MAX_TEXT       = 5000;

const C_SALON = 'SalonConfig';
const C_LOG   = 'AkiraLog';

// ═══════════════════════════════════════════════════════════════════════════
// CATÁLOGO DE VOCES (copia literal de egaelTTS v1.3.0)
// ═══════════════════════════════════════════════════════════════════════════

const NEURAL2_VOICES = [
  { id: 'es-ES-Neural2-A', gender: 'F', notes: 'Femenina neutra' },
  { id: 'es-ES-Neural2-B', gender: 'M', notes: 'Masculina cálida' },
  { id: 'es-ES-Neural2-C', gender: 'F', notes: 'Femenina cálida' },
  { id: 'es-ES-Neural2-D', gender: 'F', notes: 'Femenina brillante y joven' },
  { id: 'es-ES-Neural2-F', gender: 'M', notes: 'Masculina grave, tono solemne' },
];

const CHIRP3HD_VOICES = [
  { id: 'es-ES-Chirp3-HD-Aoede',  gender: 'F', notes: 'Femenina serena' },
  { id: 'es-ES-Chirp3-HD-Kore',   gender: 'F', notes: 'Femenina expresiva' },
  { id: 'es-ES-Chirp3-HD-Leda',   gender: 'F', notes: 'Femenina cálida' },
  { id: 'es-ES-Chirp3-HD-Zephyr', gender: 'F', notes: 'Femenina fresca' },
  { id: 'es-ES-Chirp3-HD-Charon', gender: 'M', notes: 'Masculina profunda' },
  { id: 'es-ES-Chirp3-HD-Fenrir', gender: 'M', notes: 'Masculina firme' },
  { id: 'es-ES-Chirp3-HD-Orus',   gender: 'M', notes: 'Masculina cálida' },
  { id: 'es-ES-Chirp3-HD-Puck',   gender: 'M', notes: 'Masculina joven, cercana' },
];

const ALL_VOICE_IDS = [
  ...NEURAL2_VOICES.map(v => v.id),
  ...CHIRP3HD_VOICES.map(v => v.id),
];

// Fallback de última instancia: solo se usa si SalonConfig.voiceId está vacío.
// NO es hardcoding de negocio — es el valor por defecto de la plataforma,
// editable por salón desde CMS.
const DEFAULT_VOICE = 'es-ES-Neural2-C';
const DEFAULT_SPEAKING_RATE = 1.0;
const DEFAULT_PITCH = 0.0;

let _tokenCache = { token: null, expiresAt: 0 };

// Caché de la voz del salón (evita un wixData.query por cada reproducción)
let _voiceCache = null;
let _voiceCacheTs = 0;
const VOICE_CACHE_TTL = 5 * 60 * 1000;

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function _detectFamily(voiceId) {
  if (voiceId && voiceId.indexOf('Chirp3-HD') !== -1) return 'chirp3hd';
  return 'neural2';
}

/**
 * Lee la voz configurada del salón. SalonConfig es fila única: cada cuenta
 * Wix ES un salón, así que no hay parámetro de tenant.
 */
async function _getVoiceConfig() {
  const now = Date.now();
  if (_voiceCache && (now - _voiceCacheTs) < VOICE_CACHE_TTL) return _voiceCache;
  try {
    const res = await wixData.query(C_SALON).limit(1).find(AUTH);
    const row = res.items.length > 0 ? res.items[0] : null;
    _voiceCache = {
      voiceId:    (row && row.voiceId) || null,
      voiceRate:  (row && typeof row.voiceRate === 'number')  ? row.voiceRate  : null,
      voicePitch: (row && typeof row.voicePitch === 'number') ? row.voicePitch : null
    };
    _voiceCacheTs = now;
    return _voiceCache;
  } catch (e) {
    console.warn(`[${V}] no se pudo leer ${C_SALON}:`, e.message);
    return { voiceId: null, voiceRate: null, voicePitch: null };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN — SÍNTESIS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Lógica de síntesis. Función PURA async, llamable desde http-functions.
 *
 * ⚠️ POR QUÉ FUNCIÓN PURA Y NO SOLO webMethod — CAUSA DEL BOTÓN INERTE:
 * http-functions.js es un endpoint PÚBLICO que se ejecuta SIN sesión de
 * miembro. Un webMethod con Permissions.SiteMember RECHAZA esa llamada, y el
 * botón "Escuchar" se encendía y se apagaba sin audio.
 * CATHOVIA lo evita declarando egaelSynthesize como Permissions.Anyone.
 * Aquí se usa el mismo patrón que askCathoviaCore/askAkiraCore: función pura
 * + wrapper webMethod aparte. La ruta real del widget es el http-function.
 */
export async function akiraSynthesizeCore({ texto, voiceName, speakingRate, pitch }) {
  {
    console.log(`[${V}] akiraSynthesize IN len=${(texto || '').length} voice=${voiceName || 'CMS'}`);

    try {
      if (!texto || !texto.trim()) return { ok: false, error: 'texto requerido' };
      if (texto.length > MAX_TEXT) {
        return { ok: false, error: `El texto excede ${MAX_TEXT} caracteres (${texto.length}).` };
      }

      // 1. Resolver voz, rate y pitch — override > SalonConfig > default
      let voice = voiceName;
      let rate  = (typeof speakingRate === 'number') ? speakingRate : null;
      let pit   = (typeof pitch === 'number') ? pitch : null;

      if (!voice || rate === null || pit === null) {
        const cfg = await _getVoiceConfig();
        if (!voice && cfg.voiceId)          voice = cfg.voiceId;
        if (rate === null && cfg.voiceRate  !== null) rate = cfg.voiceRate;
        if (pit  === null && cfg.voicePitch !== null) pit  = cfg.voicePitch;
      }

      voice = voice || DEFAULT_VOICE;
      rate  = (rate !== null) ? rate : DEFAULT_SPEAKING_RATE;
      pit   = (pit  !== null) ? pit  : DEFAULT_PITCH;

      // 2. Validar contra whitelist
      if (ALL_VOICE_IDS.indexOf(voice) === -1) {
        console.warn(`[${V}] voz "${voice}" no reconocida, usando ${DEFAULT_VOICE}`);
        voice = DEFAULT_VOICE;
      }
      const family = _detectFamily(voice);

      // 3. Construir payload — Chirp 3 HD NO acepta speakingRate ni pitch
      //    (Google los RECHAZA si se envían). Se ignoran en silencio.
      const cleanText = _sanitizeText(texto);
      const audioConfig = { audioEncoding: 'MP3' };
      if (family === 'neural2') {
        audioConfig.speakingRate = rate;
        audioConfig.pitch = pit;
      }
      const body = {
        input: { text: cleanText },
        voice: { languageCode: 'es-ES', name: voice },
        audioConfig
      };

      // 4. Llamada
      const accessToken = await _getAccessToken();
      const startTime = Date.now();

      const response = await fetch(TTS_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify(body)
      });

      const timeMs = Date.now() - startTime;

      if (!response.ok) {
        const errText = await response.text();
        console.error(`[${V}] Cloud TTS ${response.status} (${family}): ${errText.substring(0, 500)}`);
        _log({ voice, family, textoLen: texto.length, timeMs, ok: false, error: `HTTP ${response.status}` });
        return { ok: false, error: `El servicio de voz respondió ${response.status}` };
      }

      const data = await response.json();
      const mp3Base64 = data && data.audioContent;

      if (!mp3Base64) {
        console.error(`[${V}] Respuesta sin audio:`, JSON.stringify(data).substring(0, 500));
        return { ok: false, error: 'El servicio de voz no devolvió audio' };
      }

      console.log(`[${V}] akiraSynthesize OUT ${timeMs}ms voice=${voice} family=${family} mp3Len=${mp3Base64.length}`);
      _log({ voice, family, textoLen: texto.length, timeMs, ok: true });

      return {
        ok: true,
        audioContent: mp3Base64,
        mimeType: 'audio/mpeg',
        voice: voice,
        family: family,
        timeMs: timeMs
      };

    } catch (err) {
      console.error(`[${V}] akiraSynthesize EXCEPTION:`, err.message || err);
      return { ok: false, error: 'Error técnico: ' + (err.message || 'desconocido') };
    }
  }
}

/**
 * Wrapper webMethod para llamadas desde Page Code.
 * Anyone (no SiteMember): la voz no expone datos del salón, solo sintetiza el
 * texto que se le pasa. Mismo criterio que egaelSynthesize en CATHOVIA.
 */
export const akiraSynthesize = webMethod(
  Permissions.Anyone,
  async (params) => akiraSynthesizeCore(params || {})
);

// ═══════════════════════════════════════════════════════════════════════════
// LISTADO DE VOCES DISPONIBLES — para pintar el selector sin hardcoding
// ═══════════════════════════════════════════════════════════════════════════

export const akiraListVoices = webMethod(
  Permissions.Anyone,
  async () => {
    const cfg = await _getVoiceConfig();
    return {
      ok: true,
      defaultVoice: DEFAULT_VOICE,
      currentVoice: cfg.voiceId || DEFAULT_VOICE,
      currentRate:  cfg.voiceRate  !== null ? cfg.voiceRate  : DEFAULT_SPEAKING_RATE,
      currentPitch: cfg.voicePitch !== null ? cfg.voicePitch : DEFAULT_PITCH,
      families: {
        neural2: {
          label: 'Neural2 (voz estándar)',
          pricePer1MChars: 16,
          freeTierPerMonth: 1000000,
          supportsRateAndPitch: true,
          voices: NEURAL2_VOICES
        },
        chirp3hd: {
          label: 'Chirp 3 HD (última generación)',
          pricePer1MChars: 30,
          freeTierPerMonth: 1000000,
          supportsRateAndPitch: false,
          voices: CHIRP3HD_VOICES
        }
      }
    };
  }
);

/** Invalida la caché de voz. Llamar tras guardar SalonConfig. */
export function invalidateVoiceCache() {
  _voiceCache = null;
  _voiceCacheTs = 0;
}

// ═══════════════════════════════════════════════════════════════════════════
// OAUTH2 — JWT RS256 con Service Account (copia literal de egaelTTS v1.3.0)
// ═══════════════════════════════════════════════════════════════════════════

async function _getAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  if (_tokenCache.token && _tokenCache.expiresAt > now + 300) return _tokenCache.token;

  let saJson;
  try { saJson = await getSecret('GOOGLE_SA_JSON'); }
  catch (e) { throw new Error('GOOGLE_SA_JSON no encontrado en Wix Secrets'); }

  let sa;
  try { sa = JSON.parse(saJson); }
  catch (e) { throw new Error('GOOGLE_SA_JSON no es JSON válido'); }

  if (!sa.client_email || !sa.private_key) {
    throw new Error('GOOGLE_SA_JSON no tiene client_email o private_key');
  }

  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss:   sa.client_email,
    scope: TTS_SCOPE,
    aud:   TOKEN_ENDPOINT,
    iat:   now,
    exp:   now + 3600
  };

  const b64url = (obj) => Buffer.from(JSON.stringify(obj))
    .toString('base64')
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  const headerEnc = b64url(header);
  const claimEnc  = b64url(claim);
  const signingInput = `${headerEnc}.${claimEnc}`;

  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signingInput);
  const signature = signer.sign(sa.private_key)
    .toString('base64')
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  const jwt = `${signingInput}.${signature}`;

  const params = new URLSearchParams();
  params.append('grant_type', 'urn:ietf:params:oauth:grant-type:jwt-bearer');
  params.append('assertion', jwt);

  const tokenRes = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    console.error(`[${V}] OAuth token exchange failed ${tokenRes.status}: ${errText.substring(0, 500)}`);
    throw new Error(`OAuth ${tokenRes.status}`);
  }

  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) throw new Error('Sin access_token en respuesta OAuth');

  _tokenCache = {
    token: tokenData.access_token,
    expiresAt: now + (tokenData.expires_in || 3600)
  };
  console.log(`[${V}] access_token nuevo, expira en ${tokenData.expires_in || 3600}s`);

  return _tokenCache.token;
}

// ═══════════════════════════════════════════════════════════════════════════
// SANITIZACIÓN DE TEXTO
// ═══════════════════════════════════════════════════════════════════════════
// Sin esto la voz lee "asterisco asterisco" y los marcadores de card.

function _sanitizeText(text) {
  let t = String(text || '');
  t = t.replace(/\[\[CARD:[a-zA-Z0-9_\-]+\]\]/g, '');
  t = t.replace(/\*\*(.+?)\*\*/g, '$1');
  t = t.replace(/^#{1,6}\s+/gm, '');
  t = t.replace(/^-{3,}$/gm, '');
  t = t.replace(/\*(.+?)\*/g, '$1');
  t = t.replace(/\n{3,}/g, '\n\n').trim();
  return t;
}

// ═══════════════════════════════════════════════════════════════════════════
// LOG — a AkiraLog (campos reales verificados en el CMS)
// ═══════════════════════════════════════════════════════════════════════════

async function _log({ voice, family, textoLen, timeMs, ok, error }) {
  try {
    await wixData.insert(C_LOG, {
      timestamp: new Date(),
      query: `[TTS] ${textoLen} chars`,
      category: 'akira_tts',
      params: JSON.stringify({ voice, family, textoLen, ok }),
      responseSummary: ok ? `audio ${family}` : '',
      version: V,
      timeMs: timeMs || 0,
      error: error || ''
    }, AUTH);
  } catch (_) { }
}