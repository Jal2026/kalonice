// =====================================================
// KAMISUITE — Backend: Área de Cliente
// =====================================================
// VERSION: 1.6.6
//
// v1.6.6 — Fecha de verificación del appId de Wix Stores.
//   - Documentada en el comentario de APP_ID_WIX_STORES la fecha
//     de última confirmación oficial (1 de julio de 2026,
//     dev.wix.com). El log de conteo del bucle ya existente hace
//     de auditoría pasiva — si un día se necesita revisar el
//     comportamiento del filtro, queda rastro en Google Cloud Logs.
//   - Sin cambios funcionales: el filtro por appId sigue exactamente
//     igual que en v1.6.5. No hay flags nuevos en el payload, no hay
//     alertas al frontend, la UI del cliente del salón queda intacta.
//
// v1.6.5 — Filtro de "Productos comprados" por origen de la app.
//   - Antes: el bloque `productos` del payload incluía TODOS los
//     lineItems de las orders del cliente cuyos paymentStatus no era
//     NOT_PAID ni REFUNDED. En cuentas históricas (Hair-Times V1) eso
//     hacía que aparecieran servicios de Bookings ("Arreglo de Corte",
//     "Secado", "Lavado" a 0€ con imagen rota) como si fueran
//     productos comprados.
//   - Ahora: se filtra por `catalogReference.appId === APP_ID_WIX_STORES`.
//     Este appId es metadata persistente e inmutable del order — no
//     depende del catálogo actual, así que productos descatalogados
//     del cliente siguen apareciendo en su histórico, y servicios de
//     Bookings quedan fuera automáticamente.
//   - Helper `esProductoStores(li)` centraliza la comparación.
//   - Constante `APP_ID_WIX_STORES = '215238eb-22a5-4c36-9e7b-e7c08025e04e'`
//     confirmada desde documentación oficial de Wix (dev.wix.com).
//   - Log al final del bucle indica cuántos lineItems se filtraron y
//     por qué appId, útil para diagnóstico durante la migración V1→V2.
//
// v1.6.4 — URL de reserva configurable desde SalonConfig.urlBooking.
//   - Lee nuevo campo `SalonConfig.urlBooking` (Text). Puede ser
//     absoluta (`https://www.salonkami.com/reservar`) o path interno
//     (`/reservar`). Si va absoluta pasa por `sanitizarSiteUrl` para
//     corregir "wwwX.tld" sin punto (mismo defensor que v1.6.3).
//   - Devuelve `data.salon.urlBooking` en el payload. Consumidor: el
//     page code, que redirige con `wixLocation.to(urlBooking)` en los
//     handlers `reservarCita` y `repetirServicio`.
//   - Fallback silencioso: si el CMS no tiene el campo, devuelve ''
//     y el page code cae al `/reservar` de siempre (comportamiento
//     v1.3.5). Cero regresión.
//   - Log adicional en el bloque de config combinada.
//
// v1.6.3 — HOTFIX URL de promociones malformada.
//   - Sanitizador defensivo `sanitizarSiteUrl` que corrige el patrón
//     "wwwX.tld" → "www.X.tld" cuando alguien escribe el siteUrl en
//     SalonConfig sin el punto tras "www" (ej: "wwwsalonkami.com"
//     en vez de "www.salonkami.com"). Se aplica solo si detecta el
//     patrón malformado. Hosts ya bien escritos no se tocan.
//   - Log adicional cuando se detecta y corrige el patrón.
//   - Cero cambios funcionales en el resto de flujos.
//
// VERSION: 1.6.2
// FECHA: 1 de julio de 2026
// ARCHIVO: backend/clienteAreaLogic.web.js
//
// v1.6.2 — FIX: reincorporar toda la lógica de v1.5.5 que se había
//          perdido al reconstruir sobre v1.5.4.
//
//   CONTEXTO. La v1.6.0/v1.6.1 se construyeron por error sobre v1.5.4
//   (que estaba en el proyecto adjunto) cuando la versión REAL en
//   producción es v1.5.5. v1.5.5 aportaba una lectura flexible de
//   Notas públicas con fallback por email duplicado, y también usaba
//   tres helpers (`valorDeItemExtendedField`, `listarKeysDebug`,
//   `safeJsonLog`) que en v1.6.0 se habían retirado creyéndolos
//   exclusivos de Club KALONICE.
//
//   REPARACIÓN:
//     · REINCORPORADOS los tres helpers compartidos entre Club y Notas.
//     · REINCORPORADOS los cuatro helpers nuevos de v1.5.5 para Notas
//       públicas: FIELD_NOTAS_PUBLICAS_ALIASES, esClaveNotasPublicas,
//       normalizarTextoCampo, leerNotasPublicasFlexible. (Copia literal
//       de la v1.5.5 subida por el usuario.)
//     · La lectura de notas públicas en getAreaCliente ahora usa
//       leerNotasPublicasFlexible + fallback por email duplicado
//       (mismo patrón que Club KALONICE tenía en v1.5.4).
//     · NUEVO campo en el shape: `notasPublicasOrigen`
//       ('contacto-logueado' | 'contacto-duplicado-mismo-email:<id>').
//     · Log de diagnóstico `🧩 Notas públicas debug v1.5.5` preservado.
//     · Log final ampliado con el origen final de las notas.
//
//   NO CAMBIA respecto a v1.6.1:
//     · Todo el bloque "Club {brandName}" (salon/prime/bonos/tarjetas).
//     · Queries locales directas contra KamisuiteVouchers,
//       KamisuitePrimeMemberships, KamisuitePromoCards y
//       KamisuiteProductsConfig.
//     · Imagen PRIME siempre visible (objeto de deseo).
//     · Retirada del bloque data.club.
//     · Retirada definitiva de: FIELD_CLUB_KALONICE, normalizarClaveDebug,
//       esClaveClubKalonice, leerExtendedFieldFlexible, normalizarClubActivo.
//
// v1.6.1 — FIX: PRIME/Bonos/Tarjetas no devolvían nada aunque el cliente
//          los tuviera. Imagen PRIME visible siempre.
//
//   PROBLEMA v1.6.0. El bloque delegaba en `getProductosCustomCliente`
//   de recepcionProLogic (import cross-backend). Con el mismo cliente
//   que en el widget público /promociones sí ve sus bonos (BN-XXXX),
//   en Área de Cliente llegaban listas vacías. Los logs no denunciaban
//   ningún fallo — el llamado devolvía ok:true con arrays vacíos.
//
//   SOLUCIÓN. Se retiran los imports cross-backend
//   (`getProductosCustomCliente`, `getProductosConfig`) y las tres
//   queries se hacen LOCALES en este mismo archivo, replicando el
//   patrón EXACTO del widget público que Jal confirma funciona con
//   este cliente logueado: `voucherPublicLogic.listarBonosActivosMiembro`,
//   `primePublicLogic.buscarPrimeActivaPorContactId`, análogo local
//   para tarjetas. Ver bloques 11.1 / 11.2 / 11.3.
//
//   FIX IMAGEN PRIME. La imagen de la Tarjeta PRIME
//   (`KamisuiteProductsConfig.primeImage`) ahora se devuelve SIEMPRE en
//   `data.prime.imagen`, tenga el cliente membresía activa o no —
//   Jal la califica de "objeto de deseo": debe verse aunque el cliente
//   no la haya comprado todavía. La imagen se carga en la misma
//   `Promise.all` que la lectura de SalonConfig (una sola ida al
//   backend para las dos configs single-row).
//
//   LOGS AÑADIDOS. Cada una de las tres queries deja una línea de log
//   con el conteo de items totales y activos filtrados, para
//   diagnóstico rápido sin tener que reinstrumentar.
//
// v1.6.0 — Reestructuración bloque "Programa de fidelización" →
//          "Club {brandName}" con tres nuevos productos custom.
//
//   CONTEXTO. El widget histórico pintaba dos sub-tarjetas dentro de
//   este bloque: la de puntos (Wix Loyalty nativo) y la del Club
//   KALONICE (checkbox `club_kalonice` en Wix Contacts, con imagen
//   `SalonConfig.imagenClub` y botón HAZTE SOCIO hacia
//   `SalonConfig.urlClub`). Con el nuevo concepto multi-tenant, ser
//   miembro del sitio es YA ser socio del Club por defecto (el flag
//   deja de tener sentido de opt-in). En su lugar el bloque muestra
//   los productos custom del cliente: Tarjeta PRIME, Bonos Descuento
//   y Tarjetas Promocionales. Cada uno lleva su botón ADQUIRIR
//   hacia una página común de promociones del salón.
//
//   CAMBIOS EN EL SHAPE DE getAreaCliente:
//     + data.salon    = { brandName }
//         · Título del bloque en el widget: "Club {brandName}".
//     + data.prime    = { tiene, membresia:{code,expirationDate}|null,
//                         imagen, urlAdquirir }
//         · Se lee de `KamisuitePrimeMemberships` (contactId) via
//           `getProductosCustomCliente` de recepcionProLogic v1.0.31+.
//         · Imagen de tarjeta desde `KamisuiteProductsConfig.primeImage`
//           via `getProductosConfig` de productosKamisuiteLogic v1.0.1+.
//     + data.bonos    = { tiene, items:[{id,code,serviceLabel,
//                         remainingUses,totalUses,expirationDate}],
//                         urlAdquirir }
//         · Se lee de `KamisuiteVouchers` (contactId, status='ACTIVO')
//           via `getProductosCustomCliente`.
//     + data.tarjetas = { tiene, items:[{id,code,serviceLabel,
//                         expirationDate}], urlAdquirir }
//         · Se lee de `KamisuitePromoCards` (buyerContactId,
//           status='EMITIDA', isGift=false) via `getProductosCustomCliente`.
//     - data.club     RETIRADO del shape (activo/imagen/url/origen).
//         · Widget nuevo v1.1.0+ no lo lee. El backend deja de
//           leer/calcular esos campos.
//
//   NUEVO CAMPO EN SalonConfig:
//     · `promotionsPageSlug` (Text). Slug de la página común de
//       promociones (ej. "tarjetaprime", "promociones"). La URL de
//       ADQUIRIR se construye en runtime: `${siteUrl}/${slug}`. Un
//       solo slug para las tres tarjetas hoy, pero cada bloque lleva
//       su propia `urlAdquirir` para desacoplar en el futuro.
//
//   DEUDA TÉCNICA RESPETADA (decisión Jal 1-jul-2026):
//     · `primePublicLogic.confirmPrimePayment` SIGUE escribiendo
//       `club_kalonice=true` en Wix Contacts al comprar PRIME. Este
//       backend deja de leerlo (queda huérfano de lectura, escritura
//       intacta). Menos cambios.
//     · `SalonConfig.imagenClub` y `SalonConfig.urlClub` quedan
//       huérfanos (nadie los lee). Se dejan como campos muertos en el
//       CMS, sin borrar.
//
//   HELPERS RETIRADOS (solo servían al bloque Club KALONICE eliminado,
//   sin más consumidores en este backend):
//     · normalizarClaveDebug, esClaveClubKalonice,
//       valorDeItemExtendedField, leerExtendedFieldFlexible,
//       listarKeysDebug, safeJsonLog, normalizarClubActivo.
//     · Constante FIELD_CLUB_KALONICE.
//   Si en el futuro se recupera el flag para otro uso, los helpers
//   están archivados en la v1.5.4 del propio archivo.
//
//   NO SE TOCAN: updatePerfilCliente, appendNotaCliente,
//   cancelarCitaCliente, getHuecosCambioReserva, moverCitaCliente,
//   repetirCompraCliente, cambiarFotoContacto. Sus contratos y
//   comportamientos quedan intactos.
//
// v1.5.4 — Diagnóstico reforzado + lectura ultra-flexible Club KALONICE.
//   No cambia page code ni Custom Element. Cambios solo backend:
//   · `leerExtendedFieldFlexible` ahora también revisa estructuras tipo
//     `extendedFields.items[]` y objetos anidados, además de claves planas.
//   · Log de diagnóstico completo: contactId, email, claves reales de
//     extendedFields, clave detectada, path, valor raw y activo final.
//   · Si el contacto logueado no trae el campo activo, se busca de forma
//     defensiva otro contacto con el MISMO email que sí lo tenga marcado
//     para cubrir duplicados de Wix Contacts. Queda logueado como origen.
//
// v1.5.3 — FIX lectura Club KALONICE en Wix Contacts.
//   El campo personalizado es una Casilla de verificación con clave
//   visible `club_kalonice`, pero Wix puede devolverlo en extendedFields
//   con clave `club_kalonice` o `custom.club_kalonice`, y el valor puede
//   venir como boolean, string, número u objeto según contexto/API.
//   Antes se comprobaba solo `ef[club_kalonice] === true`, demasiado
//   rígido. Ahora se lee de forma flexible y se normaliza a boolean:
//   true, "true", 1, "1", "SI", "SÍ", "yes", "activo", "socio", etc.
//   No cambia el shape de salida: `club: { activo, imagen, url }`.
//   No requiere cambios en page code ni en custom element.
//
// v1.5.0 — Club KALÓNICE en el bloque Programa de Fidelización.
//   getAreaCliente devuelve un nuevo objeto `club`:
//     { activo: boolean, imagen: 'https://…', url: 'https://…' }
//   · activo: lectura de extendedFields['club_kalonice'] (checkbox
//     Wix Contacts) — SI/NO de pertenencia al club.
//   · imagen + url: lectura de SalonConfig.imagenClub y
//     SalonConfig.urlClub. Mismo patrón multi-tenant que logoUrl.
//     La imagen se convierte a https con wixImageToHttps.
//   Si SalonConfig falla, devuelve clubImagen='' y clubUrl='' — el
//   Custom Element no pinta la tarjeta. Defensa graceful.
//
// v1.4.1 — FIX cambio de foto: ahora también actualiza Wix Members.
//   Antes solo se actualizaba Wix Contacts (contacts.updateContact),
//   pero Wix Contacts y Wix Members son sistemas separados. Por eso
//   la foto aparecía en el área de cliente al recargar (la API
//   getContact sí devolvía la nueva URL) pero NO en el header del
//   sitio ni en el Dashboard de Wix Members (que leen de
//   PrivateMembersData/FullData, sistema Members).
//
//   Caso confirmado en docs oficiales Wix:
//   forum.wixstudio.com/t/update-member-using-updatemember-wix-
//   members-backend/63983 — ShanaBlack encontró el formato correcto:
//   { profile: { profilePhoto: { url: 'https://static.wixstatic.com/
//   media/<fileName>' } } } — que es EXACTAMENTE el formato que ya
//   construye nuestra wixImageToHttps.
//
//   Cambios v1.4.1:
//     · import members de wix-members-backend.
//     · cambiarFotoContacto ahora recibe también memberId (además de
//       memberContactId — son IDs distintos en Wix).
//     · Tras contacts.updateContact, llamada adicional a
//       members.updateMember(memberId, {profile:{profilePhoto:{url:
//       publicUrl}}}) con elevate.
//     · Si members.updateMember falla (no debería), se loggea como
//       warning y la función devuelve OK igualmente. La foto del
//       área de cliente seguirá funcionando porque contacts ya está
//       actualizado. UX no se rompe por una sincronización secundaria.
//
// v1.4.0 — Repetir compra REAL (añade producto al carrito Wix Stores).
//   Sustituye al mockup v1.x donde el listener solo redirigía a /tienda.
//
//   · CHANGE getAreaCliente.productos[]: añadido campo `productId`
//     (= li.catalogReference.catalogItemId, el ID de Wix Stores).
//     Backward-compatible: el campo `id` (= li._id) sigue existiendo.
//
//   · NEW `repetirCompraCliente({memberContactId, productId, quantity})`:
//     Valida ownership del miembro logueado (sesión Wix Members).
//     Llama a wix-ecom-backend.currentCart.addToCurrentCart con el
//     catalogReference oficial de Wix Stores:
//       appId: '215238eb-22a5-4c36-9e7b-e7c08025e04e' (constante Wix Stores)
//       catalogItemId: productId
//     Esta es la API moderna recomendada por Wix; la anterior
//     wix-stores-frontend.cart.addProducts() está deprecated (sigue
//     funcionando pero se migra a esta).
//     Devuelve cartId + cantidad de lineItems del carrito tras la
//     adición.
//
// v1.3.0 — Mover cita real con validación de disponibilidad.
//   Dos funciones nuevas. Sustituyen al mockup v1.0.x donde el page code
//   solo recargaba snapshot.
//
//   IMPORTANTE: NO se toca backend/widgetPublicoLogic.web.js. El motor
//   getHuecosDisponibles se usa TAL CUAL está en producción (v0.6.2)
//   sin parámetros nuevos. Cuando un cliente decide mover una cita,
//   mentalmente ya está "liberando" su slot actual — no va a elegirse
//   la misma hora exacta donde ya está. Por tanto el motor puede ver
//   la cita original como ocupada en su hora actual sin que afecte al
//   flujo: hay otras 50 horas libres en el día.
//
//   · NEW `getHuecosCambioReserva({memberContactId, reservaId, fecha})`:
//       Valida ownership (reserva pertenece al miembro logueado) y
//       devuelve los huecos del día para mover esa reserva concreta.
//       Internamente delega en widgetPublicoLogic.getHuecosDisponibles
//       (v0.6.2 ya en producción) pasando:
//         - proId: registro.staffId (la cita conserva su profesional)
//         - durationMin: duracionTotal + extensionMin
//         - idStaffPermitidos: [staffId] (solo ese profesional)
//
//   · NEW `moverCitaCliente({memberContactId, reservaId, nuevaFecha, nuevaHora})`:
//       Valida ownership + revalida disponibilidad antes de aplicar
//       el cambio (defensa contra race condition: el cliente vio un
//       hueco hace 30s pero otro reservó entretanto). Si el slot ya
//       no está libre → error 'Slot no disponible'.
//       Tras validación, delega en recepcionProLogic.reprogramarReserva
//       que recalcula las fases con delta y actualiza fechaReserva.
//       Misma función que ya usa Recepción Pro V2 para mover por arrastre.
//       NO toca sessions Wix Bookings — la agenda V2 lee del CMS y por
//       tanto refleja el cambio. (Pendiente para una versión futura:
//       sincronizar sessions para Google Calendar staff.)
//
// v1.2.2 — Cambio de foto de perfil del contacto (Wix Contacts).
//   Nueva función `cambiarFotoContacto({memberContactId, base64Data,
//   fileName, mimeType})` que:
//     1) Sube el archivo (base64) al Media Manager de Wix via
//        mediaManager.upload con elevate. Devuelve fileUrl wix:image://.
//     2) Convierte fileUrl a URL pública https con wixImageToHttps.
//     3) Lee el contacto (contacts.getContact con suppressAuth) para
//        obtener su `revision`. Wix exige revision actual en update
//        para evitar sobrescrituras concurrentes.
//     4) Actualiza el contacto con picture:{image:URL, imageProvider:'EXTERNAL'}.
//        suppressAuth + allowDuplicates:false.
//   Patrón exacto del que ChatGPT confirmó funciona en Wix Studio Forum.
//
// v1.2.1 — Fotos productos via CMS Stores/Products + Badges nativas Wix.
//   · FOTOS: query única a wixData.query('Stores/Products') con
//     suppressAuth construye mapa productId → mainMedia. En cada
//     lineItem de orders.searchOrders se lee catalogReference.catalogItemId
//     y se cruza con el mapa. La URL wix:image:// se convierte a
//     https://static.wixstatic.com/media/<id> con wixImageToHttps.
//     Patrón productivo idéntico al de tiendaEdicionLogic.web.js
//     (campo mainMedia leído del CMS, conversión a https).
//   · BADGES (insignias): query DIRECTA a la colección Members/Badges
//     con wixData.query('Members/Badges').hasSome('members', [memberId])
//     y suppressAuth (la colección es admin-only de lectura). Devuelve
//     title/backgroundColor/textColor/icon en una sola llamada — no
//     necesitamos pasar por badges.listMemberBadges + segunda query.
//     Se devuelven en cliente.badges[]. Como compat con el Custom
//     Element v1.0.3 (que solo lee puntos.insignia como string para la
//     pill del ring), el title de la primera badge se replica también
//     en puntos.insignia.
//   · REQUISITO: el page code debe enviar memberId además de memberContactId.
//     currentMember.getMember()._id es el memberId. Si no llega memberId,
//     badges queda vacío (compat hacia atrás, no rompe).
//
// v1.2.0 — Lectura de puntos via wix-loyalty.v2.
// v1.1.0 — Shape compatible con kami-area-cliente.js v1.0.3.
//   El Custom Element parte del diseño original de Claude Design (fiel
//   al 95%) y espera campos específicos. Backend hace el adaptado:
//     · proximas[]:   añadidos fecha, horaIni, horaFin, dia, lugar
//     · anteriores[]: añadidos fecha (YYYY-MM-DD), categoria (= family)
//     · productos[]:  foto extraída defensivamente de string|{url}|{src}
//     · notaCliente:  añadidos texto (entrada más reciente) y editado
//                     (fecha de esa entrada). Mantenidos historico y raw.
//     · expediente:   nuevo bloque con detalles[{etiqueta,valor}] parseado
//                     desde customnotaspublicas (formato "Etiqueta: valor"
//                     una por línea). Si la nota no tiene este formato,
//                     devuelve un único par con etiqueta vacía.
//     · cliente:      añadidos expedienteActivo (boolean) — true si el
//                     salón ha escrito al menos una línea en customnotaspublicas.
//     · puntos:       añadidos nivel ('Habitual' default) y comoGanar
//                     (placeholder copy hasta que el salón configure).
//
// v1.0.0 — Primera entrega.
//
// PROPÓSITO:
//   API de lectura/escritura para el Custom Element <kami-area-cliente>.
//   El cliente logueado (Wix Member) ve sus datos personales, su
//   historial de servicios y compras, sus puntos, deja notas al salón y
//   cancela citas.
//
// SCOPE v1.0.0 (MVP):
//   ✅ Ver perfil (Wix Contacts: nombre, apellido, email, teléfono,
//      foto, custom.sexo, invoices.vatId).
//   ✅ Editar perfil (READ-MERGE-UPDATE — nunca borra campos no enviados).
//   ✅ Ver próximas citas (KamisuiteReservations, próximos 45 días).
//   ✅ Ver historial de servicios (PaymentReservations, mismo patrón
//      careProfileLogic — filtro en memoria por nombre+apellido en lower).
//   ✅ Ver productos comprados (wix-ecom orders.searchOrders, mismo
//      patrón careProfileLogic — excluye NOT_PAID y REFUNDED).
//   ✅ Leer notas públicas del salón (`customnotaspublicas`, read-only).
//   ✅ Añadir nota al salón (append histórico con timestamp + " | ",
//      mismo patrón que coloracionLogic/tratamientosLogic V1 saveNotaToCRM).
//   ✅ Cancelar cita (delega en recepcionProLogic.cancelarReserva con
//      validación previa de ownership por contactId).
//
// FUERA DE SCOPE v1.0.0:
//   ⏭️ Mover cita. Razones técnicas y alternativa documentadas en el
//      bloque "MOVER CITA" al final del archivo.
//   ⏭️ Puntos / insignias. Devolvemos `{saldo:0, insignia:''}` por
//      defecto — confirmar campo exacto de fidelización en Wix Contacts
//      cuando Jal lo defina.
//
// CLAVES DE CAMPOS PERSONALIZADOS (KALONICE):
//   Confirmadas con Wix Dashboard → CRM → Ajustes → Campos personalizados.
//   ATENCIÓN: Wix mezcla dos convenciones según fecha de creación del
//   campo. NO unificar — usar las claves literales.
//     · custom.notas-fonyemjtcfteotgxzkaamjbuwmyuz (con punto + guiones)
//     · customnotaspublicas                        (todo junto sin punto)
//     · custom.sexo                                (con punto)
//     · invoices.vatId                             (system field Wix Invoices)
//
// PERMISOS:
//   Permissions.SiteMember en TODAS las funciones. Wix garantiza sesión
//   miembro activa. El payload incluye memberContactId pasado desde el
//   page code (que lo obtuvo de wix-members currentMember.getMember()).
//   Validación de ownership reforzada en cancelar (cross-check con
//   contactId del registro KamisuiteReservations).
//
// REUTILIZA:
//   · recepcionProLogic.cancelarReserva (V2, ya en producción)
//   · Mismo patrón saveNotaToCRM de coloracionLogic / tratamientosLogic
//   · Mismo patrón careProfileLogic para servicios y productos
// =====================================================

