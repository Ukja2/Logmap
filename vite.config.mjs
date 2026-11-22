import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 배포 빌드에서는 CSP를 더 엄격하게: 인라인 스크립트·개발 서버 연결 허용을 뺀다
// (개발 중에는 React Fast Refresh가 인라인 스크립트와 웹소켓을 써야 해서 index.html의 느슨한 정책을 그대로 사용)
const PROD_CSP =
  "default-src 'self'; img-src 'self' asset: localfile: https: data: blob:; style-src 'self' 'unsafe-inline'; " +
  "script-src 'self'; connect-src 'self' asset: localfile:; object-src 'none'; base-uri 'none'; form-action 'none'";

const strictCsp = {
  name: 'strict-csp',
  apply: 'build',
  transformIndexHtml: (html) =>
    html.replace(/(<meta http-equiv="Content-Security-Policy" content=")[^"]*(")/, `$1${PROD_CSP}$2`),
};

export default defineConfig({
  plugins: [react(), strictCsp],
  base: './',
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
});
