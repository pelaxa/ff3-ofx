import moment, { Moment } from 'moment';
import { OfxData, OfxParsedTransaction, OfxTransaction } from './interfaces';

const DATE_FORMAT = 'YYYYMMDDHHmmss';

class Utils {
    /**
     * This method returns parsed account data + raw ofx transactions as an array
     * @param ofxDataIn The raw parsed OFX data
     * @returns 
     */
    static getOfxData(ofxDataIn: any) {
        const ofxData: OfxData = {
            accountNumber: undefined,
            balance: undefined,
            balanceDate: undefined,
            startDate: undefined,
            endDate: undefined,
            transactions: [],
        };
        
        let ofxTransactions: OfxTransaction[]|null = null;
        if (ofxDataIn.OFX.CREDITCARDMSGSRSV1) {
            // If this is a credit card account
            ofxData.accountNumber = ofxDataIn.OFX.CREDITCARDMSGSRSV1.CCSTMTTRNRS.CCSTMTRS.CCACCTFROM.ACCTID;
            ofxData.balance = ofxDataIn.OFX.CREDITCARDMSGSRSV1.CCSTMTTRNRS.CCSTMTRS.LEDGERBAL.BALAMT;
            ofxData.balanceDate = Utils.ofxDateToFF3(
                ofxDataIn.OFX.CREDITCARDMSGSRSV1.CCSTMTTRNRS.CCSTMTRS.LEDGERBAL.DTASOF,
            );
            ofxData.startDate = Utils.ofxDateToFF3(
                ofxDataIn.OFX.CREDITCARDMSGSRSV1.CCSTMTTRNRS.CCSTMTRS.BANKTRANLIST.DTSTART,
            );
            ofxData.endDate = Utils.ofxDateToFF3(
                ofxDataIn.OFX.CREDITCARDMSGSRSV1.CCSTMTTRNRS.CCSTMTRS.BANKTRANLIST.DTEND,
            );
            ofxTransactions = ofxDataIn.OFX.CREDITCARDMSGSRSV1.CCSTMTTRNRS.CCSTMTRS.BANKTRANLIST.STMTTRN;
        } else if (ofxDataIn.OFX.BANKMSGSRSV1) {
            // If this is a checking or savings account
            ofxData.accountNumber = ofxDataIn.OFX.BANKMSGSRSV1.STMTTRNRS.STMTRS.BANKACCTFROM.ACCTID;
            ofxData.balance = ofxDataIn.OFX.BANKMSGSRSV1.STMTTRNRS.STMTRS.LEDGERBAL?.BALAMT || '?';
            ofxData.balanceDate = Utils.ofxDateToFF3(ofxDataIn.OFX.BANKMSGSRSV1.STMTTRNRS.STMTRS.LEDGERBAL?.DTASOF) || '?';
            ofxData.startDate = Utils.ofxDateToFF3(ofxDataIn.OFX.BANKMSGSRSV1.STMTTRNRS.STMTRS.BANKTRANLIST?.DTSTART) || '?';
            ofxData.endDate = Utils.ofxDateToFF3(ofxDataIn.OFX.BANKMSGSRSV1.STMTTRNRS.STMTRS.BANKTRANLIST?.DTEND) || '?';
            ofxTransactions = ofxDataIn.OFX.BANKMSGSRSV1.STMTTRNRS.STMTRS.BANKTRANLIST.STMTTRN;
        } else {
            // eslint-disable-next-line no-throw-literal
            throw 'OFX format not understood';
        }

        // If there is only one transaction, it may not come back as an array, so make sure we have an array back
        if (ofxTransactions !== null && !Array.isArray(ofxTransactions)) {
            ofxTransactions = [ofxTransactions];
        } else if (ofxTransactions == null) {
            ofxTransactions = [];
        }

        // Now reset the transactions with the parsed transactions
        ofxData.transactions = ofxTransactions.map(ofxTxn => this.parseOfxTransaction(ofxTxn));
        
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
        console.log('TXN to parse', txn);
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
}

export default Utils;
