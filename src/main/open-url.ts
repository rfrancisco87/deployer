import { execFile } from "child_process";
import { shell } from "electron";
import path from "path";

/**
 * Open an external URL in the user's default browser.
 *
 * Caveat: Electron's `shell.openExternal` and the plain `open <url>`
 * command both frequently misfire on Arc — they activate Arc without
 * actually navigating, or shunt the URL into "Little Arc". When Arc is
 * the default browser we tell Arc directly via AppleScript to make a
 * new tab in the front window. Everything else goes through `open`.
 */
const ARC_BUNDLE_ID = "company.thebrowser.browser";
let cachedDefaultBundleId: string | null | undefined;

function lsHandlersPath(): string {
  const home = process.env.HOME ?? "";
  return path.join(
    home,
    "Library",
    "Preferences",
    "com.apple.LaunchServices",
    "com.apple.launchservices.secure.plist",
  );
}

async function getDefaultBrowserBundleId(): Promise<string | null> {
  if (cachedDefaultBundleId !== undefined) return cachedDefaultBundleId;
  cachedDefaultBundleId = await new Promise<string | null>((resolve) => {
    execFile(
      "/usr/bin/defaults",
      ["read", lsHandlersPath(), "LSHandlers"],
      (err, stdout) => {
        if (err) {
          console.error("[deployer] defaults read failed:", err.message);
          resolve(null);
          return;
        }
        // Find the entry whose LSHandlerURLScheme = https; grab its
        // LSHandlerRoleAll bundle id.
        const blocks = stdout.split(/\}\s*,\s*\{/g);
        for (const block of blocks) {
          if (/LSHandlerURLScheme\s*=\s*https\s*;/.test(block)) {
            const m = block.match(/LSHandlerRoleAll\s*=\s*"([^"]+)"\s*;/);
            if (m) {
              console.log("[deployer] default https handler:", m[1]);
              resolve(m[1]);
              return;
            }
          }
        }
        resolve(null);
      },
    );
  });
  return cachedDefaultBundleId;
}

function escapeForAppleScript(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

async function openViaArc(url: string): Promise<boolean> {
  const script = `tell application "Arc"
    activate
    if (count of windows) is 0 then
      make new window
    end if
    tell front window to make new tab with properties {URL:"${escapeForAppleScript(url)}"}
  end tell`;
  return new Promise<boolean>((resolve) => {
    execFile(
      "/usr/bin/osascript",
      ["-e", script],
      (err, _stdout, stderr) => {
        if (err) {
          console.error("[deployer] Arc AppleScript failed:", err.message, stderr);
          resolve(false);
        } else {
          console.log("[deployer] opened in Arc:", url);
          resolve(true);
        }
      },
    );
  });
}

async function openViaOpenCli(url: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    execFile("/usr/bin/open", [url], (err, _stdout, stderr) => {
      if (err) {
        console.error("[deployer] /usr/bin/open failed:", err.message, stderr);
        resolve(false);
      } else {
        console.log("[deployer] opened via open:", url);
        resolve(true);
      }
    });
  });
}

export async function openUrl(url: string): Promise<void> {
  if (!/^https?:\/\//.test(url)) {
    console.warn("[deployer] openUrl rejected non-http(s) url:", url);
    return;
  }

  const bundle = await getDefaultBrowserBundleId();

  if (bundle === ARC_BUNDLE_ID) {
    if (await openViaArc(url)) return;
    // Fall through to open/shell if AppleScript fails (Arc not running, etc).
  }

  if (await openViaOpenCli(url)) return;

  // Last-ditch fallback.
  shell.openExternal(url).catch((err) => {
    console.error("[deployer] shell.openExternal fallback failed:", err);
  });
}
