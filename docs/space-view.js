const NS = "http://www.w3.org/2000/svg";
const AXES = ["x", "y", "z"];

export function format(value) {
  if (value === 0) return "0";
  const rounded = Number(value.toPrecision(5));
  return Math.abs(rounded) >= 1e5 || Math.abs(rounded) < 1e-3
    ? rounded.toExponential(3) : String(rounded);
}

export class SpaceView {
  constructor(svg, callbacks) {
    this.svg = svg;
    this.callbacks = callbacks;
    this.dimension = 2;
    this.zoom = 1;
    this.angle = 0;
    this.yaw = 0.65;
    this.pitch = 0.5;
    this.radius = 5;
    this.axisExtent = 3;
    this.tickStep = 1;
    let drag = null;
    svg.addEventListener("pointerdown", event => {
      if (event.button !== 0 || !this.scene) return;
      const point = this.pointer(event);
      if (this.options.mode === "rotate") {
        drag = { mode: "rotate", x: point[0], y: point[1] };
      } else {
        const hit = [...this.scene.vectors].reverse().find(vector => {
          const endpoint = this.project(vector.coords);
          return Math.hypot(point[0] - endpoint[0], point[1] - endpoint[1]) < 14;
        });
        const image = event.target.closest("[data-image]");
        if (image && !hit) { this.callbacks.select(image.dataset.image); return; }
        const coords = this.unproject(point);
        if (!coords) return;
        const id = this.callbacks.draw(coords, hit?.id);
        if (!id) return;
        drag = { mode: "draw", id };
      }
      svg.setPointerCapture(event.pointerId);
      event.preventDefault();
    });
    svg.addEventListener("pointermove", event => {
      if (!drag) return;
      const point = this.pointer(event);
      if (drag.mode === "rotate") {
        if (this.dimension === 2) this.angle += (point[0] - drag.x - point[1] + drag.y) * 0.008;
        if (this.dimension === 3) {
          this.yaw += (point[0] - drag.x) * 0.008;
          this.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.pitch + (point[1] - drag.y) * 0.008));
        }
        drag.x = point[0];
        drag.y = point[1];
        this.draw();
      } else {
        const coords = this.unproject(point);
        if (coords) this.callbacks.draw(coords, drag.id);
      }
    });
    const stop = () => { drag = null; };
    for (const name of ["pointerup", "pointercancel", "lostpointercapture"]) svg.addEventListener(name, stop);
    svg.addEventListener("wheel", event => {
      event.preventDefault();
      this.changeZoom(Math.exp(-event.deltaY * 0.001));
    }, { passive: false });
  }

  update(scene, options, refit = false) {
    const previousDimension = this.dimension;
    this.scene = scene;
    this.options = options;
    this.dimension = Math.max(scene.n, scene.m);
    this.svg.dataset.mode = options.mode;
    if (previousDimension !== this.dimension) {
      this.angle = 0;
      this.yaw = 0.65;
      this.pitch = 0.5;
    }
    if (refit) { this.zoom = 1; this.fit(); }
    this.draw();
  }

  changeZoom(factor) {
    this.zoom = Math.max(0.05, Math.min(20, this.zoom * factor));
    this.draw();
  }

  reset() {
    this.angle = 0;
    this.yaw = 0.65;
    this.pitch = 0.5;
    this.zoom = 1;
    this.fit();
    this.draw();
  }

  fit() {
    if (!this.scene) return;
    const scene = this.scene;
    const points = [...scene.sourceGrid.flat(), ...scene.targetGrid.flat(), ...scene.basis, ...scene.basisImages,
      ...scene.vectors.map(vector => vector.coords), ...Object.values(scene.images)];
    const maxCoordinate = Math.max(3, ...points.flat().map(Math.abs));
    const power = 10 ** Math.floor(Math.log10(maxCoordinate / 3));
    this.tickStep = [1, 2, 5, 10].map(x => x * power).find(x => maxCoordinate / x <= 5);
    this.axisExtent = Math.ceil(maxCoordinate / this.tickStep) * this.tickStep;
    // A sphere around the common origin fits both positive and negative halves at every angle.
    this.radius = Math.max(this.axisExtent, ...points.map(point => Math.hypot(...point)));
  }

  project(point) {
    const [x = 0, y = 0, z = 0] = point;
    const scale = 285 / this.radius * this.zoom;
    if (this.dimension < 3) {
      return [(Math.cos(this.angle) * x - Math.sin(this.angle) * y) * scale,
        -(Math.sin(this.angle) * x + Math.cos(this.angle) * y) * scale];
    }
    const horizontal = Math.cos(this.yaw) * x + Math.sin(this.yaw) * z;
    const depth = -Math.sin(this.yaw) * x + Math.cos(this.yaw) * z;
    return [horizontal * scale, -(Math.cos(this.pitch) * y - Math.sin(this.pitch) * depth) * scale];
  }

  pointer(event) {
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(this.svg.getScreenCTM().inverse());
    return [point.x, point.y];
  }

  unproject(point) {
    const { n } = this.scene;
    if (n === 1) {
      const unit = this.project([1]);
      return [(point[0] * unit[0] + point[1] * unit[1]) / (unit[0] ** 2 + unit[1] ** 2)];
    }
    const free = n === 2 ? [0, 1] : { XY: [0, 1], XZ: [0, 2], YZ: [1, 2] }[this.options.plane];
    const fixedAxis = [0, 1, 2].find(axis => !free.includes(axis));
    const coords = Array(n).fill(0);
    const fixed = n === 2 ? 0 : this.options.fixed;
    if (!Number.isFinite(fixed)) { this.callbacks.error("Enter a finite fixed coordinate."); return null; }
    if (n === 3) coords[fixedAxis] = fixed;
    const offset = this.project(coords);
    const units = free.map(axis => {
      const unit = [0, 0, 0];
      unit[axis] = 1;
      return this.project(unit);
    });
    const [[a, c], [b, d]] = units;
    const determinant = a * d - b * c;
    if (Math.abs(determinant) <= 0.025 * Math.hypot(a, c) * Math.hypot(b, d)) {
      this.callbacks.error("The drawing plane is edge-on. Rotate the view or choose another plane.");
      return null;
    }
    const x = point[0] - offset[0], y = point[1] - offset[1];
    coords[free[0]] = (d * x - b * y) / determinant;
    coords[free[1]] = (a * y - c * x) / determinant;
    return coords;
  }

  element(tag, attributes = {}, parent = this.svg) {
    const element = document.createElementNS(NS, tag);
    for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
    parent.append(element);
    return element;
  }

  line(start, end, attributes, parent) {
    const [x1, y1] = this.project(start), [x2, y2] = this.project(end);
    return this.element("line", { x1, y1, x2, y2, ...attributes }, parent);
  }

  text(point, label, attributes = {}, parent) {
    const [x, y] = this.project(point);
    const element = this.element("text", { x: x + 7, y: y - 7, ...attributes }, parent);
    element.textContent = label;
    return element;
  }

  arrow(point, label, color, dashed, selected, parent, offset = 0) {
    const attributes = { stroke: color, "stroke-width": selected ? 3 : 1.8 };
    if (dashed) attributes["stroke-dasharray"] = "6 4";
    this.line([], point, attributes, parent);
    const [x, y] = this.project(point);
    const length = Math.hypot(x, y);
    if (length < 0.01) {
      this.element("circle", { cx: x, cy: y, r: selected ? 6 : 4, fill: "white", stroke: color, "stroke-width": 2 }, parent);
    } else {
      const ux = x / length, uy = y / length;
      this.element("polygon", { points: `${x},${y} ${x - 9 * ux + 4 * uy},${y - 9 * uy - 4 * ux} ${x - 9 * ux - 4 * uy},${y - 9 * uy + 4 * ux}`, fill: color }, parent);
      if (selected) this.element("circle", { cx: x, cy: y, r: 7, fill: "none", stroke: color }, parent);
    }
    this.text(point, label, { fill: color, dy: offset, "font-weight": selected ? "bold" : "normal" }, parent);
  }

  draw() {
    this.svg.replaceChildren();
    if (!this.scene) return;
    const { scene, options } = this;
    if (options.transformedGrid) {
      const group = this.element("g", { stroke: "#2166ac", "stroke-width": 1.1, "data-grid": "target" });
      for (const [start, end] of scene.targetGrid) this.line(start, end, {}, group);
      if (scene.targetGrid.every(line => line.every(point => point.every(value => value === 0)))) {
        this.element("circle", { cx: 0, cy: 0, r: 5, fill: "#2166ac" }, group);
        this.text([], "A grid = 0", { fill: "#2166ac", dy: 28 }, group);
      }
    }
    if (options.sourceGrid) {
      const group = this.element("g", { stroke: "#aaa", "stroke-width": 1, "stroke-dasharray": "4 5", "data-grid": "source" });
      for (const [start, end] of scene.sourceGrid) this.line(start, end, {}, group);
    }
    this.axes();
    if (options.basis) {
      const original = this.element("g", { "data-basis": "source" });
      scene.basis.forEach((point, i) => this.arrow(point, `e${i + 1}`, "#626262", true, false, original, 14 + i * 8));
      const target = this.element("g", { "data-basis": "target" });
      scene.basisImages.forEach((point, i) => this.arrow(point, `Ae${i + 1}`, "#2166ac", false, false, target, -12 * i));
    }
    const vectors = [...scene.vectors].sort((a, b) => Number(a.id === options.selectedVector) - Number(b.id === options.selectedVector));
    for (const vector of vectors) {
      const selected = vector.id === options.selectedVector;
      const source = this.element("g", { "data-vector": vector.id });
      this.arrow(vector.coords, vector.id, vector.color, true, selected, source, -9);
      const target = this.element("g", { "data-image": vector.id });
      this.arrow(scene.images[vector.id], `A${vector.id}`, vector.color, false, selected, target, 18);
    }
  }

  axes() {
    for (let axis = 0; axis < this.dimension; axis++) {
      const start = [0, 0, 0], end = [0, 0, 0];
      start[axis] = -this.axisExtent;
      end[axis] = this.axisExtent;
      const [px, py] = this.project(end), length = Math.hypot(px, py);
      if (length < 0.01) { this.text([], `${AXES[axis]} (view direction)`, { dy: 40 }); continue; }
      this.line(start, end, { stroke: "#242424", "stroke-width": 1.3, "data-axis": AXES[axis] });
      for (const point of [start, end]) {
        const [x, y] = this.project(point), size = Math.hypot(x, y);
        const ux = x / size, uy = y / size;
        this.element("path", { d: `M ${x - 8 * ux + 4 * uy} ${y - 8 * uy - 4 * ux} L ${x} ${y} L ${x - 8 * ux - 4 * uy} ${y - 8 * uy + 4 * ux}`, fill: "none", stroke: "#242424", "stroke-width": 1.3 });
      }
      const nx = -py / length, ny = px / length;
      const count = Math.round(this.axisExtent / this.tickStep);
      for (let i = -count; i <= count; i++) {
        if (!i) continue;
        const point = [0, 0, 0];
        point[axis] = i * this.tickStep;
        const [x, y] = this.project(point);
        this.element("line", { x1: x - 3 * nx, y1: y - 3 * ny, x2: x + 3 * nx, y2: y + 3 * ny, stroke: "#242424" });
        this.text(point, `${i > 0 ? "+" : ""}${format(point[axis])}`, { x: x + 9 * nx, y: y + 9 * ny + 4, "text-anchor": nx < -0.1 ? "end" : "start", fill: "#333" });
      }
      this.text(end, AXES[axis], { class: "axis-label", dx: 8, dy: -8 });
    }
    this.text([], "0", { dx: -20, dy: 22 });
  }
}
