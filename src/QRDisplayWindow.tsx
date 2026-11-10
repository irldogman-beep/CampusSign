import React, { useEffect, useState } from 'react';
import { QRCodeImage } from './CameraParts';
import { Clock3, Maximize2, MonitorX, QrCode, Wifi } from 'lucide-react';

export const QR_DISPLAY_CHANNEL = 'campussign-qr-display-v1';

type DisplayState = {
  sessionLive: boolean;
  qrPayload: string;
  qrToken: string;
  title: string;
  course: string;
  teacher: string;
  venue: string;
  qrIntervalSeconds: number;
  secondsToRotate: number;
};

/** A clean projection-only window. It receives a signed QR payload from the
 * lecturer tab; it never receives the session secret or lecturer dashboard data. */
export function QRDisplayWindow() {
  const [display, setDisplay] = useState<DisplayState | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!('BroadcastChannel' in window)) return;
    const channel = new BroadcastChannel(QR_DISPLAY_CHANNEL);
    channel.onmessage = (event: MessageEvent) => {
      if (event.data?.type === 'state') {
        setDisplay(event.data.payload as DisplayState);
        setConnected(true);
      }
    };
    channel.postMessage({ type: 'ready' });
    const beforeUnload = () => channel.postMessage({ type: 'closed' });
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      channel.close();
    };
  }, []);

  useEffect(() => {
    document.title = display?.sessionLive
      ? `CampusSign · ${display.course} · Attendance QR`
      : 'CampusSign · Attendance display';
  }, [display]);

  const requestFullscreen = async () => {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch (error) {
      console.warn('Fullscreen is not available in this browser.', error);
    }
  };

  return (
    <main className="min-h-screen bg-[#031b17] text-white flex flex-col overflow-hidden">
      <header className="w-full px-6 sm:px-10 py-5 flex items-center justify-between border-b border-emerald-900/80">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-900 border border-amber-500/70 grid place-items-center text-amber-400 font-black text-xl">C</div>
          <div>
            <div className="font-black tracking-tight text-lg">CampusSign</div>
            <div className="text-[10px] tracking-[0.22em] uppercase text-emerald-300">Classroom attendance</div>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-emerald-200">
          <span className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'}`} />
          {connected ? 'Connected to lecturer display' : 'Connecting to lecturer device'}
          <button onClick={requestFullscreen} className="ml-3 p-2 rounded-xl border border-emerald-800 hover:bg-emerald-900" title="Toggle fullscreen">
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </header>

      {!display ? (
        <section className="flex-1 grid place-items-center p-6 text-center">
          <div className="max-w-md">
            <QrCode className="w-16 h-16 mx-auto text-amber-400 mb-5" />
            <h1 className="text-2xl sm:text-3xl font-black mb-3">Waiting for attendance session</h1>
            <p className="text-emerald-200 text-sm leading-relaxed">Keep this window open on the classroom projector. Start a session from the lecturer portal and its QR code will appear here automatically.</p>
          </div>
        </section>
      ) : !display.sessionLive ? (
        <section className="flex-1 grid place-items-center p-6 text-center">
          <div className="max-w-md">
            <MonitorX className="w-16 h-16 mx-auto text-rose-300 mb-5" />
            <h1 className="text-3xl font-black mb-3">Attendance session ended</h1>
            <p className="text-emerald-200">The lecturer has closed this session. Please wait for the next attendance session.</p>
          </div>
        </section>
      ) : (
        <section className="flex-1 flex flex-col items-center justify-center text-center px-4 py-6 sm:px-10 sm:py-10">
          <p className="text-amber-400 font-extrabold uppercase tracking-[0.22em] text-xs sm:text-sm mb-3">Scan to mark your attendance</p>
          <h1 className="text-2xl sm:text-4xl lg:text-5xl font-black tracking-tight max-w-5xl">{display.title || display.course}</h1>
          <p className="mt-3 text-emerald-200 text-sm sm:text-lg">{display.course} {display.teacher ? `· ${display.teacher}` : ''}</p>
          {display.venue && <p className="mt-1 text-emerald-400 text-xs sm:text-sm">{display.venue}</p>}

          <div className="mt-7 sm:mt-9 p-4 sm:p-6 bg-white rounded-[2rem] shadow-[0_24px_90px_rgba(0,0,0,0.4)] border-[6px] border-amber-400 min-w-[300px] min-h-[300px] grid place-items-center">
            {display.qrPayload
              ? <QRCodeImage value={display.qrPayload} size={Math.min(window.innerWidth < 640 ? 270 : 420, window.innerHeight < 700 ? 300 : 440)} />
              : <p className="text-sm font-semibold text-slate-500">Preparing secure QR code…</p>}
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-900 border border-emerald-700 text-amber-300 text-sm font-bold">
              <Clock3 className="w-4 h-4" />
              {display.qrIntervalSeconds === 0
                ? 'QR stays the same until this session closes'
                : `New QR in ${display.secondsToRotate}s`}
            </div>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-900/70 border border-emerald-800 text-emerald-200 text-sm">
              <Wifi className="w-4 h-4" /> Face verification may be required
            </div>
          </div>
          <p className="mt-6 text-emerald-400 text-xs sm:text-sm">Open CampusSign on your phone and scan this code. Follow the instructions to complete check-in.</p>
        </section>
      )}
      <footer className="text-center text-[10px] text-emerald-700 tracking-widest uppercase py-4">CampusSign · Secure attendance</footer>
    </main>
  );
}
