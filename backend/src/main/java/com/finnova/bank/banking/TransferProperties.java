package com.finnova.bank.banking;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;
import org.springframework.validation.annotation.Validated;
@Validated @ConfigurationProperties(prefix = "app.transfers")
public record TransferProperties(@Min(1) @Max(1000) int requestsPerMinute) {
    @Configuration @EnableConfigurationProperties(TransferProperties.class)
    public static class Registration { }
}
