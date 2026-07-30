// =====================================================
// KAMISUITE - Backend: Recepción PRO CMS-first
// =====================================================
// VERSION: 1.0.42
// FECHA: 30 de julio de 2026
// ARCHIVO: backend/recepcionProLogic.web.js
//
// v1.0.42: ⏱️ FRECUENCIA MÍNIMA ENTRE USOS DEL BONO en aplicarCanjeProducto.
//          Nuevo chequeo en la RAMA BONO, justo tras el de caducidad y
//          antes del match de servicio. Si el bono trae bonusUseIntervalDays
//          > 0 (snapshot congelado al emitir; 0/vacío = LIBRE), se mide el
//          intervalo en DÍAS NATURALES (calendario Madrid) contra el
//          redeemDate más reciente del bono en KamisuiteVoucherRedemptions.
//          Si no ha transcurrido el intervalo → bloqueo con mensaje (último
//          uso + fecha disponible). Primer uso (sin canjes previos) siempre
//          pasa. Bloqueo DURO (sin override en V1). Cero cambios en
//          confirmarCanjeProducto, en el modelo económico del bono, en la
//          rama KP-, ni en ninguna otra función.
//
// v1.0.41: 🧹 FIX quitarItemReserva — al quitar un servicio, quitar también su
//          fase OCUPANTE de la cascada. Antes solo se borraba del
//          serviciosDetail (desaparecía del cobro) pero la fase seguía pintada
//          y ocupando el hueco en calendario y motor de disponibilidad
//          (regresión respecto a versiones anteriores). Ahora se elimina la
//          fase ocupante (ocupa:true) cuya label coincide con el item,
//          alineada por orden de aparición, dejando HUECO (no se desplaza el
//          resto → libre para rellenar). PROCESO (ocupa:false) se deja
//          (inocuo). Extras/productos sin fase: solo serviciosDetail, como
//          antes. Recalcula fechaReserva/duracionTotal.
//
// v1.0.40: 📏 FIX redimensionarFase — NO desplazar otras fases. Revert del
//          desplazamiento introducido en v1.0.39: redimensionar una fase
//          cambia ÚNICAMENTE su dur/end. Las demás fases NO se tocan; si al
//          alargar se solapa con la siguiente, se solapa (mismo criterio que
//          moverFase; el operador decide). Se sigue recalculando
//          fechaReserva/duracionTotal (agregados de la propia cita).
//
// v1.0.39: 📏 NEW redimensionarFase({ reservaId, faseIndex, nuevaDur }).
//          Ajusta la DURACIÓN de cualquier fase ocupante de una cascada (no
//          solo la última). Calcado de moverFase: rechaza PAGADO, fija
//          dur/end de la fase indicada, recalcula fechaReserva/duracionTotal.
//          Usado por Recepción PRO (asa de resize, ahora en todas las fases).
//          [NOTA: la build desplegada de v1.0.39 desplazaba las fases
//          posteriores; corregido en v1.0.40.]
//
// v1.0.38: 🏷️ PERSISTIR CATEGORÍA (group) EN CADA RESERVA.
//          KamisuiteReservations solo grababa `family` (naturaleza técnica:
//          simple/coloracion/tratamiento). La CATEGORÍA operativa real
//          (coloracion, cortesmujer, caballero, tratamientos, manicura…) vive
//          en ServiceCatalog.group y NO se estaba copiando a la reserva.
//          Consecuencia: AKIRA (y cualquier consulta futura) tenía que cruzar
//          KamisuiteReservations ↔ ServiceCatalog por nombre para saber la
//          categoría — más lento, más tokens, riesgo de 504 y frágil ante un
//          renombrado de categoría en el catálogo.
//
//          FIX: se graba `group` en la reserva, tomado del SERVICIO PRINCIPAL
//          (regla de negocio: una reserva puede contener servicios de varias
//          categorías, pero la del principal la categoriza). El dato ya estaba
//          disponible: cargarCatalogoCompleto guarda el item crudo del
//          catálogo en porSetupUid, así que `principal.group` existe sin tocar
//          nada más. Cambio simétrico a `family`, tres registros:
//            · pack normal  → group: principal.group || ''
//            · a medida     → group: 'MEDIDA'   (fuera de catálogo)
//            · bloqueo      → group: 'BLOQUEO'  (no comercial)
//          Cubre en un único punto Recepción PRO, widget público y mobile:
//          los tres delegan en crearPackReserva. Requiere campo `group`
//          (Texto) en la colección KamisuiteReservations.
//
// v1.0.37: 🔗 Bifurcación del cobro por staff interno/externo en
//          `marcarPagadoReserva`. Circuito de externos V2 (paridad V1):
//          el checkout unificado de Recepción PRO discrimina según
//          `StaffConfig.isExternal` del staff de la reserva y escribe
//          el ledger de cobro en la colección que corresponde:
//            · isExternal=false → PaymentReservations (KRI_<id>) — rama
//              actual EXACTA, cero cambios (axioma 5).
//            · isExternal=true  → PagoreservasExternos (EXT_<id>) —
//              patrón literal replicado de externosLogic.marcarPagadoExterno
//              v1.1.5 (axioma 6: asepsia jurídica, ledger separado).
//          El status='PAGADO' de KamisuiteReservations se escribe una
//          sola vez, común a ambas ramas. `descripcion`, `importeFinal`
//          y `descripcionExtra` se calculan una sola vez antes del branch.
//          Lookup de isExternal por StaffConfig.wixResourceId con el
//          patrón ya presente en este mismo archivo (crearPackReserva,
//          bloque de resolución de estilista). Fallback seguro:
//          isExternal=false si el lookup falla o no encuentra staff.
//          Cero cambios en cualquier otra función del archivo.
//
// v1.0.36: 🔗 Exponer `mapeoFases` + `minProceso` en el shape del servicio
//          principal devuelto por `getCatalogoReserva`. Cambio aditivo,
//          motivado por Recepción PRO v1.1.59: el widget necesita el
//          mapeoFases para pintar los items tipo:'exclusivo' (grupo
//          exclusivo, chip rojo del editor v1.14.0+) como un bloque de
//          radios "No añadir + una opción por servicio del grupo". Sin
//          exponerlo, el widget lee solo `s.complementos` y los tres
//          tratamientos del grupo aparecen como toggles sueltos.
//
//          A la vez, para evitar duplicación en la UI de Recepción, se
//          filtran del array `complementos` los uids que YA están en
//          `refs` de algún item tipo:'exclusivo' del mapeoFases del
//          principal (los pintará el widget dentro del panel del grupo).
//          Simetría con widgetPublicoLogic v0.7.6.
//
//          Cero cambios en `construirFasesPack`, en `crearPackReserva`,
//          en otros exports, ni en el widget bundle público. La v0.7.7
//          simétrica del backend público queda pendiente para cuando se
//          autorice.
//
// v1.0.35: 🩹 FIX Recepción PRO pedía elegir "Lavado obligatorio" y
//          "Secado obligatorio" en el popup de Armar servicio, cuando el
//          motor los materializa automáticamente en su posición del
//          mapeoFases (Caso A de `construirFasesPack`).
//
//          Consecuencia del auto-marcado del editor v1.14.2: cuando el
//          estilista guarda un servicio complejo, los chips verdes
//          `obligatorio:true` de la cascada quedan también en el campo
//          `complementos` del CMS. Eso permite a Recepción PRO
//          "verlos" en la lista de servicios elegibles, pero introdujo
//          el efecto lateral de emitirlos con `required:true` al
//          widget, disparando el gating "X es obligatorio" del
//          _armarServicio (línea 3336 de recepcionProCMS_widget
//          v1.1.58).
//
//          Fix local a `getCatalogoReserva`: al armar el array
//          `complementos` de cada servicio principal, se filtran los
//          uids que cumplen a la vez:
//            · Están como fase `tipo:'servicio'` en el mapeoFases del
//              principal con `obligatorio:true`.
//            · En catálogo tienen `hasVariants` false/vacío.
//          Esos uids NO se emiten al widget — el motor los materializa
//          sin input externo (Caso A). Los chips verdes obligatorios
//          CON variantes (Caso B: Botox+Planchado M/L/XL) siguen
//          apareciendo con `required:true` para que el cliente/estilista
//          elija variante. Los opcionales (Caso C) también siguen
//          apareciendo, como hasta ahora.
//
//          Cero cambios en `construirFasesPack`, en otros exports, ni
//          en el widget RP CMS. Simetría pendiente en widgetPublicoLogic
//          para cuando se autorice (mismo caso: hoy no aparece porque
//          los CMS antiguos no tienen esos uids en `complementos`, pero
//          en cuanto un servicio se resave desde el editor v1.14.2
//          entrarán).
//
// v1.0.34: 🧬 MÉTODO COMPLETO — dos capacidades nuevas en el motor
//          `construirFasesPack`, ambas aditivas y retrocompatibles:
//
//          A) DESDOBLE APLICACIÓN + PROCESO al materializar servicios.
//             Cuando un servicio se materializa desde el mapeoFases
//             (rama f.tipo === 'servicio' Caso A/B/C, o nueva rama
//             'exclusivo' de más abajo), si el servicio referenciado
//             tiene `minProceso > 0` en el catálogo, se empuja
//             AUTOMÁTICAMENTE un bloque PROCESO detrás del bloque de
//             aplicación (duración = svc.minProceso, ocupa:false, no
//             genera session — libera al stylist tal como el chip
//             Proceso del principal). Esto resuelve el caso "duplicado
//             de tratamiento como componente de fase" (Kerastase,
//             HairTimes, Matiz…): el salón mete el tratamiento como
//             fila en categoría "COMPLEMENTOS DE FASES" con su propia
//             `duration` (tiempo activo) y su propio `minProceso`
//             (tiempo químico), y el motor los desdobla en cascada
//             sin campo nuevo en el mapeoFases del principal.
//             Sin `minProceso` (vacío o 0) → comportamiento actual
//             (un solo bloque de duración plana). Regresión cero.
//
//          B) CHIP ROJO — grupo exclusivo de complementos.
//             Nueva rama en el switch de mapeoFases:
//               { tipo:'exclusivo', label:'Tratamiento',
//                 refs:['setupUid1','setupUid2','setupUid3'] }
//             Semántica: el cliente elige UNO de los refs (o NINGUNO).
//             El motor busca en `compsMap` un uid ∈ refs; si lo
//             encuentra, materializa ese servicio en la posición del
//             chip rojo (aplicando A si el servicio elegido tiene
//             minProceso > 0). Si ninguno de los refs llegó como
//             complemento elegido → salta la fase, no materializa nada.
//             refsConsumidos.add(uid) del elegido evita que además se
//             encole al final como complemento suelto.
//             Retrocompatibilidad total: si el mapeoFases no contiene
//             ningún item tipo:'exclusivo' (todos los servicios ya
//             configurados), el motor no cambia comportamiento.
//
//          Cero campos nuevos en CMS. Cero cambios en el resto de
//          funciones exportadas. Cambio localizado en la única función
//          `construirFasesPack`.
//
// v1.0.33: 🩹 FIX match del label en el canje de BONO CON VARIANTE.
//          Cuando el bono se emitió sobre una variante concreta del
//          servicio, voucherPublicLogic v1.0.2 escribe en
//          KamisuiteVouchers.serviceLabel el label compuesto con el
//          sufijo " · <variante>" (formato IDÉNTICO al que aplica
//          crearPackReserva v1.0.25 línea 1263 al principal cuando la
//          cita se crea con variante). Ejemplo:
//              bono.serviceLabel = "Membresía VIP · Tamaño Pelo L"
//              línea en cita     = "Membresía VIP · Tamaño Pelo L"
//
//          BUG v1.0.32: en aplicarCanjeProducto y confirmarCanjeProducto,
//          el bloque que resuelve `labelActual` sobrescribía el label
//          COMPLETO con el del ServiceCatalog (que devuelve la base sin
//          variante, "Membresía VIP"). Resultado: match contra
//          serviciosDetail fallaba y el canje devolvía "esta cita no
//          contiene ese servicio".
//
//          FIX: si `bono.serviceLabel` (o `card.serviceLabel` en la rama
//          KP-) contiene el separador " · ", se extrae el sufijo desde
//          ese punto y se concatena al label del ServiceCatalog. Así:
//            · Bono sin variante ("Corte Caballero") → override normal
//              con el label del catálogo (comportamiento v1.0.32 intacto,
//              retrocompatibilidad total).
//            · Bono con variante ("Membresía VIP · Tamaño Pelo L") →
//              labelActual = "<catálogo actual> · Tamaño Pelo L".
//              Sobrevive a renombrados del servicio base (ej. si mañana
//              el catálogo pasa a llamarse "VIP Premium", el bono
//              matchea la línea "VIP Premium · Tamaño Pelo L" que
//              crearPackReserva compone también con el nuevo base).
//
//          Cambios exclusivos en tres bloques idénticos:
//            1) aplicarCanjeProducto — rama BONO (BN-)
//            2) aplicarCanjeProducto — rama TARJETA (KP-)   ← simétrico
//               y protector para cuando el módulo de tarjetas soporte
//               variantes; hoy no hay tarjetas con variante en producción
//               y el fix es idempotente para tarjetas sin variante.
//            3) confirmarCanjeProducto — rama BONO (recálculo de
//               amountSaved). Mismo criterio que en aplicarCanjeProducto.
//
//          Cero cambios en: cálculo del `ahorro` (v1.0.32 sigue vigente,
//          bono cubre 100%), rama KP- de confirmarCanjeProducto,
//          getProductosCustomCliente, marcarPagadoReserva, cancelarReserva,
//          crearPackReserva, crearReservaMedida, crearBloqueo/eliminar/
//          actualizar, extenderReserva/quitarExtension, reprogramarReserva,
//          agregarExtraReserva, agregarComplementoReserva, agregarServicioReserva,
//          quitarItemReserva, moverFase, getCatalogoReserva, getStaffColumnas,
//          getReservasPorFecha, getConstants, helpers (madridToUTC, jsonIn/Out,
//          wrapItems/Ids, resolverScheduleIdAncla, cargarCatalogoCompleto,
//          construirFasesPack, ensureContactInCRM). Cero cambios en imports,
//          constantes de colección, status strings, USOS_VALIDOS,
//          PREFIJO_PAGO, TIMEZONE, NOTA_RECURSO_INTERNO.
//
// v1.0.32: 🩹 FIX CRÍTICO modelo económico del BONO en aplicarCanjeProducto
//          y confirmarCanjeProducto. Decisión Jal (sesión 26-jun tarde):
//          un bono PREPAGA el servicio. Cuando el cliente lo canjea, el
//          servicio queda CUBIERTO AL 100% — no se cobra nada por ese
//          servicio en la cita. El campo `appliedDiscount` es solo el %
//          de descuento que tuvo al COMPRAR el bono (info histórica),
//          NO se aplica en cada canje.
//
//          Modelo confirmado leyendo voucherPublicLogic v1.x.x:
//             precioBruto = ServiceCatalog.price × bonoNumero
//             precioBono  = precioBruto × (1 − bonoDescuento/100)
//             retailPrice = precioBruto   (lo que costarían a precio normal)
//             paidPrice   = precioBono    (lo que el cliente pagó por el bono)
//             appliedDiscount = bonoDescuento (% histórico)
//
//          Implicación en el canje:
//            · ahorro = precioLinea  (el servicio queda cubierto entero)
//            · nuevoImporte = precioTotal − precioLinea
//            · Si la cita SOLO tiene ese servicio → nuevoImporte = 0.
//            · descripcionToken: "Bono BN-XXXX cubre Corte Caballero (-20€)"
//              (antes: "Bono BN-XXXX -25% sobre Corte Caballero" — incorrecto)
//            · amountSaved en KamisuiteVoucherRedemptions = precioLinea
//
//          confirmarCanjeProducto rama bono: el cálculo de amountSaved
//          también pasa a precioLinea (sin aplicar %). El resto del flujo
//          (READ-MERGE-UPDATE bono, decremento de usos, status AGOTADO,
//          insert redemption, idempotencia) se mantiene intacto.
//
//          Tarjetas (rama KP-) NO se tocan en este FIX: su modelo es
//          distinto (promoPrice es el precio final del servicio en la
//          campaña, ahorro = precioLinea − promoPrice), correcto desde
//          v1.0.31. Cualquier ajuste posterior queda pendiente cuando se
//          revise el flujo de tarjetas en producción.
//
//          getProductosCustomCliente NO se toca: ya devuelve los bonos
//          activos del cliente (status='ACTIVO', remainingUses>0, no
//          caducados). El page code v1.0.25 ya la consume.
//
// v1.0.31: F4+F5 — Identificación y canje de Productos Custom
//          (Bonos y Tarjetas Promocionales) en el cobro de la cita.
//
//          Tres funciones NUEVAS, todas independientes de
//          marcarPagadoReserva (que NO se toca):
//
//          1) getProductosCustomCliente({contactId})
//             Lectura pura. Devuelve {prime, bonos, tarjetas}:
//               · prime: membresía ACTIVA del contactId (informativo).
//               · bonos: KamisuiteVouchers status='ACTIVO' del contactId
//                 con remainingUses>0 y no caducados.
//               · tarjetas: KamisuitePromoCards status='EMITIDA' del
//                 contactId con isGift=false y no caducadas. (Las
//                 tarjetas regalo isGift=true van por entrada manual
//                 del código en el modal: el operador introduce KP-...
//                 y se valida en aplicarCanjeProducto.)
//
//          2) aplicarCanjeProducto({reservaId, codigoProducto})
//             VALIDA y CALCULA sin escribir nada. Detecta tipo por
//             prefijo (BN- = bono, KP- = tarjeta). Devuelve
//             {nuevoImporte, ahorro, descripcionToken, ...} listo para
//             que el page code lo pase a marcarPagadoReserva como
//             importeNeto + descripcionExtra.
//             Resolución del servicio del bono/tarjeta dentro de la
//             cita: lee ServiceCatalog para resolver serviceSetupUid →
//             label actual y cruza contra serviciosDetail (no usa el
//             serviceLabel cacheado del bono, así sobrevive a
//             renombrados del catálogo).
//             BLOQUEA si la cita no contiene el servicio del bono/
//             tarjeta (decisión Jal 26-jun: "el bono premia y descuenta
//             el servicio principal; si quieren pack especial, descuento
//             manual del operador").
//             Modelo trinario A: si el servicio está embebido en otro
//             (CASO A: Lavado/Secado dentro de Color Atelier), NO
//             aparece en serviciosDetail y el match falla — esto es
//             correcto, el bono se compra por servicio reservable, no
//             por fase técnica embebida.
//
//          3) confirmarCanjeProducto({reservaId, codigoProducto, staff,
//                                     activationMethod})
//             PERSISTE el canje. Se llama TRAS marcarPagadoReserva (el
//             page code orquesta el orden). Es idempotente: si ya hay
//             redemption para este voucherId+reservationId, devuelve
//             {yaCanjeado:true} sin doble efecto.
//             · Bono: READ-MERGE-UPDATE de KamisuiteVouchers
//                     (remainingUses--, status='AGOTADO' si llega a 0)
//                     + insert en KamisuiteVoucherRedemptions con
//                     voucherId, reservationId, paymentReservationId
//                     (resuelto por KRI_<reservaId>), serviceSetupUid,
//                     redeemDate, amountSaved, usesBefore/usesAfter,
//                     activationMethod ('auto'|'manual'), staff,
//                     voucherImage.
//             · Tarjeta: READ-MERGE-UPDATE de KamisuitePromoCards
//                        (status='CANJEADA', redeemDate=now,
//                        redeemedInReservationId=reservaId,
//                        redeemedByContactId=reserva.contactId si vacío).
//
//          Decisiones cerradas (sesión 26-jun-2026):
//            · Uno solo por reserva (bono O tarjeta, no ambos).
//            · Bono aplica % al precio de SU servicio dentro de la cita.
//            · Bloquear si la cita no contiene el servicio del bono.
//            · Tarjeta sustituye precio del servicio por promoPrice de
//              KamisuitePromoCampaigns (resuelto por promoTypeId).
//            · Cliente provisional sin contactId: solo entrada manual.
//            · Bonos sobreviven al vencimiento PRIME (decisión D-2).
//            · Packs especiales del salón: descuento manual del operador,
//              fuera de alcance F4/F5.
//
//          marcarPagadoReserva NO se toca (ya acepta importeNeto +
//          descripcionExtra desde v1.0.4, así que F4/F5 se integran
//          sin abrir esa función crítica). Modal de cita actual
//          intacto, solo añade sección "Productos del cliente" en
//          page code/widget (entrega aparte).
//
//          Field IDs verificados contra KamisuiteIds_ALL_fieldIDs_3.csv
//          (sesión 26-jun) para las 5 colecciones tocadas:
//          KamisuiteVouchers, KamisuitePromoCards,
//          KamisuitePromoCampaigns, KamisuiteVoucherRedemptions,
//          KamisuitePrimeMemberships. Cero invención.
//
// v1.0.30: 🩹 FIX label duplicado en complementos con variante.
//          Cuando se elegía Peinado M, en la cita salía "Peinado Peinado M".
//          Lo mismo con "Tratamiento Tratamiento HairTimes". Causa: la
//          normalización en crearPackReserva concatenaba siempre
//          `${c.label} ${item.varianteLabel}`, pero los widgets envían
//          `varianteLabel` ya con el label de la variante completo
//          (incluye el nombre del servicio), no solo el sufijo.
//
//          FIX: si `varianteLabel` empieza por `c.label` (case-insensitive,
//          trim), usar solo `varianteLabel` (evita duplicación). Si no
//          (caso futuro donde la variante sea independiente, ej. "Talla XL"),
//          mantener la concatenación normal "<label> <varianteLabel>".
//
//          Cambio aislado en una sola función (crearPackReserva, bloque
//          de normalización de compsNorm). Cero efectos colaterales: el
//          resto del pipeline (precio, duración, fases, serviciosDetail,
//          title) consume el `label` ya normalizado. Widgets sin cambios.
//
// v1.0.29: 🩹 FIX FASES OBLIGATORIAS — modelo trinario para fases
//          tipo:'servicio' del mapeoFases. v1.0.28 omitía TODAS las fases
//          servicio del mapeo que no llegaran como complemento elegido,
//          incluido Lavado/Secado que SIEMPRE deben formar parte del pack
//          de un Color/Tratamiento (el salón nunca los marca; es absurdo
//          pedirle ese clic). Modelo correcto:
//
//            CASO A — `obligatorio:true` + svc SIN variantes
//                     (Lavado, Secado dentro de Color/Tratamiento):
//                     AUTO-MATERIALIZA con datos del catálogo
//                     (svc.duration, svc.label). NO se cobra extra; su
//                     precio está embebido en el precio del servicio
//                     principal. NO aparece en serviciosDetail.
//                     Resultado UX: Color Atelier = 1 clic en Color
//                     Atelier + 1 clic en calendario, ya monta cascada
//                     completa Aplicación + Proceso + Lavado + Secado.
//
//            CASO B — `obligatorio:true` + svc CON variantes
//                     (Planchado M/L/XL en Botox):
//                     REQUIERE elección de variante. Si no llega en
//                     compsPorRef → construirFasesPack devuelve
//                     `faltanVariantes:[labels]` y crearPackReserva
//                     responde error de armado claro. El widget debería
//                     bloquear el botón RESERVAR antes (gating de
//                     `required` en getCatalogoReserva v1.0.27), pero el
//                     backend valida como defensa final.
//                     Se materializa con datos del comp (variante).
//                     SÍ suma al precioTotal (el cliente eligió talla).
//
//            CASO C — `obligatorio:false`
//                     (Tratamiento opcional, Corte como complemento):
//                     SOLO si el cliente la eligió (lo que ya hacía
//                     v1.0.28). Materializa con datos del comp.
//                     SÍ suma al precioTotal.
//
//          construirFasesPack devuelve ahora { fases, refsConsumidos,
//          faltanVariantes }. crearPackReserva chequea faltanVariantes
//          ANTES de continuar con sessions/insert.
//
//          PRECIO: el cálculo `precioTotal = principal.price +
//          compsParaPrecio.sum(price)` sigue intacto. Las fases del
//          CASO A NO aparecen en compsNorm (no llegaron del cliente)
//          y por tanto NO se suman; correcto por diseño. Los CASOS B
//          y C sí están en compsNorm y suman su precio normal.
//
//          serviciosDetail: igualmente solo refleja el principal + los
//          complementos elegidos por el cliente (compsParaPrecio). Las
//          fases del CASO A no aparecen aquí (son parte intrínseca del
//          pack, como antes Lavado/Secado en V1).
//
//          agregarServicioReserva (POST-creación): misma adaptación.
//          Sin compsPorRef, las fases CASO A se autoejecutan al añadir
//          el servicio adicional (correcto: si añades un Color suelto
//          POST-creación, Lavado/Secado entran solos). Las del CASO B
//          devolverían faltanVariantes y la operación falla con error
//          claro (no se puede añadir servicio adicional con variantes
//          obligatorias sin una capa de UI que pregunte la variante;
//          deuda conocida).
//
//          NO se toca: widgetPublicoLogic.web.js v0.7.4 (ya tenía el
//          comportamiento de "obligatorio bloquea sin variante" en la
//          UI; el wrapper crearReservaPublica delega aquí); editor
//          v1.13.0 (semántica del toggle OBLIG sigue siendo correcta).
//
// v1.0.28: 🩹 FIX CRÍTICO armado de cascada. Las fases tipo:'servicio' del
//          mapeoFases YA NO se materializan automáticamente. Su propósito
//          NUNCA fue ejecutarse solas; indican la POSICIÓN en la cascada
//          PARA EL CASO en que el cliente/staff elija ese complemento.
//
//          BUG (presente desde v1.0.7): construirFasesPack recorría
//          mapeoFases y para cada {tipo:'servicio', ref} hacía push de la
//          fase incondicionalmente. Resultado: un Tinte salía siempre con
//          Tratamiento + Corte + Peinado aunque el cliente no eligiera
//          ninguno. El bloque de "FUSIÓN" añadido en v1.0.23 no resolvía
//          la causa; solo evitaba el doble pintado cuando además se
//          elegía el complemento (y ajustaba precio/duración a la
//          variante). Pero las fases del mapeo NO elegidas se materializaban
//          igualmente.
//
//          FIX: construirFasesPack acepta ahora `compsPorRef` (Map de
//          setupUid → comp normalizado con su variante aplicada).
//            · aplicacion → SIEMPRE se materializa (es intrínseca).
//            · proceso    → SIEMPRE se materializa.
//            · servicio   → SOLO si su `ref` está en compsPorRef, y usa
//                           label/duración del comp (que ya tiene
//                           variante aplicada). Si no está → se omite
//                           (la fase del mapeo no existe en la cascada).
//          Devuelve también `refsConsumidos`: Set de setupUids que se
//          materializaron desde el mapeo, para que crearPackReserva
//          sepa cuáles NO encolar al final.
//
//          crearPackReserva:
//            · Construye `compsPorRef` antes de llamar a construirFasesPack.
//            · Elimina el bloque de FUSIÓN v1.0.23 (ya no hace falta:
//              la materialización en posición correcta sucede de una sola
//              pasada con los datos del comp).
//            · Elimina el recalculo del reloj post-fusión (no aplica).
//            · Encola al final solo los complementos cuyo setupUid NO
//              esté en refsConsumidos (= los que no son fase del mapeo).
//
//          PRECIO y DETALLE inalterados: precioTotal = principal +
//          TODOS los complementos elegidos. serviciosDetail incluye
//          principal + TODOS los complementos elegidos. Lo único que
//          cambia es la POSICIÓN de cada complemento en la cascada (si
//          tiene fase definida en mapeoFases, en esa posición; si no,
//          encolado al final).
//
//          agregarServicioReserva (v1.0.15): NO se le pasa compsPorRef;
//          consecuencia: al añadir POST-creación un servicio complejo
//          con cascada, ahora se materializa solo su aplicación +
//          procesos (las fases servicio quedan omitidas si no se eligen
//          complementos). Comportamiento coherente con la nueva regla.
//
//          NO se toca: marcarPagadoReserva, cancelarReserva, getReservasPorFecha,
//          getCatalogoReserva (el `required` v1.0.27 sigue válido como
//          gating de UI: marca al cliente/staff "tienes que elegir este
//          complemento antes de poder reservar", sin auto-materializar
//          nada). Widgets recepcionProCMS_widget y kamisuite-widget-bundle
//          ya envían complementosSetupUid correctamente; cero cambios en
//          ellos.
//
// v1.0.27: 🔧 OBLIGATORIEDAD por FASE explícita (separación de conceptos).
//          La regla deducida de v1.0.26 ("complemento es required si su
//          setupUid aparece como fase tipo:'servicio' en mapeoFases del
//          servicio principal") rompía Tinte/Mechas/Coloración: esos
//          servicios tienen Corte/Peinado/Tratamiento en su mapeoFases
//          ÚNICAMENTE para fijar la POSICIÓN en la cascada cuando el
//          cliente los añade, NO para obligarlos. La regla v1.0.26
//          confundía dos conceptos distintos (posición vs obligatoriedad).
//
//          CORRECCIÓN: cada fase tipo:'servicio' del mapeoFases admite
//          ahora un flag `obligatorio` (Boolean, default false). El flag
//          lo añade el editor de servicios (edicionservicios v1.13.0) en
//          un toggle visual por chip de fase. El backend solo lee el flag
//          tal cual.
//
//          getCatalogoReserva:
//          ANTES (v1.0.26):
//            required: uidsEnFasesEste.has(c.setupUid)
//                                                    ^ === true para cualquier
//                                                      fase en el mapeo
//          AHORA (v1.0.27):
//            required = busca la fase tipo:'servicio' del mapeoFases del
//                       principal cuyo ref === c.setupUid; lee !!fase.obligatorio.
//                       Si no hay fase coincidente o no tiene el flag → false.
//
//          Default false significa que TODAS las fases existentes en el
//          CMS (que aún no llevan el flag) pasan a OPCIONALES. Botox +
//          Planchado deja de ser obligatorio hasta que se entre al editor
//          de ese servicio y se marque la fase Planchado como obligatoria.
//          Decisión de Jal — Tinte/Mechas/Coloración son varios; Botox
//          es un caso. Menos clicks de migración con default false.
//
//          Cambio simétrico al de widgetPublicoLogic v0.7.4 (mismo
//          principio aplicado al widget público). El widget de Recepción
//          PRO (recepcionProCMS_widget v1.1.49) NO se toca: ya consume
//          `required` resuelto desde aquí. Toda la cadena hacia abajo
//          (validación del armado, fusión fase↔complemento, etc.) sigue
//          intacta.
//
// v1.0.25: 🎚️ VARIANTE del servicio PRINCIPAL en crearPackReserva.
//          Los servicios simple_variantes (Corte Mujer M/L/XL) NO aplicaban
//          el precio/duración de la variante elegida: se creaba la reserva
//          con el precio base (bug del widget: enviaba variantIdx pero no
//          la variante; el backend ni se enteraba). Ahora crearPackReserva
//          acepta `varianteSel { idx, label, price, duration }`: si llega,
//          trabaja sobre una COPIA del principal con el precio/duración de
//          la variante (sin mutar el catálogo cacheado) y el label la
//          refleja. Se propaga a precioTotal, fases (duración) y detalle.
//          Lo envía el widget recepcionProCMS v1.1.43. Opcional y
//          retrocompatible: sin varianteSel, precio/duración base.
//
// v1.0.24: 🏷️ FIX variantes "[object Object]" en Recepción PRO.
//          getCatalogoReserva devolvía las variantes en crudo
//          ({nombre, precio, duracion, tamano_estilo}), pero el widget las
//          pinta buscando v.label → al no existir, mostraba "[object
//          Object]" (bug preexistente, nunca probado con variantes en
//          Recepción PRO). Ahora se normaliza cada variante añadiendo
//          `label` (desde `nombre`), conservando precio/duracion/
//          tamano_estilo intactos. No toca el widget. Los complementos ya
//          funcionaban (se mapean a label en getCatalogoReserva).
//
// v1.0.23: 🔗 FUSIÓN fase↔complemento (no duplicar Planchado). Si un
//          complemento elegido coincide en setupUid con una FASE ya creada
//          desde mapeoFases, NO se añade bloque nuevo: esa fase adopta la
//          duración y label de la variante elegida, y el reloj de toda la
//          cascada se recalcula (la fase pudo cambiar de duración). El precio
//          de la variante SÍ se suma (la fase del mapeo no se cobraba). Los
//          complementos que no son fase del mapeo se encolan al final como
//          antes. Resuelve el doble pintado del planchado (fase + complemento).
//
// v1.0.22: 🧩 COMPLEMENTOS CON VARIANTE en crearPackReserva.
//          complementosSetupUid acepta ahora items en dos formas:
//            · string '<setupUid>'  → complemento simple (precio/duración
//              del catálogo) — comportamiento previo, retrocompatible.
//            · objeto { uid, varianteId, varianteLabel, price, duration }
//              → complemento con VARIANTE elegida (Planchado M/L/XL). Usa el
//              precio y duración de la VARIANTE, no el base. El label de la
//              fase y del serviciosDetail reflejan la variante.
//          Normalización única a compsNorm{setupUid,label,price,duration}
//          consumida por fases, precio total, serviciosDetail y title.
//          Lo alimenta widgetPublicoLogic.crearReservaPublica (v0.7.2) con
//          lo que envía el widget público (kamisuite-widget-bundle v2.0.13).
//          Sin impacto en el flujo de complementos string existente.
//
// v1.0.21: 🔢 ORDEN DE COLUMNAS por campo `order` de StaffConfig (CMS-first).
//          getStaffColumnas ordenaba ALFABÉTICAMENTE por displayName
//          (`localeCompare`) — herencia de Wix Bookings, que ordenaba por
//          nombre y que antaño se forzaba con prefijos A_/B_/C_ en el
//          canonicalName. Al renombrar empleados (quitar el prefijo) el
//          orden alfabético cambiaba y la vista parecía "resetearse":
//          CalendarViewSettings guarda color/posición por wixResourceId,
//          pero la posición POR DEFECTO que se asignaba a un staff sin
//          config previa venía del orden con que getStaffColumnas los
//          entregaba (alfabético) → al cambiar ese orden, se descolocaban.
//          AHORA: orden por `order` (Number) de StaffConfig, mismo patrón
//          que getCatalogoReserva. El orden alfabético y los prefijos
//          quedan abandonados. El widget sigue respetando la position
//          guardada en CalendarViewSettings (_getVisibleStaff) cuando el
//          usuario reordena. Requiere campo `order` (Number) poblado en
//          StaffConfig. Cambio mínimo: +order en el map, sort por order.
//          (El .replace del prefijo A_/B_/C_ se conserva inocuo por compat.)
//
// v1.0.20: 🚫 BLOQUEOS PERSISTENTES (vacaciones / almuerzos / descansos)
//          que sobreviven a recargas y son visibles para el widget público
//          de reservas (que ya consulta KamisuiteReservations).
//          ANTES: el widget guardaba bloqueos en memoria local
//                 (this._customBlocks) → se perdían al recargar y la web
//                 pública podía reservar en franjas bloqueadas → BUG GRAVE.
//          AHORA: cada bloqueo = una fila en KamisuiteReservations con:
//                   · family: 'BLOQUEO'
//                   · clientName: 'BLOQUEO:<motivo>'  (prefijo fijo para
//                                                     que el informe del
//                                                     día pueda filtrarlos)
//                   · fases: { items:[{ tipo:'bloqueo', ocupa:true,
//                                       label:<motivo>, start, end, dur }] }
//                   · status: 'CONFIRMADA'
//                   · precioTotal: 0, contactId: '', origenRecepcion:true
//          El motor de huecos público (widgetPublicoLogic.getHuecosDisponibles)
//          los ve como cualquier otra reserva ocupante → ya bloquea sin
//          tocar una sola línea de ese módulo.
//
//          3 funciones nuevas:
//            · crearBloqueo({ fechaISO, horaHHmm, duracionMin, staffId, motivo })
//                → inserta la fila y devuelve { ok, bloqueoId, ... }
//            · eliminarBloqueo({ id })
//                → LEE primero la fila y valida family === 'BLOQUEO' antes
//                  de borrar (defensa para que un id mal pasado nunca pueda
//                  borrar una cita real).
//            · actualizarBloqueo({ id, fechaISO?, horaHHmm?, duracionMin?, motivo? })
//                → READ-MERGE-UPDATE (NUNCA partial update sobre
//                  wixData.update). Mismo guard de family === 'BLOQUEO'.
//                  Cualquier parámetro omitido se mantiene como está.
//
//          IMPACTO COLATERAL CONTROLADO en getReservasPorFecha:
//          ningún cambio. Los bloqueos llegan al widget vía el mismo shape
//          que las reservas (family se devolvía ya en v1.0.13+).
//            · Cruce de productos (línea ~1061): filtra por contactId
//              `filter(Boolean)` → los bloqueos tienen contactId vacío y
//              NO entran. ✓
//            · Cruce de promo (línea ~1129): filtra por `f.tipo==='servicio'`
//              → la fase del bloqueo es `tipo:'bloqueo'` y NO entra. ✓
//          El widget se encarga de NO renderizar bloqueos como .ks-appt y
//          el informe del día filtra `clientName.startsWith('BLOQUEO:')`.
//
// v1.0.19: 🌈 DESCUENTO PROMOCIONAL POR SERVICIO — cruce con ServiceCatalog
//          dentro de `getReservasPorFecha` para que cada reserva devuelva:
//            · tienePromoServicio   (boolean)
//            · descuentoServicioTotal (number, suma del ahorro)
//            · serviciosPromo        (array de {setupUid, label,
//                                     precioOriginal, descuentoPromo, ahorro})
//
//          Lo consume el widget `recepcionProCMS_widget v1.1.38+` para
//          pintar el banner arco iris en el modal popup de la cita
//          (paridad V1 literal de kamisuite-agenda_2_2_9). NO toca el
//          cálculo de `precioTotal` ni `marcarPagadoReserva` ni el
//          descuento manual ad-hoc del operador.
//
//          REGLAS DURAS:
//            · `descuentoActivo` y `descuentoPromo` son INDEPENDIENTES en
//              el CMS. El descuento solo se aplica si descuentoActivo===true.
//              Si descuentoActivo=false con descuentoPromo=15 → NO se aplica.
//            · `descuentoPromo` se clampa a [0..100] al leer (admite null).
//            · UIDs duplicados en las fases solo cuentan una vez por reserva.
//            · UNA SOLA query extra al catálogo por llamada
//              (`hasSome('setupUid', uniqueUids)` con todos los UIDs de
//              todas las reservas del día).
//            · Si la query falla → cada reserva sale con los defaults
//              (tienePromoServicio:false, descuentoServicioTotal:0,
//              serviciosPromo:[]). No rompe la agenda.
//            · Solo se considera fase con `tipo === 'servicio'` Y `setupUid`
//              no vacío (skip PROCESO y `MEDIDA-<ts>` que no existen en
//              catálogo).
//            · Solo se incluye al array `serviciosPromo` cuando hay ahorro
//              real (precioOriginal > 0 y descuentoPromo > 0); si la fase
//              tiene precio 0 en catálogo (típico de aplicaciones internas
//              de cascada) no contribuye al ahorro total → no se
//              double-count.
//
//          Campos en `ServiceCatalog` (creados a mano por Jal anticipándose,
//          gestionados por `serviciosEdicionLogic v1.11.4+`):
//            · descuentoActivo (Boolean)
//            · descuentoPromo  (Number 0..100, admite null)
//
// v1.0.18: 🩹 FIX BUG 2 — crearPackReserva ahora dispara la CENTRALITA
//          DE COMUNICACIONES (email + WhatsApp) tras crear la reserva
//          en KamisuiteReservations. Hasta ahora V2 NUNCA notificaba al
//          cliente, porque solo el wrapper crearReservaPublica del widget
//          público lo hacía. Las citas creadas desde Recepción Pro V2
//          (95% del tráfico de KALONICE) salían silenciosas.
//
//          Llamada CONDICIONAL a `origenRecepcion`:
//            · origenRecepcion=true  (Recepción Pro) → notifica aquí.
//            · origenRecepcion=false (widget público) → NO notifica aquí;
//              el wrapper crearReservaPublica en widgetPublicoLogic v0.5.0
//              ya dispara la centralita desde su capa.
//          Cero riesgo de doble envío. La bandera origenRecepcion ya
//          existía desde v1.0.17, solo cambia su efecto.
//
//          Patrón copiado LITERAL del wrapper crearReservaPublica:
//          serviciosStr ← labelsPrincipales (ya construido para el title).
//          estilistaStr ← staffName del payload, con fallback a StaffConfig
//                          por wixResourceId si vino vacío.
//          fechaBonita ← DD/MM/YYYY.
//          horaFinal  ← horaHHmm + duracionTotal.
//          importeStr ← `${precioTotal}€`.
//          origen     ← 'Reserva' (V1 = Recepción Pro).
//          estadoPago ← 'Pago en salón'.
//
//          Envuelto en try/catch NO-BLOCKING: si la centralita falla, la
//          reserva ya está creada; el cliente simplemente no recibe la
//          notificación. Recepción Pro sigue su flujo normal.
//
//          Para clientes provisionales (esProvisional=true) finalContactId
//          es null → la centralita salta el email triggered (no hay
//          contactId) pero el WhatsApp sí sale si hay teléfono. Coherente.
//
//          Multi-tenant: cada salón configura su SalonConfig (templates,
//          waActive, emailActive...). La centralita decide. Si KALONICE
//          tiene waActive=false todavía, este cambio no envía nada hasta
//          que se active.
//
// v1.0.17: crearPackReserva acepta parámetro OPCIONAL `origenRecepcion`
//          (default true para retrocompatibilidad). El widget público
//          de reservas llama con `false` vía crearReservaPublica.
//          Distingue en KamisuiteReservations.origenRecepcion:
//            true  → cita creada desde Recepción Pro (operadores salón)
//            false → cita creada desde el widget público (clientes web)
//          Cambio puramente aditivo: cero impacto en código existente.
//
// v1.0.13: getReservasPorFecha ahora cruza con PaymentReservations para
//          asociar productos vendidos a su cita. Cada reserva devuelve
//          productosVendidos:[{nombre, cantidad, subtotal, metodoPago,
//          fechaPago, staff}]. Match heurístico por contactId + cercanía
//          temporal (venderProductosDesdeAgenda no graba reservaId en el
//          bookingId del producto). Si un cliente tiene varias reservas
//          el mismo día y compra un producto, se asocia al pack con
//          fechaReserva más cercana al fechaPago del producto.
//
// v1.0.12: NEW quitarItemReserva.
//          una línea individual del serviciosDetail del modal de cita
//          (botón ✕ junto a cada servicio en V2, igual que V1). Recalcula
//          precioTotal restando precio×cantidad de ese item. NO toca
//          fases ni duracionTotal por ahora (no descuadra el calendario).
//          Si solo queda 1 item → error "cancela la cita en su lugar".
//
// v1.0.11: FIX producto. La función agregarProductoReserva (v1.0.10)
//          consultaba la colección "Productos" — inexistente en este
//          tenant — y devolvía WD_SCHEMA_DOES_NOT_EXIST. ELIMINADA.
//          El widget llama ahora directamente a `venderProductosDesdeAgenda`
//          de `tiendaProductos.web` (función V1 que ya conoce el nombre
//          real de la colección y sus campos) vía el page code v1.0.10.
//          Los productos se registran como venta independiente vinculada
//          al packId (reservaId), igual que en V1 — no se inflan en el
//          precioTotal de la reserva.
//
// v1.0.10: ANTES DE COBRAR — 4 funciones nuevas para enriquecer la cita
//          sin generar pago. Todas READ-MERGE-UPDATE de KamisuiteReservations.
//          · NEW reprogramarReserva({reservaId, nuevaFechaISO})
//            Cambia fechaReserva y recalcula start/end de cada fase con
//            el delta. No toca precio.
//          · NEW agregarExtraReserva({reservaId, importe, descripcion})
//            Suma importe a precioTotal y añade item "[EXTRA] desc|imp|1"
//            al serviciosDetail.
//          · NEW agregarComplementoReserva({reservaId, setupUid})
//            Lee servicio del catálogo. Suma duracionTotal y precioTotal.
//            Añade fase {tipo:'servicio',ref,...,ocupa:true} al final del
//            array, con start = end de la última fase ocupante.
//          · NEW agregarProductoReserva({reservaId, productoId, cantidad})
//            Lee producto del CMS Productos. Suma precio×cant a precioTotal.
//            Añade "🛒 nombre|precio|cant" al detalle. No modifica fases
//            (los productos no ocupan tiempo).
//          · getReservasPorFecha ya devolvía todos los campos necesarios.
//
// v1.0.9: EXTENSIÓN de citas (drag del resize handle en el calendario).
//         · NEW extenderReserva({ reservaId, minutosExtra })
//           READ-MERGE-UPDATE de la fila en KamisuiteReservations,
//           escribe `extensionMin = Number(minutosExtra)`. Cero efectos
//           secundarios: no toca fases, sessions, pago. La duración
//           total visible en el calendario se calcula en el widget como
//           duracionTotal + extensionMin.
//         · NEW quitarExtension({ reservaId }) → extensionMin = 0.
//         · Persistencia en la propia fila (campo nuevo extensionMin,
//           type Number, default 0). Sin filas zombi: si se cancela
//           la reserva original, la extensión desaparece con ella.
//
// v1.0.8: Modelo cascada FILOSOFÍA LEGO completo.
//         · construirFasesPack reconoce 3 tipos de fase en mapeoFases:
//             {tipo:'aplicacion'}    → duración = principal.duration
//                                       label = principal.label
//                                       ocupa stylist
//             {tipo:'proceso'}       → duración = principal.minProceso
//                                       label = 'Proceso'
//                                       LIBERA stylist (no genera session)
//             {tipo:'servicio',ref}  → duración del servicio referenciado
//                                       (mismo flujo que v1.0.7)
//         · Compat LEGACY {tipo:'proceso',min:N}: usa min del item.
//         · Compat editor v1.11.4 (que NO guarda aplicacion explícita):
//           si mapeoFases no incluye tipo:aplicacion, se antepone al
//           inicio automáticamente. Cuando el editor permita reordenar
//           libremente y emita {tipo:'aplicacion'}, el fallback se
//           desactiva solo.
//         · Multi-tenant: cada salón configura su mapeoFases; las
//           duraciones se centralizan en el catálogo (principal.duration,
//           principal.minProceso, svc.duration por referencia).
// v1.0.7: Adoptar formato JSON envuelto en KamisuiteReservations y
//         lectura compatible para ServiceCatalog. Wix advierte (warning
//         amarillo) cuando un campo CMS contiene un array JSON directo
//         `[...]`. NO advierte cuando contiene un objeto `{...}`.
//         · ESCRITURA en KamisuiteReservations.fases:
//             antes  jsonOut(fasesPack)  → '[{...},...]'   ⚠️
//             ahora  wrapItems(fasesPack) → {items:[...]}  ✅
//         · ESCRITURA en KamisuiteReservations.sessionIds:
//             antes  jsonOut(ids)        → '["a","b"]'     ⚠️
//             ahora  wrapIds(ids)         → {ids:[...]}     ✅
//         · LECTURA defensiva: jsonIn(v, unwrapKey) acepta string JSON
//           legacy, array directo, o objeto envuelto {items|ids|<key>}.
//           Soporta filas legacy creadas con v1.0.6 sin migración.
//         · ServiceCatalog.complementos / .variantes / .mapeoFases:
//           lectura defensiva con unwrapKey 'items'. Jal está
//           restructurando filas a mano al nuevo formato; el backend
//           soporta ambos durante la transición.
// v1.0.6: NEW flag esProvisional en crearPackReserva. Si true, NO se crea
//         contacto en CRM (se salta ensureContactInCRM). Cliente
//         eventual de paso: solo se pide nombre, no recibe
//         comunicaciones (no tiene contactId), no ensucia CRM.
// v1.0.5.1: HOTFIX crearReservaMedida. madridToUTC devuelve string ISO,
//          no objeto Date; el código asumía Date y llamaba a .toISOString()
//          que rompía con "fechaReservaUTC.toISOString is not a function".
//          Fix: usar `new Date(isoStr)` para el campo CMS y devolver el
//          string ISO tal cual al cliente. Mismo patrón que crearPackReserva.
// v1.0.5: NEW crearReservaMedida — inserta una reserva STANDALONE en
//         KamisuiteReservations con family='medida' y claseServicio='medida'.
//         Sin sesiones de Wix Bookings (no necesita ancla, es una
//         entrada manual fuera de catálogo). NO escribe en
//         PaymentReservations: se cobra después abriendo la cita y
//         pulsando método de pago como cualquier otra reserva.
//         Permite pintar la cita "a medida" en calendario con su
//         hora, duración, staff y precio. setupUid 'MEDIDA-<ts>',
//         serviciosDetail '<descripcion>|<precio>' compatible con
//         el resto del flujo (lectura modal, descuento, cierre).
// v1.0.4: marcarPagadoReserva acepta 2 params OPCIONALES:
//         · importeNeto  (number)  → si se envía y es >=0, se graba en
//           importeTotal en lugar de registro.precioTotal. Permite cobrar
//           con descuento sin tocar el pack (se graba el NETO ya aplicado).
//         · descripcionExtra (string) → si se envía, se concatena al final
//           de la descripción auto-calculada. Pensado para el token
//           "🏷️ Descuento -X% (-Y€)" o cualquier nota adicional.
//         Cambios 100% backwards compatible: si no se mandan, el comportamiento
//         es idéntico al de v1.0.3.
// v1.0.2: NEW getStaffColumnas() — empleados reales desde StaffConfig
//         para las columnas del calendario. Excluye recursos internos
//         (CUALQUIERA, PROCESO) por nota/canonicalName.
//         FIX getCatalogoReserva — sin filtro por tipo (ver v1.0.1).
//
// PROPÓSITO:
//   Reserva manual de citas (bloque A, sin motor de disponibilidad)
//   sobre arquitectura CMS-first. Desacoplado de Wix Bookings como motor:
//   Wix Bookings solo aporta el SERVICIO DE ANCLAJE (wixAnclaId) cuyo
//   scheduleId recibe las sessions que pintan en el calendario.
//
//   Toda la lógica de servicios (precio, duración, fases, complementos)
//   vive en ServiceCatalog. SvMapeoServicios NO se usa.
//
// PATRÓN REUTILIZADO (literal):
//   - externosLogic.web.js v1.1.5: createSession EVENT+Blocked,
//     ensureContactInCRM, madridToUTC, marcarPagado→colección pagos.
//   - serviceCatalogLogic.web.js v1.1.0: query ServiceCatalog
//     (active + uso + suppressAuth).
//   - coloracionLogic v3.2.8: extractScheduleIdFromService.
//
// CONCEPTOS FUNDACIONALES RESPETADOS:
//   - PROCESO = hueco neutro: NO genera session, libera al stylist.
//   - Complementos al MISMO empleado que el principal.
//   - wixAnclaId resuelto por fila (NO hardcoded): es el serviceId del
//     servicio Bookings ancla de la familia. Se resuelve su scheduleId.
//   - Cascada = PACK de citas (varias sessions), no servicios Bookings.
//
// COLECCIONES:
//   - ServiceCatalog       (lectura: servicios, fases, complementos)
//   - KamisuiteReservations (escritura: el pack de reserva)
//   - PaymentReservations  (escritura: pago, bookingId = KRI_<_id>)
//
// FUNCIONES EXPORTADAS:
//   - getCatalogoReserva()          → servicios reservables + complementos
//   - crearPackReserva()            → resuelve fases, crea sessions, inserta pack
//   - getReservasPorFecha()         → packs del día (para pintar)
//   - marcarPagadoReserva()         → status PAGADO + insert PaymentReservations
//   - cancelarReserva()             → borra sessions + status CANCELADA
//
// NOTAS:
//   - Sessions API V1 (wix-bookings-backend) — migrar a V2 antes 30/06/2026.
//   - fases y sessionIds se guardan como JSON string (campo CMS tipo Text);
//     JSON.stringify de JS genera sin espacios → compatible con Wix Text.
// =====================================================

