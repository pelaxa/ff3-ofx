import React, { Fragment } from "react";
import moment from 'moment';
import { Box, Collapse, Table, TableBody, TableCell, TableHead, TableRow } from "@mui/material";
import { OfxParsedTransaction } from "lib/interfaces";
import utils from "lib/utils";


interface OfxTransactionRowProps {
    transaction: OfxParsedTransaction;
    open: boolean;
}

const OfxMatchingTransactionsTable = (props: OfxTransactionRowProps) => {


    return (
        <TableRow>
            <TableCell style={{ border: 0, paddingBottom: 0, paddingTop: 0 }} colSpan={5}>
                <Collapse in={props.open} timeout="auto" unmountOnExit>
                    <Box
                        sx={{
                            p: 2,
                            backgroundColor: 'rgb(156, 39, 176)',
                            borderRadius: 5,
                            marginBottom: 5,
                            marginTop: 2
                        }}>
                        <Table
                            sx={{ width: '100%', alignSelf: 'flex-end' }}
                            aria-label="simple table"
                            size="small" className="matching-txns">
                            <TableHead>
                                <TableRow key={'match_header'}>
                                    <TableCell colSpan={4} sx={{textAlign: 'center', border: 0}}>Matching Transactions</TableCell>
                                </TableRow>
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
                                        return (
                                            <Fragment key={`pMatchEntry_${idx1}`}>
                                                {mParentTxn.attributes.transactions.map(
                                                    (mTxn, idx2) => (
                                                        <TableRow sx={{'&:nth-of-type(odd)': {backgroundColor: '#A842BA'}, '&:nth-of-type(even)': {backgroundColor: '#B55DC4'}}} 
                                                                  key={`pMatch_${mTxn.transaction_journal_id}`}>
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
                                                                {utils.getLocaleCurrency(parseFloat(mTxn.amount))}
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
                </Collapse>
            </TableCell>
        </TableRow>
    );
};

export default OfxMatchingTransactionsTable;