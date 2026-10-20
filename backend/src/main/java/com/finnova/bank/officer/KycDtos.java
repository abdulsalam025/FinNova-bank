package com.finnova.bank.officer;
import java.time.Instant;
import jakarta.validation.constraints.*;
public final class KycDtos {
    private KycDtos(){} public enum Decision{VERIFIED,REJECTED}
    public record Review(@NotNull Decision decision,@NotBlank@Size(max=1000)String reason){}
    public record Resubmit(@NotBlank@Size(max=1000)String reason){}
    public record View(long id,long customerId,String email,String fullName,String customerRole,boolean customerEnabled,String documentType,String documentReference,String status,Long reviewedBy,Instant reviewedAt,String reviewNotes,Instant createdAt){}
}
