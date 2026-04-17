import { execFile } from "child_process";
import { shell } from "electron";

/**
 * Open an external URL in the user's default browser.
 *
 * On macOS, Electron's `shell.openExternal` sometimes only activates
 * the browser without navigating to the URL (observed with Chrome on
 * Electron 33). Spawning the `open` CLI hits Launch Services directly
 * and reliably opens a new tab; we fall back to `shell.openExternal`
 * if that fails.
 */
export async function openUrl(url: string): Promise<void> {
  if (!/^https?:\/\//.test(url)) {
    console.warn("[deployer] openUrl rejected non-http(s) url:", url);
    return;
  }
  await new Promise<void>((resolve) => {
    execFile("/usr/bin/open", [url], (err, _stdout, stderr) => {
      if (err) {
        console.error(
          "[deployer] /usr/bin/open failed:",
          err.message,
          stderr,
        );
        shell.openExternal(url).catch((e) => {
          console.error("[deployer] shell.openExternal fallback failed:", e);
        });
      } else {
        console.log("[deployer] opened:", url);
      }
      resolve();
    });
  });
}
