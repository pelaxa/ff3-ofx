import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import App from '@/App';
import ApiService from '@/lib/apiService';

// ── Hoisted holders the component mocks write into ──────────────────────────
// FileDrop captures the latest onChange so a test can simulate a dropped file.
// OfxTransactionsRow exposes its callbacks as buttons so we can drive the edit
// flow without dealing with the row's internal UI. `savedPayload` is the
// TransactionRead handed back to App's onSaved handler.
const h = vi.hoisted(() => ({
    onChange: undefined as undefined | ((files: File[]) => void),
    savedPayload: undefined as unknown,
}));

vi.mock('node-ofx-parser', () => ({ parse: vi.fn() }));
import * as OFXParser from 'node-ofx-parser';

vi.mock('@/components/FileDrop', () => ({
    default: (props: { onChange: (files: File[]) => void }) => {
        h.onChange = props.onChange;
        return <div data-testid='filedrop' />;
    },
}));

// A minimal stand-in for the row that surfaces every callback App passes down.
vi.mock('@/components/OfxTransactionsRow', () => ({
    default: (props: {
        index: number;
        transaction: { description: string; importStatus?: { status?: string } };
        importTransaction: (t: unknown) => void;
        onStartEdit: (i: number) => void;
        onSaved: (i: number, updated: unknown) => void;
        onDeleted: (i: number) => void;
        onCancelEdit: () => void;
    }) => (
        <tr data-testid={`row-${props.index}`}>
            <td>
                <span data-testid={`row-desc-${props.index}`}>{props.transaction.description}</span>
                <span data-testid={`row-status-${props.index}`}>{props.transaction.importStatus?.status ?? ''}</span>
                <button data-testid={`start-edit-${props.index}`} onClick={() => props.onStartEdit(props.index)} />
                <button data-testid={`import-${props.index}`} onClick={() => props.importTransaction(props.transaction)} />
                <button data-testid={`saved-${props.index}`} onClick={() => props.onSaved(props.index, h.savedPayload)} />
                <button data-testid={`deleted-${props.index}`} onClick={() => props.onDeleted(props.index)} />
                <button data-testid={`cancel-${props.index}`} onClick={() => props.onCancelEdit()} />
            </td>
        </tr>
    ),
}));

vi.mock('@/lib/apiService', () => ({
    default: {
        getAccounts: vi.fn(),
        getAccount: vi.fn(),
        getLatestVersion: vi.fn(),
        getHttp: vi.fn(),
        createAccount: vi.fn(),
        getAccountTransactions: vi.fn(),
        addTransaction: vi.fn(),
        updateTransaction: vi.fn(),
        deleteTransaction: vi.fn(),
        listAllAccounts: vi.fn(),
        listCategories: vi.fn(),
        listBudgets: vi.fn(),
        listBills: vi.fn(),
        listTags: vi.fn(),
        reset: vi.fn(),
    },
}));

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

/* eslint-disable @typescript-eslint/no-explicit-any */
const txnNode = (overrides: Record<string, string> = {}) => ({
    TRNTYPE: 'DEBIT',
    DTPOSTED: '20240115120000',
    TRNAMT: '-12.34',
    FITID: 'FIT-1',
    NAME: 'Coffee Shop',
    MEMO: 'morning latte',
    ...overrides,
});

// Builds the *raw* object node-ofx-parser would emit; the real Utils.getOfxData
// then turns it into the OfxData the app consumes.
const rawOfx = (opts: {
    acctId?: string;
    acctType?: string;
    txns?: any;
    org?: string;
    intuit?: string;
    balance?: string;
} = {}) => ({
    OFX: {
        SIGNONMSGSRSV1: { SONRS: { FI: { ORG: opts.org ?? 'TESTBANK' }, INTUBID: opts.intuit ?? '01001' } },
        BANKMSGSRSV1: {
            STMTTRNRS: {
                STMTRS: {
                    CURDEF: 'USD',
                    BANKACCTFROM: { ACCTID: opts.acctId ?? '1111-2222', ACCTTYPE: opts.acctType ?? 'CHECKING' },
                    BANKTRANLIST: { DTSTART: '20240101000000', DTEND: '20240131000000', STMTTRN: opts.txns ?? [txnNode()] },
                    LEDGERBAL: { BALAMT: opts.balance ?? '1000.00', DTASOF: '20240131000000' },
                },
            },
        },
    },
});

