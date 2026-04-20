'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { authFetch } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import {
  Calendar, Users, TrendingUp, Heart, ShieldAlert, Wallet, RefreshCcw, ArrowLeft, Eye, Clock, Download, ArrowUpDown, FileDown,
} from 'lucide-react';
import { toast } from 'sonner';

const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';

type RangeKey = 'month' | '3months' | '12months' | 'all';

interface Kpis {
  totalBookings: number;
  completedBookings: number;
  cancelledBookings: number;
  quotesSent: number;
  quotesAccepted: number;
  conversionRate: number;
  revenueGross: number;
  revenueNet: number;
  avgBookingValue: number;
  refundTotal: number;
  warrantyClaims: number;
  favorites: number;
  views: number;
  bookingRate: number;
  overdueRate: number;
  avgOverdueDays: number;
}

interface ServiceBreakdown {
  service: string;
  bookings: number;
  revenue: number;
  completed: number;
}

interface ProjectBreakdown {
  projectId: string;
  title: string;
  bookings: number;
  revenue: number;
  completed: number;
}

interface BookingRow {
  bookingNumber: string;
  createdAt: string;
  status: string;
  service: string;
  project: string;
  customer: string;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  completedAt: string | null;
  gross: number;
  net: number;
  paymentStatus: string;
  overdue: boolean;
}

type SortKey = 'createdAt' | 'service' | 'project' | 'net' | 'status';
type SortDir = 'asc' | 'desc';

interface Funnel {
  rfq: number;
  quoted: number;
  accepted: number;
  completed: number;
}

interface MonthlyRevenue {
  month: string;
  revenue: number;
  bookings: number;
}

interface DashboardData {
  range: RangeKey;
  kpis: Kpis;
  funnel: Funnel;
  monthlyRevenue: MonthlyRevenue[];
  serviceBreakdown: ServiceBreakdown[];
  projectBreakdown: ProjectBreakdown[];
}

const formatEuro = (amount: number) =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(amount);

const RANGE_LABELS: Record<RangeKey, string> = {
  month: 'This month',
  '3months': 'Last 3 months',
  '12months': 'Last 12 months',
  all: 'All time',
};

