package com.finnova.bank.loans;
import java.math.BigDecimal;
import java.time.Instant;
import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
@Entity @Table(name="loan_applications")
public class LoanApplication {
    @Id @GeneratedValue(strategy=GenerationType.IDENTITY)Long id;
    @Column(name="customer_id",nullable=false,updatable=false)Long customerId;
    @Column(name="loan_product_id",nullable=false)Long productId;
    @Column(name="disbursement_account_id",nullable=false)Long accountId;
    @Column(name="product_name_snapshot",nullable=false,length=100)String productName;
    @Column(nullable=false,precision=15,scale=2)BigDecimal principal;
    @Column(name="annual_rate",nullable=false,precision=5,scale=2)BigDecimal annualRate;
    @Column(name="tenure_months",nullable=false)int months;
    @Column(name="declared_monthly_income",nullable=false,precision=15,scale=2)BigDecimal income;
    @Column(nullable=false,length=1000)String purpose;
    @Column(name="customer_notes",length=2000)String customerNotes;
    @Enumerated(EnumType.STRING)@JdbcTypeCode(SqlTypes.VARCHAR)@Column(nullable=false,length=32)ApplicationStatus status;
    @Column(name="assigned_officer_id")Long assignedOfficer;
    @Column(name="approved_by")Long approvedBy;
    @Column(name="submitted_at")Instant submittedAt;
    @Column(name="approved_at")Instant approvedAt;
    @Column(name="decision_reason",length=1000)String decisionReason;
    @Column(name="additional_info_request",length=1000)String additionalInfo;
    @Version long version;
    @Column(name="created_at",nullable=false,updatable=false)Instant createdAt;
    @Column(name="updated_at",nullable=false)Instant updatedAt;
    protected LoanApplication(){}
}
