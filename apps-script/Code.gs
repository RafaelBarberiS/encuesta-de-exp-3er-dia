/* ============================================================
   Encuesta de seguimiento · 3er día — receptor de respuestas
   ------------------------------------------------------------
   1. Abrí la planilla > Extensiones > Apps Script y pegá este archivo.
   2. Ejecutá una vez `configurarHoja` (crea la hoja, encabezados y formatos).
   3. Implementar > Nueva implementación > Aplicación web
      - Ejecutar como: Yo
      - Quién tiene acceso: Cualquier usuario
   4. Copiá la URL (termina en /exec) en APPS_SCRIPT_URL del index.html.
   ============================================================ */

const HOJA = 'Respuestas 3er día';

// Puntajes: el valor más alto es siempre la mejor respuesta.
// Los textos tienen que coincidir exactamente con los data-val del index.html.
const ESCALAS = {
  recibimiento: {
    'Me recibieron y me presentaron al equipo': 3,
    'Me recibieron pero no me presentaron': 2,
    'Nadie me recibió': 1
  },
  entrenador: {
    'Sí, me acompañó todo el tiempo': 4,
    'Sí, pero solo a ratos': 3,
    'No, aprendí con distintos compañeros': 2,
    'No, estuve solo/a': 1
  },
  entrenamiento: {
    'Me explicaron todo con paciencia': 4,
    'Me explicaron lo básico y me fui acomodando': 3,
    'Me explicaron poco, aprendí mirando': 2,
    'Casi no me explicaron nada': 1
  },
  seguridad: { 'Sí, me lo explicaron bien': 3, 'Me explicaron algo': 2, 'No me explicaron': 1 },
  horarios:  { 'Sí, me quedó todo claro': 3, 'Algunas cosas': 2, 'No me explicaron': 1 },
  descansos: { 'Sí, siempre': 3, 'A veces': 2, 'No': 1 },
  trato:     { 'Muy bueno': 4, 'Bueno': 3, 'Regular': 2, 'Malo': 1 },
  referente: { 'Sí, sé a quién recurrir': 3, 'Más o menos': 2, 'No sé a quién recurrir': 1 },
  general:   { 'Muy buena': 5, 'Buena': 4, 'Regular': 3, 'Mala': 2, 'Muy mala': 1 }
};

const TAREAS = ['Caja', 'Cocina / Plancha', 'Freidora', 'Armado de pedidos', 'Delivery / Drive', 'Limpieza', 'Atención al cliente'];

const MEJORAS = [
  'El recibimiento del primer día', 'La explicación de las tareas', 'La explicación de seguridad e higiene',
  'La organización de horarios y turnos', 'El trato entre compañeros', 'La comunicación de los responsables',
  'Los descansos', 'El orden y la limpieza', 'Nada, estuvo todo bien'
];

// Preguntas que entran en el índice de onboarding (0 a 100).
const INDICE = ['recibimiento', 'entrenador', 'entrenamiento', 'seguridad', 'horarios', 'descansos', 'trato', 'referente'];

/* ---------- definición de columnas ----------
   tipo: fecha | texto | puntaje | indice | binario | alerta */
