import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TransactionEditor from '@/components/TransactionEditor';
import ApiService from '@/lib/apiService';
import { TransactionTypeProperty, type AccountRead, type TransactionRead } from '@billos/firefly-iii-sdk';

vi.mock('@/lib/apiService', () => ({
    default: {
        updateTransaction: vi.fn(),
        deleteTransaction: vi.fn(),
    },
}));

const mkSingleTxn = (): TransactionRead => ({
    type: 'transactions',
    id: '500',
    attributes: {
        group_title: null,
        transactions: [
            {
                transaction_journal_id: 'j1',
                type: TransactionTypeProperty.WITHDRAWAL,
                date: '2024-03-01T00:00:00+00:00',
                amount: '15.00',
                currency_decimal_places: 2,
                description: 'Coffee',
                source_name: 'Checking',
                destination_name: 'Coffee Shop',
                category_name: 'Food',
                budget_name: 'Eating Out',
                bill_name: '',
                notes: '',
                tags: ['daily'],
            },
        ],
    },
} as unknown as TransactionRead);

const mkSplitTxn = (): TransactionRead => ({
    ...mkSingleTxn(),
    attributes: {
        ...mkSingleTxn().attributes,
        group_title: 'Grocery + Gas',
        transactions: [
            { ...mkSingleTxn().attributes.transactions[0], amount: '10.00', description: 'Grocery' },
            { ...mkSingleTxn().attributes.transactions[0], transaction_journal_id: 'j2', amount: '5.00', description: 'Gas' },
        ],
    },
} as unknown as TransactionRead);

const baseProps = {
    accounts: [],
    categories: [],
    budgets: [],
    bills: [],
    tags: [],
    onSaved: vi.fn(),
    onDeleted: vi.fn(),
    onCancel: vi.fn(),
};