const rawMultiAccount = () => ({
    OFX: {
        SIGNONMSGSRSV1: { SONRS: { FI: { ORG: 'TESTBANK' }, INTUBID: '01001' } },
        BANKMSGSRSV1: {
            STMTTRNRS: [
                rawOfx({ acctId: 'AAAA', txns: [txnNode({ FITID: 'A-1' })] }).OFX.BANKMSGSRSV1.STMTTRNRS,
                rawOfx({ acctId: 'BBBB', txns: [txnNode({ FITID: 'B-1' })] }).OFX.BANKMSGSRSV1.STMTTRNRS,
            ],
        },
    },
});

const acct = (id: string, number: string | undefined, name = 'Checking', type = 'asset') => ({
    id,
    type: 'accounts',
    attributes: { name, account_number: number, type, currency_code: 'USD' },
}) as any;

const ffTxn = (over: Record<string, any> = {}) => ({
    id: '900',
    type: 'transactions',
    attributes: {
        transactions: [
            {
                amount: '12.34',
                external_id: 'FIT-1',
                internal_reference: null,
                source_id: '1',
                destination_id: 'OTHER',
                description: 'Coffee Shop',
                ...over,
            },
        ],
    },
}) as any;

// Drop a file through the (mocked) FileDrop. Content is irrelevant because
// OFXParser.parse is mocked; only that a File reaches FileReader matters.
const dropFile = async (name = 'statement.ofx') => {
    await waitFor(() => expect(h.onChange).toBeTypeOf('function'));
    const file = new File(['<OFX/>'], name, { type: 'application/x-ofx' });
    await act(async () => {
        h.onChange!([file]);
    });
};

// Render with a stored token so we bypass the login screen and land on import.
const renderLoggedIn = async (accounts: any[]) => {
    localStorage.setItem('token', JSON.stringify({ value: 'stored-token' }));
    asMock(ApiService.getAccounts).mockResolvedValue(accounts);
    render(<App />);
    await screen.findByTestId('filedrop');
};

beforeEach(() => {
    asMock(ApiService.getLatestVersion).mockResolvedValue('v0.0.0');
    asMock(ApiService.getAccounts).mockResolvedValue([]);
    asMock(ApiService.getAccount).mockResolvedValue(null);
    asMock(ApiService.getAccountTransactions).mockResolvedValue([]);
    asMock(ApiService.addTransaction).mockResolvedValue({ id: '1', attributes: { transactions: [] } });
    asMock(ApiService.listAllAccounts).mockResolvedValue([]);
    asMock(ApiService.listCategories).mockResolvedValue([]);
    asMock(ApiService.listBudgets).mockResolvedValue([]);
    asMock(ApiService.listBills).mockResolvedValue([]);
    asMock(ApiService.listTags).mockResolvedValue([]);
    localStorage.clear();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'debug').mockImplementation(() => {});
});

afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
});

describe('App — file drop validation', () => {
    it('rejects more than one file', async () => {
        await renderLoggedIn([acct('1', '1111-2222')]);
        await waitFor(() => expect(h.onChange).toBeTypeOf('function'));
        await act(async () => {
            h.onChange!([new File(['a'], 'a.ofx'), new File(['b'], 'b.ofx')]);
        });
        expect(await screen.findByText(/Please only drop 1 file/i)).toBeInTheDocument();
    });

    it('rejects a non-OFX/QFX extension', async () => {
        await renderLoggedIn([acct('1', '1111-2222')]);
        await waitFor(() => expect(h.onChange).toBeTypeOf('function'));
        await act(async () => {
            h.onChange!([new File(['a'], 'notes.txt')]);
        });
        expect(await screen.findByText(/Please only drop 1 file/i)).toBeInTheDocument();
    });

    it('shows a parse error when the OFX cannot be understood', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        asMock(OFXParser.parse).mockReturnValue({ OFX: { SIGNONMSGSRSV1: { SONRS: {} } } }); // no BANK/CC section -> Utils throws
        await renderLoggedIn([acct('1', '1111-2222')]);
        await dropFile();
        expect(await screen.findByText(/format is not understood/i)).toBeInTheDocument();
    });
});

