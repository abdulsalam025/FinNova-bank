package com.finnova.bank.security;

import java.io.IOException;
import java.util.List;
import com.finnova.bank.common.ApiErrorWriter;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfFilter;
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.*;
import org.springframework.web.filter.CorsFilter;

@Configuration
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
public class WebSecurityConfiguration {
    @Bean
    org.springframework.security.config.annotation.web.configuration.WebSecurityCustomizer rejectedRequests(ApiErrorWriter errors) {
        return web -> web.requestRejectedHandler((request, response, ex) -> errors.write(request, response,
                HttpStatus.BAD_REQUEST, "The HTTP request path or headers are invalid."));
    }
    @Bean
    SecurityFilterChain applicationSecurity(HttpSecurity http, SecurityProperties properties,
            CookieCsrfTokenRepository csrf, JwtDecoder decoder, IdentityService identities,
            AuthCookies cookies, ApiErrorWriter errors, InMemoryRateLimiter limiter, com.finnova.bank.banking.TransferProperties transfers) throws Exception {
        for (String origin : properties.allowedOrigins()) {
            if (origin.contains("*") || origin.equals("null") || !(origin.startsWith("http://") || origin.startsWith("https://"))) {
                throw new IllegalStateException("Configure explicit HTTP(S) frontend origins; wildcards/null are prohibited.");
            }
        }
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOrigins(properties.allowedOrigins());
        config.setAllowCredentials(true);
        config.setAllowedMethods(List.of("GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("Accept", "Content-Type", "X-CSRF-TOKEN", "Idempotency-Key"));
        config.setExposedHeaders(List.of("Idempotency-Replayed", "Retry-After"));
        config.setMaxAge(600L);
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        CorsFilter cors = new CorsFilter(source);
        cors.setCorsProcessor((configuration, request, response) -> new DefaultCorsProcessor() {
            @Override protected void rejectRequest(ServerHttpResponse ignored) throws IOException {
                errors.write(request, response, HttpStatus.FORBIDDEN, "This request origin, method or header is not permitted.");
            }
        }.processRequest(configuration, request, response));
        // Only the header is accepted, not a URL/form parameter. Browser code obtains
        // this token from /api/auth/csrf; neither token needs localStorage.
        CsrfTokenRequestAttributeHandler csrfHandler = new CsrfTokenRequestAttributeHandler() {
            @Override public String resolveCsrfTokenValue(jakarta.servlet.http.HttpServletRequest request,
                    org.springframework.security.web.csrf.CsrfToken token) {
                return request.getHeader(token.getHeaderName());
            }
        };
        http.sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .requestCache(AbstractHttpConfigurer::disable)
                .formLogin(AbstractHttpConfigurer::disable).httpBasic(AbstractHttpConfigurer::disable)
                .logout(AbstractHttpConfigurer::disable).cors(AbstractHttpConfigurer::disable)
                .csrf(setting -> setting.csrfTokenRepository(csrf)
                        .csrfTokenRequestHandler(csrfHandler)
                        // JWT authentication happens on EVERY request, not only login.
                        // Do not rotate/delete CSRF for every reconstructed principal.
                        // AuthController explicitly rotates it on credential boundaries.
                        // This changes rotation only: CsrfFilter validation stays ON.
                        .sessionAuthenticationStrategy(new org.springframework.security.web.authentication.session.NullAuthenticatedSessionStrategy()))
                .exceptionHandling(handling -> handling
                        .authenticationEntryPoint((request, response, ex) -> errors.write(request, response,
                                HttpStatus.UNAUTHORIZED, "Authentication is required or the session is no longer valid."))
                        .accessDeniedHandler((request, response, ex) -> errors.write(request, response,
                                HttpStatus.FORBIDDEN, "Permission denied or CSRF token missing/invalid.")))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(HttpMethod.GET, "/api/health", "/api/auth/csrf", "/api/loan-products", "/api/loan-products/**").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/auth/register", "/api/auth/login").permitAll()
                        .anyRequest().authenticated())
                .addFilterBefore(cors, CsrfFilter.class)
                .addFilterBefore(new AuthRateLimitFilter(limiter, properties, errors), CsrfFilter.class)
                .addFilterBefore(new com.finnova.bank.banking.TransferRateLimitFilter(limiter, properties, transfers, errors), CsrfFilter.class)
                .addFilterBefore(new com.finnova.bank.loans.RepaymentRateFilter(limiter, properties, transfers, errors), CsrfFilter.class)
                .addFilterBefore(new JwtCookieFilter(decoder, identities, errors, cookies), UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }
}



