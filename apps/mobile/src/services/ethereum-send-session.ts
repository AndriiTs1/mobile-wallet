import type { EthereumV1PreparedSend } from './ethereum-send-preparation';
import type { EthereumErc20PreparedSend } from './ethereum-erc20-send-preparation';

export type PendingEthereumSend =
  | {
      readonly kind: 'native';
      readonly prepared: EthereumV1PreparedSend;
    }
  | {
      readonly kind: 'erc20';
      readonly prepared: EthereumErc20PreparedSend;
    };

let pending: PendingEthereumSend | null = null;

export function setPendingEthereumSend(
  next: PendingEthereumSend,
): void {
  pending = next;
}

export function consumePendingEthereumSend():
  | PendingEthereumSend
  | null {
  const current = pending;
  pending = null;
  return current;
}
