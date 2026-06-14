import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import moment from 'moment';
import Utils from '../../../src/lib/utils';
import { OfxAccountStatus } from '../../../src/lib/interfaces';

// Realistic shape of one OFX statement transaction node (as the parser returns it).
const txnNode = (overrides: Partial<Record<string, string>> = {}) => ({
    TRNTYPE: 'DEBIT',
    DTPOSTED: '20240115120000',
    TRNAMT: '-12.34',
    FITID: 'FIT-1',
    NAME: 'Coffee Shop',
    MEMO: 'morning latte',
    ...overrides,
});

const bankAccount = (txns: ReturnType<typeof txnNode>[] | ReturnType<typeof txnNode> | null) => ({
    STMTRS: {
        CURDEF: 'USD',
        BANKACCTFROM: { ACCTID: '1111-2222', ACCTTYPE: 'CHECKING' },
        BANKTRANLIST: {
            DTSTART: '20240101000000',
            DTEND: '20240131000000',
            STMTTRN: txns,
        },
        LEDGERBAL: { BALAMT: '1000.00', DTASOF: '20240131000000' },
    },
});

const ccAccount = (txns: ReturnType<typeof txnNode>[]) => ({
    CCSTMTRS: {
        CURDEF: 'CAD',
        CCACCTFROM: { ACCTID: '****1234' },
        BANKTRANLIST: {
            DTSTART: '20240101000000',
            DTEND: '20240131000000',
            STMTTRN: txns,
        },
        LEDGERBAL: { BALAMT: '-250.00', DTASOF: '20240131000000' },
    },
});

describe('Utils.ofxDateToFF3', () => {
    it('parses an OFX YYYYMMDDHHmmss string into a moment', () => {
        const m = Utils.ofxDateToFF3('20240115093000');
        expect(moment.isMoment(m)).toBe(true);
        expect(m.year()).toBe(2024);
        expect(m.month()).toBe(0); // Jan
        expect(m.date()).toBe(15);
        expect(m.hour()).toBe(9);
        expect(m.minute()).toBe(30);
    });
});

describe('Utils.parseOfxTransaction', () => {
    it('maps OFX fields onto OfxParsedTransaction', () => {
        const parsed = Utils.parseOfxTransaction(txnNode());
        expect(parsed).not.toBeNull();
        expect(parsed!.transactionId).toBe('FIT-1');
        expect(parsed!.transactionType).toBe('DEBIT');
        expect(parsed!.amount).toBe(-12.34);
        expect(parsed!.description).toBe('Coffee Shop');
        expect(parsed!.memo).toBe('morning latte');
        expect(moment.isMoment(parsed!.datePosted)).toBe(true);
    });

    it('returns null for a falsy txn', () => {
        // @ts-expect-error — intentionally testing the guard
        expect(Utils.parseOfxTransaction(undefined)).toBeNull();
    });
});

describe('Utils.getLocaleCurrency', () => {
    it('formats with two fractional digits', () => {
        // Don't assert exact locale punctuation (varies in jsdom), just digits/decimal
        const out = Utils.getLocaleCurrency(1234.5);
        expect(out).toMatch(/1[.,]?234[.,]50/);
    });

    it('keeps two fractional digits for whole numbers', () => {
        expect(Utils.getLocaleCurrency(7)).toMatch(/7[.,]00/);
    });
});

