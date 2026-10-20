package com.finnova.bank.auth.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import com.finnova.bank.auth.validation.StrongPassword;
import jakarta.validation.constraints.*;

public final class AuthDtos {
    private AuthDtos() { }
    public record RegisterRequest(
            @NotBlank @Email @Size(max = 254) String email,
            @NotBlank @Size(min = 2, max = 100) String fullName,
            @StrongPassword String password,
            @NotNull @Past LocalDate dateOfBirth,
            @NotNull @DecimalMin("0.00") @Digits(integer = 13, fraction = 2) BigDecimal declaredMonthlyIncome) { }
    public record LoginRequest(@NotBlank @Email @Size(max = 254) String email,
                               @NotBlank @Size(max = 72) String password) { }
    public record ChangePasswordRequest(@NotBlank @Size(max = 72) String currentPassword,
                                        @StrongPassword String newPassword) { }
    public record UpdateProfileRequest(@NotBlank @Size(min = 2, max = 100) String fullName) { }
    public record CustomerView(Long id, LocalDate dateOfBirth, BigDecimal declaredMonthlyIncome) { }
    public record ProfileResponse(Long id, String email, String fullName, String role, boolean enabled,
                                  Instant createdAt, CustomerView customer) { }
    public record CsrfResponse(String token, String headerName) { }
    // Internal service result only. Never return or log this record as an API body.
    public record LoginResult(String accessToken, ProfileResponse profile) {
        @Override public String toString() { return "LoginResult[token=REDACTED]"; }
    }
}
