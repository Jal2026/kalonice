// ╔══════════════════════════════════════════════════════════════════╗
// ║  crmToolsLogic.web.js — Herramientas CRM                      ║
// ║  KAMISUITE · v1.0.0                                            ║
// ╚══════════════════════════════════════════════════════════════════╝
//
// FUNCIÓN: Herramientas de mantenimiento y enriquecimiento del CRM.
// Primera función: clasificación demográfica masiva (sexo por nombre).
//
// DISEÑO: Backend independiente. No toca ningún backend existente.
// Llamado desde pagecode_ficha_cliente.js vía botón externo.
//
// DEPENDENCIAS:
//   - wix-crm-backend (contacts: queryContacts, updateContact,
//     labelContact, findOrCreateLabel)
//   - wix-auth (elevate)
//   - Anthropic Claude API (secret KAMISUITE)
//
// CHANGELOG:
//   v1.0.0 (26-May-2026) — Versión inicial
//     - clasificarBatchSexo: procesa N contactos (offset+limit),
//       clasifica por nombre con Claude, escribe campo custom.sexo
//       y aplica label HOMBRE/MUJER/INFANTIL.
//     - contarContactosSinSexo: cuenta cuántos faltan por clasificar.
// ═══════════════════════════════════════════════════════════════════

import { Permissions, webMethod } from 'wix-web-module';
import { contacts } from 'wix-crm-backend';
import { elevate } from 'wix-auth';
import { fetch } from 'wix-fetch';
import { getSecret } from 'wix-secrets-backend';

const VERSION = '1.0.0';
const TAG = '[CrmTools v1.0.0]';

// ═══════════════════════════════════════════════════════════════════
// contarContactosSinSexo
// Cuenta cuántos contactos NO tienen el campo custom.sexo relleno.
// Devuelve { total, sinSexo, conSexo } para que el pagecode muestre
// el estado antes de lanzar la clasificación.
// ═══════════════════════════════════════════════════════════════════

export const contarContactosSinSexo = webMethod(
  Permissions.SiteMember,
  async () => {
    console.log(TAG, 'contarContactosSinSexo');
    try {
      const queryFn = elevate(contacts.queryContacts);
      let total = 0;
      let conSexo = 0;
      let cursor = null;
      let hasMore = true;

      while (hasMore) {
        let result;
        if (cursor) {
          result = await cursor.next();
        } else {
          result = await queryFn().limit(100).find({ suppressAuth: true });
        }

        const items = result.items || [];
        total += items.length;

        for (const c of items) {
          const sexo = c.info?.extendedFields?.['custom.sexo'];
          if (sexo && sexo.trim() !== '') conSexo++;
        }

        hasMore = result.hasNext();
        if (hasMore) cursor = result;
      }

      const sinSexo = total - conSexo;
      console.log(TAG, `Total: ${total}, Con sexo: ${conSexo}, Sin sexo: ${sinSexo}`);
      return { ok: true, total, conSexo, sinSexo };

    } catch (err) {
      console.error(TAG, 'Error contarContactosSinSexo:', err.message);
      return { ok: false, error: err.message };
    }
  }
);

// ═══════════════════════════════════════════════════════════════════
// clasificarBatchSexo
// Procesa un batch de contactos SIN sexo asignado:
//   1. Query contactos paginado (offset/limit)
//   2. Filtra los que no tienen custom.sexo
//   3. Envía nombres a Claude para clasificar M/F/desconocido
//   4. Escribe custom.sexo + aplica label HOMBRE/MUJER
//   5. Devuelve { procesados, clasificados, errores, hayMas }
//
// El pagecode llama esta función en loop hasta que hayMas === false.
// ═══════════════════════════════════════════════════════════════════

