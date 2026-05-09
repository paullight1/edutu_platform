// Analytics hooks for package interactions
import { useEffect } from 'react';
import { useAnalytics } from '../hooks/useAnalytics';

export const usePackageAnalytics = (packageId: string) => {
  const { trackEvent } = useAnalytics();

  // Track when package is viewed
  useEffect(() => {
    if (packageId) {
      trackEvent('package_view', { 
        packageId,
        timestamp: new Date().toISOString() 
      });
    }
  }, [packageId, trackEvent]);

  const trackTaskComplete = (taskId: string) => {
    trackEvent('package_task_complete', { 
      packageId, 
      taskId,
      timestamp: new Date().toISOString()
    });
  };

  const trackTemplateDownload = () => {
    trackEvent('package_templates_download', { 
      packageId,
      timestamp: new Date().toISOString()
    });
  };

  return {
    trackTaskComplete,
    trackTemplateDownload
  };
};