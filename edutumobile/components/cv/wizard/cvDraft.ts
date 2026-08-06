import type React from 'react';
import type { CVData, CVHeader, UserCV } from '@edutu/core/src/types/cv';

/**
 * Mutation helpers shared by every wizard step.
 *
 * Extracted from the old monolithic editor so each step component only knows
 * about its own fields — the steps never reach into the CV shape directly.
 */

export type CVDraftSetter = React.Dispatch<React.SetStateAction<Partial<UserCV>>>;

/** Repeatable sections the wizard can add to and remove from. */
export type RepeatableSection = 'experience' | 'education' | 'projects' | 'achievements';

export const EMPTY_CV_DATA: CVData = {
    header: { full_name: '', email: '' },
    summary: '',
    experience: [],
    education: [],
    skills: [],
    projects: [],
    achievements: [],
};

export function normalizeHeader(header?: CVData['header']): CVHeader {
    const safe: CVHeader = header ?? EMPTY_CV_DATA.header!;
    return { ...safe, full_name: safe.full_name || '', email: safe.email || '' };
}

export function createLocalId(prefix: string): string {
    return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function updateHeaderField(setCV: CVDraftSetter, key: keyof CVHeader, value: string) {
    setCV((prev) => ({
        ...prev,
        data_json: {
            ...EMPTY_CV_DATA,
            ...prev.data_json,
            header: { ...normalizeHeader(prev.data_json?.header), [key]: value },
        },
    }));
}

export function updateDataField<K extends keyof CVData>(
    setCV: CVDraftSetter,
    key: K,
    value: CVData[K],
) {
    setCV((prev) => ({
        ...prev,
        data_json: { ...EMPTY_CV_DATA, ...prev.data_json, [key]: value },
    }));
}

export function updateArrayItem(
    setCV: CVDraftSetter,
    section: RepeatableSection,
    id: string,
    field: string,
    value: unknown,
) {
    setCV((prev) => ({
        ...prev,
        data_json: {
            ...EMPTY_CV_DATA,
            ...prev.data_json,
            [section]: (((prev.data_json as any)?.[section]) || []).map((item: any) =>
                item.id === id ? { ...item, [field]: value } : item,
            ),
        },
    }));
}

function blankItem(section: RepeatableSection) {
    switch (section) {
        case 'experience':
            return {
                id: createLocalId('exp'),
                company: '', role: '', start_date: '', end_date: '',
                current: false, location: '', description: '', highlights: [],
            };
        case 'education':
            return {
                id: createLocalId('edu'),
                institution: '', degree: '', field: '',
                start_date: '', end_date: '', gpa: undefined, highlights: [],
            };
        case 'projects':
            return {
                id: createLocalId('proj'),
                name: '', description: '', url: '',
                technologies: [], start_date: '', end_date: '',
            };
        case 'achievements':
        default:
            return { id: createLocalId('ach'), title: '', description: '', date: '', issuer: '' };
    }
}

/** Returns the new item's id so the caller can scroll to or focus it. */
export function addItem(setCV: CVDraftSetter, section: RepeatableSection): string {
    const item = blankItem(section);
    setCV((prev) => ({
        ...prev,
        data_json: {
            ...EMPTY_CV_DATA,
            ...prev.data_json,
            [section]: [...(((prev.data_json as any)?.[section]) || []), item as never],
        },
    }));
    return item.id;
}

export function removeItem(setCV: CVDraftSetter, section: RepeatableSection, id: string) {
    setCV((prev) => ({
        ...prev,
        data_json: {
            ...EMPTY_CV_DATA,
            ...prev.data_json,
            [section]: (((prev.data_json as any)?.[section]) || []).filter(
                (item: any) => item.id !== id,
            ),
        },
    }));
}

/** Re-insert a removed item at its original position, for undo. */
export function restoreItem(
    setCV: CVDraftSetter,
    section: RepeatableSection,
    item: any,
    index: number,
) {
    setCV((prev) => {
        const list = [...((((prev.data_json as any)?.[section]) || []) as any[])];
        list.splice(Math.min(index, list.length), 0, item);
        return {
            ...prev,
            data_json: { ...EMPTY_CV_DATA, ...prev.data_json, [section]: list },
        };
    });
}
