'use client';

import { useState } from 'react';

/**
 * FAQ accordion — port of #faq-section in motvin-ui/index.html and the
 * accordion handler in JS/index.js. One item open at a time; clicking the open
 * item closes it.
 *
 * The six items were identical markup repeated in the HTML, so they're data
 * here. `.faq-item-last` stays on the final item — the CSS uses it to drop the
 * bottom divider.
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

export function Faq() {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  return (
    <section className="faq-section" id="faq-section">
      <div className="faq-category">
        <span>Frequently &amp; Questions</span>
      </div>
      <div className="faq-container">
        <div className="faq-header">
          <p className="faq-subtitle">
            <span className="animated-word">Need</span>
            <span className="animated-word">help?</span>
          </p>
          <p className="faq-title">
            <span className="animated-word">Find</span>
            <span className="animated-word">what</span>
            <span className="animated-word">you</span>
            <span className="animated-word">need.</span>
          </p>
        </div>
        <div className="faq-list">
          {FAQ_ITEMS.map((item, index) => {
            const classes = ['faq-item'];
            if (index === FAQ_ITEMS.length - 1) classes.push('faq-item-last');
            if (index === activeIndex) classes.push('active');
            return (
              <div
                key={item.question}
                className={classes.join(' ')}
                onClick={() => setActiveIndex((prev) => (prev === index ? null : index))}
              >
                <div className="faq-question">
                  <p>{item.question}</p>
                  <img alt="" src="/ASSET/svg/figma-faq-toggle.svg" className="faq-icon" />
                </div>
                <div className="faq-answer">
                  <p>{item.answer}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
