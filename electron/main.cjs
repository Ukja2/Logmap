const { app, BrowserWindow, Menu, ipcMain, protocol, net, dialog, shell, systemPreferences } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { seedBoards, defaultTemplates } = require('./seed.cjs');

const APP_NAME = 'Logmap';
app.setName(APP_NAME);

// 예전 이름(Logbook)으로 쓰던 설정을 새 이름으로 옮겨 온다 (처음 한 번만)
const LEGACY_NAME = 'Logbook';
try {
  const ud = app.getPath('userData');
  const old = path.join(path.dirname(ud), LEGACY_NAME);
  if (!fsSync.existsSync(path.join(ud, 'config.json')) && fsSync.existsSync(old)) {
    fsSync.mkdirSync(ud, { recursive: true });
    for (const item of ['config.json', 'Local Storage']) {
      const from = path.join(old, item);
      if (fsSync.existsSync(from)) fsSync.cpSync(from, path.join(ud, item), { recursive: true });
    }
  }
} catch { /* 옮기지 못해도 새로 시작 */ }

// macOS가 편집 메뉴에 자동으로 붙이는 '받아쓰기 시작', '이모지 및 기호' 숨기기
if (process.platform === 'darwin') {
  systemPreferences.setUserDefault('NSDisabledDictationMenuItem', 'boolean', true);
  systemPreferences.setUserDefault('NSDisabledCharacterPaletteMenuItem', 'boolean', true);
}

