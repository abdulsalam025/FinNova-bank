package com.finnova.bank.loans;
import java.math.BigDecimal;
import java.time.Instant;
import jakarta.persistence.*;
import org.hibernate.annotations.Immutable;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
@Entity @Immutable @Table(name="payments")
public class LoanPayment {
    @Id @GeneratedValue(strategy=GenerationType.IDENTITY)Long id;
    @Column(name="loan_id",nullable=false,updatable=false)Long loanId;
    @Column(name="installment_id",nullable=false,unique=true,updatable=false)Long installmentId;
    @Column(name="account_id",nullable=false,updatable=false)Long accountId;
    @Column(name="transaction_id",nullable=false,unique=true,updatable=false)Long transactionId;
    @Column(name="idempotency_key_id",nullable=false,unique=true,updatable=false)Long keyId;
    @JdbcTypeCode(SqlTypes.CHAR)@Column(nullable=false,length=36,columnDefinition="char(36)",updatable=false)String reference;
    @Column(nullable=false,precision=15,scale=2,updatable=false)BigDecimal amount;
    @Column(name="principal_amount",nullable=false,precision=15,scale=2,updatable=false)BigDecimal principal;
    @Column(name="interest_amount",nullable=false,precision=15,scale=2,updatable=false)BigDecimal interest;
    @Column(name="paid_at",nullable=false,updatable=false)Instant paidAt;
    @Column(name="created_at",nullable=false,updatable=false)Instant createdAt;
    @Column(name="updated_at",nullable=false,updatable=false)Instant updatedAt;
    protected LoanPayment(){}
}
