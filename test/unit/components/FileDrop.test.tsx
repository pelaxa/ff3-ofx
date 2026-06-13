import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import FileDrop from '@/components/FileDrop';

describe('FileDrop', () => {
    it('renders the dropzone area when there is no error', () => {
        const { container } = render(<FileDrop fileLimit={1} onChange={vi.fn()} />);
        // mui-file-dropzone renders an element with `drop_zone` class
        expect(container.querySelector('.drop_zone')).toBeInTheDocument();
    });

    it('renders optional help text', () => {
        render(<FileDrop text="Drop your OFX here" fileLimit={1} onChange={vi.fn()} />);
        expect(screen.getByText('Drop your OFX here')).toBeInTheDocument();
    });
});
