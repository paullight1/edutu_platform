import React, { useState, useEffect } from 'react';
import { ArrowLeft, Trophy, CheckCircle2, Target, FileText, Globe, Award, Filter } from 'lucide-react';
import Button from './ui/Button';
import Card from './ui/Card';
import { useDarkMode } from '../hooks/useDarkMode';
import { taskTrackingService, CompletedTask } from '../services/taskTrackingService';

interface AchievementsScreenProps {
  onBack: () => void;
}

const AchievementsScreen: React.FC<AchievementsScreenProps> = ({ onBack }) => {
  const { isDarkMode } = useDarkMode();
  const [allAchievements, setAllAchievements] = useState<CompletedTask[]>([]);
  const [filteredAchievements, setFilteredAchievements] = useState<CompletedTask[]>([]);
  const [filter, setFilter] = useState<'all' | CompletedTask['source']>('all');
  const [timeFilter, setTimeFilter] = useState<'all' | 'week' | 'month'>('all');

  useEffect(() => {
    const tasks = taskTrackingService.getCompletedTasks(50); // Get more tasks for this page
    setAllAchievements(tasks);
    setFilteredAchievements(tasks);
  }, []);

  useEffect(() => {
    let result = [...allAchievements];

    // Apply source filter
    if (filter !== 'all') {
      result = result.filter(task => task.source === filter);
    }

    // Apply time filter
    if (timeFilter !== 'all') {
      const now = new Date();
      let cutoffDate: Date;

      if (timeFilter === 'week') {
        cutoffDate = new Date(now.setDate(now.getDate() - 7));
      } else { // month
        cutoffDate = new Date();
        cutoffDate.setMonth(cutoffDate.getMonth() - 1);
      }

      result = result.filter(task => new Date(task.completedAt) >= cutoffDate);
    }

    setFilteredAchievements(result);
  }, [filter, timeFilter, allAchievements]);

  const getSourceIcon = (source: CompletedTask['source']) => {
    switch (source) {
      case 'opportunity-roadmap':
        return <Target size={16} className="text-blue-500" />;
      case 'goal':
        return <CheckCircle2 size={16} className="text-green-500" />;
      case 'cv-workshop':
        return <FileText size={16} className="text-purple-500" />;
      case 'community-marketplace':
        return <Globe size={16} className="text-amber-500" />;
      default:
        return <Award size={16} className="text-gray-500" />;
    }
  };

  const getSourceLabel = (source: CompletedTask['source']) => {
    switch (source) {
      case 'opportunity-roadmap':
        return 'Roadmap';
      case 'goal':
        return 'Goal';
      case 'cv-workshop':
        return 'CV Workshop';
      case 'community-marketplace':
        return 'Community';
      default:
        return 'Other';
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return 'Today';
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  return (
    <div className={`min-h-screen bg-white dark:bg-gray-900 ${isDarkMode ? 'dark' : ''}`}>
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-4 dark:border-gray-800 dark:bg-gray-900">
        <Button
          variant="secondary"
          onClick={onBack}
          className="p-2 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          <ArrowLeft size={20} />
        </Button>
        <div>
          <h1 className="text-xl font-semibold text-gray-800 dark:text-white">Achievements</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            All your completed tasks and milestones
          </p>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="p-4">
        <Card className={`p-4 rounded-2xl ${isDarkMode ? 'bg-gray-800' : 'bg-gray-50'}`}>
          <div className="flex justify-between">
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">{allAchievements.length}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Total</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-500">
                {allAchievements.filter(a => a.source === 'opportunity-roadmap').length}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Roadmaps</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-500">
                {allAchievements.filter(a => a.source === 'goal').length}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Goals</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-500">
                {allAchievements.filter(a => a.source === 'cv-workshop').length}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">CV Tasks</div>
            </div>
          </div>
        </Card>
      </div>

      {/* Filters */}
      <div className="p-4">
        <Card className={`p-4 rounded-2xl ${isDarkMode ? 'bg-gray-800' : 'bg-gray-50'}`}>
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Filter by source:</h3>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-1.5 rounded-full text-xs font-medium ${
                filter === 'all'
                  ? 'bg-primary text-white'
                  : isDarkMode
                  ? 'bg-gray-700 text-gray-300'
                  : 'bg-gray-200 text-gray-700'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilter('opportunity-roadmap')}
              className={`px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1 ${
                filter === 'opportunity-roadmap'
                  ? 'bg-blue-500 text-white'
                  : isDarkMode
                  ? 'bg-gray-700 text-gray-300'
                  : 'bg-gray-200 text-gray-700'
              }`}
            >
              <Target size={12} /> Roadmaps
            </button>
            <button
              onClick={() => setFilter('goal')}
              className={`px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1 ${
                filter === 'goal'
                  ? 'bg-green-500 text-white'
                  : isDarkMode
                  ? 'bg-gray-700 text-gray-300'
                  : 'bg-gray-200 text-gray-700'
              }`}
            >
              <CheckCircle2 size={12} /> Goals
            </button>
            <button
              onClick={() => setFilter('cv-workshop')}
              className={`px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1 ${
                filter === 'cv-workshop'
                  ? 'bg-purple-500 text-white'
                  : isDarkMode
                  ? 'bg-gray-700 text-gray-300'
                  : 'bg-gray-200 text-gray-700'
              }`}
            >
              <FileText size={12} /> CV Tasks
            </button>
          </div>

          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mt-3 mb-2">Time period:</h3>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setTimeFilter('all')}
              className={`px-3 py-1.5 rounded-full text-xs font-medium ${
                timeFilter === 'all'
                  ? 'bg-primary text-white'
                  : isDarkMode
                  ? 'bg-gray-700 text-gray-300'
                  : 'bg-gray-200 text-gray-700'
              }`}
            >
              All time
            </button>
            <button
              onClick={() => setTimeFilter('week')}
              className={`px-3 py-1.5 rounded-full text-xs font-medium ${
                timeFilter === 'week'
                  ? 'bg-primary text-white'
                  : isDarkMode
                  ? 'bg-gray-700 text-gray-300'
                  : 'bg-gray-200 text-gray-700'
              }`}
            >
              Last 7 days
            </button>
            <button
              onClick={() => setTimeFilter('month')}
              className={`px-3 py-1.5 rounded-full text-xs font-medium ${
                timeFilter === 'month'
                  ? 'bg-primary text-white'
                  : isDarkMode
                  ? 'bg-gray-700 text-gray-300'
                  : 'bg-gray-200 text-gray-700'
              }`}
            >
              Last 30 days
            </button>
          </div>
        </Card>
      </div>

      {/* Achievements List */}
      <div className="p-4 space-y-3">
        {filteredAchievements.length === 0 ? (
          <div className="text-center py-10">
            <Trophy size={48} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
            <h3 className="text-lg font-medium text-gray-800 dark:text-gray-200">No achievements yet</h3>
            <p className="text-gray-500 dark:text-gray-400 mt-1">
              Complete tasks in roadmaps, goals, and other areas to see them here.
            </p>
          </div>
        ) : (
          filteredAchievements.map((achievement) => (
            <Card
              key={achievement.id}
              className={`p-4 rounded-2xl flex items-start gap-3 ${
                isDarkMode ? 'bg-gray-800' : 'bg-white'
              }`}
            >
              <div className="flex-shrink-0 mt-0.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                  {getSourceIcon(achievement.source)}
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className={`font-medium truncate ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>
                  {achievement.title}
                </h3>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    isDarkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {getSourceLabel(achievement.source)}
                  </span>
                  <span className={`text-xs ${
                    isDarkMode ? 'text-gray-400' : 'text-gray-500'
                  }`}>
                    {formatDate(achievement.completedAt)}
                  </span>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
};

export default AchievementsScreen;