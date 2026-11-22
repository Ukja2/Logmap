import { memo } from 'react';
import Markdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { localFileUrl } from '../types';

interface Props {
  content: string;
  /** 체크박스를 클릭하면 해당 리스트 항목의 소스 오프셋을 전달 */
  onToggleTask?(offset: number): void;
  /** 외부 .md 파일을 볼 때: 상대 경로 이미지를 이 폴더 기준으로 불러옴 */
  baseDir?: string;
  /** 상대 경로 .md 링크를 클릭했을 때 */
  onOpenLink?(href: string): void;
  className?: string;
}

const isExternal = (href: string) => /^[a-z][a-z0-9+.-]*:/i.test(href);

/** 맨 앞의 YAML 속성 블록(--- ... ---)을 떼어내 key/value 목록으로 */
function splitFrontmatter(content: string) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(content);
  if (!m) return { body: content, offset: 0, props: [] as [string, string][] };
  const props = m[1]
    .split(/\r?\n/)
    .map((l) => /^([^:#\s][^:]*):\s*(.*)$/.exec(l))
    .filter((x): x is RegExpExecArray => !!x && !!x[2].trim())
    .map((x) => [x[1].trim(), x[2].trim().replace(/^\[(.*)\]$/, '$1').replace(/^["']|["']$/g, '')] as [string, string]);
  return { body: content.slice(m[0].length), offset: m[0].length, props };
}

// ---- Obsidian 문법 일부 지원 (hast 변환) ----
type HNode = { type: string; tagName?: string; value?: string; properties?: Record<string, unknown>; children?: HNode[] };
const WIKILINK = /\[\[([^\]|]+?)(?:\\?\|([^\]]+))?\]\]/g;

/** > [!summary] 제목  →  색이 있는 콜아웃 상자,  [[문서|표시]]  →  강조된 링크 텍스트 */
function rehypeObsidian() {
  const walk = (node: HNode, parent?: HNode) => {
    if (node.type === 'element' && node.tagName === 'blockquote') {
      const p = node.children?.find((c) => c.type === 'element' && c.tagName === 'p');
      const first = p?.children?.[0];
      const m = first?.type === 'text' ? /^\[!(\w+)\][+-]?[ \t]*/.exec(first.value ?? '') : null;
      if (m && first) {
        first.value = (first.value ?? '').slice(m[0].length).replace(/^\n/, '');
        node.properties = { ...node.properties, className: ['callout', `callout-${m[1].toLowerCase()}`] };
      }
    }
    if (node.type === 'text' && parent?.children && node.value && WIKILINK.test(node.value)) {
      WIKILINK.lastIndex = 0;
      const parts: HNode[] = [];
      let last = 0;
      for (const m of node.value.matchAll(WIKILINK)) {
        if (m.index! > last) parts.push({ type: 'text', value: node.value.slice(last, m.index) });
        const target = m[1].trim();
        const label = (m[2] ?? target.split('/').pop()!.replace(/\.md$/i, '')).trim();
        parts.push({
          type: 'element', tagName: 'span',
          properties: { className: ['wikilink'], title: target },
          children: [{ type: 'text', value: label }],
        });
        last = m.index! + m[0].length;
      }
      if (last < node.value.length) parts.push({ type: 'text', value: node.value.slice(last) });
      const i = parent.children.indexOf(node);
      parent.children.splice(i, 1, ...parts);
      return parts.length - 1; // 새로 넣은 노드만큼 건너뜀
    }
    for (let i = 0; i < (node.children?.length ?? 0); i++) i += walk(node.children![i], node) ?? 0;
    return 0;
  };
  return (tree: HNode) => { walk(tree); };
}

function MarkdownViewImpl({ content, onToggleTask, baseDir, onOpenLink, className }: Props) {
  const fm = splitFrontmatter(content);
  return (
    <div className={`md ${className ?? ''}`}>
      {fm.props.length > 0 && (
        <div className="md-props">
          {fm.props.map(([k, v]) => (
            <span key={k}><b>{k}</b>{v}</span>
          ))}
        </div>
      )}
      <Markdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeObsidian]}
        urlTransform={(url) => (url.startsWith('asset://') ? url : defaultUrlTransform(url))}
        components={{
          a: ({ node: _n, href = '', ...props }) => {
            const local = !isExternal(href) && !href.startsWith('#') && /\.(md|markdown|mdx|txt)(#.*)?$/i.test(href);
            if (local && onOpenLink) {
              return (
                <a {...props} href={href} onClick={(e) => { e.preventDefault(); onOpenLink(href); }} />
              );
            }
            if (href.startsWith('#')) return <a {...props} href={href} onClick={(e) => e.preventDefault()} />;
            return <a {...props} href={href} target="_blank" rel="noreferrer" />;
          },
          img: ({ node: _n, src = '', alt, ...props }) => {
            let url = typeof src === 'string' ? src : '';
            if (url && baseDir && !isExternal(url)) {
              const rel = decodeURI(url);
              url = localFileUrl(rel.startsWith('/') ? rel : `${baseDir}/${rel}`);
            }
            return <img {...props} src={url} alt={alt ?? ''} loading="lazy" />;
          },
          input: ({ node: _n, disabled, ...props }) =>
            props.type === 'checkbox' ? (
              <input {...props} disabled={!onToggleTask} onChange={() => {}} />
            ) : (
              <input {...props} disabled={disabled} />
            ),
          li: ({ node, children, ...props }) => (
            <li
              {...props}
              onClick={(e) => {
                const t = e.target as HTMLElement;
                const offset = node?.position?.start.offset;
                if (onToggleTask && t.tagName === 'INPUT' && t.closest('li') === e.currentTarget && offset != null) {
                  e.stopPropagation();
                  onToggleTask(offset + fm.offset); // 떼어낸 속성 블록 길이만큼 보정
                }
              }}
            >
              {children}
            </li>
          ),
        }}
      >
        {fm.body}
      </Markdown>
    </div>
  );
}

// 드래그 중 다른 위젯이 다시 파싱되지 않도록 내용이 바뀔 때만 렌더
export default memo(
  MarkdownViewImpl,
  // 콜백은 id·ref만 쓰도록 작성해서, 내용·경로가 같으면 다시 그리지 않는다
  (a, b) => a.content === b.content && a.baseDir === b.baseDir && !!a.onOpenLink === !!b.onOpenLink,
);
