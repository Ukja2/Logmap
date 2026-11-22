import {
  Award, BookOpen, Box, Briefcase, Calendar, Code2, Cpu, Database, FileText, Flag, Folder, Globe,
  FolderKanban, GraduationCap, Hand, Heart, History, Layers, Lightbulb, type LucideIcon, Monitor, NotebookPen, Rocket,
  Server, Sparkles, Star, StickyNote, Target, TrendingUp, Trophy, Wrench, Zap,
} from 'lucide-react';

export const BOARD_ICONS: Record<string, LucideIcon> = {
  folder: Folder,
  sparkles: Sparkles,
  rocket: Rocket,
  layers: Layers,
  briefcase: Briefcase,
  server: Server,
  monitor: Monitor,
  code: Code2,
  database: Database,
  cpu: Cpu,
  globe: Globe,
  box: Box,
  book: BookOpen,
  notebook: NotebookPen,
  file: FileText,
  graduation: GraduationCap,
  award: Award,
  trophy: Trophy,
  target: Target,
  trending: TrendingUp,
  lightbulb: Lightbulb,
  calendar: Calendar,
  flag: Flag,
  star: Star,
  heart: Heart,
  zap: Zap,
  wrench: Wrench,
  hand: Hand,
  history: History,
  kanban: FolderKanban,
  sticky: StickyNote,
};

/** 예전 이모지 보드를 새 아이콘으로 자연스럽게 보여주기 위한 매핑 */
const EMOJI_TO_ICON: Record<string, [string, string]> = {
  '👋': ['sparkles', 'violet'],
  '🚀': ['rocket', 'blue'],
  '🧰': ['layers', 'green'],
  '💼': ['briefcase', 'amber'],
  '🖥️': ['server', 'slate'],
  '📁': ['folder', 'slate'],
  '📌': ['flag', 'rose'],
  '📈': ['trending', 'green'],
  '🏆': ['trophy', 'amber'],
  '🧪': ['lightbulb', 'teal'],
  '📚': ['book', 'blue'],
  '🛠️': ['wrench', 'slate'],
  '🗂️': ['folder', 'blue'],
  '⭐': ['star', 'amber'],
  '🔥': ['zap', 'rose'],
  '🧭': ['target', 'teal'],
};

export const BOARD_COLORS: Record<string, { bg: string; fg: string }> = {
  slate: { bg: '#eceef2', fg: '#475467' },
  blue: { bg: '#e3ecff', fg: '#3563e9' },
  violet: { bg: '#ece8ff', fg: '#6d4aff' },
  green: { bg: '#dff5e8', fg: '#17985a' },
  teal: { bg: '#dcf3f3', fg: '#0f8b8d' },
  amber: { bg: '#fdf0d5', fg: '#c27a07' },
  orange: { bg: '#ffe9dc', fg: '#e5622a' },
  rose: { bg: '#fde4ea', fg: '#d6335b' },
};

export function resolveBoardIcon(b: { icon?: string; color?: string; emoji?: string }) {
  let key = b.icon;
  let color = b.color;
  if (!key && b.emoji && EMOJI_TO_ICON[b.emoji]) [key, color] = [EMOJI_TO_ICON[b.emoji][0], color ?? EMOJI_TO_ICON[b.emoji][1]];
  const Icon = key ? BOARD_ICONS[key] : undefined;
  return { Icon, emoji: Icon ? undefined : b.emoji, palette: BOARD_COLORS[color ?? 'slate'] ?? BOARD_COLORS.slate };
}

export function BoardIcon({ board, size = 26 }: { board: { icon?: string; color?: string; emoji?: string }; size?: number }) {
  const { Icon, emoji, palette } = resolveBoardIcon(board);
  return (
    <span
      className="board-icon"
      style={{ width: size, height: size, background: palette.bg, color: palette.fg, borderRadius: size * 0.3 }}
    >
      {Icon ? <Icon size={size * 0.58} strokeWidth={2.2} /> : emoji ? <span style={{ fontSize: size * 0.6 }}>{emoji}</span> : <Folder size={size * 0.58} strokeWidth={2.2} />}
    </span>
  );
}
