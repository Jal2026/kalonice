/* ═══════════════════════════════════════════════════════════════
   salonConfigLogic.web.js  v1.0.9
   KAMISUITE — Backend de configuración de salón
   ═══════════════════════════════════════════════════════════════
   CHANGELOG
   v1.0.9 · 1 Ago 2026 · + textVoucherAlert, textPrimeAlert, textCardAlert
     (Texto) a ALL_FIELDS: mensajes de aviso de caducidad de bonos, PRIME
     y tarjetas promo. Crear los 3 campos Texto en el CMS SalonConfig.
   v1.0.8 · 1 Ago 2026 · LIMPIEZA — revertido v1.0.7. Quitados
     arqueoActivo (de ALL_FIELDS y BOOLEAN_FIELDS) y fondoCajaFijo (de
     ALL_FIELDS y NUMBER_FIELDS): eran campos del enfoque descartado del
     arqueo. El fondo inicial se resuelve solo con el arrastre
     (cashRegisterLogic v1.1.3, sin leer SalonConfig). Recomendado borrar
     también esos 2 campos del CMS SalonConfig. Otros 43 campos intactos.
   v1.0.7 · 1 Ago 2026 · Arqueo de caja: fondoCajaFijo + arqueoActivo
     - ALL_FIELDS     += fondoCajaFijo, arqueoActivo
     - NUMBER_FIELDS  += fondoCajaFijo
     - BOOLEAN_FIELDS += arqueoActivo
     - arqueoActivo (Boolean): activa el MÓDULO de arqueo/cierre de caja
       para el salón. Cuando está activo, Recepción PRO ofrece por la
       mañana el modal de APERTURA DE CAJA (fondo inicial del día) y el
       botón manual "Registrar fondo inicial" dentro del arqueo. Cuando
       está desactivado (o vacío), Recepción PRO NO muestra el modal de
       apertura — comportamiento histórico intacto. El arqueo es un
       módulo opcional (el manual ya lo declara así): cada salón decide.
     - fondoCajaFijo (Number): fondo fijo de caja diario en euros. Si el
       salón trabaja con fondo fijo cada mañana (retira el resto a
       diario), aquí indica ese importe y la apertura lo propone. Si se
       deja vacío/0, la apertura propone el efectivo CONTADO en el cierre
       del día anterior (arrastre natural del saldo). Vacío/no-numérico
       → 0 (interpretado como "sin fondo fijo → arrastrar cierre").
     - LO CONSUME: cashRegisterLogic.web.js v1.1.0 (getFondoSugerido lee
       fondoCajaFijo como prioridad 1 de la cascada) y el page code de
       Recepción PRO (lee arqueoActivo para decidir si dispara el modal
       de apertura).
     - Sin estos campos en ALL_FIELDS el backend los descartaría en el
       merge de updateSalonConfig y NO se guardarían.
     - Pareja widget: widget_salon_config v1.0.12 (fondoCajaFijo en
       sección Operativa; arqueoActivo en Módulos Opcionales).
   v1.0.6 · 8 Jul 2026 · closingGraceMin — margen de extensión horario
     - ALL_FIELDS    += closingGraceMin
     - NUMBER_FIELDS += closingGraceMin
     - Margen en minutos que permite que una reserva ONLINE termine
       hasta N minutos DESPUÉS del cierre del staff (staff.to del día).
       El salón lo configura desde el widget de Edición Salón (v1.0.12).
     - Semántica dura: vacío / null → 0 min (corte estricto, ni un
       minuto tras el `to` del staff). Sin este campo el motor público
       de huecos comportamiento estricto por seguridad.
     - LO CONSUME: widgetPublicoLogic.web.js v0.8.0
         · getHuecosDisponibles  → filtro slot m+dur ≤ horario.to + graceMin
         · resolverStaffLibre    → finMin ≤ horario.to + graceMin
         · crearReservaPublica   → guardia defensiva final antes de crear
     - Recepción PRO (desktop/móvil) NO usa este campo: allí el operador
       de salón decide manualmente. Este margen solo se aplica al motor
       de disponibilidad online (widget público de reservas).
     - Sin este campo en ALL_FIELDS el backend lo descartaría en el
       merge de updateSalonConfig y NO se guardaría.
   v1.0.5 · 7 Jul 2026 · ANCLA Wix Bookings del salón (Service ID)
     - ALL_FIELDS += wixAnclaId
     - UUID del servicio ancla único del salón sobre cuyo calendario
       serviciosEdicionLogic cuelga las sessions de todos los servicios
       de ServiceCatalog. Antes se auto-resolvía buscando en el propio
       ServiceCatalog una fila con el mismo `family`; a partir de v1.0.5
       la fuente de verdad pasa a SalonConfig.wixAnclaId. El campo se
       pobla a mano durante el onboarding de cada cuenta clonada.
     - Sin este campo en ALL_FIELDS el backend lo descartaría en el
       merge de updateSalonConfig y NO se guardaría.
     - Pareja backend: serviciosEdicionLogic v1.11.7 (resolverAnclaSalon
       lee de aquí y hace fallback a ServiceCatalog si vacío).
     - Pareja widget: widget_salon_config v1.0.11 (campo nuevo en
       sección Operativa).
   v1.0.4 · 28 Jun 2026 · Facturación: 4 campos nuevos
     - ALL_FIELDS    += invoiceSeries, ticketSeries,
                        invoiceStartNumber, ticketStartNumber
     - NUMBER_FIELDS += invoiceStartNumber, ticketStartNumber
       (son contadores enteros — Wix avisaría de incompatibilidad
       de tipo si se escribiera String en un campo Número)
     - invoiceSeries / ticketSeries son Texto (siglas como 'F', 'T',
       'A2026', etc., a discreción del salón).
     - Sin estos campos en ALL_FIELDS el backend los descartaría en
       el merge de updateSalonConfig y NO se guardarían — eran el
       único motivo por el que la sección "Facturación" del widget
       de Edición Salón aún no funcionaba a finales de junio 2026.
     - Estos 4 campos son LEÍDOS por facturacionSalonLogic.web v1.0.x
       (módulo de Facturación del Salón a sus Clientes Finales).
       Solo son valores INICIALES de la serie/contador: el contador
       vivo se mantiene en la colección InvoiceCounters, que NO se
       edita desde aquí.
   v1.0.3 · 21 Jun 2026 · Accesos (login de Recepción PRO)
     - ALL_FIELDS    += usersActivation, masterPin, timeOut
     - BOOLEAN_FIELDS += usersActivation (toggle del sistema de login)
     - NEW NUMBER_FIELDS = ['timeOut'] — se tipa con Number() en
       escritura y se inicializa a 0 en fila vacía. Evita el warning de
       Wix por escribir String en un campo Número.
     - masterPin se guarda como Texto (PIN de 4 dígitos, admite ceros
       a la izquierda).
     - Sin estos campos en ALL_FIELDS el backend los descartaría en el
       merge de updateSalonConfig y NO se guardarían.
   v1.0.2 · 19 Jun 2026 · Concordancia CMS: 3 campos nuevos
     - ALL_FIELDS += termsConditionsUrl, whatsappPro, widgetSkin
     - BOOLEAN_FIELDS += whatsappPro
     - widgetSkin (selección de diseño de color del widget público,
       persistido en SalonConfig; lo lee widgetPublicoLogic.getSalonConfig)
     - Sin estos campos en ALL_FIELDS el backend los descartaba en el
       merge de updateSalonConfig y NO se guardaban.
   v1.0.1 · 10 May 2026 · Fix permisos: SiteMember en vez de Admin
     - Permissions.Admin bloqueaba la llamada desde página normal
     - suppressAuth en queries ya garantiza acceso a CMS admin-only
   v1.0.0 · 9 May 2026 · Creación inicial
     - getSalonConfig(): lectura con auto-creación si no existe fila
     - updateSalonConfig(data): actualización parcial de campos
   ═══════════════════════════════════════════════════════════════ */

