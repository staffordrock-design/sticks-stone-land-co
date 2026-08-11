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
import PrivacyPolicy from './pages/PrivacyPolicy';
import TermsOfUse from './pages/TermsOfUse';
import AccountDeletion from './pages/AccountDeletion';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();
  const publicLegalPath = ['/privacy', '/terms'].includes(window.location.pathname);

  // Show loading spinner while checking app public settings or auth
  if ((isLoadingPublicSettings || isLoadingAuth) && !publicLegalPath) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered' && !publicLegalPath) {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required' && !publicLegalPath) {
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
      <Route path="/privacy" element={<PrivacyPolicy />} />
      <Route path="/terms" element={<TermsOfUse />} />
      <Route path="/account/delete" element={<AccountDeletion />} />
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