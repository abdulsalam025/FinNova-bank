package com.finnova.bank.banking;
import java.io.IOException;
import com.finnova.bank.common.ApiErrorWriter;
import com.finnova.bank.security.InMemoryRateLimiter;
import com.finnova.bank.security.SecurityProperties;
import jakarta.servlet.*;
import jakarta.servlet.http.*;
import org.springframework.http.HttpStatus;
import org.springframework.web.filter.OncePerRequestFilter;
public class TransferRateLimitFilter extends OncePerRequestFilter {
    private final InMemoryRateLimiter limiter;
    private final SecurityProperties security;
    private final TransferProperties properties;
    private final ApiErrorWriter errors;
    public TransferRateLimitFilter(InMemoryRateLimiter limiter, SecurityProperties security, TransferProperties properties, ApiErrorWriter errors) {
        this.limiter = limiter; this.security = security; this.properties = properties; this.errors = errors;
    }
    @Override protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain) throws IOException, ServletException {
        String path = request.getRequestURI().substring(request.getContextPath().length());
        if (security.rateLimitEnabled() && "POST".equals(request.getMethod()) && "/api/transfers".equals(path)) {
            var decision = limiter.acquire("transfer:" + request.getRemoteAddr(), properties.requestsPerMinute());
            if (!decision.allowed()) {
                response.setHeader("Retry-After", Long.toString(decision.retryAfterSeconds()));
                errors.write(request, response, HttpStatus.TOO_MANY_REQUESTS, "Too many transfer requests. Wait and retry with the SAME idempotency key.");
                return;
            }
        }
        chain.doFilter(request, response);
    }
}
