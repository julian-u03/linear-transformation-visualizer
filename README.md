<div align="center">

# Linear Transformation Visualizer

**Linear algebra you can see · Lineare Algebra zum Ansehen**

Python · JavaScript · NumPy · SVG · Pyodide

[Live demo](https://julian-u03.github.io/linear-transformation-visualizer/) · [English](#english) · [Deutsch](#deutsch)

</div>

![Desktop layout with matrices on the left, a shared coordinate view and animation in the middle, and vector controls and readouts on the right](screenshots/desktop.jpg)

## English

Explore linear maps **T(v) = A @ v** with matrices having one to three rows and
columns. Compare multiple matrices in one shared coordinate view, inspect their
images of the same source vectors, and animate between selected results.
The app starts with the identity reference, a two-dimensional source and no user
vectors. The original desktop layout keeps **matrices on the left, the view and
animation in the middle, and vectors on the right**.

### Reading the screenshot

The two matrices illustrate a shear and a reflection:

```text
A1          A2
1 1         -1 0
0 1          0 1
```

For the source vector `(4, 3)`, the right panel shows **A1v1 = (7, 3)** and
**A2v1 = (−4, 3)** as column vectors. All visible results share the same origin,
axes, unit scale and camera. Source arrows are dashed; their images are solid.
The selected matrix is emphasized while other visible matrices remain in the
background. With Points enabled, gray points show the source and colored points
show its images. The image of each standard basis vector is a matrix column.

### Using the app

- **Matrices:** choose New matrix, enter rows separated by newlines and entries
  separated by spaces or tabs, then Apply as new matrix. Select an existing
  matrix to apply changes or remove it. Each matrix has its own visibility
  checkbox. Up to eight matrices are supported.
- **Vectors:** enter source coordinates in the right panel. Vectors are shared
  by all matrices with the same number of columns. Select a vector to update
  it, hide or remove it, use the previous/next buttons to browse, or clear all
  vectors. Dimension groups are retained when switching between source spaces.
- **View:** drag to rotate around the common origin, scroll or use the zoom
  buttons, select XY/XZ/YZ presets, or choose Reset view. Transformed grids,
  points and basis arrows have separate controls. Reset view fits the visible
  geometry; ordinary edits preserve the camera and scale.
- **Animation:** choose From and To, set the duration, and use Play/Pause or
  the progress slider. Matrices must have the same source dimension. The
  identity reference adapts to that source dimension. When target dimensions
  differ, the interface explicitly identifies the animation as a display
  transition. Applied matrices and computed vector images remain unchanged.

All nine matrix shapes from 1×1 through 3×3 are accepted, including rectangular,
zero and singular matrices. Decimal points and scientific notation are allowed;
ragged rows, internal empty rows, nonnumbers, NaN and infinity are rejected.
Invalid drafts preserve the last applied scene.

Lower-dimensional vectors are embedded on the x-axis or in the xy-plane for the
shared orthographic display. Their numerical readouts keep the actual source
and target dimensions. Animation interpolates display geometry; it does not
change the applied matrix data.

### How it works

| Layer | Responsibility |
| --- | --- |
| HTML / CSS | Original three-column desktop layout |
| JavaScript | Matrix/vector controls, selection, animation and worker coordination |
| SVG / camera | Shared orthographic projection, presets, rotation and zoom |
| Python / NumPy | Validation, Float64 products, grids, points and basis images |
| Pyodide Web Worker | Reusable browser-local Python runtime and request identifiers |

The complete static app is in `docs/`, without a backend, package manager or build
step. On first use, **Pyodide 314.0.8**, NumPy and Pillow load from jsDelivr.
Pillow belongs to the reference runtime stack and has no image-processing role
here. **Matrices and vectors stay in browser memory**; there is no analytics or
persistence. The interface is English and uses a desktop layout.

Limits are centralized in `main.js`: up to eight matrices and 24 vectors,
coefficient and source-coordinate magnitudes at most 10,000, grids from −10 to
+10, and five point samples per source axis. Labels are rounded; the numerical
results retain Float64 precision.

For a local preview:

```sh
python -m http.server 8080 --bind 127.0.0.1 --directory docs
```

Open [localhost:8080](http://127.0.0.1:8080). This server only delivers static
files; Python calculations execute in the browser. Loading the runtime and
packages requires an internet connection.

## Deutsch

Untersuche lineare Abbildungen **T(v) = A @ v** mit Matrizen, deren Zeilen- und
Spaltenzahl jeweils zwischen eins und drei liegt. Mehrere Matrizen lassen sich
in derselben Ansicht vergleichen. Die ursprüngliche Anordnung bleibt erhalten:
**Matrizen links, Koordinatenansicht und Animation in der Mitte, Vektoren rechts**.
Der Startzustand zeigt die Identitätsreferenz mit zweidimensionaler Quelle und
ohne eigene Vektoren.

Im Screenshot bilden eine Scherung und eine Spiegelung den Quellvektor `(4, 3)`
auf `(7, 3)` beziehungsweise `(−4, 3)` ab. Die Spaltenvektoren stehen rechts.
Gestrichelte Pfeile zeigen die Quelle, durchgezogene Pfeile die Bilder.
Aktiviere **Points**, um graue Quellpunkte und deren farbige Bilder einzublenden.
Alle sichtbaren Objekte verwenden denselben Ursprung, Maßstab und dieselbe Kamera.

Links lassen sich bis zu acht Matrizen hinzufügen, auswählen, bearbeiten,
ausblenden und entfernen. Rechts werden Vektoren numerisch eingegeben und mit
allen Matrizen passender Spaltenzahl geteilt. Die Liste erlaubt Auswahl,
Bearbeitung, Sichtbarkeit und Löschen; über die Pfeile wechselst du zwischen
mehreren Vektoren. Vektoren bleiben in ihren jeweiligen Dimensionsgruppen erhalten.

Die Ansicht lässt sich per Maus drehen und zoomen. **XY view**, **XZ view** und
**YZ view** richten die Kamera aus; **Reset view** setzt sie zurück und passt die
sichtbare Geometrie gemeinsam ein. Gitter, Punkte und Basispfeile haben eigene
Schalter.

Unter der Ansicht stehen **From**, **To**, Dauer, Wiedergabe und Zeitschieber für
die Animation. Bei gleicher Quelldimension können unterschiedliche Ergebnisse
verglichen werden. Unterschiedliche Zieldimensionen werden ausdrücklich als
Darstellungsübergang gekennzeichnet. Die Animation verändert weder angewendete
Matrizen noch deren berechnete Vektorbilder.

Rechteckige Matrizen, Nullmatrizen und singuläre Matrizen sind gültig. Ungültige
Matrixentwürfe ersetzen die letzte gültige Szene nicht. Python validiert die
Eingaben und berechnet mit NumPy, JavaScript steuert Oberfläche, SVG-Kamera und
Animation. Pyodide läuft in einem wiederverwendeten Web Worker. Matrizen und
Vektoren verlassen den Browser nicht. Für die lokale Vorschau genügt der oben
gezeigte HTTP-Server; ein Build-Schritt ist nicht erforderlich.

## Project structure / Projektstruktur

```text
docs/
  index.html                 Page and controls
  style.css                  Original three-column desktop layout
  main.js                    Matrices, vectors, animation and worker requests
  space-view.js              SVG projection, camera and display interpolation
  transformation-worker.js   Pyodide initialization and transport
  python/linear_map.py       Validation and numerical scene generation
screenshots/desktop.jpg      Current README capture; not used by the app
```

## Sources and notices / Quellen und Hinweise

Related project with the same browser-local Python architecture:
[SVD Image Compression](https://github.com/julian-u03/svd-image-compression).

Runtime/package licenses:
[Pyodide](https://github.com/pyodide/pyodide/blob/314.0.8/LICENSE) ·
[NumPy](https://numpy.org/doc/stable/license.html) ·
[Pillow](https://pillow.readthedocs.io/en/stable/about.html#license).

The screenshot shows the running application and its own SVG geometry.
No project source-code license has been selected.
Eine Lizenz für den eigenen Projektquellcode wurde noch nicht gewählt.
