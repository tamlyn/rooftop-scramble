import type { Level } from './builder';
import { buildCity } from './city';
import { buildRooftops } from './rooftops';
import { buildSky } from './sky';

export interface Course {
  name: string;
  blurb: string;
  build: () => Level;
}

export const COURSES: Course[] = [
  { name: 'High Street', blurb: 'Shops, a canal and a building site. Take the road or the rooftops.', build: buildCity },
  { name: 'Rooftop Run', blurb: "Leap the alleys between rooftops. Don't look down.", build: buildRooftops },
  { name: 'Sky Circuit', blurb: 'A rainbow obstacle course above the clouds.', build: buildSky },
];
