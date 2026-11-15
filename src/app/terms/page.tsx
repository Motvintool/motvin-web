import type { Metadata } from 'next';
import { CONTACT_EMAIL, LegalPage } from '@/components/legal/LegalPage';

export const metadata: Metadata = {
  title: 'Terms — Motvin',
  description: 'The rules for using Motvin.',
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      current="/terms"
      emphasis="By using Motvin you agree to these terms."
      intro="These are the rules for using Motvin. By using the site you agree to them. If you do not agree, please do not use it."
      sections={[
        {
          title: 'What Motvin is',
          body: (
            <p>
              Motvin is a searchable library of screens, flows and patterns from apps and websites, for learning and inspiration. We add to it all the time
              and may change or remove parts of it.
            </p>
          ),
        },
        {
          title: 'Your account',
          body: (
            <ul>
              <li>Give accurate details and keep your login to yourself. You are responsible for what happens under your account.</li>
              <li>You must be 13 or older to use Motvin.</li>
              <li>You can delete your account at any time from Settings.</li>
            </ul>
          ),
        },
        {
          title: 'Using the library',
          body: (
            <>
              <p>The screens in the library belong to the companies and designers who made them (see Copyrights). You may:</p>
              <ul>
                <li>Browse, search and save screens for your own research and inspiration.</li>
                <li>Download a screen only where the site offers a download for it, and only as that screen&rsquo;s licence allows.</li>
              </ul>
              <p>You may not copy the library in bulk, scrape it, resell it, or present anyone else&rsquo;s design as your own.</p>
            </>
          ),
        },
        {
          title: 'What you send us',
          body: (
            <p>
              When you submit something, such as an app request or a rating, you let Motvin use it to run and improve the library. Do not send anything
              unlawful, abusive, or that you do not have the right to share. We may remove submissions that break these rules.
            </p>
          ),
        },
        {
          title: 'Acceptable use',
          body: (
            <ul>
              <li>Do not try to break, overload or get around the security of the site.</li>
              <li>Do not use it to harass others or to break the law.</li>
              <li>We may suspend an account that does.</li>
            </ul>
          ),
        },
        {
          title: 'No guarantees',
          body: (
            <p>
              Motvin is provided &ldquo;as is&rdquo;. We work to keep it correct and available but do not promise it will be error-free or always online.
              The information about apps, such as ratings and rankings, comes from public sources and may be out of date.
            </p>
          ),
        },
        {
          title: 'Limits on our responsibility',
          body: (
            <p>
              To the extent the law allows, Motvin is not responsible for indirect or consequential losses arising from your use of the site. Nothing here
              limits any right you have by law that cannot be limited.
            </p>
          ),
        },
        {
          title: 'Changes',
          body: <p>We may update these terms. When we do, we will change the date at the top. Using Motvin after that means you accept the new terms.</p>,
        },
        {
          title: 'Contact',
          body: (
            <p>
              Questions about these terms: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
            </p>
          ),
        },
      ]}
    />
  );
}
