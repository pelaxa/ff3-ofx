import { Moment } from 'moment';
import type {
    AccountRead,
    AccountRoleProperty,
    BillRead,
    BudgetRead,
    CategoryRead,
    TransactionRead,
    TransactionStoreWritable,
} from '@billos/firefly-iii-sdk';
import type ApiService from '@/lib/apiService';

export interface OfxTransaction {
    TRNTYPE: string;
    DTPOSTED: string;
    TRNAMT: string;
    FITID: string;
    NAME: string;
    MEMO: string;
}

export enum OfxAccountStatus {
    PROCESSED = 'processed',
    PROCESSING = 'processing',
    UNPROCESSED = 'unprocessed',
}

export enum OfxImportStatus {
    SUCCESS = 'success',
    FAILURE = 'failure',
    MATCH_EXACT = 'match-exact',
    MATCH_VALUE = 'match-value',
    DELETED = 'deleted'
}

export interface OfxAccount {
    accountNumber?: string;
    accountType?: string;
    balance?: number;
    balanceDate?: Moment;
    startDate?: Moment;
    endDate?: Moment;
    currency?: string;
    transactions?: (OfxParsedTransaction | null)[];
    status: OfxAccountStatus;
}

export interface OfxData {
    org?: string;
    intuitId?: string;
    accounts: OfxAccount[];
}

// Local extension of the SDK's TransactionRead so we can flag "this match was a
// running-total match across split transactions" for display purposes.
export type MatchedTransaction = TransactionRead & { totalMatch?: boolean };

export interface OfxParsedSubTransaction {
    transactionType: string;
    datePosted: Moment;
    amount: number;
    transactionId: string;
    description: string;
    memo: string;
}
export interface OfxParsedTransaction {
    title: string | null;
    transactions: OfxParsedSubTransaction[]
    importStatus?: {
        status: OfxImportStatus;
        statusMessage?: string;
        statusError?: { [key: string]: string[] | undefined };
        matchingTransactions?: MatchedTransaction[];
        // This is the ff3 transaction that is created to add the transaction
        ff3Txn2Import?: TransactionStoreWritable;
        // // This is the ff3 transaction after it was added
        ff3TxnImported?: TransactionRead;
        // Flipped to true after a successful edit so the row can show
        // an "edited" indicator next to its status chip.
        edited?: boolean;
    };
}

export interface FF3NewAccount {
    name: string;
    number: string;
    role?: AccountRoleProperty;
    institution?: string;
    bank?: string;
    currency?: string;
    credit_card_type?: string;
    monthly_payment_date?: string;
    type?: string;
}

// The numbers the summary shows, all rounded to 2 decimals
export interface BalanceSummary {
    // The balance from the OFX file (adjusted for a virtual balance on credit cards)
    bankBalance: number;
    // The balance FireFly III holds for the account (adjusted the same way)
    accountBalance: number;
    // bankBalance - accountBalance. 0 means the bank and FireFly agree.
    diff: number;
}

// The personal access token used to talk to FireFly III
export interface Token {
    value: string;
}

// Where a remembered token is kept between visits. The app keeps it in the browser's localStorage.
export interface TokenStore {
    // Returns the remembered token, or undefined when nothing usable is stored
    load: () => Token | undefined;
    // Remembers the given token for next time
    save: (token: Token) => void;
    // Forgets the remembered token
    clear: () => void;
}

// Lazy-loaded metadata for the autocomplete fields in the editor
export interface EditorMetadata {
    accounts: AccountRead[];
    categories: CategoryRead[];
    budgets: BudgetRead[];
    bills: BillRead[];
    tags: string[];
}

// The Firefly calls an import depends on: reading the account's existing transactions
// and storing a new one. Functions receive these as a parameter instead of calling
// ApiService directly, so the matching logic works with any source of transactions.
export type ImportStore = Pick<typeof ApiService, 'getAccountTransactions' | 'addTransaction'>;

// The fields the Transactions tab search can filter on
export type SearchField = 'description' | 'category' | 'tag' | 'notes' | 'amount';

// How an amount filter compares: exactly the value, more than it, or less than it
export type AmountComparison = 'is' | 'more' | 'less';

// One search filter, shown as a chip in the search box
export interface SearchFilter {
    field: SearchField;
    // Only set for the amount field
    comparison?: AmountComparison;
    // What to look for. For category and tag this is the exact name picked from FireFly III
    value: string;
}

// One entry in the menu of fields offered when the search box is focused
export interface SearchFieldOption {
    field: SearchField;
    label: string;
}
