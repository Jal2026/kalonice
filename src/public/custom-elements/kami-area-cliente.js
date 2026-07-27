/* ============================================================================
 * kami-area-cliente.js
 * ----------------------------------------------------------------------------
 * VERSION: 1.2.0
 * FECHA:   1 de julio de 2026
 *
 * Área de Cliente KAMISUITE — Custom Element con Shadow DOM.
 * Mismo patrón que <kami-reserva> del widget público. Tag: <kami-area-cliente>.
 *
 * v1.2.0 — Multi-tenant skins completos (7 pieles).
 *   - KR_SKINS embebido ahora tiene las 7 pieles del bundle canónico:
 *     niebla (default sistema), arena, grafito, lumiere, botanica,
 *     aurora, oceano. Antes solo tenía oceano y las demás se ignoraban
 *     silenciosamente cayendo al fallback oceano.
 *   - Tokens base copiados literalmente del bundle canónico
 *     (kamisuite-widget-bundle.js). Tokens extendidos derivados de
 *     forma predecible del propio skin: --kr-ink-soft usa el ink-2 del
 *     skin, --kr-orange* reusa accent* del skin (el CTA hereda el
 *     color de acento del salón), --kr-green* y --kr-danger* se
 *     mantienen fijos como constantes universales de éxito/error,
 *     --kr-font se mantiene Bai Jamjuree.
 *   - Función aplicarSkin() intacta — el patrón removeProperty + setProperty
 *     ya soporta N skins.
 *   - Fallback interno de aplicarSkin: si el skin recibido no existe,
 *     cae a 'niebla' (default del sistema) en lugar de 'oceano'.
 *
 * v1.1.0 — Reestructuración del bloque "Programa de fidelización" →
 *          "Club {brandName}" con Programa de Puntos + tres productos
 *          custom (Tarjeta PRIME, Mis Bonos Descuento, Mis Tarjetas
 *          Promocionales).
 *
 *   CONCEPTO. Ser miembro del sitio = estar en el Club. Por eso el
 *   bloque se llama "Club {brandName}" (dinámico por salón) y la
 *   tarjeta del viejo Club KALONICE (imagen + HAZTE SOCIO) desaparece.
 *   En su lugar, tres sub-tarjetas apiladas para productos custom que
 *   el cliente puede POSEER o ADQUIRIR:
 *     · Tarjeta PRIME — imagen desde KamisuiteProductsConfig.primeImage.
 *       Si `data.prime.tiene=true`, muestra "Vence: {fecha}" + código.
 *       Si `false`, muestra copy + botón ADQUIRIR.
 *     · Mis Bonos Descuento — lista de bonos activos (código + servicio
 *       + usos restantes + caducidad). Siempre botón ADQUIRIR abajo.
 *     · Mis Tarjetas Promocionales — lista de tarjetas emitidas (código
 *       + servicio + caducidad). Siempre botón ADQUIRIR abajo.
 *
 *   TÍTULO DEL BLOQUE. `Programa de fidelización` → `Club {brandName}`.
 *   El brandName llega en `data.salon.brandName` (backend v1.6.0+). Si
 *   falta o llega vacío, cae a `Club` a secas. Aplica tanto al item del
 *   nav lateral como a la cabecera de la sección.
 *
 *   BOTONES ADQUIRIR. Todos abren en nueva pestaña la URL común de
 *   promociones que trae el backend en `data.prime.urlAdquirir`,
 *   `data.bonos.urlAdquirir` y `data.tarjetas.urlAdquirir` (hoy es la
 *   misma URL para las tres). Si el slug de SalonConfig no está
 *   configurado, el backend devuelve string vacío y el botón se
 *   deshabilita con estilo `soft`.
 *
 *   ELIMINACIONES DEL WIDGET:
 *     · Toda la lógica de render de la vieja `.club-card` (imagen de
 *       tarjeta + badge SOCIO ACTIVO / botón HAZTE SOCIO).
 *     · Lectura de `data.club.activo`, `data.club.imagen`, `data.club.url`.
 *   El CSS de `.club-card` / `.club-image-wrap` / `.club-side` /
 *   `.club-copy` / `.club-btn` / `.club-badge` se mantiene en el
 *   stylesheet (sin cambios) por si en el futuro se revive; no molesta
 *   porque no hay HTML que lo aplique.
 *
 * v1.0.13 — Ajuste visual y copy Club KALONICE.
 *   Cambio mínimo en el Custom Element: añade texto breve dentro de la
 *   tarjeta del Club, mantiene la lógica `data.club.activo` para mostrar
 *   SOCIO ACTIVO o HAZTE SOCIO, y aplica estilo dorado al botón sin
 *   subrayado ni outline negro. No toca backend ni estructura de datos.
 *
 * v1.0.12 — FIX render Club KALONICE.
 *   v1.0.11 ataba TODO el render del Club a que existiera la imagen
 *   (`clubBlock = clubImg ? ... : ''`). Si la imagen no llegaba del
 *   backend, NADA se mostraba — ni el badge SOCIO ACTIVO ni el botón
 *   HAZTE SOCIO. ERROR mío. Ahora el bloque se pinta SIEMPRE; la
 *   imagen es opcional (solo si llega). Para el caso sin imagen,
 *   `.club-card-no-img` ajusta el layout a 1 columna.
 *
 * v1.0.11 — Club KALONICE dentro del bloque Programa de Fidelización.
 *   Nueva tarjeta justo DEBAJO del subbloque de puntos+insignia, dentro
 *   del MISMO bloque/sección (sin nuevo item de menú nav). Lee tres
 *   campos del payload del backend (clienteAreaLogic v1.5.0+):
 *     - data.club.activo  (boolean) → checkbox Wix Contacts club_kalonice
 *     - data.club.imagen  (https URL) → SalonConfig.imagenClub
 *     - data.club.url     (https URL) → SalonConfig.urlClub
 *   Render:
 *     - Imagen del club con aspect-ratio 1.573 (formato tarjeta de
 *       crédito horizontal). La imagen está SIEMPRE presente si el
 *       salón tiene `imagenClub` configurada.
 *     - Si activo === true → badge verde "SOCIO ACTIVO" (sin botón).
 *     - Si activo === false → botón primario "HAZTE SOCIO" que abre
 *       la url del club en NUEVA PESTAÑA (target="_blank").
 *   Coherencia visual: mismo gradiente, borde y radio que .puntos-card.
 *
 * v1.0.10 — FIX scroll del nav lateral en Wix Studio.
 *   En escritorio, al hacer click en una sección del nav lateral
 *   ("Productos comprados", etc), el scroll no funcionaba porque
 *   window.scrollTo no actúa sobre el contenedor de scroll real
 *   de Wix Studio (que está en un wrapper interno, no en el window).
 *   En _scrollToEl se mantiene la lógica antigua (sigue funcionando
 *   en algunos contextos) y se AÑADE un emit 'scrollToY' con la
 *   coordenada Y absoluta. El page code escucha y llama a
 *   wixWindow.scrollTo (API oficial Wix que sí encuentra el scroll
 *   correcto). Cambio funcional puro — no toca CSS, no toca render.
 *
 * v1.0.9 — FIX "Repetir compra" — el data-id del botón ahora es el
 *   productId real de Wix Stores (antes era el li._id histórico, que
 *   no sirve para añadir al carrito). Cambio quirúrgico: solo el
 *   data-id del botón. CERO cambios estéticos en el bloque productos.
 *   Si el producto fue borrado del catálogo (productId vacío), el
 *   page code lo detecta y no llama al backend (silencioso, sin
 *   apagar el botón).
 *   Requiere backend v1.4.0+ que añade el campo `productId` al
 *   array productos.
 *
 * v1.0.8 — FIX legibilidad del aviso "Completa tu ficha".
 *   El bloque .notice usaba color:var(--kr-orange-ink) que en el skin
 *   oceano es prácticamente blanco (oklch(99% 0.015 233)). Sobre el
 *   fondo claro --kr-orange-soft el texto no se leía. Cambio a
 *   color:var(--kr-ink) (azul oscuro, oklch(28% 0.045 250)) — el mismo
 *   color de texto base del widget. Cambio CSS de 1 línea, sin tocar
 *   lógica.
 *
 * v1.0.7 — Mover cita REAL con chips de horas disponibles:
 *   · El <select> hardcoded de horas (9:00–19:45 cada 15 min) SE
 *     SUSTITUYE por chips dinámicos que pintan los huecos REALES del
 *     día seleccionado. Mismo flujo que el widget público de reservas.
 *   · Al elegir una fecha en el datepicker nativo, el widget emite
 *     CustomEvent('pedirHuecosMover', {reservaId, fecha, requestId}).
 *     El page code llama al backend getHuecosCambioReserva y devuelve
 *     los huecos vía setAttribute('data-huecos-response', JSON).
 *   · 'data-huecos-response' se añade a observedAttributes. Al
 *     recibirlo, el Custom Element actualiza _moverSel[reservaId] con
 *     los huecos y repinta solo la cita afectada (no toda la sección).
 *   · Estados del bloque de horas: vacío sin fecha, loading mientras
 *     llega la respuesta, lista de chips con huecos, mensaje "no hay
 *     huecos" si vacío, error si la respuesta no fue ok.
 *   · El requestId permite descartar respuestas tardías de requests
 *     obsoletas (si el cliente cambia día rápido).
 *   · Botón "Confirmar cambio" se deshabilita durante la llamada al
 *     backend para prevenir doble click (data-busy="1" en el botón).
 *   · Si el backend devuelve error ('Esa hora ya no está disponible'),
 *     el page code recarga snapshot y la cita vuelve a su fecha
 *     original.
 *
 * v1.0.6 — FIX mover cita:
 *   · _rebindSection (que se llama tras cada repaintSection) NO bindea-
 *     ba los listeners change del datepicker ni del select de hora,
 *     solo _bindFields lo hacía. Resultado: tras el primer repaint
 *     el select de hora perdía su listener y el botón "Confirmar
 *     cambio" nunca se habilitaba. Añadido el bind en _rebindSection.
 *   · Eliminada la frase "El salón validará la disponibilidad".
 *     El cambio aplica directamente si el hueco está libre, igual
 *     que el widget de reserva pública.
 *
 * v1.0.5 — Mover cita: input date nativo HTML5 + select horas en lugar
 *   de 4 días + 5 horas hardcoded. El input date abre el datepicker
 *   nativo del SO/navegador. El select de horas ofrece intervalos de
 *   15 min entre 9:00 y 20:00.
 *   El usuario elige día y hora libremente — la VALIDACIÓN de
 *   disponibilidad real contra el calendario del salón se hace en el
 *   backend al recibir el evento moverCita (TODO v1.2.0 backend).
 *   Mientras el backend no valide, el page code recarga datos tras
 *   recibir moverCita y la fecha original sigue mostrándose si no se
 *   confirmó el cambio en CMS.
 *
 * v1.0.4 — FIX: el constructor NO añade atributos (aplicarSkin movido a
 *   connectedCallback). El estándar de Custom Elements prohíbe modificar
 *   atributos del host en el constructor — si lo haces, cuando un
 *   framework (React-DOM de Wix) intenta re-crear el elemento via
 *   document.createElement, el navegador lanza:
 *     "Failed to execute 'createElement' on 'Document':
 *      The result must not have attributes"
 *   y el widget no renderiza. Esto venía pasando intermitentemente
 *   desde v1.0.3 según el momento en que Wix re-renderizaba la página.
 *
 * v1.0.3 — Fidelidad al diseño original de Claude Design.
 *   Esta versión PARTE del kami-area-cliente.js original de Claude Design
 *   (982 líneas) y aplica cambios mínimos:
 *
 *   Técnicos imprescindibles para Wix (sin tocar nada visual):
 *     · Eliminado `export { KamiAreaCliente }` (Wix carga Custom Elements
 *       como scripts clásicos, no como módulos ES).
 *     · Atributo `data-config` (JSON: { skin, data }) — única vía de
 *       entrada desde el page code de Wix. Mismo patrón kami-reserva v2.0.8.
 *     · KR_SKINS.oceano embebido + aplicarSkin(host, name) interno —
 *       autosuficiente sin window.KR_SKINS externo.
 *     · Carga de Bai Jamjuree desde Google Fonts en connectedCallback,
 *       idempotente (no duplica si ya está). Patrón kr-widget v2.0.7.
 *
 *   Cambios funcionales pedidos por Jal (literal):
 *     · Eliminado campo "Segundo apellido" del personal.
 *     · Eliminada sub-sección "Diagnósticos" del expediente.
 *     · Eliminado texto "Te faltan X puntos para tu próxima recompensa".
 *     · Eliminada clase .btn-danger-solid del CSS y del flujo de cancelar
 *       cita (confirmación con outline + cambio de texto, sin rellenar).
 *
 *   Apariencia 100% por tokens --kr-* inyectados en :host. KR_SKINS interno
 *   incluye oceano con los mismos tokens oklch del kr-skins.js del proyecto.
 *   Multi-tenant: añadir más pieles al objeto KR_SKINS embebido.
 *
 * ── PROPS PÚBLICAS ─────────────────────────────────────────────────────────
 *   atributo  data-config  → JSON {skin:'oceano', data:{...}} (entrada Wix)
 *   atributo  data-narrow  → fuerza layout móvil (también se autodetecta)
 *   .data = {...}          → setter (solo para preview HTML)
 *
 * ── EVENTOS EMITIDOS (bubbles:true, composed:true) ─────────────────────────
 *   guardarPerfil     detail: { ...camposModificados }   (READ-MERGE-UPDATE)
 *   subirFoto         detail: { file }
 *   cancelarCita      detail: { id }
 *   pedirHuecosMover  detail: { reservaId, fecha, requestId }   (v1.0.7)
 *   moverCita         detail: { id, nuevaFecha, nuevaHora }
 *   reservarCita      detail: {}
 *   repetirServicio   detail: { categoria, anteriorId }
 *   repetirCompra     detail: { productoId }
 *   editarNotaCliente detail: { texto }
 *   reintentarSesion  detail: {}
 *   scrollToY         detail: { y }   (v1.0.10 — fallback Wix scroll)
 * ========================================================================== */

