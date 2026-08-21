import { test } from 'node:test';
import assert from 'node:assert/strict';

import { toAtomicAmount, toEthereumAddress, type EthereumSwapAsset } from 'chain-domain';

import {
  parseZeroXAllowanceHolderQuote,
  ZeroXAllowanceHolderAdapterError,
  type ZeroXAllowanceHolderRequestContext,
} from './zero-x-allowance-holder-quote-adapter';

const nativeEth: EthereumSwapAsset = { kind: 'native', chainId: 'ethereum:mainnet' };

const usdc: EthereumSwapAsset = {
  kind: 'erc20',
  chainId: 'ethereum:mainnet',
  contractAddress: toEthereumAddress('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'),
};

const NATIVE_SENTINEL = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
const USDC_ADDRESS = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const ALLOWANCE_HOLDER_CONTRACT = '0x0000000000001fF3684f28c67538d4D072C22734';
const SWAP_ROUTER_TARGET = '0x1111111254EEB25477B68fb85Ed929f73A960582';
const CALLDATA = '0x1234abcd';

const SELL_ETH_AMOUNT = '1000000000000000000';
const SELL_USDC_AMOUNT = '2500000000';

const sellEthRequest: ZeroXAllowanceHolderRequestContext = {
  chainId: 1,
  sellAsset: nativeEth,
  buyAsset: usdc,
  sellAmount: toAtomicAmount(SELL_ETH_AMOUNT),
};

const sellUsdcRequest: ZeroXAllowanceHolderRequestContext = {
  chainId: 1,
  sellAsset: usdc,
  buyAsset: nativeEth,
  sellAmount: toAtomicAmount(SELL_USDC_AMOUNT),
};

function validSellEthResponse(overrides: Record<string, unknown> = {}) {
  return {
    sellToken: NATIVE_SENTINEL,
    buyToken: USDC_ADDRESS,
    sellAmount: SELL_ETH_AMOUNT,
    buyAmount: '2500000000',
    minBuyAmount: '2450000000',
    transaction: {
      to: SWAP_ROUTER_TARGET,
      data: CALLDATA,
      value: SELL_ETH_AMOUNT,
    },
    issues: { allowance: null },
    ...overrides,
  };
}

function validSellUsdcResponse(overrides: Record<string, unknown> = {}) {
  return {
    sellToken: USDC_ADDRESS,
    buyToken: NATIVE_SENTINEL,
    sellAmount: SELL_USDC_AMOUNT,
    buyAmount: '1000000000000000000',
    minBuyAmount: '990000000000000000',
    transaction: {
      to: SWAP_ROUTER_TARGET,
      data: CALLDATA,
      value: '0',
    },
    issues: { allowance: { spender: ALLOWANCE_HOLDER_CONTRACT } },
    ...overrides,
  };
}

function reasonIs(reason: string) {
  return (error: unknown) => error instanceof ZeroXAllowanceHolderAdapterError && error.reason === reason;
}

test('parses a valid ETH -> USDC AllowanceHolder quote', () => {
  const quote = parseZeroXAllowanceHolderQuote({
    request: sellEthRequest,
    response: validSellEthResponse(),
  });

  assert.equal(quote.chainId, 'ethereum:mainnet');
  assert.equal(quote.sellAsset, nativeEth);
  assert.equal(quote.buyAsset, usdc);
  assert.equal(quote.sellAmount, SELL_ETH_AMOUNT);
  assert.equal(quote.expectedBuyAmount, '2500000000');
  assert.equal(quote.minimumBuyAmount, '2450000000');
  assert.equal(quote.allowanceTarget, undefined);
  assert.equal(quote.transactionTarget, SWAP_ROUTER_TARGET);
  assert.equal(quote.transactionCalldata, CALLDATA);
  assert.equal(quote.transactionValueWei, SELL_ETH_AMOUNT);
  assert.equal(quote.quoteExpiresAt, undefined);
});

