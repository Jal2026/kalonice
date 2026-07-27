// =====================================================
// KAMISUITE - Backend consoleIA.web.js
// Módulo: AKIRA Console IA — Solo lectura
// =====================================================
// VERSION: 3.5.8
// FECHA: 7 Mayo 2026
//
// CHANGELOG:
//   v3.5.8 - FIX (7 May 2026): protección contra contactId envenenado
//     del owner del sitio Wix (d23efee3-313e-4952-b081-e0b1b75a5c3a)
//     en _buscarContactIdInterno.
//
//     PROBLEMA RESUELTO:
//     Cuando AKIRA buscaba un contacto por nombre y el cliente NO
//     existía en CRM, el fallback a PaymentReservations devolvía el
//     contactId de la fila si lo tenía. Como muchas filas históricas
//     llevan el contactId envenenado del owner del sitio (d23efee3),
//     AKIRA acababa con ese ID y lo usaba para consultar Care Profile
//     (CareVisitRecord, CareMedia, ClientCareProfile filtradas por
//     contactId). Resultado potencial: AKIRA mostrando datos de Care
//     mezclados de hasta 204 clientes distintos como si fueran del
//     cliente consultado.
//
//     SOLUCIÓN:
//     Constante POISONED_CONTACT_IDS con la lista de IDs envenenados
//     conocidos. El fallback descarta cualquier match que devuelva
//     uno de esos IDs y continúa buscando otra fila válida.
//     Si todas las filas históricas del cliente tienen el envenenado,
//     devuelve null (mejor "no encontrado" que "encontrado pero
//     mostrar datos cruzados").
//
//     IMPACTO:
//     - Cero efecto en clientes con contactId real → comportamiento
//       idéntico a v3.5.7.
//     - Solo se activa cuando aparece d23efee3 → descarte silencioso.
//     - Multi-tenant: la lista es por tenant. Para nuevos salones
//       habrá que añadir su owner-id correspondiente.
//
//   v3.5.7 - FIX: fetchProductos quitado slice
//   v3.5.6 - FIX: fetchProductos filtraba DESPUÉS del slice(0,30)
//   v3.5.5 - FIX: fetchProductos usaba campo inexistente categoryName
//   v3.5.4 - FIX CRÍTICO: preProcessQuery brackets [...] strip
//   v3.5.3 - FIX: normalizeParams blindaje complemento peinado
//   v3.5.2 - FIX: fetchAgendaDia/fetchAgenda resuelven nombres genéricos
//   v3.5.1 - FIX: fechaExacta + teléfono clientes + filtro contactos
//   v3.5.0 - EGAEL: prompt dinámico desde CMS
//   v3.3.6 - Parche facturación por tipo de servicio
//   v3.3.5 - Días libres y descansos con análisis multi-día
//   v3.3.4 - FIX búsqueda de clientes + regla clasificación
//   v3.3.3 - Blindaje ECONNRESET + regla anti-reservar
//   v3.3.2 - FIX respuestas de servicios técnicos y facturación
//   v3.3.1 - callClaude con cascada Sonnet/Opus/Haiku y retry
//   v3.3.0 - EXTERNOS: solo cobrados + comisiones + datos de pago
//   v3.2.1 - FIX TIMEOUT en rangos de agenda
//   v3.2.0 - EXTRACCIÓN DE PARÁMETROS 100% JAVASCRIPT
//   v3.1.0 - Lógica determinista (empleados, fechas en JS)
//   v3.0.x - CMS capabilities, Sonnet-only
//   v2.0.x - Integración backends
//   v1.x.x - Versiones iniciales
//
// ARQUITECTURA v3.5:
//   Page code orquesta DOS webMethods secuenciales:
//   1. akiraClassify: preProcess + detectIntent(1 callClaude) + normalizeParams + executeFetch
//   2. akiraRespond: buildResponse(1 callClaude, prompt EGAEL desde CMS) + log
//
// PRINCIPIO: Sonnet interpreta lenguaje natural. JavaScript maneja datos.
// =====================================================
import { Permissions, webMethod } from 'wix-web-module';
import { elevate } from 'wix-auth';
import { extendedBookings } from 'wix-bookings.v2';
import { contacts } from 'wix-crm-backend';
import wixData from 'wix-data';
import { getSecret } from 'wix-secrets-backend';
import { fetch } from 'wix-fetch';
import { getExternosCitas } from 'backend/externosLogic.web';
import { listarProductos, obtenerHistorialVentas } from 'backend/tiendaProductos.web';
import { getActivePromotions } from 'backend/promoGiftCards.web';
import { listarServicios } from 'backend/diagnosticoServicios.web';
import { cargarTodosContactos } from 'backend/recepcionLogic.web';
import {
  getCareContactData, getCareServicios, getCareProductos, getCareExternos, getCareExpediente
} from 'backend/careProfileLogic.web';
import { buildAkiraSystemPrompt } from 'backend/akiraEntrenador.web';
import { getStaffResources } from 'backend/calendarioVista.web';
import { sessions as bookingSessions } from 'wix-bookings-backend';
const VERSION = '3.5.8';
const TAG = `[AkiraConsole][${VERSION}]`;
const MODEL_CHAIN = ['claude-sonnet-4-6', 'claude-opus-4-5', 'claude-haiku-4-5'];
const MAX_HISTORY = 10;

// ═══════════════════════════════════════════════════════════════════════════
// v3.5.8: ContactIds envenenados conocidos (owner del sitio Wix por tenant)
// ═══════════════════════════════════════════════════════════════════════════
// Wix Bookings asocia bookings al member admin del salón cuando el booking se
// crea sin contactId explícito o con uno inválido. Esto envenena las filas de
// PaymentReservations históricas. Si AKIRA cae en estas filas mientras busca
// contactId real, acaba devolviendo el ID del owner y consultando Care Profile
// con datos mezclados de cientos de clientes distintos.
//
// Esta lista es POR TENANT. Para añadir un nuevo salón, añadir su owner-id
// (visible en cualquier fila envenenada de PaymentReservations).
const POISONED_CONTACT_IDS = new Set([
  'd23efee3-313e-4952-b081-e0b1b75a5c3a' // Hair-Times — owner del sitio Wix
]);