export default function ProfessionalEarningsDashboard() {
  const router = useRouter();
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const [range, setRange] = useState<RangeKey>('12months');
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [bookingsLoading, setBookingsLoading] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('createdAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [exporting, setExporting] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const dashboardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!authLoading) {
      if (!isAuthenticated) {
        router.push('/login');
        return;
      }
      if (user && user.role !== 'professional') {
        router.push('/dashboard');
      }
    }
  }, [authLoading, isAuthenticated, user, router]);

  const loadStats = useCallback(async (selectedRange: RangeKey, isRefresh = false, signal?: AbortSignal) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const response = await authFetch(
        `${API_BASE}/api/professionals/dashboard/stats?range=${selectedRange}`,
        { signal }
      );
      const payload = await response.json();
      if (response.ok && payload?.success) {
        setData(payload.data);
      } else {
        toast.error(payload?.error?.message || 'Failed to load dashboard stats');
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      toast.error(err instanceof Error ? err.message : 'Failed to load dashboard stats');
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  const loadBookings = useCallback(async (selectedRange: RangeKey, signal?: AbortSignal) => {
    setBookingsLoading(true);
    try {
      const response = await authFetch(
        `${API_BASE}/api/professionals/dashboard/bookings?range=${selectedRange}&limit=200`,
        { signal }
      );
      const payload = await response.json();
      if (response.ok && payload?.success) {
        setBookings(payload.data.bookings || []);
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      // silent — bookings table is secondary
    } finally {
      if (!signal?.aborted) {
        setBookingsLoading(false);
      }
    }
  }, []);

  const exportPdf = useCallback(async () => {
    if (!dashboardRef.current) return;
    setExportingPdf(true);
    try {
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import('html2canvas-pro'),
        import('jspdf'),
      ]);

      const canvas = await html2canvas(dashboardRef.current, {
        scale: 2,
        backgroundColor: '#f9fafb',
        useCORS: true,
        logging: false,
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 8;
      const imgWidth = pageWidth - margin * 2;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      let heightLeft = imgHeight;
      let position = margin;

      pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight);
      heightLeft -= pageHeight - margin * 2;

      while (heightLeft > 0) {
        position = margin - (imgHeight - heightLeft);
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight);
        heightLeft -= pageHeight - margin * 2;
      }

      pdf.save(`fixera-dashboard-${range}-${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (err) {
      console.error('PDF export failed:', err);
      toast.error('Failed to export PDF');
    } finally {
      setExportingPdf(false);
    }
  }, [range]);

  const exportCsv = useCallback(async () => {
    setExporting(true);
    try {
      const response = await authFetch(
        `${API_BASE}/api/professionals/dashboard/bookings?range=${range}&format=csv&limit=1000`
      );
      if (!response.ok) {
        toast.error('Failed to export CSV');
        return;
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `fixera-bookings-${range}-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error('Failed to export CSV');
    } finally {
      setExporting(false);
    }
  }, [range]);

  useEffect(() => {
    if (isAuthenticated && user?.role === 'professional') {
      const controller = new AbortController();
      void loadStats(range, false, controller.signal);
      void loadBookings(range, controller.signal);
      return () => controller.abort();
    }
  }, [isAuthenticated, user, range, loadStats, loadBookings]);

  const sortedBookings = useMemo(() => {
    return [...bookings].sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'createdAt') {
        cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      } else if (sortKey === 'net') {
        cmp = (a.net || 0) - (b.net || 0);
      } else {
        cmp = String(a[sortKey] || '').localeCompare(String(b[sortKey] || ''));
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [bookings, sortKey, sortDir]);

  if (authLoading || (loading && !data)) {
    return (
      <div className="min-h-screen bg-gray-50 p-6 mt-16">
        <div className="max-w-7xl mx-auto space-y-4">
          <Skeleton className="h-8 w-64" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-28 w-full" />
            ))}
          </div>
          <Skeleton className="h-80 w-full" />
          <Skeleton className="h-80 w-full" />
        </div>
      </div>
    );
  }

  const kpis = data?.kpis;
  const funnel = data?.funnel;
  const monthlyRevenue = data?.monthlyRevenue ?? [];

  const kpiCards = [
    { label: 'Net Revenue', value: formatEuro(kpis?.revenueNet ?? 0), icon: Wallet, accent: 'text-emerald-700', gradient: 'from-emerald-200 via-teal-200 to-green-200' },
    { label: 'Completed Bookings', value: kpis?.completedBookings ?? 0, icon: TrendingUp, accent: 'text-sky-700', gradient: 'from-sky-200 via-blue-200 to-cyan-200' },
    { label: 'Profile Views', value: kpis?.views ?? 0, icon: Eye, accent: 'text-indigo-700', gradient: 'from-indigo-200 via-violet-200 to-purple-200' },
    { label: 'Favorites', value: kpis?.favorites ?? 0, icon: Heart, accent: 'text-pink-600', gradient: 'from-pink-200 via-rose-200 to-fuchsia-200' },
    { label: 'Quote Conversion', value: `${kpis?.conversionRate ?? 0}%`, icon: Users, accent: 'text-blue-700', gradient: 'from-blue-200 via-sky-200 to-indigo-200' },
    { label: 'View → Booking', value: `${kpis?.bookingRate ?? 0}%`, icon: TrendingUp, accent: 'text-teal-700', gradient: 'from-teal-200 via-emerald-200 to-cyan-200' },
    { label: 'Overdue Rate', value: `${kpis?.overdueRate ?? 0}%`, icon: Clock, accent: 'text-amber-700', gradient: 'from-amber-200 via-yellow-200 to-orange-200' },
    { label: 'Avg Overdue Days', value: `${kpis?.avgOverdueDays ?? 0}`, icon: Clock, accent: 'text-orange-700', gradient: 'from-orange-200 via-amber-200 to-yellow-200' },
    { label: 'Warranty Claims', value: kpis?.warrantyClaims ?? 0, icon: ShieldAlert, accent: 'text-orange-700', gradient: 'from-orange-200 via-red-200 to-rose-200' },
    { label: 'Cancellations', value: kpis?.cancelledBookings ?? 0, icon: Calendar, accent: 'text-rose-600', gradient: 'from-rose-200 via-red-200 to-pink-200' },
    { label: 'Avg Booking Value', value: formatEuro(kpis?.avgBookingValue ?? 0), icon: TrendingUp, accent: 'text-lime-700', gradient: 'from-lime-200 via-green-200 to-emerald-200' },
    { label: 'Refunds Issued', value: formatEuro(kpis?.refundTotal ?? 0), icon: RefreshCcw, accent: 'text-red-600', gradient: 'from-red-200 via-rose-200 to-pink-200' },
  ];

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir(key === 'createdAt' || key === 'net' ? 'desc' : 'asc');
    }
  };

  const funnelData = funnel
    ? [
        { stage: 'RFQ', count: funnel.rfq },
        { stage: 'Quoted', count: funnel.quoted },
        { stage: 'Accepted', count: funnel.accepted },
        { stage: 'Completed', count: funnel.completed },
      ]
    : [];

  return (
    <div className="min-h-screen bg-gray-50 p-6 mt-16">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push('/dashboard')}
              className="h-9"
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              Dashboard
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Performance Dashboard</h1>
              <p className="text-sm text-gray-500">{RANGE_LABELS[range]}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Select value={range} onValueChange={(v) => setRange(v as RangeKey)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="month">This month</SelectItem>
                <SelectItem value="3months">Last 3 months</SelectItem>
                <SelectItem value="12months">Last 12 months</SelectItem>
                <SelectItem value="all">All time</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { void loadStats(range, true); void loadBookings(range); }}
              disabled={refreshing}
              className="h-9"
            >
              <RefreshCcw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={exportCsv}
              disabled={exporting}
              className="h-9"
            >
              <Download className="w-4 h-4 mr-1" />
              {exporting ? 'Exporting...' : 'CSV'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={exportPdf}
              disabled={exportingPdf}
              className="h-9"
            >
              <FileDown className="w-4 h-4 mr-1" />
              {exportingPdf ? 'Rendering...' : 'PDF'}
            </Button>
          </div>
        </div>

        <div ref={dashboardRef} className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {kpiCards.map((kpi) => {
            const Icon = kpi.icon;
            return (
              <div
                key={kpi.label}
                className={`rounded-xl p-[1.5px] bg-gradient-to-br ${kpi.gradient} shadow-sm hover:shadow-md transition-shadow`}
              >
                <Card className="rounded-[11px] border-0 bg-white h-full shadow-none">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                        {kpi.label}
                      </span>
                      <Icon className={`w-4 h-4 ${kpi.accent}`} />
                    </div>
                    <p className={`text-2xl font-bold mt-2 ${kpi.accent}`}>{kpi.value}</p>
                  </CardContent>
                </Card>
              </div>
            );
          })}
        </div>

        <div className="rounded-xl p-[1.5px] bg-gradient-to-br from-emerald-200 via-teal-200 to-cyan-200 shadow-sm">
        <Card className="rounded-[11px] border-0 bg-white shadow-none">
          <CardHeader>
            <CardTitle className="text-lg">Monthly Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            {monthlyRevenue.length === 0 ? (
              <div className="flex items-center justify-center h-64 text-sm text-gray-500">
                No revenue data for this period.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={monthlyRevenue} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#16a34a" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#16a34a" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="month" fontSize={12} />
                  <YAxis fontSize={12} tickFormatter={(v) => `€${v}`} />
                  <Tooltip
                    formatter={(value: number) => formatEuro(value)}
                    labelStyle={{ color: '#111827' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke="#16a34a"
                    fill="url(#revenueGradient)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
        </div>

        <div className="rounded-xl p-[1.5px] bg-gradient-to-br from-blue-200 via-indigo-200 to-sky-200 shadow-sm">
        <Card className="rounded-[11px] border-0 bg-white shadow-none">
          <CardHeader>
            <CardTitle className="text-lg">Booking Funnel</CardTitle>
          </CardHeader>
          <CardContent>
            {funnelData.every((s) => s.count === 0) ? (
              <div className="flex items-center justify-center h-64 text-sm text-gray-500">
                No funnel data yet.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={funnelData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="stage" fontSize={12} />
                  <YAxis fontSize={12} allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="count" name="Bookings" fill="#2563eb" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-xl p-[1.5px] bg-gradient-to-br from-purple-200 via-violet-200 to-fuchsia-200 shadow-sm">
          <Card className="rounded-[11px] border-0 bg-white shadow-none h-full">
            <CardHeader>
              <CardTitle className="text-lg">Top Services</CardTitle>
            </CardHeader>
            <CardContent>
              {(data?.serviceBreakdown?.length ?? 0) === 0 ? (
                <div className="text-sm text-gray-500 py-6 text-center">No service data for this period.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-gray-500 uppercase">
                      <th className="py-2">Service</th>
                      <th className="py-2 text-right">Bookings</th>
                      <th className="py-2 text-right">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data!.serviceBreakdown.map((s) => (
                      <tr key={s.service} className="border-b last:border-0">
                        <td className="py-2 text-gray-900">{s.service}</td>
                        <td className="py-2 text-right text-gray-700">{s.bookings}</td>
                        <td className="py-2 text-right font-medium text-green-700">{formatEuro(s.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
          </div>

          <div className="rounded-xl p-[1.5px] bg-gradient-to-br from-sky-200 via-blue-200 to-indigo-200 shadow-sm">
          <Card className="rounded-[11px] border-0 bg-white shadow-none h-full">
            <CardHeader>
              <CardTitle className="text-lg">Top Projects</CardTitle>
            </CardHeader>
            <CardContent>
              {(data?.projectBreakdown?.length ?? 0) === 0 ? (
                <div className="text-sm text-gray-500 py-6 text-center">No project data for this period.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-gray-500 uppercase">
                      <th className="py-2">Project</th>
                      <th className="py-2 text-right">Bookings</th>
                      <th className="py-2 text-right">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data!.projectBreakdown.map((p) => (
                      <tr key={p.projectId} className="border-b last:border-0">
                        <td className="py-2 text-gray-900 max-w-[250px] truncate" title={p.title}>{p.title}</td>
                        <td className="py-2 text-right text-gray-700">{p.bookings}</td>
                        <td className="py-2 text-right font-medium text-green-700">{formatEuro(p.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
          </div>
        </div>

        <div className="rounded-xl p-[1.5px] bg-gradient-to-br from-rose-200 via-pink-200 to-orange-200 shadow-sm">
        <Card className="rounded-[11px] border-0 bg-white shadow-none">
          <CardHeader>
            <CardTitle className="text-lg">Bookings</CardTitle>
          </CardHeader>
          <CardContent>
            {bookingsLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : sortedBookings.length === 0 ? (
              <div className="text-sm text-gray-500 py-6 text-center">No bookings for this period.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-gray-500 uppercase">
                      <th className="py-2">
                        <button className="flex items-center gap-1 hover:text-gray-700" onClick={() => toggleSort('createdAt')}>
                          Date <ArrowUpDown className="w-3 h-3" />
                        </button>
                      </th>
                      <th className="py-2">Booking #</th>
                      <th className="py-2">
                        <button className="flex items-center gap-1 hover:text-gray-700" onClick={() => toggleSort('service')}>
                          Service <ArrowUpDown className="w-3 h-3" />
                        </button>
                      </th>
                      <th className="py-2">
                        <button className="flex items-center gap-1 hover:text-gray-700" onClick={() => toggleSort('project')}>
                          Project <ArrowUpDown className="w-3 h-3" />
                        </button>
                      </th>
                      <th className="py-2">
                        <button className="flex items-center gap-1 hover:text-gray-700" onClick={() => toggleSort('status')}>
                          Status <ArrowUpDown className="w-3 h-3" />
                        </button>
                      </th>
                      <th className="py-2 text-right">
                        <button className="flex items-center gap-1 ml-auto hover:text-gray-700" onClick={() => toggleSort('net')}>
                          Net <ArrowUpDown className="w-3 h-3" />
                        </button>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedBookings.map((b) => (
                      <tr key={b.bookingNumber} className="border-b last:border-0">
                        <td className="py-2 text-gray-700 whitespace-nowrap">
                          {new Date(b.createdAt).toLocaleDateString()}
                        </td>
                        <td className="py-2 text-gray-900 font-mono text-xs">{b.bookingNumber}</td>
                        <td className="py-2 text-gray-700">{b.service || '—'}</td>
                        <td className="py-2 text-gray-700 max-w-[200px] truncate" title={b.project}>{b.project || '—'}</td>
                        <td className="py-2">
                          <span className="inline-flex items-center gap-1">
                            <span className="text-gray-700">{b.status}</span>
                            {b.overdue && (
                              <span className="text-[10px] font-medium text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
                                overdue
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="py-2 text-right font-medium text-green-700 whitespace-nowrap">
                          {formatEuro(b.net)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
        </div>
        </div>
      </div>
    </div>
  );
}
