import type { Effect } from '../store/life';
import type { WallVariant } from '../world/buildingLayout';

export type PlaceType =
  | 'coffee'
  | 'diner'
  | 'market'
  | 'gym'
  | 'police'
  | 'school'
  | 'hospital'
  | 'bank'
  | 'arcade'
  | 'home'
  | 'skyport'
  | 'dealer'
  | 'clothing'
  | 'pharmacy';

export interface PlaceAction {
  id: string;
  label: string;
  description: string;
  effect?: Effect;
  /** Shows a health report instead of (or as well as) applying an effect. */
  report?: 'health';
  /** Not available yet (feature lands in a later phase). */
  comingSoon?: string;
}

export interface PlaceDef {
  id: string;
  name: string;
  type: PlaceType;
  tagline: string;
  sign: { background: string; text: string; accent: string };
  /** Where it is: the road it fronts, which side of that road, and roughly where along it. */
  at: { road: string; side: 'north' | 'south' | 'east' | 'west'; along: number };
  /** Optional facade override so landmarks look the part. */
  variant?: WallVariant;
  actions: PlaceAction[];
}

const eat = (
  id: string,
  label: string,
  description: string,
  cost: number,
  kcal: number,
  fullness: number,
  extra: Partial<Effect> = {},
): PlaceAction => ({
  id,
  label,
  description,
  effect: { cost, kcal, fullness, minutes: 10, ...extra },
});

