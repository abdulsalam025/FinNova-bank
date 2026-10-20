package com.finnova.bank.loans;
import java.math.BigDecimal;
import java.time.*;
import jakarta.persistence.*;
@Entity @Table(name="installments")
public class Installment {
    @Id @GeneratedValue(strategy=GenerationType.IDENTITY)Long id;
    @Column(name="loan_id",nullable=false,updatable=false)Long loanId;
    @Column(name="installment_number",nullable=false,updatable=false)int number;
    @Column(name="due_date",nullable=false,updatable=false)LocalDate dueDate;
    @Column(name="principal_amount",nullable=false,precision=15,scale=2,updatable=false)BigDecimal principal;
    @Column(name="interest_amount",nullable=false,precision=15,scale=2,updatable=false)BigDecimal interest;
    @Column(name="total_amount",nullable=false,precision=15,scale=2,updatable=false)BigDecimal total;
    @Column(name="remaining_balance",nullable=false,precision=15,scale=2,updatable=false)BigDecimal remaining;
    @Column(nullable=false,length=16)String status;
    @Column(name="paid_at")Instant paidAt;
    @Version long version;
    @Column(name="created_at",nullable=false,updatable=false)Instant createdAt;
    @Column(name="updated_at",nullable=false)Instant updatedAt;
    protected Installment(){}
}
