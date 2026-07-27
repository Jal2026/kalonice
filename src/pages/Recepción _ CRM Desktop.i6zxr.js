// =====================================================
// KAMISUITE - Page Code Ficha Cliente CRM
// =====================================================
// VERSION: 1.9.3
// FECHA: 6 de julio de 2026
//
// CHANGELOG:
// v1.9.3 (06-Jul-2026) — HOTFIX case 'crearContacto':
//   - Se retira la llamada a cargarDatosCliente(r.contactId) después
//     de 'contactoCreado'. Motivo: el widget desktop v1.7.4 / mobile
//     v1.1.2 delega la apertura del recién creado en su función
//     seleccionarCliente(id, nombreCompleto), que además de disparar
//     'clienteSeleccionado' (que ya ejecuta cargarDatosCliente en este
//     mismo pagecode), pone state.contactId = id — clave del fix.
//     Sin ese reset del state.contactId en el widget, los botones de
//     editar sexo, fecha de nacimiento, notas, etc. no funcionaban
//     hasta refrescar la página.
//     Si el pagecode dejase su cargarDatosCliente Y el widget dispara
//     clienteSeleccionado, se producirían DOS llamadas al backend
//     (getFichaCliente + care* duplicados). Por eso el pagecode ya
//     no la lanza — la delega en el flujo probado del widget.
//   - Renombrado 'DUPLICATE_EMAIL' → 'DUPLICATE_PHONE' (paridad con
//     backend v1.9.11; Wix bloquea email duplicado en createContact,
//     así que la rama antigua nunca se activaba).
//   - Renombrado envío 'contactoDuplicadoEmail' → 'contactoDuplicadoTelefono'.
//   - Los mensajes a la UI ya NO reenvían textos de error crudos del
//     backend (backend v1.9.11 devuelve error.code sin error.message).
//     Cualquier otro fallo se traduce a 'contactoError' — un aviso
//     dentro del modal de alta con texto fijo en español (widget), en
//     lugar de 'fichaError' que sacaba toast a pantalla.
//   - Sin cambios en el resto del switch, imports ni helpers.
//
// v1.9.2 (06-Jul-2026) — Alta de contactos desde el CRM
//   - NEW: case 'crearContacto' → crearContactoCRM (nuevo webMethod
//     del backend v1.9.10). Payload {nombre, apellido, telefono, email,
//     fechaNacimiento?, sexo?, allowDuplicates?}. En éxito:
//       1) push del cliente al cache (cachedClientes) para que aparezca
//          inmediatamente en las búsquedas locales.
//       2) sendToWidget('contactoCreado', {contactId, cliente}) —
//          el widget cierra el modal y muestra toast.
//       3) cargarDatosCliente(contactId) — abre automáticamente la
//          ficha del recién creado, mismo flujo que 'clienteSeleccionado'.
//     En duplicado (DUPLICATE_EMAIL): sendToWidget('contactoDuplicadoEmail',
//     {message}). El widget muestra aviso al operador y reintenta con
//     allowDuplicates=true si el usuario confirma.
//     En error genérico: sendToWidget('fichaError', {message}).
//   - Import ampliado: se añade `crearContactoCRM` al import existente
//     de backend/fichaClienteLogic.web (misma línea).
//   - Sin cambios en el resto del switch, imports ni helpers.
//
// v1.9.1 (01-Jul-2026) — Fecha de nacimiento (campo nativo Wix)
//   - NEW: case 'guardarFechaNacimiento' → actualizarContactoCRM
//     con { contactId, fechaNacimiento }. El backend v1.9.8 la
//     escribe como contact.info.birthdate (NATIVO Wix Contacts,
//     no extendedFields). Payload: valor = 'YYYY-MM-DD' o '' para
//     limpiar. Mismo patrón que guardarUltimaVisita.
//   - El case 'toggleClubKalonice' se mantiene por compatibilidad
//     hacia atrás pero el widget v1.7.2 ya no lo dispara.
//   - Todo lo demás (foto, cupones, campos personalizados,
//     clasificación demográfica, próximas citas) INTACTO.
//
// v1.9.0 (16-Jun-2026) — Evolución del CRM Agenda de Contactos
//   - FIX: case 'subirFoto' (antes mal nombrado 'actualizarFoto', no
//     se ejecutaba porque el widget envía 'subirFoto'). Llama al
//     backend actualizarFotoCliente v1.9.0 con la nueva firma
//     {contactId, base64Data, fileName, mimeType}. Tras éxito,
//     recarga la ficha para que el widget pinte la foto nueva con
//     la URL definitiva devuelta por Wix.
//   - NEW: cases para guardar campos personalizados de Wix Contacts:
//       · 'guardarNotasPublicas'      → customnotaspublicas
//       · 'guardarNotasColor'         → color
//       · 'guardarNotasTratamientos'  → tratamientos
//       · 'guardarUltimaVisita'       → ultima_visita (tipo Fecha)
//       · 'toggleClubKalonice'        → club_kalonice (checkbox)
//       · 'guardarSexo'               → sexo
//     Todos van a actualizarContactoCRM con campos opcionales
//     (READ-MERGE-UPDATE puro). NO recargan ficha — solo emiten
//     fichaOk/fichaError. El widget mantiene su estado local.
//   - NEW: cases para gestión de cupones nativos Wix (independientes
//     del cliente seleccionado):
//       · 'cargarCupones'   → listarCupones
//       · 'crearCupon'      → crearCupon
//       · 'editarCupon'     → actualizarCupon
//       · 'obtenerCupon'    → obtenerCupon (para abrir modal edición)
//       · 'toggleCupon'     → activarDesactivarCupon
//       · 'eliminarCupon'   → eliminarCupon
//     Respuestas con tipos específicos ('cuponesListados',
//     'cuponCreado', 'cuponActualizado', 'cuponToggled',
//     'cuponEliminado', 'cuponObtenido') para no mezclar con
//     mensajes del flujo del cliente.
//   - El bloque v1.8.0 de clasificación demográfica masiva se
//     mantiene INTACTO bit a bit.
//
// v1.8.0
//   - NEW: Botón #clasificasexo + caja #procesoclasificador
//     Lanza clasificación demográfica masiva por nombre.
//     Llama a crmToolsLogic.web en batches de 50, muestra
//     progreso en la caja de texto.
//   - Import crmToolsLogic.web (contarContactosSinSexo,
//     clasificarBatchSexo).
//
// v1.7.0
//   - cargarProximasCitas → ahora una sola llamada al backend
//     getProximasCitasCliente (fichaClienteLogic v1.7.0).
//   - Eliminado import getBookingsAgrupados de testCheckout.web.
//
// v1.6.3 (legacy) — 3 batches progresivos a getBookingsAgrupados
// v1.5.0 — NEW: import getMisCitas + case cargarProximasCitas
// v1.4.0 — NEW: caso 'enviarMensaje' para Área Cliente
// =====================================================

