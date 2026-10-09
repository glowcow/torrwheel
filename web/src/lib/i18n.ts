import { createContext, useContext } from "react";

export type Lang = "en" | "ru";

/** Each language in its own name, in menu order. */
export const LANGS: { id: Lang; name: string }[] = [
  { id: "en", name: "English" },
  { id: "ru", name: "Русский" },
];

/** What numbers and dates are formatted for. */
export const LOCALE: Record<Lang, string> = { en: "en-GB", ru: "ru-RU" };

export const STORAGE_KEY = "lang";

type PluralForms = { one: string; few?: string; many?: string; other: string };

const RULES: Record<Lang, Intl.PluralRules> = {
  en: new Intl.PluralRules(LOCALE.en),
  ru: new Intl.PluralRules(LOCALE.ru),
};

function plural(lang: Lang, n: number, forms: PluralForms): string {
  return forms[RULES[lang].select(n) as keyof PluralForms] ?? forms.other;
}

// Only the labels the app authors: torrent names, paths and the daemon's
// error texts are data and are never run through here.
const en = {
  settings: "Settings",
  theme: "Theme",
  themeSystem: "System",
  themeLight: "Light",
  themeDark: "Dark",
  palette: "Colour scheme",
  paletteClassic: "Classic",
  paletteWarm: "Warm",
  language: "Language",

  searchPlaceholder: "Filter by name…",
  searchClear: "Clear the filter",
  add: "Add",
  addHint: "Add a torrent",

  headline: {
    downloading: (n: number) => `Downloading ${n} ${plural("en", n, { one: "torrent", other: "torrents" })}`,
    moving: (n: number) => `Moving ${n} ${plural("en", n, { one: "torrent", other: "torrents" })} to disk`,
    seeding: (n: number) => `Seeding ${n} ${plural("en", n, { one: "torrent", other: "torrents" })}`,
    idle: "All quiet",
  },
  downloadSpeed: "Download speed",
  stat: { upload: "upload", left: "left", downloading: "active", seeding: "seeding", paused: "paused", errors: "errors" },
  statHint: {
    upload: "Upload speed of every torrent together",
    left: "Still to download, over every torrent",
    downloading: "Torrents downloading now",
    seeding: "Torrents seeding now",
    paused: "Paused torrents",
    errors: "Torrents the daemon reports an error for",
  },

  torrentCount: (n: number) => plural("en", n, { one: "torrent", other: "torrents" }),
  noTorrents: "No torrents yet.",
  noMatches: "Nothing matches the filter.",
  filter: {
    all: "All",
    downloading: "Downloading",
    seeding: "Seeding",
    paused: "Paused",
  },
  sortLabel: "Sort",
  sort: { added: "Added", name: "Name", size: "Size", progress: "Progress" },

  status: {
    paused: "Paused",
    done: "Downloaded",
    checking: "Checking",
    queued: "Queued",
    downloading: "Downloading",
    seeding: "Seeding",
    error: "Error",
    metadata: "Retrieving metadata",
    moving: "Moving to disk",
  },
  metaStatus: "Status",
  metaProgress: "Progress",
  metaSize: "Size",
  metaSpeed: "Speed",
  metaPeers: "Peers",
  metaRatio: "Ratio",
  metaLocation: "Location",
  metaAdded: "Added",
  metaHash: "Hash",
  metaTransfer: "Transfer",
  metaActivity: "Last activity",
  metaPieces: "Pieces",
  metaPrivacy: "Privacy",
  metaOrigin: "Created",
  metaComment: "Comment",
  downloaded: "downloaded",
  privateTorrent: "Private to its tracker",
  publicTorrent: "Public",
  never: "never",
  ago: (span: string) => `${span} ago`,
  nextIn: (span: string) => `next in ${span}`,
  peersTitle: "Peers",
  noPeers: "No peers connected.",
  peerEncrypted: "Encrypted connection",
  peerPlain: "Not encrypted",
  peerIncoming: "the peer connected to us",
  trackersTitle: "Trackers",
  noTrackers: "No trackers: peers come from DHT and peer exchange.",
  tier: (n: number) => `Tier ${n}`,
  trackerBackup: "backup",
  announceOk: (n: number) => `Got ${n} ${plural("en", n, { one: "peer", other: "peers" })}`,
  announceFailed: "Announce failed",
  announceNever: "Not announced yet",
  swarm: (seeders: string, leechers: string) => `${seeders} seeding, ${leechers} downloading`,
  peers: (n: number) => `${n} ${plural("en", n, { one: "peer", other: "peers" })}`,
  left: (span: string) => `${span} left`,
  of: "of",
  uploaded: "uploaded",

  torrent: "Torrent",
  close: "Close",
  loading: "Loading…",
  gone: "This torrent is no longer in the daemon.",
  pause: "Pause",
  resume: "Resume",
  verify: "Verify",
  remove: "Remove",
  removeWithData: "Remove with data",
  removeBody: (name: string) => `“${name}” leaves the list. Its files stay on disk.`,
  removeWithDataBody: (name: string) => `“${name}” leaves the list and its downloaded files are deleted from disk.`,
  cancel: "Cancel",
  files: "Files",
  wantedOf: (wanted: number, total: number) => `${wanted} of ${total} picked`,
  pickFile: "Download this file",
  pickFolder: "Download this folder",
  priority: { high: "High priority", normal: "Normal priority", low: "Low priority", mixed: "Mixed priorities" },

  addTitle: "Add a torrent",
  addLinkLabel: "Magnet link or URL",
  addLinkPlaceholder: "magnet:?xt=urn:btih:…",
  addFileLabel: "Or a .torrent file",
  addChooseFile: "Choose a file",
  addDirLabel: "Download to",
  addDirList: "Known directories",
  addDirFree: (free: string) => `${free} free`,
  addDirUnknown: "Not there yet, or the daemon cannot read it",
  addDuplicate: "This torrent is already in the list.",

  unit: { s: "s", m: "m", h: "h", d: "d", b: "B", kb: "KB", mb: "MB", gb: "GB", tb: "TB" },

  built: "built",
  geoCredit: "IP geolocation by DB-IP",
  daemon: "Daemon",
  unreachable: "unreachable",
  daemonUnreachable: "Daemon unreachable",
  unknownError: "unknown error",
};

