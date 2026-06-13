import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, CheckCircle, Download, Globe, Smartphone, Sparkles } from 'lucide-react';
import { useDarkMode } from '../hooks/useDarkMode';
import PublicSiteMenu from './PublicSiteMenu';

const installWays = [
  {
    title: 'Android',
    subtitle: 'Install from your browser',
    icon: Smartphone,
    accent: '#146ef5',
    steps: ['Open Edutu in Chrome', 'Tap the browser menu', 'Choose Install app or Add to Home screen'],
  },
  {
    title: 'iPhone',
    subtitle: 'Save it to your Home Screen',
    icon: Globe,
    accent: '#7a3dff',
    steps: ['Open Edutu in Safari', 'Tap Share', 'Choose Add to Home Screen'],
  },
  {
    title: 'Desktop',
    subtitle: 'Use the web app like a native app',
    icon: Download,
    accent: '#00b86b',
    steps: ['Open the site in Chrome or Edge', 'Use the install icon in the address bar', 'Sign in to sync your profile'],
  },
] as const satisfies Array<{
  title: string;
  subtitle: string;
  icon: React.ElementType;
  accent: string;
  steps: string[];
}>;

const benefits = [
  'Keep your saved opportunities close',
  'Get deadline reminders in one place',
  'Use the same account across web and mobile',
];

