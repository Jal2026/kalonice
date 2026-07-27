// =====================================================
// HTTP FUNCTIONS - Descarga Excel/PDF + WhatsApp Webhook + AKIRA
// =====================================================
// Archivo: backend/http-functions.js
// URLs:
//   https://www.hair-times.com/_functions/descargarExcel?desde=2026-01-01&hasta=2026-01-31
//   https://www.hair-times.com/_functions/descargarPdf?desde=2026-01-01&hasta=2026-01-31
//   https://www.hair-times.com/_functions/whatsappWebhook  (GET=verificación, POST=mensajes entrantes)
//   https://www.hair-times.com/_functions/akiraAsk         (POST=pregunta a AKIRA)
//   https://www.hair-times.com/_functions/akiraTts         (POST=voz de AKIRA)
//
// CHANGELOG
// ---------
// v1.3.0 (17-Jul-2026)
//   - Añadido POST post_akiraTts() — voz de AKIRA (Google Cloud TTS)
//   - Añadido import de akiraSynthesize desde backend/akiraTTS.web
//   - Aditivo: Excel, PDF, WhatsApp y dumpReservasV1 intactos
//
// v1.2.0 (17-Jul-2026)
//   - Añadido POST post_akiraAsk() — endpoint de AKIRA V2 (modo Consultor)
//   - Añadido import de askAkiraCore desde backend/akiraLogic.web
//   - CERO cambios en Excel, PDF, WhatsApp Webhook y dumpReservasV1:
//     este archivo es aditivo. Los endpoints existentes quedan intactos.
//   - ok/badRequest/serverError ya estaban importados: no se toca la línea.
//
// v1.1.0 (8-May-2026)
//   - Añadido GET  get_whatsappWebhook() — verificación Meta webhook
//   - Añadido POST post_whatsappWebhook() — recepción mensajes entrantes
//   - Funciones Excel/PDF sin cambios
// =====================================================

import { ok, serverError, badRequest, forbidden } from 'wix-http-functions';
import wixData from 'wix-data';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import { getSecret } from 'wix-secrets-backend';
import { askAkiraCore } from 'backend/akiraLogic.web';
// Función PURA, no el webMethod: http-functions corre SIN sesión de miembro
// y un webMethod con SiteMember rechazaría la llamada.
import { akiraSynthesizeCore } from 'backend/akiraTTS.web';

const COLECCION_PAGOS = 'PaymentReservations';
const TAG_WA = '[WhatsApp Webhook]';
const TAG_AKIRA = '[AKIRA HTTP]';

// ── Caché de verify token ───────────────────────────────────
let _verifyTokenCache = null;
let _verifyTokenCacheTs = 0;
const VERIFY_TOKEN_CACHE_TTL = 30 * 60 * 1000; // 30 min


// ═══════════════════════════════════════════════════════════════════════════
// AKIRA — Pregunta (POST)          ◄── NUEVO v1.2.0
// ═══════════════════════════════════════════════════════════════════════════
// POST /_functions/akiraAsk
// Body:      { sessionId, query, userId, userName, modo }
// Respuesta: { ok, respuesta, sessionId, error? }
//
// PARA QUÉ EXISTE:
//   El custom element <akira-console> llama aquí DIRECTAMENTE con fetch(),
//   sin pasar por el Page Code. Dos razones medidas en producción (CATHOVIA):
//     1. setAttribute del Page Code TRUNCA payloads grandes. Las respuestas
//        del consultor con desgloses son largas; por HTTP llegan enteras.
//     2. Elimina un salto de red (widget → HTTP → backend).
//
// EL TECHO DE 14s — LO QUE ESTE ENDPOINT **NO** ARREGLA:
//   http-functions.js NO tiene ~5 min de timeout. Es FALSO y esa suposición
//   costó un ciclo entero de desarrollo en CATHOVIA. Wix corta la CONEXIÓN
//   al cliente a los ~14s aquí IGUAL que en cualquier webMethod.
//
//   LO QUE SÍ ESTÁ MEDIDO (Site Monitoring):
//     · El código backend NO se cancela a los 14s: un stream de prueba llegó
//       a 29.077ms sin que el runtime lo matara.
//     · Cuando askAkiraCore tarda más de 14s, el cliente recibe 504 PERO el
//       backend termina y guarda la respuesta en AkiraMessages.
//     · El custom element hace polling (cada 3s / 60s) y la recupera. El
//       usuario ve "Analizando…" y luego la respuesta. No nota el corte.
//
//   STREAMING SSE ES IMPOSIBLE EN VELO. Medido: wix-http-functions no acepta
//   streams (ni ReadableStream web ni stream.Readable de Node). El helper
//   ok() serializa con JSON.stringify y cierra. NO REINTENTAR.
//
// SEGURIDAD:
//   Los http-functions son PÚBLICOS: NO heredan los permisos de página de
//   Wix Members que protegen la página de AKIRA. Quien conozca la URL puede
//   llamarla y consumir tokens de Anthropic. AKIRA Consultor es SOLO LECTURA
//   y nunca escribe agenda → el riesgo es coste, no integridad.
//   (Mismo modelo que ya tienen descargarExcel y descargarPdf, que exponen
//   PaymentReservations sin autenticar.)
// ═══════════════════════════════════════════════════════════════════════════

