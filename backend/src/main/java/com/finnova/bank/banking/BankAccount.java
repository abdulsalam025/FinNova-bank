package com.finnova.bank.banking;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.UUID;
import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
@Entity @Table(name="accounts")
public class BankAccount {
    public enum Type { SAVINGS, CURRENT }
    public enum Status { ACTIVE, FROZEN, CLOSED }
    @Id @GeneratedValue(strategy=GenerationType.IDENTITY) private Long id;
    @Column(name="customer_id",nullable=false,updatable=false) private Long customerId;
    @Column(name="account_number",nullable=false,unique=true,length=24,updatable=false) private String accountNumber;
    @Column(nullable=false,length=60) private String nickname;
    @Enumerated(EnumType.STRING) @JdbcTypeCode(SqlTypes.VARCHAR)
    @Column(name="account_type",nullable=false,length=16,updatable=false) private Type accountType;
    @Column(nullable=false,length=3,updatable=false,columnDefinition="char(3)") @JdbcTypeCode(SqlTypes.CHAR) private String currency;
    @Column(nullable=false,precision=15,scale=2) private BigDecimal balance;
    @Enumerated(EnumType.STRING) @JdbcTypeCode(SqlTypes.VARCHAR) @Column(nullable=false,length=16) private Status status;
    @Column(name="closed_at") private Instant closedAt;
    @Version private long version;
    @Column(name="created_at",nullable=false,updatable=false) private Instant createdAt;
    @Column(name="updated_at",nullable=false) private Instant updatedAt;
    protected BankAccount() { }
    public BankAccount(long customerId,String nickname,Type type,Instant now) {
        this.customerId=customerId; this.nickname=nickname; accountType=type;
        accountNumber="FN"+UUID.randomUUID().toString().replace("-","").substring(0,22).toUpperCase(java.util.Locale.ROOT);
        currency="INR"; balance=new BigDecimal("0.00"); status=Status.ACTIVE; createdAt=now; updatedAt=now;
    }
    public Long getId(){return id;} public Long getCustomerId(){return customerId;}
    public String getAccountNumber(){return accountNumber;} public String getNickname(){return nickname;}
    public Type getAccountType(){return accountType;} public String getCurrency(){return currency;}
    public BigDecimal getBalance(){return balance;} public Status getStatus(){return status;}
    public Instant getCreatedAt(){return createdAt;} public Instant getClosedAt(){return closedAt;}
    public void rename(String value,Instant now){nickname=value; updatedAt=now;}
    public void close(Instant now){status=Status.CLOSED; closedAt=now; updatedAt=now;}
    public void applyBalance(BigDecimal value,Instant now){
        if (value.signum()<0 || value.compareTo(TransferPolicy.MAX_MONEY)>0) throw new IllegalStateException("Invalid internal account balance");
        balance=value.setScale(2,RoundingMode.UNNECESSARY); updatedAt=now;
    }
}
