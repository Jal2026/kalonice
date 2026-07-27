/* ═══════════════════════════════════════════════════════════════════════════
 * KAMISUITE — AKIRA · Page Code
 * Página:   AKIRA (Consultor)
 * VERSION:  1.6.0
 * FECHA:    18 Julio 2026
 *
 * CAMBIOS v1.5.0 → v1.6.0: se oculta la bola flotante del chat IA de Wix en
 * la página de AKIRA (ocultarBolaChatIA). ⚠️ El ID es por página: verificar
 * CHAT_IA_ID contra el ID real de la bola en /akira.
 *
 * CAMBIOS v1.4.0 → v1.5.0 — FIX: EL HISTORIAL NO SALÍA AL ABRIR.
 *   La sidebar aparecía vacía y solo se poblaba tras la primera respuesta.
 *   Causa: se dependía del emit 'akira-load-chats' del custom element, que
 *   puede dispararse antes de que los listeners estén enganchados y se pierde
 *   en silencio. CATHOVIA no depende del emit: tiene cargarEstadoInicial(),
 *   que pide el estado por su cuenta 400ms después del config. Restaurado.
 *
 * CAMBIOS v1.3.0 → v1.4.0: la voz ya NO pasa por aquí. El custom element
 * llama a /_functions/akiraTts por fetch, como CATHOVIA. Listener eliminado.
 *
 * CAMBIOS v1.2.0 → v1.3.0: el logo YA NO se manda desde aquí. Vive en
 * DEFAULT_BRAND del custom element, patrón literal de CATHOVIA. Este page
 * code solo envía lo que varía por salón (el nombre).
 *
 * CAMBIOS v1.0.0 → v1.1.0: voz activada (akiraTTS.web.js). Listener
 * 'akira-tts' + TTS_ENABLED=true. La voz concreta sale de SalonConfig.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * QUÉ HACE (Y QUÉ NO HACE) ESTE ARCHIVO
 * ───────────────────────────────────────────────────────────────────────────
 *
 * Bridge entre el custom element <akira-console> y backend/akiraLogic.web.js.
 *
 * ⚠️ NO GESTIONA LAS PREGUNTAS. Esto es deliberado y es la lección más cara
 * de CATHOVIA: el widget llama DIRECTAMENTE a /_functions/akiraAsk por fetch.
 * Si aquí se añadiera un listener 'akira-query' que también llamara al
 * backend, cada pregunta viajaría por DOS rutas y dispararía DOS llamadas a
 * Anthropic en paralelo, con doble coste. Pasó en CATHOVIA v1.6.1 y el log de
 * producción lo confirmó (dos "askCathoviaCore IN" idénticos). NO AÑADIR.
 *
 * Este page code solo sirve: config inicial, historial, lista de chats y
 * borrado. Todo por setAttribute, que es seguro para estos payloads.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * MULTI-TENANT
 * ───────────────────────────────────────────────────────────────────────────
 * Cada cuenta Wix ES un salón. NO hay cursoId, salonId ni parámetro de
 * tenant. SalonConfig (fila única) es el contexto y lo resuelve el backend.
 * El skin, el brandName y el logo salen de ahí — cero hardcoding.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * CONTROL DE ACCESO
 * ───────────────────────────────────────────────────────────────────────────
 * Por permisos de página de Wix Members (decisión de Jal, 17-Jul-2026).
 * El backend expone akiraVerificarAcceso (PIN + StaffConfig.accessLevel)
 * por si algún día se quiere el patrón de Recepción PRO; hoy NO se usa.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ELEMENT ID
 * ───────────────────────────────────────────────────────────────────────────
 * Este archivo asume que el Custom Element tiene ID #akiraConsole y
 * tag name 'akira-console'. Si en el editor le pones otro ID, cambia
 * EL_ID abajo. Es lo único que hay que tocar.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { currentMember } from 'wix-members-frontend';
import {
  akiraAbrir,
  akiraListarChats,
  akiraAbrirChat,
  akiraBorrarChat
} from 'backend/akiraLogic.web';

// ── CONFIGURACIÓN ──────────────────────────────────────────────────────────

const EL_ID = '#akiraConsole';   // ← ajustar si el Element ID del editor difiere

// Modo del asistente. UN SOLO AKIRA: hoy 'consultor', mañana 'recepcion' o
// 'asistente' sin tocar el custom element ni el backend.
const MODO = 'consultor';

// Voz. Requiere backend/akiraTTS.web.js + secret GOOGLE_SA_JSON.
// La VOZ CONCRETA no se elige aquí: sale de SalonConfig.voiceId (cero
// hardcoding). Este flag solo enciende o apaga la funcionalidad.
const TTS_ENABLED = true;

const V = 'AKIRA Page v1.6.0';

// Bola flotante del chat IA nativo de Wix. Se oculta en la página de AKIRA:
// no queremos dos asistentes compitiendo en pantalla.
// ⚠️ EL ID ES POR PÁGINA. Este viene de otra página (/recepcioncomunicaciones)
// y muy probablemente NO coincide con el de /akira. Verificar el ID real:
// clic en la bola dentro del editor → panel de propiedades → ID. Si no
// coincide, el hide() falla silenciosamente (el try/catch lo absorbe) y la
// bola seguirá visible.
const CHAT_IA_ID = '#f6B6E28D52B24De6Aab3Ff2Ccad8E2291';

// ═══════════════════════════════════════════════════════════════════════════

$w.onReady(async function () {
  console.log(`[${V}] onReady`);

  // Ocultar la bola del chat IA de Wix. Refuerzos porque Wix a veces pinta ese
  // elemento unos ms después del onReady (mismo patrón que la página que ya
  // lo tiene funcionando).
  ocultarBolaChatIA();
  setTimeout(ocultarBolaChatIA, 500);
  setTimeout(ocultarBolaChatIA, 1500);

  let el;
  try {
    el = $w(EL_ID);
  } catch (e) {
    console.error(`[${V}] No existe el custom element ${EL_ID}. Revisa el Element ID en el editor.`);
    return;
  }

  // ── Helper robusto para setAttribute ─────────────────────────────────────
  const trySetAttr = (name, value, retries = 3) => {
    try {
      el.setAttribute(name, value);
      return true;
    } catch (err) {
      console.warn(`[${V}] setAttribute("${name}") fallo:`, err.message);
      if (retries > 0) {
        setTimeout(() => trySetAttr(name, value, retries - 1), 200);
      } else {
        console.error(`[${V}] setAttribute("${name}") ABANDONO tras reintentos`);
      }
      return false;
    }
  };

  // ── Resolver usuario ─────────────────────────────────────────────────────
  // userId alimenta AkiraSessions.usuarioId → historial POR PERSONA.
  let userId = '';
  let userName = '';
  try {
    const member = await currentMember.getMember();
    if (member) {
      userId = member._id || '';
      userName = (member.profile && member.profile.nickname) || member.loginEmail || '';
    }
  } catch (_) { /* anónimo */ }
  console.log(`[${V}] user: ${userId ? userId + ' / ' + userName : 'anónimo'}`);

  // ═════════════════════════════════════════════════════════════════════════
  // LISTENERS — REGISTRAR **ANTES** DE ENVIAR CONFIG
  // El CE emite akira-load-chats / akira-open-chat en cuanto recibe config.
  // Si los listeners no están puestos, esos eventos se pierden.
  // ═════════════════════════════════════════════════════════════════════════

  // NO hay listener 'akira-query'. Ver aviso de la cabecera. NO AÑADIR.

  el.on('akira-open-chat', async (event) => {
    const { sessionId } = event.detail || {};
    if (!sessionId) return;
    try {
      const result = await akiraAbrirChat({ sessionId });
      if (result.ok) {
        // _ts fuerza un JSON distinto en cada envío. Sin él, reabrir el mismo
        // chat manda un atributo idéntico y el browser NO dispara
        // attributeChangedCallback (spec del DOM). Además, el polling del 504
        // depende de que este atributo llegue SIEMPRE. (CATHOVIA v1.4.3)
        trySetAttr('history', JSON.stringify({
          _ts: Date.now(),
          sessionId: result.sessionId,
          mensajes: result.mensajes || []
        }));
      } else {
        console.warn(`[${V}] akiraAbrirChat ERR: ${result.error}`);
      }
    } catch (err) {
      console.error(`[${V}] akiraAbrirChat EXCEPTION:`, err);
    }
  });

  el.on('akira-load-chats', async () => {
    try {
      const result = await akiraListarChats({ userId });
      trySetAttr('chats', JSON.stringify(result.chats || []));
    } catch (err) {
      console.error(`[${V}] akiraListarChats EXCEPTION:`, err);
    }
  });

  el.on('akira-delete-chat', async (event) => {
    const { sessionId } = event.detail || {};
    if (!sessionId) return;
    try {
      const result = await akiraBorrarChat({ sessionId, userId });
      if (!result.ok) console.error(`[${V}] akiraBorrarChat ERR: ${result.error}`);
      // Refrescar la lista desde el backend (autoritativo sobre el optimista).
      const listing = await akiraListarChats({ userId });
      trySetAttr('chats', JSON.stringify(listing.chats || []));
    } catch (err) {
      console.error(`[${V}] akiraBorrarChat EXCEPTION:`, err);
    }
  });

  el.on('akira-ready', () => {
    console.log(`[${V}] custom element listo`);
  });

  // ── VOZ ──
  // NO hay listener 'akira-tts'. El custom element llama DIRECTAMENTE a
  // /_functions/akiraTts por fetch, igual que hace CATHOVIA con egaelTts.
  // Motivo: el audio viaja en base64 y setAttribute TRUNCA payloads grandes.
  // NO AÑADIR un listener aquí: duplicaría la llamada y el coste.

  console.log(`[${V}] listeners registrados`);

  // ═════════════════════════════════════════════════════════════════════════
  // ABRIR CONSOLA Y ENVIAR CONFIG
  // ═════════════════════════════════════════════════════════════════════════

  let abrir;
  try {
    abrir = await akiraAbrir();
    if (!abrir.ok) {
      console.error(`[${V}] akiraAbrir ERR:`, abrir.error);
      setTimeout(() => trySetAttr('systemError', abrir.error || 'No se pudo abrir AKIRA.'), 100);
      return;
    }
  } catch (err) {
    console.error(`[${V}] akiraAbrir EXCEPTION:`, err);
    setTimeout(() => trySetAttr('systemError', 'Error de conexión: ' + err.message), 100);
    return;
  }

  console.log(`[${V}] salón="${abrir.brandName}" skin=${abrir.widgetSkin} align=v${abrir.alignment ? abrir.alignment.version : '-'}`);

  if (!abrir.alignment) {
    console.warn(`[${V}] Sin AkiraAlignment publicado — AKIRA usará su prompt por defecto.`);
  }

  // Marca. El LOGO y el nombre de AKIRA viven en el custom element
  // (DEFAULT_BRAND), igual que en CATHOVIA: son la marca del producto y no
  // dependen de este page code. Aquí solo se envía lo que SÍ varía por salón:
  // el nombre del salón, que sale de SalonConfig.
  const brand = {
    sub: abrir.brandName ? `${abrir.brandName} · Consultor` : 'Consultor',
    welcomeTitle: abrir.brandName ? `AKIRA · ${abrir.brandName}` : 'AKIRA Consultor',
    welcome: 'Pregúntame por el rendimiento de tu salón: facturación, ocupación, profesionales, clientes, conversión. Analizo tus datos reales y te doy conclusiones.',
    placeholder: 'Pregunta por tus datos…',
    thinking: 'Analizando tus datos…'
  };

  const configPayload = JSON.stringify({
    userId,
    userName,
    modo: MODO,
    sessionId: null,          // cada visita arranca en welcome (CATHOVIA v1.5.3)
    skin: abrir.widgetSkin || 'niebla',
    ttsEnabled: TTS_ENABLED,
    brand
  });

  // Carga inicial FORZADA del historial.
  //
  // POR QUÉ HACE FALTA: el custom element emite 'akira-load-chats' desde
  // _applyConfig, pero ese emit puede dispararse antes de que el navegador
  // haya terminado de enganchar los listeners de este page code — y entonces
  // se pierde en silencio. Síntoma: la sidebar aparece vacía al abrir y solo
  // se puebla tras la primera respuesta (que emite de nuevo el evento).
  //
  // La solución es la de CATHOVIA (cargarEstadoInicial): NO depender del emit.
  // El page code pide los chats por su cuenta y los empuja con setAttribute.
  const cargarEstadoInicial = async () => {
    try {
      const chats = await akiraListarChats({ userId });
      trySetAttr('chats', JSON.stringify(chats.chats || []));
      console.log(`[${V}] estado inicial: ${(chats.chats || []).length} conversaciones`);
    } catch (err) {
      console.error(`[${V}] cargarEstadoInicial EXCEPTION:`, err);
    }
  };

  setTimeout(() => {
    console.log(`[${V}] enviando config al custom element`);
    trySetAttr('config', configPayload);
    setTimeout(cargarEstadoInicial, 400);
  }, 150);
});

function ocultarBolaChatIA() {
  try {
    $w(CHAT_IA_ID).hide();
    console.log('[Chat IA] Bola flotante ocultada', { id: CHAT_IA_ID });
  } catch (e) {
    console.warn('[Chat IA] No se pudo ocultar. Revisa si el ID existe en esta página.', {
      id: CHAT_IA_ID
    });
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * NOTA — CAMPOS CMS QUE REQUIERE LA VOZ
 * ═══════════════════════════════════════════════════════════════════════════
 * SalonConfig solo necesita UN campo para que la voz sea configurable por
 * salón sin tocar código:
 *     voiceId     Texto   — p.ej. 'es-ES-Chirp3-HD-Leda'
 *
 * OPCIONALES (igual que en CATHOVIA, donde tampoco existen en el CMS):
 *     voiceRate   Número  — velocidad. Solo Neural2. Default 1.0
 *     voicePitch  Número  — tono.      Solo Neural2. Default 0.0
 * Si no existen, akiraTTS cae a los defaults sin fallar. Las voces Chirp 3 HD
 * ignoran rate y pitch de todos modos: con voiceId basta.
 * akiraListVoices() devuelve el catálogo completo para pintar el selector.
 * ═══════════════════════════════════════════════════════════════════════════
 */