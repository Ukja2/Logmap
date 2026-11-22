// 앱에 함께 묶이는 오픈소스 라이브러리의 라이선스 원문을 dist/THIRD_PARTY_LICENSES.txt로 모은다.
// (MIT·ISC 라이선스는 배포물에 저작권·라이선스 고지를 포함하도록 요구함. Electron·Chromium 고지는 electron-builder가 따로 넣음)
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const ROOTS = ['react', 'react-dom', 'react-markdown', 'remark-gfm', 'lucide-react'];
const seen = new Map();

function visit(name) {
  if (seen.has(name)) return;
  const dir = path.join(ROOT, 'node_modules', name);
  const pkgFile = path.join(dir, 'package.json');
  if (!fs.existsSync(pkgFile)) return;
  const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
  const licFile = fs.readdirSync(dir).find((f) => /^(licen[cs]e|copying)(\.|$)/i.test(f));
  seen.set(name, {
    version: pkg.version,
    license: typeof pkg.license === 'string' ? pkg.license : pkg.license?.type ?? 'UNKNOWN',
    text: licFile ? fs.readFileSync(path.join(dir, licFile), 'utf8').trim() : null,
  });
  for (const dep of Object.keys(pkg.dependencies ?? {})) visit(dep);
}
ROOTS.forEach(visit);

const names = [...seen.keys()].sort();
const out = [
  'Logmap에 포함된 오픈소스 소프트웨어의 라이선스 고지입니다.',
  'Third-party software notices for Logmap.',
  '',
  ...names.map((n) => `- ${n}@${seen.get(n).version} (${seen.get(n).license})`),
  '',
  ...names.map((n) => {
    const { version, license, text } = seen.get(n);
    return `${'='.repeat(72)}\n${n}@${version} — ${license}\n${'='.repeat(72)}\n${text ?? `License: ${license} (see https://www.npmjs.com/package/${n})`}\n`;
  }),
].join('\n');

fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'dist', 'THIRD_PARTY_LICENSES.txt'), out);
const missing = names.filter((n) => !seen.get(n).text);
console.log(`THIRD_PARTY_LICENSES.txt: ${names.length}개 패키지${missing.length ? ` (원문 없음 ${missing.length}개: ${missing.join(', ')})` : ''}`);
