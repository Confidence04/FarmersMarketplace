import React from 'react';
import { useTranslation } from 'react-i18next';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

/** Global banner shown while offline; payments, wallet sends and orders are disabled (FE-24). */
export default function OfflineBanner() {
  const online = useOnlineStatus();
  const { t } = useTranslation();
  if (online) return null;
  return (
    <div role="status" aria-live="polite" style={{ background: '#fef3c7', color: '#92400e', padding: '10px 16px', textAlign: 'center', fontSize: 14, borderBottom: '1px solid #fcd34d' }}>
      {t('offline.banner')}
    </div>
  );
}
