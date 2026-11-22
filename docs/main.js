import { SpaceView, format, transitionGeometry } from "./space-view.js?v=restore-1";

const LIMITS = Object.freeze({ coefficientMagnitude: 10000, coordinateMagnitude: 10000, matrixCount: 8, vectorCount: 24, gridRadius: 10, pointSamples: 5 });
const MATRIX_COLORS = ["#2166ac", "#a33a20", "#6b4ca5", "#00816c", "#ad6600", "#9b3973", "#4b701e", "#626262"];
const VECTOR_COLORS = ["#b14e00", "#7e368a", "#087e75", "#b22f4c", "#567314", "#405ac0"];
const $ = id => document.getElementById(id);
const space = new SpaceView($("space"));
const superscript = n => ["", "¹", "²", "³"][n];
let state = { matrices: [], vectors: [] }, scene = null;
let selectedMatrix = null, selectedVector = null, editorMatrix = null, sourceDimension = 2;
let matrixNumber = 0, vectorNumber = 0, revision = 0, worker, ready = false, pending = null;
let vectorPage = 0;
let animation = { from: "identity", to: "identity", progress: 0 };
let animationFrame = null, preview = null;
let animationActive = false;

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function lock() {
  document.querySelectorAll("[data-compute]").forEach(button => { button.disabled = !ready || Boolean(pending); });
  $("remove-matrix").disabled ||= !editorMatrix;
  $("clear-vectors").disabled ||= !state.vectors.length;
  document.querySelectorAll("[data-animation]").forEach(control => { control.disabled = !ready || Boolean(pending); });
}

function compute(candidate, { success = () => {}, error = "matrix-error", message = "Ready." } = {}) {
  if (!ready || pending) return;
  stopPlayback();
  revision++;
  pending = { id: revision, revision, candidate, success, error, message };
  $(error).textContent = "";
  $("status").textContent = "Calculating…";
  lock();
  worker.postMessage({ id: revision, revision, payload: { state: candidate, limits: LIMITS } });
}

function startWorker() {
  stopPlayback();
  worker?.terminate();
  ready = false;
  pending = null;
  $("retry").hidden = true;
  $("status").textContent = "Loading Python…";
  lock();
  if (location.protocol === "file:") {
    $("status").textContent = "Open this page through a local HTTP server. Python workers cannot run from file:// URLs.";
    return;
  }
  let current, startupTimer;
  try {
    current = new Worker(new URL("./transformation-worker.js?v=restore-1", import.meta.url), { type: "module" });
  } catch (error) {
    $("status").textContent = `Could not start Python: ${error.message}`;
    $("retry").hidden = false;
    return;
  }
  worker = current;
  const failed = message => {
    if (worker !== current) return;
    clearTimeout(startupTimer);
    current.terminate();
    worker = null;
    ready = false;
    pending = null;
    $("status").textContent = `Python unavailable. ${message} The last applied scene is preserved.`;
    $("retry").hidden = false;
    lock();
  };
  startupTimer = setTimeout(() => failed("Loading timed out. Check your connection to cdn.jsdelivr.net, then retry."), 45000);
  current.onerror = event => failed(event.message || "Could not initialize the worker.");
  current.onmessage = ({ data }) => {
    if (worker !== current) return;
    if (data.type === "loading") { $("status").textContent = data.message; return; }
    if (data.type === "fatal") return failed(data.error);
    if (data.type === "ready") {
      clearTimeout(startupTimer);
      ready = true;
      compute(structuredClone(state));
      return;
    }
    if (!pending || data.id !== pending.id || data.revision !== revision) return;
    const request = pending;
    pending = null;
    if (data.error) {
      const detail = data.error.trim().split("\n").at(-1).replace(/^ValueError: /, "");
      $(request.error).textContent = `${detail} The displayed scene still uses the last applied state.`;
      $("status").textContent = "Ready. Input was not applied.";
    } else {
      state = request.candidate;
      scene = data.scene;
      for (const matrix of state.matrices) {
        const result = scene.matrices.find(entry => entry.id === matrix.id);
        matrix.m = result.m;
        matrix.n = result.n;
        matrix.matrix = result.matrix;
        matrix.isIdentity = result.isIdentity;
      }
      request.success();
      refresh();
      $("status").textContent = request.message;
    }
    lock();
  };
}

