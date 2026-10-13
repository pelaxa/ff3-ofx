import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Box, ClickAwayListener, IconButton, InputBase, Paper, Typography } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import CancelIcon from '@mui/icons-material/Cancel';
import CloseIcon from '@mui/icons-material/Close';
import SubjectIcon from '@mui/icons-material/Subject';
import CategoryOutlinedIcon from '@mui/icons-material/CategoryOutlined';
import SellOutlinedIcon from '@mui/icons-material/SellOutlined';
import StickyNote2OutlinedIcon from '@mui/icons-material/StickyNote2Outlined';
import PaidOutlinedIcon from '@mui/icons-material/PaidOutlined';
import type { AmountComparison, SearchField, SearchFilter } from '@/lib/interfaces';
import {
    availableAmountComparisons,
    availableSearchFields,
    parseAmount,
    searchFieldLabel,
    searchFilterLabel,
    searchFilterOperator,
} from '@/lib/searchFilters';

interface SearchFilterInputProps {
    // The filters currently applied, shown as tokens
    filters: SearchFilter[];
    // Called with the new list whenever a filter is added or removed
    onChange: (filters: SearchFilter[]) => void;
    // Existing category names the user can pick from
    categories: string[];
    // Existing tags the user can pick from
    tags: string[];
    // True while the categories and tags are being fetched
    loading: boolean;
    // Set when fetching the categories and tags failed
    loadError?: string;
    // Called when the box gets focus, so the parent can start loading the categories and tags
    onFocus: () => void;
    // Called when the search button is pressed, or Enter with nothing typed, so the parent can reload the results
    onSubmitEmpty: () => void;
}

// A filter being built. The field is chosen first; for an amount the comparison is chosen next.
type Pending = { field: SearchField; comparison?: AmountComparison };

// One row of the menu under the search box
interface MenuRow {
    key: string;
    label: string;
    icon?: ReactNode;
    // Runs when the row is chosen
    pick: () => void;
}

// The icon shown beside each field in the menu
const FIELD_ICONS: Record<SearchField, ReactNode> = {
    description: <SubjectIcon fontSize="small" />,
    category: <CategoryOutlinedIcon fontSize="small" />,
    tag: <SellOutlinedIcon fontSize="small" />,
    notes: <StickyNote2OutlinedIcon fontSize="small" />,
    amount: <PaidOutlinedIcon fontSize="small" />,
};

// Look shared by the three segments (field, operator, value) that make up a token
const segmentSx = {
    display: 'flex',
    alignItems: 'center',
    px: 1,
    py: '2px',
    fontSize: 13,
    lineHeight: '20px',
    whiteSpace: 'nowrap',
    color: 'text.primary',
    backgroundColor: 'action.selected',
};

/**
 * Search box that builds a list of filters, in the style of GitLab's filtered search. Each filter is a
 * token of three segments (field, operator, value). Focusing the box opens a menu of the fields still
 * unused; choosing one asks for the operator (amounts only) and then the value. Nothing can be typed
 * until a field is chosen. Category and tag values must be picked from the existing ones; description,
 * notes and amount take typed text.
 * Backspace deletes the token left of the caret, Delete the one to its right, and the arrow keys
 * move the caret across the tokens.
 * @param props See SearchFilterInputProps
 */
