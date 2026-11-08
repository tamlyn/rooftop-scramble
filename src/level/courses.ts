import type { Level } from './builder';
import { buildCity } from './city';
import { buildRooftops } from './rooftops';
import { buildSky } from './sky';
import { buildTraining } from './training';

export interface Course {
  name: string;
  blurb: string;
  build: () => Level;
  /** Practice courses run without CPU runners. */
  solo?: boolean;
}

export const COURSES: Course[] = [
  { name: 'High Street', blurb: 'Shops, a canal and a building site. Take the road or the rooftops.', build: buildCity },
  { name: 'Rooftop Run', blurb: "Leap the alleys between rooftops. Don't look down.", build: buildRooftops },
  { name: 'Sky Circuit', blurb: 'A rainbow obstacle course above the clouds.', build: buildSky },
  { name: 'Training Ground', blurb: 'Learn every move, one at a time, with no rivals.', build: buildTraining, solo: true },
];
