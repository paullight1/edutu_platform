import { useAuth } from '@clerk/clerk-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getBillingStatus,
  getCreditProducts,
  type BillingStatus,
  type CreditProduct,
} from '../services/billing';

export function useBillingStatus() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [products, setProducts] = useState<CreditProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [productsLoading, setProductsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [productsError, setProductsError] = useState<string | null>(null);
  const requestVersion = useRef(0);

  const refresh = useCallback(async () => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      setStatus(null);
      setProducts([]);
      setLoading(false);
      setProductsLoading(false);
      setError(null);
      setErrorCode(null);
      setProductsError(null);
      return;
    }

    const version = ++requestVersion.current;
    setLoading(true);
    setProductsLoading(true);
    setError(null);
    setErrorCode(null);
    setProductsError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error('Unable to read auth token');

      const [statusResult, productsResult] = await Promise.allSettled([
        getBillingStatus(token),
        getCreditProducts(),
      ]);

      if (version !== requestVersion.current) return;

      if (statusResult.status === 'fulfilled') {
        setStatus(statusResult.value);
      } else {
        const billingError = statusResult.reason;
        setStatus(null);
        setError(billingError instanceof Error ? billingError.message : 'Unable to load billing status');
        setErrorCode(
          billingError && typeof billingError === 'object' && 'code' in billingError
            ? String((billingError as { code: unknown }).code)
            : null,
        );
      }

      if (productsResult.status === 'fulfilled') {
        setProducts(productsResult.value);
      } else {
        const productError = productsResult.reason;
        setProducts([]);
        setProductsError(
          productError instanceof Error
            ? productError.message
            : 'Unable to load credit packs',
        );
      }
    } catch (err) {
      if (version === requestVersion.current) {
        setError(err instanceof Error ? err.message : 'Unable to load billing status');
        setErrorCode(
          err && typeof err === 'object' && 'code' in err
            ? String((err as { code: unknown }).code)
            : null,
        );
      }
    } finally {
      if (version === requestVersion.current) setLoading(false);
      if (version === requestVersion.current) setProductsLoading(false);
    }
  }, [getToken, isLoaded, isSignedIn]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [refresh]);

  return {
    status,
    products,
    loading,
    productsLoading,
    error,
    errorCode,
    productsError,
    refresh,
  };
}
