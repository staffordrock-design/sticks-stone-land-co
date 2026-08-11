import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Scale } from "lucide-react";

export default function TermsOfUse() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto max-w-4xl px-6 py-4">
          <Link to="/" className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Back to Sticks & Stone</Link>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-6 py-12">
        <div className="mb-8 flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-stone-900 text-white"><Scale className="h-5 w-5" /></div><div><p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Legal</p><h1 className="font-heading text-3xl font-bold">Terms of Use</h1></div></div>
        <div className="space-y-7 text-sm leading-7 text-muted-foreground">
          <p><strong className="text-foreground">Effective date: August 11, 2026.</strong> By using Sticks & Stone Land Co., you agree to these Terms of Use.</p>
          <section><h2 className="font-heading text-xl font-bold text-foreground">Purpose of the service</h2><p className="mt-2">Sticks & Stone provides quarry, mineral, industrial-land, GIS, marketplace, and due-diligence screening tools. The service may combine public, licensed, user-submitted, and derived data to help users research sites and opportunities.</p></section>
          <section><h2 className="font-heading text-xl font-bold text-foreground">Screening information, not professional conclusions</h2><p className="mt-2">Maps, quarry-potential indicators, rock or geology identifications, parcel matches, environmental records, production/employment information, market indicators, and other intelligence are for preliminary screening only. They are not a reserve estimate, appraisal, survey, title opinion, legal opinion, engineering report, environmental determination, permit determination, laboratory result, or guarantee of economically recoverable material.</p></section>
          <section><h2 className="font-heading text-xl font-bold text-foreground">Source accuracy</h2><p className="mt-2">Public and third-party datasets can be incomplete, delayed, generalized, or wrong. Users are responsible for independently verifying ownership, boundaries, acreage, geology, permits, production, access, zoning, environmental conditions, title, and other material facts before making a transaction or investment decision.</p></section>
          <section><h2 className="font-heading text-xl font-bold text-foreground">Listings and transactions</h2><p className="mt-2">Unless expressly stated otherwise, Sticks & Stone is a platform for research and marketplace activity and does not guarantee that a property is available, financeable, permitted, mineable, or suitable for a particular use. Buyers, sellers, brokers, operators, and other users remain responsible for their own diligence and agreements.</p></section>
          <section><h2 className="font-heading text-xl font-bold text-foreground">S&amp;S Quarry Intelligence Reports</h2><p className="mt-2">S&amp;S Quarry Intelligence Reports assemble source-labeled public, licensed, and platform data for screening and business-intelligence purposes. They are not certified reserve estimates, engineering or geological opinions, title opinions, appraisals, environmental assessments, or guarantees of commercially recoverable material.</p></section>
          <section><h2 className="font-heading text-xl font-bold text-foreground">Seller Confidential Data Rooms and NDAs</h2><p className="mt-2">Seller Confidential Data Rooms are separate from S&amp;S Quarry Intelligence Reports and contain only documents supplied by a seller, owner, operator, or their professionals when available. Some materials require a signed NDA and paid access. Confidential documents may not be copied, distributed, published, reverse engineered, or used outside the permitted due-diligence purpose. Access is tied to the authorized user account and may be revoked for misuse.</p></section>
          <section><h2 className="font-heading text-xl font-bold text-foreground">Payments</h2><p className="mt-2">Website payments for eligible services or confidential data-room access may be processed by Stripe. The native mobile app does not launch Stripe checkout for digital access. Any refund, cancellation, or access terms shown at the time of purchase also apply.</p></section>
          <section><h2 className="font-heading text-xl font-bold text-foreground">Acceptable use</h2><p className="mt-2">You may not attempt to bypass access controls, scrape or redistribute restricted data in violation of source terms, impersonate another user, misuse owner/contact information, upload unlawful content, interfere with the service, or use the platform for fraud or other unlawful conduct.</p></section>
          <section><h2 className="font-heading text-xl font-bold text-foreground">Accounts</h2><p className="mt-2">You are responsible for maintaining the confidentiality of your account and for activity under it. You may request account deletion through the Account Deletion page. Certain transaction, NDA, security, or legal records may be retained where reasonably necessary.</p></section>
          <section><h2 className="font-heading text-xl font-bold text-foreground">No warranty</h2><p className="mt-2">The service is provided on an “as available” basis to the extent permitted by law. We do not warrant that every dataset, map, listing, or derived result will be complete, current, error-free, or suitable for a particular transaction.</p></section>
          <section><h2 className="font-heading text-xl font-bold text-foreground">Changes</h2><p className="mt-2">We may update these terms as the product changes. Continued use after updated terms are posted constitutes acceptance of the revised terms to the extent permitted by law.</p></section>
        </div>
      </main>
    </div>
  );
}
