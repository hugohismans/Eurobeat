// Web Worker : analyse hors du thread UI.
import { analyze } from './dsp';

export interface AnalyzeRequest {
  data: Float32Array;
  sr: number;
}
export type AnalyzeMessage = { type: 'progress'; value: number } | { type: 'done'; analysis: ReturnType<typeof analyze> } | { type: 'error'; message: string };

self.onmessage = (e: MessageEvent<AnalyzeRequest>) => {
  try {
    const analysis = analyze(e.data.data, e.data.sr, (value) => self.postMessage({ type: 'progress', value } satisfies AnalyzeMessage));
    self.postMessage({ type: 'done', analysis } satisfies AnalyzeMessage);
  } catch (err) {
    self.postMessage({ type: 'error', message: (err as Error).message } satisfies AnalyzeMessage);
  }
};
