// =====================================================
// BACKEND estadisticas.web.js — KAMISUITE Estadísticas v2.5.3
// =====================================================
// v2.5.3: Fix Día de semana con poco histórico + zona Madrid
//   - obtenerMediaDiaSemanaAnio funciona aunque solo haya 1 ocurrencia histórica
//   - Elimina el filtro mínimo cnt < 2
//   - Calcula diaHoy desde fecha Madrid, no desde zona horaria del servidor
//   - Evita descuadres tipo fecha miércoles / día martes
//   - Mantiene media, totalDias y totalImporte para mostrar top ventas
//
// v2.5.1: Fix propinas
//   - Propinas separadas de totalIngresos → nuevo campo totalVentas (sin propinas)
//   - totalPropinas como campo independiente
//   - IVA se calcula sobre totalVentas (venta real), no sobre totalIngresos
//   - tablaDesglose: categoría PROPINAS no lleva columnas Base/IVA
//
// v2.5: IVA desglosado + vatRate desde SalonConfig
//   - Lee vatRate del CMS SalonConfig del site del salón (default 21)
//   - Nuevo KPI: totalBaseImponible, totalImpuesto (cuota IVA)
//   - Desglose base/cuota en: ingresosPorDia, ingresosPorDiaRanking, porServicio, tablaDesglose
//   - SIN IVA: métodoPago, staff, clientes, externos, propinas, ratio ST, productividad
//
// v2.4: FIX externos — solo status PAGADO
//   - Filtro cambiado de excluir BLOQUEADO a incluir solo PAGADO
//   - Citas CONFIRMADA (no cobradas) ya no inflan venta bruta ni comisiones
//
// v2.3: EWCM (Export Without Cash Mode)
//   - Nuevo parámetro excludeEfectivo
//   - Filtra registros con tipoPago === 'EFECTIVO' antes de procesar
//   - Pagos MIXTO se incluyen completos (desglose no disponible en CMS)
//   - Todo el pipeline trabaja con el array ya filtrado
//
// v2.0: Rewrite completo
//   - Merge variantes nombre ST (Tinte AP + Tinte aplicación → Tinte)
//   - Ingresos por día ranking (mayor a menor) + por día de semana
//   - Top 5 complementos de ST + ratio ST vs complementos asociados
//   - Productividad empleado (minutos desde queryServices)
//   - Subgrupos sin símbolo % en headers
// =====================================================

import { Permissions, webMethod } from 'wix-web-module';
import { services } from 'wix-bookings.v2';
import { orders } from 'wix-ecom-backend';
import { elevate } from 'wix-auth';
import wixData from 'wix-data';

const TAG = '[Stats v2.5.3]';
const COLECCION_PAGOS = 'PaymentReservations';
const CMS_EXTERNAL_SERVICES = 'ExternalServices';
const CMS_EXTERNAL_RECORDS = 'SvExternalRecords';
const CMS_SALON_CONFIG = 'SalonConfig';
const TIMEZONE_MADRID = 'Europe/Madrid';
const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const DEFAULT_VAT_RATE = 21;

// ═══════════════════════════════════════════════════════════════════════════
// FUNCIÓN PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════

