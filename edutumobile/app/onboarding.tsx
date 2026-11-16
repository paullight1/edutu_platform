import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import {
    ActivityIndicator,
    Alert,
    BackHandler,
    Dimensions,
    FlatList,
    Keyboard,
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useUser, useAuth } from '@clerk/clerk-expo'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import Animated, {
    FadeIn,
    FadeInUp,
    SlideInRight,
    SlideOutLeft,
    SlideInLeft,
    SlideOutRight,
} from 'react-native-reanimated'
import {
    ArrowRight,
    ChevronDown,
    Search,
    Rocket,
    Check,
    X,
    User,
    Building,
    Target,
    Award,
    ChevronLeft,
} from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { useTheme, type ThemeColors } from '../components/context/ThemeContext'
import { updateProfile } from '@edutu/core/src/services/profile'

import {
    COUNTRIES,
    GRADE_LEVELS as GRADE_LEVELS_DATA,
    INTERESTS as INTERESTS_DATA,
    AMBITIONS as AMBITIONS_DATA,
} from '../data/onboarding-data'
import type { Country } from '../data/onboarding-data'

const { width: SCREEN_WIDTH } = Dimensions.get('window')
const DRAFT_KEY = '@edutu/onboarding_draft'

// Theme-derived styles, computed via a hook in each component — replaces the
// previous module-level `styles` binding that OnboardingScreen assigned during
// render (a react-hooks/globals violation).
function useOnboardingStyles() {
    const { colors, isDark } = useTheme()
    return useMemo(() => getStyles(isDark, colors), [colors, isDark])
}

// `label`/`icon` hold i18n keys (auth namespace) translated at render time; `value` is the backend enum.
const DEGREE_PURSUITS = [
    { value: 'BSc', label: 'onboarding.profile.degrees.bachelors', icon: 'onboarding.profile.degrees.bachelorsAbbr' },
    { value: 'MSc', label: 'onboarding.profile.degrees.masters', icon: 'onboarding.profile.degrees.mastersAbbr' },
    { value: 'PhD', label: 'onboarding.profile.degrees.phd', icon: 'onboarding.profile.degrees.phdAbbr' },
    { value: 'Other', label: 'onboarding.profile.degrees.other', icon: 'onboarding.profile.degrees.otherAbbr' },
]

const NIGERIAN_UNIVERSITIES = [
    'University of Lagos', 'University of Ibadan', 'University of Abuja',
    'Lagos State University', 'Obafemi Awolowo University', 'University of Nigeria, Nsukka',
    'Federal University of Technology, Owerri', 'Ahmadu Bello University', 'Bayero University Kano',
    'University of Benin', 'University of Ilorin', 'University of Port Harcourt',
    'Covenant University', 'Babcock University', 'Redeemers University',
    'University of Education, Winneba', 'Nigerian Turkish International University',
    'Bingham University', 'Joseph Ayo Babalola University', 'Crescent University',
]

// `title` holds an i18n key (auth namespace) translated at render time.
const STEPS = [
    { id: 'profile', title: 'onboarding.steps.profile', icon: User },
    { id: 'education', title: 'onboarding.steps.education', icon: Building },
    { id: 'interests', title: 'onboarding.steps.interests', icon: Target },
    { id: 'welcome', title: 'onboarding.steps.welcome', icon: Rocket },
]

type FormData = {
    fullName: string
    selectedCountry: Country
    countryModal: boolean
    localPhone: string
    age: string
    degreePursuit: string | null
    isGraduate: string | null
    gradeLevel: string | null
    schoolName: string
    selectedInterests: string[]
    selectedAmbitions: string[]
}

/**
 * A short "why we ask this" note under each step header. Uses accent-tinted
 * surface + system colors so the onboarding reads as one coherent product.
 */
function WhyCard({ text }: { text: string }) {
    const styles = useOnboardingStyles()
    return (
        <View style={styles.whyCard}>
            <View style={styles.whyDot} />
            <Text style={styles.whyText}>{text}</Text>
        </View>
    )
}

function StepIndicator({ currentStep, totalSteps }: { currentStep: number; totalSteps: number }) {
    const styles = useOnboardingStyles()
    const steps = STEPS.slice(0, totalSteps)
    return (
        <View style={styles.stepIndicator}>
            {steps.map((step, index) => {
                const isActive = index === currentStep
                const isCompleted = index < currentStep
                const Icon = step.icon
                return (
                    <React.Fragment key={step.id}>
                        <View
                            style={[
                                styles.stepCircle,
                                isActive && styles.stepCircleActive,
                                isCompleted && styles.stepCircleCompleted,
                            ]}
                        >
                            {isCompleted ? (
                                <Check size={15} color="#FFFFFF" strokeWidth={3} />
                            ) : (
                                <Icon
                                    size={15}
                                    color={isActive ? '#FFFFFF' : styles._muted.color}
                                />
                            )}
                        </View>
                        {index < steps.length - 1 && (
                            <View
                                style={[
                                    styles.stepConnector,
                                    index < currentStep && styles.stepConnectorActive,
                                ]}
                            />
                        )}
                    </React.Fragment>
                )
            })}
        </View>
    )
}

/**
 * Full-screen, keyboard-safe country picker. The header + search bar are pinned
 * at the top and the list fills the rest, so the search field can never be
 * hidden behind the keyboard (the previous bottom-sheet + KeyboardAvoidingView
 * combo broke on Android). The list is padded by the live keyboard height so
 * every row stays reachable while typing.
 */