describe('App — account matching', () => {
    it('processes transactions when an account matches exactly', async () => {
        asMock(OFXParser.parse).mockReturnValue(rawOfx());
        await renderLoggedIn([acct('1', '1111-2222')]);
        await dropFile();
        // The single transaction is imported and the row renders it.
        expect(await screen.findByTestId('row-desc-0')).toHaveTextContent('Coffee Shop');
        await waitFor(() => expect(ApiService.addTransaction).toHaveBeenCalled());
        await waitFor(() => expect(screen.getByTestId('row-status-0')).toHaveTextContent('success'));
        // A successful row has no ff3Txn2Import, so "import anyway" is a no-op.
        const callsBefore = asMock(ApiService.addTransaction).mock.calls.length;
        fireEvent.click(screen.getByTestId('import-0'));
        await waitFor(() => expect(screen.getByTestId('row-status-0')).toHaveTextContent('success'));
        expect(asMock(ApiService.addTransaction).mock.calls.length).toBe(callsBefore);
    });

    it('flags ERROR_NO_ACCOUNT_NO when the file has no account number', async () => {
        asMock(OFXParser.parse).mockReturnValue(rawOfx({ acctId: '' }));
        await renderLoggedIn([acct('1', '1111-2222')]);
        await dropFile();
        expect(await screen.findByText(/does not include an account number/i)).toBeInTheDocument();
    });

    it('selects the only partially-matching account', async () => {
        asMock(OFXParser.parse).mockReturnValue(rawOfx({ acctId: '****1234' }));
        await renderLoggedIn([acct('1', '9999-1234')]);
        await dropFile();
        // Partial match of one -> straight to processing the transactions.
        await waitFor(() => expect(ApiService.addTransaction).toHaveBeenCalled());
    });

    it('asks the user to pick when multiple accounts partially match', async () => {
        asMock(OFXParser.parse).mockReturnValue(rawOfx({ acctId: '****1234' }));
        const a = acct('1', '9999-1234', 'Checking A');
        a.attributes.iban = 'DE89370400440532013000';
        a.attributes.bic = 'COBADEFFXXX';
        await renderLoggedIn([a, acct('2', '0000-1234', 'Checking B')]);
        await dropFile();
        expect(await screen.findByText(/Multiple matching accounts found/i)).toBeInTheDocument();
        expect(screen.getByText('Checking A')).toBeInTheDocument();
        // The IBAN/BIC sub-line renders for the account that has them.
        expect(screen.getByText(/DE89370400440532013000/)).toBeInTheDocument();
        // Picking one kicks off processing.
        fireEvent.click(screen.getAllByRole('button', { name: /Select/i })[0]);
        await waitFor(() => expect(ApiService.addTransaction).toHaveBeenCalled());
    });

    it('reports ERROR_NO_TRANSACTIONS when the matched account is empty', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        asMock(OFXParser.parse).mockReturnValue(rawOfx({ txns: [] }));
        await renderLoggedIn([acct('1', '1111-2222')]);
        await dropFile();
        expect(await screen.findByText(/does not contain any transactions/i)).toBeInTheDocument();
    });

    it('offers to create an account when nothing matches', async () => {
        asMock(OFXParser.parse).mockReturnValue(rawOfx({ acctId: '5555-6666' }));
        await renderLoggedIn([acct('1', '9999-1234')]);
        await dropFile();
        expect(await screen.findByText(/No matching account found/i)).toBeInTheDocument();
        expect(screen.getByText(/Could not find a matching account/i)).toBeInTheDocument();
    });
});

