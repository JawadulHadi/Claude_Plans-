'use client';

import { useEffect, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const USER_ID = 'demo-user-id'; // replaced by Supabase auth context in production

interface BillingInfo {
  plan: 'free' | 'pro' | 'agency';
  applications_used: number;
  applications_limit: number | null;
  period_end: string | null;
  has_billing: boolean;
}

export default function BillingPage() {
  const [info, setInfo]     = useState<BillingInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API}/billing/${USER_ID}`)
      .then(r => r.json())
      .then(setInfo)
      .catch(() => setError('Could not load billing info.'))
      .finally(() => setLoading(false));
  }, []);

  const checkout = async (plan: 'pro' | 'agency') => {
    const r = await fetch(`${API}/billing/${USER_ID}/checkout/${plan}`, { method: 'POST' });
    const { url } = await r.json();
    window.location.href = url;
  };

  const openPortal = async () => {
    const r = await fetch(`${API}/billing/${USER_ID}/portal`, { method: 'POST' });
    const { url } = await r.json();
    window.location.href = url;
  };

  if (loading) return <LoadingState />;
  if (error)   return <p className="text-red-400">{error}</p>;
  if (!info)   return null;

  const usagePct = info.applications_limit
    ? Math.min(100, (info.applications_used / info.applications_limit) * 100)
    : 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Billing & Plan</h1>
        <p className="text-gray-400 mt-1">Manage your subscription and usage</p>
      </div>

      {/* Current plan card */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <span className="text-white font-bold text-lg capitalize">{info.plan} Plan</span>
              <PlanBadge plan={info.plan} />
            </div>
            {info.period_end && (
              <p className="text-gray-500 text-sm mt-1">
                Renews {new Date(info.period_end).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </p>
            )}
          </div>
          {info.has_billing && (
            <button
              onClick={openPortal}
              className="text-sm text-blue-400 hover:text-blue-300 border border-blue-800 px-4 py-2 rounded-lg transition-colors"
            >
              Manage Subscription
            </button>
          )}
        </div>

        {/* Usage bar */}
        {info.applications_limit !== null && (
          <div className="mt-6">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-gray-400">Applications this month</span>
              <span className="text-white">
                {info.applications_used} / {info.applications_limit}
              </span>
            </div>
            <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  usagePct > 80 ? 'bg-red-500' : usagePct > 50 ? 'bg-amber-500' : 'bg-blue-500'
                }`}
                style={{ width: `${usagePct}%` }}
              />
            </div>
            {usagePct >= 90 && (
              <p className="text-amber-400 text-xs mt-2">
                {100 - Math.round(usagePct)}% of monthly limit remaining — consider upgrading.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Upgrade cards — only shown on free/pro */}
      {info.plan !== 'agency' && (
        <div>
          <h2 className="text-lg font-semibold text-white mb-4">Upgrade Your Plan</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {info.plan === 'free' && (
              <UpgradeCard
                plan="pro"
                price="$29/mo"
                features={['Unlimited applications', '15+ boards', 'AI tailoring', 'Autonomous apply', 'Analytics']}
                onUpgrade={() => checkout('pro')}
              />
            )}
            <UpgradeCard
              plan="agency"
              price="$99/mo"
              features={['Everything in Pro', '10 candidate profiles', 'Bulk apply dashboard', 'Agency analytics']}
              onUpgrade={() => checkout('agency')}
            />
          </div>
        </div>
      )}

      {/* Agency team overview — only for agency plan */}
      {info.plan === 'agency' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">Team Profiles</h2>
            <a href="/agency" className="text-blue-400 hover:text-blue-300 text-sm transition-colors">
              Manage profiles →
            </a>
          </div>
          <p className="text-gray-400 text-sm">
            Manage up to 10 candidate profiles from the Agency dashboard.
          </p>
        </div>
      )}
    </div>
  );
}

function PlanBadge({ plan }: { plan: string }) {
  const styles: Record<string, string> = {
    free:   'bg-gray-800 text-gray-400',
    pro:    'bg-blue-900 text-blue-300',
    agency: 'bg-purple-900 text-purple-300',
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${styles[plan] ?? styles.free}`}>
      {plan}
    </span>
  );
}

function UpgradeCard({
  plan, price, features, onUpgrade,
}: {
  plan: string; price: string; features: string[]; onUpgrade: () => void;
}) {
  return (
    <div className="bg-gray-900 rounded-xl border border-gray-700 p-5">
      <div className="flex justify-between items-center mb-3">
        <span className="text-white font-semibold capitalize">{plan}</span>
        <span className="text-blue-400 font-bold">{price}</span>
      </div>
      <ul className="space-y-1 mb-5">
        {features.map(f => (
          <li key={f} className="flex items-center gap-2 text-sm text-gray-300">
            <span className="text-green-400">✓</span>{f}
          </li>
        ))}
      </ul>
      <button
        onClick={onUpgrade}
        className="w-full bg-blue-600 hover:bg-blue-500 text-white py-2 rounded-lg text-sm font-semibold transition-colors"
      >
        Upgrade to {plan.charAt(0).toUpperCase() + plan.slice(1)}
      </button>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-8 bg-gray-800 rounded w-48" />
      <div className="h-40 bg-gray-900 rounded-xl border border-gray-800" />
    </div>
  );
}
