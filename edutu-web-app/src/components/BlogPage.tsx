import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Calendar, Clock, User, Search, ChevronRight, BookOpen, TrendingUp, Lightbulb } from 'lucide-react';
import { useDarkMode } from '../hooks/useDarkMode';
import PublicHeader from './PublicHeader';

interface BlogPost {
  id: string;
  title: string;
  excerpt: string;
  author: string;
  date: string;
  readTime: string;
  category: string;
  image?: string;
  featured?: boolean;
}

const BLOG_POSTS: BlogPost[] = [
  {
    id: '1',
    title: 'How to Win Scholarships in 2026: AI-Powered Strategies',
    excerpt: 'Discover how AI is transforming the way students find and apply for scholarships worldwide. Learn the top strategies that successful applicants use.',
    author: 'Paul Adeyemi',
    date: 'May 5, 2026',
    readTime: '5 min read',
    category: 'Scholarships',
    featured: true,
  },
  {
    id: '2',
    title: 'Building a Strong Opportunity Search Routine',
    excerpt: 'Learn how to organize weekly discovery, deadlines, and applications around the opportunities available in your field.',
    author: 'Sarah Chen',
    date: 'Apr 28, 2026',
    readTime: '7 min read',
    category: 'Career',
  },
  {
    id: '3',
    title: 'Top 10 Fellowships for African Students in 2026',
    excerpt: 'A curated list of the most prestigious fellowship programs open to African students, with application tips and deadlines.',
    author: 'James Okafor',
    date: 'Apr 20, 2026',
    readTime: '6 min read',
    category: 'Fellowships',
  },
  {
    id: '4',
    title: 'How to Write a Winning Personal Statement',
    excerpt: 'Master the art of writing compelling personal statements that make admissions committees take notice.',
    author: 'Maria Santos',
    date: 'Apr 12, 2026',
    readTime: '8 min read',
    category: 'Applications',
  },
  {
    id: '5',
    title: 'Navigating Study Abroad: Visa, Funding & Culture',
    excerpt: 'Everything you need to know about studying abroad — from visa applications to cultural adaptation and financial planning.',
    author: 'Paul Adeyemi',
    date: 'Apr 5, 2026',
    readTime: '10 min read',
    category: 'Study Abroad',
  },
  {
    id: '6',
    title: 'Leveraging AI for Job Search: Tools That Actually Work',
    excerpt: 'From resume optimization to interview prep, explore the AI tools that are giving job seekers a real competitive edge.',
    author: 'Sarah Chen',
    date: 'Mar 28, 2026',
    readTime: '6 min read',
    category: 'Career',
  },
];

