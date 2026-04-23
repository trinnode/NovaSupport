import { useEffect } from 'react';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SupportPanel } from '@/components/support-panel';
import { signTransaction } from '@stellar/freighter-api';
import { buildSupportIntent, horizonServer } from '@/lib/stellar';

vi.mock('@stellar/freighter-api', () => ({
  getAddress: vi.fn(),
  isAllowed: vi.fn(),
  setAllowed: vi.fn(),
  signTransaction: vi.fn(),
}));

vi.mock('@stellar/stellar-sdk', () => ({
  Asset: {
    native: vi.fn(() => ({ type: 'native' })),
  },
  TransactionBuilder: {
    fromXDR: vi.fn(() => ({ mocked: true })),
  },
}));

vi.mock('@/lib/config', () => ({
  HORIZON_URL: 'https://horizon-testnet.stellar.org',
  API_BASE_URL: 'http://localhost:4000',
  STELLAR_NETWORK: 'TESTNET',
  NETWORK_PASSPHRASE: 'Test SDF Network ; September 2015',
  CONTRACT_ID: '',
  SOROBAN_RPC_URL: 'https://soroban-testnet.stellar.org',
}));

vi.mock('@/lib/stellar', () => ({
  buildSupportIntent: vi.fn(),
  buildPathPaymentIntent: vi.fn(),
  getNetworkLabel: vi.fn(() => 'Testnet'),
  horizonServer: {
    submitTransaction: vi.fn(),
    loadAccount: vi.fn().mockResolvedValue({
      balances: [{ asset_type: 'native', balance: '100.0000000' }],
    }),
    strictSendPaths: vi.fn(() => ({
      call: vi.fn().mockResolvedValue({ records: [] }),
    })),
  },
  stellarConfig: {
    horizonUrl: 'https://horizon-testnet.stellar.org',
    stellarNetwork: 'TESTNET',
    networkPassphrase: 'Test SDF Network ; September 2015',
  },
}));

vi.mock('./wallet-connect', () => ({
  WalletConnect: ({ onConnect }: { onConnect?: (address: string) => void }) => {
    useEffect(() => {
      onConnect?.('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
    }, [onConnect]);
    return <div data-testid="wallet-connect-mock">WalletConnect Mock</div>;
  },
}));

describe('SupportPanel', () => {
  const mockProps = {
    walletAddress: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    acceptedAssets: [{ code: 'XLM' }],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('submits a signed transaction and shows the transaction hash', async () => {
    vi.mocked(buildSupportIntent).mockResolvedValue('unsigned-xdr');
    vi.mocked(signTransaction).mockResolvedValue({
      signedTxXdr: 'signed-xdr',
      signerAddress: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    });
    vi.mocked(horizonServer.submitTransaction).mockResolvedValue({
      hash: '1234567890abcdef1234567890abcdef',
    } as never);

    render(<SupportPanel {...mockProps} />);
    await waitFor(() => expect(screen.getByPlaceholderText('0.00')).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '5' } });
    await waitFor(() => expect(screen.getByRole('button', { name: /Send Support/i })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: /Send Support/i }));
    await waitFor(() => expect(screen.getByText(/Transaction submitted:/)).toBeInTheDocument(), { timeout: 3000 });
    expect(screen.getByText('12345678...90abcdef')).toBeInTheDocument();
  });

  it('shows a readable Horizon error message', async () => {
    vi.mocked(buildSupportIntent).mockResolvedValue('unsigned-xdr');
    vi.mocked(signTransaction).mockResolvedValue({
      signedTxXdr: 'signed-xdr',
      signerAddress: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    });
    vi.mocked(horizonServer.submitTransaction).mockRejectedValue({
      response: { data: { extras: { result_codes: { transaction: 'tx_too_late' } } } },
    });

    render(<SupportPanel {...mockProps} />);
    await waitFor(() => expect(screen.getByPlaceholderText('0.00')).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '5' } });
    await waitFor(() => expect(screen.getByRole('button', { name: /Send Support/i })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: /Send Support/i }));
    await waitFor(() => expect(screen.getByText('Transaction expired')).toBeInTheDocument(), { timeout: 3000 });
  });

  it('renders payment asset selector when connected', async () => {
    render(<SupportPanel {...mockProps} />);
    await waitFor(() => expect(screen.getByText('Pay with')).toBeInTheDocument());
    expect(screen.getByText('Amount')).toBeInTheDocument();
  });

  it('renders recurring support toggle', async () => {
    render(<SupportPanel {...mockProps} />);
    await waitFor(() => expect(screen.getByText('Make it recurring')).toBeInTheDocument());
  });
});