export const obtenerEstadisticas = webMethod(
  Permissions.Anyone,
  async ({ fechaDesde, fechaHasta, excludeEfectivo }) => {
    try {
      console.log(`${TAG} Estadísticas: ${fechaDesde} → ${fechaHasta}${excludeEfectivo ? ' [EWCM]' : ''}`);

      // ── Helpers ──
      const normCat = (c) => (c || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();

      const canonCat = (c) => {
        const n = normCat(c);
        if (n.includes('SERVICIO') && n.includes('TECNICO')) return 'SERVICIOS TÉCNICOS';
        if (n.includes('COLORACION') || (n.includes('TINTE') && n.includes('MECHA'))) return 'SERVICIOS TÉCNICOS';
        return (c || '').toUpperCase();
      };

      const normalizarNombreST = (nombre) => {
        const sinParen = nombre.replace(/\s*\(.*?\)\s*/g, ' ').trim();
        const upper = sinParen.toUpperCase();
        if (upper.includes('MECHA') && upper.includes('PERSONALIZADA')) return 'Mechas Personalizadas';
        if (upper.includes('TINTE VEGETAL')) return 'Tinte Vegetal';
        if (upper.includes('TINTE')) return 'Tinte';
        return sinParen;
      };

      // v2.1: Normalizar nombre de staff
      const normalizarStaff = (nombre) => {
        let n = (nombre || '').trim();
        n = n.replace(/^[A-Z]_/i, '');
        n = n.replace(/\s+HT$/i, '').trim();
        if (n.length > 0) n = n.charAt(0).toUpperCase() + n.slice(1).toLowerCase();
        return n || 'Sin asignar';
      };

      // v2.2: Clasificar tipo de cliente por servicios
      const KW_CABALLERO = ['CABALLERO', 'BARBA', 'HOMBRE'];
      const KW_NINOS = ['NIÑO', 'NIÑA', 'NIÑOS'];
      const KW_SENORA = ['MUJER', 'MECHAS', 'TINTE', 'PEINADO', 'RECOGIDO', 'VEGETAL', 'BOTOX', 'TRATAMIENTO', 'KERASTASE', 'SPA CAPILAR', 'FUSIO', 'MECHA'];

      const clasificarCliente = (descripcion) => {
        if (!descripcion) return 'Sin clasificar';
        const items = descripcion.split(/,\s*(?=[^)]*(?:\(|$))/);
        let tipoCab = 0, tipoSen = 0, tipoNin = 0;
        let precCab = 0, precSen = 0, precNin = 0;
        for (const item of items) {
          const upper = item.toUpperCase();
          if (upper.startsWith('✏️')) continue;
          const precioMatch = item.match(/\(([\d.]+)€\)\s*$/);
          const precio = precioMatch ? parseFloat(precioMatch[1]) : 0;
          for (const kw of KW_NINOS) {
            if (upper.includes(kw)) { tipoNin++; precNin += precio; break; }
          }
          for (const kw of KW_CABALLERO) {
            if (upper.includes(kw)) { tipoCab++; precCab += precio; break; }
          }
          for (const kw of KW_SENORA) {
            if (upper.includes(kw)) { tipoSen++; precSen += precio; break; }
          }
        }
        const max = Math.max(precCab, precSen, precNin);
        if (max === 0) return 'Sin clasificar';
        if (precNin === max && tipoNin > 0) return 'Niños/as';
        if (precCab === max && tipoCab > 0) return 'Caballero';
        if (precSen === max && tipoSen > 0) return 'Señora';
        return 'Sin clasificar';
      };

      // v2.5: Helper IVA — desglosar un importe con IVA incluido
      const desglosarIVA = (importeConIVA, rate) => {
        if (!importeConIVA || importeConIVA === 0) return { base: 0, cuota: 0 };
        const base = Math.round((importeConIVA / (1 + rate / 100)) * 100) / 100;
        const cuota = Math.round((importeConIVA - base) * 100) / 100;
        return { base, cuota };
      };

      // ══════════════════════════════════════════════════════════════
      // 0. LEER vatRate DE SALONCONFIG
      // ══════════════════════════════════════════════════════════════
      let vatRate = DEFAULT_VAT_RATE;
      try {
        const configResult = await wixData.query(CMS_SALON_CONFIG).limit(1).find({ suppressAuth: true });
        if (configResult.items.length > 0 && configResult.items[0].vatRate != null) {
          vatRate = Number(configResult.items[0].vatRate);
        }
        console.log(`${TAG} vatRate: ${vatRate}%`);
      } catch (configErr) {
        console.warn(`${TAG} Error leyendo vatRate de SalonConfig, usando default ${DEFAULT_VAT_RATE}%: ${configErr.message}`);
      }

      // ══════════════════════════════════════════════════════════════
      // 1. LEER PAYMENTRESERVATIONS
      // ══════════════════════════════════════════════════════════════
      let query = wixData.query(COLECCION_PAGOS);
      if (fechaDesde) query = query.ge('fechaPago', new Date(fechaDesde));
      if (fechaHasta) {
        const hasta = new Date(fechaHasta);
        hasta.setDate(hasta.getDate() + 1);
        query = query.lt('fechaPago', hasta);
      }
      query = query.limit(1000);
      const result = await query.find();
      let pagos = result.items;
      console.log(`${TAG} Registros brutos: ${pagos.length}`);

      // ══════════════════════════════════════════════════════════════
      // v2.3: EWCM — Filtrar pagos en efectivo
      // ══════════════════════════════════════════════════════════════
      if (excludeEfectivo) {
        const antesFiltro = pagos.length;
        pagos = pagos.filter(p => {
          const tipo = (p.tipoPago || '').toUpperCase();
          return tipo !== 'EFECTIVO';
        });
        console.log(`${TAG} EWCM: ${antesFiltro} → ${pagos.length} registros (${antesFiltro - pagos.length} efectivo excluidos)`);
      }

      // ══════════════════════════════════════════════════════════════
      // 2. MAPAS desde queryServices: categoría + duración
      // ══════════════════════════════════════════════════════════════
      const mapaNombreCategoria = {};
      const mapaNombreCategoriaLower = {};
      const mapaNombreDuracion = {};

      try {
        const elevatedQuery = elevate(services.queryServices);
        const svcResult = await elevatedQuery().limit(200).find();
        for (const svc of (svcResult?.items || [])) {
          const nombre = (svc.name || '').trim();
          const cat = svc.category?.name || 'SIN CATEGORÍA';
          if (nombre) {
            const catFinal = canonCat(cat);
            mapaNombreCategoria[nombre] = catFinal;
            mapaNombreCategoriaLower[nombre.toLowerCase()] = catFinal;
            const duraciones = svc.schedule?.availabilityConstraints?.sessionDurations || [];
            mapaNombreDuracion[nombre] = duraciones.length > 0 ? duraciones[0] : 0;
            mapaNombreDuracion[nombre.toLowerCase()] = mapaNombreDuracion[nombre];
          }
        }
        console.log(`${TAG} ${Object.keys(mapaNombreCategoria).length} servicios, duraciones cargadas`);
      } catch (catErr) {
        console.warn(`${TAG} queryServices: ${catErr.message}`);
      }

      const buscarCategoria = (nombre) => {
        if (mapaNombreCategoria[nombre]) return mapaNombreCategoria[nombre];
        if (mapaNombreCategoriaLower[nombre.toLowerCase()]) return mapaNombreCategoriaLower[nombre.toLowerCase()];
        if (nombre.includes(' + ')) {
          const base = nombre.split(' + ')[0].trim();
          if (mapaNombreCategoria[base]) return mapaNombreCategoria[base];
          if (mapaNombreCategoriaLower[base.toLowerCase()]) return mapaNombreCategoriaLower[base.toLowerCase()];
        }
        const limpio = nombre.replace(/\s*\(AP\)\s*/gi, '').replace(/\s*\(Aplicaci[oó]n\)\s*/gi, '').replace(/\s*\(Complemento\)\s*/gi, '').trim();
        if (limpio !== nombre) {
          if (mapaNombreCategoria[limpio]) return mapaNombreCategoria[limpio];
          if (mapaNombreCategoriaLower[limpio.toLowerCase()]) return mapaNombreCategoriaLower[limpio.toLowerCase()];
        }
        return null;
      };

      const buscarDuracion = (nombre) => {
        if (mapaNombreDuracion[nombre]) return mapaNombreDuracion[nombre];
        if (mapaNombreDuracion[nombre.toLowerCase()]) return mapaNombreDuracion[nombre.toLowerCase()];
        const limpio = nombre.replace(/\s*\(AP\)\s*/gi, '').replace(/\s*\(Aplicaci[oó]n\)\s*/gi, '').replace(/\s*\(Complemento\)\s*/gi, '').trim();
        if (mapaNombreDuracion[limpio]) return mapaNombreDuracion[limpio];
        if (mapaNombreDuracion[limpio.toLowerCase()]) return mapaNombreDuracion[limpio.toLowerCase()];
        return 0;
      };

      const findNaturalCategory = (keyword) => {
        const kw = keyword.toUpperCase();
        for (const [svcName, cat] of Object.entries(mapaNombreCategoria)) {
          const cn = normCat(cat);
          if (cn.includes('SERVICIOS TECNICOS')) continue;
          if (cn.includes('GAP') || cn.includes('PROCESO')) continue;
          if (svcName.toUpperCase().includes(kw)) return cat;
        }
        return null;
      };

      const reclasificarServicio = (nombre, categoriaOriginal) => {
        const cn = normCat(categoriaOriginal);
        const nombreLimpio = nombre.replace(/\s*\(.*?\)\s*/g, ' ').trim().toUpperCase();
        if (cn.includes('GAP') || cn.includes('PROCESO')) {
          if (nombreLimpio.includes('TRATAMIENTO') || nombreLimpio.includes('BOTOX') || nombreLimpio.includes('KERASTASE')) {
            return { categoria: findNaturalCategory('TRATAMIENTO') || 'TRATAMIENTOS', subgrupo: null };
          }
          return { categoria: categoriaOriginal, subgrupo: null };
        }
        if (!cn.includes('SERVICIOS TECNICOS')) return { categoria: categoriaOriginal, subgrupo: null };
        if (nombreLimpio.includes('TINTE') || nombreLimpio.includes('MECHA')) {
          return { categoria: 'SERVICIOS TÉCNICOS', subgrupo: null };
        }
        if (nombreLimpio.includes('TRATAMIENTO') || nombreLimpio.includes('BOTOX')) {
          return { categoria: findNaturalCategory('TRATAMIENTO') || 'TRATAMIENTOS', subgrupo: null };
        }
        if (nombreLimpio.includes('CORTE')) {
          return { categoria: findNaturalCategory('CORTE') || 'CORTES', subgrupo: 'COMPLEMENTOS' };
        }
        if (nombreLimpio.includes('PEINADO')) {
          return { categoria: findNaturalCategory('PEINADO') || 'PEINADOS Y RECOGIDOS', subgrupo: 'COMPLEMENTOS' };
        }
        if (nombreLimpio === 'SECADO' || nombreLimpio === 'LAVADO') {
          return { categoria: 'LAVADO Y SECADO', subgrupo: 'COMPLEMENTOS' };
        }
        return { categoria: 'OTROS', subgrupo: null };
      };

      const clasificarExtra = (nombreExtra) => {
        const n = nombreExtra.toUpperCase();
        if (n.includes('PEINADO')) return { categoria: findNaturalCategory('PEINADO') || 'PEINADOS Y RECOGIDOS', subgrupo: 'EXTRAS' };
        if (n.includes('AMPOLLA') || n.includes('TRATAMIENTO') || n.includes('KERASTASE') || n.includes('FUSIO')) return { categoria: findNaturalCategory('TRATAMIENTO') || 'TRATAMIENTOS', subgrupo: 'EXTRAS' };
        if (n.includes('COLOR') || n.includes('TINTE') || n.includes('MECHAS') || n.includes('MATIZ')) return { categoria: 'SERVICIOS TÉCNICOS', subgrupo: 'EXTRAS' };
        if (n.includes('CORTE') || n.includes('PUNTAS')) return { categoria: findNaturalCategory('CORTE') || 'CORTES', subgrupo: 'EXTRAS' };
        if (n.includes('PRODUCTO')) return { categoria: 'PRODUCTOS', subgrupo: 'EXTRAS' };
        if (n.includes('PROPINA')) return { categoria: 'PROPINAS', subgrupo: null };
        return { categoria: 'EXTRAS', subgrupo: null };
      };

      // ══════════════════════════════════════════════════════════════
      // 3. PROCESAR PAGOS
      // ══════════════════════════════════════════════════════════════
      let totalIngresos = 0;
      const ingresosPorDia = {};
      const ingresosPorDiaSemana = {};
      const diasUnicosPorDiaSemana = {};
      const porMetodo = {};
      const porStaff = {};
      const porServicioTop = {};
      const desglosePorCat = {};
      let totalExtras = 0;
      let countExtras = 0;
      let totalPropinas = 0;
      let countPropinas = 0;
      const productosPOS = {};
      const clientesPorTipo = { 'Señora': 0, 'Caballero': 0, 'Niños/as': 0, 'Sin clasificar': 0 };
      const complementosSTMap = {};
      let ingresosSTPrincipal = 0;
      let ingresosComplementosST = 0;
      const productividadPorStaff = {};

      const addToDesglose = (categoria, nombre, precio, subgrupo) => {
        const catNorm = normCat(categoria);
        if (catNorm.includes('GAP') || catNorm.includes('PROCESO')) return;
        const catKey = canonCat(categoria);
        let nombreFinal = nombre;
        if (catKey === 'SERVICIOS TÉCNICOS' && !subgrupo) {
          nombreFinal = normalizarNombreST(nombre);
        }
        if (!desglosePorCat[catKey]) desglosePorCat[catKey] = {};
        const key = `${nombreFinal}||${subgrupo || ''}`;
        if (!desglosePorCat[catKey][key]) {
          desglosePorCat[catKey][key] = { nombre: nombreFinal, cantidad: 0, importe: 0, subgrupo: subgrupo || null };
        }
        desglosePorCat[catKey][key].cantidad++;
        desglosePorCat[catKey][key].importe += precio;
      };

      for (const p of pagos) {
        const importe = Number(p.importeTotal || 0);
        totalIngresos += importe;

        const tipoCliente = clasificarCliente(p.descripcion);
        clientesPorTipo[tipoCliente] = (clientesPorTipo[tipoCliente] || 0) + 1;

        if (p.fechaPago) {
          const dia = new Date(p.fechaPago).toISOString().split('T')[0];
          ingresosPorDia[dia] = (ingresosPorDia[dia] || 0) + importe;
          const diaSemana = DIAS_SEMANA[new Date(p.fechaPago).getDay()];
          ingresosPorDiaSemana[diaSemana] = (ingresosPorDiaSemana[diaSemana] || 0) + importe;
          if (!diasUnicosPorDiaSemana[diaSemana]) diasUnicosPorDiaSemana[diaSemana] = new Set();
          diasUnicosPorDiaSemana[diaSemana].add(dia);
        }

        const metodo = p.tipoPago || 'Sin especificar';
        porMetodo[metodo] = (porMetodo[metodo] || 0) + importe;

        const staffRaw = (p.staff || '').toUpperCase();
        if (staffRaw === 'TIENDA_POS') {
          const desc = (p.descripcion || '').trim();
          let nombreProd = desc.replace(/^🛒\s*/, '').replace(/\s*\([\d.,]+€?\)\s*$/, '').trim();
          if (!nombreProd) nombreProd = 'Producto Tienda POS';
          if (!productosPOS[nombreProd]) productosPOS[nombreProd] = { nombre: nombreProd, count: 0, total: 0 };
          productosPOS[nombreProd].count++;
          productosPOS[nombreProd].total += importe;
          continue;
        }

        const staff = normalizarStaff(p.staff);
        porStaff[staff] = (porStaff[staff] || 0) + importe;

        if (!productividadPorStaff[staff]) {
          productividadPorStaff[staff] = { ingresos: 0, minutos: 0, servicios: 0 };
        }
        productividadPorStaff[staff].ingresos += importe;

        const desc = p.descripcion || '';
        if (!desc) continue;

        const items = desc.split(/,\s*(?=[^)]*(?:\(|$))/);
        for (const item of items) {
          const trimmed = item.trim();
          if (!trimmed) continue;

          const precioMatch = trimmed.match(/\(([\d.]+)€\)\s*$/);
          const precio = precioMatch ? parseFloat(precioMatch[1]) : 0;
          let nombre = trimmed;
          if (precioMatch) {
            nombre = trimmed.substring(0, trimmed.lastIndexOf('(' + precioMatch[1])).trim();
          }
          nombre = nombre.replace(/,\s*$/, '').trim();
          if (!nombre) continue;

          const esExtra = nombre.startsWith('✏️');
          if (esExtra) {
            const nombreExtra = nombre.replace('✏️', '').trim();
            if (precio > 0) {
              const { categoria, subgrupo } = clasificarExtra(nombreExtra);
              porServicioTop['✏️ ' + nombreExtra] = (porServicioTop['✏️ ' + nombreExtra] || 0) + precio;
              addToDesglose(categoria, nombreExtra, precio, subgrupo);

              if (normCat(categoria).includes('PROPINA')) {
                totalPropinas += precio;
                countPropinas++;
              } else {
                totalExtras += precio;
                countExtras++;
              }
            }
          } else {
            const duracion = buscarDuracion(nombre);
            if (duracion > 0) {
              productividadPorStaff[staff].minutos += duracion;
              productividadPorStaff[staff].servicios++;
            }

            if (precio > 0) {
              const categoriaWix = buscarCategoria(nombre) || 'OTROS';
              const { categoria, subgrupo } = reclasificarServicio(nombre, categoriaWix);
              const catFinal = canonCat(categoria);

              let nombreTop = nombre;
              if (catFinal === 'SERVICIOS TÉCNICOS' && !subgrupo) {
                nombreTop = normalizarNombreST(nombre);
              }
              porServicioTop[nombreTop] = (porServicioTop[nombreTop] || 0) + precio;
              addToDesglose(categoria, nombre, precio, subgrupo);

              if (catFinal === 'SERVICIOS TÉCNICOS' && !subgrupo) {
                ingresosSTPrincipal += precio;
              }

              if (subgrupo === 'COMPLEMENTOS') {
                const catOriginal = buscarCategoria(nombre) || 'OTROS';
                if (normCat(catOriginal).includes('SERVICIOS TECNICOS')) {
                  ingresosComplementosST += precio;
                  const nTop = nombre.replace(/\s*\(.*?\)\s*/g, ' ').trim();
                  if (!complementosSTMap[nTop]) complementosSTMap[nTop] = { nombre: nTop, cantidad: 0, importe: 0 };
                  complementosSTMap[nTop].cantidad++;
                  complementosSTMap[nTop].importe += precio;
                }
              }
            } else {
              const duracion0 = buscarDuracion(nombre);
              if (duracion0 > 0) {
                productividadPorStaff[staff].minutos += duracion0;
                productividadPorStaff[staff].servicios++;
              }
            }
          }
        }
      }

      // ══════════════════════════════════════════════════════════════
      // 4. EXTERNOS — v2.4: solo status PAGADO
      // ══════════════════════════════════════════════════════════════
      let externosResult = { citas: 0, ventaBruta: 0, comisionTotal: 0, desglose: [] };
      try {
        let mapaComisiones = {};
        let comisionFallback = 0;
        const catResult = await wixData.query(CMS_EXTERNAL_SERVICES).eq('activeStatus', true).limit(100).find();
        for (const item of (catResult.items || [])) {
          const nombre = (item.serviceName || '').trim().toUpperCase();
          const pct = Number(item.commissionPercentage || 0);
          if (nombre) mapaComisiones[nombre] = pct;
          if (comisionFallback === 0 && pct > 0) comisionFallback = pct;
        }

        const startRange = new Date(new Date(`${fechaDesde}T00:00:00`).getTime() - 3 * 3600000);
        const endRange = new Date(new Date(`${fechaHasta}T23:59:59`).getTime() + 3 * 3600000);
        let allExtRecords = [];
        let extOffset = 0;
        let extHasMore = true;
        while (extHasMore) {
          const extResult = await wixData.query(CMS_EXTERNAL_RECORDS)
            .eq('status', 'PAGADO')
            .ge('date', startRange).le('date', endRange)
            .ascending('date').skip(extOffset).limit(100).find();
          allExtRecords = allExtRecords.concat(extResult.items || []);
          extHasMore = (extResult.items || []).length === 100;
          extOffset += 100;
        }

        const citasValidas = allExtRecords.filter(item => {
          if (!item.date) return false;
          const d = new Date(item.date);
          const madridDate = d.toLocaleDateString('en-CA', { timeZone: TIMEZONE_MADRID });
          if (madridDate < fechaDesde || madridDate > fechaHasta) return false;
          return true;
        });

        let ventaBruta = 0, comisionTotal = 0;
        const desglosePorServicio = {};
        for (const cita of citasValidas) {
          const precio = Number(cita.totalPrice || 0);
          const catUpper = (cita.category || '').trim().toUpperCase();
          let pctComision = mapaComisiones[catUpper] !== undefined ? mapaComisiones[catUpper] : 0;
          if (pctComision === 0) {
            for (const parte of catUpper.split('+').map(p => p.trim())) {
              if (mapaComisiones[parte] !== undefined) { pctComision = mapaComisiones[parte]; break; }
            }
            if (pctComision === 0 && comisionFallback > 0) pctComision = comisionFallback;
          }
          const comision = Math.round((precio * pctComision / 100) * 100) / 100;
          ventaBruta += precio;
          comisionTotal += comision;
          const nombreServicio = cita.modality || cita.category || 'Servicio externo';
          if (!desglosePorServicio[nombreServicio]) desglosePorServicio[nombreServicio] = { nombre: nombreServicio, count: 0, ventaBruta: 0, comision: 0 };
          desglosePorServicio[nombreServicio].count++;
          desglosePorServicio[nombreServicio].ventaBruta += precio;
          desglosePorServicio[nombreServicio].comision += comision;
        }

        externosResult = {
          citas: citasValidas.length,
          ventaBruta: Math.round(ventaBruta * 100) / 100,
          comisionTotal: Math.round(comisionTotal * 100) / 100,
          desglose: Object.values(desglosePorServicio)
        };
        console.log(`${TAG} Externos: ${citasValidas.length} citas PAGADAS, bruta=${externosResult.ventaBruta}€, comisión=${externosResult.comisionTotal}€`);
      } catch (extErr) { console.warn(`${TAG} Error externos: ${extErr.message}`); }

      // ══════════════════════════════════════════════════════════════
      // 5. PRODUCTOS
      // ══════════════════════════════════════════════════════════════
      let productosResult = { pedidos: 0, totalProductos: 0, desglose: [] };
      try {
        const elevatedSearchOrders = elevate(orders.searchOrders);
        const ordersResult = await elevatedSearchOrders({
          search: {
            filter: {
              "createdDate": {
                "$gte": new Date(`${fechaDesde}T00:00:00.000Z`).toISOString(),
                "$lte": new Date(`${fechaHasta}T23:59:59.999Z`).toISOString()
              }
            }
          }
        });
        const pedidos = ordersResult?.orders || [];
        let totalProductos = 0;
        const desgloseProd = {};

        for (const pedido of pedidos) {
          if (pedido.paymentStatus === 'NOT_PAID' || pedido.paymentStatus === 'REFUNDED') continue;
          for (const li of (pedido.lineItems || [])) {
            const nombre = li.productName?.translated || li.productName?.original || li.name || 'Producto';
            const cantidad = Number(li.quantity || 1);
            const precioUnit = Number(li.price?.amount || li.priceBeforeDiscounts?.amount || 0);
            const subtotal = precioUnit * cantidad;
            totalProductos += subtotal;
            if (!desgloseProd[nombre]) desgloseProd[nombre] = { nombre, count: 0, total: 0, precioUnit };
            desgloseProd[nombre].count += cantidad;
            desgloseProd[nombre].total += subtotal;
          }
        }
        productosResult = {
          pedidos: pedidos.length,
          totalProductos: Math.round(totalProductos * 100) / 100,
          desglose: Object.values(desgloseProd)
        };
      } catch (prodErr) { console.warn(`${TAG} Error productos: ${prodErr.message}`); }

      // v2.5.1: Fusionar productos vendidos desde Tienda POS (staff=TIENDA_POS en PaymentReservations)
      const posList = Object.values(productosPOS);
      if (posList.length > 0) {
        let totalPOS = 0;
        for (const prod of posList) {
          prod.total = Math.round(prod.total * 100) / 100;
          totalPOS += prod.total;
          productosResult.desglose.push(prod);
        }
        productosResult.totalProductos = Math.round((productosResult.totalProductos + totalPOS) * 100) / 100;
        productosResult.pedidos += posList.reduce((s, p) => s + p.count, 0);
        console.log(`${TAG} Productos POS añadidos: ${posList.length} productos, ${totalPOS}€`);
      }

      // ══════════════════════════════════════════════════════════════
      // 6. CONSTRUIR RESPUESTA
      // ══════════════════════════════════════════════════════════════
      if (pagos.length === 0 && externosResult.citas === 0 && productosResult.pedidos === 0) {
        return { ok: true, hayDatos: false };
      }

      // ── Mapa de promedios por día de semana ──
      const promedioPorDiaSemana = {};
      for (const [ds, total] of Object.entries(ingresosPorDiaSemana)) {
        const count = diasUnicosPorDiaSemana[ds] ? diasUnicosPorDiaSemana[ds].size : 0;
        promedioPorDiaSemana[ds] = count > 0 ? Math.round((total / count) * 100) / 100 : 0;
      }

      // ── Ingresos por día (cronológico) — con IVA + día semana + promedio ──
      const diasOrdenados = Object.keys(ingresosPorDia).sort();
      const datosIngresosDia = {
        labels: diasOrdenados.map(d => { const f = new Date(d); return `${f.getDate()}/${f.getMonth() + 1}`; }),
        valores: diasOrdenados.map(d => ingresosPorDia[d]),
        diasSemana: diasOrdenados.map(d => DIAS_SEMANA[new Date(d).getDay()]),
        promediosDiaSemana: diasOrdenados.map(d => promedioPorDiaSemana[DIAS_SEMANA[new Date(d).getDay()]] || 0),
        valoresBase: diasOrdenados.map(d => desglosarIVA(ingresosPorDia[d], vatRate).base),
        valoresIva: diasOrdenados.map(d => desglosarIVA(ingresosPorDia[d], vatRate).cuota)
      };

      // ── Ingresos por día (ranking) — con IVA + día semana + promedio ──
      const diasRanking = Object.entries(ingresosPorDia).sort((a, b) => b[1] - a[1]);
      const datosIngresosDiaRanking = {
        labels: diasRanking.map(([d]) => { const f = new Date(d); return `${f.getDate()}/${f.getMonth() + 1}`; }),
        valores: diasRanking.map(([, v]) => v),
        diasSemana: diasRanking.map(([d]) => DIAS_SEMANA[new Date(d).getDay()]),
        promediosDiaSemana: diasRanking.map(([d]) => promedioPorDiaSemana[DIAS_SEMANA[new Date(d).getDay()]] || 0),
        valoresBase: diasRanking.map(([, v]) => desglosarIVA(v, vatRate).base),
        valoresIva: diasRanking.map(([, v]) => desglosarIVA(v, vatRate).cuota)
      };

      // ── Día de semana (sin IVA, con conteo y promedio) ──
      const diaSemanaRanking = Object.entries(ingresosPorDiaSemana).sort((a, b) => b[1] - a[1]);
      const datosDiaSemana = {
        labels: diaSemanaRanking.map(([d]) => d),
        valores: diaSemanaRanking.map(([, v]) => v),
        conteos: diaSemanaRanking.map(([d]) => diasUnicosPorDiaSemana[d] ? diasUnicosPorDiaSemana[d].size : 0),
        promedios: diaSemanaRanking.map(([d, v]) => {
          const count = diasUnicosPorDiaSemana[d] ? diasUnicosPorDiaSemana[d].size : 0;
          return count > 0 ? Math.round((v / count) * 100) / 100 : 0;
        })
      };

      // ── Método de pago (sin IVA) ──
      const datosMetodoPago = { labels: Object.keys(porMetodo), valores: Object.values(porMetodo) };

      // ── Staff (sin IVA) ──
      const staffOrdenado = Object.entries(porStaff).sort((a, b) => b[1] - a[1]);
      const datosStaff = { labels: staffOrdenado.map(s => s[0]), valores: staffOrdenado.map(s => s[1]) };

      // ── Top 10 servicios — con IVA ──
      const serviciosTop10 = Object.entries(porServicioTop).sort((a, b) => b[1] - a[1]).slice(0, 10);
      const datosServicios = {
        labels: serviciosTop10.map(s => s[0]),
        valores: serviciosTop10.map(s => s[1]),
        valoresBase: serviciosTop10.map(s => desglosarIVA(s[1], vatRate).base),
        valoresIva: serviciosTop10.map(s => desglosarIVA(s[1], vatRate).cuota)
      };

      // ── Desglose por categoría — con IVA ──
      const grandTotalServicios = Object.values(desglosePorCat).reduce((s, cat) => s + Object.values(cat).reduce((ss, i) => ss + i.importe, 0), 0);
      const grandTotalCantidad = Object.values(desglosePorCat).reduce((s, cat) => s + Object.values(cat).reduce((ss, i) => ss + i.cantidad, 0), 0);

      const tablaDesglose = Object.entries(desglosePorCat)
        .sort((a, b) => {
          const getPrio = (cat) => { if (cat === 'OTROS') return 90; if (cat === 'EXTRAS') return 91; if (cat === 'PROPINAS') return 92; return 0; };
          const prioA = getPrio(a[0]), prioB = getPrio(b[0]);
          if (prioA !== prioB) return prioA - prioB;
          const impA = Object.values(a[1]).reduce((s, i) => s + i.importe, 0);
          const impB = Object.values(b[1]).reduce((s, i) => s + i.importe, 0);
          return impB - impA;
        })
        .map(([categoria, itemsMap]) => {
          const allItems = Object.values(itemsMap);
          const esPropinaCat = normCat(categoria).includes('PROPINA');
          const subgrupoPrio = (sg) => { if (!sg) return 0; if (sg === 'COMPLEMENTOS') return 1; if (sg === 'EXTRAS') return 2; return 3; };
          const items = allItems
            .sort((a, b) => {
              const sgA = subgrupoPrio(a.subgrupo), sgB = subgrupoPrio(b.subgrupo);
              if (sgA !== sgB) return sgA - sgB;
              return b.importe - a.importe;
            })
            .map(data => {
              const importeRound = Math.round(data.importe * 100) / 100;
              const iva = esPropinaCat ? { base: 0, cuota: 0 } : desglosarIVA(importeRound, vatRate);
              return {
                nombre: data.nombre,
                cantidad: data.cantidad,
                importe: importeRound,
                importeBase: iva.base,
                importeIva: iva.cuota,
                ticketMedio: data.cantidad > 0 ? Math.round((data.importe / data.cantidad) * 100) / 100 : 0,
                pctImporte: grandTotalServicios > 0 ? Math.round((data.importe / grandTotalServicios) * 10000) / 100 : 0,
                pctCantidad: grandTotalCantidad > 0 ? Math.round((data.cantidad / grandTotalCantidad) * 10000) / 100 : 0,
                subgrupo: data.subgrupo || null
              };
            });

          const totalCatImporte = items.reduce((s, i) => s + i.importe, 0);
          const totalCatCantidad = items.reduce((s, i) => s + i.cantidad, 0);
          const totalCatRound = Math.round(totalCatImporte * 100) / 100;
          const ivaCat = esPropinaCat ? { base: 0, cuota: 0 } : desglosarIVA(totalCatRound, vatRate);

          return {
            categoria, items,
            totalImporte: totalCatRound,
            totalImporteBase: ivaCat.base,
            totalImporteIva: ivaCat.cuota,
            totalCantidad: totalCatCantidad,
            ticketMedio: totalCatCantidad > 0 ? Math.round((totalCatImporte / totalCatCantidad) * 100) / 100 : 0,
            pctImporte: grandTotalServicios > 0 ? Math.round((totalCatImporte / grandTotalServicios) * 10000) / 100 : 0,
            pctCantidad: grandTotalCantidad > 0 ? Math.round((totalCatCantidad / grandTotalCantidad) * 10000) / 100 : 0
          };
        });

      // ── ST vs Complementos (sin IVA) ──
      const top5ComplementosST = Object.values(complementosSTMap)
        .sort((a, b) => b.importe - a.importe)
        .slice(0, 5);
      const ratioSTvsComplementos = {
        ingresosST: Math.round(ingresosSTPrincipal * 100) / 100,
        ingresosComplementos: Math.round(ingresosComplementosST * 100) / 100,
        ratio: ingresosSTPrincipal > 0 ? Math.round((ingresosComplementosST / ingresosSTPrincipal) * 10000) / 100 : 0,
        top5: top5ComplementosST
      };

      // ── Productividad (sin IVA) ──
      const productividadStaff = Object.entries(productividadPorStaff)
        .sort((a, b) => b[1].ingresos - a[1].ingresos)
        .map(([nombre, data]) => ({
          nombre,
          ingresos: Math.round(data.ingresos * 100) / 100,
          minutos: data.minutos,
          horas: Math.round((data.minutos / 60) * 100) / 100,
          servicios: data.servicios,
          eurosPorHora: data.minutos > 0 ? Math.round((data.ingresos / (data.minutos / 60)) * 100) / 100 : 0,
          minutosPorServicio: data.servicios > 0 ? Math.round((data.minutos / data.servicios) * 100) / 100 : 0
        }));

      // ── Extras (sin propinas, que van aparte) ──
      const extrasData = {
        cantidad: countExtras,
        importe: Math.round(totalExtras * 100) / 100,
        ticketMedio: countExtras > 0 ? Math.round((totalExtras / countExtras) * 100) / 100 : 0
      };

      // ── Propinas ──
      const propinasData = {
        cantidad: countPropinas,
        importe: Math.round(totalPropinas * 100) / 100
      };

      // ── v2.5.1: totalVentas = recaudación sin propinas ──
      const totalVentas = Math.round((totalIngresos - totalPropinas) * 100) / 100;
      const ivaGlobal = desglosarIVA(totalVentas, vatRate);

      // ── Gran Total ──
      const granTotal = {
        ventas: totalVentas,
        propinas: propinasData.importe,
        recaudacion: Math.round(totalIngresos * 100) / 100,
        extras: extrasData.importe,
        comisionExternos: externosResult.comisionTotal,
        productos: productosResult.totalProductos,
        total: Math.round((totalVentas + externosResult.comisionTotal + productosResult.totalProductos) * 100) / 100
      };

      // ── Clientes (sin IVA) ──
      const totalClientes = Object.values(clientesPorTipo).reduce((s, v) => s + v, 0);
      const datosClientes = {
        total: totalClientes,
        tipos: Object.entries(clientesPorTipo)
          .filter(([, v]) => v > 0)
          .sort((a, b) => b[1] - a[1])
          .map(([tipo, cantidad]) => ({
            tipo,
            cantidad,
            pct: totalClientes > 0 ? Math.round((cantidad / totalClientes) * 10000) / 100 : 0
          }))
      };

      console.log(`${TAG} OK: ${pagos.length} pagos, ventas=${totalVentas}€ (base=${ivaGlobal.base}€, IVA=${ivaGlobal.cuota}€ @${vatRate}%), propinas=${totalPropinas}€, ext=${externosResult.citas} PAGADAS/${externosResult.ventaBruta}€${excludeEfectivo ? ' [EWCM]' : ''}`);

      return {
        ok: true, hayDatos: true,
        vatRate,
        totalIngresos,
        totalVentas,
        totalPropinas,
        totalBaseImponible: ivaGlobal.base,
        totalImpuesto: ivaGlobal.cuota,
        totalTransacciones: pagos.length,
        ingresosPorDia: datosIngresosDia,
        ingresosPorDiaRanking: datosIngresosDiaRanking,
        porServicio: datosServicios,
        tablaDesglose,
        porDiaSemana: datosDiaSemana,
        porMetodoPago: datosMetodoPago,
        porStaff: datosStaff,
        extras: extrasData,
        propinas: propinasData,
        externos: externosResult,
        productos: productosResult,
        granTotal,
        ratioSTvsComplementos,
        productividadStaff,
        clientesPorTipo: datosClientes
      };
    } catch (error) {
      console.error(`${TAG} Error:`, error);
      return { ok: false, error: error.message };
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// v2.5.3: Medias por día de semana del año en curso
// Devuelve la media de cada día de la semana del año actual.
// Excluye el día de hoy del histórico.
// Funciona aunque haya solo 1 ocurrencia histórica.
// Calcula el día actual usando Europe/Madrid.
// ═══════════════════════════════════════════════════════════════════════════
export const obtenerMediaDiaSemanaAnio = webMethod(
  Permissions.Anyone,
  async () => {
    try {
      const ahora = new Date();

      // Fecha real de Madrid en formato YYYY-MM-DD
      const hoyStr = ahora.toLocaleDateString('en-CA', { timeZone: TIMEZONE_MADRID });
      const [hy, hm, hd] = hoyStr.split('-').map(Number);

      // Fecha local construida desde hoyStr para que getDay() coincida con Madrid
      const hoyMadridLocal = new Date(hy, hm - 1, hd);
      const inicioAnio = new Date(hy, 0, 1);
      const finAnio = new Date(hy + 1, 0, 1);

      const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
      const diaHoy = DIAS[hoyMadridLocal.getDay()];

      console.log(`${TAG} obtenerMediaDiaSemanaAnio v2.5.3: ${toISO(inicioAnio)} → ${hoyStr} (${diaHoy})`);

      // Paginar PaymentReservations del año en curso
      let allPagos = [];
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        const r = await wixData.query(COLECCION_PAGOS)
          .ge('fechaPago', inicioAnio)
          .lt('fechaPago', finAnio)
          .skip(offset)
          .limit(1000)
          .find();

        const items = r.items || [];
        allPagos = allPagos.concat(items);

        hasMore = items.length === 1000;
        offset += 1000;

        if (offset > 50000) break;
      }

      // Acumular por fecha real Madrid: YYYY-MM-DD
      const porFecha = {};

      for (const p of allPagos) {
        if (!p.fechaPago) continue;

        const fechaISO = new Date(p.fechaPago).toLocaleDateString('en-CA', {
          timeZone: TIMEZONE_MADRID
        });

        // Excluir hoy del histórico para comparar contra días ya cerrados
        if (fechaISO === hoyStr) continue;

        porFecha[fechaISO] = (porFecha[fechaISO] || 0) + Number(p.importeTotal || 0);
      }

      // Agrupar histórico por día de semana
      const acumPorDia = {};
      const contPorDia = {};

      for (const [fechaISO, total] of Object.entries(porFecha)) {
        const [y, m, d] = fechaISO.split('-').map(Number);

        // Parseo local desde YYYY-MM-DD para evitar offsets UTC
        const dt = new Date(y, m - 1, d);
        const ds = DIAS[dt.getDay()];

        acumPorDia[ds] = (acumPorDia[ds] || 0) + total;
        contPorDia[ds] = (contPorDia[ds] || 0) + 1;
      }

      // Medias por día.
      // v2.5.3: incluir cualquier día con al menos 1 ocurrencia.
      const mediasPorDia = {};

      for (const ds of DIAS) {
        const cnt = contPorDia[ds] || 0;
        const total = acumPorDia[ds] || 0;

        if (cnt <= 0) continue;

        mediasPorDia[ds] = {
          media: Math.round((total / cnt) * 100) / 100,
          totalDias: cnt,
          totalImporte: Math.round(total * 100) / 100
        };
      }

      // Ventas de hoy.
      // Se hace una búsqueda amplia y luego se filtra por fecha Madrid para evitar desfases de zona horaria.
      const inicioBusquedaHoy = new Date(Date.UTC(hy, hm - 1, hd - 1, 0, 0, 0));
      const finBusquedaHoy = new Date(Date.UTC(hy, hm - 1, hd + 2, 0, 0, 0));

      let pagosHoy = [];
      let hoyOffset = 0;
      let hoyHasMore = true;

      while (hoyHasMore) {
        const rHoy = await wixData.query(COLECCION_PAGOS)
          .ge('fechaPago', inicioBusquedaHoy)
          .lt('fechaPago', finBusquedaHoy)
          .skip(hoyOffset)
          .limit(1000)
          .find();

        const itemsHoy = rHoy.items || [];
        pagosHoy = pagosHoy.concat(itemsHoy);

        hoyHasMore = itemsHoy.length === 1000;
        hoyOffset += 1000;

        if (hoyOffset > 10000) break;
      }

      const ventasHoy = pagosHoy
        .filter(p => {
          if (!p.fechaPago) return false;
          const fechaISO = new Date(p.fechaPago).toLocaleDateString('en-CA', {
            timeZone: TIMEZONE_MADRID
          });
          return fechaISO === hoyStr;
        })
        .reduce((s, p) => s + Number(p.importeTotal || 0), 0);

      const ventasHoyRound = Math.round(ventasHoy * 100) / 100;

      const mediaInfoHoy = mediasPorDia[diaHoy] || {
        media: 0,
        totalDias: 0,
        totalImporte: 0
      };

      const mediaHoy = Number(mediaInfoHoy.media || 0);
      const totalDiasHistorico = Number(mediaInfoHoy.totalDias || 0);

      const delta = mediaHoy > 0
        ? Math.round(((ventasHoyRound - mediaHoy) / mediaHoy) * 10000) / 100
        : 0;

      if (!mediasPorDia[diaHoy]) {
        console.warn(
          `${TAG} obtenerMediaDiaSemanaAnio: sin histórico previo para ${diaHoy}. ` +
          `Se devuelve media=0, pero el widget no rompe.`
        );
      }

      console.log(
        `${TAG} Hoy=${diaHoy} fecha=${hoyStr} ventas=${ventasHoyRound}€ vs media=${mediaHoy}€ ` +
        `(${delta}%) histórico=${totalDiasHistorico} días`
      );

      return {
        ok: true,
        anio: hy,
        fechaHoy: hoyStr,
        diaSemanaHoy: diaHoy,
        ventasHoy: ventasHoyRound,
        mediaDiaHoy: mediaHoy,
        deltaPct: delta,
        totalDiasHistorico,
        historicoSuficienteHoy: totalDiasHistorico > 0,
        mediasPorDia
      };
    } catch (err) {
      console.error(`${TAG} obtenerMediaDiaSemanaAnio:`, err);
      return {
        ok: false,
        error: err?.message || 'Error obteniendo media día semana'
      };
    }
  }
);

// Helper local para logging de fechas
function toISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}