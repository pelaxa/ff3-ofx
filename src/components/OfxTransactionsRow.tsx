import React, { Fragment, useState } from "react";
import { Button, Chip, IconButton, TableCell, TableRow } from "@mui/material";
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import AddIcon from '@mui/icons-material/Add';
import { OfxParsedTransaction } from "lib/interfaces";
import OfxTransactionRow from "./OfxMatchingTransactionsTable";
import utils from "lib/utils";


interface OfxTransactionsTableProps {
    transaction: OfxParsedTransaction;
    index: number;
    importTransaction: (existingTxn: OfxParsedTransaction) => void;
    
}

const OfxTransactionsRow = (props: OfxTransactionsTableProps) => {

    const [open, setOpen] = useState<boolean>(false);

    const getStatus = (status: "success" | "failure" | "match-exact" | "match-value" | undefined) => {
        let jsx = <Chip label="failed" color="error" />;
        switch (status) {
            case 'match-exact':
                jsx = <Chip label="exact matched" color="primary" />;
                break;
            case 'match-value':
                jsx = <Chip label="amount matched" color="secondary" />;
                break;
            case 'success':
                jsx = <Chip label="added" color="success" />;
                break;
        }
        return jsx;
    }

    return (
        <Fragment key={`ofxTxn_${props.index}_root`}>
            <TableRow>
                <TableCell>
                    <>
                    {
                        ['failure', 'match-value'].includes(props.transaction.importStatus?.status || '') && (
                            <IconButton
                                aria-label="expand row"
                                size="small"
                                onClick={() => setOpen(!open)}
                                sx={{float: 'right', '&:hover': {backgroundColor: 'rgb(156, 39, 176)', color: '#fff'} }}
                            >
                                {open ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
                            </IconButton>
                        )
                    }
                    {props.transaction.description}
                    </>
                </TableCell>
                <TableCell align="center">
                    {props.transaction.datePosted.format('DD-MMM-YYYY')}
                </TableCell>
                <TableCell align="right">{utils.getLocaleCurrency(props.transaction.amount)}</TableCell>
                <TableCell align="center">
                    {getStatus(props.transaction.importStatus?.status)}
                </TableCell>
                <TableCell align="center">
                    <Button
                        variant="contained"
                        disabled={['match-exact', 'success'].includes(props.transaction.importStatus?.status || '')}
                        onClick={() => props.importTransaction(props.transaction)}>
                        <AddIcon /> Add anyways
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