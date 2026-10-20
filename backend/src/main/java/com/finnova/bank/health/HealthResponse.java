package com.finnova.bank.health;

import java.time.Instant;

public record HealthResponse(
        String status,
        String application,
        String scope,
        Instant timestamp
) {
}
