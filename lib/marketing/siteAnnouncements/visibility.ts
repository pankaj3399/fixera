/** Run an impression only while its mounted announcement is in a visible tab. */
export function whenDocumentVisible(onVisible: () => void): () => void {
  let pending = true;
  const check = () => {
    if (!pending || document.visibilityState !== "visible") return;
    pending = false;
    document.removeEventListener("visibilitychange", check);
    onVisible();
  };
  document.addEventListener("visibilitychange", check);
  check();
  // An unmounted/hidden overlay must not count when the visitor returns later.
  return () => {
    pending = false;
    document.removeEventListener("visibilitychange", check);
  };
}
