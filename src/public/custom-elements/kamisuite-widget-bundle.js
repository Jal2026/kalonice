/* =====================================================================
 * KAMISUITE — Widget público de reservas
 * BUNDLE para Wix Custom Element (todo-en-uno)
 * =====================================================================
 * Tag name:  kami-reserva
 * VERSION:   2.0.17 (bundle)
 * FECHA:     3 de agosto de 2026
 *
 * v2.0.17 — SEGUNDO PROFESIONAL PARA LOS COMPLEMENTOS (recuperado de V1).
 *   Backend pareja: widgetPublicoLogic v0.9.0. Motor final:
 *   Page code: Servicios (Item) v0.3.5. El motor de packs
 *   (recepcionProLogic) NO se toca: el reparto de fases lo aplica el
 *   propio backend del widget público tras crear la reserva.
 *
 *   La UI de este bloque llevaba en el bundle desde el principio
 *   (state.proExtra, state.sameExtra, _renderProExtra, fila "Compl. con"
 *   del resumen y de la confirmación) pero NUNCA se veía, porque el
 *   backend emitía `requiresExtraPro: false` hardcodeado. Y aunque se
 *   hubiera visto, el segundo profesional no viajaba en ninguno de los dos
 *   emits. Esta versión cierra el lazo:
 *
 *   · _hayComplementosElegidos() — nuevo. El bloque solo se pinta si el
 *     servicio tiene complementos (requiresExtraPro del backend) Y el
 *     cliente ha MARCADO al menos uno. Sin complemento marcado no hay nada
 *     que repartir.
 *   · _renderProExtra ahora es defensivo con proExtraField null (el Paso 2
 *     puede no existir) y, al ocultarse, normaliza el estado a "mismo
 *     profesional" para no dejar un segundo profesional fantasma.
 *   · _afterCompChange repinta el bloque: aparece al marcar el primer
 *     complemento y desaparece al quedarse sin ninguno.
 *   · Cambiar el switch o el chip del segundo profesional AHORA vuelve a
 *     pedir huecos (this.state.hour = null + _recompute(true)), igual que
 *     hace _renderProMain desde v2.0.9: la disponibilidad depende de los
 *     dos profesionales, y la hora elegida puede dejar de ser válida.
 *   · _renderProMain repinta también el bloque del segundo.
 *   · _proExtraEnvio() — nuevo. Devuelve "" salvo que haya reparto real
 *     (bloque visible + switch en "otro" + id concreto ≠ principal ≠ 'any').
 *   · 'pedir-huecos' añade `proExtraId` y `principalSetupUid` (el backend
 *     necesita el mapeoFases del servicio para calcular el punto de corte).
 *   · 'reservar' añade `staffExtraId`.
 *
 *   Con proExtraId/staffExtraId vacíos, TODO el comportamiento es idéntico
 *   a v2.0.16. Cero cambios de estética, de flujo, de gating, de variantes
 *   o de resumen.
 *
 * v2.0.16 — durationMin (duración total) en el payload de reserva.
 *   El payload del evento 'reservar' incluye ahora durationMin =
 *   this._calc().duration (principal + variante + complementos), que es
 *   la MISMA cifra que _emitirPedirHuecos ya envía a getHuecosDisponibles.
 *   El backend la usa para resolver 'Cualquiera' comprobando que el
 *   profesional esté libre en TODO el bloque continuo que el motor de
 *   huecos ya validó (máxima seguridad). Única línea añadida al payload;
 *   se conserva varianteSel y todo lo demás intacto. Cero cambios en
 *   render, complementos, variantes, flujo, estética, gating o resumen.
 *
 * v2.0.15 — VARIANTE del servicio PRINCIPAL (Corte Mujer M/L/XL, etc.).
 *   Backend pareja: widgetPublicoLogic v0.7.7. Motor final:
 *   recepcionProLogic v1.0.36 (crearPackReserva v1.0.25 desde 19 Jun).
 *
 *   Bug preexistente: el bundle NUNCA renderizó selector de variantes
 *   del servicio principal aunque el backend público las emitía en el
 *   shape (adaptarServicio v0.7.2+: hasVariants, variantes[]). Los
 *   servicios simple_variantes (Corte Mujer M/L/XL, Corte Niño S/M/L)
 *   se reservaban SIEMPRE con precio/duración base, sin opción para
 *   que el cliente eligiera tamaño. Además, crearReservaPublica
 *   tampoco propagaba varianteSel a crearPackReserva → si por milagro
 *   el widget lo enviara, se perdía en el motor público. Doble gap.
 *
 *   Fix del bundle (esta v2.0.15) + motor público (widgetPublicoLogic
 *   v0.7.7) cierran el lazo. Paridad con Lite Mobile v0.5.0 y
 *   Recepción PRO Desktop v1.1.43.
 *
 *   · state incluye ahora `variantIdx` en _initState. Valor -1 = BASE
 *     (svc.basePrice + svc.baseDuration del catálogo, actúa como "M").
 *     Valores 0..N = índice en svc.variantes[i].
 *   · _calc: si variantIdx >= 0, SUSTITUYE (no suma) precio y duración
 *     base por los de la variante elegida. Coherente con
 *     crearPackReserva v1.0.25 que hace exactamente lo mismo en backend.
 *   · _build: la sección Paso 2 se monta ahora si hay complementos O
 *     variantes del principal. Antes solo si había complementos → los
 *     simple_variantes sin complementos nunca llegaban a mostrar
 *     selector. hasPaso2 = hasComps || hasPrincipalVariants. Labels de
 *     Paso 3/4 se recalculan igual.
 *   · _renderComplements: al inicio del Paso 2, ANTES de los
 *     complementos, se pinta el bloque "Elige la variante del servicio"
 *     con CHIPS usando el patrón REAL del bundle (`kr-chips` +
 *     `kr-chip` + `kr-chip.is-sel` + `kr-chip__lab` + `kr-chip__sub`,
 *     verificados en el CSS interno del bundle líneas 448-459, mismo
 *     patrón que la línea 2234 del propio bundle). Primera opción =
 *     BASE (svc.name + basePrice + baseDuration). Siguientes =
 *     svc.variantes[i]. Cada chip muestra label + precio ("incluido"
 *     si 0€) + duración. Al clicar, state.variantIdx cambia y
 *     _recompute recalcula precio/duración visible al momento. Cero
 *     clases CSS nuevas: reutiliza las existentes del bundle sin
 *     tocar la estética.
 *   · _submit: payload incluye ahora varianteSel {idx, label, price,
 *     duration} si el cliente eligió variante ≠ base. Si eligió base
 *     o el servicio no tiene variantes, varianteSel = null. El motor
 *     público v0.7.7 lo propaga a crearPackReserva sin transformarlo.
 *
 *   Cero cambios en: renderizado del grid de servicios, cabecera del
 *   servicio (basePrice sigue siendo lo que se pinta en la card del
 *   grid = "desde X€"), complementos (bool/choice/exclusive intactos),
 *   flujo de días/horas, sección de datos del cliente, consentimientos
 *   legales, descuento promocional (sigue aplicándose sobre basePrice —
 *   ver nota abajo), gating de RESERVAR, resumen. Cero clases CSS
 *   nuevas.
 *
 *   Nota sobre el descuento promocional (v2.0.10): `promoPct` sigue
 *   aplicándose SOLO sobre basePrice. Si el cliente elige variante
 *   ≠ base, el descuento NO se aplica a la variante (comportamiento
 *   idéntico al 100% con Recepción Pro V2). Este es un caso raro (los
 *   servicios simple_variantes rara vez llevan promo), pero se
 *   documenta explícitamente.
 *
 * v2.0.14 — GRUPO EXCLUSIVO + PANELES EXPANDIBLES.
 *   Backend pareja: widgetPublicoLogic v0.7.5.
 *
 *   · _renderComplements ahora reconoce c.type === 'exclusive'.
 *     Se renderiza como panel PLEGABLE por defecto: un header
 *     clicable con el label del grupo ("Tratamiento", "Peinado"…)
 *     y, al abrirse, una lista de opciones tipo radio (una única
 *     seleccionable) más "No añadir" como primera opción.
 *     Reutiliza .kr-chips + .kr-chip para máxima coherencia con el
 *     patrón existente de choice; añade un contenedor colapsable
 *     .kr-expand con header .kr-expand__head y cuerpo .kr-expand__body.
 *
 *   · UX secundaria: los complementos type:'choice' con variantes
 *     (Peinado M/L/XL) también se muestran plegados por defecto.
 *     Al desplegarse aparecen las variantes con precio/duración.
 *     Igual criterio: opcional siempre visible como panel expandible
 *     para reducir densidad vertical.
 *
 *   · _submit: exclusive envía la opción elegida como objeto
 *     { uid, varianteId, varianteLabel, price, duration } donde uid
 *     es el setupUid del servicio elegido (no el id del grupo). El
 *     backend recepcionProLogic v1.0.34 lo materializa en la posición
 *     del chip rojo (rama tipo:'exclusivo' del mapeoFases). Si el
 *     estado es 'none' (o inexistente), no se envía nada.
 *
 *   · _calc: suma correctamente price y duration de la opción elegida
 *     en exclusive (reutiliza el mismo camino que choice).
 *
 *   · _complementosObligatoriosOk sigue igual: exclusive es siempre
 *     opcional (required:false por diseño), no bloquea el botón.
 *
 *   · Cero cambios en: legales, gating de datos, casillas, pago online,
 *     rail lateral, resumen, cabecera, skins.
 *
 * v2.0.13 — Complementos con VARIANTES y OBLIGATORIOS.
 *   · El backend (widgetPublicoLogic v0.7.2) ya emite los complementos con
 *     variantes como type:'choice' (opciones M/L/XL con su precio/duración)
 *     y con required:true si son obligatorios. _calc() ya sumaba la opción
 *     elegida; _choiceControl ya la pinta. Esta versión cierra el flujo:
 *   · _submit envía el complemento choice elegido como objeto
 *     { uid, varianteId, varianteLabel, price, duration } (antes los choice
 *     NO se enviaban → la variante se perdía). Los bool siguen yendo como uid.
 *   · GATING: nuevo _complementosObligatoriosOk() — un complemento required
 *     debe tener variante elegida (≠'none') para activar RESERVAR. Se suma a
 *     la condición del botón (datos + casillas legales + obligatorios).
 *
 * v2.0.12 — Casillas de consentimiento legal antes de RESERVAR.
 *   · Dos checkboxes marcados por defecto, encima del botón RESERVAR:
 *     Política de Protección de Datos y Términos y Condiciones.
 *   · Cada uno con texto subrayado clicable que abre la URL en pestaña
 *     nueva (target="_blank"). URLs desde salonConfig.privacyPolicyUrl /
 *     salonConfig.termsConditionsUrl (backend widgetPublicoLogic v0.7.1).
 *     Si una URL está vacía, el enlace queda inerte (responsabilidad del
 *     salón); la casilla sigue siendo obligatoria.
 *   · GATING ampliado: el botón RESERVAR (y "Pagar online") solo se activa
 *     con hora + datos completos válidos + AMBAS casillas en true. Si se
 *     desmarca cualquiera → botón fantasma. Nuevo helper _datosCompletos()
 *     (misma regla que _submit, sin marcar errores). Los inputs de datos
 *     re-evalúan el gating en vivo (input → _renderActions).
 *   · Reutiliza la clase .kr-check existente (hereda estética y skin).
 *   · Pago online DESACTIVADO (flag PAGO_ONLINE_ACTIVO=false): el botón
 *     "Pagar online ahora" no se renderiza mientras no haya pasarela
 *     conectada. El bloque permanece intacto; reactivar = flag a true.
 *
 * v2.0.11 — FIX layout del rail lateral.
 *   · Desbordamiento del valor en el panel destacado de promo: cuando
 *     la key era larga ("Precio final a pagar en salón") y el valor con
 *     decimales (ej. 203,55 €), el valor se salía del panel por la
 *     derecha. La fila base `.kr-prow` no estaba preparada para wrap
 *     en columnas estrechas (rail 314px). Solo en las filas del panel
 *     promo: la key ahora wrappea y el valor queda compacto sin partir.
 *   · Tarjeta "Tu reserva" del rail lateral no se quedaba flotante al
 *     hacer scroll. El `margin-top: 290px` de v2.0.3 era tan grande que
 *     en pantallas no muy altas dejaba la tarjeta fuera de la viewport
 *     ANTES de hacer scroll, y el sticky perdía su anclaje. Ahora:
 *     · margin-top reducido de 290px → 90px.
 *     · `position: sticky` reforzado también sobre el card del summary
 *       (no solo en el contenedor .kr-rail-side).
 *     · `align-self: start` explícito para que el grid de la shell no
 *       estire el item y rompa el sticky en algunos motores.
 *     · `max-height: calc(100vh - 32px); overflow-y: auto` para que si
 *       el resumen es muy alto en una pantalla pequeña, scrolle
 *       internamente sin desbordar el viewport.
 *
 * v2.0.10 — Descuento promocional visible en el resumen de la reserva.
 *   · El widget público SOLO MUESTRA que el servicio elegido tiene
 *     descuento promocional activo en ServiceCatalog (descuentoActivo
 *     + descuentoPromo, expuesto por widgetPublicoLogic v0.7.0+ como
 *     `promoPct`). NO cobra ni gestiona el pago — el cobro real con el
 *     descuento aplicado al neto sucede en salón vía Recepción Pro V2.
 *   · En el bloque resumen ("Tu reserva") se añade un panel destacado
 *     cuando hay promo activa, con la leyenda:
 *
 *       🎉 ENHORABUENA, este servicio tiene un descuento promocional
 *
 *     seguido del desglose con tres filas:
 *       · Precio original
 *       · Descuento (−X%)
 *       · Precio final a pagar en salón  (en negrita)
 *
 *   · La PANTALLA DE CONFIRMACIÓN FINAL también muestra el mismo panel
 *     destacado cuando la cita confirmada llevaba descuento. El
 *     desglose se renderiza después del card resumen, antes de la
 *     frase de cierre. Coherencia con el resumen pre-confirmación.
 *
 *   · El payTxt de la confirmación ahora usa calc.total (precio NETO
 *     con descuento) en lugar de conf.precioTotal del backend cuando
 *     hay promo. El backend guarda en KamisuiteReservations el precio
 *     BRUTO del catálogo; el descuento se aplica al cobrar en salón
 *     (Recepción Pro V2 vía importeNeto). Antes la confirmación pintaba
 *     "A pagar en el salón · 16 €" cuando lo correcto era "14,40 €".
 *
 *   · El helper EUR ahora formatea con 2 decimales cuando los haya:
 *     `EUR(14.4)` → `"14,40 €"` en lugar del antiguo `"14 €"`. Antes
 *     usaba `Math.round(n)` lo que producía cuentas matemáticamente
 *     incoherentes en cualquier resumen con descuento (`16 € − 2 € =
 *     14 €` cuando realmente eran `16,00 € − 1,60 € = 14,40 €`). Este
 *     cambio afecta a TODOS los importes del bundle (cabecera del
 *     servicio "desde X €", botón de reservar "· X €", "Ahorras X €",
 *     total tachado, etc.) y los hace consistentes entre sí.
 *
 *   · Estética: el panel reutiliza tokens `--kr-accent-soft` /
 *     `--kr-accent-line` / `--kr-accent-2` / `--kr-radius` del skin
 *     activo (Niebla, Lumière, Aurora, Botánica, Océano...). NO se
 *     introducen colores hardcoded: cada salón verá el panel en la
 *     paleta de su tema. Multi-tenant.
 *
 *   · La cabecera interna del servicio sustituye el copy `−X% lanzamiento`
 *     por `−X%` a secas. El nuevo panel del resumen ya explica que es un
 *     descuento promocional; el badge de cabecera queda compacto.
 *   · La línea pequeña del nombre del servicio en el resumen sustituye
 *     `<small>−X% lanzamiento</small>` por `<small>−X%</small>` por el
 *     mismo motivo: el panel destacado arriba ya da el contexto.
 *
 *   · El descuento ahora se aplica SOLO al precio base del servicio
 *     principal (no a complementos). Paridad estricta con Recepción Pro
 *     V2: ServiceCatalog.descuentoPromo es un campo del servicio
 *     principal, no de sus complementos. Si el cliente añade
 *     complementos, su precio se suma intacto al total; el ahorro sale
 *     solo del precio base. Servicios `tbd` (sin precio cerrado) no
 *     reciben promo.
 *
 * v2.0.9 — Fix race UI al cambiar de profesional.
 *   · _renderProMain ahora llama a _recompute(true) tras cambiar
 *     proMain. Antes solo repintaba el resumen, dejando la rejilla de
 *     huecos con los slots del staff ANTERIOR — al alternar entre
 *     profesionales el widget mostraba huecos incorrectos. Reset de
 *     state.hour al cambiar de profesional (mismo patrón que
 *     _afterCompChange). No-op si proMain no cambia.
 *
 * v2.0.8 — Filtro de staff por servicio (idStaff) con chips apagados.
 * v2.0.7 — Carga de Google Fonts vía document.head.
 * v2.0.5 — Rail con 6 días fijos.
 *
 * REQUIERE: backend widgetPublicoLogic >= v0.7.0
 *           page code reservar >= v0.3.2
 * =====================================================================
 */
/* ============================================================================
   kr-styles.js — Shadow-DOM stylesheet for <kami-reserva>
   Everything visual is driven by --kr-* tokens declared on :host.
   A "skin" is just a map of these tokens applied inline on the element;
   inline custom props override :host, so config repaints the widget whole.
   ========================================================================== */
