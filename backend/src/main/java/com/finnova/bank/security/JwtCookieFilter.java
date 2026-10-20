package com.finnova.bank.security;

import java.io.IOException;
import java.util.Arrays;
import java.util.List;
import com.finnova.bank.common.ApiErrorWriter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.*;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.web.filter.OncePerRequestFilter;

public class JwtCookieFilter extends OncePerRequestFilter {
    private final JwtDecoder decoder;
    private final IdentityService identities;
    private final ApiErrorWriter errors;
    private final AuthCookies cookies;
    public JwtCookieFilter(JwtDecoder decoder, IdentityService identities, ApiErrorWriter errors, AuthCookies cookies) {
        this.decoder = decoder; this.identities = identities; this.errors = errors; this.cookies = cookies;
    }
    @Override protected boolean shouldNotFilter(HttpServletRequest request) {
        // Recovery endpoints must still work with an expired/stale cookie.
        return List.of("/api/health", "/api/auth/csrf", "/api/auth/login", "/api/auth/register").contains(request.getRequestURI().substring(request.getContextPath().length()));
    }
    @Override protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
            FilterChain chain) throws ServletException, IOException {
        List<Cookie> access = request.getCookies() == null ? List.of() : Arrays.stream(request.getCookies())
                .filter(cookie -> AuthCookies.ACCESS.equals(cookie.getName())).toList();
        if (access.isEmpty()) { chain.doFilter(request, response); return; }
        try {
            if (access.size() != 1 || access.getFirst().getValue().length() > 4096) throw new IllegalArgumentException("Invalid cookie");
            Jwt jwt = decoder.decode(access.getFirst().getValue());
            Object version = jwt.getClaim("ver");
            if (!(version instanceof Number number)) throw new IllegalArgumentException("Invalid claims");
            BankPrincipal principal = identities.resolve(Long.parseLong(jwt.getSubject()), number.longValue());
            var authentication = UsernamePasswordAuthenticationToken.authenticated(principal, null,
                    List.of(new SimpleGrantedAuthority("ROLE_" + principal.role().name())));
            var context = SecurityContextHolder.createEmptyContext();
            context.setAuthentication(authentication);
            SecurityContextHolder.setContext(context);
        } catch (JwtException | IllegalArgumentException | AuthenticationException ex) {
            SecurityContextHolder.clearContext();
            cookies.clear(response);
            errors.write(request, response, HttpStatus.UNAUTHORIZED, "Authentication is required or the session is no longer valid.");
            return;
        } catch (org.springframework.dao.DataAccessException ex) {
            SecurityContextHolder.clearContext();
            errors.write(request, response, HttpStatus.INTERNAL_SERVER_ERROR, "Authentication could not be verified. Please try again later.");
            return;
        }
        chain.doFilter(request, response);
    }
}