const BlogPage: React.FC = () => {
  const { isDarkMode } = useDarkMode();
  const [searchQuery, setSearchQuery] = useState('');

  const filteredPosts = BLOG_POSTS.filter((post) => {
    const matchesSearch = searchQuery === '' ||
      post.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      post.excerpt.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  const featuredPost = BLOG_POSTS.find((p) => p.featured);

  return (
    <div
      className="min-h-[100dvh] overflow-x-hidden"
      style={{ backgroundColor: isDarkMode ? '#080808' : '#ffffff', color: isDarkMode ? '#f5f5f5' : '#080808', fontFamily: "'Inter', 'Arial', sans-serif" }}
    >
      <PublicHeader fixed />

      <main className="pt-[120px] pb-[96px] px-4 sm:px-6">
        <div className="max-w-[1200px] mx-auto">
          {/* Hero */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center mb-12"
          >
            <h1 className="text-3xl md:text-4xl font-semibold mb-4" style={{ color: isDarkMode ? '#ffffff' : '#080808' }}>
              Insights & <span style={{ color: '#146ef5' }}>Resources</span>
            </h1>
            <p className="text-lg max-w-2xl mx-auto" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>
              Expert advice, success stories, and guides to help you unlock global opportunities.
            </p>
          </motion.div>

          {/* Search */}
          <div className="flex flex-col md:flex-row gap-4 mb-10">
            <div className="flex-1 relative">
              <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: isDarkMode ? '#666' : '#94a3b8' }} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search articles..."
                className="w-full pl-12 pr-4 py-3 rounded-xl outline-none"
                style={{
                  backgroundColor: isDarkMode ? '#111' : '#f8f8f8',
                  border: `1px solid ${isDarkMode ? '#222' : '#d8d8d8'}`,
                  color: isDarkMode ? '#f5f5f5' : '#080808',
                  }}
                />
            </div>
          </div>

          {/* Featured Post */}
          {featuredPost && searchQuery === '' && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="mb-12 p-8 rounded-2xl cursor-pointer transition-all hover:shadow-lg"
              style={{
                backgroundColor: isDarkMode ? '#111' : '#ffffff',
                border: `1px solid ${isDarkMode ? '#222' : '#e2e8f0'}`,
              }}
            >
              <div className="flex items-center gap-2 mb-4">
                <span className="px-3 py-1 rounded-full text-xs font-semibold" style={{ backgroundColor: '#146ef520', color: '#146ef5' }}>
                  Featured
                </span>
                <span className="text-xs" style={{ color: isDarkMode ? '#666' : '#94a3b8' }}>{featuredPost.category}</span>
              </div>
              <h2 className="text-xl md:text-2xl font-semibold mb-3" style={{ color: isDarkMode ? '#ffffff' : '#080808' }}>
                {featuredPost.title}
              </h2>
              <p className="text-base mb-6" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>
                {featuredPost.excerpt}
              </p>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <User size={14} style={{ color: isDarkMode ? '#666' : '#94a3b8' }} />
                  <span className="text-sm" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>{featuredPost.author}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar size={14} style={{ color: isDarkMode ? '#666' : '#94a3b8' }} />
                  <span className="text-sm" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>{featuredPost.date}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock size={14} style={{ color: isDarkMode ? '#666' : '#94a3b8' }} />
                  <span className="text-sm" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>{featuredPost.readTime}</span>
                </div>
              </div>
            </motion.div>
          )}

          {/* Blog Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredPosts
              .filter((p) => !p.featured || searchQuery !== '')
              .map((post, index) => (
                <motion.article
                  key={post.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: index * 0.05 }}
                  className="p-6 rounded-2xl cursor-pointer transition-all hover:shadow-lg hover:-translate-y-1"
                  style={{
                    backgroundColor: isDarkMode ? '#111' : '#ffffff',
                    border: `1px solid ${isDarkMode ? '#222' : '#e2e8f0'}`,
                  }}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <span className="px-3 py-1 rounded-full text-xs font-semibold" style={{ backgroundColor: '#146ef520', color: '#146ef5' }}>
                      {post.category}
                    </span>
                  </div>
                  <h3 className="text-lg font-semibold mb-2 line-clamp-2" style={{ color: isDarkMode ? '#ffffff' : '#080808' }}>
                    {post.title}
                  </h3>
                  <p className="text-sm mb-4 line-clamp-3" style={{ color: isDarkMode ? '#ababab' : '#5a5a5a' }}>
                    {post.excerpt}
                  </p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1">
                        <User size={12} style={{ color: isDarkMode ? '#666' : '#94a3b8' }} />
                        <span className="text-xs" style={{ color: isDarkMode ? '#666' : '#94a3b8' }}>{post.author}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock size={12} style={{ color: isDarkMode ? '#666' : '#94a3b8' }} />
                        <span className="text-xs" style={{ color: isDarkMode ? '#666' : '#94a3b8' }}>{post.readTime}</span>
                      </div>
                    </div>
                    <ChevronRight size={16} style={{ color: '#146ef5' }} />
                  </div>
                </motion.article>
              ))}
          </div>

          {filteredPosts.length === 0 && (
            <div className="text-center py-16">
              <Lightbulb size={48} className="mx-auto mb-4" style={{ color: isDarkMode ? '#444' : '#cbd5e1' }} />
              <h3 className="text-xl font-semibold mb-2" style={{ color: isDarkMode ? '#ffffff' : '#080808' }}>
                No articles found
              </h3>
              <p style={{ color: isDarkMode ? '#666' : '#94a3b8' }}>
                Try a different search term or category.
              </p>
            </div>
          )}

          {/* Newsletter CTA */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="mt-16 p-10 rounded-2xl text-center"
            style={{
              background: 'linear-gradient(135deg, #146ef5, #7a3dff)',
            }}
          >
            <TrendingUp size={32} className="mx-auto mb-4 text-white" />
            <h2 className="text-2xl font-semibold mb-2 text-white">Stay Ahead of the Curve</h2>
            <p className="text-white/80 mb-6 max-w-lg mx-auto">
              Get weekly insights on scholarships, fellowships, and career opportunities delivered to your inbox.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
              <input
                type="email"
                placeholder="Enter your email"
                className="flex-1 px-4 py-3 rounded-xl outline-none text-sm"
                style={{ backgroundColor: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff' }}
              />
              <button
                className="px-6 py-3 rounded-xl text-sm font-semibold transition-all hover:bg-white/20"
                style={{ backgroundColor: '#fff', color: '#146ef5' }}
              >
                Subscribe
              </button>
            </div>
          </motion.div>
        </div>
      </main>
    </div>
  );
};

export default BlogPage;
