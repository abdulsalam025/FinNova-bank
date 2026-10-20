package com.finnova.bank.banking;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.constraints.*;

public final class BankingDtos {
    private BankingDtos() { }
    public record OpenAccountRequest(@NotBlank @Size(min=2,max=60) String nickname,
                                     @NotNull BankAccount.Type accountType) { }
    public record RenameAccountRequest(@NotBlank @Size(min=2,max=60) String nickname) { }
    public record AccountView(long id, long customerId, String accountNumber, String nickname,
            String accountType, String currency, @JsonFormat(shape=JsonFormat.Shape.STRING) BigDecimal balance,
            String status, Instant createdAt, Instant closedAt) { }
    public record TransactionView(long id, long accountId, String accountNumber, Long counterpartyAccountId,
            String reference, String direction, String transactionType,
            @JsonFormat(shape=JsonFormat.Shape.STRING) BigDecimal amount,
            @JsonFormat(shape=JsonFormat.Shape.STRING) BigDecimal balanceAfter, String description, Instant createdAt) { }
    public record TransferRequest(@NotNull @Positive Long sourceAccountId, @NotNull @Positive Long targetAccountId,
            @NotNull @DecimalMin("0.01") @Digits(integer=13,fraction=2) BigDecimal amount,
            @Size(max=120) String note) { }
    public record RecipientView(long targetAccountId, String recipientName,
            String maskedAccountNumber, String currency) { }
    public record TransferView(String reference, long sourceAccountId, long targetAccountId,
            @JsonFormat(shape=JsonFormat.Shape.STRING) BigDecimal amount,
            @JsonFormat(shape=JsonFormat.Shape.STRING) BigDecimal sourceBalanceAfter,
            @JsonFormat(shape=JsonFormat.Shape.STRING) BigDecimal targetBalanceAfter,
            Instant occurredAt, boolean simulated) { }
    public record PageView<T>(List<T> items, int page, int size, long totalElements, int totalPages,
                               String sortBy, String sortDirection) { }
    public record IdempotentReply(int status, JsonNode body, boolean replayed) { }
}