import {
  getFichaCliente,
  getHistorialCliente,
  actualizarContactoCRM,
  guardarNotaSalon,
  actualizarFotoCliente,
  sincronizarClientProfile,
  enviarMensajeInbox,
  getProximasCitasCliente,
  crearContactoCRM  // v1.9.2
} from 'backend/fichaClienteLogic.web';

import { cargarTodosContactos } from 'backend/recepcionLogic.web';

import {
  getCareProductos,
  getCareExternos,
  getCareExpediente
} from 'backend/careProfileLogic.web';

// v1.8.0: Herramientas CRM — clasificación demográfica
import {
  contarContactosSinSexo,
  clasificarBatchSexo
} from 'backend/crmToolsLogic.web';

// v1.9.0: Gestor de cupones nativos Wix
import {
  crearCupon,
  listarCupones,
  obtenerCupon,
  actualizarCupon,
  activarDesactivarCupon,
  eliminarCupon
} from 'backend/couponsLogic.web';

const TAG = '[FichaCliente][PageCode][1.9.3]';

let cachedClientes = [];
let widgetReady    = false;

function sendToWidget(type, data) {
  try { $w('#htmlFichaCliente').postMessage({ type, ...data }); }
  catch (e) { console.error(`${TAG} sendToWidget:`, e.message); }
}

function buscarLocal(query) {
  const q = String(query || '').toLowerCase().trim();
  if (q.length < 2) return [];
  return cachedClientes
    .filter(c =>
      c.nombreCompleto?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      c.telefono?.includes(q)
    )
    .slice(0, 10);
}

async function cargarCache() {
  try {
    const r = await cargarTodosContactos();
    if (!r?.ok) {
      sendToWidget('fichaError', { message: 'No se pudo cargar clientes.' });
      return;
    }
    cachedClientes = r.clientes || [];
    console.log(`${TAG} Caché: ${cachedClientes.length}`);
    if (widgetReady) sendToWidget('cacheReady', { total: cachedClientes.length });
  } catch (e) {
    sendToWidget('fichaError', { message: 'Error cargando clientes.' });
  }
}

