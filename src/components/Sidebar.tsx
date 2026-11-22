import { useEffect, useState } from 'react';
import { ChevronRight, FilePlus2, FileText, FolderInput, FolderOpen, Plus, Search, Trash2, X } from 'lucide-react';
import { BoardIcon } from '../icons';
import { baseName, tildify, type BoardMeta } from '../types';
import logo from '../assets/logo.png';

interface Props {
  metas: BoardMeta[];
  currentBoardId?: string;
  /** 보드마다 들어 있는 .md 파일 */
  filesByBoard: Record<string, string[]>;
  /** 보드에 없는데 지금 열어 보고 있는 파일 */
  looseFile?: string;
  /** 지금 열려 있는 파일 (파일 화면 또는 편집 패널) */
  activeFile?: string;
  dataDir: string;
  onOpen(id: string): void;
  onCreate(): void;
  onOpenFolder(): void;
  onDelete(id: string): void;
  onOpenBoardFile(boardId: string, path: string): void;
  onAddFiles(boardId: string): void;
  onOpenDataDir(): void;
}

const EXPANDED_KEY = 'sideExpanded';
const loadExpanded = (): Set<string> => {
  try { return new Set(JSON.parse(localStorage.getItem(EXPANDED_KEY) ?? '[]')); } catch { return new Set(); }
};

export default function Sidebar(p: Props) {
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();
  const [expanded, setExpanded] = useState(loadExpanded);
  const saveExpanded = (next: Set<string>) => {
    setExpanded(next);
    try { localStorage.setItem(EXPANDED_KEY, JSON.stringify([...next])); } catch { /* ignore */ }
  };
  const toggle = (id: string) => {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id); else next.add(id);
    saveExpanded(next);
  };
  // 보드를 열면 그 보드의 파일 목록을 펼침
  useEffect(() => {
    if (p.currentBoardId && !expanded.has(p.currentBoardId)) saveExpanded(new Set(expanded).add(p.currentBoardId));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.currentBoardId]);

  const items = p.metas.flatMap((m) => {
    const files = p.filesByBoard[m.id] ?? [];
    if (!query) return [{ m, files, snippet: undefined as string | undefined, forceOpen: false }];
    const hitFiles = files.filter((f) => baseName(f).toLowerCase().includes(query));
    const inName = m.name.toLowerCase().includes(query);
    const idx = m.text.toLowerCase().indexOf(query);
    if (!inName && idx < 0 && !hitFiles.length) return [];
    const snippet = !hitFiles.length && idx >= 0
      ? (idx > 20 ? '…' : '') + m.text.slice(Math.max(0, idx - 20), idx + query.length + 40).replace(/\s+/g, ' ')
      : undefined;
    // 파일 이름이 맞으면 그 파일만 보이게 펼침
    return [{ m, files: hitFiles.length ? hitFiles : files, snippet, forceOpen: hitFiles.length > 0 }];
  });

  const fileRow = (boardId: string, f: string) => (
    <div
      key={f}
      className={`side-file ${f === p.activeFile && boardId === p.currentBoardId ? 'active' : ''}`}
      onClick={() => p.onOpenBoardFile(boardId, f)}
      data-tip={`${tildify(f)}  ·  누르면 편집 패널로 열기, 캔버스로 끌어다 놓으면 카드로 추가`}
      data-tip-pos="bottom"
      draggable
      onDragStart={(e) => { e.dataTransfer.setData('application/x-logmap-path', f); e.dataTransfer.effectAllowed = 'copy'; }}
    >
      <FileText size={13} />
      <span className="side-file-name">{baseName(f)}</span>
    </div>
  );

  return (
    <aside className="sidebar">
      <div className="sidebar-drag" />
      <div className="brand">
        <img src={logo} alt="" width={22} height={22} />
        <span>Logmap</span>
      </div>
      <label className="search">
        <Search size={14} />
        <input placeholder="보드·메모·파일 검색" value={q} onChange={(e) => setQ(e.target.value)} />
        {q && <button onClick={() => setQ('')}><X size={13} /></button>}
      </label>

      <div className="side-scroll">
        {p.looseFile && (
          <>
            <div className="section-head"><span>열어 본 파일</span></div>
            <div className="side-item active loose" data-tip={`${tildify(p.looseFile)}  ·  보드에 없는 파일이에요`} data-tip-pos="bottom">
              <span className="file-icon"><FileText size={14} /></span>
              <span className="side-text">
                <span className="side-name">{baseName(p.looseFile)}</span>
                <span className="side-sub">보드에 없음 · 열어 보는 중</span>
              </span>
            </div>
          </>
        )}

        <div className="section-head">
          <span>보드</span>
          <span className="row">
            <button data-tip="폴더를 보드로 열기" onClick={p.onOpenFolder}><FolderInput size={15} /></button>
            <button data-tip="새 보드" onClick={p.onCreate}><Plus size={15} /></button>
          </span>
        </div>
        {items.map(({ m, files, snippet, forceOpen }) => {
          const open = forceOpen || expanded.has(m.id);
          const total = p.filesByBoard[m.id]?.length ?? 0;
          return (
            <div key={m.id} className="side-board">
              <div
                className={`side-item ${m.id === p.currentBoardId && !p.activeFile ? 'active' : ''} ${m.id === p.currentBoardId ? 'current' : ''}`}
                onClick={() => p.onOpen(m.id)}
              >
                <button
                  className={`side-chevron ${open ? 'open' : ''}`}
                  data-tip={open ? '파일 목록 접기' : `파일 목록 펼치기 (${total}개)`}
                  onClick={(e) => { e.stopPropagation(); toggle(m.id); }}
                >
                  <ChevronRight size={13} />
                </button>
                <BoardIcon board={m} size={24} />
                <span className="side-text">
                  <span className="side-name">{m.name || '제목 없음'}</span>
                  {snippet && <span className="side-sub">{snippet}</span>}
                </span>
                {total > 0 && <span className="side-count">{total}</span>}
                <button
                  className="side-del"
                  data-tip="보드 삭제"
                  onClick={(e) => { e.stopPropagation(); p.onDelete(m.id); }}
                >
                  <Trash2 size={13} />
                </button>
              </div>
              {open && (
                <div className="side-files">
                  {files.map((f) => fileRow(m.id, f))}
                  {!query && (
                    <button className="side-file add" onClick={() => p.onAddFiles(m.id)}>
                      <FilePlus2 size={13} /> 파일 추가
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {query && items.length === 0 && <div className="muted pad small">일치하는 보드나 파일이 없어요</div>}
      </div>

      <div className="sidebar-footer">
        <div className="data-dir" title={p.dataDir}>{tildify(p.dataDir)}</div>
        <button className="btn icon ghost" data-tip="Logmap 데이터 폴더 열기" data-tip-pos="top-end" onClick={p.onOpenDataDir}><FolderOpen size={15} /></button>
      </div>
    </aside>
  );
}
