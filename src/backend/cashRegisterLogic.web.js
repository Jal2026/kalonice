// =====================================================
// BACKEND cashRegisterLogic.web.js — Arqueo de Caja KAMISUITE v1.1.0
// =====================================================
// FECHA: 1 Ago 2026
// VERSION: 1.1.3
//
// CHANGELOG
//   v1.1.3 · 1 Ago 2026 · LIMPIEZA — getFondoSugerido deja de leer
//     SalonConfig.fondoCajaFijo (enfoque descartado; causaba el error
//     'does not have permissions to read on SalonConfig'). Fondo sugerido
//     apoyado SOLO en el arrastre del cash de ayer. Quitada la constante
//     COL_SALON_CONFIG. Sin cambios en el arrastre ni en
//     setOpeningBalance/abrirCaja/calcularEfectivoEsperado.
//   v1.1.2 · 1 Ago 2026 · Arrastre automático del cash del día anterior
//     - calcularEfectivoEsperado: si el registro del día NO tiene un
//       openingBalance forzado (> 0), arrastra el efectivo contado del
//       cierre anterior (getFondoSugerido → countedCash de ayer). El
//       'Fondo inicial' del arqueo deja de arrancar en 0: hereda el
//       cash con el que se cerró el día previo. 'Forzar fondo inicial'
//       (setOpeningBalance) sigue sobrescribiendo cuando se necesita.
//   v1.1.1 · 1 Ago 2026 · setOpeningBalance — fondo inicial editable
//     - NEW setOpeningBalance({ fechaISO, openingBalance }): fija el
//       fondo del día EXISTA o no la caja (crea, o READ-MERGE-UPDATE si
//       ya existe; rechaza si está cerrada). Vía directa desde el arqueo.
//       Usa el campo openingBalance ya existente en CashRegister. No
//       añade campos nuevos. abrirCaja/getFondoSugerido sin cambios.
//   v1.1.0 · 1 Ago 2026 · Apertura de caja profesional
//     - NEW getFondoSugerido({ fechaISO }) — devuelve el fondo inicial
//       SUGERIDO para abrir la caja del día, con cascada de fallback:
//         1) SalonConfig.fondoCajaFijo > 0  → origen 'fondoFijo'
//         2) countedCash del último CashRegister status='closed'
//            estrictamente anterior a fechaISO → origen 'cierreAyer'
//         3) countedCash|expectedCash del último CashRegister anterior
//            (cualquier status) con valor > 0 → origen 'esperadoAyer'
//         4) 0 → origen 'cero'
//       Solo LECTURA. No crea ni modifica nada. La usa el page code de
//       Recepción PRO para pre-rellenar el modal de apertura.
//     - abrirCaja NO se toca (ya recibía openingBalance + recordedBy).
//       Sigue siendo la única función que escribe openingBalance.
//     - Sin cambios en calcularEfectivoEsperado, guardarArqueo,
//       cerrarCaja, registrarMovimiento ni el resto: el arqueo ya
//       consumía registro.openingBalance del día, así que el fondo
//       fijado por abrirCaja fluye a todo el pipeline sin tocar nada más.
//
//   v1.0.0 · 11 Mayo 2026 · Creación inicial
//
// Colecciones CMS:
//   CashRegister  — Un registro por día (apertura → cierre)
//   CashMovements — N movimientos manuales por día
//   SalonConfig   — (solo lectura en v1.1.0) fondoCajaFijo
//
// Field IDs confirmados con Lector CMS (11 Mayo 2026):
//
// CashRegister:
//   cashPaymentsTotal, cashRegisterPhoto, closedAt, closedBy,
//   countBreakdown, countedCash, difference, differenceNote,
//   expectedCash, manualEntriesTotal, manualExitsTotal,
//   openingBalance, registerDate, status, withdrawalsTotal
//
// CashMovements:
//   amount, description, movementType, receiptImage,
//   recordedBy, registerDate, registerId
//
// Tipos de movimiento (movementType):
//   entry | exit | withdrawal | tip | minor_purchase |
//   opening_balance | regularization
//
// Estados de caja (status):
//   open | saved | closed
//
// Patrón: Permissions.SiteMember + suppressAuth: true
// =====================================================

