import { useEffect, useMemo, useRef, useState } from 'react';
import { FileText, FolderOpen, LayoutGrid, Pencil, Plus } from 'lucide-react';
import MarkdownView from './MarkdownView';
import Toc from './Toc';
import type { FileStore } from '../hooks/useFileStore';
import {
  GROUP_COLORS, assetUrl, baseName, dirName, readingUnits, textToMarkdown, tildify, toggleTaskAt, type Board, type Widget,
} from '../types';

interface Props {
  board: Board;
  setWidgets(fn: (ws: Widget[]) => Widget[]): void;
  snapshot(): void;
  onShowOnCanvas(id: string): void;
  fileStore: FileStore;
  /** 오른쪽 편집 패널에 열린 파일 */
  panelPath?: string | null;
  /** 파일 섹션 편집 → 오른쪽 편집 패널에서 (캔버스·파일 화면과 같은 편집기) */
  onEditFile(path: string): void;
}

function AutoTextarea({ value, onChange, onDone }: { value: string; onChange(v: string): void; onDone(): void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const ta = ref.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight + 2}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      className="doc-editor"
      autoFocus
      spellCheck={false}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onDone}
      onKeyDown={(e) => {
        // Esc · ⌘Enter: 완료
        if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) { e.preventDefault(); e.currentTarget.blur(); }
      }}
    />
  );
}

/** 보드의 카드를 위→아래, 왼쪽→오른쪽 순서로 이어 붙인 문서 보기 */
export default function DocView({ board, setWidgets, snapshot, onShowOnCanvas, fileStore, panelPath, onEditFile }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  // 그룹은 한 덩어리로, 나머지는 위→아래·왼쪽→오른쪽
  const units = useMemo(() => readingUnits(board.widgets, board.groups), [board.widgets, board.groups]);
  const items = units.flatMap((u) => u.items);
  const filesRef = useRef(fileStore.files);
  filesRef.current = fileStore.files;

  const contentOf = (w: Widget) => (w.type === 'file' ? fileStore.files[w.path!]?.content ?? '' : w.content ?? '');

  const startEdit = (w: Widget) => {
    if (w.type === 'file') { if (w.path) onEditFile(w.path); return; }
    if (w.type === 'note' || w.type === 'text') snapshot();
    setEditingId(w.id);
  };
  const setContent = (w: Widget, content: string) => {
    if (w.type === 'file' && w.path) fileStore.update(w.path, content);
    else setWidgets((ws) => ws.map((x) => (x.id === w.id ? { ...x, content } : x)));
  };
  const toggleTask = (id: string, offset: number) => {
    const w = board.widgets.find((x) => x.id === id);
    if (w?.type === 'file' && w.path) {
      const c = filesRef.current[w.path]?.content;
      if (c != null) fileStore.update(w.path, toggleTaskAt(c, offset));
      return;
    }
    snapshot();
    setWidgets((ws) => ws.map((x) => (x.id === id && x.content ? { ...x, content: toggleTaskAt(x.content, offset) } : x)));
  };

  const addSection = () => {
    snapshot();
    const ws = board.widgets;
    const bottom = ws.length ? Math.max(...ws.map((w) => w.y + w.h)) : 40;
    const left = ws.length ? Math.min(...ws.map((w) => w.x)) : 80;
    const base = {
      id: crypto.randomUUID(), x: left, y: bottom + 40, w: 420, h: 300,
      z: ws.reduce((m, w) => Math.max(m, w.z), 0) + 1, color: 'white' as const,
    };
    const nw: Widget = { ...base, type: 'note', content: '## 새 섹션\n' };
    setWidgets((prev) => [...prev, nw]);
    setEditingId(nw.id);
  };

  const renderItem = (w: Widget) => {
    const isFile = w.type === 'file';
    const isText = w.type === 'text';
    const entry = isFile ? fileStore.files[w.path!] : undefined;
    const content = contentOf(w);
    return (
      <section
        key={w.id}
        className={`doc-section ${isText ? 'text' : ''} ${editingId === w.id ? 'editing' : ''} ${isFile && w.path === panelPath ? 'in-panel' : ''}`}
        onDoubleClick={() => w.type !== 'image' && editingId !== w.id && startEdit(w)}
      >
        {isFile && (
          <div className="doc-file" title={w.path}>
            <FileText size={13} /> {baseName(w.path!)}
            <span className="muted">· {tildify(dirName(w.path!))}</span>
          </div>
        )}
        <div className="doc-actions">
          {w.type !== 'image' && editingId !== w.id && (
            <button data-tip={isFile ? '편집 · 오른쪽 패널에서' : '편집'} onClick={() => startEdit(w)}><Pencil size={14} /></button>
          )}
          {isFile && (
            <button data-tip="Finder에서 보기" onClick={() => window.api.revealFile(w.path!)}><FolderOpen size={14} /></button>
          )}
          <button data-tip="캔버스에서 보기" onClick={() => onShowOnCanvas(w.id)}><LayoutGrid size={14} /></button>
        </div>
        {w.type === 'image' ? (
          <img className="doc-image" src={assetUrl(w.src!)} alt="" />
        ) : editingId === w.id ? (
          <AutoTextarea value={content} onChange={(v) => setContent(w, v)} onDone={() => setEditingId(null)} />
        ) : entry?.error ? (
          <p className="card-error">파일을 찾을 수 없어요 · {w.path}</p>
        ) : isText ? (
          content.trim() ? <MarkdownView className="doc-md" content={textToMarkdown(w)} /> : null
        ) : content.trim() ? (
          <MarkdownView
            className="doc-md"
            content={content}
            baseDir={isFile ? dirName(w.path!) : undefined}
            onToggleTask={(off) => toggleTask(w.id, off)}
          />
        ) : (
          <p className="placeholder">빈 메모 · 더블클릭해서 작성</p>
        )}
      </section>
    );
  };

  const updated = new Date(board.updatedAt);

  return (
    <div className="doc-scroll" ref={scrollRef}>
      <div className="doc-layout">
        <article className="doc">
          <h1 className="doc-title">{board.name || '제목 없음'}</h1>
          <div className="doc-meta">
            {isNaN(updated.getTime()) ? '' : `마지막 수정 ${updated.toLocaleString('ko-KR')} · `}카드 {items.length}개
          </div>

          {items.length === 0 && <p className="muted">아직 내용이 없어요. 아래에서 섹션을 추가해 보세요.</p>}

          {units.map((u) => {
            if (!u.group) return renderItem(u.items[0]);
            const c = GROUP_COLORS[u.group.color ?? 'gray'];
            return (
              <div key={u.group.id} className="doc-group" style={{ borderColor: c.line, background: c.bg }}>
                {u.items.map(renderItem)}
              </div>
            );
          })}

          <button className="doc-add" onClick={addSection}>
            <Plus size={16} /> 섹션 추가
          </button>
        </article>
        <Toc scrollRef={scrollRef} version={`${board.widgets.length}:${Object.keys(fileStore.files).length}:${items.map((w) => contentOf(w).length).join()}`} />
      </div>
    </div>
  );
}
