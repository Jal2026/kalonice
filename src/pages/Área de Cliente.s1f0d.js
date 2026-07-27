// =====================================================
// KAMISUITE — Page Code: /area-cliente
// =====================================================
// VERSION: 1.3.7
//
// v1.3.7 — Fallback del skin alineado con el resto del sistema.
//   - `ctx.skin` y `getSalonConfig` caen a 'niebla' (default sistema)
//     en vez de 'oceano'. Coherente con widget público de reservas,
//     bonos, PRIME y tarjetas promocionales, todos con default 'niebla'.
//   - Comentario de sección 2 actualizado.
//   - Sin cambios funcionales. Solo cadenas de fallback.
//   - Pareja con CE v1.2.0 que ya tiene los 7 skins embebidos.
//
// VERSION: 1.3.6
//
// v1.3.6 — URL de reserva configurable desde SalonConfig.urlBooking.
//   - Los handlers `reservarCita` (botón "Reservar una cita" del
//     estado vacío de próximas citas) y `repetirServicio` (botón
//     "Repetir" del historial de visitas) leían `/reservar`
//     hardcoded. Ahora usan `ctx.urlBooking` que llega en el payload
//     del backend v1.6.4 (`data.salon.urlBooking`).
//   - `ctx.urlBooking` se actualiza en cada `cargarDatos()` con el
//     valor devuelto por el backend (absoluta o path). Si viene
//     vacío o falta, se cae al fallback `/reservar` (comportamiento
//     v1.3.5 idéntico — cero regresión).
//   - Cero cambios en el Custom Element (v1.1.0 sigue emitiendo los
//     mismos eventos `reservarCita` y `repetirServicio` sin saber
//     el destino, que es responsabilidad del page code).
//
// VERSION: 1.3.5
// FECHA:   1 de julio de 2026
// ARCHIVO: page code de la página Área de Cliente
//
// v1.3.5 — Ampliación bloque "Club {brandName}" (backend v1.6.0+).
//   El backend clienteAreaLogic.web.js v1.6.0+ devuelve cuatro nuevos
//   campos en el snapshot: `salon`, `prime`, `bonos`, `tarjetas`. Sin
//   propagarlos al Custom Element via pushConfig, el widget v1.1.0+
//   los recibe undefined → guards `|| {}` internos pintan el estado
//   "no tienes" con botón ADQUIRIR deshabilitado y el título del
//   bloque queda como "Club" a secas (sin brandName).
//
//   Cambios:
//     · pushConfig de `cargarDatos` ahora incluye salon/prime/bonos/tarjetas.
//     · RETIRADO `club: r.club` — el backend v1.6.0+ ya no devuelve
//       ese bloque (v1.5.x lo devolvía; la lógica del socio se reemplaza
//       por PRIME + Bonos + Tarjetas).
//     · Actualizada la línea de REUTILIZA a v1.6.1.
//
//   NO cambia nada más. Listeners, foto, mover-cita, repetir-compra,
//   scroll — intactos.
//
// v1.3.4 — FIX Club KALONICE: añadido `club: r.club` al pushConfig de
//   cargarDatos. El backend clienteAreaLogic.web.js v1.5.2 devuelve
//   correctamente el bloque `club: { activo, imagen, url }` pero el
//   page code lo descartaba al armar el data-config: el Custom Element
//   v1.0.12 leía `this._data.club` y siempre encontraba undefined →
//   `clubImg = ''`, `clubUrl = ''`, `esSocio = false`. Resultado: la
//   imagen no aparecía, el href estaba vacío y "HAZTE SOCIO" salía
//   incluso para socios activos.
//
//   Cambio quirúrgico: UNA línea añadida en `cargarDatos`. Nada más
//   tocado. Backend, Custom Element y resto del page code intactos.
//
// v1.3.3 — HOTFIX SSR (ReferenceError: HTMLElement is not defined).
//   `wix-ecom-frontend` es un módulo FRONTEND-ONLY del navegador.
//   Cuando se importa en top-level del page code, Wix Velo intenta
//   cargarlo también en SSR (renderizado server para SEO/preview),
//   donde HTMLElement no existe → toda la página falla.
//   Fix: import DINÁMICO dentro del handler `repetirCompra`, que solo
//   se ejecuta en el navegador (donde HTMLElement sí existe).
//   `wix-window` se queda en top-level porque ES universal (safe SSR).
//
// v1.3.2 — Dos fixes:
//   1) Refrescar icono de carrito tras "Repetir compra".
//      Antes el producto se añadía al carrito server-side pero el
//      contador del icono de carrito del header no se actualizaba
//      hasta refrescar la página. Solución oficial Wix:
//      wixEcomFrontend.refreshCart() tras añadir al carrito.
//      Confirmado en docs:
//      https://dev.wix.com/docs/velo/api-reference/wix-ecom-frontend/refresh-cart
//
//   2) Scroll del nav lateral en escritorio.
//      window.scrollTo del Custom Element no funcionaba en Wix Studio
//      porque el scroll real está en un wrapper interno. El Custom
//      Element v1.0.10 ahora emite 'scrollToY' con la coordenada Y
//      absoluta y el page code llama a wixWindow.scrollTo (API oficial
//      Wix). Confirmado en docs:
//      https://dev.wix.com/docs/velo/apis/wix-window-frontend/scroll-to
//
// v1.3.1 — Cambio quirúrgico: pasar memberId al backend para que
//   cambiarFotoContacto pueda sincronizar Wix Members además de
//   Wix Contacts. ctx.memberId ya estaba disponible (línea 120) desde
//   v1.1.0 pero no se enviaba. Una sola línea cambia.
//
// v1.3.0 — Repetir compra REAL:
//   · El listener 'repetirCompra' (antes redirigía a /tienda sin
//     añadir nada) ahora llama al backend repetirCompraCliente que
//     añade el producto al carrito Wix Stores via currentCart.
//   · NO redirige a otra página: el cliente sigue en /area-cliente.
//     El icono de carrito del header del sitio se actualiza solo (Wix
//     lo hace nativamente). El Custom Element ya muestra toast
//     "Añadido al carrito" al click.
//   · Si el productId está vacío (producto borrado de Wix Stores),
//     log de warning y no se llama al backend.
//
// v1.2.0 — Mover cita real:
//   · NEW listener 'pedirHuecosMover'. Cuando el cliente elige un día
//     en el datepicker del Custom Element, este emite el evento con
//     {reservaId, fecha, requestId}. El page code llama al backend
//     getHuecosCambioReserva y devuelve los huecos al widget vía
//     setAttribute('data-huecos-response', JSON). Mismo patrón que
//     el widget público de reservas.
//   · CHANGE listener 'moverCita'. Antes era mockup (solo recargaba
//     datos). Ahora llama a moverCitaCliente del backend, que valida
//     disponibilidad + delega en reprogramarReserva. Si el backend
//     devuelve error (slot ya ocupado), el listener simplemente recarga
//     y el Custom Element verá la cita en su fecha original.
//   · Botón "Confirmar cambio" se deshabilita durante la llamada para
//     prevenir doble click.
//
// v1.1.2 — Handler subirFoto real: convierte File a base64 con FileReader
//   y llama al backend cambiarFotoContacto (v1.2.2). Tras éxito, recarga
//   datos para que el Custom Element pinte la foto nueva.
//
// v1.1.1 — Pasa memberId además de memberContactId al backend.
//   currentMember.getMember()._id es el memberId. El backend v1.2.1
//   lo usa para leer badges nativas Wix Members. Sin esto, badges
//   queda vacío y la pill VIP no muestra el title real.
//
// v1.1.0 — Eventos alineados con kami-area-cliente.js v1.0.3 (diseño
//   original de Claude Design). Nombres distintos respecto a v1.0.0:
//     · 'guardarPerfil'    → detail viene como {nombre,apellido,...}
//                            directos (no envuelto en {cambios})
//     · 'editarNotaCliente' → reemplaza 'appendNota'. detail: {texto}
//     · 'cancelarCita'      → detail.id (no detail.reservaId)
//     · 'reservarCita'      → reemplaza 'reservarNueva'
//     · 'reintentarSesion'  → reemplaza 'reintentar'
//     · 'moverCita'         → NUEVO. detail: {id, nuevaFecha, nuevaHora}
//                            Backend v1.1.0 NO implementa moverCitaCliente.
//                            Recargamos snapshot real al recibirlo.
//     · 'repetirServicio'   → detail.categoria (no detail.family)
//     · 'repetirCompra'     → detail.productoId
//
// FLUJO:
//   1) Validar sesión miembro (wix-members currentMember.getMember).
//   2) Resolver skin del salón desde SalonConfig (default 'niebla').
//   3) Registrar listeners ANTES de pasar config (anti race-condition).
//   4) Pushear estado 'cargando' al widget vía setAttribute('data-config').
//   5) Llamar getAreaCliente y pushear el snapshot real.
//   6) Escuchar eventos del widget y enrutar al backend correspondiente,
//      recargando el snapshot tras cada mutación (anti drift).
//
// REQUISITOS DEL EDITOR WIX:
//   · Custom Element nativo apuntando a kami-area-cliente.js v1.1.0+,
//     tag "kami-area-cliente", id "widgetCliente".
//   · Página protegida por miembro logueado.
//
// REUTILIZA:
//   · backend/clienteAreaLogic.web v1.6.1
//   · backend/widgetPublicoLogic.web v0.6.0 (solo getSalonConfig)
// =====================================================

