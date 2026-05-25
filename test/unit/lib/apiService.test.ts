import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import moment from 'moment';
import { AccountRoleProperty } from '@billos/firefly-iii-sdk';

// ── Mocks ──────────────────────────────────────────────────────────────────────
// The SDK is mocked at the module boundary so apiService just calls our spies.

const createClientMock = vi.fn((..._args: unknown[]) => ({ __client: true }));
vi.mock('@billos/firefly-iii-sdk/client', () => ({
    createClient: (...args: unknown[]) => createClientMock(...args),
}));

// Service spies — declared up front so we can reset/clear them per test.
const accountsListAccount = vi.fn();
const accountsGetAccount = vi.fn();
const accountsStoreAccount = vi.fn();
const accountsListTxnByAccount = vi.fn();
const txnsListTransaction = vi.fn();
const txnsStoreTransaction = vi.fn();
const txnsUpdateTransaction = vi.fn();
const txnsDeleteTransaction = vi.fn();
const categoriesListCategory = vi.fn();
const budgetsListBudget = vi.fn();
const billsListBill = vi.fn();
const tagsListTag = vi.fn();

vi.mock('@billos/firefly-iii-sdk', () => ({
    AccountsService: {
        listAccount: (...args: unknown[]) => accountsListAccount(...args),
        getAccount: (...args: unknown[]) => accountsGetAccount(...args),
        storeAccount: (...args: unknown[]) => accountsStoreAccount(...args),
        listTransactionByAccount: (...args: unknown[]) => accountsListTxnByAccount(...args),
    },
    TransactionsService: {
        listTransaction: (...args: unknown[]) => txnsListTransaction(...args),
        storeTransaction: (...args: unknown[]) => txnsStoreTransaction(...args),
        updateTransaction: (...args: unknown[]) => txnsUpdateTransaction(...args),
        deleteTransaction: (...args: unknown[]) => txnsDeleteTransaction(...args),
    },
    CategoriesService: { listCategory: (...args: unknown[]) => categoriesListCategory(...args) },
    BudgetsService: { listBudget: (...args: unknown[]) => budgetsListBudget(...args) },
    BillsService: { listBill: (...args: unknown[]) => billsListBill(...args) },
    TagsService: { listTag: (...args: unknown[]) => tagsListTag(...args) },
    AccountRoleProperty: {
        DEFAULT_ASSET: 'defaultAsset',
        SAVING_ASSET: 'savingAsset',
        CC_ASSET: 'ccAsset',
    },
    CreditCardTypeProperty: { MONTHLY_FULL: 'monthlyFull' },
    ShortAccountTypeProperty: { ASSET: 'asset' },
}));

// Axios mock for getLatestVersion.
const axiosGet = vi.fn();
vi.mock('axios', () => ({
    default: { get: (...args: unknown[]) => axiosGet(...args) },
}));

// Import AFTER mocks so the module picks them up.
import ApiService, { BASE_URL } from '../../../src/lib/apiService';

// Helpers to build the SDK-style page envelope used in pagination.
const onePage = <T>(items: T[]) => ({
    data: { data: items, meta: { pagination: { total_pages: 1, current_page: 1 } } },
    error: undefined,
    response: { status: 200 } as Response,
});

const twoPages = <T>(page1: T[], page2: T[]) => [
    { data: { data: page1, meta: { pagination: { total_pages: 2, current_page: 1 } } }, error: undefined, response: { status: 200 } as Response },
    { data: { data: page2, meta: { pagination: { total_pages: 2, current_page: 2 } } }, error: undefined, response: { status: 200 } as Response },
];

