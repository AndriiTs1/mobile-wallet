import {
  attemptProvidersInOrder,
  fetchWithTimeout,
  type ProviderAttempt,
} from './provider-failover';

export type BitcoinFeeRate = {
  readonly satPerVbyte: number;
  readonly providerId: string;
  readonly asOf: number;
};

type BitcoinFeeProvider = {
  readonly id: string;
  readonly url: string;
  readonly parse: (payload: unknown) => number;
};

function assertFeeRate(value: unknown, fieldName: string): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value <= 0 ||
    value > 10_000
  ) {
    throw new Error(
      `Invalid Bitcoin fee rate for "${fieldName}": ${JSON.stringify(value)}`,
    );
  }

  // A transaction fee rate is ultimately expressed in integer sat/vB in
  // our V1 send pipeline. Always round UP so estimation never understates
  // the provider recommendation.
  return Math.ceil(value);
}

function parseMempoolRecommendedFees(payload: unknown): number {
  if (typeof payload !== 'object' || payload === null) {
    throw new Error('Bitcoin fee response was not a JSON object');
  }

  const body = payload as Record<string, unknown>;

  // V1 uses the normal/medium recommendation rather than the fastest
  // possible confirmation target.
  return assertFeeRate(body.halfHourFee, 'halfHourFee');
}

function parseBlockstreamFeeEstimates(payload: unknown): number {
  if (typeof payload !== 'object' || payload === null) {
    throw new Error('Bitcoin fee response was not a JSON object');
  }

  const body = payload as Record<string, unknown>;

  // Blockstream Esplora fee-estimates keys are confirmation targets.
  // Target 3 is a reasonable V1 normal-speed fallback.
  return assertFeeRate(body['3'], '3');
}

const BITCOIN_FEE_PROVIDERS: readonly BitcoinFeeProvider[] = [
  {
    id: 'mempool.space',
    url: 'https://mempool.space/api/v1/fees/recommended',
    parse: parseMempoolRecommendedFees,
  },
  {
    id: 'blockstream.info',
    url: 'https://blockstream.info/api/fee-estimates',
    parse: parseBlockstreamFeeEstimates,
  },
];

async function fetchFeeRateFromProvider(
  provider: BitcoinFeeProvider,
): Promise<number> {
  let response: Response;

  try {
    response = await fetchWithTimeout(provider.url, {});
  } catch (error) {
    throw new Error(
      `Failed to reach Bitcoin fee provider: ${(error as Error).message}`,
    );
  }

  if (!response.ok) {
    throw new Error(
      `Bitcoin fee provider request failed with status ${response.status}`,
    );
  }

  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    throw new Error('Bitcoin fee provider response was not valid JSON');
  }

  return provider.parse(payload);
}

/**
 * PUBLIC-SAFE / READ-ONLY.
 *
 * Fetches a recommended Bitcoin mainnet fee rate using sequential provider
 * failover. No wallet secret, signing operation, transaction construction,
 * or broadcast occurs here.
 */
export async function fetchBitcoinMainnetFeeRate(): Promise<BitcoinFeeRate> {
  const attempts: ProviderAttempt<number>[] = BITCOIN_FEE_PROVIDERS.map(
    (provider) => ({
      id: provider.id,
      run: () => fetchFeeRateFromProvider(provider),
    }),
  );

  const { result, providerId } = await attemptProvidersInOrder(attempts);

  return {
    satPerVbyte: result,
    providerId,
    asOf: Date.now(),
  };
}
