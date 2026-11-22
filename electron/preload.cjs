const { contextBridge, ipcRenderer, webUtils } = require('electron');

const subscribe = (channel) => (cb) => {
  const listener = (_e, ...args) => cb(...args);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

contextBridge.exposeInMainWorld('api', {
  // 보드
  listBoards: () => ipcRenderer.invoke('boards:list'),
  loadBoard: (id) => ipcRenderer.invoke('boards:load', id),
  saveBoard: (board) => ipcRenderer.invoke('boards:save', board),
  deleteBoard: (id) => ipcRenderer.invoke('boards:delete', id),
  exportMarkdown: (board) => ipcRenderer.invoke('boards:export', board),
  // 이미지
  saveAsset: (name, data) => ipcRenderer.invoke('assets:save', name, data),
  pickImages: () => ipcRenderer.invoke('assets:pick'),
  // 마크다운 파일
  pickMarkdownFile: () => ipcRenderer.invoke('files:pick'),
  pickMarkdownFiles: () => ipcRenderer.invoke('files:pickMany'),
  pickFolder: (title) => ipcRenderer.invoke('folders:pick', title),
  readMarkdownFile: (p) => ipcRenderer.invoke('files:read', p),
  readTextFile: (p) => ipcRenderer.invoke('files:readText', p),
  writeTextFile: (p, content) => ipcRenderer.invoke('files:writeText', p, content),
  saveNewMarkdown: (name, content) => ipcRenderer.invoke('files:saveNew', name, content),
  scanFolder: (dir) => ipcRenderer.invoke('files:scanFolder', dir),
  resolveMarkdownLink: (base, href) => ipcRenderer.invoke('files:resolve', base, href),
  recentFiles: () => ipcRenderer.invoke('files:recent'),
  revealFile: (p) => ipcRenderer.invoke('files:reveal', p),
  pendingFiles: () => ipcRenderer.invoke('files:pending'),
  watchFiles: (paths) => ipcRenderer.invoke('files:watchSet', paths),
  onFileChanged: subscribe('files:changed'),
  onOpenPath: subscribe('files:open-path'),
  /** Finder에서 끌어다 놓은 File의 실제 경로 */
  pathForFile: (file) => {
    try { const p = webUtils.getPathForFile(file); return p ? p.normalize('NFC') : null; } catch { return null; }
  },
  // 템플릿
  loadTemplates: () => ipcRenderer.invoke('templates:load'),
  saveTemplates: (list) => ipcRenderer.invoke('templates:save', list),
  // 앱
  getDataDir: () => ipcRenderer.invoke('app:dataDir'),
  openDataDir: () => ipcRenderer.invoke('app:openDataDir'),
  onBeforeClose: subscribe('app:before-close'),
  readyToClose: () => ipcRenderer.send('app:ready-to-close'),
});
