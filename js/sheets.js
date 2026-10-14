// The chart is a pad of paper: 50 stars per sheet. Pure helpers, no DOM.

export const SHEET_SIZE = 50;

export const sheetOf = (index, size = SHEET_SIZE) => Math.floor(index / size);

// The sheet the next star goes on; a full sheet means a fresh one is on top.
export const currentSheet = (count, size = SHEET_SIZE) => Math.floor(count / size);

export const sheetRange = (sheet, size = SHEET_SIZE) => ({ start: sheet * size, end: sheet * size + size });

/**
 * Steps for revealing stars [seen, count):
 *   { type: 'instant', from, to }  show these without animation
 *   { type: 'slap', index }        fly one star onto the chart
 *   { type: 'sheetDone', sheet }   the sheet on screen just filled up
 *   { type: 'flipTo', sheet }      turn the pad to this sheet
 * Only the last `maxAnimated` stars animate so catching up on many stays quick.
 */
export function planReveal(seen, count, { size = SHEET_SIZE, maxAnimated = 6 } = {}) {
  if (seen >= count) return [];
  const steps = [];
  const animStart = Math.max(seen, count - maxAnimated);
  let view = currentSheet(seen, size);

  if (animStart > seen) {
    steps.push({ type: 'instant', from: seen, to: animStart });
    const target = sheetOf(animStart, size);
    if (target !== view) {
      steps.push({ type: 'sheetDone', sheet: view });
      steps.push({ type: 'flipTo', sheet: target });
      view = target;
    }
  }

  for (let i = animStart; i < count; i++) {
    const s = sheetOf(i, size);
    if (s !== view) {
      steps.push({ type: 'flipTo', sheet: s });
      view = s;
    }
    steps.push({ type: 'slap', index: i });
    if ((i + 1) % size === 0) {
      steps.push({ type: 'sheetDone', sheet: s });
      steps.push({ type: 'flipTo', sheet: s + 1 });
      view = s + 1;
    }
  }
  return steps;
}
