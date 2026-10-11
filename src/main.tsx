import React from 'react';
import ReactDOM from 'react-dom/client';
import 'pretendard/dist/web/variable/pretendardvariable.css';
import './styles.css';
import App from './app/App';
import { Notifications } from './components/UI';
// Samsung Internet may force darken already dark card surfaces.
document.documentElement.classList.toggle(
  'samsung-internet',
  /SamsungBrowser\//i.test(navigator.userAgent),
);
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Notifications>
      <App />
    </Notifications>
  </React.StrictMode>,
);

import './design.css';
import './ui-tokens.css';
import './features/Editor.css';
import './components/EditingCard.css';
