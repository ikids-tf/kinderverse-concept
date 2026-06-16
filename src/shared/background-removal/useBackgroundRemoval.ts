/**
 * useBackgroundRemoval — 배경 제거 React 훅(진행률/미리보기/취소). 내부적으로 공용 엔진
 * removeBackground를 호출한다(로직 중복 없음). 인라인 버튼/스튜디오 UI에서 사용.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { removeBackground, warmupBackgroundRemoval } from './removeBackground';
import type { RBInput, RemoveBgOptions, RemoveBgResult, RBProgress } from './types';

export type RBStatus = 'idle' | 'running' | 'done' | 'error';

export function useBackgroundRemoval() {
  const [status, setStatus] = useState<RBStatus>('idle');
  const [progress, setProgress] = useState<RBProgress | null>(null);
  const [result, setResult] = useState<RemoveBgResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const run = useCallback(
    async (input: RBInput, opts: Omit<RemoveBgOptions, 'signal' | 'onProgress'>): Promise<RemoveBgResult | null> => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      setStatus('running');
      setProgress(null);
      setResult(null);
      try {
        const r = await removeBackground(input, { ...opts, signal: ac.signal, onProgress: setProgress });
        if (!ac.signal.aborted) {
          setResult(r);
          setStatus('done');
        }
        return r;
      } catch (e) {
        if ((e as { name?: string })?.name !== 'AbortError') setStatus('error');
        return null;
      }
    },
    [],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setStatus('idle');
  }, []);

  return { run, cancel, status, progress, result, warmup: warmupBackgroundRemoval };
}