import wixLocation from 'wix-location';
import wixWindow from 'wix-window';
import { currentMember } from 'wix-members';
import {
  getAreaCliente,
  updatePerfilCliente,
  appendNotaCliente,
  cancelarCitaCliente,
  cambiarFotoContacto,
  getHuecosCambioReserva,
  moverCitaCliente,
  repetirCompraCliente
} from 'backend/clienteAreaLogic.web';
import { getSalonConfig } from 'backend/widgetPublicoLogic.web';

const TAG = '[ClienteAreaPage][v1.3.7]';

const ctx = {
  memberContactId: null,
  widget: null,
  skin: 'niebla',
  urlBooking: '' // v1.3.6 — se rellena en cargarDatos con SalonConfig.urlBooking
};

$w.onReady(async () => {
  console.log(`${TAG} 🚀 init`);

  ctx.widget = $w('#widgetCliente');
  if (!ctx.widget) {
    console.error(`${TAG} ❌ No se encuentra Custom Element #widgetCliente`);
    return;
  }

  // 1) Validar sesión miembro
  let member;
  try {
    member = await currentMember.getMember();
  } catch (e) {
    console.warn(`${TAG} ⚠️ currentMember.getMember falló:`, e.message);
  }
  if (!member || !member.contactId) {
    console.warn(`${TAG} ⚠️ Sin sesión miembro — redirigiendo`);
    wixLocation.to('/');
    return;
  }
  ctx.memberContactId = member.contactId;
  ctx.memberId = member._id || '';
  console.log(`${TAG} ✅ Miembro logueado: contactId=${ctx.memberContactId} memberId=${ctx.memberId}`);

  // 2) Resolver skin del salón
  try {
    const r = await getSalonConfig();
    ctx.skin = r?.config?.widgetSkin || 'niebla';
    console.log(`${TAG} 🎨 Skin: ${ctx.skin}`);
  } catch (e) {
    console.warn(`${TAG} ⚠️ getSalonConfig falló — fallback 'niebla':`, e.message);
  }

  // 3) Registrar listeners ANTES de pushear data-config
  wireListeners();

  // 4) Estado cargando
  pushConfig({ estado: 'cargando' });

  // 5) Cargar snapshot real
  await cargarDatos();
});