// ═══════════════════════════════════════════════════════════════════════════
// UTILIDADES FUNDAMENTALES — Todo determinista, cero LLM
// ═══════════════════════════════════════════════════════════════════════════
const EMPLEADOS = ['Angela', 'Raquel', 'Ricardo'];
const STAFF_ALIAS = {
  'b_raquel': 'Raquel', 'raquel ht': 'Raquel', 'raquel': 'Raquel',
  'a_ricardo': 'Ricardo', 'ricardo ht': 'Ricardo', 'ricardo': 'Ricardo',
  'c_angela': 'Angela', 'angela': 'Angela'
};
function normalizarStaff(n) { return n ? (STAFF_ALIAS[n.toLowerCase().trim()] || n) : ''; }
function safeErr(e) { return { name: e?.name || 'Error', message: e?.message || String(e) }; }
function quitarAcentos(str) {
  return (str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}
function matchNombre(haystack, needle) {
  if (!haystack || !needle) return false;
  const h = quitarAcentos(haystack);
  const n = quitarAcentos(needle);
  return h.includes(n) || n.includes(h);
}
// ═══════════════════════════════════════════════════════════════════════════
// FECHAS — Todo en JavaScript, nada delegado a Sonnet
// ═══════════════════════════════════════════════════════════════════════════
function getMadridToday() {
  const now = new Date();
  return now.toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });
}
function sumarDias(fechaISO, n) {
  const d = new Date(fechaISO + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().split('T')[0];
}
function resolverFechas() {
  const hoyISO = getMadridToday();
  const hoyDate = new Date(hoyISO + 'T12:00:00Z');
  const dia = hoyDate.getUTCDay();
  const dias = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
  function proximoDia(target) {
    let diff = target - dia;
    if (diff <= 0) diff += 7;
    return sumarDias(hoyISO, diff);
  }
  const diffLun = dia === 0 ? -6 : 1 - dia;
  return {
    hoyISO, hoyNombre: dias[dia],
    manana: sumarDias(hoyISO, 1), mananaName: dias[(dia+1)%7],
    ayer: sumarDias(hoyISO, -1),
    proximoLunes: proximoDia(1), proximoMartes: proximoDia(2),
    proximoMiercoles: proximoDia(3), proximoJueves: proximoDia(4),
    proximoViernes: proximoDia(5), proximoSabado: proximoDia(6),
    estaSemanaDesde: sumarDias(hoyISO, diffLun),
    estaSemanaHasta: sumarDias(hoyISO, diffLun + 6),
    semanaSiguienteDesde: sumarDias(hoyISO, diffLun + 7),
    semanaSiguienteHasta: sumarDias(hoyISO, diffLun + 13)
  };
}
function rangoMes(year, month) {
  const desde = `${year}-${String(month).padStart(2,'0')}-01`;
  const last = new Date(year, month, 0).getDate();
  const hasta = `${year}-${String(month).padStart(2,'0')}-${String(last).padStart(2,'0')}`;
  return { desde, hasta };
}
// ═══════════════════════════════════════════════════════════════════════════
// PRE-PROCESADO DE QUERY — Motor principal v3.2
// v3.5.4: Strip enrichment brackets ANTES de extraer cualquier parámetro
// ═══════════════════════════════════════════════════════════════════════════
const STOP_WORDS = new Set([
  'dame', 'dime', 'muestra', 'muéstrame', 'mostrar', 'ver', 'buscar', 'busca',
  'quiero', 'necesito', 'consultar', 'consulta', 'enseñar', 'enseña', 'abrir',
  'abre', 'mira', 'tiene', 'tienen', 'hay', 'son', 'es', 'esta', 'está',
  'estan', 'están', 'soy', 'hacer', 'hecho', 'hizo', 'ha', 'han',
  'puedes', 'puede', 'decir', 'sabes', 'sacar', 'conseguir',
  'expediente', 'ficha', 'perfil', 'historial', 'citas', 'cita', 'reservas',
  'reserva', 'agenda', 'servicios', 'servicio', 'productos', 'producto',
  'ventas', 'venta', 'facturacion', 'facturación', 'ingresos', 'cobros',
  'disponibilidad', 'huecos', 'hueco', 'libre', 'libres',
  'promociones', 'promocion', 'promoción', 'promos', 'promo',
  'staff', 'equipo', 'empleados', 'empleado',
  'externos', 'externo', 'externa', 'externas',
  'contactos', 'contacto', 'clientes', 'cliente', 'clienta',
  'diagnostico', 'diagnóstico', 'cabello', 'pelo', 'cuidado', 'salud',
  'tratamiento', 'tratamientos', 'corte', 'color', 'tinte', 'mechas',
  'peinado', 'secado', 'lavado', 'planchado',
  'complemento', 'complementos', 'precio', 'precios', 'coste', 'costes',
  'duracion', 'duración', 'cuanto', 'cuánto', 'cuesta', 'cuestan',
  'lista', 'catalogo', 'catálogo',
  'comision', 'comisión', 'comisiones',
  'de', 'del', 'para', 'a', 'al', 'el', 'la', 'los', 'las', 'un', 'una',
  'en', 'con', 'por', 'sin', 'sobre', 'como', 'cómo', 'que', 'qué',
  'cual', 'cuál', 'cuales', 'cuáles', 'donde', 'dónde',
  'y', 'o', 'e', 'ni', 'pero', 'si', 'sí', 'no', 'ya',
  'cuantas', 'cuántas', 'cuantos', 'cuántos', 'cuanto', 'cuánto',
  'cuanta', 'cuánta', 'cuales', 'cuáles',
  'todas', 'todos', 'todo', 'toda', 'cada',
  'alguna', 'alguno', 'algunas', 'algunos',
  'sus', 'su', 'mi', 'mis', 'tu', 'tus', 'nuestro', 'nuestra',
  'hoy', 'mañana', 'ayer', 'anteayer',
  'lunes', 'martes', 'miercoles', 'miércoles', 'jueves', 'viernes',
  'sabado', 'sábado', 'domingo',
  'semana', 'siguiente', 'proxima', 'próxima', 'proximo', 'próximo',
  'pasada', 'pasado', 'anterior', 'actual',
  'mes', 'año', 'dia', 'día', 'dias', 'días', 'fecha',
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
  'historico', 'histórico',
  'angela', 'ángela', 'raquel', 'ricardo',
  'info', 'información', 'informacion', 'datos', 'detalle', 'detalles',
  'completo', 'completa', 'total', 'general', 'resumen',
  'ultimo', 'última', 'ultimo', 'últimos', 'últimas', 'primero', 'primera',
  'mas', 'más', 'menos', 'mejor', 'peor',
  'por', 'favor', 'gracias', 'porfa', 'porfavor', 'please',
  'le', 'se', 'me', 'te', 'nos', 'lo', 'les',
  'este', 'esta', 'estos', 'estas', 'ese', 'esa', 'esos', 'esas',
  'cual', 'como', 'cuando', 'cuándo',
  'nombre', 'nombres', 'llame', 'llamen', 'llamado', 'llamada', 'llaman', 'llama',
  'apellido', 'apellidos', 'apellidan',
  'hairtimes', 'hair-times', 'hair', 'times'
]);
const MESES = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12
};
function preProcessQuery(query) {
  const rawInput = query.trim();
  const original = rawInput.replace(/\[[^\]]*\]\s*/g, '').trim();
  const q = original.toLowerCase();
  const hints = {
    empleadoSelf: null,
    nombreCliente: null,
    emailDetectado: null,
    telefonoDetectado: null,
    mesDetectado: null,
    preguntaDiaLibre: false,
    empleadoMencionado: null,
    fechaExacta: null,
    fechaExacta2: null,
    queryOriginal: original
  };
  const soyMatch = q.match(/\bsoy\s+(angela|ángela|raquel|ricardo)\b/i);
  if (soyMatch) {
    const raw = soyMatch[1].replace('á', 'a');
    hints.empleadoSelf = raw.charAt(0).toUpperCase() + raw.slice(1);
  }
  const emailMatch = original.match(/[\w.\-+]+@[\w.\-]+\.\w+/);
  if (emailMatch) hints.emailDetectado = emailMatch[0];
  const telMatch = original.match(/\b(\+?\d[\d\s\-]{6,})\b/);
  if (telMatch) hints.telefonoDetectado = telMatch[1].replace(/\s/g, '');
  for (const [nombre, num] of Object.entries(MESES)) {
    if (q.includes(nombre)) {
      const yearMatch = q.match(/\b(20\d{2})\b/);
      const year = yearMatch ? parseInt(yearMatch[1]) : parseInt(getMadridToday().split('-')[0]);
      hints.mesDetectado = { year, month: num };
      break;
    }
  }
  const diaEnMesRegex = /\b(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b/gi;
  const diaEnMesMatches = [...q.matchAll(diaEnMesRegex)];
  if (diaEnMesMatches.length > 0) {
    const yearMatch2 = q.match(/\b(20\d{2})\b/);
    const yearVal = yearMatch2 ? parseInt(yearMatch2[1]) : parseInt(getMadridToday().split('-')[0]);
    for (let i = 0; i < Math.min(diaEnMesMatches.length, 2); i++) {
      const diaNum = parseInt(diaEnMesMatches[i][1]);
      const mesNum = MESES[diaEnMesMatches[i][2].toLowerCase()];
      if (diaNum >= 1 && diaNum <= 31 && mesNum) {
        const fechaISO = `${yearVal}-${String(mesNum).padStart(2,'0')}-${String(diaNum).padStart(2,'0')}`;
        if (i === 0) {
          hints.fechaExacta = fechaISO;
          console.log(`${TAG} Fecha exacta 1: ${fechaISO}`);
        } else {
          hints.fechaExacta2 = fechaISO;
          console.log(`${TAG} Fecha exacta 2: ${fechaISO}`);
        }
      }
    }
  }
  hints.nombreCliente = extractClientName(original, q);
  const diaLibreRegex = /\b(d[ií]a\s+libre|d[ií]as\s+libres|d[ií]a\s+de\s+descanso|d[ií]as\s+de\s+descanso|libra\b|librar\b|libran\b|descansa\b|descansan\b|pr[oó]ximo\s+libre|sin\s+citas|descanso\s+de|cu[aá]ndo\s+libra|cu[aá]ndo\s+descansa|no\s+trabaja|no\s+trabajan|d[ií]as?\s+que\s+no)/i;
  if (diaLibreRegex.test(original)) {
    hints.preguntaDiaLibre = true;
  }
  for (const emp of EMPLEADOS) {
    const empRegex = new RegExp(`\\b${emp}\\b`, 'i');
    if (empRegex.test(original)) {
      hints.empleadoMencionado = emp;
      break;
    }
  }
  console.log(`${TAG} preProcess: emp=${hints.empleadoSelf || '-'} empMenc=${hints.empleadoMencionado || '-'} nombre="${hints.nombreCliente || '-'}" mes=${hints.mesDetectado ? `${hints.mesDetectado.month}/${hints.mesDetectado.year}` : '-'} diaLibre=${hints.preguntaDiaLibre} email=${hints.emailDetectado || '-'} tel=${hints.telefonoDetectado || '-'} fechaExacta=${hints.fechaExacta || '-'}`);
  return hints;
}
function extractClientName(original, qLower) {
  const cleaned = original.replace(/[?¿!¡.,;:()]/g, ' ').replace(/\s+/g, ' ').trim();
  const patterns = [
    /(?:expediente|ficha|perfil|historial|citas?|reservas?|diagn[oó]stic\w*|cabello|pelo|cuidado|salud|info|datos)\s+(?:de|del)\s+(.+)/i,
    /(?:buscar|busca|encontrar|localizar)\s+(?:a\s+)?(.+)/i,
    /(?:cliente|clienta)\s+(.+)/i,
  ];
  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (match && match[1]) {
      let candidate = match[1].trim();
      candidate = candidate.replace(/\s+(?:hoy|mañana|ayer|esta semana|la semana|el lunes|el martes|el miércoles|el jueves|el viernes|el sábado|en enero|en febrero|en marzo|en abril|en mayo|en junio|en julio|en agosto|en septiembre|en octubre|en noviembre|en diciembre|desde|hasta|para el|del día|de hoy|de mañana|tiene|tienen|ha |han ).*$/i, '').trim();
      candidate = candidate.replace(/[?¿!¡.,;:]+$/, '').trim();
      const candidateWords = candidate.split(/\s+/).filter(w => {
        const wLower = w.toLowerCase();
        const wClean = quitarAcentos(w);
        if (STOP_WORDS.has(wLower)) return false;
        if (STOP_WORDS.has(wClean)) return false;
        if (EMPLEADOS.some(e => quitarAcentos(e) === wClean)) return false;
        if (/^\d+$/.test(w)) return false;
        return true;
      });
      candidate = candidateWords.join(' ').trim();
      if (EMPLEADOS.some(e => quitarAcentos(e) === quitarAcentos(candidate))) continue;
      if (STOP_WORDS.has(candidate.toLowerCase())) continue;
      if (candidate.length >= 2) return candidate;
    }
  }
  const clientContextWords = /\b(expediente|ficha|perfil|historial|citas?|reservas?|diagn|cuidado|salud|buscar?|cliente|clienta|tiene cita|ha venido|vino|viene)\b/i;
  if (!clientContextWords.test(qLower)) return null;
  const words = cleaned.split(/\s+/);
  const remaining = [];
  for (const word of words) {
    const wLower = word.toLowerCase();
    const wClean = quitarAcentos(word);
    if (STOP_WORDS.has(wLower)) continue;
    if (STOP_WORDS.has(wClean)) continue;
    if (EMPLEADOS.some(e => quitarAcentos(e) === wClean)) continue;
    if (word.includes('@')) continue;
    if (/^\d+$/.test(word)) continue;
    if (/^20\d{2}$/.test(word)) continue;
    remaining.push(word);
  }
  if (remaining.length >= 1 && remaining.length <= 4) {
    const name = remaining.join(' ').trim();
    if (name.length >= 2) return name;
  }
  return null;
}
// ═══════════════════════════════════════════════════════════════════════════
// NORMALIZACIÓN DE PARAMS — JavaScript corrige TODO, prioriza hints JS
// ═══════════════════════════════════════════════════════════════════════════
function normalizeParams(categoria, params, hints, fechas) {
  const p = { ...(params || {}) };
  if (hints.fechaExacta) {
    p.fechaISO = hints.fechaExacta;
    if (hints.fechaExacta2 && categoria === 'mover') {
      p.nuevaFechaISO = hints.fechaExacta2;
    }
    if (categoria === 'mover' && !p.nuevaFechaISO && !p.nuevaFecha) {
      p.nuevaFechaISO = hints.fechaExacta;
    }
  }
  if (hints.nombreCliente) {
    if (['cuidadoysalud', 'cliente', 'contactos'].includes(categoria)) {
      if (p.nombre && p.nombre !== hints.nombreCliente) {
        console.log(`${TAG} OVERRIDE nombre: Sonnet="${p.nombre}" → JS="${hints.nombreCliente}"`);
      }
      p.nombre = hints.nombreCliente;
    }
  }
  if (!p.nombre && ['cuidadoysalud', 'cliente'].includes(categoria)) {
    p.queryOriginal = hints.queryOriginal;
  }
  if (hints.emailDetectado) p.email = hints.emailDetectado;
  if (hints.telefonoDetectado) p.telefono = hints.telefonoDetectado;
  if (!p.fechaISO && p.fechaDesde) p.fechaISO = p.fechaDesde;
  if (!p.fechaISO && p.fecha) p.fechaISO = p.fecha;
  if (hints.mesDetectado && !p.rangoDesde) {
    const { year, month } = hints.mesDetectado;
    const rango = rangoMes(year, month);
    p.rangoDesde = rango.desde;
    p.rangoHasta = rango.hasta;
    if (!p.fechaISO) p.fechaISO = rango.desde;
    if (categoria === 'facturacion') {
      p.fechaDesde = rango.desde;
      p.fechaHasta = rango.hasta;
    }
    console.log(`${TAG} Mes detectado: ${month}/${year} → ${rango.desde} a ${rango.hasta}`);
  }
  if (hints.empleadoSelf && (categoria === 'agenda' || categoria === 'disponibilidad')) {
    if (!p.empleado) p.empleado = hints.empleadoSelf;
  }
  if (hints.empleadoMencionado && (categoria === 'agenda' || categoria === 'disponibilidad')) {
    if (!p.empleado) p.empleado = hints.empleadoMencionado;
  }
  if (p.empleado) {
    const empLower = p.empleado.toLowerCase();
    const match = EMPLEADOS.find(e => e.toLowerCase() === empLower);
    if (match) p.empleado = match;
  }
  if (p.fechaDesde && p.fechaHasta && !p.rangoDesde) {
    p.rangoDesde = p.fechaDesde;
    p.rangoHasta = p.fechaHasta;
    if (!p.fechaISO) p.fechaISO = p.fechaDesde;
  }
  if (hints.preguntaDiaLibre && categoria === 'agenda' && !p.rangoDesde && !p.fechaDesde) {
    p.rangoDesde = fechas.hoyISO;
    p.rangoHasta = sumarDias(fechas.hoyISO, 14);
    p.preguntaDiaLibre = true;
    console.log(`${TAG} Día libre detectado: rango auto ${p.rangoDesde} → ${p.rangoHasta}`);
  }
  const rangoEsHistorico = p.rango === 'historico' || p.rango === 'todo';
  if ((categoria === 'agenda' || categoria === 'disponibilidad' || categoria === 'externos') && !p.fechaISO && !p.rangoDesde && !rangoEsHistorico) {
    p.fechaISO = fechas.hoyISO;
  }
  if (categoria === 'facturacion') {
    if (!p.fechaDesde) p.fechaDesde = p.fechaISO || fechas.hoyISO;
    if (!p.fechaHasta) p.fechaHasta = p.fechaDesde;
  }
  if (categoria === 'reserva_color' && !p.servicio && !p.serviceName) {
    const qColor = (hints.queryOriginal || '').toLowerCase();
    if (qColor.includes('tinte vegetal')) p.servicio = 'Tinte Vegetal';
    else if (qColor.includes('tinte hombre')) p.servicio = 'Tinte Hombre';
    else if (qColor.includes('tinte')) p.servicio = 'Tinte';
    else if (qColor.includes('mechas')) p.servicio = 'Mechas';
    if (p.servicio) console.log(`${TAG} reserva_color servicio fallback JS: "${p.servicio}"`);
  }
  if (categoria === 'reserva_color') {
    const qColor2 = (hints.queryOriginal || '').toLowerCase();
    if (!p.corte && /(\+\s*corte|\bcon corte\b|\by corte\b)/.test(qColor2)) {
      p.corte = true;
      console.log(`${TAG} reserva_color: corte=true (JS)`);
    }
    if (!p.totalChecked && /\bcompleto\b|\bcompleta\b/.test(qColor2)) {
      p.totalChecked = true;
      console.log(`${TAG} reserva_color: totalChecked=true (JS)`);
    }
    if (!p.peinadoValue) {
      if (/peinado\s*xl|\bpeinado extralargo\b/.test(qColor2)) p.peinadoValue = 'XL';
      else if (/peinado\s+l\b|\bpeinado largo\b/.test(qColor2)) p.peinadoValue = 'L';
      else if (/peinado\s+s\b|\bpeinado corto\b/.test(qColor2)) p.peinadoValue = 'S';
      else if (/peinado\s+m\b|\bpeinado medio\b/.test(qColor2)) p.peinadoValue = 'M';
      else if (/\+\s*peinado\b|\bcon peinado\b|\by peinado\b/.test(qColor2)) p.peinadoValue = 'M';
      if (p.peinadoValue) console.log(`${TAG} reserva_color: peinado=${p.peinadoValue} (JS)`);
    }
    if (!p.tratamientoValue) {
      if (/kerastase|kerast/.test(qColor2)) p.tratamientoValue = 'KERASTASE';
      else if (/hairtimes|hair.?times/.test(qColor2)) p.tratamientoValue = 'HAIRTIMES';
      else if (/\bmatiz\b/.test(qColor2)) p.tratamientoValue = 'MATIZ';
      if (p.tratamientoValue) console.log(`${TAG} reserva_color: tratamiento=${p.tratamientoValue} (JS)`);
    }
  }
  if (categoria === 'complemento' && p.complemento) {
    const busqComp = quitarAcentos(p.complemento);
    if (busqComp.includes('peinado')) {
      const qComp = quitarAcentos(hints.queryOriginal || '');
      if (/peinado\s*xl|\bextralargo\b/.test(qComp)) p.complemento = 'peinado XL';
      else if (/peinado\s+l\b|\blargo\b/.test(qComp)) p.complemento = 'peinado L';
      else if (/peinado\s+s\b|\bcorto\b/.test(qComp)) p.complemento = 'peinado S';
      else if (/peinado\s+m\b|\bmedio\b/.test(qComp)) p.complemento = 'peinado M';
      console.log(`${TAG} complemento peinado blindaje: "${p.complemento}" (JS)`);
    }
  }
  console.log(`${TAG} normalizeParams: ${JSON.stringify(p)}`);
  return p;
}
// ═══════════════════════════════════════════════════════════════════════════
// BUSCAR CONTACTO — Fuzzy, sin acentos, en CRM + PaymentReservations
// ═══════════════════════════════════════════════════════════════════════════
async function buscarContactId(busqueda, queryOriginal) {
  if (busqueda) {
    const result = await _buscarContactIdInterno(busqueda.trim());
    if (result) return result;
  }
  if (queryOriginal && queryOriginal !== busqueda) {
    console.log(`${TAG} buscarContactId fallback con queryOriginal: "${queryOriginal}"`);
    const mayusculas = queryOriginal.match(/[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)*/g);
    if (mayusculas) {
      for (const candidato of mayusculas) {
        if (EMPLEADOS.some(e => quitarAcentos(e) === quitarAcentos(candidato))) continue;
        const result = await _buscarContactIdInterno(candidato);
        if (result) return result;
      }
    }
  }
  console.log(`${TAG} buscarContactId → no encontrado`);
  return null;
}
async function _buscarContactIdInterno(b) {
  console.log(`${TAG} _buscarContactIdInterno: "${b}"`);
  const esEmail = b.includes('@');
  const esTelefono = /^\+?\d[\d\s\-]{6,}$/.test(b);
  try {
    const todosRaw = await cargarTodosContactos();
    const todos = todosRaw?.clientes || [];
    const matches = todos.filter(c => {
      if (esEmail) return (c.email || '').toLowerCase() === b.toLowerCase();
      if (esTelefono) return (c.telefono || '').replace(/\s/g, '').includes(b.replace(/\s/g, ''));
      return matchNombre(c.nombreCompleto, b);
    });
    console.log(`${TAG} → CRM matches: ${matches.length} para "${b}"`);
    if (matches.length === 1) return matches[0].contactId;
    if (matches.length > 1) {
      for (const m of matches) {
        try {
          const careCheck = await wixData.query('CareVisitRecord')
            .eq('contactId', m.contactId).limit(1).find({ suppressAuth: true });
          if (careCheck?.items?.length > 0) {
            console.log(`${TAG} → CRM con Care data: ${m.contactId} (${m.nombreCompleto})`);
            return m.contactId;
          }
        } catch (_) {}
      }
      console.log(`${TAG} → Ninguno tiene Care data, usando primero: ${matches[0].contactId}`);
      return matches[0].contactId;
    }
  } catch (e) { console.warn(`${TAG} CRM search error:`, e.message); }
  if (!esEmail && !esTelefono) {
    try {
      const pagos = await wixData.query('PaymentReservations').limit(500).find({ suppressAuth: true });
      // ═══ v3.5.8: filtrar contactIds envenenados (owner del sitio Wix) ═══
      // Antes: devolvíamos cualquier contactId no vacío del primer match.
      // Ahora: descartamos los IDs envenenados conocidos. Si todos los matches
      // son envenenados, devolvemos null en lugar de propagar el ID al
      // resto del flujo (que lo usaría para Care Profile y mezclaría datos
      // de cientos de clientes distintos).
      const matchesValidos = (pagos?.items || []).filter(r =>
        r.contactId &&
        !POISONED_CONTACT_IDS.has(r.contactId) &&
        matchNombre(r.nombreCliente, b)
      );
      if (matchesValidos.length > 0) {
        const cidValido = matchesValidos[0].contactId;
        console.log(`${TAG} → PaymentReservations: ${cidValido}`);
        return cidValido;
      }
      // Diagnóstico: si encontramos matches pero TODOS estaban envenenados, lo logueamos
      const matchesConEnvenenado = (pagos?.items || []).filter(r =>
        r.contactId && matchNombre(r.nombreCliente, b)
      );
      if (matchesConEnvenenado.length > 0) {
        console.log(`${TAG} → PaymentReservations: ${matchesConEnvenenado.length} matches descartados (todos con contactId envenenado del owner)`);
      }
    } catch (e) {}
  }
  return null;
}
// ═══════════════════════════════════════════════════════════════════════════
// CACHÉ CAPABILITIES
// ═══════════════════════════════════════════════════════════════════════════
let cachedCapabilities = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000;
async function getCapabilities() {
  const now = Date.now();
  if (cachedCapabilities && (now - cacheTimestamp) < CACHE_TTL) return cachedCapabilities;
  console.log(`${TAG} Leyendo AkiraCapabilities...`);
  const result = await wixData.query('AkiraCapabilities')
    .eq('activo', true).ascending('orden').limit(50).find({ suppressAuth: true });
  cachedCapabilities = (result?.items || []).map(item => ({
    categoria: item.categoria || '', descripcion: item.descripcion || '',
    backend: item.backend || '', funcion: item.funcion || '',
    parametros: item.parametros || '{}', ejemplos: item.ejemplosPreguntas || '',
    fetchDirecto: item.fetchDirecto || false, notas: item.notasInternas || ''
  }));
  console.log(`${TAG} ${cachedCapabilities.length} capabilities cargadas`);
  cacheTimestamp = now;
  return cachedCapabilities;
}
function buildCategoriesPrompt(capabilities) {
  return capabilities.map(cap => {
    const ejs = cap.ejemplos.split('|').slice(0, 4).join(', ');
    const params = cap.parametros && cap.parametros !== '{}' ? `\n  Params a extraer: ${cap.parametros}` : '';
    return `"${cap.categoria}" — ${cap.descripcion}${params}\n  Ejemplos: ${ejs}`;
  }).join('\n\n');
}
// ═══════════════════════════════════════════════════════════════════════════
// CLAUDE API
// ═══════════════════════════════════════════════════════════════════════════
async function callClaude(systemPrompt, userMessage, maxTokens = 600) {
  const apiKey = await getSecret('KAMISUITE');
  const headers = { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' };
  let lastErr = 'sin respuesta';
  for (let m = 0; m < MODEL_CHAIN.length; m++) {
    const model = MODEL_CHAIN[m];
    const body = JSON.stringify({ model, max_tokens: maxTokens, system: systemPrompt, messages: [{ role: 'user', content: userMessage }] });
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers, body });
        const data = await response.json();
        if (response.ok && data?.content?.[0]?.text) {
          if (m > 0 || attempt > 0) console.log(`${TAG} callClaude OK con ${model} (intento ${attempt + 1})`);
          return data.content[0].text;
        }
        const status = response.status;
        const apiMsg = data?.error?.message || `HTTP ${status}`;
        lastErr = `${model}: ${apiMsg}`;
        console.warn(`${TAG} callClaude fallo ${model} intento ${attempt + 1}: ${apiMsg}`);
        const transient = (status === 529 || status === 503 || status === 429 || status === 500 || status === 502);
        if (!transient) break;
        if (attempt < 2) {
          const waitMs = Math.pow(2, attempt) * 1000 + Math.floor(Math.random() * 400);
          await new Promise(r => setTimeout(r, waitMs));
        }
      } catch (e) {
        lastErr = `${model}: ${e.message}`;
        console.warn(`${TAG} callClaude exception ${model}:`, e.message);
        const msg = (e.message || '').toLowerCase();
        const transientNet = msg.includes('econnreset') || msg.includes('etimedout')
          || msg.includes('socket hang up') || msg.includes('network')
          || msg.includes('fetch failed') || msg.includes('enotfound');
        if (!transientNet) break;
        if (attempt < 2) {
          const waitMs = Math.pow(2, attempt) * 1000 + Math.floor(Math.random() * 400);
          await new Promise(r => setTimeout(r, waitMs));
        }
      }
    }
  }
  throw new Error(`Claude API (todos los modelos fallaron): ${lastErr}`);
}
function formatHistory(history) {
  if (!history?.length) return '';
  return history.slice(-MAX_HISTORY).map(msg => {
    const role = msg.role === 'user' ? 'USUARIO' : 'AKIRA';
    const text = msg.role === 'assistant' && msg.text.length > 300 ? msg.text.substring(0, 300) + '...' : msg.text;
    return `${role}: ${text}`;
  }).join('\n');
}
// ═══════════════════════════════════════════════════════════════════════════
// PASO 1: DETECTAR INTENCIÓN
// ═══════════════════════════════════════════════════════════════════════════
async function detectIntent(query, history, capabilities, fechas) {
  const historyBlock = formatHistory(history);
  const historySection = historyBlock ? `\nCONVERSACIÓN PREVIA:\n${historyBlock}\n` : '';
  const categoriesBlock = buildCategoriesPrompt(capabilities);
  const systemPrompt = `Clasificador AKIRA. Responde SOLO JSON, sin backticks.
HOY: ${fechas.hoyNombre} ${fechas.hoyISO}
FECHAS (COPIA de aquí, NO calcules):
hoy=${fechas.hoyISO} | mañana=${fechas.manana} | ayer=${fechas.ayer}
próximo lunes=${fechas.proximoLunes} | martes=${fechas.proximoMartes} | miércoles=${fechas.proximoMiercoles}
jueves=${fechas.proximoJueves} | viernes=${fechas.proximoViernes} | sábado=${fechas.proximoSabado}
esta semana=${fechas.estaSemanaDesde} a ${fechas.estaSemanaHasta}
semana que viene=${fechas.semanaSiguienteDesde} a ${fechas.semanaSiguienteHasta}
CATEGORÍAS:
${categoriesBlock}
"desconocida" — Si NO encaja en ninguna.
REGLAS:
- JSON con: { "categoria": "...", "params": { ... } }
- AKIRA es herramienta INTERNA del salón. Empleados: Angela, Raquel, Ricardo.
- REGLA CRÍTICA — preguntas por tipo de servicio realizado: "servicios de color/tinte/mechas/corte/tratamiento/kerastase/nanoplastia/botox + EN [mes/semana/hoy/ayer]" o "qué empleado ha hecho más [tipo] este mes/semana" o "cuánto hemos ingresado/facturado/hecho en [tipo]" → SIEMPRE "facturacion" con el rango del periodo (si no especifican, el mes actual). NUNCA "agenda" (agenda solo tiene títulos genéricos tipo "Servicio"). NUNCA "servicios" (servicios es catálogo estático). El detalle real de qué se hizo está en facturación.
- REGLA CRÍTICA — preguntas sobre DÍAS LIBRES / DESCANSO / LIBRAR: "cuándo libra X", "próximo día libre de X", "días de descanso de X", "cuándo descansa X", "qué días no trabaja X" → SIEMPRE "agenda" con params.empleado=X. El JS añadirá automáticamente un rango de 14 días y el flag preguntaDiaLibre. NO uses categoría "staff" (staff solo devuelve el día de hoy).
- "Soy Ricardo" + pregunta sobre reservas → agenda con empleado "Ricardo"
- "ingresos"/"facturación"/"cobros" → "facturacion" (dinero cobrado)
- "reservas"/"citas"/"agenda" → "agenda" (calendario)
- Para un mes entero: params.fechaDesde="YYYY-MM-01", params.fechaHasta="YYYY-MM-DD"(último día)
- Para un cliente por nombre → "cliente" con params.nombre (COPIA EL NOMBRE TAL CUAL, no lo modifiques ni acortes)
- Para cuidado/diagnóstico/cabello/expediente → "cuidadoysalud" con params.nombre (COPIA TAL CUAL)
- IMPORTANTE: los nombres de personas SIEMPRE se copian LITERALMENTE del texto, NUNCA se abrevian ni modifican
- "citas de externos"/"servicios externos"/"Emy"/"comisiones externos"/"comisión hairtimes externos" → "externos"
  Si piden "todo el histórico"/"todas las citas"/"completo" → params.rango="historico"
  Si piden un mes → params con fechaDesde/fechaHasta del mes
  Si piden una semana → params.rango="semana"
  Si piden comisiones → params.incluirComisiones=true
- REGLA CRÍTICA ACCIONES: para cancelar, mover, reserva, reserva_color, bloqueo, complemento y eliminar_complemento, TODOS los params deben venir de la frase ACTUAL del usuario. NUNCA inferir empleado, cliente ni hora de mensajes anteriores del historial ni de "soy X". Si el usuario no lo dice en ESTA frase, NO lo pongas.
- REGLA CANCELAR: "cancela/quita/borra/elimina la cita/reserva" → "cancelar" con params.cliente (nombre del cliente TAL CUAL), params.empleado, params.fechaISO (fecha YYYY-MM-DD), params.hora (HH:mm). Copia SOLO los datos que mencione el usuario EN ESTA FRASE.
- REGLA AÑADIR COMPLEMENTO (verbo: AÑADE/PON/AGREGA/METE): "añade corte a la cita", "pon peinado", "agrega tratamiento" → "complemento" con params.complemento, params.cliente, params.fechaISO, params.empleado (opcional), params.hora (opcional). El verbo AÑADIR/PONER/AGREGAR siempre es "complemento". IMPORTANTE: params.complemento debe copiar LITERALMENTE lo que el usuario pidió, incluyendo talla si la mencionó ("peinado L", "peinado XL", "peinado corto"). NUNCA simplificar "peinado L" a "peinado".
- REGLA ELIMINAR COMPLEMENTO (verbo: ELIMINA/QUITA/BORRA/SACA + complemento DE la cita): "elimina el corte de la cita", "quita el peinado de la reserva", "saca el tratamiento" → "eliminar_complemento" con params.complemento, params.cliente, params.fechaISO, params.empleado (opcional), params.hora (opcional). El verbo ELIMINAR/QUITAR/BORRAR referido a UN servicio dentro de una cita siempre es "eliminar_complemento". NUNCA "cancelar" (cancelar es para la cita ENTERA).
- REGLA CRÍTICA ACCIONES SIN CONTEXTO PREVIO: para cancelar, mover, reserva, reserva_color, bloqueo, complemento y eliminar_complemento, NUNCA inferir params.empleado de "soy X" ni de mensajes anteriores del historial. El empleado SOLO se pone si está EXPLÍCITAMENTE mencionado en la consulta ACTUAL. Si no nombra empleado EN ESTA FRASE, NO pongas params.empleado.
- REGLA MOVER/REASIGNAR: "mueve/cambia/pasa/reasigna la cita" → "mover". Params: params.cliente (TAL CUAL, si lo dice), params.empleado (empleado ACTUAL, solo si lo dice explícitamente), params.fechaISO (fecha ORIGINAL YYYY-MM-DD), params.hora (hora ORIGINAL — SOLO si dice "la cita DE las X" o "la DE las X"), params.nuevaHora (hora DESTINO — cuando dice "A las X" después de la fecha: "mueve la cita del 2 de junio A las 16" → nuevaHora="16:00", NO hora), params.nuevaFechaISO (nueva fecha si cambia de día), params.nuevoEmpleado (empleado DESTINO: "a Raquel", "con Angela", "asigna a Ricardo"). CLAVE PARA DISTINGUIR HORAS: "la cita DE las 10" = hora original (params.hora). "mueve A las 16" / "cámbiala A las 17" = hora destino (params.nuevaHora). Si solo hay UNA hora con "a las", es SIEMPRE nuevaHora (destino). "de las X a las Y": X=params.hora, Y=params.nuevaHora. "del [fecha1] al [fecha2]": fecha1=params.fechaISO, fecha2=params.nuevaFechaISO. "misma hora" → NO pongas nuevaHora. "mismo día" → NO pongas nuevaFechaISO. "las cuatro"→"16:00". Si NO mencionan cliente, NO inventes uno.
- REGLA BLOQUEO — SINÓNIMOS Y TRAMOS: "pon libre a X", "día libre para X", "libre el viernes", "que no trabaje X", "X no viene el lunes" → SIEMPRE "bloqueo" con params.empleado y params.fechaISO. NUNCA "disponibilidad". "Libre" en contexto de ACCIÓN = bloquear calendario. Si piden bloquear un TRAMO HORARIO ("bloquea a Ricardo de 11 a 13", "pon libre a Angela de 14 a 16"): params.horaInicio="HH:mm" y params.horaFin="HH:mm". Si NO mencionan tramo, es día completo (no pongas horaInicio/horaFin).
- REGLA ELIMINAR BLOQUEO: "quita el bloqueo de X", "elimina el bloqueo", "desbloquea a X", "quita el libre de X" → "eliminar_bloqueo" con params.empleado y params.fechaISO. Si mencionan hora ("de 11 a 12", "a las 11"): params.horaInicio="HH:mm". NUNCA "cancelar" (cancelar es para citas de clientes, no para bloqueos).
- REGLA CAMBIAR SERVICIO: "cambia el tinte por mechas", "cambia el servicio de la cita", "en vez de tinte vegetal pon tinte normal" → "cambiar_servicio". Params: params.cliente, params.empleado, params.fechaISO, params.hora (de la cita existente), params.nuevoServicio (el servicio nuevo), params.familiaServicio ("coloracion" si es tinte/mechas/tinte vegetal/tinte hombre, "simple" si es corte/peinado/etc), más los extras del nuevo servicio: params.corte, params.totalChecked, params.peinadoValue, params.tratamientoValue, params.longitudPelo. Se cancelará la cita y se recreará con el nuevo servicio.`;
  const userMessage = historySection ? `${historySection}\nCONSULTA: ${query}` : query;
  try {
    let raw = await callClaude(systemPrompt, userMessage, 250);
    raw = raw.trim();
    const fb = raw.indexOf('{'), lb = raw.lastIndexOf('}');
    if (fb === -1 || lb <= fb) throw new Error(`No JSON: ${raw.substring(0, 80)}`);
    const parsed = JSON.parse(raw.substring(fb, lb + 1));
    console.log(`${TAG} Intent:`, JSON.stringify(parsed));
    return parsed;
  } catch (e) {
    console.warn(`${TAG} Intent fallback:`, e.message);
    return { categoria: 'desconocida', params: {} };
  }
}
// ═══════════════════════════════════════════════════════════════════════════
// FETCH FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════
const SERVICIOS_TECNICOS = new Set(['Lavado', 'Secado', 'Proceso']);
const GAP_MS = 90 * 60 * 1000;
async function fetchAgenda(params) {
  const { empleado, fechaISO, rangoDesde, rangoHasta } = params;
  if (rangoDesde && rangoHasta && rangoDesde !== rangoHasta) {
    console.log(`${TAG} fetchAgenda RANGO ÚNICO: ${rangoDesde} → ${rangoHasta}`);
    const elevatedQuery = elevate(extendedBookings.queryExtendedBookings);
    let allBookings = [], offset = 0, hasMore = true;
    while (hasMore && offset < 1000) {
      const result = await elevatedQuery({
        filter: { $and: [
          { startDate: { $gte: `${rangoDesde}T00:00:00.000Z` } },
          { startDate: { $lte: `${rangoHasta}T23:59:59.999Z` } }
        ]},
        paging: { limit: 100, offset }
      });
      const items = result?.extendedBookings || [];
      allBookings = allBookings.concat(items);
      hasMore = items.length === 100;
      offset += 100;
    }
    let confirmados = allBookings.filter(item => item.booking?.status === 'CONFIRMED');
    if (empleado) {
      const empNorm = empleado.toLowerCase();
      confirmados = confirmados.filter(item => {
        const sn = normalizarStaff(item.booking?.bookedEntity?.slot?.resource?.name || '').toLowerCase();
        return sn.includes(empNorm) || empNorm.includes(sn);
      });
    }
    let svcMapR = {};
    try {
      const svcResultR = await listarServicios();
      if (svcResultR?.ok && svcResultR.servicios) {
        for (const s of svcResultR.servicios) {
          if (s.id && s.name) svcMapR[s.id] = s.name;
        }
      }
    } catch (_) {}
    const raw = confirmados.map(item => {
      const bk = item.booking, slot = bk?.bookedEntity?.slot || {}, ct = bk?.contactDetails || {};
      const startD = slot.startDate ? new Date(slot.startDate) : null;
      const rawTitle = slot.title || bk?.title || '';
      const esGenerico = !rawTitle || rawTitle === 'Servicio' || rawTitle === 'Service';
      const servicioNombre = esGenerico ? (svcMapR[slot.serviceId] || rawTitle || 'Servicio') : rawTitle;
      return {
        fecha: startD ? startD.toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' }) : rangoDesde,
        hora: startD ? startD.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' }) : '??:??',
        horaFin: slot.endDate ? new Date(slot.endDate).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' }) : '',
        startMs: startD ? startD.getTime() : 0,
        endMs: slot.endDate ? new Date(slot.endDate).getTime() : 0,
        cliente: `${ct.firstName || ''} ${ct.lastName || ''}`.trim() || 'Sin nombre',
        servicio: servicioNombre,
        empleado: normalizarStaff(slot.resource?.name || ''),
        esTecnico: SERVICIOS_TECNICOS.has(servicioNombre.split(' ')[0])
      };
    }).sort((a, b) => a.startMs - b.startMs);
    const grupos = [];
    raw.forEach(r => {
      const g = grupos.find(g => g.fecha === r.fecha && g.cliente === r.cliente && Math.abs(r.startMs - g.lastEndMs) <= GAP_MS);
      if (g) {
        if (!r.esTecnico) g.servicios.push(r.servicio);
        if (r.endMs > g.lastEndMs) g.lastEndMs = r.endMs;
        g.horaFin = r.horaFin;
      } else {
        grupos.push({ fecha: r.fecha, cliente: r.cliente, hora: r.hora, horaFin: r.horaFin,
          empleado: r.empleado, servicios: r.esTecnico ? [] : [r.servicio], lastEndMs: r.endMs });
      }
    });
    const reservas = grupos.map(g => ({
      fecha: g.fecha, hora: g.hora, horaFin: g.horaFin, cliente: g.cliente,
      servicios: g.servicios.length > 0 ? g.servicios.join(', ') : 'Servicios técnicos',
      empleado: g.empleado
    }));
    console.log(`${TAG} fetchAgenda RANGO: ${reservas.length} citas (1 query, ${allBookings.length} bookings raw)`);
    return { reservas, rangoDesde, rangoHasta, empleadoFiltro: empleado || null, totalCitas: reservas.length };
  }
  const result = await fetchAgendaDia(fechaISO || getMadridToday(), empleado);
  return result;
}
async function fetchAgendaDia(fecha, empleado) {
  console.log(`${TAG} fetchAgendaDia: ${fecha} emp=${empleado || 'todos'}`);
  const elevatedQuery = elevate(extendedBookings.queryExtendedBookings);
  let allBookings = [], offset = 0, hasMore = true;
  while (hasMore && offset < 500) {
    const result = await elevatedQuery({
      filter: { $and: [{ startDate: { $gte: `${fecha}T00:00:00.000Z` } }, { startDate: { $lte: `${fecha}T23:59:59.999Z` } }] },
      paging: { limit: 100, offset }
    });
    const items = result?.extendedBookings || [];
    allBookings = allBookings.concat(items);
    hasMore = items.length === 100;
    offset += 100;
  }
  let confirmados = allBookings.filter(item => item.booking?.status === 'CONFIRMED');
  if (empleado) {
    const empNorm = empleado.toLowerCase();
    confirmados = confirmados.filter(item => {
      const sn = normalizarStaff(item.booking?.bookedEntity?.slot?.resource?.name || '').toLowerCase();
      return sn.includes(empNorm) || empNorm.includes(sn);
    });
  }
  let svcMap = {};
  try {
    const svcResult = await listarServicios();
    if (svcResult?.ok && svcResult.servicios) {
      for (const s of svcResult.servicios) {
        if (s.id && s.name) svcMap[s.id] = s.name;
      }
    }
  } catch (_) {}
  const raw = confirmados.map(item => {
    const bk = item.booking, slot = bk?.bookedEntity?.slot || {}, ct = bk?.contactDetails || {};
    const rawTitle = slot.title || bk?.title || '';
    const esGenerico = !rawTitle || rawTitle === 'Servicio' || rawTitle === 'Service';
    const servicioNombre = esGenerico ? (svcMap[slot.serviceId] || rawTitle || 'Servicio') : rawTitle;
    return {
      hora: slot.startDate ? new Date(slot.startDate).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' }) : '??:??',
      horaFin: slot.endDate ? new Date(slot.endDate).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' }) : '',
      startMs: slot.startDate ? new Date(slot.startDate).getTime() : 0,
      endMs: slot.endDate ? new Date(slot.endDate).getTime() : 0,
      cliente: `${ct.firstName || ''} ${ct.lastName || ''}`.trim() || 'Sin nombre',
      servicio: servicioNombre,
      empleado: normalizarStaff(slot.resource?.name || ''),
      esTecnico: SERVICIOS_TECNICOS.has(servicioNombre.split(' ')[0])
    };
  }).sort((a, b) => a.startMs - b.startMs);
  const grupos = [];
  raw.forEach(r => {
    const g = grupos.find(g => g.cliente === r.cliente && Math.abs(r.startMs - g.lastEndMs) <= GAP_MS);
    if (g) {
      if (!r.esTecnico) g.servicios.push(r.servicio);
      if (r.endMs > g.lastEndMs) g.lastEndMs = r.endMs;
      g.horaFin = r.horaFin;
    } else {
      grupos.push({ cliente: r.cliente, hora: r.hora, horaFin: r.horaFin, empleado: r.empleado,
        servicios: r.esTecnico ? [] : [r.servicio], lastEndMs: r.endMs });
    }
  });
  const reservas = grupos.map(g => ({
    hora: g.hora, horaFin: g.horaFin, cliente: g.cliente,
    servicios: g.servicios.length > 0 ? g.servicios.join(', ') : 'Servicios técnicos',
    empleado: g.empleado
  }));
  try {
    const staffRes = await getStaffResources();
    if (staffRes?.ok && staffRes.staff?.length) {
      const schedToStaff = {};
      for (const s of staffRes.staff) {
        if (s.scheduleId) schedToStaff[s.scheduleId] = { id: s.id, name: normalizarStaff(s.name) };
      }
      const schedIds = Object.keys(schedToStaff);
      if (schedIds.length > 0) {
        const sessResult = await bookingSessions.querySessions()
          .hasSome('scheduleId', schedIds)
          .ge('end.timestamp', `${fecha}T00:00:00.000Z`)
          .lt('start.timestamp', `${fecha}T23:59:59.999Z`)
          .hasSome('tags', ['Blocked'])
          .limit(100)
          .find({ suppressAuth: true });
        const empNorm = empleado ? empleado.toLowerCase() : null;
        for (const sess of (sessResult?.items || [])) {
          const staffInfo = schedToStaff[sess.scheduleId] || {};
          const bStaff = staffInfo.name || '';
          if (empNorm && bStaff.toLowerCase() !== empNorm) continue;
          const sStart = sess.start?.timestamp ? new Date(sess.start.timestamp) : null;
          const sEnd = sess.end?.timestamp ? new Date(sess.end.timestamp) : null;
          if (!sStart) continue;
          const bHora = sStart.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });
          const bHoraFin = sEnd ? sEnd.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' }) : '';
          const durMin = sEnd ? Math.round((sEnd.getTime() - sStart.getTime()) / 60000) : 0;
          const notesStr = sess.notes || '';
          const isRealExtension = notesStr.startsWith('EXTENSIÓN:') && notesStr.replace('EXTENSIÓN:', '').trim().length > 0 && !notesStr.includes('DESCANSO_') && !notesStr.includes('BLOQUEO');
          if (isRealExtension) continue;
          reservas.push({
            hora: bHora, horaFin: bHoraFin, cliente: 'BLOQUEO',
            servicios: `Bloqueado ${durMin} min`, empleado: bStaff
          });
        }
        reservas.sort((a, b) => a.hora.localeCompare(b.hora));
      }
    }
  } catch (blErr) {
    console.warn(`${TAG} fetchAgendaDia bloqueos:`, blErr.message);
  }
  return { reservas, fecha, empleadoFiltro: empleado || null, totalCitas: reservas.length };
}
async function fetchFacturacion(params) {
  const { fechaDesde, fechaHasta } = params;
  console.log(`${TAG} fetchFacturacion: ${fechaDesde} - ${fechaHasta}`);
  let query = wixData.query('PaymentReservations');
  if (fechaDesde) query = query.ge('fechaPago', new Date(`${fechaDesde}T00:00:00.000Z`));
  if (fechaHasta) query = query.le('fechaPago', new Date(`${fechaHasta}T23:59:59.999Z`));
  query = query.descending('fechaPago').limit(500);
  const result = await query.find({ suppressAuth: true });
  const pagos = result?.items || [];
  let totalImporte = 0;
  const porStaff = {}, detalle = [];
  pagos.forEach(p => {
    const importe = parseFloat(p.importeTotal || 0);
    totalImporte += importe;
    const staff = normalizarStaff(p.staff || 'Sin staff');
    if (!porStaff[staff]) porStaff[staff] = { staff, importe: 0, servicios: 0 };
    porStaff[staff].importe += importe;
    porStaff[staff].servicios++;
    detalle.push({ cliente: p.nombreCliente || 'Sin nombre', descripcion: p.descripcion || '',
      importe, staff, metodoPago: p.tipoPago || '', fecha: p.fechaReserva || p.fechaPago || null });
  });
  return { fechaDesde, fechaHasta, totalImporte: parseFloat(totalImporte.toFixed(2)),
    totalServicios: pagos.length, resumenStaff: Object.values(porStaff).sort((a, b) => b.importe - a.importe), detalle };
}
async function fetchCliente(params) {
  const { nombre, queryOriginal } = params;
  if (!nombre && !queryOriginal) return { encontrado: false, mensaje: 'No se especificó nombre' };
  const busqueda = nombre || queryOriginal;
  console.log(`${TAG} fetchCliente: "${busqueda}"`);
  const pagosResult = await wixData.query('PaymentReservations').descending('fechaReserva').limit(500).find({ suppressAuth: true });
  const historial = (pagosResult?.items || []).filter(r => matchNombre(r.nombreCliente, busqueda));
  const ultimasVisitas = historial.slice(0, 5).map(r => ({
    fecha: r.fechaReserva || r.fechaPago || null, descripcion: r.descripcion || '',
    staff: normalizarStaff(r.staff || ''), importe: r.importeTotal || 0, metodoPago: r.tipoPago || ''
  }));
  const serviciosUnicos = [...new Set(
    historial.flatMap(r => (r.descripcion || '').split(', ').map(s => s.replace(/\(.*?\)/, '').trim())).filter(Boolean)
  )].slice(0, 10);
  const cid = await buscarContactId(busqueda, queryOriginal);
  let datosContacto = null;
  if (cid) {
    try {
      const todosRaw2 = await cargarTodosContactos();
      const matchCRM = (todosRaw2?.clientes || []).find(c => c.contactId === cid);
      if (matchCRM) {
        datosContacto = {
          nombre: matchCRM.nombreCompleto || '',
          email: matchCRM.email || '',
          telefono: matchCRM.telefono || ''
        };
      }
    } catch (_) {}
  }
  if (!datosContacto && busqueda) {
    try {
      const todosRaw3 = await cargarTodosContactos();
      const matchNom = (todosRaw3?.clientes || []).find(c => matchNombre(c.nombreCompleto, busqueda));
      if (matchNom) {
        datosContacto = {
          nombre: matchNom.nombreCompleto || '',
          email: matchNom.email || '',
          telefono: matchNom.telefono || ''
        };
      }
    } catch (_) {}
  }

  let careData = null, productosComprados = null, serviciosExternos = null;
  if (cid) {
    try {
      const exp = await getCareExpediente({ contactId: cid });
      if (exp?.ok) {
        careData = { notas: exp.profile?.notes || null, visitasCuidado: (exp.visits || []).length,
          ultimoDiagnostico: exp.visits?.[0] ? { zona: exp.visits[0].zone, fecha: exp.visits[0].visitDate,
            nivelDano: null } : null };
        if (careData.ultimoDiagnostico && exp.visits[0].diagnosis) {
          try { careData.ultimoDiagnostico.nivelDano = JSON.parse(exp.visits[0].diagnosis).nivelDano; } catch(_) {}
        }
      }
    } catch (e) {}
    try {
      const prod = await getCareProductos({ contactId: cid });
      if (prod?.ok && prod.productos?.length) productosComprados = prod.productos.slice(0, 5).map(p => ({ nombre: p.name, cantidad: p.quantity, precio: p.price, fecha: p.date }));
    } catch (e) {}
    try {
      const ext = await getCareExternos({ contactId: cid });
      if (ext?.ok && ext.externos?.length) serviciosExternos = ext.externos.slice(0, 5).map(ex => ({ titulo: ex.title, fecha: ex.date, precio: ex.price }));
    } catch (e) {}
  }
  return { nombre: busqueda, encontrado: historial.length > 0 || !!cid, totalVisitas: historial.length,
    ultimasVisitas, serviciosUnicos, datosContacto, careData, productosComprados, serviciosExternos };
}
async function fetchDisponibilidad(params) {
  const fecha = params.fechaISO || getMadridToday();
  const empleado = params.empleado;
  console.log(`${TAG} fetchDisponibilidad: ${fecha} emp=${empleado || 'todos'}`);
  const d = new Date(fecha + 'T12:00:00Z');
  const dow = d.getUTCDay();
  if (dow === 0) return { fecha, disponibilidad: {}, nota: 'Domingo — salón cerrado' };
  const horaApertura = '10:00', horaCierre = dow === 6 ? '14:00' : '20:00';
  const agendaData = await fetchAgendaDia(fecha, empleado);
  const reservas = agendaData.reservas || [];
  const porEmp = {};
  reservas.forEach(r => {
    const emp = r.empleado || 'Sin asignar';
    if (!porEmp[emp]) porEmp[emp] = [];
    porEmp[emp].push({ inicio: r.hora, fin: r.horaFin });
  });
  if (empleado && !porEmp[empleado]) porEmp[empleado] = [];
  const disponibilidad = {};
  for (const [emp, ocupados] of Object.entries(porEmp)) {
    const esDescanso = reservas.some(r => r.empleado === emp && (r.servicios || '').toUpperCase().includes('DESCANSO'));
    if (esDescanso) { disponibilidad[emp] = { huecos: [], esDescanso: true }; continue; }
    const sorted = ocupados.sort((a, b) => a.inicio.localeCompare(b.inicio));
    const huecos = [];
    let cursor = horaApertura;
    for (const bl of sorted) {
      if (bl.inicio > cursor) huecos.push({ desde: cursor, hasta: bl.inicio });
      if (bl.fin > cursor) cursor = bl.fin;
    }
    if (cursor < horaCierre) huecos.push({ desde: cursor, hasta: horaCierre });
    disponibilidad[emp] = { huecos, esDescanso: false, totalReservas: sorted.length };
  }
  return { fecha, horario: `${horaApertura}-${horaCierre}`, empleadoFiltro: empleado, disponibilidad };
}
// ═══════════════════════════════════════════════════════════════════════════
// EXTERNOS
// ═══════════════════════════════════════════════════════════════════════════
let cachedMapaComisiones = null;
let comisionCacheTimestamp = 0;
const COMISION_CACHE_TTL = 10 * 60 * 1000;
async function getMapaComisiones() {
  const now = Date.now();
  if (cachedMapaComisiones && (now - comisionCacheTimestamp) < COMISION_CACHE_TTL) {
    return cachedMapaComisiones;
  }
  console.log(`${TAG} Leyendo ExternalServices (catálogo comisiones)...`);
  const mapa = {};
  let fallback = 0;
  try {
    const catResult = await wixData.query('ExternalServices')
      .eq('activeStatus', true)
      .limit(100)
      .find({ suppressAuth: true });
    const items = catResult?.items || [];
    console.log(`${TAG} ExternalServices activos: ${items.length}`);
    for (const item of items) {
      const nombre = (item.serviceName || '').trim().toUpperCase();
      const pct = Number(item.commissionPercentage || 0);
      if (nombre && pct > 0) {
        mapa[nombre] = pct;
      }
      if (fallback === 0 && pct > 0) {
        fallback = pct;
      }
    }
    console.log(`${TAG} Mapa comisiones: ${JSON.stringify(mapa)} | fallback=${fallback}%`);
  } catch (e) {
    console.warn(`${TAG} Error leyendo ExternalServices:`, e.message);
  }
  cachedMapaComisiones = { mapa, fallback };
  comisionCacheTimestamp = now;
  return cachedMapaComisiones;
}
function calcularComisionCita(category, totalPrice, mapaComisiones) {
  const { mapa, fallback } = mapaComisiones;
  const catUpper = (category || '').trim().toUpperCase();
  let pct = mapa[catUpper] || 0;
  if (pct === 0 && catUpper.includes('+')) {
    const partes = catUpper.split('+').map(p => p.trim());
    for (const parte of partes) {
      if (mapa[parte]) { pct = mapa[parte]; break; }
    }
  }
  if (pct === 0 && fallback > 0) pct = fallback;
  const precio = Number(totalPrice || 0);
  const comision = Math.round((precio * pct / 100) * 100) / 100;
  return { precio, pct, comision };
}
async function cargarMapaPagosExternos(idsRegistros) {
  const mapaPagos = {};
  try {
    let allPagos = [], offset = 0, hasMore = true;
    while (hasMore && offset < 500) {
      const result = await wixData.query('PagoreservasExternos')
        .skip(offset)
        .limit(100)
        .find({ suppressAuth: true });
      const items = result?.items || [];
      allPagos = allPagos.concat(items);
      hasMore = items.length === 100;
      offset += 100;
    }
    console.log(`${TAG} PagoreservasExternos: ${allPagos.length} registros`);
    for (const pago of allPagos) {
      const bid = pago.bookingId || '';
      if (bid.startsWith('EXT_')) {
        const originalId = bid.substring(4);
        mapaPagos[originalId] = {
          tipoPago: pago.tipoPago || '',
          fechaPago: pago.fechaPago || null,
          importeCobrado: pago.importeTotal || 0,
          descripcionPago: pago.descripcion || '',
          staffPago: pago.staff || 'Emy'
        };
      }
    }
    console.log(`${TAG} Mapa pagos externos: ${Object.keys(mapaPagos).length} pagos mapeados`);
  } catch (e) {
    console.warn(`${TAG} Error leyendo PagoreservasExternos:`, e.message);
  }
  return mapaPagos;
}
function formatearCitaExterna(cita, pagoInfo) {
  const fechaMadrid = cita.date
    ? new Date(cita.date).toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })
    : '';
  const horaMadrid = cita.date
    ? new Date(cita.date).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' })
    : '';
  const result = {
    fecha: fechaMadrid,
    hora: horaMadrid,
    cliente: cita.clientName || 'Sin nombre',
    servicio: cita.title || cita.modality || cita.category || 'Servicio externo',
    categoria: cita.category || '',
    precio: cita.totalPrice || 0,
    duracion: cita.totalDuration || 0,
    estado: cita.status || '',
    tipoPago: pagoInfo?.tipoPago || '',
    fechaPago: pagoInfo?.fechaPago
      ? new Date(pagoInfo.fechaPago).toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })
      : ''
  };
  return result;
}
function procesarResultadosExternos(citasValidas, mapaPagos, mapaComisiones) {
  let ventaBruta = 0, comisionTotal = 0;
  const desglosePorServicio = {};
  const resumenPago = { efectivo: 0, tarjeta: 0, otro: 0, sinDatos: 0 };
  const citas = [];
  for (const cita of citasValidas) {
    const citaId = cita._id || '';
    const pagoInfo = mapaPagos[citaId] || null;
    const { precio, pct, comision } = calcularComisionCita(cita.category, cita.totalPrice, mapaComisiones);
    ventaBruta += precio;
    comisionTotal += comision;
    const nombreSvc = cita.modality || cita.category || 'Servicio externo';
    if (!desglosePorServicio[nombreSvc]) {
      desglosePorServicio[nombreSvc] = { servicio: nombreSvc, citas: 0, ventaBruta: 0, comision: 0, pctComision: pct };
    }
    desglosePorServicio[nombreSvc].citas++;
    desglosePorServicio[nombreSvc].ventaBruta += precio;
    desglosePorServicio[nombreSvc].comision += comision;
    const tp = (pagoInfo?.tipoPago || '').toLowerCase();
    if (tp.includes('efectivo')) resumenPago.efectivo += precio;
    else if (tp.includes('tarjeta')) resumenPago.tarjeta += precio;
    else if (tp) resumenPago.otro += precio;
    else resumenPago.sinDatos += precio;
    citas.push(formatearCitaExterna(cita, pagoInfo));
  }
  const desglose = Object.values(desglosePorServicio).map(d => ({
    ...d,
    ventaBruta: Math.round(d.ventaBruta * 100) / 100,
    comision: Math.round(d.comision * 100) / 100
  })).sort((a, b) => b.ventaBruta - a.ventaBruta);
  return {
    citas,
    ventaBruta: Math.round(ventaBruta * 100) / 100,
    comisionHairTimes: Math.round(comisionTotal * 100) / 100,
    desglosePorServicio: desglose,
    resumenPago: {
      efectivo: Math.round(resumenPago.efectivo * 100) / 100,
      tarjeta: Math.round(resumenPago.tarjeta * 100) / 100,
      otro: Math.round(resumenPago.otro * 100) / 100,
      sinDatos: Math.round(resumenPago.sinDatos * 100) / 100
    }
  };
}
async function fetchExternos(params) {
  const { fechaISO, rango, rangoDesde, rangoHasta } = params;
  console.log(`${TAG} fetchExternos: fecha=${fechaISO || '-'} rango=${rango || 'dia'} rangoDesde=${rangoDesde || '-'} rangoHasta=${rangoHasta || '-'}`);
  if (rango === 'historico' || rango === 'todo') {
    console.log(`${TAG} fetchExternos HISTÓRICO: todos los PAGADOS`);
    let allItems = [], offset = 0, hasMore = true;
    while (hasMore && offset < 1000) {
      const result = await wixData.query('SvExternalRecords')
        .eq('status', 'PAGADO')
        .descending('date')
        .skip(offset)
        .limit(100)
        .find({ suppressAuth: true });
      const items = result?.items || [];
      allItems = allItems.concat(items);
      hasMore = items.length === 100;
      offset += 100;
    }
    console.log(`${TAG} fetchExternos HISTÓRICO: ${allItems.length} registros PAGADOS`);
    const [mapaComisiones, mapaPagos] = await Promise.all([
      getMapaComisiones(),
      cargarMapaPagosExternos()
    ]);
    const resultado = procesarResultadosExternos(allItems, mapaPagos, mapaComisiones);
    console.log(`${TAG} fetchExternos HISTÓRICO: ${resultado.citas.length} citas, bruta=${resultado.ventaBruta}€, comisión=${resultado.comisionHairTimes}€`);
    return {
      rango: 'historico',
      totalCitas: resultado.citas.length,
      citas: resultado.citas.slice(0, 50),
      ventaBruta: resultado.ventaBruta,
      comisionHairTimes: resultado.comisionHairTimes,
      desglosePorServicio: resultado.desglosePorServicio,
      resumenPago: resultado.resumenPago
    };
  }
  if (rangoDesde && rangoHasta) {
    console.log(`${TAG} fetchExternos RANGO: ${rangoDesde} → ${rangoHasta} (solo PAGADO)`);
    const startUTC = new Date(new Date(`${rangoDesde}T00:00:00`).getTime() - 3 * 3600000);
    const endUTC = new Date(new Date(`${rangoHasta}T23:59:59`).getTime() + 3 * 3600000);
    let allItems = [], offset = 0, hasMore = true;
    while (hasMore && offset < 1000) {
      const result = await wixData.query('SvExternalRecords')
        .eq('status', 'PAGADO')
        .ge('date', startUTC)
        .le('date', endUTC)
        .descending('date')
        .skip(offset)
        .limit(100)
        .find({ suppressAuth: true });
      const items = result?.items || [];
      allItems = allItems.concat(items);
      hasMore = items.length === 100;
      offset += 100;
    }
    const citasValidas = allItems.filter(item => {
      if (!item.date) return false;
      const madridDate = new Date(item.date).toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });
      return madridDate >= rangoDesde && madridDate <= rangoHasta;
    });
    const [mapaComisiones, mapaPagos] = await Promise.all([
      getMapaComisiones(),
      cargarMapaPagosExternos()
    ]);
    const resultado = procesarResultadosExternos(citasValidas, mapaPagos, mapaComisiones);
    console.log(`${TAG} fetchExternos RANGO: ${resultado.citas.length} citas PAGADAS, bruta=${resultado.ventaBruta}€, comisión=${resultado.comisionHairTimes}€`);
    return {
      rango: 'periodo',
      rangoDesde,
      rangoHasta,
      totalCitas: resultado.citas.length,
      citas: resultado.citas.slice(0, 50),
      ventaBruta: resultado.ventaBruta,
      comisionHairTimes: resultado.comisionHairTimes,
      desglosePorServicio: resultado.desglosePorServicio,
      resumenPago: resultado.resumenPago
    };
  }
  if (rango === 'semana') {
    const base = fechaISO || getMadridToday();
    const d = new Date(base + 'T12:00:00Z');
    const diff = d.getUTCDay() === 0 ? -6 : 1 - d.getUTCDay();
    const monday = sumarDias(base, diff);
    const sunday = sumarDias(monday, 6);
    return fetchExternos({ rangoDesde: monday, rangoHasta: sunday });
  }
  const fecha = fechaISO || getMadridToday();
  try {
    const startUTC = new Date(new Date(`${fecha}T00:00:00`).getTime() - 3 * 3600000);
    const endUTC = new Date(new Date(`${fecha}T23:59:59`).getTime() + 3 * 3600000);
    const result = await wixData.query('SvExternalRecords')
      .eq('status', 'PAGADO')
      .ge('date', startUTC)
      .le('date', endUTC)
      .ascending('date')
      .limit(50)
      .find({ suppressAuth: true });
    const citasDelDia = (result?.items || []).filter(item => {
      if (!item.date) return false;
      const madridDate = new Date(item.date).toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });
      return madridDate === fecha;
    });
    const [mapaComisiones, mapaPagos] = await Promise.all([
      getMapaComisiones(),
      cargarMapaPagosExternos()
    ]);
    const resultado = procesarResultadosExternos(citasDelDia, mapaPagos, mapaComisiones);
    console.log(`${TAG} fetchExternos DÍA: ${resultado.citas.length} citas PAGADAS, bruta=${resultado.ventaBruta}€, comisión=${resultado.comisionHairTimes}€`);
    return {
      rango: 'dia',
      fecha,
      totalCitas: resultado.citas.length,
      citas: resultado.citas,
      ventaBruta: resultado.ventaBruta,
      comisionHairTimes: resultado.comisionHairTimes,
      desglosePorServicio: resultado.desglosePorServicio,
      resumenPago: resultado.resumenPago
    };
  } catch (e) {
    console.warn(`${TAG} fetchExternos DÍA error:`, e.message);
    return { rango: 'dia', fecha, totalCitas: 0, citas: [], ventaBruta: 0, comisionHairTimes: 0, desglosePorServicio: [], resumenPago: {} };
  }
}
async function fetchProductos(params) {
  if (params.tipo === 'ventas') {
    try {
      const hoy = getMadridToday();
      const res = await obtenerHistorialVentas({ fechaDesde: params.fechaDesde || hoy, fechaHasta: params.fechaHasta || hoy, limit: 50 });
      if (!res?.ok) return { tipo: 'ventas', ventas: [] };
      return { tipo: 'ventas', ventas: (res.ventas || []).map(v => ({ producto: v.productName, cantidad: v.quantity, precio: v.precio || v.totalOrder, cliente: v.clienteNombre, fecha: v.fecha })), totalVentas: res.ventas?.length || 0 };
    } catch (e) { return { tipo: 'ventas', ventas: [] }; }
  }
  try {
    const res = await listarProductos();
    if (!res?.ok) return { tipo: 'catalogo', productos: [] };
    const productos = (res.productos || []).map(p => ({ nombre: p.name || p.nombre || '', precio: p.formattedPrice || p.price || '', categorias: (p.collections || []).map(c => c.name).filter(Boolean).join(', ') || '', enStock: p.inStock !== false }));
    const colecciones = (res.collections || []).map(c => c.name).filter(Boolean);
    let filtrados = productos;
    if (params.busqueda) {
      const stems = stemSearch(params.busqueda);
      const matched = productos.filter(p => matchStems(p.nombre + ' ' + p.categorias, stems));
      if (matched.length > 0) filtrados = matched;
    }
    return { tipo: 'catalogo', totalProductos: productos.length, productos: filtrados, categorias: colecciones, filtrados: filtrados.length };
  } catch (e) { return { tipo: 'catalogo', productos: [] }; }
}
async function fetchPromociones() {
  try {
    const res = await getActivePromotions();
    if (!res?.success) return { promociones: [] };
    return { promociones: (res.promotions || []).map(p => ({ titulo: p.title, precioOriginal: p.originalPrice, precioPromo: p.promoPrice, descripcion: p.description, validaHasta: p.validUntil })), totalActivas: res.promotions?.length || 0 };
  } catch (e) { return { promociones: [] }; }
}
async function fetchServicios(params) {
  try {
    const [bookingsRes, mapeoRes] = await Promise.all([
      listarServicios().catch(e => { console.warn(`${TAG} listarServicios error:`, e.message); return { ok: false }; }),
      wixData.query('SvMapeoServicios').limit(50).find({ suppressAuth: true }).catch(e => { console.warn(`${TAG} SvMapeoServicios error:`, e.message); return { items: [] }; })
    ]);
    const bookings = bookingsRes?.ok ? (bookingsRes.servicios || []).map(s => ({
      nombre: s.name || '', precio: s.defaultPrice || null, moneda: s.currency || 'EUR',
      duracion: s.duration || null, categoria: s.category || '', oculto: s.hidden || false,
      variaciones: (s.variants || []).map(v => ({ opciones: v.choices, precio: v.price, duracion: v.duration }))
    })) : [];
    const mapeo = (mapeoRes?.items || []).map(m => {
      const complementos = [];
      if (m.minCorte > 0 || m.idCorte) complementos.push({ nombre: 'Corte', duracion: m.minCorte || 0 });
      if (m.minTratKerastase > 0 || m.idTratKerastase) complementos.push({ nombre: 'Tratamiento Kerastase', duracion: m.minTratKerastase || 0 });
      if (m.minTratHairtimes > 0 || m.idTratHairtimes) complementos.push({ nombre: 'Tratamiento Hairtimes', duracion: m.minTratHairtimes || 0 });
      if (m.minMatiz > 0 || m.idMatiz) complementos.push({ nombre: 'Matiz', duracion: m.minMatiz || 0 });
      if (m.minPeinadoS > 0) complementos.push({ nombre: 'Peinado', duracionS: m.minPeinadoS, duracionM: m.minPeinadoM, duracionL: m.minPeinadoL, duracionXL: m.minPeinadoXl });
      if (m.minPlanchadoM > 0) complementos.push({ nombre: 'Planchado', duracionM: m.minPlanchadoM, duracionL: m.minPlanchadoL, duracionXL: m.minPlanchadoXl });
      if (m.minSecado > 0) complementos.push({ nombre: 'Secado', duracion: m.minSecado });
      return {
        nombre: m.servicioPublico || '',
        fases: m.ordenFases || '',
        duracionBase: m.minAplicacion || 0,
        duracionProceso: m.minProceso || 0,
        duracionLavado: m.minLavadoPrevio || 0,
        complementos
      };
    });
    console.log(`${TAG} fetchServicios: ${bookings.length} bookings + ${mapeo.length} mapeo`);
    let busquedaUsada = params.busqueda || null;
    let bookingsFiltrados = bookings;
    let mapeoFiltrados = mapeo;
    if (busquedaUsada) {
      const stems = stemSearch(busquedaUsada);
      console.log(`${TAG} fetchServicios búsqueda: "${busquedaUsada}" → stems: [${stems.join(', ')}]`);
      const bkMatch = bookings.filter(s => matchStems(s.nombre + ' ' + s.categoria, stems));
      const mpMatch = mapeo.filter(s => matchStems(s.nombre + ' ' + s.fases, stems));
      if (bkMatch.length > 0 || mpMatch.length > 0) {
        bookingsFiltrados = bkMatch;
        mapeoFiltrados = mpMatch;
      } else {
        console.log(`${TAG} fetchServicios: 0 resultados para "${busquedaUsada}", devolviendo TODOS`);
      }
    }
    return {
      busqueda: busquedaUsada,
      serviciosIndividuales: bookingsFiltrados.slice(0, 50),
      totalIndividuales: bookingsFiltrados.length,
      serviciosPublicos: mapeoFiltrados,
      totalPublicos: mapeoFiltrados.length
    };
  } catch (e) {
    console.error(`${TAG} fetchServicios error:`, e.message);
    return { serviciosIndividuales: [], serviciosPublicos: [] };
  }
}
const SERVICE_SEARCH_STOPS = new Set([
  'de', 'del', 'para', 'a', 'al', 'el', 'la', 'los', 'las', 'un', 'una',
  'en', 'con', 'por', 'sin', 'sobre', 'y', 'o', 'e', 'que', 'qué',
  'sus', 'su', 'mi', 'dame', 'dime', 'muestra', 'busca', 'buscar',
  'quiero', 'necesito', 'cuanto', 'cuánto', 'cuesta', 'cuestan',
  'precio', 'precios', 'coste', 'costes', 'lista', 'catalogo',
  'tiene', 'hay', 'son', 'es', 'cual', 'cuales',
  'complemento', 'complementos', 'duracion', 'duración',
  'favor', 'gracias', 'porfa', 'por'
]);
function stemSearch(busqueda) {
  const words = quitarAcentos(busqueda).split(/\s+/);
  const stems = [];
  for (const w of words) {
    if (SERVICE_SEARCH_STOPS.has(w)) continue;
    if (w.length < 2) continue;
    let stem = w;
    if (stem.endsWith('es') && stem.length > 4) stem = stem.slice(0, -2);
    else if (stem.endsWith('s') && stem.length > 3) stem = stem.slice(0, -1);
    stems.push(stem);
  }
  return stems;
}
function matchStems(text, stems) {
  if (!stems.length) return true;
  const t = quitarAcentos(text);
  return stems.every(stem => t.includes(stem));
}
async function fetchStaff() {
  const hoy = getMadridToday();
  const agendaHoy = await fetchAgendaDia(hoy, null);
  const empleadosHoy = new Set(), enDescanso = new Set();
  (agendaHoy.reservas || []).forEach(r => {
    if (!r.empleado) return;
    if ((r.servicios || '').toUpperCase().includes('DESCANSO')) enDescanso.add(r.empleado);
    else empleadosHoy.add(r.empleado);
  });
  return { staff: EMPLEADOS.map(n => ({ nombre: n, trabajaHoy: empleadosHoy.has(n), enDescanso: enDescanso.has(n),
    reservasHoy: (agendaHoy.reservas || []).filter(r => r.empleado === n && !(r.servicios || '').toUpperCase().includes('DESCANSO')).length })),
    fecha: hoy, especialistaExterna: { nombre: 'Emy', area: 'Uñas, pestañas, manicura/pedicura' } };
}
async function fetchCuidadoYSalud(params) {
  const { nombre, contactId, queryOriginal } = params;
  console.log(`${TAG} fetchCuidadoYSalud: nombre=${nombre || 'N/A'} cid=${contactId || 'N/A'}`);
  // ═══ v3.5.8: si llega un contactId envenenado, descartarlo y buscar de nuevo ═══
  let cidProvided = contactId;
  if (cidProvided && POISONED_CONTACT_IDS.has(cidProvided)) {
    console.warn(`${TAG} fetchCuidadoYSalud: contactId envenenado descartado (${cidProvided}). Buscando por nombre.`);
    cidProvided = null;
  }
  const cid = cidProvided
    || (nombre ? await buscarContactId(nombre, queryOriginal) : null)
    || (params.email ? await buscarContactId(params.email) : null)
    || (params.telefono ? await buscarContactId(params.telefono) : null);
  if (!cid) return { encontrado: false, mensaje: `No se encontró "${nombre || ''}" en el sistema. Verifica el nombre.` };
  // ═══ v3.5.8: defensa final — si tras toda la cascada el cid es envenenado, abortar ═══
  if (POISONED_CONTACT_IDS.has(cid)) {
    console.warn(`${TAG} fetchCuidadoYSalud: cid resuelto es envenenado (${cid}). Abortando para evitar mostrar datos cruzados.`);
    return { encontrado: false, mensaje: `No se pudo identificar de forma única a "${nombre || ''}" en CRM. Verifica el nombre o búscalo manualmente.` };
  }
  console.log(`${TAG} fetchCuidadoYSalud: contactId=${cid} — llamando 5 backends...`);
  const [contactData, servicios, productos, externos, expediente] = await Promise.all([
    getCareContactData({ contactId: cid }).catch(e => { console.warn(`${TAG} CareContactData error:`, e.message); return { ok: false }; }),
    getCareServicios({ contactId: cid }).catch(e => { console.warn(`${TAG} CareServicios error:`, e.message); return { ok: false }; }),
    getCareProductos({ contactId: cid }).catch(e => { console.warn(`${TAG} CareProductos error:`, e.message); return { ok: false }; }),
    getCareExternos({ contactId: cid }).catch(e => { console.warn(`${TAG} CareExternos error:`, e.message); return { ok: false }; }),
    getCareExpediente({ contactId: cid }).catch(e => { console.warn(`${TAG} CareExpediente error:`, e.message); return { ok: false }; })
  ]);
  const contact = contactData?.ok ? contactData.contact : null;
  const svcList = servicios?.ok ? {
    servicios: (servicios.servicios || []).slice(0, 10).map(s => ({
      descripcion: s.descripcion, fecha: s.fecha, staff: s.staff, importe: s.importe, tipoPago: s.tipoPago
    })),
    tratamientos: (servicios.tratamientos || []).slice(0, 10).map(t => ({
      descripcion: t.descripcion, fecha: t.fecha, staff: t.staff, importe: t.importe
    })),
    totalVisitas: servicios.totalVisitas || 0
  } : null;
  const prodList = productos?.ok && productos.productos?.length > 0
    ? productos.productos.slice(0, 8).map(p => ({ nombre: p.name, cantidad: p.quantity, precio: p.price, fecha: p.date }))
    : null;
  const extList = externos?.ok && externos.externos?.length > 0
    ? externos.externos.slice(0, 8).map(ex => ({ titulo: ex.title, fecha: ex.date, tipo: ex.tipoServicio, precio: ex.price }))
    : null;
  let expData = null;
  if (expediente?.ok) {
    const visits = (expediente.visits || []).map(v => {
      let diag = null;
      if (v.diagnosis) {
        try {
          const d = JSON.parse(v.diagnosis);
          diag = {
            nivelDano: d.nivelDano, problemas: d.problemas,
            observaciones: d.observaciones?.substring(0, 200),
            recomendaciones: d.recomendacionesTratamiento,
            productos: d.recomendacionesProductos
          };
        } catch (_) {}
      }
      return { zona: v.zone, fecha: v.visitDate, diagnostico: diag, productosRecomendados: v.productsRecommended || '' };
    });
    expData = {
      notas: expediente.profile?.notes || null,
      totalVisitasCuidado: visits.length,
      visitas: visits.slice(0, 5),
      totalFotos: (expediente.media || []).length
    };
  }
  console.log(`${TAG} fetchCuidadoYSalud OK: contact=${!!contact} svc=${svcList?.totalVisitas || 0} prod=${prodList?.length || 0} ext=${extList?.length || 0} exp=${!!expData}`);
  return {
    encontrado: true,
    contactId: cid,
    datosContacto: contact ? {
      nombre: contact.fullName || '', email: contact.email || '',
      telefono: contact.phone || '', tags: contact.tags || []
    } : null,
    historialServicios: svcList,
    productosComprados: prodList,
    serviciosExternos: extList,
    expedienteCuidado: expData
  };
}
async function fetchContactos(params) {
  try {
    const todosRaw = await cargarTodosContactos();
    const contactos = todosRaw?.clientes || [];
    const busqueda = params?.nombre || params?.busqueda || null;
    let filtrados = contactos;
    if (busqueda) {
      const busqWords = quitarAcentos(busqueda).split(/\s+/).filter(w => w.length > 0);
      filtrados = contactos.filter(c => {
        const nameWords = quitarAcentos(c.nombreCompleto || '').split(/\s+/);
        return busqWords.every(bw => nameWords.some(nw => nw === bw));
      });
      if (filtrados.length === 0) {
        filtrados = contactos.filter(c => matchNombre(c.nombreCompleto, busqueda) || matchNombre(c.email, busqueda));
      }
    }
    return {
      totalContactos: contactos.length,
      totalFiltrados: filtrados.length,
      busqueda,
      contactos: filtrados.slice(0, 20).map(c => ({
        nombre: c.nombreCompleto || '', email: c.email || '', telefono: c.telefono || ''
      }))
    };
  } catch (e) { return { totalContactos: 0, error: e.message }; }
}
// ═══════════════════════════════════════════════════════════════════════════
// ROUTER
// ═══════════════════════════════════════════════════════════════════════════
async function executeFetch(categoria, params) {
  switch (categoria) {
    case 'agenda': return fetchAgenda(params);
    case 'facturacion': return fetchFacturacion(params);
    case 'cliente': return fetchCliente(params);
    case 'disponibilidad': return fetchDisponibilidad(params);
    case 'externos': return fetchExternos(params);
    case 'productos': return fetchProductos(params);
    case 'promociones': return fetchPromociones();
    case 'servicios': return fetchServicios(params);
    case 'staff': return fetchStaff();
    case 'cuidadoysalud': return fetchCuidadoYSalud(params);
    case 'contactos': return fetchContactos(params);
    default: return { mensaje: 'Categoría no reconocida' };
  }
}
// ═══════════════════════════════════════════════════════════════════════════
// PASO 3: RESPUESTA
// ═══════════════════════════════════════════════════════════════════════════
async function buildResponse(query, categoria, datos, history, capabilities, fechas) {
  const historyBlock = formatHistory(history);
  const historySection = historyBlock ? `\nCONVERSACIÓN PREVIA:\n${historyBlock}\n` : '';
  const capDescriptions = capabilities.map(c => `"${c.categoria}": ${c.descripcion}`).join('\n');
  const cmsPrompt = await buildAkiraSystemPrompt(fechas);
  const systemPrompt = cmsPrompt + '\nCAPACIDADES: ' + capDescriptions;
  const userMessage = `${historySection}Consulta: "${query}"\nCategoría: ${categoria}\nDatos:\n${JSON.stringify(datos, null, 2)}`;
  try {
    return (await callClaude(systemPrompt, userMessage, 600)).trim();
  } catch (e) {
    console.error(`${TAG} buildResponse error:`, e.message);
    return 'Error procesando la consulta. Inténtalo de nuevo.';
  }
}
// ═══════════════════════════════════════════════════════════════════════════
// FUNCIÓN PÚBLICA 1: akiraClassify
// ═══════════════════════════════════════════════════════════════════════════
export const akiraClassify = webMethod(
  Permissions.SiteMember,
  async ({ query, history }) => {
    try {
      if (!query || typeof query !== 'string' || query.trim().length === 0) {
        return { ok: false, error: 'Consulta vacía' };
      }
      const queryTrimmed = query.trim();
      const safeHistory = Array.isArray(history) ? history.slice(-MAX_HISTORY) : [];
      const fechas = resolverFechas();
      const startMs = Date.now();
      console.log(`${TAG} akiraClassify: "${queryTrimmed}" (hist: ${safeHistory.length}) hoy=${fechas.hoyISO}`);
      const hints = preProcessQuery(queryTrimmed);
      const capabilities = await getCapabilities();
      const intent = await detectIntent(queryTrimmed, safeHistory, capabilities, fechas);
      const { categoria, params: rawParams } = intent;
      const params = normalizeParams(categoria, rawParams, hints, fechas);
      console.log(`${TAG} → cat=${categoria} params=${JSON.stringify(params)}`);
      const datos = await executeFetch(categoria, params);
      const tiempoClassify = Date.now() - startMs;
      console.log(`${TAG} akiraClassify OK — ${categoria} (${tiempoClassify}ms)`);
      return { ok: true, version: VERSION, categoria, params, datos, fechas, tiempoClassify };
    } catch (e) {
      console.error(`${TAG} akiraClassify ERROR:`, e);
      return { ok: false, version: VERSION, error: safeErr(e) };
    }
  }
);
// ═══════════════════════════════════════════════════════════════════════════
// FUNCIÓN PÚBLICA 2: akiraRespond
// ═══════════════════════════════════════════════════════════════════════════
export const akiraRespond = webMethod(
  Permissions.SiteMember,
  async ({ query, categoria, datos, history }) => {
    try {
      const startMs = Date.now();
      const safeHistory = Array.isArray(history) ? history.slice(-MAX_HISTORY) : [];
      const fechas = resolverFechas();
      console.log(`${TAG} akiraRespond: cat=${categoria}`);
      const capabilities = await getCapabilities();
      const respuesta = await buildResponse(query, categoria, datos, safeHistory, capabilities, fechas);
      const tiempoMs = Date.now() - startMs;
      console.log(`${TAG} akiraRespond OK — ${categoria} (${tiempoMs}ms)`);
      wixData.insert('AkiraLog', {
        timestamp: new Date(),
        query: query,
        category: categoria,
        params: JSON.stringify(datos ? { datosKeys: Object.keys(datos) } : {}),
        responseSummary: (respuesta || '').substring(0, 200),
        version: VERSION,
        timeMs: tiempoMs,
        error: ''
      }, { suppressAuth: true }).catch(() => {});
      return { ok: true, version: VERSION, categoria, respuesta, timestamp: new Date().toISOString() };
    } catch (e) {
      console.error(`${TAG} akiraRespond ERROR:`, e);
      wixData.insert('AkiraLog', {
        timestamp: new Date(),
        query: query || '',
        category: categoria || '',
        params: '',
        responseSummary: '',
        version: VERSION,
        timeMs: 0,
        error: e?.message || String(e)
      }, { suppressAuth: true }).catch(() => {});
      return { ok: false, version: VERSION, error: safeErr(e), respuesta: 'Error procesando la consulta. Inténtalo de nuevo.' };
    }
  }
);