import { Permissions, webMethod } from 'wix-web-module';
import { elevate } from 'wix-auth';
import { contacts } from 'wix-crm-backend';
import { members } from 'wix-members-backend';
import { orders } from 'wix-ecom-backend';
import { currentCart } from 'wix-ecom-backend';
import { accounts } from 'wix-loyalty.v2';
import { mediaManager } from 'wix-media-backend';
import { cancelarReserva, reprogramarReserva } from 'backend/recepcionProLogic.web';
import { getHuecosDisponibles } from 'backend/widgetPublicoLogic.web';
import wixData from 'wix-data';

const VERSION = '1.6.6';
const TAG = `[ClienteArea][${VERSION}]`;

// App ID constante de Wix Stores. Requerido en catalogReference.appId
// para añadir productos al carrito vía wix-ecom-backend.currentCart.
// Documentado en https://dev.wix.com/docs/velo/apis/wix-stores-backend/e-commerce-integration
const WIX_STORES_APP_ID = '215238eb-22a5-4c36-9e7b-e7c08025e04e';

// Colecciones
const CMS_RESERVAS     = 'KamisuiteReservations';
const CMS_PAGOS        = 'PaymentReservations';
const CMS_SALON_CONFIG = 'SalonConfig';

// Claves de campos personalizados Wix Contacts — KALONICE
// (verificadas en el diálogo "Editar campo personalizado" / Lector CMS)
const FIELD_NOTAS_CLIENTE  = 'custom.notas-fonyemjtcfteotgxzkaamjbuwmyuz';
const FIELD_NOTAS_PUBLICAS = 'customnotaspublicas';
const FIELD_SEXO           = 'custom.sexo';
const FIELD_VAT_ID         = 'invoices.vatId';
// v1.6.0 — La constante FIELD_CLUB_KALONICE se ha retirado. La escritura
// del checkbox sigue viva en primePublicLogic.confirmPrimePayment (al
// comprar PRIME), pero este backend ya no lo lee.