async function cargarDatosCliente(contactId) {
  try {
    sendToWidget('fichaLoading', { message: 'Cargando ficha...' });

    const fichaResult = await getFichaCliente({ contactId });
    if (!fichaResult?.ok) {
      sendToWidget('fichaError', { message: fichaResult?.error?.message || 'Error.' });
      return;
    }
    sendToWidget('fichaContactData', {
      cliente: fichaResult.cliente,
      profile: fichaResult.profile,
      warnings: fichaResult.warnings
    });

    const [historial, productosEcom, externos, expediente] = await Promise.all([
      getHistorialCliente({ contactId }),
      getCareProductos({ contactId }),
      getCareExternos({ contactId }),
      getCareExpediente({ contactId })
    ]);

    if (historial?.ok) {
      sendToWidget('fichaHistorial', {
        visitas: historial.visitas || [],
        total: historial.total || 0
      });
      sendToWidget('fichaTienda', {
        ventas: historial.ventasTienda || [],
        total: historial.totalTienda || 0
      });
    }
    if (productosEcom?.ok !== false) {
      sendToWidget('fichaProductos', { productos: productosEcom?.productos || [] });
    }
    if (externos?.ok !== false) {
      sendToWidget('fichaExternos', { externos: externos?.externos || [] });
    }
    if (expediente?.ok !== false) {
      sendToWidget('fichaExpediente', {
        profile: expediente?.profile || null,
        visits: expediente?.visits || [],
        media: expediente?.media || []
      });
    }
  } catch (e) {
    sendToWidget('fichaError', { message: 'Error cargando datos.' });
  }
}

