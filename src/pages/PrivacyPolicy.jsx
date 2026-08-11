import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ShieldCheck } from "lucide-react";

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto max-w-4xl px-6 py-4">
          <Link to="/" className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Back to Sticks & Stone</Link>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-6 py-12">
        <div className="mb-8 flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-stone-900 text-white"><ShieldCheck className="h-5 w-5" /></div><div><p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Legal</p><h1 className="font-heading text-3xl font-bold">Privacy Policy</h1></div></div>
        <div className="space-y-7 text-sm leading-7 text-muted-foreground">
          <p><strong className="text-foreground">Effective date: August 11, 2026.</strong> Sticks & Stone Land Co. provides quarry, mineral, industrial-land, GIS, marketplace, and due-diligence tools. This policy explains the information collected when you use our website or app and how it is used.</p>
          <section><h2 className="font-heading text-xl font-bold text-foreground">Information we collect</h2><p className="mt-2">We may collect account information such as your name, email address, user ID, company, role, and authentication information; marketplace or NDA information you submit; and activity information such as pages and listings viewed, mine or property profiles viewed, timestamps, session identifiers, referrer information, and device/browser user-agent information. We may also receive payment confirmation and customer details from Stripe for website purchases. We do not store full payment-card numbers.</p></section>
          <section><h2 className="font-heading text-xl font-bold text-foreground">How we use information</h2><p className="mt-2">We use information to operate accounts, provide and secure marketplace and data-room access, improve search and GIS features, understand product usage, respond to requests, maintain audit and transaction records, prevent misuse, and comply with legal obligations.</p></section>
          <section><h2 className="font-heading text-xl font-bold text-foreground">Public-source property and mining data</h2><p className="mt-2">The service may display information obtained from public or licensed sources, including mine, permit, environmental, parcel, tax, geology, ownership, and regulatory datasets. Those records may describe properties or businesses rather than app users. Source attribution and limitations are shown where available.</p></section>
          <section><h2 className="font-heading text-xl font-bold text-foreground">Service providers</h2><p className="mt-2">We use service providers to host and operate the product and process website payments. These may include Base44 for application infrastructure and Stripe for website checkout/payment processing. We may also use mapping, GIS, public-data, or infrastructure providers necessary to deliver the service.</p></section>
          <section><h2 className="font-heading text-xl font-bold text-foreground">Viewer analytics</h2><p className="mt-2">For signed-in users, the service may associate viewing activity with the user account so Sticks & Stone can understand which mine, quarry, listing, or data page was viewed and when. Anonymous sessions may be recorded without claiming to know the visitor's real identity.</p></section>
          <section><h2 className="font-heading text-xl font-bold text-foreground">Payments</h2><p className="mt-2">Stripe checkout for confidential data-room access is offered on the website. The native mobile app does not launch that external checkout. If website access is purchased, the resulting entitlement may be recognized by the app when you sign in with the same account.</p></section>
          <section><h2 className="font-heading text-xl font-bold text-foreground">Retention and security</h2><p className="mt-2">We retain information for as long as reasonably necessary to provide the service, preserve transaction and NDA records, meet legal obligations, resolve disputes, and protect the service. We use access controls and other reasonable safeguards, but no online system can guarantee absolute security.</p></section>
          <section><h2 className="font-heading text-xl font-bold text-foreground">Your choices</h2><p className="mt-2">You may request deletion of your Sticks & Stone account from the in-app Account Deletion page. Some records may be retained when required for legal, fraud-prevention, financial, NDA, or transaction-record purposes. You may also stop using the service at any time.</p></section>
          <section><h2 className="font-heading text-xl font-bold text-foreground">Children</h2><p className="mt-2">This service is intended for business, real-estate, mining, land, and investment users and is not directed to children under 13.</p></section>
          <section><h2 className="font-heading text-xl font-bold text-foreground">Changes</h2><p className="mt-2">We may update this policy as the product changes. The effective date above will be revised when material changes are published.</p></section>
        </div>
      </main>
    </div>
  );
}
