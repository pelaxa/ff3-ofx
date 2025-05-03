import { Moment } from 'moment';


export interface IntuitBankInfo {
    id1: string;
    id2: string;
    id3: string;
    name: string;
}
export interface OfxTransaction {
    TRNTYPE: string;
    DTPOSTED: string;
    TRNAMT: string;
    FITID: string;
    NAME: string;
    MEMO: string;
}

export interface OfxData {
    accountNumber?: string;
    accountType?: string;
    org?: string;
    intuitId?: string;
    balance?: number;
    balanceDate?: Moment;
    startDate?: Moment;
    endDate?: Moment;
    currency?: string;
    transactions?: (OfxParsedTransaction | null)[];
}

export interface OfxParsedTransaction {
    transactionType: string;
    datePosted: Moment;
    amount: number;
    transactionId: string;
    description: string;
    memo: string;
    importStatus?: {
        status: 'success'|'failure'|'match-exact'|'match-value';
        statusMessage?: string;
        statusError?: {[key: string]: string[]};
        matchingTransactions?: FF3Wrapper<FF3Transaction>[];
        ff3Txn?: FF3AddTransactionWrapper<FF3TransactionSplit>;
    }
}

export enum FF3TransactionType {
    WITHDRAWAL = 'withdrawal',
    DEPOSIT = 'deposit',
    TRANSFER = 'transfer',
    RECONCILIATION = 'reconciliation',
    OPENING_BALANCE = 'opening balance'
}

export enum FF3AccountType {
    DEFAULT_ACCOUNT = 'Default account', 
    CASH_ACCOUNT = 'Cash account', 
    ASSET_ACCOUNT = 'Asset account', 
    EXPENSE_ACCOUNT = 'Expense account', 
    REVENUE_ACCOUNT = 'Revenue account', 
    INITIAL_BALANCE_ACCOUNT = 'Initial balance account', 
    BENEFICIARY_ACCOUNT = 'Beneficiary account', 
    IMPORT_ACCOUNT = 'Import account', 
    RECONCILIATION_ACCOUNT = 'Reconciliation account', 
    LOAN = 'Loan', 
    DEBT = 'Debt', 
    MORTGAGE = 'Mortgage'
}

export enum FF3ShortAccountType {
    TYPE_ASSET = 'asset', 
    TYPE_EXPENSE = 'expense', 
    TYPE_IMPORT = 'import', 
    TYPE_REVENUE = 'revenue', 
    TYPE_CASH = 'cash',
    TYPE_LIABILITY = 'liability',
    TYPE_LIABILITIES = 'liabilities',
    TYPE_INITIAL_BALANCE = 'initial-balance', 
    TYPE_RECONCILIATION = 'reconciliation', 
}

export enum FF3AccountRole {
    DEFAULT_ASSET = 'defaultAsset', 
    SHARED_ASSET = 'sharedAsset', 
    SAVING_ASSET = 'savingAsset', 
    CREDIT_CARD_ASSET = 'ccAsset', 
    CASH_WALLET_ASSET = 'cashWalletAsset'
}

export enum FF3CreditCardType {
    MONTHLY_FULL = 'monthlyFull', 
}

export enum FF3LiabilityType {
    LOAN = 'loan',
    DEBT = 'debt',
    MORTGAGE = 'mortgage',
}

export enum FF3InterestPeriod {
    WEEKLY = 'weekly',
    MONTHLY = 'monthly',
    QUARTERLY = 'quarterly',
    HALF_YEAR = 'half-year',
    YEARLY = 'yearly',
}

export interface FF3Error {
    message: string;
    errors: {
        [key: string]: string[]
    }
}

export interface FF3Account {
    name: string;
    type: FF3ShortAccountType;
    iban?: string;
    bic?: string;
    account_number?: string;
    opening_balance?: string;
    opening_balance_date?: string;
    virtual_balance?: string;
    currency_id?: string;
    currency_code?: string;
    currency_symbol?: string;
    currency_decimal_places?: number;
    current_balance?: string;
    current_balance_date?: string;
    current_debt?: string;
    active?: boolean;
    order?: number;
    include_net_worth?: boolean;
    account_role?: FF3AccountRole;
    credit_card_type?: FF3CreditCardType;
    monthly_payment_date?: string;
    liability_type?: FF3LiabilityType;
    liability_direction?: string;
    interest?: string;
    interest_period?: FF3InterestPeriod;
    notes?: string;
    latitude?: number;
    longitude?: number;
    zoom_level?: number;
    created_at?: string;
    updated_at?: string;
}

export interface FF3TransactionSplit {
    user?: string;
    transaction_journal_id?: string;
    type: FF3TransactionType;
    date: string;
    order?: number,
    currency_id?: string,
    currency_code?: string;
    currency_symbol?: string;
    currency_name?: string;
    currency_decimal_places?: number;
    foreign_currency_id?: string,
    foreign_currency_code?: string;
    foreign_currency_symbol?: string;
    foreign_currency_name?: string;
    foreign_currency_decimal_places?: number;
    amount: string;
    foreign_amount?: string;
    description: string;
    source_id?: string;
    source_name?: string;
    source_iban?: string;
    source_type?: FF3AccountType;
    destination_id?: string;
    destination_name?: string;
    destination_iban?: string;
    destination_type?: FF3AccountType;
    budget_id?: string;
    budget_name?: string;
    category_id?: string;
    category_name?: string;
    bill_id?: string;
    bill_name?: string;
    reconciled?: boolean;
    notes?: string;
    tags?: string[];
    internal_reference?: string;
    external_id?: string;
    external_url?: string;
    recurrence_id?: number;
    recurrence_total?: number;
    recurrence_count?: number;
    bunq_payment_id?: string;
    import_hash_v2?: string;
    sepa_cc?: string;
    sepa_ct_op?: string;
    sepa_ct_id?: string;
    sepa_db?: string;
    sepa_country?: string;
    sepa_ep?: string;
    sepa_ci?: string;
    sepa_batch_id?: string;
    interest_date?: string;
    book_date?: string;
    process_date?: string;
    due_date?: string;
    payment_date?: string;
    invoice_date?: string;
    latitude?: number;
    longitude?: number;
    zoom_level?: number;
    has_attachments?: boolean;
}

export interface FF3Transaction {
    created_at?: string;
    updated_at?: string;
    user?: string;
    group_title?: string;
    transactions: FF3TransactionSplit[];
}

export interface FF3Wrapper<FF3Object = FF3Transaction | FF3Account> {
    type: string;
    id: string;
    attributes: FF3Object;
    totalMatch?: boolean;
}

export interface FF3AddTransactionWrapper<FF3TransactionSplit> {
    error_if_duplicate_hash: true;
    apply_rules: true;
    group_title: null;
    transactions: FF3TransactionSplit[];
}

export interface FF3NewAccount {
    name: string;
    number: string;
    role?: FF3AccountRole,
    institution?: string,
    bank?: string,
    currency?: string,
    credit_card_type?: string,
    monthly_payment_date?: string,
    type?: string
}