export async function post_akiraAsk(request) {
    try {
        const body = await request.body.json();
        const { sessionId, query, userId, userName, modo } = body || {};

        if (!query) {
            return badRequest({
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ok: false, error: 'query requerida' })
            });
        }

        const result = await askAkiraCore({ sessionId, query, userId, userName, modo });

        return ok({
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(result)
        });

    } catch (error) {
        console.error(TAG_AKIRA, 'post_akiraAsk EXCEPTION:', error.message);
        return serverError({
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ok: false, error: error.message || 'error interno' })
        });
    }
}



// ═══════════════════════════════════════════════════════════════════════════
// AKIRA — Voz (POST)               ◄── NUEVO v1.3.0
// ═══════════════════════════════════════════════════════════════════════════
// POST /_functions/akiraTts
// Body:      { texto }
// Respuesta: { ok, audioContent (MP3 base64), mimeType, voice, timeMs, error? }
//
// El custom element llama aquí por fetch, NO vía Page Code. Motivo: el audio
// viaja en base64 y setAttribute TRUNCA payloads grandes. Patrón literal de
// CATHOVIA (post_egaelTts).
//
// La VOZ no se pasa por parámetro: sale de SalonConfig (voiceId/voiceRate/
// voicePitch). Cero hardcoding.
//
// ⚠️ Sufre el techo de 14s igual que todo lo demás. MEDIDO en CATHOVIA: P95
// 16.954ms, 5,9% de error. Y el audio NO se recupera por polling — no se
// guarda en ninguna colección. En respuestas largas fallará.
// ═══════════════════════════════════════════════════════════════════════════

export async function post_akiraTts(request) {
    try {
        const body = await request.body.json();
        const { texto, voiceName, speakingRate, pitch } = body || {};

        if (!texto) {
            return badRequest({
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ok: false, error: 'texto requerido' })
            });
        }

        const result = await akiraSynthesizeCore({ texto, voiceName, speakingRate, pitch });

        return ok({
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(result)
        });

    } catch (error) {
        console.error(TAG_AKIRA, 'post_akiraTts EXCEPTION:', error.message);
        return serverError({
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ok: false, error: error.message || 'error interno' })
        });
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// WHATSAPP WEBHOOK — Verificación (GET)
// ═══════════════════════════════════════════════════════════════════════════
// Meta envía un GET con hub.mode, hub.verify_token, hub.challenge
// para validar que el endpoint es tuyo.
// El verify_token se almacena en Wix Secrets como KAMISUITE_WHATSAPP_VERIFY_TOKEN
// (un string aleatorio que tú eliges y configuras también en Meta Dashboard).

