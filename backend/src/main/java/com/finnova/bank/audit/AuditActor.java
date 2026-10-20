package com.finnova.bank.audit;
import com.finnova.bank.auth.domain.Role;
public record AuditActor(String type, Long id, String role) {
    public static AuditActor user(long id, Role role) { return new AuditActor("USER", id, role.name()); }
    public static AuditActor system() { return new AuditActor("SYSTEM", null, null); }
    public static AuditActor anonymous() { return new AuditActor("ANONYMOUS", null, null); }
}
