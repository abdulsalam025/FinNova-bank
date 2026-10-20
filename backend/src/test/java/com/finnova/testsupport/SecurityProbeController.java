package com.finnova.testsupport;
import java.util.Map;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
// Outside com.finnova.bank scanning; registered ONLY by AuthSecurityTest.
// Test classes are never included in the executable application JAR.
@RestController
public class SecurityProbeController {
    @GetMapping("/api/_test/admin") @PreAuthorize("hasRole('ADMIN')")
    public Map<String, Boolean> admin() { return Map.of("allowed", true); }
    @GetMapping("/api/_test/officer") @PreAuthorize("hasAnyRole('LOAN_OFFICER','ADMIN')")
    public Map<String, Boolean> officer() { return Map.of("allowed", true); }
    @GetMapping("/api/_test/error")
    public void failure() { throw new IllegalStateException("TEST SQL AND SECRET MUST NEVER REACH RESPONSE"); }
}
