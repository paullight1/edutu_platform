import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Flag,
  Bookmark,
  Send,
  Clock
} from 'lucide-react';
import { useDarkMode } from '../hooks/useDarkMode';
import { Goal } from '../hooks/useGoals';
import { BookmarkRecord } from '../services/bookmarks';
import { ApplicationRecord } from '../services/applications';

interface CalendarEvent {
  id: string;
  title: string;
  type: 'goal' | 'bookmark' | 'application';
  deadline: string;
  category: string;
  daysUntil: number;
}

interface CalendarStripProps {
  goals: Goal[];
  bookmarks: BookmarkRecord[];
  applications: ApplicationRecord[];
  onDateClick?: (date: Date) => void;
  onEventClick?: (event: CalendarEvent) => void;
}

interface CalendarDay {
  date: Date;
  isToday: boolean;
  isSelected: boolean;
  isCurrentWeek: boolean;
  events: CalendarEvent[];
  label: string;
  dayName: string;
  dayNumber: number;
}

function getDaysUntil(deadline: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(deadline);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function isSameDay(d1: Date, d2: Date): boolean {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

function formatDeadlineShort(deadline: string): string {
  const d = new Date(deadline);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const CalendarStrip: React.FC<CalendarStripProps> = ({
  goals,
  bookmarks,
  applications,
  onDateClick,
  onEventClick
}) => {
  const { isDarkMode } = useDarkMode();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [weekOffset, setWeekOffset] = useState(0);

  const currentWeekStart = useMemo(() => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const start = new Date(today);
    start.setDate(today.getDate() - dayOfWeek + (weekOffset * 7));
    start.setHours(0, 0, 0, 0);
    return start;
  }, [weekOffset]);

  const events = useMemo<CalendarEvent[]>(() => {
    const result: CalendarEvent[] = [];

    goals.forEach((goal) => {
      if (goal.deadline && goal.status === 'active') {
        result.push({
          id: goal.id,
          title: goal.title,
          type: 'goal',
          deadline: goal.deadline,
          category: goal.category || 'Goal',
          daysUntil: getDaysUntil(goal.deadline)
        });
      }
    });

    bookmarks.forEach((bookmark) => {
      if (bookmark.opportunity_deadline) {
        result.push({
          id: bookmark.id,
          title: bookmark.opportunity_title,
          type: 'bookmark',
          deadline: bookmark.opportunity_deadline,
          category: bookmark.opportunity_category,
          daysUntil: getDaysUntil(bookmark.opportunity_deadline)
        });
      }
    });

    applications.forEach((app) => {
      const deadlineFromApp = (app as any).deadline;
      if (deadlineFromApp) {
        result.push({
          id: app.id,
          title: app.opportunity_title,
          type: 'application',
          deadline: deadlineFromApp,
          category: app.opportunity_category,
          daysUntil: getDaysUntil(deadlineFromApp)
        });
      }
    });

    return result;
  }, [goals, bookmarks, applications]);

  const calendarDays = useMemo<CalendarDay[]>(() => {
    const days: CalendarDay[] = [];
    const today = new Date();

    for (let i = 0; i < 7; i++) {
      const date = new Date(currentWeekStart);
      date.setDate(currentWeekStart.getDate() + i);

      const dayEvents = events.filter((event) => {
        const eventDate = new Date(event.deadline);
        return isSameDay(eventDate, date);
      });

      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

      days.push({
        date,
        isToday: isSameDay(date, today),
        isSelected: isSameDay(date, selectedDate),
        isCurrentWeek: weekOffset === 0,
        events: dayEvents,
        label: `${monthNames[date.getMonth()]} ${date.getDate()}`,
        dayName: dayNames[date.getDay()],
        dayNumber: date.getDate()
      });
    }

    return days;
  }, [currentWeekStart, selectedDate, events, weekOffset]);

  const selectedDayEvents = useMemo(() => {
    return calendarDays.find((d) => d.isSelected)?.events ?? [];
  }, [calendarDays]);

  const upcomingDeadlines = useMemo(() => {
    return events
      .filter((e) => e.daysUntil >= 0 && e.daysUntil <= 3)
      .sort((a, b) => a.daysUntil - b.daysUntil)
      .slice(0, 5);
  }, [events]);

  const handleDateClick = (day: CalendarDay) => {
    setSelectedDate(day.date);
    onDateClick?.(day.date);
  };

  const handlePrevWeek = () => setWeekOffset((prev) => prev - 1);
  const handleNextWeek = () => setWeekOffset((prev) => prev + 1);

  const getEventIcon = (type: CalendarEvent['type']) => {
    switch (type) {
      case 'goal':
        return <Flag size={14} className="text-brand-500" />;
      case 'bookmark':
        return <Bookmark size={14} className="text-amber-500" />;
      case 'application':
        return <Send size={14} className="text-emerald-500" />;
    }
  };

  const getDotColor = (type: CalendarEvent['type']) => {
    switch (type) {
      case 'goal':
        return 'bg-brand-500';
      case 'bookmark':
        return 'bg-amber-500';
      case 'application':
        return 'bg-emerald-500';
    }
  };

  const hasEventsOnDate = (day: CalendarDay) => day.events.length > 0;

  const weekLabel = useMemo(() => {
    if (weekOffset === 0) return 'This Week';
    if (weekOffset === 1) return 'Next Week';
    if (weekOffset === -1) return 'Last Week';
    const start = calendarDays[0]?.date;
    const end = calendarDays[6]?.date;
    if (!start || !end) return '';
    return `${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
  }, [weekOffset, calendarDays]);

  return (
    <div className="space-y-4">
      <div className={`premium-card p-4 md:p-5 ${isDarkMode ? 'bg-gray-900' : 'bg-white'}`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Calendar size={18} className={isDarkMode ? 'text-slate-400' : 'text-slate-600'} />
            <h3 className="text-sm font-bold tracking-wider">
              {weekLabel}
            </h3>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={handlePrevWeek}
              className={`p-1.5 rounded-lg transition-colors ${isDarkMode ? 'hover:bg-white/10 text-slate-400' : 'hover:bg-slate-100 text-slate-600'}`}
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={handleNextWeek}
              className={`p-1.5 rounded-lg transition-colors ${isDarkMode ? 'hover:bg-white/10 text-slate-400' : 'hover:bg-slate-100 text-slate-600'}`}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        <div className="flex gap-1.5 md:gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {calendarDays.map((day, index) => (
            <motion.button
              key={index}
              onClick={() => handleDateClick(day)}
              whileTap={{ scale: 0.95 }}
              className={`flex-1 min-w-[44px] md:min-w-[56px] flex flex-col items-center gap-1.5 py-2.5 px-1 md:px-2 rounded-xl transition-all relative ${
                day.isSelected
                  ? isDarkMode
                    ? 'bg-brand-500/20 border border-brand-500/40'
                    : 'bg-brand-50 border border-brand-200'
                  : day.isToday
                  ? isDarkMode
                    ? 'bg-white/10 border border-white/20'
                    : 'bg-slate-100 border border-slate-200'
                  : isDarkMode
                  ? 'hover:bg-white/5 border border-transparent'
                  : 'hover:bg-slate-50 border border-transparent'
              }`}
            >
              {day.isToday && !day.isSelected && (
                <div className="absolute top-1.5 w-1 h-1 rounded-full bg-brand-500" />
              )}
              <span className={`text-[10px] font-bold tracking-wider ${
                day.isSelected
                  ? 'text-brand-500'
                  : day.isToday
                  ? isDarkMode ? 'text-brand-400' : 'text-brand-600'
                  : isDarkMode ? 'text-slate-500' : 'text-slate-400'
              }`}>
                {day.dayName}
              </span>
              <span className={`text-lg font-display font-bold ${
                day.isSelected
                  ? 'text-brand-500'
                  : day.isToday
                  ? isDarkMode ? 'text-white' : 'text-slate-900'
                  : isDarkMode ? 'text-slate-300' : 'text-slate-700'
              }`}>
                {day.dayNumber}
              </span>
              <div className="flex gap-0.5 h-2.5 items-center">
                {hasEventsOnDate(day) && day.events.slice(0, 3).map((event, i) => (
                  <div
                    key={i}
                    className={`w-1.5 h-1.5 rounded-full ${getDotColor(event.type)}`}
                  />
                ))}
                {day.events.length > 3 && (
                  <span className="text-[8px] font-bold text-slate-400">+{day.events.length - 3}</span>
                )}
              </div>
            </motion.button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {selectedDayEvents.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="mt-4 pt-4 border-t border-slate-100 dark:border-white/5"
            >
              <p className="text-[10px] font-bold tracking-widest text-slate-400 mb-3">
                Events for {selectedDate.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}
              </p>
              <div className="space-y-2">
                {selectedDayEvents.map((event) => (
                  <motion.button
                    key={event.id}
                    whileHover={{ x: 4 }}
                    onClick={() => onEventClick?.(event)}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-colors ${
                      isDarkMode ? 'hover:bg-white/5' : 'hover:bg-slate-50'
                    }`}
                  >
                    {getEventIcon(event.type)}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold truncate text-slate-900 dark:text-white">
                        {event.title}
                      </p>
                      <p className="text-[10px] font-bold text-slate-400 tracking-wider">
                        {event.category}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 text-[10px] font-bold">
                      <Clock size={10} className="text-slate-400" />
                      <span className={
                        event.daysUntil === 0
                          ? 'text-rose-500'
                          : event.daysUntil <= 2
                          ? 'text-amber-500'
                          : isDarkMode ? 'text-slate-400' : 'text-slate-500'
                      }>
                        {event.daysUntil === 0 ? 'Today' : event.daysUntil === 1 ? 'Tomorrow' : `${event.daysUntil}d`}
                      </span>
                    </div>
                  </motion.button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {upcomingDeadlines.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <div className="flex items-center gap-2 mb-3 px-1">
            <Clock size={14} className="text-rose-500" />
            <h4 className="text-xs font-bold tracking-widest text-slate-500 dark:text-slate-400">
              Upcoming Deadlines
            </h4>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
              isDarkMode ? 'bg-rose-500/20 text-rose-400' : 'bg-rose-50 text-rose-600'
            }`}>
              {upcomingDeadlines.length}
            </span>
          </div>
          <div className="space-y-2">
            {upcomingDeadlines.map((event, index) => (
              <motion.button
                key={event.id}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                whileHover={{ x: 4 }}
                onClick={() => onEventClick?.(event)}
                className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all ${
                  isDarkMode
                    ? 'bg-gray-900/50 hover:bg-gray-900 border border-white/5'
                    : 'bg-white hover:bg-slate-50 border border-slate-100 shadow-sm'
                }`}
              >
                <div className={`p-2 rounded-lg ${
                  event.type === 'goal'
                    ? 'bg-brand-500/10 text-brand-500'
                    : event.type === 'bookmark'
                    ? 'bg-amber-500/10 text-amber-500'
                    : 'bg-emerald-500/10 text-emerald-500'
                }`}>
                  {getEventIcon(event.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate text-slate-900 dark:text-white">
                    {event.title}
                  </p>
                  <p className="text-[10px] font-bold text-slate-400 tracking-wider">
                    {event.category}
                  </p>
                </div>
                <div className={`px-3 py-1.5 rounded-lg text-[10px] font-black tracking-wider ${
                  event.daysUntil === 0
                    ? 'bg-rose-500/10 text-rose-500'
                    : event.daysUntil === 1
                    ? 'bg-amber-500/10 text-amber-500'
                    : isDarkMode
                    ? 'bg-white/5 text-slate-400'
                    : 'bg-slate-100 text-slate-500'
                }`}>
                  {event.daysUntil === 0 ? 'Today' : event.daysUntil === 1 ? 'Tomorrow' : formatDeadlineShort(event.deadline)}
                </div>
              </motion.button>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
};

export type { CalendarEvent };
export default CalendarStrip;
