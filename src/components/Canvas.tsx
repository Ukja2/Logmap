import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, DragEvent as RDragEvent, MouseEvent as RMouseEvent, PointerEvent as RPointerEvent } from 'react';
import {
  BookmarkPlus, BringToFront, ChevronsDownUp, ChevronsUpDown, Copy, FileDown, FilePlus2, FileText, Link2, FolderOpen, Group as GroupIcon,
  GitBranchPlus, Hand, ImagePlus, LayoutTemplate, Lock, LockOpen, Maximize2, Minus, MousePointer2, Pencil, Plus,
  SendToBack, StickyNote, Trash2, Type, Ungroup, X,
} from 'lucide-react';
import MarkdownView from './MarkdownView';
import { BOARD_ICONS } from '../icons';
import { applyTemplate } from '../templates';
import type { FileStore } from '../hooks/useFileStore';
import {
  GROUP_COLORS, NOTE_COLORS, TEXT_COLORS, assetUrl, baseName, dirName, toggleTaskAt, widgetTitle,
  type Board, type Edge, type Group, type GroupColor, type NoteColor, type Template, type TextColor, type Viewport, type Widget,
} from '../types';

interface Props {
  board: Board;
  setWidgets(fn: (ws: Widget[]) => Widget[]): void;
  setEdges(fn: (es: Edge[]) => Edge[]): void;
  setGroups(fn: (gs: Group[]) => Group[]): void;
  setViewport(vp: Viewport): void;
  snapshot(): void;
  undo(): void;
  redo(): void;
  /** 마운트 시 이 위젯으로 화면 이동 + 선택 (문서 보기 → 캔버스에서 보기) */
  focusId?: string | null;
  fileStore: FileStore;
  templates: Template[];
  onDeleteTemplate(id: string): void;
  onManageTemplates(): void;
  onSaveAsTemplate(t: Omit<Template, 'id' | 'icon'>): void;
  /** 이어서 추가 메뉴의 연결 후보 (보드에 올린 파일 + 최근에 연 파일) */
  recentFiles: string[];
  /** 오른쪽 편집 패널에 열린 파일 */
  panelPath?: string | null;
  /** 파일 카드 편집 → 오른쪽 편집 패널에서 */
  onEditFile(path: string): void;
}

type Pt = { x: number; y: number };
type Rect = { x: number; y: number; w: number; h: number };

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 4;
const HEAD_H = 38;
const GROUP_PAD = 24;
const GROUP_LABEL = 0; // 그룹 이름표 없음
const MD_FILE = /\.(md|markdown|mdx|txt)$/i;
const LEVELS = [
  { level: 1, label: 'H1', tip: '제목 1' },
  { level: 2, label: 'H2', tip: '제목 2' },
  { level: 3, label: 'H3', tip: '제목 3' },
  { level: 4, label: 'H4', tip: '제목 4' },
  { level: 0, label: '본문', tip: '본문' },
];
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const hOf = (w: Widget) => (w.collapsed && w.type !== 'image' && w.type !== 'text' ? HEAD_H : w.h);
const bboxOf = (ws: Widget[]): Rect => {
  const x = Math.min(...ws.map((w) => w.x));
  const y = Math.min(...ws.map((w) => w.y));
  return { x, y, w: Math.max(...ws.map((w) => w.x + w.w)) - x, h: Math.max(...ws.map((w) => w.y + hOf(w))) - y };
};
/** 그룹 틀: 멤버 영역 + 여백 + 위쪽 이름표 */
const groupFrame = (members: Widget[]): Rect => {
  const b = bboxOf(members);
  return { x: b.x - GROUP_PAD, y: b.y - GROUP_PAD - GROUP_LABEL, w: b.w + GROUP_PAD * 2, h: b.h + GROUP_PAD * 2 + GROUP_LABEL };
};
const intersects = (a: Rect, b: Rect) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/** a/b/../c.md 같은 상대 경로를 절대 경로로 */
function resolvePath(baseDir: string, rel: string) {
  const parts = (rel.startsWith('/') ? rel : `${baseDir}/${rel}`).split('/');
  const out: string[] = [];
  for (const s of parts) {
    if (s === '..') out.pop();
    else if (s && s !== '.') out.push(s);
  }
  return `/${out.join('/')}`;
}

function measureImage(url: string) {
  return new Promise<{ width: number; height: number }>((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth || 400, height: img.naturalHeight || 300 });
    img.onerror = () => resolve({ width: 400, height: 300 });
    img.src = url;
  });
}

/** 두 위젯을 잇는 곡선. 가로/세로 중 더 떨어진 방향의 변 중앙끼리 연결 */
function edgeGeometry(a: Widget, b: Widget) {
  const ha = hOf(a);
  const hb = hOf(b);
  const ca = { x: a.x + a.w / 2, y: a.y + ha / 2 };
  const cb = { x: b.x + b.w / 2, y: b.y + hb / 2 };
  const dx = cb.x - ca.x;
  const dy = cb.y - ca.y;
  let s; let e; let c1; let c2;
  if (Math.abs(dx) / (a.w + b.w) >= Math.abs(dy) / (ha + hb)) {
    const dir = dx >= 0 ? 1 : -1;
    s = { x: dir > 0 ? a.x + a.w : a.x, y: ca.y };
    e = { x: dir > 0 ? b.x : b.x + b.w, y: cb.y };
    const k = Math.max(40, Math.abs(e.x - s.x) / 2);
    c1 = { x: s.x + dir * k, y: s.y };
    c2 = { x: e.x - dir * k, y: e.y };
  } else {
    const dir = dy >= 0 ? 1 : -1;
    s = { x: ca.x, y: dir > 0 ? a.y + ha : a.y };
    e = { x: cb.x, y: dir > 0 ? b.y : b.y + hb };
    const k = Math.max(40, Math.abs(e.y - s.y) / 2);
    c1 = { x: s.x, y: s.y + dir * k };
    c2 = { x: e.x, y: e.y - dir * k };
  }
  const d = `M ${s.x} ${s.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${e.x} ${e.y}`;
  const mid = { x: (s.x + 3 * c1.x + 3 * c2.x + e.x) / 8, y: (s.y + 3 * c1.y + 3 * c2.y + e.y) / 8 };
  return { d, mid };
}