function updateView() {
  if (!scene) return;
  // Visibility and selection are presentation state; Python results stay untouched.
  scene.matrices.forEach(matrix => { matrix.visible = state.matrices.find(entry => entry.id === matrix.id).visible; });
  scene.vectors.forEach(vector => { vector.visible = state.vectors.find(entry => entry.id === vector.id).visible; });
  const { from, to } = animationEndpoints();
  preview = transitionGeometry(from, to, animation.progress);
  const dimension = space.update(scene, {
    sourceDimension, selectedMatrix: animationActive ? "preview" : selectedMatrix, selectedVector,
    preview: animationActive ? preview : null, endpoints: animationActive ? [from, to] : null,
    transformedGrid: $("transformed-grid").checked,
    points: $("points").checked,
    basis: $("basis").checked,
  });
  $("points-legend").hidden = !$("points").checked;
  $("space-label").textContent = `Shared display R${superscript(dimension)} · Common origin and unit scale${dimension === 3 ? " · Orthographic view" : ""}`;
  $("animation-progress").value = animation.progress * 100;
  $("animation-percent").value = `${Math.round(animation.progress * 100)}%`;
  const listVector = state.vectors.filter(vector => vector.coords.length === sourceDimension)[vectorPage];
  $("animation-vector").replaceChildren();
  if (listVector && preview.images[listVector.id]) {
    const label = from.m !== to.m && animation.progress > 0 && animation.progress < 1 ? "Display" : "T";
    $("animation-vector").append(readout(`${label}${listVector.name}`, preview.images[listVector.id], true));
  }
}

function animationEndpoints() {
  const fromMatrix = scene?.matrices.find(matrix => matrix.id === animation.from);
  const toMatrix = scene?.matrices.find(matrix => matrix.id === animation.to);
  const n = fromMatrix?.n ?? toMatrix?.n ?? sourceDimension;
  return { from: fromMatrix ?? scene?.identities[n], to: toMatrix ?? scene?.identities[n] };
}

function refreshAnimation() {
  const from = state.matrices.find(matrix => matrix.id === animation.from);
  if (!from || from.isIdentity) animation.from = "identity";
  if (!state.matrices.some(matrix => matrix.id === animation.to && !matrix.isIdentity && (animation.from === "identity" || matrix.n === from.n))) animation.to = "identity";
  for (const key of ["from", "to"]) {
    const select = $(`animation-${key}`);
    select.replaceChildren(new Option("Identity", "identity"));
    for (const matrix of state.matrices) {
      if (matrix.isIdentity || (key === "to" && animation.from !== "identity" && matrix.n !== from.n)) continue;
      select.add(new Option(`${matrix.name} · ${matrix.m} × ${matrix.n}`, matrix.id));
    }
    select.value = animation[key];
  }
  const endpoints = animationEndpoints();
  if (endpoints.from) {
    sourceDimension = endpoints.from.n;
    const description = matrix => `${matrix.name}: R${superscript(matrix.n)} → R${superscript(matrix.m)}`;
    $("animation-context").textContent = `${description(endpoints.from)} · ${description(endpoints.to)}${endpoints.from.m !== endpoints.to.m ? " · Display transition between different target dimensions." : ""}`;
  }
}

function stopPlayback() {
  if (animationFrame !== null) cancelAnimationFrame(animationFrame);
  animationFrame = null;
  $("animation-play").textContent = "Play";
}

