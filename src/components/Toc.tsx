import { useEffect, useRef, useState, type RefObject } from 'react';

interface Heading {
  level: number;
  text: string;
  el: HTMLElement;
}

/** 스크롤 컨테이너 안의 h1~h3을 읽어 목차를 만들고, 현재 위치를 강조 */
export default function Toc({ scrollRef, version }: { scrollRef: RefObject<HTMLElement | null>; version: unknown }) {
  const [headings, setHeadings] = useState<Heading[]>([]);
  const [active, setActive] = useState(0);
  const navRef = useRef<HTMLElement>(null);
  const lockRef = useRef<number | null>(null); // 목차를 클릭한 항목 (사용자가 직접 스크롤하면 해제)

  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const list = Array.from(root.querySelectorAll<HTMLElement>('.md h1, .md h2, .md h3')).map((el) => ({
      level: Number(el.tagName[1]),
      text: el.textContent ?? '',
      el,
    }));
    setHeadings(list);
  }, [scrollRef, version]);

  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const onScroll = () => {
      if (lockRef.current != null) { setActive(lockRef.current); return; }
      // 맨 아래까지 내리면 마지막 제목이 위로 못 올라오므로 마지막 항목을 활성화
      if (root.scrollTop + root.clientHeight >= root.scrollHeight - 4) {
        setActive(headings.length - 1);
        return;
      }
      const top = root.getBoundingClientRect().top + 90;
      let idx = 0;
      headings.forEach((h, i) => { if (h.el.getBoundingClientRect().top <= top) idx = i; });
      setActive(idx);
    };
    const unlock = () => { lockRef.current = null; };
    onScroll();
    root.addEventListener('scroll', onScroll, { passive: true });
    root.addEventListener('wheel', unlock, { passive: true });
    root.addEventListener('keydown', unlock);
    root.addEventListener('pointerdown', unlock);
    return () => {
      root.removeEventListener('scroll', onScroll);
      root.removeEventListener('wheel', unlock);
      root.removeEventListener('keydown', unlock);
      root.removeEventListener('pointerdown', unlock);
    };
  }, [scrollRef, headings]);

  // 목차가 길 때 현재 항목이 목차 영역 안에 보이도록.
  // scrollIntoView를 쓰면 바깥 본문 스크롤까지 건드려 클릭 이동이 끊기므로 목차 자체만 스크롤한다.
  useEffect(() => {
    const nav = navRef.current;
    const item = nav?.querySelector<HTMLElement>('.toc-item.active');
    if (!nav || !item) return;
    const top = item.offsetTop; // .toc가 sticky(위치 지정 요소)라 항목 offsetTop은 목차 기준
    if (top < nav.scrollTop) nav.scrollTop = top - 8;
    else if (top + item.offsetHeight > nav.scrollTop + nav.clientHeight) nav.scrollTop = top + item.offsetHeight - nav.clientHeight + 8;
  }, [active]);

  if (headings.length < 2) return null;
  const minLevel = Math.min(...headings.map((h) => h.level));

  return (
    <nav className="toc" ref={navRef}>
      <div className="toc-title">목차</div>
      {headings.map((h, i) => (
        <button
          key={i}
          className={`toc-item ${i === active ? 'active' : ''}`}
          style={{ paddingLeft: 10 + (h.level - minLevel) * 12 }}
          onPointerDown={(e) => e.stopPropagation()} // 본문의 "직접 스크롤" 감지(잠금 해제)에 걸리지 않게
          onClick={() => {
            const root = scrollRef.current;
            if (!root) return;
            lockRef.current = i;
            setActive(i);
            const top = h.el.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop - 24;
            root.scrollTo({ top, behavior: 'smooth' });
          }}
          title={h.text}
        >
          {h.text}
        </button>
      ))}
    </nav>
  );
}
