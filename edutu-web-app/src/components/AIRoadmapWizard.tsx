import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  Sparkles,
  Target,
  Calendar,
  CheckCircle2,
  Circle,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Flag,
  Clock,
  Trophy,
  ListChecks,
  FileText,
  Zap,
  Eye
} from 'lucide-react';
import Button from './ui/Button';
import Card from './ui/Card';
import { useDarkMode } from '../hooks/useDarkMode';
import { useGoals } from '../hooks/useGoals';
import { useToast } from './ui/ToastProvider';
import type { Opportunity } from '../types/opportunity';
import {
  generateRoadmap,
  generateAISummary,
  calculateCompletionDate,
  type GeneratedRoadmap,
  type RoadmapMilestone,
  type RoadmapTask,
  type WeeklyGoal,
  type WeeklyChecklistItem,
  type ChecklistItem
} from '../services/aiRoadmapGenerator';

interface AIRoadmapWizardProps {
  opportunity: Opportunity;
  onBack: () => void;
  onComplete: (goalId: string, roadmap: GeneratedRoadmap) => void;
}

const stepVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 300 : -300,
    opacity: 0
  }),
  center: {
    x: 0,
    opacity: 1
  },
  exit: (direction: number) => ({
    x: direction < 0 ? 300 : -300,
    opacity: 0
  })
};

