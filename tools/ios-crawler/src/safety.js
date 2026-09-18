/**
 * What the crawler refuses to do.
 *
 * The rule the whole tool is built around: it explores what an authorized
 * tester can already reach, and it stops at every access control rather than
 * trying to get past one. There is no credential store, no OTP reader, no
 * CAPTCHA solver, no receipt injection and no jailbreak path in this codebase,
 * and none should be added — a blocked branch is a correct outcome, not a bug
 * to work around.
 *
 * Two independent gates:
 *
 *   isBlockingScreen()  — the screen itself is an access control. Capture it
 *                         (a paywall is a legitimate design reference), record
 *                         why it stopped us, then abandon that branch.
 *   actionSafety()      — this individual control must not be touched, because
 *                         tapping it would spend money, destroy data, message a
 *                         real person, or try to authenticate.
 */

/**
 * Screen types that end a branch. The crawler still captures and classifies
 * them; it just never interacts with them.
 */
export const BLOCKING_SCREEN_TYPES = new Set([
  'login',
  'signup',
  'payment',
  'paywall',
  'permission',
  'checkout',
]);

/** Human-readable reason per blocking type, stored on the screen record. */
export const BLOCK_REASONS = {
  login: 'authentication screen — crawler does not sign in',
  signup: 'account creation screen — crawler does not register accounts',
  payment: 'payment entry — crawler does not enter payment details',
  paywall: 'subscription gate — crawler does not purchase or bypass',
  permission: 'system permission prompt — needs a human decision',
  checkout: 'checkout step — crawler does not place orders',
};

/**
 * Text that means an access control regardless of the classified screen type.
 * Matched against the screen's visible labels, so an OTP sheet that Claude
 * called "form" still stops the branch.
 */
const BLOCKING_TEXT = [
  /\bone[- ]?time (pass)?code\b/i,
  /\bverification code\b/i,
  /\benter the (\d+[- ])?digit\b/i,
  /\bOTP\b/,
  /\btwo[- ]?factor\b/i,
  /\b2FA\b/i,
  /\bcaptcha\b/i,
  /\bI'?m not a robot\b/i,
  /\bface ?id\b/i,
  /\btouch ?id\b/i,
  /\bpasscode\b/i,
  /\bsign in with (apple|google|facebook)\b/i,
  /\bstart (your )?free trial\b/i,
  /\bsubscribe to continue\b/i,
  /\brestore purchase/i,
  /\bapp store\b/i,
];

/**
 * Controls the crawler never taps. Split by why, because the log should say
 * which rule stopped it — "destructive" and "access control" are different
 * conversations with whoever reads the run report.
 */
const DENY = [
  { rule: 'purchase',      pattern: /\b(buy|purchase|pay|checkout|place order|order now|subscribe|upgrade|start (free )?trial|continue to payment|confirm (and )?pay|add payment|redeem)\b/i },
  { rule: 'destructive',   pattern: /\b(delete|remove|erase|clear all|reset|discard|unfollow|unfriend|block|report|deactivate|close account|cancel (subscription|order|booking))\b/i },
  { rule: 'outbound',      pattern: /\b(send|post|publish|share|tweet|comment|reply|submit|invite|call|email|book now|reserve|apply now|check ?out)\b/i },
  { rule: 'auth',          pattern: /\b(log ?in|sign ?in|log ?out|sign ?out|register|create account|sign ?up|continue with (apple|google|facebook|email)|forgot password|verify|authenticate)\b/i },
  { rule: 'system',        pattern: /\b(allow|don'?t allow|permit|grant access|open settings|not now|ask app not to track|allow tracking)\b/i },
  { rule: 'external',      pattern: /\b(open in safari|view in browser|terms|privacy policy|contact support|help ?cent(er|re)|rate (us|this app)|write a review)\b/i },
];

/**
 * Element roles that would type into or submit a credential. Never touched,
 * whatever the label says.
 */
const UNSAFE_ROLES = new Set(['SecureTextField', 'securetextfield', 'password']);

/**
 * Decides whether a screen ends its branch.
 * @returns {{blocked: boolean, reason: string|null}}
 */
export function isBlockingScreen(screen) {
  const type = screen.screenType;
  if (BLOCKING_SCREEN_TYPES.has(type)) {
    return { blocked: true, reason: BLOCK_REASONS[type] ?? `${type} screen` };
  }

  // Claude is asked to raise this directly when it sees a gate it cannot name.
  if (screen.blocked) {
    return { blocked: true, reason: screen.blockedReason || 'model flagged an access control' };
  }

  const haystack = [screen.name, screen.description, ...(screen.labels || [])].filter(Boolean).join(' • ');
  for (const pattern of BLOCKING_TEXT) {
    if (pattern.test(haystack)) {
      return { blocked: true, reason: `access control detected in screen text (${pattern.source})` };
    }
  }

  return { blocked: false, reason: null };
}

/**
 * Decides whether one control may be tapped.
 * @returns {{safe: boolean, rule: string|null}}
 */
export function actionSafety(element) {
  if (UNSAFE_ROLES.has(element.role)) {
    return { safe: false, rule: 'credential-field' };
  }
  if (element.kind === 'input') {
    // Typing is off by default; a text field is captured as a screen feature,
    // not driven. `--allow-typing` opts in for search fields only, handled by
    // the crawler rather than here.
    return { safe: false, rule: 'text-input' };
  }

  const label = `${element.label || ''} ${element.hint || ''}`.trim();
  if (!label) {
    // An unlabelled control is unknowable. Tapping one is how a crawler ends
    // up posting something, so unlabelled controls are skipped unless they are
    // structural (a tab or a list row, which carry their own labels anyway).
    return element.kind === 'tab' || element.kind === 'cell'
      ? { safe: true, rule: null }
      : { safe: false, rule: 'unlabelled' };
  }

  for (const { rule, pattern } of DENY) {
    if (pattern.test(label)) return { safe: false, rule };
  }

  return { safe: true, rule: null };
}

/**
 * The authorization gate. A crawl cannot start without an explicit record of
 * why this app may be captured — the same field sources.json requires before
 * anything publishes.
 */
export const PERMISSIONS = ['owner-granted', 'open-source', 'public-domain', 'own-work', 'fair-use-reference'];

export function assertAuthorized(appConfig, flags) {
  const auth = appConfig.authorization;
  const problems = [];

  if (!auth) {
    problems.push('app config has no "authorization" block');
  } else {
    if (!PERMISSIONS.includes(auth.permission)) {
      problems.push(`authorization.permission must be one of: ${PERMISSIONS.join(', ')}`);
    }
    if (!auth.authorizedBy) problems.push('authorization.authorizedBy is required — name the person or licence granting this');
    if (!auth.grantedAt) problems.push('authorization.grantedAt is required — the date permission was given');
  }

  if (!flags.authorized) {
    problems.push('pass --authorized to confirm you hold the rights recorded above');
  }

  if (problems.length) {
    const error = new Error(
      `Refusing to crawl "${appConfig.appId || 'unknown app'}":\n` +
        problems.map((p) => `  • ${p}`).join('\n') +
        '\n\nThis crawler is for apps you own, or have written permission or a licence to capture.',
    );
    error.authorization = true;
    throw error;
  }
}
