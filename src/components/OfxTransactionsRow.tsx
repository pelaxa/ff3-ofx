import { Fragment, useState } from "react";
import { Button, Chip, TableCell, TableRow } from "@mui/material";
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import AddIcon from '@mui/icons-material/Add';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import type { AccountRead, BillRead, BudgetRead, CategoryRead, TransactionRead } from '@billos/firefly-iii-sdk';
import { OfxImportStatus, OfxParsedTransaction } from "@/lib/interfaces";
import OfxTransactionRow from "./OfxMatchingTransactionsTable";
import TransactionEditor from "./TransactionEditor";
import utils from "@/lib/utils";


interface OfxTransactionsTableProps {
    transaction: OfxParsedTransaction;
    index: number;
    importTransaction: (existingTxn: OfxParsedTransaction) => void;
    // Edit support — when provided the row exposes an Edit button on any
    // status that has an underlying FireFly transaction.
    isEditing?: boolean;
    onStartEdit?: (idx: number) => void;
    onSaved?: (idx: number, updated: TransactionRead) => void;
    onDeleted?: (idx: number) => void;
    onCancelEdit?: () => void;
    accounts?: AccountRead[];
    categories?: CategoryRead[];
    budgets?: BudgetRead[];
    bills?: BillRead[];
    tags?: string[];
}

const getEditableFireflyTxn = (t: OfxParsedTransaction): TransactionRead | undefined => {
    const s = t.importStatus;
    if (!s) return undefined;
    if (s.ff3TxnImported) return s.ff3TxnImported;
    if ((s.status === OfxImportStatus.MATCH_EXACT || s.status === OfxImportStatus.MATCH_VALUE)
        && s.matchingTransactions
        && s.matchingTransactions.length === 1) {
        return s.matchingTransactions[0];
    }
    return undefined;
};

const OfxTransactionsRow = (props: OfxTransactionsTableProps) => {

    const [open, setOpen] = useState<boolean>(false);
    const editable = getEditableFireflyTxn(props.transaction);
    const edited = props.transaction.importStatus?.edited === true;

    const getStatus = (status: NonNullable<OfxParsedTransaction['importStatus']>['status'] | undefined) => {
        let jsx = <Chip label="✕ failed" variant="outlined"
                      sx={{ color: '#ef9a9a', borderColor: 'rgba(239,83,80,.3)', backgroundColor: 'rgba(239,83,80,.15)' }} />;
        switch (status) {
            case OfxImportStatus.MATCH_EXACT:
                jsx = <Chip label="= exact match" variant="outlined"
                          sx={{ color: '#42a5f5', borderColor: 'rgba(66,165,245,.3)', backgroundColor: 'rgba(66,165,245,.15)' }} />;
                break;
            case OfxImportStatus.MATCH_VALUE:
                jsx = <Chip label="$ amount match" variant="outlined"
                          sx={{ color: '#ce93d8', borderColor: 'rgba(171,71,188,.3)', backgroundColor: 'rgba(171,71,188,.15)' }}
                          deleteIcon={open ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
                          onDelete={() => setOpen(!open)}/>;
                break;
            case OfxImportStatus.SUCCESS:
                jsx = <Chip label="✓ added" variant="outlined"
                          sx={{ color: '#66bb6a', borderColor: 'rgba(102,187,106,.3)', backgroundColor: 'rgba(102,187,106,.15)' }} />;
                break;
            case OfxImportStatus.DELETED:
                jsx = <Chip label="✕ deleted" variant="outlined"
                      sx={{ color: 'rgb(239,83,80)', borderColor: 'rgba(239,83,80,.3)', backgroundColor: 'rgba(153,0,0,.15)' }} />;
        }
        return jsx;
    }

    const canAddAnyway = props.transaction.importStatus?.status && ![OfxImportStatus.MATCH_EXACT, OfxImportStatus.SUCCESS].includes(props.transaction.importStatus?.status);

    return (
        <Fragment key={`ofxTxn_${props.index}_root`}>
            <TableRow>
                <TableCell>
                    {props.transaction.description}
                </TableCell>
                <TableCell align="center">
                    {props.transaction.datePosted.format('DD-MMM-YYYY')}
                </TableCell>
                <TableCell align="right" sx={{ color: props.transaction.amount >= 0 ? 'success.main' : 'error.main', fontWeight: 500 }}>
                    {utils.getLocaleCurrency(props.transaction.amount)}
                </TableCell>
                <TableCell align="center">
                    <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                        {getStatus(props.transaction.importStatus?.status)}
                        {edited && (
                            <Chip
                                label="✎ edited"
                                variant="outlined"
                                sx={{
                                    color: 'primary.light',
                                    borderColor: 'rgba(144,202,249,.3)',
                                    backgroundColor: 'rgba(144,202,249,.12)',
                                }}
                            />
                        )}
                    </span>
                </TableCell>
                <TableCell align="center">
                    <span style={{ display: 'inline-flex', gap: 8, justifyContent: 'center' }}>
                        {editable && props.onStartEdit && (
                            <Button
                                variant="outlined"
                                size="small"
                                onClick={() => props.isEditing ? props.onCancelEdit?.() : props.onStartEdit?.(props.index)}
                                sx={{
                                    borderColor: 'divider',
                                    color: props.isEditing ? 'primary.light' : 'text.secondary',
                                    fontSize: '12px',
                                    backgroundColor: props.isEditing ? 'rgba(144,202,249,.08)' : undefined,
                                    '&:hover': { borderColor: 'primary.light', color: 'primary.light' },
                                }}>
                                <EditOutlinedIcon sx={{ fontSize: '14px', mr: 0.5 }} />
                                {props.isEditing ? 'Editing…' : 'Edit'}
                            </Button>
                        )}
                        {canAddAnyway && (
                            <Button
                                variant="outlined"
                                size="small"
                                onClick={() => props.importTransaction(props.transaction)}
                                sx={{
                                    borderColor: 'divider',
                                    color: 'text.secondary',
                                    fontSize: '12px',
                                    '&:hover': { borderColor: 'primary.light', color: 'primary.light' },
                                }}>
                                <AddIcon sx={{ fontSize: '14px', mr: 0.5 }} /> {props.transaction.importStatus?.status === OfxImportStatus.DELETED ? 'Add again' : 'Add anyways'}
                            </Button>
                        )}
                    </span>
                </TableCell>
            </TableRow>
            {props.isEditing && editable && props.onSaved && props.onDeleted && props.onCancelEdit && (
                <TableRow>
                    <TableCell colSpan={5} sx={{ p: 0, borderBottom: '1px solid', borderColor: 'divider' }}>
                        <TransactionEditor
                            transaction={editable}
                            accounts={props.accounts ?? []}
                            categories={props.categories ?? []}
                            budgets={props.budgets ?? []}
                            bills={props.bills ?? []}
                            tags={props.tags ?? []}
                            onSaved={(updated) => props.onSaved?.(props.index, updated)}
                            onDeleted={() => props.onDeleted?.(props.index)}
                            onCancel={() => props.onCancelEdit?.()}
                        />
                    </TableCell>
                </TableRow>
            )}
            {props.transaction.importStatus?.status && [OfxImportStatus.FAILURE, OfxImportStatus.MATCH_VALUE].includes(props.transaction.importStatus?.status) && (
                <OfxTransactionRow open={open} transaction={props.transaction} />
            )}
        </Fragment>
    );
};

export default OfxTransactionsRow;
