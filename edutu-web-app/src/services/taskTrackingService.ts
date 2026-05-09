// src/services/taskTrackingService.ts

export interface CompletedTask {
  id: string;
  title: string;
  completedAt: string;
  source: 'opportunity-roadmap' | 'goal' | 'cv-workshop' | 'community-marketplace' | 'other';
  metadata?: Record<string, unknown>;
}

const TASK_STORAGE_KEY = 'edutu_completed_tasks';

export const taskTrackingService = {
  // Get all completed tasks for the user
  getCompletedTasks: (): CompletedTask[] => {
    if (typeof window === 'undefined') {
      return [];
    }

    try {
      const tasks = localStorage.getItem(TASK_STORAGE_KEY);
      return tasks ? JSON.parse(tasks) : [];
    } catch (error) {
      console.error('Error loading completed tasks:', error);
      return [];
    }
  },

  // Save completed tasks to localStorage
  saveCompletedTasks: (tasks: CompletedTask[]) => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      localStorage.setItem(TASK_STORAGE_KEY, JSON.stringify(tasks));
    } catch (error) {
      console.error('Error saving completed tasks:', error);
    }
  },

  // Add a completed task
  addCompletedTask: (task: Omit<CompletedTask, 'completedAt'>): CompletedTask => {
    const completedTask: CompletedTask = {
      ...task,
      completedAt: new Date().toISOString()
    };

    const tasks = taskTrackingService.getCompletedTasks();
    // Check if this task ID already exists to avoid duplicates
    const existingIndex = tasks.findIndex(t => t.id === task.id);
    if (existingIndex !== -1) {
      // Update the existing task instead of adding a duplicate
      tasks[existingIndex] = completedTask;
    } else {
      tasks.unshift(completedTask); // Add to the beginning of the list
    }

    // Keep only the most recent 50 tasks to prevent storage bloat
    const limitedTasks = tasks.slice(0, 50);
    taskTrackingService.saveCompletedTasks(limitedTasks);

    return completedTask;
  },

  // Get recent completed tasks (last 30 days)
  getRecentCompletedTasks: (limit: number = 5): CompletedTask[] => {
    const tasks = taskTrackingService.getCompletedTasks();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    return tasks
      .filter(task => new Date(task.completedAt) >= thirtyDaysAgo)
      .slice(0, limit);
  },

  // Remove completed task (for cases where tasks are uncompleted)
  removeCompletedTask: (taskId: string) => {
    const tasks = taskTrackingService.getCompletedTasks();
    const filteredTasks = tasks.filter(task => task.id !== taskId);
    taskTrackingService.saveCompletedTasks(filteredTasks);
  }
};