export async function get_whatsappWebhook(request) {
    try {
        const mode = request.query['hub.mode'];
        const token = request.query['hub.verify_token'];
        const challenge = request.query['hub.challenge'];

        console.log(TAG_WA, `Verificación recibida: mode=${mode}`);

        if (mode !== 'subscribe') {
            console.warn(TAG_WA, 'Mode no es subscribe');
            return badRequest({ body: 'Invalid mode' });
        }

        // Obtener verify token de Secrets Manager (con caché)
        const now = Date.now();
        if (!_verifyTokenCache || (now - _verifyTokenCacheTs) > VERIFY_TOKEN_CACHE_TTL) {
            _verifyTokenCache = await getSecret('KAMISUITE_WHATSAPP_VERIFY_TOKEN');
            _verifyTokenCacheTs = now;
        }

        if (token !== _verifyTokenCache) {
            console.error(TAG_WA, 'Verify token NO coincide');
            return forbidden({ body: 'Invalid verify token' });
        }

        console.log(TAG_WA, 'Verificación OK — respondiendo challenge');

        // Meta espera recibir el challenge como texto plano
        return ok({
            headers: { 'Content-Type': 'text/plain' },
            body: challenge
        });

    } catch (error) {
        console.error(TAG_WA, 'Error en verificación:', error.message);
        return serverError({ body: error.message });
    }
}


// ═══════════════════════════════════════════════════════════════════════════
// WHATSAPP WEBHOOK — Mensajes entrantes (POST)
// ═══════════════════════════════════════════════════════════════════════════
// Meta envía un POST cada vez que llega un mensaje al número de WhatsApp.
// Este endpoint:
//   1. Parsea el mensaje entrante
//   2. Identifica al contacto por teléfono
//   3. Enruta a AKIRA para procesamiento
//   4. Responde al usuario vía WhatsApp
//
// IMPORTANTE: Meta espera 200 OK rápido. El procesamiento AKIRA es async.

export async function post_whatsappWebhook(request) {
    try {
        // Meta siempre espera 200 OK rápido — si no, reintenta
        const body = await request.body.json();

        // Validar estructura básica
        if (!body || !body.entry || !Array.isArray(body.entry)) {
            console.warn(TAG_WA, 'Payload sin entry válido');
            return ok({ body: 'OK' });
        }

        // Procesar cada entry (normalmente 1)
        for (const entry of body.entry) {
            const changes = entry.changes || [];

            for (const change of changes) {
                if (change.field !== 'messages') continue;

                const value = change.value || {};
                const messages = value.messages || [];
                const contacts = value.contacts || [];
                const metadata = value.metadata || {};

                // phoneNumberId del salón que recibió el mensaje
                const phoneNumberId = metadata.phone_number_id || '';

                for (let i = 0; i < messages.length; i++) {
                    const msg = messages[i];
                    const contact = contacts[i] || {};

                    const incomingData = {
                        messageId: msg.id || '',
                        from: msg.from || '',           // teléfono remitente (34XXXXXXXXX)
                        timestamp: msg.timestamp || '',
                        type: msg.type || '',            // text, interactive, image, audio, etc.
                        contactName: contact.profile?.name || '',
                        phoneNumberId: phoneNumberId,

                        // Contenido según tipo
                        text: msg.text?.body || '',
                        buttonId: msg.interactive?.button_reply?.id || '',
                        buttonTitle: msg.interactive?.button_reply?.title || '',
                        listId: msg.interactive?.list_reply?.id || '',
                        listTitle: msg.interactive?.list_reply?.title || ''
                    };

                    console.log(TAG_WA, `Mensaje recibido: from=${incomingData.from}, type=${incomingData.type}, text="${incomingData.text.substring(0, 50)}"`);

                    // ────────────────────────────────────────────
                    // Procesamiento asíncrono — no bloquear el 200 OK
                    // ────────────────────────────────────────────
                    _procesarMensajeEntrante(incomingData)
                        .catch(err => console.error(TAG_WA, 'Error procesando mensaje:', err.message));
                }
            }
        }

        // Siempre responder 200 OK a Meta
        return ok({ body: 'OK' });

    } catch (error) {
        console.error(TAG_WA, 'Error en POST webhook:', error.message);
        // Aún con error, respondemos 200 para que Meta no reintente
        return ok({ body: 'OK' });
    }
}


// ═══════════════════════════════════════════════════════════════════════════
// Procesamiento interno de mensajes entrantes
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Procesa un mensaje entrante de WhatsApp.
 * Identifica al contacto, determina la intención, y enruta a AKIRA.
 *
 * @param {object} data — datos del mensaje parseados
 */
