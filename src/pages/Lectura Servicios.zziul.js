import { listarServicios } from 'backend/diagnosticoServicios.web';

$w.onReady(async function () {
  $w('#listadoServicios').text = '⏳ Cargando servicios...';
  
  const result = await listarServicios();
  
  if (!result.ok) {
    $w('#listadoServicios').text = '❌ Error: ' + result.error;
    return;
  }
  
  let texto = `✅ ${result.total} servicios encontrados\n\n`;
  
  result.servicios.forEach(s => {
    texto += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    texto += `📌 ${s.name}\n`;
    texto += `ID: ${s.id}\n`;
    texto += `Categoría: ${s.category}\n`;
    texto += `Duración: ${s.duration} min\n`;
    texto += `Precio: ${s.defaultPrice} ${s.currency}\n`;
    texto += `Rate: ${s.rateType}\n`;
    texto += `Oculto: ${s.hidden}\n`;
    texto += `Staff: ${s.staffIds.length} asignados\n`;
    
    if (s.variants.length > 0) {
      texto += `🔀 Variaciones (${s.variants.length}):\n`;
      s.variants.forEach(v => {
        texto += `  ↳ ${JSON.stringify(v.choices)} → ${v.price}${v.currency} | ${v.duration}min\n`;
      });
    }
    texto += '\n';
  });
  
  $w('#listadoServicios').text = texto;
});