import { Permissions, webMethod } from 'wix-web-module';
import wixData from 'wix-data';

const TAG = '[CashRegister v1.1.3]';
const COL_REGISTER = 'CashRegister';
const COL_MOVEMENTS = 'CashMovements';
const COL_PAGOS = 'PaymentReservations';

// ═══════════════════════════════════════════════════════
// HELPER: Obtener inicio y fin del día como Date
// ═══════════════════════════════════════════════════════

function _dayRange(fechaISO) {
  return {
    start: new Date(`${fechaISO}T00:00:00.000`),
    end: new Date(`${fechaISO}T23:59:59.999`)
  };
}

// ═══════════════════════════════════════════════════════
// getCajaDia — Obtener registro de caja del día (si existe)
// ═══════════════════════════════════════════════════════

export const getCajaDia = webMethod(
  Permissions.SiteMember,
  async ({ fechaISO }) => {
    try {
      console.log(`${TAG} 📋 getCajaDia: ${fechaISO}`);
      const { start, end } = _dayRange(fechaISO);

      const result = await wixData.query(COL_REGISTER)
        .ge('registerDate', start)
        .le('registerDate', end)
        .limit(1)
        .find({ suppressAuth: true });

      const registro = result.items.length > 0 ? result.items[0] : null;

      return { ok: true, registro };
    } catch (error) {
      console.error(`${TAG} ❌ getCajaDia:`, error);
      return { ok: false, error: error.message };
    }
  }
);

// ═══════════════════════════════════════════════════════
// getFondoSugerido — Fondo inicial SUGERIDO para abrir el día
//   Solo lectura. No crea ni modifica nada. Cascada de fallback:
//     1) countedCash del último CashRegister 'closed' anterior
//                                              → 'cierreAyer'
//     2) countedCash|expectedCash del último CashRegister anterior
//        (cualquier status) con valor > 0      → 'esperadoAyer'
//     3) 0                                      → 'cero'
//   (v1.1.3: eliminada la prioridad 'fondoFijo' de SalonConfig.)
//   Devuelve { ok, fondoSugerido, origen, fechaOrigen }
// ═══════════════════════════════════════════════════════

export const getFondoSugerido = webMethod(
  Permissions.SiteMember,
  async ({ fechaISO }) => {
    try {
      console.log(`${TAG} 💡 getFondoSugerido: ${fechaISO}`);

      // Inicio del día objetivo: cualquier registro estrictamente ANTERIOR
      // a este instante cuenta como "día previo".
      const inicioHoy = new Date(`${fechaISO}T00:00:00.000`);

      // (v1.1.3) Prioridad 'fondo fijo' (SalonConfig.fondoCajaFijo) ELIMINADA:
      // era del enfoque descartado del arqueo y provocaba el error
      // 'does not have permissions to read on SalonConfig'. El fondo sugerido
      // se apoya SOLO en el arrastre del cash de ayer + 'Forzar fondo inicial'.

      // ── Prioridad 2: último CashRegister CERRADO anterior a hoy ──
      const cerradoRes = await wixData.query(COL_REGISTER)
        .lt('registerDate', inicioHoy)
        .eq('status', 'closed')
        .descending('registerDate')
        .limit(1)
        .find({ suppressAuth: true });

      if (cerradoRes.items.length > 0) {
        const reg = cerradoRes.items[0];
        const contado = Number(reg.countedCash || 0);
        if (contado > 0) {
          const fechaOrigen = reg.registerDate
            ? new Date(reg.registerDate).toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })
            : '';
          return { ok: true, fondoSugerido: Math.round(contado * 100) / 100, origen: 'cierreAyer', fechaOrigen };
        }
      }

      // ── Prioridad 3: último CashRegister anterior (cualquier status) ──
      const previoRes = await wixData.query(COL_REGISTER)
        .lt('registerDate', inicioHoy)
        .descending('registerDate')
        .limit(1)
        .find({ suppressAuth: true });

      if (previoRes.items.length > 0) {
        const reg = previoRes.items[0];
        const contado = Number(reg.countedCash || 0);
        const esperado = Number(reg.expectedCash || 0);
        const valor = contado > 0 ? contado : esperado;
        if (valor > 0) {
          const fechaOrigen = reg.registerDate
            ? new Date(reg.registerDate).toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })
            : '';
          return { ok: true, fondoSugerido: Math.round(valor * 100) / 100, origen: 'esperadoAyer', fechaOrigen };
        }
      }

      // ── Prioridad 4: sin historial ──
      return { ok: true, fondoSugerido: 0, origen: 'cero', fechaOrigen: '' };
    } catch (error) {
      console.error(`${TAG} ❌ getFondoSugerido:`, error);
      // Nunca rompe la apertura: si algo falla, sugerimos 0.
      return { ok: true, fondoSugerido: 0, origen: 'cero', fechaOrigen: '', error: error.message };
    }
  }
);

