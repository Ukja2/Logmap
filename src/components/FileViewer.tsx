import { useRef, useState } from 'react';
import { Check, Eye, FileText, Import, LayoutGrid, Loader2, PencilLine } from 'lucide-react';
import MarkdownView from './MarkdownView';
import MarkdownEditor from './MarkdownEditor';
import Toc from './Toc';
import { tildify, toggleTaskAt, type MdFile } from '../types';

/** view: 읽기, edit: 왼쪽 원문 편집 + 오른쪽 미리보기 */
type Mode = 'view' | 'edit';

interface Props {
  file: MdFile;
  /** 현재 내용 (보드와 함께 쓰는 파일 캐시 기준) */
  content: string;
  saving: boolean;
  onChange(content: string): void;
  onSaveNow(): void;
  onOpenLink(href: string): void;
  onImport(): void;
  /** 이 파일이 카드로 들어 있는 보드들 */
  boards: { id: string; name: string }[];
  onOpenBoard(id: string): void;
}

function loadMode(): Mode {
  try {
    const m = localStorage.getItem('viewerMode');
    return m === 'edit' || m === 'split' ? 'edit' : 'view'; // 예전 '나란히' 설정은 편집으로
  } catch { return 'view'; }
}

/** 디스크의 .md 파일 뷰어 겸 편집기. 고치면 원본에 자동 저장되고, 같은 파일을 띄운 보드 카드에도 바로 반영된다 */
export default function FileViewer({ file, content, saving, onChange, onSaveNow, onOpenLink, onImport, boards, onOpenBoard }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [mode, setModeState] = useState<Mode>(loadMode);
  const setMode = (m: Mode) => {
    setModeState(m);
    try { localStorage.setItem('viewerMode', m); } catch { /* ignore */ }
  };

  const preview = (
    <MarkdownView
      className="doc-md"
      content={content}
      baseDir={file.dir}
      onOpenLink={onOpenLink}
      onToggleTask={(off) => onChange(toggleTaskAt(content, off))}
    />
  );

  return (
    <section className="main-col">
      <header className="topbar">
        <span className="file-badge"><FileText size={17} /></span>
        <div className="file-title">
          <div className="file-name">{file.name}</div>
          <div className="file-path" data-tip={file.path} data-tip-pos="bottom">{tildify(file.dir)}</div>
        </div>
        <span className={`save-state ${saving ? 'busy' : ''}`} data-tip="고치면 원본 파일에 자동 저장돼요 (⌘S: 바로 저장)" data-tip-pos="bottom">
          {saving ? <><Loader2 size={12} className="spin" /> 저장 중…</> : <><Check size={12} /> 저장됨</>}
        </span>
        <div className="spacer" />
        <div className="segmented">
          <button className={mode === 'view' ? 'on' : ''} onClick={() => setMode('view')}><Eye size={14} /> 보기</button>
          <button className={mode === 'edit' ? 'on' : ''} onClick={() => setMode('edit')}><PencilLine size={14} /> 편집</button>
        </div>
        <div className="spacer" />
        {boards.map((b) => (
          <button
            key={b.id}
            className="board-chip"
            data-tip="이 파일이 카드로 들어 있는 보드 · 여기서 고치면 바로 반영돼요"
            data-tip-pos="bottom"
            onClick={() => onOpenBoard(b.id)}
          >
            <LayoutGrid size={13} /> {b.name}
          </button>
        ))}
        <button
          className="btn primary"
          data-tip="이 파일을 카드로 띄운 새 보드를 만들어요 (원본 파일과 연결)"
          data-tip-pos="bottom-end"
          onClick={onImport}
        >
          <Import size={15} /> 캔버스로 가져오기
        </button>
      </header>

      {mode === 'view' && (
        <div className="doc-scroll" ref={scrollRef} key={file.path}>
          <div className="doc-layout">
            <article className="doc">{preview}</article>
            <Toc scrollRef={scrollRef} version={content} />
          </div>
        </div>
      )}
      {mode === 'edit' && (
        <MarkdownEditor
          key={file.path}
          content={content}
          baseDir={file.dir}
          onChange={onChange}
          onSaveNow={onSaveNow}
          onOpenLink={onOpenLink}
          previewRef={scrollRef}
        />
      )}
    </section>
  );
}
