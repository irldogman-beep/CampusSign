# Lecturer Navigation Implementation Guide

## Goal
Keep the Lecturer workspace navigation on the left on desktop and provide a hamburger-triggered slide-over drawer from the left on mobile. Preserve the CampusSign emerald-and-amber visual identity.

## Files changed

### 1. `src/App.tsx`
- Kept the existing shared `WorkspaceUxControls` component.
- Added the `cs-lecturer-workspace-layout` class to the Lecturer grid wrapper.
- The existing navigation sections and tab state remain unchanged:
  - Session & QR
  - Attendance
  - Student roster
  - CA & Results
  - Requests

### 2. `src/index.css`
- Added Lecturer-specific responsive layout rules.
- At desktop widths (1024px and above), the workspace is a two-column grid: 230px left navigation and flexible content. The sidebar remains sticky and visible.
- Below 1024px, the sidebar is positioned off-canvas to the left. The existing shared hamburger control opens it; the shared backdrop, Escape handling, focus handling, scroll lock, and close-on-navigation behaviour remain in use.
- Active Lecturer navigation uses emerald green with amber text and an amber left accent.
- Reduced-motion preferences are respected.

### 3. `src/WorkspaceUxControls.tsx`
No change required. It already provides the hamburger button, mobile drawer state, backdrop, Escape-to-close, focus management, body scroll lock, and close-on-navigation behaviour. The button is hidden on desktop and shown below the large-screen breakpoint by the existing stylesheet.

## Verification checklist
1. Run `npm ci`.
2. Run the repository's TypeScript check and production build (the CI workflow runs these).
3. At 1024px or wider, confirm the sidebar stays visible on the left and content sits to its right.
4. Below 1024px, confirm the hamburger appears and the drawer slides in from the left.
5. Confirm backdrop click, Escape, and selecting a navigation item close the drawer.
6. Confirm active navigation is emerald with amber text.
7. Confirm the Student and Admin navigation still behave as before.

## Scope protection
This change is limited to Lecturer workspace layout styling and one layout class in `App.tsx`. It does not modify face verification, camera capture, liveness checks, QR generation/parsing, attendance validation, or attendance check-in handlers.
