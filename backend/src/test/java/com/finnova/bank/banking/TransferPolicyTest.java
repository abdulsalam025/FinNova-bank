package com.finnova.bank.banking;
import java.math.BigDecimal;
import com.finnova.bank.banking.BankingDtos.TransferRequest;
import com.finnova.bank.common.ApiException;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
class TransferPolicyTest {
    private final TransferPolicy policy=new TransferPolicy();
    @Test void independentlyCalculatedBalancesAreExact(){
        var actual=policy.balances(new BigDecimal("1000.00"),new BigDecimal("5.55"),new BigDecimal("123.45"));
        assertEquals(new BigDecimal("876.55"),actual.source());assertEquals(new BigDecimal("129.00"),actual.target());
    }
    @Test void rejectsZeroNegativeTooPreciseAndSameAccountRequests(){
        for(String amount:new String[]{"0.00","-1.00","0.001","10000000000000.00"})
            assertThrows(ApiException.class,()->policy.canonical(new TransferRequest(1L,2L,new BigDecimal(amount),null)));
        assertThrows(ApiException.class,()->policy.canonical(new TransferRequest(1L,1L,new BigDecimal("1.00"),null)));
    }
    @Test void fingerprintCanonicalizesScaleAndSurroundingNoteWhitespace(){
        var a=policy.canonical(new TransferRequest(1L,2L,new BigDecimal("1.0")," demo "));
        var b=policy.canonical(new TransferRequest(1L,2L,new BigDecimal("1.00"),"demo"));
        assertEquals(a.fingerprint(),b.fingerprint());assertTrue(a.fingerprint().matches("[0-9a-f]{64}"));
        assertNotEquals(a.fingerprint(),policy.canonical(new TransferRequest(2L,1L,new BigDecimal("1.00"),"demo")).fingerprint());
    }
    @Test void insufficientBalanceAndDestinationOverflowAreRejected(){
        assertThrows(ApiException.class,()->policy.balances(new BigDecimal("1.00"),BigDecimal.ZERO,new BigDecimal("1.01")));
        assertThrows(ApiException.class,()->policy.balances(new BigDecimal("2.00"),TransferPolicy.MAX_MONEY,new BigDecimal("0.01")));
    }
    @Test void rejectsMissingOrUnsafeKeysButAcceptsUuid(){
        for(String key:new String[]{"","with space","x".repeat(129),"bad\nkey"})assertThrows(ApiException.class,()->policy.key(key));
        assertThrows(ApiException.class,()->policy.key(null));
        assertNotNull(policy.key(java.util.UUID.randomUUID().toString()));
    }
}