const SECCIONES = [
  { id: 'personal',   label: 'Información personal', icon: 'user' },
  // v1.1.0 — label placeholder. El label real se calcula en runtime con
  // `labelSeccion(s, data)` porque incorpora `data.salon.brandName`
  // (multi-tenant). Ver referencia en `section()`, `_sidenav()`,
  // `_navmobile()` y `_setSecActiva()`.
  { id: 'puntos',     label: 'Club', icon: 'star' },
  { id: 'proximas',   label: 'Próximas citas',       icon: 'calendar' },
  { id: 'anteriores', label: 'Servicios anteriores', icon: 'clock' },
  { id: 'notas',      label: 'Notas para el salón',  icon: 'note' },
  { id: 'productos',  label: 'Productos comprados',  icon: 'bag' },
  { id: 'expediente', label: 'Información adicional', icon: 'file' },
];

/**
 * v1.1.0 — Devuelve el label a mostrar para una sección, dado el snapshot
 * `data` recibido del backend. Solo la sección `puntos` es dinámica hoy:
 * su label se compone como `Club {data.salon.brandName}` cuando el
 * brandName llega, o cae a `Club` a secas si no. El resto de secciones
 * usa el label constante del objeto SECCIONES.
 */
function labelSeccion(s, data) {
  if (s && s.id === 'puntos') {
    const brand = (data && data.salon && String(data.salon.brandName || '').trim()) || '';
    return brand ? `Club ${brand}` : 'Club';
  }
  return (s && s.label) || '';
}

const ICONS = {
  user:     '<circle cx="12" cy="8" r="3.4"/><path d="M5.5 19c.6-3.4 3.2-5 6.5-5s5.9 1.6 6.5 5"/>',
  star:     '<path d="M12 4.5l2.1 4.4 4.8.6-3.5 3.3.9 4.8-4.3-2.3-4.3 2.3.9-4.8-3.5-3.3 4.8-.6z"/>',
  calendar: '<rect x="4.5" y="6" width="15" height="13" rx="2"/><path d="M4.5 10h15M8.5 4v3M15.5 4v3"/>',
  clock:    '<circle cx="12" cy="12" r="7.5"/><path d="M12 8v4.2l2.8 1.8"/>',
  note:     '<path d="M6 4.5h9l3.5 3.5v11.5H6z"/><path d="M14.5 4.5V8h3.5M9 12h6M9 15.5h6"/>',
  bag:      '<path d="M6 8h12l-1 11H7z"/><path d="M9 8a3 3 0 0 1 6 0"/>',
  file:     '<path d="M7 4.5h7l3 3v12H7z"/><path d="M14 4.5V8h3M10 12h4M10 15h4"/>',
  check:    '<path d="M5 12.5l4.5 4.5L19 7"/>',
  edit:     '<path d="M14.5 6l3.5 3.5M5 19l1-4 9-9 3.5 3.5-9 9z"/>',
  camera:   '<rect x="4.5" y="7.5" width="15" height="11" rx="2"/><circle cx="12" cy="13" r="3"/><path d="M9 7.5l1.2-2h3.6L15 7.5"/>',
  plus:     '<path d="M12 6v12M6 12h12"/>',
  repeat:   '<path d="M5 9a7 7 0 0 1 12-3l2 2M19 15a7 7 0 0 1-12 3l-2-2"/><path d="M19 5v3h-3M5 19v-3h3"/>',
  x:        '<path d="M7 7l10 10M17 7L7 17"/>',
  warn:     '<path d="M12 5l8 14H4z"/><path d="M12 10v4M12 16.5v.5"/>',
  spark:    '<path d="M12 4v4M12 16v4M4 12h4M16 12h4"/>',
  arrow:    '<path d="M5 12h13M13 7l5 5-5 5"/>',
};

