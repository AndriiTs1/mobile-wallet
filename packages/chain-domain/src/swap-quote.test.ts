import { test } from 'node:test';
import assert from 'node:assert/strict';

import { toEthereumAddress } from './ethereum-address';
import { toSwapQuote, type EthereumSwapAsset, type SwapQuoteInput } from './swap-quote';

const nativeEth: EthereumSwapAsset = { kind: 'native', chainId: 'ethereum:mainnet' };

const usdc: EthereumSwapAsset = {
  kind: 'erc20',
  chainId: 'ethereum:mainnet',
  contractAddress: toEthereumAddress('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'),
};

const bitcoinNative = { kind: 'native', chainId: 'bitcoin:mainnet' } as unknown as EthereumSwapAsset;

const ROUTER = '0x1111111254EEB25477B68fb85Ed929f73A960582';
const CALLDATA = '0x12345678';

function validSellEthInput(overrides: Partial<SwapQuoteInput> = {}): SwapQuoteInput {
  return {
    sellAsset: nativeEth,
    buyAsset: usdc,
    sellAmount: '1000000000000000000',
    expectedBuyAmount: '2500000000',
    minimumBuyAmount: '2450000000',
    transactionTarget: ROUTER,
    transactionCalldata: CALLDATA,
    transactionValueWei: '1000000000000000000',
    quoteExpiresAt: Date.now() + 60_000,
    ...overrides,
  };
}

function validSellUsdcInput(overrides: Partial<SwapQuoteInput> = {}): SwapQuoteInput {
  return {
    sellAsset: usdc,
    buyAsset: nativeEth,
    sellAmount: '2500000000',
    expectedBuyAmount: '1000000000000000000',
    minimumBuyAmount: '990000000000000000',
    allowanceTarget: ROUTER,
    transactionTarget: ROUTER,
    transactionCalldata: CALLDATA,
    transactionValueWei: '0',
    ...overrides,
  };
}

test('toSwapQuote constructs a valid quote selling native ETH', () => {
  const input = validSellEthInput();
  const quote = toSwapQuote(input);

  assert.equal(quote.chainId, 'ethereum:mainnet');
  assert.equal(quote.sellAsset, nativeEth);
  assert.equal(quote.buyAsset, usdc);
  assert.equal(quote.sellAmount, input.sellAmount);
  assert.equal(quote.expectedBuyAmount, input.expectedBuyAmount);
  assert.equal(quote.minimumBuyAmount, input.minimumBuyAmount);
  assert.equal(quote.allowanceTarget, undefined);
  assert.equal(quote.transactionTarget, ROUTER);
  assert.equal(quote.transactionCalldata, CALLDATA);
  assert.equal(quote.transactionValueWei, input.transactionValueWei);
  assert.equal(quote.quoteExpiresAt, input.quoteExpiresAt);
});

test('toSwapQuote constructs a valid quote selling an ERC-20 with an allowanceTarget', () => {
  const quote = toSwapQuote(validSellUsdcInput());
  assert.equal(quote.allowanceTarget, ROUTER);
});

test('toSwapQuote omits quoteExpiresAt when not supplied', () => {
  const quote = toSwapQuote(validSellUsdcInput({ quoteExpiresAt: undefined }));
  assert.equal(quote.quoteExpiresAt, undefined);
});

test('toSwapQuote rejects a malformed transactionTarget address', () => {
  assert.throws(() => toSwapQuote(validSellEthInput({ transactionTarget: '0xnotanaddress' })));
});

test('toSwapQuote rejects a malformed allowanceTarget address', () => {
  assert.throws(() =>
    toSwapQuote(validSellUsdcInput({ allowanceTarget: '0xnotanaddress' })),
  );
});

test('toSwapQuote rejects malformed calldata (odd-length hex)', () => {
  assert.throws(() => toSwapQuote(validSellEthInput({ transactionCalldata: '0x123' })));
});

test('toSwapQuote rejects malformed calldata (missing 0x prefix)', () => {
  assert.throws(() => toSwapQuote(validSellEthInput({ transactionCalldata: '12345678' })));
});

