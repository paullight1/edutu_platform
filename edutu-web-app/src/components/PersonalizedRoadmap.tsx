import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Target,
  Calendar,
  CheckCircle2,
  Circle,
  ChevronDown,
  ChevronRight,
  Star,
  Clock,
  TrendingUp,
  Bell,
  Users,
  Heart,
  Bookmark,
  Verified,
  ExternalLink,
  BookOpen
} from 'lucide-react';
import Card from './ui/Card';
import Button from './ui/Button';
import { useDarkMode } from '../hooks/useDarkMode';
import { useGoals } from '../hooks/useGoals';
import type { CommunityStory } from '../types/community';
import {
  recordCommunityStoryAdoption,
  recordCommunityStoryLike,
  recordCommunityStorySave
} from '../services/communityMarketplaceSupabase';

// Reuse the interfaces from community types for roadmap structure
interface Task {
  id: string;
  title: string;
  completed: boolean;
  priority: 'high' | 'medium' | 'low';
  description?: string;
  duration?: string;
  resourceIds?: string[];
  outcome?: string;
}

interface Week {
  id: string;
  title: string;
  tasks: Task[];
}

interface Month {
  id: string;
  title: string;
  description: string;
  weeks: Week[];
  isExpanded: boolean;
  duration?: string;
  milestone?: string;
  resourceIds?: string[];
  checkpoint?: string;
}

interface PersonalizedRoadmapProps {
  onBack: () => void;
  goalId?: string;
  communityStory?: CommunityStory;
}

