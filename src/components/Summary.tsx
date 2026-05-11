import { Alert, Box, Card, CardContent, LinearProgress, Stack, Typography } from "@mui/material";
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import SavingsIcon from '@mui/icons-material/Savings';
import { useEffect, useState } from "react";
import { FF3Account, FF3AccountRole, FF3Wrapper } from "@/lib/interfaces";
import ApiService from "@/lib/apiService";
import utils from "@/lib/utils";
import { tokens } from '@/theme';

interface SummaryProps {
    bankBalance: number;
    accountId?: string;
    processed: boolean;
    progress: number;

}

const balanceCardSx = {
    flex: 1,
    textAlign: 'center',
    backgroundColor: tokens.bgSunken,
    border: '1px solid',
    borderColor: 'divider',
    borderRadius: 2,
    p: 2,
};

const Summary = (props: SummaryProps) => {

    const [account, setAccount] = useState<FF3Wrapper<FF3Account> | null>(null);
    const [accountBalance, setAccountBalance] = useState(0);
    const [bankBalance, setBankBalance] = useState(0);
    const [diff, setDiff] = useState<number>(props.bankBalance);

    useEffect(() => {
        async function getAccount() {
            const theAccount = await ApiService.getAccount(props.accountId || '0');
            // Using progress here as a bogus trigger to update the account balance
            if (theAccount && props.progress >= 0) {
                // console.log('Summary view refreshing...');
                const virtualBalance = parseFloat(theAccount.attributes.virtual_balance ?? '0');
                // console.log('virtualBalance', virtualBalance);

                let bBalance = props.bankBalance;
                let aBalance = parseFloat(theAccount.attributes.current_balance ?? '0');

                // console.log('bank Balance', bBalance);
                // console.log('account Balance', aBalance);
                // If the account has a virtual balance, then take that into account
                // NOTE: these balances are sometimes positive and sometimes negative for credit cards so they are hard to handle.
                if (theAccount.attributes.account_role === FF3AccountRole.CREDIT_CARD_ASSET &&virtualBalance !== 0) {
                    bBalance = virtualBalance + -1 * Math.abs(bBalance);
                    aBalance = virtualBalance + -1 * Math.abs(aBalance);
                }
                const balance = parseFloat(parseFloat(''+aBalance).toFixed(2));
                const balanceDiff = parseFloat((bankBalance - aBalance).toFixed(2));

                // Only update the account once.
                if (!account) {
                    setAccount(theAccount);
                }
                setAccountBalance(balance);
                setDiff(balanceDiff);
                setBankBalance(bBalance);
            }
        }

        getAccount();

    },[account, bankBalance, props.accountId, props.bankBalance, props.progress]);


    return (
        <Box sx={{ width: 960 }} pb={2}>
            {props.bankBalance !== accountBalance && (
                <Alert severity="warning" sx={{ mb: 1 }}>
                    The bank balance does not match your account balance. Look for transactions that may
                    have been matched but need to be added anyways.
                </Alert>
            )}
            <Card variant="outlined">
                <CardContent>
                    <Typography sx={{ fontSize: '13px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'primary.light', mb: 2, textAlign: 'center' }}>
                        {(account as unknown as FF3Wrapper<FF3Account>)?.attributes.name}
                        {' — '}
                        {(account as unknown as FF3Wrapper<FF3Account>)?.attributes.account_number}
                    </Typography>

                    <Stack direction="row" alignItems="center" spacing={2}>
                        {/* Bank balance */}
                        <Box sx={balanceCardSx}>
                            <Stack direction="row" alignItems="center" justifyContent="center" spacing={0.5} mb={0.5}>
                                <AccountBalanceIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                                <Typography variant="overline" sx={{ color: 'text.secondary', lineHeight: 1 }}>Bank Balance</Typography>
                            </Stack>
                            <Typography variant="h5">{utils.getLocaleCurrency(bankBalance)}</Typography>
                            <Typography variant="caption" sx={{ color: tokens.textMuted, display: 'block', mt: '4px' }}>as of OFX file</Typography>
                        </Box>

                        {/* Center: progress or diff */}
                        {!props.processed && (
                            <Box sx={{ flex: 1, textAlign: 'center' }}>
                                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1, textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                                    Importing…
                                </Typography>
                                <LinearProgress variant="determinate" value={props.progress} />
                                <Typography variant="caption" sx={{ color: 'text.secondary', mt: 0.5, display: 'block', textAlign: 'right' }}>
                                    {Math.round(props.progress)}%
                                </Typography>
                            </Box>
                        )}
                        {props.processed && (
                            <Box sx={{ flex: 1, textAlign: 'center' }}>
                                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: '4px', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                                    Difference
                                </Typography>
                                <Typography variant="h4" sx={{ color: diff !== 0 ? 'error.main' : 'success.main' }}>
                                    {utils.getLocaleCurrency(diff)}
                                </Typography>
                            </Box>
                        )}

                        {/* Firefly balance */}
                        <Box sx={balanceCardSx}>
                            <Stack direction="row" alignItems="center" justifyContent="center" spacing={0.5} mb={0.5}>
                                <SavingsIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                                <Typography variant="overline" sx={{ color: 'text.secondary', lineHeight: 1 }}>Firefly Balance</Typography>
                            </Stack>
                            <Typography variant="h5">{utils.getLocaleCurrency(accountBalance)}</Typography>
                            <Typography variant="caption" sx={{ color: tokens.textMuted, display: 'block', mt: '4px' }}>current account balance</Typography>
                        </Box>
                    </Stack>
                </CardContent>
            </Card>
        </Box>
    );
};

export default Summary;