test('toSwapQuote rejects a negative sellAmount', () => {
  assert.throws(() => toSwapQuote(validSellEthInput({ sellAmount: '-1000000000000000000' })));
});

test('toSwapQuote rejects a non-integer (decimal) sellAmount', () => {
  assert.throws(() => toSwapQuote(validSellEthInput({ sellAmount: '1.5' })));
});

test('toSwapQuote rejects a non-numeric expectedBuyAmount', () => {
  assert.throws(() => toSwapQuote(validSellEthInput({ expectedBuyAmount: 'not-a-number' })));
});

test('toSwapQuote rejects a negative transactionValueWei', () => {
  assert.throws(() => toSwapQuote(validSellEthInput({ transactionValueWei: '-1' })));
});

test('toSwapQuote rejects minimumBuyAmount greater than expectedBuyAmount', () => {
  assert.throws(() =>
    toSwapQuote(
      validSellEthInput({
        expectedBuyAmount: '2500000000',
        minimumBuyAmount: '2500000001',
      }),
    ),
  );
});

test('toSwapQuote accepts minimumBuyAmount exactly equal to expectedBuyAmount', () => {
  const quote = toSwapQuote(
    validSellEthInput({ expectedBuyAmount: '2500000000', minimumBuyAmount: '2500000000' }),
  );
  assert.equal(quote.minimumBuyAmount, quote.expectedBuyAmount);
});

test('toSwapQuote rejects a zero quoteExpiresAt', () => {
  assert.throws(() => toSwapQuote(validSellEthInput({ quoteExpiresAt: 0 })));
});

test('toSwapQuote rejects a negative quoteExpiresAt', () => {
  assert.throws(() => toSwapQuote(validSellEthInput({ quoteExpiresAt: -1 })));
});

test('toSwapQuote rejects a non-integer quoteExpiresAt', () => {
  assert.throws(() => toSwapQuote(validSellEthInput({ quoteExpiresAt: 1_700_000_000_123.5 })));
});

test('toSwapQuote rejects an ERC-20 sell missing allowanceTarget', () => {
  assert.throws(() => toSwapQuote(validSellUsdcInput({ allowanceTarget: undefined })));
});

test('toSwapQuote rejects a native ETH sell with an allowanceTarget present', () => {
  assert.throws(() => toSwapQuote(validSellEthInput({ allowanceTarget: ROUTER })));
});

test('toSwapQuote rejects a sellAsset that is not an Ethereum-mainnet asset', () => {
  assert.throws(() => toSwapQuote(validSellEthInput({ sellAsset: bitcoinNative })));
});

test('toSwapQuote rejects a buyAsset that is not an Ethereum-mainnet asset', () => {
  assert.throws(() => toSwapQuote(validSellEthInput({ buyAsset: bitcoinNative })));
});

test('toSwapQuote rejects swapping an asset into itself', () => {
  assert.throws(() =>
    toSwapQuote(
      validSellEthInput({
        buyAsset: nativeEth,
      }),
    ),
  );

  assert.throws(() =>
    toSwapQuote(
      validSellUsdcInput({
        buyAsset: usdc,
      }),
    ),
  );
});

test('toSwapQuote rejects a zero sellAmount', () => {
  assert.throws(() =>
    toSwapQuote(validSellEthInput({ sellAmount: '0' })),
  );
});

test('toSwapQuote rejects a zero expectedBuyAmount', () => {
  assert.throws(() =>
    toSwapQuote(validSellEthInput({ expectedBuyAmount: '0' })),
  );
});

test('toSwapQuote rejects a zero minimumBuyAmount', () => {
  assert.throws(() =>
    toSwapQuote(validSellEthInput({ minimumBuyAmount: '0' })),
  );
});

test('toSwapQuote rejects native ETH sell when transactionValueWei does not equal sellAmount', () => {
  assert.throws(() =>
    toSwapQuote(
      validSellEthInput({
        sellAmount: '1000000000000000000',
        transactionValueWei: '999999999999999999',
      }),
    ),
  );
});

test('toSwapQuote rejects ERC-20 sell with non-zero transactionValueWei', () => {
  assert.throws(() =>
    toSwapQuote(
      validSellUsdcInput({
        transactionValueWei: '1',
      }),
    ),
  );
});
