import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Building2, CheckCircle2, Loader2, LogOut, Save, ShieldCheck, UserRound } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";

const ACCOUNT_TYPES = [
  "Buyer",
  "Seller",
  "Quarry Operator",
  "Landowner",
  "Investor",
  "Real Estate Professional",
  "Industry Professional",
  "Other",
];

function customerAccountType(type, company) {
  if (type === "Seller") return "Seller";
  if (["Quarry Operator", "Real Estate Professional", "Industry Professional"].includes(type)) return company ? "Business" : "Professional";
  return "Individual";
}

function cleanReturnTo(value) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/profile")) return "/";
  return value;
}

export default function Profile() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const returnTo = useMemo(() => cleanReturnTo(params.get("returnTo")), [params]);
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    full_name: "",
    company: "",
    role_title: "",
    account_type: "Buyer",
    phone: "",
    home_state: "",
    states_of_interest: "",
    commodities_of_interest: "",
    headline: "",
    bio: "",
    website: "",
    skills: "",
    industry_years: "",
    open_to_opportunities: true,
    profile_visibility: "Network",
    terms_accepted: false,
  });

  useEffect(() => {
    let cancelled = false;
    if (!user?.id) {
      setLoading(false);
      return () => { cancelled = true; };
    }

    (async () => {
      try {
        const rows = await base44.entities.UserProfile.filter({ user_id: user.id }, "-updated_date", 1);
        const existing = rows?.[0] || null;
        if (cancelled) return;
        setRecord(existing);
        setForm((current) => ({
          ...current,
          full_name: existing?.full_name || user?.name || "",
          company: existing?.company || "",
          role_title: existing?.role_title || "",
          account_type: existing?.account_type || "Buyer",
          phone: existing?.phone || "",
          home_state: existing?.home_state || "",
          states_of_interest: existing?.states_of_interest || "",
          commodities_of_interest: existing?.commodities_of_interest || "",
          headline: existing?.headline || "",
          bio: existing?.bio || "",
          website: existing?.website || "",
          skills: existing?.skills || "",
          industry_years: existing?.industry_years ?? "",
          open_to_opportunities: existing?.open_to_opportunities !== false,
          profile_visibility: existing?.profile_visibility || "Network",
          terms_accepted: Boolean(existing?.terms_accepted),
        }));
      } catch (profileError) {
        console.error("Profile load failed", profileError);
        if (!cancelled) setError("We could not load your profile. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [user?.id, user?.name]);

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const save = async (event) => {
    event.preventDefault();
    if (!user?.id) return;
    setError("");
    setSaved(false);

    if (!form.full_name.trim()) {
      setError("Please enter your name.");
      return;
    }
    if (!form.terms_accepted) {
      setError("Please accept the Terms of Use and Privacy Policy to continue.");
      return;
    }

    setSaving(true);
    try {
      const now = new Date().toISOString();
      const payload = {
        user_id: user.id,
        email: user.email || "",
        full_name: form.full_name.trim(),
        company: form.company.trim(),
        role_title: form.role_title.trim(),
        account_type: form.account_type,
        phone: form.phone.trim(),
        home_state: form.home_state.trim().toUpperCase(),
        states_of_interest: form.states_of_interest.trim(),
        commodities_of_interest: form.commodities_of_interest.trim(),
        headline: form.headline.trim(),
        bio: form.bio.trim(),
        website: form.website.trim(),
        skills: form.skills.trim(),
        industry_years: form.industry_years === "" ? null : Number(form.industry_years),
        open_to_opportunities: Boolean(form.open_to_opportunities),
        profile_visibility: form.profile_visibility,
        profile_complete: true,
        terms_accepted: true,
        created_at: record?.created_at || now,
        updated_at: now,
      };

      const updated = record
        ? await base44.entities.UserProfile.update(record.id, payload)
        : await base44.entities.UserProfile.create(payload);
      setRecord(updated);

      const accountRows = await base44.entities.CustomerAccount.filter({ user_id: user.id }, "-updated_date", 1);
      const accountPayload = {
        user_id: user.id,
        email: user.email || "",
        company: payload.company,
        account_type: customerAccountType(payload.account_type, payload.company),
        active: true,
      };
      if (accountRows?.[0]) await base44.entities.CustomerAccount.update(accountRows[0].id, accountPayload);
      else await base44.entities.CustomerAccount.create(accountPayload);

      const onboardingRows = await base44.entities.CustomerOnboarding.filter({ user_id: user.id }, "-updated_date", 1);
      const onboardingPayload = {
        user_id: user.id,
        account_type: payload.account_type,
        profile_complete: true,
        terms_accepted: true,
        completed_at: now,
      };
      if (onboardingRows?.[0]) await base44.entities.CustomerOnboarding.update(onboardingRows[0].id, onboardingPayload);
      else await base44.entities.CustomerOnboarding.create(onboardingPayload);

      setSaved(true);
      window.setTimeout(() => navigate(returnTo, { replace: true }), 350);
    } catch (saveError) {
      console.error("Profile save failed", saveError);
      setError(saveError?.message || "Your profile could not be saved. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-background"><Loader2 className="h-7 w-7 animate-spin text-slate-700" /></div>;
  }

  return (
    <div className="min-h-screen bg-background pb-28">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-white"><UserRound className="h-5 w-5" /></div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">S&amp;S Quarry Intelligence</p>
              <h1 className="font-heading text-xl font-bold">Your Profile</h1>
            </div>
          </div>
          {record?.profile_complete && <Link to="/" className="text-sm font-semibold text-sky-800">Done</Link>}
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-7">
        {!record?.profile_complete && (
          <div className="mb-6 rounded-2xl border border-sky-200 bg-sky-50 p-5 text-sky-950">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
              <div><div className="font-bold">Complete your account to continue</div><p className="mt-1 text-sm leading-6">Your quarry searches, subscriptions, saved opportunities and reports will be tied to this profile.</p></div>
            </div>
          </div>
        )}

        <div className="mb-5 rounded-2xl border border-border bg-card p-5">
          <div className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Signed in as</div>
          <div className="mt-1 font-semibold">{user?.email}</div>
        </div>

        <form onSubmit={save} className="space-y-5 rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-7">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name *"><input className="input" autoComplete="name" value={form.full_name} onChange={(e) => set("full_name", e.target.value)} required /></Field>
            <Field label="Account type *">
              <select className="input" value={form.account_type} onChange={(e) => set("account_type", e.target.value)}>
                {ACCOUNT_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
            </Field>
            <Field label="Company / organization"><div className="relative"><Building2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input className="input pl-9" autoComplete="organization" value={form.company} onChange={(e) => set("company", e.target.value)} /></div></Field>
            <Field label="Role / title"><input className="input" value={form.role_title} onChange={(e) => set("role_title", e.target.value)} /></Field>
            <Field label="Phone"><input className="input" inputMode="tel" autoComplete="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
            <Field label="Home state"><input className="input" maxLength={2} placeholder="TN" value={form.home_state} onChange={(e) => set("home_state", e.target.value)} /></Field>
          </div>

          <div className="rounded-2xl border border-sky-200 bg-sky-50/70 p-4 text-sky-950">
            <div className="text-xs font-bold uppercase tracking-[0.16em] text-sky-700">Quarry Network Profile</div>
            <p className="mt-1 text-sm leading-6">This is how other quarry, aggregate and mineral-industry members will know who you are.</p>
          </div>
          <Field label="Professional headline"><input className="input" placeholder="Quarry operator · Limestone · Southeast" value={form.headline} onChange={(e) => set("headline", e.target.value)} /></Field>
          <Field label="About you"><textarea className="input min-h-24" placeholder="Your experience, projects, quarry interests and what you do in the industry…" value={form.bio} onChange={(e) => set("bio", e.target.value)} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Website"><input className="input" inputMode="url" placeholder="https://…" value={form.website} onChange={(e) => set("website", e.target.value)} /></Field>
            <Field label="Years in industry"><input className="input" inputMode="numeric" value={form.industry_years} onChange={(e) => set("industry_years", e.target.value)} /></Field>
          </div>
          <Field label="Skills / specialties"><input className="input" placeholder="Operations, geology, permitting, aggregates, acquisitions…" value={form.skills} onChange={(e) => set("skills", e.target.value)} /></Field>
          <Field label="States of interest"><input className="input" placeholder="TN, GA, AL, KY…" value={form.states_of_interest} onChange={(e) => set("states_of_interest", e.target.value)} /></Field>
          <Field label="Rock / commodity interests"><input className="input" placeholder="Limestone, granite, sand & gravel…" value={form.commodities_of_interest} onChange={(e) => set("commodities_of_interest", e.target.value)} /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex items-center gap-3 rounded-2xl border border-border p-4 text-sm font-semibold"><input type="checkbox" className="h-4 w-4" checked={form.open_to_opportunities} onChange={(e) => set("open_to_opportunities", e.target.checked)} />Open to industry opportunities</label>
            <Field label="Network visibility"><select className="input" value={form.profile_visibility} onChange={(e) => set("profile_visibility", e.target.value)}><option value="Network">Visible to S&amp;S Network</option><option value="Private">Private</option></select></Field>
          </div>

          <label className="flex items-start gap-3 rounded-2xl border border-border bg-muted/20 p-4 text-sm leading-6">
            <input type="checkbox" className="mt-1 h-4 w-4" checked={form.terms_accepted} onChange={(e) => set("terms_accepted", e.target.checked)} />
            <span>I agree to the <Link className="font-semibold text-sky-800 underline" to="/terms">Terms of Use</Link> and <Link className="font-semibold text-sky-800 underline" to="/privacy">Privacy Policy</Link>.</span>
          </label>

          {error && <div className="rounded-xl bg-destructive/10 p-3 text-sm font-medium text-destructive">{error}</div>}
          {saved && <div className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800"><CheckCircle2 className="h-4 w-4" />Profile saved</div>}

          <button type="submit" disabled={saving} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-3 font-bold text-white disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? "Saving profile…" : record?.profile_complete ? "Save Profile" : "Save & Continue"}
          </button>
        </form>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Link to="/support" className="rounded-2xl border border-border bg-card p-4 text-sm font-semibold">Support</Link>
          <Link to="/account/delete" className="rounded-2xl border border-border bg-card p-4 text-sm font-semibold">Delete account</Link>
        </div>

        <button type="button" onClick={() => logout(true)} className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground"><LogOut className="h-4 w-4" />Sign out</button>
      </main>
    </div>
  );
}

function Field({ label, children }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</span>{children}</label>;
}
