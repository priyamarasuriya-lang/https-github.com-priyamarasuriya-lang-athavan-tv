'use client';

import { Pencil, Plus, Unlock } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, Dialog, Field, Input, StatusBadge, Table, Td, Th } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { api, errorMessage } from '@/lib/client/api';
import { fmtDateTime } from '@/lib/client/format';

interface User {
  id: string;
  email: string;
  name: string;
  isActive: boolean;
  lockedUntil: string | null;
  lastLoginAt: string | null;
  roles: Array<{ key: string; name: string }>;
}
interface Role {
  key: string;
  name: string;
  description: string | null;
  permissions: string[];
}

export function UsersManager({ currentUserId }: { currentUserId: string }) {
  const toast = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [editing, setEditing] = useState<User | 'new' | null>(null);
  const load = useCallback(async () => {
    try {
      const [u, r] = await Promise.all([api<User[]>('/api/users'), api<Role[]>('/api/roles')]);
      setUsers(u);
      setRoles(r);
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  }, [toast]);
  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="flex flex-col gap-5">
      <Card
        title="Users"
        accent="#f2604b"
        actions={
          <Button variant="primary" onClick={() => setEditing('new')}>
            <Plus className="size-4" /> New user
          </Button>
        }
      >
        <Table caption="Users">
          <thead>
            <tr>
              <Th>User</Th>
              <Th>Roles</Th>
              <Th>Status</Th>
              <Th>Last sign-in</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const locked = u.lockedUntil && new Date(u.lockedUntil) > new Date();
              return (
                <tr key={u.id}>
                  <Td>
                    <div className="font-medium">{u.name}</div>
                    <div className="text-xs text-muted">{u.email}</div>
                  </Td>
                  <Td className="text-xs">{u.roles.map((r) => r.name).join(', ')}</Td>
                  <Td>
                    <div className="flex flex-col items-start gap-1">
                      <StatusBadge status={u.isActive ? 'ACTIVE' : 'ARCHIVED'} />
                      {locked && <StatusBadge status="REJECTED" />}
                    </div>
                  </Td>
                  <Td className="text-xs text-muted">{u.lastLoginAt ? fmtDateTime(u.lastLoginAt) : 'Never'}</Td>
                  <Td className="text-right">
                    {locked && (
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Unlock ${u.name}`}
                        onClick={async () => {
                          await api(`/api/users/${u.id}/unlock`, { body: {} }).catch((e) => toast(errorMessage(e), 'error'));
                          load();
                        }}
                      >
                        <Unlock className="size-4" />
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => setEditing(u)} aria-label={`Edit ${u.name}`}>
                      <Pencil className="size-4" />
                    </Button>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>
      <Card title="Roles & permissions" accent="#566a8c">
        <div className="grid gap-3 md:grid-cols-2">
          {roles.map((r) => (
            <div key={r.key} className="rounded-lg p-3 ring-1 ring-line">
              <div className="font-semibold">{r.name}</div>
              <div className="text-xs text-muted">{r.description}</div>
              <div className="mt-2 flex flex-wrap gap-1">
                {r.permissions.map((p) => (
                  <span key={p} className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px]">
                    {p}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>
      {editing && <UserForm user={editing === 'new' ? null : editing} roles={roles} self={editing !== 'new' && editing.id === currentUserId} onClose={() => setEditing(null)} onSaved={() => (setEditing(null), toast('User saved'), load())} />}
    </div>
  );
}

function UserForm({ user, roles, self, onClose, onSaved }: { user: User | null; roles: Role[]; self: boolean; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [password, setPassword] = useState('');
  const [roleKeys, setRoleKeys] = useState<string[]>(user?.roles.map((r) => r.key) ?? []);
  const [isActive, setActive] = useState(user?.isActive ?? true);
  const [error, setError] = useState<string | null>(null);
  async function save() {
    try {
      if (user) await api(`/api/users/${user.id}`, { method: 'PUT', body: { name, roleKeys, isActive, ...(password ? { password } : {}) } });
      else await api('/api/users', { body: { name, email, password, roleKeys } });
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  return (
    <Dialog
      open
      onClose={onClose}
      title={user ? `Edit ${user.name}` : 'New user'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={!name || roleKeys.length === 0 || (!user && (!email || !password))}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="Full name">{(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
        <Field label="Email">{(id) => <Input id={id} type="email" value={email} disabled={!!user} onChange={(e) => setEmail(e.target.value)} />}</Field>
        <Field label={user ? 'Reset password (optional)' : 'Initial password'} hint="At least 12 characters with upper-case, lower-case and a digit.">
          {(id, d) => <Input id={id} aria-describedby={d} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
        </Field>
        <fieldset>
          <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-navy-700">Roles</legend>
          <div className="grid grid-cols-2 gap-1">
            {roles.map((r) => (
              <label key={r.key} className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" checked={roleKeys.includes(r.key)} onChange={(e) => setRoleKeys((k) => (e.target.checked ? [...k, r.key] : k.filter((x) => x !== r.key)))} />
                {r.name}
              </label>
            ))}
          </div>
        </fieldset>
        {user && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isActive} disabled={self} onChange={(e) => setActive(e.target.checked)} /> Account active {self && '(you cannot deactivate yourself)'}
          </label>
        )}
      </div>
    </Dialog>
  );
}
