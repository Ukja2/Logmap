// 처음 실행할 때(데이터 폴더가 비어 있을 때) 만들어지는 기본 보드와 기본 템플릿
const crypto = require('node:crypto');

const id = () => crypto.randomUUID();

function note(x, y, w, h, color, content, extra = {}) {
  return { id: id(), type: 'note', x, y, w, h, z: 1, color, content, ...extra };
}

/** "환영합니다" 보드 하나: 가운데 카드에서 사용법 카드들이 마인드맵처럼 뻗어 나감 */
function seedBoards() {
  const now = new Date().toISOString();
  const hub = note(80, 300, 400, 300, 'yellow', `# 👋 환영합니다

**Logmap**은 내 PC의 마크다운 파일과 메모를 캔버스에 카드로 띄우고, 선으로 이어 정리하는 이력 관리 앱이에요.

오른쪽 카드들을 따라 사용법을 확인해 보세요.
이 보드는 자유롭게 고치거나 지워도 돼요.`, { locked: true });

  const canvas = note(600, 40, 380, 270, 'white', `## 🖱️ 캔버스 다루기
- 두 손가락 스크롤 · **Space+드래그** → 화면 이동
- 빈 곳 드래그 → 여러 카드 한 번에 선택
- ⌘ + 스크롤 · 핀치 → 확대/축소
- 오른쪽 아래 **손 도구(H)** → 카드 위에서도 화면만 이동
- **⇧1** 전체 보기 · **⌘Z** 실행 취소`);

  const cards = note(600, 350, 380, 270, 'blue', `## 📝 카드 만들기
- 빈 곳 **더블클릭** → 새 메모
- 메모 더블클릭 / **Enter** → 편집, **Esc**·**⌘Enter** → 완료
- 메모 툴바의 **.md 파일로 저장** → 진짜 파일로
- 아래 도크의 **템플릿**으로 프로젝트·업무 기록 추가
- **T** → 카드 없는 텍스트 (제목1~4 / 본문, Enter 완료 · ⇧Enter 줄바꿈)
- **⇧+클릭**으로 여러 개 선택 → **⌘G** 그룹으로 묶기
- 카드 툴바의 🔒 **고정** → 실수로 움직이지 않게`);

  const files = note(600, 660, 380, 270, 'green', `## 📂 파일 불러오기
- Finder에서 \`.md\` 파일을 캔버스로 **끌어다 놓기**
- 사이드바 "보드" 옆 폴더 아이콘 → **폴더를 보드로 열기**
- 파일 카드 더블클릭 → **오른쪽 패널**에서 편집
- 고치면 **원본 파일에 바로 저장**돼요`);

  const mindmap = note(1100, 200, 360, 300, 'purple', `## 🔗 마인드맵처럼 잇기
- 카드를 선택하고 **Tab** → 이어지는 새 메모
- 카드 테두리의 **점을 드래그** → 다른 카드와 연결
- 툴바의 **이어서 추가** → 기존 파일 붙이기
- 연결선 클릭 후 **⌫** → 삭제`);

  const todo = note(1100, 560, 360, 230, 'white', `## ✅ 시작해 보기
- [ ] 새 보드 만들기 (사이드바 **+**)
- [ ] 갖고 있는 .md 파일 하나 끌어다 놓기
- [ ] 상단 **문서** 보기로 전환해 보기
- [ ] 이 체크박스를 클릭해 보기`);

  const widgets = [hub, canvas, cards, files, mindmap, todo].map((w, i) => ({ ...w, z: i + 1 }));
  const edge = (from, to) => ({ id: id(), from: from.id, to: to.id });

  return [
    {
      id: id(),
      name: '환영합니다',
      icon: 'sparkles',
      color: 'violet',
      createdAt: now,
      updatedAt: now,
      viewport: { x: 40, y: 0, zoom: 0.75 },
      widgets,
      edges: [edge(hub, canvas), edge(hub, cards), edge(hub, files), edge(cards, mindmap), edge(files, todo)],
    },
  ];
}

/** 하단 도크의 기본 템플릿 (앱의 "템플릿 관리"에서 추가·수정·삭제 가능, {{date}}·{{month}}는 오늘 날짜로 치환) */
function defaultTemplates() {
  const t = (name, icon, color, w, h, body) => ({ id: id(), name, icon, color, w, h, body });
  return [
    t('프로젝트', 'kanban', 'blue', 420, 440, `## 프로젝트명
**기간** YYYY.MM ~ YYYY.MM · **역할**

\`기술1\` \`기술2\`

### 문제
-

### 한 일
-

### 성과
- `),
    t('업무 기록', 'briefcase', 'white', 380, 340, `## 업무 기록 · {{date}}
### 오늘 한 일
- [ ]

### 메모
-

### 성과/배운 점
- `),
  ];
}

module.exports = { seedBoards, defaultTemplates };