import { Permissions, webMethod } from 'wix-web-module';
import wixData from 'wix-data';

const TAG = '[SalonConfig v1.0.9]';
const COLLECTION = 'SalonConfig';

// ── Lista completa de field IDs (53 user fields) ──
const ALL_FIELDS = [
  'active',
  'address',
  'anyResourceId',
  'bookingEmail',
  'brandName',
  'confirmationTemplateId',
  'defaultProfessional',
  'domain',
  'externalStaffArea',
  'externalStaffName',
  'externalStaffResourceId',
  'facebookAccount',
  'gdprEmail',
  'gdprName',
  'gdprText',
  'gmailAccount',
  'hoursFriday',
  'hoursMonday',
  'hoursSaturday',
  'hoursThursday',
  'hoursTuesday',
  'hoursWednesday',
  'instagramAccount',
  'invoiceEmail',
  'legalName',
  'logoUrl',
  'loyaltyActive',
  'phone',
  'privacyPolicyUrl',
  'processResourceId',
  'reminderTemplateId',
  'reportsTitle',
  'senderEmail',
  'senderName',
  'shopActive',
  'siteUrl',
  'taxId',
  'termsConditionsUrl',
  'tier',
  'waAccountId',
  'waActive',
  'waPhoneId',
  'whatsappPro',
  'widgetSkin',
  // v1.0.3 — Accesos (sistema de login de Recepción PRO)
  'usersActivation',
  'masterPin',
  'timeOut',
  // v1.0.4 — Facturación del salón a sus clientes finales
  'invoiceSeries',
  'ticketSeries',
  'invoiceStartNumber',
  'ticketStartNumber',
  // v1.0.5 — ANCLA Wix Bookings del salón (Service ID único)
  'wixAnclaId',
  // v1.0.6 — Margen extensión horario (min) para reservas ONLINE
  'closingGraceMin',
  // v1.0.9 — textos de aviso de caducidad (bonos / prime / tarjetas promo)
  'textVoucherAlert',
  'textPrimeAlert',
  'textCardAlert'
];