const DIAS_FUTURO_PROXIMAS = 45;
const LIMITE_PAYMENT_RES   = 500;

// =====================================================
// HELPERS
// =====================================================

function safeErr(e) {
  return { message: e?.message || String(e) };
}

function isGuid(x) {
  return typeof x === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
}

// v1.6.2 — Helpers REINCORPORADOS respecto a v1.6.0/v1.6.1.
// La v1.5.5 (subida por el usuario tras v1.6.1) trajo lectura flexible
// de Notas públicas que APROVECHA estos tres helpers que yo había
// retirado creyéndolos exclusivos de Club KALONICE. NO lo son:
//   · valorDeItemExtendedField — la usa leerNotasPublicasFlexible.
//   · listarKeysDebug          — la usa el debug de notas públicas.
//   · safeJsonLog              — la usa el debug de notas públicas.
// Copia literal de v1.5.4 / v1.5.5 (no cambian en ninguna revisión).
//
// Helpers definitivamente RETIRADOS (solo servían al bloque Club
// KALONICE eliminado en v1.6.0, sin más consumidores):
//   · normalizarClaveDebug, esClaveClubKalonice,
//     leerExtendedFieldFlexible, normalizarClubActivo.
//   · Constante FIELD_CLUB_KALONICE.

function valorDeItemExtendedField(item) {
  if (!item || typeof item !== 'object') return item;
  const props = [
    'value', 'checked', 'checkbox', 'booleanValue', 'boolValue',
    'selected', 'isChecked', 'enabled', 'text', 'label', 'name'
  ];
  for (const p of props) {
    if (Object.prototype.hasOwnProperty.call(item, p)) return item[p];
  }
  return item;
}

/**
 * v1.5.4 — Lista claves/caminos reales de un objeto para logs de diagnóstico.
 * Limita profundidad y cantidad para no llenar logs de Wix.
 */
function listarKeysDebug(obj, maxDepth = 3, maxKeys = 120) {
  const out = [];
  const seen = new Set();
  function walk(v, path, depth) {
    if (out.length >= maxKeys) return;
    if (!v || typeof v !== 'object' || seen.has(v) || depth > maxDepth) return;
    seen.add(v);
    if (Array.isArray(v)) {
      out.push(`${path || 'root'}[]`);
      const lim = Math.min(v.length, 5);
      for (let i = 0; i < lim; i++) walk(v[i], `${path || 'root'}[${i}]`, depth + 1);
      return;
    }
    for (const k of Object.keys(v)) {
      const p = path ? `${path}.${k}` : k;
      out.push(p);
      if (v[k] && typeof v[k] === 'object') walk(v[k], p, depth + 1);
      if (out.length >= maxKeys) return;
    }
  }
  walk(obj, '', 0);
  return out;
}

function safeJsonLog(val, max = 1400) {
  let s = '';
  try {
    s = JSON.stringify(val);
  } catch (_) {
    s = String(val);
  }
  if (s == null) s = '';
  return s.length > max ? `${s.slice(0, max)}…[truncado]` : s;
}

// v1.5.5 — aliases reales/tolerados para Notas públicas.
// En Wix Dashboard el campo confirmado tiene:
//   Nombre: custom.notasPublicas
//   Clave:  customnotaspublicas
const FIELD_NOTAS_PUBLICAS_ALIASES = [
  FIELD_NOTAS_PUBLICAS,
  'customnotaspublicas',
  'custom.notasPublicas',
  'custom.notaspublicas',
  'notasPublicas',
  'notaspublicas'
];

function _normalizarClaveDebugLocal(x) {
  return String(x == null ? '' : x)
    .trim()
    .toLowerCase()
    .replace(/^custom\./, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function esClaveNotasPublicas(k) {
  const nk = _normalizarClaveDebugLocal(k);
  if (!nk) return false;
  return FIELD_NOTAS_PUBLICAS_ALIASES
    .map(_normalizarClaveDebugLocal)
    .filter(Boolean)
    .includes(nk);
}

function normalizarTextoCampo(raw) {
  if (raw === null || raw === undefined) return '';
  if (typeof raw === 'string') return raw;
  if (typeof raw === 'number' || typeof raw === 'boolean') return String(raw);

  if (Array.isArray(raw)) {
    return raw.map(v => normalizarTextoCampo(v)).filter(Boolean).join('\n');
  }

  if (typeof raw === 'object') {
    const candidatos = [
      raw.value,
      raw.text,
      raw.label,
      raw.name,
      raw.displayValue,
      raw.formattedValue
    ];

    for (const c of candidatos) {
      const txt = normalizarTextoCampo(c);
      if (txt) return txt;
    }

    return '';
  }

  return String(raw || '');
}

/**
 * v1.5.5 — Lectura flexible específica de Notas públicas.
 * No usa `esClaveClubKalonice` (fuzzy pensado solo para Club).
 * Cubre estas formas posibles:
 *   1) Claves planas exactas listadas en FIELD_NOTAS_PUBLICAS_ALIASES.
 *   2) Claves planas normalizadas (tolerantes a acentos/guiones/mayúsculas).
 *   3) Estructuras tipo extendedFields.items[] con { key, value }.
 *   4) Búsqueda anidada defensiva hasta profundidad 4.
 */
function leerNotasPublicasFlexible(extendedFields) {
  const ef = extendedFields && typeof extendedFields === 'object' ? extendedFields : {};

  // 1) Claves planas exactas.
  for (const k of FIELD_NOTAS_PUBLICAS_ALIASES) {
    if (Object.prototype.hasOwnProperty.call(ef, k)) {
      return { key: k, value: ef[k], path: k, source: 'direct-exact' };
    }
  }

  // 2) Claves planas normalizadas.
  for (const k of Object.keys(ef)) {
    if (esClaveNotasPublicas(k)) {
      return { key: k, value: ef[k], path: k, source: 'direct-fuzzy' };
    }
  }

  // 3) Estructuras tipo extendedFields.items[].
  const arraysCandidatos = [];
  if (Array.isArray(ef)) arraysCandidatos.push({ arr: ef, path: 'extendedFields' });
  if (Array.isArray(ef.items)) arraysCandidatos.push({ arr: ef.items, path: 'extendedFields.items' });
  if (Array.isArray(ef.values)) arraysCandidatos.push({ arr: ef.values, path: 'extendedFields.values' });
  if (Array.isArray(ef.fields)) arraysCandidatos.push({ arr: ef.fields, path: 'extendedFields.fields' });

  for (const pack of arraysCandidatos) {
    for (let i = 0; i < pack.arr.length; i++) {
      const item = pack.arr[i];
      if (!item || typeof item !== 'object') continue;

      const itemKey = item.key || item.fieldKey || item.fieldName || item.name || item.id || item._id || '';
      if (esClaveNotasPublicas(itemKey)) {
        return {
          key: itemKey,
          value: valorDeItemExtendedField(item),
          path: `${pack.path}[${i}]`,
          source: 'items-array'
        };
      }
    }
  }

  // 4) Búsqueda anidada defensiva.
  const seen = new Set();

  function walk(obj, path, depth) {
    if (!obj || typeof obj !== 'object' || depth > 4 || seen.has(obj)) return null;
    seen.add(obj);

    const objKey = obj.key || obj.fieldKey || obj.fieldName || obj.name || obj.id || obj._id || '';
    if (esClaveNotasPublicas(objKey)) {
      return {
        key: objKey,
        value: valorDeItemExtendedField(obj),
        path,
        source: 'nested-key-object'
      };
    }

    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) {
        const r = walk(obj[i], `${path}[${i}]`, depth + 1);
        if (r) return r;
      }
      return null;
    }

    for (const [k, v] of Object.entries(obj)) {
      if (esClaveNotasPublicas(k)) {
        return { key: k, value: v, path: path ? `${path}.${k}` : k, source: 'nested-property' };
      }

      if (v && typeof v === 'object') {
        const r = walk(v, path ? `${path}.${k}` : k, depth + 1);
        if (r) return r;
      }
    }

    return null;
  }

  const nested = walk(ef, 'extendedFields', 0);
  if (nested) return nested;

  return { key: '', value: undefined, path: '', source: 'not-found' };
}

// v1.1.0 — helpers para shape compatible con Custom Element v1.0.3.

/**
 * Devuelve YYYY-MM-DD en zona Madrid de un Date/string/null.
 */
function ymdMadrid(any) {
  if (!any) return '';
  const d = any instanceof Date ? any : new Date(any);
  if (isNaN(d)) return '';
  // toLocaleDateString con 'es-CA' devuelve YYYY-MM-DD
  return d.toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });
}

/**
 * Devuelve HH:mm en zona Madrid de un Date/string/null.
 */
function hhmmMadrid(any) {
  if (!any) return '';
  const d = any instanceof Date ? any : new Date(any);
  if (isNaN(d)) return '';
  return d.toLocaleTimeString('es-ES', {
    timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hour12: false
  });
}

/**
 * Día de la semana en castellano (Madrid).
 */
function diaSemMadrid(any) {
  if (!any) return '';
  const d = any instanceof Date ? any : new Date(any);
  if (isNaN(d)) return '';
  // toLocaleString con weekday long en 'es-ES' devuelve "lunes", "martes"...
  const dow = d.toLocaleString('es-ES', { timeZone: 'Europe/Madrid', weekday: 'long' });
  return dow.charAt(0).toUpperCase() + dow.slice(1);
}

/**
 * Construye un ISO UTC a partir de (fecha YYYY-MM-DD, hora HH:mm) en zona Madrid.
 * Duplicado del estándar del proyecto — misma implementación que
 * recepcionProLogic.madridToUTC / externosLogic.madridToUTC / coloracionLogic.
 * v1.3.0 — Necesario para mover cita: el cliente envía fecha+hora local
 * Madrid (string), aquí construimos el timestamp UTC que se almacena en
 * KamisuiteReservations.fechaReserva.
 */
function madridToUTC(fechaISO, horaHHmm) {
  const [year, month, day] = String(fechaISO).split('-').map(Number);
  const [hour, minute] = String(horaHHmm).split(':').map(Number);
  const d = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const madridStr = d.toLocaleString('en-US', {
    timeZone: 'Europe/Madrid',
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  });
  const match = madridStr.match(/(\d+)\/(\d+)\/(\d+),\s*(\d+):(\d+)/);
  if (!match) return d.toISOString();
  const madridHour = parseInt(match[4]);
  const madridMin = parseInt(match[5]);
  const targetMin = hour * 60 + minute;
  const madridMin2 = madridHour * 60 + madridMin;
  const diffMin = targetMin - madridMin2;
  const utc = new Date(d.getTime() + (diffMin * 60000));
  return utc.toISOString();
}

/**
 * Suma minutos a una fecha y devuelve nueva Date.
 */
function sumarMinutos(any, min) {
  if (!any) return null;
  const d = any instanceof Date ? new Date(any.getTime()) : new Date(any);
  if (isNaN(d)) return null;
  d.setMinutes(d.getMinutes() + (Number(min) || 0));
  return d;
}

/**
 * Extrae URL de imagen de un lineItem de wix-ecom defensivamente.
 * El campo `image` puede llegar como string, objeto, o vacío.
 * Devuelve siempre URL https pública (convierte wix:image://v1/<id>/...
 * a https://static.wixstatic.com/media/<id>) o '' si no hay imagen.
 */
