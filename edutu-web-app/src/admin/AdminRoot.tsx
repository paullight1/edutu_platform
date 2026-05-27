import React from 'react';
import { Routes, Route } from 'react-router-dom';
import './legacy/adminLegacy.css';
import LegacyAdminLayout from './legacy/components/LegacyAdminLayout';
import Dashboard from './legacy/pages/Dashboard';
import Opportunities from './legacy/pages/Opportunities';
import Users from './legacy/pages/Users';
import Creators from './legacy/pages/Creators';
import Roadmaps from './legacy/pages/Roadmaps';
import Blog from './legacy/pages/Blog';
import Settings from './legacy/pages/Settings';
import Scraper from './legacy/pages/Scraper';
import MobileControl from './legacy/pages/MobileControl';
import Profile from './legacy/pages/Profile';
import PaymentsPage from './pages/PaymentsPage';
import NotificationsPage from './pages/NotificationsPage';
import { AnalyticsPage } from './pages/PlaceholderPages';

const AdminRoot: React.FC = () => {
  return (
    <Routes>
      <Route element={<LegacyAdminLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="opportunities" element={<Opportunities />} />
        <Route path="users" element={<Users />} />
        <Route path="payments" element={<PaymentsPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="creators" element={<Creators />} />
        <Route path="roadmaps" element={<Roadmaps />} />
        <Route path="blog" element={<Blog />} />
        <Route path="mobile-control" element={<MobileControl />} />
        <Route path="edutu-engine" element={<Scraper />} />
        <Route path="profile" element={<Profile />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  );
};

export default AdminRoot;
