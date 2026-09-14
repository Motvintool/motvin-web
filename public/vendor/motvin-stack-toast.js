window.StackToast = (function () {
  const componentId = "mi-stack-toast-component";
  const markup = `
    <div id="copy-toast-list" class="mi-copy-toast-list" aria-live="polite" aria-atomic="false">
      <div id="copy-stack-toast" class="mi-copy-toast" role="status">
        <span class="mi-copy-toast__back mi-copy-toast__back--far"></span>
        <span class="mi-copy-toast__back mi-copy-toast__back--near"></span>
        <div class="mi-copy-toast__front">
          <img class="mi-copy-toast__icon" src="ASSET/Icons/copied.svg" alt="" aria-hidden="true">
          <span class="mi-copy-toast__message">Copied to clipboard</span>
        </div>
      </div>
    </div>`;

  const styles = `
    .mi-copy-toast-list { position: fixed; inset: 0; z-index: 260; pointer-events: none; }
    .mi-copy-toast { position: fixed; bottom: 8px; left: 50%; width: min(356px, calc(100vw - 24px)); height: 82px; transform: translate(-50%, 10px) scale(1.06); transform-origin: bottom center; opacity: 0; pointer-events: none; z-index: 1; transition: opacity 200ms var(--mi-ease, ease), transform 200ms var(--mi-ease, ease); }
    .mi-copy-toast.is-visible { opacity: 1; transform: translate(-50%, 0) scale(1.06); }
    .mi-copy-toast.is-stack-dismissing { transition: none; }
    .mi-copy-toast__back, .mi-copy-toast__front { position: absolute; transform-origin: top left; box-sizing: border-box; border: 1px solid #ededed; border-radius: 8px; background: #fff; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); }
    .mi-copy-toast__back--far { display: none; top: 20.25px; left: 20px; width: 316px; height: 54px; }
    .mi-copy-toast__back--near { display: none; top: 10.25px; left: 10px; width: 336px; height: 54px; }
    .mi-copy-toast[data-stack-count="2"] .mi-copy-toast__back--near, .mi-copy-toast[data-stack-count="3"] .mi-copy-toast__back--near, .mi-copy-toast[data-stack-count="3"] .mi-copy-toast__back--far { display: block; }
    .mi-copy-toast.is-stack-recycling .mi-copy-toast__back--far { animation: mi-copy-toast-fade-out 320ms cubic-bezier(0.16, 1, 0.3, 1) both !important; }
    .mi-copy-toast.is-stack-shifting .mi-copy-toast__back--far { animation: mi-copy-toast-shift-to-far 420ms cubic-bezier(0.16, 1, 0.3, 1) both; }
    .mi-copy-toast.is-stack-shifting .mi-copy-toast__back--near { animation: mi-copy-toast-shift-to-near 420ms cubic-bezier(0.16, 1, 0.3, 1) both; }
    .mi-copy-toast.is-stack-shifting .mi-copy-toast__front { animation: mi-copy-toast-slide-down 420ms cubic-bezier(0.16, 1, 0.3, 1) both; }
    .mi-copy-toast.is-stack-dismissing[data-stack-count="3"] .mi-copy-toast__back--far { animation: mi-copy-toast-dismiss 200ms cubic-bezier(0.22, 0.61, 0.36, 1) forwards; }
    .mi-copy-toast.is-stack-dismissing[data-stack-count="3"] .mi-copy-toast__back--near { animation: mi-copy-toast-dismiss 200ms 220ms cubic-bezier(0.22, 0.61, 0.36, 1) forwards; }
    .mi-copy-toast.is-stack-dismissing[data-stack-count="3"] .mi-copy-toast__front { animation: mi-copy-toast-dismiss 200ms 640ms cubic-bezier(0.22, 0.61, 0.36, 1) forwards; }
    .mi-copy-toast__front { z-index: 3; top: 0; left: 0; width: 354px; height: 54px; display: flex; align-items: center; gap: 8px; padding: 16px 20px; overflow: visible; font-family: "Outfit", "Helvetica Neue", Helvetica, Arial, sans-serif; font-size: 14px; font-weight: 500; color: #171717; letter-spacing: 0; line-height: 19.5px; }
    .mi-copy-toast__icon { display: block; flex: 0 0 auto; overflow: visible; }
    @keyframes mi-copy-toast-fade-out { from { opacity: 1; transform: translate(0, 0); } to { opacity: 0; transform: translate(6px, 6px); } }
    @keyframes mi-copy-toast-shift-to-far { from { opacity: 0; transform: translate(-10px, -10px) scale(1.0633); } 25% { opacity: 1; } to { opacity: 1; transform: translate(0, 0) scale(1); } }
    @keyframes mi-copy-toast-shift-to-near { from { opacity: 1; transform: translate(-10px, -10.25px) scale(1.0536); } to { opacity: 1; transform: translate(0, 0) scale(1); } }
    @keyframes mi-copy-toast-slide-down { from { opacity: 0; transform: translateY(-64px); } 20% { opacity: 1; } to { opacity: 1; transform: translateY(0); } }
    @keyframes mi-copy-toast-dismiss { from { opacity: 1; transform: translate(0, 0); } to { opacity: 0; transform: translateY(-8px); } }
    @media (prefers-reduced-motion: reduce) { .mi-copy-toast, .mi-copy-toast * { animation: none !important; transition: none !important; } }
  `;

  function mount() {
    if (!document.getElementById(componentId)) {
      document.body.insertAdjacentHTML("beforeend", markup);
      const style = document.createElement("style");
      style.id = componentId;
      style.textContent = styles;
      document.head.appendChild(style);
    }
    return document.getElementById("copy-stack-toast");
  }

  function show(message = "Copied to clipboard") {
    const notification = mount();
    if (!notification) return;

    const label = notification.querySelector(".mi-copy-toast__message");
    if (label) label.textContent = message;

    const cycle = (show._cycle || 0) + 1;
    show._cycle = cycle;
    clearTimeout(show._dismissAnimationTimer);
    notification.style.visibility = "visible";
    const previousCount = Number.parseInt(notification.dataset.stackCount || "0", 10);
    const count = Math.min(3, previousCount + 1);
    const isRecycling = previousCount >= 3;
    notification.classList.remove("is-stack-recycling", "is-stack-shifting", "is-stack-dismissing");
    notification.dataset.stackCount = count;
    notification.classList.add("is-visible", isRecycling ? "is-stack-recycling" : "is-stack-shifting");
    clearTimeout(show._animationTimer);
    show._animationTimer = setTimeout(() => {
      if (show._cycle !== cycle) return;
      if (!isRecycling) return notification.classList.remove("is-stack-shifting");
      notification.classList.remove("is-stack-recycling");
      notification.classList.add("is-stack-shifting");
      show._animationTimer = setTimeout(() => {
        if (show._cycle === cycle) notification.classList.remove("is-stack-shifting");
      }, 420);
    }, isRecycling ? 100 : 420);
    clearTimeout(show._dismissTimer);
    show._dismissTimer = setTimeout(() => {
      if (show._cycle !== cycle) return;
      notification.classList.remove("is-stack-recycling", "is-stack-shifting");
      notification.classList.add("is-stack-dismissing");
      show._dismissAnimationTimer = setTimeout(() => {
        if (show._cycle !== cycle) return;
        notification.classList.remove("is-stack-dismissing", "is-visible");
        notification.style.visibility = "hidden";
        notification.dataset.stackCount = "0";
      }, count === 3 ? 860 : 200);
    }, 1800);
  }

  return { mount, show };
})();