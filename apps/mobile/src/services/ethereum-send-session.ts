// Stage 5G.2.3 — ephemeral, in-memory transfer of one prepared Ethereum V1
// Send snapshot from the Send form to the Review screen.
//
// Deliberately a plain module-scoped variable, not a route param, not
// AsyncStorage/SecureStore, not any other persistence: `EthereumV1PreparedSend`
// must never be serialized into a URL/query string (Expo Router route params
// are exactly that — a URL) and must never survive process death (a killed
// app correctly forces a fresh `prepareEthereumV1Send` call, never a replay
// of stale nonce/fee/balance data). A JS module singleton satisfies both:
// it survives ordinary in-process navigation (the module is not re-evaluated
// between screens) but is gone the instant the process is, with nothing to
// explicitly clean up.

import type { EthereumV1PreparedSend } from './ethereum-send-preparation';

let pendingPreparedSend: EthereumV1PreparedSend | null = null;

/** Called by the Send form immediately before navigating to Review. */
export function setPendingEthereumSend(prepared: EthereumV1PreparedSend): void {
  pendingPreparedSend = prepared;
}

/**
 * Called by the Review screen exactly once, on mount. Consuming (reading
 * AND clearing in the same call) means a stale snapshot can never be read
 * twice — if Review is ever reached without a preceding fresh `prepareEthereumV1Send`
 * call (e.g. a direct deep link), this correctly returns `null` rather than
 * replaying old data.
 */
export function consumePendingEthereumSend(): EthereumV1PreparedSend | null {
  const prepared = pendingPreparedSend;
  pendingPreparedSend = null;
  return prepared;
}
