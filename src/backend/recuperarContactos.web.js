// =====================================================
// [RecuperarContactos v1.0.0] - recuperarContactos.web.js
//
// BACKEND ONE-SHOT — RECUPERACIÓN DE CONTACTOS PERDIDOS
// EN LA IMPORTACIÓN SADPE → WIX CRM (KALÓNICE, agosto 2026)
//
// ⚠️ ARCHIVO DESECHABLE. Se ELIMINA al cerrar la recuperación, junto
//    con el bloque get_recuperarContactos de http-functions.js.
//    Mismo patrón que dumpReservasV1.web.js (migración V1→V2, jul 2026).
//
// -----------------------------------------------------------------
// PROBLEMA QUE RESUELVE
// -----------------------------------------------------------------
// La importación masiva del 06-jun-2026 desde el Dashboard de Wix
// descartó las fichas cuyo MÓVIL ya existía en el CRM. En KALÓNICE hay
// 558 grupos familiares que comparten móvil (madre + hijos, parejas).
// Wix conservó UNA ficha por número y descartó el resto: 742 fichas
// perdidas, sistemáticamente las de mayor actividad.
//
// De 5.234 fichas SADPE llegaron 3.833 al CRM. De las ~1.400 ausentes:
//   · 601 no tienen ni email ni teléfono → irrecuperables, fuera.
//   · 766 tienen móvil válido de 9 dígitos → ESTE LOTE.
//
// -----------------------------------------------------------------
// POR QUÉ NO SE REIMPORTA POR DASHBOARD
// -----------------------------------------------------------------
// El importador del Dashboard no expone `allowDuplicates`. Volvería a
// descartar exactamente las mismas 742. La API sí lo expone.
//
// -----------------------------------------------------------------
// PATRONES REUTILIZADOS (LITERAL, NINGUNO INVENTADO)
// -----------------------------------------------------------------
//   · fichaClienteLogic.web.js v1.9.11 (crearContactoCRM, línea ~2075):
//       elevate(contacts.createContact)
//       createContact(contactInfo, { allowDuplicates, suppressAuth:true })
//       contactInfo = { name:{first,last}, emails:[{tag:'MAIN',email}],
//                       phones:[{tag:'MOBILE',phone}], birthdate:'YYYY-MM-DD',
//                       extendedFields:{ 'custom.sexo': valor } }
//   · crmToolsLogic.web.js (clasificarBatchSexo, líneas 103-181):
//       elevate(contacts.findOrCreateLabel) → resp.label.key
//       elevate(contacts.labelContact)(contactId, [labelKey], {suppressAuth:true})
//   · dumpReservasV1.web.js v1.2.0: estructura de backend one-shot.
//
// -----------------------------------------------------------------
// AVISO CRÍTICO — allowDuplicates
// -----------------------------------------------------------------
// Documentado en la cabecera de fichaClienteLogic v1.9.11: con
// allowDuplicates:false Wix CREA el contacto igualmente Y ADEMÁS lanza
// excepción DUPLICATE_CONTACT_EXISTS. Reintentar tras el error crearía
// DOS contactos. Por eso aquí se llama SIEMPRE con allowDuplicates:true
// y NO se reintenta nunca tras una excepción.
//
// -----------------------------------------------------------------
// DECISIONES DE DATOS (autorizadas por Jal, 04-ago-2026)
// -----------------------------------------------------------------
//   · Lote completo: las 766 fichas (no solo las 113 activas).
//   · Etiqueta: 'Kalonice recuperados' — permite filtrar y borrar el
//     lote entero desde el Dashboard si algo sale mal.
//   · Teléfono: 9 dígitos crudos ('660165840'), formato idéntico al de
//     las 3.833 ya importadas. NO se usa prefijo +34.
//   · Sexo: se vuelca. Literal 'Femenino'/'Masculino' — el que tienen
//     las 3.833 importadas. SADPE trae 'MUJER'/'HOMBRE' y se traduce.
//     AVISO: 155 de estas 766 traen el sexo mal informado desde SADPE
//     (problema de origen, no de esta recuperación).
//   · Email: se omite en 763 de 766. Motivo: Wix NO admite email
//     duplicado y 42 de los 47 emails del lote ya existen en el CRM
//     (pertenecen a un familiar o a la misma persona mal escrita), y 2
//     están rotos en origen. Enviarlos provocaría el rechazo del alta.
//     Solo 3 fichas conservan email.
//
// -----------------------------------------------------------------
// USO
// -----------------------------------------------------------------
//   https://www.peluqueriakalonice.es/_functions/recuperarContactos?desde=0&hasta=50
//
//   Procesa el tramo [desde, hasta) del lote y devuelve JSON con el
//   resultado ficha a ficha. Se avanza cambiando el rango a mano:
//   0-50, 50-100, ... hasta 766. Tramos de 50 recomendados.
//
//   Parámetro opcional &dryRun=1 → simula sin crear nada. RECOMENDADO
//   para la primera llamada.
//
//   IDEMPOTENCIA: antes de crear, comprueba si ya existe un contacto
//   con ese teléfono Y ese nombre+apellido. Si existe, lo salta. Volver
//   a lanzar un tramo ya procesado NO duplica.
// =====================================================

import { webMethod, Permissions } from 'wix-web-module';
import { elevate } from 'wix-auth';
import { contacts } from 'wix-crm-backend';

const VERSION = 'v1.0.0';
const TAG = '[RecuperarContactos v1.0.0]';

const ETIQUETA_LOTE = 'Kalonice recuperados';

// Elevate a nivel de módulo — patrón dumpReservasV1.web.js v1.2.0
const createContactElevated    = elevate(contacts.createContact);
const findOrCreateLabelElev    = elevate(contacts.findOrCreateLabel);
const labelContactElevated     = elevate(contacts.labelContact);
const queryContactsElevated    = elevate(contacts.queryContacts);

