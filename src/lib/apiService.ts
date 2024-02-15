import { Moment } from 'moment';
import http from './http-common';
import { FF3Account, FF3AddTransactionWrapper, FF3Error, FF3Transaction, FF3TransactionSplit, FF3Wrapper } from './interfaces';

const DATE_FORMAT = 'YYYY-MM-DD';
const exceptionHandling = {
    validateStatus: function (status: number) {
        return status < 500; // Resolve only if the status code is less than 500
    },
};

const getAccounts = async(): Promise<FF3Wrapper<FF3Account>[]> => {
    // This is useful for debugging request/response
    // http.interceptors.request.use(
    //   request => {
    //     console.log('Starting Request', JSON.stringify(request, null, 2));
    //     return request;
    //   },
    //   error => {
    //     console.error('Request ERROR', error);
    //     return Promise.reject(error);
    //   },
    // );
    // http.interceptors.response.use(
    //   response => {
    //     console.log('Receiving Response', JSON.stringify(response, null, 2));
    //     return response;
    //   },
    //   error => {
    //     console.error('Response ERROR', error);
    //     return Promise.reject(error);
    //   },
    // );
    const response = await http.get('/accounts', exceptionHandling);
    if (response.status === 200 && response.data.data) {
      return response.data.data;
    } 

    // Return an empty array otherwise
    return [];
};

const getAccount = async(accountId: number): Promise<FF3Wrapper<FF3Account> | null> => {
    const response = await http.get(`/accounts/${accountId}`, exceptionHandling);
    console.log('Get Account status', response.status, response.status === 200, response.data?.data);
    if (response.status === 200 && response.data.data) {
        return response.data.data;
    } 
    return null;
};

const getAccountTransactions = async (accountId: number, startDate?: Moment, endDate?: Moment): Promise<FF3Wrapper<FF3Transaction>[]> => {
    let queryString = '';
    if (startDate || endDate) {
        if (startDate) {
            queryString = `?start=${startDate.format(DATE_FORMAT)}`;
        }
        if (endDate) {
            queryString += `${queryString.length > 0 ? '&' : '?'}end=${endDate.format(DATE_FORMAT)}`;
        }
    }
    console.log('queryString', queryString);
    const response = await http.get(`/accounts/${accountId}/transactions${queryString}`, exceptionHandling);
    if (response.status === 200 && response.data.data) {
      return response.data.data;
    }
    return [];

};

const getTransactions = async (startDate?: Moment, endDate?: Moment): Promise<FF3Wrapper<FF3Transaction>[]> => {
    let queryString = '';
    if (startDate || endDate) {
        if (startDate) {
            queryString = `?start=${startDate.format(DATE_FORMAT)}`;
        }
        if (endDate) {
            queryString += `${queryString.length > 0 ? '&' : '?'}end=${endDate.format(DATE_FORMAT)}`;
        }
    }
    const response = await http.get(`/transactions${queryString}`, exceptionHandling);
    if (response.status === 200 && response.data.data) {
      return response.data.data;
    }
    return [];
};

const addTransaction = async (txn: FF3AddTransactionWrapper<FF3TransactionSplit>): Promise<FF3Wrapper<FF3Transaction> | FF3Error> => {
    const response = await http.post('/transactions', txn, exceptionHandling);
    if (response.status === 200 && response.data.data) {
      return response.data.data;
    }
    return response.data as FF3Error;
};

const ApiService = {
    getAccounts,
    getAccount,
    getTransactions,
    getAccountTransactions,
    addTransaction,
};

export default ApiService;
