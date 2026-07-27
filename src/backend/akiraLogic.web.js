/* ═══════════════════════════════════════════════════════════════════════════
 * KAMISUITE — AKIRA Backend (Wix Velo)
 * Archivo:  backend/akiraLogic.web.js
 * VERSION:  1.4.5
 * FECHA:    19 Julio 2026
 *
 * ───────────────────────────────────────────────────────────────────────────
 * CAMBIOS v1.4.4 → v1.4.5 — FIX: CATEGORIZAR HISTÓRICO POR KEYWORD, NO CATÁLOGO
 * ───────────────────────────────────────────────────────────────────────────
 *
 *   PROBLEMA. "Servicios de color en junio" seguía dando 0 aunque el ledger de
 *   junio tiene 324 cobros. Causa: los nombres del histórico son de la época V1
 *   ("Tinte (AP)", "Corte de caballero", "Mechas Personalizadas (AP)") y NO
 *   coinciden con los label del ServiceCatalog actual. El cruce nombre→catálogo
 *   fallaba en el 100% del histórico.
 *
 *   FIX. Se categoriza por PALABRAS CLAVE (TINTE/MECHA→COLORACION, CORTE→
 *   CORTESMUJER, etc.), replicando reclasificarServicio/clasificarExtra de
 *   estadisticas.web.js v2.5.3 — el dashboard que ya funciona sobre este mismo
 *   ledger histórico. También se adopta su split que respeta comas dentro de
 *   paréntesis y su regex de precio, y se excluye staff='TIENDA_POS' (productos).
 *   Verificado contra el ledger real: junio → 118 servicios de color, 6.598€.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * CAMBIOS v1.4.3 → v1.4.4 — FIX: FORMATO REAL de PaymentReservations.descripcion
 * ───────────────────────────────────────────────────────────────────────────
 *
 *   v1.4.3 cambió bien la FUENTE (cobros), pero inventó el formato del parser
 *   ("Nombre|precio;;"). El formato REAL del ledger es OTRO, documentado en
 *   Guía V2.0 §D.2 y ya resuelto por cierreLogicExtendido:
 *     "Nombre (precio€), Otro (precio€), 🛒 Producto (12€), ✏️ Propina (5€)"
 *   Separado por COMAS, precio entre paréntesis, con prefijos emoji para
 *   productos/propinas/descuentos.
 *
 *   FIX. _parsearDescripcionCobro se reescribe como copia LITERAL de
 *   cierreLogicExtendido.extraerServiciosFacturables (código de producción del
 *   Cierre Financiero): split por coma, regex "Nombre (precio€)", ignora 🛒
 *   (producto), ✏️ (propina), 🏷️ (descuento) y precio 0 (fase embebida). Así
 *   AKIRA cuenta SOLO servicios facturables, no productos ni propinas.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * CAMBIOS v1.4.2 → v1.4.3 — FIX: MODO SERVICIOS DEBE LEER DE PaymentReservations
 * ───────────────────────────────────────────────────────────────────────────
 *
 *   SÍNTOMA. "¿Servicios de color en junio?" → "no hay". Pero en junio se
 *   facturaron 22.000€. El modo servicios (v1.4.2) leía de
 *   KamisuiteReservations, que SOLO tiene datos desde la migración (julio+).
 *   Junio no existe ahí → cero. Diagnóstico equivocado ("junio vacío") por
 *   mirar la colección equivocada.
 *
 *   FIX. consultarServicios ahora lee de PaymentReservations (el ledger),
 *   igual que el modo cobros. Es lo correcto por dos razones:
 *     · Tiene TODO el histórico, también lo anterior a la migración.
 *     · Es lo CONSUMADO: excluye por naturaleza cancelaciones/no-shows.
 *       "Servicios que se hicieron" = lo cobrado, no lo agendado.
 *   Cada cobro guarda su(s) servicio(s) en `descripcion`; se descompone con
 *   _parsearDescripcionCobro (tolera formato serviciosDetail "N|precio;;…" o
 *   nombre suelto) y cada nombre se resuelve a su group vía catálogo. Toda la
 *   agregación/desglose por categoría queda igual que en v1.4.2.
 *
 *   NOTA. El modo `reservas` sigue leyendo KamisuiteReservations (es lo
 *   COMPROMETIDO/agenda, correcto). Solo `servicios` cambió de fuente.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * CAMBIOS v1.4.1 → v1.4.2 — CATEGORÍA (group) COMO EJE, + MODO SERVICIOS
 * ───────────────────────────────────────────────────────────────────────────
 *
 *   CONTEXTO. `family` NO es la categoría comercial: es la naturaleza técnica
 *   del servicio (simple / con fases / con proceso). La categoría real
 *   (COLORACION, CORTESMUJER, CABALLERO, MANICURA_&_PEDICURA, TRATAMIENTOS…)
 *   vive en ServiceCatalog.group, y desde recepcionProLogic v1.0.38 se graba
 *   también en KamisuiteReservations.group (categoría del servicio PRINCIPAL,
 *   que categoriza la reserva). AKIRA no lo usaba: filtraba por family y erraba.
 *
 *   QUÉ CAMBIA:
 *
 *   1) `group` es el EJE DE CATEGORÍA. Nuevo filtro `group` (array) y nuevo
 *      eje de agrupación `group`. family queda como eje técnico secundario.
 *      El filtro normaliza mayúsculas/acentos/_/&/espacios (normalizarGroup):
 *      el CMS guarda 'MANICURA_&_PEDICURA', el modelo puede mandar variantes.
 *
 *   2) `_getGroups()` — distinct de group (reservas + catálogo) al system
 *      prompt como "CATEGORÍAS DISPONIBLES". Cero hardcoding: cada salón las
 *      suyas. El modelo mapea el lenguaje natural del usuario ("color","uñas")
 *      contra esa lista real y DESAMBIGUA cuando un término abarca varias
 *      ("corte" → CORTESMUJER o CABALLERO → pregunta cuál).
 *
 *   3) NUEVO MODO "servicios". Distingue dos preguntas que antes se confundían:
 *        · "¿cuántas RESERVAS de color?" → modo reservas + group (cita entera,
 *          por su principal).
 *        · "¿cuántos SERVICIOS de corte?" → modo servicios: recorre
 *          serviciosDetail de cada reserva y cuenta CADA servicio, incluido el
 *          corte que va de COMPLEMENTO dentro de una reserva de tinte. El
 *          nombre en serviciosDetail es el label EXACTO de ServiceCatalog
 *          (Recepción PRO pinta el calendario de ahí), así que se resuelve a su
 *          group vía mapa label→group cacheado (_getMapaServicioGrupo, TTL 5min).
 *          Extras manuales fuera de catálogo ([EXTRA] …) quedan '(no catalogado)'.
 *
 *   4) Fix de acentos en `family` (v1.4.1) intacto: sigue vigente.
 *
 *   NO SE TOCA nada de sesiones, historial, acceso, cobros ni conversión.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * CAMBIOS v1.4.0 → v1.4.1 — FIX: FILTRO family FALLABA POR LA TILDE
 * ───────────────────────────────────────────────────────────────────────────
 *
 *   SÍNTOMA (visto en el log de producción, 19-Jul):
 *     "¿Cuánto facturamos en coloración el mes pasado?" → "No hay cobros bajo
 *     la familia coloración." Y AKIRA remataba INVENTANDO una explicación
 *     falsa: "en Hair-Times el color no se categoriza bajo esa familia". Con
 *     146 reservas family='coloracion' en el CMS, eso es una alucinación de
 *     las peligrosas: cifra/conclusión errónea dicha con aplomo.
 *
 *   CAUSA RAÍZ:
 *     aplicarFiltros comparaba con .toLowerCase() PERO NO quitaba acentos.
 *     El usuario pregunta por "coloración" (con tilde). Sonnet, a veces, copia
 *     ese término tal cual al filtro en vez del canónico. El CMS guarda
 *     "coloracion" (SIN tilde). "coloración".toLowerCase() === "coloración"
 *     ≠ "coloracion" → cero match → cero registros → alucinación.
 *
 *   FIX (una sola función tocada: aplicarFiltros):
 *     El filtro `family` normaliza acentos con normalize('NFD') —el mismo
 *     patrón que consultarConfig YA usa en la búsqueda del CRM, no se inventa
 *     nada—. Ahora "coloración", "Coloración" y "coloracion" resuelven todos
 *     al mismo valor del CMS. El blindaje va en JS, no en el prompt: da igual
 *     el literal exacto que escriba el modelo ("IA entiende → JS ejecuta").
 *
 *   NO SE TOCA NADA MÁS. El resto del motor, herramientas, sesiones,
 *   historial, acceso y prompt quedan idénticos a v1.4.0.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * CAMBIOS v1.3.0 → v1.4.0 — FIX: EL HISTORIAL NO SE MOSTRABA
 * ───────────────────────────────────────────────────────────────────────────
 *
 *   La sidebar salía vacía al abrir. Causa: akiraListarChats filtraba por
 *   `messageCount > 0`, un contador que yo añadí "para optimizar" y evitar la
 *   query por chat que hace CATHOVIA. Pero ese contador lo escribe
 *   _guardarMensajes DESPUÉS, con un update cuyo fallo se traga un catch. Si
 *   no se escribe, se queda en 0 y NINGUNA sesión pasa el filtro.
 *
 *   FIX: clon literal de cathoviaListarChats. Se cuentan los mensajes REALES
 *   de AkiraMessages. Una query más por chat, pero es la verdad y no depende
 *   de un contador que puede desincronizarse.
 *
 *   También: los webMethods de chats pasan a Permissions.Anyone, como en
 *   CATHOVIA. SiteMember ya rompió el TTS por la misma razón.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * CAMBIOS v1.2.0 → v1.3.0 — FIX: CIFRAS INCOMPLETAS EN PERIODOS LARGOS
 * ───────────────────────────────────────────────────────────────────────────
 *
 *   QUERY_LIMIT era 1000. Hair-Times hace ~308 cobros/mes → ~3.700/año. Una
 *   pregunta como "cuánto facturamos este año" se cortaba en 1000 filas y
 *   devolvía un total MAL, sin avisar. Un consultor que da una cifra errónea
 *   con aplomo es peor que uno que no responde.
 *
 *   FIX: techo a 6000 + findAll marca `_truncado` + campo AVISO al modelo.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * CAMBIOS v1.1.0 → v1.2.0 — CRM (Wix Contacts)
 * ───────────────────────────────────────────────────────────────────────────
 *
 *   AKIRA no podía responder "dame el teléfono de Jesús Aldana": solo veía el
 *   clientName grabado en cada reserva, no la ficha del CRM. V1 sí lo hacía.
 *
 *   NUEVO: fuente `clientes`, servida por Wix Contacts a través de
 *   cargarTodosContactos() de recepcionLogic.web.js — el backend de producción
 *   que ya resuelve esa API. NO se reimplementa nada.
 *
 *   El registro gana dos capacidades, ambas declarativas:
 *     · `loader`  — fuentes que son API nativa de Wix, no colección CMS.
 *                   Mañana, Stores o Loyalty = declarar su loader. Nada más.
 *     · `requiereBusqueda` — el CRM tiene cientos de contactos: volcarlo entero
 *                   reventaría el contexto. Sin `busqueda`, el motor rechaza.
 *
 *   La búsqueda normaliza teléfonos: en CRM están como "+34 617 37 89 84" y se
 *   teclean como "617378984". Se comparan solo los dígitos.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * CAMBIOS v1.0.0 → v1.1.0 — SEGUNDA HERRAMIENTA: CONFIGURACIÓN
 * ───────────────────────────────────────────────────────────────────────────
 *
 *   v1.0.0 solo leía datos transaccionales (Reservations/Payments). AKIRA
 *   podía decir "facturaste 4.200€ en tinte" pero NO sabía a qué precio está
 *   el tinte en el catálogo. Sin eso no hay consultoría: no puede detectar
 *   que se cobra por debajo de tarifa, ni que un profesional tiene más horas
 *   ocupadas que contratadas.
 *
 *   NUEVO: consultar_configuracion_salon, con REGISTRO DECLARATIVO
 *   (FUENTES_CONFIG). Añadir una colección mañana = añadir una entrada al
 *   objeto. Cero código nuevo. El input_schema se genera desde el registro.
 *
 *   Arranca con 5 fuentes: servicios · personal · salon · productos · externos.
 *   El resto de las 53 colecciones quedan diferidas: abrirlas todas de golpe
 *   degrada las respuestas y quema tokens.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * QUÉ ES ESTE ARCHIVO
 * ───────────────────────────────────────────────────────────────────────────
 *
 * Cerebro de AKIRA V2, modo CONSULTOR. Sustituye conceptualmente a
 * consoleIA.web.js v3.5.8 (V1, basado en Wix Bookings) — NO lo modifica.
 * V1 sigue vivo hasta que Jal decida apagarlo.
 *
 * Arquitectura portada de EGAEL 3.0 (proyecto CATHOVIA, cathoviaBackend
 * v1.6.0), adaptada a KAMISUITE V2:
 *   · Bloques STABLE/VOLATILE con prompt caching de Anthropic (5 min).
 *   · Cascade failover Sonnet 4.6 → Haiku 4.5.
 *   · Lecturas de CMS en paralelo (Promise.all).
 *   · Sesión creada en paralelo con la llamada a Anthropic.
 *   · Log honesto: prepMs (Wix Data) + apiMs (Anthropic) + totalMs.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * DIFERENCIA CLAVE CON V1 — POR QUÉ ESTE ARCHIVO ES TAN CORTO
 * ───────────────────────────────────────────────────────────────────────────
 *
 * V1 (consoleIA v3.5.8) necesitaba:
 *   · classify con prompt de ~6.500 chars lleno de reglas de Wix Bookings.
 *   · AkiraCapabilities como índice de un router de 11 categorías cerradas.
 *   · Parsear `descripcion` (texto libre) para saber qué servicio se hizo
 *     → de ahí el parche de facturación por tipo de v3.3.6.
 *   · queryExtendedBookings paginado, resolución de nombres genéricos,
 *     agrupación por GAP_MS, lectura de sessions Blocked...
 *
 * V2 no necesita NADA de eso. KamisuiteReservations tiene `family` como
 * CAMPO ESTRUCTURADO. La pregunta "ticket medio de tinte los lunes y
 * martes de mayo" es un filtro, no un parche.
 *
 * Por eso AKIRA V2 NO tiene classify ni categorías cerradas. Tiene un
 * MOTOR DE CONSULTA con filtros ortogonales + tool use nativo de Anthropic.
 * Sonnet elige filtros; JavaScript ejecuta y calcula. Las combinaciones son
 * ilimitadas porque los ejes son independientes.
 *
 * AkiraCapabilities queda OBSOLETA. Este backend no la lee.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * LOS TRES MODOS DE LECTURA (decisión de Jal, 17-Jul-2026)
 * ───────────────────────────────────────────────────────────────────────────
 *
 *   1. reservas  → KamisuiteReservations. La PRODUCTIVIDAD A FUTURO: lo
 *                  comprometido. Agenda, ocupación, carga, previsión.
 *                  Una reserva existe antes de ser dinero y puede no
 *                  llegar a serlo nunca.
 *
 *   2. cobros    → PaymentReservations. El RESULTADO OPERATIVO: lo
 *                  consumado. Solo entra lo que se cobró.
 *
 *   3. conversion→ Cruce por bookingId = KRI_<reservaId>. EL DELTA: lo que
 *                  se reservó y no se cobró. Tasa de conversión, no-shows,
 *                  fugas de caja. Ninguna colección sola responde esto.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * CONCEPTOS FUNDACIONALES RESPETADOS
 * ───────────────────────────────────────────────────────────────────────────
 *
 *   · "IA entiende → JS ejecuta": Sonnet extrae parámetros. TODAS las
 *     cifras, fechas y agregaciones las calcula JavaScript. Sonnet NUNCA
 *     calcula una fecha ni una suma. Recibe el dato hecho y lo narra.
 *   · Fechas con toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' }).
 *   · Multi-tenant sin hardcoding: cada cuenta Wix ES un salón. NO hay
 *     cursoRef/salonId en ninguna query. SalonConfig (fila única) es el
 *     contexto. Cero nombres de staff, servicios o IDs hardcodeados.
 *   · Permissions.SiteMember (NUNCA Admin: bloquea llamadas desde páginas).
 *     Acceso CMS vía suppressAuth.
 *   · PROCESO es tiempo libre del estilista: fases con ocupa:false NO
 *     ocupan agenda. Se respeta al calcular ocupación.
 *   · fases y sessionIds son OBJECT envueltos {items:[...]} → helper jsonIn,
 *     patrón literal de recepcionProLogic.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * COLECCIONES (field IDs verificados en producción, 17-Jul-2026)
 * ───────────────────────────────────────────────────────────────────────────
 *
 *   KamisuiteReservations: fechaReserva DATETIME, family TEXT, status TEXT,
 *     precioTotal NUMBER, duracionTotal NUMBER, staffId/staffName TEXT,
 *     clientName/clientPhone/clientEmail TEXT, contactId TEXT,
 *     origenRecepcion BOOLEAN, fases OBJECT, sessionIds OBJECT,
 *     serviciosDetail TEXT, extensionMin NUMBER, wixAnclaId TEXT
 *
 *   PaymentReservations: bookingId TEXT (KRI_<id>), fechaPago DATETIME,
 *     fechaReserva DATETIME, importeTotal NUMBER, tipoPago TEXT,
 *     desglosemetodopago TEXT, staff TEXT, descripcion TEXT,
 *     nombreCliente TEXT, contactId TEXT, invoiceId TEXT
 *
 *   AkiraAlignment:  promptBase, tone, detailLevel, grOnlyQuery,
 *     grNoInvent, grNoMarkdown, grConcision, extraInstructions, version,
 *     status, publicationDate
 *   AkiraDocuments:  titulo, tipo, contenido, resumen, activo, orden
 *   AkiraSessions:   title, estado, fechaCreacion, fechaActualizacion,
 *                    messageCount   ── FALTA usuarioId (ver AVISO abajo)
 *   AkiraMessages:   sessionRef, rol, contenido, orden, timestamp
 *   SalonConfig:     brandName, widgetSkin, vatRate, logoUrl, ...
 *   StaffConfig:     canonicalName, displayName, accessLevel, active
 *
 * ⚠️ AVISO — AkiraSessions.usuarioId NO EXISTE en el CMS actual.
 *   Sin ese campo NO hay historial por persona: todos los usuarios del
 *   salón verían las conversaciones de todos. El código está escrito para
 *   usarlo (USER_FIELD) y degrada de forma segura si no existe, pero
 *   Jal debe crear el campo (Texto) para que el filtrado sea real.
 *   Mientras no exista, listarChats devuelve las sesiones del salón.
 *
 * Secret: KAMISUITE (API key de Anthropic — el mismo que usa V1)
 * Logs:   Wix Dashboard → Developer Tools → Site Monitoring
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { webMethod, Permissions } from 'wix-web-module';
import { fetch } from 'wix-fetch';
import wixData from 'wix-data';
import { getSecret } from 'wix-secrets-backend';
// Wix Contacts (CRM nativo). Reutilizamos el backend de producción que ya lo
// resuelve — NO se reimplementa la API de contactos. recepcionLogic.web.js es
// "backend que NO se toca en V2" (Checklist V1↔V2 §244): reutilizable al 100%.
import { cargarTodosContactos } from 'backend/recepcionLogic.web';

const VERSION = '1.4.5';
const TAG = `[AkiraLogic][${VERSION}]`;
const AUTH = { suppressAuth: true };

// ── Modelos y timeouts (patrón CATHOVIA v1.6.0) ──
const MODEL_PRIMARY   = 'claude-sonnet-4-6';
const MODEL_FALLBACK  = 'claude-haiku-4-5';
const PRIMARY_TIMEOUT_MS  = 45000;
const FALLBACK_TIMEOUT_MS = 25000;

// ── Generación ──
const MAX_TOKENS    = 1200;
const HISTORY_LIMIT = 10;
const MAX_DOC_CHARS = 12000;

// ── Colecciones ──
const C_RESERVAS  = 'KamisuiteReservations';
const C_COBROS    = 'PaymentReservations';
const C_ALIGNMENT = 'AkiraAlignment';
const C_DOCUMENTS = 'AkiraDocuments';
const C_SESSIONS  = 'AkiraSessions';
const C_MESSAGES  = 'AkiraMessages';
const C_LOG       = 'AkiraLog';
const C_SALON     = 'SalonConfig';
const C_STAFF     = 'StaffConfig';
const C_CATALOGO  = 'ServiceCatalog';   // v1.4.2 — mapa label→group para conteo por servicio

// ── Constantes de dominio (verificadas en producción) ──
const PREFIJO_PAGO     = 'KRI_';       // PaymentReservations.bookingId = KRI_<reservaId>
const STATUS_CANCELADA = 'CANCELADA';  // filtro canónico: .ne('status','CANCELADA')
const FAMILY_BLOQUEO   = 'BLOQUEO';    // no es actividad comercial
// Techo de filas por consulta. Hair-Times hace ~308 cobros/mes → ~3.700/año.
// Con 1000 (v1.0.0) una pregunta anual se cortaba y devolvía cifras MAL sin
// avisar: el error más peligroso que puede cometer un consultor.
// 6000 cubre un año holgado. findAll marca `truncado` si aun así se llena.
const QUERY_LIMIT      = 6000;

// Nivel de acceso mínimo para AKIRA Consultor (StaffConfig.accessLevel).
// 1 = Administrador, 2 = Encargado. Briefing Consultor §2.
const CONSULTOR_MIN_LEVEL = 2;

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS — FECHAS (todo en JS, jamás en el LLM)
// ═══════════════════════════════════════════════════════════════════════════

function hoyMadrid() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });
}

function fechaISOenMadrid(dateLike) {
  if (!dateLike) return '';
  try {
    return new Date(dateLike).toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });
  } catch (_) { return ''; }
}

/** Día de la semana en Madrid. 0=domingo … 6=sábado (igual que Date.getDay). */
function dowMadrid(dateLike) {
  const iso = fechaISOenMadrid(dateLike);
  if (!iso) return -1;
  return new Date(iso + 'T12:00:00Z').getUTCDay();
}

