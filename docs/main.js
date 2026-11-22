import { SpaceView, format } from "./space-view.js";

const LIMITS = Object.freeze({ coefficientMagnitude: 10000, coordinateMagnitude: 10000, vectorCount: 24, gridRadius: 3 });
const COLORS = ["#a24c00", "#7e368a", "#087e75", "#b22f4c", "#567314", "#405ac0"];
const $ = id => document.getElementById(id);
const superscript = n => ["", "¹", "²", "³"][n];
let state = { text: "1 0\n0 1", sourceDimension: 2, vectors: [] };
let scene = null, selectedVector = null, vectorNumber = 0;
let worker, ready = false, pending = null, queued = null, revision = 0, requestId = 0;
let mode = "draw";
const space = new SpaceView($("space"), {
  draw: drawVector,
  select: selectVector,
  error: message => { $("vector-error").textContent = message; },
});

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function lock() {
  document.querySelectorAll("[data-compute]").forEach(control => { control.disabled = !ready || Boolean(pending || queued); });
  $("clear-vectors").disabled ||= !state.vectors.length;
}

function compute(candidate, { refit = false, error = "vector-error", select = selectedVector } = {}) {
  if (!ready) return;
  queued = { id: ++requestId, revision: ++revision, candidate, refit, error, select };
  $(error).textContent = "";
  sendNext();
}

function sendNext() {
  if (pending || !queued) return;
  pending = queued;
  queued = null;
  $("status").textContent = "Calculating…";
  worker.postMessage({ id: pending.id, revision: pending.revision, payload: { ...pending.candidate, limits: LIMITS } });
  lock();
}

function startWorker() {
  worker?.terminate();
  ready = false;
  pending = queued = null;
  revision++;
  $("retry").hidden = true;
  $("status").dataset.state = "loading";
  $("status").textContent = "Loading Python…";
  lock();
  if (location.protocol === "file:") {
    $("status").textContent = "Open this page through an HTTP server; Python workers cannot run from file URLs.";
    return;
  }
  let current, startupTimer;
  const failed = message => {
    if (worker !== current) return;
    clearTimeout(startupTimer);
    current?.terminate();
    ready = false;
    pending = queued = null;
    $("status").dataset.state = "error";
    $("status").textContent = `Python unavailable. ${message} The last applied scene is preserved.`;
    $("retry").hidden = false;
    lock();
  };
  try {
    current = new Worker(new URL("./transformation-worker.js", import.meta.url), { type: "module" });
    worker = current;
  } catch (error) {
    worker = current;
    failed(error.message);
    return;
  }
  startupTimer = setTimeout(() => failed("Loading timed out. Check your connection and retry."), 120000);
  current.onerror = event => failed(event.message || "Could not start the worker.");
  current.onmessage = ({ data }) => {
    if (worker !== current || !current) return;
    if (data.type === "loading") { $("status").textContent = data.message; return; }
    if (data.type === "fatal") { failed(data.error); return; }
    if (data.type === "ready") {
      clearTimeout(startupTimer);
      ready = true;
      compute(structuredClone(state), { refit: !scene, error: "matrix-error" });
      return;
    }
    if (!pending || data.id !== pending.id || data.revision !== pending.revision) return;
    const request = pending;
    pending = null;
    // A drag can queue a newer endpoint while Python calculates the previous one.
    if (data.revision === revision) {
      if (data.error) {
        const detail = data.error.trim().split("\n").at(-1).replace(/^ValueError: /, "");
        $(request.error).textContent = `${detail} The displayed result still belongs to the last applied matrix.`;
        if (request.error === "matrix-error") $("matrix-input").setAttribute("aria-invalid", "true");
        $("status").textContent = "Ready. Input was not applied.";
      } else {
        scene = data.scene;
        state = { ...request.candidate, sourceDimension: scene.n, vectors: scene.vectors };
        selectedVector = state.vectors.some(v => v.id === request.select) ? request.select : null;
        $("matrix-input").removeAttribute("aria-invalid");
        refresh(request.refit);
        $("status").dataset.state = "ready";
        $("status").textContent = scene.cleared ? "Ready. Source dimension changed; incompatible vectors were cleared." : "Ready. Calculations stay in this browser.";
      }
    }
    sendNext();
    lock();
  };
}

function updateView(refit = false) {
  if (!scene) return;
  space.update(scene, {
    mode, selectedVector,
    sourceGrid: $("source-grid").checked,
    transformedGrid: $("transformed-grid").checked,
    basis: $("basis").checked,
    plane: $("plane").value,
    fixed: $("fixed-coordinate").valueAsNumber,
    enabled: ready,
  }, refit);
}

