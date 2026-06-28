import React, { useState, useMemo, useRef, useCallback } from 'react'
import {
    ActivityIndicator,
    Alert,
    FlatList,
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
    Dimensions,
    StatusBar,
} from 'react-native'
import { useUser } from '@clerk/clerk-expo'
import { useRouter } from 'expo-router'
import Animated, { FadeInUp, FadeInDown, Layout, SlideInRight, SlideOutLeft } from 'react-native-reanimated'
import {
    ArrowRight,
    ChevronDown,
    GraduationCap,
    Phone,
    Search,
    Sparkles,
    Check,
    X,
    User,
    Building,
    Target,
    Award,
    Lightbulb,
    Calendar,
    BookOpen,
    Plus,
    ChevronLeft,
    Globe,
    Zap,
    Rocket,
} from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { BlurView } from 'expo-blur'
import { useTheme } from '../components/context/ThemeContext'
import { supabase } from '../lib/supabase'

import {
    COUNTRIES,
    GRADE_LEVELS as GRADE_LEVELS_DATA,
    INTERESTS as INTERESTS_DATA,
    AMBITIONS as AMBITIONS_DATA,
} from '../data/onboarding-data'
import type { Country } from '../data/onboarding-data'

const { width: SCREEN_WIDTH } = Dimensions.get('window')
let styles = {} as ReturnType<typeof getStyles>

