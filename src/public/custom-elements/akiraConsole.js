/* ═══════════════════════════════════════════════════════════════════════════
 * KAMISUITE — AKIRA Console (Wix Custom Element)
 * Archivo:  public/custom-elements/akiraConsole.js
 * Tag name: akira-console
 * VERSION:  1.0.4
 * FECHA:    17 Julio 2026
 *
 * CAMBIOS v1.0.3 → v1.0.4 — TTS CLONADO LITERAL DE CATHOVIA.
 *   El botón quedaba inerte porque yo había inventado una ruta propia:
 *   emit('akira-tts') → Page Code → setAttribute('ttsAudio'). CATHOVIA NO
 *   hace eso: llama por fetch a /_functions/egaelTts y invoca _applyTtsAudio
 *   DIRECTAMENTE. Sin evento, sin Page Code, sin setAttribute (que además
 *   trunca payloads grandes, y un MP3 en base64 lo es).
 *   Ahora es copia literal: _onTtsButtonClick → _fetchTts → _applyTtsAudio
 *   → _playAudioBase64. Requiere el endpoint post_akiraTts.
 *
 * CAMBIOS v1.0.2 → v1.0.3 — FIX: LA VOZ NO SONABA.
 *   observedAttributes declaraba 'ttsAudio' en camelCase, pero el DOM
 *   MINÚSCULIZA los nombres de atributo: setAttribute('ttsAudio') crea
 *   "ttsaudio". Nunca coincidían → attributeChangedCallback no se disparaba
 *   → el audio llegaba del backend y se descartaba en silencio. Igual con
 *   ttsError y systemError. Bug heredado de CATHOVIA v1.6.5 (allí el TTS
 *   tampoco funciona por esto, aunque no se haya detectado).
 *   FIX: se declaran ambas grafías y attributeChangedCallback normaliza a
 *   minúsculas. Añadidos logs en todo el circuito TTS.
 *
 * CAMBIOS v1.0.1 → v1.0.2: el logo de AKIRA pasa a DEFAULT_BRAND, como en
 * CATHOVIA. Antes lo mandaba el page code y no llegaba.
 *
 * CAMBIOS v1.0.0 → v1.0.1: fix mimeType por defecto 'audio/wav' → 'audio/mpeg'
 * (Google Cloud TTS devuelve MP3, no WAV).
 *
 * ───────────────────────────────────────────────────────────────────────────
 * QUÉ ES ESTE ARCHIVO
 * ───────────────────────────────────────────────────────────────────────────
 *
 * Consola conversacional de AKIRA V2. Motor EGAEL 3.0, portado literalmente
 * del proyecto CATHOVIA (cathoviaConsole.js v1.6.5) y adaptado a KAMISUITE.
 *
 * UN SOLO AKIRA (decisión de Jal, 17-Jul-2026). El modo llega por config:
 * hoy 'consultor', mañana 'recepcion' o 'asistente', SIN tocar este archivo.
 * El modo determina el prompt, los guardrails y el conocimiento — todo desde
 * CMS (AkiraAlignment / AkiraDocuments). Cero hardcoding de comportamiento.
 *
 * NO sustituye a akiraConsole.js v0.6.4 (V1). Son archivos distintos: V1
 * sigue vivo hasta que Jal lo apague.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * QUÉ SE PORTA DE EGAEL 3.0 (y por qué)
 * ───────────────────────────────────────────────────────────────────────────
 *
 *   · SIDEBAR DE HISTORIAL multi-sesión con borrado y modal de confirmación.
 *   · FETCH HTTP DIRECTO a /_functions/akiraAsk. NO pasa por Page Code:
 *     evita el truncado de setAttribute con payloads grandes y elimina un
 *     salto de red. (CATHOVIA v1.6.1)
 *   · POLLING DE RECUPERACIÓN DEL 504 — la pieza más importante para
 *     KAMISUITE. Wix corta la CONEXIÓN al cliente a los ~14s, pero el
 *     backend SIGUE EJECUTÁNDOSE y guarda la respuesta en AkiraMessages.
 *     El widget hace polling cada 3s durante 60s buscándola. El usuario ve
 *     "pensando…" y luego la respuesta, sin enterarse del corte.
 *     MEDIDO EN PRODUCCIÓN CATHOVIA, no supuesto. (v1.6.2)
 *   · TTS + MICRÓFONO: portados literalmente. El botón de voz se enciende con
 *     config.ttsEnabled (page code). Backend: akiraTTS.web.js → Google Cloud
 *     TTS, que devuelve MP3. La VOZ CONCRETA sale de SalonConfig.voiceId:
 *     este archivo no sabe qué voz es ni debe saberlo.
 *   · PANEL LATERAL: montado y VACÍO. Sin cursos ni contenidos (decisión de
 *     Jal: "no queremos de momento cursos ni contenidos pero lo dejamos
 *     preparado para futuros usos"). La fontanería de [[CARD:id]] y el
 *     catálogo inline quedan intactas para cuando lleguen los informes.
 *
 * NO SE PORTA: cursoId. Cada cuenta Wix ES un salón (multi-tenant real).
 *
 * ───────────────────────────────────────────────────────────────────────────
 * SKINS — MAPEO QUIRÚRGICO (decisión de Jal: "quirúrgico al menos que
 * respire aspecto de colores similares")
 * ───────────────────────────────────────────────────────────────────────────
 *
 * CATHOVIA usa 9 variables propias (--bg, --surface, --card, --ink,
 * --ink-soft, --muted, --hairline, --accent, --accent-ink). KAMISUITE usa
 * los tokens --kr-* de KR_SKINS con 7 pieles.
 *
 * NO se reescribe el CSS: se MAPEAN los --kr-* a las variables de CATHOVIA.
 * El layout, tamaños, márgenes y estructura quedan INTACTOS. Solo cambia la
 * paleta. Ver KR_MAP más abajo.
 *
 *   --bg         ← --kr-bg
 *   --surface    ← --kr-surface
 *   --card       ← --kr-surface-2
 *   --ink        ← --kr-ink
 *   --ink-soft   ← --kr-ink-2
 *   --muted      ← --kr-ink-3
 *   --hairline   ← --kr-line
 *   --accent     ← --kr-accent
 *   --accent-ink ← --kr-accent-ink
 *
 * TRES CAUTELAS RESUELTAS (verificadas en el bundle canónico v2.0.15):
 *
 *   1. `niebla` tiene tokens:{} — sus valores son los defaults :host de
 *      kr-styles.js. Sin ellos, niebla se quedaría SIN COLORES. Por eso
 *      KR_NIEBLA_DEFAULTS replica esos defaults literalmente.
 *
 *   2. `--kr-accent-ink` NO existe en arena, botanica ni niebla-tokens.
 *      Es el color del texto SOBRE el acento (botón "+ Nuevo", ::selection).
 *      Se resuelve por cascada: token del skin → default :host
 *      (oklch(98.5% 0.003 250)). En los 7 skins --kr-accent es oscuro
 *      (luminosidad 22-56%), así que una tinta clara encima funciona en
 *      todos. Es DERIVACIÓN por el patrón ya establecido en la bitácora
 *      del 1-Jul §14.3, no invención.
 *
 *   3. `aurora` trae --kr-font propio (Instrument Sans). Se respeta.
 *      El resto usa Bai Jamjuree, fuente aprobada KAMISUITE.
 *
 * FUENTES: @font-face en Shadow DOM vía <link> en el documento padre.
 * NUNCA @import dentro del Shadow DOM (regla Manual Técnico §13). CATHOVIA
 * usaba @import; aquí se inyecta el <link> en el head una sola vez.
 *
 * SINCRONIZACIÓN: si cambian los skins en kr-skins.js, actualizar KR_SKINS
 * de este archivo. Misma nota que ya lleva widget_salon_config.html.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * COMUNICACIÓN (patrón Custom Element, Manual Técnico §11.1)
 * ───────────────────────────────────────────────────────────────────────────
 *   Page → CE:  el.setAttribute('response', JSON.stringify({...}))
 *   CE → Page:  el.dispatchEvent(new CustomEvent('akira-message', {detail}))
 *
 * Eventos emitidos:
 *   akira-ready · akira-load-chats · akira-open-chat · akira-delete-chat
 * ═══════════════════════════════════════════════════════════════════════════
 */

