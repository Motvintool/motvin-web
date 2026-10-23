import { describe, expect, it } from 'vitest';
import { flowOfScreen, screenTitle, screenTitleIn, screenTrail } from './screenNaming';

describe('screenTitle', () => {
  it('calls a typed screen by its type', () => {
    expect(screenTitle({ name: 'Email entry', screenType: 'form' })).toBe('Form');
  });
  it('calls an "Other" screen by its own name', () => {
    expect(screenTitle({ name: 'Onboarding sharing', screenType: 'other' })).toBe('Onboarding sharing');
  });
  it('falls back to the type, then a plain word', () => {
    expect(screenTitle({ name: '', screenType: 'other' })).toBe('Other');
    expect(screenTitle({})).toBe('Screen');
  });
});

describe('flowOfScreen and screenTrail', () => {
  const flows = [
    { id: 'child', name: 'Logging in with email', parentId: 'top', screenIds: ['a', 'b'] },
    { id: 'top', name: 'Onboarding', parentId: null, screenIds: ['a', 'b', 'c'] },
  ];
  it('prefers the top-level flow a screen is in', () => {
    expect(flowOfScreen(flows, 'a')?.name).toBe('Onboarding');
    expect(flowOfScreen(flows, 'z')).toBeNull();
  });
  it('reads app / flow / screen, skipping what is missing', () => {
    expect(screenTrail({ name: 'Notion' }, flows[1], { name: 'Onboarding sharing', screenType: 'other' })).toEqual(['Notion', 'Onboarding', 'Onboarding sharing']);
    expect(screenTrail({ name: 'Notion' }, null, { screenType: 'form' })).toEqual(['Notion', 'Form']);
  });
});

describe('screenTitleIn', () => {
  it('uses the screen\'s own name when its type would repeat the flow name', () => {
    expect(screenTitleIn({ name: 'Onboarding' }, { name: 'Onboarding sharing', screenType: 'onboarding' })).toBe('Onboarding sharing');
    expect(screenTrail({ name: 'Notion' }, { name: 'Onboarding' }, { name: 'Onboarding sharing', screenType: 'onboarding' })).toEqual(['Notion', 'Onboarding', 'Onboarding sharing']);
  });
  it('keeps the type otherwise', () => {
    expect(screenTitleIn({ name: 'Onboarding' }, { name: 'Email entry', screenType: 'form' })).toBe('Form');
  });
});
