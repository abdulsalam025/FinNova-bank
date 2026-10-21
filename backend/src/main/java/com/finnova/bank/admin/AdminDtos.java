package com.finnova.bank.admin;
import java.math.BigDecimal;
import java.time.Instant;
import com.fasterxml.jackson.annotation.JsonFormat;
import com.finnova.bank.auth.domain.Role;
import com.finnova.bank.auth.validation.StrongPassword;
import jakarta.validation.constraints.*;
public final class AdminDtos {
    private AdminDtos(){}
    public record Activation(@NotNull Boolean active,@NotBlank@Size(max=1000)String reason){}
    public record AssignRole(@NotNull Role role,@Digits(integer=13,fraction=2)@DecimalMin("0.01")BigDecimal approvalLimit,@NotBlank@Size(max=1000)String reason){}
    public record CreateOfficer(@NotBlank@Email@Size(max=254)String email,@NotBlank@Size(max=100)String fullName,@NotBlank@StrongPassword String password,@NotNull@Digits(integer=13,fraction=2)@DecimalMin("0.01")BigDecimal approvalLimit){}
    public record CreditAccount(@NotNull@Digits(integer=13,fraction=2)@DecimalMin("0.01")BigDecimal amount,@NotBlank@Size(max=200)String reason){}
    public record UserView(long id,String email,String fullName,String role,boolean enabled,
        @JsonFormat(shape=JsonFormat.Shape.STRING)BigDecimal approvalLimit,Long customerId,Instant createdAt,Instant lastLoginAt,Instant lockedUntil){}
}