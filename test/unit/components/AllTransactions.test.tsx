import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AllTransactions from '@/components/AllTransactions';
import ApiService from '@/lib/apiService';

vi.mock('@/lib/apiService', () => ({
    default: {
        listTransactionsPage: vi.fn(),
        searchTransactionsPage: vi.fn(),
        listAllAccounts: vi.fn(),
        listCategories: vi.fn(),
        listBudgets: vi.fn(),
        listBills: vi.fn(),
        listTags: vi.fn(),
    },
}));

// Stub the editor so we can drive its callbacks without its internals.
vi.mock('@/components/TransactionEditor', () => ({
    default: (props: {
        transaction: { id: string };
        onSaved: (u: unknown) => void;
        onDeleted: () => void;
        onCancel: () => void;
    }) => (
        <div data-testid={`editor-${props.transaction.id}`}>
            <button
                data-testid={`editor-save-${props.transaction.id}`}
                onClick={() => props.onSaved({
                    id: props.transaction.id,
                    type: 'transactions',
                    attributes: { group_title: null, transactions: [{ type: 'withdrawal', date: '2024-06-01', amount: '10.00', description: 'EDITED DESC', category_name: 'Food', tags: [] }] },
                })}
            />
            <button data-testid={`editor-delete-${props.transaction.id}`} onClick={() => props.onDeleted()} />
            <button data-testid={`editor-cancel-${props.transaction.id}`} onClick={() => props.onCancel()} />
        </div>
    ),
}));

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

/* eslint-disable @typescript-eslint/no-explicit-any */
const txn = (id: string, over: Record<string, any> = {}): any => ({
    id,
    type: 'transactions',
    attributes: {
        group_title: null,
        transactions: [{
            type: 'withdrawal',
            date: '2024-06-01',
            amount: '10.00',
            description: `Txn ${id}`,
            category_name: 'Food',
            tags: ['t1'],
            source_name: 'Checking',
            destination_name: 'Store',
            ...over,
        }],
    },
});

const page = (items: any[], current = 1, total = 1) => ({ data: items, currentPage: current, totalPages: total });

const scroller = () => document.querySelector('.MuiTableContainer-root') as HTMLElement;

beforeEach(() => {
    asMock(ApiService.listTransactionsPage).mockResolvedValue(page([txn('1')]));
    asMock(ApiService.searchTransactionsPage).mockResolvedValue(page([txn('9', { description: 'Search hit' })]));
    asMock(ApiService.listAllAccounts).mockResolvedValue([]);
    asMock(ApiService.listCategories).mockResolvedValue([]);
    asMock(ApiService.listBudgets).mockResolvedValue([]);
    asMock(ApiService.listBills).mockResolvedValue([]);
    asMock(ApiService.listTags).mockResolvedValue([]);
    vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
});

describe('AllTransactions — initial load', () => {
    it('loads the first page with the default 30-day range and renders rows', async () => {
        render(<AllTransactions accounts={[{ id: '42', attributes: { name: 'Checking ••1' } } as any]} />);
        expect(await screen.findByText('Txn 1')).toBeInTheDocument();
        await waitFor(() => expect(ApiService.listTransactionsPage).toHaveBeenCalled());
        const [, opts] = asMock(ApiService.listTransactionsPage).mock.calls[0];
        // Default quick filter 'all' -> list endpoint, no type, with a start/end (30d).
        expect(opts.type).toBeUndefined();
        expect(opts.start).toBeTruthy();
    });

    it('shows the empty state when no rows come back', async () => {
        asMock(ApiService.listTransactionsPage).mockResolvedValue(page([]));
        render(<AllTransactions />);
        expect(await screen.findByText(/No transactions match/i)).toBeInTheDocument();
    });

    it('shows an error alert when the fetch fails', async () => {
        asMock(ApiService.listTransactionsPage).mockRejectedValue(new Error('kaboom'));
        render(<AllTransactions />);
        expect(await screen.findByText('kaboom')).toBeInTheDocument();
    });

    it('renders deposit and transfer rows with the right account label', async () => {
        asMock(ApiService.listTransactionsPage).mockResolvedValue(page([
            txn('d', { type: 'deposit', category_name: undefined, tags: [], description: 'Paycheck', destination_name: 'Savings' }),
            txn('x', { type: 'transfer', description: 'Move', source_name: 'Checking', destination_name: 'Savings' }),
        ]));
        render(<AllTransactions />);
        expect(await screen.findByText('Paycheck')).toBeInTheDocument();
        expect(screen.getByText('Savings')).toBeInTheDocument();            // deposit -> destination
        expect(screen.getByText(/Checking → Savings/)).toBeInTheDocument(); // transfer -> both
        expect(screen.getAllByText(/Uncategorized/).length).toBeGreaterThan(0); // deposit had no category
    });
});

