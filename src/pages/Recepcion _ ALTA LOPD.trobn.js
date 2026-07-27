import { registrarAltaLopd, obtenerLegalSalon } from 'backend/lopdClientes.web';

$w.onReady(function () {
  $w('#htmlLopdWidget').onMessage(async (event) => {
    const data = event.data || {};

    if (data.type === 'KAMISUITE_LOPD_READY') {
      const legal = await obtenerLegalSalon();

      $w('#htmlLopdWidget').postMessage({
        type: 'KAMISUITE_LOPD_CONFIG',
        config: {
          privacyPolicyUrl: legal.privacyPolicyUrl || '',
          termsConditionsUrl: legal.termsConditionsUrl || '',
          brandName: legal.brandName || '',
          legalName: legal.legalName || ''
        }
      });

      return;
    }

    if (data.type !== 'KAMISUITE_LOPD_SUBMIT') {
      return;
    }

    try {
      const result = await registrarAltaLopd(data.payload);

      $w('#htmlLopdWidget').postMessage(
        result?.ok
          ? { type: 'KAMISUITE_LOPD_SAVED', result }
          : {
              type: 'KAMISUITE_LOPD_ERROR',
              message: result?.message || 'No se pudo guardar el alta LOPD.'
            }
      );

    } catch (error) {
      console.error('[LOPD Page] ERROR:', error);

      $w('#htmlLopdWidget').postMessage({
        type: 'KAMISUITE_LOPD_ERROR',
        message: error.message || 'Error inesperado guardando LOPD.'
      });
    }
  });
});