async function _procesarMensajeEntrante(data) {
    const { from, type, text, buttonId, buttonTitle, contactName, phoneNumberId } = data;

    console.log(TAG_WA, `Procesando: ${contactName} (${from}) → tipo=${type}`);

    // 1. Determinar el texto/intención del usuario
    let userMessage = '';

    switch (type) {
        case 'text':
            userMessage = text;
            break;

        case 'interactive':
            // Respuesta a botones (Reply Buttons)
            if (buttonId) {
                userMessage = _mapButtonToMessage(buttonId, buttonTitle);
            }
            // Respuesta a lista
            else if (data.listId) {
                userMessage = data.listTitle || data.listId;
            }
            break;

        case 'audio':
            // Futuro: transcripción de nota de voz → AKIRA voz
            console.log(TAG_WA, 'Audio recibido — funcionalidad pendiente');
            userMessage = '[AUDIO — funcionalidad en desarrollo]';
            break;

        case 'image':
            console.log(TAG_WA, 'Imagen recibida — funcionalidad pendiente');
            userMessage = '[IMAGEN — funcionalidad en desarrollo]';
            break;

        default:
            console.log(TAG_WA, `Tipo de mensaje no soportado: ${type}`);
            userMessage = `[${type} — no soportado]`;
            break;
    }

    if (!userMessage) {
        console.warn(TAG_WA, 'Mensaje vacío — ignorando');
        return;
    }

    // 2. Buscar contacto en CRM por teléfono
    //    Formato from: "34617378984" → buscar con y sin prefijo
    const contacto = await _buscarContactoPorTelefono(from);

    console.log(TAG_WA, `Contacto: ${contacto ? contacto.nombreCompleto : 'NO ENCONTRADO'} (${from})`);

    // 3. Enrutar a AKIRA
    //    TODO: Importar y llamar a consoleIA.web.js cuando se integre
    //    Por ahora, log del mensaje para testing
    console.log(TAG_WA, `→ AKIRA: contacto=${contacto?.nombreCompleto || contactName}, msg="${userMessage}"`);

    // ────────────────────────────────────────────
    // PLACEHOLDER — Aquí se conectará AKIRA
    // ────────────────────────────────────────────
    // Cuando integremos AKIRA:
    //
    // import { procesarMensajeWhatsApp } from 'backend/consoleIA.web.js';
    //
    // const respuesta = await procesarMensajeWhatsApp({
    //     telefono: from,
    //     contactId: contacto?.contactId || null,
    //     nombreCliente: contacto?.nombreCompleto || contactName,
    //     mensaje: userMessage,
    //     phoneNumberId: phoneNumberId
    // });
    //
    // → AKIRA responde usando enviarMensajeTexto / enviarMensajeBotones
    // ────────────────────────────────────────────
    //
    // NOTA v1.2.0: cuando llegue AKIRA Recepción (el plano operativo que
    // atiende a clientas por WhatsApp), el destino natural de este placeholder
    // es askAkiraCore({ query: userMessage, modo: 'recepcion' }) — ya
    // importado arriba. NO es AKIRA Consultor: Consultor es solo lectura y
    // para la propiedad del salón, no para clientas. Requiere antes decidir
    // el alignment del modo 'recepcion' y su identificación por teléfono.

    console.log(TAG_WA, `Mensaje enrutado OK — pendiente conexión AKIRA`);
}

/**
 * Mapea un botón de respuesta rápida a un mensaje que AKIRA entiende.
 */
function _mapButtonToMessage(buttonId, buttonTitle) {
    const mapping = {
        'mis_citas': 'Quiero ver mis próximas citas',
        'reservar': 'Quiero reservar una cita',
        'expediente': 'Quiero consultar mi expediente de cuidado'
    };

    return mapping[buttonId] || buttonTitle || buttonId;
}

/**
 * Busca un contacto en Wix CRM por número de teléfono.
 * El teléfono viene de WhatsApp como "34XXXXXXXXX".
 *
 * Usa la caché de contactos si está disponible (recepcionLogic),
 * o hace query directa como fallback.
 */
