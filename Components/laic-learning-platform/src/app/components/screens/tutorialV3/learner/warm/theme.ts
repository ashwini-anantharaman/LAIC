/**
 * The one place the Tutorial V3 student view's visual language is written down.
 *
 * Every value here comes from the Figma reference export (`tutorial-shell.tsx`
 * and `src/index.css` in "Reference Markdown wDocumentation"). The rule for this
 * whole `warm/` folder is that the UI is fixed and the content is not: a course
 * developer changes what a block says, never how it looks.
 *
 * Two things are deliberately not tokens. Tailwind's own `stone`/`amber`/`green`
 * scales are used by class name exactly as the reference uses them, and the sage
 * green is an inline style because it is not in the palette Tailwind ships.
 */

/** The one brand colour the reference introduces. Not a Tailwind scale value. */
export const SAGE = '#4d7c5a';

/**
 * The reference's control colour — the active pill in a settings row, a block's
 * Submit, the selected mode in a toggle group. Distinct from SAGE, which is
 * page-level navigation and the one action that moves the learner forward.
 */
export const NAVY = '#0e1c35';

/** Author-ish accents: the amber the reference uses for hints and Test-yourself. */
export const AMBER = '#d97706';

/** Page ground behind the reading column and the sidebar rail. */
export const WARM_BG = '#f8f6f1';

/** Nunito, loaded already by `styles/fonts.css`. */
export const WARM_FONT = "'Nunito', ui-sans-serif, system-ui, sans-serif";

/** Red suits print red; black suits print near-black. */
export const suitColor = (suit: string): string =>
  (suit === '♥' || suit === '♦') ? '#dc2626' : '#1f2937';

/** Seat colour, so a learner can follow one player down an auction. */
export const SEAT_TEXT: Record<string, string> = {
  West: 'text-blue-600',
  North: 'text-red-600',
  East: 'text-emerald-600',
  South: 'text-purple-600',
};

export const SEAT_NAME: Record<string, string> = {
  N: 'North',
  E: 'East',
  S: 'South',
  W: 'West',
};

/**
 * Reading time, in the reference's own phrasing ("~12 min").
 * 200 words a minute is the figure the rest of the platform already uses.
 */
export function readingTime(words: number): string {
  return `~${Math.max(1, Math.round(words / 200))} min`;
}
