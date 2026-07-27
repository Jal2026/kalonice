import wixLocationFrontend from "wix-location-frontend";

$w.onReady(function () {

    $w("#repeater3").onItemReady(($item, itemData) => {

        const destino = normalizarUrl(itemData.urlText);
        const boton = $item("#boton");

        if (!destino) {
            boton.disable();
            return;
        }

        boton.enable();

        boton.onClick(() => {
            wixLocationFrontend.to(destino);
        });
    });

});

function normalizarUrl(valor) {

    if (typeof valor !== "string") {
        return null;
    }

    const url = valor.trim();

    if (!url) {
        return null;
    }

    // Enlaces externos, teléfono o correo
    if (
        url.startsWith("https://") ||
        url.startsWith("http://") ||
        url.startsWith("mailto:") ||
        url.startsWith("tel:")
    ) {
        return url;
    }

    // Página interna de la web
    return url.startsWith("/") ? url : `/${url}`;
}