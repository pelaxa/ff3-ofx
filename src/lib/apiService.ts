import moment, { Moment } from 'moment';
import axios from 'axios';
import { createClient, type Client } from '@billos/firefly-iii-sdk/client';
import {
    AccountsService,
    BillsService,
    BudgetsService,
    CategoriesService,
    TagsService,
    TransactionsService,
    AccountRoleProperty,
    CreditCardTypeProperty,
    ShortAccountTypeProperty,
    type AccountRead,
    type AccountStore,
    type BillRead,
    type BudgetRead,
    type CategoryRead,
    type TagRead,
    type TransactionRead,
    type TransactionStoreWritable,
    type TransactionUpdateWritable,
    type ValidationErrorResponse,
    BadRequestResponse,
    UnauthenticatedResponse,
    NotFoundResponse,
    InternalExceptionResponse,
} from '@billos/firefly-iii-sdk';
import { FF3NewAccount } from '@/lib/interfaces';

export const BASE_URL = '/api';

const DATE_FORMAT = 'YYYY-MM-DD';
const PAGE_SIZE = 75;

let client: Client | undefined;

const reset = () => {
    client = undefined;
};

const getClient = (token?: string | null, url?: string | null): Client | undefined => {
    if (token === null) {
        reset();
    } else if (token) {
        console.info('Creating SDK client...');
        reset();
        client = createClient({
            baseUrl: url || BASE_URL,
            auth: token,
            headers: {
                'Content-type': 'application/json',
                'Accept': 'application/json',
            },
        });
    } else if (url) {
        reset();
        client = createClient({
            baseUrl: url,
            headers: {
                'Content-type': 'application/json',
                'Accept': 'application/json',
            },
        });
    }
    return client;
};

const buildRequestError = (
    endpoint: string,
    response: Response | undefined,
    error: BadRequestResponse | UnauthenticatedResponse | NotFoundResponse | InternalExceptionResponse | string | undefined,
): Error => {
    const status = response?.status ?? 'unknown';
    let detail: string;
    if (response?.status === 401) {
        detail = 'Invalid/Expired personal access token';
    } else if (error && typeof error === 'object' && 'message' in error && typeof (error as { message?: unknown }).message === 'string') {
        detail = (error as { message: string }).message;
    } else if (error !== undefined) {
        try {
            detail = JSON.stringify(error);
        } catch {
            detail = String(error);
        }
    } else {
        detail = 'no response body';
    }
    return new Error(`${endpoint} ${status}: ${detail}`);
};

async function* pageThroughAccounts(
    c: Client,
    extraQuery: Record<string, unknown> = {},
): AsyncGenerator<AccountRead | null, void, unknown> {
    let currentPage = 1;
    for (;;) {
        const { data, error, response } = await AccountsService.listAccount({
            client: c,
            throwOnError: false,
            query: { limit: PAGE_SIZE, page: currentPage, ...extraQuery },
        });
        if (error || !data) {
            throw buildRequestError('GET /accounts', response, error);
        }
        for (const a of data.data) yield a;
        const total = data.meta?.pagination?.total_pages ?? 1;
        const cur = data.meta?.pagination?.current_page ?? 1;
        if (cur >= total) return;
        currentPage = cur + 1;
    }
}

async function* pageThroughTransactions(
    c: Client,
    options: { accountId?: string; start?: string; end?: string },
): AsyncGenerator<TransactionRead | null, void, unknown> {
    let currentPage = 1;
    for (;;) {
        const query: Record<string, unknown> = { limit: PAGE_SIZE, page: currentPage };
        if (options.start) query.start = options.start;
        if (options.end) query.end = options.end;
        const result = options.accountId
            ? await AccountsService.listTransactionByAccount({
                  client: c,
                  throwOnError: false,
                  path: { id: options.accountId },
                  query,
              })
            : await TransactionsService.listTransaction({
                  client: c,
                  throwOnError: false,
                  query,
              });
        const { data, error, response } = result;
        if (error || !data) {
            const endpoint = options.accountId
                ? `GET /accounts/${options.accountId}/transactions`
                : 'GET /transactions';
            throw buildRequestError(endpoint, response, error);
        }
        for (const t of data.data) yield t;
        const total = data.meta?.pagination?.total_pages ?? 1;
        const cur = data.meta?.pagination?.current_page ?? 1;
        if (cur >= total) return;
        currentPage = cur + 1;
    }
}

