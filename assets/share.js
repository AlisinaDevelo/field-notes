(() => {
  "use strict";

  const menus = Array.from(document.querySelectorAll(".share-menu"));

  const positionPanel = menu => {
    if (!menu.open) return;
    const panel = menu.querySelector(".share-panel");
    const trigger = menu.querySelector("summary");
    const rect = trigger.getBoundingClientRect();
    panel.style.maxHeight = "";
    const below = window.innerHeight - rect.bottom - 20;
    const above = rect.top - 20;
    const openAbove = below < panel.scrollHeight && above > below;
    menu.classList.toggle("share-menu--above", openAbove);
    panel.style.maxHeight = `${Math.max(140, openAbove ? above : below)}px`;
  };

  menus.forEach(menu => {
    const trigger = menu.querySelector("summary");
    const copyButton = menu.querySelector("[data-copy-link]");
    const nativeButton = menu.querySelector("[data-native-share]");
    const input = menu.querySelector("input");
    const status = menu.querySelector(".share-status");
    const data = { title: menu.dataset.shareTitle, text: menu.dataset.shareTitle, url: menu.dataset.shareUrl };
    let resetCopy;

    menu.addEventListener("toggle", () => {
      if (!menu.open) return;
      menus.forEach(other => { if (other !== menu) other.open = false; });
      positionPanel(menu);
    });
    menu.addEventListener("focusout", event => {
      if (event.relatedTarget && !menu.contains(event.relatedTarget)) menu.open = false;
    });
    input.addEventListener("focus", () => input.select());
    input.addEventListener("click", () => input.select());

    copyButton.hidden = false;
    copyButton.addEventListener("click", async () => {
      clearTimeout(resetCopy);
      copyButton.disabled = true;
      status.textContent = "";
      try {
        await navigator.clipboard.writeText(data.url);
        copyButton.textContent = "Copied";
        status.textContent = "Link copied.";
      } catch {
        input.focus();
        input.select();
        copyButton.textContent = "Copy link";
        status.textContent = "Select and copy the link above.";
      } finally {
        copyButton.disabled = false;
        positionPanel(menu);
        resetCopy = setTimeout(() => {
          copyButton.textContent = "Copy link";
          status.textContent = "";
          positionPanel(menu);
        }, 3000);
      }
    });

    try {
      nativeButton.hidden = !(window.isSecureContext && typeof navigator.share === "function"
        && (typeof navigator.canShare !== "function" || navigator.canShare(data)));
    } catch {
      nativeButton.hidden = true;
    }
    nativeButton.addEventListener("click", async () => {
      nativeButton.disabled = true;
      status.textContent = "";
      try {
        await navigator.share(data);
        menu.open = false;
        trigger.focus();
      } catch (error) {
        if (error.name !== "AbortError") {
          status.textContent = "Sharing couldn’t open. Choose a service or copy the link.";
          positionPanel(menu);
        }
      } finally {
        nativeButton.disabled = false;
      }
    });
  });

  document.addEventListener("click", event => {
    menus.forEach(menu => { if (!menu.contains(event.target)) menu.open = false; });
  });
  document.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    menus.forEach(menu => {
      if (!menu.open) return;
      event.preventDefault();
      const ownsFocus = menu.contains(document.activeElement);
      menu.open = false;
      if (ownsFocus) menu.querySelector("summary").focus();
    });
  });
  window.addEventListener("resize", () => menus.forEach(positionPanel));
})();