function selectMatrix(id) {
  if (pending) return;
  stopPlayback();
  const matrix = state.matrices.find(entry => entry.id === id);
  selectedMatrix = matrix?.id ?? null;
  editorMatrix = selectedMatrix;
  if (matrix) sourceDimension = matrix.n;
  animation = { from: "identity", to: matrix?.id ?? "identity", progress: matrix ? 1 : 0 };
  animationActive = false;
  selectedVector = null;
  $("matrix-input").value = matrix?.text ?? identityText(sourceDimension);
  $("matrix-error").textContent = "";
  $("vector-error").textContent = "";
  refresh();
}

function identityText(n) {
  return Array.from({ length: n }, (_, row) => Array.from({ length: n }, (_, col) => Number(row === col)).join(" ")).join("\n");
}

function matrixList() {
  const list = $("matrix-list");
  list.replaceChildren();
  const original = element("button", "Identity", `select-item matrix-row${selectedMatrix ? "" : " selected"}`);
  original.type = "button";
  original.setAttribute("aria-pressed", String(!selectedMatrix));
  original.addEventListener("click", () => selectMatrix(null));
  list.append(original);
  for (const matrix of state.matrices) {
    const row = element("div", undefined, `matrix-row${matrix.id === selectedMatrix ? " selected" : ""}`);
    const heading = element("div", undefined, "row-heading");
    const visible = element("input");
    visible.type = "checkbox";
    visible.dataset.compute = "";
    visible.checked = matrix.visible;
    visible.setAttribute("aria-label", `Show ${matrix.name}`);
    visible.addEventListener("change", () => { matrix.visible = visible.checked; updateView(); });
    const swatch = element("span", undefined, "swatch");
    swatch.style.background = matrix.color;
    const button = element("button", `${matrix.name} · ${matrix.m} × ${matrix.n}`, "select-item");
    button.type = "button";
    button.setAttribute("aria-pressed", String(matrix.id === selectedMatrix));
    button.addEventListener("click", () => selectMatrix(matrix.id));
    heading.append(visible, swatch, button);
    row.append(heading);
    list.append(row);
  }
}

function coordinateInputs() {
  const selected = state.vectors.find(vector => vector.id === selectedVector);
  $("coordinates").replaceChildren();
  for (let i = 0; i < sourceDimension; i++) {
    const label = element("label", ["x", "y", "z"][i]);
    const input = element("input");
    input.type = "number";
    input.step = "any";
    input.required = true;
    input.min = -LIMITS.coordinateMagnitude;
    input.max = LIMITS.coordinateMagnitude;
    input.value = selected?.coords[i] ?? 0;
    input.name = `coordinate-${i}`;
    label.append(input);
    $("coordinates").append(label);
  }
  $("save-vector").textContent = selected ? `Update ${selected.name}` : "Add vector";
}

function readout(label, values, active = false) {
  const row = element("span", `${label} = `, `readout${active ? " active" : ""}`);
  const column = element("span", undefined, "column-vector");
  column.setAttribute("aria-label", `(${values.map(format).join(", ")})`);
  values.forEach(value => column.append(element("span", format(value))));
  row.append(column);
  return row;
}

