import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { ItemDialog } from '@/components/schedule/item-dialog';
import type { EditItem } from '@/components/schedule/model';

beforeAll(() => {
  // jsdom lacks <dialog> modal support.
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});

const item: EditItem = {
  key: 'k1',
  kind: 'CONTENT',
  contentItemId: 'c1',
  commercialBreakId: null,
  label: null,
  title: 'Evening News',
  category: 'NEWS',
  houseNumber: null,
  isDurationEditable: true,
  defaultDurationMs: 1_800_000,
  timingMode: 'SEQUENTIAL',
  fixedTime: null,
  plannedDurationMs: null,
  estimatedDurationMs: null,
  gapAfterMs: null,
  isLive: false,
  notes: null,
  children: [],
};

describe('ItemDialog', () => {
  it('validates input and reports errors accessibly', () => {
    const onSave = vi.fn();
    render(<ItemDialog item={item} position={0} count={3} onClose={() => undefined} onSave={onSave} />);
    fireEvent.change(screen.getByLabelText('Planned duration override'), { target: { value: '00:00:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(screen.getByRole('alert')).toHaveTextContent('greater than zero');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('applies fixed time, duration override and a new position', () => {
    const onSave = vi.fn();
    render(<ItemDialog item={item} position={0} count={3} onClose={() => undefined} onSave={onSave} />);
    fireEvent.click(screen.getByLabelText('Fixed start time'));
    fireEvent.change(screen.getByLabelText('Start (channel local time)'), { target: { value: '19:00' } });
    fireEvent.change(screen.getByLabelText('Planned duration override'), { target: { value: '00:25:00' } });
    fireEvent.change(screen.getByLabelText('Position (1–3)'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ timingMode: 'FIXED', fixedTime: '19:00', plannedDurationMs: 1_500_000 }), 2);
  });

  it('disables duration override when content duration is fixed', () => {
    render(<ItemDialog item={{ ...item, isDurationEditable: false }} position={0} count={1} onClose={() => undefined} onSave={() => undefined} />);
    expect(screen.getByLabelText('Planned duration override')).toBeDisabled();
  });
});
