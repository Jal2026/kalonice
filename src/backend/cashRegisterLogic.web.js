// =====================================================
// BACKEND cashRegisterLogic.web.js — Arqueo de Caja KAMISUITE v1.0.0
// =====================================================
// FECHA: 11 Mayo 2026
// VERSION: 1.0.0
//
// Colecciones CMS:
//   CashRegister  — Un registro por día (apertura → cierre)
//   CashMovements — N movimientos manuales por día
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

const TAG = '[CashRegister v1.0.0]';
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
      const fondoInicial = Number(registro?.openingBalance || 0);

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