function wixImageToHttps(wixUrl) {
  if (!wixUrl || typeof wixUrl !== 'string') return '';
  if (wixUrl.startsWith('http://') || wixUrl.startsWith('https://')) return wixUrl;
  if (!wixUrl.startsWith('wix:image://')) return '';
  const m = wixUrl.match(/^wix:image:\/\/v1\/([^\/]+)/);
  return m && m[1] ? `https://static.wixstatic.com/media/${m[1]}` : '';
}

/**
 * v1.6.3 — Sanitizador defensivo del SalonConfig.siteUrl.
 *
 * Corrige el patrón "wwwX.tld" → "www.X.tld" cuando alguien escribe
 * el dominio sin el punto tras "www" (ej: "wwwsalonkami.com" en vez
 * de "www.salonkami.com"). Preserva protocolo, puerto y path.
 *
 * Casos:
 *   "https://wwwsalonkami.com"        → "https://www.salonkami.com"
 *   "https://www.salonkami.com"       → sin cambios (ya bien)
 *   "https://salonkami.com"           → sin cambios (sin www)
 *   "wwwsalonkami.com"                → "https://www.salonkami.com"
 *   "https://wwwkalonice.com/foo"     → "https://www.kalonice.com/foo"
 *
 * Si detecta y corrige, deja rastro en log. Idempotente.
 */
function sanitizarSiteUrl(rawUrl) {
  let s = String(rawUrl || '').trim();
  if (!s) return '';

  // Si no viene con esquema, asumimos https.
  if (!/^https?:\/\//i.test(s)) {
    s = 'https://' + s;
  }

  // Localiza el host tras el esquema.
  // Regex: capturamos protocolo, "www", primer carácter del dominio
  // (que NO debe ser "."), y el resto hasta el próximo "." (TLD o
  // subdominio siguiente). Si tras "www" ya viene ".", no matchea.
  const patronMalformado = /^(https?:\/\/)www([^.\/][^\/]*?)(\.[^\.\/]+)(\/|$|\?|#)/i;

  if (patronMalformado.test(s)) {
    const antes = s;
    s = s.replace(patronMalformado, '$1www.$2$3$4');
    try {
      console.log(`[sanitizarSiteUrl] corregido "${antes}" → "${s}"`);
    } catch (_) {}
  }

  return s;
}

function imagenDeLineItem(li) {
  const raw = li?.image;
  if (!raw) return '';
  if (typeof raw === 'string') return wixImageToHttps(raw);
  if (typeof raw === 'object') {
    return wixImageToHttps(raw.url || raw.src || raw.href || '');
  }
  return '';
}

/**
 * Extrae el productId del lineItem de un order de wix-ecom.
 * Wix eCommerce lo guarda en catalogReference.catalogItemId para
 * productos de Wix Stores. Usado para cruzar con Stores/Products
 * y leer mainMedia del CMS (patrón productivo del proyecto).
 */
function productIdDeLineItem(li) {
  return li?.catalogReference?.catalogItemId
      || li?.catalogReference?.productId
      || li?.productId
      || '';
}

/**
 * v1.6.5 — AppId oficial de Wix Stores. Persistente en
 * `lineItem.catalogReference.appId` de cada order aunque el producto
 * se descatalogue posteriormente.
 *
 * ÚLTIMA VERIFICACIÓN: 1 de julio de 2026 en documentación pública de
 * Wix (dev.wix.com — API wix-ecom-backend / integración de catálogos).
 * Estos appIds llevan años estables; Wix no los cambia sin BC break
 * anunciado. Si alguna vez fuera necesario reverificar, buscar
 * "Wix Stores appId" en dev.wix.com y comparar con el valor de esta
 * constante.
 *
 * Otros appIds conocidos por si se necesitan en el futuro:
 *   Wix Bookings:     13d21c63-b5ec-5912-8397-c3a5ddb27a97
 *   Wix Restaurants:  9a5d83fd-8570-482e-81ab-cfa88942ee60
 */
const APP_ID_WIX_STORES = '215238eb-22a5-4c36-9e7b-e7c08025e04e';

/**
 * v1.6.5 — Comprueba si un lineItem proviene de Wix Stores.
 * Se usa para filtrar el bloque "Productos comprados" del Área de
 * Cliente y evitar que servicios de Bookings V1 (u otras integraciones)
 * aparezcan como si fueran productos. El appId es metadata inmutable
 * del order: sigue siendo Stores aunque el productId ya no exista en
 * el CMS `Stores/Products`.
 */
function esProductoStores(li) {
  return li?.catalogReference?.appId === APP_ID_WIX_STORES;
}

/**
 * Parsea customnotaspublicas (texto plano del salón) en pares
 * [{ etiqueta, valor }] esperados por el Custom Element.
 *
 * Estrategia:
 *   - Divide por saltos de línea.
 *   - Si una línea contiene ":", la parte antes es etiqueta y la parte
 *     después es valor.
 *   - Si una línea no contiene ":", se trata como valor con etiqueta
 *     vacía (= continúa el detalle anterior si lo hay, o crea uno suelto).
 *
 * Ejemplos:
 *   "Color: rubio platino\nLongitud: media"
 *     → [{etiqueta:'Color', valor:'rubio platino'},
 *        {etiqueta:'Longitud', valor:'media'}]
 *
 *   "Color rojo teja"  (formato libre, sin ":")
 *     → [{etiqueta:'', valor:'Color rojo teja'}]
 */
function parsearNotasPublicas(raw) {
  if (!raw || typeof raw !== 'string') return [];
  const lineas = String(raw).split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const out = [];
  for (const linea of lineas) {
    const idx = linea.indexOf(':');
    if (idx > 0 && idx < 60) {
      out.push({
        etiqueta: linea.substring(0, idx).trim(),
        valor: linea.substring(idx + 1).trim()
      });
    } else {
      out.push({ etiqueta: '', valor: linea });
    }
  }
  return out;
}

/**
 * Parsea el histórico de notas almacenado como:
 *   "[12/06/2026 10:30:45] mensaje | [05/06/2026 14:20:10] otro"
 * a array [{ fecha, texto }] orden cronológico inverso (más reciente arriba).
 * Tolera entradas sin timestamp (las pinta con fecha vacía).
 */
function parseNotasHistorico(raw) {
  if (!raw || typeof raw !== 'string') return [];
  return String(raw)
    .split(' | ')
    .map(s => s.trim())
    .filter(Boolean)
    .map(entry => {
      const m = entry.match(/^\[([^\]]+)\]\s*(.+)$/);
      if (m) return { fecha: m[1].trim(), texto: m[2].trim() };
      return { fecha: '', texto: entry };
    })
    .reverse();
}

/**
 * Construye el shape del cliente que el Custom Element espera.
 * v1.1.0: añadido `expedienteActivo` (boolean) — true si el salón ha
 * escrito al menos algo en customnotaspublicas.
 */
function shapeCliente(contact, tieneNotasPublicas) {
  const info = contact?.info || {};
  const name = info.name || {};
  const ef = info.extendedFields || {};
  const email = (info.emails?.[0]?.email) || '';
  const phone = (info.phones?.[0]?.phone) || '';

  // Foto: Wix puede devolverla en distintos campos según la API.
  const foto = info.picture?.image || info.photoUrl || '';

  return {
    id: contact._id,
    nombre: name.first || '',
    apellido: name.last || '',
    sexo: ef[FIELD_SEXO] || '',
    dni: ef[FIELD_VAT_ID] || '',
    email,
    telefono: phone,
    foto,
    expedienteActivo: !!tieneNotasPublicas
  };
}

/**
 * Valida que el memberContactId del payload es un GUID válido.
 * Permissions.SiteMember ya garantiza que existe sesión miembro;
 * el page code es responsable de pasar el contactId correcto (lo obtiene
 * de wix-members currentMember.getMember()).
 *
 * Nota: la validación de ownership de la reserva en cancelarCitaCliente
 * es la defensa real contra payloads manipulados — cross-check con
 * contactId del registro.
 */
function validarMemberContactId(memberContactId) {
  if (!memberContactId || !isGuid(memberContactId)) {
    return { ok: false, error: { message: 'memberContactId inválido' } };
  }
  return { ok: true };
}

