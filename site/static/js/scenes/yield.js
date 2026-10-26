// Building a scene is split into steps so no single main-thread task blocks scrolling for long.
// yieldTask() hands control back to the browser between steps (scheduler.yield where available).
export const yieldTask = () => (globalThis.scheduler && scheduler.yield
  ? scheduler.yield()
  : new Promise((r) => setTimeout(r, 0)));

// Compile every material's program before the first render, without blocking where the browser can help
// (KHR_parallel_shader_compile), then upload textures one at a time.
export async function warm(renderer, scene, camera) {
  // objects that appear later (locks, the route block, trails) are hidden now; show them for the compile only,
  // or their programs would compile mid-scroll on first use
  const hidden = [];
  scene.traverse((o) => { if (!o.visible) { hidden.push(o); o.visible = true; } });
  try {
    // compileAsync only helps (and only stays quiet) where the driver can compile in parallel
    if (renderer.compileAsync && renderer.extensions.has('KHR_parallel_shader_compile')) await renderer.compileAsync(scene, camera);
    else renderer.compile(scene, camera);
  }
  catch (e) { /* the first render compiles instead */ }
  await yieldTask();
  // one throwaway frame with everything visible: each program's first use (and its link wait) happens now,
  // while the scene is being built in idle time, not on the first frame the reader scrolls to
  renderer.render(scene, camera);
  for (const o of hidden) o.visible = false;
  await yieldTask();
  const seen = new Set();
  scene.traverse((o) => {
    const m = o.material; if (!m) return;
    for (const x of Array.isArray(m) ? m : [m]) for (const k of ['map', 'alphaMap']) if (x[k] && x[k].isTexture) seen.add(x[k]);
    if (m.uniforms) for (const u of Object.values(m.uniforms)) if (u.value && u.value.isTexture) seen.add(u.value);
  });
  for (const t of seen) { renderer.initTexture(t); await yieldTask(); }
}
