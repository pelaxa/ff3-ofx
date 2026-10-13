import React, { useCallback, useEffect, useState } from 'react';
import ApiService from '@/lib/apiService';
import Utils from '@/lib/utils';
import moment from 'moment';
import '@/App.css';
import { FF3NewAccount, OfxAccountStatus, OfxData, OfxImportStatus, OfxParsedTransaction } from '@/lib/interfaces';
import {
    AccountRoleProperty,
    type AccountRead,
    type TransactionRead,
} from '@billos/firefly-iii-sdk';
import Button from '@mui/material/Button';
import RefreshIcon from '@mui/icons-material/Refresh';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import { Alert, AppBar, Box, Card, CardContent, Checkbox, Collapse, FormControl, FormControlLabel, IconButton, InputLabel, MenuItem, Paper, Select, SelectChangeEvent, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, ToggleButton, ToggleButtonGroup, Toolbar, Tooltip, Typography } from '@mui/material';
import { parseStrict as parseOFX } from 'ofx-js';
import Summary from '@/components/Summary';
import OfxTransactionsRow from '@/components/OfxTransactionsRow';
import FileDrop from '@/components/FileDrop';
import OfxSummary from '@/components/OfxSummary';
import AllTransactions from '@/components/AllTransactions';
import { useEditorMetadata } from '@/lib/useEditorMetadata';
import { useSession } from '@/lib/useSession';
import { addNewTransaction, importParsedTransaction } from '@/lib/statementImport';

type AppTab = 'import' | 'all';

// Import tag used to identify the import
const importTag = `OFX Import ${moment().format('YYYY-MM-DD HH:mm:ss')}`;

// bankinfo.json is imported lazily (and cached) so it is never part of the main
// bundle. It is only needed to map an Intuit id to a friendly bank name when an
// account has to be matched or created. It is stored as a compact array to keep
// the file small: each entry is [id1, name].
type CompactBankInfo = [string, string];
let bankInfoCache: Map<string, string> | undefined;
const lookupBankName = async (intuitId?: string): Promise<string> => {
    if (!intuitId) return '';
    if (!bankInfoCache) {
        const entries = (await import('@/lib/bankinfo.json')).default as CompactBankInfo[];
        bankInfoCache = new Map(entries.map(([id1, name]) => [id1, name]));
    }
    return bankInfoCache.get(intuitId) || '';
};


const ERROR_FILE_COUNT_TYPE = 'Please only drop 1 file of type OFX or QFX in this area';
const ERROR_NO_ACCOUNT = 'Please setup some accounts to be able to process transactions';
const ERROR_MATCH_ACCOUNT = 'Could not find a matching account to process transactions';
const ERROR_NO_ACCOUNT_NO = 'The provided file does not include an account number to find a matching account';
const ERROR_MATCH_MULTIPLE_ACCOUNT = 'Found multiple matching accounts';
const ERROR_NEW_ACCOUNT_FAILED = 'Could not create a new account. Please create the account in FireFlyIII before importing the transactions';
const ERROR_NO_TRANSACTIONS = 'The OFX file does not contain any transactions';
const ERROR_BAD_OFX = 'The OFX file format is not understood';

