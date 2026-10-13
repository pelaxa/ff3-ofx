import { JSX } from 'react';
import { Tooltip } from '@mui/material';
import DepositIcon from '@mui/icons-material/TurnLeftOutlined';
import WithdrawIcon from '@mui/icons-material/TurnRightOutlined';
import TransferIcon from '@mui/icons-material/SwapHoriz';
import { TransactionTypeProperty } from '@billos/firefly-iii-sdk';

interface TransactionTypeIconProps {
    type?: string;
}

// Renders the transaction-type glyph used across the app: a red right-turn for
// withdrawals, a green left-turn (mirrored) for deposits and a neutral swap for
// transfers. Mirrors the styling in OfxTransactionsRow so both views match.
const TransactionTypeIcon = ({ type }: TransactionTypeIconProps): JSX.Element | null => {
    switch (type) {
        case TransactionTypeProperty.WITHDRAWAL:
            return (
                <Tooltip title={TransactionTypeProperty.WITHDRAWAL} arrow placement="top">
                    <WithdrawIcon color={'error'} />
                </Tooltip>
            );
        case TransactionTypeProperty.DEPOSIT:
            return (
                <Tooltip title={TransactionTypeProperty.DEPOSIT} arrow placement="top">
                    <DepositIcon color={'success'} sx={{ transform: 'scaleX(-1) rotate(-90deg)' }} />
                </Tooltip>
            );
        case TransactionTypeProperty.TRANSFER:
            return (
                <Tooltip title={TransactionTypeProperty.TRANSFER} arrow placement="top">
                    <TransferIcon sx={{ color: 'text.secondary' }} />
                </Tooltip>
            );
        default:
            return null;
    }
};

export default TransactionTypeIcon;