const AIRoadmapWizard: React.FC<AIRoadmapWizardProps> = ({ opportunity, onBack, onComplete }) => {
  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState(0);
  const [roadmap, setRoadmap] = useState<GeneratedRoadmap>(() => generateRoadmap(opportunity));
  const [isCreating, setIsCreating] = useState(false);
  const { isDarkMode } = useDarkMode();
  const { createGoal } = useGoals();
  const { success } = useToast();

  const aiSummary = generateAISummary(opportunity, roadmap);

  const navigateStep = useCallback((newStep: number) => {
    setDirection(newStep > step ? 1 : -1);
    setStep(newStep);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [step]);

  const handleNext = () => {
    if (step < 5) navigateStep(step + 1);
  };

  const handleBack = () => {
    if (step > 1) navigateStep(step - 1);
    else onBack();
  };

  const updateMilestone = (index: number, updates: Partial<RoadmapMilestone>) => {
    const updated = [...roadmap.milestones];
    updated[index] = { ...updated[index], ...updates };
    setRoadmap(prev => ({ ...prev, milestones: updated }));
  };

  const updateMilestoneTask = (milestoneIndex: number, taskIndex: number, updates: Partial<RoadmapTask>) => {
    const updated = [...roadmap.milestones];
    const tasks = [...updated[milestoneIndex].tasks];
    tasks[taskIndex] = { ...tasks[taskIndex], ...updates };
    updated[milestoneIndex] = { ...updated[milestoneIndex], tasks };
    setRoadmap(prev => ({ ...prev, milestones: updated }));
  };

  const addMilestone = () => {
    const maxWeek = Math.max(...roadmap.milestones.map(m => m.week), 0);
    const newMilestone: RoadmapMilestone = {
      id: `m-${Date.now()}`,
      title: 'New Milestone',
      description: 'Description',
      week: maxWeek + 1,
      tasks: []
    };
    setRoadmap(prev => ({ ...prev, milestones: [...prev.milestones, newMilestone] }));
  };

  const removeMilestone = (index: number) => {
    setRoadmap(prev => ({ ...prev, milestones: prev.milestones.filter((_, i) => i !== index) }));
  };

  const addTaskToMilestone = (milestoneIndex: number) => {
    const updated = [...roadmap.milestones];
    const newTask: RoadmapTask = {
      id: `t-${Date.now()}`,
      title: 'New Task',
      description: 'Task description',
      duration: '1 hour'
    };
    updated[milestoneIndex] = {
      ...updated[milestoneIndex],
      tasks: [...updated[milestoneIndex].tasks, newTask]
    };
    setRoadmap(prev => ({ ...prev, milestones: updated }));
  };

  const removeTaskFromMilestone = (milestoneIndex: number, taskIndex: number) => {
    const updated = [...roadmap.milestones];
    updated[milestoneIndex] = {
      ...updated[milestoneIndex],
      tasks: updated[milestoneIndex].tasks.filter((_, i) => i !== taskIndex)
    };
    setRoadmap(prev => ({ ...prev, milestones: updated }));
  };

  const updateWeeklyGoal = (index: number, updates: Partial<WeeklyGoal>) => {
    const updated = [...roadmap.weeklyGoals];
    updated[index] = { ...updated[index], ...updates };
    setRoadmap(prev => ({ ...prev, weeklyGoals: updated }));
  };

  const updateChecklistItem = (goalIndex: number, itemIndex: number, updates: Partial<WeeklyChecklistItem>) => {
    const updated = [...roadmap.weeklyGoals];
    const checklist = [...updated[goalIndex].checklist];
    checklist[itemIndex] = { ...checklist[itemIndex], ...updates };
    updated[goalIndex] = { ...updated[goalIndex], checklist };
    setRoadmap(prev => ({ ...prev, weeklyGoals: updated }));
  };

  const addChecklistItem = (goalIndex: number) => {
    const updated = [...roadmap.weeklyGoals];
    const newItem: WeeklyChecklistItem = { item: 'New item', done: false };
    updated[goalIndex] = {
      ...updated[goalIndex],
      checklist: [...updated[goalIndex].checklist, newItem]
    };
    setRoadmap(prev => ({ ...prev, weeklyGoals: updated }));
  };

  const removeChecklistItem = (goalIndex: number, itemIndex: number) => {
    const updated = [...roadmap.weeklyGoals];
    updated[goalIndex] = {
      ...updated[goalIndex],
      checklist: updated[goalIndex].checklist.filter((_, i) => i !== itemIndex)
    };
    setRoadmap(prev => ({ ...prev, weeklyGoals: updated }));
  };

  const toggleChecklistItem = (index: number) => {
    const updated = [...roadmap.checklist];
    updated[index] = { ...updated[index], done: !updated[index].done };
    setRoadmap(prev => ({ ...prev, checklist: updated }));
  };

  const addChecklistCategoryItem = () => {
    const newItem: ChecklistItem = {
      id: `c-${Date.now()}`,
      item: 'New task',
      done: false,
      category: 'General'
    };
    setRoadmap(prev => ({ ...prev, checklist: [...prev.checklist, newItem] }));
  };

  const removeChecklistCategoryItem = (index: number) => {
    setRoadmap(prev => ({ ...prev, checklist: prev.checklist.filter((_, i) => i !== index) }));
  };

  const handleCreateGoal = async () => {
    setIsCreating(true);
    try {
      const completionDate = calculateCompletionDate(roadmap.overview.estimatedWeeks);
      const goal = await createGoal({
        title: `Win: ${opportunity.title}`,
        description: aiSummary,
        category: opportunity.category,
        deadline: completionDate,
        priority: roadmap.overview.difficulty === 'Hard' ? 'high' : roadmap.overview.difficulty === 'Medium' ? 'medium' : 'low',
        source: 'custom',
        progress: 0
      });
      onComplete(goal.id, roadmap);
      success('Goal created! Your roadmap is ready.');
    } catch (error) {
      console.error('Failed to create goal:', error);
    } finally {
      setIsCreating(false);
    }
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'Easy': return 'text-green-600 bg-green-100 dark:bg-green-900/30 dark:text-green-400';
      case 'Medium': return 'text-yellow-600 bg-yellow-100 dark:bg-yellow-900/30 dark:text-yellow-400';
      case 'Hard': return 'text-red-600 bg-red-100 dark:bg-red-900/30 dark:text-red-400';
      default: return 'text-blue-600 bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400';
    }
  };

  const completionDate = calculateCompletionDate(roadmap.overview.estimatedWeeks);
  const completedChecklistCount = roadmap.checklist.filter(c => c.done).length;
  const checklistProgress = roadmap.checklist.length > 0 ? Math.round((completedChecklistCount / roadmap.checklist.length) * 100) : 0;

  const groupedChecklist = roadmap.checklist.reduce<Record<string, ChecklistItem[]>>((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {});

  const steps = [
    { number: 1, label: 'Overview', icon: Sparkles },
    { number: 2, label: 'Milestones', icon: Flag },
    { number: 3, label: 'Weekly Goals', icon: Calendar },
    { number: 4, label: 'Checklist', icon: ListChecks },
    { number: 5, label: 'Review', icon: Eye }
  ];

  const renderStepContent = () => {
    switch (step) {
      case 1:
        return (
          <div className="space-y-6">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-gradient-to-br from-primary to-accent rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Sparkles size={32} className="text-white" />
              </div>
              <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-2">AI-Generated Roadmap</h2>
              <p className="text-gray-600 dark:text-gray-400">Personalized preparation path for "{opportunity.title}"</p>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <Card className="text-center dark:bg-gray-800 dark:border-gray-700">
                <div className="text-2xl font-bold text-primary">{roadmap.overview.totalMilestones}</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Milestones</div>
              </Card>
              <Card className="text-center dark:bg-gray-800 dark:border-gray-700">
                <div className="text-2xl font-bold text-accent">{roadmap.overview.estimatedWeeks}</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Weeks</div>
              </Card>
              <Card className="text-center dark:bg-gray-800 dark:border-gray-700">
                <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${getDifficultyColor(roadmap.overview.difficulty)}`}>
                  {roadmap.overview.difficulty}
                </span>
                <div className="text-sm text-gray-600 dark:text-gray-400 mt-2">Difficulty</div>
              </Card>
            </div>

            <Card className="dark:bg-gray-800 dark:border-gray-700">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles size={18} className="text-primary" />
                <h3 className="font-semibold text-gray-800 dark:text-white">Your Preparation Path</h3>
              </div>
              <p className="text-gray-600 dark:text-gray-300 leading-relaxed text-sm">{aiSummary}</p>
            </Card>

            <Card className="dark:bg-gray-800 dark:border-gray-700">
              <h3 className="font-semibold text-gray-800 dark:text-white mb-3">Milestone Preview</h3>
              <div className="space-y-2">
                {roadmap.milestones.slice(0, 3).map((m, i) => (
                  <div key={m.id} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-xl">
                    <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center text-primary font-bold text-sm">
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-800 dark:text-white text-sm">{m.title}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">Week {m.week} • {m.tasks.length} tasks</div>
                    </div>
                  </div>
                ))}
                {roadmap.milestones.length > 3 && (
                  <div className="text-center text-sm text-gray-500 dark:text-gray-400">
                    +{roadmap.milestones.length - 3} more milestones
                  </div>
                )}
              </div>
            </Card>
          </div>
        );

      case 2:
        return (
          <div className="space-y-6">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-2">Milestones</h2>
              <p className="text-gray-600 dark:text-gray-400">Edit and customize your key milestones</p>
            </div>

            <div className="space-y-4">
              {roadmap.milestones.map((milestone, mIndex) => (
                <Card key={milestone.id} className="dark:bg-gray-800 dark:border-gray-700">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3 flex-1">
                      <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center text-white font-bold">
                        {mIndex + 1}
                      </div>
                      <div className="flex-1">
                        <input
                          type="text"
                          value={milestone.title}
                          onChange={(e) => updateMilestone(mIndex, { title: e.target.value })}
                          className="w-full font-semibold text-gray-800 dark:text-white bg-transparent border-none focus:outline-none focus:ring-0"
                        />
                        <div className="flex items-center gap-2">
                          <Clock size={12} className="text-gray-400" />
                          <span className="text-xs text-gray-500 dark:text-gray-400">Week</span>
                          <input
                            type="number"
                            value={milestone.week}
                            onChange={(e) => updateMilestone(mIndex, { week: parseInt(e.target.value) || 1 })}
                            className="w-12 text-xs bg-gray-100 dark:bg-gray-600 rounded px-2 py-1 border-none focus:outline-none focus:ring-1 focus:ring-primary dark:text-white"
                          />
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => removeMilestone(mIndex)}
                      className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>

                  <input
                    type="text"
                    value={milestone.description}
                    onChange={(e) => updateMilestone(mIndex, { description: e.target.value })}
                    className="w-full text-sm text-gray-600 dark:text-gray-300 bg-transparent border-none focus:outline-none focus:ring-0 mb-3"
                  />

                  <div className="space-y-2">
                    {milestone.tasks.map((task, tIndex) => (
                      <div key={task.id} className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-700 rounded-lg">
                        <div className="flex-1 min-w-0">
                          <input
                            type="text"
                            value={task.title}
                            onChange={(e) => updateMilestoneTask(mIndex, tIndex, { title: e.target.value })}
                            className="w-full text-sm font-medium text-gray-800 dark:text-white bg-transparent border-none focus:outline-none focus:ring-0"
                          />
                          <input
                            type="text"
                            value={task.description}
                            onChange={(e) => updateMilestoneTask(mIndex, tIndex, { description: e.target.value })}
                            className="w-full text-xs text-gray-500 dark:text-gray-400 bg-transparent border-none focus:outline-none focus:ring-0"
                          />
                        </div>
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            value={task.duration}
                            onChange={(e) => updateMilestoneTask(mIndex, tIndex, { duration: e.target.value })}
                            className="w-16 text-xs bg-white dark:bg-gray-600 rounded px-2 py-1 border border-gray-200 dark:border-gray-500 focus:outline-none focus:ring-1 focus:ring-primary dark:text-white"
                          />
                          <button
                            onClick={() => removeTaskFromMilestone(mIndex, tIndex)}
                            className="p-1 text-red-400 hover:text-red-600 transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                    <button
                      onClick={() => addTaskToMilestone(mIndex)}
                      className="flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition-colors"
                    >
                      <Plus size={14} />
                      Add Task
                    </button>
                  </div>
                </Card>
              ))}
            </div>

            <button
              onClick={addMilestone}
              className="w-full flex items-center justify-center gap-2 p-4 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-2xl text-gray-500 dark:text-gray-400 hover:border-primary hover:text-primary transition-colors"
            >
              <Plus size={20} />
              Add Milestone
            </button>
          </div>
        );

      case 3:
        return (
          <div className="space-y-6">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-2">Weekly Goals</h2>
              <p className="text-gray-600 dark:text-gray-400">Track your progress week by week</p>
            </div>

            <div className="space-y-4">
              {roadmap.weeklyGoals.map((wg, index) => (
                <Card key={index} className="dark:bg-gray-800 dark:border-gray-700">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 bg-accent rounded-full flex items-center justify-center text-white font-bold text-sm">
                      W{wg.week}
                    </div>
                    <div className="flex-1">
                      <input
                        type="text"
                        value={wg.goal}
                        onChange={(e) => updateWeeklyGoal(index, { goal: e.target.value })}
                        className="w-full font-medium text-gray-800 dark:text-white bg-transparent border-none focus:outline-none focus:ring-0"
                      />
                    </div>
                  </div>

                  <div className="space-y-2 ml-12">
                    {wg.checklist.map((item, itemIndex) => (
                      <div key={itemIndex} className="flex items-center gap-2">
                        <button
                          onClick={() => updateChecklistItem(index, itemIndex, { done: !item.done })}
                          className="flex-shrink-0"
                        >
                          {item.done ? (
                            <CheckCircle2 size={18} className="text-green-500" />
                          ) : (
                            <Circle size={18} className="text-gray-400" />
                          )}
                        </button>
                        <input
                          type="text"
                          value={item.item}
                          onChange={(e) => updateChecklistItem(index, itemIndex, { item: e.target.value })}
                          className={`flex-1 text-sm bg-transparent border-none focus:outline-none focus:ring-0 ${item.done ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-700 dark:text-gray-300'}`}
                        />
                        <button
                          onClick={() => removeChecklistItem(index, itemIndex)}
                          className="p-1 text-red-400 hover:text-red-600 transition-colors flex-shrink-0"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() => addChecklistItem(index)}
                      className="flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition-colors"
                    >
                      <Plus size={14} />
                      Add item
                    </button>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        );

      case 4:
        return (
          <div className="space-y-6">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-2">Preparation Checklist</h2>
              <p className="text-gray-600 dark:text-gray-400">All tasks grouped by category</p>
            </div>

            <div className="mb-4">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Progress</span>
                <span className="text-sm font-bold text-primary">{checklistProgress}%</span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div
                  className="bg-gradient-to-r from-primary to-accent h-2 rounded-full transition-all duration-300"
                  style={{ width: `${checklistProgress}%` }}
                />
              </div>
            </div>

            {Object.entries(groupedChecklist).map(([category, items]) => {
              const categoryIcons: Record<string, React.ReactNode> = {
                'Documents': <FileText size={18} className="text-blue-500" />,
                'Skills': <Zap size={18} className="text-yellow-500" />,
                'Applications': <Target size={18} className="text-green-500" />,
                'Interview Prep': <Trophy size={18} className="text-purple-500" />
              };

              return (
                <Card key={category} className="dark:bg-gray-800 dark:border-gray-700">
                  <div className="flex items-center gap-2 mb-3">
                    {categoryIcons[category] || <ListChecks size={18} className="text-gray-500" />}
                    <h3 className="font-semibold text-gray-800 dark:text-white">{category}</h3>
                    <span className="ml-auto text-xs text-gray-500 dark:text-gray-400">
                      {items.filter(i => i.done).length}/{items.length}
                    </span>
                  </div>

                  <div className="space-y-2">
                    {items.map((item) => {
                      const originalIndex = roadmap.checklist.findIndex(c => c.id === item.id);
                      return (
                        <div key={item.id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                          <button
                            onClick={() => toggleChecklistItem(originalIndex)}
                            className="flex-shrink-0"
                          >
                            {item.done ? (
                              <CheckCircle2 size={20} className="text-green-500" />
                            ) : (
                              <Circle size={20} className="text-gray-400 hover:text-primary transition-colors" />
                            )}
                          </button>
                          <input
                            type="text"
                            value={item.item}
                            onChange={(e) => {
                              const updated = [...roadmap.checklist];
                              updated[originalIndex] = { ...updated[originalIndex], item: e.target.value };
                              setRoadmap(prev => ({ ...prev, checklist: updated }));
                            }}
                            className={`flex-1 text-sm bg-transparent border-none focus:outline-none focus:ring-0 ${item.done ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-700 dark:text-gray-300'}`}
                          />
                          <button
                            onClick={() => removeChecklistCategoryItem(originalIndex)}
                            className="p-1 text-red-400 hover:text-red-600 transition-colors flex-shrink-0"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              );
            })}

            <button
              onClick={addChecklistCategoryItem}
              className="w-full flex items-center justify-center gap-2 p-4 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-2xl text-gray-500 dark:text-gray-400 hover:border-primary hover:text-primary transition-colors"
            >
              <Plus size={20} />
              Add Task
            </button>
          </div>
        );

      case 5:
        return (
          <div className="space-y-6">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Trophy size={32} className="text-white" />
              </div>
              <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-2">Ready to Start!</h2>
              <p className="text-gray-600 dark:text-gray-400">Review your roadmap and create your goal</p>
            </div>

            <Card className="dark:bg-gray-800 dark:border-gray-700 bg-gradient-to-r from-primary/5 to-accent/5 dark:from-primary/10 dark:to-accent/10">
              <div className="flex items-center gap-3 mb-3">
                <Target size={20} className="text-primary" />
                <div>
                  <h3 className="font-semibold text-gray-800 dark:text-white">Win: {opportunity.title}</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{opportunity.organization}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 mt-4">
                <div className="p-3 bg-white/50 dark:bg-gray-700/50 rounded-xl">
                  <div className="text-xs text-gray-500 dark:text-gray-400">Duration</div>
                  <div className="font-medium text-gray-800 dark:text-white">{roadmap.overview.estimatedWeeks} weeks</div>
                </div>
                <div className="p-3 bg-white/50 dark:bg-gray-700/50 rounded-xl">
                  <div className="text-xs text-gray-500 dark:text-gray-400">Est. Completion</div>
                  <div className="font-medium text-gray-800 dark:text-white">{completionDate}</div>
                </div>
                <div className="p-3 bg-white/50 dark:bg-gray-700/50 rounded-xl">
                  <div className="text-xs text-gray-500 dark:text-gray-400">Milestones</div>
                  <div className="font-medium text-gray-800 dark:text-white">{roadmap.overview.totalMilestones}</div>
                </div>
                <div className="p-3 bg-white/50 dark:bg-gray-700/50 rounded-xl">
                  <div className="text-xs text-gray-500 dark:text-gray-400">Difficulty</div>
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${getDifficultyColor(roadmap.overview.difficulty)}`}>
                    {roadmap.overview.difficulty}
                  </span>
                </div>
              </div>
            </Card>

            <Card className="dark:bg-gray-800 dark:border-gray-700">
              <h3 className="font-semibold text-gray-800 dark:text-white mb-3">Milestone Summary</h3>
              <div className="space-y-2">
                {roadmap.milestones.map((m, i) => (
                  <div key={m.id} className="flex items-center gap-3 p-2 bg-gray-50 dark:bg-gray-700 rounded-lg">
                    <div className="w-6 h-6 bg-primary/10 rounded-full flex items-center justify-center text-primary font-bold text-xs">
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-800 dark:text-white truncate">{m.title}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">Week {m.week}</div>
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">{m.tasks.length} tasks</div>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="dark:bg-gray-800 dark:border-gray-700">
              <h3 className="font-semibold text-gray-800 dark:text-white mb-3">Checklist Progress</h3>
              <div className="space-y-2">
                {Object.entries(groupedChecklist).slice(0, 4).map(([category, items]) => {
                  const done = items.filter(i => i.done).length;
                  const total = items.length;
                  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
                  return (
                    <div key={category}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-700 dark:text-gray-300">{category}</span>
                        <span className="text-gray-500 dark:text-gray-400">{done}/{total}</span>
                      </div>
                      <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-1.5">
                        <div className="bg-primary h-1.5 rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

            <Card className="dark:bg-gray-800 dark:border-gray-700 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border-green-200 dark:border-green-800">
              <div className="flex items-center gap-3 mb-3">
                <Sparkles size={20} className="text-green-600 dark:text-green-400" />
                <h3 className="font-semibold text-gray-800 dark:text-white">What happens next?</h3>
              </div>
              <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-300">
                <li className="flex items-center gap-2">
                  <CheckCircle2 size={14} className="text-green-500" />
                  <span>A goal will be created with this roadmap</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 size={14} className="text-green-500" />
                  <span>Track progress week by week</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 size={14} className="text-green-500" />
                  <span>Get smart reminders for deadlines</span>
                </li>
              </ul>
            </Card>

            <Button
              onClick={handleCreateGoal}
              disabled={isCreating}
              className="w-full py-4 text-lg"
            >
              {isCreating ? (
                <>
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Creating Goal...
                </>
              ) : (
                <>
                  <Trophy size={20} />
                  Create Goal & Start
                </>
              )}
            </Button>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className={`min-h-screen bg-white dark:bg-gray-900 animate-fade-in ${isDarkMode ? 'dark' : ''}`}>
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
              <h1 className="text-lg font-bold text-gray-800 dark:text-white">AI Roadmap Wizard</h1>
              <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-1">{opportunity.title}</p>
            </div>
            <div className="text-sm font-medium text-primary">Step {step}/5</div>
          </div>

          <div className="flex items-center gap-1 mb-2">
            {steps.map((s) => {
              const Icon = s.icon;
              return (
                <div key={s.number} className="flex-1 flex items-center">
                  <div className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg transition-all ${
                    s.number === step
                      ? 'bg-primary/10 text-primary'
                      : s.number < step
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500'
                  }`}>
                    <Icon size={14} />
                    <span className="text-xs font-medium hidden sm:inline">{s.label}</span>
                  </div>
                  {s.number < 5 && (
                    <div className={`flex-1 h-0.5 mx-1 rounded ${
                      s.number < step ? 'bg-green-400' : 'bg-gray-200 dark:bg-gray-600'
                    }`} />
                  )}
                </div>
              );
            })}
          </div>

          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1">
            <div
              className="bg-gradient-to-r from-primary to-accent h-1 rounded-full transition-all duration-300"
              style={{ width: `${(step / 5) * 100}%` }}
            />
          </div>
        </div>
      </div>

      <div className="p-4">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={step}
            custom={direction}
            variants={stepVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.2, ease: 'easeInOut' }}
          >
            {renderStepContent()}
          </motion.div>
        </AnimatePresence>

        {step < 5 && (
          <div className="flex gap-3 mt-6 pb-4">
            <Button
              variant="secondary"
              onClick={handleBack}
              className="flex-1 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
            >
              <ArrowLeft size={16} />
              Back
            </Button>
            <Button
              onClick={handleNext}
              className="flex-1"
            >
              Continue
              <ArrowRight size={16} />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default AIRoadmapWizard;
