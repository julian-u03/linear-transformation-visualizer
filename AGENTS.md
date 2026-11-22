# AGENTS.md — Linear Transformation Visualizer

## Collaboration

- The user is the developer; act as a programming tutor and discussion partner.
- Communicate in German. Use English for code, comments, UI and repository text.
- Assume HTML, CSS, Python and JavaScript basics. Explain project-specific logic
  intuitively, then technically, without a beginner curriculum.
- Give focused, usable code when implementation help is requested; do not require
  a hint ladder. Showing code does not authorize changing repository files.
- Do not create, edit, move or delete files, install dependencies or change project
  state unless explicitly authorized. Do not automatically apply review fixes.
- Work on one meaningful step at a time. Review the user's code as written;
  distinguish bugs, potential problems and optional improvements.
- Explain meaningful dependency/architecture trade-offs before changing them.
- For teaching responses, finish with one concrete next action. Keep explanations
  concise; the user's understanding matters more than rushing completion.

## Keep the repository minimal

- Keep only the live website, README.md, this file, explicitly requested README
  screenshots and essential Git metadata.
- Do not add test suites, fixtures, historical versions, example source files,
  dependency manifests, build pipelines or separate documentation files unless
  explicitly requested. Verify changes without retaining test code.
- Keep necessary English comments; avoid unused helpers, diagnostics and
  abstractions. Preserve source and license notices for any reused code.
- A bilingual English/German README is welcome when documentation is requested;
  creating this instruction file does not authorize writing the application or README.
- Retain only an up-to-date desktop capture if a README screenshot is requested.
- Explain GitHub Pages publication in conversation when asked, rather than
  creating a deployment guide.

## Architecture and technology

- Follow the SVD Image Compression architecture: `docs/` is the complete static
  GitHub Pages application, with relative URLs and no build step.
- Use plain HTML, CSS and native JavaScript ES modules. No frontend framework,
  backend, database, cloud computation, bundler or package manager is needed.
- JavaScript owns input controls, browser events, worker communication, camera
  state and SVG presentation. Python in `docs/python/` owns matrix validation,
  linear transformations and mathematical scene data.
- Run Python in a module Web Worker with pinned Pyodide 314.0.8, using the same
  NumPy/Pillow runtime stack as the reference project. NumPy handles numerical
  work. Pillow has no required role in this application; do not add image features
  merely to use it or copy the image-processing pipeline.
- Keep Python application logic in `.py` files. The worker is a thin transport
  adapter; only interpreter setup belongs in embedded Python strings.
- Use SVG for 1D, 2D and projected 3D views. Implement the small camera projection
  in JavaScript as rendering logic; do not add Three.js, WebGL, plotting libraries
  or a second numerical implementation in JavaScript.
- Use a small structure such as `docs/index.html`, `docs/style.css`, `docs/main.js`,
  `docs/transformation-worker.js`, `docs/space-view.js` and
  `docs/python/linear_map.py`. Split files further only for a concrete need.
- Serve the page through HTTP for local development. A local static server only
  delivers files; all calculations execute in the browser.
- Runtime/package assets may load from a CDN. Never send matrices or vectors to a
  server, analytics service or external API. Do not add persistence by default.

## Mathematical meaning

- Visualize a linear map `T: R^n -> R^m`, defined by `T(v) = A @ v`, where `A`
  has `m` rows and `n` columns. Display vectors as column vectors.
- Support all nine shapes with independently chosen row and column counts from
  1 through 3, including rectangular matrices. Never pad a matrix to square or
  discard coordinates to fit a view.
- The source space has `n` dimensions; the target space has `m` dimensions.
  Label both spaces explicitly, for example `Source space R²` and `Target space R³`.
- Overlay both spaces in one shared display of dimension `d = max(n, m)`, with
  the same origin, axes, unit scale and camera. Embed a 1D space on the x-axis and
  a 2D space in the xy-plane by appending zero display coordinates only. These
  embeddings are presentation conventions: do not change `A`, `v` or `Av`, and
  keep coordinate readouts at their actual source/target dimensions.
- Show what happens to the source grid, standard basis vectors and user vectors.
  Each transformed basis vector `A @ e_i` is column `i` of `A`.
