import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { formatWeiAsEthDecimalString, type EthereumTxHash } from 'chain-domain';

import { CoinBadge } from '@/components/coin-badge';
import { ScreenHeader } from '@/components/screen-header';
import { ScreenScaffold } from '@/components/screen-scaffold';
import { Colors, Spacing } from '@/constants/theme';
import {
  EthereumSendConfirmationError,
  confirmAndSendEthereumV1,
  confirmEthereumTransactionV1,
  type EthereumSendConfirmationErrorReason,
} from '@/services/ethereum-send-confirmation';
import {
  toEthereumErc20SendIntent,
} from '@/services/ethereum-erc20-send-preparation';
import { consumePendingEthereumSend } from '@/services/ethereum-send-session';
import { checkEthereumSendStatus, type EthereumSendStatus } from '@/services/ethereum-send-status';

const palette = Colors.dark;

/**
 * Stage 5G.2.4 — user-facing copy for each `EthereumSendConfirmationError`
 * reason that stays in the pre-broadcast `'error'` bucket. Never the
 * underlying/raw error message — that stays entirely inside
 * `ethereum-send-confirmation.ts` and is never read here.
 */
const ERROR_MESSAGES: Record<EthereumSendConfirmationErrorReason, string> = {
  auth_or_signing_failed: 'Authentication was cancelled or signing failed.',
  broadcast_rejected: 'The transaction was not accepted by the network.',
  broadcast_ambiguous: 'Transaction status is uncertain. Please wait before trying again.',
  hash_mismatch: 'Something went wrong confirming this transaction.',
};

/**
 * Retry (a fresh `confirmAndSendEthereumV1` call, i.e. fresh auth + signing
 * + broadcast) is offered ONLY for `auth_or_signing_failed` — nothing was
 * ever broadcast. Every other reason either has its own dedicated
 * post-broadcast status screen (Stage 5G.2.5: `broadcast_rejected` ->
 * `'failed'`, `broadcast_ambiguous`/`hash_mismatch` with a known hash ->
 * resolved via `checkEthereumSendStatus`) or is a genuinely unexplained
 * failure with no safe retry path.
 */
const RETRYABLE_REASONS: ReadonlySet<EthereumSendConfirmationErrorReason> = new Set([
  'auth_or_signing_failed',
]);

type ConfirmState =
  | { status: 'ready' }
  | { status: 'signing' }
  | { status: 'broadcasting' }
  | { status: 'resolving'; txHash: EthereumTxHash }
  | { status: 'pending'; txHash: EthereumTxHash }
  | { status: 'confirmed'; txHash: EthereumTxHash }
  | { status: 'failed'; txHash: EthereumTxHash | null }
  | { status: 'uncertain'; txHash: EthereumTxHash }
  | { status: 'error'; reason: EthereumSendConfirmationErrorReason };

function formatAtomicTokenAmount(
  amount: string,
  decimals: number,
): string {
  const raw = amount.padStart(decimals + 1, '0');
  const whole = raw.slice(0, -decimals);
  const fraction = raw
    .slice(-decimals)
    .replace(/0+$/, '');

  return fraction
    ? `${whole}.${fraction}`
    : whole;
}

function abbreviateTxHash(txHash: EthereumTxHash): string {
  return `${txHash.slice(0, 10)}…${txHash.slice(-6)}`;
}

/**
 * Stage 5G.2.3/5G.2.4/5G.2.5 — Review, Confirm & Send, and post-broadcast
 * status. Displays exactly the immutable `EthereumV1PreparedSend` snapshot
 * the Send form already prepared (Stage 5G.2.2) — this screen never calls
 * `prepareEthereumV1Send` itself, never re-fetches nonce/fee/balance, and
 * never recomputes the amount/recipient. Confirm & Send signs and
 * broadcasts EXACTLY this snapshot via `confirmAndSendEthereumV1` (Stage
 * 5G.2.4) — never a silently re-fetched transaction. Once broadcast has
 * been attempted at all (accepted, rejected, or ambiguous), this screen
 * NEVER signs or broadcasts again for this snapshot — status resolution
 * (Stage 5G.2.5) is read-only, via `checkEthereumSendStatus`.
 */
