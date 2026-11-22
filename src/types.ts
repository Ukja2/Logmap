/**
 * note: 보드 JSON 안에 저장되는 메모, file: 디스크의 .md 파일을 참조하는 카드, image: 이미지,
 * text: 카드 없이 캔버스에 바로 쓰는 글 (제목1~4 / 본문)
 */
export type WidgetType = 'note' | 'image' | 'file' | 'text';

export interface Widget {
  id: string;
  type: WidgetType;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  color?: NoteColor;
  content?: string; // note: markdown
  src?: string; // image: assets 폴더 내 파일명
  path?: string; // file: .md 파일 절대 경로
  collapsed?: boolean; // 제목만 보이게 접기 (마인드맵용)
  locked?: boolean; // 위치·크기 고정
  level?: number; // text: 1~4 = 제목1~4, 0 = 본문
  textColor?: TextColor; // text: 글자 색
  groupId?: string; // 속한 그룹
}

/** 여러 카드·텍스트를 묶는 그룹 (영역은 멤버 위치로 자동 계산) */
export interface Group {
  id: string;
  name: string;
  color?: GroupColor;
}

export const TEXT_COLORS = {
  default: '#18181b',
  gray: '#71717a',
  blue: '#3563e9',
  violet: '#6d4aff',
  green: '#17985a',
  red: '#d6335b',
} as const;
export type TextColor = keyof typeof TEXT_COLORS;

export const GROUP_COLORS = {
  gray: { bg: 'rgba(120, 120, 135, 0.07)', line: 'rgba(120, 120, 135, 0.35)', label: '#52525b' },
  blue: { bg: 'rgba(53, 99, 233, 0.06)', line: 'rgba(53, 99, 233, 0.35)', label: '#3563e9' },
  violet: { bg: 'rgba(109, 74, 255, 0.06)', line: 'rgba(109, 74, 255, 0.35)', label: '#6d4aff' },
  green: { bg: 'rgba(23, 152, 90, 0.06)', line: 'rgba(23, 152, 90, 0.35)', label: '#17985a' },
  amber: { bg: 'rgba(194, 122, 7, 0.07)', line: 'rgba(194, 122, 7, 0.38)', label: '#b06d05' },
  rose: { bg: 'rgba(214, 51, 91, 0.06)', line: 'rgba(214, 51, 91, 0.35)', label: '#d6335b' },
} as const;
export type GroupColor = keyof typeof GROUP_COLORS;

/** 위젯 사이의 연결선 */
export interface Edge {
  id: string;
  from: string;
  to: string;
}

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

export interface Board {
  id: string;
  name: string;
  /** 예전 버전 호환용. 새 보드는 icon/color 사용 */
  emoji?: string;
  icon?: string;
  color?: string;
  createdAt: string;
  updatedAt: string;
  viewport: Viewport;
  widgets: Widget[];
  edges?: Edge[];
  groups?: Group[];
}

export type BoardMeta = Pick<Board, 'id' | 'name' | 'emoji' | 'icon' | 'color' | 'createdAt' | 'updatedAt'> & {
  text: string;
  /** 이 보드에 파일 카드로 들어 있는 .md 경로들 */
  files?: string[];
};

export interface MdFile {
  path: string;
  name: string;
  dir: string;
  content: string;
  mtime: number;
}

export interface ScannedFile extends MdFile {
  links: string[];
}

export interface Template {
  id: string;
  name: string;
  icon: string;
  color: NoteColor;
  w: number;
  h: number;
  body: string;
}

/** 캔버스에 띄운 파일 카드의 내용 캐시 */
export interface FileEntry {
  content: string;
  error?: string;
}

export const NOTE_COLORS = {
  yellow: '#fff7d6',
  white: '#ffffff',
  blue: '#e8f0ff',
  green: '#e6f6ec',
  pink: '#fdeaf0',
  purple: '#efebff',
  gray: '#f1f1f3',
} as const;
export type NoteColor = keyof typeof NOTE_COLORS;

