import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

vi.mock('../../../src/lib/apiService', () => ({
    default: {
        getAccounts: vi.fn(),
        getHttp: vi.fn(),
        reset: vi.fn(),
    },
}));
import ApiService from '../../../src/lib/apiService';
import { useSession, localStorageTokenStore } from '../../../src/lib/useSession';
import type { Token, TokenStore } from '../../../src/lib/interfaces';

const asMock = (f: unknown) => f as ReturnType<typeof vi.fn>;

// In-memory stand-in for localStorage so these tests control exactly what is remembered
const memoryStore = (initial?: Token) => {
    let saved = initial;
    const store: TokenStore = {
        load: vi.fn(() => saved),
        save: vi.fn((t: Token) => { saved = t; }),
        clear: vi.fn(() => { saved = undefined; }),
    };
    return store;
};

describe('useSession', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'debug').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });
    afterEach(() => { vi.restoreAllMocks(); });

    it('stores the token and accounts after a successful login, and remembers it only when asked', async () => {
        asMock(ApiService.getAccounts).mockResolvedValue([{ id: '1' }]);
        const setError = vi.fn();
        const store = memoryStore();
        const { result } = renderHook(() => useSession(setError, store));

        await act(async () => { result.current.login({ value: 'abc' }, false); });
        await waitFor(() => expect(result.current.token).toEqual({ value: 'abc' }));
        expect(result.current.accounts).toEqual([{ id: '1' }]);
        expect(setError).toHaveBeenCalledWith(undefined);
        expect(store.save).not.toHaveBeenCalled();

        await act(async () => { result.current.login({ value: 'abc' }, true); });
        await waitFor(() => expect(store.save).toHaveBeenCalledWith({ value: 'abc' }));
    });

    it('resets the client and keeps the user logged out when the API says unauthorized (null)', async () => {
        asMock(ApiService.getAccounts).mockResolvedValue(null);
        const { result } = renderHook(() => useSession(vi.fn(), memoryStore()));
        await act(async () => { result.current.login({ value: 'bad' }); });
        await waitFor(() => expect(ApiService.reset).toHaveBeenCalled());
        expect(result.current.token).toBeUndefined();
        expect(result.current.accounts).toBeUndefined();
    });

    it('reports the error message and resets when the request fails', async () => {
        asMock(ApiService.getAccounts).mockRejectedValue(new Error('401: Invalid token'));
        const setError = vi.fn();
        const { result } = renderHook(() => useSession(setError, memoryStore()));
        await act(async () => { result.current.login({ value: 'bad' }); });
        await waitFor(() => expect(setError).toHaveBeenCalledWith('401: Invalid token'));
        expect(ApiService.reset).toHaveBeenCalled();
        expect(result.current.token).toBeUndefined();
    });

    it('logs in with the remembered token when the page loads', async () => {
        asMock(ApiService.getAccounts).mockResolvedValue([]);
        const { result } = renderHook(() => useSession(vi.fn(), memoryStore({ value: 'stored' })));
        await waitFor(() => expect(result.current.token).toEqual({ value: 'stored' }));
        expect(ApiService.getHttp).toHaveBeenCalledWith('stored');
        expect(ApiService.getAccounts).toHaveBeenCalledWith('stored');
    });

    it('does not call the API on load when nothing is remembered', () => {
        renderHook(() => useSession(vi.fn(), memoryStore()));
        expect(ApiService.getAccounts).not.toHaveBeenCalled();
    });

    it('refreshAccounts fetches again with the current token, and does nothing when logged out', async () => {
        asMock(ApiService.getAccounts).mockResolvedValue([{ id: '1' }]);
        const { result } = renderHook(() => useSession(vi.fn(), memoryStore()));
        act(() => { result.current.refreshAccounts(); });
        expect(ApiService.getAccounts).not.toHaveBeenCalled();

        await act(async () => { result.current.login({ value: 'abc' }); });
        await waitFor(() => expect(result.current.token).toBeDefined());
        asMock(ApiService.getAccounts).mockResolvedValue([{ id: '1' }, { id: '2' }]);
        await act(async () => { result.current.refreshAccounts(); });
        await waitFor(() => expect(result.current.accounts).toHaveLength(2));
    });

    it('logout forgets the remembered token and reloads the page', () => {
        const reload = vi.fn();
        const original = window.location;
        Object.defineProperty(window, 'location', { configurable: true, value: { ...original, reload } });
        const store = memoryStore({ value: 'stored' });
        asMock(ApiService.getAccounts).mockResolvedValue([]);
        const { result } = renderHook(() => useSession(vi.fn(), store));
        act(() => { result.current.logout(); });
        expect(store.clear).toHaveBeenCalled();
        expect(reload).toHaveBeenCalled();
        Object.defineProperty(window, 'location', { configurable: true, value: original });
    });
});

describe('localStorageTokenStore', () => {
    beforeEach(() => { localStorage.clear(); });

    it('saves, loads and clears the token under the "token" key', () => {
        expect(localStorageTokenStore.load()).toBeUndefined();
        localStorageTokenStore.save({ value: 'abc' });
        expect(JSON.parse(localStorage.getItem('token')!)).toEqual({ value: 'abc' });
        expect(localStorageTokenStore.load()).toEqual({ value: 'abc' });
        localStorageTokenStore.clear();
        expect(localStorageTokenStore.load()).toBeUndefined();
    });
});
