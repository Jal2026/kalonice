// =====================================================
// KAMISUITE — Backend: Widget Público de Reservas
// =====================================================
// VERSION: 0.9.0
// FECHA: 3 de agosto de 2026
// ARCHIVO: backend/widgetPublicoLogic.web.js
//
// v0.9.0: 👥 SEGUNDO PROFESIONAL PARA LOS COMPLEMENTOS (recuperación de
//    una capacidad que existía en V1 y nunca se cableó en V2).
//
//    ─── QUÉ SE RECUPERA ───
//    En V1 (`coloracionLogic.web.js`, aún en el repo) el cliente podía
//    reservar el servicio principal con un profesional y los extras con
//    otro. Dos piezas lo sostenían:
//      · `consultarDisponibilidadUnificada` (línea 853) recibía `staff2Id`
//        y consultaba TRAMO A con staffPrimary y TRAMO B con staffSecondary
//        en paralelo, cruzando ambos conjuntos de slots por la hora exacta
//        de fin de PROCESO.
//      · `confirmarEnCalendario` (línea 1629) recibía `empleado2Id` →
//        `extrasStaffId`, y la línea 1854 repartía:
//          `staffParaFase = fase.fase === 'LAVADO' ? empleadoIdReal : extrasStaffId`
//        es decir: el LAVADO se quedaba con el principal y todo el resto
//        del tramo posterior al proceso iba al segundo.
//
//    En V2 el widget bundle CONSERVA la UI completa (state.proExtra,
//    state.sameExtra, _renderProExtra, fila "Compl. con" del resumen)
//    pero estaba oculta porque `adaptarServicio` emitía
//    `requiresExtraPro: false` HARDCODEADO (deuda declarada en el propio
//    comentario del archivo). Además el bundle nunca enviaba el segundo
//    profesional en ninguno de los dos emits. Esta versión cierra la deuda.
//
//    ─── (A) requiresExtraPro REAL ───
//    `adaptarServicio` deja de clavar `false`: emite
//    `requiresExtraPro = complements.length > 0`. Sin complementos no hay
//    nada que repartir → el bloque no se pinta. El bundle v2.0.17 añade
//    una segunda condición por encima de ésta: solo lo muestra cuando el
//    cliente ha MARCADO al menos un complemento.
//
//    ─── (B) REGLA DE REPARTO (decidida por Jal, 3-ago-2026) ───
//    UN SOLO segundo profesional (no uno por complemento), que se lleva
//    todo el tramo posterior al proceso SALVO el lavado. Traducción
//    estructural a V2, donde la etiqueta 'LAVADO' de V1 no existe:
//
//      · CON PROCESO → el tramo del principal termina al acabar la
//        PRIMERA fase que ocupa después del PROCESO. Esa fase es
//        exactamente lo que en V1 era el lavado (el TRAMO B de V1
//        arrancaba en `ids.lavado || ids.final`, la única pieza que V1
//        devolvía al principal). Todo lo posterior → segundo.
//        Ejemplo Tinte Raíz + Corte Mujer de complemento:
//          Principal: aplicación → proceso → lavado
//          Segundo:   secado → corte
//
//      · SIN PROCESO → el tramo del principal termina justo ANTES del
//        primer bloque elegible por el cliente (tipo:'servicio' NO
//        obligatorio, tipo:'exclusivo', o CASO B con variantes). Los
//        complementos elegidos, y lo que venga detrás de ellos, → segundo.
//        NOTA EXPLÍCITA PARA JAL: si un salón coloca en el mapeoFases una
//        fase INCLUIDA obligatoria DESPUÉS de un complemento opcional, esa
//        incluida cae en el tramo del segundo. Es la consecuencia de
//        mantener UN ÚNICO punto de corte temporal (dos tramos contiguos),
//        que es lo que hacía V1 y lo único que el motor de disponibilidad
//        puede validar sin fragmentar la cita. Si se prefiere otro
//        criterio, se cambia solo `calcularDurPrincipalCascada`.
//
//    El corte SIEMPRE cae en piezas base (nunca dentro de un complemento
//    elegible), por lo que `durPrincipal` se calcula exacto en backend sin
//    conocer las variantes elegidas, y `durExtra = durationMin - durPrincipal`
//    usando la duración total que el bundle ya calcula (con variantes).
//
//    ─── (C) NUEVO HELPER `calcularDurPrincipalCascada` ───
//    Hermano de `calcularBaseDurationCascada` (v0.8.0): mismo recorrido
//    del mapeoFases y mismo criterio literal de `construirFasesPack`, pero
//    se detiene en el punto de corte definido arriba. Sin mapeoFases
//    (servicio simple) → `it.duration` (todo el principal, los
//    complementos encolados detrás van al segundo).
//
//    ─── (D) getHuecosDisponibles: DOS TRAMOS ───
//    Acepta `proExtraId` y `principalSetupUid`. Si `proExtraId` no llega,
//    es 'any', o coincide con `proId` → CAMINO ACTUAL BYTE A BYTE. Si
//    llega distinto:
//      · durPrincipal ← calcularDurPrincipalCascada(servicio principal)
//      · durExtra     ← durationMin − durPrincipal (si ≤ 0 → modo mono)
//      · un slot [m, m+dur) es válido si ALGÚN candidato del principal
//        está libre en [m, m+durPrincipal) Y el segundo profesional está
//        libre en [m+durPrincipal, m+dur), cada uno dentro de SU horario.
//      · el filtro `idStaff` del servicio principal se aplica SOLO al
//        tramo A: el segundo no ejecuta el principal, ejecuta complementos.
//      · si el segundo no trabaja ese día → huecos:[] motivo:'cerrado'.
//
//    ─── (E) crearReservaPublica: reparto SIN tocar el motor compartido ───
//    Acepta `staffExtraId`. Si no llega / 'any' / igual al principal →
//    comportamiento idéntico. Si llega concreto: se valida contra
//    StaffConfig (activo y no recurso interno), el 'any' del PRINCIPAL se
//    resuelve con `durPrincipal` (su tramo real, no el total), y la guardia
//    defensiva de horario valida el tramo A contra el principal y el tramo
//    B contra el segundo.
//
//    El reparto de fases se aplica DESPUÉS de crear el pack, aquí mismo,
//    con patrón READ-MERGE-UPDATE sobre KamisuiteReservations. NO se toca
//    `crearPackReserva` (recepcionProLogic): ese motor lo comparten
//    Recepción PRO Desktop y Lite Mobile, y esta capacidad es exclusiva del
//    cliente que reserva online. El motor de packs queda intacto en
//    producción, sin despliegue ni riesgo asociado.
//
//    El bloque de reparto es NO-BLOCKING: si fallara, la reserva ya está
//    creada y queda íntegra con el profesional principal.
//
//    ─── POR QUÉ NO HACE FALTA CAMPO NUEVO EN CMS ───
//    `KamisuiteReservations.fases[].staffId` YA existe como override por
//    fase (lo escribe el drag&drop de Recepción PRO V2) y este mismo
//    archivo YA lo respeta al calcular ocupación: `f.staffId || r.staffId`
//    en las dos expansiones de reservas (motor de huecos y
//    resolverStaffLibre). Una reserva con fases repartidas entre dos
//    estilistas ya se interpreta correctamente aguas abajo.
//
// v0.8.0: 🕐 FIX GRAVE — reservas online que desbordaban el horario de
//    cierre del staff. Tres cambios coordinados. Solo afecta al widget
//    público (motor de disponibilidad online); Recepción PRO desktop
//    y móvil no se tocan (allí el operador decide manualmente).
//
//    ─── DIAGNÓSTICO DEL BUG ───
//    Caso Pilar Carbonell (Hair-Times, 8-jul-2026): reserva WEB
//    Tinte Raiz + Corte Mujer (Complemento) creada 19:00–20:20 con
//    Raquel cuyo horario es 10:00–20:00. La reserva desbordó el
//    cierre por 20 min. El motor de huecos NO validaba mal el
//    horario del staff (línea 1179 v0.7.9 hacía `m+dur > horario.to`
//    correcto); el fallo estaba en que `dur` que recibía era
//    INCOMPLETA:
//
//    · `adaptarServicio` v0.7.9 emitía `baseDuration = it.duration`
//      seco. Para un servicio complejo (cascada con PROCESO + fases
//      INCLUIDAS), ese campo solo mide la fase de aplicación, NO la
//      cascada completa. El bundle público (kr-data.js `_calc()`) suma
//      encima solo los complementos ELEGIBLES del cliente. Resultado:
//      la duración pasada a `getHuecosDisponibles` y a
//      `resolverStaffLibre` era `aplicación + complementos elegibles`,
//      sin PROCESO ni fases INCLUIDAS (Lavado / Secado).
//
//    · Al crear la reserva, `crearPackReserva` (`construirFasesPack`
//      en recepcionProLogic.web) SÍ avanza el cursor por TODO el
//      mapeoFases → `duracionTotal` real incluye TODO. Diferencia
//      típica Tinte Raiz + Corte: widget pasaba ~40–50 min, reserva
//      final era 80 min. El slot 19:00 pasaba el filtro con 40 min
//      (19:40 ≤ 20:00) pero la reserva llegaba a 20:20.
//
//    ─── (A) baseDuration = CASCADA BASE REAL ───
//    Nueva función interna `calcularBaseDurationCascada(it, porSetupUid)`
//    que recorre `mapeoFases` y devuelve la duración de la cascada
//    base (sin complementos elegibles del cliente), replicando
//    LITERALMENTE la lógica de `construirFasesPack` para las piezas
//    fijas obligatorias:
//      · Si no hay mapeoFases → devuelve `it.duration` (comportamiento
//        v0.7.9 idéntico para servicios simples y variantes sin
//        cascada).
//      · Con mapeoFases: parte de 0, antepone aplicación implícita
//        si no hay `tipo:'aplicacion'` explícita (paridad con
//        construirFasesPack), y suma:
//          — `tipo:'aplicacion'`   → `it.duration`
//          — `tipo:'proceso'`      → `f.min || it.minProceso`
//          — `tipo:'servicio'` con `obligatorio:true` y sin variantes
//            (CASO A INCLUIDA fija: Lavado, Secado) → `svc.duration`
//            + `svc.minProceso` si lo tiene (patrón materializarConProceso).
//      · NO se suman:
//          — CASO B obligatorio CON variantes (Planchado M/L/XL en
//            Botox): el widget lo emite como complemento required
//            tipo choice y ya lo suma en `_calc()`.
//          — CASO C opcional: el cliente elige, `_calc()` lo suma.
//          — Chip rojo `tipo:'exclusivo'`: opcional, ídem.
//    `adaptarServicio` reemplaza `baseDuration: toNum(it.duration)`
//    por `baseDuration: calcularBaseDurationCascada(it, porSetupUid)`.
//    Cero cambios en el resto del shape del widget: sigue siendo
//    `{ setupUid, family, name, ..., baseDuration, ... }`. El bundle
//    v2.0.16 usa `cfg.baseDuration` en `_calc()` sin saberlo — ahora
//    recibe la cifra correcta y automáticamente propaga la duración
//    total a `getHuecosDisponibles` y a `crearReservaPublica`. NO se
//    toca el bundle.
//
//    ─── (B) MARGEN DE EXTENSIÓN — `closingGraceMin` ───
//    Nuevo campo en `SalonConfig` (backend salonConfigLogic v1.0.6,
//    widget widget_salon_config v1.0.12): Número de minutos que el
//    salón autoriza que una reserva ONLINE termine DESPUÉS del `to`
//    del horario del staff. Vacío / null / no numérico → 0
//    (comportamiento estricto, corte exacto).
//    Nuevo helper interno `leerClosingGraceMin()` que consulta la
//    1ª fila de SalonConfig una sola vez por webMethod invocado.
//    Se aplica en TRES puntos del widget público (nunca en Recepción
//    PRO):
//      1. `getHuecosDisponibles`: loop y filtro usan
//         `horario.to + graceMin` como tope superior efectivo del
//         staff (líneas antes 1176 y 1179 v0.7.9).
//      2. `resolverStaffLibre`: filtro de candidatos con horario
//         que cubre el rango usa `finMin <= horario.to + graceMin`.
//         El resolvedor recibe `graceMin` como parámetro nuevo
//         (default 0 → retrocompatible: si algún caller no lo pasa,
//         corte estricto).
//      3. `crearReservaPublica`: guardia defensiva final tras
//         obtener `staffIdFinal` (sea staff concreto o resuelto
//         de 'any'), leyendo el horario del staff en el `dow` de la
//         fecha y verificando `horaHHmm + durationMin ≤ horario.to
//         + graceMin`. Si desborda → rechaza con error legible SIN
//         crear reserva. Protege contra payloads manipulados
//         (URL/DevTools) que no hayan pasado por `getHuecosDisponibles`.
//
//    ─── COMPATIBILIDAD ───
//    · Bundle v2.0.16: sin cambios.
//    · Page code /reservar v0.3.3: sin cambios.
//    · Recepción PRO desktop / móvil / Lite: sin cambios (no llaman
//      a estos webMethods públicos, y `crearPackReserva` que sí
//      comparten NO se toca).
//    · SalonConfig sin `closingGraceMin` poblado (salones que aún no
//      hayan actualizado tras v1.0.6): el helper devuelve 0 →
//      comportamiento estricto, corte exacto al `to` del staff.
//      Ningún salón queda peor que en v0.7.9.
//
// v0.7.9: 🛡️ MÁXIMA SEGURIDAD — resolución de 'Cualquiera' con DURACIÓN
//    TOTAL de la cita (bloque continuo completo). Cierra el hueco que
//    dejaba v0.7.8.
//
//    v0.7.8 resolvió el bug grave (CUALQUIERA sin empleado → invisible en
//    Recepción Pro), PERO comprobaba la disponibilidad del profesional
//    usando solo la duración BASE del principal. En cascadas con
//    complementos (p.ej. cita 12:00–15:20), eso podía asignar a alguien
//    libre al inicio pero ocupado a mitad → riesgo de solape.
//
//    LEY DEL PROYECTO (consigna registrada): el widget público va con
//    máxima seguridad — bloque continuo con la duración total, sin liberar
//    el tiempo de PROCESO al público en el arranque de V2. El tiempo de
//    PROCESO queda para Recepción PRO (70-75% del volumen, por teléfono),
//    donde el estilista ve la agenda. getHuecosDisponibles ya aplica ese
//    criterio; ahora la resolución de 'any' usa EXACTAMENTE el mismo
//    bloque continuo total que el motor de huecos validó para ofrecer la
//    hora.
//
//    FIX: crearReservaPublica recibe durationMin (duración total) del
//    payload — enviada por el bundle v2.0.16 y propagada por el page code
//    v0.3.3 — y se la pasa a resolverStaffLibre. Fallback a la duración
//    base del principal si el payload no la trae (page code antiguo).
//
//    Cero cambios en getHuecosDisponibles, resolverStaffLibre (su lógica
//    de solape ya comprueba el rango que reciba), crearPackReserva, el
//    resto de la centralita, categorías, servicios o variantes. Cero
//    cambios estéticos.
//
// v0.7.8: 🩹 FIX CRÍTICO — CUALQUIERA ('any') se resuelve a un HUMANO
//    REAL LIBRE antes de crear la reserva. Cierra el bug documentado en
//    Conceptos Fundacionales §4B.
//
//    SÍNTOMA: una reserva del widget público con profesional "Cualquiera"
//    se insertaba en KamisuiteReservations con staffId='' (crearReservaPublica
//    convertía 'any'→'' y crearPackReserva insertaba sin empleado). La cita
//    quedaba sin columna en Recepción Pro → no se pintaba, aunque SÍ existía
//    en el CMS. Las reservas con profesional concreto (Ricardo, etc.) sí se
//    pintaban. Reproducido 5-jul-2026.
//
//    CAUSA: este wrapper NUNCA resolvía 'any'. La regla §4B exige que todo
//    backend que cree una reserva resuelva 'any' a un humano real ANTES de
//    crear, o RECHACE si no hay ninguno libre. Nunca crear con staff vacío.
//
//    FIX (dos cambios, nada más):
//    (a) NUEVA función interna resolverStaffLibre({fecha, horaHHmm,
//        durationMin, idStaffPermitidos}). Replica LITERALMENTE la lógica
//        interna ya probada de getHuecosDisponibles (carga de candidatos,
//        leerHorarioStaffEnDia, cruce con KamisuiteReservations, detección
//        de solape), pero comprueba UNA hora, acumula TODOS los libres y
//        elige uno al azar (reparto de carga, mismo criterio que
//        coloracionLogic v3.2.2). Devuelve {staffId, staffName} o null.
//    (b) En crearReservaPublica, cuando staffId==='any': se llama a
//        resolverStaffLibre ANTES de delegar en crearPackReserva. Si
//        resuelve → se pasa el staffId/staffName real. Si null → se
//        RECHAZA la reserva con error explicativo (no se crea).
//    (c) La centralita de comunicaciones usa ahora staffNameFinal (nombre
//        ya resuelto) en lugar de la variable original staffName.
//
//    DURACIÓN usada para el rango del resolvedor: la duración BASE del
//    principal (ServiceCatalog.duration), dato cierto disponible en este
//    punto. La duración TOTAL con complementos vive en crearPackReserva
//    (motor de cascada) y NO se recalcula aquí para no duplicar ese motor.
//
//    Cero cambios en: getHuecosDisponibles, categorías, servicios,
//    variantes, resto de la centralita, getConstants. Cero cambios en
//    crearPackReserva ni en el bundle. Cero cambios estéticos.
//
// v0.7.7: 🎚️ VARIANTE del servicio PRINCIPAL propagada a crearPackReserva.
//    Pareja del widget bundle v2.0.15 (nuevo selector de variante del
//    principal) y del Lite Mobile v0.5.0 (mismo patrón).
//
//    Bug de siempre: crearReservaPublica NO destructuraba varianteSel
//    del payload aunque el backend crearPackReserva v1.0.25 (motor
//    Recepción PRO, 19 Jun) YA lo soportaba plenamente. Consecuencia:
//    las reservas públicas de servicios simple_variantes (Corte Mujer
//    M/L/XL, Corte Niño S/M/L, etc.) se creaban SIEMPRE a precio y
//    duración base del catálogo, ignorando la elección de variante.
//    El widget público v2.0.14 tampoco tenía selector de variante del
//    principal (nunca renderizado), así que el gap era doble: ni el
//    cliente podía elegir la variante en la UI, ni el motor sabría
//    interpretarla si le llegara.
//
//    v2.0.15 del bundle repara la UI; esta v0.7.7 del motor cierra el
//    lazo del contrato al aceptar y propagar varianteSel:
//      · Nuevo campo destructurado del payload: varianteSel (default null).
//      · Se pasa tal cual a crearPackReserva. Si es null (variante BASE
//        M o servicio sin variantes) el motor usa precio/duración base
//        del catálogo — comportamiento pre-v0.7.7 idéntico.
//      · Si trae {idx, label, price, duration}, crearPackReserva v1.0.25
//        sustituye precio/duración y refleja el label en el detalle.
//    Cambio 100% aditivo, retrocompatible: cualquier cliente que llame
//    a crearReservaPublica sin el campo sigue funcionando exactamente
//    como antes. Paridad estricta con Recepción PRO Desktop v1.1.43 y
//    Lite Mobile v0.5.0.
//    Cero cambios en adaptarServicio, en getCatalogoPublico, en el shape
//    emitido al widget, ni en ningún otro webMethod.
//
// v0.7.6: 🩹 FIX duplicación de complementos que están en grupo exclusivo.
//    Editor pareja: edicionservicios v1.14.2 (auto-marca en `complementos`
//    los servicios metidos en un chip rojo del mapeoFases, para que
//    Recepción PRO los vea en su popover de armar).
//
//    Consecuencia no deseada de ese auto-marcado: en el widget público
//    esos setupUids salían dos veces al cliente — una como toggle
//    bool/choice suelto (recorriendo `it.complementos`) y otra como
//    opción dentro del panel expandible del grupo exclusivo (recorriendo
//    mapeoFases). El fix es local a `adaptarServicio`:
//
//      · Antes de mapear `complementos` a bool/choice, se calcula un
//        Set con todos los setupUids que están en `refs` de algún item
//        tipo:'exclusivo' del mapeoFases.
//      · Se filtran esos uids del array de complementos → el bloque
//        bool/choice ya no los emite.
//      · Siguen apareciendo como opciones del type:'exclusive' — es la
//        única vía por la que el cliente los ve/elige en el widget.
//
//    Cero cambios en la lógica de precios, obligatoriedad, staff filter,
//    ni en el motor. El motor (recepcionProLogic v1.0.34) ya estaba
//    protegido por refsConsumidos, así que el fix es puramente cosmético
//    aunque necesario para no confundir al cliente en la UI.
//
// v0.7.5: 🎯 CHIP ROJO — grupo exclusivo de complementos.
//    adaptarServicio() recorre ahora el mapeoFases y detecta items de
//    tipo:'exclusivo' (nuevo). Cada uno se emite al widget como un
//    complemento adicional con:
//      · id       = 'exc:' + índice del item en el mapeo (identificador
//                   único dentro del servicio; el widget solo lo usa
//                   como key de estado, nunca lo envía al backend).
//      · label    = f.label (texto libre configurado por el salón).
//      · type     = 'exclusive'.
//      · required = false (por decisión del método: elige uno o ninguno).
//      · options  = [{ id:'none', label:'No añadir', price:0, duration:0 },
//                    ...refs resueltos a {id:setupUid, label:svc.label,
//                                          price:svc.price, duration:svc.duration}]
//    Cuando el cliente elige una opción (≠ 'none'), el widget bundle
//    envía el uid del servicio elegido en el array complementosSetupUid
//    con la forma {uid, varianteId, varianteLabel, price, duration} —
//    igual patrón que type:'choice' con variante. El motor
//    (recepcionProLogic v1.0.34) detecta el uid dentro de los `refs`
//    del item exclusivo y materializa el servicio en esa posición.
//
//    Si el servicio elegido tiene minProceso > 0, el motor lo desdobla
//    aplicación + proceso automáticamente (mismo mecanismo v1.0.34
//    aplicable a Caso A/B/C y a la nueva rama exclusivo).
//
//    Retrocompatible al 100%: los servicios cuyo mapeoFases no lleve
//    aún ningún item tipo:'exclusivo' (todos los servicios existentes
//    hoy en producción) siguen emitiendo el mismo shape que en v0.7.4.
//
// v0.7.4:
//   🔧 OBLIGATORIEDAD por FASE explícita (separación de conceptos).
//      La regla deducida de v0.7.3 ("complemento es required si su setupUid
//      aparece como fase tipo:'servicio' en mapeoFases del servicio
//      principal") rompía Tinte/Mechas/Coloración: esos servicios tienen
//      Corte/Peinado/Tratamiento en su mapeoFases ÚNICAMENTE para fijar
//      la POSICIÓN en la cascada cuando el cliente los añade, NO para
//      obligarlos. La regla v0.7.3 confundía dos conceptos (posición vs
//      obligatoriedad).
//
//      CORRECCIÓN: cada fase tipo:'servicio' del mapeoFases admite ahora
//      un flag `obligatorio` (Boolean, default false). El flag lo añade
//      el editor de servicios (edicionservicios v1.13.0) con un toggle
//      visual por chip de fase. El backend solo lee el flag.
//
//      adaptarServicio:
//      ANTES (v0.7.3):
//        cMandatory = setupUidsEnFases.has(c.setupUid)
//                                            ^ true para cualquier fase en
//                                              el mapeo (presencia = obliga)
//      AHORA (v0.7.4):
//        cMandatory = busca la fase tipo:'servicio' del mapeoFases del
//                     principal cuyo ref === c.setupUid; lee
//                     !!fase.obligatorio. Si no hay fase coincidente o no
//                     tiene el flag → false.
//
//      Aplicable tanto a complementos con variantes (type:'choice') como
//      sin variantes (type:'bool'). El resto del adapter (variantes,
//      opciones, "No añadir", precio/duración, idStaff, promoPct…) queda
//      intacto.
//
//      Default false significa que TODAS las fases existentes en el CMS
//      (que aún no llevan el flag) pasan a OPCIONALES. Botox + Planchado
//      deja de ser obligatorio hasta que se entre al editor de ese
//      servicio y se marque la fase Planchado como obligatoria. Decisión
//      de Jal — Tinte/Mechas/Coloración son varios; Botox es un caso.
//      Menos clicks de migración con default false.
//
//      Cambio simétrico al de recepcionProLogic v1.0.27. El widget bundle
//      (kamisuite-widget-bundle.js) NO se toca: ya consume `required`
//      resuelto desde aquí.
//
// v0.7.3:
//   🧩 OBLIGATORIEDAD DEDUCIDA del mapeoFases (sin campo `mandatory`).
//      Un complemento con variantes es OBLIGATORIO (required, sin opción
//      "No añadir") SI Y SOLO SI su setupUid aparece como fase tipo:'servicio'
//      en el mapeoFases del servicio principal. Si el salón coloca el
//      servicio (Planchado) como fase de la cascada, esa fase siempre ocurre
//      → elegir su variante es obligatorio. Si no está en el mapeo → opcional.
//      No requiere campo nuevo en CMS ni toggle en el editor.
//
// v0.7.2:
//   🧩 COMPLEMENTOS CON VARIANTES + OBLIGATORIOS (adaptarServicio).
//      Dos capacidades INDEPENDIENTES en cada complemento de un servicio:
//      · hasVariants → el complemento se emite como type:'choice' con una
//        opción por variante ({id:tamano_estilo, label:nombre, price:precio,
//        duration:duracion}). ANTES se mapeaba siempre como 'bool' tomando
//        solo el precio base → las variantes (Planchado M/L/XL) se anulaban.
//        FIX del bug. Si no es obligatorio, se antepone opción 'none'
//        ("No añadir", 0€) para poder no añadirlo.
//      · mandatory (campo Boolean nuevo en ServiceCatalog) → required:true.
//        El widget lo mete en el gating del botón RESERVAR (no se reserva
//        sin elegir). En choice obligatorio NO se incluye la opción 'none'.
//      El widget (kamisuite-widget-bundle v2.0.13) ya pinta y suma choice;
//      _submit ahora envía la variante elegida. crearReservaPublica usa el
//      precio/duración de la variante.
//
// v0.7.1:
//   📜 getSalonConfig() expone privacyPolicyUrl y termsConditionsUrl.
//
// v0.7.0:
//   🌈 NUEVO — Descuento promocional por servicio expuesto al widget público.
//      · adaptarServicio() ahora LEE `descuentoActivo` (Boolean) y
//        `descuentoPromo` (Number 0-100, admite null) de ServiceCatalog y
//        los proyecta como `promoPct` (Number 0-100) en el shape del
//        servicio que consume kamisuite-widget-bundle.
//      · Regla dura idéntica a la de Recepción Pro V2 / recepcionProLogic
//        v1.0.19: el descuento SOLO se aplica si `descuentoActivo === true`
//        (estricto). Si descuentoActivo=false con descuentoPromo=15 → 0.
//        Si descuentoPromo no es número o es ≤0 → 0. Clampado a [0..100].
//      · Antes (v0.6.0) `promoPct: 0` estaba HARDCODEADO → el bundle nunca
//        recibía promo aunque el CMS la tuviera activa.
//      · Cambio puramente aditivo + quirúrgico: ninguna otra función ni
//        otro campo del shape se ven afectados. Servicios sin promo siguen
//        recibiendo promoPct:0 (idéntico al comportamiento anterior).
//      · El widget bundle v2.0.10 consume este campo + lo combina con el
//        nuevo bloque "ENHORABUENA, este servicio tiene un descuento
//        promocional" en el resumen de la reserva. El widget público NO
//        cobra; el cobro real (con el descuento aplicado al neto) ocurre
//        en Recepción Pro V2 al ejecutar la cita en salón.
//
// v0.6.0:
//   🔐 NUEVO — Filtro de staff por servicio (ServiceCatalog.idStaff).
//      · adaptarServicio() añade `idStaff:[]` al shape del servicio,
//        leyendo `it.idStaff.ids` (Object Wix CMS, NO array suelto).
//        Lectura defensiva contra los 3 formatos posibles (Object,
//        Array legacy, String JSON viejo).
//      · getHuecosDisponibles acepta `idStaffPermitidos` opcional.
//        Si llega con IDs, restringe los candidatos de staff antes
//        del cruce con horarios y reservas. Si vacío/ausente → todos.
//      · crearReservaPublica valida en backend que el staffId elegido
//        está permitido por el servicio. Devuelve error si no, antes
//        de delegar en crearPackReserva. Defensa contra manipulación
//        del payload (no se confía solo en el filtro del widget).
//      · idStaff vacío [] = fallback liberal (todos los activos).
//
// v0.5.0:
//   📨 NUEVO — Integración con CENTRALITA DE COMUNICACIONES.
//      Tras crearReservaPublica exitosa, se invoca notificarConfirmacion()
//      de backend/comunicacionesLogic.web.js para disparar email + WhatsApp
//      según SalonConfig. Mismo patrón aplicado en V1 (simplesLogic v1.5.0,
//      coloracionLogic v3.2.7, tratamientosLogic v1.0.9). Llamada envuelta
//      en try/catch no-blocking: si la centralita falla, la reserva ya
//      está creada — el cliente simplemente no recibe la notificación.
//
//      Datos resueltos en el wrapper antes de invocar centralita:
//      · serviciosStr ← ServiceCatalog.label por principalSetupUid
//      · estilistaStr ← StaffConfig.displayName por fases[0].staffId
//        (necesario cuando proId='any' → crearPackReserva asigna staff
//         real pero no devuelve nombre directamente).
//      · fechaBonita ← DD/MM/YYYY (formato esperado por driver WhatsApp).
//      · horaFinal ← horaHHmm + duracionTotal devuelto por crearPackReserva.
//      · importeStr ← `${precioTotal}€`.
//      · origen ← 'Reserva Online' (V1) — distingue email del de Recepción.
//      · estadoPago ← 'Pago en salón' (las web no pagan online aún).
//
// v0.4.0:
//   ⚡ getHuecosDisponibles REAL (fase 2). Reemplaza el mock determinista.
//     · Lee StaffConfig.workingHoursSessionIds (JSON Text con items[]).
//     · Si todos los staff candidatos tienen open:false ese día →
//       huecos:[] + motivo:'cerrado' + abreA:null.
//     · Genera slots cada 15 min entre from/to del staff.
//     · Cruza con KamisuiteReservations del día (excluye CANCELADA,
//       respeta override staffId por fase desde drag&drop V2).
//     · Fases con ocupa:false (PROCESO) liberan al stylist correctamente.
//     · proId 'any' → al menos un staff libre = hueco disponible.
//     · Primer hueco visible = min(from) entre staff candidatos.
//     · Devuelve abreA y cierraA para que el widget sepa el rango real.
//   ✅ Lunes y domingo (open:false en KALONICE) ya NO generan huecos.
//
// v0.3.0:
//   + crearReservaPublica ahora envía `origenRecepcion: false` al
//     crearPackReserva (requiere recepcionProLogic >= v1.0.17).
//     Permite distinguir en agenda las citas creadas desde la web
//     pública vs las creadas por operadores en Recepción Pro.
//
// v0.2.0:
//   + NEW crearReservaPublica — wrapper público que delega en
//     crearPackReserva de recepcionProLogic. Aísla el iframe del
//     backend interno y normaliza el contrato. Acepta tanto
//     memberContactId (cliente logueado) como contactDetails (cliente
//     anónimo). Internamente esResponsabilidad del wrapper validar
//     campos mínimos antes de delegar.
//
// v0.1.0:
//   + getCategoriasPublicas, getServiciosCategoria, getProfesionalesPublicos,
//     getSalonConfig, getHuecosDisponibles (mock).
//
// PROPÓSITO:
//   Servir datos al widget público <kami-reserva> que vivirá en la web
//   pública del salón (página dinámica /reservar/<slug>). El cliente
//   anónimo puede ver categorías, elegir servicio, día, profesional y
//   hora. Crear la reserva real se hará en fase 3 vía crearPackReserva.
//
// MULTI-TENANT:
//   - Las CATEGORÍAS viven en HairSalonServices (cuenta Wix de cada salón).
//   - Los SERVICIOS viven en ServiceCatalog (misma cuenta).
//   - El mapeo categoría → servicios se hace por el campo `groupCatalog`
//     de HairSalonServices que apunta a `group` de ServiceCatalog.
//   - `groupCatalog` admite varios valores separados por coma (N:1).
//     Ejemplo: "Corte Mujer" → "cortesmujer,Niñas".
//
// COLECCIONES:
//   - HairSalonServices    (lectura: categorías públicas de la web)
//   - ServiceCatalog       (lectura: servicios reservables)
//   - StaffConfig          (lectura: profesionales)
//   - SalonConfig          (lectura: nombre del salón + widgetSkin)
//
// PERMISOS:
//   Todas las funciones son Anyone (cliente anónimo). Internamente cada
//   query usa suppressAuth: true.
//
// FASES:
//   Fase 1 (este archivo): catálogo + categorías + profesionales +
//     huecos MOCK determinista + lectura widgetSkin desde SalonConfig.
//   Fase 2: huecos reales cruzando KamisuiteReservations.
//   Fase 3: crearReservaPublica → llama a crearPackReserva existente.
//
// FUNCIONES EXPORTADAS:
//   - getCategoriasPublicas()         → categorías activas con foto + descripción
//   - getServiciosCategoria({slug})   → servicios principales de la categoría
//   - getProfesionalesPublicos()      → staff del salón + "Cualquiera"
//   - getSalonConfig()                → widgetSkin + nombre del salón
//   - getHuecosDisponibles({fecha,    → mock determinista (fase 1)
//       proId, durationMin})
// =====================================================