async function _buscarContactoPorTelefono(phoneFrom) {
    try {
        // Importar dinámicamente para no crear dependencia circular
        const { cargarTodosContactos } = await import('backend/recepcionLogic.web.js');

        const contactos = await cargarTodosContactos();

        if (!contactos || !Array.isArray(contactos)) {
            console.warn(TAG_WA, 'cargarTodosContactos devolvió vacío');
            return null;
        }

        // phoneFrom viene como "34617378984"
        // En CRM puede estar como "+34 617 37 89 84", "617378984", etc.
        // Normalizar: quitar todo excepto dígitos y comparar los últimos 9
        const last9 = phoneFrom.slice(-9);

        const match = contactos.find(c => {
            const tel = (c.telefono || '').replace(/[^\d]/g, '');
            return tel.slice(-9) === last9;
        });

        if (match) {
            return {
                contactId: match.contactId,
                nombreCompleto: match.nombreCompleto || `${match.nombre || ''} ${match.apellido || ''}`.trim(),
                telefono: match.telefono,
                email: match.email
            };
        }

        return null;

    } catch (err) {
        console.error(TAG_WA, 'Error buscando contacto por teléfono:', err.message);
        return null;
    }
}


// ═══════════════════════════════════════════════════════════════════════════
// GET: Descargar Excel
// ═══════════════════════════════════════════════════════════════════════════

