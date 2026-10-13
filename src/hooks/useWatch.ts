import { useEffect, useState } from 'react';
import type { Listener, Unsubscribe } from '../data/repository';

/** Repository の watch* を購読し、最新値を返す。読み込み中は undefined。 */
export function useWatch<T>(
  subscribe: ((listener: Listener<T>) => Unsubscribe) | null,
  deps: readonly unknown[],
): T | undefined {
  const [value, setValue] = useState<T>();
  useEffect(() => {
    setValue(undefined);
    if (!subscribe) return;
    return subscribe(setValue);
    // subscribe は毎回新しい関数になるため、依存は呼び出し側の deps で管理する
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return value;
}
