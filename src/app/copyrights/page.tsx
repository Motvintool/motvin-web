import type { Metadata } from 'next';
import { CONTACT_EMAIL, LegalPage } from '@/components/legal/LegalPage';

export const metadata: Metadata = {
  title: 'Copyrights — Motvin',
  description: 'Who owns what on Motvin, and how to ask for something to be changed or removed.',
};

export default function CopyrightsPage() {
  return (
    <LegalPage
      title="Copyrights"
      current="/copyrights"
      emphasis="Everything shown in the library belongs to its owners."
      intro="Who owns what on Motvin, and how to ask for something to be credited, changed or taken down."
      sections={[
        {
          title: 'Motvin',
          body: (
            <p>
              The Motvin name, logo, site design and the way the library is organised belong to Motvin. Please do not copy or reuse them without asking
              first.
            </p>
          ),
        },
        {
          title: 'Screens in the library',
          body: (
            <>
              <p>
                Every screen, logo and name shown in the library belongs to the company or designer who made it. They are shown for education, research
                and design inspiration. Their appearance here does not mean the owners endorse Motvin, or that Motvin is connected to them.
              </p>
              <p>
                Each screen is credited to its source. Where the owner has not allowed copies to be made, it is view-only and no download is offered.
              </p>
            </>
          ),
        },
        {
          title: 'Trademarks',
          body: <p>App names, logos and brand marks are the trademarks of their owners. They appear only to identify the products being shown.</p>,
        },
        {
          title: 'Ask for a change or removal',
          body: (
            <>
              <p>If you own something shown here and want it credited differently or taken down, write to us at <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> with:</p>
              <ul>
                <li>What it is, and the address of the page where it appears.</li>
                <li>How you can show it is yours, or that you act for its owner.</li>
                <li>What you would like us to do.</li>
              </ul>
              <p>We will look at every request promptly and remove material when the owner asks.</p>
            </>
          ),
        },
        {
          title: 'Things you send us',
          body: <p>You keep the rights to anything you submit. See the Terms for what you allow Motvin to do with it.</p>,
        },
      ]}
    />
  );
}
