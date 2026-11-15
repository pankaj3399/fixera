'use client'

import { getErrorMessage, messageFromApiBody } from '@/lib/apiErrors';


import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { setAuthToken } from '@/lib/utils';

const API = process.env.NEXT_PUBLIC_BACKEND_URL;

type InviteDetails = {
  name: string;
  email: string;
  adminRole: string;
  roleLabel: string;
};

function AcceptInviteContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { checkAuth } = useAuth();
  const token = searchParams.get('token') || '';

  const [details, setDetails] = useState<InviteDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setLoading(true);
    setLoadError(null);
    setDetails(null);
    setPassword('');
    setConfirmPassword('');

    if (!API) {
      console.error('Admin invite page: NEXT_PUBLIC_BACKEND_URL is missing.');
      setLoadError('This invite link is currently unavailable. Please try again later.');
      setLoading(false);
      return;
    }

    if (!token) {
      setLoadError('Missing invite token. Check the link from your email.');
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `${API}/api/auth/admin-invite?token=${encodeURIComponent(token)}`,
          { credentials: 'include' }
        );
        const json = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(messageFromApiBody(json, 'Invalid invite link'));
        }
        if (!cancelled) setDetails(json.data);
      } catch (err: unknown) {
        if (!cancelled) {
          setLoadError(getErrorMessage(err, 'Invalid invite link'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!API) {
      toast.error('This invite link is currently unavailable. Please try again later.');
      return;
    }
    if (password.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    if (password !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${API}/api/auth/admin-invite/accept`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(messageFromApiBody(json, 'Could not activate account'));
      }

      // Acceptance already succeeded — session sync failures must not look like activation failures
      setAuthToken(json.token);
      try {
        const currentUser = await checkAuth({ strict: true });
        if (!currentUser) throw new Error('Session refresh failed');
        toast.success('Account activated — welcome to the team');
        router.push('/dashboard');
      } catch {
        toast.success('Account activated — please sign in to continue');
        router.push('/login');
      }
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Could not activate account'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (loadError || !details) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Invite link unavailable</CardTitle>
            <CardDescription>{loadError || 'This invite link is invalid or has expired.'}</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/login" className="text-sm text-blue-600 hover:underline">
              Go to sign in
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-center text-2xl font-bold">Set up your admin account</CardTitle>
          <CardDescription className="text-center">
            Hi {details.name}, you&apos;ve been invited as <strong>{details.roleLabel}</strong> (
            {details.email}).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Choose a password"
                  required
                  minLength={8}
                  className="pr-10"
                />
                <button
                  type="button"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm password</Label>
              <Input
                id="confirm-password"
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm your password"
                required
                minLength={8}
              />
            </div>

            <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Activating…
                </>
              ) : (
                'Activate account'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function AdminAcceptInvitePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50" />}>
      <AcceptInviteContent />
    </Suspense>
  );
}
