import { tagKey } from '@shared/tags';
import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';

interface Props {
  label: string;
  value: string[];
  onChange: (tags: string[]) => void;
  /** Built-in options (e.g. CPP majors), shown first when they match. */
  options: readonly string[];
  /** key (lowercase) → how many OTHER people use the tag. Popular custom tags are suggested too. */
  counts: Map<string, number>;
  /** Labels of popular tags from other people (custom ones included). */
  popular?: string[];
  normalize: (s: string) => string;
  max?: number;
  placeholder?: string;
  /** Optional subtitle for an option (e.g. a course title); also searchable. */
  describe?: (label: string) => string | undefined;
}

const others = (n: number | undefined) => (n ? `${n} other${n === 1 ? '' : 's'}` : 'no one else yet');

/**
 * Pick tags from a list, or type your own and press Enter. Each tag shows how many other people use it.
 */
export default function TagInput({ label, value, onChange, options, counts, popular = [], normalize, max = 20, placeholder, describe }: Props) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const chosen = new Set(value.map(tagKey));
  const full = value.length >= max;

  const suggestions = useMemo(() => {
    const q = tagKey(text);
    const pool = new Map<string, string>();
    for (const o of [...options, ...popular]) if (!pool.has(tagKey(o))) pool.set(tagKey(o), o);
    const list = [...pool.entries()]
      .filter(
        ([k, label]) =>
          !chosen.has(k) &&
          (!q ||
            k.includes(q) ||
            k.replace(/ /g, '').includes(q.replace(/ /g, '')) || // "cs3310" finds "CS 3310"
            (describe && tagKey(describe(label) ?? '').includes(q))),
      )
      .sort(([ka], [kb]) => {
        // Prefix matches first, then more popular, then alphabetical.
        const pa = q && ka.startsWith(q) ? 0 : 1;
        const pb = q && kb.startsWith(q) ? 0 : 1;
        return pa - pb || (counts.get(kb) ?? 0) - (counts.get(ka) ?? 0) || ka.localeCompare(kb);
      })
      .slice(0, 8)
      .map(([, label]) => label);
    return list;
  }, [text, options, popular, counts, value, describe]);

  const typed = normalize(text);
  const typedIsNew = !!tagKey(typed) && !chosen.has(tagKey(typed)) && !suggestions.some((s) => tagKey(s) === tagKey(typed));
  const items = [...suggestions, ...(typedIsNew ? [`__custom__${typed}`] : [])];

  const add = (raw: string) => {
    const t = normalize(raw);
    if (!tagKey(t) || chosen.has(tagKey(t)) || full) return;
    onChange([...value, t]);
    setText('');
    setActive(0);
    setOpen(false); // close so the list doesn't cover the rest of the form; typing reopens it
    inputRef.current?.focus();
  };
  const remove = (t: string) => onChange(value.filter((v) => v !== t));

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter' || e.key === ',') {
      if (!text.trim() && e.key === 'Enter') return;
      e.preventDefault();
      const pick = open && items[active] ? items[active] : `__custom__${typed}`;
      add(pick.startsWith('__custom__') ? pick.slice(10) : pick);
    } else if (e.key === 'Backspace' && !text && value.length) {
      remove(value[value.length - 1]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className="tag-input">
      <span className="tag-label">{label}</span>
      <div className="tag-box" onClick={() => inputRef.current?.focus()}>
        {value.map((t) => (
          <span key={t} className="tag" title={[describe?.(t), others(counts.get(tagKey(t)))].filter(Boolean).join(' · ')}>
            {t} <small>· {counts.get(tagKey(t)) ?? 0}</small>
            <button type="button" aria-label={`Remove ${t}`} onClick={() => remove(t)}>
              ×
            </button>
          </span>
        ))}
        {!full && (
          <input
            ref={inputRef}
            value={text}
            placeholder={value.length ? '' : placeholder}
            onChange={(e) => {
              setText(e.target.value);
              setOpen(true);
              setActive(0);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            onKeyDown={onKeyDown}
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-label={label}
          />
        )}
      </div>
      {open && !full && items.length > 0 && (
        <ul className="tag-suggestions" id={listId} role="listbox">
          {items.map((item, i) => {
            const custom = item.startsWith('__custom__');
            const labelText = custom ? item.slice(10) : item;
            return (
              <li
                key={item}
                role="option"
                aria-selected={i === active}
                className={i === active ? 'active' : ''}
                onMouseDown={(e) => {
                  e.preventDefault();
                  add(labelText);
                }}
                onMouseEnter={() => setActive(i)}
              >
                <span>
                  {custom ? <>Add “{labelText}”</> : labelText}
                  {!custom && describe?.(labelText) && <em className="desc"> {describe(labelText)}</em>}
                </span>
                <small>{custom ? 'custom tag' : others(counts.get(tagKey(labelText)))}</small>
              </li>
            );
          })}
        </ul>
      )}
      {full && <small className="hint">Up to {max}.</small>}
    </div>
  );
}