const DEGREE_PURSUITS = [
    { value: 'BSc', label: "Bachelor's", icon: 'BSc' },
    { value: 'MSc', label: "Master's", icon: 'MSc' },
    { value: 'PhD', label: 'PhD', icon: 'PhD' },
    { value: 'Other', label: 'Other', icon: 'Alt' },
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

const STEPS = [
    { id: 'profile', title: 'Profile', icon: User },
    { id: 'education', title: 'Education', icon: Building },
    { id: 'interests', title: 'Interests', icon: Target },
    { id: 'welcome', title: 'Welcome', icon: Sparkles },
]

const ANIMATED_VIEW = Animated.View

function StepIndicator({ currentStep, totalSteps }: { currentStep: number; totalSteps: number }) {
    return (
        <View style={styles.stepIndicator}>
            {STEPS.slice(0, totalSteps).map((step, index) => {
                const isActive = index === currentStep
                const isCompleted = index < currentStep

                return (
                    <View key={step.id} style={styles.stepItem}>
                        <View
                            style={[
                                styles.stepBar,
                                isActive && styles.stepBarActive,
                                isCompleted && styles.stepBarCompleted,
                            ]}
                        />
                    </View>
                )
            })}
        </View>
    )
}

function CountryPickerModal({ visible, onClose, selectedCountry, onSelect }: any) {
    const [search, setSearch] = useState('')

    const filteredCountries = useMemo(() => {
        if (!search.trim()) return COUNTRIES.slice(0, 50)
        return COUNTRIES.filter(
            (c) =>
                c.name.toLowerCase().includes(search.toLowerCase()) ||
                c.dial.includes(search),
        ).slice(0, 50)
    }, [search])

    const handleSelect = useCallback((country: Country) => {
        onSelect(country)
        setSearch('')
        onClose()
    }, [onSelect, onClose])

    return (
        <Modal visible={visible} animationType="slide" transparent statusBarTranslucent>
            <View style={styles.modalOverlay}>
                <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={onClose} />
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={styles.modalKeyboardAvoiding}
                >
                    <View style={styles.modalSheet}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Select Country</Text>
                            <TouchableOpacity onPress={onClose} style={styles.modalCloseBtn}>
                                <X color="#94A3B8" size={22} />
                            </TouchableOpacity>
                        </View>

                        <View style={styles.searchRow}>
                            <Search color="#64748B" size={18} />
                            <TextInput
                                value={search}
                                onChangeText={setSearch}
                                placeholder="Search country or dial code..."
                                placeholderTextColor="#64748B"
                                style={styles.searchInput}
                                returnKeyType="search"
                            />
                        </View>

                        <FlatList
                            data={filteredCountries}
                            keyExtractor={(item) => item.code}
                            renderItem={({ item }) => (
                                <TouchableOpacity
                                    style={[
                                        styles.countryRow,
                                        selectedCountry.code === item.code && styles.countryRowSelected,
                                    ]}
                                    onPress={() => handleSelect(item)}
                                    activeOpacity={0.7}
                                >
                                    <Text style={styles.flag}>{item.flag}</Text>
                                    <Text style={styles.countryName}>{item.name}</Text>
                                    <Text style={styles.dialCode}>{item.dial}</Text>
                                    {selectedCountry.code === item.code && (
                                        <Check color="#6366F1" size={18} />
                                    )}
                                </TouchableOpacity>
                            )}
                            keyboardShouldPersistTaps="handled"
                            keyboardDismissMode="on-drag"
                            style={styles.countryList}
                        />
                    </View>
                </KeyboardAvoidingView>
            </View>
        </Modal>
    )
}

function ProfileStep({ formData, setFormData }: any) {
    const { fullName, selectedCountry, age, degreePursuit } = formData

    return (
        <ANIMATED_VIEW entering={FadeInUp.duration(400)} style={styles.contentContainer}>
            <View style={styles.stepHeader}>
                <View style={styles.stepIconBox}>
                    <User color="#F97316" size={28} />
                </View>
                <Text style={styles.stepTitle}>Basic Info</Text>
                <Text style={styles.stepSubtitle}>
                    Just a few details to get started
                </Text>
            </View>

            <View style={styles.form}>
                <View style={styles.inputGroup}>
                    <Text style={styles.label}>Name</Text>
                    <View style={styles.inputContainer}>
                        <TextInput
                            value={fullName}
                            onChangeText={(text: string) => setFormData({ fullName: text })}
                            placeholder="Your full name"
                            placeholderTextColor="#64748B"
                            style={styles.input}
                        />
                    </View>
                </View>

                <View style={styles.inputGroup}>
                    <Text style={styles.label}>Country</Text>
                    <TouchableOpacity
                        style={styles.pickerRow}
                        onPress={() => setFormData({ countryModal: true })}
                        activeOpacity={0.7}
                    >
                        <Text style={styles.flagLarge}>{selectedCountry.flag}</Text>
                        <Text style={styles.pickerText}>{selectedCountry.name}</Text>
                        <ChevronDown color="#64748B" size={18} />
                    </TouchableOpacity>
                </View>

                <View style={styles.rowGroup}>
                    <View style={[styles.inputGroup, { flex: 1 }]}>
                        <Text style={styles.label}>Age</Text>
                        <View style={styles.inputContainer}>
                            <TextInput
                                value={age}
                                onChangeText={(text: string) => setFormData({ age: text })}
                                placeholder="Age"
                                placeholderTextColor="#64748B"
                                style={styles.input}
                                keyboardType="number-pad"
                                maxLength={3}
                            />
                        </View>
                    </View>
                </View>

                <View style={styles.inputGroup}>
                    <Text style={styles.label}>Degree Level <Text style={styles.optionalLabel}>(optional)</Text></Text>
                    <View style={styles.pursuitGrid}>
                        {DEGREE_PURSUITS.map((degree) => (
                            <TouchableOpacity
                                key={degree.value}
                                style={[
                                    styles.pursuitCard,
                                    degreePursuit === degree.value && styles.pursuitCardSelected,
                                ]}
                                onPress={() => setFormData({ degreePursuit: degree.value })}
                                activeOpacity={0.7}
                            >
                                <Text style={styles.pursuitIcon}>{degree.icon}</Text>
                                <Text
                                    style={[
                                        styles.pursuitLabel,
                                        degreePursuit === degree.value && styles.pursuitLabelSelected,
                                    ]}
                                >
                                    {degree.label}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>
            </View>
        </ANIMATED_VIEW>
    )
}

function EducationStep({ formData, setFormData }: any) {
    const { isGraduate, gradeLevel, schoolName } = formData
    const [schoolDropdownVisible, setSchoolDropdownVisible] = useState(false)

    const filteredSchools = useMemo(() => {
        if (!schoolName.trim()) return NIGERIAN_UNIVERSITIES.slice(0, 10)
        return NIGERIAN_UNIVERSITIES.filter(s =>
            s.toLowerCase().includes(schoolName.toLowerCase())
        ).slice(0, 8)
    }, [schoolName])

    return (
        <ANIMATED_VIEW entering={FadeInUp.duration(400)} style={styles.contentContainer}>
            <View style={styles.stepHeader}>
                <View style={styles.stepIconBox}>
                    <Building color="#F97316" size={28} />
                </View>
                <Text style={styles.stepTitle}>Education</Text>
                <Text style={styles.stepSubtitle}>
                    Tell us about your academic background
                </Text>
            </View>

            <View style={styles.form}>
                <View style={styles.inputGroup}>
                    <Text style={styles.label}>Are you a graduate?</Text>
                    <View style={styles.yesNoRow}>
                        <TouchableOpacity
                            style={[styles.yesNoBtn, isGraduate === 'yes' && styles.yesNoBtnSelected]}
                            onPress={() => setFormData({ isGraduate: 'yes' })}
                            activeOpacity={0.7}
                        >
                            <Text style={[styles.yesNoText, isGraduate === 'yes' && styles.yesNoTextSelected]}>Yes</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.yesNoBtn, isGraduate === 'no' && styles.yesNoBtnSelected]}
                            onPress={() => setFormData({ isGraduate: 'no' })}
                            activeOpacity={0.7}
                        >
                            <Text style={[styles.yesNoText, isGraduate === 'no' && styles.yesNoTextSelected]}>No</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {isGraduate === 'no' && (
                    <ANIMATED_VIEW entering={FadeInUp.duration(300)}>
                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>Grade Level</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.gradeScroll}>
                                {GRADE_LEVELS_DATA.map((level) => (
                                    <TouchableOpacity
                                        key={level.value}
                                        style={[
                                            styles.gradeChip,
                                            gradeLevel === level.value && styles.gradeChipSelected,
                                        ]}
                                        onPress={() => setFormData({ gradeLevel: level.value })}
                                        activeOpacity={0.7}
                                    >
                                        <Text style={styles.gradeChipIcon}>{level.icon}</Text>
                                        <Text style={[styles.gradeChipText, gradeLevel === level.value && styles.gradeChipTextSelected]}>
                                            {level.label}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
                        </View>
                    </ANIMATED_VIEW>
                )}

                <View style={styles.inputGroup}>
                    <Text style={styles.label}>School <Text style={styles.optionalLabel}>(optional)</Text></Text>
                    <View style={styles.schoolSearchContainer}>
                        <TextInput
                            value={schoolName}
                            onChangeText={(text: string) => {
                                setFormData({ schoolName: text })
                                setSchoolDropdownVisible(true)
                            }}
                            onFocus={() => setSchoolDropdownVisible(true)}
                            placeholder="Search your school..."
                            placeholderTextColor="#64748B"
                            style={styles.schoolInput}
                        />
                        <TouchableOpacity
                            style={styles.schoolDropdownToggle}
                            onPress={() => setSchoolDropdownVisible(!schoolDropdownVisible)}
                        >
                            <ChevronDown color="#64748B" size={18} />
                        </TouchableOpacity>
                    </View>

                    {schoolDropdownVisible && filteredSchools.length > 0 && (
                        <View style={styles.schoolDropdown}>
                            <ScrollView style={styles.schoolDropdownList} nestedScrollEnabled>
                                {filteredSchools.map((school, idx) => (
                                    <TouchableOpacity
                                        key={idx}
                                        style={styles.schoolOption}
                                        onPress={() => {
                                            setFormData({ schoolName: school })
                                            setSchoolDropdownVisible(false)
                                        }}
                                    >
                                        <Building size={16} color="#64748B" />
                                        <Text style={styles.schoolOptionText}>{school}</Text>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
                        </View>
                    )}
                </View>
            </View>
        </ANIMATED_VIEW>
    )
}

function InterestsStep({ formData, setFormData }: any) {
    const { selectedInterests, selectedAmbitions } = formData

    const toggleInterest = useCallback((interest: string) => {
        setFormData({
            selectedInterests: selectedInterests.includes(interest)
                ? selectedInterests.filter((i: string) => i !== interest)
                : selectedInterests.length < 3 ? [...selectedInterests, interest] : selectedInterests
        })
    }, [selectedInterests, setFormData])

    const toggleAmbition = useCallback((ambition: string) => {
        setFormData({
            selectedAmbitions: selectedAmbitions.includes(ambition)
                ? selectedAmbitions.filter((i: string) => i !== ambition)
                : selectedAmbitions.length < 2 ? [...selectedAmbitions, ambition] : selectedAmbitions
        })
    }, [selectedAmbitions, setFormData])

    return (
        <ANIMATED_VIEW entering={FadeInUp.duration(400)} style={styles.contentContainer}>
            <View style={styles.stepHeader}>
                <View style={styles.stepIconBox}>
                    <Target color="#F97316" size={28} />
                </View>
                <Text style={styles.stepTitle}>Your Goals</Text>
                <Text style={styles.stepSubtitle}>
                    Pick what matters to you
                </Text>
            </View>

            <View style={styles.form}>
                <View style={styles.inputGroup}>
                    <View style={styles.sectionHeaderRow}>
                        <Text style={styles.label}>Interests</Text>
                        <Text style={styles.limitText}>{selectedInterests.length}/3</Text>
                    </View>
                    <View style={styles.interestsGrid}>
                        {INTERESTS_DATA.map((interest) => {
                            const isSelected = selectedInterests.includes(interest)
                            return (
                                <TouchableOpacity
                                    key={interest}
                                    style={[
                                        styles.interestChip,
                                        isSelected && styles.interestChipSelected,
                                    ]}
                                    onPress={() => toggleInterest(interest)}
                                    activeOpacity={0.7}
                                >
                                    <Text
                                        style={[
                                            styles.interestChipText,
                                            isSelected && styles.interestChipTextSelected,
                                        ]}
                                    >
                                        {interest}
                                    </Text>
                                </TouchableOpacity>
                            )
                        })}
                    </View>
                </View>

                <View style={styles.inputGroup}>
                    <View style={styles.sectionHeaderRow}>
                        <Text style={styles.label}>Ambitions</Text>
                        <Text style={styles.limitText}>{selectedAmbitions.length}/2</Text>
                    </View>
                    <View style={styles.ambitionsGrid}>
                        {AMBITIONS_DATA.map((ambition) => {
                            const isSelected = selectedAmbitions.includes(ambition.value)
                            return (
                                <TouchableOpacity
                                    key={ambition.value}
                                    style={[
                                        styles.ambitionChip,
                                        isSelected && styles.ambitionChipSelected,
                                    ]}
                                    onPress={() => toggleAmbition(ambition.value)}
                                    activeOpacity={0.7}
                                >
                                    <Text style={styles.ambitionChipIcon}>{ambition.icon}</Text>
                                    <Text style={[styles.ambitionChipText, isSelected && styles.ambitionChipTextSelected]}>
                                        {ambition.label}
                                    </Text>
                                </TouchableOpacity>
                            )
                        })}
                    </View>
                </View>
            </View>
        </ANIMATED_VIEW>
    )
}

function WelcomeStep() {
    return (
        <ANIMATED_VIEW entering={FadeInUp.duration(400)} style={styles.welcomeContainer}>
            <View style={styles.welcomeContent}>
                <View style={styles.welcomeIconBox}>
                    <LinearGradient
                        colors={['rgba(249, 115, 22, 0.25)', 'rgba(249, 115, 22, 0.1)']}
                        style={StyleSheet.absoluteFill}
                    />
                    <Sparkles color="#F97316" size={48} />
                </View>
                <Text style={styles.welcomeTitle}>You're all set!</Text>
                <Text style={styles.welcomeSubtitle}>
                    We'll find the best opportunities for you
                </Text>

                <View style={styles.welcomeFeatures}>
                    <ANIMATED_VIEW entering={FadeInUp.delay(100).duration(350)} style={styles.featureItem}>
                        <View style={[styles.featureIcon, { backgroundColor: 'rgba(249,115,22,0.18)' }]}>
                            <Sparkles size={22} color="#F97316" />
                        </View>
                        <Text style={styles.featureText}>Personalized matches</Text>
                    </ANIMATED_VIEW>
                    <ANIMATED_VIEW entering={FadeInUp.delay(200).duration(350)} style={styles.featureItem}>
                        <View style={[styles.featureIcon, { backgroundColor: 'rgba(16,185,129,0.18)' }]}>
                            <Award size={22} color="#10B981" />
                        </View>
                        <Text style={styles.featureText}>Scholarships & programs</Text>
                    </ANIMATED_VIEW>
                    <ANIMATED_VIEW entering={FadeInUp.delay(300).duration(350)} style={styles.featureItem}>
                        <View style={[styles.featureIcon, { backgroundColor: 'rgba(59,130,246,0.18)' }]}>
                            <Target size={22} color="#3b82f6" />
                        </View>
                        <Text style={styles.featureText}>Career guidance</Text>
                    </ANIMATED_VIEW>
                </View>
            </View>
        </ANIMATED_VIEW>
    )
}

export default function OnboardingScreen() {
    const { user, isLoaded } = useUser()
    const router = useRouter()
    const insets = useSafeAreaInsets()
    const { colors, isDark } = useTheme()
    styles = useMemo(() => getStyles(isDark, colors), [colors, isDark])

    const [currentStep, setCurrentStep] = useState(0)
    const [formData, setFormDataState] = useState({
        fullName: '',
        selectedCountry: COUNTRIES[0] as Country,
        countryModal: false,
        localPhone: '',
        age: '',
        degreePursuit: null as string | null,
        isGraduate: null as string | null,
        gradeLevel: null as string | null,
        schoolName: '',
        selectedInterests: [] as string[],
        showInterestInput: false,
        customInterest: '',
        selectedAmbitions: [] as string[],
        showAmbitionInput: false,
        customAmbition: '',
    })

    const [loading, setLoading] = useState(false)

    React.useEffect(() => {
        if (isLoaded && !user) {
            router.replace('/(auth)/sign-in')
        }
    }, [isLoaded, router, user])

    const setFormData = useCallback((updates: Partial<typeof formData>) => {
        setFormDataState(prev => ({ ...prev, ...updates }))
    }, [])

    const saveAndNavigate = async () => {
        if (!isLoaded || !user) return
        setLoading(true)
        try {
            const allInterests = [...formData.selectedInterests]
            const profilePayload = {
                user_id: user.id,
                full_name: formData.fullName,
                country: formData.selectedCountry.name,
                age: formData.age ? parseInt(formData.age, 10) : null,
                degree: formData.degreePursuit,
                school: formData.schoolName,
                major: formData.degreePursuit,
                preferences: {
                    countryCode: formData.selectedCountry.code,
                    phone: formData.localPhone ? `${formData.selectedCountry.dial}${formData.localPhone}` : '',
                    pursuit: formData.degreePursuit,
                    isGraduate: formData.isGraduate,
                    schoolName: formData.schoolName,
                    gradeLevel: formData.gradeLevel,
                    interests: allInterests.length > 0 ? allInterests : ['General'],
                    ambitions: formData.selectedAmbitions,
                },
                updated_at: new Date().toISOString(),
            }

            await user.update({
                unsafeMetadata: {
                    onboardingComplete: true,
                    fullName: formData.fullName,
                    country: formData.selectedCountry.name,
                    countryCode: formData.selectedCountry.code,
                    phone: formData.localPhone ? `${formData.selectedCountry.dial}${formData.localPhone}` : '',
                    age: formData.age ? parseInt(formData.age, 10) : null,
                    pursuit: formData.degreePursuit,
                    isGraduate: formData.isGraduate,
                    schoolName: formData.schoolName,
                    gradeLevel: formData.gradeLevel,
                    interests: allInterests.length > 0 ? allInterests : ['General'],
                    ambitions: formData.selectedAmbitions,
                },
            })
            const { error: profileError } = await supabase
                .from('profiles')
                .upsert(profilePayload, { onConflict: 'user_id' })

            if (profileError) {
                throw profileError
            }

            const { error: preferencesError } = await supabase
                .from('user_opportunity_preferences')
                .upsert({
                    user_id: user.id,
                    preferred_categories: allInterests.length > 0 ? allInterests : ['General'],
                    preferred_skills: [],
                    preferred_regions: formData.selectedCountry.name ? [formData.selectedCountry.name] : [],
                    remote_only: false,
                    updated_at: new Date().toISOString(),
                }, { onConflict: 'user_id' })

            if (preferencesError) {
                throw preferencesError
            }

            await user.reload()
            router.replace('/(app)')
        } catch (err) {
            console.error('Error updating profile:', err)
            Alert.alert('Error', 'Failed to save preferences. Please try again.')
            setLoading(false)
        }
    }

    const handleNext = () => {
        if (currentStep < STEPS.length - 1) {
            setCurrentStep(currentStep + 1)
        } else {
            saveAndNavigate()
        }
    }

    const handleBack = () => {
        if (currentStep > 0) {
            setCurrentStep(currentStep - 1)
        }
    }

    const handleSkip = () => {
        setCurrentStep(STEPS.length - 1)
    }

    const canProceed = () => {
        switch (currentStep) {
            case 0:
                return formData.fullName.trim().length > 0
            case 1:
                return formData.isGraduate !== null
            case 2:
                return formData.selectedInterests.length > 0 || formData.selectedAmbitions.length > 0
            case 3:
                return true
            default:
                return true
        }
    }

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
            case 0:
                return <ProfileStep formData={formData} setFormData={setFormData} />
            case 1:
                return <EducationStep formData={formData} setFormData={setFormData} />
            case 2:
                return <InterestsStep formData={formData} setFormData={setFormData} />
            case 3:
                return <WelcomeStep />
            default:
                return null
        }
    }

    return (
        <>
            <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

            <CountryPickerModal
                visible={formData.countryModal}
                onClose={() => setFormData({ countryModal: false })}
                selectedCountry={formData.selectedCountry}
                onSelect={(country: Country) => setFormData({ selectedCountry: country })}
            />

            <View style={styles.container}>
                <LinearGradient
                    colors={isDark ? [colors.background, '#111827', colors.background] : [colors.background, '#EEF2FF', colors.background]}
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
                            {currentStep > 0 && <ChevronLeft color="#FFFFFF" size={24} />}
                        </TouchableOpacity>
                        <View style={styles.headerCenter}>
                            <Text style={styles.headerSubtitle}>Step {currentStep + 1} of {STEPS.length}</Text>
                        </View>
                        {!isLastStep && (
                            <TouchableOpacity
                                style={styles.skipButton}
                                onPress={handleSkip}
                                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                activeOpacity={0.7}
                            >
                                <Text style={styles.skipButtonText}>Skip</Text>
                            </TouchableOpacity>
                        )}
                    </View>

                    <KeyboardAvoidingView
                        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                        style={styles.keyboardView}
                        keyboardVerticalOffset={0}
                    >
                        <ScrollView
                            style={styles.mainContent}
                            contentContainerStyle={styles.mainContentScroll}
                            keyboardShouldPersistTaps="handled"
                            showsVerticalScrollIndicator={false}
                        >
                            <StepIndicator currentStep={currentStep} totalSteps={STEPS.length} />

                            <Animated.View
                                key={currentStep}
                                entering={SlideInRight.duration(280)}
                                exiting={SlideOutLeft.duration(180)}
                                style={styles.stepPage}
                            >
                                {renderStepContent()}
                            </Animated.View>
                        </ScrollView>

                        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 24) }]}>
                            <TouchableOpacity
                                style={[
                                    styles.button,
                                    !canProceed() && styles.buttonDisabled,
                                    { backgroundColor: canProceed() ? colors.accent : colors.muted },
                                ]}
                                onPress={handleNext}
                                disabled={!canProceed() || loading}
                                activeOpacity={0.8}
                            >
                                {loading ? (
                                    <ActivityIndicator color="#FFFFFF" size="small" />
                                ) : (
                                    <>
                                        <Text style={styles.buttonText}>
                                            {isLastStep ? "Get Started" : 'Continue'}
                                        </Text>
                                        <ArrowRight color="#FFFFFF" size={20} />
                                    </>
                                )}
                            </TouchableOpacity>
                        </View>
                    </KeyboardAvoidingView>
                </View>
            </View>
        </>
    )
}

const getStyles = (isDark: boolean, colors: any) => StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0F172A' },
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
        backgroundColor: 'rgba(255,255,255,0.06)',
    },
    backBtnDisabled: { opacity: 0.3 },
    headerCenter: {
        flex: 1,
        alignItems: 'center',
    },
    headerSubtitle: {
        color: '#94A3B8',
        fontSize: 11,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 2,
    },

    skipButton: {
        paddingVertical: 8,
        paddingHorizontal: 12,
    },
    skipButtonText: {
        color: '#64748B',
        fontSize: 13,
        fontWeight: '600',
    },

    mainContent: {
        flex: 1,
    },
    mainContentScroll: {
        flexGrow: 1,
        paddingTop: 8,
        paddingBottom: 18,
    },
    stepPage: {
        flexGrow: 1,
        justifyContent: 'flex-start',
    },

    stepIndicator: {
        flexDirection: 'row',
        justifyContent: 'center',
        marginBottom: 18,
        gap: 8,
        paddingHorizontal: 20,
    },
    stepItem: { flex: 1 },
    stepBar: {
        height: 4,
        borderRadius: 2,
        backgroundColor: 'rgba(255,255,255,0.12)',
    },
    stepBarActive: { backgroundColor: isDark ? '#FFFFFF' : colors.accent },
    stepBarCompleted: { backgroundColor: '#10B981' },

    contentContainer: {
        paddingHorizontal: 20,
        paddingBottom: 12,
    },
    welcomeContainer: {
        paddingHorizontal: 20,
        paddingBottom: 8,
        alignItems: 'flex-start',
        justifyContent: 'center',
        flex: 1,
    },
    welcomeContent: {
        alignItems: 'flex-start',
        width: '100%',
    },
    welcomeIconBox: {
        width: 64,
        height: 64,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 22,
        borderWidth: 1,
        borderColor: 'rgba(249, 115, 22, 0.35)',
        overflow: 'hidden',
    },
    welcomeTitle: {
        fontSize: 29,
        fontWeight: '800',
        color: isDark ? 'white' : colors.foreground,
        marginBottom: 10,
        textAlign: 'left',
        lineHeight: 35,
    },
    welcomeSubtitle: {
        fontSize: 16,
        color: isDark ? '#94A3B8' : colors.textSecondary,
        textAlign: 'left',
        lineHeight: 24,
        marginBottom: 24,
    },
    welcomeFeatures: {
        width: '100%',
        gap: 12,
    },
    featureItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        backgroundColor: 'rgba(255,255,255,0.04)',
        padding: 14,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
    },
    featureIcon: {
        width: 44,
        height: 44,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    featureText: {
        color: isDark ? '#FFFFFF' : colors.foreground,
        fontSize: 14,
        fontWeight: '600',
    },

    stepHeader: { alignItems: 'flex-start', marginBottom: 18 },
    stepIconBox: {
        width: 46,
        height: 46,
        borderRadius: 14,
        backgroundColor: 'rgba(249, 115, 22, 0.18)',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 12,
        borderWidth: 1,
        borderColor: 'rgba(249, 115, 22, 0.25)',
    },
    stepTitle: {
        fontSize: 25,
        fontWeight: '800',
        color: isDark ? 'white' : colors.foreground,
        marginBottom: 8,
        textAlign: 'left',
        lineHeight: 31,
    },
    stepSubtitle: {
        fontSize: 14,
        color: isDark ? '#94A3B8' : colors.textSecondary,
        textAlign: 'left',
        lineHeight: 22
    },

    form: { gap: 16 },
    inputGroup: { gap: 9 },
    rowGroup: { flexDirection: 'row', gap: 12 },
    label: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
    optionalLabel: { fontSize: 12, color: '#64748B', fontWeight: '500' },
    hint: { fontSize: 13, color: '#64748B', marginTop: -4 },
    sectionHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    limitText: { fontSize: 12, color: colors.accent, fontWeight: '700' },

    inputContainer: {
        backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : colors.card,
        borderWidth: 1,
        borderColor: isDark ? 'rgba(255,255,255,0.1)' : colors.border,
        borderRadius: 16,
        minHeight: 58,
        justifyContent: 'center',
        overflow: 'hidden',
    },
    input: {
        flex: 1,
        paddingHorizontal: 16,
        paddingVertical: 14,
        color: isDark ? 'white' : colors.foreground,
        fontSize: 16,
        minHeight: 56,
    },

    pickerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : colors.card,
        borderWidth: 1,
        borderColor: isDark ? 'rgba(255,255,255,0.1)' : colors.border,
        borderRadius: 16,
        minHeight: 58,
        paddingHorizontal: 16,
        paddingVertical: 14,
        gap: 10,
    },
    flagLarge: { fontSize: 22 },
    pickerText: { flex: 1, color: isDark ? '#FFFFFF' : colors.foreground, fontSize: 15, fontWeight: '500' },

    yesNoRow: {
        flexDirection: 'row',
        gap: 10,
    },
    yesNoBtn: {
        flex: 1,
        minHeight: 54,
        paddingVertical: 14,
        borderRadius: 14,
        backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : colors.card,
        borderWidth: 1,
        borderColor: isDark ? 'rgba(255,255,255,0.1)' : colors.border,
        alignItems: 'center',
    },
    yesNoBtnSelected: {
        backgroundColor: `${colors.accent}20`,
        borderColor: colors.accent,
    },
    yesNoText: {
        fontSize: 15,
        fontWeight: '600',
        color: isDark ? '#94A3B8' : colors.textSecondary,
    },
    yesNoTextSelected: {
        color: colors.accent,
    },

    pursuitGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 2 },
    pursuitCard: {
        width: (SCREEN_WIDTH - 60) / 2,
        backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : colors.card,
        borderWidth: 1,
        borderColor: isDark ? 'rgba(255,255,255,0.1)' : colors.border,
        borderRadius: 16,
        minHeight: 82,
        padding: 14,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
    },
    pursuitCardSelected: {
        backgroundColor: `${colors.accent}15`,
        borderColor: colors.accent,
        borderWidth: 2,
    },
    pursuitIcon: { fontSize: 13, color: '#FFFFFF', fontWeight: '800' },
    pursuitLabel: { fontSize: 13, color: isDark ? '#94A3B8' : colors.textSecondary, textAlign: 'center', fontWeight: '600' },
    pursuitLabelSelected: { color: isDark ? '#FFFFFF' : colors.foreground },

    gradeScroll: {
        flexDirection: 'row',
        gap: 8,
        paddingRight: 10,
    },
    gradeChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 20,
        backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : colors.card,
        borderWidth: 1,
        borderColor: isDark ? 'rgba(255,255,255,0.1)' : colors.border,
    },
    gradeChipSelected: {
        backgroundColor: `${colors.accent}20`,
        borderColor: colors.accent,
    },
    gradeChipIcon: { fontSize: 18 },
    gradeChipText: { fontSize: 13, color: isDark ? '#94A3B8' : colors.textSecondary, fontWeight: '600' },
    gradeChipTextSelected: { color: isDark ? '#FFFFFF' : colors.foreground },

    schoolSearchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : colors.card,
        borderWidth: 1,
        borderColor: isDark ? 'rgba(255,255,255,0.1)' : colors.border,
        borderRadius: 16,
        minHeight: 58,
    },
    schoolInput: {
        flex: 1,
        paddingHorizontal: 16,
        paddingVertical: 14,
        color: isDark ? 'white' : colors.foreground,
        fontSize: 16,
        minHeight: 56,
    },
    schoolDropdownToggle: {
        padding: 14,
    },
    schoolDropdown: {
        backgroundColor: isDark ? '#1E293B' : colors.card,
        borderWidth: 1,
        borderColor: isDark ? 'rgba(255,255,255,0.2)' : colors.border,
        borderRadius: 16,
        marginTop: 8,
        maxHeight: 200,
        overflow: 'hidden',
    },
    schoolDropdownList: {
        maxHeight: 200,
    },
    schoolOption: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        gap: 10,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.05)',
    },
    schoolOptionText: { color: isDark ? '#FFFFFF' : colors.foreground, fontSize: 14, fontWeight: '500' },

    interestsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 2 },
    interestChip: {
        paddingHorizontal: 12,
        paddingVertical: 11,
        minHeight: 42,
        borderRadius: 20,
        backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : colors.card,
        borderWidth: 1,
        borderColor: isDark ? 'rgba(255,255,255,0.1)' : colors.border,
    },
    interestChipSelected: {
        backgroundColor: colors.accent,
        borderColor: colors.accent,
    },
    interestChipText: { color: isDark ? '#94A3B8' : colors.textSecondary, fontSize: 13, fontWeight: '600' },
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
        backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : colors.card,
        borderWidth: 1,
        borderColor: isDark ? 'rgba(255,255,255,0.1)' : colors.border,
    },
    ambitionChipSelected: {
        backgroundColor: colors.accent,
        borderColor: colors.accent,
    },
    ambitionChipIcon: { fontSize: 16 },
    ambitionChipText: { color: isDark ? '#94A3B8' : colors.textSecondary, fontSize: 13, fontWeight: '600' },
    ambitionChipTextSelected: { color: '#FFFFFF' },

    scrollContent: {
        flexGrow: 1,
    },

    footer: {
        paddingTop: 14,
        paddingHorizontal: 20,
        backgroundColor: isDark ? 'rgba(15, 23, 42, 0.96)' : 'rgba(255,255,255,0.96)',
        borderTopWidth: 1,
        borderTopColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)',
    },
    button: {
        width: '100%',
        backgroundColor: '#FFFFFF',
        paddingVertical: 16,
        borderRadius: 18,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.2,
        shadowRadius: 12,
        elevation: 8,
    },
    buttonDisabled: { opacity: 0.5 },
    buttonText: { color: '#000000', fontSize: 16, fontWeight: '800' },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
    modalBackdrop: { flex: 1 },
    modalKeyboardAvoiding: {
        width: '100%',
    },
    modalSheet: {
        backgroundColor: '#1E293B',
        borderTopLeftRadius: 36,
        borderTopRightRadius: 36,
        maxHeight: '88%',
        paddingBottom: Platform.OS === 'ios' ? 44 : 24,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        borderBottomWidth: 0,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 24,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.08)',
    },
    modalTitle: { fontSize: 18, fontWeight: '800', color: '#FFFFFF' },
    modalCloseBtn: {
        width: 36,
        height: 36,
        borderRadius: 10,
        backgroundColor: 'rgba(255,255,255,0.06)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    searchRow: {
        flexDirection: 'row',
        alignItems: 'center',
        margin: 20,
        backgroundColor: '#0F172A',
        borderRadius: 14,
        paddingHorizontal: 14,
        gap: 10,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    searchInput: { flex: 1, paddingVertical: 14, color: '#FFFFFF', fontSize: 14 },
    countryList: { maxHeight: 400 },
    countryRow: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        gap: 12,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.05)',
    },
    countryRowSelected: {
        backgroundColor: 'rgba(99, 102, 241, 0.1)',
    },
    flag: { fontSize: 22 },
    countryName: { flex: 1, color: '#FFFFFF', fontSize: 15, fontWeight: '500' },
    dialCode: { color: '#94A3B8', fontSize: 14, fontWeight: '600' },
})