const getLatestVersion = async (): Promise<string | null> => {
    const response = await axios.get('https://api.github.com/repos/pelaxa/ff3-ofx/tags', {
        headers: {
            'Content-type': 'application/json',
            'Accept': 'application/json',
        },
        validateStatus: (status: number) => status < 500,
    });
    if (response && response.status === 200 && response.data.length > 0) {
        console.info('tags', response.data);
        return response.data[0].name;
    }
    return null;
};

const getAccounts = async (currentToken?: string): Promise<AccountRead[] | null> => {
    const c = getClient(currentToken);
    if (!c) return null;
    const accounts: AccountRead[] = [];
    for await (const a of pageThroughAccounts(c, { type: 'asset' })) {
        if (a === null) return null;
        accounts.push(a);
    }
    console.log('Accounts fetched', accounts);
    return accounts;
};

const getAccount = async (accountId: string): Promise<AccountRead | null> => {
    const c = getClient();
    if (!c) return null;
    const { data, response } = await AccountsService.getAccount({
        client: c,
        throwOnError: false,
        path: { id: accountId },
    });
    console.log('Get Account status', response?.status, data?.data);
    return data?.data ?? null;
};

const createAccount = async (accountData: FF3NewAccount): Promise<AccountRead | null> => {
    const c = getClient();
    if (!c) return null;
    const body: AccountStore = {
        name: accountData.name,
        type: ShortAccountTypeProperty.ASSET,
        account_number: accountData.number,
        account_role: accountData.role,
        currency_code: accountData.currency,
    };
    if (accountData.role === AccountRoleProperty.CC_ASSET) {
        body.credit_card_type = CreditCardTypeProperty.MONTHLY_FULL;
        body.monthly_payment_date = moment().format(DATE_FORMAT);
    }
    const { data, response } = await AccountsService.storeAccount({
        client: c,
        throwOnError: false,
        body,
    });
    console.log('Create Account status', response?.status, data?.data);
    return data?.data ?? null;
};

const getAccountTransactions = async (
    accountId: string,
    startDate?: Moment,
    endDate?: Moment,
): Promise<TransactionRead[]> => {
    const c = getClient();
    if (!c) return [];
    const txns: TransactionRead[] = [];
    for await (const t of pageThroughTransactions(c, {
        accountId,
        start: startDate?.format(DATE_FORMAT),
        end: endDate?.format(DATE_FORMAT),
    })) {
        if (t === null) break;
        txns.push(t);
    }
    return txns;
};

const getTransactions = async (
    startDate?: Moment,
    endDate?: Moment,
): Promise<TransactionRead[]> => {
    const c = getClient();
    if (!c) return [];
    const txns: TransactionRead[] = [];
    for await (const t of pageThroughTransactions(c, {
        start: startDate?.format(DATE_FORMAT),
        end: endDate?.format(DATE_FORMAT),
    })) {
        if (t === null) break;
        txns.push(t);
    }
    return txns;
};

const addTransaction = async (
    txn: TransactionStoreWritable,
): Promise<TransactionRead | ValidationErrorResponse | null> => {
    const c = getClient();
    if (!c) return null;
    const { data, error } = await TransactionsService.storeTransaction({
        client: c,
        throwOnError: false,
        body: txn,
    });
    if (data?.data) return data.data;
    return (error as ValidationErrorResponse | undefined) ?? null;
};

