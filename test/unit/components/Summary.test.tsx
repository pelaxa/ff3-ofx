import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import Summary from '@/components/Summary';
import ApiService from '@/lib/apiService';
import { AccountRoleProperty, type AccountRead } from '@billos/firefly-iii-sdk';

vi.mock('@/lib/apiService', () => ({
    default: { getAccount: vi.fn() },
}));

const mkAccount = (overrides: Partial<AccountRead['attributes']> = {}): AccountRead =>
    ({
        id: '7',
        type: 'accounts',
        attributes: {
            name: 'Checking',
            account_number: '1234',
            current_balance: '500.00',
            virtual_balance: '0',
            account_role: AccountRoleProperty.DEFAULT_ASSET,
            ...overrides,
        },
    } as AccountRead);

describe('Summary', () => {
    beforeEach(() => {
        (ApiService.getAccount as ReturnType<typeof vi.fn>).mockReset();
    });

    it('renders account name + number after data loads', async () => {
        (ApiService.getAccount as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mkAccount());
        render(<Summary bankBalance={500} accountId="7" processed={true} progress={100} />);
        await waitFor(() => expect(screen.getByText(/Checking/)).toBeInTheDocument());
        expect(screen.getByText(/1234/)).toBeInTheDocument();
    });

    it('renders the import progress bar when not processed', async () => {
        (ApiService.getAccount as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mkAccount());
        render(<Summary bankBalance={500} accountId="7" processed={false} progress={42} />);
        await waitFor(() => expect(screen.getByText(/Importing/i)).toBeInTheDocument());
        expect(screen.getByText('42%')).toBeInTheDocument();
    });

    it('shows the warning alert when bank balance != account balance', async () => {
        (ApiService.getAccount as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mkAccount({ current_balance: '100.00' }));
        render(<Summary bankBalance={500} accountId="7" processed={true} progress={100} />);
        await waitFor(() => expect(screen.getByText(/bank balance does not match/i)).toBeInTheDocument());
    });

    it('shows a difference number when processed', async () => {
        (ApiService.getAccount as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mkAccount({ current_balance: '500.00' }));
        render(<Summary bankBalance={500} accountId="7" processed={true} progress={100} />);
        await waitFor(() => expect(screen.getByText(/Difference/i)).toBeInTheDocument());
    });
});
