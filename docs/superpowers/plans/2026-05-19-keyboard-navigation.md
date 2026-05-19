# Keyboard Navigation — All Views Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add consistent ↑↓/Enter/Space/Escape keyboard navigation to every navigable view in Egestion (Explorer, À valider, Règles, Dashboard/ActivityFeed).

**Architecture:** Each view owns its keyboard state locally (a `focusedIndex` or `focusedId`). Explorer is the most complex (two zones: sidebar + filelist) and gets a dedicated hook. Simpler views (Unsorted, Rules, ActivityFeed) use an inline `useEffect`. The global `useKeyboard` hook stays untouched — it only handles ⌘K and ⌘J.

**Tech Stack:** React 18, TypeScript, Zustand, Tauri `invoke`, Tailwind CSS

---

## File Map

| Action | File |
|--------|------|
| Create | `src/hooks/useExplorerKeyboard.ts` |
| Modify | `src/components/Explorer/index.tsx` |
| Modify | `src/components/Explorer/FileList.tsx` |
| Modify | `src/components/Unsorted/index.tsx` |
| Modify | `src/components/Rules/index.tsx` |
| Modify | `src/components/Dashboard/ActivityFeed.tsx` |

---

### Task 1: Explorer — focus zones + sidebar keyboard

**Files:**
- Modify: `src/components/Explorer/index.tsx`

The Explorer has two zones: `sidebar` and `filelist`. A `focusZone` local state drives which zone is active and receives keyboard events. The sidebar border gets a blue accent when `focusZone === 'sidebar'`.

- [ ] **Step 1: Add `focusZone` state and CATEGORIES constant index helper**

In `src/components/Explorer/index.tsx`, add after the existing `useAppStore` destructuring:

```typescript
const [focusZone, setFocusZone] = useState<'sidebar' | 'filelist'>('sidebar');

const CATEGORY_IDS = CATEGORIES.map((c) => c.id);
```

Add `useState` to the React import.

- [ ] **Step 2: Add sidebar keyboard handler**

Inside `Explorer()`, add this `useEffect` after the existing Space→QuickLook handler:

```typescript
useEffect(() => {
  function handleKeyDown(e: KeyboardEvent) {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (focusZone !== 'sidebar') return;

    const idx = CATEGORY_IDS.indexOf(selectedCategory);

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = Math.min(idx + 1, CATEGORY_IDS.length - 1);
      setSelectedCategory(CATEGORY_IDS[next]);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = Math.max(idx - 1, 0);
      setSelectedCategory(CATEGORY_IDS[prev]);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      if (explorerFiles.length > 0) setFocusZone('filelist');
    }
  }
  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, [focusZone, selectedCategory, explorerFiles, setSelectedCategory]);
```

- [ ] **Step 3: Add visual focus indicator to sidebar border**

In the sidebar `<div>` in the return JSX, change the `border-r` class to also include a conditional border color:

```tsx
<div className={`w-44 shrink-0 border-r py-4 flex flex-col gap-1 px-2 transition-colors ${
  focusZone === 'sidebar' ? 'border-blue-600' : 'border-zinc-800'
}`}>
```

Click on the sidebar div itself should refocus the sidebar zone. Add `onClick={() => setFocusZone('sidebar')}` to that same div.

- [ ] **Step 4: Pass `focusZone` and `setFocusZone` to FileList**

In the `<FileList>` usage inside Explorer's return, pass two new props:

```tsx
<FileList
  files={explorerFiles}
  sort={explorerSort}
  onSortChange={setExplorerSort}
  selectedFileId={selectedFileId}
  onSelectFile={setSelectedFile}
  focusZone={focusZone}
  onFocusZoneChange={setFocusZone}
/>
```

- [ ] **Step 5: Type check**

```bash
cd "/Users/mellouki/Documents/claude projets/Projet-Egestion bureau/egestion" && npx tsc --noEmit 2>&1 | head -40
```

