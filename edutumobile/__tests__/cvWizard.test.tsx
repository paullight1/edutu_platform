import React, { useState } from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import type { UserCV } from '@edutu/core/src/types/cv';
import { CVWizard } from '../components/cv/wizard/CVWizard';

// Same convention as the other mobile screen tests: the real ThemeProvider
// renders null until AsyncStorage resolves, so the hook is mocked directly.
jest.mock('../components/context/ThemeContext', () => ({
    useTheme: () => ({
        isDark: false,
        colors: {
            background: '#FFFFFF',
            foreground: '#111827',
            card: '#FFFFFF',
            border: '#E5E7EB',
            primary: '#2563EB',
            accent: '#2563EB',
            accentLight: '#60A5FA',
            mutedForeground: '#64748B',
        },
    }),
}));

jest.mock('../lib/haptics', () => ({
    haptics: {
        light: jest.fn(), medium: jest.fn(), heavy: jest.fn(),
        selection: jest.fn(), success: jest.fn(), none: jest.fn(),
    },
}));

const alertSpy = jest.spyOn(Alert, 'alert');

/** Confirms the destructive-action dialog by invoking its "Remove" button. */
function confirmDelete() {
    const buttons = alertSpy.mock.calls.at(-1)?.[2] as { text: string; onPress?: () => void }[];
    const confirm = buttons.find((button) => button.text === 'Remove');
    act(() => {
        confirm?.onPress?.();
    });
}

function Harness({
    initial,
    onSave = jest.fn(),
    onPreview = jest.fn(),
}: {
    initial?: Partial<UserCV>;
    onSave?: () => void;
    onPreview?: () => void;
}) {
    const [cv, setCv] = useState<Partial<UserCV>>(
        initial ?? { name: 'My CV', template_id: 'modern-professional', data_json: {} },
    );
    return (
        <CVWizard
                currentCV={cv}
                setCurrentCV={setCv}
                template={{ id: 'modern-professional', name: 'Modern Professional' } as never}
                isPro={false}
                isSaving={false}
                onSave={onSave}
                onPreview={onPreview}
                onBack={jest.fn()}
                onAITailor={jest.fn()}
                onUpgradeFeature={jest.fn()}
            onChangeTemplate={jest.fn()}
        />
    );
}

function press(node: any) {
    let current = node;
    while (current && !current.props?.onPress) current = current.parent;
    if (!current) throw new Error('no pressable ancestor');
    act(() => {
        current.props.onPress();
    });
}