// ═══════════════════════════════════════════════════════
// abrirCaja — Crear registro del día con fondo inicial
// ═══════════════════════════════════════════════════════

export const abrirCaja = webMethod(
  Permissions.SiteMember,
  async ({ fechaISO, openingBalance, recordedBy }) => {
    try {
      console.log(`${TAG} 🔓 abrirCaja: ${fechaISO} | fondo=${openingBalance}€`);

      // Comprobar si ya existe
      const { start, end } = _dayRange(fechaISO);
      const existe = await wixData.query(COL_REGISTER)
        .ge('registerDate', start)
        .le('registerDate', end)
        .limit(1)
        .find({ suppressAuth: true });

      if (existe.items.length > 0) {
        console.log(`${TAG} ⚠️ Ya existe registro para ${fechaISO}`);
        return { ok: true, registro: existe.items[0], yaExistia: true };
      }

      const registro = {
        registerDate: new Date(`${fechaISO}T08:00:00.000`),
        openingBalance: Number(openingBalance) || 0,
        cashPaymentsTotal: 0,
        manualEntriesTotal: 0,
        manualExitsTotal: 0,
        withdrawalsTotal: 0,
        expectedCash: 0,
        countedCash: 0,
        difference: 0,
        differenceNote: '',
        status: 'open',
        closedBy: '',
        closedAt: null,
        countBreakdown: ''
      };

      const inserted = await wixData.insert(COL_REGISTER, registro, { suppressAuth: true });
      console.log(`${TAG} ✅ Caja abierta: ${inserted._id}`);

      return { ok: true, registro: inserted, yaExistia: false };
    } catch (error) {
      console.error(`${TAG} ❌ abrirCaja:`, error);
      return { ok: false, error: error.message };
    }
  }
);

// ═══════════════════════════════════════════════════════
// setOpeningBalance — Fija el fondo inicial del día EXISTA o no la caja
//   A diferencia de abrirCaja (que solo CREA y no toca una caja ya
//   existente), esta función:
//     - Si el registro del día existe y NO está cerrado → READ-MERGE-
//       UPDATE: cambia solo openingBalance.
//     - Si no existe → lo crea con ese fondo (mismos defaults que abrirCaja).
//     - Si existe pero está cerrado → rechaza (caja cerrada no se edita).
//   Es la vía directa para poner/cambiar el fondo desde el arqueo.
// ═══════════════════════════════════════════════════════

export const setOpeningBalance = webMethod(
  Permissions.SiteMember,
  async ({ fechaISO, openingBalance }) => {
    try {
      const fondo = Number(openingBalance) || 0;
      console.log(`${TAG} 💰 setOpeningBalance: ${fechaISO} | fondo=${fondo}€`);

      const { start, end } = _dayRange(fechaISO);
      const res = await wixData.query(COL_REGISTER)
        .ge('registerDate', start)
        .le('registerDate', end)
        .limit(1)
        .find({ suppressAuth: true });

      if (res.items.length > 0) {
        const registro = res.items[0];
        if (registro.status === 'closed') {
          return { ok: false, error: 'La caja de este día ya está cerrada' };
        }
        // READ-MERGE-UPDATE: solo se toca openingBalance.
        registro.openingBalance = fondo;
        const updated = await wixData.update(COL_REGISTER, registro, { suppressAuth: true });
        console.log(`${TAG} ✅ Fondo actualizado: ${updated._id} → ${fondo}€`);
        return { ok: true, registro: updated, creado: false };
      }

      // No existe: crear el registro del día con el fondo (defaults de abrirCaja).
      const nuevo = {
        registerDate: new Date(`${fechaISO}T08:00:00.000`),
        openingBalance: fondo,
        cashPaymentsTotal: 0,
        manualEntriesTotal: 0,
        manualExitsTotal: 0,
        withdrawalsTotal: 0,
        expectedCash: 0,
        countedCash: 0,
        difference: 0,
        differenceNote: '',
        status: 'open',
        closedBy: '',
        closedAt: null,
        countBreakdown: ''
      };
      const inserted = await wixData.insert(COL_REGISTER, nuevo, { suppressAuth: true });
      console.log(`${TAG} ✅ Registro creado con fondo: ${inserted._id} → ${fondo}€`);
      return { ok: true, registro: inserted, creado: true };
    } catch (error) {
      console.error(`${TAG} ❌ setOpeningBalance:`, error);
      return { ok: false, error: error.message };
    }
  }
);

