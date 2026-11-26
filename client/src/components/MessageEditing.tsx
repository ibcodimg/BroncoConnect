import { useState, type KeyboardEvent } from 'react';

/** Shared pieces for editable messages (building chat and private messages). */

export const shortDateTime = (iso: string) =>
  new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export function EditedTag({ editedAt }: { editedAt?: string }) {
  if (!editedAt) return null;
  return (
    <span className="edited" title={`Edited ${shortDateTime(editedAt)}`}>
      (edited)
    </span>
  );
}

/** Inline editor. Enter saves, Shift+Enter makes a new line, Esc cancels. Saving unchanged text just closes it. */
export function EditBox({ initial, onSave, onCancel }: { initial: string; onSave: (text: string) => void; onCancel: () => void }) {
  const [text, setText] = useState(initial);
  const save = () => {
    const t = text.trim();
    if (t && t !== initial) onSave(t);
    else onCancel();
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      save();
    } else if (e.key === 'Escape') {
      onCancel();
    }
  };
  return (
    <div className="edit-box">
      <textarea value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKey} maxLength={1000} rows={2} autoFocus aria-label="Edit message" />
      <div className="row">
        <button className="primary" onClick={save} disabled={!text.trim()}>
          Save
        </button>
        <button onClick={onCancel}>Cancel</button>
        <small className="hint">Enter to save · Esc to cancel</small>
      </div>
    </div>
  );
}

export function Versions({ edits }: { edits?: { text: string; editedAt: string }[] }) {
  if (!edits || edits.length === 0) return null;
  return (
    <ol className="versions" aria-label="Earlier versions">
      {edits.map((v, i) => (
        <li key={i}>
          <small>
            {i === 0 ? 'Original' : `Version ${i + 1}`} · {shortDateTime(v.editedAt)}
          </small>
          <p>{v.text}</p>
        </li>
      ))}
    </ol>
  );
}

/** Which messages have their history open. */
export function useOpenHistory() {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return { isOpen: (id: string) => open.has(id), toggle };
}
