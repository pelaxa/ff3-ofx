import { AccountRoleProperty, type AccountRead } from '@billos/firefly-iii-sdk';
import type { BalanceSummary } from '@/lib/interfaces';

/**
 * Rounds to 2 decimals so values such as 57.65999999 compare equal to 57.66
 * @param value The number to round
 * @returns The value rounded to 2 decimal places
 */
const round2 = (value: number): number => parseFloat(value.toFixed(2));

/**
 * Compare the balance the bank reports with the balance FireFly III holds for the account.
 *
 * A credit card in FireFly III can carry a virtual balance, which is its credit limit. FireFly III
 * always adds the virtual balance to the actual balance, so its current_balance is the available
 * credit: with a 25000 limit and 5000 charged (actual balance -5000) it reports 20000.
 * The bank file reports the amount owed (5000, with a sign that differs between banks), so for
 * a card with a virtual balance we turn it into the same available-credit figure: the virtual
 * balance minus the size of the amount owed. The account's current_balance is used as it is.
 *
 * @param bankBalance The balance from the OFX file
 * @param account The FireFly III account attributes: current_balance, virtual_balance and account_role are read
 * @returns The (possibly adjusted) bank balance, the account balance and their difference
 */
export const reconcileBalances = (
    bankBalance: number,
    account: Pick<AccountRead['attributes'], 'current_balance' | 'virtual_balance' | 'account_role'>,
): BalanceSummary => {
    const virtualBalance = parseFloat(account.virtual_balance ?? '0');
    // console.log('virtualBalance', virtualBalance);

    let bBalance = bankBalance;
    const aBalance = parseFloat(account.current_balance ?? '0');

    // console.log('bank Balance', bBalance);
    // console.log('account Balance', aBalance);
    // If the account has a virtual balance, then take that into account. current_balance already includes it,
    // so only the bank side needs adjusting.
    // NOTE: these balances are sometimes positive and sometimes negative for credit cards so they are hard to handle.
    if (account.account_role === AccountRoleProperty.CC_ASSET && virtualBalance !== 0) {
        bBalance = virtualBalance + -1 * Math.abs(bBalance);
    }

    return {
        bankBalance: round2(bBalance),
        accountBalance: round2(aBalance),
        diff: round2(bBalance - aBalance),
    };
};