export const clasificarBatchSexo = webMethod(
  Permissions.SiteMember,
  async ({ offset = 0, batchSize = 10 }) => {
    console.log(TAG, `clasificarBatchSexo offset=${offset} batch=${batchSize}`);

    try {
      // ── Paso 1: Obtener label keys ──
      const findLabel = elevate(contacts.findOrCreateLabel);
      const [labelH, labelM, labelI] = await Promise.all([
        findLabel('HOMBRE'),
        findLabel('MUJER'),
        findLabel('INFANTIL')
      ]);
      const labelKeys = {
        M: labelH.label.key,
        F: labelM.label.key,
        I: labelI.label.key
      };

      // ── Paso 2: Query contactos ──
      const queryFn = elevate(contacts.queryContacts);
      const result = await queryFn()
        .limit(batchSize)
        .skip(offset)
        .find({ suppressAuth: true });

      const items = result.items || [];
      if (items.length === 0) {
        return { ok: true, procesados: 0, clasificados: 0, errores: 0, hayMas: false, offset };
      }

      // ── Paso 3: Filtrar los que ya tienen sexo ──
      const sinSexo = items.filter(c => {
        const sexo = c.info?.extendedFields?.['custom.sexo'];
        return !sexo || sexo.trim() === '';
      });

      if (sinSexo.length === 0) {
        // Todos en este batch ya tienen sexo, seguir con siguiente
        return {
          ok: true, procesados: items.length, clasificados: 0, errores: 0,
          hayMas: items.length === batchSize,
          offset: offset + items.length
        };
      }

      // ── Paso 4: Preparar nombres para Claude ──
      const nombresParaClasificar = sinSexo.map(c => ({
        id: c._id,
        revision: c.revision,
        firstName: c.info?.name?.first || '',
        fullName: `${c.info?.name?.first || ''} ${c.info?.name?.last || ''}`.trim()
      }));

      // ── Paso 5: Llamar a Claude para clasificar ──
      const clasificaciones = await _clasificarNombresConClaude(
        nombresParaClasificar.map(n => n.firstName || n.fullName)
      );

      // ── Paso 6: Aplicar clasificaciones ──
      let clasificados = 0;
      let errores = 0;
      const updateFn = elevate(contacts.updateContact);
      const labelFn = elevate(contacts.labelContact);

      for (let i = 0; i < nombresParaClasificar.length; i++) {
        const contacto = nombresParaClasificar[i];
        const cls = clasificaciones[i] || 'desconocido';

        if (cls === 'desconocido') continue;

        try {
          // Escribir campo custom.sexo — firma de guardarNotaSalon
          const sexoValue = cls === 'M' ? 'Hombre' : 'Mujer';
          await updateFn(
            { contactId: contacto.id, revision: contacto.revision },
            { extendedFields: { 'custom.sexo': sexoValue } },
            { suppressAuth: true }
          );

          // Aplicar label — firma plana: (contactId, [labelKeys], options)
          const lk = cls === 'M' ? labelKeys.M : labelKeys.F;
          await labelFn(
            contacto.id,
            [lk],
            { suppressAuth: true }
          );

          clasificados++;
        } catch (err) {
          console.error(TAG, `Error actualizando ${contacto.id} (${contacto.fullName}):`, err.message);
          errores++;
        }
      }

      const nuevoOffset = offset + items.length;
      const hayMas = items.length === batchSize;

      console.log(TAG, `Batch: ${items.length} leídos, ${sinSexo.length} sin sexo, ${clasificados} clasificados, ${errores} errores`);
      return { ok: true, procesados: items.length, clasificados, errores, hayMas, offset: nuevoOffset };

    } catch (err) {
      console.error(TAG, 'Error clasificarBatchSexo:', err.message);
      return { ok: false, error: err.message, procesados: 0, clasificados: 0, errores: 0, hayMas: false, offset };
    }
  }
);

// ═══════════════════════════════════════════════════════════════════
// _clasificarNombresConClaude (función interna)
// Envía un array de nombres a Claude Sonnet y pide clasificación
// M/F/desconocido para cada uno.
// Devuelve array del mismo tamaño con 'M', 'F' o 'desconocido'.
// ═══════════════════════════════════════════════════════════════════

async function _clasificarNombresConClaude(nombres) {
  if (!nombres.length) return [];

  try {
    const apiKey = await getSecret('KAMISUITE');

    const prompt = `Eres un clasificador de nombres propios por sexo/género para una base de datos de una peluquería en España.

Para cada nombre de la lista, responde SOLO con una letra:
- M = nombre masculino
- F = nombre femenino
- D = no se puede determinar (nombre ambiguo, empresa, iniciales, vacío)

Responde EXACTAMENTE una línea por nombre, solo la letra (M, F o D), sin explicaciones, sin numeración, sin nada más.

Lista de nombres:
${nombres.map((n, i) => `${i + 1}. ${n || '(vacío)'}`).join('\n')}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await response.json();
    const text = (data.content && data.content[0] && data.content[0].text) || '';

    // Parsear respuesta: una letra por línea
    const lineas = text.trim().split('\n').map(l => l.trim().toUpperCase());
    const resultado = nombres.map((_, i) => {
      const letra = lineas[i] || 'D';
      if (letra === 'M') return 'M';
      if (letra === 'F') return 'F';
      return 'desconocido';
    });

    console.log(TAG, `Claude clasificó ${nombres.length} nombres: ${resultado.filter(r => r !== 'desconocido').length} identificados`);
    return resultado;

  } catch (err) {
    console.error(TAG, 'Error llamando a Claude:', err.message);
    // Si falla Claude, devolver todos como desconocido
    return nombres.map(() => 'desconocido');
  }
}