/** 포인터 드래그 공통 처리. 3px 이상 움직여야 드래그로 인정 */
function trackDrag(
  e: RPointerEvent,
  onMove: (dx: number, dy: number, ev: PointerEvent) => void,
  onEnd?: (moved: boolean, ev: PointerEvent) => void,
) {
  const sx = e.clientX;
  const sy = e.clientY;
  let moved = false;
  const move = (ev: PointerEvent) => {
    const dx = ev.clientX - sx;
    const dy = ev.clientY - sy;
    if (!moved && Math.hypot(dx, dy) < 3) return;
    moved = true;
    onMove(dx, dy, ev);
  };
  const up = (ev: PointerEvent) => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    onEnd?.(moved, ev);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

export default function Canvas(p: Props) {
  const { board, fileStore } = p;
  const vp = board.viewport;
  const edges = board.edges ?? [];
  const groups = board.groups ?? [];
  const rootRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const propsRef = useRef(p);
  propsRef.current = p;
  const vpRef = useRef(vp);
  vpRef.current = vp;
  const widgetsRef = useRef(board.widgets);
  widgetsRef.current = board.widgets;
  const edgesRef = useRef(edges);
  edgesRef.current = edges;
  const groupsRef = useRef(groups);
  groupsRef.current = groups;
  const filesRef = useRef(fileStore.files);
  filesRef.current = fileStore.files;

  /** 선택된 위젯들 (그룹을 선택하면 그 멤버 전부) */
  const [sel, setSel] = useState<string[]>(p.focusId ? [p.focusId] : []);
  const selRef = useRef(sel);
  selRef.current = sel;
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [marquee, setMarquee] = useState<Rect | null>(null);
  const [spaceDown, setSpaceDown] = useState(false);
  /** select: 카드 선택·이동, hand: 어디를 드래그하든 화면만 이동 */
  const [tool, setToolState] = useState<'select' | 'hand'>(() => {
    try { return localStorage.getItem('canvasTool') === 'hand' ? 'hand' : 'select'; } catch { return 'select'; }
  });
  const setTool = (t: 'select' | 'hand') => {
    setToolState(t);
    try { localStorage.setItem('canvasTool', t); } catch { /* ignore */ }
    if (t === 'hand') { setSel([]); setSelectedEdge(null); setEditingId(null); }
  };
  const panMode = spaceDown || tool === 'hand';
  const [panning, setPanning] = useState(false);
  const [dropHint, setDropHint] = useState(false);
  const [connect, setConnect] = useState<{ from: string; x: number; y: number } | null>(null);
  const [linkMenu, setLinkMenu] = useState(false);

  const byId = new Map(board.widgets.map((w) => [w.id, w]));
  const selWidgets = sel.map((id) => byId.get(id)).filter((w): w is Widget => !!w);
  const selected = selWidgets.length === 1 ? selWidgets[0] : null;
  // 편집 패널이 열려 있으면, 다른 파일 카드를 선택했을 때 패널도 그 파일로 바뀜
  const selectedPath = selected?.type === 'file' ? selected.path : undefined;
  useEffect(() => {
    if (selectedPath && p.panelPath && selectedPath !== p.panelPath) p.onEditFile(selectedPath);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPath]);
  const membersOf = (gid: string, ws = widgetsRef.current) => ws.filter((w) => w.groupId === gid);
  /** 선택이 정확히 그룹 하나와 같으면 그 그룹 */
  const selGroup = (() => {
    if (selWidgets.length < 2) return null;
    const gid = selWidgets[0].groupId;
    if (!gid || selWidgets.some((w) => w.groupId !== gid)) return null;
    return membersOf(gid, board.widgets).length === selWidgets.length ? groups.find((g) => g.id === gid) ?? null : null;
  })();

  // 이어서 추가 메뉴: 선택이 바뀌거나 바깥을 누르면 닫기
  useEffect(() => { setLinkMenu(false); }, [sel]);
  useEffect(() => {
    if (!linkMenu) return;
    const close = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest('.link-menu, .tb-link-btn')) setLinkMenu(false);
    };
    window.addEventListener('pointerdown', close, true);
    return () => window.removeEventListener('pointerdown', close, true);
  }, [linkMenu]);

  const contentOf = (w: Widget) =>
    w.type === 'file' ? filesRef.current[w.path!]?.content ?? '' : w.content ?? '';

  // ---------- 좌표 ----------
  const rect = () => rootRef.current!.getBoundingClientRect();
  const toWorld = (cx: number, cy: number) => {
    const r = rect();
    const v = vpRef.current;
    return { x: (cx - r.left - v.x) / v.zoom, y: (cy - r.top - v.y) / v.zoom };
  };
  const viewCenter = () => {
    const r = rect();
    return toWorld(r.left + r.width / 2, r.top + r.height / 2);
  };
  const maxZ = () => widgetsRef.current.reduce((m, w) => Math.max(m, w.z), 0);
  const hitWidget = (pt: Pt) =>
    [...widgetsRef.current]
      .sort((a, b) => b.z - a.z)
      .find((w) => pt.x >= w.x && pt.x <= w.x + w.w && pt.y >= w.y && pt.y <= w.y + hOf(w));

  // 문서 보기에서 "캔버스에서 보기"로 들어온 경우 해당 위젯으로 이동
  useEffect(() => {
    const w = widgetsRef.current.find((x) => x.id === p.focusId);
    if (!w) return;
    const r = rect();
    const zoom = clamp(Math.min(1, (r.width - 160) / w.w, (r.height - 200) / hOf(w)), MIN_ZOOM, 1);
    p.setViewport({ zoom, x: r.width / 2 - (w.x + w.w / 2) * zoom, y: r.height / 2 - (w.y + hOf(w) / 2) * zoom });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 텍스트 위젯은 내용에 맞춰 높이가 정해지므로, 실제 높이를 재서 저장 (연결선·선택 영역 계산용)
  useLayoutEffect(() => {
    const world = worldRef.current;
    if (!world) return;
    const fixes = new Map<string, number>();
    for (const w of board.widgets) {
      if (w.type !== 'text') continue;
      const el = world.querySelector<HTMLElement>(`[data-wid="${w.id}"]`);
      if (el && Math.abs(el.offsetHeight - w.h) > 1) fixes.set(w.id, el.offsetHeight);
    }
    if (fixes.size) p.setWidgets((ws) => ws.map((w) => (fixes.has(w.id) ? { ...w, h: fixes.get(w.id)! } : w)));
  });

  // ---------- 선택 ----------
  const select = (id: string | null) => { setSel(id ? [id] : []); if (id) setSelectedEdge(null); };
  /** 클릭 단위: 그룹 멤버면 그룹 전체, 아니면 자기 자신 */
  const unitIds = (w: Widget) => (w.groupId ? membersOf(w.groupId).map((x) => x.id) : [w.id]);

  // ---------- 위젯 추가/수정 ----------
  const addWidget = (w: Omit<Widget, 'id' | 'z'>, edit = false, record = true) => {
    if (record) propsRef.current.snapshot();
    const nw: Widget = { ...w, id: crypto.randomUUID(), z: maxZ() + 1 };
    propsRef.current.setWidgets((ws) => [...ws, nw]);
    select(nw.id);
    setEditingId(edit ? nw.id : null);
    return nw;
  };

  const addEdge = (from: string, to: string, record = true) => {
    if (from === to) return;
    if (edgesRef.current.some((e) => (e.from === from && e.to === to) || (e.from === to && e.to === from))) return;
    if (record) propsRef.current.snapshot();
    propsRef.current.setEdges((es) => [...es, { id: crypto.randomUUID(), from, to }]);
  };

  /** 새 메모 (보드 JSON 안에 저장 → Logmap/boards/<id>.json) */
  const createNote = (
    content: string,
    o: { x: number; y: number; w: number; h: number; color: NoteColor; edit?: boolean },
  ) => {
    const { x, y, w, h, color, edit } = o;
    return addWidget({ type: 'note', x, y, w, h, color, content }, edit);
  };

  /** 텍스트: 카드 없이 쓰는 글. 기본은 제목 2 */
  const addText = (at?: Pt) => {
    const c = at ?? viewCenter();
    return addWidget({ type: 'text', x: at ? c.x : c.x - 180, y: at ? c.y : c.y - 24, w: 360, h: 48, level: 2, content: '' }, true);
  };

  /** 카드 순서 바꾸기. z를 1..n으로 다시 매겨 연결선·그룹 틀(z 0)보다 항상 위에 있게 한다 */
  const reorder = (ids: string[], toFront: boolean) => {
    p.snapshot();
    p.setWidgets((ws) => {
      const moving = ws.filter((w) => ids.includes(w.id)).sort((a, b) => a.z - b.z);
      const rest = [...ws].sort((a, b) => a.z - b.z).filter((w) => !ids.includes(w.id));
      const order = toFront ? [...rest, ...moving] : [...moving, ...rest];
      const z = new Map(order.map((w, i) => [w.id, i + 1]));
      return ws.map((w) => ({ ...w, z: z.get(w.id)! }));
    });
  };

  const addBlank = (at?: Pt) => {
    const c = at ?? viewCenter();
    return createNote('', { x: at ? c.x : c.x - 160, y: at ? c.y : c.y - 110, w: 320, h: 220, color: 'yellow', edit: true });
  };

  const addTemplate = (t: Template) => {
    const c = viewCenter();
    return createNote(applyTemplate(t.body), {
      x: c.x - t.w / 2, y: c.y - t.h / 2, w: t.w, h: t.h, color: t.color, edit: true,
    });
  };

  /** 부모 카드 오른쪽(→ 아래/위 순서)으로 다른 카드와 겹치지 않는 자리 */
  const findFreeSpot = (parent: Widget, w: number, h: number) => {
    const gap = 40;
    const overlaps = (x: number, y: number) => widgetsRef.current.some((o) =>
      x < o.x + o.w + gap && x + w + gap > o.x && y < o.y + hOf(o) + gap && y + h + gap > o.y);
    for (let col = 0; col < 6; col++) {
      const x = parent.x + parent.w + 120 + col * (w + 80);
      for (let k = 0; k < 12; k++) {
        const off = Math.ceil(k / 2) * (h + gap) * (k % 2 ? 1 : -1);
        const y = parent.y + off;
        if (!overlaps(x, y)) return { x, y };
      }
    }
    return { x: parent.x + parent.w + 120, y: parent.y };
  };

  /** 위젯이 화면 밖이면 그 위젯이 가운데 오도록 이동 */
  const ensureVisible = (w: Widget) => {
    const r = rect();
    const v = vpRef.current;
    const sx = w.x * v.zoom + v.x;
    const sy = w.y * v.zoom + v.y;
    const inside = sx >= 20 && sy >= 20 && sx + w.w * v.zoom <= r.width - 20 && sy + hOf(w) * v.zoom <= r.height - 100;
    if (inside) return;
    propsRef.current.setViewport({
      ...v,
      x: r.width / 2 - (w.x + w.w / 2) * v.zoom,
      y: (r.height - 80) / 2 - (w.y + hOf(w) / 2) * v.zoom,
    });
  };

  /** 선택한 카드 오른쪽에 이어지는 새 메모 (마인드맵) */
  const addChild = (parentId: string, at?: Pt) => {
    const parent = widgetsRef.current.find((w) => w.id === parentId);
    if (!parent) return;
    const pos = at ?? findFreeSpot(parent, 300, 200);
    const color = parent.type === 'note' ? parent.color ?? 'yellow' : 'yellow';
    const child = createNote('', { ...pos, w: 300, h: 200, color, edit: true });
    addEdge(parentId, child.id, false);
    ensureVisible(child);
  };

  /** 기존 .md 파일을 선택한 카드에 이어 붙인다 (이미 보드에 있는 파일이면 연결만) */
  const linkFilesTo = async (parentId: string, paths: string[]) => {
    if (!paths.length) return;
    const fresh = paths.filter((pth) => !widgetsRef.current.some((w) => w.type === 'file' && w.path === pth));
    await propsRef.current.fileStore.load(fresh);
    propsRef.current.snapshot();
    let last: Widget | undefined;
    for (const pth of paths) {
      const parent = widgetsRef.current.find((w) => w.id === parentId);
      if (!parent) return;
      let card = widgetsRef.current.find((w) => w.type === 'file' && w.path === pth);
      if (!card) {
        const pos = findFreeSpot(parent, 380, 330);
        card = addWidget({ type: 'file', path: pth, ...pos, w: 380, h: 330, color: 'white' }, false, false);
        widgetsRef.current = [...widgetsRef.current, card]; // 같은 루프에서 다음 자리 계산에 반영
      }
      addEdge(parentId, card.id, false);
      last = card;
    }
    if (last) { select(last.id); ensureVisible(last); }
  };

  /** 디스크의 .md 파일을 카드로 띄운다 (복사하지 않고 원본을 참조) */
  const addFileCards = async (paths: string[], at?: Pt) => {
    const fresh = paths.filter((pth) => !widgetsRef.current.some((w) => w.type === 'file' && w.path === pth));
    await propsRef.current.fileStore.load(fresh);
    let c = at ?? viewCenter();
    let lastId: string | null = null;
    for (const pth of paths) {
      const existing = widgetsRef.current.find((w) => w.type === 'file' && w.path === pth);
      const id = existing?.id ?? addWidget({ type: 'file', path: pth, x: c.x, y: c.y, w: 440, h: 480, color: 'white' }).id;
      lastId = id;
      if (!existing) c = { x: c.x + 40, y: c.y + 40 };
    }
    if (lastId) select(lastId);
  };

  /** 카드 안의 상대 경로 .md 링크를 누르면 그 파일을 연결된 카드로 띄운다 */
  const openLinkFromCard = (cardId: string, href: string) => {
    const card = widgetsRef.current.find((w) => w.id === cardId);
    if (!card?.path) return;
    linkFilesTo(cardId, [resolvePath(dirName(card.path), decodeURIComponent(href.split('#')[0]))]);
  };

  /** 드롭한 .md 경로들: 카드 위에 놓으면 그 카드에 연결, 빈 곳이면 그 자리에 카드로 */
  const dropPaths = async (paths: string[], pt: Pt) => {
    const target = hitWidget(pt);
    if (target) await linkFilesTo(target.id, paths.filter((x) => x !== target.path));
    else await addFileCards(paths, pt);
  };

  const placeImages = async (srcs: string[], at?: Pt) => {
    let c = at ?? viewCenter();
    for (const src of srcs) {
      const { width, height } = await measureImage(assetUrl(src));
      const s = Math.min(1, 520 / width, 520 / height);
      const w = Math.max(40, width * s);
      const h = Math.max(40, height * s);
      addWidget({ type: 'image', x: c.x - w / 2, y: c.y - h / 2, w, h, src });
      c = { x: c.x + 24, y: c.y + 24 };
    }
  };

  const importFiles = async (files: File[], at?: Pt) => {
    const c = at ?? viewCenter();
    const md = files.filter((f) => MD_FILE.test(f.name));
    const linked = md.map((f) => window.api.pathForFile(f)).filter((x): x is string => !!x);
    if (linked.length) await addFileCards(linked, c);
    for (const f of md.filter((f) => !window.api.pathForFile(f))) {
      createNote(await f.text(), { x: c.x, y: c.y, w: 440, h: 480, color: 'white' });
    }
    const srcs: string[] = [];
    for (const f of files.filter((f) => f.type.startsWith('image/'))) {
      srcs.push(await window.api.saveAsset(f.name || 'pasted.png', new Uint8Array(await f.arrayBuffer())));
    }
    await placeImages(srcs, { x: c.x + 40, y: c.y + 40 });
  };

  const patchWidget = (id: string, patch: Partial<Widget>, record = true) => {
    if (record) p.snapshot();
    p.setWidgets((ws) => ws.map((w) => (w.id === id ? { ...w, ...patch } : w)));
  };
  const patchMany = (ids: string[], patch: Partial<Widget>) => {
    p.snapshot();
    p.setWidgets((ws) => ws.map((w) => (ids.includes(w.id) ? { ...w, ...patch } : w)));
  };

  const setContent = (w: Widget, content: string) => {
    if (w.type === 'file' && w.path) fileStore.update(w.path, content);
    else patchWidget(w.id, { content }, false);
  };

  /** 위젯 삭제 + 연결선 정리 + 멤버가 1개 이하로 남은 그룹은 해제 */
  const removeWidgets = (ids: string[], record = true) => {
    if (!ids.length) return;
    if (record) p.snapshot();
    const remaining = widgetsRef.current.filter((w) => !ids.includes(w.id));
    const counts = new Map<string, number>();
    remaining.forEach((w) => w.groupId && counts.set(w.groupId, (counts.get(w.groupId) ?? 0) + 1));
    const dead = new Set(groupsRef.current.filter((g) => (counts.get(g.id) ?? 0) < 2).map((g) => g.id));
    p.setWidgets((ws) => ws.filter((w) => !ids.includes(w.id)).map((w) => (w.groupId && dead.has(w.groupId) ? { ...w, groupId: undefined } : w)));
    p.setEdges((es) => es.filter((e) => !ids.includes(e.from) && !ids.includes(e.to)));
    if (dead.size) p.setGroups((gs) => gs.filter((g) => !dead.has(g.id)));
    setSel([]);
    setEditingId(null);
  };

  const removeEdge = (id: string) => {
    p.snapshot();
    p.setEdges((es) => es.filter((e) => e.id !== id));
    setSelectedEdge(null);
  };

  const duplicateWidget = (id: string) => {
    const w = widgetsRef.current.find((x) => x.id === id);
    if (!w || w.type === 'file') return;
    const { id: _id, z: _z, ...rest } = w;
    addWidget({ ...rest, x: w.x + 24, y: w.y + 24 });
  };

  const startEdit = (id: string) => {
    const w = widgetsRef.current.find((x) => x.id === id);
    if (!w || w.type === 'image') return;
    // 파일 카드는 카드 안이 아니라 오른쪽 편집 패널에서 (파일 화면과 같은 편집기)
    if (w.type === 'file') {
      select(id);
      if (w.path) p.onEditFile(w.path);
      return;
    }
    p.snapshot();
    if (w.collapsed) patchWidget(id, { collapsed: false }, false);
    select(id);
    setEditingId(id);
  };

  /** 메모를 .md 파일로 저장하고, 그 자리의 카드를 파일 카드로 바꾼다 */
  const saveNoteAsFile = async (w: Widget) => {
    const content = w.content ?? '';
    let saved;
    try {
      saved = await window.api.saveNewMarkdown(widgetTitle(w, content), content);
    } catch (e) {
      window.alert(`파일로 저장하지 못했어요.\n${(e as Error).message}`);
      return;
    }
    if (!saved) return;
    p.fileStore.prime(saved.path, saved.content);
    p.snapshot();
    p.setWidgets((ws) => ws.map((x) => {
      if (x.id !== w.id) return x;
      const { content: _c, ...rest } = x;
      return { ...rest, type: 'file', path: saved.path };
    }));
  };

  /** 원본 파일을 옮기거나 이름을 바꿨을 때: 새 위치의 파일로 다시 연결 (같은 파일의 카드 모두) */
  const relinkFile = async (oldPath: string) => {
    let f;
    try { f = await window.api.pickMarkdownFile(); } catch (e) { window.alert((e as Error).message); return; }
    if (!f) return;
    p.fileStore.prime(f.path, f.content);
    p.snapshot();
    p.setWidgets((ws) => ws.map((x) => (x.type === 'file' && x.path === oldPath ? { ...x, path: f.path } : x)));
  };

  /** 편집 끝: 내용이 빈 텍스트는 지운다 */
  const finishEdit = (w: Widget) => {
    setEditingId(null);
    const cur = widgetsRef.current.find((x) => x.id === w.id);
    if (cur?.type === 'text' && !(cur.content ?? '').trim()) removeWidgets([cur.id], false);
  };

  const toggleTask = (id: string, offset: number) => {
    const w = widgetsRef.current.find((x) => x.id === id);
    if (!w) return;
    if (w.type === 'file' && w.path) {
      const c = filesRef.current[w.path]?.content;
      if (c != null) fileStore.update(w.path, toggleTaskAt(c, offset));
      return;
    }
    p.snapshot();
    p.setWidgets((ws) => ws.map((x) => (x.id === id && x.content ? { ...x, content: toggleTaskAt(x.content, offset) } : x)));
  };

  /** 하나라도 안 고정돼 있으면 전부 고정, 전부 고정이면 전부 해제 */
  const toggleLockMany = (ids: string[]) => {
    const ws = widgetsRef.current.filter((w) => ids.includes(w.id));
    if (!ws.length) return;
    patchMany(ids, { locked: ws.some((w) => !w.locked) });
  };

  // ---------- 그룹 ----------
  const groupSelection = () => {
    const ids = selRef.current;
    if (ids.length < 2) return;
    p.snapshot();
    const gid = crypto.randomUUID();
    const oldGroups = new Set(widgetsRef.current.filter((w) => ids.includes(w.id) && w.groupId).map((w) => w.groupId!));
    // 기존 그룹에 남는 멤버 수를 계산해서 1개 이하가 되면 그 그룹은 해제
    const leftover = new Map<string, number>();
    widgetsRef.current.forEach((w) => {
      if (!ids.includes(w.id) && w.groupId && oldGroups.has(w.groupId)) leftover.set(w.groupId, (leftover.get(w.groupId) ?? 0) + 1);
    });
    const dead = new Set([...oldGroups].filter((g) => (leftover.get(g) ?? 0) < 2));
    p.setWidgets((ws) => ws.map((w) => {
      if (ids.includes(w.id)) return { ...w, groupId: gid };
      if (w.groupId && dead.has(w.groupId)) return { ...w, groupId: undefined };
      return w;
    }));
    p.setGroups((gs) => [...gs.filter((g) => !dead.has(g.id)), { id: gid, name: '그룹', color: 'gray' }]);
  };

  const ungroupSelection = () => {
    const gids = new Set(widgetsRef.current.filter((w) => selRef.current.includes(w.id) && w.groupId).map((w) => w.groupId!));
    if (!gids.size) return;
    p.snapshot();
    p.setWidgets((ws) => ws.map((w) => (w.groupId && gids.has(w.groupId) ? { ...w, groupId: undefined } : w)));
    p.setGroups((gs) => gs.filter((g) => !gids.has(g.id)));
  };

  const patchGroup = (gid: string, patch: Partial<Group>, record = true) => {
    if (record) p.snapshot();
    p.setGroups((gs) => gs.map((g) => (g.id === gid ? { ...g, ...patch } : g)));
  };

  // ---------- 뷰포트 ----------
  const zoomAround = (zoom: number, sx: number, sy: number) => {
    const v = vpRef.current;
    const z = clamp(zoom, MIN_ZOOM, MAX_ZOOM);
    const k = z / v.zoom;
    p.setViewport({ zoom: z, x: sx - (sx - v.x) * k, y: sy - (sy - v.y) * k });
  };
  const zoomBy = (factor: number) => {
    const r = rect();
    zoomAround(vpRef.current.zoom * factor, r.width / 2, r.height / 2);
  };
  const fitToContent = () => {
    const ws = widgetsRef.current;
    const r = rect();
    if (!ws.length) return p.setViewport({ x: 0, y: 0, zoom: 1 });
    const b = bboxOf(ws);
    const pad = 80;
    const zoom = clamp(Math.min((r.width - pad * 2) / b.w, (r.height - pad * 2 - 80) / (b.h + GROUP_LABEL)), MIN_ZOOM, 1);
    p.setViewport({
      zoom,
      x: r.width / 2 - (b.x + b.w / 2) * zoom,
      y: (r.height - 80) / 2 - (b.y - GROUP_LABEL / 2 + b.h / 2) * zoom,
    });
  };

  // 휠: 스크롤=이동, ⌘/Ctrl(핀치)=확대
  useEffect(() => {
    const el = rootRef.current!;
    const onWheel = (e: WheelEvent) => {
      const t = e.target as HTMLElement;
      if (!e.ctrlKey && !e.metaKey) {
        if (t.closest('textarea')) return;
        const sc = t.closest('.scrollable') as HTMLElement | null;
        if (sc && sc.scrollHeight > sc.clientHeight + 1) return; // 카드 내부 스크롤 우선
      }
      e.preventDefault();
      const v = vpRef.current;
      if (e.ctrlKey || e.metaKey) {
        const r = el.getBoundingClientRect();
        const z = clamp(v.zoom * Math.exp(-e.deltaY * 0.01), MIN_ZOOM, MAX_ZOOM);
        const sx = e.clientX - r.left;
        const sy = e.clientY - r.top;
        const k = z / v.zoom;
        propsRef.current.setViewport({ zoom: z, x: sx - (sx - v.x) * k, y: sy - (sy - v.y) * k });
      } else {
        propsRef.current.setViewport({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY });
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // ---------- 키보드 / 붙여넣기 ----------
  useEffect(() => {
    const isTyping = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      return !!el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT' || el.isContentEditable);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTyping(e.target)) {
        if (e.key === 'Escape') (e.target as HTMLElement).blur();
        return;
      }
      if (document.querySelector('.modal')) return;
      const mod = e.metaKey || e.ctrlKey;
      // 한글 입력 상태에서는 e.key가 'ㅍ'·'ㅗ' 등이 되므로 물리 키(e.code)로 판별
      if (e.code === 'Space') { e.preventDefault(); setSpaceDown(true); return; }
      if (mod && e.code === 'KeyZ') { e.preventDefault(); e.shiftKey ? p.redo() : p.undo(); return; }
      if (mod && e.code === 'Digit0') { e.preventDefault(); zoomBy(1 / vpRef.current.zoom); return; }
      if (mod && (e.code === 'Equal' || e.code === 'NumpadAdd')) { e.preventDefault(); zoomBy(1.2); return; }
      if (mod && (e.code === 'Minus' || e.code === 'NumpadSubtract')) { e.preventDefault(); zoomBy(1 / 1.2); return; }
      if (e.shiftKey && e.code === 'Digit1') { e.preventDefault(); fitToContent(); return; }
      if (mod && e.code === 'KeyA') { e.preventDefault(); setSel(widgetsRef.current.map((w) => w.id)); return; }
      if (!mod && e.code === 'KeyV') { setTool('select'); return; }
      if (!mod && e.code === 'KeyH') { setTool('hand'); return; }
      if (!mod && !e.shiftKey && e.code === 'KeyT') { e.preventDefault(); addText(); return; }
      if (selectedEdge && (e.key === 'Backspace' || e.key === 'Delete')) { e.preventDefault(); removeEdge(selectedEdge); return; }
      const ids = selRef.current;
      if (!ids.length) return;
      if (mod && e.code === 'KeyG') { e.preventDefault(); e.shiftKey ? ungroupSelection() : groupSelection(); return; }
      if (mod && e.code === 'KeyL') { e.preventDefault(); toggleLockMany(ids); return; }
      if (e.key === 'Escape') { setSel([]); return; }
      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        removeWidgets(ids.filter((id) => !widgetsRef.current.find((w) => w.id === id)?.locked));
        return;
      }
      if (e.key.startsWith('Arrow')) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        p.snapshot();
        p.setWidgets((ws) => ws.map((w) => (ids.includes(w.id) && !w.locked ? { ...w, x: w.x + dx, y: w.y + dy } : w)));
        return;
      }
      if (!selected) return; // 아래는 하나만 선택했을 때
      if (mod && e.code === 'KeyD') { e.preventDefault(); duplicateWidget(selected.id); }
      else if (e.key === 'Tab') { e.preventDefault(); addChild(selected.id); }
      else if (e.key === 'Enter') { e.preventDefault(); startEdit(selected.id); }
    };
    const onKeyUp = (e: KeyboardEvent) => { if (e.code === 'Space') setSpaceDown(false); };
    const onPaste = (e: ClipboardEvent) => {
      if (isTyping(e.target) || document.querySelector('.modal')) return;
      const files = Array.from(e.clipboardData?.files ?? []);
      if (files.length) { e.preventDefault(); importFiles(files); return; }
      const text = e.clipboardData?.getData('text/plain');
      if (text?.trim()) {
        e.preventDefault();
        const c = viewCenter();
        createNote(text, { x: c.x - 180, y: c.y - 120, w: 360, h: 240, color: 'yellow' });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('paste', onPaste);
    };
  });

  // ---------- 포인터 ----------
  const startPan = (e: RPointerEvent) => {
    e.preventDefault();
    const start = vpRef.current;
    setPanning(true);
    trackDrag(
      e,
      (dx, dy) => propsRef.current.setViewport({ ...start, x: start.x + dx, y: start.y + dy }),
      () => setPanning(false),
    );
  };

  /** 여러 위젯을 함께 이동 (고정된 것은 제외) */
  const startMove = (e: RPointerEvent, ids: string[], raise: boolean) => {
    const starts = new Map(widgetsRef.current.filter((w) => ids.includes(w.id) && !w.locked).map((w) => [w.id, { x: w.x, y: w.y }]));
    if (!starts.size) { startMarquee(e, false); return; } // 고정된 카드 위에서 끌면 영역 선택
    const top = maxZ();
    let recorded = false;
    trackDrag(e, (dx, dy) => {
      if (!recorded) { p.snapshot(); recorded = true; }
      const z = vpRef.current.zoom;
      p.setWidgets((ws) => ws.map((x) => {
        const s = starts.get(x.id);
        if (!s) return x;
        return { ...x, x: s.x + dx / z, y: s.y + dy / z, z: raise && x.z < top ? top + 1 : x.z };
      }));
    });
  };

  /** 빈 곳 드래그: 영역 선택 (⇧: 기존 선택에 추가) */
  const startMarquee = (e: RPointerEvent, additive: boolean) => {
    e.preventDefault();
    const a = toWorld(e.clientX, e.clientY);
    const base = additive ? selRef.current : [];
    trackDrag(
      e,
      (_dx, _dy, ev) => {
        const b = toWorld(ev.clientX, ev.clientY);
        setMarquee({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) });
      },
      (moved, ev) => {
        setMarquee(null);
        if (!moved) return;
        const b = toWorld(ev.clientX, ev.clientY);
        const r = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
        const hit = widgetsRef.current.filter((w) => intersects(r, { x: w.x, y: w.y, w: w.w, h: hOf(w) }));
        setSel([...new Set([...base, ...hit.flatMap(unitIds)])]);
        setSelectedEdge(null);
      },
    );
  };

  const onRootPointerDown = (e: RPointerEvent) => {
    const t = e.target as HTMLElement;
    const isBg = t === rootRef.current || t.classList.contains('world') || t.tagName === 'svg';
    // 선택 도구: 빈 곳을 끌면 영역 선택 (화면 이동은 두 손가락 스크롤 · Space+드래그 · 손 도구)
    if (isBg && e.button === 0 && !panMode) {
      if (!e.shiftKey) setSel([]);
      setSelectedEdge(null);
      setEditingId(null);
      startMarquee(e, e.shiftKey);
      return;
    }
    if (!(e.button === 1 || (e.button === 0 && panMode))) return;
    startPan(e);
  };

  /**
   * 위젯 누르기
   *  - ⇧: 선택에 추가/빼기
   *  - ⌘: 그룹 안의 이 항목 하나만
   *  - 그 외: 그룹 멤버면 그룹 전체, 이미 여러 개 선택돼 있으면 그대로 함께 이동
   */
  const onWidgetPointerDown = (e: RPointerEvent, w: Widget) => {
    if (e.button !== 0 || panMode) return; // 루트로 전파 → 패닝
    e.stopPropagation();
    if (editingId === w.id) return;
    setSelectedEdge(null);
    const unit = unitIds(w);
    if (e.shiftKey) {
      const cur = selRef.current;
      setSel(cur.includes(w.id) ? cur.filter((id) => !unit.includes(id)) : [...new Set([...cur, ...unit])]);
      return;
    }
    let ids: string[];
    if (e.metaKey || e.ctrlKey) ids = [w.id];
    else if (selRef.current.includes(w.id) && selRef.current.length > 1) ids = selRef.current;
    else ids = unit;
    setSel(ids);
    startMove(e, ids, ids.length === 1);
  };

  /** 그룹 틀(여백·이름표)을 누르면 그룹 전체 선택·이동 */
  const onGroupPointerDown = (e: RPointerEvent, gid: string) => {
    if (e.button !== 0 || panMode) return;
    e.stopPropagation();
    setSelectedEdge(null);
    const ids = membersOf(gid).map((w) => w.id);
    if (e.shiftKey) { setSel([...new Set([...selRef.current, ...ids])]); return; }
    setSel(ids);
    startMove(e, ids, false);
  };

  const onResizePointerDown = (e: RPointerEvent, w: Widget) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const ratio = w.w / w.h;
    let recorded = false;
    trackDrag(e, (dx, dy, ev) => {
      if (!recorded) { p.snapshot(); recorded = true; }
      const z = vpRef.current.zoom;
      if (w.type === 'text') { // 텍스트는 너비만 (높이는 내용에 맞춰 자동)
        const nw = Math.max(80, w.w + dx / z);
        p.setWidgets((ws) => ws.map((x) => (x.id === w.id ? { ...x, w: nw } : x)));
        return;
      }
      const nw = Math.max(160, w.w + dx / z);
      let nh = Math.max(80, w.h + dy / z);
      const keepRatio = (w.type === 'image') !== ev.shiftKey; // 이미지는 기본 비율 유지, Shift로 반전
      if (keepRatio) nh = nw / ratio;
      p.setWidgets((ws) => ws.map((x) => (x.id === w.id ? { ...x, w: nw, h: nh } : x)));
    });
  };

  /** 연결 핸들 드래그: 다른 카드 위에서 놓으면 연결 (빈 곳에 놓으면 아무 일도 없음) */
  const onConnectPointerDown = (e: RPointerEvent, w: Widget) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const startPt = toWorld(e.clientX, e.clientY);
    setConnect({ from: w.id, ...startPt });
    trackDrag(
      e,
      (_dx, _dy, ev) => setConnect({ from: w.id, ...toWorld(ev.clientX, ev.clientY) }),
      (moved, ev) => {
        setConnect(null);
        if (!moved) return;
        const pt = toWorld(ev.clientX, ev.clientY);
        const target = hitWidget(pt);
        if (target && target.id !== w.id) addEdge(w.id, target.id);
      },
    );
  };

  const onRootDoubleClick = (e: RMouseEvent) => {
    if (e.target !== rootRef.current || panMode) return;
    addBlank(toWorld(e.clientX, e.clientY));
  };

  // ---------- 드래그 앤 드롭 ----------
  const SIDEBAR_FILE = 'application/x-logmap-path';
  const onDragOver = (e: RDragEvent) => {
    if (!e.dataTransfer.types.includes('Files') && !e.dataTransfer.types.includes(SIDEBAR_FILE)) return;
    e.preventDefault();
    setDropHint(true);
  };
  const onDragLeave = (e: RDragEvent) => {
    if (!rootRef.current?.contains(e.relatedTarget as Node)) setDropHint(false);
  };
  const onDrop = (e: RDragEvent) => {
    e.preventDefault();
    setDropHint(false);
    const pt = toWorld(e.clientX, e.clientY);
    const fromSidebar = e.dataTransfer.getData(SIDEBAR_FILE);
    if (fromSidebar) { dropPaths([fromSidebar], pt); return; }
    const files = Array.from(e.dataTransfer.files);
    const mdPaths = files.filter((f) => MD_FILE.test(f.name)).map((f) => window.api.pathForFile(f)).filter((x): x is string => !!x);
    if (mdPaths.length && hitWidget(pt)) {
      dropPaths(mdPaths, pt);
      importFiles(files.filter((f) => !MD_FILE.test(f.name)), pt);
      return;
    }
    importFiles(files, pt);
  };

  // ---------- 렌더 ----------
  const gridSize = 22 * vp.zoom;
  const rootStyle: CSSProperties = {
    backgroundSize: `${gridSize}px ${gridSize}px`,
    backgroundPosition: `${vp.x}px ${vp.y}px`,
    backgroundImage: vp.zoom < 0.35 ? 'none' : undefined,
    cursor: panning ? 'grabbing' : panMode ? 'grab' : undefined,
  };
  const worldStyle = {
    transform: `translate(${vp.x}px, ${vp.y}px) scale(${vp.zoom})`,
    '--inv': 1 / vp.zoom,
  } as CSSProperties;

  const connectFrom = connect ? byId.get(connect.from) : undefined;
  // 연결선을 끌고 있을 때 손가락 아래 카드 (놓으면 연결될 대상) → 테두리로 표시
  const connectTargetId = (() => {
    if (!connect) return undefined;
    const t = hitWidget(connect);
    return t && t.id !== connect.from ? t.id : undefined;
  })();
  const selEdgeGeom = (() => {
    const e = edges.find((x) => x.id === selectedEdge);
    const a = e && byId.get(e.from);
    const b = e && byId.get(e.to);
    return a && b ? edgeGeometry(a, b) : null;
  })();

  const anyUnlocked = selWidgets.some((w) => !w.locked);

  /** 하나만 선택했을 때의 툴바·핸들 */
  const singleOverlay = (w: Widget) => {
    const isEdit = w.id === editingId;
    const isFile = w.type === 'file';
    const isText = w.type === 'text';
    const isCard = w.type === 'note' || isFile;
    const collapsed = !!w.collapsed && isCard;
    const content = contentOf(w);
    const candidates = p.recentFiles.filter((f) => f !== w.path).slice(0, 8);
    return (
      <div className={`sel-overlay ${isText ? 'text' : ''}`} style={{ left: w.x, top: w.y, width: w.w, height: hOf(w) }}>
        {!isEdit && (
          <div className="widget-toolbar" onPointerDown={(e) => e.stopPropagation()}>
            {isText && (
              <>
                {LEVELS.map((l) => (
                  <button
                    key={l.level}
                    className={`lvl-btn ${(w.level ?? 0) === l.level ? 'on' : ''}`}
                    data-tip={l.tip}
                    onClick={() => patchWidget(w.id, { level: l.level })}
                  >
                    {l.label}
                  </button>
                ))}
                <span className="tb-div" />
                {(Object.keys(TEXT_COLORS) as TextColor[]).map((c) => (
                  <button
                    key={c}
                    className={`swatch text-swatch ${(w.textColor ?? 'default') === c ? 'on' : ''}`}
                    style={{ background: TEXT_COLORS[c] }}
                    data-tip="글자 색"
                    onClick={() => patchWidget(w.id, { textColor: c })}
                  />
                ))}
                <span className="tb-div" />
                <button data-tip="편집 (Enter)" onClick={() => startEdit(w.id)}><Pencil size={15} /></button>
              </>
            )}
            {isCard && (
              <>
                {(Object.keys(NOTE_COLORS) as NoteColor[]).map((c) => (
                  <button
                    key={c}
                    className={`swatch ${(w.color ?? (isFile ? 'white' : 'yellow')) === c ? 'on' : ''}`}
                    style={{ background: NOTE_COLORS[c] }}
                    data-tip="카드 색상"
                    onClick={() => patchWidget(w.id, { color: c })}
                  />
                ))}
                <span className="tb-div" />
                <button data-tip={isFile ? '편집 (Enter) · 오른쪽 패널에서' : '편집 (Enter)'} onClick={() => startEdit(w.id)}><Pencil size={15} /></button>
                {!isFile && (
                  <button data-tip=".md 파일로 저장 · 원본 파일과 연결된 카드가 돼요" onClick={() => saveNoteAsFile(w)}><FileDown size={15} /></button>
                )}
              </>
            )}
            <span className="tb-menu-wrap">
              <button
                className={`tb-link-btn ${linkMenu ? 'on' : ''}`}
                data-tip="이어서 추가 · 새 메모 또는 기존 파일 연결"
                onClick={() => setLinkMenu((o) => !o)}
              >
                <GitBranchPlus size={15} />
              </button>
              {linkMenu && (
                <div className="link-menu">
                  <button onClick={() => { setLinkMenu(false); addChild(w.id); }}>
                    <StickyNote size={14} /> 새 메모 <kbd>Tab</kbd>
                  </button>
                  <div className="link-menu-label">기존 파일 연결</div>
                  {candidates.map((f) => (
                    <button key={f} title={f} onClick={() => { setLinkMenu(false); linkFilesTo(w.id, [f]); }}>
                      <FileText size={14} /> <span className="lm-name">{baseName(f)}</span>
                      <span className="lm-dir">{baseName(dirName(f))}</span>
                    </button>
                  ))}
                  <button
                    onClick={async () => {
                      setLinkMenu(false);
                      linkFilesTo(w.id, await window.api.pickMarkdownFiles());
                    }}
                  >
                    <FilePlus2 size={14} /> 다른 파일 선택…
                  </button>
                </div>
              )}
            </span>
            {isCard && (
              <button
                data-tip={collapsed ? '펼치기' : '제목만 보이게 접기'}
                onClick={() => patchWidget(w.id, { collapsed: !collapsed })}
              >
                {collapsed ? <ChevronsUpDown size={15} /> : <ChevronsDownUp size={15} />}
              </button>
            )}
            {isFile && (
              <button data-tip="Finder에서 보기" onClick={() => window.api.revealFile(w.path!)}><FolderOpen size={15} /></button>
            )}
            {isCard && (
              <button
                data-tip="이 내용을 템플릿으로 저장"
                onClick={() => p.onSaveAsTemplate({
                  name: widgetTitle(w, content), body: content, color: w.color ?? 'yellow', w: w.w, h: w.h,
                })}
              >
                <BookmarkPlus size={15} />
              </button>
            )}
            <span className="tb-div" />
            <button
              className={w.locked ? 'on' : ''}
              data-tip={w.locked ? '고정 해제 (⌘L)' : '위치 고정 (⌘L)'}
              onClick={() => toggleLockMany([w.id])}
            >
              {w.locked ? <Lock size={15} /> : <LockOpen size={15} />}
            </button>
            <button data-tip="맨 앞으로" onClick={() => reorder([w.id], true)}><BringToFront size={15} /></button>
            <button data-tip="맨 뒤로" onClick={() => reorder([w.id], false)}><SendToBack size={15} /></button>
            {!isFile && <button data-tip="복제 (⌘D)" onClick={() => duplicateWidget(w.id)}><Copy size={15} /></button>}
            {!w.locked && (
              <button
                className="danger"
                data-tip={isFile ? '보드에서 빼기 (파일은 그대로)' : '삭제 (⌫)'}
                onClick={() => removeWidgets([w.id])}
              >
                {isFile ? <X size={15} /> : <Trash2 size={15} />}
              </button>
            )}
          </div>
        )}
        {!isEdit && (['top', 'right', 'bottom', 'left'] as const).map((side) => (
          <div
            key={side}
            className={`conn-handle ${side}`}
            data-tip="드래그해서 연결"
            onPointerDown={(e) => onConnectPointerDown(e, w)}
          />
        ))}
        {!collapsed && !w.locked && (
          <div className={`resize-handle ${isText ? 'ew' : ''}`} onPointerDown={(e) => onResizePointerDown(e, w)} />
        )}
      </div>
    );
  };

  /** 여러 개(또는 그룹)를 선택했을 때의 툴바 */
  const multiOverlay = () => {
    const box = selGroup ? groupFrame(selWidgets) : (() => {
      const b = bboxOf(selWidgets);
      return { x: b.x - 8, y: b.y - 8, w: b.w + 16, h: b.h + 16 };
    })();
    return (
      <div className={`sel-overlay multi ${selGroup ? 'group' : ''}`} style={{ left: box.x, top: box.y, width: box.w, height: box.h }}>
        <div className="widget-toolbar" onPointerDown={(e) => e.stopPropagation()}>
          {selGroup ? (
            <>
              <span className="tb-label"><GroupIcon size={14} /> 그룹</span>
              <span className="tb-div" />
              {(Object.keys(GROUP_COLORS) as GroupColor[]).map((c) => (
                <button
                  key={c}
                  className={`swatch ${(selGroup.color ?? 'gray') === c ? 'on' : ''}`}
                  style={{ background: GROUP_COLORS[c].label }}
                  data-tip="그룹 색"
                  onClick={() => patchGroup(selGroup.id, { color: c })}
                />
              ))}
              <span className="tb-div" />
              <button data-tip="그룹 해제 (⇧⌘G)" onClick={ungroupSelection}><Ungroup size={15} /></button>
            </>
          ) : (
            <>
              <span className="tb-label">{selWidgets.length}개 선택</span>
              <span className="tb-div" />
              <button className="tb-text-btn" data-tip="선택한 항목을 그룹으로 묶기 (⌘G)" onClick={groupSelection}>
                <GroupIcon size={15} /> 그룹으로 묶기
              </button>
            </>
          )}
          <span className="tb-div" />
          <button
            className={anyUnlocked ? '' : 'on'}
            data-tip={anyUnlocked ? '모두 고정 (⌘L)' : '모두 고정 해제 (⌘L)'}
            onClick={() => toggleLockMany(sel)}
          >
            {anyUnlocked ? <LockOpen size={15} /> : <Lock size={15} />}
          </button>
          <button data-tip="맨 앞으로" onClick={() => reorder(sel, true)}><BringToFront size={15} /></button>
          <button data-tip="맨 뒤로" onClick={() => reorder(sel, false)}><SendToBack size={15} /></button>
          <button
            className="danger"
            data-tip="모두 삭제 (⌫) · 고정된 항목 제외"
            onClick={() => removeWidgets(sel.filter((id) => !byId.get(id)?.locked))}
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="canvas-wrap">
      <div
        ref={rootRef}
        className={`canvas ${panMode ? 'hand' : ''} ${panning ? 'panning' : ''} ${dropHint ? 'drop-hint' : ''} ${connect ? 'connecting' : ''}`}
        style={rootStyle}
        onPointerDown={onRootPointerDown}
        onDoubleClick={onRootDoubleClick}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <div className="world" style={worldStyle} ref={worldRef}>
          {/* 그룹 틀: 연결선·카드보다 아래 */}
          {groups.map((g) => {
            const members = board.widgets.filter((w) => w.groupId === g.id);
            if (!members.length) return null;
            const f = groupFrame(members);
            const c = GROUP_COLORS[g.color ?? 'gray'];
            return (
              <div
                key={g.id}
                className="group-frame"
                style={{ left: f.x, top: f.y, width: f.w, height: f.h, background: c.bg, borderColor: c.line }}
                onPointerDown={(e) => onGroupPointerDown(e, g.id)}
              />
            );
          })}

          <svg className="edges">
            {edges.map((e) => {
              const a = byId.get(e.from);
              const b = byId.get(e.to);
              if (!a || !b) return null;
              const { d } = edgeGeometry(a, b);
              return (
                <g key={e.id}>
                  <path
                    d={d}
                    className="edge-hit"
                    onPointerDown={(ev) => { ev.stopPropagation(); setSel([]); setSelectedEdge(e.id); }}
                  />
                  <path d={d} className={`edge ${e.id === selectedEdge ? 'selected' : ''}`} />
                </g>
              );
            })}
            {connect && connectFrom && (
              <path
                className="edge temp"
                d={`M ${connectFrom.x + connectFrom.w / 2} ${connectFrom.y + hOf(connectFrom) / 2} L ${connect.x} ${connect.y}`}
              />
            )}
          </svg>
          {selEdgeGeom && (
            <button
              className="edge-del"
              data-tip="연결 삭제 (⌫)"
              style={{ left: selEdgeGeom.mid.x, top: selEdgeGeom.mid.y }}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => removeEdge(selectedEdge!)}
            >
              <X size={13} />
            </button>
          )}

          {board.widgets.map((w) => {
            const isSel = sel.includes(w.id);
            const isEdit = w.id === editingId;
            const isFile = w.type === 'file';
            const dblClick = (e: RMouseEvent) => {
              e.stopPropagation();
              if (panMode) return;
              if (!isEdit) startEdit(w.id);
            };

            if (w.type === 'text') {
              const lvl = w.level ?? 0;
              const color = TEXT_COLORS[w.textColor ?? 'default'];
              return (
                <div
                  key={w.id}
                  data-wid={w.id}
                  className={`widget text lvl-${lvl} ${isSel ? 'selected' : ''} ${isEdit ? 'editing' : ''} ${w.id === connectTargetId ? 'connect-target' : ''}`}
                  style={{ left: w.x, top: w.y, width: w.w, zIndex: w.z, color }}
                  onPointerDown={(e) => onWidgetPointerDown(e, w)}
                  onMouseDown={(e) => { if (e.shiftKey || e.metaKey) e.preventDefault(); }} // ⇧·⌘클릭 때 글자 선택 방지
                  onDoubleClick={dblClick}
                >
                  {w.locked && <div className="lock-badge" data-tip="고정됨 (⌘L로 해제)"><Lock size={11} strokeWidth={2.5} /></div>}
                  {isEdit ? (
                    <textarea
                      className="text-editor"
                      autoFocus
                      spellCheck={false}
                      rows={1}
                      value={w.content ?? ''}
                      placeholder={lvl > 0 ? `제목 ${lvl}` : '텍스트'}
                      style={{ color }}
                      ref={(ta) => { if (ta) { ta.style.height = 'auto'; ta.style.height = `${ta.scrollHeight}px`; } }}
                      onChange={(e) => setContent(w, e.target.value)}
                      onBlur={() => finishEdit(w)}
                      onKeyDown={(e) => {
                        // Enter: 완료, ⇧Enter: 줄바꿈 (한글 조합 중 Enter는 글자 확정이라 무시)
                        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                          e.preventDefault();
                          e.stopPropagation(); // 캔버스 단축키(Enter = 편집 시작)로 넘어가지 않게
                          e.currentTarget.blur();
                        }
                      }}
                    />
                  ) : (
                    <div className="text-body">{w.content || <span className="placeholder">텍스트</span>}</div>
                  )}
                </div>
              );
            }

            const entry = isFile ? fileStore.files[w.path!] : undefined;
            const content = isFile ? entry?.content ?? '' : w.content ?? '';
            const collapsed = !!w.collapsed && w.type !== 'image';
            const showHead = isFile || collapsed;
            return (
              <div
                key={w.id}
                data-wid={w.id}
                className={`widget ${w.type} ${isSel ? 'selected' : ''} ${isEdit ? 'editing' : ''} ${collapsed ? 'collapsed' : ''} ${isFile && w.path === p.panelPath ? 'in-panel' : ''} ${w.id === connectTargetId ? 'connect-target' : ''}`}
                style={{
                  left: w.x,
                  top: w.y,
                  width: w.w,
                  height: hOf(w),
                  zIndex: w.z,
                  background: w.type !== 'image' ? NOTE_COLORS[w.color ?? (isFile ? 'white' : 'yellow')] : undefined,
                }}
                onPointerDown={(e) => onWidgetPointerDown(e, w)}
                onMouseDown={(e) => { if (e.shiftKey || e.metaKey) e.preventDefault(); }} // ⇧·⌘클릭 때 글자 선택 방지
                onDoubleClick={dblClick}
              >
                {w.locked && <div className="lock-badge" data-tip="고정됨 (⌘L로 해제)"><Lock size={11} strokeWidth={2.5} /></div>}
                {showHead && (
                  <div className="card-head" title={isFile ? w.path : undefined}>
                    {isFile ? <FileText size={14} /> : <StickyNote size={14} />}
                    <span>{widgetTitle(w, content)}</span>
                    {isFile && !collapsed && <span className="card-dir">{baseName(dirName(w.path!))}</span>}
                  </div>
                )}
                {collapsed ? null : w.type === 'image' ? (
                  <img src={assetUrl(w.src!)} draggable={false} alt="" />
                ) : isEdit ? (
                  <textarea
                    className="note-editor"
                    autoFocus
                    spellCheck={false}
                    value={content}
                    placeholder="마크다운으로 작성하세요…"
                    onChange={(e) => setContent(w, e.target.value)}
                    onBlur={() => finishEdit(w)}
                    onKeyDown={(e) => {
                      // ⌘Enter: 완료 (Enter는 마크다운 줄바꿈)
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        e.stopPropagation();
                        finishEdit(w); // 포커스 상태와 상관없이 바로 완료
                        return;
                      }
                      if (e.key === 'Tab') {
                        e.preventDefault();
                        const ta = e.currentTarget;
                        const { selectionStart: s, selectionEnd: en, value } = ta;
                        setContent(w, value.slice(0, s) + '  ' + value.slice(en));
                        requestAnimationFrame(() => ta.setSelectionRange(s + 2, s + 2));
                      }
                    }}
                  />
                ) : (
                  <div className="scrollable">
                    {entry?.error ? (
                      <div className="card-error">
                        <span>파일을 찾을 수 없어요</span>
                        <small>{w.path}</small>
                        <button
                          className="relink-btn"
                          onPointerDown={(e) => e.stopPropagation()}
                          onDoubleClick={(e) => e.stopPropagation()}
                          onClick={() => relinkFile(w.path!)}
                        >
                          <Link2 size={13} /> 파일 다시 연결
                        </button>
                      </div>
                    ) : content.trim() ? (
                      <MarkdownView
                        content={content}
                        baseDir={isFile ? dirName(w.path!) : undefined}
                        onToggleTask={(off) => toggleTask(w.id, off)}
                        onOpenLink={isFile ? (href) => openLinkFromCard(w.id, href) : undefined}
                      />
                    ) : (
                      <div className="placeholder">더블클릭해서 작성…</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* 연결선이 다른 카드 뒤로 지나가도 끊겨 보이지 않게: 카드 위에 흐린 점선으로 한 번 더 그림 */}
          <svg className="edges edges-over" aria-hidden>
            {edges.map((e) => {
              const a = byId.get(e.from);
              const b = byId.get(e.to);
              if (!a || !b) return null;
              return <path key={e.id} d={edgeGeometry(a, b).d} className={`edge-ghost ${e.id === selectedEdge ? 'selected' : ''}`} />;
            })}
          </svg>

          {/* 선택 표시·툴바·핸들은 카드 순서와 상관없이 항상 맨 위 레이어에 */}
          {selected && singleOverlay(selected)}
          {selWidgets.length > 1 && multiOverlay()}
          {marquee && <div className="marquee" style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }} />}
        </div>

        {board.widgets.length === 0 && (
          <div className="canvas-empty">
            빈 곳을 더블클릭하거나 아래 도구로 카드·텍스트를 추가하세요.
            <br />
            Finder에서 .md 파일을 끌어다 놓으면 원본 파일이 카드로 연결돼요.
          </div>
        )}
        {dropHint && <div className="drop-overlay">여기에 놓으면 파일·이미지가 카드로 추가돼요</div>}
      </div>

      <div className="dock">
        <button className="dock-btn" data-tip="새 메모 (빈 곳 더블클릭)" onClick={() => addBlank()}>
          <StickyNote size={20} strokeWidth={1.8} />
          <span>메모</span>
        </button>
        <button className="dock-btn" data-tip="텍스트 (T) · 제목1~4 / 본문" onClick={() => addText()}>
          <Type size={20} strokeWidth={1.8} />
          <span>텍스트</span>
        </button>
        {p.templates.map((t) => {
          const Icon = BOARD_ICONS[t.icon] ?? StickyNote;
          return (
            <div key={t.id} className="dock-item">
              <button className="dock-btn" data-tip={`템플릿: ${t.name}`} onClick={() => addTemplate(t)}>
                <Icon size={20} strokeWidth={1.8} />
                <span>{t.name}</span>
              </button>
              <button
                className="dock-x"
                aria-label={`${t.name} 템플릿 삭제`}
                onClick={() => p.onDeleteTemplate(t.id)}
              >
                <X size={10} strokeWidth={3} />
              </button>
            </div>
          );
        })}
        <button className="dock-btn" data-tip="템플릿 관리" onClick={p.onManageTemplates}>
          <LayoutTemplate size={20} strokeWidth={1.8} />
          <span>템플릿 관리</span>
        </button>
        <span className="dock-div" />
        <button className="dock-btn" data-tip=".md 파일을 카드로 추가 (원본과 연결)" onClick={async () => addFileCards(await window.api.pickMarkdownFiles())}>
          <FilePlus2 size={20} strokeWidth={1.8} />
          <span>파일 추가</span>
        </button>
        <button className="dock-btn" data-tip="이미지 추가 (끌어다 놓기·붙여넣기도 가능)" onClick={async () => placeImages(await window.api.pickImages())}>
          <ImagePlus size={20} strokeWidth={1.8} />
          <span>이미지</span>
        </button>
      </div>

      <div className="zoom-ctl">
        <button className={tool === 'select' ? 'on' : ''} data-tip="선택 도구 (V) · 빈 곳을 끌어 여러 개 선택" onClick={() => setTool('select')}>
          <MousePointer2 size={15} />
        </button>
        <button className={tool === 'hand' ? 'on' : ''} data-tip="손 도구 (H · 한/영 상관없음) · 카드 위에서도 화면만 이동" onClick={() => setTool('hand')}>
          <Hand size={15} />
        </button>
        <span className="zc-div" />
        <button data-tip="축소 (⌘-)" onClick={() => zoomBy(1 / 1.2)}><Minus size={15} /></button>
        <button className="zoom-label" data-tip="100%로 (⌘0)" onClick={() => zoomBy(1 / vp.zoom)}>
          {Math.round(vp.zoom * 100)}%
        </button>
        <button data-tip="확대 (⌘+)" onClick={() => zoomBy(1.2)}><Plus size={15} /></button>
        <span className="zc-div" />
        <button data-tip="전체 보기 (⇧1)" onClick={fitToContent}><Maximize2 size={14} /></button>
      </div>
    </div>
  );
}
