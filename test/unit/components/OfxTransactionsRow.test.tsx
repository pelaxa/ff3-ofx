import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import moment from 'moment';
import { Table, TableBody } from '@mui/material';
import OfxTransactionsRow from '@/components/OfxTransactionsRow';
import { OfxImportStatus, OfxParsedTransaction } from '@/lib/interfaces';
import type { TransactionRead } from '@billos/firefly-iii-sdk';

vi.mock('@/components/TransactionEditor', () => ({
    default: () => <div data-testid="editor-stub" />,
}));

const baseTxn = (status?: OfxImportStatus, opts: Partial<OfxParsedTransaction> = {}): OfxParsedTransaction => ({
    transactionId: 'F1',
    transactionType: 'DEBIT',
    datePosted: moment('2024-01-15'),
    amount: -12.34,
    description: 'Coffee Shop',
    memo: 'latte',
    importStatus: status === undefined ? undefined : { status, ...(opts.importStatus ?? {}) },
    ...opts,
});

const wrap = (ui: React.ReactNode) => (
    <Table>
        <TableBody>{ui}</TableBody>
    </Table>
);

describe('OfxTransactionsRow', () => {
    it('renders description, formatted date, and amount', () => {
        render(wrap(<OfxTransactionsRow transaction={baseTxn(OfxImportStatus.SUCCESS)} index={0} importTransaction={vi.fn()} />));
        expect(screen.getByText('Coffee Shop')).toBeInTheDocument();
        expect(screen.getByText('15-Jan-2024')).toBeInTheDocument();
    });

    it('shows the SUCCESS chip', () => {
        render(wrap(<OfxTransactionsRow transaction={baseTxn(OfxImportStatus.SUCCESS)} index={0} importTransaction={vi.fn()} />));
        expect(screen.getByText('✓ added')).toBeInTheDocument();
    });

    it('shows the DELETED chip and offers "Add again"', () => {
        const onImport = vi.fn();
        const t = baseTxn(OfxImportStatus.DELETED);
        render(wrap(<OfxTransactionsRow transaction={t} index={0} importTransaction={onImport} />));
        expect(screen.getByText('✕ deleted')).toBeInTheDocument();
        fireEvent.click(screen.getByText('Add again'));
        expect(onImport).toHaveBeenCalledWith(t);
    });

    it('shows FAILURE chip and "Add anyways" button that fires importTransaction', () => {
        const onImport = vi.fn();
        const t = baseTxn(OfxImportStatus.FAILURE);
        render(wrap(<OfxTransactionsRow transaction={t} index={0} importTransaction={onImport} />));
        expect(screen.getByText('✕ failed')).toBeInTheDocument();
        fireEvent.click(screen.getByText('Add anyways'));
        expect(onImport).toHaveBeenCalledWith(t);
    });

    it('shows MATCH_EXACT chip and no "Add anyways" button (already added)', () => {
        const t = baseTxn(OfxImportStatus.MATCH_EXACT);
        render(wrap(<OfxTransactionsRow transaction={t} index={0} importTransaction={vi.fn()} />));
        expect(screen.getByText('= exact match')).toBeInTheDocument();
        expect(screen.queryByText('Add anyways')).not.toBeInTheDocument();
    });

    it('shows the MATCH_VALUE chip and exposes "Add anyways"', () => {
        const t = baseTxn(OfxImportStatus.MATCH_VALUE);
        render(wrap(<OfxTransactionsRow transaction={t} index={0} importTransaction={vi.fn()} />));
        expect(screen.getByText('$ amount match')).toBeInTheDocument();
        expect(screen.getByText('Add anyways')).toBeInTheDocument();
    });

    it('shows an Edit button for SUCCESS rows when editing handlers are wired', () => {
        const onStartEdit = vi.fn();
        const ff3TxnImported = { id: '999', attributes: { transactions: [] } } as unknown as TransactionRead;
        const t = baseTxn(OfxImportStatus.SUCCESS, { importStatus: { status: OfxImportStatus.SUCCESS, ff3TxnImported } } as Partial<OfxParsedTransaction>);
        render(wrap(
            <OfxTransactionsRow
                transaction={t}
                index={3}
                importTransaction={vi.fn()}
                onStartEdit={onStartEdit}
                onSaved={vi.fn()}
                onDeleted={vi.fn()}
                onCancelEdit={vi.fn()}
            />,
        ));
        fireEvent.click(screen.getByText('Edit'));
        expect(onStartEdit).toHaveBeenCalledWith(3);
    });

    it('shows the editor when isEditing=true', () => {
        const ff3TxnImported = { id: '999', attributes: { transactions: [{ amount: '1', currency_decimal_places: 2 }] } } as unknown as TransactionRead;
        const t = baseTxn(OfxImportStatus.SUCCESS, { importStatus: { status: OfxImportStatus.SUCCESS, ff3TxnImported } } as Partial<OfxParsedTransaction>);
        render(wrap(
            <OfxTransactionsRow
                transaction={t}
                index={0}
                importTransaction={vi.fn()}
                isEditing={true}
                onStartEdit={vi.fn()}
                onSaved={vi.fn()}
                onDeleted={vi.fn()}
                onCancelEdit={vi.fn()}
            />,
        ));
        expect(screen.getByTestId('editor-stub')).toBeInTheDocument();
        expect(screen.getByText('Editing…')).toBeInTheDocument();
    });

    it('shows an "edited" badge when importStatus.edited is true', () => {
        const ff3TxnImported = { id: '999', attributes: { transactions: [] } } as unknown as TransactionRead;
        const t = baseTxn(OfxImportStatus.SUCCESS, {
            importStatus: { status: OfxImportStatus.SUCCESS, ff3TxnImported, edited: true },
        } as Partial<OfxParsedTransaction>);
        render(wrap(<OfxTransactionsRow transaction={t} index={0} importTransaction={vi.fn()} onStartEdit={vi.fn()} onSaved={vi.fn()} onDeleted={vi.fn()} onCancelEdit={vi.fn()} />));
        expect(screen.getByText('✎ edited')).toBeInTheDocument();
    });
});
