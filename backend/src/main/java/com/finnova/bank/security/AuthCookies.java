package com.finnova.bank.security;

import java.time.Duration;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;

@Component
public class AuthCookies {
    public static final String ACCESS = "FN_ACCESS";
    private final SecurityProperties properties;
    public AuthCookies(SecurityProperties properties) { this.properties = properties; }
    public void set(HttpServletResponse response, String token) {
        response.addHeader(HttpHeaders.SET_COOKIE, cookie(token, Duration.ofSeconds(properties.tokenTtlSeconds())).toString());
    }
    public void clear(HttpServletResponse response) {
        response.addHeader(HttpHeaders.SET_COOKIE, cookie("", Duration.ZERO).toString());
    }
    private ResponseCookie cookie(String value, Duration duration) {
        return ResponseCookie.from(ACCESS, value).httpOnly(true).secure(properties.cookieSecure())
                .sameSite("Lax").path("/api").maxAge(duration).build();
    }
}