describe('AllTransactions — quick filters (server side)', () => {
    it('a type filter re-queries the list endpoint with type', async () => {
        render(<AllTransactions />);
        await screen.findByText('Txn 1');
        fireEvent.click(screen.getByText('Withdrawals'));
        await waitFor(() => {
            const last = asMock(ApiService.listTransactionsPage).mock.calls.at(-1)!;
            expect(last[1].type).toBe('withdrawal');
        });
    });

    it('uncategorized uses the search endpoint with the has_any_category operator', async () => {
        render(<AllTransactions />);
        await screen.findByText('Txn 1');
        fireEvent.click(screen.getByText('Uncategorized'));
        await waitFor(() => expect(ApiService.searchTransactionsPage).toHaveBeenCalled());
        const q = asMock(ApiService.searchTransactionsPage).mock.calls.at(-1)![1] as string;
        expect(q).toContain('has_any_category:false');
        expect(await screen.findByText('Search hit')).toBeInTheDocument();
    });

    it('this-month stays on the list endpoint (date override, no search)', async () => {
        render(<AllTransactions />);
        await screen.findByText('Txn 1');
        const before = asMock(ApiService.searchTransactionsPage).mock.calls.length;
        fireEvent.click(screen.getByText('This month'));
        await waitFor(() => {
            const last = asMock(ApiService.listTransactionsPage).mock.calls.at(-1)!;
            expect(last[1].start).toBeTruthy();
        });
        expect(asMock(ApiService.searchTransactionsPage).mock.calls.length).toBe(before);
    });
});

