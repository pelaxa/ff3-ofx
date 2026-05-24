import React, { useCallback, useEffect, useState } from 'react';
import ApiService from './lib/apiService';
import Utils from './lib/utils';
import moment from 'moment';
import './App.css';
import { FF3NewAccount, IntuitBankInfo, MatchedTransaction, OfxAccountStatus, OfxData, OfxImportStatus, OfxParsedTransaction } from '@/lib/interfaces';
import {
    AccountRoleProperty,
    TransactionTypeProperty,
    type AccountRead,
    type BillRead,
    type BudgetRead,
    type CategoryRead,
    type TransactionRead,
    type TransactionStoreWritable,
    type ValidationErrorResponse,
} from '@billos/firefly-iii-sdk';
import Button from '@mui/material/Button';
import RefreshIcon from '@mui/icons-material/Refresh';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import { Alert, AppBar, Box, Card, CardContent, Checkbox, Collapse, FormControl, FormControlLabel, IconButton, InputLabel, MenuItem, Paper, Select, SelectChangeEvent, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Toolbar, Typography } from '@mui/material';
import * as OFXParser from 'node-ofx-parser';
import Summary from './components/Summary';
import OfxTransactionsRow from '@/components/OfxTransactionsRow';
import FileDrop from '@/components/FileDrop';
import BankInfo from '@/lib/bankinfo.json';
import OfxSummary from './components/OfxSummary';
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
const ERROR_BAD_OFX = 'The OFX file format is not understood';

interface Token {
    value: string;
};

