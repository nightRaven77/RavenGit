import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

it.each([
  ["32x32.png", 32],
  ["64x64.png", 64],
  ["128x128.png", 128],
  ["128x128@2x.png", 256],
  ["icon.png", 512],
])("%s es PNG cuadrado RGBA de %i píxeles", (name, size) => {
  const data = readFileSync(resolve("src-tauri/icons", name));
  expect(data.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  expect(data.readUInt32BE(16)).toBe(size);
  expect(data.readUInt32BE(20)).toBe(size);
  expect(data[25]).toBe(6);
});
it("el ICO contiene tamaños para Windows y el ICNS tiene cabecera válida", () => {
  const ico = readFileSync(resolve("src-tauri/icons/icon.ico"));
  expect(ico.readUInt16LE(0)).toBe(0);
  expect(ico.readUInt16LE(2)).toBe(1);
  const sizes = Array.from(
    { length: ico.readUInt16LE(4) },
    (_, index) => ico[6 + index * 16] || 256,
  );
  expect(sizes).toContain(32);
  expect(sizes).toContain(256);
  const icns = readFileSync(resolve("src-tauri/icons/icon.icns"));
  expect(icns.subarray(0, 4).toString()).toBe("icns");
  expect(icns.readUInt32BE(4)).toBe(icns.length);
});
it("favicon y bundle usan los recursos de RavenGit", () => {
  expect(readFileSync(resolve("index.html"), "utf8")).toContain(
    'href="/ravengit.svg"',
  );
  const config = JSON.parse(
    readFileSync(resolve("src-tauri/tauri.conf.json"), "utf8"),
  );
  for (const icon of config.bundle.icon)
    expect(readFileSync(resolve("src-tauri", icon)).length).toBeGreaterThan(0);
  const svg = readFileSync(resolve("public/ravengit.svg"), "utf8");
  expect(svg).toContain("<title>RavenGit</title>");
  expect(svg).not.toMatch(/<script|https?:\/\/(?!www\.w3\.org\/2000\/svg)/);
});
it("Cargo vigila los iconos para no reutilizar recursos nativos obsoletos", () => {
  expect(readFileSync(resolve("src-tauri/build.rs"), "utf8")).toContain(
    "cargo:rerun-if-changed=icons",
  );
});
