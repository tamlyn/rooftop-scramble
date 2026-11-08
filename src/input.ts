export interface Controls {
  /** Steering: -1 left, +1 right. */
  x: number;
  /** Throttle: +1 forward, -1 back. */
  y: number;
  jumpHeld: boolean;
  jumpPressed: boolean;
  divePressed: boolean;
  itemPressed: boolean;
  startPressed: boolean;
}

export interface InputSource {
  readonly id: string;
  readonly label: string;
  poll(): Controls;
}

const keysDown = new Set<string>();
// Counting presses rather than sampling held keys means a tap shorter than a frame still registers.
const pressCounts = new Map<string, number>();
addEventListener('keydown', (e) => {
  keysDown.add(e.code);
  if (!e.repeat) pressCounts.set(e.code, (pressCounts.get(e.code) ?? 0) + 1);
  if (e.code.startsWith('Arrow') || e.code === 'Space' || e.code === 'Slash') e.preventDefault();
});
addEventListener('keyup', (e) => keysDown.delete(e.code));
addEventListener('blur', () => keysDown.clear());

interface KeyScheme {
  left: string;
  right: string;
  up: string;
  down: string;
  jump: string;
  dive: string;
  item: string;
}

export const KEYBOARD_SCHEMES: Record<string, { label: string; keys: KeyScheme; help: string }> = {
  wasd: {
    label: 'Keyboard (WASD)',
    keys: { left: 'KeyA', right: 'KeyD', up: 'KeyW', down: 'KeyS', jump: 'Space', dive: 'ShiftLeft', item: 'KeyE' },
    help: 'WASD move · Space jump · L-Shift dive/tackle · E item',
  },
  arrows: {
    label: 'Keyboard (Arrows)',
    keys: { left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown', jump: 'Slash', dive: 'Period', item: 'Comma' },
    help: 'Arrows move · / jump · . dive/tackle · , item',
  },
};

class Edges {
  private prev = new Map<string, boolean>();
  pressed(name: string, now: boolean): boolean {
    const was = this.prev.get(name) ?? false;
    this.prev.set(name, now);
    return now && !was;
  }
}

export class KeyboardSource implements InputSource {
  readonly id: string;
  readonly label: string;
  private keys: KeyScheme;
  private seen = new Map<string, number>();

  constructor(scheme: keyof typeof KEYBOARD_SCHEMES) {
    this.id = `kb-${scheme}`;
    this.label = KEYBOARD_SCHEMES[scheme].label;
    this.keys = KEYBOARD_SCHEMES[scheme].keys;
  }

  poll(): Controls {
    const k = this.keys;
    const down = (code: string) => keysDown.has(code);
    const pressed = (code: string) => {
      const count = pressCounts.get(code) ?? 0;
      const fresh = count !== (this.seen.get(code) ?? 0);
      this.seen.set(code, count);
      return fresh;
    };
    return {
      x: (down(k.right) ? 1 : 0) - (down(k.left) ? 1 : 0),
      y: (down(k.up) ? 1 : 0) - (down(k.down) ? 1 : 0),
      jumpHeld: down(k.jump),
      jumpPressed: pressed(k.jump),
      divePressed: pressed(k.dive),
      itemPressed: pressed(k.item),
      startPressed: pressed('Enter'),
    };
  }
}

const DEADZONE = 0.2;

export class GamepadSource implements InputSource {
  readonly id: string;
  readonly label: string;
  private edges = new Edges();

  constructor(private index: number) {
    this.id = `pad-${index}`;
    this.label = `Gamepad ${index + 1}`;
  }

  poll(): Controls {
    const pad = navigator.getGamepads()[this.index];
    if (!pad) {
      return { x: 0, y: 0, jumpHeld: false, jumpPressed: false, divePressed: false, itemPressed: false, startPressed: false };
    }
    const btn = (i: number) => pad.buttons[i]?.pressed ?? false;
    const axis = (i: number) => {
      const v = pad.axes[i] ?? 0;
      return Math.abs(v) < DEADZONE ? 0 : v;
    };
    // Right trigger also runs, for players who prefer kart-style controls.
    const trigger = pad.buttons[7]?.value ?? 0;
    const throttle = trigger > 0.1 ? trigger : -axis(1) || (btn(12) ? 1 : btn(13) ? -1 : 0);
    const steer = axis(0) || (btn(15) ? 1 : btn(14) ? -1 : 0);
    return {
      x: steer,
      y: throttle,
      jumpHeld: btn(0),
      jumpPressed: this.edges.pressed('jump', btn(0)),
      divePressed: this.edges.pressed('dive', btn(2) || btn(1)),
      itemPressed: this.edges.pressed('item', btn(3) || btn(5) || btn(4)),
      startPressed: this.edges.pressed('start', btn(9)),
    };
  }
}

export function connectedGamepadIndices(): number[] {
  return Array.from(navigator.getGamepads())
    .filter((p): p is Gamepad => p !== null)
    .map((p) => p.index);
}

export const NO_INPUT: Controls = {
  x: 0,
  y: 0,
  jumpHeld: false,
  jumpPressed: false,
  divePressed: false,
  itemPressed: false,
  startPressed: false,
};