function CountryPickerModal({ visible, onClose, selectedCountry, onSelect, colors }: {
    visible: boolean
    onClose: () => void
    selectedCountry: Country
    onSelect: (c: Country) => void
    colors: ThemeColors
    isDark: boolean
}) {
    const styles = useOnboardingStyles()
    const { t } = useTranslation('auth')
    const insets = useSafeAreaInsets()
    const [search, setSearch] = useState('')
    const [kbHeight, setKbHeight] = useState(0)

    useEffect(() => {
        if (!visible) return
        const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow'
        const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide'
        const showSub = Keyboard.addListener(showEvt, (e) => setKbHeight(e.endCoordinates?.height ?? 0))
        const hideSub = Keyboard.addListener(hideEvt, () => setKbHeight(0))
        return () => {
            showSub.remove()
            hideSub.remove()
        }
    }, [visible])

    // Reset the query each time the sheet is dismissed so it opens clean —
    // adjust-during-render (React's documented reset-on-prop-change pattern).
    const [prevVisible, setPrevVisible] = useState(visible)
    if (prevVisible !== visible) {
        setPrevVisible(visible)
        if (!visible) setSearch('')
    }

    const filteredCountries = useMemo(() => {
        const q = search.trim().toLowerCase()
        if (!q) return COUNTRIES
        return COUNTRIES.filter(
            (c) => c.name.toLowerCase().includes(q) || c.dial.includes(q),
        )
    }, [search])

    const handleSelect = useCallback((country: Country) => {
        onSelect(country)
        Keyboard.dismiss()
        onClose()
    }, [onSelect, onClose])

    return (
        <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
            <View style={[styles.pickerScreen, { backgroundColor: colors.background, paddingTop: insets.top }]}>
                <View style={styles.pickerHeader}>
                    <TouchableOpacity onPress={onClose} style={styles.pickerCloseBtn} hitSlop={8}>
                        <X color={colors.foreground} size={22} />
                    </TouchableOpacity>
                    <Text style={styles.pickerTitle}>{t('onboarding.countryPicker.title')}</Text>
                    <View style={styles.pickerCloseBtn} />
                </View>

                <View style={styles.searchRow}>
                    <Search color={colors.textSecondary} size={18} />
                    <TextInput
                        value={search}
                        onChangeText={setSearch}
                        placeholder={t('onboarding.countryPicker.searchPlaceholder')}
                        placeholderTextColor={colors.textSecondary}
                        style={styles.searchInput}
                        returnKeyType="search"
                        autoCorrect={false}
                        autoFocus
                    />
                    {search.length > 0 && (
                        <TouchableOpacity onPress={() => setSearch('')} hitSlop={8}>
                            <X color={colors.textSecondary} size={16} />
                        </TouchableOpacity>
                    )}
                </View>

                <FlatList
                    data={filteredCountries}
                    keyExtractor={(item) => item.code}
                    style={styles.countryList}
                    contentContainerStyle={{ paddingBottom: kbHeight + insets.bottom + 24 }}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="on-drag"
                    initialNumToRender={20}
                    ListEmptyComponent={
                        <View style={styles.pickerEmpty}>
                            <Text style={styles.pickerEmptyText}>{t('onboarding.countryPicker.empty')}</Text>
                        </View>
                    }
                    renderItem={({ item }) => {
                        const isSelected = selectedCountry.code === item.code
                        return (
                            <TouchableOpacity
                                style={[styles.countryRow, isSelected && styles.countryRowSelected]}
                                onPress={() => handleSelect(item)}
                                activeOpacity={0.7}
                            >
                                <Text style={styles.flag}>{item.flag}</Text>
                                <Text style={styles.countryName}>{item.name}</Text>
                                <Text style={styles.dialCode}>{item.dial}</Text>
                                {isSelected && <Check color={colors.accent} size={18} />}
                            </TouchableOpacity>
                        )
                    }}
                />
            </View>
        </Modal>
    )
}

function StepHeader({ Icon, title, subtitle }: { Icon: any; title: string; subtitle: string }) {
    const styles = useOnboardingStyles()
    return (
        <View style={styles.stepHeader}>
            <View style={styles.stepIconBox}>
                <Icon color={styles._accent.color} size={26} />
            </View>
            <Text style={styles.stepTitle}>{title}</Text>
            <Text style={styles.stepSubtitle}>{subtitle}</Text>
        </View>
    )
}

function ProfileStep({ formData, setFormData }: { formData: FormData; setFormData: (u: Partial<FormData>) => void }) {
    const styles = useOnboardingStyles()
    const { t } = useTranslation('auth')
    const { fullName, selectedCountry, age, degreePursuit } = formData

    return (
        <Animated.View entering={FadeInUp.duration(360)} style={styles.contentContainer}>
            <StepHeader Icon={User} title={t('onboarding.profile.title')} subtitle={t('onboarding.profile.subtitle')} />
            <WhyCard text={t('onboarding.profile.why')} />

            <View style={styles.form}>
                <View style={styles.inputGroup}>
                    <Text style={styles.label}>{t('onboarding.profile.nameLabel')}</Text>
                    <View style={styles.inputContainer}>
                        <TextInput
                            value={fullName}
                            onChangeText={(text) => setFormData({ fullName: text })}
                            placeholder={t('onboarding.profile.namePlaceholder')}
                            placeholderTextColor={styles._muted.color}
                            style={styles.input}
                        />
                    </View>
                </View>

                <View style={styles.inputGroup}>
                    <Text style={styles.label}>{t('onboarding.profile.countryLabel')}</Text>
                    <TouchableOpacity
                        style={styles.pickerRow}
                        onPress={() => setFormData({ countryModal: true })}
                        activeOpacity={0.7}
                    >
                        <Text style={styles.flagLarge}>{selectedCountry.flag}</Text>
                        <Text style={styles.pickerText}>{selectedCountry.name}</Text>
                        <ChevronDown color={styles._muted.color} size={18} />
                    </TouchableOpacity>
                </View>

                <View style={styles.inputGroup}>
                    <Text style={styles.label}>
                        {t('onboarding.profile.ageLabel')} <Text style={styles.optionalLabel}>{t('onboarding.optional')}</Text>
                    </Text>
                    <View style={styles.inputContainer}>
                        <TextInput
                            value={age}
                            onChangeText={(text) => setFormData({ age: text.replace(/[^0-9]/g, '') })}
                            placeholder={t('onboarding.profile.agePlaceholder')}
                            placeholderTextColor={styles._muted.color}
                            style={styles.input}
                            keyboardType="number-pad"
                            maxLength={3}
                        />
                    </View>
                </View>

                <View style={styles.inputGroup}>
                    <Text style={styles.label}>
                        {t('onboarding.profile.degreeLabel')} <Text style={styles.optionalLabel}>{t('onboarding.optional')}</Text>
                    </Text>
                    <View style={styles.pursuitGrid}>
                        {DEGREE_PURSUITS.map((degree) => {
                            const isSelected = degreePursuit === degree.value
                            return (
                                <TouchableOpacity
                                    key={degree.value}
                                    style={[styles.pursuitCard, isSelected && styles.pursuitCardSelected]}
                                    onPress={() => setFormData({ degreePursuit: isSelected ? null : degree.value })}
                                    activeOpacity={0.7}
                                >
                                    <Text style={[styles.pursuitIcon, isSelected && styles.pursuitIconSelected]}>{t(degree.icon)}</Text>
                                    <Text style={[styles.pursuitLabel, isSelected && styles.pursuitLabelSelected]}>{t(degree.label)}</Text>
                                </TouchableOpacity>
                            )
                        })}
                    </View>
                </View>
            </View>
        </Animated.View>
    )
}