import { Permissions, webMethod } from 'wix-web-module';
import wixData from 'wix-data';

const VERSION = '0.9.0';
const TAG = `[WidgetPublico][${VERSION}]`;

const CMS_CATALOGO   = 'ServiceCatalog';
const CMS_CATEGORIAS = 'HairSalonServices';
const CMS_STAFF      = 'StaffConfig';
const CMS_CONFIG     = 'SalonConfig';

const USOS_PUBLICOS     = ['publico', 'ambos'];
const TIPOS_PRINCIPALES = ['principal', 'ambos'];
const NOTA_RECURSO_INTERNO = 'RECURSO INTERNO';

// =====================================================
// HELPERS
// =====================================================

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function safeErr(e) {
  return { message: e?.message || String(e) };
}

// jsonIn defensivo (idéntico patrón a recepcionProLogic v1.0.16).
// Wix Text/Object puede tener: string JSON legacy, array directo, o
// objeto envuelto con claves canónicas {items|ids|names}.
function jsonIn(v, unwrapKey) {
  if (v == null || v === '') return [];
  if (typeof v === 'string') {
    try { v = JSON.parse(v); } catch (e) { return []; }
  }
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    if (unwrapKey && Array.isArray(v[unwrapKey])) return v[unwrapKey];
    if (Array.isArray(v.items)) return v.items;
    if (Array.isArray(v.ids))   return v.ids;
    if (Array.isArray(v.names)) return v.names;
    return [];
  }
  if (Array.isArray(v)) return v;
  return [];
}