// Empaqueta { skin, data } en JSON y lo envía vía setAttribute.
function pushConfig(data) {
  const payload = { skin: ctx.skin, data };
  ctx.widget.setAttribute('data-config', JSON.stringify(payload));
}

async function cargarDatos() {
  try {
    const r = await getAreaCliente({
      memberContactId: ctx.memberContactId,
      memberId: ctx.memberId
    });
    if (!r || !r.ok) {
      console.error(`${TAG} ❌ getAreaCliente:`, r?.error?.message || 'desconocido');
      pushConfig({ estado: 'error' });
      return;
    }
    // v1.3.6 — Capturamos la URL de reserva del payload para usarla
    // en los handlers `reservarCita` y `repetirServicio`. Puede ser
    // absoluta o path interno. Vacía → fallback /reservar en handler.
    ctx.urlBooking = String(r?.salon?.urlBooking || '').trim();
    pushConfig({
      estado: 'cargada',
      cliente:       r.cliente,
      notaCliente:   r.notaCliente,
      notasPublicas: r.notasPublicas,
      proximas:      r.proximas,
      anteriores:    r.anteriores,
      productos:     r.productos,
      puntos:        r.puntos,
      expediente:    r.expediente,
      // v1.3.5 — bloque "Club {brandName}" del backend v1.6.0+.
      // Sin estos cuatro campos el widget recibe undefined y pinta
      // el estado "no tienes" aunque el cliente sí tenga PRIME/bonos.
      // También el título del bloque queda como "Club" a secas sin
      // el brandName. RETIRADO `club: r.club` porque el backend ya
      // no lo devuelve (sustituido por PRIME + Bonos + Tarjetas).
      salon:         r.salon,
      prime:         r.prime,
      bonos:         r.bonos,
      tarjetas:      r.tarjetas
    });
  } catch (e) {
    console.error(`${TAG} ❌ cargarDatos:`, e.message);
    pushConfig({ estado: 'error' });
  }
}

