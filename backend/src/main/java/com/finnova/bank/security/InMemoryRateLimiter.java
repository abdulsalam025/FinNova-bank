package com.finnova.bank.security;

import java.time.Clock;
import java.util.HashMap;
import java.util.Map;
import org.springframework.stereotype.Component;

@Component
public class InMemoryRateLimiter {
    private static final long WINDOW_MS = 60_000;
    private static final int MAX_KEYS = 10_000;
    private final Clock clock;
    private final Map<String, Window> windows = new HashMap<>();
    private record Window(long resetsAt, int used) { }
    public record Decision(boolean allowed, long retryAfterSeconds) { }
    public InMemoryRateLimiter(Clock clock) { this.clock = clock; }
    public synchronized Decision acquire(String key, int limit) {
        long now = clock.millis();
        Window window = windows.get(key);
        if (window == null || window.resetsAt() <= now) {
            if (windows.size() >= MAX_KEYS) windows.entrySet().removeIf(entry -> entry.getValue().resetsAt() <= now);
            if (!windows.containsKey(key) && windows.size() >= MAX_KEYS) return new Decision(false, 60);
            windows.put(key, new Window(now + WINDOW_MS, 1));
            return new Decision(true, 0);
        }
        if (window.used() >= limit) return new Decision(false, Math.max(1, (window.resetsAt() - now + 999) / 1000));
        windows.put(key, new Window(window.resetsAt(), window.used() + 1));
        return new Decision(true, 0);
    }
}
