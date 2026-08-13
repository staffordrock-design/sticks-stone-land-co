import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
import ActivityTracker from './components/ActivityTracker';
// Add page imports here
import Home from './pages/Home';
import ListingDetail from './pages/ListingDetail';
import MineSiteDetail from './pages/MineSiteDetail';
import AdminActivity from './pages/AdminActivity';
import AdminDataSync from './pages/AdminDataSync';
import AdminReports from './pages/AdminReports';
import PrivacyPolicy from './pages/PrivacyPolicy';
import TermsOfUse from './pages/TermsOfUse';
import AccountDeletion from './pages/AccountDeletion';
import SellProperty from './pages/SellProperty';
import BuyerProfile from './pages/BuyerProfile';
import MyOpportunities from './pages/MyOpportunities';
import DealDesk from './pages/DealDesk';
import Subscription from './pages/Subscription';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import OAuthConsent from './pages/OAuthConsent';
import Support from './pages/Support';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();
  const publicPath = ['/privacy', '/terms', '/support', '/account/delete', '/login', '/register', '/forgot-password', '/reset-password', '/oauth/consent'].includes(window.location.pathname);

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
    <Routes>
      {/* Add your page Route elements here */}
      <Route path="/" element={<Home />} />
      <Route path="/listings/:id" element={<ListingDetail />} />
      <Route path="/mines/:id" element={<MineSiteDetail />} />
      <Route path="/admin/activity" element={<AdminActivity />} />
      <Route path="/admin/data-sync" element={<AdminDataSync />} />
      <Route path="/admin/reports" element={<AdminReports />} />
      <Route path="/privacy" element={<PrivacyPolicy />} />
      <Route path="/terms" element={<TermsOfUse />} />
      <Route path="/account/delete" element={<AccountDeletion />} />
      <Route path="/support" element={<Support />} />
      <Route path="/sell" element={<SellProperty />} />
      <Route path="/buyer-profile" element={<BuyerProfile />} />
      <Route path="/saved" element={<MyOpportunities />} />
      <Route path="/admin/deals" element={<DealDesk />} />
      <Route path="/subscribe" element={<Subscription />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/oauth/consent" element={<OAuthConsent />} />
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ScrollToTop />
          <ActivityTracker />
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App