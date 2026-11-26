import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useSession } from '../lib/session';

const DISMISS_KEY = 'broncoconnect:nudge-dismissed';

/** Top-right prompt pointing people without a username to "Find people". Comes back next visit if dismissed. */
export default function ProfileNudge() {
  const { me } = useSession();
  const { pathname } = useLocation();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });

  if (!me || me.hasDisplayName || dismissed || pathname === '/matches' || pathname === '/profile') return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
  };

  return (
    <aside className="nudge" role="status">
      <button className="close" onClick={dismiss} aria-label="Dismiss">
        ×
      </button>
      <p>
        <strong>👋 Meet people on campus when you are.</strong>
      </p>
      <p>Pick a username to see who's in the same building at the same time as you.</p>
      <Link className="button primary" to="/matches" onClick={dismiss}>
        Find people →
      </Link>
    </aside>
  );
}
