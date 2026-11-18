'use client';

import { useId, useState } from 'react';
import { useLandingLibrary } from '@/components/landing/inspirations/useLandingLibrary';
import { FEATURED_CLIENT_IDS, getClient, type McpClient } from '@/lib/mcp/clients';
import { ClientGrid } from './ClientGrid';
import { McpHero } from './McpHero';

/**
 * The /mcp page's sections: the hero (McpHero), how connecting works, the
 * AI-tool cards that lead to each setup guide, what the tools do, example
 * questions and the FAQ. Reuses the landing page's heading classes; its own
 * classes are prefixed mcpp-.
 */

const featured = FEATURED_CLIENT_IDS.map(getClient).filter((client): client is McpClient => Boolean(client));

const TOOLS = [
  { name: 'Search screens', text: 'Describe a screen in plain words and get the matching ones from real apps, each with a preview the AI can look at.', ask: '"Show me 5 iOS paywalls with a yearly plan"' },
  { name: 'Search flows', text: 'Whole journeys, step by step: onboarding, checkout, sign-up, cancelling a subscription.', ask: '"How do food apps handle checkout?"' },
  { name: 'Text on screens', text: 'Find screens by the words printed on them: button labels, microcopy, headlines.', ask: '"Which apps say “cancel anytime” near the price?"' },
  { name: 'Similar screens', text: 'Start from one screen and see how other apps solved the same thing.', ask: '"Find screens like this empty state"' },
  { name: 'Apps and patterns', text: 'Every app in the library, and curated patterns such as progress steppers or permission primers.', ask: '"What onboarding patterns does Duolingo use?"' },
  { name: 'Platforms apart', text: 'iOS, Web Apps and Webs are separate libraries. Your AI compares them on purpose, never by accident.', ask: '"Compare the pricing page on web and iOS"' },
];

const PROMPTS = [
  'Design a paywall for our Pro plan, based on what works in fintech apps.',
  'Show me 10 empty-state screens from productivity apps.',
  'How do I ask for notification permission without getting denied?',
  'Compare how Airbnb and MakeMyTrip handle the booking flow.',
  'Find login screens that use a passkey or magic link.',
  'What do the best onboarding flows do in their first three screens?',
  'Which subscription apps show a free-trial timeline?',
  'How do banking apps confirm a money transfer?',
  'Find iOS settings screens with a dark mode toggle.',
  'Show web app dashboards with a first-run empty state.',
];

/** Two rows of prompts that slide in opposite directions. */
const PROMPT_ROWS = [PROMPTS.slice(0, 5), PROMPTS.slice(5)];

const CHAT_ICON = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z" />
  </svg>
);

const TICK_ICON = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);

/** One example prompt; a click copies it so it can be pasted into an AI tool. */
function PromptPill({ prompt, hidden }: { prompt: string; hidden: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <li aria-hidden={hidden || undefined}>
      <button
        type="button"
        className={`mcpp-prompt${copied ? ' is-copied' : ''}`}
        tabIndex={hidden ? -1 : undefined}
        title="Copy prompt"
        onClick={() => {
          void navigator.clipboard?.writeText(prompt).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          });
        }}
      >
        <span className="mcpp-prompt-icon">{copied ? TICK_ICON : CHAT_ICON}</span>
        {prompt}
        {/* Announce the copy without changing the pill's width (it would nudge the row). */}
        <span className="mcpp-sr" aria-live="polite">{copied ? 'Copied' : ''}</span>
      </button>
    </li>
  );
}

const FAQ = [
  { q: 'What is an MCP server?', a: 'MCP (Model Context Protocol) is the standard way to give an AI tool access to outside information. Motvin’s MCP server gives your AI the Motvin library: it can search screens and flows and look at them, the same way you do on motvin.com.' },
  { q: 'Which AI tools work with it?', a: 'Claude, Claude Code, Cursor, ChatGPT, Codex, VS Code and any other tool that supports MCP over HTTP with sign-in. Setup takes about a minute and needs no API key.' },
  { q: 'Do I need an account?', a: 'Yes. Your AI tool opens motvin.com, you sign in with your Motvin account and click Allow. Guest sessions cannot connect.' },
  { q: 'Is it the same library as the website?', a: 'Yes, exactly the same screens, flows, apps and patterns, searched by the same engine. Results come back with a small preview the AI can see, and a link to the screen on motvin.com.' },
  { q: 'Can the AI change anything in my account?', a: 'No. Every tool is read-only: the AI can search and read, not save, delete or change anything. Saving to your boards is coming later.' },
  { q: 'How do I disconnect?', a: 'From your AI tool’s settings: remove or disable the Motvin server. Access tokens expire on their own.' },
  { q: 'Is it free?', a: 'Yes, during the beta. Usage limits may come later; we will say so well in advance.' },
];