// asset://local/<파일명>      → 보드 이미지 (assets 폴더)
// localfile://f/<절대경로>    → 열어 본 .md 파일 옆의 이미지
protocol.registerSchemesAsPrivileged([
  { scheme: 'asset', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
  { scheme: 'localfile', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

const IMG_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg']);
const MD_EXT = new Set(['.md', '.markdown', '.mdx', '.txt']);
const ID_RE = /^[A-Za-z0-9_-]+$/;
const MAX_RECENT = 50;

let win = null;
let dataDir = '';
let quitting = false;
const pendingOpen = []; // 앱이 준비되기 전에 Finder에서 연 파일들
const allowedDirs = new Set(); // localfile:// 로 읽을 수 있는 폴더

// ---------- 설정 / 경로 ----------
const configFile = () => path.join(app.getPath('userData'), 'config.json');
function readConfig() {
  try { return JSON.parse(fsSync.readFileSync(configFile(), 'utf8')); } catch { return {}; }
}
function writeConfig(cfg) {
  fsSync.mkdirSync(path.dirname(configFile()), { recursive: true });
  fsSync.writeFileSync(configFile(), JSON.stringify(cfg, null, 2));
}
const boardsDir = () => path.join(dataDir, 'boards');
const assetsDir = () => path.join(dataDir, 'assets');
const exportsDir = () => path.join(dataDir, 'exports');

function boardFile(id) {
  if (typeof id !== 'string' || !ID_RE.test(id)) throw new Error('invalid board id');
  return path.join(boardsDir(), `${id}.json`);
}
function assetFile(name) {
  const base = path.basename(String(name));
  if (base !== name || base.startsWith('.')) throw new Error('invalid asset name');
  return path.join(assetsDir(), base);
}
async function writeJson(file, obj) {
  const tmp = `${file}.${crypto.randomBytes(4).toString('hex')}.tmp`; // 동시 저장끼리 임시 파일이 겹치지 않게
  await fs.writeFile(tmp, JSON.stringify(obj, null, 2));
  await fs.rename(tmp, file);
}

/** 기본 데이터 폴더: ~/Documents/Logmap */
const defaultDataDir = () => path.join(app.getPath('documents'), APP_NAME);

async function initDataDir(dir) {
  dataDir = dir;
  await fs.mkdir(boardsDir(), { recursive: true });
  await fs.mkdir(assetsDir(), { recursive: true });
  const existing = (await fs.readdir(boardsDir())).filter((f) => f.endsWith('.json'));
  if (existing.length === 0) {
    for (const b of seedBoards()) await writeJson(boardFile(b.id), b);
  }
}

// ---------- 보드 IPC ----------
ipcMain.handle('boards:list', async () => {
  const files = (await fs.readdir(boardsDir())).filter((f) => f.endsWith('.json'));
  const out = [];
  for (const f of files) {
    try {
      const b = JSON.parse(await fs.readFile(path.join(boardsDir(), f), 'utf8'));
      out.push({
        id: b.id,
        name: b.name,
        emoji: b.emoji,
        icon: b.icon,
        color: b.color,
        createdAt: b.createdAt,
        updatedAt: b.updatedAt,
        text: (b.widgets || []).map((w) => (w.type === 'note' || w.type === 'text' ? w.content || '' : w.type === 'file' ? path.basename(w.path || '') : '')).join('\n'),
        files: (b.widgets || []).filter((w) => w.type === 'file' && w.path).map((w) => nfc(w.path)),
      });
    } catch { /* 손상된 파일은 건너뜀 */ }
  }
  out.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  return out;
});

ipcMain.handle('boards:load', async (_e, id) => {
  const b = JSON.parse(await fs.readFile(boardFile(id), 'utf8'));
  for (const w of b.widgets || []) if (w.path) w.path = nfc(w.path);
  return b;
});
ipcMain.handle('boards:save', async (_e, board) => { await writeJson(boardFile(board.id), board); return true; });
ipcMain.handle('boards:delete', async (_e, id) => { await shell.trashItem(boardFile(id)); return true; });

ipcMain.handle('boards:export', async (_e, board) => {
  await fs.mkdir(exportsDir(), { recursive: true });
  const safeName = String(board.name || 'board').replace(/[\\/:*?"<>|]/g, '_');
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    defaultPath: path.join(exportsDir(), `${safeName}.md`),
    filters: [{ name: 'Markdown', extensions: ['md'] }],
  });
  if (canceled || !filePath) return null;
  const relAsset = (name) =>
    encodeURI(path.relative(path.dirname(filePath), assetFile(name)).split(path.sep).join('/'));
  // 읽기 순서: 그룹은 한 덩어리(## 그룹 이름 아래), 나머지는 위→아래·왼쪽→오른쪽 (렌더러의 readingUnits와 같은 규칙)
  const order = (a, b) => a.y - b.y || a.x - b.x;
  const units = [];
  const grouped = new Set();
  for (const g of board.groups || []) {
    const items = board.widgets.filter((w) => w.groupId === g.id).sort(order);
    if (!items.length) continue;
    items.forEach((w) => grouped.add(w.id));
    units.push({ group: g, items, x: Math.min(...items.map((w) => w.x)), y: Math.min(...items.map((w) => w.y)) });
  }
  for (const w of board.widgets) if (!grouped.has(w.id)) units.push({ items: [w], x: w.x, y: w.y });
  units.sort(order);
  // 문서 순서를 직접 정했으면 그 순서 먼저, 나머지는 위치 순서대로 뒤에 (렌더러 readingUnits와 같은 규칙)
  if (Array.isArray(board.docOrder) && board.docOrder.length) {
    const rank = new Map(board.docOrder.map((k, i) => [k, i]));
    const keyOf = (u) => (u.group ? u.group.id : u.items[0].id);
    const at = (u) => rank.get(keyOf(u)) ?? Infinity;
    const pos = new Map(units.map((u, i) => [u, i]));
    units.sort((a, b) => at(a) - at(b) || pos.get(a) - pos.get(b));
  }
  const sorted = [];
  for (const u of units) {
    sorted.push(...u.items);
  }
  const parts = [`# ${board.name}`];
  for (const w of sorted) {
    if (w.type === 'text' && (w.content || '').trim()) {
      const lvl = w.level || 0;
      parts.push(lvl > 0 ? w.content.trim().split('\n').map((l) => `${'#'.repeat(lvl)} ${l}`).join('\n') : w.content.trim());
    }
    if (w.type === 'note' && (w.content || '').trim()) {
      parts.push(w.content.trim().replace(/asset:\/\/local\/([^)\s]+)/g, (m, n) => {
        try { return relAsset(decodeURIComponent(n)); } catch { return m; }
      }));
    }
    if (w.type === 'image' && w.src) parts.push(`![](${relAsset(w.src)})`);
    if (w.type === 'file' && w.path) {
      try { parts.push((await fs.readFile(mdPath(w.path), 'utf8')).trim()); } catch { parts.push(`> 파일을 찾을 수 없음: ${w.path}`); }
    }
  }
  await fs.writeFile(filePath, parts.join('\n\n---\n\n') + '\n');
  shell.showItemInFolder(filePath);
  return filePath;
});

// ---------- 이미지 IPC ----------
function newAssetName(ext) {
  return `${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}${ext}`;
}
ipcMain.handle('assets:save', async (_e, name, data) => {
  let ext = path.extname(String(name)).toLowerCase();
  if (!IMG_EXT.has(ext)) ext = '.png';
  const file = newAssetName(ext);
  await fs.writeFile(path.join(assetsDir(), file), Buffer.from(data));
  return file;
});
ipcMain.handle('assets:pick', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'] }],
  });
  if (canceled) return [];
  const out = [];
  for (const p of filePaths) {
    const ext = path.extname(p).toLowerCase();
    if (!IMG_EXT.has(ext)) continue;
    const file = newAssetName(ext);
    await fs.copyFile(p, path.join(assetsDir(), file));
    out.push(file);
  }
  return out;
});

