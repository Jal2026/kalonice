import { services } from 'wix-bookings.v2';
import { webMethod, Permissions } from 'wix-web-module';

export const getServicioCompleto = webMethod(Permissions.Anyone, async () => {
    try {
        console.log('🔍 Iniciando consulta técnica con Bookings V2...');

        // Consultamos todos los servicios usando la API V2
        const queryResult = await services.queryServices()
            .limit(100)
            .find();

        const items = queryResult.items;

        // Mapeamos los datos para que sean fáciles de leer y procesar
        const serviciosProcesados = items.map(s => {
            // La duración en V2 para citas (Appointments) está aquí:
            const duracion = s.schedule?.availabilityConstraints?.sessionDurations?.[0] || 0;
            
            return {
                id: s._id,
                nombre: s.name,
                categoria: s.category?.name || 'Sin Categoría',
                duracionMinutos: duracion,
                precio: s.payment?.amount || 0,
                tipo: s.type // APPOINTMENT, CLASS, etc.
            };
        });

        // Extraemos lista única de categorías para tu control
        const categoriasUnicas = [...new Set(serviciosProcesados.map(s => s.categoria))];

        console.log(`✅ ${serviciosProcesados.length} servicios procesados con duración.`);

        return {
            ok: true,
            servicio: serviciosProcesados,
            categorias: categoriasUnicas,
            rawFirstItem: items[0] // Te dejo el primero en bruto por si quieres ver todo lo que trae
        };

    } catch (e) {
        console.error('❌ Error en Backend V2:', e);
        return {
            ok: false,
            error: e.message
        };
    }
});