function vectorList() {
  const list = $("vector-list");
  list.replaceChildren();
  const vectors = state.vectors.filter(vector => vector.coords.length === sourceDimension);
  vectorPage = Math.max(0, Math.min(vectorPage, vectors.length - 1));
  $("vector-pages").hidden = vectors.length < 2;
  $("vector-page").textContent = `${vectorPage + 1} / ${vectors.length}`;
  $("previous-vector").disabled = vectorPage === 0;
  $("next-vector").disabled = vectorPage >= vectors.length - 1;
  if (!vectors.length) list.append(element("p", "No vectors in this source space.", "hint"));
  for (const vector of vectors.slice(vectorPage, vectorPage + 1)) {
    const row = element("div", undefined, `vector-row${vector.id === selectedVector ? " selected" : ""}`);
    const heading = element("div", undefined, "row-heading");
    const visible = element("input");
    visible.type = "checkbox";
    visible.dataset.compute = "";
    visible.checked = vector.visible;
    visible.setAttribute("aria-label", `Show ${vector.name} and its images`);
    visible.addEventListener("change", () => { vector.visible = visible.checked; updateView(); });
    const swatch = element("span", undefined, "swatch");
    swatch.style.background = vector.color;
    const select = element("button", vector.name, "select-item");
    select.type = "button";
    select.setAttribute("aria-pressed", String(vector.id === selectedVector));
    select.addEventListener("click", () => {
      if (pending) return;
      selectedVector = vector.id;
      coordinateInputs();
      vectorList();
      updateView();
    });
    const remove = element("button", "Remove", "remove-vector");
    remove.type = "button";
    remove.dataset.compute = "";
    remove.setAttribute("aria-label", `Remove ${vector.name}`);
    remove.addEventListener("click", () => compute({ ...state, vectors: state.vectors.filter(entry => entry.id !== vector.id) }, {
      error: "vector-error", success: () => { if (selectedVector === vector.id) selectedVector = null; },
    }));
    heading.append(visible, swatch, select, remove);
    const values = element("div", undefined, "readouts");
    values.append(readout(vector.name, vector.coords, !selectedMatrix));
    for (const matrix of scene?.matrices ?? []) {
      if (matrix.images[vector.id]) values.append(readout(`${matrix.name}${vector.name}`, matrix.images[vector.id], matrix.id === selectedMatrix));
    }
    row.append(heading, values);
    list.append(row);
  }
  lock();
}

function refresh() {
  refreshAnimation();
  matrixList();
  const matrix = state.matrices.find(entry => entry.id === selectedMatrix);
  $("source-dimension").value = sourceDimension;
  $("source-dimension").disabled = animation.from !== "identity" || animation.to !== "identity";
  $("mapping").textContent = matrix
    ? `${matrix.name}: ${matrix.m} × ${matrix.n} · Source space R${superscript(matrix.n)} → Target space R${superscript(matrix.m)}`
    : `Identity · Source space R${superscript(sourceDimension)} → Target space R${superscript(sourceDimension)}`;
  $("vector-context").textContent = `Shared by all matrices with ${sourceDimension} column${sourceDimension === 1 ? "" : "s"}.`;
  $("apply").textContent = editorMatrix ? "Apply changes" : "Apply as new matrix";
  coordinateInputs();
  vectorList();
  updateView();
  lock();
}

$("matrix-form").addEventListener("submit", event => {
  event.preventDefault();
  if (!ready || pending) return;
  const candidate = structuredClone(state);
  const old = candidate.matrices.find(matrix => matrix.id === editorMatrix);
  const number = old ? null : ++matrixNumber;
  const color = MATRIX_COLORS.find(value => !state.matrices.some(matrix => matrix.color === value)) ?? MATRIX_COLORS[0];
  const entry = old ?? { id: `a${number}`, name: `A${number}`, color, visible: true };
  const oldDimension = old?.n;
  entry.text = $("matrix-input").value;
  if (!old) candidate.matrices.push(entry);
  compute(candidate, { success: () => {
    editorMatrix = selectedMatrix = entry.id;
    sourceDimension = entry.n;
    animation = { from: "identity", to: entry.id, progress: 1 };
    animationActive = false;
    selectedVector = null;
    if (oldDimension && oldDimension !== entry.n) {
      $("vector-error").textContent = "Source dimension changed. Existing vectors remain in their own dimension groups.";
    }
  } });
});

