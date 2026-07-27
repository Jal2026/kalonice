// =====================================================
// KAMISUITE — Page Code: /reservar/{slug}
// =====================================================
// VERSION: 0.3.4
// FECHA: 5 de julio de 2026
//
// v0.3.4:
//   + Reenvía `durationMin` (duración total de la cita) desde el evento
//     'reservar' del widget al backend crearReservaPublica. El backend
//     v0.7.9 lo usa para resolver 'Cualquiera' comprobando que el
//     profesional esté libre en el bloque continuo COMPLETO que
//     getHuecosDisponibles ya validó (máxima seguridad; el PROCESO no se
//     libera al público en el arranque de V2). Sin este campo, el backend
//     cae a la duración base del principal (riesgo de solape en cascadas
//     con complementos). Cambio quirúrgico: UNA propiedad añadida al
//     objeto pasado a crearReservaPublica. Cero cambios en el resto del
//     handler ni en imports, ni en los otros handlers ('pedir-huecos',
//     'navigate-back'), ni en helpers. Se CONSERVA `varianteSel` de v0.3.3.
//
// v0.3.3:
//   + Reenvía `varianteSel` desde el evento 'reservar' del widget al
//     backend crearReservaPublica. Requerido para el soporte de variantes
//     del servicio PRINCIPAL en el widget público (kamisuite-widget-bundle
//     v2.0.14, widgetPublicoLogic v0.7.5). Sin esta línea, la variante
//     elegida se pierde en el page code y el backend crea la reserva con
//     el precio/duración base del servicio. Cambio quirúrgico: UNA
//     propiedad añadida al objeto pasado a crearReservaPublica. Cero
//     cambios en el resto del handler ni en imports, ni en los otros
//     handlers ('pedir-huecos', 'navigate-back'), ni en helpers.
//
// v0.3.2:
//   + Reenvía `idStaffPermitidos` desde el evento 'pedir-huecos' del
//     widget al backend getHuecosDisponibles. Requerido por filtro de
//     staff por servicio (widgetPublicoLogic v0.6.0).
//
// v0.3.1: fix race condition listeners ANTES de setAttribute(data-config).
// v0.3.0: resolución wix:image:// → HTTPS.
// v0.2.0: Custom Element nativo.
//   El widget se registra en Wix como Custom Element apuntando al JS
//   subido en el menú "Custom Elements". Comunicación directa vía
//   `setAttribute('data-config', JSON.stringify(...))` para pasar datos
//   complejos y `.on('eventName', handler)` para recibir acciones del
//   widget (reservar, pedir-huecos, navigate-back).
//   Quita: handshake, bucle init, complejidad postMessage.
//
// v0.1.0: patrón iframe + postMessage (descartado a petición de Jal).
//
// SUPUESTOS WIX STUDIO:
//   - Página dinámica conectada al dataset de HairSalonServices, o
//     página estática que lee slug desde wixLocation.path.
//   - Un Custom Element en la página con id #widgetReserva apuntando al
//     archivo JS subido (kr-widget.js v2.0) y tag name `kami-reserva`.
//   - Cabecera (imagen + título + descripción) puede pintarse con
//     elementos Wix conectados al dataset (la maneja el dataset) o
//     dentro del widget (la maneja el widget recibiendo `categoria`
//     en el data-config). Este page code soporta ambos: si existen los
//     $w('#cabeceraXxx') los rellena; si no, deja que el widget pinte.
// =====================================================

import wixLocation from 'wix-location';
import { currentMember } from 'wix-members-frontend';
import {
  getServiciosCategoria,
  getProfesionalesPublicos,
  getSalonConfig,
  getHuecosDisponibles,
  crearReservaPublica
} from 'backend/widgetPublicoLogic.web';

const TAG = '[ReservarPage][v0.3.4]';

// Estado de la página
let ctx = {
  slug: '',
  categoria: null,
  servicios: [],
  profesionales: [],
  salonConfig: null,
  memberInfo: null
};