// Slug a partir de link-servicios-title: "/servicios/tratamientos-faciales"
// → "tratamientos-faciales". Tolerante a slash final, vacío y errores.
function extraerSlug(linkPath) {
  if (!linkPath) return '';
  return String(linkPath).split('/').filter(Boolean).pop() || '';
}

// Iniciales a partir de un nombre: "Verónica" → "VE", "María José" → "MJ".
function generarIniciales(nombre) {
  const palabras = String(nombre || '').trim().split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return '··';
  if (palabras.length === 1) return palabras[0].slice(0, 2).toUpperCase();
  return (palabras[0][0] + palabras[1][0]).toUpperCase();
}

// v0.8.0 — Lee `closingGraceMin` de la 1ª fila de SalonConfig.
// Margen (en minutos) que autoriza que una reserva ONLINE termine
// después del `to` del horario del staff. Vacío / null / no numérico
// / error → 0 (comportamiento estricto, corte exacto). Nunca lanza:
// si algo va mal se registra warning y se cae a 0.
// NO se cachea entre invocaciones (el salón puede cambiarlo entre
// reservas). Sí se lee UNA sola vez por webMethod invocado.
async function leerClosingGraceMin() {
  try {
    const rCfg = await wixData.query(CMS_CONFIG)
      .limit(1)
      .find({ suppressAuth: true });
    const cfg = rCfg.items?.[0];
    if (!cfg) return 0;
    const raw = Number(cfg.closingGraceMin);
    if (!Number.isFinite(raw) || raw < 0) return 0;
    return raw;
  } catch (e) {
    console.warn(`${TAG} ⚠️ leerClosingGraceMin falló (${e.message}) → 0`);
    return 0;
  }
}

// v0.8.0 — Devuelve la duración (min) de la CASCADA BASE del servicio,
// recorriendo su mapeoFases y sumando las piezas fijas obligatorias.
// Réplica literal del criterio de `construirFasesPack` (recepcionProLogic
// v1.0.37) para las piezas SIN elección del cliente. Los complementos
// elegibles del cliente los suma el widget bundle en `_calc()`.
//
//   · Sin mapeoFases (servicio simple / variantes sin cascada) →
//     devuelve `it.duration` (comportamiento v0.7.9 idéntico).
//   · Con mapeoFases → parte de 0 y recorre; si no hay `tipo:'aplicacion'`
//     explícita, antepone una implícita (paridad literal con
//     construirFasesPack líneas 1371–1374 recepcionProLogic).
//     Suma por tipo:
//       — `tipo:'aplicacion'` → `it.duration`
//       — `tipo:'proceso'`    → `f.min` si viene válido, sino `it.minProceso`
//       — `tipo:'servicio'` con `obligatorio:true` y sin variantes
//         (CASO A INCLUIDA fija, típicamente Lavado o Secado):
//           `svc.duration` + `svc.minProceso` (si lo tiene, patrón
//            del helper `materializarConProceso`).
//     No se suman:
//       — CASO B obligatorio CON variantes (Planchado M/L/XL): el widget
//         lo trata como choice required y ya lo suma en `_calc()`.
//       — CASO C opcional: el cliente elige, `_calc()` lo suma.
//       — Chip rojo `tipo:'exclusivo'`: opcional, ídem.
//       — Otros tipos desconocidos: se ignoran (defensivo, no invento).
//   · Ref huérfano (svc no encontrado en porSetupUid) → se salta ese
//     item sin fallar (mismo patrón defensivo de `construirFasesPack`
//     líneas 1447–1449).
function calcularBaseDurationCascada(it, porSetupUid) {
  const dPrincipal = toNum(it.duration);
  const mapeo = jsonIn(it.mapeoFases, 'items');
  if (!Array.isArray(mapeo) || mapeo.length === 0) {
    return dPrincipal;
  }
  const dProcesoPrincipal = toNum(it.minProceso);
  const tieneAplicacionExplicita = mapeo.some(f => f && f.tipo === 'aplicacion');
  const recorrido = tieneAplicacionExplicita
    ? mapeo
    : [{ tipo: 'aplicacion' }, ...mapeo];
  let total = 0;
  for (const f of recorrido) {
    if (!f) continue;
    if (f.tipo === 'aplicacion') {
      total += dPrincipal;
      continue;
    }
    if (f.tipo === 'proceso') {
      const fm = toNum(f.min);
      total += (fm > 0) ? fm : dProcesoPrincipal;
      continue;
    }
    if (f.tipo === 'servicio' && typeof f.ref === 'string' && f.ref && f.obligatorio === true) {
      const svc = porSetupUid && porSetupUid[f.ref];
      if (!svc) continue; // ref huérfano — patrón defensivo
      const svcHasVariants = (svc.hasVariants === true || String(svc.hasVariants) === 'true');
      if (svcHasVariants) continue; // CASO B — el widget lo suma como choice
      // CASO A: obligatoria sin variantes → aplicación + proceso propio si lo tiene.
      total += toNum(svc.duration);
      const svcMp = toNum(svc.minProceso);
      if (svcMp > 0) total += svcMp;
      continue;
    }
    // tipo:'servicio' NO obligatorio (CASO C) → opcional, el widget lo suma
    // tipo:'exclusivo' → chip rojo, opcional
    // otros tipos → ignorar (defensivo)
  }
  return total;
}

// v0.9.0 — Devuelve la duración (min) del TRAMO DEL PROFESIONAL PRINCIPAL,
// es decir, desde el inicio de la cita hasta el PUNTO DE CORTE a partir del
// cual las fases pasan al segundo profesional (el de los complementos).
//
// Mismo recorrido y mismo criterio literal que `calcularBaseDurationCascada`
// (y que `construirFasesPack` en recepcionProLogic), pero deteniéndose en el
// corte. Regla acordada con Jal el 3-ago-2026, traducción estructural de la
// línea 1854 de coloracionLogic V1 (`fase.fase === 'LAVADO' ? principal : extras`):
//
//   · CON PROCESO en el mapeo → el tramo del principal incluye todo hasta
//     el final de la PRIMERA pieza que ocupa después del proceso (el
//     "lavado" de V1). Se corta ahí.
//     Si justo después del proceso lo primero que aparece es una pieza
//     ELEGIBLE por el cliente (CASO C opcional, exclusivo, o CASO B con
//     variantes), NO se suma: el corte queda al terminar el proceso.
//     Criterio defensivo — el tramo del principal nunca contiene piezas
//     que dependan de la elección del cliente, y por eso esta duración es
//     exacta sin conocer las variantes elegidas.
//
//   · SIN PROCESO → el tramo del principal termina justo ANTES de la
//     primera pieza elegible del mapeo. Si el mapeo no tiene ninguna pieza
//     elegible, el tramo del principal es toda la cascada base (los
//     complementos elegidos se encolan detrás y van al segundo).
//
//   · Sin mapeoFases (servicio simple / variantes sin cascada) →
//     `it.duration`: el principal ejecuta el servicio y los complementos
//     encolados detrás van al segundo.
//
// Devuelve SIEMPRE un número ≥ 0. El llamante calcula
// `durExtra = durationTotal − durPrincipal` y, si sale ≤ 0, cae a modo
// mono-profesional (comportamiento v0.8.0 idéntico).
function calcularDurPrincipalCascada(it, porSetupUid) {
  const dPrincipal = toNum(it.duration);
  const mapeo = jsonIn(it.mapeoFases, 'items');
  if (!Array.isArray(mapeo) || mapeo.length === 0) {
    return dPrincipal;
  }
  const dProcesoPrincipal = toNum(it.minProceso);
  const tieneAplicacionExplicita = mapeo.some(f => f && f.tipo === 'aplicacion');
  const recorrido = tieneAplicacionExplicita
    ? mapeo
    : [{ tipo: 'aplicacion' }, ...mapeo];

  let total = 0;
  let procesoVisto = false;

  for (const f of recorrido) {
    if (!f) continue;

    if (f.tipo === 'aplicacion') {
      total += dPrincipal;
      continue;
    }

    if (f.tipo === 'proceso') {
      const fm = toNum(f.min);
      total += (fm > 0) ? fm : dProcesoPrincipal;
      procesoVisto = true;
      continue;
    }

    // Chip rojo (grupo exclusivo) = siempre elegible por el cliente → CORTE.
    if (f.tipo === 'exclusivo') {
      return total;
    }

    if (f.tipo === 'servicio' && typeof f.ref === 'string' && f.ref) {
      const svc = porSetupUid && porSetupUid[f.ref];
      if (!svc) continue; // ref huérfano — patrón defensivo de construirFasesPack

      const esObligatoria = (f.obligatorio === true);
      const svcHasVariants = (svc.hasVariants === true || String(svc.hasVariants) === 'true');

      // Elegible por el cliente: CASO C (opcional) o CASO B (obligatoria
      // con variantes, el cliente elige cuál). En ambos casos → CORTE.
      if (!esObligatoria || svcHasVariants) {
        return total;
      }

      // CASO A: obligatoria sin variantes (Lavado, Secado). Pieza base.
      total += toNum(svc.duration);
      const svcMp = toNum(svc.minProceso);
      if (svcMp > 0) total += svcMp;

      // Con proceso ya visto, ESTA es la primera pieza que ocupa después
      // del proceso — el "lavado" de V1. Se queda con el principal y se
      // corta aquí.
      if (procesoVisto) return total;
      continue;
    }

    // Otros tipos desconocidos → ignorar (defensivo, no invento).
  }

  // Recorrido completo sin corte: toda la cascada base es del principal.
  return total;
}

