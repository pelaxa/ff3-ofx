import moment, { Moment } from 'moment';
import { OfxData, OfxParsedTransaction, OfxTransaction } from './interfaces';

const DATE_FORMAT = 'YYYYMMDDHHmmss';

class Utils {
    static getOfxData(ofxDataIn: any) {
        const ofxData: OfxData = {
            accountNumber: undefined,
            balance: undefined,
            balanceDate: undefined,
            startDate: undefined,
            endDate: undefined,
            transactions: [],
        };
        if (ofxDataIn.OFX.CREDITCARDMSGSRSV1) {
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
            ofxData.transactions = ofxDataIn.OFX.CREDITCARDMSGSRSV1.CCSTMTTRNRS.CCSTMTRS.BANKTRANLIST.STMTTRN;
        } else if (ofxDataIn.OFX.BANKMSGSRSV1) {
            ofxData.accountNumber = ofxDataIn.OFX.BANKMSGSRSV1.STMTTRNRS.STMTRS.BANKACCTFROM.ACCTID;
            ofxData.balance = ofxDataIn.OFX.BANKMSGSRSV1.STMTTRNRS.STMTRS.LEDGERBAL?.BALAMT || '?';
            ofxData.balanceDate = Utils.ofxDateToFF3(ofxDataIn.OFX.BANKMSGSRSV1.STMTTRNRS.STMTRS.LEDGERBAL?.DTASOF) || '?';
            ofxData.startDate = Utils.ofxDateToFF3(ofxDataIn.OFX.BANKMSGSRSV1.STMTTRNRS.STMTRS.BANKTRANLIST?.DTSTART) || '?';
            ofxData.endDate = Utils.ofxDateToFF3(ofxDataIn.OFX.BANKMSGSRSV1.STMTTRNRS.STMTRS.BANKTRANLIST?.DTEND) || '?';
            ofxData.transactions = ofxDataIn.OFX.BANKMSGSRSV1.STMTTRNRS.STMTRS.BANKTRANLIST.STMTTRN;
        } else {
            // eslint-disable-next-line no-throw-literal
            throw 'OFX format not understood';
        }

        if (ofxData.transactions && !Array.isArray(ofxData.transactions)) {
            ofxData.transactions = [ofxData.transactions];
        } else if (!ofxData.transactions) {
            ofxData.transactions = [];
        }

        return ofxData;
    }

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
