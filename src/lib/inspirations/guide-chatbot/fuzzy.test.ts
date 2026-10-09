import { describe, expect, it } from 'vitest';
import { closestWord, correctText, editDistance, maxTypos } from './fuzzy';
import { applySynonyms, findIndustry, findPlatform, stripChatter } from './synonyms';

describe('editDistance', () => {
  it('counts insertions, deletions and swaps', () => {
    expect(editDistance('swiggy', 'swiggy')).toBe(0);
    expect(editDistance('swigy', 'swiggy')).toBe(1);
    expect(editDistance('swiggyy', 'swiggy')).toBe(1);
    expect(editDistance('flwos', 'flows')).toBe(1);
    expect(editDistance('zomto', 'zomato')).toBe(1);
    expect(editDistance('abc', 'xyz')).toBe(3);
  });
});

describe('maxTypos', () => {
  it('allows none in short words and more in long ones', () => {
    expect([3, 4, 5, 7, 8, 12].map(maxTypos)).toEqual([0, 0, 1, 1, 2, 2]);
  });
});

describe('closestWord', () => {
  const vocabulary = ['swiggy', 'zomato', 'flows', 'screens', 'onboarding', 'checkout', 'pattern'];

  it('finds the one word a misspelling means', () => {
    expect(closestWord('swigy', vocabulary)).toBe('swiggy');
    expect(closestWord('zomatto', vocabulary)).toBe('zomato');
    expect(closestWord('flwos', vocabulary)).toBe('flows');
    expect(closestWord('onbording', vocabulary)).toBe('onboarding');
    expect(closestWord('chekout', vocabulary)).toBe('checkout');
  });

  it('never "corrects" a word into its own plural or singular', () => {
    expect(closestWord('screen', ['screens'])).toBeNull();
    expect(closestWord('screens', ['screen'])).toBeNull();
    expect(closestWord('pattern', ['patterns', 'pattern'])).toBeNull();
  });

  it('leaves words that are already right, or too short to judge', () => {
    expect(closestWord('swiggy', vocabulary)).toBeNull();
    expect(closestWord('swig', vocabulary)).toBeNull();
    expect(closestWord('form', ['from', 'forms'])).toBeNull();
  });

  it('will not guess when the first letter differs or nothing is close', () => {
    expect(closestWord('wiggy', vocabulary)).toBeNull();
    expect(closestWord('banana', vocabulary)).toBeNull();
  });

  it('will not guess between two equally close words', () => {
    expect(closestWord('stream', ['stream1', 'stream2'])).toBeNull();
    expect(closestWord('flowx', ['flows', 'flowy'])).toBeNull();
  });
});

describe('correctText', () => {
  const vocabulary = ['swiggy', 'zomato', 'flows', 'screens'];

  it('fixes confident misspellings and reports them', () => {
    const { text, corrections } = correctText('how many screns does swigy have', vocabulary);
    expect(text).toBe('how many screens does swiggy have');
    expect(corrections).toEqual([{ from: 'screns', to: 'screens' }, { from: 'swigy', to: 'swiggy' }]);
  });

  it('will not fix a word that is two slips away from a short one', () => {
    expect(correctText('scrnes', vocabulary).text).toBe('scrnes');
  });

  it('leaves ordinary words and punctuation alone', () => {
    const { text, corrections } = correctText('show me what it does, please!', vocabulary);
    expect(text).toBe('show me what it does, please!');
    expect(corrections).toEqual([]);
  });
});

describe('applySynonyms', () => {
  it.each([
    ['sign in screens', 'login screens'],
    ['log-in page', 'login page'],
    ['register screen', 'signup screen'],
    ['sign up flow', 'signup flow'],
    ['payment screens', 'checkout screens'],
    ['show the basket', 'show the cart'],
    ['welcome screens', 'onboarding'],
    ['walkthrough', 'onboarding'],
    ['landing page', 'landing'],
  ])('%s → %s', (input, expected) => {
    expect(applySynonyms(input)).toBe(expected);
  });

  it('leaves unrelated text alone', () => {
    expect(applySynonyms('open swiggy')).toBe('open swiggy');
  });
});

describe('findIndustry', () => {
  it.each([
    ['food apps', 'food'],
    ['show me fintech apps', 'fintech'],
    ['banking apps', 'fintech'],
    ['shopping apps', 'ecommerce'],
    ['travel category', 'travel'],
    ['fintech', 'fintech'],
    ['how many health apps', 'healthcare'],
  ])('%s → %s', (input, expected) => {
    expect(findIndustry(input)).toBe(expected);
  });

  it('ignores an industry word in an ordinary sentence', () => {
    expect(findIndustry('what is the best way to play games')).toBeNull();
    expect(findIndustry('open swiggy')).toBeNull();
    expect(findIndustry('login screens')).toBeNull();
  });
});

describe('findPlatform', () => {
  it.each([
    ['web apps', 'webapp'],
    ['web application', 'webapp'],
    ['webapp', 'webapp'],
    ['how many web apps are there', 'webapp'],
    ['web', 'web'],
    ['websites', 'web'],
    ['ios apps', 'ios'],
    ['iphone', 'ios'],
  ])('%s → %s', (input, expected) => {
    expect(findPlatform(input)).toBe(expected);
  });

  it('ignores a platform word in an ordinary sentence', () => {
    expect(findPlatform('what is a good web design tip')).toBeNull();
    expect(findPlatform('open swiggy')).toBeNull();
    expect(findPlatform('apple pie recipes')).toBeNull();
  });
});

describe('stripChatter', () => {
  it.each([
    ['sorry web', 'web'],
    ['sorry, i mean web application', 'web application'],
    ['actually show flows', 'show flows'],
    ['no, zomato flows', 'zomato flows'],
    ['um, well, swiggy', 'swiggy'],
    ['i meant food apps', 'food apps'],
  ])('%s → %s', (input, expected) => {
    expect(stripChatter(input)).toBe(expected);
  });

  it('keeps the text when nothing else is left, and leaves ordinary words alone', () => {
    expect(stripChatter('sorry')).toBe('sorry');
    expect(stripChatter('ok')).toBe('ok');
    expect(stripChatter('nothing to strip here')).toBe('nothing to strip here');
    expect(stripChatter('nobody knows')).toBe('nobody knows');
  });
});