async function handleMessage(event) {
  const { type, ...data } = event?.data || {};
  if (!type) return;
  console.log(`${TAG} ${type}`);

  switch (type) {
    case 'fichaReady':
      widgetReady = true;
      if (cachedClientes.length > 0) sendToWidget('cacheReady', { total: cachedClientes.length });
      break;

    case 'buscarCliente':
      sendToWidget('clientesEncontrados', { clientes: buscarLocal(data.query) });
      break;

    case 'clienteSeleccionado':
      if (data.contactId) await cargarDatosCliente(data.contactId);
      break;

    case 'actualizarContacto':
      try {
        const r = await actualizarContactoCRM(data);
        if (r?.ok) {
          sendToWidget('fichaOk', { message: 'Datos actualizados.' });
          sendToWidget('fichaContactData', { cliente: r.cliente, profile: null, warnings: [] });
        } else {
          sendToWidget('fichaError', { message: r?.error?.message || 'Error.' });
        }
      } catch (e) {
        sendToWidget('fichaError', { message: e.message });
      }
      break;

    // v1.9.3 — Alta de nuevo contacto desde el CRM.
    // Payload: {nombre, apellido, telefono, email, fechaNacimiento?,
    //           sexo?, allowDuplicates?}
    // Cambios v1.9.3 respecto a v1.9.2:
    //   · Ya NO se llama cargarDatosCliente(r.contactId) aquí. El
    //     widget invoca su propia seleccionarCliente(id, nombre) al
    //     recibir 'contactoCreado', lo que dispara 'clienteSeleccionado'
    //     y llega aquí abajo (case 'clienteSeleccionado'). De ahí que
    //     lanzar cargarDatosCliente aquí duplicaría la carga.
    //   · DUPLICATE_EMAIL → DUPLICATE_PHONE (paridad backend v1.9.11).
    //   · Ningún error.message del backend viaja al widget. Se traduce
    //     a 'contactoDuplicadoTelefono' o 'contactoError' — el widget
    //     usa siempre su propio texto fijo en español.
    case 'crearContacto':
      try {
        const r = await crearContactoCRM(data);
        if (r?.ok) {
          if (r.cliente) cachedClientes.push(r.cliente);
          sendToWidget('contactoCreado', {
            contactId: r.contactId,
            cliente: r.cliente
          });
        } else if (r?.error?.code === 'DUPLICATE_PHONE') {
          sendToWidget('contactoDuplicadoTelefono', {});
        } else {
          sendToWidget('contactoError', {});
        }
      } catch (e) {
        console.error(`${TAG} crearContacto excepción:`, e && e.message);
        sendToWidget('contactoError', {});
      }
      break;

    case 'guardarNota':
      try {
        const r = await guardarNotaSalon(data);
        if (r?.ok) sendToWidget('fichaOk', { message: 'Nota guardada.' });
        else sendToWidget('fichaError', { message: r?.error?.message || 'Error.' });
      } catch (e) {
        sendToWidget('fichaError', { message: e.message });
      }
      break;

    // v1.9.0 — REEMPLAZA v1.x case 'actualizarFoto' (que nunca se
    // disparaba porque el widget envía 'subirFoto'). Ahora alineado.
    // Firma del payload: { contactId, base64Data, fileName, mimeType }
    // El widget v1.6.0 envía `base64` (legacy) — toleramos ambos.
    case 'subirFoto':
      try {
        const base64Data = data.base64Data || data.base64;
        if (!base64Data) {
          sendToWidget('fichaError', { message: 'Foto vacía.' });
          break;
        }
        const r = await actualizarFotoCliente({
          contactId: data.contactId,
          base64Data,
          fileName: data.fileName || 'foto.jpg',
          mimeType: data.mimeType || 'image/jpeg'
        });
        if (r?.ok) {
          sendToWidget('fichaOk', { message: 'Foto actualizada.' });
          // Recargar ficha para que el widget pinte la URL definitiva
          if (data.contactId) await cargarDatosCliente(data.contactId);
        } else {
          sendToWidget('fichaError', { message: r?.error?.message || 'Error subiendo foto.' });
        }
      } catch (e) {
        sendToWidget('fichaError', { message: e.message });
      }
      break;

    case 'sincronizar':
      try {
        const r = await sincronizarClientProfile({ contactId: data.contactId });
        if (r?.ok) {
          sendToWidget('fichaOk', { message: 'Ficha sincronizada.' });
          await cargarDatosCliente(data.contactId);
        } else {
          sendToWidget('fichaError', { message: r?.error?.message || 'Error.' });
        }
      } catch (e) {
        sendToWidget('fichaError', { message: e.message });
      }
      break;

    case 'enviarMensaje':
      try {
        const r = await enviarMensajeInbox({ contactId: data.contactId, mensaje: data.mensaje });
        if (r?.ok) sendToWidget('fichaOk', { message: 'Mensaje enviado al Área Cliente.' });
        else sendToWidget('fichaError', { message: r?.error?.message || 'Error enviando mensaje.' });
      } catch (e) {
        sendToWidget('fichaError', { message: e.message });
      }
      break;

    case 'cargarProximasCitas':
      try {
        const r = await getProximasCitasCliente({ contactId: data.contactId });
        if (r?.ok) {
          sendToWidget('fichaProximasCitas', { proximas: r.proximas || [] });
          console.log(`${TAG} Próximas citas: ${r.proximas?.length || 0}`);
        } else {
          console.warn(`${TAG} cargarProximasCitas backend ERROR:`, r?.error?.message);
          sendToWidget('fichaProximasCitas', { proximas: [] });
        }
      } catch (e) {
        console.error(`${TAG} cargarProximasCitas EXCEPCION:`, e.message);
        sendToWidget('fichaProximasCitas', { proximas: [] });
      }
      break;

    // ═══════════════════════════════════════════════════════════════
    // v1.9.0 — Campos personalizados Wix Contacts
    // Todos comparten patrón: actualizarContactoCRM con un único
    // campo opcional. El backend hace READ-MERGE-UPDATE puro: solo
    // toca el campo enviado, jamás borra los demás.
    // ═══════════════════════════════════════════════════════════════

    case 'guardarNotasPublicas':
      try {
        const r = await actualizarContactoCRM({
          contactId: data.contactId,
          notasPublicas: data.valor || ''
        });
        if (r?.ok) sendToWidget('fichaOk', { message: 'Notas públicas guardadas.' });
        else sendToWidget('fichaError', { message: r?.error?.message || 'Error.' });
      } catch (e) {
        sendToWidget('fichaError', { message: e.message });
      }
      break;

    case 'guardarNotasColor':
      try {
        const r = await actualizarContactoCRM({
          contactId: data.contactId,
          notasColor: data.valor || ''
        });
        if (r?.ok) sendToWidget('fichaOk', { message: 'Notas de Color guardadas.' });
        else sendToWidget('fichaError', { message: r?.error?.message || 'Error.' });
      } catch (e) {
        sendToWidget('fichaError', { message: e.message });
      }
      break;

    case 'guardarNotasTratamientos':
      try {
        const r = await actualizarContactoCRM({
          contactId: data.contactId,
          notasTratamientos: data.valor || ''
        });
        if (r?.ok) sendToWidget('fichaOk', { message: 'Notas de Tratamientos guardadas.' });
        else sendToWidget('fichaError', { message: r?.error?.message || 'Error.' });
      } catch (e) {
        sendToWidget('fichaError', { message: e.message });
      }
      break;

    case 'guardarUltimaVisita':
      try {
        // data.valor: string YYYY-MM-DD o ISO o '' para limpiar
        const r = await actualizarContactoCRM({
          contactId: data.contactId,
          ultimaVisita: data.valor || ''
        });
        if (r?.ok) sendToWidget('fichaOk', { message: 'Última visita guardada.' });
        else sendToWidget('fichaError', { message: r?.error?.message || 'Error.' });
      } catch (e) {
        sendToWidget('fichaError', { message: e.message });
      }
      break;

    // v1.9.1 — Fecha de nacimiento (campo NATIVO Wix Contacts).
    // Firma del payload: { contactId, valor: 'YYYY-MM-DD' o '' }.
    // El backend v1.9.8 la escribe como contact.info.birthdate.
    case 'guardarFechaNacimiento':
      try {
        const r = await actualizarContactoCRM({
          contactId: data.contactId,
          fechaNacimiento: data.valor || ''
        });
        if (r?.ok) sendToWidget('fichaOk', { message: 'Fecha de nacimiento guardada.' });
        else sendToWidget('fichaError', { message: r?.error?.message || 'Error.' });
      } catch (e) {
        sendToWidget('fichaError', { message: e.message });
      }
      break;

    case 'toggleClubKalonice':
      try {
        // data.activo: boolean
        const r = await actualizarContactoCRM({
          contactId: data.contactId,
          clubKalonice: !!data.activo
        });
        if (r?.ok) sendToWidget('fichaOk', { message: data.activo ? 'Socio Club KALONICE activado.' : 'Socio Club KALONICE desactivado.' });
        else sendToWidget('fichaError', { message: r?.error?.message || 'Error.' });
      } catch (e) {
        sendToWidget('fichaError', { message: e.message });
      }
      break;

    case 'guardarSexo':
      try {
        const r = await actualizarContactoCRM({
          contactId: data.contactId,
          sexo: data.valor || ''
        });
        if (r?.ok) sendToWidget('fichaOk', { message: 'Sexo guardado.' });
        else sendToWidget('fichaError', { message: r?.error?.message || 'Error.' });
      } catch (e) {
        sendToWidget('fichaError', { message: e.message });
      }
      break;

    // ═══════════════════════════════════════════════════════════════
    // v1.9.0 — Cupones nativos Wix (independientes del cliente)
    // Respuestas con tipos específicos: 'cuponesListados',
    // 'cuponCreado', 'cuponActualizado', 'cuponToggled',
    // 'cuponEliminado', 'cuponObtenido'.
    // ═══════════════════════════════════════════════════════════════

    case 'cargarCupones':
      try {
        const r = await listarCupones({
          limit: data.limit,
          filtros: data.filtros || {}
        });
        if (r?.ok) {
          sendToWidget('cuponesListados', {
            cupones: r.cupones || [],
            totalCargados: r.totalCargados || 0,
            totalFiltrados: r.totalFiltrados || 0
          });
        } else {
          sendToWidget('cuponesError', { message: r?.error?.message || 'Error listando cupones.' });
        }
      } catch (e) {
        sendToWidget('cuponesError', { message: e.message });
      }
      break;

    case 'crearCupon':
      try {
        const r = await crearCupon(data.spec || {});
        if (r?.ok) {
          sendToWidget('cuponCreado', { cupon: r.cupon, couponId: r.couponId });
        } else {
          sendToWidget('cuponesError', { message: r?.error?.message || 'Error creando cupón.' });
        }
      } catch (e) {
        sendToWidget('cuponesError', { message: e.message });
      }
      break;

    case 'obtenerCupon':
      try {
        const r = await obtenerCupon({ couponId: data.couponId });
        if (r?.ok) {
          sendToWidget('cuponObtenido', { cupon: r.cupon });
        } else {
          sendToWidget('cuponesError', { message: r?.error?.message || 'Cupón no encontrado.' });
        }
      } catch (e) {
        sendToWidget('cuponesError', { message: e.message });
      }
      break;

    case 'editarCupon':
      try {
        const r = await actualizarCupon({
          couponId: data.couponId,
          cambios: data.cambios || {}
        });
        if (r?.ok) {
          sendToWidget('cuponActualizado', {
            cupon: r.cupon,
            camposActualizados: r.camposActualizados || []
          });
        } else {
          sendToWidget('cuponesError', { message: r?.error?.message || 'Error actualizando cupón.' });
        }
      } catch (e) {
        sendToWidget('cuponesError', { message: e.message });
      }
      break;

    case 'toggleCupon':
      try {
        const r = await activarDesactivarCupon({
          couponId: data.couponId,
          active: !!data.active
        });
        if (r?.ok) {
          sendToWidget('cuponToggled', { cupon: r.cupon, active: r.active });
        } else {
          sendToWidget('cuponesError', { message: r?.error?.message || 'Error.' });
        }
      } catch (e) {
        sendToWidget('cuponesError', { message: e.message });
      }
      break;

    case 'eliminarCupon':
      try {
        const r = await eliminarCupon({ couponId: data.couponId });
        if (r?.ok) {
          sendToWidget('cuponEliminado', { couponId: data.couponId });
        } else {
          sendToWidget('cuponesError', { message: r?.error?.message || 'Error eliminando cupón.' });
        }
      } catch (e) {
        sendToWidget('cuponesError', { message: e.message });
      }
      break;

    default:
      console.warn(`${TAG} Desconocido: ${type}`);
  }
}