// =====================================================
// ADAPTER · ServiceCatalog row → contrato del widget <kami-reserva>
// =====================================================
// Mapea un registro de ServiceCatalog al shape que espera kr-data.js:
//   { family, name, basePrice, baseDuration, promoPct, requiresExtraPro,
//     complements: [{ id, label, hint, type, price, duration }, ...] }
// Campos extra propios de KAMISUITE que se conservan para que el widget
// los use al pintar la cabecera y para variantes:
//   setupUid, description, image, hasVariants, variantes, claseServicio.
//
// REGLAS:
//   - Precio 0 o no informado → basePrice = null ("a valorar").
//   - Complementos: cada setupUid de ServiceCatalog.complementos se resuelve
//     al registro completo y se mapea como complement tipo "bool".
//     Si quisieras complementos tipo "choice" (ej. "Acabado": Secado/Corto/
//     Medio/Largo), el catálogo aún no los modela. Lo planteamos cuando
//     aparezca el primer caso real.
//   - Variantes: se pasan al widget en bruto. El widget actual no las
//     maneja todavía; se conectarán en la segunda iteración del widget.
//   - requiresExtraPro: false por ahora (no lo modela el catálogo).
//     El widget puede ocultar el bloque sin problema (deuda v1.0).

function adaptarServicio(it, porSetupUid) {
  // v0.7.4 — OBLIGATORIEDAD por FASE explícita. Cada fase tipo:'servicio'
  // del mapeoFases admite el flag `obligatorio` (Boolean, default false).
  // Si esa fase coincide en `ref` con el setupUid de un complemento, su
  // flag dicta si el complemento es required. Si no hay fase coincidente
  // o no tiene el flag → opcional.
  //
  // Esto separa POSICIÓN (mapeoFases dicta dónde encaja el complemento
  // en la cascada si se elige) de OBLIGATORIEDAD (lo dicta el flag de la
  // fase). La regla v0.7.3 mezclaba ambas cosas y rompía Tinte/Mechas/
  // Coloración. El flag lo añade el editor (edicionservicios v1.13.0).
  const mapeo = jsonIn(it.mapeoFases, 'items');
  const fasePorRef = {};
  if (Array.isArray(mapeo)) {
    for (const f of mapeo) {
      if (f && f.tipo === 'servicio' && typeof f.ref === 'string' && f.ref) {
        fasePorRef[f.ref] = f;
      }
    }
  }

  const complementosUidsRaw = jsonIn(it.complementos, 'items');

  // v0.7.6 — Set de setupUids que YA salen como opción dentro de algún
  // item tipo:'exclusivo' del mapeoFases. Deben excluirse del bloque
  // bool/choice para no duplicar: el editor v1.14.2 auto-marca esos
  // servicios en `it.complementos` (para que Recepción PRO los vea en
  // el popover del servicio), pero en el widget público solo deben
  // aparecer como opciones del panel del grupo exclusivo.
  const uidsEnExclusivos = new Set();
  if (Array.isArray(mapeo)) {
    for (const f of mapeo) {
      if (!f || f.tipo !== 'exclusivo' || !Array.isArray(f.refs)) continue;
      for (const r of f.refs) if (typeof r === 'string' && r) uidsEnExclusivos.add(r);
    }
  }

  const complementosUids = (Array.isArray(complementosUidsRaw) ? complementosUidsRaw : [])
    .filter(uid => !uidsEnExclusivos.has(uid));

  const complements = complementosUids
    .map(uid => porSetupUid[uid])
    .filter(Boolean)
    .map(c => {
      // hasVariants → 'choice' (una opción por variante).
      // required    → lee !!fase.obligatorio de la fase del mapeoFases.
      const cTieneVariantes = !!c.hasVariants;
      const faseEnMapeo = fasePorRef[c.setupUid];
      const cMandatory = !!(faseEnMapeo && faseEnMapeo.obligatorio === true);

      if (cTieneVariantes) {
        // Variantes del complemento: {nombre, precio, duracion, tamano_estilo}
        const vars = jsonIn(c.variantes, 'items');
        const opts = (Array.isArray(vars) ? vars : [])
          .map((v, i) => ({
            id: (v && typeof v.tamano_estilo === 'string' && v.tamano_estilo.trim())
                  ? v.tamano_estilo.trim()
                  : ('v' + i),
            label: (v && v.nombre) ? String(v.nombre) : ('Opción ' + (i + 1)),
            price: toNum(v && v.precio),
            duration: toNum(v && v.duracion)
          }));

        // Opcional → se antepone "No añadir". Obligatorio → sin "No añadir".
        const options = cMandatory
          ? opts
          : [{ id: 'none', label: 'No añadir', price: 0, duration: 0 }, ...opts];

        return {
          id: c.setupUid,
          label: c.label || '',
          hint: c.descripcion || '',
          type: 'choice',
          required: cMandatory,
          options
        };
      }

      // Sin variantes → complemento booleano (sí/no), como hasta ahora.
      return {
        id: c.setupUid,
        label: c.label || '',
        hint: c.descripcion || '',
        type: 'bool',
        required: cMandatory,   // bool obligatorio = debe ser "Sí"
        price: toNum(c.price),
        duration: toNum(c.duration)
      };
    });

  // v0.7.5 — CHIP ROJO. Recorrer mapeoFases buscando items tipo:'exclusivo'
  // y añadirlos al array de complements como type:'exclusive'.
  // Cada opción se resuelve al registro completo del servicio para leer
  // label, price y duration del catálogo (cero hardcoding, valores vivos).
  // Refs huérfanos (servicio borrado o inactivo del catálogo) se omiten
  // silenciosamente.
  if (Array.isArray(mapeo)) {
    mapeo.forEach((f, idx) => {
      if (!f || f.tipo !== 'exclusivo') return;
      if (!Array.isArray(f.refs) || f.refs.length === 0) return;
      const opts = f.refs
        .map(r => porSetupUid[r])
        .filter(Boolean)
        .map(svc => ({
          id: svc.setupUid,
          label: svc.label || '',
          price: toNum(svc.price),
          duration: toNum(svc.duration)
        }));
      if (opts.length === 0) return;
      complements.push({
        id: 'exc:' + idx,
        label: (typeof f.label === 'string' && f.label.trim()) ? f.label.trim() : 'Elige uno',
        hint: '',
        type: 'exclusive',
        required: false,
        options: [{ id: 'none', label: 'No añadir', price: 0, duration: 0 }, ...opts]
      });
    });
  }

  const hasVariants = !!it.hasVariants;
  const variantes = hasVariants ? jsonIn(it.variantes, 'items') : [];

  const priceNum = toNum(it.price);
  const basePrice = priceNum > 0 ? priceNum : null;

  // v0.6.0 — idStaff filtra qué profesionales pueden ejecutar este
  // servicio. Es campo Object con shape {ids:[...]}, NO string ni
  // array suelto (ver IDS_QUE_SIEMPRE_PEDIMOS.md). Lectura defensiva
  // contra los 3 formatos por si una fila legacy aún no migró:
  //   · Object con .ids → caso normal.
  //   · Array directo   → legacy.
  //   · String JSON     → legacy más viejo.
  let idStaffArr = [];
  const rawIdStaff = it.idStaff;
  if (rawIdStaff) {
    if (Array.isArray(rawIdStaff.ids)) idStaffArr = rawIdStaff.ids;
    else if (Array.isArray(rawIdStaff)) idStaffArr = rawIdStaff;
    else if (typeof rawIdStaff === 'string') {
      try {
        const p = JSON.parse(rawIdStaff);
        if (Array.isArray(p?.ids)) idStaffArr = p.ids;
        else if (Array.isArray(p)) idStaffArr = p;
      } catch (_) {}
    }
  }
  idStaffArr = idStaffArr.filter(s => typeof s === 'string' && s.length > 0);

  return {
    setupUid: it.setupUid || '',
    family: it.group || '',
    name: it.label || '',
    description: it.descripcion || '',
    image: it.image || null,
    basePrice,
    // v0.8.0 — Duración TOTAL de la cascada base (aplicación + PROCESO +
    // fases INCLUIDAS obligatorias sin variantes). Los complementos
    // elegibles del cliente se suman encima en el widget bundle `_calc()`.
    // Cierra el bug de reservas online que desbordaban el cierre del staff
    // (caso Pilar Carbonell 8-jul-2026: Tinte Raiz + Corte Mujer complemento
    // se reservaba con dur del widget = aplicación + corte, pero la reserva
    // real incluía además PROCESO + Lavado + Secado → desbordaba el `to`).
    // Sin mapeoFases: comportamiento idéntico a v0.7.9 (it.duration seco).
    baseDuration: calcularBaseDurationCascada(it, porSetupUid),
    // v0.7.0 — descuento promocional desde ServiceCatalog. Regla dura
    // idéntica a Recepción Pro V2 (recepcionProLogic v1.0.19):
    //   · Solo si descuentoActivo === true (estricto, NO != false).
    //   · descuentoPromo debe ser número finito > 0; null/undefined/string → 0.
    //   · Clampado a [0..100].
    promoPct: (it.descuentoActivo === true
               && typeof it.descuentoPromo === 'number'
               && Number.isFinite(it.descuentoPromo)
               && it.descuentoPromo > 0)
      ? Math.min(100, Math.max(0, it.descuentoPromo))
      : 0,
    hasVariants,
    variantes,
    // v0.9.0 — Deja de estar clavado en `false`. El bloque "Profesional
    // para los complementos" del bundle solo tiene sentido si hay algo que
    // repartir: sin complementos elegibles, no hay segundo profesional.
    // El bundle v2.0.17 añade encima la condición de que el cliente haya
    // MARCADO al menos uno.
    requiresExtraPro: Array.isArray(complements) && complements.length > 0,
    complements,
    claseServicio: it.claseServicio || '',
    idStaff: idStaffArr,   // v0.6.0 — wixResourceIds permitidos. [] = todos.
    order: toNum(it.order)
  };
}

// =====================================================
// 1 · GET CATEGORÍAS PÚBLICAS
// =====================================================
// Devuelve las categorías activas de HairSalonServices ordenadas por orden.
// Útil tanto para construir el repeater de la página de inicio de reservas
// (si Jal lo quiere CMS-first más adelante) como para resolver una categoría
// por slug.
//
// Forma devuelta:
//   { ok, categorias: [{ _id, title, subtitle, description, image,
//     orden, slug, groupCatalog, linkServiciosTitle }] }
export const getCategoriasPublicas = webMethod(
  Permissions.Anyone,
  async () => {
    const t0 = Date.now();
    try {
      const r = await wixData.query(CMS_CATEGORIAS)
        .eq('activo', true)
        .ascending('orden')
        .limit(100)
        .find({ suppressAuth: true });

      const cats = (r.items || []).map(it => ({
        _id: it._id,
        title: it.title || '',
        subtitle: it.subtitle || '',
        description: it.description || '',
        image: it.image || null,
        orden: toNum(it.orden),
        slug: extraerSlug(it['link-servicios-title']),
        groupCatalog: it.groupCatalog || '',
        linkServiciosTitle: it['link-servicios-title'] || ''
      }));

      console.log(`${TAG} ✅ getCategoriasPublicas: ${cats.length} categorías. ${((Date.now()-t0)/1000).toFixed(2)}s`);
      return { ok: true, version: VERSION, categorias: cats };

    } catch (e) {
      console.error(`${TAG} ❌ getCategoriasPublicas:`, e.message);
      return { ok: false, version: VERSION, error: safeErr(e), categorias: [] };
    }
  }
);

// =====================================================
// 2 · GET SERVICIOS DE UNA CATEGORÍA
// =====================================================
// Resuelve los servicios principales de una categoría dada por su slug
// (preferido) o directamente por groupCatalog. Internamente:
//   1) Si llega slug, lo busca en HairSalonServices y lee su groupCatalog.
//   2) Hace split(',') por si la categoría agrupa varios `group` del
//      ServiceCatalog (ej. Corte Mujer = "cortesmujer,Niñas").
//   3) Carga TODOS los servicios públicos activos (incluye los que solo
//      son complementos) para construir el índice porSetupUid y resolver
//      complementos del adapter.
//   4) Filtra los servicios PRINCIPALES de los groups solicitados y los
//      adapta al contrato del widget.
//
// Forma devuelta:
//   { ok, servicios: [adaptedService, ...], groupsAplicados: ['coloracion', ...],
//     categoria: { title, subtitle, description, image } }
export const getServiciosCategoria = webMethod(
  Permissions.Anyone,
  async ({ slug, groupCatalog } = {}) => {
    const t0 = Date.now();
    try {
      // 1. Resolver groupCatalog desde slug si hace falta
      let gc = groupCatalog;
      let categoria = null;

      if (slug) {
        const r = await wixData.query(CMS_CATEGORIAS)
          .eq('activo', true)
          .limit(100)
          .find({ suppressAuth: true });
        const match = (r.items || []).find(it =>
          extraerSlug(it['link-servicios-title']) === slug
        );
        if (match) {
          gc = match.groupCatalog || '';
          categoria = {
            _id: match._id,
            title: match.title || '',
            subtitle: match.subtitle || '',
            description: match.description || '',
            image: match.image || null,
            slug,
            linkServiciosTitle: match['link-servicios-title'] || ''
          };
        }
      }

      if (!gc) {
        console.warn(`${TAG} ⚠️ getServiciosCategoria: groupCatalog no resuelto (slug=${slug})`);
        return { ok: false, version: VERSION, error: { message: 'Categoría no encontrada' }, servicios: [], categoria: null };
      }

      // 2. Split por coma (N:1 — Depilacion, Corte Mujer, Hombre…)
      const groups = String(gc).split(',').map(s => s.trim()).filter(Boolean);

      // 3. Cargar TODOS los servicios públicos activos
      const r2 = await wixData.query(CMS_CATALOGO)
        .eq('active', true)
        .hasSome('uso', USOS_PUBLICOS)
        .limit(1000)
        .find({ suppressAuth: true });

      const all = r2.items || [];
      const porSetupUid = {};
      for (const it of all) if (it.setupUid) porSetupUid[it.setupUid] = it;

      // 4. Filtrar principales del/los group(s) y adaptar
      const servicios = all
        .filter(it => groups.includes(it.group) && TIPOS_PRINCIPALES.includes(it.tipo))
        .sort((a, b) => toNum(a.order) - toNum(b.order))
        .map(it => adaptarServicio(it, porSetupUid));

      console.log(`${TAG} ✅ getServiciosCategoria slug=${slug || '∅'} groups=[${groups.join(',')}]: ${servicios.length} servicios. ${((Date.now()-t0)/1000).toFixed(2)}s`);
      return { ok: true, version: VERSION, servicios, groupsAplicados: groups, categoria };

    } catch (e) {
      console.error(`${TAG} ❌ getServiciosCategoria:`, e.message);
      return { ok: false, version: VERSION, error: safeErr(e), servicios: [], categoria: null };
    }
  }
);