describe('App — create account', () => {
    it('creates an account and proceeds to import', async () => {
        asMock(OFXParser.parse).mockReturnValue(rawOfx({ acctId: '5555-6666', acctType: 'SAVINGS' }));
        asMock(ApiService.createAccount).mockResolvedValue(acct('77', '5555-6666', 'New Savings'));
        await renderLoggedIn([acct('1', '9999-1234')]);
        await dropFile();
        await screen.findByText(/No matching account found/i);
        // Edit the prefilled account form before submitting.
        fireEvent.blur(screen.getByLabelText('Account Name'), { target: { value: 'Renamed Savings' } });
        fireEvent.blur(screen.getByLabelText('Account Number'), { target: { value: '5555-6666' } });
        fireEvent.click(screen.getByRole('button', { name: /Add Account/i }));
        await waitFor(() => expect(ApiService.createAccount).toHaveBeenCalled());
    });

    it('shows an error when account creation fails', async () => {
        asMock(OFXParser.parse).mockReturnValue(rawOfx({ acctId: '5555-6666' }));
        asMock(ApiService.createAccount).mockResolvedValue(null);
        vi.spyOn(console, 'error').mockImplementation(() => {});
        await renderLoggedIn([acct('1', '9999-1234')]);
        await dropFile();
        fireEvent.click(await screen.findByRole('button', { name: /Add Account/i }));
        expect(await screen.findByText(/Could not create a new account/i)).toBeInTheDocument();
    });
});

describe('App — multi-account files', () => {
    it('renders the OFX summary and processes the next account on selection', async () => {
        asMock(OFXParser.parse).mockReturnValue(rawMultiAccount());
        await renderLoggedIn([acct('1', 'AAAA'), acct('2', 'BBBB')]);
        await dropFile();
        // First account (AAAA) matches and processes.
        await waitFor(() => expect(ApiService.addTransaction).toHaveBeenCalledTimes(1));
        // Once the first account is done, the next account chip is selectable.
        await screen.findByRole('button', { name: /Import another file/i });
        fireEvent.click(screen.getByText('BBBB'));
        await waitFor(() => expect(ApiService.addTransaction).toHaveBeenCalledTimes(2));
    });
});

describe('App — token bootstrap edge cases', () => {
    it('resets the token when the API returns unauthorized (null)', async () => {
        localStorage.setItem('token', JSON.stringify({ value: 'stored-token' }));
        asMock(ApiService.getAccounts).mockResolvedValue(null);
        render(<App />);
        await waitFor(() => expect(ApiService.reset).toHaveBeenCalled());
    });
});

describe('App — transaction outcomes', () => {
    it('marks a transaction failed when the API rejects it', async () => {
        asMock(OFXParser.parse).mockReturnValue(rawOfx());
        asMock(ApiService.addTransaction).mockResolvedValue({ message: 'Duplicate', errors: { description: ['dup'] } });
        await renderLoggedIn([acct('1', '1111-2222')]);
        await dropFile();
        await waitFor(() => expect(screen.getByTestId('row-status-0')).toHaveTextContent('failure'));
    });

    it('marks an amount-only match as MATCH_VALUE', async () => {
        asMock(OFXParser.parse).mockReturnValue(rawOfx());
        asMock(ApiService.getAccountTransactions).mockResolvedValue([
            ffTxn({ external_id: 'OTHER', internal_reference: null, source_id: '1', destination_id: 'X', description: 'Different', amount: '12.34' }),
        ]);
        await renderLoggedIn([acct('1', '1111-2222')]);
        await dropFile();
        await waitFor(() => expect(screen.getByTestId('row-status-0')).toHaveTextContent('match-value'));
    });
});

