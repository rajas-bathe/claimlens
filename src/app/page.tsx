import Link from 'next/link';
import { ArrowRight, CheckCircle2, Shield, Zap } from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <header className="border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded bg-blue-600 flex items-center justify-center">
              <span className="text-white font-bold text-xs">CL</span>
            </div>
            <span className="font-semibold text-gray-900">ClaimLens</span>
          </div>
          <Link
            href="/login"
            className="text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors focus-ring rounded"
          >
            Sign in
          </Link>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1">
        <section className="max-w-5xl mx-auto px-6 py-20">
          <div className="max-w-2xl">
            <h1 className="text-4xl font-bold text-gray-900 leading-tight">
              Expense review that
              <br />
              <span className="text-blue-600">respects your time.</span>
            </h1>
            <p className="mt-5 text-lg text-gray-600 leading-relaxed">
              ClaimLens extracts receipt data, evaluates claims against your company
              policy, and routes only genuine exceptions to your finance team —
              so routine reimbursements happen without manual work.
            </p>
            <div className="mt-8 flex items-center gap-4">
              <Link
                href="/login"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors focus-ring"
              >
                Sign in to your workspace
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="border-t border-gray-100 bg-gray-50">
          <div className="max-w-5xl mx-auto px-6 py-16">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="space-y-3">
                <div className="w-9 h-9 rounded-md bg-blue-50 flex items-center justify-center">
                  <Zap className="w-5 h-5 text-blue-600" />
                </div>
                <h3 className="font-semibold text-gray-900">Automated extraction</h3>
                <p className="text-sm text-gray-600 leading-relaxed">
                  Upload a receipt image or PDF. ClaimLens reads the merchant,
                  date, amounts, and line items — including handwritten or
                  damaged receipts — and flags anything it cannot determine.
                </p>
              </div>
              <div className="space-y-3">
                <div className="w-9 h-9 rounded-md bg-blue-50 flex items-center justify-center">
                  <Shield className="w-5 h-5 text-blue-600" />
                </div>
                <h3 className="font-semibold text-gray-900">Policy evaluation</h3>
                <p className="text-sm text-gray-600 leading-relaxed">
                  Every claim is checked against your company policy — caps,
                  categories, city rules, client requirements, and accumulation
                  limits — before it reaches a reviewer.
                </p>
              </div>
              <div className="space-y-3">
                <div className="w-9 h-9 rounded-md bg-blue-50 flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5 text-blue-600" />
                </div>
                <h3 className="font-semibold text-gray-900">Clear decisions</h3>
                <p className="text-sm text-gray-600 leading-relaxed">
                  Finance teams see exactly which rule each claim passed or
                  failed, with the evidence cited. Approve clean claims in bulk;
                  address exceptions individually.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-100">
        <div className="max-w-5xl mx-auto px-6 h-12 flex items-center">
          <p className="text-xs text-gray-400">
            ClaimLens — Expense Review Workspace
          </p>
        </div>
      </footer>
    </div>
  );
}
