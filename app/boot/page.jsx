'use client';

/* /boot — sestavování. Veřejná routa. Když doběhne, pošle dál na
   /login; přihlášeného odtud middleware odkloní do appky dřív, než
   se sem vůbec dostane. */

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useHumanoid } from '@/components/humanoid/Stage';
import { createBoot } from '@/components/boot/boot.js';

export default function BootPage() {
  const router = useRouter();
  const { ready, face, i18n } = useHumanoid();
  const done = useRef(false);

  useEffect(() => {
    if (!ready || !face) return;

    const boot = createBoot({
      face,
      i18n,
      onDone: () => {
        if (done.current) return;
        done.current = true;
        router.replace('/login');
      },
    });
    boot.run();
    return () => boot.dispose();
  }, [ready, face, i18n, router]);

  return null;
}