describe('AllTransactions — filtered search', () => {
    type User = ReturnType<typeof userEvent.setup>;
    const lastQuery = () => asMock(ApiService.searchTransactionsPage).mock.calls.at(-1)![1] as string;
    // The text box inside the search bar
    const bar = () => screen.getByRole('combobox', { name: 'Search filters' }) as HTMLInputElement;
    const option = (name: string | RegExp) => screen.findByRole('option', { name });
    const token = (name: string) => screen.getByRole('group', { name });
    // Open the menu, pick a field, and type a value followed by Enter
    const addTyped = async (user: User, field: string, text: string) => {
        await user.click(bar());
        await user.click(await option(field));
        await user.type(bar(), `${text}{Enter}`);
    };
    const renderLoaded = async () => {
        const user = userEvent.setup();
        render(<AllTransactions />);
        await screen.findByText('Txn 1');
        return user;
    };

    it('lists the fields as soon as the box is focused, without searching', async () => {
        const user = await renderLoaded();
        await user.click(bar());
        for (const label of ['Description', 'Category', 'Tag', 'Notes', 'Amount']) {
            expect(await option(label)).toBeInTheDocument();
        }
        expect(ApiService.searchTransactionsPage).not.toHaveBeenCalled();
    });

    it('does not accept typed text until a field has been chosen', async () => {
        const user = await renderLoaded();
        await user.click(bar());
        await user.type(bar(), 'coffee');
        expect(bar()).toHaveValue('');
        // The menu still lists every field, and Enter does not create a filter
        for (const label of ['Description', 'Category', 'Tag', 'Notes', 'Amount']) {
            expect(await option(label)).toBeInTheDocument();
        }
        await user.keyboard('{Enter}');
        expect(screen.queryByRole('group', { name: /contains|=/ })).not.toBeInTheDocument();
    });

    it('does not accept typed text while an amount operator is still to be chosen, but does for the value', async () => {
        const user = await renderLoaded();
        await user.click(bar());
        await user.click(await option('Amount'));
        await user.type(bar(), '50');
        expect(bar()).toHaveValue('');
        await user.click(await option(/more than/));
        await user.type(bar(), '50');
        expect(bar()).toHaveValue('50');
    });

    it('builds a three-segment token for a description and searches once Enter is pressed', async () => {
        const user = await renderLoaded();
        await user.click(bar());
        await user.click(await option('Description'));
        // The chosen field shows as a segment while the value is typed
        expect(screen.getByRole('group', { name: /Description filter being added/ })).toBeInTheDocument();
        await user.type(bar(), 'coffee shop');
        expect(ApiService.searchTransactionsPage).not.toHaveBeenCalled();
        await user.keyboard('{Enter}');
        const t = await screen.findByRole('group', { name: 'Description contains coffee shop' });
        expect(t).toHaveTextContent('Description');
        expect(t).toHaveTextContent('contains');
        expect(t).toHaveTextContent('coffee shop');
        await waitFor(() => expect(lastQuery()).toContain('description_contains:"coffee shop"'));
    });

    it('removes a field from the menu once it is used', async () => {
        const user = await renderLoaded();
        await addTyped(user, 'Notes', 'x');
        await screen.findByRole('group', { name: 'Notes contains x' });
        await user.click(bar());
        expect(await option('Description')).toBeInTheDocument();
        expect(screen.queryByRole('option', { name: 'Notes' })).not.toBeInTheDocument();
    });

    it('ANDs several tokens and the x on a token removes just that one', async () => {
        const user = await renderLoaded();
        await addTyped(user, 'Description', 'coffee');
        await addTyped(user, 'Notes', 'latte');
        await screen.findByRole('group', { name: 'Notes contains latte' });
        await waitFor(() => expect(lastQuery()).toContain('notes_contains:"latte"'));
        expect(lastQuery()).toContain('description_contains:"coffee"');

        await user.click(screen.getByRole('button', { name: 'Remove Description contains coffee' }));
        await waitFor(() => expect(screen.queryByRole('group', { name: 'Description contains coffee' })).not.toBeInTheDocument());
        await waitFor(() => expect(lastQuery()).not.toContain('description_contains'));
        expect(lastQuery()).toContain('notes_contains:"latte"');
    });

    it('goes back to the plain list when the last token is removed', async () => {
        const user = await renderLoaded();
        await addTyped(user, 'Notes', 'x');
        await screen.findByRole('group', { name: 'Notes contains x' });
        const listCalls = asMock(ApiService.listTransactionsPage).mock.calls.length;
        await user.click(screen.getByRole('button', { name: 'Remove Notes contains x' }));
        await waitFor(() => expect(asMock(ApiService.listTransactionsPage).mock.calls.length).toBeGreaterThan(listCalls));
    });

    it('offers only existing categories, narrows them as you type, and Enter picks the first match', async () => {
        asMock(ApiService.listCategories).mockResolvedValue([{ id: '1', attributes: { name: 'Food' } }, { id: '2', attributes: { name: 'Rent' } }]);
        const user = await renderLoaded();
        await user.click(bar());
        await user.click(await option('Category'));
        expect(await option('Food')).toBeInTheDocument();
        expect(await option('Rent')).toBeInTheDocument();
        // Text that is not an existing category never becomes a filter
        await user.type(bar(), 'Nope{Enter}');
        expect(screen.getByText('No matches')).toBeInTheDocument();
        expect(screen.queryByRole('group', { name: /^Category =/ })).not.toBeInTheDocument();
        await user.clear(bar());
        await user.type(bar(), 're');
        expect(screen.queryByRole('option', { name: 'Food' })).not.toBeInTheDocument();
        await user.keyboard('{Enter}');
        await screen.findByRole('group', { name: 'Category = Rent' });
        await waitFor(() => expect(lastQuery()).toContain('category_is:"Rent"'));
    });

    it('lets a tag be picked by clicking it', async () => {
        asMock(ApiService.listTags).mockResolvedValue(['holiday', 'work']);
        const user = await renderLoaded();
        await user.click(bar());
        await user.click(await option('Tag'));
        await user.click(await option('work'));
        await screen.findByRole('group', { name: 'Tag = work' });
        await waitFor(() => expect(lastQuery()).toContain('tag_is:"work"'));
    });

    it('shows an error when the categories and tags cannot be loaded', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        asMock(ApiService.listCategories).mockRejectedValue(new Error('boom'));
        const user = await renderLoaded();
        await user.click(bar());
        expect(await screen.findByText(/Could not load the categories and tags from FireFly III: boom/)).toBeInTheDocument();
        await user.click(await option('Category'));
        expect(await screen.findByText('Could not load the list')).toBeInTheDocument();
    });

    it('asks for an amount operator, rejects text that is not a number, and builds the token', async () => {
        const user = await renderLoaded();
        await user.click(bar());
        await user.click(await option('Amount'));
        await user.click(await option(/more than/));
        expect(screen.getByRole('group', { name: /Amount filter being added/ })).toHaveTextContent('>');
        await user.type(bar(), 'abc{Enter}');
        expect(await screen.findByText('Enter a number such as 12.34')).toBeInTheDocument();
        await user.clear(bar());
        await user.type(bar(), '12,5{Enter}');
        await screen.findByRole('group', { name: 'Amount > 12.5' });
        await waitFor(() => expect(lastQuery()).toContain('amount_more:12.5'));
    });

    it('allows an amount range, but nothing more once both ends are used', async () => {
        const user = await renderLoaded();
        await user.click(bar());
        await user.click(await option('Amount'));
        await user.click(await option(/more than/));
        await user.type(bar(), '10{Enter}');
        await screen.findByRole('group', { name: 'Amount > 10' });

        // Amount is still offered, but only the comparisons not used yet
        await user.click(bar());
        await user.click(await option('Amount'));
        expect(screen.queryByRole('option', { name: /more than/ })).not.toBeInTheDocument();
        expect(screen.queryByRole('option', { name: /exactly/ })).not.toBeInTheDocument();
        await user.click(await option(/less than/));
        await user.type(bar(), '50{Enter}');
        await screen.findByRole('group', { name: 'Amount < 50' });
        await waitFor(() => expect(lastQuery()).toMatch(/amount_more:10.*amount_less:50/));

        await user.click(bar());
        expect(await option('Description')).toBeInTheDocument();
        expect(screen.queryByRole('option', { name: 'Amount' })).not.toBeInTheDocument();
    });

    it('combines the tokens with the quick filters', async () => {
        const user = await renderLoaded();
        await addTyped(user, 'Notes', 'x');
        await screen.findByRole('group', { name: 'Notes contains x' });
        fireEvent.click(screen.getByText('Uncategorized'));
        await waitFor(() => expect(lastQuery()).toContain('has_any_category:false'));
        expect(lastQuery()).toContain('notes_contains:"x"');
    });

    it('Enter in the empty box and the search button both reload the results', async () => {
        const user = await renderLoaded();
        const before = asMock(ApiService.listTransactionsPage).mock.calls.length;
        await user.click(bar());
        await user.keyboard('{Enter}');
        await waitFor(() => expect(asMock(ApiService.listTransactionsPage).mock.calls.length).toBeGreaterThan(before));
        const afterEnter = asMock(ApiService.listTransactionsPage).mock.calls.length;
        await user.click(screen.getByRole('button', { name: 'Search' }));
        await waitFor(() => expect(asMock(ApiService.listTransactionsPage).mock.calls.length).toBeGreaterThan(afterEnter));
    });

    it('Backspace deletes the token to the left of the caret, and Delete the one to its right', async () => {
        const user = await renderLoaded();
        await addTyped(user, 'Description', 'one');
        await addTyped(user, 'Notes', 'two');
        await screen.findByRole('group', { name: 'Notes contains two' });

        // Caret is after the last token: Backspace removes the last one
        await user.click(bar());
        await user.keyboard('{Backspace}');
        await waitFor(() => expect(screen.queryByRole('group', { name: 'Notes contains two' })).not.toBeInTheDocument());
        expect(token('Description contains one')).toBeInTheDocument();

        // Add another, then walk left past it and delete the earlier token without touching the later one
        await addTyped(user, 'Notes', 'three');
        await screen.findByRole('group', { name: 'Notes contains three' });
        await user.keyboard('{ArrowLeft}{ArrowLeft}');
        await user.keyboard('{Delete}');
        await waitFor(() => expect(screen.queryByRole('group', { name: 'Description contains one' })).not.toBeInTheDocument());
        expect(token('Notes contains three')).toBeInTheDocument();

        // Caret is now before the only token: Backspace has nothing to its left
        await user.keyboard('{Backspace}');
        expect(token('Notes contains three')).toBeInTheDocument();
    });

    it('Backspace on a half-built token steps back and Escape cancels it', async () => {
        const user = await renderLoaded();
        await user.click(bar());
        await user.click(await option('Amount'));
        await user.click(await option(/less than/));
        expect(screen.getByRole('group', { name: /Amount filter being added/ })).toHaveTextContent('<');
        await user.keyboard('{Backspace}');
        expect(screen.getByRole('group', { name: /Amount filter being added/ })).not.toHaveTextContent('<');
        await user.keyboard('{Backspace}');
        expect(screen.queryByRole('group', { name: /filter being added/ })).not.toBeInTheDocument();

        await user.click(await option('Notes'));
        expect(screen.getByRole('group', { name: /Notes filter being added/ })).toBeInTheDocument();
        await user.keyboard('{Escape}');
        expect(screen.queryByRole('group', { name: /filter being added/ })).not.toBeInTheDocument();
    });

    it('the clear button removes every token at once', async () => {
        const user = await renderLoaded();
        await addTyped(user, 'Description', 'one');
        await addTyped(user, 'Notes', 'two');
        await screen.findByRole('group', { name: 'Notes contains two' });
        await user.click(screen.getByRole('button', { name: 'Clear all filters' }));
        expect(screen.queryByRole('group', { name: /contains/ })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Clear all filters' })).not.toBeInTheDocument();
    });
});

