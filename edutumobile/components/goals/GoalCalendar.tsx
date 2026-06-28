import React, { useRef, useState, useMemo } from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    Modal,
    Pressable,
    StyleSheet,
    Dimensions,
} from 'react-native';
import { CalendarDays, X, Map, Target, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import type { Goal } from '@edutu/core/src/hooks/useGoals';

const { width } = Dimensions.get('window');

const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// ─── Helpers ────────────────────────────────────────────────────────────────
function isSameDay(a: Date, b: Date) {
    return a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate();
}

function startOfMonth(year: number, month: number) {
    return new Date(year, month, 1);
}

function daysInMonth(year: number, month: number) {
    return new Date(year, month + 1, 0).getDate();
}

// ─── Types ──────────────────────────────────────────────────────────────────
interface CalendarEvent {
    type: 'goal' | 'roadmap' | 'opportunity';
    color: string;
    title: string;
    date: Date;
    opportunityId?: string;
}

interface OpportunityDeadline {
    id: string;
    title: string;
    closeDate: string;
}

interface Props {
    goals: Goal[];
    opportunities?: OpportunityDeadline[];
}

// ─── Main Component ─────────────────────────────────────────────────────────
export function GoalCalendar({ goals, opportunities = [] }: Props) {
    const { colors, isDark } = useTheme();
    const [showModal, setShowModal] = useState(false);
    const [selectedDate, setSelectedDate] = useState<Date>(new Date());
    const [calMonth, setCalMonth] = useState(() => {
        const n = new Date();
        return { year: n.getFullYear(), month: n.getMonth() };
    });
    const stripRef = useRef<ScrollView>(null);

    const events: CalendarEvent[] = useMemo(() => {
        const goalEvents: CalendarEvent[] = goals
            .filter(g => g.deadline)
            .map(g => ({
                type: g.source === 'imported' ? 'roadmap' : 'goal',
                color: g.source === 'imported' ? '#f59e0b' : colors.accent,
                title: g.title,
                date: new Date(g.deadline!),
            }));

        const oppEvents: CalendarEvent[] = opportunities
            .filter(o => o.closeDate)
            .map(o => ({
                type: 'opportunity',
                color: '#14b8a6',
                title: `Deadline: ${o.title}`,
                date: new Date(o.closeDate),
                opportunityId: o.id,
            }));

        return [...goalEvents, ...oppEvents].sort((a, b) => a.date.getTime() - b.date.getTime());
    }, [goals, opportunities, colors.accent]);

    const eventsOnDay = (d: Date) => events.filter(e => isSameDay(e.date, d));

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const stripDays: Date[] = useMemo(() => {
        return Array.from({ length: 30 }, (_, i) => {
            const d = new Date(today);
            d.setDate(today.getDate() + i);
            return d;
        });
    }, []);

    const textSecondary = isDark ? '#94a3b8' : '#64748b';
    const cardBg = isDark ? 'rgba(255,255,255,0.04)' : '#ffffff';
    const borderColor = isDark ? 'rgba(255,255,255,0.08)' : '#e2e8f0';

    const StripDay = ({ date }: { date: Date }) => {
        const dayEvents = eventsOnDay(date);
        const isSelected = isSameDay(date, selectedDate);
        const isToday = isSameDay(date, today);

        return (
            <TouchableOpacity
                onPress={() => { setSelectedDate(date); setShowModal(true); }}
                style={[
                    styles.stripDay,
                    { backgroundColor: cardBg, borderColor },
                    isSelected && { backgroundColor: colors.accent, borderColor: colors.accent },
                    isToday && !isSelected && { borderColor: colors.accent, borderWidth: 2 },
                ]}
                activeOpacity={0.8}
            >
                <Text style={[
                    styles.stripDayName,
                    { color: isSelected ? 'rgba(255,255,255,0.8)' : textSecondary }
                ]}>
                    {DAYS_SHORT[date.getDay()]}
                </Text>
                <Text style={[
                    styles.stripDayNum,
                    { color: isSelected ? 'white' : colors.foreground },
                    isToday && !isSelected && { color: colors.accent },
                ]}>
                    {date.getDate()}
                </Text>
                <View style={styles.dotRow}>
                    {dayEvents.slice(0, 3).map((e, i) => (
                        <View key={i} style={[styles.dot, { backgroundColor: e.color }]} />
                    ))}
                </View>
            </TouchableOpacity>
        );
    };

    const FullCalendar = () => {
        const { year, month } = calMonth;
        const firstDay = startOfMonth(year, month).getDay();
        const totalDays = daysInMonth(year, month);

        const gridCells: (number | null)[] = [
            ...Array(firstDay).fill(null),
            ...Array.from({ length: totalDays }, (_, i) => i + 1),
        ];

        const selectedEvents = eventsOnDay(selectedDate);

        const prevMonth = () => setCalMonth(prev => {
            const d = new Date(prev.year, prev.month - 1, 1);
            return { year: d.getFullYear(), month: d.getMonth() };
        });

        const nextMonth = () => setCalMonth(prev => {
            const d = new Date(prev.year, prev.month + 1, 1);
            return { year: d.getFullYear(), month: d.getMonth() };
        });

        return (
            <View style={styles.fullCal}>
                <View style={styles.monthNav}>
                    <TouchableOpacity onPress={prevMonth} style={styles.navBtn}>
                        <ChevronLeft size={20} color={colors.foreground} />
                    </TouchableOpacity>
                    <Text style={[styles.monthTitle, { color: colors.foreground }]}>
                        {MONTHS[month]} {year}
                    </Text>
                    <TouchableOpacity onPress={nextMonth} style={styles.navBtn}>
                        <ChevronRight size={20} color={colors.foreground} />
                    </TouchableOpacity>
                </View>

                <View style={styles.weekRow}>
                    {DAYS_SHORT.map(d => (
                        <Text key={d} style={[styles.weekLabel, { color: textSecondary }]}>{d}</Text>
                    ))}
                </View>

                <View style={styles.dayGrid}>
                    {gridCells.map((day, idx) => {
                        if (!day) return <View key={idx} style={styles.gridCell} />;
                        const cellDate = new Date(year, month, day);
                        const cellEvents = eventsOnDay(cellDate);
                        const isCellSelected = isSameDay(cellDate, selectedDate);
                        const isToday = isSameDay(cellDate, today);
                        return (
                            <TouchableOpacity
                                key={idx}
                                style={[
                                    styles.gridCell,
                                    isCellSelected && { backgroundColor: colors.accent, borderRadius: 12 },
                                    isToday && !isCellSelected && { borderWidth: 2, borderColor: colors.accent, borderRadius: 12 }
                                ]}
                                onPress={() => setSelectedDate(cellDate)}
                            >
                                <Text style={[
                                    styles.gridDayNum,
                                    { color: isCellSelected ? 'white' : colors.foreground },
                                    isToday && !isCellSelected && { color: colors.accent, fontWeight: '700' }
                                ]}>
                                    {day}
                                </Text>
                                <View style={styles.dotRow}>
                                    {cellEvents.slice(0, 2).map((e, i) => (
                                        <View key={i} style={[styles.dot, { backgroundColor: e.color }]} />
                                    ))}
                                </View>
                            </TouchableOpacity>
                        );
                    })}
                </View>

                {selectedEvents.length > 0 ? (
                    <View style={[styles.eventList, { borderTopColor: borderColor }]}>
                        <Text style={[styles.eventListTitle, { color: colors.foreground }]}>
                            {selectedDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
                        </Text>
                        {selectedEvents.map((e, i) => (
                            <View key={i} style={[styles.eventItem, { backgroundColor: `${e.color}08` }]}>
                                <View style={[styles.eventDot, { backgroundColor: e.color }]} />
                                <View style={styles.eventInfo}>
                                    <View style={[styles.eventBadge, { backgroundColor: `${e.color}15` }]}>
                                        <Text style={[styles.eventBadgeText, { color: e.color }]}>
                                            {e.type === 'roadmap' ? 'ROADMAP' : e.type === 'opportunity' ? 'OPPORTUNITY' : 'GOAL'}
                                        </Text>
                                    </View>
                                    <Text style={[styles.eventTitle, { color: colors.foreground }]} numberOfLines={2}>
                                        {e.title}
                                    </Text>
                                </View>
                            </View>
                        ))}
                    </View>
                ) : (
                    <View style={[styles.eventList, { borderTopColor: borderColor }]}>
                        <Text style={[styles.eventListTitle, { color: colors.foreground }]}>
                            {selectedDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
                        </Text>
                        <Text style={{ color: textSecondary, fontSize: 13, textAlign: 'center', paddingVertical: 8 }}>
                            No goals or deadlines on this day.
                        </Text>
                    </View>
                )}
            </View>
        );
    };

    return (
        <>
            <View style={styles.stripWrapper}>
                <ScrollView
                    ref={stripRef}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.stripScroll}
                >
                    {stripDays.map((d, i) => <StripDay key={i} date={d} />)}
                </ScrollView>
                <TouchableOpacity
                    onPress={() => { setSelectedDate(today); setShowModal(true); }}
                    style={[styles.calIconBtn, { backgroundColor: cardBg, borderColor }]}
                >
                    <CalendarDays size={20} color={colors.accent} />
                </TouchableOpacity>
            </View>

            <Modal
                visible={showModal}
                transparent
                animationType="slide"
                onRequestClose={() => setShowModal(false)}
            >
                <Pressable style={styles.modalBackdrop} onPress={() => setShowModal(false)} />
                <View style={[styles.modalSheet, { backgroundColor: isDark ? '#0F172A' : '#FFFFFF' }]}>
                    <View style={styles.dragHandle} />
                    <View style={styles.modalHeader}>
                        <Text style={[styles.modalTitle, { color: colors.foreground }]}>My Calendar</Text>
                        <TouchableOpacity onPress={() => setShowModal(false)} style={styles.closeBtn}>
                            <X size={20} color={textSecondary} />
                        </TouchableOpacity>
                    </View>
                    <View style={styles.legend}>
                        <View style={styles.legendItem}>
                            <View style={[styles.legendDot, { backgroundColor: colors.accent }]} />
                            <Text style={{ color: textSecondary, fontSize: 12 }}>Personal Goal</Text>
                        </View>
                        <View style={styles.legendItem}>
                            <View style={[styles.legendDot, { backgroundColor: '#f59e0b' }]} />
                            <Text style={{ color: textSecondary, fontSize: 12 }}>Roadmap</Text>
                        </View>
                        <View style={styles.legendItem}>
                            <View style={[styles.legendDot, { backgroundColor: '#14b8a6' }]} />
                            <Text style={{ color: textSecondary, fontSize: 12 }}>Opportunity</Text>
                        </View>
                    </View>
                    <ScrollView showsVerticalScrollIndicator={false}>
                        <FullCalendar />
                        <View style={{ height: 40 }} />
                    </ScrollView>
                </View>
            </Modal>
        </>
    );
}

const CELL_SIZE = Math.floor((width - 48) / 7);

const styles = StyleSheet.create({
    stripWrapper: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
    stripScroll: { paddingRight: 8 },
    stripDay: {
        width: 56,
        height: 80,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 8,
        paddingVertical: 6,
        borderWidth: 1,
    },
    stripDayName: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', marginBottom: 4 },
    stripDayNum: { fontSize: 18, fontWeight: '800', marginBottom: 6 },
    dotRow: { flexDirection: 'row', gap: 3, height: 6 },
    dot: { width: 5, height: 5, borderRadius: 3 },
    calIconBtn: {
        width: 48,
        height: 48,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        marginLeft: 4,
        borderWidth: 1,
    },

    modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
    modalSheet: {
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        paddingHorizontal: 20,
        paddingTop: 12,
        maxHeight: '90%',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -6 },
        shadowOpacity: 0.2,
        shadowRadius: 16,
        elevation: 20,
    },
    dragHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(128,128,128,0.3)', alignSelf: 'center', marginBottom: 16 },
    modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
    modalTitle: { fontSize: 20, fontWeight: '800' },
    closeBtn: { padding: 6 },
    legend: { flexDirection: 'row', gap: 16, marginBottom: 16 },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    legendDot: { width: 8, height: 8, borderRadius: 4 },

    fullCal: { paddingBottom: 8 },
    monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
    navBtn: { padding: 8 },
    monthTitle: { fontSize: 18, fontWeight: '700' },
    weekRow: { flexDirection: 'row', marginBottom: 8 },
    weekLabel: { width: CELL_SIZE, textAlign: 'center', fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
    dayGrid: { flexDirection: 'row', flexWrap: 'wrap' },
    gridCell: {
        width: CELL_SIZE,
        height: CELL_SIZE,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 4,
    },
    gridDayNum: { fontSize: 14, fontWeight: '600', marginBottom: 2 },

    eventList: { marginTop: 20, borderTopWidth: 1, paddingTop: 16 },
    eventListTitle: { fontSize: 15, fontWeight: '700', marginBottom: 14 },
    eventItem: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        padding: 14,
        borderRadius: 14,
        marginBottom: 10,
    },
    eventDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4, marginRight: 12 },
    eventInfo: { flex: 1 },
    eventBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, alignSelf: 'flex-start', marginBottom: 6 },
    eventBadgeText: { fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
    eventTitle: { fontSize: 14, fontWeight: '600', lineHeight: 20 },
});
