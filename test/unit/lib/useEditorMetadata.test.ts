import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { TransactionRead } from '@billos/firefly-iii-sdk';

vi.mock('../../../src/lib/apiService', () => ({
    default: {
        listAllAccounts: vi.fn(async () => []),
        listCategories: vi.fn(async () => []),
        listBudgets: vi.fn(async () => []),
        listBills: vi.fn(async () => []),
        listTags: vi.fn(async () => ['known']),
    },
}));
import ApiService from '../../../src/lib/apiService';
import { useEditorMetadata } from '../../../src/lib/useEditorMetadata';

const saved = (s: Record<string, unknown>) =>
    ({ id: '1', attributes: { transactions: [s] } }) as unknown as TransactionRead;

describe('useEditorMetadata', () => {
    beforeEach(() => { vi.clearAllMocks(); });
    afterEach(() => { vi.restoreAllMocks(); });

    it('loads metadata once and ignores later ensure calls', async () => {
        const { result } = renderHook(() => useEditorMetadata());
        expect(result.current.editorMetadata).toBeUndefined();
        await act(async () => { await result.current.ensureEditorMetadata(); });
        expect(result.current.editorMetadata?.tags).toEqual(['known']);
        await act(async () => { await result.current.ensureEditorMetadata(); });
        expect(ApiService.listTags).toHaveBeenCalledTimes(1);
    });

    it('folds a saved transaction\'s new entities into the cache', async () => {
        const { result } = renderHook(() => useEditorMetadata());
        await act(async () => { await result.current.ensureEditorMetadata(); });
        act(() => { result.current.mergeSavedTransaction(saved({ category_name: 'Coffee', category_id: '3' })); });
        await waitFor(() => expect(result.current.editorMetadata?.categories.map((c) => c.attributes.name)).toEqual(['Coffee']));
    });

    it('ignores a save before metadata has loaded', () => {
        const { result } = renderHook(() => useEditorMetadata());
        act(() => { result.current.mergeSavedTransaction(saved({ category_name: 'Coffee' })); });
        expect(result.current.editorMetadata).toBeUndefined();
    });

    it('logs and recovers when loading fails', async () => {
        const err = vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.mocked(ApiService.listTags).mockRejectedValueOnce(new Error('boom'));
        const { result } = renderHook(() => useEditorMetadata());
        await act(async () => { await result.current.ensureEditorMetadata(); });
        expect(result.current.editorMetadata).toBeUndefined();
        expect(err).toHaveBeenCalled();
    });
});
