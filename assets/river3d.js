/*
 * river3d.js — schematic Equation-42 river illustration.
 *
 * WHAT THIS IS: a small procedurally generated dendritic network (a few hundred
 * reaches) on which this file evaluates, in JavaScript, the same steady
 * donor-before-receptor recurrence used by the RAPID-Chem snapshot operator:
 *
 *     phi_i = exp(-(5/3) * alpha_i * k_i)
 *     q_i   = phi_i * (Rc_i + sum of upstream q)
 *     C_i   = q_i / Q_i
 *
 * WHAT THIS IS NOT: it is not JAX, it is not a saved model run, it is not the
 * 64,579-reach MERIT network, and no number shown here is a scientific result.
 * Every published result on this page comes from the tested Python package.
 *
 * Three.js r0.180.0 is vendored locally (assets/vendor/three.module.min.js).
 */

import * as THREE from "./vendor/three.module.min.js";

const mount = document.getElementById("river3d-canvas");
if (mount) initialise(mount);

function initialise(container) {
  const statusEl = document.getElementById("river3d-status");
  const fallbackEl = document.getElementById("river3d-fallback");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------------------------------------------------------------- network
  // Deterministic PRNG so the illustration is identical in every browser.
  const mulberry32 = (seed) => () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const buildNetwork = () => {
    const random = mulberry32(20260908);
    // node 0 is the outlet; every other node drains to `parent`.
    const nodes = [{ x: 10.5, y: 0, z: 0, parent: -1, depth: 0 }];
    const grow = (parentIndex, angle, length, depth) => {
      if (depth > 8 || nodes.length > 230) return;
      const branches = depth < 3 ? 2 : random() < 0.8 ? 2 : 1;
      for (let b = 0; b < branches; b += 1) {
        const spread = branches === 1 ? (random() - 0.5) * 0.5 : (b === 0 ? -1 : 1) * (0.34 + random() * 0.42);
        const nextAngle = angle + spread;
        const nextLength = length * (0.72 + random() * 0.2);
        const parent = nodes[parentIndex];
        const index = nodes.push({
          x: parent.x - Math.cos(nextAngle) * nextLength,
          y: parent.y + (random() - 0.3) * 0.28 + nextLength * 0.16,
          z: parent.z + Math.sin(nextAngle) * nextLength,
          parent: parentIndex,
          depth,
        }) - 1;
        grow(index, nextAngle, nextLength, depth + 1);
      }
    };
    grow(0, 0, 2.75, 1);
    return nodes;
  };

  const nodes = buildNetwork();
  const reachCount = nodes.length;
  const children = nodes.map(() => []);
  nodes.forEach((node, index) => { if (node.parent >= 0) children[node.parent].push(index); });
  const isHeadwater = children.map((list) => list.length === 0);

  // Downstream-last ordering: every donor is evaluated before its receptor.
  const order = [];
  {
    const remaining = children.map((list) => list.length);
    const stack = [];
    for (let i = 0; i < reachCount; i += 1) if (remaining[i] === 0) stack.push(i);
    while (stack.length) {
      const index = stack.pop();
      order.push(index);
      const parent = nodes[index].parent;
      if (parent >= 0 && --remaining[parent] === 0) stack.push(parent);
    }
  }

  const xs = nodes.map((node) => node.x);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  // Reach travel time k (days) from segment length; the draft's residence time is 5k/3.
  const travelTime = nodes.map((node) => {
    if (node.parent < 0) return 0.9;
    const parent = nodes[node.parent];
    const dx = node.x - parent.x;
    const dy = node.y - parent.y;
    const dz = node.z - parent.z;
    return 0.28 + Math.sqrt(dx * dx + dy * dy + dz * dz) * 0.34;
  });
  // West-to-east rate contrast, echoing the five longitude classes of the OSSE.
  const gradedRate = nodes.map((node) => {
    const east = (node.x - xMin) / (xMax - xMin);
    return 0.03 + 0.32 * east * east;
  });
  const uniformRate = nodes.map(() => 0.1);

  // -------------------------------------------------------------- solution
  const localWater = new Float64Array(reachCount).fill(1);
  const localInput = new Float64Array(reachCount).fill(1); // 1 mg/L of the local water
  const totalWater = new Float64Array(reachCount);
  const chemFlux = new Float64Array(reachCount);
  const concentration = new Float64Array(reachCount);
  const transmitted = new Float64Array(reachCount);
  let activeRate = gradedRate;

  const solve = (rateField, rateScale) => {
    totalWater.fill(0);
    chemFlux.fill(0);
    for (let n = 0; n < order.length; n += 1) {
      const i = order[n];
      const alpha = rateField[i] * rateScale;
      const phi = Math.exp(-(5 / 3) * alpha * travelTime[i]);
      transmitted[i] = phi;
      totalWater[i] += localWater[i];
      chemFlux[i] = phi * (localInput[i] + chemFlux[i]);
      concentration[i] = chemFlux[i] / totalWater[i];
      const parent = nodes[i].parent;
      if (parent >= 0) {
        totalWater[parent] += totalWater[i];
        chemFlux[parent] += chemFlux[i];
      }
    }
  };

  // ------------------------------------------------------------ renderer
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
  } catch {
    renderer = null;
  }
  if (!renderer || !renderer.getContext()) {
    container.hidden = true;
    if (fallbackEl) fallbackEl.hidden = false;
    if (statusEl) statusEl.textContent = "WebGL unavailable — showing the static plan-view illustration instead.";
    return;
  }

  if (fallbackEl) fallbackEl.hidden = true;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  // Clear transparent so the panel's CSS background is the single source of
  // truth for the backdrop colour, whatever colour space the renderer uses.
  renderer.setClearColor(0x061a22, 0);
  renderer.domElement.setAttribute("role", "img");
  renderer.domElement.setAttribute("aria-label",
    "Rotatable schematic river network. Colour shows tracer concentration falling downstream as decay removes mass.");
  container.append(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x061a22, 22, 60);
  const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 200);
  scene.add(new THREE.AmbientLight(0xbcd6dd, 1.15));
  const key = new THREE.DirectionalLight(0xffffff, 1.35);
  key.position.set(-6, 12, 8);
  scene.add(key);

  // Colour ramp: deep water -> blue -> mint -> warm, i.e. dark = depleted.
  const rampStops = [
    [0.00, 0x0a2a34], [0.28, 0x2f6f96], [0.55, 0x3ea6ff], [0.78, 0x63e6be], [1.00, 0xffad66],
  ].map(([stop, hex]) => ({ stop, color: new THREE.Color(hex) }));
  const rampColor = (t, target) => {
    const value = Math.min(1, Math.max(0, t));
    for (let i = 1; i < rampStops.length; i += 1) {
      if (value <= rampStops[i].stop) {
        const a = rampStops[i - 1];
        const b = rampStops[i];
        return target.copy(a.color).lerp(b.color, (value - a.stop) / (b.stop - a.stop));
      }
    }
    return target.copy(rampStops[rampStops.length - 1].color);
  };

  // One instanced cylinder per reach; no per-reach draw call.
  const reachGeometry = new THREE.CylinderGeometry(1, 1, 1, 7, 1, true);
  const reachMaterial = new THREE.MeshLambertMaterial({ vertexColors: false });
  const reaches = new THREE.InstancedMesh(reachGeometry, reachMaterial, reachCount - 1);
  reaches.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  reaches.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array((reachCount - 1) * 3), 3);
  scene.add(reaches);

  const zs = nodes.map((node) => node.z);
  const ys = nodes.map((node) => node.y);
  const centre = new THREE.Vector3(
    (xMin + xMax) / 2,
    (Math.min(...ys) + Math.max(...ys)) / 2,
    (Math.min(...zs) + Math.max(...zs)) / 2,
  );
  // Frame on the real bounding box rather than a hand-tuned camera distance.
  const extent = Math.max(xMax - xMin, Math.max(...zs) - Math.min(...zs));
  const framedRadius = Math.min(34, Math.max(15, extent * 1.35));

  // Fixed geometry: a reach is the segment from its own node to its receptor.
  const segmentIndex = [];
  {
    const matrix = new THREE.Matrix4();
    const from = new THREE.Vector3();
    const to = new THREE.Vector3();
    const mid = new THREE.Vector3();
    const direction = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    let instance = 0;
    for (let i = 0; i < reachCount; i += 1) {
      const parent = nodes[i].parent;
      if (parent < 0) continue;
      from.set(nodes[i].x, nodes[i].y, nodes[i].z).sub(centre);
      to.set(nodes[parent].x, nodes[parent].y, nodes[parent].z).sub(centre);
      mid.copy(from).add(to).multiplyScalar(0.5);
      direction.copy(to).sub(from);
      const length = direction.length();
      quaternion.setFromUnitVectors(up, direction.clone().normalize());
      // Trunk reaches are drawn thicker: radius grows with contributing area.
      const radius = 0.055 + 0.135 / (1 + nodes[i].depth * 0.62);
      scale.set(radius, length, radius);
      matrix.compose(mid, quaternion, scale);
      reaches.setMatrixAt(instance, matrix);
      segmentIndex.push(i);
      instance += 1;
    }
    reaches.instanceMatrix.needsUpdate = true;
  }

  // Headwater markers make the pulse origins unmistakable.
  const headwaterIndices = [];
  for (let i = 0; i < reachCount; i += 1) if (isHeadwater[i]) headwaterIndices.push(i);
  const headwaterGeometry = new THREE.SphereGeometry(0.17, 10, 8);
  const headwaterMaterial = new THREE.MeshBasicMaterial({ color: 0xffad66 });
  const headwaters = new THREE.InstancedMesh(headwaterGeometry, headwaterMaterial, headwaterIndices.length);
  {
    const matrix = new THREE.Matrix4();
    headwaterIndices.forEach((i, instance) => {
      matrix.makeTranslation(nodes[i].x - centre.x, nodes[i].y - centre.y, nodes[i].z - centre.z);
      headwaters.setMatrixAt(instance, matrix);
    });
  }
  scene.add(headwaters);

  const outletGeometry = new THREE.SphereGeometry(0.3, 14, 10);
  const outlet = new THREE.Mesh(outletGeometry, new THREE.MeshBasicMaterial({ color: 0xf5f3eb }));
  outlet.position.set(nodes[0].x - centre.x, nodes[0].y - centre.y, nodes[0].z - centre.z);
  scene.add(outlet);

  // Tracer particles: each rides one reach, then hands over to its receptor.
  const particleCount = reducedMotion ? 0 : 260;
  const particlePositions = new Float32Array(Math.max(particleCount, 1) * 3);
  const particleColors = new Float32Array(Math.max(particleCount, 1) * 3);
  const particleReach = new Int32Array(Math.max(particleCount, 1));
  const particleProgress = new Float32Array(Math.max(particleCount, 1));
  const particleGeometry = new THREE.BufferGeometry();
  particleGeometry.setAttribute("position", new THREE.BufferAttribute(particlePositions, 3));
  particleGeometry.setAttribute("color", new THREE.BufferAttribute(particleColors, 3));
  const particles = new THREE.Points(particleGeometry, new THREE.PointsMaterial({
    size: 0.17, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false,
  }));
  if (particleCount) {
    const random = mulberry32(4242);
    for (let p = 0; p < particleCount; p += 1) {
      particleReach[p] = headwaterIndices[Math.floor(random() * headwaterIndices.length)];
      particleProgress[p] = random();
    }
    scene.add(particles);
  }

  // ------------------------------------------------------------- controls
  const rateInput = document.getElementById("river3d-rate");
  const rateOutput = document.getElementById("river3d-rate-value");
  const fieldInputs = [...document.querySelectorAll("input[name='river3d-field']")];
  const viewSelect = document.getElementById("river3d-view");
  const playButton = document.getElementById("river3d-play");
  const resetButton = document.getElementById("river3d-reset");
  const readout = document.getElementById("river3d-readout");
  const scaleLow = document.getElementById("river3d-scale-low");
  const scaleHigh = document.getElementById("river3d-scale-high");
  const scaleLabel = document.getElementById("river3d-scale-label");

  let playing = !reducedMotion;
  const colour = new THREE.Color();

  const paint = () => {
    const rateScale = Number(rateInput.value);
    solve(activeRate, rateScale);
    const view = viewSelect.value;
    let values;
    let low;
    let high;
    let label;
    let unit;
    if (view === "rate") {
      values = segmentIndex.map((i) => activeRate[i] * rateScale);
      label = "Decay rate α";
      unit = "/day";
    } else if (view === "water") {
      values = segmentIndex.map((i) => Math.log10(totalWater[i]));
      label = "Water discharge (log₁₀, arbitrary units)";
      unit = "";
    } else {
      values = segmentIndex.map((i) => concentration[i]);
      label = "Tracer concentration";
      unit = " mg/L";
    }
    low = Math.min(...values);
    high = Math.max(...values);
    const span = high - low || 1;
    for (let instance = 0; instance < values.length; instance += 1) {
      rampColor((values[instance] - low) / span, colour);
      reaches.setColorAt(instance, colour);
    }
    reaches.instanceColor.needsUpdate = true;

    rateOutput.textContent = `×${rateScale.toFixed(2)}`;
    scaleLabel.textContent = label;
    const decimals = view === "water" ? 2 : 3;
    scaleLow.textContent = low.toFixed(decimals) + unit;
    scaleHigh.textContent = high.toFixed(decimals) + unit;

    const outletConcentration = concentration[0];
    const headwaterMean = headwaterIndices.reduce((sum, i) => sum + concentration[i], 0) / headwaterIndices.length;
    const alphaLow = Math.min(...activeRate.map((value) => value * rateScale));
    const alphaHigh = Math.max(...activeRate.map((value) => value * rateScale));
    readout.innerHTML =
      `<span><b>${outletConcentration.toFixed(3)}</b> mg/L at the outlet</span>` +
      `<span><b>${headwaterMean.toFixed(3)}</b> mg/L mean at headwaters</span>` +
      `<span><b>${(100 * (1 - outletConcentration / headwaterMean)).toFixed(1)}%</b> lost along the network</span>` +
      `<span>α ${alphaLow.toFixed(3)}–${alphaHigh.toFixed(3)}/day</span>`;
  };

  rateInput.addEventListener("input", paint);
  viewSelect.addEventListener("change", paint);
  fieldInputs.forEach((input) => input.addEventListener("change", () => {
    const chosen = document.querySelector("input[name='river3d-field']:checked");
    activeRate = chosen && chosen.value === "uniform" ? uniformRate : gradedRate;
    paint();
  }));
  resetButton.addEventListener("click", () => {
    rateInput.value = "1";
    viewSelect.value = "concentration";
    const graded = document.querySelector("input[name='river3d-field'][value='graded']");
    if (graded) graded.checked = true;
    activeRate = gradedRate;
    spherical.radius = framedRadius;
    spherical.theta = 0.62;
    spherical.phi = 1.02;
    applyCamera();
    paint();
  });

  const setPlaying = (next) => {
    playing = next;
    playButton.setAttribute("aria-pressed", String(playing));
    playButton.textContent = playing ? "Pause flow" : "Play flow";
  };
  playButton.addEventListener("click", () => setPlaying(!playing));
  setPlaying(playing);
  if (!particleCount) {
    playButton.disabled = true;
    playButton.textContent = "Flow paused (reduced motion)";
  }

  // Pointer orbit. Deliberately no keyboard capture: arrow keys stay with the deck.
  const spherical = { radius: framedRadius, theta: 0.62, phi: 1.02 };
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  const applyCamera = () => {
    camera.position.set(
      spherical.radius * Math.sin(spherical.phi) * Math.cos(spherical.theta),
      spherical.radius * Math.cos(spherical.phi),
      spherical.radius * Math.sin(spherical.phi) * Math.sin(spherical.theta),
    );
    camera.lookAt(0, 0, 0);
  };
  applyCamera();
  const element = renderer.domElement;
  element.style.touchAction = "none";
  element.addEventListener("pointerdown", (event) => {
    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
    element.setPointerCapture(event.pointerId);
  });
  element.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    spherical.theta -= (event.clientX - lastX) * 0.006;
    spherical.phi = Math.min(1.52, Math.max(0.24, spherical.phi - (event.clientY - lastY) * 0.005));
    lastX = event.clientX;
    lastY = event.clientY;
    applyCamera();
  });
  const endDrag = (event) => {
    dragging = false;
    if (element.hasPointerCapture?.(event.pointerId)) element.releasePointerCapture(event.pointerId);
  };
  element.addEventListener("pointerup", endDrag);
  element.addEventListener("pointercancel", endDrag);
  element.addEventListener("wheel", (event) => {
    event.preventDefault();
    spherical.radius = Math.min(framedRadius * 1.8, Math.max(framedRadius * 0.5, spherical.radius + Math.sign(event.deltaY) * 1.2));
    applyCamera();
  }, { passive: false });

  const resize = () => {
    const width = container.clientWidth;
    const height = Math.max(260, Math.round(width * 0.56));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  resize();
  if ("ResizeObserver" in window) new ResizeObserver(resize).observe(container);
  else window.addEventListener("resize", resize);

  // ---------------------------------------------------------------- loop
  const from = new THREE.Vector3();
  const to = new THREE.Vector3();
  const stepParticles = (delta) => {
    const random = Math.random;
    for (let p = 0; p < particleCount; p += 1) {
      let index = particleReach[p];
      particleProgress[p] += delta * (0.34 + 0.5 / (1 + nodes[index].depth * 0.3));
      while (particleProgress[p] >= 1) {
        particleProgress[p] -= 1;
        const parent = nodes[index].parent;
        // Reaching the outlet respawns the particle at a random headwater.
        index = parent < 0 ? headwaterIndices[Math.floor(random() * headwaterIndices.length)] : parent;
        particleReach[p] = index;
      }
      const parent = nodes[index].parent;
      const target = parent < 0 ? index : parent;
      from.set(nodes[index].x, nodes[index].y, nodes[index].z).sub(centre);
      to.set(nodes[target].x, nodes[target].y, nodes[target].z).sub(centre);
      const t = particleProgress[p];
      particlePositions[p * 3] = from.x + (to.x - from.x) * t;
      particlePositions[p * 3 + 1] = from.y + (to.y - from.y) * t + 0.06;
      particlePositions[p * 3 + 2] = from.z + (to.z - from.z) * t;
      // Particle brightness tracks the transmitted fraction of its own reach.
      rampColor(0.18 + 0.82 * transmitted[index], colour);
      particleColors[p * 3] = colour.r;
      particleColors[p * 3 + 1] = colour.g;
      particleColors[p * 3 + 2] = colour.b;
    }
    particleGeometry.attributes.position.needsUpdate = true;
    particleGeometry.attributes.color.needsUpdate = true;
  };

  let visible = false;
  let frame = 0;
  let previous = performance.now();
  const tick = (now) => {
    frame = requestAnimationFrame(tick);
    const delta = Math.min(0.05, (now - previous) / 1000);
    previous = now;
    if (playing && particleCount) stepParticles(delta);
    renderer.render(scene, camera);
  };
  const start = () => {
    if (frame) return;
    previous = performance.now();
    frame = requestAnimationFrame(tick);
  };
  const stop = () => {
    if (!frame) return;
    cancelAnimationFrame(frame);
    frame = 0;
  };

  paint();
  if (particleCount) stepParticles(0);
  renderer.render(scene, camera);
  if (statusEl) {
    statusEl.textContent = `Schematic network: ${reachCount} reaches, ${headwaterIndices.length} headwater sources, one outlet. Drag to rotate, scroll to zoom.`;
  }

  // Only animate while the slide is on screen.
  if ("IntersectionObserver" in window) {
    new IntersectionObserver((entries) => {
      visible = entries[0].isIntersecting;
      if (visible) start(); else stop();
    }, { threshold: 0.05 }).observe(container);
  } else {
    start();
  }
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop(); else if (visible) start();
  });
}
