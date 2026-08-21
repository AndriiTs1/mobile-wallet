import { test } from 'node:test';
import assert from 'node:assert/strict';

import { toEthereumCalldata } from './ethereum-calldata';

test('toEthereumCalldata accepts a well-formed hex calldata string', () => {
  const calldata = toEthereumCalldata('0x095ea7b3000000000000000000000000');
  assert.equal(calldata, '0x095ea7b3000000000000000000000000');
});

test('toEthereumCalldata rejects a string missing the 0x prefix', () => {
  assert.throws(() => toEthereumCalldata('095ea7b3'));
});

test('toEthereumCalldata rejects odd-length hex (not a whole number of bytes)', () => {
  assert.throws(() => toEthereumCalldata('0x095'));
});

test('toEthereumCalldata rejects non-hex characters', () => {
  assert.throws(() => toEthereumCalldata('0xzz'));
});

test('toEthereumCalldata rejects empty calldata ("0x" with no bytes)', () => {
  assert.throws(() => toEthereumCalldata('0x'));
});
