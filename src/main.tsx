import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { QRDisplayWindow } from './QRDisplayWindow';
import './index.css';

const isQrDisplayWindow = new URLSearchParams(window.location.search).get('display') === 'qr';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isQrDisplayWindow ? <QRDisplayWindow /> : <App />}
  </React.StrictMode>
);
