import React, { useEffect, useRef, useState } from 'react';
import { Menu, X, PanelLeftClose, PanelLeftOpen } from 'lucide-react';

/** Accessible off-canvas navigation for the lecturer workspace. */
export default function LecturerDrawerControls() {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const anchorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const layout = anchorRef.current?.nextElementSibling as HTMLElement | null;
    const drawer = layout?.querySelector<HTMLElement>('#lecturer-navigation-drawer');
    if (!layout || !drawer) return;
    layout.classList.toggle('is-drawer-open', open);
    layout.classList.toggle('is-collapsed', collapsed);
    if (open) {
      document.body.classList.add('cs-drawer-scroll-lock');
      drawer.querySelector<HTMLElement>('[data-drawer-close]')?.focus();
    } else {
      document.body.classList.remove('cs-drawer-scroll-lock');
      if (document.activeElement && drawer.contains(document.activeElement)) triggerRef.current?.focus();
    }
    return () => document.body.classList.remove('cs-drawer-scroll-lock');
  }, [open, collapsed]);

  useEffect(() => {
    if (!open) return;
    const layout = anchorRef.current?.nextElementSibling as HTMLElement | null;
    const drawer = layout?.querySelector<HTMLElement>('#lecturer-navigation-drawer');
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setOpen(false); return; }
      if (event.key !== 'Tab' || !drawer) return;
      const items = Array.from(drawer.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'));
      if (!items.length) { event.preventDefault(); drawer.focus(); return; }
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  useEffect(() => {
    const layout = anchorRef.current?.nextElementSibling as HTMLElement | null;
    const closeOnNavigate = (event: Event) => {
      if ((event.target as HTMLElement | null)?.closest('#lecturer-navigation-drawer nav button, #lecturer-navigation-drawer [data-drawer-close]')) setOpen(false);
    };
    layout?.addEventListener('click', closeOnNavigate);
    return () => layout?.removeEventListener('click', closeOnNavigate);
  }, []);

  return <div ref={anchorRef} className="cs-lecturer-controls flex items-center justify-between gap-2 mb-3">
    <div className="flex items-center gap-2">
      <button ref={triggerRef} type="button" className="cs-lecturer-menu-trigger" aria-controls="lecturer-navigation-drawer" aria-expanded={open} onClick={() => setOpen(value => !value)}>
        {open ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />} {open ? 'Close menu' : 'Teaching menu'}
      </button>
      <button type="button" className="cs-lecturer-collapse-trigger" aria-pressed={collapsed} onClick={() => setCollapsed(value => !value)}>
        {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
        {collapsed ? 'Expand navigation' : 'Collapse navigation'}
      </button>
    </div>
    <span className="text-[10px] text-slate-500 hidden sm:block">Choose a workspace section</span>
    <button type="button" aria-label="Close navigation drawer" className={'cs-lecturer-drawer-backdrop ' + (open ? 'is-visible' : '')} tabIndex={-1} onClick={() => setOpen(false)} />
  </div>;
}