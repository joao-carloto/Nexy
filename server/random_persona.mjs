// Language models can't pick at random: given the same prompt they keep
// returning the same handful of names and faces. So bot traits are rolled here
// with Math.random() and passed to the model as explicit instructions.

// Pure random still gives streaks (three hairdressers in a row), which looks
// broken when a teacher creates a few bots at once. So each list remembers its
// last few picks and avoids them until the server restarts.
// Gender and origin use plain pick(): avoiding repeats there would force strict
// alternation and undo the weighting towards Portugal.
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const recentPicks = new Map();
function pickFresh(list) {
  const recent = recentPicks.get(list) || [];
  const fresh = list.filter((item) => !recent.includes(item));
  const choice = fresh[Math.floor(Math.random() * fresh.length)];
  recent.push(choice);
  // Remember up to 5 picks, but never so many that a short list runs dry.
  if (recent.length > Math.min(5, Math.floor(new Set(list).size / 2))) recent.shift();
  recentPicks.set(list, recent);
  return choice;
}

const GENDERS = ['man', 'woman'];

// Weighted towards Portugal and Europe (where Nexy is mostly used), but mixed.
const ORIGINS = [
  'Portuguese', 'Portuguese', 'Portuguese', 'Portuguese', 'Portuguese', 'Portuguese',
  'Brazilian', 'Brazilian', 'Cape Verdean', 'Angolan', 'Mozambican', 'Spanish', 'French',
  'Italian', 'German', 'Dutch', 'Irish', 'British', 'Polish', 'Romanian', 'Ukrainian',
  'Greek', 'Swedish', 'American', 'Mexican', 'Argentinian', 'Moroccan', 'Nigerian',
  'Indian', 'Nepalese', 'Chinese', 'Japanese', 'Filipino', 'Turkish',
];

// Uncommon initials are left out so the model doesn't have to stretch.
const INITIALS = 'ABCDEFGHIJLMNOPRSTVZ'.split('');

const HAIR = [
  'short hair', 'long hair', 'curly hair', 'a buzz cut', 'a ponytail', 'grey hair',
  'dyed hair', 'a bald head', 'wavy shoulder-length hair', 'messy hair', 'braids',
];

const OUTFITS = [
  'a red hoodie', 'a navy blue sweater', 'a black t-shirt', 'a white shirt',
  'a yellow raincoat', 'a striped top', 'a denim jacket', 'a pink top',
  'a football shirt', 'a grey cardigan', 'a work uniform', 'a leather jacket',
  'a patterned summer top', 'a purple fleece', 'an orange polo shirt', 'a checked flannel shirt',
];

const EXTRAS = [
  'wearing glasses', 'wearing sunglasses on the head', 'with a cap', 'with earrings',
  'with a beard or stubble if a man', 'with freckles', 'with headphones around the neck',
  'holding a coffee cup', 'with a pet in the shot', 'with no accessories', 'with no accessories',
];

const BACKGROUNDS = [
  'a kitchen', 'a living room sofa', 'a car interior', 'a beach', 'a city street',
  'a café table', 'an office desk', 'a garden', 'a bedroom wall with posters',
  'a park bench', 'a mountain trail', 'a supermarket aisle', 'a balcony at sunset',
  'a gym', 'a restaurant', 'a plain wall', 'a train window', 'a football stadium',
];

const SHOTS = [
  'a selfie at arm\'s length', 'a photo taken by a friend', 'a slightly blurry selfie',
  'a mirror selfie', 'a cropped group photo', 'a photo taken from slightly below',
];

const INTERESTS = [
  'football', 'cooking', 'gaming', 'gardening', 'local politics', 'fishing', 'fitness',
  'knitting', 'cars', 'music festivals', 'religion', 'cycling', 'astrology', 'history',
  'photography', 'pets', 'fashion', 'conspiracy theories', 'travel', 'crypto', 'reading',
  'surfing', 'their grandchildren', 'hiking', 'TV soap operas', 'DIY and home repairs',
];

const OCCUPATIONS = [
  'student', 'nurse', 'retired teacher', 'truck driver', 'shop owner', 'software developer',
  'unemployed', 'farmer', 'hairdresser', 'accountant', 'waiter', 'electrician',
  'stay-at-home parent', 'civil servant', 'mechanic', 'artist', 'small business owner',
  'factory worker', 'real estate agent', 'pensioner', 'delivery driver', 'personal trainer',
];

// Skewed towards adults, with some teenagers and some elderly users.
function randomAge() {
  const r = Math.random();
  if (r < 0.15) return 16 + Math.floor(Math.random() * 6); // 16-21
  if (r < 0.85) return 22 + Math.floor(Math.random() * 43); // 22-64
  return 65 + Math.floor(Math.random() * 26); // 65-90
}

export function randomPersona(countryRegion) {
  const age = randomAge();
  return {
    gender: pick(GENDERS),
    age,
    origin: countryRegion || pick(ORIGINS),
    initial: pickFresh(INITIALS),
    surnameInitial: pickFresh(INITIALS),
    hair: pickFresh(HAIR),
    outfit: pickFresh(OUTFITS),
    extra: pickFresh(EXTRAS),
    background: pickFresh(BACKGROUNDS),
    shot: pickFresh(SHOTS),
    interest: pickFresh(INTERESTS),
    occupation: age < 22 ? 'student' : age >= 67 ? 'pensioner' : pickFresh(OCCUPATIONS),
  };
}
