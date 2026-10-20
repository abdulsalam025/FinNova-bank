package com.finnova.bank.security;
import java.time.*;
import java.util.ArrayList;
import java.util.concurrent.*;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
class RateLimiterTest {
    static class MutableClock extends Clock {
        Instant now = Instant.parse("2026-01-01T00:00:00Z");
        public ZoneId getZone() { return ZoneOffset.UTC; }
        public Clock withZone(ZoneId zone) { return this; }
        public Instant instant() { return now; }
    }
    @Test void capsEachKeyAndAllowsItAfterTheWindowExpires() {
        MutableClock clock = new MutableClock(); InMemoryRateLimiter limiter = new InMemoryRateLimiter(clock);
        assertTrue(limiter.acquire("login:one", 2).allowed()); assertTrue(limiter.acquire("login:one", 2).allowed());
        assertFalse(limiter.acquire("login:one", 2).allowed());
        assertEquals(60L, limiter.acquire("login:one", 2).retryAfterSeconds());
        clock.now = clock.now.plusSeconds(60); assertTrue(limiter.acquire("login:one", 2).allowed());
    }
    @Test void bucketsAreIndependent() {
        InMemoryRateLimiter limiter = new InMemoryRateLimiter(Clock.systemUTC());
        assertTrue(limiter.acquire("login:one", 1).allowed()); assertFalse(limiter.acquire("login:one", 1).allowed());
        assertTrue(limiter.acquire("login:two", 1).allowed()); assertTrue(limiter.acquire("register:one", 1).allowed());
    }
    @Test void concurrentAcquisitionsDoNotExceedTheLimit() throws Exception {
        InMemoryRateLimiter limiter = new InMemoryRateLimiter(Clock.fixed(Instant.EPOCH, ZoneOffset.UTC));
        try (ExecutorService executor = Executors.newFixedThreadPool(8)) {
            var jobs = new ArrayList<Callable<Boolean>>();
            for (int i = 0; i < 50; i++) jobs.add(() -> limiter.acquire("one-key", 10).allowed());
            int accepted = 0;
            for (Future<Boolean> result : executor.invokeAll(jobs)) if (result.get()) accepted++;
            assertEquals(10, accepted);
        }
    }
}