// ═══════════════════════════════════════════════════════
// registrarMovimiento — Insertar movimiento manual de caja
// ═══════════════════════════════════════════════════════

export const registrarMovimiento = webMethod(
  Permissions.SiteMember,
  async ({ fechaISO, movementType, amount, description, recordedBy, registerId }) => {
    try {
      console.log(`${TAG} 💰 registrarMovimiento: ${movementType} ${amount}€ — ${description}`);

      if (!movementType || !amount) {
        return { ok: false, error: 'Tipo y cantidad requeridos' };
      }

      const movimiento = {
        registerDate: new Date(`${fechaISO}T12:00:00.000`),
        movementType: movementType,
        amount: Math.abs(Number(amount)),
        description: String(description || '').trim(),
        recordedBy: String(recordedBy || '').trim(),
        registerId: String(registerId || '').trim()
      };

      const inserted = await wixData.insert(COL_MOVEMENTS, movimiento, { suppressAuth: true });
      console.log(`${TAG} ✅ Movimiento registrado: ${inserted._id}`);

      return { ok: true, movimiento: inserted };
    } catch (error) {
      console.error(`${TAG} ❌ registrarMovimiento:`, error);
      return { ok: false, error: error.message };
    }
  }
);

// ═══════════════════════════════════════════════════════
// eliminarMovimiento — Borrar un movimiento manual
// ═══════════════════════════════════════════════════════

export const eliminarMovimiento = webMethod(
  Permissions.SiteMember,
  async ({ movimientoId }) => {
    try {
      console.log(`${TAG} 🗑️ eliminarMovimiento: ${movimientoId}`);
      await wixData.remove(COL_MOVEMENTS, movimientoId, { suppressAuth: true });
      return { ok: true };
    } catch (error) {
      console.error(`${TAG} ❌ eliminarMovimiento:`, error);
      return { ok: false, error: error.message };
    }
  }
);

// ═══════════════════════════════════════════════════════
// getMovimientosDia — Leer todos los movimientos del día
// ═══════════════════════════════════════════════════════

export const getMovimientosDia = webMethod(
  Permissions.SiteMember,
  async ({ fechaISO }) => {
    try {
      console.log(`${TAG} 📋 getMovimientosDia: ${fechaISO}`);
      const { start, end } = _dayRange(fechaISO);

      const result = await wixData.query(COL_MOVEMENTS)
        .ge('registerDate', start)
        .le('registerDate', end)
        .ascending('_createdDate')
        .limit(200)
        .find({ suppressAuth: true });

      return { ok: true, movimientos: result.items || [] };
    } catch (error) {
      console.error(`${TAG} ❌ getMovimientosDia:`, error);
      return { ok: false, error: error.message, movimientos: [] };
    }
  }
);

// ═══════════════════════════════════════════════════════
// calcularEfectivoEsperado — Lee cobros efectivo del día
//   desde PaymentReservations + movimientos manuales
// ═══════════════════════════════════════════════════════

