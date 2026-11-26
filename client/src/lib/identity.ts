const KEY = 'broncoconnect:anonId';

/**
 * A random, private id that lets the site remember you without an account.
 * Treat it like a password: it is only ever sent to our own server, never shown to other users.
 */
export function getAnonId(): string {
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
  }
  return id;
}

/** "Forget me on this device" — starts a fresh anonymous identity. */
export function resetAnonId(): string {
  localStorage.removeItem(KEY);
  return getAnonId();
}
