import { useState } from 'react';
import { Download, FileText, LayoutGrid, Redo2, Undo2 } from 'lucide-react';
import { BOARD_COLORS, BOARD_ICONS, BoardIcon, resolveBoardIcon } from '../icons';
import type { Board } from '../types';

export type ViewMode = 'canvas' | 'doc';

interface Props {
  board: Board;
  mode: ViewMode;
  onMode(m: ViewMode): void;
  onRename(patch: Partial<Pick<Board, 'name' | 'icon' | 'color'>>): void;
  undo(): void;
  redo(): void;
  onExport(): void;
}

export default function BoardHeader({ board, mode, onMode, onRename, undo, redo, onExport }: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const { palette } = resolveBoardIcon(board);
  const currentColor = board.color ?? Object.keys(BOARD_COLORS).find((k) => BOARD_COLORS[k] === palette) ?? 'slate';

  return (
    <header className="topbar">
      <div className="icon-wrap">
        <button className="icon-btn" data-tip="아이콘 변경" data-tip-pos="bottom" onClick={() => setPickerOpen((o) => !o)}>
          <BoardIcon board={board} size={30} />
        </button>
        {pickerOpen && (
          <>
            <div className="popover-backdrop" onClick={() => setPickerOpen(false)} />
            <div className="icon-pop">
              <div className="pop-label">아이콘</div>
              <div className="icon-grid">
                {Object.entries(BOARD_ICONS).map(([key, Icon]) => (
                  <button
                    key={key}
                    className={board.icon === key ? 'on' : ''}
                    style={{ color: palette.fg }}
                    onClick={() => onRename({ icon: key, color: currentColor })}
                  >
                    <Icon size={17} strokeWidth={2} />
                  </button>
                ))}
              </div>
              <div className="pop-label">색상</div>
              <div className="color-row">
                {Object.entries(BOARD_COLORS).map(([key, c]) => (
                  <button
                    key={key}
                    className={currentColor === key ? 'on' : ''}
                    style={{ background: c.bg, color: c.fg }}
                    onClick={() => onRename({ color: key, icon: board.icon ?? resolveIconKey(board) })}
                  >
                    <span style={{ background: c.fg }} />
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
      <input
        className="title-input"
        value={board.name}
        placeholder="보드 이름"
        onChange={(e) => onRename({ name: e.target.value })}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      />

      <div className="spacer" />
      <div className="segmented centered">
        <button className={mode === 'canvas' ? 'on' : ''} onClick={() => onMode('canvas')}>
          <LayoutGrid size={14} /> 캔버스
        </button>
        <button className={mode === 'doc' ? 'on' : ''} onClick={() => onMode('doc')}>
          <FileText size={14} /> 문서
        </button>
      </div>
      <div className="spacer" />
      <button className="btn icon" data-tip="실행 취소 (⌘Z)" data-tip-pos="bottom" onClick={undo}><Undo2 size={15} /></button>
      <button className="btn icon" data-tip="다시 실행 (⇧⌘Z)" data-tip-pos="bottom" onClick={redo}><Redo2 size={15} /></button>
      <div className="divider" />
      <button className="btn" data-tip="보드 전체를 .md 파일 하나로 내보내기" data-tip-pos="bottom-end" onClick={onExport}>
        <Download size={15} /> 내보내기
      </button>
    </header>
  );
}

/** 이모지만 있던 예전 보드에서 색만 바꿀 때 현재 보이는 아이콘을 유지 */
function resolveIconKey(board: Board) {
  const { Icon } = resolveBoardIcon(board);
  return Object.keys(BOARD_ICONS).find((k) => BOARD_ICONS[k] === Icon) ?? 'folder';
}