// ---------- 마크다운 파일 뷰어 IPC ----------
/**
 * macOS는 한글 파일 이름을 자모 분리형(NFD)으로 주기도 해서, 같은 파일이 다른 문자열로 보일 수 있다.
 * 앱에 들어오는 모든 경로를 완성형(NFC)으로 맞춘다. (APFS는 두 형태 모두 같은 파일로 연다)
 */
const nfc = (p) => String(p).normalize('NFC');
function recentFiles() {
  return [...new Set((readConfig().recentFiles || []).map(nfc))].filter((p) => fsSync.existsSync(p));
}
/** 사이드바 '파일' 목록: 이미 있는 파일은 순서를 그대로 두고, 처음 연 파일만 맨 아래에 추가 */
function pushRecent(p) {
  const cfg = readConfig();
  const list = [...new Set((cfg.recentFiles || []).map(nfc))];
  p = nfc(p);
  if (list.includes(p) && list.length === (cfg.recentFiles || []).length) return;
  cfg.recentFiles = (list.includes(p) ? list : [...list, p]).slice(-MAX_RECENT);
  writeConfig(cfg);
}
function mdPath(p) {
  const abs = nfc(path.resolve(String(p)));
  if (!MD_EXT.has(path.extname(abs).toLowerCase())) throw new Error('마크다운 파일이 아닙니다');
  return abs;
}
async function readText(p) {
  const abs = mdPath(p);
  const [content, st] = await Promise.all([fs.readFile(abs, 'utf8'), fs.stat(abs)]);
  allowedDirs.add(path.dirname(abs)); // 파일 옆의 상대 경로 이미지 허용
  return { path: abs, name: path.basename(abs), dir: path.dirname(abs), content, mtime: st.mtimeMs };
}
async function readMarkdown(p) {
  const f = await readText(p);
  pushRecent(f.path);
  return f;
}

