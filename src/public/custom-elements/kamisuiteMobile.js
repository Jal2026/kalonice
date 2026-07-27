/* ═══════════════════════════════════════════════════════════════════════════
 * KAMISUITE — Agenda Móvil + AKIRA (Wix Custom Element)
 * Archivo:  kamisuiteMobile.js
 * Ubicación en Wix: public/custom-elements/
 * Tag name: kamisuite-mobile
 * VERSION:  1.7.2
 * FECHA:    01 Mayo 2026
 *
 * CHANGELOG v1.7.2:
 *   - Auto-detección de chip por voz/texto: si el usuario dice
 *     "reservar/cancelar/modificar/consultar" sin chip activo,
 *     se activa el chip correspondiente automáticamente antes de
 *     enviar a Sonnet. Preparación para protocolo de voz telefónica.
 *   - Chip se desactiva tras acción completada (akira-action-done)
 *     para volver a estado neutro.
 *
 * CHANGELOG v1.7.1:
 *   - Fix: detail panel dentro de cal-zone
 *
 * CHANGELOG v1.7.0:
 *   - Fix TTS mudo en respuestas instantáneas (doble cancel)
 *
 * CHANGELOG v1.6.0:
 *   - Mic PERMANENTE
 *
 * CHANGELOG v1.5.0: _lastInputWasMic
 * CHANGELOG v1.3.0: confirm/cancel text, auto-listen confirmación
 * CHANGELOG v1.2.0: Snap divider, STOP button, staff reorder
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (customElements.get('kamisuite-mobile')) { console.log('[KamisuiteMobile v1.7.2] Ya registrado.'); return; }

  const VERSION = '1.7.2';
  const TAG = `[Mobile v${VERSION}]`;

  const ABLU = '#243665', ABG = '#0c1529', ASURF = '#132041', ABRD = 'rgba(36,54,101,.5)', AGLOW = 'rgba(36,54,101,.25)';
  const GOLD = '#c9a44a';
  const CAL_START = 9, CAL_END = 21;
  const PALETTE = ['#d4a017','#9333ea','#e8368f','#2563eb','#059669','#dc2626','#0d9488','#7c3aed','#ea580c','#15803d','#be185d','#475569'];
  const GENERIC_EMAILS = new Set(['booking@hair-times.com','info@hairtimes.com','info@hair-times.com','']);
  const CHIPS = [
    { id:'reservar', label:'RESERVAR', icon:'📅', color:'#2a9d54' },
    { id:'cancelar', label:'CANCELAR', icon:'🗑️', color:'#d93636' },
    { id:'modificar', label:'MODIFICAR', icon:'✏️', color:'#6b9aeb' },
    { id:'consultar', label:'CONSULTAR', icon:'🔍', color:GOLD },
  ];
  const CHIP_PROMPTS = {
    reservar:'¿Para quién quieres reservar? Dime nombre, servicio y cuándo.',
    cancelar:'¿Qué reserva quieres cancelar? Dime el nombre del cliente.',
    modificar:'¿Qué quieres modificar? Puedo cambiar hora, empleado o servicios.',
    consultar:'¿Qué quieres saber? Disponibilidad, agenda del día, ficha de cliente...',
  };
  const CONFIRM_WORDS = new Set(['confirmar','sí','si','ok','vale','adelante','hazlo','procede','claro','venga','perfecto']);
  const CANCEL_WORDS = new Set(['cancelar','no','anular','dejalo','déjalo','nada','olvida','olvidalo','olvídalo']);
  const SNAP = { peek: 0.72, half: 0.44, full: 0.18 };
  const SNAP_ORDER = ['full', 'half', 'peek'];

  // v1.7.2: Auto-detección de chip por keywords en el texto
  const CHIP_TRIGGERS = [
    { chip: 'reservar', regex: /\b(reserva[r]?|quiero reservar|necesito (?:una )?cita|pon(?:me)? (?:una )?cita|agendar|agendarme)\b/i },
    { chip: 'cancelar', regex: /\b(cancela[r]?|anula[r]?|quita[r]? (?:la )?(?:cita|reserva)|borra[r]? (?:la )?(?:cita|reserva)|elimina[r]? (?:la )?(?:cita|reserva))\b/i },
    { chip: 'modificar', regex: /\b(modifica[r]?|mueve|mover|cambia[r]?|a[nñ]ade|a[nñ]adir|reasigna[r]?)\b/i },
    { chip: 'consultar', regex: /\b(consulta[r]?|dime|cu[aá]nto|c[oó]mo (?:fue|estuvo|est[aá])|qu[eé] tal|qu[eé] hay|informaci[oó]n|disponibilidad|huecos?|facturaci[oó]n|ingresos)\b/i },
  ];

  function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
  function escAttr(s){return String(s||'').replace(/'/g,'&#39;').replace(/"/g,'&quot;');}
  function todayISO(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
  function addDays(iso,delta){const d=new Date(iso+'T12:00:00');d.setDate(d.getDate()+delta);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
  function parseMin(t){if(!t)return null;const p=t.split(':');return parseInt(p[0])*60+parseInt(p[1]);}
  function fmtDay(iso){const[y,m,d]=iso.split('-').map(Number);const dt=new Date(y,m-1,d);const ds=['dom','lun','mar','mié','jue','vie','sáb'];return `${ds[dt.getDay()]} ${d}`;}
  function madridNow(){const n=new Date(),y=n.getUTCFullYear(),mL=new Date(Date.UTC(y,2,31)),mS=31-mL.getUTCDay(),cS=Date.UTC(y,2,mS,1),oL=new Date(Date.UTC(y,9,31)),oS=31-oL.getUTCDay(),cE=Date.UTC(y,9,oS,1),off=(n.getTime()>=cS&&n.getTime()<cE)?2:1;return(n.getUTCHours()+off)*60+n.getUTCMinutes();}
  let _msgIdCounter = 0;
  function nextMsgId(){ return `m_${Date.now()}_${++_msgIdCounter}`; }

  const CSS = `
    @font-face{font-family:'Bai Jamjuree';font-style:normal;font-weight:400;font-display:swap;src:url(https://fonts.gstatic.com/s/baijamjuree/v12/LDIqapSCOBt_aeQQ7ftydoa0kePuk5A1-yiSgA.woff2) format('woff2');}
    @font-face{font-family:'Bai Jamjuree';font-style:normal;font-weight:600;font-display:swap;src:url(https://fonts.gstatic.com/s/baijamjuree/v12/LDI1apSCOBt_aeQQ7ftydoaMdc_Km7sp8g.woff2) format('woff2');}
    @font-face{font-family:'Bai Jamjuree';font-style:normal;font-weight:700;font-display:swap;src:url(https://fonts.gstatic.com/s/baijamjuree/v12/LDI1apSCOBt_aeQQ7ftydoaMEcjKm7sp8g.woff2) format('woff2');}
    :host{display:block;width:100%;height:100%;font-family:'Bai Jamjuree',sans-serif;background:${ABG};color:#fff;}
    *{box-sizing:border-box;margin:0;padding:0;}
    @keyframes pulse-w{0%,100%{opacity:1}50%{opacity:.3}}
    @keyframes pulse-mic{0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,.4)}50%{box-shadow:0 0 0 10px rgba(239,68,68,0)}}
    .app{display:flex;flex-direction:column;height:100%;overflow:hidden;}
    .hdr{display:flex;justify-content:space-between;align-items:center;padding:10px 16px 8px;border-bottom:1px solid ${ABRD};}.hdr-brand{display:flex;align-items:center;gap:8px;}.hdr-icon{width:28px;height:28px;border-radius:7px;background:${ABLU};display:flex;align-items:center;justify-content:center;color:#fff;font-size:13px;font-weight:700;}.hdr-name{font-size:12px;font-weight:700;color:${GOLD};letter-spacing:1.2px;}.hdr-sub{font-size:8px;color:rgba(255,255,255,.45);letter-spacing:.3px;}.hdr-right{display:flex;align-items:center;gap:6px;}.hdr-date{font-size:11px;font-weight:600;color:rgba(255,255,255,.7);}.tl-dot{width:8px;height:8px;border-radius:50%;animation:pulse-w 1.5s ease-in-out infinite;}.btn-gear{background:none;border:none;color:rgba(255,255,255,.55);font-size:15px;cursor:pointer;padding:2px 4px;}
    .nav{display:flex;align-items:center;gap:6px;padding:6px 16px;border-bottom:1px solid ${ABRD};}.btn-nav{width:32px;height:32px;border-radius:6px;border:1px solid ${ABRD};background:${ASURF};color:rgba(255,255,255,.65);font-size:14px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;}.btn-nav:active{background:${ABLU};}.btn-today{padding:0 12px;height:32px;border-radius:6px;border:1px solid ${GOLD}55;background:${GOLD}15;color:${GOLD};font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;letter-spacing:.5px;}.btn-today:active{background:${GOLD}30;}.date-pick{flex:1;text-align:center;background:${ASURF};border:1px solid ${ABRD};border-radius:6px;color:rgba(255,255,255,.85);font-family:inherit;font-size:12px;font-weight:600;padding:7px 8px;outline:none;-webkit-appearance:none;}.date-pick:focus{border-color:${GOLD};}.date-pick::-webkit-calendar-picker-indicator{filter:invert(.7);}
    .settings{background:${ASURF};border-bottom:1px solid ${ABRD};padding:10px 16px 12px;display:none;}.settings.open{display:block;}.set-title{font-size:8px;font-weight:700;color:${GOLD};letter-spacing:1.2px;text-transform:uppercase;margin-bottom:8px;}.set-row{display:flex;align-items:center;gap:8px;margin-bottom:6px;position:relative;}.set-toggle{width:26px;height:26px;border-radius:6px;border:1px solid rgba(255,255,255,.1);font-size:12px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;font-family:inherit;background:transparent;color:rgba(255,255,255,.25);}.set-toggle.on{background:rgba(42,157,84,.15);color:#2a9d54;border-color:rgba(42,157,84,.4);}.set-name{font-size:12px;font-weight:600;color:rgba(255,255,255,.8);flex:1;}.set-color{width:22px;height:22px;border-radius:6px;border:2px solid rgba(255,255,255,.15);cursor:pointer;flex-shrink:0;}.set-arrows{display:flex;flex-direction:column;gap:1px;flex-shrink:0;}.set-arr{width:18px;height:14px;border:none;border-radius:3px;background:rgba(255,255,255,.08);color:rgba(255,255,255,.4);font-size:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;font-family:inherit;}.set-arr:active{background:rgba(201,164,74,.2);color:${GOLD};}.color-pop{position:absolute;right:0;top:32px;background:${ABG};border:1px solid ${ABRD};border-radius:10px;padding:8px;display:grid;grid-template-columns:repeat(6,1fr);gap:4px;z-index:50;box-shadow:0 8px 32px rgba(0,0,0,.5);display:none;}.color-pop.open{display:grid;}.color-sw{width:26px;height:26px;border-radius:5px;cursor:pointer;border:2px solid transparent;}.color-sw.sel{border-color:#fff;}
    .cal-zone{flex-grow:0;flex-shrink:0;flex-basis:44%;overflow:hidden;display:flex;flex-direction:column;position:relative;border-bottom:1px solid ${ABRD};transition:flex-basis .3s ease;}.cal-zone.no-snap-anim{transition:none;}.staff-hdr{display:flex;border-bottom:1px solid ${ABRD};padding-left:38px;background:${ABLU}15;flex-shrink:0;}.staff-cell{flex:1;display:flex;align-items:center;justify-content:center;gap:4px;padding:6px 0;}.s-dot{width:9px;height:9px;border-radius:50%;flex-shrink:0;}.s-name{font-size:10px;font-weight:700;color:rgba(255,255,255,.75);letter-spacing:.3px;}.cal-scroll{flex:1;overflow-y:auto;overflow-x:hidden;position:relative;}.cal-scroll::-webkit-scrollbar{width:3px;}.cal-scroll::-webkit-scrollbar-thumb{background:${ABRD};border-radius:3px;}.cal-grid{position:relative;}.h-row{display:flex;height:48px;border-bottom:1px solid ${ABLU}30;}.h-label{width:38px;font-size:9px;font-weight:500;color:rgba(255,255,255,.45);display:flex;align-items:flex-start;justify-content:flex-end;padding-right:5px;padding-top:2px;flex-shrink:0;}.h-cell{flex:1;border-left:1px solid ${ABLU}18;}.bk{position:absolute;border-radius:4px;padding:2px 5px;overflow:hidden;cursor:pointer;z-index:2;transition:box-shadow .15s;}.bk:active{z-index:10;box-shadow:0 4px 20px ${AGLOW};}.bk-name{font-size:10px;font-weight:600;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}.bk-svc{font-size:9px;color:rgba(255,255,255,.8);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}.bk-time{font-size:8px;color:rgba(255,255,255,.55);margin-top:1px;}.bk-block{background:repeating-linear-gradient(135deg,transparent,transparent 3px,rgba(0,0,0,.15) 3px,rgba(0,0,0,.15) 6px) !important;}.now-line{position:absolute;left:0;right:0;height:2px;background:#ef4444;z-index:3;pointer-events:none;}.now-line::before{content:'';position:absolute;left:-3px;top:-3px;width:8px;height:8px;border-radius:50%;background:#ef4444;}.no-staff{flex:1;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,.25);font-size:12px;}
    .detail{position:absolute;bottom:0;left:0;right:0;background:rgba(12,21,41,.97);backdrop-filter:blur(16px);border-top:1px solid ${GOLD}44;padding:10px 16px 12px;z-index:15;display:none;}.detail.open{display:block;}.det-top{display:flex;align-items:center;margin-bottom:4px;}.det-staff{font-size:10px;font-weight:700;color:${GOLD};letter-spacing:.5px;text-transform:uppercase;flex:1;}.pill{font-size:8px;font-weight:700;color:#fff;padding:2px 6px;border-radius:99px;letter-spacing:.3px;margin-left:6px;}.det-x{background:none;border:none;color:rgba(255,255,255,.35);font-size:16px;cursor:pointer;padding:0 4px;}.warn-row{display:flex;align-items:center;gap:5px;background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.2);border-radius:6px;padding:4px 8px;margin-bottom:6px;}.warn-dot{width:7px;height:7px;border-radius:50%;background:#ef4444;animation:pulse-w 1.5s ease-in-out infinite;flex-shrink:0;}.warn-txt{font-size:9px;color:#ef4444;}.det-name{font-size:14px;font-weight:700;color:#fff;margin-bottom:6px;}.d-row{display:flex;align-items:center;gap:6px;margin-bottom:3px;}.d-icon{font-size:12px;width:18px;text-align:center;flex-shrink:0;}.d-val{font-size:11px;color:rgba(255,255,255,.75);flex:1;}.d-price{font-size:13px;font-weight:700;color:${GOLD};}.pay-row{display:flex;gap:6px;margin-top:8px;}.pay-btn{border:none;border-radius:6px;padding:8px 0;color:#fff;font-size:10px;font-weight:700;cursor:pointer;font-family:inherit;letter-spacing:.3px;flex:1;text-align:center;}.pay-btn:active{filter:brightness(1.15);}.pay-msg{margin-top:8px;font-size:11px;text-align:center;font-weight:700;}
    .divider{height:28px;display:flex;align-items:center;justify-content:center;flex-shrink:0;cursor:grab;touch-action:none;-webkit-user-select:none;user-select:none;}.divider:active{cursor:grabbing;}.div-handle{width:36px;height:4px;border-radius:2px;background:${ABRD};transition:width .15s ease, height .15s ease, background .15s ease;}.divider.dragging .div-handle{width:52px;height:5px;background:${GOLD}88;}
    .akira{flex:1;display:flex;flex-direction:column;overflow:hidden;}.chips{display:flex;gap:5px;padding:6px 14px;justify-content:center;flex-shrink:0;}.chip{display:flex;flex-direction:column;align-items:center;gap:1px;padding:5px 11px;border-radius:8px;border:1px solid ${ABRD};background:${ASURF};color:rgba(255,255,255,.65);cursor:pointer;font-family:inherit;transition:all .15s;}.chip.act{border-color:var(--cc);background:color-mix(in srgb, var(--cc) 12%, transparent);color:var(--cc);}.chip-icon{font-size:11px;}.chip-label{font-size:8px;font-weight:700;letter-spacing:.5px;}.chat{flex:1;overflow-y:auto;padding:6px 14px;display:flex;flex-direction:column;gap:8px;}.chat::-webkit-scrollbar{width:3px;}.chat::-webkit-scrollbar-thumb{background:${ABRD};border-radius:3px;}.bub{max-width:85%;padding:8px 12px;border-radius:12px;font-size:12px;line-height:1.5;white-space:pre-line;word-wrap:break-word;}.bub-u{align-self:flex-end;background:${ABLU};color:#fff;border-bottom-right-radius:4px;}.bub-a{align-self:flex-start;background:${ASURF};color:rgba(255,255,255,.9);border-bottom-left-radius:4px;border:1px solid ${ABRD};}.bub-ok{background:rgba(42,157,84,.1);border:1px solid rgba(42,157,84,.25);color:#2a9d54;}.bub-confirm{align-self:flex-start;background:${ASURF};border:1px solid ${GOLD}55;border-bottom-left-radius:4px;color:rgba(255,255,255,.9);}.a-label{font-size:8px;font-weight:700;color:${GOLD};letter-spacing:1px;margin-bottom:3px;}.confirm-btns{display:flex;gap:6px;margin-top:8px;}.btn-cf{border:none;border-radius:6px;padding:6px 14px;font-family:inherit;font-weight:700;font-size:11px;cursor:pointer;}.btn-cf-yes{background:#2a9d54;color:#fff;}.btn-cf-no{background:rgba(255,255,255,.1);color:rgba(255,255,255,.6);}
    .input-row{display:flex;gap:6px;padding:8px 14px 16px;align-items:center;border-top:1px solid ${ABRD};flex-shrink:0;}.mic{width:38px;height:38px;border-radius:50%;border:1px solid ${ABRD};background:${ASURF};color:${GOLD};font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all .2s;}.mic.on{background:#ef4444;color:#fff;border-color:#ef4444;animation:pulse-mic 1.5s ease infinite;}.stop-btn{width:38px;height:38px;border-radius:50%;background:#dc2626;border:none;color:#fff;cursor:pointer;display:none;align-items:center;justify-content:center;flex-shrink:0;animation:pulse-mic 1.5s ease infinite;}.stop-btn svg{width:14px;height:14px;}.txt-in{flex:1;background:${ASURF};border:1px solid ${ABRD};border-radius:20px;padding:9px 14px;color:#fff;font-size:12px;font-family:inherit;outline:none;}.txt-in:focus{border-color:${GOLD};}.txt-in::placeholder{color:rgba(255,255,255,.35);}.send{width:38px;height:38px;border-radius:50%;background:${GOLD};border:none;color:${ABG};font-size:16px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
    .toast{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);background:#1a1d23;color:#fff;padding:8px 18px;border-radius:999px;font-size:11px;font-weight:600;display:none;z-index:200;max-width:calc(100% - 24px);text-align:center;}
  `;

  const PRONUNCIACION = {'KAMISUITE':'Kamisuit','kamisuite':'kamisuit','Kamisuite':'Kamisuit','AKIRA':'Akira','Kerastase':'Kerastás','KERASTASE':'Kerastás','Kérastase':'Kerastás','Redken':'Rédken','Nanoplastia':'Nanoplástia','Bizum':'Bísum','check-in':'chekin','checkout':'chekaut','staff':'estaf','Staff':'Estaf','STAFF':'Estaf'};
  function pronunciar(text){let r=text;for(const w in PRONUNCIACION){r=r.replace(new RegExp('\\b'+w.replace(/[-\/\\^$*+?.()|[\]{}]/g,'\\$&')+'\\b','g'),PRONUNCIACION[w]);}return r;}
  function separarTelefonos(t){return t.replace(/\d{7,}/g,m=>m.split('').join(' '));}

  class KamisuiteMobile extends HTMLElement {
    static get observedAttributes() { return ['response']; }
    constructor() {
      super(); this.attachShadow({ mode: 'open' });
      this._fecha = todayISO(); this._staff = []; this._reservas = []; this._packs = [];
      this._settings = { rowHeight: 48, staffConfig: {} }; this._settingsLoaded = false;
      this._selectedBooking = null; this._showSettings = false; this._colorPickerFor = null;
      this._voiceEnabled = true; this._selectedVoice = null; this._spanishVoices = [];
      this._speakQueue = []; this._isSpeaking = false;
      this._messages = [{ role: 'akira', text: '¡Hola! Soy AKIRA, tu asistente. ¿En qué puedo ayudarte?' }];
      this._activeChip = null; this._isListening = false; this._pendingConfirmId = null;
      this._snapMode = 'half';
      this._micPermanent = true;
      this._lastCancelTs = 0;
    }

    connectedCallback() {
      if (!document.getElementById('kamisuite-mobile-font')) { const link = document.createElement('link'); link.id = 'kamisuite-mobile-font'; link.rel = 'stylesheet'; link.href = 'https://fonts.googleapis.com/css2?family=Bai+Jamjuree:wght@400;500;600;700&display=swap'; document.head.appendChild(link); }
      this._render(); this._bindEvents(); this._setupVoices();
      this._sendToPage('ready', {}); this._sendToPage('get-staff', {});
      setTimeout(() => { if (this._micPermanent) this._startMic(); }, 2000);
      console.log(`${TAG} Montado.`);
    }
    attributeChangedCallback(name, oldVal, newVal) { if (name !== 'response' || !newVal || oldVal === newVal) return; let p; try { p = JSON.parse(newVal); } catch (e) { return; } this._handleResponse(p); }
    _sendToPage(type, data = {}) { this.dispatchEvent(new CustomEvent('mobile-message', { detail: { type, ...data }, bubbles: true, composed: true })); }

    _handleResponse(p) {
      switch (p.type) {
        case 'staff-data': this._staff = p.staff || []; this._initStaffConfig(); if (!this._settingsLoaded) this._sendToPage('get-settings', {}); else this._sendToPage('get-reservas', { fecha: this._fecha }); break;
        case 'settings-data': if (p.settings) { this._settings = { ...this._settings, ...p.settings }; this._initStaffConfig(); } this._settingsLoaded = true; this._sendToPage('get-reservas', { fecha: this._fecha }); break;
        case 'reservas-data': if (p.fecha && p.fecha !== this._fecha) break; this._reservas = p.reservas || []; this._packs = p.packs || []; this._renderCalendar(); break;
        case 'error': this._toast(p.message || 'Error'); break;
        case 'pay-ok': this._toast(`Cobrado ✅ — ${p.metodoPago || ''}`); this._addMessage('akira', `Cobro registrado ✓ — ${p.metodoPago || ''}`, true); this._selectedBooking = null; this._renderDetail(); setTimeout(() => this._reload(), 1500); break;
        case 'pay-error': this._toast('Error: ' + (p.message || '')); break;
        case 'akira-response': if (p.ok && p.respuesta) { this._addMessage('akira', p.respuesta); this._speakResponse(p.respuesta); } else if (!p.ok) this._addMessage('akira', '⚠️ ' + (p.error || 'Error')); break;
        case 'akira-action-confirm': this._pendingConfirmId = p.messageId; this._addConfirmMessage(p.message); this._speakResponse(p.message); break;
        // v1.7.2: Desactivar chip tras acción completada → vuelta a estado neutro
        case 'akira-action-done': this._addMessage('akira', p.respuesta || 'Hecho ✓', true); this._speakResponse(p.respuesta || 'Hecho'); this._activeChip = null; this._renderChips(); if (p.refreshCalendar) setTimeout(() => this._reload(), 800); break;
        case 'navigate-date': if (p.fecha) this._setDate(p.fecha); if (p.respuesta) { this._addMessage('akira', p.respuesta); this._speakResponse(p.respuesta); } break;
        case 'tick': this._reload(); break;
      }
    }

    _reload() { this._sendToPage('get-reservas', { fecha: this._fecha }); }
    _initStaffConfig() { const cfg = this._settings.staffConfig; let pos = 1; for (const s of this._staff) { if (!cfg[s.id]) cfg[s.id] = { visible: true, color: PALETTE[pos % PALETTE.length], position: pos }; pos++; } }
    _getVisibleStaff() { const cfg = this._settings.staffConfig; return this._staff.filter(s => cfg[s.id]?.visible !== false).sort((a, b) => (cfg[a.id]?.position || 99) - (cfg[b.id]?.position || 99)); }
    _staffColor(rid) { return this._settings.staffConfig[rid]?.color || '#6b7280'; }
    _staffName(rid) { const s = this._staff.find(x => x.id === rid); return s ? s.name : '?'; }
    _findPack(bid) { if (!bid || !this._packs.length) return null; return this._packs.find(p => [...(p.bookingIds || []), ...(p.bookingIdsPendientes || [])].includes(bid)); }
    _toast(msg, ms = 2500) { const t = this.shadowRoot.getElementById('toast'); t.textContent = msg; t.style.display = 'block'; clearTimeout(this._toastTimer); this._toastTimer = setTimeout(() => t.style.display = 'none', ms); }
    _setDate(iso) { this._fecha = iso; this._selectedBooking = null; this._renderDetail(); this._updateNav(); this._reload(); }
    _updateNav() { this.shadowRoot.getElementById('navDay').textContent = fmtDay(this._fecha); const dp = this.shadowRoot.getElementById('datePicker'); if (dp) dp.value = this._fecha; }

    _addMessage(role, text, isConfirm = false) { this._messages.push({ role, text, isConfirm }); this._renderChat(); }
    _addConfirmMessage(text) { this._messages.push({ role: 'confirm', text }); this._renderChat(); }

    _sendAkiraQuery(text) {
      if (!text.trim()) return;
      this._lastCancelTs = Date.now();
      try{window.speechSynthesis?.cancel();}catch(e){}
      this._speakQueue=[];this._isSpeaking=false;this._hideStopBtn();
      if (this._pendingConfirmId) {
        const w = text.trim().toLowerCase().replace(/[.!¡¿?]/g, '');
        if (CONFIRM_WORDS.has(w)) { this._addMessage('user', text); this._sendToPage('akira-execute', { messageId: this._pendingConfirmId }); this._pendingConfirmId = null; this.shadowRoot.querySelectorAll('[data-cf]').forEach(b => { b.disabled = true; b.style.opacity = '.4'; }); return; }
        if (CANCEL_WORDS.has(w)) { this._addMessage('user', text); this._sendToPage('akira-cancel', { messageId: this._pendingConfirmId }); this._pendingConfirmId = null; this.shadowRoot.querySelectorAll('[data-cf]').forEach(b => { b.disabled = true; b.style.opacity = '.4'; }); return; }
      }
      // v1.7.2: Auto-detectar chip si ninguno activo
      if (!this._activeChip) {
        for (const trigger of CHIP_TRIGGERS) {
          if (trigger.regex.test(text)) {
            this._activeChip = trigger.chip;
            this._renderChips();
            console.log(`${TAG} 🏷️ Auto-chip: ${trigger.chip}`);
            break;
          }
        }
      }
      this._addMessage('user', text);
      this._sendToPage('akira-query', { query: text, messageId: nextMsgId(), fechaCalendario: this._fecha, chipActivo: this._activeChip || null, history: this._messages.filter(m => m.role === 'user' || m.role === 'akira').slice(-10).map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', text: m.text })) });
    }

    // ═══════════════════════════════════════════
    // TTS
    // ═══════════════════════════════════════════
    _setupVoices(){if(!window.speechSynthesis)return;window.speechSynthesis.onvoiceschanged=()=>this._loadVoices();this._loadVoices();}
    _loadVoices(){const voices=window.speechSynthesis?.getVoices();if(!voices||!voices.length)return;this._spanishVoices=voices.filter(v=>v.lang&&v.lang.startsWith('es'));if(!this._spanishVoices.length)return;const MALE=/jorge|andr[eé]s|diego|pablo|enrique|juan|male|masculin/i;const prios=[v=>/google/i.test(v.name)&&/estados unidos/i.test(v.name)&&!MALE.test(v.name),v=>/natural/i.test(v.name)&&v.lang.startsWith('es')&&!MALE.test(v.name),v=>v.lang.startsWith('es')&&/m[oó]nica|elena|paulina|elvira/i.test(v.name),v=>v.lang.startsWith('es')&&/google/i.test(v.name)&&!MALE.test(v.name),v=>v.lang==='es-ES'&&!MALE.test(v.name)];for(const fn of prios){for(let i=0;i<this._spanishVoices.length;i++){if(fn(this._spanishVoices[i])){this._selectedVoice=this._spanishVoices[i];return;}}}this._selectedVoice=this._spanishVoices[0];}

    _speakResponse(text){
      if(!this._voiceEnabled||!window.speechSynthesis)return;
      const now = Date.now();
      const recentCancel = (now - (this._lastCancelTs || 0)) < 250;
      try{window.speechSynthesis.cancel();}catch(e){}
      this._lastCancelTs = now;
      let clean=text.replace(/€/g,' euros').replace(/\n/g,'. ').replace(/\*\*/g,'').replace(/\s+/g,' ').trim();
      clean=separarTelefonos(pronunciar(clean));
      if(clean.length>600){clean=clean.substring(0,600);const ld=clean.lastIndexOf('.');if(ld>300)clean=clean.substring(0,ld+1);}
      const chunks=clean.split(/(?<=[.;:])\s+/).filter(s=>s.trim().length>0);
      if(!chunks.length) return;
      this._isSpeaking=true;
      this._stopMic();
      const delay = recentCancel ? 250 : 60;
      this._speakQueue=chunks;this._showStopBtn();setTimeout(()=>this._speakNext(),delay);
    }
    _speakNext(){
      if(!this._speakQueue.length||!this._voiceEnabled){
        this._isSpeaking=false;this._hideStopBtn();
        if(this._micPermanent && !this._isListening){
          setTimeout(()=>this._startMic(),600);
        }
        return;
      }
      const chunk=this._speakQueue.shift().replace(/[.;:]+\s*$/,'').trim();
      if(!chunk){this._speakNext();return;}
      const u=new SpeechSynthesisUtterance(chunk);u.lang='es-ES';u.rate=1.25;u.pitch=1.1;
      if(this._selectedVoice)u.voice=this._selectedVoice;
      u.onend=()=>this._speakNext();u.onerror=()=>this._speakNext();
      window.speechSynthesis.speak(u);
    }

    // ═══════════════════════════════════════════
    // MIC PERMANENTE
    // ═══════════════════════════════════════════
    _startMic() {
      if (this._isListening || this._isSpeaking) return;
      if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) return;
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      this._recognition = new SR();
      this._recognition.lang = 'es-ES';
      this._recognition.continuous = false;
      this._recognition.interimResults = false;
      this._recognition.onresult = (e) => {
        const text = e.results[0][0].transcript;
        this.shadowRoot.getElementById('txtInput').value = text;
        this._sendAkiraQuery(text);
        this.shadowRoot.getElementById('txtInput').value = '';
      };
      this._recognition.onerror = (e) => {
        console.log(`${TAG} 🎤 Error: ${e.error}`);
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
          this._micPermanent = false;
          console.log(`${TAG} 🎤 Permiso denegado — mic permanente desactivado`);
        }
        this._isListening = false;
        this._recognition = null;
        const btn = this.shadowRoot.getElementById('btnMic');
        if (btn) btn.classList.remove('on');
      };
      this._recognition.onend = () => {
        this._isListening = false;
        this._recognition = null;
        const btn = this.shadowRoot.getElementById('btnMic');
        if (btn) btn.classList.remove('on');
        if (this._micPermanent && !this._isSpeaking) {
          setTimeout(() => this._startMic(), 400);
        }
      };
      try {
        this._recognition.start();
        this._isListening = true;
        const btn = this.shadowRoot.getElementById('btnMic');
        if (btn) btn.classList.add('on');
      } catch (e) {
        console.log(`${TAG} 🎤 Start failed: ${e.message}`);
        this._recognition = null;
      }
    }

    _stopMic() {
      if (this._recognition) { try { this._recognition.stop(); } catch (e) {} }
      this._isListening = false;
      this._recognition = null;
      const btn = this.shadowRoot.getElementById('btnMic');
      if (btn) btn.classList.remove('on');
    }

    _toggleMic() {
      if (this._isListening) {
        this._micPermanent = false;
        this._stopMic();
        console.log(`${TAG} 🎤 Mic permanente OFF`);
        return;
      }
      this._micPermanent = true;
      this._startMic();
      console.log(`${TAG} 🎤 Mic permanente ON`);
    }

    _handleStop() {
      try { window.speechSynthesis?.cancel(); } catch (e) {}
      this._speakQueue = []; this._isSpeaking = false; this._hideStopBtn();
      if (this._micPermanent && !this._isListening) {
        setTimeout(() => this._startMic(), 300);
      }
    }
    _showStopBtn() { const b = this.shadowRoot.getElementById('btnStop'); if (b) b.style.display = 'flex'; }
    _hideStopBtn() { const b = this.shadowRoot.getElementById('btnStop'); if (b) b.style.display = 'none'; }

    // ═══════════════════════════════════════════
    // RENDER + EVENTS
    // ═══════════════════════════════════════════
    _render() {
      this.shadowRoot.innerHTML = `<style>${CSS}</style>
        <div class="app">
          <div class="hdr"><div class="hdr-brand"><div class="hdr-icon">A</div><div><div class="hdr-name">KAMISUITE</div><div class="hdr-sub">Recepción PRO · AKIRA</div></div></div><div class="hdr-right"><span class="hdr-date" id="navDay">${fmtDay(this._fecha)}</span><span class="tl-dot" id="overlapDot" style="background:#22c55e;"></span><button class="btn-gear" id="btnGear">⚙</button></div></div>
          <div class="nav"><button class="btn-nav" id="btnPrev">‹</button><button class="btn-today" id="btnToday">HOY</button><input type="date" class="date-pick" id="datePicker" value="${this._fecha}" /><button class="btn-nav" id="btnNext">›</button></div>
          <div class="settings" id="settingsPanel"></div>
          <div class="cal-zone" id="calZone">
            <div id="calContent" style="flex:1;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,.3);font-size:12px;">Cargando...</div>
            <div class="detail" id="detailPanel"></div>
          </div>
          <div class="divider" id="divHandle"><div class="div-handle"></div></div>
          <div class="akira">
            <div class="chips" id="chipsRow"></div>
            <div class="chat" id="chatArea"></div>
            <div class="input-row">
              <button class="mic" id="btnMic">🎤</button>
              <button class="stop-btn" id="btnStop" title="Detener voz"><svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="1.5"/></svg></button>
              <input class="txt-in" id="txtInput" placeholder="Habla o escribe a AKIRA..." />
              <button class="send" id="btnSend">➤</button>
            </div>
          </div>
        </div>
        <div class="toast" id="toast"></div>`;
      this._renderChips(); this._renderChat();
    }

    _bindEvents() {
      const R = this.shadowRoot;
      R.getElementById('btnPrev').addEventListener('click', () => this._setDate(addDays(this._fecha, -1)));
      R.getElementById('btnNext').addEventListener('click', () => this._setDate(addDays(this._fecha, 1)));
      R.getElementById('btnToday').addEventListener('click', () => this._setDate(todayISO()));
      R.getElementById('datePicker').addEventListener('change', (e) => { if (e.target.value) this._setDate(e.target.value); });
      R.getElementById('btnGear').addEventListener('click', () => { this._showSettings = !this._showSettings; this._colorPickerFor = null; this._renderSettings(); });
      R.getElementById('settingsPanel').addEventListener('click', (e) => this._handleSettingsClick(e));
      R.getElementById('btnSend').addEventListener('click', () => { const inp = R.getElementById('txtInput'); this._sendAkiraQuery(inp.value); inp.value = ''; });
      R.getElementById('txtInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') { this._sendAkiraQuery(e.target.value); e.target.value = ''; } });
      R.getElementById('btnMic').addEventListener('click', () => this._toggleMic());
      R.getElementById('btnStop').addEventListener('click', () => this._handleStop());
      let touchStartX = 0; const calZone = R.getElementById('calZone');
      calZone.addEventListener('touchstart', (e) => { touchStartX = e.touches[0].clientX; }, { passive: true });
      calZone.addEventListener('touchend', (e) => { const dx = e.changedTouches[0].clientX - touchStartX; if (Math.abs(dx) > 60) { this._setDate(addDays(this._fecha, dx > 0 ? -1 : 1)); } }, { passive: true });
      this._bindDividerSnap(R);
    }

    // ═══════════════════════════════════════════
    // DIVIDER SNAP
    // ═══════════════════════════════════════════
    _bindDividerSnap(R) {
      const divider = R.getElementById('divHandle'); const calZone = R.getElementById('calZone');
      let startY = 0, startH = 0, isDragging = false, didDrag = false, startTime = 0;
      const onStart = (cY) => { isDragging = true; didDrag = false; startY = cY; startH = calZone.getBoundingClientRect().height; startTime = Date.now(); calZone.classList.add('no-snap-anim'); divider.classList.add('dragging'); };
      const onMove = (cY) => { if (!isDragging) return; if (Math.abs(cY - startY) > 5) didDrag = true; const avail = this._getSnapAvailableHeight(); calZone.style.flexBasis = Math.max(avail * 0.10, Math.min(startH + (cY - startY), avail * 0.85)) + 'px'; };
      const onEnd = (cY) => { if (!isDragging) return; isDragging = false; calZone.classList.remove('no-snap-anim'); divider.classList.remove('dragging'); if (!didDrag) { calZone.style.flexBasis = ''; const order = ['peek','half','full']; this._setSnap(order[(order.indexOf(this._snapMode) + 1) % order.length]); return; } const avail = this._getSnapAvailableHeight(); const ratio = calZone.getBoundingClientRect().height / avail; const v = (cY - startY) / Math.max(Date.now() - startTime, 1); let closest = 'half', minD = Infinity; for (const mode of SNAP_ORDER) { let t = SNAP[mode]; if (Math.abs(v) > 0.3) t += (v > 0 ? 0.08 : -0.08); const d = Math.abs(ratio - t); if (d < minD) { minD = d; closest = mode; } } calZone.style.flexBasis = ''; this._setSnap(closest); };
      divider.addEventListener('touchstart', (e) => { onStart(e.touches[0].clientY); e.preventDefault(); }, { passive: false });
      divider.addEventListener('touchmove', (e) => { onMove(e.touches[0].clientY); e.preventDefault(); }, { passive: false });
      divider.addEventListener('touchend', (e) => { onEnd(e.changedTouches[0].clientY); }, { passive: true });
      divider.addEventListener('mousedown', (e) => { onStart(e.clientY); e.preventDefault(); const mm = (ev) => onMove(ev.clientY); const mu = (ev) => { onEnd(ev.clientY); document.removeEventListener('mousemove', mm); document.removeEventListener('mouseup', mu); }; document.addEventListener('mousemove', mm); document.addEventListener('mouseup', mu); });
    }
    _getSnapAvailableHeight() { const R = this.shadowRoot; const app = R.querySelector('.app'); if (!app) return 400; const appH = app.getBoundingClientRect().height; const hdrH = R.querySelector('.hdr')?.getBoundingClientRect().height || 0; const navH = R.querySelector('.nav')?.getBoundingClientRect().height || 0; const divH = R.getElementById('divHandle')?.getBoundingClientRect().height || 0; const s = R.getElementById('settingsPanel'); const sH = (s && s.classList.contains('open')) ? s.getBoundingClientRect().height : 0; return appH - hdrH - navH - divH - sH; }
    _setSnap(mode) { this._snapMode = mode; const cz = this.shadowRoot.getElementById('calZone'); if (cz) cz.style.flexBasis = Math.round(this._getSnapAvailableHeight() * SNAP[mode]) + 'px'; }

    // ═══════════════════════════════════════════
    // SETTINGS
    // ═══════════════════════════════════════════
    _renderSettings() { const panel = this.shadowRoot.getElementById('settingsPanel'); if (!this._showSettings) { panel.classList.remove('open'); return; } panel.classList.add('open'); const cfg = this._settings.staffConfig; const sorted = [...this._staff].sort((a, b) => (cfg[a.id]?.position || 99) - (cfg[b.id]?.position || 99)); let h = '<div class="set-title">Empleados visibles (orden de columnas)</div>'; for (let i = 0; i < sorted.length; i++) { const s = sorted[i]; const c = cfg[s.id] || {}; const vis = c.visible !== false; h += `<div class="set-row" data-sid="${s.id}"><button class="set-toggle ${vis ? 'on' : ''}" data-action="toggle" data-sid="${s.id}">${vis ? '✓' : '—'}</button><span class="set-name" style="opacity:${vis ? 1 : .35}">${esc(s.name)}</span><div class="set-arrows"><button class="set-arr" data-action="moveup" data-sid="${s.id}" ${i === 0 ? 'style="opacity:.15;pointer-events:none"' : ''}>▲</button><button class="set-arr" data-action="movedown" data-sid="${s.id}" ${i === sorted.length - 1 ? 'style="opacity:.15;pointer-events:none"' : ''}>▼</button></div><button class="set-color" style="background:${c.color || '#6b7280'}" data-action="color" data-sid="${s.id}"></button><div class="color-pop ${this._colorPickerFor === s.id ? 'open' : ''}" id="cp_${s.id}">${PALETTE.map(cl => `<button class="color-sw ${c.color === cl ? 'sel' : ''}" data-action="setcolor" data-sid="${s.id}" data-color="${cl}" style="background:${cl}"></button>`).join('')}</div></div>`; } panel.innerHTML = h; }
    _handleSettingsClick(e) { const act = e.target.closest('[data-action]'); if (!act) return; const sid = act.dataset.sid; if (act.dataset.action === 'toggle') { const c = this._settings.staffConfig[sid]; c.visible = c.visible === false ? true : false; this._saveSettings(); this._renderSettings(); this._renderCalendar(); } if (act.dataset.action === 'color') { this._colorPickerFor = this._colorPickerFor === sid ? null : sid; this._renderSettings(); } if (act.dataset.action === 'setcolor') { this._settings.staffConfig[sid].color = act.dataset.color; this._colorPickerFor = null; this._voiceEnabled = true; this._selectedVoice = null; this._spanishVoices = []; this._speakQueue = []; this._isSpeaking = false; this._saveSettings(); this._renderSettings(); this._renderCalendar(); } if (act.dataset.action === 'moveup' || act.dataset.action === 'movedown') { const cfg = this._settings.staffConfig; const sorted = [...this._staff].sort((a, b) => (cfg[a.id]?.position || 99) - (cfg[b.id]?.position || 99)); const idx = sorted.findIndex(s => s.id === sid); if (idx < 0) return; const swapIdx = act.dataset.action === 'moveup' ? idx - 1 : idx + 1; if (swapIdx < 0 || swapIdx >= sorted.length) return; const posA = cfg[sorted[idx].id]?.position || idx + 1; const posB = cfg[sorted[swapIdx].id]?.position || swapIdx + 1; cfg[sorted[idx].id].position = posB; cfg[sorted[swapIdx].id].position = posA; this._saveSettings(); this._renderSettings(); this._renderCalendar(); } }
    _saveSettings() { clearTimeout(this._saveTimer); this._saveTimer = setTimeout(() => this._sendToPage('save-settings', { settings: this._settings }), 800); }

    // ═══════════════════════════════════════════
    // CALENDAR
    // ═══════════════════════════════════════════
    _renderCalendar() {
      const R = this.shadowRoot, zone = R.getElementById('calZone'); const visible = this._getVisibleStaff();
      const detailPanel = R.getElementById('detailPanel');
      if (!visible.length) { zone.innerHTML = '<div class="no-staff">Selecciona empleados en ⚙</div>'; zone.appendChild(detailPanel); return; }
      const pxPerMin = 48 / 60; const totalMin = (CAL_END - CAL_START) * 60; const hours = Array.from({ length: CAL_END - CAL_START }, (_, i) => i + CAL_START);
      let html = '<div class="staff-hdr">'; for (const s of visible) html += `<div class="staff-cell"><div class="s-dot" style="background:${this._staffColor(s.id)}"></div><span class="s-name">${esc(s.name)}</span></div>`; html += '</div><div class="cal-scroll"><div class="cal-grid" style="position:relative;min-height:' + (totalMin * pxPerMin) + 'px;">';
      for (const h of hours) html += `<div class="h-row"><div class="h-label">${h}:00</div>${visible.map(() => '<div class="h-cell"></div>').join('')}</div>`;
      const renderedBids = new Set(); const cols = visible.length;
      for (const pack of this._packs) { const allBids = [...(pack.bookingIds || []), ...(pack.bookingIdsPendientes || [])]; let ci = -1; for (const svc of (pack.servicios || [])) { ci = visible.findIndex(s => s.id === svc.staffId); if (ci >= 0) break; } if (ci < 0) continue; const smP = parseMin(pack.horaInicio), emP = parseMin(pack.horaFin); if (smP === null) continue; const effectiveEnd = emP || (smP + 30); const top = (smP - CAL_START * 60) * pxPerMin; const height = Math.max((effectiveEnd - smP) * pxPerMin - 2, 16); const left = `calc(38px + ${ci} * ((100% - 38px) / ${cols}) + 2px)`; const width = `calc((100% - 38px) / ${cols} - 4px)`; const color = this._staffColor(visible[ci].id); const paid = Number(pack.serviciosPendientes || 0) === 0; const brdCol = paid ? '#2a9d54' : '#d48a1a'; const mainSvc = (pack.servicios || []).find(s => Number(s.precio || 0) > 0) || (pack.servicios || [])[0]; const svcName = mainSvc?.serviceName || 'Servicio'; const clientName = pack.contactName || ''; const firstBid = (pack.servicios || [])[0]?.bookingId || allBids[0] || ''; const dataJson = escAttr(JSON.stringify({ bookingId: firstBid, startTime: pack.horaInicio, endTime: pack.horaFin, durMin: effectiveEnd - smP, servicio: svcName, cliente: clientName, clientPhone: pack.contactPhone || '', clientEmail: pack.email || '', resourceId: visible[ci].id, precio: pack.totalPack || 0 })); html += `<div class="bk" style="top:${top}px;left:${left};width:${width};height:${height}px;background:${color};border-left:4px solid ${brdCol}" data-booking="${dataJson}">`; html += `<div class="bk-name">${esc(svcName)}</div>`; if (height > 26) html += `<div class="bk-svc">${esc(clientName)}</div>`; if (height > 38) html += `<div class="bk-time">${pack.horaInicio} – ${pack.horaFin || ''}</div>`; html += '</div>'; for (const bid of allBids) renderedBids.add(bid); }
      for (const r of this._reservas) { if (r.tipo === 'extension') continue; if (r.tipo !== 'booking' && r.tipo !== 'externo' && r.tipo !== 'bloqueo') continue; if (renderedBids.has(r.bookingId)) continue; const ci = visible.findIndex(s => s.id === r.resourceId); if (ci < 0) continue; const sm = parseMin(r.startTime); if (sm === null) continue; const em = parseMin(r.endTime || '') || (sm + (r.durMin || 15)); const top = (sm - CAL_START * 60) * pxPerMin; const height = Math.max((em - sm) * pxPerMin - 2, 16); const left = `calc(38px + ${ci} * ((100% - 38px) / ${cols}) + 2px)`; const width = `calc((100% - 38px) / ${cols} - 4px)`; const color = this._staffColor(r.resourceId); const isBlock = r.tipo === 'bloqueo'; const brdCol = isBlock ? '#d48a1a' : '#2a9d54'; const extraClass = isBlock ? ' bk-block' : ''; const dataJson = escAttr(JSON.stringify({ bookingId: r.bookingId, startTime: r.startTime, endTime: r.endTime, durMin: r.durMin, servicio: r.servicio, cliente: r.cliente, clientPhone: r.clientPhone, clientEmail: r.clientEmail, resourceId: r.resourceId, precio: r.precio || 0 })); html += `<div class="bk${extraClass}" style="top:${top}px;left:${left};width:${width};height:${height}px;background:${color};border-left:4px solid ${brdCol}" data-booking="${dataJson}">`; html += `<div class="bk-name">${esc(r.servicio || 'Servicio')}</div>`; if (height > 26) html += `<div class="bk-svc">${esc(r.cliente || '')}</div>`; if (height > 38) html += `<div class="bk-time">${r.startTime} – ${r.endTime || ''}</div>`; html += '</div>'; }
      if (this._fecha === todayISO()) { const nm = madridNow() - CAL_START * 60; if (nm >= 0 && nm < totalMin) html += `<div class="now-line" style="top:${nm * pxPerMin}px;left:38px;"></div>`; }
      html += '</div></div>'; zone.innerHTML = html;
      zone.appendChild(detailPanel);
      zone.querySelectorAll('.bk').forEach(el => el.addEventListener('click', () => this._onBookingClick(el)));
      const scroll = zone.querySelector('.cal-scroll'); if (scroll) { if (this._fecha === todayISO()) { const nm = madridNow() - CAL_START * 60; scroll.scrollTop = Math.max(0, nm * pxPerMin - 80); } else if (this._reservas.length) { const f = parseMin(this._reservas[0].startTime); if (f !== null) scroll.scrollTop = Math.max(0, (f - CAL_START * 60) * pxPerMin - 30); } }
      this._updateOverlapDot();
    }
    _updateOverlapDot() { const vis = new Set(this._getVisibleStaff().map(s => s.id)); const byStaff = {}; for (const r of this._reservas) { if (r.tipo !== 'booking' || !vis.has(r.resourceId)) continue; const sm = parseMin(r.startTime), em = parseMin(r.endTime || ''); if (sm === null || em === null) continue; if (!byStaff[r.resourceId]) byStaff[r.resourceId] = []; byStaff[r.resourceId].push({ sm, em }); } let maxOl = 0; for (const sid in byStaff) { const bks = byStaff[sid].sort((a, b) => a.sm - b.sm); for (let i = 0; i < bks.length; i++) for (let j = i + 1; j < bks.length; j++) { if (bks[j].sm < bks[i].em) { maxOl = Math.max(maxOl, Math.min(bks[i].em, bks[j].em) - bks[j].sm); } else break; } } const dot = this.shadowRoot.getElementById('overlapDot'); if (dot) dot.style.background = maxOl === 0 ? '#22c55e' : maxOl <= 10 ? '#f59e0b' : '#ef4444'; }

    _onBookingClick(el) { this._selectedBooking = JSON.parse(el.dataset.booking); this._renderDetail(); }
    _renderDetail() {
      const panel = this.shadowRoot.getElementById('detailPanel'); const b = this._selectedBooking; if (!b) { panel.classList.remove('open'); return; } panel.classList.add('open');
      const staffCol = this._staffColor(b.resourceId); const staffNm = this._staffName(b.resourceId); const pack = this._findPack(b.bookingId); const isPaid = pack ? Number(pack.serviciosPendientes || 0) === 0 : true; const totalPack = pack ? Number(pack.totalPack || 0) : Number(b.precio || 0); const pendIds = pack ? (pack.bookingIdsPendientes || []) : [];
      const warns = []; const email = String(b.clientEmail || pack?.email || '').trim().toLowerCase(); const phone = String(b.clientPhone || pack?.contactPhone || '').trim(); if (!email || GENERIC_EMAILS.has(email)) warns.push('Email genérico'); if (!phone) warns.push('Sin teléfono');
      const svcs = pack ? (pack.servicios || []) : []; let svcsHTML = '';
      if (svcs.length > 0) { for (const s of svcs) { const p = Number(s.precioFinal ?? s.precio ?? 0); svcsHTML += `<div class="d-row"><span class="d-icon">✂️</span><span class="d-val">${esc(s.serviceName || 'Servicio')}</span><span class="d-price">${p}€</span></div>`; } } else { svcsHTML = `<div class="d-row"><span class="d-icon">✂️</span><span class="d-val">${esc(b.servicio)}</span><span class="d-price">${b.precio || 0}€</span></div>`; }
      panel.innerHTML = `<div class="det-top"><div style="display:flex;align-items:center;gap:6px;flex:1;"><div class="s-dot" style="background:${staffCol};width:8px;height:8px;"></div><span class="det-staff">${esc(staffNm)}</span><span class="pill" style="background:${isPaid ? '#2a9d54' : '#d48a1a'}">${isPaid ? 'PAGADO' : 'PENDIENTE'}</span></div><button class="det-x" id="btnCloseDetail">✕</button></div>${warns.length ? `<div class="warn-row"><span class="warn-dot"></span><span class="warn-txt">${warns.join(' · ')}</span></div>` : ''}<div class="det-name">${esc(pack?.contactName || b.cliente || 'Sin nombre')}</div>${svcsHTML}<div class="d-row"><span class="d-icon">🕐</span><span class="d-val">${b.startTime} – ${b.endTime || ''}</span><span style="color:rgba(255,255,255,.5);font-size:10px;">${b.durMin || ''}min</span></div>${phone ? `<div class="d-row"><span class="d-icon">📞</span><span class="d-val">${esc(phone)}</span></div>` : ''}${email && !GENERIC_EMAILS.has(email) ? `<div class="d-row"><span class="d-icon">✉️</span><span class="d-val" style="font-size:10px;">${esc(email)}</span></div>` : ''}${totalPack > 0 ? `<div class="d-row" style="margin-top:4px;padding-top:4px;border-top:1px solid ${ABRD};"><span class="d-icon">💰</span><span class="d-val" style="font-weight:700;">TOTAL</span><span class="d-price" style="font-size:15px;">${totalPack}€</span></div>` : ''}${!isPaid && pendIds.length ? `<div class="pay-row"><button class="pay-btn" style="background:#8F1C5B" data-method="Efectivo">EFECTIVO</button><button class="pay-btn" style="background:#4D8F8C" data-method="Tarjeta">TARJETA</button><button class="pay-btn" style="background:#D18C49" data-method="Bizum">BIZUM</button></div>` : ''}${isPaid ? '<div class="pay-msg" style="color:#2a9d54;">✅ Pagado</div>' : ''}`;
      panel.querySelector('#btnCloseDetail').addEventListener('click', () => { this._selectedBooking = null; this._renderDetail(); });
      panel.querySelectorAll('[data-method]').forEach(btn => { btn.addEventListener('click', () => { const method = btn.dataset.method; panel.querySelectorAll('.pay-btn').forEach(b => { b.disabled = true; b.textContent = '...'; }); this._sendToPage('pay', { bookingIds: pendIds, metodoPago: method }); }); });
    }

    _renderChips() { const row = this.shadowRoot.getElementById('chipsRow'); row.innerHTML = CHIPS.map(c => `<button class="chip ${this._activeChip === c.id ? 'act' : ''}" style="--cc:${c.color}" data-chip="${c.id}"><span class="chip-icon">${c.icon}</span><span class="chip-label">${c.label}</span></button>`).join(''); row.querySelectorAll('[data-chip]').forEach(btn => { btn.addEventListener('click', () => { if (this._activeChip === btn.dataset.chip) { this._activeChip = null; this._renderChips(); return; } this._activeChip = btn.dataset.chip; this._renderChips(); this._addMessage('akira', CHIP_PROMPTS[this._activeChip]); this.shadowRoot.getElementById('txtInput').focus(); }); }); }
    _renderChat() { const area = this.shadowRoot.getElementById('chatArea'); area.innerHTML = this._messages.map((m) => { if (m.role === 'user') return `<div class="bub bub-u">${esc(m.text)}</div>`; if (m.role === 'confirm') return `<div class="bub bub-confirm"><div class="a-label">AKIRA</div>${esc(m.text)}<div class="confirm-btns"><button class="btn-cf btn-cf-yes" data-cf="yes">✓ Confirmar</button><button class="btn-cf btn-cf-no" data-cf="no">Cancelar</button></div></div>`; if (m.isConfirm) return `<div class="bub bub-ok">${esc(m.text)}</div>`; return `<div class="bub bub-a"><div class="a-label">AKIRA</div>${esc(m.text)}</div>`; }).join(''); area.querySelectorAll('[data-cf]').forEach(btn => { btn.addEventListener('click', () => { if (btn.dataset.cf === 'yes') this._sendToPage('akira-execute', { messageId: this._pendingConfirmId }); else this._sendToPage('akira-cancel', { messageId: this._pendingConfirmId }); this._pendingConfirmId = null; btn.closest('.confirm-btns')?.querySelectorAll('button').forEach(b => { b.disabled = true; b.style.opacity = '.4'; }); }); }); setTimeout(() => { area.scrollTop = area.scrollHeight; }, 50); }
  }

  customElements.define('kamisuite-mobile', KamisuiteMobile);
  console.log(`${TAG} Registrado.`);
})();