// =====================================================
// LOTE — 766 fichas
// Formato: [nombre, apellido, telefono, email, birthdate, sexo, numClienteSADPE]
// =====================================================
const LOTE = [
  ["RICARDO", "COSTA", "717716849", "", "", "Femenino", "3641"],
  ["ROCIO", "HARAMBURU", "680594566", "", "", "Femenino", "5293"],
  ["NOA", "ABEJON CORRALES", "619691936", "", "2019-10-09", "Femenino", "3178"],
  ["JULIA", "CAZON MARTIN", "626170507", "", "", "Femenino", "3750"],
  ["FABIO", "GARRIDO", "661920578", "", "", "Masculino", "2841"],
  ["MARIA", "ANGULO", "629621979", "", "", "Femenino", "3902"],
  ["MARIA", "MALPARTIDA", "676414908", "", "", "Femenino", "4472"],
  ["MARTINA", "PRADA", "629472651", "", "", "Femenino", "5197"],
  ["LAURA", "DENLLOCH", "677854346", "", "", "Femenino", "5291"],
  ["JOSU", "ALONSO CASTELLANO", "623506496", "josu.a.c.33@iclou.com", "", "Femenino", "5289"],
  ["OLIVIA", "MORENTE RODA", "630066636", "", "2019-07-12", "Femenino", "2870"],
  ["ALBA", "JORDAN LLORENTE", "687690548", "", "", "Femenino", "5190"],
  ["ALEJANDRO", "ALONSO ARJONA", "678532355", "", "", "Femenino", "4329"],
  ["VEGA", "VARA", "695593007", "", "", "Femenino", "3162"],
  ["CLAUDIA", "CANO HERRERO", "630644653", "", "", "Femenino", "5288"],
  ["ANGEL", "CARRASCO PARADELO", "676401109", "", "", "Masculino", "2811"],
  ["DIEGO", "CIFUENTES CANO", "696715617", "", "2008-12-22", "Masculino", "2361"],
  ["GONZALO", "PADIN", "606105827", "", "", "Femenino", "3760"],
  ["ANA", "CORTES GALLEGO", "640086103", "", "", "Femenino", "4668"],
  ["JOSE", "ANGULO", "629621979", "", "", "Femenino", "5243"],
  ["NICOLAS", "SANTANA GARCIA", "687549917", "", "", "Masculino", "3277"],
  ["MARLENE", "RODRIGUEZ CASTRO", "636681274", "", "", "Femenino", "3879"],
  ["NEREA", "FUENTES LUENGO", "630668410", "", "", "Femenino", "4565"],
  ["CARIDAD", "RELUCIO PATON", "645945281", "", "", "Femenino", "2040"],
  ["MYLUSKA", "MENDOZA VARGAS", "652188153", "", "", "Femenino", "5126"],
  ["ANGELES", "MARTINEZ DE LA RICA", "687772883", "", "", "Femenino", "5134"],
  ["ENZO", "CABRERA", "669300212", "", "", "Femenino", "3832"],
  ["MIGUEL", "CORDERO ISIDRO", "649296612", "", "", "Femenino", "4146"],
  ["MAITE", "MOREIRA VEGA", "686834524", "", "", "Femenino", "5189"],
  ["ESTRELLA", "LINDO", "657300383", "", "", "Femenino", "4603"],
  ["HUGO", "MOREIRA", "686834524", "", "", "Femenino", "5018"],
  ["MANUEL", "DE LA ROSA", "635120708", "", "", "Femenino", "3634"],
  ["CAROLINA", "CEPRIAN GUTIERREZ", "635826726", "", "", "Femenino", "5286"],
  ["ALEJANDRO", "BARTOLOME RODRIGUEZ", "622135575", "", "", "Masculino", "1939"],
  ["ADAY", "HERNANDEZ", "691839245", "", "", "Femenino", "4589"],
  ["PAULA", "ROSADO GARCIA", "679664446", "", "", "Femenino", "4900"],
  ["SANCHEZ", "LOPEZ YBARRA MIGUEL ANGEL", "617021403", "", "", "Femenino", "3535"],
  ["OLIVER", "GONZALEZ TORIBIO", "637566448", "", "2018-01-14", "Femenino", "2826"],
  ["ADRIAN", "TAMAYO", "675871714", "", "", "Femenino", "3997"],
  ["SAUL", "ARCONES RASINES", "665537895", "", "1984-12-20", "Femenino", "188"],
  ["IRAI", "SANDOVAL GOMEZ", "635703344", "", "", "Femenino", "5285"],
  ["SOLEDAD", "VILLAMAYOR GUTIERREZ", "637380412", "", "", "Femenino", "5284"],
  ["LARA", "MUÑOZ", "670753158", "", "", "Femenino", "4500"],
  ["MIGUEL", "RODRIGUEZ SANCHEZ", "676231368", "", "2002-12-31", "Femenino", "3380"],
  ["MARIA", "REY LOPEZ", "636246817", "", "1974-09-30", "Femenino", "2728"],
  ["OLGA", "SANCHEZ MARTINEZ", "649659533", "", "", "Femenino", "4203"],
  ["CAROLINA", "ROJAS", "634062834", "", "", "Femenino", "5283"],
  ["TERESA", "MORIN VICENTE", "649793512", "", "", "Femenino", "4902"],
  ["JULIA", "MARIA DACOSTA BELISARIO", "603475871", "", "", "Femenino", "2130"],
  ["DIEGO", "OLMO", "635212636", "", "", "Masculino", "3725"],
  ["NAIRA", "CABRA", "669902557", "", "", "Femenino", "4984"],
  ["MANUEL", "BAEZA GALVEZ", "605792468", "", "", "Femenino", "4655"],
  ["PATRICIA", "MANTECA", "630287322", "", "", "Femenino", "3853"],
  ["VICTOR", "MEDINA DE LA OLIVA", "691445352", "", "", "Masculino", "2410"],
  ["SUMANT", "PALORKAR", "685756566", "", "", "Masculino", "4415"],
  ["YAGO", "DELGADO SANCHEZ", "617524661", "", "", "Femenino", "3446"],
  ["KIRO", "SANCHEZ LOPEZ", "686984606", "", "", "Femenino", "3054"],
  ["DIANA", "BROCH", "683529313", "", "", "Femenino", "4782"],
  ["BASTIAN", "GARCIA LOPEZ", "646033240", "", "", "Femenino", "3963"],
  ["NATALIA", "LUMI", "649856750", "", "", "Femenino", "5059"],
  ["ALEIX", "VOLALLOS BOLILLA", "651566333", "", "", "Masculino", "3241"],
  ["CRISTINA", "LOPEZ APARICIO", "665537895", "", "1986-08-04", "Femenino", "52"],
  ["ARGENTINA", "ROB", "642303644", "", "", "Femenino", "3581"],
  ["NAHIA", "HERNANDEZ PANADERO", "691839245", "", "", "Femenino", "4990"],
  ["PANADERO", "GARCIA ITZIAR", "691839245", "", "", "Femenino", "4986"],
  ["MARIO", "PARIS MARTINEZ", "636833464", "", "2012-04-14", "Femenino", "2969"],
  ["LAURA", "MERINO GARCIA", "669064627", "", "", "Femenino", "2695"],
  ["SOFIA", "CACHO CAMARAS", "653856024", "", "", "Femenino", "4144"],
  ["IVAN", "ROSADO GARCIA", "679664446", "", "", "Femenino", "4927"],
  ["VERA", "JIMENO", "680854924", "", "", "Femenino", "4891"],
  ["ANA", "AREBALOS DURAN", "652431832", "", "", "Femenino", "4890"],
  ["PILAR", "SERRANO CARMONA", "606284251", "", "", "Femenino", "3716"],
  ["ROCIO", "RODRIGUEZ", "666042571", "", "2014-07-02", "Femenino", "3101"],
  ["INES", "ALBARRACIN", "637308125", "", "", "Femenino", "4014"],
  ["EDUARDO", "MORENO", "612511635", "", "", "Femenino", "4885"],
  ["EDEN", "GUERRA", "663950897", "", "", "Femenino", "5025"],
  ["MARCOS", "DIEZ ROBLES", "649972055", "", "", "Masculino", "3795"],
  ["CELSO", "FERRO GALIANO", "610020317", "", "2015-05-15", "Femenino", "2654"],
  ["ARANCHA", "OLAZABAL", "657300383", "", "", "Femenino", "3691"],
  ["ARTURO", "CAÑAS GONZALEZ", "615234534", "", "", "Masculino", "3204"],
  ["ELIA", "BERMEJO RIVEIRA", "609752440", "", "", "Femenino", "4062"],
  ["ARIA", "AMADOR VARTOLOME", "661063787", "", "", "Femenino", "4746"],
  ["MARIA", "BARROSO", "663686041", "", "", "Femenino", "4744"],
  ["JULIA", "ARIAS", "659136024", "", "", "Femenino", "4646"],
  ["MARGARITA", "ROMO", "670685570", "", "", "Femenino", "4777"],
  ["JUAN", "SANCHEZ MONGE", "677660147", "", "", "Masculino", "2806"],
  ["IRENE", "BERNARDO DE QUIROS", "650562566", "", "", "Femenino", "4741"],
  ["ABEL", "FREITAS FERNANDEZ", "656939685", "", "", "Masculino", "3658"],
  ["RAQUEL", "TERNERO", "600025254", "", "", "Femenino", "4977"],
  ["GABRIEL", "ROMERO RIVAS", "648653479", "", "", "Femenino", "4280"],
  ["ERIK", "ANTELO", "660454889", "", "", "Masculino", "4770"],
  ["DAVID", "PRIETO", "659481281", "", "", "Masculino", "2672"],
  ["MARISOL", "CORDOVILLA", "661870538", "", "", "Femenino", "4798"],
  ["MARCOS", "TORRES GARCIA", "600857452", "", "2014-02-24", "Masculino", "2779"],
  ["NAIA", "LOPEZ MARTINEZ", "677580051", "", "", "Femenino", "5093"],
  ["ERIK", "PECES", "678534971", "", "", "Femenino", "4071"],
  ["MIRANDA", "ISABELLA", "603475871", "", "", "Femenino", "3670"],
  ["MARTA", "GHORBAMKHANI", "697689394", "", "", "Femenino", "4780"],
  ["ALBA", "ROMERO SANCHEZ", "678759548", "", "2006-10-10", "Femenino", "2914"],
  ["LIDIA", "OLIVEROS", "618819600", "", "", "Femenino", "4373"],
  ["OLAYA", "ROYUELA", "628465262", "", "", "Femenino", "3667"],
  ["MARIA", "SAEZ DAVILA", "679260215", "", "", "Femenino", "4228"],
  ["DIEGO", "CACHO CAMARA", "653856024", "", "", "Masculino", "3762"],
  ["CELIA", "SANTIAGO", "680209344", "", "", "Femenino", "3689"],
  ["ELENA", "JEREZ DEL OLMO", "680205505", "", "2018-02-10", "Femenino", "2905"],
  ["DASHA", "URTIAGA", "616688805", "", "", "Femenino", "4946"],
  ["SUSANA", "SCHAAD", "651695342", "", "", "Femenino", "4546"],
  ["ALEXIA", "PERALTA GONZALEZ", "600048982", "", "", "Femenino", "3300"],
  ["CARLA", "ATENA", "686867681", "", "", "Femenino", "4128"],
  ["DIEGO", "RODRIGUEZ DIAZ", "619410217", "", "", "Femenino", "3378"],
  ["CARLA", "TENA", "686867681", "", "", "Femenino", "4911"],
  ["ADRIAN", "NAVAS", "699835903", "", "", "Femenino", "3034"],
  ["SOFIA", "LOGROÑO DIAZ FLORES", "650940897", "", "", "Femenino", "2647"],
  ["NURIA", "REY BARRERA", "630686987", "", "", "Femenino", "4247"],
  ["JORGE", "GARCIA RODRIGUEZ", "658488832", "", "", "Masculino", "4458"],
  ["CIRO", "CLAVERO", "600284484", "", "", "Masculino", "4599"],
  ["ALEJANDRA", "COCCOLO", "676201765", "", "", "Femenino", "4514"],
  ["NOA", "MOYANO GUZMAN", "655371458", "", "", "Femenino", "4452"],
  ["YAGO", "RAMOS VARCACE", "660320608", "", "", "Masculino", "3698"],
  ["JESUS", "PLANEYES", "676016732", "", "", "Femenino", "4369"],
  ["PAULA", "AVILLEIRA BELINCHON", "626849523", "", "", "Femenino", "3491"],
  ["MARTIN", "LORDEN", "606683375", "", "", "Femenino", "2729"],
  ["LUCAS", "DIAZ SANZ", "685384520", "", "", "Femenino", "4384"],
  ["FIRO", "CLAVEL", "600284484", "", "", "Masculino", "4088"],
  ["LIDIA", "BOTA", "687142798", "", "", "Femenino", "3526"],
  ["ALEJANDRA", "FERNANDEZ", "637550438", "", "", "Femenino", "4513"],
  ["IKER", "NARANJO", "629118638", "", "", "Masculino", "2702"],
  ["BLANCA", "PADIN", "608244927", "", "", "Femenino", "3316"],
  ["ALEJANDRO", "DE LA ROSA", "635120708", "", "", "Masculino", "4258"],
  ["SARA", "BARRIDO", "647698120", "", "", "Femenino", "4623"],
  ["BELEN", "MEDEL RUIZ", "687957144", "", "", "Femenino", "3874"],
  ["MATEO", "MARTIN BALLENCO", "629014133", "", "", "Femenino", "4257"],
  ["AMALIA", "ROJAS", "674249892", "", "", "Femenino", "4317"],
  ["JAVIER", "ARCONES HERNANDEZ", "686351660", "", "1970-01-17", "Masculino", "447"],
  ["SARA", "SANTOS GARCIA", "667431489", "", "", "Femenino", "2875"],
  ["VALIE", "MAESTRO", "617650964", "", "", "Femenino", "4403"],
  ["VEGA", "FERNANDEZ AL PUENTE", "654095019", "", "", "Femenino", "4313"],
  ["ROI", "VAZQUEZ", "648518438", "", "", "Masculino", "4312"],
  ["MATEO", "PECES CERRADA", "678534971", "", "", "Femenino", "3408"],
  ["SARA", "MUÑIZ LOPEZ", "605185953", "", "", "Femenino", "4568"],
  ["SOFIA", "RUIZ", "687142798", "", "", "Femenino", "4448"],
  ["ALMUDENA", "RUIZ MATABUENA", "636692761", "", "", "Femenino", "1252"],
  ["EDUARDO", "SUAREZ", "658512042", "", "", "Femenino", "4705"],
  ["CARLOS", "SANCHEZ CUADRADO", "628086423", "", "", "Femenino", "4657"],
  ["ERIKA", "VERNAL MAGRO", "646761693", "", "", "Femenino", "4056"],
  ["MOLI", "", "636583649", "", "", "Femenino", "4508"],
  ["DIEGO", "HERRERO SIERRA", "675077289", "", "", "Masculino", "3343"],
  ["NADIA", "ARCONES", "667567536", "", "", "Femenino", "2745"],
  ["IAN", "PEDRAZA SANCHEZ", "669861274", "", "", "Femenino", "4142"],
  ["LUK", "SAN JUAN", "630100234", "", "", "Femenino", "2899"],
  ["PATRICIA", "HIDALGO", "638750961", "", "", "Femenino", "4507"],
  ["ANGELINES", "PEREZ", "665108686", "", "", "Femenino", "4442"],
  ["JUAN", "ARIAS MADRIGAL", "658890195", "", "2010-08-11", "Femenino", "3003"],
  ["ROCIO", "NAVAS FERNANDEZ", "699835903", "", "2011-11-13", "Femenino", "2827"],
  ["AITOR", "COCA", "659071636", "", "", "Masculino", "4622"],
  ["MAXIMILIANO", "SANOJA", "673300530", "", "", "Femenino", "4582"],
  ["SERGIO", "ROYUELA", "628465262", "", "", "Masculino", "3467"],
  ["NICOLAS", "MERINO GARCIA", "669064627", "", "", "Femenino", "2028"],
  ["AMOR", "KATZ", "691509277", "", "", "Femenino", "3572"],
  ["MIRIAM", "EXTREMIADA FERNANDEZ", "686128431", "", "", "Femenino", "4396"],
  ["AURORA", "DIAZ NOGALES", "680209344", "", "", "Femenino", "3981"],
  ["RHIONA", "BRUDILILL", "665602042", "", "", "Femenino", "3837"],
  ["VERONICA", "TORRES ARTEAGA", "676928194", "", "", "Femenino", "4359"],
  ["SINA", "RUIZ BROXTON", "606946633", "", "", "Femenino", "4358"],
  ["UXIA", "SANDE MARTINEZ", "608645946", "", "1974-09-08", "Femenino", "1477"],
  ["DAVID", "FERNANDEZ ALVAREZ", "626014158", "", "", "Femenino", "4543"],
  ["NOA", "TEROL JOGA", "665108686", "", "", "Femenino", "4306"],
  ["CRISTINA", "LOPEZ SANGUINO", "635822562", "", "", "Femenino", "4439"],
  ["MARTA", "DIAZ ATIENZA", "628112444", "", "", "Femenino", "3988"],
  ["ARANCHA", "ALVAREZ FARIÑAS", "692186391", "", "", "Femenino", "1109"],
  ["AITOR", "MARKEL", "655787111", "", "", "Femenino", "4201"],
  ["PABLO", "GARCIA ROMERO", "606308790", "", "", "Masculino", "3097"],
  ["ROSA", "RODRIGUEZ SANCHEZ", "696895990", "", "", "Femenino", "3659"],
  ["EYNAR", "MORERA DEL AMA", "646976119", "", "", "Femenino", "3910"],
  ["BASIAN", "GARCIA", "646033240", "", "", "Femenino", "3872"],
  ["CATALINA", "GUERRA", "696992337", "", "", "Femenino", "3811"],
  ["MARCOS", "DE LARRAFABAL", "606991119", "", "", "Masculino", "3273"],
  ["DOLORES", "REGO", "678474103", "", "", "Femenino", "4010"],
  ["PAULA", "CANOURA", "654176711", "", "2009-06-07", "Femenino", "2599"],
  ["MARIO", "ESCARABAJAL", "646611987", "", "", "Femenino", "3841"],
  ["ROSA MARIA", "MARTIN", "629467995", "", "", "Femenino", "3842"],
  ["IZAN", "MALPARTIDA", "666612437", "", "", "Femenino", "3405"],
  ["MANUEL", "RIOSS", "646054197", "", "", "Femenino", "3839"],
  ["MARTINA", "LUZON GABIN", "625769825", "", "2022-03-26", "Femenino", "3838"],
  ["ABRIL", "RAMOS", "660320608", "", "", "Femenino", "4145"],
  ["PAULA", "GODOQUE", "669786613", "", "", "Femenino", "2674"],
  ["ANTONIO", "VALLE LOPEZ", "660262784", "", "", "Femenino", "3549"],
  ["DANIEL", "GALVEZ GOMEZ", "645195512", "", "", "Femenino", "3964"],
  ["LORENA", "CABELLO", "635211296", "", "", "Femenino", "3919"],
  ["SARA", "ALAMEDA RECIO", "609669448", "", "", "Femenino", "2726"],
  ["MARA", "LOPEZ GARCIA-CONSUEGRA", "650267930", "", "", "Femenino", "2766"],
  ["MANUEL", "RIOS", "646054197", "", "2013-07-15", "Masculino", "2624"],
  ["SARA", "CARRASCO TORREJON", "676401109", "", "", "Femenino", "3904"],
  ["CARLA", "HENA BONITLLA", "686867681", "", "", "Femenino", "3808"],
  ["MARTA", "AVIGEIRA BELINCHON", "626849523", "", "", "Femenino", "4171"],
  ["EVA", "JEDERKO", "610059113", "", "", "Femenino", "4090"],
  ["CLAUDIA", "SARCO", "666246110", "", "", "Femenino", "3868"],
  ["MERCE", "SANCHEZ SANZ", "636605356", "", "", "Femenino", "3834"],
  ["SARA", "CUESTA BARRAJON", "660858847", "", "", "Femenino", "4109"],
  ["DAVID", "BARRIOS", "650626888", "", "", "Masculino", "3381"],
  ["CARLA", "FERNANDEZ BRIHUEGA", "662220059", "", "", "Femenino", "4002"],
  ["MARIA", "GRACIA MORENO", "648104200", "", "", "Femenino", "3866"],
  ["EVA", "HERNANZ MARTIN", "667725886", "", "", "Femenino", "3100"],
  ["MANUEL", "CESPEDES JIMENEZ", "603890217", "", "", "Femenino", "3943"],
  ["AITOR", "AIZTOLEA ALLENDEZ", "618125474", "", "", "Masculino", "3052"],
  ["JOEL", "ALAMO", "606893431", "", "", "Masculino", "3830"],
  ["DANIEL", "GALVEZ", "645195512", "", "2019-07-16", "Femenino", "3473"],
  ["MARIA LUZ", "RIVERO GARCIA", "656564550", "", "", "Femenino", "3528"],
  ["MARIA ELENA", "CACERES", "668568448", "", "", "Femenino", "3428"],
  ["PATRICIA", "GETAFE ABAD", "637733757", "", "1977-11-28", "Femenino", "897"],
  ["DANIEL", "GARCIA DE FRUTOS", "661639350", "", "", "Femenino", "3419"],
  ["HUGO", "RELLO MUÑOZ", "655186717", "", "", "Masculino", "2846"],
  ["MARIA", "CESPEDES", "603890217", "", "", "Femenino", "3524"],
  ["CARLOS", "VERGARA", "626696990", "", "", "Masculino", "3527"],
  ["CONNOR", "GARCIA LOPEZ", "646033240", "", "2019-04-29", "Masculino", "3270"],
  ["INDIA", "MAESTRO", "626944584", "", "", "Femenino", "2907"],
  ["DAVID", "SALMERON SERRANO", "687701363", "", "", "Masculino", "2073"],
  ["DOLORES", "REGU", "678474103", "", "", "Femenino", "3554"],
  ["JOSE", "LUIS LOPEZ MARTIN", "678665000", "", "1975-04-10", "Masculino", "721"],
  ["CARLOS", "BERGARA PEREZ", "626696990", "", "2010-07-02", "Masculino", "2917"],
  ["MARENA", "PASCUAL CHACIN", "627150088", "", "2012-04-17", "Femenino", "2897"],
  ["MARTINA", "GIL CORDON", "616448210", "", "", "Femenino", "1824"],
  ["CELIA", "DACOSTA", "603475871", "", "", "Femenino", "3681"],
  ["AIDE", "ALIAS FLORES", "654178455", "", "2013-06-27", "Femenino", "3460"],
  ["ENZO", "CID", "620197407", "", "", "Masculino", "3413"],
  ["MIGUEL", "LOPEZ EPEJOS GABREDAS", "654429007", "", "", "Femenino", "1624"],
  ["MARIA", "PARRALEJO", "658961092", "", "", "Femenino", "3677"],
  ["ASIER", "GONZALEZ", "630212717", "", "", "Masculino", "3597"],
  ["GABRIELA", "FERNANDEZ DEL PINO", "655326440", "", "2005-10-10", "Femenino", "2577"],
  ["SERGIO", "SALMERON PALOMAR", "687701363", "", "2011-10-02", "Masculino", "2888"],
  ["ENRIQUE", "BAREIRO", "647651845", "", "2010-08-21", "Femenino", "3349"],
  ["INES", "SANCHEZ GARCIA", "625760535", "", "", "Femenino", "3724"],
  ["LAIA", "CHIMENO REDONDO", "646677789", "", "", "Femenino", "3676"],
  ["ADRIANA", "SUAREZ", "606285227", "", "", "Femenino", "3671"],
  ["MARCOS", "BLANCO", "657305473", "", "", "Femenino", "3595"],
  ["LUCIA", "MUÑOZ LUNA", "678894534", "", "", "Femenino", "3668"],
  ["RAUL", "BARRIOS", "650626888", "", "", "Femenino", "3592"],
  ["JAVIER", "GUIJARRO ZAZO", "622118788", "", "1985-01-31", "Masculino", "3452"],
  ["CARMEN", "ROCAFUL PODEROSO", "678439130", "", "", "Femenino", "3369"],
  ["ANA", "PEDRAZA", "654918123", "", "", "Femenino", "3747"],
  ["JORGE", "GARCIA ROJO", "637576995", "", "", "Femenino", "3748"],
  ["CRISTIAN", "SANCHEZ LOPEZ", "666321981", "", "1985-03-01", "Masculino", "169"],
  ["HARES", "CAMACHO", "665397448", "", "", "Femenino", "3504"],
  ["ALVARO", "CORREAL", "659678763", "", "", "Masculino", "3055"],
  ["LAURA", "GOMEZ DEL AMO", "630948915", "", "2009-07-20", "Femenino", "2876"],
  ["UNAI", "GUTIERRES", "628282849", "", "", "Masculino", "3440"],
  ["AMELIA", "ALVAREZ", "616294313", "", "", "Femenino", "3364"],
  ["MONICA", "PEREZ DIZ", "625197481", "", "", "Femenino", "3039"],
  ["MATEO", "BUENO", "607926849", "", "", "Femenino", "3657"],
  ["ENMA", "MARTINEZ VAZQUEZ", "659911915", "", "", "Femenino", "3660"],
  ["ANA", "SINCIAS", "606285227", "", "", "Femenino", "3563"],
  ["MARIA", "MARTINPOZUELO MORA", "645945281", "", "", "Femenino", "3362"],
  ["MARIA", "NIÑO", "651115215", "", "", "Femenino", "2603"],
  ["AMALIA", "GARCIA DE MIRASIERRA", "645780683", "", "", "Femenino", "311"],
  ["MAYA", "RICOTE OLMEDO", "620792541", "", "2009-07-31", "Femenino", "2980"],
  ["MARIO", "SANCHEZ NAVARRO", "652642754", "", "2017-01-16", "Masculino", "2891"],
  ["LIAM", "LOPEZ GARCIA-CONSUEGRA", "650267930", "", "", "Masculino", "2707"],
  ["ALMUDENA", "MOLINA", "661990644", "", "", "Femenino", "2976"],
  ["IRIA", "DEL CASTILLO GARCIA", "645880905", "", "2016-12-15", "Femenino", "2889"],
  ["ALVARO", "GALINDO", "626814147", "", "", "Masculino", "2696"],
  ["MARTINA", "ORTEGA", "662460183", "", "", "Femenino", "3096"],
  ["NICOLAS", "ALFAGEMI", "649926857", "", "", "Masculino", "2673"],
  ["NICOLAS", "FERNANDEZ GALLARDO", "651583908", "", "", "Femenino", "2785"],
  ["ALEY", "BOLAÑOS BONILLA", "651566333", "", "2012-08-14", "Masculino", "2679"],
  ["ALMA", "PAIS MARTIN", "627424187", "", "2015-12-18", "Femenino", "2681"],
  ["IKER", "CARRASCO", "600368628", "", "2017-04-26", "Femenino", "2661"],
  ["ROCIO", "NIÑA COMUNION", "699835903", "", "", "Femenino", "2881"],
  ["MARIO", "NIÑO", "671648212", "", "", "Femenino", "2580"],
  ["ZADITH", "HUERTO GRAP", "661414727", "", "", "Femenino", "3264"],
  ["HUGO", "Y VEGA", "695593007", "", "", "Masculino", "2742"],
  ["EVA", "GEA", "699772774", "", "", "Femenino", "3028"],
  ["GENEROSA", "FERNANDEZ NUÑEZ", "630313651", "", "", "Femenino", "2960"],
  ["SOCORRO", "FUNE FUNE", "677212048", "", "", "Femenino", "3155"],
  ["MIGUEL", "RABINA", "675525629", "", "", "Femenino", "3157"],
  ["ARANCHA", "VINCEL", "673795339", "", "", "Femenino", "3078"],
  ["ROCIO", "CLEMENTE SOTO", "616639672", "", "2008-02-01", "Femenino", "2597"],
  ["RAFAEL", "FERNANDEZ ORTIZ", "677432799", "", "", "Femenino", "3077"],
  ["XIONA", "HERNANDEZ EXPOSITO", "617991973", "", "", "Femenino", "2059"],
  ["CARLA", "GORDILLO RIVERA", "633115160", "", "1991-09-02", "Femenino", "1102"],
  ["MONTSE", "HERREROS MARTINEZ", "655210239", "", "1980-04-20", "Femenino", "1779"],
  ["PASCUAL", "JAVIER RUIZ BENITEZ", "697847807", "", "1988-01-27", "Masculino", "1090"],
  ["JAVIER", "MORADEIRA NUÑEZ", "650227663", "", "", "Masculino", "968"],
  ["VANESA", "CHINARRO PEREZ", "655092064", "", "1989-12-20", "Femenino", "111"],
  ["MARIA", "FERNANDEZ BLANCO", "630212717", "", "1978-11-02", "Femenino", "1005"],
  ["FELIX", "DE PABLO", "680163333", "", "1958-08-30", "Masculino", "68"],
  ["PATRICIA", "RIVAS BOMBERO", "686066982", "", "", "Femenino", "1123"],
  ["VICTOR", "DOBRE", "610571065", "", "", "Femenino", "747"],
  ["CARMEN", "", "622182789", "", "", "Femenino", "5309"],
  ["LUCIA", "OLIVER", "672128490", "", "", "Femenino", "5313"],
  ["OLIVIA", "TOCCI", "651881043", "", "", "Femenino", "5310"],
  ["ALEJANDRA", "SARRASI", "629472651", "", "", "Femenino", "5258"],
  ["NOELIA", "CALVO DOMÍNGUEZ", "672140166", "", "", "Femenino", "5209"],
  ["MAR", "RUIZ TORRES", "663194280", "mariadelmar.ruiz.torres@gmail.com", "", "Femenino", "5282"],
  ["ALBA", "CORRAL SAN JOSÉ", "652598939", "", "", "Femenino", "5292"],
  ["VERONICA", "DELGADO", "610714900", "", "", "Femenino", "4055"],
  ["SARA", "BLANCO ROSAS", "630313651", "", "", "Femenino", "2961"],
  ["DIANA", "GARCIA ASEBEDO", "631005471", "", "", "Femenino", "5111"],
  ["DANI", "", "639200595", "", "", "Femenino", "2602"],
  ["ARINA", "NICOLAEV", "659838477", "", "", "Femenino", "3836"],
  ["ALEJANDRA", "GUITIERREZ", "600631842", "", "", "Femenino", "4364"],
  ["ARRIONA", "", "665602042", "", "", "Femenino", "4400"],
  ["ARIADNA", "SANZ", "629129909", "", "", "Femenino", "4445"],
  ["SORAYA", "VIDAL", "600832451", "", "", "Femenino", "3552"],
  ["KAMILIA", "", "695605002", "", "", "Femenino", "3540"],
  ["LUCIA", "TRUJILLO", "690298525", "", "", "Femenino", "3071"],
  ["JESUS", "DE FRANCISCO", "658219802", "", "", "Masculino", "4658"],
  ["PAULA", "AGUADET", "693329729", "", "", "Femenino", "4764"],
  ["KAIZEN", "", "681274773", "", "", "Femenino", "3989"],
  ["MARIA", "CANTERO", "687581255", "", "", "Femenino", "2927"],
  ["MERCEDES", "BARBERO GOMEZ", "669786613", "", "", "Femenino", "4933"],
  ["IRIA", "NIÑA", "687930020", "", "", "Femenino", "2656"],
  ["CARLOTA", "HORMIGOS KUNA", "659332232", "", "", "Femenino", "5005"],
  ["PATRICIA", "GUZMAZ MARTINEZ", "601202596", "", "", "Femenino", "2622"],
  ["ANTONELA", "VIERMA", "603475871", "", "", "Femenino", "5318"],
  ["ADRIAN", "RODRIGUEZ MAROTO", "686611061", "", "2005-09-30", "Masculino", "143"],
  ["JAVIER", "OJERA", "655462387", "", "", "Femenino", "210"],
  ["ALEJANDRO", "RAMIREZ FERNANDEZ", "620224183", "", "", "Masculino", "252"],
  ["MARTA", "SANCHEZ TOMÉ", "626577398", "", "1983-10-19", "Femenino", "369"],
  ["NURIA", "SANCHEZ HERRERA", "616105062", "", "", "Femenino", "399"],
  ["LUISA", "PEIRO CONSTANT", "606276853", "", "", "Femenino", "413"],
  ["SILVIA", "CANO CASADO", "696715617", "", "1977-01-11", "Femenino", "426"],
  ["JAVIER", "CARRASCO SUBIELA", "630674235", "", "1975-09-16", "Masculino", "450"],
  ["YOLANDA", "AGUADO CARAVACA", "669649550", "", "", "Femenino", "467"],
  ["JOSE", "LUIS ALONSO ABAD", "655582748", "", "1990-11-23", "Femenino", "513"],
  ["JOHANA", "CORTES GALLEGO", "628037033", "", "1988-06-04", "Femenino", "626"],
  ["JUAN", "MCDUFFEE", "651103326", "", "1964-07-02", "Masculino", "646"],
  ["CARLOS", "VALS BALLESTIN", "610745050", "", "1985-11-03", "Masculino", "697"],
  ["IÑIGO", "DE LA VERA LORENZO", "650559547", "", "1981-12-29", "Femenino", "804"],
  ["AMELIA", "GABLI BAKKRHLI", "695605002", "", "", "Femenino", "831"],
  ["JOSE", "CELDRAN BONAFONTE", "646160629", "", "1984-06-18", "Femenino", "836"],
  ["IRENE", "MARCO PEREZ", "628716078", "", "1992-10-19", "Femenino", "839"],
  ["ARKAITZ", "OBREGON", "685765230", "", "", "Femenino", "932"],
  ["MARTA", "HERNADEZ CALVO", "686408133", "", "1978-07-25", "Femenino", "943"],
  ["INES", "LOZA LOZANO", "666217537", "", "1980-11-30", "Femenino", "963"],
  ["BEGOÑA", "LOZANO MARTIN", "645378369", "", "1981-05-20", "Femenino", "1006"],
  ["MIRTA", "PEREZ", "638941104", "", "", "Femenino", "1048"],
  ["AMAYA", "CLIMENT AGUDO", "626156982", "", "1983-06-05", "Femenino", "1091"],
  ["ALBERTO", "FERNANDO FERNANDEZ", "626924749", "", "", "Masculino", "1096"],
  ["PALOMA", "BARROSO", "605248763", "", "", "Femenino", "1160"],
  ["LURDES", "LANGA JIMENEZ", "649453514", "", "", "Femenino", "1349"],
  ["DANIEL", "PAGE REAL", "661039571", "", "", "Femenino", "1365"],
  ["MARTA", "YEBRA GARCIA", "653407153", "", "1972-04-21", "Femenino", "1406"],
  ["ALEJANDRO", "BAÑOS", "609517385", "", "", "Masculino", "1478"],
  ["LEONOR", "MORALES LOPEZ", "626472242", "", "2039-12-09", "Femenino", "1493"],
  ["DAVID", "MARTIN MANZANARES", "645439140", "", "", "Masculino", "1551"],
  ["CELIA", "CHINARRO PANADERO", "647894565", "", "1992-10-08", "Femenino", "1617"],
  ["NIEVES", "SANCHEZ GALLEGO", "676352933", "", "1950-11-08", "Femenino", "1690"],
  ["NATALIA", "BALLEJO HERNANDEZ", "620006105", "", "", "Femenino", "1695"],
  ["SILVIA", "SANCHEZ DE PABLO GARCIA", "680436451", "", "1978-11-24", "Femenino", "1700"],
  ["CANDELA", "BELLIDO ALONSO", "646161976", "", "", "Femenino", "1734"],
  ["MARIA DEL PILAR", "BAYATA VILLA", "676191453", "", "1985-07-10", "Femenino", "1746"],
  ["LAURA", "SENDINO BRAVO", "639163509", "", "1981-06-27", "Femenino", "1748"],
  ["ESTRELLA", "RECIO PERDOMO", "699944317", "", "", "Femenino", "1882"],
  ["HECTOR", "SANTOS JIMENEZ", "635150033", "", "", "Masculino", "2021"],
  ["ELENA", "GARCIA RIVAS", "686653076", "", "1979-06-15", "Femenino", "2034"],
  ["CARLOS", "DIEZ AL FARO", "610851335", "", "1981-10-14", "Masculino", "2086"],
  ["LAURA", "ALONSO MURILLO", "606671201", "", "1990-01-14", "Femenino", "2125"],
  ["JOSE", "MANUEL ARTEHAGA", "609706752", "", "", "Masculino", "2219"],
  ["NOA", "LEON FERNANDEZ", "646322482", "", "2007-02-16", "Femenino", "2230"],
  ["PABLO", "RUIZ TERCERO", "699422180", "", "2007-10-28", "Masculino", "2244"],
  ["JUSTINA", "SUTARZ", "616074713", "", "1971-07-10", "Femenino", "2264"],
  ["ITZER", "VELASCO", "606899233", "", "", "Femenino", "2270"],
  ["JOSE", "FARCO", "647168318", "", "", "Femenino", "2301"],
  ["ALICIA", "SAIZ CRUZADO", "630030091", "", "2013-01-17", "Femenino", "2325"],
  ["DARIO", "SAIZ CRUZADO", "630030091", "", "2010-05-20", "Masculino", "2326"],
  ["CANDELA", "BRAVO SARAVIA", "608184890", "", "1996-10-29", "Femenino", "2362"],
  ["DAVID", "BOURAT MARTIN", "636736784", "", "", "Masculino", "2395"],
  ["HEIDI", "NUOREAM", "646356202", "", "", "Femenino", "2404"],
  ["ANA", "SANTOS JIMENEZ", "635150033", "", "", "Femenino", "2449"],
  ["AROA", "VELAYOS FONTANA", "658304964", "", "2008-05-08", "Femenino", "2475"],
  ["CRISTINA", "HIGUERAS PEREZ", "615133889", "", "", "Femenino", "2519"],
  ["EVA", "FRESCO GARCIA", "630836440", "", "", "Femenino", "2552"],
  ["ALEJANDRO", "MARTIN CARPALLO", "617095992", "", "2017-11-24", "Masculino", "2590"],
  ["JULIO", "JIMENO MORAN", "680854924", "", "", "Femenino", "2595"],
  ["NICO", "FERNANDEZ GALLARDO", "651583908", "", "2017-05-26", "Masculino", "2600"],
  ["HECTOR", "Y DIEGO HERRERO", "675077289", "", "", "Femenino", "2610"],
  ["LEO", "SANCHEZ GIL PEREZ", "647221855", "", "2014-07-10", "Masculino", "2611"],
  ["ALEX", "CUBERO", "664122730", "", "", "Masculino", "2613"],
  ["ALBA", "MORENATE HERNANDEZ", "686408133", "", "", "Femenino", "2620"],
  ["INES", "ARIAS MADRIGAL", "658890195", "", "2009-05-08", "Femenino", "2637"],
  ["SERGIO", "CUMPLIDO REBOLLO", "650972059", "", "2008-09-19", "Masculino", "2649"],
  ["SARA", "PEREZ RODDRIGUEZ", "686507989", "", "1987-03-02", "Femenino", "2652"],
  ["DANIEL", "FERNANDEZ SANCHEZ", "650588657", "", "2010-08-13", "Femenino", "2653"],
  ["INES", "MEDINO NIÑA", "653178482", "", "", "Femenino", "2657"],
  ["MARTIN", "CAO VIDAL", "636006628", "", "", "Femenino", "2660"],
  ["ALEX", "CUBERO NIÑO", "664122730", "", "", "Femenino", "2663"],
  ["LUCAS", "FERNANDEZ CASTILLO", "618024462", "", "2018-02-05", "Masculino", "2665"],
  ["VALERIA", "PERALTA GONZALEZ", "600048982", "", "2012-07-07", "Femenino", "2667"],
  ["SAMUEL", "MORALES LOPEZ", "637327370", "", "", "Femenino", "2668"],
  ["LAURA", "SARRION", "647808243", "", "", "Femenino", "2675"],
  ["ANTONIO", "CABELLO GONZALEZ", "699849707", "", "2011-09-02", "Femenino", "2682"],
  ["ANDRES", "RODRIGUEZ BAYATA", "680274982", "", "2019-07-04", "Masculino", "2703"],
  ["ALVARO", "LOSADA MORENO", "615057035", "", "", "Femenino", "2712"],
  ["SERGIO", "SAN MERON", "687701363", "", "", "Masculino", "2713"],
  ["GONZALO", "PAVIN MARTINEZ", "608244927", "", "2019-03-07", "Masculino", "2714"],
  ["LUCIA", "VILLAMAYOR", "651308912", "", "", "Femenino", "2717"],
  ["LEIRE", "ROBLES", "669105746", "", "", "Femenino", "2740"],
  ["CLARA", "GALLEGO BURON", "635879631", "", "", "Femenino", "2741"],
  ["VEGA", "NARANJO GIL", "629118638", "", "", "Femenino", "2758"],
  ["CLARA", "LEDO SANCHEZ", "616105062", "", "", "Femenino", "2760"],
  ["CONOR", "GARCIA", "646033240", "", "", "Masculino", "2768"],
  ["LEO", "SANCHEZ GIL PEREZ", "647221855", "", "2014-07-10", "Femenino", "2769"],
  ["IRENE", "DEL BINO", "610908080", "", "", "Femenino", "2774"],
  ["DANIEL", "CAMACHO", "620006105", "", "2010-08-22", "Masculino", "2776"],
  ["ALEJANDRO", "GALAN SAINZ", "670678105", "", "2010-07-26", "Femenino", "2777"],
  ["HUGO", "EXPOSITO DEL COSO", "690647054", "", "2013-01-27", "Femenino", "2784"],
  ["MATEO", "MENDOZA LLORENTE", "686071163", "", "2018-07-07", "Femenino", "2787"],
  ["MARCO", "RAMOS", "628077733", "", "", "Femenino", "2788"],
  ["UNAI", "GONZALEZ BUENO", "637468885", "", "", "Masculino", "2796"],
  ["MARIO", "DURAN", "671648212", "", "", "Femenino", "2803"],
  ["SOFIA", "DE LA MORENA SANCHEZ", "626790253", "", "", "Femenino", "2822"],
  ["PALOMA", "DE FRUTOS", "628112444", "", "", "Femenino", "2828"],
  ["ADRIAN", "LOSADA MORENO", "615057035", "", "2015-11-02", "Masculino", "2833"],
  ["HECTOR", "HERRERO SIERRA", "675077289", "", "", "Masculino", "2840"],
  ["MARQUEL", "PINO MOTA", "655787111", "", "2018-01-31", "Masculino", "2851"],
  ["VICTORIA", "FERNANDEZ MONTES", "655326440", "", "2014-09-19", "Femenino", "2853"],
  ["MARTIN", "CAO VIDAL", "636006628", "", "2016-09-30", "Femenino", "2854"],
  ["BEATRIZ", "FABARATO", "616651884", "", "", "Femenino", "2856"],
  ["LEIRE", "CORRAL BERLANGA", "656991928", "", "", "Femenino", "2863"],
  ["ALEX", "ALAMO HERNANDEZ", "606893431", "", "2011-05-14", "Femenino", "2864"],
  ["VERA", "EGIDO", "650632144", "", "", "Femenino", "2868"],
  ["HUGO", "VARA SOLIANO", "695593007", "", "2016-02-25", "Femenino", "2878"],
  ["IZASCUN", "RODA", "630066636", "", "", "Femenino", "2886"],
  ["NOA", "DELGADO", "617524661", "", "2011-04-09", "Femenino", "2893"],
  ["NOA", "TEJEDOR NICOLAS", "686430011", "", "2009-09-21", "Femenino", "2898"],
  ["PAULA", "SANCHEZ NAVARRO", "652642754", "", "2012-10-13", "Femenino", "2902"],
  ["ENZO", "MANGEZ LOPEZ", "635822562", "", "", "Masculino", "2904"],
  ["ALEJANDRA", "MIGUELES", "666857767", "", "", "Femenino", "2909"],
  ["EVA", "MARIA GARCIA VELASCO", "637257323", "", "", "Femenino", "2919"],
  ["LUCIA", "ZAVALLOS", "671480925", "", "", "Femenino", "2922"],
  ["NOA", "ALIAS FLORES", "654178455", "", "2015-04-10", "Femenino", "2929"],
  ["GUILLERMO", "SUAREZ MARTINEZ", "658512042", "", "", "Femenino", "2932"],
  ["ALEJANDRO", "CABRA", "669902557", "", "2018-10-08", "Masculino", "2934"],
  ["DARIO", "CAO", "636006628", "", "", "Femenino", "2940"],
  ["MARIA", "PEREZ BODAS", "666787226", "", "", "Femenino", "2943"],
  ["LAURA", "GIL CALERO", "686537726", "", "", "Femenino", "2945"],
  ["DANIELA", "PEDRAZA YUSTE", "625477060", "", "2014-12-02", "Femenino", "2966"],
  ["MARC", "DIAZ GONZALEZ", "619594765", "", "2013-08-17", "Femenino", "2972"],
  ["HUGO", "MARTINEZ VAZQUEZ", "659911915", "", "2008-12-04", "Femenino", "2983"],
  ["DAVID", "GARCIA FERNANDEZ", "608202404", "", "", "Femenino", "2985"],
  ["ITZIAR", "CAMPELO GIL", "660699453", "", "2009-11-25", "Femenino", "2989"],
  ["JULIA", "MARIA LA COSTA", "603475871", "", "", "Femenino", "2992"],
  ["VERA", "Y JULIO", "680854924", "", "", "Femenino", "3006"],
  ["LUCAS", "GONZALEZ CUADRA", "656857821", "", "2013-11-18", "Femenino", "3022"],
  ["RODRIGO", "MORALES LOPEZ", "637327370", "", "2009-09-25", "Masculino", "3062"],
  ["ELMA", "PARIS MARTINEZ", "636833464", "", "2014-03-26", "Femenino", "3065"],
  ["RAUL", "HERRERO", "626013985", "", "", "Masculino", "3070"],
  ["HECTOR", "OLMO MALDONADO", "635212636", "", "2010-07-02", "Masculino", "3076"],
  ["MARTINA", "GIL CORDON", "616448210", "", "", "Femenino", "3081"],
  ["MARCOS", "MARTIN REVILLA", "636736784", "", "2010-08-03", "Masculino", "3110"],
  ["PAULA", "BENITO", "696753732", "", "", "Femenino", "3111"],
  ["PIERO", "GARRIDO", "661920578", "", "", "Masculino", "3121"],
  ["INES", "TREBILLO", "679015858", "", "2014-04-18", "Femenino", "3125"],
  ["SANTIAGO", "GUERRERO", "601419727", "", "", "Femenino", "3126"],
  ["IRENE", "VARELA MUÑOZ", "652574718", "", "1990-11-29", "Femenino", "3130"],
  ["MARIA", "MARTIN POZUELO MORA", "645945281", "", "2019-09-25", "Femenino", "3131"],
  ["NAIA", "CHIMENO REDONDO", "646677789", "", "", "Femenino", "3132"],
  ["TERESA", "PALOMAR", "687701363", "", "", "Femenino", "3143"],
  ["JAVIER", "AREAS MADRIGAL", "658890195", "", "", "Masculino", "3145"],
  ["VERA", "HEJIDO SUTIL", "650632144", "", "2017-07-21", "Femenino", "3148"],
  ["CANDELA", "LOPEZ DE MUNAIN", "647054066", "", "2011-11-17", "Femenino", "3149"],
  ["JUAN", "AREAS MADRIGAL", "658890195", "", "2010-08-11", "Femenino", "3150"],
  ["DARIO", "DIAZ", "636691175", "", "", "Femenino", "3151"],
  ["NOAM", "SAN JUAN", "630100234", "", "", "Femenino", "3163"],
  ["SERGIO", "GONZALEZ RODRIGUEZ", "629832000", "", "2003-10-06", "Femenino", "3166"],
  ["ALEJANDRA", "LOGROÑO DIAZ FLORES", "650940897", "", "2019-10-28", "Femenino", "3177"],
  ["HECTOR", "CABANILLAS CONTRERA", "652834334", "", "", "Femenino", "3188"],
  ["VICTOR", "GARCIA PERNIA", "699291403", "", "", "Masculino", "3197"],
  ["MARTIN", "HIJANA", "647612219", "", "", "Masculino", "3203"],
  ["ADELA", "COSTA", "679978833", "", "", "Femenino", "3208"],
  ["SOFIA", "CAÑAS GONZALEZ", "615234534", "", "2011-07-29", "Femenino", "3209"],
  ["SECUNDINO", "HACES LLANES", "634970739", "", "", "Femenino", "3210"],
  ["SAUL", "ROMAN ALVAREZ", "659305733", "", "", "Femenino", "3236"],
  ["LAURA", "VELILLAS CORDONES", "675525629", "", "", "Femenino", "3242"],
  ["VICTOR", "JUANAS", "647648231", "", "", "Femenino", "3258"],
  ["DIANA", "", "617524661", "", "", "Femenino", "3259"],
  ["JAVI", "LOPEZ ESPEJO", "654429007", "", "2011-07-27", "Femenino", "3280"],
  ["ALICIA", "MONTEMAYOR GUTIERREZ", "630673669", "", "", "Femenino", "3285"],
  ["DIEGO", "RODRIGUEZ GUITIAN", "620729179", "", "2014-03-23", "Femenino", "3287"],
  ["VICTOLR", "MELISA", "649627807", "", "", "Femenino", "3298"],
  ["PAULA", "BARREIRO FERNANDEZ", "647651845", "", "", "Femenino", "3301"],
  ["ALVARO", "LA BELLA DE LA TORRE", "666898900", "", "", "Femenino", "3309"],
  ["ASIER", "RODRIGUEZ LARGO", "676809094", "", "", "Masculino", "3323"],
  ["JORGE", "JIMENEZ", "691412618", "", "", "Masculino", "3328"],
  ["ALBA", "LABRADAS", "610687123", "", "", "Femenino", "3340"],
  ["CARLA", "VILLANUEVA DAVIES", "646619259", "", "", "Femenino", "3348"],
  ["IRENE", "FERNANDEZ DE QUIROS", "650562566", "", "", "Femenino", "3358"],
  ["HUGO", "MARTIN OSMA", "665388096", "", "2020-01-17", "Femenino", "3360"],
  ["CARLA", "SANCHEZ SALDANA", "690641239", "", "", "Femenino", "3365"],
  ["CARMEN", "PASTOR", "620397551", "", "", "Femenino", "3386"],
  ["MARTIN", "GONZALEZ", "647612219", "", "", "Femenino", "3390"],
  ["LIDIA", "SANZ", "653984054", "", "", "Femenino", "3392"],
  ["CRISTINA", "DEL RIO", "651151724", "", "", "Femenino", "3396"],
  ["ISABEL", "BERMEJO GONZALEZ", "615982508", "", "1952-03-26", "Femenino", "3410"],
  ["GISELA", "CABEZAS", "603379449", "", "", "Femenino", "3421"],
  ["DIEGO", "GARCIA DURAN", "669960128", "", "2016-08-26", "Femenino", "3423"],
  ["PABLO", "RAMOS TORRIJOS", "648796374", "", "", "Masculino", "3425"],
  ["JORGE", "BERNARDO", "649130709", "", "", "Femenino", "3426"],
  ["SONIA", "DE PINTO", "666012098", "", "", "Femenino", "3435"],
  ["RUBEN", "DE LA RAZADAL", "606991119", "", "", "Masculino", "3451"],
  ["SARA", "CANOURA", "654176711", "", "", "Femenino", "3455"],
  ["HUGO", "MIRAGALLA", "695154978", "", "", "Masculino", "3458"],
  ["MARIA", "CASADO", "654177623", "", "", "Femenino", "3461"],
  ["SOFIA", "SANCHEZ ALDANA", "690641239", "", "", "Femenino", "3469"],
  ["MARGARITA", "GARCIA", "666042571", "", "", "Femenino", "3472"],
  ["SEBASTIAN", "ESPINOSA", "691251719", "", "", "Femenino", "3476"],
  ["SAUL", "MOYANO GUZMAN", "655371458", "", "", "Femenino", "3479"],
  ["ITZIAR", "CORDERO ISOIDRO", "649296612", "", "", "Femenino", "3494"],
  ["LEO", "ZAPATA", "647410126", "", "", "Femenino", "3495"],
  ["MARIA", "MARTINEZ GARRIDO", "664612391", "", "", "Femenino", "3496"],
  ["IRENE", "COTIJO", "687242220", "", "", "Femenino", "3501"],
  ["MARCOS", "RAMOS", "628077733", "", "2018-06-29", "Femenino", "3521"],
  ["SAUL", "HERREREO", "675077289", "", "", "Masculino", "3536"],
  ["MARTIN", "ESCOBAR", "687957144", "", "2018-11-04", "Femenino", "3538"],
  ["MARIA", "JURADO GARCIA", "660262784", "", "", "Femenino", "3551"],
  ["NICOLAS", "MEDINO", "669064627", "", "", "Femenino", "3553"],
  ["SARA", "SANCHEZ GARCIA", "625760535", "", "2014-03-02", "Femenino", "3556"],
  ["LUCIA", "NARVAEZ", "676192780", "", "", "Femenino", "3558"],
  ["HECTOR", "ORTEGA", "620304698", "", "", "Femenino", "3568"],
  ["LUCIA", "SANTOS", "669595610", "", "", "Femenino", "3575"],
  ["ELISA", "IGLESIAS", "678401333", "", "", "Femenino", "3579"],
  ["FERNANDO", "QUINTAS FUENTECAJA", "605462987", "", "", "Femenino", "3580"],
  ["MARTA", "BLANCO", "650285626", "", "", "Femenino", "3583"],
  ["MONICA", "CHICHARRO", "684208293", "", "", "Femenino", "3584"],
  ["ALVARO", "MUÑOZ LUNA", "678894534", "", "", "Femenino", "3609"],
  ["CELIA", "FERNANDEZ ARAGON", "660046645", "", "", "Femenino", "3614"],
  ["DANIEL", "CEPERANO MERINO", "653047869", "", "", "Masculino", "3619"],
  ["CARLOS", "ALBARRACIN", "637308125", "", "", "Masculino", "3620"],
  ["EMILIO", "RUIS TORBISCO", "657305473", "", "", "Masculino", "3621"],
  ["LEO", "BAUTISTA CORTIJO", "687242220", "", "", "Femenino", "3623"],
  ["ARES", "CAMACHO MEJIAS", "665397448", "", "", "Femenino", "3626"],
  ["HECTOR", "PANADERO DIAZ", "661414727", "", "", "Femenino", "3630"],
  ["AMANDA", "MILAGROS", "658658585", "", "", "Femenino", "3632"],
  ["KARINA", "MORALES", "637327370", "", "", "Femenino", "3646"],
  ["MARCO", "RAMOS TORRIJOS", "628077733", "", "", "Femenino", "3647"],
  ["IRENE", "CORDERO", "649296612", "", "", "Femenino", "3654"],
  ["SANDRA", "CASAS LOPEZ", "635015202", "", "", "Femenino", "3656"],
  ["MARTIN", "CAMACHO", "620006105", "", "", "Masculino", "3672"],
  ["ELENA", "MONTALVO HIJON", "699576062", "", "", "Femenino", "3695"],
  ["ANDREA", "VILLA MAYOR MORO", "651308912", "", "", "Femenino", "3697"],
  ["CANDELA", "LAFUENTE SANCHEZ", "687710067", "", "", "Femenino", "3702"],
  ["MARIA", "CACERES DYANES", "651115215", "", "", "Femenino", "3705"],
  ["VIRGINIA", "GARCIA LOZANO", "618833373", "", "", "Femenino", "3706"],
  ["INDIA", "GRANIZO HERNANDEZ", "687930069", "", "", "Femenino", "3709"],
  ["DANIEL", "NUÑO JIMENEZ", "635694089", "", "", "Femenino", "3715"],
  ["DIEGO", "AVIÑO", "677150192", "", "", "Femenino", "3719"],
  ["MARTIN", "ARIANZA", "619688682", "", "", "Femenino", "3733"],
  ["MIRANDA", "PIERNAS", "603475871", "", "", "Femenino", "3736"],
  ["DANIELA", "VERMEJO", "627526277", "", "", "Femenino", "3740"],
  ["MARTIN", "SANCHEZ MONJE", "677660147", "", "", "Femenino", "3751"],
  ["SARA", "DEL BINO", "610908080", "", "", "Femenino", "3754"],
  ["MARTINA", "RUBIO BAYON", "637999540", "", "", "Femenino", "3755"],
  ["MARIO", "CAZON MARTIN", "626170507", "", "", "Femenino", "3756"],
  ["MARIO", "CORTEX", "686044045", "", "", "Masculino", "3761"],
  ["INARA", "GABEI", "695605002", "", "", "Femenino", "3770"],
  ["LUCAS", "MUÑIZ GILMARTIN", "650877232", "", "", "Masculino", "3775"],
  ["HUGO", "PEDRAZA", "654918123", "", "2014-05-29", "Masculino", "3779"],
  ["ANGELINA", "VARCARCE GARCIA", "660320608", "", "", "Femenino", "3781"],
  ["EMILY", "DIANES", "666900406", "", "", "Femenino", "3782"],
  ["PAULA", "GARRIDO", "647651845", "", "", "Femenino", "3786"],
  ["LEO", "HARRIS", "626156982", "", "", "Femenino", "3794"],
  ["LUCK", "SAN JUAN", "630100234", "", "", "Femenino", "3802"],
  ["UNAI", "SANCHEZ", "629693121", "", "", "Masculino", "3807"],
  ["ABEL", "GUTIERREZ LOPEZ", "628282849", "", "", "Femenino", "3815"],
  ["MARTIN", "LOPEZ GABRIEL", "628720344", "", "", "Masculino", "3820"],
  ["IZAN", "SANCHO ALVAREZ", "650275497", "", "", "Femenino", "3823"],
  ["LEO", "MORENATE", "686408133", "", "", "Masculino", "3825"],
  ["MARIA", "ALBARRACIN PELLO", "637308125", "", "2005-09-02", "Femenino", "3851"],
  ["ESTEFANIA", "PASCUAL", "627150088", "", "", "Femenino", "3854"],
  ["MARCOS", "BAUTISTA", "637320087", "", "", "Femenino", "3855"],
  ["SERGIO", "IBAÑEZ", "690298525", "", "", "Femenino", "3858"],
  ["MIGUEL", "CORBERO ISIDRO", "649296612", "", "2016-06-30", "Femenino", "3860"],
  ["WAHIBA", "KEBIR", "676192780", "", "", "Femenino", "3861"],
  ["NATALIA", "JORGE FERNANDEZ", "650285626", "", "", "Femenino", "3864"],
  ["NOA", "KRULIC", "686128431", "", "", "Masculino", "3867"],
  ["MARIA", "FERNANDEZ MERINO", "696104559", "", "", "Femenino", "3881"],
  ["DAVID", "FERNANDEZ MARTINEZ", "605360937", "", "", "Masculino", "3886"],
  ["ERINQUE", "BARREIRO", "647651845", "", "", "Femenino", "3895"],
  ["MARTA", "PEREZ RICO", "636300242", "", "", "Femenino", "3896"],
  ["DOLORES", "REGO", "678474103", "", "", "Femenino", "3900"],
  ["RAQUEL", "CARNERO", "600025254", "", "", "Femenino", "3901"],
  ["NEREA", "FUENTES", "630668410", "", "", "Femenino", "3903"],
  ["ANA", "ALFARO", "652405909", "", "", "Femenino", "3914"],
  ["MARTA", "ESPINOSA ALVAREZ", "663435948", "", "", "Femenino", "3917"],
  ["ADRIAN", "GARCIA BARBERO", "667696225", "", "", "Femenino", "3927"],
  ["LARA", "BARBERO", "666006859", "", "", "Femenino", "3928"],
  ["VALENTINA", "PINTO JIMENEZ", "634970739", "", "", "Femenino", "3935"],
  ["NOA", "SANCHEZ", "650275497", "", "", "Femenino", "3936"],
  ["SERGIO", "SANCHEZ DEL RIO", "651151724", "", "", "Femenino", "3944"],
  ["NICOLAS", "BLAZQUEZ", "687954727", "", "", "Femenino", "3945"],
  ["PATRICIA", "SOUSA LOPEZ", "687832273", "", "", "Femenino", "3949"],
  ["BODOQUE", "BARBERO PAULA", "669786613", "", "", "Femenino", "3974"],
  ["JESUS", "TURRION", "696202535", "", "", "Femenino", "3979"],
  ["ADRIAN", "SANCHEZ BERMUDEZ", "661614378", "", "", "Masculino", "3993"],
  ["MONICA", "VARCARCEL", "676584000", "", "", "Femenino", "3996"],
  ["ADRIAN", "MORATALLA", "625600788", "", "", "Femenino", "4005"],
  ["ERIK", "BOLAÑOS", "651566333", "", "2015-04-21", "Femenino", "4012"],
  ["DANIELA", "RODRIGUEZ LARGO", "676809094", "", "", "Femenino", "4016"],
  ["MONICA", "KOIZAR", "622233510", "", "", "Femenino", "4027"],
  ["ALVARO", "CORRAL", "659678763", "", "", "Femenino", "4034"],
  ["JOSE MARIA", "ABAD", "626158785", "", "", "Femenino", "4040"],
  ["INES", "COQUIYAT", "600742707", "", "", "Femenino", "4043"],
  ["JOAO", "SILVA ARAGONES", "635645454", "", "", "Femenino", "4046"],
  ["AITANA", "ALONSO VILLAVERDE", "626808253", "", "", "Femenino", "4047"],
  ["ROSARIO", "VIZUETE", "645758629", "", "", "Femenino", "4048"],
  ["CAROLINA", "MARTINEZ VIÑA", "630037996", "", "", "Femenino", "4054"],
  ["SOPHI", "CHOUKROUN", "677561015", "", "", "Femenino", "4066"],
  ["MARKEL", "PINO", "655787111", "", "", "Femenino", "4072"],
  ["CARMEN", "QUINTANILLA", "656656246", "", "", "Femenino", "4079"],
  ["ANA", "VICTORIA LARA RODRIGUEZ", "636681274", "", "", "Femenino", "4083"],
  ["LUCAS", "VAQUERIZO RUIZ", "650269478", "", "", "Masculino", "4093"],
  ["GONZALO", "COUE", "645758629", "", "", "Femenino", "4097"],
  ["AXIER", "RODRIGUEZ", "676809094", "", "", "Femenino", "4106"],
  ["INMACULADA", "DE JUAN", "657385566", "", "", "Femenino", "4107"],
  ["UNAI", "GARRIDO CORDOVILLA", "661870538", "", "", "Femenino", "4111"],
  ["ELIA", "GONZALEZ", "647978635", "", "", "Femenino", "4118"],
  ["IRENE", "ALVAREZ MONTEMAYOR", "630673669", "", "", "Femenino", "4121"],
  ["RUTH", "LOPEZ MARTIN", "626845293", "", "", "Femenino", "4130"],
  ["MARTIN", "ZAPATA", "647410126", "", "", "Femenino", "4134"],
  ["VARA", "SORIANO VERA", "695593007", "", "", "Femenino", "4148"],
  ["NINA", "PAOLA MEZA", "610502175", "", "", "Femenino", "4149"],
  ["EVA", "JEDERCO", "610059113", "", "", "Femenino", "4153"],
  ["LEO", "SUAREZ", "647978635", "", "", "Masculino", "4154"],
  ["JAVIER", "CETEDANO", "653047869", "", "", "Femenino", "4155"],
  ["DAVID", "MORENTE", "630066636", "", "2017-10-31", "Femenino", "4156"],
  ["NATALIA", "GARCIA RODRIGUEZ", "658488832", "", "", "Femenino", "4168"],
  ["SARA", "VELASQUEZ", "655473230", "", "", "Femenino", "4172"],
  ["JULIA", "FERNANDEZ MERINO", "696104559", "", "", "Femenino", "4179"],
  ["LARA", "RODRIGUEZ MOYA", "645369038", "", "", "Femenino", "4185"],
  ["MIRANDA", "ISABELA VIERMA", "603475871", "", "", "Femenino", "4190"],
  ["NECTOR", "CAZON", "626170507", "", "", "Masculino", "4207"],
  ["JORGE", "MORATALLA", "625600788", "", "", "Femenino", "4208"],
  ["IBAI", "PEDRAZA SANCHEZ", "669861274", "", "", "Femenino", "4214"],
  ["MIGUEL", "GARCIA DEL CAMPO", "660055766", "", "", "Femenino", "4224"],
  ["MARTIN", "ARIENZA", "646275326", "", "", "Femenino", "4225"],
  ["SOFIA", "YAGUE RODRIGUEZ", "636319195", "", "", "Femenino", "4227"],
  ["MANUEL", "MARTIN PEDREA", "657867048", "", "", "Femenino", "4231"],
  ["VERONICA", "FELIPE", "645758629", "", "", "Femenino", "4236"],
  ["TAIS", "PEÑALOSA", "617420106", "", "", "Femenino", "4238"],
  ["LIDIA", "ANGELA BOTA", "687142798", "", "", "Femenino", "4248"],
  ["PAQUI", "ESCAMILLA PASCUAL", "639021232", "", "", "Femenino", "4252"],
  ["DOMINICA", "LOPEZ", "687832273", "", "", "Femenino", "4253"],
  ["MARIO", "DIEZ SANCHEZ", "676515151", "", "", "Femenino", "4260"],
  ["LUIS", "ANGEL GARCIA SEBASTIAN", "637310615", "", "", "Femenino", "4264"],
  ["ERIK", "COCA DIAZ", "659071636", "", "", "Femenino", "4278"],
  ["LAURA", "MEDINO GARCIA", "669064627", "", "", "Femenino", "4282"],
  ["LEO", "ESCARMENA", "615648273", "", "", "Femenino", "4299"],
  ["MARTA", "DE JUANA", "659864086", "", "", "Femenino", "4303"],
  ["ANDRU", "SCHAAD", "651695342", "", "", "Femenino", "4310"],
  ["MACIEL", "MARTIN NARANJO", "641133035", "", "", "Femenino", "4324"],
  ["AITOR", "ARIENZA", "646275326", "", "", "Femenino", "4344"],
  ["LIDIA", "CHICO", "655446566", "", "", "Femenino", "4348"],
  ["JAVIER", "MARTIN SEGURA", "687549386", "", "", "Masculino", "4355"],
  ["GEMA", "PEREZ CHACON", "659225666", "", "", "Femenino", "4363"],
  ["ALEJANDRA", "GUTIERREZ GARCIA", "600631842", "", "", "Femenino", "4389"],
  ["NACHO", "RODRIGUEZ CUESTA", "636246817", "", "", "Femenino", "4395"],
  ["CARMEN", "GARCIA CALVO", "672140166", "", "", "Femenino", "4407"],
  ["MARIA CARMEN", "ROMERO MARTINEZ", "622648370", "", "", "Femenino", "4417"],
  ["ALEXANDRA", "PEREIRA", "627515676", "", "", "Femenino", "4421"],
  ["ANDREUU", "SSHAAD", "651695342", "", "", "Masculino", "4422"],
  ["NAHIA", "ARMAÑANZAS FERNANDEZ", "658724988", "", "2011-02-14", "Femenino", "4436"],
  ["CLAUDIA", "PEREZ BONILLA", "660104411", "", "", "Femenino", "4457"],
  ["NARA", "GUTIERREZ LOPEZ", "685290598", "", "", "Femenino", "4471"],
  ["PAULA", "TELLO", "657877802", "", "", "Femenino", "4473"],
  ["JORGE", "LOPEZ", "620806174", "", "", "Femenino", "4474"],
  ["SILVIA", "CASTEL", "669175191", "", "", "Femenino", "4475"],
  ["THIAGO", "VIVAS MUÑOZ REPISO", "667094032", "", "", "Femenino", "4492"],
  ["VICTORIA", "ALEJOS", "618246573", "", "", "Femenino", "4520"],
  ["MARINA", "TARDON GOMEZ", "650399728", "", "", "Femenino", "4522"],
  ["NOA", "PEREZ MEDINO", "680410350", "", "", "Femenino", "4576"],
  ["SUAREZ", "JAVIER", "658512042", "", "", "Femenino", "4592"],
  ["LEO", "CACERES", "649300262", "", "", "Femenino", "4593"],
  ["LAURA", "CALVO", "699774569", "", "", "Femenino", "4604"],
  ["MARTA", "LUENGO", "630668410", "", "", "Femenino", "4610"],
  ["EVA", "MARTINEZ MATIAS", "627526277", "", "", "Femenino", "4612"],
  ["GABRIEL", "LOPEZ FERREIRO", "679681751", "", "", "Femenino", "4620"],
  ["MARCOS", "FERNANDEZ GARCIA", "661157575", "", "", "Femenino", "4625"],
  ["CEBAYOS", "MARISOL", "647976542", "", "", "Femenino", "4631"],
  ["OLVIDO", "VILLAR", "628029234", "", "", "Femenino", "4636"],
  ["NASIM", "", "697689394", "", "", "Femenino", "4652"],
  ["MONICA", "ALVAREZ DIAZ", "630854537", "", "", "Femenino", "4653"],
  ["PABLO", "PICAVET", "620672325", "", "", "Femenino", "4666"],
  ["MARTIN", "HERNANDEZ DEL PESO", "606276853", "", "", "Femenino", "4671"],
  ["ARES", "PEÑAROSA", "617420106", "", "", "Femenino", "4681"],
  ["CARMEN", "JIMENEZ MORALES", "667427733", "", "", "Femenino", "4683"],
  ["LUCAS", "CARCHENILLA", "646743265", "", "", "Femenino", "4687"],
  ["JORGE", "CERRATO", "605959250", "", "", "Femenino", "4699"],
  ["ISABEL", "BETHANCOURT", "618256926", "", "", "Femenino", "4700"],
  ["ENMA", "ARTELO CABEZAS", "660454889", "", "", "Femenino", "4717"],
  ["MATIA", "DE FRANCISCO GONZALEZ", "658219802", "", "", "Masculino", "4724"],
  ["LIDIA", "BARONA SEGURA", "669035645", "", "", "Femenino", "4730"],
  ["AITOR", "ARIAS", "646275326", "", "", "Femenino", "4732"],
  ["MARIAM", "RODRIGUEZ MOLINERO", "653889136", "", "", "Femenino", "4748"],
  ["IVAN", "MARTIN BARROSO", "680333446", "", "", "Masculino", "4755"],
  ["EREA", "VAZQUEZ BALBOA", "648518438", "", "", "Femenino", "4760"],
  ["MIGUEL", "ATIENZA", "638132869", "", "", "Femenino", "4765"],
  ["SERGIO", "ROLLUELA MARTOS", "628465262", "", "", "Masculino", "4772"],
  ["ALEIS", "BOLAÑOS", "651566333", "", "", "Femenino", "4783"],
  ["PATRIC", "MINERO VALENCIA", "677779709", "", "", "Femenino", "4789"],
  ["MARIA", "BALAREZO", "684125994", "", "", "Femenino", "4792"],
  ["FABRISO", "MORENO", "612511635", "", "", "Masculino", "4799"],
  ["SOFIA", "VENAVENTE MADRI", "600304471", "", "", "Femenino", "4807"],
  ["GEMA", "BOLADO YUSTA", "633585443", "", "", "Femenino", "4816"],
  ["ASIER", "LOPEZ ALLENDE", "616691530", "", "", "Femenino", "4883"],
  ["VICTORIA", "GONZALEZ ALONSO", "609026300", "", "", "Femenino", "4893"],
  ["LUCIA", "PEREZ HERNANDEZ", "646778248", "", "", "Femenino", "4899"],
  ["EIRE", "LOURIDO", "669936828", "", "", "Femenino", "4901"],
  ["MATEO", "GARVIN", "649473141", "", "", "Femenino", "4913"],
  ["ELIOTT", "ORTIZ", "678534764", "", "", "Femenino", "4915"],
  ["VERA", "LAZARO", "699524629", "", "", "Femenino", "4930"],
  ["MAREAN", "RODRIGUEZ", "653889136", "", "", "Femenino", "4944"],
  ["AITANA", "DIAZ TORRES", "677760762", "", "", "Femenino", "4950"],
  ["VERA", "PASCUAL ANTA", "627619657", "", "", "Femenino", "4973"],
  ["ANA MARIN", "PINO", "600214997", "", "", "Femenino", "5009"],
  ["LAURA", "YUSTE", "647514682", "", "", "Femenino", "5011"],
  ["LIDIA", "MUÑOZ -REPISO", "667094032", "", "", "Femenino", "5015"],
  ["CANDI", "SALAZAR", "651420732", "", "", "Femenino", "5020"],
  ["SOLEDAD", "PERONA", "666701342", "", "", "Femenino", "5024"],
  ["LEO", "ARIAS RODRIGUEZ", "650851724", "", "", "Femenino", "5040"],
  ["VALENTINO", "ZAPATA", "659680359", "", "", "Femenino", "5045"],
  ["LAURA", "BENTO", "677854346", "", "", "Femenino", "5048"],
  ["ALEJANDRO", "MESEGUER", "646967588", "", "", "Masculino", "5049"],
  ["MARTINA", "PLANA", "629472651", "", "", "Femenino", "5065"],
  ["LUCAS", "ALBARADO VILLALBA", "637057183", "", "", "Femenino", "5077"],
  ["SOTHIE", "CHOUKFOUN", "677561015", "", "", "Femenino", "5082"],
  ["CARMEN", "CASTOR", "619514125", "", "", "Femenino", "5083"],
  ["EMMA", "ANTELO", "660454889", "", "", "Femenino", "5089"],
  ["MIGUEL", "ANTELO LOPEZ", "652476383", "", "", "Femenino", "5109"],
  ["NADIA", "HERNANDEZ", "625452086", "", "", "Femenino", "5121"],
  ["VIRGINA", "GARCIA LOZANO", "618833373", "", "", "Femenino", "5123"],
  ["CARLA", "ANTON MARINA", "617051014", "", "", "Femenino", "5143"],
  ["JOSE", "ROALES", "652837051", "", "", "Femenino", "5151"],
  ["MIRIAM", "FERRO DE MIGUEL", "699214613", "", "", "Femenino", "5162"],
  ["ALEJANDRA", "MORENO", "617580167", "", "", "Femenino", "5169"],
  ["ZAIDA", "RODRIGUEZ RIVERA", "655501212", "", "", "Femenino", "5207"],
  ["NOELIA", "CALVO DOMÍNGUEZ", "672140166", "", "", "Femenino", "5210"],
  ["LOLA", "BLAS", "652560513", "", "", "Femenino", "5212"],
  ["LUCIA", "GÓMEZ BALLESTEROS", "635145307", "", "", "Femenino", "5222"],
  ["PATRICIA", "DIZ PAZOS", "697271206", "", "", "Femenino", "5224"],
  ["ALBERTO", "SANCHEZ", "653377028", "", "", "Femenino", "5225"],
  ["JESUS", "CARRERA", "649452532", "", "", "Masculino", "5227"],
  ["CARLA", "CANO", "655916904", "", "", "Femenino", "5230"],
  ["MIRNA", "MENDOZA", "674685376", "", "", "Femenino", "5234"],
  ["AITANA", "EXPOSITO", "696556700", "", "", "Femenino", "5259"],
  ["AINARA", "PEÑA LOPEZ", "657230488", "", "", "Femenino", "5266"],
  ["CARLA", "ALONSO", "670575025", "", "", "Femenino", "5267"],
  ["ELENA", "GUILLERMO PONCE", "690296529", "", "", "Femenino", "5290"],
  ["ADRIAN", "ROMERO GONZALEZ", "663490976", "", "", "Femenino", "5294"],
  ["ESTHER", "LLORENTE", "677723273", "", "", "Femenino", "5295"],
  ["CARMEN", "HERNANDEZ MESA", "643132757", "", "", "Femenino", "5297"],
  ["MARIA JOSE", "SERRANO DOMINGUEZ", "660935526", "", "", "Femenino", "5298"],
  ["ESTEFANIA", "LOPEZ DE LA IGLESIA", "690645981", "", "", "Femenino", "5299"],
  ["MARIA JOSE", "BUCHELI", "691622443", "majo7b@yajoo.com", "", "Femenino", "5300"],
  ["AITOR", "GONZALEZ MARTIN", "646561168", "", "", "Masculino", "5301"],
  ["PABLO", "SEVILLANO", "637138910", "", "", "Femenino", "5302"],
  ["MARIA", "HERNANDEZ SOLIS", "606211608", "", "", "Femenino", "5303"],
  ["ANDREA", "VIDEL TORRES", "627734464", "", "", "Femenino", "5305"],
  ["LOLA", "MARTIN RAMIREZ", "650048684", "", "", "Femenino", "5306"],
  ["MARIA JOSE", "SERRANO DOMINGUEZ", "660935526", "", "", "Femenino", "5307"],
  ["CARLA", "MARTIN GOMEZ", "639373104", "", "", "Femenino", "5308"],
  ["MARIAM", "FARMAWIE", "661661200", "", "", "Femenino", "5311"],
  ["CARMEN", "DE LEÓN BARCA", "622182789", "", "", "Femenino", "5312"],
  ["MARIAM", "NEVMAN", "603561017", "", "", "Femenino", "5314"],
  ["ROSA", "SANCHEZ ARRABAL", "696323904", "", "", "Femenino", "5315"],
  ["LAURA", "GARCIA DOMINGO", "658027707", "", "", "Femenino", "5317"],
  ["MARISA", "JIMENEZ VALLES", "634137799", "", "", "Femenino", "5319"]];

