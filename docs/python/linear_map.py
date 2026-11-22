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
    if n == 1:
        return np.array([[[-radius], [radius]]], dtype=np.float64)
    lines = []
    # A sparse grid on each coordinate plane makes 3D collapse visible.
    for first in range(n):
        for second in range(first + 1, n):
            for moving, fixed in [(first, second), (second, first)]:
                for tick in range(-radius, radius + 1):
                    start = [0] * n
                    start[moving], start[fixed] = -radius, tick
                    end = start.copy()
                    end[moving] = radius
                    lines.append([start, end])
    return np.asarray(lines, dtype=np.float64)


def calculate(payload):
    request = json.loads(payload)
    limits = request["limits"]
    matrix = parse_matrix(request["text"], limits["coefficientMagnitude"])
    m, n = matrix.shape
    cleared = request["sourceDimension"] != n and bool(request["vectors"])
    vectors = [] if request["sourceDimension"] != n else request["vectors"]
    if len(vectors) > limits["vectorCount"]:
        raise ValueError(f"Use at most {limits['vectorCount']} vectors.")
    images = {}
    for vector in vectors:
        coords = vector["coords"]
        if len(coords) != n:
            raise ValueError(f"Source vectors must contain exactly {n} coordinates.")
        if any(isinstance(x, bool) or not isinstance(x, (int, float)) for x in coords):
            raise ValueError("Source coordinates must be numbers.")
        values = np.asarray(coords, dtype=np.float64)
        if not np.isfinite(values).all():
            raise ValueError("Source coordinates must be finite.")
        if np.any(np.abs(values) > limits["coordinateMagnitude"]):
            raise ValueError(f"Source coordinates must have magnitude at most {limits['coordinateMagnitude']:g}.")
        image = matrix @ values
        if not np.isfinite(image).all():
            raise ValueError("The transformed vector contains a nonfinite coordinate.")
        images[vector["id"]] = image.tolist()
    radius = limits["gridRadius"]
    if not isinstance(radius, int) or not 1 <= radius <= 10:
        raise ValueError("Grid radius must be an integer from 1 through 10.")
    grid = source_grid(n, radius)
    transformed = grid @ matrix.T
    basis = np.eye(n, dtype=np.float64)
    basis_images = basis @ matrix.T
    if not np.isfinite(transformed).all() or not np.isfinite(basis_images).all():
        raise ValueError("The transformed scene contains a nonfinite coordinate.")
    return json.dumps({"matrix": matrix.tolist(), "m": m, "n": n,
                       "sourceGrid": grid.tolist(), "targetGrid": transformed.tolist(),
                       "basis": basis.tolist(), "basisImages": basis_images.tolist(),
                       "vectors": vectors, "images": images, "cleared": cleared}, allow_nan=False)
