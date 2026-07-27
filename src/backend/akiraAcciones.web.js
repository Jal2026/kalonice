// =====================================================
// KAMISUITE — Backend: akiraAcciones.web.js
// Módulo: Acciones ejecutables desde AKIRA
// =====================================================
// VERSION: 1.9.0
// FECHA: 10 Mayo 2026
//
// PRINCIPIO: AKIRA ejecuta funciones EXISTENTES de KAMISUITE.
// No reinventa. Importa y llama.
//
// FUNCIONES:
//   ejecutarBloqueo — calendarioVista.web
//   ejecutarReservaSimple — simplesLogic.web
//   ejecutarReservaColor — coloracionLogic.web (tinte, mechas, tinte vegetal)
//   ejecutarCancelacion — cancelacionReservas.web (v1.4.0)
//   ejecutarMoverReserva — testCheckout.web (v1.4.0)
//   ejecutarAnadirComplemento — simplesLogic.web + SvMapeoServicios (v1.5.0)
//   ejecutarEliminarComplemento — cancelacionReservas.web + SvMapeoServicios (v1.6.0)
//
// CHANGELOG:
//   v1.9.0 - NEW: helper resolverDatosCliente(nombre) que busca el cliente
//     en Wix CRM por nombre/apellido vía query DIRIGIDA (rápida, ~150ms,
//     no carga todos los contactos). Devuelve email, teléfono y contactId
//     reales para que la centralita de comunicaciones pueda enviar
//     WhatsApp transaccional.
//
//     Aplicado en las 4 funciones que crean reservas:
//       - ejecutarReservaSimple
//       - ejecutarReservaColor
//       - ejecutarAnadirComplemento
//       - ejecutarCambiarServicio
//
//     Try/catch envolvente: si la query CRM falla, AKIRA sigue
//     funcionando como en v1.8.0 (sin email/teléfono → centralita no
//     envía WhatsApp pero la reserva se crea igual). NUNCA bloquea
//     una reserva por un fallo de búsqueda CRM.
//
//     Caso ambiguo (varios contactos con mismo nombre): se omite el
//     enriquecimiento, la reserva se crea sin email/teléfono. Se
//     loguea WARN para diagnóstico posterior.
//
//   v1.8.0 - findBookingsByParams acepta param `servicio` y filtra
//     grupos por nombre de servicio (case-insensitive includes).
//     ejecutarCancelacion y ejecutarMoverReserva aceptan `servicio`
//     y lo pasan a findBookingsByParams para desambiguar citas.
//   v1.7.1 - NEW preCheckDisponibilidadSimple: verifica disponibilidad
//     ANTES de mostrar confirmación. Filtro de slots a intervalos 15min.
//   v1.7.0 - ejecutarReservaSimple: cuando slots=0 para un empleado,
//     consulta los demás staff para distinguir "no tiene el servicio
//     asignado" de "está ocupado". Respuesta aclaratoria con nombres
//     y horas de los empleados que SÍ lo tienen.
//   v1.6.0 - FIX ejecutarEliminarComplemento: matchea por serviceId
//     contra SvMapeoServicios en vez de por serviceName.
//   v1.5.0 - NEW: ejecutarAnadirComplemento + ejecutarEliminarComplemento
//   v1.4.0 - NEW: ejecutarCancelacion + ejecutarMoverReserva
//   v1.3.0 - ejecutarReservaColor con confirmarEnCalendario
//   v1.2.0 - ejecutarReservaSimple con simplesLogic
//   v1.1.0 - ejecutarBloqueo con calendarioVista
// =====================================================
import { webMethod, Permissions } from 'wix-web-module';
import { getStaffResources, crearExtension, eliminarExtension, getTodasReservasDia } from 'backend/calendarioVista.web';
import { reservarSimple, consultarDisponibilidadSimple } from 'backend/simplesLogic.web';
import { listarServicios } from 'backend/diagnosticoServicios.web';
import { confirmarEnCalendario } from 'backend/coloracionLogic.web';
import { cancelarReservas } from 'backend/cancelacionReservas.web';
import { cambiarFechaBookings } from 'backend/testCheckout.web';
import { extendedBookings } from 'wix-bookings.v2';
import { contacts } from 'wix-crm-backend';
import { elevate } from 'wix-auth';
import wixData from 'wix-data';

const VERSION = '1.9.0';
const TAG = `[AkiraAcciones][${VERSION}]`;
const GAP_MS = 90 * 60 * 1000; // 90 min — misma lógica que checkout

