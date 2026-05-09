import { useEffect, useState, useRef, useCallback } from 'react';
import { Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useAuth as useClerkAuth, useUser } from '@clerk/clerk-react';
import AppLayout from './components/AppLayout';
import { useSwipe } from './hooks/useSwipe';
import { PWAInstallBanner } from './hooks/usePWA';
import { AuthGuard } from './components/AuthGuard';
import { AdminGuard } from './components/AdminGuard';
import { LazyRoute } from './components/LazyRoute';
import OpportunityDetailFetcher from './components/OpportunityDetailFetcher';
import GoalRoadmapFetcher from './components/GoalRoadmapFetcher';
import PackageDetailFetcher from './components/PackageDetailFetcher';

// Core components - loaded immediately
import LandingPage from './components/LandingPageV3';
import AboutPage from './components/AboutPage';
import BlogPage from './components/BlogPage';
import AuthScreen from './components/AuthScreen';
import AuthCallback from './components/AuthCallback';
import Dashboard from './components/Dashboard';
import SplashScreen from './components/SplashScreen';
import NotFoundPage from './components/NotFoundPage';
import IntroductionPopup from './components/IntroductionPopup';
import MentorPage from './components/MentorPage';
import AllOpportunities from './components/AllOpportunities';
import CommunityMarketplace from './components/CommunityMarketplace';
import AchievementsScreen from './components/AchievementsScreen';
import SavedOpportunities from './components/SavedOpportunities';
import AppliedOpportunities from './components/AppliedOpportunities';
import DeadlinesScreen from './components/DeadlinesScreen';
import OpportunitiesPage from './components/OpportunitiesPage';
import Wallet from './components/Wallet';
import AddGoalScreen from './components/AddGoalScreen';
import { useDarkMode } from './hooks/useDarkMode';
import { Goal } from './hooks/useGoals';
import { isNewUser } from './lib/auth';
import { useAnalytics } from './hooks/useAnalytics';
import { initializeCapacitor, configureStatusBar, isNativePlatform } from './lib/capacitor';
import type { OnboardingProfileData, OnboardingState } from './types/onboarding';
import { fetchUserProfile, saveOnboardingProfile, extractOnboardingState } from './services/profile';
import { getCreditBalance } from './services/credits';

export type Screen = 'landing' | 'auth' | 'chat' | 'dashboard' | 'all-goals' | 'profile' | 'opportunity-detail' | 'all-opportunities' | 'roadmap' | 'opportunity-roadmap' | 'settings' | 'profile-edit' | 'notifications' | 'privacy' | 'help' | 'cv-management' | 'add-goal' | 'community-marketplace' | 'achievements' | 'package-detail' | 'personalization' | 'saved' | 'applied' | 'deadlines' | 'wallet' | 'about' | 'blog';

import type { DashboardRef } from './components/Dashboard';