Expected: errors only about missing `focusZone`/`onFocusZoneChange` in FileList Props (we fix next task). No other new errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/Explorer/index.tsx
git commit -m "feat(keyboard): Explorer sidebar zone focus + ↑↓ category nav"
```

---

### Task 2: Explorer — filelist keyboard navigation

**Files:**
- Modify: `src/components/Explorer/FileList.tsx`

Arrow navigation inside the file list: ↑↓ move selection, ← goes back to sidebar, Enter opens in Finder, Space triggers QuickLook, Escape clears selection and returns to sidebar.

- [ ] **Step 1: Update Props interface**

In `src/components/Explorer/FileList.tsx`, update the `Props` interface:

```typescript
interface Props {
  files: FileRecord[];
  sort: string;
  onSortChange: (sort: string) => void;
  selectedFileId: string | null;
  onSelectFile: (id: string | null) => void;
  focusZone: 'sidebar' | 'filelist';
  onFocusZoneChange: (zone: 'sidebar' | 'filelist') => void;
}
```

- [ ] **Step 2: Add `listRef` for scroll management**

Add `useRef` to the React import. In `FileList` function body, add:

```typescript
const listRef = useRef<HTMLDivElement>(null);
```

- [ ] **Step 3: Add keyboard handler for filelist zone**

Add this `useEffect` inside `FileList`, after the existing state declarations:

```typescript
useEffect(() => {
  function handleKeyDown(e: KeyboardEvent) {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (focusZone !== 'filelist') return;

    const idx = files.findIndex((f) => f.id === selectedFileId);

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = Math.min(idx + 1, files.length - 1);
      if (next >= 0) {
        onSelectFile(files[next].id);
        scrollToFile(files[next].id);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = idx <= 0 ? 0 : idx - 1;
      onSelectFile(files[prev].id);
      scrollToFile(files[prev].id);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      onFocusZoneChange('sidebar');
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const file = files[idx];
      if (file) invoke('open_in_finder', { path: file.path }).catch(console.error);
    } else if (e.key === ' ') {
      e.preventDefault();
      const file = files[idx];
      if (file) invoke('open_quick_look', { path: file.path }).catch(console.error);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onSelectFile(null);
      onFocusZoneChange('sidebar');
    }
  }
  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, [focusZone, files, selectedFileId, onSelectFile, onFocusZoneChange]);
```

- [ ] **Step 4: Add `scrollToFile` helper**

Add this function inside `FileList` before the keyboard handler:

```typescript
function scrollToFile(id: string) {
  const el = listRef.current?.querySelector(`[data-file-id="${id}"]`);
  el?.scrollIntoView({ block: 'nearest' });
}
```

- [ ] **Step 5: Wire `listRef` and `data-file-id` to the file list DOM**

Update the scrollable container div to attach `listRef`:

```tsx
<div ref={listRef} className="flex-1 overflow-y-auto">
```

Add `data-file-id={f.id}` to each file row button:

```tsx
<button
  key={f.id}
  data-file-id={f.id}
  onClick={() => onSelectFile(f.id)}
  ...
```

- [ ] **Step 6: Add visual active-zone indicator on the file list column**

When `focusZone === 'filelist'`, add a left accent border on the outer container div:

```tsx
<div className={`flex flex-col h-full border-r border-zinc-800 transition-colors ${
  focusZone === 'filelist' ? 'border-l-2 border-l-blue-600' : ''
}`}>
```

Clicking the file list should focus this zone: add `onClick={() => onFocusZoneChange('filelist')}` to the scrollable file list container.

- [ ] **Step 7: Type check + confirm no errors**

```bash
cd "/Users/mellouki/Documents/claude projets/Projet-Egestion bureau/egestion" && npx tsc --noEmit 2>&1 | head -40
```

Expected: 0 errors.

- [ ] **Step 8: Commit**

```bash
git add src/components/Explorer/FileList.tsx
git commit -m "feat(keyboard): Explorer filelist ↑↓/Enter/Space/←/Esc navigation"
```

---

### Task 3: À valider — keyboard navigation

**Files:**
- Modify: `src/components/Unsorted/index.tsx`

Simple single-column list. ↑↓ navigate files. Enter → accept the AI suggestion (or first category if no suggestion). Escape → dismiss focused file. The focused index is local state.

- [ ] **Step 1: Add `focusedIdx` state**

In `src/components/Unsorted/index.tsx`, add to the existing state declarations:

```typescript
const [focusedIdx, setFocusedIdx] = useState<number>(0);
```

Add a `useRef` for the scroll container:

```typescript
const listRef = useRef<HTMLDivElement>(null);
```

Add `useRef` to the React import.

- [ ] **Step 2: Add keyboard handler**

Add this `useEffect` inside `Unsorted()` after the existing `useEffect` calls:

```typescript
useEffect(() => {
  function handleKeyDown(e: KeyboardEvent) {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (files.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIdx((i) => {
        const next = Math.min(i + 1, files.length - 1);
        scrollToIdx(next);
        return next;
      });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIdx((i) => {
        const prev = Math.max(i - 1, 0);
        scrollToIdx(prev);
        return prev;
      });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const file = files[focusedIdx];
      if (file) validate(file, file.category ?? 'other', file.subcategory ?? null);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      const file = files[focusedIdx];
      if (file) dismiss(file.id);
    }
  }
  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, [files, focusedIdx, validate, dismiss]);
```

- [ ] **Step 3: Add `scrollToIdx` helper**

Add before the keyboard handler:

```typescript
function scrollToIdx(idx: number) {
  const el = listRef.current?.querySelector(`[data-unsorted-idx="${idx}"]`);
  el?.scrollIntoView({ block: 'nearest' });
}
```

- [ ] **Step 4: Wire `listRef`, `data-unsorted-idx`, and focused highlight**

Update the scrollable container div:

```tsx
<div ref={listRef} className="flex-1 overflow-auto divide-y divide-zinc-800">
```

Add `data-unsorted-idx={files.indexOf(file)}` to each file row `<div>` and conditionally add a focus ring:

```tsx
<div
  key={file.id}
  data-unsorted-idx={files.indexOf(file)}
  className={`px-6 py-4 transition-colors ${
    files.indexOf(file) === focusedIdx ? 'bg-zinc-800/60 ring-1 ring-inset ring-blue-600/40' : ''
  }`}
  onContextMenu={...}
>
```

Reset `focusedIdx` to 0 when `files` changes (file removed):

```typescript
useEffect(() => {
  setFocusedIdx((i) => Math.min(i, Math.max(0, files.length - 1)));
}, [files.length]);
```

- [ ] **Step 5: Type check**

```bash
cd "/Users/mellouki/Documents/claude projets/Projet-Egestion bureau/egestion" && npx tsc --noEmit 2>&1 | head -40
```

Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/Unsorted/index.tsx
git commit -m "feat(keyboard): À valider ↑↓/Enter/Esc navigation"
```

---

### Task 4: Règles — keyboard navigation

**Files:**
- Modify: `src/components/Rules/index.tsx`

↑↓ navigate rules. Enter → open inline edit form. Space → toggle enabled. Delete/Backspace → delete rule. Escape → cancel inline edit or deselect. Navigation is disabled when `editingId !== null` or `creating` is true (focus is in form inputs).

- [ ] **Step 1: Add `focusedRuleId` state**

In `src/components/Rules/index.tsx`, add to existing state declarations:

```typescript
const [focusedRuleId, setFocusedRuleId] = useState<string | null>(null);
```

- [ ] **Step 2: Add keyboard handler**

Add this `useEffect` inside `RulesView()`:

```typescript
useEffect(() => {
  function handleKeyDown(e: KeyboardEvent) {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
    if (editingId !== null || creating) return;
    if (rules.length === 0) return;

    const idx = focusedRuleId ? rules.findIndex((r) => r.id === focusedRuleId) : -1;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = idx < rules.length - 1 ? idx + 1 : 0;
      setFocusedRuleId(rules[next].id);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = idx > 0 ? idx - 1 : rules.length - 1;
      setFocusedRuleId(rules[prev].id);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const rule = rules[idx];
      if (rule) handleEdit(rule);
    } else if (e.key === ' ') {
      e.preventDefault();
      const rule = rules[idx];
      if (rule) handleToggle(rule.id);
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      const rule = rules[idx];
      if (rule) {
        handleDelete(rule.id);
        setFocusedRuleId(null);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setFocusedRuleId(null);
    }
  }
  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, [rules, focusedRuleId, editingId, creating, handleEdit, handleToggle, handleDelete]);
```

Note: `handleEdit`, `handleToggle`, `handleDelete` are plain functions defined inside the component — they don't change, but listing them in deps is correct for lint.

- [ ] **Step 3: Add focus highlight to rule rows**

In the "Mode affichage normal" `<div>` for each rule, add a focus ring when focused:

```tsx
<div
  key={rule.id}
  onClick={() => setFocusedRuleId(rule.id)}
  className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors cursor-pointer ${
    rule.enabled
      ? 'bg-bx-900 border-bx-800'
      : 'bg-bx-950 border-bx-900 opacity-50'
  } ${focusedRuleId === rule.id ? 'ring-1 ring-blue-500' : ''}`}
>
```

- [ ] **Step 4: Reset focus when editing opens**

At the top of `handleEdit`, after `setEditingId(rule.id)`, also call:

```typescript
setFocusedRuleId(null);
```

And when edit is cancelled (in the cancel button onClick), reset isn't strictly needed but is cleaner.

- [ ] **Step 5: Type check**

```bash
cd "/Users/mellouki/Documents/claude projets/Projet-Egestion bureau/egestion" && npx tsc --noEmit 2>&1 | head -40
```

Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/Rules/index.tsx
git commit -m "feat(keyboard): Règles ↑↓/Enter/Space/Del/Esc navigation"
```

---

### Task 5: Dashboard/ActivityFeed — keyboard navigation

**Files:**
- Modify: `src/components/Dashboard/ActivityFeed.tsx`

The ActivityFeed is the only navigable list in the Dashboard. ↑↓ navigate rows. Enter → open in Finder. U → undo action. Escape → deselect.

The `ActivityFeed` component renders in two contexts (Dashboard with `limit`, and possibly a full view). Keyboard navigation only activates when the component is mounted — this is fine since only one view is shown at a time.

- [ ] **Step 1: Add `focusedIdx` state to `ActivityFeed`**

```typescript
const [focusedIdx, setFocusedIdx] = useState<number | null>(null);
```

Add `useState` to the React import.

- [ ] **Step 2: Add `listRef`**

```typescript
const listRef = useRef<HTMLDivElement>(null);
```

Add `useRef` to the React import.

- [ ] **Step 3: Add keyboard handler to `ActivityFeed`**

```typescript
useEffect(() => {
  function handleKeyDown(e: KeyboardEvent) {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (items.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIdx((i) => {
        const next = i === null ? 0 : Math.min(i + 1, items.length - 1);
        scrollToIdx(next);
        return next;
      });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIdx((i) => {
        const prev = i === null ? 0 : Math.max(i - 1, 0);
        scrollToIdx(prev);
        return prev;
      });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (focusedIdx !== null) {
        invoke('open_in_finder', { path: items[focusedIdx].path_after }).catch(console.error);
      }
    } else if (e.key === 'u' || e.key === 'U') {
      e.preventDefault();
      if (focusedIdx !== null) {
        const item = items[focusedIdx];
        invoke('perform_undo', { actionId: item.action_id })
          .then(() => useAppStore.setState((s) => ({
            activity: s.activity.filter((a) => a.action_id !== item.action_id),
          })))
          .catch(console.error);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setFocusedIdx(null);
    }
  }
  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, [items, focusedIdx]);
```

- [ ] **Step 4: Add `scrollToIdx` helper**

```typescript
function scrollToIdx(idx: number) {
  const el = listRef.current?.querySelector(`[data-activity-idx="${idx}"]`);
  el?.scrollIntoView({ block: 'nearest' });
}
```

- [ ] **Step 5: Wire `listRef`, `data-activity-idx`, and focus highlight**

Update the wrapper div in `ActivityFeed`:

```tsx
<div ref={listRef} className="divide-y divide-bx-800">
  {items.map((item, idx) => (
    <ActivityRow
      key={item.action_id}
      item={item}
      focused={focusedIdx === idx}
      dataIdx={idx}
      onClick={() => setFocusedIdx(idx)}
    />
  ))}
</div>
```

Update `ActivityRow` to accept `focused`, `dataIdx`, and `onClick` props:

```typescript
function ActivityRow({ item, focused = false, dataIdx, onClick }: {
  item: ActivityItem;
  focused?: boolean;
  dataIdx?: number;
  onClick?: () => void;
}) {
```

Apply `data-activity-idx` and focus ring on the `ActivityRow` outer div:

```tsx
<div
  data-activity-idx={dataIdx}
  onClick={onClick}
  className={`flex items-center gap-3 px-4 py-2.5 hover:bg-bx-800/60 group transition-colors relative cursor-pointer ${
    focused ? 'bg-bx-800/60 ring-1 ring-inset ring-blue-600/40' : ''
  }`}
  onContextMenu={...}
>
```

Also make the undo button always visible (not just on group-hover) when `focused`:

```tsx
<button
  onClick={handleUndo}
  className={`transition-opacity flex items-center gap-1 text-xs text-zinc-200 hover:text-zinc-100 px-2 py-1 rounded hover:bg-bx-600 ${
    focused ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
  }`}
>
```

- [ ] **Step 6: Type check**

```bash
cd "/Users/mellouki/Documents/claude projets/Projet-Egestion bureau/egestion" && npx tsc --noEmit 2>&1 | head -40
```

Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/Dashboard/ActivityFeed.tsx
git commit -m "feat(keyboard): ActivityFeed ↑↓/Enter/U/Esc navigation"
```

---

### Task 6: Build and deploy

- [ ] **Step 1: Full TypeScript check**

```bash
cd "/Users/mellouki/Documents/claude projets/Projet-Egestion bureau/egestion" && npx tsc --noEmit 2>&1
```

Expected: 0 errors.

- [ ] **Step 2: Release build**

```bash
cd "/Users/mellouki/Documents/claude projets/Projet-Egestion bureau/egestion" && npm run tauri build 2>&1 | tail -20
```

Expected: `✓ Bundling egestion_…_aarch64.dmg` or similar success message.

- [ ] **Step 3: Deploy to /Applications**

```bash
cp -R "/Users/mellouki/Documents/claude projets/Projet-Egestion bureau/egestion/src-tauri/target/release/bundle/macos/egestion.app" /Applications/
```

- [ ] **Step 4: Smoke test checklist**

Open the app in `/Applications/egestion.app` and verify:

1. **Explorer / Sidebar**: Press ↓ → category changes. Press ↑ → goes back. Press → with files → zone switches to filelist (sidebar border turns blue).
2. **Explorer / Filelist**: Press ↓/↑ → selection moves + metadata panel updates. Press Space → Quick Look opens. Press Enter → Finder reveals file. Press ← → focus returns to sidebar.
3. **À valider**: Press ↓/↑ → focused row gets ring highlight. Press Enter → AI suggestion validated, file removed from list.
4. **Règles**: Press ↓/↑ → focus ring on rule. Press Space → rule toggles on/off. Press Enter → inline edit form opens. Press Escape → deselect.
5. **Dashboard**: Press ↓/↑ → activity row gets ring + undo button visible. Press U → undo fires.

- [ ] **Step 5: Final commit**

```bash
git add -A && git commit -m "feat: keyboard navigation across all views — Explorer, À valider, Règles, Dashboard"
```

---

## Self-Review

**Spec coverage:**
- ↑↓ navigate: ✅ all views
- Enter validate/open: ✅ all views
- Space QuickLook: ✅ Explorer filelist; ✅ À valider not applicable (no preview command for arbitrary files); ✅ Règles toggle (Space used for toggle as agreed)
- Escape cancel/back: ✅ all views
- ← return to sidebar: ✅ Explorer only (no sidebar in other views)

**Placeholder scan:** None found. All steps contain concrete code.

**Type consistency:**
- `focusZone: 'sidebar' | 'filelist'` — used in Explorer/index.tsx and FileList.tsx ✅
- `onFocusZoneChange` prop matches usage ✅
- `focusedIdx: number | null` — Unsorted and ActivityFeed ✅
- `focusedRuleId: string | null` — Rules ✅
- `ActivityRow` new props `focused`, `dataIdx`, `onClick` — defined and consumed ✅
