// Builds the hc-wasm crate (in the sibling PanGloss engine repo) straight into this repo's
// pkg/ directory. A plain `wasm-pack build --out-dir ../PanGloss-demo/pkg` from the crate
// directory does NOT do what it looks like it does -- wasm-pack resolves --out-dir relative to
// the crate path argument, not the shell's cwd, so a relative path silently lands somewhere
// nonsensical (verified: it landed under PanGloss/rust/crates/PanGloss-demo/pkg). Resolving both
// paths to absolute here sidesteps that entirely.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const demoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const crateDir = path.resolve(demoRoot, "..", "PanGloss", "rust", "crates", "hc-wasm");
const outDir = path.resolve(demoRoot, "pkg");

const result = spawnSync(
  "wasm-pack",
  ["build", "--target", "web", "--release", "--out-dir", outDir, crateDir],
  { stdio: "inherit", shell: true }
);
process.exit(result.status ?? 1);
