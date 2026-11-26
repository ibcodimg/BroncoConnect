import { BUILDINGS } from '@shared/buildings';
import { DAY_LABELS, isValidBlock } from '@shared/schedule';
import { CPP_MAJORS, normalizeCourse, normalizeTag, SUBJECT_SUGGESTIONS, tagKey } from '@shared/tags';
import { DAYS, LOOKING_FOR, type CourseEntry, type LookingFor, type ScheduleBlock, type TagStats, type UserProfile } from '@shared/types';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import TagInput from '../components/TagInput';
import { api } from '../lib/api';
import { LOOKING_LABELS } from '../lib/labels';
import { useMutes } from '../lib/mutes';
import { useSession } from '../lib/session';

const SCOPE_LABEL = (scope: string) => {
  if (scope === 'all') return 'everywhere';
  const b = BUILDINGS.find((x) => x.id === scope);
  return b ? (b.number ? `in Building ${b.number}` : `in ${b.name}`) : scope === 'campus' ? 'in campus chat' : scope;
};

const EMPTY: UserProfile = {
  majors: [],
  schedule: [],
  lookingFor: [],
  strongSubjects: [],
  needHelpSubjects: [],
  coursesTaken: [],
  coursesNeedHelp: [],
};

const toCounts = (pairs: [string, number][] = []) => new Map(pairs.map(([label, n]) => [tagKey(label), n]));

/** Courses with an optional professor (helps match people who had the same class/professor). */
function CourseList({
  label,
  value,
  onChange,
  counts,
  popular,
}: {
  label: string;
  value: CourseEntry[];
  onChange: (v: CourseEntry[]) => void;
  counts: Map<string, number>;
  popular: string[];
}) {
  const [course, setCourse] = useState('');
  const [professor, setProfessor] = useState('');
  const listId = `courses-${label.replace(/\W+/g, '-')}`;

  const add = () => {
    const c = normalizeCourse(course);
    if (!c || value.some((v) => tagKey(v.course) === tagKey(c)) || value.length >= 30) return;
    onChange([...value, { course: c, ...(professor.trim() ? { professor: professor.trim().slice(0, 40) } : {}) }]);
    setCourse('');
    setProfessor('');
  };

  return (
    <div className="tag-input">
      <span className="tag-label">{label}</span>
      <div className="tag-box static">
        {value.length === 0 && <span className="hint">None yet.</span>}
        {value.map((c) => (
          <span key={c.course} className="tag" title={`${counts.get(tagKey(c.course)) ?? 0} others list this course`}>
            {c.course}
            {c.professor && <em> · {c.professor}</em>} <small>· {counts.get(tagKey(c.course)) ?? 0}</small>
            <button type="button" aria-label={`Remove ${c.course}`} onClick={() => onChange(value.filter((v) => v !== c))}>
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="row course-add">
        <input
          list={listId}
          value={course}
          onChange={(e) => setCourse(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())}
          placeholder="Course, e.g. CS 3310"
          aria-label={`${label}: course`}
        />
        <datalist id={listId}>
          {popular.map((c) => (
            <option key={c} value={c}>
              {counts.get(tagKey(c)) ?? 0} others
            </option>
          ))}
        </datalist>
        <input
          value={professor}
          onChange={(e) => setProfessor(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())}
          placeholder="Professor (optional)"
          aria-label={`${label}: professor`}
        />
        <button type="button" onClick={add} disabled={!course.trim()}>
          Add
        </button>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const { refresh, me } = useSession();
  const mutes = useMutes();
  const [profile, setProfile] = useState<UserProfile>(EMPTY);
  const [status, setStatus] = useState<'loading' | 'idle' | 'saving' | 'saved' | 'error'>('loading');
  const [stats, setStats] = useState<TagStats | null>(null);

  const load = (p: UserProfile) => setProfile({ ...EMPTY, ...p });
  const loadStats = () => {
    api.tagStats().then(setStats).catch(() => {});
  };
  useEffect(loadStats, []);

  const counts = useMemo(
    () => ({ majors: toCounts(stats?.majors), subjects: toCounts(stats?.subjects), courses: toCounts(stats?.courses) }),
    [stats],
  );
  const popular = (pairs: [string, number][] = []) => pairs.slice(0, 40).map(([label]) => label);

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
      const { publicId: _publicId, ...saved } = await api.saveProfile(profile);
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
      <TagInput
        label="Major (up to 3)"
        value={profile.majors}
        onChange={(v) => set('majors', v)}
        options={CPP_MAJORS}
        popular={popular(stats?.majors)}
        counts={counts.majors}
        normalize={normalizeTag}
        max={3}
        placeholder="Start typing… e.g. Computer Science"
      />
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

      <fieldset className="tutoring-fields">
        <legend>Subjects &amp; courses (used for Tutor4Tutor)</legend>
        <p className="hint">
          The number on each tag is how many <em>other</em> people picked it. Can't find yours? Type it and press Enter to add a
          custom tag.
        </p>
        <TagInput
          label="Subjects I’m good at"
          value={profile.strongSubjects}
          onChange={(v) => set('strongSubjects', v)}
          options={SUBJECT_SUGGESTIONS}
          popular={popular(stats?.subjects)}
          counts={counts.subjects}
          normalize={normalizeTag}
          placeholder="e.g. Calculus I, Java"
        />
        <TagInput
          label="Subjects I want help with"
          value={profile.needHelpSubjects}
          onChange={(v) => set('needHelpSubjects', v)}
          options={SUBJECT_SUGGESTIONS}
          popular={popular(stats?.subjects)}
          counts={counts.subjects}
          normalize={normalizeTag}
          placeholder="e.g. Organic Chemistry"
        />
        <CourseList
          label="Courses I’ve taken (I can help others with these)"
          value={profile.coursesTaken}
          onChange={(v) => set('coursesTaken', v)}
          counts={counts.courses}
          popular={popular(stats?.courses)}
        />
        <CourseList
          label="Courses I want help with"
          value={profile.coursesNeedHelp}
          onChange={(v) => set('coursesNeedHelp', v)}
          counts={counts.courses}
          popular={popular(stats?.courses)}
        />
      </fieldset>

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
        {status === 'saved' && <span className="ok">Saved ✓ · see your matches on the Tutor4Tutor tab</span>}
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
