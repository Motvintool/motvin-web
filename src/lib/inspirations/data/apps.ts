import type { Industry, Platform, ScreenType, Style } from '../types';

/**
 * Source catalogue the mock library is generated from. Every app here is
 * fictional — the screens are procedurally rendered from these definitions,
 * so nothing is copied from a real product.
 *
 * `screens` lists which screen types exist per platform; the builder turns
 * each entry into a Screen with a stable id, name, palette and tag set.
 */

export type AppSeed = {
  name: string;
  industry: Industry;
  platforms: Platform[];
  /** Brand accent, used on the logo mark and inside the mock screens. */
  accent: string;
  /** Base visual language of the product. */
  style: Style[];
  /** Whether the product's UI is dark by default. */
  dark: boolean;
  website: string;
  tagline: string;
  screens: Partial<Record<Platform, ScreenType[]>>;
};

export const APP_SEEDS: AppSeed[] = [
  {
    name: 'Ledgerly',
    industry: 'fintech',
    platforms: ['ios', 'web'],
    accent: '#2f6bff',
    style: ['minimal', 'light'],
    dark: false,
    website: 'https://ledgerly.example',
    tagline: 'Everyday banking, redesigned.',
    screens: {
      ios: ['onboarding', 'login', 'dashboard', 'search', 'settings', 'profile', 'other'],
      web: ['landing', 'dashboard', 'pricing', 'settings'],
    },
  },
  {
    name: 'Halcyon',
    industry: 'ai',
    platforms: ['web'],
    accent: '#8b5cf6',
    style: ['dark', 'minimal'],
    dark: true,
    website: 'https://halcyon.example',
    tagline: 'Your research copilot.',
    screens: {
      web: ['landing', 'login', 'signup', 'dashboard', 'search', 'pricing', 'settings', 'other'],
    },
  },
  {
    name: 'Cartwell',
    industry: 'ecommerce',
    platforms: ['web', 'android'],
    accent: '#e0542a',
    style: ['bold', 'light'],
    dark: false,
    website: 'https://cartwell.example',
    tagline: 'The storefront that sells itself.',
    screens: {
      web: ['landing', 'search', 'product', 'checkout', 'profile', 'other'],
      android: ['feed', 'search', 'product', 'checkout', 'profile'],
    },
  },
  {
    name: 'Northbeam',
    industry: 'saas',
    platforms: ['web'],
    accent: '#0ea5a3',
    style: ['corporate', 'minimal'],
    dark: false,
    website: 'https://northbeam.example',
    tagline: 'Analytics your whole team can read.',
    screens: {
      web: ['landing', 'login', 'dashboard', 'pricing', 'settings', 'search', 'other'],
    },
  },
  {
    name: 'Tideline',
    industry: 'travel',
    platforms: ['ios', 'android', 'web'],
    accent: '#0284c7',
    style: ['editorial', 'light'],
    dark: false,
    website: 'https://tideline.example',
    tagline: 'Plan trips that feel like stories.',
    screens: {
      ios: ['onboarding', 'feed', 'search', 'product', 'checkout', 'profile'],
      android: ['feed', 'search', 'product'],
      web: ['landing', 'search', 'product'],
    },
  },
  {
    name: 'Pulsewell',
    industry: 'healthcare',
    platforms: ['ios', 'android'],
    accent: '#16a34a',
    style: ['minimal', 'light'],
    dark: false,
    website: 'https://pulsewell.example',
    tagline: 'Care that keeps up with you.',
    screens: {
      ios: ['onboarding', 'login', 'dashboard', 'feed', 'settings', 'profile', 'other'],
      android: ['onboarding', 'dashboard', 'settings'],
    },
  },
  {
    name: 'Quill',
    industry: 'productivity',
    platforms: ['web', 'ios'],
    accent: '#111827',
    style: ['minimal', 'editorial'],
    dark: false,
    website: 'https://quill.example',
    tagline: 'Notes with nothing in the way.',
    screens: {
      web: ['landing', 'login', 'dashboard', 'search', 'pricing', 'settings'],
      ios: ['onboarding', 'feed', 'search', 'settings'],
    },
  },
  {
    name: 'Vantage',
    industry: 'finance',
    platforms: ['web', 'ios'],
    accent: '#22c55e',
    style: ['dark', 'bold'],
    dark: true,
    website: 'https://vantage.example',
    tagline: 'Invest with clarity.',
    screens: {
      web: ['landing', 'dashboard', 'search', 'settings', 'other'],
      ios: ['login', 'dashboard', 'search', 'product', 'profile', 'other'],
    },
  },
  {
    name: 'Mosaic',
    industry: 'social',
    platforms: ['ios', 'android'],
    accent: '#ec4899',
    style: ['playful', 'light'],
    dark: false,
    website: 'https://mosaic.example',
    tagline: 'Share the small moments.',
    screens: {
      ios: ['onboarding', 'signup', 'feed', 'search', 'profile', 'settings', 'other'],
      android: ['feed', 'profile', 'search'],
    },
  },
  {
    name: 'Brightpath',
    industry: 'education',
    platforms: ['web', 'android'],
    accent: '#f59e0b',
    style: ['playful', 'bold'],
    dark: false,
    website: 'https://brightpath.example',
    tagline: 'Learn a little every day.',
    screens: {
      web: ['landing', 'signup', 'dashboard', 'search', 'pricing', 'product'],
      android: ['onboarding', 'dashboard', 'feed', 'profile'],
    },
  },
  {
    name: 'Forge',
    industry: 'saas',
    platforms: ['web'],
    accent: '#f97316',
    style: ['dark', 'experimental'],
    dark: true,
    website: 'https://forge.example',
    tagline: 'Ship infrastructure without the ceremony.',
    screens: {
      web: ['landing', 'login', 'dashboard', 'settings', 'pricing', 'search', 'other'],
    },
  },
  {
    name: 'Kindred',
    industry: 'healthcare',
    platforms: ['web', 'ios'],
    accent: '#7c3aed',
    style: ['corporate', 'light'],
    dark: false,
    website: 'https://kindred.example',
    tagline: 'Telehealth for families.',
    screens: {
      web: ['landing', 'login', 'dashboard', 'settings', 'checkout'],
      ios: ['onboarding', 'dashboard', 'feed', 'profile'],
    },
  },
  {
    name: 'Orbit Pay',
    industry: 'fintech',
    platforms: ['android', 'ios'],
    accent: '#06b6d4',
    style: ['dark', 'minimal'],
    dark: true,
    website: 'https://orbitpay.example',
    tagline: 'Send money at the speed of a tap.',
    screens: {
      android: ['onboarding', 'login', 'dashboard', 'search', 'checkout', 'profile', 'other'],
      ios: ['dashboard', 'checkout', 'settings'],
    },
  },
  {
    name: 'Lumen',
    industry: 'ai',
    platforms: ['web', 'ios'],
    accent: '#a3e635',
    style: ['dark', 'experimental'],
    dark: true,
    website: 'https://lumen.example',
    tagline: 'Generate, edit, and ship visuals.',
    screens: {
      web: ['landing', 'dashboard', 'search', 'pricing', 'product', 'other'],
      ios: ['onboarding', 'feed', 'product', 'profile'],
    },
  },
  {
    name: 'Harbor',
    industry: 'productivity',
    platforms: ['web'],
    accent: '#3b82f6',
    style: ['corporate', 'minimal'],
    dark: false,
    website: 'https://harbor.example',
    tagline: 'Project management for calm teams.',
    screens: {
      web: ['landing', 'login', 'dashboard', 'search', 'settings', 'pricing', 'other'],
    },
  },
  {
    name: 'Sprout',
    industry: 'ecommerce',
    platforms: ['ios', 'web'],
    accent: '#65a30d',
    style: ['playful', 'light'],
    dark: false,
    website: 'https://sprout.example',
    tagline: 'Groceries, grown for you.',
    screens: {
      ios: ['onboarding', 'feed', 'search', 'product', 'checkout', 'profile', 'other'],
      web: ['landing', 'product', 'checkout'],
    },
  },
  {
    name: 'Atlas Learn',
    industry: 'education',
    platforms: ['web', 'ios'],
    accent: '#dc2626',
    style: ['editorial', 'light'],
    dark: false,
    website: 'https://atlaslearn.example',
    tagline: 'Courses from people who do the work.',
    screens: {
      web: ['landing', 'search', 'product', 'pricing', 'dashboard'],
      ios: ['onboarding', 'dashboard', 'product', 'settings'],
    },
  },
  {
    name: 'Nomad',
    industry: 'travel',
    platforms: ['android', 'ios'],
    accent: '#d946ef',
    style: ['bold', 'dark'],
    dark: true,
    website: 'https://nomad.example',
    tagline: 'Stay anywhere, work everywhere.',
    screens: {
      android: ['onboarding', 'feed', 'search', 'product', 'checkout', 'profile'],
      ios: ['feed', 'search', 'product'],
    },
  },
  {
    name: 'Cinder',
    industry: 'social',
    platforms: ['web', 'ios'],
    accent: '#ef4444',
    style: ['dark', 'bold'],
    dark: true,
    website: 'https://cinder.example',
    tagline: 'Communities for creators.',
    screens: {
      web: ['landing', 'feed', 'search', 'profile', 'settings'],
      ios: ['login', 'feed', 'search', 'profile', 'other'],
    },
  },
  {
    name: 'Meridian',
    industry: 'finance',
    platforms: ['web'],
    accent: '#0f766e',
    style: ['corporate', 'minimal'],
    dark: false,
    website: 'https://meridian.example',
    tagline: 'Treasury software for finance teams.',
    screens: {
      web: ['landing', 'login', 'dashboard', 'search', 'settings', 'pricing', 'other'],
    },
  },
  {
    name: 'Fieldnote',
    industry: 'saas',
    platforms: ['ios', 'web'],
    accent: '#b45309',
    style: ['editorial', 'minimal'],
    dark: false,
    website: 'https://fieldnote.example',
    tagline: 'Customer research, organised.',
    screens: {
      ios: ['onboarding', 'login', 'feed', 'search', 'settings'],
      web: ['landing', 'dashboard', 'search', 'pricing'],
    },
  },
  {
    name: 'Prism',
    industry: 'ai',
    platforms: ['web'],
    accent: '#14b8a6',
    style: ['minimal', 'light'],
    dark: false,
    website: 'https://prism.example',
    tagline: 'Chat with your data.',
    screens: {
      web: ['landing', 'signup', 'dashboard', 'search', 'pricing', 'settings', 'other'],
    },
  },
  {
    name: 'Stride',
    industry: 'healthcare',
    platforms: ['ios', 'android'],
    accent: '#f43f5e',
    style: ['bold', 'dark'],
    dark: true,
    website: 'https://stride.example',
    tagline: 'Training plans that adapt.',
    screens: {
      ios: ['onboarding', 'dashboard', 'feed', 'profile', 'settings', 'other'],
      android: ['dashboard', 'feed', 'profile'],
    },
  },
  {
    name: 'Parcel',
    industry: 'ecommerce',
    platforms: ['web', 'android'],
    accent: '#4f46e5',
    style: ['corporate', 'light'],
    dark: false,
    website: 'https://parcel.example',
    tagline: 'Shipping for modern brands.',
    screens: {
      web: ['landing', 'login', 'dashboard', 'search', 'checkout', 'settings', 'pricing'],
      android: ['login', 'dashboard', 'search', 'other'],
    },
  },
];
