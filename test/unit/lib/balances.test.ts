import { describe, it, expect } from 'vitest';
import { AccountRoleProperty } from '@billos/firefly-iii-sdk';
import { reconcileBalances } from '../../../src/lib/balances';

const asset = (current_balance?: string, virtual_balance?: string, account_role: AccountRoleProperty = AccountRoleProperty.DEFAULT_ASSET) =>
    ({ current_balance, virtual_balance, account_role });
const card = (current_balance: string, virtual_balance: string) => asset(current_balance, virtual_balance, AccountRoleProperty.CC_ASSET);

describe('reconcileBalances', () => {
    it('returns a zero difference when an ordinary account matches the bank', () => {
        expect(reconcileBalances(500, asset('500.00'))).toEqual({ bankBalance: 500, accountBalance: 500, diff: 0 });
    });

    it('returns bank minus account when they differ', () => {
        expect(reconcileBalances(500, asset('100.00')).diff).toBe(400);
    });

    it('treats 57.65999999 and 57.66 as the same amount', () => {
        expect(reconcileBalances(57.66, asset('57.65999999')).diff).toBe(0);
    });

    it('falls back to 0 when the account has no balances', () => {
        expect(reconcileBalances(0, asset(undefined, undefined))).toEqual({ bankBalance: 0, accountBalance: 0, diff: 0 });
    });

    // FireFly III adds the virtual balance (the credit limit) to the actual balance, so for a
    // 25000 limit with 5000 charged (actual -5000) its current_balance is 20000.
    describe('credit card with a virtual balance (25000 limit, 5000 charged)', () => {
        it('agrees when the bank reports 5000 owed, whichever sign the bank uses', () => {
            expect(reconcileBalances(-5000, card('20000', '25000'))).toEqual({ bankBalance: 20000, accountBalance: 20000, diff: 0 });
            expect(reconcileBalances(5000, card('20000', '25000'))).toEqual({ bankBalance: 20000, accountBalance: 20000, diff: 0 });
        });

        it('reports the gap when FireFly has different charges than the bank', () => {
            // FireFly has only 4000 charged (current_balance 21000) while the bank says 5000
            expect(reconcileBalances(-5000, card('21000', '25000'))).toEqual({ bankBalance: 20000, accountBalance: 21000, diff: -1000 });
            // FireFly has 6000 charged (current_balance 19000)
            expect(reconcileBalances(-5000, card('19000', '25000')).diff).toBe(1000);
        });

        it('agrees for any credit limit as long as the real charges agree', () => {
            expect(reconcileBalances(-5000, card('-4000', '1000')).diff).toBe(0);
            expect(reconcileBalances(-5000, card('95000', '100000')).diff).toBe(0);
        });
    });

    it('leaves a credit card without a virtual balance unadjusted', () => {
        expect(reconcileBalances(-250, card('-250.00', '0'))).toEqual({ bankBalance: -250, accountBalance: -250, diff: 0 });
    });

    it('ignores the virtual balance on accounts that are not credit cards', () => {
        expect(reconcileBalances(500, asset('500.00', '25000'))).toEqual({ bankBalance: 500, accountBalance: 500, diff: 0 });
    });
});
