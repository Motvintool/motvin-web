'use client';

import { AppsView } from './AppsView';

/**
 * /inspirations/new — the apps the admin picked in Library admin → Week’s new apps, in
 * the section being browsed (iOS, or Webs), behind the Apps page's own toolbar
 * (categories, sort, colour, filters). Nothing is added by itself.
 */
export function NewThisWeekView() {
  return <AppsView week />;
}
