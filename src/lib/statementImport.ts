import moment from 'moment';
import {
    TransactionTypeProperty,
    type TransactionRead,
    type TransactionStoreWritable,
    type ValidationErrorResponse,
} from '@billos/firefly-iii-sdk';
import { ImportStore, MatchedTransaction, OfxImportStatus, OfxParsedTransaction } from '@/lib/interfaces';

/**
 * This method adds a new transaction to the Firefly account
 * @param store Where the transaction is stored
 * @param newTxn The Firefly transaction to store
 * @returns SUCCESS with the stored transaction, or FAILURE with the message and errors Firefly gave
 */
export const addNewTransaction = async (store: ImportStore, newTxn: TransactionStoreWritable): Promise<OfxParsedTransaction["importStatus"]> => {
    console.log('Adding new transaction', newTxn);
    let newTransaction: OfxParsedTransaction["importStatus"];
    const newTransactionResp = await store.addTransaction(newTxn);

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
};

/**
 * Look through the already-existing Firefly transactions for ones that correspond to the parsed OFX transaction.
 * @param parsedTxn The transaction read from the OFX file
 * @param relatedTransactions The Firefly transactions found around the same date (may be empty or missing)
 * @param accountId The id of the Firefly account the OFX file is being imported into
 * @returns
 *  - matchingTransactions: the existing Firefly transactions that look like this OFX transaction
 *  - exactMatchFound: true only when the id AND the amount match, so we are sure it was already imported
 *  - proceed: false once a match is found, meaning the transaction should not be added again
 */