const DownloadPage: React.FC = () => {
  const { isDarkMode } = useDarkMode();

  return (
    <div
      className="min-h-[100dvh] overflow-x-hidden"
      style={{
        backgroundColor: isDarkMode ? '#080808' : '#ffffff',
        color: isDarkMode ? '#f5f5f5' : '#080808',
        fontFamily: "'Inter', 'Arial', sans-serif",
      }}
    >
      <motion.header
        initial={{ y: -12, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md transition-colors duration-300"
        style={{ backgroundColor: isDarkMode ? 'rgba(8, 8, 8, 0.92)' : 'rgba(255, 255, 255, 0.96)' }}
      >
        <div
          className="max-w-[1200px] mx-auto px-4 sm:px-6 h-[64px] flex items-center justify-between"
          style={{ borderBottom: `1px solid ${isDarkMode ? '#222' : '#d8d8d8'}` }}
        >
          <Link to="/" className="flex items-center gap-2 cursor-pointer" style={{ textDecoration: 'none' }}>
            <img src="/edutu-logo.png" alt="Edutu" className="h-8 w-8 object-contain" />
            <span className="font-bold text-xl tracking-tight" style={{ color: isDarkMode ? '#ffffff' : '#080808' }}>
              edutu
            </span>
          </Link>

          <PublicSiteMenu />
        </div>
      </motion.header>

      <main className="relative z-10 pt-[120px] pb-[96px] px-4 sm:px-6">
        <div className="max-w-[1200px] mx-auto">
          <motion.section
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] items-center mb-16"
          >
            <div>
              <div
                className="inline-flex items-center gap-2 px-4 py-2 mb-6 rounded"
                style={{
                  backgroundColor: isDarkMode ? 'rgba(20,110,245,0.12)' : 'rgba(20,110,245,0.08)',
                  border: `1px solid ${isDarkMode ? 'rgba(20,110,245,0.2)' : 'rgba(20,110,245,0.16)'}`,
                  borderRadius: '4px',
                }}
              >
                <Sparkles size={14} style={{ color: '#146ef5' }} />
                <span className="text-[12px] font-semibold tracking-[1.5px]" style={{ color: '#146ef5' }}>
                  DOWNLOAD APP
                </span>
              </div>

              <h1 className="text-[clamp(2.8rem,8vw,5.6rem)] font-semibold leading-[1.02] tracking-[-0.8px] mb-6" style={{ color: isDarkMode ? '#ffffff' : '#080808' }}>
                Install Edutu
                <br />
                <span style={{ color: '#146ef5' }}>on your device</span>
              </h1>

              <p className="max-w-[640px] text-[18px] sm:text-[20px] leading-[1.55] mb-8" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>
                Keep your opportunities, deadlines, and progress in your pocket. Edutu works beautifully in the browser and feels like a native app on mobile.
              </p>

              <div className="flex flex-col sm:flex-row gap-3">
                <Link
                  to="/auth"
                  className="inline-flex items-center justify-center gap-2 rounded-xl px-8 py-3.5 text-sm font-bold text-white"
                  style={{ backgroundColor: '#146ef5', boxShadow: '0 2px 8px rgba(20,110,245,0.22)' }}
                >
                  Open Edutu <ArrowRight size={16} />
                </Link>
                <Link
                  to="/opportunities"
                  className="inline-flex items-center justify-center gap-2 rounded-xl border px-8 py-3.5 text-sm font-bold"
                  style={{
                    borderColor: isDarkMode ? '#2a2a2a' : '#d8d8d8',
                    color: isDarkMode ? '#ffffff' : '#080808',
                    backgroundColor: isDarkMode ? '#111' : '#fafafa',
                  }}
                >
                  Browse opportunities
                </Link>
              </div>
            </div>

            <div
              className="relative overflow-hidden rounded-[28px] p-6 sm:p-8"
              style={{
                background: isDarkMode
                  ? 'linear-gradient(135deg, rgba(20,110,245,0.18), rgba(122,61,255,0.14)), #0f1720'
                  : 'linear-gradient(135deg, #eff6ff, #ffffff)',
                border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.12)' : '#cfe0f2'}`,
                boxShadow: isDarkMode
                  ? '0 16px 40px rgba(0,0,0,0.28)'
                  : '0 16px 40px rgba(15,23,42,0.08)',
              }}
            >
              <div className="absolute -right-16 -top-16 h-40 w-40 rounded-full blur-3xl" style={{ backgroundColor: 'rgba(20,110,245,0.16)' }} />
              <div className="relative z-10 flex items-center justify-between gap-4 mb-8">
                <div>
                  <div className="text-[12px] font-semibold tracking-[1.5px]" style={{ color: '#146ef5' }}>
                    EASY INSTALL
                  </div>
                  <div className="text-[28px] font-semibold mt-1" style={{ color: isDarkMode ? '#ffffff' : '#080808' }}>
                    3 quick steps
                  </div>
                </div>
                <div className="h-16 w-16 rounded-2xl flex items-center justify-center" style={{ backgroundColor: '#146ef5', color: '#ffffff' }}>
                  <Download size={28} />
                </div>
              </div>

              <div className="space-y-3 relative z-10">
                {benefits.map((benefit) => (
                  <div
                    key={benefit}
                    className="flex items-center gap-3 rounded-2xl px-4 py-3"
                    style={{
                      backgroundColor: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.78)',
                      border: `1px solid ${isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(20,110,245,0.12)'}`,
                    }}
                  >
                    <CheckCircle size={18} style={{ color: '#00b86b', flexShrink: 0 }} />
                    <span className="text-sm font-medium" style={{ color: isDarkMode ? '#f5f5f5' : '#102033' }}>
                      {benefit}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </motion.section>

          <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {installWays.map((step, index) => (
              <motion.div
                key={step.title}
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.45, delay: index * 0.08 }}
                className="rounded-[24px] p-6"
                style={{
                  backgroundColor: isDarkMode ? '#111' : '#ffffff',
                  border: `1px solid ${isDarkMode ? '#222' : '#d8d8d8'}`,
                  boxShadow: isDarkMode
                    ? '0 4px 12px rgba(0,0,0,0.2), 0 12px 30px rgba(0,0,0,0.16)'
                    : '0 4px 12px rgba(0,0,0,0.05), 0 12px 30px rgba(15,23,42,0.08)',
                }}
              >
                <div className="h-14 w-14 rounded-2xl flex items-center justify-center mb-5" style={{ backgroundColor: `${step.accent}15`, color: step.accent }}>
                  <step.icon size={24} />
                </div>
                <div className="text-[12px] font-semibold tracking-[1.5px] mb-2" style={{ color: step.accent }}>
                  {step.subtitle}
                </div>
                <h2 className="text-[26px] font-semibold mb-4" style={{ color: isDarkMode ? '#ffffff' : '#080808' }}>
                  {step.title}
                </h2>
                <div className="space-y-3">
                  {step.steps.map((item) => (
                    <div
                      key={item}
                      className="flex items-start gap-3 rounded-2xl px-4 py-3"
                      style={{ backgroundColor: isDarkMode ? 'rgba(255,255,255,0.04)' : '#fafafa' }}
                    >
                      <CheckCircle size={16} style={{ color: step.accent, marginTop: '2px', flexShrink: 0 }} />
                      <span className="text-sm leading-[1.5]" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>
                        {item}
                      </span>
                    </div>
                  ))}
                </div>
              </motion.div>
            ))}
          </section>
        </div>
      </main>
    </div>
  );
};

export default DownloadPage;
