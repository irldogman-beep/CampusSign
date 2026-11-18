import React, { useEffect, useRef, useState } from 'react';
import { Menu, PanelLeftClose, PanelLeftOpen, Keyboard } from 'lucide-react';

/** Shared responsive navigation controls for the Student and Admin workspaces. */
export default function WorkspaceUxControls({ drawerId = 'workspace-navigation-drawer', label = 'Workspace navigation' }: { drawerId?: string; label?: string }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const anchorRef = useRef<HTMLDivElement | null>(null);

  const getLayout = () => {
    const candidate = anchorRef.current?.nextElementSibling;
    return candidate instanceof HTMLElement && candidate.classList.contains('cs-workspace-layout') ? candidate : null;
  };

  useEffect(() => {
    const layout = getLayout();
    const drawer = layout?.querySelector<HTMLElement>('.cs-workspace-sidebar');
    if (!layout || !drawer) return;
    drawer.id = drawerId;
    layout.classList.toggle('is-mobile-open', mobileOpen);
    layout.classList.toggle('is-collapsed', collapsed);
    if (mobileOpen) {
      document.body.classList.add('cs-drawer-scroll-lock');
      drawer.setAttribute('role', 'dialog');
      drawer.setAttribute('aria-modal', 'true');
      drawer.setAttribute('aria-label', label);
      window.requestAnimationFrame(() => {
        const first = drawer.querySelector<HTMLElement>('button:not([disabled]), a[href]');
        first?.focus();
      });
    } else {
      document.body.classList.remove('cs-drawer-scroll-lock');
      drawer.removeAttribute('role');
      drawer.removeAttribute('aria-modal');
      drawer.removeAttribute('aria-label');
      if (drawer.contains(document.activeElement)) triggerRef.current?.focus();
    }
    return () => {
      document.body.classList.remove('cs-drawer-scroll-lock');
      drawer.removeAttribute('role');
      drawer.removeAttribute('aria-modal');
      drawer.removeAttribute('aria-label');
    };
  }, [mobileOpen, collapsed, drawerId, label]);

  useEffect(() => {
    if (!mobileOpen) return;
    const layout = getLayout();
    const drawer = layout?.querySelector<HTMLElement>('.cs-workspace-sidebar');
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setMobileOpen(false);
        return;
      }
      if (event.key !== 'Tab' || !drawer) return;
      const items = Array.from(drawer.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'));
      if (!items.length) { event.preventDefault(); drawer.focus(); return; }
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || !drawer.contains(document.activeElement))) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [mobileOpen]);

  useEffect(() => {
    const layout = getLayout();
    const closeOnNavigate = (event: Event) => {
      if ((event.target as HTMLElement | null)?.closest('.cs-workspace-sidebar nav button')) setMobileOpen(false);
    };
    layout?.addEventListener('click', closeOnNavigate);
    return () => layout?.removeEventListener('click', closeOnNavigate);
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const layout = getLayout();
      const drawer = layout?.querySelector('.cs-workspace-sidebar');
      if (drawer && !drawer.contains(event.target as Node) && !anchorRef.current?.contains(event.target as Node)) setMobileOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [mobileOpen]);

  return <div ref={anchorRef} className="cs-workspace-controls cs-workspace-layout-controls-anchor flex flex-wrap items-center justify-between gap-2">
    <div className="flex items-center gap-2">
      <button ref={triggerRef} type="button" className="cs-workspace-menu-toggle" aria-controls={drawerId} aria-expanded={mobileOpen} aria-label={mobileOpen ? 'Close workspace navigation' : 'Open workspace navigation'} onClick={() => setMobileOpen(value => !value)}>
        <Menu className="w-4 h-4" /> {mobileOpen ? 'Close menu' : 'Menu'}
      </button>
      <button type="button" className="cs-workspace-collapse-toggle" aria-pressed={collapsed} onClick={() => setCollapsed(value => !value)}>
        {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
        {collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      </button>
    </div>
    <div className="relative">
      <button type="button" className="cs-workspace-shortcuts-toggle" aria-expanded={showHelp} onClick={() => setShowHelp(value => !value)}>
        <Keyboard className="w-4 h-4" /> Shortcuts
      </button>
      {showHelp && <div role="dialog" aria-label="Keyboard shortcuts" className="cs-workspace-shortcuts-popover">
        <strong>Workspace shortcuts</strong>
        <p>Press <kbd>Alt</kbd> + <kbd>1</kbd> through <kbd>9</kbd> to open a navigation section.</p>
        <p>Shortcuts are disabled while typing in a form field.</p>
      </div>}
    </div>
    <button type="button" className={'cs-workspace-drawer-backdrop' + (mobileOpen ? ' is-visible' : '')} aria-label="Close navigation menu" tabIndex={mobileOpen ? 0 : -1} onClick={() => setMobileOpen(false)} />
  </div>;
}
