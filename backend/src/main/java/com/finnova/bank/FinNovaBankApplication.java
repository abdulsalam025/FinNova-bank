package com.finnova.bank;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.security.servlet.UserDetailsServiceAutoConfiguration;
import org.springframework.context.ConfigurableApplicationContext;

@SpringBootApplication(exclude = UserDetailsServiceAutoConfiguration.class)
public class FinNovaBankApplication {
    public static void main(String[] args) {
        if ("true".equals(System.getenv("FINNOVA_DEMO_PROVISION"))) {
            SpringApplication application = new SpringApplication(FinNovaBankApplication.class);
            application.setWebApplicationType(WebApplicationType.NONE);
            application.setAdditionalProfiles("demo-provision");
            try (ConfigurableApplicationContext context = application.run(args)) {
                // The profile-specific runner performs the explicit, audited demo setup.
                // Closing the non-web context releases pools without leaving a server.
            }
        } else {
            SpringApplication.run(FinNovaBankApplication.class, args);
        }
    }
}