describe('TransactionEditor', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('hydrates from the supplied transaction', () => {
        render(<TransactionEditor transaction={mkSingleTxn()} {...baseProps} />);
        expect(screen.getByDisplayValue('Coffee')).toBeInTheDocument();
        expect(screen.getByDisplayValue('15.00')).toBeInTheDocument();
        expect(screen.getByText(/transaction #500/)).toBeInTheDocument();
        expect(screen.getByText(/single split/)).toBeInTheDocument();
    });

    it('shows split header and group-title field when there are multiple splits', () => {
        render(<TransactionEditor transaction={mkSplitTxn()} {...baseProps} />);
        expect(screen.getByText(/2 splits/)).toBeInTheDocument();
        expect(screen.getByDisplayValue('Grocery + Gas')).toBeInTheDocument();
        expect(screen.getByText(/Split 1/)).toBeInTheDocument();
        expect(screen.getByText(/Split 2/)).toBeInTheDocument();
    });

    it('calls onCancel when Cancel is clicked', () => {
        const onCancel = vi.fn();
        render(<TransactionEditor transaction={mkSingleTxn()} {...baseProps} onCancel={onCancel} />);
        fireEvent.click(screen.getByText('Cancel'));
        expect(onCancel).toHaveBeenCalled();
    });

    it('saves and reports the updated transaction', async () => {
        (ApiService.updateTransaction as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: '500', attributes: { transactions: [] } });
        const onSaved = vi.fn();
        render(<TransactionEditor transaction={mkSingleTxn()} {...baseProps} onSaved={onSaved} />);
        fireEvent.click(screen.getByText('Save changes'));
        await waitFor(() => expect(onSaved).toHaveBeenCalledWith({ id: '500', attributes: { transactions: [] } }));
        expect(ApiService.updateTransaction).toHaveBeenCalledWith('500', expect.objectContaining({ apply_rules: false }));
    });

    it('surfaces a validation error from the API', async () => {
        (ApiService.updateTransaction as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            message: 'invalid',
            errors: { description: ['required'] },
        });
        render(<TransactionEditor transaction={mkSingleTxn()} {...baseProps} />);
        fireEvent.click(screen.getByText('Save changes'));
        await waitFor(() => expect(screen.getByText(/description: required/)).toBeInTheDocument());
    });

    it('confirms before delete and reports success', async () => {
        const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
        (ApiService.deleteTransaction as ReturnType<typeof vi.fn>).mockResolvedValueOnce(true);
        const onDeleted = vi.fn();
        render(<TransactionEditor transaction={mkSingleTxn()} {...baseProps} onDeleted={onDeleted} />);
        fireEvent.click(screen.getByText('Delete transaction'));
        await waitFor(() => expect(onDeleted).toHaveBeenCalled());
        confirm.mockRestore();
    });

    it('aborts delete when window.confirm returns false', async () => {
        const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
        const onDeleted = vi.fn();
        render(<TransactionEditor transaction={mkSingleTxn()} {...baseProps} onDeleted={onDeleted} />);
        fireEvent.click(screen.getByText('Delete transaction'));
        expect(ApiService.deleteTransaction).not.toHaveBeenCalled();
        expect(onDeleted).not.toHaveBeenCalled();
        confirm.mockRestore();
    });

    it('reports when the API returns no response', async () => {
        (ApiService.updateTransaction as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);
        render(<TransactionEditor transaction={mkSingleTxn()} {...baseProps} />);
        fireEvent.click(screen.getByText('Save changes'));
        await waitFor(() => expect(screen.getByText(/No response from FireFly III/)).toBeInTheDocument());
    });

    it('surfaces a thrown error on save', async () => {
        (ApiService.updateTransaction as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('network down'));
        render(<TransactionEditor transaction={mkSingleTxn()} {...baseProps} />);
        fireEvent.click(screen.getByText('Save changes'));
        await waitFor(() => expect(screen.getByText(/network down/)).toBeInTheDocument());
    });

    it('shows "Delete failed" when the API reports failure', async () => {
        const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
        (ApiService.deleteTransaction as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);
        render(<TransactionEditor transaction={mkSingleTxn()} {...baseProps} />);
        fireEvent.click(screen.getByText('Delete transaction'));
        await waitFor(() => expect(screen.getByText(/Delete failed/)).toBeInTheDocument());
        confirm.mockRestore();
    });

    it('surfaces a thrown error on delete', async () => {
        const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
        (ApiService.deleteTransaction as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('boom'));
        render(<TransactionEditor transaction={mkSingleTxn()} {...baseProps} />);
        fireEvent.click(screen.getByText('Delete transaction'));
        await waitFor(() => expect(screen.getByText(/boom/)).toBeInTheDocument());
        confirm.mockRestore();
    });
});

const mkAccounts = (): AccountRead[] => ([
    { id: '1', type: 'accounts', attributes: { name: 'Checking', type: 'asset' } },
    { id: '2', type: 'accounts', attributes: { name: 'Loan', type: 'liabilities' } },
    { id: '3', type: 'accounts', attributes: { name: 'Groceries', type: 'expense' } },
    { id: '4', type: 'accounts', attributes: { name: 'Salary', type: 'revenue' } },
] as unknown as AccountRead[]);

const richProps = {
    ...baseProps,
    accounts: mkAccounts(),
    categories: [{ id: 'c1', type: 'categories', attributes: { name: 'Food' } }] as never,
    budgets: [{ id: 'b1', type: 'budgets', attributes: { name: 'Eating Out' } }] as never,
    bills: [
        { id: 'bl1', type: 'bills', attributes: { name: 'Rent' } },
        { id: 'bl2', type: 'bills', attributes: { name: null } },
    ] as never,
    tags: ['daily', 'weekly'],
};

const mkDepositTxn = (): TransactionRead => ({
    ...mkSingleTxn(),
    attributes: {
        ...mkSingleTxn().attributes,
        transactions: [{ ...mkSingleTxn().attributes.transactions[0], type: TransactionTypeProperty.DEPOSIT }],
    },
} as unknown as TransactionRead);