- This is an active transformation in fixed reference coordinates. Keep the
  shared reference axes visible and distinguish them from the transformed source
  grid and basis. Do not describe `A @ v` as coordinates in a new basis or use an
  inverse matrix to obtain the displayed counterpart.
- For rectangular matrices, the image of the source grid may occupy only a line
  or plane in the target space. Do not draw it as if it filled the entire target.
- Zero and singular matrices are valid. Show collapse to a plane, line or origin
  faithfully. Never require invertibility or assume transformed basis vectors
  form a basis of the entire target space.
- Linear maps keep the origin fixed. Do not introduce translations, homogeneous
  coordinates, nonlinear maps, SVD, eigendecompositions or matrix inverses.
- Use Float64 arithmetic and ordinary NumPy primitives such as matrix products.
  Do not round, normalize or clip mathematical results before displaying geometry.
  Round only labels; handle signed zero in formatted output.

## Matrix input and updates

- Enter the entire matrix in one multiline text field, not a grid of cell inputs.
  Separate rows with newlines and entries with spaces or tabs. Allow surrounding
  whitespace and Windows line endings. Use a decimal point and optionally
  scientific notation for real numbers.
- Infer the shape from the entered text. Accept only 1–3 nonempty rows, each with
  the same 1–3 entries. Reject internal empty rows, ragged rows, nonnumbers,
  NaN and infinity with a specific English error message.
- Never evaluate input as Python or JavaScript code. Accept numerical tokens only.
- Use an `Apply` button to commit a valid matrix. Show its shape and mapping
  dimensions. Keep draft input separate from the last successfully applied state.
- Start with the 2D identity matrix and no user vectors. A nonidentity example in
  a design mockup does not change this startup behavior.
- A valid matrix update recomputes the grid, basis images and all target vectors.
  If `n` stays the same, retain source vectors, including when only `m` changes.
  If `n` changes, clear incompatible source vectors and state this visibly.
- Invalid input must not replace the last valid scene. Make clear that the
  displayed result still belongs to the last applied matrix.

## Vector interaction and views

- Overlay the original source grid and its transformed counterpart in one large
  coordinate view, sharing exactly the same origin. Do not separate them into
  source/target panels. Distinguish the original grid with light gray dashed lines
  and the transformed grid with colored solid lines; include a compact legend
  and independent visibility controls.
- Use a number line when `d = 1`, a Cartesian plane when `d = 2` and an interactive
  projected Cartesian space when `d = 3`. For a 2x3 matrix, the source is 3D and the
  target lies in the xy-plane. For a 3x2 matrix, the source lies in the xy-plane
  and its image can be a tilted plane in 3D. Preserve all actual coordinates.
- Let users draw source vectors from the common origin. In 1D, select a position
  on the line; in 2D, click or drag the endpoint in the source plane. When a 2D
  source is shown in a 3D display, pointer input must intersect its xy-plane.
- A click in a 3D projection does not determine a unique spatial point. Provide an
  explicit drawing plane (`XY`, `XZ` or `YZ`) and an editable fixed value for the
  remaining coordinate. Map pointer input to that plane and handle edge-on views
  without producing invalid coordinates.
- Also provide editable numeric source coordinates for precise placement and
  keyboard use. Show exactly `n` coordinate inputs. Camera controls must use a
  distinct gesture or explicit mode so orbiting does not create vectors.
- Support multiple vectors with stable identifiers and matching colors for each
  source/image pair. Distinguish `v` and `Av` with dashed/solid strokes and explicit
  labels. Users can select, edit and remove a vector, and clear all user vectors.
- For every source vector `v`, overlay its counterpart `Av` from the same origin
  in the shared view and show both coordinate tuples in a compact vector list.
- Target vectors are derived results, not independently editable objects.
  Selection links a vector to its counterpart. Keep coincident vectors selectable
  through the list; show zero vectors as labeled origin markers.
- Show original basis vectors and their images with consistent styles distinct
  from user vectors. Do not rely on color alone; retain labels and selection cues.
- Render a bounded source grid and its mathematically transformed counterpart.
  For 3D, use a sparse wire lattice or coordinate-plane grid without hiding
  dimensional collapse or making the scene unreadable.