window.KR_STYLES = `
:host {
  /* ---- color (Niebla — cool neutral base) ---------------------------- */
  --kr-bg:            oklch(98.6% 0.003 250);
  --kr-surface:       oklch(100% 0 0);
  --kr-surface-2:     oklch(97.4% 0.004 250);
  --kr-inset:         oklch(96.2% 0.005 252);
  --kr-line:          oklch(91% 0.006 252);
  --kr-line-2:        oklch(84% 0.008 252);
  --kr-ink:           oklch(30% 0.013 258);
  --kr-ink-2:         oklch(48% 0.011 258);
  --kr-ink-3:         oklch(64% 0.009 258);
  --kr-accent:        oklch(40% 0.022 258);
  --kr-accent-2:      oklch(33% 0.024 258);
  --kr-accent-ink:    oklch(98.5% 0.003 250);
  --kr-accent-soft:   oklch(93.5% 0.012 256);
  --kr-accent-line:   oklch(62% 0.02 256);
  --kr-focus:         oklch(58% 0.13 256);
  --kr-danger:        oklch(55% 0.18 25);
  --kr-danger-soft:   oklch(95% 0.035 28);

  /* ---- semantic scheduling colors (skinnable) ----------------------- */
  /* naranja medio — borde y selección de día + CTA primario de pago */
  --kr-orange:        oklch(64% 0.15 50);
  --kr-orange-2:      oklch(57% 0.155 47);
  --kr-orange-ink:    oklch(99% 0.012 80);
  --kr-orange-soft:   oklch(96% 0.03 62);
  --kr-orange-line:   oklch(70% 0.13 52);
  /* verde suave — relleno de chips de hora */
  --kr-green-soft:    oklch(94% 0.05 152);
  --kr-green-soft-2:  oklch(90% 0.07 152);
  --kr-green:         oklch(53% 0.115 153);
  --kr-green-ink:     oklch(40% 0.09 155);
  --kr-green-ink-on:  oklch(99% 0.02 150);
  --kr-green-line:    oklch(84% 0.06 152);

  /* ---- type ---------------------------------------------------------- */
  --kr-font:          "Bai Jamjuree", ui-sans-serif, system-ui, sans-serif;
  --kr-fs-eyebrow:    0.72rem;
  --kr-fs-xs:         0.8rem;
  --kr-fs-sm:         0.875rem;
  --kr-fs-base:       0.95rem;
  --kr-fs-md:         1.0625rem;
  --kr-fs-lg:         1.25rem;
  --kr-fs-xl:         1.7rem;
  --kr-fs-price:      2.1rem;
  --kr-w-normal:      400;
  --kr-w-medium:      500;
  --kr-w-semi:        600;
  --kr-w-bold:        700;

  /* ---- shape & space ------------------------------------------------- */
  --kr-radius:        10px;
  --kr-radius-sm:     max(4px, calc(var(--kr-radius) - 5px));
  --kr-radius-lg:     calc(var(--kr-radius) + 6px);
  --kr-radius-pill:   999px;
  --kr-control-h:     50px;
  --kr-gap:           12px;
  --kr-section-gap:   42px;
  --kr-pad:           30px;
  --kr-maxw:          920px;
  --kr-ring:          3px;

  /* ---- elevation & motion ------------------------------------------- */
  --kr-shadow-1:      0 1px 2px oklch(40% 0.02 258 / .05), 0 1px 1px oklch(40% 0.02 258 / .04);
  --kr-shadow-2:      0 14px 40px -18px oklch(40% 0.03 258 / .28), 0 2px 8px oklch(40% 0.02 258 / .06);
  --kr-dur:           170ms;
  --kr-ease:          cubic-bezier(.2,.7,.2,1);

  display: block;
  box-sizing: border-box;
  font-family: var(--kr-font);
  color: var(--kr-ink);
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
  font-feature-settings: "tnum" 0;
  container-type: inline-size;
}
:host *, :host *::before, :host *::after { box-sizing: border-box; }

.kr {
  background: var(--kr-bg);
  border-radius: var(--kr-radius-lg);
  border: 1px solid var(--kr-line);
  padding: var(--kr-pad);
  max-width: var(--kr-maxw);
  margin: 0 auto;
  position: relative;
  overflow: visible;
  transition: background var(--kr-dur) var(--kr-ease), border-color var(--kr-dur) var(--kr-ease);
}

/* ---- layout: columna de acción única + rail de resumen pasivo -------- */
.kr-shell { display: flex; flex-direction: column; gap: var(--kr-section-gap); }
.kr-flow { display: flex; flex-direction: column; gap: var(--kr-section-gap); min-width: 0; }
.kr-rail-side { display: none; }
@container (min-width: 820px) {
  .kr-shell { display: grid; grid-template-columns: minmax(0, 1fr) 314px; gap: 52px; align-items: start; }
  .kr-flow { max-width: 660px; }
  .kr-rail-side { display: block; position: sticky; top: 24px; }
  .kr-summary--inline { display: none; }
}

/* ---- sections -------------------------------------------------------- */
.kr-sec { display: flex; flex-direction: column; gap: 16px; }
.kr-sec__head { display: flex; flex-direction: column; gap: 5px; }
.kr-eyebrow {
  font-size: var(--kr-fs-eyebrow);
  font-weight: var(--kr-w-semi);
  letter-spacing: .14em;
  text-transform: uppercase;
  color: var(--kr-ink-3);
  display: flex; align-items: center; gap: 9px;
}
.kr-eyebrow::before {
  content: ""; width: 6px; height: 6px; border-radius: 2px;
  background: var(--kr-accent-line); flex: none;
}
.kr-sec__title { font-size: var(--kr-fs-lg); font-weight: var(--kr-w-semi); line-height: 1.2; margin: 0; letter-spacing: -.01em; }
.kr-sec__hint  { font-size: var(--kr-fs-sm); color: var(--kr-ink-2); line-height: 1.45; margin: 0; }
.kr-field { display: flex; flex-direction: column; gap: 10px; }
.kr-label { font-size: var(--kr-fs-sm); font-weight: var(--kr-w-medium); color: var(--kr-ink-2); }
.kr-label small { font-weight: var(--kr-w-normal); color: var(--kr-ink-3); }

/* ---- day field header + date jump ----------------------------------- */
.kr-dayhead { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.kr-datejump {
  position: relative; display: inline-flex; align-items: center; gap: 8px;
  padding: 9px 14px; min-height: 40px; border-radius: var(--kr-radius);
  border: 1px solid var(--kr-line-2); background: var(--kr-surface);
  color: var(--kr-ink-2); font-size: var(--kr-fs-xs); font-weight: var(--kr-w-medium);
  transition: all var(--kr-dur) var(--kr-ease);
}
.kr-datejump:hover { border-color: var(--kr-ink-3); color: var(--kr-ink); }
.kr-datejump svg { width: 15px; height: 15px; flex: none; color: var(--kr-ink-3); }
.kr-datejump__input {
  position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0;
  border: 0; margin: 0; padding: 0; cursor: pointer; font-family: inherit;
}
.kr-datejump__input::-webkit-calendar-picker-indicator {
  position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; cursor: pointer;
}

/* ---- day rail -------------------------------------------------------- */
.kr-rail-wrap { position: relative; margin: 0 -4px; }
.kr-rail {
  display: flex; gap: 10px; overflow-x: auto; scroll-behavior: smooth;
  padding: 4px; scrollbar-width: none; -ms-overflow-style: none;
}
.kr-rail::-webkit-scrollbar { display: none; }
.kr-monsep {
  display: flex; flex-direction: column; justify-content: center; align-items: center;
  flex: none; padding: 0 4px 0 6px; writing-mode: vertical-rl; transform: rotate(180deg);
  font-size: var(--kr-fs-eyebrow); font-weight: var(--kr-w-semi); letter-spacing: .12em;
  text-transform: uppercase; color: var(--kr-ink-3);
}
.kr-day {
  flex: none; width: 62px; height: 78px; border-radius: var(--kr-radius);
  border: 1px solid var(--kr-orange-line); background: var(--kr-surface);
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
  cursor: pointer; font-family: inherit; color: var(--kr-ink);
  transition: all var(--kr-dur) var(--kr-ease);
}
.kr-day:hover:not(.is-full):not(.is-sel) { border-color: var(--kr-orange); background: var(--kr-orange-soft); transform: translateY(-2px); }
.kr-day__dow { font-size: var(--kr-fs-xs); font-weight: var(--kr-w-medium); color: var(--kr-ink-3); text-transform: lowercase; }
.kr-day__num { font-size: var(--kr-fs-lg); font-weight: var(--kr-w-semi); line-height: 1; }
.kr-day__tag { font-size: 0.62rem; color: var(--kr-ink-3); }
.kr-day.is-sel {
  background: var(--kr-orange); border-color: var(--kr-orange); color: var(--kr-orange-ink);
  box-shadow: var(--kr-shadow-1);
}
.kr-day.is-sel .kr-day__dow, .kr-day.is-sel .kr-day__tag { color: var(--kr-orange-ink); opacity: .85; }
.kr-day.is-full { opacity: .5; cursor: not-allowed; border-color: var(--kr-line); background: var(--kr-surface-2); }
.kr-day.is-full .kr-day__num { color: var(--kr-ink-3); }
.kr-day.is-full .kr-day__tag { color: var(--kr-ink-3); }
.kr-rail-fade {
  position: absolute; top: 0; bottom: 0; width: 34px; pointer-events: none; z-index: 1;
  transition: opacity var(--kr-dur) var(--kr-ease);
}
.kr-rail-fade.l { left: 0; background: linear-gradient(to right, var(--kr-bg), transparent); }
.kr-rail-fade.r { right: 0; background: linear-gradient(to left, var(--kr-bg), transparent); }
.kr-rail-fade.off { opacity: 0; }

/* ---- professional chips --------------------------------------------- */
.kr-pros { display: flex; flex-wrap: wrap; gap: 10px; }
.kr-pro {
  display: inline-flex; align-items: center; gap: 10px; padding: 7px 16px 7px 7px;
  border-radius: var(--kr-radius-pill); border: 1px solid var(--kr-line);
  background: var(--kr-surface); cursor: pointer; font-family: inherit;
  color: var(--kr-ink); font-size: var(--kr-fs-sm); font-weight: var(--kr-w-medium);
  transition: all var(--kr-dur) var(--kr-ease); min-height: 44px;
}
.kr-pro:hover:not(.is-sel) { border-color: var(--kr-line-2); }
.kr-pro__av {
  width: 30px; height: 30px; border-radius: 50%; flex: none;
  display: grid; place-items: center; font-size: 0.74rem; font-weight: var(--kr-w-semi);
  background: var(--kr-inset); color: var(--kr-ink-2); letter-spacing: .02em;
}
.kr-pro__av.any { background: var(--kr-surface-2); border: 1px dashed var(--kr-line-2); color: var(--kr-ink-3); }
.kr-pro.is-sel { border-color: var(--kr-accent); background: var(--kr-accent-soft); color: var(--kr-accent-2); }
.kr-pro.is-sel .kr-pro__av { background: var(--kr-accent); color: var(--kr-accent-ink); border: 0; }

/* ---- segmented (sí/no & few options) -------------------------------- */
.kr-seg {
  display: inline-flex; padding: 4px; gap: 4px; background: var(--kr-inset);
  border-radius: var(--kr-radius); border: 1px solid var(--kr-line);
}
.kr-seg__opt {
  appearance: none; border: 0; background: transparent; font-family: inherit; cursor: pointer;
  padding: 9px 22px; min-height: 40px; border-radius: max(4px, calc(var(--kr-radius) - 4px));
  font-size: var(--kr-fs-sm); font-weight: var(--kr-w-medium); color: var(--kr-ink-2);
  transition: all var(--kr-dur) var(--kr-ease);
}
.kr-seg__opt:hover:not(.is-sel) { color: var(--kr-ink); }
.kr-seg__opt.is-sel { background: var(--kr-surface); color: var(--kr-ink); box-shadow: var(--kr-shadow-1); font-weight: var(--kr-w-semi); }

/* ---- option chips (2–6 dynamic) ------------------------------------- */
.kr-chips { display: flex; flex-wrap: wrap; gap: 10px; }
.kr-chip {
  position: relative; display: inline-flex; flex-direction: column; gap: 2px;
  padding: 11px 18px; border-radius: var(--kr-radius); border: 1px solid var(--kr-line);
  background: var(--kr-surface); cursor: pointer; font-family: inherit; color: var(--kr-ink);
  transition: all var(--kr-dur) var(--kr-ease); min-height: 44px; text-align: left;
}
.kr-chip:hover:not(.is-sel) { border-color: var(--kr-line-2); }
.kr-chip__lab { font-size: var(--kr-fs-sm); font-weight: var(--kr-w-medium); line-height: 1.2; }
.kr-chip__sub { font-size: var(--kr-fs-xs); color: var(--kr-ink-3); font-variant-numeric: tabular-nums; }
.kr-chip.is-sel { border-color: var(--kr-accent); background: var(--kr-accent-soft); color: var(--kr-accent-2); }
.kr-chip.is-sel .kr-chip__sub { color: var(--kr-accent-2); opacity: .8; }
.kr-chip.is-sel::after {
  content: ""; position: absolute; top: -5px; right: -5px; width: 16px; height: 16px;
  border-radius: 50%; background: var(--kr-accent); color: var(--kr-accent-ink);
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='20 6 9 17 4 12'/%3E%3C/svg%3E");
  background-repeat: no-repeat; background-position: center; box-shadow: 0 0 0 2px var(--kr-bg);
}

/* ---- expand (v2.0.14) — panel plegable para exclusive / choice ----- */
.kr-expand {
  display: flex; flex-direction: column;
  border: 1px solid var(--kr-line); border-radius: var(--kr-radius);
  background: var(--kr-surface); overflow: hidden;
  transition: border-color var(--kr-dur) var(--kr-ease);
}
.kr-expand.is-open { border-color: var(--kr-line-2); }
.kr-expand.has-selection { border-color: var(--kr-accent); background: var(--kr-accent-soft); }
.kr-expand__head {
  display: flex; align-items: center; justify-content: space-between;
  gap: 12px; padding: 14px 18px; cursor: pointer; user-select: none;
  font-family: inherit; text-align: left; background: transparent; border: 0;
  color: var(--kr-ink); width: 100%;
}
.kr-expand__title { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
.kr-expand__lab { font-size: var(--kr-fs-sm); font-weight: var(--kr-w-semi); line-height: 1.2; }
.kr-expand__sub { font-size: var(--kr-fs-xs); color: var(--kr-ink-3); line-height: 1.2; }
.kr-expand.has-selection .kr-expand__sub { color: var(--kr-accent-2); font-weight: var(--kr-w-medium); }
.kr-expand__arrow {
  flex-shrink: 0; width: 14px; height: 14px; color: var(--kr-ink-3);
  transition: transform var(--kr-dur) var(--kr-ease);
}
.kr-expand.is-open .kr-expand__arrow { transform: rotate(180deg); color: var(--kr-ink); }
.kr-expand__body {
  padding: 0 18px 16px 18px; display: none; flex-direction: column; gap: 10px;
  border-top: 1px solid var(--kr-line);
}
.kr-expand.is-open .kr-expand__body { display: flex; padding-top: 14px; }

/* ---- switch row (mismo profesional) --------------------------------- */
.kr-switchrow {
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
  padding: 14px 18px; border-radius: var(--kr-radius); border: 1px solid var(--kr-line);
  background: var(--kr-surface-2);
}
.kr-switchrow__txt { font-size: var(--kr-fs-sm); color: var(--kr-ink); font-weight: var(--kr-w-medium); }
.kr-switchrow__txt small { display: block; font-weight: var(--kr-w-normal); color: var(--kr-ink-3); margin-top: 2px; }
.kr-switch {
  appearance: none; position: relative; width: 46px; height: 27px; flex: none; cursor: pointer;
  border-radius: var(--kr-radius-pill); background: var(--kr-line-2); border: 0;
  transition: background var(--kr-dur) var(--kr-ease);
}
.kr-switch::after {
  content: ""; position: absolute; top: 3px; left: 3px; width: 21px; height: 21px;
  border-radius: 50%; background: var(--kr-surface); box-shadow: var(--kr-shadow-1);
  transition: transform var(--kr-dur) var(--kr-ease);
}
.kr-switch:checked { background: var(--kr-accent); }
.kr-switch:checked::after { transform: translateX(19px); }
.kr-subselect { margin-top: 4px; }

/* ---- hours grid ------------------------------------------------------ */
.kr-hours-head {
  display: flex; align-items: flex-end; justify-content: space-between; gap: 16px;
  padding-bottom: 14px; border-bottom: 1px solid var(--kr-line); flex-wrap: wrap;
}
.kr-hours-count { font-size: var(--kr-fs-sm); color: var(--kr-ink-2); font-weight: var(--kr-w-medium); }
.kr-hours-count b { color: var(--kr-ink); font-weight: var(--kr-w-semi); }
.kr-priceblock { text-align: right; }
.kr-priceblock__lab { font-size: var(--kr-fs-eyebrow); letter-spacing: .1em; text-transform: uppercase; color: var(--kr-ink-3); font-weight: var(--kr-w-medium); }
.kr-priceblock__row { display: flex; align-items: baseline; gap: 9px; justify-content: flex-end; }
.kr-priceblock__was { font-size: var(--kr-fs-sm); color: var(--kr-ink-3); text-decoration: line-through; font-variant-numeric: tabular-nums; }
.kr-priceblock__now { font-size: var(--kr-fs-lg); font-weight: var(--kr-w-bold); color: var(--kr-ink); font-variant-numeric: tabular-nums; letter-spacing: -.01em; }
.kr-hours {
  display: flex; flex-wrap: wrap; gap: 10px; padding-top: 18px; min-height: 50px;
  animation: kr-fade var(--kr-dur) var(--kr-ease);
}
.kr-hour {
  appearance: none; font-family: inherit; cursor: pointer; min-width: 84px; min-height: 44px;
  padding: 11px 18px; border-radius: var(--kr-radius-pill); border: 1px solid var(--kr-green-line);
  background: var(--kr-green-soft); color: var(--kr-green-ink); font-size: var(--kr-fs-sm);
  font-weight: var(--kr-w-medium); font-variant-numeric: tabular-nums; letter-spacing: .01em;
  transition: all var(--kr-dur) var(--kr-ease);
}
.kr-hour:hover:not(.is-sel) { background: var(--kr-green-soft-2); border-color: var(--kr-green); transform: translateY(-2px); }
.kr-hour.is-sel { background: var(--kr-green); border-color: var(--kr-green); color: var(--kr-green-ink-on); font-weight: var(--kr-w-semi); box-shadow: var(--kr-shadow-1); }

/* ---- grid states ----------------------------------------------------- */
.kr-state { padding: 30px 22px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 12px; animation: kr-fade var(--kr-dur) var(--kr-ease); }
.kr-state__t { font-size: var(--kr-fs-md); font-weight: var(--kr-w-semi); color: var(--kr-ink); }
.kr-state__d { font-size: var(--kr-fs-sm); color: var(--kr-ink-2); max-width: 38ch; line-height: 1.5; }
.kr-spin { width: 30px; height: 30px; border-radius: 50%; border: 3px solid var(--kr-line); border-top-color: var(--kr-accent); animation: kr-spin .8s linear infinite; }
.kr-skel { display: flex; flex-wrap: wrap; gap: 10px; padding-top: 18px; }
.kr-skel span { width: 84px; height: 44px; border-radius: var(--kr-radius-pill); background: linear-gradient(90deg, var(--kr-inset) 25%, var(--kr-surface-2) 50%, var(--kr-inset) 75%); background-size: 200% 100%; animation: kr-shimmer 1.3s ease-in-out infinite; }
.kr-state__ic { width: 44px; height: 44px; border-radius: 50%; display: grid; place-items: center; background: var(--kr-inset); color: var(--kr-ink-2); }
.kr-state__ic.err { background: var(--kr-danger-soft); color: var(--kr-danger); }
.kr-state__ic svg { width: 22px; height: 22px; }

/* ---- summary (espejo pasivo de la reserva) -------------------------- */
.kr-summary {
  border: 1px solid var(--kr-line); border-radius: var(--kr-radius);
  background: var(--kr-surface); box-shadow: var(--kr-shadow-1); overflow: hidden;
  animation: kr-rise 240ms var(--kr-ease);
}
.kr--wide .kr-summary { border-color: var(--kr-accent-line); }
.kr-summary--rail { border-color: var(--kr-accent-line); }
.kr-summary__title {
  font-size: var(--kr-fs-eyebrow); font-weight: var(--kr-w-semi); letter-spacing: .14em;
  text-transform: uppercase; color: var(--kr-ink-3); padding: 16px 20px 0;
}
.kr-summary__svc {
  font-size: var(--kr-fs-md); font-weight: var(--kr-w-semi); letter-spacing: -.01em;
  padding: 3px 20px 14px; border-bottom: 1px solid var(--kr-line);
}
.kr-summary__svc small { color: var(--kr-accent-2); font-weight: var(--kr-w-medium); font-size: var(--kr-fs-xs); letter-spacing: 0; }
.kr-summary__rows { padding: 4px 20px; }
.kr-summary .kr-total { margin: 0; padding: 15px 20px; border-top: 1px solid var(--kr-line); background: var(--kr-surface-2); }

/* ---- locked sections (revelado progresivo del flujo) ---------------- */
.kr-locknote {
  display: flex; align-items: center; gap: 9px; font-size: var(--kr-fs-sm); color: var(--kr-ink-3);
  padding: 12px 15px; border: 1px dashed var(--kr-line-2); border-radius: var(--kr-radius); background: var(--kr-surface-2);
}
.kr-locknote svg { width: 15px; height: 15px; flex: none; }
.kr-sec.is-locked .kr-field,
.kr-sec.is-locked .kr-actions { opacity: .45; transition: opacity var(--kr-dur) var(--kr-ease); }
.kr-sec.is-locked .kr-field { pointer-events: none; }
.kr-muted { color: var(--kr-ink-3) !important; font-weight: var(--kr-w-normal) !important; }

/* ---- "a valorar" -----------------------------------------------------*/
.kr-priceblock__tbd { font-size: var(--kr-fs-lg); font-weight: var(--kr-w-bold); color: var(--kr-ink); letter-spacing: -.01em; }
.kr-total__now--tbd { font-size: var(--kr-fs-lg) !important; }

/* ---- rows / totals (compartidos por el resumen) --------------------- */
.kr-prow { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; padding: 11px 0; border-bottom: 1px solid var(--kr-line); }
.kr-prow:last-of-type { border-bottom: 0; }
.kr-prow__k { font-size: var(--kr-fs-sm); color: var(--kr-ink-2); flex: none; }
.kr-prow__v { font-size: var(--kr-fs-sm); color: var(--kr-ink); font-weight: var(--kr-w-medium); text-align: right; }
.kr-prow__v small { display: block; font-weight: var(--kr-w-normal); color: var(--kr-ink-3); }
.kr-total { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; margin-top: 14px; padding-top: 16px; border-top: 2px solid var(--kr-line-2); }
.kr-total__lab { display: flex; flex-direction: column; gap: 3px; }
.kr-total__lab b { font-size: var(--kr-fs-md); font-weight: var(--kr-w-semi); }
.kr-total__save { font-size: var(--kr-fs-xs); color: var(--kr-accent-2); font-weight: var(--kr-w-medium); }
.kr-total__nums { text-align: right; display: flex; align-items: baseline; gap: 10px; }
.kr-total__was { font-size: var(--kr-fs-md); color: var(--kr-ink-3); text-decoration: line-through; font-variant-numeric: tabular-nums; }
.kr-total__now { font-size: var(--kr-fs-price); font-weight: var(--kr-w-bold); letter-spacing: -.02em; font-variant-numeric: tabular-nums; line-height: 1; }

/* ---- client inputs --------------------------------------------------- */
.kr-prefill {
  display: flex; align-items: center; gap: 10px; padding: 11px 16px; margin-bottom: 4px;
  border-radius: var(--kr-radius); background: var(--kr-accent-soft); border: 1px solid var(--kr-accent-line);
  font-size: var(--kr-fs-sm); color: var(--kr-accent-2); font-weight: var(--kr-w-medium);
}
.kr-prefill svg { width: 18px; height: 18px; flex: none; }
.kr-grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.kr-input, .kr-textarea {
  width: 100%; font-family: inherit; font-size: var(--kr-fs-base); color: var(--kr-ink);
  background: var(--kr-surface); border: 1px solid var(--kr-line); border-radius: var(--kr-radius);
  padding: 0 16px; height: var(--kr-control-h); transition: border-color var(--kr-dur) var(--kr-ease), box-shadow var(--kr-dur) var(--kr-ease);
}
.kr-textarea { padding: 14px 16px; height: auto; min-height: 84px; resize: vertical; line-height: 1.5; }
.kr-input::placeholder, .kr-textarea::placeholder { color: var(--kr-ink-3); }
.kr-input.is-filled, .kr-textarea.is-filled { background: var(--kr-surface-2); }
.kr-input.err, .kr-textarea.err { border-color: var(--kr-danger); background: var(--kr-danger-soft); }
.kr-errmsg { font-size: var(--kr-fs-xs); color: var(--kr-danger); font-weight: var(--kr-w-medium); display: flex; align-items: center; gap: 5px; }
.kr-errmsg svg { width: 13px; height: 13px; }
.kr-check { display: flex; align-items: flex-start; gap: 11px; cursor: pointer; padding: 4px 0; }
.kr-check input { appearance: none; width: 22px; height: 22px; flex: none; margin-top: 1px; border-radius: max(4px, calc(var(--kr-radius) - 6px)); border: 1.5px solid var(--kr-line-2); background: var(--kr-surface); cursor: pointer; transition: all var(--kr-dur) var(--kr-ease); }
.kr-check input:checked { background: var(--kr-accent) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='13' height='13' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='20 6 9 17 4 12'/%3E%3C/svg%3E") center / 13px no-repeat; border-color: var(--kr-accent); }
.kr-check__txt { font-size: var(--kr-fs-sm); color: var(--kr-ink-2); line-height: 1.4; }
.kr-legal-link { color: var(--kr-accent); text-decoration: underline; cursor: pointer; }
.kr-legal-link.is-empty { cursor: default; }

/* ---- actions --------------------------------------------------------- */
.kr-actions { display: flex; flex-direction: column; gap: 12px; }
.kr-btn {
  appearance: none; font-family: inherit; cursor: pointer; width: 100%;
  min-height: 56px; padding: 12px 24px; border-radius: var(--kr-radius);
  display: flex; align-items: center; justify-content: center; gap: 12px; text-align: center;
  font-size: var(--kr-fs-md); font-weight: var(--kr-w-semi); transition: all var(--kr-dur) var(--kr-ease);
  border: 1px solid transparent; line-height: 1.15;
}
.kr-btn__price { font-weight: var(--kr-w-bold); font-variant-numeric: tabular-nums; }
.kr-btn__sub { font-size: var(--kr-fs-xs); font-weight: var(--kr-w-normal); opacity: .8; }
.kr-btn--primary { background: var(--kr-orange); color: var(--kr-orange-ink); box-shadow: var(--kr-shadow-1); }
.kr-btn--primary:hover { background: var(--kr-orange-2); transform: translateY(-2px); box-shadow: var(--kr-shadow-2); }
.kr-btn--ghost { background: var(--kr-surface); color: var(--kr-ink); border-color: var(--kr-line-2); }
.kr-btn--ghost:hover { border-color: var(--kr-ink-3); background: var(--kr-surface-2); }
.kr-btn:disabled { opacity: .5; cursor: not-allowed; transform: none !important; box-shadow: none; }
.kr-stack-lab { display: flex; flex-direction: column; align-items: center; gap: 2px; }
.kr-paybar { display: flex; align-items: center; justify-content: center; gap: 8px; font-size: var(--kr-fs-xs); color: var(--kr-ink-3); }
.kr-paybar svg { width: 14px; height: 14px; }
.kr-hint-pick { font-size: var(--kr-fs-sm); color: var(--kr-ink-3); text-align: center; padding: 4px; }

/* ---- confirmation ---------------------------------------------------- */
.kr-confirm { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 8px; padding: 24px 8px 8px; animation: kr-rise 360ms var(--kr-ease); }
.kr-confirm__badge {
  width: 76px; height: 76px; border-radius: 50%; display: grid; place-items: center; margin-bottom: 12px;
  background: var(--kr-accent-soft); color: var(--kr-accent); animation: kr-pop 480ms var(--kr-ease) both;
}
.kr-confirm__badge svg { width: 36px; height: 36px; stroke-dasharray: 40; stroke-dashoffset: 40; animation: kr-draw 520ms 180ms var(--kr-ease) forwards; }
.kr-confirm__t { font-size: var(--kr-fs-xl); font-weight: var(--kr-w-bold); letter-spacing: -.02em; line-height: 1.15; }
.kr-confirm__d { font-size: var(--kr-fs-base); color: var(--kr-ink-2); max-width: 40ch; line-height: 1.55; }
.kr-confirm__card { width: 100%; margin-top: 18px; border: 1px solid var(--kr-line); border-radius: var(--kr-radius); background: var(--kr-surface); overflow: hidden; text-align: left; }
.kr-confirm__card .kr-prow { padding: 13px 20px; }
.kr-confirm__foot { font-size: var(--kr-fs-xs); color: var(--kr-ink-3); margin-top: 18px; line-height: 1.5; }
.kr-linkbtn { appearance: none; background: none; border: 0; font-family: inherit; cursor: pointer; color: var(--kr-accent-2); font-weight: var(--kr-w-semi); font-size: var(--kr-fs-sm); text-decoration: underline; text-underline-offset: 3px; padding: 8px; margin-top: 10px; }

/* ---- focus ----------------------------------------------------------- */
.kr :focus-visible, .kr-switch:focus-visible, .kr-check input:focus-visible {
  outline: var(--kr-ring) solid color-mix(in oklch, var(--kr-focus) 40%, transparent);
  outline-offset: 2px;
}

/* ---- keyframes ------------------------------------------------------- */
@keyframes kr-spin { to { transform: rotate(360deg); } }
@keyframes kr-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
@keyframes kr-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes kr-rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
@keyframes kr-pop { 0% { transform: scale(.4); opacity: 0; } 60% { transform: scale(1.08); } 100% { transform: scale(1); opacity: 1; } }
@keyframes kr-draw { to { stroke-dashoffset: 0; } }
@media (prefers-reduced-motion: reduce) { :host * { animation: none !important; } }

/* ---- narrow container ------------------------------------------------ */
@container (max-width: 440px) {
  .kr { padding: 22px 18px; }
  .kr-grid2 { grid-template-columns: 1fr; }
  .kr-hours-head { align-items: flex-start; }
}
`;