ipcMain.handle('files:pick', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    properties: ['openFile'],
    filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'mdx', 'txt'] }],
  });
  if (canceled || !filePaths[0]) return null;
  return readMarkdown(filePaths[0]);
});
ipcMain.handle('files:pickMany', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'mdx', 'txt'] }],
  });
  return canceled ? [] : filePaths.map(nfc);
});
ipcMain.handle('folders:pick', async (_e, title) => {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: title || '폴더 선택',
    properties: ['openDirectory', 'createDirectory'],
  });
  return canceled || !filePaths[0] ? null : filePaths[0];
});
ipcMain.handle('files:read', (_e, p) => readMarkdown(p));
ipcMain.handle('files:readText', (_e, p) => readText(p));
ipcMain.handle('files:writeText', async (_e, p, content) => {
  const abs = mdPath(p);
  await fs.writeFile(abs, String(content));
  return true;
});
/** 폴더(하위 2단계까지)의 .md 파일과 파일 간 링크 */
ipcMain.handle('files:scanFolder', async (_e, dir) => {
  const found = [];
  async function walk(d, depth) {
    const entries = await fs.readdir(d, { withFileTypes: true });
    for (const ent of entries) {
      if (ent.name.startsWith('.') || ent.name === 'node_modules') continue;
      const p = path.join(d, ent.name);
      if (ent.isDirectory() && depth < 2) await walk(p, depth + 1);
      else if (ent.isFile() && MD_EXT.has(path.extname(ent.name).toLowerCase()) && found.length < 80) found.push(nfc(p));
    }
  }
  await walk(dir, 0);
  found.sort((a, b) => a.localeCompare(b, 'ko'));
  const set = new Set(found);
  const out = [];
  for (const p of found) {
    const f = await readText(p);
    const links = new Set();
    for (const m of f.content.matchAll(/\]\(([^)\s]+?\.(?:md|markdown))(?:#[^)]*)?\)/gi)) {
      try {
        const target = nfc(path.resolve(path.dirname(p), decodeURIComponent(m[1])));
        if (set.has(target) && target !== p) links.add(target);
      } catch { /* ignore */ }
    }
    out.push({ ...f, links: [...links] });
  }
  return out;
});
/**
 * 메모를 .md 파일로 저장 (저장 위치는 사용자가 고름).
 * 메모 속 보드 이미지(asset://)는 파일 옆 images/ 폴더로 복사하고 상대 경로로 바꾼다.
 */
ipcMain.handle('files:saveNew', async (_e, name, content) => {
  const cfg = readConfig();
  const safe = (String(name || '').replace(/[\\/:*?"<>|#\n\r]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)) || '새 메모';
  const startDir = cfg.lastSaveDir && fsSync.existsSync(cfg.lastSaveDir) ? cfg.lastSaveDir : app.getPath('documents');
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: '메모를 .md 파일로 저장',
    defaultPath: path.join(startDir, `${safe}.md`),
    filters: [{ name: 'Markdown', extensions: ['md'] }],
  });
  if (canceled || !filePath) return null;
  const abs = mdPath(filePath);
  const dir = path.dirname(abs);
  let text = String(content ?? '');
  const refs = [...new Set([...text.matchAll(/asset:\/\/local\/([^)\s"']+)/g)].map((m) => m[1]))];
  if (refs.length) {
    await fs.mkdir(path.join(dir, 'images'), { recursive: true });
    for (const ref of refs) {
      try {
        const n = decodeURIComponent(ref);
        await fs.copyFile(assetFile(n), path.join(dir, 'images', n));
        text = text.split(`asset://local/${ref}`).join(`images/${encodeURIComponent(n)}`);
      } catch { /* 없는 이미지는 그대로 둠 */ }
    }
  }
  await fs.writeFile(abs, text);
  writeConfig({ ...readConfig(), lastSaveDir: dir });
  pushRecent(abs);
  allowedDirs.add(dir);
  return { path: abs, content: text };
});
ipcMain.handle('files:resolve', (_e, base, href) =>
  readMarkdown(path.resolve(path.dirname(base), decodeURIComponent(String(href).split('#')[0]))));
ipcMain.handle('files:recent', () => recentFiles());

ipcMain.handle('files:reveal', (_e, p) => shell.showItemInFolder(mdPath(p)));
ipcMain.handle('files:pending', () => pendingOpen.splice(0));

// 보고 있는 파일들 감시 (에디터가 저장 시 파일을 교체해도 감지되도록 폴링)
const watchedFiles = new Set();
ipcMain.handle('files:watchSet', (_e, paths) => {
  const next = new Set((Array.isArray(paths) ? paths : []).flatMap((p) => { try { return [mdPath(p)]; } catch { return []; } }));
  for (const p of watchedFiles) if (!next.has(p)) { fsSync.unwatchFile(p); watchedFiles.delete(p); }
  for (const p of next) {
    if (watchedFiles.has(p)) continue;
    watchedFiles.add(p);
    fsSync.watchFile(p, { interval: 700 }, (cur, prev) => {
      if (cur.mtimeMs !== prev.mtimeMs) win?.webContents.send('files:changed', p);
    });
  }
  return true;
});

// ---------- 템플릿 ----------
const templatesFile = () => path.join(dataDir, 'templates.json');
ipcMain.handle('templates:load', async () => {
  try {
    return JSON.parse(await fs.readFile(templatesFile(), 'utf8'));
  } catch {
    const list = defaultTemplates();
    await writeJson(templatesFile(), list);
    return list;
  }
});
ipcMain.handle('templates:save', async (_e, list) => { await writeJson(templatesFile(), list); return true; });

// Finder에서 .md 파일을 Logmap으로 열기
app.on('open-file', (e, p) => {
  p = nfc(p);
  e.preventDefault();
  if (win && !win.isDestroyed()) win.webContents.send('files:open-path', p);
  else pendingOpen.push(p);
});

// ---------- 앱 IPC ----------
ipcMain.handle('app:dataDir', () => dataDir);
ipcMain.handle('app:openDataDir', () => shell.openPath(dataDir));

// ---------- 창 ----------
function createWindow() {
  const w = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    title: APP_NAME,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 18 },
    backgroundColor: '#f7f7f8',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
    },
  });
  win = w;

  // 카메라·마이크·알림 등 권한 요청은 쓰지 않으므로 모두 거절, <webview>도 막음
  w.webContents.session.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
  w.webContents.on('will-attach-webview', (e) => e.preventDefault());

  // 링크는 외부 브라우저로
  w.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  w.webContents.on('will-navigate', (e, url) => {
    if (url === w.webContents.getURL()) return;
    e.preventDefault();
    if (/^https?:/.test(url)) shell.openExternal(url);
  });

  // 닫기 전에 렌더러가 저장을 마치도록 대기
  let allowClose = false;
  const finish = () => { if (!w.isDestroyed()) { allowClose = true; w.close(); } };
  w.on('close', (e) => {
    if (allowClose) return;
    e.preventDefault();
    w.webContents.send('app:before-close');
    setTimeout(finish, 1500);
  });
  ipcMain.removeAllListeners('app:ready-to-close');
  ipcMain.on('app:ready-to-close', finish);
  w.on('closed', () => {
    if (win === w) win = null;
    if (quitting) app.quit();
  });

  if (process.env.VITE_DEV_SERVER_URL) w.loadURL(process.env.VITE_DEV_SERVER_URL);
  else w.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

app.on('before-quit', () => { quitting = true; });

app.whenReady().then(async () => {
  // 데이터 폴더는 ~/Documents/Logmap 고정 (LOGMAP_DATA는 개발·테스트용)
  if (!process.env.LOGMAP_DATA) {
    // 예전 데이터 폴더(~/Documents/Logbook)가 있으면 새 이름으로 옮김 (내용은 그대로)
    const dir = defaultDataDir();
    const old = path.join(app.getPath('documents'), LEGACY_NAME);
    try { if (!fsSync.existsSync(dir) && fsSync.existsSync(old)) fsSync.renameSync(old, dir); } catch { /* 실패하면 새 폴더로 시작 */ }
  }
  await initDataDir(process.env.LOGMAP_DATA || defaultDataDir());

  if (!app.isPackaged && process.platform === 'darwin') {
    app.dock?.setIcon(path.join(__dirname, '..', 'build', 'icon.png'));
  }

  protocol.handle('asset', (req) => {
    try {
      const name = decodeURIComponent(new URL(req.url).pathname.replace(/^\//, ''));
      return net.fetch(pathToFileURL(assetFile(name)).toString());
    } catch {
      return new Response('bad request', { status: 400 });
    }
  });

  protocol.handle('localfile', (req) => {
    try {
      const abs = path.resolve(decodeURIComponent(new URL(req.url).pathname.replace(/^\//, '')));
      const ok = IMG_EXT.has(path.extname(abs).toLowerCase())
        && [...allowedDirs].some((d) => abs.startsWith(d + path.sep));
      if (!ok) return new Response('forbidden', { status: 403 });
      return net.fetch(pathToFileURL(abs).toString());
    } catch {
      return new Response('bad request', { status: 400 });
    }
  });

  // 메뉴바: 앱 메뉴 + 편집(복사/붙여넣기 단축키용)만 남김
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: APP_NAME,
      submenu: [
        { role: 'about', label: `${APP_NAME} 정보` },
        { type: 'separator' },
        { role: 'hide', label: `${APP_NAME} 가리기` },
        { role: 'hideOthers', label: '기타 가리기' },
        { role: 'unhide', label: '모두 보기' },
        { type: 'separator' },
        { role: 'minimize', label: '최소화' },
        { role: 'close', label: '창 닫기' },
        { type: 'separator' },
        { role: 'quit', label: `${APP_NAME} 종료` },
      ],
    },
    {
      label: '편집',
      submenu: [
        { role: 'undo', label: '실행 취소' },
        { role: 'redo', label: '실행 복귀' },
        { type: 'separator' },
        { role: 'cut', label: '잘라내기' },
        { role: 'copy', label: '복사하기' },
        { role: 'paste', label: '붙여넣기' },
        { role: 'pasteAndMatchStyle', label: '스타일 없이 붙여넣기' },
        { role: 'delete', label: '삭제' },
        { role: 'selectAll', label: '전체 선택' },
      ],
    },
  ]));

  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' || quitting) app.quit();
});
