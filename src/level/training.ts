import { LevelBuilder, type Level } from './builder';
import { addClouds } from './clouds';
import { bouncer, gems, pad, RAINBOW, wall } from './sky';
import { INK, WHITE, arch, finishLine, reseed } from './town';

/**
 * Training Ground: one short lesson per move, in the order they build on each other. Each lesson is a section ending
 * in a checkpoint, so a fall only sends you back to the start of the lesson you were on.
 */

const KILL_HEIGHT = -14;
const DECK = 0xe9e2d4;
const [RED, ORANGE, YELLOW, GREEN, BLUE, PURPLE] = RAINBOW;
/** Half the lane width. */
const L = 7;

function jump(lb: LevelBuilder) {
  lb.straight(40, (s) => {
    pad(s, -L, L, -10, 14, 0, DECK);
    arch(s, 0.5, WHITE, INK, 0, L - 0.7);
    s.checkpoint(0, 0);
    for (const x of [-3, -1, 1, 3]) s.start(x, 3);
    pad(s, -L, L, 18.5, 40, 0, YELLOW);
    gems(s, 6, -4, 10);
    s.checkpoint(40, 0, { title: 'Jump', text: 'Steer with {move}. Press {jump} at the edge to clear the gap.' });
  });
}

function vault(lb: LevelBuilder) {
  lb.straight(36, (s) => {
    pad(s, -L, L, 0, 36, 0, DECK);
    for (const d of [10, 20, 30]) s.box(-L, L, d, d + 0.8, 0, 1.2, { color: ORANGE });
    s.checkpoint(36, 0, { title: 'Vault', text: "Run straight at a low wall to vault it. There's no button for this." });
  });
}

function climb(lb: LevelBuilder) {
  lb.straight(30, (s) => {
    pad(s, -L, L, 0, 14, 0, DECK);
    wall(s, -L, L, 14, 18, 0, 5, BLUE);
    pad(s, -L, L, 18, 30, 5, DECK);
    gems(s, 4, 0, 14);
    s.checkpoint(30, 5, { title: 'Climb', text: "Run into a tall wall and hold {forward} to climb it. You'll pull yourself over the top." });
  });
}

function wallJump(lb: LevelBuilder) {
  lb.straight(30, (s) => {
    // A 3 m square shaft, entered through a doorway. The far wall is beyond a single climb, and the walls behind
    // and beside it are taller still, so the only way out is to spring back and forth until you're over the far one.
    const base = 5;
    const top = 13;
    const shaft = 17;
    pad(s, -L, L, 0, 14, base, DECK);
    wall(s, -L, -1.2, 10, 11, base, shaft, PURPLE);
    wall(s, 1.2, L, 10, 11, base, shaft, PURPLE);
    wall(s, -1.2, 1.2, 10, 11, base + 2.4, shaft, PURPLE);
    wall(s, -L, -1.5, 11, 14, base, shaft, PURPLE);
    wall(s, 1.5, L, 11, 14, base, shaft, PURPLE);
    wall(s, -L, L, 14, 30, base, top, BLUE);
    s.checkpoint(30, top, {
      title: 'Wall jump',
      text: "This wall is too tall to climb in one go. Go through the doorway and climb, then press {jump} to spring to the wall behind you. Keep springing between the walls until you're over the top.",
    });
  });
}

function dive(lb: LevelBuilder) {
  lb.straight(34, (s) => {
    pad(s, -L, L, 0, 10, 13, DECK);
    pad(s, -L, L, 20, 34, 12, GREEN);
    gems(s, 6, 4, 20);
    s.checkpoint(34, 12, {
      title: 'Dive',
      text: 'This gap is too far to jump. Jump, then press {dive} in mid-air to fly further. In a race, diving into a rival knocks them over.',
    });
  });
}

function bounce(lb: LevelBuilder) {
  lb.straight(30, (s) => {
    // The ledge is beyond a climb from the deck, and even from the top of the pad.
    pad(s, -L, L, 0, 14, 12, DECK);
    bouncer(s, -3, 3, 9, 13, 12);
    wall(s, -L, L, 14, 30, 12, 20.5, RED);
    s.checkpoint(30, 20.5, { title: 'Bounce', text: 'Jump onto the pink pad to bounce up to the ledge.' });
  });
}

function roll(lb: LevelBuilder) {
  lb.straight(40, (s) => {
    pad(s, -L, L, 0, 8, 20.5, DECK);
    pad(s, -L, L, 8, 40, 4, BLUE);
    gems(s, 6, 4, 22);
    s.checkpoint(40, 4, { title: 'Roll', text: 'A big drop knocks you flat. Press {dive} just before you land to roll out of it.' });
  });
}

function items(lb: LevelBuilder) {
  lb.straight(44, (s) => {
    pad(s, -L, L, 0, 44, 4, DECK);
    for (const x of [-4, 0, 4]) s.item(x, 8, 4);
    s.anchor(0, 22, 12);
    arch(s, 34, WHITE, INK, 4, L - 0.7);
    finishLine(s, 34, 4, L);
    s.checkpoint(34, 4, {
      title: 'Items',
      text: 'Run through a ? box to pick up an item, then press {item} to use it. Cross the line to finish.',
    });
  });
}

export function buildTraining(): Level {
  reseed(41);
  const lb = new LevelBuilder();
  lb.killHeight = KILL_HEIGHT;
  jump(lb);
  vault(lb);
  climb(lb);
  wallJump(lb);
  dive(lb);
  bounce(lb);
  roll(lb);
  items(lb);
  const level = lb.build();
  addClouds(level, { count: 70, y: [-34, -22], margin: 120, scale: 2.2 });
  addClouds(level, { count: 15, y: [40, 70], margin: 100 });
  return level;
}
