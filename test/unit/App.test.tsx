import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '@/App';
import ApiService from '@/lib/apiService';

// Mock ApiService so App can mount without making real network calls.
vi.mock('@/lib/apiService', () => ({
    default: {
        getAccounts: vi.fn(),
        getAccount: vi.fn(),
        getLatestVersion: vi.fn(),
        getHttp: vi.fn(),
        getClient: vi.fn(),
        createAccount: vi.fn(),
        getTransactions: vi.fn(),
        getAccountTransactions: vi.fn(),
        addTransaction: vi.fn(),
        updateTransaction: vi.fn(),
        deleteTransaction: vi.fn(),
        listAllAccounts: vi.fn(),
        listCategories: vi.fn(),
        listBudgets: vi.fn(),
        listBills: vi.fn(),
        listTags: vi.fn(),
        reset: vi.fn(),
    },
}));

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

beforeEach(() => {
    asMock(ApiService.getLatestVersion).mockResolvedValue('v0.0.0'); // never matches __APP_VERSION__ -> updateAvailable, but we don't assert on it
    asMock(ApiService.getAccounts).mockResolvedValue([]);
    asMock(ApiService.getAccount).mockResolvedValue(null);
    localStorage.clear();
});

afterEach(() => {
    vi.clearAllMocks();
});

describe('App — login screen', () => {
    it('renders the FireFly III connect copy when no token is set', async () => {
        render(<App />);
        expect(await screen.findByText(/Connect to FireFly III/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/Personal Access Token/i)).toBeInTheDocument();
    });

    it('disables the login button until the user types something', async () => {
        const user = userEvent.setup();
        render(<App />);
        const login = await screen.findByRole('button', { name: /^Login$/i });
        expect(login).toBeDisabled();
        await user.type(screen.getByLabelText(/Personal Access Token/i), 'abc');
        expect(login).toBeEnabled();
    });

    it('calls ApiService.getAccounts when Login is clicked', async () => {
        const user = userEvent.setup();
        render(<App />);
        await user.type(await screen.findByLabelText(/Personal Access Token/i), 'my-token');
        await user.click(screen.getByRole('button', { name: /^Login$/i }));
        await waitFor(() => expect(ApiService.getAccounts).toHaveBeenCalledWith('my-token'));
    });

    it('shows the step indicator with all four labels', async () => {
        render(<App />);
        expect(await screen.findByText(/1 · Login/)).toBeInTheDocument();
        expect(screen.getByText(/2 · Import/)).toBeInTheDocument();
        expect(screen.getByText(/3 · Processing/)).toBeInTheDocument();
        expect(screen.getByText(/4 · Done/)).toBeInTheDocument();
    });
});

describe('App — stored token bootstrap', () => {
    it('uses a token from localStorage to fetch accounts automatically', async () => {
        localStorage.setItem('token', JSON.stringify({ value: 'stored-token' }));
        asMock(ApiService.getAccounts).mockResolvedValue([
            { id: '1', attributes: { name: 'Checking', account_number: '1234' } },
        ]);
        render(<App />);
        await waitFor(() => expect(ApiService.getHttp).toHaveBeenCalledWith('stored-token'));
        await waitFor(() => expect(ApiService.getAccounts).toHaveBeenCalledWith('stored-token'));
    });
});

describe('App — error handling', () => {
    it('shows an error alert and lets the user dismiss it', async () => {
        const user = userEvent.setup();
        asMock(ApiService.getAccounts).mockRejectedValueOnce(new Error('401: Invalid token'));
        render(<App />);
        await user.type(await screen.findByLabelText(/Personal Access Token/i), 'bad');
        await user.click(screen.getByRole('button', { name: /^Login$/i }));
        const alert = await screen.findByText(/401: Invalid token/);
        expect(alert).toBeInTheDocument();
        // The dismiss button is the IconButton in the alert action slot.
        const closeBtn = alert.closest('[role="alert"]')!.querySelector('button')!;
        fireEvent.click(closeBtn);
        await waitFor(() => expect(screen.queryByText(/401: Invalid token/)).not.toBeInTheDocument());
    });
});