// =====================================================
// 3 · GET PROFESIONALES PÚBLICOS
// =====================================================
// Mismo patrón que getStaffColumnas de recepcionProLogic, pero con shape
// para el widget público (id + name + initials + profileImage).
// Excluye recursos internos (CUALQUIERA, PROCESO) marcados con la nota
// "RECURSO INTERNO" o cuyo canonicalName sea CUALQUIERA/PROCESO.
// Antepone un pseudo-pro "Cualquiera" con id 'any' que el widget usa
// como wildcard de UI (igual que V1).
export const getProfesionalesPublicos = webMethod(
  Permissions.Anyone,
  async () => {
    const t0 = Date.now();
    try {
      const r = await wixData.query(CMS_STAFF)
        .eq('active', true)
        .limit(100)
        .find({ suppressAuth: true });

      const items = r.items || [];
      const reales = items
        .filter(it => {
          if (String(it.notes || '').includes(NOTA_RECURSO_INTERNO)) return false;
          const canon = String(it.canonicalName || '').toUpperCase();
          if (canon === 'CUALQUIERA' || canon === 'PROCESO') return false;
          return true;
        })
        .map(it => {
          const name = (it.displayName || it.canonicalName || '').replace(/^[A-Z]_/, '');
          return {
            id: it.wixResourceId || it._id,
            wixResourceId: it.wixResourceId || it._id,
            wixScheduleId: it.wixScheduleId || '',
            name,
            initials: generarIniciales(name),
            profileImage: it.profileImage || '',
            any: false
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name));

      const cualquiera = {
        id: 'any', wixResourceId: 'any',
        name: 'Cualquiera', initials: '··',
        profileImage: '', any: true
      };

      console.log(`${TAG} ✅ getProfesionalesPublicos: ${reales.length} reales + 1 wildcard. ${((Date.now()-t0)/1000).toFixed(2)}s`);
      return { ok: true, version: VERSION, profesionales: [cualquiera, ...reales] };

    } catch (e) {
      console.error(`${TAG} ❌ getProfesionalesPublicos:`, e.message);
      return { ok: false, version: VERSION, error: safeErr(e), profesionales: [] };
    }
  }
);

// =====================================================
// 4 · GET SALON CONFIG (solo lo que el widget necesita)
// =====================================================
// Lee la primera fila de SalonConfig (1 fila por salón en su cuenta Wix).
// Devuelve únicamente lo que el widget público necesita:
//   - widgetSkin: id del skin a aplicar (niebla, arena, lumiere, …,
//                 oceano). Default 'niebla' si no está informado.
//   - salonName: para texto de confirmación / agradecimiento.
//
// NOTA: el campo widgetSkin debe crearse en SalonConfig (Text). Mientras
// no exista o esté vacío, devuelve 'niebla'.
export const getSalonConfig = webMethod(
  Permissions.Anyone,
  async () => {
    try {
      const r = await wixData.query(CMS_CONFIG)
        .limit(1)
        .find({ suppressAuth: true });

      const c = (r.items || [])[0] || {};
      return {
        ok: true,
        version: VERSION,
        config: {
          salonName: c.salonName || c.name || '',
          widgetSkin: c.widgetSkin || 'niebla',
          privacyPolicyUrl: c.privacyPolicyUrl || '',
          termsConditionsUrl: c.termsConditionsUrl || ''
        }
      };

    } catch (e) {
      console.error(`${TAG} ❌ getSalonConfig:`, e.message);
      return { ok: false, version: VERSION, error: safeErr(e), config: { salonName: '', widgetSkin: 'niebla', privacyPolicyUrl: '', termsConditionsUrl: '' } };
    }
  }
);

// =====================================================
// 5 · GET HUECOS DISPONIBLES (real, fase 2)
// =====================================================
// v0.4.0 — Implementación real. Sustituye al mock determinista.
//
// LECTURA DE HORARIOS:
//   StaffConfig.workingHoursSessionIds — JSON Text con forma:
//     {"items":[{"dow":0,"open":false},
//               {"dow":2,"open":true,"from":"10:00","to":"19:00"}, ...]}
//   dow = Date.getDay() (0=Domingo, 1=Lunes, ..., 6=Sábado)
//
// REGLAS:
//   · Si TODOS los staff candidatos tienen `open:false` ese día →
//     huecos: [], motivo: 'cerrado'.
//   · Si proId === 'any' → unión de huecos de TODOS los staff activos
//     (al menos un staff libre = hueco disponible).
//   · Si proId concreto → solo ese staff.
//   · El primer hueco visible = min(from) entre staff candidatos.
//   · El último slot generado debe terminar antes de max(to).
//   · Paso entre slots = 15 min (granularidad común salón).
//   · Cruce con KamisuiteReservations del día (mismas reglas que
//     Recepción Pro): un slot está ocupado si su rango [slot, slot+dur)
//     se solapa con alguna reserva existente del staff.
//   · status 'CANCELADA' se excluye del cruce.
//
// ENTRADA:
//   { fecha: 'YYYY-MM-DD', proId: '<id>' | 'any', durationMin: number }
// SALIDA:
//   { ok, huecos: ['10:00', '10:15', ...], fecha, proId, durationMin,
//     motivo: 'cerrado' | undefined, abreA: 'HH:mm' | null }
//
// `abreA` informa al widget de la hora de apertura para que sepa
// dónde empezar a pintar el primer chip aunque haya huecos vacíos.

const SLOT_STEP = 15;   // minutos entre slots

function parseHHMM(s) {
  const m = String(s || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = +m[1], mi = +m[2];
  if (h < 0 || h > 23 || mi < 0 || mi > 59) return null;
  return h * 60 + mi;
}

function fmtHHMM(min) {
  const h = Math.floor(min / 60), m = min % 60;
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

// Lee horario {from,to} del staff para un dow concreto.
// Devuelve null si está cerrado, no tiene horario configurado, o no parsea.
function leerHorarioStaffEnDia(staffRow, dow) {
  const raw = staffRow?.workingHoursSessionIds;
  if (!raw) return null;
  let items = [];
  try {
    if (typeof raw === 'string') {
      const obj = JSON.parse(raw);
      items = Array.isArray(obj?.items) ? obj.items : (Array.isArray(obj) ? obj : []);
    } else if (raw && typeof raw === 'object') {
      items = Array.isArray(raw.items) ? raw.items : (Array.isArray(raw) ? raw : []);
    }
  } catch (e) {
    console.warn(`${TAG} ⚠️ workingHours JSON inválido (${staffRow?.canonicalName || staffRow?._id}):`, e.message);
    return null;
  }
  const day = items.find(it => Number(it?.dow) === dow);
  if (!day || !day.open) return null;
  const from = parseHHMM(day.from);
  const to = parseHHMM(day.to);
  if (from == null || to == null || from >= to) return null;
  return { from, to };
}

// =====================================================
// v0.7.8 — RESOLVER "CUALQUIERA" ('any') A UN HUMANO REAL LIBRE
// =====================================================
// Cierra el bug crítico documentado en Conceptos Fundacionales §4B:
// una reserva del widget público con profesional 'any' se insertaba en
// KamisuiteReservations con staffId='' → Recepción Pro no la pintaba en
// ninguna columna. crearReservaPublica NUNCA resolvía el 'any'.
//
// Esta función replica LITERALMENTE la lógica interna ya probada en
// producción de getHuecosDisponibles (misma carga de candidatos, misma
// lectura de horario con leerHorarioStaffEnDia, mismo cruce con
// KamisuiteReservations y misma detección de solape), pero en lugar de
// barrer todos los slots del día:
//   · comprueba UNA sola hora (la solicitada),
//   · NO hace break al primer libre: acumula TODOS los staff libres,
//   · elige uno al azar (reparto de carga, mismo criterio que el
//     patrón coloracionLogic v3.2.2 resolverCualquieraAHumanoLibre),
//   · si NINGUNO está libre → devuelve null (el llamador rechaza la
//     reserva, nunca la crea sin humano).
//
// Devuelve: { staffId, staffName } del elegido, o null si nadie libre.
// idStaffPermitidos: array de wixResourceId permitidos para el servicio
//   (ServiceCatalog.idStaff.ids). Vacío/no-array → fallback liberal
//   (todos los activos), idéntico a getHuecosDisponibles.
// v0.8.0 — Firma ampliada: `graceMin` (número, default 0) representa el
// margen del salón que autoriza que la reserva termine hasta N minutos
// después del `to` del horario del staff. Retrocompatible: si algún caller
// no lo pasa, el valor por defecto 0 mantiene el corte estricto v0.7.9.
async function resolverStaffLibre({ fecha, horaHHmm, durationMin, idStaffPermitidos, graceMin = 0 }) {
  const dur = toNum(durationMin) || 60;
  const grace = Number.isFinite(Number(graceMin)) && Number(graceMin) >= 0 ? Number(graceMin) : 0;
  const inicioMin = parseHHMM(horaHHmm);
  if (inicioMin == null) {
    console.warn(`${TAG} resolverStaffLibre: horaHHmm inválida "${horaHHmm}"`);
    return null;
  }
  if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(String(fecha))) {
    console.warn(`${TAG} resolverStaffLibre: fecha inválida "${fecha}"`);
    return null;
  }
  const finMin = inicioMin + dur;

  // dow del día solicitado (interpretado como local Madrid) — igual que
  // getHuecosDisponibles.
  const [y, mo, d] = String(fecha).split('-').map(Number);
  const dow = new Date(y, mo - 1, d).getDay(); // 0..6

  // Filtro de staff permitidos para el servicio (mismo criterio).
  const permitidosSet = (Array.isArray(idStaffPermitidos) && idStaffPermitidos.length)
    ? new Set(idStaffPermitidos.map(String))
    : null;

  // 1) Cargar staff candidatos (idéntico a getHuecosDisponibles).
  const rStaff = await wixData.query(CMS_STAFF)
    .eq('active', true)
    .limit(100)
    .find({ suppressAuth: true });
  let candidatos = (rStaff.items || []).filter(it => {
    if (String(it.notes || '').includes(NOTA_RECURSO_INTERNO)) return false;
    const canon = String(it.canonicalName || '').toUpperCase();
    if (canon === 'CUALQUIERA' || canon === 'PROCESO') return false;
    if (permitidosSet) {
      const sid = it.wixResourceId || it._id;
      if (!permitidosSet.has(String(sid))) return false;
    }
    return true;
  });

  // 2) Solo candidatos con horario abierto ese día que cubra el rango
  //    [inicio, fin) de la cita.
  // v0.8.0 — tope superior del staff extendido por `graceMin`
  // (SalonConfig.closingGraceMin). Con grace=0 → comportamiento estricto
  // v0.7.9 idéntico.
  const disponibles = candidatos
    .map(s => ({ staff: s, horario: leerHorarioStaffEnDia(s, dow) }))
    .filter(h => h.horario)
    .filter(h => inicioMin >= h.horario.from && finMin <= h.horario.to + grace);

  if (!disponibles.length) {
    console.log(`${TAG} resolverStaffLibre: 0 staff con horario para ${fecha} ${horaHHmm} dow=${dow}`);
    return null;
  }

  // 3) Cargar reservas del día para cruce (idéntico a getHuecosDisponibles).
  const startUTC = new Date(new Date(`${fecha}T00:00:00`).getTime() - 3 * 3600000);
  const endUTC = new Date(new Date(`${fecha}T23:59:59`).getTime() + 3 * 3600000);
  const rRes = await wixData.query('KamisuiteReservations')
    .ge('fechaReserva', startUTC)
    .le('fechaReserva', endUTC)
    .ne('status', 'CANCELADA')
    .limit(500)
    .find({ suppressAuth: true });

  // Expandir reservas en intervalos {staffId, startMin, endMin}
  // (mismo tratamiento de fases con ocupa:false y reservas a medida).
  const ocupados = [];
  for (const r of (rRes.items || [])) {
    const fasesArr = jsonIn(r.fases, 'items');
    if (!Array.isArray(fasesArr) || !fasesArr.length) {
      if (r.fechaReserva && r.duracionTotal) {
        const start = new Date(r.fechaReserva);
        const ymd = start.toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });
        if (ymd === fecha) {
          const startMin = parseHHMM(start.toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hour12: false }));
          if (startMin != null) {
            ocupados.push({ staffId: r.staffId, startMin, endMin: startMin + (Number(r.duracionTotal) || 0) });
          }
        }
      }
      continue;
    }
    for (const f of fasesArr) {
      if (f?.ocupa === false) continue;     // PROCESO libera al stylist
      if (!f.start || !f.end) continue;
      const ds = new Date(f.start);
      const de = new Date(f.end);
      const ymd = ds.toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });
      if (ymd !== fecha) continue;
      const sm = parseHHMM(ds.toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hour12: false }));
      const em = parseHHMM(de.toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hour12: false }));
      if (sm == null || em == null) continue;
      const sid = f.staffId || r.staffId || '';
      ocupados.push({ staffId: sid, startMin: sm, endMin: em });
    }
  }

  // 4) De los disponibles, quedarnos con los que NO tienen solape en el
  //    rango solicitado (misma condición de solape que getHuecosDisponibles).
  const libres = [];
  for (const { staff } of disponibles) {
    const sid = staff.wixResourceId || staff._id;
    const haySolape = ocupados.some(o =>
      o.staffId && o.staffId === sid &&
      inicioMin < o.endMin && finMin > o.startMin
    );
    if (!haySolape) {
      libres.push({
        staffId: sid,
        staffName: (staff.displayName || staff.canonicalName || '')
      });
    }
  }

  if (!libres.length) {
    console.log(`${TAG} resolverStaffLibre: 0 staff LIBRE a ${fecha} ${horaHHmm} (${disponibles.length} con horario, todos ocupados)`);
    return null;
  }

  // 5) Elegir uno al azar (reparto de carga, mismo criterio que
  //    coloracionLogic v3.2.2).
  const elegido = libres[Math.floor(Math.random() * libres.length)];
  console.log(`${TAG} resolverStaffLibre: 'any' → ${elegido.staffName || elegido.staffId} (${libres.length} libre/s de ${disponibles.length})`);
  return elegido;
}