// =====================================================
// 1 · GET AREA CLIENTE (snapshot completo para el widget)
// =====================================================
// Devuelve TODA la información del Área de Cliente en una sola llamada.
// El Custom Element <kami-area-cliente> v1.0.3 (basado en el diseño
// original de Claude Design) consume este shape exacto.
//
// SHAPE v1.6.2:
//   {
//     ok, version,
//     cliente: { id, nombre, apellido, sexo, dni, email, telefono, foto,
//                expedienteActivo },
//     notaCliente: {
//       texto: '...',         // texto de la entrada MÁS RECIENTE
//       editado: 'DD/MM/YYYY HH:mm:ss',
//       historico: [{ fecha, texto }, ...]  // todas las entradas (recientes primero)
//       raw: '...'
//     },
//     notasPublicas: '...',                 // raw del salón (para debug)
//     notasPublicasOrigen: 'contacto-logueado' | 'contacto-duplicado-mismo-email:<id>',
//     proximas: [{ id, fecha:'YYYY-MM-DD', dia, horaIni:'HH:mm',
//                  horaFin:'HH:mm', servicio, profesional, lugar,
//                  staffId, family, precioTotal, status,
//                  fechaReserva (ISO original), duracionTotal }],
//     anteriores: [{ id, fecha:'YYYY-MM-DD', servicios:[],
//                    profesional, importe, categoria (=family) }],
//     productos: [{ id, orderId, nombre, cantidad, importe, foto, fecha }],
//     puntos: { saldo, insignia, nivel, comoGanar },
//     expediente: {
//       detalles: [{ etiqueta, valor }],   // parseado de customnotaspublicas
//     } | null,                             // null si no hay notas públicas
//     salon: { brandName },                 // v1.6.0 — para título "Club {brandName}"
//     prime: {                              // v1.6.0
//       tiene: boolean,
//       membresia: { code, expirationDate:'YYYY-MM-DD' } | null,
//       imagen: 'https://…',                // KamisuiteProductsConfig.primeImage
//       urlAdquirir: 'https://…'            // SalonConfig.siteUrl + '/' + promotionsPageSlug
//     },
//     bonos: {                              // v1.6.0
//       tiene: boolean,
//       items: [{ id, code, serviceLabel, remainingUses, totalUses,
//                 expirationDate:'YYYY-MM-DD' }],
//       urlAdquirir: 'https://…'
//     },
//     tarjetas: {                           // v1.6.0
//       tiene: boolean,
//       items: [{ id, code, serviceLabel, expirationDate:'YYYY-MM-DD' }],
//       urlAdquirir: 'https://…'
//     }
//   }
// =====================================================
export const getAreaCliente = webMethod(
  Permissions.SiteMember,
  async ({ memberContactId, memberId } = {}) => {
    const t0 = Date.now();
    try {
      const ok = validarMemberContactId(memberContactId);
      if (!ok.ok) return { ok: false, version: VERSION, error: ok.error };

      // 1) Contacto Wix CRM (elevate — patrón careProfileLogic / V1 saveNotaToCRM)
      const elevatedGet = elevate(contacts.getContact);
      const contact = await elevatedGet(memberContactId);
      if (!contact) {
        return { ok: false, version: VERSION, error: { message: 'Contacto no encontrado' } };
      }

      const ef = contact.info?.extendedFields || {};
      const emailContacto = String(contact.info?.emails?.[0]?.email || '').trim();

      // 2) Notas públicas (salón → cliente). Read-only.
      // v1.5.5: lectura flexible + fallback por duplicados de Wix Contacts.
      const lecturaNotas = leerNotasPublicasFlexible(ef);
      let notasPublicasRaw = normalizarTextoCampo(lecturaNotas.value);
      let notasPublicasOrigen = 'contacto-logueado';

      const allExtendedKeysNotas = listarKeysDebug(ef || {}, 3, 120);
      const notasKeysDetectadas = allExtendedKeysNotas.filter(k => esClaveNotasPublicas(k));

      console.log(
        `${TAG} 🧩 Notas públicas debug v1.5.5 | ` +
        `contactId=${memberContactId} | email=${emailContacto || '-'} | ` +
        `extendedKeys=${safeJsonLog(allExtendedKeysNotas, 1800)} | ` +
        `notasKeys=${safeJsonLog(notasKeysDetectadas, 900)} | ` +
        `source=${lecturaNotas.source || '-'} | path=${lecturaNotas.path || '-'} | ` +
        `keyUsada=${lecturaNotas.key || '(ninguna)'} | ` +
        `chars=${String(notasPublicasRaw || '').length}`
      );

      if (!String(notasPublicasRaw || '').trim() && emailContacto) {
        try {
          const elevatedQueryContacts = elevate(contacts.queryContacts);
          const dupResp = await elevatedQueryContacts()
            .eq('info.emails.email', emailContacto)
            .limit(10)
            .find();

          const dupItems = dupResp?.items || [];
          const resumenDupNotas = [];

          for (const ct of dupItems) {
            const efDup = ct.info?.extendedFields || {};
            const lDup = leerNotasPublicasFlexible(efDup);
            const rawDup = normalizarTextoCampo(lDup.value);

            resumenDupNotas.push({
              id: ct._id || '',
              email: ct.info?.emails?.[0]?.email || '',
              key: lDup.key || '',
              path: lDup.path || '',
              chars: String(rawDup || '').length,
              preview: String(rawDup || '').slice(0, 80)
            });

            if ((ct._id || '') !== memberContactId && String(rawDup || '').trim()) {
              notasPublicasRaw = rawDup;
              notasPublicasOrigen = `contacto-duplicado-mismo-email:${ct._id || ''}`;
              break;
            }
          }

          console.log(
            `${TAG} 🧩 Notas públicas duplicate debug v1.5.5 | email=${emailContacto} | ` +
            `contactos=${dupItems.length} | resumen=${safeJsonLog(resumenDupNotas, 1800)} | ` +
            `origenFinal=${notasPublicasOrigen} | charsFinal=${String(notasPublicasRaw || '').length}`
          );

        } catch (eDupNotas) {
          console.warn(`${TAG} ⚠️ Notas públicas duplicate debug falló: ${eDupNotas.message}`);
        }
      }

      const tieneNotasPublicas = !!String(notasPublicasRaw || '').trim();

      // 3) Shape cliente (con expedienteActivo si hay notas públicas)
      const cliente = shapeCliente(contact, tieneNotasPublicas);

      // 4) Notas del cliente al salón (histórico append).
      // v1.1.0: el Custom Element espera { texto, editado } como la
      // entrada más reciente. Mantenemos historico y raw por compat.
      const historico = parseNotasHistorico(ef[FIELD_NOTAS_CLIENTE]);
      const ultimoTexto = historico.length ? historico[0].texto : '';
      const ultimoFecha = historico.length ? historico[0].fecha : null;
      const notaCliente = {
        texto: ultimoTexto,
        editado: ultimoFecha,
        historico,
        raw: ef[FIELD_NOTAS_CLIENTE] || ''
      };

      // 5) Próximas citas (KamisuiteReservations, próximos 45 días).
      const ahora = new Date();
      const limite = new Date(ahora.getTime() + DIAS_FUTURO_PROXIMAS * 24 * 60 * 60 * 1000);
      let proximas = [];
      try {
        const r = await wixData.query(CMS_RESERVAS)
          .eq('contactId', memberContactId)
          .ge('fechaReserva', ahora)
          .le('fechaReserva', limite)
          .ne('status', 'CANCELADA')
          .ascending('fechaReserva')
          .limit(50)
          .find({ suppressAuth: true });
        proximas = (r.items || []).map(it => {
          const fechaIni = it.fechaReserva instanceof Date
            ? it.fechaReserva : new Date(it.fechaReserva);
          const fechaFin = sumarMinutos(fechaIni, it.duracionTotal || 0);
          return {
            id: it._id,
            // Campos que espera el Custom Element v1.0.3:
            fecha:   ymdMadrid(fechaIni),
            dia:     diaSemMadrid(fechaIni),
            horaIni: hhmmMadrid(fechaIni),
            horaFin: fechaFin ? hhmmMadrid(fechaFin) : '',
            servicio: String(it.title || '').split(' — ')[0] || it.title || 'Servicio',
            profesional: it.staffName || '',
            lugar: 'KALONICE',
            // Campos extra que el Custom Element no usa pero el page code sí:
            staffId: it.staffId || '',
            family: it.family || '',
            precioTotal: it.precioTotal || 0,
            status: it.status || 'CONFIRMADA',
            fechaReserva: fechaIni.toISOString(),
            duracionTotal: it.duracionTotal || 0
          };
        });
      } catch (e) {
        console.warn(`${TAG} ⚠️ proximas: ${e.message}`);
      }

      // 6) Anteriores (PaymentReservations, mismo patrón careProfileLogic).
      let anteriores = [];
      try {
        const nombreCompleto = `${cliente.nombre} ${cliente.apellido}`.trim().toLowerCase();
        if (nombreCompleto) {
          const r = await wixData.query(CMS_PAGOS)
            .descending('fechaReserva')
            .limit(LIMITE_PAYMENT_RES)
            .find({ suppressAuth: true });
          anteriores = (r.items || [])
            .filter(it => {
              const nc = String(it.nombreCliente || '').toLowerCase();
              return nc && nc.includes(nombreCompleto);
            })
            .map(it => {
              const fechaIni = it.fechaReserva instanceof Date
                ? it.fechaReserva : new Date(it.fechaReserva);
              return {
                id: it._id,
                fecha: ymdMadrid(fechaIni),
                servicios: String(it.serviciosDetail || it.servicios || '')
                  .split(';;')
                  .map(s => s.split('|')[0])
                  .filter(Boolean),
                profesional: it.staffName || '',
                importe: it.importe || it.precioTotal || 0,
                categoria: it.family || ''
              };
            });
        }
      } catch (e) {
        console.warn(`${TAG} ⚠️ anteriores: ${e.message}`);
      }

      // 7) Productos (wix-ecom orders.searchOrders) — v1.2.1
      //
      // Patrón productivo del proyecto (tiendaEdicionLogic.web.js):
      // las imágenes se leen del CMS Stores/Products como `mainMedia`
      // (string wix:image://...) y luego se convierten a https con
      // wixImageToHttps. Aquí hacemos lo mismo: una sola query al CMS
      // para construir un mapa productId → URL https, y por cada
      // lineItem cruzamos via catalogReference.catalogItemId.
      //
      // Fallback: si el lineItem no tiene catalogItemId conocido en
      // Stores/Products (p.ej. producto borrado), intentamos sacarla
      // del propio lineItem.image (string u objeto) via imagenDeLineItem.
      let productos = [];
      try {
        // 7.a — Mapa productId → URL https desde el CMS.
        const productIdToImage = {};
        try {
          let allProds = [];
          let skip = 0;
          const PAGE = 100;
          let hasMore = true;
          while (hasMore && skip < 2000) {
            const r = await wixData.query('Stores/Products')
              .limit(PAGE).skip(skip)
              .find({ suppressAuth: true });
            const page = r.items || [];
            allProds = allProds.concat(page);
            hasMore = page.length === PAGE;
            skip += PAGE;
          }
          for (const p of allProds) {
            const httpsUrl = wixImageToHttps(p.mainMedia || '');
            if (httpsUrl) productIdToImage[p._id] = httpsUrl;
          }
          console.log(`${TAG} 📦 Stores/Products: ${allProds.length} productos, ${Object.keys(productIdToImage).length} con imagen`);
        } catch (cmsErr) {
          console.warn(`${TAG} ⚠️ Query Stores/Products falló (sin fotos): ${cmsErr.message}`);
        }

        // 7.b — Orders del cliente.
        const elevatedSearch = elevate(orders.searchOrders);
        const result = await elevatedSearch({
          filter: { 'buyerInfo.contactId': { '$eq': memberContactId } }
        });
        const ordersList = (result?.orders || []).filter(o => {
          const ps = o.paymentStatus;
          return ps !== 'NOT_PAID' && ps !== 'REFUNDED';
        });
        // v1.6.5 — diagnóstico: contamos cuántos lineItems se filtran
        // por no venir de Wix Stores (típicamente servicios Bookings V1).
        let liTotal = 0;
        let liDescartados = 0;
        for (const o of ordersList) {
          const fechaRaw = o._createdDate || o.createdDate || null;
          const fecha = fechaRaw ? ymdMadrid(fechaRaw) : '';
          for (const li of (o.lineItems || [])) {
            liTotal++;
            // v1.6.5 — filtro por origen de la app. Solo entran items
            // de Wix Stores (productos reales), aunque estén hoy
            // descatalogados. Servicios de Bookings / otras integraciones
            // quedan fuera automáticamente.
            if (!esProductoStores(li)) {
              liDescartados++;
              continue;
            }
            const nombre = li.productName?.original
              || li.productName?.translated
              || li.productName
              || '';
            const importe = parseFloat(
              li.totalPriceAfterTax?.amount
              ?? li.price?.amount
              ?? '0'
            );
            // v1.2.1: foto desde el CMS Stores/Products por productId.
            const productId = productIdDeLineItem(li);
            let foto = productId ? (productIdToImage[productId] || '') : '';
            // Fallback al campo image del propio lineItem.
            if (!foto) foto = imagenDeLineItem(li);
            productos.push({
              id: li._id || li.id || '',
              orderId: o._id || o.id || '',
              productId: productId || '',   // v1.4.0 — necesario para "Repetir compra"
              nombre,
              cantidad: li.quantity || 1,
              importe,
              foto,
              fecha
            });
          }
        }
        console.log(`${TAG} 📦 Productos: ${productos.length} entran, ${liDescartados}/${liTotal} lineItems descartados (no Stores)`);
      } catch (e) {
        console.warn(`${TAG} ⚠️ productos: ${e.message}`);
      }

      // 8) Puntos — API NATIVA Wix Loyalty Program (v1.2.0).
      // accounts.getAccountBySecondaryId({contactId}) devuelve la cuenta
      // de loyalty del contacto. Requiere elevate (Manage Loyalty perms).
      // Si el cliente no tiene cuenta loyalty O el programa no está
      // activo en el site, devolvemos defaults (saldo 0) sin bloquear.
      const puntos = {
        saldo: 0,
        insignia: '',
        nivel: 'Habitual',
        comoGanar: 'Cada visita y cada producto suman puntos. Canjéalos por descuentos o servicios en tu próxima visita. El salón configura las recompensas.'
      };
      try {
        const elevatedLoyalty = elevate(accounts.getAccountBySecondaryId);
        const loyaltyResp = await elevatedLoyalty({ contactId: memberContactId });
        const acc = loyaltyResp?.account || loyaltyResp || null;
        if (acc) {
          // Estructura: account.points = { balance, earned, adjusted, redeemed }
          //             account.tier   = { id, points }   (tier opcional)
          puntos.saldo = Number(acc.points?.balance) || 0;
          // Tier name si existe (Loyalty Tiers API en preview). El id del
          // tier sirve como label de insignia hasta que el salón configure
          // nombres bonitos en Dashboard > Loyalty > Tiers.
          const tierName = acc.tier?.id || acc.tier?.name || '';
          if (tierName) {
            puntos.nivel = tierName;
            puntos.insignia = tierName.toUpperCase();
          }
          console.log(`${TAG} 🏆 Loyalty ${memberContactId}: saldo=${puntos.saldo} tier=${tierName || '-'}`);
        }
      } catch (e) {
        // Casos esperables: programa no activo, cuenta no creada para
        // este contacto. No es error real — defaults ya están puestos.
        console.log(`${TAG} ℹ️ Loyalty no disponible para ${memberContactId}: ${e.message}`);
      }

      // 8b) Badges nativas de Wix Members (v1.2.1).
      // Las badges son del SITE MEMBER, no del Contact CRM. Por eso
      // necesitamos memberId (que el page code obtiene de
      // currentMember.getMember()._id). Si no llega, badges queda vacío.
      //
      // Patrón directo: una sola query a la colección Members/Badges
      // filtrando por el campo `members` (array de memberIds con esa
      // insignia). suppressAuth obligatorio: Members/Badges tiene
      // permiso de lectura ADMIN. Devuelve title/colores/icon ya hechos,
      // sin necesidad de cruzar dos llamadas.
      let badgesDelMiembro = [];
      if (memberId) {
        try {
          const colResp = await wixData.query('Members/Badges')
            .hasSome('members', [memberId])
            .limit(100)
            .find({ suppressAuth: true });
          badgesDelMiembro = (colResp.items || []).map(b => ({
            id: b._id,
            title: b.title || '',
            description: b.description || '',
            backgroundColor: b.backgroundColor || '',
            textColor: b.textColor || '',
            icon: b.icon || '',
            slug: b.slug || ''
          }));
          console.log(`${TAG} 🏅 Badges miembro ${memberId}: ${badgesDelMiembro.length} (${badgesDelMiembro.map(b => b.title).join(', ')})`);
          // Compat con Custom Element v1.0.3: pill VIP del ring lee
          // puntos.insignia como string. Replicamos el title de la
          // primera badge ahí para que se vea ya sin tocar el CE.
          if (badgesDelMiembro[0]?.title) {
            puntos.insignia = badgesDelMiembro[0].title;
          }
        } catch (e) {
          console.warn(`${TAG} ⚠️ Badges no disponibles para ${memberId}: ${e.message}`);
        }
      } else {
        console.log(`${TAG} ℹ️ Sin memberId en payload → badges vacías (page code debe enviar member._id)`);
      }

      // 9) Expediente (parseado de customnotaspublicas).
      // null si el salón no ha escrito nada → Custom Element pinta el
      // estado vacío "Tu salón aún no ha registrado notas".
      const expediente = tieneNotasPublicas
        ? { detalles: parsearNotasPublicas(notasPublicasRaw) }
        : null;

      // 11) Productos custom del miembro (PRIME + Bonos + Tarjetas).
      // v1.6.1 — Queries LOCALES directas contra las tres colecciones,
      // replicando el patrón exacto de `voucherPublicLogic
      // .listarBonosActivosMiembro`, `primePublicLogic
      // .buscarPrimeActivaPorContactId` y `bonosPromosPublicLogic`
      // que YA funcionan en producción con este mismo cliente logueado
      // (widget público /promociones). La versión anterior delegaba en
      // `getProductosCustomCliente` de recepcionProLogic (import cross-
      // backend con permisos SiteMember), y devolvía payload vacío
      // aunque el cliente sí tuviera productos. Volver al patrón
      // directo elimina la ambigüedad.
      //
      // Filtros aplicados (patrón validado):
      //   · PRIME: query por contactId + descending _createdDate + limit 50.
      //     En JS: status === 'ACTIVA' + expirationDate > now.
      //   · Bonos: query por contactId + descending _createdDate + limit 200.
      //     En JS: status === 'ACTIVO' + remainingUses > 0 + expirationDate > now.
      //   · Tarjetas: query por buyerContactId + descending _createdDate + limit 200.
      //     En JS: status === 'EMITIDA' + isGift !== true + expirationDate > now.
      //     (isGift=true → tarjeta regalo, se canjea con código manual,
      //      NO aparece en el área del comprador.)
      //
      // 10.1) SalonConfig + KamisuiteProductsConfig — lectura combinada
      //       en un solo bloque para evitar dos idas al CMS SalonConfig.
      let brandName = '';
      let promotionsUrl = '';
      let primeImagenPublicUrl = '';
      let urlBooking = ''; // v1.6.4
      try {
        const [scRes, prodCfgRes] = await Promise.all([
          wixData.query(CMS_SALON_CONFIG).limit(1).find({ suppressAuth: true }),
          wixData.query('KamisuiteProductsConfig').limit(1).find({ suppressAuth: true })
        ]);
        const cfg = (scRes?.items || [])[0] || {};
        brandName = String(cfg.brandName || '').trim();
        const siteUrlRaw = String(cfg.siteUrl || '').trim();
        const slugRaw = String(cfg.promotionsPageSlug || '').trim();
        // v1.6.3 — Sanitiza el patrón "wwwX.tld" mal escrito en CMS.
        const siteUrlSaneada = sanitizarSiteUrl(siteUrlRaw);
        const siteUrl = siteUrlSaneada.replace(/\/+$/, '');
        const slug = slugRaw.replace(/^\/+/, '').replace(/\/+$/, '');
        if (siteUrl && slug) promotionsUrl = `${siteUrl}/${slug}`;

        // v1.6.4 — URL de reserva configurable desde SalonConfig.urlBooking.
        // Admite dos formatos:
        //   - Path interno:  "/reservar"          → wixLocation.to lo usa tal cual
        //   - URL absoluta:  "https://.../reservar" → se sanitiza (por si trae
        //                                             el patrón "wwwX.tld" del
        //                                             defensor de v1.6.3).
        // Si el campo no existe o viene vacío, devolvemos '' y el page code
        // cae al fallback "/reservar" (comportamiento v1.3.5).
        const urlBookingRaw = String(cfg.urlBooking || '').trim();
        if (urlBookingRaw) {
          if (urlBookingRaw.startsWith('/')) {
            urlBooking = urlBookingRaw.replace(/\/+$/, '');
          } else {
            // Absoluta o sin protocolo — sanitizarSiteUrl añade https:// si falta
            urlBooking = sanitizarSiteUrl(urlBookingRaw).replace(/\/+$/, '');
          }
        }

        // Imagen PRIME desde KamisuiteProductsConfig.primeImage.
        // El field puede llegar como string "wix:image://v1/<id>..." o
        // ya como URL https. Reutilizamos wixImageToHttps del propio
        // archivo (mismo helper que se usa para logo y productos).
        const cfgProd = (prodCfgRes?.items || [])[0] || {};
        primeImagenPublicUrl = wixImageToHttps(cfgProd.primeImage || '') || String(cfgProd.primeImage || '').trim();
        // Si primeImage no era wix:image ni http(s), wixImageToHttps
        // devuelve '' y la fallback con toString queda vacía también.
        // Verificación final: solo aceptamos http(s) URLs.
        if (primeImagenPublicUrl && !/^https?:\/\//i.test(primeImagenPublicUrl)) {
          primeImagenPublicUrl = '';
        }

        console.log(
          `${TAG} 🏷️ Config combinada | brandName="${brandName}" | ` +
          `slug="${slugRaw}" | promotionsUrl="${promotionsUrl}" | ` +
          `urlBooking="${urlBooking}" | ` +
          `primeImagenPublicUrl="${primeImagenPublicUrl ? '(URL presente)' : '(vacía)'}"`
        );
      } catch (e) {
        console.warn(`${TAG} ⚠️ SalonConfig/KamisuiteProductsConfig no disponibles: ${e.message}`);
      }
      const salon = { brandName, urlBooking };

      // 11.1) PRIME — query directa a KamisuitePrimeMemberships.
      // Imagen: SIEMPRE se devuelve `primeImagenPublicUrl` (objeto de
      // deseo — se muestra tenga o no membresía activa).
      let prime = {
        tiene: false,
        membresia: null,
        imagen: primeImagenPublicUrl,
        urlAdquirir: promotionsUrl
      };
      try {
        const primeRes = await wixData.query('KamisuitePrimeMemberships')
          .eq('contactId', memberContactId)
          .descending('_createdDate')
          .limit(50)
          .find({ suppressAuth: true });
        const nowMs = Date.now();
        const activa = (primeRes.items || []).find(m => {
          if (m.status !== 'ACTIVA') return false;
          if (!m.expirationDate) return true; // sin vencimiento = activa
          return new Date(m.expirationDate).getTime() >= nowMs;
        });
        if (activa) {
          prime.tiene = true;
          prime.membresia = {
            code: activa.code || '',
            expirationDate: activa.expirationDate ? ymdMadrid(activa.expirationDate) : ''
          };
        }
        console.log(
          `${TAG} 💎 PRIME query | items=${(primeRes.items || []).length} | ` +
          `activa=${activa ? `sí (code=${activa.code || '-'} exp=${activa.expirationDate || '-'})` : 'no'}`
        );
      } catch (e) {
        console.warn(`${TAG} ⚠️ Query KamisuitePrimeMemberships falló: ${e.message}`);
      }

      // 11.2) Bonos — query directa a KamisuiteVouchers.
      let bonos = { tiene: false, items: [], urlAdquirir: promotionsUrl };
      try {
        const bonosRes = await wixData.query('KamisuiteVouchers')
          .eq('contactId', memberContactId)
          .descending('_createdDate')
          .limit(200)
          .find({ suppressAuth: true });
        const nowMs = Date.now();
        const activos = (bonosRes.items || []).filter(v => {
          if (v.status !== 'ACTIVO') return false;
          if (typeof v.remainingUses === 'number' && v.remainingUses <= 0) return false;
          if (v.expirationDate && new Date(v.expirationDate).getTime() < nowMs) return false;
          return true;
        });
        bonos.items = activos.map(v => ({
          id: v._id || '',
          code: v.code || '',
          serviceLabel: v.serviceLabel || '',
          remainingUses: Number(v.remainingUses) || 0,
          totalUses: Number(v.totalUses) || 0,
          expirationDate: v.expirationDate ? ymdMadrid(v.expirationDate) : ''
        }));
        bonos.tiene = bonos.items.length > 0;
        console.log(
          `${TAG} 🎟️ Bonos query | items totales=${(bonosRes.items || []).length} | ` +
          `activos=${bonos.items.length}`
        );
      } catch (e) {
        console.warn(`${TAG} ⚠️ Query KamisuiteVouchers falló: ${e.message}`);
      }

      // 11.3) Tarjetas Promocionales — query directa a KamisuitePromoCards.
      // Field de filtrado: `buyerContactId` (no `contactId` — bitácora
      // del 27 de junio, lección dura). Excluimos isGift=true.
      let tarjetas = { tiene: false, items: [], urlAdquirir: promotionsUrl };
      try {
        const tarjetasRes = await wixData.query('KamisuitePromoCards')
          .eq('buyerContactId', memberContactId)
          .descending('_createdDate')
          .limit(200)
          .find({ suppressAuth: true });
        const nowMs = Date.now();
        const emitidas = (tarjetasRes.items || []).filter(t => {
          if (t.status !== 'EMITIDA') return false;
          if (t.isGift === true) return false;
          if (t.expirationDate && new Date(t.expirationDate).getTime() < nowMs) return false;
          return true;
        });
        tarjetas.items = emitidas.map(t => ({
          id: t._id || '',
          code: t.code || '',
          serviceLabel: t.serviceLabel || '',
          expirationDate: t.expirationDate ? ymdMadrid(t.expirationDate) : ''
        }));
        tarjetas.tiene = tarjetas.items.length > 0;
        console.log(
          `${TAG} 🎫 Tarjetas query | items totales=${(tarjetasRes.items || []).length} | ` +
          `emitidas activas=${tarjetas.items.length}`
        );
      } catch (e) {
        console.warn(`${TAG} ⚠️ Query KamisuitePromoCards falló: ${e.message}`);
      }

      const elapsed = ((Date.now() - t0) / 1000).toFixed(2);
      console.log(
        `${TAG} ✅ getAreaCliente ${memberContactId} | ` +
        `${proximas.length} prox · ${anteriores.length} ant · ${productos.length} prod · ` +
        `notas histórico=${historico.length} · exp=${tieneNotasPublicas ? 'sí' : 'no'} (${notasPublicasOrigen}) · ` +
        `prime=${prime.tiene ? 'sí' : 'no'} · bonos=${bonos.items.length} · tarjetas=${tarjetas.items.length} · ` +
        `${elapsed}s`
      );

      return {
        ok: true,
        version: VERSION,
        cliente,
        notaCliente,
        notasPublicas: notasPublicasRaw,
        notasPublicasOrigen,
        proximas,
        anteriores,
        productos,
        puntos,
        expediente,
        salon,
        prime,
        bonos,
        tarjetas
      };

    } catch (e) {
      console.error(`${TAG} ❌ getAreaCliente:`, e.message);
      return { ok: false, version: VERSION, error: safeErr(e) };
    }
  }
);

