import wixLocation from 'wix-location';

$w.onReady(function () {
  const path = wixLocation.path.join('/');

  if (path === 'appmobile') {
    $w('#f6B6E28D52B24De6Aab3Ff2Ccad8E2291').hide();
  } else {
    $w('#f6B6E28D52B24De6Aab3Ff2Ccad8E2291').show();
  }
});