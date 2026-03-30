import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProfileTabs } from '@/components/profile-tabs';

// Mock framer-motion to avoid animation issues in tests
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href }: any) => <a href={href}>{children}</a>,
}));

describe('ProfileTabs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders empty state when there are no transactions', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: async () => ({ transactions: [] }),
    }));

    render(<ProfileTabs username="stellar-dev" />);

    expect(await screen.findByText('No support yet')).toBeInTheDocument();
    expect(
      await screen.findByText('Be the first to support stellar-dev!')
    ).toBeInTheDocument();
  });

  it('personalises the empty state with the username', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: async () => ({ transactions: [] }),
    }));

    render(<ProfileTabs username="alice" />);

    expect(await screen.findByText('Be the first to support alice!')).toBeInTheDocument();
  });

  it('renders transaction list when transactions exist', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: async () => ({
        transactions: [
          {
            id: '1',
            txHash: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
            amount: '100',
            assetCode: 'XLM',
            createdAt: '2026-03-01T00:00:00Z',
            status: 'verified',
          },
        ],
      }),
    }));

    render(<ProfileTabs username="stellar-dev" />);

    expect(await screen.findByText('100 XLM')).toBeInTheDocument();
    expect(screen.queryByText('No support yet')).not.toBeInTheDocument();
  });
});