function sumarDias(fechaISO, n) {
  const d = new Date(fechaISO + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().split('T')[0];
}

/**
 * Contexto temporal completo, precalculado en JS y entregado a Sonnet como
 * TABLA DE CONSULTA. Sonnet COPIA de aquí; no calcula nunca una fecha.
 * Regla de Conceptos Fundacionales §20.
 */
function resolverFechas() {
  const hoyISO = hoyMadrid();
  const dow = new Date(hoyISO + 'T12:00:00Z').getUTCDay();
  const dias = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
  const diffLun = dow === 0 ? -6 : 1 - dow;

  const y = parseInt(hoyISO.substring(0, 4), 10);
  const m = parseInt(hoyISO.substring(5, 7), 10);
  const ultimoDiaMes = new Date(y, m, 0).getDate();
  const mesAntY = m === 1 ? y - 1 : y;
  const mesAntM = m === 1 ? 12 : m - 1;
  const ultimoDiaMesAnt = new Date(mesAntY, mesAntM, 0).getDate();
  const p2 = (n) => String(n).padStart(2, '0');

  return {
    hoyISO,
    hoyNombre: dias[dow],
    ayer:   sumarDias(hoyISO, -1),
    manana: sumarDias(hoyISO, 1),
    estaSemanaDesde: sumarDias(hoyISO, diffLun),
    estaSemanaHasta: sumarDias(hoyISO, diffLun + 6),
    semanaPasadaDesde: sumarDias(hoyISO, diffLun - 7),
    semanaPasadaHasta: sumarDias(hoyISO, diffLun - 1),
    esteMesDesde: `${y}-${p2(m)}-01`,
    esteMesHasta: `${y}-${p2(m)}-${p2(ultimoDiaMes)}`,
    mesPasadoDesde: `${mesAntY}-${p2(mesAntM)}-01`,
    mesPasadoHasta: `${mesAntY}-${p2(mesAntM)}-${p2(ultimoDiaMesAnt)}`,
    esteAnioDesde: `${y}-01-01`,
    esteAnioHasta: `${y}-12-31`,
    anioPasadoDesde: `${y - 1}-01-01`,
    anioPasadoHasta: `${y - 1}-12-31`
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS — CMS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Lectura de campos OBJECT envueltos: { items: [...] } / { ids: [...] }.
 * Patrón LITERAL de recepcionProLogic.web.js. No reinventar.
 */
function jsonIn(v, unwrapKey) {
  if (v == null || v === '') return [];
  if (typeof v === 'string') {
    try { v = JSON.parse(v); } catch (e) { return []; }
  }
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    if (unwrapKey && Array.isArray(v[unwrapKey])) return v[unwrapKey];
    if (Array.isArray(v.items)) return v.items;
    if (Array.isArray(v.ids))   return v.ids;
    return [];
  }
  if (Array.isArray(v)) return v;
  return [];
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * Normaliza texto para comparaciones robustas: minúsculas SIN acentos.
 * Mismo patrón normalize('NFD') que consultarConfig ya usa en la búsqueda del
 * CRM. Se extrae a helper para reutilizarlo en el filtro `family`: el usuario
 * escribe "coloración" (con tilde) y el CMS guarda "coloracion" (sin tilde);
 * sin quitar acentos, .toLowerCase() por sí solo NO hace match.
 */
function normalizarTexto(s) {
  return String(s || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

/**
 * Normaliza un valor de CATEGORÍA (group) para comparación robusta.
 * Los groups del CMS vienen en MAYÚSCULAS y con formatos dispares:
 * 'COLORACION', 'MANICURA_&_PEDICURA', 'COMPLEMENTOS DE FASES',
 * 'PEINADOS_&_RECOGIDOS'. El usuario jamás escribe eso literal: dice
 * "manicura", "color", "peinados". Este helper reduce ambos lados a un
 * token comparable — quita acentos y colapsa TODO lo no alfanumérico
 * (guiones bajos, &, espacios, guiones) para que "manicura_&_pedicura",
 * "manicura y pedicura" y "MANICURA & PEDICURA" resuelvan igual.
 * El mapeo semántico (usuario dice "uñas" → MANICURA) lo hace el MODELO
 * contra la lista real de groups del prompt; esto es solo el match final.
 */
function normalizarGroup(s) {
  return String(s || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

/**
 * Pagina una query hasta `techo` filas. Wix devuelve máx. 100 por página.
 *
 * Marca items._truncado = true si se alcanza el techo con más datos pendientes.
 * CRÍTICO: sin esta marca, una consulta que desborda devuelve cifras
 * silenciosamente incompletas — y un consultor que da un total erróneo sin
 * avisar es peor que uno que no responde.
 */
async function findAll(query, limite) {
  const techo = limite || QUERY_LIMIT;
  let items = [], skip = 0, truncado = false;
  while (skip < techo) {
    const res = await query.skip(skip).limit(100).find(AUTH);
    const page = res.items || [];
    items = items.concat(page);
    if (page.length < 100) break;
    skip += 100;
    if (skip >= techo) truncado = true;
  }
  if (truncado) {
    console.warn(`${TAG} ⚠️ findAll TRUNCADO en ${techo} filas — cifras incompletas`);
    items._truncado = true;
  }
  return items;
}

// ═══════════════════════════════════════════════════════════════════════════
// MOTOR DE CONSULTA — TRES MODOS, FILTROS ORTOGONALES
// ═══════════════════════════════════════════════════════════════════════════
//
// El corazón de AKIRA Consultor. Los ejes son INDEPENDIENTES entre sí, por
// eso las combinaciones son ilimitadas sin escribir funciones nuevas:
//
//   desde/hasta · family · staffId · diasSemana · origen · status
//   × agruparPor × modo(reservas|cobros|conversion)
//
// "Ticket medio de tinte los lunes y martes de mayo" =
//   { modo:'reservas', desde:'2026-05-01', hasta:'2026-05-31',
//     family:'coloracion', diasSemana:[1,2], agruparPor:'ninguno' }
// → JS filtra, agrega y divide. Sonnet solo narra el resultado.
// ═══════════════════════════════════════════════════════════════════════════

/** Normaliza una fila de KamisuiteReservations a la forma que usa el motor. */
function normalizarReserva(r) {
  const fecha = fechaISOenMadrid(r.fechaReserva);
  const fasesArr = jsonIn(r.fases, 'items');
  // PROCESO = fases con ocupa:false. NO ocupan al estilista (Conceptos
  // Fundacionales §1). Se separan para poder medir ocupación real.
  let minOcupa = 0, minProceso = 0;
  for (const f of fasesArr) {
    const dur = Number(f && f.durationMin != null ? f.durationMin : (f && f.duracion) || 0) || 0;
    if (f && f.ocupa === false) minProceso += dur;
    else minOcupa += dur;
  }
  return {
    id: r._id,
    fecha,
    dow: dowMadrid(r.fechaReserva),
    family: r.family || '',
    group: r.group || '',
    status: r.status || '',
    precio: Number(r.precioTotal) || 0,
    duracion: Number(r.duracionTotal) || 0,
    minOcupa,
    minProceso,
    staffId: r.staffId || '',
    staffName: r.staffName || '',
    cliente: r.clientName || '',
    contactId: r.contactId || '',
    telefono: r.clientPhone || '',
    origenRecepcion: r.origenRecepcion === true,
    servicios: r.serviciosDetail || '',
    titulo: r.title || ''
  };
}

/** Normaliza una fila de PaymentReservations. */
function normalizarCobro(p) {
  const bid = p.bookingId || '';
  return {
    id: p._id,
    bookingId: bid,
    reservaId: bid.indexOf(PREFIJO_PAGO) === 0 ? bid.substring(PREFIJO_PAGO.length) : '',
    fechaPago: fechaISOenMadrid(p.fechaPago),
    dowPago: dowMadrid(p.fechaPago),
    fechaReserva: fechaISOenMadrid(p.fechaReserva),
    importe: Number(p.importeTotal) || 0,
    tipoPago: p.tipoPago || '',
    desglose: p.desglosemetodopago || '',
    staff: p.staff || '',
    descripcion: p.descripcion || '',
    cliente: p.nombreCliente || '',
    contactId: p.contactId || '',
    invoiceId: p.invoiceId || ''
  };
}

/** Aplica los filtros ortogonales en memoria (los de rango ya van en la query). */
function aplicarFiltros(filas, f, campoDow) {
  let out = filas;
  if (f.family) {
    // Comparación SIN acentos: el usuario dice "coloración" (con tilde) y el
    // CMS guarda "coloracion" (sin tilde). .toLowerCase() a secas NO casa;
    // normalizarTexto() quita también los acentos. (Fix v1.4.1.)
    const fams = (Array.isArray(f.family) ? f.family : [f.family]).map(normalizarTexto);
    out = out.filter(r => fams.indexOf(normalizarTexto(r.family)) !== -1);
  }
  if (f.group) {
    // Categoría operativa. El CMS guarda 'COLORACION', 'MANICURA_&_PEDICURA'…
    // normalizarGroup colapsa mayúsculas/acentos/_/&/espacios en ambos lados
    // para que el canónico que envía el modelo case aunque no sea idéntico
    // carácter a carácter. (v1.4.2 — group es el eje de categoría.)
    const grps = (Array.isArray(f.group) ? f.group : [f.group]).map(normalizarGroup);
    out = out.filter(r => grps.indexOf(normalizarGroup(r.group)) !== -1);
  }
  if (f.staffId) {
    const ids = Array.isArray(f.staffId) ? f.staffId : [f.staffId];
    out = out.filter(r => ids.indexOf(r.staffId) !== -1);
  }
  if (f.staffName) {
    const n = String(f.staffName).toLowerCase();
    out = out.filter(r => String(r.staffName || r.staff || '').toLowerCase().indexOf(n) !== -1);
  }
  if (Array.isArray(f.diasSemana) && f.diasSemana.length > 0) {
    const ds = f.diasSemana.map(Number);
    out = out.filter(r => ds.indexOf(r[campoDow]) !== -1);
  }
  if (f.origen === 'web')      out = out.filter(r => r.origenRecepcion === false);
  if (f.origen === 'recepcion') out = out.filter(r => r.origenRecepcion === true);
  if (f.tipoPago) {
    const t = String(f.tipoPago).toLowerCase();
    out = out.filter(r => String(r.tipoPago || '').toLowerCase().indexOf(t) !== -1);
  }
  if (f.contactId) out = out.filter(r => r.contactId === f.contactId);
  if (f.cliente) {
    const c = String(f.cliente).toLowerCase();
    out = out.filter(r => String(r.cliente || '').toLowerCase().indexOf(c) !== -1);
  }
  return out;
}

/** Clave de agrupación. Añadir un caso aquí = nuevo eje para TODAS las métricas. */
function claveGrupo(r, agruparPor) {
  const dias = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
  switch (agruparPor) {
    case 'staff':      return r.staffName || r.staff || '(sin asignar)';
    case 'family':     return r.family || '(sin familia)';
    case 'group':      return r.group || '(sin categoría)';
    case 'dia':        return r.fecha || r.fechaPago || '(sin fecha)';
    case 'diaSemana':  return dias[r.dow != null ? r.dow : r.dowPago] || '(?)';
    case 'mes':        return (r.fecha || r.fechaPago || '').substring(0, 7) || '(?)';
    case 'tipoPago':   return r.tipoPago || '(sin método)';
    case 'cliente':    return r.cliente || '(sin nombre)';
    case 'origen':     return r.origenRecepcion ? 'recepción' : 'web';
    case 'status':     return r.status || '(sin estado)';
    default:           return null;
  }
}

/** Agrega un conjunto de filas: total, media, count y desglose por grupo. */
function agregar(filas, campoImporte, agruparPor) {
  const total = filas.reduce((s, r) => s + (Number(r[campoImporte]) || 0), 0);
  const count = filas.length;
  const base = {
    numRegistros: count,
    importeTotal: round2(total),
    ticketMedio: count > 0 ? round2(total / count) : 0
  };
  if (!agruparPor || agruparPor === 'ninguno') return base;

  const mapa = {};
  for (const r of filas) {
    const k = claveGrupo(r, agruparPor);
    if (k === null) continue;
    if (!mapa[k]) mapa[k] = { grupo: k, numRegistros: 0, importeTotal: 0 };
    mapa[k].numRegistros++;
    mapa[k].importeTotal += Number(r[campoImporte]) || 0;
  }
  base.desglose = Object.values(mapa)
    .map(g => ({
      grupo: g.grupo,
      numRegistros: g.numRegistros,
      importeTotal: round2(g.importeTotal),
      ticketMedio: g.numRegistros > 0 ? round2(g.importeTotal / g.numRegistros) : 0
    }))
    .sort((a, b) => b.importeTotal - a.importeTotal);
  return base;
}

// ── MODO 1: RESERVAS (productividad a futuro / lo comprometido) ────────────
async function consultarReservas(f) {
  let q = wixData.query(C_RESERVAS);
  if (f.desde) q = q.ge('fechaReserva', new Date(`${f.desde}T00:00:00.000Z`));
  if (f.hasta) q = q.le('fechaReserva', new Date(`${f.hasta}T23:59:59.999Z`));
  q = q.ascending('fechaReserva');

  const raw = await findAll(q, f.limite);
  let filas = raw.map(normalizarReserva);

  // Recorte exacto por día de Madrid (la query va en UTC y puede desbordar).
  if (f.desde) filas = filas.filter(r => r.fecha >= f.desde);
  if (f.hasta) filas = filas.filter(r => r.fecha <= f.hasta);

  // Canceladas fuera salvo petición explícita (patrón de producción).
  if (!f.incluirCanceladas) filas = filas.filter(r => r.status !== STATUS_CANCELADA);
  // BLOQUEO no es actividad comercial: fuera salvo que se pida.
  if (!f.incluirBloqueos) filas = filas.filter(r => r.family !== FAMILY_BLOQUEO);
  if (f.status) filas = filas.filter(r => r.status === f.status);

  filas = aplicarFiltros(filas, f, 'dow');

  const res = agregar(filas, 'precio', f.agruparPor);
  if (raw._truncado) {
    res.AVISO = 'Los datos están INCOMPLETOS: el periodo tiene más registros de los que se pueden leer de una vez. Advierte al usuario de que las cifras son parciales y sugiérele acotar el periodo.';
  }
  res.minutosOcupados = filas.reduce((s, r) => s + r.minOcupa, 0);
  res.minutosProceso  = filas.reduce((s, r) => s + r.minProceso, 0);
  res.clientesUnicos  = new Set(filas.map(r => r.contactId || r.cliente).filter(Boolean)).size;
  res.muestra = filas.slice(0, 40).map(r => ({
    fecha: r.fecha, family: r.family, staff: r.staffName, cliente: r.cliente,
    precio: r.precio, duracion: r.duracion, status: r.status,
    origen: r.origenRecepcion ? 'recepción' : 'web', servicios: r.servicios
  }));
  return res;
}

// ── MAPA label → group (catálogo) para el modo SERVICIOS ───────────────────
//
// serviciosDetail guarda "Nombre|precio;;Nombre|precio|cantidad;;…". El nombre
// es EXACTAMENTE el label de ServiceCatalog (la reserva no reinventa nombres:
// Recepción PRO pinta el calendario desde ese mismo dato). Para categorizar
// cada servicio individual —incluidos los complementos dentro de una reserva—
// se resuelve su nombre contra este mapa y se lee el group del catálogo.
//
// Se cachea a nivel de módulo con TTL corto: el catálogo cambia rara vez y
// una consulta de servicios puede recorrer miles de líneas. Sin caché sería
// una query por consulta; con caché, una cada pocos minutos.
let _mapaSrvGrupo = null;
let _mapaSrvGrupoTs = 0;
const _MAPA_TTL_MS = 5 * 60 * 1000;

async function _getMapaServicioGrupo() {
  const ahora = Date.now();
  if (_mapaSrvGrupo && (ahora - _mapaSrvGrupoTs) < _MAPA_TTL_MS) return _mapaSrvGrupo;
  const mapa = {};
  try {
    const q = wixData.query(C_CATALOGO).isNotEmpty('label').limit(1000);
    const raw = await findAll(q, 1000);
    for (const it of raw) {
      const lab = normalizarTexto(it.label);
      if (lab) mapa[lab] = it.group || '';
    }
  } catch (e) {
    console.warn(`${TAG} _getMapaServicioGrupo fallo:`, e.message);
  }
  _mapaSrvGrupo = mapa;
  _mapaSrvGrupoTs = ahora;
  return mapa;
}

/**
 * Descompone serviciosDetail en líneas de servicio individuales.
 * "Tinte Raiz|40;;Corte Mujer (Complemento)|23;;Secado|6"
 *   → [{nombre:'Tinte Raiz', precio:40, cantidad:1, principal:true},
 *      {nombre:'Corte Mujer (Complemento)', precio:23, cantidad:1, principal:false},
 *      {nombre:'Secado', precio:6, cantidad:1, principal:false}]
 * El PRIMER elemento es el principal; el resto complementos/extras.
 */
function _parsearServiciosDetail(detail) {
  const out = [];
  if (!detail) return out;
  const tramos = String(detail).split(';;');
  for (let i = 0; i < tramos.length; i++) {
    const t = tramos[i].trim();
    if (!t) continue;
    const partes = t.split('|');
    const nombre = (partes[0] || '').trim();
    if (!nombre) continue;
    const precio = Number(partes[1]) || 0;
    const cantidad = partes.length >= 3 ? (Number(partes[2]) || 1) : 1;
    out.push({ nombre, precio, cantidad, principal: i === 0 });
  }
  return out;
}

/**
 * Descompone la `descripcion` de un cobro (PaymentReservations) en los
 * SERVICIOS facturables. Copia LITERAL del split y parseo de estadisticas.web.js
 * v2.5.3 (código de producción del dashboard, que lleva sobre este mismo ledger
 * meses funcionando). Ignora productos (🛒) y extras/propinas (✏️).
 *
 * ⚠️ El split respeta las comas DENTRO de paréntesis:
 *   /,\s*(?=[^)]*(?:\(|$))/  — no parte "Corte (lavado y secado) (35€)".
 * El precio se lee con la regex de estadisticas: \(([\d.]+)€\)\s*$
 */
function _parsearDescripcionCobro(descripcion) {
  const out = [];
  if (!descripcion) return out;
  const items = String(descripcion).split(/,\s*(?=[^)]*(?:\(|$))/);
  for (const raw of items) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('🛒')) continue;   // producto, no servicio
    if (trimmed.startsWith('✏️')) continue;   // propina / extra manual
    const precioMatch = trimmed.match(/\(([\d.]+)€\)\s*$/);
    const precio = precioMatch ? parseFloat(precioMatch[1]) : 0;
    if (precio <= 0) continue;                 // fase embebida a 0€ (Lavado, Secado)
    let nombre = trimmed;
    if (precioMatch) {
      nombre = trimmed.substring(0, trimmed.lastIndexOf('(' + precioMatch[1])).trim();
    }
    nombre = nombre.replace(/,\s*$/, '').trim();
    if (!nombre) continue;
    out.push({ nombre, precio, cantidad: 1, principal: out.length === 0 });
  }
  return out;
}

/**
 * Categoriza un nombre de servicio del ledger por PALABRAS CLAVE, no por cruce
 * con ServiceCatalog. Motivo (lección 19-Jul): los nombres del histórico son de
 * la época V1 ("Tinte (AP)", "Corte de caballero", "Mechas Personalizadas (AP)")
 * y NO coinciden con los label del catálogo actual. estadisticas.web.js ya
 * categoriza así (reclasificarServicio/clasificarExtra). Se replica su mapa de
 * keywords, devolviendo el group canónico de KAMISUITE.
 *
 * Devuelve '' si no reconoce el servicio (queda '(no catalogado)').
 */
function _categorizarPorKeyword(nombre) {
  const n = String(nombre || '')
    .replace(/\s*\(.*?\)\s*/g, ' ')   // quitar "(AP)", "(Complemento)", "(35€)"
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .trim().toUpperCase();
  if (!n) return '';
  // Orden importa: lo más específico primero.
  if (n.includes('TINTE') || n.includes('MECHA') || n.includes('COLOR') || n.includes('MATIZ') || n.includes('BALAYAGE') || n.includes('ILUMINACION')) return 'COLORACION';
  if (n.includes('TRATAMIENTO') || n.includes('BOTOX') || n.includes('KERASTASE') || n.includes('NANOPLASTIA') || n.includes('FUSIO') || n.includes('AMPOLLA') || n.includes('RECONSTRUCCION')) return 'TRATAMIENTOS';
  if (n.includes('BARBA') || (n.includes('CABALLERO')) || n.includes('HOMBRE')) return 'CABALLERO';
  if (n.includes('NIÑO') || n.includes('NINO') || n.includes('NIÑA') || n.includes('NINA')) return 'CABALLERO';
  if (n.includes('MANICURA') || n.includes('PEDICURA') || n.includes('UÑAS') || n.includes('UNAS')) return 'MANICURA_&_PEDICURA';
  if (n.includes('DEPILACION') || n.includes('CERA')) return 'DEPILACION';
  if (n.includes('RECOGIDO') || n.includes('PEINADO') || n.includes('SEMIRECOGIDO')) return 'PEINADOS_&_RECOGIDOS';
  if (n.includes('SPA')) return 'SPA CAPILAR';
  if (n.includes('MOLDEADO') || n.includes('PERMANENTE')) return 'MOLDEADOS';
  if (n.includes('MAQUILLAJE')) return 'OTROS';
  if (n.includes('CORTE')) return 'CORTESMUJER';
  if (n === 'LAVADO' || n === 'SECADO') return '';   // fase, ya excluida por 0€ igualmente
  return '';
}

// ── MODO 4: SERVICIOS (unidades por CATEGORÍA, contando complementos) ──────
// Responde "¿cuántos servicios de corte en junio?" contando CADA servicio
// realmente COBRADO, esté como principal o como complemento.
//
// ⚠️ LEE DE PaymentReservations (el ledger), NO de KamisuiteReservations.
// Motivos (lección 19-Jul, dura):
//   · KamisuiteReservations solo tiene datos desde la migración (julio+). Los
//     meses previos (junio, con 22.000€ facturados) SOLO están en el ledger.
//   · El ledger es lo CONSUMADO: excluye por naturaleza lo no cobrado
//     (cancelaciones, no-shows). "Servicios que se hicieron" = lo que se cobró,
//     no lo que se agendó. Contar sobre reservas metería canceladas.
//
// Cada cobro guarda su(s) servicio(s) en `descripcion` con formato de ledger
// ("Nombre (precio€), Otro (precio€), 🛒 Producto…"). Se descompone con
// _parsearDescripcionCobro —patrón LITERAL de cierreLogicExtendido, que ya
// hace esto para el Cierre Financiero: separa por comas, ignora productos 🛒,
// propinas ✏️ y descuentos 🏷️, y descarta fases a 0€—. Cada nombre de servicio
// se resuelve a su group vía el mapa label→group del catálogo.
async function consultarServicios(f) {
  let q = wixData.query(C_COBROS);
  if (f.desde) q = q.ge('fechaPago', new Date(`${f.desde}T00:00:00.000Z`));
  if (f.hasta) q = q.le('fechaPago', new Date(`${f.hasta}T23:59:59.999Z`));
  q = q.ascending('fechaPago');

  const raw = await findAll(q, f.limite);

  let cobros = raw.map(normalizarCobro);
  if (f.desde) cobros = cobros.filter(r => r.fechaPago >= f.desde);
  if (f.hasta) cobros = cobros.filter(r => r.fechaPago <= f.hasta);
  // Productos de tienda POS no son servicios (Guía V2.0 §D.2: staff='TIENDA_POS').
  cobros = cobros.filter(r => String(r.staff || '').toUpperCase() !== 'TIENDA_POS');
  // Filtros de cobro que también aplican al servicio (staff, día, cliente…).
  // family/group se filtran DESPUÉS, a nivel de servicio individual.
  cobros = aplicarFiltros(cobros, { ...f, family: undefined, group: undefined }, 'dowPago');

  const gruposPedidos = f.group
    ? (Array.isArray(f.group) ? f.group : [f.group]).map(normalizarGroup)
    : null;

  // Expandir: una línea por servicio individual cobrado, categorizado por
  // keyword (los nombres del histórico no coinciden con el catálogo actual).
  let servicios = [];
  for (const c of cobros) {
    const lineas = _parsearDescripcionCobro(c.descripcion);
    for (const l of lineas) {
      const group = _categorizarPorKeyword(l.nombre);
      servicios.push({
        nombre: l.nombre,
        group,
        precio: l.precio,
        cantidad: l.cantidad,
        principal: l.principal,
        fecha: c.fechaPago,
        dow: c.dowPago,
        staffName: c.staff,
        cliente: c.cliente,
        _catalogado: group !== ''
      });
    }
  }

  // Filtro por categoría (group) a nivel de SERVICIO, no de cobro.
  if (gruposPedidos) {
    servicios = servicios.filter(s => gruposPedidos.indexOf(normalizarGroup(s.group)) !== -1);
  }

  const totalImporte = servicios.reduce((s, x) => s + x.precio, 0);
  const totalUnidades = servicios.reduce((s, x) => s + x.cantidad, 0);

  const res = {
    numServicios: servicios.length,
    unidades: totalUnidades,
    importeTotal: round2(totalImporte),
    ticketMedio: servicios.length > 0 ? round2(totalImporte / servicios.length) : 0
  };
  if (raw._truncado) {
    res.AVISO = 'Los datos están INCOMPLETOS: el periodo tiene más registros de los que se pueden leer de una vez. Advierte al usuario de que las cifras son parciales y sugiérele acotar el periodo.';
  }

  // Desglose por categoría (group) salvo que pidan otro eje.
  const eje = f.agruparPor && f.agruparPor !== 'ninguno' ? f.agruparPor : 'group';
  const mapa = {};
  for (const s of servicios) {
    let k;
    if (eje === 'group')      k = s.group || '(no catalogado)';
    else if (eje === 'staff') k = s.staffName || '(sin asignar)';
    else if (eje === 'dia')   k = s.fecha || '(sin fecha)';
    else if (eje === 'mes')   k = (s.fecha || '').substring(0, 7) || '(?)';
    else if (eje === 'servicio') k = s.nombre;
    else k = s.group || '(no catalogado)';
    if (!mapa[k]) mapa[k] = { grupo: k, numServicios: 0, unidades: 0, importeTotal: 0 };
    mapa[k].numServicios++;
    mapa[k].unidades += s.cantidad;
    mapa[k].importeTotal += s.precio;
  }
  res.desglose = Object.values(mapa)
    .map(g => ({
      grupo: g.grupo,
      numServicios: g.numServicios,
      unidades: g.unidades,
      importeTotal: round2(g.importeTotal),
      ticketMedio: g.numServicios > 0 ? round2(g.importeTotal / g.numServicios) : 0
    }))
    .sort((a, b) => b.numServicios - a.numServicios);

  res.muestra = servicios.slice(0, 40).map(s => ({
    fecha: s.fecha, servicio: s.nombre, categoria: s.group || '(no catalogado)',
    precio: s.precio, staff: s.staffName, esComplemento: !s.principal
  }));
  return res;
}


async function consultarCobros(f) {
  let q = wixData.query(C_COBROS);
  if (f.desde) q = q.ge('fechaPago', new Date(`${f.desde}T00:00:00.000Z`));
  if (f.hasta) q = q.le('fechaPago', new Date(`${f.hasta}T23:59:59.999Z`));
  q = q.ascending('fechaPago');

  const raw = await findAll(q, f.limite);
  let filas = raw.map(normalizarCobro);

  if (f.desde) filas = filas.filter(r => r.fechaPago >= f.desde);
  if (f.hasta) filas = filas.filter(r => r.fechaPago <= f.hasta);

  filas = aplicarFiltros(filas, f, 'dowPago');

  const res = agregar(filas, 'importe', f.agruparPor);
  if (raw._truncado) {
    res.AVISO = 'Los datos están INCOMPLETOS: el periodo tiene más registros de los que se pueden leer de una vez. Advierte al usuario de que las cifras son parciales y sugiérele acotar el periodo.';
  }
  res.clientesUnicos = new Set(filas.map(r => r.contactId || r.cliente).filter(Boolean)).size;
  res.muestra = filas.slice(0, 40).map(r => ({
    fechaPago: r.fechaPago, importe: r.importe, tipoPago: r.tipoPago,
    staff: r.staff, cliente: r.cliente, descripcion: r.descripcion
  }));
  return res;
}

// ── MODO 3: CONVERSIÓN (el delta reservado → cobrado) ──────────────────────
// Ninguna colección sola responde esto. El cruce es por bookingId=KRI_<id>.
async function consultarConversion(f) {
  const fReservas = { ...f, agruparPor: 'ninguno' };
  let q = wixData.query(C_RESERVAS);
  if (f.desde) q = q.ge('fechaReserva', new Date(`${f.desde}T00:00:00.000Z`));
  if (f.hasta) q = q.le('fechaReserva', new Date(`${f.hasta}T23:59:59.999Z`));
  const rawR = await findAll(q, f.limite);

  let reservas = rawR.map(normalizarReserva);
  if (f.desde) reservas = reservas.filter(r => r.fecha >= f.desde);
  if (f.hasta) reservas = reservas.filter(r => r.fecha <= f.hasta);
  reservas = reservas.filter(r => r.family !== FAMILY_BLOQUEO);
  reservas = aplicarFiltros(reservas, fReservas, 'dow');

  // Cobros del periodo (por fecha de RESERVA: así el cruce es del mismo lote).
  let qc = wixData.query(C_COBROS);
  if (f.desde) qc = qc.ge('fechaReserva', new Date(`${f.desde}T00:00:00.000Z`));
  if (f.hasta) qc = qc.le('fechaReserva', new Date(`${f.hasta}T23:59:59.999Z`));
  const rawC = await findAll(qc, f.limite);
  const cobros = rawC.map(normalizarCobro);

  const cobradoPorReserva = {};
  for (const c of cobros) {
    if (!c.reservaId) continue;
    if (!cobradoPorReserva[c.reservaId]) cobradoPorReserva[c.reservaId] = 0;
    cobradoPorReserva[c.reservaId] += c.importe;
  }

  const canceladas = reservas.filter(r => r.status === STATUS_CANCELADA);
  const vivas      = reservas.filter(r => r.status !== STATUS_CANCELADA);
  const cobradas   = vivas.filter(r => cobradoPorReserva[r.id] != null);
  const sinCobrar  = vivas.filter(r => cobradoPorReserva[r.id] == null);

  const valorComprometido = vivas.reduce((s, r) => s + r.precio, 0);
  const valorCobrado      = cobradas.reduce((s, r) => s + (cobradoPorReserva[r.id] || 0), 0);
  const valorPerdido      = sinCobrar.reduce((s, r) => s + r.precio, 0);
  const valorCancelado    = canceladas.reduce((s, r) => s + r.precio, 0);

  const res = {
    reservasVivas: vivas.length,
    reservasCanceladas: canceladas.length,
    reservasCobradas: cobradas.length,
    reservasSinCobrar: sinCobrar.length,
    tasaConversionPct: vivas.length > 0 ? round2((cobradas.length / vivas.length) * 100) : 0,
    valorComprometido: round2(valorComprometido),
    valorCobrado: round2(valorCobrado),
    valorPendienteOPerdido: round2(valorPerdido),
    valorCancelado: round2(valorCancelado),
    desviacionCobroPct: valorComprometido > 0
      ? round2(((valorCobrado - valorComprometido) / valorComprometido) * 100) : 0
  };

  if (f.agruparPor && f.agruparPor !== 'ninguno') {
    const mapa = {};
    for (const r of vivas) {
      const k = claveGrupo(r, f.agruparPor);
      if (k === null) continue;
      if (!mapa[k]) mapa[k] = { grupo: k, reservas: 0, cobradas: 0, comprometido: 0, cobrado: 0 };
      mapa[k].reservas++;
      mapa[k].comprometido += r.precio;
      if (cobradoPorReserva[r.id] != null) {
        mapa[k].cobradas++;
        mapa[k].cobrado += cobradoPorReserva[r.id];
      }
    }
    res.desglose = Object.values(mapa).map(g => ({
      grupo: g.grupo,
      reservas: g.reservas,
      cobradas: g.cobradas,
      tasaConversionPct: g.reservas > 0 ? round2((g.cobradas / g.reservas) * 100) : 0,
      comprometido: round2(g.comprometido),
      cobrado: round2(g.cobrado)
    })).sort((a, b) => b.comprometido - a.comprometido);
  }

  res.muestraSinCobrar = sinCobrar.slice(0, 25).map(r => ({
    fecha: r.fecha, cliente: r.cliente, staff: r.staffName,
    family: r.family, precio: r.precio, status: r.status
  }));
  return res;
}

/** Router del motor. Único punto de entrada de la herramienta. */
async function ejecutarConsulta(filtros) {
  const f = filtros || {};
  const modo = f.modo || 'reservas';
  const t0 = Date.now();
  let datos;
  if (modo === 'cobros')          datos = await consultarCobros(f);
  else if (modo === 'conversion') datos = await consultarConversion(f);
  else if (modo === 'servicios')  datos = await consultarServicios(f);
  else                            datos = await consultarReservas(f);
  console.log(`${TAG} consulta modo=${modo} desde=${f.desde || '-'} hasta=${f.hasta || '-'} family=${f.family || '-'} group=${f.group || '-'} dow=[${(f.diasSemana || []).join(',')}] agrupa=${f.agruparPor || '-'} → ${Date.now() - t0}ms`);
  return { modo, filtrosAplicados: f, ...datos };
}

// ═══════════════════════════════════════════════════════════════════════════
// MOTOR DE CONFIGURACIÓN — REGISTRO DECLARATIVO
// ═══════════════════════════════════════════════════════════════════════════
//
// SEGUNDA HERRAMIENTA. No es un cuarto modo del motor transaccional, y esto
// es deliberado:
//
//   · Reservations/Payments son TRANSACCIONALES: tienen fecha. Se filtran por
//     periodo, día de semana, rango. "Ticket medio de mayo" tiene sentido.
//   · ServiceCatalog/StaffConfig son CONFIGURACIÓN: NO tienen fecha. Un tinte
//     cuesta 45€ hoy y costaba 45€ en mayo. "Precio del tinte en mayo" no
//     significa nada. Se leen enteras, no se filtran por periodo.
//
// Meterlas en el mismo enum obligaría a que la mitad de los parámetros fueran
// inaplicables según el modo, y el modelo se confundiría.
//
// ───────────────────────────────────────────────────────────────────────────
// POR QUÉ UN REGISTRO Y NO UN SWITCH (regla de Jal, 17-Jul-2026)
// ───────────────────────────────────────────────────────────────────────────
//
// Un switch con 15 casos sería AkiraCapabilities otra vez: hardcodeo
// disfrazado. Aquí, añadir una colección mañana = AÑADIR UNA ENTRADA A ESTE
// OBJETO. Cero código nuevo: ni función, ni caso, ni herramienta.
//
// El input_schema de la herramienta se GENERA desde Object.keys(FUENTES_CONFIG),
// así que el modelo ve la fuente nueva automáticamente, sin tocar el prompt.
//
// El salón tiene 53 colecciones propias. Abrirlas todas de golpe degradaría
// las respuestas y quemaría tokens: cada fuente es contexto que el modelo debe
// digerir. Se arranca con 5 y se amplía cuando Jal lo pida.
//
// ───────────────────────────────────────────────────────────────────────────
// ANATOMÍA DE UNA FUENTE
// ───────────────────────────────────────────────────────────────────────────
//
//   coleccion     — nombre real de la colección CMS
//   descripcion   — qué contiene. VA AL PROMPT: el modelo elige por aquí.
//   filtroDefecto — { campo: valor } aplicado siempre (p.ej. active:true)
//   orden         — campo de ordenación ascendente (opcional)
//   limite        — techo de filas
//   campos        — WHITELIST. Solo estos llegan al modelo. Lo no declarado
//                   no viaja: ahorra tokens y evita fugas.
//   objetos       — { campo: claveDesenvuelto } → jsonIn (patrón producción)
//   sensibles     — campos que NUNCA llegan al modelo aunque estén en `campos`
//   transform     — (fila) => fila. Traducción de formatos ilegibles.
//   filaUnica     — true si la colección tiene una sola fila (SalonConfig)
//   loader        — async () => filas[]. Para fuentes que NO son CMS sino API
//                   nativa de Wix (Contacts, Stores, Loyalty…). Si se declara,
//                   sustituye a `coleccion`/`filtroDefecto`/`orden`. El resto
//                   del motor (whitelist, sensibles, búsqueda) se aplica igual.
//   requiereBusqueda — true si la fuente tiene demasiadas filas para volcarla
//                   entera (CRM: cientos de contactos). El motor rechaza la
//                   llamada sin `busqueda` en vez de reventar el contexto.
//
// ⚠️ `sensibles` NO es decorativo: StaffConfig.pinCode es el PIN de acceso a
// Recepción PRO. Sin esta lista, un PIN viajaría a Anthropic en cada consulta
// de horarios. Lo mismo con masterPin de SalonConfig.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Traduce workingHoursSessionIds (TEXT con JSON) a horario legible.
 *
 * PATRÓN LITERAL de leerHorarioStaffEnDia en widgetPublicoLogic.web.js.
 * NO reinventar: el formato V2 es
 *   {"items":[{"dow":0,"open":false},{"dow":1,"open":true,"from":"10:00","to":"20:00"}]}
 * donde dow = Date.getDay() → 0=domingo … 6=sábado.
 *
 * El formato V1 (lista de session IDs de Bookings) parsea SILENCIOSAMENTE
 * pero no tiene `dow`: rompe toda la disponibilidad pública. Si aparece, se
 * marca como no interpretable en vez de mentir con un horario vacío.
 */
function _transformHorario(fila) {
  const dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const raw = fila.workingHoursSessionIds;
  const out = { ...fila };
  delete out.workingHoursSessionIds;

  if (!raw) { out.horario = 'sin horario configurado'; return out; }

  let items = [];
  try {
    if (typeof raw === 'string') {
      const obj = JSON.parse(raw);
      items = Array.isArray(obj?.items) ? obj.items : (Array.isArray(obj) ? obj : []);
    } else if (raw && typeof raw === 'object') {
      items = Array.isArray(raw.items) ? raw.items : (Array.isArray(raw) ? raw : []);
    }
  } catch (e) {
    out.horario = 'horario con formato inválido';
    return out;
  }

  // Detección del formato V1: sin `dow` no hay horario interpretable.
  const tieneDow = items.some(it => it && it.dow != null);
  if (items.length > 0 && !tieneDow) {
    out.horario = 'formato antiguo (V1) — no interpretable, requiere migración';
    return out;
  }

  const tramos = [];
  let minutosSemana = 0;
  for (let d = 0; d <= 6; d++) {
    const it = items.find(x => Number(x?.dow) === d);
    if (!it || !it.open || !it.from || !it.to) continue;
    tramos.push(`${dias[d]} ${it.from}-${it.to}`);
    const [hf, mf] = String(it.from).split(':').map(Number);
    const [ht, mt] = String(it.to).split(':').map(Number);
    const min = (ht * 60 + mt) - (hf * 60 + mf);
    if (min > 0) minutosSemana += min;
  }

  out.horario = tramos.length > 0 ? tramos.join(' · ') : 'sin días abiertos';
  out.horasSemana = round2(minutosSemana / 60);
  out.diasTrabajados = tramos.length;
  return out;
}

/**
 * Loader del CRM de Wix (Wix Contacts).
 *
 * Es la ÚNICA fuente que NO es una colección CMS: es una app nativa de Wix.
 * Por eso el registro admite `loader`: una función que devuelve las filas ya
 * normalizadas. El resto del motor (whitelist, sensibles, búsqueda) se aplica
 * igual. Añadir mañana otra fuente basada en API (Stores, Bookings, Loyalty)
 * = declarar su loader. La arquitectura no cambia.
 *
 * CONTRATO VERIFICADO en producción (pagecode_recepcionPRO v2.1.5 línea 247):
 *   cargarTodosContactos() → { ok: true, clientes: [{ contactId, nombreCompleto, email, telefono }] }
 * NO devuelve un array pelado. `consoleIA` v3.5.8 hace `todosRaw?.clientes`.
 *
 * ⚠️ El teléfono es el ÚNICO identificador fiable de cliente en KAMISUITE.
 * NUNCA usar email ni contactId como clave única (Conceptos Fundacionales).
 */
async function _loaderClientes() {
  const res = await cargarTodosContactos();
  if (!res || !res.ok) {
    console.warn(`${TAG} _loaderClientes: cargarTodosContactos no OK`);
    return [];
  }
  return (res.clientes || []).map(c => ({
    nombreCompleto: c.nombreCompleto || '',
    telefono: c.telefono || '',
    email: c.email || '',
    contactId: c.contactId || ''
  }));
}

/**
 * Registro de fuentes de configuración.
 * AMPLIAR AQUÍ = añadir una entrada. Nada más.
 */
const FUENTES_CONFIG = {

  servicios: {
    coleccion: 'ServiceCatalog',
    descripcion: 'Catálogo de servicios del salón: precio de tarifa, duración, familia, grupo, fases técnicas, complementos, variantes, bonos y descuentos promocionales configurados. Úsalo para saber a qué precio ESTÁ un servicio (tarifa), no cuánto se cobró (eso son los cobros).',
    filtroDefecto: { active: true },
    orden: 'order',
    limite: 300,
    campos: [
      'label', 'price', 'duration', 'minProceso', 'family', 'group', 'group1',
      'tipo', 'uso', 'claseServicio', 'ordenFases', 'mandatory', 'hasVariants',
      'bonoActivo', 'bonoNumero', 'bonoDescuento', 'descuentoActivo',
      'descuentoPromo', 'cobroporPeso', 'precioGramo', 'advancePayment',
      'advancePercent', 'descripcion', 'setupUid'
    ],
    objetos: { mapeoFases: 'items', complementos: 'items', variantes: 'items' },
    sensibles: []
  },

  personal: {
    coleccion: 'StaffConfig',
    descripcion: 'Profesionales del salón: horario semanal de trabajo, horas semanales, porcentaje de comisión, si es personal externo, y nivel de acceso. Úsalo para saber cuándo trabaja alguien o cuál es su capacidad horaria.',
    filtroDefecto: { active: true },
    limite: 60,
    campos: [
      'canonicalName', 'displayName', 'workingHoursSessionIds', 'isExternal',
      'externalModule', 'commissionPercentage', 'locationName', 'notes', 'accessLevel'
    ],
    objetos: {},
    // pinCode NUNCA llega al modelo: es el PIN de acceso a Recepción PRO.
    sensibles: ['pinCode'],
    transform: _transformHorario
  },

  salon: {
    coleccion: 'SalonConfig',
    descripcion: 'Configuración general del salón: nombre, IVA aplicable, horarios de apertura, módulos activos (tienda, fidelización, WhatsApp), datos fiscales y de contacto.',
    filaUnica: true,
    limite: 1,
    campos: [
      'brandName', 'legalName', 'address', 'phone', 'tier', 'vatRate',
      'hoursMonday', 'hoursTuesday', 'hoursWednesday', 'hoursThursday',
      'hoursFriday', 'hoursSaturday', 'hoursSunday', 'closingGraceMin',
      'defaultProfessional', 'externalStaffName', 'externalStaffArea',
      'shopActive', 'loyaltyActive', 'waActive', 'whatsappPro', 'emailActive',
      'usersActivation', 'widgetSkin'
    ],
    objetos: {},
    // masterPin y pinMetaNActual son credenciales. Nunca al modelo.
    sensibles: ['masterPin', 'pinMetaNActual', 'newnumbercommandMeta']
  },

  productos: {
    coleccion: 'KamisuiteWarehouse',
    descripcion: 'Almacén de productos: nombre, tipo, coste unitario, cantidad en stock y stock mínimo. Úsalo para consultas de inventario, valor del almacén o productos bajo mínimos.',
    filtroDefecto: { active: true },
    orden: 'productName',
    limite: 300,
    campos: ['productName', 'type', 'unitCost', 'quantity', 'minStock'],
    objetos: [],
    sensibles: []
  },

  clientes: {
    fuenteApi: 'Wix Contacts (CRM)',
    descripcion: 'Ficha de contacto de los clientes del salón: nombre completo, teléfono y email. Úsalo cuando pidan los datos de contacto de una persona ("dame el teléfono de X", "el email de Y"). SIEMPRE con `busqueda`: son cientos de contactos. Para el HISTORIAL de visitas o gasto de un cliente usa consultar_datos_salon con el filtro cliente, no esta fuente.',
    loader: _loaderClientes,
    requiereBusqueda: true,
    limite: 25,
    campos: ['nombreCompleto', 'telefono', 'email'],
    objetos: {},
    // contactId es un UUID interno: no aporta nada al modelo y gasta tokens.
    sensibles: ['contactId']
  },

  externos: {
    coleccion: 'ExternalServices',
    descripcion: 'Catálogo de servicios externos (los que presta personal no propio del salón) y el porcentaje de comisión que el salón retiene de cada uno.',
    filtroDefecto: { activeStatus: true },
    limite: 60,
    campos: ['serviceName', 'contactPerson', 'commissionPercentage'],
    objetos: {},
    sensibles: []
  }

  // ── PARA AÑADIR UNA FUENTE NUEVA ──
  // Copiar el patrón de arriba. NADA MÁS que tocar: el input_schema, el
  // prompt del modelo y el router se generan solos desde este objeto.
  //
  // Diferidas hasta que Jal las pida (cada fuente abierta = más contexto que
  // el modelo debe digerir, y peores respuestas si se abren todas de golpe):
  //   Invoices · InvoiceCounters · KamisuiteVouchers · KamisuitePrimeMemberships
  //   KamisuitePromoCards · KamisuiteProductsConfig · ClientCareProfile
  //   CareVisitRecord · TimeClockRecords · CommunicationLog · CashRegister
  //   CashMovements · HairSalonServices · MarketingCampaigns · B2BProfiles
};

/**
 * Ejecuta una lectura de configuración. Genérica: NO conoce ninguna colección.
 * Todo su comportamiento sale del registro.
 */
async function consultarConfig(params) {
  const p = params || {};
  const clave = p.fuente;
  const def = FUENTES_CONFIG[clave];

  if (!def) {
    return {
      error: `Fuente "${clave}" no disponible.`,
      fuentesDisponibles: Object.keys(FUENTES_CONFIG)
    };
  }

  const t0 = Date.now();

  // Fuentes con miles de filas (CRM) exigen término de búsqueda: volcarlas
  // enteras al modelo reventaría el contexto y el coste.
  if (def.requiereBusqueda && !p.busqueda) {
    return {
      error: `La fuente "${clave}" necesita un término de búsqueda (nombre, teléfono o email).`
    };
  }

  // ── Obtención: loader (API externa) o query CMS declarativa ──
  let raw;
  if (typeof def.loader === 'function') {
    raw = await def.loader();
  } else {
    let q = wixData.query(def.coleccion);
    for (const [campo, valor] of Object.entries(def.filtroDefecto || {})) {
      q = q.eq(campo, valor);
    }
    if (p.filtro && typeof p.filtro === 'object') {
      for (const [campo, valor] of Object.entries(p.filtro)) {
        // Solo campos declarados: evita filtrar por lo que no se expone.
        if ((def.campos || []).indexOf(campo) !== -1) q = q.eq(campo, valor);
      }
    }
    if (def.orden) q = q.ascending(def.orden);
    raw = await findAll(q, def.limite || 200);
  }

  // ── Proyección: whitelist + OBJECT + sensibles + transform ──
  const sensibles = new Set(def.sensibles || []);
  let filas = raw.map(item => {
    const out = {};
    for (const campo of (def.campos || [])) {
      if (sensibles.has(campo)) continue;          // nunca al modelo
      const v = item[campo];
      if (v === undefined || v === null || v === '') continue;
      out[campo] = v;
    }
    // Campos OBJECT envueltos {items:[...]} → jsonIn (patrón producción)
    for (const [campo, clave] of Object.entries(def.objetos || {})) {
      if (sensibles.has(campo)) continue;
      const arr = jsonIn(item[campo], clave);
      if (arr.length > 0) out[campo] = arr;
    }
    return def.transform ? def.transform(out) : out;
  });

  // ── Búsqueda libre sobre los campos ya proyectados ──
  if (p.busqueda) {
    const norm = (s) => String(s || '').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const needle = norm(p.busqueda).trim();
    // Si buscan un teléfono, comparar solo dígitos: en CRM está como
    // "+34 617 37 89 84" y lo teclean como "617378984".
    const soloDigitos = needle.replace(/[^\d]/g, '');
    const esTelefono = soloDigitos.length >= 6;

    const match = filas.filter(f => {
      const blob = norm(JSON.stringify(f));
      if (blob.indexOf(needle) !== -1) return true;
      if (esTelefono && blob.replace(/[^\d]/g, '').indexOf(soloDigitos) !== -1) return true;
      return false;
    });

    if (match.length > 0) {
      filas = match;
    } else if (def.requiereBusqueda) {
      // Sin match en una fuente que exige búsqueda, devolver TODO sería
      // volcar el CRM entero. Mejor decir la verdad: no se ha encontrado.
      console.log(`${TAG} config fuente=${clave} busqueda="${p.busqueda}" → 0 resultados`);
      return {
        fuente: clave,
        numRegistros: 0,
        datos: [],
        nota: `No se ha encontrado ningún registro que coincida con "${p.busqueda}".`
      };
    }
    // En fuentes pequeñas (catálogo, personal), sin match se devuelve todo:
    // mejor contexto de más que respuesta vacía por una búsqueda mal formulada.
  }

  // Techo duro tras filtrar: protege el contexto del modelo.
  if (def.limite && filas.length > def.limite) filas = filas.slice(0, def.limite);

  console.log(`${TAG} config fuente=${clave} filas=${filas.length} → ${Date.now() - t0}ms`);

  if (def.filaUnica) {
    return { fuente: clave, coleccion: def.coleccion, datos: filas[0] || null };
  }
  return { fuente: clave, coleccion: def.coleccion, numRegistros: filas.length, datos: filas };
}

/**
 * Definición de la herramienta, GENERADA desde el registro.
 * Añadir una fuente al registro la hace visible al modelo automáticamente:
 * el enum y las descripciones salen de aquí, no de un literal.
 */
function _buildToolConfig() {
  const claves = Object.keys(FUENTES_CONFIG);
  const listado = claves
    .map(k => {
      const f = FUENTES_CONFIG[k];
      const req = f.requiereBusqueda ? ' [REQUIERE el parámetro `busqueda`]' : '';
      return `· "${k}"${req}: ${f.descripcion}`;
    })
    .join('\n');
  const conBusqueda = claves.filter(k => FUENTES_CONFIG[k].requiereBusqueda);

  return {
    name: 'consultar_configuracion_salon',
    description:
      'Consulta cómo está CONFIGURADO el salón: catálogo de servicios y sus precios de tarifa, ' +
      'horarios del personal, ajustes generales, almacén y comisiones. Estos datos NO tienen fecha: ' +
      'describen el estado actual, no lo que ocurrió en un periodo.\n\n' +
      'Combínala con consultar_datos_salon cuando la pregunta cruce configuración y actividad ' +
      '(por ejemplo: comparar el precio de tarifa de un servicio con lo que se está cobrando, ' +
      'o las horas contratadas de un profesional con las que tiene ocupadas).\n\n' +
      'Fuentes disponibles:\n' + listado,
    input_schema: {
      type: 'object',
      properties: {
        fuente: {
          type: 'string',
          enum: claves,
          description: 'Qué configuración leer.'
        },
        busqueda: {
          type: 'string',
          description: 'Texto libre para acotar: nombre de un servicio, de un profesional o de un cliente; también vale un teléfono o email. ' +
            (conBusqueda.length > 0
              ? `OBLIGATORIO en: ${conBusqueda.join(', ')} (son demasiados registros para devolverlos todos). `
              : '') +
            'En el resto de fuentes es opcional: si se omite, devuelve todo.'
        }
      },
      required: ['fuente']
    }
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// DEFINICIÓN DE LA HERRAMIENTA (tool use nativo de Anthropic)
// ═══════════════════════════════════════════════════════════════════════════
// Sustituye al classify de V1. Sonnet elige filtros; NUNCA calcula cifras.

const TOOL_CONSULTAR = {
  name: 'consultar_datos_salon',
  description:
    'Consulta los datos reales del salón. Úsala SIEMPRE que la pregunta requiera cualquier cifra, ' +
    'listado o dato del negocio. Nunca respondas con cifras de memoria ni las calcules tú: ' +
    'pide los datos con esta herramienta y narra el resultado. Puedes llamarla varias veces ' +
    '(por ejemplo, para comparar dos periodos). Los filtros son combinables entre sí.',
  input_schema: {
    type: 'object',
    properties: {
      modo: {
        type: 'string',
        enum: ['reservas', 'cobros', 'conversion', 'servicios'],
        description:
          'reservas = lo COMPROMETIDO (agenda, ocupación, previsión, carga de trabajo; incluye futuro). Cuenta RESERVAS enteras, categorizadas por su servicio principal. ' +
          'cobros = lo CONSUMADO (dinero realmente cobrado, métodos de pago, caja). ' +
          'conversion = el DELTA entre ambos (tasa de conversión, no-shows, reservas sin cobrar, fugas). ' +
          'servicios = cuenta SERVICIOS INDIVIDUALES realmente COBRADOS por categoría, incluidos los que van como complemento. Lee del ledger de cobros, así que ABARCA TODO EL HISTÓRICO (también meses anteriores a la migración) y refleja solo lo cobrado (sin cancelaciones). Usa este modo para "¿cuántos cortes/servicios de X se hicieron/facturaron?". Es el modo correcto para categoría de servicio en cualquier periodo pasado.'
      },
      desde: { type: 'string', description: 'Fecha inicio YYYY-MM-DD. Cópiala de la tabla FECHAS del system; no la calcules.' },
      hasta: { type: 'string', description: 'Fecha fin YYYY-MM-DD, inclusive.' },
      group: {
        type: 'array', items: { type: 'string' },
        description: 'CATEGORÍA(S) de servicio a incluir. Es el eje de categoría PRINCIPAL. Usa los valores canónicos EXACTOS de la lista "CATEGORÍAS DISPONIBLES" del system (p.ej. COLORACION, CORTESMUJER, CABALLERO, TRATAMIENTOS, MANICURA_&_PEDICURA). El usuario dirá "color", "corte", "uñas": traduce tú al canónico. Si un término abarca varias categorías (p.ej. "corte" → CORTESMUJER y CABALLERO), NO adivines: pregunta cuál. Vacío = todas.'
      },
      family: {
        type: 'array', items: { type: 'string' },
        description: 'Eje TÉCNICO secundario (naturaleza del servicio: simple, coloracion, tratamiento, externo, medida). Para categorías comerciales usa `group`, no esto. Vacío = todas.'
      },
      staffName: { type: 'string', description: 'Filtra por nombre de profesional (coincidencia parcial).' },
      diasSemana: {
        type: 'array', items: { type: 'number' },
        description: 'Días de la semana: 0=domingo, 1=lunes … 6=sábado. Ej: [1,2] = lunes y martes.'
      },
      origen: { type: 'string', enum: ['web', 'recepcion'], description: 'Canal de la reserva. Solo modo reservas/conversion.' },
      tipoPago: { type: 'string', description: 'Método de pago (efectivo, tarjeta…). Solo modo cobros.' },
      cliente: { type: 'string', description: 'Nombre de cliente (coincidencia parcial).' },
      agruparPor: {
        type: 'string',
        enum: ['ninguno', 'staff', 'family', 'group', 'dia', 'diaSemana', 'mes', 'tipoPago', 'cliente', 'origen', 'status', 'servicio'],
        description: 'Eje de desglose del resultado. "group" desglosa por categoría. "servicio" (solo modo servicios) desglosa por nombre de servicio. "ninguno" devuelve solo los totales.'
      },
      incluirCanceladas: { type: 'boolean', description: 'Por defecto false. true para analizar cancelaciones.' },
      incluirBloqueos: { type: 'boolean', description: 'Por defecto false. true solo para analizar bloqueos de agenda.' }
    },
    required: ['modo']
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS — ANTHROPIC (timeout + cascade failover, patrón CATHOVIA v1.6.0)
// ═══════════════════════════════════════════════════════════════════════════

function _withTimeout(promise, timeoutMs, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timeout ${timeoutMs}ms`)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function _postAnthropic(apiKey, body, timeoutMs, label) {
  const res = await _withTimeout(
    fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(body)
    }),
    timeoutMs, label
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data && data.error ? data.error.message : `HTTP ${res.status}`);
  return data;
}

/**
 * Bucle de tool use. Sonnet pide datos → JS ejecuta el motor → Sonnet narra.
 * Máx. 4 vueltas: permite comparativas (dos periodos) sin bucle infinito.
 */
async function _callClaudeConHerramientas(model, apiKey, systemBlocks, messages, timeoutMs) {
  const startMs = Date.now();
  const convo = messages.slice();
  let cacheStats = { hit: 0, create: 0, input: 0, output: 0 };
  let consultas = 0;

  for (let vuelta = 0; vuelta < 4; vuelta++) {
    const data = await _postAnthropic(apiKey, {
      model,
      max_tokens: MAX_TOKENS,
      system: systemBlocks,
      tools: [TOOL_CONSULTAR, _buildToolConfig()],
      messages: convo
    }, timeoutMs, model);

    const u = data.usage || {};
    cacheStats = {
      hit:    cacheStats.hit    + (u.cache_read_input_tokens     || 0),
      create: cacheStats.create + (u.cache_creation_input_tokens || 0),
      input:  cacheStats.input  + (u.input_tokens  || 0),
      output: cacheStats.output + (u.output_tokens || 0)
    };

    const bloques = data.content || [];
    const toolUses = bloques.filter(b => b.type === 'tool_use');

    if (data.stop_reason !== 'tool_use' || toolUses.length === 0) {
      const respuesta = bloques.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
      return { respuesta, timeMs: Date.now() - startMs, cacheStats, consultas };
    }

    convo.push({ role: 'assistant', content: bloques });

    const resultados = [];
    for (const tu of toolUses) {
      consultas++;
      let out;
      try {
        // Router de herramientas por nombre. Añadir una herramienta = añadir
        // un caso aquí y declararla en el array `tools` de _postAnthropic.
        if (tu.name === 'consultar_configuracion_salon') {
          out = await consultarConfig(tu.input || {});
        } else {
          out = await ejecutarConsulta(tu.input || {});
        }
      } catch (e) {
        console.warn(`${TAG} herramienta ${tu.name} falló:`, e.message);
        out = { error: 'No se pudieron leer los datos: ' + e.message };
      }
      resultados.push({
        type: 'tool_result',
        tool_use_id: tu.id,
        content: JSON.stringify(out)
      });
    }
    convo.push({ role: 'user', content: resultados });
  }

  // Salvaguarda: si agota las vueltas, pide el cierre sin más herramientas.
  const final = await _postAnthropic(apiKey, {
    model, max_tokens: MAX_TOKENS, system: systemBlocks, messages: convo
  }, timeoutMs, model + '-cierre');
  const respuesta = (final.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
  return { respuesta, timeMs: Date.now() - startMs, cacheStats, consultas };
}

async function _callClaudeConFallback(apiKey, systemBlocks, messages) {
  try {
    const r = await _callClaudeConHerramientas(MODEL_PRIMARY, apiKey, systemBlocks, messages, PRIMARY_TIMEOUT_MS);
    return { ...r, modeloUsado: MODEL_PRIMARY };
  } catch (err1) {
    console.warn(`${TAG} Sonnet falló, cayendo a Haiku: ${err1.message}`);
    try {
      const r = await _callClaudeConHerramientas(MODEL_FALLBACK, apiKey, systemBlocks, messages, FALLBACK_TIMEOUT_MS);
      return { ...r, modeloUsado: MODEL_FALLBACK };
    } catch (err2) {
      throw new Error(`Sonnet:[${err1.message}] Haiku:[${err2.message}]`);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS — CONTEXTO DEL SALÓN (multi-tenant: cada cuenta ES un salón)
// ═══════════════════════════════════════════════════════════════════════════

async function _getSalonConfig() {
  try {
    const res = await wixData.query(C_SALON).limit(1).find(AUTH);
    return res.items.length > 0 ? res.items[0] : null;
  } catch (e) {
    console.warn(`${TAG} _getSalonConfig fallo:`, e.message);
    return null;
  }
}

async function _getStaff() {
  try {
    const res = await wixData.query(C_STAFF).eq('active', true).limit(50).find(AUTH);
    return res.items || [];
  } catch (e) {
    console.warn(`${TAG} _getStaff fallo:`, e.message);
    return [];
  }
}

async function _getAlignment() {
  try {
    const res = await wixData.query(C_ALIGNMENT)
      .eq('status', 'publicado')
      .descending('publicationDate')
      .limit(1)
      .find(AUTH);
    return res.items.length > 0 ? res.items[0] : null;
  } catch (e) {
    console.warn(`${TAG} _getAlignment fallo:`, e.message);
    return null;
  }
}

async function _getDocumentos() {
  try {
    const res = await wixData.query(C_DOCUMENTS)
      .eq('activo', true)
      .ascending('orden')
      .limit(50)
      .find(AUTH);
    return res.items || [];
  } catch (e) {
    console.warn(`${TAG} _getDocumentos fallo:`, e.message);
    return [];
  }
}

/** Familias reales presentes en el CMS. Cero hardcoding: se leen del dato. */
async function _getFamilias() {
  try {
    const res = await wixData.query(C_RESERVAS)
      .isNotEmpty('family')
      .limit(50)
      .distinct('family', AUTH);
    return (res.items || []).filter(f => f && f !== FAMILY_BLOQUEO);
  } catch (e) {
    console.warn(`${TAG} _getFamilias fallo:`, e.message);
    return [];
  }
}

/**
 * CATEGORÍAS (group) reales presentes en el CMS. Cero hardcoding: cada salón
 * tiene las suyas. El modelo mapea el lenguaje natural del usuario ("color",
 * "uñas") contra esta lista real. Se lee de las reservas (el group que grabó
 * crearPackReserva); si aún hay pocas reservas con group, se completa con el
 * catálogo para no dejar categorías fuera del prompt.
 */
async function _getGroups() {
  const set = new Set();
  try {
    const res = await wixData.query(C_RESERVAS)
      .isNotEmpty('group')
      .limit(50)
      .distinct('group', AUTH);
    for (const g of (res.items || [])) {
      if (g && g !== FAMILY_BLOQUEO) set.add(g);
    }
  } catch (e) {
    console.warn(`${TAG} _getGroups (reservas) fallo:`, e.message);
  }
  // Completar con el catálogo: categorías que existen aunque aún no tengan
  // reservas con group (histórico previo al despliegue del campo).
  try {
    const resCat = await wixData.query(C_CATALOGO)
      .isNotEmpty('group')
      .limit(100)
      .distinct('group', AUTH);
    for (const g of (resCat.items || [])) {
      if (g && g !== FAMILY_BLOQUEO) set.add(g);
    }
  } catch (e) {
    console.warn(`${TAG} _getGroups (catálogo) fallo:`, e.message);
  }
  return Array.from(set);
}

// ═══════════════════════════════════════════════════════════════════════════
// SYSTEM PROMPT — bloques STABLE (cacheado 5 min) + VOLATILE (por pregunta)
// ═══════════════════════════════════════════════════════════════════════════

function _buildSystemBlocks(ctx) {
  const { config, documentos, salon, staff, familias, groups, fechas, modo } = ctx;
  const stable = [];

  // ── IDENTIDAD ──
  const brand = (salon && salon.brandName) || 'el salón';
  if (config && config.promptBase) {
    stable.push(config.promptBase);
  } else {
    stable.push(
      `Eres AKIRA, la inteligencia artificial de gestión de ${brand}, integrada en KAMISUITE. ` +
      `Trabajas en modo CONSULTOR: eres un consultor de negocio permanente para la propiedad del salón. ` +
      `Analizas el rendimiento real del negocio, detectas tendencias y anomalías, y das conclusiones ` +
      `accionables. Hablas en español, con criterio profesional y sin rodeos.`
    );
  }

  if (modo) stable.push(`MODO ACTIVO: ${String(modo).toUpperCase()}.`);

  // ── TONO Y DETALLE (AkiraAlignment) ──
  if (config) {
    const tones = {
      'formal':  'TONO: Formal y profesional. Sin emojis ni coloquialismos.',
      'directo': 'TONO: Directo y al grano. Mínimas palabras, máxima información.',
      'cercano': 'TONO: Cercano y natural, como un compañero de equipo.'
    };
    if (tones[config.tone]) stable.push(tones[config.tone]);

    const details = {
      'breve':   'NIVEL DE DETALLE: Respuestas breves y densas.',
      'medio':   'NIVEL DE DETALLE: Extensión media. Dato, contexto y conclusión.',
      'extenso': 'NIVEL DE DETALLE: Análisis detallado, con matices y comparativas.'
    };
    if (details[config.detailLevel]) stable.push(details[config.detailLevel]);
  }

  // ── CONTEXTO DEL SALÓN (real, leído del CMS) ──
  const ctxSalon = ['--- CONTEXTO DEL SALÓN ---'];
  if (salon) {
    if (salon.brandName) ctxSalon.push(`Nombre comercial: ${salon.brandName}`);
    if (salon.legalName) ctxSalon.push(`Razón social: ${salon.legalName}`);
    if (salon.addressUSER || salon.address) ctxSalon.push(`Dirección: ${salon.addressUSER || salon.address}`);
    if (salon.vatRate != null) ctxSalon.push(`IVA aplicable: ${salon.vatRate}%`);
  }
  if (staff && staff.length > 0) {
    ctxSalon.push('Profesionales activos: ' +
      staff.map(s => s.displayName || s.canonicalName).filter(Boolean).join(', '));
  }
  if (familias && familias.length > 0) {
    ctxSalon.push('Familias de servicio disponibles: ' + familias.join(', '));
  }
  if (groups && groups.length > 0) {
    ctxSalon.push(
      'CATEGORÍAS DISPONIBLES (valores canónicos de `group` — úsalos EXACTOS al filtrar): ' +
      groups.join(', ')
    );
  }
  if (ctxSalon.length > 1) stable.push(ctxSalon.join('\n'));

  // ── CÓMO FUNCIONA EL NEGOCIO (Conceptos Fundacionales, no negociable) ──
  stable.push([
    '--- CÓMO FUNCIONAN LOS DATOS DE KAMISUITE ---',
    'Hay dos fuentes de verdad y un cruce entre ambas:',
    '',
    '1. RESERVAS (modo "reservas") — la productividad COMPROMETIDA. Todo lo agendado,',
    '   pasado y futuro. Una reserva existe antes de convertirse en dinero, y puede no',
    '   llegar a serlo nunca (cancelación, no-show). Úsalo para agenda, ocupación,',
    '   carga de trabajo y previsión.',
    '',
    '2. COBROS (modo "cobros") — el resultado CONSUMADO. Solo entra aquí lo que se',
    '   cobró de verdad. Úsalo para facturación real, métodos de pago y caja.',
    '',
    '3. CONVERSIÓN (modo "conversion") — el DELTA entre ambas. Lo que se reservó y no',
    '   se cobró: tasa de conversión, no-shows, fugas de caja. Ninguna de las dos',
    '   fuentes por separado responde esto.',
    '',
    'PROCESO: en coloración y tratamientos, el producto actúa sobre el cabello durante',
    'un tiempo en el que el profesional queda LIBRE y puede atender a otra clienta. Ese',
    'tiempo NO ocupa agenda. Por eso "minutosOcupados" y "minutosProceso" se devuelven',
    'por separado: la ocupación real del profesional es minutosOcupados, nunca la',
    'duración total. Es la razón de ser de KAMISUITE y ningún competidor lo hace.',
    '',
    'origenRecepcion distingue si la reserva la creó el salón (recepción) o la clienta',
    'desde la web. Las reservas de familia BLOQUEO no son actividad comercial: son',
    'huecos bloqueados en agenda, y quedan excluidas salvo que se pidan explícitamente.'
  ].join('\n'));

  // ── REGLAS DE USO DE LA HERRAMIENTA ──
  stable.push([
    '--- REGLAS DE TRABAJO (INQUEBRANTABLES) ---',
    '1. NUNCA des una cifra que no venga de una herramienta. No calcules sumas,',
    '   medias ni porcentajes de cabeza: pídelos y nárralos. Los cálculos ya',
    '   vienen hechos en la respuesta.',
    '1b. Tienes DOS herramientas y son complementarias:',
    '   · consultar_datos_salon → qué PASÓ o pasará (reservas, cobros,',
    '     conversión). Tiene fecha.',
    '   · consultar_configuracion_salon → cómo está MONTADO el salón (precios',
    '     de tarifa, horarios del personal, almacén, ajustes). NO tiene fecha.',
    '   Cuando la pregunta cruce ambas, llama a las dos. Ejemplos: comparar el',
    '   precio de tarifa con lo cobrado de verdad; contrastar las horas de',
    '   horario de un profesional con las que tiene ocupadas; valorar si un',
    '   servicio rinde según su duración configurada.',
    '2. NUNCA calcules fechas. Copia las de la tabla FECHAS de este system.',
    '3. Si necesitas comparar dos periodos, llama a la herramienta dos veces.',
    '4. Si la herramienta devuelve numRegistros 0, dilo con claridad: no hay datos',
    '   para ese filtro. No inventes ni rellenes con estimaciones.',
    '4b. Si la respuesta trae un campo AVISO, TRASLÁDALO al usuario: significa',
    '   que las cifras son parciales. Nunca des un total incompleto como si',
    '   fuera definitivo.',
    '5. Eres SOLO LECTURA. No puedes reservar, cancelar ni modificar nada. Si te lo',
    '   piden, indica que se haga desde Recepción PRO.',
    '6. Importes en euros con el símbolo €. Redondea a 2 decimales.',
    '7. No expliques tu proceso interno ni menciones "la herramienta", "el JSON",',
    '   "la consulta" o los nombres de las colecciones. Habla de negocio, no de',
    '   fontanería.',
    '8. No te limites al dato: aporta la conclusión. Eres un consultor, no un',
    '   informe. Si ves una anomalía relevante, señálala.',
    '9. CATEGORÍAS. La categoría de un servicio es `group`, no `family`. Cuando',
    '   el usuario nombre una categoría en lenguaje natural ("color", "corte",',
    '   "uñas", "peinados"), tradúcela al valor canónico EXACTO de la lista',
    '   "CATEGORÍAS DISPONIBLES" y pásalo en el parámetro `group`. Nunca',
    '   inventes un nombre de categoría que no esté en esa lista.',
    '9b. DESAMBIGUA. Si un término coloquial encaja con VARIAS categorías de la',
    '   lista, NO elijas por tu cuenta: pregunta al usuario cuál quiere. Ejemplo:',
    '   "corte" puede ser CORTESMUJER o CABALLERO → pregunta "¿cortes de mujer,',
    '   de caballero, o ambos?". Solo si el usuario ya lo aclaró, filtra.',
    '9c. RESERVAS vs SERVICIOS. "¿Cuántas reservas/citas de color?" → modo',
    '   reservas con group (cuenta la cita entera, por su servicio principal).',
    '   "¿Cuántos servicios/cuántos cortes se hicieron?" → modo servicios (cuenta',
    '   cada servicio individual, incluido el que va de complemento dentro de una',
    '   reserva de otra categoría). Elige el modo según lo que se pregunta.'
  ].join('\n'));

  // ── GUARDRAILS DEL DUEÑO (AkiraAlignment) ──
  if (config) {
    const gr = [];
    if (config.grNoInvent)   gr.push('Los datos de la herramienta son la ÚNICA verdad. Si no hay dato, di que no lo hay.');
    if (config.grNoMarkdown) gr.push('Responde en texto plano: sin markdown, sin viñetas, sin emojis.');
    if (config.grConcision)  gr.push('Nunca describas tu proceso de cálculo. Da el resultado directo.');
    if (config.grOnlyQuery)  gr.push('Solo consulta. No ofrezcas agendar, reservar ni registrar nada.');
    if (gr.length > 0) stable.push('--- GUARDRAILS ---\n' + gr.join('\n'));
    if (config.extraInstructions && config.extraInstructions.trim()) {
      stable.push('--- INSTRUCCIONES DEL SALÓN ---\n' + config.extraInstructions.trim());
    }
  }

  // ── CONOCIMIENTO (AkiraDocuments: normativa + metodología) ──
  if (documentos && documentos.length > 0) {
    const bloques = ['--- CONOCIMIENTO DE REFERENCIA ---'];
    bloques.push('Este material es tu criterio experto: interpretación de ratios, metodología de gestión y normativa aplicable. Intégralo con naturalidad; no lo cites textualmente.');
    let chars = 0;
    for (const d of documentos) {
      const contenido = d.contenido || '';
      if (chars + contenido.length > MAX_DOC_CHARS) {
        const queda = MAX_DOC_CHARS - chars;
        if (queda > 200) bloques.push(`[${d.tipo || 'documento'}] ${d.titulo || 'Documento'}\n${contenido.substring(0, queda)}…`);
        break;
      }
      bloques.push(`[${d.tipo || 'documento'}] ${d.titulo || 'Documento'}\n${contenido}`);
      chars += contenido.length;
    }
    stable.push(bloques.join('\n\n'));
  }

  // ── VOLÁTIL: fechas (cambian cada día → fuera de la caché) ──
  const volatile = [
    '--- FECHAS (COPIA DE AQUÍ, NO CALCULES) ---',
    `HOY: ${fechas.hoyNombre} ${fechas.hoyISO}`,
    `ayer=${fechas.ayer} | mañana=${fechas.manana}`,
    `esta semana=${fechas.estaSemanaDesde} a ${fechas.estaSemanaHasta}`,
    `semana pasada=${fechas.semanaPasadaDesde} a ${fechas.semanaPasadaHasta}`,
    `este mes=${fechas.esteMesDesde} a ${fechas.esteMesHasta}`,
    `mes pasado=${fechas.mesPasadoDesde} a ${fechas.mesPasadoHasta}`,
    `este año=${fechas.esteAnioDesde} a ${fechas.esteAnioHasta}`,
    `año pasado=${fechas.anioPasadoDesde} a ${fechas.anioPasadoHasta}`,
    'Días de la semana: 0=domingo, 1=lunes, 2=martes, 3=miércoles, 4=jueves, 5=viernes, 6=sábado.'
  ].join('\n');

  return [
    { type: 'text', text: stable.join('\n\n'), cache_control: { type: 'ephemeral' } },
    { type: 'text', text: volatile }
  ];
}

// ═══════════════════════════════════════════════════════════════════════════
// SESIONES E HISTORIAL
// ═══════════════════════════════════════════════════════════════════════════

// AkiraSessions NO tiene usuarioId hoy. Se escribe igualmente: si Jal crea el
// campo, el filtrado por usuario empieza a funcionar sin tocar el código.
// Si no existe, Wix ignora la clave y el historial es del salón.
const USER_FIELD = 'usuarioId';

async function _crearSesion(userId, userName, primeraQuery) {
  const now = new Date();
  const titulo = primeraQuery
    ? String(primeraQuery).substring(0, 60)
    : 'Consulta ' + now.toLocaleDateString('es-ES');
  const registro = {
    title: titulo,
    estado: 'activa',
    fechaCreacion: now,
    fechaActualizacion: now,
    messageCount: 0
  };
  registro[USER_FIELD] = userId || '';
  registro.usuarioNombre = userName || '';
  const res = await wixData.insert(C_SESSIONS, registro, AUTH);
  return res._id;
}

async function _getHistorial(sessionId) {
  const res = await wixData.query(C_MESSAGES)
    .eq('sessionRef', sessionId)
    .ascending('orden')
    .limit(HISTORY_LIMIT * 2)
    .find(AUTH);
  return (res.items || []).map(m => ({
    role: m.rol === 'user' ? 'user' : 'assistant',
    content: m.contenido
  }));
}

/**
 * Guarda el turno. READ-MERGE-UPDATE obligatorio en la sesión:
 * wixData.update REEMPLAZA el documento entero (Conceptos Fundacionales).
 */
async function _guardarMensajes(sessionId, query, respuesta) {
  const res = await wixData.query(C_MESSAGES)
    .eq('sessionRef', sessionId)
    .descending('orden')
    .limit(1)
    .find(AUTH);
  let orden = res.items.length > 0 ? (Number(res.items[0].orden) || 0) + 1 : 1;
  const now = new Date();

  await wixData.insert(C_MESSAGES, {
    sessionRef: sessionId, rol: 'user', contenido: query, orden, timestamp: now
  }, AUTH);
  await wixData.insert(C_MESSAGES, {
    sessionRef: sessionId, rol: 'assistant', contenido: respuesta, orden: orden + 1, timestamp: now
  }, AUTH);

  try {
    const sesion = await wixData.get(C_SESSIONS, sessionId, AUTH);
    if (sesion) {
      const merged = { ...sesion };
      merged.fechaActualizacion = now;
      merged.messageCount = (Number(sesion.messageCount) || 0) + 2;
      await wixData.update(C_SESSIONS, merged, AUTH);
    }
  } catch (e) {
    console.warn(`${TAG} _guardarMensajes: no se pudo tocar la sesión:`, e.message);
  }
}

function _log(campos) {
  return wixData.insert(C_LOG, {
    timestamp: new Date(),
    query: (campos.query || '').substring(0, 500),
    category: campos.modo || 'consultor',
    params: JSON.stringify({
      modelo: campos.modeloUsado, consultas: campos.consultas,
      prepMs: campos.prepMs, apiMs: campos.apiMs, cache: campos.cacheStats
    }).substring(0, 1000),
    responseSummary: (campos.respuesta || '').substring(0, 200),
    version: VERSION,
    timeMs: campos.totalMs || 0,
    error: campos.error || ''
  }, AUTH).catch(() => {});
}

// ═══════════════════════════════════════════════════════════════════════════
// CONTROL DE ACCESO — StaffConfig.accessLevel (briefing Consultor §2)
// ═══════════════════════════════════════════════════════════════════════════

export const akiraVerificarAcceso = webMethod(
  Permissions.SiteMember,
  async ({ pinCode }) => {
    try {
      if (!pinCode) return { ok: false, error: 'PIN requerido' };
      const res = await wixData.query(C_STAFF)
        .eq('pinCode', String(pinCode))
        .eq('active', true)
        .limit(1)
        .find(AUTH);
      if (res.items.length === 0) return { ok: false, error: 'PIN no reconocido.' };
      const s = res.items[0];
      const nivel = Number(s.accessLevel);
      if (!(nivel >= 1 && nivel <= CONSULTOR_MIN_LEVEL)) {
        console.log(`${TAG} acceso denegado: nivel=${nivel}`);
        return { ok: false, error: 'Tu perfil no tiene acceso al modo Consultor.' };
      }
      return {
        ok: true,
        staffId: s._id,
        nombre: s.displayName || s.canonicalName || '',
        accessLevel: nivel
      };
    } catch (e) {
      console.error(`${TAG} akiraVerificarAcceso EXCEPTION:`, e);
      return { ok: false, error: 'Error verificando el acceso.' };
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// NÚCLEO — askAkiraCore
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Lógica principal. Función pura async llamable desde webMethod o desde
 * http-functions.js (que es la ruta real del widget).
 *
 * SOBRE EL TECHO DE 14s DE WIX (medido en CATHOVIA, no supuesto):
 *   Wix corta la CONEXIÓN al cliente a los ~14s, tanto en webMethod como en
 *   http-function. Pero el código backend SIGUE EJECUTÁNDOSE y termina de
 *   guardar en AkiraMessages. Por eso el widget hace polling: si recibe 504,
 *   busca la respuesta en el historial. NO intentar SSE: está medido que
 *   wix-http-functions no acepta streams.
 */
export async function askAkiraCore({ sessionId, query, userId, userName, modo }) {
  const tIn = Date.now();
  console.log(`${TAG} askAkiraCore IN sessionId=${sessionId || 'nueva'} query="${(query || '').substring(0, 50)}…"`);

  try {
    if (!query || !String(query).trim()) return { ok: false, error: 'query obligatoria' };

    // ── PREP: todas las lecturas independientes en paralelo ──
    const apiKeyPromise = getSecret('KAMISUITE').catch(e => {
      console.error(`${TAG} secret KAMISUITE no accesible:`, e.message);
      return null;
    });

    const [config, documentos, salon, staff, familias, groups] = await Promise.all([
      _getAlignment(),
      _getDocumentos(),
      _getSalonConfig(),
      _getStaff(),
      _getFamilias(),
      _getGroups()
    ]);

    const fechas = resolverFechas();
    const prepMs = Date.now() - tIn;
    console.log(`${TAG} PREP ${prepMs}ms: align=${config ? 'OK' : 'null'} docs=${documentos.length} staff=${staff.length} fams=${familias.length} groups=${groups.length}`);

    const apiKey = await apiKeyPromise;
    if (!apiKey) {
      return { ok: false, error: 'Configuración incompleta: falta el secret KAMISUITE.' };
    }

    const systemBlocks = _buildSystemBlocks({
      config, documentos, salon, staff, familias, groups, fechas, modo: modo || 'consultor'
    });

    // ── SESIÓN E HISTORIAL ──
    // Sesión nueva: se crea EN PARALELO con Anthropic (su _id solo hace
    // falta al guardar). Patrón CATHOVIA v1.6.0 (-250ms).
    let messages = [];
    let sessionPromise;
    if (!sessionId) {
      sessionPromise = _crearSesion(userId, userName, query);
    } else {
      sessionPromise = Promise.resolve(sessionId);
      messages = await _getHistorial(sessionId);
    }
    messages.push({ role: 'user', content: String(query) });

    // ── ANTHROPIC con tool use + failover ──
    let r;
    try {
      r = await _callClaudeConFallback(apiKey, systemBlocks, messages);
    } catch (err) {
      console.error(`${TAG} ambos modelos fallaron:`, err.message);
      try { await sessionPromise; } catch (_) {}
      _log({ query, error: err.message, totalMs: Date.now() - tIn, prepMs });
      return { ok: false, error: 'El servicio de IA no responde ahora mismo. Reinténtalo en unos segundos.' };
    }

    const { respuesta, modeloUsado, timeMs: apiMs, cacheStats, consultas } = r;

    let effectiveSessionId;
    try {
      effectiveSessionId = await sessionPromise;
    } catch (e) {
      console.error(`${TAG} _crearSesion falló:`, e.message);
      return { ok: false, error: 'No he podido abrir la conversación. Reinténtalo.' };
    }

    if (!respuesta) {
      return { ok: false, error: 'No he podido generar respuesta. Reformula la pregunta.' };
    }

    await _guardarMensajes(effectiveSessionId, String(query), respuesta);

    const totalMs = Date.now() - tIn;
    _log({ query, respuesta, modo, modeloUsado, consultas, prepMs, apiMs, totalMs, cacheStats });

    console.log(`${TAG} askAkiraCore OUT total=${totalMs}ms (prep=${prepMs}ms api=${apiMs}ms) modelo=${modeloUsado} consultas=${consultas} cache=${cacheStats.hit}/${cacheStats.create} len=${respuesta.length}`);

    return { ok: true, respuesta, sessionId: effectiveSessionId };

  } catch (err) {
    console.error(`${TAG} askAkiraCore EXCEPTION:`, err);
    _log({ query, error: err.message || String(err), totalMs: Date.now() - tIn });
    return { ok: false, error: 'Error técnico: ' + (err.message || 'desconocido') };
  }
}

/** Wrapper webMethod. La ruta real del widget es http-functions (sin proxy). */
export const akiraPreguntar = webMethod(
  Permissions.SiteMember,
  async (params) => askAkiraCore(params)
);

// ═══════════════════════════════════════════════════════════════════════════
// GESTIÓN DE CHATS (sidebar del widget)
// ═══════════════════════════════════════════════════════════════════════════

export const akiraAbrir = webMethod(
  Permissions.Anyone,
  async () => {
    try {
      const [config, salon] = await Promise.all([_getAlignment(), _getSalonConfig()]);
      // Cada visita arranca en welcome (lección CATHOVIA v1.5.3).
      return {
        ok: true,
        sessionId: null,
        brandName: (salon && salon.brandName) || '',
        widgetSkin: (salon && salon.widgetSkin) || 'niebla',
        logoUrl: (salon && salon.logoUrl) || '',
        alignment: config ? { version: config.version || '1.0', tone: config.tone || 'directo' } : null
      };
    } catch (e) {
      console.error(`${TAG} akiraAbrir EXCEPTION:`, e);
      return { ok: false, error: e.message };
    }
  }
);

export const akiraListarChats = webMethod(
  Permissions.Anyone,
  async ({ userId, limit }) => {
    console.log(`${TAG} akiraListarChats IN userId=${userId || 'anon'}`);
    try {
      // CLON LITERAL de cathoviaListarChats (cathoviaBackend v1.6.0).
      //
      // ⚠️ NO se filtra por messageCount. v1.0.0 lo hacía "para optimizar" y
      // la sidebar salía VACÍA: _crearSesion inserta messageCount:0 y quien lo
      // sube a 2 es _guardarMensajes con un update que, si falla por lo que
      // sea, se traga la excepción en silencio → el contador se queda en 0 →
      // ninguna sesión pasa el filtro. CATHOVIA no usa contador: cuenta los
      // mensajes REALES. Es una query más por chat, pero es la verdad.
      //
      // El filtro por usuario tampoco se aplica a ciegas: si AkiraSessions no
      // tiene el campo usuarioId, .eq() devuelve 0 filas y la sidebar quedaría
      // vacía otra vez. Se intenta y se cae a sin filtrar.
      let items = [];
      if (userId) {
        try {
          const r = await wixData.query(C_SESSIONS)
            .eq(USER_FIELD, userId)
            .descending('fechaActualizacion')
            .limit(limit || 30)
            .find(AUTH);
          items = r.items || [];
        } catch (e) {
          console.warn(`${TAG} akiraListarChats: filtro por ${USER_FIELD} falló:`, e.message);
          items = [];
        }
      }
      if (items.length === 0) {
        const r2 = await wixData.query(C_SESSIONS)
          .descending('fechaActualizacion')
          .limit(limit || 30)
          .find(AUTH);
        items = r2.items || [];
        if (userId) console.log(`${TAG} akiraListarChats: sin filtro por usuario (¿falta ${USER_FIELD}?)`);
      }

      console.log(`${TAG} akiraListarChats: ${items.length} sesiones en bruto`);

      // Preview + comprobación de que la sesión tiene mensajes de verdad.
      const chatsRaw = await Promise.all(items.map(async (sesion) => {
        let preview = '';
        let hasUserMsg = false;
        try {
          const lastMsg = await wixData.query(C_MESSAGES)
            .eq('sessionRef', sesion._id)
            .eq('rol', 'user')
            .descending('orden')
            .limit(1)
            .find(AUTH);
          if (lastMsg.items.length > 0) {
            preview = (lastMsg.items[0].contenido || '').substring(0, 90);
            hasUserMsg = true;
          }
        } catch (_) { }
        return {
          id: sesion._id,
          titulo: sesion.title || 'Consulta',
          fecha: sesion.fechaActualizacion || sesion._createdDate,
          preview: preview,
          _hasUserMsg: hasUserMsg
        };
      }));

      const chats = chatsRaw
        .filter(c => c._hasUserMsg)
        .map(c => ({ id: c.id, titulo: c.titulo, fecha: c.fecha, preview: c.preview }));

      console.log(`${TAG} akiraListarChats OUT ${chats.length} conversaciones`);
      return { ok: true, chats };
    } catch (e) {
      console.error(`${TAG} akiraListarChats EXCEPTION:`, e);
      return { ok: false, error: e.message, chats: [] };
    }
  }
);

export const akiraAbrirChat = webMethod(
  Permissions.Anyone,
  async ({ sessionId }) => {
    try {
      if (!sessionId) return { ok: false, error: 'sessionId requerido' };
      const res = await wixData.query(C_MESSAGES)
        .eq('sessionRef', sessionId)
        .ascending('orden')
        .limit(200)
        .find(AUTH);
      const mensajes = (res.items || []).map(m => ({
        rol: m.rol, contenido: m.contenido, timestamp: m.timestamp
      }));
      return { ok: true, sessionId, mensajes };
    } catch (e) {
      console.error(`${TAG} akiraAbrirChat EXCEPTION:`, e);
      return { ok: false, error: e.message };
    }
  }
);

export const akiraBorrarChat = webMethod(
  Permissions.Anyone,
  async ({ sessionId, userId }) => {
    try {
      if (!sessionId) return { ok: false, error: 'sessionId requerido' };

      let sesion;
      try { sesion = await wixData.get(C_SESSIONS, sessionId, AUTH); }
      catch (_) { sesion = null; }
      if (!sesion) return { ok: true, sessionId, alreadyGone: true };

      const owner = sesion[USER_FIELD] || '';
      if (userId && owner && owner !== userId) {
        console.warn(`${TAG} ${userId} intentó borrar sesión de ${owner}`);
        return { ok: false, error: 'No tienes permiso para borrar esta conversación.' };
      }

      let borrados = 0;
      while (true) {
        const batch = await wixData.query(C_MESSAGES)
          .eq('sessionRef', sessionId).limit(50).find(AUTH);
        const items = batch.items || [];
        if (items.length === 0) break;
        await Promise.all(items.map(m => wixData.remove(C_MESSAGES, m._id, AUTH).catch(() => null)));
        borrados += items.length;
        if (items.length < 50) break;
      }
      await wixData.remove(C_SESSIONS, sessionId, AUTH);

      console.log(`${TAG} akiraBorrarChat OK: ${borrados} mensajes + sesión`);
      return { ok: true, sessionId, deletedMsgs: borrados };
    } catch (e) {
      console.error(`${TAG} akiraBorrarChat EXCEPTION:`, e);
      return { ok: false, error: 'Error técnico: ' + (e.message || 'desconocido') };
    }
  }
);