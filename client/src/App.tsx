import { useEffect } from 'react';
import { Navigate, NavLink, Route, Routes } from 'react-router-dom';
import { BoardClipboardProvider } from './components/BoardClipboard';
import ProfileNudge from './components/ProfileNudge';
import { UserCardProvider } from './components/UserCard';
import { api } from './lib/api';
import { MuteProvider } from './lib/mutes';
import { SessionProvider, useSession } from './lib/session';
import AdminPage from './pages/AdminPage';
import CampusPage from './pages/CampusPage';
import MessagesPage from './pages/MessagesPage';
import PeoplePage from './pages/PeoplePage';
import ProfilePage from './pages/ProfilePage';
import RoomPage from './pages/RoomPage';

function Header() {
  const { me, unreadDms, setUnreadDms } = useSession();
  const myId = me?.publicId;

  // Initial unread count; live updates come over the socket.
  useEffect(() => {
    if (!myId) return;
    api
      .conversations()
      .then((c) => setUnreadDms(c.reduce((n, x) => n + x.unread, 0)))
      .catch(() => {});
  }, [myId, setUnreadDms]);

  return (
    <header className="app-header">
      <NavLink to="/" className="brand">
        🐴 BroncoConnect
      </NavLink>
      <nav>
        <NavLink to="/" end>
          Campus
        </NavLink>
        <NavLink to="/room/campus">Campus chat</NavLink>
        <NavLink to="/people">People</NavLink>
        <NavLink to="/messages">
          Messages{unreadDms > 0 && <span className="badge">{unreadDms}</span>}
        </NavLink>
        <NavLink to="/profile">{me?.hasDisplayName ? me.displayName : 'Create Profile'}</NavLink>
        {me?.isAdmin && <NavLink to="/admin">Admin</NavLink>}
      </nav>
    </header>
  );
}

function BannedScreen() {
  const { banned } = useSession();
  if (!banned) return null;
  return (
    <div className="banned-screen" role="alert">
      <h1>You've been banned from BroncoConnect</h1>
      {banned.reason && <p>Reason: {banned.reason}</p>}
      <p>{banned.until ? `You can come back after ${new Date(banned.until).toLocaleString()}.` : 'This ban is permanent.'}</p>
    </div>
  );
}

function Shell() {
  const { banned } = useSession();
  if (banned) return <BannedScreen />;
  return (
    <>
      <Header />
      <ProfileNudge />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<CampusPage />} />
          <Route path="/room/:roomId" element={<RoomPage />} />
          <Route path="/people" element={<PeoplePage />} />
          <Route path="/messages" element={<MessagesPage />} />
          <Route path="/messages/:publicId" element={<MessagesPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/matches" element={<Navigate to="/people" replace />} />
          <Route path="*" element={<p className="page">Page not found.</p>} />
        </Routes>
      </main>
    </>
  );
}

export default function App() {
  return (
    <SessionProvider>
      <MuteProvider>
        <UserCardProvider>
          <BoardClipboardProvider>
            <Shell />
          </BoardClipboardProvider>
        </UserCardProvider>
      </MuteProvider>
    </SessionProvider>
  );
}
