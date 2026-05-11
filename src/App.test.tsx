import { render, screen } from '@testing-library/react';
import App from '@/App';

test('renders token input', () => {
  render(<App />);
  expect(screen.getByText(/Provide your FireFlyIII token/i)).toBeInTheDocument();
});
