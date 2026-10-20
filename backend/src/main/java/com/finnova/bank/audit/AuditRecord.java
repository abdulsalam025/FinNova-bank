package com.finnova.bank.audit;

import java.time.Instant;
import java.util.Map;
import jakarta.persistence.*;
import org.hibernate.annotations.Immutable;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity @Immutable @Table(name = "audit_logs")
public class AuditRecord {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @Column(name = "actor_type", nullable = false, length = 12, updatable = false) private String actorType;
    @Column(name = "actor_user_id", updatable = false) private Long actorUserId;
    @Column(name = "actor_role", length = 20, updatable = false) private String actorRole;
    @Column(name = "event_type", nullable = false, length = 64, updatable = false) private String eventType;
    @Column(nullable = false, length = 12, updatable = false) private String outcome;
    @Column(name = "resource_type", nullable = false, length = 64, updatable = false) private String resourceType;
    @Column(name = "resource_id", length = 64, updatable = false) private String resourceId;
    @JdbcTypeCode(SqlTypes.JSON) @Column(columnDefinition = "json", updatable = false) private Map<String, Object> details;
    @Column(name = "occurred_at", nullable = false, updatable = false) private Instant occurredAt;
    @Column(name = "created_at", nullable = false, updatable = false) private Instant createdAt;
    @Column(name = "updated_at", nullable = false, updatable = false) private Instant updatedAt;
    protected AuditRecord() { }
    public Long getId(){return id;} public String getActorType(){return actorType;}
    public Long getActorUserId(){return actorUserId;} public String getActorRole(){return actorRole;}
    public String getEventType(){return eventType;} public String getOutcome(){return outcome;}
    public String getResourceType(){return resourceType;} public String getResourceId(){return resourceId;}
    public Map<String,Object> getDetails(){return details;} public Instant getOccurredAt(){return occurredAt;}
    public AuditRecord(AuditActor actor, String event, String outcome, String resourceType,
                       String resourceId, Map<String, Object> details, Instant now) {
        actorType = actor.type(); actorUserId = actor.id(); actorRole = actor.role();
        eventType = event; this.outcome = outcome; this.resourceType = resourceType;
        this.resourceId = resourceId; this.details = Map.copyOf(details);
        occurredAt = now; createdAt = now; updatedAt = now;
    }
}