(function () {
  'use strict';

  if (customElements.get('akira-console')) {
    console.log('[AKIRA v1.0.4] Ya registrado.');
    return;
  }

  const VERSION = '1.0.4';
  const TAG = `[AKIRA v${VERSION}]`;

  const LS_SIDEBAR = 'akira-sidebar-open';
  const LS_PANEL   = 'akira-panel-open';
  const LS_TTS_AUTO = 'akira-tts-auto';

  // ── Polling de recuperación del 504 (CATHOVIA v1.6.2) ──
  // Wix corta la conexión cliente↔backend a los ~14s. El backend SIGUE
  // ejecutándose y guarda la respuesta en AkiraMessages. Vamos a buscarla.
  const POLL_INTERVAL_MS  = 3000;
  const POLL_MAX_ATTEMPTS = 20;   // 20 × 3s = 60s

  // ── Micrófono ──
  const SILENCE_MS = 2200;
  const SAFETY_MS  = 12000;

  const UA = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
  const IS_ANDROID = /Android/.test(UA);

  // ═════════════════════════════════════════════════════════════════════════
  // KR_SKINS — copia literal del bundle canónico kamisuite-widget-bundle
  // v2.0.15. NO editar a mano: sincronizar con kr-skins.js.
  // ═════════════════════════════════════════════════════════════════════════

  const KR_SKINS = {
    niebla: {
      group: "neutra", label: "Niebla", note: "Fría · de arranque",
      tokens: {} /* los defaults :host YA son Niebla → ver KR_NIEBLA_DEFAULTS */
    },
    arena: {
      group: "neutra", label: "Arena", note: "Cálida · papel",
      tokens: {
        "--kr-bg": "oklch(98.4% 0.009 78)",
        "--kr-surface": "oklch(99.6% 0.006 80)",
        "--kr-surface-2": "oklch(97% 0.012 78)",
        "--kr-inset": "oklch(95.6% 0.014 76)",
        "--kr-line": "oklch(90% 0.016 72)",
        "--kr-line-2": "oklch(82% 0.02 68)",
        "--kr-ink": "oklch(31% 0.018 60)",
        "--kr-ink-2": "oklch(48% 0.016 60)",
        "--kr-ink-3": "oklch(64% 0.014 62)",
        "--kr-accent": "oklch(42% 0.028 64)",
        "--kr-accent-2": "oklch(35% 0.03 62)",
        "--kr-accent-soft": "oklch(93% 0.022 72)",
        "--kr-accent-line": "oklch(64% 0.026 66)",
        "--kr-focus": "oklch(58% 0.09 70)",
        "--kr-radius": "13px"
      }
    },
    grafito: {
      group: "neutra", label: "Grafito", note: "Puro · alto contraste",
      tokens: {
        "--kr-bg": "oklch(99% 0 0)",
        "--kr-surface": "oklch(100% 0 0)",
        "--kr-surface-2": "oklch(97% 0 0)",
        "--kr-inset": "oklch(95.5% 0 0)",
        "--kr-line": "oklch(89% 0 0)",
        "--kr-line-2": "oklch(80% 0 0)",
        "--kr-ink": "oklch(20% 0 0)",
        "--kr-ink-2": "oklch(42% 0 0)",
        "--kr-ink-3": "oklch(62% 0 0)",
        "--kr-accent": "oklch(22% 0 0)",
        "--kr-accent-2": "oklch(12% 0 0)",
        "--kr-accent-ink": "oklch(99% 0 0)",
        "--kr-accent-soft": "oklch(94.5% 0 0)",
        "--kr-accent-line": "oklch(55% 0 0)",
        "--kr-focus": "oklch(50% 0 0)",
        "--kr-radius": "6px"
      }
    },
    lumiere: {
      group: "salon", label: "Lumière", note: "Lujo · latón",
      tokens: {
        "--kr-bg": "oklch(98.2% 0.012 88)",
        "--kr-surface": "oklch(99.6% 0.008 88)",
        "--kr-surface-2": "oklch(96.6% 0.016 86)",
        "--kr-inset": "oklch(95% 0.02 84)",
        "--kr-line": "oklch(90% 0.022 82)",
        "--kr-line-2": "oklch(80% 0.03 80)",
        "--kr-ink": "oklch(26% 0.012 70)",
        "--kr-ink-2": "oklch(45% 0.014 72)",
        "--kr-ink-3": "oklch(62% 0.018 76)",
        "--kr-accent": "oklch(56% 0.085 78)",
        "--kr-accent-2": "oklch(47% 0.08 74)",
        "--kr-accent-ink": "oklch(99% 0.01 88)",
        "--kr-accent-soft": "oklch(93% 0.035 84)",
        "--kr-accent-line": "oklch(66% 0.075 80)",
        "--kr-focus": "oklch(58% 0.085 78)",
        "--kr-radius": "4px"
      }
    },
    botanica: {
      group: "salon", label: "Botánica", note: "Fresco · verde",
      tokens: {
        "--kr-bg": "oklch(98.6% 0.01 150)",
        "--kr-surface": "oklch(99.8% 0.006 150)",
        "--kr-surface-2": "oklch(97% 0.016 152)",
        "--kr-inset": "oklch(95.4% 0.02 152)",
        "--kr-line": "oklch(90% 0.022 154)",
        "--kr-line-2": "oklch(81% 0.03 156)",
        "--kr-ink": "oklch(28% 0.025 160)",
        "--kr-ink-2": "oklch(46% 0.022 158)",
        "--kr-ink-3": "oklch(63% 0.02 156)",
        "--kr-accent": "oklch(48% 0.09 156)",
        "--kr-accent-2": "oklch(40% 0.085 158)",
        "--kr-accent-soft": "oklch(93% 0.03 152)",
        "--kr-accent-line": "oklch(62% 0.08 156)",
        "--kr-focus": "oklch(56% 0.1 156)",
        "--kr-radius": "16px"
      }
    },
    aurora: {
      group: "salon", label: "Aurora", note: "Moderno · magenta",
      tokens: {
        "--kr-bg": "oklch(98.7% 0.006 320)",
        "--kr-surface": "oklch(100% 0 0)",
        "--kr-surface-2": "oklch(97.4% 0.01 322)",
        "--kr-inset": "oklch(96% 0.014 326)",
        "--kr-line": "oklch(91% 0.016 330)",
        "--kr-line-2": "oklch(82% 0.024 336)",
        "--kr-ink": "oklch(27% 0.03 326)",
        "--kr-ink-2": "oklch(46% 0.026 330)",
        "--kr-ink-3": "oklch(64% 0.022 334)",
        "--kr-accent": "oklch(56% 0.16 350)",
        "--kr-accent-2": "oklch(48% 0.17 352)",
        "--kr-accent-soft": "oklch(94% 0.04 348)",
        "--kr-accent-line": "oklch(66% 0.14 350)",
        "--kr-focus": "oklch(58% 0.16 350)",
        "--kr-radius": "12px",
        "--kr-font": '"Instrument Sans", ui-sans-serif, system-ui, sans-serif'
      }
    },
    oceano: {
      group: "salon", label: "Azul Océano", note: "Celeste · marino",
      tokens: {
        "--kr-bg": "oklch(98.4% 0.012 232)",
        "--kr-surface": "oklch(99.7% 0.007 232)",
        "--kr-surface-2": "oklch(97% 0.018 233)",
        "--kr-inset": "oklch(95.2% 0.024 233)",
        "--kr-line": "oklch(90% 0.028 234)",
        "--kr-line-2": "oklch(80.5% 0.042 236)",
        "--kr-ink": "oklch(28% 0.045 250)",
        "--kr-ink-2": "oklch(46% 0.038 248)",
        "--kr-ink-3": "oklch(63% 0.032 244)",
        "--kr-accent": "oklch(50% 0.13 244)",
        "--kr-accent-2": "oklch(42% 0.14 246)",
        "--kr-accent-ink": "oklch(99% 0.015 233)",
        "--kr-accent-soft": "oklch(93% 0.038 234)",
        "--kr-accent-line": "oklch(64% 0.11 240)",
        "--kr-focus": "oklch(58% 0.14 244)",
        "--kr-radius": "12px"
      }
    }
  };

  /**
   * Defaults :host de kr-styles.js del bundle canónico = piel NIEBLA.
   * CRÍTICO: niebla tiene tokens:{} porque en el bundle hereda estos
   * valores del :host. Aquí NO hay ese :host, así que sin esta constante
   * niebla se quedaría sin colores. Copia literal de kr-styles.js v2.0.15.
   */
  const KR_NIEBLA_DEFAULTS = {
    "--kr-bg": "oklch(98.6% 0.003 250)",
    "--kr-surface": "oklch(100% 0 0)",
    "--kr-surface-2": "oklch(97.4% 0.004 250)",
    "--kr-inset": "oklch(96.2% 0.005 252)",
    "--kr-line": "oklch(91% 0.006 252)",
    "--kr-line-2": "oklch(84% 0.008 252)",
    "--kr-ink": "oklch(30% 0.013 258)",
    "--kr-ink-2": "oklch(48% 0.011 258)",
    "--kr-ink-3": "oklch(64% 0.009 258)",
    "--kr-accent": "oklch(40% 0.022 258)",
    "--kr-accent-2": "oklch(33% 0.024 258)",
    "--kr-accent-ink": "oklch(98.5% 0.003 250)",
    "--kr-accent-soft": "oklch(93.5% 0.012 256)",
    "--kr-accent-line": "oklch(62% 0.02 256)",
    "--kr-focus": "oklch(58% 0.13 256)",
    "--kr-radius": "10px",
    "--kr-font": '"Bai Jamjuree", ui-sans-serif, system-ui, sans-serif'
  };

  /** Mapeo quirúrgico: variable de la consola ← token KR. */
  const KR_MAP = {
    bg:        '--kr-bg',
    surface:   '--kr-surface',
    card:      '--kr-surface-2',
    ink:       '--kr-ink',
    inkSoft:   '--kr-ink-2',
    muted:     '--kr-ink-3',
    hairline:  '--kr-line',
    accent:    '--kr-accent',
    accentInk: '--kr-accent-ink'
  };

  const SKIN_FALLBACK = 'niebla';

  /**
   * Resuelve una piel KR a las 9 variables de la consola.
   * Cascada por token: skin → defaults Niebla. Así ninguna variable queda
   * vacía aunque el skin no la defina (caso --kr-accent-ink en arena,
   * botanica y niebla).
   */
  function resolverSkin(nombreSkin) {
    const skin = KR_SKINS[nombreSkin] || KR_SKINS[SKIN_FALLBACK];
    const t = { ...KR_NIEBLA_DEFAULTS, ...(skin.tokens || {}) };
    const colors = {};
    for (const [clave, token] of Object.entries(KR_MAP)) {
      colors[clave] = t[token] || KR_NIEBLA_DEFAULTS[token] || '';
    }
    return {
      colors,
      font: t['--kr-font'] || KR_NIEBLA_DEFAULTS['--kr-font'],
      radius: t['--kr-radius'] || KR_NIEBLA_DEFAULTS['--kr-radius'],
      accentSoft: t['--kr-accent-soft'] || KR_NIEBLA_DEFAULTS['--kr-accent-soft'],
      focus: t['--kr-focus'] || KR_NIEBLA_DEFAULTS['--kr-focus'],
      label: skin.label || 'Niebla'
    };
  }

  /**
   * Carga las fuentes KAMISUITE con <link> en el head del documento padre.
   * NUNCA @import dentro del Shadow DOM (regla Manual Técnico §13).
   * Misma URL que el bundle público y widget_salon_config.
   */
  const FONTS_LINK_ID = 'kamisuite-akira-fonts';
  function ensureFonts() {
    try {
      if (document.getElementById(FONTS_LINK_ID)) return;
      const link = document.createElement('link');
      link.id = FONTS_LINK_ID;
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=Bai+Jamjuree:wght@400;500;600;700&family=Instrument+Sans:wght@400;500;600;700&display=swap';
      document.head.appendChild(link);
    } catch (_) { /* si falla, cae a la fuente de sistema */ }
  }

  const DEFAULT_BRAND = {
    name:         'AKIRA',
    sub:          'Consultor',
    // Logo de AKIRA. Va AQUÍ, no en el page code — patrón literal de CATHOVIA
    // (cathoviaConsole v1.6.5 DEFAULT_BRAND.logo). Es la marca del PRODUCTO:
    // idéntica en todos los salones, así que no depende de ningún backend ni
    // se puede perder por un fallo del page code.
    // URL CRUDA de Media Manager terminada en ~mv2.png. NUNCA la URL con
    // /v1/fill/w_,h_,al_c,q_85,enc_auto/ — ese pipeline aplana el alfa contra
    // blanco y produce el marco blanco. (CATHOVIA v1.6.5)
    logo:         'https://static.wixstatic.com/media/420ca1_4b928a4bd47a425882e67e0205301e20~mv2.png',
    welcomeTitle: 'AKIRA Consultor',
    welcome:      'Pregúntame por el rendimiento de tu salón: facturación, ocupación, profesionales, clientes, conversión. Analizo tus datos reales y te doy conclusiones.',
    placeholder:  'Pregunta por tus datos…',
    thinking:     'Analizando tus datos…'
  };

  function isMobileViewport() {
    try { return window.matchMedia('(max-width: 900px)').matches; }
    catch (_) { return window.innerWidth < 900; }
  }

  class AkiraConsole extends HTMLElement {

    static get observedAttributes() {
      // ⚠️ EL DOM MINÚSCULIZA LOS NOMBRES DE ATRIBUTO. setAttribute('ttsAudio')
      // crea el atributo "ttsaudio". Si aquí solo se declara 'ttsAudio' en
      // camelCase, NUNCA coincide → attributeChangedCallback no se dispara →
      // el audio no suena y el error no se ve. Bug heredado de CATHOVIA
      // v1.6.5, donde afecta igual a ttsAudio/ttsError/systemError.
      // Se declaran AMBAS grafías: la minúscula es la que el DOM usa de
      // verdad; la camelCase se mantiene por si alguna versión de Wix
      // preservara el case. attributeChangedCallback normaliza.
      return [
        'config', 'response', 'chats', 'history',
        'ttsaudio', 'ttserror', 'systemerror',
        'ttsAudio', 'ttsError', 'systemError'
      ];
    }

    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this._userId    = '';
      this._userName  = '';
      this._modo      = 'consultor';
      this._sessionId = null;
      this._chats     = [];
      this._pending   = false;
      this._pendingId = null;
      this._msgCounter = 0;
      this._hasMessages = false;
      this._brand  = { ...DEFAULT_BRAND };
      this._skin   = SKIN_FALLBACK;
      this._theme  = resolverSkin(SKIN_FALLBACK);
      this._ttsEnabled = false;   // el backend TTS de KAMISUITE no existe aún

      // Polling de recuperación del 504
      this._lastQuery      = '';
      this._polling        = false;
      this._pollTimer      = null;
      this._pollAttempts   = 0;
      this._lastErrorBlock = null;

      // TTS
      this._ttsAutoPlay = this._readLS(LS_TTS_AUTO, false);
      this._audioEl = null;
      this._playingMessageId = null;

      // Micrófono
      this._SR = null;
      this._recognition = null;
      this._isListening = false;
      this._silenceTimer = null;
      this._safetyTimer = null;
      this._androidFinalBuffer = '';
      this._lastFinalTranscript = '';

      const mobile = isMobileViewport();
      this._sidebarOpen = mobile ? false : this._readLS(LS_SIDEBAR, true);
      this._panelOpen   = false;
    }

    connectedCallback() {
      ensureFonts();
      this._render();
      this._bindEvents();
      this._renderWelcome();
      this._setupMic();
      setTimeout(() => this._emit('akira-ready', {}), 50);
      console.log(`${TAG} Montado. skin=${this._skin} sidebar=${this._sidebarOpen}`);
    }

    attributeChangedCallback(name, oldVal, newVal) {
      if (!newVal) return;
      // El DOM entrega el nombre en minúsculas. Se normaliza para que dé
      // igual cómo lo escriba el page code. Ver observedAttributes.
      const attr = String(name || '').toLowerCase();
      console.log(`${TAG} attr "${attr}" len=${(newVal || '').length}`);

      // NO se aplica short-circuit oldVal===newVal: al reabrir un chat el
      // JSON puede llegar idéntico y hay que re-renderizar igualmente.
      // (lección CATHOVIA v1.4.2)
      if (attr === 'systemerror') { this._showSystemError(newVal); return; }
      let payload;
      try { payload = JSON.parse(newVal); } catch (e) {
        console.warn(`${TAG} atributo "${attr}" no es JSON válido`);
        return;
      }

      if (attr === 'config')   this._applyConfig(payload);
      if (attr === 'response') this._handleResponse(payload);
      if (attr === 'chats')    this._applyChats(payload);
      if (attr === 'history')  this._applyHistory(payload);
      if (attr === 'ttsaudio') this._applyTtsAudio(payload);
      if (attr === 'ttserror') this._applyTtsError(payload);
    }

    _applyConfig(cfg) {
      console.log(`${TAG} applyConfig`, cfg);
      if (cfg.userId)     this._userId    = cfg.userId;
      if (cfg.userName)   this._userName  = cfg.userName;
      if (cfg.modo)       this._modo      = cfg.modo;
      if (cfg.sessionId)  this._sessionId = cfg.sessionId;
      if (cfg.ttsEnabled === true) this._ttsEnabled = true;

      // Skin desde SalonConfig.widgetSkin. Fallback 'niebla', coherente con
      // widget público, bonos, PRIME y Área de Cliente (bitácora 1-Jul §14.4).
      if (cfg.skin && KR_SKINS[cfg.skin]) this._skin = cfg.skin;
      else if (cfg.skin) console.warn(`${TAG} skin "${cfg.skin}" desconocida → ${SKIN_FALLBACK}`);
      this._theme = resolverSkin(this._skin);

      if (cfg.brand) this._brand = { ...DEFAULT_BRAND, ...cfg.brand };

      this._render();
      this._bindEvents();
      if (this._sessionId) {
        this._emit('akira-open-chat', { sessionId: this._sessionId });
      } else {
        this._renderWelcome();
      }
      this._emit('akira-load-chats', {});
    }

    _applyChats(payload) {
      this._chats = Array.isArray(payload) ? payload : (payload.chats || []);
      this._renderChats();
    }

    _applyHistory(payload) {
      const sessionId = payload.sessionId || null;
      const mensajes  = payload.mensajes || [];
      if (sessionId) this._sessionId = sessionId;

      // ── POLLING (CATHOVIA v1.6.2) ──
      // Si hay polling activo esperando la respuesta de un 504, solo
      // repintamos si el historial YA trae la respuesta esperada. Si no,
      // mantenemos "pensando…" y programamos el siguiente intento.
      if (this._polling) {
        if (this._historyContainsExpectedAnswer(mensajes)) {
          console.log(`${TAG} polling OK en intento #${this._pollAttempts}`);
          this._stopPolling();
        } else {
          this._scheduleNextPoll();
          return;
        }
      }

      const messagesEl = this.shadowRoot.getElementById('messages');
      messagesEl.innerHTML = '';
      this._hasMessages = false;
      this._lastErrorBlock = null;

      if (mensajes.length === 0) {
        this._renderWelcome();
      } else {
        mensajes.forEach(m => {
          if (m.rol === 'user') this._appendUser(m.contenido, false);
          else this._appendAssistant(m.contenido, false);
        });
        this._hasMessages = true;
        this._scrollBottom();
      }
      this._highlightActiveChat();
    }

    /** True si el historial ya contiene la respuesta que esperábamos. */
    _historyContainsExpectedAnswer(mensajes) {
      if (!Array.isArray(mensajes) || mensajes.length === 0) return false;
      if (!this._lastQuery) return false;
      let lastUserIdx = -1;
      for (let i = mensajes.length - 1; i >= 0; i--) {
        if (mensajes[i].rol === 'user') { lastUserIdx = i; break; }
      }
      if (lastUserIdx === -1) return false;
      const lastUserContent = String(mensajes[lastUserIdx].contenido || '').trim();
      if (lastUserContent !== String(this._lastQuery || '').trim()) return false;
      for (let i = lastUserIdx + 1; i < mensajes.length; i++) {
        if (mensajes[i].rol === 'assistant') return true;
      }
      return false;
    }

    _handleResponse(payload) {
      this._hideThinking();
      this._pending = false;

      if (payload.messageId && this._pendingId && payload.messageId !== this._pendingId) return;
      this._pendingId = null;

      if (payload.sessionId && !this._sessionId) {
        this._sessionId = payload.sessionId;
        this._emit('akira-load-chats', {});
      }

      const text = payload.respuesta
                || (typeof payload.error === 'string' ? payload.error : null)
                || (payload.error && payload.error.message) || null;

      if (payload.error && !payload.respuesta) {
        // El fetch falló (típicamente 504 tras los ~14s del gateway de Wix),
        // pero el backend sigue vivo y guardará la respuesta en AkiraMessages.
        // Arrancamos polling en vez de mostrar error: el usuario no se entera.
        if (this._sessionId && this._lastQuery) {
          this._startPolling();
          return;
        }
        this._stopPolling();
        this._lastErrorBlock = this._appendErrorWithRetry(text || 'Error de conexión.');
      } else if (text) {
        this._stopPolling();
        this._lastErrorBlock = null;
        this._appendAssistant(text, true);
        this._emit('akira-load-chats', {});
      } else {
        this._appendError('No he recibido respuesta. Inténtalo de nuevo.');
      }
    }

    _startPolling() {
      this._stopPolling();
      this._polling = true;
      this._pollAttempts = 0;
      console.log(`${TAG} startPolling sessionId=${this._sessionId}`);
      this._scheduleNextPoll();
    }

    _scheduleNextPoll() {
      if (!this._polling) return;
      this._pollAttempts++;
      if (this._pollAttempts > POLL_MAX_ATTEMPTS) {
        console.log(`${TAG} polling agotado`);
        this._stopPolling();
        this._hideThinking();
        this._pending = false;
        this._lastErrorBlock = this._appendErrorWithRetry(
          'El análisis está tardando más de lo previsto. Puedes reintentar o esperar unos segundos.'
        );
        return;
      }
      this._pollTimer = setTimeout(() => {
        if (!this._polling) return;
        console.log(`${TAG} polling intento #${this._pollAttempts}/${POLL_MAX_ATTEMPTS}`);
        this._emit('akira-open-chat', { sessionId: this._sessionId });
      }, POLL_INTERVAL_MS);
    }

    _stopPolling() {
      if (this._pollTimer) { clearTimeout(this._pollTimer); this._pollTimer = null; }
      this._polling = false;
      this._pollAttempts = 0;
    }

    _sendQuery(query) {
      if (this._pending || !query.trim()) return;
      this._msgCounter++;
      const messageId = `msg_${this._msgCounter}_${Date.now()}`;
      this._pendingId = messageId;
      this._pending = true;
      this._lastQuery = query.trim();
      this._stopPolling();

      if (this._lastErrorBlock) {
        try { this._lastErrorBlock.remove(); } catch (_) {}
        this._lastErrorBlock = null;
      }

      this._clearWelcome();
      this._appendUser(query, true);
      this._showThinking();
      this._fetchAkiraAsk(query, messageId);
    }

    /**
     * Petición HTTP directa a /_functions/akiraAsk.
     * NO se emite ningún evento al Page Code para preguntar: en CATHOVIA
     * v1.6.1 hacerlo a la vez que el fetch provocó DOBLE llamada a Anthropic
     * y doble coste. Ruta única. (v1.6.2)
     */
    async _fetchAkiraAsk(query, messageId) {
      try {
        const res = await fetch('/_functions/akiraAsk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: this._sessionId,
            query: query,
            userId: this._userId,
            userName: this._userName,
            modo: this._modo
          })
        });

        if (!res.ok) {
          console.warn(`${TAG} akiraAsk HTTP ${res.status}`);
          this._handleResponse({
            messageId,
            error: `El servicio respondió con error ${res.status}.`
          });
          return;
        }

        const data = await res.json();
        console.log(`${TAG} akiraAsk OK len=${(data.respuesta || '').length}`);
        this._handleResponse({
          messageId,
          ok: data.ok,
          respuesta: data.respuesta,
          sessionId: data.sessionId,
          error: data.ok ? null : (data.error || 'Error desconocido')
        });
      } catch (err) {
        console.error(`${TAG} akiraAsk EXCEPTION:`, err.message || err);
        this._handleResponse({
          messageId,
          error: 'No he podido conectar con el servicio.'
        });
      }
    }

    _handleSend() {
      const input = this.shadowRoot.getElementById('chatInput');
      const query = (input.value || '').trim();
      if (!query) return;
      input.value = '';
      input.style.height = 'auto';
      this._sendQuery(query);
      setTimeout(() => input.focus(), 0);
    }

    _bindEvents() {
      const root = this.shadowRoot;
      root.getElementById('sendBtn').addEventListener('click', () => this._handleSend());

      const input = root.getElementById('chatInput');
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this._handleSend(); }
      });
      input.addEventListener('input', () => {
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 180) + 'px';
      });

      const inputBox = root.querySelector('.input-box');
      if (inputBox) {
        inputBox.addEventListener('click', (e) => {
          if (e.target !== input && e.target.tagName !== 'BUTTON') input.focus();
        });
      }

      root.getElementById('btnToggleSidebar').addEventListener('click', () => this._toggleSidebar());
      const btnPanel = root.getElementById('btnTogglePanel');
      if (btnPanel) btnPanel.addEventListener('click', () => this._togglePanel());
      root.getElementById('btnNewChat').addEventListener('click', () => this._resetToNewChat());

      const backdrop = root.getElementById('backdrop');
      if (backdrop) backdrop.addEventListener('click', () => this._closeAllPanels());

      const closeSidebar = root.getElementById('btnCloseSidebar');
      if (closeSidebar) closeSidebar.addEventListener('click', () => {
        this._sidebarOpen = false;
        this._writeLS(LS_SIDEBAR, false);
        this._applyLayoutState();
      });

      const closePanel = root.getElementById('btnClosePanel');
      if (closePanel) closePanel.addEventListener('click', () => {
        this._panelOpen = false;
        this._writeLS(LS_PANEL, false);
        this._applyLayoutState();
      });

      const closeErr = root.getElementById('closeErrorBanner');
      if (closeErr) closeErr.addEventListener('click', () => this._hideSystemError());

      const btnTts = root.getElementById('btnToggleTts');
      if (btnTts) btnTts.addEventListener('click', () => this._toggleTtsAutoPlay());

      const micBtn = root.getElementById('micBtn');
      if (micBtn) micBtn.addEventListener('click', () => this._toggleMic());
    }

    _closeAllPanels() {
      this._sidebarOpen = false;
      this._panelOpen = false;
      this._applyLayoutState();
    }

    _resetToNewChat() {
      this._stopPolling();
      this._sessionId = null;
      this._hasMessages = false;
      this._pending = false;
      this._pendingId = null;
      this._lastQuery = '';
      this._lastErrorBlock = null;
      const m = this.shadowRoot.getElementById('messages');
      if (m) m.innerHTML = '';
      this._renderWelcome();
      this._highlightActiveChat();
      const input = this.shadowRoot.getElementById('chatInput');
      if (input) input.focus();
      if (isMobileViewport()) this._closeAllPanels();
    }

    _toggleSidebar() {
      this._sidebarOpen = !this._sidebarOpen;
      if (isMobileViewport() && this._sidebarOpen) this._panelOpen = false;
      this._writeLS(LS_SIDEBAR, this._sidebarOpen);
      this._applyLayoutState();
    }

    _togglePanel() {
      this._panelOpen = !this._panelOpen;
      if (isMobileViewport() && this._panelOpen) this._sidebarOpen = false;
      this._writeLS(LS_PANEL, this._panelOpen);
      this._applyLayoutState();
    }

    _applyLayoutState() {
      const layout = this.shadowRoot.getElementById('layout');
      layout.classList.toggle('sidebar-open', this._sidebarOpen);
      layout.classList.toggle('panel-open', this._panelOpen);
    }

    _showSystemError(msg) {
      const banner = this.shadowRoot.getElementById('errorBanner');
      const text = this.shadowRoot.getElementById('errorBannerText');
      if (!banner || !text) return;
      text.textContent = msg;
      banner.style.display = 'flex';
    }

    _hideSystemError() {
      const banner = this.shadowRoot.getElementById('errorBanner');
      if (banner) banner.style.display = 'none';
    }

    _appendUser(text, scroll) {
      this._clearWelcome();
      this._hasMessages = true;
      const el = document.createElement('div');
      el.className = 'turn turn-user';
      el.innerHTML = `<div class="bubble">${this._escape(text)}</div>`;
      this.shadowRoot.getElementById('messages').appendChild(el);
      if (scroll) this._scrollBottom();
    }

    _appendAssistant(text, scroll) {
      this._clearWelcome();
      this._hasMessages = true;
      this._msgCounter++;
      const messageId = `ai_${this._msgCounter}_${Date.now()}`;
      const el = document.createElement('div');
      el.className = 'turn turn-ai';
      el.dataset.messageId = messageId;
      el.innerHTML = this._formatEditorial(text) + this._renderTtsButton(messageId);
      this.shadowRoot.getElementById('messages').appendChild(el);

      const ttsBtn = el.querySelector('.tts-btn');
      if (ttsBtn) ttsBtn.addEventListener('click', () => this._onTtsButtonClick(messageId, text, ttsBtn));
      if (scroll) this._scrollBottom();
      if (scroll && this._ttsAutoPlay && ttsBtn) {
        setTimeout(() => this._onTtsButtonClick(messageId, text, ttsBtn), 200);
      }
    }

    _renderTtsButton(messageId) {
      return `<div class="tts-row"><button class="tts-btn" data-mid="${messageId}" data-state="idle" title="Escuchar">
        <span class="tts-icon">🔊</span><span class="tts-label">Escuchar</span>
      </button></div>`;
    }

    _appendError(text) {
      const el = document.createElement('div');
      el.className = 'turn turn-error';
      el.innerHTML = `<div class="err-box"><span class="err-icon">!</span><span>${this._escape(text)}</span></div>`;
      this.shadowRoot.getElementById('messages').appendChild(el);
      this._scrollBottom();
      return el;
    }

    _appendErrorWithRetry(text) {
      const canRetry = !!this._lastQuery;
      const el = document.createElement('div');
      el.className = 'turn turn-error';
      el.innerHTML = `
        <div class="err-box err-box-retry">
          <div class="err-body">
            <span class="err-icon">!</span>
            <span class="err-text">${this._escape(text)}</span>
          </div>
          ${canRetry ? `<button class="err-retry-btn" type="button">↻ Reintentar</button>` : ''}
        </div>
      `;
      this.shadowRoot.getElementById('messages').appendChild(el);
      if (canRetry) {
        const btn = el.querySelector('.err-retry-btn');
        if (btn) btn.addEventListener('click', () => {
          const q = this._lastQuery;
          if (!q) return;
          try { el.remove(); } catch (_) {}
          if (this._lastErrorBlock === el) this._lastErrorBlock = null;
          this._sendQuery(q);
        });
      }
      this._scrollBottom();
      return el;
    }

    _showThinking() {
      const el = document.createElement('div');
      el.className = 'turn turn-thinking';
      el.id = 'thinkingRow';
      el.innerHTML = `<div class="thinking">
                        <div class="thinking-dots"><span></span><span></span><span></span></div>
                        <div class="thinking-label">${this._escape(this._brand.thinking)}</div>
                      </div>`;
      this.shadowRoot.getElementById('messages').appendChild(el);
      this._scrollBottom();
    }

    _hideThinking() {
      const el = this.shadowRoot.getElementById('thinkingRow');
      if (el) el.remove();
    }

    _scrollBottom() {
      const m = this.shadowRoot.getElementById('messages');
      m.scrollTop = m.scrollHeight;
    }

    /**
     * Formato editorial. Soporta negrita **texto** y listas simples, porque
     * un consultor da cifras y desgloses. Si el guardrail grNoMarkdown está
     * activo en AkiraAlignment, el modelo no las emitirá y esto no estorba.
     */
    _formatEditorial(text) {
      const paragraphs = String(text || '').split(/\n{2,}/);
      const out = ['<div class="editorial">'];
      for (const raw of paragraphs) {
        const para = raw.trim();
        if (!para) continue;
        let safe = this._escape(para);
        safe = safe.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        safe = safe.replace(/\n/g, '<br>');
        out.push(`<p>${safe}</p>`);
      }
      out.push('</div>');
      return out.join('');
    }

    _renderWelcome() {
      const messages = this.shadowRoot.getElementById('messages');
      if (!messages) return;
      if (this._hasMessages) return;
      if (messages.querySelector('.welcome')) return;
      const el = document.createElement('div');
      el.className = 'welcome';
      el.innerHTML = `
        <div class="welcome-inner">
          <div class="welcome-ornament">— ✦ —</div>
          <div class="welcome-title">${this._escape(this._brand.welcomeTitle || this._brand.name)}</div>
          <div class="welcome-sub">${this._escape(this._brand.welcome)}</div>
        </div>
      `;
      messages.appendChild(el);
    }

    _clearWelcome() {
      const w = this.shadowRoot.querySelector('.welcome');
      if (w) w.remove();
    }

    _renderChats() {
      const list = this.shadowRoot.getElementById('chatsList');
      if (!list) return;
      if (this._chats.length === 0) {
        list.innerHTML = `<div class="empty">Sin consultas previas</div>`;
        return;
      }
      list.innerHTML = this._chats.map(c => {
        const active = (c.id === this._sessionId) ? ' active' : '';
        return `<div class="chat-item-row${active}" data-id="${this._escape(c.id)}">
                  <button class="chat-item" data-id="${this._escape(c.id)}">
                    <div class="chat-title">${this._escape(c.titulo || 'Consulta')}</div>
                    ${c.preview ? `<div class="chat-preview">${this._escape(c.preview)}</div>` : ''}
                  </button>
                  <button class="chat-delete" data-id="${this._escape(c.id)}" data-title="${this._escape(c.titulo || 'Consulta')}" title="Borrar">🗑</button>
                </div>`;
      }).join('');

      list.querySelectorAll('.chat-item').forEach(btn => {
        btn.addEventListener('click', () => {
          this._sessionId = btn.dataset.id;
          this._stopPolling();
          this._emit('akira-open-chat', { sessionId: btn.dataset.id });
          this._highlightActiveChat();
          if (isMobileViewport()) this._closeAllPanels();
        });
      });

      list.querySelectorAll('.chat-delete').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          this._showDeleteConfirm(btn.dataset.id, btn.dataset.title);
        });
      });
    }

    _showDeleteConfirm(sessionId, titulo) {
      const prev = this.shadowRoot.getElementById('deleteModal');
      if (prev) prev.remove();
      const modal = document.createElement('div');
      modal.className = 'modal-backdrop';
      modal.id = 'deleteModal';
      modal.innerHTML = `
        <div class="modal">
          <div class="modal-title">¿Borrar esta consulta?</div>
          <div class="modal-body">
            "${this._escape(titulo)}"
            <div class="modal-note">Esta acción no se puede deshacer.</div>
          </div>
          <div class="modal-actions">
            <button class="modal-btn modal-btn-cancel" id="modalCancel">Cancelar</button>
            <button class="modal-btn modal-btn-danger" id="modalDelete">Borrar</button>
          </div>
        </div>
      `;
      this.shadowRoot.appendChild(modal);
      const cancel = () => modal.remove();
      modal.addEventListener('click', (e) => { if (e.target === modal) cancel(); });
      modal.querySelector('#modalCancel').addEventListener('click', cancel);
      modal.querySelector('#modalDelete').addEventListener('click', () => {
        this._emit('akira-delete-chat', { sessionId });
        this._chats = this._chats.filter(c => c.id !== sessionId);
        if (this._sessionId === sessionId) this._resetToNewChat();
        else this._renderChats();
        modal.remove();
      });
    }

    _highlightActiveChat() {
      this.shadowRoot.querySelectorAll('.chat-item-row').forEach(el => {
        el.classList.toggle('active', el.dataset.id === this._sessionId);
      });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TTS — fontanería lista. Requiere backend TTS + config.ttsEnabled=true.
    // ═══════════════════════════════════════════════════════════════════════

    _onTtsButtonClick(messageId, text, btn) {
      if (!btn) btn = this.shadowRoot.querySelector(`.tts-btn[data-mid="${messageId}"]`);
      if (!btn) return;
      const state = btn.dataset.state || 'idle';

      if (state === 'playing' && this._playingMessageId === messageId) {
        this._stopTts();
        return;
      }
      if (this._playingMessageId) this._stopTts();

      this._setTtsBtnState(btn, 'loading');
      this._playingMessageId = messageId;

      const cleanText = this._sanitizeForTts(text);
      if (!cleanText) {
        this._setTtsBtnState(btn, 'idle');
        this._playingMessageId = null;
        return;
      }

      // Llamada directa al backend por HTTP. NO se emite ningún evento al Page
      // Code: setAttribute trunca payloads grandes y el audio base64 lo es.
      // Patrón literal de CATHOVIA v1.6.5.
      this._fetchTts(messageId, cleanText, btn);
    }

    async _fetchTts(messageId, texto, btn) {
      try {
        const res = await fetch('/_functions/akiraTts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ texto: texto })
        });
        if (!res.ok) {
          console.warn(`${TAG} akiraTts HTTP ${res.status}`);
          this._applyTtsError({ messageId, error: `HTTP ${res.status}` });
          return;
        }
        const data = await res.json();
        if (!data.ok || !data.audioContent) {
          console.warn(`${TAG} akiraTts respuesta sin audio:`, data.error);
          this._applyTtsError({ messageId, error: data.error || 'sin audio' });
          return;
        }
        console.log(`${TAG} akiraTts OK ${data.timeMs}ms voice=${data.voice} audioLen=${data.audioContent.length}`);
        this._applyTtsAudio({
          messageId,
          audioContent: data.audioContent,
          mimeType: data.mimeType || 'audio/mpeg'
        });
      } catch (err) {
        console.error(`${TAG} akiraTts EXCEPTION:`, err.message || err);
        this._applyTtsError({ messageId, error: err.message || 'error de red' });
      }
    }

    // Métodos públicos llamables desde el Page Code (bypass del setAttribute).
    receiveTtsAudio(payload) {
      this._applyTtsAudio(payload || {});
    }

    receiveTtsError(payload) {
      this._applyTtsError(payload || {});
    }

    _applyTtsAudio(payload) {
      const { messageId, audioContent, mimeType } = payload || {};
      if (!messageId || !audioContent) return;
      if (messageId !== this._playingMessageId) return; // llegó tarde, ignorar
      this._playAudioBase64(audioContent, mimeType || 'audio/mpeg', messageId);
    }

    _applyTtsError(payload) {
      const { messageId, error } = payload || {};
      console.warn(`${TAG} TTS error mid=${messageId}: ${error}`);
      if (messageId === this._playingMessageId) {
        const btn = this.shadowRoot.querySelector(`.tts-btn[data-mid="${messageId}"]`);
        if (btn) this._setTtsBtnState(btn, 'idle');
        this._playingMessageId = null;
      }
    }

    _playAudioBase64(base64, mimeType, messageId) {
      if (!this._audioEl) this._audioEl = new Audio();
      const audio = this._audioEl;
      audio.pause();
      audio.currentTime = 0;

      audio.src = `data:${mimeType};base64,${base64}`;

      const btn = this.shadowRoot.querySelector(`.tts-btn[data-mid="${messageId}"]`);
      if (btn) this._setTtsBtnState(btn, 'playing');

      audio.onended = () => {
        const b = this.shadowRoot.querySelector(`.tts-btn[data-mid="${messageId}"]`);
        if (b) this._setTtsBtnState(b, 'idle');
        this._playingMessageId = null;
      };
      audio.onerror = () => {
        console.warn(`${TAG} audio playback error`);
        const b = this.shadowRoot.querySelector(`.tts-btn[data-mid="${messageId}"]`);
        if (b) this._setTtsBtnState(b, 'idle');
        this._playingMessageId = null;
      };

      audio.play().catch(err => {
        console.warn(`${TAG} audio.play() rechazado:`, err.message);
        const b = this.shadowRoot.querySelector(`.tts-btn[data-mid="${messageId}"]`);
        if (b) this._setTtsBtnState(b, 'idle');
        this._playingMessageId = null;
      });
    }

    _stopTts() {
      if (this._audioEl) {
        try { this._audioEl.pause(); this._audioEl.currentTime = 0; } catch (_) {}
      }
      if (this._playingMessageId) {
        const btn = this.shadowRoot.querySelector(`.tts-btn[data-mid="${this._playingMessageId}"]`);
        if (btn) this._setTtsBtnState(btn, 'idle');
      }
      this._playingMessageId = null;
    }

    _setTtsBtnState(btn, state) {
      if (!btn) return;
      btn.dataset.state = state;
      const icon = btn.querySelector('.tts-icon');
      const label = btn.querySelector('.tts-label');
      if (state === 'idle')    { if (icon) icon.textContent = '🔊'; if (label) label.textContent = 'Escuchar'; }
      if (state === 'loading') { if (icon) icon.textContent = '⏳'; if (label) label.textContent = 'Preparando'; }
      if (state === 'playing') { if (icon) icon.textContent = '⏸'; if (label) label.textContent = 'Parar'; }
    }

    _sanitizeForTts(text) {
      let t = String(text || '');
      t = t.replace(/\*\*(.+?)\*\*/g, '$1');
      t = t.replace(/^#{1,6}\s+/gm, '');
      t = t.replace(/\*(.+?)\*/g, '$1');
      t = t.replace(/\n{3,}/g, '\n\n').trim();
      return t;
    }

    _toggleTtsAutoPlay() {
      this._ttsAutoPlay = !this._ttsAutoPlay;
      this._writeLS(LS_TTS_AUTO, this._ttsAutoPlay);
      const btn = this.shadowRoot.getElementById('btnToggleTts');
      if (btn) {
        btn.textContent = this._ttsAutoPlay ? '🔊' : '🔇';
        btn.title = this._ttsAutoPlay ? 'Voz automática activada' : 'Voz automática desactivada';
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // MICRÓFONO (Web Speech API — portado de EGAEL +50)
    // ═══════════════════════════════════════════════════════════════════════

    _setupMic() {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SR) {
        const b = this.shadowRoot.getElementById('micBtn');
        if (b) b.style.display = 'none';
        return;
      }
      this._SR = SR;
    }

    _clearSilenceTimer() { if (this._silenceTimer) { clearTimeout(this._silenceTimer); this._silenceTimer = null; } }
    _clearSafetyTimer()  { if (this._safetyTimer)  { clearTimeout(this._safetyTimer);  this._safetyTimer  = null; } }
    _armSilenceTimer() {
      this._clearSilenceTimer();
      this._silenceTimer = setTimeout(() => this._stopMic(), SILENCE_MS);
    }
    _armSafetyTimer() {
      this._clearSafetyTimer();
      this._safetyTimer = setTimeout(() => this._stopMic(), SAFETY_MS);
    }

    _toggleMic() { if (this._isListening) this._stopMic(); else this._startMic(); }

    _stopMic() {
      this._clearSilenceTimer();
      this._clearSafetyTimer();
      if (this._recognition) { try { this._recognition.stop(); } catch (_) {} }
    }

    _setMicState(state) {
      const btn = this.shadowRoot.getElementById('micBtn');
      if (!btn) return;
      btn.classList.remove('listening', 'idle', 'preparing');
      btn.classList.add(state);
    }

    _startMic() {
      if (!this._SR || this._pending) return;
      this._stopTts();
      const input = this.shadowRoot.getElementById('chatInput');
      input.value = '';
      if (IS_ANDROID) {
        this._androidFinalBuffer = '';
        this._startAndroidSession(input);
      } else {
        this._startStandardSession(input);
      }
    }

    _startAndroidSession(input) {
      try { this._recognition = new this._SR(); } catch (e) { return; }
      this._recognition.lang = 'es-ES';
      this._recognition.interimResults = false;
      this._recognition.continuous = false;
      this._recognition.maxAlternatives = 1;

      this._recognition.onstart = () => {
        this._isListening = true;
        this._setMicState('preparing');
        input.placeholder = 'Preparando micrófono…';
        this._armSafetyTimer();
      };
      this._recognition.onaudiostart = () => {
        this._setMicState('listening');
        input.placeholder = 'Te escucho…';
        if (navigator.vibrate) { try { navigator.vibrate(50); } catch (_) {} }
      };
      this._recognition.onresult = (event) => {
        this._clearSafetyTimer();
        const result = event.results[0];
        if (result && result.isFinal) {
          const transcript = result[0].transcript.trim();
          if (transcript) {
            this._androidFinalBuffer += (this._androidFinalBuffer ? ' ' : '') + transcript;
            input.value = this._androidFinalBuffer;
            this._armSilenceTimer();
          }
        }
      };
      this._recognition.onerror = (event) => {
        this._clearSilenceTimer(); this._clearSafetyTimer();
        this._isListening = false; this._setMicState('idle');
        input.placeholder = this._brand.placeholder;
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          this._appendError('Permiso de micrófono denegado. Actívalo en los ajustes del navegador.');
        }
      };
      this._recognition.onend = () => {
        this._clearSafetyTimer();
        this._isListening = false; this._setMicState('idle');
        const text = this._androidFinalBuffer.trim();
        this._androidFinalBuffer = '';
        if (!text) { input.placeholder = this._brand.placeholder; return; }
        input.value = '';
        this._sendQuery(text);
      };
      try { this._recognition.start(); }
      catch (e) { this._setMicState('idle'); input.placeholder = this._brand.placeholder; }
    }

    _startStandardSession(input) {
      try { this._recognition = new this._SR(); } catch (e) { return; }
      this._recognition.lang = 'es-ES';
      this._recognition.interimResults = true;
      this._recognition.continuous = true;
      this._recognition.maxAlternatives = 1;
      this._lastFinalTranscript = '';

      this._recognition.onstart = () => {
        this._isListening = true; this._setMicState('preparing');
        input.placeholder = 'Preparando micrófono…'; this._armSafetyTimer();
      };
      this._recognition.onaudiostart = () => {
        this._setMicState('listening');
        input.placeholder = 'Te escucho…';
        if (navigator.vibrate) { try { navigator.vibrate(50); } catch (_) {} }
      };
      this._recognition.onresult = (event) => {
        this._clearSafetyTimer();
        let finalText = '', interimText = '';
        for (let i = 0; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) finalText += transcript;
          else interimText += transcript;
        }
        input.value = (finalText + interimText).trim();
        const hadNewFinal = finalText !== this._lastFinalTranscript;
        if (hadNewFinal && finalText) { this._lastFinalTranscript = finalText; this._armSilenceTimer(); }
        else if (!hadNewFinal && interimText) { this._clearSilenceTimer(); }
      };
      this._recognition.onerror = (event) => {
        this._clearSilenceTimer(); this._clearSafetyTimer();
        this._isListening = false; this._setMicState('idle');
        input.placeholder = this._brand.placeholder;
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          this._appendError('Permiso de micrófono denegado. Actívalo en los ajustes del navegador.');
        }
      };
      this._recognition.onend = () => {
        this._clearSafetyTimer();
        this._isListening = false; this._setMicState('idle');
        const text = (input.value || '').trim();
        if (!text) { input.placeholder = this._brand.placeholder; return; }
        input.value = '';
        this._sendQuery(text);
      };
      try { this._recognition.start(); }
      catch (e) { this._setMicState('idle'); input.placeholder = this._brand.placeholder; }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // UTILIDADES
    // ═══════════════════════════════════════════════════════════════════════

    _emit(name, detail) {
      this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
    }

    _escape(s) {
      return String(s == null ? '' : s)
        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
    }

    _readLS(key, fallback) {
      try { const v = localStorage.getItem(key); if (v === null) return fallback; return v === '1'; }
      catch (_) { return fallback; }
    }

    _writeLS(key, val) { try { localStorage.setItem(key, val ? '1' : '0'); } catch (_) {} }

    _render() {
      const c = this._theme.colors;
      const b = this._brand;
      const sidebarClass = this._sidebarOpen ? ' sidebar-open' : '';
      const panelClass   = this._panelOpen   ? ' panel-open'   : '';

      this.shadowRoot.innerHTML = `
<style>
  /* Fuentes: cargadas por <link> en el head (ensureFonts).
     NUNCA @import aquí — regla Manual Técnico §13. */

  :host {
    display: block;
    width: 100%;
    /* Anclado a la VENTANA, no al contenedor de Wix.
       Wix declara la altura en el editor pero el runtime la infla midiendo
       el contenido inicial del custom element; con height:100% la consola
       hereda esa altura inventada y el input queda fuera de pantalla.
       dvh respeta las barras del navegador móvil. (CATHOVIA v1.6.4)
       PRECONDICIÓN: la página contiene SOLO el custom element. Si se añade
       cabecera/footer de Wix, restar su alto: calc(100dvh - Npx). */
    height: 100vh;
    height: 100dvh;
    max-height: 100vh;
    max-height: 100dvh;
    min-height: 0;
    font-family: ${this._theme.font};
    color: ${c.ink};
    background: ${c.bg};
    --bg: ${c.bg};
    --surface: ${c.surface};
    --card: ${c.card};
    --ink: ${c.ink};
    --ink-soft: ${c.inkSoft};
    --muted: ${c.muted};
    --hairline: ${c.hairline};
    --accent: ${c.accent};
    --accent-ink: ${c.accentInk};
    --accent-soft: ${this._theme.accentSoft};
    --focus: ${this._theme.focus};
    --radius: ${this._theme.radius};
    --font-body: ${this._theme.font};
  }
  * { box-sizing: border-box; }
  ::selection { background: var(--accent); color: var(--accent-ink); }

  .app {
    display: flex; flex-direction: column;
    height: 100%; max-height: 100%; min-height: 0;
    background: var(--bg); overflow: hidden;
  }

  .layout {
    flex: 1; min-height: 0;
    display: grid;
    grid-template-columns: 0 1fr 0;
    grid-template-rows: auto 1fr;
    grid-template-areas: "topbar topbar topbar" "sidebar main panel";
    background: var(--bg);
    transition: grid-template-columns .22s ease;
    position: relative;
  }
  .layout.sidebar-open { grid-template-columns: 280px 1fr 0; }
  .layout.panel-open   { grid-template-columns: 0 1fr 320px; }
  .layout.sidebar-open.panel-open { grid-template-columns: 280px 1fr 320px; }

  /* TOPBAR */
  .topbar {
    grid-area: topbar;
    display: flex; align-items: center; gap: 12px;
    padding: 10px 18px;
    background: var(--surface);
    border-bottom: 1px solid var(--hairline);
    min-height: 56px;
  }
  .tb-btn {
    display: inline-flex; align-items: center; justify-content: center;
    width: 36px; height: 36px;
    border-radius: 8px;
    border: 1px solid var(--hairline);
    background: var(--surface);
    color: var(--ink);
    cursor: pointer; font-size: 16px; flex-shrink: 0;
    transition: background .15s, border-color .15s;
  }
  .tb-btn:hover { background: var(--bg); border-color: var(--ink-soft); }
  .tb-brand {
    flex: 1; display: flex; flex-direction: column; align-items: center;
    line-height: 1.1; min-width: 0; text-align: center;
  }
  /* Logo: CSS deliberadamente mínimo. Cualquier background/border/filter
     aquí reintroduce el marco blanco. Usar URL cruda ~mv2.png del Media
     Manager, NUNCA la URL con /v1/fill/ (aplana el alfa). */
  .tb-logo {
    height: 30px; width: auto; display: block;
    background: none; border: 0; box-shadow: none; filter: none;
    max-width: 100%; object-fit: contain;
  }
  .tb-title {
    font-size: 20px; font-weight: 600; letter-spacing: .3px; color: var(--ink);
    max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .tb-sub {
    font-size: 10.5px; text-transform: uppercase; letter-spacing: 2px;
    color: var(--muted); margin-top: 2px;
    max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }

  /* ERROR BANNER */
  .error-banner {
    display: none; align-items: center; gap: 10px;
    padding: 10px 16px; background: #7a1a1a; color: #ffe8e8;
    font-size: 13px; border-bottom: 1px solid #5a1010;
  }
  .error-banner .eb-icon {
    font-weight: bold; background: rgba(255,255,255,.15);
    width: 20px; height: 20px; border-radius: 50%;
    display: inline-flex; align-items: center; justify-content: center; font-size: 12px;
  }
  .error-banner .eb-text { flex: 1; }
  .error-banner .eb-close {
    background: transparent; border: 1px solid rgba(255,255,255,.3);
    color: #ffe8e8; width: 24px; height: 24px; border-radius: 4px; cursor: pointer;
  }

  /* SIDEBAR */
  .sidebar {
    grid-area: sidebar; background: var(--bg);
    border-right: 1px solid var(--hairline);
    overflow: hidden; display: flex; flex-direction: column;
    min-width: 0; min-height: 0;
  }
  .sb-head {
    padding: 16px 16px 12px; border-bottom: 1px solid var(--hairline);
    display: flex; justify-content: space-between; align-items: center;
  }
  .sb-label { font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; color: var(--muted); }
  .sb-head-actions { display: flex; align-items: center; gap: 8px; }
  .sb-new {
    background: var(--accent); color: var(--accent-ink); border: none;
    padding: 6px 12px; border-radius: 6px; font-size: 12px; font-weight: 600;
    cursor: pointer; font-family: var(--font-body);
  }
  .sb-new:hover { filter: brightness(1.12); }

  .mobile-close {
    display: none; background: transparent; border: 1px solid var(--hairline);
    color: var(--muted); width: 32px; height: 32px; border-radius: 8px;
    cursor: pointer; font-size: 14px;
    align-items: center; justify-content: center; line-height: 1; padding: 0; flex-shrink: 0;
  }
  .mobile-close:hover { background: var(--surface); color: var(--ink); border-color: var(--ink-soft); }
  .panel-close-row { display: none; justify-content: flex-end; padding: 12px 14px 0 14px; }

  .chats-list { flex: 1; overflow-y: auto; padding: 8px; }
  .chat-item-row {
    display: flex; align-items: stretch; gap: 2px;
    border-radius: 8px; margin-bottom: 2px; transition: background .12s;
  }
  .chat-item-row:hover { background: var(--surface); }
  .chat-item-row.active { background: var(--surface); border-left: 2px solid var(--accent); }
  .chat-item {
    flex: 1; min-width: 0; text-align: left; background: transparent; border: none;
    padding: 10px 8px 10px 12px; cursor: pointer;
    font-family: var(--font-body); color: var(--ink); border-radius: 8px 0 0 8px;
  }
  .chat-item-row.active .chat-item { padding-left: 10px; }
  .chat-delete {
    background: transparent; border: none; color: var(--muted); cursor: pointer;
    padding: 0 10px; font-size: 14px; opacity: 0;
    transition: opacity .12s, color .12s; border-radius: 0 8px 8px 0;
    display: flex; align-items: center; justify-content: center; line-height: 1;
  }
  .chat-item-row:hover .chat-delete { opacity: 0.7; }
  .chat-delete:hover { opacity: 1 !important; color: #a03030; background: rgba(160,48,48,.08); }
  .chat-title { font-size: 13px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .chat-preview { font-size: 11px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 2px; }

  /* MODAL */
  .modal-backdrop {
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(20, 24, 32, .5);
    display: flex; align-items: center; justify-content: center;
    z-index: 100; animation: fadeIn .18s ease;
  }
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
  .modal {
    background: var(--surface); border-radius: 14px; padding: 24px 22px 18px;
    max-width: 380px; width: calc(100% - 40px);
    box-shadow: 0 10px 40px rgba(0,0,0,.25);
    font-family: var(--font-body); animation: modalRise .22s ease;
  }
  @keyframes modalRise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
  .modal-title { font-size: 19px; color: var(--ink); margin-bottom: 8px; font-weight: 600; }
  .modal-body { font-size: 14px; color: var(--ink-soft); line-height: 1.5; margin-bottom: 20px; }
  .modal-note { font-size: 12px; color: var(--muted); margin-top: 8px; font-style: italic; }
  .modal-actions { display: flex; gap: 8px; justify-content: flex-end; }
  .modal-btn {
    padding: 9px 18px; border-radius: 8px; font-size: 13px; font-weight: 600;
    cursor: pointer; font-family: var(--font-body);
    border: 1px solid var(--hairline); background: transparent; color: var(--ink);
    transition: background .15s;
  }
  .modal-btn-cancel:hover { background: var(--bg); }
  .modal-btn-danger { background: #a03030; color: #fff; border-color: #a03030; }
  .modal-btn-danger:hover { background: #8a2525; }

  .empty { padding: 24px 12px; text-align: center; color: var(--muted); font-size: 13px; font-style: italic; }
  .empty.small { padding: 12px 8px; font-size: 12px; }

  /* MAIN */
  .main {
    grid-area: main; display: flex; flex-direction: column;
    min-width: 0; min-height: 0; overflow: hidden;
    background: var(--surface);
    box-shadow: inset 0 4px 12px -8px rgba(0,0,0,.06);
  }
  .messages {
    flex: 1; min-height: 0; overflow-y: auto;
    padding: 32px 28px; display: flex; flex-direction: column;
    gap: 26px; justify-content: flex-start;
  }

  .turn { display: flex; flex-direction: column; }
  .turn-user { align-items: flex-end; }
  .turn-user .bubble {
    background: var(--accent); color: var(--accent-ink);
    padding: 12px 16px; border-radius: 16px 16px 4px 16px;
    max-width: 74%; font-size: 15px; line-height: 1.5;
  }
  .turn-ai .editorial { font-size: 16px; line-height: 1.7; color: var(--ink); max-width: 78ch; }
  .turn-ai .editorial p { margin: 0 0 14px 0; }
  .turn-ai .editorial p:last-child { margin-bottom: 0; }
  .turn-ai .editorial strong { font-weight: 600; color: var(--ink); }

  .tts-row { margin-top: 10px; }
  .tts-btn {
    display: inline-flex; align-items: center; gap: 6px;
    background: transparent; border: 1px solid var(--hairline);
    color: var(--muted); border-radius: 8px; padding: 5px 11px;
    font-size: 12px; cursor: pointer; font-family: var(--font-body);
    transition: background .15s, color .15s;
  }
  .tts-btn:hover { background: var(--bg); color: var(--ink); }

  .turn-error .err-box {
    background: rgba(160,48,48,.07); border: 1px solid rgba(160,48,48,.28);
    color: #8a2525; border-radius: 12px; padding: 12px 14px;
    font-size: 14px; display: flex; align-items: center; gap: 10px; max-width: 78%;
  }
  .turn-error .err-box-retry { flex-direction: column; align-items: flex-start; gap: 10px; }
  .turn-error .err-body { display: flex; align-items: center; gap: 10px; }
  .turn-error .err-icon {
    font-weight: bold; background: rgba(160,48,48,.15);
    width: 20px; height: 20px; border-radius: 50%;
    display: inline-flex; align-items: center; justify-content: center;
    font-size: 12px; flex-shrink: 0;
  }
  .turn-error .err-retry-btn {
    background: transparent; border: 1px solid rgba(160,48,48,.4);
    color: #8a2525; border-radius: 8px; padding: 7px 13px;
    font-size: 12.5px; font-weight: 600; cursor: pointer; font-family: var(--font-body);
  }
  .turn-error .err-retry-btn:hover { background: rgba(160,48,48,.1); }

  .thinking { display: flex; align-items: center; gap: 12px; }
  .thinking-dots { display: flex; gap: 4px; }
  .thinking-dots span {
    width: 7px; height: 7px; border-radius: 50%;
    background: var(--accent); opacity: .3;
    animation: pulse 1.3s infinite ease-in-out;
  }
  .thinking-dots span:nth-child(2) { animation-delay: .18s; }
  .thinking-dots span:nth-child(3) { animation-delay: .36s; }
  @keyframes pulse { 0%,100% { opacity: .25; transform: scale(.85); } 50% { opacity: 1; transform: scale(1); } }
  .thinking-label { font-size: 13.5px; color: var(--muted); font-style: italic; }

  /* WELCOME */
  .welcome { padding: 48px 20px; text-align: center; }
  .welcome-ornament { font-size: 16px; letter-spacing: 6px; color: var(--accent); opacity: .5; margin-bottom: 18px; }
  .welcome-title { font-size: 34px; font-weight: 600; color: var(--ink); margin-bottom: 16px; letter-spacing: -.02em; }
  .welcome-sub { font-size: 16.5px; line-height: 1.6; color: var(--ink-soft); max-width: 56ch; margin: 0 auto; }

  /* INPUT */
  .input-area { padding: 14px 22px 20px; }
  .input-box {
    display: flex; align-items: flex-end; gap: 8px;
    background: var(--bg); border: 1px solid var(--hairline);
    border-radius: 16px; padding: 8px 8px 8px 16px;
    transition: border-color .15s;
  }
  .input-box:focus-within { border-color: var(--accent); }
  .input-ta {
    flex: 1; border: none; background: transparent; resize: none;
    font-family: var(--font-body); font-size: 15px; line-height: 1.5;
    color: var(--ink); padding: 8px 4px; max-height: 180px; outline: none;
  }
  .input-ta::placeholder { color: var(--muted); }
  .send-btn, .mic-btn {
    width: 38px; height: 38px; border-radius: 10px; border: none;
    cursor: pointer; flex-shrink: 0;
    display: inline-flex; align-items: center; justify-content: center;
    transition: filter .15s, background .15s;
  }
  .send-btn { background: var(--accent); color: var(--accent-ink); font-size: 17px; }
  .send-btn:hover { filter: brightness(1.12); }
  .mic-btn { background: transparent; border: 1px solid var(--hairline); color: var(--muted); font-size: 16px; }
  .mic-btn:hover { background: var(--surface); color: var(--ink); }
  .mic-btn.listening { background: var(--accent-soft); color: var(--accent); border-color: var(--accent); }
  .mic-btn.preparing { opacity: .6; }

  /* PANEL LATERAL — montado y VACÍO (preparado para futuros usos) */
  .panel {
    grid-area: panel; background: var(--bg);
    border-left: 1px solid var(--hairline);
    overflow-y: auto; min-width: 0; min-height: 0;
  }
  .panel-section { padding: 16px; border-bottom: 1px solid var(--hairline); }
  .panel-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
  .panel-title { font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; color: var(--muted); }

  .backdrop {
    display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(20,24,32,.4); opacity: 0; pointer-events: none;
    transition: opacity .25s ease; z-index: 5;
  }

  /* ── MÓVIL ── */
  @media (max-width: 900px) {
    .layout { grid-template-columns: 0 1fr 0 !important; }
    .backdrop { display: block; }
    .topbar { padding: 8px 12px; gap: 8px; min-height: 52px; position: sticky; top: 0; z-index: 12; }
    .tb-btn { width: 34px; height: 34px; font-size: 15px; }
    .tb-logo { height: 26px; }
    .tb-title { font-size: 18px; }
    .tb-sub { font-size: 9.5px; letter-spacing: 1.5px; }

    .sidebar, .panel {
      position: fixed; top: 52px; bottom: 0; z-index: 10;
      width: 88%; max-width: 320px;
      transform: translateX(-100%); transition: transform .25s ease;
      box-shadow: 0 0 40px rgba(0,0,0,.18);
    }
    .sidebar { left: 0; border-right: 1px solid var(--hairline); }
    .panel { right: 0; transform: translateX(100%); border-left: 1px solid var(--hairline); border-right: none; }
    .layout.sidebar-open .sidebar { transform: translateX(0); }
    .layout.panel-open .panel { transform: translateX(0); }
    .layout.sidebar-open .backdrop, .layout.panel-open .backdrop { opacity: 1; pointer-events: auto; }

    .mobile-close { display: inline-flex; }
    .panel-close-row { display: flex; }
    .chat-delete { opacity: 0.6; padding: 0 14px; font-size: 15px; }
    .chat-item-row .chat-delete { opacity: 0.6; }

    .modal { padding: 22px 20px 16px; max-width: 340px; }
    .modal-title { font-size: 18px; }

    .main { grid-area: main; box-shadow: none; }
    .messages { padding: 24px 18px; gap: 22px; }
    .input-area { padding: 12px 14px 16px; }
    .input-box { padding: 8px 8px 8px 14px; border-radius: 14px; }
    .input-ta { font-size: 16px; }
    .turn-user .bubble { max-width: 85%; font-size: 15px; }
    .turn-ai .editorial { font-size: 16px; line-height: 1.65; }
    .welcome { padding: 40px 16px; }
    .welcome-title { font-size: 28px; }
    .welcome-sub { font-size: 16px; }
  }

  @media (max-width: 420px) {
    .topbar { padding: 8px 10px; gap: 6px; }
    .tb-logo { height: 22px; }
    .tb-title { font-size: 16px; }
    .messages { padding: 20px 14px; gap: 18px; }
    .welcome-title { font-size: 25px; }
    .welcome-sub { font-size: 15px; }
    .turn-ai .editorial { font-size: 15.5px; }
    .sidebar, .panel { width: 92%; }
  }
</style>

<div class="app">

  <div class="error-banner" id="errorBanner">
    <span class="eb-icon">!</span>
    <span class="eb-text" id="errorBannerText"></span>
    <button class="eb-close" id="closeErrorBanner">✕</button>
  </div>

  <div class="layout${sidebarClass}${panelClass}" id="layout">

    <div class="topbar">
      <button class="tb-btn" id="btnToggleSidebar" title="Historial">☰</button>
      <div class="tb-brand">
        ${b.logo
          ? `<img class="tb-logo" src="${this._escape(b.logo)}" alt="${this._escape(b.name)}" />`
          : `<div class="tb-title">${this._escape(b.name)}</div>`}
        ${b.sub ? `<div class="tb-sub">${this._escape(b.sub)}</div>` : ''}
      </div>
      ${this._ttsEnabled ? `<button class="tb-btn" id="btnToggleTts" title="Voz automática">${this._ttsAutoPlay ? '🔊' : '🔇'}</button>` : ''}
    </div>

    <aside class="sidebar">
      <div class="sb-head">
        <div class="sb-label">Historial</div>
        <div class="sb-head-actions">
          <button class="sb-new" id="btnNewChat">+ Nueva</button>
          <button class="mobile-close" id="btnCloseSidebar" title="Cerrar">✕</button>
        </div>
      </div>
      <div class="chats-list" id="chatsList">
        <div class="empty">Sin consultas previas</div>
      </div>
    </aside>

    <main class="main">
      <div class="messages" id="messages"></div>
      <div class="input-area">
        <div class="input-box">
          <textarea class="input-ta" id="chatInput" rows="1" placeholder="${this._escape(b.placeholder)}"></textarea>
          <button class="mic-btn idle" id="micBtn" title="Hablar">🎤</button>
          <button class="send-btn" id="sendBtn" title="Enviar">↑</button>
        </div>
      </div>
    </main>

    <aside class="panel">
      <div class="panel-close-row">
        <button class="mobile-close" id="btnClosePanel" title="Cerrar">✕</button>
      </div>
      <div class="panel-section">
        <div class="panel-head"><div class="panel-title">Panel</div></div>
        <div class="empty small">Sin contenido</div>
      </div>
    </aside>

    <div class="backdrop" id="backdrop"></div>

  </div>

</div>
      `;
    }
  }

  customElements.define('akira-console', AkiraConsole);
  console.log(`${TAG} Registrado.`);

})();