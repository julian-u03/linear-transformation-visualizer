const NS = "http://www.w3.org/2000/svg";
const AXES = ["x", "y", "z"];

export function format(value) {
  if (value === 0) return "0";
  const rounded = Number(value.toPrecision(5));
  return Math.abs(rounded) >= 1e5 || Math.abs(rounded) < 1e-3
    ? rounded.toExponential(3) : String(rounded);
}

export function transitionGeometry(from, to, progress) {
  // Interpolate display positions, without changing either applied matrix.
  const point = (a, b) => Array.from({ length: Math.max(a.length, b.length) }, (_, i) =>
    progress === 0 ? (a[i] ?? 0) : progress === 1 ? (b[i] ?? 0) : (1 - progress) * (a[i] ?? 0) + progress * (b[i] ?? 0));
  return {
    id: "preview", name: "T", color: to.color, visible: true, n: from.n,
    m: progress === 0 ? from.m : progress === 1 ? to.m : Math.max(from.m, to.m),
    grid: from.grid.map((line, i) => line.map((p, j) => point(p, to.grid[i][j]))),
    basis: from.basis.map((p, i) => point(p, to.basis[i])),
    points: from.points.map((p, i) => point(p, to.points[i])),
    images: Object.fromEntries(Object.entries(from.images).map(([id, p]) => [id,
      progress === 0 ? p : progress === 1 ? to.images[id] : point(p, to.images[id])])),
  };
}

