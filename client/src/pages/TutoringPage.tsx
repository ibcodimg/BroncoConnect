import { findRoom } from '@shared/buildings';
import { DAY_LABELS } from '@shared/schedule';
import type { TutoringMatch, TutoringResults, UserProfile } from '@shared/types';
import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { UserName } from '../components/UserCard';
import { api } from '../lib/api';

function MatchCard({ m, mode }: { m: TutoringMatch; mode: 'trade' | 'canHelpYou' | 'youCanHelp' }) {
  return (
    <li className="tutor-card">
      <header>
        {m.online && <span className="online-dot" title="Online now" />}
        <UserName publicId={m.publicId} name={m.displayName} />
        {m.majors.length > 0 && <span className="meta"> · {m.majors.join(', ')}</span>}
        <Link className="button" to={`/messages/${m.publicId}`}>
          💬 Message
        </Link>
      </header>
      {mode !== 'youCanHelp' && m.theyCanTeach.length > 0 && (
        <p>
          <strong>Can help you with:</strong> {m.theyCanTeach.map((t) => <span key={t} className="tag small">{t}</span>)}
        </p>
      )}
      {mode !== 'canHelpYou' && m.youCanTeach.length > 0 && (
        <p>
          <strong>You can help them with:</strong> {m.youCanTeach.map((t) => <span key={t} className="tag small">{t}</span>)}
        </p>
      )}
      {m.sameProfessor.length > 0 && <p className="highlight">🎓 Same professor: {m.sameProfessor.join(', ')}</p>}
      {m.overlaps.length > 0 && (
        <p className="meta">
          📍 On campus together:{' '}
          {m.overlaps
            .slice(0, 3)
            .map((o) => `${DAY_LABELS[o.day]} ${o.start}–${o.end} @ ${findRoom(o.buildingId)?.name ?? o.buildingId}`)
            .join(' · ')}
        </p>
      )}
    </li>
  );
}

function Section({
  title,
  blurb,
  matches,
  mode,
  empty,
}: {
  title: string;
  blurb: string;
  matches: TutoringMatch[];
  mode: 'trade' | 'canHelpYou' | 'youCanHelp';
  empty: ReactNode;
}) {
  return (
    <section className="tutor-section">
      <h2>
        {title} <span className="count">{matches.length}</span>
      </h2>
      <p className="hint">{blurb}</p>
      {matches.length === 0 ? <p className="empty">{empty}</p> : <ul className="tutor-list">{matches.map((m) => <MatchCard key={m.publicId} m={m} mode={mode} />)}</ul>}
    </section>
  );
}

export default function TutoringPage() {
  const [results, setResults] = useState<TutoringResults | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    Promise.all([api.tutoring(), api.myProfile()])
      .then(([r, p]) => {
        setResults(r);
        setProfile(p);
      })
      .catch(() => setError(true));
  }, []);

  if (error) return <p className="page error">Couldn't load tutoring matches.</p>;
  if (!results || !profile) return <p className="page">Loading…</p>;

  const teaches = profile.strongSubjects.length + profile.coursesTaken.length > 0;
  const needs = profile.needHelpSubjects.length + profile.coursesNeedHelp.length > 0;
  const trades = profile.lookingFor.includes('tutor4tutor');
  const volunteers = profile.lookingFor.includes('tutor-others');

  const setupHints = [
    !needs && 'add subjects or courses you want help with',
    !teaches && 'add subjects you’re good at or courses you’ve taken',
    !trades && 'turn on “Tutor4Tutor (trade help)”',
    !volunteers && 'turn on “Willing to tutor others” to help people one-sided',
  ].filter(Boolean) as string[];

  return (
    <div className="page tutoring">
      <h1>Tutor4Tutor</h1>
      <p className="hint">
        Trade help with people who know what you need, or tutor one-sided. Same-professor matches and people on campus at the
        same time as you are listed first.
      </p>
      {setupHints.length > 0 && (
        <p className="quickstart">
          To get more matches, <Link to="/profile">edit your profile</Link>: {setupHints.join('; ')}.
        </p>
      )}

      <Section
        title="🔁 Tutor4Tutor trades"
        blurb="You each know something the other needs. Both of you opted into trading."
        matches={results.trades}
        mode="trade"
        empty={trades ? 'No trades yet. As more people fill in their subjects, matches will appear here.' : 'Turn on “Tutor4Tutor (trade help)” in your profile to see trades.'}
      />
      <Section
        title="🙋 Can help you"
        blurb="Volunteers who are willing to tutor one-sided and know something you want help with."
        matches={results.canHelpYou}
        mode="canHelpYou"
        empty={needs ? 'No volunteers for your subjects yet.' : 'Add subjects or courses you want help with to see volunteers.'}
      />
      <Section
        title="🤝 You can help"
        blurb="People who want help with something you know. Shown because you're willing to tutor one-sided."
        matches={results.youCanHelp}
        mode="youCanHelp"
        empty={volunteers ? 'Nobody needs your subjects right now.' : 'Turn on “Willing to tutor others” to see people you could help.'}
      />
    </div>
  );
}