import { Permissions, webMethod } from 'wix-web-module';
import { elevate } from 'wix-auth';
import { sessions } from 'wix-bookings-backend';
import { services } from 'wix-bookings.v2';
import { contacts } from 'wix-crm-backend';
import wixData from 'wix-data';

const VERSION = '1.0.41';
const TAG = `[RecepcionPRO][${VERSION}]`;
const TIMEZONE = 'Europe/Madrid';

const CMS_CATALOGO = 'ServiceCatalog';
const CMS_RESERVAS = 'KamisuiteReservations';
const CMS_PAGOS = 'PaymentReservations';
const CMS_STAFF = 'StaffConfig';

// v1.0.31 — F4/F5: colecciones de Productos Custom
const CMS_VOUCHERS              = 'KamisuiteVouchers';
const CMS_PROMOCARDS            = 'KamisuitePromoCards';
const CMS_PROMOCAMPAIGNS        = 'KamisuitePromoCampaigns';
const CMS_VOUCHER_REDEMPTIONS   = 'KamisuiteVoucherRedemptions';
const CMS_PRIME                 = 'KamisuitePrimeMemberships';

// v1.0.31 — F4/F5: status strings (verificados contra voucherPublicLogic
// y bonosPromosPublicLogic en producción)
const STATUS_VOUCHER_ACTIVO     = 'ACTIVO';
const STATUS_VOUCHER_AGOTADO    = 'AGOTADO';
const STATUS_PROMOCARD_EMITIDA  = 'EMITIDA';
const STATUS_PROMOCARD_CANJEADA = 'CANJEADA';
const STATUS_PRIME_ACTIVA       = 'ACTIVA';

