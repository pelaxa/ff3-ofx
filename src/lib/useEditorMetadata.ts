import { useCallback, useState } from 'react';
import ApiService from '@/lib/apiService';
import type {
    AccountRead,
    BillRead,
    BudgetRead,
    CategoryRead,
    TransactionRead,
} from '@billos/firefly-iii-sdk';
import type { EditorMetadata } from '@/lib/interfaces';

/**
 * Merge any newly-created categories/budgets/bills/tags/accounts that FF3
 * auto-resolved from *_name fields into the cached editor metadata, so the
 * next edit's autocompletes show them without a refetch.
 * @param meta The autocomplete data we already have
 * @param updated The transaction as FireFly III returned it after a save
 * @returns A copy of meta with the new entries added, or meta itself when nothing new was created
 */
export const mergeCreatedEntities = (meta: EditorMetadata, updated: TransactionRead): EditorMetadata => {
    const knownCat = new Set(meta.categories.map((c) => c.attributes.name));
    const knownBud = new Set(meta.budgets.map((b) => b.attributes.name));
    const knownBill = new Set(meta.bills.map((b) => b.attributes.name).filter((n): n is string => !!n));
    const knownTag = new Set(meta.tags);
    const knownAccount = new Set(meta.accounts.map((a) => `${a.id}|${a.attributes.name}`));
    const newCats: CategoryRead[] = [];
    const newBuds: BudgetRead[] = [];
    const newBills: BillRead[] = [];
    const newTags: string[] = [];
    const newAccounts: AccountRead[] = [];
    for (const s of updated.attributes.transactions) {
        if (s.category_name && !knownCat.has(s.category_name)) {
            newCats.push({ type: 'categories', id: s.category_id ?? '', attributes: { name: s.category_name } } as CategoryRead);
            knownCat.add(s.category_name);
        }
        if (s.budget_name && !knownBud.has(s.budget_name)) {
            newBuds.push({ type: 'budgets', id: s.budget_id ?? '', attributes: { name: s.budget_name } } as BudgetRead);
            knownBud.add(s.budget_name);
        }
        if (s.bill_name && !knownBill.has(s.bill_name)) {
            newBills.push({ type: 'bills', id: s.bill_id ?? '', attributes: { name: s.bill_name } } as BillRead);
            knownBill.add(s.bill_name);
        }
        for (const tag of s.tags ?? []) {
            if (!knownTag.has(tag)) {
                newTags.push(tag);
                knownTag.add(tag);
            }
        }
        // FF3 may have auto-created expense/revenue accounts from the typed names.
        // Synthesize records using the resolved ids so the next edit's account
        // dropdown contains them. Type is inferred from the side that's
        // typically auto-created for each transaction type.
        if (s.source_name && s.source_id) {
            const key = `${s.source_id}|${s.source_name}`;
            if (!knownAccount.has(key)) {
                newAccounts.push({
                    type: 'accounts',
                    id: s.source_id,
                    attributes: { name: s.source_name, type: (s.source_type ?? 'asset') as never },
                } as AccountRead);
                knownAccount.add(key);
            }
        }
        if (s.destination_name && s.destination_id) {
            const key = `${s.destination_id}|${s.destination_name}`;
            if (!knownAccount.has(key)) {
                newAccounts.push({
                    type: 'accounts',
                    id: s.destination_id,
                    attributes: { name: s.destination_name, type: (s.destination_type ?? 'asset') as never },
                } as AccountRead);
                knownAccount.add(key);
            }
        }
    }
    if (!newCats.length && !newBuds.length && !newBills.length && !newTags.length && !newAccounts.length) {
        return meta;
    }
    return {
        accounts: newAccounts.length ? [...meta.accounts, ...newAccounts] : meta.accounts,
        categories: newCats.length ? [...meta.categories, ...newCats] : meta.categories,
        budgets: newBuds.length ? [...meta.budgets, ...newBuds] : meta.budgets,
        bills: newBills.length ? [...meta.bills, ...newBills] : meta.bills,
        tags: newTags.length ? [...meta.tags, ...newTags] : meta.tags,
    };
};

/**
 * Holds the editor's autocomplete data (accounts, categories, budgets, bills, tags).
 * It is fetched the first time an editor is opened, then kept so later edits reuse it.
 * Both the Import and Transactions tabs use this so they behave the same way.
 * @returns editorMetadata (undefined until loaded), ensureEditorMetadata() to load it, and
 *          mergeSavedTransaction(updated) to add what a save created
 */
export const useEditorMetadata = () => {
    const [editorMetadata, setEditorMetadata] = useState<EditorMetadata>();
    const [metadataLoading, setMetadataLoading] = useState(false);

    // Loads the metadata unless we already have it or a load is already in progress
    const ensureEditorMetadata = useCallback(async () => {
        if (editorMetadata || metadataLoading) return;
        setMetadataLoading(true);
        try {
            const [allAccounts, categories, budgets, bills, tags] = await Promise.all([
                ApiService.listAllAccounts(),
                ApiService.listCategories(),
                ApiService.listBudgets(),
                ApiService.listBills(),
                ApiService.listTags(),
            ]);
            setEditorMetadata({ accounts: allAccounts, categories, budgets, bills, tags });
        } catch (e) {
            console.error('Failed to load editor metadata', e);
        } finally {
            setMetadataLoading(false);
        }
    }, [editorMetadata, metadataLoading]);

    /**
     * Call after a successful save. Does nothing until the metadata has been loaded.
     * @param updated The transaction as FireFly III returned it after the save
     */
    const mergeSavedTransaction = useCallback((updated: TransactionRead) => {
        setEditorMetadata((meta) => (meta ? mergeCreatedEntities(meta, updated) : meta));
    }, []);

    return { editorMetadata, ensureEditorMetadata, mergeSavedTransaction };
};
