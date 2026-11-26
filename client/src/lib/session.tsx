import type { BanNotice, DirectMessage, Me } from '@shared/types';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { BANNED_EVENT } from './api';
import { getAnonId } from './identity';
import { socket } from './socket';

interface SessionValue {
  me: Me | null;
  connected: boolean;
  banned: BanNotice | null;
  /** Unread direct messages (updated live). */
  unreadDms: number;
  setUnreadDms: (n: number | ((prev: number) => number)) => void;
  /** Call after the profile changes so chat shows the new display name. */
  refresh: () => void;
}

const SessionContext = createContext<SessionValue>({
  me: null,
  connected: false,
  banned: null,
  unreadDms: 0,
  setUnreadDms: () => {},
  refresh: () => {},
});

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [connected, setConnected] = useState(false);
  const [banned, setBanned] = useState<BanNotice | null>(null);
  const [unreadDms, setUnreadDms] = useState(0);
  const meRef = useRef<Me | null>(null);
  meRef.current = me;

  const hello = useCallback(() => {
    socket.emit('session:hello', { anonId: getAnonId() }, (user) => setMe(user));
  }, []);

  useEffect(() => {
    const onConnect = () => {
      setConnected(true);
      hello();
    };
    const onDisconnect = () => setConnected(false);
    const onBanned = (notice: BanNotice) => {
      setBanned(notice);
      socket.io.opts.reconnection = false;
    };
    const onBannedEvent = (e: Event) => onBanned((e as CustomEvent<BanNotice>).detail);
    const onDm = (dm: DirectMessage) => {
      // Messages you receive while not looking at that conversation count as unread.
      const viewing = window.location.pathname === `/messages/${dm.from}`;
      if (dm.from !== meRef.current?.publicId && !viewing) setUnreadDms((n) => n + 1);
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('banned', onBanned);
    socket.on('dm:message', onDm);
    window.addEventListener(BANNED_EVENT, onBannedEvent);
    socket.connect();
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('banned', onBanned);
      socket.off('dm:message', onDm);
      window.removeEventListener(BANNED_EVENT, onBannedEvent);
      socket.disconnect();
    };
  }, [hello]);

  return (
    <SessionContext.Provider value={{ me, connected, banned, unreadDms, setUnreadDms, refresh: hello }}>
      {children}
    </SessionContext.Provider>
  );
}

export const useSession = () => useContext(SessionContext);
