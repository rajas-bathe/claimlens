import type { Metadata } from 'next';
import './globals.css';
import './impact.css';
import { NavigationFeedback } from '@/components/layout/NavigationFeedback';

export const metadata: Metadata = {
  title: {
    default: 'ClaimLens',
    template: '%s | ClaimLens',
  },
  description: 'Intelligent expense review, policy evaluation, and reimbursement for finance teams.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full"><NavigationFeedback />{children}</body>
    </html>
  );
}
