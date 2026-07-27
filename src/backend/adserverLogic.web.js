// ╔══════════════════════════════════════════════════════════════════╗
// ║  adserverLogic.web.js — Motor de Segmentación de Audiencias    ║
// ║  KAMISUITE · v1.0.0                                            ║
// ╚══════════════════════════════════════════════════════════════════╝
//
// FUNCIÓN: Backend independiente para segmentación de destinatarios
// en el módulo de Comunicaciones WhatsApp PRO. Permite filtrar
// contactos por tipo de servicio consumido (PaymentReservations)
// y por etiquetas CRM (HOMBRE/MUJER/INFANTIL).
//
// DISEÑO: Backend separado de whatsappLogic.web.js para que
// evolucione sin riesgo sobre el backend de envíos.
//
// COLECCIONES LEÍDAS:
//   - PaymentReservations (campo `descripcion`, `nombreCliente`, `staff`)
//   - Wix CRM Contacts (labels/etiquetas)
//
// DEPENDENCIAS: Ninguna con otros backends KAMISUITE.
//
// CHANGELOG:
//   v1.0.0 (23-May-2026) — Versión inicial
//     - getClientesPorServicio: segmenta por keywords en descripcion
//     - getClientesPorLabel: filtra contactos CRM por etiqueta
//     - getSegmentosDisponibles: devuelve categorías configuradas
// ═══════════════════════════════════════════════════════════════════

import { Permissions, webMethod } from 'wix-web-module';
import wixData from 'wix-data';
import { contacts } from 'wix-crm-backend';
import { elevate } from 'wix-auth';

// ─── CONSTANTES ──────────────────────────────────────────────────

const VERSION = '1.0.0';
const TAG = '[AdServer v1.0.0]';
const COL_PAGOS = 'PaymentReservations';

// ─── SEGMENTOS Y KEYWORDS ────────────────────────────────────────
// Cada segmento define un array de keywords que se buscan en el
// campo `descripcion` de PaymentReservations (lowercase).
// PRODUCTOS se detecta por el campo `staff` (TIENDA / TIENDA_POS).
//
// Para multi-tenant: si un salón necesita keywords distintas,
// esto podría migrar a un CMS (ej: AdServerSegmentos). De momento
// las keywords son genéricas y válidas para cualquier salón.

const SEGMENTOS = {
  COLOR: {
    label: 'Color',
    keywords: ['tinte', 'mechas', 'matiz'],
    modo: 'descripcion'
  },
  TRATAMIENTOS: {
    label: 'Tratamientos',
    keywords: ['tratamiento', 'botox', 'nanoplastia', 'kerastase', 'k18', 'fusio', 'epres', 'olaplex'],
    modo: 'descripcion'
  },
  PEINADOS: {
    label: 'Peinados',
    keywords: ['peinado'],
    modo: 'descripcion'
  },
  CORTE: {
    label: 'Corte',
    keywords: ['corte'],
    modo: 'descripcion'
  },
  SPA: {
    label: 'Spa',
    keywords: ['spa'],
    modo: 'descripcion'
  },
  PRODUCTOS: {
    label: 'Productos',
    keywords: [],
    modo: 'staff'
  },
  INFANTIL: {
    label: 'Infantil',
    keywords: ['niño', 'niña'],
    modo: 'descripcion'
  }
};

// ═══════════════════════════════════════════════════════════════════
// getSegmentosDisponibles
// Devuelve la lista de segmentos configurados para que el widget
// los renderice dinámicamente (no hardcodeados en el frontend).
// ═══════════════════════════════════════════════════════════════════

export const getSegmentosDisponibles = webMethod(
  Permissions.SiteMember,
  async () => {
    console.log(TAG, 'getSegmentosDisponibles');
    const lista = Object.keys(SEGMENTOS).map(key => ({
      id: key,
      label: SEGMENTOS[key].label
    }));
    return { ok: true, segmentos: lista };
  }
);

// ═══════════════════════════════════════════════════════════════════
// getClientesPorServicio
// Consulta PaymentReservations, busca keywords en `descripcion`,
// devuelve lista de nombres únicos de clientes que han consumido
// ese tipo de servicio.
//
// Parámetro: { segmento: 'COLOR' | 'TRATAMIENTOS' | ... }
// Retorna:   { ok, nombres: ['Ana López', 'María García', ...], total }
// ═══════════════════════════════════════════════════════════════════

