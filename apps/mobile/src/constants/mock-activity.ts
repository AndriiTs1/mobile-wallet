import type { CoinSymbol } from '@/constants/mock-portfolio';

export type TransactionType = 'received' | 'sent' | 'swap' | 'buy';

export type TransactionGroup = 'Today' | 'Yesterday' | 'Earlier';

export type MockTransaction = {
  id: string;
  type: TransactionType;
  primarySymbol: CoinSymbol;
  /** Only set for swaps — the asset received in exchange for primarySymbol. */
  secondarySymbol?: CoinSymbol;
  amountLabel: string;
  valueLabel: string;
  timeLabel: string;
  group: TransactionGroup;
};

export const mockTransactions: MockTransaction[] = [
  {
    id: 'tx-1',
    type: 'received',
    primarySymbol: 'BTC',
    amountLabel: '+0.0215 BTC',
    valueLabel: 'CHF 1,107.75',
    timeLabel: '09:42',
    group: 'Today',
  },
  {
    id: 'tx-2',
    type: 'swap',
    primarySymbol: 'ETH',
    secondarySymbol: 'USDC',
    amountLabel: '384.02 USDC',
    valueLabel: 'CHF 384.02',
    timeLabel: '08:15',
    group: 'Today',
  },
  {
    id: 'tx-3',
    type: 'sent',
    primarySymbol: 'USDT',
    amountLabel: '-300.00 USDT',
    valueLabel: 'CHF 243.00',
    timeLabel: '19:03',
    group: 'Yesterday',
  },
  {
    id: 'tx-4',
    type: 'buy',
    primarySymbol: 'ETH',
    amountLabel: '+0.1500 ETH',
    valueLabel: 'CHF 230.25',
    timeLabel: '14:27',
    group: 'Yesterday',
  },
  {
    id: 'tx-5',
    type: 'received',
    primarySymbol: 'USDC',
    amountLabel: '+500.00 USDC',
    valueLabel: 'CHF 405.50',
    timeLabel: '2 Jun',
    group: 'Earlier',
  },
  {
    id: 'tx-6',
    type: 'sent',
    primarySymbol: 'BTC',
    amountLabel: '-0.0100 BTC',
    valueLabel: 'CHF 515.00',
    timeLabel: '29 May',
    group: 'Earlier',
  },
];
