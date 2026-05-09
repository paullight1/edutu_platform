import React, { useState } from 'react';
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
  AlertTriangle,
  Users
} from 'lucide-react';
import Card from './ui/Card';
import Button from './ui/Button';
import { useDarkMode } from '../hooks/useDarkMode';
import type { Opportunity } from '../types/opportunity';

interface Task {
  id: string;
  title: string;
  completed: boolean;
  priority: 'high' | 'medium' | 'low';
  dueDate?: string;
}

interface Week {
  id: string;
  title: string;
  tasks: Task[];
  startDate: string;
  endDate: string;
}

interface Month {
  id: string;
  title: string;
  description: string;
  weeks: Week[];
  isExpanded: boolean;
}

interface OpportunityRoadmapProps {
  onBack: () => void;
  opportunity: Opportunity;
}

const OpportunityRoadmap: React.FC<OpportunityRoadmapProps> = ({ 
  onBack, 
  opportunity 
}) => {
  const [roadmapData, setRoadmapData] = useState<Month[]>([
    {
      id: 'month1',
      title: 'Month 1: Foundation & Research',
      description: 'Build strong foundation and gather all necessary information',
      isExpanded: true,
      weeks: [
        {
          id: 'week1',
          title: 'Week 1: Initial Research',
          startDate: 'Dec 1, 2024',
          endDate: 'Dec 7, 2024',
          tasks: [
            { id: 't1', title: 'Research organization background and values', completed: true, priority: 'high', dueDate: 'Dec 2' },
            { id: 't2', title: 'Read all application requirements thoroughly', completed: true, priority: 'high', dueDate: 'Dec 3' },
            { id: 't3', title: 'Create application timeline and checklist', completed: false, priority: 'high', dueDate: 'Dec 5' },
            { id: 't4', title: 'Join relevant online communities and forums', completed: false, priority: 'medium', dueDate: 'Dec 7' }
          ]
        },
        {
          id: 'week2',
          title: 'Week 2: Document Preparation',
          startDate: 'Dec 8, 2024',
          endDate: 'Dec 14, 2024',
          tasks: [
            { id: 't5', title: 'Gather all required documents (transcripts, certificates)', completed: false, priority: 'high', dueDate: 'Dec 10' },
            { id: 't6', title: 'Update CV/Resume to highlight relevant experience', completed: false, priority: 'high', dueDate: 'Dec 12' },
            { id: 't7', title: 'Request official transcripts from institutions', completed: false, priority: 'medium', dueDate: 'Dec 14' },
            { id: 't8', title: 'Scan and organize all documents digitally', completed: false, priority: 'low', dueDate: 'Dec 14' }
          ]
        },
        {
          id: 'week3',
          title: 'Week 3: References & Recommendations',
          startDate: 'Dec 15, 2024',
          endDate: 'Dec 21, 2024',
          tasks: [
            { id: 't9', title: 'Identify and contact potential referees', completed: false, priority: 'high', dueDate: 'Dec 16' },
            { id: 't10', title: 'Provide referees with application details and deadlines', completed: false, priority: 'high', dueDate: 'Dec 18' },
            { id: 't11', title: 'Follow up with referees on recommendation letters', completed: false, priority: 'medium', dueDate: 'Dec 20' },
            { id: 't12', title: 'Prepare reference contact information', completed: false, priority: 'medium', dueDate: 'Dec 21' }
          ]
        },
        {
          id: 'week4',
          title: 'Week 4: Essay Planning',
          startDate: 'Dec 22, 2024',
          endDate: 'Dec 28, 2024',
          tasks: [
            { id: 't13', title: 'Analyze essay questions and requirements', completed: false, priority: 'high', dueDate: 'Dec 23' },
            { id: 't14', title: 'Brainstorm and outline essay responses', completed: false, priority: 'high', dueDate: 'Dec 25' },
            { id: 't15', title: 'Research successful essay examples', completed: false, priority: 'medium', dueDate: 'Dec 27' },
            { id: 't16', title: 'Create detailed essay outlines', completed: false, priority: 'high', dueDate: 'Dec 28' }
          ]
        }
      ]
    },
    {
      id: 'month2',
      title: 'Month 2: Application Development',
      description: 'Craft compelling application materials and essays',
      isExpanded: false,
      weeks: [
        {
          id: 'week5',
          title: 'Week 5: Essay Writing',
          startDate: 'Dec 29, 2024',
          endDate: 'Jan 4, 2025',
          tasks: [
            { id: 't17', title: 'Write first draft of personal statement', completed: false, priority: 'high', dueDate: 'Jan 2' },
            { id: 't18', title: 'Write first draft of motivation letter', completed: false, priority: 'high', dueDate: 'Jan 3' },
            { id: 't19', title: 'Draft responses to specific essay questions', completed: false, priority: 'high', dueDate: 'Jan 4' },
            { id: 't20', title: 'Create compelling opening and closing statements', completed: false, priority: 'medium', dueDate: 'Jan 4' }
          ]
        },
        {
          id: 'week6',
          title: 'Week 6: Essay Refinement',
          startDate: 'Jan 5, 2025',
          endDate: 'Jan 11, 2025',
          tasks: [
            { id: 't21', title: 'Review and revise all essay drafts', completed: false, priority: 'high', dueDate: 'Jan 7' },
            { id: 't22', title: 'Get feedback from mentors or advisors', completed: false, priority: 'high', dueDate: 'Jan 9' },
            { id: 't23', title: 'Proofread for grammar and clarity', completed: false, priority: 'medium', dueDate: 'Jan 10' },
            { id: 't24', title: 'Ensure essays meet word count requirements', completed: false, priority: 'medium', dueDate: 'Jan 11' }
          ]
        },
        {
          id: 'week7',
          title: 'Week 7: Application Form',
          startDate: 'Jan 12, 2025',
          endDate: 'Jan 18, 2025',
          tasks: [
            { id: 't25', title: 'Complete online application form', completed: false, priority: 'high', dueDate: 'Jan 14' },
            { id: 't26', title: 'Upload all required documents', completed: false, priority: 'high', dueDate: 'Jan 16' },
            { id: 't27', title: 'Double-check all information for accuracy', completed: false, priority: 'high', dueDate: 'Jan 17' },
            { id: 't28', title: 'Save draft and review before submission', completed: false, priority: 'medium', dueDate: 'Jan 18' }
          ]
        },
        {
          id: 'week8',
          title: 'Week 8: Final Preparations',
          startDate: 'Jan 19, 2025',
          endDate: 'Jan 25, 2025',
          tasks: [
            { id: 't29', title: 'Conduct final review of entire application', completed: false, priority: 'high', dueDate: 'Jan 21' },
            { id: 't30', title: 'Prepare for potential interview questions', completed: false, priority: 'medium', dueDate: 'Jan 23' },
            { id: 't31', title: 'Create backup copies of all materials', completed: false, priority: 'medium', dueDate: 'Jan 24' },
            { id: 't32', title: 'Set up application submission reminders', completed: false, priority: 'high', dueDate: 'Jan 25' }
          ]
        }
      ]
    },
    {
      id: 'month3',
      title: 'Month 3: Submission & Follow-up',
      description: 'Submit application and prepare for next steps',
      isExpanded: false,
      weeks: [
        {
          id: 'week9',
          title: 'Week 9: Application Submission',
          startDate: 'Jan 26, 2025',
          endDate: 'Feb 1, 2025',
          tasks: [
            { id: 't33', title: 'Submit application before deadline', completed: false, priority: 'high', dueDate: 'Jan 28' },
            { id: 't34', title: 'Confirm receipt of application', completed: false, priority: 'high', dueDate: 'Jan 29' },
            { id: 't35', title: 'Follow up on missing documents if needed', completed: false, priority: 'medium', dueDate: 'Jan 31' },
            { id: 't36', title: 'Send thank you notes to referees', completed: false, priority: 'low', dueDate: 'Feb 1' }
          ]
        },
        {
          id: 'week10',
          title: 'Week 10: Interview Preparation',
          startDate: 'Feb 2, 2025',
          endDate: 'Feb 8, 2025',
          tasks: [
            { id: 't37', title: 'Research common interview questions', completed: false, priority: 'high', dueDate: 'Feb 4' },
            { id: 't38', title: 'Practice mock interviews with friends/mentors', completed: false, priority: 'high', dueDate: 'Feb 6' },
            { id: 't39', title: 'Prepare questions to ask interviewers', completed: false, priority: 'medium', dueDate: 'Feb 7' },
            { id: 't40', title: 'Plan interview outfit and logistics', completed: false, priority: 'medium', dueDate: 'Feb 8' }
          ]
        },
        {
          id: 'week11',
          title: 'Week 11: Continued Preparation',
          startDate: 'Feb 9, 2025',
          endDate: 'Feb 15, 2025',
          tasks: [
            { id: 't41', title: 'Stay updated on organization news and developments', completed: false, priority: 'medium', dueDate: 'Feb 11' },
            { id: 't42', title: 'Network with current/former program participants', completed: false, priority: 'medium', dueDate: 'Feb 13' },
            { id: 't43', title: 'Continue skill development relevant to opportunity', completed: false, priority: 'low', dueDate: 'Feb 15' },
            { id: 't44', title: 'Maintain positive mindset and self-care', completed: false, priority: 'medium', dueDate: 'Feb 15' }
          ]
        },
        {
          id: 'week12',
          title: 'Week 12: Final Countdown',
          startDate: 'Feb 16, 2025',
          endDate: 'Feb 22, 2025',
          tasks: [
            { id: 't45', title: 'Monitor email for interview invitations', completed: false, priority: 'high', dueDate: 'Feb 18' },
            { id: 't46', title: 'Prepare backup application strategies', completed: false, priority: 'medium', dueDate: 'Feb 20' },
            { id: 't47', title: 'Celebrate completing the application process', completed: false, priority: 'low', dueDate: 'Feb 22' },
            { id: 't48', title: 'Plan next steps regardless of outcome', completed: false, priority: 'medium', dueDate: 'Feb 22' }
          ]
        }
      ]
    }
  ]);

  const [showNotification, setShowNotification] = useState(false);
  const { isDarkMode } = useDarkMode();
  const deadlineLabel = opportunity.deadline ?? 'No deadline listed';

  const motivationalQuotes = [
    "Success is where preparation meets opportunity! ≡ƒÆ¬",
    "Every application is a step closer to your dreams! Γ£¿",
    "Your dedication today shapes your tomorrow! ≡ƒîƒ",
    "Believe in yourself - you've got this! ≡ƒÜÇ"
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
    setRoadmapData(prev =>
      prev.map(month =>
        month.id === monthId
          ? {
              ...month,
              weeks: month.weeks.map(week =>
                week.id === weekId
                  ? {
                      ...week,
                      tasks: week.tasks.map(task =>
                        task.id === taskId
                          ? { ...task, completed: !task.completed }
                          : task
                      )
                    }
                  : week
              )
            }
          : month
      )
    );

    // Find the task that was toggled to determine its previous state
    const previousMonth = roadmapData.find(m => m.id === monthId);
    if (previousMonth) {
      const previousWeek = previousMonth.weeks.find(w => w.id === weekId);
      if (previousWeek) {
        const previousTask = previousWeek.tasks.find(t => t.id === taskId);
        if (previousTask) {
          // Check if the task is now completed (after the toggle)
          const isNowCompleted = !previousTask.completed;
          if (isNowCompleted) {
            // Task was just marked as completed
            import('../services/taskTrackingService').then(module => {
              module.taskTrackingService.addCompletedTask({
                id: `roadmap-task-${taskId}`,
                title: previousTask.title,
                source: 'opportunity-roadmap',
                metadata: {
                  opportunityId: opportunity.id,
                  opportunityTitle: opportunity.title,
                  monthId,
                  weekId
                }
              });
            });
          } else {
            // Task was uncompleted, remove from tracking
            import('../services/taskTrackingService').then(module => {
              module.taskTrackingService.removeCompletedTask(`roadmap-task-${taskId}`);
            });
          }
        }
      }
    }
  };

  const calculateProgress = () => {
    const allTasks = roadmapData.flatMap(month => 
      month.weeks.flatMap(week => week.tasks)
    );
    const completedTasks = allTasks.filter(task => task.completed);
    return Math.round((completedTasks.length / allTasks.length) * 100);
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800';
      case 'medium': return 'bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800';
      case 'low': return 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800';
      default: return 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600';
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

  const progress = calculateProgress();
  const daysUntilDeadline = 74; // Updated to be similar to application deadline

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
              <h1 className="text-lg font-bold text-gray-800 dark:text-white">Application Roadmap ≡ƒÄ»</h1>
              <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-1">{opportunity.title}</p>
            </div>
            <div className="text-right">
              <div className={`text-sm font-medium ${daysUntilDeadline <= 30 ? 'text-red-600 dark:text-red-400' : 'text-gray-600 dark:text-gray-400'}`}>
                {daysUntilDeadline} days left
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-500">{deadlineLabel}</div>
            </div>
          </div>

          {/* Deadline Alert */}
          {daysUntilDeadline <= 30 && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl">
              <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
                <AlertTriangle size={16} />
                <span className="text-sm font-medium">
                  Deadline approaching! Only {daysUntilDeadline} days remaining.
                </span>
              </div>
            </div>
          )}

          {/* Progress Bar */}
          <div className="mb-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Application Progress</span>
              <span className="text-sm font-bold text-primary">{progress}% Complete</span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
              <div
                className="bg-gradient-to-r from-primary to-accent h-3 rounded-full transition-all duration-500 relative overflow-hidden"
                style={{ width: `${progress}%` }}
              >
                <div className="absolute inset-0 bg-white/20 animate-pulse"></div>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-lg font-bold text-primary">
                {roadmapData.flatMap(m => m.weeks.flatMap(w => w.tasks)).filter(t => t.completed).length}
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400">Completed</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-accent">12</div>
              <div className="text-xs text-gray-600 dark:text-gray-400">Weeks</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-green-600">
                {roadmapData.flatMap(m => m.weeks.flatMap(w => w.tasks)).length}
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400">Total Tasks</div>
            </div>
          </div>
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
            <p className="text-sm mt-1">You'll be notified about important deadlines and milestones.</p>
          </div>
        </div>
      )}

      {/* Roadmap Content */}
      <div className="p-4 space-y-6">
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
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Calendar size={16} className="text-primary" />
                          <h3 className="font-medium text-gray-800 dark:text-white">{week.title}</h3>
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {week.startDate} - {week.endDate}
                        </div>
                      </div>

                      {/* Tasks */}
                      <div className="space-y-2">
                        {week.tasks.map((task, taskIndex) => (
                          <div
                            key={task.id}
                            className={`flex items-center gap-3 p-3 rounded-xl transition-all cursor-pointer hover:bg-white dark:hover:bg-gray-600 ${
                              task.completed ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800' : 'bg-white dark:bg-gray-600 border border-gray-200 dark:border-gray-500'
                            } animate-slide-up`}
                            style={{ animationDelay: `${taskIndex * 50}ms` }}
                            onClick={() => toggleTask(month.id, week.id, task.id)}
                          >
                            <button className="flex-shrink-0">
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
                              {task.dueDate && (
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Due: {task.dueDate}</p>
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
                              {motivationalQuotes[weekIndex % motivationalQuotes.length]}
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
            <div className="text-4xl mb-3">≡ƒÄë</div>
            <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-2">Application Complete!</h3>
            <p className="text-gray-600 dark:text-gray-300 mb-4">
              Congratulations! You've completed all preparation tasks. Now it's time to wait for the results and prepare for potential interviews.
            </p>
            <Button className="inline-flex items-center gap-2">
              <TrendingUp size={16} />
              Plan Next Steps
            </Button>
          </Card>
        )}

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-4 pt-4">
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
      </div>
    </div>
  );
};

export default OpportunityRoadmap;
