import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useClerk } from '@clerk/clerk-react';
import { Loader2 } from 'lucide-react';

const AuthCallback: React.FC = () => {
  const { handleRedirectCallback } = useClerk();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);

  useEffect(() => {
    if (attempted) return;
    setAttempted(true);

    handleRedirectCallback({
      signInForceRedirectUrl: '/app/home',
      signUpForceRedirectUrl: '/app/home?signup=true',
    }).catch((err: unknown) => {
      console.error('Auth callback error:', err);
      setError('Authentication failed. Please try signing in again.');
    });
  }, [handleRedirectCallback, attempted]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#080808', color: '#f5f5f5' }}>
        <div className="text-center p-8">
          <p className="text-red-400 mb-4">{error}</p>
          <button
            onClick={() => navigate('/auth')}
            className="px-6 py-3 rounded-xl font-medium"
            style={{ backgroundColor: '#146ef5', color: '#fff' }}
          >
            Back to Sign In
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#080808', color: '#f5f5f5' }}>
      <div className="text-center">
        <Loader2 size={40} className="animate-spin mx-auto mb-4" style={{ color: '#146ef5' }} />
        <p style={{ color: '#ababab' }}>Completing sign in...</p>
      </div>
    </div>
  );
};

export default AuthCallback;
