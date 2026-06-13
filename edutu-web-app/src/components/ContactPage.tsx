import React, { useState } from 'react';
import {
    Mail,
    MapPin,
    Twitter,
    Linkedin,
    Github,
    Send,
    Sparkles,
    CheckCircle,
    AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDarkMode } from '../hooks/useDarkMode';
import { Link } from 'react-router-dom';
import PublicSiteMenu from './PublicSiteMenu';

interface FormData {
    fullName: string;
    email: string;
    subject: string;
    message: string;
}

interface FormErrors {
    fullName?: string;
    email?: string;
    subject?: string;
    message?: string;
}

interface FaqItem {
    question: string;
    answer: string;
}

const ContactPage: React.FC = () => {
    const { isDarkMode, toggleDarkMode } = useDarkMode();
    const [formData, setFormData] = useState<FormData>({
        fullName: '',
        email: '',
        subject: '',
        message: ''
    });
    const [errors, setErrors] = useState<FormErrors>({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSubmitted, setIsSubmitted] = useState(false);
    const [openFaq, setOpenFaq] = useState<number | null>(null);

    const webflowShadow = isDarkMode
        ? '0 84px 24px rgba(0,0,0,0.3), 0 54px 22px rgba(0,0,0,0.2), 0 30px 18px rgba(0,0,0,0.15), 0 13px 13px rgba(0,0,0,0.1), 0 3px 7px rgba(0,0,0,0.08)'
        : '0 84px 24px rgba(0,0,0,0), 0 54px 22px rgba(0,0,0,0.01), 0 30px 18px rgba(0,0,0,0.04), 0 13px 13px rgba(0,0,0,0.08), 0 3px 7px rgba(0,0,0,0.09)';

    const cardShadow = isDarkMode
        ? '0 1px 0 rgba(255,255,255,0.1), 0 13px 13px rgba(0,0,0,0.2), 0 3px 7px rgba(0,0,0,0.1)'
        : '0 1px 0 #d8d8d8, 0 13px 13px rgba(0,0,0,0.04), 0 3px 7px rgba(0,0,0,0.08)';

    const validateEmail = (email: string): boolean => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    };

    const validateForm = (): boolean => {
        const newErrors: FormErrors = {};

        if (!formData.fullName.trim()) {
            newErrors.fullName = 'Full name is required';
        }

        if (!formData.email.trim()) {
            newErrors.email = 'Email is required';
        } else if (!validateEmail(formData.email)) {
            newErrors.email = 'Please enter a valid email address';
        }

        if (!formData.subject.trim()) {
            newErrors.subject = 'Subject is required';
        }

        if (!formData.message.trim()) {
            newErrors.message = 'Message is required';
        } else if (formData.message.trim().length < 10) {
            newErrors.message = 'Message must be at least 10 characters';
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!validateForm()) return;

        setIsSubmitting(true);

        await new Promise((resolve) => setTimeout(resolve, 1500));

        console.log('Form submitted:', formData);

        setIsSubmitting(false);
        setIsSubmitted(true);

        setTimeout(() => {
            setIsSubmitted(false);
            setFormData({ fullName: '', email: '', subject: '', message: '' });
        }, 4000);
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
        if (errors[name as keyof FormErrors]) {
            setErrors((prev) => ({ ...prev, [name]: undefined }));
        }
    };

    const faqs: FaqItem[] = [
        {
            question: 'How do I reset my password?',
            answer: 'Click on "Forgot Password" on the login page and follow the instructions sent to your email.'
        },
        {
            question: 'Can I use Edutu for free?',
            answer: 'Yes! Our Free tier includes browsing opportunities, basic AI roadmaps, goal tracking, and community access.'
        },
        {
            question: 'How do I contact support?',
            answer: 'You can reach us at support@edutu.org or use this contact form. We typically respond within 24 hours.'
        },
        {
            question: 'Is my data secure?',
            answer: 'Absolutely. We use industry-standard encryption and never share your personal data with third parties.'
        }
    ];

    const inputBaseStyle: React.CSSProperties = {
        width: '100%',
        padding: '14px 16px',
        fontSize: '16px',
        fontFamily: "'Inter', system-ui, sans-serif",
        backgroundColor: isDarkMode ? '#111' : '#fafafa',
        border: `1px solid ${isDarkMode ? '#333' : '#d8d8d8'}`,
        borderRadius: '4px',
        color: isDarkMode ? '#f5f5f5' : '#080808',
        outline: 'none',
        transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
        boxSizing: 'border-box' as const
    };

    const labelStyle: React.CSSProperties = {
        display: 'block',
        fontSize: '11px',
        fontWeight: 600,
        letterSpacing: '1.5px',
        marginBottom: '8px',
        color: isDarkMode ? '#ababab' : '#5a5a5a'
    };

    return (
        <div className="min-h-[100dvh] overflow-x-hidden" style={{ backgroundColor: isDarkMode ? '#080808' : '#ffffff', color: isDarkMode ? '#f5f5f5' : '#080808', fontFamily: "'Inter', 'Arial', sans-serif" }}>
            {/* Navigation Header */}
            <header className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md transition-colors duration-300" style={{ backgroundColor: isDarkMode ? 'rgba(8, 8, 8, 0.95)' : 'rgba(255, 255, 255, 0.95)', borderBottom: `1px solid ${isDarkMode ? '#222' : '#d8d8d8'}` }}>
                <div className="max-w-[1200px] mx-auto px-4 sm:px-6 h-[64px] flex items-center justify-between">
                    <Link to="/" className="flex items-center gap-2 cursor-pointer" style={{ textDecoration: 'none' }}>
                        <img src="/edutu-logo.png" alt="Edutu" className="h-8 w-8 object-contain" />
                        <span className="font-bold text-xl tracking-tight" style={{ color: isDarkMode ? '#ffffff' : '#080808' }}>
                            edutu
                        </span>
                    </Link>

                    <PublicSiteMenu />
                </div>
            </header>

            <main className="pt-[120px] pb-[96px] px-4 sm:px-6">
                <div className="max-w-[1200px] mx-auto">
                    {/* Hero Section */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6 }}
                        className="text-center mb-16"
                    >
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.6 }}
                            className="inline-flex items-center gap-2 px-4 py-2 mb-8 rounded"
                            style={{
                                backgroundColor: isDarkMode ? '#146ef510' : '#146ef510',
                                border: `1px solid ${isDarkMode ? '#146ef530' : '#146ef530'}`,
                                borderRadius: '4px'
                            }}
                        >
                            <Mail size={14} style={{ color: '#146ef5' }} />
                            <span className="text-[12px] font-semibold tracking-[1.5px]" style={{ color: '#146ef5' }}>
                                Get in Touch
                            </span>
                        </motion.div>

                        <motion.h1
                            initial={{ opacity: 0, y: 30 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.6, delay: 0.1 }}
                            className="text-[48px] sm:text-[64px] md:text-[72px] font-semibold leading-[1.04] tracking-[-0.8px] mb-6"
                            style={{ color: isDarkMode ? '#ffffff' : '#080808' }}
                        >
                            Contact <span style={{ color: '#146ef5' }}>Us</span>
                        </motion.h1>

                        <motion.p
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.6, delay: 0.2 }}
                            className="max-w-[600px] mx-auto text-[18px] leading-[1.6]"
                            style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}
                        >
                            Have a question, feedback, or partnership inquiry? We'd love to hear from you. Fill out the form below and we'll get back to you within 24 hours.
                        </motion.p>
                    </motion.div>

                    {/* Main Content: Form + Contact Info */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-16">
                        {/* Contact Form */}
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.6, delay: 0.3 }}
                            className="lg:col-span-2 p-8 sm:p-10"
                            style={{
                                backgroundColor: isDarkMode ? '#111' : '#ffffff',
                                border: `1px solid ${isDarkMode ? '#222' : '#d8d8d8'}`,
                                borderRadius: '8px',
                                boxShadow: cardShadow
                            }}
                        >
                            <AnimatePresence mode="wait">
                                {isSubmitted ? (
                                    <motion.div
                                        key="success"
                                        initial={{ opacity: 0, scale: 0.95 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.95 }}
                                        transition={{ duration: 0.3 }}
                                        className="flex flex-col items-center justify-center py-12 text-center"
                                    >
                                        <div className="h-16 w-16 flex items-center justify-center rounded-full mb-6" style={{ backgroundColor: '#10B98120' }}>
                                            <CheckCircle size={32} style={{ color: '#10B981' }} />
                                        </div>
                                        <h3 className="text-[24px] font-semibold mb-3" style={{ color: isDarkMode ? '#ffffff' : '#080808' }}>
                                            Message Sent!
                                        </h3>
                                        <p className="text-[16px] leading-[1.6]" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>
                                            Thank you for reaching out. We'll get back to you shortly.
                                        </p>
                                    </motion.div>
                                ) : (
                                    <motion.form
                                        key="form"
                                        onSubmit={handleSubmit}
                                        initial={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        className="space-y-6"
                                    >
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                            <div>
                                                <label htmlFor="fullName" style={labelStyle}>
                                                    Full Name
                                                </label>
                                                <input
                                                    type="text"
                                                    id="fullName"
                                                    name="fullName"
                                                    value={formData.fullName}
                                                    onChange={handleChange}
                                                    placeholder="John Doe"
                                                    style={{
                                                        ...inputBaseStyle,
                                                        borderColor: errors.fullName ? '#EF4444' : isDarkMode ? '#333' : '#d8d8d8',
                                                        boxShadow: errors.fullName ? '0 0 0 3px rgba(239, 68, 68, 0.15)' : 'none'
                                                    }}
                                                    onFocus={(e) => {
                                                        if (!errors.fullName) {
                                                            e.currentTarget.style.borderColor = '#146ef5';
                                                            e.currentTarget.style.boxShadow = '0 0 0 3px rgba(20, 110, 245, 0.15)';
                                                        }
                                                    }}
                                                    onBlur={(e) => {
                                                        if (!errors.fullName) {
                                                            e.currentTarget.style.borderColor = isDarkMode ? '#333' : '#d8d8d8';
                                                            e.currentTarget.style.boxShadow = 'none';
                                                        }
                                                    }}
                                                />
                                                <AnimatePresence>
                                                    {errors.fullName && (
                                                        <motion.div
                                                            initial={{ opacity: 0, y: -5 }}
                                                            animate={{ opacity: 1, y: 0 }}
                                                            exit={{ opacity: 0, y: -5 }}
                                                            className="flex items-center gap-1.5 mt-2"
                                                        >
                                                            <AlertCircle size={12} style={{ color: '#EF4444' }} />
                                                            <span className="text-[13px]" style={{ color: '#EF4444' }}>{errors.fullName}</span>
                                                        </motion.div>
                                                    )}
                                                </AnimatePresence>
                                            </div>

                                            <div>
                                                <label htmlFor="email" style={labelStyle}>
                                                    Email Address
                                                </label>
                                                <input
                                                    type="email"
                                                    id="email"
                                                    name="email"
                                                    value={formData.email}
                                                    onChange={handleChange}
                                                    placeholder="john@example.com"
                                                    style={{
                                                        ...inputBaseStyle,
                                                        borderColor: errors.email ? '#EF4444' : isDarkMode ? '#333' : '#d8d8d8',
                                                        boxShadow: errors.email ? '0 0 0 3px rgba(239, 68, 68, 0.15)' : 'none'
                                                    }}
                                                    onFocus={(e) => {
                                                        if (!errors.email) {
                                                            e.currentTarget.style.borderColor = '#146ef5';
                                                            e.currentTarget.style.boxShadow = '0 0 0 3px rgba(20, 110, 245, 0.15)';
                                                        }
                                                    }}
                                                    onBlur={(e) => {
                                                        if (!errors.email) {
                                                            e.currentTarget.style.borderColor = isDarkMode ? '#333' : '#d8d8d8';
                                                            e.currentTarget.style.boxShadow = 'none';
                                                        }
                                                    }}
                                                />
                                                <AnimatePresence>
                                                    {errors.email && (
                                                        <motion.div
                                                            initial={{ opacity: 0, y: -5 }}
                                                            animate={{ opacity: 1, y: 0 }}
                                                            exit={{ opacity: 0, y: -5 }}
                                                            className="flex items-center gap-1.5 mt-2"
                                                        >
                                                            <AlertCircle size={12} style={{ color: '#EF4444' }} />
                                                            <span className="text-[13px]" style={{ color: '#EF4444' }}>{errors.email}</span>
                                                        </motion.div>
                                                    )}
                                                </AnimatePresence>
                                            </div>
                                        </div>

                                        <div>
                                            <label htmlFor="subject" style={labelStyle}>
                                                Subject
                                            </label>
                                            <input
                                                type="text"
                                                id="subject"
                                                name="subject"
                                                value={formData.subject}
                                                onChange={handleChange}
                                                placeholder="How can we help?"
                                                style={{
                                                    ...inputBaseStyle,
                                                    borderColor: errors.subject ? '#EF4444' : isDarkMode ? '#333' : '#d8d8d8',
                                                    boxShadow: errors.subject ? '0 0 0 3px rgba(239, 68, 68, 0.15)' : 'none'
                                                }}
                                                onFocus={(e) => {
                                                    if (!errors.subject) {
                                                        e.currentTarget.style.borderColor = '#146ef5';
                                                        e.currentTarget.style.boxShadow = '0 0 0 3px rgba(20, 110, 245, 0.15)';
                                                    }
                                                }}
                                                onBlur={(e) => {
                                                    if (!errors.subject) {
                                                        e.currentTarget.style.borderColor = isDarkMode ? '#333' : '#d8d8d8';
                                                        e.currentTarget.style.boxShadow = 'none';
                                                    }
                                                }}
                                            />
                                            <AnimatePresence>
                                                {errors.subject && (
                                                    <motion.div
                                                        initial={{ opacity: 0, y: -5 }}
                                                        animate={{ opacity: 1, y: 0 }}
                                                        exit={{ opacity: 0, y: -5 }}
                                                        className="flex items-center gap-1.5 mt-2"
                                                    >
                                                        <AlertCircle size={12} style={{ color: '#EF4444' }} />
                                                        <span className="text-[13px]" style={{ color: '#EF4444' }}>{errors.subject}</span>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </div>

                                        <div>
                                            <label htmlFor="message" style={labelStyle}>
                                                Message
                                            </label>
                                            <textarea
                                                id="message"
                                                name="message"
                                                value={formData.message}
                                                onChange={handleChange}
                                                placeholder="Tell us more about your inquiry..."
                                                rows={6}
                                                style={{
                                                    ...inputBaseStyle,
                                                    resize: 'vertical',
                                                    minHeight: '140px',
                                                    borderColor: errors.message ? '#EF4444' : isDarkMode ? '#333' : '#d8d8d8',
                                                    boxShadow: errors.message ? '0 0 0 3px rgba(239, 68, 68, 0.15)' : 'none'
                                                }}
                                                onFocus={(e) => {
                                                    if (!errors.message) {
                                                        e.currentTarget.style.borderColor = '#146ef5';
                                                        e.currentTarget.style.boxShadow = '0 0 0 3px rgba(20, 110, 245, 0.15)';
                                                    }
                                                }}
                                                onBlur={(e) => {
                                                    if (!errors.message) {
                                                        e.currentTarget.style.borderColor = isDarkMode ? '#333' : '#d8d8d8';
                                                        e.currentTarget.style.boxShadow = 'none';
                                                    }
                                                }}
                                            />
                                            <AnimatePresence>
                                                {errors.message && (
                                                    <motion.div
                                                        initial={{ opacity: 0, y: -5 }}
                                                        animate={{ opacity: 1, y: 0 }}
                                                        exit={{ opacity: 0, y: -5 }}
                                                        className="flex items-center gap-1.5 mt-2"
                                                    >
                                                        <AlertCircle size={12} style={{ color: '#EF4444' }} />
                                                        <span className="text-[13px]" style={{ color: '#EF4444' }}>{errors.message}</span>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </div>

                                        <button
                                            type="submit"
                                            disabled={isSubmitting}
                                            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3.5 text-[16px] font-medium rounded cursor-pointer transition-all duration-200"
                                            style={{
                                                backgroundColor: isSubmitting ? '#0a58c0' : '#146ef5',
                                                color: '#ffffff',
                                                borderRadius: '4px',
                                                boxShadow: webflowShadow,
                                                opacity: isSubmitting ? 0.8 : 1,
                                                cursor: isSubmitting ? 'not-allowed' : 'pointer'
                                            }}
                                            onMouseEnter={(e) => {
                                                if (!isSubmitting) {
                                                    (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
                                                    (e.currentTarget as HTMLElement).style.backgroundColor = '#0055d4';
                                                }
                                            }}
                                            onMouseLeave={(e) => {
                                                (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
                                                (e.currentTarget as HTMLElement).style.backgroundColor = isSubmitting ? '#0a58c0' : '#146ef5';
                                            }}
                                        >
                                            {isSubmitting ? (
                                                <>
                                                    <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                    </svg>
                                                    Sending...
                                                </>
                                            ) : (
                                                <>
                                                    <Send size={16} />
                                                    Send Message
                                                </>
                                            )}
                                        </button>
                                    </motion.form>
                                )}
                            </AnimatePresence>
                        </motion.div>

                        {/* Contact Info Sidebar */}
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.6, delay: 0.4 }}
                            className="space-y-6"
                        >
                            {/* Email Card */}
                            <div
                                className="p-6"
                                style={{
                                    backgroundColor: isDarkMode ? '#111' : '#ffffff',
                                    border: `1px solid ${isDarkMode ? '#222' : '#d8d8d8'}`,
                                    borderRadius: '8px',
                                    boxShadow: cardShadow
                                }}
                            >
                                <div className="h-10 w-10 flex items-center justify-center rounded mb-4" style={{ backgroundColor: '#146ef515', borderRadius: '4px' }}>
                                    <Mail size={20} style={{ color: '#146ef5' }} />
                                </div>
                                <span className="text-[11px] font-semibold tracking-[1.5px] block mb-2" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>
                                    Email
                                </span>
                                <a href="mailto:support@edutu.org" style={{ color: '#146ef5', textDecoration: 'none', fontSize: '16px', fontWeight: 500 }} onMouseEnter={(e) => (e.currentTarget.style.textDecoration = 'underline')} onMouseLeave={(e) => (e.currentTarget.style.textDecoration = 'none')}>
                                    support@edutu.org
                                </a>
                            </div>

                            {/* Location Card */}
                            <div
                                className="p-6"
                                style={{
                                    backgroundColor: isDarkMode ? '#111' : '#ffffff',
                                    border: `1px solid ${isDarkMode ? '#222' : '#d8d8d8'}`,
                                    borderRadius: '8px',
                                    boxShadow: cardShadow
                                }}
                            >
                                <div className="h-10 w-10 flex items-center justify-center rounded mb-4" style={{ backgroundColor: '#10B98115', borderRadius: '4px' }}>
                                    <MapPin size={20} style={{ color: '#10B981' }} />
                                </div>
                                <span className="text-[11px] font-semibold tracking-[1.5px] block mb-2" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>
                                    Location
                                </span>
                                <span style={{ color: isDarkMode ? '#f5f5f5' : '#080808', fontSize: '16px', fontWeight: 500 }}>
                                    Global
                                </span>
                                <p className="text-[14px] mt-1" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>
                                    Remote-first company
                                </p>
                            </div>

                            {/* Social Links Card */}
                            <div
                                className="p-6"
                                style={{
                                    backgroundColor: isDarkMode ? '#111' : '#ffffff',
                                    border: `1px solid ${isDarkMode ? '#222' : '#d8d8d8'}`,
                                    borderRadius: '8px',
                                    boxShadow: cardShadow
                                }}
                            >
                                <span className="text-[11px] font-semibold tracking-[1.5px] block mb-4" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>
                                    Follow Us
                                </span>
                                <div className="flex items-center gap-3">
                                    {[
                                        { icon: Twitter, href: 'https://twitter.com/edutu', label: 'Twitter' },
                                        { icon: Linkedin, href: 'https://linkedin.com/company/edutu', label: 'LinkedIn' },
                                        { icon: Github, href: 'https://github.com/edutu', label: 'GitHub' }
                                    ].map(({ icon: Icon, href, label }) => (
                                        <a
                                            key={label}
                                            href={href}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="p-3 rounded transition-all duration-200"
                                            style={{
                                                backgroundColor: isDarkMode ? '#1a1a1a' : '#fafafa',
                                                border: `1px solid ${isDarkMode ? '#222' : '#d8d8d8'}`,
                                                borderRadius: '4px',
                                                color: isDarkMode ? '#ababab' : '#5a5a5a'
                                            }}
                                            onMouseEnter={(e) => {
                                                (e.currentTarget as HTMLElement).style.borderColor = '#146ef5';
                                                (e.currentTarget as HTMLElement).style.color = '#146ef5';
                                                (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
                                            }}
                                            onMouseLeave={(e) => {
                                                (e.currentTarget as HTMLElement).style.borderColor = isDarkMode ? '#222' : '#d8d8d8';
                                                (e.currentTarget as HTMLElement).style.color = isDarkMode ? '#ababab' : '#5a5a5a';
                                                (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
                                            }}
                                            aria-label={label}
                                        >
                                            <Icon size={18} />
                                        </a>
                                    ))}
                                </div>
                            </div>
                        </motion.div>
                    </div>

                    {/* FAQ Section */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.6 }}
                        className="mb-16"
                    >
                        <div className="text-center mb-12">
                            <span className="text-[12px] font-semibold tracking-[1.5px]" style={{ color: '#146ef5' }}>
                                FAQ
                            </span>
                            <h2 className="text-[36px] sm:text-[48px] font-semibold leading-[1.04] mt-4" style={{ color: isDarkMode ? '#ffffff' : '#080808' }}>
                                Quick <span style={{ color: '#146ef5' }}>Answers</span>
                            </h2>
                        </div>

                        <div className="max-w-[800px] mx-auto space-y-4">
                            {faqs.map((faq, index) => (
                                <motion.div
                                    key={index}
                                    initial={{ opacity: 0, y: 10 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    viewport={{ once: true }}
                                    transition={{ duration: 0.4, delay: index * 0.1 }}
                                    style={{
                                        backgroundColor: isDarkMode ? '#111' : '#ffffff',
                                        border: `1px solid ${openFaq === index ? '#146ef5' : isDarkMode ? '#222' : '#d8d8d8'}`,
                                        borderRadius: '8px',
                                        boxShadow: cardShadow,
                                        overflow: 'hidden'
                                    }}
                                >
                                    <button
                                        onClick={() => setOpenFaq(openFaq === index ? null : index)}
                                        className="w-full flex items-center justify-between p-6 text-left cursor-pointer transition-colors duration-200"
                                        style={{
                                            backgroundColor: 'transparent',
                                            border: 'none',
                                            color: isDarkMode ? '#f5f5f5' : '#080808'
                                        }}
                                    >
                                        <span className="text-[16px] font-medium pr-4">{faq.question}</span>
                                        <svg
                                            width="20"
                                            height="20"
                                            viewBox="0 0 20 20"
                                            fill="none"
                                            style={{
                                                transform: openFaq === index ? 'rotate(180deg)' : 'rotate(0deg)',
                                                transition: 'transform 0.2s ease',
                                                flexShrink: 0,
                                                color: '#146ef5'
                                            }}
                                        >
                                            <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                    </button>
                                    <AnimatePresence>
                                        {openFaq === index && (
                                            <motion.div
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: 'auto', opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                transition={{ duration: 0.2 }}
                                                className="overflow-hidden"
                                            >
                                                <div className="px-6 pb-6" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a', fontSize: '15px', lineHeight: '1.6' }}>
                                                    {faq.answer}
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </motion.div>
                            ))}
                        </div>
                    </motion.div>
                </div>
            </main>

            {/* Footer */}
            <footer className="py-16 px-4 sm:px-6" style={{ borderTop: `1px solid ${isDarkMode ? '#222' : '#d8d8d8'}` }}>
                <div className="max-w-[1200px] mx-auto flex flex-col md:flex-row justify-between items-start gap-12">
                    <div className="max-w-[300px]">
                        <div className="flex items-center gap-2 mb-4">
                            <img src="/edutu-logo.png" alt="Edutu" className="h-8 w-8 object-contain" />
                            <span className="font-bold text-xl tracking-tight" style={{ color: isDarkMode ? '#ffffff' : '#080808' }}>
                                edutu
                            </span>
                        </div>
                        <p className="text-[16px] leading-[1.6]" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>
                            Modular career operating system. Mapping potential to progress, one milestone at a time.
                        </p>
                    </div>

                    <div className="flex items-center gap-6">
                        <a href="https://twitter.com/edutu" target="_blank" rel="noopener noreferrer" className="p-2 transition-colors" style={{ color: isDarkMode ? '#5a5a5a' : '#5a5a5a' }} onMouseEnter={(e) => (e.currentTarget.style.color = '#146ef5')} onMouseLeave={(e) => (e.currentTarget.style.color = isDarkMode ? '#5a5a5a' : '#5a5a5a')}>
                            <Twitter size={20} />
                        </a>
                        <a href="https://linkedin.com/company/edutu" target="_blank" rel="noopener noreferrer" className="p-2 transition-colors" style={{ color: isDarkMode ? '#5a5a5a' : '#5a5a5a' }} onMouseEnter={(e) => (e.currentTarget.style.color = '#146ef5')} onMouseLeave={(e) => (e.currentTarget.style.color = isDarkMode ? '#5a5a5a' : '#5a5a5a')}>
                            <Linkedin size={20} />
                        </a>
                        <a href="https://github.com/edutu" target="_blank" rel="noopener noreferrer" className="p-2 transition-colors" style={{ color: isDarkMode ? '#5a5a5a' : '#5a5a5a' }} onMouseEnter={(e) => (e.currentTarget.style.color = '#146ef5')} onMouseLeave={(e) => (e.currentTarget.style.color = isDarkMode ? '#5a5a5a' : '#5a5a5a')}>
                            <Github size={20} />
                        </a>
                    </div>
                </div>
                <div className="max-w-[1200px] mx-auto mt-12 pt-8 flex justify-between items-center" style={{ borderTop: `1px solid ${isDarkMode ? '#222' : '#d8d8d8'}` }}>
                    <span className="text-[10px] font-semibold tracking-[1.5px]" style={{ color: isDarkMode ? '#5a5a5a' : '#ababab' }}>© {new Date().getFullYear()} Edutu Inc.</span>
                    <span className="text-[10px] font-semibold tracking-[1.5px]" style={{ color: isDarkMode ? '#5a5a5a' : '#ababab' }}>v3.0.4-beta</span>
                </div>
            </footer>
        </div>
    );
};

export default ContactPage;
