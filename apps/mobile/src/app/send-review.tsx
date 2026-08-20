import { useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { formatWeiAsEthDecimalString, type EthereumTxHash } from 'chain-domain';

import { CoinBadge } from '@/components/coin-badge';
import { ScreenHeader } from '@/components/screen-header';
import { ScreenScaffold } from '@/components/screen-scaffold';
import { Colors, Spacing } from '@/constants/theme';
import {
  EthereumSendConfirmationError,
  confirmAndSendEthereumV1,
  type EthereumSendConfirmationErrorReason,
} from '@/services/ethereum-send-confirmation';
import { consumePendingEthereumSend } from '@/services/ethereum-send-session';

const palette = Colors.dark;

/**
 * Stage 5G.2.4 — user-facing copy for each `EthereumSendConfirmationError`
 * reason. Never the underlying/raw error message — that stays entirely
 * inside `ethereum-send-confirmation.ts` and is never read here.
 */
const ERROR_MESSAGES: Record<EthereumSendConfirmationErrorReason, string> = {
  auth_or_signing_failed: 'Authentication was cancelled or signing failed.',
  broadcast_rejected: 'The transaction was not accepted by the network.',
  broadcast_ambiguous: 'Transaction status is uncertain. Please wait before trying again.',
  hash_mismatch: 'Something went wrong confirming this transaction.',
};

/**
 * Retry is offered ONLY for failures where nothing was ever (or definitely
 * was not) broadcast — never for an outcome where the network's own state
 * is uncertain. An ambiguous transport failure or an unexplained hash
 * mismatch must never get a one-tap immediate retry here: the existing RPC
 * primitives give no proof that would be safe (see
 * `broadcastEthMainnetRawTransaction`'s own 'ambiguous' contract) — the
 * user must explicitly step away (Back to Edit, forcing a fresh prepare) or
 * to Home instead.
 */
const RETRYABLE_REASONS: ReadonlySet<EthereumSendConfirmationErrorReason> = new Set([
  'auth_or_signing_failed',
  'broadcast_rejected',
]);

type ConfirmState =
  | { status: 'ready' }
  | { status: 'signing' }
  | { status: 'broadcasting' }
  | { status: 'success'; txHash: EthereumTxHash }
  | { status: 'error'; reason: EthereumSendConfirmationErrorReason };

function abbreviateTxHash(txHash: EthereumTxHash): string {
  return `${txHash.slice(0, 10)}…${txHash.slice(-6)}`;
}

/**
 * Stage 5G.2.3/5G.2.4 — Review + Confirm & Send. Displays exactly the
 * immutable `EthereumV1PreparedSend` snapshot the Send form already
 * prepared (Stage 5G.2.2) — this screen never calls `prepareEthereumV1Send`
 * itself, never re-fetches nonce/fee/balance, and never recomputes the
 * amount/recipient. Confirm & Send signs and broadcasts EXACTLY this
 * snapshot via `confirmAndSendEthereumV1` (Stage 5G.2.4) — never a
 * silently re-fetched transaction.
 */
export default function SendReviewScreen() {
  const router = useRouter();
  // Consumed exactly once, at mount — `useState`'s lazy initializer runs
  // only on the very first render of this screen instance, never again,
  // so re-renders (e.g. from this component's own state changes) can never
  // consume a second time.
  const [prepared] = useState(() => consumePendingEthereumSend());
  const [confirmState, setConfirmState] = useState<ConfirmState>({ status: 'ready' });
  // Single-flight guard against a duplicate concurrent confirm — e.g. a
  // fast double-tap before the first attempt's promise has settled. Mirrors
  // the same ref-based pattern `send.tsx`'s `isPreparingRef` already uses.
  // Once a broadcast succeeds, `confirmState.status` becomes `'success'`
  // and the Confirm & Send control is unmounted entirely (see the render
  // below) — there is no path back to a re-armed CTA for this snapshot.
  const isConfirmingRef = useRef(false);

  const handleConfirm = useCallback(async () => {
    if (!prepared || isConfirmingRef.current) {
      return;
    }
    isConfirmingRef.current = true;
    setConfirmState({ status: 'signing' });

    try {
      const txHash = await confirmAndSendEthereumV1(prepared, {
        onPhaseChange: (phase) => setConfirmState({ status: phase }),
      });
      isConfirmingRef.current = false;
      setConfirmState({ status: 'success', txHash });
    } catch (error) {
      isConfirmingRef.current = false;
      // Every throw site inside confirmAndSendEthereumV1 wraps its error as
      // EthereumSendConfirmationError; a non-matching error is treated as
      // the least-trusted, NON-retryable outcome rather than defaulting to
      // one that would offer an easy retry.
      const reason =
        error instanceof EthereumSendConfirmationError ? error.reason : 'hash_mismatch';
      setConfirmState({ status: 'error', reason });
    }
  }, [prepared]);

  const handleDone = useCallback(() => {
    router.dismissAll();
  }, [router]);

  if (!prepared) {
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

  const isBusy = confirmState.status === 'signing' || confirmState.status === 'broadcasting';

  if (confirmState.status === 'success') {
    return (
      <ScreenScaffold header={<ScreenHeader title="Review" />}>
        <View style={styles.successPanel}>
          <Text style={styles.successTitle}>Transaction sent</Text>
          <Text style={styles.successHash}>{abbreviateTxHash(confirmState.txHash)}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Done"
          onPress={handleDone}
          style={({ pressed }) => [styles.continueButton, pressed && styles.continueButtonDisabled]}>
          <Text style={styles.continueButtonLabel}>Done</Text>
        </Pressable>
      </ScreenScaffold>
    );
  }

  return (
    <ScreenScaffold header={<ScreenHeader title="Review" back={!isBusy} />}>
      <View style={styles.assetRow}>
        <CoinBadge symbol="ETH" size={28} />
        <View>
          <Text style={styles.assetName}>Ethereum</Text>
          <Text style={styles.assetSymbol}>ETH</Text>
        </View>
      </View>

      <View style={styles.card}>
        <ReviewRow label="Recipient" value={prepared.recipient} mono />
        <ReviewRow label="Amount" value={`${formatWeiAsEthDecimalString(prepared.amountWei)} ETH`} />
        <ReviewRow
          label="Maximum network fee"
          value={`${formatWeiAsEthDecimalString(prepared.maxFeeWei)} ETH`}
        />
        <ReviewRow
          label="Maximum total debit"
          value={`${formatWeiAsEthDecimalString(prepared.totalMaxDebitWei)} ETH`}
          emphasized
        />
        <ReviewRow label="Network" value="Ethereum" last />
      </View>

      {confirmState.status === 'error' ? (
        <View style={styles.errorPanel} accessible accessibilityRole="alert">
          <Text style={styles.errorText}>{ERROR_MESSAGES[confirmState.reason]}</Text>
        </View>
      ) : null}

      {isConfirmBlocked(confirmState) ? (
        // Non-retryable failure (ambiguous broadcast / hash mismatch): the
        // CTA is deliberately NOT rendered at all — not merely disabled —
        // so a further tap can never re-trigger signing/broadcasting for
        // this snapshot. The only way forward is Back to Edit, which forces
        // an explicit fresh prepare (a new nonce, new review) rather than a
        // blind resubmission of a transaction whose network outcome this
        // app cannot itself confirm.
        <Text style={styles.retryHint}>
          For your safety, this transaction can’t be resubmitted automatically. Go back and prepare
          a new one once you’ve confirmed the status.
        </Text>
      ) : (
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
      )}

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

/** True only for a non-retryable failure — an ambiguous broadcast outcome
 * or an unexplained hash mismatch — where re-tapping Confirm & Send must
 * never be possible for this same reviewed snapshot. */
function isConfirmBlocked(confirmState: ConfirmState): boolean {
  return confirmState.status === 'error' && !RETRYABLE_REASONS.has(confirmState.reason);
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
  successHash: {
    color: palette.textSecondary,
    fontFamily: 'ui-monospace',
    fontSize: 14,
    fontWeight: '500',
  },
});
