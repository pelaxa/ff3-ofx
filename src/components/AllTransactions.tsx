import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import {
    Alert,
    Autocomplete,
    Box,
    Button,
    Chip,
    CircularProgress,
    Paper,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TextField,
    Typography,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import CategoryOutlinedIcon from '@mui/icons-material/CategoryOutlined';
import SellOutlinedIcon from '@mui/icons-material/SellOutlined';
import moment, { Moment } from 'moment';
import {
    TransactionTypeProperty,
    type AccountRead,
    type BillRead,
    type BudgetRead,
    type CategoryRead,
    type TransactionRead,
} from '@billos/firefly-iii-sdk';
import ApiService from '@/lib/apiService';
import utils from '@/lib/utils';
import { tokens } from '@/theme';
import TransactionTypeIcon from '@/components/TransactionTypeIcon';
import TransactionEditor from '@/components/TransactionEditor';

interface AllTransactionsProps {
    // Asset accounts used to populate the account filter dropdown.
    accounts?: AccountRead[];
}

type QuickFilter = 'all' | 'uncategorized' | 'withdrawals' | 'deposits' | 'transfers' | 'thismonth' | 'untagged';

const QUICK_FILTERS: { key: QuickFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'uncategorized', label: 'Uncategorized' },
    { key: 'withdrawals', label: 'Withdrawals' },
    { key: 'deposits', label: 'Deposits' },
    { key: 'transfers', label: 'Transfers' },
    { key: 'thismonth', label: 'This month' },
    { key: 'untagged', label: 'Untagged' },
];

type DateRange = '7d' | '30d' | '90d' | 'year' | 'all';

const RANGE_OPTIONS: { id: DateRange; label: string }[] = [
    { id: '7d', label: 'Last 7 days' },
    { id: '30d', label: 'Last 30 days' },
    { id: '90d', label: 'Last 90 days' },
    { id: 'year', label: 'This year' },
    { id: 'all', label: 'All time' },
];

const rangeToDates = (range: DateRange | undefined): { start?: Moment; end?: Moment } => {
    const end = moment();
    switch (range) {
        case '7d':
            return { start: moment().subtract(7, 'days'), end };
        case '30d':
            return { start: moment().subtract(30, 'days'), end };
        case '90d':
            return { start: moment().subtract(90, 'days'), end };
        case 'year':
            return { start: moment().startOf('year'), end };
        case 'all':
        default:
            return {};
    }
};

const firstSplit = (t: TransactionRead) => t.attributes.transactions[0];
const typeOf = (t: TransactionRead): string => firstSplit(t)?.type ?? '';
// Signed total: withdrawals are negative, deposits positive, transfers shown as
// negative (money leaving the source asset account).
const signedAmount = (t: TransactionRead): number => {
    const total = t.attributes.transactions.reduce((sum, s) => sum + (parseFloat(s.amount ?? '0') || 0), 0);
    return typeOf(t) === TransactionTypeProperty.DEPOSIT ? total : -total;
};
const categoryNames = (t: TransactionRead): string[] =>
    t.attributes.transactions.map((s) => s.category_name).filter((c): c is string => !!c);
const allTags = (t: TransactionRead): string[] =>
    t.attributes.transactions.flatMap((s) => s.tags ?? []);
const displayDescription = (t: TransactionRead): string =>
    t.attributes.group_title || firstSplit(t)?.description || '';
const accountLabel = (t: TransactionRead): string => {
    const s = firstSplit(t);
    if (!s) return '';
    if (typeOf(t) === TransactionTypeProperty.DEPOSIT) return s.destination_name ?? '';
    if (typeOf(t) === TransactionTypeProperty.TRANSFER) return `${s.source_name ?? ''} → ${s.destination_name ?? ''}`;
    return s.source_name ?? '';
};