const updateTransaction = async (
    id: string,
    body: TransactionUpdateWritable,
): Promise<TransactionRead | ValidationErrorResponse | null> => {
    const c = getClient();
    if (!c) return null;
    const { data, error } = await TransactionsService.updateTransaction({
        client: c,
        throwOnError: false,
        path: { id },
        body,
    });
    if (data?.data) return data.data;
    return (error as ValidationErrorResponse | undefined) ?? null;
};

const deleteTransaction = async (id: string): Promise<boolean> => {
    const c = getClient();
    if (!c) return false;
    const { response, error } = await TransactionsService.deleteTransaction({
        client: c,
        throwOnError: false,
        path: { id },
    });
    if (error) {
        throw buildRequestError(`DELETE /transactions/${id}`, response, error as never);
    }
    return response?.status === 204 || response?.status === 200;
};

async function* pageThroughGeneric<T>(
    fetchPage: (page: number) => Promise<{
        data?: { data: T[]; meta?: { pagination?: { total_pages?: number; current_page?: number } } };
        error?: unknown;
        response?: Response;
    }>,
    endpoint: string,
): AsyncGenerator<T, void, unknown> {
    let currentPage = 1;
    for (;;) {
        const { data, error, response } = await fetchPage(currentPage);
        if (error || !data) {
            throw buildRequestError(endpoint, response, error as never);
        }
        for (const item of data.data) yield item;
        const total = data.meta?.pagination?.total_pages ?? 1;
        const cur = data.meta?.pagination?.current_page ?? 1;
        if (cur >= total) return;
        currentPage = cur + 1;
    }
}

const listAllAccounts = async (): Promise<AccountRead[]> => {
    const c = getClient();
    if (!c) return [];
    const out: AccountRead[] = [];
    for await (const a of pageThroughGeneric<AccountRead>(
        (page) => AccountsService.listAccount({
            client: c,
            throwOnError: false,
            query: { limit: PAGE_SIZE, page },
        }),
        'GET /accounts',
    )) {
        out.push(a);
    }
    return out;
};

const listCategories = async (): Promise<CategoryRead[]> => {
    const c = getClient();
    if (!c) return [];
    const out: CategoryRead[] = [];
    for await (const item of pageThroughGeneric<CategoryRead>(
        (page) => CategoriesService.listCategory({
            client: c,
            throwOnError: false,
            query: { limit: PAGE_SIZE, page },
        }),
        'GET /categories',
    )) {
        out.push(item);
    }
    return out;
};

const listBudgets = async (): Promise<BudgetRead[]> => {
    const c = getClient();
    if (!c) return [];
    const out: BudgetRead[] = [];
    for await (const item of pageThroughGeneric<BudgetRead>(
        (page) => BudgetsService.listBudget({
            client: c,
            throwOnError: false,
            query: { limit: PAGE_SIZE, page },
        }),
        'GET /budgets',
    )) {
        out.push(item);
    }
    return out;
};

const listTags = async (): Promise<string[]> => {
    const c = getClient();
    if (!c) return [];
    const out: string[] = [];
    for await (const item of pageThroughGeneric<TagRead>(
        (page) => TagsService.listTag({
            client: c,
            throwOnError: false,
            query: { limit: PAGE_SIZE, page },
        }),
        'GET /tags',
    )) {
        if (item.attributes.tag) out.push(item.attributes.tag);
    }
    return out;
};

const listBills = async (): Promise<BillRead[]> => {
    const c = getClient();
    if (!c) return [];
    const out: BillRead[] = [];
    for await (const item of pageThroughGeneric<BillRead>(
        (page) => BillsService.listBill({
            client: c,
            throwOnError: false,
            query: { limit: PAGE_SIZE, page },
        }),
        'GET /bills',
    )) {
        out.push(item);
    }
    return out;
};

const ApiService = {
    reset,
    getClient,
    getHttp: getClient,
    getAccounts,
    getAccount,
    createAccount,
    getTransactions,
    getAccountTransactions,
    addTransaction,
    updateTransaction,
    deleteTransaction,
    listAllAccounts,
    listCategories,
    listBudgets,
    listBills,
    listTags,
    getLatestVersion,
};

export default ApiService;
