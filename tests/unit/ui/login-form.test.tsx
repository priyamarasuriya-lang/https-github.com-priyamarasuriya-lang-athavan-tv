import { fireEvent, render, screen } from '@testing-library/react';
import { LoginForm } from '@/app/login/login-form';

describe('LoginForm', () => {
  it('shows and hides the password with the eye button', () => {
    render(<LoginForm next="/dashboard" expired={false} />);
    const input = screen.getByLabelText('Password');
    expect(input).toHaveAttribute('type', 'password');
    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(input).toHaveAttribute('type', 'text');
    fireEvent.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(input).toHaveAttribute('type', 'password');
  });
});
