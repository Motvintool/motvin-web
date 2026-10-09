import type { Metadata } from 'next';
import { CONTACT_EMAIL, LegalPage } from '@/components/legal/LegalPage';

export const metadata: Metadata = {
  title: 'Privacy Policy — Motvin',
  description: 'What Motvin collects, why, and the choices you have.',
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      current="/privacy"
      emphasis="By using Motvin you accept the practices described below."
      intro="Motvin is a library of app and website designs. This page explains, in plain words, what we keep about you when you use it, and what you can do about it."
      sections={[
        {
          title: 'What we collect',
          body: (
            <>
              <ul>
                <li>
                  <strong>Your account.</strong> When you sign up or log in, your email address, name and profile picture (from Google, if you use Google
                  sign-in). If you browse without an account, we start an anonymous guest session so your actions can be told apart; it holds no personal
                  details.
                </li>
                <li>
                  <strong>What you save.</strong> Collections and bookmarks you create, and ratings you give to apps.
                </li>
                <li>
                  <strong>App requests.</strong> The app name, platform, link and note you send when you ask us to add an app, plus your email if you choose
                  to give one. Each request is stored with your account ID so you can edit or delete it.
                </li>
                <li>
                  <strong>Basic usage data.</strong> Standard technical information such as pages visited and device type, used to keep the site working
                  and to see which parts people use.
                </li>
              </ul>
            </>
          ),
        },
        {
          title: 'How we use it',
          body: (
            <ul>
              <li>To run your account and keep your collections, ratings and requests available on every device you log in from.</li>
              <li>To decide which apps to add to the library next, and to tell you when one you asked for arrives, if you left an email.</li>
              <li>To fix problems, prevent abuse and improve Motvin.</li>
            </ul>
          ),
        },
        {
          title: 'Where it is kept',
          body: (
            <p>
              Account sign-in and your saved data are handled by Google Firebase (Authentication and Cloud Firestore). The design library itself is served
              from Motvin&rsquo;s own servers. We do not sell your personal information, and we do not share it with advertisers.
            </p>
          ),
        },
        {
          title: 'Cookies and local storage',
          body: (
            <p>
              Your browser keeps small items for the site to work: your login session, your theme choice, your recent searches and a counter that stops
              the request form being used too quickly. You can clear these in your browser settings; you may need to log in again afterwards.
            </p>
          ),
        },
        {
          title: 'Your choices',
          body: (
            <ul>
              <li>
                <strong>See and edit.</strong> Your name and your app requests are in Settings.
              </li>
              <li>
                <strong>Delete.</strong> You can delete any request, and you can delete your whole account from Settings. Deleting your account removes
                your requests too.
              </li>
              <li>
                <strong>Ask us.</strong> For anything else, such as a copy of what we hold, write to <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
              </li>
            </ul>
          ),
        },
        {
          title: 'Children',
          body: <p>Motvin is meant for people who are 13 or older. If you think a younger child has given us information, tell us and we will remove it.</p>,
        },
        {
          title: 'Changes',
          body: <p>If this page changes in a way that matters, we will update the date at the top. Using Motvin after that means you accept the new version.</p>,
        },
        {
          title: 'Contact',
          body: (
            <p>
              Questions about privacy: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
            </p>
          ),
        },
      ]}
    />
  );
}
