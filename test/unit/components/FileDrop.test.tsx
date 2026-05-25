import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import FileDrop from '@/components/FileDrop';

describe('FileDrop', () => {
    it('renders the dropzone area when there is no error', () => {
        const { container } = render(<FileDrop errorMessage={undefined} fileLimit={1} onChange={vi.fn()} />);
        // mui-file-dropzone renders an element with `drop_zone` class
        expect(container.querySelector('.drop_zone')).toBeInTheDocument();
    });

    it('renders optional help text', () => {
        render(<FileDrop text="Drop your OFX here" errorMessage={undefined} fileLimit={1} onChange={vi.fn()} />);
        expect(screen.getByText('Drop your OFX here')).toBeInTheDocument();
    });

    it('hides the dropzone if instantiated with an errorMessage', () => {
        const { container } = render(<FileDrop errorMessage="bad" fileLimit={1} onChange={vi.fn()} />);
        // FileDrop captures `errorMessage !== undefined` into local state on mount and hides the dropzone.
        expect(container.querySelector('.drop_zone')).not.toBeInTheDocument();
    });
});
