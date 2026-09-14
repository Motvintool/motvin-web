/**
 * Motvin Reusable Tooltip System
 * -------------------------------------------------------------
 * How to use on any element:
 * 1) Add `data-tooltip="Your message"`
 * 2) Optional style attrs:
 *    - data-tooltip-position="top|bottom|left|right|top-left|top-right|bottom-left|bottom-right"
 *    - data-tooltip-color="black|white"
 *    - data-tooltip-size="small|medium|large"
 *
 * Example:
 * <button
 *   data-tooltip="Help Text"
 *   data-tooltip-position="left"
 *   data-tooltip-color="black"
 *   data-tooltip-size="medium"
 * >
 *   Hover me
 * </button>
 */

const TOOLTIP_OFFSET = 10;
const VIEWPORT_MARGIN = 8;
const CORNER_ARROW_OFFSET = 12;
const TOOLTIP_ARROW_SIZE = 12;
const TOOLTIP_ARROW_HALF = TOOLTIP_ARROW_SIZE / 2;

class TooltipController {
  constructor() {
    this.tooltipEl = null;
    this.cardEl = null;
    this.arrowEl = null;
    this.activeTarget = null;
    this.boundTargets = new WeakSet();

    this.handleWindowChange = this.handleWindowChange.bind(this);
    this.handleDocumentKeydown = this.handleDocumentKeydown.bind(this);
  }

  init() {
    // Create one global tooltip container and reuse it for all targets.
    if (!this.tooltipEl) {
      this.tooltipEl = document.createElement("div");
      this.tooltipEl.className = "motvin-tooltip";
      this.tooltipEl.setAttribute("role", "tooltip");
      this.tooltipEl.setAttribute("aria-hidden", "true");
      this.tooltipEl.innerHTML = `
        <div class="motvin-tooltip-card">
          <div class="motvin-tooltip-arrow" aria-hidden="true"></div>
          <span class="motvin-tooltip-text">
            <span class="motvin-tooltip-primary"></span>
            <span class="motvin-tooltip-secondary" hidden></span>
          </span>
        </div>
      `;
      document.body.appendChild(this.tooltipEl);
      this.cardEl = this.tooltipEl.querySelector(".motvin-tooltip-card");
      this.arrowEl = this.tooltipEl.querySelector(".motvin-tooltip-arrow");
      this.textEl = this.tooltipEl.querySelector(".motvin-tooltip-text");
      this.primaryTextEl = this.tooltipEl.querySelector(".motvin-tooltip-primary");
      this.secondaryTextEl = this.tooltipEl.querySelector(".motvin-tooltip-secondary");
    }

    this.refresh();

    window.addEventListener("scroll", this.handleWindowChange, true);
    window.addEventListener("resize", this.handleWindowChange, { passive: true });
    document.addEventListener("keydown", this.handleDocumentKeydown);
  }

  refresh(root = document) {
    // Scan DOM for tooltip-enabled elements.
    if (root?.matches?.("[data-tooltip]")) {
      this.bindTarget(root);
    }

    const targets = root.querySelectorAll?.("[data-tooltip]") || [];
    targets.forEach((target) => this.bindTarget(target));
  }

  bindTarget(target) {
    // Bind only once per element (avoids duplicate listeners).
    if (!target || this.boundTargets.has(target)) return;

    target.addEventListener("mouseenter", () => this.show(target));
    target.addEventListener("mouseleave", () => this.hide(target));
    target.addEventListener("focus", () => this.show(target));
    target.addEventListener("blur", () => this.hide(target));

    this.boundTargets.add(target);
  }

  show(target) {
    // Read tooltip text + variant config from data attributes.
    const text = String(target.getAttribute("data-tooltip") || "").trim();
    if (!text || !this.tooltipEl || !this.cardEl || !this.arrowEl || !this.textEl || !this.primaryTextEl || !this.secondaryTextEl) {
      this.hide(target);
      return;
    }

    this.activeTarget = target;

    const secondaryText = String(target.getAttribute("data-tooltip-secondary") || "").trim();
    const variant = String(target.getAttribute("data-tooltip-variant") || "").trim().toLowerCase();
    const color = String(target.getAttribute("data-tooltip-color") || "black").toLowerCase();
    const size = String(target.getAttribute("data-tooltip-size") || "small").toLowerCase();
    const placement = String(target.getAttribute("data-tooltip-position") || "top").toLowerCase();

    this.tooltipEl.dataset.color = ["black", "white"].includes(color) ? color : "black";
    this.tooltipEl.dataset.size = ["small", "medium", "large"].includes(size) ? size : "small";
    this.tooltipEl.dataset.position = placement;
    if (variant) {
      this.tooltipEl.dataset.variant = variant;
    } else {
      delete this.tooltipEl.dataset.variant;
    }

    this.primaryTextEl.textContent = text;
    this.secondaryTextEl.textContent = secondaryText;
    this.secondaryTextEl.hidden = !secondaryText;
    this.tooltipEl.setAttribute("aria-hidden", "false");
    this.tooltipEl.classList.add("is-visible");

    this.place(target, placement);
  }

