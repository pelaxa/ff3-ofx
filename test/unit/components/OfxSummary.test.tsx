import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import OfxSummary from '@/components/OfxSummary';
import { OfxAccount, OfxAccountStatus } from '@/lib/interfaces';

const accounts: OfxAccount[] = [
    { accountNumber: '1111', status: OfxAccountStatus.PROCESSED },
    { accountNumber: '2222', status: OfxAccountStatus.PROCESSING },
    { accountNumber: '3333', status: OfxAccountStatus.UNPROCESSED },
];

describe('OfxSummary', () => {
    it('renders a chip per account showing its number', () => {
        render(<OfxSummary accounts={accounts} clickHandler={vi.fn()} selectionAllowed={true} />);
        expect(screen.getByText('1111')).toBeInTheDocument();
        expect(screen.getByText('2222')).toBeInTheDocument();
        expect(screen.getByText('3333')).toBeInTheDocument();
    });

    it('invokes clickHandler with the index when an unprocessed chip is clicked', () => {
        const click = vi.fn();
        render(<OfxSummary accounts={accounts} clickHandler={click} selectionAllowed={true} />);
        // Only the UNPROCESSED chip (idx 2) is enabled; clicking it should fire with idx=2.
        fireEvent.click(screen.getByText('3333'));
        expect(click).toHaveBeenCalledWith(2);
    });

    it('does not fire the click for processed/processing chips when selection allowed', () => {
        const click = vi.fn();
        render(<OfxSummary accounts={accounts} clickHandler={click} selectionAllowed={true} />);
        fireEvent.click(screen.getByText('1111'));
        fireEvent.click(screen.getByText('2222'));
        expect(click).not.toHaveBeenCalled();
    });

    it('disables every chip when selectionAllowed is false', () => {
        const click = vi.fn();
        render(<OfxSummary accounts={accounts} clickHandler={click} selectionAllowed={false} />);
        fireEvent.click(screen.getByText('3333'));
        expect(click).not.toHaveBeenCalled();
    });
});
