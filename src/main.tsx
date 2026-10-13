import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// フォントとアイコンはアプリに同梱する（外部への通信をなくし、オフラインでも表示を保つ）
import '@fontsource/zen-kaku-gothic-new/400.css';
import '@fontsource/zen-kaku-gothic-new/500.css';
import '@fontsource/zen-kaku-gothic-new/700.css';
import '@fontsource/dela-gothic-one/400.css';
import 'material-symbols/rounded.css';
import { App } from './App';
import './styles.css';

// 予約データをブラウザに自動で消されにくくする（対応していないブラウザでは何もしない）
void navigator.storage?.persist?.();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
