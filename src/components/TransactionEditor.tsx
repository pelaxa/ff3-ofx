import { useMemo, useState } from 'react';
import {
    Alert,
    Autocomplete,
    Box,
    Button,
    CircularProgress,
    TextField,
    Typography,
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined';
import AddIcon from '@mui/icons-material/Add';
import {
    TransactionSplit,
    TransactionTypeProperty,
    type AccountRead,
    type BillRead,
    type BudgetRead,
    type CategoryRead,
    type TransactionRead,
    type TransactionSplitUpdateWritable,
    type TransactionUpdateWritable,
    type ValidationErrorResponse,
} from '@billos/firefly-iii-sdk';
import ApiService from '@/lib/apiService';
import { tokens } from '@/theme';

interface TransactionEditorProps {
    transaction: TransactionRead;
    accounts: AccountRead[];
    categories: CategoryRead[];
    budgets: BudgetRead[];
    bills: BillRead[];
    tags: string[];
    onSaved: (updated: TransactionRead) => void;
    onDeleted: () => void;
    onCancel: () => void;
}

interface SplitFormState {
    journalId?: string;
    description: string;
    amount: string;
    sourceName: string;
    destinationName: string;
    categoryName: string;
    budgetName: string;
    billName: string;
    notes: string;
    tags: string[];
}

const txnTypeOptions: TransactionTypeProperty[] = [
    TransactionTypeProperty.WITHDRAWAL,
    TransactionTypeProperty.DEPOSIT,
    TransactionTypeProperty.TRANSFER,
];

const fromSplit = (s: TransactionRead['attributes']['transactions'][number]): SplitFormState => ({
    journalId: s.transaction_journal_id,
    description: s.description ?? '',
    amount: Number(s.amount ?? '').toFixed(s.currency_decimal_places),
    sourceName: s.source_name ?? '',
    destinationName: s.destination_name ?? '',
    categoryName: s.category_name ?? '',
    budgetName: s.budget_name ?? '',
    billName: s.bill_name ?? '',
    notes: s.notes ?? '',
    tags: s.tags ?? [],
});

const emptySplit = (s: SplitFormState): SplitFormState => ({
    description: '',
    amount: '0.00',
    sourceName: s.sourceName ?? '',
    destinationName: s.destinationName ?? '',
    categoryName: '',
    budgetName: '',
    billName: '',
    notes: '',
    tags: [],
});

const splitCardSx = {
    gridColumn: '1 / -1',
    backgroundColor: tokens.bgSunken,
    border: '1px solid',
    borderColor: 'divider',
    borderRadius: 2,
    p: '14px 18px 18px',
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '12px 18px',
};

const TransactionEditor = (props: TransactionEditorProps) => {
    const initialSplits = props.transaction.attributes.transactions;
    const initialType = (initialSplits[0]?.type ?? TransactionTypeProperty.WITHDRAWAL) as TransactionTypeProperty;
    const initialDate = (initialSplits[0]?.date ?? '').slice(0, 10);
    const initialAmount = initialSplits.reduce((runningSum: number, txn: TransactionSplit) => { runningSum += Number(txn.amount); return runningSum}, 0 );
    const initialDecimalPlaces = (initialSplits[0]?.currency_decimal_places ?? 2);

    const [txnType, setTxnType] = useState<TransactionTypeProperty>(initialType);
    const [origTxnType] = useState<TransactionTypeProperty>(initialType);
    const [date, setDate] = useState<string>(initialDate);
    const [groupTitle, setGroupTitle] = useState<string>(props.transaction.attributes.group_title ?? '');
    const [splits, setSplits] = useState<SplitFormState[]>(initialSplits.map(fromSplit));
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [error, setError] = useState<string | undefined>();
    const [amountHelper, setAmountHelper] = useState('');

    const isSplit = splits.length > 1;

    const assetAccounts = useMemo(
        () => props.accounts.filter((a) => a.attributes.type === 'asset' || a.attributes.type === 'liabilities'),
        [props.accounts],
    );
    const expenseAccounts = useMemo(
        () => props.accounts.filter((a) => a.attributes.type === 'expense'),
        [props.accounts],
    );
    const revenueAccounts = useMemo(
        () => props.accounts.filter((a) => a.attributes.type === 'revenue'),
        [props.accounts],
    );

    const sourceOptionsForType = (t: TransactionTypeProperty): string[] => {
        if (t === TransactionTypeProperty.DEPOSIT) return revenueAccounts.map((a) => a.attributes.name);
        return assetAccounts.map((a) => a.attributes.name);
    };
    const destinationOptionsForType = (t: TransactionTypeProperty): string[] => {
        if (t === TransactionTypeProperty.WITHDRAWAL) return expenseAccounts.map((a) => a.attributes.name);
        return assetAccounts.map((a) => a.attributes.name);
    };

    const categoryOptions = useMemo(() => props.categories.map((c) => c.attributes.name), [props.categories]);
    const budgetOptions = useMemo(() => props.budgets.map((b) => b.attributes.name), [props.budgets]);
    const billOptions = useMemo(() => props.bills.map((b) => b.attributes.name).filter(Boolean) as string[], [props.bills]);

    const updateSplit = (idx: number, patch: Partial<SplitFormState>, formatAmount: boolean = false) => {
        setSplits((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch, ...(formatAmount ? { amount: Number(patch.amount ?? s.amount).toFixed(initialDecimalPlaces) } : undefined) } : s)));
    };

    const splitsSum = useMemo(
        () => splits.reduce((acc, s) => acc + (parseFloat(s.amount) || 0), 0),
        [splits],
    );

    const buildBody = (): TransactionUpdateWritable => ({
        apply_rules: false,
        group_title: splits.length > 1 ? (groupTitle || null) : null,
        transactions: splits.map<TransactionSplitUpdateWritable>((s) => ({
            transaction_journal_id: s.journalId,
            type: txnType,
            date,
            amount: s.amount,
            description: s.description,
            source_name: s.sourceName || null,
            destination_name: s.destinationName || null,
            category_name: s.categoryName || null,
            budget_name: s.budgetName || null,
            bill_name: s.billName || null,
            notes: s.notes || null,
            tags: s.tags,
        })),
    });

    const handleSave = async () => {
        setError(undefined);
        setSaving(true);
        try {
            const result = await ApiService.updateTransaction(props.transaction.id, buildBody());
            if (result && (result as ValidationErrorResponse).message) {
                const err = result as ValidationErrorResponse;
                const detail = err.errors
                    ? Object.entries(err.errors)
                          .flatMap(([k, v]) => (v ?? []).map((m) => `${k}: ${m}`))
                          .join(' · ')
                    : err.message;
                setError(detail || err.message || 'Save failed');
            } else if (result) {
                props.onSaved(result as TransactionRead);
            } else {
                setError('No response from FireFly III');
            }
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!window.confirm('Delete this transaction from FireFly III? This cannot be undone.')) return;
        setError(undefined);
        setDeleting(true);
        try {
            const ok = await ApiService.deleteTransaction(props.transaction.id);
            if (ok) {
                props.onDeleted();
            } else {
                setError('Delete failed');
            }
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setDeleting(false);
        }
    };

    const fieldFull = { gridColumn: '1 / -1' } as const;
    const sectionLabel = {
        fontSize: '11px',
        textTransform: 'uppercase',
        letterSpacing: '0.8px',
        color: 'primary.light',
        fontWeight: 600,
    } as const;

    return (
        <Box sx={{
            p: '20px 24px',
            backgroundColor: tokens.bgSunken,
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '14px 20px',
        }}>
            <Box sx={{ ...fieldFull, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mb: '4px' }}>
                <Typography sx={sectionLabel}>Edit Transaction</Typography>
                <Typography variant='caption' sx={{ color: 'text.secondary' }}>
                    Stored in FireFly III · transaction #{props.transaction.id}
                    {' · '}{splits.length > 1 ? `${splits.length} splits` : 'single split'}
                </Typography>
            </Box>

            <Autocomplete
                options={txnTypeOptions}
                value={txnType}
                onChange={(_, v) => v && setTxnType(v)}
                disableClearable
                renderInput={(params) => <TextField {...params} label='Transaction Type' variant='outlined' />}
            />
            <TextField
                label='Date'
                type='date'
                variant='outlined'
                value={date}
                onChange={(e) => setDate(e.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
            />

            {isSplit && (
                <TextField
                    sx={fieldFull}
                    label='Group Title'
                    variant='outlined'
                    value={groupTitle}
                    onChange={(e) => setGroupTitle(e.target.value)}
                    helperText='Shown only when the transaction has multiple splits'
                />
            )}

            {/* ── Splits ─────────────────────────────────────────────── */}
            {splits.map((s, idx) => {
                const innerPanel = isSplit ? splitCardSx : ({ ...fieldFull, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 20px' } as const);
                return (
                    <Box key={s.journalId ?? `new_${idx}`} sx={innerPanel}>
                        {isSplit && (
                            <Box sx={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: '2px' }}>
                                <Typography sx={sectionLabel}>
                                    Split {idx + 1}
                                    <Box component='span' sx={{ color: 'text.secondary', fontWeight: 500, textTransform: 'none', letterSpacing: 0, ml: 1 }}>
                                        {s.description ? `— ${s.description}` : ''}
                                    </Box>
                                </Typography>
                                <Button
                                    size='small'
                                    color='error'
                                    startIcon={<DeleteOutlineIcon fontSize='small' />}
                                    onClick={() => setSplits((prev) => prev.filter((_, i) => i !== idx))}
                                    sx={{ fontSize: '11px', textTransform: 'none' }}
                                >
                                    Delete split
                                </Button>
                            </Box>
                        )}

                        <TextField
                            sx={fieldFull}
                            label='Description'
                            variant='outlined'
                            value={s.description}
                            onChange={(e) => updateSplit(idx, { description: e.target.value })}
                        />

                        <Autocomplete
                            freeSolo
                            options={sourceOptionsForType(txnType)}
                            value={s.sourceName}
                            onInputChange={(_, v) => updateSplit(idx, { sourceName: v })}
                            disabled={origTxnType === TransactionTypeProperty.WITHDRAWAL}
                            renderInput={(params) => <TextField {...params} label='Source Account' variant='outlined' />}
                        />
                        <Autocomplete
                            freeSolo
                            options={destinationOptionsForType(txnType)}
                            value={s.destinationName}
                            onInputChange={(_, v) => updateSplit(idx, { destinationName: v })}
                            disabled={origTxnType === TransactionTypeProperty.DEPOSIT}
                            renderInput={(params) => <TextField {...params} label='Destination Account' variant='outlined' />}
                        />
                        <TextField
                            label='Amount'
                            variant='outlined'
                            value={s.amount}
                            onChange={(e) => {
                                // clear helper when input matches pattern
                                const re = new RegExp(`^-?\\d+(\\.(\\d{1,${initialDecimalPlaces}})?)?$`);
                                if (e.target.value === "" || re.test(e.target.value)) {
                                    updateSplit(idx, { amount: e.target.value })
                                    setAmountHelper('');
                                } else {
                                    setAmountHelper('Enter a valid amount (up to 2 decimal places)');
                                }
                            }}
                            onBlur={(e) => updateSplit(idx, { amount: e.target.value }, true) }
                            error={!!amountHelper}
                            helperText={amountHelper}
                            slotProps={{ htmlInput: {inputMode: 'decimal' } }}
                        />
                        <Autocomplete
                            freeSolo
                            options={categoryOptions}
                            value={s.categoryName}
                            onInputChange={(_, v) => updateSplit(idx, { categoryName: v })}
                            renderInput={(params) => <TextField {...params} label='Category' variant='outlined' />}
                        />

                        <Autocomplete
                            sx={fieldFull}
                            multiple
                            freeSolo
                            options={props.tags}
                            value={s.tags}
                            onChange={(_, v) => updateSplit(idx, { tags: v })}
                            renderInput={(params) => <TextField {...params} label='Tags' variant='outlined' placeholder='Type and press enter' />}
                        />

                        <TextField
                            sx={fieldFull}
                            label='Notes'
                            variant='outlined'
                            value={s.notes}
                            onChange={(e) => updateSplit(idx, { notes: e.target.value })}
                            multiline
                            minRows={1}
                            maxRows={3}
                        />

                        {txnType === TransactionTypeProperty.WITHDRAWAL && (
                            <>
                                <Autocomplete
                                    freeSolo
                                    options={budgetOptions}
                                    value={s.budgetName}
                                    onInputChange={(_, v) => updateSplit(idx, { budgetName: v })}
                                    renderInput={(params) => <TextField {...params} label='Budget' variant='outlined' />}
                                />
                                <Autocomplete
                                    freeSolo
                                    options={billOptions}
                                    value={s.billName}
                                    onInputChange={(_, v) => updateSplit(idx, { billName: v })}
                                    renderInput={(params) => <TextField {...params} label='Bill' variant='outlined' />}
                                />
                            </>
                        )}
                    </Box>
                );
            })}

            {txnType !== TransactionTypeProperty.TRANSFER && (
                <>
                    {/* ── Add split + totals ────────────────────────────────── */}
                    <Button
                        sx={{
                            ...fieldFull,
                            border: '1px dashed',
                            borderColor: 'divider',
                            color: 'primary.light',
                            textTransform: 'none',
                            py: 1.25,
                            '&:hover': {
                                borderColor: 'primary.light',
                                backgroundColor: 'rgba(144,202,249,0.06)',
                            },
                        }}
                        startIcon={<AddIcon />}
                        onClick={() => setSplits((prev) => [...prev, emptySplit(prev[0])])}
                    >
                        Add another split
                    </Button>

                    {isSplit && (
                        <Box sx={{ ...fieldFull, display: 'flex', justifyContent: 'flex-end', gap: 2, fontSize: '12px', color: 'text.secondary', pt: '4px' }}>
                            <span>Splits sum: <strong style={{ color: (splitsSum === initialAmount ? tokens.success : tokens.error) }}>{splitsSum.toFixed(initialDecimalPlaces)} / {initialAmount.toFixed(initialDecimalPlaces)} </strong></span>
                        </Box>
                    )}
                </>
            )}
            
            {error && (
                <Alert severity='error' sx={fieldFull}>{error}</Alert>
            )}

            {/* ── Action bar ─────────────────────────────────────────── */}
            <Box sx={{
                ...fieldFull,
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                pt: '12px',
                mt: '4px',
                borderTop: '1px solid',
                borderColor: 'divider',
            }}>
                <Button
                    variant='outlined'
                    color='error'
                    size='small'
                    startIcon={<DeleteOutlineIcon />}
                    onClick={handleDelete}
                    disabled={deleting || saving}
                >
                    {deleting ? <CircularProgress size={14} sx={{ mr: 1 }} /> : null}
                    Delete transaction
                </Button>
                <Box sx={{ flex: 1 }} />
                <Button variant='outlined' color='secondary' size='small' onClick={props.onCancel} disabled={saving || deleting}>
                    Cancel
                </Button>
                <Button variant='contained' size='small' onClick={handleSave} disabled={saving || deleting}>
                    {saving ? <CircularProgress size={14} sx={{ mr: 1 }} /> : null}
                    Save changes
                </Button>
            </Box>
        </Box>
    );
};

export default TransactionEditor;
