import React, { useEffect, useState } from 'react';
import { Menu, PanelLeftClose, PanelLeftOpen, Keyboard } from 'lucide-react';

/** Shared responsive navigation controls for the Student, Lecturer and Admin workspaces. */
export default function WorkspaceUxControls() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    const layout = document.currentScript?.parentElement?.closest?.('.cs-workspace-layout') as HTMLElement | null;
    // React's currentScript is not reliable in bundled apps; resolve from the rendered controls.
    const resolveLayout = () => document.querySelector('.cs-workspace-layout-controls-anchor')?.closest('.cs-workspace-layout') as HTMLElement | null;
    const root = layout || resolveLayout();
    if (root) {
      root.classList.toggle('is-mobile-open', mobileOpen);
      root.classList.toggle('is-collapsed', collapsed);
    }
    return () => {
      root?.classList.remove('is-mobile-open', 'is-collapsed');
    };
  }, [mobileOpen, collapsed]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const digit = Number(event.key);
      if (!Number.isInteger(digit) || digit < 1 || digit > 9) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(target.tagName))) return;
      const layout = document.querySelector('.cs-workspace-layout-controls-anchor')?.closest('.cs-workspace-layout');
      const buttons = layout?.querySelectorAll<HTMLElement>('.cs-workspace-sidebar nav button');
      const button = buttons?.[digit - 1];
      if (button) {
        event.preventDefault();
        button.click();
        setMobileOpen(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  return <div className="cs-workspace-controls cs-workspace-layout-controls-anchor flex flex-wrap items-center justify-between gap-2">
    <div className="flex items-center gap-2">
      <button type="button" className="cs-workspace-menu-toggle" aria-expanded={mobileOpen} onClick={() => setMobileOpen(value => !value)}>
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
  </div>;
}
