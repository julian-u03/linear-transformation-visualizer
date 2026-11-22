import json
import re

import numpy as np


NUMBER = re.compile(r"[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?\Z")


def parse_matrix(text, limit):
    rows = text.strip().splitlines()
    if not rows:
        raise ValueError("Enter a matrix with 1–3 rows.")
    if len(rows) > 3:
        raise ValueError("A matrix must have 1–3 rows.")
    tokens = [row.split() for row in rows]
    if any(not row for row in tokens):
        raise ValueError("Empty rows inside a matrix are not allowed.")
    if any(len(row) != len(tokens[0]) for row in tokens):
        raise ValueError("Every row must contain the same number of entries.")
    if not 1 <= len(tokens[0]) <= 3:
        raise ValueError("Each row must contain 1–3 entries.")
    for row in tokens:
        for token in row:
            if token.lower().lstrip("+-") in ("nan", "inf", "infinity"):
                raise ValueError("Matrix entries must be finite; NaN and infinity are not allowed.")
            if not NUMBER.fullmatch(token):
                raise ValueError(f"Invalid number: {token}. Use decimal points and optional scientific notation.")
    matrix = np.array(tokens, dtype=np.float64)
    if not np.isfinite(matrix).all():
        raise ValueError("Matrix entries must be finite.")
    if np.any(np.abs(matrix) > limit):
        raise ValueError(f"Matrix entries must have magnitude at most {limit:g}.")
    return matrix


def source_grid(n, radius):
    # Coordinate-plane grids keep the 3D scene sparse instead of filling a cube.
    lines = []
    if n == 1:
        return np.array([[[-radius], [radius]]], dtype=np.float64)
    for axis in range(n):
        for fixed in range(n):
            if fixed == axis:
                continue
            for tick in range(-radius, radius + 1):
                start = [0] * n
                start[axis] = -radius
                start[fixed] = tick
                end = start.copy()
                end[axis] = radius
                lines.append([start, end])
    return np.array(lines, dtype=np.float64)


def source_points(n, radius, samples):
    axis = np.linspace(-radius, radius, samples, dtype=np.float64)
    return np.array(np.meshgrid(*([axis] * n), indexing="ij")).reshape(n, -1).T


def calculate(payload):
    request = json.loads(payload)
    limits = request["limits"]
    matrices, vectors = request["state"]["matrices"], request["state"]["vectors"]
    if len(matrices) > limits["matrixCount"]:
        raise ValueError(f"Use at most {limits['matrixCount']} matrices.")
    if len(vectors) > limits["vectorCount"]:
        raise ValueError(f"Use at most {limits['vectorCount']} vectors.")
    for vector in vectors:
        coords = vector["coords"]
        if not 1 <= len(coords) <= 3:
            raise ValueError("A source vector must contain 1–3 coordinates.")
        if any(isinstance(x, bool) or not isinstance(x, (int, float)) for x in coords):
            raise ValueError("Source coordinates must be numbers.")
        values = np.asarray(coords, dtype=np.float64)
        if not np.isfinite(values).all():
            raise ValueError("Source coordinates must be finite.")
        if np.any(np.abs(values) > limits["coordinateMagnitude"]):
            raise ValueError(f"Source coordinates must have magnitude at most {limits['coordinateMagnitude']:g}.")
    sources = {}
    for n in range(1, 4):
        sources[n] = {"grid": source_grid(n, limits["gridRadius"]), "basis": np.eye(n),
                      "points": source_points(n, limits["gridRadius"], limits["pointSamples"])}

    def transform(entry, matrix):
        m, n = matrix.shape
        grid = sources[n]["grid"] @ matrix.T
        points = sources[n]["points"] @ matrix.T
        basis = np.eye(n) @ matrix.T
        images = {}
        for vector in vectors:
            if len(vector["coords"]) == n:
                image = matrix @ np.asarray(vector["coords"], dtype=np.float64)
                if not np.isfinite(image).all():
                    raise ValueError("The transformed vector contains a nonfinite coordinate.")
                images[vector["id"]] = image.tolist()
        if not np.isfinite(grid).all() or not np.isfinite(basis).all() or not np.isfinite(points).all():
            raise ValueError("The transformed scene contains a nonfinite coordinate.")
        return {**entry, "matrix": matrix.tolist(), "m": m, "n": n,
                "isIdentity": bool(m == n and np.array_equal(matrix, np.eye(n))),
                "grid": grid.tolist(), "basis": basis.tolist(), "points": points.tolist(), "images": images}

    results = [transform(entry, parse_matrix(entry["text"], limits["coefficientMagnitude"]))
               for entry in matrices]
    identities = {n: transform({"id": "identity", "name": "I", "color": "#2166ac", "visible": True}, np.eye(n))
                  for n in range(1, 4)}
    return json.dumps({"matrices": results, "identities": identities, "vectors": vectors, "sources": {
        n: {key: value.tolist() for key, value in data.items()} for n, data in sources.items()
    }}, allow_nan=False)
