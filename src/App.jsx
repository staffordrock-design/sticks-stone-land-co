import { useEffect, lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, useLocation } from 'react-router-dom';
import BottomNav from "./components/BottomNav";
import PageTransition from "./components/PageTransition";
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
import NativeBackHandler from './components/NativeBackHandler';
import ActivityTracker from './components/ActivityTracker';
import PaidAccessGate from './components/PaidAccessGate';
// Add page imports here
const Home = lazy(() => import('./pages/Home'));
const ListingDetail = lazy(() => import('./pages/ListingDetail'));
const MineSiteDetail = lazy(() => import('./pages/MineSiteDetail'));
const AdminActivity = lazy(() => import('./pages/AdminActivity'));
const AdminDataSync = lazy(() => import('./pages/AdminDataSync'));
const AdminReports = lazy(() => import('./pages/AdminReports'));
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
const AdminSellerReview = lazy(() => import('./pages/AdminSellerReview'));

const PageLoader = () => (
  <div className="fixed inset-0 flex items-center justify-center">
    <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
  </div>
);

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();
  const { pathname } = useLocation();
  const publicPath = ['/privacy', '/terms', '/support', '/account/delete', '/login', '/register', '/forgot-password', '/reset-password', '/oauth/consent'].includes(pathname);
  const hideBottomNav = ["/login", "/register", "/forgot-password", "/reset-password", "/oauth/consent"].includes(pathname);

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
      // Redirect protected app areas to login, while keeping legal pages public.
      navigateToLogin();
      return null;
    }
  }

  // Render the main app
  return (
    <>
    <div className={pathname === "/" ? "" : "app-secondary-safe"}>
    <Suspense fallback={<PageLoader />}>
    <Routes>
      {/* Add your page Route elements here */}
      <Route path="/" element={<PaidAccessGate><Home /></PaidAccessGate>} />
      <Route path="/listings/:id" element={<PageTransition><PaidAccessGate><ListingDetail /></PaidAccessGate></PageTransition>} />
      <Route path="/mines/:id" element={<PageTransition><PaidAccessGate><MineSiteDetail /></PaidAccessGate></PageTransition>} />
      <Route path="/admin/activity" element={<AdminActivity />} />
      <Route path="/admin/data-sync" element={<AdminDataSync />} />
      <Route path="/admin/reports" element={<AdminReports />} />
      <Route path="/privacy" element={<PrivacyPolicy />} />
      <Route path="/terms" element={<TermsOfUse />} />
      <Route path="/account/delete" element={<AccountDeletion />} />
      <Route path="/support" element={<Support />} />
      <Route path="/mineral-value-guide" element={<PaidAccessGate><MineralValueGuide /></PaidAccessGate>} />
      <Route path="/admin/seller-review" element={<AdminSellerReview />} />
      <Route path="/admin/deals" element={<DealDesk />} />
      <Route path="/subscribe" element={<Subscription />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/oauth/consent" element={<OAuthConsent />} />
      <Route path="*" element={<PageNotFound />} />
    </Routes>
    </Suspense>
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