function EducationStep({ formData, setFormData }: { formData: FormData; setFormData: (u: Partial<FormData>) => void }) {
    const styles = useOnboardingStyles()
    const { t } = useTranslation('auth')
    const { isGraduate, gradeLevel, schoolName } = formData
    const [schoolDropdownVisible, setSchoolDropdownVisible] = useState(false)

    const filteredSchools = useMemo(() => {
        if (!schoolName.trim()) return NIGERIAN_UNIVERSITIES.slice(0, 10)
        return NIGERIAN_UNIVERSITIES.filter((s) => s.toLowerCase().includes(schoolName.toLowerCase())).slice(0, 8)
    }, [schoolName])

    return (
        <Animated.View entering={FadeInUp.duration(360)} style={styles.contentContainer}>
            <StepHeader Icon={Building} title={t('onboarding.education.title')} subtitle={t('onboarding.education.subtitle')} />
            <WhyCard text={t('onboarding.education.why')} />

            <View style={styles.form}>
                <View style={styles.inputGroup}>
                    <Text style={styles.label}>{t('onboarding.education.graduateQuestion')}</Text>
                    <View style={styles.yesNoRow}>
                        {(['yes', 'no'] as const).map((val) => {
                            const isSelected = isGraduate === val
                            return (
                                <TouchableOpacity
                                    key={val}
                                    style={[styles.yesNoBtn, isSelected && styles.yesNoBtnSelected]}
                                    onPress={() => setFormData({ isGraduate: val })}
                                    activeOpacity={0.7}
                                >
                                    <Text style={[styles.yesNoText, isSelected && styles.yesNoTextSelected]}>
                                        {t(`onboarding.education.${val}`)}
                                    </Text>
                                </TouchableOpacity>
                            )
                        })}
                    </View>
                </View>

                {isGraduate === 'no' && (
                    <Animated.View entering={FadeInUp.duration(260)}>
                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>{t('onboarding.education.gradeLevelLabel')}</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.gradeScroll}>
                                {GRADE_LEVELS_DATA.map((level) => {
                                    const isSelected = gradeLevel === level.value
                                    return (
                                        <TouchableOpacity
                                            key={level.value}
                                            style={[styles.gradeChip, isSelected && styles.gradeChipSelected]}
                                            onPress={() => setFormData({ gradeLevel: level.value })}
                                            activeOpacity={0.7}
                                        >
                                            <Text style={styles.gradeChipIcon}>{level.icon}</Text>
                                            <Text style={[styles.gradeChipText, isSelected && styles.gradeChipTextSelected]}>{level.label}</Text>
                                        </TouchableOpacity>
                                    )
                                })}
                            </ScrollView>
                        </View>
                    </Animated.View>
                )}

                <View style={styles.inputGroup}>
                    <Text style={styles.label}>
                        {t('onboarding.education.schoolLabel')} <Text style={styles.optionalLabel}>{t('onboarding.optional')}</Text>
                    </Text>
                    <View style={styles.schoolSearchContainer}>
                        <TextInput
                            value={schoolName}
                            onChangeText={(text) => {
                                setFormData({ schoolName: text })
                                setSchoolDropdownVisible(true)
                            }}
                            onFocus={() => setSchoolDropdownVisible(true)}
                            placeholder={t('onboarding.education.schoolPlaceholder')}
                            placeholderTextColor={styles._muted.color}
                            style={styles.schoolInput}
                        />
                        <TouchableOpacity style={styles.schoolDropdownToggle} onPress={() => setSchoolDropdownVisible((v) => !v)}>
                            <ChevronDown color={styles._muted.color} size={18} />
                        </TouchableOpacity>
                    </View>

                    {schoolDropdownVisible && filteredSchools.length > 0 && (
                        <View style={styles.schoolDropdown}>
                            <ScrollView style={styles.schoolDropdownList} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                                {filteredSchools.map((school, idx) => (
                                    <TouchableOpacity
                                        key={idx}
                                        style={styles.schoolOption}
                                        onPress={() => {
                                            setFormData({ schoolName: school })
                                            setSchoolDropdownVisible(false)
                                            Keyboard.dismiss()
                                        }}
                                    >
                                        <Building size={16} color={styles._muted.color} />
                                        <Text style={styles.schoolOptionText}>{school}</Text>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
                        </View>
                    )}
                </View>
            </View>
        </Animated.View>
    )
}

function InterestsStep({ formData, setFormData }: { formData: FormData; setFormData: (u: Partial<FormData>) => void }) {
    const styles = useOnboardingStyles()
    const { t } = useTranslation('auth')
    const { selectedInterests, selectedAmbitions } = formData

    const toggleInterest = useCallback((interest: string) => {
        setFormData({
            selectedInterests: selectedInterests.includes(interest)
                ? selectedInterests.filter((i) => i !== interest)
                : selectedInterests.length < 3 ? [...selectedInterests, interest] : selectedInterests,
        })
    }, [selectedInterests, setFormData])

    const toggleAmbition = useCallback((ambition: string) => {
        setFormData({
            selectedAmbitions: selectedAmbitions.includes(ambition)
                ? selectedAmbitions.filter((i) => i !== ambition)
                : selectedAmbitions.length < 2 ? [...selectedAmbitions, ambition] : selectedAmbitions,
        })
    }, [selectedAmbitions, setFormData])

    return (
        <Animated.View entering={FadeInUp.duration(360)} style={styles.contentContainer}>
            <StepHeader Icon={Target} title={t('onboarding.interests.title')} subtitle={t('onboarding.interests.subtitle')} />
            <WhyCard text={t('onboarding.interests.why')} />

            <View style={styles.form}>
                <View style={styles.inputGroup}>
                    <View style={styles.sectionHeaderRow}>
                        <Text style={styles.label}>{t('onboarding.interests.interestsLabel')}</Text>
                        <Text style={styles.limitText}>{selectedInterests.length}/3</Text>
                    </View>
                    <View style={styles.interestsGrid}>
                        {INTERESTS_DATA.map((interest) => {
                            const isSelected = selectedInterests.includes(interest)
                            return (
                                <TouchableOpacity
                                    key={interest}
                                    style={[styles.interestChip, isSelected && styles.interestChipSelected]}
                                    onPress={() => toggleInterest(interest)}
                                    activeOpacity={0.7}
                                >
                                    {isSelected && <Check size={14} color="#FFFFFF" strokeWidth={3} />}
                                    <Text style={[styles.interestChipText, isSelected && styles.interestChipTextSelected]}>{interest}</Text>
                                </TouchableOpacity>
                            )
                        })}
                    </View>
                </View>

                <View style={styles.inputGroup}>
                    <View style={styles.sectionHeaderRow}>
                        <Text style={styles.label}>{t('onboarding.interests.ambitionsLabel')}</Text>
                        <Text style={styles.limitText}>{selectedAmbitions.length}/2</Text>
                    </View>
                    <View style={styles.ambitionsGrid}>
                        {AMBITIONS_DATA.map((ambition) => {
                            const isSelected = selectedAmbitions.includes(ambition.value)
                            return (
                                <TouchableOpacity
                                    key={ambition.value}
                                    style={[styles.ambitionChip, isSelected && styles.ambitionChipSelected]}
                                    onPress={() => toggleAmbition(ambition.value)}
                                    activeOpacity={0.7}
                                >
                                    <Text style={styles.ambitionChipIcon}>{ambition.icon}</Text>
                                    <Text style={[styles.ambitionChipText, isSelected && styles.ambitionChipTextSelected]}>{ambition.label}</Text>
                                </TouchableOpacity>
                            )
                        })}
                    </View>
                </View>
            </View>
        </Animated.View>
    )
}

function WelcomeStep({ formData }: { formData: FormData }) {
    const styles = useOnboardingStyles()
    const { t } = useTranslation('auth')
    const hasProfile = formData.fullName.trim().length > 0

    const degreeKey = DEGREE_PURSUITS.find((d) => d.value === formData.degreePursuit)?.label
    const ambitionLabels = formData.selectedAmbitions
        .map((v) => AMBITIONS_DATA.find((a) => a.value === v)?.label)
        .filter(Boolean) as string[]
    const recapTags = [...formData.selectedInterests, ...ambitionLabels]

    const features = [
        { icon: Target, tint: styles._accent.color, text: t('onboarding.welcome.featureMatches') },
        { icon: Award, tint: styles._success.color, text: t('onboarding.welcome.featurePrograms') },
        { icon: Target, tint: styles._info.color, text: t('onboarding.welcome.featureCareer') },
    ]

    return (
        <Animated.View entering={FadeInUp.duration(360)} style={styles.welcomeContainer}>
            <View style={styles.welcomeContent}>
                <View style={styles.welcomeIconBox}>
                    <LinearGradient
                        colors={[styles._accentSoft.color, 'transparent']}
                        style={StyleSheet.absoluteFill}
                    />
                    <Rocket color={styles._accent.color} size={44} />
                </View>
                <Text style={styles.welcomeTitle}>
                    {hasProfile ? t('onboarding.welcome.titleNamed', { name: formData.fullName.trim().split(' ')[0] }) : t('onboarding.welcome.title')}
                </Text>
                <Text style={styles.welcomeSubtitle}>{t('onboarding.welcome.subtitle')}</Text>

                {(hasProfile || recapTags.length > 0) && (
                    <Animated.View entering={FadeInUp.delay(80).duration(320)} style={styles.recapCard}>
                        <Text style={styles.recapLabel}>{t('onboarding.welcome.recapLabel')}</Text>
                        {hasProfile && (
                            <View style={styles.recapHeaderRow}>
                                <Text style={styles.recapFlag}>{formData.selectedCountry.flag}</Text>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.recapName} numberOfLines={1}>
                                        {formData.fullName.trim()}
                                    </Text>
                                    <Text style={styles.recapMeta} numberOfLines={1}>
                                        {formData.selectedCountry.name}
                                        {degreeKey ? ` · ${t(degreeKey)}` : ''}
                                    </Text>
                                </View>
                            </View>
                        )}
                        {recapTags.length > 0 && (
                            <View style={styles.recapTags}>
                                {recapTags.map((tag, i) => (
                                    <View key={`${tag}-${i}`} style={styles.recapTag}>
                                        <Text style={styles.recapTagText}>{tag}</Text>
                                    </View>
                                ))}
                            </View>
                        )}
                    </Animated.View>
                )}

                <View style={styles.welcomeFeatures}>
                    {features.map((f, i) => (
                        <Animated.View key={i} entering={FadeInUp.delay(180 + i * 90).duration(320)} style={styles.featureItem}>
                            <View style={[styles.featureIcon, { backgroundColor: `${f.tint}22` }]}>
                                <f.icon size={20} color={f.tint} />
                            </View>
                            <Text style={styles.featureText}>{f.text}</Text>
                        </Animated.View>
                    ))}
                </View>
            </View>
        </Animated.View>
    )
}

export default function OnboardingScreen() {
    const { user, isLoaded } = useUser()
    const { getToken } = useAuth()
    const router = useRouter()
    const insets = useSafeAreaInsets()
    const { colors, isDark, reducedMotion } = useTheme()
    const { t } = useTranslation('auth')
    const styles = useOnboardingStyles()

    const [currentStep, setCurrentStep] = useState(0)
    // State (not a ref): the render-time entering/exiting animation choice
    // must not read a ref during render. Set alongside setCurrentStep in the
    // same event batch, so the render always sees a consistent pair.
    const [direction, setDirection] = useState<'forward' | 'back'>('forward')
    const hydratedRef = useRef(false)
    const [formData, setFormDataState] = useState<FormData>({
        fullName: '',
        selectedCountry: COUNTRIES[0],
        countryModal: false,
        localPhone: '',
        age: '',
        degreePursuit: null,
        isGraduate: null,
        gradeLevel: null,
        schoolName: '',
        selectedInterests: [],
        selectedAmbitions: [],
    })
    const [loading, setLoading] = useState(false)

    const setFormData = useCallback((updates: Partial<FormData>) => {
        setFormDataState((prev) => ({ ...prev, ...updates }))
    }, [])

    // Bounce unauthenticated users to sign-in.
    useEffect(() => {
        if (isLoaded && !user) router.replace('/(auth)/sign-in')
    }, [isLoaded, router, user])

    // Prefill from a previously saved draft (Clerk metadata, then AsyncStorage)
    // so a user who skipped and came back resumes exactly where they left off.
    useEffect(() => {
        if (hydratedRef.current || !isLoaded || !user) return
        hydratedRef.current = true
        const applyDraft = (d: Record<string, unknown> | null | undefined) => {
            if (!d) return
            const country = COUNTRIES.find((c) => c.code === d.countryCode || c.name === d.country)
            setFormData({
                fullName: typeof d.fullName === 'string' ? d.fullName : '',
                selectedCountry: country || COUNTRIES[0],
                localPhone: typeof d.phone === 'string' && typeof d.countryCode === 'string'
                    ? String(d.phone).replace(country?.dial || '', '')
                    : '',
                age: d.age != null ? String(d.age) : '',
                degreePursuit: (d.pursuit as string) ?? null,
                isGraduate: (d.isGraduate as string) ?? null,
                gradeLevel: (d.gradeLevel as string) ?? null,
                schoolName: typeof d.schoolName === 'string' ? d.schoolName : '',
                selectedInterests: Array.isArray(d.interests) ? (d.interests as string[]).filter((i) => i !== 'General') : [],
                selectedAmbitions: Array.isArray(d.ambitions) ? (d.ambitions as string[]) : [],
            })
        }
        const meta = user.unsafeMetadata as Record<string, unknown> | undefined
        if (meta && (meta.fullName || meta.interests || meta.country)) {
            applyDraft(meta)
        } else {
            AsyncStorage.getItem(DRAFT_KEY).then((raw) => {
                if (raw) { try { applyDraft(JSON.parse(raw)) } catch { /* ignore */ } }
            })
        }
    }, [isLoaded, user, setFormData])

    const buildDraft = useCallback(() => {
        const interests = formData.selectedInterests
        return {
            fullName: formData.fullName.trim(),
            country: formData.selectedCountry.name,
            countryCode: formData.selectedCountry.code,
            phone: formData.localPhone ? `${formData.selectedCountry.dial}${formData.localPhone}` : '',
            age: formData.age ? parseInt(formData.age, 10) : null,
            pursuit: formData.degreePursuit,
            isGraduate: formData.isGraduate,
            schoolName: formData.schoolName.trim(),
            gradeLevel: formData.gradeLevel,
            interests: interests.length > 0 ? interests : [],
            ambitions: formData.selectedAmbitions,
        }
    }, [formData])

    // Fire-and-forget sync of the canonical profile row through the backend
    // (service_role, keyed by toDatabaseUserId). This warms the recommendation
    // embedding. It must never block navigation — a transient API failure is
    // fine because Clerk metadata already holds the answers.
    const syncBackendProfile = useCallback(async (draft: ReturnType<typeof buildDraft>) => {
        const patch: Record<string, unknown> = {}
        if (draft.fullName) patch.fullName = draft.fullName
        if (draft.country) patch.country = draft.country
        if (draft.schoolName) patch.school = draft.schoolName
        if (draft.pursuit) patch.degree = draft.pursuit
        if (typeof draft.age === 'number' && Number.isFinite(draft.age)) patch.age = draft.age
        // Ambitions fold into interests for the backend row — the profile
        // schema has no ambitions column, and the recommendation embedding is
        // built from interests, so "study abroad"-style answers belong there.
        const interestSignals = Array.from(new Set([...draft.interests, ...draft.ambitions].filter(Boolean)))
        if (interestSignals.length) patch.interests = interestSignals
        if (Object.keys(patch).length === 0) return
        try {
            await updateProfile(getToken, patch)
        } catch (e) {
            console.warn('Backend profile sync failed (non-fatal):', e)
        }
    }, [getToken])

    /**
     * Persist onboarding and leave for the app.
     * @param complete false when the user is skipping — we still save whatever
     *        they entered but flag the profile as pending so we can nudge them
     *        to finish later (see the resume card on the profile screen).
     */
    const persistAndLeave = useCallback(async (complete: boolean) => {
        if (!isLoaded || !user || loading) return
        setLoading(true)
        Keyboard.dismiss()
        const draft = buildDraft()
        try {
            // Primary persistence: Clerk metadata. Reliable (same channel as
            // auth) and read by the profile header + personalization. Marking
            // onboardingComplete keeps the splash router from forcing the user
            // back here; profilePending drives the "finish your profile" nudge.
            await user.update({
                unsafeMetadata: {
                    ...(user.unsafeMetadata as Record<string, unknown>),
                    onboardingComplete: true,
                    profilePending: !complete,
                    ...draft,
                    interests: draft.interests.length > 0 ? draft.interests : ['General'],
                },
            })
            await AsyncStorage.removeItem(DRAFT_KEY).catch(() => {})
            void syncBackendProfile(draft)
            await user.reload()
            router.replace('/(app)')
        } catch (err) {
            console.error('Onboarding save failed:', err)
            // Never lose the user's input: stash a local draft they can resume.
            await AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(draft)).catch(() => {})
            Alert.alert(t('common:states.error'), t('onboarding.errors.saveFailed'))
            setLoading(false)
        }
    }, [isLoaded, user, loading, buildDraft, syncBackendProfile, router, t])

    const goToStep = useCallback((next: number) => {
        setDirection(next > currentStep ? 'forward' : 'back')
        setCurrentStep(next)
    }, [currentStep])

    const handleNext = useCallback(() => {
        Keyboard.dismiss()
        if (currentStep < STEPS.length - 1) goToStep(currentStep + 1)
        else persistAndLeave(true)
    }, [currentStep, goToStep, persistAndLeave])

    const handleBack = useCallback(() => {
        if (currentStep > 0) goToStep(currentStep - 1)
    }, [currentStep, goToStep])

    // Skipping = "not now": save partial answers, go home, stay pending.
    const handleSkip = useCallback(() => persistAndLeave(false), [persistAndLeave])

    // Android hardware back walks steps instead of dropping out of onboarding.
    useEffect(() => {
        const sub = BackHandler.addEventListener('hardwareBackPress', () => {
            if (currentStep > 0) {
                handleBack()
                return true
            }
            return false
        })
        return () => sub.remove()
    }, [currentStep, handleBack])

    const canProceed = useCallback(() => {
        switch (currentStep) {
            case 0: return formData.fullName.trim().length > 0
            case 1: return formData.isGraduate !== null
            case 2: return formData.selectedInterests.length > 0 || formData.selectedAmbitions.length > 0
            default: return true
        }
    }, [currentStep, formData])

    const isLastStep = currentStep === STEPS.length - 1

    if (!isLoaded) {
        return (
            <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
                <ActivityIndicator size="large" color={colors.accent} />
            </View>
        )
    }

    const renderStepContent = () => {
        switch (currentStep) {
            case 0: return <ProfileStep formData={formData} setFormData={setFormData} />
            case 1: return <EducationStep formData={formData} setFormData={setFormData} />
            case 2: return <InterestsStep formData={formData} setFormData={setFormData} />
            case 3: return <WelcomeStep formData={formData} />
            default: return null
        }
    }

    const enterAnim = reducedMotion
        ? FadeIn.duration(200)
        : (direction === 'forward' ? SlideInRight : SlideInLeft).duration(280)
    const exitAnim = reducedMotion
        ? FadeIn.duration(0)
        : (direction === 'forward' ? SlideOutLeft : SlideOutRight).duration(180)

    return (
        <>
            <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor="transparent" translucent />

            <CountryPickerModal
                visible={formData.countryModal}
                onClose={() => setFormData({ countryModal: false })}
                selectedCountry={formData.selectedCountry}
                onSelect={(country) => setFormData({ selectedCountry: country })}
                colors={colors}
                isDark={isDark}
            />

            <View style={styles.container}>
                <LinearGradient
                    colors={isDark ? [colors.background, colors.card, colors.background] : [colors.background, colors.muted, colors.background]}
                    style={StyleSheet.absoluteFill}
                />

                <View style={[styles.safeArea, { paddingTop: insets.top }]}>
                    <View style={styles.headerRow}>
                        <TouchableOpacity
                            style={[styles.backBtnHeader, currentStep === 0 && styles.backBtnDisabled]}
                            onPress={handleBack}
                            disabled={currentStep === 0}
                            activeOpacity={0.7}
                        >
                            {currentStep > 0 && <ChevronLeft color={colors.foreground} size={24} />}
                        </TouchableOpacity>
                        <View style={styles.headerCenter}>
                            <Text style={styles.headerSubtitle}>{t('onboarding.stepOf', { current: currentStep + 1, total: STEPS.length })}</Text>
                        </View>
                        {!isLastStep ? (
                            <TouchableOpacity
                                style={styles.skipButton}
                                onPress={handleSkip}
                                disabled={loading}
                                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                activeOpacity={0.7}
                            >
                                <Text style={styles.skipButtonText}>{t('common:actions.skip')}</Text>
                            </TouchableOpacity>
                        ) : (
                            <View style={styles.skipButton} />
                        )}
                    </View>

                    <KeyboardAvoidingView
                        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                        style={styles.keyboardView}
                        keyboardVerticalOffset={0}
                    >
                        <ScrollView
                            style={styles.mainContent}
                            contentContainerStyle={styles.mainContentScroll}
                            keyboardShouldPersistTaps="handled"
                            keyboardDismissMode="on-drag"
                            showsVerticalScrollIndicator={false}
                        >
                            <StepIndicator currentStep={currentStep} totalSteps={STEPS.length} />

                            <Animated.View key={currentStep} entering={enterAnim} exiting={exitAnim} style={styles.stepPage}>
                                {renderStepContent()}
                            </Animated.View>
                        </ScrollView>

                        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 20) }]}>
                            {isLastStep && (
                                <Text style={styles.footerHint}>{t('onboarding.welcome.footerHint')}</Text>
                            )}
                            <TouchableOpacity
                                style={[styles.buttonWrap, !canProceed() && styles.buttonDisabled]}
                                onPress={handleNext}
                                disabled={!canProceed() || loading}
                                activeOpacity={0.9}
                            >
                                <LinearGradient
                                    colors={
                                        canProceed()
                                            ? [colors.accent, `${colors.accent}D0`]
                                            : [colors.muted, colors.muted]
                                    }
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 0 }}
                                    style={styles.button}
                                >
                                    {loading ? (
                                        <ActivityIndicator color="#FFFFFF" size="small" />
                                    ) : (
                                        <>
                                            <Text style={styles.buttonText}>
                                                {isLastStep ? t('onboarding.getStarted') : t('common:actions.continue')}
                                            </Text>
                                            {isLastStep ? (
                                                <Rocket color="#FFFFFF" size={20} />
                                            ) : (
                                                <ArrowRight color="#FFFFFF" size={20} />
                                            )}
                                        </>
                                    )}
                                </LinearGradient>
                            </TouchableOpacity>
                        </View>
                    </KeyboardAvoidingView>
                </View>
            </View>
        </>
    )
}

