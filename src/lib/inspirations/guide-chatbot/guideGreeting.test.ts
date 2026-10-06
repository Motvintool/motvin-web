import { describe, expect, it } from 'vitest';
import { greetingFor } from './guideGreeting';

describe('greetingFor', () => {
  it.each([
    [0, 'Good morning'],
    [11, 'Good morning'],
    [12, 'Good afternoon'],
    [17, 'Good afternoon'],
    [18, 'Good evening'],
    [23, 'Good evening'],
  ])('at %i o’clock says %s', (hour, period) => {
    expect(greetingFor(hour)).toBe(period);
  });

  it('adds the signed-in name exactly as the profile has it', () => {
    expect(greetingFor(14, 'SurendarV')).toBe('Good afternoon, SurendarV');
    expect(greetingFor(9, 'Surendar V')).toBe('Good morning, Surendar V');
  });

  it('leaves the name off when there is none', () => {
    expect(greetingFor(14, null)).toBe('Good afternoon');
    expect(greetingFor(14, undefined)).toBe('Good afternoon');
    expect(greetingFor(14, '')).toBe('Good afternoon');
    expect(greetingFor(14, '   ')).toBe('Good afternoon');
  });

  it('tidies stray spaces in the name', () => {
    expect(greetingFor(20, '  Surendar   V ')).toBe('Good evening, Surendar V');
  });
});
