import type { RoutineSlot, RoutineStep } from '../../../lib/types';

/** Starting points a parent edits; nothing here is required. Step ids stay stable once saved. */
export const TEMPLATES: { slot: RoutineSlot; name: string; starts_at: string; steps: RoutineStep[] }[] = [
  {
    slot: 'morning',
    name: 'Dawn Patrol',
    starts_at: '06:45',
    steps: [
      { id: 'potty', text: 'Potty', icon: 'toilet' },
      { id: 'dress', text: 'Get dressed', icon: 'shirt' },
      { id: 'breakfast', text: 'Breakfast', icon: 'breakfast' },
      { id: 'teeth', text: 'Brush teeth', icon: 'toothbrush' },
      { id: 'shoes', text: 'Shoes on', icon: 'shoes' },
      { id: 'backpack', text: 'Grab backpack', icon: 'backpack' },
    ],
  },
  {
    slot: 'after_school',
    name: 'After School',
    starts_at: '15:30',
    steps: [
      { id: 'shoes-off', text: 'Shoes off', icon: 'shoes' },
      { id: 'hands', text: 'Wash hands', icon: 'soap' },
      { id: 'water', text: 'Drink water', icon: 'water' },
      { id: 'unpack', text: 'Unpack backpack', icon: 'backpack' },
    ],
  },
  {
    slot: 'bedtime',
    name: 'Last Run',
    starts_at: '19:30',
    steps: [
      { id: 'bath', text: 'Bath', icon: 'bath' },
      { id: 'pjs', text: 'Pajamas on', icon: 'shirt' },
      { id: 'teeth', text: 'Brush teeth', icon: 'toothbrush' },
      { id: 'potty', text: 'Potty', icon: 'toilet' },
      { id: 'book', text: 'Read a book', icon: 'book' },
      { id: 'bed', text: 'Into bed', icon: 'bed' },
    ],
  },
];

export const SLOT_LABEL: Record<RoutineSlot, string> = { morning: 'Morning', after_school: 'After school', bedtime: 'Bedtime', other: 'Other' };

export function newStepId(existing: string[], text: string): string {
  const base = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'step';
  let id = base;
  for (let i = 2; existing.includes(id); i++) id = `${base}-${i}`;
  return id;
}