function App() {
    const [token, setToken] = useState<Token>();
    // List of all accounts
    const [accounts, setAccounts] = useState<AccountRead[]>();
    // The selected account for which transactions are being processed
    const [selectedAccount, setSelectedAccount] = useState<AccountRead>();
    // The selected account for which transactions are being processed
    const [matchingAccounts, setMatchingAccounts] = useState<AccountRead[]>();
    // Bank name
    const [bankName, setBankName] = useState<string>('');
    // These are the processed transactions
    const [transactions, setTransactions] = useState<OfxParsedTransaction[]>([]);
    // The accounts/transactions parsed from OFX
    const [ofxData, setOfxData] = useState<OfxData>();
    // The current OFX account/transactions index
    const [ofxAccountIndex, setOfxAccountIndex] = useState<number>(0);
    // Whether the transaction data has been processed already or not
    const [processed, setProcessed] = useState(false);
    // The current progress for the transactions being processed
    const [progress, setProgress] = useState(0);
    // The current progress for the transactions being processed
    const [showFileDrop, setShowFileDrop] = useState(true);
    const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);
    // Set to true if an update is available
    const [updateAvailable, setUpdateAvailable] = useState(false);
    const [newAccountData, setNewAccountData] = useState<FF3NewAccount | undefined>();
    // Disable the login button on startup
    const [loginDisabled, setLoginDisabled] = useState(true);
    // Tracks the token field value so the login button can read it without querySelector
    const [tokenInput, setTokenInput] = useState('');
    // Index (within `transactions`) of the row currently being edited; undefined when none
    const [editingTxnIdx, setEditingTxnIdx] = useState<number | undefined>();
    // Lazy-loaded metadata for the autocomplete fields in the editor
    const [editorMetadata, setEditorMetadata] = useState<{
        accounts: AccountRead[];
        categories: CategoryRead[];
        budgets: BudgetRead[];
        bills: BillRead[];
        tags: string[];
    }>();
    const [metadataLoading, setMetadataLoading] = useState(false);

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
        console.warn('fetching accounts: ', currentToken);
        ApiService.getAccounts(currentToken?.value).then(accntResponse => {
            // TODO: Fix response when token has expired.
            console.log('accntResponse', accntResponse);
            if (accntResponse && accntResponse.length >= 0) {
                setAccounts(accntResponse);
                // If we got accounts back, then store the token
                if (currentToken && currentToken.value) {
                    if ((document.getElementById('chkStoreToken') as HTMLInputElement)?.checked) { // Only store the token if user requested
                        localStorage.setItem('token', JSON.stringify(currentToken));
                    }
                    setToken(currentToken);
                }
            } else if (accntResponse === null) {  // If the response is null, that means we got an unauthorized response
                if (currentToken && (!token || !token.value)) {
                    setToken(undefined);
                }
                ApiService.reset();
            }
        }).catch(e => {
            console.error('could not get accounts', e);
            if (currentToken && currentToken.value?.length > 0) {
                // localStorage.removeItem('token');
                ApiService.reset();
                setToken(undefined);
                // Set the error on timeout to allow the page to render
                // setTimeout(() => {
                console.log("setting error");
                setErrorMessage(e.message);
                // }, 5000); 
            }
        });
    }, [token]);

    const processAccount = useCallback((accountOfxData?: OfxData) => {
        if (!accountOfxData && !ofxData) {
            return;
        } else if (!accountOfxData) {
            accountOfxData = ofxData;
        }
        if (accounts && accounts?.length >= 0) {
            // Make sure we do not have an error
            setErrorMessage(undefined);
            // Find the account
            const theAccount = accounts.find(account => {
                return account && account.attributes?.account_number === accountOfxData?.accounts[ofxAccountIndex].accountNumber;
            });
            if (theAccount) {
                setProcessed(false);
                setShowFileDrop(false);
                setSelectedAccount(theAccount);
                setOfxData(accountOfxData);
            } else {
                console.log('NO matching account found...');
                // It is possible that the account number is masked, or it contains other characters than a-z or 0-9
                // so do a secondary search
                if (accountOfxData?.accounts[ofxAccountIndex].accountNumber) {
                    const tmpAccountNumber = new RegExp(accountOfxData.accounts[ofxAccountIndex].accountNumber.replace(/[^0-9|a-z|*]/gi, '').replace(/\*{1,}/, '.*'));
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
                        setOfxData(accountOfxData);
                        if (partialMatchedAccounts.length === 1) {
                            setProcessed(false);
                            setSelectedAccount(partialMatchedAccounts[0]);
                        } else if (partialMatchedAccounts.length > 1) {
                            // Find the bank name
                            setBankName(
                                BankInfo.find((info: IntuitBankInfo) => {
                                    return info.id1 === accountOfxData.intuitId;
                                }
                            )?.name || '');
                            setMatchingAccounts(partialMatchedAccounts);
                            setErrorMessage(ERROR_MATCH_MULTIPLE_ACCOUNT);
                        }
                    } else {
                        // Let us ask the user if they want to create an account
                        const bankName = BankInfo.find((info: IntuitBankInfo) => {
                                    return info.id1 === accountOfxData.intuitId;
                                }
                            )?.name || '';
                        setBankName(bankName);
                        console.log('accountOfxData.accounts[ofxAccountIndex].accountType?.toLowerCase()', accountOfxData.accounts[ofxAccountIndex].accountType?.toLowerCase());
                        console.log('accountOfxData ROLE', accountOfxData.accounts[ofxAccountIndex].accountType?.toLowerCase() === 'savings' ? AccountRoleProperty.SAVING_ASSET : accountOfxData.accounts[ofxAccountIndex].accountType?.toLowerCase() === 'checking' ? AccountRoleProperty.DEFAULT_ASSET : AccountRoleProperty.CC_ASSET);
                        console.log('accountOfxData.accounts[ofxAccountIndex].accountType', accountOfxData.accounts[ofxAccountIndex].accountType);
                        console.log('accountOfxData.accounts[ofxAccountIndex].accountNumber', accountOfxData.accounts[ofxAccountIndex].accountNumber);
                        console.log('accountOfxData NAME', accountOfxData.accounts[ofxAccountIndex].accountType + ' ' + accountOfxData.accounts[ofxAccountIndex].accountNumber.substring(accountOfxData.accounts[ofxAccountIndex].accountNumber.length-4));
                        const role = accountOfxData.accounts[ofxAccountIndex].accountType?.toLowerCase() === 'savings' ? AccountRoleProperty.SAVING_ASSET : accountOfxData.accounts[ofxAccountIndex].accountType?.toLowerCase() === 'checking' ? AccountRoleProperty.DEFAULT_ASSET : AccountRoleProperty.CC_ASSET;
                        setNewAccountData({
                            name: accountOfxData.accounts[ofxAccountIndex].accountType + ' ' + accountOfxData.accounts[ofxAccountIndex].accountNumber.substring(accountOfxData.accounts[ofxAccountIndex].accountNumber.length-4),
                            number: accountOfxData.accounts[ofxAccountIndex].accountNumber,
                            currency: accountOfxData.accounts[ofxAccountIndex].currency,
                            role,
                            institution: accountOfxData.org,
                            bank: bankName
                        })
                        setOfxData(accountOfxData);
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
    },[accounts, ofxAccountIndex, ofxData]);

    const resetState = useCallback(() => {
        setMatchingAccounts(undefined);
        setSelectedAccount(undefined);
        setTransactions([]);
        setProgress(0);
    },[]);

    const handleImportAnother = useCallback(() => {
        resetState();
        setOfxData(undefined);
        setProcessed(false);
        setShowFileDrop(true);
        setErrorMessage(undefined);
        setNewAccountData(undefined);
        setOfxAccountIndex(0);
    }, [resetState]);

    const showFile = useCallback((files: File[]) => {
        console.log('showFile files[0].name', files[0]);
        setErrorMessage(undefined);

        if (files.length > 1 || (files[0] && !(/\.(ofx|qfx)$/gi).test(files[0].name))) {
            console.log('Too many files');
            setErrorMessage(ERROR_FILE_COUNT_TYPE);
            return;
        } else if (files.length === 1) {
            // Reset our state before reading the new file
            setOfxData(undefined);
            // in case our OFX account index is higher than 0 (i.e. we just processed a multi-account ofx), then
            // set it back to zero in case the new file does not have multiple accounts;
            setOfxAccountIndex(0);
            resetState();

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
                try {
                    const tmpOfxData = Utils.getOfxData(parsedData);
                    console.info('parsed data', tmpOfxData);

                    if (!tmpOfxData || tmpOfxData.accounts.length === 0) {
                        console.warn('Either tmpOfxData is undefined/null or there are no transactions in the OFX file...');
                        setErrorMessage(ERROR_NO_TRANSACTIONS);
                    } else {
                        tmpOfxData.accounts[0].status = OfxAccountStatus.PROCESSING; 
                        setOfxData(tmpOfxData);
                        processAccount(tmpOfxData);
                    }
                } catch(e) {
                    console.error(e);
                    setErrorMessage(ERROR_BAD_OFX);
                }
                
            };

            // start reading the new file (This will trigger the onload event above)
            reader.readAsText(files[0]);
        }
    }, [ofxData, ofxAccountIndex, resetState, processAccount]);

    const selectAccount = async (accnt: AccountRead) => {
        setProcessed(false);
        setSelectedAccount(accnt);
        setMatchingAccounts(undefined);
        setErrorMessage(undefined);
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
                setAccounts(undefined);
                setErrorMessage(undefined);
                return;
            } 
        }
        console.error('FAILIED TO CREATED ACCOUNT');
        setShowFileDrop(true);
        setErrorMessage(ERROR_NEW_ACCOUNT_FAILED);
    }


    // This method adds a new transaction to the Firefly account based on user request
    const addAnyways = async (existingTxn: OfxParsedTransaction) => {
        if (existingTxn.importStatus?.ff3Txn2Import) {
            const newTransaction = await addTransaction(existingTxn.importStatus?.ff3Txn2Import);

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
    const addTransaction = useCallback(async (newTxn: TransactionStoreWritable): Promise<OfxParsedTransaction["importStatus"]> => {
        console.log('Adding new transaction', newTxn);
        let newTransaction: OfxParsedTransaction["importStatus"];
        const newTransactionResp = await ApiService.addTransaction(newTxn);

        if (newTransactionResp && !(newTransactionResp as ValidationErrorResponse).message) {
            console.log('Added new transaction successfully', newTransactionResp);
            newTransaction = {
                status: OfxImportStatus.SUCCESS,
                ff3TxnImported: newTransactionResp as TransactionRead,
            };
        } else {
            console.log('New transaction failed', newTransactionResp);
            const err = newTransactionResp as ValidationErrorResponse;
            newTransaction = {
                status: OfxImportStatus.FAILURE,
                statusMessage: err.message,
                statusError: err.errors,
                ff3Txn2Import: newTxn,
            };
        }
        return newTransaction;
    }, []);

    const ensureEditorMetadata = useCallback(async () => {
        if (editorMetadata || metadataLoading) return;
        setMetadataLoading(true);
        try {
            const [allAccounts, categories, budgets, bills, tags] = await Promise.all([
                ApiService.listAllAccounts(),
                ApiService.listCategories(),
                ApiService.listBudgets(),
                ApiService.listBills(),
                ApiService.listTags(),
            ]);
            setEditorMetadata({ accounts: allAccounts, categories, budgets, bills, tags });
        } catch (e) {
            console.error('Failed to load editor metadata', e);
        } finally {
            setMetadataLoading(false);
        }
    }, [editorMetadata, metadataLoading]);

    const handleStartEdit = useCallback((idx: number) => {
        setEditingTxnIdx(idx);
        ensureEditorMetadata();
    }, [ensureEditorMetadata]);

    const handleCancelEdit = useCallback(() => {
        setEditingTxnIdx(undefined);
    }, []);

    const handleEditSaved = useCallback((idx: number, updated: TransactionRead) => {
        setTransactions((prev) => prev.map((t, i) => {
            if (i !== idx || !t.importStatus) return t;
            // Update the transactions in the matching transactions
            const newMatching = t.importStatus.matchingTransactions
                ? t.importStatus.matchingTransactions.map((m) => (m.id === updated.id ? { ...updated, totalMatch: m.totalMatch } : m))
                : t.importStatus.matchingTransactions;
            //return the new import status updating the ff3Txn2Import and matchingTransactions with edited set to true
            return {
                ...t,
                importStatus: {
                    ...t.importStatus,
                    ff3TxnImported: t.importStatus.ff3TxnImported ? updated : t.importStatus.ff3TxnImported,
                    matchingTransactions: newMatching,
                    edited: true,
                },
            };
        }));
        // Merge any newly-created categories/budgets/bills/tags/accounts that FF3
        // auto-resolved from *_name fields into the cached editor metadata, so the
        // next edit's autocompletes show them without a refetch.
        setEditorMetadata((meta) => {
            if (!meta) return meta;
            const knownCat = new Set(meta.categories.map((c) => c.attributes.name));
            const knownBud = new Set(meta.budgets.map((b) => b.attributes.name));
            const knownBill = new Set(meta.bills.map((b) => b.attributes.name).filter((n): n is string => !!n));
            const knownTag = new Set(meta.tags);
            const knownAccount = new Set(meta.accounts.map((a) => `${a.id}|${a.attributes.name}`));
            const newCats: CategoryRead[] = [];
            const newBuds: BudgetRead[] = [];
            const newBills: BillRead[] = [];
            const newTags: string[] = [];
            const newAccounts: AccountRead[] = [];
            for (const s of updated.attributes.transactions) {
                if (s.category_name && !knownCat.has(s.category_name)) {
                    newCats.push({ type: 'categories', id: s.category_id ?? '', attributes: { name: s.category_name } } as CategoryRead);
                    knownCat.add(s.category_name);
                }
                if (s.budget_name && !knownBud.has(s.budget_name)) {
                    newBuds.push({ type: 'budgets', id: s.budget_id ?? '', attributes: { name: s.budget_name } } as BudgetRead);
                    knownBud.add(s.budget_name);
                }
                if (s.bill_name && !knownBill.has(s.bill_name)) {
                    newBills.push({ type: 'bills', id: s.bill_id ?? '', attributes: { name: s.bill_name } } as BillRead);
                    knownBill.add(s.bill_name);
                }
                for (const tag of s.tags ?? []) {
                    if (!knownTag.has(tag)) {
                        newTags.push(tag);
                        knownTag.add(tag);
                    }
                }
                // FF3 may have auto-created expense/revenue accounts from the typed names.
                // Synthesize records using the resolved ids so the next edit's account
                // dropdown contains them. Type is inferred from the side that's
                // typically auto-created for each transaction type.
                if (s.source_name && s.source_id) {
                    const key = `${s.source_id}|${s.source_name}`;
                    if (!knownAccount.has(key)) {
                        newAccounts.push({
                            type: 'accounts',
                            id: s.source_id,
                            attributes: { name: s.source_name, type: (s.source_type ?? 'asset') as never },
                        } as AccountRead);
                        knownAccount.add(key);
                    }
                }
                if (s.destination_name && s.destination_id) {
                    const key = `${s.destination_id}|${s.destination_name}`;
                    if (!knownAccount.has(key)) {
                        newAccounts.push({
                            type: 'accounts',
                            id: s.destination_id,
                            attributes: { name: s.destination_name, type: (s.destination_type ?? 'asset') as never },
                        } as AccountRead);
                        knownAccount.add(key);
                    }
                }
            }
            if (!newCats.length && !newBuds.length && !newBills.length && !newTags.length && !newAccounts.length) {
                return meta;
            }
            return {
                accounts: newAccounts.length ? [...meta.accounts, ...newAccounts] : meta.accounts,
                categories: newCats.length ? [...meta.categories, ...newCats] : meta.categories,
                budgets: newBuds.length ? [...meta.budgets, ...newBuds] : meta.budgets,
                bills: newBills.length ? [...meta.bills, ...newBills] : meta.bills,
                tags: newTags.length ? [...meta.tags, ...newTags] : meta.tags,
            };
        });
        setEditingTxnIdx(undefined);
    }, []);

    const handleEditDeleted = useCallback((idx: number) => {
        setTransactions((prev) => prev.map((t, i) => {
            if (i !== idx || !t.importStatus) return t;
            return {
                ...t,
                importStatus: {
                    ...t.importStatus,
                    status: OfxImportStatus.DELETED,
                    statusMessage: 'Deleted from FireFly III by you',
                    ff3TxnImported: undefined,
                    matchingTransactions: undefined,
                    edited: false,
                },
            };
        }));
        setEditingTxnIdx(undefined);
    }, []);

    const processTransactions = useCallback(async () => {
        // Process each transaction by
        // 1) searching for a transaction within a +/- 3 day range
        // 2) comparing to see if a transaction with this amount exists that has a same or different external reference
        // 3) if same external ref, then it must be a match
        // 4) if different internet ref, the it could be a match (prompt the user to choose)
        console.log('ofxData', ofxData);
        console.info('added transactions: ' , transactions.length);
        console.info('ofxTransactions: ', ofxData?.accounts[ofxAccountIndex].transactions?.length);
        console.info('selected account: ', selectedAccount);

        // The length of transactions is used to process the ofxData transactions, so we must make sure
        // that the length of transactions does not exceed the ofxData transactions so we do not get an
        // index out of bounds
        if (selectedAccount && ofxData && ofxData.accounts[ofxAccountIndex].transactions && transactions.length < ofxData.accounts[ofxAccountIndex].transactions.length) {
            console.log('selectedAccount', selectedAccount);
            // Now loop through the transactions and search for each one
            const parsedTxn = ofxData.accounts[ofxAccountIndex].transactions[transactions.length];

            if (parsedTxn) {
                // We do this to make sure we only have 2 digit decimals
                const parsedAmount = parsedTxn.amount ? parseFloat(parsedTxn.amount.toFixed(2)) : 0;

                console.log('Processing OFX transaction', parsedTxn.description, parsedTxn);

                const relatedTransactions = await ApiService.getAccountTransactions(
                    selectedAccount.id,
                    moment(parsedTxn.datePosted).add(-3, 'days'),
                    moment(parsedTxn.datePosted).add(3, 'days'),
                ),
                    matchingTransactions: MatchedTransaction[] = [];
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
                            const matched: MatchedTransaction = ffTxn;
                            matched.totalMatch = true; // Lets set a custom property so we can display this differently in matched transactions
                            matchingTransactions.push(matched);
                            // proceed = false;
                        }
                        if (exactMatchFound) {
                            break;
                        }
                    }
                }

                const newTxn: TransactionStoreWritable = {
                    error_if_duplicate_hash: true,
                    apply_rules: true,
                    group_title: null,
                    transactions: [
                        {
                            type: parsedTxn.amount >= 0 ? TransactionTypeProperty.DEPOSIT : TransactionTypeProperty.WITHDRAWAL,
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
                        status: exactMatchFound ? OfxImportStatus.MATCH_EXACT : OfxImportStatus.MATCH_VALUE,
                        matchingTransactions: matchingTransactions,
                        ff3Txn2Import: newTxn,
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
                setProgress(((transactions.length+1) / ofxData.accounts[ofxAccountIndex].transactions.length) * 100);
            }
        } else {
            console.log('Done processing! Updating final account balance...');
            if (ofxData) {
                ofxData.accounts[ofxAccountIndex].status = OfxAccountStatus.PROCESSED;
                setOfxData(ofxData);
                // IF there were no transactions in the file, set the error
                if (ofxData.accounts[ofxAccountIndex].transactions && ofxData.accounts[ofxAccountIndex].transactions.length === 0) {
                    console.warn('There are no transactions in the OFX file...');
                    setErrorMessage(ERROR_NO_TRANSACTIONS);
                }
            }
            setProcessed(true);
            console.log('Processed Transactions', progress, transactions);
        }
    }, [ofxData, transactions, ofxAccountIndex, selectedAccount, progress, addTransaction]);

    /**
     * Start processing transactions when proper state is set.
     */
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
            console.debug('Found local token!  Fetching accounts...');
            // initialize the http client
            if (!accounts) {
                console.debug('Fetching accounts(localToken)...');
                ApiService.getHttp(localToken.value);
                init(localToken);
            }
        }
    }, [accounts, init]);

    useEffect(() => {
        checkForUpdates();
    }, [checkForUpdates]);

    useEffect(() => {
        if (ofxAccountIndex > 0) {
            processAccount();
        }
    }, [ofxAccountIndex, processAccount]);


    // This is used to process the next account in a multi-account ofx file
    const handleNextAccount = (idx: number) => {
        if (ofxData && idx < (ofxData.accounts.length || 0)) {
            ofxData.accounts[idx].status = OfxAccountStatus.PROCESSING;
            resetState();
            setOfxAccountIndex(idx);
        }
    };

    const bankBalance: number = ofxData ? parseFloat(parseFloat('' + ofxData.accounts[ofxAccountIndex].balance).toFixed(2)) : 0;

    // console.debug('Account role:', newAccountData?.role);

    const activeStep = !token ? 0
        : (showFileDrop && !processed && transactions.length === 0) ? 1
        : !processed ? 2
        : 3;

    return (
        <div className="App">
            <AppBar position="sticky">
                <Toolbar>
                    <Typography variant="h6" sx={{ flex: 1, fontWeight: 700 }}>
                        ff3<Box component="span" sx={{ color: 'primary.light' }}>-ofx</Box>
                    </Typography>
                    <Box component="span" sx={{ mr: 2, px: 1, py: '2px', background: 'rgba(255,255,255,.1)', borderRadius: '10px', fontSize: '11px', color: 'primary.light', fontWeight: 500 }}>
                        v{__APP_VERSION__}
                    </Box>
                    {token && (
                        <Button
                            color="inherit"
                            size="small"
                            startIcon={<RefreshIcon />}
                            onClick={() => { localStorage.removeItem('token'); window.location.reload(); }}
                        >
                            Reset Token
                        </Button>
                    )}
                </Toolbar>
            </AppBar>
            {updateAvailable && (
                <Alert variant="outlined" severity="info">
                    You are currently running <b>{__APP_NAME__}</b> version <b>{__APP_VERSION__}</b>.  There is a new version available <a href="https://github.com/pelaxa/ff3-ofx/releases/latest" target="_new">here</a>.
                </Alert>
            )}
            <div className="App-header">
                <Box sx={{ display: 'flex', backgroundColor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: '6px', p: '4px', width: 700 }}>
                    {(['Login', 'Import', 'Processing', 'Done'] as const).map((label, idx) => (
                        <Box key={label} sx={{
                            flex: 1, py: '8px', textAlign: 'center', borderRadius: '4px',
                            fontSize: '12px', fontWeight: 500, userSelect: 'none',
                            color: activeStep === idx ? '#fff' : 'text.secondary',
                            backgroundColor: activeStep === idx ? 'primary.main' : 'transparent',
                            transition: 'all .15s',
                        }}>
                            {idx + 1} · {label}
                        </Box>
                    ))}
                </Box>
                <Collapse in={!!errorMessage} unmountOnExit>
                    <Alert severity="error" action={<IconButton size="small" onClick={() => { setErrorMessage(undefined); }}><CloseIcon /></IconButton>}>{errorMessage}</Alert>
                </Collapse>
                <Collapse in={!token} unmountOnExit>
                    <Card sx={{ width: 500 }}>
                        <CardContent sx={{ p: 3 }}>
                            <Typography variant='subtitle1' sx={{ mb: 1 }}>Connect to FireFly III</Typography>
                            <Typography variant='body2' sx={{ mb: 3, color: 'text.secondary' }}>
                                Enter your personal access token to get started. You can find or create one in
                                FireFly III under <em>Profile → OAuth → Personal Access Tokens</em>.
                            </Typography>
                            <TextField
                                required
                                focused
                                fullWidth
                                color="primary"
                                variant="filled"
                                id="outlined-password-input"
                                label="Personal Access Token"
                                type="password"
                                autoComplete="current-password"
                                value={tokenInput}
                                onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                                    setTokenInput(event.target.value);
                                    if (event.target.value.trim().length > 0) {
                                        setLoginDisabled(false);
                                    } else {
                                        setLoginDisabled(true);
                                    }
                                }}
                            />
                            <FormControlLabel
                                sx={{ mt: 1, mb: 2, display: 'block' }}
                                control={<Checkbox id={'chkStoreToken'} />}
                                label="Remember token for next time"
                            />
                            <Button fullWidth variant="contained" disabled={loginDisabled} onClick={() => init({ value: tokenInput.trim() })}>
                                Login
                            </Button>
                        </CardContent>
                    </Card>
                </Collapse>
                <Collapse in={!!token && showFileDrop}  unmountOnExit>
                    <Card sx={{ width: 560 }}>
                        <CardContent sx={{ p: 3 }}>
                            <Typography variant='subtitle2' sx={{ mb: 2, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'primary.light' }}>
                                Import OFX / QFX File
                            </Typography>
                            <FileDrop errorMessage={errorMessage} fileLimit={1} onChange={showFile} />
                        </CardContent>
                    </Card>
                </Collapse>
                <Collapse in={ofxData && ofxData?.accounts.length > 1}  unmountOnExit>
                    <OfxSummary accounts={ofxData?.accounts || []} clickHandler={handleNextAccount} selectionAllowed={processed}/>
                </Collapse>
                <Collapse in={!!token && !showFileDrop && !!matchingAccounts && matchingAccounts.length > 1}  unmountOnExit>
                    <Card sx={{ width: 720 }}>
                        <CardContent sx={{ p: 3 }}>
                            <Typography variant='subtitle2' sx={{ mb: 1, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'primary.light' }}>
                                Pick an Account
                            </Typography>
                            <Typography variant='subtitle1' sx={{ mb: 1 }}>Multiple matching accounts found</Typography>
                            <Typography variant='body2' sx={{ mb: 3, color: 'text.secondary' }}>
                                Select the FireFly III account that should receive the transactions from this file.
                            </Typography>

                            <Box sx={{
                                display: 'grid',
                                gridTemplateColumns: 'max-content 1fr',
                                columnGap: 2,
                                rowGap: 1,
                                p: 2,
                                mb: 2,
                                backgroundColor: 'background.default',
                                border: '1px solid',
                                borderColor: 'divider',
                                borderRadius: 2,
                            }}>
                                <Typography variant='caption' sx={{ color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.6px' }}>Account Number</Typography>
                                <Typography variant='body2'>{ofxData?.accounts[ofxAccountIndex].accountNumber || '—'}</Typography>
                                <Typography variant='caption' sx={{ color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.6px' }}>Account Type</Typography>
                                <Typography variant='body2'>{ofxData?.accounts[ofxAccountIndex].accountType || '—'}</Typography>
                                {ofxData?.org && (
                                    <>
                                        <Typography variant='caption' sx={{ color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.6px' }}>Org</Typography>
                                        <Typography variant='body2'>{ofxData.org}</Typography>
                                    </>
                                )}
                                {(bankName || ofxData?.intuitId) && (
                                    <>
                                        <Typography variant='caption' sx={{ color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.6px' }}>Bank</Typography>
                                        <Typography variant='body2'>
                                            {bankName || '—'}
                                            {ofxData?.intuitId && <Box component="span" sx={{ color: 'text.secondary', ml: 1 }}>({ofxData.intuitId})</Box>}
                                        </Typography>
                                    </>
                                )}
                            </Box>

                            <Stack spacing={1} sx={{ maxHeight: '50vh', overflowY: 'auto', pr: 1 }}>
                                {matchingAccounts?.map((accnt) => (
                                    <Box key={`ofxAccnt_${accnt.attributes.account_number}`} sx={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        gap: 2,
                                        p: 2,
                                        backgroundColor: 'background.default',
                                        border: '1px solid',
                                        borderColor: 'divider',
                                        borderRadius: 2,
                                    }}>
                                        <Box sx={{ minWidth: 0, flex: 1 }}>
                                            <Typography variant='subtitle2' sx={{ mb: '4px' }}>{accnt.attributes.name}</Typography>
                                            <Typography variant='caption' sx={{ color: 'text.secondary', display: 'block' }}>
                                                Account #{accnt.attributes.account_number || '—'}
                                                {accnt.attributes.iban && <> · IBAN {accnt.attributes.iban}</>}
                                                {accnt.attributes.bic && <> · BIC {accnt.attributes.bic}</>}
                                            </Typography>
                                        </Box>
                                        <Button
                                            variant="contained"
                                            startIcon={<CheckIcon />}
                                            onClick={() => selectAccount(accnt)}
                                            sx={{ flexShrink: 0 }}
                                        >
                                            Select
                                        </Button>
                                    </Box>
                                ))}
                            </Stack>
                        </CardContent>
                    </Card>
                </Collapse>
                <Collapse in={!!token && !showFileDrop && !!newAccountData}  unmountOnExit>
                    <Card sx={{ width: 560 }}>
                        <CardContent sx={{ p: 3 }}>
                            <Typography variant='subtitle2' sx={{ mb: 1, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'primary.light' }}>
                                Create Account
                            </Typography>
                            <Typography variant='subtitle1' sx={{ mb: 1 }}>No matching account found</Typography>
                            <Typography variant='body2' sx={{ mb: 3, color: 'text.secondary' }}>
                                None of your FireFly III accounts matched the account number in this file.
                                Create one below to import the transactions.
                            </Typography>

                            <Stack spacing={2}>
                                <TextField
                                    id="newAccountName"
                                    label="Account Name"
                                    fullWidth
                                    variant="filled"
                                    defaultValue={newAccountData?.name}
                                    onBlur={(event: React.FocusEvent<HTMLInputElement>) => setNewAccountData({ number: '', ...newAccountData, name: (event.target.value || '') })}
                                />
                                <TextField
                                    id="newAccountNumber"
                                    label="Account Number"
                                    fullWidth
                                    variant="filled"
                                    defaultValue={newAccountData?.number}
                                    onBlur={(event: React.FocusEvent<HTMLInputElement>) => setNewAccountData({ name: '', ...newAccountData, number: (event.target.value || '???') })}
                                />
                                <FormControl fullWidth variant="filled">
                                    <InputLabel id="newAccountRole-label">Account Type</InputLabel>
                                    <Select
                                        labelId="newAccountRole-label"
                                        id="newAccountRole"
                                        value={newAccountData?.role || 'defaultAsset'}
                                        onChange={(event: SelectChangeEvent) => {
                                            setNewAccountData({ number: '', name: '', ...newAccountData, role: event.target.value as AccountRoleProperty });
                                        }}
                                    >
                                        <MenuItem value={'defaultAsset'}>Default Asset</MenuItem>
                                        <MenuItem value={'sharedAsset'}>Shared Asset</MenuItem>
                                        <MenuItem value={'savingAsset'}>Savings Asset</MenuItem>
                                        <MenuItem value={'ccAsset'}>Credit Card</MenuItem>
                                        <MenuItem value={'cashWalletAsset'}>Cash Wallet</MenuItem>
                                    </Select>
                                </FormControl>

                                <Box sx={{
                                    display: 'grid',
                                    gridTemplateColumns: 'max-content 1fr',
                                    columnGap: 2,
                                    rowGap: 1,
                                    p: 2,
                                    backgroundColor: 'background.default',
                                    border: '1px solid',
                                    borderColor: 'divider',
                                    borderRadius: 2,
                                }}>
                                    <Typography variant='caption' sx={{ color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.6px' }}>Currency</Typography>
                                    <Typography variant='body2'>{newAccountData?.currency || '—'}</Typography>
                                    {newAccountData?.institution && (
                                        <>
                                            <Typography variant='caption' sx={{ color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.6px' }}>Institution</Typography>
                                            <Typography variant='body2'>{newAccountData.institution}</Typography>
                                        </>
                                    )}
                                    {newAccountData?.bank && (
                                        <>
                                            <Typography variant='caption' sx={{ color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.6px' }}>Bank</Typography>
                                            <Typography variant='body2'>{newAccountData.bank}</Typography>
                                        </>
                                    )}
                                </Box>
                            </Stack>

                            <Box sx={{ display: 'flex', flexDirection: 'row', justifyContent: 'flex-end', gap: 1, mt: 3 }}>
                                <Button variant="outlined" color="secondary" onClick={() => { window.location.reload(); }}>Cancel</Button>
                                <Button variant="contained" color="success" onClick={() => { createAccount(newAccountData); }}>Add Account</Button>
                            </Box>
                        </CardContent>
                    </Card>
                </Collapse>
                {transactions && transactions.length > 0 && (
                    <>
                        <Summary bankBalance={bankBalance} accountId={selectedAccount?.id} processed={processed} progress={progress} />
                        {processed && (
                            <Box sx={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                width: 960, mb: 1, p: '20px 24px',
                                backgroundColor: 'background.default',
                                border: '1px solid',
                                borderColor: 'divider',
                                borderRadius: 2,
                                gap: 2,
                            }}>
                                <Box>
                                    <Typography variant="subtitle2">Import another file?</Typography>
                                </Box>
                                <Button variant="outlined" startIcon={<RefreshIcon />} onClick={handleImportAnother} sx={{ flexShrink: 0 }}>
                                    Import another file
                                </Button>
                            </Box>
                        )}
                        <div className="scrollview" >
                            <TableContainer component={Paper} sx={{ maxHeight: '70vh' }}>
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
                                            <OfxTransactionsRow
                                                key={`ofxRow_${idx}`}
                                                transaction={transaction}
                                                index={idx}
                                                importTransaction={addAnyways}
                                                isEditing={editingTxnIdx === idx}
                                                onStartEdit={handleStartEdit}
                                                onSaved={handleEditSaved}
                                                onDeleted={handleEditDeleted}
                                                onCancelEdit={handleCancelEdit}
                                                accounts={editorMetadata?.accounts}
                                                categories={editorMetadata?.categories}
                                                budgets={editorMetadata?.budgets}
                                                bills={editorMetadata?.bills}
                                                tags={editorMetadata?.tags}
                                            />
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
