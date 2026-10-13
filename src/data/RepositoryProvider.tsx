import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { newId } from '../utils/id';
import { LocalRepository } from './localRepository';
import type { Repository } from './repository';

const DEVICE_KEY = 'univfes.deviceId';

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* プライベートブラウズ等で保存できない場合は、その場限りで動かす */
  }
}

/** 操作ログに残す、この端末の目印。 */
export function deviceId(): string {
  let id = safeGet(DEVICE_KEY);
  if (!id) {
    id = `device-${newId().slice(0, 8)}`;
    safeSet(DEVICE_KEY, id);
  }
  return id;
}

const RepositoryContext = createContext<Repository | null>(null);

export function RepositoryProvider({ children }: { children: ReactNode }) {
  const repo = useMemo(() => new LocalRepository(undefined, deviceId()), []);
  return <RepositoryContext.Provider value={repo}>{children}</RepositoryContext.Provider>;
}

export function useRepository(): Repository {
  const repo = useContext(RepositoryContext);
  if (!repo) throw new Error('RepositoryProvider の内側で使ってください');
  return repo;
}
