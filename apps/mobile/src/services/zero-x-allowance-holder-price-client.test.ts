import { test } from 'node:test';
import assert from 'node:assert/strict';

import { toAtomicAmount, toEthereumAddress, type EthereumSwapAsset } from 'chain-domain';

import {
  buildZeroXAllowanceHolderPriceRequest,
  buildZeroXAllowanceHolderPriceUrl,
  fetchZeroXAllowanceHolderPrice,
  parseZeroXAllowanceHolderPricePreview,
  ZeroXAllowanceHolderPriceError,
  type ZeroXAllowanceHolderPriceRequestContext,
  type ZeroXAllowanceHolderPriceTransport,
} from './zero-x-allowance-holder-price-client';

const nativeEth: EthereumSwapAsset = { kind: 'native', chainId: 'ethereum:mainnet' };

const usdc: EthereumSwapAsset = {
  kind: 'erc20',
  chainId: 'ethereum:mainnet',
  contractAddress: toEthereumAddress('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'),
};

const NATIVE_SENTINEL = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
const USDC_ADDRESS = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const TAKER = toEthereumAddress('0xaAaAaAaAaAaaaAAaAaAaaAaAAaAaaAaAaAaaAaaA');
const ALLOWANCE_HOLDER_CONTRACT = '0x0000000000001fF3684f28c67538d4D072C22734';

const SELL_ETH_AMOUNT = toAtomicAmount('1000000000000000000');
const SELL_USDC_AMOUNT = toAtomicAmount('2500000000');

const sellEthRequest: ZeroXAllowanceHolderPriceRequestContext = {
  chainId: 1,
  sellAsset: nativeEth,
  buyAsset: usdc,
  sellAmount: SELL_ETH_AMOUNT,
  taker: TAKER,
};

const sellUsdcRequest: ZeroXAllowanceHolderPriceRequestContext = {
  chainId: 1,
  sellAsset: usdc,
  buyAsset: nativeEth,
  sellAmount: SELL_USDC_AMOUNT,
  taker: TAKER,
};

function reasonIs(reason: string) {
  return (error: unknown) => error instanceof ZeroXAllowanceHolderPriceError && error.reason === reason;
}

function fakeJsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function validEthPriceResponse(overrides: Record<string, unknown> = {}) {
  return {
    sellToken: NATIVE_SENTINEL,
    buyToken: USDC_ADDRESS,
    sellAmount: SELL_ETH_AMOUNT,
    buyAmount: '2500000000',
    minBuyAmount: '2450000000',
    liquidityAvailable: true,
    issues: { allowance: null },
    ...overrides,
  };
}

