import React, { useState, useCallback } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    ScrollView,
    StyleSheet,
    Alert,
    ActivityIndicator,
    Image,
    Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
    ChevronLeft,
    Plus,
    Trash2,
    Upload,
    FileText,
    Link,
    Video,
    BookOpen,
    X,
    Check,
    ChevronDown,
    ChevronUp,
} from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useUser } from '@clerk/clerk-expo';
import { useTheme } from '../../../components/context/ThemeContext';
import { ScreenHeader } from '../../../components/ui/ScreenHeader';
import { supabase } from '../../../lib/supabase';
import { AdminGuard } from '../../../components/auth/AdminGuard';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';

const DIFFICULTY_LEVELS = ['Beginner', 'Intermediate', 'Advanced'] as const;
const CATEGORIES = ['Education', 'Programming', 'Business', 'Career', 'Design', 'Marketing', 'Other'] as const;
const RESOURCE_TYPES = ['article', 'video', 'course', 'tool', 'book', 'other'] as const;
const PRICE_OPTIONS = ['Free', 'Premium'] as const;

type Difficulty = typeof DIFFICULTY_LEVELS[number];
type Category = typeof CATEGORIES[number];
type ResourceType = typeof RESOURCE_TYPES[number];
type PriceType = typeof PRICE_OPTIONS[number];

interface Resource {
    id: string;
    title: string;
    description: string;
    url: string;
    type: ResourceType;
    cost: 'free' | 'paid';
    fileUrl?: string;
    fileName?: string;
}

interface Task {
    id: string;
    title: string;
    description: string;
    duration: string;
    outcome: string;
    resourceIds: string[];
}

interface Stage {
    id: string;
    title: string;
    description: string;
    duration: string;
    milestone: string;
    tasks: Task[];
    checkpoint: string;
}

