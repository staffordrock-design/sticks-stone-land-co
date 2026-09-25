import { useEffect, lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import BottomNav from "./components/BottomNav";
import PageTransition from "./components/PageTransition";
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
import NativeBackHandler from './components/NativeBackHandler';
import ActivityTracker from './components/ActivityTracker';
import PaidAccessGate from './components/PaidAccessGate';
import AccountProfileGate from './components/AccountProfileGate';
import MembershipRequiredGate from './components/MembershipRequiredGate';
import { isNativeIOS } from '@/lib/appleSubscriptions';
// Add page imports here
const Home = lazy(() => import('./pages/Home'));
const QuarryMarketplace = lazy(() => import('./pages/QuarryMarketplace'));
const ListingDetail = lazy(() => import('./pages/ListingDetail'));
const MineSiteDetail = lazy(() => import('./pages/MineSiteDetail'));
const AdminActivity = lazy(() => import('./pages/AdminActivity'));
const AdminDataSync = lazy(() => import('./pages/AdminDataSync'));
const AdminReports = lazy(() => import('./pages/AdminReports'));
const AdminLeadInbox = lazy(() => import('./pages/AdminLeadInbox'));
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'));
const TermsOfUse = lazy(() => import('./pages/TermsOfUse'));
const AccountDeletion = lazy(() => import('./pages/AccountDeletion'));
const DealDesk = lazy(() => import('./pages/DealDesk'));
const Subscription = lazy(() => import('./pages/Subscription'));
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const OAuthConsent = lazy(() => import('./pages/OAuthConsent'));
const Support = lazy(() => import('./pages/Support'));
const MineralValueGuide = lazy(() => import('./pages/MineralValueGuide'));
const MineralIntelligence = lazy(() => import('./pages/MineralIntelligence'));
const AdminSellerReview = lazy(() => import('./pages/AdminSellerReview'));
const QuarryWatchlist = lazy(() => import('./pages/QuarryWatchlist'));
const DealInvestor = lazy(() => import('./pages/DealInvestor'));
const SellProperty = lazy(() => import('./pages/SellProperty'));
const SellerPortal = lazy(() => import('./pages/SellerPortal'));
const SellerDashboard = lazy(() => import('./pages/SellerDashboard'));
const BuyerProfile = lazy(() => import('./pages/BuyerProfile'));
const MyOpportunities = lazy(() => import('./pages/MyOpportunities'));
const Profile = lazy(() => import('./pages/Profile'));
const Network = lazy(() => import('./pages/Network'));
const NetworkIntel = lazy(() => import('./pages/NetworkIntel'));
const CompanyNetworkDetail = lazy(() => import('./pages/CompanyNetworkDetail'));
const NetworkWatchlist = lazy(() => import('./pages/NetworkWatchlist'));
const NetworkDeals = lazy(() => import('./pages/NetworkDeals'));
const NetworkPostDeal = lazy(() => import('./pages/NetworkPostDeal'));
const NetworkDealDetail = lazy(() => import('./pages/NetworkDealDetail'));
const NetworkDealActivity = lazy(() => import('./pages/NetworkDealActivity'));
const OwnershipIntelligence = lazy(() => import('./pages/OwnershipIntelligence'));
const Messages = lazy(() => import('./pages/Messages'));
const IntelligenceHub = lazy(() => import('./pages/IntelligenceHub'));
const LeadSetup = lazy(() => import('./pages/LeadSetup'));
const QuarryIntelligence = lazy(() => import('./pages/QuarryIntelligence'));
const ConversionDashboard = lazy(() => import('./pages/ConversionDashboard'));
const DataSources = lazy(() => import('./pages/DataSources'));

const PageLoader = () => (
  <div className="fixed inset-0 flex items-center justify-center">
    <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
  </div>
);

const RequireSignedIn = ({ children }) => {
  const { user, isLoadingAuth, isLoadingPublicSettings } = useAuth();
  const location = useLocation();

  if (isLoadingAuth || isLoadingPublicSettings) return <PageLoader />;
  if (!user?.id) {
    const returnTo = `${location.pathname}${location.search || ""}`;
    return <Navigate to={`/login?returnTo=${encodeURIComponent(returnTo)}`} replace />;
  }
  return children;
};

const RequireAdmin = ({ children }) => {
  const { user, isLoadingAuth, isLoadingPublicSettings } = useAuth();

  if (isLoadingAuth || isLoadingPublicSettings) return <PageLoader />;
  if (!user?.id || user.role !== "admin") return <Navigate to="/" replace />;
  return children;
};

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError } = useAuth();
  const { pathname } = useLocation();
  const publicPath = isNativeIOS() || ['/', '/subscribe', '/privacy', '/terms', '/support', '/data-sources', '/sell', '/get-started', '/account/delete', '/account-deletion', '/login', '/register', '/forgot-password', '/reset-password', '/oauth/consent'].includes(pathname);
  const hideBottomNav = ["/login", "/register", "/forgot-password", "/reset-password", "/oauth/consent"].includes(pathname);

  useEffect(() => {
    const pageSeo = {
      "/": {
        title: "S&S Rock Holdings — Rock & Quarry Intelligence From the Ground Up",
        description: "Rock & Quarry Intelligence. From the Ground Up. Search quarry properties, ownership, acreage, geology, permits, production, mineral potential, and market intelligence."
      },
      "/subscribe": {
        title: "$69 Full Quarry Intelligence | S&S Rock Holdings",
        description: "Unlock full S&S Rock Holdings quarry intelligence for $69/month, including ownership, parcel, geology, permits, production, valuation context, and opportunity intelligence."
      },
      "/privacy": {
        title: "Privacy Policy | S&S Rock Holdings",
        description: "Read the S&S Rock Holdings privacy policy for the quarry intelligence marketplace and mobile applications."
      },
      "/terms": {
        title: "Terms of Use | S&S Rock Holdings",
        description: "Read the terms governing use of S&S Rock Holdings quarry, mineral, ownership, geology, permit, production, and marketplace intelligence."
      },
      "/support": {
        title: "Support | S&S Rock Holdings",
        description: "Get help with S&S Rock Holdings quarry intelligence, subscriptions, accounts, marketplace features, and data access."
      },
      "/data-sources": {
        title: "Quarry Data Sources | S&S Rock Holdings",
        description: "See the public and industry data sources behind S&S Rock Holdings quarry intelligence, including mine, permit, geology, ownership, parcel, and production information."
      },
      "/sell": {
        title: "Sell or List a Quarry | S&S Rock Holdings",
        description: "Submit a quarry, aggregate property, mineral property, or industrial land opportunity to S&S Rock Holdings for confidential review."
      },
      "/search": {
        title: "Search Quarries & Mine Sites | S&S Rock Holdings",
        description: "Search quarry properties, mine sites, aggregate operations, mineral occurrences, rock types, counties, states, and mine IDs with S&S Rock Holdings."
      },
      "/quarry-intelligence": {
        title: "Quarry Intelligence | S&S Rock Holdings",
        description: "Explore quarry intelligence including ownership, acreage, parcels, geology, permits, production, valuation context, and mapped mine-site data."
      },
      "/intelligence": {
        title: "Industrial Quarry Intelligence | S&S Rock Holdings",
        description: "Use quarry, aggregate, mineral, ownership, permit, geology, production, and market intelligence to research industrial property opportunities."
      },
      "/mineral-intelligence": {
        title: "Mineral Intelligence | S&S Rock Holdings",
        description: "Explore mineral occurrences, geology, rock types, mine-site context, and public-source mineral intelligence from S&S Rock Holdings."
      },
      "/network": {
        title: "Quarry Industry Network | S&S Rock Holdings",
        description: "Connect with quarry, aggregate, hauling, supplier, buyer, seller, investor, and industry professionals through the S&S Rock Holdings network."
      }
    };

    const seo = pageSeo[pathname] || pageSeo["/"];
    const canonicalUrl = `https://ssrockholdings.com${pathname === "/" ? "/" : pathname}`;
    const nonIndexable = pathname.startsWith("/admin/") || ["/login", "/register", "/forgot-password", "/reset-password", "/oauth/consent", "/messages", "/profile", "/buyer-profile", "/seller-portal", "/seller-dashboard", "/opportunities"].includes(pathname);

    const setMeta = (selector, attribute, value) => {
      let tag = document.head.querySelector(selector);
      if (!tag) {
        tag = document.createElement("meta");
        const match = selector.match(/meta\[(name|property)="([^"]+)"\]/);
        if (match) tag.setAttribute(match[1], match[2]);
        document.head.appendChild(tag);
      }
      tag.setAttribute(attribute, value);
    };

    document.title = seo.title;
    setMeta('meta[name="description"]', "content", seo.description);
    setMeta('meta[name="robots"]', "content", nonIndexable ? "noindex, nofollow" : "index, follow");
    setMeta('meta[property="og:title"]', "content", seo.title);
    setMeta('meta[property="og:description"]', "content", seo.description);
    setMeta('meta[property="og:url"]', "content", canonicalUrl);
    setMeta('meta[name="twitter:title"]', "content", seo.title);
    setMeta('meta[name="twitter:description"]', "content", seo.description);

    let canonical = document.head.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.setAttribute("rel", "canonical");
      document.head.appendChild(canonical);
    }
    canonical.setAttribute("href", canonicalUrl);
  }, [pathname]);

  // Show loading spinner while checking app public settings or auth
  if ((isLoadingPublicSettings || isLoadingAuth) && !publicPath) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered' && !publicPath) {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required' && !publicPath) {
      // Do not globally force Login here. Paid guest web sessions and anonymous
      // App Store subscribers are allowed through their purchase gates, while
      // account-only routes enforce sign-in with RequireSignedIn/RequireAdmin.
    }
  }

  // Render the main app
  return (
    <>
    <div className={pathname === "/" ? "" : "app-secondary-safe"}>
    <MembershipRequiredGate>
    <AccountProfileGate>
    <Suspense fallback={<PageLoader />}>
    <Routes>
      {/* Add your page Route elements here */}
      <Route path="/" element={<Home />} />
      <Route path="/search" element={<QuarryMarketplace />} />
      <Route path="/quarry-intelligence" element={<QuarryIntelligence />} />
      <Route path="/listings/:id" element={<PageTransition><ListingDetail /></PageTransition>} />
      <Route path="/mines/:id" element={<PageTransition><MineSiteDetail /></PageTransition>} />
      <Route path="/admin/activity" element={<RequireAdmin><AdminActivity /></RequireAdmin>} />
      <Route path="/admin/data-sync" element={<RequireAdmin><AdminDataSync /></RequireAdmin>} />
      <Route path="/admin/reports" element={<RequireAdmin><AdminReports /></RequireAdmin>} />
      <Route path="/admin/leads" element={<RequireAdmin><AdminLeadInbox /></RequireAdmin>} />
      <Route path="/admin/conversions" element={<RequireAdmin><ConversionDashboard /></RequireAdmin>} />
      <Route path="/privacy" element={<PrivacyPolicy />} />
      <Route path="/terms" element={<TermsOfUse />} />
      <Route path="/account/delete" element={<AccountDeletion />} />
      <Route path="/account-deletion" element={<AccountDeletion />} />
      <Route path="/support" element={<Support />} />
      <Route path="/intelligence" element={<IntelligenceHub />} />
      <Route path="/get-started" element={<LeadSetup />} />
      <Route path="/mineral-value-guide" element={<PaidAccessGate><MineralValueGuide /></PaidAccessGate>} />
      <Route path="/mineral-intelligence" element={<MineralIntelligence />} />
      <Route path="/admin/seller-review" element={<RequireAdmin><AdminSellerReview /></RequireAdmin>} />
      <Route path="/admin/deals" element={<RequireAdmin><DealDesk /></RequireAdmin>} />
      <Route path="/watchlist" element={<QuarryWatchlist />} />
      <Route path="/deal-investor" element={<DealInvestor />} />
      <Route path="/sell" element={<SellProperty />} />
      <Route path="/seller-portal" element={<RequireSignedIn><SellerPortal /></RequireSignedIn>} />
      <Route path="/seller-dashboard" element={<RequireSignedIn><SellerDashboard /></RequireSignedIn>} />
      <Route path="/buyer-profile" element={<RequireSignedIn><BuyerProfile /></RequireSignedIn>} />
      <Route path="/profile" element={<RequireSignedIn><Profile /></RequireSignedIn>} />
      <Route path="/network" element={<Network />} />
      <Route path="/network/intelligence" element={<NetworkIntel />} />
      <Route path="/network/company/:companySlug" element={<CompanyNetworkDetail />} />
      <Route path="/network/watchlist" element={<NetworkWatchlist />} />
      <Route path="/network/deals" element={<NetworkDeals />} />
      <Route path="/network/deals/new" element={<NetworkPostDeal />} />
      <Route path="/network/deals/activity" element={<NetworkDealActivity />} />
      <Route path="/network/deals/:id" element={<NetworkDealDetail />} />
      <Route path="/network/community" element={<Network />} />
      <Route path="/ownership-intelligence" element={<OwnershipIntelligence />} />
      <Route path="/messages" element={<RequireSignedIn><Messages /></RequireSignedIn>} />
      <Route path="/opportunities" element={<RequireSignedIn><MyOpportunities /></RequireSignedIn>} />
      <Route path="/subscribe" element={<Subscription />} />
      <Route path="/data-sources" element={<DataSources />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/oauth/consent" element={<OAuthConsent />} />
      <Route path="*" element={<PageNotFound />} />
    </Routes>
    </Suspense>
    </AccountProfileGate>
    </MembershipRequiredGate>
    </div>
    {!hideBottomNav && <BottomNav />}
    </>
  );
};


function App() {
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = (e) => document.documentElement.classList.toggle("dark", e.matches);
    apply(mq);
    const handler = (e) => apply(e);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ScrollToTop />
          <ActivityTracker />
          <NativeBackHandler />
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App