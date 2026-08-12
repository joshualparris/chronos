// hooks/useQuickTimers.js — localStorage-backed quick timers with proper timeout tracking
import { useState, useEffect, useRef, useCallback } from 'react';

const STORAGE_KEY = 'chronos-quick-timers';

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const timers = JSON.parse(raw);
    // Filter out already-expired timers
    return timers.filter(t => t.endTime > Date.now());
  } catch {
    return [];
  }
}

function saveToStorage(timers) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(timers));
}

export function useQuickTimers(onExpire) {
  const [timers, setTimers] = useState(loadFromStorage);
  const timeoutRefs = useRef({}); // id → timeoutId

  // Whenever a timer expires, fire notification + remove
  const handleExpire = useCallback((timer) => {
    setTimers(prev => {
      const next = prev.filter(t => t.id !== timer.id);
      saveToStorage(next);
      return next;
    });
    onExpire?.(timer);
  }, [onExpire]);

  // Schedule timeouts for all active timers (including ones restored from localStorage)
  useEffect(() => {
    const current = timers;
    for (const timer of current) {
      if (!timeoutRefs.current[timer.id]) {
        const remaining = Math.max(0, timer.endTime - Date.now());
        timeoutRefs.current[timer.id] = setTimeout(() => {
          delete timeoutRefs.current[timer.id];
          handleExpire(timer);
        }, remaining);
      }
    }
    // Cleanup timeouts for timers no longer in state (cancelled)
    const currentIds = new Set(current.map(t => t.id));
    for (const [id, tid] of Object.entries(timeoutRefs.current)) {
      if (!currentIds.has(id)) {
        clearTimeout(tid);
        delete timeoutRefs.current[id];
      }
    }
  }, [timers, handleExpire]);

  // Cleanup all timeouts on unmount
  useEffect(() => {
    return () => Object.values(timeoutRefs.current).forEach(clearTimeout);
  }, []);

  const addTimer = useCallback((message, minutes) => {
    const timer = {
      id: `qt-${Date.now()}`,
      message,
      minutes,
      endTime: Date.now() + minutes * 60000,
      createdAt: Date.now(),
    };
    setTimers(prev => {
      const next = [...prev, timer];
      saveToStorage(next);
      return next;
    });
  }, []);

  const cancelTimer = useCallback((id) => {
    if (timeoutRefs.current[id]) {
      clearTimeout(timeoutRefs.current[id]);
      delete timeoutRefs.current[id];
    }
    setTimers(prev => {
      const next = prev.filter(t => t.id !== id);
      saveToStorage(next);
      return next;
    });
  }, []);

  return { timers, addTimer, cancelTimer };
}
