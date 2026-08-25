import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ShieldCheck } from "lucide-react";

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto max-w-4xl px-6 py-4">
          <Link to="/" className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Back to S&S Rock Holdings</Link>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-6 py-12">
        <div className="mb-8 flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-stone-900 text-white"><ShieldCheck className="h-5 w-5" /></div><div><p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Legal</p><h1 className="font-heading text-3xl font-bold">Privacy Policy</h1></div></div>
        <div className="space-y-7 text-sm leading-7 text-muted-foreground">
          <p><strong className="text-foreground">Last updated: August 25, 2026.</strong> This Privacy Policy explains how Sticks &amp; Stone Land Co. ("we," "us," "our") collects, uses, and protects information when you use our mobile application and related services (the "Service").</p>

          <section>
            <h2 className="font-heading text-xl font-bold text-foreground">1. Information We Collect</h2>
            <div className="mt-3 space-y-3">
              <div><strong className="text-foreground">Account Information</strong><p className="mt-1">When you create an account, we collect your name, email address, company/organization name, and role (e.g., buyer, seller, broker).</p></div>
              <div><strong className="text-foreground">Transaction &amp; Subscription Information</strong><p className="mt-1">We collect subscription plan details, billing status, and payment confirmation data. Payment card details are processed by Apple (via In-App Purchase) or our payment processor — we do not store your full payment card number.</p></div>
              <div><strong className="text-foreground">Deal &amp; Listing Data</strong><p className="mt-1">Information you submit related to land parcels, listings, offers, deal documents, and communications with other users through the platform.</p></div>
              <div><strong className="text-foreground">Property &amp; Public Records Data</strong><p className="mt-1">Parcel ownership, permit, environmental, and mining safety records we display are sourced from public and licensed third-party data providers (including government sources such as USGS and MSHA). This is not personal information about you, but may relate to landowners or businesses referenced in listings.</p></div>
              <div><strong className="text-foreground">Usage Data</strong><p className="mt-1">Device type, app version, log data, and how you interact with the app, collected automatically for analytics and troubleshooting.</p></div>
              <div><strong className="text-foreground">Documents You Upload</strong><p className="mt-1">Files you upload to data rooms, NDAs, or deal documentation, which may be shared with other users you authorize (e.g., a counterparty in a deal).</p></div>
            </div>
          </section>

          <section>
            <h2 className="font-heading text-xl font-bold text-foreground">2. How We Use Information</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>To provide, operate, and maintain the Service</li>
              <li>To process subscriptions and payments</li>
              <li>To facilitate deals, communications, and document sharing between buyers and sellers</li>
              <li>To generate valuation reports and data-backed insights</li>
              <li>To send transactional notifications (billing, deal updates, account activity)</li>
              <li>To improve the Service and troubleshoot issues</li>
              <li>To comply with legal obligations</li>
            </ul>
          </section>

          <section>
            <h2 className="font-heading text-xl font-bold text-foreground">3. How We Share Information</h2>
            <p className="mt-2">We do not sell your personal information. We may share information:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li><strong className="text-foreground">With other users</strong> you choose to interact with (e.g., a seller you submit an offer to)</li>
              <li><strong className="text-foreground">With service providers</strong> who help us operate the Service (hosting, payment processing, analytics)</li>
              <li><strong className="text-foreground">With Apple</strong> for subscription and payment processing via In-App Purchase</li>
              <li><strong className="text-foreground">For legal reasons</strong>, if required by law, subpoena, or to protect our rights</li>
            </ul>
          </section>

          <section>
            <h2 className="font-heading text-xl font-bold text-foreground">4. Data Retention</h2>
            <p className="mt-2">We retain account and deal data for as long as your account is active or as needed to provide the Service, comply with legal obligations, resolve disputes, and enforce agreements.</p>
          </section>

          <section>
            <h2 className="font-heading text-xl font-bold text-foreground">5. Your Choices</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>You can access and update your account information within the app</li>
              <li>You can request deletion of your account and associated data by contacting us (see below), subject to legal retention requirements</li>
              <li>You can manage subscription and notification preferences within the app or your Apple ID account settings</li>
            </ul>
          </section>

          <section>
            <h2 className="font-heading text-xl font-bold text-foreground">6. Data Security</h2>
            <p className="mt-2">We use commercially reasonable technical and organizational measures to protect your information. No system is completely secure, and we cannot guarantee absolute security.</p>
          </section>

          <section>
            <h2 className="font-heading text-xl font-bold text-foreground">7. Children's Privacy</h2>
            <p className="mt-2">The Service is not directed to individuals under 18. We do not knowingly collect information from children.</p>
          </section>

          <section>
            <h2 className="font-heading text-xl font-bold text-foreground">8. Third-Party Data Sources</h2>
            <p className="mt-2">Some data displayed in the app (e.g., parcel records, environmental permits, USGS mineral data, MSHA inspection records) originates from public government databases or licensed third parties. We are not responsible for the accuracy of third-party source data, though we make reasonable efforts to keep it current.</p>
          </section>

          <section>
            <h2 className="font-heading text-xl font-bold text-foreground">9. Changes to This Policy</h2>
            <p className="mt-2">We may update this Privacy Policy from time to time. We will post the updated version with a new "Last updated" date.</p>
          </section>

          <section>
            <h2 className="font-heading text-xl font-bold text-foreground">10. Contact Us</h2>
            <p className="mt-2">If you have questions about this Privacy Policy or wish to exercise your data rights, contact us at:</p>
            <div className="mt-2 space-y-0.5">
              <p><strong className="text-foreground">Email:</strong> contact@ssholdings.com</p>
              <p><strong className="text-foreground">Company:</strong> S&amp;S Rock Holdings, LLC.</p>
              <p><strong className="text-foreground">Address:</strong> 196 Riverside Drive, Benton, TN 37307</p>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}