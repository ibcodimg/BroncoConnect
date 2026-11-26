import type { Stroke } from '@shared/types';
import { createContext, useContext, useState, type ReactNode } from 'react';

/** Shared clipboard so drawings can be copied between the personal and collaborative boards. */
interface Clipboard {
  strokes: Stroke[];
  copy: (strokes: Stroke[]) => void;
}

const Ctx = createContext<Clipboard>({ strokes: [], copy: () => {} });

export function BoardClipboardProvider({ children }: { children: ReactNode }) {
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  return <Ctx.Provider value={{ strokes, copy: (s) => setStrokes(structuredClone(s)) }}>{children}</Ctx.Provider>;
}

export const useBoardClipboard = () => useContext(Ctx);