export const getHuecosDisponibles = webMethod(
  Permissions.Anyone,
  async ({ fecha, proId, durationMin, idStaffPermitidos, proExtraId, principalSetupUid } = {}) => {
    const t0 = Date.now();
    try {
      const dur = toNum(durationMin) || 60;
      if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(String(fecha))) {
        return { ok: false, version: VERSION, error: { message: 'fecha inválida' }, huecos: [] };
      }
      // dow del día solicitado (interpretado como local Madrid)
      const [y, mo, d] = fecha.split('-').map(Number);
      const dow = new Date(y, mo - 1, d).getDay(); // 0..6

      // v0.8.0 — margen del salón (SalonConfig.closingGraceMin). Aplicado
      // como extensión del `to` del horario del staff en el filtro/loop
      // de slots. Vacío / null / error → 0 (comportamiento estricto).
      const graceMin = await leerClosingGraceMin();

      // v0.6.0 — filtro de staff permitidos para este servicio.
      // idStaffPermitidos viene de ServiceCatalog.idStaff.ids del servicio
      // que el cliente eligió. Si está vacío o no llega → fallback liberal
      // (todos los activos pueden hacerlo). Si tiene IDs → restringe.
      const permitidosSet = (Array.isArray(idStaffPermitidos) && idStaffPermitidos.length)
        ? new Set(idStaffPermitidos.map(String))
        : null;

      // 1) Cargar staff candidatos
      const rStaff = await wixData.query(CMS_STAFF)
        .eq('active', true)
        .limit(100)
        .find({ suppressAuth: true });

      // v0.9.0 — `activos` = humanos reales del salón, SIN el filtro
      // idStaff del servicio principal. Se separa para poder resolver el
      // segundo profesional (tramo de complementos), que NO ejecuta el
      // servicio principal y por tanto no debe filtrarse por su idStaff.
      // `candidatos` mantiene EXACTAMENTE el filtro de v0.6.0/v0.8.0.
      const activos = (rStaff.items || []).filter(it => {
        if (String(it.notes || '').includes(NOTA_RECURSO_INTERNO)) return false;
        const canon = String(it.canonicalName || '').toUpperCase();
        if (canon === 'CUALQUIERA' || canon === 'PROCESO') return false;
        return true;
      });

      let candidatos = activos.filter(it => {
        // v0.6.0 — solo staff permitidos para el servicio elegido.
        if (permitidosSet) {
          const sid = it.wixResourceId || it._id;
          if (!permitidosSet.has(String(sid))) return false;
        }
        return true;
      });

      if (proId && proId !== 'any') {
        candidatos = candidatos.filter(s =>
          s.wixResourceId === proId || s._id === proId
        );
        if (!candidatos.length) {
          // v0.6.0 — staff concreto no encontrado o no permitido para este servicio.
          return { ok: false, version: VERSION, error: { message: 'Staff no disponible para este servicio' }, huecos: [] };
        }
      }

      // 2) Determinar horario del día por staff
      const horariosStaff = candidatos.map(s => ({
        staff: s,
        horario: leerHorarioStaffEnDia(s, dow)
      }));
      const disponibles = horariosStaff.filter(h => h.horario);

      if (!disponibles.length) {
        console.log(`${TAG} 🚫 ${fecha} dow=${dow}: salón cerrado (0 staff abierto)`);
        return {
          ok: true, version: VERSION, fecha, proId, durationMin: dur,
          huecos: [], motivo: 'cerrado', abreA: null
        };
      }

      // 3) Rango global [minFrom, maxTo] entre staff abiertos
      const minFrom = Math.min(...disponibles.map(h => h.horario.from));
      const maxTo = Math.max(...disponibles.map(h => h.horario.to));

      // ─────────────────────────────────────────────────────────────
      // 3-bis) v0.9.0 — MODO DOS TRAMOS (segundo profesional)
      // ─────────────────────────────────────────────────────────────
      // Si el cliente eligió un profesional distinto para los complementos,
      // la cita se parte en dos tramos CONTIGUOS:
      //     TRAMO A  [m, m+durPrincipal)  → profesional principal
      //     TRAMO B  [m+durPrincipal, m+dur) → profesional de complementos
      // El punto de corte lo calcula `calcularDurPrincipalCascada` sobre el
      // mapeoFases del servicio principal (ver cabecera v0.9.0 (B)).
      //
      // `durPrincipal` se mide con EL MISMO mapa `porSetupUid` que usa
      // `calcularBaseDurationCascada` para `baseDuration` (misma query:
      // active + uso público). Es deliberado: así `durExtra = dur −
      // durPrincipal` es coherente con la duración total que el bundle
      // calculó a partir de ese mismo `baseDuration`, sea cual sea el
      // contenido del catálogo.
      //
      // Cualquier condición que no se cumpla → se cae a MODO MONO, que es
      // el comportamiento v0.8.0 byte a byte.
      let durPrincipal = dur;
      let durExtra = 0;
      let staffExtraRow = null;
      let horarioExtra = null;

      const proExtraLimpio = (typeof proExtraId === 'string') ? proExtraId.trim() : '';
      const quiereDual = !!proExtraLimpio
        && proExtraLimpio !== 'any'
        && proExtraLimpio !== proId;

      if (quiereDual) {
        if (!principalSetupUid) {
          console.warn(`${TAG} ⚠️ proExtraId recibido sin principalSetupUid → no se puede calcular el corte. Modo mono.`);
        } else {
          try {
            const rCat = await wixData.query(CMS_CATALOGO)
              .eq('active', true)
              .hasSome('uso', USOS_PUBLICOS)
              .limit(1000)
              .find({ suppressAuth: true });
            const allCat = rCat.items || [];
            const porSetupUidCat = {};
            for (const c of allCat) if (c.setupUid) porSetupUidCat[c.setupUid] = c;

            const svcPrincipal = porSetupUidCat[principalSetupUid];
            if (!svcPrincipal) {
              console.warn(`${TAG} ⚠️ principalSetupUid ${principalSetupUid} no encontrado en catálogo → modo mono.`);
            } else {
              const dp = calcularDurPrincipalCascada(svcPrincipal, porSetupUidCat);
              if (dp > 0 && dp < dur) {
                durPrincipal = dp;
                durExtra = dur - dp;
              } else {
                console.log(`${TAG} ℹ️ Corte no aplicable (durPrincipal=${dp}, durTotal=${dur}) → modo mono.`);
              }
            }
          } catch (splitErr) {
            console.warn(`${TAG} ⚠️ No se pudo calcular el corte de tramos: ${splitErr.message} → modo mono.`);
          }
        }
      }

      const dual = durExtra > 0;

      if (dual) {
        // El segundo profesional NO se filtra por el idStaff del servicio
        // principal: no lo ejecuta. Se busca sobre `activos`.
        staffExtraRow = activos.find(s =>
          s.wixResourceId === proExtraLimpio || s._id === proExtraLimpio
        ) || null;

        if (!staffExtraRow) {
          return {
            ok: false, version: VERSION,
            error: { message: 'El profesional elegido para los complementos no está disponible.' },
            huecos: []
          };
        }

        horarioExtra = leerHorarioStaffEnDia(staffExtraRow, dow);
        if (!horarioExtra) {
          console.log(`${TAG} 🚫 ${fecha} dow=${dow}: el profesional de complementos no trabaja ese día`);
          return {
            ok: true, version: VERSION, fecha, proId, durationMin: dur,
            huecos: [], motivo: 'cerrado', abreA: null
          };
        }
      }

      // 4) Cargar reservas del día (todas) para cruce
      const startUTC = new Date(new Date(`${fecha}T00:00:00`).getTime() - 3 * 3600000);
      const endUTC = new Date(new Date(`${fecha}T23:59:59`).getTime() + 3 * 3600000);
      const rRes = await wixData.query('KamisuiteReservations')
        .ge('fechaReserva', startUTC)
        .le('fechaReserva', endUTC)
        .ne('status', 'CANCELADA')
        .limit(500)
        .find({ suppressAuth: true });

      // Reservas por staffId (incluye fase movida con override)
      // Para cada reserva, expandimos en intervalos {staffId, startMin, endMin}.
      const ocupados = [];
      for (const r of (rRes.items || [])) {
        const fasesArr = jsonIn(r.fases, 'items');
        if (!Array.isArray(fasesArr) || !fasesArr.length) {
          // Reserva sin fases (a medida): bloquea su rango simple
          if (r.fechaReserva && r.duracionTotal) {
            const start = new Date(r.fechaReserva);
            const ymd = start.toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });
            if (ymd === fecha) {
              const startMin = parseHHMM(start.toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hour12: false }));
              if (startMin != null) {
                ocupados.push({ staffId: r.staffId, startMin, endMin: startMin + (Number(r.duracionTotal) || 0) });
              }
            }
          }
          continue;
        }
        for (const f of fasesArr) {
          if (f?.ocupa === false) continue;     // PROCESO libera al stylist
          if (!f.start || !f.end) continue;
          const ds = new Date(f.start);
          const de = new Date(f.end);
          const ymd = ds.toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });
          if (ymd !== fecha) continue;
          const sm = parseHHMM(ds.toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hour12: false }));
          const em = parseHHMM(de.toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hour12: false }));
          if (sm == null || em == null) continue;
          const sid = f.staffId || r.staffId || '';
          ocupados.push({ staffId: sid, startMin: sm, endMin: em });
        }
      }

      // 5) Generar slots y filtrar
      // Un slot [m, m+dur) está libre para proId 'any' si AL MENOS UN staff
      // candidato lo tiene dentro de su horario y NO tiene ocupación cruzada.
      // Para proId concreto, exige que ese staff esté libre.
      // v0.8.0 — tope superior del staff extendido por graceMin
      // (SalonConfig.closingGraceMin). Con grace=0 → estricto v0.7.9.
      // v0.9.0 — En MODO DOS TRAMOS cada mitad se valida contra SU
      // profesional: el principal debe estar libre en [m, m+durPrincipal)
      // dentro de su horario, y el de complementos en
      // [m+durPrincipal, m+dur) dentro del suyo. Mismo cruce de dos
      // conjuntos por la hora exacta de corte que hacía
      // `consultarDisponibilidadUnificada` en V1 (coloracionLogic, líneas
      // 923-965). En MODO MONO (durExtra=0) el código es idéntico a v0.8.0.
      const sidExtra = dual
        ? (staffExtraRow.wixResourceId || staffExtraRow._id)
        : null;

      const huecos = [];
      for (let m = minFrom; m + dur <= maxTo + graceMin; m += SLOT_STEP) {
        const mCorte = dual ? (m + durPrincipal) : (m + dur);

        // ── TRAMO A · profesional principal ──
        let alguienLibre = false;
        for (const { staff, horario } of disponibles) {
          if (m < horario.from || mCorte > horario.to + graceMin) continue;
          const sid = staff.wixResourceId || staff._id;
          // ¿solape con ocupados de ese staff?
          const haySolape = ocupados.some(o =>
            o.staffId && o.staffId === sid &&
            m < o.endMin && mCorte > o.startMin
          );
          if (!haySolape) { alguienLibre = true; break; }
        }
        if (!alguienLibre) continue;

        // ── TRAMO B · profesional de complementos ──
        if (dual) {
          if (mCorte < horarioExtra.from) continue;
          if (m + dur > horarioExtra.to + graceMin) continue;
          const solapeExtra = ocupados.some(o =>
            o.staffId && o.staffId === sidExtra &&
            mCorte < o.endMin && (m + dur) > o.startMin
          );
          if (solapeExtra) continue;
        }

        huecos.push(fmtHHMM(m));
      }

      const elapsed = ((Date.now() - t0) / 1000).toFixed(2);
      const modoLog = dual
        ? ` | 👥 DOS TRAMOS: principal ${durPrincipal}min + complementos ${durExtra}min con ${staffExtraRow.displayName || staffExtraRow.canonicalName || sidExtra}`
        : '';
      console.log(`${TAG} ✅ huecos ${fecha} dow=${dow} proId=${proId || 'any'} dur=${dur}min: ${huecos.length} slots (abre ${fmtHHMM(minFrom)}, cierra ${fmtHHMM(maxTo)}, grace ${graceMin}min)${modoLog}. ${elapsed}s`);

      return {
        ok: true, version: VERSION,
        fecha, proId, durationMin: dur,
        huecos,
        abreA: fmtHHMM(minFrom),
        cierraA: fmtHHMM(maxTo)
      };

    } catch (e) {
      console.error(`${TAG} ❌ getHuecosDisponibles:`, e.message);
      return { ok: false, version: VERSION, error: safeErr(e), huecos: [] };
    }
  }
);

// =====================================================
// 6 · CREAR RESERVA PÚBLICA (wrapper de crearPackReserva)
// =====================================================
// Delega en backend/recepcionProLogic.crearPackReserva. Aísla el iframe
// público de la API interna y valida el contrato mínimo antes de tocar
// Recepción Pro.
//
// Entrada esperada (mismos campos que el form del widget genera):
//   {
//     fecha: 'YYYY-MM-DD',
//     horaHHmm: 'HH:mm',
//     principalSetupUid: '<setupUid>',
//     complementosSetupUid: ['<setupUid>', ...],   // opcional
//     staffId: '<wixResourceId>' | 'any',
//     staffName: '<nombre>',                        // opcional, informativo
//     contactDetails: { firstName, lastName, email, phone },
//     memberContactId: '<guid>' | null,             // si miembro logueado
//     notas: ''                                     // opcional
//   }
//
// Validación mínima (rápido fallar antes de tocar Wix Bookings):
//   - fecha + horaHHmm + principalSetupUid obligatorios
//   - staffId obligatorio (puede ser 'any')
//   - O memberContactId, O contactDetails con (firstName+phone) o
//     (firstName+email); si no hay nada, error.
//
// Devuelve el resultado tal cual de crearPackReserva.