function App() {
    // Which top-level tab is active. Import is the default and shown first.
    const [activeTab, setActiveTab] = useState<AppTab>('import');
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
    const { editorMetadata, ensureEditorMetadata, mergeSavedTransaction } = useEditorMetadata();

    // Login lifecycle: the token, the accounts fetched with it, and login/logout
    const { token, accounts, login, refreshAccounts, logout } = useSession(setErrorMessage);
    // Whether the user ticked "Remember token for next time" on the login form
    const [rememberToken, setRememberToken] = useState(false);

    const checkForUpdates = useCallback(async () => {
        const myVersion = `${__APP_VERSION__}`;
        const latestVersion = await ApiService.getLatestVersion();
        if (myVersion !== latestVersion?.substring(1)) {
            console.error('THERE IS A NEW VERSION OUT', myVersion, latestVersion);
            setUpdateAvailable(true);
        }
    }, []);

    const processAccount = useCallback(async (accountOfxData?: OfxData) => {
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
                            setBankName(await lookupBankName(accountOfxData.intuitId));
                            setMatchingAccounts(partialMatchedAccounts);
                            setErrorMessage(ERROR_MATCH_MULTIPLE_ACCOUNT);
                        }
                    } else {
                        // Let us ask the user if they want to create an account
                        const bankName = await lookupBankName(accountOfxData.intuitId);
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
                const parsedData = parseOFX(e.target?.result as string);
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
    }, [resetState, processAccount]);

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
                refreshAccounts();
                setErrorMessage(undefined);
                return;
            } 
        }
        console.error('FAILIED TO CREATED ACCOUNT');
        setShowFileDrop(true);
        setErrorMessage(ERROR_NEW_ACCOUNT_FAILED);
    }


    // This method adds a new transaction to the Firefly account based on user request.
    // Uses functional state updates and has no changing dependencies so its identity
    // is stable — this keeps the memoized OfxTransactionsRow from re-rendering.
    const addAnyways = useCallback(async (existingTxn: OfxParsedTransaction) => {
        if (existingTxn.importStatus?.ff3Txn2Import) {
            const newTransaction = await addNewTransaction(ApiService, existingTxn.importStatus?.ff3Txn2Import);

            if (newTransaction) {
                existingTxn.importStatus = newTransaction;
                console.log('Added new transaction (anyways) successfully', newTransaction);
                setTransactions((prev) => [...prev]);
                // Change progress so that the summary also updates
                setProgress((p) => p + 1);
            }
        }
    }, []);

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
        // Fold anything FF3 created while saving (new category, tag, account...) into the autocomplete data
        mergeSavedTransaction(updated);
        setEditingTxnIdx(undefined);
    }, [mergeSavedTransaction]);

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
        // Bump progress so the Summary recomputes. Functional update keeps this
        // callback's identity stable (no `progress` dependency).
        setProgress((p) => p + 1);
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
                console.log('Processing OFX transaction', parsedTxn.title || parsedTxn.transactions[0].description, parsedTxn);

                parsedTxn.importStatus = await importParsedTransaction(ApiService, parsedTxn, selectedAccount.id, importTag);

                console.log(' >>>>>> transactions', transactions);
                console.log(' >>>>>> parsedTxn', parsedTxn);
                if (transactions && transactions.length > 0) {
                    console.log('adding to existing transactions...');
                    // Append (rather than prepend) so every row keeps a stable
                    // array index — the list is displayed newest-first at render
                    // time. Stable indices keep row keys/props stable so the
                    // memoized rows don't remount/re-render on every step.
                    setTransactions([...transactions, parsedTxn]);
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
    }, [ofxData, transactions, ofxAccountIndex, selectedAccount, progress]);

    /**
     * Start processing transactions when proper state is set.
     */
    useEffect(() => {
        if (accounts && ofxData && selectedAccount && !processed) {
            // If we have a selected account and new data, then start processing.
            // `processTransactions` gets a new identity on every render, so this
            // effect re-runs constantly; clearing the timer on cleanup guarantees
            // only one pending timeout exists at a time. Without this, each render
            // leaked a setTimeout that retained the (growing) transactions array
            // and kept firing re-renders, compounding across imports.
            console.log('Start processing...');
            const timerId = setTimeout(() => {
                processTransactions();
            }, 200);
            return () => clearTimeout(timerId);
        }
    }, [accounts, ofxData, processTransactions, processed, selectedAccount, transactions]);

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

    // Login is now a gate in front of both tabs, so the import stepper only
    // tracks Import → Processing → Done.
    const activeStep = (showFileDrop && !processed && transactions.length === 0) ? 0
        : !processed ? 1
        : 2;

    return (
        <div className="App">
            <AppBar position="sticky">
                <Toolbar>
                    <Typography variant="h6" sx={{ fontWeight: 700 }}>
                        ff3<Box component="span" sx={{ color: 'primary.light' }}>-ofx</Box>
                    </Typography>
                    <Box sx={{ flex: 1 }} />
                    {token && (
                        <ToggleButtonGroup
                            exclusive
                            size="small"
                            value={activeTab}
                            onChange={(_, value: AppTab | null) => { if (value) setActiveTab(value); }}
                            sx={{
                                backgroundColor: 'rgba(255,255,255,.08)',
                                '& .MuiToggleButton-root': {
                                    color: 'rgba(255,255,255,.85)',
                                    border: '1px solid rgba(255,255,255,.35)',
                                    fontWeight: 600,
                                    px: 2.2,
                                    textTransform: 'none',
                                    '&.Mui-selected': { backgroundColor: '#fff', color: 'primary.main', '&:hover': { backgroundColor: '#fff' } },
                                    '&:hover': { backgroundColor: 'rgba(255,255,255,.18)' },
                                },
                            }}
                        >
                            <ToggleButton value="import">Import</ToggleButton>
                            <ToggleButton value="all">All Transactions</ToggleButton>
                        </ToggleButtonGroup>
                    )}
                    <Box sx={{ flex: 1 }} />
                    <Tooltip
                        arrow
                        placement="bottom"
                        title={updateAvailable ? (
                            <Box sx={{ fontSize: '12px', lineHeight: 1.5, p: '2px' }}>
                                A new version of <b>{__APP_NAME__}</b> is available.<br />
                                You are running <b>v{__APP_VERSION__}</b>.{' '}
                                <Box component="a" href="https://github.com/pelaxa/ff3-ofx/releases/latest" target="_new" sx={{ color: 'primary.light', fontWeight: 600 }}>
                                    Get the latest release
                                </Box>.
                            </Box>
                        ) : ''}
                    >
                        <Box
                            component="span"
                            onClick={updateAvailable ? () => window.open('https://github.com/pelaxa/ff3-ofx/releases/latest', '_new') : undefined}
                            sx={{
                                mr: 2, px: 1, py: '2px', borderRadius: '10px', fontSize: '11px',
                                color: 'primary.light', fontWeight: 500,
                                background: updateAvailable ? 'rgba(144,202,249,.25)' : 'rgba(255,255,255,.1)',
                                cursor: updateAvailable ? 'pointer' : 'default',
                                display: 'inline-flex', alignItems: 'center', gap: '4px',
                                '@keyframes versionPulse': {
                                    '0%':   { boxShadow: '0 0 0 0 rgba(144,202,249,.55)' },
                                    '70%':  { boxShadow: '0 0 0 7px rgba(144,202,249,0)' },
                                    '100%': { boxShadow: '0 0 0 0 rgba(144,202,249,0)' },
                                },
                                animation: updateAvailable ? 'versionPulse 1.8s ease-out infinite' : 'none',
                            }}
                        >
                            v{__APP_VERSION__}{updateAvailable ? ' •' : ''}
                        </Box>
                    </Tooltip>
                    {token && (
                        <Button
                            color="inherit"
                            size="small"
                            startIcon={<RefreshIcon />}
                            onClick={logout}
                        >
                            Reset Token
                        </Button>
                    )}
                </Toolbar>
            </AppBar>
            <div className="App-header">
                <Collapse in={!!errorMessage} unmountOnExit sx={{ flexShrink: 0 }}>
                    <Alert severity="error" action={<IconButton size="small" onClick={() => { setErrorMessage(undefined); }}><CloseIcon /></IconButton>}>{errorMessage}</Alert>
                </Collapse>
                {!!token && activeTab === 'all' && (
                    <AllTransactions accounts={accounts} />
                )}
                {!!token && activeTab === 'import' && (
                    <Box sx={{ display: 'flex', backgroundColor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: '6px', p: '4px', width: 560, flexShrink: 0 }}>
                        {(['Import', 'Processing', 'Done'] as const).map((label, idx) => (
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
                )}
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
                                control={<Checkbox id={'chkStoreToken'} checked={rememberToken} onChange={(event) => setRememberToken(event.target.checked)} />}
                                label="Remember token for next time"
                            />
                            <Button fullWidth variant="contained" disabled={loginDisabled} onClick={() => login({ value: tokenInput.trim() }, rememberToken)}>
                                Login
                            </Button>
                        </CardContent>
                    </Card>
                </Collapse>
                <Collapse in={!!token && activeTab === 'import' && showFileDrop}  unmountOnExit>
                    <Card sx={{ width: 560 }}>
                        <CardContent sx={{ p: 3 }}>
                            <Typography variant='subtitle2' sx={{ mb: 2, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'primary.light' }}>
                                Import OFX / QFX File
                            </Typography>
                            <FileDrop fileLimit={1} onChange={showFile} />
                        </CardContent>
                    </Card>
                </Collapse>
                <Collapse in={activeTab === 'import' && ofxData && ofxData?.accounts.length > 1}  unmountOnExit>
                    <OfxSummary accounts={ofxData?.accounts || []} clickHandler={handleNextAccount} selectionAllowed={processed}/>
                </Collapse>
                <Collapse in={!!token && activeTab === 'import' && !showFileDrop && !!matchingAccounts && matchingAccounts.length > 1}  unmountOnExit>
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
                <Collapse in={!!token && activeTab === 'import' && !showFileDrop && !!newAccountData}  unmountOnExit>
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
                {activeTab === 'import' && transactions && transactions.length > 0 && (
                    <>
                        <Summary bankBalance={bankBalance} accountId={selectedAccount?.id} processed={processed} progress={progress} />
                        {processed && (
                            <Box className="scrollView" sx={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                mb: 1, p: '20px 24px',
                                backgroundColor: 'background.default',
                                border: '1px solid',
                                borderColor: 'divider',
                                borderRadius: 2,
                                gap: 2,
                                flexShrink: 0,
                            }}>
                                <Box>
                                    <Typography variant="subtitle2">Import another file?</Typography>
                                </Box>
                                <Button variant="outlined" startIcon={<RefreshIcon />} onClick={handleImportAnother} sx={{ flexShrink: 0 }}>
                                    Import another file
                                </Button>
                            </Box>
                        )}
                        <Box className="scrollView" sx={{ flex: 1, minHeight: 0, display: 'flex' }}>
                            <TableContainer component={Paper} sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                                <Table stickyHeader aria-label="collapsible sticky table">
                                    <TableHead>
                                        <TableRow className="Header-Row">
                                            <TableCell className="Header-Row">Description</TableCell>
                                            <TableCell align="center">Date</TableCell>
                                            <TableCell align="center">Type</TableCell>
                                            <TableCell align="right">Amount</TableCell>
                                            <TableCell align="center">Status</TableCell>
                                            <TableCell align="center">Action</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {transactions.map((transaction, idx) => ({ transaction, idx })).reverse().map(({ transaction, idx }) => (
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
                        </Box>
                    </>
                )}
            </div>
        </div>
    );
}

export default App;