// ═══════════════════════════════════════════════════════════════════════════
// HELPER: Normalizar nombre de empleado (A_Ricardo → Ricardo)
// ═══════════════════════════════════════════════════════════════════════════
function findStaffResource(staffList, empleado) {
  const empLower = empleado.toLowerCase().trim();
  return staffList.find(s => {
    const raw = (s.name || '').toLowerCase().trim();
    if (raw === empLower) return true;
    const sinPrefijo = raw.replace(/^[a-z]_/i, '').trim();
    if (sinPrefijo === empLower) return true;
    const sinSufijo = raw.replace(/\s*ht$/i, '').trim();
    if (sinSufijo === empLower) return true;
    return false;
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER: Buscar serviceId por nombre en catálogo Wix
// ═══════════════════════════════════════════════════════════════════════════
function quitarAcentos(str) {
  return (str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

async function findServiceByName(nombreServicio) {
  console.log(`${TAG} Buscando servicio: "${nombreServicio}"`);
  const result = await listarServicios();
  if (!result?.ok || !result.servicios?.length) return null;

  const busqueda = quitarAcentos(nombreServicio);

  // Match exacto
  let found = result.servicios.find(s => quitarAcentos(s.name) === busqueda);

  // Match parcial (includes)
  if (!found) {
    found = result.servicios.find(s =>
      quitarAcentos(s.name).includes(busqueda) || busqueda.includes(quitarAcentos(s.name))
    );
  }

  // Match por palabras clave
  if (!found) {
    const FILLER = new Set(['de', 'del', 'para', 'con', 'el', 'la', 'los', 'las', 'un', 'una', 'pelo', 'cabello', 'servicio']);
    const keywords = busqueda.split(/\s+/).filter(w => w.length > 1 && !FILLER.has(w));
    if (keywords.length > 0) {
      found = result.servicios.find(s => {
        const sName = quitarAcentos(s.name);
        return keywords.every(kw => sName.includes(kw));
      });
    }
  }

  if (found) {
    console.log(`${TAG} Servicio: "${found.name}" id=${found.id} precio=${found.defaultPrice} dur=${found.duration}`);
    return found;
  }

  const nombres = result.servicios.slice(0, 15).map(s => s.name).join(', ');
  console.log(`${TAG} Servicio "${nombreServicio}" no encontrado. Primeros 15: ${nombres}`);
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// v1.9.0: RESOLVER DATOS CLIENTE EN CRM (query directa, ~150ms)
//
// Busca el cliente en Wix CRM por nombre+apellido y devuelve email,
// teléfono y contactId reales. Esto permite que simplesLogic /
// coloracionLogic invoquen la centralita con datos completos y se
// envíe WhatsApp transaccional al cliente.
//
// Estrategia:
//   1. Descomponer "Pepe Valver" en first="Pepe", last="Valver"
//   2. Query con .eq('info.name.first', first) + .eq('info.name.last', last)
//      Esto trae solo los matches exactos, no carga 2293 contactos.
//   3. Si hay 1 match → devolver datos
//   4. Si hay 0 o múltiples → devolver null (la reserva sigue su curso
//      con contactDetails básico, igual que en v1.8.0)
//
// Try/catch envolvente: cualquier fallo de CRM devuelve null sin
// bloquear el flujo de reserva. AKIRA debe ser robusta.
// ═══════════════════════════════════════════════════════════════════════════

async function resolverDatosCliente(nombreCompleto) {
  if (!nombreCompleto || typeof nombreCompleto !== 'string') return null;

  const nombre = nombreCompleto.trim();
  if (!nombre) return null;

  const partes = nombre.split(/\s+/);
  const firstName = partes[0] || '';
  const lastName = partes.slice(1).join(' ').trim();

  if (!firstName) return null;

  try {
    const elevatedQuery = elevate(contacts.queryContacts);

    let query = elevatedQuery().eq('info.name.first', firstName);
    if (lastName) {
      query = query.eq('info.name.last', lastName);
    }

    const result = await query.limit(5).find();
    const items = result?.items || [];

    if (items.length === 0) {
      console.log(`${TAG} resolverDatosCliente: sin match para "${nombre}" (cliente nuevo)`);
      return null;
    }

    if (items.length > 1) {
      console.warn(`${TAG} resolverDatosCliente: AMBIGUO — ${items.length} contactos para "${nombre}". Reserva sin enriquecer.`);
      return null;
    }

    const c = items[0];
    const contactId = c?._id || c?.id || null;

    // Extracción robusta de email — info.emails puede ser array o {items:[]}
    let email = '';
    const emailsRaw = c?.info?.emails;
    if (emailsRaw) {
      const lista = Array.isArray(emailsRaw) ? emailsRaw : (Array.isArray(emailsRaw.items) ? emailsRaw.items : []);
      const e0 = lista[0];
      email = (e0?.email || e0 || '').toString().trim();
    }
    if (!email) {
      email = (c?.primaryEmail || c?.loginEmail || '').toString().trim();
    }

    // Extracción robusta de teléfono
    let telefono = '';
    const phonesRaw = c?.info?.phones;
    if (phonesRaw) {
      const lista = Array.isArray(phonesRaw) ? phonesRaw : (Array.isArray(phonesRaw.items) ? phonesRaw.items : []);
      const p0 = lista[0];
      telefono = (p0?.phone || p0 || '').toString().trim();
    }
    if (!telefono) {
      telefono = (c?.primaryPhone || '').toString().trim();
    }

    console.log(`${TAG} resolverDatosCliente: HIT "${nombre}" → contactId=${contactId} email=${email || '-'} tel=${telefono || '-'}`);

    return {
      contactId,
      firstName: firstName,
      lastName: lastName,
      email,
      telefono
    };

  } catch (e) {
    console.warn(`${TAG} resolverDatosCliente fallo (no-blocking): ${e.message}`);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// v1.9.0: WRAPPER con timeout 500ms — garantiza que AKIRA NUNCA se ralentiza
// por la búsqueda CRM. Si tarda más de 500ms, se descarta y la reserva
// sigue sin enriquecer. La reserva nunca se bloquea por esto.
// ═══════════════════════════════════════════════════════════════════════════

function resolverDatosClienteConTimeout(nombreCompleto, timeoutMs = 500) {
  return Promise.race([
    resolverDatosCliente(nombreCompleto),
    new Promise(resolve => setTimeout(() => {
      console.warn(`${TAG} resolverDatosCliente TIMEOUT (${timeoutMs}ms) — sigue sin enriquecer`);
      resolve(null);
    }, timeoutMs))
  ]);
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER: Formateo de fechas
// ═══════════════════════════════════════════════════════════════════════════
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES_N = ['', 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function formatFecha(fecha) {
  const d = new Date(fecha + 'T12:00:00Z');
  const [, m, dd] = fecha.split('-');
  return `${DIAS[d.getUTCDay()]} ${parseInt(dd)} de ${MESES_N[parseInt(m)]}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER: Normalizar nombre de staff en booking (B_Raquel → Raquel)
// ═══════════════════════════════════════════════════════════════════════════
const STAFF_ALIAS = {
  'b_raquel': 'Raquel', 'raquel ht': 'Raquel', 'raquel': 'Raquel',
  'a_ricardo': 'Ricardo', 'ricardo ht': 'Ricardo', 'ricardo': 'Ricardo',
  'c_angela': 'Angela', 'angela': 'Angela'
};

function normalizarStaff(n) {
  return n ? (STAFF_ALIAS[n.toLowerCase().trim()] || n) : '';
}

// ═══════════════════════════════════════════════════════════════════════════
// v1.4.0: HELPER — Buscar bookings en un día y matchear por params
// v1.8.0: Añadido filtro por `servicio`
// ═══════════════════════════════════════════════════════════════════════════
const SERVICIOS_TECNICOS = new Set(['Lavado', 'Secado', 'Proceso']);

async function findBookingsByParams({ fechaISO, cliente, empleado, hora, servicio, skipCatalog }) {
  console.log(`${TAG} findBookingsByParams: fecha=${fechaISO} cliente=${cliente || '-'} emp=${empleado || '-'} hora=${hora || '-'} svc=${servicio || '-'} skipCat=${!!skipCatalog}`);

  const elevatedQuery = elevate(extendedBookings.queryExtendedBookings);
  let allBookings = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore && offset < 500) {
    const result = await elevatedQuery({
      filter: { $and: [
        { startDate: { $gte: `${fechaISO}T00:00:00.000Z` } },
        { startDate: { $lte: `${fechaISO}T23:59:59.999Z` } }
      ]},
      paging: { limit: 100, offset }
    });
    const items = result?.extendedBookings || [];
    allBookings = allBookings.concat(items);
    hasMore = items.length === 100;
    offset += 100;
  }

  let confirmados = allBookings.filter(item => item.booking?.status === 'CONFIRMED');
  console.log(`${TAG} → ${confirmados.length} bookings CONFIRMED el ${fechaISO}`);

  let svcMap = {};
  if (!skipCatalog) {
    try {
      const svcResult = await listarServicios();
      if (svcResult?.ok && svcResult.servicios) {
        for (const s of svcResult.servicios) {
          if (s.id && s.name) svcMap[s.id] = s.name;
        }
      }
      console.log(`${TAG} Catálogo servicios: ${Object.keys(svcMap).length} entries`);
    } catch (_) {}
  }

  const raw = confirmados.map(item => {
    const bk = item.booking;
    const slot = bk?.bookedEntity?.slot || {};
    const ct = bk?.contactDetails || {};
    const startD = slot.startDate ? new Date(slot.startDate) : null;
    const rawTitle = slot.title || bk?.title || '';
    const esGenerico = !rawTitle || rawTitle === 'Servicio' || rawTitle === 'Service';
    const nombreReal = esGenerico ? (svcMap[slot.serviceId] || rawTitle || 'Servicio') : rawTitle;
    return {
      bookingId: bk._id,
      serviceId: slot.serviceId || '',
      staffId: slot.resource?._id || slot.resource?.id || '',
      staffName: normalizarStaff(slot.resource?.name || ''),
      revision: bk.revision || bk._revision || null,
      scheduleId: slot.resource?.scheduleId || slot.scheduleId || '',
      startDate: slot.startDate || '',
      endDate: slot.endDate || '',
      startMs: startD ? startD.getTime() : 0,
      endMs: slot.endDate ? new Date(slot.endDate).getTime() : 0,
      hora: startD ? startD.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' }) : '',
      cliente: `${ct.firstName || ''} ${ct.lastName || ''}`.trim() || 'Sin nombre',
      serviceName: nombreReal,
      esTecnico: SERVICIOS_TECNICOS.has(nombreReal.split(' ')[0])
    };
  }).sort((a, b) => a.startMs - b.startMs);

  const grupos = [];
  raw.forEach(r => {
    const g = grupos.find(g =>
      quitarAcentos(g.cliente) === quitarAcentos(r.cliente) &&
      Math.abs(r.startMs - g.lastEndMs) <= GAP_MS
    );
    if (g) {
      g.bookings.push(r);
      if (r.endMs > g.lastEndMs) g.lastEndMs = r.endMs;
      g.horaFin = r.hora;
      if (!r.esTecnico && r.serviceName) {
        g.servicios.push(r.serviceName);
      }
    } else {
      grupos.push({
        cliente: r.cliente,
        empleado: r.staffName,
        hora: r.hora,
        horaFin: r.hora,
        servicios: r.esTecnico ? [] : [r.serviceName],
        lastEndMs: r.endMs,
        bookings: [r]
      });
    }
  });

  let filtrados = grupos;

  if (cliente) {
    const cBusq = quitarAcentos(cliente);
    filtrados = filtrados.filter(g => {
      const cGrupo = quitarAcentos(g.cliente);
      return cGrupo.includes(cBusq) || cBusq.includes(cGrupo);
    });
  }

  if (empleado) {
    const eBusq = quitarAcentos(empleado);
    filtrados = filtrados.filter(g => {
      return g.bookings.some(b => quitarAcentos(b.staffName) === eBusq);
    });
  }

  if (hora) {
    filtrados = filtrados.filter(g => g.hora === hora);
  }

  // v1.8.0: Filtrar por nombre de servicio
  if (servicio) {
    const sBusq = quitarAcentos(servicio);
    filtrados = filtrados.filter(g => {
      return g.servicios.some(svc => {
        const sNorm = quitarAcentos(svc);
        return sNorm.includes(sBusq) || sBusq.includes(sNorm);
      });
    });
  }

  console.log(`${TAG} → ${grupos.length} grupos totales, ${filtrados.length} tras filtro`);
  return { ok: true, grupos: filtrados, totalDia: grupos.length };
}

// ═══════════════════════════════════════════════════════════════════════════
// EJECUTAR BLOQUEO
// ═══════════════════════════════════════════════════════════════════════════

export const ejecutarBloqueo = webMethod(
  Permissions.SiteMember,
  async ({ empleado, fecha, horaInicio, horaFin }) => {
    try {
      if (!empleado || !fecha) return { ok: false, error: 'Empleado y fecha requeridos' };
      console.log(`${TAG} ejecutarBloqueo: ${empleado} → ${fecha} ${horaInicio || 'día completo'}-${horaFin || ''}`);

      const staffResult = await getStaffResources();
      if (!staffResult?.ok || !staffResult.staff?.length) return { ok: false, error: 'No se pudieron cargar los empleados' };

      const resource = findStaffResource(staffResult.staff, empleado);
      if (!resource?.scheduleId) return { ok: false, error: `Empleado "${empleado}" no encontrado` };

      const d = new Date(fecha + 'T12:00:00Z');
      const dow = d.getUTCDay();
      if (dow === 0) return { ok: false, error: 'El domingo el salón está cerrado.' };

      let inicio = '10:00';
      let duracionMin = dow === 6 ? 240 : 600;
      let horarioMsg = dow === 6 ? '10:00-14:00' : '10:00-20:00';

      if (horaInicio && horaFin) {
        inicio = horaInicio;
        const [hI, mI] = horaInicio.split(':').map(Number);
        const [hF, mF] = horaFin.split(':').map(Number);
        duracionMin = (hF * 60 + mF) - (hI * 60 + mI);
        if (duracionMin <= 0) return { ok: false, error: `Tramo horario inválido: ${horaInicio} a ${horaFin}` };
        horarioMsg = `${horaInicio}-${horaFin}`;
      } else if (horaInicio) {
        inicio = horaInicio;
        const cierre = dow === 6 ? '14:00' : '20:00';
        const [hI, mI] = horaInicio.split(':').map(Number);
        const [hC, mC] = cierre.split(':').map(Number);
        duracionMin = (hC * 60 + mC) - (hI * 60 + mI);
        horarioMsg = `${horaInicio}-${cierre}`;
      }

      const result = await crearExtension({
        fecha, horaInicio: inicio, duracionMin,
        scheduleId: resource.scheduleId,
        bookingId: '',
        notes: 'BLOQUEO'
      });

      if (!result?.ok) return { ok: false, error: result?.error?.message || 'Error creando el bloqueo' };

      const tipoMsg = (horaInicio && horaFin) ? 'Tramo bloqueado' : 'Día de descanso registrado';
      return {
        ok: true, sessionId: result.sessionId,
        mensaje: `${empleado} bloqueado el ${formatFecha(fecha)} (${horarioMsg}). ${tipoMsg}.`
      };
    } catch (e) {
      console.error(`${TAG} ejecutarBloqueo ERROR:`, e);
      return { ok: false, error: e?.message || 'Error inesperado' };
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// EJECUTAR RESERVA SIMPLE — corte, K18, etc.
// v1.9.0: Enriquecimiento de contactDetails con CRM lookup
// ═══════════════════════════════════════════════════════════════════════════

export const ejecutarReservaSimple = webMethod(
  Permissions.SiteMember,
  async ({ servicio, empleado, fecha, hora, cliente }) => {
    try {
      if (!servicio || !empleado || !fecha || !hora) {
        return { ok: false, error: 'Servicio, empleado, fecha y hora requeridos' };
      }

      console.log(`${TAG} ejecutarReservaSimple: "${servicio}" | ${empleado} | ${fecha} ${hora} | cliente=${cliente || '-'}`);

      // v1.9.0: lanzar búsqueda CRM EN PARALELO al inicio. Mientras
      // se hace la verificación de servicio, staff y disponibilidad
      // (que tardan más de 500ms juntos), la búsqueda CRM corre al lado.
      // Coste real para AKIRA: 0ms percibidos.
      const nombreClienteEarly = cliente || 'Cliente recepción';
      const datosCRMPromise = resolverDatosClienteConTimeout(nombreClienteEarly);

      // 1. Buscar serviceId
      const svcFound = await findServiceByName(servicio);
      if (!svcFound) return { ok: false, error: `Servicio "${servicio}" no encontrado en el catálogo` };

      // 2. Buscar resourceId
      const staffResult = await getStaffResources();
      if (!staffResult?.ok) return { ok: false, error: 'No se pudieron cargar los empleados' };

      const resource = findStaffResource(staffResult.staff, empleado);
      if (!resource) return { ok: false, error: `Empleado "${empleado}" no encontrado` };

      console.log(`${TAG} → svc=${svcFound.name} (${svcFound.id}) | staff=${resource.name} (${resource.id})`);

      // 3. Verificar disponibilidad
      const dispResult = await consultarDisponibilidadSimple({
        serviceId: svcFound.id,
        fecha,
        staffId: resource.id,
        durationMinutes: svcFound.duration || 30
      });

      if (!dispResult?.ok) return { ok: false, error: 'Error consultando disponibilidad' };

      const slotOK = dispResult.slots.find(s => s.startTime === hora);
      if (!slotOK) {
        if (dispResult.slots.length === 0) {
          console.log(`${TAG} → 0 slots para ${empleado}. Consultando otros empleados...`);
          const otherStaffWithSlots = [];
          for (const s of staffResult.staff) {
            if (s.id === resource.id || s.isExternal) continue;
            try {
              const otherDisp = await consultarDisponibilidadSimple({
                serviceId: svcFound.id, fecha, staffId: s.id,
                durationMinutes: svcFound.duration || 30
              });
              if (otherDisp?.ok && otherDisp.slots?.length > 0) {
                const nombre = normalizarStaff(s.name);
                const slotsQ = otherDisp.slots.filter(sl => {
                  const m = parseInt(sl.startTime.split(':')[1]);
                  return m % 15 === 0;
                });
                const horas = slotsQ.slice(0, 4).map(sl => sl.startTime).join(', ');
                otherStaffWithSlots.push(`${nombre} (${horas})`);
              }
            } catch (e) { /* skip */ }
          }
          if (otherStaffWithSlots.length > 0) {
            return { ok: false, error: `${empleado} no tiene asignado "${svcFound.name}". Empleados que sí lo hacen: ${otherStaffWithSlots.join('; ')}.` };
          }
          return { ok: false, error: `No hay huecos para "${svcFound.name}" el ${formatFecha(fecha)} con ningún empleado.` };
        }
        const libres = dispResult.slots.slice(0, 5).map(s => s.startTime).join(', ');
        return { ok: false, error: `No hay hueco a las ${hora}. Horas disponibles: ${libres}` };
      }

      // 4. Datos del cliente — v1.9.0: la promesa ya corrió en paralelo
      const nombreCliente = cliente || 'Cliente recepción';
      const datosCRM = await datosCRMPromise;

      const partes = nombreCliente.split(' ');
      const contactDetails = {
        firstName: partes[0] || 'Cliente',
        lastName: partes.slice(1).join(' ') || ''
      };
      // v1.9.0: si encontramos datos en CRM, los pasamos a la centralita
      if (datosCRM) {
        if (datosCRM.email) contactDetails.email = datosCRM.email;
        if (datosCRM.telefono) contactDetails.phone = datosCRM.telefono;
      }

      // 5. Reservar
      const reservaResult = await reservarSimple({
        serviceId: svcFound.id,
        fechaISO: fecha,
        horaHHmm: hora,
        empleadoId: resource.id,
        durationMinutes: svcFound.duration || 30,
        price: svcFound.defaultPrice || 0,
        contactDetails,
        modoPago: 'LOCAL',
        memberContactId: datosCRM?.contactId || null,  // v1.9.0
        origenRecepcion: true
      });

      if (!reservaResult?.ok) return { ok: false, error: reservaResult?.error?.message || 'Error creando la reserva' };

      console.log(`${TAG} Reserva OK: ${reservaResult.bookingId} | ${reservaResult.price}€`);

      return {
        ok: true,
        bookingId: reservaResult.bookingId,
        mensaje: `Reserva creada: ${svcFound.name} con ${empleado} el ${formatFecha(fecha)} a las ${hora}. Cliente: ${nombreCliente}. Precio: ${reservaResult.price}€.`
      };
    } catch (e) {
      console.error(`${TAG} ejecutarReservaSimple ERROR:`, e);
      return { ok: false, error: e?.message || 'Error inesperado' };
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// v1.7.1: PRE-CHECK DISPONIBILIDAD SIMPLE — verificación ANTES del confirm
// ═══════════════════════════════════════════════════════════════════════════

export const preCheckDisponibilidadSimple = webMethod(
  Permissions.SiteMember,
  async ({ servicio, empleado, fecha, hora }) => {
    try {
      if (!servicio || !empleado || !fecha || !hora) return { ok: true };

      const svcFound = await findServiceByName(servicio);
      if (!svcFound) return { ok: false, error: `Servicio "${servicio}" no encontrado en el catálogo` };

      const staffResult = await getStaffResources();
      if (!staffResult?.ok) return { ok: true };
      const resource = findStaffResource(staffResult.staff, empleado);
      if (!resource) return { ok: false, error: `Empleado "${empleado}" no encontrado` };

      const dispResult = await consultarDisponibilidadSimple({
        serviceId: svcFound.id, fecha, staffId: resource.id,
        durationMinutes: svcFound.duration || 30
      });
      if (!dispResult?.ok) return { ok: true };

      const slotOK = dispResult.slots.find(s => s.startTime === hora);
      if (slotOK) return { ok: true };

      if (dispResult.slots.length === 0) {
        console.log(`${TAG} preCheck: 0 slots para ${empleado}. Consultando otros...`);
        const otherStaffWithSlots = [];
        for (const s of staffResult.staff) {
          if (s.id === resource.id || s.isExternal) continue;
          try {
            const otherDisp = await consultarDisponibilidadSimple({
              serviceId: svcFound.id, fecha, staffId: s.id,
              durationMinutes: svcFound.duration || 30
            });
            if (otherDisp?.ok && otherDisp.slots?.length > 0) {
              const nombre = normalizarStaff(s.name);
              const slotsQ = otherDisp.slots.filter(sl => {
                const m = parseInt(sl.startTime.split(':')[1]);
                return m % 15 === 0;
              });
              const horas = slotsQ.slice(0, 4).map(sl => sl.startTime).join(', ');
              otherStaffWithSlots.push(`${nombre} (${horas})`);
            }
          } catch (e) { /* skip */ }
        }
        if (otherStaffWithSlots.length > 0) {
          return { ok: false, error: `${empleado} no tiene asignado "${svcFound.name}". Empleados que sí lo hacen: ${otherStaffWithSlots.join('; ')}.` };
        }
        return { ok: false, error: `No hay huecos para "${svcFound.name}" el ${formatFecha(fecha)} con ningún empleado.` };
      }

      const libres = dispResult.slots.filter(sl => {
        const m = parseInt(sl.startTime.split(':')[1]);
        return m % 15 === 0;
      }).slice(0, 5).map(s => s.startTime).join(', ');
      return { ok: false, error: `No hay hueco a las ${hora} con ${empleado}. Horas disponibles: ${libres}` };

    } catch (e) {
      console.error(`${TAG} preCheckDisponibilidadSimple ERROR:`, e);
      return { ok: true };
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// HELPER: Buscar publicServiceId en SvMapeoServicios por nombre
// ═══════════════════════════════════════════════════════════════════════════

async function findColorServiceInMapeo(nombreServicio) {
  console.log(`${TAG} Buscando en SvMapeoServicios: "${nombreServicio}"`);
  const result = await wixData.query('SvMapeoServicios')
    .limit(50)
    .find({ suppressAuth: true });

  const items = result?.items || [];
  if (items.length === 0) return null;

  const busqueda = quitarAcentos(nombreServicio);
  const FILLER = new Set(['de', 'del', 'para', 'con', 'el', 'la', 'pelo', 'cabello', 'servicio', 'color', 'coloracion']);
  const keywords = busqueda.split(/\s+/).filter(w => w.length > 1 && !FILLER.has(w));

  let found = items.find(it => quitarAcentos(it.servicioPublico || '') === busqueda);

  if (!found && keywords.length > 0) {
    found = items.find(it => {
      const nombre = quitarAcentos(it.servicioPublico || '');
      return keywords.every(kw => nombre.includes(kw));
    });
  }

  if (!found) {
    found = items.find(it => {
      const nombre = quitarAcentos(it.servicioPublico || '');
      return nombre.includes(busqueda) || busqueda.includes(nombre);
    });
  }

  if (found) {
    console.log(`${TAG} Mapeo: "${found.servicioPublico}" → publicId=${found.idServicioPublico}`);
    return found;
  }

  const nombres = items.map(it => it.servicioPublico || '?').join(', ');
  console.log(`${TAG} No encontrado "${nombreServicio}" en SvMapeoServicios. Disponibles: ${nombres}`);
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// EJECUTAR RESERVA COLOR
// v1.9.0: Enriquecimiento de contactDetails con CRM lookup
// ═══════════════════════════════════════════════════════════════════════════

export const ejecutarReservaColor = webMethod(
  Permissions.SiteMember,
  async ({ servicio, empleado, fecha, hora, longitudPelo, corte, totalChecked, peinadoValue, tratamientoValue, cliente }) => {
    try {
      if (!servicio || !empleado || !fecha || !hora) {
        return { ok: false, error: 'Servicio, empleado, fecha y hora requeridos' };
      }

      console.log(`${TAG} ejecutarReservaColor: "${servicio}" | ${empleado} | ${fecha} ${hora} | long=${longitudPelo || 'M'} | corte=${corte || false} | completo=${totalChecked || false} | peinado=${peinadoValue || 'null'} | trat=${tratamientoValue || 'null'} | cliente=${cliente || '-'}`);

      // v1.9.0: búsqueda CRM EN PARALELO al inicio
      const nombreClienteEarly = cliente || 'Cliente recepción';
      const datosCRMPromise = resolverDatosClienteConTimeout(nombreClienteEarly);

      const mapeoItem = await findColorServiceInMapeo(servicio);
      if (!mapeoItem || !mapeoItem.idServicioPublico) {
        return { ok: false, error: `Servicio de color "${servicio}" no encontrado en el catálogo` };
      }

      const publicServiceId = mapeoItem.idServicioPublico;

      const staffResult = await getStaffResources();
      if (!staffResult?.ok) return { ok: false, error: 'No se pudieron cargar los empleados' };

      const resource = findStaffResource(staffResult.staff, empleado);
      if (!resource) return { ok: false, error: `Empleado "${empleado}" no encontrado` };

      console.log(`${TAG} → publicServiceId=${publicServiceId} | staff=${resource.name} (${resource.id})`);

      // v1.9.0: la promesa CRM ya corrió en paralelo
      const nombreCliente = cliente || 'Cliente recepción';
      const datosCRM = await datosCRMPromise;

      const partes = nombreCliente.split(' ');
      const contactDetails = {
        firstName: partes[0] || 'Cliente',
        lastName: partes.slice(1).join(' ') || '',
        email: datosCRM?.email || 'booking@hair-times.com',
        phone: datosCRM?.telefono || ''
      };

      const peloVal = longitudPelo || 'M';
      const resultado = await confirmarEnCalendario({
        publicServiceId,
        fechaISO: fecha,
        horaHHmm: hora,
        empleadoId: resource.id,
        empleado2Id: resource.id,
        peinadoValue: peinadoValue || null,
        tratamientoValue: tratamientoValue || null,
        longitud: peloVal,
        longitudPelo: peloVal,
        corteChecked: corte === true || corte === 'true' || corte === 'si' || corte === 'sí',
        totalChecked: totalChecked === true || totalChecked === 'true',
        notes: 'Reservado por AKIRA',
        guardarNota: false,
        memberContactId: datosCRM?.contactId || null,  // v1.9.0
        contactDetails,
        origenRecepcion: true,
        modoPago: 'LOCAL',
        origen: 'AKIRA'
      });

      if (!resultado?.ok) {
        return { ok: false, error: resultado?.error?.message || 'Error creando la reserva de color' };
      }

      console.log(`${TAG} Reserva color OK: ${resultado.price}€`);

      const extras = [];
      if (corte === true || corte === 'true' || corte === 'si' || corte === 'sí') extras.push('corte');
      if (totalChecked === true || totalChecked === 'true') extras.push('completo');
      if (peinadoValue) extras.push(`peinado ${peinadoValue}`);
      if (tratamientoValue) extras.push(`tratamiento ${tratamientoValue.toLowerCase()}`);
      if (longitudPelo && longitudPelo !== 'M') extras.push(`pelo ${longitudPelo}`);
      const extrasStr = extras.length > 0 ? ` (${extras.join(', ')})` : '';

      return {
        ok: true,
        bookingIds: resultado.bookingIds,
        mensaje: `Reserva creada: ${mapeoItem.servicioPublico}${extrasStr} con ${empleado} el ${formatFecha(fecha)} a las ${hora}. Cliente: ${nombreCliente}. Precio: ${resultado.price}€.`
      };

    } catch (e) {
      console.error(`${TAG} ejecutarReservaColor ERROR:`, e);
      return { ok: false, error: e?.message || 'Error inesperado' };
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// v1.4.0: EJECUTAR CANCELACIÓN
// v1.8.0: Acepta `servicio` y lo pasa a findBookingsByParams
// ═══════════════════════════════════════════════════════════════════════════

export const ejecutarCancelacion = webMethod(
  Permissions.SiteMember,
  async ({ cliente, empleado, fechaISO, hora, servicio }) => {
    try {
      if (!fechaISO) return { ok: false, error: 'Fecha requerida para cancelar' };
      if (!cliente && !empleado && !hora && !servicio) return { ok: false, error: 'Necesito al menos un dato para identificar la cita: nombre del cliente, empleado, hora o servicio.' };

      console.log(`${TAG} ejecutarCancelacion: cliente=${cliente || '-'} emp=${empleado || '-'} fecha=${fechaISO} hora=${hora || '-'} svc=${servicio || '-'}`);

      const { ok, grupos, totalDia } = await findBookingsByParams({ fechaISO, cliente, empleado, hora, servicio });
      if (!ok) return { ok: false, error: 'Error buscando las citas del día' };

      if (grupos.length === 0) {
        let desc = `No encontré ninguna cita el ${formatFecha(fechaISO)}`;
        if (cliente) desc += ` para ${cliente}`;
        if (empleado) desc += ` con ${empleado}`;
        if (hora) desc += ` a las ${hora}`;
        if (servicio) desc += ` de ${servicio}`;
        desc += `. Hay ${totalDia} citas ese día en total.`;
        return { ok: false, error: desc };
      }

      if (grupos.length > 1) {
        const lista = grupos.map(g =>
          `${g.hora} — ${g.cliente} (${g.servicios.join(', ') || 'servicios técnicos'}) con ${g.empleado}`
        ).join('; ');
        return { ok: false, error: `Encontré ${grupos.length} citas que coinciden: ${lista}. Sé más específico con el nombre, la hora o el empleado.` };
      }

      const grupo = grupos[0];
      const ids = grupo.bookings.map(b => b.bookingId);

      console.log(`${TAG} → Cancelando ${ids.length} bookings de ${grupo.cliente} a las ${grupo.hora}`);

      const result = await cancelarReservas({ bookingIds: ids, notificarCliente: false });

      if (!result?.ok) return { ok: false, error: result?.error || 'Error cancelando la reserva' };

      const svcDesc = grupo.servicios.length > 0 ? grupo.servicios.join(', ') : 'servicios';
      return {
        ok: true,
        mensaje: `Cita cancelada: ${svcDesc} de ${grupo.cliente} el ${formatFecha(fechaISO)} a las ${grupo.hora} con ${grupo.empleado}. ${result.exitosas} reservas canceladas.`
      };

    } catch (e) {
      console.error(`${TAG} ejecutarCancelacion ERROR:`, e);
      return { ok: false, error: e?.message || 'Error inesperado' };
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// v1.4.0: EJECUTAR MOVER RESERVA
// v1.8.0: Acepta `servicio` y lo pasa a findBookingsByParams
// ═══════════════════════════════════════════════════════════════════════════

export const ejecutarMoverReserva = webMethod(
  Permissions.SiteMember,
  async ({ cliente, empleado, fechaISO, hora, nuevaFechaISO, nuevaHora, nuevoEmpleado, servicio }) => {
    try {
      if (!fechaISO) return { ok: false, error: 'Fecha original requerida' };

      console.log(`${TAG} ejecutarMoverReserva: cliente=${cliente || '-'} emp=${empleado || '-'} ${fechaISO} ${hora || '-'} → ${nuevaFechaISO || 'misma'} ${nuevaHora || 'misma'} nuevoEmp=${nuevoEmpleado || '-'} svc=${servicio || '-'}`);

      let nuevoStaffId = null;
      let nuevoStaffScheduleId = null;
      if (nuevoEmpleado) {
        const staffResult = await getStaffResources();
        if (!staffResult?.ok) return { ok: false, error: 'No se pudieron cargar los empleados' };
        const nuevoResource = findStaffResource(staffResult.staff, nuevoEmpleado);
        if (!nuevoResource) return { ok: false, error: `Empleado "${nuevoEmpleado}" no encontrado` };
        nuevoStaffId = nuevoResource.id;
        nuevoStaffScheduleId = nuevoResource.scheduleId || '';
        console.log(`${TAG} → Reasignar a ${nuevoEmpleado}: id=${nuevoStaffId}`);
      }

      const { ok, grupos, totalDia } = await findBookingsByParams({ fechaISO, cliente, empleado, hora, servicio });
      if (!ok) return { ok: false, error: 'Error buscando las citas del día' };

      if (grupos.length === 0) {
        let desc = `No encontré ninguna cita el ${formatFecha(fechaISO)}`;
        if (cliente) desc += ` para ${cliente}`;
        if (empleado) desc += ` con ${empleado}`;
        if (hora) desc += ` a las ${hora}`;
        if (servicio) desc += ` de ${servicio}`;
        desc += `. Hay ${totalDia} citas ese día en total.`;
        return { ok: false, error: desc };
      }

      if (grupos.length > 1) {
        const lista = grupos.map(g =>
          `${g.hora} — ${g.cliente} (${g.servicios.join(', ') || 'servicios técnicos'}) con ${g.empleado}`
        ).join('; ');
        return { ok: false, error: `Encontré ${grupos.length} citas que coinciden: ${lista}. Sé más específico.` };
      }

      const grupo = grupos[0];

      const nuevaHoraFinal = nuevaHora || grupo.hora;
      if (!nuevaHora) console.log(`${TAG} → nuevaHora vacía, usando hora original: ${grupo.hora}`);

      const nuevaFechaFinal = nuevaFechaISO || fechaISO;
      if (!nuevaFechaISO) console.log(`${TAG} → nuevaFechaISO vacía, usando fecha original: ${fechaISO}`);

      const servicios = grupo.bookings.map(b => ({
        bookingId: b.bookingId,
        serviceId: b.serviceId,
        staffId: nuevoStaffId || b.staffId,
        revision: b.revision,
        scheduleId: nuevoStaffScheduleId || b.scheduleId,
        startDate: b.startDate,
        endDate: b.endDate
      }));

      console.log(`${TAG} → Moviendo ${servicios.length} bookings de ${grupo.cliente}: ${fechaISO} ${grupo.hora} → ${nuevaFechaISO} ${nuevaHora}`);

      const result = await cambiarFechaBookings({
        servicios,
        nuevaFechaISO: nuevaFechaFinal,
        nuevaHoraHHmm: nuevaHoraFinal,
        forzado: true
      });

      if (!result?.ok) return { ok: false, error: result?.error || 'Error moviendo la reserva' };

      const svcDesc = grupo.servicios.length > 0 ? grupo.servicios.join(', ') : 'servicios';
      const reasignarMsg = nuevoEmpleado ? ` Reasignada de ${grupo.empleado} a ${nuevoEmpleado}.` : '';
      return {
        ok: true,
        mensaje: `Cita movida: ${svcDesc} de ${grupo.cliente}. De ${formatFecha(fechaISO)} a las ${grupo.hora} → ${formatFecha(nuevaFechaFinal)} a las ${nuevaHoraFinal}.${reasignarMsg} ${result.exitosos} reservas cambiadas.`
      };

    } catch (e) {
      console.error(`${TAG} ejecutarMoverReserva ERROR:`, e);
      return { ok: false, error: e?.message || 'Error inesperado' };
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// v1.5.0: EJECUTAR AÑADIR COMPLEMENTO
// v1.9.0: Enriquecimiento de contactDetails con CRM lookup
// ═══════════════════════════════════════════════════════════════════════════

export const ejecutarAnadirComplemento = webMethod(
  Permissions.SiteMember,
  async ({ complemento, cliente, fechaISO, empleado, hora }) => {
    try {
      if (!complemento) return { ok: false, error: 'Dime qué complemento quieres añadir (corte, peinado, tratamiento...)' };
      if (!fechaISO) return { ok: false, error: 'Necesito la fecha de la cita' };
      if (!cliente && !empleado && !hora) return { ok: false, error: 'Necesito identificar la cita: nombre del cliente, empleado u hora.' };

      console.log(`${TAG} ejecutarAnadirComplemento: "${complemento}" | cliente=${cliente || '-'} | ${fechaISO}`);

      const { ok, grupos, totalDia } = await findBookingsByParams({ fechaISO, cliente, empleado, hora });
      if (!ok) return { ok: false, error: 'Error buscando las citas del día' };
      if (grupos.length === 0) {
        let desc = `No encontré ninguna cita el ${formatFecha(fechaISO)}`;
        if (cliente) desc += ` para ${cliente}`;
        desc += `. Hay ${totalDia} citas ese día.`;
        return { ok: false, error: desc };
      }
      if (grupos.length > 1) {
        const lista = grupos.map(g => `${g.hora} — ${g.cliente} con ${g.empleado}`).join('; ');
        return { ok: false, error: `Encontré ${grupos.length} citas: ${lista}. Sé más específico.` };
      }
      const grupo = grupos[0];

      const svcIds = new Set(grupo.bookings.map(b => b.serviceId).filter(Boolean));
      const SVC_FIELDS = ['idServicioPublico', 'idAplicacion', 'idTecnicoAplicacionTotal', 'idProceso', 'idLavadoPrevio', 'idFinal'];

      const mapeoResult = await wixData.query('SvMapeoServicios').limit(50).find({ suppressAuth: true });
      const mapeoItems = mapeoResult?.items || [];
      let mapeoRow = null;
      let bestCount = 0;
      for (const row of mapeoItems) {
        const count = SVC_FIELDS.filter(f => row[f] && svcIds.has(row[f])).length;
        if (count > bestCount) {
          bestCount = count;
          mapeoRow = row;
        }
      }

      if (!mapeoRow) {
        return { ok: false, error: `La cita de ${grupo.cliente} no es un servicio con complementos mapeados en KAMISUITE.` };
      }
      console.log(`${TAG} Mapeo encontrado: "${mapeoRow.servicioPublico}" (${mapeoRow.idServicioPublico})`);

      const busqComp = quitarAcentos(complemento);
      let compId = null;
      let compMin = 30;
      let compNombre = complemento;

      if (busqComp.includes('corte')) {
        compId = mapeoRow.idCorte; compMin = mapeoRow.minCorte || 30; compNombre = 'Corte';
      } else if (busqComp.includes('peinado')) {
        if (busqComp.includes('xl') || busqComp.includes('extralargo')) {
          compId = mapeoRow.idPeinadoXl; compMin = mapeoRow.minPeinadoXl || 30; compNombre = 'Peinado XL';
        } else if (busqComp.includes(' l') || busqComp.includes('largo')) {
          compId = mapeoRow.idPeinadoL; compMin = mapeoRow.minPeinadoL || 25; compNombre = 'Peinado L';
        } else if (busqComp.includes(' s') || busqComp.includes('corto')) {
          compId = mapeoRow.idPeinadoS; compMin = mapeoRow.minPeinadoS || 20; compNombre = 'Peinado S';
        } else {
          compId = mapeoRow.idPeinadoM; compMin = mapeoRow.minPeinadoM || 25; compNombre = 'Peinado M';
        }
      } else if (busqComp.includes('kerastase') || busqComp.includes('kerast')) {
        compId = mapeoRow.idTratKerastase; compMin = mapeoRow.minTratKerastase || 15; compNombre = 'Tratamiento Kerastase';
      } else if (busqComp.includes('hairtimes') || busqComp.includes('hair')) {
        compId = mapeoRow.idTratHairtimes; compMin = mapeoRow.minTratHairtimes || 15; compNombre = 'Tratamiento HairTimes';
      } else if (busqComp.includes('matiz')) {
        compId = mapeoRow.idMatiz; compMin = mapeoRow.minMatiz || 10; compNombre = 'Matiz';
      } else if (busqComp.includes('secado')) {
        compId = mapeoRow.idSecado; compMin = mapeoRow.minSecado || 15; compNombre = 'Secado';
      }

      if (!compId) {
        return { ok: false, error: `El servicio "${mapeoRow.servicioPublico}" no tiene complemento "${complemento}" mapeado. Complementos disponibles: corte, peinado (S/M/L/XL), tratamiento kerastase, tratamiento hairtimes, matiz, secado.` };
      }
      console.log(`${TAG} Complemento: ${compNombre} → serviceId=${compId} dur=${compMin}min`);

      const lastBooking = grupo.bookings[grupo.bookings.length - 1];
      const endDate = new Date(lastBooking.endMs);
      const horaInicio = endDate.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });

      // v1.9.0: lanzar búsqueda CRM EN PARALELO con getStaffResources
      const datosCRMPromise = resolverDatosClienteConTimeout(grupo.cliente);

      const staffResult = await getStaffResources();
      if (!staffResult?.ok) return { ok: false, error: 'No se pudieron cargar los empleados' };
      const resource = findStaffResource(staffResult.staff, grupo.empleado);
      if (!resource) return { ok: false, error: `Empleado "${grupo.empleado}" no encontrado` };

      // v1.9.0: la promesa CRM ya corrió en paralelo
      const datosCRM = await datosCRMPromise;

      const partes = (grupo.cliente || 'Cliente').split(' ');
      const contactDetails = {
        firstName: partes[0] || 'Cliente',
        lastName: partes.slice(1).join(' ') || ''
      };
      if (datosCRM) {
        if (datosCRM.email) contactDetails.email = datosCRM.email;
        if (datosCRM.telefono) contactDetails.phone = datosCRM.telefono;
      }

      console.log(`${TAG} Añadiendo ${compNombre} a las ${horaInicio} con ${grupo.empleado} para ${grupo.cliente}`);
      const reservaResult = await reservarSimple({
        serviceId: compId,
        fechaISO,
        horaHHmm: horaInicio,
        empleadoId: resource.id,
        durationMinutes: compMin,
        price: 0,
        contactDetails,
        modoPago: 'LOCAL',
        memberContactId: datosCRM?.contactId || null,  // v1.9.0
        origenRecepcion: true
      });

      if (!reservaResult?.ok) {
        const errMsg = typeof reservaResult?.error === 'string' ? reservaResult.error : reservaResult?.error?.message || 'Error desconocido';
        return { ok: false, error: `No pude añadir ${compNombre}: ${errMsg}` };
      }

      console.log(`${TAG} Complemento OK: ${reservaResult.bookingId}`);
      const svcDesc = grupo.servicios.length > 0 ? grupo.servicios.join(', ') : 'cita';
      return {
        ok: true,
        bookingId: reservaResult.bookingId,
        mensaje: `${compNombre} añadido a la cita de ${grupo.cliente} (${svcDesc}) el ${formatFecha(fechaISO)} a las ${horaInicio} con ${grupo.empleado}.`
      };

    } catch (e) {
      console.error(`${TAG} ejecutarAnadirComplemento ERROR:`, e);
      return { ok: false, error: e?.message || 'Error inesperado' };
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// v1.6.0: EJECUTAR ELIMINAR COMPLEMENTO
// ═══════════════════════════════════════════════════════════════════════════

export const ejecutarEliminarComplemento = webMethod(
  Permissions.SiteMember,
  async ({ complemento, cliente, fechaISO, empleado, hora }) => {
    try {
      if (!complemento) return { ok: false, error: 'Dime qué complemento quieres eliminar (corte, peinado, tratamiento...)' };
      if (!fechaISO) return { ok: false, error: 'Necesito la fecha de la cita' };
      if (!cliente && !empleado && !hora) return { ok: false, error: 'Necesito identificar la cita: nombre del cliente, empleado u hora.' };

      console.log(`${TAG} ejecutarEliminarComplemento: "${complemento}" | cliente=${cliente || '-'} | ${fechaISO} | emp=${empleado || '-'} | hora=${hora || '-'}`);

      const { ok, grupos, totalDia } = await findBookingsByParams({ fechaISO, cliente, empleado, hora });
      if (!ok) return { ok: false, error: 'Error buscando las citas del día' };

      if (grupos.length === 0) {
        let desc = `No encontré ninguna cita el ${formatFecha(fechaISO)}`;
        if (cliente) desc += ` para ${cliente}`;
        return { ok: false, error: desc };
      }

      if (grupos.length > 1) {
        const lista = grupos.map(g =>
          `${g.hora} — ${g.cliente} con ${g.empleado}`
        ).join('; ');
        return { ok: false, error: `Encontré ${grupos.length} citas: ${lista}. Sé más específico.` };
      }

      const grupo = grupos[0];

      const svcIds = new Set(grupo.bookings.map(b => b.serviceId).filter(Boolean));
      const SVC_FIELDS = ['idServicioPublico', 'idAplicacion', 'idTecnicoAplicacionTotal', 'idProceso', 'idLavadoPrevio', 'idFinal'];

      const mapeoResult = await wixData.query('SvMapeoServicios').limit(50).find({ suppressAuth: true });
      const mapeoItems = mapeoResult?.items || [];
      let mapeoRow = null;
      let bestCount = 0;
      for (const row of mapeoItems) {
        const count = SVC_FIELDS.filter(f => row[f] && svcIds.has(row[f])).length;
        if (count > bestCount) {
          bestCount = count;
          mapeoRow = row;
        }
      }

      if (!mapeoRow) {
        return { ok: false, error: `La cita de ${grupo.cliente} no es un servicio con complementos mapeados en KAMISUITE.` };
      }
      console.log(`${TAG} Mapeo encontrado: "${mapeoRow.servicioPublico}" (${mapeoRow.idServicioPublico})`);

      const busqComp = quitarAcentos(complemento);
      let targetIds = [];
      let compNombre = complemento;

      if (busqComp.includes('corte')) {
        targetIds = [mapeoRow.idCorte].filter(Boolean); compNombre = 'Corte';
      } else if (busqComp.includes('peinado')) {
        targetIds = [mapeoRow.idPeinadoS, mapeoRow.idPeinadoM, mapeoRow.idPeinadoL, mapeoRow.idPeinadoXl].filter(Boolean); compNombre = 'Peinado';
      } else if (busqComp.includes('kerastase') || busqComp.includes('kerast')) {
        targetIds = [mapeoRow.idTratKerastase].filter(Boolean); compNombre = 'Tratamiento Kerastase';
      } else if (busqComp.includes('hairtimes') || busqComp.includes('hair')) {
        targetIds = [mapeoRow.idTratHairtimes].filter(Boolean); compNombre = 'Tratamiento HairTimes';
      } else if (busqComp.includes('matiz')) {
        targetIds = [mapeoRow.idMatiz].filter(Boolean); compNombre = 'Matiz';
      } else if (busqComp.includes('secado')) {
        targetIds = [mapeoRow.idSecado].filter(Boolean); compNombre = 'Secado';
      } else if (busqComp.includes('planchado')) {
        targetIds = [
          mapeoRow.idPlanchadoMnanoplastia, mapeoRow.idPlanchadoLnanoplastia, mapeoRow.idPlanchadoXLnanoplastia,
          mapeoRow.id_planchado_botox_mediano, mapeoRow.id_planchado_botox_largo, mapeoRow.id_planchado_botox_superlargo
        ].filter(Boolean);
        compNombre = 'Planchado';
      }

      if (targetIds.length === 0) {
        return { ok: false, error: `El servicio "${mapeoRow.servicioPublico}" no tiene complemento "${complemento}" mapeado. Complementos disponibles: corte, peinado, tratamiento kerastase, tratamiento hairtimes, matiz, secado.` };
      }

      console.log(`${TAG} Buscando booking con serviceId en [${targetIds.join(', ')}]`);

      const targetSet = new Set(targetIds);
      const bookingComplemento = grupo.bookings.find(b => targetSet.has(b.serviceId));

      if (!bookingComplemento) {
        const complementosPresentes = [];
        const allCompIds = {
          'Corte': [mapeoRow.idCorte].filter(Boolean),
          'Peinado': [mapeoRow.idPeinadoS, mapeoRow.idPeinadoM, mapeoRow.idPeinadoL, mapeoRow.idPeinadoXl].filter(Boolean),
          'Trat. Kerastase': [mapeoRow.idTratKerastase].filter(Boolean),
          'Trat. HairTimes': [mapeoRow.idTratHairtimes].filter(Boolean),
          'Matiz': [mapeoRow.idMatiz].filter(Boolean),
          'Secado': [mapeoRow.idSecado].filter(Boolean)
        };
        for (const [nombre, ids] of Object.entries(allCompIds)) {
          if (ids.length > 0 && grupo.bookings.some(b => ids.includes(b.serviceId))) {
            complementosPresentes.push(nombre);
          }
        }
        const presentesMsg = complementosPresentes.length > 0
          ? `Complementos que sí tiene: ${complementosPresentes.join(', ')}.`
          : `No tiene ningún complemento mapeado.`;
        return { ok: false, error: `No encontré ${compNombre} en la cita de ${grupo.cliente}. ${presentesMsg}` };
      }

      console.log(`${TAG} → Eliminando ${compNombre} (serviceId=${bookingComplemento.serviceId}, bookingId=${bookingComplemento.bookingId}) de la cita de ${grupo.cliente}`);

      const result = await cancelarReservas({ bookingIds: [bookingComplemento.bookingId], notificarCliente: false });

      if (!result?.ok) return { ok: false, error: result?.error || 'Error eliminando el complemento' };

      return {
        ok: true,
        mensaje: `${compNombre} eliminado de la cita de ${grupo.cliente} del ${formatFecha(fechaISO)} con ${grupo.empleado}. El resto de la cita sigue en pie.`
      };

    } catch (e) {
      console.error(`${TAG} ejecutarEliminarComplemento ERROR:`, e);
      return { ok: false, error: e?.message || 'Error inesperado' };
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// v1.6.0: EJECUTAR ELIMINAR BLOQUEO
// ═══════════════════════════════════════════════════════════════════════════

export const ejecutarEliminarBloqueo = webMethod(
  Permissions.SiteMember,
  async ({ empleado, fechaISO, horaInicio }) => {
    try {
      if (!empleado || !fechaISO) return { ok: false, error: 'Empleado y fecha requeridos' };

      console.log(`${TAG} ejecutarEliminarBloqueo: ${empleado} | ${fechaISO} | hora=${horaInicio || 'cualquiera'}`);

      const staffResult = await getStaffResources();
      if (!staffResult?.ok) return { ok: false, error: 'No se pudieron cargar los empleados' };

      const resource = findStaffResource(staffResult.staff, empleado);
      if (!resource) return { ok: false, error: `Empleado "${empleado}" no encontrado` };

      const staffScheduleMap = {};
      for (const s of staffResult.staff) {
        if (s.scheduleId) staffScheduleMap[s.scheduleId] = s.id;
      }

      const diaResult = await getTodasReservasDia({ fecha: fechaISO, staffScheduleMap, externalResourceIds: [] });
      if (!diaResult?.ok) return { ok: false, error: 'Error obteniendo las reservas del día' };

      const bloqueos = (diaResult.reservas || []).filter(r => {
        if (r.resourceId !== resource.id) return false;
        if (r.tipo === 'bloqueo') return true;
        if (r.tipo === 'extension') {
          const notesStr = r.notes || '';
          const afterPrefix = notesStr.replace('EXTENSIÓN:', '').trim();
          if (afterPrefix === '') return true;
          if (notesStr.includes('BLOQUEO')) return true;
          if (afterPrefix.startsWith('DESCANSO_')) return true;
          return false;
        }
        return false;
      });

      if (bloqueos.length === 0) {
        return { ok: false, error: `No encontré ningún bloqueo de ${empleado} el ${formatFecha(fechaISO)}.` };
      }

      let target = bloqueos[0];
      if (horaInicio) {
        const match = bloqueos.find(b => b.startTime === horaInicio);
        if (match) {
          target = match;
        } else {
          const horaH = horaInicio.split(':')[0];
          const matchH = bloqueos.find(b => b.startTime.startsWith(horaH + ':'));
          if (matchH) {
            target = matchH;
          } else {
            const listaBloqueos = bloqueos.map(b => `${b.startTime}-${b.endTime}`).join(', ');
            return { ok: false, error: `No encontré bloqueo de ${empleado} a las ${horaInicio}. Bloqueos ese día: ${listaBloqueos}` };
          }
        }
      } else if (bloqueos.length > 1) {
        const listaBloqueos = bloqueos.map(b => `${b.startTime}-${b.endTime}`).join(', ');
        return { ok: false, error: `${empleado} tiene ${bloqueos.length} bloqueos ese día: ${listaBloqueos}. Dime cuál quieres eliminar.` };
      }

      console.log(`${TAG} → Eliminando bloqueo: ${target.bookingId} (${target.startTime}-${target.endTime})`);

      const result = await eliminarExtension({ sessionId: target.bookingId });
      if (!result?.ok) return { ok: false, error: result?.error?.message || 'Error eliminando el bloqueo' };

      return {
        ok: true,
        mensaje: `Bloqueo de ${empleado} eliminado del ${formatFecha(fechaISO)} (${target.startTime}-${target.endTime}).`
      };

    } catch (e) {
      console.error(`${TAG} ejecutarEliminarBloqueo ERROR:`, e);
      return { ok: false, error: e?.message || 'Error inesperado' };
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// v1.6.0: EJECUTAR CAMBIAR SERVICIO
// v1.9.0: Enriquecimiento de contactDetails con CRM lookup
// ═══════════════════════════════════════════════════════════════════════════

export const ejecutarCambiarServicio = webMethod(
  Permissions.SiteMember,
  async ({ nuevoServicio, familiaServicio, cliente, fechaISO, empleado, hora,
           corte, totalChecked, peinadoValue, tratamientoValue, longitudPelo }) => {
    try {
      if (!nuevoServicio) return { ok: false, error: 'Necesito saber el nuevo servicio' };
      if (!fechaISO) return { ok: false, error: 'Necesito la fecha de la cita' };
      if (!cliente && !empleado && !hora) return { ok: false, error: 'Necesito identificar la cita: cliente, empleado u hora' };

      console.log(`${TAG} ejecutarCambiarServicio: "${nuevoServicio}" (${familiaServicio || 'auto'}) | cliente=${cliente || '-'} | ${fechaISO} ${hora || '-'}`);

      const { ok, grupos, totalDia } = await findBookingsByParams({ fechaISO, cliente, empleado, hora });
      if (!ok) return { ok: false, error: 'Error buscando las citas del día' };
      if (grupos.length === 0) {
        let desc = `No encontré ninguna cita el ${formatFecha(fechaISO)}`;
        if (cliente) desc += ` para ${cliente}`;
        return { ok: false, error: desc };
      }
      if (grupos.length > 1) {
        const lista = grupos.map(g => `${g.hora} — ${g.cliente} con ${g.empleado}`).join('; ');
        return { ok: false, error: `Encontré ${grupos.length} citas: ${lista}. Sé más específico.` };
      }
      const grupo = grupos[0];

      const svcIds = new Set(grupo.bookings.map(b => b.serviceId).filter(Boolean));
      const SVC_FIELDS = ['idServicioPublico', 'idAplicacion', 'idTecnicoAplicacionTotal', 'idProceso', 'idLavadoPrevio', 'idFinal'];
      const mapeoResult = await wixData.query('SvMapeoServicios').limit(50).find({ suppressAuth: true });
      const mapeoItems = mapeoResult?.items || [];
      let mapeoRow = null;
      let bestCount = 0;
      for (const row of mapeoItems) {
        const count = SVC_FIELDS.filter(f => row[f] && svcIds.has(row[f])).length;
        if (count > bestCount) { bestCount = count; mapeoRow = row; }
      }

      const detected = { corte: false, peinadoValue: null, tratamientoValue: null, totalChecked: false };

      if (mapeoRow) {
        for (const b of grupo.bookings) {
          const sid = b.serviceId;
          if (sid === mapeoRow.idCorte) detected.corte = true;
          if (sid === mapeoRow.idPeinadoS) detected.peinadoValue = 'S';
          if (sid === mapeoRow.idPeinadoM) detected.peinadoValue = 'M';
          if (sid === mapeoRow.idPeinadoL) detected.peinadoValue = 'L';
          if (sid === mapeoRow.idPeinadoXl) detected.peinadoValue = 'XL';
          if (sid === mapeoRow.idTratKerastase) detected.tratamientoValue = 'KERASTASE';
          if (sid === mapeoRow.idTratHairtimes) detected.tratamientoValue = 'HAIRTIMES';
          if (sid === mapeoRow.idMatiz) detected.tratamientoValue = 'MATIZ';
          if (sid === mapeoRow.idTecnicoAplicacionTotal) detected.totalChecked = true;
        }
        console.log(`${TAG} Complementos detectados: corte=${detected.corte} peinado=${detected.peinadoValue} trat=${detected.tratamientoValue} completo=${detected.totalChecked}`);
      }

      const mergedCorte = corte !== undefined && corte !== null ? (corte === true || corte === 'true') : detected.corte;
      const mergedTotal = totalChecked !== undefined && totalChecked !== null ? (totalChecked === true || totalChecked === 'true') : detected.totalChecked;
      const mergedPeinado = peinadoValue || detected.peinadoValue;
      const mergedTrat = tratamientoValue || detected.tratamientoValue;
      const mergedLong = longitudPelo || 'M';

      console.log(`${TAG} Merged: corte=${mergedCorte} peinado=${mergedPeinado} trat=${mergedTrat} completo=${mergedTotal} long=${mergedLong}`);

      const ids = grupo.bookings.map(b => b.bookingId);
      console.log(`${TAG} → Cancelando ${ids.length} bookings de ${grupo.cliente}`);
      const cancelResult = await cancelarReservas({ bookingIds: ids, notificarCliente: false });
      if (!cancelResult?.ok) return { ok: false, error: 'Error cancelando la cita actual: ' + (cancelResult?.error || 'desconocido') };

      const svcDescOld = grupo.servicios.length > 0 ? grupo.servicios.join(', ') : 'servicios';

      // v1.9.0: lanzar búsqueda CRM EN PARALELO con getStaffResources
      const nombreClienteEarly = grupo.cliente || 'Cliente recepción';
      const datosCRMPromise = resolverDatosClienteConTimeout(nombreClienteEarly);

      const staffResult = await getStaffResources();
      if (!staffResult?.ok) return { ok: false, error: 'No se pudieron cargar los empleados' };
      const resource = findStaffResource(staffResult.staff, grupo.empleado);
      if (!resource) return { ok: false, error: `Empleado "${grupo.empleado}" no encontrado` };

      // v1.9.0: la promesa CRM ya corrió en paralelo
      const nombreCliente = grupo.cliente || 'Cliente recepción';
      const datosCRM = await datosCRMPromise;

      const partes = nombreCliente.split(' ');
      const contactDetails = {
        firstName: partes[0] || 'Cliente',
        lastName: partes.slice(1).join(' ') || '',
        email: datosCRM?.email || 'booking@hair-times.com',
        phone: datosCRM?.telefono || ''
      };

      const familia = familiaServicio || 'coloracion';
      let reservaResult;

      if (familia === 'simple') {
        const svcFound = await findServiceByName(nuevoServicio);
        if (!svcFound) return { ok: false, error: `Cita cancelada pero servicio "${nuevoServicio}" no encontrado. Recrea manualmente.` };
        reservaResult = await reservarSimple({
          serviceId: svcFound.id,
          fechaISO,
          horaHHmm: grupo.hora,
          empleadoId: resource.id,
          durationMinutes: svcFound.duration || 30,
          price: svcFound.defaultPrice || 0,
          contactDetails,
          modoPago: 'LOCAL',
          memberContactId: datosCRM?.contactId || null,  // v1.9.0
          origenRecepcion: true
        });
      } else {
        const mapeoNuevo = await findColorServiceInMapeo(nuevoServicio);
        if (!mapeoNuevo || !mapeoNuevo.idServicioPublico) {
          return { ok: false, error: `Cita cancelada pero servicio "${nuevoServicio}" no encontrado en el catálogo de color. Recrea manualmente.` };
        }
        reservaResult = await confirmarEnCalendario({
          publicServiceId: mapeoNuevo.idServicioPublico,
          fechaISO,
          horaHHmm: grupo.hora,
          empleadoId: resource.id,
          empleado2Id: resource.id,
          peinadoValue: mergedPeinado,
          tratamientoValue: mergedTrat,
          longitud: mergedLong,
          longitudPelo: mergedLong,
          corteChecked: mergedCorte,
          totalChecked: mergedTotal,
          notes: 'Reservado por AKIRA (cambio de servicio)',
          guardarNota: false,
          memberContactId: datosCRM?.contactId || null,  // v1.9.0
          contactDetails,
          origenRecepcion: true,
          modoPago: 'LOCAL',
          origen: 'AKIRA'
        });
      }

      if (!reservaResult?.ok) {
        const errMsg = reservaResult?.error?.message || reservaResult?.error || 'Error desconocido';
        return { ok: false, error: `Cita anterior cancelada pero no pude crear la nueva: ${errMsg}. Recrea manualmente.` };
      }

      const extras = [];
      if (mergedCorte) extras.push('corte');
      if (mergedTotal) extras.push('completo');
      if (mergedPeinado) extras.push(`peinado ${mergedPeinado}`);
      if (mergedTrat) extras.push(mergedTrat.toLowerCase());
      const extrasStr = extras.length > 0 ? ` (${extras.join(', ')})` : '';
      const precio = reservaResult.price || reservaResult.precio || '';
      const precioStr = precio ? ` Precio: ${precio}€.` : '';

      return {
        ok: true,
        mensaje: `Servicio cambiado: ${svcDescOld} → ${nuevoServicio}${extrasStr} para ${grupo.cliente} el ${formatFecha(fechaISO)} a las ${grupo.hora} con ${grupo.empleado}.${precioStr}`
      };

    } catch (e) {
      console.error(`${TAG} ejecutarCambiarServicio ERROR:`, e);
      return { ok: false, error: e?.message || 'Error inesperado' };
    }
  }
);