export default function SendReviewScreen() {
  const router = useRouter();
  // Consumed exactly once, at mount — `useState`'s lazy initializer runs
  // only on the very first render of this screen instance, never again,
  // so re-renders (e.g. from this component's own state changes) can never
  // consume a second time.
  const [pending] = useState(
    () => consumePendingEthereumSend(),
  );
  const [confirmState, setConfirmState] = useState<ConfirmState>({ status: 'ready' });
  // Single-flight guard against a duplicate concurrent confirm — e.g. a
  // fast double-tap before the first attempt's promise has settled. Mirrors
  // the same ref-based pattern `send.tsx`'s `isPreparingRef` already uses.
  // Once a broadcast attempt has been made at all, `confirmState.status`
  // moves to one of the post-broadcast statuses below and the Confirm &
  // Send control is unmounted entirely (see the render below) — there is
  // no path back to a re-armed CTA for this snapshot.
  const isConfirmingRef = useRef(false);
  // Separate single-flight guard for the read-only "Check status" action —
  // independent of `isConfirmingRef`, since checking status never signs or
  // broadcasts and must remain possible even while nothing else is
  // in-flight.
  const isCheckingStatusRef = useRef(false);
  // Guards every async continuation in this component against updating
  // state after unmount — this screen performs no interval/timer-based
  // polling (see `ethereum-send-status.ts`'s own doc comment for why a
  // single manual/one-shot check is this stage's deliberate, minimal
  // design), so there is no timer to cancel on unmount; this ref is the
  // corresponding safeguard for the one kind of async work that DOES
  // exist — a single in-flight status lookup.
  const isMountedRef = useRef(true);
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  /**
   * The ONE place this screen ever calls `checkEthereumSendStatus` — reused
   * identically for the automatic one-shot resolution right after an
   * ambiguous/hash-mismatch broadcast outcome, and for the manual "Check
   * status" button. Read-only: never signs, never broadcasts, never
   * constructs a transaction (see that function's own doc comment).
   */
  const resolveStatus = useCallback(async (txHash: EthereumTxHash) => {
    setConfirmState({ status: 'resolving', txHash });
    let status: EthereumSendStatus;
    try {
      status = await checkEthereumSendStatus(txHash);
    } catch {
      // The lookup itself failed at the transport level (e.g. offline) —
      // stay uncertain rather than fabricating a definitive status either
      // way.
      if (isMountedRef.current) {
        setConfirmState({ status: 'uncertain', txHash });
      }
      return;
    }
    if (!isMountedRef.current) {
      return;
    }
    setConfirmState({ status, txHash });
  }, []);

  const handleConfirm = useCallback(async () => {
    if (!pending || isConfirmingRef.current) {
      return;
    }
    isConfirmingRef.current = true;
    setConfirmState({ status: 'signing' });

    try {
      const txHash =
        pending.kind === 'native'
          ? await confirmAndSendEthereumV1(
              pending.prepared,
              {
                onPhaseChange: (phase) =>
                  setConfirmState({
                    status: phase,
                  }),
              },
            )
          : await confirmEthereumTransactionV1(
              toEthereumErc20SendIntent(
                pending.prepared,
              ),
              {
                onPhaseChange: (phase) =>
                  setConfirmState({
                    status: phase,
                  }),
              },
            );
      isConfirmingRef.current = false;
      // Broadcast accepted: show "Transaction sent" / pending immediately —
      // never block the UI waiting for mining. No automatic lookup here;
      // `'accepted'` is already a definitive positive signal, unlike the
      // ambiguous case below.
      setConfirmState({ status: 'pending', txHash });
    } catch (error) {
      isConfirmingRef.current = false;

      if (error instanceof EthereumSendConfirmationError) {
        if (error.reason === 'broadcast_rejected') {
          // Definite rejection — no lookup offered (the transaction never
          // reached a mempool, so a lookup would only ever return
          // 'not_found', which would misleadingly read as "uncertain"). No
          // automatic new nonce, no re-sign — the user must explicitly
          // start a fresh Send.
          setConfirmState({ status: 'failed', txHash: null });
          return;
        }
        if (
          (error.reason === 'broadcast_ambiguous' || error.reason === 'hash_mismatch') &&
          error.signerTxHash
        ) {
          // Never re-sign, never broadcast new bytes — resolve using the
          // already-known locally-computed hash only.
          await resolveStatus(error.signerTxHash);
          return;
        }
      }

      const reason =
        error instanceof EthereumSendConfirmationError ? error.reason : 'hash_mismatch';
      setConfirmState({ status: 'error', reason });
    }
  }, [pending, resolveStatus]);

  const handleCheckStatus = useCallback(async () => {
    if (isCheckingStatusRef.current) {
      return;
    }
    if (confirmState.status !== 'pending' && confirmState.status !== 'uncertain') {
      return;
    }
    isCheckingStatusRef.current = true;
    await resolveStatus(confirmState.txHash);
    isCheckingStatusRef.current = false;
  }, [confirmState, resolveStatus]);

  const handleDone = useCallback(() => {
    router.dismissAll();
  }, [router]);

  if (!pending) {
    return (
      <ScreenScaffold header={<ScreenHeader title="Review" back />}>
        <View style={styles.expiredPanel}>
          <Text style={styles.expiredTitle}>Nothing to review</Text>
          <Text style={styles.expiredBody}>Please prepare a new transaction.</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to Send"
          onPress={() => router.replace('/send')}
          style={({ pressed }) => [styles.editButton, pressed && styles.editButtonPressed]}>
          <Text style={styles.editButtonLabel}>Back to Send</Text>
        </Pressable>
      </ScreenScaffold>
    );
  }

  const prepared = pending.prepared;
  const isErc20 = pending.kind === 'erc20';

  const displaySymbol =
    isErc20
      ? prepared.symbol === 'XAUT'
        ? 'XAU₮'
        : prepared.symbol
      : 'ETH';

  const displayName =
    isErc20
      ? prepared.symbol === 'USDC'
        ? 'USD Coin'
        : prepared.symbol === 'USDT'
          ? 'Tether'
          : 'Tether Gold'
      : 'Ethereum';

  const isBusy =
    confirmState.status === 'signing' ||
    confirmState.status === 'broadcasting';

  if (
    confirmState.status === 'resolving' ||
    confirmState.status === 'pending' ||
    confirmState.status === 'confirmed' ||
    confirmState.status === 'failed' ||
    confirmState.status === 'uncertain'
  ) {
    return <SendStatusView confirmState={confirmState} onCheckStatus={handleCheckStatus} onDone={handleDone} />;
  }

  return (
    <ScreenScaffold header={<ScreenHeader title="Review" back={!isBusy} />}>
      <View style={styles.assetRow}>
        <CoinBadge
          symbol={isErc20 ? prepared.symbol : 'ETH'}
          size={28}
        />
        <View>
          <Text style={styles.assetName}>
            {displayName}
          </Text>
          <Text style={styles.assetSymbol}>
            {displaySymbol}
          </Text>
        </View>
      </View>

      <View style={styles.card}>
        <ReviewRow
          label="Recipient"
          value={prepared.recipient}
          mono
        />

        <ReviewRow
          label="Amount"
          value={
            isErc20
              ? `${formatAtomicTokenAmount(
                  prepared.amountAtomic,
                  prepared.tokenDecimals,
                )} ${displaySymbol}`
              : `${formatWeiAsEthDecimalString(
                  prepared.amountWei,
                )} ETH`
          }
        />

        <ReviewRow
          label="Maximum network fee"
          value={`${formatWeiAsEthDecimalString(
            prepared.maxFeeWei,
          )} ETH`}
        />

        {!isErc20 ? (
          <ReviewRow
            label="Maximum total debit"
            value={`${formatWeiAsEthDecimalString(
              prepared.totalMaxDebitWei,
            )} ETH`}
            emphasized
          />
        ) : null}

        <ReviewRow
          label="Network"
          value="Ethereum Mainnet"
          last
        />
      </View>

      {confirmState.status === 'error' ? (
        <View style={styles.errorPanel} accessible accessibilityRole="alert">
          <Text style={styles.errorText}>{ERROR_MESSAGES[confirmState.reason]}</Text>
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Confirm & Send"
        accessibilityState={{ disabled: isBusy, busy: isBusy }}
        disabled={isBusy}
        onPress={handleConfirm}
        style={({ pressed }) => [
          styles.continueButton,
          (isBusy || pressed) && styles.continueButtonDisabled,
        ]}>
        <View style={styles.continueButtonContent}>
          {isBusy ? <ActivityIndicator size="small" color={palette.background} /> : null}
          <Text style={styles.continueButtonLabel}>{confirmButtonLabel(confirmState)}</Text>
        </View>
      </Pressable>

      {!isBusy && confirmState.status === 'error' && RETRYABLE_REASONS.has(confirmState.reason) ? (
        <Text style={styles.retryHint}>Tap Confirm & Send again to retry.</Text>
      ) : null}

      {!isBusy ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to Edit"
          onPress={() => router.back()}
          style={({ pressed }) => [styles.editButton, pressed && styles.editButtonPressed]}>
          <Text style={styles.editButtonLabel}>Back to Edit</Text>
        </Pressable>
      ) : null}
    </ScreenScaffold>
  );
}

function confirmButtonLabel(confirmState: ConfirmState): string {
  if (confirmState.status === 'signing') return 'Authenticating…';
  if (confirmState.status === 'broadcasting') return 'Sending…';
  return 'Confirm & Send';
}

type PostBroadcastConfirmState = Extract<
  ConfirmState,
  { status: 'resolving' | 'pending' | 'confirmed' | 'failed' | 'uncertain' }
>;

const STATUS_COPY: Record<
  PostBroadcastConfirmState['status'],
  { title: string; body: string }
> = {
  resolving: {
    title: 'Checking status…',
    body: 'This only reads the network — nothing is signed or sent again.',
  },
  pending: {
    title: 'Transaction sent',
    body: 'Your transaction has been broadcast and is waiting to be mined.',
  },
  confirmed: {
    title: 'Transaction confirmed',
    body: 'Your transaction has been mined successfully.',
  },
  failed: {
    title: 'Transaction failed',
    body: 'This transaction did not succeed. No further attempt was made automatically.',
  },
  uncertain: {
    title: 'Status uncertain',
    body: "We couldn't confirm this transaction's status yet. This does not necessarily mean it failed.",
  },
};

/**
 * Stage 5G.2.5 — the one post-broadcast result screen, covering every
 * status a Send can end up in after a broadcast attempt has actually been
 * made. "Check status" is offered only for `pending`/`uncertain` (the two
 * non-final statuses) and always reuses the same read-only
 * `checkEthereumSendStatus` path — never signing, never broadcasting.
 * "Send again" is never offered from here, for any status: reusing this
 * exact reviewed snapshot for a second signing/broadcast attempt is exactly
 * what this stage's security requirements forbid.
 */
function SendStatusView({
  confirmState,
  onCheckStatus,
  onDone,
}: {
  confirmState: PostBroadcastConfirmState;
  onCheckStatus: () => void;
  onDone: () => void;
}) {
  const copy = STATUS_COPY[confirmState.status];

  return (
    <ScreenScaffold header={<ScreenHeader title="Review" />}>
      <View style={styles.successPanel}>
        {confirmState.status === 'resolving' ? (
          <ActivityIndicator size="small" color={palette.text} />
        ) : null}
        <Text style={styles.successTitle}>{copy.title}</Text>
        <Text style={styles.statusBody}>{copy.body}</Text>
        {confirmState.status !== 'resolving' && confirmState.txHash ? (
          <Text style={styles.successHash}>{abbreviateTxHash(confirmState.txHash)}</Text>
        ) : null}
      </View>

      {confirmState.status === 'pending' || confirmState.status === 'uncertain' ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Check status"
          onPress={onCheckStatus}
          style={({ pressed }) => [styles.checkStatusButton, pressed && styles.continueButtonDisabled]}>
          <Text style={styles.checkStatusLabel}>Check status</Text>
        </Pressable>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Done"
        onPress={onDone}
        style={({ pressed }) => [styles.continueButton, pressed && styles.continueButtonDisabled]}>
        <Text style={styles.continueButtonLabel}>Done</Text>
      </Pressable>
    </ScreenScaffold>
  );
}

type ReviewRowProps = {
  label: string;
  value: string;
  mono?: boolean;
  emphasized?: boolean;
  last?: boolean;
};

function ReviewRow({ label, value, mono, emphasized, last }: ReviewRowProps) {
  return (
    <View style={[styles.row, !last && styles.rowDivider]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text
        style={[styles.rowValue, mono && styles.rowValueMono, emphasized && styles.rowValueEmphasized]}
        numberOfLines={mono ? 1 : undefined}
        ellipsizeMode={mono ? 'middle' : undefined}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  assetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: Spacing.four,
  },
  assetName: {
    color: palette.text,
    fontSize: 15,
    fontWeight: '600',
  },
  assetSymbol: {
    color: palette.textSecondary,
    fontSize: 12,
    fontWeight: '500',
    marginTop: 1,
  },
  card: {
    marginTop: Spacing.four,
    backgroundColor: palette.backgroundElement,
    borderRadius: 14,
    paddingHorizontal: Spacing.three,
  },
  row: {
    paddingVertical: Spacing.two + 2,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.border,
  },
  rowLabel: {
    color: palette.textSecondary,
    fontSize: 12,
    fontWeight: '500',
  },
  rowValue: {
    color: palette.text,
    fontSize: 15,
    fontWeight: '600',
    marginTop: 2,
  },
  rowValueMono: {
    fontFamily: 'ui-monospace',
    fontSize: 13,
    fontWeight: '500',
  },
  rowValueEmphasized: {
    color: palette.accentGold,
  },
  errorPanel: {
    marginTop: Spacing.three,
    backgroundColor: palette.backgroundElement,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  errorText: {
    color: palette.negative,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  retryHint: {
    color: palette.textSecondary,
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: Spacing.two,
  },
  continueButton: {
    backgroundColor: palette.accentGold,
    borderRadius: 14,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    marginTop: Spacing.five,
  },
  continueButtonDisabled: {
    opacity: 0.5,
  },
  continueButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  continueButtonLabel: {
    color: palette.background,
    fontSize: 16,
    fontWeight: '700',
  },
  checkStatusButton: {
    borderRadius: 14,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    marginTop: Spacing.five,
    backgroundColor: palette.backgroundElement,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  checkStatusLabel: {
    color: palette.text,
    fontSize: 16,
    fontWeight: '700',
  },
  editButton: {
    marginTop: Spacing.three,
    alignItems: 'center',
    paddingVertical: Spacing.two + 2,
  },
  editButtonPressed: {
    opacity: 0.55,
  },
  editButtonLabel: {
    color: palette.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  expiredPanel: {
    marginTop: Spacing.five,
    alignItems: 'center',
    gap: Spacing.one,
  },
  expiredTitle: {
    color: palette.text,
    fontSize: 16,
    fontWeight: '600',
  },
  expiredBody: {
    color: palette.textSecondary,
    fontSize: 13,
  },
  successPanel: {
    marginTop: Spacing.six,
    alignItems: 'center',
    gap: Spacing.two,
  },
  successTitle: {
    color: palette.text,
    fontSize: 20,
    fontWeight: '700',
  },
  statusBody: {
    color: palette.textSecondary,
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
    maxWidth: 280,
  },
  successHash: {
    color: palette.textSecondary,
    fontFamily: 'ui-monospace',
    fontSize: 14,
    fontWeight: '500',
    marginTop: Spacing.one,
  },
});