function formatCount(value: number): string {
  return value >= 1000 ? `${Math.floor(value / 1000)},${String(value % 1000).padStart(3, '0')}` : String(value);
}

export function McpLanding() {
  const { counts } = useLandingLibrary();
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const faqId = useId();

  return (
    <>
      <McpHero counts={counts} />

      <section className="mcpp-steps" aria-labelledby="mcpp-steps-title">
        <div className="lpi-heading">
          <h2 className="lpi-title" id="mcpp-steps-title">Set up in under a minute</h2>
          <p className="lpi-lead">Three steps, no API key. Your AI tool does most of them for you.</p>
        </div>
        <ol className="mcpp-steps-list">
          <li><b>1</b><h3>Add the address</h3><p>Paste Motvin&rsquo;s server address into your AI tool, or run one command.</p></li>
          <li><b>2</b><h3>Sign in and allow</h3><p>A browser window opens on motvin.com. Sign in and click Allow.</p></li>
          <li><b>3</b><h3>Ask</h3><p>&ldquo;Show me 5 fintech onboarding flows.&rdquo; Your AI searches Motvin and looks at real screens.</p></li>
        </ol>
      </section>

      <section className="mcpp-setup" id="mcp-setup" aria-labelledby="mcpp-setup-title">
        <div className="lpi-heading">
          <h2 className="lpi-title" id="mcpp-setup-title">Connect your tool</h2>
          <p className="lpi-lead">Pick your AI tool for a step-by-step guide.</p>
        </div>
        <ClientGrid clients={featured} bento />
      </section>

      <section className="mcpp-tools" id="mcp-tools" aria-labelledby="mcpp-tools-title">
        <div className="lpi-heading">
          <h2 className="lpi-title" id="mcpp-tools-title">Ask anything. Get real screens back.</h2>
          <p className="lpi-lead">Everything on motvin.com, available to your AI: {counts ? `${formatCount(counts.apps)} apps, ${formatCount(counts.screens)} screens, ${formatCount(counts.flows)} flows` : 'apps, screens and flows'}, with previews it can look at.</p>
        </div>
        {/* Three columns scrolling in a zigzag: up, down, up. Each column holds
            all six cards in a different order, twice over to close the loop;
            the second copy is hidden from screen readers. Hover pauses. */}
        <div className="mcpp-wall">
          {[0, 2, 4].map((offset, col) => {
            const column = [...TOOLS.slice(offset), ...TOOLS.slice(0, offset)];
            return (
              <ul key={offset} className={`mcpp-wall-col${col % 2 ? ' is-down' : ''}`} aria-hidden={col > 0 || undefined}>
                {[...column, ...column].map((tool, i) => (
                  <li key={`${tool.name}-${i}`} className="mcpp-tool" aria-hidden={i >= column.length || undefined}>
                    <h3>{tool.name}</h3>
                    <p>{tool.text}</p>
                    <span className="mcpp-tool-ask">{tool.ask}</span>
                  </li>
                ))}
              </ul>
            );
          })}
        </div>
      </section>

      <section className="mcpp-prompts" aria-labelledby="mcpp-prompts-title">
        <h2 className="mcpp-prompts-title" id="mcpp-prompts-title">Things people ask</h2>
        <p className="mcpp-prompts-hint">Click one to copy it.</p>
        {/* Two rows sliding in opposite directions, each twice over to close
            the loop; hover pauses. */}
        <div className="mcpp-prompt-rows">
          {PROMPT_ROWS.map((row, r) => (
            <ul key={r} className={`mcpp-prompt-row${r % 2 ? ' is-reverse' : ''}`}>
              {[...row, ...row].map((prompt, i) => (
                <PromptPill key={`${prompt}-${i}`} prompt={prompt} hidden={i >= row.length} />
              ))}
            </ul>
          ))}
        </div>
      </section>

      <section className="mcpp-faq" aria-labelledby="mcpp-faq-title">
        <div className="lpi-heading">
          <h2 className="lpi-title" id="mcpp-faq-title">Questions</h2>
        </div>
        <div className="mcpp-faq-list">
          {FAQ.map((item, index) => {
            const open = index === openFaq;
            const answerId = `${faqId}-${index}`;
            return (
              <div key={item.q} className={`mcpp-faq-item${open ? ' is-open' : ''}`}>
                <button type="button" className="mcpp-faq-q" aria-expanded={open} aria-controls={answerId} onClick={() => setOpenFaq(open ? null : index)}>
                  {item.q}
                  <span className="mcpp-faq-icon" aria-hidden="true" />
                </button>
                <div className="mcpp-faq-a" id={answerId} role="region" hidden={!open}>
                  <p>{item.a}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}
