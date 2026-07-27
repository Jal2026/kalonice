import wixWindow from "wix-window";
import wixLocation from "wix-location";

const REPEATER_ID = "#repeater1";
const BOTON_ID = "#boton";
const CARD_ID = "#COM";

// Bola flotante / Chat IA
const CHAT_IA_ID = "#f6B6E28D52B24De6Aab3Ff2Ccad8E2291";

const URL_DESKTOP_COMUNICACIONES = "/recepcioncomunicaciones";
const URL_MOBILE_COMUNICACIONES = "/recepcioncomunicacionesmobile";

// En tu captura es la tercera tarjeta:
// 0 = Recepción
// 1 = Tienda
// 2 = Marketing y Comunicación
const INDICE_COMUNICACIONES = 2;

$w.onReady(function () {
  ocultarBolaChatIA();
  configurarMenuPrincipal();

  // Refuerzo por si Wix termina de pintar elementos unos ms después
  setTimeout(() => {
    ocultarBolaChatIA();
    configurarMenuPrincipal();
  }, 500);

  // Segundo refuerzo específico por si el chat IA aparece más tarde
  setTimeout(() => {
    ocultarBolaChatIA();
  }, 1500);
});

function ocultarBolaChatIA() {
  try {
    $w(CHAT_IA_ID).hide();

    console.log("[Chat IA] Bola flotante ocultada", {
      id: CHAT_IA_ID
    });
  } catch (e) {
    console.warn("[Chat IA] No se pudo ocultar. Revisa si el ID existe en esta página.", {
      id: CHAT_IA_ID,
      error: e
    });
  }
}

function configurarMenuPrincipal() {
  $w(REPEATER_ID).forEachItem(($item, itemData, index) => {
    const boton = $item(BOTON_ID);
    const card = $item(CARD_ID);

    const textoBoton = normalizarTexto(boton.label);

    const esComunicaciones =
      index === INDICE_COMUNICACIONES ||
      (
        textoBoton.includes("marketing") &&
        textoBoton.includes("comunicacion")
      );

    if (!esComunicaciones) {
      return;
    }

    const destino =
      wixWindow.formFactor === "Mobile"
        ? URL_MOBILE_COMUNICACIONES
        : URL_DESKTOP_COMUNICACIONES;

    // Intentamos dejar sin efecto cualquier link previo del botón
    try {
      boton.link = "";
    } catch (e) {
      // Si Wix no permite limpiar el link por código, seguimos con onClick.
    }

    boton.onClick(() => {
      wixLocation.to(destino);
    });

    card.onClick(() => {
      wixLocation.to(destino);
    });

    console.log("[Menú Principal] Comunicaciones configurado", {
      index,
      textoBoton,
      formFactor: wixWindow.formFactor,
      destino
    });
  });
}

function normalizarTexto(valor) {
  return String(valor || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}