function wireListeners() {
  const w = ctx.widget;

  // --- guardar perfil (READ-MERGE-UPDATE en Wix Contacts) ---
  // v1.1.0: detail = { nombre, apellido, sexo, dni, email, telefono, foto }
  // directamente, no envuelto en { cambios }.
  w.on('guardarPerfil', async (event) => {
    const cambios = event.detail || {};
    if (!Object.keys(cambios).length) return;
    console.log(`${TAG} → guardarPerfil`, Object.keys(cambios).join(','));
    try {
      const r = await updatePerfilCliente({
        memberContactId: ctx.memberContactId,
        cambios
      });
      if (!r.ok) console.warn(`${TAG} ⚠️ updatePerfilCliente:`, r.error?.message);
    } catch (e) {
      console.error(`${TAG} ❌ updatePerfilCliente:`, e.message);
    }
    await cargarDatos();
  });

  // --- subir foto ---
  // v1.1.2: convierte el File a base64 con FileReader y llama al
  // backend cambiarFotoContacto que sube a Media Manager + actualiza
  // contacto en Wix CRM con picture:{image:URL, imageProvider:'EXTERNAL'}.
  w.on('subirFoto', async (event) => {
    const { file } = event.detail || {};
    if (!file) {
      console.warn(`${TAG} → subirFoto sin file`);
      return;
    }
    console.log(`${TAG} → subirFoto ${file.name} (${file.size} bytes, ${file.type})`);

    // Límite defensivo de 10MB
    if (file.size > 10 * 1024 * 1024) {
      console.warn(`${TAG} ⚠️ archivo demasiado grande: ${file.size} bytes`);
      return;
    }

    try {
      const base64Data = await fileToBase64(file);
      const r = await cambiarFotoContacto({
        memberContactId: ctx.memberContactId,
        memberId: ctx.memberId,
        base64Data,
        fileName: file.name || 'foto.jpg',
        mimeType: file.type || 'image/jpeg'
      });
      if (!r?.ok) {
        console.error(`${TAG} ❌ cambiarFotoContacto:`, r?.error?.message || 'desconocido');
        return;
      }
      console.log(`${TAG} ✅ foto cambiada → ${r.imageUrl} (members=${r.membersUpdated ? 'sí' : 'no'})`);
      await cargarDatos();
    } catch (e) {
      console.error(`${TAG} ❌ subirFoto:`, e.message);
    }
  });

  // --- añadir nota al salón (append histórico V1) ---
  // v1.1.0: evento 'editarNotaCliente', detail: { texto }.
  w.on('editarNotaCliente', async (event) => {
    const { texto } = event.detail || {};
    if (!texto) return;
    console.log(`${TAG} → editarNotaCliente "${String(texto).substring(0, 60)}"`);
    try {
      const r = await appendNotaCliente({
        memberContactId: ctx.memberContactId,
        mensaje: texto
      });
      if (!r.ok) console.warn(`${TAG} ⚠️ appendNotaCliente:`, r.error?.message);
    } catch (e) {
      console.error(`${TAG} ❌ appendNotaCliente:`, e.message);
    }
    await cargarDatos();
  });

  // --- cancelar cita ---
  // v1.1.0: detail.id (no detail.reservaId).
  w.on('cancelarCita', async (event) => {
    const { id } = event.detail || {};
    if (!id) return;
    console.log(`${TAG} → cancelarCita ${id}`);
    try {
      const r = await cancelarCitaCliente({
        memberContactId: ctx.memberContactId,
        reservaId: id
      });
      if (!r.ok) console.warn(`${TAG} ⚠️ cancelarCitaCliente:`, r.error?.message);
    } catch (e) {
      console.error(`${TAG} ❌ cancelarCitaCliente:`, e.message);
    }
    await cargarDatos();
  });

  // --- pedir huecos para mover cita ---
  // v1.2.0 — El Custom Element emite este evento cuando el cliente
  // cambia el día en el datepicker del modal de mover-cita. Llamamos
  // al backend getHuecosCambioReserva que reutiliza el motor real
  // de widgetPublicoLogic con excludeReservaId (la propia reserva no
  // debe contarse como ocupada de sí misma). Devolvemos al widget vía
  // data-huecos-response (mismo patrón que el widget público).
  //
  // El requestId permite al widget descartar respuestas tardías de
  // requests obsoletas (cliente cambió día rápidamente).
  w.on('pedirHuecosMover', async (event) => {
    const d = event?.detail || {};
    const { reservaId, fecha, requestId } = d;
    if (!reservaId || !fecha) {
      console.warn(`${TAG} ⚠️ pedirHuecosMover sin reservaId o fecha`);
      return;
    }
    console.log(`${TAG} → pedirHuecosMover reserva=${reservaId} fecha=${fecha}`);
    try {
      const r = await getHuecosCambioReserva({
        memberContactId: ctx.memberContactId,
        reservaId,
        fecha
      });
      w.setAttribute('data-huecos-response', JSON.stringify({
        requestId: requestId || '',
        reservaId,
        fecha,
        ok: !!r?.ok,
        huecos: r?.huecos || [],
        motivo: r?.motivo,
        error: r?.error?.message || null,
        ts: Date.now()
      }));
    } catch (e) {
      console.error(`${TAG} ❌ pedirHuecosMover:`, e.message);
      w.setAttribute('data-huecos-response', JSON.stringify({
        requestId: requestId || '',
        reservaId,
        fecha,
        ok: false,
        huecos: [],
        error: e.message,
        ts: Date.now()
      }));
    }
  });

  // --- mover cita ---
  // v1.2.0 — Llamada real al backend moverCitaCliente (era mockup en
  // v1.1.x). El backend valida ownership + revalida disponibilidad +
  // delega en reprogramarReserva. Tras éxito o error, recargamos
  // snapshot para que el Custom Element refleje el estado real.
  w.on('moverCita', async (event) => {
    const { id, nuevaFecha, nuevaHora } = event.detail || {};
    if (!id || !nuevaFecha || !nuevaHora) {
      console.warn(`${TAG} ⚠️ moverCita sin id/fecha/hora`);
      return;
    }
    console.log(`${TAG} → moverCita ${id} → ${nuevaFecha} ${nuevaHora}`);
    try {
      const r = await moverCitaCliente({
        memberContactId: ctx.memberContactId,
        reservaId: id,
        nuevaFecha,
        nuevaHora
      });
      if (!r?.ok) {
        console.warn(`${TAG} ⚠️ moverCitaCliente ko:`, r?.error?.message || 'desconocido');
      } else {
        console.log(`${TAG} ✅ Cita ${id} movida a ${r.fechaReserva}`);
      }
    } catch (e) {
      console.error(`${TAG} ❌ moverCitaCliente:`, e.message);
    }
    await cargarDatos();
  });

  // --- reservar cita nueva (estado vacío de próximas) ---
  // v1.3.6 — Destino leído de ctx.urlBooking (SalonConfig.urlBooking).
  // Puede ser absoluta ("https://.../reservar") o path ("/reservar").
  // Si viene vacía, fallback silencioso a "/reservar" (v1.3.5 idéntico).
  w.on('reservarCita', () => {
    const dest = ctx.urlBooking || '/reservar';
    console.log(`${TAG} → reservarCita → ${dest}`);
    wixLocation.to(dest);
  });

  // --- repetir servicio ---
  // v1.1.0: detail.categoria (no detail.family).
  // v1.3.6: destino desde ctx.urlBooking, mismo criterio que reservarCita.
  w.on('repetirServicio', (event) => {
    const { categoria, anteriorId } = event.detail || {};
    const dest = ctx.urlBooking || '/reservar';
    console.log(`${TAG} → repetirServicio anterior=${anteriorId} categoria=${categoria} → ${dest}`);
    wixLocation.to(dest);
  });

  // --- repetir compra ---
  // v1.3.0 — Llamada real al backend repetirCompraCliente.
  // El Custom Element ahora emite productoId = productId Wix Stores
  // (no el li._id histórico). El backend añade al carrito vía
  // currentCart.addToCurrentCart. No redirigimos: el cliente sigue en
  // /area-cliente y ve el contador de carrito del header actualizado.
  w.on('repetirCompra', async (event) => {
    const { productoId } = event.detail || {};
    if (!productoId) {
      console.warn(`${TAG} ⚠️ repetirCompra sin productoId (producto borrado de Wix Stores?)`);
      return;
    }
    console.log(`${TAG} → repetirCompra productId=${productoId}`);
    try {
      const r = await repetirCompraCliente({
        memberContactId: ctx.memberContactId,
        productId: productoId,
        quantity: 1
      });
      if (!r?.ok) {
        console.warn(`${TAG} ⚠️ repetirCompraCliente ko:`, r?.error?.message || 'desconocido');
      } else {
        console.log(`${TAG} ✅ Producto añadido al carrito (${r.lineItemsCount} items totales)`);
        // v1.3.2 — Refrescar el icono de carrito del header del sitio.
        // v1.3.3 FIX — import DINÁMICO porque wix-ecom-frontend es
        // frontend-only y rompe SSR si se importa en top-level
        // (ReferenceError: HTMLElement is not defined al pre-render
        // la página). Al importarlo aquí dentro, solo se carga cuando
        // el listener se ejecuta — siempre en el navegador, nunca en
        // SSR. Docs Wix:
        // https://dev.wix.com/docs/velo/api-reference/wix-ecom-frontend/refresh-cart
        try {
          const { default: wixEcomFrontend } = await import('wix-ecom-frontend');
          await wixEcomFrontend.refreshCart();
        } catch (eRefresh) {
          console.warn(`${TAG} ⚠️ refreshCart falló:`, eRefresh.message);
        }
      }
    } catch (e) {
      console.error(`${TAG} ❌ repetirCompraCliente:`, e.message);
    }
  });

  // --- reintentar tras error ---
  // v1.1.0: nombre 'reintentarSesion' (no 'reintentar').
  w.on('reintentarSesion', async () => {
    console.log(`${TAG} → reintentarSesion`);
    pushConfig({ estado: 'cargando' });
    await cargarDatos();
  });

  // --- scroll a Y absoluta ---
  // v1.3.2 — El Custom Element emite scrollToY tras cada click en
  // el nav lateral (escritorio) porque window.scrollTo nativo no
  // siempre funciona en Wix Studio (el scroll real puede estar en
  // un wrapper interno). wixWindow.scrollTo es la API oficial Wix
  // que sí encuentra el contenedor correcto.
  // Docs: https://dev.wix.com/docs/velo/apis/wix-window-frontend/scroll-to
  w.on('scrollToY', (event) => {
    const y = Number(event?.detail?.y);
    if (!Number.isFinite(y) || y < 0) return;
    try {
      wixWindow.scrollTo(0, y, { scrollAnimation: true });
    } catch (e) {
      console.warn(`${TAG} ⚠️ wixWindow.scrollTo falló:`, e.message);
    }
  });

  console.log(`${TAG} ✅ Listeners registrados`);
}

// v1.1.2 — Convierte File a base64 con FileReader.
// El backend espera string puro (sin prefijo data:image/...;base64,)
// pero también acepta con prefijo y lo limpia internamente.
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);   // data:image/...;base64,XXX
    reader.onerror = () => reject(new Error('FileReader falló'));
    reader.readAsDataURL(file);
  });
}