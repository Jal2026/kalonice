/* ═══════════════════════════════════════════════════════════════════════════
 * KAMISUITE — Agenda Unificada (Wix Custom Element)
 * Archivo:  kamisuiteAgenda.js
 * Ubicación en Wix: public/custom-elements/
 * Tag name: kamisuite-agenda
 * VERSION:  2.2.9
 * FECHA:    3 Junio 2026
 *
 * v2.2.9: FIX — Servicios con variantes (variants:true) NO disparan el fallback
 *         getServiceInfo cuando el catálogo no tiene su precio/duración base
 *         (caso típico: servicio marcado uso='wixnativo' en ServiceCatalog).
 *         El fallback leía de Wix Bookings y sobrescribía hasVariants a false,
 *         haciendo desaparecer el selector de variantes. Las variantes proveen
 *         su propio precio/duración, no necesitan base.
 *
 * v2.2.8: FIX — Precio y duración de servicios SIMPLES y SERVICIOS_ADICIONALES
 *         se leen de ServiceCatalog (CMS) en vez del array hardcoded.
 *         Cero hardcoding de dur/price en SVC_BUTTONS ni SERVICIOS_ADICIONALES.
 *         Nuevo evento del page code: 'catalogo-precios-data' al init.
 *         Fallback existente getServiceInfo intacto para servicios sin variantes.
 *         Cambio aditivo: estructura de arrays y rendering visual idénticos.
 *
 * v2.2.7: NEW — Cierre del día extendido. 3 secciones nuevas insertadas
 *         ANTES del slot de arqueo (que sigue siendo el último bloque):
 *         · 📋 Desglose fiscal (IVA % base+cuota, excluye propinas)
 *         · 👥 Clientes del día (cobrados, ordenados por hora ASC)
 *         · 🛒 Ventas Tienda POS (productos standalone sin reserva)
 *         Backend nuevo: cierreLogicExtendido.web.js. NO toca testCheckout.
 * v2.2.6: NEW — Resumen del arqueo al final del informe de cierre (solo
 *         lectura). El popup de arqueo (botón 🏦) se mantiene intacto.
 * v2.2.5: FIX — Arqueo de caja integrado dentro del panel de Cierre del
 *         día (antes era popup separado). Eliminado botón 🏦 del topbar.
 * v2.2.4: NEW — Bloqueo siempre disponible (drag independiente del estado
 *         cliente/servicio). Papelera para borrar reservas pagadas.
 *         Arqueo de caja Nivel 2 (movimientos manuales, conteo, cierre).
 *
 * Calendario + Checkout + Sidebar reservas + Drag&drop + Cierre + Settings
 *
 * v2.2.3: FIX cierre del día — productos del pack (tipo:'producto') ya NO
 *         aparecen en "Servicios del día" del cierre. Eliminada duplicación
 *         (servicio renombrado como producto y producto como servicio).
 *         REGLA ANTISÉPTICA: botón PRODUCTO solo activo si la fecha
 *         visualizada es HOY. Bloqueado en widget y en handler de respaldo.
 *         Tooltip explicativo: "Solo se permite venta en el día de la cita".
 * v2.2.1: FIX venta de productos — quitado el auto-open de la factura PDF
 *         (no se pidió, era intrusivo). Delay de reload subido a 4 s para
 *         dar tiempo a Wix a indexar el nuevo pedido en orders.searchOrders.
 * v2.2.0: NEW — Venta de productos desde la cita activa (botón 🛍 PRODUCTO).
 *         Panel minimalista con buscador, carrito multi-producto, selector
 *         de método de pago. contactId garantizado desde la reserva → la
 *         venta entra al expediente del cliente automáticamente.
 *         Mutuamente excluyente con SERVICIO ADICIONAL / COMPLEMENTO / EXTRA.
 *         Catálogo cacheado tras la primera apertura.
 * v2.1.0: NEW — Borde izquierdo verde (pagado) / naranja (pendiente) en cada cita del calendario.
 * v2.0.9: FIX — Cierre completo: servicios del día (precio×cant), productos con cantidades, externos con subtotales, cierre financiero (registro de caja), descuentos.
 * v2.0.8: FIX — Bolita cliente es indicador del DÍA (escanea todos los clientes de la agenda).
 * v2.0.7: FIX — Todos los dots parpadean. Bolita cliente refleja card abierto y revierte al cerrar.
 * v2.0.6: NEW — Semáforo cliente (rojo/naranja/verde) + semáforo solapamientos en navbar. Fix margen warn-banner.
 * v2.0.5: NEW — Warning ficha incompleta (bolita roja parpadeante) en sidebar y checkout modal.
 * v2.0.4: NEW — Editar cliente CRM desde sidebar (nombre, apellido, email, telefono).
 * v2.0.3: FIX — _toggleComplementoPanel envía mainServiceId al page code.
 *         FIX — reservas-data descarta respuestas de fecha anterior (race condition).
 *
 * Comunicación (patrón AKIRA):
 *   Element → Page: dispatchEvent(new CustomEvent('agenda-message', {detail}))
 *   Page → Element: setAttribute('response', JSON.stringify({type, ...data, ts}))
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (customElements.get('kamisuite-agenda')) { console.log('[KamisuiteAgenda v2.2.3] Ya registrado.'); return; }
  const VERSION = '2.2.9';
  const TAG = `[Agenda v${VERSION}]`;
  const CAL_START = 9, CAL_END = 21, DRAG_THRESHOLD = 6;
  const PALETTE = ['#7c3aed','#ea580c','#d97706','#2563eb','#15803d','#be185d','#dc2626','#0d9488','#1d4ed8','#9333ea','#059669','#475569'];
  const DEFAULT_COLORS = { 'A_Ricardo':'#7c3aed','B_Raquel':'#ea580c','C_Angela':'#d97706','Cualquiera':'#2563eb','EMY':'#15803d' };
  const STAFF_IDS = [
    { id:'b888c390-361d-4b0d-80f7-e0ba808bd7ce', name:'A_Ricardo' },
    { id:'0e69d7a3-4e36-40ec-9f3d-348f5bf3524d', name:'B_Raquel' },
    { id:'0c22fa77-3602-4876-b744-ded83ed540f8', name:'C_Angela' }
  ];
  const SERVICIOS_ADICIONALES = [
    { group:'Peinados', id:'6630467c-d405-4280-bf76-061a6718163c', name:'Peinado pelo corto' },
    { group:'Peinados', id:'02b8a9e3-9a62-413f-9688-08f50994e7b0', name:'Peinado pelo medio' },
    { group:'Peinados', id:'05b840f2-a41e-4f73-9da8-d61e37b6504e', name:'Peinado pelo largo' },
    { group:'Peinados', id:'0ccd37da-a5df-477e-88c1-43ab88c7d83c', name:'Secado sin cepillo' },
    { group:'Cortes', id:'b1caca60-ab09-4e55-a1ae-62eeb8583677', name:'Corte Mujer (lavado y secado)' },
    { group:'Cortes', id:'cbb00b12-3226-447a-9fe5-450af4a128c6', name:'Corte de pelo niña' },
    { group:'Caballero', id:'94febacf-af47-4393-b483-64063d886b51', name:'Corte de caballero' },
    { group:'Caballero', id:'722f8db1-faa6-40ba-9e8d-fb6e6d9eeea5', name:'Arreglo de Corte' },
    { group:'Tratamientos', id:'8a7d78c4-5e93-4ebb-b168-67580d082110', name:'Fusio Dose' },
    { group:'Tratamientos', id:'68e102e2-edc7-4d2e-926f-ffc79dd159b9', name:'Tratamiento EPRES' },
    { group:'Spa', id:'a38d6b5f-056d-41fb-b606-b6c2e33fc197', name:'Spa Capilar Premium' }
  ];
  const SVC_BUTTONS = [
    { family:'coloracion', label:'Mechas', id:'6bcaf646-6363-4734-a73a-70dbcf7398cb', group:'coloracion' },
    { family:'coloracion', label:'Tinte', id:'4d513fb4-b9a6-427e-a034-9bc4132cbb11', group:'coloracion' },
    { family:'coloracion', label:'T. Vegetal', id:'d04d7118-ea0a-4609-9332-36fb9e3f2eb7', group:'coloracion' },
    { family:'coloracion', label:'T. Hombre', id:'8dafa179-eaae-4d10-806b-0c7798031f03', group:'coloracion' },
    { family:'simple', label:'Corte Mujer', id:'43eb401d-c873-400d-8e72-a559fadc3310', variants:true, group:'cortesmujer' },
    { family:'simple', label:'Corte Nina', id:'cbb00b12-3226-447a-9fe5-450af4a128c6', group:'cortesmujer' },
    { family:'simple', label:'Pelo corto', id:'6630467c-d405-4280-bf76-061a6718163c', group:'peinados' },
    { family:'simple', label:'Pelo medio', id:'02b8a9e3-9a62-413f-9688-08f50994e7b0', group:'peinados' },
    { family:'simple', label:'Pelo largo', id:'05b840f2-a41e-4f73-9da8-d61e37b6504e', group:'peinados' },
    { family:'simple', label:'Secado', id:'0ccd37da-a5df-477e-88c1-43ab88c7d83c', group:'peinados' },
    { family:'simple', label:'Recogido Fiesta', id:'d59adcff-dfa4-4bf3-b524-a8e672ab3e66', group:'peinados' },
    { family:'simple', label:'Recogido Novia', id:'cf96598a-96e0-4108-8c3e-52a1c913108d', group:'peinados' },
    { family:'tratamiento', label:'Botox', id:'1d6059f6-e92e-4d5a-920d-d550339c518f', group:'tratamientos' },
    { family:'tratamiento', label:'Nanoplastia', id:'7a0df23f-f57c-4b6a-b850-a9c2d832f83f', group:'tratamientos' },
    { family:'tratamiento', label:'Kerastase', id:'f4203bdd-6b87-427a-87f1-57f8044c85f4', group:'tratamientos' },
    { family:'simple', label:'Fusio Dose', id:'8a7d78c4-5e93-4ebb-b168-67580d082110', group:'tratamientos' },
    { family:'simple', label:'EPRES', id:'68e102e2-edc7-4d2e-926f-ffc79dd159b9', group:'tratamientos' },
    { family:'simple', label:'Tratamiento K18', id:'203072e2-1847-45d6-b66b-19e296371d10', group:'tratamientos' },
    { family:'simple', label:'Corte Caballero', id:'94febacf-af47-4393-b483-64063d886b51', group:'caballero' },
    { family:'simple', label:'Arreglo Corte', id:'722f8db1-faa6-40ba-9e8d-fb6e6d9eeea5', group:'caballero' },
    { family:'simple', label:'Barba completa', id:'1fc68ab8-dc57-45a8-8578-47c4353a9e00', group:'caballero' },
    { family:'simple', label:'Arreglo Barba', id:'09c8cfbd-123e-4da2-8c52-fe150f704f15', group:'caballero' },
    { family:'simple', label:'Afeitado', id:'ab99dd3e-79fa-4599-b822-9d3f9984dc2a', group:'caballero' },
    { family:'simple', label:'Corte Nino', id:'ee76544a-b513-49ac-a5fe-79822d2375eb', group:'caballero' },
    { family:'simple', label:'Spa Premium', id:'a38d6b5f-056d-41fb-b606-b6c2e33fc197', group:'spa' }
  ];
  // Helpers
  function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
  function escAttr(s){return String(s||'').replace(/'/g,'&#39;').replace(/"/g,'&quot;');}
  function eur(n){return (Math.round(Number(n||0)*100)/100).toString().replace('.',',')+'\u20ac';}
  function todayISO(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
  function addDays(iso,delta){const d=new Date(iso+'T12:00:00');d.setDate(d.getDate()+delta);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
  function parseMin(t){if(!t)return null;const p=t.split(':');return parseInt(p[0])*60+parseInt(p[1]);}
  function hexDarken(h,p){h=h.replace('#','');let r=parseInt(h.substr(0,2),16),g=parseInt(h.substr(2,2),16),b=parseInt(h.substr(4,2),16);r=Math.max(0,Math.round(r*(1-p/100)));g=Math.max(0,Math.round(g*(1-p/100)));b=Math.max(0,Math.round(b*(1-p/100)));return'#'+r.toString(16).padStart(2,'0')+g.toString(16).padStart(2,'0')+b.toString(16).padStart(2,'0');}
  function hexLighten(h,p){h=h.replace('#','');let r=parseInt(h.substr(0,2),16),g=parseInt(h.substr(2,2),16),b=parseInt(h.substr(4,2),16);r=Math.min(255,Math.round(r+(255-r)*p/100));g=Math.min(255,Math.round(g+(255-g)*p/100));b=Math.min(255,Math.round(b+(255-b)*p/100));return'#'+r.toString(16).padStart(2,'0')+g.toString(16).padStart(2,'0')+b.toString(16).padStart(2,'0');}
  function madridNow(){const n=new Date(),y=n.getUTCFullYear(),mL=new Date(Date.UTC(y,2,31)),mS=31-mL.getUTCDay(),cS=Date.UTC(y,2,mS,1),oL=new Date(Date.UTC(y,9,31)),oS=31-oL.getUTCDay(),cE=Date.UTC(y,9,oS,1),off=(n.getTime()>=cS&&n.getTime()<cE)?2:1;return(n.getUTCHours()+off)*60+n.getUTCMinutes();}
  function getInitials(n,a){return((n||'')[0]||'')+((a||'')[0]||'').toUpperCase()||'?';}
  // v2.0.5: Detectar ficha de cliente incompleta
  const GENERIC_EMAILS = new Set(['booking@hair-times.com','info@hairtimes.com','info@hair-times.com','']);
  function checkClienteIncompleto(opts) {
    const warnings = [];
    const email = String(opts.email || '').trim().toLowerCase();
    const apellido = String(opts.apellido || '').trim();
    const telefono = String(opts.telefono || '').trim();
    if (!email || GENERIC_EMAILS.has(email)) warnings.push('Email genérico o vacío');
    if (!apellido) warnings.push('Sin apellido');
    if (!telefono) warnings.push('Sin teléfono');
    return warnings;
  }
  function warnHTML(warnings) {
    if (!warnings.length) return '';
    return `<div class="warn-banner"><span class="warn-dot"></span><span class="warn-text">${warnings.join(' · ')}</span></div>`;
  }
  // v2.0.6: Semáforo cliente (green/orange/red)
  function getClienteDotColor(cl) {
    if (!cl) return '';
    const email = String(cl.email || '').trim().toLowerCase();
    const tel = String(cl.telefono || '').trim();
    const emailBad = !email || GENERIC_EMAILS.has(email);
    const telBad = !tel;
    if (emailBad && telBad) return 'tl-red';
    if (emailBad || telBad) return 'tl-orange';
    return 'tl-green';
  }
  // v2.0.8: Semáforo cliente del DÍA — escanea TODOS los clientes de la agenda
  function getDayClientStatus(reservas) {
    const seen = new Set();
    let worst = 0; // 0=green 1=orange 2=red
    for (const r of reservas) {
      if (r.tipo !== 'booking') continue;
      const key = (r.cliente || '') + '|' + (r.clientEmail || '');
      if (seen.has(key)) continue;
      seen.add(key);
      const email = String(r.clientEmail || '').trim().toLowerCase();
      const tel = String(r.clientPhone || '').trim();
      const nameParts = String(r.cliente || '').trim().split(/\s+/);
      const apellido = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';
      const emailBad = !email || GENERIC_EMAILS.has(email);
      const telBad = !tel;
      let score = 0;
      if (emailBad && telBad) score = 2;
      else if (emailBad || telBad) score = 1;
      if (score > worst) worst = score;
      if (worst === 2) break; // ya es el peor posible
    }
    return worst === 2 ? 'tl-red' : worst === 1 ? 'tl-orange' : 'tl-green';
  }
  // v2.0.6: Semáforo solapamientos (green/orange/red)
  function getOverlapStatus(reservas) {
    const byStaff = {};
    for (const r of reservas) {
      if (r.tipo !== 'booking') continue;
      const sm = parseMin(r.startTime), em = parseMin(r.endTime || '');
      if (sm === null || em === null) continue;
      if (!byStaff[r.resourceId]) byStaff[r.resourceId] = [];
      byStaff[r.resourceId].push({ sm, em });
    }
    let maxOverlap = 0;
    for (const sid in byStaff) {
      const bks = byStaff[sid].sort((a, b) => a.sm - b.sm);
      for (let i = 0; i < bks.length; i++) {
        for (let j = i + 1; j < bks.length; j++) {
          if (bks[j].sm < bks[i].em) {
            const overlap = Math.min(bks[i].em, bks[j].em) - bks[j].sm;
            if (overlap > maxOverlap) maxOverlap = overlap;
          } else break;
        }
      }
    }
    if (maxOverlap === 0) return 'tl-green';
    if (maxOverlap <= 10) return 'tl-orange';
    return 'tl-red';
  }
  // ═══════════════════════════════════════════════════
  // CSS
  // ═══════════════════════════════════════════════════
  const STYLES = `
    @font-face{font-family:'Bai Jamjuree';font-style:normal;font-weight:400;font-display:swap;src:url(https://fonts.gstatic.com/s/baijamjuree/v12/LDIqapSCOBt_aeQQ7ftydoa0kePuk5A1-yiSgA.woff2) format('woff2');}
    @font-face{font-family:'Bai Jamjuree';font-style:normal;font-weight:500;font-display:swap;src:url(https://fonts.gstatic.com/s/baijamjuree/v12/LDI1apSCOBt_aeQQ7ftydoaMWcjKm7sp8g.woff2) format('woff2');}
    @font-face{font-family:'Bai Jamjuree';font-style:normal;font-weight:600;font-display:swap;src:url(https://fonts.gstatic.com/s/baijamjuree/v12/LDI1apSCOBt_aeQQ7ftydoaMdc_Km7sp8g.woff2) format('woff2');}
    @font-face{font-family:'Bai Jamjuree';font-style:normal;font-weight:700;font-display:swap;src:url(https://fonts.gstatic.com/s/baijamjuree/v12/LDI1apSCOBt_aeQQ7ftydoaMEcjKm7sp8g.woff2) format('woff2');}
    :host{display:block;width:100%;height:100%;font-family:'Bai Jamjuree',sans-serif;}
    *{box-sizing:border-box;margin:0;padding:0;}
    .app{display:flex;flex-direction:column;height:100%;background:#fff;}
    .topbar{display:flex;align-items:center;justify-content:space-between;padding:8px 16px;border-bottom:1px solid #e2e5ea;}
    .topbar-left{display:flex;align-items:center;gap:8px;}
    .topbar-title{font-size:14px;font-weight:700;color:#c9a44a;letter-spacing:1px;text-transform:uppercase;}
    .topbar-version{font-size:10px;color:#9ca3af;background:#f7f8fa;padding:2px 6px;border-radius:4px;}
    .topbar-right{display:flex;gap:6px;}
    .navbar{display:flex;align-items:center;padding:6px 16px;gap:8px;border-bottom:1px solid #e2e5ea;position:relative;}
    .btn{display:flex;align-items:center;justify-content:center;border:1px solid #e2e5ea;border-radius:6px;background:#fff;cursor:pointer;font-family:inherit;transition:.15s;}
    .btn:hover{background:#f7f8fa;}
    .btn-nav{width:30px;height:30px;font-size:16px;color:#6b7280;}
    .btn-today{padding:0 12px;height:30px;border-color:#c9a44a;background:rgba(201,164,74,.1);color:#c9a44a;font-size:12px;font-weight:600;}
    .btn-today:hover{background:#c9a44a;color:#fff;}
    .btn-icon{width:32px;height:32px;color:#6b7280;}
    .btn-icon:hover{color:#c9a44a;}
    .nav-date{font-size:14px;font-weight:600;cursor:pointer;padding:4px 10px;border:1px solid #e2e5ea;border-radius:6px;}
    .nav-date:hover{border-color:#c9a44a;}
    .nav-day{font-size:12px;color:#c9a44a;font-weight:500;}
    .nav-stats{margin-left:auto;font-size:11px;color:#9ca3af;}
    .main-content{display:flex;flex:1;min-height:0;}
    /* Sidebar */
    .sidebar{width:260px;flex-shrink:0;border-right:1px solid #e2e5ea;display:flex;flex-direction:column;overflow:hidden;}
    .sidebar-body{flex:1;overflow-y:auto;padding:10px 12px;}
    .sidebar-body::-webkit-scrollbar{width:4px;}
    .sidebar-body::-webkit-scrollbar-thumb{background:#e2e5ea;border-radius:4px;}
    .sb-title{font-size:10px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:#9ca3af;margin:12px 0 6px;}
    .sb-title:first-child{margin-top:0;}
    .sb-input{width:100%;background:#f7f8fa;border:1px solid #e2e5ea;border-radius:6px;font-family:inherit;font-size:12px;padding:7px 10px;outline:none;color:#1a1d23;}
    .sb-input:focus{border-color:#c9a44a;}
    .sb-input::placeholder{color:#9ca3af;}
    .sb-select{width:100%;background:#f7f8fa;border:1px solid #e2e5ea;border-radius:6px;font-family:inherit;font-size:12px;padding:7px 10px;outline:none;cursor:pointer;appearance:none;-webkit-appearance:none;color:#1a1d23;}
    .client-results{max-height:110px;overflow-y:auto;margin-top:4px;}
    .client-result{display:flex;align-items:center;gap:6px;padding:4px 6px;border-radius:6px;cursor:pointer;margin-top:2px;}
    .client-result:hover{background:#f7f8fa;}
    .client-result.selected{background:rgba(42,157,84,.08);outline:1px solid rgba(42,157,84,.25);}
    .client-avatar{width:24px;height:24px;border-radius:50%;background:rgba(201,164,74,.1);display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:600;color:#c9a44a;}
    .client-name{font-size:11px;font-weight:500;}
    .client-detail{font-size:9px;color:#9ca3af;}
    .new-client-btn{width:100%;margin-top:4px;padding:5px;background:transparent;border:1px dashed #e2e5ea;border-radius:6px;color:#9ca3af;font-family:inherit;font-size:10px;cursor:pointer;}
    .new-client-btn:hover{border-color:#c9a44a;color:#c9a44a;}
    .client-info{background:rgba(42,157,84,.08);border:1px solid rgba(42,157,84,.15);border-radius:6px;padding:6px 8px;margin-top:4px;display:none;}
    .ci-label{font-size:8px;color:#2a9d54;font-weight:600;letter-spacing:.5px;text-transform:uppercase;}
    .ci-name{font-size:11px;font-weight:500;margin-top:1px;}
    .ci-sub{font-size:9px;color:#9ca3af;}
    .new-client-form{display:none;margin-top:6px;}
    .new-client-form.visible{display:block;}
    .new-client-form input{width:100%;background:#f7f8fa;border:1px solid #e2e5ea;border-radius:6px;font-family:inherit;font-size:11px;padding:6px 8px;outline:none;margin-bottom:3px;color:#1a1d23;}
    .new-client-form input:focus{border-color:#c9a44a;}
    .svc-grid{display:grid;grid-template-columns:1fr 1fr;gap:4px;}
    .svc-btn{padding:8px 4px;border-radius:6px;border:1px solid #e2e5ea;background:#fff;color:#1a1d23;font-family:inherit;font-size:12px;font-weight:500;text-align:center;cursor:pointer;transition:.15s;line-height:1.2;}
    .svc-btn:hover{background:#f7f8fa;}
    .svc-btn.active{font-weight:600;background:rgba(201,164,74,.08);border-color:#c9a44a;color:#c9a44a;}
    .svc-family{font-size:11px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:#9ca3af;margin:8px 0 3px;}
    .svc-family:first-child{margin-top:0;}
    .svc-family.lbl-coloracion{color:#d97706;} .svc-family.lbl-cortesmujer{color:#2563eb;} .svc-family.lbl-peinados{color:#6366f1;} .svc-family.lbl-tratamientos{color:#9333ea;} .svc-family.lbl-caballero{color:#475569;} .svc-family.lbl-spa{color:#059669;}
    .config-section{display:none;margin-top:10px;padding:10px 12px 8px;border:2px solid #d97706;border-radius:6px;background:rgba(217,119,6,.04);}
    .config-section.visible{display:block;}
    .cfg-label{font-size:9px;font-weight:600;text-transform:uppercase;color:#9ca3af;margin-bottom:2px;}
    .cfg-check{display:flex;align-items:center;gap:5px;cursor:pointer;font-size:11px;margin-bottom:4px;}
    .cfg-check input{width:14px;height:14px;accent-color:#c9a44a;}
    .sb-status{margin-top:10px;padding:8px 10px;border-radius:6px;font-size:11px;font-weight:500;text-align:center;}
    .sb-status.ready{background:rgba(42,157,84,.08);color:#2a9d54;}
    .sb-status.waiting{background:#f7f8fa;color:#9ca3af;}
    .variant-btn{width:100%;padding:7px 10px;border-radius:6px;border:1px solid #e2e5ea;background:#fff;font-family:inherit;font-size:11px;text-align:left;cursor:pointer;margin-bottom:3px;display:flex;justify-content:space-between;}
    .variant-btn:hover{border-color:#c9a44a;color:#c9a44a;}
    .variant-btn.active{background:rgba(201,164,74,.1);border-color:#c9a44a;color:#c9a44a;}
    .simple-info{font-size:11px;color:#9ca3af;background:#f7f8fa;border-radius:6px;padding:6px 10px;margin-bottom:6px;display:flex;justify-content:space-between;}
    .si-price{color:#c9a44a;font-weight:600;}
    /* Calendar */
    .cal-wrap{flex:1;overflow:auto;position:relative;}
    .cal-header{display:grid;position:sticky;top:0;z-index:5;background:#f9fafb;border-bottom:2px solid #e2e5ea;}
    .cal-hcell{display:flex;align-items:center;justify-content:center;gap:6px;padding:8px 6px;font-size:12px;font-weight:600;border-right:1px solid #eff1f4;}
    .cal-hcell:first-child{position:sticky;left:0;z-index:6;background:#f9fafb;}
    .staff-dot{width:10px;height:10px;border-radius:50%;}
    .cal-body{position:relative;}
    .booking-block{position:absolute;border-radius:4px;padding:3px 5px;cursor:pointer;overflow:hidden;z-index:2;border-left:3px solid rgba(0,0,0,.2);transition:box-shadow .15s;user-select:none;}
    .booking-block:hover{box-shadow:0 4px 16px rgba(0,0,0,.1);z-index:4;}
    .booking-block.dragging{opacity:.25;cursor:grabbing;}
    .booking-title{font-size:10px;font-weight:600;color:#fff;line-height:1.3;}
    .booking-sub{font-size:9px;color:rgba(255,255,255,.85);}
    .booking-time{font-size:8px;color:rgba(255,255,255,.7);margin-top:1px;}
    .booking-block.bloqueo{cursor:default;}
    .ext-label{font-size:8px;font-weight:700;color:rgba(255,255,255,.85);text-transform:uppercase;letter-spacing:.5px;}
    .ext-delete{position:absolute;top:2px;right:4px;background:none;border:none;color:rgba(255,255,255,.7);font-size:14px;cursor:pointer;}
    .ext-delete:hover{color:#fff;}
    .resize-handle{position:absolute;bottom:0;left:0;right:0;height:8px;cursor:ns-resize;z-index:6;}
    .resize-handle::after{content:'';position:absolute;bottom:2px;left:50%;transform:translateX(-50%);width:24px;height:3px;border-radius:2px;background:rgba(255,255,255,.4);}
    .booking-block:hover .resize-handle::after{background:rgba(255,255,255,.7);}
    .now-line{position:absolute;left:0;right:0;height:2px;background:#ef4444;z-index:3;pointer-events:none;}
    .now-line::before{content:'';position:absolute;left:-4px;top:-3px;width:8px;height:8px;border-radius:50%;background:#ef4444;}
    .cal-loading{display:flex;align-items:center;justify-content:center;padding:60px;color:#9ca3af;font-size:13px;}
    .spinner{width:20px;height:20px;border:3px solid #e2e5ea;border-top-color:#c9a44a;border-radius:50%;animation:spin .7s linear infinite;margin-right:8px;}
    @keyframes spin{to{transform:rotate(360deg)}}
    @keyframes pulse-warn{0%,100%{opacity:1;}50%{opacity:.3;}}
    .warn-dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:#ef4444;animation:pulse-warn 1.5s ease-in-out infinite;margin-right:4px;vertical-align:middle;}
    .warn-text{font-size:9px;color:#ef4444;line-height:1.4;margin-top:2px;}
    .warn-banner{background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.25);border-radius:6px;padding:6px 8px;margin:6px 0 8px;}
    .tl-dot{display:inline-block;width:10px;height:10px;border-radius:50%;vertical-align:middle;margin-left:4px;transition:background .3s;animation:pulse-warn 1.5s ease-in-out infinite;}
    .tl-green{background:#22c55e;} .tl-orange{background:#f59e0b;} .tl-red{background:#ef4444;}
    .cal-cell{position:absolute;z-index:1;}
    .cal-cell:hover{background:rgba(0,0,0,.02);}
    .cal-cell.sb-ready:hover{background:rgba(42,157,84,.08);cursor:cell;}
    .cal-cell.sb-block:hover{background:rgba(71,85,105,.06);cursor:crosshair;}
    .cal-cell.drop-target{background:rgba(201,164,74,.18)!important;outline:2px dashed #c9a44a;outline-offset:-2px;}
    .drag-ghost{position:fixed;pointer-events:none;z-index:200;border-radius:4px;padding:4px 6px;border-left:3px solid rgba(0,0,0,.25);box-shadow:0 8px 24px rgba(0,0,0,.25);opacity:.85;max-width:180px;overflow:hidden;font-family:inherit;}
    .drag-ghost .g-name{font-size:10px;font-weight:600;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
    .drag-ghost .g-svc{font-size:9px;color:rgba(255,255,255,.8);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
    .drag-preview{position:absolute;z-index:7;border-radius:0 0 4px 4px;pointer-events:none;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:rgba(255,255,255,.8);border-left:3px dashed rgba(255,255,255,.5);}
    .drag-preview.block-preview{border-radius:4px;border-left:3px dashed rgba(0,0,0,.2);color:rgba(0,0,0,.6);}
    /* Modals */
    .modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.3);display:flex;align-items:flex-start;padding-top:60px;justify-content:center;z-index:100;backdrop-filter:blur(3px);}
    .modal-box{background:#fff;border-radius:10px;padding:20px 24px;max-width:420px;width:92%;box-shadow:0 20px 60px rgba(0,0,0,.15);max-height:80vh;overflow-y:auto;}
    .modal-box h3{font-size:15px;font-weight:700;margin-bottom:4px;}
    .modal-header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;}
    .modal-staff{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;}
    .modal-name{font-size:16px;font-weight:700;margin-bottom:8px;}
    .modal-time{font-size:11px;color:#6b7280;}
    .modal-services{border-top:1px solid #e2e5ea;padding-top:8px;margin-bottom:8px;}
    .modal-svc-line{display:flex;justify-content:space-between;font-size:11px;padding:2px 0;color:#6b7280;}
    .modal-total{display:flex;justify-content:space-between;font-size:13px;font-weight:700;padding-top:6px;border-top:1px solid #e2e5ea;margin-bottom:10px;}
    .modal-close{width:26px;height:26px;display:flex;align-items:center;justify-content:center;border:none;background:#f7f8fa;border-radius:50%;cursor:pointer;font-size:14px;color:#6b7280;}
    .modal-close:hover{color:#1a1d23;}
    .pill{display:inline-flex;padding:4px 8px;border-radius:999px;font-weight:700;font-size:9px;color:#fff;letter-spacing:.5px;text-transform:uppercase;}
    .pill-paid{background:#2a9d54;} .pill-pending{background:#d48a1a;}
    .pay-row{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:6px;}
    .btn-pay{border:none;border-radius:6px;padding:6px 10px;font-family:inherit;font-weight:600;cursor:pointer;color:#fff;font-size:10px;transition:.1s;}
    .btn-pay:hover{filter:brightness(1.1);} .btn-pay:active{transform:translateY(1px);} .btn-pay[disabled]{opacity:.4;cursor:not-allowed;}
    .btn-cash{background:#8F1C5B;} .btn-card{background:#4D8F8C;} .btn-bizum{background:#D18C49;} .btn-mixto{background:#7B68EE;}
    .btn-cancel-booking{border:1px solid rgba(217,54,54,.3);background:rgba(217,54,54,.08);color:#d93636;border-radius:6px;padding:6px 10px;font-family:inherit;font-weight:600;cursor:pointer;font-size:10px;margin-left:auto;}
    .btn-cancel-booking:hover{background:rgba(217,54,54,.2);}
    .btn-reschedule{display:inline-flex;align-items:center;gap:4px;background:rgba(37,99,235,.08);color:#2563eb;border:1px solid rgba(37,99,235,.25);border-radius:6px;padding:6px 12px;font-family:inherit;font-weight:600;font-size:11px;cursor:pointer;margin-top:6px;}
    .btn-reschedule:hover{background:rgba(37,99,235,.2);}
    .btn-add-svc{background:rgba(2,132,199,.08);border:1px solid rgba(14,165,233,.3);color:#0284c7;border-radius:6px;padding:6px 12px;font-family:inherit;font-weight:700;font-size:10px;cursor:pointer;width:100%;text-align:center;margin-top:8px;}
    .btn-add-svc:hover{background:rgba(14,165,233,.2);}
    .btn-extra{background:rgba(217,119,6,.08);border:1px solid rgba(245,158,11,.3);color:#d97706;border-radius:6px;padding:6px 12px;font-family:inherit;font-weight:700;font-size:10px;cursor:pointer;width:100%;text-align:center;margin-top:4px;}
    .add-svc-panel{margin-top:8px;background:#f7f8fa;border:1px solid #e2e5ea;border-radius:6px;padding:10px;max-height:250px;overflow-y:auto;}
    .add-svc-group{font-size:9px;font-weight:700;color:#c9a44a;text-transform:uppercase;letter-spacing:.5px;margin:8px 0 4px;} .add-svc-group:first-child{margin-top:0;}
    .add-svc-item{display:flex;justify-content:space-between;padding:5px 8px;border-radius:4px;cursor:pointer;font-size:11px;color:#6b7280;}
    .add-svc-item:hover{background:rgba(0,0,0,.04);color:#1a1d23;}
    .add-svc-dur{font-size:9px;color:#9ca3af;}
    /* v2.2.0 — Panel PRODUCTO (verde, alineado con eCommerce/PAGADO) */
    .btn-add-prod{background:rgba(21,128,61,.08);border:1px solid rgba(21,128,61,.3);color:#15803d;border-radius:6px;padding:6px 12px;font-family:inherit;font-weight:700;font-size:10px;cursor:pointer;width:100%;text-align:center;margin-top:4px;display:flex;align-items:center;justify-content:center;gap:6px;}
    .btn-add-prod:hover{background:rgba(21,128,61,.18);}
    .btn-add-prod[disabled]{opacity:.45;cursor:not-allowed;background:rgba(21,128,61,.04);}
    .prod-panel{margin-top:8px;background:#f7f8fa;border:1px solid rgba(21,128,61,.25);border-radius:6px;padding:10px;}
    .prod-search{width:100%;background:#fff;border:1px solid #e2e5ea;border-radius:6px;padding:7px 10px;font-family:inherit;font-size:12px;outline:none;color:#1a1d23;margin-bottom:8px;box-sizing:border-box;}
    .prod-search:focus{border-color:#15803d;}
    .prod-list{max-height:180px;overflow-y:auto;border-top:1px solid #e2e5ea;padding-top:6px;}
    .prod-item{display:flex;justify-content:space-between;align-items:center;padding:6px 8px;border-radius:4px;cursor:pointer;font-size:11px;color:#1a1d23;gap:8px;}
    .prod-item:hover{background:rgba(21,128,61,.08);}
    .prod-item.disabled{opacity:.4;cursor:not-allowed;}
    .prod-item.disabled:hover{background:transparent;}
    .prod-item-name{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
    .prod-item-price{font-size:11px;font-weight:700;color:#15803d;white-space:nowrap;}
    .prod-item-stock{font-size:9px;color:#dc2626;font-weight:600;margin-left:4px;}
    .prod-empty{text-align:center;color:#9ca3af;font-size:11px;padding:14px 0;}
    .prod-cart{margin-top:8px;border-top:1px dashed rgba(21,128,61,.3);padding-top:8px;}
    .prod-cart-title{font-size:9px;font-weight:700;color:#15803d;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;}
    .prod-cart-line{display:flex;align-items:center;gap:6px;padding:4px 0;font-size:11px;color:#1a1d23;border-bottom:1px solid #f0f1f3;}
    .prod-cart-line:last-of-type{border-bottom:none;}
    .prod-cart-line-name{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
    .prod-qty-btn{background:#fff;border:1px solid #e2e5ea;color:#6b7280;border-radius:4px;width:20px;height:20px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;line-height:1;padding:0;}
    .prod-qty-btn:hover{border-color:#15803d;color:#15803d;}
    .prod-qty-val{min-width:18px;text-align:center;font-weight:600;font-size:11px;color:#15803d;}
    .prod-cart-line-sub{font-size:11px;font-weight:700;color:#1a1d23;min-width:48px;text-align:right;}
    .prod-cart-rm{background:transparent;border:none;color:#d93636;cursor:pointer;font-size:13px;line-height:1;padding:0 2px;font-family:inherit;}
    .prod-cart-rm:hover{color:#a01010;}
    .prod-total-row{display:flex;justify-content:space-between;align-items:center;margin-top:8px;padding-top:8px;border-top:1px solid #e2e5ea;font-size:12px;font-weight:700;color:#1a1d23;}
    .prod-total-val{color:#15803d;font-size:13px;}
    .prod-pay-row{display:flex;gap:6px;margin-top:8px;}
    .prod-pay-btn{flex:1;background:#fff;border:1px solid #e2e5ea;color:#6b7280;border-radius:6px;padding:7px 4px;font-family:inherit;font-weight:600;font-size:10px;cursor:pointer;text-align:center;}
    .prod-pay-btn:hover{border-color:#15803d;color:#15803d;}
    .prod-pay-btn.selected{background:#15803d;border-color:#15803d;color:#fff;}
    .prod-confirm-row{display:flex;gap:6px;margin-top:10px;}
    .prod-confirm{flex:1;background:#15803d;color:#fff;border:none;border-radius:6px;padding:9px;font-family:inherit;font-weight:700;font-size:12px;cursor:pointer;}
    .prod-confirm:hover{background:#0f6b30;}
    .prod-confirm[disabled]{opacity:.4;cursor:not-allowed;}
    .prod-cancel{background:#f7f8fa;color:#6b7280;border:1px solid #e2e5ea;border-radius:6px;padding:9px 14px;font-family:inherit;font-weight:600;font-size:11px;cursor:pointer;}
    .resched-mode-btns{display:flex;gap:10px;margin:14px 0;}
    .resched-mode-btn{flex:1;padding:14px 10px;border-radius:10px;border:1px solid #e2e5ea;background:#f7f8fa;cursor:pointer;font-family:inherit;font-weight:600;font-size:12px;text-align:center;color:#6b7280;}
    .resched-mode-btn:hover{border-color:#c9a44a;color:#1a1d23;}
    .resched-mode-icon{font-size:22px;display:block;margin-bottom:4px;}
    .resched-mode-desc{font-size:9px;font-weight:400;color:#9ca3af;margin-top:2px;}
    .resched-date-row{display:flex;gap:8px;align-items:center;margin-bottom:10px;}
    .resched-input{flex:1;background:#f7f8fa;border:1px solid #e2e5ea;border-radius:6px;padding:8px 10px;font-family:inherit;font-size:13px;outline:none;color:#1a1d23;}
    .resched-input:focus{border-color:#c9a44a;}
    .slot-grid{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0;max-height:200px;overflow-y:auto;}
    .slot-btn{background:#f7f8fa;border:1px solid #e2e5ea;border-radius:6px;padding:7px 14px;font-family:inherit;font-weight:600;font-size:12px;cursor:pointer;}
    .slot-btn:hover{border-color:#c9a44a;color:#c9a44a;}
    .slot-btn.selected{background:rgba(201,164,74,.1);border-color:#c9a44a;color:#c9a44a;}
    .resched-loading{text-align:center;color:#9ca3af;font-size:12px;padding:16px 0;}
    .resched-no-slots{text-align:center;color:#d48a1a;font-size:12px;padding:12px 0;}
    .btn-resched-confirm{background:#0284c7;color:#fff;border:none;border-radius:6px;padding:8px 18px;font-family:inherit;font-weight:600;font-size:12px;cursor:pointer;}
    .btn-resched-confirm[disabled]{opacity:.4;cursor:not-allowed;}
    .btn-resched-force{background:#d48a1a;color:#1a1a2e;border:none;border-radius:6px;padding:6px 14px;font-family:inherit;font-weight:600;font-size:11px;cursor:pointer;}
    .mixto-form{margin-top:10px;background:#f7f8fa;border:1px solid rgba(123,104,238,.3);border-radius:6px;padding:12px;}
    .mixto-title{font-size:11px;font-weight:700;color:#7B68EE;text-transform:uppercase;text-align:center;margin-bottom:10px;}
    .mixto-row{display:flex;align-items:center;gap:8px;margin-bottom:8px;}
    .mixto-row label{font-size:11px;font-weight:600;color:#6b7280;width:70px;display:flex;align-items:center;gap:4px;}
    .mixto-dot{display:inline-block;width:10px;height:10px;border-radius:50%;}
    .mixto-row input{flex:1;background:#fff;border:1px solid #e2e5ea;border-radius:4px;padding:6px 8px;font-family:inherit;font-size:12px;text-align:right;outline:none;color:#1a1d23;}
    .mixto-total{display:flex;justify-content:space-between;padding-top:8px;border-top:1px solid #e2e5ea;font-size:12px;}
    .mixto-btns{display:flex;gap:8px;justify-content:flex-end;margin-top:10px;}
    .mixto-btns button{border:none;border-radius:6px;padding:6px 14px;font-family:inherit;font-weight:600;font-size:11px;cursor:pointer;}
    .btn-mixto-cancel{background:#f7f8fa;color:#6b7280;} .btn-mixto-confirm{background:#7B68EE;color:#fff;} .btn-mixto-confirm[disabled]{opacity:.4;cursor:not-allowed;}
    .modal-btn{border:none;border-radius:6px;padding:8px 18px;font-weight:600;font-size:12px;cursor:pointer;font-family:inherit;}
    .modal-btn-cancel{background:#f7f8fa;border:1px solid #e2e5ea;color:#6b7280;} .modal-btn-cancel:hover{color:#1a1d23;}
    .modal-btn-delete{background:#d93636;color:#fff;} .modal-btn-delete:hover{filter:brightness(1.1);}
    .extra-form{margin-top:6px;background:#f7f8fa;border:1px solid rgba(245,158,11,.25);border-radius:6px;padding:10px;}
    .extra-form input{background:#fff;border:1px solid #e2e5ea;border-radius:4px;padding:6px 8px;font-family:inherit;font-size:11px;outline:none;color:#1a1d23;}
    .extra-form input:focus{border-color:#d97706;}
    .extra-row{display:flex;gap:6px;align-items:center;margin-bottom:6px;}
    .extra-row input:first-child{flex:1;} .extra-row input:last-child{width:70px;text-align:right;}
    .extra-btns{display:flex;gap:6px;justify-content:flex-end;}
    .extra-btns button{border:none;border-radius:4px;padding:5px 12px;font-family:inherit;font-weight:600;font-size:10px;cursor:pointer;}
    .extra-save{background:#d97706;color:#fff;} .extra-cancel{background:#f7f8fa;color:#6b7280;}
    .popup-overlay{position:fixed;inset:0;background:rgba(0,0,0,.3);z-index:100;display:flex;align-items:center;justify-content:center;}
    .popup-card{background:#fff;border-radius:10px;box-shadow:0 8px 32px rgba(0,0,0,.15);width:360px;max-width:92vw;overflow:hidden;}
    .popup-bar{height:4px;border-radius:10px 10px 0 0;}
    .popup-header{padding:14px 18px 10px;border-bottom:1px solid #e2e5ea;display:flex;justify-content:space-between;}
    .popup-svc{font-size:15px;font-weight:700;}
    .popup-status{font-size:10px;font-weight:600;padding:2px 7px;border-radius:4px;}
    .popup-status.CONFIRMED{background:#dcfce7;color:#166534;} .popup-status.PENDING{background:#fef3c7;color:#92400e;} .popup-status.BLOCKED{background:#fee2e2;color:#991b1b;}
    .popup-body{padding:14px 18px;}
    .popup-row{margin-bottom:10px;}
    .popup-label{font-size:10px;color:#9ca3af;font-weight:500;text-transform:uppercase;letter-spacing:.4px;}
    .popup-value{font-size:13px;font-weight:500;}
    /* Settings */
    .settings-overlay{position:fixed;inset:0;background:rgba(0,0,0,.25);z-index:100;display:none;}
    .settings-overlay.open{display:block;}
    .settings-panel{position:fixed;top:0;right:-360px;width:340px;height:100%;background:#fff;box-shadow:0 8px 32px rgba(0,0,0,.15);z-index:101;transition:right .3s;display:flex;flex-direction:column;}
    .settings-panel.open{right:0;}
    .settings-header{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid #e2e5ea;}
    .settings-title{font-size:15px;font-weight:700;}
    .settings-body{flex:1;overflow-y:auto;padding:14px 18px;}
    .settings-section{margin-bottom:20px;}
    .settings-section-title{font-size:12px;font-weight:700;margin-bottom:10px;}
    .staff-config-row{display:grid;grid-template-columns:22px 1fr 28px 48px;align-items:center;gap:6px;padding:6px 8px;background:#f7f8fa;border-radius:6px;margin-bottom:6px;}
    .staff-check{width:14px;height:14px;accent-color:#c9a44a;cursor:pointer;}
    .staff-name-label{font-size:12px;font-weight:500;}
    .staff-color-btn{width:24px;height:24px;border-radius:5px;border:2px solid #e2e5ea;cursor:pointer;}
    .staff-color-btn:hover{border-color:#c9a44a;}
    .staff-pos-input{width:44px;height:26px;border:1px solid #e2e5ea;border-radius:4px;text-align:center;font-size:11px;font-family:inherit;}
    .slider-row{display:flex;align-items:center;gap:8px;}
    .slider-row label{font-size:11px;color:#6b7280;white-space:nowrap;min-width:55px;}
    .slider-row input[type="range"]{flex:1;-webkit-appearance:none;height:5px;background:#e2e5ea;border-radius:3px;outline:none;}
    .slider-row input[type="range"]::-webkit-slider-thumb{-webkit-appearance:none;width:14px;height:14px;background:#c9a44a;border-radius:50%;cursor:pointer;}
    .option-group{display:flex;flex-direction:column;gap:6px;}
    .option-item{display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;}
    .option-item input{width:14px;height:14px;accent-color:#c9a44a;}
    .color-popover{position:fixed;z-index:200;background:#fff;border-radius:10px;box-shadow:0 8px 32px rgba(0,0,0,.15);padding:10px;display:none;}
    .color-popover.open{display:block;}
    .color-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:5px;}
    .color-swatch{width:28px;height:28px;border-radius:5px;cursor:pointer;border:2px solid transparent;}
    .color-swatch:hover{transform:scale(1.15);border-color:#1a1d23;}
    .color-swatch.active{border-color:#1a1d23;box-shadow:0 0 0 2px #fff,0 0 0 4px #1a1d23;}
    /* Booking popup */
    .booking-overlay{position:fixed;inset:0;background:rgba(0,0,0,.3);z-index:160;display:none;align-items:center;justify-content:center;backdrop-filter:blur(2px);}
    .booking-overlay.open{display:flex;}
    .booking-card{background:#fff;border-radius:10px;box-shadow:0 8px 32px rgba(0,0,0,.15);width:380px;max-width:92vw;}
    .booking-card-header{padding:14px 18px 10px;border-bottom:1px solid #e2e5ea;display:flex;justify-content:space-between;}
    .booking-card-body{padding:16px 18px;}
    .booking-summary{display:flex;flex-direction:column;gap:10px;margin-bottom:16px;}
    .booking-row{display:flex;align-items:center;gap:8px;}
    .booking-row-icon{font-size:16px;width:22px;text-align:center;}
    .booking-row-label{font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:.4px;}
    .booking-row-value{font-size:13px;font-weight:500;}
    .time-adjust{display:flex;align-items:center;gap:6px;margin-top:4px;}
    .time-adjust button{width:28px;height:28px;border:1px solid #e2e5ea;border-radius:6px;background:#fff;cursor:pointer;font-size:14px;font-weight:700;color:#6b7280;display:flex;align-items:center;justify-content:center;}
    .time-adjust button:hover{border-color:#c9a44a;color:#c9a44a;}
    .time-display{font-size:18px;font-weight:700;color:#c9a44a;min-width:50px;text-align:center;}
    .booking-card-footer{padding:12px 18px 16px;display:flex;gap:8px;}
    .btn-book{flex:1;padding:10px;border:none;border-radius:6px;background:#2a9d54;color:#fff;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer;}
    .btn-book:hover{filter:brightness(1.1);} .btn-book:disabled{opacity:.4;cursor:not-allowed;}
    .btn-book-cancel{padding:10px 16px;border:1px solid #e2e5ea;border-radius:6px;background:#fff;color:#6b7280;font-family:inherit;font-size:13px;cursor:pointer;}
    /* Cierre */
    .cierre-panel{display:none;margin-top:10px;background:#fff;border:1px solid #e2e5ea;border-radius:10px;padding:16px;}
    .cierre-panel.visible{display:block;}
    .cierre-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid #e2e5ea;}
    .cierre-title{font-size:14px;font-weight:800;}
    .cierre-close{background:none;border:none;font-size:18px;cursor:pointer;color:#9ca3af;padding:4px 8px;}
    .cierre-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
    .cierre-box{background:#f7f8fa;border-radius:6px;padding:12px;text-align:center;}
    .cierre-box.cobrado{border-left:3px solid #2a9d54;} .cierre-box.pendiente{border-left:3px solid #d48a1a;} .cierre-box.total{grid-column:1/-1;border-left:3px solid #c9a44a;background:rgba(201,164,74,.08);}
    .cierre-label{font-size:10px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:.5px;}
    .cierre-valor{font-size:20px;font-weight:800;margin-top:3px;}
    .cierre-detalle{font-size:10px;color:#9ca3af;margin-top:2px;}
    .cierre-section{grid-column:1/-1;margin-top:4px;}
    .cierre-section-title{font-size:10px;font-weight:700;color:#c9a44a;text-transform:uppercase;letter-spacing:.6px;margin-bottom:6px;border-bottom:1px solid #e2e5ea;padding-bottom:4px;}
    .cierre-row{display:flex;justify-content:space-between;align-items:center;padding:4px 8px;font-size:11px;}
    .cierre-row:nth-child(odd){background:rgba(0,0,0,.03);border-radius:4px;}
    .cierre-nombre{color:#6b7280;flex:1;} .cierre-importe{font-weight:700;}
    .cierre-metodo-icon{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;}
    .btn-cierre{background:linear-gradient(135deg,rgba(54,192,106,.25),rgba(54,192,106,.10));border:1px solid rgba(54,192,106,.3);border-radius:6px;padding:7px 12px;font-family:inherit;font-weight:700;font-size:12px;cursor:pointer;color:#1a1d23;}
    .btn-cierre:hover{filter:brightness(1.15);}
    /* Toast */
    .toast{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);background:#1a1d23;color:#fff;padding:8px 18px;border-radius:999px;font-size:11px;font-weight:600;display:none;z-index:200;max-width:calc(100% - 24px);text-align:center;}
    .cal-wrap::-webkit-scrollbar{width:6px;height:6px;} .cal-wrap::-webkit-scrollbar-thumb{background:#e2e5ea;border-radius:4px;}
    /* Datepicker */
    .dp-popover{position:absolute;z-index:50;background:#fff;border-radius:10px;box-shadow:0 8px 32px rgba(0,0,0,.15);padding:14px;width:270px;display:none;top:100%;left:100px;margin-top:4px;}
    .dp-popover.open{display:block;}
    .dp-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;}
    .dp-month{font-size:14px;font-weight:700;text-transform:capitalize;}
    .dp-nav{display:flex;align-items:center;justify-content:center;width:26px;height:26px;border:1px solid #e2e5ea;border-radius:6px;background:#fff;cursor:pointer;font-size:14px;color:#6b7280;}
    .dp-nav:hover{background:#f7f8fa;color:#c9a44a;}
    .dp-weekdays{display:grid;grid-template-columns:repeat(7,1fr);text-align:center;margin-bottom:4px;}
    .dp-weekdays span{font-size:10px;font-weight:600;color:#9ca3af;padding:3px 0;}
    .dp-days{display:grid;grid-template-columns:repeat(7,1fr);gap:2px;}
    .dp-day{display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:50%;font-size:12px;font-weight:500;cursor:pointer;margin:0 auto;}
    .dp-day:hover{background:rgba(201,164,74,.1);color:#c9a44a;}
    .dp-day.other{color:#e2e5ea;}
    .dp-day.today{border:2px solid #c9a44a;font-weight:700;}
    .dp-day.selected{background:#c9a44a;color:#fff;font-weight:700;}
    /* Arqueo de caja v2.2.4 */
    .arqueo-overlay{position:fixed;inset:0;background:rgba(0,0,0,.3);display:flex;align-items:flex-start;padding-top:40px;justify-content:center;z-index:100;backdrop-filter:blur(3px);}
    .arqueo-box{background:#fff;border-radius:10px;padding:20px 24px;max-width:480px;width:95%;box-shadow:0 20px 60px rgba(0,0,0,.15);max-height:85vh;overflow-y:auto;}
    .arqueo-title{font-size:16px;font-weight:800;margin-bottom:4px;}
    .arqueo-subtitle{font-size:11px;color:#9ca3af;margin-bottom:12px;}
    .arqueo-summary{background:#f7f8fa;border-radius:6px;padding:10px 12px;margin-bottom:12px;}
    .arqueo-row{display:flex;justify-content:space-between;padding:3px 0;font-size:12px;}
    .arqueo-row.total{border-top:1px solid #e2e5ea;padding-top:6px;margin-top:4px;font-weight:700;font-size:13px;}
    .arqueo-warn{background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.3);border-radius:6px;padding:8px 10px;margin-bottom:10px;font-size:11px;color:#92400e;}
    .arqueo-input-row{display:flex;align-items:center;gap:8px;margin-bottom:10px;}
    .arqueo-input-row label{font-size:12px;font-weight:600;color:#6b7280;min-width:120px;}
    .arqueo-input{flex:1;background:#f7f8fa;border:1px solid #e2e5ea;border-radius:6px;padding:8px 10px;font-family:inherit;font-size:14px;outline:none;text-align:right;color:#1a1d23;}
    .arqueo-input:focus{border-color:#c9a44a;}
    .arqueo-result{border-radius:6px;padding:10px 12px;margin:10px 0;text-align:center;font-size:14px;font-weight:700;}
    .arqueo-result.ok{background:rgba(42,157,84,.08);color:#2a9d54;border:1px solid rgba(42,157,84,.2);}
    .arqueo-result.warn{background:rgba(245,158,11,.08);color:#92400e;border:1px solid rgba(245,158,11,.3);}
    .arqueo-result.bad{background:rgba(217,54,54,.08);color:#d93636;border:1px solid rgba(217,54,54,.2);}
    .arqueo-note{width:100%;background:#f7f8fa;border:1px solid #e2e5ea;border-radius:6px;padding:8px 10px;font-family:inherit;font-size:12px;outline:none;resize:vertical;min-height:40px;color:#1a1d23;margin-bottom:10px;}
    .arqueo-note:focus{border-color:#c9a44a;}
    .arqueo-btns{display:flex;gap:8px;justify-content:flex-end;margin-top:12px;}
    .arqueo-btn{border:none;border-radius:6px;padding:8px 16px;font-family:inherit;font-weight:600;font-size:12px;cursor:pointer;}
    .arqueo-btn-cancel{background:#f7f8fa;color:#6b7280;border:1px solid #e2e5ea;}
    .arqueo-btn-save{background:#c9a44a;color:#fff;}
    .arqueo-btn-close{background:#2a9d54;color:#fff;}
    .arqueo-btn-close[disabled],.arqueo-btn-save[disabled]{opacity:.4;cursor:not-allowed;}
    .arqueo-mov-section{margin-top:14px;border-top:1px solid #e2e5ea;padding-top:10px;}
    .arqueo-mov-title{font-size:11px;font-weight:700;color:#c9a44a;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;}
    .arqueo-mov-row{display:flex;justify-content:space-between;align-items:center;padding:4px 6px;font-size:11px;border-radius:4px;margin-bottom:2px;}
    .arqueo-mov-row:nth-child(odd){background:rgba(0,0,0,.02);}
    .arqueo-mov-add{display:flex;gap:4px;margin-top:8px;flex-wrap:wrap;}
    .arqueo-mov-add select,.arqueo-mov-add input{font-family:inherit;font-size:11px;padding:5px 6px;border:1px solid #e2e5ea;border-radius:4px;outline:none;}
    .arqueo-mov-add select{width:110px;} .arqueo-mov-add input:nth-child(2){width:60px;text-align:right;} .arqueo-mov-add input:nth-child(3){flex:1;min-width:80px;}
    .arqueo-mov-add button{background:#c9a44a;color:#fff;border:none;border-radius:4px;padding:5px 10px;font-family:inherit;font-weight:600;font-size:10px;cursor:pointer;}
  `;
  // ═══════════════════════════════════════════════════
  // CLASS
  // ═══════════════════════════════════════════════════
  class KamisuiteAgenda extends HTMLElement {
    static get observedAttributes() { return ['response']; }
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this._fecha = todayISO();
      this._staff = [];
      this._reservas = [];
      this._packs = [];
      this._settings = { rowHeight:48, titleMode:'servicio', interval:30, staffConfig:{} };
      this._settingsLoaded = false;
      // v2.2.8: catálogo de precios y duraciones (lectura ServiceCatalog)
      this._catalogoPrecios = {};     // { [serviceIdWix]: { duration, price } }
      this._catalogoLoaded = false;
      // Sidebar
      this._cliente = null;
      this._familia = null;
      this._servicioId = null;
      this._servicioLabel = null;
      this._simpleDur = null;
      this._simplePrice = null;
      this._hasVariants = false;
      this._simpleVariant = null;
      this._sidebarStaff = [];
      this._bookingStaffId = null;
      this._bookingTime = null;
      this._bookingMinutes = 0;
      this._reservando = false;
      // Drag
      this._drag = null;
      this._dragPreview = null;
      this._bookingDrag = null;
      this._bookingDragGhost = null;
      this._blockDrag = null;
      this._blockDragPreview = null;
      this._suppressClick = false;
      // Cierre
      this._datosCierre = null;
      // v2.2.7: datos extendidos (IVA + clientes + ventas POS)
      this._datosCierreExt = null;
      // v2.2.0 — Productos
      this._productosCache = null;       // catálogo cargado bajo demanda
      this._productoCart = [];           // carrito mini de la venta en curso
      this._productoMetodoPago = 'Efectivo';
      this._productoLoading = false;
      this._productoSearchQ = '';
    }
    connectedCallback() {
      // Inyectar font en document.head (Shadow DOM no carga @import bien)
      if (!document.getElementById('kamisuite-font')) {
        const link = document.createElement('link');
        link.id = 'kamisuite-font';
        link.rel = 'stylesheet';
        link.href = 'https://fonts.googleapis.com/css2?family=Bai+Jamjuree:wght@300;400;500;600;700&display=swap';
        document.head.appendChild(link);
      }
      this._render();
      this._bindEvents();
      this._updateDateLabel();
      this._updateSidebarStatus();
      this._sendToPage('ready', {});
      this._sendToPage('get-staff', {});
      this._sendToPage('get-catalogo-precios', {});
      setInterval(() => {
        if (this._lastDateChange && Date.now() - this._lastDateChange < 5000) return;
        if (!this.shadowRoot.querySelector('.modal-overlay,.popup-overlay,.settings-overlay.open,.booking-overlay.open')) {
          this._sendToPage('get-reservas', { fecha: this._fecha });
        }
      }, 10000);
      console.log(`${TAG} Montado.`);
    }
    attributeChangedCallback(name, oldVal, newVal) {
      if (name !== 'response' || !newVal || oldVal === newVal) return;
      let p; try { p = JSON.parse(newVal); } catch(e) { return; }
      this._handleResponse(p);
    }
    _sendToPage(type, data={}) {
      this.dispatchEvent(new CustomEvent('agenda-message', { detail:{ type, ...data }, bubbles:true, composed:true }));
    }
    _handleResponse(p) {
      switch(p.type) {
        case 'staff-data':
          this._staff = p.staff||[];
          this._initStaffConfig();
          if (!this._settingsLoaded) this._sendToPage('get-settings', {});
          else this._sendToPage('get-reservas', { fecha: this._fecha });
          break;
        case 'catalogo-precios-data':
          // v2.2.8: catálogo de precios y duraciones desde ServiceCatalog
          this._catalogoPrecios = p.mapa || {};
          this._catalogoLoaded = true;
          console.log(`${TAG} 📋 Catálogo cargado: ${Object.keys(this._catalogoPrecios).length} servicios`);
          break;
        case 'settings-data':
          if (p.settings) { this._settings = { ...this._settings, ...p.settings }; this._initStaffConfig(); }
          this._settingsLoaded = true;
          this._sendToPage('get-reservas', { fecha: this._fecha });
          break;
        case 'reservas-data':
          if (p.fecha && p.fecha !== this._fecha) { console.log(`${TAG} ⏭️ Descartando reservas de ${p.fecha} (actual: ${this._fecha})`); break; }
          this._reservas = p.reservas||[];
          this._packs = p.packs||[];
          this._renderCalendar();
          this._updateStats();
          break;
        case 'error':
          this.shadowRoot.getElementById('calContent').innerHTML = `<div class="cal-loading">${esc(p.message||'Error')}</div>`;
          break;
        case 'cacheReady':
          { const si = this.shadowRoot.getElementById('searchCliente');
            if (si) { si.placeholder = `Buscar entre ${p.total||'?'} clientes...`; si.disabled = false; } }
          break;
        case 'loading':
          { const si = this.shadowRoot.getElementById('searchCliente');
            if (si) si.placeholder = p.message || 'Cargando...'; }
          break;
        case 'clientesEncontrados': this._mostrarResultados(p.clientes||[]); break;
        case 'contactoCreado':
          if (p.data?.ok && p.data?.contactId && this._cliente && !this._cliente.contactId) this._cliente.contactId = p.data.contactId;
          break;
        case 'contactoEditado':
          if (p.data?.ok && p.data?.cliente) {
            const cl = p.data.cliente;
            this._cliente = cl;
            const R = this.shadowRoot;
            R.getElementById('infoNombre').textContent = cl.nombreCompleto || cl.nombre;
            R.getElementById('infoDetalle').textContent = `${cl.email || ''} ${cl.telefono ? '· ' + cl.telefono : ''}`;
            R.getElementById('formEditCliente').classList.remove('visible');
            R.getElementById('clienteInfo').style.display = 'block';
            this._updateClienteWarning();
            this._toast('Cliente actualizado ✓');
          } else {
            this._toast('Error: ' + (p.data?.error?.message || 'No se pudo editar'));
          }
          break;
        case 'staffCargado': this._sidebarStaff = p.staff||[]; break;
        case 'variantesCargadas': this._mostrarVariantes(p.variants||[]); break;
        case 'slotsDisponibles': /* used by sidebar booking - Phase 2 handles inline */ break;
        case 'reservaCompletada': this._handleReservaCompletada(p.data); break;
        case 'serviceInfoLoaded':
          if (p.serviceId === this._servicioId) {
            if (p.duration) this._simpleDur = p.duration;
            if (p.price !== null) this._simplePrice = p.price;
            if (p.hasVariants !== undefined) this._hasVariants = p.hasVariants;
            this._showServiceConfig();
          }
          break;
        // Checkout
        case 'checkout-paid': this._toast(p.payload?.mensaje||'Pagado ✅'); this._closeAllModals(); setTimeout(()=>this._reload(),1500); break;
        case 'checkout-payError': this._toast('Error: '+(p.message||'')); break;
        case 'checkout-deleted': this._toast(p.payload?.mensaje||'Eliminado ✅'); this._closeAllModals(); setTimeout(()=>this._reload(),1500); break;
        case 'checkout-deleteError': this._toast('Error: '+(p.message||'')); break;
        case 'checkout-serviceAdded': this._toast(p.payload?.mensaje||'Añadido ✅'); this._closeAllModals(); setTimeout(()=>this._reload(),1500); break;
        case 'checkout-addServiceError': this._toast('Error: '+(p.message||'')); break;
        case 'checkout-extraSaved': this._toast('Extra guardado ✅'); this._closeAllModals(); setTimeout(()=>this._reload(),1000); break;
        case 'checkout-extraRemoved': this._toast('Extra eliminado ✅'); this._closeAllModals(); setTimeout(()=>this._reload(),1000); break;
        case 'checkout-extraError': this._toast('Error: '+(p.message||'')); break;
        case 'checkout-packsReloaded': this._packs = p.packs||[]; break;
        case 'complementosCargados': this._renderComplementoPanel(p.complementos||[]); break;
        // v2.2.0 — Productos
        case 'productos-cargados':
          this._productosCache = p.productos || [];
          this._productoLoading = false;
          this._renderProductoPanel();
          break;
        case 'productoVendido': {
          // FIX v2.2.1:
          //   - NO abrimos PDF automáticamente (era inesperado e intrusivo).
          //     La factura queda creada y accesible por el flujo normal.
          //   - Subimos delay de reload de 1200ms a 4000ms porque
          //     orders.searchOrders en Wix tarda en indexar la nueva venta.
          //     Con 1.2s a veces el reload no traía aún el producto.
          const r = p.payload || {};
          const partes = [];
          if (r.unitCount) partes.push(`${r.unitCount} producto(s)`);
          if (r.total) partes.push(`${r.total}€`);
          this._toast(`Venta registrada ✅ ${partes.join(' · ')}`, 3500);
          this._productoCart = [];
          this._productoMetodoPago = 'Efectivo';
          this._closeAllModals();
          setTimeout(() => this._reload(), 4000);
          break;
        }
        case 'productoError':
          this._toast('Error venta: ' + (p.message || 'desconocido'));
          { const ov = this.shadowRoot.getElementById('actionModal');
            const btn = ov?.querySelector('.prod-confirm');
            if (btn) { btn.disabled = false; btn.textContent = 'REGISTRAR VENTA'; } }
          break;
        case 'checkout-slotsResult': this._renderSlotsResult(p.slots||[]); break;
        case 'checkout-rescheduleOk': this._renderRescheduleResult(true, p.payload?.mensaje); break;
        case 'checkout-rescheduleError': this._renderRescheduleResult(false, p.message); break;
        case 'checkout-invoiceReady': if(p.payload?.invoiceUrl) window.open(p.payload.invoiceUrl,'_blank'); this._toast('Factura ✅'); break;
        case 'checkout-invoiceError': this._toast(p.message==='EMAIL_REQUIRED'?'⚠️ Sin email':'Error: '+p.message); break;
        case 'checkout-cierreData': this._datosCierre = p.datosCierre; this._renderCierre(); break;
        // v2.2.7: datos extendidos (IVA + clientes + ventas POS)
        case 'checkout-cierreExtendidoData':
          this._datosCierreExt = { iva: p.iva, clientesDelDia: p.clientesDelDia, ventasPOS: p.ventasPOS, totalPOS: p.totalPOS };
          this._renderCierre();
          break;
        case 'extensionCreada': if(p.ok){this._toast('Extensión ✓');setTimeout(()=>this._reload(),500);}else this._toast('Error');break;
        case 'extensionEliminada': if(p.ok){this._toast('Eliminada ✓');setTimeout(()=>this._reload(),500);}else this._toast('Error');break;
        // Arqueo de caja (v2.2.4)
        case 'cashRegister-data': this._arqueoData=p.data||{}; this._renderArqueo(p.data||{}); this._renderArqueoResumen(p.data||{}); break;
        case 'cashRegister-saved':
          this._toast(p.ok?'Arqueo guardado ✅':'Error: '+(p.error||''));
          if(p.ok){this._sendToPage('checkout-cierre',{fechaISO:this._fecha});this._sendToPage('cashRegister-calculate',{fechaISO:this._fecha});}
          break;
        case 'cashRegister-closed':
          this._toast(p.ok?'Caja cerrada ✅':'Error: '+(p.error||''));
          if(p.ok){this._sendToPage('checkout-cierre',{fechaISO:this._fecha});this._sendToPage('cashRegister-calculate',{fechaISO:this._fecha});}
          break;
        case 'cashRegister-movementAdded':
          this._toast(p.ok?'Movimiento registrado ✅':'Error: '+(p.error||''));
          if(p.ok){this._sendToPage('checkout-cierre',{fechaISO:this._fecha});this._sendToPage('cashRegister-calculate',{fechaISO:this._fecha});}
          break;
        case 'bookingMovido': if(p.ok){this._toast(p.mensaje||'Movido ✓');setTimeout(()=>this._reload(),500);}else this._toast('Error: '+(p.error||''));break;
      }
    }
    _reload() { this._sendToPage('get-reservas', { fecha: this._fecha }); }
    _initStaffConfig() { const cfg=this._settings.staffConfig;let pos=1;for(const s of this._staff){if(!cfg[s.id])cfg[s.id]={visible:true,color:DEFAULT_COLORS[s.name]||PALETTE[pos%PALETTE.length],position:pos};pos++;} }
    _getVisibleStaff() { const cfg=this._settings.staffConfig; return this._staff.filter(s=>cfg[s.id]?.visible!==false).sort((a,b)=>(cfg[a.id]?.position||99)-(cfg[b.id]?.position||99)); }
    _staffColor(rid) { return this._settings.staffConfig[rid]?.color||'#6b7280'; }
    _staffName(rid) { const s=this._staff.find(x=>x.id===rid); return s?s.name:'?'; }
    _findPack(bid) { if(!bid||!this._packs.length)return null; return this._packs.find(p=>[...(p.bookingIds||[]),...(p.bookingIdsPendientes||[])].includes(bid)); }
    _toast(msg, ms=2500) { const t=this.shadowRoot.getElementById('toast');t.textContent=msg;t.style.display='block';clearTimeout(this._toastTimer);this._toastTimer=setTimeout(()=>t.style.display='none',ms); }
    _closeAllModals() { this.shadowRoot.querySelectorAll('.modal-overlay,.popup-overlay').forEach(m=>m.remove()); }
    _setDate(iso) { this._fecha=iso; this._lastDateChange=Date.now(); this._updateDateLabel(); this._reload(); }
    _updateDateLabel() {
      const R=this.shadowRoot,[y,m,d]=this._fecha.split('-').map(Number),dt=new Date(y,m-1,d);
      const months=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
      const days=['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
      R.getElementById('navDate').textContent=`${months[m-1]} ${y}`;
      R.getElementById('navDay').textContent=`${days[dt.getDay()]} ${d}`;
    }
    _updateStats() {
      const vis=new Set(this._getVisibleStaff().map(s=>s.id));
      const bk=this._reservas.filter(r=>r.tipo==='booking'&&vis.has(r.resourceId)).length;
      const bl=this._reservas.filter(r=>r.tipo==='bloqueo'&&vis.has(r.resourceId)).length;
      this.shadowRoot.getElementById('navStats').textContent=`${bk} citas${bl?' · '+bl+' bloq.':''}`;
      // v2.0.6: Semáforo solapamientos
      const visBookings=this._reservas.filter(r=>r.tipo==='booking'&&vis.has(r.resourceId));
      const olStatus=getOverlapStatus(visBookings);
      const olDot=this.shadowRoot.getElementById('overlapDot');
      if(olDot){olDot.className='tl-dot '+olStatus;olDot.title=olStatus==='tl-green'?'Sin solapamientos':olStatus==='tl-orange'?'Solapamiento ≤10 min':'Solapamiento >10 min';}
      // v2.0.8: Semáforo clientes del día
      const clStatus=getDayClientStatus(visBookings);
      const clDot=this.shadowRoot.getElementById('clienteDot');
      if(clDot){clDot.className='tl-dot '+clStatus;clDot.title=clStatus==='tl-green'?'Todos los clientes con ficha completa':clStatus==='tl-orange'?'Algún cliente con datos parciales':'Algún cliente sin email ni teléfono';}
    }
    // ── Datepicker ──
    _dpYear=null; _dpMonth=null;
    _openDatePicker() {
      const[y,m]=this._fecha.split('-').map(Number); this._dpYear=y; this._dpMonth=m;
      this._renderDatePicker();
      this.shadowRoot.getElementById('dpPopover').classList.add('open');
    }
    _closeDatePicker() { this.shadowRoot.getElementById('dpPopover').classList.remove('open'); }
    _renderDatePicker() {
      const MONTHS=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
      this.shadowRoot.getElementById('dpMonth').textContent=`${MONTHS[this._dpMonth-1]} ${this._dpYear}`;
      const todayStr=todayISO(), selStr=this._fecha;
      const fd=new Date(this._dpYear,this._dpMonth-1,1); let sd=fd.getDay(); sd=sd===0?6:sd-1;
      const dim=new Date(this._dpYear,this._dpMonth,0).getDate();
      const dipm=new Date(this._dpYear,this._dpMonth-1,0).getDate();
      let html='';
      for(let i=sd-1;i>=0;i--){const d=dipm-i;const pm=this._dpMonth===1?12:this._dpMonth-1;const py=this._dpMonth===1?this._dpYear-1:this._dpYear;html+=`<div class="dp-day other" data-date="${py}-${String(pm).padStart(2,'0')}-${String(d).padStart(2,'0')}">${d}</div>`;}
      for(let d=1;d<=dim;d++){const iso=`${this._dpYear}-${String(this._dpMonth).padStart(2,'0')}-${String(d).padStart(2,'0')}`;let cls='dp-day';if(iso===todayStr)cls+=' today';if(iso===selStr)cls+=' selected';html+=`<div class="${cls}" data-date="${iso}">${d}</div>`;}
      const tc=sd+dim;const rem=tc%7===0?0:7-(tc%7);
      for(let d=1;d<=rem;d++){const nm=this._dpMonth===12?1:this._dpMonth+1;const ny=this._dpMonth===12?this._dpYear+1:this._dpYear;html+=`<div class="dp-day other" data-date="${ny}-${String(nm).padStart(2,'0')}-${String(d).padStart(2,'0')}">${d}</div>`;}
      const container=this.shadowRoot.getElementById('dpDays');
      container.innerHTML=html;
      container.querySelectorAll('.dp-day').forEach(el=>el.addEventListener('click',()=>{if(el.dataset.date){this._setDate(el.dataset.date);this._closeDatePicker();}}));
    }
    _updateSidebarStatus() {
      const s=this.shadowRoot.getElementById('sbStatus'); if(!s)return;
      if(this._cliente&&this._servicioId){s.style.display='block';s.className='sb-status ready';s.textContent='Haz clic en el calendario';}
      else if(this._cliente){s.style.display='block';s.className='sb-status waiting';s.textContent='Selecciona servicio o arrastra para bloquear';}
      else if(this._servicioId){s.style.display='block';s.className='sb-status waiting';s.textContent='Selecciona un cliente · Arrastra para bloquear';}
      else{s.style.display='block';s.className='sb-status waiting';s.textContent='Arrastra para bloquear';}
    }
    // ═══════════════════════════════════════════════════
    // RENDER DOM
    // ═══════════════════════════════════════════════════
    _render() {
      // Build service buttons HTML
      const groups = { coloracion:'COLORACION', cortesmujer:'CORTES DE MUJER', peinados:'PEINADOS Y RECOGIDOS', tratamientos:'TRATAMIENTOS', caballero:'CABALLERO', spa:'SPA CAPILAR' };
      const lblClass = { coloracion:'lbl-coloracion', cortesmujer:'lbl-cortesmujer', peinados:'lbl-peinados', tratamientos:'lbl-tratamientos', caballero:'lbl-caballero', spa:'lbl-spa' };
      let svcHTML = '';
      for (const g in groups) {
        svcHTML += `<div class="svc-family ${lblClass[g]||''}">${groups[g]}</div><div class="svc-grid">`;
        for (const b of SVC_BUTTONS.filter(x=>x.group===g)) {
          // v2.2.8: el click handler lee dur/price del catálogo en runtime. No se inyectan en el DOM.
          svcHTML += `<button class="svc-btn" data-family="${b.family}" data-id="${b.id}" data-label="${esc(b.label)}" ${b.variants?'data-variants="1"':''}>${esc(b.label)}</button>`;
        }
        svcHTML += `</div>`;
      }
      this.shadowRoot.innerHTML = `<style>${STYLES}</style>
        <div class="app">
          <div class="topbar">
            <div class="topbar-left"><span class="topbar-title">KAMISUITE Agenda</span><span class="topbar-version">v${VERSION}</span></div>
            <div class="topbar-right">
              <button class="btn btn-icon" id="btnArqueo" title="Arqueo de caja">🏦</button>
              <button class="btn btn-icon" id="btnCierre" title="Cierre del día">💰</button>
              <button class="btn btn-icon" id="btnRefresh" title="Recargar">↻</button>
              <button class="btn btn-icon" id="btnSettings" title="Ajustes">⚙</button>
            </div>
          </div>
          <div class="navbar">
            <button class="btn btn-today" id="btnToday">Hoy</button>
            <button class="btn btn-nav" id="btnPrev">‹</button>
            <button class="btn btn-nav" id="btnNext">›</button>
            <span class="nav-date" id="navDate" style="cursor:pointer;"></span>
            <span class="nav-day" id="navDay"></span><span id="overlapDot" class="tl-dot tl-green"></span>
            <span class="nav-stats" id="navStats"></span>
            <div class="dp-popover" id="dpPopover">
              <div class="dp-header"><button class="dp-nav" id="dpPrevM">‹</button><span class="dp-month" id="dpMonth"></span><button class="dp-nav" id="dpNextM">›</button></div>
              <div class="dp-weekdays"><span>lun</span><span>mar</span><span>mie</span><span>jue</span><span>vie</span><span>sab</span><span>dom</span></div>
              <div class="dp-days" id="dpDays"></div>
            </div>
          </div>
          <div class="main-content">
            <div class="sidebar">
              <div class="sidebar-body">
                <div class="sb-title">Cliente <span id="clienteDot"></span></div>
                <input type="text" class="sb-input" placeholder="Cargando clientes..." id="searchCliente" disabled/>
                <div class="client-results" id="clienteResultados"></div>
                <button class="new-client-btn" id="btnNuevoCliente">+ Cliente nuevo</button>
                <div class="new-client-form" id="formNuevoCliente">
                  <input type="text" placeholder="Nombre *" id="newNombre"/>
                  <input type="text" placeholder="Apellido" id="newApellido"/>
                  <input type="email" placeholder="Email *" id="newEmail"/>
                  <input type="tel" placeholder="Telefono" id="newTelefono"/>
                  <button class="new-client-btn" id="btnConfirmarNuevo" style="border-style:solid;color:#2a9d54;border-color:#2a9d54;">Usar estos datos</button>
                </div>
                <div class="client-info" id="clienteInfo"><div class="ci-label">Cliente seleccionado <button id="btnEditCliente" style="float:right;background:none;border:none;cursor:pointer;font-size:11px;color:#c9a44a;padding:0;" title="Editar cliente">✏️</button></div><div class="ci-name" id="infoNombre"></div><div class="ci-sub" id="infoDetalle"></div></div>
                <div class="new-client-form" id="formEditCliente">
                  <div style="font-size:9px;font-weight:600;color:#c9a44a;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">Editar cliente</div>
                  <input type="text" placeholder="Nombre *" id="editNombre"/>
                  <input type="text" placeholder="Apellido" id="editApellido"/>
                  <input type="email" placeholder="Email" id="editEmail"/>
                  <input type="tel" placeholder="Telefono" id="editTelefono"/>
                  <div style="display:flex;gap:4px;">
                    <button class="new-client-btn" id="btnCancelEdit" style="flex:1;border-style:solid;color:#6b7280;border-color:#e2e5ea;">Cancelar</button>
                    <button class="new-client-btn" id="btnGuardarEdit" style="flex:1;border-style:solid;color:#2a9d54;border-color:#2a9d54;">Guardar</button>
                  </div>
                </div>
                <div id="clienteWarning"></div>
                <div class="sb-title" style="margin-top:14px;">Servicio</div>
                ${svcHTML}
                <div class="config-section" id="cfgColoracion">
                  <div class="cfg-label">Peinado</div><select class="sb-select" id="cfgPeinado"><option value="SECADO">Solo secado</option><option value="S">Peinado S</option><option value="M">Peinado M</option><option value="L">Peinado L</option><option value="XL">Peinado XL</option></select>
                  <div class="cfg-label" style="margin-top:6px;">Tratamiento</div><select class="sb-select" id="cfgTratamiento"><option value="">Sin tratamiento</option><option value="KERASTASE">Kerastase</option><option value="HAIRTIMES">HairTimes</option><option value="MATIZ">Matiz</option></select>
                  <label class="cfg-check" style="margin-top:6px;"><input type="checkbox" id="chkCorteColor"/>Corte</label>
                  <label class="cfg-check" id="wrapTinteCompleto"><input type="checkbox" id="chkTinteCompleto"/>Tinte completo</label>
                </div>
                <div class="config-section" id="cfgTratSection">
                  <div class="cfg-label">Longitud pelo</div><select class="sb-select" id="cfgLongitud"><option value="M">Medio (M)</option><option value="L">Largo (L)</option><option value="XL">Extra Largo (XL)</option></select>
                  <label class="cfg-check" style="margin-top:6px;"><input type="checkbox" id="chkCorteTrat"/>Corte</label>
                </div>
                <div class="config-section" id="cfgSimple" style="border-color:#e2e5ea;background:#f7f8fa;">
                  <div id="simpleInfo" class="simple-info" style="display:none;"><span id="simpleDur"></span><span class="si-price" id="simplePrice"></span></div>
                  <div id="variantPicker" style="display:none;"></div>
                </div>
                <div class="sb-status waiting" id="sbStatus">Arrastra para bloquear</div>
              </div>
            </div>
            <div class="cal-wrap" id="calWrap"><div id="calContent"><div class="cal-loading"><div class="spinner"></div>Cargando...</div></div></div>
          </div>
          <div class="cierre-panel" id="cierrePanel"><div class="cierre-header"><span class="cierre-title">💰 Cierre del día</span><button class="cierre-close" id="btnCerrarCierre">✕</button></div><div class="cierre-grid" id="cierreGrid"></div></div>
        </div>
        <div class="settings-overlay" id="settingsOverlay"></div>
        <div class="settings-panel" id="settingsPanel">
          <div class="settings-header"><span class="settings-title">Ajustes</span><div style="display:flex;gap:4px;"><button class="modal-btn-cancel" id="btnResetSettings" style="font-size:12px;border:none;color:#c9a44a;background:none;cursor:pointer;">Restablecer</button><button class="modal-close" id="btnCloseSettings">✕</button></div></div>
          <div class="settings-body">
            <div class="settings-section"><div class="settings-section-title">Espaciado</div><div class="slider-row"><label>Compacto</label><input type="range" id="sliderSpacing" min="28" max="72" value="48"><label>Amplio</label></div></div>
            <div class="settings-section"><div class="settings-section-title">Titulo cita</div><div class="option-group"><label class="option-item"><input type="radio" name="titleMode" value="servicio" checked>Servicio</label><label class="option-item"><input type="radio" name="titleMode" value="cliente">Cliente</label></div></div>
            <div class="settings-section"><div class="settings-section-title">Intervalo</div><div class="option-group"><label class="option-item"><input type="radio" name="interval" value="30" checked>30 min</label><label class="option-item"><input type="radio" name="interval" value="15">15 min</label><label class="option-item"><input type="radio" name="interval" value="10">10 min</label></div></div>
            <div class="settings-section"><div class="settings-section-title">Personal</div><div id="staffConfigList"></div></div>
          </div>
        </div>
        <div class="color-popover" id="colorPicker"><div class="color-grid" id="colorGrid"></div></div>
        <div class="booking-overlay" id="bookingOverlay">
          <div class="booking-card"><div class="booking-card-header"><span style="font-size:15px;font-weight:700;">Confirmar reserva</span><button class="modal-close" id="btnCloseBooking">✕</button></div><div class="booking-card-body" id="bookingBody"></div><div class="booking-card-footer"><button class="btn-book-cancel" id="btnBookingCancel">Cancelar</button><button class="btn-book" id="btnBookingConfirm">RESERVAR</button></div></div>
        </div>
        <div class="booking-overlay" id="blockOverlay">
          <div class="booking-card"><div class="booking-card-header"><span style="font-size:15px;font-weight:700;">Crear bloqueo</span><button class="modal-close" id="btnCloseBlock">✕</button></div><div class="booking-card-body" id="blockBody"></div><div class="booking-card-footer"><button class="btn-book-cancel" id="btnBlockCancel">Cancelar</button><button class="btn-book" id="btnBlockConfirm" style="background:#475569;">BLOQUEAR</button></div></div>
        </div>
        <div class="toast" id="toast"></div>`;
    }
    _bindEvents() {
      const R = this.shadowRoot;
      R.getElementById('btnToday').addEventListener('click', () => this._setDate(todayISO()));
      R.getElementById('btnPrev').addEventListener('click', () => this._setDate(addDays(this._fecha,-1)));
      R.getElementById('btnNext').addEventListener('click', () => this._setDate(addDays(this._fecha,1)));
      R.getElementById('btnRefresh').addEventListener('click', () => this._reload());
      R.getElementById('btnSettings').addEventListener('click', () => this._openSettings());
      R.getElementById('settingsOverlay').addEventListener('click', () => this._closeSettings());
      R.getElementById('btnCloseSettings').addEventListener('click', () => this._closeSettings());
      R.getElementById('btnResetSettings').addEventListener('click', () => { this._settings={rowHeight:48,titleMode:'servicio',interval:30,staffConfig:{}}; this._initStaffConfig(); this._applySettingsUI(); this._renderStaffSettings(); this._renderCalendar(); this._saveSettings(); });
      R.getElementById('sliderSpacing').addEventListener('input', e => { this._settings.rowHeight=parseInt(e.target.value); this._saveSettings(); this._renderCalendar(); });
      R.querySelectorAll('input[name="titleMode"]').forEach(r => r.addEventListener('change', e => { this._settings.titleMode=e.target.value; this._saveSettings(); this._renderCalendar(); }));
      R.querySelectorAll('input[name="interval"]').forEach(r => r.addEventListener('change', e => { this._settings.interval=parseInt(e.target.value); this._saveSettings(); this._renderCalendar(); }));
      R.getElementById('btnArqueo').addEventListener('click', () => this._openArqueo());
      R.getElementById('btnCierre').addEventListener('click', () => this._toggleCierre());
      R.getElementById('btnCerrarCierre').addEventListener('click', () => this._closeCierre());
      // Datepicker
      R.getElementById('navDate').addEventListener('click', (e) => { e.stopPropagation(); this._openDatePicker(); });
      R.getElementById('dpPrevM').addEventListener('click', (e) => { e.stopPropagation(); this._dpMonth--; if(this._dpMonth<1){this._dpMonth=12;this._dpYear--;} this._renderDatePicker(); });
      R.getElementById('dpNextM').addEventListener('click', (e) => { e.stopPropagation(); this._dpMonth++; if(this._dpMonth>12){this._dpMonth=1;this._dpYear++;} this._renderDatePicker(); });
      this.shadowRoot.addEventListener('click', (e) => { if(!e.target.closest('.dp-popover')&&!e.target.closest('.nav-date')) this._closeDatePicker(); });
      // Booking overlay
      R.getElementById('btnCloseBooking').addEventListener('click', () => this._closeBookingOverlay());
      R.getElementById('btnBookingCancel').addEventListener('click', () => this._closeBookingOverlay());
      R.getElementById('btnBookingConfirm').addEventListener('click', () => this._confirmarReserva());
      R.getElementById('bookingOverlay').addEventListener('click', e => { if(e.target.id==='bookingOverlay') this._closeBookingOverlay(); });
      // Block overlay
      R.getElementById('btnCloseBlock').addEventListener('click', () => this._closeBlockOverlay());
      R.getElementById('btnBlockCancel').addEventListener('click', () => this._closeBlockOverlay());
      R.getElementById('btnBlockConfirm').addEventListener('click', () => this._confirmarBloqueo());
      R.getElementById('blockOverlay').addEventListener('click', e => { if(e.target.id==='blockOverlay') this._closeBlockOverlay(); });
      // Color picker
      this._initColorPicker();
      // Sidebar client
      this._wireClientEvents();
      // Sidebar services
      this._wireServiceEvents();
    }
    _saveSettings() { clearTimeout(this._saveTimer); this._saveTimer=setTimeout(()=>this._sendToPage('save-settings',{settings:this._settings}),800); }
    // ═══════════════════════════════════════════════════
    // RENDER CALENDAR
    // ═══════════════════════════════════════════════════
    _renderCalendar() {
      const R=this.shadowRoot, wrap=R.getElementById('calContent'), visible=this._getVisibleStaff();
      const interval=this._settings.interval||30, rowH=this._settings.rowHeight||48;
      if(!visible.length){wrap.innerHTML='<div class="cal-loading">Sin empleados visibles</div>';return;}
      const totalMin=(CAL_END-CAL_START)*60, totalRows=totalMin/interval, pxPerMin=rowH/interval;
      const titleMode=this._settings.titleMode||'servicio';
      const sidebarReady=this._cliente&&this._servicioId;
      const colTpl=`52px ${visible.map(()=>'1fr').join(' ')}`;
      let html=`<div class="cal-header" style="grid-template-columns:${colTpl}"><div class="cal-hcell"></div>`;
      for(const s of visible){const c=this._staffColor(s.id);html+=`<div class="cal-hcell"><span class="staff-dot" style="background:${c}"></span>${esc(s.name)}</div>`;}
      html+=`</div><div class="cal-body" style="position:relative;height:${totalRows*rowH}px;">`;
      // Grid lines + clickable cells
      for(let i=0;i<totalRows;i++){
        const mins=CAL_START*60+i*interval,hh=String(Math.floor(mins/60)).padStart(2,'0'),mm=String(mins%60).padStart(2,'0'),isH=mins%60===0,top=i*rowH,bdr=isH?'#e2e5ea':'#eff1f4';
        html+=`<div style="position:absolute;top:${top}px;left:0;width:52px;height:${rowH}px;display:flex;align-items:flex-start;justify-content:flex-end;padding:2px 6px 0 0;font-size:10px;color:#9ca3af;background:#fff;z-index:3;border-right:1px solid #e2e5ea;border-bottom:1px solid ${bdr}">${isH?hh+':'+mm:''}</div>`;
        for(let c=0;c<visible.length;c++){
          const left=`calc(52px + (100% - 52px) / ${visible.length} * ${c})`,width=`calc((100% - 52px) / ${visible.length})`;
          html+=`<div style="position:absolute;top:${top}px;left:${left};width:${width};height:${rowH}px;border-bottom:1px solid ${bdr};border-right:1px solid #eff1f4;"></div>`;
          const cellCls=sidebarReady?'sb-ready':'sb-block';
          html+=`<div class="cal-cell ${cellCls}" style="position:absolute;top:${top}px;left:${left};width:${width};height:${rowH}px;" data-staff="${visible[c].id}" data-staff-idx="${c}" data-time="${hh}:${mm}"></div>`;
        }
      }
      // Booking blocks
      const colGroups={};
      for(const r of this._reservas){const ci=visible.findIndex(s=>s.id===r.resourceId);if(ci<0)continue;const sm=parseMin(r.startTime);if(sm===null)continue;if(!colGroups[ci])colGroups[ci]=[];colGroups[ci].push({...r,_sm:sm-CAL_START*60,_em:sm-CAL_START*60+(r.durMin||15),_ci:ci});}
      for(const ci in colGroups){const items=colGroups[ci];items.sort((a,b)=>a._sm-b._sm);for(let i=0;i<items.length;i++){let sub=0;const placed=items.slice(0,i).filter(p=>p._em>items[i]._sm);const used=new Set(placed.map(p=>p._sub));while(used.has(sub))sub++;items[i]._sub=sub;}const cls=[];let cur=[];for(let i=0;i<items.length;i++){if(!cur.length)cur.push(items[i]);else{const cEnd=Math.max(...cur.map(c=>c._em));if(items[i]._sm<cEnd)cur.push(items[i]);else{cls.push([...cur]);cur=[items[i]];}}}if(cur.length)cls.push(cur);for(const cl of cls){const mx=Math.max(...cl.map(c=>c._sub))+1;cl.forEach(c=>c._ts=mx);}}
      const allItems=Object.values(colGroups).flat();
      for(const r of allItems){
        const ci=r._ci,sub=r._sub||0,total=r._ts||1;
        const topPx=r._sm*pxPerMin,heightPx=Math.max((r._em-r._sm)*pxPerMin,18);
        const colL=`(52px + (100% - 52px) / ${visible.length} * ${ci})`,colW=`((100% - 52px) / ${visible.length})`,subW=`(${colW} / ${total})`;
        const left=`calc(${colL} + ${subW} * ${sub} + 2px)`,width=`calc(${subW} - 4px)`;
        const color=this._staffColor(r.resourceId);
        const isBloqueo=r.tipo==='bloqueo',isExt=r.tipo==='extension',notes=r.notes||'';
        const isManualBlock=!r.tipo?.includes('booking')&&!r.tipo?.includes('externo')&&(notes.includes('BLOQUEO')||(isExt&&!notes.replace('EXTENSIÓN:','').trim()));
        const isBooking=r.tipo==='booking';
        // v2.1.1: Borde izquierdo verde (pagado) / naranja (pendiente)
        let borderLeft='border-left-color:rgba(0,0,0,.2);';
        if(isBooking){const pk=this._findPack(r.bookingId);if(pk){borderLeft=Number(pk.serviciosPendientes||0)>0?'border-left-color:#d48a1a;border-left-width:4px;':'border-left-color:#2a9d54;border-left-width:4px;';}}
        let bgStyle;
        if(isBloqueo||isManualBlock)bgStyle=`background:repeating-linear-gradient(135deg,${color},${color} 4px,${hexDarken(color,20)} 4px,${hexDarken(color,20)} 8px);`;
        else if(isExt&&!isManualBlock)bgStyle=`background:repeating-linear-gradient(135deg,${hexLighten(color,25)},${hexLighten(color,25)} 5px,${hexLighten(color,10)} 5px,${hexLighten(color,10)} 10px);`;
        else bgStyle=`background:${color};`;
        let title=isManualBlock?'BLOQUEO':isBloqueo?'Bloqueado':(isExt&&!isManualBlock)?'EXTENSIÓN':(titleMode==='cliente'?r.cliente:r.servicio);
        let subtitle=isManualBlock||isBloqueo||(isExt&&!isManualBlock)?'':(titleMode==='cliente'?r.servicio:r.cliente);
        const blockCls=(isBloqueo||isManualBlock||isExt)?'bloqueo':'';
        const isDraggable=isBooking&&!isBloqueo&&!isManualBlock&&!isExt;
        const dataJson=escAttr(JSON.stringify({bookingId:r.bookingId,startTime:r.startTime,endTime:r.endTime,durMin:r.durMin,servicio:r.servicio,cliente:r.cliente,clientPhone:r.clientPhone,clientEmail:r.clientEmail,resourceId:r.resourceId,status:r.status,notes:r.notes,tipo:r.tipo,precio:r.precio||0}));
        html+=`<div class="booking-block ${blockCls}" style="top:${topPx}px;height:${heightPx}px;left:${left};width:${width};${bgStyle}${borderLeft}" data-booking="${dataJson}" data-draggable="${isDraggable?1:0}" data-color="${color}">`;
        if(isExt&&!isManualBlock){html+=`<div class="ext-label">EXTENSIÓN · ${r.durMin} min</div><button class="ext-delete" data-session="${r.bookingId}">✕</button>`;}
        else if(isManualBlock){html+=`<div class="ext-label">BLOQUEO · ${r.durMin} min</div><button class="ext-delete" data-session="${r.bookingId}">✕</button>`;}
        else{
          html+=`<div class="booking-title">${esc(title)}</div>`;
          if(heightPx>28)html+=`<div class="booking-sub">${esc(subtitle)}</div>`;
          if(heightPx>42)html+=`<div class="booking-time">${r.startTime} - ${r.endTime}</div>`;
          if(isBooking&&heightPx>20)html+=`<div class="resize-handle" data-bid="${r.bookingId}" data-end="${r.endTime}" data-res="${r.resourceId}" data-ppm="${pxPerMin}" data-top="${topPx}" data-h="${heightPx}" data-color="${color}"></div>`;
        }
        html+=`</div>`;
      }
      // Now line
      if(this._fecha===todayISO()){const nm=madridNow()-CAL_START*60;if(nm>=0&&nm<totalMin)html+=`<div class="now-line" style="top:${nm*pxPerMin}px;left:52px;"></div>`;}
      html+=`</div>`;
      wrap.innerHTML=html;
      // Scroll
      const calW=R.getElementById('calWrap');
      if(this._fecha===todayISO()){const nm=madridNow()-CAL_START*60;calW.scrollTop=Math.max(0,nm*pxPerMin-120);}
      else if(this._reservas.length){const f=parseMin(this._reservas[0].startTime);if(f!==null)calW.scrollTop=Math.max(0,(f-CAL_START*60)*pxPerMin-40);}
      // Bind booking clicks
      wrap.querySelectorAll('.booking-block:not(.bloqueo)').forEach(el=>el.addEventListener('click',()=>{if(!this._suppressClick)this._onBookingClick(el);}));
      wrap.querySelectorAll('.ext-delete').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();const sid=b.dataset.session;if(sid&&confirm('¿Eliminar?'))this._sendToPage('eliminarExtension',{sessionId:sid});}));
      // Cell clicks (booking from sidebar)
      wrap.querySelectorAll('.cal-cell').forEach(el=>el.addEventListener('click',()=>{if(this._suppressClick){this._suppressClick=false;return;}this._onCellClick(el);}));
      // Init drag
      this._initDrag();
    }
    // ═══════════════════════════════════════════════════
    // DRAG & DROP
    // ═══════════════════════════════════════════════════
    _initDrag() {
      const R=this.shadowRoot, calBody=R.querySelector('.cal-body');
      if(!calBody) return;
      calBody.addEventListener('mousedown', e => {
        // Resize handle
        const handle=e.target.closest('.resize-handle');
        if(handle){e.preventDefault();e.stopPropagation();const block=handle.closest('.booking-block');if(!block)return;const ppm=parseFloat(handle.dataset.ppm),bTop=parseFloat(handle.dataset.top),bH=parseFloat(handle.dataset.h),bBot=bTop+bH,color=handle.dataset.color;
          this._dragPreview=document.createElement('div');this._dragPreview.className='drag-preview';this._dragPreview.style.cssText=`left:${block.style.left};width:${block.style.width};top:${bBot}px;height:0px;background:repeating-linear-gradient(135deg,${hexLighten(color,25)},${hexLighten(color,25)} 5px,${hexLighten(color,10)} 5px,${hexLighten(color,10)} 10px);`;
          calBody.appendChild(this._dragPreview);
          this._drag={bid:handle.dataset.bid,endTime:handle.dataset.end,res:handle.dataset.res,color,ppm,bBot,scrollTop:R.getElementById('calWrap').scrollTop,startY:e.clientY,extMin:0};return;}
        // Drag booking
        const block=e.target.closest('.booking-block');
        if(block&&block.dataset.draggable==='1'&&!e.target.closest('.ext-delete')){e.preventDefault();const d=JSON.parse(block.dataset.booking);this._bookingDrag={el:block,bookingId:d.bookingId,servicio:d.servicio,cliente:d.cliente,color:block.dataset.color,startX:e.clientX,startY:e.clientY,isDragging:false};return;}
        // Block drag (empty cell)
        const cell=e.target.closest('.cal-cell');
        if(cell&&!(this._cliente&&this._servicioId)){e.preventDefault();const sid=cell.dataset.staff,time=cell.dataset.time,vis=this._getVisibleStaff(),interval=this._settings.interval||30,rowH=this._settings.rowHeight||48,ppm=rowH/interval,ci=vis.findIndex(s=>s.id===sid);if(ci<0)return;
          const[hh,mm]=time.split(':').map(Number),sm=hh*60+mm-CAL_START*60,topPx=sm*ppm;
          const colL=`calc(52px + (100% - 52px) / ${vis.length} * ${ci} + 2px)`,colW=`calc((100% - 52px) / ${vis.length} - 4px)`;
          this._blockDragPreview=document.createElement('div');this._blockDragPreview.className='drag-preview block-preview';this._blockDragPreview.style.cssText=`left:${colL};width:${colW};top:${topPx}px;height:0px;background:repeating-linear-gradient(135deg,#d1d5db,#d1d5db 4px,#b0b5be 4px,#b0b5be 8px);`;
          calBody.appendChild(this._blockDragPreview);
          this._blockDrag={staffId:sid,startTime:time,ppm,topPx,scrollTop:R.getElementById('calWrap').scrollTop,startY:e.clientY,blockMin:0,smTotal:hh*60+mm};
          this._suppressClick=true;}
      });
      document.addEventListener('mousemove', e => {
        if(this._drag&&this._dragPreview){const scrollD=this.shadowRoot.getElementById('calWrap').scrollTop-this._drag.scrollTop;const dy=(e.clientY-this._drag.startY)+scrollD;const ext=Math.max(0,Math.round(dy/this._drag.ppm/5)*5);this._drag.extMin=ext;this._dragPreview.style.height=(ext*this._drag.ppm)+'px';this._dragPreview.textContent=ext>0?`+${ext} min`:'';}
        if(this._bookingDrag){const dx=e.clientX-this._bookingDrag.startX,dy=e.clientY-this._bookingDrag.startY;if(!this._bookingDrag.isDragging&&(Math.abs(dx)>DRAG_THRESHOLD||Math.abs(dy)>DRAG_THRESHOLD)){this._bookingDrag.isDragging=true;this._bookingDrag.el.classList.add('dragging');this._suppressClick=true;const g=document.createElement('div');g.className='drag-ghost';g.style.background=this._bookingDrag.color;g.innerHTML=`<div class="g-name">${esc(this._bookingDrag.cliente)}</div><div class="g-svc">${esc(this._bookingDrag.servicio)}</div>`;document.body.appendChild(g);this._bookingDragGhost=g;}if(this._bookingDrag.isDragging&&this._bookingDragGhost){this._bookingDragGhost.style.left=(e.clientX+10)+'px';this._bookingDragGhost.style.top=(e.clientY-10)+'px';this.shadowRoot.querySelectorAll('.cal-cell.drop-target').forEach(c=>c.classList.remove('drop-target'));this._bookingDragGhost.style.display='none';const under=document.elementFromPoint(e.clientX,e.clientY);this._bookingDragGhost.style.display='';const target=under?.closest?.('.cal-cell')||this.shadowRoot.querySelector('.cal-cell:hover');/* Shadow DOM limits elementFromPoint */}}
        if(this._blockDrag&&this._blockDragPreview){const scrollD=this.shadowRoot.getElementById('calWrap').scrollTop-this._blockDrag.scrollTop;const dy=(e.clientY-this._blockDrag.startY)+scrollD;const bm=Math.max(5,Math.round(dy/this._blockDrag.ppm/5)*5);this._blockDrag.blockMin=bm;this._blockDragPreview.style.height=(bm*this._blockDrag.ppm)+'px';this._blockDragPreview.textContent=bm>=5?`Bloqueo ${bm} min`:'';}
      });
      document.addEventListener('mouseup', e => {
        if(this._drag){const ext=this._drag.extMin;if(this._dragPreview?.parentNode)this._dragPreview.parentNode.removeChild(this._dragPreview);this._dragPreview=null;if(ext>=5){this._toast(`Extensión +${ext} min...`);this._sendToPage('crearExtension',{fecha:this._fecha,horaInicio:this._drag.endTime,duracionMin:ext,resourceId:this._drag.res,bookingId:this._drag.bid});}this._drag=null;return;}
        if(this._bookingDrag){const bd=this._bookingDrag;this._bookingDrag=null;bd.el.classList.remove('dragging');this.shadowRoot.querySelectorAll('.cal-cell.drop-target').forEach(c=>c.classList.remove('drop-target'));if(!bd.isDragging){if(this._bookingDragGhost){this._bookingDragGhost.remove();this._bookingDragGhost=null;}setTimeout(()=>{this._suppressClick=false;},50);return;}if(this._bookingDragGhost){this._bookingDragGhost.style.display='none';const under=document.elementFromPoint(e.clientX,e.clientY);this._bookingDragGhost.remove();this._bookingDragGhost=null;/* In shadow DOM, elementFromPoint may not find shadow children directly. Fallback: use composed path or coordinates */const cells=Array.from(this.shadowRoot.querySelectorAll('.cal-cell'));let targetCell=null;for(const c of cells){const r=c.getBoundingClientRect();if(e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom){targetCell=c;break;}}if(targetCell){const nsid=targetCell.dataset.staff,rect=targetCell.getBoundingClientRect(),yIn=e.clientY-rect.top,interval=this._settings.interval||30,frac=Math.max(0,Math.min(1,yIn/rect.height)),[bH,bM]=targetCell.dataset.time.split(':').map(Number),raw=bH*60+bM+Math.floor(frac*interval),snapped=Math.round(raw/5)*5,newHH=String(Math.floor(snapped/60)).padStart(2,'0'),newMM=String(snapped%60).padStart(2,'0');this._toast(`Moviendo a ${this._staffName(nsid)} ${newHH}:${newMM}...`);this._sendToPage('moverBooking',{bookingId:bd.bookingId,nuevaFechaISO:this._fecha,nuevaHoraHHmm:`${newHH}:${newMM}`,nuevoStaffId:nsid});}}setTimeout(()=>{this._suppressClick=false;},100);return;}
        if(this._blockDrag){const bm=this._blockDrag.blockMin,sid=this._blockDrag.staffId,st=this._blockDrag.startTime,smT=this._blockDrag.smTotal;if(this._blockDragPreview?.parentNode)this._blockDragPreview.parentNode.removeChild(this._blockDragPreview);this._blockDragPreview=null;if(bm>=5)this._openBlockPopup(sid,st,bm,smT);this._blockDrag=null;setTimeout(()=>{this._suppressClick=false;},50);return;}
      });
    }
    // ═══════════════════════════════════════════════════
    // BOOKING CLICK
    // ═══════════════════════════════════════════════════
    _onBookingClick(el) {
      const data=JSON.parse(el.dataset.booking);
      const pack=this._findPack(data.bookingId);
      if(pack) this._showActionModal(pack); else this._showInfoPopup(data);
    }
    _showInfoPopup(data) {
      const color=this._staffColor(data.resourceId),name=this._staffName(data.resourceId);
      const ov=document.createElement('div');ov.className='popup-overlay';
      ov.innerHTML=`<div class="popup-card"><div class="popup-bar" style="background:${color}"></div><div class="popup-header"><div><div class="popup-svc">${esc(data.servicio||'Bloqueado')}</div><span class="popup-status ${data.status||''}">${esc(data.status||'')}</span></div><button class="modal-close" data-close>✕</button></div><div class="popup-body"><div class="popup-row"><div class="popup-label">Horario</div><div class="popup-value">${data.startTime} – ${data.endTime} (${data.durMin} min)</div></div><div class="popup-row"><div class="popup-label">Empleado</div><div class="popup-value"><span class="staff-dot" style="background:${color};display:inline-block;vertical-align:middle;margin-right:4px"></span>${esc(name)}</div></div>${data.precio>0?`<div class="popup-row"><div class="popup-label">Precio</div><div class="popup-value">${data.precio}€</div></div>`:''}<div class="popup-row"><div class="popup-label">Cliente</div><div class="popup-value">${esc(data.cliente||'Sin cliente')}</div></div>${data.clientEmail?`<div class="popup-row"><div class="popup-label">Email</div><div class="popup-value">${esc(data.clientEmail)}</div></div>`:''}</div></div>`;
      this.shadowRoot.appendChild(ov);
      ov.addEventListener('click',e=>{if(e.target===ov||e.target.closest('[data-close]'))ov.remove();});
    }
    // ═══════════════════════════════════════════════════
    // ACTION MODAL (checkout)
    // ═══════════════════════════════════════════════════
    _showActionModal(pack) {
      const nombre=pack.contactName||'Sin nombre',hora=(pack.horaInicio&&pack.horaFin)?`${pack.horaInicio}–${pack.horaFin}`:(pack.horaInicio||'—');
      const staffNames=Array.isArray(pack.staffNames)&&pack.staffNames.length?pack.staffNames:[(pack.servicios?.[0]?.staffName||'—')];
      const staffDisplay=staffNames.map(n=>n.toUpperCase()).join(' · ');
      const staffColor=this._staffColor(pack.servicios?.[0]?.staffId||'');
      const servicios=pack.servicios||[],isPending=Number(pack.serviciosPendientes||0)>0,totalPack=Number(pack.totalPack||0);
      const tienePromo=pack.tienePromo||false,descTotal=Number(pack.descuentoTotal||0);
      const esRecepcion=pack.esRecepcion||false;
      const promoInfo=pack.promoInfo||'';
      const pendIds=pack.bookingIdsPendientes||[],allIds=pack.bookingIds||pendIds;
      // Promo banner
      const promoBanner=tienePromo&&promoInfo?`<div style="background:linear-gradient(135deg,#FF6B6B 0%,#FFE66D 50%,#4ECDC4 100%);color:#1a1a2e;padding:6px 10px;margin:-20px -24px 12px;text-align:center;font-weight:700;font-size:11px;border-radius:10px 10px 0 0;">${esc(promoInfo)} <span style="background:rgba(255,255,255,.85);color:#d63031;padding:1px 6px;border-radius:10px;font-weight:800;font-size:10px;margin-left:4px;">-${descTotal}€</span></div>`:'';
      // Recepción tag
      const recepTag=esRecepcion?'<span style="display:inline-flex;align-items:center;gap:3px;background:rgba(79,70,229,.1);color:#4f46e5;padding:2px 6px;border-radius:4px;font-size:9px;font-weight:700;text-transform:uppercase;margin-left:6px;">📞 RECEPCIÓN</span>':'';
      let svcHTML='';for(const s of servicios){const p=Number(s.precio||0),d=Number(s.descuento||0),pf=Number(s.precioFinal??p);let pr=eur(p);if(d>0)pr=`<s style="color:#9ca3af">${eur(p)}</s> <span style="color:#e85454">${eur(pf)}</span>`;const removeBtn=(isPending&&s.bookingId&&servicios.length>1)?` <button data-action="removeSvc" data-remove-bid="${s.bookingId}" data-remove-name="${escAttr(s.serviceName||'')}" style="background:none;border:none;color:#d93636;cursor:pointer;font-weight:700;font-size:13px;opacity:.6;" title="Quitar servicio">✕</button>`:'';svcHTML+=`<div class="modal-svc-line"><span>${esc(s.serviceName||'Servicio')}</span><span>${pr}${removeBtn}</span></div>`;}
      if(pack.extra&&pack.extra.importe>0)svcHTML+=`<div class="modal-svc-line" style="color:#d97706"><span>✏️ ${esc(pack.extra.descripcion||'Extra')}</span><span>+${eur(pack.extra.importe)} <button data-action="deleteExtra" style="background:none;border:none;color:#d93636;cursor:pointer;font-weight:700;font-size:13px;" title="Eliminar extra">✕</button></span></div>`;
      let totalHTML=`<span>TOTAL</span><span>${eur(totalPack)}</span>`;
      if(tienePromo&&descTotal>0)totalHTML=`<span>TOTAL</span><span><s style="color:#9ca3af;margin-right:4px">${eur(totalPack+descTotal)}</s><span style="color:#e85454;font-weight:800">${eur(totalPack)}</span> <span style="background:linear-gradient(135deg,#00b894,#00cec9);color:#fff;padding:1px 6px;border-radius:8px;font-size:9px;font-weight:700;">-${descTotal}€</span></span>`;
      let payHTML='';
      if(isPending&&pendIds.length)payHTML=`<div class="pay-row"><button class="btn-pay btn-cash" data-method="Efectivo">EFECTIVO</button><button class="btn-pay btn-card" data-method="Tarjeta">TARJETA</button><button class="btn-pay btn-bizum" data-method="Bizum">BIZUM</button><button class="btn-pay btn-mixto" data-method="Mixto">MIXTO</button><button class="btn-cancel-booking" data-action="delete">🗑️ CANCELAR</button></div>`;
      else payHTML=`<div style="color:#2a9d54;font-size:12px;font-weight:600;margin-top:6px;">✅ PAGADO</div><div style="display:flex;gap:6px;margin-top:4px;align-items:center;"><button class="btn-reschedule" style="color:#2563eb;" data-action="invoice">📄 FACTURA</button><button class="btn-cancel-booking" data-action="delete">🗑️ ELIMINAR</button></div>`;
      const hasBookings=servicios.some(s=>s.bookingId);
      const hasExtra=pack.extra&&pack.extra.importe>0;
      // v2.0.5: Warning ficha incompleta
      const nameParts=(nombre||'').trim().split(/\s+/);const modalApellido=nameParts.length>1?nameParts.slice(1).join(' '):'';
      const modalWarns=checkClienteIncompleto({email:pack.email,apellido:modalApellido,telefono:pack.contactPhone});
      const modalWarnHTML=modalWarns.length?warnHTML(modalWarns):'';
      const ov=document.createElement('div');ov.className='modal-overlay';ov.id='actionModal';
      ov.innerHTML=`<div class="modal-box"${tienePromo?' style="border:1px solid rgba(255,230,109,.35);"':''}>${promoBanner}<div class="modal-header"><div><div class="modal-staff" style="color:${staffColor}">${esc(staffDisplay)}${recepTag}</div><div class="modal-name">${esc(nombre)}</div></div><div style="display:flex;gap:8px;align-items:flex-start;"><span class="pill ${isPending?'pill-pending':'pill-paid'}">${isPending?'PENDIENTE':'PAGADO'}</span><button class="modal-close" data-close>✕</button></div></div>${modalWarnHTML}<div class="modal-time">${hora}</div>${pack.contactPhone||pack.email?`<div style="font-size:11px;color:#6b7280;margin:4px 0 8px;line-height:1.5;">${pack.contactPhone?'📞 '+esc(pack.contactPhone):''}${pack.contactPhone&&pack.email?' · ':''}${pack.email?'✉ '+esc(pack.email):''}</div>`:''}<div class="modal-services">${svcHTML}</div><div class="modal-total">${totalHTML}</div>${payHTML}<button class="btn-add-svc" data-action="addSvc">➕ SERVICIO ADICIONAL</button><button class="btn-add-svc" data-action="addComplemento" style="border-color:rgba(147,51,234,.3);color:#9333ea;background:rgba(147,51,234,.08);">🔗 COMPLEMENTO</button>${(()=>{
        // v2.2.3 — REGLA ANTISÉPTICA: solo se permite venta de producto
        // cuando la fecha visualizada es HOY. Evita que ventas hechas en un
        // día de prueba se atribuyan a clientes equivocados, y simplifica
        // la lógica del cierre del día (servicios y productos coinciden en fecha).
        const esHoy = this._fecha === todayISO();
        if (!pack.contactId) return `<button class="btn-add-prod" disabled title="Identifica al cliente primero">🛍 PRODUCTO</button>`;
        if (!esHoy) return `<button class="btn-add-prod" disabled title="Solo se permite venta de productos en el día de la cita">🛍 PRODUCTO</button>`;
        return `<button class="btn-add-prod" data-action="addProducto">🛍 PRODUCTO</button>`;
      })()}${!hasExtra?`<button class="btn-extra" data-action="showExtra">✏️ EXTRA</button>`:`<button class="btn-extra" data-action="showExtra">✏️ EDITAR EXTRA</button>`} ${hasBookings?`<button class="btn-reschedule" data-action="reschedule">📅 CAMBIAR FECHA</button>`:''}<div id="addSvcSlot"></div><div id="complementoSlot"></div><div id="productoSlot"></div><div id="extraSlot"></div><div style="margin-top:10px;text-align:right;"><button class="modal-btn modal-btn-cancel" data-close>Cerrar</button></div></div>`;
      this.shadowRoot.appendChild(ov);
      ov.addEventListener('click',e=>{
        if(e.target===ov||e.target.closest('[data-close]'))ov.remove();
        const payBtn=e.target.closest('[data-method]');
        if(payBtn){const m=payBtn.dataset.method;if(m==='Mixto'){this._showMixtoModal(pendIds,pack,ov);return;}ov.querySelectorAll('.btn-pay').forEach(b=>{b.disabled=true;b.textContent='...';});this._sendToPage('checkout-pay',{bookingIds:pendIds,metodoPago:m});}
        const act=e.target.closest('[data-action]');
        if(act?.dataset.action==='delete'){ov.remove();this._showDeleteModal(allIds,nombre,servicios);}
        if(act?.dataset.action==='reschedule'){ov.remove();this._showRescheduleChoice(pack);}
        if(act?.dataset.action==='addSvc')this._toggleAddSvcPanel(ov,pack);
        if(act?.dataset.action==='addComplemento')this._toggleComplementoPanel(ov,pack);
        if(act?.dataset.action==='addProducto')this._toggleProductoPanel(ov,pack);
        if(act?.dataset.action==='showExtra')this._showExtraForm(ov,pack);
        if(act?.dataset.action==='removeSvc'){const bid=act.dataset.removeBid,sname=act.dataset.removeName;if(bid&&confirm(`¿Quitar "${sname}" de la reserva?`)){ov.remove();this._sendToPage('checkout-delete',{bookingIds:[bid]});this._toast(`Quitando ${sname}...`);}}
        if(act?.dataset.action==='deleteExtra'){const bid=(pack.servicios&&pack.servicios[0])?pack.servicios[0].bookingId:null;if(bid)this._sendToPage('checkout-removeExtra',{bookingId:bid,fechaISO:this._fecha});}
        if(act?.dataset.action==='invoice'){this._sendToPage('checkout-invoice',{contactId:pack.contactId||'',email:pack.email||'',contactName:pack.contactName||'',contactPhone:pack.contactPhone||'',servicios:pack.servicios||[],totalPack:pack.totalPack||0,descuentoTotal:pack.descuentoTotal||0,promoInfo:pack.promoInfo||'',metodoPago:'',fechaReserva:pack.servicios?.[0]?.startDate?.substring(0,10)||'',staff:pack.servicios?.[0]?.staffName||'',extra:pack.extra||null,packId:pack.packId||null});this._toast('Generando factura...');}
        const svcItem=e.target.closest('.add-svc-item');
        if(svcItem)this._doAddService(pack,svcItem.dataset.svcId,parseInt(svcItem.dataset.svcDur),svcItem.dataset.svcName,0);
        const compItem=e.target.closest('.comp-item');
        if(compItem)this._doAddService(pack,compItem.dataset.svcId,parseInt(compItem.dataset.svcDur),compItem.dataset.svcName,parseFloat(compItem.dataset.svcPrice));
      });
    }
    _toggleAddSvcPanel(ov,pack){
      // Cerrar complemento si está abierto
      const compSlot=ov.querySelector('#complementoSlot');if(compSlot)compSlot.innerHTML='';
      const slot=ov.querySelector('#addSvcSlot');if(slot.querySelector('.add-svc-panel')){slot.innerHTML='';return;}
      const psid=pack.servicios?.[0]?.staffId||'';let sh='<div style="display:flex;gap:6px;padding-bottom:8px;border-bottom:1px solid #e2e5ea;margin-bottom:8px;"><label style="font-size:11px;color:#9ca3af;">Staff:</label><select id="addSvcStaff" style="flex:1;padding:6px;border-radius:6px;border:1px solid #e2e5ea;font-size:12px;font-family:inherit;">';for(const s of STAFF_IDS)sh+=`<option value="${s.id}"${s.id===psid?' selected':''}>${s.name}</option>`;sh+='</select></div>';
      const groups={};for(const svc of SERVICIOS_ADICIONALES){if(!groups[svc.group])groups[svc.group]=[];groups[svc.group].push(svc);}
      // v2.2.8: dur desde catálogo (no hardcoded)
      let sh2='';for(const g in groups){sh2+=`<div class="add-svc-group">${g}</div>`;for(const s of groups[g]){const cat=this._catalogoPrecios[s.id]||{};const dur=cat.duration||'?';sh2+=`<div class="add-svc-item" data-svc-id="${s.id}" data-svc-dur="${dur}" data-svc-name="${s.name}"><span>${s.name}</span><span class="add-svc-dur">${dur} min</span></div>`;}}
      slot.innerHTML=`<div class="add-svc-panel">${sh}${sh2}</div>`;
    }
    _toggleComplementoPanel(ov,pack){
      // Cerrar servicio adicional si está abierto
      const svcSlot=ov.querySelector('#addSvcSlot');if(svcSlot)svcSlot.innerHTML='';
      const slot=ov.querySelector('#complementoSlot');if(slot.querySelector('.add-svc-panel')){slot.innerHTML='';return;}
      // Pedir complementos al backend (lee de SvMapeoServicios + catálogo)
      const mainSvc=(pack.servicios||[]).find(s=>s.precio>0)||(pack.servicios||[])[0];
      const existingIds=(pack.servicios||[]).map(s=>s.serviceId).filter(Boolean);
      this._pendingCompPack=pack;
      slot.innerHTML='<div class="add-svc-panel" style="border-color:rgba(147,51,234,.2);text-align:center;padding:16px;color:#9ca3af;font-size:11px;">Cargando complementos...</div>';
      this._sendToPage('getComplementos',{mainServiceId:mainSvc?.serviceId||'',mainServiceName:mainSvc?.serviceName||'',existingServiceIds:existingIds});
    }
    _renderComplementoPanel(complementos){
      const ov=this.shadowRoot.getElementById('actionModal');if(!ov)return;
      const slot=ov.querySelector('#complementoSlot');if(!slot)return;
      const pack=this._pendingCompPack;
      if(!complementos.length){slot.innerHTML='<div class="add-svc-panel" style="border-color:rgba(147,51,234,.2);text-align:center;padding:12px;color:#9333ea;font-size:11px;">No hay complementos disponibles para este servicio</div>';return;}
      const psid=pack?.servicios?.[0]?.staffId||'';
      let sh='<div style="display:flex;gap:6px;padding-bottom:8px;border-bottom:1px solid rgba(147,51,234,.2);margin-bottom:8px;"><label style="font-size:11px;color:#9333ea;">Staff:</label><select id="compStaff" style="flex:1;padding:6px;border-radius:6px;border:1px solid rgba(147,51,234,.3);font-size:12px;font-family:inherit;">';
      for(const s of STAFF_IDS)sh+=`<option value="${s.id}"${s.id===psid?' selected':''}>${s.name}</option>`;
      sh+='</select></div>';
      let sh2='';for(const c of complementos){
        sh2+=`<div class="comp-item" data-svc-id="${c.id}" data-svc-dur="${c.dur}" data-svc-name="${esc(c.name)}" data-svc-price="${c.price}" style="display:flex;justify-content:space-between;padding:5px 8px;border-radius:4px;cursor:pointer;font-size:11px;color:#6b7280;"><span>${esc(c.name)}</span><span style="font-size:10px;color:#9333ea;font-weight:600;">${c.dur}min · ${c.price}€</span></div>`;
      }
      slot.innerHTML=`<div class="add-svc-panel" style="border-color:rgba(147,51,234,.2);">${sh}${sh2}</div>`;
    }
    _doAddService(pack,svcId,dur,name,price=0){const ov=this.shadowRoot.getElementById('actionModal');const sel=ov?.querySelector('#addSvcStaff')||ov?.querySelector('#compStaff');const staffId=sel?sel.value:(pack.servicios?.[0]?.staffId||'');this._sendToPage('checkout-addService',{serviceId:svcId,durationMinutes:dur,serviceName:name,price,variantLabel:price>0?'Complemento':'Servicio Adicional',fechaISO:this._fecha,horaHHmm:pack.horaFin||pack.horaInicio||'12:00',staffId,contactId:pack.contactId||'',contactName:pack.contactName||''});this._toast(`Añadiendo ${name}...`);}
    // ═══════════════════════════════════════════════════
    // v2.2.0 — PANEL PRODUCTO (venta desde cita activa)
    // ═══════════════════════════════════════════════════
    _toggleProductoPanel(ov, pack) {
      // Mutuamente excluyente con los otros tres slots
      const svcSlot = ov.querySelector('#addSvcSlot'); if (svcSlot) svcSlot.innerHTML = '';
      const compSlot = ov.querySelector('#complementoSlot'); if (compSlot) compSlot.innerHTML = '';
      const extraSlot = ov.querySelector('#extraSlot'); if (extraSlot) extraSlot.innerHTML = '';
      const slot = ov.querySelector('#productoSlot'); if (!slot) return;
      // Toggle: si ya está abierto, cerrar y limpiar carrito
      if (slot.querySelector('.prod-panel')) {
        slot.innerHTML = '';
        this._productoCart = [];
        this._productoSearchQ = '';
        return;
      }
      // Sin contactId no se puede vender (la venta debe entrar al expediente)
      if (!pack.contactId) {
        this._toast('Identifica al cliente primero');
        return;
      }
      // FIX v2.2.3: doble check — solo se vende en el día de la cita
      if (this._fecha !== todayISO()) {
        this._toast('Las ventas solo se pueden registrar en el día de la cita');
        return;
      }
      // Reset de estado por venta
      this._pendingProdPack = pack;
      this._productoCart = [];
      this._productoMetodoPago = 'Efectivo';
      this._productoSearchQ = '';
      // Si no hay catálogo cacheado, pedirlo. Si ya está, render directo.
      if (!this._productosCache) {
        this._productoLoading = true;
        slot.innerHTML = '<div class="prod-panel"><div class="prod-empty">Cargando catálogo...</div></div>';
        this._sendToPage('getProductos', {});
      } else {
        this._renderProductoPanel();
      }
    }
    _renderProductoPanel() {
      const ov = this.shadowRoot.getElementById('actionModal'); if (!ov) return;
      const slot = ov.querySelector('#productoSlot'); if (!slot) return;
      const pack = this._pendingProdPack || {};
      const productos = this._productosCache || [];
      const q = String(this._productoSearchQ || '').toLowerCase().trim();
      // Filtrar por nombre/SKU si hay query
      const filtrados = q
        ? productos.filter(p => (p.name || '').toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q))
        : productos;
      // Lista de productos visible (limitada a 12 si no hay búsqueda activa)
      const visibles = q ? filtrados.slice(0, 30) : filtrados.slice(0, 12);
      let listaHTML = '';
      if (!productos.length) {
        listaHTML = '<div class="prod-empty">Catálogo vacío</div>';
      } else if (!filtrados.length) {
        listaHTML = `<div class="prod-empty">Sin resultados para "${esc(q)}"</div>`;
      } else {
        for (const p of visibles) {
          const enCarrito = (this._productoCart || []).some(c => c.productId === p.id);
          const sinStock = p.inStock === false;
          const cls = (sinStock && !enCarrito) ? 'prod-item disabled' : 'prod-item';
          const stockTag = sinStock ? '<span class="prod-item-stock">SIN STOCK</span>' : '';
          const enTag = enCarrito ? ' <span style="font-size:9px;color:#15803d;font-weight:700;">✓</span>' : '';
          listaHTML += `<div class="${cls}" data-prod-id="${escAttr(p.id)}" data-prod-name="${escAttr(p.name)}" data-prod-price="${p.price || 0}"><span class="prod-item-name">${esc(p.name)}${enTag}</span>${stockTag}<span class="prod-item-price">${eur(p.price || 0)}</span></div>`;
        }
        if (!q && filtrados.length > 12) {
          listaHTML += `<div class="prod-empty" style="font-size:10px;">... ${filtrados.length - 12} más. Usa el buscador.</div>`;
        }
      }
      // Carrito
      let cartHTML = '';
      let total = 0;
      if (this._productoCart.length) {
        cartHTML += '<div class="prod-cart"><div class="prod-cart-title">🛍 Carrito</div>';
        for (const c of this._productoCart) {
          const sub = (c.price || 0) * (c.quantity || 1);
          total += sub;
          cartHTML += `<div class="prod-cart-line"><span class="prod-cart-line-name">${esc(c.productName)}</span><button class="prod-qty-btn" data-prod-qty-dec="${escAttr(c.productId)}">−</button><span class="prod-qty-val">${c.quantity}</span><button class="prod-qty-btn" data-prod-qty-inc="${escAttr(c.productId)}">+</button><span class="prod-cart-line-sub">${eur(sub)}</span><button class="prod-cart-rm" data-prod-rm="${escAttr(c.productId)}" title="Quitar">✕</button></div>`;
        }
        cartHTML += `<div class="prod-total-row"><span>TOTAL</span><span class="prod-total-val">${eur(total)}</span></div>`;
      }
      // Métodos de pago
      const mp = this._productoMetodoPago || 'Efectivo';
      const payHTML = `<div class="prod-pay-row">
        <button class="prod-pay-btn ${mp==='Efectivo'?'selected':''}" data-prod-pay="Efectivo">EFECTIVO</button>
        <button class="prod-pay-btn ${mp==='Tarjeta'?'selected':''}" data-prod-pay="Tarjeta">TARJETA</button>
        <button class="prod-pay-btn ${mp==='Bizum'?'selected':''}" data-prod-pay="Bizum">BIZUM</button>
      </div>`;
      const confirmDisabled = this._productoCart.length === 0 ? 'disabled' : '';
      const confirmHTML = `<div class="prod-confirm-row">
        <button class="prod-cancel" data-prod-cancel>Cerrar</button>
        <button class="prod-confirm" data-prod-confirm ${confirmDisabled}>REGISTRAR VENTA${total>0?` · ${eur(total)}`:''}</button>
      </div>`;
      slot.innerHTML = `<div class="prod-panel">
        <input type="text" class="prod-search" id="prodSearch" placeholder="Buscar producto..." value="${escAttr(this._productoSearchQ||'')}"/>
        <div class="prod-list">${listaHTML}</div>
        ${cartHTML}
        ${this._productoCart.length?payHTML:''}
        ${confirmHTML}
      </div>`;
      this._attachProductoPanelEvents(slot, pack);
    }
    _attachProductoPanelEvents(slot, pack) {
      // Buscador (debounced ligero)
      const search = slot.querySelector('#prodSearch');
      if (search) {
        search.addEventListener('input', e => {
          this._productoSearchQ = e.target.value || '';
          clearTimeout(this._productoSearchTimer);
          this._productoSearchTimer = setTimeout(() => this._renderProductoPanel(), 180);
        });
        // Mantener foco si ya estaba escribiendo
        if (this._productoSearchQ) {
          try { search.focus(); search.setSelectionRange(this._productoSearchQ.length, this._productoSearchQ.length); } catch(e) {}
        }
      }
      // Click en producto → añadir al carrito (o incrementar)
      slot.querySelectorAll('.prod-item').forEach(el => {
        if (el.classList.contains('disabled')) return;
        el.addEventListener('click', () => {
          const id = el.dataset.prodId;
          const name = el.dataset.prodName;
          const price = parseFloat(el.dataset.prodPrice) || 0;
          if (!id) return;
          const existing = this._productoCart.find(c => c.productId === id);
          if (existing) existing.quantity = (existing.quantity || 1) + 1;
          else this._productoCart.push({ productId: id, productName: name, price, quantity: 1 });
          this._renderProductoPanel();
        });
      });
      // +/- cantidades
      slot.querySelectorAll('[data-prod-qty-inc]').forEach(b => b.addEventListener('click', () => {
        const id = b.dataset.prodQtyInc;
        const it = this._productoCart.find(c => c.productId === id);
        if (it) { it.quantity = (it.quantity || 1) + 1; this._renderProductoPanel(); }
      }));
      slot.querySelectorAll('[data-prod-qty-dec]').forEach(b => b.addEventListener('click', () => {
        const id = b.dataset.prodQtyDec;
        const it = this._productoCart.find(c => c.productId === id);
        if (!it) return;
        it.quantity = (it.quantity || 1) - 1;
        if (it.quantity <= 0) this._productoCart = this._productoCart.filter(c => c.productId !== id);
        this._renderProductoPanel();
      }));
      // Eliminar línea
      slot.querySelectorAll('[data-prod-rm]').forEach(b => b.addEventListener('click', () => {
        const id = b.dataset.prodRm;
        this._productoCart = this._productoCart.filter(c => c.productId !== id);
        this._renderProductoPanel();
      }));
      // Método de pago
      slot.querySelectorAll('[data-prod-pay]').forEach(b => b.addEventListener('click', () => {
        this._productoMetodoPago = b.dataset.prodPay;
        this._renderProductoPanel();
      }));
      // Cancelar (cerrar panel)
      const cancelBtn = slot.querySelector('[data-prod-cancel]');
      if (cancelBtn) cancelBtn.addEventListener('click', () => {
        slot.innerHTML = '';
        this._productoCart = [];
        this._productoSearchQ = '';
      });
      // Confirmar venta
      const confirmBtn = slot.querySelector('[data-prod-confirm]');
      if (confirmBtn) confirmBtn.addEventListener('click', () => {
        if (!this._productoCart.length) return;
        if (!pack.contactId) { this._toast('Sin cliente identificado'); return; }
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Registrando...';
        this._doVenderProducto(pack);
      });
    }
    _doVenderProducto(pack) {
      // FIX v2.2.3: enviamos packId y bookingId del primer servicio (no producto)
      // del pack para que la orden Wix los grabe en customFields. Eso permite
      // al merge de testCheckout matchear EXACTAMENTE la venta a este pack
      // aunque varios clientes compartan contactId (CRM demo fusionado).
      const primerServicioReal = (pack.servicios || []).find(s => s.tipo !== 'producto');
      const bookingId = primerServicioReal?.bookingId || '';
      this._sendToPage('venderProducto', {
        contactId: pack.contactId || '',
        contactName: pack.contactName || '',
        contactEmail: pack.email || '',
        contactPhone: pack.contactPhone || '',
        items: this._productoCart.map(c => ({
          productId: c.productId,
          productName: c.productName,
          price: c.price,
          quantity: c.quantity
        })),
        metodoPago: this._productoMetodoPago || 'Efectivo',
        currency: 'EUR',
        packId: pack.packId || '',
        bookingId: bookingId
      });
    }
    _showExtraForm(ov,pack){const slot=ov.querySelector('#extraSlot');if(slot.querySelector('.extra-form')){slot.innerHTML='';return;}const ex=pack.extra||null;slot.innerHTML=`<div class="extra-form"><div class="extra-row"><input type="text" id="extraDesc" placeholder="Extra personalizado" value="${ex?esc(ex.descripcion):''}" maxlength="80"/><input type="number" id="extraImp" placeholder="0" value="${ex?ex.importe:''}" min="0" step="0.01"/>€</div><div class="extra-btns"><button class="extra-cancel" id="exCancel">✕ Cancelar</button><button class="extra-save" id="exSave">✓ Guardar</button></div></div>`;
      slot.querySelector('#exCancel').addEventListener('click',()=>slot.innerHTML='');
      slot.querySelector('#exSave').addEventListener('click',()=>{const desc=slot.querySelector('#extraDesc').value.trim(),imp=parseFloat(slot.querySelector('#extraImp').value)||0;if(!desc||imp<=0){this._toast('Descripción e importe requeridos');return;}const bid=(pack.servicios&&pack.servicios[0])?pack.servicios[0].bookingId:null;if(!bid){this._toast('No hay booking');return;}this._sendToPage('checkout-setExtra',{bookingId:bid,descripcion:desc,importe:imp,fechaISO:this._fecha});});}
    // ═══════════════════════════════════════════════════
    // DELETE, MIXTO, RESCHEDULE MODALS
    // ═══════════════════════════════════════════════════
    _showDeleteModal(ids,nombre,svcs){const txt=svcs.map(s=>s.serviceName||'Servicio').join(', ');const ov=document.createElement('div');ov.className='modal-overlay';ov.innerHTML=`<div class="modal-box"><h3 style="color:#d93636;">¿Borrar reserva?</h3><p style="margin:8px 0 16px;font-size:12px;color:#6b7280;line-height:1.5;"><strong>${esc(nombre)}</strong><br>${esc(txt)}<br><br>Se cancelarán <strong>${ids.length}</strong> servicio(s). <strong>No se puede deshacer.</strong></p><div style="display:flex;gap:8px;justify-content:flex-end;"><button class="modal-btn modal-btn-cancel" data-close>Cancelar</button><button class="modal-btn modal-btn-delete" id="btnDel">Sí, borrar</button></div></div>`;this.shadowRoot.appendChild(ov);ov.addEventListener('click',e=>{if(e.target===ov||e.target.closest('[data-close]'))ov.remove();});ov.querySelector('#btnDel').addEventListener('click',()=>{ov.remove();this._sendToPage('checkout-delete',{bookingIds:ids});this._toast('Cancelando...');});}
    _showMixtoModal(bookingIds,pack,parentOv){const total=Number(pack.totalPack||0);const ov=document.createElement('div');ov.className='modal-overlay';ov.innerHTML=`<div class="modal-box"><h3 style="color:#7B68EE;">💳 Pago Mixto</h3><p style="margin:4px 0 8px;font-size:12px;"><strong>${esc(pack.contactName||'')}</strong> — Total: <strong>${eur(total)}</strong></p><div class="mixto-form"><div class="mixto-title">Importe de cada método</div><div class="mixto-row"><label><span class="mixto-dot" style="background:#4D8F8C"></span>Tarjeta</label><input type="number" id="mxT" value="0" min="0" step="0.01">€</div><div class="mixto-row"><label><span class="mixto-dot" style="background:#8F1C5B"></span>Efectivo</label><input type="number" id="mxE" value="0" min="0" step="0.01">€</div><div class="mixto-row"><label><span class="mixto-dot" style="background:#D18C49"></span>Bizum</label><input type="number" id="mxB" value="0" min="0" step="0.01">€</div><div class="mixto-total"><span>Suma: <strong id="mxS">0€</strong></span><span>Faltan: <strong id="mxF">${eur(total)}</strong></span></div><div class="mixto-btns"><button class="btn-mixto-cancel" data-close>Cancelar</button><button class="btn-mixto-confirm" id="mxC" disabled>✓ Confirmar</button></div></div></div>`;
      this.shadowRoot.appendChild(ov);
      const iT=ov.querySelector('#mxT'),iE=ov.querySelector('#mxE'),iB=ov.querySelector('#mxB'),sS=ov.querySelector('#mxS'),sF=ov.querySelector('#mxF'),bC=ov.querySelector('#mxC');
      const upd=()=>{const s=(parseFloat(iT.value)||0)+(parseFloat(iE.value)||0)+(parseFloat(iB.value)||0),f=total-s;sS.textContent=eur(s);sF.textContent=Math.abs(f)<0.01?'0€ ✓':eur(Math.abs(f));sS.style.color=Math.abs(f)<0.01?'#2a9d54':f<0?'#d93636':'';bC.disabled=Math.abs(f)>=0.01;};
      [iT,iE,iB].forEach(i=>i.addEventListener('input',upd));
      ov.addEventListener('click',e=>{if(e.target===ov||e.target.closest('[data-close]'))ov.remove();});
      bC.addEventListener('click',()=>{const d={};const t=parseFloat(iT.value)||0,ef=parseFloat(iE.value)||0,b=parseFloat(iB.value)||0;if(t>0)d.Tarjeta=t;if(ef>0)d.Efectivo=ef;if(b>0)d.Bizum=b;ov.remove();if(parentOv)parentOv.remove();this._sendToPage('checkout-pay',{bookingIds,metodoPago:'Mixto',desglosemetodopago:JSON.stringify(d)});this._toast('Cobrando Mixto...');});
      iT.focus();iT.select();}
    _showRescheduleChoice(pack){const ov=document.createElement('div');ov.className='modal-overlay';ov.id='reschedModal';ov.innerHTML=`<div class="modal-box" style="max-width:440px;"><h3>📅 Cambiar fecha</h3><p style="margin:4px 0 6px;font-size:12px;"><strong>${esc(pack.contactName||'')}</strong></p><div class="resched-mode-btns"><button class="resched-mode-btn" data-mode="auto"><span class="resched-mode-icon">🔍</span>AUTOMÁTICO<span class="resched-mode-desc">Ver horas disponibles</span></button><button class="resched-mode-btn" data-mode="forced"><span class="resched-mode-icon">✍️</span>FORZADO<span class="resched-mode-desc">Elegir hora manual</span></button></div><div style="text-align:right;"><button class="modal-btn modal-btn-cancel" data-close>Cancelar</button></div></div>`;this.shadowRoot.appendChild(ov);ov.addEventListener('click',e=>{if(e.target===ov||e.target.closest('[data-close]'))ov.remove();const m=e.target.closest('[data-mode]');if(m){ov.remove();if(m.dataset.mode==='auto')this._showAutoReschedule(pack);else this._showForcedReschedule(pack);}});}
    _showAutoReschedule(pack){const firstSvc=(pack.servicios||[]).find(s=>s.bookingId);if(!firstSvc){this._toast('No hay bookings');return;}this._reschedHora=null;const ov=document.createElement('div');ov.className='modal-overlay';ov.id='reschedModal';ov.innerHTML=`<div class="modal-box" style="max-width:460px;"><h3>🔍 Cambio automático</h3><p style="margin:4px 0 10px;font-size:12px;"><strong>${esc(pack.contactName||'')}</strong></p><div class="resched-date-row"><label style="font-size:11px;color:#9ca3af;">Fecha:</label><input type="date" class="resched-input" id="rDate" value="${addDays(todayISO(),1)}" min="${todayISO()}"><button class="btn-resched-confirm" id="btnSearch" style="padding:8px 12px;">Buscar</button></div><div id="slotsBox"></div><div id="slotsActions" style="display:none;margin-top:10px;"><div style="display:flex;gap:8px;justify-content:flex-end;"><button class="modal-btn modal-btn-cancel" data-close>Cancelar</button><button class="btn-resched-confirm" id="btnConfAuto" disabled>Confirmar</button></div></div><div id="defCancel" style="margin-top:10px;text-align:right;"><button class="modal-btn modal-btn-cancel" data-close>Cancelar</button></div></div>`;this.shadowRoot.appendChild(ov);
      ov.querySelector('#btnSearch').addEventListener('click',()=>{const f=ov.querySelector('#rDate').value;if(!f)return;ov.querySelector('#slotsBox').innerHTML='<div class="resched-loading">⏳ Buscando horas...</div>';ov.querySelector('#slotsActions').style.display='none';ov.querySelector('#defCancel').style.display='none';this._sendToPage('checkout-querySlots',{fechaISO:f,serviceId:firstSvc.serviceId,staffId:firstSvc.staffId});});
      ov.querySelector('#btnConfAuto').addEventListener('click',()=>{if(!this._reschedHora)return;this._doReschedule(pack,ov.querySelector('#rDate').value,this._reschedHora,false,ov);});
      ov.addEventListener('click',e=>{if(e.target===ov||e.target.closest('[data-close]'))ov.remove();});}
    _renderSlotsResult(slots){const ov=this.shadowRoot.getElementById('reschedModal');if(!ov)return;const box=ov.querySelector('#slotsBox');if(!box)return;if(!slots.length){box.innerHTML='<div class="resched-no-slots">⚠️ No hay horas disponibles</div>';ov.querySelector('#slotsActions').style.display='none';ov.querySelector('#defCancel').style.display='block';return;}
      let h='<div style="font-size:11px;color:#9ca3af;margin-bottom:6px;">Horas disponibles:</div><div class="slot-grid">';for(const s of slots)h+=`<button class="slot-btn" data-hora="${s.hora}">${s.hora}</button>`;h+='</div>';box.innerHTML=h;ov.querySelector('#slotsActions').style.display='block';ov.querySelector('#defCancel').style.display='none';
      box.querySelectorAll('.slot-btn').forEach(b=>b.addEventListener('click',()=>{box.querySelectorAll('.slot-btn').forEach(x=>x.classList.remove('selected'));b.classList.add('selected');this._reschedHora=b.dataset.hora;ov.querySelector('#btnConfAuto').disabled=false;}));}
    _showForcedReschedule(pack){const ov=document.createElement('div');ov.className='modal-overlay';ov.id='reschedModal';ov.innerHTML=`<div class="modal-box" style="max-width:420px;"><h3>✍️ Cambio forzado</h3><p style="margin:4px 0 10px;font-size:12px;"><strong>${esc(pack.contactName||'')}</strong></p><p style="font-size:11px;color:#d48a1a;margin-bottom:10px;">⚠️ No se validará disponibilidad.</p><div class="resched-date-row"><label style="font-size:11px;color:#9ca3af;">Fecha:</label><input type="date" class="resched-input" id="rDateF" value="${addDays(todayISO(),1)}" min="${todayISO()}"></div><div class="resched-date-row"><label style="font-size:11px;color:#9ca3af;">Hora:</label><input type="time" class="resched-input" id="rTimeF" value="${pack.horaInicio||'10:00'}" step="900" style="width:100px;"></div><div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px;"><button class="modal-btn modal-btn-cancel" data-close>Cancelar</button><button class="btn-resched-force" id="btnConfForced">Confirmar forzado</button></div></div>`;this.shadowRoot.appendChild(ov);
      ov.querySelector('#btnConfForced').addEventListener('click',()=>{const f=ov.querySelector('#rDateF').value,h=ov.querySelector('#rTimeF').value;if(!f||!h){this._toast('Fecha y hora');return;}this._doReschedule(pack,f,h,true,ov);});
      ov.addEventListener('click',e=>{if(e.target===ov||e.target.closest('[data-close]'))ov.remove();});}
    _doReschedule(pack,fecha,hora,forzado,ov){const svcs=(pack.servicios||[]).filter(s=>s.bookingId).map(s=>({bookingId:s.bookingId,serviceId:s.serviceId,staffId:s.staffId,startDate:s.startDate,endDate:s.endDate,revision:s.revision||null,scheduleId:s.scheduleId||null}));if(!svcs.length){this._toast('No hay bookings');return;}if(ov){const box=ov.querySelector('.modal-box');if(box)box.innerHTML=`<div style="text-align:center;padding:30px;"><div style="font-size:28px;margin-bottom:10px;">⏳</div><div style="font-size:14px;font-weight:700;">Cambiando fecha...</div><div style="font-size:11px;color:#9ca3af;margin-top:6px;">${svcs.length} servicio(s) → ${fecha} ${hora}</div></div>`;}this._sendToPage('checkout-reschedule',{servicios:svcs,nuevaFechaISO:fecha,nuevaHoraHHmm:hora,forzado});}
    _renderRescheduleResult(ok,msg){const ov=this.shadowRoot.getElementById('reschedModal');if(!ov){this._toast(ok?'✅ '+msg:'Error: '+msg);if(ok)setTimeout(()=>this._reload(),1000);return;}const box=ov.querySelector('.modal-box');if(box){if(ok){box.innerHTML=`<div style="text-align:center;padding:30px;"><div style="font-size:32px;margin-bottom:10px;">✅</div><div style="font-size:16px;font-weight:800;color:#2a9d54;">RESERVA MODIFICADA</div><div style="font-size:12px;color:#6b7280;margin-top:6px;">${esc(msg||'Cita cambiada')}</div></div>`;setTimeout(()=>{ov.remove();this._reload();},1800);}else{box.innerHTML=`<div style="text-align:center;padding:20px;"><div style="font-size:28px;margin-bottom:10px;">❌</div><div style="font-size:14px;font-weight:700;color:#d93636;">Error</div><div style="font-size:11px;color:#6b7280;margin:10px 0;">${esc(msg||'Error')}</div><button class="modal-btn modal-btn-cancel" data-close>Cerrar</button></div>`;box.querySelector('[data-close]').addEventListener('click',()=>ov.remove());}}}
    // ═══════════════════════════════════════════════════
    // SIDEBAR — CLIENT
    // ═══════════════════════════════════════════════════
    _wireClientEvents(){
      const R=this.shadowRoot;let searchTimer=null;
      R.getElementById('searchCliente').addEventListener('input',()=>{const q=R.getElementById('searchCliente').value.trim();if(q.length<2){R.getElementById('clienteResultados').innerHTML='';return;}clearTimeout(searchTimer);searchTimer=setTimeout(()=>this._sendToPage('buscarCliente',{query:q}),400);});
      R.getElementById('btnNuevoCliente').addEventListener('click',()=>{const f=R.getElementById('formNuevoCliente');f.classList.toggle('visible');if(f.classList.contains('visible'))R.getElementById('newNombre').focus();});
      R.getElementById('btnConfirmarNuevo').addEventListener('click',()=>{const nombre=R.getElementById('newNombre').value.trim(),email=R.getElementById('newEmail').value.trim();if(!nombre||!email){this._toast('Nombre y email obligatorios');return;}const apellido=R.getElementById('newApellido').value.trim(),telefono=R.getElementById('newTelefono').value.trim();this._sendToPage('crearContacto',{nombre,apellido,email,telefono});this._seleccionarCliente({contactId:null,nombre,apellido,email,telefono,nombreCompleto:`${nombre} ${apellido}`.trim()});});
      // Editar cliente
      R.getElementById('btnEditCliente').addEventListener('click',()=>{
        if(!this._cliente)return;
        const f=R.getElementById('formEditCliente');
        if(f.classList.contains('visible')){f.classList.remove('visible');R.getElementById('clienteInfo').style.display='block';return;}
        R.getElementById('editNombre').value=this._cliente.nombre||'';
        R.getElementById('editApellido').value=this._cliente.apellido||'';
        R.getElementById('editEmail').value=this._cliente.email||'';
        R.getElementById('editTelefono').value=this._cliente.telefono||'';
        R.getElementById('clienteInfo').style.display='none';
        f.classList.add('visible');
        R.getElementById('editNombre').focus();
      });
      R.getElementById('btnCancelEdit').addEventListener('click',()=>{R.getElementById('formEditCliente').classList.remove('visible');R.getElementById('clienteInfo').style.display='block';});
      R.getElementById('btnGuardarEdit').addEventListener('click',()=>{
        const nombre=R.getElementById('editNombre').value.trim();
        if(!nombre){this._toast('Nombre obligatorio');return;}
        const apellido=R.getElementById('editApellido').value.trim(),email=R.getElementById('editEmail').value.trim(),telefono=R.getElementById('editTelefono').value.trim();
        if(!this._cliente?.contactId){this._toast('Sin contactId — no se puede editar');return;}
        this._sendToPage('editarContacto',{contactId:this._cliente.contactId,nombre,apellido,email,telefono});
        this._toast('Guardando...');
      });
    }
    _mostrarResultados(clientes){const c=this.shadowRoot.getElementById('clienteResultados');if(!clientes.length){c.innerHTML='<div style="font-size:10px;color:#9ca3af;padding:6px;">Sin resultados</div>';return;}c.innerHTML=clientes.map((cl,i)=>`<div class="client-result" data-idx="${i}"><div class="client-avatar">${getInitials(cl.nombre,cl.apellido)}</div><div><div class="client-name">${esc(cl.nombreCompleto||cl.nombre)}</div><div class="client-detail">${esc(cl.email||'')} ${cl.telefono?'· '+cl.telefono:''}</div></div></div>`).join('');c.querySelectorAll('.client-result').forEach(el=>el.addEventListener('click',()=>this._seleccionarCliente(clientes[parseInt(el.dataset.idx)])));}
    _seleccionarCliente(cl){this._cliente=cl;const R=this.shadowRoot;R.getElementById('clienteResultados').innerHTML='';R.getElementById('searchCliente').value='';R.getElementById('formNuevoCliente').classList.remove('visible');R.getElementById('formEditCliente').classList.remove('visible');const info=R.getElementById('clienteInfo');info.style.display='block';R.getElementById('infoNombre').textContent=cl.nombreCompleto||cl.nombre;R.getElementById('infoDetalle').textContent=`${cl.email||''} ${cl.telefono?'· '+cl.telefono:''}`;this._updateClienteWarning();this._updateSidebarStatus();this._renderCalendar();}
    _updateClienteWarning(){const w=this.shadowRoot.getElementById('clienteWarning');if(!w)return;if(!this._cliente){w.innerHTML='';return;}const warns=checkClienteIncompleto({email:this._cliente.email,apellido:this._cliente.apellido,telefono:this._cliente.telefono});w.innerHTML=warnHTML(warns);}
    // ═══════════════════════════════════════════════════
    // SIDEBAR — SERVICES
    // ═══════════════════════════════════════════════════
    _wireServiceEvents(){
      this.shadowRoot.querySelectorAll('.svc-btn').forEach(btn=>{
        btn.addEventListener('click',()=>{
          if(btn.classList.contains('active')){btn.classList.remove('active');this._familia=null;this._servicioId=null;this._servicioLabel=null;this._simpleDur=null;this._simplePrice=null;this._hasVariants=false;this._simpleVariant=null;this.shadowRoot.getElementById('cfgColoracion').classList.remove('visible');this.shadowRoot.getElementById('cfgTratSection').classList.remove('visible');this.shadowRoot.getElementById('cfgSimple').classList.remove('visible');this._updateSidebarStatus();this._renderCalendar();return;}
          this.shadowRoot.querySelectorAll('.svc-btn').forEach(b=>b.classList.remove('active'));btn.classList.add('active');
          this._familia=btn.dataset.family;this._servicioId=btn.dataset.id;this._servicioLabel=btn.dataset.label;
          // v2.2.8: leer dur/price del catálogo (no del dataset). Source of truth: ServiceCatalog.
          {
            const cat = this._catalogoPrecios[this._servicioId] || {};
            this._simpleDur = (typeof cat.duration === 'number') ? cat.duration : null;
            this._simplePrice = (typeof cat.price === 'number') ? cat.price : null;
          }
          this._hasVariants=btn.dataset.variants==='1';this._simpleVariant=null;
          this._sendToPage('getStaff',{familia:this._familia,serviceId:this._servicioId});
          if(this._familia==='simple'&&!this._hasVariants&&(this._simpleDur===null||this._simplePrice===null))this._sendToPage('getServiceInfo',{serviceId:this._servicioId});
          this._showServiceConfig();this._updateSidebarStatus();this._renderCalendar();
        });
      });
    }
    _showServiceConfig(){
      const R=this.shadowRoot;R.getElementById('cfgColoracion').classList.remove('visible');R.getElementById('cfgTratSection').classList.remove('visible');R.getElementById('cfgSimple').classList.remove('visible');
      if(this._familia==='coloracion'){R.getElementById('cfgColoracion').classList.add('visible');}
      else if(this._familia==='tratamiento'){R.getElementById('cfgTratSection').classList.add('visible');}
      else if(this._familia==='simple'){
        R.getElementById('cfgSimple').classList.add('visible');
        if(this._hasVariants){R.getElementById('simpleInfo').style.display='none';R.getElementById('variantPicker').style.display='block';R.getElementById('variantPicker').innerHTML='<span style="font-size:10px;color:#9ca3af;">Cargando...</span>';this._sendToPage('getVariants',{serviceId:this._servicioId});}
        else{R.getElementById('variantPicker').style.display='none';R.getElementById('simpleInfo').style.display='flex';if(this._simpleDur!==null&&this._simplePrice!==null){R.getElementById('simpleDur').textContent=`${this._simpleDur} min`;R.getElementById('simplePrice').textContent=`${this._simplePrice}€`;}else{R.getElementById('simpleDur').textContent='Cargando...';R.getElementById('simplePrice').textContent='';}}
      }
    }
    _mostrarVariantes(variants){const R=this.shadowRoot;if(!variants.length){R.getElementById('variantPicker').style.display='none';R.getElementById('simpleInfo').style.display='flex';R.getElementById('simpleDur').textContent=`${this._simpleDur} min`;R.getElementById('simplePrice').textContent=`${this._simplePrice}€`;return;}
      R.getElementById('simpleInfo').style.display='none';R.getElementById('variantPicker').style.display='block';
      R.getElementById('variantPicker').innerHTML=variants.map((v,i)=>`<button class="variant-btn" data-idx="${i}"><span>${esc(v.label)}</span><span style="font-size:10px;color:#9ca3af;">${v.durationMinutes} min · ${v.priceEuro}€</span></button>`).join('');
      R.getElementById('variantPicker').querySelectorAll('.variant-btn').forEach(btn=>btn.addEventListener('click',()=>{R.getElementById('variantPicker').querySelectorAll('.variant-btn').forEach(b=>b.classList.remove('active'));btn.classList.add('active');const v=variants[parseInt(btn.dataset.idx)];this._simpleVariant=v;this._simpleDur=v.durationMinutes;this._simplePrice=v.priceEuro;if(v.serviceId)this._servicioId=v.serviceId;this._updateSidebarStatus();}));}
    // ═══════════════════════════════════════════════════
    // CELL CLICK → BOOKING POPUP
    // ═══════════════════════════════════════════════════
    _onCellClick(el){
      if(!this._cliente||!this._servicioId)return;
      if(this._familia==='simple'&&this._hasVariants&&!this._simpleVariant){this._toast('Selecciona variante');return;}
      if(this._familia==='simple'&&(this._simpleDur===null||this._simplePrice===null)){this._toast('Cargando datos...');return;}
      this._bookingStaffId=el.dataset.staff;this._bookingTime=el.dataset.time;
      const[hh,mm]=this._bookingTime.split(':').map(Number);this._bookingMinutes=hh*60+mm;
      this._openBookingPopup();
    }
    _openBookingPopup(){
      const R=this.shadowRoot,sName=this._staffName(this._bookingStaffId),color=this._staffColor(this._bookingStaffId);
      let cfgSummary='';
      if(this._familia==='coloracion'){const parts=[];const p=R.getElementById('cfgPeinado').value;if(p&&p!=='SECADO')parts.push('Peinado '+p);else parts.push('Secado');const t=R.getElementById('cfgTratamiento')?.value;if(t)parts.push(t);if(R.getElementById('chkCorteColor')?.checked)parts.push('Corte');if(R.getElementById('chkTinteCompleto')?.checked)parts.push('Completo');cfgSummary=parts.join(' · ');}
      else if(this._familia==='tratamiento'){const parts=['Pelo '+(R.getElementById('cfgLongitud')?.value||'M')];if(R.getElementById('chkCorteTrat')?.checked)parts.push('Corte');cfgSummary=parts.join(' · ');}
      else if(this._familia==='simple'&&this._simpleDur)cfgSummary=`${this._simpleDur} min`;
      let priceStr=this._familia==='simple'&&this._simplePrice?`${this._simplePrice}€`:'';
      let staff2HTML='';
      if(this._familia==='coloracion'||this._familia==='tratamiento'){const humans=this._staff.filter(s=>{const n=(s.name||'').toUpperCase();return n!=='CUALQUIERA'&&n!=='PROCESO'&&!s.isExternal&&s.id!==this._bookingStaffId;});let opts='<option value="ANY">CUALQUIERA</option>';humans.forEach(s=>opts+=`<option value="${s.id}">${esc(s.name)}</option>`);staff2HTML=`<div style="margin-top:10px;padding-top:10px;border-top:1px solid #e2e5ea;"><div class="cfg-label">Empl. complementos</div><select class="sb-select" id="bookingStaff2">${opts}</select></div>`;}
      R.getElementById('bookingBody').innerHTML=`<div class="booking-summary"><div class="booking-row"><div class="booking-row-icon">👤</div><div><div class="booking-row-label">Cliente</div><div class="booking-row-value">${esc(this._cliente.nombreCompleto||this._cliente.nombre)}</div></div></div><div class="booking-row"><div class="booking-row-icon">✂️</div><div><div class="booking-row-label">Servicio</div><div class="booking-row-value">${esc(this._servicioLabel)}${cfgSummary?' · '+esc(cfgSummary):''}${priceStr?' · '+priceStr:''}</div></div></div><div class="booking-row"><div class="booking-row-icon"><span class="staff-dot" style="background:${color};display:inline-block;"></span></div><div><div class="booking-row-label">Empleado</div><div class="booking-row-value">${esc(sName)}</div></div></div><div class="booking-row"><div class="booking-row-icon">🕐</div><div><div class="booking-row-label">Hora</div><div class="time-adjust"><button id="timeM">−</button><span class="time-display" id="timeDisp">${this._bookingTime}</span><button id="timeP">+</button></div></div></div>${staff2HTML}</div>`;
      R.getElementById('btnBookingConfirm').disabled=false;R.getElementById('btnBookingConfirm').textContent='RESERVAR';
      R.getElementById('bookingOverlay').classList.add('open');
      R.getElementById('timeM').addEventListener('click',()=>this._adjustTime(-5));R.getElementById('timeP').addEventListener('click',()=>this._adjustTime(5));
    }
    _adjustTime(delta){this._bookingMinutes=Math.max(540,Math.min(1200,this._bookingMinutes+delta));const hh=String(Math.floor(this._bookingMinutes/60)).padStart(2,'0'),mm=String(this._bookingMinutes%60).padStart(2,'0');this._bookingTime=`${hh}:${mm}`;this.shadowRoot.getElementById('timeDisp').textContent=this._bookingTime;}
    _closeBookingOverlay(){this.shadowRoot.getElementById('bookingOverlay').classList.remove('open');this._reservando=false;}
    _confirmarReserva(){
      if(this._reservando)return;this._reservando=true;const R=this.shadowRoot;R.getElementById('btnBookingConfirm').disabled=true;R.getElementById('btnBookingConfirm').textContent='Creando...';
      const cd={firstName:this._cliente.nombre||this._cliente.nombreCompleto,lastName:this._cliente.apellido||'',email:this._cliente.email||'',phone:this._cliente.telefono||''};
      const eid=this._bookingStaffId,fISO=this._fecha,hora=this._bookingTime,mcid=this._cliente.contactId||null;
      if(this._familia==='coloracion'){const s2=R.getElementById('bookingStaff2');this._sendToPage('reservarColoracion',{publicServiceId:this._servicioId,fechaISO:fISO,horaHHmm:hora,empleadoId:eid,empleado2Id:s2&&s2.value!=='ANY'?s2.value:null,peinadoValue:R.getElementById('cfgPeinado')?.value||'SECADO',tratamientoValue:R.getElementById('cfgTratamiento')?.value||null,corteChecked:R.getElementById('chkCorteColor')?.checked||false,totalChecked:R.getElementById('chkTinteCompleto')?.checked||false,contactDetails:cd,modoPago:'LOCAL',memberContactId:mcid});}
      else if(this._familia==='tratamiento'){const s2=R.getElementById('bookingStaff2');this._sendToPage('reservarTratamiento',{publicServiceId:this._servicioId,fechaISO:fISO,horaHHmm:hora,empleadoId:eid,empleado2Id:s2&&s2.value!=='ANY'?s2.value:null,longitudPelo:R.getElementById('cfgLongitud')?.value||'M',corteChecked:R.getElementById('chkCorteTrat')?.checked||false,contactDetails:cd,modoPago:'LOCAL',memberContactId:mcid});}
      else if(this._familia==='simple'){this._sendToPage('reservarSimple',{serviceId:this._servicioId,fechaISO:fISO,horaHHmm:hora,empleadoId:eid,durationMinutes:this._simpleDur,price:this._simplePrice,variantLabel:this._simpleVariant?.label||null,contactDetails:cd,modoPago:'LOCAL',memberContactId:mcid});}
      setTimeout(()=>{if(this._reservando){this._reservando=false;R.getElementById('btnBookingConfirm').disabled=false;R.getElementById('btnBookingConfirm').textContent='RESERVAR';this._toast('Timeout',4000);}},30000);
    }
    _handleReservaCompletada(data){this._reservando=false;if(!data.ok){this.shadowRoot.getElementById('btnBookingConfirm').disabled=false;this.shadowRoot.getElementById('btnBookingConfirm').textContent='RESERVAR';const raw=JSON.stringify(data.error||{});let msg='Error';if(raw.includes('SLOT_NOT_AVAILABLE'))msg='Horario no disponible';else msg=data.error?.message||raw;this._toast('Error: '+msg,4000);return;}this._closeBookingOverlay();this._toast('Reserva creada ✓');setTimeout(()=>this._reload(),500);}
    // ═══════════════════════════════════════════════════
    // BLOCK POPUP
    // ═══════════════════════════════════════════════════
    _blockData=null;
    _openBlockPopup(staffId,startTime,durMin,smTotal){
      const sName=this._staffName(staffId),color=this._staffColor(staffId);this._blockData={staffId,startTime,durMin,smTotal,_durMin:durMin};
      const endMin=smTotal+durMin,endHH=String(Math.floor(endMin/60)).padStart(2,'0'),endMM=String(endMin%60).padStart(2,'0');
      const R=this.shadowRoot;R.getElementById('blockBody').innerHTML=`<div class="booking-summary"><div class="booking-row"><div class="booking-row-icon"><span class="staff-dot" style="background:${color};display:inline-block;"></span></div><div><div class="booking-row-label">Empleado</div><div class="booking-row-value">${esc(sName)}</div></div></div><div class="booking-row"><div class="booking-row-icon">🕐</div><div><div class="booking-row-label">Inicio</div><div class="time-adjust"><button id="blkSM">−</button><span class="time-display" id="blkSD">${startTime}</span><button id="blkSP">+</button></div></div></div><div class="booking-row"><div class="booking-row-icon">🕐</div><div><div class="booking-row-label">Duración</div><div class="time-adjust"><button id="blkDM">−</button><span class="time-display" id="blkDD">${durMin} min</span><button id="blkDP">+</button></div></div></div><div class="booking-row"><div class="booking-row-icon">⏹</div><div><div class="booking-row-label">Fin</div><div class="booking-row-value" id="blkEnd">${endHH}:${endMM}</div></div></div></div>`;
      R.getElementById('btnBlockConfirm').disabled=false;R.getElementById('btnBlockConfirm').textContent='BLOQUEAR';
      R.getElementById('blockOverlay').classList.add('open');
      R.getElementById('blkSM').addEventListener('click',()=>{this._blockData.smTotal=Math.max(540,this._blockData.smTotal-5);const h=String(Math.floor(this._blockData.smTotal/60)).padStart(2,'0'),m=String(this._blockData.smTotal%60).padStart(2,'0');this._blockData.startTime=`${h}:${m}`;R.getElementById('blkSD').textContent=this._blockData.startTime;this._updateBlockEnd();});
      R.getElementById('blkSP').addEventListener('click',()=>{this._blockData.smTotal=Math.min(1200,this._blockData.smTotal+5);const h=String(Math.floor(this._blockData.smTotal/60)).padStart(2,'0'),m=String(this._blockData.smTotal%60).padStart(2,'0');this._blockData.startTime=`${h}:${m}`;R.getElementById('blkSD').textContent=this._blockData.startTime;this._updateBlockEnd();});
      R.getElementById('blkDM').addEventListener('click',()=>{this._blockData._durMin=Math.max(5,this._blockData._durMin-5);R.getElementById('blkDD').textContent=`${this._blockData._durMin} min`;this._updateBlockEnd();});
      R.getElementById('blkDP').addEventListener('click',()=>{this._blockData._durMin+=5;R.getElementById('blkDD').textContent=`${this._blockData._durMin} min`;this._updateBlockEnd();});
    }
    _updateBlockEnd(){const e=this._blockData.smTotal+this._blockData._durMin;this.shadowRoot.getElementById('blkEnd').textContent=`${String(Math.floor(e/60)).padStart(2,'0')}:${String(e%60).padStart(2,'0')}`;}
    _closeBlockOverlay(){this.shadowRoot.getElementById('blockOverlay').classList.remove('open');this._blockData=null;}
    _confirmarBloqueo(){if(!this._blockData)return;this.shadowRoot.getElementById('btnBlockConfirm').disabled=true;this.shadowRoot.getElementById('btnBlockConfirm').textContent='Creando...';this._sendToPage('crearExtension',{fecha:this._fecha,horaInicio:this._blockData.startTime,duracionMin:this._blockData._durMin,resourceId:this._blockData.staffId,bookingId:'',notes:'BLOQUEO MANUAL'});this._closeBlockOverlay();this._toast('Creando bloqueo...');}
    // ═══════════════════════════════════════════════════
    // SETTINGS
    // ═══════════════════════════════════════════════════
    _openSettings(){this.shadowRoot.getElementById('settingsOverlay').classList.add('open');this.shadowRoot.getElementById('settingsPanel').classList.add('open');this._renderStaffSettings();}
    _closeSettings(){this.shadowRoot.getElementById('settingsOverlay').classList.remove('open');this.shadowRoot.getElementById('settingsPanel').classList.remove('open');this._closeColorPicker();}
    _applySettingsUI(){const R=this.shadowRoot;R.getElementById('sliderSpacing').value=this._settings.rowHeight||48;const tr=R.querySelector(`input[name="titleMode"][value="${this._settings.titleMode||'servicio'}"]`);if(tr)tr.checked=true;const ir=R.querySelector(`input[name="interval"][value="${this._settings.interval||30}"]`);if(ir)ir.checked=true;}
    _renderStaffSettings(){
      const list=this.shadowRoot.getElementById('staffConfigList'),cfg=this._settings.staffConfig;
      const sorted=[...this._staff].sort((a,b)=>(cfg[a.id]?.position||99)-(cfg[b.id]?.position||99));
      list.innerHTML=sorted.map(s=>{const c=cfg[s.id]||{};return`<div class="staff-config-row"><input type="checkbox" class="staff-check" data-id="${s.id}" ${c.visible!==false?'checked':''}><span class="staff-name-label">${esc(s.name)}</span><button class="staff-color-btn" data-id="${s.id}" style="background:${c.color||'#6b7280'}"></button><input type="number" class="staff-pos-input" data-id="${s.id}" value="${c.position||1}" min="1" max="20"></div>`;}).join('');
      list.querySelectorAll('.staff-check').forEach(cb=>cb.addEventListener('change',e=>{this._settings.staffConfig[e.target.dataset.id].visible=e.target.checked;this._saveSettings();this._renderCalendar();this._updateStats();}));
      list.querySelectorAll('.staff-pos-input').forEach(inp=>inp.addEventListener('change',e=>{this._settings.staffConfig[e.target.dataset.id].position=parseInt(e.target.value)||1;this._saveSettings();this._renderCalendar();}));
      list.querySelectorAll('.staff-color-btn').forEach(btn=>btn.addEventListener('click',e=>{e.stopPropagation();this._openColorPicker(btn,btn.dataset.id);}));
    }
    _activeColorStaffId=null;
    _initColorPicker(){const g=this.shadowRoot.getElementById('colorGrid');g.innerHTML=PALETTE.map(c=>`<div class="color-swatch" style="background:${c}" data-color="${c}"></div>`).join('');g.addEventListener('click',e=>{const s=e.target.closest('.color-swatch');if(!s||!this._activeColorStaffId)return;this._settings.staffConfig[this._activeColorStaffId].color=s.dataset.color;this._saveSettings();this._renderStaffSettings();this._renderCalendar();this._closeColorPicker();});}
    _openColorPicker(anchor,staffId){this._activeColorStaffId=staffId;const p=this.shadowRoot.getElementById('colorPicker'),r=anchor.getBoundingClientRect();p.style.top=`${r.bottom+4}px`;p.style.left=`${Math.max(8,r.left-100)}px`;p.classList.add('open');p.querySelectorAll('.color-swatch').forEach(s=>s.classList.toggle('active',s.dataset.color===this._settings.staffConfig[staffId]?.color));}
    _closeColorPicker(){this.shadowRoot.getElementById('colorPicker').classList.remove('open');this._activeColorStaffId=null;}
    // ═══════════════════════════════════════════════════
    // CIERRE
    // ═══════════════════════════════════════════════════
    _toggleCierre(){const cp=this.shadowRoot.getElementById('cierrePanel');if(cp.classList.contains('visible')){this._closeCierre();}else{this._sendToPage('checkout-cierre',{fechaISO:this._fecha});this._sendToPage('cashRegister-calculate',{fechaISO:this._fecha});this._sendToPage('checkout-cierreExtendido',{fechaISO:this._fecha});cp.classList.add('visible');}}
    _closeCierre(){this.shadowRoot.getElementById('cierrePanel').classList.remove('visible');}

    // ═══════════════════════════════════════════════════
    // ARQUEO DE CAJA (v2.2.4)
    // ═══════════════════════════════════════════════════
    _arqueoData=null;
    _openArqueo(){
      this._sendToPage('cashRegister-calculate',{fechaISO:this._fecha});
      const ov=document.createElement('div');ov.className='arqueo-overlay';ov.id='arqueoOverlay';
      ov.innerHTML=`<div class="arqueo-box"><div class="arqueo-title">🏦 Arqueo de caja</div><div class="arqueo-subtitle">Cargando datos del día...</div></div>`;
      this.shadowRoot.appendChild(ov);
      ov.addEventListener('click',e=>{if(e.target===ov)ov.remove();});
    }

    _renderArqueo(data){
      const ov=this.shadowRoot.getElementById('arqueoOverlay');
      if(!ov)return;
      this._arqueoData=data;
      const fechaDisplay=this._fecha;
      const e=data.esperado||0,fi=data.fondoInicial||0,ce=data.cobrosEfectivo||0;
      const ent=data.entradas||0,sal=data.salidas||0,ret=data.retiradas||0;
      const sinEsp=data.sinEspecificar||0;
      const movs=data.movimientos||[];
      const registro=data.registro||null;
      const status=registro?.status||'none';
      const isClosed=status==='closed';
      const savedCounted=registro?.countedCash||'';
      const savedNote=registro?.differenceNote||'';
      let movHTML='';
      const tipoLabels={entry:'Entrada',exit:'Salida',withdrawal:'Retirada',tip:'Propina',minor_purchase:'Compra menor',opening_balance:'Fondo',regularization:'Regularización'};
      const tipoSign={entry:'+',exit:'-',withdrawal:'-',tip:'+',minor_purchase:'-',opening_balance:'+',regularization:'+'};
      for(const m of movs){
        const lbl=tipoLabels[m.movementType]||m.movementType;
        const sign=tipoSign[m.movementType]||'+';
        const color=sign==='+'?'#2a9d54':'#d93636';
        movHTML+=`<div class="arqueo-mov-row"><span>${lbl}: ${esc(m.description||'')}</span><span style="color:${color};font-weight:600;">${sign}${eur(m.amount||0)}</span></div>`;
      }
      const box=ov.querySelector('.arqueo-box');
      box.innerHTML=`
        <div style="display:flex;justify-content:space-between;align-items:flex-start;">
          <div><div class="arqueo-title">🏦 Arqueo de caja</div><div class="arqueo-subtitle">${fechaDisplay}${isClosed?' · <span style=\"color:#2a9d54;font-weight:700;\">CERRADA</span>':status==='saved'?' · <span style=\"color:#c9a44a;font-weight:700;\">GUARDADO</span>':''}</div></div>
          <button class="modal-close" id="arqueoClose">✕</button>
        </div>
        <div class="arqueo-summary">
          <div class="arqueo-row"><span>Fondo inicial</span><span>${eur(fi)}</span></div>
          <div class="arqueo-row"><span>Cobros en efectivo</span><span style="color:#2a9d54;">+${eur(ce)}</span></div>
          <div class="arqueo-row"><span>Entradas manuales</span><span style="color:#2a9d54;">+${eur(ent)}</span></div>
          <div class="arqueo-row"><span>Salidas manuales</span><span style="color:#d93636;">-${eur(sal)}</span></div>
          <div class="arqueo-row"><span>Retiradas</span><span style="color:#d93636;">-${eur(ret)}</span></div>
          <div class="arqueo-row total"><span>Efectivo esperado</span><span>${eur(e)}</span></div>
        </div>
        ${sinEsp>0?`<div class="arqueo-warn">⚠️ Hay ${eur(sinEsp)} cobrados sin método de pago asignado. No cuentan como efectivo.</div>`:''}
        <div class="arqueo-input-row">
          <label>💵 Contado en caja</label>
          <input type="number" class="arqueo-input" id="arqueoContado" step="0.01" min="0" value="${savedCounted}" placeholder="0" ${isClosed?'disabled':''}/>
          <span>€</span>
        </div>
        <div class="arqueo-result" id="arqueoResult" style="display:none;"></div>
        <textarea class="arqueo-note" id="arqueoNote" placeholder="Motivo / observación (si hay diferencia)" ${isClosed?'disabled':''}>${esc(savedNote)}</textarea>
        ${movs.length>0||!isClosed?`<div class="arqueo-mov-section">
          <div class="arqueo-mov-title">Movimientos de caja</div>
          ${movHTML||'<div style="font-size:10px;color:#9ca3af;">Sin movimientos</div>'}
          ${!isClosed?`<div class="arqueo-mov-add">
            <select id="movTipo"><option value="entry">Entrada</option><option value="exit">Salida</option><option value="withdrawal">Retirada</option><option value="tip">Propina</option><option value="minor_purchase">Compra menor</option><option value="regularization">Regularización</option></select>
            <input type="number" id="movImporte" placeholder="€" step="0.01" min="0"/>
            <input type="text" id="movDesc" placeholder="Motivo"/>
            <button id="movAdd">+</button>
          </div>`:''}
        </div>`:''}
        <div class="arqueo-btns">
          <button class="arqueo-btn arqueo-btn-cancel" id="arqueoCancel">Cerrar</button>
          ${!isClosed?`<button class="arqueo-btn arqueo-btn-save" id="arqueoSave">Guardar arqueo</button>`:''}
          ${!isClosed?`<button class="arqueo-btn arqueo-btn-close" id="arqueoCerrar">Cerrar caja del día</button>`:''}
        </div>`;
      box.querySelector('#arqueoClose').addEventListener('click',()=>ov.remove());
      box.querySelector('#arqueoCancel').addEventListener('click',()=>ov.remove());
      const contadoInput=box.querySelector('#arqueoContado');
      const resultDiv=box.querySelector('#arqueoResult');
      const updateResult=()=>{
        const v=parseFloat(contadoInput.value);
        if(isNaN(v)||contadoInput.value===''){resultDiv.style.display='none';return;}
        const diff=Math.round((v-e)*100)/100;
        resultDiv.style.display='block';
        if(Math.abs(diff)<0.01){resultDiv.className='arqueo-result ok';resultDiv.textContent='✅ Caja cuadrada';}
        else if(Math.abs(diff)<=5){resultDiv.className='arqueo-result warn';resultDiv.textContent=`⚠️ Diferencia: ${diff>0?'+':''}${eur(Math.abs(diff))}`;}
        else{resultDiv.className='arqueo-result bad';resultDiv.textContent=`❌ Diferencia: ${diff>0?'+':''}${eur(Math.abs(diff))}`;}
      };
      contadoInput.addEventListener('input',updateResult);
      if(savedCounted)updateResult();
      const saveBtn=box.querySelector('#arqueoSave');
      if(saveBtn)saveBtn.addEventListener('click',()=>{
        const contado=parseFloat(contadoInput.value);
        if(isNaN(contado)){this._toast('Introduce el efectivo contado');return;}
        saveBtn.disabled=true;saveBtn.textContent='Guardando...';
        this._sendToPage('cashRegister-save',{fechaISO:this._fecha,countedCash:contado,differenceNote:box.querySelector('#arqueoNote').value.trim(),closedBy:''});
      });
      const cerrarBtn=box.querySelector('#arqueoCerrar');
      if(cerrarBtn)cerrarBtn.addEventListener('click',()=>{
        const contado=parseFloat(contadoInput.value);
        if(isNaN(contado)){this._toast('Introduce el efectivo contado antes de cerrar');return;}
        if(!confirm('¿Cerrar la caja del día? Esta acción no se puede deshacer.'))return;
        cerrarBtn.disabled=true;cerrarBtn.textContent='Cerrando...';
        this._sendToPage('cashRegister-close',{fechaISO:this._fecha,countedCash:contado,differenceNote:box.querySelector('#arqueoNote').value.trim(),closedBy:''});
      });
      const addBtn=box.querySelector('#movAdd');
      if(addBtn)addBtn.addEventListener('click',()=>{
        const tipo=box.querySelector('#movTipo').value;
        const imp=parseFloat(box.querySelector('#movImporte').value);
        const desc=box.querySelector('#movDesc').value.trim();
        if(!tipo||isNaN(imp)||imp<=0){this._toast('Tipo e importe requeridos');return;}
        this._sendToPage('cashRegister-addMovement',{fechaISO:this._fecha,movementType:tipo,amount:imp,description:desc,registerId:data.registroId||''});
        this._toast('Registrando movimiento...');
      });
    }

    // v2.2.6: Resumen del arqueo en el informe de cierre (solo lectura)
    _renderArqueoResumen(data){
      const slot=this.shadowRoot.getElementById('cierreArqueoSlot');
      if(!slot)return;
      const registro=data.registro||null;
      const status=registro?.status||'none';
      const e=data.esperado||0,fi=data.fondoInicial||0,ce=data.cobrosEfectivo||0;
      const ent=data.entradas||0,sal=data.salidas||0,ret=data.retiradas||0;
      const sinEsp=data.sinEspecificar||0;
      const contado=registro?.countedCash;
      const diff=registro?.difference;
      const nota=registro?.differenceNote||'';
      const isClosed=status==='closed';
      const isSaved=status==='saved';
      const hasArqueo=isClosed||isSaved;
      let statusTag='';
      if(isClosed)statusTag='<span style="color:#2a9d54;font-weight:700;margin-left:6px;">CERRADA</span>';
      else if(isSaved)statusTag='<span style="color:#c9a44a;font-weight:700;margin-left:6px;">GUARDADO</span>';
      else statusTag='<span style="color:#9ca3af;font-weight:600;margin-left:6px;">PENDIENTE</span>';
      let resultHTML='';
      if(hasArqueo&&contado!==undefined&&contado!==null&&contado!==''){
        const absDiff=Math.abs(diff||0);
        if(absDiff<0.01)resultHTML=`<div class="cierre-row"><span class="cierre-nombre" style="color:#2a9d54;font-weight:700;">✅ Caja cuadrada</span></div>`;
        else if(absDiff<=5)resultHTML=`<div class="cierre-row"><span class="cierre-nombre" style="color:#d48a1a;font-weight:700;">⚠️ Diferencia: ${diff>0?'+':''}${eur(absDiff)}</span></div>`;
        else resultHTML=`<div class="cierre-row"><span class="cierre-nombre" style="color:#d93636;font-weight:700;">❌ Diferencia: ${diff>0?'+':''}${eur(absDiff)}</span></div>`;
        if(nota)resultHTML+=`<div class="cierre-row"><span class="cierre-nombre" style="color:#9ca3af;font-size:10px;">Motivo: ${esc(nota)}</span></div>`;
      }
      slot.innerHTML=`
        <div style="margin-top:16px;border-top:2px solid #c9a44a;padding-top:14px;">
          <div class="cierre-section-title" style="font-size:13px;">🏦 Arqueo de efectivo${statusTag}</div>
          <div class="cierre-row"><span class="cierre-nombre">Fondo inicial</span><span class="cierre-importe">${eur(fi)}</span></div>
          <div class="cierre-row"><span class="cierre-nombre">Cobros en efectivo</span><span class="cierre-importe" style="color:#2a9d54;">+${eur(ce)}</span></div>
          <div class="cierre-row"><span class="cierre-nombre">Entradas manuales</span><span class="cierre-importe" style="color:#2a9d54;">+${eur(ent)}</span></div>
          <div class="cierre-row"><span class="cierre-nombre">Salidas manuales</span><span class="cierre-importe" style="color:#d93636;">-${eur(sal)}</span></div>
          <div class="cierre-row"><span class="cierre-nombre">Retiradas</span><span class="cierre-importe" style="color:#d93636;">-${eur(ret)}</span></div>
          <div class="cierre-row" style="border-top:1px solid #e2e5ea;padding-top:6px;margin-top:4px;"><span class="cierre-nombre" style="font-weight:700;">Efectivo esperado</span><span class="cierre-importe" style="font-weight:700;">${eur(e)}</span></div>
          ${hasArqueo?`<div class="cierre-row" style="margin-top:6px;"><span class="cierre-nombre" style="font-weight:700;">Efectivo contado</span><span class="cierre-importe" style="font-weight:700;">${eur(contado||0)}</span></div>`:`<div class="cierre-row" style="margin-top:6px;"><span class="cierre-nombre" style="color:#9ca3af;font-style:italic;">Arqueo no realizado — pulsa 🏦 para contar</span></div>`}
          ${resultHTML}
          ${sinEsp>0?`<div class="cierre-row" style="margin-top:4px;"><span class="cierre-nombre" style="color:#d48a1a;font-size:10px;">⚠️ ${eur(sinEsp)} cobrados sin método asignado (no cuentan como efectivo)</span></div>`:''}
        </div>`;
    }

    _renderCierre(){
      const packs=this._packs,dc=this._datosCierre;
      let cobrado=0,pendiente=0,cPagados=0,cPendientes=0,totalDescuentos=0;
      const porMetodo={},porServicio={};
      const metodoCol={'Efectivo':'#8F1C5B','Tarjeta':'#4D8F8C','Bizum':'#D18C49','Mixto':'#7B68EE'};
      for(const p of packs){
        const total=Number(p.totalPack||0),pend=Number(p.serviciosPendientes||0),desc=Number(p.descuentoTotal||0);
        if(pend===0){
          cobrado+=total;cPagados++;
          let m=p.metodoPagoPack||'';
          if(!m&&p.servicios){for(const s of p.servicios){if(s.metodoPago){m=s.metodoPago;break;}}}
          if(!m)m='Sin especificar';
          if(m==='Mixto'){let desg=null;if(p.desgloseMixto)desg=p.desgloseMixto;else if(p.servicios){for(const s of p.servicios){if(s.desglosemetodopago){try{desg=JSON.parse(s.desglosemetodopago);}catch(e){}break;}}}if(desg&&typeof desg==='object'){for(const[k,v]of Object.entries(desg)){if(v>0)porMetodo[k]=(porMetodo[k]||0)+Number(v);}}else porMetodo['Mixto']=(porMetodo['Mixto']||0)+total;}
          else porMetodo[m]=(porMetodo[m]||0)+total;
        }else{pendiente+=total;cPendientes++;}
        totalDescuentos+=desc;
        // Agrupar por servicio
        // FIX v2.2.3: filtrar productEntries (tipo:'producto') para que NO
        // aparezcan en "Servicios del día" del cierre. Los productos se
        // muestran en su sección dedicada "🛍 Productos vendidos" abajo,
        // alimentada por obtenerDatosCierreDia. Sin este filtro, los
        // productos se contaban dos veces (una en servicios y otra en
        // productos) y aparecían mal etiquetados.
        if(p.servicios){for(const s of p.servicios){if(s.tipo==='producto')continue;const nombre=(s.serviceName||'Servicio').trim();const precio=Number(s.precioFinal??s.precio??0);if(precio<=0)continue;if(!porServicio[nombre])porServicio[nombre]={cantidad:0,importe:0};porServicio[nombre].cantidad++;porServicio[nombre].importe+=precio;}}
        if(p.extra&&p.extra.importe>0){const en='✏️ '+(p.extra.descripcion||'Extra');if(!porServicio[en])porServicio[en]={cantidad:0,importe:0};porServicio[en].cantidad++;porServicio[en].importe+=p.extra.importe;}
      }
      const totalDia=cobrado+pendiente;
      const totalServicios=packs.reduce((s,p)=>s+((p.servicios||[]).length),0);
      let h='';
      if(cPendientes>0)h+=`<div style="grid-column:1/-1;background:rgba(212,138,26,.08);border:1px solid rgba(212,138,26,.3);border-radius:6px;padding:10px;font-size:11px;color:#6b7280;">⚠️ <strong>Hay ${cPendientes} reserva${cPendientes!==1?'s':''} sin marcar como PAGADO.</strong></div>`;
      h+=`<div class="cierre-box cobrado"><div class="cierre-label">Cobrado</div><div class="cierre-valor" style="color:#2a9d54;">${eur(cobrado)}</div><div class="cierre-detalle">${cPagados} cliente${cPagados!==1?'s':''}</div></div>`;
      h+=`<div class="cierre-box pendiente"><div class="cierre-label">Pendiente</div><div class="cierre-valor" style="color:#d48a1a;">${eur(pendiente)}</div><div class="cierre-detalle">${cPendientes} cliente${cPendientes!==1?'s':''}</div></div>`;
      h+=`<div class="cierre-box total"><div class="cierre-label">Total del día</div><div class="cierre-valor">${eur(totalDia)}</div><div class="cierre-detalle">${packs.length} cliente${packs.length!==1?'s':''} · ${totalServicios} servicios${totalDescuentos>0?' · Descuentos: '+eur(totalDescuentos):''}</div></div>`;
      // Cobrado por método de pago
      const mEntries=Object.entries(porMetodo).sort((a,b)=>b[1]-a[1]);
      if(mEntries.length){h+=`<div class="cierre-section"><div class="cierre-section-title">💳 Cobrado por método de pago</div>`;for(const[m,imp]of mEntries){const col=metodoCol[m]||'#9ca3af';h+=`<div class="cierre-row"><span class="cierre-nombre"><span class="cierre-metodo-icon" style="background:${col}"></span>${m}</span><span class="cierre-importe">${eur(imp)}</span></div>`;}h+=`</div>`;}
      // Servicios del día
      const svcEntries=Object.entries(porServicio).sort((a,b)=>b[1].importe-a[1].importe);
      if(svcEntries.length){
        h+=`<div class="cierre-section"><div class="cierre-section-title">✂️ Servicios del día</div>`;
        for(const[nombre,data]of svcEntries){
          const pu=data.cantidad>0?Math.round(data.importe/data.cantidad*100)/100:0;
          if(data.cantidad===1)h+=`<div class="cierre-row"><span class="cierre-nombre">${nombre}</span><span class="cierre-importe">${eur(data.importe)}</span></div>`;
          else h+=`<div class="cierre-row"><span class="cierre-nombre">${nombre}</span><span style="color:#9ca3af;font-size:10px;margin:0 8px;">${eur(pu)} ×${data.cantidad} =</span><span class="cierre-importe">${eur(data.importe)}</span></div>`;
        }
        h+=`</div>`;
      }
      // Servicios externos
      if(dc?.externos&&dc.externos.citas>0){
        h+=`<div class="cierre-section"><div class="cierre-section-title" style="color:#a78bfa;">🔗 Servicios externos</div>`;
        for(const it of dc.externos.desglose){
          if(it.count&&it.count>1){const unit=it.count>0?Math.round(it.ventaBruta/it.count*100)/100:0;h+=`<div class="cierre-row"><span class="cierre-nombre">${it.nombre}</span><span style="color:#9ca3af;font-size:10px;margin:0 8px;">${eur(unit)} ×${it.count} =</span><span class="cierre-importe">${eur(it.ventaBruta)}</span></div>`;}
          else h+=`<div class="cierre-row"><span class="cierre-nombre">${it.nombre}</span><span class="cierre-importe">${eur(it.ventaBruta)}</span></div>`;
        }
        h+=`<div class="cierre-row" style="border-top:1px solid #e2e5ea;margin-top:4px;padding-top:6px;"><span class="cierre-nombre" style="font-weight:700;">Venta bruta externa</span><span class="cierre-importe">${eur(dc.externos.ventaBruta)}</span></div>`;
        h+=`<div class="cierre-row"><span class="cierre-nombre" style="font-weight:700;color:#a78bfa;">Comisión HairTimes</span><span class="cierre-importe" style="color:#a78bfa;">${eur(dc.externos.comisionTotal)}</span></div>`;
        h+=`</div>`;
      }
      // Productos vendidos
      if(dc?.productos&&dc.productos.totalProductos>0){
        h+=`<div class="cierre-section"><div class="cierre-section-title">🛍 Productos vendidos</div>`;
        for(const it of dc.productos.desglose){
          if(it.count&&it.count>1)h+=`<div class="cierre-row"><span class="cierre-nombre">${it.nombre}</span><span style="color:#9ca3af;font-size:10px;margin:0 8px;">${eur(it.precioUnit)} ×${it.count} =</span><span class="cierre-importe">${eur(it.total)}</span></div>`;
          else h+=`<div class="cierre-row"><span class="cierre-nombre">${it.nombre}</span><span class="cierre-importe">${eur(it.total)}</span></div>`;
        }
        h+=`<div class="cierre-row" style="border-top:1px solid #e2e5ea;margin-top:4px;padding-top:6px;"><span class="cierre-nombre" style="font-weight:700;">Total productos</span><span class="cierre-importe">${eur(dc.productos.totalProductos)}</span></div>`;
        h+=`</div>`;
      }
      // Cierre financiero
      if(dc?.cierreFinanciero){
        const fin=dc.cierreFinanciero,ok=Math.abs(fin.total-cobrado)<0.01,col=ok?'#2a9d54':'#d48a1a',ico=ok?'✅':'⚠️';
        h+=`<div class="cierre-section" style="margin-top:12px;border-top:2px solid ${col};padding-top:12px;">`;
        h+=`<div class="cierre-section-title" style="color:${col};font-size:13px;">${ico} Cierre financiero (registro de caja)</div>`;
        h+=`<div class="cierre-row"><span class="cierre-nombre" style="font-weight:700;">Total cobrado real</span><span class="cierre-importe" style="color:${col};font-size:14px;">${eur(fin.total)}</span></div>`;
        h+=`<div class="cierre-row"><span class="cierre-nombre" style="color:#9ca3af;">${fin.transacciones} transacciones registradas</span></div>`;
        if(!ok){const diff=fin.total-cobrado,signo=diff>0?'+':'';h+=`<div class="cierre-row" style="margin-top:4px;"><span class="cierre-nombre" style="color:#d48a1a;font-size:11px;">Diferencia con cierre operativo: ${signo}${eur(diff)}</span></div>`;h+=`<div class="cierre-row"><span class="cierre-nombre" style="color:#9ca3af;font-size:10px;">Posible cambio de tarifa posterior al cobro</span></div>`;}
        h+=`</div>`;
      }

      // ─── v2.2.7: SECCIONES NUEVAS ─────────────────────────────────────
      const dcExt = this._datosCierreExt;

      // 1) Desglose fiscal IVA
      if(dcExt?.iva && Number(dcExt.iva.totalCobrado||0) > 0){
        const iv = dcExt.iva;
        h+=`<div class="cierre-section" style="margin-top:12px;border-top:2px solid #6B5B95;padding-top:12px;">`;
        h+=`<div class="cierre-section-title" style="color:#6B5B95;font-size:13px;">📋 Desglose fiscal (IVA ${iv.vatRate}%)</div>`;
        h+=`<div class="cierre-row"><span class="cierre-nombre">Total cobrado (IVA incluido)</span><span class="cierre-importe">${eur(iv.totalCobrado)}</span></div>`;
        if(Number(iv.totalPropinas||0) > 0){
          h+=`<div class="cierre-row"><span class="cierre-nombre" style="color:#9ca3af;">Propinas (sin IVA)</span><span class="cierre-importe" style="color:#9ca3af;">${eur(iv.totalPropinas)}</span></div>`;
          h+=`<div class="cierre-row"><span class="cierre-nombre">Total ventas (sin propinas)</span><span class="cierre-importe">${eur(iv.totalSinPropinas)}</span></div>`;
        }
        h+=`<div class="cierre-row" style="border-top:1px solid #e2e5ea;padding-top:6px;margin-top:4px;"><span class="cierre-nombre" style="font-weight:700;">Base imponible</span><span class="cierre-importe" style="font-weight:700;">${eur(iv.baseImponible)}</span></div>`;
        h+=`<div class="cierre-row"><span class="cierre-nombre" style="font-weight:700;color:#6B5B95;">Cuota IVA (${iv.vatRate}%)</span><span class="cierre-importe" style="font-weight:700;color:#6B5B95;">${eur(iv.cuotaIVA)}</span></div>`;
        h+=`</div>`;
      }

      // 2) Clientes del día (solo cobrados, ordenados por hora ASC desde backend)
      if(dcExt?.clientesDelDia && dcExt.clientesDelDia.length > 0){
        h+=`<div class="cierre-section" style="margin-top:12px;">`;
        h+=`<div class="cierre-section-title">👥 Clientes del día (${dcExt.clientesDelDia.length})</div>`;
        for(const cli of dcExt.clientesDelDia){
          const svcText = (cli.servicios||[]).map(s => esc(s.nombre)).join(', ');
          const metodoCol = {'Efectivo':'#8F1C5B','Tarjeta':'#4D8F8C','Bizum':'#D18C49','Mixto':'#7B68EE'}[cli.metodoPago] || '#9ca3af';
          h+=`<div class="cierre-row" style="flex-wrap:wrap;padding:6px 8px;border-bottom:1px solid #f0f1f3;">`;
          h+=`<span style="font-size:10px;color:#9ca3af;font-weight:600;min-width:36px;">${esc(cli.hora)}</span>`;
          h+=`<span style="flex:1;min-width:0;margin:0 8px;"><div style="font-weight:600;font-size:11px;">${esc(cli.nombre)}</div><div style="font-size:10px;color:#9ca3af;line-height:1.3;">${svcText}</div></span>`;
          h+=`<span class="cierre-importe">${eur(cli.total)}</span>`;
          h+=`<span style="font-size:9px;color:${metodoCol};font-weight:700;margin-left:6px;min-width:46px;text-align:right;">${esc(cli.metodoPago)}</span>`;
          h+=`</div>`;
        }
        h+=`</div>`;
      }

      // 3) Ventas TIENDA POS (productos standalone sin reserva)
      if(dcExt?.ventasPOS && dcExt.ventasPOS.length > 0){
        h+=`<div class="cierre-section" style="margin-top:12px;">`;
        h+=`<div class="cierre-section-title" style="color:#15803d;">🛒 Ventas Tienda POS (${dcExt.ventasPOS.length})</div>`;
        for(const v of dcExt.ventasPOS){
          const metodoCol = {'Efectivo':'#8F1C5B','Tarjeta':'#4D8F8C','Bizum':'#D18C49','Mixto':'#7B68EE'}[v.metodoPago] || '#9ca3af';
          const qtyStr = v.cantidad > 1 ? ` ×${v.cantidad}` : '';
          h+=`<div class="cierre-row" style="padding:6px 8px;border-bottom:1px solid #f0f1f3;">`;
          h+=`<span style="font-size:10px;color:#9ca3af;font-weight:600;min-width:36px;">${esc(v.hora)}</span>`;
          h+=`<span style="flex:1;min-width:0;margin:0 8px;"><div style="font-weight:600;font-size:11px;">${esc(v.producto)}${qtyStr}</div>${v.nombreCliente?`<div style="font-size:10px;color:#9ca3af;">${esc(v.nombreCliente)}</div>`:''}</span>`;
          h+=`<span class="cierre-importe">${eur(v.subtotal)}</span>`;
          h+=`<span style="font-size:9px;color:${metodoCol};font-weight:700;margin-left:6px;min-width:46px;text-align:right;">${esc(v.metodoPago)}</span>`;
          h+=`</div>`;
        }
        h+=`<div class="cierre-row" style="border-top:1px solid #e2e5ea;padding-top:6px;margin-top:4px;"><span class="cierre-nombre" style="font-weight:700;">Total Tienda POS</span><span class="cierre-importe" style="font-weight:700;color:#15803d;">${eur(dcExt.totalPOS||0)}</span></div>`;
        h+=`</div>`;
      }

      // v2.2.6: Slot del arqueo (siempre al final, lo rellena _renderArqueoResumen)
      h+=`<div id="cierreArqueoSlot" class="cierre-section" style="grid-column:1/-1;"></div>`;

      this.shadowRoot.getElementById('cierreGrid').innerHTML=h;
      // Si los datos del arqueo ya están cargados, repintarlos ahora
      if(this._arqueoData)this._renderArqueoResumen(this._arqueoData);
    }
  } // end class
  customElements.define('kamisuite-agenda', KamisuiteAgenda);
  console.log(`${TAG} Registrado.`);
})();