import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { WalletConnect } from '@/components/wallet-connect';

// Mock @stellar/freighter-api
vi.mock('@stellar/freighter-api', () => ({
  getAddress: vi.fn(),
  isAllowed: vi.fn(),
  setAllowed: vi.fn(),
}));

// Mock @/lib/config
vi.mock('@/lib/config', () => ({
  HORIZON_URL: 'https://horizon-testnet.stellar.org',
  API_BASE_URL: 'http://localhost:4000',
  STELLAR_NETWORK: 'TESTNET',
  NETWORK_PASSPHRASE: 'Test SDF Network ; September 2015',
  CONTRACT_ID: '',
  SOROBAN_RPC_URL: 'https://soroban-testnet.stellar.org',
}));

import { getAddress, isAllowed, setAllowed } from '@stellar/freighter-api';

describe('WalletConnect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    // Reset window.stellarLumens mock
    (window as any).stellarLumens = true;
  });

  it('renders connect button when disconnected', () => {
    render(<WalletConnect />);
    
    expect(screen.getByText('Wallet')).toBeInTheDocument();
    expect(screen.getByText('Connect Freighter to preview Stellar Testnet support.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connect Freighter' })).toBeInTheDocument();
  });

  it('shows address when connected', async () => {
    const mockAddress = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    
    (isAllowed as any).mockResolvedValue({ isAllowed: true });
    (getAddress as any).mockResolvedValue({ address: mockAddress, error: null });

    render(<WalletConnect />);
    
    const button = screen.getByRole('button', { name: 'Connect Freighter' });
    fireEvent.click(button);

    // Wait for async operations
    await waitFor(() => {
      expect(screen.getByText(/Connected address:/)).toBeInTheDocument();
    });
    expect(screen.getByText(/GAAAAA/)).toBeInTheDocument();
  });

  it('shows not installed message when Freighter is not available', async () => {
    (window as any).stellarLumens = undefined;
    
    render(<WalletConnect />);
    
    const button = screen.getByRole('button', { name: 'Connect Freighter' });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText(/Freighter wallet is not installed/)).toBeInTheDocument();
    });
    expect(screen.getByText(/Install it here/)).toBeInTheDocument();
  });
});
