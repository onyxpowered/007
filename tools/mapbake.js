// Minimap bake (development). Load in the game page (served by server/static.mjs,
// ?offline is fine) once the world has loaded, then:
//   await MapBake.run()   -> tools/out/minimap.png
// and copy it to assets/images/minimap.png (the HUD's minimap reads that file).
//
// It casts straight down onto the real collision mesh (the one players stand on)
// over the whole planet, on the same longitude/latitude grid the minimap shader
// samples, and stores per texel:
//   R, G  the surface radius as 16 bits (0..64 m): the actual shape of every
//         building, cliff, ramp and prop that has collision
//   B     what it is: 0 sea (nothing above the sea floor), 1 ground, 2 built
//         (standing well above the ground around it), 3 shallows
// The minimap draws it in 3D from this alone, so nothing is sampled or rendered
// for it while you play.
window.MapBake = {
  async run({ W = 2048, H = 1024 } = {}) {
    const G = window.__Game, B = G.bots, chars = G.match.characters;
    const R0 = chars._initialPosition.length() || 26, SEA = 22.05;
    const V = B._v[0].constructor, o = new V(), d = new V();
    const rad = new Float32Array(W * H), t0 = performance.now();
    for (let y = 0; y < H; y++) {
      const th = ((y + 0.5) / H) * Math.PI;
      for (let x = 0; x < W; x++) {
        const ph = ((x + 0.5) / W) * Math.PI * 2;
        d.set(Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph));
        o.copy(d).multiplyScalar(R0 + 40);
        const h = B._cast(o, d.negate(), 80);
        rad[y * W + x] = h ? h.point.length() : 0;
      }
      if (y % 32 === 0) { console.log(`[mapbake] ${y}/${H}`); await new Promise((r) => setTimeout(r, 0)); }
    }
    // what each texel is: sea, shallows, ground, or built (above the local ground)
    const cls = new Uint8Array(W * H), low = new Float32Array(W * H), K = 6;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        let m = 1e9;
        for (let j = -K; j <= K; j += 2) for (let i = -K; i <= K; i += 2) {
          const yy = Math.min(H - 1, Math.max(0, y + j)), xx = (x + i + W) % W, r = rad[yy * W + xx];
          r > 0 && r < m && (m = r);
        }
        low[y * W + x] = m;
      }
    for (let k = 0; k < W * H; k++) {
      const r = rad[k];
      cls[k] = !r || r < SEA - 1.2 ? 0 : r < SEA + 0.15 ? 3 : r - low[k] > 1.6 ? 2 : 1;
    }
    const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    const cx = cv.getContext("2d"), img = cx.createImageData(W, H);
    for (let k = 0; k < W * H; k++) {
      const v = Math.max(0, Math.min(65535, Math.round((rad[k] / 64) * 65535)));
      img.data[k * 4] = v >> 8; img.data[k * 4 + 1] = v & 255; img.data[k * 4 + 2] = cls[k]; img.data[k * 4 + 3] = 255;
    }
    cx.putImageData(img, 0, 0);
    const blob = await new Promise((r) => cv.toBlob(r, "image/png"));
    await fetch("/__save/minimap.png", { method: "PUT", body: blob });
    return { W, H, R0: +R0.toFixed(3), kb: (blob.size / 1024) | 0, seconds: +((performance.now() - t0) / 1000).toFixed(1) };
  },
};