/* ============================================================================
   kr-skins.js — Theme presets. Each skin is a partial map of --kr-* tokens.
   Applying a skin = setting these as inline custom properties on the element,
   which override the :host defaults. Nothing else in the widget changes.
   `swatch` (bg, accent) is only used by the preview console to draw chips.
   ========================================================================== */
window.KR_SKINS = {
  /* ---------- neutral skins (the "born neutral" base + variants) ---------- */
  niebla: {
    group: "neutra", label: "Niebla", note: "Fría · de arranque",
    swatch: ["oklch(98.6% 0.003 250)", "oklch(40% 0.022 258)"],
    tokens: {} /* :host defaults already are Niebla */
  },
  arena: {
    group: "neutra", label: "Arena", note: "Cálida · papel",
    swatch: ["oklch(98.4% 0.009 78)", "oklch(42% 0.028 64)"],
    tokens: {
      "--kr-bg": "oklch(98.4% 0.009 78)",
      "--kr-surface": "oklch(99.6% 0.006 80)",
      "--kr-surface-2": "oklch(97% 0.012 78)",
      "--kr-inset": "oklch(95.6% 0.014 76)",
      "--kr-line": "oklch(90% 0.016 72)",
      "--kr-line-2": "oklch(82% 0.02 68)",
      "--kr-ink": "oklch(31% 0.018 60)",
      "--kr-ink-2": "oklch(48% 0.016 60)",
      "--kr-ink-3": "oklch(64% 0.014 62)",
      "--kr-accent": "oklch(42% 0.028 64)",
      "--kr-accent-2": "oklch(35% 0.03 62)",
      "--kr-accent-soft": "oklch(93% 0.022 72)",
      "--kr-accent-line": "oklch(64% 0.026 66)",
      "--kr-focus": "oklch(58% 0.09 70)",
      "--kr-radius": "13px"
    }
  },
  grafito: {
    group: "neutra", label: "Grafito", note: "Puro · alto contraste",
    swatch: ["oklch(99% 0 0)", "oklch(22% 0 0)"],
    tokens: {
      "--kr-bg": "oklch(99% 0 0)",
      "--kr-surface": "oklch(100% 0 0)",
      "--kr-surface-2": "oklch(97% 0 0)",
      "--kr-inset": "oklch(95.5% 0 0)",
      "--kr-line": "oklch(89% 0 0)",
      "--kr-line-2": "oklch(80% 0 0)",
      "--kr-ink": "oklch(20% 0 0)",
      "--kr-ink-2": "oklch(42% 0 0)",
      "--kr-ink-3": "oklch(62% 0 0)",
      "--kr-accent": "oklch(22% 0 0)",
      "--kr-accent-2": "oklch(12% 0 0)",
      "--kr-accent-ink": "oklch(99% 0 0)",
      "--kr-accent-soft": "oklch(94.5% 0 0)",
      "--kr-accent-line": "oklch(55% 0 0)",
      "--kr-focus": "oklch(50% 0 0)",
      "--kr-radius": "6px"
    }
  },

  /* ---------- salon skins (a brand injected over the neutral chassis) ---- */
  lumiere: {
    group: "salon", label: "Lumière", note: "Lujo · latón",
    swatch: ["oklch(98.2% 0.012 88)", "oklch(56% 0.085 78)"],
    tokens: {
      "--kr-bg": "oklch(98.2% 0.012 88)",
      "--kr-surface": "oklch(99.6% 0.008 88)",
      "--kr-surface-2": "oklch(96.6% 0.016 86)",
      "--kr-inset": "oklch(95% 0.02 84)",
      "--kr-line": "oklch(90% 0.022 82)",
      "--kr-line-2": "oklch(80% 0.03 80)",
      "--kr-ink": "oklch(26% 0.012 70)",
      "--kr-ink-2": "oklch(45% 0.014 72)",
      "--kr-ink-3": "oklch(62% 0.018 76)",
      "--kr-accent": "oklch(56% 0.085 78)",
      "--kr-accent-2": "oklch(47% 0.08 74)",
      "--kr-accent-ink": "oklch(99% 0.01 88)",
      "--kr-accent-soft": "oklch(93% 0.035 84)",
      "--kr-accent-line": "oklch(66% 0.075 80)",
      "--kr-focus": "oklch(58% 0.085 78)",
      "--kr-radius": "4px"
    }
  },
  botanica: {
    group: "salon", label: "Botánica", note: "Fresco · verde",
    swatch: ["oklch(98.6% 0.01 150)", "oklch(48% 0.09 156)"],
    tokens: {
      "--kr-bg": "oklch(98.6% 0.01 150)",
      "--kr-surface": "oklch(99.8% 0.006 150)",
      "--kr-surface-2": "oklch(97% 0.016 152)",
      "--kr-inset": "oklch(95.4% 0.02 152)",
      "--kr-line": "oklch(90% 0.022 154)",
      "--kr-line-2": "oklch(81% 0.03 156)",
      "--kr-ink": "oklch(28% 0.025 160)",
      "--kr-ink-2": "oklch(46% 0.022 158)",
      "--kr-ink-3": "oklch(63% 0.02 156)",
      "--kr-accent": "oklch(48% 0.09 156)",
      "--kr-accent-2": "oklch(40% 0.085 158)",
      "--kr-accent-soft": "oklch(93% 0.03 152)",
      "--kr-accent-line": "oklch(62% 0.08 156)",
      "--kr-focus": "oklch(56% 0.1 156)",
      "--kr-radius": "16px"
    }
  },
  aurora: {
    group: "salon", label: "Aurora", note: "Moderno · magenta",
    font: '"Instrument Sans", ui-sans-serif, system-ui, sans-serif',
    swatch: ["oklch(98.7% 0.006 320)", "oklch(56% 0.16 350)"],
    tokens: {
      "--kr-bg": "oklch(98.7% 0.006 320)",
      "--kr-surface": "oklch(100% 0 0)",
      "--kr-surface-2": "oklch(97.4% 0.01 322)",
      "--kr-inset": "oklch(96% 0.014 326)",
      "--kr-line": "oklch(91% 0.016 330)",
      "--kr-line-2": "oklch(82% 0.024 336)",
      "--kr-ink": "oklch(27% 0.03 326)",
      "--kr-ink-2": "oklch(46% 0.026 330)",
      "--kr-ink-3": "oklch(64% 0.022 334)",
      "--kr-accent": "oklch(56% 0.16 350)",
      "--kr-accent-2": "oklch(48% 0.17 352)",
      "--kr-accent-soft": "oklch(94% 0.04 348)",
      "--kr-accent-line": "oklch(66% 0.14 350)",
      "--kr-focus": "oklch(58% 0.16 350)",
      "--kr-radius": "12px",
      "--kr-font": '"Instrument Sans", ui-sans-serif, system-ui, sans-serif'
    }
  },
  oceano: {
    group: "salon", label: "Azul Océano", note: "Celeste · marino",
    swatch: ["oklch(98.4% 0.012 232)", "oklch(55% 0.15 240)"],
    tokens: {
      /* ---- paleta general: celeste pálido ---- */
      "--kr-bg": "oklch(98.4% 0.012 232)",
      "--kr-surface": "oklch(99.7% 0.007 232)",
      "--kr-surface-2": "oklch(97% 0.018 233)",
      "--kr-inset": "oklch(95.2% 0.024 233)",
      "--kr-line": "oklch(90% 0.028 234)",
      "--kr-line-2": "oklch(80.5% 0.042 236)",
      "--kr-ink": "oklch(28% 0.045 250)",
      "--kr-ink-2": "oklch(46% 0.038 248)",
      "--kr-ink-3": "oklch(63% 0.032 244)",
      "--kr-accent": "oklch(50% 0.13 244)",
      "--kr-accent-2": "oklch(42% 0.14 246)",
      "--kr-accent-ink": "oklch(99% 0.015 233)",
      "--kr-accent-soft": "oklch(93% 0.038 234)",
      "--kr-accent-line": "oklch(64% 0.11 240)",
      "--kr-focus": "oklch(58% 0.14 244)",
      "--kr-radius": "12px",

      /* ---- chips de día + CTA primario: celeste medio (gama pálida) ---- */
      "--kr-orange": "oklch(56% 0.13 240)",
      "--kr-orange-2": "oklch(48% 0.14 242)",
      "--kr-orange-ink": "oklch(99% 0.015 233)",
      "--kr-orange-soft": "oklch(95% 0.032 233)",
      "--kr-orange-line": "oklch(72% 0.085 237)",

      /* ---- chips de hora: celeste intenso ---- */
      "--kr-green-soft": "oklch(90% 0.072 233)",
      "--kr-green-soft-2": "oklch(85% 0.095 233)",
      "--kr-green": "oklch(54% 0.155 240)",
      "--kr-green-ink": "oklch(41% 0.115 244)",
      "--kr-green-ink-on": "oklch(99% 0.02 233)",
      "--kr-green-line": "oklch(77% 0.092 236)"
    }
  }
};

/* Apply a skin to a host element by name. Clears previously-set skin tokens
   first so switching is clean (back to :host defaults, then overlay). */
