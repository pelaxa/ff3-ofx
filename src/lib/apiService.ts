import { Moment } from 'moment';
import { FF3Account, FF3AddTransactionWrapper, FF3Error, FF3Transaction, FF3TransactionSplit, FF3Wrapper } from './interfaces';
import axios, { AxiosInstance } from 'axios';

export const BASE_URL = "/api/v1";

const DATE_FORMAT = 'YYYY-MM-DD';
const exceptionHandling = {
    validateStatus: function (status: number) {
        return status < 500; // Resolve only if the status code is less than 500
    },
};

let myHttpClient: AxiosInstance | undefined;

const reset = () => {
    myHttpClient = undefined;
}

const getHttp = (token?: string| null, url?: string | null) => {
    if (token === null) {
        reset();
    } else if (token) {
        console.info('Creating http client...');
        reset();
        myHttpClient = axios.create({
            baseURL: BASE_URL,
            headers: {
            'Content-type': 'application/json',
            'Accept': 'application/json',
            'Authorization': `Bearer ${token}`
            },
        });
    } else if (!!url) {
        reset();
        myHttpClient = axios.create({
            baseURL: url,
            headers: {
            'Content-type': 'application/json',
            'Accept': 'application/json'
            },
        });
    }

    return myHttpClient;
}

const getLatestVersion = async(): Promise<string | null> => {
    const response = await axios.get('https://api.github.com/repos/pelaxa/ff3-ofx/tags',{
        headers: {
            'Content-type': 'application/json',
            'Accept': 'application/json'
        },
        ...exceptionHandling
    } );

    if (response && response.status) {
        if (response.status === 200 && response.data.length > 0) {
            console.info('tags', response.data);
            return response.data[0].name;  // latest tag is on top
          }
    }

    // Return null
    return null;

}

const getAccounts = async(currentToken?: string): Promise<FF3Wrapper<FF3Account>[] | null> => {
    const http = getHttp(currentToken);
    
    // // This is useful for debugging request/response
    // http?.interceptors.request.use(
    //   request => {
    //     console.log('Starting Request', JSON.stringify(request, null, 2));
    //     return request;
    //   },
    //   error => {
    //     console.error('Request ERROR', error);
    //     return Promise.reject(error);
    //   },
    // );
    // http?.interceptors.response.use(
    //   response => {
    //     console.log('Receiving Response', JSON.stringify(response, null, 2));
    //     return response;
    //   },
    //   error => {
    //     console.error('Response ERROR', error);
    //     return Promise.reject(error);
    //   },
    // );

    const response = await http?.get('/accounts', exceptionHandling);
    if (response && response.status) {
        if (response.status === 200 && response.data.data) {
            return response.data.data;
          } else if (response.status === 401) {
            return null;
          }
    }

    // Return an empty array otherwise
    return [];
};

const getAccount = async(accountId: string): Promise<FF3Wrapper<FF3Account> | null> => {
    const http = getHttp();
    const response = await http?.get(`/accounts/${accountId}`, exceptionHandling);
    console.log('Get Account status', response?.status, response?.status === 200, response?.data?.data);
    if (response && response.status === 200 && response.data.data) {
        return response.data.data;
    } 
    return null;
};

const getAccountTransactions = async (accountId: string, startDate?: Moment, endDate?: Moment): Promise<FF3Wrapper<FF3Transaction>[]> => {
    const http = getHttp();
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
    const response = await http?.get(`/accounts/${accountId}/transactions${queryString}`, exceptionHandling);
    if (response && response.status === 200 && response.data.data) {
      return response.data.data;
    }
    return [];

};

const getTransactions = async (startDate?: Moment, endDate?: Moment): Promise<FF3Wrapper<FF3Transaction>[]> => {
    const http = getHttp();
    let queryString = '';
    if (startDate || endDate) {
        if (startDate) {
            queryString = `?start=${startDate.format(DATE_FORMAT)}`;
        }
        if (endDate) {
            queryString += `${queryString.length > 0 ? '&' : '?'}end=${endDate.format(DATE_FORMAT)}`;
        }
    }
    const response = await http?.get(`/transactions${queryString}`, exceptionHandling);
    if (response && response.status === 200 && response.data.data) {
      return response.data.data;
    }
    return [];
};

const addTransaction = async (txn: FF3AddTransactionWrapper<FF3TransactionSplit>): Promise<FF3Wrapper<FF3Transaction> | FF3Error | null> => {
    const http = getHttp();
    const response = await http?.post('/transactions', txn, exceptionHandling);
    if (response && response.status === 200 && response.data.data) {
      return response.data.data;
    }
    return response ? response.data as FF3Error : null; 
};

const ApiService = {
    reset,
    getHttp,
    getAccounts,
    getAccount,
    getTransactions,
    getAccountTransactions,
    addTransaction,
    getLatestVersion,
};

export default ApiService;