export type Dict = typeof en;

const ru: Dict = {
  settings: "Настройки",
  theme: "Тема",
  themeSystem: "Системная",
  themeLight: "Светлая",
  themeDark: "Тёмная",
  palette: "Цветовая схема",
  paletteClassic: "Классическая",
  paletteWarm: "Тёплая",
  language: "Язык",

  searchPlaceholder: "Фильтр по имени…",
  searchClear: "Сбросить фильтр",
  add: "Добавить",
  addHint: "Добавить торрент",

  headline: {
    downloading: (n) =>
      `${plural("ru", n, { one: "Скачивается", other: "Скачиваются" })} ${n} ${plural("ru", n, { one: "торрент", few: "торрента", many: "торрентов", other: "торрента" })}`,
    moving: (n) =>
      `${plural("ru", n, { one: "Переносится", other: "Переносятся" })} на диск ${n} ${plural("ru", n, { one: "торрент", few: "торрента", many: "торрентов", other: "торрента" })}`,
    seeding: (n) =>
      `${plural("ru", n, { one: "Раздаётся", other: "Раздаются" })} ${n} ${plural("ru", n, { one: "торрент", few: "торрента", many: "торрентов", other: "торрента" })}`,
    idle: "Тишина",
  },
  downloadSpeed: "Скорость загрузки",
  stat: { upload: "отдача", left: "осталось", downloading: "активных", seeding: "раздаётся", paused: "на паузе", errors: "ошибок" },
  statHint: {
    upload: "Скорость отдачи по всем торрентам",
    left: "Осталось скачать по всем торрентам",
    downloading: "Торренты, которые скачиваются сейчас",
    seeding: "Торренты, которые раздаются сейчас",
    paused: "Торренты на паузе",
    errors: "Торренты, по которым демон сообщает об ошибке",
  },

  torrentCount: (n) => plural("ru", n, { one: "торрент", few: "торрента", many: "торрентов", other: "торрента" }),
  noTorrents: "Торрентов пока нет.",
  noMatches: "Под фильтр ничего не подходит.",
  filter: {
    all: "Все",
    downloading: "Скачиваются",
    seeding: "Раздаются",
    paused: "На паузе",
  },
  sortLabel: "Сортировка",
  sort: { added: "Дата", name: "Имя", size: "Размер", progress: "Готово" },

  status: {
    paused: "На паузе",
    done: "Скачан",
    checking: "Проверяется",
    queued: "В очереди",
    downloading: "Скачивается",
    seeding: "Раздаётся",
    error: "Ошибка",
    metadata: "Получает метаданные",
    moving: "Переносится на диск",
  },
  metaStatus: "Статус",
  metaProgress: "Прогресс",
  metaSize: "Размер",
  metaSpeed: "Скорость",
  metaPeers: "Пиры",
  metaRatio: "Рейтинг",
  metaLocation: "Каталог",
  metaAdded: "Добавлен",
  metaHash: "Хеш",
  metaTransfer: "Передано",
  metaActivity: "Активность",
  metaPieces: "Части",
  metaPrivacy: "Доступ",
  metaOrigin: "Создан",
  metaComment: "Комментарий",
  downloaded: "скачано",
  privateTorrent: "Приватный, только свой трекер",
  publicTorrent: "Публичный",
  never: "никогда",
  ago: (span) => `${span} назад`,
  nextIn: (span) => `следующий через ${span}`,
  peersTitle: "Пиры",
  noPeers: "Пиров нет.",
  peerEncrypted: "Соединение зашифровано",
  peerPlain: "Без шифрования",
  peerIncoming: "пир подключился к нам",
  trackersTitle: "Трекеры",
  noTrackers: "Трекеров нет: пиры приходят из DHT и обмена пирами.",
  tier: (n) => `Уровень ${n}`,
  trackerBackup: "запасной",
  announceOk: (n) => `Получено ${n} ${plural("ru", n, { one: "пир", few: "пира", many: "пиров", other: "пира" })}`,
  announceFailed: "Анонс не удался",
  announceNever: "Ещё не анонсировался",
  swarm: (seeders, leechers) => `раздают ${seeders}, качают ${leechers}`,
  peers: (n) => `${n} ${plural("ru", n, { one: "пир", few: "пира", many: "пиров", other: "пира" })}`,
  left: (span) => `осталось ${span}`,
  of: "из",
  uploaded: "отдано",

  torrent: "Торрент",
  close: "Закрыть",
  loading: "Загрузка…",
  gone: "Этого торрента в демоне больше нет.",
  pause: "Пауза",
  resume: "Продолжить",
  verify: "Проверить",
  remove: "Удалить",
  removeWithData: "Удалить с данными",
  removeBody: (name) => `«${name}» уйдёт из списка. Файлы останутся на диске.`,
  removeWithDataBody: (name) => `«${name}» уйдёт из списка, а скачанные файлы будут удалены с диска.`,
  cancel: "Отмена",
  files: "Файлы",
  wantedOf: (wanted, total) => `выбрано ${wanted} из ${total}`,
  pickFile: "Скачивать этот файл",
  pickFolder: "Скачивать эту папку",
  priority: { high: "Высокий приоритет", normal: "Обычный приоритет", low: "Низкий приоритет", mixed: "Разные приоритеты" },

  addTitle: "Добавить торрент",
  addLinkLabel: "Magnet-ссылка или URL",
  addLinkPlaceholder: "magnet:?xt=urn:btih:…",
  addFileLabel: "Или файл .torrent",
  addChooseFile: "Выбрать файл",
  addDirLabel: "Куда скачивать",
  addDirList: "Известные каталоги",
  addDirFree: (free) => `свободно ${free}`,
  addDirUnknown: "Каталога пока нет, или демон не может его прочитать",
  addDuplicate: "Этот торрент уже есть в списке.",

  unit: { s: "с", m: "м", h: "ч", d: "д", b: "Б", kb: "КБ", mb: "МБ", gb: "ГБ", tb: "ТБ" },

  built: "собрано",
  geoCredit: "Геолокация по IP — DB-IP",
  daemon: "Демон",
  unreachable: "недоступен",
  daemonUnreachable: "Демон недоступен",
  unknownError: "неизвестная ошибка",
};

export const dicts: Record<Lang, Dict> = { en, ru };

export type Ctx = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: Dict;
  locale: string;
};

export const LangCtx = createContext<Ctx | null>(null);

/** Stored choice, else the browser's language when the app has it, else English. */
export function detectInitialLang(): Lang {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "en" || stored === "ru") return stored;
  } catch {
    // No storage: fall through to the browser's language.
  }
  return navigator.language.toLowerCase().startsWith("ru") ? "ru" : "en";
}

export function useLang(): Ctx {
  const v = useContext(LangCtx);
  if (!v) throw new Error("useLang must be used inside <LangProvider>");
  return v;
}