window.KR_applySkin = function (el, name) {
  const skin = window.KR_SKINS[name];
  if (!el || !skin) return;
  // collect every token any skin could set, so we can reset cleanly
  const all = new Set();
  Object.values(window.KR_SKINS).forEach(s => Object.keys(s.tokens).forEach(k => all.add(k)));
  all.forEach(k => el.style.removeProperty(k));
  Object.entries(skin.tokens).forEach(([k, v]) => el.style.setProperty(k, v));
  el.dataset.skin = name;
};

/* ============================================================================
   kr-widget.js — <kami-reserva> Custom Element (Shadow DOM)
   ----------------------------------------------------------------------------
   VERSION: 2.0.16
   FECHA:   5 de julio de 2026

   v2.0.16 — durationMin (duración total) en el payload de reserva, para
             que el backend resuelva 'Cualquiera' comprobando el bloque
             continuo completo.
   v2.0.15 — Variante del servicio PRINCIPAL (M/L/XL) con BASE del catálogo.
   v2.0.14 — Grupo exclusivo + paneles expandibles.
   v2.0.13 — Complementos con VARIANTES y OBLIGATORIOS.
   v2.0.11 — Fix desbordamiento panel promo + sticky de tarjeta lateral.
   v2.0.10 — Descuento promocional visible en resumen + cálculo solo base.
   v2.0.9 — Fix race UI al cambiar de profesional.
   v2.0.8 — Filtro de staff por servicio
   --------------------------------------
   · _proChips ahora aplica clase is-disabled a los profesionales NO
     permitidos para el servicio elegido (no están en _service.idStaff).
     Visible como chip APAGADO (opacity reducida, grayscale, cursor
     not-allowed). El click queda bloqueado.
   · _emitirPedirHuecos incluye idStaffPermitidos en el detail del
     evento para que el backend restrinja candidatos cuando proId='any'.
   · CSS para .kr-pro.is-disabled añadido.
   · Si _service.idStaff llega vacío [] → todos permitidos (fallback
     liberal). Cualquiera siempre permitido (es wildcard).

   v2.0.7 — Carga de fuentes Google vía document.head.
   -----------------------------------------------------
   · Sustituido @import por inyección de <link> en document.head desde
     connectedCallback(). El @import desde Shadow DOM resultaba poco
     fiable en algunos navegadores (no cargaba la fuente). El método
     <link> en document.head SÍ se propaga al Shadow DOM porque las
     @font-face del documento se heredan en shadow trees.
   · Preconnect a fonts.googleapis.com y fonts.gstatic.com para acelerar
     el handshake (mismo patrón que la consola Claude Design original).
   · Idempotente: solo carga una vez aunque haya múltiples instancias
     del custom element en la página (id 'kami-reserva-google-fonts').

   v2.0.6 — Carga de fuentes Google (vía @import, deprecado).
   v2.0.5 — rail con 6 días fijos.
   -------------------------------
   · Reducido el rail de 14 a 6 días. El chip del 7º quedaba siempre
     cortado en distintos viewports y los parches no convencían. Con
     6 días entran limpios y para fechas más lejanas el usuario tiene
     "Ir a una fecha" en la cabecera del Paso 1.

   v2.0.4 — salón cerrado + adiós al fade
   ---------------------------------------
   · Nuevo state "closed" en _renderHours: muestra mensaje "El salón
     no abre este día" cuando el backend devuelve motivo:'cerrado'.
     Sustituye al esqueleto eterno de huecos vacíos los lun/dom.
   · Fade del rail (.kr-rail-fade) ELIMINADO con display:none. El
     gradiente blanco ocultaba el chip del último día en lugar de
     indicar overflow. El scroll horizontal funciona sin necesidad
     de pista visual encima.
   · Requiere backend widgetPublicoLogic >= v0.4.0.

   v2.0.3 — limpieza de copy + card alineado
   ------------------------------------------
   · Frases de cierre de la confirmación: quitada la promesa del
     "email de confirmación" (no existe esa pieza todavía). Solo
     se dice lo que es real.
   · Card lateral "Tu reserva" arranca a la altura de los chips de
     profesional (margin-top 290px en >=820px). Antes flotaba arriba
     dejando la columna derecha con hueco visual.

   v2.0.2 — chip extremo + fade rail
   ----------------------------------
   · padding-right + scroll-padding-right en .kr-rail para que el chip
     del último día (típicamente el 7º) no quede medio cortado al cargar.
   · Fade derecho un poco más ancho (44px) para que el "hay más" se note
     mejor visualmente.

   v2.0.1 — parche scroll del rail de días
   ----------------------------------------
   · CSS: touch-action:pan-x + -webkit-overflow-scrolling:touch en
     .kr-rail para que el slider funcione con el dedo en móvil.
   · CSS: scroll-snap-type x proximity para que en escritorio el
     scroll horizontal pare en los chips, no entre ellos.

   v2.0.0 — CMS-first, multi-service, Wix Custom Element ready
   ------------------------------------------------------------
   · `observedAttributes`: data-config, data-huecos-response,
     data-reserva-response. Comunicación nativa con Wix Velo sin iframe.
   · `data-config` (JSON): { categoria, servicios[], profesionales[],
     salonConfig, memberInfo, hoyISO }. El widget se monta con esto.
   · Cabecera DENTRO del widget: imagen + título + descripción del
     servicio elegido. Cambia al cambiar de servicio (no es estática).
   · NUEVO PASO 0: grid de servicios de la categoría (si hay >1).
     Click en un servicio → cabecera + pasos 1+ se montan. Botón
     '<Volver' regresa al grid.
   · PASO 2 (complementos) se OMITE y los demás se RENUMERAN cuando el
     servicio elegido no tiene complementos. (Resolvía deuda v1.0 #1.)
   · Huecos asíncronos: el widget emite CustomEvent('pedir-huecos')
     y espera respuesta vía data-huecos-response. Sustituye el mock
     determinista de v1.0.
   · Crear reserva: emite CustomEvent('reservar') con todos los datos
     necesarios para crearPackReserva. Espera data-reserva-response y
     muestra confirmación con reservaId real.
   · Pre-rellenado: si llega memberInfo, signedIn=true y se rellenan
     nombre/apellido/email/teléfono desde el miembro Wix logueado.
   · Skin: se aplica desde config.salonConfig.widgetSkin con
     window.KR_applySkin.
   · Compat legacy: si no llega data-config pero se asigna .service
     directamente (consola HTML de previsualización), funciona como v1.0.

   Sigue siendo genérico: todo lo visual viene de --kr-* tokens
   (kr-styles.js) + skin elegida (kr-skins.js). El widget no conoce
   ningún salón concreto.
   ========================================================================== */
