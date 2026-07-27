import wixData from 'wix-data';

const GRUPOS_PAGINA = [
  'TRATAMIENTOS',
  'SPA'
];

$w.onReady(function () {
  prepararBuscador();

  $w('#dataset1').onReady(() => {
    aplicarFiltro();
  });

  $w('#buscador').onChange(() => {
    aplicarFiltro();
  });
});

function prepararBuscador() {
  $w('#buscador').options = [
    { label: 'Todos', value: 'TODOS' },
    { label: 'TRATAMIENTOS', value: 'TRATAMIENTOS' },
    { label: 'SPA', value: 'SPA' }
  ];

  $w('#buscador').value = 'TODOS';
}

function aplicarFiltro() {
  const valorBuscador = $w('#buscador').value;

  const filtroVista = wixData.filter().eq('vistaEnTour', true);

  if (valorBuscador && valorBuscador !== 'TODOS') {
    $w('#dataset1').setFilter(
      filtroVista.and(
        wixData.filter().eq('group', valorBuscador)
      )
    );
    return;
  }

  const filtroGrupos = wixData.filter()
    .eq('group', 'TRATAMIENTOS')
    .or(wixData.filter().eq('group', 'SPA'));

  $w('#dataset1').setFilter(
    filtroVista.and(filtroGrupos)
  );
}