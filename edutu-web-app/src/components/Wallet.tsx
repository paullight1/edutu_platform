import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Wallet as WalletIcon,
  ArrowUpRight,
  ArrowDownLeft,
  History,
  DollarSign,
  Crown,
  ChevronRight,
  Plus,
  Send,
  TrendingUp,
  AlertCircle,
  CreditCard
} from 'lucide-react';
import { useDarkMode } from '../hooks/useDarkMode';
import { useAuth } from '@clerk/clerk-react';
import { useNavigate } from 'react-router-dom';
import {
  getCreditBalance,
  getTransactionHistory,
  type CreditTransaction
} from '../services/credits';
import { authService } from '../lib/auth';

interface WalletProps {
  onBack: () => void;
}

interface CreditPackage {
  credits: number;
  price: number;
  popular?: boolean;
}

const CREDIT_PACKAGES: CreditPackage[] = [
  { credits: 50, price: 4.99 },
  { credits: 200, price: 14.99 },
  { credits: 500, price: 29.99, popular: true },
  { credits: 1000, price: 49.99 }
];

const Wallet: React.FC<WalletProps> = ({ onBack }) => {
  const { isDarkMode } = useDarkMode();
  const { isSignedIn, userId } = useAuth();
  const navigate = useNavigate();
  const [balance, setBalance] = useState(0);
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPro, setIsPro] = useState(false);

  useEffect(() => {
    const loadWallet = async () => {
      if (!isSignedIn || !userId) {
        setIsLoading(false);
        return;
      }

      try {
        const [balanceData, profileData, transactionData] = await Promise.all([
          getCreditBalance(userId),
          authService.getProfile(userId),
          getTransactionHistory(userId, 20)
        ]);

        setBalance(balanceData);
        setIsPro(profileData?.is_pro ?? false);
        setTransactions(transactionData);
      } catch (error) {
        console.error('Error loading wallet:', error);
      } finally {
        setIsLoading(false);
      }
    };

    void loadWallet();
  }, [isSignedIn, userId]);

  const handleBuyCredits = (_pkg: CreditPackage) => {
    navigate(`/billing?feature=credits&returnTo=${encodeURIComponent('/app/wallet')}`);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  if (isLoading) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${isDarkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
        <div className="flex flex-col items-center gap-4">
          <div className={`w-12 h-12 border-4 border-t-primary rounded-full animate-spin`} />
          <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Loading wallet...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${isDarkMode ? 'bg-gray-900' : 'bg-gray-50'} pb-24`}>
      <div className="max-w-2xl mx-auto p-4 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
              isDarkMode
                ? 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                : 'bg-white text-gray-600 hover:bg-gray-100'
            }`}
          >
            <ChevronRight className="rotate-180" size={20} />
          </button>
          <div>
            <h1 className={`text-2xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>Wallet</h1>
            <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Manage your credits</p>
          </div>
        </div>

        {/* Balance Hero Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className={`relative overflow-hidden rounded-3xl p-6 ${
            isDarkMode
              ? 'bg-gradient-to-br from-indigo-900 via-purple-900 to-cyan-900'
              : 'bg-gradient-to-br from-indigo-500 via-purple-500 to-cyan-500'
          } text-white shadow-xl`}
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-8 translate-x-8" />
          <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full translate-y-6 -translate-x-6" />

          <div className="relative z-10">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <WalletIcon size={20} className="text-white/80" />
                <span className="text-sm font-medium text-white/80">Available Balance</span>
              </div>
              {isPro && (
                <div className="flex items-center gap-1 px-3 py-1 bg-amber-400/20 backdrop-blur-sm rounded-full">
                  <Crown size={14} className="text-amber-300" />
                  <span className="text-xs font-bold text-amber-300">PRO</span>
                </div>
              )}
            </div>

            <div className="mb-6">
              <span className="text-5xl font-bold tracking-tight">{balance.toLocaleString()}</span>
              <span className="text-xl text-white/70 ml-2">credits</span>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => document.getElementById('packages')?.scrollIntoView({ behavior: 'smooth' })}
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-xl font-medium text-sm transition-all"
              >
                <Plus size={16} />
                Buy Credits
              </button>
              <button
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-xl font-medium text-sm transition-all"
              >
                <Send size={16} />
                Send
              </button>
            </div>
          </div>
        </motion.div>

        {/* Quick Actions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-2 gap-3"
        >
          <QuickActionCard
            icon={<DollarSign size={22} />}
            title="Buy Credits"
            subtitle="Purchase credit packages"
            color="emerald"
            onClick={() => document.getElementById('packages')?.scrollIntoView({ behavior: 'smooth' })}
            isDarkMode={isDarkMode}
          />
          <QuickActionCard
            icon={<Send size={22} />}
            title="Send Credits"
            subtitle="Transfer to another user"
            color="blue"
            isDarkMode={isDarkMode}
            disabled
          />
          <QuickActionCard
            icon={<TrendingUp size={22} />}
            title="Cashout"
            subtitle="Convert to real money"
            color="violet"
            isDarkMode={isDarkMode}
            disabled
          />
          <QuickActionCard
            icon={<History size={22} />}
            title="History"
            subtitle="View all transactions"
            color="amber"
            onClick={() => document.getElementById('transactions')?.scrollIntoView({ behavior: 'smooth' })}
            isDarkMode={isDarkMode}
          />
        </motion.div>

        {/* Credit Packages */}
        <motion.div
          id="packages"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <h2 className={`text-lg font-bold mb-4 ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>
            Credit Packages
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {CREDIT_PACKAGES.map((pkg, index) => (
              <motion.div
                key={pkg.credits}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 * index }}
                whileHover={{ scale: 1.02 }}
                onClick={() => handleBuyCredits(pkg)}
                className={`relative p-4 rounded-2xl cursor-pointer transition-all border ${
                  pkg.popular
                    ? isDarkMode
                      ? 'border-indigo-500/50 bg-indigo-900/20'
                      : 'border-indigo-500 bg-indigo-50'
                    : isDarkMode
                      ? 'border-gray-700 bg-gray-800 hover:border-gray-600'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                } shadow-sm hover:shadow-md`}
              >
                {pkg.popular && (
                  <div className="absolute -top-2 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full">
                    <span className="text-xs font-bold text-white">Popular</span>
                  </div>
                )}
                <div className="text-center">
                  <div className={`text-2xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>
                    {pkg.credits.toLocaleString()}
                  </div>
                  <div className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>credits</div>
                  <div className="mt-3 pt-3 border-t border-dashed border-gray-300 dark:border-gray-600">
                    <div className={`text-lg font-bold ${isDarkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>
                      ${pkg.price.toFixed(2)}
                    </div>
                    <div className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                      ${(pkg.price / pkg.credits).toFixed(3)} per credit
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Upgrade to Pro CTA */}
        {!isPro && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className={`p-5 rounded-2xl border ${
              isDarkMode
                ? 'border-amber-500/30 bg-gradient-to-br from-amber-900/20 to-orange-900/20'
                : 'border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50'
            }`}
          >
            <div className="flex items-start gap-4">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                isDarkMode ? 'bg-amber-500/20' : 'bg-amber-100'
              }`}>
                <Crown size={24} className="text-amber-500" />
              </div>
              <div className="flex-1">
                <h3 className={`font-bold ${isDarkMode ? 'text-amber-100' : 'text-amber-800'}`}>
                  Upgrade to Pro
                </h3>
                <ul className={`mt-2 space-y-1 text-sm ${isDarkMode ? 'text-amber-200/80' : 'text-amber-700'}`}>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-amber-500 rounded-full" />
                    20% bonus credits on every purchase
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-amber-500 rounded-full" />
                    Priority support
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-amber-500 rounded-full" />
                    Exclusive features
                  </li>
                </ul>
              </div>
            </div>
          </motion.div>
        )}

        {/* Transaction History */}
        <motion.div
          id="transactions"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <h2 className={`text-lg font-bold mb-4 ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>
            Recent Transactions
          </h2>

          {transactions.length === 0 ? (
            <div className={`text-center py-12 rounded-2xl border ${
              isDarkMode ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-white'
            }`}>
              <AlertCircle size={40} className={`mx-auto mb-3 ${isDarkMode ? 'text-gray-600' : 'text-gray-300'}`} />
              <p className={`font-medium ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                No transactions yet
              </p>
              <p className={`text-sm mt-1 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                Your credit history will appear here
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {transactions.map((tx, index) => (
                <motion.div
                  key={tx.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.05 * index }}
                  className={`flex items-center gap-4 p-4 rounded-xl transition-all ${
                    isDarkMode
                      ? 'bg-gray-800 hover:bg-gray-750'
                      : 'bg-white hover:bg-gray-50'
                  } shadow-sm`}
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    tx.type === 'earn'
                      ? isDarkMode ? 'bg-emerald-900/30' : 'bg-emerald-100'
                      : isDarkMode ? 'bg-red-900/30' : 'bg-red-100'
                  }`}>
                    {tx.type === 'earn' ? (
                      <ArrowDownLeft size={18} className={isDarkMode ? 'text-emerald-400' : 'text-emerald-600'} />
                    ) : (
                      <ArrowUpRight size={18} className={isDarkMode ? 'text-red-400' : 'text-red-600'} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`font-medium truncate ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>
                      {tx.description}
                    </p>
                    <p className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                      {formatDate(tx.created_at)}
                    </p>
                  </div>
                  <span className={`font-bold ${
                    tx.type === 'earn'
                      ? 'text-emerald-500'
                      : 'text-red-500'
                  }`}>
                    {tx.type === 'earn' ? '+' : ''}{tx.amount}
                  </span>
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
};

interface QuickActionCardProps {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  color: string;
  onClick?: () => void;
  isDarkMode: boolean;
  disabled?: boolean;
}

const QuickActionCard: React.FC<QuickActionCardProps> = ({
  icon,
  title,
  subtitle,
  color,
  onClick,
  isDarkMode,
  disabled = false
}) => {
  const colorMap: Record<string, { bg: string; darkBg: string; icon: string; darkIcon: string }> = {
    emerald: {
      bg: 'bg-emerald-100',
      darkBg: 'bg-emerald-900/30',
      icon: 'text-emerald-600',
      darkIcon: 'text-emerald-400'
    },
    blue: {
      bg: 'bg-blue-100',
      darkBg: 'bg-blue-900/30',
      icon: 'text-blue-600',
      darkIcon: 'text-blue-400'
    },
    violet: {
      bg: 'bg-violet-100',
      darkBg: 'bg-violet-900/30',
      icon: 'text-violet-600',
      darkIcon: 'text-violet-400'
    },
    amber: {
      bg: 'bg-amber-100',
      darkBg: 'bg-amber-900/30',
      icon: 'text-amber-600',
      darkIcon: 'text-amber-400'
    }
  };

  const colors = colorMap[color] || colorMap.emerald;

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`p-4 rounded-2xl text-left transition-all border ${
        disabled
          ? isDarkMode
            ? 'border-gray-700 bg-gray-800/50 opacity-50 cursor-not-allowed'
            : 'border-gray-200 bg-gray-100 opacity-50 cursor-not-allowed'
          : isDarkMode
            ? 'border-gray-700 bg-gray-800 hover:border-gray-600'
            : 'border-gray-200 bg-white hover:border-gray-300'
      } shadow-sm hover:shadow-md`}
    >
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${
        isDarkMode ? colors.darkBg : colors.bg
      }`}>
        <span className={isDarkMode ? colors.darkIcon : colors.icon}>{icon}</span>
      </div>
      <div className={`font-medium text-sm ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>{title}</div>
      <div className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>{subtitle}</div>
    </button>
  );
};

export default Wallet;