export class SpaceView {
  constructor(svg) {
    this.svg = svg;
    this.zoom = 1;
    this.yaw = 0.65;
    this.pitch = 0.5;
    this.dimension = 3;
    this.axisExtent = 10;
    this.tickStep = 1;
    this.radius = Math.SQRT2 * this.axisExtent;
    let drag = null;
    svg.addEventListener("pointerdown", event => {
      if (event.button !== 0) return;
      drag = { x: event.clientX, y: event.clientY };
      svg.setPointerCapture(event.pointerId);
    });
    svg.addEventListener("pointermove", event => {
      if (!drag) return;
      const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
      this.yaw += dx * 0.008;
      this.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.pitch + dy * 0.008));
      drag = { x: event.clientX, y: event.clientY };
      this.draw();
    });
    const stop = () => { drag = null; };
    svg.addEventListener("pointerup", stop);
    svg.addEventListener("pointercancel", stop);
    svg.addEventListener("lostpointercapture", stop);
    svg.addEventListener("wheel", event => {
      event.preventDefault();
      this.changeZoom(Math.exp(-event.deltaY * 0.001));
    }, { passive: false });
    this.draw();
  }

  changeZoom(factor) {
    this.zoom = Math.max(0.05, Math.min(20, this.zoom * factor));
    this.draw();
  }

  reset() {
    this.yaw = 0.65;
    this.pitch = 0.5;
    this.zoom = 1;
    this.fit();
    this.draw();
  }

  setPreset(plane) {
    this.yaw = plane === "yz" ? Math.PI / 2 : 0;
    this.pitch = plane === "xz" ? -Math.PI / 2 : 0;
    this.draw();
  }

  update(scene, options) {
    this.scene = scene;
    this.options = options;
    const matrices = scene.matrices.filter(matrix => matrix.visible);
    this.sourceDimension = options.preview?.n ?? Math.max(options.sourceDimension, ...matrices.map(matrix => matrix.n),
      ...scene.vectors.filter(vector => vector.visible).map(vector => vector.coords.length));
    // Scene changes preserve the camera and scale; only Reset view refits.
    this.draw();
    return this.dimension;
  }

  fit() {
    if (!this.scene) return;
    const points = this.options.points ? [...this.scene.sources[this.sourceDimension].points] : [];
    for (const matrix of this.options.endpoints ?? this.scene.matrices.filter(matrix => matrix.visible)) {
      if (this.options.transformedGrid) points.push(...matrix.grid.flat());
      if (this.options.points) points.push(...matrix.points);
      if (this.options.basis) points.push(...matrix.basis);
      for (const vector of this.scene.vectors.filter(vector => vector.visible && (!this.options.preview || vector.coords.length === this.sourceDimension))) {
        if (matrix.images[vector.id]) points.push(matrix.images[vector.id]);
      }
    }
    points.push(...this.scene.vectors.filter(vector => vector.visible && (!this.options.preview || vector.coords.length === this.sourceDimension)).map(vector => vector.coords));
    this.tickStep = 1;
    this.axisExtent = 10;
    this.radius = Math.max(Math.SQRT2 * this.axisExtent, ...points.map(point => Math.hypot(...point)));
  }

  project(point) {
    const [x = 0, y = 0, z = 0] = point;
    const horizontal = Math.cos(this.yaw) * x + Math.sin(this.yaw) * z;
    const depth = -Math.sin(this.yaw) * x + Math.cos(this.yaw) * z;
    const vertical = Math.cos(this.pitch) * y - Math.sin(this.pitch) * depth;
    const scale = 300 / this.radius * this.zoom;
    return [horizontal * scale, -vertical * scale];
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
    if (point.every(value => value === 0) || length < 0.01) {
      this.element("circle", { cx: x, cy: y, r: selected ? 5 : 3, fill: "white", stroke: color, "stroke-width": 2 }, parent);
    } else {
      const ux = x / length, uy = y / length;
      this.element("polygon", { points: `${x},${y} ${x - 9 * ux + 4 * uy},${y - 9 * uy - 4 * ux} ${x - 9 * ux - 4 * uy},${y - 9 * uy + 4 * ux}`, fill: color }, parent);
    }
    this.text(point, label, { fill: color, dy: offset, "font-weight": selected ? "bold" : "normal" }, parent);
  }

  draw() {
    this.svg.replaceChildren();
    if (!this.scene) {
      this.axes();
      return;
    }
    const { scene, options } = this;
    const source = scene.sources[this.sourceDimension];
    const visible = options.preview ? [options.preview] : scene.matrices.filter(matrix => matrix.visible);
    // Selected geometry is painted last, without changing any mathematical data.
    visible.sort((a, b) => Number(a.id === options.selectedMatrix) - Number(b.id === options.selectedMatrix));
    if (options.points) {
      const original = this.element("g", { fill: "#888", opacity: 0.55, "data-points": "source" });
      this.dots(source.points, original);
      for (const matrix of visible) {
        const group = this.element("g", { fill: matrix.color, opacity: matrix.id === options.selectedMatrix ? 0.9 : 0.3, "data-points": matrix.id });
        this.dots(matrix.points, group);
      }
    }
    if (options.transformedGrid) {
      for (const matrix of visible) {
        const grid = this.element("g", { stroke: matrix.color, "stroke-width": 1, opacity: matrix.id === options.selectedMatrix ? 1 : 0.22, "data-grid": matrix.id });
        for (const [start, end] of matrix.grid) this.line(start, end, {}, grid);
        if (matrix.grid.every(line => line.every(point => point.every(value => value === 0)))) {
          this.element("circle", { cx: 0, cy: 0, r: 4, fill: matrix.color }, grid);
          this.text([], `${matrix.name} grid = 0`, { fill: matrix.color, dy: 18 }, grid);
        }
      }
    }
    this.axes();
    if (options.basis) {
      const original = this.element("g", { opacity: options.selectedMatrix ? 0.65 : 1 });
      source.basis.forEach((point, i) => this.arrow(point, `e${i + 1}`, "#626262", true, false, original, 12));
      for (const matrix of visible) {
        const group = this.element("g", { opacity: matrix.id === options.selectedMatrix ? 1 : 0.3 });
        matrix.basis.forEach((point, i) => this.arrow(point, `${matrix.name}e${i + 1}`, matrix.color, false, false, group, -12 * i));
      }
    }
    const vectors = scene.vectors.filter(vector => vector.visible && (!options.preview || vector.coords.length === this.sourceDimension));
    vectors.sort((a, b) => Number(a.id === options.selectedVector) - Number(b.id === options.selectedVector));
    for (const vector of vectors) {
      const selected = vector.id === options.selectedVector;
      const sourceGroup = this.element("g", { opacity: options.selectedMatrix ? 0.45 : 1, "data-vector": vector.id });
      this.arrow(vector.coords, vector.name, vector.color, true, selected, sourceGroup);
      for (const matrix of visible) {
        if (!matrix.images[vector.id]) continue;
        const targetGroup = this.element("g", { opacity: matrix.id === options.selectedMatrix ? 1 : 0.3, "data-image": `${matrix.id}-${vector.id}` });
        this.arrow(matrix.images[vector.id], `${matrix.name}${vector.name}`, vector.color, false, selected, targetGroup, 15);
      }
    }
  }

  dots(points, parent) {
    for (const point of points) {
      const [cx, cy] = this.project(point);
      this.element("circle", { cx, cy, r: 2.5 }, parent);
    }
  }

  axes() {
    for (let axis = 0; axis < this.dimension; axis++) {
      const start = [0, 0, 0], end = [0, 0, 0];
      start[axis] = -this.axisExtent;
      end[axis] = this.axisExtent;
      // The axis perpendicular to a preset's viewing plane has no screen length.
      if (Math.hypot(...this.project(end)) < 0.01) continue;
      this.line(start, end, { stroke: "#242424", "stroke-width": 1.5 });
      for (const point of [start, end]) {
        const [x, y] = this.project(point), length = Math.hypot(x, y);
        if (length < 0.01) continue;
        const ux = x / length, uy = y / length;
        this.element("path", { d: `M ${x - 8 * ux + 4 * uy} ${y - 8 * uy - 4 * ux} L ${x} ${y} L ${x - 8 * ux - 4 * uy} ${y - 8 * uy + 4 * ux}`, fill: "none", stroke: "#242424", "stroke-width": 1.5 });
      }
      const [px, py] = this.project(end), length = Math.hypot(px, py);
      const nx = length ? -py / length : 0, ny = length ? px / length : 1;
      const count = Math.round(this.axisExtent / this.tickStep);
      for (let i = -count; i <= count; i++) {
        if (!i) continue;
        const point = [0, 0, 0];
        point[axis] = i * this.tickStep;
        const [x, y] = this.project(point);
        this.element("line", { x1: x - 3 * nx, y1: y - 3 * ny, x2: x + 3 * nx, y2: y + 3 * ny, stroke: "#242424" });
        this.text(point, `${i > 0 ? "+" : ""}${format(point[axis])}`, { x: x + 9 * nx, y: y + 9 * ny + 4, "text-anchor": nx < -0.1 ? "end" : "start", fill: "#333" });
      }
      this.text(end, AXES[axis], { class: "axis-label", dx: 7, dy: -7 });
    }
    this.text([], "0", { dx: -20, dy: 22 });
  }
}