// ── Campos booleanos (para parseo correcto) ──
const BOOLEAN_FIELDS = [
  'active',
  'loyaltyActive',
  'shopActive',
  'waActive',
  'whatsappPro',
  // v1.0.3 — toggle del sistema de login de Recepción
  'usersActivation',
];

// ── Campos numéricos ──
// Se tipan con Number() en escritura. Si se escribieran como String
// (como el resto), Wix avisaría de incompatibilidad de tipo en un campo
// Número (mismo patrón de warning que un Objeto recibiendo un booleano).
//
// masterPin NO va aquí: es un PIN de 4 dígitos que puede llevar ceros a
// la izquierda, así que se guarda como Texto.
//
// invoiceSeries / ticketSeries TAMPOCO van aquí: son siglas alfanuméricas
// como 'F', 'T', 'A2026' que el salón define a su gusto. Texto.
//
// wixAnclaId TAMPOCO va aquí: es un UUID (string) del servicio ancla
// de Wix Bookings. Texto.
const NUMBER_FIELDS = [
  'timeOut',
  // v1.0.4 — números iniciales de las series de facturación. El contador
  // vivo está en InvoiceCounters; estos campos solo se leen al inicializar
  // un contador nuevo.
  'invoiceStartNumber',
  'ticketStartNumber',
  // v1.0.6 — margen extensión horario (min) para reservas ONLINE.
  // Aplicado por widgetPublicoLogic.web.js v0.8.0. Vacío/null → 0.
  'closingGraceMin',
];

/**
 * getSalonConfig
 * Lee la primera (y única) fila de SalonConfig.
 * Si no existe ninguna fila, la crea vacía y la devuelve.
 * @returns {{ ok: boolean, config: object, isNew: boolean, error?: string }}
 */
export const getSalonConfig = webMethod(
  Permissions.SiteMember,
  async () => {
    try {
      const res = await wixData.query(COLLECTION)
        .limit(1)
        .find({ suppressAuth: true });

      if (res.items.length > 0) {
        console.log(`${TAG} Config leída OK — _id=${res.items[0]._id}`);
        return { ok: true, config: res.items[0], isNew: false };
      }

      // No existe fila → crear una vacía
      console.log(`${TAG} No existe fila en ${COLLECTION} — creando...`);
      const empty = {};
      ALL_FIELDS.forEach(f => {
        if (BOOLEAN_FIELDS.includes(f)) {
          empty[f] = false;
        } else if (NUMBER_FIELDS.includes(f)) {
          empty[f] = 0;
        } else {
          empty[f] = '';
        }
      });

      const inserted = await wixData.insert(COLLECTION, empty, { suppressAuth: true });
      console.log(`${TAG} Fila creada OK — _id=${inserted._id}`);
      return { ok: true, config: inserted, isNew: true };

    } catch (err) {
      console.error(`${TAG} Error en getSalonConfig:`, err);
      return { ok: false, config: null, error: err.message };
    }
  }
);

/**
 * updateSalonConfig
 * Actualiza campos de la fila existente de SalonConfig.
 * Solo actualiza los campos que vienen en el objeto data.
 * @param {{ _id: string, ...fields }} data — debe incluir _id
 * @returns {{ ok: boolean, config?: object, error?: string }}
 */
export const updateSalonConfig = webMethod(
  Permissions.SiteMember,
  async (data) => {
    try {
      if (!data || !data._id) {
        return { ok: false, error: 'Falta _id en los datos' };
      }

      // Leer fila actual
      const current = await wixData.get(COLLECTION, data._id, { suppressAuth: true });
      if (!current) {
        return { ok: false, error: `No se encontró fila con _id=${data._id}` };
      }

      // Merge: solo campos válidos de ALL_FIELDS
      let camposActualizados = 0;
      ALL_FIELDS.forEach(f => {
        if (data[f] !== undefined) {
          if (BOOLEAN_FIELDS.includes(f)) {
            current[f] = Boolean(data[f]);
          } else if (NUMBER_FIELDS.includes(f)) {
            // campo numérico. Vacío/no-numérico → 0.
            const n = Number(data[f]);
            current[f] = isNaN(n) ? 0 : n;
          } else {
            current[f] = String(data[f] ?? '');
          }
          camposActualizados++;
        }
      });

      if (camposActualizados === 0) {
        return { ok: false, error: 'No se recibieron campos válidos para actualizar' };
      }

      const updated = await wixData.update(COLLECTION, current, { suppressAuth: true });
      console.log(`${TAG} Config actualizada OK — ${camposActualizados} campos — _id=${updated._id}`);
      return { ok: true, config: updated };

    } catch (err) {
      console.error(`${TAG} Error en updateSalonConfig:`, err);
      return { ok: false, error: err.message };
    }
  }
);
