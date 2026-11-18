import { DataTexture, LinearFilter, LinearMipmapLinearFilter, RepeatWrapping } from "three";

let weave: DataTexture | undefined;

/** Neutral thread detail for the Skirt 02 wrap. Its separate normal atlas supplies the seams. */
export function shortSkirtWeave() {
  if (weave) return weave;
  const size = 128, threadWidth = 8;
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x + .5) * 2 * Math.PI / size;
      const v = (y + .5) * 2 * Math.PI / size;
      const warp = (x + .5 + .35 * Math.sin(v * 2)) * Math.PI / threadWidth;
      const weft = (y + .5 + .3 * Math.sin(u * 3)) * Math.PI / threadWidth;
      const over = .5 + .5 * Math.cos(warp) * Math.cos(weft);
      const thread = over * Math.cos(2 * warp) + (1 - over) * Math.cos(2 * weft);
      const yarnVariation = over * Math.sin(3 * u + Math.sin(v)) + (1 - over) * Math.sin(5 * v + Math.cos(u));
      const slub = .55 * Math.cos(2 * u + Math.sin(3 * v)) + .45 * Math.sin(3 * v + Math.sin(u));
      const value = Math.min(255, Math.round(226 + 25 * thread + 11 * yarnVariation + 7 * slub));
      const offset = (y * size + x) * 4;
      pixels.fill(value, offset, offset + 3);
      pixels[offset + 3] = 255;
    }
  }
  weave = new DataTexture(pixels, size, size);
  weave.name = "Skirt 02 cloth weave";
  weave.wrapS = weave.wrapT = RepeatWrapping;
  weave.repeat.set(22, 22);
  weave.generateMipmaps = true;
  weave.minFilter = LinearMipmapLinearFilter;
  weave.magFilter = LinearFilter;
  weave.anisotropy = 4;
  weave.needsUpdate = true;
  return weave;
}