const getStyles = (isDark: boolean, colors: ThemeColors) => {
    const muted = colors.textSecondary
    const surface = isDark ? 'rgba(255,255,255,0.05)' : colors.card
    const surfaceBorder = isDark ? 'rgba(255,255,255,0.10)' : colors.border

    return StyleSheet.create({
        // Non-style helpers so child components can read the resolved palette
        // without threading `colors` through every prop.
        _accent: { color: colors.accent },
        _accentSoft: { color: `${colors.accent}33` },
        _muted: { color: muted },
        _success: { color: colors.success },
        _info: { color: isDark ? '#60A5FA' : '#3b82f6' },

        container: { flex: 1, backgroundColor: colors.background },
        safeArea: { flex: 1 },
        keyboardView: { flex: 1 },

        headerRow: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 20,
            paddingVertical: 12,
        },
        backBtnHeader: {
            width: 40,
            height: 40,
            borderRadius: 12,
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: surface,
        },
        backBtnDisabled: { opacity: 0 },
        headerCenter: { flex: 1, alignItems: 'center' },
        headerSubtitle: {
            color: muted,
            fontSize: 11,
            fontWeight: '700',
            textTransform: 'uppercase',
            letterSpacing: 2,
        },
        skipButton: { minWidth: 52, alignItems: 'flex-end', paddingVertical: 8, paddingHorizontal: 4 },
        skipButtonText: { color: muted, fontSize: 14, fontWeight: '700' },

        mainContent: { flex: 1 },
        mainContentScroll: { flexGrow: 1, paddingTop: 8, paddingBottom: 18 },
        stepPage: { flexGrow: 1, justifyContent: 'flex-start' },

        stepIndicator: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 20,
            paddingHorizontal: 24,
        },
        stepCircle: {
            width: 32,
            height: 32,
            borderRadius: 16,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1.5,
            borderColor: isDark ? 'rgba(255,255,255,0.14)' : colors.border,
            backgroundColor: surface,
        },
        stepCircleActive: {
            backgroundColor: colors.accent,
            borderColor: colors.accent,
        },
        stepCircleCompleted: {
            backgroundColor: colors.success,
            borderColor: colors.success,
        },
        stepConnector: {
            flex: 1,
            height: 2.5,
            marginHorizontal: 6,
            borderRadius: 2,
            backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : colors.border,
        },
        stepConnectorActive: { backgroundColor: colors.success },

        contentContainer: { paddingHorizontal: 20, paddingBottom: 12 },

        welcomeContainer: { paddingHorizontal: 20, paddingBottom: 8, alignItems: 'flex-start', justifyContent: 'center', flex: 1 },
        welcomeContent: { alignItems: 'flex-start', width: '100%' },
        welcomeIconBox: {
            width: 64,
            height: 64,
            borderRadius: 20,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 22,
            borderWidth: 1,
            borderColor: `${colors.accent}59`,
            overflow: 'hidden',
        },
        welcomeTitle: { fontSize: 29, fontWeight: '800', color: colors.foreground, marginBottom: 10, textAlign: 'left', lineHeight: 35 },
        welcomeSubtitle: { fontSize: 16, color: muted, textAlign: 'left', lineHeight: 24, marginBottom: 24 },
        recapCard: {
            width: '100%',
            backgroundColor: surface,
            borderWidth: 1,
            borderColor: surfaceBorder,
            borderRadius: 18,
            padding: 16,
            marginBottom: 20,
        },
        recapLabel: {
            fontSize: 10.5,
            fontWeight: '800',
            letterSpacing: 1.2,
            color: muted,
            marginBottom: 12,
        },
        recapHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
        recapFlag: { fontSize: 30 },
        recapName: { fontSize: 16, fontWeight: '800', color: colors.foreground },
        recapMeta: { fontSize: 13, color: muted, marginTop: 2 },
        recapTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 14 },
        recapTag: {
            paddingHorizontal: 10,
            paddingVertical: 5,
            borderRadius: 999,
            backgroundColor: `${colors.accent}14`,
            borderWidth: 1,
            borderColor: `${colors.accent}2E`,
        },
        recapTagText: { fontSize: 12, fontWeight: '600', color: colors.accent },
        welcomeFeatures: { width: '100%', gap: 12 },
        featureItem: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 14,
            backgroundColor: surface,
            padding: 14,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: surfaceBorder,
        },
        featureIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
        featureText: { color: colors.foreground, fontSize: 14, fontWeight: '600', flex: 1 },

        stepHeader: { alignItems: 'flex-start', marginBottom: 14 },
        stepIconBox: {
            width: 46,
            height: 46,
            borderRadius: 14,
            backgroundColor: `${colors.accent}1F`,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 12,
            borderWidth: 1,
            borderColor: `${colors.accent}3D`,
        },
        stepTitle: { fontSize: 25, fontWeight: '800', color: colors.foreground, marginBottom: 8, textAlign: 'left', lineHeight: 31 },
        stepSubtitle: { fontSize: 14, color: muted, textAlign: 'left', lineHeight: 22 },

        whyCard: {
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: 10,
            backgroundColor: `${colors.accent}12`,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: `${colors.accent}26`,
            paddingHorizontal: 14,
            paddingVertical: 12,
            marginBottom: 18,
        },
        whyDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent, marginTop: 5 },
        whyText: { flex: 1, fontSize: 13, lineHeight: 19, color: isDark ? '#CBD5E1' : colors.foreground, fontWeight: '500' },

        form: { gap: 16 },
        inputGroup: { gap: 9 },
        label: { fontSize: 14, fontWeight: '700', color: colors.foreground },
        optionalLabel: { fontSize: 12, color: muted, fontWeight: '500' },
        sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
        limitText: { fontSize: 12, color: colors.accent, fontWeight: '700' },

        inputContainer: {
            backgroundColor: surface,
            borderWidth: 1,
            borderColor: surfaceBorder,
            borderRadius: 16,
            minHeight: 58,
            justifyContent: 'center',
            overflow: 'hidden',
        },
        input: { flex: 1, paddingHorizontal: 16, paddingVertical: 14, color: colors.foreground, fontSize: 16, minHeight: 56 },

        pickerRow: {
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: surface,
            borderWidth: 1,
            borderColor: surfaceBorder,
            borderRadius: 16,
            minHeight: 58,
            paddingHorizontal: 16,
            paddingVertical: 14,
            gap: 10,
        },
        flagLarge: { fontSize: 22 },
        pickerText: { flex: 1, color: colors.foreground, fontSize: 15, fontWeight: '500' },

        yesNoRow: { flexDirection: 'row', gap: 10 },
        yesNoBtn: {
            flex: 1,
            minHeight: 54,
            paddingVertical: 14,
            borderRadius: 14,
            backgroundColor: surface,
            borderWidth: 1,
            borderColor: surfaceBorder,
            alignItems: 'center',
            justifyContent: 'center',
        },
        yesNoBtnSelected: { backgroundColor: `${colors.accent}20`, borderColor: colors.accent },
        yesNoText: { fontSize: 15, fontWeight: '600', color: muted },
        yesNoTextSelected: { color: colors.accent },

        pursuitGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 2 },
        pursuitCard: {
            width: (SCREEN_WIDTH - 60) / 2,
            backgroundColor: surface,
            borderWidth: 1,
            borderColor: surfaceBorder,
            borderRadius: 16,
            minHeight: 82,
            padding: 14,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
        },
        pursuitCardSelected: { backgroundColor: `${colors.accent}15`, borderColor: colors.accent, borderWidth: 2 },
        pursuitIcon: { fontSize: 13, color: muted, fontWeight: '800' },
        pursuitIconSelected: { color: colors.accent },
        pursuitLabel: { fontSize: 13, color: muted, textAlign: 'center', fontWeight: '600' },
        pursuitLabelSelected: { color: colors.foreground },

        gradeScroll: { flexDirection: 'row', gap: 8, paddingRight: 10 },
        gradeChip: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            paddingHorizontal: 14,
            paddingVertical: 10,
            borderRadius: 20,
            backgroundColor: surface,
            borderWidth: 1,
            borderColor: surfaceBorder,
        },
        gradeChipSelected: { backgroundColor: `${colors.accent}20`, borderColor: colors.accent },
        gradeChipIcon: { fontSize: 18 },
        gradeChipText: { fontSize: 13, color: muted, fontWeight: '600' },
        gradeChipTextSelected: { color: colors.foreground },

        schoolSearchContainer: {
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: surface,
            borderWidth: 1,
            borderColor: surfaceBorder,
            borderRadius: 16,
            minHeight: 58,
        },
        schoolInput: { flex: 1, paddingHorizontal: 16, paddingVertical: 14, color: colors.foreground, fontSize: 16, minHeight: 56 },
        schoolDropdownToggle: { padding: 14 },
        schoolDropdown: {
            backgroundColor: isDark ? colors.card : colors.card,
            borderWidth: 1,
            borderColor: surfaceBorder,
            borderRadius: 16,
            marginTop: 8,
            maxHeight: 200,
            overflow: 'hidden',
        },
        schoolDropdownList: { maxHeight: 200 },
        schoolOption: {
            flexDirection: 'row',
            alignItems: 'center',
            padding: 12,
            gap: 10,
            borderBottomWidth: 1,
            borderBottomColor: surfaceBorder,
        },
        schoolOptionText: { color: colors.foreground, fontSize: 14, fontWeight: '500' },

        interestsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 2 },
        interestChip: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            paddingHorizontal: 12,
            paddingVertical: 11,
            minHeight: 42,
            borderRadius: 20,
            backgroundColor: surface,
            borderWidth: 1,
            borderColor: surfaceBorder,
        },
        interestChipSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
        interestChipText: { color: muted, fontSize: 13, fontWeight: '600' },
        interestChipTextSelected: { color: '#FFFFFF' },

        ambitionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 2 },
        ambitionChip: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            paddingHorizontal: 12,
            paddingVertical: 11,
            minHeight: 42,
            borderRadius: 20,
            backgroundColor: surface,
            borderWidth: 1,
            borderColor: surfaceBorder,
        },
        ambitionChipSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
        ambitionChipIcon: { fontSize: 16 },
        ambitionChipText: { color: muted, fontSize: 13, fontWeight: '600' },
        ambitionChipTextSelected: { color: '#FFFFFF' },

        footer: {
            paddingTop: 14,
            paddingHorizontal: 20,
            backgroundColor: isDark ? 'rgba(2,6,23,0.96)' : 'rgba(255,255,255,0.96)',
            borderTopWidth: 1,
            borderTopColor: surfaceBorder,
        },
        footerHint: { fontSize: 12, color: muted, textAlign: 'center', marginBottom: 10, lineHeight: 17 },
        buttonWrap: {
            width: '100%',
            borderRadius: 18,
            overflow: 'hidden',
            shadowColor: colors.accent,
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.25,
            shadowRadius: 12,
            elevation: 6,
        },
        button: {
            width: '100%',
            paddingVertical: 16,
            borderRadius: 18,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
        },
        buttonDisabled: { shadowOpacity: 0, elevation: 0 },
        buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },

        // Full-screen country picker
        pickerScreen: { flex: 1 },
        pickerHeader: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 16,
            paddingVertical: 12,
        },
        pickerCloseBtn: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: surface },
        pickerTitle: { fontSize: 18, fontWeight: '800', color: colors.foreground },
        searchRow: {
            flexDirection: 'row',
            alignItems: 'center',
            marginHorizontal: 16,
            marginBottom: 8,
            backgroundColor: surface,
            borderRadius: 14,
            paddingHorizontal: 14,
            gap: 10,
            borderWidth: 1,
            borderColor: surfaceBorder,
        },
        searchInput: { flex: 1, paddingVertical: 14, color: colors.foreground, fontSize: 15 },
        countryList: { flex: 1 },
        pickerEmpty: { paddingVertical: 48, alignItems: 'center' },
        pickerEmptyText: { color: muted, fontSize: 14 },
        countryRow: {
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 20,
            paddingVertical: 15,
            gap: 12,
            borderBottomWidth: 1,
            borderBottomColor: surfaceBorder,
        },
        countryRowSelected: { backgroundColor: `${colors.accent}14` },
        flag: { fontSize: 22 },
        countryName: { flex: 1, color: colors.foreground, fontSize: 15, fontWeight: '500' },
        dialCode: { color: muted, fontSize: 14, fontWeight: '600' },
    })
}
