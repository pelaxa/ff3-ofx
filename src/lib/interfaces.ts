import { Moment } from 'moment';
import type {
    AccountRoleProperty,
    TransactionRead,
    TransactionStoreWritable,
} from '@billos/firefly-iii-sdk';

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

export enum OfxAccountStatus {
    PROCESSED = 'processed',
    PROCESSING = 'processing',
    UNPROCESSED = 'unprocessed',
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

export interface OfxParsedTransaction {
    transactionType: string;
    datePosted: Moment;
    amount: number;
    transactionId: string;
    description: string;
    memo: string;
    importStatus?: {
        status: 'success' | 'failure' | 'match-exact' | 'match-value';
        statusMessage?: string;
        statusError?: { [key: string]: string[] | undefined };
        matchingTransactions?: MatchedTransaction[];
        ff3Txn?: TransactionStoreWritable;
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
