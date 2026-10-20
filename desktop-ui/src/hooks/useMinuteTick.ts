import { useEffect, useState } from 'react';

/** Waktu sekarang yang diperbarui tiap menit, agar label waktu relatif ("5 mnt", "Kemarin") tidak basi. */
export function useMinuteTick(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}
