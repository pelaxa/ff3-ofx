import React, { useEffect, useState } from 'react';
import ApiService from './lib/apiService';
import Utils from './lib/utils';
import moment from 'moment';
import './App.css';
import { FF3TransactionType } from 'lib/interfaces';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Paper from '@mui/material/Paper';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import AddIcon from '@mui/icons-material/Add';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import SavingsIcon from '@mui/icons-material/Savings';
import Stack from '@mui/material/Stack';
import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import { Typography } from '@mui/material';

function App() {
    const [accounts, setAccounts] = useState();
    const [selectedAccount, setSelectedAccount] = useState();
    const [transactions, setTransactions] = useState([]);
    const [txnIdx, setTxnIdx] = useState(0);
    const [ofxData, setOfxData] = useState();
    const [processed, setProcessed] = useState(false);
    const ofxParser = require('node-ofx-parser');

    const init = async () => {
        const accntResponse = await ApiService.getAccounts();
        setAccounts(accntResponse);
    };

    useEffect(() => {
        if (!accounts) {
            console.log('calling init...');
            init();
        } else if (ofxData && selectedAccount && !processed) {
            console.log('Start processing...');
            processTransactions();
        } else if (transactions) {
            console.log('transactions updated', transactions);
        }
    });

    const showFile = e => {
        e.preventDefault();
        const reader = new FileReader();
        reader.onload = e => {
            const text = e.target.result;
            const parsedData = ofxParser.parse(text);
            console.log(parsedData);
            const tmpOfxData = Utils.getOfxData(parsedData);
            if (accounts?.length > 0) {
                // Find the account
                const theAccount = accounts.find(account => {
                    return account.attributes.account_number === tmpOfxData.accountNumber;
                });
                setSelectedAccount(theAccount);
                setOfxData(tmpOfxData);
            }
        };
        setOfxData(undefined);
        setSelectedAccount(undefined);
        setTransactions([]);
        setTxnIdx(0);
        setProcessed(false);
        reader.readAsText(e.target.files[0]);
    };

    const addTransaction = async newTxn => {
        console.log('Adding new transaction', newTxn);
        let newTransaction;
        const newTransactionResp = await ApiService.addTransaction(newTxn);

        if (newTransactionResp && !newTransactionResp.message) {
            console.log('Added new transaction successfully', newTransactionResp);
            newTransaction = {
                status: 'added',
            };
        } else {
            console.log('New transaction failed', newTransactionResp);
            newTransaction = {
                status: 'addFailed',
                statusMessage: newTransactionResp.message,
                statusError: newTransactionResp.errors,
                ff3Txn: newTxn,
            };
        }
        return newTransaction;
    };

    const processTransactions = async () => {
        // Process each transaction by
        // 1) searching for a transaction within a +/- 3 day range
        // 2) comparing to see if a transaction with this amount exists that has a same or different internal reference
        // 3) if same internal ref, then it must be a match
        // 4) if different internet ref, the it could be a match (prompt the user to choose)
        console.log('ofxData', ofxData, transactions.length, ofxData.transactions, selectedAccount);

        // The length of transactions is used to process the ofxData transactions, so we must make sure
        // that the length of transactions does not exceed the ofxData transactions so we do not get an
        // index out of bounds
        if (selectedAccount && transactions.length < ofxData.transactions.length) {
            console.log('selectedAccount', selectedAccount);
            // Import tag used to identify the import
            const importTag = `OFX Import ${new Date().toJSON()}`;
            // Now loop through the transactions and search for each one
            //for (const ofxTxn of ofxData.transactions) {
            const ofxTxn = ofxData.transactions[transactions.length];
            const parsedTxn = Utils.parseOfxTransaction(ofxTxn);
            console.log('parsedTxn', parsedTxn);

            const relatedTransactions = await ApiService.getAccountTransactions(
                    selectedAccount.id,
                    moment(parsedTxn.datePosted).add(-3, 'days'),
                    moment(parsedTxn.datePosted).add(3, 'days'),
                ),
                matchingTransactions = [];
            let proceed = true,
                exactMatchFound = false;
            if (relatedTransactions.length >= 1) {
                console.log(`Found ${relatedTransactions.length} related transactions`);
                // Check to see if we have added this transaction already
                for (const ffTxn of relatedTransactions) {
                    let runningTotal = 0;
                    for (const txn of ffTxn.attributes.transactions) {
                        console.log('***** Examining txn', txn);
                        if (
                            (txn.internal_reference && txn.internal_reference === parsedTxn.transactionId) ||
                            (txn.external_id && txn.external_id === parsedTxn.transactionId)
                        ) {
                            proceed = false;
                            exactMatchFound = true;
                            matchingTransactions.push(ffTxn);
                            console.log('********** Found EXACT match');
                            break;
                        } else if (txn.amount) {
                            const amt = parseFloat(txn.amount);
                            runningTotal += amt;
                            // TODO: Ran into one case where a deposit matched a withdraw ???
                            if (
                                amt === Math.abs(parsedTxn.amount) &&
                                ((parsedTxn.amount < 0 && txn.source_id === selectedAccount.id) ||
                                    (parsedTxn.amount >= 0 && txn.destination_id === selectedAccount.id))
                            ) {
                                console.log('********** Found AMOUNT match');
                                matchingTransactions.push(ffTxn);
                                proceed = false;
                                // If the description also matches, then it is an exact match
                                if (parsedTxn.description === txn.description) {
                                    console.log('********** Found AMOUNT.EXACT match');
                                    exactMatchFound = true;
                                    break;
                                }
                            }
                        }
                    }
                    // Now we check the total and only add it if it is not already in the array
                    if (runningTotal === parsedTxn.amount && !matchingTransactions.includes(ffTxn)) {
                        console.log('********** Found TOTAL match');
                        matchingTransactions.push(ffTxn);
                        proceed = false;
                    }
                    if (exactMatchFound) {
                        break;
                    }
                }
            }

            const newTxn = {
                error_if_duplicate_hash: true,
                apply_rules: true,
                group_title: null,
                transactions: [
                    {
                        type: parsedTxn.amount >= 0 ? FF3TransactionType.DEPOSIT : FF3TransactionType.WITHDRAWAL,
                        date: parsedTxn.datePosted.format(),
                        amount: Math.abs(parsedTxn.amount),
                        description: parsedTxn.description,
                        notes: parsedTxn.memo,
                        reconciled: false,
                        internal_reference: parsedTxn.transactionId,
                        tags: [importTag],
                        destination_id: parsedTxn.amount >= 0 ? selectedAccount.id : undefined,
                        source_id: parsedTxn.amount >= 0 ? undefined : selectedAccount.id,
                    },
                ],
            };

            let newTransaction;
            // If proceed is still true, then we add the transaction
            if (proceed) {
                newTransaction = await addTransaction(newTxn);
            }

            if (newTransaction) {
                parsedTxn.importStatus = newTransaction;
            } else {
                parsedTxn.importStatus = {
                    status: 'noop',
                    matchingTransactions: matchingTransactions,
                    ff3Txn: newTxn,
                };
            }

            console.log(' >>>>>> transactions', transactions);
            console.log(' >>>>>> parsedTxn', parsedTxn);
            if (transactions && transactions.length > 0) {
                console.log('adding to existing transactions...');
                setTransactions([...transactions, parsedTxn]);
            } else {
                console.log('setting new transaction...');
                setTransactions([parsedTxn]);
            }

            console.log('Processed Txn', transactions);
        } else {
            console.log('Done processing! Updating final account balance...');
            // Update the account balance
            // setTimeout(async () => {
            const account = await ApiService.getAccount(selectedAccount.id);
            if (account) {
                setSelectedAccount(account);
            }
            // }, 1000);
            setProcessed(true);
            console.log('Processed Transactions', transactions);
        }
    };

    const bankBalance = ofxData ? parseFloat(ofxData.balance).toFixed(2) : 0;
    const accountBalance = selectedAccount ? parseFloat(selectedAccount.attributes.current_balance).toFixed(2) : 0;

    return (
        <div className="App">
            <header className="App-header">
                <p>Drop a file below to parse its content</p>
                <input type="file" onChange={showFile} />
                <br />
                <br />
                {transactions && transactions.length > 0 && (
                    <>
                        <Box sx={{ minWidth: 400, maxWidth: '80%' }}>
                            {bankBalance !== accountBalance && (
                                <Alert severity="warning">
                                    The bank balance does not match your account balance. Look for transactions that may
                                    have been matched but need to be added anyways.
                                </Alert>
                            )}
                            <Card variant="outlined">
                                <CardContent>
                                    <Typography variant="h6" gutterBottom component="div">
                                        {selectedAccount.attributes.name} ({selectedAccount.attributes.account_number})
                                    </Typography>
                                    <Stack direction="row" justifyContent="space-between">
                                        <Tooltip title="Bank Balance">
                                            <Chip icon={<AccountBalanceIcon />} label={`$ ${bankBalance}`} />
                                        </Tooltip>
                                        <Tooltip title="Account Balance">
                                            <Chip icon={<SavingsIcon />} label={`$ ${accountBalance}`} />
                                        </Tooltip>
                                    </Stack>
                                </CardContent>
                            </Card>
                        </Box>
                        <br />
                        <TableContainer component={Paper} sx={{ minWidth: 400, maxWidth: '80%' }}>
                            <Table aria-label="simple table">
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
                                    {transactions.map((transaction, idx) => (
                                        <>
                                            <TableRow>
                                                <TableCell>{transaction.description}</TableCell>
                                                <TableCell align="center">
                                                    {transaction.datePosted.format('DD-MMM-YYYY')}
                                                </TableCell>
                                                <TableCell align="right">{transaction.amount.toFixed(2)}</TableCell>
                                                <TableCell align="center">{transaction.importStatus?.status}</TableCell>
                                                <TableCell align="center">
                                                    <Button
                                                        variant="text"
                                                        disabled={transaction.importStatus?.status === 'noop'}
                                                        onClick={() =>
                                                            addTransaction(transaction.importStatus?.ff3Txn)
                                                        }>
                                                        <AddIcon /> Add anyways
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                            {transaction.importStatus?.status === 'noop' && (
                                                <TableRow>
                                                    <TableCell colSpan={4} align="center">
                                                        <Box variant="outlined" sx={{p: 2, border: '1px solid grey', backgroundColor: '#f0f0f0'}}>
                                                            <Typography variant='h6'>Matching Transactions</Typography>
                                                            <Table
                                                                sx={{ width: '100%', alignSelf: 'flex-end' }}
                                                                aria-label="simple table">
                                                                <TableHead>
                                                                    <TableRow>
                                                                        <TableCell>Description</TableCell>
                                                                        <TableCell align="center">Date</TableCell>
                                                                        <TableCell align="right">
                                                                            Amount&nbsp;($)
                                                                        </TableCell>
                                                                        <TableCell align="center">Type</TableCell>
                                                                    </TableRow>
                                                                </TableHead>
                                                                <TableBody>
                                                                    {transaction.importStatus?.matchingTransactions.map(
                                                                        (mTxn, idx1) => (
                                                                            <TableRow>
                                                                                <TableCell>
                                                                                    {
                                                                                        mTxn.attributes.transactions[0]
                                                                                            .description
                                                                                    }
                                                                                </TableCell>
                                                                                <TableCell align="center">
                                                                                    {moment(
                                                                                        mTxn.attributes.transactions[0]
                                                                                            .date,
                                                                                    ).format('DD-MMM-YYYY')}
                                                                                </TableCell>
                                                                                <TableCell align="right">
                                                                                    {parseFloat(
                                                                                        mTxn.attributes.transactions[0]
                                                                                            .amount,
                                                                                    ).toFixed(2)}
                                                                                </TableCell>
                                                                                <TableCell align="center">
                                                                                    {
                                                                                        mTxn.attributes.transactions[0]
                                                                                            .type
                                                                                    }
                                                                                </TableCell>
                                                                            </TableRow>
                                                                        ),
                                                                    )}
                                                                </TableBody>
                                                            </Table>
                                                        </Box>
                                                    </TableCell>
                                                    <TableCell></TableCell>
                                                </TableRow>
                                            )}
                                        </>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </>
                )}
            </header>
        </div>
    );
}

export default App;
