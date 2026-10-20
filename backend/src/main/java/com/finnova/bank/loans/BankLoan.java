package com.finnova.bank.loans;
import java.math.BigDecimal;
import java.time.Instant;
import jakarta.persistence.*;
@Entity @Table(name="loans")
public class BankLoan {
    @Id @GeneratedValue(strategy=GenerationType.IDENTITY)Long id;
    @Column(name="loan_application_id",nullable=false,unique=true,updatable=false)Long applicationId;
    @Column(name="customer_id",nullable=false,updatable=false)Long customerId;
    @Column(name="disbursement_account_id",nullable=false,updatable=false)Long accountId;
    @Column(nullable=false,precision=15,scale=2,updatable=false)BigDecimal principal;
    @Column(name="annual_rate",nullable=false,precision=5,scale=2,updatable=false)BigDecimal annualRate;
    @Column(name="tenure_months",nullable=false,updatable=false)int months;
    @Column(name="emi_amount",nullable=false,precision=15,scale=2,updatable=false)BigDecimal emi;
    @Column(name="outstanding_principal",nullable=false,precision=15,scale=2)BigDecimal outstanding;
    @Column(nullable=false,length=16)String status;
    @Column(name="disbursed_at",nullable=false,updatable=false)Instant disbursedAt;
    @Column(name="closed_at")Instant closedAt;
    @Version long version;
    @Column(name="created_at",nullable=false,updatable=false)Instant createdAt;
    @Column(name="updated_at",nullable=false)Instant updatedAt;
    protected BankLoan(){}
}