const USOS_VALIDOS = ['kamisuite', 'ambos'];
const PREFIJO_PAGO = 'KRI_'; // Kamisuite Reservations Internas

// v1.0.37 — Circuito de externos V2 (ledger separado, axioma 6).
const CMS_PAGOS_EXT   = 'PagoreservasExternos';
const PREFIJO_PAGO_EXT = 'EXT_'; // Externos (patrón externosLogic.marcarPagadoExterno v1.1.5)
// Recursos internos que NUNCA son columna del calendario (CUALQUIERA, PROCESO).
// Patrón legacy: marcados con notes = "RECURSO INTERNO - no mostrar en widget".
const NOTA_RECURSO_INTERNO = 'RECURSO INTERNO';

// =====================================================
// HELPERS
// =====================================================

function safeErr(e) {
  return { message: e?.message || String(e) };
}

function isGuid(x) {
  return typeof x === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
}

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// madridToUTC — idéntico a externosLogic v1.1.5 / coloracionLogic v3.2.8
function madridToUTC(fechaISO, horaHHmm) {
  const [year, month, day] = String(fechaISO).split('-').map(Number);
  const [hour, minute] = String(horaHHmm).split(':').map(Number);

  const d = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));

  const madridStr = d.toLocaleString('en-US', {
    timeZone: 'Europe/Madrid',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });

  const match = madridStr.match(/(\d+)\/(\d+)\/(\d+),\s*(\d+):(\d+)/);
  if (!match) return d.toISOString();

  const madridHour = parseInt(match[4]);
  const madridMin = parseInt(match[5]);

  const targetMin = hour * 60 + minute;
  const madridMin2 = madridHour * 60 + madridMin;
  const diffMin = targetMin - madridMin2;

  const utc = new Date(d.getTime() + (diffMin * 60000));
  return utc.toISOString();
}

function addMinutes(iso, mins) {
  const ms = new Date(iso).getTime();
  return new Date(ms + mins * 60000).toISOString();
}