// =====================================================
// Helper — ¿ya existe este contacto?
// Query por teléfono; si algún resultado coincide además en
// nombre+apellido (case-insensitive), se considera ya creado.
// Patrón de query: crmToolsLogic.web.js (queryContacts + suppressAuth).
// =====================================================
async function yaExiste(telefono, nombre, apellido) {
  try {
    const resp = await queryContactsElevated()
      .eq('info.phones.phone', telefono)
      .limit(50)
      .find({ suppressAuth: true });

    const items = resp?.items || [];
    if (items.length === 0) return null;

    const objetivo = `${String(nombre || '').trim()} ${String(apellido || '').trim()}`
      .trim().toLowerCase().replace(/\s+/g, ' ');

    for (const c of items) {
      const n = String(c?.info?.name?.first || '').trim();
      const a = String(c?.info?.name?.last || '').trim();
      const actual = `${n} ${a}`.trim().toLowerCase().replace(/\s+/g, ' ');
      if (actual && actual === objetivo) return c._id || c.id || 'existe';
    }
    return null;
  } catch (e) {
    console.warn(`${TAG} yaExiste falló para tel=${telefono}: ${e.message}`);
    return null; // ante duda, se intenta crear
  }
}

// =====================================================
// webMethod principal
// =====================================================
export async function recuperarContactosCore({ desde = 0, hasta = 50, dryRun = false } = {}) {

    const ini = Math.max(0, parseInt(desde, 10) || 0);
    const fin = Math.min(LOTE.length, parseInt(hasta, 10) || 0);

    if (fin <= ini) {
      return { ok: false, version: VERSION, error: `Rango inválido: desde=${ini} hasta=${fin}. Total lote=${LOTE.length}` };
    }

    console.log(`${TAG} INICIO tramo [${ini}, ${fin}) · dryRun=${dryRun} · total lote=${LOTE.length}`);

    // ── Etiqueta del lote (findOrCreateLabel — patrón crmToolsLogic) ──
    let labelKey = null;
    if (!dryRun) {
      try {
        const resp = await findOrCreateLabelElev(ETIQUETA_LOTE);
        labelKey = resp?.label?.key || null;
        console.log(`${TAG} etiqueta "${ETIQUETA_LOTE}" → key=${labelKey}`);
      } catch (e) {
        console.warn(`${TAG} findOrCreateLabel falló: ${e.message} — se continúa sin etiquetar`);
      }
    }

    const detalle = [];
    let creados = 0, saltados = 0, errores = 0;

    for (let i = ini; i < fin; i++) {
      const [nombre, apellido, telefono, email, birthdate, sexo, numSadpe] = LOTE[i];
      const etiquetaFicha = `#${numSadpe} ${nombre} ${apellido}`.trim();

      try {
        // ── Idempotencia ──
        const existente = await yaExiste(telefono, nombre, apellido);
        if (existente) {
          saltados++;
          detalle.push({ i, sadpe: numSadpe, nombre: etiquetaFicha, estado: 'YA_EXISTE', contactId: existente });
          continue;
        }

        if (dryRun) {
          creados++;
          detalle.push({ i, sadpe: numSadpe, nombre: etiquetaFicha, estado: 'DRY_RUN_OK', tel: telefono, email: email || '-', sexo: sexo || '-' });
          continue;
        }

        // ── contactInfo — patrón fichaClienteLogic v1.9.11 ──
        const contactInfo = { name: { first: nombre, last: apellido } };
        if (email)     contactInfo.emails    = [{ tag: 'MAIN',   email }];
        if (telefono)  contactInfo.phones    = [{ tag: 'MOBILE', phone: telefono }];
        if (birthdate) contactInfo.birthdate = birthdate;
        if (sexo)      contactInfo.extendedFields = { 'custom.sexo': sexo };

        // ── createContact — allowDuplicates SIEMPRE true, sin reintento ──
        let created;
        try {
          created = await createContactElevated(contactInfo, {
            allowDuplicates: true,
            suppressAuth: true
          });
        } catch (createErr) {
          const appErr = createErr?.details?.applicationError;
          console.error(`${TAG} createContact FALLÓ ${etiquetaFicha} · code=${appErr?.code || '-'} · raw=${createErr?.message || ''}`);
          errores++;
          detalle.push({ i, sadpe: numSadpe, nombre: etiquetaFicha, estado: 'ERROR_CREATE', code: appErr?.code || 'DESCONOCIDO' });
          continue;
        }

        const createdContact = created?.contact || created;
        const newId = createdContact?._id || createdContact?.id || null;
        if (!newId) {
          errores++;
          detalle.push({ i, sadpe: numSadpe, nombre: etiquetaFicha, estado: 'ERROR_SIN_ID' });
          continue;
        }

        // ── Etiquetar — patrón crmToolsLogic (firma plana) ──
        if (labelKey) {
          try {
            await labelContactElevated(newId, [labelKey], { suppressAuth: true });
          } catch (eLabel) {
            console.warn(`${TAG} labelContact falló ${etiquetaFicha}: ${eLabel.message}`);
          }
        }

        creados++;
        detalle.push({ i, sadpe: numSadpe, nombre: etiquetaFicha, estado: 'CREADO', contactId: newId });

      } catch (e) {
        console.error(`${TAG} EXCEPCIÓN ${etiquetaFicha}: ${e.message}`);
        errores++;
        detalle.push({ i, sadpe: numSadpe, nombre: etiquetaFicha, estado: 'ERROR', msg: e.message });
      }
    }

    const siguiente = fin < LOTE.length
      ? `?desde=${fin}&hasta=${Math.min(LOTE.length, fin + (fin - ini))}${dryRun ? '&dryRun=1' : ''}`
      : null;

    console.log(`${TAG} FIN tramo [${ini}, ${fin}) · creados=${creados} saltados=${saltados} errores=${errores}`);

    return {
      ok: true,
      version: VERSION,
      dryRun: !!dryRun,
      totalLote: LOTE.length,
      tramo: { desde: ini, hasta: fin },
      resumen: { creados, saltados, errores },
      siguienteTramo: siguiente,
      detalle
    };
}

// =====================================================
// Envoltorio webMethod — NO lo usa el endpoint HTTP.
// http-functions.js corre SIN sesión de miembro y un webMethod con
// Permissions.SiteMember rechazaría la llamada (aviso literal en la
// cabecera de http-functions.js, línea 38). El endpoint importa
// recuperarContactosCore. Este export queda por si se quiere invocar
// desde un page code con sesión iniciada.
// =====================================================
export const recuperarContactos = webMethod(
  Permissions.SiteMember,
  async (payload) => recuperarContactosCore(payload || {})
);
