import { useCallback, useEffect, useState } from 'react';
import type { AccountRead } from '@billos/firefly-iii-sdk';
import ApiService from '@/lib/apiService';
import type { Token, TokenStore } from '@/lib/interfaces';

// The default TokenStore: keeps the token as JSON under the 'token' key in localStorage
export const localStorageTokenStore: TokenStore = {
    load: () => {
        const localToken = JSON.parse(localStorage.getItem('token') || '{}');
        return localToken && localToken.value ? localToken : undefined;
    },
    save: (token) => localStorage.setItem('token', JSON.stringify(token)),
    clear: () => localStorage.removeItem('token'),
};

/**
 * Owns the whole login lifecycle: logging in, restoring a remembered token when the page loads,
 * and logging out. Once logged in it also holds the list of FireFly accounts, because fetching
 * them is how we find out the token works.
 * @param setErrorMessage Called with the failure message when a login fails, and with undefined when it succeeds
 * @param store Where a remembered token is kept (defaults to localStorage)
 * @returns token (set once a login succeeded), accounts (the asset accounts fetched during login),
 *          login(token, remember), refreshAccounts() and logout()
 */
export const useSession = (
    setErrorMessage: (message: string | undefined) => void,
    store: TokenStore = localStorageTokenStore,
) => {
    const [token, setToken] = useState<Token>();
    // List of all accounts
    const [accounts, setAccounts] = useState<AccountRead[]>();

    /**
     * Try the token by fetching the list of accounts.
     * @param currentToken The token to try
     * @param remember When true, the token is saved to the store once it is known to work
     */
    const login = useCallback(async (currentToken: Token, remember: boolean = false) => {
        console.debug('fetching accounts...');
        ApiService.getAccounts(currentToken.value).then(accntResponse => {
            console.log('accntResponse', accntResponse);
            if (accntResponse) {
                setErrorMessage(undefined);
                setAccounts(accntResponse);
                // If we got accounts back, then store the token
                if (remember) { // Only store the token if user requested
                    store.save(currentToken);
                }
                setToken(currentToken);
            } else {  // If the response is null, that means we got an unauthorized response
                ApiService.reset();
            }
        }).catch(e => {
            console.error('could not get accounts', e);
            // localStorage.removeItem('token');
            ApiService.reset();
            setToken(undefined);
            // Set the error on timeout to allow the page to render
            // setTimeout(() => {
            console.log("setting error");
            setErrorMessage(e.message);
            // }, 5000);
        });
    }, [setErrorMessage, store]);

    /**
     * Fetch the list of accounts again with the current token, e.g. after a new account was created
     * in FireFly III. Does nothing when nobody is logged in.
     */
    const refreshAccounts = useCallback(() => {
        if (token) {
            login(token);
        }
    }, [token, login]);

    /**
     * Forget the remembered token and reload the page, which puts the user back at the login screen.
     */
    const logout = useCallback(() => {
        store.clear();
        window.location.reload();
    }, [store]);

    /**
     * Read the remembered token when the page loads and log in with it.
     */
    useEffect(() => {
        const localToken = store.load();
        if (localToken) {
            console.debug('Found local token!  Fetching accounts...');
            // initialize the http client
            console.debug('Fetching accounts(localToken)...');
            ApiService.getHttp(localToken.value);
            login(localToken);
        }
    }, [login, store]);

    return { token, accounts, login, refreshAccounts, logout };
};