function validUsdcPriceResponse(overrides: Record<string, unknown> = {}) {
  return {
    sellToken: USDC_ADDRESS,
    buyToken: NATIVE_SENTINEL,
    sellAmount: SELL_USDC_AMOUNT,
    buyAmount: '1000000000000000000',
    minBuyAmount: '990000000000000000',
    liquidityAvailable: true,
    issues: { allowance: { spender: ALLOWANCE_HOLDER_CONTRACT } },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Request builder
// ---------------------------------------------------------------------------

test('builds the ETH -> USDC price request with the native ETH sentinel as sellToken', () => {
  const request = buildZeroXAllowanceHolderPriceRequest(sellEthRequest);

  assert.equal(request.path, '/swap/allowance-holder/price');
  assert.deepEqual(request.query, {
    chainId: '1',
    sellToken: NATIVE_SENTINEL,
    buyToken: USDC_ADDRESS.toLowerCase(),
    sellAmount: SELL_ETH_AMOUNT,
    taker: TAKER,
  });
});

test('builds the USDC -> ETH price request with the ERC-20 contract address as sellToken', () => {
  const request = buildZeroXAllowanceHolderPriceRequest(sellUsdcRequest);

  assert.deepEqual(request.query, {
    chainId: '1',
    sellToken: USDC_ADDRESS.toLowerCase(),
    buyToken: NATIVE_SENTINEL,
    sellAmount: SELL_USDC_AMOUNT,
    taker: TAKER,
  });
});

test('preserves the exact base-unit sellAmount in the built request', () => {
  const request = buildZeroXAllowanceHolderPriceRequest(sellEthRequest);
  assert.equal(request.query.sellAmount, '1000000000000000000');
});

test('preserves the exact taker address in the built request', () => {
  const request = buildZeroXAllowanceHolderPriceRequest(sellEthRequest);
  assert.equal(request.query.taker, TAKER);
});

test('rejects a request context with a non-mainnet chain id', () => {
  assert.throws(
    () => buildZeroXAllowanceHolderPriceRequest({ ...sellEthRequest, chainId: 137 }),
    reasonIs('unsupported_chain'),
  );
});

// ---------------------------------------------------------------------------
// URL construction
// ---------------------------------------------------------------------------

test('builds a full ETH -> USDC URL containing every required query field and no API key', () => {
  const request = buildZeroXAllowanceHolderPriceRequest(sellEthRequest);
  const url = buildZeroXAllowanceHolderPriceUrl('https://api.0x.org', request);

  assert.equal(
    url,
    `https://api.0x.org/swap/allowance-holder/price?chainId=1&sellToken=${NATIVE_SENTINEL}&buyToken=${USDC_ADDRESS.toLowerCase()}&sellAmount=1000000000000000000&taker=${TAKER}`,
  );
  assert.ok(!/key/i.test(url), 'URL must never contain an API key or the word "key"');
});

test('builds a full USDC -> ETH URL with a trailing-slash base URL normalized', () => {
  const request = buildZeroXAllowanceHolderPriceRequest(sellUsdcRequest);
  const url = buildZeroXAllowanceHolderPriceUrl('https://api.0x.org/', request);

  assert.ok(url.startsWith('https://api.0x.org/swap/allowance-holder/price?'));
  assert.ok(!url.includes('//swap'));
  assert.ok(!/key/i.test(url));
});

// ---------------------------------------------------------------------------
// Response parsing (pure, no network)
// ---------------------------------------------------------------------------

test('parses a valid ETH -> USDC price preview', () => {
  const preview = parseZeroXAllowanceHolderPricePreview({
    request: sellEthRequest,
    response: validEthPriceResponse(),
  });

  assert.equal(preview.chainId, 'ethereum:mainnet');
  assert.equal(preview.sellAmount, '1000000000000000000');
  assert.equal(preview.buyAmount, '2500000000');
  assert.equal(preview.minBuyAmount, '2450000000');
  assert.equal(preview.allowanceTarget, undefined);
  assert.equal(preview.liquidityAvailable, true);
});

test('parses a valid USDC -> ETH price preview with allowanceTarget from issues.allowance.spender', () => {
  const preview = parseZeroXAllowanceHolderPricePreview({
    request: sellUsdcRequest,
    response: validUsdcPriceResponse(),
  });

  assert.equal(preview.allowanceTarget, ALLOWANCE_HOLDER_CONTRACT);
});

test('does not reject an ERC-20 preview with no allowance info at all (informational only)', () => {
  const preview = parseZeroXAllowanceHolderPricePreview({
    request: sellUsdcRequest,
    response: validUsdcPriceResponse({ issues: { allowance: null } }),
  });

  assert.equal(preview.allowanceTarget, undefined);
});

test('ignores allowance fields on a native ETH sell price preview', () => {
  const preview = parseZeroXAllowanceHolderPricePreview({
    request: sellEthRequest,
    response: validEthPriceResponse({
      issues: { allowance: { spender: ALLOWANCE_HOLDER_CONTRACT } },
      allowanceTarget: ALLOWANCE_HOLDER_CONTRACT,
    }),
  });

  assert.equal(preview.allowanceTarget, undefined);
});

test('rejects a malformed (non-object) price response', () => {
  assert.throws(
    () => parseZeroXAllowanceHolderPricePreview({ request: sellEthRequest, response: 'nope' }),
    reasonIs('malformed_response'),
  );
});

test('rejects a price response whose sellToken does not match the requested sell asset', () => {
  assert.throws(
    () =>
      parseZeroXAllowanceHolderPricePreview({
        request: sellEthRequest,
        response: validEthPriceResponse({ sellToken: USDC_ADDRESS }),
      }),
    reasonIs('unexpected_sell_token'),
  );
});

test('rejects a price response whose buyToken does not match the requested buy asset', () => {
  assert.throws(
    () =>
      parseZeroXAllowanceHolderPricePreview({
        request: sellEthRequest,
        response: validEthPriceResponse({ buyToken: NATIVE_SENTINEL }),
      }),
    reasonIs('unexpected_buy_token'),
  );
});

test('rejects a price response whose sellAmount differs from the requested sellAmount', () => {
  assert.throws(
    () =>
      parseZeroXAllowanceHolderPricePreview({
        request: sellEthRequest,
        response: validEthPriceResponse({ sellAmount: '999999999999999999' }),
      }),
    reasonIs('sell_amount_mismatch'),
  );
});

test('rejects a price response with a malformed buyAmount', () => {
  assert.throws(
    () =>
      parseZeroXAllowanceHolderPricePreview({
        request: sellEthRequest,
        response: validEthPriceResponse({ buyAmount: '1.5' }),
      }),
    reasonIs('invalid_field'),
  );
});

test('rejects a price response whose issues.allowance.spender and top-level allowanceTarget disagree', () => {
  const OTHER = '0x2222222222222222222222222222222222222222';
  assert.throws(
    () =>
      parseZeroXAllowanceHolderPricePreview({
        request: sellUsdcRequest,
        response: validUsdcPriceResponse({
          issues: { allowance: { spender: ALLOWANCE_HOLDER_CONTRACT } },
          allowanceTarget: OTHER,
        }),
      }),
    reasonIs('invalid_field'),
  );
});

test('a preview has no transaction fields — cannot be mistaken for or fed into an executable SwapQuote', () => {
  const preview = parseZeroXAllowanceHolderPricePreview({
    request: sellEthRequest,
    response: validEthPriceResponse(),
  });

  assert.equal('transactionTarget' in preview, false);
  assert.equal('transactionCalldata' in preview, false);
  assert.equal('transactionValueWei' in preview, false);
});

// ---------------------------------------------------------------------------
// Transport boundary
// ---------------------------------------------------------------------------

test('fetchZeroXAllowanceHolderPrice invokes the injected transport with the expected URL/method', async () => {
  let capturedUrl: string | undefined;
  let capturedInit: RequestInit | undefined;

  const transport: ZeroXAllowanceHolderPriceTransport = {
    baseUrl: 'https://api.0x.org',
    authorizedFetch: async (url, init) => {
      capturedUrl = url;
      capturedInit = init;
      return fakeJsonResponse(200, validEthPriceResponse());
    },
  };

  const preview = await fetchZeroXAllowanceHolderPrice(sellEthRequest, transport);

  assert.equal(
    capturedUrl,
    `https://api.0x.org/swap/allowance-holder/price?chainId=1&sellToken=${NATIVE_SENTINEL}&buyToken=${USDC_ADDRESS.toLowerCase()}&sellAmount=1000000000000000000&taker=${TAKER}`,
  );
  assert.equal(capturedInit?.method, 'GET');
  assert.equal(preview.buyAmount, '2500000000');
});

test('fetchZeroXAllowanceHolderPrice normalizes a transport-level (network/timeout) failure', async () => {
  const transport: ZeroXAllowanceHolderPriceTransport = {
    baseUrl: 'https://api.0x.org',
    authorizedFetch: async () => {
      throw new Error('Request to https://api.0x.org/swap/allowance-holder/price?... timed out after 8000ms');
    },
  };

  await assert.rejects(
    () => fetchZeroXAllowanceHolderPrice(sellEthRequest, transport),
    (error: unknown) => {
      assert.ok(error instanceof ZeroXAllowanceHolderPriceError);
      assert.equal(error.reason, 'transport_error');
      // The raw transport error message (which could embed the URL) must never leak into the normalized error.
      assert.ok(!error.message.includes('api.0x.org'));
      return true;
    },
  );
});

test('fetchZeroXAllowanceHolderPrice normalizes a non-2xx HTTP response without leaking the body', async () => {
  const transport: ZeroXAllowanceHolderPriceTransport = {
    baseUrl: 'https://api.0x.org',
    authorizedFetch: async () => fakeJsonResponse(401, { reason: 'invalid api key', code: 'UNAUTHORIZED' }),
  };

  await assert.rejects(
    () => fetchZeroXAllowanceHolderPrice(sellEthRequest, transport),
    (error: unknown) => {
      assert.ok(error instanceof ZeroXAllowanceHolderPriceError);
      assert.equal(error.reason, 'http_error');
      assert.ok(!error.message.includes('invalid api key'));
      return true;
    },
  );
});

test('fetchZeroXAllowanceHolderPrice rejects a mismatched sellAmount surfaced through the transport', async () => {
  const transport: ZeroXAllowanceHolderPriceTransport = {
    baseUrl: 'https://api.0x.org',
    authorizedFetch: async () => fakeJsonResponse(200, validEthPriceResponse({ sellAmount: '1' })),
  };

  await assert.rejects(() => fetchZeroXAllowanceHolderPrice(sellEthRequest, transport), reasonIs('sell_amount_mismatch'));
});
