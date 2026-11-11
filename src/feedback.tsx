import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

type ToastKind = 'success' | 'error' | 'info';
type ToastItem = { id: number; message: string; kind: ToastKind };
type ConfirmItem = { message: string; resolve: (value: boolean) => void };

export function showToast(message: string, kind: ToastKind = 'info') {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('campussign:toast', { detail: { message, kind } }));
}

export function confirmAction(message: string): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  return new Promise(resolve => window.dispatchEvent(new CustomEvent('campussign:confirm', { detail: { message, resolve } })));
}

export function FeedbackLayer() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirm, setConfirm] = useState<ConfirmItem | null>(null);

  useEffect(() => {
    let nextId = 0;
    const onToast = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      const item: ToastItem = { id: ++nextId, message: String(detail.message || 'Something happened.'), kind: detail.kind || 'info' };
      setToasts(current => [...current.slice(-3), item]);
      window.setTimeout(() => setToasts(current => current.filter(t => t.id !== item.id)), 4500);
    };
    const onConfirm = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      if (typeof detail.resolve === 'function') setConfirm({ message: String(detail.message || 'Are you sure?'), resolve: detail.resolve });
    };
    window.addEventListener('campussign:toast', onToast);
    window.addEventListener('campussign:confirm', onConfirm);
    return () => {
      window.removeEventListener('campussign:toast', onToast);
      window.removeEventListener('campussign:confirm', onConfirm);
    };
  }, []);

  if (typeof document === 'undefined') return null;
  return createPortal(<>
    <div className="fixed top-4 right-4 z-[10000] w-[min(24rem,calc(100vw-2rem))] space-y-2 pointer-events-none" aria-live="polite" aria-atomic="false">
      {toasts.map(item => <div key={item.id} className={`pointer-events-auto flex items-start gap-3 rounded-2xl border p-3 shadow-2xl backdrop-blur-xl ${item.kind === 'success' ? 'border-emerald-300 bg-emerald-950 text-emerald-50' : item.kind === 'error' ? 'border-rose-300 bg-rose-950 text-rose-50' : 'border-slate-300 bg-slate-900 text-white'}`}>
        {item.kind === 'success' ? <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-300" /> : item.kind === 'error' ? <AlertCircle className="w-5 h-5 shrink-0 text-rose-300" /> : <Info className="w-5 h-5 shrink-0 text-sky-300" />}
        <p className="text-xs leading-relaxed flex-1">{item.message}</p>
        <button type="button" aria-label="Dismiss notification" className="text-white/60 hover:text-white" onClick={() => setToasts(current => current.filter(t => t.id !== item.id))}><X className="w-4 h-4" /></button>
      </div>)}
    </div>
    {confirm && <div className="fixed inset-0 z-[10001] bg-slate-950/65 backdrop-blur-sm grid place-items-center p-4" role="presentation">
      <section role="alertdialog" aria-modal="true" aria-labelledby="campussign-confirm-title" className="w-full max-w-md rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 shadow-2xl">
        <div className="flex items-start gap-3"><span className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 grid place-items-center shrink-0"><AlertCircle className="w-5 h-5" /></span><div className="min-w-0"><h2 id="campussign-confirm-title" className="font-extrabold text-slate-900 dark:text-white">Please confirm</h2><p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300 whitespace-pre-wrap">{confirm.message}</p></div></div>
        <div className="mt-6 flex justify-end gap-2"><button type="button" onClick={() => { confirm.resolve(false); setConfirm(null); }} className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold">Cancel</button><button type="button" onClick={() => { confirm.resolve(true); setConfirm(null); }} className="px-4 py-2.5 rounded-xl bg-emerald-900 text-amber-300 text-xs font-bold">Continue</button></div>
      </section>
    </div>}
  </>, document.body);
}
