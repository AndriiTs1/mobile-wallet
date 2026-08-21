import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  toAtomicAmount,
  toEthereumAddress,
  type EthereumSwapAsset,
} from 'chain-domain';

import {
  buildZeroXAllowanceHolderQuoteRequest,
  buildZeroXAllowanceHolderQuoteUrl,
  fetchZeroXAllowanceHolderQuote,
  ZeroXAllowanceHolderQuoteClientError,
  type ZeroXAllowanceHolderQuoteRequestContext,
  type ZeroXAllowanceHolderQuoteTransport,
} from './zero-x-allowance-holder-quote-client';

import {
  ZERO_X_NATIVE_TOKEN_SENTINEL,
  zeroXTokenIdentifierFor,
} from './zero-x-allowance-holder-quote-adapter';

const USDC_ADDRESS =
  '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';

const TAKER =
  toEthereumAddress('0x1111111111111111111111111111111111111111');

const ROUTER =
  '0x2222222222222222222222222222222222222222';

const ALLOWANCE_TARGET =
  '0x3333333333333333333333333333333333333333';

const CALLDATA = '0x12345678';

const nativeEth: EthereumSwapAsset = {
  kind: 'native',
  chainId: 'ethereum:mainnet',
};

const usdc: EthereumSwapAsset = {
  kind: 'erc20',
  chainId: 'ethereum:mainnet',
  contractAddress: toEthereumAddress(USDC_ADDRESS),
};

const SELL_ETH_AMOUNT =
  toAtomicAmount('1000000000000000000');

const SELL_USDC_AMOUNT =
  toAtomicAmount('2500000000');

function sellEthContext(): ZeroXAllowanceHolderQuoteRequestContext {
  return {
    chainId: 1,
    sellAsset: nativeEth,
    buyAsset: usdc,
    sellAmount: SELL_ETH_AMOUNT,
    taker: TAKER,
  };
}

function sellUsdcContext(): ZeroXAllowanceHolderQuoteRequestContext {
  return {
    chainId: 1,
    sellAsset: usdc,
    buyAsset: nativeEth,
    sellAmount: SELL_USDC_AMOUNT,
    taker: TAKER,
  };
}

function validSellEthResponse() {
  return {
    sellToken: ZERO_X_NATIVE_TOKEN_SENTINEL,
    buyToken: zeroXTokenIdentifierFor(usdc),
    sellAmount: SELL_ETH_AMOUNT,
    buyAmount: '2500000000',
    minBuyAmount: '2450000000',
    transaction: {
      to: ROUTER,
      data: CALLDATA,
      value: SELL_ETH_AMOUNT,
    },
    issues: {
      allowance: null,
    },
  };
}

function validSellUsdcResponse() {
  return {
    sellToken: zeroXTokenIdentifierFor(usdc),
    buyToken: ZERO_X_NATIVE_TOKEN_SENTINEL,
    sellAmount: SELL_USDC_AMOUNT,
    buyAmount: '1000000000000000000',
    minBuyAmount: '990000000000000000',
    allowanceTarget: ALLOWANCE_TARGET,
    transaction: {
      to: ROUTER,
      data: CALLDATA,
      value: '0',
    },
    issues: {
      allowance: null,
    },
  };
}

function jsonResponse(
  payload: unknown,
  status = 200,
): Response {
  return new Response(
    JSON.stringify(payload),
    {
      status,
      headers: {
        'Content-Type': 'application/json',
      },
    },
  );
}

function transportReturning(
  response: Response,
  capture?: (url: string, init: RequestInit) => void,
): ZeroXAllowanceHolderQuoteTransport {
  return {
    baseUrl: 'https://api.0x.org',
    authorizedFetch: async (url, init) => {
      capture?.(url, init);
      return response;
    },
  };
}

test('builds deterministic ETH -> USDC firm quote request', () => {
  const request =
    buildZeroXAllowanceHolderQuoteRequest(
      sellEthContext(),
    );

  assert.equal(
    request.path,
    '/swap/allowance-holder/quote',
  );

  assert.deepEqual(request.query, {
    chainId: '1',
    sellToken: ZERO_X_NATIVE_TOKEN_SENTINEL,
    buyToken: zeroXTokenIdentifierFor(usdc),
    sellAmount: SELL_ETH_AMOUNT,
    taker: TAKER,
  });
});

test('builds deterministic USDC -> ETH firm quote request', () => {
  const request =
    buildZeroXAllowanceHolderQuoteRequest(
      sellUsdcContext(),
    );

  assert.deepEqual(request.query, {
    chainId: '1',
    sellToken: zeroXTokenIdentifierFor(usdc),
    buyToken: ZERO_X_NATIVE_TOKEN_SENTINEL,
    sellAmount: SELL_USDC_AMOUNT,
    taker: TAKER,
  });
});

test('rejects unsupported chain before network I/O', async () => {
  let called = false;

  const context = {
    ...sellEthContext(),
    chainId: 137,
  };

  const transport: ZeroXAllowanceHolderQuoteTransport = {
    baseUrl: 'https://api.0x.org',
    authorizedFetch: async () => {
      called = true;
      return jsonResponse({});
    },
  };

  await assert.rejects(
    () =>
      fetchZeroXAllowanceHolderQuote(
        context,
        transport,
      ),
    (error: unknown) =>
      error instanceof ZeroXAllowanceHolderQuoteClientError &&
      error.reason === 'unsupported_chain',
  );

  assert.equal(called, false);
});