export const findMatches = (
    parsedTxn: OfxParsedTransaction,
    relatedTransactions: TransactionRead[] | null | undefined,
    accountId: string,
) => {
    // We do this to make sure we only have 2 digit decimals
    const parsedTxnAmount = parsedTxn.transactions.reduce((txnSum, txn) => txnSum+parseFloat((txn.amount || 0).toFixed(2)), 0);
    const matchingTransactions: MatchedTransaction[] = [];
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
                console.log('    **** ffAmount:', txnAmount, ' <==> Bank Amount:', parsedTxnAmount);
                console.log('    **** ffExtId:', txn.external_id, 'ffIntId:', txn.internal_reference, ' <==> Bank ID:', parsedTxn.transactions[0].transactionId);
                console.log('    **** ffSourceAccount:', txn.source_id, ', ffDestinationAccount:', txn.destination_id, ' <==> Bank Account:', accountId);
                // First we check for an exact match based on internal or external id.
                // parsedTxn.transactionId should be unique but it is not in all cases,
                // so we check that and the amount
                if ((
                    (txn.internal_reference && txn.internal_reference === parsedTxn.transactions[0].transactionId) ||
                    (txn.external_id && txn.external_id === parsedTxn.transactions[0].transactionId)
                ) && Math.abs(txnAmount || 0) === Math.abs(parsedTxnAmount || 0)) {
                    proceed = false;
                    exactMatchFound = true;
                    matchingTransactions.push(ffTxn);
                    console.log('********** Found EXACT match');
                    break;
                } else if (txnAmount) {
                    runningTotal += txnAmount;
                    if (txnAmount === Math.abs(parsedTxnAmount)) {
                        // amountMatchFound = true;
                        if (
                            (parsedTxnAmount < 0 && txn.source_id === accountId) ||
                            (parsedTxnAmount >= 0 && txn.destination_id === accountId)
                        ) {
                            console.log('********** Found AMOUNT match');
                            // console.info(
                            //     '********** Found AMOUNT match, parsedTxn.amount',
                            //     parsedTxnAmount,
                            //     'Source match: ',
                            //     txn.source_id === selectedAccount.id,
                            //     'Dest match: ',
                            //     txn.destination_id === selectedAccount.id,
                            // );

                            matchingTransactions.push(ffTxn);
                            // If the description also matches, then it is an exact match
                            if (parsedTxn.transactions[0].description === txn.description) {
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
                ffTxn.attributes.transactions.length > 1 && parseFloat(runningTotal.toFixed(2)) === Math.abs(parsedTxnAmount) &&
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

    return { matchingTransactions, proceed, exactMatchFound };
};

/**
 * Build the Firefly transaction that would be stored for the parsed OFX transaction.
 * Each OFX sub-transaction becomes one split: a positive amount is a deposit into the
 * account, a negative amount is a withdrawal out of it.
 * @param parsedTxn The transaction read from the OFX file
 * @param accountId The id of the Firefly account the money moves into or out of
 * @param importTag The tag put on every split so the transactions of one import can be found together
 * @returns The transaction ready to be stored in Firefly
 */
export const buildNewTransaction = (parsedTxn: OfxParsedTransaction, accountId: string, importTag: string): TransactionStoreWritable => {
    const newTxn: TransactionStoreWritable = {
        error_if_duplicate_hash: true,
        apply_rules: true,
        group_title: parsedTxn.title,
        transactions: [],
    };
    // Add all the sub-transactions or just the main transaction
    parsedTxn.transactions.forEach((pTxn) => {
        newTxn.transactions.push({
                type: pTxn.amount >= 0 ? TransactionTypeProperty.DEPOSIT : TransactionTypeProperty.WITHDRAWAL,
                date: pTxn.datePosted.format(),
                amount: String(Math.abs(pTxn.amount)),
                description: pTxn.description,
                notes: pTxn.memo,
                reconciled: false,
                external_id: pTxn.transactionId,
                tags: [importTag],
                destination_id: pTxn.amount >= 0 ? String(accountId) : undefined,
                source_id: pTxn.amount >= 0 ? undefined : String(accountId),
            })
    });
    return newTxn;
};

/**
 * Import one parsed OFX transaction into the given Firefly account:
 * 1) search for a transaction within a +/- 3 day range (bank dates and Firefly dates can differ slightly)
 * 2) compare to see if a transaction with this amount exists, and add it only when none does
 * @param store Where existing transactions are read from and new ones are stored
 * @param parsedTxn The transaction read from the OFX file
 * @param accountId The id of the Firefly account being imported into
 * @param importTag The tag put on the added transaction so the transactions of one import can be found together
 * @returns The import status for the row: SUCCESS or FAILURE if we tried to add it,
 *          or MATCH_EXACT / MATCH_VALUE (with the matches found) if we left it alone.
 */
export const importParsedTransaction = async (
    store: ImportStore,
    parsedTxn: OfxParsedTransaction,
    accountId: string,
    importTag: string,
): Promise<NonNullable<OfxParsedTransaction["importStatus"]>> => {
    const parsedTxnDatePosted = parsedTxn.transactions[0].datePosted;

    const relatedTransactions = await store.getAccountTransactions(
        accountId,
        moment(parsedTxnDatePosted).add(-3, 'days'),
        moment(parsedTxnDatePosted).add(3, 'days'),
    );
    const { matchingTransactions, proceed, exactMatchFound } = findMatches(parsedTxn, relatedTransactions, accountId);
    const newTxn = buildNewTransaction(parsedTxn, accountId, importTag);

    let newTransaction;
    // If proceed is still true, then we add the transaction
    if (proceed && matchingTransactions.length === 0) {
        console.log(' >>>>>> Adding new transaction', newTxn);
        newTransaction = await addNewTransaction(store, newTxn);
    }

    if (newTransaction) {
        console.log(' >>>>>> Added new transaction');
        return newTransaction;
    }
    console.log(' >>>>>> Transaction already existed');
    return {
        status: exactMatchFound ? OfxImportStatus.MATCH_EXACT : OfxImportStatus.MATCH_VALUE,
        matchingTransactions: matchingTransactions,
        ff3Txn2Import: newTxn,
    };
};
