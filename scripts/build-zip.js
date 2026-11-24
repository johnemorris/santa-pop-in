// Explicit runtime allowlist, fixed metadata, sorted entries: identical source
// bytes produce identical ZIPs, regardless of checkout time or file modes.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json")));
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json")));
if (pkg.version !== manifest.version) throw new Error("Package and manifest versions must match");
const files = [...new Set([
  "manifest.json", "settings.js", "popup.js", "popup.css", "sounds/CREDITS.md",
  manifest.background.service_worker, manifest.action.default_popup,
  ...Object.values(manifest.icons), "images/jem6-mark.svg",
  ...manifest.content_scripts.flatMap(({ js, css }) => [...js, ...css]),
  ...manifest.web_accessible_resources.flatMap(({ resources }) => resources),
])].sort();
const out = path.join(root, "dist", `santa-pop-in-${manifest.version}.zip`);
const stage = fs.mkdtempSync(path.join(os.tmpdir(), "santa-package-"));
try {
  for (const file of files) {
    if (file.includes("..") || path.isAbsolute(file)) throw new Error(`Invalid runtime path: ${file}`);
    const dest = path.join(stage, file);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(root, file), dest);
    fs.chmodSync(dest, 0o644);
    fs.utimesSync(dest, 946684800, 946684800);
  }
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const zip = path.join(stage, "release.zip");
  execFileSync("zip", ["-q", "-X", zip, ...files], { cwd: stage, env: { ...process.env, TZ: "UTC" } });
  fs.copyFileSync(zip, out);
  console.log(`Built ${path.relative(root, out)} (${fs.statSync(out).size} bytes, ${files.length} files)`);
} finally {
  fs.rmSync(stage, { recursive: true, force: true });
}
