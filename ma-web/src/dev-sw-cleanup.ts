export async function cleanupDevServiceWorkers(): Promise<void> {
  if (!import.meta.env.DEV) return
  if (!('serviceWorker' in navigator)) return

  const isDevOrigin =
    (location.hostname === 'localhost' || location.hostname === '127.0.0.1') &&
    location.port === '4173'

  if (!isDevOrigin) return

  try {
    const registrations = await navigator.serviceWorker.getRegistrations()
    await Promise.all(registrations.map(registration => registration.unregister()))

    if ('caches' in window) {
      const cacheNames = await caches.keys()
      await Promise.all(cacheNames.map(name => caches.delete(name)))
    }
  } catch {
    // Keep dev boot resilient even if cleanup fails.
  }
}
