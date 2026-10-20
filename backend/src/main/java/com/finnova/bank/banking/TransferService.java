package com.finnova.bank.banking;
import com.finnova.bank.banking.BankingDtos.*;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
@Service
public class TransferService {
    private final TransferPolicy policy;
    private final TransferTransactionService transaction;
    public TransferService(TransferPolicy policy,TransferTransactionService transaction){this.policy=policy;this.transaction=transaction;}
    @PreAuthorize("hasRole('CUSTOMER') and #userId==authentication.principal.id()")
    public IdempotentReply transfer(long userId,String key,TransferRequest request){
        return transaction.execute(userId,policy.key(key),policy.canonical(request));
    }
}
