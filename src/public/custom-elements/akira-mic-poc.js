/* ═══════════════════════════════════════════════════════════════════════════
 * KAMISUITE — AKIRA Microphone PoC (Wix Custom Element)
 * VERSION: 1.0.0
 * FECHA:   23 Abril 2026
 *
 * OBJETIVO
 *   Prueba de concepto desechable. Verifica si un Custom Element de Wix
 *   —a diferencia del HTML Component (iframe sandbox sin allow="microphone")
 *   y del page code de Velo (linter/sandbox sin APIs de navegador)— permite
 *   acceder al micrófono del dispositivo.
 *
 * PRUEBAS
 *   1. navigator.mediaDevices.getUserMedia({ audio: true })
 *        → ¿el navegador pide permiso y lo concede?
 *   2. SpeechRecognition / webkitSpeechRecognition
 *        → transcripción voz→texto nativa (gratis, sin backend)
 *   3. MediaRecorder
 *        → grabación a Blob (plan B: enviar a Whisper desde backend .web.js)
 *
 * DESPLIEGUE EN WIX
 *   1. Subir este archivo a un host accesible por HTTPS. Opciones:
 *        a) Carpeta pública de Velo: Developer Tools > Public > subir .js
 *           → URL tipo https://<site>.filesusr.com/.../akira-mic-poc.js
 *        b) CDN externo (GitHub Pages, jsDelivr, etc.)
 *   2. En el editor Wix:
 *        Incrustar > Elemento personalizado > +
 *        - Tag name:  akira-mic-poc
 *        - Source:    URL del .js
 *   3. Publicar y abrir la página en Chrome desktop, Chrome Android y
 *      Safari iOS. Reportar qué marca ✅ / ❌ en cada entorno.
 *
 * ESTE ARCHIVO NO TOCA EL AKIRA ACTUAL. Es independiente y descartable.
 * ═══════════════════════════════════════════════════════════════════════════
 */

