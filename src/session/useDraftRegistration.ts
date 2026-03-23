import { useEffect } from 'react';
import { useDraftManager } from './DraftManagerProvider';

type UseDraftRegistrationArgs = {
  key: string;
  enabled?: boolean;
  isDirty: () => boolean;
  serialize: () => unknown;
  flush?: () => Promise<void>;
};

export function useDraftRegistration(args: UseDraftRegistrationArgs) {
  const { registerDraft } = useDraftManager();

  useEffect(() => {
    if (args.enabled === false) return;
    return registerDraft({
      key: args.key,
      isDirty: args.isDirty,
      serialize: args.serialize,
      flush: args.flush
    });
  }, [args.enabled, args.flush, args.isDirty, args.key, args.serialize, registerDraft]);
}
