import wixData from 'wix-data';

const CAMPO_GROUP = "group";

$w.onReady(function () {

    $w("#dataset2").onReady(async () => {

        // Opciones del desplegable
        $w("#buscador").options = [
            { label: "Todos", value: "TODOS" },
            { label: "Depilación femenina", value: "DEPILACION_FEMENINA" },
            { label: "Cortes mujer", value: "CORTESMUJER" },
            { label: "Niñas", value: "NIÑAS" },
            { label: "Manicura y pedicura", value: "MANICURA_&_PEDICURA" },
            { label: "Novias y recogidos", value: "NOVIAS_&_RECOGIDOS" },
            { label: "Comuniones y eventos", value: "COMUNIONES_&_EVENTOS" },
            { label: "Peinados", value: "PEINADOS" }
        ];

        // Al cargar la página muestra todas las categorías de mujer
        await mostrarTodasLasCategorias();

        $w("#buscador").onChange(async () => {

            const categoriaSeleccionada = $w("#buscador").value;

            if (categoriaSeleccionada === "TODOS") {
                await mostrarTodasLasCategorias();
                return;
            }

            await $w("#dataset2").setFilter(
                wixData.filter().eq(CAMPO_GROUP, categoriaSeleccionada)
            );
        });
    });
});


async function mostrarTodasLasCategorias() {

    const filtro = wixData.filter()
        .eq(CAMPO_GROUP, "DEPILACION_FEMENINA")
        .or(
            wixData.filter().eq(CAMPO_GROUP, "CORTESMUJER")
        )
        .or(
            wixData.filter().eq(CAMPO_GROUP, "NIÑAS")
        )
        .or(
            wixData.filter().eq(CAMPO_GROUP, "MANICURA_&_PEDICURA")
        )
        .or(
            wixData.filter().eq(CAMPO_GROUP, "NOVIAS_&_RECOGIDOS")
        )
        .or(
            wixData.filter().eq(CAMPO_GROUP, "COMUNIONES_&_EVENTOS")
        )
        .or(
            wixData.filter().eq(CAMPO_GROUP, "PEINADOS")
        );

    await $w("#dataset2").setFilter(filtro);
}