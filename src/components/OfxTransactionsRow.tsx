import { Fragment, useState } from "react";
import { Button, Chip, TableCell, TableRow } from "@mui/material";
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import AddIcon from '@mui/icons-material/Add';
import { OfxParsedTransaction } from "@/lib/interfaces";
import OfxTransactionRow from "./OfxMatchingTransactionsTable";
import utils from "@/lib/utils";


interface OfxTransactionsTableProps {
    transaction: OfxParsedTransaction;
    index: number;
    importTransaction: (existingTxn: OfxParsedTransaction) => void;
    
}

const OfxTransactionsRow = (props: OfxTransactionsTableProps) => {

    const [open, setOpen] = useState<boolean>(false);

    const getStatus = (status: "success" | "failure" | "match-exact" | "match-value" | undefined) => {
        let jsx = <Chip label="✕ failed" variant="outlined"
                      sx={{ color: '#ef9a9a', borderColor: 'rgba(239,83,80,.3)', backgroundColor: 'rgba(239,83,80,.15)' }} />;
        switch (status) {
            case 'match-exact':
                jsx = <Chip label="= exact match" variant="outlined"
                          sx={{ color: '#42a5f5', borderColor: 'rgba(66,165,245,.3)', backgroundColor: 'rgba(66,165,245,.15)' }} />;
                break;
            case 'match-value':
                jsx = <Chip label="$ amount match" variant="outlined"
                          sx={{ color: '#ce93d8', borderColor: 'rgba(171,71,188,.3)', backgroundColor: 'rgba(171,71,188,.15)' }}
                          deleteIcon={open ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
                          onDelete={() => setOpen(!open)}/>;
                break;
            case 'success':
                jsx = <Chip label="✓ added" variant="outlined"
                          sx={{ color: '#66bb6a', borderColor: 'rgba(102,187,106,.3)', backgroundColor: 'rgba(102,187,106,.15)' }} />;
                break;
        }
        return jsx;
    }

    return (
        <Fragment key={`ofxTxn_${props.index}_root`}>
            <TableRow>
                <TableCell>
                    {props.transaction.description}
                </TableCell>
                <TableCell align="center">
                    {props.transaction.datePosted.format('DD-MMM-YYYY')}
                </TableCell>
                <TableCell align="right" sx={{ color: props.transaction.amount >= 0 ? 'success.main' : 'error.main', fontWeight: 500 }}>
                    {utils.getLocaleCurrency(props.transaction.amount)}
                </TableCell>
                <TableCell align="center">
                    {getStatus(props.transaction.importStatus?.status)}
                </TableCell>
                <TableCell align="center">
                    <Button
                        variant="outlined"
                        size="small"
                        disabled={['match-exact', 'success'].includes(props.transaction.importStatus?.status || '')}
                        onClick={() => props.importTransaction(props.transaction)}
                        sx={{
                            borderColor: 'divider',
                            color: 'text.secondary',
                            fontSize: '12px',
                            '&:hover': { borderColor: 'primary.light', color: 'primary.light' },
                        }}>
                        <AddIcon sx={{ fontSize: '14px', mr: 0.5 }} /> Add anyways
                    </Button>
                </TableCell>
            </TableRow>
            {['failure', 'match-value'].includes(props.transaction.importStatus?.status || '') && (
                <OfxTransactionRow open={open} transaction={props.transaction} />
            )}
        </Fragment>
    );
};

export default OfxTransactionsRow;