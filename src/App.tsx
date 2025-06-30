import React, { useCallback, useEffect, useState } from 'react';
import ApiService from './lib/apiService';
import Utils from './lib/utils';
import moment from 'moment';
import './App.css';
import { FF3Account, FF3AccountRole, FF3AddTransactionWrapper, FF3Error, FF3NewAccount, FF3TransactionSplit, FF3TransactionType, FF3Wrapper, IntuitBankInfo, OfxData, OfxParsedTransaction } from '@/lib/interfaces';
import Button from '@mui/material/Button';
import RefreshIcon from '@mui/icons-material/Refresh';
import CheckIcon from '@mui/icons-material/Check';
import { Alert, Box, Checkbox, Collapse, FormControlLabel, Grid, MenuItem, Paper, Select, SelectChangeEvent, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from '@mui/material';
import * as OFXParser from 'node-ofx-parser';
import Summary from './components/Summary';
import OfxTransactionsRow from '@/components/OfxTransactionsRow';
import FileDrop from '@/components/FileDrop';
import BankInfo from '@/lib/bankinfo.json';
// import { Ofx } from 'ofx-data-extractor';

// Import tag used to identify the import
const importTag = `OFX Import ${moment().format('YYYY-MM-DD HH:mm:ss')}`;


const ERROR_FILE_COUNT_TYPE = 'Please only drop 1 file of type OFX or QFX in this area';
const ERROR_NO_ACCOUNT = 'Please setup some accounts to be able to process transactions';
const ERROR_MATCH_ACCOUNT = 'Could not find a matching account to process transactions';
const ERROR_NO_ACCOUNT_NO = 'The provided file does not include an account number to find a matching account';
const ERROR_MATCH_MULTIPLE_ACCOUNT = 'Found multiple matching accounts';
const ERROR_NEW_ACCOUNT_FAILED = 'Could not create a new account. Please create the account in FireFlyIII before importing the transactions';
const ERROR_NO_TRANSACTIONS = 'The OFX file does not contain any transactions';

interface Token {
    value: string;
};

function App() {
    const [token, setToken] = useState<Token>();
    // List of all accounts
    const [accounts, setAccounts] = useState<FF3Wrapper<FF3Account>[]>();
    // The selected account for which transactions are being processed
    const [selectedAccount, setSelectedAccount] = useState<FF3Wrapper<FF3Account>>();
    // The selected account for which transactions are being processed
    const [matchingAccounts, setMatchingAccounts] = useState<FF3Wrapper<FF3Account>[]>();
    // Bank name
    const [bankName, setBankName] = useState<string>('');
    // These are the processed transactions
    const [transactions, setTransactions] = useState<OfxParsedTransaction[]>([]);
    // The transactions parsed from OFX
    const [ofxData, setOfxData] = useState<OfxData>();
    // Whether the transaction data has been processed already or not
    const [processed, setProcessed] = useState(false);
    // The current progress for the transactions being processed
    const [progress, setProgress] = useState(0);
    // The current progress for the transactions being processed
    const [showFileDrop, setShowFileDrop] = useState(true);
    const [errorMessage, setErrorMessage] = useState<string>('');
    // Set to true if an update is available
    const [updateAvailable, setUpdateAvailable] = useState(false);
    const [newAccountData, setNewAccountData] = useState<FF3NewAccount | undefined>();
    // Disable the login button on startup
    const [loginDisabled, setLoginDisabled] = useState(true);

    const checkForUpdates = useCallback(async () => {
        const myVersion = `${__APP_VERSION__}`;
        const latestVersion = await ApiService.getLatestVersion();
        if (myVersion !== latestVersion?.substring(1)) {
            console.error('THERE IS A NEW VERSION OUT', myVersion, latestVersion);
            setUpdateAvailable(true);
        }
    }, []);

    /**
     * Fetch the list of accounts
     */
    const init = useCallback(async (currentToken?: Token) => {
        ApiService.getAccounts(currentToken?.value).then(accntResponse => {
            if (accntResponse && accntResponse.length > 0) {
                setAccounts(accntResponse);
                // If we got accounts back, then store the token
                if (currentToken && currentToken.value) {
                    if ((document.getElementById('chkStoreToken') as HTMLInputElement)?.checked) { // Only store the token if user requested
                        localStorage.setItem('token', JSON.stringify(currentToken));
                    }
                    setToken(currentToken);
                }
            } else if (accntResponse === null) {  // If the response is null, that means we got an unauthorized response
                // Delete localstorage
                localStorage.removeItem('token');
                if (currentToken && (!token || !token.value)) {
                    setToken(undefined);
                }
                ApiService.reset();
            }
        }).catch(e => {
            console.log('could not get accounts', e);
            // // Delete localstorage
            // localStorage.removeItem('token');
            // setToken(undefined);
        });
    }, [token]);

    const showFile = useCallback((files: File[]) => {
        console.log('showFile files[0].name', files[0]);
        setErrorMessage('');

        if (files.length > 1 || (files[0] && !(/\.(ofx|qfx)$/gi).test(files[0].name))) {
            console.log('Too many files');
            setErrorMessage(ERROR_FILE_COUNT_TYPE);
            return;
        } else if (files.length === 1) {
            // Reset our state before reading the new file
            if (ofxData) setOfxData(undefined);
            if (matchingAccounts) setMatchingAccounts(undefined);
            if (selectedAccount) setSelectedAccount(undefined);
            if (transactions && transactions.length > 0) setTransactions([]);
            // setTxnIdx(0);
            if (progress !== 0) setProgress(0);

            // console.log('parsing ofx with new lib...');
            // Ofx.fromBlob(files[0]).then(parsedOfx => {
            //     console.log('Parsing with second parsedOfx', parsedOfx);
            //     const parsedData = parsedOfx.toJson();
            //     console.log('Parsing with second parser', parsedData);
            //     const tmpOfxData = Utils.getOfxData(parsedData);
            //     console.log('tmpOfxData', tmpOfxData);
            // });


            const reader = new FileReader();
            reader.onload = (e: ProgressEvent<FileReader>) => {
                console.debug('file content', e);
                const parsedData = OFXParser.parse(e.target?.result);
                // console.debug(parsedData);
                const tmpOfxData = Utils.getOfxData(parsedData);
                console.error('parsed data', tmpOfxData.transactions);
                if (!tmpOfxData || tmpOfxData.transactions?.length === 0) {
                    console.warn('Either tmpOfxData is undefined/null or there are no transactions in the OFX file...');
                    setErrorMessage(ERROR_NO_TRANSACTIONS);
                } else {
                    if (accounts && accounts?.length > 0) {
                        // Find the account
                        const theAccount = accounts.find(account => {
                            return account.attributes.account_number === tmpOfxData.accountNumber;
                        });
                        if (theAccount) {
                            setProcessed(false);
                            setShowFileDrop(false);
                            setSelectedAccount(theAccount);
                            setOfxData(tmpOfxData);
                        } else {
                            console.log('NO matching account found...');
                            // It is possible that the account number is masked, or it contains other characters than a-z or 0-9
                            // so do a secondary search
                            if (tmpOfxData.accountNumber) {
                                const tmpAccountNumber = new RegExp(tmpOfxData.accountNumber.replace(/[^0-9|a-z|*]/gi, '').replace(/\*{1,}/, '.*'));
                                console.log('account regex: ' + tmpAccountNumber);
                                // Now loop thru again and see if we can find any matching account
                                const partialMatchedAccounts = accounts.filter(account => {
                                    console.info('matching accounts... Comparing: ', tmpAccountNumber, account.attributes.account_number?.replace(/[^0-9|a-z]/gi, ''));
                                    return tmpAccountNumber.test(account.attributes.account_number?.replace(/[^0-9|a-z]/gi, '') || '');
                                });
                                console.log('Partially matching accounts: ' + partialMatchedAccounts);
                                if (Array.isArray(partialMatchedAccounts) && partialMatchedAccounts.length > 0) {
                                    console.info('Found a partial match...');
                                    setShowFileDrop(false);
                                    setOfxData(tmpOfxData);
                                    if (partialMatchedAccounts.length === 1) {
                                        setProcessed(false);
                                        setSelectedAccount(partialMatchedAccounts[0]);
                                    } else if (partialMatchedAccounts.length > 1) {
                                        // Find the bank name
                                        setBankName(
                                            BankInfo.find((info: IntuitBankInfo) => {
                                                return info.id1 === tmpOfxData.intuitId;
                                            }
                                        )?.name || '');
                                        setMatchingAccounts(partialMatchedAccounts);
                                        setErrorMessage(ERROR_MATCH_MULTIPLE_ACCOUNT);
                                    }
                                } else {
                                    // Let us ask the user if they want to create an account
                                    const bankName = BankInfo.find((info: IntuitBankInfo) => {
                                                return info.id1 === tmpOfxData.intuitId;
                                            }
                                        )?.name || '';
                                    setBankName(bankName);
                                    console.log('tmpOfxData?.accountType?.toLowerCase()', tmpOfxData?.accountType?.toLowerCase());
                                    console.log('tmpOfxData ROLE', tmpOfxData?.accountType?.toLowerCase() === 'savings' ? FF3AccountRole.SAVING_ASSET : tmpOfxData?.accountType?.toLowerCase() === 'checking' ? FF3AccountRole.DEFAULT_ASSET : FF3AccountRole.CREDIT_CARD_ASSET);
                                    console.log('tmpOfxData?.accountType', tmpOfxData?.accountType);
                                    console.log('tmpOfxData?.accountNumber', tmpOfxData?.accountNumber);
                                    console.log('tmpOfxData NAME', tmpOfxData?.accountType + ' ' + tmpOfxData?.accountNumber.substring(tmpOfxData.accountNumber.length-4));
                                    const role = tmpOfxData?.accountType?.toLowerCase() === 'savings' ? FF3AccountRole.SAVING_ASSET : tmpOfxData?.accountType?.toLowerCase() === 'checking' ? FF3AccountRole.DEFAULT_ASSET : FF3AccountRole.CREDIT_CARD_ASSET;
                                    setNewAccountData({
                                        name: tmpOfxData?.accountType + ' ' + tmpOfxData?.accountNumber.substring(tmpOfxData.accountNumber.length-4),
                                        number: tmpOfxData.accountNumber,
                                        currency: tmpOfxData.currency,
                                        role,
                                        institution: tmpOfxData.org,
                                        bank: bankName
                                    })
                                    setOfxData(tmpOfxData);
                                    setShowFileDrop(false);
                                    setErrorMessage(ERROR_MATCH_ACCOUNT);
                                }
                            } else {
                                setErrorMessage(ERROR_NO_ACCOUNT_NO);
                            }
                        }
                    } else {
                        console.warn('No accounts to find a match with...');
                        setErrorMessage(ERROR_NO_ACCOUNT);
                    }
                }
            };

            // start reading the new file (This will trigger the onload event above)
            reader.readAsText(files[0]);
        }
    }, [accounts, ofxData, progress, selectedAccount, transactions, matchingAccounts]);

    const selectAccount = async (accnt: FF3Wrapper<FF3Account>) => {
        setProcessed(false);
        setSelectedAccount(accnt);
        setMatchingAccounts(undefined);
    };

    const createAccount = async (accountData: FF3NewAccount | undefined) => {

        if (accountData) {
            console.dir('accountData: ', accountData);
            const accnt = await ApiService.createAccount(accountData);

            if (accnt) {
                console.dir('GETTING READY TO IMPORT: ', accnt);
                setNewAccountData(undefined);
                setProcessed(false);
                setSelectedAccount(accnt);
                setMatchingAccounts(undefined);
                return;
            } 
        }
        console.error('FAILIED TO CREATED ACCOUNT');
        setShowFileDrop(true);
        setErrorMessage(ERROR_NEW_ACCOUNT_FAILED);
    }


    // This method adds a new transaction to the Firefly account based on user request
    const addAnyways = async (existingTxn: OfxParsedTransaction) => {
        if (existingTxn.importStatus?.ff3Txn) {
            const newTransaction = await addTransaction(existingTxn.importStatus?.ff3Txn);

            if (newTransaction) {
                existingTxn.importStatus = newTransaction;
                console.log('Added new transaction (anyways) successfully', newTransaction);
                setTransactions([...transactions]);
                // Change progress so that the summary also updates
                setProgress(progress + 1);
            }
        }
    };

    // This method adds a new transaction to the Firefly account
    const addTransaction = useCallback(async (newTxn: FF3AddTransactionWrapper<FF3TransactionSplit>): Promise<OfxParsedTransaction["importStatus"]> => {
        console.log('Adding new transaction', newTxn);
        let newTransaction: OfxParsedTransaction["importStatus"];
        const newTransactionResp = await ApiService.addTransaction(newTxn);

        if (newTransactionResp && !(newTransactionResp as FF3Error).message) {
            console.log('Added new transaction successfully', newTransactionResp);
            newTransaction = {
                status: 'success',
            };
        } else {
            console.log('New transaction failed', newTransactionResp);
            newTransaction = {
                status: 'failure',
                statusMessage: (newTransactionResp as FF3Error).message,
                statusError: (newTransactionResp as FF3Error).errors,
                ff3Txn: newTxn,
            };
        }
        return newTransaction;
    }, []);

    const processTransactions = useCallback(async () => {
        // Process each transaction by
        // 1) searching for a transaction within a +/- 3 day range
        // 2) comparing to see if a transaction with this amount exists that has a same or different external reference
        // 3) if same external ref, then it must be a match
        // 4) if different internet ref, the it could be a match (prompt the user to choose)
        console.log('ofxData', ofxData, transactions.length, ofxData?.transactions, selectedAccount);

        // The length of transactions is used to process the ofxData transactions, so we must make sure
        // that the length of transactions does not exceed the ofxData transactions so we do not get an
        // index out of bounds
        if (selectedAccount && ofxData && ofxData.transactions && transactions.length < ofxData.transactions.length) {
            console.log('selectedAccount', selectedAccount);
            // Now loop through the transactions and search for each one
            const parsedTxn = ofxData.transactions[transactions.length];

            if (parsedTxn) {
                // We do this to make sure we only have 2 digit decimals
                const parsedAmount = parsedTxn.amount ? parseFloat(parsedTxn.amount.toFixed(2)) : 0;

                console.log('Processing OFX transaction', parsedTxn.description, parsedTxn);

                const relatedTransactions = await ApiService.getAccountTransactions(
                    selectedAccount.id,
                    moment(parsedTxn.datePosted).add(-3, 'days'),
                    moment(parsedTxn.datePosted).add(3, 'days'),
                ),
                    matchingTransactions = [];
                let proceed = true,
                    exactMatchFound = false;

                if (relatedTransactions && relatedTransactions.length >= 1) {
                    console.log(`Found ${relatedTransactions.length} related transactions`);
                    // Check to see if we have added this transaction already
                    for (const ffTxn of relatedTransactions) {
                        // The running total is used to match on split transactions
                        let runningTotal = 0;
                        for (const txn of ffTxn.attributes.transactions) {
                            // This strange conversion is done because FF sometimes stored the value with more decimal precision so the
                            // amount do not match exactly.  eg. 57.66 vs 57.65999999
                            const txnAmount = txn.amount ? parseFloat(parseFloat(txn.amount).toFixed(2)) : 0;
                            console.log('***** Examining txn:');
                            console.log('    **** ffAmount:', txnAmount, ' <==> Bank Amount:', parsedAmount);
                            console.log('    **** ffExtId:', txn.external_id, 'ffIntId:', txn.internal_reference, ' <==> Bank ID:', parsedTxn.transactionId);
                            console.log('    **** ffSourceAccount:', txn.source_id, ', ffDestinationAccount:', txn.destination_id, ' <==> Bank Account:', selectedAccount.id);
                            // First we check for an exact match based on internal or external id.
                            // parsedTxn.transactionId should be unique but it is not in all cases, 
                            // so we check that and the amount
                            if ((
                                (txn.internal_reference && txn.internal_reference === parsedTxn.transactionId) ||
                                (txn.external_id && txn.external_id === parsedTxn.transactionId)
                            ) && Math.abs(txnAmount || 0) === Math.abs(parsedAmount || 0)) {
                                proceed = false;
                                exactMatchFound = true;
                                matchingTransactions.push(ffTxn);
                                console.log('********** Found EXACT match');
                                break;
                            } else if (txnAmount) {
                                runningTotal += txnAmount;
                                if (txnAmount === Math.abs(parsedAmount)) {
                                    // amountMatchFound = true;
                                    if (
                                        (parsedTxn.amount < 0 && txn.source_id === selectedAccount.id) ||
                                        (parsedTxn.amount >= 0 && txn.destination_id === selectedAccount.id)
                                    ) {
                                        console.log('********** Found AMOUNT match');
                                        // console.info(
                                        //     '********** Found AMOUNT match, parsedTxn.amount',
                                        //     parsedAmount,
                                        //     'Source match: ',
                                        //     txn.source_id === selectedAccount.id,
                                        //     'Dest match: ',
                                        //     txn.destination_id === selectedAccount.id,
                                        // );

                                        matchingTransactions.push(ffTxn);
                                        // If the description also matches, then it is an exact match
                                        if (parsedTxn.description === txn.description) {
                                            console.log('********** Found AMOUNT.EXACT match');
                                            exactMatchFound = false;
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
                            ffTxn.attributes.transactions.length > 1 && parseFloat(runningTotal.toFixed(2)) === Math.abs(parsedAmount) &&
                            !matchingTransactions.includes(ffTxn)
                        ) {
                            console.log('********** Found TOTAL match');
                            ffTxn.totalMatch = true; // Lets set a custom property so we can display this differently in matched transactions
                            matchingTransactions.push(ffTxn);
                            // proceed = false;
                        }
                        if (exactMatchFound) {
                            break;
                        }
                    }
                }

                const newTxn: FF3AddTransactionWrapper<FF3TransactionSplit> = {
                    error_if_duplicate_hash: true,
                    apply_rules: true,
                    group_title: null,
                    transactions: [
                        {
                            type: parsedTxn.amount >= 0 ? FF3TransactionType.DEPOSIT : FF3TransactionType.WITHDRAWAL,
                            date: parsedTxn.datePosted.format(),
                            amount: String(Math.abs(parsedAmount)),
                            description: parsedTxn.description,
                            notes: parsedTxn.memo,
                            reconciled: false,
                            external_id: parsedTxn.transactionId,
                            tags: [importTag],
                            destination_id: parsedTxn.amount >= 0 ? String(selectedAccount.id) : undefined,
                            source_id: parsedTxn.amount >= 0 ? undefined : String(selectedAccount.id),
                        },
                    ],
                };

                let newTransaction;
                // If proceed is still true, then we add the transaction
                if (proceed && matchingTransactions.length === 0) {
                    console.log(' >>>>>> Adding new transaction', newTxn);
                    newTransaction = await addTransaction(newTxn);
                }

                if (newTransaction) {
                    console.log(' >>>>>> Added new transaction');
                    parsedTxn.importStatus = newTransaction;
                } else {
                    console.log(' >>>>>> Transaction already existed');
                    parsedTxn.importStatus = {
                        status: exactMatchFound ? 'match-exact' : 'match-value',
                        matchingTransactions: matchingTransactions,
                        ff3Txn: newTxn,
                    };
                }

                console.log(' >>>>>> transactions', transactions);
                console.log(' >>>>>> parsedTxn', parsedTxn);
                if (transactions && transactions.length > 0) {
                    console.log('adding to existing transactions...');
                    setTransactions([parsedTxn, ...transactions]);
                } else {
                    console.log('setting new transaction...');
                    setTransactions([parsedTxn]);
                }

                console.log('Processed Txn! Progress: ', progress, transactions);
                setProgress(((transactions.length+1) / ofxData.transactions.length) * 100);
            }
        } else {
            console.log('Done processing! Updating final account balance...');
            setProcessed(true);
            setShowFileDrop(true);
            console.log('Processed Transactions', progress, transactions);
        }
    }, [addTransaction, ofxData, progress, selectedAccount, transactions]);

    useEffect(() => {
        if (accounts && ofxData && selectedAccount && !processed) {
            // If we have a selected account and new data, then start processing
            console.log('Start processing...');
            setTimeout(() => {
                processTransactions();
            }, 200);
        } else if (transactions) {
            console.log('transactions updated', transactions);
        }
    }, [accounts, init, ofxData, processTransactions, processed, selectedAccount, transactions]);

    /**
     * Read the token anytime the screen is refreshed.
     */
    useEffect(() => {
        // console.log('localStorage.getItem(\'token\')', (localStorage.getItem('token') ?? null));
        const localToken = JSON.parse(localStorage.getItem('token') || '{}');
        if (localToken && localToken.value) {
            // setToken(localToken);
            // initialize the http client
            if (!accounts) {
                ApiService.getHttp(localToken.value);
                init(localToken);
            }
        }
    }, [accounts, init]);

    useEffect(() => {
        checkForUpdates();
    }, [checkForUpdates]);


    const bankBalance: number = ofxData ? parseFloat(parseFloat('' + ofxData.balance).toFixed(2)) : 0;

    console.debug('Account role:', newAccountData?.role);

    return (
        <div className="App">
            {updateAvailable && (
                <Alert variant="filled" severity="info">
                    You are currently running <b>{__APP_NAME__}</b> version <b>{__APP_VERSION__}</b>.  There is a new version available <a href="https://github.com/pelaxa/ff3-ofx/releases/latest" target="_new">here</a>.
                </Alert>
            )}
            <div className="App-header">
                <Collapse in={!token}>
                    <Box sx={{ width: '50%', margin: '0 auto' }}>
                        <Typography variant='h5' sx={{ m: 5 }}>Provide your FireFlyIII token below.  Just tab out of the field when done,
                            but do not forget to check the store box if you would like to store the key for next time.</Typography>
                        <TextField
                            required
                            focused
                            color="primary"
                            variant="filled"
                            id="outlined-password-input"
                            label="FF3 Token"
                            sx={{ width: '70ch' }}
                            type="password"
                            autoComplete="current-password"
                            onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                                if (event.target.value.trim().length > 0) {
                                    setLoginDisabled(false);
                                } else {
                                    setLoginDisabled(true);
                                }
                            }}
                            slotProps={{
                                input: {
                                    endAdornment: (
                                        <Button variant="contained" disabled={loginDisabled} onClick={ () =>
                                            init({ "value": `${(document.getElementById('outlined-password-input') as HTMLInputElement)?.value.trim()}` })
                                        }>Login</Button>
                                    ),
                                },
                              }}
                            
                        />
                        <br />
                        <FormControlLabel control={<Checkbox id={'chkStoreToken'} />} label="Store Token for next time" />
                    </Box>
                </Collapse>
                <Collapse in={!!token && showFileDrop}>
                    <Grid container spacing={0} pb={5} sx={{justifyContent: "center", alignItems: "center"}}>
                        <Grid size={12}>
                            <Typography variant='h5' sx={{ m: 1 }}>Drop an OFX file or click below to start the import</Typography>
                        </Grid>
                        {errorMessage && (
                             <Grid size={12}>
                                <FileDrop errorMessage={errorMessage} fileLimit={1} onChange={showFile} />
                            </Grid>
                        )}
                         {!errorMessage && (
                            <>
                            <Grid size={5}>
                                <FileDrop errorMessage={errorMessage} fileLimit={1} onChange={showFile} />
                            </Grid>
                            <Grid size={3}>
                                <Button variant="contained" color="secondary" onClick={() => { localStorage.removeItem('token'); window.location.reload(); }}><RefreshIcon /> &nbsp;Reset Token!</Button>
                            </Grid>
                            </>
                         )}
                    </Grid>
                </Collapse>
                <Collapse in={!!token && !showFileDrop && !!matchingAccounts && matchingAccounts.length > 1}>
                    <Typography variant='h5' sx={{ m: 5 }}>Multiple accounts matches found!  Please select one of the accounts below to import the transactions</Typography>
                    <div className="scrollview" >
                        <TableContainer component={Paper} sx={{ minWidth: 900, maxWidth: '60%', maxHeight: '70vh', margin: '0 auto' }}>
                            <Table stickyHeader aria-label="collapsible sticky table">
                                <TableHead>
                                    <TableRow>
                                        <TableCell colSpan={3} style={{ backgroundColor: '#eee' }}>
                                            <Typography sx={{ m: 1 }}>
                                                <b>Account Number:</b> {ofxData?.accountNumber}, <b>Account Type:</b> {ofxData?.accountType}, <b>Org:</b> {ofxData?.org}, <b>Bank:</b> {bankName} ({ofxData?.intuitId})
                                            </Typography>
                                        </TableCell>
                                    </TableRow>
                                    <TableRow className="Header-Row">
                                        <TableCell className="Header-Row">Name</TableCell>
                                        <TableCell align="center">Details</TableCell>
                                        <TableCell align="center">Action</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {matchingAccounts?.map((accnt) => (
                                        <TableRow key={`ofxAccnt_${accnt.attributes.account_number}`}>
                                            <TableCell>{accnt.attributes.name}</TableCell>
                                            <TableCell><b>Account Number:</b> {accnt.attributes.account_number}<br /><b>IBAN:</b> {accnt.attributes.iban}<br /><b>BIC:</b> {accnt.attributes.bic}</TableCell>
                                            <TableCell align="center">
                                                <Button
                                                    variant="contained"
                                                    onClick={() => selectAccount(accnt)}>
                                                    <CheckIcon /> Select
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </div>
                </Collapse>
                <Collapse in={!!token && !showFileDrop && !!newAccountData}>
                    <Typography variant='h5' sx={{ m: 5 }}>No matching accounts were found.  Would you like to create the account?</Typography>
                    <div className="scrollview" >
                        <TableContainer component={Paper} sx={{ minWidth: 900, maxWidth: '60%', maxHeight: '70vh', margin: '0 auto' }}>
                            <Table stickyHeader aria-label="collapsible sticky table">
                                <TableBody>
                                    <TableRow>
                                        <TableCell align="right">
                                            <Typography sx={{ m: 1 }}>
                                                <b>Account Name:</b>
                                            </Typography>
                                        </TableCell>
                                        <TableCell>
                                            <TextField id="newAccountName" fullWidth variant="outlined" defaultValue={newAccountData?.name} onBlur={(event: React.FocusEvent<HTMLInputElement>) => setNewAccountData({number: '', ...newAccountData, name: (event.target.value || '') } ) }/>
                                        </TableCell>
                                    </TableRow>
                                    <TableRow>
                                        <TableCell align="right">
                                            <Typography sx={{ m: 1 }}>
                                                <b>Account Number:</b>
                                            </Typography>
                                        </TableCell>
                                        <TableCell>
                                                <TextField id="newAccountNumber" fullWidth variant="outlined" defaultValue={newAccountData?.number} onBlur={(event: React.FocusEvent<HTMLInputElement>) => setNewAccountData({name: '', ...newAccountData, number: (event.target.value || '???') } ) }/>
                                        </TableCell>
                                    </TableRow>
                                    <TableRow>
                                        <TableCell align="right">
                                            <Typography sx={{ m: 1 }}>
                                                <b>Currency:</b>
                                            </Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Typography sx={{ m: 1 }}>
                                                {newAccountData?.currency}
                                            </Typography>
                                        </TableCell>
                                    </TableRow>
                                    <TableRow>
                                        <TableCell align="right">
                                            <Typography sx={{ m: 1 }}>
                                                <b>Account Type:</b>
                                            </Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Select
                                                id="demo-simple-select"
                                                value={newAccountData?.role || 'defaultAsset'}
                                                label="Type"
                                                onChange={(event: SelectChangeEvent) => {
                                                    setNewAccountData({number: '', name: '', ...newAccountData, role: event.target.value as FF3AccountRole });
                                                  }}
                                            >
                                                <MenuItem value={'defaultAsset'}>Default Asset ({newAccountData?.role})</MenuItem>
                                                <MenuItem value={'sharedAsset'}>Shared Asset</MenuItem>
                                                <MenuItem value={'savingAsset'}>Savings Asset</MenuItem>
                                                <MenuItem value={'ccAsset'}>Credit Card</MenuItem>
                                                <MenuItem value={'cashWalletAsset'}>Cash Wallet</MenuItem>
                                            </Select>
                                        </TableCell>
                                    </TableRow>
                                    { newAccountData?.institution && (<TableRow>
                                        <TableCell align="right">
                                            <Typography sx={{ m: 1 }}>
                                                <b>Institution:</b>
                                            </Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Typography sx={{ m: 1 }}>
                                                {newAccountData?.institution}
                                            </Typography>
                                        </TableCell>
                                    </TableRow>
                                    )}
                                    { newAccountData?.bank && (<TableRow>
                                        <TableCell align="right">
                                            <Typography sx={{ m: 1 }}>
                                                <b>Bank:</b>
                                            </Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Typography sx={{ m: 1 }}>
                                                {newAccountData?.bank}
                                            </Typography>
                                        </TableCell>
                                    </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </TableContainer>
                        <br/><br/>
                        <Button variant="outlined" size="small" color="secondary" onClick={() => { window.location.reload() }}>Cancel</Button> &nbsp;
                        <Button variant="contained" size="small" color="success" onClick={() => { createAccount(newAccountData) }}>Add Account</Button> 
                    </div>
                </Collapse>
                {transactions && transactions.length > 0 && (
                    <>
                        <Summary bankBalance={bankBalance} accountId={selectedAccount?.id} processed={processed} progress={progress} />
                        <div className="scrollview" >
                            <TableContainer component={Paper} sx={{ minWidth: 900, maxWidth: '60%', maxHeight: '70vh', margin: '0 auto' }}>
                                <Table stickyHeader aria-label="collapsible sticky table">
                                    <TableHead>
                                        <TableRow className="Header-Row">
                                            <TableCell className="Header-Row">Description</TableCell>
                                            <TableCell align="center">Date</TableCell>
                                            <TableCell align="right">Amount</TableCell>
                                            <TableCell align="center">Status</TableCell>
                                            <TableCell align="center">Action</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {transactions.map((transaction, idx) => (
                                            <OfxTransactionsRow transaction={transaction} index={idx} importTransaction={addAnyways} />
                                        ))}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

export default App;
