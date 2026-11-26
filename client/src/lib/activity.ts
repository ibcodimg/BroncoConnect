/** Map fill colors by how many people are at a building (online in its chatroom + on campus there by schedule). */
export const ACTIVITY_STEPS = [
  { min: 0, color: '#a9d8b8', label: 'Empty' },
  { min: 1, color: '#6fbf8a', label: '1–2' },
  { min: 3, color: '#3c8d5a', label: '3–5' },
  { min: 6, color: '#2a6b40', label: '6–10' },
  { min: 11, color: '#1E4D2B', label: '11+' },
] as const;

export function activityColor(people: number): string {
  let color: string = ACTIVITY_STEPS[0].color;
  for (const step of ACTIVITY_STEPS) if (people >= step.min) color = step.color;
  return color;
}
