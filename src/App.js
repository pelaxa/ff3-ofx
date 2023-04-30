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
import LinearProgress from '@mui/material/LinearProgress';
import * as OFXParser from 'node-ofx-parser';

const bgColors = ["#eeeeee",
    "#cccccc",
    "#aaaaaa",
    "#888888",
    "#666666",
    "#444444"];

function App() {
    // List of all accounts
    const [accounts, setAccounts] = useState();
    // The selected account for which transactions are being processed
    const [selectedAccount, setSelectedAccount] = useState();
    // These are the procdessed transactions
    const [transactions, setTransactions] = useState([]);
    // ???
    const [ofxData, setOfxData] = useState();
    // Whether the transaction data has been processed already or not
    const [processed, setProcessed] = useState(false);
    // The current progress for the transactions being processed
    const [progress, setProgress] = useState(0);
    const ofxParser = OFXParser;

    console.info('Version: 202304021522')

    useEffect(() => {
        if (!accounts) {
            // If we do not have any accounts fetched, fetch them first
            console.log('calling init...');
            init();
        } else if (ofxData && selectedAccount && !processed) {
            // If we have a selected account, new data and a selected account, then start processing
            console.log('Start processing...');
            processTransactions();
        } else if (transactions) {
            console.log('transactions updated', transactions);
        }
    });

    /**
     * Fetch the list of accounts
     */
    const init = async () => {
        const accntResponse = await ApiService.getAccounts();
        setAccounts(accntResponse);
    };

    const showFile = e => {
        e.preventDefault();
        const reader = new FileReader();
        reader.onload = e => {
            const text = e.target.result;
            const parsedData = ofxParser.parse(text);
            // console.debug(parsedData);
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
        // Reset our state before reading the new file
        setOfxData(undefined);
        setSelectedAccount(undefined);
        setTransactions([]);
        // setTxnIdx(0);
        setProcessed(false);
        setProgress(0);
        // start reading the new file (This will trigger the onload event above)
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

    const addAnyways = async existingTxn => {
        const newTransaction = await addTransaction(existingTxn.importStatus?.ff3Txn);

        if (newTransaction) {
            existingTxn.importStatus = newTransaction;

            const account = await ApiService.getAccount(selectedAccount.id);
            if (account) {
                setSelectedAccount(account);
            }

            setTransactions(transactions);
        }
    };

    const processTransactions = async () => {
        // Process each transaction by
        // 1) searching for a transaction within a +/- 3 day range
        // 2) comparing to see if a transaction with this amount exists that has a same or different external reference
        // 3) if same external ref, then it must be a match
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
            const parsedTxn = ofxData.transactions[transactions.length];
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
                    // The running total is used to match on split transactions
                    let runningTotal = 0;
                    for (const txn of ffTxn.attributes.transactions) {
                        console.log('***** Examining txn', txn);
                        // First we check for an exact match based on internal or external id.
                        // parsedTxn.transactionId should be unique but it is not in all cases, 
                        // so we check that and the amount
                        if ((
                            (txn.internal_reference && txn.internal_reference === parsedTxn.transactionId) ||
                            (txn.external_id && txn.external_id === parsedTxn.transactionId)
                        ) && Math.abs(txn.amount || 0) === Math.abs(parsedTxn.amount || 0)) {
                            proceed = false;
                            exactMatchFound = true;
                            matchingTransactions.push(ffTxn);
                            console.log('********** Found EXACT match');
                            break;
                        } else if (txn.amount) {
                            const amt = parseFloat(txn.amount);
                            runningTotal += amt;
                            if (amt === Math.abs(parsedTxn.amount)) {
                                // amountMatchFound = true;
                                if (
                                    (parsedTxn.amount < 0 && txn.source_id === selectedAccount.id) ||
                                    (parsedTxn.amount >= 0 && txn.destination_id === selectedAccount.id)
                                ) {
                                    console.log('********** Found AMOUNT match');
                                    console.info(
                                        '********** Found AMOUNT match, parsedTxn.amount',
                                        parsedTxn.amount,
                                        'Source match: ',
                                        txn.source_id === selectedAccount.id,
                                        'Dest match: ',
                                        txn.destination_id === selectedAccount.id,
                                    );

                                    matchingTransactions.push(ffTxn);
                                    // If the description also matches, then it is an exact match
                                    if (parsedTxn.description === txn.description) {
                                        console.log('********** Found AMOUNT.EXACT match');
                                        exactMatchFound = true;
                                        proceed = false;
                                        break;
                                    }
                                }
                            }
                        }
                    }

                    // It is possible the transaction was split so check to make sure we have more than 1 transaction
                    // and the total matches and only add it if it is not already in the array
                    if (
                        ffTxn.attributes.transactions.length > 1 && runningTotal === Math.abs(parsedTxn.amount) &&
                        !matchingTransactions.includes(ffTxn)
                    ) {
                        console.log('********** Found TOTAL match');
                        matchingTransactions.push(ffTxn);
                        // proceed = false;
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
                        external_id: parsedTxn.transactionId,
                        tags: [importTag],
                        destination_id: parsedTxn.amount >= 0 ? selectedAccount.id : undefined,
                        source_id: parsedTxn.amount >= 0 ? undefined : selectedAccount.id,
                    },
                ],
            };

            let newTransaction;
            // If proceed is still true, then we add the transaction
            if (proceed && matchingTransactions.length === 0) {
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

            console.log('Processed Txn', progress, transactions);
            setProgress((transactions.length / ofxData.transactions.length) * 100);
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
    const diff = (bankBalance - accountBalance).toFixed(2);

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
                                        {!processed && (
                                            <Box sx={{ minWidth: 150, mr: 1, alignSelf: 'center' }}>
                                                <LinearProgress variant="determinate" value={progress} />
                                            </Box>
                                        )}
                                        {processed && (
                                            <Typography
                                                variant="h6"
                                                sx={{ color: `${bankBalance !== accountBalance ? '#f00' : '#090'}` }}
                                                gutterBottom
                                                component="div">
                                                $ {diff}
                                            </Typography>
                                        )}
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
                                                        disabled={transaction.importStatus?.status !== 'noop'}
                                                        onClick={() => addAnyways(transaction)}>
                                                        <AddIcon /> Add anyways
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                            {transaction.importStatus?.status === 'noop' && (
                                                <TableRow>
                                                    <TableCell colSpan={4} align="center">
                                                        <Box
                                                            variant="outlined"
                                                            sx={{
                                                                p: 2,
                                                                border: '1px solid grey',
                                                                backgroundColor: '#f0f0f0',
                                                            }}>
                                                            <Typography variant="h6">Matching Transactions</Typography>
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
                                                                        (mParentTxn, idx1) => {
                                                                            const bgColor = bgColors[idx1];
                                                                            return (
                                                                                <>
                                                                                    {mParentTxn.attributes.transactions.map(
                                                                                        (mTxn) => (
                                                                                            <TableRow key={`pMatch_${mTxn.transaction_journal_id}`} bgcolor={bgColor}>
                                                                                                <TableCell>
                                                                                                    {
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
                                                                                                    } {
                                                                                                        mParentTxn.attributes.group_title ? "(Split)" : ""
                                                                                                    }
                                                                                                </TableCell>
                                                                                            </TableRow>
                                                                                        )
                                                                                    )}
                                                                                </>
                                                                            );
                                                                        }
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