export interface Api {
  listBoards(): Promise<BoardMeta[]>;
  loadBoard(id: string): Promise<Board>;
  saveBoard(board: Board): Promise<boolean>;
  deleteBoard(id: string): Promise<boolean>;
  exportMarkdown(board: Board): Promise<string | null>;
  saveAsset(name: string, data: Uint8Array): Promise<string>;
  pickImages(): Promise<string[]>;
  pickMarkdownFile(): Promise<MdFile | null>;
  pickMarkdownFiles(): Promise<string[]>;
  pickFolder(title?: string): Promise<string | null>;
  readMarkdownFile(path: string): Promise<MdFile>;
  readTextFile(path: string): Promise<MdFile>;
  writeTextFile(path: string, content: string): Promise<boolean>;
  /** 메모를 .md 파일로 저장 (저장 대화상자). 취소하면 null */
  saveNewMarkdown(name: string, content: string): Promise<{ path: string; content: string } | null>;
  scanFolder(dir: string): Promise<ScannedFile[]>;
  pathForFile(file: File): string | null;
  loadTemplates(): Promise<Template[]>;
  saveTemplates(list: Template[]): Promise<boolean>;
  resolveMarkdownLink(base: string, href: string): Promise<MdFile>;
  recentFiles(): Promise<string[]>;
  revealFile(path: string): Promise<void>;
  pendingFiles(): Promise<string[]>;
  watchFiles(paths: string[]): Promise<boolean>;
  onFileChanged(cb: (path: string) => void): () => void;
  onOpenPath(cb: (path: string) => void): () => void;
  getDataDir(): Promise<string>;
  openDataDir(): Promise<string>;
  onBeforeClose(cb: () => void): () => void;
  readyToClose(): void;
}

declare global {
  interface Window {
    api: Api;
  }
}

export const assetUrl = (src: string) => `asset://local/${encodeURIComponent(src)}`;
export const localFileUrl = (absPath: string) => `localfile://f/${encodeURIComponent(absPath)}`;

/** 메모 안의 n번째 체크박스(소스 오프셋 기준)를 토글 */
export function toggleTaskAt(content: string, offset: number) {
  const m = /\[( |x|X)\]/.exec(content.slice(offset));
  if (!m) return content;
  const i = offset + m.index + 1;
  return content.slice(0, i) + (m[1] === ' ' ? 'x' : ' ') + content.slice(i + 1);
}

export const baseName = (p: string) => p.split('/').pop() ?? p;
export const dirName = (p: string) => p.slice(0, p.lastIndexOf('/'));
export const stripExt = (n: string) => n.replace(/\.[^.]+$/, '');
export const tildify = (p: string) => p.replace(/^\/Users\/[^/]+/, '~');

/** 카드 제목: 파일이면 파일 이름, 메모면 첫 제목/첫 줄 */
export function widgetTitle(w: Widget, content?: string) {
  if (w.type === 'file' && w.path) return stripExt(baseName(w.path));
  if (w.type === 'image') return '이미지';
  if (w.type === 'text') return (w.content ?? '').split('\n')[0].trim().slice(0, 60) || '텍스트';
  const line = (content ?? w.content ?? '').split('\n').find((l) => l.trim());
  return line ? line.replace(/^#+\s*/, '').replace(/[*_`]/g, '').trim().slice(0, 60) : '빈 메모';
}

/**
 * 문서 보기·내보내기용 읽기 순서: 그룹은 한 덩어리로(그룹 안은 위→아래), 나머지는 각자.
 * 덩어리끼리는 위→아래, 왼쪽→오른쪽.
 */
export function readingUnits(widgets: Widget[], groups: Group[] = []) {
  const order = (a: Widget, b: Widget) => a.y - b.y || a.x - b.x;
  const units: { group?: Group; items: Widget[]; x: number; y: number }[] = [];
  const grouped = new Set<string>();
  for (const g of groups) {
    const items = widgets.filter((w) => w.groupId === g.id).sort(order);
    if (!items.length) continue;
    items.forEach((w) => grouped.add(w.id));
    units.push({ group: g, items, x: Math.min(...items.map((w) => w.x)), y: Math.min(...items.map((w) => w.y)) });
  }
  for (const w of widgets) if (!grouped.has(w.id)) units.push({ items: [w], x: w.x, y: w.y });
  return units.sort((a, b) => a.y - b.y || a.x - b.x);
}

/** 텍스트 위젯을 마크다운으로 (제목1~4 → # ~ ####) */
export const textToMarkdown = (w: Widget) => {
  const lvl = w.level ?? 0;
  const body = (w.content ?? '').trim();
  return lvl > 0 ? body.split('\n').map((l) => `${'#'.repeat(lvl)} ${l}`).join('\n') : body;
};
