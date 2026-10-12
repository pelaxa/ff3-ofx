import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import moment from 'moment';
import type { TransactionRead, TransactionStoreWritable } from '@billos/firefly-iii-sdk';
import { importParsedTransaction } from '../../../src/lib/statementImport';
import { mergeCreatedEntities } from '../../../src/lib/useEditorMetadata';
import { OfxImportStatus, OfxParsedTransaction, type EditorMetadata, type ImportStore } from '../../../src/lib/interfaces';

const ACCOUNT = '10';
const TAG = 'OFX Import test';

const parsed = (overrides: Partial<OfxParsedTransaction['transactions'][number]> = {}): OfxParsedTransaction => ({
    title: null,
    transactions: [{
        transactionId: 'F1',
        transactionType: 'DEBIT',
        datePosted: moment('2024-01-15'),
        amount: -12.34,
        description: 'Coffee Shop',
        memo: 'latte',
        ...overrides,
    }],
});

const ffSplit = (o: Record<string, unknown> = {}) => ({
    amount: '12.34',
    description: 'Something else',
    source_id: ACCOUNT,
    destination_id: '99',
    ...o,
});
const ffTxn = (splits: Record<string, unknown>[], id = '1') =>
    ({ id, type: 'transactions', attributes: { transactions: splits } }) as unknown as TransactionRead;

// In-memory stand-in for Firefly: returns `existing` for any lookup and records adds.
const fakeStore = (existing: TransactionRead[], addResult: unknown = ffTxn([ffSplit()], 'new')) => {
    const added: TransactionStoreWritable[] = [];
    const store = {
        getAccountTransactions: vi.fn(async () => existing),
        addTransaction: vi.fn(async (t: TransactionStoreWritable) => { added.push(t); return addResult; }),
    } as unknown as ImportStore;
    return { store, added };
};

describe('importParsedTransaction', () => {
    beforeEach(() => { vi.spyOn(console, 'log').mockImplementation(() => {}); });
    afterEach(() => { vi.restoreAllMocks(); });

    it('adds a withdrawal from the account when nothing matches', async () => {
        const { store, added } = fakeStore([]);
        const status = await importParsedTransaction(store, parsed(), ACCOUNT, TAG);
        expect(status.status).toBe(OfxImportStatus.SUCCESS);
        expect(added).toHaveLength(1);
        const split = added[0].transactions[0];
        expect(split.type).toBe('withdrawal');
        expect(split.source_id).toBe(ACCOUNT);
        expect(split.destination_id).toBeUndefined();
        expect(split.amount).toBe('12.34');
        expect(split.external_id).toBe('F1');
        expect(split.tags).toEqual([TAG]);
    });

    it('adds a deposit into the account for a positive amount', async () => {
        const { store, added } = fakeStore([]);
        await importParsedTransaction(store, parsed({ amount: 50 }), ACCOUNT, TAG);
        const split = added[0].transactions[0];
        expect(split.type).toBe('deposit');
        expect(split.destination_id).toBe(ACCOUNT);
        expect(split.source_id).toBeUndefined();
    });

    it('reports MATCH_EXACT and does not add when external id and amount match', async () => {
        const existing = ffTxn([ffSplit({ external_id: 'F1' })]);
        const { store, added } = fakeStore([existing]);
        const status = await importParsedTransaction(store, parsed(), ACCOUNT, TAG);
        expect(status.status).toBe(OfxImportStatus.MATCH_EXACT);
        expect(status.matchingTransactions).toEqual([existing]);
        expect(added).toHaveLength(0);
    });

    it('reports MATCH_VALUE and does not add when only amount and direction match', async () => {
        const { store, added } = fakeStore([ffTxn([ffSplit()])]);
        const status = await importParsedTransaction(store, parsed(), ACCOUNT, TAG);
        expect(status.status).toBe(OfxImportStatus.MATCH_VALUE);
        expect(status.ff3Txn2Import).toBeDefined();
        expect(added).toHaveLength(0);
    });

    it('still adds when the same amount belongs to a different account', async () => {
        const { store, added } = fakeStore([ffTxn([ffSplit({ source_id: '77' })])]);
        const status = await importParsedTransaction(store, parsed(), ACCOUNT, TAG);
        expect(status.status).toBe(OfxImportStatus.SUCCESS);
        expect(added).toHaveLength(1);
    });

    it('matches a split transaction by its running total and flags totalMatch', async () => {
        const split = ffTxn([ffSplit({ amount: '10.00' }), ffSplit({ amount: '2.34' })]);
        const { store, added } = fakeStore([split]);
        const status = await importParsedTransaction(store, parsed(), ACCOUNT, TAG);
        expect(status.status).toBe(OfxImportStatus.MATCH_VALUE);
        expect((status.matchingTransactions![0] as { totalMatch?: boolean }).totalMatch).toBe(true);
        expect(added).toHaveLength(0);
    });

    it('returns FAILURE with the validation message when Firefly rejects the add', async () => {
        const { store } = fakeStore([], { message: 'Duplicate of transaction #5', errors: {} });
        const status = await importParsedTransaction(store, parsed(), ACCOUNT, TAG);
        expect(status.status).toBe(OfxImportStatus.FAILURE);
        expect(status.statusMessage).toBe('Duplicate of transaction #5');
        expect(status.ff3Txn2Import).toBeDefined();
    });
});

describe('mergeCreatedEntities', () => {
    const meta: EditorMetadata = { accounts: [], categories: [], budgets: [], bills: [], tags: ['known'] };
    const saved = (s: Record<string, unknown>) =>
        ({ id: '1', attributes: { transactions: [s] } }) as unknown as TransactionRead;

    it('adds a category and tag FF3 created, and a revenue account from the source', () => {
        const out = mergeCreatedEntities(meta, saved({
            category_name: 'Coffee', category_id: '3', tags: ['known', 'fresh'],
            source_name: 'Cafe', source_id: '8', source_type: 'Revenue account',
        }));
        expect(out.categories.map((c) => c.attributes.name)).toEqual(['Coffee']);
        expect(out.tags).toEqual(['known', 'fresh']);
        expect(out.accounts.map((a) => a.id)).toEqual(['8']);
    });

    it('keeps existing entries and adds only new budgets, bills and destination accounts', () => {
        const populated = {
            accounts: [{ id: '1', attributes: { name: 'Checking' } }],
            categories: [{ id: '2', attributes: { name: 'Food' } }],
            budgets: [{ id: '3', attributes: { name: 'Monthly' } }],
            bills: [{ id: '4', attributes: { name: 'Rent' } }, { id: '5', attributes: {} }],
            tags: ['known'],
        } as unknown as EditorMetadata;
        const out = mergeCreatedEntities(populated, saved({
            category_name: 'Food', budget_name: 'Fun', budget_id: '6', bill_name: 'Rent',
            destination_name: 'Shop', destination_id: '9',
        }));
        expect(out.categories).toBe(populated.categories);
        expect(out.bills).toBe(populated.bills);
        expect(out.budgets.map((b) => b.attributes.name)).toEqual(['Monthly', 'Fun']);
        expect(out.accounts.map((a) => a.id)).toEqual(['1', '9']);
    });

    it('returns the same object when nothing new was created', () => {
        expect(mergeCreatedEntities(meta, saved({ tags: ['known'] }))).toBe(meta);
    });
});