function coordinateInputs() {
  const selected = state.vectors.find(vector => vector.id === selectedVector);
  $("coordinates").replaceChildren();
  for (let i = 0; i < state.sourceDimension; i++) {
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
  $("save-vector").textContent = selected ? `Update ${selected.id}` : "Add vector";
}

function readout(label, values) {
  const row = element("span", `${label} = `, "readout");
  const column = element("span", undefined, "column-vector");
  column.setAttribute("aria-label", `(${values.map(format).join(", ")})`);
  values.forEach(value => column.append(element("span", format(value))));
  row.append(column);
  return row;
}

function selectVector(id) {
  selectedVector = id;
  coordinateInputs();
  vectorList();
  updateView();
}

function vectorList() {
  const list = $("vector-list");
  list.replaceChildren();
  if (!state.vectors.length) list.append(element("p", "No user vectors. Draw in the view or enter source coordinates."));
  for (const vector of state.vectors) {
    const row = element("div", undefined, `vector-row${vector.id === selectedVector ? " selected" : ""}`);
    row.style.color = vector.color;
    const heading = element("div", undefined, "row-heading");
    const select = element("button", vector.id, "select-vector");
    select.type = "button";
    select.setAttribute("aria-pressed", String(vector.id === selectedVector));
    select.setAttribute("aria-label", `Select ${vector.id} and A${vector.id}`);
    select.addEventListener("click", () => selectVector(vector.id));
    const remove = element("button", "Remove");
    remove.type = "button";
    remove.dataset.compute = "";
    remove.setAttribute("aria-label", `Remove ${vector.id}`);
    remove.addEventListener("click", () => compute({ ...structuredClone(state), vectors: state.vectors.filter(v => v.id !== vector.id) }));
    heading.append(select, remove);
    const values = element("div", undefined, "readouts");
    values.append(readout(vector.id, vector.coords), readout(`A${vector.id}`, scene.images[vector.id]));
    row.append(heading, values);
    list.append(row);
  }
  lock();
}

function refresh(refit) {
  if (scene) {
    $("mapping").textContent = `${scene.m} × ${scene.n} · T: R${superscript(scene.n)} → R${superscript(scene.m)}`;
    $("space-label").textContent = `Source space R${superscript(scene.n)} · Target space R${superscript(scene.m)}`;
    $("view-context").textContent = `Common origin · Equal unit scale · Fixed reference axes${Math.max(scene.n, scene.m) === 3 ? " · Orthographic projection" : ""}`;
  }
  $("drawing-plane").hidden = state.sourceDimension !== 3;
  coordinateInputs();
  vectorList();
  updateView(refit);
}

function newVector(coords) {
  const number = ++vectorNumber;
  return { id: `v${number}`, color: COLORS[(number - 1) % COLORS.length], coords };
}

function drawVector(coords, id) {
  if (!ready || (pending && !pending.drag)) return null;
  if (!coords.every(value => Number.isFinite(value) && Math.abs(value) <= LIMITS.coordinateMagnitude)) {
    $("vector-error").textContent = `Source coordinates must be finite with magnitude at most ${LIMITS.coordinateMagnitude}.`;
    return null;
  }
  const candidate = structuredClone(queued?.candidate ?? pending?.candidate ?? state);
  let vector = candidate.vectors.find(v => v.id === id);
  if (!vector) {
    if (candidate.vectors.length >= LIMITS.vectorCount) {
      $("vector-error").textContent = `Use at most ${LIMITS.vectorCount} vectors.`;
      return null;
    }
    vector = newVector(coords);
    candidate.vectors.push(vector);
  }
  vector.coords = coords;
  compute(candidate, { select: vector.id });
  if (pending) pending.drag = true;
  if (queued) queued.drag = true;
  return vector.id;
}

$("matrix-form").addEventListener("submit", event => {
  event.preventDefault();
  if (!ready || pending) return;
  compute({ ...structuredClone(state), text: $("matrix-input").value }, { refit: true, error: "matrix-error" });
});
$("matrix-input").addEventListener("input", () => {
  if (scene && $("matrix-input").value !== state.text) $("status").textContent = "Draft changed. The view shows the last applied matrix; choose Apply to update.";
});
$("vector-form").addEventListener("submit", event => {
  event.preventDefault();
  if (!ready || pending) return;
  const coords = [...$("coordinates").querySelectorAll("input")].map(input => input.valueAsNumber);
  const candidate = structuredClone(state);
  let vector = candidate.vectors.find(v => v.id === selectedVector);
  if (!vector) { vector = newVector(coords); candidate.vectors.push(vector); }
  vector.coords = coords;
  compute(candidate, { select: vector.id });
});
$("new-vector").addEventListener("click", () => selectVector(null));
$("clear-vectors").addEventListener("click", () => compute({ ...structuredClone(state), vectors: [] }, { select: null }));
for (const id of ["source-grid", "transformed-grid", "basis", "plane", "fixed-coordinate"]) {
  $(id).addEventListener("change", () => {
    $("fixed-label").textContent = `Fixed ${{ XY: "z", XZ: "y", YZ: "x" }[$("plane").value]}`;
    updateView();
  });
}
$("fixed-coordinate").addEventListener("input", () => updateView());
for (const value of ["draw", "rotate"]) $(`${value}-mode`).addEventListener("click", () => {
  mode = value;
  $("draw-mode").setAttribute("aria-pressed", String(mode === "draw"));
  $("rotate-mode").setAttribute("aria-pressed", String(mode === "rotate"));
  $("interaction-hint").textContent = mode === "draw" ? "Draw: click or drag a source endpoint. Scroll to zoom." : "Rotate: hold the left mouse button and drag. Scroll to zoom.";
  updateView();
});
$("zoom-in").addEventListener("click", () => space.changeZoom(1.25));
$("zoom-out").addEventListener("click", () => space.changeZoom(0.8));
$("reset-view").addEventListener("click", () => space.reset());
$("retry").addEventListener("click", startWorker);
$("fixed-coordinate").min = -LIMITS.coordinateMagnitude;
$("fixed-coordinate").max = LIMITS.coordinateMagnitude;
refresh(false);
startWorker();
