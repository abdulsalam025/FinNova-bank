package com.finnova.bank.banking;
import java.math.BigDecimal;
import java.time.Instant;
import jakarta.persistence.*;
import org.hibernate.annotations.Immutable;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
@Entity @Immutable @Table(name="transactions")
public class FinancialTransaction {
    @Id @GeneratedValue(strategy=GenerationType.IDENTITY) private Long id;
    @Column(name="account_id",nullable=false,updatable=false) private Long accountId;
    @Column(name="counterparty_account_id",updatable=false) private Long counterpartyAccountId;
    @Column(name="loan_application_id",updatable=false) private Long loanApplicationId;
    @Column(name="idempotency_key_id",updatable=false) private Long idempotencyKeyId;
    @Column(name="original_transaction_id",updatable=false) private Long originalTransactionId;
    @JdbcTypeCode(SqlTypes.CHAR) @Column(nullable=false,length=36,updatable=false,columnDefinition="char(36)") private String reference;
    @Column(nullable=false,length=6,updatable=false) private String direction;
    @Column(name="transaction_type",nullable=false,length=24,updatable=false) private String transactionType;
    @Column(nullable=false,precision=15,scale=2,updatable=false) private BigDecimal amount;
    @Column(name="balance_after",nullable=false,precision=15,scale=2,updatable=false) private BigDecimal balanceAfter;
    @Column(nullable=false,length=255,updatable=false) private String description;
    @Column(name="actor_user_id",updatable=false) private Long actorUserId;
    @Column(name="created_at",nullable=false,updatable=false) private Instant createdAt;
    @Column(name="updated_at",nullable=false,updatable=false) private Instant updatedAt;
    protected FinancialTransaction() { }
    public FinancialTransaction(long accountId,Long counterparty,String reference,String direction,String type,
            BigDecimal amount,BigDecimal balanceAfter,String description,long actor,Long keyId,Instant now) {
        this.accountId=accountId; counterpartyAccountId=counterparty; this.reference=reference;
        this.direction=direction; transactionType=type; this.amount=amount; this.balanceAfter=balanceAfter;
        this.description=description; actorUserId=actor; idempotencyKeyId=keyId; createdAt=now; updatedAt=now;
    }
    public static FinancialTransaction loan(long account,String reference,String type,BigDecimal amount,BigDecimal after,
            long actor,Long key,long application,Instant now){
        if(!"LOAN_DISBURSEMENT".equals(type) && !"LOAN_REPAYMENT".equals(type))throw new IllegalArgumentException("Unsupported loan ledger type");
        FinancialTransaction entry=new FinancialTransaction(account,null,reference,"LOAN_DISBURSEMENT".equals(type)?"CREDIT":"DEBIT",
                type,amount,after,"SIMULATED "+type,actor,key,now);
        entry.loanApplicationId=application;return entry;
    }
    public Long getId(){return id;} public Long getAccountId(){return accountId;}
    public Long getCounterpartyAccountId(){return counterpartyAccountId;} public String getReference(){return reference;}
    public String getDirection(){return direction;} public String getTransactionType(){return transactionType;}
    public BigDecimal getAmount(){return amount;} public BigDecimal getBalanceAfter(){return balanceAfter;}
    public String getDescription(){return description;} public Instant getCreatedAt(){return createdAt;}
}

