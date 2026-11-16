import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { QRDisplayWindow } from './QRDisplayWindow';
import './index.css';

function CampusSignAppShell({ children }: { children: React.ReactNode }) {
  const [online, setOnline] = React.useState(navigator.onLine);
  const [installPrompt, setInstallPrompt] = React.useState<any>(null);

  React.useEffect(() => {
    const updateOnline = () => setOnline(navigator.onLine);
    const captureInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };
    const clearInstallPrompt = () => setInstallPrompt(null);

    window.addEventListener('online', updateOnline);
    window.addEventListener('offline', updateOnline);
    window.addEventListener('beforeinstallprompt', captureInstallPrompt);
    window.addEventListener('appinstalled', clearInstallPrompt);

    if ('serviceWorker' in navigator && import.meta.env.PROD) {
      navigator.serviceWorker.register('/sw.js').catch((error) => {
        console.error('CampusSign service worker registration failed:', error);
      });
    }

    return () => {
      window.removeEventListener('online', updateOnline);
      window.removeEventListener('offline', updateOnline);
      window.removeEventListener('beforeinstallprompt', captureInstallPrompt);
      window.removeEventListener('appinstalled', clearInstallPrompt);
    };
  }, []);

  const installApp = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  };

  return (
    <>
      {!online && (
        <div role="status" aria-live="assertive" className="fixed top-0 inset-x-0 z-[10001] bg-amber-100 text-amber-950 border-b border-amber-300 px-4 py-2 text-center text-xs sm:text-sm font-semibold shadow-md">
          You're offline. Attendance, QR validation and face verification require an internet connection. No check-in will be recorded until you reconnect.
        </div>
      )}
      {children}
      {installPrompt && online && (
        <div className="fixed bottom-4 right-4 z-[10001] max-w-[calc(100vw-2rem)] rounded-2xl border border-emerald-800 bg-emerald-950 p-3 text-white shadow-2xl flex items-center gap-3">
          <div className="min-w-0">
            <p className="text-sm font-bold">Install CampusSign</p>
            <p className="text-[11px] text-emerald-100">Add the app to your device for quicker access.</p>
          </div>
          <button type="button" onClick={installApp} className="shrink-0 rounded-xl bg-amber-400 px-3 py-2 text-xs font-extrabold text-emerald-950">Install</button>
          <button type="button" onClick={() => setInstallPrompt(null)} aria-label="Dismiss install prompt" className="shrink-0 rounded-lg px-2 py-1 text-emerald-100 hover:bg-emerald-900">×</button>
        </div>
      )}
    </>
  );
}

const isQrDisplayWindow = new URLSearchParams(window.location.search).get('display') === 'qr';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <CampusSignAppShell>
      {isQrDisplayWindow ? <QRDisplayWindow /> : <App />}
    </CampusSignAppShell>
  </React.StrictMode>
);