function ic(name, cls = '') {
  return `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
function fechaCorta(iso) {
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d)) return iso;
  return `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`;
}
function diaSemana(iso) {
  const d = new Date(iso + 'T00:00:00');
  return ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][d.getDay()] || '';
}
function eur(n) { return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n); }

const PREFIJOS = ['+34', '+351', '+33', '+44', '+49', '+1', '+39'];

// ========================================================================== */
// v1.0.3 — SKINS EMBEBIDOS + GOOGLE FONTS LOADER                             */
// ----------------------------------------------------------------------------*/
// Mismos tokens oklch del kr-skins.js de producción del proyecto. Inline para */
// que el archivo sea autosuficiente en Wix (un único Custom Element subido). */
// Multi-tenant: añadir más pieles aquí (botanica, lumiere, aurora, etc).     */
// ========================================================================== */

const KR_SKINS = {
  /* ============ NEUTRA (base + variantes neutras) ============ */
  niebla: {
    label: 'Niebla',
    tokens: {
      /* Tokens base del bundle canónico (niebla usa los defaults del :host
         del bundle público). Reforzamos aquí para no depender de defaults
         del bundle que en este CE no existen. */
      '--kr-bg':            'oklch(98.6% 0.003 250)',
      '--kr-surface':       'oklch(100% 0 0)',
      '--kr-surface-2':     'oklch(97% 0.005 250)',
      '--kr-inset':         'oklch(95.4% 0.008 252)',
      '--kr-line':          'oklch(90% 0.012 254)',
      '--kr-line-2':        'oklch(80% 0.018 256)',
      '--kr-ink':           'oklch(25% 0.02 258)',
      '--kr-ink-2':         'oklch(40% 0.022 258)',
      '--kr-ink-3':         'oklch(60% 0.02 256)',
      '--kr-ink-soft':      'oklch(40% 0.022 258)',
      '--kr-accent':        'oklch(40% 0.022 258)',
      '--kr-accent-2':      'oklch(32% 0.024 260)',
      '--kr-accent-ink':    'oklch(99% 0 0)',
      '--kr-accent-soft':   'oklch(93% 0.012 254)',
      '--kr-accent-line':   'oklch(60% 0.022 258)',
      '--kr-focus':         'oklch(52% 0.05 258)',
      '--kr-radius':        '14px',
      '--kr-font':          "'Bai Jamjuree', system-ui, sans-serif",
      /* --kr-orange* — CTA hereda accent del skin */
      '--kr-orange':        'oklch(40% 0.022 258)',
      '--kr-orange-2':      'oklch(32% 0.024 260)',
      '--kr-orange-ink':    'oklch(99% 0 0)',
      '--kr-orange-soft':   'oklch(93% 0.012 254)',
      '--kr-orange-line':   'oklch(72% 0.02 256)',
      /* --kr-green* — universal de éxito */
      '--kr-green':         'oklch(58% 0.14 152)',
      '--kr-green-2':       'oklch(48% 0.13 152)',
      '--kr-green-soft':    'oklch(92% 0.06 150)',
      '--kr-green-soft-2':  'oklch(86% 0.09 152)',
      '--kr-green-ink':     'oklch(38% 0.11 152)',
      '--kr-green-ink-on':  'oklch(99% 0.02 150)',
      '--kr-green-line':    'oklch(76% 0.09 152)',
      /* --kr-danger* — universal de error */
      '--kr-danger':        'oklch(58% 0.16 25)',
      '--kr-danger-ink':    'oklch(99% 0.01 25)',
      '--kr-danger-soft':   'oklch(94% 0.04 25)'
    }
  },

  arena: {
    label: 'Arena',
    tokens: {
      /* Base copiada literal del bundle canónico */
      '--kr-bg':            'oklch(98.4% 0.009 78)',
      '--kr-surface':       'oklch(99.6% 0.006 80)',
      '--kr-surface-2':     'oklch(97% 0.012 78)',
      '--kr-inset':         'oklch(95.6% 0.014 76)',
      '--kr-line':          'oklch(90% 0.016 72)',
      '--kr-line-2':        'oklch(82% 0.02 68)',
      '--kr-ink':           'oklch(31% 0.018 60)',
      '--kr-ink-2':         'oklch(48% 0.016 60)',
      '--kr-ink-3':         'oklch(64% 0.014 62)',
      '--kr-ink-soft':      'oklch(48% 0.016 60)',
      '--kr-accent':        'oklch(42% 0.028 64)',
      '--kr-accent-2':      'oklch(35% 0.03 62)',
      '--kr-accent-ink':    'oklch(99% 0.01 78)',
      '--kr-accent-soft':   'oklch(93% 0.022 72)',
      '--kr-accent-line':   'oklch(64% 0.026 66)',
      '--kr-focus':         'oklch(58% 0.09 70)',
      '--kr-radius':        '13px',
      '--kr-font':          "'Bai Jamjuree', system-ui, sans-serif",
      /* extendidos derivados */
      '--kr-orange':        'oklch(42% 0.028 64)',
      '--kr-orange-2':      'oklch(35% 0.03 62)',
      '--kr-orange-ink':    'oklch(99% 0.01 78)',
      '--kr-orange-soft':   'oklch(93% 0.022 72)',
      '--kr-orange-line':   'oklch(64% 0.026 66)',
      '--kr-green':         'oklch(58% 0.14 152)',
      '--kr-green-2':       'oklch(48% 0.13 152)',
      '--kr-green-soft':    'oklch(92% 0.06 150)',
      '--kr-green-soft-2':  'oklch(86% 0.09 152)',
      '--kr-green-ink':     'oklch(38% 0.11 152)',
      '--kr-green-ink-on':  'oklch(99% 0.02 150)',
      '--kr-green-line':    'oklch(76% 0.09 152)',
      '--kr-danger':        'oklch(58% 0.16 25)',
      '--kr-danger-ink':    'oklch(99% 0.01 25)',
      '--kr-danger-soft':   'oklch(94% 0.04 25)'
    }
  },

  grafito: {
    label: 'Grafito',
    tokens: {
      '--kr-bg':            'oklch(99% 0 0)',
      '--kr-surface':       'oklch(100% 0 0)',
      '--kr-surface-2':     'oklch(97% 0 0)',
      '--kr-inset':         'oklch(95.5% 0 0)',
      '--kr-line':          'oklch(89% 0 0)',
      '--kr-line-2':        'oklch(80% 0 0)',
      '--kr-ink':           'oklch(20% 0 0)',
      '--kr-ink-2':         'oklch(42% 0 0)',
      '--kr-ink-3':         'oklch(62% 0 0)',
      '--kr-ink-soft':      'oklch(42% 0 0)',
      '--kr-accent':        'oklch(22% 0 0)',
      '--kr-accent-2':      'oklch(12% 0 0)',
      '--kr-accent-ink':    'oklch(99% 0 0)',
      '--kr-accent-soft':   'oklch(94.5% 0 0)',
      '--kr-accent-line':   'oklch(55% 0 0)',
      '--kr-focus':         'oklch(50% 0 0)',
      '--kr-radius':        '6px',
      '--kr-font':          "'Bai Jamjuree', system-ui, sans-serif",
      '--kr-orange':        'oklch(22% 0 0)',
      '--kr-orange-2':      'oklch(12% 0 0)',
      '--kr-orange-ink':    'oklch(99% 0 0)',
      '--kr-orange-soft':   'oklch(94.5% 0 0)',
      '--kr-orange-line':   'oklch(55% 0 0)',
      '--kr-green':         'oklch(58% 0.14 152)',
      '--kr-green-2':       'oklch(48% 0.13 152)',
      '--kr-green-soft':    'oklch(92% 0.06 150)',
      '--kr-green-soft-2':  'oklch(86% 0.09 152)',
      '--kr-green-ink':     'oklch(38% 0.11 152)',
      '--kr-green-ink-on':  'oklch(99% 0.02 150)',
      '--kr-green-line':    'oklch(76% 0.09 152)',
      '--kr-danger':        'oklch(58% 0.16 25)',
      '--kr-danger-ink':    'oklch(99% 0.01 25)',
      '--kr-danger-soft':   'oklch(94% 0.04 25)'
    }
  },

  /* ============ SALON (brand injectada sobre chasis neutra) ============ */
  lumiere: {
    label: 'Lumière',
    tokens: {
      '--kr-bg':            'oklch(98.2% 0.012 88)',
      '--kr-surface':       'oklch(99.6% 0.008 88)',
      '--kr-surface-2':     'oklch(96.6% 0.016 86)',
      '--kr-inset':         'oklch(95% 0.02 84)',
      '--kr-line':          'oklch(90% 0.022 82)',
      '--kr-line-2':        'oklch(80% 0.03 80)',
      '--kr-ink':           'oklch(26% 0.012 70)',
      '--kr-ink-2':         'oklch(45% 0.014 72)',
      '--kr-ink-3':         'oklch(62% 0.018 76)',
      '--kr-ink-soft':      'oklch(45% 0.014 72)',
      '--kr-accent':        'oklch(56% 0.085 78)',
      '--kr-accent-2':      'oklch(47% 0.08 74)',
      '--kr-accent-ink':    'oklch(99% 0.01 88)',
      '--kr-accent-soft':   'oklch(93% 0.035 84)',
      '--kr-accent-line':   'oklch(66% 0.075 80)',
      '--kr-focus':         'oklch(58% 0.085 78)',
      '--kr-radius':        '4px',
      '--kr-font':          "'Bai Jamjuree', system-ui, sans-serif",
      '--kr-orange':        'oklch(56% 0.085 78)',
      '--kr-orange-2':      'oklch(47% 0.08 74)',
      '--kr-orange-ink':    'oklch(99% 0.01 88)',
      '--kr-orange-soft':   'oklch(93% 0.035 84)',
      '--kr-orange-line':   'oklch(66% 0.075 80)',
      '--kr-green':         'oklch(58% 0.14 152)',
      '--kr-green-2':       'oklch(48% 0.13 152)',
      '--kr-green-soft':    'oklch(92% 0.06 150)',
      '--kr-green-soft-2':  'oklch(86% 0.09 152)',
      '--kr-green-ink':     'oklch(38% 0.11 152)',
      '--kr-green-ink-on':  'oklch(99% 0.02 150)',
      '--kr-green-line':    'oklch(76% 0.09 152)',
      '--kr-danger':        'oklch(58% 0.16 25)',
      '--kr-danger-ink':    'oklch(99% 0.01 25)',
      '--kr-danger-soft':   'oklch(94% 0.04 25)'
    }
  },

  botanica: {
    label: 'Botánica',
    tokens: {
      '--kr-bg':            'oklch(98.6% 0.01 150)',
      '--kr-surface':       'oklch(99.8% 0.006 150)',
      '--kr-surface-2':     'oklch(97% 0.016 152)',
      '--kr-inset':         'oklch(95.4% 0.02 152)',
      '--kr-line':          'oklch(90% 0.022 154)',
      '--kr-line-2':        'oklch(81% 0.03 156)',
      '--kr-ink':           'oklch(28% 0.025 160)',
      '--kr-ink-2':         'oklch(46% 0.022 158)',
      '--kr-ink-3':         'oklch(63% 0.02 156)',
      '--kr-ink-soft':      'oklch(46% 0.022 158)',
      '--kr-accent':        'oklch(48% 0.09 156)',
      '--kr-accent-2':      'oklch(40% 0.085 158)',
      '--kr-accent-ink':    'oklch(99% 0.006 150)',
      '--kr-accent-soft':   'oklch(93% 0.03 152)',
      '--kr-accent-line':   'oklch(62% 0.08 156)',
      '--kr-focus':         'oklch(56% 0.1 156)',
      '--kr-radius':        '16px',
      '--kr-font':          "'Bai Jamjuree', system-ui, sans-serif",
      '--kr-orange':        'oklch(48% 0.09 156)',
      '--kr-orange-2':      'oklch(40% 0.085 158)',
      '--kr-orange-ink':    'oklch(99% 0.006 150)',
      '--kr-orange-soft':   'oklch(93% 0.03 152)',
      '--kr-orange-line':   'oklch(62% 0.08 156)',
      '--kr-green':         'oklch(58% 0.14 152)',
      '--kr-green-2':       'oklch(48% 0.13 152)',
      '--kr-green-soft':    'oklch(92% 0.06 150)',
      '--kr-green-soft-2':  'oklch(86% 0.09 152)',
      '--kr-green-ink':     'oklch(38% 0.11 152)',
      '--kr-green-ink-on':  'oklch(99% 0.02 150)',
      '--kr-green-line':    'oklch(76% 0.09 152)',
      '--kr-danger':        'oklch(58% 0.16 25)',
      '--kr-danger-ink':    'oklch(99% 0.01 25)',
      '--kr-danger-soft':   'oklch(94% 0.04 25)'
    }
  },

  aurora: {
    label: 'Aurora',
    tokens: {
      '--kr-bg':            'oklch(98.7% 0.006 320)',
      '--kr-surface':       'oklch(100% 0 0)',
      '--kr-surface-2':     'oklch(97.4% 0.01 322)',
      '--kr-inset':         'oklch(96% 0.014 326)',
      '--kr-line':          'oklch(91% 0.016 330)',
      '--kr-line-2':        'oklch(82% 0.024 336)',
      '--kr-ink':           'oklch(27% 0.03 326)',
      '--kr-ink-2':         'oklch(46% 0.026 330)',
      '--kr-ink-3':         'oklch(64% 0.022 334)',
      '--kr-ink-soft':      'oklch(46% 0.026 330)',
      '--kr-accent':        'oklch(56% 0.16 350)',
      '--kr-accent-2':      'oklch(48% 0.17 352)',
      '--kr-accent-ink':    'oklch(99% 0.006 320)',
      '--kr-accent-soft':   'oklch(94% 0.04 348)',
      '--kr-accent-line':   'oklch(66% 0.14 350)',
      '--kr-focus':         'oklch(58% 0.16 350)',
      '--kr-radius':        '12px',
      '--kr-font':          '"Instrument Sans", ui-sans-serif, system-ui, sans-serif',
      '--kr-orange':        'oklch(56% 0.16 350)',
      '--kr-orange-2':      'oklch(48% 0.17 352)',
      '--kr-orange-ink':    'oklch(99% 0.006 320)',
      '--kr-orange-soft':   'oklch(94% 0.04 348)',
      '--kr-orange-line':   'oklch(66% 0.14 350)',
      '--kr-green':         'oklch(58% 0.14 152)',
      '--kr-green-2':       'oklch(48% 0.13 152)',
      '--kr-green-soft':    'oklch(92% 0.06 150)',
      '--kr-green-soft-2':  'oklch(86% 0.09 152)',
      '--kr-green-ink':     'oklch(38% 0.11 152)',
      '--kr-green-ink-on':  'oklch(99% 0.02 150)',
      '--kr-green-line':    'oklch(76% 0.09 152)',
      '--kr-danger':        'oklch(58% 0.16 25)',
      '--kr-danger-ink':    'oklch(99% 0.01 25)',
      '--kr-danger-soft':   'oklch(94% 0.04 25)'
    }
  },

  oceano: {
    label: 'Oceano',
    tokens: {
      '--kr-bg':            'oklch(98.4% 0.012 232)',
      '--kr-surface':       'oklch(99.7% 0.007 232)',
      '--kr-surface-2':     'oklch(97% 0.018 233)',
      '--kr-inset':         'oklch(95.2% 0.024 233)',
      '--kr-line':          'oklch(90% 0.028 234)',
      '--kr-line-2':        'oklch(80.5% 0.042 236)',
      '--kr-ink':           'oklch(28% 0.045 250)',
      '--kr-ink-2':         'oklch(46% 0.038 248)',
      '--kr-ink-3':         'oklch(63% 0.032 244)',
      '--kr-ink-soft':      'oklch(46% 0.038 248)',
      '--kr-accent':        'oklch(50% 0.13 244)',
      '--kr-accent-2':      'oklch(42% 0.14 246)',
      '--kr-accent-ink':    'oklch(99% 0.015 233)',
      '--kr-accent-soft':   'oklch(93% 0.038 234)',
      '--kr-accent-line':   'oklch(64% 0.11 240)',
      '--kr-focus':         'oklch(58% 0.14 244)',
      '--kr-radius':        '12px',
      '--kr-font':          "'Bai Jamjuree', system-ui, sans-serif",
      '--kr-orange':        'oklch(56% 0.13 240)',
      '--kr-orange-2':      'oklch(48% 0.14 242)',
      '--kr-orange-ink':    'oklch(99% 0.015 233)',
      '--kr-orange-soft':   'oklch(95% 0.032 233)',
      '--kr-orange-line':   'oklch(72% 0.085 237)',
      '--kr-green':         'oklch(54% 0.155 240)',
      '--kr-green-2':       'oklch(46% 0.15 242)',
      '--kr-green-soft':    'oklch(90% 0.072 233)',
      '--kr-green-soft-2':  'oklch(85% 0.095 233)',
      '--kr-green-ink':     'oklch(41% 0.115 244)',
      '--kr-green-ink-on':  'oklch(99% 0.02 233)',
      '--kr-green-line':    'oklch(77% 0.092 236)',
      '--kr-danger':        'oklch(58% 0.16 25)',
      '--kr-danger-ink':    'oklch(99% 0.01 25)',
      '--kr-danger-soft':   'oklch(94% 0.04 25)'
    }
  }
};

function aplicarSkin(host, nombre) {
  /* v1.2.0 — Fallback a 'niebla' (default sistema) en lugar de 'oceano'
     para coherencia con el resto de widgets (widget público, bonos,
     PRIME, tarjetas promocionales). */
  const skin = KR_SKINS[nombre] || KR_SKINS.niebla;
  const all = new Set();
  Object.values(KR_SKINS).forEach(s => Object.keys(s.tokens).forEach(k => all.add(k)));
  all.forEach(k => host.style.removeProperty(k));
  Object.entries(skin.tokens).forEach(([k, v]) => host.style.setProperty(k, v));
  host.dataset.skin = nombre in KR_SKINS ? nombre : 'niebla';
}

// Carga idempotente de Bai Jamjuree desde Google Fonts.
// Patrón verificado en kr-widget v2.0.7 del proyecto. Inyecta el <link>
// una sola vez en document.head, no duplica si ya existe.
function cargarFuenteBaiJamjuree() {
  if (document.getElementById('kr-font-baijamjuree')) return;
  const preconnect1 = document.createElement('link');
  preconnect1.rel = 'preconnect';
  preconnect1.href = 'https://fonts.googleapis.com';
  document.head.appendChild(preconnect1);
  const preconnect2 = document.createElement('link');
  preconnect2.rel = 'preconnect';
  preconnect2.href = 'https://fonts.gstatic.com';
  preconnect2.crossOrigin = 'anonymous';
  document.head.appendChild(preconnect2);
  const link = document.createElement('link');
  link.id = 'kr-font-baijamjuree';
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=Bai+Jamjuree:wght@400;500;600;700&display=swap';
  document.head.appendChild(link);
}

// ========================================================================== */

class KamiAreaCliente extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._data = null;
    this._editPerfil = false;
    this._draft = null;          // borrador de edición de perfil
    this._moverAbierto = null;   // id de cita con selector de mover abierto
    this._moverSel = {};         // { fecha, hora } selección temporal
    this._anterioresVisibles = 4;
    this._notaDirty = false;
    this._activa = 'personal';
    this._narrow = false;
    this._abiertas = new Set(SECCIONES.map(s => s.id)); // accordion (todas abiertas por defecto)
    // v1.0.4 — NO se llama a aplicarSkin aquí.
    // El constructor de un Custom Element TIENE PROHIBIDO añadir atributos
    // al elemento (host.dataset.skin = ... añade un data-skin attribute).
    // Hacerlo provoca el error "Failed to execute 'createElement' on Document:
    // The result must not have attributes" cuando un framework (React-DOM
    // de Wix, por ejemplo) re-crea el elemento. El skin se aplica ahora
    // en connectedCallback (ya está insertado en el DOM y es seguro).
  }

  static get observedAttributes() { return ['data-narrow', 'data-config', 'data-huecos-response']; }
  attributeChangedCallback(name, _old, val) {
    if (name === 'data-config') {
      // v1.0.3 — entrada del page code de Wix. Setear propiedades JS
      // directamente desde page code no es posible; setAttribute es la
      // única vía. Mismo patrón kami-reserva v2.0.8.
      try {
        const cfg = JSON.parse(val || '{}');
        if (cfg.skin) aplicarSkin(this, cfg.skin);
        if (cfg.data !== undefined) this.data = cfg.data;
      } catch (e) {
        console.error('[kami-area-cliente] data-config inválido:', e);
      }
      return;
    }
    if (name === 'data-huecos-response') {
      // v1.0.7 — respuesta async del page code a un 'pedirHuecosMover'.
      // Forma: { requestId, reservaId, fecha, ok, huecos:[], motivo?, error? }
      // Filtramos respuestas tardías: solo aplicamos si el requestId
      // coincide con el último que pedimos para esa reservaId (anti race
      // condition cuando el cliente cambia de día rápidamente).
      try {
        const res = JSON.parse(val || '{}');
        if (!res || !res.reservaId) return;
        const sel = this._moverSel[res.reservaId];
        if (!sel) return; // mover-cita ya cerrado
        if (sel.lastRequestId && res.requestId && sel.lastRequestId !== res.requestId) {
          // respuesta obsoleta — descartar
          return;
        }
        // Solo aplica si la respuesta es del día que el cliente sigue mirando
        if (sel.fecha && res.fecha && sel.fecha !== res.fecha) return;
        sel.huecos = Array.isArray(res.huecos) ? res.huecos.slice() : [];
        sel.huecosOk = !!res.ok;
        sel.huecosError = res.error || null;
        sel.huecosMotivo = res.motivo || null;
        sel.loadingHuecos = false;
        // Si la hora elegida previamente ya no aparece, deseleccionar
        if (sel.hora && !sel.huecos.includes(sel.hora)) sel.hora = '';
        this.repaintSection('proximas');
      } catch (e) {
        console.error('[kami-area-cliente] data-huecos-response inválido:', e);
      }
      return;
    }
    // 'data-narrow' (legacy)
    this._recomputeNarrow();
  }

  set data(v) { this._data = v; this._editPerfil = false; this._draft = null; this.render(); }
  get data() { return this._data; }

  connectedCallback() {
    // v1.0.4 — aplicarSkin se llama AQUÍ, no en el constructor.
    // El elemento ya está insertado en el DOM y es seguro añadirle
    // atributos (dataset.skin). En el constructor el navegador lo
    // prohíbe.
    aplicarSkin(this, this.dataset.skin || 'oceano');
    // v1.0.3 — Cargar Bai Jamjuree del Google Fonts antes del primer render
    // para que el shadow root lo use desde el primer paint.
    cargarFuenteBaiJamjuree();
    if (!this._data) { this.render(); }
    this._ro = new ResizeObserver(() => this._recomputeNarrow());
    this._ro.observe(this);
  }
  disconnectedCallback() { this._ro && this._ro.disconnect(); }

  _recomputeNarrow() {
    const w = this.getBoundingClientRect().width;
    const narrow = this.hasAttribute('data-narrow') || (w > 0 && w < 760);
    if (narrow !== this._narrow) { this._narrow = narrow; this.render(); }
    else this._applyNarrow();
  }

  _applyNarrow() {
    const root = this.shadowRoot.querySelector('.wrap');
    if (root) root.classList.toggle('narrow', this._narrow);
  }

  emit(name, detail = {}) {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }

  toast(msg, tone = 'green') {
    const host = this.shadowRoot.querySelector('.toasts');
    if (!host) return;
    const t = document.createElement('div');
    t.className = `toast t-${tone}`;
    t.innerHTML = `${ic(tone === 'danger' ? 'x' : 'check')}<span>${esc(msg)}</span>`;
    host.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2600);
  }

  /* ====================================================================== */
  /*  RENDER                                                                 */
  /* ====================================================================== */
  render() {
    const w = this.getBoundingClientRect().width;
    this._narrow = this.hasAttribute('data-narrow') || (w > 0 && w < 760);
    this.shadowRoot.innerHTML = `<style>${this.css()}</style>${this.shell()}`;
    this._applyNarrow();
    this._bind();
    this._observeSpy();
  }

  css() {
    return `
:host{
  display:block; box-sizing:border-box;
  font-family:var(--kr-font, system-ui, sans-serif);
  color:var(--kr-ink,#11293a);
  background:var(--kr-bg,#eaf2f7);
  --r:var(--kr-radius,14px);
  line-height:1.45;
  -webkit-font-smoothing:antialiased;
}
*,*::before,*::after{box-sizing:border-box}
.wrap{max-width:1108px;margin:0 auto;padding:34px 28px 80px}
.ic{width:1.05em;height:1.05em;flex:none}

/* ---------- cabecera identitaria ---------- */
.identity{
  display:flex;align-items:center;gap:20px;
  background:var(--kr-surface);border:1px solid var(--kr-line);
  border-radius:calc(var(--r) + 4px);padding:20px 24px;margin-bottom:26px;
  box-shadow:0 1px 0 rgba(0,0,0,.02);
}
.avatar{
  width:74px;height:74px;border-radius:50%;flex:none;overflow:hidden;
  background:var(--kr-surface-2);border:2px solid var(--kr-line);
  display:grid;place-items:center;color:var(--kr-ink-soft);
}
.avatar img{width:100%;height:100%;object-fit:cover;display:block}
.avatar .initials{font-size:26px;font-weight:600;letter-spacing:.5px}
.identity .meta{flex:1;min-width:0}
.identity .hello{font-size:13px;color:var(--kr-ink-soft);letter-spacing:.04em;text-transform:uppercase;margin:0 0 2px}
.identity h1{margin:0;font-size:27px;font-weight:600;letter-spacing:-.01em}
.identity .sub{margin:4px 0 0;font-size:14px;color:var(--kr-ink-soft)}
.badge-exp{
  display:inline-flex;align-items:center;gap:7px;font-size:12.5px;font-weight:600;
  background:var(--kr-green-soft);color:var(--kr-green-ink);
  border:1px solid color-mix(in srgb,var(--kr-green) 30%, transparent);
  padding:7px 13px;border-radius:999px;white-space:nowrap;
}
.badge-exp .dot{width:7px;height:7px;border-radius:50%;background:var(--kr-green)}

/* ---------- layout panel ---------- */
.panel{display:grid;grid-template-columns:236px 1fr;gap:26px;align-items:start}
nav.sidenav{position:sticky;top:18px;display:flex;flex-direction:column;gap:3px}
nav.sidenav button{
  display:flex;align-items:center;gap:12px;width:100%;text-align:left;
  background:none;border:0;cursor:pointer;font:inherit;color:var(--kr-ink-soft);
  padding:10px 13px;border-radius:11px;font-size:14px;font-weight:500;
  transition:background .15s,color .15s;white-space:nowrap;
}
nav.sidenav button span{overflow:hidden;text-overflow:ellipsis}
nav.sidenav button .ic{color:var(--kr-ink-soft);transition:color .15s}
nav.sidenav button:hover{background:var(--kr-surface)}
nav.sidenav button.active{background:var(--kr-surface);color:var(--kr-ink);font-weight:600;box-shadow:0 1px 0 rgba(0,0,0,.03)}
nav.sidenav button.active .ic{color:var(--kr-accent)}

main.content{min-width:0;display:flex;flex-direction:column;gap:20px}

/* ---------- tarjeta sección ---------- */
.sec{background:var(--kr-surface);border:1px solid var(--kr-line);border-radius:calc(var(--r) + 2px);overflow:hidden;scroll-margin-top:16px}
.sec-head{
  display:flex;align-items:center;gap:12px;width:100%;text-align:left;
  background:none;border:0;cursor:default;font:inherit;color:inherit;
  padding:20px 24px 4px;
}
.sec-head .ic{color:var(--kr-accent);width:18px;height:18px}
.sec-head h2{margin:0;font-size:17px;font-weight:600;letter-spacing:-.01em;flex:1}
.sec-head .chev{display:none;color:var(--kr-ink-soft);transition:transform .2s}
.sec-body{padding:8px 24px 24px}
.sec-desc{font-size:13.5px;color:var(--kr-ink-soft);margin:0 0 16px}

/* ---------- botones ---------- */
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;cursor:pointer;
  font:inherit;font-size:14px;font-weight:600;border-radius:10px;padding:10px 16px;border:1px solid transparent;transition:.15s;white-space:nowrap}
.btn .ic{width:16px;height:16px}
.btn-primary{background:var(--kr-accent);color:var(--kr-accent-ink);border-color:var(--kr-accent)}
.btn-primary:hover{filter:brightness(.94)}
.btn-ghost{background:transparent;color:var(--kr-ink);border-color:var(--kr-line)}
.btn-ghost:hover{background:var(--kr-surface-2);border-color:var(--kr-ink-soft)}
.btn-soft{background:var(--kr-accent-soft);color:var(--kr-accent);border-color:transparent}
.btn-soft:hover{filter:brightness(.97)}
.btn-danger{background:transparent;color:var(--kr-danger);border-color:color-mix(in srgb,var(--kr-danger) 36%,transparent)}
.btn-danger:hover{background:var(--kr-danger-soft)}
/* v1.0.3 — clase .btn-danger-solid eliminada por petición de Jal. La
   confirmación de cancelar cita usa solo .btn-danger (outline) + cambio
   de texto. */
.btn-sm{padding:8px 13px;font-size:13px;border-radius:9px}
.btn:disabled{opacity:.5;cursor:not-allowed}

/* ---------- info personal ---------- */
.notice{
  display:flex;gap:11px;align-items:flex-start;background:var(--kr-orange-soft);
  border:1px solid color-mix(in srgb,var(--kr-orange) 32%,transparent);
  color:var(--kr-ink);border-radius:var(--r);padding:13px 15px;margin:0 0 18px;font-size:13.5px}
.notice .ic{color:var(--kr-orange);width:18px;height:18px;margin-top:1px}
.notice b{font-weight:700}

.grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px 22px}
.field{display:flex;flex-direction:column;gap:5px;min-width:0}
.field.span{grid-column:1 / -1}
.field label{font-size:12px;font-weight:600;letter-spacing:.03em;text-transform:uppercase;color:var(--kr-ink-soft)}
.field .val{font-size:15.5px;font-weight:500;padding:3px 0;min-height:25px}
.field .val.empty{color:var(--kr-ink-soft);font-weight:400;font-style:italic}
.inp,.sel{
  font:inherit;font-size:15px;color:var(--kr-ink);background:var(--kr-surface);
  border:1px solid var(--kr-line);border-radius:10px;padding:10px 12px;width:100%;transition:.15s}
.inp:focus,.sel:focus{outline:none;border-color:var(--kr-accent);box-shadow:0 0 0 3px var(--kr-accent-soft)}
.tel-row{display:flex;gap:8px}
.tel-row .sel{width:96px;flex:none}
.head-actions{display:flex;gap:9px;align-items:center;margin-left:auto}
.sec-head{align-items:center}
.photo-edit{display:flex;align-items:center;gap:14px;grid-column:1/-1;margin-bottom:4px}
.photo-edit .avatar{width:60px;height:60px}

/* ---------- puntos ---------- */
.puntos-card{
  display:grid;grid-template-columns:auto 1fr;gap:22px;align-items:center;
  background:linear-gradient(135deg,var(--kr-accent-soft),color-mix(in srgb,var(--kr-accent-soft) 40%,var(--kr-surface)));
  border:1px solid color-mix(in srgb,var(--kr-accent) 18%,transparent);
  border-radius:var(--r);padding:22px 24px}
.puntos-ring-col{display:flex;flex-direction:column;align-items:center;gap:14px}
.puntos-ring{position:relative;width:118px;height:118px;flex:none}
.insignia{display:inline-flex;align-items:center;gap:7px;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;background:var(--kr-accent);color:var(--kr-accent-ink);padding:8px 14px;border-radius:999px;box-shadow:0 4px 12px color-mix(in srgb,var(--kr-accent) 30%,transparent);white-space:nowrap}
.insignia .ic{width:15px;height:15px}
.puntos-ring svg{transform:rotate(-90deg)}
.puntos-ring .num{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
.puntos-ring .num b{font-size:34px;font-weight:700;line-height:1;letter-spacing:-.02em}
.puntos-ring .num span{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--kr-ink-soft);margin-top:3px}
.puntos-info .lvl{display:inline-flex;align-items:center;gap:7px;font-size:12.5px;font-weight:600;color:var(--kr-accent);background:var(--kr-surface);border:1px solid var(--kr-line);padding:5px 11px;border-radius:999px;margin-bottom:10px}
.puntos-info h3{margin:0 0 6px;font-size:18px;font-weight:600}
.puntos-info p{margin:0;font-size:13.5px;color:var(--kr-ink-soft);max-width:46ch}
.puntos-next{margin-top:11px;font-size:13px}
.puntos-next b{color:var(--kr-ink)}

/* v1.0.11 — Tarjeta del Club KALONICE.
   Misma estética que .puntos-card (mismo gradiente, mismo borde, mismo
   radio) — coherencia visual dentro del bloque Programa de Fidelización.
   Va separada por margen superior. La imagen mantiene aspect-ratio
   1573/1000 (formato tarjeta de crédito horizontal). */
.club-card{
  display:grid;grid-template-columns:1.5fr 1fr;gap:22px;align-items:center;
  background:linear-gradient(135deg,var(--kr-accent-soft),color-mix(in srgb,var(--kr-accent-soft) 40%,var(--kr-surface)));
  border:1px solid color-mix(in srgb,var(--kr-accent) 18%,transparent);
  border-radius:var(--r);padding:22px 24px;margin-top:14px}
.club-card.club-card-no-img{grid-template-columns:1fr;justify-items:center}
.club-image-wrap{width:100%;aspect-ratio:1573 / 1000;border-radius:12px;overflow:hidden;background:var(--kr-surface);border:1px solid var(--kr-line);box-shadow:0 4px 14px color-mix(in srgb,var(--kr-accent) 12%,transparent)}
.club-image-wrap img{width:100%;height:100%;object-fit:cover;display:block}
.club-side{display:flex;flex-direction:column;justify-content:center;align-items:center;gap:14px;text-align:center}
.club-copy{max-width:31ch}
.club-copy h3{margin:0 0 5px;font-size:16px;font-weight:700;letter-spacing:-.01em;color:var(--kr-ink)}
.club-copy p{margin:0;font-size:13.2px;line-height:1.45;color:var(--kr-ink-soft);text-wrap:pretty}
.club-btn,.club-btn:visited{
  background:linear-gradient(135deg,#d9bc72,#b98f32);
  color:#071d2b;
  border-color:transparent;
  text-decoration:none;
  box-shadow:0 4px 14px rgba(185,143,50,.26);
}
.club-btn:hover{filter:brightness(.96);text-decoration:none}
.club-btn:focus,.club-btn:focus-visible{outline:none;box-shadow:0 0 0 3px rgba(217,188,114,.35),0 4px 14px rgba(185,143,50,.26)}
.club-badge{display:inline-flex;align-items:center;gap:8px;font-size:12.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;background:var(--kr-green);color:var(--kr-green-ink-on);padding:10px 18px;border-radius:999px;box-shadow:0 4px 14px color-mix(in srgb,var(--kr-green) 30%,transparent);white-space:nowrap}
.club-badge .ic{width:15px;height:15px}
.club-badge.club-badge-soft{background:var(--kr-surface);color:var(--kr-ink-soft);border:1px solid var(--kr-line);box-shadow:none}

/* v1.1.0 — Sub-tarjetas del bloque "Club {brandName}".
   Contenedor común kb-card que envuelve cada sub-tarjeta (Programa de
   Puntos, Tarjeta PRIME, Mis Bonos, Mis Tarjetas Promocionales). Reusa
   los tokens del sistema — sin colores propios — y aporta título uniforme
   arriba, cuerpo debajo. Aspect-ratio de portada de PRIME 1.585/1
   (formato ISO/IEC 7810 ID-1), el mismo que se usa en /tarjetaprime.
   Las sub-tarjetas se apilan verticalmente con gap constante para leer
   Club → Puntos → PRIME → Bonos → Tarjetas de forma natural. */
.kb-card{margin-top:14px;background:linear-gradient(135deg,var(--kr-accent-soft),color-mix(in srgb,var(--kr-accent-soft) 40%,var(--kr-surface)));border:1px solid color-mix(in srgb,var(--kr-accent) 18%,transparent);border-radius:var(--r);padding:20px 22px}
.kb-card:first-child{margin-top:0}
.kb-title{margin:0 0 14px;font-size:15px;font-weight:700;letter-spacing:.02em;text-transform:uppercase;color:var(--kr-accent);text-align:center}
.kb-cover{width:100%;border-radius:12px;overflow:hidden;background:var(--kr-surface);border:1px solid var(--kr-line);box-shadow:0 4px 14px color-mix(in srgb,var(--kr-accent) 12%,transparent);margin:0 auto 14px;max-width:340px}
.kb-cover-prime{aspect-ratio:1.585 / 1}
.kb-cover img{width:100%;height:100%;object-fit:cover;display:block}
.kb-body{display:flex;flex-direction:column;align-items:center;gap:12px;text-align:center}
.kb-copy{margin:0;font-size:13.2px;line-height:1.45;color:var(--kr-ink-soft);text-wrap:pretty;max-width:42ch}
.kb-badge{display:inline-flex;align-items:center;gap:8px;font-size:12.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:10px 18px;border-radius:999px;white-space:nowrap}
.kb-badge .ic{width:15px;height:15px}
.kb-badge-ok{background:var(--kr-green);color:var(--kr-green-ink-on);box-shadow:0 4px 14px color-mix(in srgb,var(--kr-green) 30%,transparent)}
.kb-rows{display:flex;flex-direction:column;gap:8px;width:100%;max-width:360px;margin-top:4px}
.kb-row{display:flex;align-items:center;justify-content:space-between;gap:12px;background:var(--kr-surface);border:1px solid var(--kr-line);border-radius:10px;padding:9px 13px}
.kb-row-lbl{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--kr-ink-soft);font-weight:600}
.kb-row-val{font-size:14px;font-weight:600;color:var(--kr-ink)}
.kb-row-code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:13px;font-weight:600;color:var(--kr-ink);background:var(--kr-surface-2);border:1px solid var(--kr-line);border-radius:8px;padding:4px 10px;letter-spacing:.02em}
.kb-list{display:flex;flex-direction:column;gap:9px;width:100%}
.kb-item{display:flex;align-items:center;justify-content:space-between;gap:12px;background:var(--kr-surface);border:1px solid var(--kr-line);border-radius:10px;padding:11px 14px;text-align:left}
.kb-item-main{flex:1;min-width:0}
.kb-item-ttl{font-size:14.5px;font-weight:600;margin:0 0 3px;text-wrap:pretty}
.kb-item-meta{font-size:12.5px;color:var(--kr-ink-soft)}
.kb-item-code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12.5px;font-weight:600;color:var(--kr-ink);background:var(--kr-surface-2);border:1px solid var(--kr-line);border-radius:8px;padding:4px 9px;letter-spacing:.02em;flex:none}
.kb-btn{min-width:180px;text-decoration:none;letter-spacing:.06em;text-transform:uppercase;font-weight:700}
.kb-btn:hover{text-decoration:none}
.kb-btn-soft{opacity:.55;cursor:not-allowed;pointer-events:none}
/* La sub-tarjeta del Programa de Puntos anida la .puntos-card original:
   quitamos su margen inferior y el borde para no duplicar contenedores. */