describe('App — matched transactions and add-anyways', () => {
    it('marks an exact match and lets the user import it anyway', async () => {
        asMock(OFXParser.parse).mockReturnValue(rawOfx());
        asMock(ApiService.getAccountTransactions).mockResolvedValue([ffTxn()]);
        await renderLoggedIn([acct('1', '1111-2222')]);
        await dropFile();
        await waitFor(() => expect(screen.getByTestId('row-status-0')).toHaveTextContent('match-exact'));
        // addTransaction was NOT called during processing (it was a match)
        expect(ApiService.addTransaction).not.toHaveBeenCalled();
        // Import anyway -> now it should call addTransaction
        fireEvent.click(screen.getByTestId('import-0'));
        await waitFor(() => expect(ApiService.addTransaction).toHaveBeenCalled());
        await waitFor(() => expect(screen.getByTestId('row-status-0')).toHaveTextContent('success'));
    });
});

describe('App — edit flow', () => {
    const setup = async () => {
        asMock(OFXParser.parse).mockReturnValue(rawOfx());
        await renderLoggedIn([acct('1', '1111-2222')]);
        await dropFile();
        await screen.findByTestId('row-0');
        await waitFor(() => expect(screen.getByTestId('row-status-0')).toHaveTextContent('success'));
    };

    it('loads editor metadata when an edit starts', async () => {
        await setup();
        fireEvent.click(screen.getByTestId('start-edit-0'));
        await waitFor(() => expect(ApiService.listCategories).toHaveBeenCalled());
        expect(ApiService.listAllAccounts).toHaveBeenCalled();
        expect(ApiService.listTags).toHaveBeenCalled();
    });

    it('applies a saved edit and merges new metadata', async () => {
        await setup();
        fireEvent.click(screen.getByTestId('start-edit-0'));
        await waitFor(() => expect(ApiService.listTags).toHaveBeenCalled());
        // Let the metadata Promise.all resolve and setEditorMetadata flush, so the
        // merge in handleEditSaved sees a populated `meta` object.
        await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
        h.savedPayload = {
            id: '1',
            attributes: {
                transactions: [
                    {
                        category_name: 'NewCat', category_id: 'c1',
                        budget_name: 'NewBud', budget_id: 'b1',
                        bill_name: 'NewBill', bill_id: 'bl1',
                        tags: ['newtag'],
                        source_name: 'NewSource', source_id: 's1', source_type: 'revenue',
                        destination_name: 'NewDest', destination_id: 'd1', destination_type: 'expense',
                    },
                ],
            },
        };
        await act(async () => {
            fireEvent.click(screen.getByTestId('saved-0'));
        });
        // Editing closed without error; status chip still present.
        expect(screen.getByTestId('row-status-0')).toBeInTheDocument();
    });

    it('marks a transaction deleted', async () => {
        await setup();
        await act(async () => {
            fireEvent.click(screen.getByTestId('deleted-0'));
        });
        await waitFor(() => expect(screen.getByTestId('row-status-0')).toHaveTextContent('deleted'));
    });

    it('cancels an edit without error', async () => {
        await setup();
        fireEvent.click(screen.getByTestId('start-edit-0'));
        fireEvent.click(screen.getByTestId('cancel-0'));
        expect(screen.getByTestId('row-0')).toBeInTheDocument();
    });

    it('does not refetch metadata on a second edit', async () => {
        await setup();
        fireEvent.click(screen.getByTestId('start-edit-0'));
        await waitFor(() => expect(ApiService.listTags).toHaveBeenCalledTimes(1));
        await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
        fireEvent.click(screen.getByTestId('cancel-0'));
        fireEvent.click(screen.getByTestId('start-edit-0'));
        // Metadata is cached — no second round of fetches.
        expect(ApiService.listTags).toHaveBeenCalledTimes(1);
    });
});

describe('App — import another file', () => {
    it('resets back to the drop zone after processing', async () => {
        asMock(OFXParser.parse).mockReturnValue(rawOfx());
        await renderLoggedIn([acct('1', '1111-2222')]);
        await dropFile();
        const another = await screen.findByRole('button', { name: /Import another file/i });
        fireEvent.click(another);
        // FileDrop is shown again.
        await waitFor(() => expect(screen.getByTestId('filedrop')).toBeInTheDocument());
    });
});