// =====================================================
// 2 · UPDATE PERFIL CLIENTE (READ-MERGE-UPDATE)
// =====================================================
// Mismo patrón que editarContacto V2 de recepcionLogic. Solo aplica los
// campos presentes en `cambios`. Nunca incluye campos vacíos que
// borrarían los existentes (sin email/teléfono se omiten del payload).
//
// Campos aceptados (todos opcionales):
//   nombre, apellido, email, telefono, sexo, dni, foto
//
// Wix exige READ-MERGE-UPDATE con revision: leemos primero, actualizamos
// con la revision recibida. updateContact reemplaza el documento entero
// salvo para los sub-objetos `name`, `emails`, `phones`, `extendedFields`
// donde Wix hace merge inteligente — pero solo si pasamos esos sub-objetos.
// =====================================================
export const updatePerfilCliente = webMethod(
  Permissions.SiteMember,
  async ({ memberContactId, cambios } = {}) => {
    try {
      const ok = validarMemberContactId(memberContactId);
      if (!ok.ok) return { ok: false, version: VERSION, error: ok.error };

      if (!cambios || typeof cambios !== 'object') {
        return { ok: false, version: VERSION, error: { message: 'cambios requerido' } };
      }

      // 1) Leer contacto para obtener revision
      const elevatedGet = elevate(contacts.getContact);
      const contact = await elevatedGet(memberContactId);
      if (!contact || !contact.revision) {
        return { ok: false, version: VERSION, error: { message: 'Contacto no encontrado o sin revision' } };
      }

      // 2) Construir contactInfo solo con los campos que vienen en cambios
      const contactInfo = {};

      // Nombre / apellido — sub-objeto `name`
      const name = {};
      if (cambios.nombre !== undefined) name.first = String(cambios.nombre || '');
      if (cambios.apellido !== undefined) name.last = String(cambios.apellido || '');
      if (Object.keys(name).length) contactInfo.name = name;

      // Email — array de objetos. Solo si llega valor truthy
      if (cambios.email) {
        contactInfo.emails = [{ email: String(cambios.email) }];
      }

      // Teléfono — array de objetos. Solo si llega valor truthy
      if (cambios.telefono) {
        contactInfo.phones = [{ phone: String(cambios.telefono) }];
      }

      // Foto — info.picture.image (URL)
      if (cambios.foto) {
        contactInfo.picture = { image: String(cambios.foto) };
      }

      // Campos personalizados — extendedFields
      const ext = {};
      if (cambios.sexo !== undefined) ext[FIELD_SEXO] = String(cambios.sexo || '');
      if (cambios.dni !== undefined) ext[FIELD_VAT_ID] = String(cambios.dni || '');
      if (Object.keys(ext).length) contactInfo.extendedFields = ext;

      if (!Object.keys(contactInfo).length) {
        return { ok: true, version: VERSION, sinCambios: true };
      }

      // 3) Update con revision (READ-MERGE-UPDATE)
      const identifiers = { contactId: memberContactId, revision: contact.revision };
      const elevatedUpdate = elevate(contacts.updateContact);
      await elevatedUpdate(identifiers, contactInfo, { suppressAuth: true });

      const campos = Object.keys(contactInfo)
        .concat(Object.keys(ext).map(k => `ext:${k}`))
        .join(',');
      console.log(`${TAG} ✅ updatePerfilCliente ${memberContactId} | ${campos}`);

      return {
        ok: true,
        version: VERSION,
        camposActualizados: Object.keys(contactInfo)
      };

    } catch (e) {
      console.error(`${TAG} ❌ updatePerfilCliente:`, e.message);
      return { ok: false, version: VERSION, error: safeErr(e) };
    }
  }
);