.kb-card > .puntos-card{margin:0;border:none;background:transparent;padding:0}

/* ---------- listas (citas / historial / productos) ---------- */
.list{display:flex;flex-direction:column;gap:11px}
.row{display:flex;gap:16px;align-items:center;background:var(--kr-surface-2);border:1px solid var(--kr-line);border-radius:var(--r);padding:15px 17px}
.row .datebox{flex:none;width:58px;text-align:center;border-right:1px solid var(--kr-line);padding-right:14px}
.row .datebox .d{font-size:23px;font-weight:700;line-height:1;letter-spacing:-.02em}
.row .datebox .m{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--kr-ink-soft);margin-top:3px}
.row .main{flex:1;min-width:0}
.row .main .ttl{font-size:15.5px;font-weight:600;margin:0 0 3px;text-wrap:pretty}
.row .main .mt{font-size:13px;color:var(--kr-ink-soft);display:flex;flex-wrap:wrap;gap:4px 12px}
.row .main .mt .when{color:var(--kr-green-ink);font-weight:600}
.row .actions{display:flex;gap:8px;flex:none;align-items:center}
.row .price{font-size:16px;font-weight:700;white-space:nowrap}
.thumb{width:54px;height:54px;border-radius:11px;overflow:hidden;flex:none;background:var(--kr-surface);border:1px solid var(--kr-line)}
.thumb img{width:100%;height:100%;object-fit:cover;display:block}
.qty{font-size:12px;color:var(--kr-ink-soft)}
.more-row{display:flex;justify-content:center;margin-top:4px}

