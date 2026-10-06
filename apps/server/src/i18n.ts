import type { FastifyRequest } from 'fastify';
import { getSetting, type DB } from './db/index.js';

export const languages = ['es', 'eu', 'en'] as const;
export type Lang = (typeof languages)[number];

const es = {
  collection_not_found: 'Colección {id} no encontrada',
  immich_not_configured: 'Immich no está configurado',
  canvas_not_found: 'Canvas {id} no encontrado',
  playlist_empty: 'La playlist «{name}» no tiene imágenes',
  image_not_found: 'Imagen {id} no encontrada',
  unsupported_image: '{name}: formato de imagen no soportado',
  original_missing: 'Archivo original no disponible',
  immich_fetch_failed: 'No se pudo obtener la imagen {id} de Immich',
  cron_fields: 'La expresión cron debe tener 5 campos: minuto hora día mes día-de-la-semana',
  cron_invalid: 'Expresión cron no válida: {detail}',
  time_invalid: 'Hora no válida (HH:MM)',
  interval_invalid: 'Intervalo no válido',
  days_invalid: 'Número de días no válido',
  weeks_invalid: 'Número de semanas no válido',
  weekday_invalid: 'Día de la semana no válido',
  monthday_invalid: 'Día del mes no válido (1–28)',
  cron_never: 'La expresión cron nunca se ejecuta',
  cron_too_frequent: 'El cambio mínimo es cada hora: la expresión cron se ejecuta más a menudo',
  schedule_invalid: 'Tipo de programación no válido',
  host_missing: 'Falta la IP del Canvas',
  unknown_action: 'Acción desconocida',
  play_target_missing: 'Indica galería, imagen o playlist',
  public_url_missing: 'Configura la URL pública del Hub (Ajustes) para el modo pull',
  public_url_localhost: 'La URL pública no puede ser localhost: el Canvas debe poder alcanzarla',
  no_photos_selected: 'Sin fotos seleccionadas',
  bad_hash: 'Hash no válido',
  render_not_found: 'Render no encontrado',
  name_missing: 'Falta el nombre',
  collection_type_invalid: 'Tipo de colección no válido',
  manual_only: 'Solo se pueden añadir fotos a colecciones manuales',
  canvas_offline: 'El Canvas no responde (¿está dormido?)',
  not_authenticated: 'No autenticado',
  already_setup: 'Ya está configurado',
  canvas_already_added: 'Este Canvas ya está añadido como «{name}»',
  password_min: 'Mínimo 6 caracteres',
  wrong_password: 'Contraseña incorrecta',
  wrong_current_password: 'La contraseña actual es incorrecta',
  welcome_scan: 'Escanea para abrir el Hub',
  welcome_configure: 'Configura la URL pública del Hub en Ajustes para mostrar aquí un código QR.',
  memory_year_ago: 'Un día como hoy hace 1 año',
  memory_years_ago: 'Un día como hoy hace {n} años',
  test_canvas_name: 'Canvas de prueba',
  ble_no_mac: 'No se conoce la dirección Bluetooth de este Canvas',
  ble_mac_invalid: 'Dirección Bluetooth no válida (AA:BB:CC:DD:EE:FF)',
  ble_unavailable: 'El Bluetooth del Hub no está disponible',
  ble_wake_failed: 'No se pudo despertar por Bluetooth: {detail}',
  ble_woke_no_reply: 'Se envió la señal por Bluetooth, pero el Canvas no respondió por Wi-Fi',
};

export type MsgKey = keyof typeof es;

