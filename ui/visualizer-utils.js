(function (root) {
  // Butterchurn resizes its internal textures, but not the supplied output canvas.
  function resizeVisualizer(canvas, container, visualizer) {
    const rect = container.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    if (canvas.width === width && canvas.height === height) return false;
    canvas.width = width;
    canvas.height = height;
    visualizer?.setRendererSize(width, height);
    return true;
  }
  root.visualizerUtils = { resizeVisualizer };
  if (typeof module !== 'undefined') module.exports = root.visualizerUtils;
})(globalThis);
