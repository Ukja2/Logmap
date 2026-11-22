import { useEffect, useRef, useState } from 'react';
import { Check, Eye, FileText, Loader2, Maximize2, PencilLine, X } from 'lucide-react';
import MarkdownEditor from './MarkdownEditor';
import MarkdownView from './MarkdownView';
import { baseName, dirName, tildify, toggleTaskAt } from '../types';

interface Props {
  path: string;
  content: string;
  /** 내용을 다 불러왔는지 (불러오기 전에 편집하면 빈 내용으로 덮어쓸 수 있으므로) */
  loaded: boolean;
  error?: string;
  saving: boolean;
  onChange(content: string): void;
  onSaveNow(): void;
  onOpenLink(href: string): void;
  onClose(): void;
  /** 파일 화면(전체 화면)으로 열기 */
  onOpenFull(): void;
}

const MIN_W = 380;
const loadWidth = () => {
  try { return Math.max(MIN_W, Number(localStorage.getItem('panelWidth')) || 620); } catch { return 620; }
};

/**
 * 보드 오른쪽 편집 패널. 파일 화면과 같은 편집기(원문 + 미리보기)를 쓰고,
 * 고치는 동안 왼쪽 보드의 카드가 실시간으로 바뀐다.
 */
export default function EditorPanel({ path, content, loaded, error, saving, onChange, onSaveNow, onOpenLink, onClose, onOpenFull }: Props) {
  const [mode, setMode] = useState<'view' | 'edit'>('edit');
  const [width, setWidth] = useState(loadWidth);
  const panelRef = useRef<HTMLElement>(null);

  // 다른 파일을 열면 다시 편집 모드로
  useEffect(() => setMode('edit'), [path]);

  // Esc: 입력 중이면 입력만 끝내고(캔버스가 처리), 아니면 패널 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.querySelector('.modal')) return;
      const t = e.target as HTMLElement;
      if (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT') {
        if (panelRef.current?.contains(t)) t.blur();
        return;
      }
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // 왼쪽 가장자리를 끌어 너비 조절
  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = width;
    const max = () => Math.max(MIN_W, window.innerWidth - 520);
    let last = startW;
    const move = (ev: PointerEvent) => {
      last = Math.min(max(), Math.max(MIN_W, startW + (startX - ev.clientX)));
      setWidth(last);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      try { localStorage.setItem('panelWidth', String(last)); } catch { /* ignore */ }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <aside className="editor-panel" ref={panelRef} style={{ width }}>
      <div className="panel-resize" onPointerDown={startResize} data-tip="끌어서 너비 조절" />
      <header className="panel-head">
        <span className="file-badge small"><FileText size={15} /></span>
        <div className="file-title">
          <div className="file-name">{baseName(path)}</div>
          <div className="file-path" data-tip={path} data-tip-pos="bottom">{tildify(dirName(path))}</div>
        </div>
        <span className={`save-state ${saving ? 'busy' : ''}`} data-tip="고치면 원본 파일에 자동 저장돼요 (⌘S: 바로 저장)" data-tip-pos="bottom">
          {saving ? <><Loader2 size={12} className="spin" /> 저장 중…</> : <><Check size={12} /> 저장됨</>}
        </span>
        <div className="spacer" />
        <div className="segmented">
          <button className={mode === 'view' ? 'on' : ''} onClick={() => setMode('view')}><Eye size={14} /> 보기</button>
          <button className={mode === 'edit' ? 'on' : ''} onClick={() => setMode('edit')}><PencilLine size={14} /> 편집</button>
        </div>
        <button className="icon-btn" data-tip="파일 화면에서 크게 보기" data-tip-pos="bottom" onClick={onOpenFull}><Maximize2 size={15} /></button>
        <button className="icon-btn" data-tip="닫기 (Esc)" data-tip-pos="bottom-end" onClick={onClose}><X size={16} /></button>
      </header>
      {!loaded ? (
        <div className="panel-error muted"><Loader2 size={14} className="spin" /> 불러오는 중…</div>
      ) : error ? (
        <div className="panel-error card-error">파일을 찾을 수 없어요<br /><small>{path}</small></div>
      ) : mode === 'edit' ? (
        <MarkdownEditor
          key={path}
          content={content}
          baseDir={dirName(path)}
          onChange={onChange}
          onSaveNow={onSaveNow}
          onOpenLink={onOpenLink}
        />
      ) : (
        <div className="panel-view">
          <article className="doc">
            <MarkdownView
              className="doc-md"
              content={content}
              baseDir={dirName(path)}
              onOpenLink={onOpenLink}
              onToggleTask={(off) => onChange(toggleTaskAt(content, off))}
            />
          </article>
        </div>
      )}
    </aside>
  );
}
