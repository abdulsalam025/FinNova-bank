package com.finnova.bank.banking;
import java.time.Instant;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
@Entity @Table(name="idempotency_keys")
public class IdempotencyRecord {
    @Id @GeneratedValue(strategy=GenerationType.IDENTITY) private Long id;
    @Column(name="user_id",nullable=false,updatable=false) private Long userId;
    @Column(nullable=false,length=16,updatable=false) private String operation;
    @Column(name="idempotency_key",nullable=false,length=128,updatable=false) private String idempotencyKey;
    @JdbcTypeCode(SqlTypes.CHAR) @Column(name="request_hash",nullable=false,length=64,updatable=false,columnDefinition="char(64)") private String requestHash;
    @Column(nullable=false,length=16) private String state;
    @Column(name="response_status") private Integer responseStatus;
    @JdbcTypeCode(SqlTypes.JSON) @Column(name="response_body",columnDefinition="json") private JsonNode responseBody;
    @Column(name="completed_at") private Instant completedAt;
    @Column(name="created_at",nullable=false,updatable=false) private Instant createdAt;
    @Column(name="updated_at",nullable=false) private Instant updatedAt;
    protected IdempotencyRecord() { }
    public Long getId(){return id;} public String getRequestHash(){return requestHash;}
    public boolean completed(){return "COMPLETED".equals(state);}
    public Integer getResponseStatus(){return responseStatus;} public JsonNode getResponseBody(){return responseBody;}
    public void complete(int status,JsonNode body,Instant now){
        state="COMPLETED"; responseStatus=status; responseBody=body.deepCopy(); completedAt=now; updatedAt=now;
    }
}