function columnas() {
  const cols = [
    { h: 'Fecha envío',        tipo: 'fecha',   ancho: 140, v: p => fecha(p.enviado) },
    { h: 'Requiere seguimiento', tipo: 'alerta', ancho: 110, v: p => alerta(p) },
    { h: 'Índice onboarding',  tipo: 'indice',  ancho: 110, v: p => indice(p) },
    { h: 'Encuesta',           tipo: 'texto',   ancho: 90,  v: p => p.encuesta },
    { h: 'Rol',                tipo: 'texto',   ancho: 110, v: p => p.rol },
    { h: 'Edad',               tipo: 'texto',   ancho: 110, v: p => p.edad },
    { h: 'Experiencia previa', tipo: 'texto',   ancho: 90,  v: p => p.experiencia },
    { h: 'Marca',              tipo: 'texto',   ancho: 170, v: p => p.marca },
    { h: 'Zona',               tipo: 'texto',   ancho: 80,  v: p => p.zona },
    { h: 'Local',              tipo: 'texto',   ancho: 150, v: p => p.local }
  ];

  const conPuntaje = (clave, titulo, ancho) => {
    cols.push({ h: titulo, tipo: 'texto', ancho: ancho, v: p => p[clave] });
    cols.push({ h: titulo + ' (pts)', tipo: 'puntaje', ancho: 70, max: maxDe(clave), v: p => puntaje(clave, p[clave]) });
  };

  conPuntaje('recibimiento',  'Recibimiento',        260);
  conPuntaje('entrenador',    'Entrenador asignado', 250);
  conPuntaje('entrenamiento', 'Entrenamiento',       290);

  cols.push({ h: 'Tareas aprendidas', tipo: 'texto', ancho: 260, v: p => p.tareas });
  cols.push({ h: 'Cant. tareas', tipo: 'puntaje', ancho: 70, max: TAREAS.length, v: p => lista(p.tareas).length });
  TAREAS.forEach(t => cols.push({ h: 'Tarea: ' + t, tipo: 'binario', ancho: 90, v: p => lista(p.tareas).indexOf(t) > -1 ? 1 : 0 }));

  conPuntaje('seguridad', 'Seguridad e higiene',  190);
  conPuntaje('horarios',  'Horarios y fichaje',   190);
  conPuntaje('descansos', 'Descansos',            110);
  conPuntaje('trato',     'Trato',                110);
  conPuntaje('referente', 'Sabe a quién recurrir', 190);

  cols.push({ h: 'Inconveniente',  tipo: 'texto', ancho: 100, v: p => p.inconveniente });
  cols.push({ h: 'Contactó a',     tipo: 'texto', ancho: 110, v: p => p.contacto });

  conPuntaje('general', 'Experiencia general', 120);

  cols.push({ h: 'Mejoras', tipo: 'texto', ancho: 300, v: p => p.mejoras });
  MEJORAS.forEach(m => cols.push({ h: 'Mejora: ' + m, tipo: 'binario', ancho: 110, v: p => lista(p.mejoras).indexOf(m) > -1 ? 1 : 0 }));

  return cols;
}

/* ---------- web app ---------- */
function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const p = JSON.parse(e.postData.contents);
    const hoja = obtenerHoja();
    const fila = columnas().map(c => {
      const v = c.v(p);
      return v === undefined || v === null ? '' : v;
    });
    hoja.appendRow(fila);
    return json({ ok: true });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function doGet() {
  return json({ ok: true, hoja: HOJA });
}

/* ---------- hoja y formatos ---------- */
function obtenerHoja() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const hoja = ss.getSheetByName(HOJA);
  if (hoja && hoja.getLastRow() > 0) return hoja;
  return configurarHoja();
}

function configurarHoja() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const hoja = ss.getSheetByName(HOJA) || ss.insertSheet(HOJA);
  const cols = columnas();
  const n = cols.length;
  const filas = hoja.getMaxRows() - 1;

  if (hoja.getMaxColumns() < n) hoja.insertColumnsAfter(hoja.getMaxColumns(), n - hoja.getMaxColumns());

  hoja.getRange(1, 1, 1, n)
    .setValues([cols.map(c => c.h)])
    .setFontWeight('bold').setFontColor('#FFFFFF').setBackground('#0F6E58')
    .setWrap(true).setVerticalAlignment('middle').setHorizontalAlignment('center');
  hoja.setRowHeight(1, 48);
  hoja.setFrozenRows(1);
  hoja.setFrozenColumns(1);

  const reglas = [];
  cols.forEach((c, idx) => {
    const col = idx + 1;
    hoja.setColumnWidth(col, c.ancho);
    const rango = hoja.getRange(2, col, filas, 1);

    if (c.tipo === 'fecha') {
      rango.setNumberFormat('dd/mm/yyyy HH:mm');
    } else if (c.tipo === 'puntaje') {
      rango.setNumberFormat('0').setHorizontalAlignment('center');
      reglas.push(escala(rango, 1, c.max));
    } else if (c.tipo === 'indice') {
      rango.setNumberFormat('0').setHorizontalAlignment('center').setFontWeight('bold');
      reglas.push(escala(rango, 0, 100));
    } else if (c.tipo === 'binario') {
      rango.setNumberFormat('0').setHorizontalAlignment('center');
      reglas.push(SpreadsheetApp.newConditionalFormatRule()
        .whenNumberEqualTo(1).setBackground('#E4F0EC').setFontColor('#0A4F3F').setRanges([rango]).build());
    } else if (c.tipo === 'alerta') {
      rango.setHorizontalAlignment('center').setFontWeight('bold');
      reglas.push(SpreadsheetApp.newConditionalFormatRule()
        .whenTextEqualTo('SÍ').setBackground('#F8D7DA').setFontColor('#842029').setRanges([rango]).build());
    } else {
      rango.setNumberFormat('@').setWrap(true);
    }
  });
  hoja.setConditionalFormatRules(reglas);

  if (hoja.getFilter()) hoja.getFilter().remove();
  hoja.getRange(1, 1, hoja.getMaxRows(), n).createFilter();

  return hoja;
}

