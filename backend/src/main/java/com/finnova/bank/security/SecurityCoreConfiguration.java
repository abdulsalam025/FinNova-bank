package com.finnova.bank.security;

import java.time.Clock;
import java.time.Duration;
import java.util.Base64;
import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import com.nimbusds.jose.jwk.source.ImmutableSecret;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.core.*;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;

@Configuration
@EnableMethodSecurity
@EnableConfigurationProperties(SecurityProperties.class)
public class SecurityCoreConfiguration {
    @Bean Clock applicationClock() { return Clock.systemUTC(); }
    @Bean PasswordEncoder passwordEncoder() { return new BCryptPasswordEncoder(12); }
    @Bean SecretKey jwtSigningKey(SecurityProperties properties) {
        byte[] bytes;
        try { bytes = Base64.getDecoder().decode(properties.jwtSecret()); }
        catch (IllegalArgumentException ex) { throw new IllegalStateException("JWT key must be locally generated Base64. Never print its value."); }
        if (bytes.length < 32) throw new IllegalStateException("JWT key must contain at least 32 random bytes.");
        return new SecretKeySpec(bytes, "HmacSHA256");
    }
    @Bean JwtEncoder jwtEncoder(SecretKey key) { return new NimbusJwtEncoder(new ImmutableSecret<>(key)); }
    @Bean JwtDecoder jwtDecoder(SecretKey key, SecurityProperties properties, Clock clock) {
        NimbusJwtDecoder decoder = NimbusJwtDecoder.withSecretKey(key).macAlgorithm(MacAlgorithm.HS256).build();
        JwtTimestampValidator time = new JwtTimestampValidator(Duration.ofSeconds(30));
        time.setClock(clock);
        OAuth2TokenValidator<Jwt> audience = token -> token.getAudience() != null && token.getAudience().contains(properties.audience())
                ? OAuth2TokenValidatorResult.success()
                : OAuth2TokenValidatorResult.failure(new OAuth2Error("invalid_token", "Invalid audience", null));
        OAuth2TokenValidator<Jwt> required = token -> token.getExpiresAt() != null && token.getIssuedAt() != null
                && token.getSubject() != null && token.getId() != null && token.getClaim("ver") instanceof Number
                && token.getExpiresAt().isAfter(token.getIssuedAt())
                && !token.getIssuedAt().isAfter(clock.instant().plusSeconds(30))
                ? OAuth2TokenValidatorResult.success()
                : OAuth2TokenValidatorResult.failure(new OAuth2Error("invalid_token", "Invalid claims", null));
        decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(time, new JwtIssuerValidator(properties.issuer()), audience, required));
        return decoder;
    }
    @Bean CookieCsrfTokenRepository csrfTokenRepository(SecurityProperties properties) {
        CookieCsrfTokenRepository repository = new CookieCsrfTokenRepository();
        repository.setCookieName("FN_CSRF");
        repository.setHeaderName("X-CSRF-TOKEN");
        repository.setCookiePath("/api");
        repository.setCookieCustomizer(cookie -> cookie.httpOnly(true).secure(properties.cookieSecure()).sameSite("Lax"));
        return repository;
    }
}