// =====================================================
// 3 · APPEND NOTA CLIENTE (histórico append-only)
// =====================================================
// Mismo patrón EXACTO que saveNotaToCRM de coloracionLogic v3.2.x y
// tratamientosLogic v1.x (V1 del flujo público de Hair-Times).
// Append-only: nunca borra histórico. Separador " | " y timestamp en
// formato local Madrid entre corchetes.
//
// Campo destino (KALONICE): custom.notas-fonyemjtcfteotgxzkaamjbuwmyuz
// =====================================================
export const appendNotaCliente = webMethod(
  Permissions.SiteMember,
  async ({ memberContactId, mensaje } = {}) => {
    try {
      const ok = validarMemberContactId(memberContactId);
      if (!ok.ok) return { ok: false, version: VERSION, error: ok.error };

      const txt = String(mensaje || '').trim();
      if (!txt) {
        return { ok: false, version: VERSION, error: { message: 'Mensaje vacío' } };
      }

      // Leer revision + valor actual
      const elevatedGet = elevate(contacts.getContact);
      const contact = await elevatedGet(memberContactId);
      if (!contact || !contact.revision) {
        return { ok: false, version: VERSION, error: { message: 'Contacto no encontrado' } };
      }

      const ef = contact.info?.extendedFields || {};
      const current = ef[FIELD_NOTAS_CLIENTE] || '';
      const timestamp = new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' });
      const newEntry = `[${timestamp}] ${txt}`;
      const updated = current ? `${current} | ${newEntry}` : newEntry;

      // Update solo el campo de notas
      const identifiers = { contactId: memberContactId, revision: contact.revision };
      const contactInfo = { extendedFields: { [FIELD_NOTAS_CLIENTE]: updated } };
      const elevatedUpdate = elevate(contacts.updateContact);
      await elevatedUpdate(identifiers, contactInfo, { suppressAuth: true });

      console.log(`${TAG} ✅ Nota añadida ${memberContactId} | "${txt.substring(0, 60)}"`);

      return {
        ok: true,
        version: VERSION,
        nuevaEntrada: { fecha: timestamp, texto: txt },
        historico: parseNotasHistorico(updated),
        raw: updated
      };

    } catch (e) {
      console.error(`${TAG} ❌ appendNotaCliente:`, e.message);
      return { ok: false, version: VERSION, error: safeErr(e) };
    }
  }
);

// =====================================================
// 4 · CANCELAR CITA CLIENTE
// =====================================================
// Valida que la reserva pertenece al miembro logueado ANTES de delegar
// en cancelarReserva de recepcionProLogic. Defensa contra manipulación
// de payload: el cliente NUNCA puede cancelar la reserva de otro
// contacto, ni con payload manipulado a mano.
// =====================================================
export const cancelarCitaCliente = webMethod(
  Permissions.SiteMember,
  async ({ memberContactId, reservaId } = {}) => {
    try {
      const ok = validarMemberContactId(memberContactId);
      if (!ok.ok) return { ok: false, version: VERSION, error: ok.error };

      if (!reservaId) {
        return { ok: false, version: VERSION, error: { message: 'Falta reservaId' } };
      }

      // 1) Leer registro y validar ownership
      let reg;
      try {
        reg = await wixData.get(CMS_RESERVAS, reservaId, { suppressAuth: true });
      } catch (e) {
        return { ok: false, version: VERSION, error: { message: 'Reserva no encontrada' } };
      }
      if (!reg) {
        return { ok: false, version: VERSION, error: { message: 'Reserva no encontrada' } };
      }
      if (reg.contactId !== memberContactId) {
        console.warn(
          `${TAG} ⚠️ Intento de cancelar reserva ajena: cliente=${memberContactId} → reserva.contactId=${reg.contactId}`
        );
        return { ok: false, version: VERSION, error: { message: 'Reserva no pertenece al cliente' } };
      }

      // 2) Delegar en recepcionProLogic.cancelarReserva (borra sessions
      //    + marca status CANCELADA + READ-MERGE-UPDATE).
      const result = await cancelarReserva({ reservaId });
      console.log(`${TAG} ✅ cancelarCitaCliente ${reservaId} (cliente ${memberContactId})`);
      return result;

    } catch (e) {
      console.error(`${TAG} ❌ cancelarCitaCliente:`, e.message);
      return { ok: false, version: VERSION, error: safeErr(e) };
    }
  }
);

// =====================================================
// 5 · MOVER CITA — v1.3.0 (implementación real)
// =====================================================
// Sustituye al mockup v1.0.x. Dos funciones:
//
//   A) getHuecosCambioReserva({memberContactId, reservaId, fecha})
//      Devuelve los huecos disponibles para mover esta reserva concreta
//      al día `fecha`. Reutiliza el motor real de widgetPublicoLogic
//      (v0.6.2 producción) sin modificarlo. El motor verá la cita
//      original como ocupada en su hora actual, pero esto NO afecta al
//      flujo: el cliente que mueve no va a reseleccionar la misma hora
//      donde ya está su cita; hay miles de slots libres alternativos.
//
//   B) moverCitaCliente({memberContactId, reservaId, nuevaFecha, nuevaHora})
//      Valida ownership + revalida disponibilidad antes de aplicar.
//      Delega en recepcionProLogic.reprogramarReserva (que ya está en
//      producción y recalcula fases con delta). Misma función que usa
//      Recepción Pro V2 para mover por arrastre.
//
// LO QUE *NO* HACE (deuda técnica documentada):
//   - NO borra/recrea sessions de Wix Bookings. La agenda V2 lee del
//     CMS y refleja el cambio. El calendario nativo Wix Bookings sigue
//     mostrando la cita en la hora original, y Google Calendar de los
//     staff (si está sincronizado) tampoco se actualiza. Mismo comporta-
//     miento que reprogramarReserva tiene HOY en Recepción Pro V2.
//     Si en el futuro se quiere sincronizar sessions, hacerlo en
//     reprogramarReserva (no aquí) para que ambos puntos lo hereden.
//   - NO permite cambiar de profesional. La cita movida conserva el
//     mismo `staffId`. Si el cliente quiere otro profesional, cancela
//     y reserva.
// =====================================================

/**
 * Devuelve los huecos disponibles del día `fecha` para mover la reserva
 * `reservaId` perteneciente al miembro `memberContactId`.
 *
 * ENTRADA:  { memberContactId, reservaId, fecha: 'YYYY-MM-DD' }
 * SALIDA:   { ok, huecos: ['10:00', ...], fecha, reservaId,
 *             motivo: 'cerrado' | undefined, error? }
 */
export const getHuecosCambioReserva = webMethod(
  Permissions.SiteMember,
  async ({ memberContactId, reservaId, fecha } = {}) => {
    const t0 = Date.now();
    try {
      const ok = validarMemberContactId(memberContactId);
      if (!ok.ok) return { ok: false, version: VERSION, error: ok.error, huecos: [] };
      if (!reservaId) {
        return { ok: false, version: VERSION, error: { message: 'reservaId requerido' }, huecos: [] };
      }
      if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(String(fecha))) {
        return { ok: false, version: VERSION, error: { message: 'fecha inválida (formato YYYY-MM-DD)' }, huecos: [] };
      }

      // 1) Leer reserva y validar ownership
      let reg;
      try {
        reg = await wixData.get(CMS_RESERVAS, reservaId, { suppressAuth: true });
      } catch (e) {
        return { ok: false, version: VERSION, error: { message: 'Reserva no encontrada' }, huecos: [] };
      }
      if (!reg) {
        return { ok: false, version: VERSION, error: { message: 'Reserva no encontrada' }, huecos: [] };
      }
      if (reg.contactId !== memberContactId) {
        console.warn(
          `${TAG} ⚠️ getHuecosCambioReserva: reserva ajena (cliente=${memberContactId} reserva.contactId=${reg.contactId})`
        );
        return { ok: false, version: VERSION, error: { message: 'Reserva no pertenece al cliente' }, huecos: [] };
      }

      // 2) Construir parámetros para el motor de huecos.
      //    La duración efectiva = duracionTotal + extensionMin (resize manual).
      //    El motor ya conoce extensionMin de OTRAS reservas, pero al MOVER
      //    esta hay que reservar el slot completo incluida su extensión.
      const duracionEfectiva = (Number(reg.duracionTotal) || 0) + (Number(reg.extensionMin) || 0);
      if (duracionEfectiva <= 0) {
        console.warn(`${TAG} ⚠️ Reserva ${reservaId} sin duracionTotal — no se puede calcular huecos`);
        return { ok: false, version: VERSION, error: { message: 'Reserva sin duración válida' }, huecos: [] };
      }
      const staffId = reg.staffId || '';
      if (!staffId) {
        console.warn(`${TAG} ⚠️ Reserva ${reservaId} sin staffId — no se puede determinar profesional`);
        return { ok: false, version: VERSION, error: { message: 'Reserva sin profesional asignado' }, huecos: [] };
      }

      // 3) Llamar al motor real (widgetPublicoLogic v0.6.2 ya en producción).
      //    NO se pasa parámetro de exclusión: el motor verá la cita
      //    original como ocupada en su hora actual. Esto NO es problema
      //    funcional: el cliente que mueve no va a reseleccionar la
      //    misma hora exacta donde ya está su cita.
      const res = await getHuecosDisponibles({
        fecha,
        proId: staffId,
        durationMin: duracionEfectiva,
        idStaffPermitidos: [staffId]
      });

      const elapsed = ((Date.now() - t0) / 1000).toFixed(2);
      console.log(
        `${TAG} ✅ getHuecosCambioReserva ${reservaId} fecha=${fecha} ` +
        `staff=${staffId} dur=${duracionEfectiva}min: ${(res?.huecos || []).length} huecos · ${elapsed}s`
      );

      return {
        ok: !!res?.ok,
        version: VERSION,
        reservaId,
        fecha,
        huecos: res?.huecos || [],
        motivo: res?.motivo,
        abreA: res?.abreA,
        cierraA: res?.cierraA,
        error: res?.error
      };

    } catch (e) {
      console.error(`${TAG} ❌ getHuecosCambioReserva:`, e.message);
      return { ok: false, version: VERSION, error: safeErr(e), huecos: [] };
    }
  }
);

/**
 * Mueve la reserva `reservaId` a (nuevaFecha, nuevaHora) en zona Madrid.
 * Conserva profesional, servicio, complementos y precio.
 *
 * ENTRADA: { memberContactId, reservaId, nuevaFecha: 'YYYY-MM-DD',
 *            nuevaHora: 'HH:mm' }
 * SALIDA:  { ok, reservaId, fechaReserva: '<ISO UTC>' } | { ok:false, error }
 *
 * FLUJO:
 *   1. Validación ownership.
 *   2. Revalidar disponibilidad (defensa anti race-condition).
 *   3. Llamar a recepcionProLogic.reprogramarReserva que ya está en
 *      producción y hace exactamente lo que necesitamos (recalcula
 *      fases con delta de tiempo).
 */
