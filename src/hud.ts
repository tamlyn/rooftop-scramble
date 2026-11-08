import { ITEM_INFO, ITEM_KINDS, type ItemKind } from './items';

export interface HudState {
  place: number;
  total: number;
  item: ItemKind | null;
  roulette: number;
  time: number;
  /** Each runner's course progress 0..1 with its colour; `self` marks this player. */
  dots: { progress: number; color: string; self: boolean }[];
  message: string;
  pigeons: boolean;
  effect: string;
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

export function formatTime(t: number): string {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

/** One player's overlay, positioned over their slice of the split screen. */
export class Hud {
  readonly el = document.createElement('div');
  private place = document.createElement('div');
  private item = document.createElement('div');
  private timer = document.createElement('div');
  private track = document.createElement('div');
  private message = document.createElement('div');
  private pigeons = document.createElement('div');
  private effect = document.createElement('div');
  private dotEls: HTMLDivElement[] = [];
  private lastMessage = '';

  constructor(container: HTMLElement, name: string, color: string) {
    this.el.className = 'hud';
    this.el.style.setProperty('--player', color);
    const tag = document.createElement('div');
    tag.className = 'hud-name';
    tag.textContent = name;
    this.place.className = 'hud-place';
    this.item.className = 'hud-item';
    this.timer.className = 'hud-timer';
    this.track.className = 'hud-track';
    this.message.className = 'hud-message';
    this.pigeons.className = 'hud-pigeons';
    this.effect.className = 'hud-effect';
    for (let i = 0; i < 14; i++) {
      const p = document.createElement('span');
      p.textContent = '🐦';
      p.style.left = `${(i * 37) % 100}%`;
      p.style.top = `${(i * 53) % 90}%`;
      p.style.animationDelay = `${-i * 0.13}s`;
      p.style.fontSize = `${5 + ((i * 7) % 6)}em`;
      this.pigeons.appendChild(p);
    }
    this.el.append(this.pigeons, tag, this.place, this.item, this.timer, this.track, this.effect, this.message);
    container.appendChild(this.el);
  }

  layout(x: number, y: number, w: number, h: number) {
    Object.assign(this.el.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` });
    this.el.style.fontSize = `${Math.max(10, Math.min(w, h * 1.6) / 50)}px`;
  }

  update(s: HudState) {
    this.place.innerHTML = `${s.place}<sup>${ordinal(s.place)}</sup><span>/${s.total}</span>`;
    let icon = '';
    if (s.roulette > 0) icon = ITEM_INFO[ITEM_KINDS[Math.floor(s.roulette * 20) % ITEM_KINDS.length]].icon;
    else if (s.item) icon = ITEM_INFO[s.item].icon;
    this.item.textContent = icon;
    this.item.classList.toggle('ready', !!s.item && s.roulette === 0);
    this.item.title = s.item ? ITEM_INFO[s.item].name : '';
    this.timer.textContent = formatTime(s.time);

    while (this.dotEls.length < s.dots.length) {
      const d = document.createElement('div');
      d.className = 'hud-dot';
      this.track.appendChild(d);
      this.dotEls.push(d);
    }
    s.dots.forEach((dot, i) => {
      const el = this.dotEls[i];
      el.style.left = `${Math.min(100, Math.max(0, dot.progress * 100))}%`;
      el.style.background = dot.color;
      el.classList.toggle('self', dot.self);
    });

    if (s.message !== this.lastMessage) {
      this.lastMessage = s.message;
      this.message.textContent = s.message;
      this.message.classList.remove('pop');
      void this.message.offsetWidth;
      if (s.message) this.message.classList.add('pop');
    }
    this.pigeons.classList.toggle('active', s.pigeons);
    this.effect.textContent = s.effect;
  }

  dispose() {
    this.el.remove();
  }
}
