// electron-builder afterPack hook — force an ad-hoc code signature on every
// packaged macOS build.
//
// Why this is needed:
//   The Release workflow disables signing (CSC_IDENTITY_AUTO_DISCOVERY=false +
//   mac.identity=null). On Apple Silicon, macOS SIGKILLs any binary that has no
//   code signature at all. The arm64 build survives because the prebuilt arm64
//   Electron binaries ship *linker* ad-hoc signatures — but the x64 build, which
//   we cross-compile on an arm64 runner, does NOT, so it shipped completely
//   unsigned and was dead-on-arrival for everyone who downloaded it.
//
//   `codesign --deep` also does not reliably descend into native modules under
//   `app.asar.unpacked` (e.g. keytar.node), so those must be signed explicitly
//   first, inner-to-outer, before sealing the outer bundle.
const { execFileSync } = require("node:child_process");
const path = require("node:path");
const { readdirSync, statSync } = require("node:fs");

function walk(dir, match, out) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, match, out);
    else if (match(entry)) out.push(full);
  }
}

function adhocSign(target) {
  execFileSync("codesign", ["--force", "--sign", "-", target], {
    stdio: "inherit",
  });
}

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") return;

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(context.appOutDir, `${appName}.app`);

  // 1. Sign nested native code first — codesign --deep misses these.
  const nested = [];
  walk(appPath, (n) => n.endsWith(".node") || n.endsWith(".dylib"), nested);
  for (const file of nested) {
    adhocSign(file);
    console.log(`[after-pack] ad-hoc signed nested: ${path.relative(appPath, file)}`);
  }

  // 2. Seal the whole bundle (frameworks, helpers, main executable).
  execFileSync("codesign", ["--force", "--deep", "--sign", "-", appPath], {
    stdio: "inherit",
  });
  console.log(`[after-pack] ad-hoc signed app bundle: ${appPath}`);

  // 3. Fail loudly if anything is still unsigned, so a broken build never ships.
  execFileSync("codesign", ["--verify", "--deep", "--strict", appPath], {
    stdio: "inherit",
  });
  console.log(`[after-pack] signature verified for ${appName}.app`);
};