/* ---------- selector mover (chips) ---------- */
.mover{margin-top:12px;background:var(--kr-surface);border:1px dashed color-mix(in srgb,var(--kr-accent) 40%,transparent);border-radius:var(--r);padding:16px}
.mover h4{margin:0 0 4px;font-size:14px;font-weight:600}
.mover .hint{font-size:12.5px;color:var(--kr-ink-soft);margin:0 0 13px}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px}
.chip{cursor:pointer;font:inherit;font-size:13px;font-weight:600;border-radius:999px;padding:8px 14px;border:1px solid var(--kr-line);background:var(--kr-surface);color:var(--kr-ink);transition:.13s}
.chip.dia{}
.chip.dia:hover{border-color:var(--kr-orange)}
.chip.dia.sel{background:var(--kr-orange-soft);border-color:var(--kr-orange);color:var(--kr-orange-ink)}
.chip.hora:hover{border-color:var(--kr-green)}
.chip.hora.sel{background:var(--kr-green-soft);border-color:var(--kr-green);color:var(--kr-green-ink)}
.mover .foot{display:flex;gap:9px;justify-content:flex-end}
.lbl-mini{font-size:11.5px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--kr-ink-soft);margin:0 0 7px}

/* v1.0.5 — datepicker nativo + select horas para mover cita */
.mover-fields{display:flex;gap:12px;margin-bottom:14px;flex-wrap:wrap}
.mover-field{flex:1;min-width:160px}
.mover-input{font:inherit;font-size:14px;color:var(--kr-ink);background:var(--kr-surface-2);border:1px solid var(--kr-line);border-radius:var(--r);padding:10px 12px;width:100%;transition:.15s;cursor:pointer}
.mover-input:focus{outline:none;border-color:var(--kr-accent);box-shadow:0 0 0 3px var(--kr-accent-soft);background:var(--kr-surface)}
.mover-input:hover{border-color:var(--kr-accent)}

/* v1.0.7 — estados del bloque de horas (vacío sin fecha / loading / chips). */
.chips-hora{max-height:200px;overflow-y:auto;padding:2px}
.mover-empty{font-size:13px;color:var(--kr-ink-soft);margin:4px 0 14px;padding:10px 12px;background:var(--kr-surface-2);border:1px dashed var(--kr-line);border-radius:var(--r);text-align:center}
.mover-loading{display:flex;align-items:center;gap:10px;font-size:13px;color:var(--kr-ink-soft);margin:4px 0 14px;padding:10px 12px;background:var(--kr-surface-2);border:1px solid var(--kr-line);border-radius:var(--r);justify-content:center}
.mover-spin{width:14px;height:14px;border:2px solid var(--kr-line);border-top-color:var(--kr-accent);border-radius:50%;animation:moverSpin .9s linear infinite;flex:none}
@keyframes moverSpin{to{transform:rotate(360deg)}}

/* ---------- notas ---------- */
.nota-wrap{position:relative}
textarea.nota{font:inherit;font-size:15px;line-height:1.55;color:var(--kr-ink);background:var(--kr-surface-2);border:1px solid var(--kr-line);border-radius:var(--r);padding:15px 16px;width:100%;min-height:120px;resize:vertical;transition:.15s}
textarea.nota:focus{outline:none;border-color:var(--kr-accent);box-shadow:0 0 0 3px var(--kr-accent-soft);background:var(--kr-surface)}
.nota-foot{display:flex;align-items:center;justify-content:space-between;margin-top:12px;gap:12px;flex-wrap:wrap}
.nota-foot .edited{font-size:12.5px;color:var(--kr-ink-soft)}

/* ---------- expediente ---------- */
.exp-intro{display:flex;gap:11px;align-items:flex-start;font-size:13.5px;color:var(--kr-ink-soft);background:var(--kr-surface-2);border-radius:var(--r);padding:13px 15px;margin:0 0 18px}
.exp-intro .ic{color:var(--kr-accent);margin-top:1px;width:17px;height:17px}
.dl{display:grid;grid-template-columns:max-content 1fr;gap:11px 22px;margin:0 0 22px}
.dl dt{font-size:13px;font-weight:600;color:var(--kr-ink-soft)}
.dl dd{margin:0;font-size:14.5px;text-wrap:pretty}
.diag{display:flex;flex-direction:column;gap:14px}
.diag-card{display:flex;gap:16px;background:var(--kr-surface-2);border:1px solid var(--kr-line);border-radius:var(--r);padding:16px;align-items:flex-start}
.diag-card .ph{width:128px;height:96px;border-radius:11px;overflow:hidden;flex:none;background:var(--kr-surface);border:1px solid var(--kr-line)}
.diag-card .ph img{width:100%;height:100%;object-fit:cover;display:block}
.diag-card .body{flex:1;min-width:0}
.diag-card .zona{display:inline-flex;align-items:center;gap:7px;font-size:12px;font-weight:700;letter-spacing:.03em;text-transform:uppercase;color:var(--kr-accent);background:var(--kr-accent-soft);padding:4px 10px;border-radius:999px;margin-bottom:8px}
.diag-card p{margin:0 0 9px;font-size:14px;line-height:1.55;text-wrap:pretty}
.diag-card .by{font-size:12.5px;color:var(--kr-ink-soft)}
.diag-card .by b{color:var(--kr-ink);font-weight:600}

/* ---------- estados vacíos ---------- */
.empty{text-align:center;padding:30px 20px}
.empty .glyph{font-size:30px;margin-bottom:8px}
.empty h3{margin:0 0 6px;font-size:16px;font-weight:600}
.empty p{margin:0 auto 16px;font-size:13.5px;color:var(--kr-ink-soft);max-width:38ch}

/* ---------- sesión cargando / error ---------- */
.sk{background:var(--kr-surface);border:1px solid var(--kr-line);border-radius:calc(var(--r) + 2px);padding:22px;margin-bottom:20px}
.sk .bar{height:14px;border-radius:7px;background:linear-gradient(90deg,var(--kr-surface-2),var(--kr-line),var(--kr-surface-2));background-size:200% 100%;animation:sh 1.3s linear infinite;margin-bottom:12px}
@keyframes sh{to{background-position:-200% 0}}
.err{text-align:center;background:var(--kr-surface);border:1px solid var(--kr-danger);border-radius:calc(var(--r)+2px);padding:40px 24px}
.err .glyph{color:var(--kr-danger);margin-bottom:10px}
.err h2{margin:0 0 6px;font-size:19px}
.err p{margin:0 0 18px;color:var(--kr-ink-soft);font-size:14px}

/* ---------- toasts ---------- */
.toasts{position:fixed;left:50%;bottom:26px;transform:translateX(-50%);display:flex;flex-direction:column;gap:8px;z-index:50;align-items:center;pointer-events:none}
.toast{display:flex;align-items:center;gap:9px;background:var(--kr-ink);color:var(--kr-bg);font-size:13.5px;font-weight:600;padding:11px 17px;border-radius:999px;box-shadow:0 8px 24px rgba(0,0,0,.18);opacity:0;transform:translateY(8px);transition:.28s}
.toast.show{opacity:1;transform:translateY(0)}
.toast.t-green{background:var(--kr-green);color:var(--kr-green-ink)}
.toast.t-danger{background:var(--kr-danger);color:var(--kr-danger-ink)}
.toast .ic{width:16px;height:16px}

