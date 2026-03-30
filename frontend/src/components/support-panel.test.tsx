import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SupportPanel } from '@/components/support-panel';

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

// Mock WalletConnect to simulate connected state
vi.mock('./wallet-connect', () => ({
  WalletConnect: ({ onConnect }: { onConnect?: (address: string) => void }) => {
    // Simulate immediate connection for testing
    onConnect?.('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
    return <div data-testid="wallet-connect-mock">WalletConnect Mock</div>;
  },
}));

describe('SupportPanel', () => {
  const mockProps = {
    walletAddress: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  };

  it('renders network info when connected', () => {
    render(<SupportPanel {...mockProps} />);
    
    expect(screen.getByText('Network')).toBeInTheDocument();
    expect(screen.getByText('Horizon')).toBeInTheDocument();
    expect(screen.getByText('Recipient')).toBeInTheDocument();
  });

  it('renders recipient address when connected', () => {
    render(<SupportPanel {...mockProps} />);
    
    expect(screen.getByText(mockProps.walletAddress)).toBeInTheDocument();
  });
});
