package com.finnova.bank.loans;
import java.time.Instant;
import jakarta.persistence.*;
import org.hibernate.annotations.Immutable;
@Entity @Immutable @Table(name="loan_application_history")
public class ApplicationHistory {
    @Id @GeneratedValue(strategy=GenerationType.IDENTITY)Long id;
    @Column(name="loan_application_id",nullable=false,updatable=false)Long applicationId;
    @Column(name="from_status",nullable=false,length=32,updatable=false)String fromStatus;
    @Column(name="to_status",nullable=false,length=32,updatable=false)String toStatus;
    @Column(name="actor_type",nullable=false,length=10,updatable=false)String actorType;
    @Column(name="actor_user_id",updatable=false)Long actorId;
    @Column(name="actor_role",length=20,updatable=false)String actorRole;
    @Column(nullable=false,length=1000,updatable=false)String notes;
    @Column(name="occurred_at",nullable=false,updatable=false)Instant occurredAt;
    @Column(name="created_at",nullable=false,updatable=false)Instant createdAt;
    @Column(name="updated_at",nullable=false,updatable=false)Instant updatedAt;
    protected ApplicationHistory(){}
}
