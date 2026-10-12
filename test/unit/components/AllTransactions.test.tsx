import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AllTransactions from '@/components/AllTransactions';
import ApiService from '@/lib/apiService';

vi.mock('@/lib/apiService', () => ({
    default: {
        listTransactionsPage: vi.fn(),
        searchTransactionsPage: vi.fn(),
        listAllAccounts: vi.fn(),
        listCategories: vi.fn(),
        listBudgets: vi.fn(),
        listBills: vi.fn(),
        listTags: vi.fn(),
    },
}));

// Stub the editor so we can drive its callbacks without its internals.
vi.mock('@/components/TransactionEditor', () => ({
    default: (props: {
        transaction: { id: string };
        onSaved: (u: unknown) => void;
        onDeleted: () => void;
        onCancel: () => void;
    }) => (
        <div data-testid={`editor-${props.transaction.id}`}>
            <button
                data-testid={`editor-save-${props.transaction.id}`}
                onClick={() => props.onSaved({
                    id: props.transaction.id,
                    type: 'transactions',
                    attributes: { group_title: null, transactions: [{ type: 'withdrawal', date: '2024-06-01', amount: '10.00', description: 'EDITED DESC', category_name: 'Food', tags: [] }] },
                })}
            />
            <button data-testid={`editor-delete-${props.transaction.id}`} onClick={() => props.onDeleted()} />
            <button data-testid={`editor-cancel-${props.transaction.id}`} onClick={() => props.onCancel()} />
        </div>
    ),
}));

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

/* eslint-disable @typescript-eslint/no-explicit-any */
const txn = (id: string, over: Record<string, any> = {}): any => ({
    id,
    type: 'transactions',
    attributes: {
        group_title: null,
        transactions: [{
            type: 'withdrawal',
            date: '2024-06-01',
            amount: '10.00',
            description: `Txn ${id}`,
            category_name: 'Food',
            tags: ['t1'],
            source_name: 'Checking',
            destination_name: 'Store',
            ...over,
        }],
    },
});

const page = (items: any[], current = 1, total = 1) => ({ data: items, currentPage: current, totalPages: total });

const scroller = () => document.querySelector('.MuiTableContainer-root') as HTMLElement;

beforeEach(() => {
    asMock(ApiService.listTransactionsPage).mockResolvedValue(page([txn('1')]));
    asMock(ApiService.searchTransactionsPage).mockResolvedValue(page([txn('9', { description: 'Search hit' })]));
    asMock(ApiService.listAllAccounts).mockResolvedValue([]);
    asMock(ApiService.listCategories).mockResolvedValue([]);
    asMock(ApiService.listBudgets).mockResolvedValue([]);
    asMock(ApiService.listBills).mockResolvedValue([]);
    asMock(ApiService.listTags).mockResolvedValue([]);
    vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
});

describe('AllTransactions — initial load', () => {
    it('loads the first page with the default 30-day range and renders rows', async () => {
        render(<AllTransactions accounts={[{ id: '42', attributes: { name: 'Checking ••1' } } as any]} />);
        expect(await screen.findByText('Txn 1')).toBeInTheDocument();
        await waitFor(() => expect(ApiService.listTransactionsPage).toHaveBeenCalled());
        const [, opts] = asMock(ApiService.listTransactionsPage).mock.calls[0];
        // Default quick filter 'all' -> list endpoint, no type, with a start/end (30d).
        expect(opts.type).toBeUndefined();
        expect(opts.start).toBeTruthy();
    });

    it('shows the empty state when no rows come back', async () => {
        asMock(ApiService.listTransactionsPage).mockResolvedValue(page([]));
        render(<AllTransactions />);
        expect(await screen.findByText(/No transactions match/i)).toBeInTheDocument();
    });

    it('shows an error alert when the fetch fails', async () => {
        asMock(ApiService.listTransactionsPage).mockRejectedValue(new Error('kaboom'));
        render(<AllTransactions />);
        expect(await screen.findByText('kaboom')).toBeInTheDocument();
    });

    it('renders deposit and transfer rows with the right account label', async () => {
        asMock(ApiService.listTransactionsPage).mockResolvedValue(page([
            txn('d', { type: 'deposit', category_name: undefined, tags: [], description: 'Paycheck', destination_name: 'Savings' }),
            txn('x', { type: 'transfer', description: 'Move', source_name: 'Checking', destination_name: 'Savings' }),
        ]));
        render(<AllTransactions />);
        expect(await screen.findByText('Paycheck')).toBeInTheDocument();
        expect(screen.getByText('Savings')).toBeInTheDocument();            // deposit -> destination
        expect(screen.getByText(/Checking → Savings/)).toBeInTheDocument(); // transfer -> both
        expect(screen.getAllByText(/Uncategorized/).length).toBeGreaterThan(0); // deposit had no category
    });
});

