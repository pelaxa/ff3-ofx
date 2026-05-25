import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import moment from 'moment';
import { Table, TableBody } from '@mui/material';
import OfxMatchingTransactionsTable from '@/components/OfxMatchingTransactionsTable';
import { OfxImportStatus, OfxParsedTransaction, MatchedTransaction } from '@/lib/interfaces';

const matchedTxn = (overrides: Partial<MatchedTransaction['attributes']> = {}): MatchedTransaction => ({
    id: '1',
    type: 'transactions',
    attributes: {
        transactions: [
            {
                transaction_journal_id: 'tj1',
                description: 'Lunch',
                date: '2024-02-10',
                amount: '15.00',
                type: 'withdrawal',
            },
        ] as never,
        ...overrides,
    },
} as unknown as MatchedTransaction);

const splitTxn = (): MatchedTransaction => {
    const t = matchedTxn({
        transactions: [
            { transaction_journal_id: 'a', description: 'Half A', date: '2024-02-10', amount: '5.00', type: 'withdrawal' },
            { transaction_journal_id: 'b', description: 'Half B', date: '2024-02-10', amount: '10.00', type: 'withdrawal' },
        ] as never,
    });
    (t as MatchedTransaction).totalMatch = true;
    return t;
};

const txn = (matches: MatchedTransaction[]): OfxParsedTransaction => ({
    transactionId: 'T',
    transactionType: 'DEBIT',
    datePosted: moment('2024-02-10'),
    amount: -15,
    description: 'Lunch',
    memo: '',
    importStatus: { status: OfxImportStatus.MATCH_VALUE, matchingTransactions: matches },
});

describe('OfxMatchingTransactionsTable', () => {
    it('renders matching transactions when open', () => {
        render(
            <Table>
                <TableBody>
                    <OfxMatchingTransactionsTable open={true} transaction={txn([matchedTxn()])} />
                </TableBody>
            </Table>,
        );
        expect(screen.getByText('Lunch')).toBeInTheDocument();
        expect(screen.getByText('10-Feb-2024')).toBeInTheDocument();
        expect(screen.getByText('withdrawal')).toBeInTheDocument();
    });

    it('renders a "Split - n of m" prefix for totalMatch entries', () => {
        render(
            <Table>
                <TableBody>
                    <OfxMatchingTransactionsTable open={true} transaction={txn([splitTxn()])} />
                </TableBody>
            </Table>,
        );
        expect(screen.getByText(/Split - 1 of 2/)).toBeInTheDocument();
        expect(screen.getByText(/Split - 2 of 2/)).toBeInTheDocument();
    });

    it('does not render content when closed', () => {
        render(
            <Table>
                <TableBody>
                    <OfxMatchingTransactionsTable open={false} transaction={txn([matchedTxn()])} />
                </TableBody>
            </Table>,
        );
        // unmountOnExit + Collapse means nothing should be rendered while closed
        expect(screen.queryByText('Lunch')).not.toBeInTheDocument();
    });
});
