// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * Copy to the clipboard, and say whether it worked.
 *
 * Six call sites did `navigator.clipboard?.writeText(x).catch(() => undefined)`,
 * which fails in total silence: the user clicks Copy, nothing is copied,
 * nothing is said. The optional chain makes it worse — where the Clipboard API
 * is missing entirely the expression is `undefined`, so there is not even a
 * rejection to swallow.
 *
 * The worst of the six was the Linux install command in the Simple Mode setup
 * screen: for a Linux user on first run that button is the only way forward.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (!navigator.clipboard?.writeText) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Denied permission, an insecure origin, or no clipboard at all.
    return false;
  }
}

/** What a copy button should show after trying. */
export type CopyState = 'idle' | 'copied' | 'failed';