- Use orthographic 3D projection with orbit, zoom and reset-view controls. Keep
  equal unit scales on all shared axes. Camera changes only affect
  presentation, never the matrix or vector coordinates.
- Let users rotate the shared view around the common origin by holding the left
  mouse button and dragging in a `Rotate` interaction mode. This orbits the camera
  in 3D and rotates the view in its plane in 2D. A 1D number line does not need
  rotation. Keep the origin fixed as the rotation pivot and rotate both grids,
  axes, basis arrows and user vectors together. Provide `Reset view`.
- Provide explicit `Rotate` and `Draw` interaction modes so the same mouse gesture
  cannot both orbit the view and create or edit a source vector. Changing modes
  must not alter the applied matrix or existing vectors.
- Extend every displayed coordinate axis through the origin in both positive and
  negative directions, with arrowheads at both ends, signed tick values and clear
  axis labels. Include negative source coordinates in the bounded original grid
  and transform them too. Keep both halves of every axis visible when fitting
  the scene; do not restrict the display to the positive quadrant or octant.
- Show tick values and axis labels. Apply the same zoom and camera to both grids
  and all vectors. Never fit or rescale source and image independently.
- Refit on a committed matrix change or an explicit view reset, rather than
  continually changing scale while a vector is dragged.
- The required result is an overlaid original/transformed comparison with
  interactive vectors.
  Do not add automatic animation, decomposition controls or other features unless requested.
  In particular, rectangular maps have no same-shaped identity to interpolate from.

## Worker state and numerical safeguards

- Initialize Pyodide once per worker and reuse the interpreter across edits.
  Keep the interface responsive and show concise loading, ready and error states.
- Use request identifiers and scene revisions. Serialize or coalesce calculations
  and ignore stale replies so rapid edits cannot overwrite newer state.
- Keep the applied matrix and source-vector state recoverable in JavaScript;
  Python returns validated numerical results rather than owning the only copy.
- Destroy temporary PyProxy objects and return plain serializable data. Keep
  message fields, array shapes and dimension conventions consistent across layers.
- Define practical limits for coefficient magnitudes, vector count and grid
  density centrally in `main.js`; pass applicable numerical limits to Python.
  Bound scene generation even when a matrix is singular or highly stretched.
- Validate finite inputs and outputs in Python. JavaScript may perform immediate
  UI checks but must not become a competing matrix parser or numerical engine.
- Do not add a cancellation control for tiny matrix products. If worker recovery
  requires termination, recreate the worker and restore the last applied state.

## Visual style and verification

- Preserve the reference project's basic desktop style: Arial/system fonts,
  light gray page background, white panels, simple borders and native controls.
- Use a compact settings column on the left and one large shared coordinate panel
  on the right, with a compact vector list below as needed.
- No decorative badges, marketing sections, gradients, shadows, placeholder text,
  extra explanatory panels or mobile-specific layout switching. Allow scrolling
  when the viewport is smaller than the desktop layout.
- Keep semantic labels, visible focus, readable contrast and status/error regions.
  Use numeric controls as the keyboard alternative to graphical interaction.
- Verify all nine matrix shapes and source/target dimension labels. Check identity,
  zero, singular, reflection, scaling, shear, embedding and projection examples.
- Check known pairs, including `[[1, 1], [0, 1]] @ [1, 1] = [2, 1]`, plus basis
  images equal to matrix columns and `T(0) = 0`.
- Check rectangular overlays explicitly: `[[1, 0, 0], [0, 1, 0]]` maps `[1, 1, 1]`
  to `[1, 1]`, displayed at `[1, 1, 0]`; `[[1, 0], [0, 1], [1, 1]]` maps `[1, 1]`
  to `[1, 1, 2]`, with the source displayed at `[1, 1, 0]`. The latter maps the
  source grid onto the plane `z = x + y`. Both grids share the same origin.
- Verify invalid drafts preserve the applied scene, dimension changes handle
  vectors correctly, stale worker replies are ignored, and 3D drawing is accurate
  on the selected plane. Use temporary checks without retaining test artifacts.
- Verify mouse rotation preserves the common origin and all mathematical values,
  drawing and rotation modes do not conflict, reset restores the initial camera,
  and positive/negative axis directions and negative-coordinate vectors render
  correctly before and after rotation.
