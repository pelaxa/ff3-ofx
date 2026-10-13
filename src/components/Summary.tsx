import { Alert, Box, Card, CardContent, LinearProgress, Stack, Typography } from "@mui/material";
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import SavingsIcon from '@mui/icons-material/Savings';
import { useEffect, useState } from "react";
import { type AccountRead } from "@billos/firefly-iii-sdk";
import ApiService from "@/lib/apiService";
import utils from "@/lib/utils";
import { reconcileBalances } from "@/lib/balances";
import type { BalanceSummary } from "@/lib/interfaces";
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

    const [account, setAccount] = useState<AccountRead | null>(null);
    const [balances, setBalances] = useState<BalanceSummary>({ bankBalance: 0, accountBalance: 0, diff: props.bankBalance });

    // FireFly III updates the account balance every time a transaction is added, edited or deleted,
    // so fetch the account again each time `progress` changes to keep the balance current.
    useEffect(() => {
        // Set when this run is replaced by a newer one, so a slow older response cannot overwrite newer numbers
        let cancelled = false;
        /**
         * Fetch the FireFly account and work out the balances to show from it.
         * Uses props.accountId and props.bankBalance; does nothing if this run was replaced by a newer one.
         */
        async function getAccount() {
            const theAccount = await ApiService.getAccount(props.accountId || '0');
            if (cancelled) return;
            if (theAccount) {
                // console.log('Summary view refreshing...');
                setAccount(theAccount);
                setBalances(reconcileBalances(props.bankBalance, theAccount.attributes));
            }
        }

        getAccount();

        return () => { cancelled = true; };
    }, [props.accountId, props.bankBalance, props.progress]);


    return (
        <Box className="scrollView" sx={{ pb: 2 }}>
            {balances.diff !== 0 && (
                <Alert severity="warning" sx={{ mb: 1 }}>
                    The bank balance does not match your account balance. Look for transactions that may
                    have been matched but need to be added anyways.
                </Alert>
            )}
            <Card variant="outlined">
                <CardContent>
                    <Typography sx={{ fontSize: '13px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'primary.light', mb: 2, textAlign: 'center' }}>
                        {account?.attributes.name}
                        {' — '}
                        {account?.attributes.account_number}
                    </Typography>

                    <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
                        {/* Bank balance */}
                        <Box sx={balanceCardSx}>
                            <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', justifyContent: 'center', mb: 0.5 }}>
                                <AccountBalanceIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                                <Typography variant="overline" sx={{ color: 'text.secondary', lineHeight: 1 }}>Bank Balance</Typography>
                            </Stack>
                            <Typography variant="h5">{utils.getLocaleCurrency(balances.bankBalance)}</Typography>
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
                                <Typography variant="h4" sx={{ color: balances.diff !== 0 ? 'error.main' : 'success.main' }}>
                                    {utils.getLocaleCurrency(balances.diff)}
                                </Typography>
                            </Box>
                        )}

                        {/* Firefly balance */}
                        <Box sx={balanceCardSx}>
                            <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', justifyContent: 'center', mb: 0.5 }}>
                                <SavingsIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                                <Typography variant="overline" sx={{ color: 'text.secondary', lineHeight: 1 }}>Firefly Balance</Typography>
                            </Stack>
                            <Typography variant="h5">{utils.getLocaleCurrency(balances.accountBalance)}</Typography>
                            <Typography variant="caption" sx={{ color: tokens.textMuted, display: 'block', mt: '4px' }}>current account balance</Typography>
                        </Box>
                    </Stack>
                </CardContent>
            </Card>
        </Box>
    );
};

export default Summary;