function formatLocalTime(date) {
  return date.toLocaleTimeString('es-ES', {
    timeZone: TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
}

// extractScheduleIdFromService — idéntico a coloracionLogic v3.2.8
function extractScheduleIdFromService(serviceV2) {
  const candidates = [
    serviceV2?.scheduleId,
    serviceV2?.schedule?.id,
    serviceV2?.schedule?._id,
    serviceV2?.scheduling?.scheduleId,
    serviceV2?.availability?.scheduleId,
    serviceV2?.bookingPolicy?.scheduleId,
    serviceV2?.details?.scheduleId
  ].filter(v => typeof v === 'string' && v);
  return candidates[0] || null;
}

// JSON seguro para campo CMS.
// v1.0.7: Wix advierte cuando un campo (Text u Object) contiene un array
// JSON directo `[...]`. NO advierte cuando contiene un objeto `{...}`.
// Patrón estándar KAMISUITE: envolver listas en objeto con clave canónica:
//   - listas genéricas → { items: [...] }
//   - listas de identificadores → { ids: [...] }
// jsonIn es defensivo: acepta string JSON legacy, array directo, y objeto
// envuelto. Si pasas `unwrapKey`, devuelve el array de esa clave.
function jsonOut(obj) {
  try { return JSON.stringify(obj); } catch (e) { return '[]'; }
}
function jsonIn(v, unwrapKey) {
  if (v == null || v === '') return [];
  // Si llega como string, parsear primero
  if (typeof v === 'string') {
    try { v = JSON.parse(v); } catch (e) { return []; }
  }
  // Si es objeto envuelto con la clave canónica → devolver el array interior
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    if (unwrapKey && Array.isArray(v[unwrapKey])) return v[unwrapKey];
    // Tolerancia: si tiene cualquiera de las claves estándar, devolver
    if (Array.isArray(v.items)) return v.items;
    if (Array.isArray(v.ids))   return v.ids;
    return [];
  }
  // Array directo
  if (Array.isArray(v)) return v;
  return [];
}
// Helpers de escritura — formato sin warning de Wix
function wrapItems(arr) { return { items: Array.isArray(arr) ? arr : [] }; }
function wrapIds(arr)   { return { ids:   Array.isArray(arr) ? arr : [] }; }

// =====================================================
// RESOLUCIÓN DE ANCLA (wixAnclaId → scheduleId)
// Patrón: igual que externos usa el scheduleId del recurso/servicio.
// Aquí el ancla es el SERVICIO Bookings (wixAnclaId). Cache por ancla.
// =====================================================

const _scheduleCache = {}; // { [wixAnclaId]: scheduleId }

async function resolverScheduleIdAncla(wixAnclaId) {
  if (!wixAnclaId || !isGuid(wixAnclaId)) {
    console.warn(`${TAG} ⚠️ wixAnclaId inválido: ${wixAnclaId}`);
    return null;
  }
  if (_scheduleCache[wixAnclaId]) return _scheduleCache[wixAnclaId];

  try {
    const elevatedGet = elevate(services.getService);
    const svcResult = await elevatedGet(wixAnclaId);
    const svc = svcResult?.service || svcResult || {};

    const scheduleId = extractScheduleIdFromService(svc);
    if (scheduleId) {
      _scheduleCache[wixAnclaId] = scheduleId;
      console.log(`${TAG} ✅ Ancla ${wixAnclaId.substring(0, 8)} → schedule ${scheduleId.substring(0, 8)}`);
      return scheduleId;
    }

    console.error(`${TAG} ❌ Ancla ${wixAnclaId} sin scheduleId. Keys: ${Object.keys(svc).join(', ')}`);
    return null;

  } catch (e) {
    console.error(`${TAG} ❌ resolverScheduleIdAncla(${wixAnclaId}):`, e.message);
    return null;
  }
}

// =====================================================
// LECTURA DE CATÁLOGO (ServiceCatalog)
// Carga todos los servicios reservables + índice por setupUid
// para resolver fases (mapeoFases.ref) y complementos.
// =====================================================

async function cargarCatalogoCompleto() {
  const result = await wixData.query(CMS_CATALOGO)
    .eq('active', true)
    .hasSome('uso', USOS_VALIDOS)
    .limit(1000)
    .find({ suppressAuth: true });

  const items = result.items || [];
  const porSetupUid = {};

  for (const it of items) {
    if (it.setupUid) porSetupUid[it.setupUid] = it;
  }

  return { items, porSetupUid };
}

// =====================================================
// 1. GET CATÁLOGO RESERVA
// Servicios principales reservables + sus complementos compatibles.
// =====================================================
export const getCatalogoReserva = webMethod(
  Permissions.SiteMember,
  async () => {
    const t0 = Date.now();
    try {
      const { items, porSetupUid } = await cargarCatalogoCompleto();

      // TODOS los servicios activos son reservables. El rol (principal/
      // complemento/ambos) se conserva en `tipo`; el panel filtra por rol.
      // KALONICE usa tipo = principal|complemento|ambos (NO 'publico').
      const reservables = items
        .sort((a, b) => toNum(a.order) - toNum(b.order))
        .map(it => {
          // Resolver complementos compatibles desde setupUid.
          // v1.0.27 — cada complemento incluye ahora hasVariants + variantes
          // (con label normalizado) y `required`. La obligatoriedad ya NO
          // se deduce de "estar presente en mapeoFases" (regla v1.0.26 que
          // rompía Tinte/Mechas/Coloración — esas fases marcan posición en
          // la cascada, no obligación). Ahora se LEE el flag explícito
          // `obligatorio` (Boolean) de la fase tipo:'servicio' cuyo `ref`
          // coincide con el setupUid del complemento. Si no hay fase
          // coincidente o no tiene el flag → false. Misma regla simétrica
          // en widgetPublicoLogic v0.7.4. El flag lo añade el editor de
          // servicios (edicionservicios v1.13.0) con un toggle por chip.
          const mapeoEste = jsonIn(it.mapeoFases, 'items');
          const fasesPorRefEste = {};
          if (Array.isArray(mapeoEste)) {
            for (const f of mapeoEste) {
              if (f && f.tipo === 'servicio' && typeof f.ref === 'string' && f.ref) {
                fasesPorRefEste[f.ref] = f;
              }
            }
          }
          const compUids = jsonIn(it.complementos, 'items');

          // v1.0.36 — Set de uids que YA salen como opción dentro de algún
          // item tipo:'exclusivo' del mapeoFases del principal. Deben
          // excluirse del array `complementos` que se emite al widget
          // (Recepción PRO los pintará dentro del bloque "Grupos exclusivos"
          // como radio; verlos también como toggles sueltos duplica la UI).
          // Simetría con widgetPublicoLogic v0.7.6.
          const uidsEnExclusivosEste = new Set();
          if (Array.isArray(mapeoEste)) {
            for (const f of mapeoEste) {
              if (!f || f.tipo !== 'exclusivo' || !Array.isArray(f.refs)) continue;
              for (const r of f.refs) if (typeof r === 'string' && r) uidsEnExclusivosEste.add(r);
            }
          }

          const complementos = (Array.isArray(compUids) ? compUids : [])
            .filter(uid => !uidsEnExclusivosEste.has(uid))
            .map(uid => porSetupUid[uid])
            .filter(Boolean)
            // v1.0.35 — Filtro AUTO-MATERIALIZADOS (Caso A del motor).
            // Cuando un uid figura como fase tipo:'servicio' del mapeoFases
            // con `obligatorio:true` y en catálogo NO tiene variantes, el
            // motor (`construirFasesPack`) lo auto-materializa en su
            // posición sin necesidad de que el cliente/estilista elija
            // nada (rama Caso A: materializarConProceso con svc.label /
            // svc.duration). En consecuencia, no debe aparecer en la lista
            // de complementos que el widget muestra para elegir — pedir
            // "Lavado obligatorio" o "Secado obligatorio" al estilista en
            // Recepción PRO es absurdo cuando el motor ya se los cuela.
            // Los chips verdes obligatorios CON variantes (Caso B:
            // Botox+Planchado M/L/XL) SÍ deben seguir apareciendo, porque
            // el cliente/estilista debe elegir variante. Los opcionales
            // (Caso C) también siguen apareciendo, como siempre.
            .filter(c => {
              const fEste = fasesPorRefEste[c.setupUid];
              const casoA = fEste && fEste.obligatorio === true && !c.hasVariants;
              return !casoA;
            })
            .map(c => {
              const cVars = (Array.isArray(jsonIn(c.variantes, 'items')) ? jsonIn(c.variantes, 'items') : [])
                .map(v => (v && typeof v === 'object') ? { ...v, label: v.label || v.nombre || '' } : v);
              const faseEnMapeo = fasesPorRefEste[c.setupUid];
              return {
                setupUid: c.setupUid,
                label: c.label || '',
                price: toNum(c.price),
                duration: toNum(c.duration),
                hasVariants: !!c.hasVariants,
                variantes: cVars,
                required: !!(faseEnMapeo && faseEnMapeo.obligatorio === true)
              };
            });

          return {
            setupUid: it.setupUid || '',
            label: it.label || '',
            descripcion: it.descripcion || '',
            family: it.family || 'simple',
            group: it.group || '',
            tipo: it.tipo || 'publico',
            claseServicio: it.claseServicio || '',
            price: toNum(it.price),
            duration: toNum(it.duration),
            hasVariants: !!it.hasVariants,
            // v1.0.24 — Normalizar variantes para el widget de Recepción PRO.
            // El editor (serviciosEdicionLogic) las guarda como
            // {nombre, precio, duracion, tamano_estilo}, pero el widget las
            // pinta buscando v.label (que no existía → mostraba "[object
            // Object]"). Añadimos `label` (desde nombre) conservando TODOS
            // los campos originales (precio/duracion/tamano_estilo), para no
            // romper el resto de la cadena que los usa por índice.
            variantes: (Array.isArray(jsonIn(it.variantes, 'items')) ? jsonIn(it.variantes, 'items') : [])
              .map(v => {
                if (v && typeof v === 'object') {
                  return { ...v, label: v.label || v.nombre || '' };
                }
                return v;  // string legacy: se pinta tal cual
              }),
            image: it.image || null,
            wixAnclaId: it.wixAnclaId || '',
            complementos,
            // v1.0.36 — Exponer mapeoFases parseado al widget para que
            // Recepción PRO pueda pintar el bloque de "Grupos exclusivos"
            // (items tipo:'exclusivo' del mapeoFases). Antes solo se
            // consumía internamente en construirFasesPack; ahora el widget
            // lo necesita para renderizar el radio de opciones.
            // Se envía el array `items` (no la envoltura {items:[...]})
            // para simplificar el consumo en frontend.
            mapeoFases: Array.isArray(mapeoEste) ? mapeoEste : [],
            // v1.0.36 — minProceso al frontend, para uso futuro visual
            // (desdoble aplicación+proceso en la cascada informativa).
            // Aditivo, no altera comportamiento actual del widget.
            minProceso: toNum(it.minProceso),
            order: toNum(it.order)
          };
        });

      console.log(`${TAG} ✅ getCatalogoReserva: ${reservables.length} servicios. ${((Date.now() - t0) / 1000).toFixed(2)}s`);
      return { ok: true, version: VERSION, servicios: reservables };

    } catch (e) {
      console.error(`${TAG} ❌ getCatalogoReserva:`, e.message);
      return { ok: false, version: VERSION, error: safeErr(e), servicios: [] };
    }
  }
);

// =====================================================
// 1b. GET STAFF COLUMNAS
// Empleados reales para las columnas del calendario, desde StaffConfig.
// Excluye recursos internos (CUALQUIERA, PROCESO) por su nota.
// =====================================================

export const getStaffColumnas = webMethod(
  Permissions.SiteMember,
  async () => {
    const t0 = Date.now();
    try {
      const result = await wixData.query(CMS_STAFF)
        .eq('active', true)
        .limit(100)
        .find({ suppressAuth: true });

      const items = result.items || [];
      const staff = items
        .filter(it => {
          const notas = String(it.notes || '');
          // Excluir CUALQUIERA / PROCESO y cualquier recurso interno marcado
          if (notas.includes(NOTA_RECURSO_INTERNO)) return false;
          const canon = String(it.canonicalName || '').toUpperCase();
          if (canon === 'CUALQUIERA' || canon === 'PROCESO') return false;
          return true;
        })
        .map(it => ({
          wixResourceId: it.wixResourceId || it._id,
          wixScheduleId: it.wixScheduleId || '',
          displayName: (it.displayName || it.canonicalName || '')
            .replace(/^[A-Z]_/, ''),  // quita prefijo A_/B_/C_ de orden (legacy)
          isExternal: !!it.isExternal,
          profileImage: it.profileImage || '',
          order: toNum(it.order)
        }))
        // v1.0.21 — orden por campo `order` de StaffConfig (CMS-first),
        // NO alfabético. El orden alfabético era herencia de Wix Bookings
        // (que ordenaba por nombre, forzado antaño con prefijos A_/B_/C_).
        // Ahora el orden por defecto lo da `order`; una vez el usuario
        // reordena columnas, manda CalendarViewSettings.position en el
        // widget (_getVisibleStaff). Renombrar empleados ya no altera el orden.
        .sort((a, b) => toNum(a.order) - toNum(b.order));

      console.log(`${TAG} ✅ getStaffColumnas: ${staff.length} empleados. ${((Date.now() - t0) / 1000).toFixed(2)}s`);
      return { ok: true, version: VERSION, staff };

    } catch (e) {
      console.error(`${TAG} ❌ getStaffColumnas:`, e.message);
      return { ok: false, version: VERSION, error: safeErr(e), staff: [] };
    }
  }
);

// =====================================================
// v1.1.4 patrón: GARANTIZAR CONTACTO CRM
// Copiado de externosLogic v1.1.5 ensureContactInCRM.
// =====================================================

async function ensureContactInCRM(contactDetails, memberContactId) {
  if (memberContactId && isGuid(memberContactId)) return memberContactId;

  const firstName = contactDetails?.firstName || '';
  const lastName = contactDetails?.lastName || '';
  const email = contactDetails?.email || '';
  const phone = contactDetails?.phone || '';

  if (!firstName && !email && !phone) {
    console.warn(`${TAG} ⚠️ ensureContactInCRM: sin datos suficientes`);
    return null;
  }

  try {
    const contactInfo = {
      name: { first: firstName, last: lastName },
      emails: (email && email !== 'booking@hair-times.com') ? [{ email }] : [],
      phones: phone ? [{ phone }] : []
    };
    const elevatedCreate = elevate(contacts.createContact);
    const result = await elevatedCreate(contactInfo, { allowDuplicates: false, suppressAuth: true });
    const newId = result?.contact?._id || result?._id || null;
    if (newId) console.log(`${TAG} ✅ Contacto CRM asegurado: ${newId}`);
    return newId;
  } catch (e) {
    console.warn(`${TAG} ⚠️ ensureContactInCRM falló: ${e.message}`);
    return null;
  }
}

// =====================================================
// CONSTRUIR FASES DEL PACK (modelo CMS-first)
// Lee mapeoFases del servicio principal y construye la cascada respetando
// el orden literal del mapeo. v1.0.29:
//   - fase "aplicacion" → SIEMPRE se materializa (es la del propio principal,
//     ocupa al stylist, duración = principal.duration).
//   - fase "proceso"    → SIEMPRE se materializa, hueco neutro (NO genera
//     session, libera al stylist; solo desplaza el reloj).
//   - fase "servicio" con `obligatorio:true` y svc SIN variantes
//                       → AUTO-MATERIALIZA con datos del catálogo (Lavado,
//                         Secado en Color/Tratamiento). NO se cobra extra
//                         (precio embebido en el principal). NO aparece en
//                         serviciosDetail. UX: el salón no marca nada.
//   - fase "servicio" con `obligatorio:true` y svc CON variantes
//                       → REQUIERE elección (Planchado M/L/XL en Botox).
//                         Si no llega en compsPorRef → faltanVariantes
//                         acumula su label y crearPackReserva responde
//                         error. Si llega, materializa con datos del comp.
//   - fase "servicio" con `obligatorio:false`
//                       → SOLO si el cliente eligió ese complemento (ref
//                         en compsPorRef). Materializa con datos del comp.
//                         Si no se eligió → se omite (= comportamiento v1.0.28).
// Si mapeoFases vacío → servicio simple: una sola fase con el propio servicio.
// Devuelve { fases, refsConsumidos, faltanVariantes }.
// =====================================================

function construirFasesPack({ principal, porSetupUid, horaInicioISO, compsPorRef }) {
  const fases = [];
  let cursorISO = horaInicioISO;
  const refsConsumidos = new Set();
  const faltanVariantes = [];
  const compsMap = (compsPorRef instanceof Map) ? compsPorRef : new Map();

  const mapeo = jsonIn(principal.mapeoFases, 'items');

  // v1.0.34 — HELPER interno para materializar un servicio en la cascada
  // desdoblándolo en Aplicación + Proceso cuando svc.minProceso > 0.
  // Uniforme para Caso A/B/C y la nueva rama 'exclusivo'. Cero cambio de
  // comportamiento cuando el servicio no tiene minProceso.
  //
  //   svc          fila de ServiceCatalog (con .duration, .minProceso, etc.)
  //   fase         etiqueta de la fase de aplicación (ej. 'COMPLEMENTO',
  //                'INCLUIDA') para el bloque principal materializado.
  //   labelOverride  opcional, si el label a mostrar difiere del svc.label
  //                  (ej. Caso C con variante elegida usa comp.label ya
  //                  compuesto con "Peinado M").
  //   durOverride    opcional, si la duración difiere de svc.duration
  //                  (ej. Caso C con variante elegida usa comp.duration).
  const materializarConProceso = (svc, fase, labelOverride, durOverride) => {
    const durAp = (durOverride != null) ? toNum(durOverride) : toNum(svc.duration);
    const lab   = (labelOverride != null) ? labelOverride : (svc.label || '');
    const endApISO = addMinutes(cursorISO, durAp);
    fases.push({
      fase,
      tipo: 'servicio',
      setupUid: svc.setupUid || '',
      label: lab,
      start: cursorISO,
      end: endApISO,
      dur: durAp,
      ocupa: true
    });
    cursorISO = endApISO;
    // Desdoble: si el servicio tiene minProceso > 0, empujar bloque proceso.
    const mp = toNum(svc.minProceso);
    if (mp > 0) {
      const endProcISO = addMinutes(cursorISO, mp);
      fases.push({
        fase: 'PROCESO',
        tipo: 'proceso',
        setupUid: '',
        label: 'Proceso',
        start: cursorISO,
        end: endProcISO,
        dur: mp,
        ocupa: false
      });
      cursorISO = endProcISO;
    }
  };

  if (!Array.isArray(mapeo) || mapeo.length === 0) {
    // Servicio simple (único / variantes / complemento): una fase = el propio servicio
    const dur = toNum(principal.duration);
    const endISO = addMinutes(cursorISO, dur);
    fases.push({
      fase: 'SERVICIO',
      tipo: 'servicio',
      setupUid: principal.setupUid || '',
      label: principal.label || '',
      start: cursorISO,
      end: endISO,
      dur,
      ocupa: true
    });
    cursorISO = endISO;
    return { fases, refsConsumidos, faltanVariantes };
  }

  // Servicio complejo: recorrer mapeoFases en orden literal.
  // Compat con editor v1.11.4: si no hay aplicación explícita, anteponerla.
  const tieneAplicacionExplicita = mapeo.some(f => f && f.tipo === 'aplicacion');
  const recorrido = tieneAplicacionExplicita
    ? mapeo
    : [{ tipo: 'aplicacion' }, ...mapeo];

  for (const f of recorrido) {
    // — APLICACIÓN (el propio servicio principal aplicándose): SIEMPRE
    if (f?.tipo === 'aplicacion') {
      const dur = toNum(principal.duration);
      const endISO = addMinutes(cursorISO, dur);
      fases.push({
        fase: 'APLICACION',
        tipo: 'servicio',
        setupUid: principal.setupUid || '',
        label: principal.label || 'Aplicación',
        start: cursorISO,
        end: endISO,
        dur,
        ocupa: true
      });
      cursorISO = endISO;
      continue;
    }

    // — PROCESO (tiempo neutro): SIEMPRE, libera al stylist, no genera session
    if (f?.tipo === 'proceso') {
      // Compat legacy: si viene `min` en el item lo usamos; si no, leemos
      // minProceso del propio servicio principal.
      const dur = (f.min != null && !isNaN(toNum(f.min)) && toNum(f.min) > 0)
        ? toNum(f.min)
        : toNum(principal.minProceso);
      const endISO = addMinutes(cursorISO, dur);
      fases.push({
        fase: 'PROCESO',
        tipo: 'proceso',
        setupUid: '',
        label: 'Proceso',
        start: cursorISO,
        end: endISO,
        dur,
        ocupa: false
      });
      cursorISO = endISO;
      continue;
    }

    // v1.0.34 — CHIP ROJO: grupo exclusivo opcional. Cliente eligió UNO
    // de los refs (o ninguno). Si eligió alguno, materializar ese
    // servicio en esta posición (con desdoble si tiene minProceso).
    // Si no llegó ninguno de los refs como complemento, saltar.
    if (f?.tipo === 'exclusivo' && Array.isArray(f.refs) && f.refs.length > 0) {
      let refElegido = null;
      let compElegido = null;
      for (const r of f.refs) {
        const c = compsMap.get(r);
        if (c) { refElegido = r; compElegido = c; break; }
      }
      if (!refElegido) continue;

      const svc = porSetupUid[refElegido];
      if (!svc) {
        console.warn(`${TAG} ⚠️ Chip rojo ref no encontrado en catálogo: ${refElegido}`);
        continue;
      }
      // Precio/duración/label del comp normalizado (puede llevar variante).
      // Aplicación con datos del comp; proceso con minProceso del catálogo
      // del servicio referenciado.
      materializarConProceso(svc, 'COMPLEMENTO', compElegido.label, compElegido.duration);
      refsConsumidos.add(refElegido);
      continue;
    }

    // — SERVICIO referenciado: modelo trinario v1.0.29.
    if (f?.tipo === 'servicio' && f.ref) {
      const svc = porSetupUid[f.ref];
      if (!svc) {
        // ref huérfano (servicio borrado del catálogo). Omitir suavemente.
        console.warn(`${TAG} ⚠️ Fase ref no encontrada en catálogo: ${f.ref}`);
        continue;
      }
      const esObligatoria = (f.obligatorio === true);
      const comp = compsMap.get(f.ref);

      if (esObligatoria) {
        if (svc.hasVariants) {
          // CASO B: obligatoria con variantes (Planchado M/L/XL en Botox).
          // El cliente DEBE elegir variante. Si no llegó, acumulamos
          // el label y dejamos que crearPackReserva devuelva error.
          if (!comp) {
            faltanVariantes.push(svc.label || f.ref);
            continue;
          }
          // v1.0.34 — desdoble aplicación+proceso vía helper.
          materializarConProceso(svc, 'COMPLEMENTO', comp.label, comp.duration);
          refsConsumidos.add(f.ref);
        } else {
          // CASO A: obligatoria sin variantes (Lavado, Secado en Color/Tratamiento).
          // AUTO-MATERIALIZA con datos del catálogo. NO se cobra extra:
          // refsConsumidos.add evita que se encole otra vez al final si
          // por alguna razón llegara también en compsNorm (no debería).
          // Como no está en compsNorm, tampoco entra en compsParaPrecio
          // ni en serviciosDetail; su precio queda embebido en el principal.
          // v1.0.34 — desdoble aplicación+proceso vía helper. Para Lavado
          // y Secado (minProceso vacío) el helper no cambia comportamiento.
          materializarConProceso(svc, 'INCLUIDA', svc.label || '', svc.duration);
          refsConsumidos.add(f.ref);
        }
      } else {
        // CASO C: NO obligatoria. Solo si el cliente la eligió.
        if (!comp) continue;
        // v1.0.34 — desdoble aplicación+proceso vía helper.
        materializarConProceso(svc, 'COMPLEMENTO', comp.label, comp.duration);
        refsConsumidos.add(f.ref);
      }
    }
  }

  return { fases, refsConsumidos, faltanVariantes };
}

// =====================================================
// 2. CREAR PACK RESERVA
// Resuelve ancla + fases + complementos, crea sessions (solo las que
// ocupan), inserta el pack en KamisuiteReservations.
//
// payload:
//   fecha 'YYYY-MM-DD', horaHHmm 'HH:mm',
//   principalSetupUid, complementosSetupUid[] (opcional),
//   staffId, staffName, contactDetails{firstName,lastName,email,phone},
//   memberContactId (opcional), notas (opcional)
//
// BLOQUE A: reserva manual. NO valida disponibilidad. El salón decide.
// =====================================================

export const crearPackReserva = webMethod(
  Permissions.SiteMember,
  async (payload) => {
    const t0 = Date.now();
    try {
      const {
        fecha,
        horaHHmm,
        principalSetupUid,
        complementosSetupUid = [],
        staffId = '',
        staffName = '',
        contactDetails = {},
        memberContactId = '',
        notas = '',
        esProvisional = false,
        // v1.0.25 — Variante elegida del servicio PRINCIPAL (servicios
        // simple_variantes: Corte Mujer M/L/XL, etc.). El widget de Recepción
        // PRO la envía cuando el usuario elige una variante antes de armar.
        // Shape: { idx, label, price, duration }. Si llega, su precio y
        // duración SUSTITUYEN a los del principal base. Opcional: si no
        // llega, se usa el precio/duración base (comportamiento previo).
        varianteSel = null,
        // v1.0.17 — origen explícito de la reserva. Default true para
        // retrocompatibilidad: todas las llamadas existentes (Recepción Pro)
        // siguen creando con origenRecepcion=true sin cambios. El widget
        // público llama con origenRecepcion=false vía crearReservaPublica.
        origenRecepcion = true
      } = payload || {};

      if (!fecha || !horaHHmm || !principalSetupUid) {
        return { ok: false, version: VERSION, error: { message: 'Faltan fecha, horaHHmm o principalSetupUid' } };
      }

      // ─── 1. Cargar catálogo y localizar principal ───
      const { porSetupUid } = await cargarCatalogoCompleto();
      const principalBase = porSetupUid[principalSetupUid];
      if (!principalBase) {
        return { ok: false, version: VERSION, error: { message: `Servicio principal no encontrado: ${principalSetupUid}` } };
      }

      // v1.0.25 — Si llega varianteSel, trabajar sobre una COPIA del principal
      // con el precio/duración de la variante (NO mutar el objeto cacheado del
      // catálogo). El label refleja la variante para el detalle/título.
      let principal = principalBase;
      if (varianteSel && typeof varianteSel === 'object') {
        const vPrice = toNum(varianteSel.price);
        const vDur = toNum(varianteSel.duration);
        const vLabel = varianteSel.label ? String(varianteSel.label) : '';
        principal = {
          ...principalBase,
          price: vPrice,
          duration: vDur > 0 ? vDur : toNum(principalBase.duration),
          label: vLabel
            ? `${principalBase.label || ''} · ${vLabel}`.trim()
            : (principalBase.label || '')
        };
        console.log(`${TAG} 🎚️ Variante aplicada al principal: ${vLabel} | ${vPrice}€ | ${vDur}min`);
      }

      // ─── 2. Resolver ancla → scheduleId (por familia, desde la fila) ───
      const wixAnclaId = principal.wixAnclaId || '';
      const scheduleId = await resolverScheduleIdAncla(wixAnclaId);
      if (!scheduleId) {
        return { ok: false, version: VERSION, error: { message: `No se pudo resolver scheduleId del ancla ${wixAnclaId}` } };
      }

      // ─── 3. Garantizar contacto CRM (excepto si cliente provisional) ───
      // v1.0.6 — esProvisional: cliente eventual de paso, no se persiste en CRM.
      // contactId queda vacío → no recibe comunicaciones, no ensucia CRM.
      const finalContactId = esProvisional
        ? null
        : await ensureContactInCRM(contactDetails, memberContactId);

      // ─── 4. Normalizar complementos elegidos (con/sin variante) ───
      // v1.0.28 — Se normalizan ANTES de construir la cascada, porque el
      // armado necesita conocer los complementos elegidos para materializar
      // únicamente las fases tipo:'servicio' del mapeo cuyo ref llegue aquí.
      //
      // complementosSetupUid acepta dos formas:
      //   · string  '<setupUid>'                → complemento simple (bool).
      //     Precio/duración = los del catálogo.
      //   · objeto  { uid, varianteId, varianteLabel, price, duration }
      //                                          → complemento con VARIANTE
      //     elegida (Planchado M/L/XL). Precio/duración = los de la VARIANTE.
      const compArray = Array.isArray(complementosSetupUid) ? complementosSetupUid : [];
      const compsNorm = [];
      for (const item of compArray) {
        const esObj = item && typeof item === 'object';
        const uid = esObj ? item.uid : item;
        const c = porSetupUid[uid];
        if (!c) {
          console.warn(`${TAG} ⚠️ Complemento no encontrado: ${uid}`);
          continue;
        }
        if (esObj) {
          // Con variante: usar precio/duración/label de la variante.
          // v1.0.30 — Evitar label duplicado. Los widgets envían
          // `varianteLabel` ya con el label de la variante completo (que
          // suele incluir el nombre del servicio: "Peinado M",
          // "Tratamiento HairTimes"). Si concatenamos siempre quedaría
          // "Peinado Peinado M". Regla: si varianteLabel empieza por
          // c.label (case-insensitive, trimmed) usar solo varianteLabel.
          // En caso contrario (futuro: varianteLabel independiente como
          // "Talla XL"), concatenar normalmente "<label> <varianteLabel>".
          const cLabel = (c.label || '').trim();
          const vLabel = item.varianteLabel ? String(item.varianteLabel).trim() : '';
          let labelFinal;
          if (!vLabel) {
            labelFinal = cLabel;
          } else if (cLabel && vLabel.toLowerCase().startsWith(cLabel.toLowerCase())) {
            labelFinal = vLabel;
          } else {
            labelFinal = `${cLabel} ${vLabel}`.trim();
          }
          compsNorm.push({
            setupUid: c.setupUid || '',
            label: labelFinal,
            price: toNum(item.price),
            duration: toNum(item.duration)
          });
        } else {
          // Simple: datos del catálogo.
          compsNorm.push({
            setupUid: c.setupUid || '',
            label: c.label || '',
            price: toNum(c.price),
            duration: toNum(c.duration)
          });
        }
      }

      // Mapa setupUid → comp normalizado, consumido por construirFasesPack
      // para materializar las fases tipo:'servicio' del mapeo cuyo ref
      // coincida con un complemento elegido.
      const compsPorRef = new Map();
      for (const c of compsNorm) compsPorRef.set(c.setupUid, c);

      // ─── 5. Construir cascada (aplicación + proceso + comps elegidos en su posición) ───
      const startISO = madridToUTC(fecha, horaHHmm);
      const { fases: fasesPack, refsConsumidos, faltanVariantes } = construirFasesPack({
        principal,
        porSetupUid,
        horaInicioISO: startISO,
        compsPorRef
      });

      // v1.0.29 — Si quedaron fases obligatorias con variantes sin elegir,
      // abortar con error claro. El widget debería bloquear esto antes
      // (gating de `required` en getCatalogoReserva), pero el backend valida
      // como defensa final contra payloads incompletos.
      if (Array.isArray(faltanVariantes) && faltanVariantes.length > 0) {
        const lista = faltanVariantes.join(', ');
        console.warn(`${TAG} ⚠️ Faltan variantes obligatorias: ${lista}`);
        return {
          ok: false,
          version: VERSION,
          error: { message: `Falta elegir variante de: ${lista}` }
        };
      }

      // Cursor para encolar al final los complementos que NO son fase del mapeo.
      let cursorISO = fasesPack.length ? fasesPack[fasesPack.length - 1].end : startISO;

      // ─── 6. Encolar al final los complementos no consumidos por el mapeo ───
      // v1.0.28 — Reemplaza al bloque de FUSIÓN v1.0.23. Ya no hace falta
      // recalcular reloj ni mutar fases existentes: la materialización en
      // posición correcta sucede en construirFasesPack. Aquí solo añadimos
      // los complementos que NO tenían fase definida en el mapeoFases del
      // principal (su comportamiento natural: ir al final).
      for (const comp of compsNorm) {
        if (refsConsumidos.has(comp.setupUid)) continue;  // ya materializado en su posición
        const dur = comp.duration;
        const endISO = addMinutes(cursorISO, dur);
        fasesPack.push({
          fase: 'COMPLEMENTO',
          tipo: 'servicio',
          setupUid: comp.setupUid,
          label: comp.label,
          start: cursorISO,
          end: endISO,
          dur,
          ocupa: true
        });
        cursorISO = endISO;
      }

      // compsParaPrecio: TODOS los complementos elegidos (independiente de si
      // se materializaron en el mapeo o al final). Se usa para precioTotal,
      // serviciosDetail y title.
      const compsParaPrecio = compsNorm.map(c => ({ label: c.label, price: c.price }));

      if (fasesPack.length === 0) {
        return { ok: false, version: VERSION, error: { message: 'El pack no generó ninguna fase' } };
      }

      // ─── 7. Calcular totales (precio del catálogo / variante, nunca hardcoded) ───
      // Precio: principal + complementos (cada uno ya con su precio resuelto,
      // sea base o de variante). Las fases internas de cascada ya están
      // incluidas en el precio del principal (no se re-cobran).
      let precioTotal = toNum(principal.price);
      for (const comp of compsParaPrecio) {
        precioTotal += comp.price;
      }
      const duracionTotal = Math.round(
        (new Date(cursorISO).getTime() - new Date(startISO).getTime()) / 60000
      );

      // ─── 7. Crear sessions SOLO de las fases que ocupan ───
      // PROCESO no genera session (libera al stylist — concepto fundacional).
      const clientName = `${contactDetails?.firstName || ''} ${contactDetails?.lastName || ''}`.trim();
      const sessionIds = [];

      for (const f of fasesPack) {
        if (!f.ocupa) continue; // PROCESO: saltar

        const notesText = [
          `${f.label}`,
          clientName,
          contactDetails?.phone || '',
          staffName ? `Staff: ${staffName}` : ''
        ].filter(Boolean).join(' | ');

        const sessionInfo = {
          scheduleId,
          start: { timestamp: new Date(f.start) },
          end: { timestamp: new Date(f.end) },
          type: 'EVENT',
          tags: ['Blocked'],
          notes: notesText
        };

        try {
          const created = await sessions.createSession(sessionInfo, { suppressAuth: true });
          const sid = created?._id || created?.id || '';
          f.sessionId = sid;
          if (sid) sessionIds.push(sid);
          console.log(`${TAG} ✅ Session ${f.fase}: ${sid} | ${formatLocalTime(new Date(f.start))}`);
        } catch (sErr) {
          console.error(`${TAG} ❌ createSession ${f.fase}: ${sErr.message}`);
          // Continúa con el resto del pack; la fase queda sin sessionId.
        }
      }

      // ─── 8. serviciosDetail (formato externos: "Label|precio;;...") ───
      const detailParts = [`${principal.label}|${toNum(principal.price)}`];
      for (const comp of compsParaPrecio) {
        detailParts.push(`${comp.label}|${comp.price}`);
      }
      const serviciosDetail = detailParts.join(';;');

      // ─── 9. title legible ───
      const labelsPrincipales = [principal.label]
        .concat(compsParaPrecio.map(comp => comp.label).filter(Boolean));
      const title = `${labelsPrincipales.join(' + ')}${clientName ? ' — ' + clientName : ''}`;

      // ─── 10. Insertar pack en KamisuiteReservations ───
      const registro = {
        title,
        family: principal.family || 'simple',
        group: principal.group || '',   // v1.0.38 — categoría operativa del servicio principal (categoriza la reserva completa)
        wixAnclaId,
        fechaReserva: new Date(startISO),
        duracionTotal,
        clientName,
        clientPhone: contactDetails?.phone || '',
        clientEmail: contactDetails?.email || '',
        contactId: finalContactId || '',
        staffId: staffId || '',
        staffName: staffName || '',
        fases: wrapItems(fasesPack),       // v1.0.7 — {"items":[...]} sin warning
        sessionIds: wrapIds(sessionIds),   // v1.0.7 — {"ids":[...]} sin warning
        precioTotal,
        status: 'CONFIRMADA',
        serviciosDetail,
        notes: notas || '',
        origenRecepcion: !!origenRecepcion   // v1.0.17 — bool del payload (default true)
      };

      const inserted = await wixData.insert(CMS_RESERVAS, registro, { suppressAuth: true });
      const reservaId = inserted?._id || '';

      const elapsed = ((Date.now() - t0) / 1000).toFixed(2);
      console.log(`${TAG} ✅ Pack creado: ${reservaId} | ${fasesPack.length} fases | ${sessionIds.length} sessions | ${precioTotal}€ | ${elapsed}s`);

      // ─── 11. NOTIFICACIÓN VÍA CENTRALITA DE COMUNICACIONES (v1.0.18) ──
      // Solo si origenRecepcion=true (Recepción Pro). El widget público
      // (origenRecepcion=false) ya dispara la centralita desde su wrapper
      // crearReservaPublica en widgetPublicoLogic v0.5.0+, así que aquí no
      // se vuelve a invocar para evitar doble envío al mismo cliente.
      //
      // Envuelto en try/catch NO-BLOCKING: la reserva ya está creada; si
      // la centralita falla por cualquier motivo (token caducado, plantilla
      // rechazada, fallo de red, etc.) el cliente simplemente no recibe la
      // notificación. Recepción Pro sigue su flujo normal.
      if (origenRecepcion) {
        try {
          // 1) Nombre del servicio en lenguaje cliente. Usamos labelsPrincipales
          //    que ya construimos para el title (principal + complementos).
          const serviciosStr = labelsPrincipales.join(' + ') || principal.label || 'Tu cita';

          // 2) Nombre del estilista. Si staffName vino en el payload, lo usamos.
          //    Si no (por ejemplo cuando el operador deja staffName='' aunque
          //    staffId esté informado), resolvemos por StaffConfig.wixResourceId
          //    igual que hace el wrapper público (widgetPublicoLogic v0.5.0).
          let estilistaStr = staffName || '';
          if (!estilistaStr && staffId) {
            try {
              const rStaff = await wixData.query(CMS_STAFF)
                .eq('wixResourceId', staffId)
                .limit(1)
                .find({ suppressAuth: true });
              estilistaStr = rStaff.items?.[0]?.displayName
                          || rStaff.items?.[0]?.canonicalName
                          || '';
            } catch (_) { /* sin nombre, va sin */ }
          }

          // 3) Fecha bonita DD/MM/YYYY (formato V1 esperado por el driver
          //    WhatsApp y por las plantillas de email Wix).
          const [yy, mm2, dd] = String(fecha).split('-');
          const fechaBonita = `${dd}/${mm2}/${yy}`;

          // 4) Hora final = horaInicio + duracionTotal en minutos.
          const [hh, mi] = String(horaHHmm).split(':').map(Number);
          const endMin = hh * 60 + mi + duracionTotal;
          const eh = Math.floor(endMin / 60);
          const em = endMin % 60;
          const horaFinal = String(eh).padStart(2, '0') + ':' + String(em).padStart(2, '0');

          const importeStr = `${precioTotal}€`;
          // Origen 'Reserva' (V1) — distingue del 'Reserva Online' del widget.
          const origenStr = 'Reserva';
          // En Recepción Pro las citas no pagan online: el cobro se hace
          // después abriendo la cita y marcando método de pago. Coherente
          // con el flujo V1 actual.
          const estadoPagoStr = 'Pago en salón';

          // 5) Invocación a la centralita. Import dinámico para no acoplar
          //    el módulo en tiempo de carga del backend (mismo patrón que
          //    usa widgetPublicoLogic v0.5.0+).
          const { notificarConfirmacion } = await import('backend/comunicacionesLogic.web');
          await notificarConfirmacion({
            contactId:     finalContactId || memberContactId || '',
            email:         contactDetails?.email || '',
            telefono:      contactDetails?.phone || '',
            nombreCliente: clientName,
            fecha:         fechaBonita,
            hora:          horaHHmm,
            servicios:     serviciosStr,
            estilista:     estilistaStr,
            // emailVariables idénticas en estructura a las que usa V1
            // (simplesLogic v1.5.0 / coloracionLogic v3.2.7) para que el
            // template Wix existente reciba los mismos campos sin cambios.
            emailVariables: {
              Fecha:         fechaBonita,
              Nombre:        contactDetails?.firstName || '',
              Apellido:      contactDetails?.lastName || '',
              servicios:     serviciosStr,
              profesional:   estilistaStr,
              horaInicio:    horaHHmm,
              horaFinal:     horaFinal,
              importeTotal:  importeStr,
              origen:        origenStr,
              estadoPago:    estadoPagoStr
            }
          });
          console.log(`${TAG} ✅ Notificación via centralita disparada`);
        } catch (notifErr) {
          console.error(`${TAG} ⚠️ notificarConfirmacion (no-blocking): ${notifErr.message}`);
        }
      }
      // ─── fin centralita ──────────────────────────────────────────

      return {
        ok: true,
        version: VERSION,
        reservaId,
        sessionIds,
        fases: fasesPack,
        precioTotal,
        duracionTotal,
        contactId: finalContactId,
        tiempo: elapsed
      };

    } catch (e) {
      console.error(`${TAG} ❌ crearPackReserva:`, e.message);
      return { ok: false, version: VERSION, error: safeErr(e) };
    }
  }
);

// =====================================================
// 3. GET RESERVAS POR FECHA
// Devuelve los packs del día (para pintar en el calendario).
// Filtro por rango UTC ±3h y verificación exacta de fecha Madrid.
// =====================================================

export const getReservasPorFecha = webMethod(
  Permissions.SiteMember,
  async ({ fecha }) => {
    try {
      if (!fecha) return { ok: false, version: VERSION, error: { message: 'Falta fecha' }, reservas: [] };

      const startUTC = new Date(new Date(`${fecha}T00:00:00`).getTime() - 3 * 3600000);
      const endUTC = new Date(new Date(`${fecha}T23:59:59`).getTime() + 3 * 3600000);

      const result = await wixData.query(CMS_RESERVAS)
        .ge('fechaReserva', startUTC)
        .le('fechaReserva', endUTC)
        .ascending('fechaReserva')
        .limit(200)
        .find({ suppressAuth: true });

      const reservas = (result.items || []).filter(item => {
        if (!item.fechaReserva) return false;
        const d = new Date(item.fechaReserva);
        const madridDate = d.toLocaleDateString('en-CA', { timeZone: TIMEZONE });
        return madridDate === fecha;
      }).map(item => ({
        _id: item._id,
        title: item.title || '',
        family: item.family || '',
        wixAnclaId: item.wixAnclaId || '',
        fechaReserva: item.fechaReserva ? new Date(item.fechaReserva).toISOString() : '',
        duracionTotal: toNum(item.duracionTotal),
        clientName: item.clientName || '',
        clientPhone: item.clientPhone || '',
        clientEmail: item.clientEmail || '',
        contactId: item.contactId || '',
        staffId: item.staffId || '',
        staffName: item.staffName || '',
        fases: jsonIn(item.fases, 'items'),
        sessionIds: jsonIn(item.sessionIds, 'ids'),
        precioTotal: toNum(item.precioTotal),
        status: item.status || 'CONFIRMADA',
        serviciosDetail: item.serviciosDetail || '',
        notes: item.notes || '',
        origenRecepcion: item.origenRecepcion !== false,
        extensionMin: toNum(item.extensionMin),  // v1.0.9
        productosVendidos: [],                   // v1.0.13 — se rellena abajo
        tienePromoServicio: false,               // v1.0.19 — se rellena abajo si aplica
        descuentoServicioTotal: 0,               // v1.0.19 — suma del ahorro
        serviciosPromo: []                       // v1.0.19 — detalle de servicios con promo
      }));

      // v1.0.13 — Cruzar con productos vendidos del día asociados a cada
      // reserva por contactId + proximidad temporal. La función
      // venderProductosDesdeAgenda guarda el bookingId como UUID propio
      // (no referencia a la reserva), por eso se hace match heurístico:
      //   · descripcion empieza con 🛒
      //   · staff = TIENDA (o similar)
      //   · mismo contactId que la reserva
      //   · fechaPago dentro del día visualizado
      // Si un cliente tiene varias reservas el mismo día y compra un
      // producto, se asocia a la reserva con menor diferencia |fechaPago - fechaReserva|.
      try {
        const contactIdsDelDia = [...new Set(reservas.map(r => r.contactId).filter(Boolean))];
        if (contactIdsDelDia.length) {
          const pagosProd = await wixData.query('PaymentReservations')
            .ge('fechaPago', startUTC)
            .le('fechaPago', endUTC)
            .hasSome('contactId', contactIdsDelDia)
            .limit(500)
            .find({ suppressAuth: true });

          for (const pago of (pagosProd.items || [])) {
            const desc = String(pago.descripcion || '').trim();
            if (!desc.startsWith('🛒')) continue;  // solo productos
            const cid = pago.contactId;
            if (!cid) continue;
            // Reservas candidatas con el mismo contactId
            const candidatas = reservas.filter(r => r.contactId === cid);
            if (!candidatas.length) continue;
            // Elegir la candidata con menor delta temporal
            const fp = new Date(pago.fechaPago).getTime();
            let mejor = candidatas[0];
            let mejorDelta = Math.abs(fp - new Date(mejor.fechaReserva).getTime());
            for (let i = 1; i < candidatas.length; i++) {
              const dlt = Math.abs(fp - new Date(candidatas[i].fechaReserva).getTime());
              if (dlt < mejorDelta) { mejor = candidatas[i]; mejorDelta = dlt; }
            }
            // Parsear nombre + precio + cantidad
            const m = desc.match(/^🛒\s*(.+?)\s*\(\s*([\d.,]+)\s*€?\s*\)\s*$/);
            if (!m) continue;
            let nombre = m[1].trim();
            const subtotal = parseFloat(m[2].replace(',', '.')) || 0;
            let cantidad = 1;
            const qty = nombre.match(/^(.+?)\s+x(\d+)\s*$/i);
            if (qty) { nombre = qty[1].trim(); cantidad = parseInt(qty[2], 10) || 1; }
            mejor.productosVendidos.push({
              paymentId: pago._id,
              nombre,
              cantidad,
              subtotal: Math.round(subtotal * 100) / 100,
              metodoPago: pago.tipoPago || '',
              fechaPago: pago.fechaPago ? new Date(pago.fechaPago).toISOString() : '',
              staff: pago.staff || ''
            });
          }
        }
      } catch (eProd) {
        console.warn(`${TAG} ⚠ cruce productos:`, eProd.message);
      }

      const totalProdVend = reservas.reduce((s, r) => s + r.productosVendidos.length, 0);

      // v1.0.19 — Cruce con ServiceCatalog para detectar descuento
      // promocional por servicio. UNA SOLA query con `hasSome('setupUid',
      // uniqueUids)` que reúne todos los setupUids de fases (tipo='servicio')
      // de TODAS las reservas del día. Por cada reserva, se itera su set
      // de UIDs únicos y se calcula:
      //   ahorro = precioOriginal × descuentoPromo / 100
      // Reglas duras (ver cabecera v1.0.19):
      //   · Solo si descuentoActivo === true (estricto).
      //   · descuentoPromo clampado a [0..100] (admite null).
      //   · UIDs duplicados por reserva → cuentan una vez (Set).
      //   · precioOriginal=0 (cascadas internas, MEDIDA, etc.) → no contribuye.
      //   · Si la query falla, los 3 campos por defecto (false/0/[]) ya están
      //     puestos arriba en el .map() → la agenda no se rompe.
      try {
        const setupUidsAll = new Set();
        for (const r of reservas) {
          const fasesArr = Array.isArray(r.fases) ? r.fases : [];
          for (const f of fasesArr) {
            if (f && f.tipo === 'servicio' && typeof f.setupUid === 'string' && f.setupUid) {
              setupUidsAll.add(f.setupUid);
            }
          }
        }

        if (setupUidsAll.size > 0) {
          const uidsArr = [...setupUidsAll];
          const catRes = await wixData.query(CMS_CATALOGO)
            .hasSome('setupUid', uidsArr)
            .limit(1000)
            .find({ suppressAuth: true });

          // Índice setupUid → {label, price, descuentoActivo, descuentoPromo (clampado)}
          const promoIdx = {};
          for (const it of (catRes.items || [])) {
            if (!it.setupUid) continue;
            const rawPromo = Number(it.descuentoPromo);
            const promoClamp = Number.isFinite(rawPromo)
              ? Math.min(100, Math.max(0, rawPromo))
              : 0;
            promoIdx[it.setupUid] = {
              label: it.label || '',
              price: toNum(it.price),
              descuentoActivo: it.descuentoActivo === true,
              descuentoPromo: promoClamp
            };
          }

          // Aplicar a cada reserva con UIDs únicos por reserva
          for (const r of reservas) {
            const uids = new Set();
            const fasesArr = Array.isArray(r.fases) ? r.fases : [];
            for (const f of fasesArr) {
              if (f && f.tipo === 'servicio' && typeof f.setupUid === 'string' && f.setupUid) {
                uids.add(f.setupUid);
              }
            }
            const serviciosPromo = [];
            let descuentoServicioTotal = 0;
            for (const uid of uids) {
              const info = promoIdx[uid];
              if (!info) continue;                       // no en catálogo (MEDIDA, borrado, etc.)
              if (!info.descuentoActivo) continue;       // toggle apagado → no aplica
              if (info.descuentoPromo <= 0) continue;    // sin porcentaje útil
              if (info.price <= 0) continue;             // sin precio base → ahorro 0
              const ahorro = Math.round(info.price * info.descuentoPromo / 100 * 100) / 100;
              if (ahorro <= 0) continue;
              serviciosPromo.push({
                setupUid: uid,
                label: info.label,
                precioOriginal: info.price,
                descuentoPromo: info.descuentoPromo,
                ahorro
              });
              descuentoServicioTotal += ahorro;
            }
            if (serviciosPromo.length > 0) {
              r.serviciosPromo = serviciosPromo;
              r.descuentoServicioTotal = Math.round(descuentoServicioTotal * 100) / 100;
              r.tienePromoServicio = true;
            }
          }
        }
      } catch (ePromo) {
        // No-blocking: cada reserva conserva sus defaults (false/0/[])
        console.warn(`${TAG} ⚠ cruce promo (no-blocking):`, ePromo.message);
      }

      const promoCount = reservas.filter(r => r.tienePromoServicio).length;
      console.log(`${TAG} ✅ getReservasPorFecha ${fecha}: ${reservas.length} packs, ${totalProdVend} productos vinculados, ${promoCount} con descuento promocional`);
      return { ok: true, version: VERSION, reservas };

    } catch (e) {
      console.error(`${TAG} ❌ getReservasPorFecha:`, e.message);
      return { ok: false, version: VERSION, error: safeErr(e), reservas: [] };
    }
  }
);

// =====================================================
// 4. MARCAR PAGADO RESERVA
// status PAGADO + insert en PaymentReservations (patrón externos/tienda).
// bookingId = KRI_<reservaId>. Anti-duplicado por bookingId.
// =====================================================

export const marcarPagadoReserva = webMethod(
  Permissions.SiteMember,
  async ({ reservaId, metodoPago, desglosemetodopago, importeNeto, descripcionExtra }) => {
    try {
      if (!reservaId) {
        return { ok: false, version: VERSION, error: { message: 'Falta reservaId' } };
      }

      let registro;
      try {
        registro = await wixData.get(CMS_RESERVAS, reservaId, { suppressAuth: true });
      } catch (e) {
        return { ok: false, version: VERSION, error: { message: `Reserva no encontrada: ${reservaId}` } };
      }
      if (!registro) {
        return { ok: false, version: VERSION, error: { message: `Reserva no encontrada: ${reservaId}` } };
      }

      if (registro.status === 'PAGADO') {
        console.warn(`${TAG} ⚠️ Ya estaba PAGADO: ${reservaId}`);
        return { ok: true, version: VERSION, yaEstabaPagado: true };
      }

      // 1. Actualizar status (READ-MERGE-UPDATE: registro completo ya leído)
      registro.status = 'PAGADO';
      await wixData.update(CMS_RESERVAS, registro, { suppressAuth: true });
      console.log(`${TAG} ✅ KamisuiteReservations → PAGADO`);

      // v1.0.37 — Determinar si el staff de la reserva es EXTERNO.
      //   Lookup por StaffConfig.wixResourceId con el patrón ya usado en
      //   este mismo archivo (crearPackReserva, resolución de estilista).
      //   Fallback seguro: si el lookup falla o no encuentra staff, se
      //   comporta como interno (isExternal=false) → nunca peor que hoy.
      let esExterno = false;
      try {
        if (registro.staffId) {
          const rStaff = await wixData.query(CMS_STAFF)
            .eq('wixResourceId', registro.staffId)
            .limit(1)
            .find({ suppressAuth: true });
          esExterno = !!rStaff.items?.[0]?.isExternal;
        }
      } catch (staffErr) {
        console.warn(`${TAG} ⚠️ Lookup isExternal falló, se trata como interno: ${staffErr.message}`);
      }

      // v1.0.37 — Datos comunes a ambas ramas (se calculan una sola vez).
      const ahora = new Date();

      // Descripción legible desde serviciosDetail (idéntica en ambas ramas)
      let descripcion = '';
      if (registro.serviciosDetail) {
        descripcion = registro.serviciosDetail.split(';;').filter(Boolean).map(s => {
          const [name, price] = s.split('|');
          return `${name || '?'} (${price || 0}€)`;
        }).join(', ');
      } else {
        descripcion = registro.title || 'Servicio salón';
      }

      // v1.0.4 — concatenar descripcionExtra (token descuento o cualquier nota)
      if (descripcionExtra && String(descripcionExtra).trim()) {
        descripcion = descripcion ? `${descripcion}, ${String(descripcionExtra).trim()}` : String(descripcionExtra).trim();
      }

      // v1.0.4 — usar importeNeto si llega y es válido (>=0); si no, precioTotal del registro
      const importeFinal = (importeNeto != null && !isNaN(Number(importeNeto)) && Number(importeNeto) >= 0)
        ? Number(importeNeto)
        : toNum(registro.precioTotal);

      if (esExterno) {
        // ─── RAMA EXTERNA (axioma 6) ───────────────────────────────────
        // Ledger en PagoreservasExternos (EXT_<id>). Patrón literal
        // replicado de externosLogic.marcarPagadoExterno v1.1.5: mismos
        // 8 field IDs (bookingId, descripcion, fechaPago, fechaReserva,
        // importeTotal, nombreCliente, staff, tipoPago). Esta colección NO
        // tiene contactId ni desglosemetodopago en su schema, así que no
        // se escriben (verificado en KamisuiteIds_ALL_fieldIDs_2.csv).
        try {
          const bookingIdKeyExt = `${PREFIJO_PAGO_EXT}${reservaId}`;

          const existenteExt = await wixData.query(CMS_PAGOS_EXT)
            .eq('bookingId', bookingIdKeyExt)
            .limit(1)
            .find({ suppressAuth: true });

          if (existenteExt.items.length > 0) {
            console.warn(`${TAG} ⚠️ PagoreservasExternos ya tiene: ${bookingIdKeyExt}`);
          } else {
            const registroPagoExt = {
              bookingId: bookingIdKeyExt,
              descripcion,
              fechaPago: ahora,
              fechaReserva: registro.fechaReserva || ahora,
              importeTotal: importeFinal,
              nombreCliente: registro.clientName || 'Cliente',
              staff: registro.staffName || '',
              tipoPago: metodoPago || 'Efectivo'
            };

            await wixData.insert(CMS_PAGOS_EXT, registroPagoExt, { suppressAuth: true });
            console.log(`${TAG} ✅ PagoreservasExternos insertado: ${bookingIdKeyExt} | ${registroPagoExt.importeTotal}€ | ${metodoPago}`);
          }
        } catch (payExtErr) {
          console.warn(`${TAG} ⚠️ Error PagoreservasExternos: ${payExtErr.message}`);
        }
      } else {
        // ─── RAMA INTERNA (axioma 5) — código actual EXACTO ────────────
        // Insert en PaymentReservations (anti-duplicado por bookingId)
        try {
          const bookingIdKey = `${PREFIJO_PAGO}${reservaId}`;

          const existente = await wixData.query(CMS_PAGOS)
            .eq('bookingId', bookingIdKey)
            .limit(1)
            .find({ suppressAuth: true });

          if (existente.items.length > 0) {
            console.warn(`${TAG} ⚠️ PaymentReservations ya tiene: ${bookingIdKey}`);
          } else {
            const registroPago = {
              bookingId: bookingIdKey,
              contactId: registro.contactId || '',
              descripcion,
              fechaReserva: registro.fechaReserva || ahora,
              fechaPago: ahora,
              importeTotal: importeFinal,
              nombreCliente: registro.clientName || 'Cliente',
              staff: registro.staffName || '',
              tipoPago: metodoPago || 'Efectivo',
              desglosemetodopago: desglosemetodopago || ''
            };

            await wixData.insert(CMS_PAGOS, registroPago, { suppressAuth: true });
            console.log(`${TAG} ✅ PaymentReservations insertado: ${bookingIdKey} | ${registroPago.importeTotal}€ | ${metodoPago}`);
          }
        } catch (payErr) {
          console.warn(`${TAG} ⚠️ Error PaymentReservations: ${payErr.message}`);
        }
      }

      return { ok: true, version: VERSION, reservaId, metodoPago, esExterno };

    } catch (e) {
      console.error(`${TAG} ❌ marcarPagadoReserva:`, e.message);
      return { ok: false, version: VERSION, error: safeErr(e) };
    }
  }
);

// =====================================================
// 5. CANCELAR RESERVA
// Borra las sessions del pack + status CANCELADA.
// =====================================================

export const cancelarReserva = webMethod(
  Permissions.SiteMember,
  async ({ reservaId }) => {
    try {
      if (!reservaId) {
        return { ok: false, version: VERSION, error: { message: 'Falta reservaId' } };
      }

      let registro;
      try {
        registro = await wixData.get(CMS_RESERVAS, reservaId, { suppressAuth: true });
      } catch (e) {
        return { ok: false, version: VERSION, error: { message: `Reserva no encontrada: ${reservaId}` } };
      }
      if (!registro) {
        return { ok: false, version: VERSION, error: { message: `Reserva no encontrada: ${reservaId}` } };
      }

      // 1. Borrar sessions del calendario
      const sessionIds = jsonIn(registro.sessionIds, 'ids');
      let borradas = 0;
      for (const sid of (Array.isArray(sessionIds) ? sessionIds : [])) {
        if (!sid) continue;
        try {
          await sessions.deleteSession(sid, { suppressAuth: true });
          borradas++;
        } catch (sErr) {
          console.warn(`${TAG} ⚠️ No se pudo borrar session ${sid}: ${sErr.message}`);
        }
      }

      // 2. status CANCELADA (READ-MERGE-UPDATE)
      registro.status = 'CANCELADA';
      await wixData.update(CMS_RESERVAS, registro, { suppressAuth: true });

      console.log(`${TAG} ✅ Reserva ${reservaId} CANCELADA | ${borradas} sessions borradas`);
      return { ok: true, version: VERSION, reservaId, sessionesBorradas: borradas };

    } catch (e) {
      console.error(`${TAG} ❌ cancelarReserva:`, e.message);
      return { ok: false, version: VERSION, error: safeErr(e) };
    }
  }
);

// =====================================================
// 6. CREAR RESERVA A MEDIDA (servicio fuera de catálogo)  v1.0.5
//   Inserta una fila standalone en KamisuiteReservations con family='medida'.
//   No crea sessions en Wix Bookings (no hay ancla).
//   No escribe en PaymentReservations (se cobra luego, como cualquier cita).
// =====================================================

export const crearReservaMedida = webMethod(
  Permissions.SiteMember,
  async ({ fechaISO, horaHHmm, duracionMin, staffId, staffName, descripcion, precio, contactDetails, memberContactId }) => {
    try {
      if (!fechaISO) return { ok: false, version: VERSION, error: { message: 'Falta fechaISO' } };
      if (!horaHHmm) return { ok: false, version: VERSION, error: { message: 'Falta horaHHmm' } };
      if (!staffId)  return { ok: false, version: VERSION, error: { message: 'Falta staffId' } };
      const dur = toNum(duracionMin);
      if (!dur || dur < 5) return { ok: false, version: VERSION, error: { message: 'Duración inválida (mínimo 5 min)' } };
      const price = toNum(precio);
      if (price < 0) return { ok: false, version: VERSION, error: { message: 'Precio inválido' } };
      const desc = String(descripcion || '').trim();
      if (!desc) return { ok: false, version: VERSION, error: { message: 'Falta descripción' } };

      // Combinar fechaISO + horaHHmm en Madrid → UTC (mismo helper que el resto)
      // madridToUTC devuelve STRING ISO; para insertar al CMS hace falta Date.
      const fechaReservaISO = madridToUTC(fechaISO, horaHHmm);
      if (!fechaReservaISO) return { ok: false, version: VERSION, error: { message: 'Fecha/hora inválida' } };

      const cd = contactDetails || {};
      const clientName = [cd.firstName || '', cd.lastName || ''].filter(Boolean).join(' ').trim() || 'Cliente';
      const clientPhone = cd.phone || '';
      const clientEmail = cd.email || '';

      const ts = Date.now();
      const registro = {
        title: desc,
        family: 'medida',
        group: 'MEDIDA',                // v1.0.38 — servicio fuera de catálogo: categoría propia
        claseServicio: 'medida',
        setupUid: 'MEDIDA-' + ts,
        wixAnclaId: '',
        fechaReserva: new Date(fechaReservaISO),
        duracionTotal: dur,
        precioTotal: price,
        clientName,
        clientPhone,
        clientEmail,
        contactId: memberContactId || '',
        staffId,
        staffName: staffName || '',
        fases: wrapItems([]),         // v1.0.7 — sin cascada
        sessionIds: wrapIds([]),      // v1.0.7 — sin sessions Wix Bookings
        serviciosDetail: `${desc}|${price}`,
        status: 'CONFIRMADA',
        notes: 'Servicio a medida (fuera de catálogo)',
        origenRecepcion: true
      };

      const inserted = await wixData.insert(CMS_RESERVAS, registro, { suppressAuth: true });
      console.log(`${TAG} ✅ Reserva a medida creada: ${inserted._id} | ${desc} | ${dur}min | ${price}€ | ${horaHHmm} | staff=${staffId}`);

      return {
        ok: true,
        version: VERSION,
        reservaId: inserted._id,
        fechaReserva: fechaReservaISO,
        duracionTotal: dur,
        precioTotal: price
      };

    } catch (e) {
      console.error(`${TAG} ❌ crearReservaMedida:`, e.message);
      return { ok: false, version: VERSION, error: safeErr(e) };
    }
  }
);

// =====================================================
// 6.5  BLOQUEOS PERSISTENTES  (v1.0.20)
//
//   Cada bloqueo = una fila en KamisuiteReservations con family='BLOQUEO'
//   y clientName con prefijo 'BLOQUEO:<motivo>' (convención fija para que
//   el informe del día pueda filtrarlos sin ambigüedad).
//
//   El widget Recepción PRO V2 los renderiza con el rayado diagonal
//   (.ks-customblock) y el widget público de reservas los ve a través
//   del motor `widgetPublicoLogic.getHuecosDisponibles` (que ya lee
//   KamisuiteReservations completo) — bloqueando automáticamente esas
//   franjas en la web pública sin tocar ese módulo.
//
//   IRON RULES:
//     · eliminarBloqueo y actualizarBloqueo SIEMPRE leen primero y validan
//       family === 'BLOQUEO'. Si la fila no es un bloqueo, abortan.
//       Protege contra ids mal pasados que pudieran borrar/modificar una
//       cita real.
//     · actualizarBloqueo hace READ-MERGE-UPDATE — wixData.update reemplaza
//       el documento entero, así que cualquier campo omitido en el merge
//       se perdería (regla dura del proyecto).
//     · suppressAuth: true para que la lectura/escritura funcione desde
//       el page code llamado por un SiteMember.
// =====================================================

export const crearBloqueo = webMethod(
  Permissions.SiteMember,
  async ({ fechaISO, horaHHmm, duracionMin, staffId, motivo }) => {
    try {
      if (!fechaISO) return { ok: false, version: VERSION, error: { message: 'Falta fechaISO' } };
      if (!horaHHmm) return { ok: false, version: VERSION, error: { message: 'Falta horaHHmm' } };
      if (!staffId)  return { ok: false, version: VERSION, error: { message: 'Falta staffId' } };
      const dur = toNum(duracionMin);
      if (!dur || dur < 5) return { ok: false, version: VERSION, error: { message: 'Duración inválida (mínimo 5 min)' } };

      const motivoLimpio = String(motivo || '').trim();
      const motivoFinal = motivoLimpio || 'Bloqueado';

      // Mismo helper que el resto del backend: combina YYYY-MM-DD + HH:MM
      // en hora Madrid y devuelve ISO UTC. Para insertar al CMS hace
      // falta `new Date(...)` (madridToUTC devuelve string).
      const startISO = madridToUTC(fechaISO, horaHHmm);
      if (!startISO) return { ok: false, version: VERSION, error: { message: 'Fecha/hora inválida' } };
      const endISO = addMinutes(startISO, dur);

      // Fase única que OCUPA la columna del staff durante toda la duración.
      // tipo='bloqueo' la mantiene fuera de los cruces de promo / productos
      // (que filtran por tipo='servicio' y por contactId no vacío).
      const fase = {
        fase: 'BLOQUEO',
        tipo: 'bloqueo',
        label: motivoFinal,
        start: startISO,
        end: endISO,
        dur,
        ocupa: true
      };

      const registro = {
        title: motivoFinal,
        family: 'BLOQUEO',
        group: 'BLOQUEO',               // v1.0.38 — no es actividad comercial; AKIRA ya lo excluye por family
        claseServicio: 'bloqueo',
        setupUid: 'BLOQ-' + Date.now(),
        wixAnclaId: '',
        fechaReserva: new Date(startISO),
        duracionTotal: dur,
        precioTotal: 0,
        clientName: 'BLOQUEO:' + motivoFinal,   // prefijo fijo
        clientPhone: '',
        clientEmail: '',
        contactId: '',
        staffId,
        staffName: '',
        fases: wrapItems([fase]),               // {items:[fase]}
        sessionIds: wrapIds([]),                // sin sessions Wix Bookings
        serviciosDetail: '',
        status: 'CONFIRMADA',
        notes: 'Bloqueo manual del calendario (vacaciones / almuerzo / descanso)',
        origenRecepcion: true
      };

      const inserted = await wixData.insert(CMS_RESERVAS, registro, { suppressAuth: true });
      console.log(`${TAG} 🚫 Bloqueo creado: ${inserted._id} | ${motivoFinal} | ${dur}min | ${horaHHmm} | staff=${staffId}`);

      return {
        ok: true,
        version: VERSION,
        bloqueoId: inserted._id,
        fechaReserva: startISO,
        duracionTotal: dur,
        motivo: motivoFinal,
        staffId
      };

    } catch (e) {
      console.error(`${TAG} ❌ crearBloqueo:`, e.message);
      return { ok: false, version: VERSION, error: safeErr(e) };
    }
  }
);

export const eliminarBloqueo = webMethod(
  Permissions.SiteMember,
  async ({ id }) => {
    try {
      if (!id) return { ok: false, version: VERSION, error: { message: 'Falta id' } };

      // GUARD: leer primero y validar family === 'BLOQUEO'.
      // NUNCA borrar si la fila no es un bloqueo (defensa contra ids mal
      // pasados que pudieran apuntar a una cita real).
      const reg = await wixData.get(CMS_RESERVAS, id, { suppressAuth: true });
      if (!reg) return { ok: false, version: VERSION, error: { message: 'Bloqueo no encontrado' } };
      if (reg.family !== 'BLOQUEO') {
        console.warn(`${TAG} ⚠️ eliminarBloqueo: intento de borrar fila con family='${reg.family}' (id=${id}) — BLOQUEADO`);
        return { ok: false, version: VERSION, error: { message: 'Esta fila no es un bloqueo' } };
      }

      await wixData.remove(CMS_RESERVAS, id, { suppressAuth: true });
      console.log(`${TAG} 🗑 Bloqueo eliminado: ${id}`);

      return { ok: true, version: VERSION, id };

    } catch (e) {
      console.error(`${TAG} ❌ eliminarBloqueo:`, e.message);
      return { ok: false, version: VERSION, error: safeErr(e) };
    }
  }
);

export const actualizarBloqueo = webMethod(
  Permissions.SiteMember,
  async ({ id, fechaISO, horaHHmm, duracionMin, motivo }) => {
    try {
      if (!id) return { ok: false, version: VERSION, error: { message: 'Falta id' } };

      // GUARD: mismo principio que eliminarBloqueo.
      const reg = await wixData.get(CMS_RESERVAS, id, { suppressAuth: true });
      if (!reg) return { ok: false, version: VERSION, error: { message: 'Bloqueo no encontrado' } };
      if (reg.family !== 'BLOQUEO') {
        console.warn(`${TAG} ⚠️ actualizarBloqueo: intento de actualizar fila con family='${reg.family}' (id=${id}) — BLOQUEADO`);
        return { ok: false, version: VERSION, error: { message: 'Esta fila no es un bloqueo' } };
      }

      // READ-MERGE-UPDATE: wixData.update reemplaza el documento entero.
      // Partimos del registro real y solo sobreescribimos los campos que
      // realmente cambien. Cualquier param omitido = se mantiene.
      const merged = { ...reg };

      // ¿Cambia fecha/hora o duración? Recalcular start/end de la fase.
      const cambioFecha = !!(fechaISO && horaHHmm);
      const cambioDur = (duracionMin != null);
      const cambioMotivo = (motivo != null);

      let startFinalISO = null;
      let durFinal = toNum(reg.duracionTotal);

      if (cambioFecha) {
        startFinalISO = madridToUTC(fechaISO, horaHHmm);
        if (!startFinalISO) return { ok: false, version: VERSION, error: { message: 'Fecha/hora inválida' } };
      } else {
        // sin cambio de fecha → conservar la existente
        startFinalISO = reg.fechaReserva ? new Date(reg.fechaReserva).toISOString() : null;
      }

      if (cambioDur) {
        const d = toNum(duracionMin);
        if (!d || d < 5) return { ok: false, version: VERSION, error: { message: 'Duración inválida (mínimo 5 min)' } };
        durFinal = d;
      }

      const motivoFinal = cambioMotivo
        ? (String(motivo).trim() || 'Bloqueado')
        : (reg.title || 'Bloqueado');

      // Si cambió cualquier cosa que afecte a la fase, reconstruir la fase única.
      if (cambioFecha || cambioDur || cambioMotivo) {
        if (!startFinalISO) return { ok: false, version: VERSION, error: { message: 'No se pudo determinar la fecha del bloqueo' } };
        const endFinalISO = addMinutes(startFinalISO, durFinal);

        merged.fechaReserva = new Date(startFinalISO);
        merged.duracionTotal = durFinal;

        const faseUnica = {
          fase: 'BLOQUEO',
          tipo: 'bloqueo',
          label: motivoFinal,
          start: startFinalISO,
          end: endFinalISO,
          dur: durFinal,
          ocupa: true
        };
        merged.fases = wrapItems([faseUnica]);
      }

      if (cambioMotivo) {
        merged.title = motivoFinal;
        merged.clientName = 'BLOQUEO:' + motivoFinal;
      }

      const updated = await wixData.update(CMS_RESERVAS, merged, { suppressAuth: true });
      console.log(`${TAG} ✏️ Bloqueo actualizado: ${id} | motivo='${motivoFinal}' | dur=${durFinal}min`);

      return {
        ok: true,
        version: VERSION,
        id,
        motivo: motivoFinal,
        duracionTotal: durFinal,
        fechaReserva: startFinalISO
      };

    } catch (e) {
      console.error(`${TAG} ❌ actualizarBloqueo:`, e.message);
      return { ok: false, version: VERSION, error: safeErr(e) };
    }
  }
);

// =====================================================
// 7. EXTENDER / QUITAR EXTENSIÓN (v1.0.9)
// =====================================================
// La extensión se persiste en el propio registro como campo extensionMin
// (type Number, default 0). El widget pinta un bloque rayado debajo del
// último bloque ocupante cuando extensionMin > 0.
// =====================================================

export const extenderReserva = webMethod(
  Permissions.SiteMember,
  async ({ reservaId, minutosExtra }) => {
    try {
      console.log(`${TAG} 📐 Extender reserva: ${reservaId} → +${minutosExtra} min`);
      if (!reservaId) return { ok: false, error: 'reservaId requerido' };
      const min = Math.max(0, Math.round(Number(minutosExtra) || 0));

      // READ
      const result = await wixData.query(CMS_RESERVAS)
        .eq('_id', reservaId).limit(1)
        .find({ suppressAuth: true });
      if (result.items.length === 0) {
        return { ok: false, error: 'Reserva no encontrada' };
      }
      const registro = result.items[0];

      // MERGE — solo extensionMin
      registro.extensionMin = min;

      // UPDATE
      await wixData.update(CMS_RESERVAS, registro, { suppressAuth: true });
      console.log(`${TAG} ✅ extensionMin actualizado a ${min} min en ${reservaId}`);

      return { ok: true, reservaId, extensionMin: min };
    } catch (e) {
      console.error(`${TAG} ❌ extenderReserva:`, e.message);
      return { ok: false, error: e.message };
    }
  }
);

export const quitarExtension = webMethod(
  Permissions.SiteMember,
  async ({ reservaId }) => {
    try {
      console.log(`${TAG} 🗑️ Quitar extensión de reserva: ${reservaId}`);
      if (!reservaId) return { ok: false, error: 'reservaId requerido' };

      const result = await wixData.query(CMS_RESERVAS)
        .eq('_id', reservaId).limit(1)
        .find({ suppressAuth: true });
      if (result.items.length === 0) {
        return { ok: false, error: 'Reserva no encontrada' };
      }
      const registro = result.items[0];
      registro.extensionMin = 0;
      await wixData.update(CMS_RESERVAS, registro, { suppressAuth: true });
      console.log(`${TAG} ✅ extensionMin = 0 en ${reservaId}`);

      return { ok: true, reservaId };
    } catch (e) {
      console.error(`${TAG} ❌ quitarExtension:`, e.message);
      return { ok: false, error: e.message };
    }
  }
);

// =====================================================
// 8. ANTES DE COBRAR (v1.0.10): reprogramar, extra, complemento, producto
// =====================================================
// Todas las funciones siguen patrón READ-MERGE-UPDATE de KamisuiteReservations.
// No tocan sessions de Wix Bookings. No generan pago. Solo modifican la fila
// de la reserva para que al cobrar se cobre el TOTAL ya actualizado.
// =====================================================

// ─── 8.1 Reprogramar reserva (cambiar fecha/hora) ─────────────
// Recalcula `fechaReserva` + start/end de cada fase aplicando el delta.
// No toca precio ni catálogo.
export const reprogramarReserva = webMethod(
  Permissions.SiteMember,
  async ({ reservaId, nuevaFechaISO }) => {
    try {
      console.log(`${TAG} 🗓 Reprogramar ${reservaId} → ${nuevaFechaISO}`);
      if (!reservaId || !nuevaFechaISO) return { ok: false, error: 'Faltan reservaId o nuevaFechaISO' };

      const result = await wixData.query(CMS_RESERVAS)
        .eq('_id', reservaId).limit(1)
        .find({ suppressAuth: true });
      if (result.items.length === 0) return { ok: false, error: 'Reserva no encontrada' };

      const registro = result.items[0];
      const oldDate = new Date(registro.fechaReserva);
      const newDate = new Date(nuevaFechaISO);
      if (isNaN(newDate.getTime())) return { ok: false, error: 'nuevaFechaISO inválida' };

      const deltaMs = newDate.getTime() - oldDate.getTime();
      registro.fechaReserva = newDate;

      // Recalcular fases con delta
      const fasesArr = jsonIn(registro.fases, 'items');
      const fasesNew = fasesArr.map(f => {
        const nf = { ...f };
        if (f.start) nf.start = new Date(new Date(f.start).getTime() + deltaMs).toISOString();
        if (f.end) nf.end = new Date(new Date(f.end).getTime() + deltaMs).toISOString();
        return nf;
      });
      registro.fases = { items: fasesNew };

      await wixData.update(CMS_RESERVAS, registro, { suppressAuth: true });
      console.log(`${TAG} ✅ Reprogramada ${reservaId}: ${oldDate.toISOString()} → ${newDate.toISOString()}`);
      return { ok: true, reservaId, fechaReserva: newDate.toISOString() };
    } catch (e) {
      console.error(`${TAG} ❌ reprogramarReserva:`, e.message);
      return { ok: false, error: e.message };
    }
  }
);

// ─── 8.2 Añadir cargo Extra (manual) ─────────────────────────
// Suma importe a precioTotal y añade item al serviciosDetail con marker.
// Formato del item: "[EXTRA] descripcion|importe|1"  (cant=1, cabe en parser V1)
export const agregarExtraReserva = webMethod(
  Permissions.SiteMember,
  async ({ reservaId, importe, descripcion }) => {
    try {
      const imp = Math.round((Number(importe) || 0) * 100) / 100;
      const desc = String(descripcion || 'Extra').trim();
      console.log(`${TAG} ✎ Extra en ${reservaId}: ${imp}€ "${desc}"`);
      if (!reservaId) return { ok: false, error: 'reservaId requerido' };
      if (!imp || imp <= 0) return { ok: false, error: 'Importe inválido (>0)' };

      const result = await wixData.query(CMS_RESERVAS)
        .eq('_id', reservaId).limit(1)
        .find({ suppressAuth: true });
      if (result.items.length === 0) return { ok: false, error: 'Reserva no encontrada' };

      const registro = result.items[0];
      registro.precioTotal = (Number(registro.precioTotal) || 0) + imp;

      const detalleActual = String(registro.serviciosDetail || '');
      const nuevoItem = `[EXTRA] ${desc}|${imp}|1`;
      registro.serviciosDetail = detalleActual ? `${detalleActual};;${nuevoItem}` : nuevoItem;

      await wixData.update(CMS_RESERVAS, registro, { suppressAuth: true });
      console.log(`${TAG} ✅ Extra añadido. precioTotal=${registro.precioTotal}€`);
      return { ok: true, reservaId, precioTotal: registro.precioTotal };
    } catch (e) {
      console.error(`${TAG} ❌ agregarExtraReserva:`, e.message);
      return { ok: false, error: e.message };
    }
  }
);

// ─── 8.3 Añadir Complemento (servicio del catálogo) ──────────
// Lee el complemento desde ServiceCatalog (por setupUid). Suma duracionTotal
// y precioTotal. Añade al detalle. Añade una fase {tipo:'servicio',ref} al
// FINAL del array de fases, con start = end de la última fase ocupante
// (si no hay ninguna ocupante, usa fechaReserva).
export const agregarComplementoReserva = webMethod(
  Permissions.SiteMember,
  async ({ reservaId, setupUid }) => {
    try {
      console.log(`${TAG} ⛓ Complemento en ${reservaId}: setupUid=${setupUid}`);
      if (!reservaId || !setupUid) return { ok: false, error: 'Faltan reservaId o setupUid' };

      // Reserva
      const r1 = await wixData.query(CMS_RESERVAS)
        .eq('_id', reservaId).limit(1)
        .find({ suppressAuth: true });
      if (r1.items.length === 0) return { ok: false, error: 'Reserva no encontrada' };
      const registro = r1.items[0];

      // Servicio complemento del catálogo
      const r2 = await wixData.query(CMS_CATALOGO)
        .eq('setupUid', setupUid).limit(1)
        .find({ suppressAuth: true });
      if (r2.items.length === 0) return { ok: false, error: 'Complemento no encontrado en catálogo' };
      const svc = r2.items[0];
      const svcDur = Number(svc.duration) || 0;
      const svcPrice = Number(svc.price) || 0;
      const svcLabel = svc.label || 'Complemento';

      // Calcular start de la nueva fase
      // v1.0.16 FIX: tomar MAX(end) de las fases ocupantes, no la última
      // del array. Con drag&drop una fase movida más tarde puede estar
      // en posición intermedia del array → tomar la última del array
      // hacía que el nuevo bloque cayera ENCIMA de fases ya movidas.
      const fasesArr = jsonIn(registro.fases, 'items');
      let startISO;
      const ocupantesConEnd = fasesArr.filter(f => f && f.ocupa && f.end);
      if (ocupantesConEnd.length) {
        const maxEndMs = ocupantesConEnd.reduce((max, f) => {
          const e = new Date(f.end).getTime();
          return isNaN(e) ? max : Math.max(max, e);
        }, 0);
        startISO = new Date(maxEndMs).toISOString();
      } else if (registro.fechaReserva) {
        const dur = Number(registro.duracionTotal) || 0;
        startISO = new Date(new Date(registro.fechaReserva).getTime() + dur * 60000).toISOString();
      } else {
        return { ok: false, error: 'No se puede calcular start del complemento' };
      }
      const endISO = new Date(new Date(startISO).getTime() + svcDur * 60000).toISOString();

      // Añadir fase al array
      fasesArr.push({
        fase: 'COMPLEMENTO',
        tipo: 'servicio',
        setupUid: svc.setupUid,
        label: svcLabel,
        start: startISO,
        end: endISO,
        dur: svcDur,
        ocupa: true
      });
      registro.fases = { items: fasesArr };
      registro.duracionTotal = (Number(registro.duracionTotal) || 0) + svcDur;
      registro.precioTotal = (Number(registro.precioTotal) || 0) + svcPrice;

      // Detalle (formato V1: nombre|precio|1)
      const detalleActual = String(registro.serviciosDetail || '');
      const nuevoItem = `${svcLabel}|${svcPrice}|1`;
      registro.serviciosDetail = detalleActual ? `${detalleActual};;${nuevoItem}` : nuevoItem;

      await wixData.update(CMS_RESERVAS, registro, { suppressAuth: true });
      console.log(`${TAG} ✅ Complemento añadido: ${svcLabel} (+${svcDur}min, +${svcPrice}€)`);
      return { ok: true, reservaId, label: svcLabel, duracionTotal: registro.duracionTotal, precioTotal: registro.precioTotal };
    } catch (e) {
      console.error(`${TAG} ❌ agregarComplementoReserva:`, e.message);
      return { ok: false, error: e.message };
    }
  }
);

// ─── 8.4.2 Servicio adicional (nuevo servicio principal en la cita) ──
// v1.0.15: añade un servicio principal NUEVO al final de la cita existente.
// Reutiliza `construirFasesPack` para armar las fases del nuevo servicio
// (con cascada completa si es complejo, o una sola fase si es simple).
//   - reservaId: id de la reserva existente
//   - setupUid:  setupUid del nuevo servicio (puede ser simple o complejo)
//   - precioOverride: opcional, si se quiere forzar otro precio (variantes)
// Regla pedida por Jal: el servicio adicional se ENCADENA al final, después
// de la última fase ocupante de la cita actual.
export const agregarServicioReserva = webMethod(
  Permissions.SiteMember,
  async ({ reservaId, setupUid, precioOverride }) => {
    try {
      console.log(`${TAG} ➕ Servicio adicional en ${reservaId}: setupUid=${setupUid}`);
      if (!reservaId || !setupUid) return { ok: false, error: 'Faltan reservaId o setupUid' };

      // Reserva
      const r1 = await wixData.query(CMS_RESERVAS)
        .eq('_id', reservaId).limit(1)
        .find({ suppressAuth: true });
      if (r1.items.length === 0) return { ok: false, error: 'Reserva no encontrada' };
      const registro = r1.items[0];
      if (registro.status === 'PAGADO') return { ok: false, error: 'No se puede modificar una cita ya cobrada' };

      // Catálogo completo (para resolver refs de mapeoFases si el servicio nuevo
      // es complejo y referencia setupUids de otros servicios)
      const { porSetupUid } = await cargarCatalogoCompleto();
      const principal = porSetupUid[setupUid];
      if (!principal) return { ok: false, error: 'Servicio nuevo no encontrado en catálogo' };

      // Hora de inicio del NUEVO servicio = MAX(end) de fases ocupantes
      // v1.0.16 FIX: con drag&drop una fase movida más tarde puede estar
      // en posición intermedia del array. Tomar la última posición hacía
      // que el nuevo servicio se montara ENCIMA de fases ya movidas.
      const fasesArr = jsonIn(registro.fases, 'items');
      const ocupantesConEnd = fasesArr.filter(f => f && f.ocupa && f.end);
      let horaInicioISO;
      if (ocupantesConEnd.length) {
        const maxEndMs = ocupantesConEnd.reduce((max, f) => {
          const e = new Date(f.end).getTime();
          return isNaN(e) ? max : Math.max(max, e);
        }, 0);
        horaInicioISO = new Date(maxEndMs).toISOString();
      } else if (registro.fechaReserva) {
        const dur = Number(registro.duracionTotal) || 0;
        horaInicioISO = new Date(new Date(registro.fechaReserva).getTime() + dur * 60000).toISOString();
      } else {
        return { ok: false, error: 'No se puede calcular hora de inicio del servicio adicional' };
      }

      // Construir las fases del nuevo servicio (cascada o simple).
      // v1.0.29 — construirFasesPack devuelve {fases, refsConsumidos,
      // faltanVariantes}. Aquí no pasamos compsPorRef: el operador añade
      // el servicio raíz; las fases CASO A (obligatorias sin variantes,
      // ej. Lavado/Secado) se autoejecutan — correcto. Las fases CASO B
      // (obligatorias con variantes, ej. Planchado M/L/XL) provocarían
      // faltanVariantes y la operación falla; deuda conocida: no hay UI
      // de elección de variante para servicios añadidos POST-creación.
      const { fases: fasesNuevas, faltanVariantes: faltanVariantesAdd } = construirFasesPack({
        principal, porSetupUid, horaInicioISO
      });
      if (Array.isArray(faltanVariantesAdd) && faltanVariantesAdd.length > 0) {
        return { ok: false, error: `Falta elegir variante de: ${faltanVariantesAdd.join(', ')}` };
      }
      if (!Array.isArray(fasesNuevas) || fasesNuevas.length === 0) {
        return { ok: false, error: 'No se pudieron construir las fases del servicio adicional' };
      }

      // Concatenar al final
      const fasesFinales = [...fasesArr, ...fasesNuevas];

      // Recalcular duración total = sumar duración del nuevo servicio
      const durNuevo = fasesNuevas.reduce((s, f) => s + (Number(f.dur) || 0), 0);
      const nuevaDuracionTotal = (Number(registro.duracionTotal) || 0) + durNuevo;

      // Precio: usar precioOverride si llega, o principal.price
      const precioNuevo = precioOverride != null ? Number(precioOverride) : (Number(principal.price) || 0);
      const nuevoPrecioTotal = (Number(registro.precioTotal) || 0) + precioNuevo;

      // Detalle (formato V1: nombre|precio|1)
      const detalleActual = String(registro.serviciosDetail || '');
      const nuevoItem = `${principal.label || 'Servicio'}|${precioNuevo}|1`;
      const detalleNuevo = detalleActual ? `${detalleActual};;${nuevoItem}` : nuevoItem;

      registro.fases = { items: fasesFinales };
      registro.duracionTotal = nuevaDuracionTotal;
      registro.precioTotal = nuevoPrecioTotal;
      registro.serviciosDetail = detalleNuevo;

      await wixData.update(CMS_RESERVAS, registro, { suppressAuth: true });
      console.log(`${TAG} ✅ Servicio añadido: ${principal.label} (+${durNuevo}min, +${precioNuevo}€) | fases nuevas: ${fasesNuevas.length}`);
      return {
        ok: true,
        reservaId,
        label: principal.label,
        precio: precioNuevo,
        duracionTotal: nuevaDuracionTotal,
        precioTotal: nuevoPrecioTotal,
        fasesAdded: fasesNuevas.length
      };
    } catch (e) {
      console.error(`${TAG} ❌ agregarServicioReserva:`, e.message);
      return { ok: false, error: e.message };
    }
  }
);

// ─── 8.4 Producto: DEPRECATED en v1.0.11 ────────────────────
// La venta de productos NO se mete en la fila de la reserva. V2 usa la
// misma función V1 `venderProductosDesdeAgenda` de `tiendaProductos.web`,
// que registra la venta como entrada independiente vinculada al packId.
// El widget llama directamente a esa función vía el page code.
// (En v1.0.10 había aquí una `agregarProductoReserva` que consultaba la
// colección "Productos" — colección inexistente en este tenant —
// causando el error WD_SCHEMA_DOES_NOT_EXIST. Eliminada.)

// ─── 8.5 Quitar Item de la reserva (✕ en cada línea del modal) ──
// Recibe el índice del item dentro de serviciosDetail (split por ';;')
// y lo elimina, recalculando precioTotal. NO toca fases ni duracionTotal
// para no descuadrar el calendario; eso queda para una iteración posterior
// si se quiere ajustar geometría tras quitar un complemento.
export const quitarItemReserva = webMethod(
  Permissions.SiteMember,
  async ({ reservaId, itemIndex }) => {
    try {
      const idx = Math.max(0, parseInt(itemIndex, 10) || 0);
      console.log(`${TAG} ✕ Quitar item ${idx} de ${reservaId}`);
      if (!reservaId) return { ok: false, error: 'reservaId requerido' };

      const result = await wixData.query(CMS_RESERVAS)
        .eq('_id', reservaId).limit(1)
        .find({ suppressAuth: true });
      if (result.items.length === 0) return { ok: false, error: 'Reserva no encontrada' };

      const registro = result.items[0];
      const detalle = String(registro.serviciosDetail || '');
      const items = detalle.split(';;').filter(Boolean);
      if (idx >= items.length) return { ok: false, error: 'Índice fuera de rango' };
      if (items.length <= 1) return { ok: false, error: 'No se puede vaciar la cita. Cancélala si no quieres ningún servicio.' };

      // Calcular precio del item eliminado: formato "label|price|cant"
      const itemFuera = items[idx];
      const partes = itemFuera.split('|');
      const itemLabel = String(partes[0] || '').trim();
      const precioUnit = Number(partes[1]) || 0;
      const cant = Number(partes[2]) || 1;
      const subtotal = Math.round(precioUnit * cant * 100) / 100;

      // v1.0.41 — contar cuántos items con la MISMA etiqueta hay ANTES del que
      // quitamos, para alinear duplicados con su fase correspondiente.
      let occ = 0;
      for (let k = 0; k < idx; k++) {
        if (String((items[k] || '').split('|')[0] || '').trim() === itemLabel) occ++;
      }

      // Eliminar del serviciosDetail y recomponer precio
      items.splice(idx, 1);
      registro.serviciosDetail = items.join(';;');
      registro.precioTotal = Math.max(0, (Number(registro.precioTotal) || 0) - subtotal);

      // v1.0.41 — BUGFIX: quitar también la fase OCUPANTE correspondiente del
      // array `fases`. Antes solo se quitaba del serviciosDetail (desaparecía
      // del cobro) pero la fase seguía pintada y ocupando el hueco en el
      // calendario y en el motor de disponibilidad. Se elimina la fase ocupante
      // (ocupa:true) cuya label coincide con el item, alineada por orden de
      // aparición. Se DEJA HUECO (no se desplaza el resto → queda libre para
      // rellenar con otro servicio). Las fases PROCESO (ocupa:false) no pintan
      // ni ocupan, así que se dejan (inocuas). Si no hay fase ocupante que
      // coincida (p.ej. extras o productos añadidos a mano), solo se toca el
      // serviciosDetail (comportamiento previo intacto).
      try {
        const fasesArr = jsonIn(registro.fases, 'items');
        if (Array.isArray(fasesArr) && fasesArr.length && itemLabel) {
          let seen = 0, removeAt = -1;
          for (let i = 0; i < fasesArr.length; i++) {
            const f = fasesArr[i];
            if (f && f.ocupa && String(f.label || '').trim() === itemLabel) {
              if (seen === occ) { removeAt = i; break; }
              seen++;
            }
          }
          if (removeAt >= 0) {
            fasesArr.splice(removeAt, 1);
            registro.fases = { items: fasesArr };
            // Recalcular fechaReserva/duracionTotal con las ocupantes restantes.
            const ocupantes = fasesArr.filter(f => f && f.ocupa);
            if (ocupantes.length) {
              let minStart = Infinity, maxEnd = -Infinity;
              for (const f of ocupantes) {
                if (f.start) { const s = new Date(f.start).getTime(); if (s < minStart) minStart = s; }
                if (f.end)   { const e = new Date(f.end).getTime();   if (e > maxEnd)   maxEnd = e; }
              }
              if (isFinite(minStart) && isFinite(maxEnd)) {
                registro.fechaReserva = new Date(minStart);
                registro.duracionTotal = Math.max(1, Math.round((maxEnd - minStart) / 60000));
              }
            }
            console.log(`${TAG} 🧹 Fase ocupante "${itemLabel}" (fase idx ${removeAt}) quitada de la cascada; hueco liberado.`);
          } else {
            console.log(`${TAG} ℹ️ "${itemLabel}" sin fase ocupante coincidente (extra/producto o ya ausente); solo serviciosDetail.`);
          }
        }
      } catch (eFases) {
        console.error(`${TAG} ⚠️ quitarItem: no se pudo actualizar fases:`, eFases.message);
        // No abortamos: al menos serviciosDetail/precio quedan corregidos.
      }

      await wixData.update(CMS_RESERVAS, registro, { suppressAuth: true });
      console.log(`${TAG} ✅ Item quitado: "${itemFuera}" (-${subtotal}€). Resto: ${items.length} items, precioTotal=${registro.precioTotal}€`);
      return { ok: true, reservaId, itemRemoved: itemFuera, subtotalRemoved: subtotal, precioTotal: registro.precioTotal };
    } catch (e) {
      console.error(`${TAG} ❌ quitarItemReserva:`, e.message);
      return { ok: false, error: e.message };
    }
  }
);

// =====================================================
// 8.5 MOVER FASE (drag&drop por fase)
// =====================================================
// v1.0.14: una fase del array `fases` puede asignarse a otro staff
// y/o cambiar de hora. Es la base del drag&drop de fases en V2.
//   - reservaId: id de la KamisuiteReservations
//   - faseIndex: índice de la fase en el array
//   - nuevoStartISO: ISO de la nueva hora de inicio (la duración se
//     mantiene)
//   - nuevoStaffId: id del nuevo staff. '' o null → la fase vuelve
//     a heredar el staff raíz de la reserva (sin override).
// Reglas:
//   - Reserva PAGADO no se mueve.
//   - Fase con ocupa=false (PROCESO) no es draggable; se rechaza.
//   - Recalcula fechaReserva = min start de fases ocupantes,
//     duracionTotal = max end − min start.
//   - NO valida conflictos con otras reservas (mismo comportamiento
//     que V1 con forzado:true). El operador es el responsable.

export const moverFase = webMethod(
  Permissions.SiteMember,
  async ({ reservaId, faseIndex, nuevoStartISO, nuevoStaffId }) => {
    try {
      console.log(`${TAG} 🟰 moverFase reserva=${reservaId} idx=${faseIndex} start=${nuevoStartISO} staff=${nuevoStaffId || '(raíz)'}`);
      if (!reservaId) return { ok: false, error: 'Falta reservaId' };
      if (faseIndex == null || isNaN(Number(faseIndex))) return { ok: false, error: 'faseIndex inválido' };
      if (!nuevoStartISO) return { ok: false, error: 'Falta nuevoStartISO' };

      const newStartDate = new Date(nuevoStartISO);
      if (isNaN(newStartDate.getTime())) return { ok: false, error: 'nuevoStartISO inválida' };

      let registro;
      try {
        registro = await wixData.get(CMS_RESERVAS, reservaId, { suppressAuth: true });
      } catch (e) {
        return { ok: false, error: `Reserva no encontrada: ${reservaId}` };
      }
      if (!registro) return { ok: false, error: `Reserva no encontrada: ${reservaId}` };
      if (registro.status === 'PAGADO') return { ok: false, error: 'No se puede mover una cita ya cobrada' };

      const fasesArr = jsonIn(registro.fases, 'items');
      const idx = Number(faseIndex);
      if (idx < 0 || idx >= fasesArr.length) return { ok: false, error: `faseIndex fuera de rango (0..${fasesArr.length - 1})` };

      const faseActual = fasesArr[idx];
      if (!faseActual) return { ok: false, error: 'Fase no encontrada' };
      if (faseActual.ocupa === false) return { ok: false, error: 'Las fases de proceso no son movibles' };

      // Duración: conservar la actual de la fase
      let dur = Number(faseActual.dur) || 0;
      if (!dur && faseActual.start && faseActual.end) {
        dur = Math.max(1, Math.round((new Date(faseActual.end).getTime() - new Date(faseActual.start).getTime()) / 60000));
      }
      if (!dur) dur = 30;

      const newEndDate = new Date(newStartDate.getTime() + dur * 60000);

      // Actualizar la fase concreta
      const fasesNew = fasesArr.map((f, i) => {
        if (i !== idx) return { ...f };
        const nf = { ...f, start: newStartDate.toISOString(), end: newEndDate.toISOString() };
        const staffIdLimpio = (nuevoStaffId == null || String(nuevoStaffId).trim() === '') ? null : String(nuevoStaffId).trim();
        if (staffIdLimpio && staffIdLimpio !== registro.staffId) {
          nf.staffId = staffIdLimpio;
        } else {
          delete nf.staffId;
        }
        return nf;
      });

      // Recalcular fechaReserva = min(start) y duracionTotal = max(end) − min(start)
      const ocupantes = fasesNew.filter(f => f && f.ocupa);
      let minStart = Infinity, maxEnd = -Infinity;
      for (const f of ocupantes) {
        if (f.start) {
          const s = new Date(f.start).getTime();
          if (s < minStart) minStart = s;
        }
        if (f.end) {
          const e = new Date(f.end).getTime();
          if (e > maxEnd) maxEnd = e;
        }
      }
      if (!isFinite(minStart) || !isFinite(maxEnd)) {
        minStart = newStartDate.getTime();
        maxEnd = newEndDate.getTime();
      }

      registro.fases = { items: fasesNew };
      registro.fechaReserva = new Date(minStart);
      registro.duracionTotal = Math.max(1, Math.round((maxEnd - minStart) / 60000));

      await wixData.update(CMS_RESERVAS, registro, { suppressAuth: true });
      console.log(`${TAG} ✅ Fase movida: idx=${idx} start=${newStartDate.toISOString()} staff=${nuevoStaffId || '(raíz)'} | nuevaFechaReserva=${registro.fechaReserva.toISOString()} duracionTotal=${registro.duracionTotal}min`);
      return {
        ok: true,
        reservaId,
        faseIndex: idx,
        fechaReserva: registro.fechaReserva.toISOString(),
        duracionTotal: registro.duracionTotal
      };
    } catch (e) {
      console.error(`${TAG} ❌ moverFase:`, e.message);
      return { ok: false, error: e.message };
    }
  }
);

// =====================================================
// 8.b REDIMENSIONAR FASE — ajustar la duración de una fase
// =====================================================
//   Cambia ÚNICAMENTE la DURACIÓN (dur/end) de la fase `faseIndex`. NO
//   desplaza ni toca ninguna otra fase: si al alargar se solapa con la
//   siguiente, se solapa (mismo criterio que moverFase; el operador decide).
//   - PROCESO (ocupa=false) no se redimensiona (no tiene asa en el widget).
//   - PAGADO se rechaza (igual que moverFase).
//   - Recalcula fechaReserva = min(start) y duracionTotal = max(end) − min(start)
//     de las ocupantes (agregados de la propia cita).

export const redimensionarFase = webMethod(
  Permissions.SiteMember,
  async ({ reservaId, faseIndex, nuevaDur }) => {
    try {
      console.log(`${TAG} 📏 redimensionarFase reserva=${reservaId} idx=${faseIndex} nuevaDur=${nuevaDur}`);
      if (!reservaId) return { ok: false, error: 'Falta reservaId' };
      if (faseIndex == null || isNaN(Number(faseIndex))) return { ok: false, error: 'faseIndex inválido' };
      const nueva = Math.max(1, Math.round(Number(nuevaDur) || 0));
      if (!nueva) return { ok: false, error: 'nuevaDur inválida' };

      let registro;
      try {
        registro = await wixData.get(CMS_RESERVAS, reservaId, { suppressAuth: true });
      } catch (e) {
        return { ok: false, error: `Reserva no encontrada: ${reservaId}` };
      }
      if (!registro) return { ok: false, error: `Reserva no encontrada: ${reservaId}` };
      if (registro.status === 'PAGADO') return { ok: false, error: 'No se puede redimensionar una cita ya cobrada' };

      const fasesArr = jsonIn(registro.fases, 'items');
      const idx = Number(faseIndex);
      if (idx < 0 || idx >= fasesArr.length) return { ok: false, error: `faseIndex fuera de rango (0..${fasesArr.length - 1})` };

      const faseActual = fasesArr[idx];
      if (!faseActual) return { ok: false, error: 'Fase no encontrada' };
      if (faseActual.ocupa === false) return { ok: false, error: 'Las fases de proceso no se redimensionan' };
      if (!faseActual.start) return { ok: false, error: 'La fase no tiene inicio' };

      // Duración actual de la fase
      let durOld = Number(faseActual.dur) || 0;
      if (!durOld && faseActual.end) {
        durOld = Math.max(1, Math.round((new Date(faseActual.end).getTime() - new Date(faseActual.start).getTime()) / 60000));
      }
      if (!durOld) durOld = 30;

      const startMs = new Date(faseActual.start).getTime();
      const newEndMs = startMs + nueva * 60000;

      // v1.0.40 — SOLO cambia dur/end de ESTA fase. NO se desplaza ni se toca
      // ninguna otra fase. Si al alargar se solapa con la siguiente, se
      // solapa: el código no reordena la cita (mismo criterio que moverFase;
      // el operador es el responsable).
      const fasesNew = fasesArr.map((f, i) => {
        if (i === idx) return { ...f, dur: nueva, end: new Date(newEndMs).toISOString() };
        return { ...f };
      });

      // Recalcular fechaReserva = min(start) y duracionTotal = max(end) − min(start) de ocupantes
      const ocupantes = fasesNew.filter(f => f && f.ocupa);
      let minStart = Infinity, maxEnd = -Infinity;
      for (const f of ocupantes) {
        if (f.start) { const s = new Date(f.start).getTime(); if (s < minStart) minStart = s; }
        if (f.end)   { const e = new Date(f.end).getTime();   if (e > maxEnd)   maxEnd = e; }
      }
      if (!isFinite(minStart) || !isFinite(maxEnd)) {
        minStart = startMs; maxEnd = newEndMs;
      }

      registro.fases = { items: fasesNew };
      registro.fechaReserva = new Date(minStart);
      registro.duracionTotal = Math.max(1, Math.round((maxEnd - minStart) / 60000));

      await wixData.update(CMS_RESERVAS, registro, { suppressAuth: true });
      console.log(`${TAG} ✅ Fase redimensionada (sin tocar otras): idx=${idx} ${durOld}→${nueva}min | duracionTotal=${registro.duracionTotal}min`);
      return {
        ok: true,
        reservaId,
        faseIndex: idx,
        nuevaDur: nueva,
        fechaReserva: registro.fechaReserva.toISOString(),
        duracionTotal: registro.duracionTotal
      };
    } catch (e) {
      console.error(`${TAG} ❌ redimensionarFase:`, e.message);
      return { ok: false, error: e.message };
    }
  }
);

// =====================================================
// 9. GET CONSTANTS (utilidad de diagnóstico)
// =====================================================

export const getConstants = webMethod(
  Permissions.Anyone,
  async () => {
    return {
      ok: true,
      version: VERSION,
      collections: {
        CMS_CATALOGO, CMS_RESERVAS, CMS_PAGOS,
        // v1.0.31 — F4/F5
        CMS_VOUCHERS, CMS_PROMOCARDS, CMS_PROMOCAMPAIGNS,
        CMS_VOUCHER_REDEMPTIONS, CMS_PRIME
      },
      prefijoPago: PREFIJO_PAGO,
      timezone: TIMEZONE
    };
  }
);

// =====================================================
// 10. PRODUCTOS CUSTOM — IDENTIFICACIÓN Y CANJE (F4/F5, v1.0.31)
// =====================================================
//
// Tres funciones para que Recepción PRO identifique y canjee Bonos y
// Tarjetas Promocionales del cliente en el cobro de la cita. NO tocan
// marcarPagadoReserva. NO venden nada (la venta vive online en las
// páginas /tarjetaprime, /bonos, /bonosypromociones).
//
// Flujo orquestado por el page code:
//   1) Al abrir modal de cobro → llamar a getProductosCustomCliente
//      con el contactId de la reserva, mostrar lo que tiene el cliente.
//   2) Operador selecciona uno (o introduce código manual) → llamar a
//      aplicarCanjeProducto. Recibe nuevoImporte + descripcionToken.
//   3) Operador confirma cobro → page code llama, en orden:
//        a) marcarPagadoReserva({reservaId, metodoPago, importeNeto,
//                                descripcionExtra}) ← intacta v1.0.4
//        b) confirmarCanjeProducto({reservaId, codigoProducto, staff,
//                                   activationMethod})
//
// =====================================================

// -----------------------------------------------------
// 10.1 getProductosCustomCliente — lectura pura
// -----------------------------------------------------
//
// Devuelve los productos custom ACTIVOS del cliente para mostrar en el
// modal de cobro. No escribe nada.
//
// Reglas de filtrado:
//   · PRIME: status='ACTIVA' + expirationDate futuro. Informativo.
//   · Bonos: status='ACTIVO' + remainingUses>0 + expirationDate futuro.
//   · Tarjetas: status='EMITIDA' + isGift=false (las regalo van por
//     entrada manual de código) + expirationDate futuro.
//
// Si contactId vacío (cliente provisional), devuelve listas vacías.
// El page code en ese caso solo expone input manual de código.
//
// Patrón §15.3: NO usar .eq sobre Boolean (isGift). Filtro JS post-query.

export const getProductosCustomCliente = webMethod(
  Permissions.SiteMember,
  async ({ contactId }) => {
    try {
      const safeContactId = String(contactId || '').trim();
      if (!safeContactId) {
        // Cliente provisional sin contactId: solo input manual disponible.
        return { ok: true, version: VERSION, prime: null, bonos: [], tarjetas: [] };
      }

      const ahora = new Date();

      // 1) PRIME activa
      let prime = null;
      try {
        const primeRes = await wixData.query(CMS_PRIME)
          .eq('contactId', safeContactId)
          .eq('status', STATUS_PRIME_ACTIVA)
          .limit(1)
          .find({ suppressAuth: true });
        if (primeRes.items.length > 0) {
          const p = primeRes.items[0];
          const exp = p.expirationDate ? new Date(p.expirationDate) : null;
          if (!exp || exp > ahora) {
            prime = {
              code: p.code || '',
              expirationDate: p.expirationDate || null
            };
          }
        }
      } catch (errPrime) {
        console.warn(`${TAG} ⚠️ getProductosCustomCliente PRIME: ${errPrime.message}`);
      }

      // 2) Bonos activos
      const bonos = [];
      try {
        const bonosRes = await wixData.query(CMS_VOUCHERS)
          .eq('contactId', safeContactId)
          .eq('status', STATUS_VOUCHER_ACTIVO)
          .limit(50)
          .find({ suppressAuth: true });
        for (const b of bonosRes.items) {
          const remaining = Number(b.remainingUses);
          if (!Number.isFinite(remaining) || remaining <= 0) continue;
          if (b.expirationDate) {
            const exp = new Date(b.expirationDate);
            if (Number.isFinite(exp.getTime()) && exp <= ahora) continue;
          }
          bonos.push({
            _id: b._id,
            code: b.code || '',
            serviceSetupUid: b.serviceSetupUid || '',
            serviceLabel: b.serviceLabel || '',
            appliedDiscount: Number(b.appliedDiscount) || 0,
            remainingUses: remaining,
            totalUses: Number(b.totalUses) || 0,
            expirationDate: b.expirationDate || null,
            voucherImage: b.voucherImage || ''
          });
        }
      } catch (errBonos) {
        console.warn(`${TAG} ⚠️ getProductosCustomCliente bonos: ${errBonos.message}`);
      }

      // 3) Tarjetas promocionales (solo isGift=false, no regalo)
      const tarjetas = [];
      try {
        const tarjetasRes = await wixData.query(CMS_PROMOCARDS)
          .eq('buyerContactId', safeContactId)
          .eq('status', STATUS_PROMOCARD_EMITIDA)
          .limit(50)
          .find({ suppressAuth: true });
        for (const t of tarjetasRes.items) {
          if (t.isGift === true) continue; // regalos van por entrada manual
          if (t.expirationDate) {
            const exp = new Date(t.expirationDate);
            if (Number.isFinite(exp.getTime()) && exp <= ahora) continue;
          }
          tarjetas.push({
            _id: t._id,
            code: t.code || '',
            serviceSetupUid: t.serviceSetupUid || '',
            serviceLabel: t.serviceLabel || '',
            expirationDate: t.expirationDate || null,
            promoTypeId: t.promoTypeId || '',
            promoCardImage: t.promoCardImage || ''
          });
        }
      } catch (errTarjetas) {
        console.warn(`${TAG} ⚠️ getProductosCustomCliente tarjetas: ${errTarjetas.message}`);
      }

      console.log(`${TAG} 📦 ProductosCustom cliente ${safeContactId}: prime=${prime ? 'sí' : 'no'} bonos=${bonos.length} tarjetas=${tarjetas.length}`);
      return { ok: true, version: VERSION, prime, bonos, tarjetas };

    } catch (e) {
      console.error(`${TAG} ❌ getProductosCustomCliente:`, e.message);
      return { ok: false, version: VERSION, error: safeErr(e) };
    }
  }
);

// -----------------------------------------------------
// 10.2 aplicarCanjeProducto — validar y calcular (NO escribe)
// -----------------------------------------------------
//
// Detecta tipo por prefijo del código (BN-/KP-). Valida que el código
// existe, está activo y no caducado. Resuelve serviceSetupUid → label
// actual en ServiceCatalog (sobrevive a renombrados). Busca la línea
// del servicio en serviciosDetail. Calcula ahorro y nuevoImporte.
//
// Devuelve datos para que el page code los pase a marcarPagadoReserva:
//   · nuevoImporte → importeNeto
//   · descripcionToken → descripcionExtra
//   · ahorro, codigo, voucherId/promoCardId → para confirmarCanjeProducto
//
// BLOQUEA si la cita no contiene el servicio del bono/tarjeta.

export const aplicarCanjeProducto = webMethod(
  Permissions.SiteMember,
  async ({ reservaId, codigoProducto }) => {
    try {
      const safeRes = String(reservaId || '').trim();
      const safeCode = String(codigoProducto || '').trim().toUpperCase();

      if (!safeRes) {
        return { ok: false, version: VERSION, error: { message: 'Falta reservaId' } };
      }
      if (!safeCode) {
        return { ok: false, version: VERSION, error: { message: 'Falta código del producto' } };
      }

      // Cargar reserva
      let reserva;
      try {
        reserva = await wixData.get(CMS_RESERVAS, safeRes, { suppressAuth: true });
      } catch (_) {
        return { ok: false, version: VERSION, error: { message: 'Reserva no encontrada' } };
      }
      if (!reserva) {
        return { ok: false, version: VERSION, error: { message: 'Reserva no encontrada' } };
      }
      if (reserva.status === 'PAGADO' || reserva.status === 'CANCELADA') {
        return { ok: false, version: VERSION, error: { message: `La reserva ya está ${reserva.status}` } };
      }

      const ahora = new Date();
      const precioTotal = toNum(reserva.precioTotal);

      // Parsear serviciosDetail → array de {label, price}
      const lineas = String(reserva.serviciosDetail || '').split(';;').filter(Boolean).map(s => {
        const [label, price] = s.split('|');
        return { label: String(label || '').trim(), price: Number(price) || 0 };
      });

      // -----------------
      // RAMA BONO (BN-)
      // -----------------
      if (safeCode.startsWith('BN-')) {
        const bonoRes = await wixData.query(CMS_VOUCHERS)
          .eq('code', safeCode)
          .limit(1)
          .find({ suppressAuth: true });
        if (bonoRes.items.length === 0) {
          return { ok: false, version: VERSION, error: { message: `Bono ${safeCode} no encontrado` } };
        }
        const bono = bonoRes.items[0];

        if (bono.status !== STATUS_VOUCHER_ACTIVO) {
          return { ok: false, version: VERSION, error: { message: `El bono no está activo (${bono.status || 'sin estado'})` } };
        }
        const remaining = Number(bono.remainingUses);
        if (!Number.isFinite(remaining) || remaining <= 0) {
          return { ok: false, version: VERSION, error: { message: 'El bono no tiene usos restantes' } };
        }
        if (bono.expirationDate) {
          const exp = new Date(bono.expirationDate);
          if (Number.isFinite(exp.getTime()) && exp <= ahora) {
            return { ok: false, version: VERSION, error: { message: 'El bono está caducado' } };
          }
        }

        // v1.0.42 — FRECUENCIA MÍNIMA ENTRE USOS.
        // El bono puede exigir un intervalo mínimo en días naturales entre
        // canjes, congelado al emitir en bono.bonusUseIntervalDays
        // (0/vacío = LIBRE). Se mide por día natural (calendario Madrid)
        // contra el redeemDate más reciente del bono en el ledger. El
        // primer uso (sin canjes previos) siempre pasa.
        const intervaloDias = (typeof bono.bonusUseIntervalDays === 'number' && bono.bonusUseIntervalDays > 0)
          ? Math.floor(bono.bonusUseIntervalDays)
          : 0;
        if (intervaloDias > 0) {
          let ultimoCanjeMs = null;
          try {
            const redRes = await wixData.query(CMS_VOUCHER_REDEMPTIONS)
              .eq('voucherId', bono._id)
              .limit(1000)
              .find({ suppressAuth: true });
            for (const r of (redRes.items || [])) {
              if (!r.redeemDate) continue;
              const t = new Date(r.redeemDate).getTime();
              if (Number.isFinite(t) && (ultimoCanjeMs === null || t > ultimoCanjeMs)) ultimoCanjeMs = t;
            }
          } catch (e) {
            console.warn(`${TAG} ⚠️ intervalo bono ${safeCode}: query ledger falló (${e.message}) — se permite el canje`);
          }
          if (ultimoCanjeMs !== null) {
            const DIA_MS = 86400000;
            const madridDayMs = (ms) => {
              const s = new Date(ms).toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' }); // YYYY-MM-DD
              const p = s.split('-');
              return Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
            };
            const ultimoDia = madridDayMs(ultimoCanjeMs);
            const hoyDia = madridDayMs(ahora.getTime());
            const diasTranscurridos = Math.round((hoyDia - ultimoDia) / DIA_MS);
            if (diasTranscurridos < intervaloDias) {
              const disponibleMs = ultimoDia + intervaloDias * DIA_MS;
              const fmt = (ms) => new Date(ms).toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid' });
              return {
                ok: false,
                version: VERSION,
                error: {
                  message: `Este bono admite un uso cada ${intervaloDias} días. Último uso: ${fmt(ultimoDia)}. Disponible desde: ${fmt(disponibleMs)}.`
                }
              };
            }
          }
        }

        // Resolver label ACTUAL del servicio del bono desde ServiceCatalog
        // (sobrevive a renombrados del catálogo posteriores a la emisión).
        // v1.0.33 — PRESERVAR SUFIJO DE VARIANTE. Cuando el bono es de una
        // variante concreta, bono.serviceLabel llega con el sufijo
        // " · <variante>" (formato idéntico al que crearPackReserva v1.0.25
        // línea 1263 escribe al principal cuando se reserva con variante).
        // El label del catálogo por setupUid NO tiene sufijo → si
        // sobrescribimos entero, perdemos la variante y el match contra
        // serviciosDetail falla. Solución: extraer el sufijo del bono
        // (todo desde el primer " · ") y concatenarlo al label del catálogo.
        // Bonos sin variante (serviceLabel sin " · ") → comportamiento
        // idéntico al v1.0.32 (retrocompat).
        let labelActual = String(bono.serviceLabel || '').trim();
        if (bono.serviceSetupUid) {
          try {
            const svcRes = await wixData.query(CMS_CATALOGO)
              .eq('setupUid', bono.serviceSetupUid)
              .limit(1)
              .find({ suppressAuth: true });
            if (svcRes.items.length > 0 && svcRes.items[0].label) {
              const baseCatalogo = String(svcRes.items[0].label).trim();
              const idxSep = labelActual.indexOf(' · ');
              labelActual = (idxSep > 0)
                ? baseCatalogo + labelActual.substring(idxSep)
                : baseCatalogo;
            }
          } catch (_) {
            // fallback a serviceLabel cacheado en el bono
          }
        }

        // Buscar línea cuyo label coincida (case-insensitive)
        const targetLower = labelActual.toLowerCase();
        const lineaMatch = lineas.find(l => l.label.toLowerCase() === targetLower);
        if (!lineaMatch) {
          return {
            ok: false,
            version: VERSION,
            error: {
              message: `Este bono es para "${labelActual}" y la cita actual no contiene ese servicio.`
            }
          };
        }

        // v1.0.32 — CORRECCIÓN MODELO ECONÓMICO BONO.
        // El bono PREPAGA el servicio. El cliente ya pagó por adelantado
        // por estos N cortes cuando compró el bono (precioBono = precioBruto
        // × (1 − bonoDescuento/100)). Al canjear, el servicio queda
        // CUBIERTO AL 100% — no se cobra nada por este servicio.
        // appliedDiscount es solo info histórica del % de descuento que
        // tuvo al comprar el bono; NO se aplica en cada canje.
        const ahorro = Math.round(lineaMatch.price * 100) / 100;
        const nuevoImporte = Math.max(0, Math.round((precioTotal - ahorro) * 100) / 100);
        const descuentoPct = Number(bono.appliedDiscount) || 0;   // sólo para logging / metadatos

        console.log(`${TAG} 🎟️ aplicarCanjeProducto BONO ${safeCode}: línea "${labelActual}" ${lineaMatch.price}€ → CUBIERTA. ahorro=${ahorro}€ (bono comprado con ${descuentoPct}% off histórico)`);

        return {
          ok: true,
          version: VERSION,
          tipo: 'bono',
          voucherId: bono._id,
          codigo: bono.code,
          serviceLabel: labelActual,
          precioLinea: lineaMatch.price,
          descuentoPct,                 // histórico — la UI puede mostrarlo si quiere
          ahorro,                       // = precioLinea (servicio cubierto entero)
          precioTotal,
          nuevoImporte,
          descripcionToken: `Bono ${bono.code} cubre ${labelActual} (-${ahorro.toFixed(2)}€)`,
          usesBefore: remaining,
          usesAfter: remaining - 1
        };
      }

      // ----------------------
      // RAMA TARJETA (KP-)
      // ----------------------
      if (safeCode.startsWith('KP-')) {
        const cardRes = await wixData.query(CMS_PROMOCARDS)
          .eq('code', safeCode)
          .limit(1)
          .find({ suppressAuth: true });
        if (cardRes.items.length === 0) {
          return { ok: false, version: VERSION, error: { message: `Tarjeta ${safeCode} no encontrada` } };
        }
        const card = cardRes.items[0];

        if (card.status !== STATUS_PROMOCARD_EMITIDA) {
          return { ok: false, version: VERSION, error: { message: `La tarjeta no está disponible (${card.status || 'sin estado'})` } };
        }
        if (card.expirationDate) {
          const exp = new Date(card.expirationDate);
          if (Number.isFinite(exp.getTime()) && exp <= ahora) {
            return { ok: false, version: VERSION, error: { message: 'La tarjeta está caducada' } };
          }
        }
        if (!card.promoTypeId) {
          return { ok: false, version: VERSION, error: { message: 'La tarjeta no tiene campaña asociada' } };
        }

        // Leer campaña (precio promocional)
        let campaign;
        try {
          campaign = await wixData.get(CMS_PROMOCAMPAIGNS, card.promoTypeId, { suppressAuth: true });
        } catch (_) {
          return { ok: false, version: VERSION, error: { message: 'Campaña promocional no encontrada' } };
        }
        if (!campaign) {
          return { ok: false, version: VERSION, error: { message: 'Campaña promocional no encontrada' } };
        }
        const promoPrice = Number(campaign.promoPrice);
        if (!Number.isFinite(promoPrice) || promoPrice < 0) {
          return { ok: false, version: VERSION, error: { message: 'El precio promocional no es válido' } };
        }

        // Resolver label actual del servicio promocional
        // v1.0.33 — Mismo fix simétrico que rama BONO: preservar el sufijo
        // " · <variante>" si el card.serviceLabel lo contiene. Hoy las
        // tarjetas promocionales en producción no llevan variante, así
        // que el efecto real es cero. Idempotente: sin sufijo → misma
        // salida que v1.0.32. Protege el flujo futuro cuando el módulo
        // de tarjetas se revise para soportar variantes.
        let labelActual = String(card.serviceLabel || campaign.serviceLabel || '').trim();
        const setupUid = card.serviceSetupUid || campaign.serviceSetupUid || '';
        if (setupUid) {
          try {
            const svcRes = await wixData.query(CMS_CATALOGO)
              .eq('setupUid', setupUid)
              .limit(1)
              .find({ suppressAuth: true });
            if (svcRes.items.length > 0 && svcRes.items[0].label) {
              const baseCatalogo = String(svcRes.items[0].label).trim();
              const idxSep = labelActual.indexOf(' · ');
              labelActual = (idxSep > 0)
                ? baseCatalogo + labelActual.substring(idxSep)
                : baseCatalogo;
            }
          } catch (_) {
            // fallback al serviceLabel cacheado
          }
        }

        const targetLower = labelActual.toLowerCase();
        const lineaMatch = lineas.find(l => l.label.toLowerCase() === targetLower);
        if (!lineaMatch) {
          return {
            ok: false,
            version: VERSION,
            error: {
              message: `Esta tarjeta es para "${labelActual}" y la cita actual no contiene ese servicio.`
            }
          };
        }

        const ahorro = Math.round((lineaMatch.price - promoPrice) * 100) / 100;
        if (ahorro < 0) {
          return { ok: false, version: VERSION, error: { message: 'El precio promocional es mayor que el normal — no se aplica' } };
        }
        const nuevoImporte = Math.max(0, Math.round((precioTotal - ahorro) * 100) / 100);

        console.log(`${TAG} 🎫 aplicarCanjeProducto TARJETA ${safeCode}: línea "${labelActual}" ${lineaMatch.price}€ → promo ${promoPrice}€ = ahorro ${ahorro}€`);

        return {
          ok: true,
          version: VERSION,
          tipo: 'tarjeta',
          promoCardId: card._id,
          codigo: card.code,
          serviceLabel: labelActual,
          precioLinea: lineaMatch.price,
          precioPromo: promoPrice,
          ahorro,
          precioTotal,
          nuevoImporte,
          descripcionToken: `Tarjeta ${card.code} precio promocional ${promoPrice}€ sobre ${labelActual}`
        };
      }

      // -----------------
      // PREFIJO NO RECONOCIDO
      // -----------------
      return {
        ok: false,
        version: VERSION,
        error: { message: `Código no reconocido (debe empezar por BN- o KP-): ${safeCode}` }
      };

    } catch (e) {
      console.error(`${TAG} ❌ aplicarCanjeProducto:`, e.message);
      return { ok: false, version: VERSION, error: safeErr(e) };
    }
  }
);

// -----------------------------------------------------
// 10.3 confirmarCanjeProducto — persistir el canje
// -----------------------------------------------------
//
// Se llama DESPUÉS de marcarPagadoReserva (el page code orquesta el
// orden). Marca el bono/tarjeta como canjeado y registra trazabilidad.
//
// Idempotente:
//   · Bono: si ya hay KamisuiteVoucherRedemptions con voucherId+
//     reservationId, devuelve {yaCanjeado:true} sin doble efecto.
//   · Tarjeta: si status='CANJEADA' y redeemedInReservationId coincide
//     con este reservaId, devuelve {yaCanjeado:true}. Si está canjeada
//     en OTRA reserva → error explícito.

export const confirmarCanjeProducto = webMethod(
  Permissions.SiteMember,
  async ({ reservaId, codigoProducto, staff, activationMethod }) => {
    try {
      const safeRes = String(reservaId || '').trim();
      const safeCode = String(codigoProducto || '').trim().toUpperCase();
      const safeStaff = String(staff || '').trim();
      const safeMethod = activationMethod === 'manual' ? 'manual' : 'auto';

      if (!safeRes) {
        return { ok: false, version: VERSION, error: { message: 'Falta reservaId' } };
      }
      if (!safeCode) {
        return { ok: false, version: VERSION, error: { message: 'Falta código del producto' } };
      }

      const ahora = new Date();
      const ahoraISO = ahora.toISOString();

      // Resolver paymentReservationId (clave KRI_<reservaId>) para enlace
      let paymentReservationId = '';
      try {
        const bookingIdKey = `${PREFIJO_PAGO}${safeRes}`;
        const pagoRes = await wixData.query(CMS_PAGOS)
          .eq('bookingId', bookingIdKey)
          .limit(1)
          .find({ suppressAuth: true });
        if (pagoRes.items.length > 0) {
          paymentReservationId = pagoRes.items[0]._id || '';
        }
      } catch (_) {
        // no bloqueante: el redemption se crea igual aunque no encontremos el pago
      }

      // -----------------
      // RAMA BONO (BN-)
      // -----------------
      if (safeCode.startsWith('BN-')) {
        const bonoRes = await wixData.query(CMS_VOUCHERS)
          .eq('code', safeCode)
          .limit(1)
          .find({ suppressAuth: true });
        if (bonoRes.items.length === 0) {
          return { ok: false, version: VERSION, error: { message: `Bono ${safeCode} no encontrado` } };
        }
        const bono = bonoRes.items[0];

        // Idempotencia
        try {
          const existRed = await wixData.query(CMS_VOUCHER_REDEMPTIONS)
            .eq('voucherId', bono._id)
            .eq('reservationId', safeRes)
            .limit(1)
            .find({ suppressAuth: true });
          if (existRed.items.length > 0) {
            console.warn(`${TAG} ⚠️ Canje de bono ya registrado: ${safeCode} en reserva ${safeRes}`);
            return { ok: true, version: VERSION, yaCanjeado: true, tipo: 'bono' };
          }
        } catch (_) {
          // si la query de idempotencia falla, seguimos adelante (mejor permitir
          // que bloquear; el operador sabrá si fue doble click)
        }

        // Recalcular ahorro para registrarlo en redemption (independiente del
        // importeNeto que el operador haya pasado a marcarPagadoReserva)
        let amountSaved = 0;
        try {
          const reserva = await wixData.get(CMS_RESERVAS, safeRes, { suppressAuth: true });
          if (reserva) {
            const lineas = String(reserva.serviciosDetail || '').split(';;').filter(Boolean).map(s => {
              const [label, price] = s.split('|');
              return { label: String(label || '').trim().toLowerCase(), price: Number(price) || 0 };
            });
            // Resolver label actual del servicio del bono
            // v1.0.33 — Mismo fix simétrico que en aplicarCanjeProducto:
            // preservar sufijo de variante " · <X>" del bono si existe,
            // para que el recálculo de amountSaved en el redemption use
            // el mismo criterio de match que ya usó aplicarCanjeProducto.
            let labelActual = String(bono.serviceLabel || '').trim();
            if (bono.serviceSetupUid) {
              try {
                const svcRes = await wixData.query(CMS_CATALOGO)
                  .eq('setupUid', bono.serviceSetupUid)
                  .limit(1)
                  .find({ suppressAuth: true });
                if (svcRes.items.length > 0 && svcRes.items[0].label) {
                  const baseCatalogo = String(svcRes.items[0].label).trim();
                  const idxSep = labelActual.indexOf(' · ');
                  labelActual = (idxSep > 0)
                    ? baseCatalogo + labelActual.substring(idxSep)
                    : baseCatalogo;
                }
              } catch (_) {}
            }
            const lineaMatch = lineas.find(l => l.label === labelActual.toLowerCase());
            if (lineaMatch) {
              // v1.0.32 — amountSaved = precio entero del servicio (el bono
              // lo cubre al 100%). appliedDiscount es info histórica del
              // descuento al comprar el bono; NO se aplica aquí.
              amountSaved = Math.round(lineaMatch.price * 100) / 100;
            }
          }
        } catch (_) {
          // amountSaved=0 como fallback (la trazabilidad fina vive en PaymentReservations.descripcion)
        }

        // READ-MERGE-UPDATE bono: decrementar usos + estado AGOTADO si llega a 0
        const usesBefore = Number(bono.remainingUses) || 0;
        const usesAfter = Math.max(0, usesBefore - 1);
        bono.remainingUses = usesAfter;
        if (usesAfter === 0) {
          bono.status = STATUS_VOUCHER_AGOTADO;
        }
        await wixData.update(CMS_VOUCHERS, bono, { suppressAuth: true });

        // Insertar redemption (field IDs verificados CSV maestro)
        const redemption = {
          voucherId:              bono._id,
          reservationId:          safeRes,
          paymentReservationId:   paymentReservationId,
          serviceSetupUid:        bono.serviceSetupUid || '',
          redeemDate:             ahoraISO,
          amountSaved:            amountSaved,
          usesBefore:             usesBefore,
          usesAfter:              usesAfter,
          activationMethod:       safeMethod,
          staff:                  safeStaff,
          voucherImage:           bono.voucherImage || ''
        };
        await wixData.insert(CMS_VOUCHER_REDEMPTIONS, redemption, { suppressAuth: true });

        console.log(`${TAG} ✅ Bono ${safeCode} canjeado | reserva ${safeRes} | usos ${usesBefore}→${usesAfter} | ahorro ${amountSaved}€${usesAfter === 0 ? ' | AGOTADO' : ''}`);
        return {
          ok: true,
          version: VERSION,
          tipo: 'bono',
          voucherId: bono._id,
          usesAfter,
          amountSaved,
          agotado: usesAfter === 0
        };
      }

      // ----------------------
      // RAMA TARJETA (KP-)
      // ----------------------
      if (safeCode.startsWith('KP-')) {
        const cardRes = await wixData.query(CMS_PROMOCARDS)
          .eq('code', safeCode)
          .limit(1)
          .find({ suppressAuth: true });
        if (cardRes.items.length === 0) {
          return { ok: false, version: VERSION, error: { message: `Tarjeta ${safeCode} no encontrada` } };
        }
        const card = cardRes.items[0];

        // Idempotencia
        if (card.status === STATUS_PROMOCARD_CANJEADA) {
          if (card.redeemedInReservationId === safeRes) {
            console.warn(`${TAG} ⚠️ Tarjeta ya canjeada en esta reserva: ${safeCode}`);
            return { ok: true, version: VERSION, yaCanjeado: true, tipo: 'tarjeta' };
          }
          return {
            ok: false,
            version: VERSION,
            error: { message: `La tarjeta ${safeCode} ya fue canjeada en otra reserva` }
          };
        }

        // Resolver contactId que canjea (el de la reserva)
        let contactIdCanje = '';
        try {
          const reserva = await wixData.get(CMS_RESERVAS, safeRes, { suppressAuth: true });
          contactIdCanje = reserva?.contactId || '';
        } catch (_) {}

        // READ-MERGE-UPDATE tarjeta
        card.status = STATUS_PROMOCARD_CANJEADA;
        card.redeemDate = ahoraISO;
        card.redeemedInReservationId = safeRes;
        if (contactIdCanje && !card.redeemedByContactId) {
          card.redeemedByContactId = contactIdCanje;
        }
        await wixData.update(CMS_PROMOCARDS, card, { suppressAuth: true });

        console.log(`${TAG} ✅ Tarjeta ${safeCode} CANJEADA en reserva ${safeRes}`);
        return {
          ok: true,
          version: VERSION,
          tipo: 'tarjeta',
          promoCardId: card._id
        };
      }

      return {
        ok: false,
        version: VERSION,
        error: { message: `Código no reconocido (debe empezar por BN- o KP-): ${safeCode}` }
      };

    } catch (e) {
      console.error(`${TAG} ❌ confirmarCanjeProducto:`, e.message);
      return { ok: false, version: VERSION, error: safeErr(e) };
    }
  }
);
