package com.finnova.bank.demo;

import java.time.Clock;
import java.util.LinkedHashMap;
import java.util.Map;
import com.finnova.bank.audit.*;
import com.finnova.bank.auth.domain.BankUser;
import com.finnova.bank.auth.repository.UserRepository;
import com.finnova.bank.auth.validation.StrongPasswordValidator;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component @Profile("demo-provision")
public class DemoUserProvisioning implements ApplicationRunner {
    private final UserRepository users;
    private final PasswordEncoder encoder;
    private final AuditService audit;
    private final Clock clock;
    private final JdbcTemplate jdbc;
    public DemoUserProvisioning(UserRepository users, PasswordEncoder encoder, AuditService audit, Clock clock, JdbcTemplate jdbc) {
        this.users = users; this.encoder = encoder; this.audit = audit; this.clock = clock; this.jdbc = jdbc;
    }
    @Override @Transactional
    public void run(ApplicationArguments ignored) {
        if (!"true".equals(System.getenv("FINNOVA_DEMO_PROVISION")) ||
                !"finnova_demo".equals(jdbc.queryForObject("SELECT DATABASE()", String.class)) ||
                !jdbc.queryForObject("SELECT CURRENT_USER()", String.class).startsWith("finnova_app@")) {
            throw new IllegalStateException("Demo provisioning is allowed only by explicit local CLI setup in finnova_demo as the runtime user.");
        }
        LinkedHashMap<String, String> accounts = new LinkedHashMap<>();
        accounts.put("customer1@finnova.test", "DEMO_CUSTOMER1_PASSWORD");
        accounts.put("customer2@finnova.test", "DEMO_CUSTOMER2_PASSWORD");
        accounts.put("officer@finnova.test", "DEMO_OFFICER_PASSWORD");
        accounts.put("admin@finnova.test", "DEMO_ADMIN_PASSWORD");
        // Validate all inputs and seed states before changing any credential.
        Map<String, BankUser> locked = new LinkedHashMap<>();
        for (var entry : accounts.entrySet()) {
            BankUser user = users.lockByEmail(entry.getKey()).orElseThrow(() -> new IllegalStateException("Expected seed identity is missing."));
            if (user.isEnabled() || user.getPasswordHash() != null) throw new IllegalStateException("Demo identities are already provisioned or modified; no passwords were reset.");
            if (!StrongPasswordValidator.accepts(System.getenv(entry.getValue()))) throw new IllegalStateException("A demo password does not meet policy. Its value was not printed.");
            locked.put(entry.getKey(), user);
        }
        if (accounts.values().stream().map(System::getenv).distinct().count() != 4) {
            throw new IllegalStateException("Use four different demo passwords. No identities were changed.");
        }
        for (var entry : accounts.entrySet()) {
            BankUser user = locked.get(entry.getKey());
            user.activateSeed(encoder.encode(System.getenv(entry.getValue())), clock.instant());
            audit.record(AuditActor.system(), "DEMO_CREDENTIAL_PROVISIONED", "SUCCESS", "USER", user.getId().toString(),
                    Map.of("role", user.getRole().name(), "synthetic", true));
        }
        users.flush();
        System.out.println("Demo credential changes flushed; completing the transaction. No passwords printed.");
    }
}
