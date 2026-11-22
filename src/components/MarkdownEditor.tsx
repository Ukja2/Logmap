import { useEffect, useRef, type RefObject } from 'react';
import MarkdownView from './MarkdownView';
import { toggleTaskAt } from '../types';

interface Props {
  content: string;
  /** 상대 경로 이미지·링크 기준 폴더 */
  baseDir?: string;
  onChange(content: string): void;
  onSaveNow?(): void;
  onOpenLink?(href: string): void;
  /** 미리보기 쪽 스크롤 영역 (목차 등에서 사용) */
  previewRef?: RefObject<HTMLDivElement | null>;
  autoFocus?: boolean;
}

/**
 * 원문(왼쪽) + 미리보기(오른쪽) 편집기.
 * 파일 화면과 보드의 편집 패널이 같은 편집기를 쓴다. (좁으면 위·아래로 쌓임)
 */
export default function MarkdownEditor({ content, baseDir, onChange, onSaveNow, onOpenLink, previewRef, autoFocus = true }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (autoFocus) ref.current?.focus(); }, [autoFocus]);

  return (
    <div className="file-split">
      <div className="file-split-pane">
        <textarea
          ref={ref}
          className="file-editor"
          spellCheck={false}
          value={content}
          placeholder="마크다운으로 작성하세요…"
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.code === 'KeyS') { e.preventDefault(); onSaveNow?.(); }
            if (e.key === 'Tab') {
              e.preventDefault();
              const ta = e.currentTarget;
              const { selectionStart: s, selectionEnd: en, value } = ta;
              onChange(value.slice(0, s) + '  ' + value.slice(en));
              requestAnimationFrame(() => ta.setSelectionRange(s + 2, s + 2));
            }
          }}
        />
      </div>
      <div className="file-split-pane preview" ref={previewRef}>
        <article className="doc">
          <MarkdownView
            className="doc-md"
            content={content}
            baseDir={baseDir}
            onOpenLink={onOpenLink}
            onToggleTask={(off) => onChange(toggleTaskAt(content, off))}
          />
        </article>
      </div>
    </div>
  );
}
