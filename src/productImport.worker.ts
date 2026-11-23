import { parseProductWorkbook } from "./productExcel";
self.onmessage = (event: MessageEvent<ArrayBuffer>) => {
  try {
    self.postMessage({ ok: true, ...parseProductWorkbook(event.data) });
  } catch (e) {
    self.postMessage({ ok: false, error: (e as Error).message });
  }
};