export const getClientesPorServicio = webMethod(
  Permissions.SiteMember,
  async ({ segmento }) => {
    console.log(TAG, 'getClientesPorServicio →', segmento);

    const config = SEGMENTOS[segmento];
    if (!config) {
      console.error(TAG, 'Segmento desconocido:', segmento);
      return { ok: false, error: 'Segmento no válido: ' + segmento, nombres: [] };
    }

    try {
      // Traer todos los registros de PaymentReservations (paginado)
      const nombres = new Set();
      let skip = 0;
      const PAGE_SIZE = 500;
      let hasMore = true;

      while (hasMore) {
        const result = await wixData.query(COL_PAGOS)
          .limit(PAGE_SIZE)
          .skip(skip)
          .find({ suppressAuth: true });

        const items = result.items || [];

        for (const item of items) {
          const nombreCliente = (item.nombreCliente || '').trim();
          if (!nombreCliente) continue;

          if (config.modo === 'staff') {
            // PRODUCTOS: detectar por campo staff
            const staff = (item.staff || '').trim();
            if (staff === 'TIENDA' || staff === 'TIENDA_POS') {
              nombres.add(nombreCliente);
            }
          } else {
            // Resto: buscar keywords en descripcion
            const desc = (item.descripcion || '').toLowerCase();
            for (const kw of config.keywords) {
              if (desc.includes(kw)) {
                nombres.add(nombreCliente);
                break; // ya matcheó, no seguir con más keywords
              }
            }
          }
        }

        hasMore = items.length === PAGE_SIZE;
        skip += PAGE_SIZE;
      }

      const resultado = Array.from(nombres).sort();
      console.log(TAG, `Segmento ${segmento}: ${resultado.length} clientes únicos`);
      return { ok: true, nombres: resultado, total: resultado.length };

    } catch (err) {
      console.error(TAG, 'Error en getClientesPorServicio:', err.message);
      return { ok: false, error: err.message, nombres: [] };
    }
  }
);

// ═══════════════════════════════════════════════════════════════════
// getClientesPorLabel
// Filtra contactos Wix CRM por etiqueta (HOMBRE / MUJER / INFANTIL).
// Usa findOrCreateLabel para resolver el labelKey por displayName
// (multi-tenant: cada salón puede tener keys distintos).
// Luego queryContacts filtrando por ese label.
//
// Parámetro: { labelName: 'HOMBRE' | 'MUJER' | 'INFANTIL' }
// Retorna:   { ok, contactos: [{ contactId, nombre, telefono }], total }
// ═══════════════════════════════════════════════════════════════════

export const getClientesPorLabel = webMethod(
  Permissions.SiteMember,
  async ({ labelName }) => {
    console.log(TAG, 'getClientesPorLabel →', labelName);

    if (!labelName || !labelName.trim()) {
      return { ok: false, error: 'labelName requerido', contactos: [] };
    }

    try {
      // Paso 1: Resolver labelKey por displayName
      const findLabel = elevate(contacts.findOrCreateLabel);
      const labelResult = await findLabel(labelName.trim());
      const labelKey = labelResult.label.key;

      console.log(TAG, `Label "${labelName}" → key: ${labelKey}`);

      // Paso 2: Query contactos con ese label (paginado)
      const queryContacts = elevate(contacts.queryContacts);
      const todosContactos = [];
      let hasMore = true;
      let cursorPaging = undefined;

      while (hasMore) {
        const queryBuilder = queryContacts()
          .hasSome('info.labelKeys', [labelKey])
          .limit(100);

        let result;
        if (cursorPaging) {
          result = await cursorPaging.next();
        } else {
          result = await queryBuilder.find({ suppressAuth: true });
        }

        const items = result.items || [];

        for (const c of items) {
          const nombre = c.info?.name?.first
            ? `${c.info.name.first} ${c.info.name.last || ''}`.trim()
            : '';
          const telefono = (c.info?.phones && c.info.phones.length > 0)
            ? c.info.phones[0].phone || ''
            : '';

          if (nombre || telefono) {
            todosContactos.push({
              contactId: c._id,
              nombre: nombre,
              telefono: telefono
            });
          }
        }

        hasMore = result.hasNext && result.hasNext();
        if (hasMore) {
          cursorPaging = result;
        }
      }

      console.log(TAG, `Label "${labelName}": ${todosContactos.length} contactos`);
      return { ok: true, contactos: todosContactos, total: todosContactos.length };

    } catch (err) {
      console.error(TAG, 'Error en getClientesPorLabel:', err.message);
      return { ok: false, error: err.message, contactos: [] };
    }
  }
);