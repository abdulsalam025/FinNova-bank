package com.finnova.bank.auth.domain;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import jakarta.persistence.*;

@Entity @Table(name = "customers")
public class CustomerProfile {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @Column(name = "user_id", nullable = false, unique = true) private Long userId;
    @Column(name = "date_of_birth", nullable = false) private LocalDate dateOfBirth;
    @Column(name = "declared_monthly_income", nullable = false, precision = 15, scale = 2) private BigDecimal declaredMonthlyIncome;
    @Column(name = "created_at", nullable = false, updatable = false) private Instant createdAt;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;
    protected CustomerProfile() { }
    public CustomerProfile(long userId, LocalDate birth, BigDecimal income, Instant now) {
        this.userId = userId; dateOfBirth = birth; declaredMonthlyIncome = income;
        createdAt = now; updatedAt = now;
    }
    public Long getId() { return id; }
    public Long getUserId() { return userId; }
    public LocalDate getDateOfBirth() { return dateOfBirth; }
    public BigDecimal getDeclaredMonthlyIncome() { return declaredMonthlyIncome; }
}

