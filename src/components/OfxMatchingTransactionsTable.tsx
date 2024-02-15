import React, { Fragment } from "react";
import moment from 'moment';
import { Box, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import { OfxParsedTransaction } from "lib/interfaces";


// Color for matching row backgrounds
const bgColors = ["#eeeeee",
    "#cccccc",
    "#aaaaaa",
    "#888888",
    "#666666",
    "#444444"
];

interface OfxTransactionRowProps {
    transaction: OfxParsedTransaction;
}

const OfxMatchingTransactionsTable = (props: OfxTransactionRowProps) => {


    return (
        <TableRow>
            <TableCell colSpan={4} align="center">
                <Box
                    /* variant="outlined" */
                    sx={{
                        p: 2,
                        border: '1px solid grey',
                        backgroundColor: '#f0f0f0',
                    }}>
                    <Typography variant="h6">Matching Transactions</Typography>
                    <Table
                        sx={{ width: '100%', alignSelf: 'flex-end' }}
                        aria-label="simple table"
                        size="small" >
                        <TableHead>
                            <TableRow key={'match_header'}>
                                <TableCell>Description</TableCell>
                                <TableCell align="center">Date</TableCell>
                                <TableCell align="right">
                                    Amount&nbsp;($)
                                </TableCell>
                                <TableCell align="center">Type</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {props.transaction.importStatus?.matchingTransactions?.map(
                                (mParentTxn, idx1) => {
                                    const bgColor = bgColors[idx1];
                                    return (
                                        <Fragment key={`pMatchEntry_${idx1}`}>
                                            {mParentTxn.attributes.transactions.map(
                                                (mTxn, idx2) => (
                                                    <TableRow key={`pMatch_${mTxn.transaction_journal_id}`} /*bgcolor={bgColor} */>
                                                        <TableCell>
                                                            {
                                                                mParentTxn.totalMatch ? <b>[Split - {idx2+1} of {mParentTxn.attributes.transactions.length}] </b> : ""
                                                            }{
                                                                mTxn.description
                                                            }
                                                        </TableCell>
                                                        <TableCell align="center">
                                                            {moment(
                                                                mTxn.date,
                                                            ).format('DD-MMM-YYYY')}
                                                        </TableCell>
                                                        <TableCell align="right">
                                                            {parseFloat(
                                                                mTxn.amount,
                                                            ).toFixed(2)}
                                                        </TableCell>
                                                        <TableCell align="center">
                                                            {
                                                                mTxn.type
                                                            }
                                                        </TableCell>
                                                    </TableRow>
                                                )
                                            )}
                                        </Fragment>
                                    );
                                }
                            )}
                        </TableBody>
                    </Table>
                </Box>
            </TableCell>
            <TableCell></TableCell>
        </TableRow>
    );
};

export default OfxMatchingTransactionsTable;