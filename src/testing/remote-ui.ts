declare global {
  interface Window {
    __REMOTE_UI?: {
      waitForSelector: (
        selector: string,
        opts?: { timeout?: number; visible?: boolean },
      ) => Promise<HTMLElement>;
      click: (
        selector: string,
        opts?: { timeout?: number; visible?: boolean; scroll?: boolean },
      ) => Promise<void>;
      type: (
        selector: string,
        text: string,
        opts?: {
          replace?: boolean;
          delayMs?: number;
          submitWithEnter?: boolean;
        },
      ) => Promise<void>;
      press: (selector: string, key: string) => Promise<void>;
      clear: (selector: string) => Promise<void>;
    };
  }
}

function isProd(): boolean {
  // Only enable when explicitly allowed
  // Vite sets import.meta.env.MODE
  // Allow override via ENABLE_REMOTE_HARNESS=1
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mode = (import.meta as any).env?.MODE ?? "production";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allow = (import.meta as any).env?.ENABLE_REMOTE_HARNESS === "1";
  return mode === "production" && !allow;
}

function isVisible(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect();
  const style = getComputedStyle(el);
  return (
    rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none"
  );
}

export function installRemoteUI(): void {
  if (typeof window === "undefined") return;
  if (window.__REMOTE_UI) return;
  if (isProd()) return;

  const waitForSelector = (
    selector: string,
    opts?: { timeout?: number; visible?: boolean },
  ): Promise<HTMLElement> => {
    const timeout = opts?.timeout ?? 5000;
    const enforceVisible = !!opts?.visible;
    return new Promise((resolve, reject) => {
      const finish = (el?: HTMLElement) => {
        observer.disconnect();
        clearTimeout(timer);
        if (el) resolve(el);
        else reject(new Error(`waitForSelector timeout: ${selector}`));
      };

      const check = () => {
        const el = document.querySelector<HTMLElement>(selector);
        if (el && (!enforceVisible || isVisible(el))) {
          finish(el);
        }
      };

      const observer = new MutationObserver(check);
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: enforceVisible,
        attributeFilter: enforceVisible ? ["style", "class", "hidden", "aria-hidden"] : undefined,
      });

      const timer = window.setTimeout(() => finish(), timeout);
      check();
    });
  };

  const click = async (
    selector: string,
    opts?: { timeout?: number; visible?: boolean; scroll?: boolean },
  ): Promise<void> => {
    const el = await waitForSelector(selector, {
      timeout: opts?.timeout,
      visible: opts?.visible ?? true,
    });
    if (!(el instanceof HTMLElement)) throw new Error(`Element not clickable: ${selector}`);
    if (opts?.scroll ?? true) el.scrollIntoView({ block: "center", inline: "center" });
    el.focus();
    if (typeof el.click === "function") {
      el.click();
      return;
    }
    el.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        composed: true,
      }),
    );
  };

  const setNativeValue = (el: HTMLInputElement | HTMLTextAreaElement, value: string) => {
    const proto = Object.getPrototypeOf(el);
    const desc = Object.getOwnPropertyDescriptor(proto, "value");
    const setter = desc?.set?.bind(el);
    if (setter) {
      setter(value);
    } else {
      // eslint-disable-next-line no-param-reassign
      (el as any).value = value;
    }
  };

  const type = async (
    selector: string,
    text: string,
    opts?: { replace?: boolean; delayMs?: number; submitWithEnter?: boolean },
  ): Promise<void> => {
    const el = await waitForSelector(selector, { visible: true });
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      el.focus();
      if (opts?.replace) setNativeValue(el, "");
      const delay = opts?.delayMs ?? 0;

      const applyChar = async (val: string) => {
        setNativeValue(el, val);
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        if (delay > 0) await new Promise((r) => setTimeout(r, delay));
      };

      if (delay > 0) {
        let current = opts?.replace ? "" : (el.value ?? "");
        for (const ch of text) {
          current += ch;
          // eslint-disable-next-line no-await-in-loop
          await applyChar(current);
        }
      } else {
        const base = opts?.replace ? "" : (el.value ?? "");
        await applyChar(base + text);
      }

      if (opts?.submitWithEnter) {
        el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
        el.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", bubbles: true }));
      }
      return;
    }

    if ((el as HTMLElement).isContentEditable) {
      el.focus();
      (el as HTMLElement).textContent = text;
      el.dispatchEvent(new InputEvent("input", { bubbles: true }));
      return;
    }

    (el as HTMLElement).textContent = text;
  };

  const press = async (selector: string, key: string): Promise<void> => {
    const el = await waitForSelector(selector, { visible: true });
    el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    el.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true }));
  };

  const clear = async (selector: string): Promise<void> => {
    const el = await waitForSelector(selector, { visible: true });
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      el.focus();
      setNativeValue(el, "");
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    } else if ((el as HTMLElement).isContentEditable) {
      (el as HTMLElement).textContent = "";
      el.dispatchEvent(new InputEvent("input", { bubbles: true }));
    }
  };

  window.__REMOTE_UI = { waitForSelector, click, type, press, clear };
  console.log("[remote-ui] helpers installed");
}