// v0.9.0 — Resuelve la duración del TRAMO DEL PRINCIPAL para una reserva
// concreta. Misma query y mismo mapa `porSetupUid` que usa
// `getHuecosDisponibles` en su bloque 3-bis, para que el corte que se
// valida al crear sea EXACTAMENTE el mismo que se validó al ofrecer la hora.
//
// Devuelve null si no se puede resolver (sin setupUid, servicio no
// encontrado, error de query, o corte fuera de rango) → el llamante cae a
// modo mono-profesional.
async function resolverDurPrincipalTramo(principalSetupUid, durTotal) {
  if (!principalSetupUid || !(durTotal > 0)) return null;
  try {
    const rCat = await wixData.query(CMS_CATALOGO)
      .eq('active', true)
      .hasSome('uso', USOS_PUBLICOS)
      .limit(1000)
      .find({ suppressAuth: true });
    const allCat = rCat.items || [];
    const porSetupUidCat = {};
    for (const c of allCat) if (c.setupUid) porSetupUidCat[c.setupUid] = c;

    const svcPrincipal = porSetupUidCat[principalSetupUid];
    if (!svcPrincipal) return null;

    const dp = calcularDurPrincipalCascada(svcPrincipal, porSetupUidCat);
    if (dp > 0 && dp < durTotal) return dp;
    return null;
  } catch (e) {
    console.warn(`${TAG} ⚠️ resolverDurPrincipalTramo no concluyente: ${e.message}`);
    return null;
  }
}

