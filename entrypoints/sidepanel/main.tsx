import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '../popup/App.tsx';
import '../popup/style.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App isSidePanel />
  </React.StrictMode>
);
