'use client';

import { useId, useState } from 'react';

/**
 * FAQ accordion, styled like the Inspirations sections above it. One item
 * open at a time; clicking the open item closes it.
 */

const FAQ_ITEMS = [
  {
    question: 'What is Motvin Inspirations?',
    answer:
      'A library of real product design. Browse screens, flows and patterns from real apps and websites, and save the ones that inspire you.',
  },
  {
    question: 'Which platforms does it cover?',
    answer: 'iOS apps, web apps and websites, all in one place.',
  },
  {
    question: 'What is the difference between screens, flows and patterns?',
    answer:
      'A screen is a single page from an app. A flow is the steps of one task in order, like onboarding or checkout. Patterns group screens that solve the same design problem, such as empty states or paywalls.',
  },
  {
    question: 'How do I find something specific?',
    answer:
      'Search by app, screen type or UI element. You can also search for words that appear inside the screenshots themselves.',
  },
  {
    question: 'Can I save designs for later?',
    answer:
      'Yes. Save screens and flows into collections to keep your references organised. Sign in with Google or email and your collections sync across your devices.',
  },
  {
    question: 'Is Motvin Inspirations free?',
    answer:
      'Yes, it is free to explore. If an app you want is missing, send a request from your settings.',
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
