import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import TransactionEditor from '@/components/TransactionEditor';
import ApiService from '@/lib/apiService';
import { TransactionTypeProperty, type TransactionRead } from '@billos/firefly-iii-sdk';

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
});
