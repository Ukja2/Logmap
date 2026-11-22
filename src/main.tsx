import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

// 캔버스 밖에 파일을 떨어뜨렸을 때 Electron이 해당 파일로 이동하지 않도록 막기
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => e.preventDefault());

createRoot(document.getElementById('root')!).render(<App />);