/* ---------- modo estrecho (móvil / acordeón) ---------- */
.wrap.narrow{padding:18px 16px 60px}
.wrap.narrow .identity{flex-wrap:wrap;gap:14px;padding:16px}
.wrap.narrow .identity h1{font-size:22px}
.wrap.narrow .badge-exp{order:3;width:100%;justify-content:center}
.wrap.narrow .panel{grid-template-columns:1fr;gap:14px}
.wrap.narrow nav.sidenav{display:none}
.navmobile{display:none}
.wrap.narrow .navmobile{display:block;position:sticky;top:8px;z-index:20;margin-bottom:4px}
.navselect{display:flex;align-items:center;gap:11px;width:100%;background:var(--kr-surface);border:1px solid var(--kr-line);border-radius:var(--r);padding:13px 15px;font:inherit;font-size:15px;font-weight:600;color:var(--kr-ink);cursor:pointer;box-shadow:0 3px 12px rgba(0,0,0,.06)}
.navselect .ns-ic .ic{color:var(--kr-accent);width:18px;height:18px;display:block}
.navselect .ns-label{flex:1;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.navselect .ns-chev{color:var(--kr-ink-soft);transform:rotate(90deg);transition:transform .2s}
.navselect .ns-chev .ic{width:18px;height:18px;display:block}
.navmobile.open .ns-chev{transform:rotate(-90deg)}
.navmenu{position:absolute;left:0;right:0;top:calc(100% + 6px);background:var(--kr-surface);border:1px solid var(--kr-line);border-radius:var(--r);padding:6px;box-shadow:0 16px 44px rgba(0,0,0,.18);display:flex;flex-direction:column;gap:2px;z-index:30}
.navmenu[hidden]{display:none}
.navmenu button{display:flex;align-items:center;gap:12px;width:100%;text-align:left;background:none;border:0;cursor:pointer;font:inherit;font-size:14.5px;font-weight:500;color:var(--kr-ink);padding:11px 12px;border-radius:10px}
.navmenu button .ic{color:var(--kr-ink-soft);width:17px;height:17px}
.navmenu button:hover{background:var(--kr-surface-2)}
.navmenu button.active{background:var(--kr-accent-soft);color:var(--kr-accent);font-weight:600}
.navmenu button.active .ic{color:var(--kr-accent)}
.wrap.narrow .sec-head{cursor:pointer;padding:17px 18px}
.wrap.narrow .sec-head .chev{display:block}
.wrap.narrow .sec.collapsed .chev{transform:rotate(-90deg)}
.wrap.narrow .sec.collapsed .sec-body{display:none}
.wrap.narrow .sec-body{padding:6px 18px 20px}
.wrap.narrow .grid2{grid-template-columns:1fr}
.wrap.narrow .puntos-card{grid-template-columns:1fr;justify-items:center;text-align:center}
.wrap.narrow .puntos-info p{margin-inline:auto}
.wrap.narrow .club-card{grid-template-columns:1fr;justify-items:center}
/* v1.1.0 — kb-cards en móvil: padding un poco menor y ancho fluido del
   cover PRIME para no dejar un borde visual desproporcionado. */
.wrap.narrow .kb-card{padding:18px 16px}
.wrap.narrow .kb-cover{max-width:100%}
.wrap.narrow .kb-btn{width:100%;min-width:0}
.wrap.narrow .row{flex-wrap:wrap}
.wrap.narrow .row .actions{width:100%;justify-content:flex-end}
.wrap.narrow .diag-card{flex-direction:column}
.wrap.narrow .diag-card .ph{width:100%;height:160px}
.wrap.narrow .dl{grid-template-columns:1fr;gap:3px 0}
.wrap.narrow .dl dt{margin-top:8px}
@media(prefers-reduced-motion:reduce){*{animation-duration:.01ms!important;transition-duration:.01ms!important}}
`;
  }

  shell() {
    const d = this._data;
    if (!d) return `<div class="wrap"><div class="toasts"></div></div>`;
    if (d.estado === 'cargando') return this.shellLoading();
    if (d.estado === 'error') return this.shellError();
    return `<div class="wrap">
      ${this.identity()}
      <div class="panel">
        ${this.nav()}
        <main class="content">
          ${this.navMobile()}
          ${SECCIONES.map(s => this.section(s)).join('')}
        </main>
      </div>
      <div class="toasts"></div>
    </div>`;
  }

  shellLoading() {
    return `<div class="wrap">
      <div class="sk" style="display:flex;gap:18px;align-items:center">
        <div class="bar" style="width:74px;height:74px;border-radius:50%;margin:0"></div>
        <div style="flex:1"><div class="bar" style="width:38%"></div><div class="bar" style="width:24%;margin:0"></div></div>
      </div>
      ${[0, 1, 2].map(() => `<div class="sk"><div class="bar" style="width:30%"></div><div class="bar"></div><div class="bar" style="width:80%"></div><div class="bar" style="width:60%;margin:0"></div></div>`).join('')}
      <div class="toasts"></div>
    </div>`;
  }

  shellError() {
    return `<div class="wrap">
      <div class="err">
        <div class="glyph">${ic('warn')}</div>
        <h2>No hemos podido cargar tu área</h2>
        <p>Algo ha fallado al recuperar tus datos. Inténtalo de nuevo en un momento.</p>
        <button class="btn btn-primary" data-act="reintentar">${ic('repeat')} Reintentar</button>
      </div>
      <div class="toasts"></div>
    </div>`;
  }

  identity() {
    const c = this._data.cliente;
    const nombreCompleto = [c.nombre, c.apellido].filter(Boolean).join(' ');
    const initials = ((c.nombre || '?')[0] + (c.apellido || '')[0] || '?').toUpperCase();
    const avatar = c.foto
      ? `<img src="${esc(c.foto)}" alt="">`
      : `<span class="initials">${esc(initials)}</span>`;
    const badge = c.expedienteActivo
      ? `<span class="badge-exp"><span class="dot"></span>Expediente activo</span>` : '';
    return `<header class="identity">
      <div class="avatar">${avatar}</div>
      <div class="meta">
        <p class="hello">Tu área de cliente</p>
        <h1>${esc(nombreCompleto || 'Tu perfil')}</h1>
        <p class="sub">TU SALÓN · ${esc(c.email || 'completa tu ficha')}</p>
      </div>
      ${badge}
    </header>`;
  }

  nav() {
    return `<nav class="sidenav">${SECCIONES.map(s =>
      `<button data-nav="${s.id}" class="${s.id === this._activa ? 'active' : ''}">${ic(s.icon)}<span>${esc(labelSeccion(s, this._data))}</span></button>`
    ).join('')}</nav>`;
  }

  navMobile() {
    const act = SECCIONES.find(s => s.id === this._activa) || SECCIONES[0];
    return `<div class="navmobile">
      <button class="navselect" data-navtoggle>
        <span class="ns-ic">${ic(act.icon)}</span>
        <span class="ns-label">${esc(labelSeccion(act, this._data))}</span>
        <span class="ns-chev">${ic('arrow')}</span>
      </button>
      <div class="navmenu" data-navmenu hidden>
        ${SECCIONES.map(s => `<button data-nav="${s.id}" class="${s.id === this._activa ? 'active' : ''}">${ic(s.icon)}<span>${esc(labelSeccion(s, this._data))}</span></button>`).join('')}
      </div>
    </div>`;
  }

  section(s) {
    const collapsed = this._narrow && !this._abiertas.has(s.id);
    const body = this['sec_' + s.id] ? this['sec_' + s.id]() : '';
    const headExtra = s.id === 'personal' ? this.personalHeadActions() : '';
    return `<section class="sec ${collapsed ? 'collapsed' : ''}" id="sec-${s.id}" data-sec="${s.id}">
      <div class="sec-head" data-head="${s.id}">
        ${ic(s.icon)}<h2>${esc(labelSeccion(s, this._data))}</h2>${headExtra}
        <span class="chev">${ic('arrow')}</span>
      </div>
      <div class="sec-body">${body}</div>
    </section>`;
  }

  /* ---------------- 3.1 INFORMACIÓN PERSONAL ---------------- */
  personalHeadActions() {
    if (this._narrow) return '';
    return this._editPerfil
      ? `<div class="head-actions">
           <button class="btn btn-ghost btn-sm" data-act="cancelarPerfil">Cancelar</button>
           <button class="btn btn-primary btn-sm" data-act="guardarPerfil">${ic('check')} Guardar</button>
         </div>`
      : `<div class="head-actions"><button class="btn btn-ghost btn-sm" data-act="editarPerfil">${ic('edit')} Editar</button></div>`;
  }

  sec_personal() {
    const c = this._data.cliente;
    const generico = /^(booking|info|noreply|no-reply|admin|hola)@/i.test(c.email || '');
    const faltan = [];
    // v1.0.3 — Jal pidió eliminar Apellido 2. KAMISUITE V2 trabaja con un
    // único apellido (info.name.last de Wix Contacts).
    if (!c.apellido) faltan.push('apellido');
    if (!c.telefono) faltan.push('teléfono');
    const aviso = (generico || faltan.length)
      ? `<div class="notice">${ic('warn')}<div><b>Completa tu ficha para que el salón te reconozca.</b> ${
          generico ? 'Tu email parece genérico. ' : ''}${
          faltan.length ? 'Falta: ' + faltan.join(', ') + '. ' : ''}Así podemos avisarte de tus citas y recordar tus preferencias.</div></div>`
      : '';

    if (!this._editPerfil) {
      const v = (val) => val ? `<div class="val">${esc(val)}</div>` : `<div class="val empty">Sin completar</div>`;
      const tel = c.telefono ? `${esc(c.prefijo || '')} ${esc(c.telefono)}` : '';
      const mobileActions = this._narrow ? `<div class="field span"><button class="btn btn-ghost btn-sm" data-act="editarPerfil">${ic('edit')} Editar mis datos</button></div>` : '';
      return `${aviso}<div class="grid2">
        <div class="field"><label>Nombre</label>${v(c.nombre)}</div>
        <div class="field"><label>Apellido</label>${v(c.apellido)}</div>
        <div class="field"><label>Sexo</label>${v(c.sexo)}</div>
        <div class="field"><label>DNI / NIF · para facturas</label>${v(c.dni)}</div>
        <div class="field"><label>Email</label>${v(c.email)}</div>
        <div class="field"><label>Teléfono</label>${v(tel)}</div>
        ${mobileActions}
      </div>`;
    }

    // modo edición — borrador
    const dr = this._draft || (this._draft = { ...c });
    const inp = (k, attrs = '') => `<input class="inp" data-field="${k}" value="${esc(dr[k] || '')}" ${attrs}>`;
    const sexOpts = ['Mujer', 'Hombre', 'Otro', 'Prefiero no decirlo']
      .map(o => `<option ${dr.sexo === o ? 'selected' : ''}>${o}</option>`).join('');
    const prefOpts = PREFIJOS.map(p => `<option ${dr.prefijo === p ? 'selected' : ''}>${p}</option>`).join('');
    const avatarPrev = dr.foto ? `<img src="${esc(dr.foto)}" alt="">` : `<span class="initials">${esc((dr.nombre || '?')[0] || '?').toUpperCase()}</span>`;
    return `${aviso}<div class="grid2">
      <div class="photo-edit">
        <div class="avatar">${avatarPrev}</div>
        <button class="btn btn-soft btn-sm" data-act="subirFoto">${ic('camera')} Cambiar foto</button>
        <input type="file" accept="image/*" data-file="foto" hidden>
      </div>
      <div class="field"><label>Nombre</label>${inp('nombre')}</div>
      <div class="field"><label>Apellido</label>${inp('apellido')}</div>
      <div class="field"><label>Sexo</label><select class="sel" data-field="sexo">${sexOpts}</select></div>
      <div class="field"><label>DNI / NIF · para facturas</label>${inp('dni')}</div>
      <div class="field"><label>Email</label>${inp('email', 'type="email"')}</div>
      <div class="field span"><label>Teléfono</label><div class="tel-row"><select class="sel" data-field="prefijo">${prefOpts}</select>${inp('telefono', 'type="tel" style="flex:1"')}</div></div>
      ${this._narrow ? `<div class="field span" style="display:flex;gap:9px"><button class="btn btn-primary btn-sm" data-act="guardarPerfil">${ic('check')} Guardar</button><button class="btn btn-ghost btn-sm" data-act="cancelarPerfil">Cancelar</button></div>` : ''}
    </div>`;
  }

  /* ---------------- 3.2 PROGRAMA DE PUNTOS ---------------- */
  sec_puntos() {
    const p = this._data.puntos || {};
    // v1.0.3 — Jal pidió eliminar "Te faltan X puntos…" y por tanto el
    // concepto de "siguiente hito". El ring se rellena en proporción a un
    // máximo visual (500) para que tenga progresión coherente.
    const pct = Math.min(1, (p.saldo || 0) / 500);
    const R = 52, C = 2 * Math.PI * R;
    const insignia = p.insignia
      ? `<span class="insignia">${ic('star')}<span>${esc(p.insignia)}</span></span>` : '';

    // v1.1.0 — Sub-tarjeta 1: Programa de Puntos. Título añadido a la
    // sub-tarjeta del anillo (antes no tenía título propio). Mismo layout.
    const puntosCard = `
      <div class="kb-card">
        <h3 class="kb-title">Programa de Puntos</h3>
        <div class="puntos-card">
          <div class="puntos-ring-col">
            <div class="puntos-ring">
              <svg width="118" height="118" viewBox="0 0 118 118">
                <circle cx="59" cy="59" r="${R}" fill="none" stroke="var(--kr-line)" stroke-width="9"/>
                <circle cx="59" cy="59" r="${R}" fill="none" stroke="var(--kr-accent)" stroke-width="9"
                  stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - pct)}"/>
              </svg>
              <div class="num"><b>${p.saldo || 0}</b><span>puntos</span></div>
            </div>
            ${insignia}
          </div>
          <div class="puntos-info">
            <span class="lvl">${ic('spark')} Cliente ${esc(p.nivel || 'Habitual')}</span>
            <h3>Vas muy bien, sigue así</h3>
            <p>${esc(p.comoGanar || 'Cada visita y cada producto suman puntos. El salón te informará cómo canjearlos.')}</p>
          </div>
        </div>
      </div>`;

    // v1.1.0 — Sub-tarjeta 2: Tarjeta PRIME.
    // Imagen desde `data.prime.imagen` (KamisuiteProductsConfig.primeImage
    // via backend v1.6.0+). Si `data.prime.tiene`, muestra fecha de
    // vencimiento y código de la membresía activa. Si no, muestra copy +
    // botón ADQUIRIR hacia `data.prime.urlAdquirir` (SalonConfig.siteUrl +
    // '/' + promotionsPageSlug). Si la URL viene vacía, el botón queda
    // deshabilitado con estilo `soft`.
    const primeCard = this._renderPrimeCard();

    // v1.1.0 — Sub-tarjeta 3: Mis Bonos Descuento.
    const bonosCard = this._renderBonosCard();

    // v1.1.0 — Sub-tarjeta 4: Mis Tarjetas Promocionales.
    const tarjetasCard = this._renderTarjetasCard();

    return `${puntosCard}${primeCard}${bonosCard}${tarjetasCard}`;
  }

  /* v1.1.0 — Sub-tarjeta PRIME (Tarjeta PRIME).
     Vista con y sin membresía activa. La imagen de portada mantiene el
     mismo aspect-ratio de tarjeta ID-1 (1.585:1) que ya se usa en el
     widget público /tarjetaprime, garantizando coherencia visual entre
     el punto de compra y el área privada del cliente. */
  _renderPrimeCard() {
    const prime = this._data.prime || {};
    const url = String(prime.urlAdquirir || '').trim();
    const imgHtml = prime.imagen
      ? `<div class="kb-cover kb-cover-prime"><img src="${esc(prime.imagen)}" alt=""></div>`
      : '';
    let contenido;
    if (prime.tiene === true && prime.membresia) {
      const code = String(prime.membresia.code || '');
      const exp = String(prime.membresia.expirationDate || '');
      const expHumana = exp ? this._fechaHumana(exp) : '';
      const infoRows = [
        expHumana ? `<div class="kb-row"><span class="kb-row-lbl">Vence</span><b class="kb-row-val">${esc(expHumana)}</b></div>` : '',
        code      ? `<div class="kb-row"><span class="kb-row-lbl">Código</span><code class="kb-row-code">${esc(code)}</code></div>` : ''
      ].filter(Boolean).join('');
      contenido = `
        <span class="kb-badge kb-badge-ok">${ic('check')}<span>MEMBRESÍA ACTIVA</span></span>
        <div class="kb-rows">${infoRows}</div>`;
    } else {
      const btn = url
        ? `<a class="btn btn-primary kb-btn" href="${esc(url)}" target="_blank" rel="noopener noreferrer">ADQUIRIR</a>`
        : `<span class="btn btn-ghost kb-btn kb-btn-soft" aria-disabled="true">ADQUIRIR</span>`;
      contenido = `
        <p class="kb-copy">Ventajas exclusivas, bonos descuento y beneficios especiales pensados para disfrutar más de cada visita.</p>
        ${btn}`;
    }
    return `
      <div class="kb-card">
        <h3 class="kb-title">Tarjeta PRIME</h3>
        ${imgHtml}
        <div class="kb-body">${contenido}</div>
      </div>`;
  }

  /* v1.1.0 — Sub-tarjeta Mis Bonos Descuento.
     Si el cliente tiene bonos activos → lista compacta (código, servicio,
     usos restantes/totales, vencimiento). Si no → copy explicativo.
     Botón ADQUIRIR presente en ambos casos: el cliente PRIME puede
     comprar más bonos aunque ya tenga alguno activo de otros servicios. */
  _renderBonosCard() {
    const bonos = this._data.bonos || {};
    const items = Array.isArray(bonos.items) ? bonos.items : [];
    const url = String(bonos.urlAdquirir || '').trim();
    let contenido;
    if (bonos.tiene === true && items.length) {
      const rows = items.map(b => {
        const code = String(b.code || '');
        const serv = String(b.serviceLabel || '');
        const rem = Number(b.remainingUses) || 0;
        const tot = Number(b.totalUses) || 0;
        const exp = String(b.expirationDate || '');
        const expHumana = exp ? this._fechaHumana(exp) : '';
        const usos = tot > 0 ? `${rem} / ${tot} usos` : `${rem} usos`;
        return `
          <div class="kb-item">
            <div class="kb-item-main">
              <div class="kb-item-ttl">${esc(serv || 'Bono')}</div>
              <div class="kb-item-meta">${esc(usos)}${expHumana ? ` · vence ${esc(expHumana)}` : ''}</div>
            </div>
            ${code ? `<code class="kb-item-code">${esc(code)}</code>` : ''}
          </div>`;
      }).join('');
      contenido = `<div class="kb-list">${rows}</div>`;
    } else {
      contenido = `<p class="kb-copy">Ahorra en tus servicios favoritos con bonos de varios usos, diseñados para cuidarte con más frecuencia a un precio más especial.</p>`;
    }
    const btn = url
      ? `<a class="btn btn-primary kb-btn" href="${esc(url)}" target="_blank" rel="noopener noreferrer">ADQUIRIR</a>`
      : `<span class="btn btn-ghost kb-btn kb-btn-soft" aria-disabled="true">ADQUIRIR</span>`;
    return `
      <div class="kb-card">
        <h3 class="kb-title">Mis Bonos Descuento</h3>
        <div class="kb-body">${contenido}${btn}</div>
      </div>`;
  }

  /* v1.1.0 — Sub-tarjeta Mis Tarjetas Promocionales.
     Mismo patrón que bonos: lista si hay + botón ADQUIRIR siempre.
     Nota: el backend excluye las tarjetas isGift=true (regalos), que se
     canjean por entrada manual del código. */
  _renderTarjetasCard() {
    const tarjetas = this._data.tarjetas || {};
    const items = Array.isArray(tarjetas.items) ? tarjetas.items : [];
    const url = String(tarjetas.urlAdquirir || '').trim();
    let contenido;
    if (tarjetas.tiene === true && items.length) {
      const rows = items.map(t => {
        const code = String(t.code || '');
        const serv = String(t.serviceLabel || '');
        const exp = String(t.expirationDate || '');
        const expHumana = exp ? this._fechaHumana(exp) : '';
        return `
          <div class="kb-item">
            <div class="kb-item-main">
              <div class="kb-item-ttl">${esc(serv || 'Tarjeta Promocional')}</div>
              ${expHumana ? `<div class="kb-item-meta">Vence ${esc(expHumana)}</div>` : ''}
            </div>
            ${code ? `<code class="kb-item-code">${esc(code)}</code>` : ''}
          </div>`;
      }).join('');
      contenido = `<div class="kb-list">${rows}</div>`;
    } else {
      contenido = `<p class="kb-copy">Descubre promociones únicas para fechas señaladas, momentos especiales y servicios seleccionados de belleza y cuidado.</p>`;
    }
    const btn = url
      ? `<a class="btn btn-primary kb-btn" href="${esc(url)}" target="_blank" rel="noopener noreferrer">ADQUIRIR</a>`
      : `<span class="btn btn-ghost kb-btn kb-btn-soft" aria-disabled="true">ADQUIRIR</span>`;
    return `
      <div class="kb-card">
        <h3 class="kb-title">Mis Tarjetas Promocionales</h3>
        <div class="kb-body">${contenido}${btn}</div>
      </div>`;
  }

  /* v1.1.0 — Formatea 'YYYY-MM-DD' a 'D mmm YYYY' con reutilización de
     los MESES globales del módulo. Si la entrada no es válida devuelve
     el input tal cual. */
  _fechaHumana(ymd) {
    if (!ymd || typeof ymd !== 'string') return ymd || '';
    const d = new Date(ymd + 'T00:00:00');
    if (isNaN(d)) return ymd;
    return `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`;
  }

  /* ---------------- 3.3 PRÓXIMAS CITAS ---------------- */
  sec_proximas() {
    const list = this._data.proximas || [];
    if (!list.length) {
      return `<div class="empty">
        <div class="glyph">🗓️</div>
        <h3>No tienes citas próximas</h3>
        <p>Cuando reserves, tus próximas visitas aparecerán aquí con todos los detalles.</p>
        <button class="btn btn-primary" data-act="reservar">${ic('plus')} Reservar una cita</button>
      </div>`;
    }
    return `<div class="list">${list.map(c => this.citaRow(c)).join('')}</div>`;
  }

  citaRow(c) {
    const d = new Date(c.fecha + 'T00:00:00');
    const abierto = this._moverAbierto === c.id;
    const mover = abierto ? this.moverSelector(c) : '';
    return `<div class="row" data-cita="${c.id}">
      <div class="datebox"><div class="d">${d.getDate()}</div><div class="m">${MESES[d.getMonth()]}</div></div>
      <div class="main">
        <p class="ttl">${esc(c.servicio)}</p>
        <div class="mt">
          <span class="when">${esc(c.dia || diaSemana(c.fecha))} · ${esc(c.horaIni)}–${esc(c.horaFin)}</span>
          <span>${esc(c.profesional)}</span><span>${esc(c.lugar)}</span>
        </div>
        ${mover}
      </div>
      <div class="actions">
        <button class="btn btn-ghost btn-sm" data-act="mover" data-id="${c.id}">${abierto ? 'Cerrar' : 'Mover'}</button>
        <button class="btn btn-danger btn-sm" data-act="cancelarConfirm" data-id="${c.id}">Cancelar</button>
      </div>
    </div>`;
  }

  moverSelector(c) {
    // v1.0.7 — Chips de horas dinámicos en lugar de <select> hardcoded.
    // El cliente elige día en el datepicker nativo → emitimos
    // 'pedirHuecosMover' al page code → el backend devuelve los huecos
    // REALES del salón para ese día y esa reserva → pintamos chips.
    // Mismo patrón visual y funcional que el widget público de reservas.
    const sel = this._moverSel[c.id] || {};
    const hoy = new Date();
    const minISO = hoy.toISOString().slice(0, 10);
    const max = new Date(hoy.getTime() + 90 * 24 * 60 * 60 * 1000);
    const maxISO = max.toISOString().slice(0, 10);

    const fechaVal = sel.fecha || '';
    const horaVal = sel.hora || '';
    const huecos = Array.isArray(sel.huecos) ? sel.huecos : null;
    const loading = !!sel.loadingHuecos;
    const busy = !!sel.busy;       // true mientras llega respuesta del backend al confirmar
    const errMsg = sel.huecosError;
    const motivo = sel.huecosMotivo;

    // Bloque de horas: 5 estados visuales.
    let horasBlock = '';
    if (!fechaVal) {
      horasBlock = `<p class="mover-empty">Elige primero un día.</p>`;
    } else if (loading) {
      horasBlock = `<div class="mover-loading"><span class="mover-spin"></span> Buscando huecos…</div>`;
    } else if (errMsg) {
      horasBlock = `<p class="mover-empty">No hemos podido cargar la disponibilidad. Prueba otro día.</p>`;
    } else if (motivo === 'cerrado') {
      horasBlock = `<p class="mover-empty">El salón no abre este día. Prueba otro.</p>`;
    } else if (huecos && huecos.length === 0) {
      horasBlock = `<p class="mover-empty">No quedan huecos este día. Prueba otro.</p>`;
    } else if (huecos && huecos.length > 0) {
      horasBlock = `<div class="chips chips-hora">${
        huecos.map(h =>
          `<button type="button" class="chip hora${horaVal === h ? ' sel' : ''}" data-act="moverHoraChip" data-id="${c.id}" data-hora="${esc(h)}">${esc(h)}</button>`
        ).join('')
      }</div>`;
    } else {
      // huecos === null (sin pedir todavía, o pedido y aún sin respuesta)
      horasBlock = `<div class="mover-loading"><span class="mover-spin"></span> Buscando huecos…</div>`;
    }

    const puede = fechaVal && horaVal && !busy && !loading;
    const btnConfirmTxt = busy ? 'Moviendo…' : 'Confirmar cambio';
    return `<div class="mover">
      <h4>Mover cita con ${esc(c.profesional)}</h4>
      <p class="hint">Elige un nuevo día y hora. Mantienes el mismo servicio y profesional.</p>
      <div class="mover-fields">
        <div class="mover-field">
          <p class="lbl-mini">Día</p>
          <input type="date" class="mover-input" data-act="moverDiaInput" data-id="${c.id}"
                 value="${fechaVal}" min="${minISO}" max="${maxISO}">
        </div>
      </div>
      <p class="lbl-mini">Hora</p>
      ${horasBlock}
      <div class="foot">
        <button class="btn btn-ghost btn-sm" data-act="mover" data-id="${c.id}" ${busy ? 'disabled' : ''}>Cancelar</button>
        <button class="btn btn-primary btn-sm" data-act="moverConfirm" data-id="${c.id}" ${puede ? '' : 'disabled'}>${ic('check')} ${btnConfirmTxt}</button>
      </div>
    </div>`;
  }

  /* ---------------- 3.4 SERVICIOS ANTERIORES ---------------- */
  sec_anteriores() {
    const all = this._data.anteriores || [];
    if (!all.length) {
      return `<div class="empty"><div class="glyph">✨</div><h3>Aún no hay servicios anteriores</h3>
        <p>Tu historial de visitas aparecerá aquí después de tu primera cita.</p></div>`;
    }
    const vis = all.slice(0, this._anterioresVisibles);
    const rows = vis.map(h => `<div class="row">
      <div class="datebox"><div class="d">${new Date(h.fecha + 'T00:00:00').getDate()}</div><div class="m">${MESES[new Date(h.fecha + 'T00:00:00').getMonth()]}</div></div>
      <div class="main">
        <p class="ttl">${esc(h.servicios.join(' · '))}</p>
        <div class="mt"><span>${fechaCorta(h.fecha)}</span><span>${esc(h.profesional)}</span></div>
      </div>
      <div class="price">${eur(h.importe)}</div>
      <div class="actions"><button class="btn btn-soft btn-sm" data-act="repetirServicio" data-cat="${esc(h.categoria)}" data-id="${h.id}">${ic('repeat')} Repetir</button></div>
    </div>`).join('');
    const more = all.length > this._anterioresVisibles
      ? `<div class="more-row"><button class="btn btn-ghost btn-sm" data-act="verMasAnteriores">Ver más visitas (${all.length - this._anterioresVisibles})</button></div>` : '';
    return `<p class="sec-desc">Tu historial de visitas. Repite cualquier servicio en un toque — te llevamos al reservar con la categoría ya elegida.</p><div class="list">${rows}</div>${more}`;
  }

  /* ---------------- 3.5 NOTAS PARA EL SALÓN ---------------- */
  sec_notas() {
    const n = this._data.notaCliente || { texto: '', editado: null };
    const edited = n.editado ? `Última edición: ${fechaCorta(n.editado)}` : 'Aún no has escrito ninguna nota';
    return `<p class="sec-desc">Deja indicaciones para el salón: alergias, preferencias, si sueles llegar tarde… Lo verá tu profesional antes de cada visita.</p>
      <div class="nota-wrap">
        <textarea class="nota" data-nota placeholder="Ej.: Soy alérgica a… / Prefiero café con leche de avena / Llego siempre 10 min tarde…">${esc(n.texto)}</textarea>
      </div>
      <div class="nota-foot">
        <span class="edited" data-edited>${edited}</span>
        <button class="btn btn-primary btn-sm" data-act="guardarNota" disabled>${ic('check')} Guardar nota</button>
      </div>`;
  }

  /* ---------------- 3.6 PRODUCTOS ---------------- */
  sec_productos() {
    const list = this._data.productos || [];
    if (!list.length) {
      return `<div class="empty"><div class="glyph">🧴</div><h3>Todavía no has comprado productos</h3>
        <p>Los productos que compres en el salón o en la tienda online aparecerán aquí para repetir compra fácilmente.</p></div>`;
    }
    return `<div class="list">${list.map(p => `<div class="row">
      <div class="thumb"><img src="${esc(p.foto)}" alt=""></div>
      <div class="main">
        <p class="ttl">${esc(p.nombre)}</p>
        <div class="mt"><span>Comprado el ${fechaCorta(p.fecha)}</span><span class="qty">Cantidad: ${p.cantidad}</span></div>
      </div>
      <div class="price">${eur(p.importe)}</div>
      <div class="actions"><button class="btn btn-soft btn-sm" data-act="repetirCompra" data-id="${esc(p.productId || '')}">${ic('repeat')} Repetir compra</button></div>
    </div>`).join('')}</div>`;
  }

  /* ---------------- 3.7 INFORMACIÓN ADICIONAL (expediente) ---------------- */
  sec_expediente() {
    const e = this._data.expediente;
    if (!e) {
      return `<div class="empty"><div class="glyph">🌿</div><h3>Tu salón aún no ha registrado notas</h3>
        <p>Aquí aparecerán los detalles que tu profesional anota sobre tus servicios: color aplicado, longitud y recomendaciones. Es tu expediente personal de cuidado.</p></div>`;
    }
    // v1.0.3 — Jal pidió eliminar sub-sección "Diagnósticos". Mantenemos
    // solo "Detalles de tus servicios" parseado desde customnotaspublicas.
    const dl = (e.detalles || []).map(d => `<dt>${esc(d.etiqueta)}</dt><dd>${esc(d.valor)}</dd>`).join('');
    return `<div class="exp-intro">${ic('file')}<div>Esto lo escribe tu salón para cuidarte mejor. Es solo de lectura — si algo no encaja, coméntalo en tu próxima visita.</div></div>
      <p class="lbl-mini">Detalles de tus servicios</p>
      <dl class="dl">${dl}</dl>`;
  }

  /* ====================================================================== */
  /*  EVENTOS / INTERACCIÓN                                                  */
  /* ====================================================================== */
  _bind() {
    const sr = this.shadowRoot;

    // delegación a nivel shadowRoot: SOLO una vez (el shadowRoot persiste entre renders)
    if (!this._clickBound) {
      this._clickBound = true;
      sr.addEventListener('click', (e) => {
        const toggle = e.target.closest('[data-navtoggle]');
        if (toggle) {
          const nm = sr.querySelector('.navmobile');
          const menu = sr.querySelector('[data-navmenu]');
          const willOpen = menu.hidden;
          menu.hidden = !willOpen;
          if (nm) nm.classList.toggle('open', willOpen);
          return;
        }
        const navBtn = e.target.closest('[data-nav]');
        if (navBtn) { this.irA(navBtn.dataset.nav); return; }
        // cerrar dropdown si está abierto y se clica fuera
        const openMenu = sr.querySelector('[data-navmenu]');
        if (openMenu && !openMenu.hidden) {
          openMenu.hidden = true;
          const nm = sr.querySelector('.navmobile');
          if (nm) nm.classList.remove('open');
        }
        const head = e.target.closest('[data-head]');
        if (head && this._narrow) {
          const id = head.dataset.head;
          if (this._abiertas.has(id)) this._abiertas.delete(id); else this._abiertas.add(id);
          const sec = sr.getElementById('sec-' + id);
          if (sec) sec.classList.toggle('collapsed', !this._abiertas.has(id));
          return;
        }
        const btn = e.target.closest('[data-act]');
        if (!btn) return;
        this.handleAction(btn.dataset.act, btn.dataset.id, btn);
      });
    }

    // listeners sobre elementos recreados en cada render (no se acumulan)
    this._bindFields(sr);
  }

  _bindFields(scope) {
    scope.querySelectorAll('[data-field]').forEach(el => {
      el.addEventListener('input', () => { if (this._draft) this._draft[el.dataset.field] = el.value; });
      el.addEventListener('change', () => { if (this._draft) this._draft[el.dataset.field] = el.value; });
    });
    const file = scope.querySelector('[data-file="foto"]');
    if (file) file.addEventListener('change', (e) => this.onFoto(e));
    const ta = scope.querySelector('[data-nota]');
    if (ta) {
      const orig = (this._data && this._data.notaCliente && this._data.notaCliente.texto) || '';
      ta.addEventListener('input', () => {
        const sb = ta.closest('.sec-body');
        const save = sb && sb.querySelector('[data-act="guardarNota"]');
        if (save) save.disabled = ta.value === orig;
      });
    }
    // v1.0.7 — bind del datepicker de mover cita.
    // Al cambiar el día, ponemos loading + emitimos 'pedirHuecosMover'.
    // La respuesta llega vía setAttribute('data-huecos-response', ...) en el
    // page code, manejada por attributeChangedCallback.
    // El <select> de horas hardcoded se eliminó en v1.0.7; las horas se
    // pintan como chips (.chip.hora) cuyo click dispara 'moverHoraChip'
    // en handleAction (no necesita listener separado).
    scope.querySelectorAll('[data-act="moverDiaInput"]').forEach(el => {
      el.addEventListener('change', () => {
        const id = el.dataset.id;
        this._onDiaChange(id, el.value);
      });
    });
  }

  handleAction(act, id, btn) {
    const sr = this.shadowRoot;
    switch (act) {
      case 'reintentar': this.emit('reintentarSesion'); this.toast('Reintentando…'); break;
      case 'reservar': this.emit('reservarCita'); this.toast('Te llevamos a reservar…'); break;

      case 'editarPerfil': this._editPerfil = true; this._draft = { ...this._data.cliente }; this.render(); this.irA('personal', false); break;
      case 'cancelarPerfil': this._editPerfil = false; this._draft = null; this.render(); break;
      case 'guardarPerfil': this.guardarPerfil(); break;
      case 'subirFoto': sr.querySelector('[data-file="foto"]').click(); break;

      case 'mover': this.toggleMover(id); break;
      // v1.0.5 — moverDia (datepicker) va por change, ver _bindFields/_rebindSection.
      // v1.0.7 — moverHoraChip va por CLICK (chips), no por change de select.
      case 'moverHoraChip': this.seleccionarHoraChip(id, btn.dataset.hora); break;
      case 'moverConfirm': this.confirmarMover(id); break;
      case 'cancelarConfirm': this.confirmarCancelar(id, btn); break;

      case 'verMasAnteriores': this._anterioresVisibles += 4; this.repaintSection('anteriores'); break;
      case 'repetirServicio': this.emit('repetirServicio', { categoria: btn.dataset.cat, anteriorId: id }); this.toast('Repetimos servicio · te llevamos a reservar'); break;
      case 'repetirCompra': this.emit('repetirCompra', { productoId: id }); this.toast('Añadido al carrito'); break;

      case 'guardarNota': this.guardarNota(); break;
    }
  }

  irA(id, setActive = true) {
    if (setActive) this._activa = id;
    const sr = this.shadowRoot;
    sr.querySelectorAll('[data-nav]').forEach(b => b.classList.toggle('active', b.dataset.nav === id));
    // actualizar y cerrar el dropdown móvil
    const secDef = SECCIONES.find(s => s.id === id);
    const lbl = sr.querySelector('.navselect .ns-label');
    const nsic = sr.querySelector('.navselect .ns-ic');
    if (lbl && secDef) lbl.textContent = labelSeccion(secDef, this._data);
    if (nsic && secDef) nsic.innerHTML = ic(secDef.icon);
    const menu = sr.querySelector('[data-navmenu]');
    if (menu) menu.hidden = true;
    const nm = sr.querySelector('.navmobile');
    if (nm) nm.classList.remove('open');
    if (this._narrow && !this._abiertas.has(id)) {
      this._abiertas.add(id);
      const sec = sr.getElementById('sec-' + id);
      if (sec) sec.classList.remove('collapsed');
    }
    const sec = sr.getElementById('sec-' + id);
    if (sec) this._scrollToEl(sec, 16);
  }

  /* Encuentra el ancestro scrollable (atraviesa el shadow boundary) y desplaza
     ahí. Evita scrollIntoView. Cae a window si no hay contenedor con overflow. */
  _scrollParent() {
    let node = this.parentElement || (this.getRootNode() && this.getRootNode().host);
    while (node && node.nodeType === 1) {
      const oy = getComputedStyle(node).overflowY;
      if ((oy === 'auto' || oy === 'scroll') && node.scrollHeight > node.clientHeight + 4) return node;
      node = node.parentElement || (node.getRootNode() && node.getRootNode().host);
    }
    return null;
  }
  _scrollToEl(el, margin = 16) {
    const cont = this._scrollParent();
    const r = el.getBoundingClientRect();
    if (cont) {
      const cr = cont.getBoundingClientRect();
      cont.scrollTo({ top: cont.scrollTop + (r.top - cr.top) - margin, behavior: 'smooth' });
    } else {
      window.scrollTo({ top: r.top + window.scrollY - margin, behavior: 'smooth' });
    }
    // v1.0.10 — En Wix Studio, window.scrollTo a veces no funciona porque
    // el scroll real está en un wrapper Wix con overflow propio. Emitimos
    // además 'scrollToY' con la coordenada absoluta para que el page code
    // pueda llamar a wixWindow.scrollTo (API oficial Wix que sí encuentra
    // el contenedor de scroll correcto). Si el window.scrollTo de arriba
    // ya funcionó, el wixWindow.scrollTo del page code es idempotente y
    // no causa daño.
    this.emit('scrollToY', { y: Math.max(0, r.top + window.scrollY - margin) });
  }

  _observeSpy() {
    if (this._spy) this._spy.disconnect();
    const sr = this.shadowRoot;
    this._spy = new IntersectionObserver((entries) => {
      if (this._narrow) return;
      entries.forEach(en => {
        if (en.isIntersecting) {
          const id = en.target.dataset.sec;
          this._activa = id;
          sr.querySelectorAll('[data-nav]').forEach(b => b.classList.toggle('active', b.dataset.nav === id));
        }
      });
    }, { root: this._scrollParent(), rootMargin: '-15% 0px -70% 0px', threshold: 0 });
    sr.querySelectorAll('.sec').forEach(s => this._spy.observe(s));
  }

  /* ---- perfil ---- */
  onFoto(e) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    if (this._draft) this._draft.foto = url;
    this._fotoFile = f;
    this.emit('subirFoto', { file: f });
    this.repaintSection('personal');
    this.toast('Foto actualizada');
  }

  guardarPerfil() {
    const dr = this._draft || {};
    const orig = this._data.cliente;
    // READ-MERGE-UPDATE: solo enviamos campos modificados, nunca borramos con vacío
    const cambios = {};
    ['nombre', 'apellido', 'sexo', 'dni', 'email', 'prefijo', 'telefono', 'foto'].forEach(k => {
      if (dr[k] !== undefined && dr[k] !== orig[k]) cambios[k] = dr[k];
    });
    // aplicar merge local para el preview
    Object.assign(this._data.cliente, cambios);
    this.emit('guardarPerfil', { ...cambios });
    this._editPerfil = false; this._draft = null;
    this.render();
    this.toast('Tus datos se han guardado');
  }

  /* ---- citas ---- */
  toggleMover(id) {
    this._moverAbierto = this._moverAbierto === id ? null : id;
    if (this._moverAbierto !== id) delete this._moverSel[id];
    this.repaintSection('proximas');
  }
  repaintCita(id) { this.repaintSection('proximas'); }

  // v1.0.7 — Cambio de día en el datepicker: dispara la petición de huecos
  // al page code. Reset de la hora previa (puede no estar disponible).
  // Pone loading:true para que el bloque de chips muestre el spinner.
  _onDiaChange(id, fecha) {
    if (!fecha) {
      delete this._moverSel[id];
      this.repaintSection('proximas');
      return;
    }
    const reqId = 'req_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    const prev = this._moverSel[id] || {};
    this._moverSel[id] = {
      ...prev,
      fecha,
      hora: '',
      huecos: null,
      huecosOk: false,
      huecosError: null,
      huecosMotivo: null,
      loadingHuecos: true,
      busy: false,
      lastRequestId: reqId
    };
    this.repaintSection('proximas');
    this.emit('pedirHuecosMover', { reservaId: id, fecha, requestId: reqId });
  }

  // v1.0.7 — Click en un chip de hora.
  seleccionarHoraChip(id, hora) {
    const sel = this._moverSel[id];
    if (!sel) return;
    // Defensa: solo aceptar horas que estén en la lista de huecos.
    if (Array.isArray(sel.huecos) && !sel.huecos.includes(hora)) return;
    sel.hora = hora;
    this.repaintSection('proximas');
  }

  // v1.0.7 — Confirmar movimiento. NO aplica cambios localmente de forma
  // optimista (lo hacía v1.0.6 y mentía al cliente cuando el backend
  // luego no podía mover). En su lugar: emite 'moverCita', deja la UI en
  // estado busy mostrando "Moviendo…", y el page code se encarga de
  // recargar el snapshot tras éxito o error. Si fallaba (slot ocupado en
  // los últimos segundos), la cita simplemente sigue en su fecha original
  // y el cliente lo ve sin engaños.
  confirmarMover(id) {
    const sel = this._moverSel[id];
    if (!sel || !sel.fecha || !sel.hora) return;
    sel.busy = true;
    this.repaintSection('proximas');
    this.emit('moverCita', { id, nuevaFecha: sel.fecha, nuevaHora: sel.hora });
    // Limpiar estado local. El page code recarga snapshot tras
    // respuesta; este sel ya no tiene sentido.
    this._moverAbierto = null;
    delete this._moverSel[id];
    this.toast('Moviendo cita…');
  }
  confirmarCancelar(id, btn) {
    if (btn.dataset.confirm !== '1') {
      // v1.0.3 — solo cambio de texto, mantenemos .btn-danger (outline).
      // Sin pasar a sólido.
      btn.dataset.confirm = '1';
      btn.textContent = '¿Seguro? Toca otra vez para cancelar';
      clearTimeout(this._cxTimer);
      this._cxTimer = setTimeout(() => { this.repaintSection('proximas'); }, 4000);
      return;
    }
    this.emit('cancelarCita', { id });
    this._data.proximas = (this._data.proximas || []).filter(c => c.id !== id);
    this.repaintSection('proximas');
    this.toast('Cita cancelada', 'danger');
  }

  /* ---- nota ---- */
  guardarNota() {
    const ta = this.shadowRoot.querySelector('[data-nota]');
    if (!ta) return;
    const texto = ta.value;
    const hoy = new Date().toISOString().slice(0, 10);
    this._data.notaCliente = { texto, editado: hoy };
    this.emit('editarNotaCliente', { texto });
    this.repaintSection('notas');
    this.toast('Nota guardada');
  }

  /* ---- repintado parcial de una sección ---- */
  repaintSection(id) {
    const sr = this.shadowRoot;
    const sec = sr.getElementById('sec-' + id);
    if (!sec) return;
    const body = sec.querySelector('.sec-body');
    body.innerHTML = this['sec_' + id]();
    // re-cabecera personal (botones editar/guardar)
    if (id === 'personal') {
      const head = sec.querySelector('.sec-head');
      const old = head.querySelector('.head-actions');
      if (old) old.remove();
      const chev = head.querySelector('.chev');
      const extra = this.personalHeadActions();
      if (extra) chev.insertAdjacentHTML('beforebegin', extra);
    }
    this._rebindSection(sec, id);
  }

  _rebindSection(sec, id) {
    sec.querySelectorAll('[data-field]').forEach(el => {
      el.addEventListener('input', () => { if (this._draft) this._draft[el.dataset.field] = el.value; });
      el.addEventListener('change', () => { if (this._draft) this._draft[el.dataset.field] = el.value; });
    });
    const file = sec.querySelector('[data-file="foto"]');
    if (file) file.addEventListener('change', (e) => this.onFoto(e));
    const ta = sec.querySelector('[data-nota]');
    if (ta) {
      const orig = (this._data.notaCliente && this._data.notaCliente.texto) || '';
      ta.addEventListener('input', () => {
        const save = sec.querySelector('[data-act="guardarNota"]');
        if (save) save.disabled = ta.value === orig;
      });
    }
    // v1.0.7 — re-bind del datepicker de mover cita tras repaint.
    // Las horas son chips ahora (no select), los chips se manejan en
    // handleAction por delegación a nivel shadowRoot, no necesitan
    // listener individual aquí.
    sec.querySelectorAll('[data-act="moverDiaInput"]').forEach(el => {
      el.addEventListener('change', () => {
        const cid = el.dataset.id;
        this._onDiaChange(cid, el.value);
      });
    });
  }
}

customElements.define('kami-area-cliente', KamiAreaCliente);

// v1.0.3 — NO hay `export` aquí.
// Wix carga los Custom Elements como scripts clásicos (no como módulos ES).
// Un `export { ... }` al final provoca SyntaxError en el navegador y aborta
// el archivo entero, dejando el tag sin registrar.
