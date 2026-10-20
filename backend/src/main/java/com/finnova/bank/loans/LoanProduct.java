package com.finnova.bank.loans;
import java.math.BigDecimal;
import java.time.Instant;
import jakarta.persistence.*;
@Entity @Table(name="loan_products")
public class LoanProduct {
    @Id @GeneratedValue(strategy=GenerationType.IDENTITY)Long id;
    @Column(nullable=false,length=30)String code;
    @Column(nullable=false,length=100)String name;
    @Column(nullable=false,length=1000)String description;
    @Column(name="min_principal",nullable=false,precision=15,scale=2)BigDecimal minPrincipal;
    @Column(name="max_principal",nullable=false,precision=15,scale=2)BigDecimal maxPrincipal;
    @Column(name="annual_rate",nullable=false,precision=5,scale=2)BigDecimal annualRate;
    @Column(name="min_annual_rate",nullable=false,precision=5,scale=2)BigDecimal minAnnualRate;
    @Column(name="max_annual_rate",nullable=false,precision=5,scale=2)BigDecimal maxAnnualRate;
    @Column(name="min_tenure_months",nullable=false)int minTenure;
    @Column(name="max_tenure_months",nullable=false)int maxTenure;
    @Column(name="tenure_step_months",nullable=false)int tenureStep;
    @Column(name="min_age",nullable=false)int minAge;
    @Column(name="max_age",nullable=false)int maxAge;
    @Column(name="max_income_multiplier",nullable=false,precision=7,scale=2)BigDecimal incomeMultiplier;
    @Column(nullable=false,columnDefinition="tinyint(1)")boolean active;
    @Version long version;
    @Column(name="created_at",nullable=false,updatable=false)Instant createdAt;
    @Column(name="updated_at",nullable=false)Instant updatedAt;
    protected LoanProduct(){}
}