test('builds quote URL without authentication material', () => {
  const request =
    buildZeroXAllowanceHolderQuoteRequest(
      sellEthContext(),
    );

  const url =
    buildZeroXAllowanceHolderQuoteUrl(
      'https://api.0x.org/',
      request,
    );

  assert.ok(
    url.startsWith(
      'https://api.0x.org/swap/allowance-holder/quote?',
    ),
  );

  assert.ok(url.includes('chainId=1'));
  assert.ok(url.includes(`sellAmount=${SELL_ETH_AMOUNT}`));
  assert.ok(url.includes(`taker=${TAKER}`));

  assert.equal(
    url.toLowerCase().includes('api-key'),
    false,
  );

  assert.equal(
    url.toLowerCase().includes('0x-api-key'),
    false,
  );
});

test('fetches and validates ETH -> USDC into SwapQuote', async () => {
  let requestedUrl = '';
  let requestedMethod = '';

  const quote =
    await fetchZeroXAllowanceHolderQuote(
      sellEthContext(),
      transportReturning(
        jsonResponse(validSellEthResponse()),
        (url, init) => {
          requestedUrl = url;
          requestedMethod = String(init.method);
        },
      ),
    );

  assert.equal(requestedMethod, 'GET');
  assert.ok(
    requestedUrl.includes(
      '/swap/allowance-holder/quote?',
    ),
  );

  assert.equal(
    quote.chainId,
    'ethereum:mainnet',
  );

  assert.equal(
    quote.sellAmount,
    SELL_ETH_AMOUNT,
  );

  assert.equal(
    quote.expectedBuyAmount,
    '2500000000',
  );

  assert.equal(
    quote.minimumBuyAmount,
    '2450000000',
  );

  assert.equal(
    quote.transactionTarget.toLowerCase(),
    ROUTER.toLowerCase(),
  );

  assert.equal(
    quote.transactionCalldata,
    CALLDATA,
  );

  assert.equal(
    quote.transactionValueWei,
    SELL_ETH_AMOUNT,
  );

  assert.equal(
    quote.allowanceTarget,
    undefined,
  );
});

test('fetches and validates USDC -> ETH with allowance target', async () => {
  const quote =
    await fetchZeroXAllowanceHolderQuote(
      sellUsdcContext(),
      transportReturning(
        jsonResponse(validSellUsdcResponse()),
      ),
    );

  assert.equal(
    quote.sellAmount,
    SELL_USDC_AMOUNT,
  );

  assert.equal(
    quote.transactionValueWei,
    '0',
  );

  assert.equal(
    quote.allowanceTarget?.toLowerCase(),
    ALLOWANCE_TARGET.toLowerCase(),
  );
});

test('normalizes transport failure without leaking raw error detail', async () => {
  const transport: ZeroXAllowanceHolderQuoteTransport = {
    baseUrl: 'https://api.0x.org',
    authorizedFetch: async () => {
      throw new Error(
        'SECRET transport detail api-key=do-not-leak',
      );
    },
  };

  await assert.rejects(
    () =>
      fetchZeroXAllowanceHolderQuote(
        sellEthContext(),
        transport,
      ),
    (error: unknown) => {
      assert.ok(
        error instanceof ZeroXAllowanceHolderQuoteClientError,
      );

      assert.equal(
        error.reason,
        'transport_error',
      );

      assert.equal(
        error.message.includes('SECRET'),
        false,
      );

      assert.equal(
        error.message.includes('do-not-leak'),
        false,
      );

      return true;
    },
  );
});

test('normalizes HTTP failure without parsing provider body', async () => {
  let jsonCalled = false;

  const response = {
    ok: false,
    status: 401,
    json: async () => {
      jsonCalled = true;
      return {
        reason: 'invalid api key SECRET',
      };
    },
  } as Response;

  await assert.rejects(
    () =>
      fetchZeroXAllowanceHolderQuote(
        sellEthContext(),
        transportReturning(response),
      ),
    (error: unknown) =>
      error instanceof ZeroXAllowanceHolderQuoteClientError &&
      error.reason === 'http_error' &&
      !error.message.includes('SECRET'),
  );

  assert.equal(jsonCalled, false);
});

test('rejects malformed JSON response', async () => {
  const response = {
    ok: true,
    status: 200,
    json: async () => {
      throw new Error('invalid JSON SECRET');
    },
  } as unknown as Response;

  await assert.rejects(
    () =>
      fetchZeroXAllowanceHolderQuote(
        sellEthContext(),
        transportReturning(response),
      ),
    (error: unknown) =>
      error instanceof ZeroXAllowanceHolderQuoteClientError &&
      error.reason === 'malformed_response' &&
      !error.message.includes('SECRET'),
  );
});

test('provider sellAmount mismatch cannot bypass quote adapter', async () => {
  const response = validSellEthResponse();

  response.sellAmount =
    toAtomicAmount('999999999999999999');

  await assert.rejects(
    () =>
      fetchZeroXAllowanceHolderQuote(
        sellEthContext(),
        transportReturning(
          jsonResponse(response),
        ),
      ),
    (error: unknown) =>
      error instanceof Error,
  );
});

test('provider asset substitution cannot bypass quote adapter', async () => {
  const response = validSellEthResponse();

  response.buyToken =
    ZERO_X_NATIVE_TOKEN_SENTINEL;

  await assert.rejects(
    () =>
      fetchZeroXAllowanceHolderQuote(
        sellEthContext(),
        transportReturning(
          jsonResponse(response),
        ),
      ),
    (error: unknown) =>
      error instanceof Error,
  );
});

test('raw transaction with invalid calldata cannot become SwapQuote', async () => {
  const response = validSellEthResponse();

  response.transaction.data = '0x123';

  await assert.rejects(
    () =>
      fetchZeroXAllowanceHolderQuote(
        sellEthContext(),
        transportReturning(
          jsonResponse(response),
        ),
      ),
    (error: unknown) =>
      error instanceof Error,
  );
});