  hide(target = null) {
    if (target && this.activeTarget && target !== this.activeTarget) {
      return;
    }

    if (!this.tooltipEl) return;

    this.activeTarget = null;
    this.tooltipEl.classList.remove("is-visible");
    this.tooltipEl.setAttribute("aria-hidden", "true");
  }

  handleWindowChange() {
    if (!this.activeTarget || !this.tooltipEl?.classList.contains("is-visible")) return;
    const placement = this.tooltipEl.dataset.position || "top";
    this.place(this.activeTarget, placement);
  }

  handleDocumentKeydown(event) {
    if (event.key === "Escape") {
      this.hide();
    }
  }

  place(target, placement) {
    // Compute tooltip position from target rect + requested placement,
    // then clamp into viewport so it never renders off-screen.
    const targetRect = target.getBoundingClientRect();
    const tooltipRect = this.tooltipEl.getBoundingClientRect();

    const centerX = targetRect.left + targetRect.width / 2;
    const centerY = targetRect.top + targetRect.height / 2;

    let x = centerX - tooltipRect.width / 2;
    let y = targetRect.top - tooltipRect.height - TOOLTIP_OFFSET;

    if (placement === "bottom") {
      y = targetRect.bottom + TOOLTIP_OFFSET;
    } else if (placement === "left") {
      x = targetRect.left - tooltipRect.width - TOOLTIP_OFFSET;
      y = centerY - tooltipRect.height / 2;
    } else if (placement === "right") {
      x = targetRect.right + TOOLTIP_OFFSET;
      y = centerY - tooltipRect.height / 2;
    } else if (placement === "top-left") {
      x = targetRect.left;
      y = targetRect.top - tooltipRect.height - TOOLTIP_OFFSET;
    } else if (placement === "top-right") {
      x = targetRect.right - tooltipRect.width;
      y = targetRect.top - tooltipRect.height - TOOLTIP_OFFSET;
    } else if (placement === "bottom-left") {
      x = targetRect.left;
      y = targetRect.bottom + TOOLTIP_OFFSET;
    } else if (placement === "bottom-right") {
      x = targetRect.right - tooltipRect.width;
      y = targetRect.bottom + TOOLTIP_OFFSET;
    }

    const maxX = window.innerWidth - tooltipRect.width - VIEWPORT_MARGIN;
    const maxY = window.innerHeight - tooltipRect.height - VIEWPORT_MARGIN;
    x = Math.min(Math.max(VIEWPORT_MARGIN, x), Math.max(VIEWPORT_MARGIN, maxX));
    y = Math.min(Math.max(VIEWPORT_MARGIN, y), Math.max(VIEWPORT_MARGIN, maxY));

    this.tooltipEl.style.left = `${x}px`;
    this.tooltipEl.style.top = `${y}px`;

    this.placeArrow(target, targetRect, { x, y, width: tooltipRect.width, height: tooltipRect.height }, placement);
  }

  placeArrow(target, targetRect, tooltipRect, placement) {
    // Position arrow based on placement variant.
    if (!this.arrowEl) return;

    const isTop = placement.startsWith("top") || placement === "top";
    const isBottom = placement.startsWith("bottom") || placement === "bottom";
    const isLeft = placement === "left";
    const isRight = placement === "right";
    const arrowOffsetY = Number.parseFloat(target?.dataset?.tooltipArrowOffsetY || "0");
    const safeArrowOffsetY = Number.isFinite(arrowOffsetY) ? arrowOffsetY : 0;

    this.arrowEl.style.top = "";
    this.arrowEl.style.bottom = "";
    this.arrowEl.style.left = "";
    this.arrowEl.style.right = "";
    this.arrowEl.style.transform = "rotate(45deg)";

    if (isTop) {
      this.arrowEl.style.bottom = "-6px";
    } else if (isBottom) {
      this.arrowEl.style.top = "-6px";
    } else if (isLeft) {
      this.arrowEl.style.right = "-6px";
    } else if (isRight) {
      this.arrowEl.style.left = "-6px";
    }

    if (placement === "top-left" || placement === "bottom-left") {
      this.arrowEl.style.left = `${CORNER_ARROW_OFFSET}px`;
    } else if (placement === "top-right" || placement === "bottom-right") {
      this.arrowEl.style.right = `${CORNER_ARROW_OFFSET}px`;
    } else if (isLeft || isRight) {
      this.arrowEl.style.top = `calc(50% + ${safeArrowOffsetY}px)`;
      this.arrowEl.style.transform = "translateY(-50%) rotate(45deg)";
    } else {
      const arrowX = targetRect.left + targetRect.width / 2 - tooltipRect.x - TOOLTIP_ARROW_HALF;
      this.arrowEl.style.left = `${Math.max(8, Math.min(tooltipRect.width - 20, arrowX))}px`;
    }
  }
}

const tooltipController = new TooltipController();

const startTooltipController = () => tooltipController.init();

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startTooltipController, { once: true });
} else {
  startTooltipController();
}

window.MotvinTooltip = {
  // Re-scan dynamic DOM after rendering new elements.
  refresh(root = document) {
    tooltipController.refresh(root);
  },
  show(target) {
    tooltipController.show(target);
  },
  hide(target) {
    tooltipController.hide(target);
  },
};
