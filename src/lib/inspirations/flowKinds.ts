/**
 * Standard flow kinds, as Mobbin has them: a fixed list every flow is tagged with (one kind each), whatever the
 * app itself calls the flow. "Logging in with email", "Sign in" and "Signing in with phone" are all Logging In,
 * so the search's Flows tab lists ~80 kinds, each across many apps, instead of a thousand one-off names. A flow
 * keeps its own name on its card; the kind is only for grouping. Each flow's kind lives in the backend's
 * data/inspirations/flow-kinds.json (keyed by flow id) and arrives on the flow as `kind`.
 */
export const FLOW_KIND_GROUPS = [
  {
    label: 'New User Experience',
    kinds: ['Onboarding', 'Taking a Tour', 'Creating Account', 'Setting Up Profile', 'Choosing Interests', 'Allowing Permissions', 'Finishing Setup'],
  },
  {
    label: 'Account Management',
    kinds: ['Logging In', 'Logging Out', 'Resetting Password', 'Verifying Account', 'Editing Profile', 'Switching Account', 'Deleting & Deactivating Account', 'Connecting Accounts & Apps'],
  },
  {
    label: 'Settings & Preferences',
    kinds: ['Browsing Settings', 'Changing Notification Settings', 'Changing Preferences', 'Privacy & Security', 'Managing Cookies & Consent'],
  },
  {
    label: 'Commerce & Finance',
    kinds: [
      'Starting a Free Trial',
      'Choosing a Plan & Subscribing',
      'Upgrading',
      'Managing Subscription & Billing',
      'Adding Payment Method',
      'Adding to Cart & Bag',
      'Checking Out & Paying',
      'Booking & Reserving',
      'Ordering',
      'Canceling Order & Refunding',
      'Sending & Receiving Money',
      'Tracking Order & Delivery',
    ],
  },
  {
    label: 'Browsing & Discovery',
    kinds: ['Browsing Home', 'Exploring & Discovering', 'Browsing a Category', 'Viewing Details', 'Browsing Library & Collections', 'Viewing a Profile', 'Browsing a Map', 'Viewing Notifications'],
  },
  {
    label: 'Search & Filtering',
    kinds: ['Searching', 'Filtering & Sorting', 'Scanning'],
  },
  {
    label: 'Creation & Editing',
    kinds: ['Creating a Post', 'Creating a Project', 'Creating with AI', 'Editing Content', 'Uploading Photos & Files', 'Organizing & Renaming', 'Deleting Content'],
  },
  {
    label: 'Communication & Social',
    kinds: ['Chatting & Messaging', 'Starting a Chat', 'Calling', 'Commenting & Replying', 'Following', 'Sharing', 'Inviting Friends', 'Reacting & Liking', 'Reporting & Blocking'],
  },
  {
    label: 'Media & Content',
    kinds: ['Watching Video', 'Playing Music & Audio', 'Reading', 'Downloading', 'Saving & Bookmarking'],
  },
  {
    label: 'Learning & Productivity',
    kinds: ['Taking a Lesson', 'Tracking Progress', 'Setting Goals & Streaks', 'Setting Reminders', 'Managing Tasks', 'Managing Calendar & Events', 'Tracking Habits & Health'],
  },
  {
    label: 'AI Assistant',
    kinds: ['Asking AI', 'Using Voice Input', 'Choosing a Model or Voice', 'Connecting Tools & Plugins', 'Managing Chat History'],
  },
  {
    label: 'Help & Feedback',
    kinds: ['Getting Help', 'Contacting Support', 'Reading Help Articles', 'Giving Feedback', 'Rating the App'],
  },
] as const;

export type FlowKind = (typeof FLOW_KIND_GROUPS)[number]['kinds'][number];

/** Every kind, in the list's order. */
export const FLOW_KINDS: readonly FlowKind[] = FLOW_KIND_GROUPS.flatMap((group) => group.kinds);
