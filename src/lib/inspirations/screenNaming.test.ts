import { describe, expect, it } from 'vitest';
import { flowOfScreen, screenLabel, screenTitle, screenTitleIn, screenTrail, storeShotLabel } from './screenNaming';

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

describe('screenLabel', () => {
  it('names the app, the screen and where it is from', () => {
    expect(screenLabel({ screenType: 'login', platform: 'webapp' }, 'Coursera')).toBe('Coursera — Login screen (Web App)');
    expect(screenLabel({ screenType: 'onboarding', platform: 'ios' }, 'Arattai')).toBe('Arattai — Onboarding screen (iOS)');
  });
  it('calls a website page and section what they are', () => {
    expect(screenLabel({ platform: 'site', site: { kind: 'page', pageType: 'pricing' } }, 'Stripe')).toBe('Stripe — Pricing Page (Website)');
    expect(screenLabel({ platform: 'site', site: { kind: 'section', sectionType: 'hero' } }, 'Stripe')).toBe('Stripe — Hero section (Website)');
  });
  it('uses an "Other" screen\'s own name', () => {
    expect(screenLabel({ name: 'Onboarding sharing', screenType: 'other', platform: 'ios' }, 'Notion')).toBe('Notion — Onboarding sharing screen (iOS)');
  });
  it('leaves out what it does not know', () => {
    expect(screenLabel({ screenType: 'login', platform: 'ios' })).toBe('Login screen (iOS)');
    expect(screenLabel({ screenType: 'login' }, 'Coursera')).toBe('Coursera — Login screen');
    expect(screenLabel({}, null)).toBe('Screen');
  });
});

describe('storeShotLabel', () => {
  it('names the app, which screenshot and where it is from', () => {
    expect(storeShotLabel('Canva', 'appstore', 'ios', 1)).toBe('Canva — App Store screenshot 1 (iOS)');
    expect(storeShotLabel('Notion', 'manual', 'webapp', 2)).toBe('Notion — Screenshot 2 (Web App)');
  });
  it('leaves out a platform it does not know', () => {
    expect(storeShotLabel('Canva', 'appstore', '', 3)).toBe('Canva — App Store screenshot 3');
  });
});