const eu: Record<MsgKey, string> = {
  collection_not_found: 'Ez da {id} bilduma aurkitu',
  immich_not_configured: 'Immich ez dago konfiguratuta',
  canvas_not_found: 'Ez da {id} Canvasa aurkitu',
  playlist_empty: '«{name}» zerrendak ez du irudirik',
  image_not_found: 'Ez da {id} irudia aurkitu',
  unsupported_image: '{name}: irudi-formatu hau ez da onartzen',
  original_missing: 'Jatorrizko fitxategia ez dago eskuragarri',
  immich_fetch_failed: 'Ezin izan da {id} irudia Immich-etik lortu',
  cron_fields: 'Cron adierazpenak 5 eremu izan behar ditu: minutua ordua eguna hilabetea asteko-eguna',
  cron_invalid: 'Cron adierazpen baliogabea: {detail}',
  time_invalid: 'Ordu baliogabea (HH:MM)',
  interval_invalid: 'Tarte baliogabea',
  days_invalid: 'Egun kopuru baliogabea',
  weeks_invalid: 'Aste kopuru baliogabea',
  weekday_invalid: 'Asteko egun baliogabea',
  monthday_invalid: 'Hileko egun baliogabea (1–28)',
  cron_never: 'Cron adierazpena ez da inoiz exekutatzen',
  cron_too_frequent: 'Gehienez orduro alda daiteke: cron adierazpena maizago exekutatzen da',
  schedule_invalid: 'Programazio mota baliogabea',
  host_missing: 'Canvasaren IPa falta da',
  unknown_action: 'Ekintza ezezaguna',
  play_target_missing: 'Adierazi galeria, irudia edo erreprodukzio-zerrenda',
  public_url_missing: 'Konfiguratu Hub-aren URL publikoa (Ezarpenak) pull modurako',
  public_url_localhost: 'URL publikoa ezin da localhost izan: Canvasak bertara iritsi behar du',
  no_photos_selected: 'Ez dago argazkirik hautatuta',
  bad_hash: 'Hash baliogabea',
  render_not_found: 'Ez da irudia aurkitu',
  name_missing: 'Izena falta da',
  collection_type_invalid: 'Bilduma mota baliogabea',
  manual_only: 'Eskuzko bildumetan bakarrik gehi daitezke argazkiak',
  canvas_offline: 'Canvasak ez du erantzuten (lo al dago?)',
  not_authenticated: 'Ez zaude saioa hasita',
  already_setup: 'Dagoeneko konfiguratuta dago',
  canvas_already_added: 'Canvas hau «{name}» izenarekin gehituta dago jada',
  password_min: 'Gutxienez 6 karaktere',
  wrong_password: 'Pasahitz okerra',
  wrong_current_password: 'Uneko pasahitza okerra da',
  welcome_scan: 'Eskaneatu Hub-a irekitzeko',
  welcome_configure: 'Konfiguratu Hub-aren URL publikoa Ezarpenetan, hemen QR kode bat erakusteko.',
  memory_year_ago: 'Duela urte bat, gaur bezalako egun batean',
  memory_years_ago: 'Duela {n} urte, gaur bezalako egun batean',
  test_canvas_name: 'Proba-Canvasa',
  ble_no_mac: 'Ez da ezagutzen Canvas honen Bluetooth helbidea',
  ble_mac_invalid: 'Bluetooth helbide baliogabea (AA:BB:CC:DD:EE:FF)',
  ble_unavailable: 'Hub-aren Bluetootha ez dago eskuragarri',
  ble_wake_failed: 'Ezin izan da Bluetooth bidez esnatu: {detail}',
  ble_woke_no_reply: 'Bluetooth seinalea bidali da, baina Canvasak ez du Wi-Fi bidez erantzun',
};

