import { findRoom } from '@shared/buildings';
import { DAY_LABELS } from '@shared/schedule';
import type { Match } from '@shared/types';
import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, type MyProfile } from '../lib/api';
import { useSession } from '../lib/session';

/** Lets someone pick a username right here, without going through the full profile form. */
function QuickStart({ profile, onSaved }: { profile: MyProfile; onSaved: (p: MyProfile) => void }) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(false);
    try {
      const { publicId: _publicId, ...rest } = profile;
      onSaved(await api.saveProfile({ ...rest, displayName: name.trim() }));
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="quickstart" onSubmit={save}>
      <h2>Step 1: pick a username</h2>
      <p className="hint">This is how you'll appear in chatrooms and to people you match with. It doesn't need to be your real name.</p>
      <div className="row">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={32}
          placeholder="e.g. bronco_bill"
          aria-label="Username"
          autoFocus
        />
        <button className="primary" type="submit" disabled={saving || !name.trim()}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
      {error && <p className="error">Couldn't save. Is the server running?</p>}
    </form>
  );
}

export default function MatchesPage() {
  const { refresh } = useSession();
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    Promise.all([api.myProfile(), api.matches()])
      .then(([p, m]) => {
        setProfile(p);
        setMatches(m);
      })
      .catch(() => setError(true));
  }, []);

  const hasName = !!profile?.displayName?.trim();
  const hasSchedule = (profile?.schedule.length ?? 0) > 0;

  return (
    <div className="page">
      <h1>People on campus when you are</h1>
      <p className="hint">Same building, same day, same time of day, based on the schedule in your profile.</p>
      {error && <p className="error">Couldn't load matches.</p>}

      {profile && !hasName && (
        <QuickStart
          profile={profile}
          onSaved={(p) => {
            setProfile(p);
            refresh(); // update the name shown in the header + hide the nudge
          }}
        />
      )}

      {profile && hasName && !hasSchedule && (
        <div className="quickstart">
          <h2>Step 2: add when you're on campus</h2>
          <p>
            Hi {profile.displayName}! <Link to="/profile">Add your weekly schedule</Link> (days, times, buildings) and
            people who overlap with you will show up here.
          </p>
        </div>
      )}

      {hasSchedule && matches?.length === 0 && (
        <p>No overlaps yet. As more people add their schedules, they'll show up here.</p>
      )}

      <ul className="matches">
        {matches?.map((m) => (
          <li key={m.publicId}>
            <h3>{m.displayName}</h3>
            <p className="meta">
              {[m.major, m.status].filter(Boolean).join(' · ')}
              {m.lookingFor.length > 0 && ` · looking for ${m.lookingFor.join(', ')}`}
            </p>
            <ul className="overlaps">
              {m.overlaps.map((o, i) => (
                <li key={i}>
                  {DAY_LABELS[o.day]} {o.start}–{o.end} ·{' '}
                  <Link to={`/room/${o.buildingId}`}>{findRoom(o.buildingId)?.name ?? o.buildingId}</Link>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}
