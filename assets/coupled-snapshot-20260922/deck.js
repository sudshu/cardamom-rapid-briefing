/* Slide navigation for coupled-snapshot.html.
   Progressive enhancement: without this file every slide is a normal section of
   a scrolling document, and the contents list at the top is a plain anchor list. */
(function () {
  "use strict";

  var slides = Array.prototype.slice.call(document.querySelectorAll(".slide"));
  if (!slides.length) { if (window.deckFallback) window.deckFallback(); return; }

  try {

  var bar = document.getElementById("progress-bar");
  var countEl = document.getElementById("slide-count");
  var titleEl = document.getElementById("slide-title");
  var prevBtn = document.getElementById("nav-prev");
  var nextBtn = document.getElementById("nav-next");
  var jumpBtn = document.getElementById("nav-jump");
  var fsBtn = document.getElementById("nav-fullscreen");
  var printBtn = document.getElementById("nav-print");
  var panel = document.getElementById("jump-panel");
  var panelItems = panel ? Array.prototype.slice.call(panel.querySelectorAll("li")) : [];
  var live = document.getElementById("slide-live");

  var current = 0;

  function indexOfId(id) {
    for (var i = 0; i < slides.length; i++) if (slides[i].id === id) return i;
    return -1;
  }

  function pad(n) { return (n < 10 ? "0" : "") + n; }

  function render(i) {
    for (var k = 0; k < slides.length; k++) {
      var on = k === i;
      slides[k].classList.toggle("is-current", on);
      slides[k].setAttribute("aria-hidden", on ? "false" : "true");
    }
    for (var j = 0; j < panelItems.length; j++) {
      panelItems[j].classList.toggle("is-current", panelItems[j].getAttribute("data-for") === slides[i].id);
    }
    var title = slides[i].getAttribute("data-title") || "";
    if (countEl) countEl.textContent = pad(i + 1) + " / " + pad(slides.length);
    if (titleEl) titleEl.textContent = title;
    if (bar) bar.style.width = ((i + 1) / slides.length * 100).toFixed(2) + "%";
    if (prevBtn) prevBtn.disabled = i === 0;
    if (nextBtn) nextBtn.disabled = i === slides.length - 1;
    if (live) live.textContent = "Slide " + (i + 1) + " of " + slides.length + ": " + title;
  }

  function go(i, opts) {
    opts = opts || {};
    i = Math.max(0, Math.min(slides.length - 1, i));
    var changed = i !== current;
    current = i;
    render(i);
    var hash = "#" + slides[i].id;
    if (opts.history === "push" && location.hash !== hash) {
      history.pushState({ slide: slides[i].id }, "", hash);
    } else if (opts.history === "replace") {
      history.replaceState({ slide: slides[i].id }, "", hash);
    }
    if (opts.focus) {
      slides[i].focus({ preventScroll: true });
    }
    if (changed || opts.force) {
      var inner = slides[i].querySelector(".slide-inner");
      if (inner) inner.scrollTop = 0;
      window.scrollTo(0, 0);
    }
  }

  function step(delta, focus) {
    var target = current + delta;
    if (target < 0 || target > slides.length - 1) return;
    go(target, { history: "push", focus: focus });
  }

  /* ----------------------------------------------------------- jump menu */

  function setPanel(open) {
    if (!panel || !jumpBtn) return;
    panel.classList.toggle("is-open", open);
    jumpBtn.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) {
      var link = panel.querySelector("li.is-current > a") || panel.querySelector("a");
      if (link) link.focus();
    }
  }
  function panelOpen() { return !!(panel && panel.classList.contains("is-open")); }

  if (jumpBtn) {
    jumpBtn.addEventListener("click", function () { setPanel(!panelOpen()); });
  }
  document.addEventListener("click", function (e) {
    if (panelOpen() && !e.target.closest("#jump-panel") && !e.target.closest("#nav-jump")) setPanel(false);
  });

  /* --------------------------------------------------------- in-page links */

  document.addEventListener("click", function (e) {
    var a = e.target.closest ? e.target.closest('a[href^="#"]') : null;
    if (!a) return;
    var id = a.getAttribute("href").slice(1);
    var i = indexOfId(id);
    if (i < 0) return;
    e.preventDefault();
    setPanel(false);
    go(i, { history: "push", focus: true });
  });

  /* ------------------------------------------------------------- keyboard */

  function typingIn(el) {
    if (!el || !el.closest) return false;
    return !!el.closest("input, textarea, select, [contenteditable=''], [contenteditable='true']");
  }

  document.addEventListener("keydown", function (e) {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    var t = e.target;

    if (e.key === "Escape") {
      if (panelOpen()) { setPanel(false); jumpBtn.focus(); e.preventDefault(); }
      return;
    }
    if (typingIn(t)) return;
    if (panelOpen()) return;  /* let the menu keep its own arrow/tab behaviour */

    switch (e.key) {
      case "ArrowRight":
      case "PageDown":
        step(1, true); e.preventDefault(); break;
      case "ArrowLeft":
      case "PageUp":
        step(-1, true); e.preventDefault(); break;
      case "Home":
        go(0, { history: "push", focus: true }); e.preventDefault(); break;
      case "End":
        go(slides.length - 1, { history: "push", focus: true }); e.preventDefault(); break;
      case " ":
      case "Spacebar":
        /* space still activates a focused button, link, summary or checkbox */
        if (t && t.closest && t.closest("button, a, summary, details, [role='button']")) return;
        step(e.shiftKey ? -1 : 1, true); e.preventDefault(); break;
      case "f":
      case "F":
        if (t && t.closest && t.closest("button, a, summary")) return;
        toggleFullscreen(); e.preventDefault(); break;
      default:
        break;
    }
  });

  /* ----------------------------------------------------------- fullscreen */

  function toggleFullscreen() {
    try {
      if (!document.fullscreenElement) {
        if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen();
      } else if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    } catch (err) { /* fullscreen may be blocked; navigation still works */ }
  }
  if (fsBtn) fsBtn.addEventListener("click", toggleFullscreen);
  document.addEventListener("fullscreenchange", function () {
    if (fsBtn) fsBtn.setAttribute("aria-pressed", document.fullscreenElement ? "true" : "false");
  });

  /* ---------------------------------------------------------------- print */

  var reopen = [];
  function openAllNotes() {
    reopen = [];
    var ds = document.querySelectorAll("details");
    for (var i = 0; i < ds.length; i++) {
      if (!ds[i].open) { reopen.push(ds[i]); ds[i].open = true; }
    }
  }
  function restoreNotes() {
    for (var i = 0; i < reopen.length; i++) reopen[i].open = false;
    reopen = [];
  }
  window.addEventListener("beforeprint", openAllNotes);
  window.addEventListener("afterprint", restoreNotes);
  if (printBtn) {
    printBtn.addEventListener("click", function () { window.print(); });
  }

  /* --------------------------------------------------------- buttons, history */

  if (prevBtn) prevBtn.addEventListener("click", function () { step(-1, false); });
  if (nextBtn) nextBtn.addEventListener("click", function () { step(1, false); });

  window.addEventListener("popstate", function () {
    var i = indexOfId(location.hash.slice(1));
    go(i < 0 ? 0 : i, { history: "none" });
  });
  window.addEventListener("hashchange", function () {
    var i = indexOfId(location.hash.slice(1));
    if (i >= 0 && i !== current) go(i, { history: "none" });
  });

  for (var s = 0; s < slides.length; s++) {
    if (!slides[s].hasAttribute("tabindex")) slides[s].setAttribute("tabindex", "-1");
  }

  var start = indexOfId(location.hash.slice(1));
  go(start < 0 ? 0 : start, { history: "replace", force: true });

  /* only now is slide mode safe to keep: the head script disarms it otherwise.
     Re-arm in case a slow load already tripped that watchdog. */
  window.deckReady = true;
  document.documentElement.classList.add("js");
  } catch (err) {
    if (window.deckFallback) window.deckFallback();
    throw err;
  }
})();