export const crearReservaPublica = webMethod(
  Permissions.Anyone,
  async (payload) => {
    const t0 = Date.now();
    try {
      const {
        fecha,
        horaHHmm,
        principalSetupUid,
        complementosSetupUid = [],
        staffId,
        staffName = '',
        contactDetails = {},
        memberContactId = '',
        notas = '',
        // v0.7.7 — Variante del servicio PRINCIPAL (servicios
        // simple_variantes: Corte Mujer M/L/XL). Shape:
        // { idx, label, price, duration }. Si el cliente eligió la
        // variante BASE (M), el bundle público no envía este campo →
        // undefined → backend usa precio/duración base como siempre.
        // Si eligió L/XL, el bundle envía el objeto con los valores de
        // la variante y crearPackReserva v1.0.25 los aplica al precio
        // y duración totales de la reserva. Paridad estricta con
        // Recepción PRO Desktop v1.1.43 y con Lite Mobile v0.5.0.
        varianteSel = null,
        // v0.7.9 — Duración TOTAL de la cita (principal + variante +
        // complementos), enviada por el bundle v2.0.16 y propagada por el
        // page code v0.3.3. Es la MISMA cifra que el widget pasó a
        // getHuecosDisponibles para ofrecer la hora. Se usa para resolver
        // 'any' comprobando que el profesional esté libre en TODO el bloque
        // continuo que el motor de huecos ya validó (máxima seguridad; el
        // PROCESO no se libera al público en el arranque de V2). Si no
        // llegara (payload antiguo), el resolvedor cae a la duración base
        // del principal como red de seguridad mínima.
        durationMin = null,
        // v0.9.0 — Segundo profesional para los complementos (recuperación
        // del `empleado2Id` de V1). wixResourceId concreto. Si no llega,
        // llega vacío, llega 'any', o coincide con `staffId` → toda la cita
        // va al profesional principal, comportamiento v0.8.0 idéntico.
        staffExtraId = ''
      } = payload || {};

      // Validación mínima de campos
      if (!fecha || !horaHHmm || !principalSetupUid) {
        return { ok: false, version: VERSION, error: { message: 'Faltan campos obligatorios (fecha, hora, servicio).' } };
      }
      if (!staffId) {
        return { ok: false, version: VERSION, error: { message: 'Falta profesional (puede ser "any").' } };
      }

      // v0.8.0 — Margen del salón (SalonConfig.closingGraceMin). Se pasa
      // a resolverStaffLibre y se usa en la guardia defensiva final que
      // valida que la reserva NO desborde el `to` del staff + este margen.
      // Vacío / null / error → 0 (comportamiento estricto v0.7.9).
      const graceMin = await leerClosingGraceMin();

      // Validación de identidad mínima:
      // o memberContactId, o contactDetails con nombre + (telefono o email).
      const cd = contactDetails || {};
      const tieneIdentidadMinima = !!memberContactId ||
        (cd.firstName && (cd.phone || cd.email));

      if (!tieneIdentidadMinima) {
        return { ok: false, version: VERSION, error: { message: 'Faltan datos del cliente (nombre + teléfono o email).' } };
      }

      // v0.6.0 — Validar que el staffId está PERMITIDO para este servicio.
      // El campo idStaff (Object {ids:[...]}) en ServiceCatalog dicta quién
      // puede ejecutar el servicio. Defensa en backend porque el cliente
      // pudo manipular el payload aunque el widget filtre los chips.
      try {
        const rSvc = await wixData.query(CMS_CATALOGO)
          .eq('setupUid', principalSetupUid)
          .limit(1)
          .find({ suppressAuth: true });
        const svc = rSvc.items?.[0];
        if (!svc) {
          return { ok: false, version: VERSION, error: { message: 'Servicio no encontrado en el catálogo.' } };
        }
        const idsPermitidos = Array.isArray(svc.idStaff?.ids) ? svc.idStaff.ids : [];
        // Lista vacía = todos los staff activos pueden hacerlo (fallback liberal).
        if (idsPermitidos.length && staffId !== 'any') {
          if (!idsPermitidos.includes(String(staffId))) {
            console.warn(`${TAG} ⚠️ Intento de reserva con staff NO permitido: staffId=${staffId} servicio=${svc.label}`);
            return { ok: false, version: VERSION, error: { message: 'El profesional seleccionado no realiza este servicio.' } };
          }
        }
      } catch (vErr) {
        // Si la validación falla por error técnico, no bloqueamos —
        // mejor permitir la reserva que tirarla por un fallo de query.
        console.warn(`${TAG} ⚠️ Validación idStaff no concluyente: ${vErr.message}`);
      }

      // ─────────────────────────────────────────────────────────────
      // v0.7.8 — RESOLVER 'any' A UN HUMANO REAL LIBRE (Conceptos §4B)
      // v0.7.9 — La comprobación usa la DURACIÓN TOTAL de la cita.
      // ─────────────────────────────────────────────────────────────
      // Bug crítico (v0.7.8): cuando el cliente elegía "Cualquiera"
      // (staffId='any'), este wrapper pasaba staffId='' a crearPackReserva
      // y la reserva se insertaba en KamisuiteReservations SIN empleado
      // → Recepción Pro no la pintaba en ninguna columna. Regla §4B: todo
      // backend que cree una reserva DEBE resolver 'any' a un humano real
      // libre ANTES de crear, o RECHAZAR si no hay ninguno. Nunca crear
      // con staff vacío.
      //
      // Reutiliza resolverStaffLibre (que replica la lógica interna ya
      // probada de getHuecosDisponibles: horario + cruce con
      // KamisuiteReservations + solape). idStaffPermitidos = los mismos
      // que restringe el motor de huecos para este servicio.
      //
      // v0.7.9 — DURACIÓN usada para el rango: la DURACIÓN TOTAL de la
      // cita (durationMin), que el bundle v2.0.16 calcula (principal +
      // variante + complementos) y es la MISMA que pasó a
      // getHuecosDisponibles para ofrecer esta hora. Así el profesional
      // asignado queda garantizado libre en el MISMO bloque continuo que
      // el motor de huecos validó — máxima seguridad, coherente con la ley
      // conservadora (el PROCESO no se libera al público en V2). Si el
      // payload no trae durationMin (compatibilidad con page code antiguo),
      // se cae a la duración BASE del principal como red mínima.
      let staffIdFinal = (staffId === 'any') ? '' : staffId;
      let staffNameFinal = staffName;

      // ─────────────────────────────────────────────────────────────
      // v0.9.0 — SEGUNDO PROFESIONAL PARA LOS COMPLEMENTOS
      // ─────────────────────────────────────────────────────────────
      // Se resuelve ANTES que el 'any' del principal porque, en modo dos
      // tramos, el principal solo ocupa [inicio, inicio+durPrincipal) y su
      // resolución debe hacerse con ESA duración, no con la total.
      //
      // El segundo profesional NO se valida contra el `idStaff` del
      // servicio principal: no lo ejecuta, ejecuta los complementos. Sí se
      // valida que exista y esté activo en StaffConfig (defensa contra
      // payload manipulado).
      const staffExtraLimpio = (typeof staffExtraId === 'string') ? staffExtraId.trim() : '';
      let staffIdExtraFinal = '';
      let staffNameExtraFinal = '';
      let durPrincipalTramo = null;

      if (staffExtraLimpio && staffExtraLimpio !== 'any' && staffExtraLimpio !== staffId) {
        durPrincipalTramo = await resolverDurPrincipalTramo(principalSetupUid, toNum(durationMin));

        if (durPrincipalTramo == null) {
          console.warn(`${TAG} ⚠️ staffExtraId recibido pero el corte de tramos no es resoluble → toda la cita al profesional principal.`);
        } else {
          try {
            const rStaffExtra = await wixData.query(CMS_STAFF)
              .eq('active', true)
              .limit(100)
              .find({ suppressAuth: true });
            const rowExtra = (rStaffExtra.items || []).find(s =>
              s.wixResourceId === staffExtraLimpio || s._id === staffExtraLimpio
            );
            if (!rowExtra) {
              console.warn(`${TAG} ⚠️ staffExtraId=${staffExtraLimpio} no encontrado/activo en StaffConfig → reserva rechazada.`);
              return {
                ok: false, version: VERSION,
                error: { message: 'El profesional elegido para los complementos no está disponible.' }
              };
            }
            const canonExtra = String(rowExtra.canonicalName || '').toUpperCase();
            if (String(rowExtra.notes || '').includes(NOTA_RECURSO_INTERNO)
                || canonExtra === 'CUALQUIERA' || canonExtra === 'PROCESO') {
              console.warn(`${TAG} ⚠️ staffExtraId=${staffExtraLimpio} es un recurso interno → rechazado.`);
              return {
                ok: false, version: VERSION,
                error: { message: 'El profesional elegido para los complementos no es válido.' }
              };
            }
            staffIdExtraFinal = rowExtra.wixResourceId || rowExtra._id;
            staffNameExtraFinal = rowExtra.displayName || rowExtra.canonicalName || '';
            console.log(`${TAG} 👥 Dos tramos: principal ${durPrincipalTramo}min | complementos ${toNum(durationMin) - durPrincipalTramo}min con ${staffNameExtraFinal || staffIdExtraFinal}`);
          } catch (eExtra) {
            console.warn(`${TAG} ⚠️ No se pudo resolver el segundo profesional: ${eExtra.message} → toda la cita al principal.`);
            staffIdExtraFinal = '';
            staffNameExtraFinal = '';
            durPrincipalTramo = null;
          }
        }
      }

      // Duración que ocupa el PROFESIONAL PRINCIPAL. En modo mono es la
      // duración total; en modo dos tramos, solo su tramo.
      const durTramoPrincipal = (staffIdExtraFinal && durPrincipalTramo != null)
        ? durPrincipalTramo
        : toNum(durationMin);

      if (staffId === 'any') {
        let idsPermitidosResolver = [];
        let durResolver = toNum(durTramoPrincipal);
        try {
          const rSvcDur = await wixData.query(CMS_CATALOGO)
            .eq('setupUid', principalSetupUid)
            .limit(1)
            .find({ suppressAuth: true });
          const svcDur = rSvcDur.items?.[0];
          if (svcDur) {
            idsPermitidosResolver = Array.isArray(svcDur.idStaff?.ids) ? svcDur.idStaff.ids : [];
            // Fallback: si no llegó durationMin del payload, usar la
            // duración base del principal (comportamiento v0.7.8).
            if (!(durResolver > 0)) durResolver = toNum(svcDur.duration);
          }
        } catch (durErr) {
          console.warn(`${TAG} ⚠️ No se pudo leer idStaff/duración base para resolver 'any': ${durErr.message}`);
        }
        if (!(durResolver > 0)) durResolver = 60; // último recurso

        console.log(`${TAG} 🔎 Resolviendo 'any' con duración total ${durResolver}min (${durationMin ? 'payload' : 'fallback base'})`);

        // v0.8.0 — se pasa graceMin (SalonConfig.closingGraceMin) para
        // que el resolvedor considere el margen del salón al validar el
        // horario del staff. Coherente con el filtro de getHuecosDisponibles.
        const elegido = await resolverStaffLibre({
          fecha,
          horaHHmm,
          durationMin: durResolver,
          idStaffPermitidos: idsPermitidosResolver,
          graceMin
        });

        if (!elegido) {
          // Regla §4B: si no hay humano libre, RECHAZAR — nunca crear
          // la reserva con staff vacío.
          console.warn(`${TAG} ⚠️ 'any' sin humano libre a ${fecha} ${horaHHmm} (dur ${durResolver}min) → reserva rechazada`);
          return {
            ok: false,
            version: VERSION,
            error: { message: 'No hay ningún profesional disponible a esa hora. Prueba con otro horario.' }
          };
        }

        staffIdFinal = elegido.staffId;
        staffNameFinal = elegido.staffName || staffName || '';
        console.log(`${TAG} ✅ 'any' resuelto a ${staffNameFinal || staffIdFinal}`);
      }

      // ─────────────────────────────────────────────────────────────
      // v0.8.0 — GUARDIA DEFENSIVA FINAL de horario del staff
      // ─────────────────────────────────────────────────────────────
      // Verifica que la reserva NO desborde el `to` del horario del staff
      // (ya sea staff concreto o resuelto de 'any') más `graceMin`. Red
      // de seguridad ante payloads manipulados (DevTools / URL / caching
      // desincronizado) que no hayan pasado por getHuecosDisponibles.
      //
      // Requiere durationMin del payload (bundle v2.0.16+). Si no llega
      // (page code muy antiguo) se salta silenciosamente — resolverStaffLibre
      // ya cubrió el caso de 'any', y para staff concreto el motor de huecos
      // filtró antes. La guardia es una capa extra, no la única defensa.
      try {
        const gDurTotal = toNum(durationMin);
        const gInicioMin = parseHHMM(horaHHmm);
        if (gDurTotal > 0 && gInicioMin != null && staffIdFinal) {
          const rStaffFinal = await wixData.query(CMS_STAFF)
            .eq('active', true)
            .limit(100)
            .find({ suppressAuth: true });
          const staffRow = (rStaffFinal.items || []).find(s =>
            s.wixResourceId === staffIdFinal || s._id === staffIdFinal
          );

          // v0.9.0 — En modo dos tramos, el que cierra la cita es el
          // SEGUNDO profesional. Cada tramo se valida contra su dueño:
          //   · principal → [inicio, inicio+durTramoPrincipal)
          //   · extra     → [inicio+durTramoPrincipal, inicio+durTotal)
          const gDurPrincipal = (staffIdExtraFinal && durPrincipalTramo != null)
            ? durPrincipalTramo
            : gDurTotal;

          if (staffIdExtraFinal && durPrincipalTramo != null) {
            const staffRowExtra = (rStaffFinal.items || []).find(s =>
              s.wixResourceId === staffIdExtraFinal || s._id === staffIdExtraFinal
            );
            if (staffRowExtra) {
              const [ey, emo, ed] = String(fecha).split('-').map(Number);
              const edow = new Date(ey, emo - 1, ed).getDay();
              const eHorario = leerHorarioStaffEnDia(staffRowExtra, edow);
              if (eHorario) {
                const eInicioMin = gInicioMin + gDurPrincipal;
                const eFinMin = gInicioMin + gDurTotal;
                if (eInicioMin < eHorario.from || eFinMin > eHorario.to + graceMin) {
                  console.warn(`${TAG} ⚠️ Guardia horario (tramo complementos): ${fmtHHMM(eInicioMin)}–${fmtHHMM(eFinMin)} fuera del horario de ${staffNameExtraFinal || staffIdExtraFinal} (${fmtHHMM(eHorario.from)}–${fmtHHMM(eHorario.to)} +grace ${graceMin}). Reserva rechazada.`);
                  return {
                    ok: false,
                    version: VERSION,
                    error: { message: 'La reserva excede el horario del profesional de los complementos. Elige otro horario.' }
                  };
                }
              } else {
                console.warn(`${TAG} ⚠️ Guardia horario: staff extra ${staffIdExtraFinal} sin horario para ese día → guardia del tramo B omitida`);
              }
            } else {
              console.warn(`${TAG} ⚠️ Guardia horario: staff extra ${staffIdExtraFinal} no encontrado en StaffConfig → guardia del tramo B omitida`);
            }
          }

          if (staffRow) {
            const [gy, gmo, gd] = String(fecha).split('-').map(Number);
            const gdow = new Date(gy, gmo - 1, gd).getDay();
            const gHorario = leerHorarioStaffEnDia(staffRow, gdow);
            if (gHorario) {
              const gFinMin = gInicioMin + gDurPrincipal;
              if (gFinMin > gHorario.to + graceMin) {
                console.warn(`${TAG} ⚠️ Guardia horario: ${fecha} ${horaHHmm}+${gDurPrincipal}min = ${fmtHHMM(gFinMin)} desborda staff.to ${fmtHHMM(gHorario.to)} +grace ${graceMin} = ${fmtHHMM(gHorario.to + graceMin)}. Reserva rechazada.`);
                return {
                  ok: false,
                  version: VERSION,
                  error: { message: 'La reserva excede el horario del profesional. Elige otro horario.' }
                };
              }
            } else {
              // Sin horario configurado para ese dow: no bloqueamos (mismo
              // criterio permisivo que resolverStaffLibre ante staff sin
              // horario resoluble → deja pasar). Solo log.
              console.warn(`${TAG} ⚠️ Guardia horario: staff ${staffIdFinal} sin horario para dow=${gdow} → guardia omitida`);
            }
          } else {
            console.warn(`${TAG} ⚠️ Guardia horario: staff ${staffIdFinal} no encontrado en StaffConfig → guardia omitida`);
          }
        }
      } catch (gErr) {
        // Cualquier fallo técnico de la guardia NO bloquea la reserva
        // (mejor una reserva legítima que un rechazo por bug de query).
        console.warn(`${TAG} ⚠️ Guardia horario no concluyente: ${gErr.message}`);
      }

      // Delegar en crearPackReserva del backend de Recepción Pro.
      // Import dinámico para no acoplar el módulo en tiempo de carga.
      const { crearPackReserva } = await import('backend/recepcionProLogic.web');

      const resultado = await crearPackReserva({
        fecha,
        horaHHmm,
        principalSetupUid,
        complementosSetupUid: Array.isArray(complementosSetupUid) ? complementosSetupUid : [],
        staffId: staffIdFinal,
        staffName: staffNameFinal,
        contactDetails: {
          firstName: cd.firstName || '',
          lastName: cd.lastName || '',
          email: cd.email || '',
          phone: cd.phone || ''
        },
        memberContactId: memberContactId || '',
        notas: notas || '',
        esProvisional: false,    // reservas públicas SÍ persisten en CRM
        origenRecepcion: false,  // v0.3.0 — origen WEB (no Recepción Pro)
        // v0.7.7 — Variante del principal (null si base o si el servicio
        // no tiene variantes). crearPackReserva v1.0.25 lo procesa.
        varianteSel: varianteSel || null
      });

      const elapsed = ((Date.now() - t0) / 1000).toFixed(2);
      if (resultado?.ok) {
        console.log(`${TAG} ✅ crearReservaPublica: reservaId=${resultado.reservaId} | ${resultado.precioTotal}€ | ${elapsed}s`);

        // ─────────────────────────────────────────────────────────────
        // v0.9.0 — REPARTO ENTRE DOS PROFESIONALES (fases del tramo B)
        // ─────────────────────────────────────────────────────────────
        // Se hace AQUÍ, en el backend del widget público, y NO dentro de
        // crearPackReserva: ese motor lo comparten Recepción PRO Desktop y
        // Lite Mobile, y esta capacidad es exclusiva del cliente que
        // reserva online. Así el motor de packs queda intacto en producción.
        //
        // Patrón READ-MERGE-UPDATE (regla de oro del proyecto:
        // `wixData.update` reemplaza el documento entero, nunca se pasa un
        // objeto parcial): se lee el registro completo recién insertado, se
        // modifican SOLO los `staffId` de las fases del tramo B y se
        // devuelve el documento entero con esa única diferencia.
        //
        // Las sessions de Wix Bookings NO se tocan: se crean en el
        // scheduleId del ancla de familia y no llevan staff — el estilista
        // real vive únicamente en el CMS. El campo `fases[].staffId` ya
        // existe como override por fase (lo escribe el drag&drop de V2) y
        // lo respeta el motor de huecos de este mismo archivo
        // (`f.staffId || r.staffId`), así que la reserva repartida se
        // interpreta bien en ocupación y en el calendario desde el minuto uno.
        //
        // REGLA DE CORTE (la misma que validó getHuecosDisponibles al
        // ofrecer la hora, para que lo reservado coincida con lo comprobado):
        //   · CON fase PROCESO → el principal conserva todo hasta el final
        //     de la PRIMERA fase que ocupa después del proceso (el "lavado"
        //     de V1). Lo posterior → segundo profesional.
        //   · SIN fase PROCESO → el principal conserva todo hasta antes de
        //     la primera fase 'COMPLEMENTO'. De ahí al final → segundo.
        //
        // Todo el bloque va en try/catch NO-BLOCKING: la reserva ya está
        // creada y es válida. Si el reparto fallara, la cita queda íntegra
        // con el profesional principal (degradación segura, nunca una
        // reserva rota ni perdida).
        if (staffIdExtraFinal && resultado.reservaId) {
          try {
            const regReserva = await wixData.get('KamisuiteReservations', resultado.reservaId, { suppressAuth: true });
            const fasesReserva = jsonIn(regReserva?.fases, 'items');

            if (Array.isArray(fasesReserva) && fasesReserva.length) {
              let idxCorte = -1;

              const idxProceso = fasesReserva.findIndex(f => f && f.tipo === 'proceso');
              if (idxProceso >= 0) {
                let idxLavado = -1;
                for (let i = idxProceso + 1; i < fasesReserva.length; i++) {
                  if (fasesReserva[i] && fasesReserva[i].ocupa === true) { idxLavado = i; break; }
                }
                if (idxLavado >= 0 && idxLavado + 1 < fasesReserva.length) {
                  idxCorte = idxLavado + 1;
                }
              } else {
                const idxComp = fasesReserva.findIndex(f => f && f.fase === 'COMPLEMENTO');
                if (idxComp >= 0) idxCorte = idxComp;
              }

              if (idxCorte >= 0) {
                let nFases = 0;
                for (let i = idxCorte; i < fasesReserva.length; i++) {
                  if (!fasesReserva[i]) continue;
                  fasesReserva[i].staffId = staffIdExtraFinal;
                  nFases++;
                }

                // MERGE: documento completo + solo las fases cambiadas.
                const regActualizado = Object.assign({}, regReserva, {
                  fases: { items: fasesReserva }
                });
                await wixData.update('KamisuiteReservations', regActualizado, { suppressAuth: true });

                // Reflejar el reparto en lo que se devuelve al widget.
                resultado.fases = fasesReserva;

                console.log(`${TAG} 👥 Reparto aplicado: ${nFases} fase/s desde índice ${idxCorte} → ${staffNameExtraFinal || staffIdExtraFinal} (resto: ${staffNameFinal || staffIdFinal})`);
              } else {
                console.log(`${TAG} ℹ️ Segundo profesional elegido pero la cita no tiene tramo posterior que repartir → todo al principal.`);
              }
            }
          } catch (repErr) {
            console.warn(`${TAG} ⚠️ No se pudo aplicar el reparto de profesionales (la reserva ${resultado.reservaId} queda íntegra con ${staffNameFinal || staffIdFinal}): ${repErr.message}`);
          }
        }

        // ─────────────────────────────────────────────────────────────
        // v0.5.0 — CENTRALITA DE COMUNICACIONES
        // Patrón copiado literalmente de simplesLogic v1.5.0 / coloracionLogic
        // v3.2.7 / tratamientosLogic v1.0.9. Envuelto en try/catch no-blocking:
        // si la centralita falla, la reserva ya está creada — el cliente
        // simplemente no recibe la notificación, sin afectar al booking.
        // ─────────────────────────────────────────────────────────────
        try {
          // 1) Resolver nombre del servicio principal (label en ServiceCatalog).
          let serviciosStr = 'Tu cita';
          try {
            const rSvc = await wixData.query(CMS_CATALOGO)
              .eq('setupUid', principalSetupUid)
              .limit(1)
              .find({ suppressAuth: true });
            if (rSvc.items?.[0]?.label) serviciosStr = rSvc.items[0].label;
          } catch (_) { /* fallback al default */ }

          // 2) Resolver nombre del estilista asignado.
          //    v0.7.8 — Si el cliente eligió 'any', staffNameFinal ya
          //    trae el nombre del humano resuelto por resolverStaffLibre.
          //    Fallback (por robustez): leer de resultado.fases[0].staffId.
          let estilistaStr = staffNameFinal || '';
          if (!estilistaStr) {
            const staffIdReal = resultado?.fases?.[0]?.staffId;
            if (staffIdReal) {
              try {
                const rStaff = await wixData.query(CMS_STAFF)
                  .eq('wixResourceId', staffIdReal)
                  .limit(1)
                  .find({ suppressAuth: true });
                estilistaStr = rStaff.items?.[0]?.displayName
                            || rStaff.items?.[0]?.canonicalName
                            || '';
              } catch (_) { /* sin nombre, va sin */ }
            }
          }

          // 3) Fecha bonita DD/MM/YYYY (formato V1 esperado por driver WhatsApp).
          const [yy, mm2, dd] = String(fecha).split('-');
          const fechaBonita = `${dd}/${mm2}/${yy}`;

          // 4) Hora final = horaInicio + duracionTotal.
          const [hh, mi] = String(horaHHmm).split(':').map(Number);
          const totalMin = Number(resultado?.duracionTotal) || 0;
          const endMin = hh * 60 + mi + totalMin;
          const eh = Math.floor(endMin / 60);
          const em = endMin % 60;
          const horaFinal = String(eh).padStart(2, '0') + ':' + String(em).padStart(2, '0');

          const importeStr = `${resultado?.precioTotal || 0}€`;
          // Origen 'Reserva Online' como en V1 — distingue del de Recepción Pro.
          const origenStr = 'Reserva Online';
          // Las reservas web no pagan online aún (futuro: integración pasarela).
          const estadoPagoStr = 'Pago en salón';
          const nombreCliente = `${cd.firstName || ''}${cd.lastName ? ' ' + cd.lastName : ''}`.trim();

          // 5) Invocación a la centralita. Import dinámico para no acoplar
          //    el módulo en tiempo de carga del backend.
          const { notificarConfirmacion } = await import('backend/comunicacionesLogic.web');
          await notificarConfirmacion({
            contactId:     resultado?.contactId || memberContactId || '',
            email:         cd.email || '',
            telefono:      cd.phone || '',
            nombreCliente,
            fecha:         fechaBonita,
            hora:          horaHHmm,
            servicios:     serviciosStr,
            estilista:     estilistaStr,
            // emailVariables idénticas en estructura a las que usa V1
            // (simplesLogic v1.5.0 / coloracionLogic v3.2.7) para que el
            // template Wix existente reciba los mismos campos sin cambios.
            emailVariables: {
              Fecha:         fechaBonita,
              Nombre:        cd.firstName || '',
              Apellido:      cd.lastName || '',
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
        // ─── fin centralita ──────────────────────────────────────────

      } else {
        console.warn(`${TAG} ⚠️ crearReservaPublica falló: ${JSON.stringify(resultado?.error || {})}`);
      }
      return resultado;

    } catch (e) {
      console.error(`${TAG} ❌ crearReservaPublica:`, e.message);
      return { ok: false, version: VERSION, error: safeErr(e) };
    }
  }
);

// =====================================================
// 7 · GET CONSTANTS (diagnóstico)
// =====================================================
export const getConstants = webMethod(
  Permissions.Anyone,
  async () => ({
    ok: true,
    version: VERSION,
    collections: { CMS_CATALOGO, CMS_CATEGORIAS, CMS_STAFF, CMS_CONFIG },
    filtros: { USOS_PUBLICOS, TIPOS_PRINCIPALES }
  })
);