export const moverCitaCliente = webMethod(
  Permissions.SiteMember,
  async ({ memberContactId, reservaId, nuevaFecha, nuevaHora } = {}) => {
    const t0 = Date.now();
    try {
      const ok = validarMemberContactId(memberContactId);
      if (!ok.ok) return { ok: false, version: VERSION, error: ok.error };
      if (!reservaId) {
        return { ok: false, version: VERSION, error: { message: 'reservaId requerido' } };
      }
      if (!nuevaFecha || !/^\d{4}-\d{2}-\d{2}$/.test(String(nuevaFecha))) {
        return { ok: false, version: VERSION, error: { message: 'nuevaFecha inválida (formato YYYY-MM-DD)' } };
      }
      if (!nuevaHora || !/^\d{1,2}:\d{2}$/.test(String(nuevaHora))) {
        return { ok: false, version: VERSION, error: { message: 'nuevaHora inválida (formato HH:mm)' } };
      }

      // 1) Leer reserva y validar ownership
      let reg;
      try {
        reg = await wixData.get(CMS_RESERVAS, reservaId, { suppressAuth: true });
      } catch (e) {
        return { ok: false, version: VERSION, error: { message: 'Reserva no encontrada' } };
      }
      if (!reg) {
        return { ok: false, version: VERSION, error: { message: 'Reserva no encontrada' } };
      }
      if (reg.contactId !== memberContactId) {
        console.warn(
          `${TAG} ⚠️ moverCitaCliente: reserva ajena (cliente=${memberContactId} reserva.contactId=${reg.contactId})`
        );
        return { ok: false, version: VERSION, error: { message: 'Reserva no pertenece al cliente' } };
      }
      if (reg.status === 'CANCELADA') {
        return { ok: false, version: VERSION, error: { message: 'No se puede mover una cita cancelada' } };
      }

      // 2) Revalidar disponibilidad. Defensa contra race condition: el
      //    cliente pudo haber visto el hueco hace varios segundos y otro
      //    cliente reservar entretanto. Si el slot ya no está libre,
      //    error claro para que el widget refresque huecos.
      const duracionEfectiva = (Number(reg.duracionTotal) || 0) + (Number(reg.extensionMin) || 0);
      const staffId = reg.staffId || '';
      if (!staffId || duracionEfectiva <= 0) {
        return { ok: false, version: VERSION, error: { message: 'Reserva con datos incompletos (staff o duración)' } };
      }
      const resHuecos = await getHuecosDisponibles({
        fecha: nuevaFecha,
        proId: staffId,
        durationMin: duracionEfectiva,
        idStaffPermitidos: [staffId]
      });
      if (!resHuecos?.ok) {
        return { ok: false, version: VERSION, error: { message: 'Error revalidando disponibilidad' } };
      }
      const huecos = resHuecos.huecos || [];
      if (!huecos.includes(nuevaHora)) {
        console.warn(
          `${TAG} ⚠️ moverCitaCliente ${reservaId}: slot ${nuevaFecha} ${nuevaHora} ya no disponible ` +
          `(${huecos.length} huecos encontrados, ${nuevaHora} NO está)`
        );
        return {
          ok: false,
          version: VERSION,
          error: { message: 'Esa hora ya no está disponible. Refresca y prueba otra.' }
        };
      }

      // 3) Construir nuevoFechaISO (zona Madrid → UTC) y delegar en
      //    reprogramarReserva (recepcionProLogic). Misma función que
      //    Recepción Pro V2 usa al arrastrar una cita en el calendario.
      const nuevaFechaISO = madridToUTC(nuevaFecha, nuevaHora);
      const result = await reprogramarReserva({ reservaId, nuevaFechaISO });
      if (!result?.ok) {
        console.error(`${TAG} ❌ reprogramarReserva devolvió ko:`, JSON.stringify(result?.error || result));
        return {
          ok: false,
          version: VERSION,
          error: { message: result?.error?.message || result?.error || 'No se pudo mover la cita' }
        };
      }

      const elapsed = ((Date.now() - t0) / 1000).toFixed(2);
      console.log(
        `${TAG} ✅ moverCitaCliente ${reservaId} → ${nuevaFecha} ${nuevaHora} ` +
        `(${nuevaFechaISO}) · ${elapsed}s`
      );

      return {
        ok: true,
        version: VERSION,
        reservaId,
        fechaReserva: result.fechaReserva || nuevaFechaISO
      };

    } catch (e) {
      console.error(`${TAG} ❌ moverCitaCliente:`, e.message);
      return { ok: false, version: VERSION, error: safeErr(e) };
    }
  }
);

// =====================================================

// =====================================================
// 6 · REPETIR COMPRA — v1.4.0
// =====================================================
// Añade un producto al carrito Wix Stores del miembro logueado.
// Sustituye al mockup v1.x (page code redirigía a /tienda sin añadir).
//
// API utilizada: wix-ecom-backend.currentCart.addToCurrentCart
//   - Es la API oficial moderna recomendada por Wix.
//   - wix-stores-frontend.cart.addProducts está deprecated.
//   - Requiere sesión visitante o miembro autenticado (el cliente del
//     área de cliente siempre está logueado como miembro).
//
// Estructura del catalogReference (docs Wix):
//   appId: '215238eb-22a5-4c36-9e7b-e7c08025e04e' (constante Wix Stores)
//   catalogItemId: <productId Wix Stores>
//
// Limitaciones intencionales v1.4.0:
//   - quantity: 1 por defecto (cliente puede subir cantidades desde el
//     carrito normal después).
//   - NO maneja variantes (productos con variantId obligatorio). Si el
//     producto del histórico tiene manageVariants:true, fallará con error
//     genérico de Wix. Caso menor en KALONICE; se añade en v1.5.0 si hace
//     falta. (Pendiente: leer variantId del lineItem original e incluirlo
//     en catalogReference.options.variantId.)
// =====================================================
export const repetirCompraCliente = webMethod(
  Permissions.SiteMember,
  async ({ memberContactId, productId, quantity } = {}) => {
    const t0 = Date.now();
    try {
      const ok = validarMemberContactId(memberContactId);
      if (!ok.ok) return { ok: false, version: VERSION, error: ok.error };
      if (!productId || typeof productId !== 'string') {
        return { ok: false, version: VERSION, error: { message: 'productId requerido' } };
      }
      const qty = Math.max(1, Math.min(99, Number(quantity) || 1));

      const options = {
        lineItems: [{
          catalogReference: {
            appId: WIX_STORES_APP_ID,
            catalogItemId: productId
          },
          quantity: qty
        }]
      };

      // addToCurrentCart usa la sesión del visitante actual (el page
      // code llamó al webMethod desde una sesión SiteMember válida).
      const res = await currentCart.addToCurrentCart(options);
      const cartId = res?.cart?._id || res?.cart?.id || '';
      const lineItemsCount = (res?.cart?.lineItems || []).length;

      const elapsed = ((Date.now() - t0) / 1000).toFixed(2);
      console.log(
        `${TAG} 🛒 repetirCompraCliente ${memberContactId} productId=${productId} qty=${qty} ` +
        `→ cart=${cartId} (${lineItemsCount} items) · ${elapsed}s`
      );

      return {
        ok: true,
        version: VERSION,
        cartId,
        lineItemsCount
      };

    } catch (e) {
      console.error(`${TAG} ❌ repetirCompraCliente:`, e.message);
      return { ok: false, version: VERSION, error: safeErr(e) };
    }
  }
);

// =====================================================
// 7 · CAMBIAR FOTO DE CONTACTO (v1.2.2)
// =====================================================
// Patrón Wix Studio Forum confirmado por ChatGPT.
// El cliente sube un archivo desde el Custom Element → page code lo
// convierte a base64 → este backend:
//   1) sube al Media Manager (fileUrl wix:image://...)
//   2) convierte a URL pública https
//   3) lee contacto para revision actual
//   4) update contacto con picture:{image:URL, imageProvider:'EXTERNAL'}
//
// Devuelve `imageUrl` para que el page code recargue datos.
// =====================================================
export const cambiarFotoContacto = webMethod(
  Permissions.SiteMember,
  async ({ memberContactId, memberId, base64Data, fileName, mimeType } = {}) => {
    const t0 = Date.now();
    try {
      if (!validarMemberContactId(memberContactId)) {
        return { ok: false, version: VERSION, error: { message: 'memberContactId inválido' } };
      }
      if (!base64Data) {
        return { ok: false, version: VERSION, error: { message: 'base64Data requerido' } };
      }

      // 1) Subir al Media Manager
      // base64Data puede llegar con prefijo data:image/...;base64,XXX o limpio
      let cleanBase64 = base64Data;
      if (cleanBase64.includes(',')) cleanBase64 = cleanBase64.split(',')[1];
      const buffer = Buffer.from(cleanBase64, 'base64');
      const safeName = (fileName || `perfil_${Date.now()}.jpg`).replace(/[^a-zA-Z0-9._-]/g, '_');
      const finalMime = mimeType || 'image/jpeg';

      const elevatedUpload = elevate(mediaManager.upload);
      const uploadResult = await elevatedUpload(
        '/kamisuite/perfiles',
        buffer,
        safeName,
        {
          mediaOptions: { mimeType: finalMime, mediaType: 'image' },
          metadataOptions: { isPrivate: false, isVisitorUpload: false }
        }
      );
      const fileUrl = uploadResult?.fileUrl || '';
      if (!fileUrl) {
        return { ok: false, version: VERSION, error: { message: 'Upload no devolvió fileUrl' } };
      }

      // 2) Convertir a URL pública https (Wix CRM espera URL pública)
      const publicUrl = wixImageToHttps(fileUrl);
      if (!publicUrl) {
        return { ok: false, version: VERSION, error: { message: 'No se pudo convertir fileUrl a https' } };
      }

      // 3) READ-MERGE-UPDATE del contacto (Wix Contacts)
      const elevatedGet = elevate(contacts.getContact);
      const contact = await elevatedGet(memberContactId);
      if (!contact) {
        return { ok: false, version: VERSION, error: { message: 'Contacto no encontrado' } };
      }

      const elevatedUpdate = elevate(contacts.updateContact);
      await elevatedUpdate(
        { contactId: memberContactId, revision: contact.revision },
        {
          picture: {
            image: publicUrl,
            imageProvider: 'EXTERNAL'
          }
        },
        { suppressAuth: true, allowDuplicates: false }
      );

      // 4) v1.4.1 — Sincronizar con Wix Members (PrivateMembersData/FullData).
      // Wix Contacts y Wix Members son sistemas separados. contacts.updateContact
      // NO actualiza Members. Para que la foto aparezca en el header del sitio
      // y en el Dashboard, hay que llamar también a members.updateMember.
      // Formato confirmado por docs Wix:
      //   profile.profilePhoto.url = 'https://static.wixstatic.com/media/<file>'
      // Si memberId no llega (page code antiguo), saltamos esta sincronización
      // y la foto del área de cliente seguirá funcionando (no rompemos UX).
      // Si members.updateMember falla, también es no fatal — loggeamos
      // warning y devolvemos OK porque Contacts sí se actualizó.
      let membersUpdated = false;
      if (memberId && isGuid(memberId)) {
        try {
          const elevatedMemberUpdate = elevate(members.updateMember);
          await elevatedMemberUpdate(memberId, {
            profile: {
              profilePhoto: {
                url: publicUrl
              }
            }
          });
          membersUpdated = true;
        } catch (eMember) {
          console.warn(
            `${TAG} ⚠️ members.updateMember falló (Contacts SÍ actualizado): ` +
            `${eMember.message || eMember}`
          );
        }
      } else {
        console.warn(`${TAG} ⚠️ memberId no proporcionado — saltando sync Wix Members`);
      }

      const elapsed = ((Date.now() - t0) / 1000).toFixed(2);
      console.log(
        `${TAG} 📸 cambiarFotoContacto ${memberContactId} OK · ${publicUrl} · ` +
        `members=${membersUpdated ? '✅' : '⏭️'} · ${elapsed}s`
      );

      return { ok: true, version: VERSION, imageUrl: publicUrl, membersUpdated };

    } catch (e) {
      console.error(`${TAG} ❌ cambiarFotoContacto:`, e.message);
      return { ok: false, version: VERSION, error: safeErr(e) };
    }
  }
);