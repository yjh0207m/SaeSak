import {useEffect, useState} from 'react';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';

export type SubscriptionTier = 'free' | 'sprout_plus' | 'sprout_plus_plus';

interface UseSubscriptionResult {
  tier: SubscriptionTier;
  expiresAt: Date | null;
  loading: boolean;
}

export function useSubscription(): UseSubscriptionResult {
  const uid = auth().currentUser?.uid;
  const [tier, setTier] = useState<SubscriptionTier>('free');
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) {
      setLoading(false);
      return;
    }
    const unsub = firestore()
      .collection('subscriptions')
      .doc(uid)
      .onSnapshot(
        snap => {
          if (snap.exists()) {
            const d = snap.data()!;
            const exp: Date | null = d.expires_at?.toDate() ?? null;
            const isActive = exp ? exp > new Date() : false;
            setTier(isActive ? (d.tier as SubscriptionTier) : 'free');
            setExpiresAt(exp);
          } else {
            setTier('free');
            setExpiresAt(null);
          }
          setLoading(false);
        },
        () => setLoading(false),
      );
    return unsub;
  }, [uid]);

  return {tier, expiresAt, loading};
}
