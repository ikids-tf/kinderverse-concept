import { useEffect } from 'react';
import { useHistoryStore } from '@/store/historyStore';
import { useBoardStore } from '@/store/boardStore';
import {
  deleteNodesCmd,
  duplicateNodesCmd,
  groupNodesCmd,
  ungroupNodesCmd,
  toggleLockCmd,
} from '@/board/commands';

/* Global keyboard handler (SKILL §6.1), bound to the history module (§6.2).
   - undo/redo are global.
   - board shortcuts only fire on /board and never while typing in a field
     (focus-context separation). Every shortcut also has a mouse/button path. */

export function isEditableTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  if (el.isContentEditable) return true;
  if (el.closest('[data-kv-editable="true"]')) return true;
  return false;
}

const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform);
const mod = (e: KeyboardEvent) => (isMac ? e.metaKey : e.ctrlKey);
const onBoard = () => window.location.pathname.startsWith('/board');

export function useKeyboardShortcuts() {
  const undo = useHistoryStore((s) => s.undo);
  const redo = useHistoryStore((s) => s.redo);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const editable = isEditableTarget(e.target);

      // ---- Undo / Redo (global), yields to native text-edit undo while typing ----
      if (mod(e) && e.key.toLowerCase() === 'z') {
        if (editable) return;
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod(e) && e.key.toLowerCase() === 'y') {
        if (editable) return;
        e.preventDefault();
        redo();
        return;
      }

      // ---- Board shortcuts: only on /board, never while typing ----
      if (editable || !onBoard()) return;
      const b = useBoardStore.getState();
      const sel = b.selection;

      // Delete / Backspace
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (sel.length) {
          e.preventDefault();
          deleteNodesCmd(sel);
        }
        return;
      }
      // Select all
      if (mod(e) && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        b.selectAll();
        return;
      }
      // Duplicate
      if (mod(e) && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        duplicateNodesCmd(sel);
        return;
      }
      // Group / ungroup
      if (mod(e) && e.key.toLowerCase() === 'g') {
        e.preventDefault();
        if (e.shiftKey) ungroupNodesCmd(sel);
        else groupNodesCmd(sel);
        return;
      }
      // Lock / unlock
      if (mod(e) && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        toggleLockCmd(sel);
        return;
      }
      // Zoom in / out / reset
      if (mod(e) && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        b.zoomBy(1.1, window.innerWidth / 2, window.innerHeight / 2);
        return;
      }
      if (mod(e) && e.key === '-') {
        e.preventDefault();
        b.zoomBy(1 / 1.1, window.innerWidth / 2, window.innerHeight / 2);
        return;
      }
      if (mod(e) && e.key === '0') {
        e.preventDefault();
        b.resetView();
        return;
      }
      // Fit
      if (e.shiftKey && e.key === '!') {
        // Shift+1 → '!'
        e.preventDefault();
        b.fit();
        return;
      }
      // Deselect
      if (e.key === 'Escape') {
        b.clearSelection();
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undo, redo]);
}
