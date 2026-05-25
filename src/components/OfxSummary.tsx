import { Box, Card, CardContent, Chip, CircularProgress, Stack, Typography } from "@mui/material";
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
// import { useEffect, useState } from "react";
import { OfxAccount, OfxAccountStatus } from "@/lib/interfaces";
// import ApiService from "@/lib/apiService";
// import utils from "@/lib/utils";

interface OfxSummaryProps {
    accounts: OfxAccount[];
    accountIndex?: number;
    clickHandler: (idx: number) => void;
    selectionAllowed: boolean;
}

const OfxSummary = (props: OfxSummaryProps) => {
    return (
        <Box sx={{ width: 1000, pb: 2 }}>
            <Card variant="outlined">
                <CardContent>
                    <Typography variant="h6" gutterBottom component="div" sx={{ textAlign: 'left' }}>
                        Multiple accounts detected.  Once processing has finished for the current account, select the next account to be processed.
                    </Typography>
                    <Stack direction="row" spacing={2} sx={{ justifyContent: 'center' }}>
                        {props.accounts.map((account, idx) => {
                            const icon = account.status === OfxAccountStatus.PROCESSED ? <CheckCircleIcon color="success"/> : account.status === OfxAccountStatus.PROCESSING ? <CircularProgress size="20px" /> : <HourglassEmptyIcon color="action" />
                            return <Chip key={`account_chip_${idx}`} icon={icon} variant="outlined" label={account.accountNumber} onClick={() => props.clickHandler(idx)} disabled={!(props.selectionAllowed && account.status === OfxAccountStatus.UNPROCESSED)}/>
                        })}
                    </Stack>
                </CardContent>
            </Card>
            
        </Box>
    );
};

export default OfxSummary;