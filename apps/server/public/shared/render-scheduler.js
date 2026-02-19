export function createRenderScheduler(onFlush) {
  const flush = typeof onFlush === "function" ? onFlush : () => {};
  let scheduled = false;
  let cancelPending = null;
  let handle = null;

  function schedule() {
    if (scheduled) return;
    scheduled = true;

    if (typeof requestAnimationFrame === "function") {
      cancelPending = (id) => cancelAnimationFrame(id);
      handle = requestAnimationFrame(() => {
        scheduled = false;
        handle = null;
        flush();
      });
      return;
    }

    cancelPending = (id) => clearTimeout(id);
    handle = setTimeout(() => {
      scheduled = false;
      handle = null;
      flush();
    }, 16);
  }

  function cancel() {
    if (!scheduled || handle == null || !cancelPending) return;
    cancelPending(handle);
    scheduled = false;
    cancelPending = null;
    handle = null;
  }

  return {
    schedule,
    cancel,
    isScheduled: () => scheduled
  };
}
