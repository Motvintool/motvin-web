/**
 * The two draggable widgets that float in over the hero as the page scrolls.
 * Pure markup ported from motvin-ui/index.html; HeroAnimations handles the
 * scroll-linked entrance and makes them draggable.
 */
export function ColorWidget() {
  return (
    <div className="color-widget">
      <div className="cw-header">
        <div className="cw-dot" style={{ backgroundColor: "#ff5b59" }}></div>
        <div className="cw-dot" style={{ backgroundColor: "#f5b900" }}></div>
        <div className="cw-dot" style={{ backgroundColor: "#0fc27b" }}></div>
      </div>
      <div className="cw-body">
        <div className="cw-title-bar">
          <div className="cw-title-content">
            <div className="cw-icon">✦</div>
            <p className="cw-title-text">AI Palettes Generator</p>
          </div>
        </div>
        <div className="cw-palette-container">
          <div className="cw-palette-grid">
            <div className="cw-palette-row first">
              <div className="cw-color-block" style={{ backgroundColor: "#09090b" }}></div>
              <div className="cw-color-block" style={{ backgroundColor: "#18181b" }}></div>
              <div className="cw-color-block" style={{ backgroundColor: "#27272a" }}></div>
              <div className="cw-color-block" style={{ backgroundColor: "#3f3f46" }}></div>
              <div className="cw-color-block" style={{ backgroundColor: "#52525b" }}></div>
            </div>
            <div className="cw-palette-row">
              <div
                className="cw-color-block border-top"
                style={{ backgroundColor: "#2e1065" }}
              ></div>
              <div
                className="cw-color-block border-top"
                style={{ backgroundColor: "#4c1d95" }}
              ></div>
              <div
                className="cw-color-block border-top"
                style={{ backgroundColor: "#5c4ae4" }}
              ></div>
              <div
                className="cw-color-block border-top"
                style={{ backgroundColor: "#9d8aff" }}
              ></div>
              <div
                className="cw-color-block border-top"
                style={{ backgroundColor: "#c4b8ff" }}
              ></div>
            </div>
            <div className="cw-palette-row">
              <div
                className="cw-color-block border-top"
                style={{ backgroundColor: "#ccc1ff" }}
              ></div>
              <div
                className="cw-color-block border-top"
                style={{ backgroundColor: "#8b7eee" }}
              ></div>
              <div
                className="cw-color-block border-top"
                style={{ backgroundColor: "#4f3daa" }}
              ></div>
              <div
                className="cw-color-block border-top"
                style={{ backgroundColor: "#6d4fff" }}
              ></div>
              <div
                className="cw-color-block border-top"
                style={{ backgroundColor: "#4322e2" }}
              ></div>
            </div>
            <div className="cw-palette-row">
              <div
                className="cw-color-block border-top"
                style={{ backgroundColor: "#e8e8e8" }}
              ></div>
              <div
                className="cw-color-block border-top"
                style={{ backgroundColor: "#d4d4d8" }}
              ></div>
              <div
                className="cw-color-block border-top"
                style={{ backgroundColor: "#a1a1aa" }}
              ></div>
              <div
                className="cw-color-block border-top"
                style={{ backgroundColor: "#71717a" }}
              ></div>
              <div
                className="cw-color-block border-top"
                style={{ backgroundColor: "#3f3f46" }}
              ></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function TypescaleWidget() {
  return (
    <div className="typescale-widget">
      <div className="cw-header">
        <div className="cw-dot" style={{ backgroundColor: "#ff5b59" }}></div>
        <div className="cw-dot" style={{ backgroundColor: "#f5b900" }}></div>
        <div className="cw-dot" style={{ backgroundColor: "#0fc27b" }}></div>
      </div>
      <div className="tw-top-container">
        <div className="tw-title-bar">
          <div className="tw-title-content">
            <div className="tw-icon">✦</div>
            <p className="tw-title-text">AI Typescale Generator</p>
          </div>
        </div>
      </div>
      <div className="tw-bottom-container">
        <div className="tw-row">
          <div className="tw-col-1">
            <p>Display</p>
          </div>
          <div className="tw-col-2">
            <p style={{ fontWeight: "bold", fontSize: "20px", lineHeight: "28px" }}>Motvin</p>
          </div>
          <div className="tw-col-3">
            <p>96px / -3%</p>
          </div>
        </div>
        <div className="tw-row">
          <div className="tw-col-1">
            <p>H1</p>
          </div>
          <div className="tw-col-2">
            <p style={{ fontWeight: "bold", fontSize: "16px", lineHeight: "22px" }}>Headline</p>
          </div>
          <div className="tw-col-3">
            <p>64px / -2.5%</p>
          </div>
        </div>
        <div className="tw-row">
          <div className="tw-col-1">
            <p>H2</p>
          </div>
          <div className="tw-col-2">
            <p style={{ fontWeight: "bold", fontSize: "12px", lineHeight: "17px" }}>Section</p>
          </div>
          <div className="tw-col-3">
            <p>48px / -2%</p>
          </div>
        </div>
        <div className="tw-row">
          <div className="tw-col-1">
            <p>H3</p>
          </div>
          <div className="tw-col-2">
            <p style={{ fontWeight: "bold", fontSize: "8px", lineHeight: "14px" }}>Subheading</p>
          </div>
          <div className="tw-col-3">
            <p>32px / -1.5%</p>
          </div>
        </div>
        <div className="tw-row">
          <div className="tw-col-1">
            <p>Body</p>
          </div>
          <div className="tw-col-2">
            <p style={{ fontWeight: "normal", fontSize: "7px", lineHeight: "12px" }}>Paragraph</p>
          </div>
          <div className="tw-col-3">
            <p>16px / 1.6</p>
          </div>
        </div>
        <div className="tw-row">
          <div className="tw-col-1">
            <p>Small</p>
          </div>
          <div className="tw-col-2">
            <p style={{ fontWeight: "normal", fontSize: "7px", lineHeight: "10px" }}>Caption</p>
          </div>
          <div className="tw-col-3">
            <p>12px / 1.5</p>
          </div>
        </div>
      </div>
    </div>
  );
}
