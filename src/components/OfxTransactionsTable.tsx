import React, { Fragment } from "react";
import moment from 'moment';
import { Box, Button, Chip, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from "@mui/material";
import AddIcon from '@mui/icons-material/Add';
import { OfxParsedTransaction } from "lib/interfaces";
import OfxTransactionRow from "./OfxMatchingTransactionsTable";


interface OfxTransactionsTableProps {
    transactions: OfxParsedTransaction[];
    importTransaction: (existingTxn: OfxParsedTransaction) => void;
    
}

const OfxTransactionsTable = (props: OfxTransactionsTableProps) => {

    const getStatus = (status: "success" | "failure" | "noop" | undefined) => {
        let jsx = <Chip label="failed" color="error" />;
        switch (status) {
            case 'noop':
                jsx = <Chip label="matched" color="primary" />;
                break;
            case 'success':
                jsx = <Chip label="added" color="success" />;
                break;
        }
        return jsx;
    }

    return (
        <TableContainer component={Paper} sx={{ minWidth: 400, maxWidth: '100%', maxHeight: '70vh' }}>
            <Table stickyHeader size="small" aria-label="sticky table">
                <TableHead>
                    <TableRow className="Header-Row">
                        <TableCell className="Header-Row">Description</TableCell>
                        <TableCell align="center">Date</TableCell>
                        <TableCell align="right">Amount&nbsp;($)</TableCell>
                        <TableCell align="center">Status</TableCell>
                        <TableCell align="center">Action</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {props.transactions.map((transaction, idx) => (
                        <Fragment key={`ofxTxn_${idx}_root`}>
                            <TableRow>
                                <TableCell>{transaction.description}</TableCell>
                                <TableCell align="center">
                                    {transaction.datePosted.format('DD-MMM-YYYY')}
                                </TableCell>
                                <TableCell align="right">{transaction.amount.toFixed(2)}</TableCell>
                                <TableCell align="center">{getStatus(transaction.importStatus?.status)}</TableCell>
                                <TableCell align="center">
                                    <Button
                                        variant="contained"
                                        disabled={transaction.importStatus?.status !== 'noop'}
                                        onClick={() => props.importTransaction(transaction)}>
                                        <AddIcon /> Add anyways
                                    </Button>
                                </TableCell>
                            </TableRow>
                            {transaction.importStatus?.status === 'noop' && (
                                <OfxTransactionRow transaction={transaction} />
                            )}
                        </Fragment>
                    ))}
                </TableBody>
            </Table>
        </TableContainer>
    );
};

export default OfxTransactionsTable;