test('parses a valid USDC -> ETH quote using issues.allowance.spender', () => {
  const quote = parseZeroXAllowanceHolderQuote({
    request: sellUsdcRequest,
    response: validSellUsdcResponse(),
  });

  assert.equal(quote.allowanceTarget, ALLOWANCE_HOLDER_CONTRACT);
  assert.notEqual(quote.allowanceTarget, quote.transactionTarget);
});

test('parses a valid USDC -> ETH quote using top-level allowanceTarget when issues.allowance is null', () => {
  const quote = parseZeroXAllowanceHolderQuote({
    request: sellUsdcRequest,
    response: validSellUsdcResponse({
      issues: { allowance: null },
      allowanceTarget: ALLOWANCE_HOLDER_CONTRACT,
    }),
  });

  assert.equal(quote.allowanceTarget, ALLOWANCE_HOLDER_CONTRACT);
});

test('parses a valid USDC -> ETH quote when issues.allowance.spender and allowanceTarget both present and matching', () => {
  const quote = parseZeroXAllowanceHolderQuote({
    request: sellUsdcRequest,
    response: validSellUsdcResponse({
      issues: { allowance: { spender: ALLOWANCE_HOLDER_CONTRACT } },
      // Different casing of the same address — must still be accepted (case-insensitive match).
      allowanceTarget: ALLOWANCE_HOLDER_CONTRACT.toLowerCase(),
    }),
  });

  assert.equal(quote.allowanceTarget.toLowerCase(), ALLOWANCE_HOLDER_CONTRACT.toLowerCase());
});

test('rejects a USDC -> ETH quote when issues.allowance.spender and allowanceTarget disagree', () => {
  const OTHER_ADDRESS = '0x2222222222222222222222222222222222222222';
  assert.throws(
    () =>
      parseZeroXAllowanceHolderQuote({
        request: sellUsdcRequest,
        response: validSellUsdcResponse({
          issues: { allowance: { spender: ALLOWANCE_HOLDER_CONTRACT } },
          allowanceTarget: OTHER_ADDRESS,
        }),
      }),
    reasonIs('allowance_target_mismatch'),
  );
});

test('rejects an ERC-20 sell with neither issues.allowance.spender nor allowanceTarget present', () => {
  assert.throws(
    () =>
      parseZeroXAllowanceHolderQuote({
        request: sellUsdcRequest,
        response: validSellUsdcResponse({ issues: { allowance: null } }),
      }),
    reasonIs('missing_allowance_target'),
  );
});

test('ignores issues.allowance and top-level allowanceTarget on a native ETH sell (allowanceTarget stays absent)', () => {
  const quote = parseZeroXAllowanceHolderQuote({
    request: sellEthRequest,
    response: validSellEthResponse({
      issues: { allowance: { spender: ALLOWANCE_HOLDER_CONTRACT } },
      allowanceTarget: ALLOWANCE_HOLDER_CONTRACT,
    }),
  });

  assert.equal(quote.allowanceTarget, undefined);
});

test('never uses transaction.to as the allowanceTarget for an ERC-20 sell', () => {
  // transaction.to and the allowance spender are deliberately different
  // addresses in this fixture; if the adapter ever fell back to
  // transaction.to, this would incorrectly pass.
  const quote = parseZeroXAllowanceHolderQuote({
    request: sellUsdcRequest,
    response: validSellUsdcResponse(),
  });

  assert.notEqual(quote.allowanceTarget, SWAP_ROUTER_TARGET);
  assert.equal(quote.transactionTarget, SWAP_ROUTER_TARGET);
});

test('rejects a request context with a non-mainnet chain id', () => {
  assert.throws(
    () =>
      parseZeroXAllowanceHolderQuote({
        request: { ...sellEthRequest, chainId: 137 },
        response: validSellEthResponse(),
      }),
    reasonIs('unsupported_chain'),
  );
});

test('rejects a response whose sellAmount differs from the requested sellAmount', () => {
  assert.throws(
    () =>
      parseZeroXAllowanceHolderQuote({
        request: sellEthRequest,
        response: validSellEthResponse({ sellAmount: '999999999999999999' }),
      }),
    reasonIs('sell_amount_mismatch'),
  );
});

