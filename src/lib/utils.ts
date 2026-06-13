import moment, { Moment } from 'moment';
import { OfxAccount, OfxAccountStatus, OfxData, OfxParsedTransaction, OfxTransaction } from '@/lib/interfaces';

const DATE_FORMAT = 'YYYYMMDDHHmmss';

class Utils {
    /**
     * This method returns parsed account data + raw ofx transactions as an array
     * @param ofxDataIn The raw parsed OFX data
     * @returns 
     */
    /* eslint-disable @typescript-eslint/no-explicit-any */
    static getOfxData(ofxDataIn: any): OfxData {
        const ofxData: OfxData = {
            accounts: [],
            org: undefined,
            intuitId: undefined
        };
        
        let ofxTransactions: OfxTransaction[]|null = null;
        // Set common settings here
        try {
            ofxData.org = ofxDataIn.OFX.SIGNONMSGSRSV1.SONRS.FI?.ORG;
            ofxData.intuitId = ofxDataIn.OFX.SIGNONMSGSRSV1.SONRS.INTUBID;
        } catch (e) {
            console.warn('OFX.SIGNONMSGSRSV1.SONRS.FI.ORG missing from OFX file', e);
        }

        const processAccount = (account: any): OfxAccount => {

            ofxTransactions = account.CCSTMTRS ? account.CCSTMTRS.BANKTRANLIST.STMTTRN : account.STMTRS.BANKTRANLIST.STMTTRN;
            // If there is only one transaction, it may not come back as an array, so make sure we have an array back
            // If there are no transactions, return an empty array.
            if (ofxTransactions && !Array.isArray(ofxTransactions)) {
                ofxTransactions = [ofxTransactions];
            } else if (ofxTransactions == null) {
                ofxTransactions = [];
            }
            // Check to see if this is a credit card transaction
            if (account.CCSTMTRS) {
                return {
                    accountNumber: account.CCSTMTRS.CCACCTFROM.ACCTID,
                    accountType: "CREDITCARD",
                    balance: account.CCSTMTRS.LEDGERBAL.BALAMT,
                    balanceDate: Utils.ofxDateToFF3(
                        account.CCSTMTRS.LEDGERBAL.DTASOF,
                    ),
                    startDate: Utils.ofxDateToFF3(
                        account.CCSTMTRS.BANKTRANLIST.DTSTART,
                    ),
                    endDate: Utils.ofxDateToFF3(
                        account.CCSTMTRS.BANKTRANLIST.DTEND,
                    ),
                    currency: account.CCSTMTRS.CURDEF || 'EUR',
                    transactions: ofxTransactions.map(ofxTxn => this.parseOfxTransaction(ofxTxn)),
                    status: OfxAccountStatus.UNPROCESSED
                };
            }

            // Otherwise (if not credit card), it must be a checking or saving
            return {
                accountNumber: account.STMTRS.BANKACCTFROM.ACCTID,
                accountType: account.STMTRS.BANKACCTFROM.ACCTTYPE,
                balance: account.STMTRS.LEDGERBAL?.BALAMT || '?',
                balanceDate: Utils.ofxDateToFF3(account.STMTRS.LEDGERBAL?.DTASOF) || '?',
                startDate: Utils.ofxDateToFF3(account.STMTRS.BANKTRANLIST?.DTSTART) || '?',
                endDate: Utils.ofxDateToFF3(account.STMTRS.BANKTRANLIST?.DTEND) || '?',
                currency: account.STMTRS.CURDEF || 'EUR',
                transactions: ofxTransactions.map(ofxTxn => this.parseOfxTransaction(ofxTxn)),
                status: OfxAccountStatus.UNPROCESSED
            };
        };
        
        try {
            
            if (ofxDataIn.OFX.CREDITCARDMSGSRSV1) {
                // If this is a credit card account

                if (Array.isArray(ofxDataIn.OFX.CREDITCARDMSGSRSV1.CCSTMTTRNRS)) {
                    ofxDataIn.OFX.CREDITCARDMSGSRSV1.CCSTMTTRNRS.forEach((account: any) => {
                        ofxData.accounts?.push(processAccount(account));
                    });
                } else {
                    ofxData.accounts?.push(processAccount(ofxDataIn.OFX.CREDITCARDMSGSRSV1.CCSTMTTRNRS));
                }
            } else if (ofxDataIn.OFX.BANKMSGSRSV1) {
                // If this is a checking or savings account
                
                if (Array.isArray(ofxDataIn.OFX.BANKMSGSRSV1.STMTTRNRS)) {
                    ofxDataIn.OFX.BANKMSGSRSV1.STMTTRNRS.forEach((account: any) => {
                        ofxData.accounts?.push(processAccount(account));
                    });
                } else {
                    ofxData.accounts?.push(processAccount(ofxDataIn.OFX.BANKMSGSRSV1.STMTTRNRS));
                }
            } else {
                
                throw 'OFX format not understood';
            }
        } catch(e) {
            console.error(e);
            throw 'Error parsing OFX file';
        }
        
        return ofxData;
    }

    /**
     * Convert the OFX date into something FF3 likes
     * @param inDate 
     * @returns 
     */
    static ofxDateToFF3(inDate: string): Moment {
        return moment(parseInt(inDate), DATE_FORMAT);
    }

    /**
     * Parse a single transaction.
     * TODO: a single transaction may be made up of an array of related transactions.
     * {
    "TRNTYPE": [
        "CREDIT",
        "CREDIT"
    ],
    "DTPOSTED": [
        "20220630120000",
        "20220630120000"
    ],
    "TRNAMT": [
        "33.62",
        "958.02"
    ],
    "FITID": [
        "tNUAsBXin",
        "tNUAsBXin"
    ],
    "NAME": [
        "Automatic payment/from PCA:991.6",
        "Automatic payment/from PCA:991.6"
    ],
    "MEMO": [
        "CR",
        "CR"
    ]
}
     * @param txn 
     * @returns 
     */
    static parseOfxTransaction(txn: OfxTransaction): OfxParsedTransaction | null {
        console.debug('TXN to parse', txn);
        if (txn) {
        return {
            transactionId: txn.FITID,
            transactionType: txn.TRNTYPE,
            datePosted: Utils.ofxDateToFF3(txn.DTPOSTED),
            amount: parseFloat(txn.TRNAMT),
            description: txn.NAME,
            memo: txn.MEMO,
        };
        }

        return null;
    }

    static getLocaleCurrency(amount: number) {
        return amount.toLocaleString(navigator.language, {maximumFractionDigits: 2, minimumFractionDigits: 2});
    }
}

export default Utils;
