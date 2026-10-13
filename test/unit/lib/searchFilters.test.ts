import { describe, it, expect } from 'vitest';
import {
    availableAmountComparisons,
    availableSearchFields,
    parseAmount,
    searchFieldLabel,
    searchFilterLabel,
    searchFilterOperator,
    searchFilterToQuery,
} from '../../../src/lib/searchFilters';
import type { SearchFilter } from '../../../src/lib/interfaces';

describe('searchFilterToQuery', () => {
    it('quotes text values so phrases stay together', () => {
        expect(searchFilterToQuery({ field: 'description', value: 'coffee shop' })).toBe('description_contains:"coffee shop"');
        expect(searchFilterToQuery({ field: 'notes', value: 'late fee' })).toBe('notes_contains:"late fee"');
    });

    it('uses exact matching for category and tag', () => {
        expect(searchFilterToQuery({ field: 'category', value: 'Eating Out' })).toBe('category_is:"Eating Out"');
        expect(searchFilterToQuery({ field: 'tag', value: 'work' })).toBe('tag_is:"work"');
    });

    it('maps each amount comparison to its operator without quotes', () => {
        expect(searchFilterToQuery({ field: 'amount', comparison: 'is', value: '12.5' })).toBe('amount_is:12.5');
        expect(searchFilterToQuery({ field: 'amount', comparison: 'more', value: '50' })).toBe('amount_more:50');
        expect(searchFilterToQuery({ field: 'amount', comparison: 'less', value: '5' })).toBe('amount_less:5');
    });

    it('drops a double quote typed inside a value', () => {
        expect(searchFilterToQuery({ field: 'description', value: 'say "hi"' })).toBe('description_contains:"say hi"');
    });
});

describe('labels and operators', () => {
    it('names each field', () => {
        expect(searchFieldLabel('category')).toBe('Category');
        expect(searchFieldLabel('amount')).toBe('Amount');
    });

    it('shows = for category and tag, contains for description and notes, and the comparison for an amount', () => {
        expect(searchFilterOperator('category')).toBe('=');
        expect(searchFilterOperator('tag')).toBe('=');
        expect(searchFilterOperator('description')).toBe('contains');
        expect(searchFilterOperator('notes')).toBe('contains');
        expect(searchFilterOperator('amount', 'more')).toBe('>');
        expect(searchFilterOperator('amount', 'less')).toBe('<');
        expect(searchFilterOperator('amount', 'is')).toBe('=');
        expect(searchFilterOperator('amount')).toBe('=');
    });

    it('describes a whole filter', () => {
        expect(searchFilterLabel({ field: 'category', value: 'Food' })).toBe('Category = Food');
        expect(searchFilterLabel({ field: 'description', value: 'a b' })).toBe('Description contains a b');
        expect(searchFilterLabel({ field: 'amount', comparison: 'more', value: '5' })).toBe('Amount > 5');
    });
});

describe('available fields and amount comparisons', () => {
    const f = (field: SearchFilter['field'], comparison?: SearchFilter['comparison']): SearchFilter => ({ field, comparison, value: '1' });

    it('offers everything when nothing is used', () => {
        expect(availableSearchFields([]).map((o) => o.field)).toEqual(['description', 'category', 'tag', 'notes', 'amount']);
        expect(availableAmountComparisons([]).map((o) => o.comparison)).toEqual(['is', 'more', 'less']);
    });

    it('removes a field once it is used', () => {
        expect(availableSearchFields([f('category'), f('notes')]).map((o) => o.field)).toEqual(['description', 'tag', 'amount']);
    });

    it('lets an amount range be built from more-than and less-than', () => {
        expect(availableAmountComparisons([f('amount', 'more')]).map((o) => o.comparison)).toEqual(['less']);
        expect(availableAmountComparisons([f('amount', 'less')]).map((o) => o.comparison)).toEqual(['more']);
        expect(availableAmountComparisons([f('amount', 'more'), f('amount', 'less')])).toEqual([]);
    });

    it('allows an exact amount only on its own', () => {
        expect(availableAmountComparisons([f('amount', 'is')])).toEqual([]);
    });

    it('removes amount from the fields once no comparison is left', () => {
        expect(availableSearchFields([f('amount', 'more')]).map((o) => o.field)).toContain('amount');
        expect(availableSearchFields([f('amount', 'more'), f('amount', 'less')]).map((o) => o.field)).not.toContain('amount');
        expect(availableSearchFields([f('amount', 'is')]).map((o) => o.field)).not.toContain('amount');
    });
});

describe('parseAmount', () => {
    it('accepts whole numbers and decimals with a dot or a comma', () => {
        expect(parseAmount('12')).toBe('12');
        expect(parseAmount(' 12.50 ')).toBe('12.50');
        expect(parseAmount('12,5')).toBe('12.5');
    });
    it('rejects anything that is not a plain positive number', () => {
        for (const bad of ['', 'abc', '-5', '1.2.3', '5 dollars']) expect(parseAmount(bad)).toBeUndefined();
    });
});
