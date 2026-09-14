/**
 * Community (WhatsApp) mega-menu. Markup ported verbatim from
 * motvin-ui/index.html (#community-dropdown).
 */
export function CommunityDropdown({ open }: { open: boolean }) {
  return (
    <div className={`community-dropdown${open ? ' active' : ''}`} id="community-dropdown">
      <div className="community-dropdown-container">
        <p className="dropdown-heading">Whatsapp Community</p>
        <div className="community-cards-grid">
          {/* Community Card 1 */}
          <a
            href="https://chat.whatsapp.com/JxLUrQpNpaXJ4ido6muIW6?s=cl&p=i&ilr=4"
            target="_blank"
            className="community-card"
          >
            <div className="community-icon-wrapper blue-tint">
              <div className="community-icon-inner">
                <img src="/ASSET/Icons/whatsapp-icon.svg" alt="Whatsapp" />
              </div>
            </div>
            <div className="community-card-content">
              <div className="community-card-text">
                <h4>Creative Mind&apos;s 1</h4>
                <p>Join our original designer community</p>
              </div>
              <div className="community-pill">
                <div className="community-avatars">
                  <img src="/ASSET/Images/pic1.webp" alt="Designer" />
                  <img src="/ASSET/Images/pic2.webp" alt="Designer" />
                  <img src="/ASSET/Images/pic3.webp" alt="Designer" />
                </div>
                <span className="community-count">2,000 Designers</span>
                <img
                  src="/ASSET/Icons/arrow-redirect.svg"
                  alt="Arrow"
                  className="community-pill-arrow"
                />
              </div>
            </div>
          </a>
          {/* Community Card 2 */}
          <a
            href="https://chat.whatsapp.com/KJDBfXpJLukHwo76xnoTSA?s=cl&p=i&ilr=4"
            target="_blank"
            className="community-card"
          >
            <div className="community-icon-wrapper purple-tint">
              <div className="community-icon-inner">
                <img src="/ASSET/Icons/whatsapp-icon1.svg" alt="Whatsapp" />
              </div>
            </div>
            <div className="community-card-content">
              <div className="community-card-text">
                <h4>Creative Mind&apos;s 2</h4>
                <p>Connect and grow with fellow designers</p>
              </div>
              <div className="community-pill">
                <div className="community-avatars">
                  <img src="/ASSET/Images/pic4.webp" alt="Designer" />
                  <img src="/ASSET/Images/pic5.webp" alt="Designer" />
                  <img src="/ASSET/Images/pic6.webp" alt="Designer" />
                </div>
                <span className="community-count">2,000 Designers</span>
                <img
                  src="/ASSET/Icons/arrow-redirect.svg"
                  alt="Arrow"
                  className="community-pill-arrow"
                />
              </div>
            </div>
          </a>
          {/* Community Card 3 */}
          <a
            href="https://chat.whatsapp.com/HP7TNbjBEE6CCfkGVMBqLA?s=cl&p=i&ilr=4"
            target="_blank"
            className="community-card"
          >
            <div className="community-icon-wrapper green-tint">
              <div className="community-icon-inner">
                <img src="/ASSET/Icons/whatsapp-icon2.svg" alt="Whatsapp" />
              </div>
            </div>
            <div className="community-card-content">
              <div className="community-card-text">
                <h4>Creative Mind&apos;s 3</h4>
                <p>A growing space for designers and creators</p>
              </div>
              <div className="community-pill">
                <div className="community-avatars">
                  <img src="/ASSET/Images/pic7.webp" alt="Designer" />
                  <img src="/ASSET/Images/pic8.webp" alt="Designer" />
                  <img src="/ASSET/Images/pic9.webp" alt="Designer" />
                </div>
                <span className="community-count">2,000 Designers</span>
                <img
                  src="/ASSET/Icons/arrow-redirect.svg"
                  alt="Arrow"
                  className="community-pill-arrow"
                />
              </div>
            </div>
          </a>
        </div>
      </div>
    </div>
  );
}
