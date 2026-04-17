import { useEffect, useState } from 'react';
import { insforge } from '../api/insforge/client';

type SafePublicAuthConfig = {
  oAuthProviders: string[];
};

const DEFAULT_AUTH_CONFIG: SafePublicAuthConfig = {
  oAuthProviders: []
};

export function useSafePublicAuthConfig() {
  const [authConfig, setAuthConfig] = useState<SafePublicAuthConfig>(DEFAULT_AUTH_CONFIG);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const { data } = await insforge.auth.getPublicAuthConfig();
        if (cancelled) return;
        setAuthConfig({
          oAuthProviders: Array.isArray(data?.oAuthProviders)
            ? data.oAuthProviders.map((provider) => String(provider))
            : []
        });
      } catch {
        if (!cancelled) setAuthConfig(DEFAULT_AUTH_CONFIG);
      } finally {
        if (!cancelled) setIsLoaded(true);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { authConfig, isLoaded };
}
