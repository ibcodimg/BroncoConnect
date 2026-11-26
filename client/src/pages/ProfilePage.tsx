import { BUILDINGS } from '@shared/buildings';
import { DAY_LABELS, isValidBlock } from '@shared/schedule';
import { DAYS, LOOKING_FOR, type LookingFor, type ScheduleBlock, type UserProfile } from '@shared/types';
import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../lib/api';
import { useMutes } from '../lib/mutes';
import { useSession } from '../lib/session';

const SCOPE_LABEL = (scope: string) => {
  if (scope === 'all') return 'everywhere';
  const b = BUILDINGS.find((x) => x.id === scope);
  return b ? (b.number ? `in Building ${b.number}` : `in ${b.name}`) : scope === 'campus' ? 'in campus chat' : scope;
};

const EMPTY: UserProfile = { schedule: [], lookingFor: [], strongSubjects: [], needHelpSubjects: [] };

const LOOKING_LABELS: Record<LookingFor, string> = {
  friends: 'Making friends',
  tutoring: 'Tutoring',
  'study-group': 'Study group',
  tutor4tutor: 'Tutor4Tutor (trade help)',
};

const splitList = (s: string) =>
  s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

export default function ProfilePage() {
  const { refresh, me } = useSession();
  const mutes = useMutes();
  const [profile, setProfile] = useState<UserProfile>(EMPTY);
  const [status, setStatus] = useState<'loading' | 'idle' | 'saving' | 'saved' | 'error'>('loading');
  const [strongText, setStrongText] = useState('');
  const [needText, setNeedText] = useState('');

  const load = (p: UserProfile) => {
    setProfile({ ...EMPTY, ...p });
    setStrongText((p.strongSubjects ?? []).join(', '));
    setNeedText((p.needHelpSubjects ?? []).join(', '));
  };

  useEffect(() => {
    api
      .myProfile()
      .then(({ publicId: _publicId, ...p }) => {
        load(p);
        setStatus('idle');
      })
      .catch(() => setStatus('error'));
  }, []);

  const set = <K extends keyof UserProfile>(key: K, value: UserProfile[K]) => setProfile((p) => ({ ...p, [key]: value }));

  const setBlock = (i: number, patch: Partial<ScheduleBlock>) =>
    set(
      'schedule',
      profile.schedule.map((b, j) => (j === i ? { ...b, ...patch } : b)),
    );

  const addBlock = () =>
    set('schedule', [...profile.schedule, { day: 'mon', start: '10:00', end: '11:15', buildingId: 'building-8' }]);

  const toggleLooking = (v: LookingFor) =>
    set('lookingFor', profile.lookingFor.includes(v) ? profile.lookingFor.filter((x) => x !== v) : [...profile.lookingFor, v]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setStatus('saving');
    try {
      const { publicId: _publicId, ...saved } = await api.saveProfile({
        ...profile,
        strongSubjects: splitList(strongText),
        needHelpSubjects: splitList(needText),
      });
      load(saved);
      setStatus('saved');
      refresh();
    } catch {
      setStatus('error');
    }
  };

  if (status === 'loading') return <p className="page">Loading…</p>;

  return (
    <form className="page profile" onSubmit={save}>
      <h1>{me?.hasDisplayName ? 'My profile' : 'Create your profile'}</h1>
      <p className="hint">
        Everything here is optional and you don’t need an account. It’s saved to this browser so the site remembers you
        next time. Don’t enter your real full name or Bronco ID.
      </p>

      <label>
        Display name
        <input
          value={profile.displayName ?? ''}
          maxLength={32}
          placeholder="Pick a username so people can find you"
          onChange={(e) => set('displayName', e.target.value)}
        />
      </label>
      <label>
        Major
        <input value={profile.major ?? ''} maxLength={60} onChange={(e) => set('major', e.target.value)} />
      </label>
      <fieldset>
        <legend>Commuter or resident?</legend>
        {(['commuter', 'resident'] as const).map((s) => (
          <label key={s} className="inline">
            <input type="radio" name="status" checked={profile.status === s} onChange={() => set('status', s)} /> {s}
          </label>
        ))}
        <button type="button" className="link" onClick={() => set('status', undefined)}>
          prefer not to say
        </button>
      </fieldset>

      <fieldset>
        <legend>Looking for</legend>
        {LOOKING_FOR.map((v) => (
          <label key={v} className="inline">
            <input type="checkbox" checked={profile.lookingFor.includes(v)} onChange={() => toggleLooking(v)} />{' '}
            {LOOKING_LABELS[v]}
          </label>
        ))}
      </fieldset>

      <label>
        Subjects I’m good at (comma-separated)
        <input value={strongText} onChange={(e) => setStrongText(e.target.value)} placeholder="Calculus, Java" />
      </label>
      <label>
        Subjects I want help with
        <input value={needText} onChange={(e) => setNeedText(e.target.value)} placeholder="Organic Chemistry" />
      </label>

      <fieldset>
        <legend>When and where you’re on campus</legend>
        {profile.schedule.length === 0 && <p className="hint">Add the times you’re usually in a building each week.</p>}
        {profile.schedule.map((b, i) => (
          <div key={i} className={`schedule-row ${isValidBlock(b) ? '' : 'invalid'}`}>
            <select value={b.day} onChange={(e) => setBlock(i, { day: e.target.value as ScheduleBlock['day'] })}>
              {DAYS.map((d) => (
                <option key={d} value={d}>
                  {DAY_LABELS[d]}
                </option>
              ))}
            </select>
            <input type="time" value={b.start} onChange={(e) => setBlock(i, { start: e.target.value })} />
            <span>–</span>
            <input type="time" value={b.end} onChange={(e) => setBlock(i, { end: e.target.value })} />
            <select value={b.buildingId} onChange={(e) => setBlock(i, { buildingId: e.target.value })}>
              {BUILDINGS.map((bld) => (
                <option key={bld.id} value={bld.id}>
                  {bld.number ? `${bld.number} · ` : ''}
                  {bld.name}
                </option>
              ))}
            </select>
            <input
              placeholder="Label (e.g. CS 3310)"
              value={b.label ?? ''}
              maxLength={40}
              onChange={(e) => setBlock(i, { label: e.target.value })}
            />
            <button
              type="button"
              aria-label="Remove"
              onClick={() =>
                set(
                  'schedule',
                  profile.schedule.filter((_, j) => j !== i),
                )
              }
            >
              ×
            </button>
          </div>
        ))}
        <button type="button" onClick={addBlock}>
          + Add a time block
        </button>
      </fieldset>

      <div className="row">
        <button className="primary" type="submit" disabled={status === 'saving'}>
          {status === 'saving' ? 'Saving…' : 'Save'}
        </button>
        {status === 'saved' && <span className="ok">Saved ✓</span>}
        {status === 'error' && <span className="error">Something went wrong. Is the server running?</span>}
      </div>

      <fieldset>
        <legend>People you've muted</legend>
        {mutes.rules.length === 0 && <p className="hint">Nobody. Click someone's name to mute their drawings or messages.</p>}
        {mutes.rules.map((r) => (
          <div key={`${r.publicId}-${r.kind}-${r.scope}`} className="row">
            <span>
              {r.displayName}: {r.kind === 'draw' ? 'drawings' : 'messages'} hidden {SCOPE_LABEL(r.scope)}
            </span>
            <button type="button" onClick={() => mutes.remove(r)}>
              Unmute
            </button>
          </div>
        ))}
      </fieldset>
    </form>
  );
}
