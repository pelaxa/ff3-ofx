import type { AmountComparison, SearchField, SearchFieldOption, SearchFilter } from '@/lib/interfaces';

// The fields offered when the search box is focused, in the order they are listed
export const SEARCH_FIELD_OPTIONS: SearchFieldOption[] = [
    { field: 'description', label: 'Description' },
    { field: 'category', label: 'Category' },
    { field: 'tag', label: 'Tag' },
    { field: 'notes', label: 'Notes' },
    { field: 'amount', label: 'Amount' },
];

// The ways an amount can be compared, with the symbol shown in the filter and the words shown in the menu
export const AMOUNT_COMPARISON_OPTIONS: { comparison: AmountComparison; symbol: string; label: string }[] = [
    { comparison: 'is', symbol: '=', label: 'exactly' },
    { comparison: 'more', symbol: '>', label: 'more than' },
    { comparison: 'less', symbol: '<', label: 'less than' },
];

// The FireFly III search operator used for each amount comparison
const AMOUNT_OPERATORS: Record<AmountComparison, string> = { is: 'amount_is', more: 'amount_more', less: 'amount_less' };

/**
 * The name of a field as shown to the user
 * @param field The field to name
 * @returns The label, e.g. "Category"
 */
export const searchFieldLabel = (field: SearchField): string =>
    SEARCH_FIELD_OPTIONS.find((o) => o.field === field)?.label ?? field;

/**
 * The operator shown between a filter's field and value. Category and tag must match exactly (=),
 * description and notes match text inside (contains), and an amount shows the comparison picked.
 * @param field The field the filter searches on
 * @param comparison For an amount, how it is compared (defaults to exactly)
 * @returns The operator text, e.g. "=", ">" or "contains"
 */
export const searchFilterOperator = (field: SearchField, comparison?: AmountComparison): string => {
    if (field === 'amount') {
        return AMOUNT_COMPARISON_OPTIONS.find((o) => o.comparison === (comparison ?? 'is'))?.symbol ?? '=';
    }
    return field === 'description' || field === 'notes' ? 'contains' : '=';
};

/**
 * Text describing a filter in full, e.g. "Category = Food" or "Amount > 50"
 * @param filter The filter to describe
 * @returns The description, used to name the filter for screen readers
 */
export const searchFilterLabel = (filter: SearchFilter): string =>
    `${searchFieldLabel(filter.field)} ${searchFilterOperator(filter.field, filter.comparison)} ${filter.value}`;

/**
 * Wrap a value in double quotes so a value with spaces is searched as one phrase.
 * shortcut: a double quote typed inside the value is dropped because the search syntax has no way to escape it, upgrade if FireFly III documents one
 * @param value The text to quote
 * @returns The quoted text
 */
const quote = (value: string): string => `"${value.replace(/"/g, '')}"`;

/**
 * Turn a filter into the FireFly III search operator that applies it, e.g. category_is:"Food"
 * @param filter The filter to convert
 * @returns The operator text to put in the search query
 */
export const searchFilterToQuery = (filter: SearchFilter): string => {
    switch (filter.field) {
        case 'description': return `description_contains:${quote(filter.value)}`;
        case 'category': return `category_is:${quote(filter.value)}`;
        case 'tag': return `tag_is:${quote(filter.value)}`;
        case 'notes': return `notes_contains:${quote(filter.value)}`;
        case 'amount': return `${AMOUNT_OPERATORS[filter.comparison ?? 'is']}:${filter.value}`;
    }
};

/**
 * The amount comparisons that can still be added. An exact amount can only be used on its own,
 * otherwise "more than" and "less than" can each be used once, which allows a range.
 * @param filters The filters already in the search box
 * @returns The comparisons still available, in menu order (empty when no amount filter can be added)
 */
export const availableAmountComparisons = (filters: SearchFilter[]) => {
    const used = filters.filter((f) => f.field === 'amount').map((f) => f.comparison ?? 'is');
    if (used.length === 0) return AMOUNT_COMPARISON_OPTIONS;
    if (used.includes('is')) return [];
    return AMOUNT_COMPARISON_OPTIONS.filter((o) => o.comparison !== 'is' && !used.includes(o.comparison));
};

/**
 * The fields still offered in the menu: a field that is already in use is removed, except that an
 * amount stays until no more amount comparisons can be added.
 * @param filters The filters already in the search box
 * @returns The fields that can still be added, in menu order
 */
export const availableSearchFields = (filters: SearchFilter[]): SearchFieldOption[] =>
    SEARCH_FIELD_OPTIONS.filter((o) =>
        o.field === 'amount'
            ? availableAmountComparisons(filters).length > 0
            : !filters.some((f) => f.field === o.field));

/**
 * Read an amount typed by the user. Accepts a comma or a dot as the decimal separator.
 * @param text What the user typed
 * @returns The amount written with a dot, e.g. "12.5", or undefined when the text is not a plain positive number
 */
export const parseAmount = (text: string): string | undefined => {
    const normalized = text.trim().replace(',', '.');
    return /^\d+(\.\d+)?$/.test(normalized) ? normalized : undefined;
};
