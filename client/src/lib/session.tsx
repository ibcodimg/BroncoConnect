import type { PublicUser } from '@shared/types';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { getAnonId } from './identity';
import { socket } from './socket';

interface SessionValue {
  me: PublicUser | null;
  connected: boolean;
  /** Call after the profile changes so chat shows the new display name. */
  refresh: () => void;
}

const SessionContext = createContext<SessionValue>({ me: null, connected: false, refresh: () => {} });

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<PublicUser | null>(null);
  const [connected, setConnected] = useState(false);

  const hello = useCallback(() => {
    socket.emit('session:hello', { anonId: getAnonId() }, (user) => setMe(user));
  }, []);

  useEffect(() => {
    const onConnect = () => {
      setConnected(true);
      hello();
    };
    const onDisconnect = () => setConnected(false);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.connect();
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.disconnect();
    };
  }, [hello]);

  return <SessionContext.Provider value={{ me, connected, refresh: hello }}>{children}</SessionContext.Provider>;
}

export const useSession = () => useContext(SessionContext);
