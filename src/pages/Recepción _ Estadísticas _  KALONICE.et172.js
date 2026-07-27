// =====================================================
// PAGE CODE — Estadísticas Hair Times
// HTML Component ID: #htmlStats
// Backend: obtenerEstadisticas(), obtenerMediaDiaSemanaAnio()
// =====================================================
// v2.5: Handler loadDiaSemanaAnio para comparar HOY vs media del día en el año
//
// v2.4: Informes comparativos
//   - Nuevo handler 'loadComparativa': recibe dos periodos, llama al backend en paralelo
//   - Devuelve { type: 'comparativa', periodoA, periodoB } al widget
//
// v2.3: EWCM (Export Without Cash Mode)
// =====================================================

import { obtenerEstadisticas, obtenerMediaDiaSemanaAnio } from 'backend/estadisticas.web';

const TAG = '[StatsBridge v2.5]';

$w.onReady(function () {

  // Escucha mensajes desde el HTML Component
  $w('#htmlStats').onMessage(async (event) => {
    try {
      const msg = event.data;
      if (!msg || typeof msg !== 'object') return;

      // ── Widget listo: carga mes actual ──
      if (msg.type === 'ready') {
        const hoy = new Date();
        const primerDia = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
        const ultimoDia = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);

        const fechaDesde = toISODate(primerDia);
        const fechaHasta = toISODate(ultimoDia);

        const res = await obtenerEstadisticas({ fechaDesde, fechaHasta, excludeEfectivo: false });
        $w('#htmlStats').postMessage({ type: 'stats', payload: res });
        return;
      }

      // ── Carga periodo simple ──
      if (msg.type === 'load') {
        const { fechaDesde, fechaHasta, excludeEfectivo } = msg;
        console.log(TAG, 'Cargando stats:', fechaDesde, '-', fechaHasta, excludeEfectivo ? '(EWCM)' : '');

        const res = await obtenerEstadisticas({ fechaDesde, fechaHasta, excludeEfectivo: !!excludeEfectivo });

        if (!res?.ok) {
          $w('#htmlStats').postMessage({ type: 'error', message: res?.error || 'Error obteniendo datos' });
          return;
        }

        $w('#htmlStats').postMessage({ type: 'stats', payload: res });
        return;
      }

      // ── v2.4: Carga comparativa — dos periodos en paralelo ──
      if (msg.type === 'loadComparativa') {
        const { periodoA, periodoB, excludeEfectivo } = msg;

        console.log(TAG, 'Comparativa:',
          periodoA.fechaDesde, '-', periodoA.fechaHasta,
          'VS',
          periodoB.fechaDesde, '-', periodoB.fechaHasta,
          excludeEfectivo ? '(EWCM)' : ''
        );

        $w('#htmlStats').postMessage({ type: 'loading', message: 'Cargando comparativa...' });

        const [resA, resB] = await Promise.all([
          obtenerEstadisticas({
            fechaDesde: periodoA.fechaDesde,
            fechaHasta: periodoA.fechaHasta,
            excludeEfectivo: !!excludeEfectivo
          }),
          obtenerEstadisticas({
            fechaDesde: periodoB.fechaDesde,
            fechaHasta: periodoB.fechaHasta,
            excludeEfectivo: !!excludeEfectivo
          })
        ]);

        if (!resA?.ok) {
          $w('#htmlStats').postMessage({ type: 'error', message: 'Error en periodo actual: ' + (resA?.error || 'desconocido') });
          return;
        }
        if (!resB?.ok) {
          $w('#htmlStats').postMessage({ type: 'error', message: 'Error en periodo de comparación: ' + (resB?.error || 'desconocido') });
          return;
        }

        $w('#htmlStats').postMessage({
          type: 'comparativa',
          periodoA: resA,
          periodoB: resB,
          labelA: periodoA.label || 'Actual',
          labelB: periodoB.label || 'Anterior'
        });

        console.log(TAG, 'Comparativa OK:',
          'A=' + resA.totalTransacciones + ' trans/' + resA.totalIngresos + '€',
          'B=' + resB.totalTransacciones + ' trans/' + resB.totalIngresos + '€'
        );
        return;
      }

      // ── v2.5: Carga media día de semana del año en curso ──
      if (msg.type === 'loadDiaSemanaAnio') {
        console.log(TAG, 'Cargando media día semana año...');
        const res = await obtenerMediaDiaSemanaAnio();
        if (!res?.ok) {
          $w('#htmlStats').postMessage({ type: 'error', message: res?.error || 'Error obteniendo media día semana' });
          return;
        }
        $w('#htmlStats').postMessage({ type: 'diaSemanaAnio', payload: res });
        console.log(TAG, `Hoy ${res.diaSemanaHoy}: ${res.ventasHoy}€ vs media ${res.mediaDiaHoy}€ (${res.deltaPct}%)`);
        return;
      }

    } catch (err) {
      console.error(TAG, err);
      $w('#htmlStats').postMessage({ type: 'error', message: err?.message || 'Error inesperado' });
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// HELPER: Fecha a ISO
// ═══════════════════════════════════════════════════════════════════════════
function toISODate(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}