export function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isLoaded, isSignedIn } = useClerkAuth();
  const { user: clerkUser } = useUser();
  const [showIntroPopup, setShowIntroPopup] = useState(false);
  const [showSplash, setShowSplash] = useState(false);
  const [onboardingState, setOnboardingState] = useState<OnboardingState | null>(null);
  const [manualOnboardingTrigger, setManualOnboardingTrigger] = useState(false);
  const [userCredits, setUserCredits] = useState(0);
  const dashboardRef = useRef<DashboardRef>(null);
  const { isDarkMode } = useDarkMode();
  const { recordOpportunityExplored } = useAnalytics();

  // Derive AppUser from Clerk user
  const user = clerkUser ? {
    id: clerkUser.id,
    name: clerkUser.fullName || clerkUser.username || (clerkUser.primaryEmailAddress?.emailAddress ? clerkUser.primaryEmailAddress.emailAddress.split('@')[0] : 'New Edutu member'),
    email: clerkUser.primaryEmailAddress?.emailAddress,
    age: typeof clerkUser.unsafeMetadata?.age === 'number' ? clerkUser.unsafeMetadata.age : undefined,
  } : null;

  const setUser = (_updater: any) => {
    // Clerk manages user state, this is a no-op for compatibility
  };

  const signOut = async () => {
    await window.Clerk?.signOut();
  };

  // Initialize Capacitor for Android/iOS
  useEffect(() => {
    const handleBackButton = (): boolean => {
      if (showIntroPopup) {
        setShowIntroPopup(false);
        return true;
      }
      if (showSplash) {
        setShowSplash(false);
        return true;
      }
      return false;
    };

    initializeCapacitor({
      onBackButton: handleBackButton,
      onDeepLink: async () => {},
      isDarkMode
    });
  }, [showIntroPopup, showSplash, isDarkMode]);

  // Update status bar when dark mode changes
  useEffect(() => {
    if (isNativePlatform) {
      configureStatusBar(isDarkMode);
    }
  }, [isDarkMode]);

  // Handle Clerk auth state changes
  useEffect(() => {
    if (!isLoaded) return;

    if (isSignedIn && clerkUser) {
      const urlParams = new URLSearchParams(window.location.search);
      const isSignup = urlParams.get('signup') === 'true';

      if (isSignup && location.pathname === '/app/home') {
        setTimeout(async () => {
          try {
            const profileData = await fetchUserProfile(clerkUser.id);
            const isActuallyNew = isNewUser(profileData, {
              id: clerkUser.id,
              created_at: clerkUser.createdAt?.toISOString() || new Date().toISOString(),
              email: clerkUser.primaryEmailAddress?.emailAddress,
              user_metadata: clerkUser.unsafeMetadata,
            } as any);
            if (isActuallyNew && (!profileData?.preferences?.onboarding?.completed)) {
              setShowIntroPopup(true);
            }
          } catch {
            setShowIntroPopup(true);
          }
        }, 500);
      }
    }
  }, [isLoaded, isSignedIn, clerkUser, location.pathname]);

  // Restore session on mount - Clerk handles this automatically
  useEffect(() => {
    setManualOnboardingTrigger(false);
    setOnboardingState(null);
  }, [user?.id]);

  useEffect(() => {
    if (!clerkUser?.id) {
      setShowIntroPopup(false);
      setOnboardingState(null);
      return;
    }

    let isActive = true;

    const evaluateOnboarding = async () => {
      try {
        const profile = await fetchUserProfile(clerkUser.id);

        if (!isActive) return;

        const onboarding = extractOnboardingState(profile);
        setOnboardingState((previous) => {
          if (!onboarding && !previous) return previous;
          if (onboarding && previous) {
            const sameCompletion = previous.completed === onboarding.completed;
            const sameData = JSON.stringify(previous.data) === JSON.stringify(onboarding.data);
            if (sameCompletion && sameData) return previous;
          }
          return onboarding ?? null;
        });

        if (manualOnboardingTrigger) {
          setShowIntroPopup(true);
        }
      } catch (error) {
        console.error('Failed to load onboarding status', error);
        if (isActive) setOnboardingState(null);
      }
    };

    void evaluateOnboarding();

    return () => {
      isActive = false;
    };
  }, [clerkUser?.id, manualOnboardingTrigger]);

  useEffect(() => {
    if (!clerkUser?.id) {
      setUserCredits(0);
      return;
    }

    let isActive = true;

    const fetchCredits = async () => {
      try {
        const balance = await getCreditBalance(clerkUser.id);
        if (isActive) setUserCredits(balance);
      } catch (error) {
        console.error('Failed to load user credits', error);
      }
    };

    void fetchCredits();

    return () => {
      isActive = false;
    };
  }, [clerkUser?.id]);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleLogout = async () => {
    scrollToTop();
    try {
      await signOut();
    } catch (error) {
      console.error('Failed to sign out', error);
    } finally {
      setShowIntroPopup(false);
      setShowSplash(false);
      navigate('/');
    }
  };

  const handleGetStarted = () => {
    scrollToTop();
    if (isSignedIn) {
      navigate('/app/home');
    } else {
      navigate('/auth');
    }
  };

  const handleAuthSuccess = useCallback((_userData: any) => {
    if (clerkUser?.id) return;

    scrollToTop();
    setManualOnboardingTrigger(false);
    setShowSplash(true);

    const state = window.history.state?.usr as { from?: { pathname: string } } | null;
    navigate(state?.from?.pathname || '/app/home');
  }, [clerkUser?.id, navigate]);

  const handleRedoOnboarding = () => {
    if (!user) return;
    navigate('/app/personalization');
  };

  const handleIntroComplete = async (profileData: OnboardingProfileData | null) => {
    setManualOnboardingTrigger(false);

    if (user?.id && profileData) {
      const trimmedName = profileData.fullName.trim();
      const trimmedCourse = profileData.courseOfStudy.trim();

      try {
        const savedState = await saveOnboardingProfile(user.id, profileData);
        setOnboardingState(savedState);
        setUser((previous) => {
          if (!previous) return previous;

          const nextUser = { ...previous };
          if (trimmedName) nextUser.name = trimmedName;
          if (profileData.age !== null) nextUser.age = profileData.age;
          if (trimmedCourse) nextUser.courseOfStudy = trimmedCourse;

          return nextUser;
        });
      } catch (error) {
        console.error('Failed to save onboarding details', error);
      }
    }

    setShowIntroPopup(false);
    navigate('/app/home');
  };

  const handleNavigate = (screen: string) => {
    scrollToTop();
    if (screen === 'logout') {
      handleLogout();
    } else {
      const pathMap: Record<string, string> = {
        'landing': '/',
        'auth': '/auth',
        'dashboard': '/app/home',
        'opportunities': '/app/opportunities',
        'all-opportunities': '/app/opportunities',
        'chat': '/app/chat',
        'profile': '/app/profile',
        'all-goals': '/app/goals',
        'community-marketplace': '/app/community',
        'community': '/app/community',
        'achievements': '/app/achievements',
        'saved': '/app/saved',
        'applied': '/app/applied',
        'deadlines': '/app/deadlines',
        'wallet': '/app/wallet',
        'settings': '/app/settings',
        'cv-management': '/app/cv',
        'add-goal': '/app/add-goal',
        'creator-apply': '/app/creator/apply',
        'creator-dashboard': '/app/creator/dashboard',
        'creator-create': '/app/creator/create',
        'personalization': '/app/personalization',
        'creator': '/app/creator/apply'
      };
      navigate(pathMap[screen] || `/app/${screen}`);
    }
  };

  const handleBack = (fallback: string = 'dashboard') => {
    scrollToTop();
    if (location.pathname.includes('/opportunities') || location.pathname.includes('/opportunity')) {
      if (dashboardRef.current) {
        dashboardRef.current.refreshOpportunities();
      }
    }

    if (window.history.length > 2) {
      navigate(-1);
    } else {
      handleNavigate(fallback);
    }
  };

  const handleSwipeLeft = () => {
    const mainTabs = ['/app/home', '/app/opportunities', '/app/chat', '/app/community'];
    const currentIndex = mainTabs.indexOf(location.pathname);
    if (currentIndex >= 0 && currentIndex < mainTabs.length - 1) {
      navigate(mainTabs[currentIndex + 1]);
      scrollToTop();
    }
  };

  const handleSwipeRight = () => {
    const mainTabs = ['/app/home', '/app/opportunities', '/app/chat', '/app/community'];
    const currentIndex = mainTabs.indexOf(location.pathname);
    if (currentIndex > 0) {
      navigate(mainTabs[currentIndex - 1]);
      scrollToTop();
    }
  };

  useSwipe({
    onSwipeLeft: handleSwipeLeft,
    onSwipeRight: handleSwipeRight,
    threshold: 50
  });

  const handleGoalCreated = (goal: Goal) => {
    scrollToTop();
    if (goal.source === 'template') {
      navigate(`/app/goal/${goal.id}/roadmap`);
    } else {
      navigate('/app/home');
    }
  };

  // Show loading state while Clerk is initializing
  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-surface-body flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted">Loading Edutu...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-surface-body text-strong transition-theme ${isDarkMode ? 'dark' : ''}`}>
      {/* Splash Screen */}
      {showSplash && (
        <SplashScreen
          onComplete={() => setShowSplash(false)}
          userName={user?.name}
        />
      )}

      <Routes>
        <Route path="/" element={<LandingPage onGetStarted={() => handleGetStarted()} />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/opportunities" element={<OpportunitiesPage />} />
        <Route path="/blog" element={<BlogPage />} />
        <Route path="/mentor" element={<MentorPage />} />
        <Route path="/auth" element={<AuthScreen onAuthSuccess={handleAuthSuccess} />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/admin/*" element={<AdminGuard><LazyRoute loader={() => import('./admin/AdminRoot')} /></AdminGuard>} />

        <Route path="/app" element={
          <AuthGuard>
            <AppLayout />
          </AuthGuard>
        }>
          <Route index element={<Navigate to="/app/home" replace />} />
          <Route path="home" element={
            <Dashboard
              ref={dashboardRef}
              user={user}
              onOpportunityClick={(opportunity) => {
                void recordOpportunityExplored({
                  id: opportunity.id,
                  title: opportunity.title,
                  category: opportunity.category
                });
                navigate(`/app/opportunity/${opportunity.id}`);
              }}
              onViewAllOpportunities={() => navigate('/app/opportunities')}
              onGoalClick={(goalId) => navigate(`/app/goal/${goalId}/roadmap`)}
              onNavigate={handleNavigate}
              onAddGoal={() => navigate('/app/add-goal')}
              onViewAllGoals={() => navigate('/app/goals')}
              onboardingProfile={onboardingState?.data ?? null}
              onRedoOnboarding={handleRedoOnboarding}
              userCredits={userCredits}
            />
          } />
          <Route path="opportunities" element={
            <AllOpportunities
              onBack={() => handleBack()}
              onSelectOpportunity={(opportunity) => navigate(`/app/opportunity/${opportunity.id}`)}
            />
          } />
          <Route path="chat" element={<LazyRoute loader={() => import('./components/ChatInterface')} />} />
          <Route path="profile" element={<LazyRoute loader={() => import('./components/Profile')} />} />
          <Route path="goals" element={
            <LazyRoute loader={() => import('./components/AllGoals')} />
          } />
          <Route path="community" element={
            <CommunityMarketplace
              onBack={() => handleBack()}
              onRoadmapSelect={(roadmap: any) => {
                scrollToTop();
                if (roadmap.id === 'mc-001' || roadmap.type === 'package') {
                  navigate(`/app/package/${roadmap.id}`);
                } else {
                  navigate(`/app/goal/${roadmap.id}/roadmap`);
                }
              }}
              user={user}
            />
          } />
          <Route path="achievements" element={<AchievementsScreen onBack={() => handleBack()} />} />
          <Route path="saved" element={<SavedOpportunities onBack={() => handleBack('profile')} />} />
          <Route path="applied" element={<AppliedOpportunities onBack={() => handleBack('profile')} />} />
          <Route path="deadlines" element={<DeadlinesScreen onBack={() => handleBack('profile')} />} />
          <Route path="wallet" element={<Wallet onBack={() => handleBack('profile')} />} />
          <Route path="add-goal" element={
            <AddGoalScreen
              onBack={() => handleBack()}
              onGoalCreated={handleGoalCreated}
              onNavigate={handleNavigate}
              user={user}
            />
          } />
          <Route path="opportunity/:id" element={
            <OpportunityDetailFetcher
              onBack={() => handleBack()}
              onSelectOpportunity={(opportunity) => navigate(`/app/opportunity/${opportunity.id}`)}
              onAddToGoals={(opportunity) => navigate(`/app/opportunity/${opportunity.id}/roadmap`)}
            />
          } />
          <Route path="opportunity/:id/roadmap" element={<LazyRoute loader={() => import('./components/OpportunityRoadmap')} />} />
          <Route path="opportunity/:id/ai-roadmap" element={<LazyRoute loader={() => import('./components/AIRoadmapWizard')} />} />
          <Route path="goal/:id/roadmap" element={<GoalRoadmapFetcher onBack={() => handleBack()} />} />
          <Route path="package/:id" element={<PackageDetailFetcher onBack={() => handleBack('/app/community')} />} />
          <Route path="settings" element={<LazyRoute loader={() => import('./components/SettingsMenu')} />} />
          <Route path="profile-edit" element={<LazyRoute loader={() => import('./components/EditProfileScreen')} />} />
          <Route path="notifications" element={<LazyRoute loader={() => import('./components/NotificationsScreen')} />} />
          <Route path="privacy" element={<LazyRoute loader={() => import('./components/PrivacyScreen')} />} />
          <Route path="help" element={<LazyRoute loader={() => import('./components/HelpScreen')} />} />
          <Route path="cv" element={<LazyRoute loader={() => import('./components/CVManagement')} />} />
          <Route path="personalization" element={<LazyRoute loader={() => import('./components/PersonalizationProfileScreen')} />} />
          <Route path="creator/apply" element={<LazyRoute loader={() => import('./components/CreatorApply')} />} />
          <Route path="creator/dashboard" element={<LazyRoute loader={() => import('./components/CreatorDashboard')} />} />
          <Route path="creator/create" element={<LazyRoute loader={() => import('./components/CreatorRoadmapWizard')} />} />
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>

      {showIntroPopup && clerkUser && (
        <IntroductionPopup
          isOpen={showIntroPopup}
          onComplete={handleIntroComplete}
          userName={user?.name || ''}
          initialData={onboardingState?.data ?? null}
        />
      )}

      {/* PWA Install Banner */}
      <PWAInstallBanner />
    </div>
  );
}

export { App as default };
