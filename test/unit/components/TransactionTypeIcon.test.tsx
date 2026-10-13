import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import TransactionTypeIcon from '@/components/TransactionTypeIcon';

// Each known type renders its distinct MUI icon (identified by data-testid);
// unknown/empty types render nothing.
describe('TransactionTypeIcon', () => {
    it('renders the withdrawal (turn-right) icon', () => {
        render(<TransactionTypeIcon type="withdrawal" />);
        expect(screen.getByTestId('TurnRightOutlinedIcon')).toBeInTheDocument();
    });

    it('renders the deposit (turn-left) icon', () => {
        render(<TransactionTypeIcon type="deposit" />);
        expect(screen.getByTestId('TurnLeftOutlinedIcon')).toBeInTheDocument();
    });

    it('renders the transfer (swap) icon', () => {
        render(<TransactionTypeIcon type="transfer" />);
        expect(screen.getByTestId('SwapHorizIcon')).toBeInTheDocument();
    });

    it('renders nothing for an unknown type', () => {
        const { container } = render(<TransactionTypeIcon type="unknown" />);
        expect(container.querySelector('svg')).toBeNull();
    });

    it('renders nothing when no type is provided', () => {
        const { container } = render(<TransactionTypeIcon />);
        expect(container.querySelector('svg')).toBeNull();
    });
});
