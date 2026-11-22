import { useState } from 'react';
import { Plus, StickyNote, Trash2, X } from 'lucide-react';
import { BOARD_ICONS } from '../icons';
import { NOTE_COLORS, type NoteColor, type Template } from '../types';

interface Props {
  templates: Template[];
  initialId?: string | null;
  onSave(list: Template[]): void;
  onClose(): void;
}

const blank = (): Template => ({
  id: crypto.randomUUID(), name: '새 템플릿', icon: 'sticky', color: 'white', w: 400, h: 320, body: '## 제목\n- ',
});

/** 하단 도크 템플릿 추가·수정·삭제 */
export default function TemplateManager({ templates, initialId, onSave, onClose }: Props) {
  const [list, setList] = useState<Template[]>(() => templates.map((t) => ({ ...t })));
  const [selId, setSelId] = useState<string | null>(initialId ?? templates[0]?.id ?? null);
  const sel = list.find((t) => t.id === selId) ?? null;

  const patch = (p: Partial<Template>) => setList((l) => l.map((t) => (t.id === selId ? { ...t, ...p } : t)));
  const add = () => {
    const t = blank();
    setList((l) => [...l, t]);
    setSelId(t.id);
  };
  const remove = (id: string) => {
    const idx = list.findIndex((t) => t.id === id);
    const next = list.filter((t) => t.id !== id);
    setList(next);
    if (selId === id) setSelId(next[Math.max(0, idx - 1)]?.id ?? null);
  };
  const move = (id: string, dir: -1 | 1) => {
    const i = list.findIndex((t) => t.id === id);
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    setList(next);
  };

  return (
    <div className="modal-backdrop" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-label="템플릿 관리">
        <header className="modal-head">
          <div>
            <div className="modal-title">템플릿 관리</div>
            <div className="muted small">캔버스 아래 도크에 보이는 템플릿을 추가·수정·삭제해요.</div>
          </div>
          <button className="btn icon ghost" data-tip="닫기" onClick={onClose}><X size={16} /></button>
        </header>
        <div className="modal-body">
          <aside className="tpl-list">
            {list.map((t, i) => {
              const Icon = BOARD_ICONS[t.icon] ?? StickyNote;
              return (
                <div key={t.id} className={`tpl-item ${t.id === selId ? 'active' : ''}`} onClick={() => setSelId(t.id)}>
                  <span className="tpl-icon" style={{ background: NOTE_COLORS[t.color] }}><Icon size={15} /></span>
                  <span className="tpl-name">{t.name || '이름 없음'}</span>
                  <span className="tpl-order">
                    <button data-tip="위로" disabled={i === 0} onClick={(e) => { e.stopPropagation(); move(t.id, -1); }}>↑</button>
                    <button data-tip="아래로" disabled={i === list.length - 1} onClick={(e) => { e.stopPropagation(); move(t.id, 1); }}>↓</button>
                  </span>
                </div>
              );
            })}
            <button className="tpl-add" onClick={add}><Plus size={14} /> 새 템플릿</button>
          </aside>

          {sel ? (
            <section className="tpl-edit">
              <label className="field">
                <span>이름</span>
                <input value={sel.name} onChange={(e) => patch({ name: e.target.value })} />
              </label>
              <div className="field">
                <span>아이콘</span>
                <div className="tpl-icons">
                  {Object.entries(BOARD_ICONS).map(([key, Icon]) => (
                    <button key={key} className={sel.icon === key ? 'on' : ''} onClick={() => patch({ icon: key })}>
                      <Icon size={15} />
                    </button>
                  ))}
                </div>
              </div>
              <div className="field">
                <span>카드 색상</span>
                <div className="tpl-colors">
                  {(Object.keys(NOTE_COLORS) as NoteColor[]).map((c) => (
                    <button
                      key={c}
                      className={sel.color === c ? 'on' : ''}
                      style={{ background: NOTE_COLORS[c] }}
                      onClick={() => patch({ color: c })}
                    />
                  ))}
                </div>
              </div>
              <label className="field grow">
                <span>
                  내용 (마크다운) <em className="muted">{'{{date}}'} → 오늘 날짜, {'{{month}}'} → 이번 달</em>
                </span>
                <textarea value={sel.body} spellCheck={false} onChange={(e) => patch({ body: e.target.value })} />
              </label>
              <div className="tpl-foot">
                <button className="btn danger-text" onClick={() => remove(sel.id)}><Trash2 size={14} /> 이 템플릿 삭제</button>
              </div>
            </section>
          ) : (
            <section className="tpl-edit empty">템플릿이 없어요. 왼쪽에서 새 템플릿을 만들어 보세요.</section>
          )}
        </div>
        <footer className="modal-foot">
          <button className="btn" onClick={onClose}>취소</button>
          <button className="btn primary" onClick={() => onSave(list)}>저장</button>
        </footer>
      </div>
    </div>
  );
}
