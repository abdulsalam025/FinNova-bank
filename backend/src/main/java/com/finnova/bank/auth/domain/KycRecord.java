package com.finnova.bank.auth.domain;

import java.time.Instant;
import java.util.UUID;
import jakarta.persistence.*;

@Entity @Table(name = "kyc_records")
public class KycRecord {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @Column(name = "customer_id", nullable = false, unique = true) private Long customerId;
    @Column(name = "document_type", nullable = false, length = 30) private String documentType;
    @Column(name = "document_reference", nullable = false, unique = true, length = 64) private String documentReference;
    @Column(nullable = false, length = 16) private String status;
    @Column(name="reviewed_by") private Long reviewedBy;
    @Column(name="reviewed_at") private Instant reviewedAt;
    @Column(name="review_notes",length=1000) private String reviewNotes;
    @Version private long version;
    @Column(name = "created_at", nullable = false, updatable = false) private Instant createdAt;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;
    protected KycRecord() { }
    public Long getId(){return id;} public Long getCustomerId(){return customerId;}
    public String getDocumentType(){return documentType;} public String getDocumentReference(){return documentReference;}
    public String getStatus(){return status;} public Long getReviewedBy(){return reviewedBy;}
    public Instant getReviewedAt(){return reviewedAt;} public String getReviewNotes(){return reviewNotes;}
    public Instant getCreatedAt(){return createdAt;}
    public void decide(String decision,long reviewer,String notes,Instant now){status=decision;reviewedBy=reviewer;reviewedAt=now;reviewNotes=notes;updatedAt=now;}
    public void resubmit(String notes,Instant now){status="PENDING";reviewedBy=null;reviewedAt=null;reviewNotes=notes;updatedAt=now;}
    public KycRecord(long customerId, Instant now) {
        this.customerId = customerId; documentType = "DEMO_ID";
        documentReference = "DEMO-" + UUID.randomUUID(); status = "PENDING";
        createdAt = now; updatedAt = now;
    }
}

