(() => {
  "use strict";

  const dialog = document.querySelector("#story-dialog");
  if (!dialog || typeof dialog.showModal !== "function") return;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  canvas.width = 1080;
  canvas.height = 1920;

  const note = dialog.dataset;
  const preview = dialog.querySelector(".story-preview");
  const image = preview.querySelector("img");
  const download = dialog.querySelector("[data-story-download]");
  const nativeButton = dialog.querySelector("[data-story-native]");
  const copyButton = dialog.querySelector("[data-story-copy]");
  const linkInput = dialog.querySelector("#story-url");
  const status = dialog.querySelector(".story-status");
  const serif = '"Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif';
  const sans = '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  const mono = '"SFMono-Regular", Consolas, monospace';
  const themes = {
    paper: { paper: "#f2f0e8", ink: "#20241f", muted: "#626b63", line: "#cdd0c7", accent: "#31488f" },
    ink: { paper: "#20241f", ink: "#f2f0e8", muted: "#bcc3b6", line: "#4b5248", accent: "#d1ed62" }
  };
  let objectURL;
  let storyFile;
  let returnFocus;
  let generation = 0;
  let copyReset;
  let sharing = false;

  // Measure real glyphs, including long words, so future posts need no artwork tweaks.
  const wrap = (text, width) => {
    const lines = [];
    let line = "";
    for (const word of text.trim().split(/\s+/u)) {
      const candidate = line ? `${line} ${word}` : word;
      if (ctx.measureText(candidate).width <= width) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      line = "";
      for (const character of word) {
        if (line && ctx.measureText(line + character).width > width) {
          lines.push(line);
          line = "";
        }
        line += character;
      }
    }
    if (line) lines.push(line);
    return lines;
  };

  const ellipsize = (text, width) => {
    if (ctx.measureText(text).width <= width) return text;
    const characters = Array.from(text);
    while (characters.length && ctx.measureText(`${characters.join("")}…`).width > width) characters.pop();
    return `${characters.join("").trimEnd()}…`;
  };

  const fit = (text, width, height, startSize, minSize, family, leading) => {
    let size = startSize;
    let lines;
    do {
      ctx.font = `400 ${size}px ${family}`;
      lines = wrap(text, width);
      if (lines.length * size * leading <= height || size <= minSize) break;
      size -= 2;
    } while (size >= minSize);
    const limit = Math.max(1, Math.floor(height / (size * leading)));
    if (lines.length > limit) {
      lines = lines.slice(0, limit);
      lines[limit - 1] = ellipsize(`${lines[limit - 1]}…`, width);
    }
    return { size, lines, lineHeight: size * leading };
  };

  const draw = theme => {
    const colors = themes[theme];
    ctx.fillStyle = colors.paper;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.lineWidth = 2;

    const rule = y => {
      ctx.strokeStyle = colors.line;
      ctx.beginPath();
      ctx.moveTo(88, y);
      ctx.lineTo(992, y);
      ctx.stroke();
    };

    // Keep all essential content clear of the story app's top and bottom controls.
    ctx.fillStyle = colors.accent;
    ctx.fillRect(88, 224, 24, 24);
    ctx.fillStyle = colors.ink;
    ctx.font = `400 58px ${serif}`;
    ctx.fillText("Field Notes", 134, 207);
    ctx.fillStyle = colors.muted;
    ctx.font = `400 25px ${sans}`;
    ctx.fillText("An engineering journal", 134, 276);
    rule(338);

    // An abstract folio motif, shared by every post; it represents no article data.
    ctx.strokeStyle = colors.accent;
    ctx.lineWidth = 3;
    for (let sheet = 0; sheet < 3; sheet += 1) {
      const x = 112 + sheet * 100;
      const y = 428 + sheet * 28;
      ctx.strokeRect(x, y, 286, 154);
      ctx.beginPath();
      ctx.moveTo(x + 28, y + 40);
      ctx.lineTo(x + 184, y + 40);
      ctx.moveTo(x + 28, y + 65);
      ctx.lineTo(x + 122, y + 65);
      ctx.stroke();
    }
    ctx.fillStyle = colors.accent;
    const sequence = note.sequence ? String(note.sequence).padStart(2, "0") : "↗";
    const sequenceType = fit(sequence, 330, 185, 168, 60, serif, 1);
    ctx.font = `400 ${sequenceType.size}px ${serif}`;
    ctx.textAlign = "right";
    ctx.fillText(ellipsize(sequence, 330), 982, 456);
    ctx.textAlign = "left";
    ctx.lineWidth = 2;
    rule(688);

    ctx.fillStyle = colors.accent;
    ctx.font = `400 27px ${mono}`;
    ctx.fillText(ellipsize(note.topic.toUpperCase(), 904), 88, 724);

    const title = fit(note.title, 904, 460, 110, 56, serif, 1.08);
    ctx.fillStyle = colors.ink;
    ctx.font = `400 ${title.size}px ${serif}`;
    title.lines.forEach((line, index) => ctx.fillText(line, 84, 800 + index * title.lineHeight));
    const descriptionY = 800 + title.lines.length * title.lineHeight + 40;
    const description = fit(note.description, 888, 1470 - descriptionY, 36, 30, sans, 1.45);
    ctx.fillStyle = colors.muted;
    ctx.font = `400 ${description.size}px ${sans}`;
    description.lines.forEach((line, index) => ctx.fillText(line, 88, descriptionY + index * description.lineHeight));

    rule(1520);
    ctx.fillStyle = colors.ink;
    ctx.font = `400 30px ${sans}`;
    ctx.fillText(ellipsize(note.author, 570), 88, 1560);
    if (note.readingTime) {
      ctx.textAlign = "right";
      ctx.fillStyle = colors.muted;
      ctx.font = `400 25px ${mono}`;
      ctx.fillText(ellipsize(`${note.readingTime} MIN READ`, 290), 992, 1565);
      ctx.textAlign = "left";
    }
    ctx.fillStyle = colors.accent;
    ctx.font = `400 41px ${sans}`;
    ctx.fillText(ellipsize(new URL(note.url).hostname, 790), 88, 1640);
    ctx.strokeStyle = colors.accent;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(936, 1676);
    ctx.lineTo(972, 1640);
    ctx.moveTo(942, 1640);
    ctx.lineTo(972, 1640);
    ctx.lineTo(972, 1670);
    ctx.stroke();
  };

  const render = async () => {
    const request = ++generation;
    preview.setAttribute("aria-busy", "true");
    download.hidden = true;
    nativeButton.hidden = true;
    storyFile = undefined;
    status.textContent = "Preparing your story image…";
    try {
      await document.fonts.ready;
      if (request !== generation || !dialog.open) return;
      const theme = dialog.querySelector('input[name="story-theme"]:checked').value;
      draw(theme);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
      if (request !== generation || !dialog.open) return;
      if (!blob) throw new Error("Image export unavailable");
      const slug = new URL(note.url).pathname.split("/").filter(Boolean).pop() || "note";
      const filename = `field-notes-${slug}-${theme}-story.png`;
      if (objectURL) URL.revokeObjectURL(objectURL);
      objectURL = URL.createObjectURL(blob);
      image.src = objectURL;
      image.alt = `${note.title} ${note.description} By ${note.author}. ${theme === "ink" ? "Ink" : "Paper"} story card.`;
      image.hidden = false;
      download.href = objectURL;
      download.download = filename;
      download.hidden = false;
      if (typeof File === "function") storyFile = new File([blob], filename, { type: "image/png" });
      try {
        nativeButton.hidden = !(storyFile && window.isSecureContext
          && typeof navigator.share === "function" && typeof navigator.canShare === "function"
          && navigator.canShare({ files: [storyFile] }));
      } catch {
        nativeButton.hidden = true;
      }
      status.textContent = "Your story image is ready.";
    } catch {
      status.textContent = "The story image couldn’t be created. Try opening this page in your browser, or copy the article link below.";
    } finally {
      if (request === generation) preview.setAttribute("aria-busy", "false");
    }
  };

  document.querySelectorAll("[data-story-open]").forEach(button => {
    button.hidden = false;
    button.addEventListener("click", () => {
      const menu = button.closest(".share-menu");
      returnFocus = menu.querySelector("summary");
      menu.open = false;
      dialog.showModal();
      document.documentElement.classList.add("story-is-open");
      render();
    });
  });
  dialog.querySelector(".story-close").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
  dialog.addEventListener("close", () => {
    generation += 1;
    document.documentElement.classList.remove("story-is-open");
    if (objectURL) URL.revokeObjectURL(objectURL);
    objectURL = undefined;
    storyFile = undefined;
    image.removeAttribute("src");
    image.hidden = true;
    download.hidden = true;
    download.removeAttribute("href");
    clearTimeout(copyReset);
    copyButton.textContent = "Copy link";
    returnFocus?.focus();
  });
  dialog.querySelectorAll('input[name="story-theme"]').forEach(input => input.addEventListener("change", render));
  linkInput.addEventListener("focus", () => linkInput.select());
  linkInput.addEventListener("click", () => linkInput.select());
  copyButton.addEventListener("click", async () => {
    clearTimeout(copyReset);
    try {
      await navigator.clipboard.writeText(note.url);
      copyButton.textContent = "Copied";
      status.textContent = "Link copied. Paste it into Instagram’s Link sticker.";
    } catch {
      linkInput.focus();
      linkInput.select();
      status.textContent = "Select and copy the article link, then paste it into your story’s Link sticker.";
    }
    copyReset = setTimeout(() => { copyButton.textContent = "Copy link"; }, 3000);
  });
  download.addEventListener("click", () => {
    status.textContent = "Add the saved image to your story, then add a Link sticker.";
  });
  nativeButton.addEventListener("click", async () => {
    if (!storyFile || sharing) return;
    sharing = true;
    nativeButton.disabled = true;
    status.textContent = "Choose Instagram if offered, or save the image and add it to your story.";
    try {
      // The file is prepared before this click, preserving native user activation.
      // Share only the image: the article URL belongs in Instagram's Link sticker.
      await navigator.share({ files: [storyFile] });
    } catch (error) {
      if (error.name !== "AbortError") status.textContent = "Image sharing isn’t available here. Save the image and add it to your story.";
    } finally {
      sharing = false;
      nativeButton.disabled = false;
    }
  });
})();