const en: Record<MsgKey, string> = {
  collection_not_found: 'Collection {id} not found',
  immich_not_configured: 'Immich is not configured',
  canvas_not_found: 'Canvas {id} not found',
  playlist_empty: 'The playlist "{name}" has no images',
  image_not_found: 'Image {id} not found',
  unsupported_image: '{name}: unsupported image format',
  original_missing: 'Original file not available',
  immich_fetch_failed: 'Could not fetch image {id} from Immich',
  cron_fields: 'A cron expression needs 5 fields: minute hour day month weekday',
  cron_invalid: 'Invalid cron expression: {detail}',
  time_invalid: 'Invalid time (HH:MM)',
  interval_invalid: 'Invalid interval',
  days_invalid: 'Invalid number of days',
  weeks_invalid: 'Invalid number of weeks',
  weekday_invalid: 'Invalid weekday',
  monthday_invalid: 'Invalid day of month (1–28)',
  cron_never: 'The cron expression never runs',
  cron_too_frequent: 'Changes can be at most hourly: this cron expression runs more often',
  schedule_invalid: 'Invalid schedule type',
  host_missing: 'The Canvas IP is missing',
  unknown_action: 'Unknown action',
  play_target_missing: 'Specify a gallery, image or playlist',
  public_url_missing: 'Set the hub public URL (Settings) to use pull mode',
  public_url_localhost: 'The public URL cannot be localhost: the Canvas must be able to reach it',
  no_photos_selected: 'No photos selected',
  bad_hash: 'Invalid hash',
  render_not_found: 'Render not found',
  name_missing: 'Name is missing',
  collection_type_invalid: 'Invalid collection type',
  manual_only: 'Photos can only be added to manual collections',
  canvas_offline: 'The Canvas is not responding (asleep?)',
  not_authenticated: 'Not signed in',
  already_setup: 'Already set up',
  canvas_already_added: 'This Canvas is already added as “{name}”',
  password_min: 'At least 6 characters',
  wrong_password: 'Wrong password',
  wrong_current_password: 'The current password is wrong',
  welcome_scan: 'Scan to open the Hub',
  welcome_configure: 'Set the hub public URL in Settings to show a QR code here.',
  memory_year_ago: 'On this day 1 year ago',
  memory_years_ago: 'On this day {n} years ago',
  test_canvas_name: 'Test Canvas',
  ble_no_mac: 'The Bluetooth address of this Canvas is unknown',
  ble_mac_invalid: 'Invalid Bluetooth address (AA:BB:CC:DD:EE:FF)',
  ble_unavailable: 'The hub’s Bluetooth is not available',
  ble_wake_failed: 'Could not wake over Bluetooth: {detail}',
  ble_woke_no_reply: 'The Bluetooth wake was sent, but the Canvas did not answer over Wi-Fi',
};

const catalogues: Record<Lang, Record<MsgKey, string>> = { es, eu, en };

/** BCP 47 locale used for dates in each language. */
export const locales: Record<Lang, string> = { es: 'es-ES', eu: 'eu-ES', en: 'en-GB' };

export type MsgVars = Record<string, string | number>;

const EU_MONTHS_GENITIVE = [
  'urtarrilaren', 'otsailaren', 'martxoaren', 'apirilaren', 'maiatzaren', 'ekainaren',
  'uztailaren', 'abuztuaren', 'irailaren', 'urriaren', 'azaroaren', 'abenduaren',
];

/**
 * Basque year suffix: "-ko" after a spoken vowel, "-eko" after a consonant
 * (bat, bost, hamar, hamabost, ehun). Basque counts in twenties: 35 = hogeita hamabost.
 */
function basqueYearSuffix(year: number): string {
  const r = year % 100;
  if (r === 0) return year % 1000 === 0 ? 'ko' : 'eko'; // mila / ...ehun
  const u = r % 20;
  if (u === 0) return 'ko'; // hogei, berrogei, hirurogei, laurogei
  return [1, 5, 10, 15].includes(u) ? 'eko' : 'ko';
}

/** "2019ko urriaren 6a" — ICU only offers the generic "2019(e)ko urriaren 6(a)". */
export function basqueDate(d: Date): string {
  const y = d.getUTCFullYear();
  return `${y}${basqueYearSuffix(y)} ${EU_MONTHS_GENITIVE[d.getUTCMonth()]} ${d.getUTCDate()}a`;
}

export function tr(lang: Lang, key: MsgKey, vars: MsgVars = {}): string {
  return catalogues[lang][key].replace(/\{(\w+)\}/g, (_, v) => String(vars[v] ?? `{${v}}`));
}

export const isLang = (v: unknown): v is Lang => languages.includes(v as Lang);

/** The hub-wide language (Settings); used for anything shown on the Canvas itself. */
export function hubLang(db: DB): Lang {
  const l = getSetting(db, 'language');
  return isLang(l) ? l : 'en';
}

/** Language for an API response: the UI's explicit choice, else the browser's, else the hub's. */
export function requestLang(req: FastifyRequest, db: DB): Lang {
  const explicit = req.headers['x-hub-lang'];
  if (isLang(explicit)) return explicit;
  const accepted = String(req.headers['accept-language'] ?? '')
    .split(',')
    .map((p) => p.trim().slice(0, 2).toLowerCase());
  return accepted.find(isLang) ?? hubLang(db);
}
