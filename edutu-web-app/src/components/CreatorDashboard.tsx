import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  TrendingUp,
  Users,
  BookOpen,
  Plus,
  Clock,
  AlertCircle,
  RefreshCw,
  DollarSign,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import Button from './ui/Button';
import Card from './ui/Card';
import { useDarkMode } from '../hooks/useDarkMode';
import { authService } from '../lib/auth';
import { getCreatorStatus, getCreatorApplication } from '../services/creator';
import type { AppUser } from '../types/user';

interface CreatorDashboardProps {
  user: AppUser | null;
  onBack: () => void;
  onNavigate?: (screen: string) => void;
}

interface CreatorStats {
  creditsEarned: number;
  studentsEnrolled: number;
  roadmapsCreated: number;
}

interface CreatorRoadmap {
  id: string;
  title: string;
  category: string;
  status: 'draft' | 'published' | 'archived';
  price: number;
  enrollmentCount: number;
}

const CreatorDashboard: React.FC<CreatorDashboardProps> = ({ user, onBack, onNavigate }) => {
  const { isDarkMode } = useDarkMode();
  const [creatorStatus, setCreatorStatus] = useState<string>('none');
  const [isLoading, setIsLoading] = useState(true);
  const [rejectionReason, setRejectionReason] = useState<string>('');
  const [stats] = useState<CreatorStats>({
    creditsEarned: 12450,
    studentsEnrolled: 342,
    roadmapsCreated: 4,
  });
  const [roadmaps] = useState<CreatorRoadmap[]>([
    { id: 'r1', title: 'Complete Python Programming', category: 'Technology', status: 'published', price: 29.99, enrollmentCount: 156 },
    { id: 'r2', title: 'Scholarship Application Masterclass', category: 'Education', status: 'published', price: 19.99, enrollmentCount: 89 },
    { id: 'r3', title: 'Data Science Fundamentals', category: 'Technology', status: 'draft', price: 39.99, enrollmentCount: 0 },
    { id: 'r4', title: 'Career Transition Guide', category: 'Career', status: 'published', price: 24.99, enrollmentCount: 97 },
  ]);

  useEffect(() => {
    const loadStatus = async () => {
      if (!user?.id) {
        setIsLoading(false);
        return;
      }

      try {
        const status = await getCreatorStatus(user.id);
        setCreatorStatus(status);

        if (status === 'rejected') {
          const application = await getCreatorApplication(user.id);
          if (application?.reviewer_notes) {
            setRejectionReason(application.reviewer_notes);
          }
        }
      } catch (error) {
        console.error('Failed to load creator status:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadStatus();
  }, [user]);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleBack = () => {
    scrollToTop();
    onBack();
  };

  if (isLoading) {
    return (
      <div className={`min-h-screen bg-white dark:bg-gray-900 flex items-center justify-center ${isDarkMode ? 'dark' : ''}`}>
        <div className="text-center">
          <Loader2 size={32} className="animate-spin text-primary mx-auto mb-4" />
          <p className="text-gray-500 dark:text-gray-400">Loading creator dashboard...</p>
        </div>
      </div>
    );
  }

  if (creatorStatus === 'none') {
    onNavigate?.('creator-apply');
    return null;
  }

  if (creatorStatus === 'pending') {
    return (
      <div className={`min-h-screen bg-white dark:bg-gray-900 ${isDarkMode ? 'dark' : ''}`}>
        <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10">
          <div className="p-4">
            <div className="flex items-center gap-3">
              <Button
                variant="secondary"
                onClick={handleBack}
                className="p-2 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
              >
                <ArrowLeft size={20} />
              </Button>
              <div className="flex-1">
                <h1 className="text-xl font-bold text-gray-800 dark:text-white">Creator Studio</h1>
                <p className="text-sm text-gray-600 dark:text-gray-400">Application status</p>
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 max-w-2xl mx-auto space-y-6">
          <Card className="bg-gradient-to-br from-yellow-50 to-amber-50 dark:from-yellow-900/20 dark:to-amber-900/10 border-yellow-200 dark:border-yellow-800">
            <div className="text-center py-8">
              <div className="w-20 h-20 bg-gradient-to-br from-yellow-400 to-amber-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg">
                <Clock size={36} className="text-white" />
              </div>
              <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-3">Application Under Review</h2>
              <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-md mx-auto">
                Thank you for applying! Our team is reviewing your application to ensure quality content for our students.
              </p>
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 max-w-sm mx-auto">
                <div className="flex items-center gap-2 mb-2">
                  <Clock size={16} className="text-yellow-600 dark:text-yellow-400" />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Estimated Timeline</span>
                </div>
                <p className="text-2xl font-bold text-gray-800 dark:text-white">3-5 business days</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">You'll be notified via email once reviewed</p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  if (creatorStatus === 'rejected') {
    return (
      <div className={`min-h-screen bg-white dark:bg-gray-900 ${isDarkMode ? 'dark' : ''}`}>
        <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10">
          <div className="p-4">
            <div className="flex items-center gap-3">
              <Button
                variant="secondary"
                onClick={handleBack}
                className="p-2 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
              >
                <ArrowLeft size={20} />
              </Button>
              <div className="flex-1">
                <h1 className="text-xl font-bold text-gray-800 dark:text-white">Creator Studio</h1>
                <p className="text-sm text-gray-600 dark:text-gray-400">Application status</p>
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 max-w-2xl mx-auto space-y-6">
          <Card className="bg-gradient-to-br from-red-50 to-rose-50 dark:from-red-900/20 dark:to-rose-900/10 border-red-200 dark:border-red-800">
            <div className="text-center py-8">
              <div className="w-20 h-20 bg-gradient-to-br from-red-400 to-rose-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg">
                <AlertCircle size={36} className="text-white" />
              </div>
              <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-3">Application Not Approved</h2>
              <p className="text-gray-600 dark:text-gray-400 mb-4">We couldn't approve your application at this time.</p>
              {rejectionReason && (
                <Card className="bg-white dark:bg-gray-800 max-w-md mx-auto mb-6">
                  <p className="text-sm text-gray-600 dark:text-gray-400 italic">{rejectionReason}</p>
                </Card>
              )}
              <Button onClick={() => onNavigate?.('creator-apply')} className="w-full max-w-xs mx-auto">
                <RefreshCw size={18} />
                Reapply
              </Button>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-white dark:bg-gray-900 ${isDarkMode ? 'dark' : ''}`}>
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10">
        <div className="p-4">
          <div className="flex items-center gap-3">
            <Button
              variant="secondary"
              onClick={handleBack}
              className="p-2 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
            >
              <ArrowLeft size={20} />
            </Button>
            <div className="flex-1">
              <h1 className="text-xl font-bold text-gray-800 dark:text-white">Creator Studio</h1>
              <p className="text-sm text-gray-600 dark:text-gray-400">Manage your roadmaps and earnings</p>
            </div>
          </div>
        </div>
      </div>

      <div className="p-4 max-w-4xl mx-auto space-y-6 pb-24">
        <Card className="bg-gradient-to-r from-primary/10 to-accent/10 dark:from-primary/20 dark:to-accent/20 border-primary/20 dark:border-primary/30">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-gray-800 dark:text-white mb-1">Revenue Share</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">You keep 85% of all sales</p>
            </div>
            <div className="flex items-center gap-2">
              <DollarSign size={28} className="text-green-600 dark:text-green-400" />
              <span className="text-3xl font-bold text-gray-800 dark:text-white">85%</span>
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-3 gap-3">
          <Card className="text-center bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/10 border-green-200 dark:border-green-800">
            <DollarSign size={24} className="text-green-600 dark:text-green-400 mx-auto mb-2" />
            <div className="text-xl font-bold text-gray-800 dark:text-white">${stats.creditsEarned.toLocaleString()}</div>
            <div className="text-xs text-gray-600 dark:text-gray-400">Credits Earned</div>
          </Card>
          <Card className="text-center bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/10 border-blue-200 dark:border-blue-800">
            <Users size={24} className="text-blue-600 dark:text-blue-400 mx-auto mb-2" />
            <div className="text-xl font-bold text-gray-800 dark:text-white">{stats.studentsEnrolled.toLocaleString()}</div>
            <div className="text-xs text-gray-600 dark:text-gray-400">Students Enrolled</div>
          </Card>
          <Card className="text-center bg-gradient-to-br from-purple-50 to-violet-50 dark:from-purple-900/20 dark:to-violet-900/10 border-purple-200 dark:border-purple-800">
            <BookOpen size={24} className="text-purple-600 dark:text-purple-400 mx-auto mb-2" />
            <div className="text-xl font-bold text-gray-800 dark:text-white">{stats.roadmapsCreated}</div>
            <div className="text-xs text-gray-600 dark:text-gray-400">Roadmaps Created</div>
          </Card>
        </div>

        <Button onClick={() => onNavigate?.('creator-create')} className="w-full py-4 text-lg">
          <Plus size={20} />
          Create New Roadmap
        </Button>

        <Card className="dark:bg-gray-800 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">My Roadmaps</h2>
          <div className="space-y-3">
            {roadmaps.map((roadmap) => (
              <div
                key={roadmap.id}
                className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <h3 className="font-medium text-gray-800 dark:text-white mb-1">{roadmap.title}</h3>
                    <div className="flex items-center gap-3 text-sm">
                      <span className="text-gray-500 dark:text-gray-400">{roadmap.category}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        roadmap.status === 'published'
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                          : roadmap.status === 'draft'
                          ? 'bg-gray-100 dark:bg-gray-600 text-gray-600 dark:text-gray-300'
                          : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                      }`}>
                        {roadmap.status}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-gray-800 dark:text-white">${roadmap.price}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">{roadmap.enrollmentCount} enrolled</div>
                  </div>
                  <ChevronRight size={18} className="text-gray-400 ml-3" />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
};

export default CreatorDashboard;
