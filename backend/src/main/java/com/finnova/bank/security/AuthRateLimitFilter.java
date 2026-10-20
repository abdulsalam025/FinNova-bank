package com.finnova.bank.security;

import java.io.IOException;
import com.finnova.bank.common.ApiErrorWriter;
import jakarta.servlet.*;
import jakarta.servlet.http.*;
import org.springframework.http.HttpStatus;
import org.springframework.web.filter.OncePerRequestFilter;

public class AuthRateLimitFilter extends OncePerRequestFilter {
    private final InMemoryRateLimiter limiter;
    private final SecurityProperties properties;
    private final ApiErrorWriter errors;
    public AuthRateLimitFilter(InMemoryRateLimiter limiter, SecurityProperties properties, ApiErrorWriter errors) {
        this.limiter = limiter; this.properties = properties; this.errors = errors;
    }
    @Override protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
            FilterChain chain) throws ServletException, IOException {
        String path = request.getRequestURI().substring(request.getContextPath().length());
        if (properties.rateLimitEnabled() && "POST".equals(request.getMethod()) &&
                ("/api/auth/login".equals(path) || "/api/auth/register".equals(path))) {
            int limit = path.endsWith("login") ? properties.loginRequestsPerMinute() : properties.registrationRequestsPerMinute();
            // Forwarded headers are not trusted. Vite's local proxy shares one loopback bucket.
            var decision = limiter.acquire(path + ":" + request.getRemoteAddr(), limit);
            if (!decision.allowed()) {
                response.setHeader("Retry-After", Long.toString(decision.retryAfterSeconds()));
                errors.write(request, response, HttpStatus.TOO_MANY_REQUESTS, "Too many requests. Please wait and try again.");
                return;
            }
        }
        chain.doFilter(request, response);
    }
}
