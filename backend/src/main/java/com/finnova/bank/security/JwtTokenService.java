package com.finnova.bank.security;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.stereotype.Service;

@Service
public class JwtTokenService {
    private final JwtEncoder encoder;
    private final SecurityProperties properties;
    private final Clock clock;
    public JwtTokenService(JwtEncoder encoder, SecurityProperties properties, Clock clock) {
        this.encoder = encoder; this.properties = properties; this.clock = clock;
    }
    public String issue(long userId, long version) {
        Instant now = Instant.now(clock);
        JwtClaimsSet claims = JwtClaimsSet.builder().issuer(properties.issuer()).subject(Long.toString(userId))
                .audience(List.of(properties.audience())).issuedAt(now).notBefore(now)
                .expiresAt(now.plusSeconds(properties.tokenTtlSeconds())).id(UUID.randomUUID().toString())
                .claim("ver", version).build();
        return encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).type("JWT").build(), claims)).getTokenValue();
    }
}