const PersonalizedRoadmap: React.FC<PersonalizedRoadmapProps> = ({
  onBack,
  goalId,
  communityStory
}) => {
  const { goals, updateGoal } = useGoals();
  const activeGoal = useMemo(
    () => {
      if (goalId) {
        const match = goals.find((goal) => goal.id === goalId);
        if (match) {
          return match;
        }
      }
      return goals.length > 0 ? goals[0] : null;
    },
    [goals, goalId]
  );

  // Use community story title if available, otherwise goal title
  const goalTitle = communityStory?.title || activeGoal?.title || 'Success Roadmap';
  const [roadmapData, setRoadmapData] = useState<Month[]>([]);
  const [communityData, setCommunityData] = useState<CommunityStory | null>(communityStory || null);
  const [likeLoading, setLikeLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [adoptLoading, setAdoptLoading] = useState(false);
  useEffect(() => {
    // Initialize roadmap data based on community story if provided, otherwise use default
    if (communityData) {
      // Convert CommunityRoadmapStage[] to Month[] structure
      const convertedData: Month[] = communityData.roadmap.map((stage, index) => ({
        id: stage.id,
        title: stage.title,
        description: stage.description || `Stage ${index + 1} of your journey`,
        duration: stage.duration,
        milestone: stage.milestone,
        resourceIds: stage.resourceIds,
        checkpoint: stage.checkpoint,
        isExpanded: index === 0, // Expand the first stage by default
        weeks: [
          {
            id: `week-${stage.id}`,
            title: stage.title,
            tasks: stage.tasks.map(task => ({
              id: task.id,
              title: task.title,
              description: task.description,
              duration: task.duration,
              resourceIds: task.resourceIds,
              outcome: task.outcome,
              completed: false, // Initialize as not completed
              priority: 'medium' as const
            }))
          }
        ]
      }));
      setRoadmapData(convertedData);
    } else if (activeGoal) {
      // Use default roadmap if no community data provided
      const defaultRoadmap: Month[] = [
        {
          id: 'month1',
          title: 'Month 1: Foundation Building',
          description: 'Establish strong fundamentals and create your learning environment',
          isExpanded: true,
          weeks: [
            {
              id: 'week1',
              title: 'Week 1: Getting Started',
              tasks: [
                { id: 't1', title: 'Set up development environment', completed: true, priority: 'high' },
                { id: 't2', title: 'Complete basics tutorial', completed: true, priority: 'high' },
                { id: 't3', title: 'Join relevant community forums', completed: false, priority: 'medium' },
                { id: 't4', title: 'Create project repository', completed: false, priority: 'medium' }
              ]
            },
            {
              id: 'week2',
              title: 'Week 2: Core Concepts',
              tasks: [
                { id: 't5', title: 'Master core concepts', completed: false, priority: 'high' },
                { id: 't6', title: 'Practice control structures', completed: false, priority: 'high' },
                { id: 't7', title: 'Build simple applications', completed: false, priority: 'medium' },
                { id: 't8', title: 'Read relevant resources', completed: false, priority: 'low' }
              ]
            }
          ]
        },
        {
          id: 'month2',
          title: 'Month 2: Intermediate Skills',
          description: 'Dive deeper with more advanced concepts',
          isExpanded: false,
          weeks: [
            {
              id: 'week5',
              title: 'Week 5: Applying Knowledge',
              tasks: [
                { id: 't17', title: 'Build more complex projects', completed: false, priority: 'high' },
                { id: 't18', title: 'Implement best practices', completed: false, priority: 'high' },
                { id: 't19', title: 'Get feedback from community', completed: false, priority: 'medium' },
                { id: 't20', title: 'Refine your work', completed: false, priority: 'medium' }
              ]
            }
          ]
        }
      ];
      setRoadmapData(defaultRoadmap);
    }
  }, [communityData, activeGoal]);

  // Update progress when roadmap changes or when community data is present
  useEffect(() => {
    if (!activeGoal || !communityData) return;

    setRoadmapData((prev) => {
      const allTasks = prev.flatMap((month) =>
        month.weeks.flatMap((week) => week.tasks)
      );
      const totalTasks = allTasks.length;
      if (totalTasks === 0) {
        return prev;
      }
      const targetCompleted = Math.round((activeGoal.progress / 100) * totalTasks);
      const currentCompleted = allTasks.filter((task) => task.completed).length;
      if (currentCompleted === targetCompleted) {
        return prev;
      }
      let completedSoFar = 0;
      return prev.map((month) => ({
        ...month,
        weeks: month.weeks.map((week) => ({
          ...week,
          tasks: week.tasks.map((task) => {
            const shouldComplete = completedSoFar < targetCompleted;
            const updatedTask = { ...task, completed: shouldComplete };
            if (shouldComplete) {
              completedSoFar += 1;
            }
            return updatedTask;
          })
        }))
      }));
    });
  }, [activeGoal?.id, activeGoal?.progress, communityData]);

  const allTasks = useMemo(
    () => roadmapData.flatMap((month) => month.weeks.flatMap((week) => week.tasks)),
    [roadmapData]
  );
  const completedTasksCount = useMemo(
    () => allTasks.filter((task) => task.completed).length,
    [allTasks]
  );

  const [showNotification, setShowNotification] = useState(false);
  const { isDarkMode } = useDarkMode();

  const motivationalQuotes = [
    "Every expert was once a beginner. Keep going! 💪",
    "Code is poetry written in logic. Create your masterpiece! ✨",
    "The best time to plant a tree was 20 years ago. The second best time is now. 🌱",
    "Progress, not perfection. Every line of code counts! 🚀"
  ];

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleBack = () => {
    scrollToTop();
    onBack();
  };

  const toggleMonth = (monthId: string) => {
    setRoadmapData(prev => 
      prev.map(month => 
        month.id === monthId 
          ? { ...month, isExpanded: !month.isExpanded }
          : month
      )
    );
  };

  const toggleTask = (monthId: string, weekId: string, taskId: string) => {
    setRoadmapData((prev) => {
      const next = prev.map((month) =>
        month.id === monthId
          ? {
              ...month,
              weeks: month.weeks.map((week) =>
                week.id === weekId
                  ? {
                      ...week,
                      tasks: week.tasks.map((task) =>
                        task.id === taskId
                          ? { ...task, completed: !task.completed }
                          : task
                      )
                    }
                  : week
              )
            }
          : month
      );

      if (activeGoal) {
        const allTasks = next.flatMap((month) =>
          month.weeks.flatMap((week) => week.tasks)
        );
        const completedTasks = allTasks.filter((task) => task.completed).length;
        const totalTasks = allTasks.length || 1;
        const newProgress = Math.round((completedTasks / totalTasks) * 100);
        updateGoal(activeGoal.id, {
          progress: newProgress,
          status: newProgress >= 100 ? 'completed' : 'active',
          completed_at: newProgress >= 100 ? new Date().toISOString() : null
        });
      }

      // Track task completion if this is a community story
      if (communityData) {
        import('../services/taskTrackingService').then(module => {
          const task = next
            .flatMap(month => month.weeks)
            .flatMap(week => week.tasks)
            .find(t => t.id === taskId);

          if (task) {
            const isNowCompleted = !task.completed; // Since we just toggled it
            if (isNowCompleted) {
              module.taskTrackingService.addCompletedTask({
                id: `community-task-${taskId}`,
                title: task.title,
                source: 'community-marketplace',
                metadata: {
                  communityStoryId: communityData.id,
                  communityStoryTitle: communityData.title,
                  monthId,
                  weekId
                }
              });
            } else {
              module.taskTrackingService.removeCompletedTask(`community-task-${taskId}`);
            }
          }
        });
      }

      return next;
    });
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800';
      case 'medium': return 'bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800';
      case 'low': return 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800';
      default: return 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600';
    }
  };

  const handleLike = async () => {
    if (!communityData || likeLoading) return;
    setLikeLoading(true);
    try {
      await recordCommunityStoryLike(communityData.id);
      // Update local state to reflect the like
      setCommunityData(prev =>
        prev ? {
          ...prev,
          stats: {
            ...prev.stats,
            likes: prev.stats.likes + 1
          }
        } : null
      );
    } catch (error) {
      console.error('Error recording like:', error);
    } finally {
      setLikeLoading(false);
    }
  };

  const handleSave = async () => {
    if (!communityData || saveLoading) return;
    setSaveLoading(true);
    try {
      await recordCommunityStorySave(communityData.id);
      // Update local state to reflect the save
      setCommunityData(prev =>
        prev ? {
          ...prev,
          stats: {
            ...prev.stats,
            saves: prev.stats.saves + 1
          }
        } : null
      );
    } catch (error) {
      console.error('Error recording save:', error);
    } finally {
      setSaveLoading(false);
    }
  };

  const handleAdopt = async () => {
    if (!communityData || adoptLoading) return;
    setAdoptLoading(true);
    try {
      await recordCommunityStoryAdoption(communityData.id);
      // Update local state to reflect the adoption
      setCommunityData(prev =>
        prev ? {
          ...prev,
          stats: {
            ...prev.stats,
            adoptionCount: prev.stats.adoptionCount + 1
          }
        } : null
      );
    } catch (error) {
      console.error('Error recording adoption:', error);
    } finally {
      setAdoptLoading(false);
    }
  };

  const handleSetReminders = () => {
    setShowNotification(true);
    setTimeout(() => setShowNotification(false), 3000);
  };

  const handleJoinCommunity = () => {
    scrollToTop();
    // Navigate to community page
  };

  const totalTasks = allTasks.length;
  const progress = totalTasks === 0 ? 0 : Math.round((completedTasksCount / totalTasks) * 100);
  const formattedDeadline = activeGoal?.deadline
    ? new Date(activeGoal.deadline).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      })
    : 'No deadline';
  const daysRemaining = activeGoal?.deadline
    ? Math.ceil(
        (new Date(activeGoal.deadline).getTime() - Date.now()) /
          (1000 * 60 * 60 * 24)
      )
    : null;
  const deadlineCopy =
    activeGoal?.deadline && daysRemaining !== null
      ? daysRemaining > 0
        ? `${formattedDeadline} (${daysRemaining} day${daysRemaining === 1 ? '' : 's'} left)`
        : daysRemaining === 0
        ? `${formattedDeadline} (deadline today)`
        : `${formattedDeadline} (deadline passed)`
      : formattedDeadline;
  const priorityLabel = activeGoal?.priority
    ? `${activeGoal.priority.charAt(0).toUpperCase()}${activeGoal.priority.slice(1)}`
    : 'Not set';
  const statusLabel = activeGoal
    ? activeGoal.status === 'completed'
      ? 'Completed'
      : 'In progress'
    : 'Not started';

  return (
    <div className={`min-h-screen bg-white dark:bg-gray-900 animate-fade-in ${isDarkMode ? 'dark' : ''}`}>
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10">
        <div className="p-4">
          <div className="flex items-center gap-3 mb-4">
            <Button
              variant="secondary"
              onClick={handleBack}
              className="p-2 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
            >
              <ArrowLeft size={20} />
            </Button>
            <div className="flex-1">
              <h1 className="text-xl font-bold text-gray-800 dark:text-white">
                {communityData ? 'Community Roadmap' : 'Your Success Roadmap'} 🎯
              </h1>
              <p className="text-sm text-gray-600 dark:text-gray-400">{goalTitle}</p>
            </div>
          </div>

          {/* Community Creator Card - Only show if it's a community roadmap */}
          {communityData && (
            <div className="mb-4 p-3 rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 text-primary font-bold">
                    {communityData.creator.avatar?.charAt(0) || communityData.creator.name.charAt(0)}
                  </div>
                  <div>
                    <div className="flex items-center gap-1">
                      <h3 className="font-medium text-gray-900 dark:text-white">{communityData.creator.name}</h3>
                      {communityData.creator.verified && (
                        <Verified size={14} className="text-blue-500" />
                      )}
                    </div>
                    <p className="text-xs text-gray-600 dark:text-gray-400">{communityData.creator.title}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 text-yellow-500">
                    <Star size={14} fill="currentColor" />
                    <span className="text-xs font-medium">{communityData.stats.rating.toFixed(1)}</span>
                  </div>
                  <span className="text-xs text-gray-500 dark:text-gray-400">•</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">{communityData.stats.users} learners</span>
                </div>
              </div>
            </div>
          )}

          {/* Progress Bar */}
          <div className="mb-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Overall Progress</span>
              <span className="text-sm font-bold text-primary">{progress}% Complete</span>
            </div>
            <div className="w-full h-3 overflow-hidden rounded-full bg-neutral-200/70 dark:bg-neutral-700/40 backdrop-blur-sm">
              <div
                className="relative h-full rounded-full bg-gradient-to-r from-brand-500 via-brand-400 to-accent-400 shadow-[0_12px_32px_-18px_rgba(6,182,212,0.9)] transition-[width] duration-500 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-lg font-bold text-primary">
                {completedTasksCount}/{totalTasks}
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400">Tasks complete</div>
            </div>
            <div className="text-center">
              <div className="text-sm font-semibold text-accent">{deadlineCopy}</div>
              <div className="text-xs text-gray-600 dark:text-gray-400">Target date</div>
            </div>
            <div className="text-center">
              <div
                className={`text-lg font-bold ${
                  activeGoal?.status === 'completed' ? 'text-green-600' : 'text-primary'
                }`}
              >
                {statusLabel}
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400">Priority: {priorityLabel}</div>
            </div>
          </div>

          {/* Community Stats and Engagement - Only show if it's a community roadmap */}
          {communityData && (
            <div className="grid grid-cols-4 gap-2 pt-2 border-t border-gray-200 dark:border-gray-700">
              <div className="text-center">
                <div className="text-sm font-semibold text-yellow-600 dark:text-yellow-400">
                  {communityData.stats.rating.toFixed(1)}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Rating</div>
              </div>
              <div className="text-center">
                <div className="text-sm font-semibold text-blue-600 dark:text-blue-400">
                  {communityData.stats.users}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Learners</div>
              </div>
              <div className="text-center">
                <div className="text-sm font-semibold text-green-600 dark:text-green-400">
                  {communityData.successRate}%
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Success</div>
              </div>
              <div className="text-center">
                <div className="text-sm font-semibold text-purple-600 dark:text-purple-400">
                  {communityData.stats.adoptionCount}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Adoption</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Notification */}
      {showNotification && (
        <div className="fixed top-20 left-4 right-4 z-50 animate-slide-up">
          <div className="bg-green-500 text-white p-4 rounded-2xl shadow-lg">
            <div className="flex items-center gap-2">
              <Bell size={20} />
              <span className="font-medium">Reminders Set!</span>
            </div>
            <p className="text-sm mt-1">You'll be notified about important milestones and deadlines.</p>
          </div>
        </div>
      )}

      {/* Roadmap Content */}
      <div className="p-4 space-y-6">
        <Card
          onClick={() => { window.location.href = '/app/roadmap-templates'; }}
          className="cursor-pointer border-brand-500/20 bg-brand-500/10 p-4 sm:p-5"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-[20px] bg-brand-500/10 text-brand-500">
              <BookOpen size={21} />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-bold text-slate-950 dark:text-white">Explore roadmap templates</h3>
              <p className="mt-0.5 line-clamp-1 text-xs text-slate-500 dark:text-slate-400">Use a template for your next goal.</p>
            </div>
            <ChevronRight size={18} className="text-slate-400" />
          </div>
        </Card>

        {roadmapData.map((month, monthIndex) => (
          <Card key={month.id} className="overflow-hidden animate-slide-up dark:bg-gray-800 dark:border-gray-700" style={{ animationDelay: `${monthIndex * 100}ms` }}>
            {/* Month Header */}
            <button
              onClick={() => toggleMonth(month.id)}
              className="w-full flex items-center justify-between p-2 -m-2 rounded-2xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-all"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center text-white font-bold">
                  {monthIndex + 1}
                </div>
                <div className="text-left">
                  <h2 className="text-lg font-semibold text-gray-800 dark:text-white">{month.title}</h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{month.description}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {month.weeks.flatMap(w => w.tasks).filter(t => t.completed).length}/
                  {month.weeks.flatMap(w => w.tasks).length}
                </div>
                {month.isExpanded ? (
                  <ChevronDown size={20} className="text-gray-400" />
                ) : (
                  <ChevronRight size={20} className="text-gray-400" />
                )}
              </div>
            </button>

            {/* Month Content */}
            {month.isExpanded && (
              <div className="mt-6 space-y-4 animate-slide-up">
                {month.weeks.map((week, weekIndex) => (
                  <div key={week.id} className="relative">
                    {/* Timeline Dot */}
                    <div className="absolute left-4 top-6 w-3 h-3 bg-primary rounded-full border-2 border-white dark:border-gray-800 shadow-md"></div>
                    <div className="absolute left-5 top-12 w-0.5 h-full bg-gray-200 dark:bg-gray-600"></div>

                    {/* Week Card */}
                    <div className="ml-12 bg-gray-50 dark:bg-gray-700 rounded-2xl p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Calendar size={16} className="text-primary" />
                        <h3 className="font-medium text-gray-800 dark:text-white">{week.title}</h3>
                        <div className="ml-auto text-xs text-gray-500 dark:text-gray-400">
                          {week.tasks.filter(t => t.completed).length}/{week.tasks.length} done
                        </div>
                      </div>

                      {/* Tasks */}
                      <div className="space-y-2">
                        {week.tasks.map((task, taskIndex) => (
                          <div
                            key={task.id}
                            className={`flex items-start gap-3 p-3 rounded-xl transition-all cursor-pointer hover:bg-white dark:hover:bg-gray-600 ${
                              task.completed ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800' : 'bg-white dark:bg-gray-600 border border-gray-200 dark:border-gray-500'
                            } animate-slide-up`}
                            style={{ animationDelay: `${taskIndex * 50}ms` }}
                            onClick={() => toggleTask(month.id, week.id, task.id)}
                          >
                            <button className="flex-shrink-0 mt-0.5">
                              {task.completed ? (
                                <CheckCircle2 size={20} className="text-green-600" />
                              ) : (
                                <Circle size={20} className="text-gray-400 hover:text-primary transition-colors" />
                              )}
                            </button>
                            <div className="flex-1">
                              <p className={`text-sm ${task.completed ? 'line-through text-gray-500 dark:text-gray-400' : 'text-gray-800 dark:text-white'}`}>
                                {task.title}
                              </p>
                              {task.description && (
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{task.description}</p>
                              )}
                              {task.duration && (
                                <div className="flex items-center gap-1 mt-1">
                                  <Clock size={12} className="text-gray-400" />
                                  <span className="text-xs text-gray-500 dark:text-gray-400">{task.duration}</span>
                                </div>
                              )}
                              {task.outcome && (
                                <div className="mt-1">
                                  <span className="text-xs font-medium text-green-600 dark:text-green-400">Outcome: </span>
                                  <span className="text-xs text-gray-500 dark:text-gray-400">{task.outcome}</span>
                                </div>
                              )}
                            </div>
                            <div className={`px-2 py-1 rounded-full text-xs border ${getPriorityColor(task.priority)}`}>
                              {task.priority}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Motivational Quote for Completed Weeks */}
                      {week.tasks.filter(t => !t.completed).length === 0 && (
                        <div className="mt-4 p-3 bg-accent/10 dark:bg-accent/20 rounded-xl border border-accent/20 dark:border-accent/30">
                          <div className="flex items-center gap-2 text-accent">
                            <Star size={16} />
                            <p className="text-sm font-medium">
                              {communityData
                                ? "Great job completing this stage! Your next step awaits."
                                : motivationalQuotes[weekIndex % motivationalQuotes.length]
                              }
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        ))}

        {/* Completion Celebration */}
        {progress === 100 && (
          <Card className="text-center bg-gradient-to-r from-primary/10 to-accent/10 border-primary/20 dark:from-primary/20 dark:to-accent/20 dark:border-primary/30 dark:bg-gray-800 animate-bounce-subtle">
            <div className="text-4xl mb-3">🎉</div>
            <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-2">Congratulations!</h3>
            <p className="text-gray-600 dark:text-gray-300 mb-4">
              {communityData
                ? `You've completed the "${communityData.title}" roadmap! Great job following this path shared by ${communityData.creator.name}.`
                : "You've completed your learning journey! Time to celebrate and plan your next adventure."
              }
            </p>
            <Button className="inline-flex items-center gap-2">
              <TrendingUp size={16} />
              Plan Next Goal
            </Button>
          </Card>
        )}

        {/* Action Buttons */}
        <div className="pt-4">
          {communityData ? (
            // Community roadmap specific buttons
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Button
                variant="secondary"
                className="flex items-center justify-center gap-2 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                onClick={handleLike}
                disabled={likeLoading}
              >
                <Heart size={16} className={communityData.stats.likes > 0 ? "text-red-500 fill-current" : ""} />
                {likeLoading ? 'Liking...' : 'Like'}
              </Button>
              <Button
                variant="secondary"
                className="flex items-center justify-center gap-2 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                onClick={handleSave}
                disabled={saveLoading}
              >
                <Bookmark size={16} className={communityData.stats.saves > 0 ? "text-blue-500 fill-current" : ""} />
                {saveLoading ? 'Saving...' : 'Save'}
              </Button>
              <Button
                variant="secondary"
                className="flex items-center justify-center gap-2 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                onClick={handleAdopt}
                disabled={adoptLoading}
              >
                <Target size={16} />
                {adoptLoading ? 'Adopting...' : 'Adopt'}
              </Button>
              <Button
                className="flex items-center justify-center gap-2"
                onClick={handleJoinCommunity}
              >
                <Users size={16} />
                Join Community
              </Button>
            </div>
          ) : (
            // Personal roadmap buttons
            <div className="grid grid-cols-2 gap-4">
              <Button
                variant="secondary"
                className="flex items-center justify-center gap-2 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                onClick={handleSetReminders}
              >
                <Bell size={16} />
                Set Reminders
              </Button>
              <Button
                className="flex items-center justify-center gap-2"
                onClick={handleJoinCommunity}
              >
                <Users size={16} />
                Join Community
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PersonalizedRoadmap;