// ═══════════════════════════════════════════════════════════════
// v1.8.0: Clasificación demográfica masiva — INTACTA
// Botón Wix #clasificasexo + caja de texto #procesoclasificador
// ═══════════════════════════════════════════════════════════════

async function lanzarClasificacionSexo() {
  const txtProceso = $w('#procesoclasificador');
  const btnClasificar = $w('#clasificasexo');

  btnClasificar.disable();
  txtProceso.text = 'Contando contactos sin clasificar...';

  try {
    // Paso 1: Contar
    const conteo = await contarContactosSinSexo();
    if (!conteo?.ok) {
      txtProceso.text = 'Error: ' + (conteo?.error || 'desconocido');
      btnClasificar.enable();
      return;
    }

    if (conteo.sinSexo === 0) {
      txtProceso.text = `Todos los contactos ya clasificados (${conteo.total} total, ${conteo.conSexo} con sexo).`;
      btnClasificar.enable();
      return;
    }

    txtProceso.text = `${conteo.sinSexo} contactos sin clasificar de ${conteo.total}. Iniciando...`;

    // Paso 2: Procesar en batches
    let offset = 0;
    const BATCH = 10;
    let totalProcesados = 0;
    let totalClasificados = 0;
    let totalErrores = 0;
    let hayMas = true;

    while (hayMas) {
      txtProceso.text = `Procesando... ${totalProcesados}/${conteo.total} (${totalClasificados} clasificados)`;

      const r = await clasificarBatchSexo({ offset, batchSize: BATCH });

      if (!r?.ok) {
        txtProceso.text = `Error en batch (offset ${offset}): ${r?.error || 'desconocido'}. Clasificados hasta ahora: ${totalClasificados}`;
        btnClasificar.enable();
        return;
      }

      totalProcesados += r.procesados;
      totalClasificados += r.clasificados;
      totalErrores += r.errores;
      offset = r.offset;
      hayMas = r.hayMas;
    }

    // Paso 3: Resumen final
    txtProceso.text = `Completado. ${totalClasificados} clasificados, ${totalErrores} errores, ${totalProcesados} revisados de ${conteo.total}.`;
    console.log(`${TAG} Clasificación completada: ${totalClasificados} clasificados, ${totalErrores} errores`);

  } catch (e) {
    console.error(`${TAG} Error en clasificación:`, e.message);
    txtProceso.text = 'Error: ' + e.message;
  }

  btnClasificar.enable();
}

$w.onReady(async () => {
  console.log(`${TAG} onReady`);
  $w('#htmlFichaCliente').onMessage(handleMessage);

  // v1.8.0: Botón clasificación demográfica
  $w('#clasificasexo').onClick(() => lanzarClasificacionSexo());

  await cargarCache();
});