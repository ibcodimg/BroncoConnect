import { NavLink, Route, Routes } from 'react-router-dom';
import { BoardClipboardProvider } from './components/BoardClipboard';
import ProfileNudge from './components/ProfileNudge';
import { SessionProvider, useSession } from './lib/session';
import CampusPage from './pages/CampusPage';
import MatchesPage from './pages/MatchesPage';
import ProfilePage from './pages/ProfilePage';
import RoomPage from './pages/RoomPage';

function Header() {
  const { me } = useSession();
  return (
    <header className="app-header">
      <NavLink to="/" className="brand">
        🐴 BroncoConnect
      </NavLink>
      <nav>
        <NavLink to="/">Campus</NavLink>
        <NavLink to="/room/campus">Campus chat</NavLink>
        <NavLink to="/matches">Find people</NavLink>
        <NavLink to="/profile">{me ? me.displayName : 'Profile'}</NavLink>
      </nav>
    </header>
  );
}

export default function App() {
  return (
    <SessionProvider>
      <BoardClipboardProvider>
        <Header />
        <ProfileNudge />
        <main className="app-main">
          <Routes>
            <Route path="/" element={<CampusPage />} />
            <Route path="/room/:roomId" element={<RoomPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/matches" element={<MatchesPage />} />
            <Route path="*" element={<p className="page">Page not found.</p>} />
          </Routes>
        </main>
      </BoardClipboardProvider>
    </SessionProvider>
  );
}