test('rejects a response whose sellToken does not match the requested sell asset', () => {
  assert.throws(
    () =>
      parseZeroXAllowanceHolderQuote({
        request: sellEthRequest,
        response: validSellEthResponse({ sellToken: USDC_ADDRESS }),
      }),
    reasonIs('unexpected_sell_token'),
  );
});

test('rejects a response whose buyToken does not match the requested buy asset', () => {
  assert.throws(
    () =>
      parseZeroXAllowanceHolderQuote({
        request: sellEthRequest,
        response: validSellEthResponse({ buyToken: NATIVE_SENTINEL }),
      }),
    reasonIs('unexpected_buy_token'),
  );
});

test('rejects a response missing minBuyAmount rather than deriving it from buyAmount', () => {
  const response = validSellEthResponse();
  delete (response as Record<string, unknown>).minBuyAmount;

  assert.throws(
    () => parseZeroXAllowanceHolderQuote({ request: sellEthRequest, response }),
    reasonIs('missing_min_buy_amount'),
  );
});

test('rejects a response missing the transaction object', () => {
  const response = validSellEthResponse();
  delete (response as Record<string, unknown>).transaction;

  assert.throws(
    () => parseZeroXAllowanceHolderQuote({ request: sellEthRequest, response }),
    reasonIs('missing_transaction'),
  );
});

test('rejects a response missing transaction.to', () => {
  assert.throws(
    () =>
      parseZeroXAllowanceHolderQuote({
        request: sellEthRequest,
        response: validSellEthResponse({
          transaction: { data: CALLDATA, value: SELL_ETH_AMOUNT },
        }),
      }),
    reasonIs('missing_transaction'),
  );
});

test('rejects a malformed transactionTarget address (propagated from SwapQuote validation)', () => {
  assert.throws(
    () =>
      parseZeroXAllowanceHolderQuote({
        request: sellEthRequest,
        response: validSellEthResponse({
          transaction: { to: '0xnotanaddress', data: CALLDATA, value: SELL_ETH_AMOUNT },
        }),
      }),
    reasonIs('invalid_field'),
  );
});

test('rejects malformed calldata (propagated from SwapQuote validation)', () => {
  assert.throws(
    () =>
      parseZeroXAllowanceHolderQuote({
        request: sellEthRequest,
        response: validSellEthResponse({
          transaction: { to: SWAP_ROUTER_TARGET, data: '0x123', value: SELL_ETH_AMOUNT },
        }),
      }),
    reasonIs('invalid_field'),
  );
});

test('rejects a malformed integer sellAmount', () => {
  assert.throws(
    () =>
      parseZeroXAllowanceHolderQuote({
        request: sellEthRequest,
        response: validSellEthResponse({ sellAmount: '1.5' }),
      }),
    reasonIs('invalid_field'),
  );
});

test('rejects an inconsistent transaction.value for a native ETH sell (propagated from SwapQuote validation)', () => {
  assert.throws(
    () =>
      parseZeroXAllowanceHolderQuote({
        request: sellEthRequest,
        response: validSellEthResponse({
          transaction: { to: SWAP_ROUTER_TARGET, data: CALLDATA, value: '999999999999999999' },
        }),
      }),
    reasonIs('invalid_field'),
  );
});

test('rejects an ERC-20 sell with a malformed allowance spender address (propagated from SwapQuote validation)', () => {
  assert.throws(
    () =>
      parseZeroXAllowanceHolderQuote({
        request: sellUsdcRequest,
        response: validSellUsdcResponse({ issues: { allowance: { spender: '0xnotanaddress' } } }),
      }),
    reasonIs('invalid_field'),
  );
});

test('rejects an ERC-20 sell with non-zero transaction.value (propagated from SwapQuote validation)', () => {
  assert.throws(
    () =>
      parseZeroXAllowanceHolderQuote({
        request: sellUsdcRequest,
        response: validSellUsdcResponse({
          transaction: { to: SWAP_ROUTER_TARGET, data: CALLDATA, value: '1' },
        }),
      }),
    reasonIs('invalid_field'),
  );
});
