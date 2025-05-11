import moment, { Moment } from 'moment';
import { FF3Account, FF3AccountRole, FF3AddTransactionWrapper, FF3CreditCardType, FF3Error, FF3NewAccount, FF3ShortAccountType, FF3Transaction, FF3TransactionSplit, FF3Wrapper } from './interfaces';
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
    } else if (url) {
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


/**
 * Contributed by https://github.com/programmeroftheeve
 * A way to allow paging through accounts and transactions.
 * 
 * @param http 
 * @param endpoint 
 */
async function* pageThroughResource(http: AxiosInstance | undefined, endpoint: string) {
    async function* getResources(_http: AxiosInstance | undefined, _endpoint: string, currentPage: number = 1): AsyncGenerator<unknown,void, unknown>
    {
        const config = {
            params: {
                limit: 75,  // Fetch a max of 75 records by default.
                page: currentPage
            },
            ...exceptionHandling
        }
        const response = await _http?.get(_endpoint, config);
        if (response && response.status) {
            if (response.status === 200 && response.data.data) {
                for( const d of response.data.data) {
                    yield d;
                }

                if(response.data.meta)
                {
                    const m = response.data.meta
                    const totalPages = m.pagination.total_pages;
                    const currentPage = m.pagination.current_page;
                    if(currentPage < totalPages)
                    {
                        yield* getResources(_http, _endpoint, currentPage + 1);
                    }
                }

            } else if (response.status === 401) {
                yield null;
            }
        }
    }

    yield* getResources(http, endpoint)
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

    // Only return asset accounts
    const accounts = await Array.fromAsync(pageThroughResource(http, '/accounts?type=asset')).then((array) => {
        console.log(array);
        return array as FF3Wrapper<FF3Account>[];
    });
    return accounts;

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

const createAccount = async(accountData: FF3NewAccount): Promise<FF3Wrapper<FF3Account> | null> => {
    const http = getHttp();
    const newAccountData: FF3Account = {
        name: accountData.name,
        type: FF3ShortAccountType.TYPE_ASSET, // Seems like there is AccountTypeProperty and ShortAccountTypeProperty, and the latter is used here: https://api-docs.firefly-iii.org/firefly-iii-2.0.10-v2.yaml
        account_number: accountData.number,
        account_role: accountData.role,
        currency_code: accountData.currency
    };
    // Handle special case of Credit Card accounts
    if (accountData.role == FF3AccountRole.CREDIT_CARD_ASSET) {
        newAccountData.credit_card_type = FF3CreditCardType.MONTHLY_FULL;
        newAccountData.monthly_payment_date = moment().format(DATE_FORMAT);
    }
    const response = await http?.post(`/accounts`, newAccountData, exceptionHandling);
    console.log('Create Account status', response?.status, response?.status === 200, response?.data?.data);
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
    const transactions = await Array.fromAsync(pageThroughResource(http, `/accounts/${accountId}/transactions${queryString}`));
    return transactions as FF3Wrapper<FF3Transaction>[];

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
    const transactions = await Array.fromAsync(pageThroughResource(http, `transactions${queryString}`));
    return transactions as FF3Wrapper<FF3Transaction>[];
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
    createAccount,
    getTransactions,
    getAccountTransactions,
    addTransaction,
    getLatestVersion,
};

export default ApiService;