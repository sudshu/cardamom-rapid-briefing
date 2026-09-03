(() => {
  "use strict";

  const svgNS = "http://www.w3.org/2000/svg";
  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];

  // Reading progress and restrained scroll reveals.
  const progressBar = $("#reading-progress-bar");
  const updateReadingProgress = () => {
    const scrollable = document.documentElement.scrollHeight - window.innerHeight;
    const progress = scrollable > 0 ? window.scrollY / scrollable : 0;
    progressBar.style.width = `${Math.min(100, Math.max(0, progress * 100))}%`;
  };
  window.addEventListener("scroll", updateReadingProgress, { passive: true });
  updateReadingProgress();

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if ("IntersectionObserver" in window && !reducedMotion) {
    const revealObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    $$(".reveal").forEach((element) => revealObserver.observe(element));
  } else {
    $$(".reveal").forEach((element) => element.classList.add("visible"));
  }

  // Deck-style section navigation for live presentations.
  const presentationSteps = $$(".presentation-step");
  const presenterPrevious = $("#presenter-previous");
  const presenterNext = $("#presenter-next");
  const presenterCount = $("#presenter-count");
  const presenterTitle = $("#presenter-title");
  const presenterProgress = $("#presenter-progress");
  const presenterFullscreen = $("#presenter-fullscreen");
  let currentPresentationIndex = 0;

  const updatePresenter = (index) => {
    currentPresentationIndex = Math.min(presentationSteps.length - 1, Math.max(0, index));
    const step = presentationSteps[currentPresentationIndex];
    presenterCount.textContent = `${String(currentPresentationIndex + 1).padStart(2, "0")} / ${String(presentationSteps.length).padStart(2, "0")}`;
    presenterTitle.textContent = step.dataset.presentTitle;
    presenterProgress.style.width = `${((currentPresentationIndex + 1) / presentationSteps.length) * 100}%`;
    presenterPrevious.disabled = currentPresentationIndex === 0;
    presenterNext.disabled = currentPresentationIndex === presentationSteps.length - 1;
  };

  const goToPresentationStep = (index) => {
    if (index < 0 || index >= presentationSteps.length) return;
    updatePresenter(index);
    const step = presentationSteps[index];
    step.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
    const url = new URL(window.location.href);
    url.hash = step.id;
    window.history.replaceState(null, "", url);
  };

  presenterPrevious.addEventListener("click", () => goToPresentationStep(currentPresentationIndex - 1));
  presenterNext.addEventListener("click", () => goToPresentationStep(currentPresentationIndex + 1));

  let presentationScrollFrame = 0;
  const locatePresentationStep = () => {
    presentationScrollFrame = 0;
    const marker = window.scrollY + window.innerHeight * 0.32;
    let activeIndex = 0;
    presentationSteps.forEach((step, index) => {
      if (step.offsetTop <= marker) activeIndex = index;
    });
    updatePresenter(activeIndex);
  };
  window.addEventListener("scroll", () => {
    if (!presentationScrollFrame) presentationScrollFrame = window.requestAnimationFrame(locatePresentationStep);
  }, { passive: true });

  document.addEventListener("keydown", (event) => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target;
    const editing = target.matches("input, textarea, select, [contenteditable='true']") ||
      target.closest(".tab-list, .decision-grid, .preset-group");
    if (editing) return;
    if (["ArrowRight", "PageDown"].includes(event.key) || (event.key === " " && !event.shiftKey)) {
      event.preventDefault();
      goToPresentationStep(currentPresentationIndex + 1);
    } else if (["ArrowLeft", "PageUp"].includes(event.key) || (event.key === " " && event.shiftKey)) {
      event.preventDefault();
      goToPresentationStep(currentPresentationIndex - 1);
    }
  });

  presenterFullscreen.addEventListener("click", async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
    } catch {
      // Fullscreen may be blocked by an embedding browser; navigation still works.
    }
  });
  document.addEventListener("fullscreenchange", () => {
    const active = Boolean(document.fullscreenElement);
    presenterFullscreen.classList.toggle("active", active);
    presenterFullscreen.setAttribute("aria-label", active ? "Exit fullscreen presentation" : "Enter fullscreen presentation");
  });
  const initialPresentationIndex = presentationSteps.findIndex((step) => `#${step.id}` === window.location.hash);
  updatePresenter(initialPresentationIndex >= 0 ? initialPresentationIndex : 0);

  // Accessible milestone tabs.
  const tabButtons = $$(".tab-button");
  const activateTab = (button) => {
    tabButtons.forEach((candidate) => {
      const selected = candidate === button;
      candidate.classList.toggle("active", selected);
      candidate.setAttribute("aria-selected", String(selected));
      candidate.tabIndex = selected ? 0 : -1;
      const panel = document.getElementById(candidate.dataset.panel);
      panel.classList.toggle("active", selected);
      panel.hidden = !selected;
    });
  };
  tabButtons.forEach((button, index) => {
    button.addEventListener("click", () => activateTab(button));
    button.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      let nextIndex = index;
      if (event.key === "ArrowRight") nextIndex = (index + 1) % tabButtons.length;
      if (event.key === "ArrowLeft") nextIndex = (index - 1 + tabButtons.length) % tabButtons.length;
      if (event.key === "Home") nextIndex = 0;
      if (event.key === "End") nextIndex = tabButtons.length - 1;
      activateTab(tabButtons[nextIndex]);
      tabButtons[nextIndex].focus();
    });
  });

  // Browser implementation of the frozen five-reach Muskingum control.
  const nTime = 72;
  const dt = 3600;
  const xWeight = 0.2;
  const background = [1, 2, 0.5, 4, 3];
  const downstream = [2, 2, 4, 4, -1];
  const topologicalOrder = [0, 1, 3, 2, 4];
  const truthParameters = { a1: 8, a4: 5, k: 3600 };

  const coefficients = (k) => {
    const denominator = dt + 2 * k * (1 - xWeight);
    return {
      current: (dt - 2 * k * xWeight) / denominator,
      previous: (dt + 2 * k * xWeight) / denominator,
      outflow: (2 * k * (1 - xWeight) - dt) / denominator,
    };
  };

  const staticRoute = (lateral) => {
    const discharge = lateral.slice();
    topologicalOrder.forEach((reach) => {
      const receptor = downstream[reach];
      if (receptor >= 0) discharge[receptor] += discharge[reach];
    });
    return discharge;
  };

  const forcing = (a1, a4) => Array.from({ length: nTime }, (_, time) => {
    const lateral = background.slice();
    if (time >= 8 && time <= 17) lateral[0] += a1;
    if (time >= 24 && time <= 37) lateral[3] += a4;
    return lateral;
  });

  const routeMuskingum = (a1, a4, k) => {
    const runoff = forcing(a1, a4);
    const coef = coefficients(k);
    const discharge = Array.from({ length: nTime }, () => Array(5).fill(0));
    const inflow = Array.from({ length: nTime }, () => Array(5).fill(0));

    discharge[0] = staticRoute(runoff[0]);
    inflow[0] = discharge[0].slice();

    for (let time = 1; time < nTime; time += 1) {
      const currentInflow = runoff[time].slice();
      topologicalOrder.forEach((reach) => {
        inflow[time][reach] = currentInflow[reach];
        discharge[time][reach] =
          coef.current * currentInflow[reach] +
          coef.previous * inflow[time - 1][reach] +
          coef.outflow * discharge[time - 1][reach];
        const receptor = downstream[reach];
        if (receptor >= 0) currentInflow[receptor] += discharge[time][reach];
      });
    }
    return { runoff, inflow, discharge, coefficients: coef };
  };

  const truth = routeMuskingum(truthParameters.a1, truthParameters.a4, truthParameters.k);
  let scenario = truth;
  let currentTime = 0;
  let animationTimer = null;

  const controls = {
    a1: $("#pulse-one"),
    a4: $("#pulse-four"),
    k: $("#travel-time"),
    time: $("#time-step"),
  };

  const values = {
    a1: $("#pulse-one-value"),
    a4: $("#pulse-four-value"),
    k: $("#travel-time-value"),
    time: $("#time-value"),
  };

  const getParameters = () => ({
    a1: Number(controls.a1.value),
    a4: Number(controls.a4.value),
    k: Number(controls.k.value),
  });

  const approximately = (left, right, tolerance = 0.001) => Math.abs(left - right) <= tolerance;

  const scenarioName = (parameters) => {
    const matchingPreset = $$(".preset").find((button) =>
      approximately(parameters.a1, Number(button.dataset.a1)) &&
      approximately(parameters.a4, Number(button.dataset.a4)) &&
      approximately(parameters.k, Number(button.dataset.k))
    );
    $$(".preset").forEach((button) => button.classList.toggle("active", button === matchingPreset));
    return matchingPreset ? `${matchingPreset.textContent.trim()} scenario` : "Custom scenario";
  };

  const rmse = (candidate, reference) => {
    let squared = 0;
    let count = 0;
    for (let time = 0; time < nTime; time += 1) {
      [2, 4].forEach((reach) => {
        const difference = candidate.discharge[time][reach] - reference.discharge[time][reach];
        squared += difference * difference;
        count += 1;
      });
    }
    return Math.sqrt(squared / count);
  };

  const createSvg = (name, attributes = {}, text = "") => {
    const element = document.createElementNS(svgNS, name);
    Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
    if (text) element.textContent = text;
    return element;
  };

  const linePath = (series, xScale, yScale) => series
    .map((value, index) => `${index === 0 ? "M" : "L"}${xScale(index).toFixed(2)},${yScale(value).toFixed(2)}`)
    .join(" ");

  const renderHydrograph = () => {
    const svg = $("#hydrograph");
    svg.replaceChildren();
    const width = 920;
    const height = 340;
    const margin = { top: 19, right: 54, bottom: 37, left: 48 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const scenarioThree = scenario.discharge.map((row) => row[2]);
    const scenarioFive = scenario.discharge.map((row) => row[4]);
    const truthThree = truth.discharge.map((row) => row[2]);
    const truthFive = truth.discharge.map((row) => row[4]);
    const maximum = Math.max(...scenarioThree, ...scenarioFive, ...truthThree, ...truthFive) * 1.12;
    const xScale = (time) => margin.left + (time / (nTime - 1)) * plotWidth;
    const yScale = (value) => margin.top + plotHeight - (value / maximum) * plotHeight;

    svg.append(createSvg("rect", {
      x: xScale(30), y: margin.top, width: xScale(36) - xScale(30), height: plotHeight,
      class: "holdout",
    }));

    for (let tick = 0; tick <= 4; tick += 1) {
      const value = maximum * tick / 4;
      const y = yScale(value);
      svg.append(createSvg("line", { x1: margin.left, x2: width - margin.right, y1: y, y2: y, class: "grid-line" }));
      svg.append(createSvg("text", { x: margin.left - 8, y: y + 3, "text-anchor": "end", class: "axis-label" }, value.toFixed(1)));
    }
    [0, 12, 24, 36, 48, 60, 71].forEach((tick) => {
      const x = xScale(tick);
      svg.append(createSvg("line", { x1: x, x2: x, y1: margin.top, y2: height - margin.bottom, class: "grid-line" }));
      svg.append(createSvg("text", { x, y: height - 15, "text-anchor": "middle", class: "axis-label" }, tick + 1));
    });
    svg.append(createSvg("text", { x: margin.left, y: 11, class: "axis-label" }, "discharge"));
    svg.append(createSvg("text", { x: width - margin.right, y: height - 15, "text-anchor": "end", class: "axis-label" }, "model hour (1-based)"));

    const series = [
      { values: truthThree, className: "truth-line" },
      { values: truthFive, className: "truth-line outlet" },
      { values: scenarioThree, className: "scenario-line" },
      { values: scenarioFive, className: "scenario-line outlet" },
    ];
    series.forEach((item) => svg.append(createSvg("path", { d: linePath(item.values, xScale, yScale), class: item.className })));

    const cursorX = xScale(currentTime);
    svg.append(createSvg("line", { x1: cursorX, x2: cursorX, y1: margin.top, y2: height - margin.bottom, class: "cursor" }));
    [scenarioThree[currentTime], scenarioFive[currentTime]].forEach((value) => {
      svg.append(createSvg("circle", { cx: cursorX, cy: yScale(value), r: 5, class: "cursor-dot" }));
    });
    svg.append(createSvg("text", { x: width - margin.right + 7, y: yScale(scenarioThree.at(-1)) + 3, class: "series-label", fill: "#159b7b" }, "Q3"));
    svg.append(createSvg("text", { x: width - margin.right + 7, y: yScale(scenarioFive.at(-1)) + 3, class: "series-label", fill: "#3ea6ff" }, "Q5"));
  };

  const updateNetwork = () => {
    const row = scenario.discharge[currentTime];
    const maximum = Math.max(...row, 1);
    $$(".lab-node").forEach((node) => {
      const reach = Number(node.dataset.reach);
      const normalized = row[reach] / maximum;
      const circle = $("circle", node);
      const valueLabel = $(".node-value", node);
      circle.style.fill = `rgba(99, 230, 190, ${0.08 + normalized * 0.48})`;
      valueLabel.textContent = row[reach].toFixed(2);
      node.classList.toggle("pulse-active", (reach === 0 && currentTime >= 8 && currentTime <= 17) || (reach === 3 && currentTime >= 24 && currentTime <= 37));
    });

    const parameters = getParameters();
    $$(".lab-particles circle").forEach((particle) => {
      const reach = Number(particle.dataset.flow);
      particle.style.opacity = String(Math.min(1, 0.26 + row[reach] / maximum));
      const motion = $("animateMotion", particle);
      motion.setAttribute("dur", `${Math.max(1.15, 1.1 + parameters.k / 3200).toFixed(2)}s`);
    });

    let message = "Background flow · pulse sources: reaches 1 + 4";
    if (currentTime >= 8 && currentTime <= 17) message = `Pulse A injected at reach 1 · → gauges 3 + 5 · +${parameters.a1.toFixed(1)}`;
    if (currentTime >= 24 && currentTime <= 37) message = `Pulse B injected at reach 4 · → gauge 5 · +${parameters.a4.toFixed(1)}`;
    if (currentTime >= 30 && currentTime <= 35) message += " · held-out outlet window";
    $("#pulse-callout").textContent = message;
  };

  const updateTime = (time) => {
    currentTime = Number(time);
    controls.time.value = String(currentTime);
    values.time.textContent = String(currentTime + 1);
    updateNetwork();
    renderHydrograph();
  };

  const renderModel = () => {
    const parameters = getParameters();
    scenario = routeMuskingum(parameters.a1, parameters.a4, parameters.k);
    values.a1.textContent = `+${parameters.a1.toFixed(1)}`;
    values.a4.textContent = `+${parameters.a4.toFixed(1)}`;
    values.k.textContent = `${parameters.k.toFixed(0)} s`;
    $("#scenario-label").textContent = scenarioName(parameters);
    $("#coef-current").textContent = scenario.coefficients.current.toFixed(3);
    $("#coef-previous").textContent = scenario.coefficients.previous.toFixed(3);
    $("#coef-outflow").textContent = scenario.coefficients.outflow.toFixed(3);
    $("#scenario-rmse").textContent = rmse(scenario, truth).toFixed(3);
    updateNetwork();
    renderHydrograph();
  };

  [controls.a1, controls.a4, controls.k].forEach((control) => control.addEventListener("input", renderModel));
  controls.time.addEventListener("input", (event) => updateTime(event.target.value));

  const applyParameters = ({ a1, a4, k }) => {
    controls.a1.value = String(a1);
    controls.a4.value = String(a4);
    controls.k.value = String(k);
    renderModel();
  };

  $$(".preset").forEach((button) => button.addEventListener("click", () => applyParameters({
    a1: Number(button.dataset.a1),
    a4: Number(button.dataset.a4),
    k: Number(button.dataset.k),
  })));
  $("#reset-model").addEventListener("click", () => {
    applyParameters(truthParameters);
    updateTime(0);
  });

  const stopAnimation = () => {
    if (animationTimer !== null) window.clearInterval(animationTimer);
    animationTimer = null;
    $("#play-model").classList.remove("playing");
    $("#play-model").setAttribute("aria-label", "Play model animation");
    $(".play-icon").textContent = "▶";
  };

  const startAnimation = () => {
    stopAnimation();
    $("#play-model").classList.add("playing");
    $("#play-model").setAttribute("aria-label", "Pause model animation");
    $(".play-icon").textContent = "Ⅱ";
    animationTimer = window.setInterval(() => updateTime((currentTime + 1) % nTime), 240);
  };

  $("#play-model").addEventListener("click", () => animationTimer === null ? startAnimation() : stopAnimation());
  document.addEventListener("visibilitychange", () => { if (document.hidden) stopAnimation(); });

  // Next-experiment selection for the team discussion.
  const decisionCards = $$(".decision-card");
  const selectDecision = (card) => {
    decisionCards.forEach((candidate) => {
      const selected = candidate === card;
      candidate.classList.toggle("selected", selected);
      candidate.setAttribute("aria-checked", String(selected));
      candidate.tabIndex = selected ? 0 : -1;
    });
    $("#decision-summary").innerHTML = `<b>${card.dataset.choice}</b>${card.dataset.summary.slice(card.dataset.choice.length)}`;
  };
  decisionCards.forEach((card, index) => {
    card.addEventListener("click", () => selectDecision(card));
    card.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
      event.preventDefault();
      const direction = ["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : -1;
      const next = decisionCards[(index + direction + decisionCards.length) % decisionCards.length];
      selectDecision(next);
      next.focus();
    });
  });

  $("#copy-decision").addEventListener("click", async (event) => {
    const selected = $(".decision-card.selected");
    const text = `CARDAMOM–RAPID next-step discussion: ${selected.dataset.summary}`;
    const button = event.currentTarget;
    try {
      await navigator.clipboard.writeText(text);
      button.textContent = "Copied";
    } catch {
      window.prompt("Copy this discussion summary:", text);
      button.textContent = "Ready to copy";
    }
    window.setTimeout(() => { button.textContent = "Copy summary"; }, 1600);
  });

  renderModel();

  // Small read-only inspection surface for browser-level parity checks.
  Object.defineProperty(window, "cardamomRapidDemo", {
    value: Object.freeze({
      routeMuskingum,
      truthParameters: Object.freeze({ ...truthParameters }),
      getScenarioDischarge: () => scenario.discharge.map((row) => row.slice()),
    }),
    writable: false,
  });

  // Useful for sharing a presentation section directly, e.g. ?view=lab.
  const requestedView = new URLSearchParams(window.location.search).get("view");
  if (requestedView && document.getElementById(requestedView)) {
    document.getElementById(requestedView).scrollIntoView({ block: "start" });
  }
})();