function CreateRoadmapScreenContent() {
    const router = useRouter();
    const { user } = useUser();
    const { colors, isDark } = useTheme();
    const insets = useSafeAreaInsets();
    
    const [loading, setLoading] = useState(false);
    const [uploadingImage, setUploadingImage] = useState(false);
    const [uploadingFile, setUploadingFile] = useState<string | null>(null);
    
    // Basic Info
    const [title, setTitle] = useState('');
    const [summary, setSummary] = useState('');
    const [category, setCategory] = useState<Category>('Education');
    const [difficulty, setDifficulty] = useState<Difficulty>('Beginner');
    const [price, setPrice] = useState<PriceType>('Free');
    const [duration, setDuration] = useState('');
    const [coverImage, setCoverImage] = useState<string | null>(null);
    const [tags, setTags] = useState('');
    const [outcomes, setOutcomes] = useState('');
    
    // Resources
    const [resources, setResources] = useState<Resource[]>([]);
    const [showResourceForm, setShowResourceForm] = useState(false);
    const [newResource, setNewResource] = useState<Partial<Resource>>({
        type: 'article',
        cost: 'free',
    });
    
    // Roadmap Stages
    const [stages, setStages] = useState<Stage[]>([]);
    const [expandedStage, setExpandedStage] = useState<string | null>(null);
    
    const uploadToS3 = async (uri: string, fileName: string, contentType: string): Promise<string> => {
        try {
            // Generate unique filename
            const uniqueFileName = `${Date.now()}-${fileName}`;
            const filePath = `roadmaps/${user?.id}/${uniqueFileName}`;
            
            // Upload to Supabase Storage (S3)
            const { data, error } = await supabase.storage
                .from('resources')
                .upload(filePath, {
                    uri,
                    type: contentType,
                    name: fileName,
                } as any, {
                    cacheControl: '3600',
                    upsert: true,
                });
            
            if (error) throw error;
            
            // Get public URL
            const { data: { publicUrl } } = supabase.storage
                .from('resources')
                .getPublicUrl(filePath);
            
            return publicUrl;
        } catch (error) {
            console.error('Upload error:', error);
            throw error;
        }
    };
    
    const pickCoverImage = async () => {
        try {
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: true,
                aspect: [16, 9],
                quality: 0.8,
            });
            
            if (!result.canceled && result.assets[0]) {
                setUploadingImage(true);
                const publicUrl = await uploadToS3(
                    result.assets[0].uri,
                    result.assets[0].fileName || 'cover.jpg',
                    'image/jpeg'
                );
                setCoverImage(publicUrl);
            }
        } catch (error) {
            Alert.alert('Error', 'Failed to upload cover image');
        } finally {
            setUploadingImage(false);
        }
    };
    
    const addResource = async () => {
        if (!newResource.title || !newResource.url) {
            Alert.alert('Error', 'Please fill in resource title and URL');
            return;
        }
        
        const resource: Resource = {
            id: Date.now().toString(),
            title: newResource.title,
            description: newResource.description || '',
            url: newResource.url,
            type: newResource.type || 'article',
            cost: newResource.cost || 'free',
        };
        
        setResources([...resources, resource]);
        setNewResource({ type: 'article', cost: 'free' });
        setShowResourceForm(false);
    };
    
    const uploadResourceFile = async (resourceId: string) => {
        try {
            setUploadingFile(resourceId);
            const result = await DocumentPicker.getDocumentAsync({
                type: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
                copyToCacheDirectory: true,
            });
            
            if (!result.canceled && result.assets[0]) {
                const publicUrl = await uploadToS3(
                    result.assets[0].uri,
                    result.assets[0].name,
                    result.assets[0].mimeType || 'application/pdf'
                );
                
                setResources(resources.map(r => 
                    r.id === resourceId 
                        ? { ...r, fileUrl: publicUrl, fileName: result.assets[0].name }
                        : r
                ));
            }
        } catch (error) {
            Alert.alert('Error', 'Failed to upload file');
        } finally {
            setUploadingFile(null);
        }
    };
    
    const addStage = () => {
        const newStage: Stage = {
            id: Date.now().toString(),
            title: '',
            description: '',
            duration: '',
            milestone: '',
            tasks: [],
            checkpoint: '',
        };
        setStages([...stages, newStage]);
        setExpandedStage(newStage.id);
    };
    
    const addTaskToStage = (stageId: string) => {
        const newTask: Task = {
            id: Date.now().toString(),
            title: '',
            description: '',
            duration: '',
            outcome: '',
            resourceIds: [],
        };
        
        setStages(stages.map(stage => 
            stage.id === stageId 
                ? { ...stage, tasks: [...stage.tasks, newTask] }
                : stage
        ));
    };
    
    const updateStage = (stageId: string, field: keyof Stage, value: any) => {
        setStages(stages.map(stage => 
            stage.id === stageId 
                ? { ...stage, [field]: value }
                : stage
        ));
    };
    
    const updateTask = (stageId: string, taskId: string, field: keyof Task, value: any) => {
        setStages(stages.map(stage => 
            stage.id === stageId 
                ? {
                    ...stage,
                    tasks: stage.tasks.map(task =>
                        task.id === taskId ? { ...task, [field]: value } : task
                    )
                }
                : stage
        ));
    };
    
    const removeResource = (id: string) => {
        setResources(resources.filter(r => r.id !== id));
    };
    
    const removeStage = (id: string) => {
        setStages(stages.filter(s => s.id !== id));
    };
    
    const removeTask = (stageId: string, taskId: string) => {
        setStages(stages.map(stage => 
            stage.id === stageId 
                ? { ...stage, tasks: stage.tasks.filter(t => t.id !== taskId) }
                : stage
        ));
    };
    
    const handleSubmit = async () => {
        if (!title || !summary || stages.length === 0) {
            Alert.alert('Error', 'Please fill in title, summary, and at least one stage');
            return;
        }
        
        setLoading(true);
        try {
            const storyData = {
                title,
                summary,
                category,
                difficulty,
                price,
                duration,
                image: coverImage,
                tags: tags.split(',').map(t => t.trim()).filter(Boolean),
                outcomes: outcomes.split('\n').filter(Boolean),
                resources: resources.map(r => ({
                    ...r,
                    fileUrl: r.fileUrl || null,
                    fileName: r.fileName || null,
                })),
                roadmap: stages.map((stage, idx) => ({
                    ...stage,
                    order: idx,
                })),
                creator: {
                    name: user?.fullName || 'Admin',
                    title: 'Admin',
                    avatar: user?.imageUrl,
                    email: user?.primaryEmailAddress?.emailAddress,
                    verified: true,
                },
                    type: 'roadmap',
                    status: 'approved', // Auto-approve for admin
                stats: {
                    rating: 0,
                    users: 0,
                    successRate: 0,
                },
            };
            
            const { error } = await supabase
                .from('community_stories')
                .insert(storyData);
            
            if (error) throw error;
            
            Alert.alert(
                'Success',
                'Roadmap created successfully!',
                [{ text: 'OK', onPress: () => router.push('/roadmaps') }]
            );
        } catch (error) {
            console.error('Submit error:', error);
            Alert.alert('Error', 'Failed to create roadmap. Please try again.');
        } finally {
            setLoading(false);
        }
    };
    
    const getResourceIcon = (type: ResourceType) => {
        switch (type) {
            case 'video': return Video;
            case 'book': return BookOpen;
            default: return FileText;
        }
    };
    
    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
            <ScreenHeader
                title="Create Roadmap"
                showBack
                onBack={() => router.back()}
            />
            
            <ScrollView 
                style={styles.scrollView}
                contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
                showsVerticalScrollIndicator={false}
            >
                {/* Basic Info Section */}
                <View style={styles.section}>
                    <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Basic Information</Text>
                    
                    {/* Cover Image */}
                    <TouchableOpacity 
                        onPress={pickCoverImage}
                        style={[styles.coverImageContainer, { backgroundColor: colors.border }]}
                    >
                        {coverImage ? (
                            <Image source={{ uri: coverImage }} style={styles.coverImage} />
                        ) : (
                            <View style={styles.coverPlaceholder}>
                                {uploadingImage ? (
                                    <ActivityIndicator color={colors.primary} />
                                ) : (
                                    <>
                                        <Upload size={32} color={colors.muted} />
                                        <Text style={[styles.coverText, { color: colors.muted }]}>
                                            Upload Cover Image
                                        </Text>
                                    </>
                                )}
                            </View>
                        )}
                    </TouchableOpacity>
                    
                    {/* Title */}
                    <View style={styles.inputGroup}>
                        <Text style={[styles.label, { color: colors.muted }]}>Title</Text>
                        <TextInput
                            style={[styles.input, { 
                                backgroundColor: colors.card,
                                color: colors.foreground,
                                borderColor: colors.border,
                            }]}
                            value={title}
                            onChangeText={setTitle}
                            placeholder="e.g., Complete Web Development Bootcamp"
                            placeholderTextColor={colors.muted}
                        />
                    </View>
                    
                    {/* Summary */}
                    <View style={styles.inputGroup}>
                        <Text style={[styles.label, { color: colors.muted }]}>Summary</Text>
                        <TextInput
                            style={[styles.textArea, { 
                                backgroundColor: colors.card,
                                color: colors.foreground,
                                borderColor: colors.border,
                            }]}
                            value={summary}
                            onChangeText={setSummary}
                            placeholder="Brief description of this roadmap..."
                            placeholderTextColor={colors.muted}
                            multiline
                            numberOfLines={3}
                        />
                    </View>
                    
                    {/* Category & Difficulty */}
                    <View style={styles.row}>
                        <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
                            <Text style={[styles.label, { color: colors.muted }]}>Category</Text>
                            <View style={[styles.select, { backgroundColor: colors.card, borderColor: colors.border }]}>
                                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                    {CATEGORIES.map(cat => (
                                        <TouchableOpacity
                                            key={cat}
                                            onPress={() => setCategory(cat)}
                                            style={[
                                                styles.selectOption,
                                                category === cat && { backgroundColor: colors.primary }
                                            ]}
                                        >
                                            <Text style={[
                                                styles.selectText,
                                                { color: category === cat ? '#fff' : colors.foreground }
                                            ]}>
                                                {cat}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </ScrollView>
                            </View>
                        </View>
                        
                        <View style={[styles.inputGroup, { flex: 1, marginLeft: 8 }]}>
                            <Text style={[styles.label, { color: colors.muted }]}>Difficulty</Text>
                            <View style={[styles.select, { backgroundColor: colors.card, borderColor: colors.border }]}>
                                {DIFFICULTY_LEVELS.map(diff => (
                                    <TouchableOpacity
                                        key={diff}
                                        onPress={() => setDifficulty(diff)}
                                        style={[
                                            styles.selectOption,
                                            difficulty === diff && { backgroundColor: colors.primary }
                                        ]}
                                    >
                                        <Text style={[
                                            styles.selectText,
                                            { color: difficulty === diff ? '#fff' : colors.foreground }
                                        ]}>
                                            {diff}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>
                    </View>
                    
                    {/* Price & Duration */}
                    <View style={styles.row}>
                        <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
                            <Text style={[styles.label, { color: colors.muted }]}>Price</Text>
                            <View style={[styles.select, { backgroundColor: colors.card, borderColor: colors.border }]}>
                                {PRICE_OPTIONS.map(p => (
                                    <TouchableOpacity
                                        key={p}
                                        onPress={() => setPrice(p)}
                                        style={[
                                            styles.selectOption,
                                            price === p && { backgroundColor: p === 'Free' ? '#10B981' : '#F59E0B' }
                                        ]}
                                    >
                                        <Text style={[
                                            styles.selectText,
                                            { color: price === p ? '#fff' : colors.foreground }
                                        ]}>
                                            {p}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>
                        
                        <View style={[styles.inputGroup, { flex: 1, marginLeft: 8 }]}>
                            <Text style={[styles.label, { color: colors.muted }]}>Duration</Text>
                            <TextInput
                                style={[styles.input, { 
                                    backgroundColor: colors.card,
                                    color: colors.foreground,
                                    borderColor: colors.border,
                                }]}
                                value={duration}
                                onChangeText={setDuration}
                                placeholder="e.g., 3 months"
                                placeholderTextColor={colors.muted}
                            />
                        </View>
                    </View>
                    
                    {/* Tags */}
                    <View style={styles.inputGroup}>
                        <Text style={[styles.label, { color: colors.muted }]}>Tags (comma separated)</Text>
                        <TextInput
                            style={[styles.input, { 
                                backgroundColor: colors.card,
                                color: colors.foreground,
                                borderColor: colors.border,
                            }]}
                            value={tags}
                            onChangeText={setTags}
                            placeholder="e.g., javascript, react, web development"
                            placeholderTextColor={colors.muted}
                        />
                    </View>
                    
                    {/* Outcomes */}
                    <View style={styles.inputGroup}>
                        <Text style={[styles.label, { color: colors.muted }]}>Learning Outcomes (one per line)</Text>
                        <TextInput
                            style={[styles.textArea, { 
                                backgroundColor: colors.card,
                                color: colors.foreground,
                                borderColor: colors.border,
                            }]}
                            value={outcomes}
                            onChangeText={setOutcomes}
                            placeholder="- Build full-stack applications\n- Master React and Node.js\n- Deploy to production"
                            placeholderTextColor={colors.muted}
                            multiline
                            numberOfLines={4}
                        />
                    </View>
                </View>
                
                {/* Resources Section */}
                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Resources</Text>
                        <TouchableOpacity 
                            onPress={() => setShowResourceForm(!showResourceForm)}
                            style={[styles.addButton, { backgroundColor: colors.primary }]}
                        >
                            <Plus size={20} color="#fff" />
                        </TouchableOpacity>
                    </View>
                    
                    {/* Resource Form */}
                    {showResourceForm && (
                        <View style={[styles.formCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                            <TextInput
                                style={[styles.input, { 
                                    backgroundColor: colors.background,
                                    color: colors.foreground,
                                    borderColor: colors.border,
                                }]}
                                placeholder="Resource Title"
                                placeholderTextColor={colors.muted}
                                value={newResource.title || ''}
                                onChangeText={text => setNewResource({ ...newResource, title: text })}
                            />
                            <TextInput
                                style={[styles.input, { 
                                    backgroundColor: colors.background,
                                    color: colors.foreground,
                                    borderColor: colors.border,
                                    marginTop: 8,
                                }]}
                                placeholder="Description"
                                placeholderTextColor={colors.muted}
                                value={newResource.description || ''}
                                onChangeText={text => setNewResource({ ...newResource, description: text })}
                            />
                            <TextInput
                                style={[styles.input, { 
                                    backgroundColor: colors.background,
                                    color: colors.foreground,
                                    borderColor: colors.border,
                                    marginTop: 8,
                                }]}
                                placeholder="URL"
                                placeholderTextColor={colors.muted}
                                value={newResource.url || ''}
                                onChangeText={text => setNewResource({ ...newResource, url: text })}
                                autoCapitalize="none"
                                keyboardType="url"
                            />
                            
                            <View style={[styles.row, { marginTop: 8 }]}>
                                <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
                                    <Text style={[styles.label, { color: colors.muted, fontSize: 12 }]}>Type</Text>
                                    <View style={[styles.select, { backgroundColor: colors.background, borderColor: colors.border }]}>
                                        {RESOURCE_TYPES.map(type => (
                                            <TouchableOpacity
                                                key={type}
                                                onPress={() => setNewResource({ ...newResource, type })}
                                                style={[
                                                    styles.selectOptionSmall,
                                                    newResource.type === type && { backgroundColor: colors.primary }
                                                ]}
                                            >
                                                <Text style={[
                                                    styles.selectTextSmall,
                                                    { color: newResource.type === type ? '#fff' : colors.foreground }
                                                ]}>
                                                    {type}
                                                </Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                </View>
                                
                                <View style={[styles.inputGroup, { flex: 1, marginLeft: 8 }]}>
                                    <Text style={[styles.label, { color: colors.muted, fontSize: 12 }]}>Cost</Text>
                                    <View style={[styles.select, { backgroundColor: colors.background, borderColor: colors.border }]}>
                                        {['free', 'paid'].map(cost => (
                                            <TouchableOpacity
                                                key={cost}
                                                onPress={() => setNewResource({ ...newResource, cost: cost as 'free' | 'paid' })}
                                                style={[
                                                    styles.selectOptionSmall,
                                                    newResource.cost === cost && { backgroundColor: cost === 'free' ? '#10B981' : '#F59E0B' }
                                                ]}
                                            >
                                                <Text style={[
                                                    styles.selectTextSmall,
                                                    { color: newResource.cost === cost ? '#fff' : colors.foreground }
                                                ]}>
                                                    {cost}
                                                </Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                </View>
                            </View>
                            
                            <TouchableOpacity
                                onPress={addResource}
                                style={[styles.submitResourceBtn, { backgroundColor: colors.primary, marginTop: 12 }]}
                            >
                                <Text style={styles.submitResourceText}>Add Resource</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                    
                    {/* Resources List */}
                    {resources.map(resource => {
                        const Icon = getResourceIcon(resource.type);
                        return (
                            <View 
                                key={resource.id} 
                                style={[styles.resourceCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                            >
                                <View style={styles.resourceHeader}>
                                    <View style={[styles.resourceIcon, { backgroundColor: colors.border }]}>
                                        <Icon size={20} color={colors.primary} />
                                    </View>
                                    <View style={styles.resourceInfo}>
                                        <Text style={[styles.resourceTitle, { color: colors.foreground }]} numberOfLines={1}>
                                            {resource.title}
                                        </Text>
                                        <Text style={[styles.resourceMeta, { color: colors.muted }]}>
                                            {resource.type} • {resource.cost}
                                        </Text>
                                    </View>
                                    <TouchableOpacity onPress={() => removeResource(resource.id)}>
                                        <Trash2 size={18} color="#EF4444" />
                                    </TouchableOpacity>
                                </View>
                                
                                {/* File Upload */}
                                <TouchableOpacity
                                    onPress={() => uploadResourceFile(resource.id)}
                                    style={[styles.fileUploadBtn, { borderColor: colors.border }]}
                                    disabled={uploadingFile === resource.id}
                                >
                                    {uploadingFile === resource.id ? (
                                        <ActivityIndicator size="small" color={colors.primary} />
                                    ) : resource.fileUrl ? (
                                        <>
                                            <FileText size={16} color="#10B981" />
                                            <Text style={[styles.fileText, { color: '#10B981' }]} numberOfLines={1}>
                                                {resource.fileName}
                                            </Text>
                                        </>
                                    ) : (
                                        <>
                                            <Upload size={16} color={colors.muted} />
                                            <Text style={[styles.fileText, { color: colors.muted }]}>
                                                Upload PDF/Doc (optional)
                                            </Text>
                                        </>
                                    )}
                                </TouchableOpacity>
                            </View>
                        );
                    })}
                </View>
                
                {/* Roadmap Stages Section */}
                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Roadmap Stages</Text>
                        <TouchableOpacity 
                            onPress={addStage}
                            style={[styles.addButton, { backgroundColor: colors.primary }]}
                        >
                            <Plus size={20} color="#fff" />
                        </TouchableOpacity>
                    </View>
                    
                    {stages.map((stage, stageIndex) => (
                        <View 
                            key={stage.id} 
                            style={[styles.stageCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                        >
                            {/* Stage Header */}
                            <TouchableOpacity 
                                onPress={() => setExpandedStage(expandedStage === stage.id ? null : stage.id)}
                                style={styles.stageHeader}
                            >
                                <View style={[styles.stageNumber, { backgroundColor: colors.primary }]}>
                                    <Text style={styles.stageNumberText}>{stageIndex + 1}</Text>
                                </View>
                                <TextInput
                                    style={[styles.stageTitleInput, { color: colors.foreground, flex: 1 }]}
                                    placeholder={`Stage ${stageIndex + 1} Title`}
                                    placeholderTextColor={colors.muted}
                                    value={stage.title}
                                    onChangeText={text => updateStage(stage.id, 'title', text)}
                                />
                                <TouchableOpacity onPress={() => removeStage(stage.id)}>
                                    <Trash2 size={18} color="#EF4444" />
                                </TouchableOpacity>
                                {expandedStage === stage.id ? (
                                    <ChevronUp size={20} color={colors.muted} />
                                ) : (
                                    <ChevronDown size={20} color={colors.muted} />
                                )}
                            </TouchableOpacity>
                            
                            {/* Expanded Stage Content */}
                            {expandedStage === stage.id && (
                                <View style={styles.stageContent}>
                                    <TextInput
                                        style={[styles.input, { 
                                            backgroundColor: colors.background,
                                            color: colors.foreground,
                                            borderColor: colors.border,
                                        }]}
                                        placeholder="Stage Description"
                                        placeholderTextColor={colors.muted}
                                        value={stage.description}
                                        onChangeText={text => updateStage(stage.id, 'description', text)}
                                        multiline
                                        numberOfLines={2}
                                    />
                                    
                                    <View style={styles.row}>
                                        <TextInput
                                            style={[styles.input, { 
                                                backgroundColor: colors.background,
                                                color: colors.foreground,
                                                borderColor: colors.border,
                                                flex: 1,
                                                marginRight: 8,
                                            }]}
                                            placeholder="Duration (e.g., 2 weeks)"
                                            placeholderTextColor={colors.muted}
                                            value={stage.duration}
                                            onChangeText={text => updateStage(stage.id, 'duration', text)}
                                        />
                                        <TextInput
                                            style={[styles.input, { 
                                                backgroundColor: colors.background,
                                                color: colors.foreground,
                                                borderColor: colors.border,
                                                flex: 1,
                                                marginLeft: 8,
                                            }]}
                                            placeholder="Milestone"
                                            placeholderTextColor={colors.muted}
                                            value={stage.milestone}
                                            onChangeText={text => updateStage(stage.id, 'milestone', text)}
                                        />
                                    </View>
                                    
                                    {/* Tasks */}
                                    <Text style={[styles.subSectionTitle, { color: colors.muted, marginTop: 16 }]}>
                                        Tasks
                                    </Text>
                                    
                                    {stage.tasks.map((task, taskIndex) => (
                                        <View 
                                            key={task.id} 
                                            style={[styles.taskCard, { backgroundColor: colors.background, borderColor: colors.border }]}
                                        >
                                            <View style={styles.taskHeader}>
                                                <View style={[styles.taskNumber, { backgroundColor: colors.border }]}>
                                                    <Text style={[styles.taskNumberText, { color: colors.foreground }]}>
                                                        {taskIndex + 1}
                                                    </Text>
                                                </View>
                                                <TextInput
                                                    style={[styles.taskTitleInput, { color: colors.foreground, flex: 1 }]}
                                                    placeholder="Task Title"
                                                    placeholderTextColor={colors.muted}
                                                    value={task.title}
                                                    onChangeText={text => updateTask(stage.id, task.id, 'title', text)}
                                                />
                                                <TouchableOpacity onPress={() => removeTask(stage.id, task.id)}>
                                                    <X size={16} color={colors.muted} />
                                                </TouchableOpacity>
                                            </View>
                                            
                                            <TextInput
                                                style={[styles.input, { 
                                                    backgroundColor: colors.card,
                                                    color: colors.foreground,
                                                    borderColor: colors.border,
                                                    marginTop: 8,
                                                }]}
                                                placeholder="Task Description"
                                                placeholderTextColor={colors.muted}
                                                value={task.description}
                                                onChangeText={text => updateTask(stage.id, task.id, 'description', text)}
                                                multiline
                                                numberOfLines={2}
                                            />
                                            
                                            <View style={styles.row}>
                                                <TextInput
                                                    style={[styles.input, { 
                                                        backgroundColor: colors.card,
                                                        color: colors.foreground,
                                                        borderColor: colors.border,
                                                        flex: 1,
                                                        marginRight: 8,
                                                        marginTop: 8,
                                                    }]}
                                                    placeholder="Duration"
                                                    placeholderTextColor={colors.muted}
                                                    value={task.duration}
                                                    onChangeText={text => updateTask(stage.id, task.id, 'duration', text)}
                                                />
                                                <TextInput
                                                    style={[styles.input, { 
                                                        backgroundColor: colors.card,
                                                        color: colors.foreground,
                                                        borderColor: colors.border,
                                                        flex: 1,
                                                        marginLeft: 8,
                                                        marginTop: 8,
                                                    }]}
                                                    placeholder="Expected Outcome"
                                                    placeholderTextColor={colors.muted}
                                                    value={task.outcome}
                                                    onChangeText={text => updateTask(stage.id, task.id, 'outcome', text)}
                                                />
                                            </View>
                                        </View>
                                    ))}
                                    
                                    <TouchableOpacity
                                        onPress={() => addTaskToStage(stage.id)}
                                        style={[styles.addTaskBtn, { borderColor: colors.primary }]}
                                    >
                                        <Plus size={16} color={colors.primary} />
                                        <Text style={[styles.addTaskText, { color: colors.primary }]}>Add Task</Text>
                                    </TouchableOpacity>
                                    
                                    {/* Checkpoint */}
                                    <TextInput
                                        style={[styles.input, { 
                                            backgroundColor: colors.background,
                                            color: colors.foreground,
                                            borderColor: colors.border,
                                            marginTop: 16,
                                        }]}
                                        placeholder="Checkpoint / Deliverable"
                                        placeholderTextColor={colors.muted}
                                        value={stage.checkpoint}
                                        onChangeText={text => updateStage(stage.id, 'checkpoint', text)}
                                    />
                                </View>
                            )}
                        </View>
                    ))}
                </View>
                
                {/* Submit Button */}
                <TouchableOpacity
                    onPress={handleSubmit}
                    disabled={loading}
                    style={[styles.submitBtn, { backgroundColor: colors.primary, opacity: loading ? 0.7 : 1 }]}
                >
                    {loading ? (
                        <ActivityIndicator color="#fff" />
                    ) : (
                        <>
                            <Check size={20} color="#fff" />
                            <Text style={styles.submitBtnText}>Create Roadmap</Text>
                        </>
                    )}
                </TouchableOpacity>
            </ScrollView>
        </SafeAreaView>
    );
}

export default function CreateRoadmapScreen() {
    return (
        <AdminGuard>
            <CreateRoadmapScreenContent />
        </AdminGuard>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    scrollView: {
        flex: 1,
    },
    section: {
        padding: 20,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(0,0,0,0.05)',
    },
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    sectionTitle: {
        fontSize: 20,
        fontWeight: '600',
    },
    subSectionTitle: {
        fontSize: 14,
        fontWeight: '600',
        marginBottom: 8,
    },
    addButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
    formCard: {
        padding: 16,
        borderRadius: 16,
        borderWidth: 1,
        marginBottom: 12,
    },
    inputGroup: {
        marginBottom: 16,
    },
    label: {
        fontSize: 14,
        fontWeight: '500',
        marginBottom: 8,
    },
    input: {
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 12,
        fontSize: 15,
        borderWidth: 1,
    },
    textArea: {
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 12,
        fontSize: 15,
        borderWidth: 1,
        textAlignVertical: 'top',
    },
    row: {
        flexDirection: 'row',
    },
    select: {
        flexDirection: 'row',
        borderRadius: 12,
        padding: 4,
        borderWidth: 1,
    },
    selectOption: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 8,
        marginHorizontal: 2,
    },
    selectText: {
        fontSize: 13,
        fontWeight: '600',
    },
    selectOptionSmall: {
        paddingHorizontal: 8,
        paddingVertical: 6,
        borderRadius: 6,
        marginHorizontal: 2,
    },
    selectTextSmall: {
        fontSize: 11,
        fontWeight: '600',
        textTransform: 'capitalize',
    },
    // Cover Image
    coverImageContainer: {
        height: 180,
        borderRadius: 16,
        overflow: 'hidden',
        marginBottom: 16,
    },
    coverImage: {
        width: '100%',
        height: '100%',
    },
    coverPlaceholder: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    coverText: {
        marginTop: 8,
        fontSize: 14,
    },
    // Resource Card
    resourceCard: {
        padding: 16,
        borderRadius: 16,
        borderWidth: 1,
        marginBottom: 12,
    },
    resourceHeader: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    resourceIcon: {
        width: 40,
        height: 40,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    resourceInfo: {
        flex: 1,
        marginLeft: 12,
    },
    resourceTitle: {
        fontSize: 15,
        fontWeight: '600',
    },
    resourceMeta: {
        fontSize: 12,
        marginTop: 2,
        textTransform: 'capitalize',
    },
    fileUploadBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 12,
        padding: 12,
        borderRadius: 8,
        borderWidth: 1,
        borderStyle: 'dashed',
    },
    fileText: {
        marginLeft: 8,
        fontSize: 13,
        flex: 1,
    },
    submitResourceBtn: {
        padding: 12,
        borderRadius: 10,
        alignItems: 'center',
    },
    submitResourceText: {
        color: '#fff',
        fontWeight: '600',
        fontSize: 15,
    },
    // Stage Card
    stageCard: {
        borderRadius: 16,
        borderWidth: 1,
        marginBottom: 12,
        overflow: 'hidden',
    },
    stageHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
    },
    stageNumber: {
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    stageNumberText: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 14,
    },
    stageTitleInput: {
        fontSize: 16,
        fontWeight: '600',
        marginHorizontal: 12,
    },
    stageContent: {
        padding: 16,
        paddingTop: 0,
    },
    // Task Card
    taskCard: {
        padding: 12,
        borderRadius: 12,
        borderWidth: 1,
        marginBottom: 8,
    },
    taskHeader: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    taskNumber: {
        width: 24,
        height: 24,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    taskNumberText: {
        fontSize: 12,
        fontWeight: '600',
    },
    taskTitleInput: {
        fontSize: 14,
        fontWeight: '500',
        marginHorizontal: 8,
    },
    addTaskBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 10,
        borderRadius: 8,
        borderWidth: 1,
        borderStyle: 'dashed',
        marginTop: 8,
    },
    addTaskText: {
        marginLeft: 6,
        fontWeight: '600',
        fontSize: 13,
    },
    // Submit Button
    submitBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        margin: 20,
        padding: 16,
        borderRadius: 16,
        gap: 8,
    },
    submitBtnText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
});