$w.onReady(async () => {
  console.log(`${TAG} 🚀 init`);

  // 1) Slug desde URL
  ctx.slug = (wixLocation.path?.[0] || '').trim();
  if (!ctx.slug) {
    console.warn(`${TAG} ⚠️ No hay slug en la URL`);
    mostrarError('No se ha detectado la categoría.');
    return;
  }
  console.log(`${TAG} 📍 slug=${ctx.slug}`);

  // 2) Miembro logueado (no bloquea si no hay)
  ctx.memberInfo = await leerMiembroLogueado();
  if (ctx.memberInfo) {
    console.log(`${TAG} 👤 miembro logueado: ${ctx.memberInfo.firstName} (${ctx.memberInfo.contactId?.substring(0,8)}…)`);
  }

  // 3) Cargar catálogo + profesionales + salonConfig en paralelo
  try {
    const [resServicios, resPros, resConfig] = await Promise.all([
      getServiciosCategoria({ slug: ctx.slug }),
      getProfesionalesPublicos(),
      getSalonConfig()
    ]);

    if (!resServicios?.ok) {
      mostrarError(resServicios?.error?.message || 'No se ha podido cargar la categoría.');
      return;
    }
    ctx.categoria = resServicios.categoria;
    ctx.servicios = resServicios.servicios || [];
    ctx.profesionales = resPros?.profesionales || [];
    ctx.salonConfig = resConfig?.config || { widgetSkin: 'niebla', salonName: '' };

    console.log(`${TAG} ✅ ${ctx.servicios.length} servicios | ${ctx.profesionales.length} pros | skin=${ctx.salonConfig.widgetSkin}`);

    if (ctx.servicios.length === 0) {
      mostrarError('Esta categoría no tiene servicios disponibles ahora mismo.');
      return;
    }
  } catch (e) {
    console.error(`${TAG} ❌ carga datos:`, e.message);
    mostrarError('Error al cargar la página. Inténtalo más tarde.');
    return;
  }

  // 4) Cabecera nativa (si existe en la página, opcional)
  pintarCabeceraNativaSiExiste();

  // 5) Montar custom element
  montarCustomElement();
});

// =====================================================
// MIEMBRO LOGUEADO (idéntico patrón a V1)
// =====================================================
async function leerMiembroLogueado() {
  try {
    const member = await currentMember.getMember();
    if (!member?.contactId) return null;
    const cd = member.contactDetails || {};
    const firstPhone = (Array.isArray(cd.phones) && cd.phones[0]) || '';
    return {
      contactId: member.contactId,
      firstName: cd.firstName || '',
      lastName: cd.lastName || '',
      email: member.loginEmail || cd.email || '',
      phone: firstPhone
    };
  } catch (e) {
    // Wix lanza si no hay miembro autenticado; visitante anónimo.
    return null;
  }
}

// =====================================================
// CABECERA NATIVA (opcional)
// =====================================================
// Si la página tiene Image/Text conectados al dataset, se pintan solos.
// Esta función rellena $w('#cabeceraXxx') si existen, ignora silencio-
// samente si no.
function pintarCabeceraNativaSiExiste() {
  const cat = ctx.categoria;
  if (!cat) return;
  const safe = (id, prop, value) => {
    try {
      const el = $w(id);
      if (el && value) {
        if (prop === 'text') el.text = value;
        else if (prop === 'src') el.src = value;
      }
    } catch (e) { /* el elemento no existe: ok */ }
  };
  safe('#cabeceraTitle', 'text', cat.title);
  safe('#cabeceraSubtitle', 'text', cat.subtitle);
  safe('#cabeceraDescription', 'text', cat.description);
  safe('#cabeceraImage', 'src', cat.image);
}

// =====================================================
// MONTAR CUSTOM ELEMENT
// =====================================================
// Patrón Wix Velo Custom Element:
//   1. setAttribute('data-config', JSON.stringify(...)) — datos complejos.
//   2. .on('eventName', handler) — eventos custom que emite el widget.
//
// El custom element observa 'data-config' en attributeChangedCallback y
// se monta/repinta cuando cambia. Si se monta antes de que asignemos,
// también lo leerá en su connectedCallback.

