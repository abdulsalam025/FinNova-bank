package com.finnova.bank.banking;
import java.time.Clock;
import com.fasterxml.jackson.databind.JsonNode;
import com.finnova.bank.banking.BankingDtos.IdempotentReply;
import com.finnova.bank.common.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.*;
@Service
public class IdempotencyService {
    private final IdempotencyRepository records;
    private final Clock clock;
    public IdempotencyService(IdempotencyRepository records,Clock clock){this.records=records;this.clock=clock;}
    @Transactional(propagation=Propagation.MANDATORY)
    public IdempotencyRecord reserve(long user,String operation,String key,String hash){
        // Atomic MySQL upsert blocks a duplicate key until the first transaction
        // commits/rolls back; do NOT catch a unique exception in a doomed JPA TX.
        records.reserve(user,operation,key,hash);
        IdempotencyRecord record=records.lock(user,operation,key).orElseThrow(()->new IllegalStateException("Idempotency reservation missing"));
        if(!record.getRequestHash().equals(hash))throw new ApiException(HttpStatus.CONFLICT,"This idempotency key belongs to a different request. Use a new key for a new operation.");
        return record;
    }
    @Transactional(propagation=Propagation.MANDATORY)
    public IdempotentReply complete(IdempotencyRecord record,int status,JsonNode body){
        record.complete(status,body,clock.instant());
        return new IdempotentReply(status,body.deepCopy(),false);
    }
    public IdempotentReply replay(IdempotencyRecord record){return new IdempotentReply(record.getResponseStatus(),record.getResponseBody().deepCopy(),true);}
}