export const calcularEfectivoEsperado = webMethod(
  Permissions.SiteMember,
  async ({ fechaISO }) => {
    try {
      console.log(`${TAG} 🧮 calcularEfectivoEsperado: ${fechaISO}`);
      const { start, end } = _dayRange(fechaISO);

      // 1. Leer registro de caja del día (fondo inicial)
      const regResult = await wixData.query(COL_REGISTER)
        .ge('registerDate', start)
        .le('registerDate', end)
        .limit(1)
        .find({ suppressAuth: true });

      const registro = regResult.items.length > 0 ? regResult.items[0] : null;
      // v1.1.2 — Fondo inicial del día:
      //   · Si el registro tiene un openingBalance FORZADO (> 0), ese manda.
      //   · Si no (0 o sin registro), se ARRASTRA el efectivo contado del
      //     cierre del día anterior (getFondoSugerido → countedCash de ayer).
      //   El operador puede sobrescribir con "Forzar fondo inicial" (que
      //   escribe openingBalance vía setOpeningBalance → pasa a ser > 0).
      let fondoInicial = Number(registro?.openingBalance || 0);
      if (fondoInicial <= 0) {
        try {
          const sug = await getFondoSugerido({ fechaISO });
          if (sug && sug.ok) fondoInicial = Number(sug.fondoSugerido || 0);
        } catch (e) {
          console.warn(`${TAG} ⚠️ arrastre de fondo no disponible:`, e.message);
        }
      }

      // 2. Leer cobros en efectivo del día desde PaymentReservations
      //    tipoPago = "Efectivo" puro + parte efectivo de Mixto
      const pagosResult = await wixData.query(COL_PAGOS)
        .ge('fechaPago', start)
        .le('fechaPago', end)
        .limit(500)
        .find({ suppressAuth: true });

      const pagos = pagosResult.items || [];
      let cobrosEfectivo = 0;

      for (const pago of pagos) {
        const tipo = (pago.tipoPago || '').trim();

        if (tipo === 'Efectivo') {
          cobrosEfectivo += Number(pago.importeTotal || 0);
        } else if (tipo === 'Mixto') {
          // Parsear desglose para extraer solo la parte de efectivo
          try {
            const desglose = pago.desglosemetodopago
              ? JSON.parse(pago.desglosemetodopago)
              : {};
            if (desglose.Efectivo) {
              cobrosEfectivo += Number(desglose.Efectivo);
            }
          } catch (e) {
            // Si no se puede parsear, no sumamos nada de este pago
          }
        }
        // Tarjeta, Bizum, Sin especificar → no cuentan como efectivo
      }

      // 3. Leer movimientos manuales del día
      const movResult = await wixData.query(COL_MOVEMENTS)
        .ge('registerDate', start)
        .le('registerDate', end)
        .limit(200)
        .find({ suppressAuth: true });

      const movimientos = movResult.items || [];
      let entradas = 0;
      let salidas = 0;
      let retiradas = 0;

      for (const mov of movimientos) {
        const tipo = mov.movementType || '';
        const importe = Math.abs(Number(mov.amount || 0));

        switch (tipo) {
          case 'entry':
          case 'tip':
          case 'regularization':
            entradas += importe;
            break;
          case 'exit':
          case 'minor_purchase':
            salidas += importe;
            break;
          case 'withdrawal':
            retiradas += importe;
            break;
          // opening_balance se ignora — ya está en fondoInicial del registro
        }
      }

      // 4. Calcular esperado
      const esperado = Math.round(
        (fondoInicial + cobrosEfectivo + entradas - salidas - retiradas) * 100
      ) / 100;

      console.log(`${TAG} 🧮 Fondo=${fondoInicial} + Cobros=${cobrosEfectivo} + Entradas=${entradas} - Salidas=${salidas} - Retiradas=${retiradas} = Esperado=${esperado}`);

      // 5. Contar pagos sin método asignado (aviso para el usuario)
      let sinEspecificar = 0;
      for (const pago of pagos) {
        const tipo = (pago.tipoPago || '').trim();
        if (!tipo || tipo === 'Sin especificar') {
          sinEspecificar += Number(pago.importeTotal || 0);
        }
      }

      return {
        ok: true,
        fondoInicial,
        cobrosEfectivo: Math.round(cobrosEfectivo * 100) / 100,
        entradas: Math.round(entradas * 100) / 100,
        salidas: Math.round(salidas * 100) / 100,
        retiradas: Math.round(retiradas * 100) / 100,
        esperado,
        sinEspecificar: Math.round(sinEspecificar * 100) / 100,
        registroId: registro?._id || null,
        movimientos
      };
    } catch (error) {
      console.error(`${TAG} ❌ calcularEfectivoEsperado:`, error);
      return { ok: false, error: error.message };
    }
  }
);