function montarCustomElement() {
  let widget;
  try {
    widget = $w('#widgetReserva');
  } catch (e) {
    console.error(`${TAG} ❌ No existe #widgetReserva en la página`);
    return;
  }
  if (!widget) {
    console.error(`${TAG} ❌ #widgetReserva no resuelto`);
    return;
  }

  // Config completo pasado como JSON serializado en data-config.
  // El widget v2.0 parsea esto en attributeChangedCallback('data-config').
  const config = {
    categoria: ctx.categoria,
    servicios: ctx.servicios,
    profesionales: ctx.profesionales,
    salonConfig: ctx.salonConfig,
    memberInfo: ctx.memberInfo,
    hoyISO: nuevoHoyMadridISO()
  };

  // v0.3.0 — convertir TODAS las URLs `wix:image://...` a HTTPS antes
  // de inyectar al widget. Sin esto, las imágenes salen rotas en el
  // navegador (ERR_UNKNOWN_URL_SCHEME).
  resolverImagenesEnObjeto(config);

  // v0.3.1 — REGISTRAR LISTENERS ANTES del setAttribute('data-config').
  // El widget al recibir data-config se monta inmediatamente y dispara
  // su primer 'pedir-huecos'. Si los listeners se registran DESPUÉS,
  // ese primer evento se PIERDE (race condition) y el widget queda
  // colgado en "Calculando…" esperando una respuesta que nunca llega.
  // El bug estaba latente desde v0.2.0; la primera prueba funcionó
  // por pura suerte de timing del navegador.

  widget.on('pedir-huecos', async (event) => {
    const d = event?.detail || {};
    try {
      const res = await getHuecosDisponibles({
        fecha: d.fecha,
        proId: d.proId,
        durationMin: d.durationMin,
        idStaffPermitidos: Array.isArray(d.idStaffPermitidos) ? d.idStaffPermitidos : []
      });
      // Devolver al widget vía atributo dedicado.
      // Patrón: cada respuesta tiene un requestId que el widget genera
      // para correlacionar. Se serializa en data-huecos-response.
      widget.setAttribute('data-huecos-response', JSON.stringify({
        requestId: d.requestId,
        fecha: d.fecha,
        proId: d.proId,
        huecos: res?.huecos || [],
        ok: !!res?.ok,
        ts: Date.now()   // fuerza re-trigger del attributeChangedCallback
      }));
    } catch (e) {
      widget.setAttribute('data-huecos-response', JSON.stringify({
        requestId: d.requestId,
        fecha: d.fecha,
        proId: d.proId,
        huecos: [],
        ok: false,
        error: e.message,
        ts: Date.now()
      }));
    }
  });

  widget.on('reservar', async (event) => {
    const d = event?.detail || {};
    try {
      const res = await crearReservaPublica({
        fecha: d.fecha,
        horaHHmm: d.horaHHmm,
        principalSetupUid: d.principalSetupUid,
        complementosSetupUid: d.complementosSetupUid || [],
        // v0.3.3 — Variante del servicio principal (si el servicio tiene
        // hasVariants=true en ServiceCatalog). El widget bundle v2.0.14
        // la construye a partir del chip elegido con el patrón
        // {idx, label, price, duration} — copia literal del formato que
        // usa recepcionProCMS_widget v1.1.54 líneas 3817-3831. Si no hay
        // variante (servicio simple sin variantes), viaja null y el
        // backend crearPackReserva usa el precio/duración base del
        // ServiceCatalog. Retrocompatibilidad total.
        varianteSel: d.varianteSel || null,
        // v0.3.4 — Duración TOTAL de la cita (la misma que el widget envía
        // a getHuecosDisponibles). El backend v0.7.9 la usa para resolver
        // 'Cualquiera' comprobando el bloque continuo completo. Si no
        // llega (bundle antiguo), el backend cae a la duración base.
        durationMin: d.durationMin,
        staffId: d.staffId,
        staffName: d.staffName || '',
        contactDetails: d.contactDetails || {},
        memberContactId: d.memberContactId || ctx.memberInfo?.contactId || '',
        notas: d.notas || ''
      });
      widget.setAttribute('data-reserva-response', JSON.stringify({
        requestId: d.requestId,
        ok: !!res?.ok,
        reservaId: res?.reservaId || null,
        precioTotal: res?.precioTotal || 0,
        fases: res?.fases || [],
        error: res?.ok ? null : (res?.error?.message || 'Error creando reserva'),
        ts: Date.now()
      }));
    } catch (e) {
      widget.setAttribute('data-reserva-response', JSON.stringify({
        requestId: d.requestId,
        ok: false,
        error: e.message,
        ts: Date.now()
      }));
    }
  });

  widget.on('navigate-back', () => {
    wixLocation.to('/servicios');
  });

  // Ahora SÍ inyectamos el config — listeners ya están escuchando.
  try {
    widget.setAttribute('data-config', JSON.stringify(config));
    console.log(`${TAG} ✅ data-config inyectado al custom element`);
  } catch (e) {
    console.error(`${TAG} ❌ Error inyectando config:`, e.message);
    return;
  }
}

