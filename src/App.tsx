import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import Sidebar from './components/Sidebar';
import Canvas from './components/Canvas';
import DocView from './components/DocView';
import FileViewer from './components/FileViewer';
import EditorPanel from './components/EditorPanel';
import TemplateManager from './components/TemplateManager';
import TooltipLayer from './components/TooltipLayer';
import BoardHeader, { type ViewMode } from './components/BoardHeader';
import { useFileStore } from './hooks/useFileStore';
import {
  baseName, stripExt, type Board, type BoardMeta, type Edge, type Group, type MdFile, type Template, type Viewport, type Widget,
} from './types';

function storageGet(key: string) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function storageSet(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* ignore */ }
}
const errMsg = (e: unknown) => (e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '');

interface Snapshot { widgets: Widget[]; edges: Edge[]; groups: Group[] }

export default function App() {
  const [metas, setMetas] = useState<BoardMeta[]>([]);
  const [board, setBoard] = useState<Board | null>(null);
  const [file, setFile] = useState<MdFile | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const [dataDir, setDataDir] = useState('');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [tplManager, setTplManager] = useState<{ open: boolean; focus?: string | null }>({ open: false });
  const [mode, setModeState] = useState<ViewMode>(() => (storageGet('viewMode') === 'doc' ? 'doc' : 'canvas'));
  const [focusId, setFocusId] = useState<string | null>(null);
  /** 보드 오른쪽 편집 패널에 열린 파일 */
  const [panelPath, setPanelPath] = useState<string | null>(null);
  const fileStore = useFileStore();
  const fileStoreRef = useRef(fileStore);
  fileStoreRef.current = fileStore;

  const boardRef = useRef<Board | null>(null);
  const fileRef = useRef<MdFile | null>(null);
  fileRef.current = file;
  const dirty = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const past = useRef<Snapshot[]>([]);
  const future = useRef<Snapshot[]>([]);

  const setMode = (m: ViewMode) => {
    setFocusId(null);
    setModeState(m);
    storageSet('viewMode', m);
  };

  const refreshMetas = useCallback(async () => {
    const list = await window.api.listBoards();
    setMetas(list);
    return list;
  }, []);

  const flush = useCallback(async () => {
    window.clearTimeout(timer.current);
    const b = boardRef.current;
    if (!dirty.current || !b) return;
    dirty.current = false;
    try {
      await window.api.saveBoard(b);
    } catch (e) {
      // 저장 실패: 변경 내용을 잃지 않도록 다시 '저장 필요' 상태로 두고 알림
      if (boardRef.current?.id === b.id) dirty.current = true;
      window.alert(`보드를 저장하지 못했어요. 디스크 공간이나 데이터 폴더 권한을 확인해 주세요.\n${(e as Error).message}`);
      return;
    }
    await refreshMetas();
  }, [refreshMetas]);

  // boardRef가 항상 최신 상태의 기준. 변경 후 400ms 뒤 자동 저장.
  const mutate = useCallback((fn: (b: Board) => Board) => {
    const prev = boardRef.current;
    if (!prev) return;
    const next = fn(prev);
    boardRef.current = next;
    setBoard(next);
    dirty.current = true;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, 400);
  }, [flush]);

  const touched = () => new Date().toISOString();
  const setWidgets = useCallback(
    (fn: (ws: Widget[]) => Widget[]) => mutate((b) => ({ ...b, widgets: fn(b.widgets), updatedAt: touched() })),
    [mutate],
  );
  const setEdges = useCallback(
    (fn: (es: Edge[]) => Edge[]) => mutate((b) => ({ ...b, edges: fn(b.edges ?? []), updatedAt: touched() })),
    [mutate],
  );
  const setGroups = useCallback(
    (fn: (gs: Group[]) => Group[]) => mutate((b) => ({ ...b, groups: fn(b.groups ?? []), updatedAt: touched() })),
    [mutate],
  );
  const setViewport = useCallback((viewport: Viewport) => mutate((b) => ({ ...b, viewport })), [mutate]);
  const setDocOrder = useCallback(
    (docOrder: string[] | undefined) => mutate((b) => ({ ...b, docOrder, updatedAt: touched() })),
    [mutate],
  );
  const renameBoard = useCallback(
    (patch: Partial<Pick<Board, 'name' | 'icon' | 'color'>>) => mutate((b) => ({ ...b, ...patch })),
    [mutate],
  );

  // ---- 실행 취소 (카드 배치·연결선·보드 안 메모 기준. 파일 내용 편집은 파일에 바로 저장됨) ----
  const snapshot = useCallback(() => {
    const b = boardRef.current;
    if (!b) return;
    past.current.push({ widgets: b.widgets, edges: b.edges ?? [], groups: b.groups ?? [] });
    if (past.current.length > 200) past.current.shift();
    future.current = [];
  }, []);
  const restore = (s: Snapshot) => mutate((b) => ({ ...b, widgets: s.widgets, edges: s.edges, groups: s.groups, updatedAt: touched() }));
  const undo = useCallback(() => {
    const b = boardRef.current;
    const prev = past.current.pop();
    if (!b || !prev) return;
    future.current.push({ widgets: b.widgets, edges: b.edges ?? [], groups: b.groups ?? [] });
    restore(prev);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mutate]);
  const redo = useCallback(() => {
    const b = boardRef.current;
    const next = future.current.pop();
    if (!b || !next) return;
    past.current.push({ widgets: b.widgets, edges: b.edges ?? [], groups: b.groups ?? [] });
    restore(next);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mutate]);

  // ---- 보드 ----
  const openBoard = useCallback(async (id: string) => {
    setFile(null);
    if (boardRef.current?.id === id) return;
    setPanelPath(null);
    await flush();
    const b = await window.api.loadBoard(id);
    boardRef.current = b;
    setBoard(b);
    setFocusId(null);
    past.current = [];
    future.current = [];
    storageSet('lastBoard', id);
    const paths = b.widgets.filter((w) => w.type === 'file' && w.path).map((w) => w.path!);
    // 뷰어 등에서 고친 내용이 저장 대기 중이면 먼저 디스크에 쓰고 읽는다
    await fileStoreRef.current.flushAll();
    if (paths.length) fileStoreRef.current.load(paths);
  }, [flush]);

  const saveAndOpen = async (b: Board) => {
    await flush();
    await window.api.saveBoard(b);
    await refreshMetas();
    await openBoard(b.id);
  };

  const newBoard = (name: string, extra: Partial<Board> = {}): Board => {
    const now = new Date().toISOString();
    return {
      id: crypto.randomUUID(), name, icon: 'folder', color: 'slate', createdAt: now, updatedAt: now,
      viewport: { x: 0, y: 0, zoom: 1 }, widgets: [], edges: [], ...extra,
    };
  };

  const createBoard = () => saveAndOpen(newBoard('새 보드'));

  /** 폴더의 .md 파일을 모두 카드로 띄우고, 파일 간 링크는 연결선으로 */
  const openFolderAsBoard = async () => {
    const dir = await window.api.pickFolder('보드로 열 폴더 선택');
    if (!dir) return;
    let scanned;
    try { scanned = await window.api.scanFolder(dir); } catch (e) { window.alert(`폴더를 읽지 못했어요.\n${errMsg(e)}`); return; }
    const cols = Math.min(5, Math.max(2, Math.ceil(Math.sqrt(scanned.length))));
    const idByPath = new Map<string, string>();
    const widgets: Widget[] = scanned.map((f, i) => {
      const id = crypto.randomUUID();
      idByPath.set(f.path, id);
      fileStore.prime(f.path, f.content);
      return {
        id, type: 'file', path: f.path, color: 'white', z: i + 1,
        x: 80 + (i % cols) * 480, y: 80 + Math.floor(i / cols) * 420, w: 380, h: 330,
      };
    });
    const edges: Edge[] = scanned.flatMap((f) =>
      f.links.map((to) => ({ id: crypto.randomUUID(), from: idByPath.get(f.path)!, to: idByPath.get(to)! })));
    await saveAndOpen(newBoard(baseName(dir), { widgets, edges, icon: 'folder', color: 'blue' }));
    setMode('canvas');
  };

  // ---- 마크다운 파일 뷰어 ----
  const showFile = useCallback(async (load: () => Promise<MdFile | null>) => {
    try {
      // 보드·카드에서 고친 내용이 저장 대기 중이면 먼저 저장한 뒤 파일을 읽는다
      await Promise.all([flush(), fileStoreRef.current.flushAll()]);
      const f = await load();
      if (!f) return;
      fileStoreRef.current.prime(f.path, f.content); // 뷰어와 보드 카드가 같은 내용을 공유
      setFile(f);
      setRecent(await window.api.recentFiles());
    } catch (e) {
      window.alert(`파일을 열 수 없어요.\n${errMsg(e)}`);
    }
  }, [flush]);
  const openFilePath = useCallback((p: string) => showFile(() => window.api.readMarkdownFile(p)), [showFile]);
  const openLink = useCallback(
    (href: string) => { const f = fileRef.current; if (f) showFile(() => window.api.resolveMarkdownLink(f.path, href)); },
    [showFile],
  );

  /** 보고 있는 .md 파일을 그대로(나누지 않고) 카드로 띄운 보드를 만든다 */
  const importFileAsBoard = async () => {
    const f = fileRef.current;
    if (!f) return;
    await fileStoreRef.current.flushAll(); // 뷰어에서 고친 내용은 캐시에 이미 있으므로 저장만
    const card: Widget = { id: crypto.randomUUID(), type: 'file', path: f.path, x: 80, y: 80, w: 560, h: 640, z: 1, color: 'white' };
    await saveAndOpen(newBoard(stripExt(f.name), { widgets: [card], icon: 'file', color: 'blue' }));
    setMode('canvas');
  };

  // ---- 파일 감시: 뷰어 파일 + 현재 보드의 파일 카드 ----
  const boardPaths = useMemo(
    () => (board?.widgets ?? []).filter((w) => w.type === 'file' && w.path).map((w) => w.path!),
    [board?.widgets],
  );
  /** 사이드바: 보드마다 들어 있는 .md 파일 (지금 보드는 저장 전 변경까지 반영) */
  const filesByBoard = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const m of metas) {
      const paths = board && m.id === board.id ? boardPaths : m.files ?? [];
      out[m.id] = [...new Set(paths)].sort((a, b) => baseName(a).localeCompare(baseName(b), 'ko'));
    }
    return out;
  }, [metas, board, boardPaths]);
  const allBoardFiles = useMemo(() => [...new Set(Object.values(filesByBoard).flat())], [filesByBoard]);

  /** 사이드바에서 보드 안의 파일 클릭: 그 보드로 가서 카드를 보여 주고 편집 패널로 연다 */
  const openBoardFile = async (id: string, path: string) => {
    await openBoard(id);
    const w = boardRef.current?.widgets.find((x) => x.type === 'file' && x.path === path);
    if (w && mode === 'canvas') setFocusId(w.id);
    setPanelPath(path);
  };

  /** 사이드바의 '+ 파일 추가': 고른 .md 파일을 그 보드 오른쪽 빈 곳에 카드로 */
  const addFilesToBoard = async (id: string) => {
    const paths = await window.api.pickMarkdownFiles();
    if (!paths.length) return;
    await openBoard(id);
    const b = boardRef.current;
    if (!b) return;
    const fresh = paths.filter((pth) => !b.widgets.some((w) => w.type === 'file' && w.path === pth));
    if (!fresh.length) return;
    const ws = b.widgets;
    const right = ws.length ? Math.max(...ws.map((w) => w.x + w.w)) + 80 : 80;
    const top = ws.length ? Math.min(...ws.map((w) => w.y)) : 80;
    let z = ws.reduce((m, w) => Math.max(m, w.z), 0);
    const added: Widget[] = fresh.map((pth, i) => ({
      id: crypto.randomUUID(), type: 'file', path: pth, x: right + i * 40, y: top + i * 40, w: 440, h: 480, z: ++z, color: 'white',
    }));
    snapshot();
    setWidgets((prev) => [...prev, ...added]);
    await fileStoreRef.current.load(fresh);
    if (mode === 'canvas') setFocusId(added[added.length - 1].id);
  };

  const watchKey = [...new Set([...(file ? [file.path] : []), ...(panelPath ? [panelPath] : []), ...boardPaths])].sort().join('\n');
  useEffect(() => {
    window.api.watchFiles(watchKey ? watchKey.split('\n') : []);
  }, [watchKey]);
  useEffect(
    () => window.api.onFileChanged((p) => {
      // 다른 앱에서 바뀐 경우: 뷰어와 보드 카드가 함께 쓰는 캐시를 갱신 (내가 방금 저장한 내용이면 무시됨)
      if (p === fileRef.current?.path || p === panelRef.current || boardRef.current?.widgets.some((w) => w.path === p)) fileStoreRef.current.reload(p);
    }),
    [],
  );
  useEffect(() => window.api.onOpenPath((p) => openFilePath(p)), [openFilePath]);

  // ---- 템플릿 ----
  const saveTemplates = async (list: Template[]) => {
    setTemplates(list);
    await window.api.saveTemplates(list);
  };
  const deleteTemplate = (id: string) => {
    const t = templates.find((x) => x.id === id);
    if (t && window.confirm(`"${t.name}" 템플릿을 삭제할까요?`)) saveTemplates(templates.filter((x) => x.id !== id));
  };
  const saveAsTemplate = (t: Omit<Template, 'id' | 'icon'>) => {
    const nt: Template = { ...t, id: crypto.randomUUID(), icon: 'sticky', w: Math.round(t.w), h: Math.round(t.h) };
    saveTemplates([...templates, nt]);
    setTplManager({ open: true, focus: nt.id });
  };

  // ---- 초기 로딩 ----
  const loadInitial = useCallback(async () => {
    setDataDir(await window.api.getDataDir());
    setRecent(await window.api.recentFiles());
    setTemplates(await window.api.loadTemplates());
    const list = await refreshMetas();
    const last = storageGet('lastBoard');
    const target = list.find((m) => m.id === last) ?? list[0];
    boardRef.current = null;
    setBoard(null);
    if (target) await openBoard(target.id);
    const pending = await window.api.pendingFiles();
    if (pending.length) await openFilePath(pending[pending.length - 1]);
  }, [openBoard, openFilePath, refreshMetas]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadInitial(); }, []);

  useEffect(
    () => window.api.onBeforeClose(async () => {
      try { await Promise.all([flush(), fileStore.flushAll()]); } finally { window.api.readyToClose(); }
    }),
    [flush, fileStore],
  );

  const deleteBoard = async (id: string) => {
    const meta = metas.find((m) => m.id === id);
    if (!window.confirm(`"${meta?.name ?? '보드'}" 보드를 휴지통으로 이동할까요?\n(카드로 연결된 .md 파일은 지워지지 않아요)`)) return;
    const isCurrent = boardRef.current?.id === id;
    if (isCurrent) {
      window.clearTimeout(timer.current);
      dirty.current = false;
    } else {
      await flush();
    }
    await window.api.deleteBoard(id);
    const list = await refreshMetas();
    if (isCurrent) {
      boardRef.current = null;
      setBoard(null);
      if (list[0] && !fileRef.current) await openBoard(list[0].id);
    }
  };


  const exportMarkdown = async () => {
    await Promise.all([flush(), fileStore.flushAll()]);
    if (boardRef.current) await window.api.exportMarkdown(boardRef.current);
  };

  // ---- 편집 패널 ----
  const panelRef = useRef<string | null>(null);
  panelRef.current = panelPath;
  const closePanel = useCallback(() => setPanelPath(null), []);
  // 패널에 연 파일이 아직 캐시에 없으면 불러오기
  useEffect(() => {
    if (panelPath && !fileStoreRef.current.files[panelPath]) fileStoreRef.current.load([panelPath]);
  }, [panelPath]);
  /** 패널 안의 .md 링크: 그 파일을 패널에 연다 */
  const openLinkInPanel = async (href: string) => {
    const base = panelRef.current;
    if (!base) return;
    try {
      const f = await window.api.resolveMarkdownLink(base, href);
      fileStoreRef.current.prime(f.path, f.content);
      setPanelPath(f.path);
      setRecent(await window.api.recentFiles());
    } catch (e) {
      window.alert(`파일을 열 수 없어요.\n${errMsg(e)}`);
    }
  };

  const showOnCanvas = (id: string) => {
    setModeState('canvas');
    storageSet('viewMode', 'canvas');
    setFocusId(id);
  };

  let main;
  if (file) {
    main = (
      <FileViewer
        file={file}
        content={fileStore.files[file.path]?.content ?? file.content}
        saving={!!fileStore.saving[file.path]}
        onChange={(c) => fileStore.update(file.path, c)}
        onSaveNow={() => fileStore.writeNow(file.path)}
        onOpenLink={openLink}
        onImport={importFileAsBoard}
        boards={metas.filter((m) => m.files?.includes(file.path)).map((m) => ({ id: m.id, name: m.name }))}
        onOpenBoard={openBoard}
      />
    );
  } else if (board) {
    main = (
      <section className="main-col">
        <BoardHeader
          board={board}
          mode={mode}
          onMode={setMode}
          onRename={renameBoard}
          undo={undo}
          redo={redo}
          onExport={exportMarkdown}
        />
        <div className="board-body">
          <div className="board-main">
            {mode === 'canvas' ? (
              <Canvas
                key={`${board.id}:${focusId ?? ''}`}
                board={board}
                setWidgets={setWidgets}
                setEdges={setEdges}
                setGroups={setGroups}
                setViewport={setViewport}
                snapshot={snapshot}
                undo={undo}
                redo={redo}
                focusId={focusId}
                fileStore={fileStore}
                templates={templates}
                onDeleteTemplate={deleteTemplate}
                onManageTemplates={() => setTplManager({ open: true })}
                onSaveAsTemplate={saveAsTemplate}
                recentFiles={[...new Set([...allBoardFiles, ...recent])]}
                panelPath={panelPath}
                onEditFile={setPanelPath}
              />
            ) : (
              <DocView
                key={board.id}
                board={board}
                setWidgets={setWidgets}
                snapshot={snapshot}
                setDocOrder={setDocOrder}
                onShowOnCanvas={showOnCanvas}
                fileStore={fileStore}
                panelPath={panelPath}
                onEditFile={setPanelPath}
              />
            )}
          </div>
          {panelPath && (
            <EditorPanel
              path={panelPath}
              content={fileStore.files[panelPath]?.content ?? ''}
              loaded={!!fileStore.files[panelPath]}
              error={fileStore.files[panelPath]?.error}
              saving={!!fileStore.saving[panelPath]}
              onChange={(c) => fileStore.update(panelPath, c)}
              onSaveNow={() => fileStore.writeNow(panelPath)}
              onOpenLink={openLinkInPanel}
              onClose={closePanel}
              onOpenFull={() => openFilePath(panelPath)}
            />
          )}
        </div>
      </section>
    );
  } else {
    main = (
      <div className="empty-state">
        <p>보드가 없어요.</p>
        <div className="row">
          <button className="btn primary" onClick={createBoard}><Plus size={15} /> 새 보드</button>
          <button className="btn" onClick={openFolderAsBoard}>폴더를 보드로 열기</button>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <Sidebar
        metas={metas}
        currentBoardId={file ? undefined : board?.id}
        filesByBoard={filesByBoard}
        looseFile={file && !allBoardFiles.includes(file.path) ? file.path : undefined}
        activeFile={file ? file.path : panelPath ?? undefined}
        dataDir={dataDir}
        onOpen={openBoard}
        onCreate={createBoard}
        onOpenFolder={openFolderAsBoard}
        onDelete={deleteBoard}
        onOpenBoardFile={openBoardFile}
        onAddFiles={addFilesToBoard}
        onOpenDataDir={() => window.api.openDataDir()}
      />
      {main}
      <TooltipLayer />
      {tplManager.open && (
        <TemplateManager
          templates={templates}
          initialId={tplManager.focus}
          onClose={() => setTplManager({ open: false })}
          onSave={async (list) => { await saveTemplates(list); setTplManager({ open: false }); }}
        />
      )}
    </div>
  );
}
