'use client';

import { useId, useState } from 'react';

/**
 * FAQ accordion, styled like the Inspirations sections above it. One item
 * open at a time; clicking the open item closes it.
 */

const FAQ_ITEMS = [
  {
    question: 'What exactly is Motvin?',
    answer:
      'Motvin is an advanced design tool that allows you to easily capture and customize live websites directly into your canvas.',
  },
  {
    question: 'Why do I need to sign in with Google?',
    answer:
      'Signing in with Google ensures your projects are safely stored and synced across your devices effortlessly.',
  },
  {
    question: 'Can I use Motvin without signing in?',
    answer:
      "Currently, an account is required to use Motvin's core features so we can securely save your work.",
  },
  {
    question: 'Is Motvin free to use?',
    answer:
      'We offer a free tier with core functionalities. Premium features are available through our subscription plans.',
  },
  {
    question: 'What can the AI Color Palette Generator do?',
    answer:
      'It automatically extracts and generates stunning, accessible color palettes from any website or image you import.',
  },
  {
    question: 'How does website-to-design conversion work?',
    answer:
      'With just a single click, our engine parses the live HTML and CSS of a webpage and converts it into fully editable design layers.',
  },
];

const COMMUNITY_URL = 'https://chat.whatsapp.com/JxLUrQpNpaXJ4ido6muIW6?s=cl&p=i&ilr=4';

export function Faq() {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const baseId = useId();

  return (
    <section className="lpi-faq" id="faq-section">
      <div className="lpi-faq-inner">
        <div className="lpi-faq-intro">
          <p className="lpi-eyebrow">FAQ</p>
          <h2 className="lpi-title">Need help? Find what you need.</h2>
          <p className="lpi-faq-help">
            Still have a question?{' '}
            <a href={COMMUNITY_URL} target="_blank" rel="noopener noreferrer">
              Ask the community
            </a>
          </p>
        </div>

        <div className="lpi-faq-list">
          {FAQ_ITEMS.map((item, index) => {
            const open = index === activeIndex;
            const answerId = `${baseId}-answer-${index}`;
            return (
              <div className={`lpi-faq-item${open ? ' is-open' : ''}`} key={item.question}>
                <button
                  type="button"
                  className="lpi-faq-question"
                  aria-expanded={open}
                  aria-controls={answerId}
                  onClick={() => setActiveIndex((prev) => (prev === index ? null : index))}
                >
                  {item.question}
                  <span className="lpi-faq-icon" aria-hidden="true" />
                </button>
                <div className="lpi-faq-answer" id={answerId} role="region" aria-hidden={!open}>
                  <div>
                    <p>{item.answer}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