(function () {
  "use strict";

  /* ---------- small helpers ------------------------------------------- */
  const DOW = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
  const MON = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  // v2.0.10 — EUR formatea con 2 decimales cuando los haya, y entero
  // cuando el valor es exacto. Antes redondeaba siempre a entero, lo
  // que producía cuentas matemáticamente incoherentes en el resumen
  // cuando hay descuento (ej. `16€ − 2€ = 14€` siendo realmente
  // `16,00€ − 1,60€ = 14,40€`). Ahora la cuenta cuadra siempre.
  const EUR = n => {
    const v = Math.round(Number(n) * 100) / 100;
    return Number.isInteger(v)
      ? `${v}\u00A0€`
      : `${v.toFixed(2).replace('.', ',')}\u00A0€`;
  };
  const pad2 = n => String(n).padStart(2, "0");
  const toHHMM = m => `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
  function durTxt(min) {
    const h = Math.floor(min / 60), m = min % 60;
    if (h && m) return `${h}\u00A0h\u00A0${m}\u00A0min`;
    if (h) return `${h}\u00A0h`;
    return `${m}\u00A0min`;
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const el = (tag, cls, html) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  };
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  /* v2.0.12 — Pago online DESACTIVADO de momento: el salón no tiene
     pasarela conectada. Cuando se conecte el sistema de pago, poner este
     flag a true para volver a mostrar el botón "Pagar online ahora".
     El bloque del botón permanece intacto en _renderActions(). */
  const PAGO_ONLINE_ACTIVO = false;

  const ICON = {
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
    store: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9 4 4h16l1 5"/><path d="M4 9v11h16V9"/><path d="M9 20v-6h6v6"/></svg>',
    calx: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/><path d="m10 14 4 4m0-4-4 4"/></svg>',
    cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M3 10h18M8 2v4M16 2v4"/></svg>',
    alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/></svg>',
    erri: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/></svg>'
  };

  /* ==================================================================== */
  class KamiReserva extends HTMLElement {

    /* ── Wix Velo: el page code asigna data-config con JSON serializado.
          También usa data-huecos-response y data-reserva-response para
          devolver resultados asíncronos. ─────────────────────────────── */
    static get observedAttributes() {
      return ['data-config', 'data-huecos-response', 'data-reserva-response'];
    }

    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      // v2.0 — estado interno
      this._config = null;             // { categoria, servicios, profesionales, salonConfig, memberInfo, hoyISO }
      this._selectedService = null;    // servicio elegido (legacy: this._service apunta a este)
      this._signedIn = false;
      this._demoState = "auto";        // auto | loading | empty | error (modo legacy consola)
      this._computing = false;
      this._ready = false;
      this._pendingHuecosReqId = null;
      this._pendingReservaReqId = null;
      this.state = null;
    }

    /* ---- public API legacy (consola HTML local) ---------------------- */
    // Modo v1.0: la consola HTML local sigue funcionando inyectando
    // `service` directamente. En Wix usamos data-config (modo v2.0).
    set service(cfg) {
      this._selectedService = cfg;
      this._service = cfg; // alias para código heredado
      if (this._ready) this._initState(true);
    }
    get service() { return this._selectedService; }
    set signedIn(v) { this._signedIn = !!v; if (this._ready) this._applyPrefill(); }
    set demoState(s) { this._demoState = s || "auto"; if (this._ready) this._recompute(false); }

    /* ---- Wix attribute change ---------------------------------------- */
    attributeChangedCallback(name, oldVal, newVal) {
      if (oldVal === newVal || !newVal) return;
      try {
        const parsed = JSON.parse(newVal);
        if (name === 'data-config') {
          this._applyConfig(parsed);
        } else if (name === 'data-huecos-response') {
          this._handleHuecosResponse(parsed);
        } else if (name === 'data-reserva-response') {
          this._handleReservaResponse(parsed);
        }
      } catch (e) {
        console.error(`[kami-reserva v2.0] Error parsing ${name}:`, e.message);
      }
    }

    connectedCallback() {
      if (this._ready) return;

      // v2.0.7 — Cargar Bai Jamjuree e Instrument Sans en el documento
      // global. @import desde Shadow DOM es poco fiable; el <link> en
      // document.head sí se aplica al Shadow DOM (las @font-face del
      // documento se heredan en shadow trees). Idempotente: solo carga
      // una vez aunque haya varios kami-reserva en la página.
      try {
        const FONT_ID = 'kami-reserva-google-fonts';
        if (!document.getElementById(FONT_ID)) {
          // Preconnect a Google Fonts para handshake más rápido
          const pre1 = document.createElement('link');
          pre1.rel = 'preconnect';
          pre1.href = 'https://fonts.googleapis.com';
          document.head.appendChild(pre1);

          const pre2 = document.createElement('link');
          pre2.rel = 'preconnect';
          pre2.href = 'https://fonts.gstatic.com';
          pre2.crossOrigin = 'anonymous';
          document.head.appendChild(pre2);

          // Stylesheet con las dos familias (los mismos pesos que la
          // consola Claude Design original: 400, 500, 600, 700).
          const link = document.createElement('link');
          link.id = FONT_ID;
          link.rel = 'stylesheet';
          link.href = 'https://fonts.googleapis.com/css2?family=Bai+Jamjuree:wght@400;500;600;700&family=Instrument+Sans:wght@400;500;600;700&display=swap';
          document.head.appendChild(link);
        }
      } catch (e) {
        // Si por seguridad de Wix no se pudiese tocar document.head,
        // el navegador caería al fallback ui-sans-serif. No bloqueante.
        console.warn('[kami-reserva] Carga de Google Fonts falló:', e.message);
      }

      this.shadowRoot.innerHTML = `<style>${window.KR_STYLES || ''}</style><style>${this._extraStyles()}</style>`;
      this.root = el("div", "kr");
      this.shadowRoot.appendChild(this.root);
      this._ready = true;

      // Si llegó data-config ANTES del connectedCallback (Wix lo asigna
      // inmediatamente al setAttribute), lo aplicamos ahora.
      const cfgRaw = this.getAttribute('data-config');
      if (cfgRaw) {
        try {
          const cfg = JSON.parse(cfgRaw);
          this._applyConfig(cfg);
          return;
        } catch (e) { console.error('[kami-reserva v2.0] data-config inválido:', e.message); }
      }

      // Compat legacy: si la consola HTML inyectó .service, montar como v1.0
      if (this._selectedService) {
        this._service = this._selectedService;
        this._initState(true);
        return;
      }

      // Sin configuración aún: pantalla de espera
      this._renderEmpty('Cargando…');
    }

    /* ── Aplicar config completo (modo v2.0 Wix) ─────────────────────── */
    _applyConfig(config) {
      this._config = config || {};

      // 1) Skin: aplicar tokens desde salonConfig.widgetSkin
      const skinName = config?.salonConfig?.widgetSkin;
      if (skinName && typeof window.KR_applySkin === 'function') {
        try { window.KR_applySkin(this, skinName); } catch (e) { /* skin no encontrado, sigue con niebla por defecto */ }
      }

      // 2) Miembro logueado
      this._signedIn = !!config?.memberInfo;

      // 3) Hoy explícito (Madrid) si lo pasa el page code
      if (config?.hoyISO) this._hoyISO = config.hoyISO;

      const servicios = Array.isArray(config?.servicios) ? config.servicios : [];

      if (servicios.length === 0) {
        this._renderEmpty('No hay servicios disponibles en esta categoría.');
        return;
      }

      if (servicios.length === 1) {
        // Solo un servicio: ir directo al formulario
        this._selectService(servicios[0], false);
        return;
      }

      // Varios servicios: grid de selección
      this._selectedService = null;
      this._service = null;
      this.state = null;
      this._renderServiceGrid();
    }

    /* ── Mostrar pantalla vacía / mensaje ────────────────────────────── */
    _renderEmpty(msg) {
      if (!this.root) return;
      this.root.innerHTML = '';
      const wrap = el('div', 'kr-empty');
      wrap.innerHTML = `<div class="kr-empty__msg">${msg || ''}</div>`;
      this.root.appendChild(wrap);
    }

    /* ── CSS extra para componentes nuevos de v2.0 ───────────────────── */
    // Mantengo CSS de v1.0 intacto y añado solo las nuevas piezas.
    // Usa las mismas variables --kr-* para coherencia con la piel activa.
    _extraStyles() {
      return `
        .kr-empty { padding: 60px 24px; text-align: center; color: var(--kr-ink-2); }
        .kr-empty__msg { font-size: 14px; }

        /* ─── Cabecera interna del servicio elegido ─── */
        .kr-svc-header {
          display: flex; gap: 18px; align-items: flex-start;
          padding: 22px 24px; margin: 0 0 18px;
          background: var(--kr-surface); border: 1px solid var(--kr-line);
          border-radius: calc(var(--kr-radius, 12px) + 4px);
          position: relative;
        }
        .kr-svc-header__back {
          position: absolute; top: 14px; right: 16px;
          background: transparent; border: 0; cursor: pointer;
          font-family: inherit; font-size: 12px; color: var(--kr-ink-2);
          padding: 4px 8px; border-radius: 6px;
        }
        .kr-svc-header__back:hover { background: var(--kr-inset); color: var(--kr-ink); }
        .kr-svc-header__img {
          width: 96px; height: 96px; border-radius: var(--kr-radius, 12px);
          object-fit: cover; flex: none;
          border: 1px solid var(--kr-line);
        }
        .kr-svc-header__body { flex: 1; min-width: 0; }
        .kr-svc-header__fam {
          display: block; font-size: 10.5px; letter-spacing: .14em;
          text-transform: uppercase; color: var(--kr-accent);
          font-weight: 700; margin-bottom: 4px;
        }
        .kr-svc-header__name {
          margin: 0 0 6px; font-size: 22px; line-height: 1.15;
          color: var(--kr-ink); font-weight: 600; letter-spacing: -.01em;
        }
        .kr-svc-header__desc {
          margin: 0 0 8px; font-size: 13px; line-height: 1.45;
          color: var(--kr-ink-2);
        }
        .kr-svc-header__meta {
          display: flex; gap: 10px; align-items: center; flex-wrap: wrap;
          font-size: 13px; color: var(--kr-ink-2);
        }
        .kr-svc-header__price { font-weight: 700; color: var(--kr-ink); font-size: 15px; }
        .kr-svc-header__price--tbd { color: var(--kr-ink-2); font-weight: 600; }
        .kr-svc-header__promo {
          background: var(--kr-accent-soft); color: var(--kr-accent-2);
          padding: 2px 8px; border-radius: 6px; font-size: 11px; font-weight: 600;
        }
        .kr-svc-header__dot {
          width: 3px; height: 3px; border-radius: 50%; background: var(--kr-line-2);
        }

        /* ─── Grid de servicios (PASO 0) ─── */
        .kr-cat-head {
          padding: 22px 24px 18px; margin-bottom: 16px;
        }
        .kr-cat-head__title {
          margin: 0 0 4px; font-size: 22px; line-height: 1.15;
          color: var(--kr-ink); font-weight: 600;
        }
        .kr-cat-head__sub {
          margin: 0 0 6px; font-size: 13px; color: var(--kr-ink-2);
        }
        .kr-cat-head__desc {
          margin: 0; font-size: 13px; color: var(--kr-ink-3); line-height: 1.5;
        }
        .kr-svc-grid {
          display: grid; gap: 14px;
          grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
          padding: 0 24px 24px;
        }
        .kr-svc-card {
          display: flex; flex-direction: column; gap: 0;
          background: var(--kr-surface); border: 1px solid var(--kr-line);
          border-radius: var(--kr-radius, 12px);
          cursor: pointer; overflow: hidden; text-align: left;
          font-family: inherit; color: var(--kr-ink);
          transition: border-color .15s ease, transform .15s ease;
          padding: 0;
        }
        .kr-svc-card:hover {
          border-color: var(--kr-accent-line);
          transform: translateY(-2px);
        }
        .kr-svc-card__img {
          width: 100%; aspect-ratio: 4/3; object-fit: cover;
          display: block;
        }
        .kr-svc-card__body { padding: 12px 14px 14px; }
        .kr-svc-card__name {
          margin: 0 0 4px; font-size: 15px; line-height: 1.2;
          color: var(--kr-ink); font-weight: 600;
        }
        .kr-svc-card__desc {
          margin: 0 0 8px; font-size: 12px; color: var(--kr-ink-3);
          line-height: 1.4;
          display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .kr-svc-card__meta {
          display: flex; gap: 6px; align-items: baseline; font-size: 12px;
          color: var(--kr-ink-2);
        }
        .kr-svc-card__price { font-weight: 700; color: var(--kr-ink); font-size: 14px; }
        .kr-svc-card__price--tbd { color: var(--kr-ink-2); font-weight: 600; font-size: 13px; }

        /* ─── Estado "enviando reserva" + error reserva ─── */
        .kr-submitting { opacity: .55; pointer-events: none; }

        /* ─── v2.0.1 — Rail de días: scroll horizontal en táctil ─── */
        /* Reportado: en móvil no se podía deslizar; en escritorio el día
           7 quedaba cortado sin posibilidad visible de scroll. */
        /* v2.0.2 — Padding extra a la derecha del rail para que el chip
           del extremo nunca quede medio tapado al cargar. */
        .kr-rail {
          -webkit-overflow-scrolling: touch;
          touch-action: pan-x;
          scroll-snap-type: x proximity;
          scroll-padding-left: 8px;
          scroll-padding-right: 24px;
          padding-right: 24px !important;
        }
        .kr-rail > * { scroll-snap-align: start; }
        /* v2.0.4 — Fuera el fade del rail definitivamente.
           El gradiente blanco ocultaba visualmente el chip extremo en
           lugar de indicar overflow. El scroll horizontal con dedo o
           trackpad ya funciona; no necesitamos pista visual encima. */
        .kr-rail-fade { display: none !important; }

        /* v2.0.8 — Chips de profesional APAGADOS cuando no pueden hacer
           el servicio elegido (no están en ServiceCatalog.idStaff). */
        .kr-pro.is-disabled {
          opacity: .38;
          cursor: not-allowed;
          filter: grayscale(0.6);
        }
        .kr-pro.is-disabled:hover { background: transparent; }

        /* v2.0.3 — Card "Tu reserva" arranca alineado con chips de
           profesional. Solo aplica cuando el rail lateral está activo.
           v2.0.11 — margin-top reducido de 290px a 90px porque era tan
           grande que escondía la tarjeta al cargar en pantallas no muy
           altas y, sumado al sticky, la tarjeta no se "agarraba"
           correctamente al hacer scroll.  Además se REFUERZA el sticky
           directamente sobre el card del resumen (no solo en el
           contenedor .kr-rail-side) con align-self start explícito
           para que el grid de la shell no estire el item y rompa el
           sticky en algunos motores. */
        @container (min-width: 820px) {
          .kr-rail-side {
            align-self: start;
            position: sticky;
            top: 16px;
          }
          .kr-summary--rail {
            margin-top: 90px !important;
            position: sticky;
            top: 16px;
            align-self: start;
            max-height: calc(100vh - 32px);
            overflow-y: auto;
          }
        }

        .kr-reserror {
          margin-top: 12px; padding: 10px 14px;
          background: oklch(94% 0.04 30); border: 1px solid oklch(78% 0.1 28);
          color: oklch(35% 0.08 28); border-radius: 8px; font-size: 13px;
        }

        /* v2.0.10 — Panel destacado de descuento promocional en el resumen.
           Reutiliza tokens del skin activo (--kr-accent-soft, --kr-accent-line,
           --kr-accent-2, --kr-radius) para que cada salón lo vea con su
           paleta (Niebla, Lumière, Aurora, Botánica, Océano). Multi-tenant:
           sin colores hardcoded.
           v2.0.11 — fix desbordamiento: cuando precio + key larga ("Precio
           final a pagar en salón") + número con decimales (203,55 €) se
           solapan en columnas estrechas (rail 314px), el valor se salía
           del panel. Ahora la key puede wrappear y el valor queda compacto
           pegado a la derecha sin partir el "€" del importe. */
        .kr-summary__promo {
          margin: 12px 20px 14px;
          padding: 12px 14px;
          background: var(--kr-accent-soft);
          border: 1px solid var(--kr-accent-line);
          border-radius: var(--kr-radius);
        }
        .kr-summary__promo-title {
          font-size: 12.5px;
          font-weight: var(--kr-w-semi);
          color: var(--kr-accent-2);
          line-height: 1.35;
          margin-bottom: 8px;
        }
        .kr-summary__promo-rows .kr-prow {
          padding: 6px 0;
          border-bottom: 1px solid color-mix(in oklch, var(--kr-accent-line) 40%, transparent);
          align-items: flex-start;
          gap: 10px;
        }
        .kr-summary__promo-rows .kr-prow__k {
          flex: 1 1 auto;
          min-width: 0;
          white-space: normal;
          word-break: break-word;
          line-height: 1.3;
        }
        .kr-summary__promo-rows .kr-prow__v {
          flex: 0 0 auto;
          white-space: nowrap;
          text-align: right;
        }
        .kr-summary__promo-rows .kr-prow:last-of-type {
          border-bottom: 0;
          padding-top: 8px;
        }
        .kr-summary__promo-rows .kr-prow:last-of-type .kr-prow__k {
          font-weight: var(--kr-w-semi);
          color: var(--kr-ink);
        }
        .kr-summary__promo-rows .kr-prow:last-of-type .kr-prow__v {
          font-weight: var(--kr-w-bold);
          color: var(--kr-ink);
        }
      `;
    }

    /* ---- state init -------------------------------------------------- */
    _initState() {
      const cfg = this._selectedService || this._service;
      if (!cfg) return;
      this._service = cfg; // alias requerido por código heredado

      this.days = this._buildDays();
      const firstFree = this.days.find(d => !d.full) || this.days[0];
      const comp = {};
      (cfg.complements || []).forEach(c => {
        comp[c.id] = c.type === "bool" ? false : (c.default || c.options[0].id);
      });
      this.state = {
        dayId: firstFree.id,
        proMain: "any",
        comp,
        sameExtra: true,
        proExtra: "any",
        hour: null,
        nota: "",
        guardarNota: false,
        errors: {},
        confirmed: null,
        // v2.0 — flujo asíncrono de huecos
        loadingHuecos: false,
        availableHuecos: null,   // null = no se ha pedido; array = recibido
        huecosError: false,
        // v2.0 — estado de envío de reserva
        submitting: false,
        submitError: '',
        // v2.0.12 — consentimientos legales (marcados por defecto)
        aceptaPrivacidad: true,
        aceptaTerminos: true,
        // v2.0.15 — variante del servicio PRINCIPAL.
        //   -1 = BASE (svc.basePrice + svc.baseDuration del catálogo).
        //        Es lo que actúa como "M" en Corte Mujer M/L/XL. Al
        //        enviar la reserva NO se manda varianteSel — el motor
        //        crearReservaPublica v0.7.7 delega en crearPackReserva
        //        con precio/duración base como siempre.
        //    0..N = índice en svc.variantes[]. Se envía varianteSel
        //           {idx, label, price, duration} al motor; se aplica
        //           al precio/duración de la reserva.
        //   Servicios sin variantes ignoran este campo (no se pinta el
        //   selector). Paridad con Lite Mobile v0.5.0 y Recepción PRO
        //   Desktop v1.1.43.
        variantIdx: -1
      };
      this._build();
      this._applyPrefill();
      this._recompute(true);
    }

    /* =================================================================
       v2.0 — GRID DE SERVICIOS (Paso 0) y SELECCIÓN
       ================================================================= */

    // Render del grid cuando hay >1 servicio en la categoría.
    // Cabecera de categoría + tarjetas clicables.
    _renderServiceGrid() {
      if (!this.root) return;
      this.root.innerHTML = '';
      const cat = this._config?.categoria || {};
      const servicios = this._config?.servicios || [];

      // Cabecera de la categoría
      const head = el('div', 'kr-cat-head');
      if (cat.title) head.appendChild(el('h1', 'kr-cat-head__title', cat.title));
      if (cat.subtitle) head.appendChild(el('p', 'kr-cat-head__sub', cat.subtitle));
      if (cat.description) head.appendChild(el('p', 'kr-cat-head__desc', cat.description));
      this.root.appendChild(head);

      // Grid de tarjetas
      const grid = el('div', 'kr-svc-grid');
      servicios.forEach(svc => {
        const card = el('button', 'kr-svc-card');
        card.type = 'button';
        if (svc.image) {
          const img = el('img', 'kr-svc-card__img');
          img.src = svc.image; img.alt = svc.name || ''; img.loading = 'lazy';
          card.appendChild(img);
        }
        const body = el('div', 'kr-svc-card__body');
        body.appendChild(el('h3', 'kr-svc-card__name', svc.name || ''));
        if (svc.description) body.appendChild(el('p', 'kr-svc-card__desc', svc.description));
        const meta = el('div', 'kr-svc-card__meta');
        if (svc.basePrice != null) {
          meta.innerHTML =
            `<span class="kr-svc-card__price">desde ${EUR(svc.basePrice)}</span> ` +
            `<span>· ${durTxt(svc.baseDuration)}</span>`;
        } else {
          meta.innerHTML =
            `<span class="kr-svc-card__price kr-svc-card__price--tbd">A valorar</span> ` +
            `<span>· ${durTxt(svc.baseDuration)}</span>`;
        }
        body.appendChild(meta);
        card.appendChild(body);
        card.addEventListener('click', () => this._selectService(svc, true));
        grid.appendChild(card);
      });
      this.root.appendChild(grid);
    }

    // Pasa de un registro del backend al shape esperado por el widget.
    // El backend devuelve un objeto cercano pero le falta `pros` (que el
    // widget toma del catálogo de profesionales del config).
    _adaptBackendService(svcBackend) {
      if (!svcBackend) return null;
      const pros = (this._config?.profesionales || []).map(p => ({
        id: p.id, name: p.name, initials: p.initials || '··', any: !!p.any
      }));
      return {
        ...svcBackend,
        pros
      };
    }

    // Selecciona un servicio del grid y monta el formulario completo.
    _selectService(svcBackend, scrollTop) {
      this._selectedService = this._adaptBackendService(svcBackend);
      this._service = this._selectedService;
      this._initState();
      if (scrollTop && this.root && this.root.scrollIntoView) {
        try { this.root.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {}
      }
    }

    // Vuelve al grid desde el formulario. Solo aplicable si hay >1 servicio.
    _backToGrid() {
      this._selectedService = null;
      this._service = null;
      this.state = null;
      this._renderServiceGrid();
    }

    /* =================================================================
       v2.0 — HUECOS ASÍNCRONOS
       ================================================================= */

    // Genera un requestId único para correlacionar petición/respuesta.
    _newReqId() {
      return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    }

    // Emite el evento custom 'pedir-huecos' hacia el page code de Wix.
    // El page code llamará a getHuecosDisponibles y devolverá la respuesta
    // vía setAttribute('data-huecos-response', JSON).
    _emitirPedirHuecos() {
      if (!this.state || !this._selectedService) return;
      const day = this._dayById(this.state.dayId);
      if (!day) return;
      const calc = this._calc();
      const reqId = this._newReqId();
      this._pendingHuecosReqId = reqId;
      this.state.loadingHuecos = true;
      this.state.huecosError = false;

      this.dispatchEvent(new CustomEvent('pedir-huecos', {
        bubbles: true, composed: true,
        detail: {
          requestId: reqId,
          fecha: day.id,
          proId: this.state.proMain,
          durationMin: calc.duration,
          // v2.0.17 — Segundo profesional para los complementos. Cuando va
          // informado, el backend (widgetPublicoLogic v0.9.0) parte la cita
          // en dos tramos y valida cada uno contra su profesional. Vacío →
          // motor mono-profesional, idéntico a v2.0.16.
          // `principalSetupUid` es necesario para que el backend calcule el
          // punto de corte a partir del mapeoFases del servicio.
          proExtraId: this._proExtraEnvio(),
          principalSetupUid: (this._service && this._service.setupUid) || "",
          // v2.0.8 — Restringe candidatos cuando proId='any' a los
          // profesionales permitidos para este servicio (idStaff).
          idStaffPermitidos: Array.isArray(this._service.idStaff) ? this._service.idStaff : []
        }
      }));
    }

    _handleHuecosResponse(res) {
      if (!this.state) return;
      // Ignorar respuestas obsoletas (otra petición posterior pendiente)
      if (res && res.requestId && res.requestId !== this._pendingHuecosReqId) return;

      this.state.loadingHuecos = false;
      // v2.0.4 — Estado "cerrado": el salón no abre ese día.
      // El backend lo señaliza con motivo:'cerrado' (huecos:[]).
      this.state.salonCerrado = res && res.ok && res.motivo === 'cerrado';
      if (res && res.ok && Array.isArray(res.huecos)) {
        this.state.availableHuecos = res.huecos.slice();
        this.state.huecosError = false;
      } else {
        this.state.availableHuecos = [];
        this.state.huecosError = !res?.ok;
      }
      // Si la hora elegida ya no está disponible, la deseleccionamos
      if (this.state.hour && !this.state.availableHuecos.includes(this.state.hour)) {
        this.state.hour = null;
      }
      const calc = this._calc();
      const eff = this.state.huecosError ? 'error'
                : this.state.salonCerrado ? 'closed'
                : (this.state.availableHuecos.length ? 'ok' : 'empty');
      this._renderHoursHead(calc, eff === 'ok' ? this.state.availableHuecos.length : 0);
      this._renderHours(eff, this.state.availableHuecos, calc);
      this._renderActions();
      this._renderSummary();
    }

    /* =================================================================
       v2.0 — CREAR RESERVA (evento + respuesta async)
       ================================================================= */

    _emitirReservar(payload) {
      const reqId = this._newReqId();
      this._pendingReservaReqId = reqId;
      this.state.submitting = true;
      this.state.submitError = '';
      this._renderActions();

      this.dispatchEvent(new CustomEvent('reservar', {
        bubbles: true, composed: true,
        detail: Object.assign({ requestId: reqId }, payload)
      }));
    }

    _handleReservaResponse(res) {
      if (!this.state) return;
      if (res && res.requestId && res.requestId !== this._pendingReservaReqId) return;

      this.state.submitting = false;
      if (res && res.ok) {
        // Confirmación real con reservaId del backend
        this.state.confirmed = {
          method: res.method || 'salon',
          data: this._lastContactData || {},
          calc: this._calc(),
          reservaId: res.reservaId || null,
          precioTotal: res.precioTotal || null
        };
        this._renderConfirm();
      } else {
        this.state.submitError = (res && res.error) || 'No se ha podido completar la reserva.';
        this._renderActions();
      }
    }


    /* ---- days -------------------------------------------------------- */
    _buildDays(start) {
      // v2.0: usar la fecha real de hoy desde _config.hoyISO (Madrid) si está.
      // Fallback: fecha local del navegador.
      let today;
      const hoyISO = this._config?.hoyISO || this._hoyISO;
      if (hoyISO && /^\d{4}-\d{2}-\d{2}$/.test(hoyISO)) {
        const [y, m, d] = hoyISO.split('-').map(Number);
        today = new Date(y, m - 1, d);
      } else {
        today = new Date();
      }
      today.setHours(0, 0, 0, 0);
      const from = start ? new Date(start) : new Date(today);
      from.setHours(0, 0, 0, 0);
      const out = [];
      // v2.0.5 — 6 días en el rail (antes 14). Para fechas más lejanas el
      // usuario usa "Ir a una fecha" en la cabecera del Paso 1.
      for (let i = 0; i < 6; i++) {
        const d = new Date(from); d.setDate(from.getDate() + i);
        // Sin info real de disponibilidad por día aún → no marcamos full.
        // Los huecos vendrán al pedirlos para el día seleccionado.
        const full = false;
        const diff = Math.round((d - today) / 86400000);
        out.push({
          id: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`,
          date: d, i, full,
          dow: DOW[d.getDay()], num: d.getDate(), mon: MON[d.getMonth()],
          tag: diff === 0 ? "hoy" : diff === 1 ? "mañana" : ""
        });
      }
      return out;
    }
    _isoToday() {
      const h = this._config?.hoyISO || this._hoyISO;
      if (h && /^\d{4}-\d{2}-\d{2}$/.test(h)) return h;
      const d = new Date();
      return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
    }
    _jumpToDate(iso) {
      if (!iso) return;
      const [y, m, d] = iso.split("-").map(Number);
      const picked = new Date(y, m - 1, d);
      this.days = this._buildDays(picked);
      const target = this.days.find(x => x.id === iso);
      if (target && !target.full) this.state.dayId = iso;
      else { const ff = this.days.find(x => !x.full) || this.days[0]; this.state.dayId = ff.id; }
      this.state.hour = null;
      if (this.dateLab) this.dateLab.textContent = `${picked.getDate()} ${MON[picked.getMonth()]}`;
      this._renderDays(); this._recompute(true); this._renderActions(); this._renderSummary();
      requestAnimationFrame(() => this._updateFades());
    }
    _dayById(id) { return this.days.find(d => d.id === id); }

    /* ---- pricing / duration ------------------------------------------ */
    _calc() {
      const cfg = this._service;
      let price = 0, dur = cfg.baseDuration;
      let tbd = (cfg.basePrice == null);
      if (cfg.basePrice != null) price += cfg.basePrice;

      // v2.0.15 — VARIANTE del principal (Corte Mujer M/L/XL). Si el
      // cliente eligió una variante ≠ base, se sustituye el precio y la
      // duración base por los de la variante elegida (no se suma, se
      // reemplaza). Coherente con crearPackReserva v1.0.25 del motor,
      // que aplica varianteSel sobre la copia del principal.
      // Si el cliente eligió BASE (variantIdx === -1) o el servicio no
      // tiene variantes, se conserva price/dur = base (comportamiento
      // v2.0.14 idéntico).
      if (cfg.hasVariants && Array.isArray(cfg.variantes) && this.state && Number.isInteger(this.state.variantIdx) && this.state.variantIdx >= 0 && this.state.variantIdx < cfg.variantes.length) {
        const v = cfg.variantes[this.state.variantIdx];
        if (v && typeof v === 'object') {
          const vPriceRaw = (v.precio != null ? v.precio : v.price);
          const vDurRaw = (v.duracion != null ? v.duracion : v.duration);
          const vPrice = (vPriceRaw != null) ? Number(vPriceRaw) : NaN;
          const vDur = (vDurRaw != null) ? Number(vDurRaw) : NaN;
          if (!isNaN(vPrice)) {
            price = vPrice;                 // sustituye base
            tbd = false;
          }
          if (!isNaN(vDur) && vDur > 0) {
            dur = vDur;                     // sustituye base
          }
        }
      }

      cfg.complements && cfg.complements.forEach(c => {
        const v = this.state.comp[c.id];
        if (c.type === "bool") {
          if (v) { if (c.price == null) tbd = true; else price += c.price; dur += c.duration; }
        } else {
          const o = c.options.find(o => o.id === v) || c.options[0];
          if (o.price == null) tbd = true; else price += o.price;
          dur += o.duration;
        }
      });
      // v2.0.10 — El descuento promocional se aplica SOLO al precio base
      // del servicio principal, NO a los complementos. Paridad estricta
      // con Recepción Pro V2 (recepcionProLogic v1.0.19): el campo
      // ServiceCatalog.descuentoPromo pertenece al servicio principal,
      // los complementos se cobran como ítems independientes a precio
      // completo en el salón. `subtotal` sigue siendo la suma total sin
      // descontar nada (para que el render del tachado refleje el precio
      // "público"); `saved` es el ahorro real (solo sobre base).
      const promo = (tbd || !cfg.promoPct) ? 0 : cfg.promoPct;
      const promoBase = (promo && cfg.basePrice != null) ? cfg.basePrice : 0;
      const saved = promo ? Math.round(promoBase * (promo / 100) * 100) / 100 : 0;
      const total = Math.round((price - saved) * 100) / 100;
      return { subtotal: price, total, saved, promo, duration: dur, tbd };
    }

    _slotsFor(day, duration) {
      const rnd = mulberry32(day.num * 101 + day.i * 13 + Math.round(duration / 15) * 7);
      const out = [];
      for (let t = 9 * 60; t <= 19 * 60; t += 30) {
        let keep = rnd() > 0.42;
        if (duration > 165 && rnd() > 0.45) keep = false;
        if (t + duration > 20 * 60 + 30) keep = false; // finish by 20:30
        if (keep) out.push(t);
      }
      return out.map(toHHMM);
    }

    /* ================= BUILD STATIC SKELETON ========================== */
    _build() {
      const cfg = this._service;
      this.root.innerHTML = "";

      // v2.0 — Cabecera DENTRO del widget con info del servicio elegido
      this._buildHeader();

      this.body = el("div", "kr-body");
      this.confirmHost = el("div"); this.confirmHost.hidden = true;
      this.root.append(this.body, this.confirmHost);

      const shell = el("div", "kr-shell");
      this.flow = el("div", "kr-flow");
      this.railSide = el("div", "kr-rail-side");
      shell.append(this.flow, this.railSide);
      this.body.appendChild(shell);

      // v2.0 — Numeración dinámica de pasos según si hay o no complementos
      // v2.0.15 — También se cuenta el Paso 2 si el servicio tiene
      // variantes del principal (Corte Mujer M/L/XL) aunque no tenga
      // complementos: el bloque "Variante" se pinta ahí también.
      const hasComps = !!(cfg.complements && cfg.complements.length);
      const hasPrincipalVariants = !!(cfg.hasVariants && Array.isArray(cfg.variantes) && cfg.variantes.length);
      const hasPaso2 = hasComps || hasPrincipalVariants;
      const lblP1 = "Paso 1";
      const lblP2 = hasPaso2 ? "Paso 2" : null;
      const lblPHora = hasPaso2 ? "Paso 3" : "Paso 2";
      const lblPDatos = hasPaso2 ? "Paso 4" : "Paso 3";

      /* ---- Paso 1 · Día y profesional ---- */
      const aSec = this._section(lblP1, "¿Cuándo y con quién?",
        "Elige el día y la profesional para tu cita.", "dia-profesional");
      const dayField = el("div", "kr-field");
      const dayHead = el("div", "kr-dayhead");
      dayHead.appendChild(el("label", "kr-label", "¿Qué día?"));
      const jump = el("div", "kr-datejump", ICON.cal);
      this.dateLab = el("span", "kr-datejump__lab", "Ir a una fecha");
      this.dateInput = document.createElement("input");
      this.dateInput.type = "date";
      this.dateInput.className = "kr-datejump__input";
      this.dateInput.min = this._isoToday();
      this.dateInput.setAttribute("aria-label", "Saltar a una fecha");
      this.dateInput.addEventListener("change", () => this._jumpToDate(this.dateInput.value));
      jump.append(this.dateLab, this.dateInput);
      dayHead.appendChild(jump);
      dayField.appendChild(dayHead);
      const railWrap = el("div", "kr-rail-wrap");
      this.fadeL = el("div", "kr-rail-fade l off");
      this.fadeR = el("div", "kr-rail-fade r");
      this.rail = el("div", "kr-rail");
      railWrap.append(this.fadeL, this.rail, this.fadeR);
      this.rail.addEventListener("scroll", () => this._updateFades());
      dayField.appendChild(railWrap);

      const proField = el("div", "kr-field");
      proField.appendChild(el("label", "kr-label",
        'Profesional <small>· para el servicio principal</small>'));
      this.proMainBox = el("div", "kr-pros");
      proField.appendChild(this.proMainBox);

      aSec.append(dayField, proField);
      this.flow.appendChild(aSec);

      /* ---- Paso 2 · Personaliza (variante del principal y/o complementos) ---- */
      // v2.0.15: sección visible si hay variante del principal O
      // complementos. Antes solo si había complementos → los servicios
      // simple_variantes sin complementos no llegaban a mostrar el
      // selector de variante.
      if (hasPaso2) {
        this.compsSec = this._section(lblP2, "Personaliza tu servicio",
          "Añade lo que necesites: el precio y la duración se recalculan al momento.", "complementos");
        this.compsBox = el("div", "kr-field");
        this.compsBox.style.gap = "26px";
        this.compsSec.appendChild(this.compsBox);
        this.proExtraField = el("div", "kr-field");
        this.compsSec.appendChild(this.proExtraField);
        this.flow.appendChild(this.compsSec);
      } else {
        this.compsSec = null;
        this.compsBox = null;
        this.proExtraField = null;
      }

      /* ---- Paso (hora) ---- */
      const cSec = this._section(lblPHora, "Elige tu hora",
        "Huecos reales para la configuración de arriba.", "horas");
      this.hoursHead = el("div", "kr-hours-head");
      this.hoursRegion = el("div");
      cSec.append(this.hoursHead, this.hoursRegion);
      this.flow.appendChild(cSec);

      /* ---- Resumen · espejo pasivo: inline en el flujo (móvil) + rail (escritorio).
             Ambos reciben el mismo HTML; las container queries deciden cuál se ve. ---- */
      this.summaryInline = el("div", "kr-summary kr-summary--inline");
      this.flow.appendChild(this.summaryInline);
      this.summaryRail = el("div", "kr-summary kr-summary--rail");
      this.railSide.appendChild(this.summaryRail);

      /* ---- Paso (datos cliente) - bloqueado hasta elegir hora ---- */
      this.datosSec = this._section(lblPDatos, "Tus datos",
        "Para enviarte la confirmación y los avisos de la cita.", "datos");
      this.lockNote = el("div", "kr-locknote", `${ICON.lock}<span>Elige una hora para completar tus datos</span>`);
      this.datosSec.appendChild(this.lockNote);
      this.prefillBox = el("div");
      this.datosSec.appendChild(this.prefillBox);
      this.datosSec.appendChild(this._buildInputs());
      this.flow.appendChild(this.datosSec);

      /* ---- Acción ---- */
      this.actionSec = this._section("", "", "", "reservar");
      this.actionSec.querySelector(".kr-sec__head").remove();
      this.actionsBox = el("div");
      this.actionSec.appendChild(this.actionsBox);
      this.flow.appendChild(this.actionSec);

      /* fill dynamic */
      this._applyServiceShape();
      this._renderDays();
      this._renderProMain();
      // v2.0.15 — Si hay variante del principal (aunque no haya complementos)
      // también hay que renderizar el bloque, que ahora vive dentro del
      // Paso 2 antes de los complementos.
      if (hasComps || hasPrincipalVariants) {
        this._renderComplements();
        if (hasComps) this._renderProExtra();
      }
      this._renderActions();
      this._renderSummary();
      requestAnimationFrame(() => this._updateFades());
    }

    // v2.0 — Cabecera dinámica del servicio elegido
    _buildHeader() {
      const cfg = this._service;
      const cat = this._config?.categoria || {};
      const head = el('div', 'kr-svc-header');

      // <Volver solo si hay >1 servicio en la categoría
      const totalServicios = (this._config?.servicios || []).length;
      if (totalServicios > 1) {
        const back = el('button', 'kr-svc-header__back');
        back.type = 'button';
        back.textContent = '‹ Volver';
        back.addEventListener('click', () => this._backToGrid());
        head.appendChild(back);
      }

      if (cfg.image) {
        const img = el('img', 'kr-svc-header__img');
        img.src = cfg.image; img.alt = cfg.name || ''; img.loading = 'lazy';
        head.appendChild(img);
      }
      const body = el('div', 'kr-svc-header__body');
      if (cat.title) {
        const fam = el('span', 'kr-svc-header__fam');
        fam.textContent = cat.title;
        body.appendChild(fam);
      }
      if (cfg.name) {
        const nm = el('h1', 'kr-svc-header__name');
        nm.textContent = cfg.name;
        body.appendChild(nm);
      }
      if (cfg.description) {
        const desc = el('p', 'kr-svc-header__desc');
        desc.textContent = cfg.description;
        body.appendChild(desc);
      }
      // Línea de metadatos (precio + duración + promo)
      const meta = el('div', 'kr-svc-header__meta');
      if (cfg.basePrice != null) {
        const price = el('span', 'kr-svc-header__price'); price.textContent = `desde ${EUR(cfg.basePrice).replace(/\u00A0/g,' ')}`;
        meta.appendChild(price);
        if (cfg.promoPct) {
          const promo = el('span', 'kr-svc-header__promo');
          // v2.0.10 — sustituido `−X% lanzamiento` por `−X%` a secas.
          // El panel destacado del resumen ya explica que es un descuento
          // promocional; aquí el badge queda compacto.
          promo.textContent = `−${cfg.promoPct}%`;
          meta.appendChild(promo);
        }
      } else {
        const price = el('span', 'kr-svc-header__price kr-svc-header__price--tbd');
        price.textContent = 'Precio a valorar';
        meta.appendChild(price);
      }
      meta.appendChild(el('span', 'kr-svc-header__dot'));
      const dur = el('span', 'kr-svc-header__dur'); dur.textContent = `≈ ${durTxt(cfg.baseDuration).replace(/\u00A0/g,' ')}`;
      meta.appendChild(dur);
      body.appendChild(meta);
      head.appendChild(body);
      this.root.appendChild(head);
    }

    _section(eyebrow, title, hint, label) {
      const s = el("section", "kr-sec");
      s.setAttribute("data-screen-label", label);
      const head = el("div", "kr-sec__head");
      if (eyebrow) head.appendChild(el("div", "kr-eyebrow", eyebrow));
      if (title) head.appendChild(el("h3", "kr-sec__title", title));
      if (hint) head.appendChild(el("p", "kr-sec__hint", hint));
      s.appendChild(head);
      return s;
    }

    /* ---- day rail ---- */
    _renderDays() {
      this.rail.innerHTML = "";
      let lastMon = null;
      this.days.forEach(d => {
        if (d.mon !== lastMon) {
          this.rail.appendChild(el("div", "kr-monsep", d.mon));
          lastMon = d.mon;
        }
        const b = el("button", "kr-day" + (d.id === this.state.dayId ? " is-sel" : "") + (d.full ? " is-full" : ""));
        b.type = "button";
        b.innerHTML = `<span class="kr-day__dow">${d.dow}</span>
          <span class="kr-day__num">${d.num}</span>
          <span class="kr-day__tag">${d.full ? "completo" : d.tag}</span>`;
        if (!d.full) b.addEventListener("click", () => {
          this.state.dayId = d.id; this.state.hour = null;
          this._renderDays(); this._recompute(true); this._renderActions(); this._renderSummary();
        });
        this.rail.appendChild(b);
      });
    }
    _updateFades() {
      if (!this.rail) return;
      const max = this.rail.scrollWidth - this.rail.clientWidth;
      this.fadeL.classList.toggle("off", this.rail.scrollLeft <= 4);
      this.fadeR.classList.toggle("off", this.rail.scrollLeft >= max - 4);
    }

    /* ---- professional chips ---- */
    _proChips(box, selId, onPick) {
      box.innerHTML = "";
      // v2.0.8 — Filtro de profesionales por servicio.
      // _service.idStaff (array de wixResourceIds permitidos) viene del
      // backend (ServiceCatalog.idStaff.ids). Si está vacío → todos
      // permitidos (fallback liberal). Los no permitidos se muestran
      // APAGADOS (clase is-disabled) — visibles pero no clickeables.
      const idStaff = Array.isArray(this._service.idStaff) ? this._service.idStaff : [];
      const permitidos = idStaff.length ? new Set(idStaff.map(String)) : null;

      this._service.pros.forEach(p => {
        const allowed = !permitidos || p.any || permitidos.has(String(p.id));
        const cls = "kr-pro"
          + (p.id === selId ? " is-sel" : "")
          + (allowed ? "" : " is-disabled");
        const c = el("button", cls);
        c.type = "button";
        c.innerHTML = `<span class="kr-pro__av${p.any ? " any" : ""}">${p.initials}</span><span>${p.name}</span>`;
        if (allowed) {
          c.addEventListener("click", () => onPick(p.id));
        } else {
          c.disabled = true;
          c.title = 'No realiza este servicio';
        }
        box.appendChild(c);
      });
    }
    _renderProMain() {
      this._proChips(this.proMainBox, this.state.proMain, id => {
        // v2.0.9 — Cambio de profesional principal: hay que pedir huecos
        // de nuevo al backend porque la disponibilidad depende del staff.
        // Antes solo se repintaba el resumen → los chips de horas mostraban
        // los slots de la query del proMain ANTERIOR, dando la sensación
        // de que el widget "se vuelve loco" al alternar entre staff.
        // No-op si es el mismo proMain.
        if (this.state.proMain === id) return;
        this.state.proMain = id;
        // La hora elegida puede ya no estar disponible con el nuevo staff
        // (mismo patrón que _afterCompChange).
        this.state.hour = null;
        this._renderProMain();
        if (this.state.sameExtra) this.state.proExtra = id;
        // v2.0.17 — repintar los chips del segundo profesional: el
        // principal ya no debe salir seleccionable como "otro", y si el
        // switch está en "el mismo" hay que reflejar el cambio.
        this._renderProExtra();
        this._recompute(true);
        this._renderActions();
        this._renderSummary();
      });
    }

    /* ---- complements (generic) ---- */
    _renderComplements() {
      if (!this.compsBox) return;   // v2.0.15 defensivo: paso 2 no existe
      this.compsBox.innerHTML = "";
      // v2.0.14 — Estado de plegado por complemento (sobrevive re-renders
      // porque this.state.expand persiste en la instancia).
      if (!this.state.expand) this.state.expand = {};

      // v2.0.15 — VARIANTE DEL PRINCIPAL (Corte Mujer M/L/XL). Bloque
      // propio al inicio del Paso 2, ANTES de los complementos. Se pinta
      // como chips horizontales: primero la BASE (svc.name + basePrice +
      // baseDuration del catálogo, actúa como "M"), luego una opción por
      // cada svc.variantes[i]. El cliente ve claramente el impacto de
      // elegir L o XL sobre precio/duración.
      //
      // v2.0.15.1 — Correción CSS crítica: usa las clases REALES del
      // propio bundle (`kr-chips` / `kr-chip` / `kr-chip.is-sel` /
      // `kr-chip__lab` / `kr-chip__sub` — verificadas en el CSS interno
      // del bundle, líneas 448-459). Antes se usaban `kr-choice` /
      // `kr-choice__btn` / `is-active` que NO existen en el CSS del
      // bundle → los chips salían con estilo de `<button>` HTML por
      // defecto (borde negro fino, sin color de selección). Mismo
      // patrón que la línea 2234 del propio bundle (kr-chips dentro
      // de un panel expandido).
      const cfgV = this._service;
      const tieneVarPrincipal = !!(cfgV.hasVariants && Array.isArray(cfgV.variantes) && cfgV.variantes.length);
      if (tieneVarPrincipal) {
        const vField = el("div", "kr-field");
        vField.appendChild(el("label", "kr-label", "Elige la variante del servicio"));
        const wrap = el("div", "kr-chips");

        const makeVarChip = (idx, label, priceRaw, durRaw) => {
          const isSel = this.state.variantIdx === idx;
          const chip = el("button", "kr-chip" + (isSel ? " is-sel" : ""));
          chip.type = "button";
          const price = (priceRaw != null) ? Number(priceRaw) : NaN;
          const dur = (durRaw != null) ? Number(durRaw) : NaN;
          const meta = [];
          if (!isNaN(price)) {
            meta.push(price > 0 ? EUR(price) : 'incluido');
          }
          if (!isNaN(dur) && dur > 0) meta.push(durTxt(dur));
          const subHtml = meta.length ? `<span class="kr-chip__sub">${meta.join(' · ')}</span>` : '';
          chip.innerHTML = `<span class="kr-chip__lab">${label}</span>${subHtml}`;
          chip.addEventListener("click", () => {
            if (this.state.variantIdx === idx) return;
            this.state.variantIdx = idx;
            this._renderComplements();
            this._recompute(true);
            this._renderActions();
            this._renderSummary();
          });
          return chip;
        };

        // Opción BASE (idx = -1). Actúa como "M" del catálogo.
        wrap.appendChild(makeVarChip(
          -1,
          cfgV.name || 'Base',
          cfgV.basePrice,
          cfgV.baseDuration
        ));
        // Opciones del array svc.variantes
        cfgV.variantes.forEach((v, i) => {
          const vLabel = (typeof v === 'string') ? v : (v.label || v.nombre || ('Variante ' + (i + 1)));
          const vPrice = (typeof v === 'object') ? (v.precio != null ? v.precio : v.price) : null;
          const vDur = (typeof v === 'object') ? (v.duracion != null ? v.duracion : v.duration) : null;
          wrap.appendChild(makeVarChip(i, vLabel, vPrice, vDur));
        });
        vField.appendChild(wrap);
        this.compsBox.appendChild(vField);
      }

      this._service.complements.forEach(c => {
        const field = el("div", "kr-field");
        // BOOL: sigue con label + segmento Sí/No como hasta v2.0.13.
        if (c.type === "bool") {
          const lab = el("label", "kr-label", c.label
            + (c.price ? ` <small>· +${EUR(c.price)}</small>` : "")
            + (c.hint ? ` <small>· ${c.hint}</small>` : ""));
          field.appendChild(lab);
          field.appendChild(this._boolControl(c));
        } else if (c.type === "choice" || c.type === "exclusive") {
          // v2.0.14 — CHOICE (variantes M/L/XL de un servicio) y EXCLUSIVE
          // (grupo con varios servicios distintos, elige uno) se pintan
          // ambos como PANEL PLEGABLE. Reduce densidad vertical y agrupa
          // visualmente las opciones bajo un título con estado actual.
          field.appendChild(this._expandControl(c));
        } else {
          // Fallback defensivo para types desconocidos.
          const lab = el("label", "kr-label", c.label);
          field.appendChild(lab);
          field.appendChild(this._choiceControl(c));
        }
        this.compsBox.appendChild(field);
      });
    }

    // v2.0.14 — Devuelve el label de la opción elegida (o null si es
    // 'none' / no hay elección aún).
    _selectedOptionLabel(c) {
      const v = this.state.comp[c.id];
      if (!v || v === 'none') return null;
      const o = (c.options || []).find(o => o.id === v);
      if (!o) return null;
      const priceTxt = (o.price == null)
        ? " · a valorar"
        : (o.price > 0 ? ` · +${EUR(o.price)}` : "");
      return (o.label || "") + priceTxt;
    }

    // v2.0.14 — Panel plegable que envuelve choice o exclusive.
    // Estado abierto/cerrado en this.state.expand[c.id]. Cerrado por defecto.
    // Se abre automáticamente si el complemento es required y no hay elección
    // aún (para que el gating de RESERVAR sea visible al usuario).
    _expandControl(c) {
      const wrap = el("div", "kr-expand");
      const isOpen = !!this.state.expand[c.id]
        || (c.required && (!this.state.comp[c.id] || this.state.comp[c.id] === 'none'));
      const sel = this._selectedOptionLabel(c);
      if (isOpen) wrap.classList.add("is-open");
      if (sel) wrap.classList.add("has-selection");

      const head = el("button", "kr-expand__head");
      head.type = "button";
      const title = el("div", "kr-expand__title");
      const labTxt = c.label + (c.required ? " *" : "");
      title.appendChild(el("span", "kr-expand__lab", labTxt));
      const subTxt = sel
        ? sel
        : (c.type === "exclusive" ? "Elige una opción o mantén sin añadir" : "Elige una opción");
      title.appendChild(el("span", "kr-expand__sub", subTxt));
      head.appendChild(title);
      const arrow = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      arrow.setAttribute("class", "kr-expand__arrow");
      arrow.setAttribute("viewBox", "0 0 24 24");
      arrow.setAttribute("fill", "none");
      arrow.setAttribute("stroke", "currentColor");
      arrow.setAttribute("stroke-width", "2.5");
      arrow.setAttribute("stroke-linecap", "round");
      arrow.setAttribute("stroke-linejoin", "round");
      arrow.innerHTML = '<polyline points="6 9 12 15 18 9"/>';
      head.appendChild(arrow);
      head.addEventListener("click", () => {
        this.state.expand[c.id] = !isOpen;
        this._renderComplements();
      });
      wrap.appendChild(head);

      const body = el("div", "kr-expand__body");
      body.appendChild(this._choiceControl(c));
      wrap.appendChild(body);
      return wrap;
    }
    _boolControl(c) {
      const seg = el("div", "kr-seg");
      [["No", false], ["Sí", true]].forEach(([txt, val]) => {
        const b = el("button", "kr-seg__opt" + (this.state.comp[c.id] === val ? " is-sel" : ""), txt);
        b.type = "button";
        b.addEventListener("click", () => { this.state.comp[c.id] = val; this._afterCompChange(); });
        seg.appendChild(b);
      });
      return seg;
    }
    _choiceControl(c) {
      const wrap = el("div", "kr-chips");
      c.options.forEach(o => {
        const sel = this.state.comp[c.id] === o.id;
        const chip = el("button", "kr-chip" + (sel ? " is-sel" : ""));
        chip.type = "button";
        const sub = o.price == null ? "a valorar" : (o.price > 0 ? `+${EUR(o.price)}` : (o.id === "none" ? "" : "incluido"));
        chip.innerHTML = `<span class="kr-chip__lab">${o.label}</span>${sub ? `<span class="kr-chip__sub">${sub}</span>` : ""}`;
        chip.addEventListener("click", () => { this.state.comp[c.id] = o.id; this._afterCompChange(); });
        wrap.appendChild(chip);
      });
      return wrap;
    }
    _afterCompChange() {
      this.state.hour = null;
      this._renderComplements();
      // v2.0.17 — El bloque "Profesional para los complementos" depende de
      // que haya complementos MARCADOS, así que se repinta cada vez que el
      // cliente toca uno (aparece al marcar el primero, desaparece al
      // quedarse sin ninguno).
      this._renderProExtra();
      this._recompute(true);
      this._renderActions();
      this._renderSummary();
    }

    /* ---- professional for complements ---- */
    // v2.0.17 — ¿El cliente ha marcado algún complemento?
    // bool  → valor truthy.
    // choice→ opción elegida distinta de 'none'. Si aún no ha elegido nada
    //         (undefined) cuenta como NO marcado: el bloque solo aparece
    //         cuando hay una elección real que repartir.
    _hayComplementosElegidos() {
      const cfg = this._service;
      if (!cfg || !Array.isArray(cfg.complements) || !this.state || !this.state.comp) return false;
      return cfg.complements.some(c => {
        const v = this.state.comp[c.id];
        if (c.type === "bool") return !!v;
        const o = (c.options || []).find(op => op.id === v);
        return !!(o && o.id !== "none");
      });
    }

    _renderProExtra() {
      // v2.0.17 — defensivo: el Paso 2 puede no existir (_build deja
      // proExtraField = null). Necesario porque ahora se llama también
      // desde _afterCompChange.
      if (!this.proExtraField) return;

      this.proExtraField.innerHTML = "";

      // v2.0.17 — Doble condición:
      //   · requiresExtraPro (backend widgetPublicoLogic v0.9.0: el
      //     servicio TIENE complementos elegibles), y
      //   · el cliente ha marcado al menos uno (si no, no hay nada que
      //     repartir y el bloque sería ruido).
      // Al ocultarse se normaliza el estado a "mismo profesional" para no
      // dejar un segundo profesional fantasma en el payload.
      if (!this._service.requiresExtraPro || !this._hayComplementosElegidos()) {
        this.proExtraField.hidden = true;
        this.state.sameExtra = true;
        this.state.proExtra = this.state.proMain;
        return;
      }

      this.proExtraField.hidden = false;
      this.proExtraField.appendChild(el("label", "kr-label", "Profesional para los complementos"));
      const row = el("div", "kr-switchrow");
      row.innerHTML = `<div class="kr-switchrow__txt">El mismo del servicio principal
        <small>Mantener a una sola persona en toda la cita</small></div>`;
      const sw = el("input", "kr-switch"); sw.type = "checkbox"; sw.checked = this.state.sameExtra;
      sw.addEventListener("change", () => {
        this.state.sameExtra = sw.checked;
        if (sw.checked) this.state.proExtra = this.state.proMain;
        // v2.0.17 — La disponibilidad depende AHORA de los dos
        // profesionales: al cambiar el reparto hay que volver a pedir
        // huecos, igual que hace _renderProMain al cambiar el principal.
        // La hora elegida puede ya no ser válida con el nuevo reparto.
        this.state.hour = null;
        this._renderProExtra();
        this._recompute(true);
        this._renderActions();
        this._renderSummary();
      });
      row.appendChild(sw);
      this.proExtraField.appendChild(row);
      if (!this.state.sameExtra) {
        const sub = el("div", "kr-pros kr-subselect");
        this.proExtraField.appendChild(sub);
        this._proChips(sub, this.state.proExtra, id => {
          if (this.state.proExtra === id) return;   // no-op si no cambia
          this.state.proExtra = id;
          this.state.hour = null;
          this._renderProExtra();
          this._recompute(true);
          this._renderActions();
          this._renderSummary();
        });
      }
    }

    // v2.0.17 — wixResourceId del SEGUNDO profesional a enviar al backend.
    // Devuelve "" cuando no hay reparto (bloque oculto, switch "el mismo",
    // wildcard 'Cualquiera', o coincide con el principal) → el backend
    // toma el camino mono-profesional idéntico al de v2.0.16.
    _proExtraEnvio() {
      if (!this._service || !this._service.requiresExtraPro) return "";
      if (!this._hayComplementosElegidos()) return "";
      if (!this.state || this.state.sameExtra) return "";
      const pe = this.state.proExtra;
      if (!pe || pe === "any" || pe === this.state.proMain) return "";
      return pe;
    }

    /* ---- hours / availability ---- */
    // v2.0 — En modo Wix (_config presente): emite 'pedir-huecos' al
    //        page code y espera respuesta async vía data-huecos-response.
    //        Mientras espera, muestra estado "loading" en la rejilla.
    //        En modo legacy (consola HTML, _config null y demoState !== 'auto'),
    //        sigue funcionando con el mock determinista para no romper la
    //        consola de previsualización.
    _recompute(simulateLoad) {
      const calc = this._calc();

      // ── Modo v2.0 (Wix con _config) ────────────────────────────────
      if (this._config) {
        // Mostrar loading inmediato y pedir huecos al backend
        this._renderHoursHead(calc, null);
        this._renderHours("loading", [], calc);
        this._emitirPedirHuecos();
        return;
      }

      // ── Modo legacy (consola HTML preview) ─────────────────────────
      const day = this._dayById(this.state.dayId);
      const slots = this._slotsFor(day, calc.duration);
      this._slots = slots;
      const eff = this._effectiveState(slots);
      this._renderHoursHead(calc, eff === "ok" ? slots.length : 0);

      if (simulateLoad && this._demoState === "auto") {
        this._computing = true;
        this._renderHoursHead(calc, null);
        this._renderHours("loading", slots, calc);
        clearTimeout(this._loadT);
        this._loadT = setTimeout(() => {
          this._computing = false;
          const e2 = this._effectiveState(slots);
          this._renderHoursHead(calc, e2 === "ok" ? slots.length : 0);
          this._renderHours(e2, slots, calc);
        }, 620);
      } else {
        this._renderHours(eff, slots, calc);
      }
    }
    _effectiveState(slots) {
      if (this._demoState !== "auto") return this._demoState === "results" ? "ok" : this._demoState;
      if (this._computing) return "loading";
      return slots.length ? "ok" : "empty";
    }
    _renderHoursHead(calc, count) {
      const c = this.hoursHead;
      const countTxt = count == null
        ? `<span class="kr-spin" style="width:14px;height:14px;border-width:2px;display:inline-block;vertical-align:-2px"></span> Calculando…`
        : `<b>${count}</b> ${count === 1 ? "hora disponible" : "horas disponibles"}`;
      const priceNow = calc.tbd
        ? `<span class="kr-priceblock__tbd">A valorar</span>`
        : `${calc.promo ? `<span class="kr-priceblock__was">${EUR(calc.subtotal)}</span>` : ""}<span class="kr-priceblock__now">${EUR(calc.total)}</span>`;
      c.innerHTML = `
        <div class="kr-hours-count">${countTxt}</div>
        <div class="kr-priceblock">
          <div class="kr-priceblock__lab">${calc.tbd ? "Estimación" : "Precio"} · ${durTxt(calc.duration)}</div>
          <div class="kr-priceblock__row">${priceNow}</div>
        </div>`;
    }
    _renderHours(stateName, slots, calc) {
      const r = this.hoursRegion; r.innerHTML = "";
      if (stateName === "loading") {
        const sk = el("div", "kr-skel");
        for (let i = 0; i < 9; i++) sk.appendChild(el("span"));
        r.appendChild(sk); return;
      }
      // v2.0.4 — Salón cerrado este día (lun/dom en KALONICE, festivos, etc.)
      if (stateName === "closed") {
        r.appendChild(this._stateBlock("calx",
          "El salón no abre este día",
          "Elige otro día del calendario para ver horarios disponibles.", false));
        return;
      }
      if (stateName === "empty") {
        r.appendChild(this._stateBlock("calx",
          "No quedan horas para este día",
          "Prueba con otro día del calendario o ajusta los complementos para abrir más huecos.", false));
        return;
      }
      if (stateName === "error") {
        r.appendChild(this._stateBlock("erri",
          "No hemos podido cargar la disponibilidad",
          "Ha sido un problema temporal. Inténtalo de nuevo en unos segundos.", true,
          () => { this._demoState = "auto"; this._recompute(true); }));
        return;
      }
      const grid = el("div", "kr-hours");
      slots.forEach(t => {
        const b = el("button", "kr-hour" + (this.state.hour === t ? " is-sel" : ""), t);
        b.type = "button";
        b.addEventListener("click", () => {
          this.state.hour = t;
          r.querySelectorAll(".kr-hour").forEach(x => x.classList.toggle("is-sel", x.textContent === t));
          this._renderActions(); this._renderSummary();
        });
        grid.appendChild(b);
      });
      r.appendChild(grid);
    }
    _stateBlock(icon, title, desc, isErr, onRetry) {
      const b = el("div", "kr-state");
      b.innerHTML = `<div class="kr-state__ic${isErr ? " err" : ""}">${ICON[icon]}</div>
        <div class="kr-state__t">${title}</div>
        <div class="kr-state__d">${desc}</div>`;
      if (onRetry) {
        const r = el("button", "kr-linkbtn", "Reintentar");
        r.addEventListener("click", onRetry); b.appendChild(r);
      }
      return b;
    }

    /* ---- summary (espejo pasivo) + modo responsive + gating ---- */
    _proName(id) { const p = this._service.pros.find(p => p.id === id); return p ? p.name : "—"; }

    _applyServiceShape() {
      const cfg = this._service;
      const hasComps = !!(cfg.complements && cfg.complements.length);
      if (this.compsSec) this.compsSec.hidden = !hasComps;
    }

    _updateLock() {
      const locked = !this.state.hour;
      if (this.datosSec) this.datosSec.classList.toggle("is-locked", locked);
      if (this.actionSec) this.actionSec.classList.toggle("is-locked", locked);
      if (this.lockNote) this.lockNote.hidden = !locked;
      ["nombre", "apellido", "email", "telefono"].forEach(k => {
        const f = this["_f_" + k]; if (f && f._input) f._input.disabled = locked;
      });
      const ta = this.shadowRoot.getElementById("kr-in-nota"); if (ta) ta.disabled = locked;
      const ck = this.shadowRoot.getElementById("kr-chk-guardar"); if (ck) ck.disabled = locked;
    }

    _renderSummary() {
      if (!this.summaryInline && !this.summaryRail) return;
      if (this.state.confirmed) {
        if (this.summaryInline) this.summaryInline.hidden = true;
        if (this.summaryRail) this.summaryRail.hidden = true;
        this._updateLock(); return;
      }
      const cfg = this._service, calc = this._calc();
      const day = this._dayById(this.state.dayId);
      const dayTxt = `${day.dow} ${day.num} ${day.mon}`;
      const hourTxt = this.state.hour
        ? `<span class="kr-prow__v">${this.state.hour}</span>`
        : `<span class="kr-prow__v kr-muted">Por elegir</span>`;

      const compRows = (cfg.complements || []).map(c => {
        const v = this.state.comp[c.id];
        let vlabel, price = 0, tbd = false;
        if (c.type === "bool") { if (!v) return ""; vlabel = "Sí"; price = c.price; tbd = c.price == null; }
        else {
          const o = c.options.find(o => o.id === v) || c.options[0];
          if (o.id === "none") return "";
          vlabel = o.label; price = o.price; tbd = o.price == null;
        }
        const tag = tbd ? ` <small>a valorar</small>` : (price > 0 ? ` <small>+${EUR(price)}</small>` : "");
        return `<div class="kr-prow"><span class="kr-prow__k">${c.label}</span><span class="kr-prow__v">${vlabel}${tag}</span></div>`;
      }).join("");

      let proRows = `<div class="kr-prow"><span class="kr-prow__k">Profesional</span><span class="kr-prow__v">${this._proName(this.state.proMain)}</span></div>`;
      if (cfg.requiresExtraPro && !this.state.sameExtra) {
        proRows += `<div class="kr-prow"><span class="kr-prow__k">Compl. con</span><span class="kr-prow__v">${this._proName(this.state.proExtra)}</span></div>`;
      }

      const totalNums = calc.tbd
        ? `<span class="kr-total__now kr-total__now--tbd">A valorar</span>`
        : `${calc.promo ? `<span class="kr-total__was">${EUR(calc.subtotal)}</span>` : ""}<span class="kr-total__now">${EUR(calc.total)}</span>`;
      const totalLab = calc.tbd
        ? `<span class="kr-total__save">Se confirma en salón</span>`
        : (calc.saved > 0.5 ? `<span class="kr-total__save">Ahorras ${EUR(calc.saved)}</span>` : "");

      // v2.0.10 — Panel destacado de descuento promocional al inicio del
      // resumen, antes del nombre del servicio y demás filas. Solo
      // aparece cuando calc.promo > 0 y hay ahorro real. Las 3 filas
      // reutilizan clase `.kr-prow` existente para que tipografía y
      // espaciado sean coherentes con el resto del bloque.
      // El helper EUR (v2.0.10) ya formatea con 2 decimales cuando los
      // haya, por lo que la cuenta del panel siempre cuadra.
      const promoBlock = (calc.promo && calc.saved > 0.005)
        ? `
        <div class="kr-summary__promo">
          <div class="kr-summary__promo-title">🎉 ENHORABUENA, este servicio tiene un descuento promocional</div>
          <div class="kr-summary__promo-rows">
            <div class="kr-prow"><span class="kr-prow__k">Precio original</span><span class="kr-prow__v">${EUR(calc.subtotal)}</span></div>
            <div class="kr-prow"><span class="kr-prow__k">Descuento (−${calc.promo}%)</span><span class="kr-prow__v">−${EUR(calc.saved)}</span></div>
            <div class="kr-prow"><span class="kr-prow__k">Precio final a pagar en salón</span><span class="kr-prow__v">${EUR(calc.total)}</span></div>
          </div>
        </div>`
        : "";

      const html = `
        <div class="kr-summary__title">Tu reserva</div>
        ${promoBlock}
        <div class="kr-summary__svc">${cfg.name}${calc.promo ? ` <small>−${calc.promo}%</small>` : ""}</div>
        <div class="kr-summary__rows">
          <div class="kr-prow"><span class="kr-prow__k">Día</span><span class="kr-prow__v">${dayTxt}</span></div>
          <div class="kr-prow"><span class="kr-prow__k">Hora</span>${hourTxt}</div>
          ${proRows}
          ${compRows}
          <div class="kr-prow"><span class="kr-prow__k">Duración aprox.</span><span class="kr-prow__v">${durTxt(calc.duration)}</span></div>
        </div>
        <div class="kr-total">
          <div class="kr-total__lab"><b>Total</b>${totalLab}</div>
          <div class="kr-total__nums">${totalNums}</div>
        </div>`;

      if (this.summaryInline) { this.summaryInline.innerHTML = html; this.summaryInline.hidden = !this.state.hour; }
      if (this.summaryRail) { this.summaryRail.innerHTML = html; this.summaryRail.hidden = false; }
      this._updateLock();
    }

    /* ---- client inputs ---- */
    _buildInputs() {
      const wrap = el("div", "kr-field");
      wrap.style.gap = "16px";
      const grid = el("div", "kr-grid2");
      grid.append(
        this._inputField("nombre", "Nombre", "text", "Tu nombre"),
        this._inputField("apellido", "Apellido", "text", "Tu apellido"),
        this._inputField("email", "Email", "email", "tucorreo@ejemplo.com"),
        this._inputField("telefono", "Teléfono", "tel", "+34 600 00 00 00")
      );
      wrap.appendChild(grid);

      // nota
      const notaF = el("div", "kr-field");
      notaF.appendChild(el("label", "kr-label", 'Nota para el salón <small>· opcional</small>'));
      const ta = el("textarea", "kr-textarea");
      ta.id = "kr-in-nota"; ta.placeholder = "Alergias, preferencias, referencia de color…";
      ta.addEventListener("input", () => { this.state.nota = ta.value; ta.classList.toggle("is-filled", !!ta.value); });
      notaF.appendChild(ta);
      wrap.appendChild(notaF);

      const chk = el("label", "kr-check");
      const ci = document.createElement("input"); ci.type = "checkbox"; ci.id = "kr-chk-guardar";
      ci.addEventListener("change", () => { this.state.guardarNota = ci.checked; });
      chk.append(ci, el("span", "kr-check__txt", "Guardar esta nota en mi ficha para próximas reservas"));
      wrap.appendChild(chk);
      return wrap;
    }
    _inputField(key, label, type, ph) {
      const f = el("div", "kr-field");
      f.appendChild(el("label", "kr-label", label));
      const inp = document.createElement("input");
      inp.className = "kr-input"; inp.id = "kr-in-" + key; inp.type = type;
      inp.placeholder = ph; inp.autocomplete = "off";
      inp.addEventListener("input", () => {
        inp.classList.toggle("is-filled", !!inp.value);
        if (this.state.errors[key]) { this.state.errors[key] = false; this._clearError(f, inp); }
        // v2.0.12: re-evaluar gating del botón RESERVAR en vivo.
        this._renderActions();
      });
      f.appendChild(inp);
      f._input = inp;
      this["_f_" + key] = f;
      return f;
    }
    _clearError(field, inp) {
      inp.classList.remove("err");
      const m = field.querySelector(".kr-errmsg"); if (m) m.remove();
    }
    _setError(key, msg) {
      const f = this["_f_" + key]; if (!f) return;
      const inp = f._input; inp.classList.add("err");
      if (!f.querySelector(".kr-errmsg"))
        f.appendChild(el("div", "kr-errmsg", `${ICON.erri}<span>${msg}</span>`));
    }

    _applyPrefill() {
      const signed = this._signedIn;
      this.prefillBox.innerHTML = signed
        ? `<div class="kr-prefill">${ICON.user}<span>Datos cargados de tu cuenta · revísalos antes de reservar</span></div>`
        : "";

      // v2.0 — Prioridad: _config.memberInfo (Wix) → window.KR_CUSTOMER (legacy)
      const m = this._config?.memberInfo;
      const map = m
        ? { nombre: m.firstName || '', apellido: m.lastName || '', email: m.email || '', telefono: m.phone || '' }
        : (window.KR_CUSTOMER || { nombre: '', apellido: '', email: '', telefono: '' });

      ["nombre", "apellido", "email", "telefono"].forEach(k => {
        const f = this["_f_" + k]; if (!f) return;
        const inp = f._input;
        inp.value = signed ? (map[k] || '') : '';
        inp.classList.toggle("is-filled", signed && !!map[k]);
        if (this.state.errors[k]) { this.state.errors[k] = false; this._clearError(f, inp); }
      });
    }

    /* ---- v2.0.12: validación silenciosa de datos para el gating del botón.
       Misma regla que _submit() pero SIN marcar errores: solo decide si el
       botón RESERVAR puede activarse. ---- */
    _datosCompletos() {
      const get = k => (this.shadowRoot.getElementById("kr-in-" + k) || {}).value || "";
      const nombre = get("nombre").trim();
      const apellido = get("apellido").trim();
      const email = get("email").trim();
      const telefono = get("telefono").trim();
      if (!nombre || !apellido || !email || !telefono) return false;
      if (!EMAIL_RE.test(email)) return false;
      if (telefono.replace(/\D/g, "").length < 6) return false;
      return true;
    }

    /* ---- v2.0.13: complementos obligatorios (required) deben tener una
       opción válida elegida (≠ 'none'). Si alguno required no está
       resuelto, el botón RESERVAR no se activa. ---- */
    _complementosObligatoriosOk() {
      const comps = (this._service && this._service.complements) || [];
      for (const c of comps) {
        if (!c.required) continue;
        const v = this.state.comp[c.id];
        if (c.type === 'bool') {
          if (v !== true) return false;            // bool obligatorio → debe ser "Sí"
        } else {
          if (!v || v === 'none') return false;    // choice obligatorio → variante real
        }
      }
      return true;
    }

    /* ---- actions ---- */
    _renderActions() {
      const calc = this._calc();
      const has = !!this.state.hour;
      const submitting = !!this.state.submitting;
      this.actionsBox.innerHTML = "";
      // Estado "enviando reserva": opacar interacción
      this.actionsBox.classList.toggle('kr-submitting', submitting);

      const head = el("div", "kr-sec__head");
      head.style.marginBottom = "16px";
      head.appendChild(el("div", "kr-eyebrow", "Confirmar"));
      head.appendChild(el("h3", "kr-sec__title", "Reserva tu cita"));
      this.actionsBox.appendChild(head);

      if (!has) this.actionsBox.appendChild(el("p", "kr-hint-pick", "Elige una hora arriba para activar la reserva."));

      // ── v2.0.12: casillas de consentimiento legal (marcadas por defecto) ──
      // El botón RESERVAR solo se activa con: hora + datos completos +
      // ambas casillas en true. Si se desmarca cualquiera → fantasma.
      const sc = (this._config && this._config.salonConfig) || {};
      const privacyUrl = sc.privacyPolicyUrl || "";
      const termsUrl = sc.termsConditionsUrl || "";

      const mkLegalCheck = (stateKey, checked, labelTxt, url) => {
        const lbl = el("label", "kr-check");
        const ci = document.createElement("input");
        ci.type = "checkbox";
        ci.checked = !!checked;
        ci.disabled = submitting;
        ci.addEventListener("change", () => {
          this.state[stateKey] = ci.checked;
          this._renderActions();
        });
        const txt = el("span", "kr-check__txt");
        txt.appendChild(document.createTextNode("He leído y acepto la "));
        const link = el("a", "kr-legal-link" + (url ? "" : " is-empty"), labelTxt);
        if (url) {
          link.href = url;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
        } else {
          // Sin URL: enlace inerte (responsabilidad del salón).
          link.addEventListener("click", (e) => e.preventDefault());
        }
        // Evitar que el clic en el enlace alterne la casilla.
        link.addEventListener("click", (e) => e.stopPropagation());
        txt.appendChild(link);
        lbl.append(ci, txt);
        return lbl;
      };

      const legalBox = el("div", "kr-legal");
      legalBox.style.marginBottom = "14px";
      legalBox.appendChild(mkLegalCheck("aceptaPrivacidad", this.state.aceptaPrivacidad, "Política de Protección de Datos", privacyUrl));
      legalBox.appendChild(mkLegalCheck("aceptaTerminos", this.state.aceptaTerminos, "Términos y Condiciones", termsUrl));
      this.actionsBox.appendChild(legalBox);

      // Gating combinado para ambos botones de reserva.
      const gateOk = has && this._datosCompletos()
        && this._complementosObligatoriosOk()
        && this.state.aceptaPrivacidad === true
        && this.state.aceptaTerminos === true;

      const acts = el("div", "kr-actions");

      // PRIMARIA: pagar en el salón (naranja, primero)
      const salon = el("button", "kr-btn kr-btn--primary");
      salon.type = "button"; salon.disabled = !gateOk || submitting;
      const salonPrice = calc.tbd ? "" : ` <span class="kr-btn__price">· ${EUR(calc.total)}</span>`;
      const salonLabel = submitting ? 'Enviando…' : `Reservar y pagar en el salón${salonPrice}`;
      salon.innerHTML = `<span class="kr-stack-lab">
          <span>${salonLabel}</span>
          <span class="kr-btn__sub">${calc.tbd ? "El importe se confirma en tu cita" : "Pagas el día de tu cita"}</span></span>`;
      salon.addEventListener("click", () => this._submit("salon"));
      acts.appendChild(salon);

      // SECUNDARIA: pagar online — solo si hay importe cerrado Y el pago
      // online está activado (PAGO_ONLINE_ACTIVO). Bloque intacto: queda
      // desactivado mientras el salón no tenga pasarela conectada.
      if (PAGO_ONLINE_ACTIVO && !calc.tbd) {
        const online = el("button", "kr-btn kr-btn--ghost");
        online.type = "button"; online.disabled = !gateOk || submitting;
        online.innerHTML = `<span class="kr-stack-lab">
            <span>Pagar online ahora</span>
            <span class="kr-btn__sub">Pago seguro por adelantado · ${EUR(calc.total)}</span></span>`;
        online.addEventListener("click", () => this._submit("online"));
        acts.appendChild(online);
      }

      const bar = el("div", "kr-paybar", `${ICON.lock}<span>Pago cifrado y protegido</span>`);
      acts.appendChild(bar);

      // Mensaje de error de reserva (si lo hay)
      if (this.state.submitError) {
        const err = el('div', 'kr-reserror');
        err.textContent = this.state.submitError;
        acts.appendChild(err);
      }

      this.actionsBox.appendChild(acts);
    }

    /* ---- submit / validate ---- */
    _submit(method) {
      if (!this.state.hour) return;
      if (this.state.submitting) return;

      const get = k => (this.shadowRoot.getElementById("kr-in-" + k) || {}).value || "";
      const data = { nombre: get("nombre").trim(), apellido: get("apellido").trim(), email: get("email").trim(), telefono: get("telefono").trim() };
      const errs = {};
      if (!data.nombre) errs.nombre = "Indica tu nombre";
      if (!data.apellido) errs.apellido = "Indica tu apellido";
      if (!data.email) errs.email = "Indica tu email";
      else if (!EMAIL_RE.test(data.email)) errs.email = "Email no válido";
      if (!data.telefono) errs.telefono = "Indica tu teléfono";
      else if (data.telefono.replace(/\D/g, "").length < 6) errs.telefono = "Teléfono no válido";

      this.state.errors = {};
      ["nombre", "apellido", "email", "telefono"].forEach(k => {
        const f = this["_f_" + k]; this._clearError(f, f._input);
      });
      if (Object.keys(errs).length) {
        this.state.errors = errs;
        Object.entries(errs).forEach(([k, m]) => this._setError(k, m));
        const first = ["nombre", "apellido", "email", "telefono"].find(k => errs[k]);
        if (first) this["_f_" + first]._input.focus();
        return;
      }

      // ── Modo v2.0 (Wix): emitir evento 'reservar' con payload completo ──
      if (this._config) {
        const cfg = this._service;
        const day = this._dayById(this.state.dayId);

        // Complementos seleccionados.
        //   · bool     → si está activado, se manda su uid (string), como siempre.
        //   · choice   → si la opción elegida NO es 'none', se manda un objeto
        //                { uid, varianteId, varianteLabel, price, duration }
        //                donde uid = c.id (setupUid del servicio, mismo para
        //                todas las variantes) y varianteId identifica la
        //                variante. El backend persiste precio/duración de la
        //                variante. (v2.0.13)
        //   · exclusive → v2.0.14. Grupo con varios servicios distintos, elige
        //                uno o ninguno. Si el elegido NO es 'none', se manda
        //                un objeto { uid, varianteId, varianteLabel, price,
        //                duration } donde uid = o.id (setupUid del SERVICIO
        //                elegido, distinto según opción). Mismo shape que
        //                choice; el motor recepcionProLogic v1.0.34 detecta
        //                el uid dentro de f.refs del item exclusivo y
        //                materializa el servicio en su posición.
        const complementosSetupUid = (cfg.complements || []).reduce((acc, c) => {
          const v = this.state.comp[c.id];
          if (c.type === 'bool') {
            if (v) acc.push(c.id);
          } else if (c.type === 'exclusive') {
            if (v && v !== 'none') {
              const o = (c.options || []).find(o => o.id === v);
              if (o) {
                acc.push({
                  uid: o.id,                  // setupUid del servicio elegido
                  varianteId: o.id,
                  varianteLabel: o.label || '',
                  price: (o.price == null ? null : Number(o.price)),
                  duration: Number(o.duration) || 0
                });
              }
            }
          } else {
            // choice
            if (v && v !== 'none') {
              const o = (c.options || []).find(o => o.id === v);
              if (o) {
                acc.push({
                  uid: c.id,
                  varianteId: o.id,
                  varianteLabel: o.label || '',
                  price: (o.price == null ? null : Number(o.price)),
                  duration: Number(o.duration) || 0
                });
              }
            }
          }
          return acc;
        }, []);

        // Guardar contact data para usarla al recibir la respuesta
        this._lastContactData = data;

        // v2.0.15 — VARIANTE del principal. Si state.variantIdx >= 0,
        // se envía varianteSel {idx, label, price, duration} para que
        // crearReservaPublica v0.7.7 lo propague a crearPackReserva
        // v1.0.25 y la reserva se cree con el precio/duración de la
        // variante. Si variantIdx === -1 (base) o el servicio no tiene
        // variantes, varianteSel = null → motor usa base.
        let varianteSel = null;
        if (cfg.hasVariants && Array.isArray(cfg.variantes)) {
          const idx = this.state.variantIdx;
          if (Number.isInteger(idx) && idx >= 0 && idx < cfg.variantes.length) {
            const v = cfg.variantes[idx];
            if (v && typeof v === 'object') {
              const vLabel = v.label || v.nombre || '';
              const vPriceRaw = (v.precio != null ? v.precio : v.price);
              const vDurRaw = (v.duracion != null ? v.duracion : v.duration);
              const vPrice = (vPriceRaw != null) ? Number(vPriceRaw) : 0;
              const vDur = (vDurRaw != null) ? Number(vDurRaw) : 0;
              varianteSel = { idx, label: vLabel, price: vPrice, duration: vDur };
            }
          }
        }

        const payload = {
          fecha: day.id,
          horaHHmm: this.state.hour,
          principalSetupUid: cfg.setupUid || '',
          complementosSetupUid,
          staffId: this.state.proMain,
          staffName: this._proName(this.state.proMain),
          // v2.0.17 — Segundo profesional para los complementos. Vacío
          // cuando no hay reparto → crearReservaPublica se comporta como
          // en v2.0.16 (toda la cita al principal).
          staffExtraId: this._proExtraEnvio(),
          contactDetails: {
            firstName: data.nombre,
            lastName: data.apellido,
            email: data.email,
            phone: data.telefono
          },
          memberContactId: this._config?.memberInfo?.contactId || '',
          notas: this.state.nota || '',
          metodoPago: method,
          // v2.0.15 — Variante del principal (null si base).
          varianteSel,
          // v2.0.16 — Duración TOTAL de la cita (principal + variante +
          // complementos): la MISMA cifra que _emitirPedirHuecos envía a
          // getHuecosDisponibles (this._calc().duration). El backend la usa
          // para resolver 'Cualquiera' comprobando que el profesional esté
          // libre en TODO el bloque continuo que el motor de huecos ya
          // validó. Sin esta línea el backend cae a la duración base del
          // principal (riesgo de solape en cascadas con complementos).
          durationMin: this._calc().duration
        };
        this._emitirReservar(payload);
        return;
      }

      // ── Modo legacy (consola HTML preview): confirmación local inmediata ──
      this.state.confirmed = { method, data, calc: this._calc() };
      this._renderConfirm();
    }

    /* ---- confirmation ---- */
    _renderConfirm() {
      const conf = this.state.confirmed;
      const { method, data, calc } = conf;
      const cfg = this._service, day = this._dayById(this.state.dayId);
      const whenTxt = `${day.dow} ${day.num} ${day.mon} · ${this.state.hour}`;

      // v2.0 — Si hubo reserva real, usar precioTotal devuelto por el
      // backend y mostrar el localizador (reservaId) de la cita.
      // v2.0.10 — Cuando hay descuento promocional, usar calc.total (ya
      // descontado) en lugar de conf.precioTotal del backend. El backend
      // guarda en KamisuiteReservations el precio BRUTO del catálogo
      // (sin descuento); el descuento se aplica al cobrar en salón vía
      // Recepción Pro V2 / marcarPagadoReserva (importeNeto). Si pintamos
      // conf.precioTotal al cliente, vería el bruto (16€) en lugar del
      // neto que realmente pagará (14,40€). Coherencia con el resumen.
      const totalReal = (calc.promo && calc.saved > 0.005)
        ? calc.total
        : ((conf.precioTotal != null) ? conf.precioTotal : calc.total);
      const reservaId = conf.reservaId || null;
      const localizador = reservaId ? reservaId.slice(-6).toUpperCase() : '';

      const payTxt = method === "online"
        ? `Pagado online · ${EUR(totalReal)}`
        : (calc.tbd ? "Se valora en el salón" : `A pagar en el salón · ${EUR(totalReal)}`);
      // v2.0.3 — Frases de cierre: sólo lo que es REAL.
      // No prometemos "email de confirmación" ni "gestionar/cancelar
      // desde el email" hasta que esa pieza exista (lo conectaremos
      // cuando se integre el envío de email/WhatsApp de confirmación).
      const closing = method === "online"
        ? "Hemos recibido tu pago. Te esperamos en el salón el día y hora reservados."
        : "Tu hueco queda reservado. Pagarás el día de la cita en el salón.";

      // v2.0.10 — Panel destacado de descuento promocional en la pantalla
      // de confirmación final (consistencia con el resumen de la reserva).
      // Solo aparece cuando la cita confirmada llevaba descuento real.
      // Igual estética y mismo desglose que el panel del bloque "Tu reserva".
      const promoBlockConf = (calc.promo && calc.saved > 0.005)
        ? `
          <div class="kr-summary__promo" style="margin:18px 0 0">
            <div class="kr-summary__promo-title">🎉 ENHORABUENA, este servicio tiene un descuento promocional</div>
            <div class="kr-summary__promo-rows">
              <div class="kr-prow"><span class="kr-prow__k">Precio original</span><span class="kr-prow__v">${EUR(calc.subtotal)}</span></div>
              <div class="kr-prow"><span class="kr-prow__k">Descuento (−${calc.promo}%)</span><span class="kr-prow__v">−${EUR(calc.saved)}</span></div>
              <div class="kr-prow"><span class="kr-prow__k">Precio final a pagar en salón</span><span class="kr-prow__v">${EUR(calc.total)}</span></div>
            </div>
          </div>`
        : "";

      this.body.hidden = true;
      this.confirmHost.hidden = false;
      this.confirmHost.innerHTML = `
        <div class="kr-confirm">
          <div class="kr-confirm__badge">${ICON.check}</div>
          <div class="kr-confirm__t">Reserva confirmada</div>
          <div class="kr-confirm__d">Gracias, ${data.nombre}. Tu cita de <b>${cfg.name}</b> está guardada.</div>
          <div class="kr-confirm__card">
            ${localizador ? `<div class="kr-prow"><span class="kr-prow__k">Localizador</span><span class="kr-prow__v"><code>${localizador}</code></span></div>` : ''}
            <div class="kr-prow"><span class="kr-prow__k">Cuándo</span><span class="kr-prow__v">${whenTxt}</span></div>
            <div class="kr-prow"><span class="kr-prow__k">Profesional</span><span class="kr-prow__v">${this._proName(this.state.proMain)}${this.state.sameExtra ? "" : ` <small>+ ${this._proName(this.state.proExtra)}</small>`}</span></div>
            <div class="kr-prow"><span class="kr-prow__k">Duración aprox.</span><span class="kr-prow__v">${durTxt(calc.duration)}</span></div>
            <div class="kr-prow"><span class="kr-prow__k">Pago</span><span class="kr-prow__v">${payTxt}</span></div>
          </div>
          ${promoBlockConf}
          <div class="kr-confirm__d" style="margin-top:18px">${closing}</div>
          <button class="kr-linkbtn" type="button" id="kr-again">Hacer otra reserva</button>
        </div>`;
      this.confirmHost.querySelector("#kr-again").addEventListener("click", () => {
        this.state.confirmed = null; this.state.hour = null;
        this.state.submitError = ''; this.state.submitting = false;
        this.confirmHost.hidden = true; this.confirmHost.innerHTML = "";
        this.body.hidden = false;
        this._renderActions(); this._renderSummary(); this._recompute(false);
      });
    }
  }

  customElements.define("kami-reserva", KamiReserva);
})();