const SearchFilterInput = (props: SearchFilterInputProps) => {
    const { filters, onChange } = props;
    const inputRef = useRef<HTMLInputElement | null>(null);
    const [inputValue, setInputValue] = useState('');
    const [pending, setPending] = useState<Pending | null>(null);
    const [menuOpen, setMenuOpen] = useState(false);
    // Which menu row is highlighted, -1 for none
    const [highlighted, setHighlighted] = useState(-1);
    // Where the caret sits among the tokens: 0 is before the first token, filters.length is after the last
    const [caret, setCaret] = useState(0);
    // True when the typed amount is not a number
    const [amountError, setAmountError] = useState(false);

    const count = filters.length;
    const caretAt = Math.min(caret, count);
    const typed = inputValue.trim().toLowerCase();
    const empty = inputValue === '';

    // What the user is being asked for next
    const stage = !pending ? 'field' : pending.field === 'amount' && !pending.comparison ? 'operator' : 'value';
    // Category and tag values must come from the list; the other fields accept typed text
    const pickFromList = pending?.field === 'category' || pending?.field === 'tag';

    /**
     * Whether a value in the category or tag menu matches the text typed so far
     * @param text The value's label
     * @returns true when nothing is typed or the label contains what was typed
     */
    const matches = (text: string): boolean => !typed || text.toLowerCase().includes(typed);

    /**
     * Finish the pending filter with the given value and add it as a token.
     * Does nothing for an empty value or an amount that is not a number.
     * @param value The value picked from the list or typed by the user
     */
    const addFilter = (value: string) => {
        if (!pending) return;
        let finalValue = value.trim();
        if (pending.field === 'amount') {
            const amount = parseAmount(finalValue);
            if (!amount) {
                setAmountError(true);
                return;
            }
            finalValue = amount;
        }
        if (!finalValue) return;
        onChange([...filters, { field: pending.field, comparison: pending.comparison, value: finalValue }]);
        setPending(null);
        setInputValue('');
        setAmountError(false);
        setCaret(count + 1);
        setMenuOpen(false);
    };

    /**
     * Start a new filter on the chosen field and move on to the next step
     * @param field The field picked from the menu
     */
    const chooseField = (field: SearchField) => {
        setPending({ field });
        setInputValue('');
        setAmountError(false);
        setCaret(count);
    };

    /**
     * Set how the pending amount is compared and move on to the value step
     * @param comparison The comparison picked from the menu
     */
    const chooseComparison = (comparison: AmountComparison) => {
        setPending((p) => (p ? { ...p, comparison } : p));
        setInputValue('');
    };

    /**
     * Remove one filter and keep the caret where it was relative to the other tokens
     * @param index Position of the filter to remove
     */
    const removeFilter = (index: number) => {
        onChange(filters.filter((_, i) => i !== index));
        setCaret(index < caretAt ? caretAt - 1 : caretAt);
        inputRef.current?.focus();
    };

    /**
     * Undo the last step of the filter being built: first the value, then the operator, then the field
     */
    const stepBack = () => {
        if (pending?.field === 'amount' && pending.comparison) setPending({ field: 'amount' });
        else setPending(null);
        setInputValue('');
        setAmountError(false);
    };

    /**
     * Remove every filter and anything half-built
     */
    const clearAll = () => {
        onChange([]);
        setPending(null);
        setInputValue('');
        setAmountError(false);
        setCaret(0);
        inputRef.current?.focus();
    };

    // The rows of the menu for the current step, and a message to show when there is nothing to pick
    let rows: MenuRow[] = [];
    let message: string | undefined;
    if (stage === 'field') {
        rows = availableSearchFields(filters)
            .map((o) => ({ key: o.field, label: o.label, icon: FIELD_ICONS[o.field], pick: () => chooseField(o.field) }));
        if (rows.length === 0) message = 'No more filters to add';
    } else if (stage === 'operator') {
        rows = availableAmountComparisons(filters)
            .map((o) => ({ key: o.comparison, label: `${o.symbol}  ${o.label}`, pick: () => chooseComparison(o.comparison) }));
    } else if (pickFromList) {
        const values = pending?.field === 'category' ? props.categories : props.tags;
        rows = values.filter(matches).map((v) => ({ key: v, label: v, pick: () => addFilter(v) }));
        if (rows.length === 0) {
            if (values.length === 0 && props.loading) message = 'Loading…';
            else if (values.length === 0 && props.loadError) message = 'Could not load the list';
            else message = 'No matches';
        }
    } else {
        message = amountError
            ? 'Enter a number such as 12.34'
            : pending?.field === 'amount' ? 'Type a number, then press Enter' : 'Type text, then press Enter';
    }

    // The first row is highlighted so Enter picks it, except in the field menu where Enter reloads the results
    const defaultHighlight = stage === 'field' ? -1 : 0;
    useEffect(() => {
        setHighlighted(defaultHighlight);
    }, [stage, typed, pending?.field, defaultHighlight]);
    const active = rows.length ? Math.min(highlighted, rows.length - 1) : -1;

    /**
     * Placeholder text that tells the user what to do next
     * @returns The hint for the current step
     */
    const placeholder = (): string => {
        if (stage === 'operator') return 'Pick an operator';
        if (pickFromList) return 'Pick from the list';
        if (pending) return pending.field === 'amount' ? 'Type a number, then press Enter' : 'Type text, then press Enter';
        return count ? 'Add another filter…' : 'Search or filter results…';
    };

    /**
     * Handle the keys that move through the menu and the tokens
     * @param e The key press in the text box
     */
    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        switch (e.key) {
            case 'ArrowDown':
            case 'ArrowUp':
                if (rows.length) {
                    e.preventDefault();
                    setMenuOpen(true);
                    const step = e.key === 'ArrowDown' ? 1 : -1;
                    // With no row highlighted yet, Down goes to the first row and Up to the last
                    setHighlighted(active === -1
                        ? (step === 1 ? 0 : rows.length - 1)
                        : (active + step + rows.length) % rows.length);
                }
                break;
            case 'Enter':
                e.preventDefault();
                if (active >= 0) rows[active].pick();
                else if (stage === 'value' && !pickFromList) addFilter(inputValue);
                else if (!pending && empty) props.onSubmitEmpty();
                break;
            case 'Escape':
                setPending(null);
                setInputValue('');
                setAmountError(false);
                setMenuOpen(false);
                break;
            case 'Backspace':
                if (empty) {
                    if (pending) {
                        e.preventDefault();
                        stepBack();
                    } else if (caretAt > 0) {
                        e.preventDefault();
                        removeFilter(caretAt - 1);
                    }
                }
                break;
            case 'Delete':
                if (empty && !pending && caretAt < count) {
                    e.preventDefault();
                    removeFilter(caretAt);
                }
                break;
            case 'ArrowLeft':
                if (empty && !pending) {
                    e.preventDefault();
                    setCaret(Math.max(0, caretAt - 1));
                }
                break;
            case 'ArrowRight':
                if (empty && !pending) {
                    e.preventDefault();
                    setCaret(Math.min(count, caretAt + 1));
                }
                break;
        }
    };

    // The thin line that shows where the caret is while it sits between tokens
    const caretMarker = (
        <Box
            data-testid="token-caret"
            sx={{
                width: '2px',
                height: 22,
                backgroundColor: 'primary.main',
                '@keyframes blink': { '50%': { opacity: 0 } },
                animation: 'blink 1s step-end infinite',
            }}
        />
    );

    return (
        <ClickAwayListener onClickAway={() => setMenuOpen(false)}>
            <Box sx={{ position: 'relative', flex: 1, minWidth: 320 }}>
                {/* The search bar: tokens, the token being built, the text box, then the clear and search buttons */}
                <Box
                    onClick={() => {
                        inputRef.current?.focus();
                        setMenuOpen(true);
                    }}
                    sx={{
                        display: 'flex',
                        alignItems: 'center',
                        minHeight: 56,
                        border: '1px solid',
                        borderColor: 'text.disabled',
                        borderRadius: 1,
                        pl: 1,
                        '&:focus-within': { borderColor: 'primary.main' },
                    }}
                >
                    <Box sx={{ flex: 1, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 0.5, py: 0.5 }}>
                        {filters.map((f, i) => (
                            <Box key={`${searchFilterLabel(f)}_${i}`} sx={{ display: 'contents' }}>
                                {empty && !pending && caretAt === i && caretMarker}
                                <Box role="group" aria-label={searchFilterLabel(f)} sx={{ display: 'flex', gap: '2px', borderRadius: 1, overflow: 'hidden' }}>
                                    <Box sx={segmentSx}>{searchFieldLabel(f.field)}</Box>
                                    <Box sx={segmentSx}>{searchFilterOperator(f.field, f.comparison)}</Box>
                                    <Box sx={{ ...segmentSx, backgroundColor: 'action.disabledBackground', gap: 0.5 }}>
                                        {f.value}
                                        <IconButton
                                            size="small"
                                            aria-label={`Remove ${searchFilterLabel(f)}`}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                removeFilter(i);
                                            }}
                                            sx={{ p: '2px' }}
                                        >
                                            <CloseIcon sx={{ fontSize: 14 }} />
                                        </IconButton>
                                    </Box>
                                </Box>
                            </Box>
                        ))}
                        {pending && (
                            <Box role="group" aria-label={`${searchFieldLabel(pending.field)} filter being added`} sx={{ display: 'flex', gap: '2px', borderRadius: 1, overflow: 'hidden' }}>
                                <Box sx={segmentSx}>{searchFieldLabel(pending.field)}</Box>
                                {(pending.field !== 'amount' || pending.comparison) && (
                                    <Box sx={segmentSx}>{searchFilterOperator(pending.field, pending.comparison)}</Box>
                                )}
                            </Box>
                        )}
                        <InputBase
                            inputRef={inputRef}
                            value={inputValue}
                            // Text can only be entered for a value, so only once the field (and for an amount, the operator) is chosen
                            readOnly={stage !== 'value'}
                            placeholder={placeholder()}
                            onChange={(e) => {
                                setInputValue(e.target.value);
                                setAmountError(false);
                                setCaret(count);
                                setMenuOpen(true);
                            }}
                            onFocus={() => {
                                setMenuOpen(true);
                                props.onFocus();
                            }}
                            onKeyDown={handleKeyDown}
                            error={amountError}
                            inputProps={{
                                role: 'combobox',
                                'aria-expanded': menuOpen,
                                'aria-autocomplete': 'list',
                                'aria-label': 'Search filters',
                            }}
                            sx={{ flex: 1, minWidth: 140, px: 0.5, fontSize: 14 }}
                        />
                    </Box>
                    {(count > 0 || pending || !empty) && (
                        <IconButton aria-label="Clear all filters" onClick={(e) => { e.stopPropagation(); clearAll(); }} size="small">
                            <CancelIcon />
                        </IconButton>
                    )}
                    <IconButton
                        aria-label="Search"
                        onClick={(e) => {
                            e.stopPropagation();
                            props.onSubmitEmpty();
                        }}
                        sx={{ borderRadius: 0, alignSelf: 'stretch', px: 1.5, borderLeft: '1px solid', borderColor: 'text.disabled' }}
                    >
                        <SearchIcon />
                    </IconButton>
                </Box>

                {/* The menu under the bar: the next step as rows, or a message when there is nothing to pick */}
                {menuOpen && (rows.length > 0 || message) && (
                    <Paper
                        role="listbox"
                        elevation={4}
                        sx={{ position: 'absolute', top: '100%', left: 0, mt: 0.5, zIndex: 20, minWidth: 260, maxHeight: 320, overflowY: 'auto', py: 0.5 }}
                    >
                        {rows.map((row, i) => (
                            <Box
                                key={row.key}
                                role="option"
                                aria-selected={i === active}
                                ref={(el: HTMLElement | null) => {
                                    if (el && i === active) el.scrollIntoView?.({ block: 'nearest' });
                                }}
                                // Keep focus in the text box when a row is clicked
                                onMouseDown={(e) => {
                                    e.preventDefault();
                                    row.pick();
                                }}
                                onMouseEnter={() => setHighlighted(i)}
                                sx={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 1.5,
                                    mx: 0.5,
                                    px: 1.5,
                                    py: 1,
                                    borderRadius: 1,
                                    cursor: 'pointer',
                                    fontSize: 14,
                                    outline: i === active ? '2px solid' : 'none',
                                    outlineColor: 'primary.main',
                                    backgroundColor: i === active ? 'action.hover' : 'transparent',
                                }}
                            >
                                {row.icon}
                                {row.label}
                            </Box>
                        ))}
                        {message && (
                            <Typography variant="body2" sx={{ px: 2, py: 1, color: amountError ? 'error.main' : 'text.secondary' }}>
                                {message}
                            </Typography>
                        )}
                    </Paper>
                )}
            </Box>
        </ClickAwayListener>
    );
};

export default SearchFilterInput;