const AllTransactions = (props: AllTransactionsProps) => {
    const [rows, setRows] = useState<TransactionRead[]>([]);
    const [page, setPage] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | undefined>();

    const [accountId, setAccountId] = useState<string | undefined>();
    const [range, setRange] = useState<DateRange | undefined>('30d');
    const [quickFilter, setQuickFilter] = useState<QuickFilter>('all');
    // `searchInput` is the live field value; `search` is the committed term that
    // actually drives the query (only updated when the user presses Enter).
    const [searchInput, setSearchInput] = useState('');
    const [search, setSearch] = useState('');

    const [editingId, setEditingId] = useState<string | undefined>();
    const [editorMetadata, setEditorMetadata] = useState<{
        accounts: AccountRead[];
        categories: CategoryRead[];
        budgets: BudgetRead[];
        bills: BillRead[];
        tags: string[];
    }>();
    const [metadataLoading, setMetadataLoading] = useState(false);

    const scrollerRef = useRef<HTMLDivElement | null>(null);
    // Guards against the scroll handler firing a second fetch before state settles.
    const loadingRef = useRef(false);

    const loadPage = useCallback(async (nextPage: number, replace: boolean) => {
        if (loadingRef.current) return;
        loadingRef.current = true;
        setLoading(true);
        setError(undefined);
        try {
            // "This month" overrides the date-range dropdown.
            const { start, end } = quickFilter === 'thismonth'
                ? { start: moment().startOf('month'), end: moment().endOf('month') }
                : rangeToDates(range);
            const term = search.trim();
            // The search endpoint is required for free-text and for filters that
            // can only be expressed with search operators (uncategorized/untagged).
            const useSearch = !!term || quickFilter === 'uncategorized' || quickFilter === 'untagged';

            let result;
            if (useSearch) {
                const parts: string[] = [];
                if (term) parts.push(term);
                if (quickFilter === 'uncategorized') parts.push('has_any_category:false');
                if (quickFilter === 'untagged') parts.push('has_any_tag:false');
                if (quickFilter === 'withdrawals') parts.push('type:withdrawal');
                if (quickFilter === 'deposits') parts.push('type:deposit');
                if (quickFilter === 'transfers') parts.push('type:transfer');
                if (accountId) parts.push(`account_id:${accountId}`);
                if (start) parts.push(`date_after:${start.format('YYYY-MM-DD')}`);
                if (end) parts.push(`date_before:${end.format('YYYY-MM-DD')}`);
                result = await ApiService.searchTransactionsPage(nextPage, parts.join(' '));
            } else {
                const type = quickFilter === 'withdrawals' ? 'withdrawal'
                    : quickFilter === 'deposits' ? 'deposit'
                    : quickFilter === 'transfers' ? 'transfer'
                    : undefined;
                result = await ApiService.listTransactionsPage(nextPage, {
                    accountId: accountId || undefined,
                    start,
                    end,
                    type,
                });
            }
            setRows((prev) => (replace ? result.data : [...prev, ...result.data]));
            setPage(result.currentPage);
            setTotalPages(result.totalPages);
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setLoading(false);
            loadingRef.current = false;
        }
    }, [accountId, range, quickFilter, search]);

    const getAccountEntries = () => {
        if (props.accounts) {
            return props.accounts.map(a => {return {id: a.id, label: a.attributes.name}});
        }
        return [{id: 'dummy', label: 'No accounts'}];
    }

    // Reset and reload whenever any server-side filter changes. `search` only
    // changes when the user commits it with Enter, so typing does not refetch.
    useEffect(() => {
        setRows([]);
        setPage(0);
        setTotalPages(1);
        if (scrollerRef.current) scrollerRef.current.scrollTop = 0;
        loadPage(1, true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [accountId, range, quickFilter, search]);

    const handleScroll = useCallback(() => {
        const el = scrollerRef.current;
        if (!el || loadingRef.current) return;
        if (el.scrollTop + el.clientHeight >= el.scrollHeight - 120 && page < totalPages) {
            loadPage(page + 1, false);
        }
    }, [loadPage, page, totalPages]);

    const ensureEditorMetadata = useCallback(async () => {
        if (editorMetadata || metadataLoading) return;
        setMetadataLoading(true);
        try {
            const [accounts, categories, budgets, bills, tags] = await Promise.all([
                ApiService.listAllAccounts(),
                ApiService.listCategories(),
                ApiService.listBudgets(),
                ApiService.listBills(),
                ApiService.listTags(),
            ]);
            setEditorMetadata({ accounts, categories, budgets, bills, tags });
        } catch (e) {
            console.error('Failed to load editor metadata', e);
        } finally {
            setMetadataLoading(false);
        }
    }, [editorMetadata, metadataLoading]);

    const handleStartEdit = useCallback((id: string) => {
        setEditingId(id);
        ensureEditorMetadata();
    }, [ensureEditorMetadata]);

    const handleSaved = useCallback((updated: TransactionRead) => {
        setRows((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
        setEditingId(undefined);
    }, []);

    const handleDeleted = useCallback((id: string) => {
        setRows((prev) => prev.filter((t) => t.id !== id));
        setEditingId(undefined);
    }, []);

    const allLoaded = page >= totalPages;

    return (
        <Box className="all-txns" sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, width: '100%', maxWidth: 1200, mx: 'auto' }}>
            {/* Quick filters */}
            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', alignItems: 'center', mb: 1.5, rowGap: 1, flexShrink: 0 }}>
                <Typography variant="caption" sx={{ color: tokens.textMuted, textTransform: 'uppercase', letterSpacing: '0.6px', mr: 0.5 }}>
                    Quick filters
                </Typography>
                {QUICK_FILTERS.map((qf) => (
                    <Chip
                        key={qf.key}
                        label={qf.label}
                        size="small"
                        variant={quickFilter === qf.key ? 'filled' : 'outlined'}
                        color={quickFilter === qf.key ? 'primary' : 'default'}
                        onClick={() => setQuickFilter(qf.key)}
                        sx={{ cursor: 'pointer' }}
                    />
                ))}
            </Stack>

            {/* Filter bar */}
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', flexWrap: 'wrap', p: '12px 14px', mb: 1.5, backgroundColor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: 2, flexShrink: 0 }}>
                <Autocomplete
                    autoHighlight
                    disableClearable
                    options={getAccountEntries()}
                    sx={{ width: 200 }}
                    onInputChange={(_, v) => {
                        setAccountId(props.accounts?.find(accnt => accnt.attributes.name === v)?.id);
                    }}
                    renderInput={(params) => <TextField {...params} label='Account' variant='outlined' />}
                />
                <Autocomplete
                    autoHighlight
                    disableClearable
                    options={RANGE_OPTIONS}
                    sx={{ width: 200 }}
                    value={RANGE_OPTIONS.find((r) => r.id === range) ?? RANGE_OPTIONS[0]}
                    isOptionEqualToValue={(option, value) => option.id === value.id}
                    onChange={(_, v) => setRange(v?.id)}
                    renderInput={(params) => <TextField {...params} label='Date range' variant='outlined' />}
                />
                <TextField
                    size="medium"
                    variant="outlined"
                    placeholder="Search description, category, tag… (press Enter)"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            // Commit the term — this refetches via the reset effect.
                            // If unchanged, force a reload so Enter always re-queries.
                            const term = searchInput.trim();
                            if (term === search) loadPage(1, true);
                            else setSearch(term);
                        }
                    }}
                    sx={{ flex: 1, minWidth: 200 }}
                />
                <Button variant="outlined" startIcon={<RefreshIcon />} onClick={() => loadPage(1, true)} disabled={loading}>
                    Refresh
                </Button>
            </Stack>

            {error && <Alert severity="error" sx={{ mb: 1, flexShrink: 0 }}>{error}</Alert>}

            {/* Table fills the rest of the height; only this scrolls. */}
            <TableContainer
                component={Paper}
                ref={scrollerRef}
                onScroll={handleScroll}
                sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}
            >
                <Table stickyHeader aria-label="all transactions table">
                    <TableHead>
                        <TableRow>
                            <TableCell>Description</TableCell>
                            <TableCell align="center">Date</TableCell>
                            <TableCell align="center">Account</TableCell>
                            <TableCell align="center">Type</TableCell>
                            <TableCell align="right">Amount</TableCell>
                            <TableCell align="center">Action</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {rows.map((t) => {
                            const amount = signedAmount(t);
                            const cats = categoryNames(t);
                            const tags = allTags(t).filter((tag) => tag.indexOf('OFX ') !== 0);
                            const isEditing = editingId === t.id;
                            return (
                                <Fragment key={`txn_${t.id}`}>
                                    <TableRow>
                                        <TableCell>
                                            {displayDescription(t)}
                                            <Stack direction="row" sx={{ pt: '4px', alignItems: 'center', color: 'text.secondary' }} spacing={2}>
                                                <Stack direction="row" sx={{ alignItems: 'center' }} spacing={1}>
                                                    <CategoryOutlinedIcon fontSize={'small'} />
                                                    <Typography sx={{ fontSize: '12px', color: cats.length ? 'text.secondary' : tokens.warning, fontStyle: cats.length ? 'normal' : 'italic' }}>
                                                        {cats.length ? cats.join(', ') : 'Uncategorized'}
                                                    </Typography>
                                                </Stack>
                                                {tags.length > 0 && (
                                                    <Stack direction="row" sx={{ alignItems: 'center' }} spacing={1}>
                                                        <SellOutlinedIcon fontSize={'small'} />
                                                        {tags.map((tag, i) => (
                                                            <Chip key={`${t.id}_tag_${i}`} variant={'outlined'} label={tag} size={'small'} sx={{ color: 'text.secondary' }} />
                                                        ))}
                                                    </Stack>
                                                )}
                                            </Stack>
                                        </TableCell>
                                        <TableCell align="center">{moment(firstSplit(t)?.date).format('DD-MMM-YYYY')}</TableCell>
                                        <TableCell align="center">{accountLabel(t)}</TableCell>
                                        <TableCell align="center"><TransactionTypeIcon type={typeOf(t)} /></TableCell>
                                        <TableCell align="right" sx={{ color: amount >= 0 ? 'success.main' : 'error.main', fontWeight: 500, whiteSpace: 'nowrap' }}>
                                            {utils.getLocaleCurrency(amount)}
                                        </TableCell>
                                        <TableCell align="center">
                                            <Button
                                                variant="outlined"
                                                size="small"
                                                onClick={() => isEditing ? setEditingId(undefined) : handleStartEdit(t.id)}
                                                sx={{
                                                    borderColor: 'divider',
                                                    color: isEditing ? 'primary.light' : 'text.secondary',
                                                    fontSize: '12px',
                                                    backgroundColor: isEditing ? 'rgba(144,202,249,.08)' : undefined,
                                                    '&:hover': { borderColor: 'primary.light', color: 'primary.light' },
                                                }}
                                            >
                                                <EditOutlinedIcon sx={{ fontSize: '14px', mr: 0.5 }} />
                                                {isEditing ? 'Editing…' : 'Edit'}
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                    {isEditing && editorMetadata && (
                                        <TableRow>
                                            <TableCell colSpan={6} sx={{ p: 0, borderBottom: '1px solid', borderColor: 'divider' }}>
                                                <TransactionEditor
                                                    transaction={t}
                                                    accounts={editorMetadata.accounts}
                                                    categories={editorMetadata.categories}
                                                    budgets={editorMetadata.budgets}
                                                    bills={editorMetadata.bills}
                                                    tags={editorMetadata.tags}
                                                    onSaved={handleSaved}
                                                    onDeleted={() => handleDeleted(t.id)}
                                                    onCancel={() => setEditingId(undefined)}
                                                />
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </Fragment>
                            );
                        })}
                        {loading && (
                            <TableRow>
                                <TableCell colSpan={6} align="center" sx={{ color: 'text.secondary', py: 2 }}>
                                    <CircularProgress size={16} sx={{ mr: 1, verticalAlign: 'middle' }} />
                                    Loading…
                                </TableCell>
                            </TableRow>
                        )}
                        {!loading && rows.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={6} align="center" sx={{ color: 'text.secondary', py: 4 }}>
                                    No transactions match the current filters.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </TableContainer>

            <Typography variant="caption" sx={{ color: tokens.textMuted, textAlign: 'center', mt: 1, flexShrink: 0 }}>
                Showing {rows.length} loaded transaction{rows.length === 1 ? '' : 's'}
                {allLoaded ? ' · all loaded' : ' · scroll to load more'} · sourced from FireFly III
            </Typography>
        </Box>
    );
};

export default AllTransactions;
