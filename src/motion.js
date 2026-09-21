// One curve and three durations for everything that moves, shared by the app
// chrome (styles.css defines the same values as --ease and --t-*) and the page
// frames, so a sheet, a page turn and a chapter hand-off all feel like one system.
//
//   fade   – anything that appears, highlights or tints
//   travel – anything that crosses the screen: pages, chapters, toolbars
//   sheet  – sheets and the cover-to-page morph
//
// The curve never overshoots: nothing on iOS springs past its target on arrival.

export const EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';
export const DUR = { fade: 200, travel: 300, sheet: 500 };
