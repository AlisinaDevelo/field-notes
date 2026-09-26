(() => {
  "use strict";

  const article = document.querySelector("#article-content");
  if (!article) return;

  // The contents list is rendered by Jekyll, so navigation also works without JS.
  const toc = document.querySelector(".toc");
  if (toc) {
    const mobile = window.matchMedia("(max-width: 760px)");
    const adaptContents = () => { toc.open = !mobile.matches; };
    adaptContents();
    mobile.addEventListener("change", adaptContents);
    const links = Array.from(toc.querySelectorAll("a[href^='#']"));
    const sections = links.map(link => document.getElementById(decodeURIComponent(link.hash.slice(1))));
    const updateCurrentSection = () => {
      let current = 0;
      sections.forEach((section, index) => {
        if (section && section.getBoundingClientRect().top <= 140) current = index;
      });
      links.forEach((link, index) => {
        if (index === current) link.setAttribute("aria-current", "location");
        else link.removeAttribute("aria-current");
      });
    };
    let scrollQueued = false;
    window.addEventListener("scroll", () => {
      if (scrollQueued) return;
      scrollQueued = true;
      window.requestAnimationFrame(() => {
        updateCurrentSection();
        scrollQueued = false;
      });
    }, { passive: true });
    toc.addEventListener("click", event => {
      if (mobile.matches && event.target.closest("a")) toc.open = false;
    });
    updateCurrentSection();
  }

  article.querySelectorAll("h2[id]").forEach(heading => {
    const link = document.createElement("a");
    link.className = "heading-anchor";
    link.href = "#" + heading.id;
    link.setAttribute("aria-label", "Link to " + heading.textContent);
    link.textContent = "#";
    heading.append(link);
  });

  const copyStatus = document.createElement("p");
  copyStatus.className = "sr-only";
  copyStatus.setAttribute("role", "status");
  document.body.append(copyStatus);
  const languages = { sh: "Shell", bash: "Shell", ts: "TypeScript", js: "JavaScript", text: "Text", go: "Go" };

  article.querySelectorAll("pre").forEach(pre => {
    const code = pre.querySelector("code");
    if (!code) return;
    const highlighted = pre.closest(".highlighter-rouge");
    const root = highlighted || pre;
    const languageClass = Array.from((highlighted || code).classList).find(name => name.startsWith("language-"));
    const language = languageClass ? languageClass.slice(9) : "text";
    const frame = document.createElement("div");
    frame.className = "code-frame";
    const toolbar = document.createElement("div");
    toolbar.className = "code-toolbar";
    const label = document.createElement("span");
    label.className = "code-language";
    label.textContent = languages[language] || language;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "copy-code";
    button.textContent = "Copy";
    button.setAttribute("aria-label", "Copy " + label.textContent + " code");
    let reset;
    button.addEventListener("click", async () => {
      clearTimeout(reset);
      try {
        await navigator.clipboard.writeText(code.textContent);
        button.textContent = "Copied";
        copyStatus.textContent = "Code copied to clipboard.";
      } catch {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(code);
        selection.removeAllRanges();
        selection.addRange(range);
        button.textContent = "Selected";
        copyStatus.textContent = "Code selected. Press Command C or Control C to copy.";
      }
      reset = setTimeout(() => { button.textContent = "Copy"; }, 2500);
    });
    toolbar.append(label, button);
    root.before(frame);
    frame.append(toolbar, root);
    pre.tabIndex = 0;
    pre.setAttribute("aria-label", label.textContent + " code");
  });

  // Keep diagram labels at their authored size on narrow screens.
  article.querySelectorAll("figure > svg").forEach(svg => {
    const viewport = document.createElement("div");
    viewport.className = "diagram-viewport";
    viewport.setAttribute("role", "region");
    viewport.setAttribute("aria-label", svg.querySelector("title")?.textContent || "Article diagram");
    const hint = document.createElement("p");
    hint.className = "diagram-hint";
    hint.textContent = "Scroll horizontally to explore the diagram →";
    hint.hidden = true;
    svg.before(viewport);
    viewport.append(svg);
    viewport.after(hint);
    const updateOverflow = () => {
      const overflows = viewport.scrollWidth > viewport.clientWidth + 1;
      viewport.tabIndex = overflows ? 0 : -1;
      hint.hidden = !overflows;
    };
    if ("ResizeObserver" in window) new ResizeObserver(updateOverflow).observe(viewport);
    updateOverflow();
  });

  const discussion = document.querySelector("#discussion");
  const loadButton = discussion?.querySelector("[data-load-comments]");
  if (!loadButton) return;
  const intro = discussion.querySelector(".comments-intro");
  const thread = discussion.querySelector(".giscus");
  const status = discussion.querySelector(".comments-status");
  const privacy = discussion.querySelector("[data-comments-privacy]");
  loadButton.hidden = false;
  privacy.hidden = false;
  let loading = false;
  let loaded = false;
  let timeout;

  const failed = () => {
    clearTimeout(timeout);
    loading = false;
    loaded = false;
    thread.hidden = true;
    thread.replaceChildren();
    intro.hidden = false;
    loadButton.disabled = false;
    loadButton.textContent = "Try again";
    status.hidden = false;
    status.textContent = "Comments couldn’t load here. You can still join the conversation on GitHub.";
  };

  const loadComments = () => {
    if (loading || loaded) return;
    loading = true;
    loadButton.disabled = true;
    loadButton.textContent = "Loading…";
    status.hidden = false;
    status.textContent = "Loading the discussion…";
    thread.hidden = false;
    const script = document.createElement("script");
    script.src = "https://giscus.app/client.js";
    script.async = true;
    script.crossOrigin = "anonymous";
    const config = {
      repo: discussion.dataset.repo,
      "repo-id": discussion.dataset.repoId,
      mapping: "number",
      term: discussion.dataset.discussionNumber,
      "reactions-enabled": "0",
      "emit-metadata": "1",
      "input-position": "top",
      theme: "https://alisina.is-a.dev/assets/comments.css",
      lang: "en"
    };
    Object.entries(config).forEach(([key, value]) => script.setAttribute("data-" + key, value));
    script.addEventListener("error", failed, { once: true });
    timeout = setTimeout(failed, 20000);
    thread.append(script);
  };

  window.addEventListener("message", event => {
    if (event.origin !== "https://giscus.app" || !event.data?.giscus) return;
    const frame = thread.querySelector("iframe");
    if (!frame || event.source !== frame.contentWindow) return;
    if (event.data.giscus.error) {
      failed();
    } else if (event.data.giscus.discussion) {
      clearTimeout(timeout);
      loading = false;
      loaded = true;
      const moveFocus = document.activeElement === loadButton;
      intro.hidden = true;
      thread.hidden = false;
      if (moveFocus) frame.focus();
    }
  });
  loadButton.addEventListener("click", loadComments);
  // Resume the widget after the reader deliberately returns from GitHub sign-in.
  if (new URLSearchParams(window.location.search).has("giscus")) loadComments();
})();