describe('Utils.getOfxData (bank/checking)', () => {
    it('parses a single STMTRS account with multiple transactions', () => {
        const raw = {
            OFX: {
                SIGNONMSGSRSV1: { SONRS: { FI: { ORG: 'TESTBANK' }, INTUBID: '12345' } },
                BANKMSGSRSV1: { STMTTRNRS: bankAccount([txnNode(), txnNode({ FITID: 'FIT-2', TRNAMT: '50.00' })]) },
            },
        };
        const result = Utils.getOfxData(raw);
        expect(result.org).toBe('TESTBANK');
        expect(result.intuitId).toBe('12345');
        expect(result.accounts).toHaveLength(1);
        const acc = result.accounts[0];
        expect(acc.accountNumber).toBe('1111-2222');
        expect(acc.accountType).toBe('CHECKING');
        expect(acc.currency).toBe('USD');
        expect(acc.status).toBe(OfxAccountStatus.UNPROCESSED);
        expect(acc.transactions).toHaveLength(2);
        expect(acc.transactions![0]!.transactionId).toBe('FIT-1');
        expect(acc.transactions![1]!.amount).toBe(50);
    });

    it('wraps a single-transaction object into an array', () => {
        const raw = {
            OFX: {
                SIGNONMSGSRSV1: { SONRS: {} },
                BANKMSGSRSV1: { STMTTRNRS: bankAccount(txnNode()) },
            },
        };
        const result = Utils.getOfxData(raw);
        expect(result.accounts[0].transactions).toHaveLength(1);
    });

    it('handles null STMTTRN by producing an empty transactions array', () => {
        const raw = {
            OFX: {
                SIGNONMSGSRSV1: { SONRS: {} },
                BANKMSGSRSV1: { STMTTRNRS: bankAccount(null) },
            },
        };
        const result = Utils.getOfxData(raw);
        expect(result.accounts[0].transactions).toEqual([]);
    });

    it('defaults currency to EUR when CURDEF is missing', () => {
        const acc = bankAccount([txnNode()]);
        acc.STMTRS.CURDEF = '';
        const raw = {
            OFX: {
                SIGNONMSGSRSV1: { SONRS: {} },
                BANKMSGSRSV1: { STMTTRNRS: acc },
            },
        };
        expect(Utils.getOfxData(raw).accounts[0].currency).toBe('EUR');
    });

    it('parses multiple bank accounts when STMTTRNRS is an array', () => {
        const acc2 = bankAccount([txnNode({ FITID: 'F-A' })]);
        acc2.STMTRS.BANKACCTFROM.ACCTID = '9999';
        const raw = {
            OFX: {
                SIGNONMSGSRSV1: { SONRS: {} },
                BANKMSGSRSV1: { STMTTRNRS: [bankAccount([txnNode()]), acc2] },
            },
        };
        const result = Utils.getOfxData(raw);
        expect(result.accounts).toHaveLength(2);
        expect(result.accounts[0].accountNumber).toBe('1111-2222');
        expect(result.accounts[1].accountNumber).toBe('9999');
    });

    it('survives a missing SIGNONMSGSRSV1.FI/ORG without throwing', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const raw = {
            OFX: {
                SIGNONMSGSRSV1: {},
                BANKMSGSRSV1: { STMTTRNRS: bankAccount([txnNode()]) },
            },
        };
        const result = Utils.getOfxData(raw);
        expect(result.org).toBeUndefined();
        expect(result.accounts).toHaveLength(1);
        warn.mockRestore();
    });
});

describe('Utils.getOfxData (credit card)', () => {
    it('parses a CCSTMTRS account', () => {
        const raw = {
            OFX: {
                SIGNONMSGSRSV1: { SONRS: { FI: { ORG: 'CCBANK' } } },
                CREDITCARDMSGSRSV1: { CCSTMTTRNRS: ccAccount([txnNode()]) },
            },
        };
        const result = Utils.getOfxData(raw);
        expect(result.accounts).toHaveLength(1);
        const acc = result.accounts[0];
        expect(acc.accountType).toBe('CREDITCARD');
        expect(acc.accountNumber).toBe('****1234');
        expect(acc.currency).toBe('CAD');
        expect(acc.balance).toBe('-250.00');
    });

    it('parses multiple credit card accounts when CCSTMTTRNRS is an array', () => {
        const acc2 = ccAccount([txnNode()]);
        acc2.CCSTMTRS.CCACCTFROM.ACCTID = '****5678';
        const raw = {
            OFX: {
                SIGNONMSGSRSV1: { SONRS: {} },
                CREDITCARDMSGSRSV1: { CCSTMTTRNRS: [ccAccount([txnNode()]), acc2] },
            },
        };
        const result = Utils.getOfxData(raw);
        expect(result.accounts.map((a) => a.accountNumber)).toEqual(['****1234', '****5678']);
    });
});

describe('Utils.getOfxData (errors)', () => {
    let errSpy: ReturnType<typeof vi.spyOn>;
    beforeEach(() => { errSpy = vi.spyOn(console, 'error').mockImplementation(() => {}); });
    afterEach(() => { errSpy.mockRestore(); });

    it('throws when neither BANKMSGSRSV1 nor CREDITCARDMSGSRSV1 is present', () => {
        const raw = { OFX: { SIGNONMSGSRSV1: { SONRS: {} } } };
        expect(() => Utils.getOfxData(raw)).toThrow('Error parsing OFX file');
    });

    it('throws when the structure inside is malformed', () => {
        const raw = {
            OFX: {
                SIGNONMSGSRSV1: { SONRS: {} },
                // missing STMTTRNRS — accessing .STMTRS will throw inside processAccount
                BANKMSGSRSV1: {},
            },
        };
        expect(() => Utils.getOfxData(raw)).toThrow();
    });
});
