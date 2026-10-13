import Link from 'next/link';

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] text-center gap-8">
      <div>
        <h1 className="text-5xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent mb-4">
          PitchFire
        </h1>
        <p className="text-gray-400 text-xl max-w-xl">
          Autonomous job search orchestrator. Upload your resume, get matched jobs,
          apply automatically, and track your entire pipeline.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4 text-sm w-full max-w-2xl">
        {[
          { label: 'Job Boards', value: '10+', desc: 'Scraped daily' },
          { label: 'Match Score', value: '>72%', desc: 'Only strong fits' },
          { label: 'Auto-Apply', value: '∞', desc: 'Pro plan' },
        ].map((stat) => (
          <div key={stat.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="text-2xl font-bold text-blue-400">{stat.value}</div>
            <div className="text-gray-300 font-medium">{stat.label}</div>
            <div className="text-gray-500 text-xs">{stat.desc}</div>
          </div>
        ))}
      </div>

      <div className="flex gap-4">
        <Link
          href="/dashboard"
          className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-lg font-medium transition-colors"
        >
          Get Started
        </Link>
        <Link
          href="/jobs"
          className="border border-gray-700 hover:border-gray-500 text-gray-300 px-6 py-3 rounded-lg font-medium transition-colors"
        >
          Browse Matches
        </Link>
      </div>
    </div>
  );
}