beforeEach(() => {
    ApiService.reset();
    createClientMock.mockClear();
    accountsListAccount.mockReset();
    accountsGetAccount.mockReset();
    accountsStoreAccount.mockReset();
    accountsListTxnByAccount.mockReset();
    txnsListTransaction.mockReset();
    txnsStoreTransaction.mockReset();
    txnsUpdateTransaction.mockReset();
    txnsDeleteTransaction.mockReset();
    categoriesListCategory.mockReset();
    budgetsListBudget.mockReset();
    billsListBill.mockReset();
    tagsListTag.mockReset();
    axiosGet.mockReset();
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('getClient / reset', () => {
    it('creates a client when given a token and reuses it on subsequent calls', () => {
        const c1 = ApiService.getClient('tok');
        expect(c1).toBeDefined();
        expect(createClientMock).toHaveBeenCalledTimes(1);
        expect(createClientMock).toHaveBeenCalledWith(expect.objectContaining({ baseUrl: BASE_URL, auth: 'tok' }));
        const c2 = ApiService.getClient();
        expect(c2).toBe(c1);
        expect(createClientMock).toHaveBeenCalledTimes(1);
    });

    it('null token resets the client', () => {
        ApiService.getClient('tok');
        const c = ApiService.getClient(null);
        expect(c).toBeUndefined();
    });

    it('passes a custom baseUrl when provided without a token', () => {
        ApiService.getClient(undefined, 'https://example/api');
        expect(createClientMock).toHaveBeenCalledWith(expect.objectContaining({ baseUrl: 'https://example/api' }));
    });
});

describe('getAccounts', () => {
    it('returns null when there is no client', async () => {
        // No token has been set; the function should bail out.
        expect(await ApiService.getAccounts()).toBeNull();
    });

    it('pages through results and concatenates them', async () => {
        ApiService.getClient('tok');
        const [p1, p2] = twoPages([{ id: '1' }, { id: '2' }], [{ id: '3' }]);
        accountsListAccount.mockResolvedValueOnce(p1).mockResolvedValueOnce(p2);
        const accounts = await ApiService.getAccounts();
        expect(accounts).toHaveLength(3);
        expect(accountsListAccount).toHaveBeenCalledTimes(2);
        // It should pass type=asset and the page number.
        expect(accountsListAccount.mock.calls[0][0].query).toEqual(expect.objectContaining({ type: 'asset', page: 1 }));
        expect(accountsListAccount.mock.calls[1][0].query).toEqual(expect.objectContaining({ page: 2 }));
    });

    it('throws a 401-with-detail error when unauthenticated', async () => {
        ApiService.getClient('tok');
        accountsListAccount.mockResolvedValueOnce({
            data: undefined,
            error: { message: 'unauthorized' },
            response: { status: 401 } as Response,
        });
        await expect(ApiService.getAccounts()).rejects.toThrow(/401:.*Invalid\/Expired/);
    });
});

describe('getAccount', () => {
    it('returns null when there is no client', async () => {
        expect(await ApiService.getAccount('1')).toBeNull();
    });

    it('returns the account when found', async () => {
        ApiService.getClient('tok');
        accountsGetAccount.mockResolvedValueOnce({
            data: { data: { id: '1', attributes: { name: 'Checking' } } },
            response: { status: 200 },
        });
        const a = await ApiService.getAccount('1');
        expect(a).toEqual({ id: '1', attributes: { name: 'Checking' } });
        expect(accountsGetAccount).toHaveBeenCalledWith(expect.objectContaining({ path: { id: '1' } }));
    });
});

describe('createAccount', () => {
    it('builds an AccountStore body with credit-card extras when role=CC_ASSET', async () => {
        ApiService.getClient('tok');
        accountsStoreAccount.mockResolvedValueOnce({
            data: { data: { id: '99', attributes: { name: 'CC' } } },
            response: { status: 200 },
        });
        const out = await ApiService.createAccount({
            name: 'My CC',
            number: '4111',
            role: AccountRoleProperty.CC_ASSET,
            currency: 'USD',
        });
        expect(out).toEqual({ id: '99', attributes: { name: 'CC' } });
        const body = accountsStoreAccount.mock.calls[0][0].body;
        expect(body).toMatchObject({
            name: 'My CC',
            type: 'asset',
            account_number: '4111',
            account_role: AccountRoleProperty.CC_ASSET,
            currency_code: 'USD',
            credit_card_type: 'monthlyFull',
        });
        // monthly_payment_date should be today in YYYY-MM-DD
        expect(body.monthly_payment_date).toBe(moment().format('YYYY-MM-DD'));
    });

    it('omits credit-card extras for non-CC roles', async () => {
        ApiService.getClient('tok');
        accountsStoreAccount.mockResolvedValueOnce({
            data: { data: { id: '7', attributes: { name: 'Checking' } } },
            response: { status: 200 },
        });
        await ApiService.createAccount({ name: 'C', number: '123', role: AccountRoleProperty.DEFAULT_ASSET, currency: 'USD' });
        const body = accountsStoreAccount.mock.calls[0][0].body;
        expect(body.credit_card_type).toBeUndefined();
        expect(body.monthly_payment_date).toBeUndefined();
    });
});

describe('transaction queries', () => {
    it('getAccountTransactions paginates against accounts/{id}/transactions', async () => {
        ApiService.getClient('tok');
        const [p1, p2] = twoPages([{ id: 'a' }], [{ id: 'b' }]);
        accountsListTxnByAccount.mockResolvedValueOnce(p1).mockResolvedValueOnce(p2);
        const txns = await ApiService.getAccountTransactions('42', moment('2024-01-01'), moment('2024-01-31'));
        expect(txns).toHaveLength(2);
        const q = accountsListTxnByAccount.mock.calls[0][0].query;
        expect(q).toEqual(expect.objectContaining({ start: '2024-01-01', end: '2024-01-31', page: 1 }));
        expect(accountsListTxnByAccount.mock.calls[0][0].path).toEqual({ id: '42' });
    });

    it('getTransactions uses the global transactions endpoint', async () => {
        ApiService.getClient('tok');
        txnsListTransaction.mockResolvedValueOnce(onePage([{ id: 'x' }]));
        const txns = await ApiService.getTransactions();
        expect(txns).toHaveLength(1);
        expect(txnsListTransaction).toHaveBeenCalled();
    });

    it('getTransactions returns [] when there is no client', async () => {
        expect(await ApiService.getTransactions()).toEqual([]);
    });
});

describe('transaction mutations', () => {
    it('addTransaction returns the created TransactionRead on success', async () => {
        ApiService.getClient('tok');
        txnsStoreTransaction.mockResolvedValueOnce({ data: { data: { id: '1' } }, error: undefined });
        const out = await ApiService.addTransaction({} as never);
        expect(out).toEqual({ id: '1' });
    });

    it('addTransaction returns the ValidationErrorResponse when the server rejects', async () => {
        ApiService.getClient('tok');
        const err = { message: 'bad', errors: { description: ['missing'] } };
        txnsStoreTransaction.mockResolvedValueOnce({ data: undefined, error: err });
        const out = await ApiService.addTransaction({} as never);
        expect(out).toEqual(err);
    });

    it('updateTransaction passes through id + body', async () => {
        ApiService.getClient('tok');
        txnsUpdateTransaction.mockResolvedValueOnce({ data: { data: { id: '5' } }, error: undefined });
        const out = await ApiService.updateTransaction('5', {} as never);
        expect(out).toEqual({ id: '5' });
        expect(txnsUpdateTransaction).toHaveBeenCalledWith(expect.objectContaining({ path: { id: '5' } }));
    });

    it('deleteTransaction returns true on 204', async () => {
        ApiService.getClient('tok');
        txnsDeleteTransaction.mockResolvedValueOnce({ response: { status: 204 }, error: undefined });
        expect(await ApiService.deleteTransaction('5')).toBe(true);
    });

    it('deleteTransaction throws on error', async () => {
        ApiService.getClient('tok');
        txnsDeleteTransaction.mockResolvedValueOnce({
            response: { status: 500 },
            error: { message: 'boom' },
        });
        await expect(ApiService.deleteTransaction('5')).rejects.toThrow(/500/);
    });

    it('mutations return null when there is no client', async () => {
        expect(await ApiService.addTransaction({} as never)).toBeNull();
        expect(await ApiService.updateTransaction('1', {} as never)).toBeNull();
        expect(await ApiService.deleteTransaction('1')).toBe(false);
    });
});

describe('list endpoints (paginating helpers)', () => {
    it('listAllAccounts pages through results', async () => {
        ApiService.getClient('tok');
        const [p1, p2] = twoPages([{ id: '1' }], [{ id: '2' }]);
        accountsListAccount.mockResolvedValueOnce(p1).mockResolvedValueOnce(p2);
        expect((await ApiService.listAllAccounts()).map((a) => a.id)).toEqual(['1', '2']);
    });

    it('listCategories collects items', async () => {
        ApiService.getClient('tok');
        categoriesListCategory.mockResolvedValueOnce(onePage([{ id: 'c1' }, { id: 'c2' }]));
        expect((await ApiService.listCategories()).map((c) => c.id)).toEqual(['c1', 'c2']);
    });

    it('listBudgets / listBills work the same way', async () => {
        ApiService.getClient('tok');
        budgetsListBudget.mockResolvedValueOnce(onePage([{ id: 'b1' }]));
        billsListBill.mockResolvedValueOnce(onePage([{ id: 'i1' }]));
        expect(await ApiService.listBudgets()).toHaveLength(1);
        expect(await ApiService.listBills()).toHaveLength(1);
    });

    it('listTags maps to attribute.tag and skips empties', async () => {
        ApiService.getClient('tok');
        tagsListTag.mockResolvedValueOnce(onePage([
            { id: '1', attributes: { tag: 'food' } },
            { id: '2', attributes: { tag: '' } },
            { id: '3', attributes: { tag: 'travel' } },
        ]));
        expect(await ApiService.listTags()).toEqual(['food', 'travel']);
    });

    it('list endpoints return [] when there is no client', async () => {
        expect(await ApiService.listAllAccounts()).toEqual([]);
        expect(await ApiService.listCategories()).toEqual([]);
        expect(await ApiService.listBudgets()).toEqual([]);
        expect(await ApiService.listBills()).toEqual([]);
        expect(await ApiService.listTags()).toEqual([]);
    });
});

describe('getLatestVersion', () => {
    it('returns the first tag name when GitHub responds 200', async () => {
        axiosGet.mockResolvedValueOnce({ status: 200, data: [{ name: 'v2.0.0' }, { name: 'v1.9' }] });
        expect(await ApiService.getLatestVersion()).toBe('v2.0.0');
    });

    it('returns null when GitHub returns empty', async () => {
        axiosGet.mockResolvedValueOnce({ status: 200, data: [] });
        expect(await ApiService.getLatestVersion()).toBeNull();
    });

    it('returns null on non-200', async () => {
        axiosGet.mockResolvedValueOnce({ status: 403, data: [] });
        expect(await ApiService.getLatestVersion()).toBeNull();
    });
});
