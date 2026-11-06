// The only channel from a page to the native shell. It carries UI state (signed in or not, a cart
// count, a request to show sign-in), never a token. Returns false outside the shell.
export function postToShell(message: { type: string; [key: string]: unknown }): boolean {
  const bridge = (window as { ReactNativeWebView?: { postMessage(data: string): void } }).ReactNativeWebView;
  if (!bridge) return false;
  bridge.postMessage(JSON.stringify(message));
  return true;
}