const mkTransferTxn = (): TransactionRead => ({
    ...mkSingleTxn(),
    attributes: {
        ...mkSingleTxn().attributes,
        transactions: [{ ...mkSingleTxn().attributes.transactions[0], type: TransactionTypeProperty.TRANSFER }],
    },
} as unknown as TransactionRead);

describe('TransactionEditor — field editing', () => {
    beforeEach(() => vi.clearAllMocks());

    it('edits description, category, notes and budget/bill fields', () => {
        render(<TransactionEditor transaction={mkSingleTxn()} {...richProps} />);
        fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'New desc' } });
        expect(screen.getByDisplayValue('New desc')).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'a note' } });
        expect(screen.getByDisplayValue('a note')).toBeInTheDocument();
        // Withdrawal exposes Budget + Bill autocompletes.
        fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'Groceries' } });
        fireEvent.change(screen.getByLabelText('Budget'), { target: { value: 'Eating Out' } });
        fireEvent.change(screen.getByLabelText('Bill'), { target: { value: 'Rent' } });
        fireEvent.change(screen.getByLabelText('Destination Account'), { target: { value: 'Groceries' } });
    });

    it('validates the amount field and formats it on blur', () => {
        render(<TransactionEditor transaction={mkSingleTxn()} {...richProps} />);
        const amount = screen.getByLabelText('Amount') as HTMLInputElement;
        fireEvent.change(amount, { target: { value: 'abc' } });
        expect(screen.getByText(/Enter a valid amount/)).toBeInTheDocument();
        fireEvent.change(amount, { target: { value: '20.5' } });
        expect(screen.queryByText(/Enter a valid amount/)).not.toBeInTheDocument();
        fireEvent.blur(amount);
        expect(amount.value).toBe('20.50');
    });

    it('adds and removes a split', () => {
        render(<TransactionEditor transaction={mkSingleTxn()} {...richProps} />);
        expect(screen.getByText(/single split/)).toBeInTheDocument();
        fireEvent.click(screen.getByText('Add another split'));
        expect(screen.getByText(/2 splits/)).toBeInTheDocument();
        expect(screen.getByText(/Splits sum:/)).toBeInTheDocument();
        // Remove the first split, back to a single split.
        fireEvent.click(screen.getAllByText('Delete split')[0]);
        expect(screen.getByText(/single split/)).toBeInTheDocument();
    });

    it('adds a tag via the tags autocomplete', async () => {
        const user = userEvent.setup();
        render(<TransactionEditor transaction={mkSingleTxn()} {...richProps} />);
        await user.type(screen.getByLabelText('Tags'), 'newtag{enter}');
        expect(screen.getByText('newtag')).toBeInTheDocument();
    });

    it('uses revenue options and enables source for a deposit', () => {
        render(<TransactionEditor transaction={mkDepositTxn()} {...richProps} />);
        // Deposit has no Budget/Bill fields.
        expect(screen.queryByLabelText('Budget')).not.toBeInTheDocument();
        const source = screen.getByLabelText('Source Account');
        expect(source).not.toBeDisabled();
        fireEvent.change(source, { target: { value: 'Salary' } });
    });

    it('hides add-split and budget/bill for a transfer', () => {
        render(<TransactionEditor transaction={mkTransferTxn()} {...richProps} />);
        expect(screen.queryByText('Add another split')).not.toBeInTheDocument();
        expect(screen.queryByLabelText('Budget')).not.toBeInTheDocument();
        expect(screen.queryByLabelText('Bill')).not.toBeInTheDocument();
    });

    it('changes the transaction type via the type autocomplete', async () => {
        const user = userEvent.setup();
        render(<TransactionEditor transaction={mkSingleTxn()} {...richProps} />);
        // Withdrawal initially exposes Budget; switching to Transfer removes add-split.
        expect(screen.getByText('Add another split')).toBeInTheDocument();
        await user.click(screen.getByLabelText('Transaction Type'));
        await user.click(await screen.findByRole('option', { name: 'transfer' }));
        expect(screen.queryByText('Add another split')).not.toBeInTheDocument();
    });
});