describe('AllTransactions — quick filters (server side)', () => {
    it('a type filter re-queries the list endpoint with type', async () => {
        render(<AllTransactions />);
        await screen.findByText('Txn 1');
        fireEvent.click(screen.getByText('Withdrawals'));
        await waitFor(() => {
            const last = asMock(ApiService.listTransactionsPage).mock.calls.at(-1)!;
            expect(last[1].type).toBe('withdrawal');
        });
    });

    it('uncategorized uses the search endpoint with the has_any_category operator', async () => {
        render(<AllTransactions />);
        await screen.findByText('Txn 1');
        fireEvent.click(screen.getByText('Uncategorized'));
        await waitFor(() => expect(ApiService.searchTransactionsPage).toHaveBeenCalled());
        const q = asMock(ApiService.searchTransactionsPage).mock.calls.at(-1)![1] as string;
        expect(q).toContain('has_any_category:false');
        expect(await screen.findByText('Search hit')).toBeInTheDocument();
    });

    it('this-month stays on the list endpoint (date override, no search)', async () => {
        render(<AllTransactions />);
        await screen.findByText('Txn 1');
        const before = asMock(ApiService.searchTransactionsPage).mock.calls.length;
        fireEvent.click(screen.getByText('This month'));
        await waitFor(() => {
            const last = asMock(ApiService.listTransactionsPage).mock.calls.at(-1)!;
            expect(last[1].start).toBeTruthy();
        });
        expect(asMock(ApiService.searchTransactionsPage).mock.calls.length).toBe(before);
    });
});

describe('AllTransactions — search (Enter to execute)', () => {
    it('does not query while typing and searches on Enter', async () => {
        const user = userEvent.setup();
        render(<AllTransactions />);
        await screen.findByText('Txn 1');
        const field = screen.getByPlaceholderText(/Search description/i);
        await user.type(field, 'coffee');
        // No search call fired just from typing.
        expect(ApiService.searchTransactionsPage).not.toHaveBeenCalled();
        await user.type(field, '{Enter}');
        await waitFor(() => expect(ApiService.searchTransactionsPage).toHaveBeenCalled());
        const q = asMock(ApiService.searchTransactionsPage).mock.calls.at(-1)![1] as string;
        expect(q).toContain('coffee');
    });
});

describe('AllTransactions — infinite scroll', () => {
    it('loads the next page when scrolled near the bottom', async () => {
        asMock(ApiService.listTransactionsPage)
            .mockResolvedValueOnce(page([txn('1')], 1, 2))
            .mockResolvedValueOnce(page([txn('2')], 2, 2));
        render(<AllTransactions />);
        await screen.findByText('Txn 1');
        await act(async () => { fireEvent.scroll(scroller()); });
        expect(await screen.findByText('Txn 2')).toBeInTheDocument();
        expect(screen.getByText('Txn 1')).toBeInTheDocument(); // appended, not replaced
    });
});

describe('AllTransactions — editing', () => {
    it('opens the editor (loading metadata), saves, and updates the row', async () => {
        render(<AllTransactions />);
        await screen.findByText('Txn 1');
        fireEvent.click(screen.getByRole('button', { name: /Edit/i }));
        await waitFor(() => expect(ApiService.listCategories).toHaveBeenCalled());
        await screen.findByTestId('editor-1');
        fireEvent.click(screen.getByTestId('editor-save-1'));
        expect(await screen.findByText('EDITED DESC')).toBeInTheDocument();
    });

    it('deletes a row via the editor', async () => {
        render(<AllTransactions />);
        await screen.findByText('Txn 1');
        fireEvent.click(screen.getByRole('button', { name: /Edit/i }));
        await screen.findByTestId('editor-1');
        fireEvent.click(screen.getByTestId('editor-delete-1'));
        await waitFor(() => expect(screen.queryByText('Txn 1')).not.toBeInTheDocument());
    });

    it('cancels editing', async () => {
        render(<AllTransactions />);
        await screen.findByText('Txn 1');
        fireEvent.click(screen.getByRole('button', { name: /Edit/i }));
        await screen.findByTestId('editor-1');
        fireEvent.click(screen.getByTestId('editor-cancel-1'));
        await waitFor(() => expect(screen.queryByTestId('editor-1')).not.toBeInTheDocument());
        expect(screen.getByText('Txn 1')).toBeInTheDocument();
    });
});
