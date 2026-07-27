import wixData from 'wix-data';

const CAMPO_GROUP = "group";

$w.onReady(function () {

    $w("#dataset1").onReady(async () => {

        // Opciones del desplegable
        $w("#buscador").options = [
            { label: "Todos", value: "TODOS" },
            { label: "Caballero", value: "CABALLERO" },
            { label: "Niños", value: "NIÑOS" },
            { label: "Depilación masculina", value: "DEPILACION_MASCULINA" }
        ];

        // Al cargar la página muestra las tres categorías
        await mostrarTodasLasCategorias();

        $w("#buscador").onChange(async () => {

            const categoriaSeleccionada = $w("#buscador").value;

            if (categoriaSeleccionada === "TODOS") {
                await mostrarTodasLasCategorias();
                return;
            }

            await $w("#dataset1").setFilter(
                wixData.filter().eq(CAMPO_GROUP, categoriaSeleccionada)
            );
        });
    });
});


async function mostrarTodasLasCategorias() {

    const filtro = wixData.filter()
        .eq(CAMPO_GROUP, "CABALLERO")
        .or(
            wixData.filter().eq(CAMPO_GROUP, "NIÑOS")
        )
        .or(
            wixData.filter().eq(CAMPO_GROUP, "DEPILACION_MASCULINA")
        );

    await $w("#dataset1").setFilter(filtro);
}