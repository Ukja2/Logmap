import { useCallback, useMemo, useRef, useState } from 'react';
import type { FileEntry } from '../types';

/**
 * 캔버스 카드와 파일 뷰어가 함께 쓰는 .md 파일 내용 캐시.
 * (같은 파일을 어디서 고치든 다른 곳에 즉시 반영된다)
 * - 편집하면 400ms 뒤 디스크에 저장
 * - 다른 앱에서 파일이 바뀌면 reload()로 갱신 (내가 방금 쓴 내용이면 무시)
 */
export function useFileStore() {
  const [files, setFiles] = useState<Record<string, FileEntry>>({});
  const timers = useRef<Record<string, number>>({});
  const pending = useRef<Record<string, string>>({});
  const lastWritten = useRef<Record<string, string>>({});
  /** 저장 대기·진행 중인 파일 (화면에 "저장 중…" 표시용) */
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const markSaving = (p: string, v: boolean) =>
    setSaving((prev) => (!!prev[p] === v ? prev : { ...prev, [p]: v }));

  const setEntry = (p: string, entry: FileEntry) => setFiles((prev) => ({ ...prev, [p]: entry }));

  const read = useCallback(async (p: string) => {
    try {
      const f = await window.api.readTextFile(p);
      setEntry(p, { content: f.content });
    } catch (e) {
      setEntry(p, { content: '', error: (e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') });
    }
  }, []);

  const load = useCallback(async (paths: string[]) => {
    await Promise.all(paths.map(read));
  }, [read]);

  const reload = useCallback(async (p: string) => {
    if (pending.current[p] !== undefined) return; // 아직 저장 대기 중인 편집이 있으면 덮어쓰지 않음
    try {
      const f = await window.api.readTextFile(p);
      if (f.content === lastWritten.current[p]) return;
      setFiles((prev) => (prev[p]?.content === f.content && !prev[p]?.error ? prev : { ...prev, [p]: { content: f.content } }));
    } catch (e) {
      setEntry(p, { content: '', error: (e as Error).message });
    }
  }, []);

  const writeNow = useCallback(async (p: string) => {
    window.clearTimeout(timers.current[p]);
    const content = pending.current[p];
    if (content === undefined) return;
    delete pending.current[p];
    lastWritten.current[p] = content;
    try {
      await window.api.writeTextFile(p, content);
    } catch (e) {
      window.alert(`파일을 저장하지 못했어요: ${p}\n${(e as Error).message}`);
    } finally {
      if (pending.current[p] === undefined) markSaving(p, false);
    }
  }, []);

  const update = useCallback((p: string, content: string) => {
    setEntry(p, { content });
    pending.current[p] = content;
    markSaving(p, true);
    window.clearTimeout(timers.current[p]);
    timers.current[p] = window.setTimeout(() => writeNow(p), 400);
  }, [writeNow]);

  /** 새로 만든 파일처럼 내용을 이미 알고 있을 때 */
  const prime = useCallback((p: string, content: string) => {
    lastWritten.current[p] = content;
    setEntry(p, { content });
  }, []);

  const flushAll = useCallback(async () => {
    await Promise.all(Object.keys(pending.current).map(writeNow));
  }, [writeNow]);

  return useMemo(
    () => ({ files, saving, load, reload, update, prime, flushAll, writeNow }),
    [files, saving, load, reload, update, prime, flushAll, writeNow],
  );
}

export type FileStore = ReturnType<typeof useFileStore>;