$("new-matrix").addEventListener("click", () => { selectMatrix(null); $("matrix-input").focus(); });
$("remove-matrix").addEventListener("click", () => compute({ ...state, matrices: state.matrices.filter(matrix => matrix.id !== editorMatrix) }, {
  success: () => { selectedMatrix = editorMatrix = null; selectedVector = null; $("matrix-input").value = identityText(sourceDimension); },
}));
$("source-dimension").addEventListener("change", event => {
  if (pending) { event.target.value = sourceDimension; return; }
  sourceDimension = Number(event.target.value);
  selectedVector = null;
  $("matrix-input").value = identityText(sourceDimension);
  refresh();
});

$("vector-form").addEventListener("submit", event => {
  event.preventDefault();
  if (!ready || pending) return;
  const inputs = [...$("coordinates").querySelectorAll("input")];
  if (inputs.some(input => !input.checkValidity())) return;
  const coords = inputs.map(input => input.valueAsNumber);
  if (!coords.every(Number.isFinite)) {
    $("vector-error").textContent = "Enter finite source coordinates.";
    return;
  }
  const candidate = structuredClone(state);
  let vector = candidate.vectors.find(entry => entry.id === selectedVector);
  if (!vector) {
    const number = ++vectorNumber;
    vector = { id: `v${number}`, name: `v${number}`, color: VECTOR_COLORS[(number - 1) % VECTOR_COLORS.length], visible: true };
    candidate.vectors.push(vector);
  }
  vector.coords = coords;
  compute(candidate, { error: "vector-error", success: () => {
    selectedVector = vector.id;
    vectorPage = state.vectors.filter(entry => entry.coords.length === sourceDimension).findIndex(entry => entry.id === vector.id);
  } });
});
$("new-vector").addEventListener("click", () => {
  if (pending) return;
  selectedVector = null;
  coordinateInputs();
  vectorList();
  updateView();
});
$("clear-vectors").addEventListener("click", () => compute({ ...state, vectors: [] }, {
  error: "vector-error", success: () => { selectedVector = null; },
}));
for (const id of ["transformed-grid", "points", "basis"]) $(id).addEventListener("change", () => updateView());
for (const plane of ["xy", "xz", "yz"]) $(`view-${plane}`).addEventListener("click", () => space.setPreset(plane));
for (const [id, step] of [["previous-vector", -1], ["next-vector", 1]]) $(id).addEventListener("click", () => {
  vectorPage += step;
  vectorList();
  updateView();
});
for (const key of ["from", "to"]) $(`animation-${key}`).addEventListener("change", event => {
  stopPlayback();
  animation[key] = event.target.value;
  animation.progress = 0;
  animationActive = true;
  selectedVector = null;
  refresh();
});
$("animation-progress").addEventListener("input", event => {
  stopPlayback();
  animation.progress = event.target.valueAsNumber / 100;
  animationActive = true;
  updateView();
});
$("animation-play").addEventListener("click", () => {
  if (animationFrame !== null) { stopPlayback(); return; }
  const seconds = $("animation-seconds");
  $("animation-error").textContent = "";
  if (!seconds.checkValidity() || !Number.isFinite(seconds.valueAsNumber)) {
    $("animation-error").textContent = "Enter a finite duration of at least 0.1 seconds.";
    seconds.reportValidity();
    return;
  }
  if (animation.progress >= 1) animation.progress = 0;
  if (!animationActive) {
    animationActive = true;
    updateView();
  }
  const initial = animation.progress, started = performance.now(), duration = seconds.valueAsNumber * 1000;
  $("animation-play").textContent = "Pause";
  const frame = now => {
    animation.progress = Math.min(1, initial + (now - started) / duration);
    updateView();
    if (animation.progress < 1) animationFrame = requestAnimationFrame(frame);
    else stopPlayback();
  };
  animationFrame = requestAnimationFrame(frame);
});
$("zoom-in").addEventListener("click", () => space.changeZoom(1.25));
$("zoom-out").addEventListener("click", () => space.changeZoom(0.8));
$("reset-view").addEventListener("click", () => space.reset());
$("retry").addEventListener("click", startWorker);
refresh();
startWorker();