// ═══════════════════════════════════════════════════════
// guardarArqueo — Guardar conteo + diferencia
//   No cierra el día. Solo guarda el arqueo.
// ═══════════════════════════════════════════════════════

export const guardarArqueo = webMethod(
  Permissions.SiteMember,
  async ({ fechaISO, countedCash, countBreakdown, differenceNote, closedBy }) => {
    try {
      console.log(`${TAG} 💾 guardarArqueo: ${fechaISO} | contado=${countedCash}€`);
      const { start, end } = _dayRange(fechaISO);

      // Obtener o crear registro
      let regResult = await wixData.query(COL_REGISTER)
        .ge('registerDate', start)
        .le('registerDate', end)
        .limit(1)
        .find({ suppressAuth: true });

      let registro;
      if (regResult.items.length === 0) {
        // Auto-crear si no existe (salón que no usa apertura formal)
        registro = {
          registerDate: new Date(`${fechaISO}T08:00:00.000`),
          openingBalance: 0,
          status: 'open'
        };
        registro = await wixData.insert(COL_REGISTER, registro, { suppressAuth: true });
      } else {
        registro = regResult.items[0];
      }

      if (registro.status === 'closed') {
        return { ok: false, error: 'La caja de este día ya está cerrada' };
      }

      // Calcular esperado en tiempo real
      const calc = await calcularEfectivoEsperado({ fechaISO });
      const esperado = calc.ok ? calc.esperado : 0;
      const contado = Number(countedCash) || 0;
      const diferencia = Math.round((contado - esperado) * 100) / 100;

      // Actualizar registro
      registro.cashPaymentsTotal = calc.ok ? calc.cobrosEfectivo : 0;
      registro.manualEntriesTotal = calc.ok ? calc.entradas : 0;
      registro.manualExitsTotal = calc.ok ? calc.salidas : 0;
      registro.withdrawalsTotal = calc.ok ? calc.retiradas : 0;
      registro.expectedCash = esperado;
      registro.countedCash = contado;
      registro.difference = diferencia;
      registro.differenceNote = String(differenceNote || '').trim();
      registro.countBreakdown = String(countBreakdown || '').trim();
      registro.closedBy = String(closedBy || '').trim();
      registro.status = 'saved';

      const updated = await wixData.update(COL_REGISTER, registro, { suppressAuth: true });
      console.log(`${TAG} ✅ Arqueo guardado: esperado=${esperado} contado=${contado} diff=${diferencia}`);

      return {
        ok: true,
        registro: updated,
        esperado,
        contado,
        diferencia,
        sinEspecificar: calc.ok ? calc.sinEspecificar : 0
      };
    } catch (error) {
      console.error(`${TAG} ❌ guardarArqueo:`, error);
      return { ok: false, error: error.message };
    }
  }
);

// ═══════════════════════════════════════════════════════
// cerrarCaja — Cierre definitivo del día
// ═══════════════════════════════════════════════════════

export const cerrarCaja = webMethod(
  Permissions.SiteMember,
  async ({ fechaISO, closedBy }) => {
    try {
      console.log(`${TAG} 🔒 cerrarCaja: ${fechaISO}`);
      const { start, end } = _dayRange(fechaISO);

      const regResult = await wixData.query(COL_REGISTER)
        .ge('registerDate', start)
        .le('registerDate', end)
        .limit(1)
        .find({ suppressAuth: true });

      if (regResult.items.length === 0) {
        return { ok: false, error: 'No hay registro de caja para este día' };
      }

      const registro = regResult.items[0];

      if (registro.status === 'closed') {
        return { ok: false, error: 'La caja ya está cerrada' };
      }

      registro.status = 'closed';
      registro.closedBy = String(closedBy || '').trim();
      registro.closedAt = new Date();

      const updated = await wixData.update(COL_REGISTER, registro, { suppressAuth: true });
      console.log(`${TAG} ✅ Caja cerrada: ${updated._id}`);

      return { ok: true, registro: updated };
    } catch (error) {
      console.error(`${TAG} ❌ cerrarCaja:`, error);
      return { ok: false, error: error.message };
    }
  }
);
