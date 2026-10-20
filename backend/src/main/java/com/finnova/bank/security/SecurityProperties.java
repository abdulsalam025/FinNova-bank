package com.finnova.bank.security;

import java.util.List;
import jakarta.validation.constraints.*;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

@Validated
@ConfigurationProperties(prefix = "app.security")
public record SecurityProperties(
        @NotBlank String jwtSecret, @NotBlank String issuer, @NotBlank String audience,
        @Min(300) @Max(3600) long tokenTtlSeconds, boolean cookieSecure,
        @NotEmpty List<@NotBlank String> allowedOrigins, boolean rateLimitEnabled,
        @Min(1) @Max(1000) int loginRequestsPerMinute,
        @Min(1) @Max(1000) int registrationRequestsPerMinute) {
    @Override public String toString() { return "SecurityProperties[secret=REDACTED]"; }
}
