const ready = (async () => {
  const indexURL = "https://cdn.jsdelivr.net/pyodide/v314.0.8/full/";
  postMessage({ type: "loading", message: "Loading Python runtime…" });
  const { loadPyodide } = await import(`${indexURL}pyodide.mjs`);
  const pyodide = await loadPyodide({ indexURL });
  postMessage({ type: "loading", message: "Loading Python packages…" });
  await pyodide.loadPackage(["numpy", "pillow"]);
  postMessage({ type: "loading", message: "Loading transformation code…" });
  const response = await fetch(new URL("./python/linear_map.py", import.meta.url), { cache: "no-store" });
  if (!response.ok) throw new Error("Could not load the Python application.");
  await pyodide.runPythonAsync(await response.text());
  return pyodide;
})();

ready.then(() => postMessage({ type: "ready" })).catch(error => {
  postMessage({ type: "fatal", error: error.message });
});

let queue = Promise.resolve();
self.onmessage = ({ data }) => {
  queue = queue.then(async () => {
    try {
      const pyodide = await ready;
      const calculate = pyodide.globals.get("calculate");
      try {
        const scene = JSON.parse(calculate(JSON.stringify(data.payload)));
        postMessage({ id: data.id, revision: data.revision, scene });
      } finally {
        calculate.destroy();
      }
    } catch (error) {
      postMessage({ id: data.id, revision: data.revision, error: error.message });
    }
  });
};
