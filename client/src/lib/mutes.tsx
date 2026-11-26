import type { MuteRule } from '@shared/types';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

const KEY = 'broncoconnect:mutes';

interface MuteApi {
  rules: MuteRule[];
  /** Is this person's drawing / text hidden in this room (by a room rule or an "everywhere" rule)? */
  isMuted: (publicId: string, kind: MuteRule['kind'], roomId: string) => boolean;
  has: (publicId: string, kind: MuteRule['kind'], scope: string) => boolean;
  toggle: (rule: MuteRule) => void;
  remove: (rule: MuteRule) => void;
}

const Ctx = createContext<MuteApi | null>(null);

const same = (a: MuteRule, b: Pick<MuteRule, 'publicId' | 'kind' | 'scope'>) =>
  a.publicId === b.publicId && a.kind === b.kind && a.scope === b.scope;

/** Mutes live in this browser only — muting someone never tells them or changes what others see. */
export function MuteProvider({ children }: { children: ReactNode }) {
  const [rules, setRules] = useState<MuteRule[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(KEY) ?? '[]');
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(rules));
    } catch {
      /* ignore */
    }
  }, [rules]);

  const has = useCallback(
    (publicId: string, kind: MuteRule['kind'], scope: string) => rules.some((r) => same(r, { publicId, kind, scope })),
    [rules],
  );
  const isMuted = useCallback(
    (publicId: string, kind: MuteRule['kind'], roomId: string) => has(publicId, kind, 'all') || has(publicId, kind, roomId),
    [has],
  );
  const toggle = useCallback(
    (rule: MuteRule) => setRules((prev) => (prev.some((r) => same(r, rule)) ? prev.filter((r) => !same(r, rule)) : [...prev, rule])),
    [],
  );
  const remove = useCallback((rule: MuteRule) => setRules((prev) => prev.filter((r) => !same(r, rule))), []);

  const value = useMemo(() => ({ rules, isMuted, has, toggle, remove }), [rules, isMuted, has, toggle, remove]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useMutes(): MuteApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useMutes must be used inside <MuteProvider>');
  return v;
}