describe('CV wizard', () => {
    beforeEach(() => {
        alertSpy.mockClear().mockImplementation(() => undefined);
    });

    it('opens on the first step and shows the step counter', async () => {
        const { getByText } = render(<Harness />);
        await waitFor(() => expect(getByText('Your details')).toBeTruthy());
        expect(getByText('Step 1 of 5')).toBeTruthy();
        expect(getByText('Next')).toBeTruthy();
    });

    it('blocks Next until a full name is entered, then advances', async () => {
        const { getByText, queryByText, getByPlaceholderText } = render(<Harness />);
        await waitFor(() => expect(getByText('Your details')).toBeTruthy());

        press(getByText('Next'));
        // Still on step one, with the reason shown inline.
        expect(getByText('Step 1 of 5')).toBeTruthy();
        expect(
            getByText('Add your full name — it is the first thing a reviewer looks for.'),
        ).toBeTruthy();

        fireEvent.changeText(getByPlaceholderText('John Doe'), 'Amina Okafor');
        press(getByText('Next'));

        await waitFor(() => expect(getByText('Step 2 of 5')).toBeTruthy());
        expect(queryByText('Back')).toBeTruthy();
    });

    it('flags an invalid email without blocking progress', async () => {
        const { getByText, getByPlaceholderText } = render(<Harness />);
        await waitFor(() => expect(getByText('Your details')).toBeTruthy());

        fireEvent.changeText(getByPlaceholderText('John Doe'), 'Amina Okafor');
        fireEvent.changeText(getByPlaceholderText('john@example.com'), 'nope');
        press(getByText('Next'));

        // Soft validation: the warning shows but the step still advances.
        await waitFor(() => expect(getByText('Step 2 of 5')).toBeTruthy());
    });

    it('walks back to the previous step', async () => {
        const { getByText, getByLabelText } = render(<Harness />);
        await waitFor(() => expect(getByText('Your details')).toBeTruthy());

        press(getByLabelText('Experience'));
        await waitFor(() => expect(getByText('Step 3 of 5')).toBeTruthy());

        press(getByText('Back'));
        await waitFor(() => expect(getByText('Step 2 of 5')).toBeTruthy());
    });

    it('jumps to any step from its progress dot', async () => {
        const { getByText, getByLabelText } = render(<Harness />);
        await waitFor(() => expect(getByText('Your details')).toBeTruthy());

        press(getByLabelText('Projects & awards'));
        await waitFor(() => expect(getByText('Step 5 of 5')).toBeTruthy());
        expect(getByText('Preview & Save')).toBeTruthy();
    });

    it('saves and opens the preview from the final step', async () => {
        const onSave = jest.fn();
        const onPreview = jest.fn();
        const { getByText, getByLabelText } = render(
            <Harness onSave={onSave} onPreview={onPreview} />,
        );
        await waitFor(() => expect(getByText('Your details')).toBeTruthy());

        press(getByLabelText('Projects & awards'));
        await waitFor(() => expect(getByText('Preview & Save')).toBeTruthy());
        press(getByText('Preview & Save'));

        expect(onSave).toHaveBeenCalled();
        expect(onPreview).toHaveBeenCalled();
    });

    it('adds skills as chips and removes one on tap', async () => {
        const { getByText, getByLabelText, getByPlaceholderText, queryByText } = render(<Harness />);
        await waitFor(() => expect(getByText('Your details')).toBeTruthy());

        press(getByLabelText('Summary & skills'));
        await waitFor(() => expect(getByText('Step 2 of 5')).toBeTruthy());

        const input = getByPlaceholderText('Type a skill, then comma');
        // A trailing comma commits the skill; the text still being typed never
        // gets split — the bug the old comma-joined field had.
        fireEvent.changeText(input, 'SQL,');
        await waitFor(() => expect(getByText('SQL')).toBeTruthy());

        fireEvent.changeText(input, 'Python,');
        await waitFor(() => expect(getByText('Python')).toBeTruthy());

        press(getByLabelText('Remove SQL'));
        await waitFor(() => expect(queryByText('SQL')).toBeNull());
        expect(getByText('Python')).toBeTruthy();
    });

    it('confirms before deleting an entry, then restores it from the undo snackbar', async () => {
        const initial: Partial<UserCV> = {
            name: 'My CV',
            template_id: 'modern-professional',
            data_json: {
                experience: [
                    {
                        id: 'exp-1',
                        role: 'Analyst',
                        company: 'Paystack',
                        start_date: '2023-01',
                        description: '',
                    },
                ],
            },
        };
        const { getByText, getByLabelText, queryByText } = render(<Harness initial={initial} />);
        await waitFor(() => expect(getByText('Your details')).toBeTruthy());

        press(getByLabelText('Experience'));
        await waitFor(() => expect(getByText('Analyst')).toBeTruthy());

        // The trash icon asks first — it used to destroy the entry outright.
        press(getByLabelText('Remove Analyst'));
        expect(alertSpy).toHaveBeenCalledWith(
            'Remove this entry?',
            expect.stringContaining('Analyst'),
            expect.any(Array),
        );
        expect(getByText('Analyst')).toBeTruthy();

        confirmDelete();
        await waitFor(() => expect(queryByText('Analyst')).toBeNull());

        // ...and the removal stays undoable for a few seconds.
        expect(getByText('Removed "Analyst"')).toBeTruthy();
        press(getByLabelText('Undo'));
        await waitFor(() => expect(getByText('Analyst')).toBeTruthy());
    });

    it('reports a health score that improves as the CV is filled in', async () => {
        const empty = render(<Harness />);
        await waitFor(() => expect(empty.getByText('Your details')).toBeTruthy());
        const emptyScore = Number(empty.getByLabelText(/CV health score/).props.accessibilityLabel
            .match(/(\d+) out of/)[1]);

        const filled = render(
            <Harness
                initial={{
                    name: 'My CV',
                    data_json: {
                        header: { full_name: 'Amina Okafor', email: 'amina@example.com', phone: '+234' },
                        summary: 'Product analyst with three years of experience in fintech growth work.',
                        skills: ['SQL', 'Python', 'Looker', 'Comms', 'Experiments'],
                        experience: [
                            {
                                id: 'e1', role: 'Analyst', company: 'Paystack', start_date: '2023-01',
                                end_date: '2025-01', description: 'Cut churn by 12%.',
                            },
                        ],
                        education: [{ id: 'ed1', institution: 'UNILAG', degree: 'BSc' }],
                    },
                }}
            />,
        );
        await waitFor(() => expect(filled.getByText('Your details')).toBeTruthy());
        const filledScore = Number(filled.getByLabelText(/CV health score/).props.accessibilityLabel
            .match(/(\d+) out of/)[1]);

        expect(filledScore).toBeGreaterThan(emptyScore);
    });
});