export async function get_descargarExcel(request) {
  try {
    const fechaDesde = request.query.desde || null;
    const fechaHasta = request.query.hasta || null;

    // Obtener pagos
    let query = wixData.query(COLECCION_PAGOS);
    
    if (fechaDesde) {
      query = query.ge('fechaPago', new Date(fechaDesde));
    }
    if (fechaHasta) {
      const hasta = new Date(fechaHasta);
      hasta.setDate(hasta.getDate() + 1);
      query = query.lt('fechaPago', hasta);
    }
    
    query = query.ascending('fechaPago');
    const result = await query.find();
    const pagos = result.items;

    if (pagos.length === 0) {
      return ok({
        headers: { 'Content-Type': 'text/plain' },
        body: 'No hay pagos en el rango seleccionado'
      });
    }

    // Formatear datos
    const datosExcel = pagos.map(p => ({
      'Fecha Pago': p.fechaPago ? new Date(p.fechaPago).toLocaleDateString('es-ES') : '',
      'Fecha Reserva': p.fechaReserva ? new Date(p.fechaReserva).toLocaleDateString('es-ES') : '',
      'Cliente': p.nombreCliente || '',
      'Descripción': p.descripcion || '',
      'Importe (€)': p.importeTotal || 0,
      'Tipo Pago': p.tipoPago || '',
      'Staff': p.staff || '',
      'Booking ID': p.bookingId || ''
    }));

    // Crear workbook
    const ws = XLSX.utils.json_to_sheet(datosExcel);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Pagos');

    ws['!cols'] = [
      { wch: 12 }, { wch: 12 }, { wch: 25 }, { wch: 40 },
      { wch: 12 }, { wch: 10 }, { wch: 15 }, { wch: 40 }
    ];

    // Generar buffer
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const nombreArchivo = `pagos_${fechaDesde || 'inicio'}_${fechaHasta || 'fin'}.xlsx`;

    return ok({
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${nombreArchivo}"`
      },
      body: buffer
    });

  } catch (error) {
    console.error('[HTTP] Error Excel:', error);
    return serverError({ body: error.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// GET: Descargar PDF
// ═══════════════════════════════════════════════════════════════════════════

export async function get_descargarPdf(request) {
  try {
    const fechaDesde = request.query.desde || null;
    const fechaHasta = request.query.hasta || null;

    // Obtener pagos
    let query = wixData.query(COLECCION_PAGOS);
    
    if (fechaDesde) {
      query = query.ge('fechaPago', new Date(fechaDesde));
    }
    if (fechaHasta) {
      const hasta = new Date(fechaHasta);
      hasta.setDate(hasta.getDate() + 1);
      query = query.lt('fechaPago', hasta);
    }
    
    query = query.ascending('fechaPago');
    const result = await query.find();
    const pagos = result.items;

    if (pagos.length === 0) {
      return ok({
        headers: { 'Content-Type': 'text/plain' },
        body: 'No hay pagos en el rango seleccionado'
      });
    }

    // Crear PDF
    const doc = new jsPDF();

    // Título
    doc.setFontSize(18);
    doc.text('Informe de Pagos - Hair Times', 14, 20);

    // Subtítulo
    doc.setFontSize(11);
    doc.text(`Período: ${fechaDesde || 'Inicio'} - ${fechaHasta || 'Fin'}`, 14, 28);

    // Línea
    doc.setLineWidth(0.5);
    doc.line(14, 32, 196, 32);

    let y = 40;
    const lineHeight = 7;
    const pageHeight = 280;

    // Total
    const totalImporte = pagos.reduce((sum, p) => sum + (p.importeTotal || 0), 0);

    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.text(`Total registros: ${pagos.length}`, 14, y);
    doc.text(`Importe total: ${totalImporte.toFixed(2)} €`, 100, y);
    y += lineHeight * 2;

    // Cabecera
    doc.setFillColor(240, 240, 240);
    doc.rect(14, y - 4, 182, 8, 'F');
    doc.setFontSize(9);
    doc.text('Fecha', 16, y);
    doc.text('Cliente', 40, y);
    doc.text('Descripción', 80, y);
    doc.text('Importe', 145, y);
    doc.text('Tipo', 170, y);
    y += lineHeight;

    // Datos
    doc.setFont(undefined, 'normal');
    doc.setFontSize(8);

    for (const pago of pagos) {
      if (y > pageHeight) {
        doc.addPage();
        y = 20;
      }

      const fecha = pago.fechaPago ? new Date(pago.fechaPago).toLocaleDateString('es-ES') : '';
      const cliente = (pago.nombreCliente || '').substring(0, 20);
      const desc = (pago.descripcion || '').substring(0, 35);
      const importe = `${(pago.importeTotal || 0).toFixed(2)} €`;
      const tipo = pago.tipoPago || '';

      doc.text(fecha, 16, y);
      doc.text(cliente, 40, y);
      doc.text(desc, 80, y);
      doc.text(importe, 145, y);
      doc.text(tipo, 170, y);

      y += lineHeight;
    }

    // Pie de página
    const totalPaginas = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPaginas; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(128);
      doc.text(`Página ${i} de ${totalPaginas}`, 14, 290);
      doc.text(`Generado: ${new Date().toLocaleString('es-ES')}`, 140, 290);
    }

    // Output como buffer
    const pdfBuffer = Buffer.from(doc.output('arraybuffer'));

    const nombreArchivo = `pagos_${fechaDesde || 'inicio'}_${fechaHasta || 'fin'}.pdf`;

    return ok({
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${nombreArchivo}"`
      },
      body: pdfBuffer
    });

  } catch (error) {
    console.error('[HTTP] Error PDF:', error);
    return serverError({ body: error.message });
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// GET: Dump Reservas V1 — one-shot para migración V1→V2 (Hair-Times julio 2026)
// URL: https://www.hair-times.com/_functions/dumpReservasV1?desdeISO=...&hastaISO=...
// Devuelve JSON descargable con TODOS los items crudos de queryExtendedBookings
// del rango, para poder leer duraciones REALES históricas (start/end del session)
// como fuente de generación de bloqueos en KamisuiteReservations.
//
// Este bloque se ELIMINA tras cerrar la migración, junto con el archivo
// backend/dumpReservasV1.web.js.
// ═══════════════════════════════════════════════════════════════════════════

export async function get_dumpReservasV1(request) {
    try {
        const desdeISO = request.query.desdeISO || null;
        const hastaISO = request.query.hastaISO || null;

        if (!desdeISO || !hastaISO) {
            return badRequest({ body: 'Faltan parámetros desdeISO / hastaISO' });
        }

        // Import dinámico (mismo patrón que _buscarContactoPorTelefono usa con
        // recepcionLogic.web.js — evita dependencia circular en carga del módulo)
        const { dumpReservasV1 } = await import('backend/dumpReservasV1.web.js');
        const result = await dumpReservasV1({ desdeISO, hastaISO });

        if (!result || !result.ok) {
            return serverError({ body: result?.error || 'Error desconocido en dumpReservasV1' });
        }

        const json = JSON.stringify(result.items || []);
        const nombreArchivo = `reservas_v1_${desdeISO.slice(0, 10)}_${hastaISO.slice(0, 10)}.json`;

        return ok({
            headers: {
                'Content-Type': 'application/json',
                'Content-Disposition': `attachment; filename="${nombreArchivo}"`
            },
            body: json
        });

    } catch (error) {
        console.error('[HTTP] Error dumpReservasV1:', error);
        return serverError({ body: error.message });
    }
}