// =====================================================
// HELPERS
// =====================================================

// Hoy en formato YYYY-MM-DD en horario Madrid. El sistema puede estar
// en otro TZ (servidor Wix), por eso lo formateamos explícitamente.
function nuevoHoyMadridISO() {
  const ahora = new Date();
  const madridStr = ahora.toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });
  return madridStr; // 'YYYY-MM-DD'
}

// Convierte una URL Wix interna en HTTPS pública.
// Wix CMS guarda imágenes como `wix:image://v1/<mediaId>/<filename>#<params>`.
// El navegador no entiende ese esquema (ERR_UNKNOWN_URL_SCHEME). Hay que
// extraer el mediaId y reconstruir una URL HTTPS a static.wixstatic.com.
//
// Patrón confirmado en la captura del log:
//   wix:image://v1/fb4d18_e0161d67addd461bb129274851e530cf~mv2.jpg/cejascolor.jpg#originWidth=1122&originHeight=1402
//   → https://static.wixstatic.com/media/fb4d18_e0161d67addd461bb129274851e530cf~mv2.jpg
function wixImageToHttps(wixImageStr) {
  if (!wixImageStr || typeof wixImageStr !== 'string') return wixImageStr;
  // Si ya es URL HTTPS (futuro: si Wix decide convertir antes), no tocar.
  if (wixImageStr.startsWith('http://') || wixImageStr.startsWith('https://')) {
    return wixImageStr;
  }
  // Patrón Wix: wix:image://v1/<mediaId>/<filename>#<params>
  const match = wixImageStr.match(/^wix:image:\/\/v1\/([^/]+)\//);
  if (!match) return wixImageStr; // no es Wix image: devolver tal cual
  const mediaId = match[1];
  return `https://static.wixstatic.com/media/${mediaId}`;
}

// Recorre un objeto resolviendo TODAS las propiedades `image` que
// contengan URLs Wix internas. Funciona recursivamente sobre arrays
// y objetos anidados. Devuelve el objeto modificado en su lugar
// (también devuelto explícitamente para encadenado).
function resolverImagenesEnObjeto(obj) {
  if (!obj) return obj;
  if (Array.isArray(obj)) {
    obj.forEach(it => resolverImagenesEnObjeto(it));
    return obj;
  }
  if (typeof obj !== 'object') return obj;
  Object.keys(obj).forEach(k => {
    const v = obj[k];
    if (k === 'image' && typeof v === 'string') {
      obj[k] = wixImageToHttps(v);
    } else if (v && typeof v === 'object') {
      resolverImagenesEnObjeto(v);
    }
  });
  return obj;
}

function mostrarError(mensaje) {
  console.warn(`${TAG} ⚠️ ${mensaje}`);
  try {
    const box = $w('#errorBox');
    if (box) {
      box.text = mensaje;
      box.show?.();
    }
  } catch (e) { /* ok */ }
}