(function () {
  'use strict';

  if (customElements.get('akira-mic-poc')) {
    console.log('[AKIRA MicPoC v1.0.0] Ya registrado, omitiendo.');
    return;
  }

  const TAG = 'AKIRA MicPoC v1.0.0';

  class AkiraMicPoC extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
    }

    connectedCallback() {
      this._render();
      this._bindEvents();
      this._renderEnvironment();
      console.log('[' + TAG + '] Montado en el DOM.');
    }

    // ─────────────────────────────────────────────────────────────────────
    // RENDER
    // ─────────────────────────────────────────────────────────────────────
    _render() {
      this.shadowRoot.innerHTML = `
        <style>
          :host {
            display: block;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            color: #1a1a1a;
            background: #ffffff;
            padding: 20px;
            box-sizing: border-box;
            max-width: 720px;
            margin: 0 auto;
          }
          h1 { font-size: 20px; font-weight: 600; margin: 0 0 4px 0; color: #243665; }
          .subtitle { font-size: 13px; color: #666; margin-bottom: 20px; }
          .test {
            border: 1px solid #e4e4e4; border-radius: 8px;
            padding: 14px 16px; margin-bottom: 12px; background: #fafafa;
          }
          .test-head {
            display: flex; align-items: center; justify-content: space-between;
            gap: 12px; margin-bottom: 6px;
          }
          .test-title { font-size: 14px; font-weight: 600; color: #243665; flex: 1; }
          .test-status { font-size: 18px; width: 24px; text-align: center; }
          .test-desc { font-size: 12px; color: #666; margin-bottom: 10px; }
          .test-msg {
            font-size: 12px;
            font-family: "SF Mono", Menlo, Consolas, monospace;
            background: #fff; border: 1px solid #eee; border-radius: 4px;
            padding: 8px 10px; min-height: 18px; margin-top: 8px;
            white-space: pre-wrap; word-break: break-word; color: #333;
          }
          button {
            background: #243665; color: #fff; border: 0;
            padding: 8px 14px; border-radius: 6px;
            font-size: 13px; font-weight: 500; cursor: pointer;
            font-family: inherit;
          }
          button:hover { background: #1a2850; }
          button:disabled { background: #999; cursor: not-allowed; }
          .run-all { background: #d97706; margin-bottom: 16px; }
          .run-all:hover { background: #b45309; }
          .ok { color: #059669; }
          .fail { color: #dc2626; }
          .pending { color: #999; }
          .env {
            margin-top: 20px; padding: 12px 14px;
            background: #f5f5f5; border-radius: 6px;
            font-size: 11px;
            font-family: "SF Mono", Menlo, Consolas, monospace;
            color: #555; line-height: 1.6; word-break: break-word;
          }
          .env-title {
            font-family: inherit; font-weight: 600;
            margin-bottom: 6px; color: #243665; font-size: 12px;
          }
          .env-row { display: flex; gap: 8px; }
          .env-key { color: #888; min-width: 130px; }
          .env-val { color: #222; flex: 1; }
        </style>

        <h1>AKIRA — Test de micrófono (PoC)</h1>
        <div class="subtitle">Wix Custom Element · v1.0.0 · verifica acceso a APIs de audio</div>

        <button class="run-all" data-action="run-all">▶ Ejecutar las 3 pruebas</button>

        <div class="test" data-test="gum">
          <div class="test-head">
            <div class="test-title">1. getUserMedia</div>
            <div class="test-status pending" data-status>⏳</div>
          </div>
          <div class="test-desc">Permiso del navegador para abrir el micrófono.</div>
          <button data-action="gum">Probar</button>
          <div class="test-msg" data-msg>Pendiente</div>
        </div>

        <div class="test" data-test="sr">
          <div class="test-head">
            <div class="test-title">2. SpeechRecognition (voz → texto)</div>
            <div class="test-status pending" data-status>⏳</div>
          </div>
          <div class="test-desc">Transcripción nativa del navegador. Habla en español unos segundos tras pulsar.</div>
          <button data-action="sr">Probar (habla tras pulsar)</button>
          <div class="test-msg" data-msg>Pendiente</div>
        </div>

        <div class="test" data-test="mr">
          <div class="test-head">
            <div class="test-title">3. MediaRecorder</div>
            <div class="test-status pending" data-status>⏳</div>
          </div>
          <div class="test-desc">Grabación de 2s a Blob (plan B para enviar a Whisper si falla SpeechRecognition).</div>
          <button data-action="mr">Probar</button>
          <div class="test-msg" data-msg>Pendiente</div>
        </div>

        <div class="env">
          <div class="env-title">Entorno</div>
          <div data-env></div>
        </div>
      `;
    }

    // ─────────────────────────────────────────────────────────────────────
    // EVENTOS
    // ─────────────────────────────────────────────────────────────────────
    _bindEvents() {
      this.shadowRoot.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-action]');
        if (!btn) return;
        const action = btn.getAttribute('data-action');
        if (action === 'gum')       this._runTest('gum', () => this._testGetUserMedia());
        else if (action === 'sr')   this._runTest('sr',  () => this._testSpeechRecognition());
        else if (action === 'mr')   this._runTest('mr',  () => this._testMediaRecorder());
        else if (action === 'run-all') this._runAll();
      });
    }

    async _runAll() {
      await this._runTest('gum', () => this._testGetUserMedia());
      await this._runTest('sr',  () => this._testSpeechRecognition());
      await this._runTest('mr',  () => this._testMediaRecorder());
    }

    _setStatus(testId, status, msg) {
      const card = this.shadowRoot.querySelector(`.test[data-test="${testId}"]`);
      if (!card) return;
      const s = card.querySelector('[data-status]');
      const m = card.querySelector('[data-msg]');
      s.classList.remove('ok', 'fail', 'pending');
      if (status === 'ok')           { s.classList.add('ok');      s.textContent = '✅'; }
      else if (status === 'fail')    { s.classList.add('fail');    s.textContent = '❌'; }
      else if (status === 'running') { s.classList.add('pending'); s.textContent = '⏺'; }
      else                            { s.classList.add('pending'); s.textContent = '⏳'; }
      m.textContent = msg;
    }

    async _runTest(testId, fn) {
      this._setStatus(testId, 'running', 'Ejecutando…');
      try {
        const res = await fn();
        this._setStatus(testId, res.ok ? 'ok' : 'fail', res.msg);
        console.log('[' + TAG + '] ' + testId + ':', res);
      } catch (err) {
        this._setStatus(testId, 'fail', `Excepción: ${err.name}: ${err.message}`);
        console.error('[' + TAG + '] ' + testId + ' excepción:', err);
      }
    }

    // ─────────────────────────────────────────────────────────────────────
    // TEST 1 — getUserMedia
    // ─────────────────────────────────────────────────────────────────────
    async _testGetUserMedia() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        return { ok: false, msg: 'navigator.mediaDevices.getUserMedia NO disponible en este contexto.' };
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const tracks = stream.getAudioTracks();
        const label  = tracks[0] ? (tracks[0].label || '(sin etiqueta)') : '(sin pistas)';
        tracks.forEach(t => t.stop()); // liberar mic
        return { ok: true, msg: `Permiso concedido. Pista de audio: ${label}` };
      } catch (err) {
        return { ok: false, msg: `${err.name}: ${err.message}` };
      }
    }

    // ─────────────────────────────────────────────────────────────────────
    // TEST 2 — SpeechRecognition
    // ─────────────────────────────────────────────────────────────────────
    _testSpeechRecognition() {
      return new Promise((resolve) => {
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) {
          resolve({
            ok: false,
            msg: 'SpeechRecognition / webkitSpeechRecognition NO disponibles. Típico en iOS Safari y en algunas versiones de Firefox.'
          });
          return;
        }

        let rec;
        try {
          rec = new SR();
        } catch (err) {
          resolve({ ok: false, msg: `Constructor falló: ${err.name}: ${err.message}` });
          return;
        }

        rec.lang = 'es-ES';
        rec.interimResults = true;
        rec.continuous = false;
        rec.maxAlternatives = 1;

        let resolved = false;
        const done = (r) => {
          if (resolved) return;
          resolved = true;
          try { rec.stop(); } catch (_) {}
          resolve(r);
        };

        rec.onresult = (e) => {
          const text = Array.from(e.results).map(r => r[0].transcript).join('');
          const isFinal = e.results[e.results.length - 1].isFinal;
          if (isFinal || text.length > 2) {
            done({ ok: true, msg: `Transcrito: "${text}"${isFinal ? '' : ' (interim)'}` });
          }
        };
        rec.onerror = (e) => {
          done({ ok: false, msg: `error: ${e.error || 'desconocido'}${e.message ? ' — ' + e.message : ''}` });
        };
        rec.onend = () => {
          done({ ok: false, msg: 'Finalizó sin resultado. Revisa permisos del sistema y vuelve a probar hablando claramente tras pulsar.' });
        };

        try {
          rec.start();
          setTimeout(() => done({ ok: false, msg: 'Timeout 10s sin resultado.' }), 10000);
        } catch (err) {
          done({ ok: false, msg: `start() falló: ${err.name}: ${err.message}` });
        }
      });
    }

    // ─────────────────────────────────────────────────────────────────────
    // TEST 3 — MediaRecorder
    // ─────────────────────────────────────────────────────────────────────
    async _testMediaRecorder() {
      if (typeof window.MediaRecorder === 'undefined') {
        return { ok: false, msg: 'MediaRecorder NO disponible en este navegador.' };
      }
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        return { ok: false, msg: 'getUserMedia no disponible (precondición para MediaRecorder).' };
      }

      const mimeCandidates = [
        'audio/webm',
        'audio/webm;codecs=opus',
        'audio/mp4',
        'audio/ogg;codecs=opus',
        'audio/wav'
      ];
      const supported = mimeCandidates.filter(m => {
        try { return MediaRecorder.isTypeSupported(m); } catch (_) { return false; }
      });

      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (err) {
        return { ok: false, msg: `getUserMedia falló: ${err.name}: ${err.message}` };
      }

      return new Promise((resolve) => {
        let rec;
        try {
          rec = new MediaRecorder(stream);
        } catch (err) {
          stream.getTracks().forEach(t => t.stop());
          resolve({ ok: false, msg: `Constructor MediaRecorder falló: ${err.name}: ${err.message}` });
          return;
        }

        const chunks = [];
        rec.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data); };
        rec.onstop = () => {
          stream.getTracks().forEach(t => t.stop());
          const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
          resolve({
            ok: true,
            msg: `Grabación 2s OK. Blob: ${blob.size} bytes · MIME activo: ${rec.mimeType || '(ninguno)'} · MIMEs soportados: ${supported.join(', ') || '(ninguno detectado)'}`
          });
        };
        rec.onerror = (e) => {
          stream.getTracks().forEach(t => t.stop());
          resolve({ ok: false, msg: `onerror: ${e.error ? e.error.name + ' ' + (e.error.message || '') : 'desconocido'}` });
        };

        try {
          rec.start();
          setTimeout(() => { try { rec.stop(); } catch (_) {} }, 2000);
        } catch (err) {
          stream.getTracks().forEach(t => t.stop());
          resolve({ ok: false, msg: `start() MediaRecorder falló: ${err.name}: ${err.message}` });
        }
      });
    }

    // ─────────────────────────────────────────────────────────────────────
    // ENTORNO (diagnóstico)
    // ─────────────────────────────────────────────────────────────────────
    _renderEnvironment() {
      const target = this.shadowRoot.querySelector('[data-env]');
      if (!target) return;

      const inIframe = (() => {
        try { return window.self !== window.top; } catch (_) { return true; }
      })();

      const rows = [
        ['User Agent',        navigator.userAgent],
        ['Protocolo',         location.protocol],
        ['Host',              location.hostname],
        ['Secure Context',    String(window.isSecureContext)],
        ['Dentro de iframe',  String(inIframe)],
        ['mediaDevices',      String(!!navigator.mediaDevices)],
        ['getUserMedia',      String(!!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia))],
        ['SpeechRecognition', String(!!(window.SpeechRecognition || window.webkitSpeechRecognition))],
        ['MediaRecorder',     String(typeof window.MediaRecorder !== 'undefined')],
        ['Permissions API',   String(!!(navigator.permissions && navigator.permissions.query))]
      ];

      target.innerHTML = rows.map(r =>
        `<div class="env-row"><div class="env-key">${r[0]}:</div><div class="env-val">${escapeHtml(r[1])}</div></div>`
      ).join('');

      // Consulta del estado del permiso de micrófono (si está disponible)
      if (navigator.permissions && navigator.permissions.query) {
        navigator.permissions.query({ name: 'microphone' }).then((p) => {
          const div = document.createElement('div');
          div.className = 'env-row';
          div.innerHTML = `<div class="env-key">Mic permission:</div><div class="env-val">${escapeHtml(p.state)}</div>`;
          target.appendChild(div);
        }).catch(() => { /* navegador no soporta name:'microphone' */ });
      }
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  customElements.define('akira-mic-poc', AkiraMicPoC);
  console.log('[' + TAG + '] Registrado como <akira-mic-poc>.');
})();