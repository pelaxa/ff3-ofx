import { Alert, Box, Card, CardContent, Fab, LinearProgress, Stack, Tooltip, Typography } from "@mui/material";
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import SavingsIcon from '@mui/icons-material/Savings';
import React, { useEffect, useState } from "react";
import { FF3Account, FF3Wrapper } from "lib/interfaces";
import ApiService from "lib/apiService";
import utils from "lib/utils";

interface SummaryProps {
    bankBalance: number;
    accountId?: string;
    processed: boolean;
    progress: number;

}

const Summary = (props: SummaryProps) => {

    const [account, setAccount] = useState<FF3Wrapper<FF3Account> | null>(null);
    const [accountBalance, setAccountBalance] = useState(0);
    const [diff, setDiff] = useState<number>(props.bankBalance);
    
    useEffect(() => {
        async function getAccount() {
            const theAccount = await ApiService.getAccount(props.accountId || '0');
            // Using progress here as a bogus trigger to update the account balance
            if (theAccount && props.progress >= 0) {
                console.log('Summary view refreshing...');
        
                const balance = parseFloat(parseFloat(''+theAccount.attributes.current_balance).toFixed(2));
                const balanceDiff = parseFloat((props.bankBalance - balance).toFixed(2));

                // Only update the account once.
                if (!account) {
                    setAccount(theAccount);
                }
                setAccountBalance(balance);
                setDiff(balanceDiff);
            }
        }

        getAccount();
        
    },[account, props.accountId, props.bankBalance, props.progress]);
    

    return (
        <Box sx={{ minWidth: 900, maxWidth: '60%' }} pb={2}>
            {props.bankBalance !== accountBalance && (
                <Alert severity="warning">
                    The bank balance does not match your account balance. Look for transactions that may
                    have been matched but need to be added anyways.
                </Alert>
            )}
            <Card variant="outlined">
                <CardContent>
                    <Typography variant="h3" gutterBottom component="div">
                        {(account as unknown as FF3Wrapper<FF3Account>)?.attributes.name} ({(account as unknown as FF3Wrapper<FF3Account>)?.attributes.account_number})
                    </Typography>
                    <Stack direction="row" justifyContent="space-between">
                        <Tooltip title="Bank Balance">
                            <Fab variant="extended">
                                <Stack direction={"row"}>
                                    <AccountBalanceIcon />
                                    <Typography variant="overline">Bank</Typography>
                                </Stack>
                                <Typography variant="h5" pl={2} component="div"> {utils.getLocaleCurrency(props.bankBalance)}</Typography>
                            </Fab>
                        </Tooltip>
                        {!props.processed && (
                            <Box sx={{ minWidth: 150, mr: 1, alignSelf: 'center' }}>
                                <LinearProgress variant="determinate" value={props.progress} />
                            </Box>
                        )}
                        {props.processed && (
                            <Stack direction={"column"}>
                                <Typography
                                    variant="h4"
                                    sx={{ color: `${props.bankBalance !== accountBalance ? '#f00' : '#090'}` }}
                                    gutterBottom
                                    component="div">
                                    {utils.getLocaleCurrency(diff)}
                                </Typography>
                                <Typography
                                variant="caption" component="div">Difference</Typography>
                            </Stack>
                        )}
                        <Tooltip title="Account Balance">
                            <Fab variant="extended">
                                <Stack direction={"row"}>
                                    <SavingsIcon />
                                    <Typography variant="overline">Firefly</Typography>
                                </Stack>
                                <Typography variant="h5" pl={2} component="div"> {utils.getLocaleCurrency(accountBalance)}</Typography>
                            </Fab>
                        </Tooltip>
                    </Stack>
                </CardContent>
            </Card>
        </Box>
    );
};

export default Summary;