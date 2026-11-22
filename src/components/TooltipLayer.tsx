import { useEffect, useLayoutEffect, useRef, useState } from 'react';

interface Tip {
  text: string;
  x: number; // 기준 요소의 가로 중앙
  y: number; // 위쪽 배치면 요소 top, 아래쪽 배치면 요소 bottom
  place: 'top' | 'bottom';
  align: 'center' | 'end';
  right: number;
}

/**
 * data-tip 속성이 있는 요소에 마우스를 올리면 화면 최상단 레이어에 툴팁을 띄운다.
 * (사이드바·도크처럼 overflow가 있는 영역에서도 잘리지 않도록 position: fixed 사용)
 *   data-tip-pos="bottom" | "bottom-end" | "top-end" 로 위치 힌트 가능
 */
export default function TooltipLayer() {
  const [tip, setTip] = useState<Tip | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let current: HTMLElement | null = null;
    let timer = 0;
    const show = (el: HTMLElement) => {
      const text = el.dataset.tip;
      if (!text || !el.isConnected) return;
      const r = el.getBoundingClientRect();
      const pos = el.dataset.tipPos ?? '';
      let place: Tip['place'] = pos.startsWith('bottom') ? 'bottom' : 'top';
      if (place === 'top' && r.top < 44) place = 'bottom';
      if (place === 'bottom' && r.bottom > window.innerHeight - 44) place = 'top';
      setTip({
        text, place, x: r.left + r.width / 2, y: place === 'top' ? r.top : r.bottom,
        align: pos.endsWith('end') ? 'end' : 'center', right: r.right,
      });
    };
    const hide = () => { current = null; window.clearTimeout(timer); setTip(null); };
    const onOver = (e: MouseEvent) => {
      const el = (e.target as HTMLElement | null)?.closest?.('[data-tip]') as HTMLElement | null;
      if (el === current) return;
      current = el;
      window.clearTimeout(timer);
      setTip(null);
      if (el) timer = window.setTimeout(() => show(el), 120);
    };
    document.addEventListener('mouseover', onOver);
    document.addEventListener('pointerdown', hide, true);
    document.addEventListener('wheel', hide, { capture: true, passive: true });
    document.addEventListener('keydown', hide, true);
    document.documentElement.addEventListener('mouseleave', hide);
    window.addEventListener('blur', hide);
    return () => {
      document.removeEventListener('mouseover', onOver);
      document.removeEventListener('pointerdown', hide, true);
      document.removeEventListener('wheel', hide, true);
      document.removeEventListener('keydown', hide, true);
      document.documentElement.removeEventListener('mouseleave', hide);
      window.removeEventListener('blur', hide);
    };
  }, []);

  // 창 밖으로 나가지 않도록 가로 위치 보정
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !tip) return;
    const w = el.offsetWidth;
    const left = tip.align === 'end' ? tip.right - w : tip.x - w / 2;
    el.style.left = `${Math.min(Math.max(8, left), window.innerWidth - w - 8)}px`;
    el.style.visibility = 'visible';
  }, [tip]);

  if (!tip) return null;
  return (
    <div
      ref={ref}
      className={`tooltip ${tip.place}`}
      style={{ top: tip.place === 'top' ? tip.y - 7 : tip.y + 7, visibility: 'hidden' }}
      role="tooltip"
    >
      {tip.text}
    </div>
  );
}