describe('AllTransactions — infinite scroll', () => {
    it('loads the next page when scrolled near the bottom', async () => {
        asMock(ApiService.listTransactionsPage)
            .mockResolvedValueOnce(page([txn('1')], 1, 2))
            .mockResolvedValueOnce(page([txn('2')], 2, 2));
        render(<AllTransactions />);
        await screen.findByText('Txn 1');
        await act(async () => { fireEvent.scroll(scroller()); });
        expect(await screen.findByText('Txn 2')).toBeInTheDocument();
        expect(screen.getByText('Txn 1')).toBeInTheDocument(); // appended, not replaced
    });
});

describe('AllTransactions — editing', () => {
    it('opens the editor (loading metadata), saves, and updates the row', async () => {
        render(<AllTransactions />);
        await screen.findByText('Txn 1');
        fireEvent.click(screen.getByRole('button', { name: /Edit/i }));
        await waitFor(() => expect(ApiService.listCategories).toHaveBeenCalled());
        await screen.findByTestId('editor-1');
        fireEvent.click(screen.getByTestId('editor-save-1'));
        expect(await screen.findByText('EDITED DESC')).toBeInTheDocument();
    });

    it('deletes a row via the editor', async () => {
        render(<AllTransactions />);
        await screen.findByText('Txn 1');
        fireEvent.click(screen.getByRole('button', { name: /Edit/i }));
        await screen.findByTestId('editor-1');
        fireEvent.click(screen.getByTestId('editor-delete-1'));
        await waitFor(() => expect(screen.queryByText('Txn 1')).not.toBeInTheDocument());
    });

    it('cancels editing', async () => {
        render(<AllTransactions />);
        await screen.findByText('Txn 1');
        fireEvent.click(screen.getByRole('button', { name: /Edit/i }));
        await screen.findByTestId('editor-1');
        fireEvent.click(screen.getByTestId('editor-cancel-1'));
        await waitFor(() => expect(screen.queryByTestId('editor-1')).not.toBeInTheDocument());
        expect(screen.getByText('Txn 1')).toBeInTheDocument();
    });
});