/** Every enterable place in Harbor City. */
export const PLACES: PlaceDef[] = [
  {
    id: 'harbor-brew',
    name: 'Harbor Brew',
    type: 'coffee',
    tagline: 'Coffee & pastries',
    sign: { background: '#3b2418', text: '#f3e3c3', accent: '#c8873c' },
    at: { road: 'main', side: 'south', along: -48 },
    actions: [
      eat('espresso', 'Espresso', 'A quick jolt of energy.', 3, 5, 2, { energy: 12 }),
      eat('latte', 'Caramel latte', 'Sweet, milky, comforting.', 5, 190, 10, {
        energy: 10,
        mood: 4,
      }),
      eat('croissant', 'Butter croissant', 'Flaky and rich.', 4, 270, 18, { mood: 3 }),
      eat('mocha', 'Iced mocha', 'Basically dessert in a cup.', 6, 350, 12, { energy: 8, mood: 5 }),
      eat('oatmeal', 'Oatmeal & berries', 'Filling and light.', 6, 280, 28),
    ],
  },
  {
    id: 'sunny-side',
    name: 'Sunny Side Diner',
    type: 'diner',
    tagline: 'All-day breakfast & burgers',
    sign: { background: '#b8202a', text: '#fff6e6', accent: '#f2c230' },
    at: { road: 'main', side: 'north', along: -40 },
    actions: [
      eat('burger', 'Double burger & fries', 'Huge, greasy, delicious.', 12, 1150, 60, { mood: 6 }),
      eat('pancakes', 'Pancake stack', 'With syrup and butter.', 9, 780, 45, { mood: 5 }),
      eat('salad', 'Grilled chicken salad', 'High protein, low calorie.', 11, 420, 38),
      eat('shake', 'Chocolate milkshake', 'Thick and sweet.', 6, 720, 20, { mood: 8 }),
      eat('soup', 'Vegetable soup', 'Warm and light.', 7, 210, 25),
    ],
  },
  {
    id: 'freshmart',
    name: 'FreshMart',
    type: 'market',
    tagline: 'Groceries & snacks',
    sign: { background: '#167a3e', text: '#ffffff', accent: '#9bdc5a' },
    at: { road: 'main', side: 'south', along: 42 },
    actions: [
      eat('fruit', 'Fruit bowl', 'Fresh and healthy.', 4, 150, 12, { minutes: 5 }),
      eat('sandwich', 'Turkey sandwich', 'A solid lunch.', 6, 450, 30, { minutes: 5 }),
      eat('chips', 'Chips & soda', 'Empty calories, happy mouth.', 4, 560, 14, {
        mood: 5,
        minutes: 5,
      }),
      eat('water', 'Bottled water', 'Zero calories.', 1, 0, 2, { minutes: 2 }),
      eat('protein', 'Protein bar', 'Good after the gym.', 3, 210, 12, { minutes: 2 }),
    ],
  },
  {
    id: 'iron-harbor',
    name: 'Iron Harbor Gym',
    type: 'gym',
    tagline: 'Train hard. Burn fat.',
    sign: { background: '#111316', text: '#ffffff', accent: '#ff5a1f' },
    at: { road: 'first', side: 'east', along: 45 },
    variant: 'dark_brick',
    actions: [
      {
        id: 'cardio',
        label: 'Cardio session (45 min)',
        description: 'Treadmill and bike. Burns the most calories.',
        effect: {
          cost: 15,
          burn: 480,
          energy: -25,
          fitness: 3,
          mood: 6,
          fullness: -8,
          minutes: 45,
        },
      },
      {
        id: 'weights',
        label: 'Weight training (60 min)',
        description: 'Builds fitness and strength.',
        effect: {
          cost: 15,
          burn: 360,
          energy: -22,
          fitness: 4,
          mood: 5,
          fullness: -6,
          minutes: 60,
        },
      },
      {
        id: 'yoga',
        label: 'Yoga class (30 min)',
        description: 'Gentle, great for mood.',
        effect: { cost: 10, burn: 140, energy: -5, fitness: 1, mood: 14, minutes: 30 },
      },
      {
        id: 'hiit',
        label: 'HIIT bootcamp (30 min)',
        description: 'Short and brutal. Needs energy.',
        effect: {
          cost: 18,
          burn: 420,
          energy: -30,
          fitness: 4,
          mood: 4,
          fullness: -6,
          minutes: 30,
        },
      },
    ],
  },
  {
    id: 'hcpd',
    name: 'HCPD Precinct 1',
    type: 'police',
    tagline: 'Harbor City Police Department',
    sign: { background: '#0f2a5c', text: '#ffffff', accent: '#e6b422' },
    at: { road: 'main', side: 'north', along: 80 },
    variant: 'plaster_grey',
    actions: [
      { id: 'record', label: 'Check my record', description: 'Your criminal record is clean.' },
      { id: 'fines', label: 'Pay fines', description: 'You have no unpaid fines.' },
      {
        id: 'permit',
        label: 'Apply for a weapon permit',
        description: 'Permits open with the weapons update.',
        comingSoon: 'Phase 9',
      },
    ],
  },
  {
    id: 'hccc',
    name: 'Harbor City Community College',
    type: 'school',
    tagline: 'Classes that pay off',
    sign: { background: '#5a1a2e', text: '#f5e9d8', accent: '#d9b25a' },
    at: { road: 'market', side: 'north', along: -45 },
    variant: 'red_brick',
    actions: [
      {
        id: 'business',
        label: 'Business 101 (2 h)',
        description: 'Education raises job pay later.',
        effect: { cost: 40, education: 6, energy: -12, mood: -2, minutes: 120 },
      },
      {
        id: 'coding',
        label: 'Intro to coding (2 h)',
        description: 'Hard but valuable.',
        effect: { cost: 50, education: 8, energy: -15, mood: -3, minutes: 120 },
      },
      {
        id: 'nutrition',
        label: 'Nutrition workshop (1 h)',
        description: 'Learn how food affects your body.',
        effect: { cost: 15, education: 3, mood: 2, minutes: 60 },
      },
      {
        id: 'flight',
        label: 'Flight theory',
        description: 'Flight school opens with flying cars.',
        comingSoon: 'Phase 8',
      },
    ],
  },
  {
    id: 'harbor-general',
    name: 'Harbor General Hospital',
    type: 'hospital',
    tagline: 'Emergency · Clinics',
    sign: { background: '#ffffff', text: '#c21f2c', accent: '#c21f2c' },
    at: { road: 'harbor', side: 'south', along: -55 },
    variant: 'plaster_cream',
    actions: [
      {
        id: 'checkup',
        label: 'Health check-up',
        description: 'Weight, BMI and advice from a doctor.',
        effect: { cost: 60, minutes: 30 },
        report: 'health',
      },
      {
        id: 'dietitian',
        label: 'See a dietitian',
        description: 'A plan to reach a healthy weight.',
        effect: { cost: 80, mood: 3, minutes: 45 },
        report: 'health',
      },
    ],
  },
  {
    id: 'harbor-bank',
    name: 'Harbor Bank',
    type: 'bank',
    tagline: 'Checking · Savings · Loans',
    sign: { background: '#0d3b3a', text: '#ffffff', accent: '#4fd1b5' },
    at: { road: 'first', side: 'west', along: -40 },
    variant: 'stucco',
    actions: [
      { id: 'balance', label: 'Check balance', description: 'Your cash is shown on the HUD.' },
      {
        id: 'savings',
        label: 'Open a savings account',
        description: 'Banking arrives with the phone.',
        comingSoon: 'Phase 6',
      },
    ],
  },
  {
    id: 'pixel-pier',
    name: 'Pixel Pier Arcade',
    type: 'arcade',
    tagline: 'Games · VR · Prizes',
    sign: { background: '#2a0a4a', text: '#ff4fd8', accent: '#36e0ff' },
    at: { road: 'main', side: 'north', along: 30 },
    actions: [
      {
        id: 'games',
        label: 'Play arcade games (30 min)',
        description: 'Classic cabinets and air hockey.',
        effect: { cost: 5, mood: 18, energy: -4, minutes: 30 },
      },
      {
        id: 'vr',
        label: 'VR racing (20 min)',
        description: 'Feel the speed without the fines.',
        effect: { cost: 10, mood: 25, energy: -6, minutes: 20 },
      },
      eat('popcorn', 'Popcorn & slushie', 'Arcade snacks.', 5, 480, 14, { mood: 6, minutes: 5 }),
    ],
  },
  {
    id: 'home',
    name: 'Bayview Studios — Your Apartment',
    type: 'home',
    tagline: 'Home sweet studio',
    sign: { background: '#2b3440', text: '#e8edf2', accent: '#7cc4ff' },
    at: { road: 'main', side: 'south', along: -15 },
    actions: [
      {
        id: 'sleep',
        label: 'Sleep (8 h)',
        description: 'Fully restores energy. Time skips ahead.',
        effect: { energyTo: 100, mood: 8, minutes: 480 },
      },
      {
        id: 'nap',
        label: 'Nap (2 h)',
        description: 'A quick recharge.',
        effect: { energy: 25, mood: 2, minutes: 120 },
      },
      eat('cook', 'Cook a healthy meal', 'Cheaper and lighter than eating out.', 4, 520, 45, {
        minutes: 40,
      }),
      {
        id: 'workout',
        label: 'Home workout (30 min)',
        description: 'Push-ups and squats. Free.',
        effect: { burn: 200, energy: -15, fitness: 2, mood: 3, minutes: 30 },
      },
    ],
  },
  {
    id: 'thread-co',
    name: 'Thread & Co.',
    type: 'clothing',
    tagline: 'Clothing & shoes',
    sign: { background: '#f0e6d8', text: '#2a2a2a', accent: '#b07d4f' },
    at: { road: 'main', side: 'south', along: 75 },
    actions: [
      {
        id: 'browse',
        label: 'Browse clothes',
        description: 'Outfits arrive with character customization.',
        comingSoon: 'Later',
      },
    ],
  },
  {
    id: 'harbor-pharmacy',
    name: 'Harbor Pharmacy',
    type: 'pharmacy',
    tagline: 'Health · Beauty · Vitamins',
    sign: { background: '#ffffff', text: '#127a52', accent: '#127a52' },
    at: { road: 'first', side: 'east', along: -45 },
    actions: [
      eat('vitamins', 'Daily vitamins', 'A small mood boost.', 8, 0, 0, { mood: 4, minutes: 2 }),
      eat('energy', 'Energy drink', 'Big energy, big sugar.', 4, 220, 4, {
        energy: 22,
        minutes: 2,
      }),
    ],
  },
  {
    id: 'fc-motors',
    name: 'Flying Car Motors',
    type: 'dealer',
    tagline: 'Electric cars · Flying cars',
    sign: { background: '#0b0c0e', text: '#f4f6f8', accent: '#7cc4ff' },
    at: { road: 'market', side: 'south', along: 50 },
    actions: [
      {
        id: 'cars',
        label: 'Browse cars',
        description: 'The showroom opens with the progression update.',
        comingSoon: 'Phase 8',
      },
      {
        id: 'flying',
        label: 'Flying cars',
        description: 'Pre-orders open soon.',
        comingSoon: 'Phase 8',
      },
    ],
  },
  {
    id: 'skyport',
    name: 'Harbor City Skyport',
    type: 'skyport',
    tagline: 'Airport · Air taxis · Landing pads',
    sign: { background: '#0e2238', text: '#ffffff', accent: '#36a3ff' },
    at: { road: 'harbor', side: 'north', along: 120 },
    variant: 'plaster_grey',
    actions: [
      {
        id: 'flights',
        label: 'Departures',
        description: 'Flights and air taxis start with flying cars.',
        comingSoon: 'Phase 4',
      },
      {
        id: 'pads',
        label: 'Landing pads',
        description: 'Rooftop pads for flying cars.',
        comingSoon: 'Phase 4',
      },
    ],
  },
];