function escala(rango, min, max) {
  return SpreadsheetApp.newConditionalFormatRule()
    .setGradientMinpointWithValue('#F4C7C3', SpreadsheetApp.InterpolationType.NUMBER, String(min))
    .setGradientMidpointWithValue('#FCE8B2', SpreadsheetApp.InterpolationType.NUMBER, String((min + max) / 2))
    .setGradientMaxpointWithValue('#B7E1CD', SpreadsheetApp.InterpolationType.NUMBER, String(max))
    .setRanges([rango]).build();
}

/* ---------- cálculos ---------- */
function puntaje(clave, valor) {
  const v = ESCALAS[clave][valor];
  return v === undefined ? '' : v;
}

function maxDe(clave) {
  return Math.max.apply(null, Object.keys(ESCALAS[clave]).map(k => ESCALAS[clave][k]));
}

// Promedio de las preguntas respondidas, llevando cada una a 0-100.
function indice(p) {
  const valores = INDICE
    .map(clave => {
      const v = ESCALAS[clave][p[clave]];
      return v === undefined ? null : (v - 1) / (maxDe(clave) - 1) * 100;
    })
    .filter(v => v !== null);
  if (!valores.length) return '';
  return Math.round(valores.reduce((a, b) => a + b, 0) / valores.length);
}

// Marca los casos que RRHH debería mirar primero.
function alerta(p) {
  const rojo =
    p.inconveniente === 'Sí' ||
    p.trato === 'Malo' ||
    p.recibimiento === 'Nadie me recibió' ||
    p.entrenador === 'No, estuve solo/a' ||
    p.entrenamiento === 'Casi no me explicaron nada' ||
    p.seguridad === 'No me explicaron' ||
    p.descansos === 'No' ||
    p.general === 'Mala' || p.general === 'Muy mala';
  return rojo ? 'SÍ' : 'NO';
}

function lista(texto) {
  if (!texto || texto === 'S/D') return [];
  return String(texto).split(' | ');
}

function fecha(iso) {
  const d = iso ? new Date(iso) : new Date();
  return isNaN(d.getTime()) ? new Date() : d;
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ---------- prueba manual desde el editor ---------- */
function probarEnvio() {
  doPost({ postData: { contents: JSON.stringify({
    encuesta: '3er día', rol: 'Part-time', edad: '18 a 22 años', experiencia: 'No',
    marca: 'Sabores Express', zona: 'CABA', local: 'Retiro',
    recibimiento: 'Nadie me recibió', entrenador: 'Sí, pero solo a ratos',
    entrenamiento: 'Me explicaron poco, aprendí mirando', tareas: 'Caja | Limpieza',
    seguridad: 'Me explicaron algo', horarios: 'No me explicaron', descansos: 'A veces',
    trato: 'Bueno', referente: 'Más o menos', inconveniente: 'No', contacto: 'S/D',
    general: 'Buena', mejoras: 'El recibimiento del primer día | Los descansos',
    enviado: new Date().toISOString()
  }) } });
}
