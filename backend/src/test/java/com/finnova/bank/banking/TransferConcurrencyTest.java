package com.finnova.bank.banking;
import java.math.BigDecimal;
import java.util.*;
import java.util.concurrent.*;
import java.util.function.IntFunction;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.finnova.bank.banking.BankingDtos.*;
import com.finnova.bank.common.ApiException;
import com.finnova.testsupport.BankingFixtures;
import com.finnova.testsupport.BankingFixtures.Fixture;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import static org.junit.jupiter.api.Assertions.*;
@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.NONE) @ActiveProfiles("dbtest") @Import(BankingFixtures.class)
class TransferConcurrencyTest {
    @Autowired TransferService transfers;@Autowired BankingFixtures.Factory fixtures;@Autowired JdbcTemplate jdbc;
    @Autowired ObjectMapper mapper;
    Fixture fixture;
    @AfterEach void retire(){fixtures.retire(fixture);}
    @Test void competingWithdrawalsNeverOverdrawOrLoseMoney()throws Exception{
        fixture=fixtures.create("1000.00","0.00");
        List<IdempotentReply> replies=parallel(2,i->()->send("withdraw-"+i+"-"+UUID.randomUUID(),fixture.source(),fixture.target(),"700.00"));
        assertEquals(1,replies.stream().filter(value->value.status()==201).count());
        assertEquals(1,replies.stream().filter(value->value.status()==422).count());
        assertMoney("300.00",balance(fixture.source()));assertMoney("700.00",balance(fixture.target()));
        assertEquals(2L,transferRows());assertTotal("1000.00");assertReconciled();
    }
    @Test void oppositeDirectionsUseTheSameLockOrderAndConserveBalances()throws Exception{
        fixture=fixtures.create("1000.00","1000.00");
        List<IdempotentReply> replies=parallel(20,i->()->send("opposite-"+UUID.randomUUID(),i%2==0?fixture.source():fixture.target(),i%2==0?fixture.target():fixture.source(),"10.00"));
        assertTrue(replies.stream().allMatch(value->value.status()==201));
        assertMoney("1000.00",balance(fixture.source()));assertMoney("1000.00",balance(fixture.target()));
        assertEquals(40L,transferRows());assertTotal("2000.00");assertReconciled();
    }
    @Test void simultaneousIdenticalKeysCreateExactlyOneTransferAndOriginalResult()throws Exception{
        fixture=fixtures.create("1000.00","0.00");String key="same-"+UUID.randomUUID();
        List<IdempotentReply> replies=parallel(8,i->()->send(key,fixture.source(),fixture.target(),"25.00"));
        assertTrue(replies.stream().allMatch(value->value.status()==201));
        assertEquals(1L,replies.stream().filter(value->!value.replayed()).count());
        // Compare the actual JSON protocol values, not LongNode-vs-IntNode
        // implementation details. MySQL may also reorder object keys.
        JsonNode originalPayload=wireJson(replies.getFirst().body());
        for(var reply:replies)assertEquals(originalPayload,wireJson(reply.body()));
        assertMoney("975.00",balance(fixture.source()));assertMoney("25.00",balance(fixture.target()));
        assertEquals(2L,transferRows());
        assertEquals(1L,jdbc.queryForObject("SELECT COUNT(*) FROM idempotency_keys WHERE user_id=? AND operation='TRANSFER' AND state='COMPLETED'",Long.class,fixture.user()));
        assertTotal("1000.00");assertReconciled();
    }
    @Test void racingDifferentPayloadsForOneKeyCannotBothExecute()throws Exception{
        fixture=fixtures.create("1000.00","0.00");String key="different-"+UUID.randomUUID();
        List<IdempotentReply> replies=parallel(2,i->()->{
            try{return send(key,fixture.source(),fixture.target(),i==0?"10.00":"20.00");}
            catch(ApiException ex){assertEquals(409,ex.status().value());return new IdempotentReply(409,null,false);}
        });
        assertEquals(1L,replies.stream().filter(value->value.status()==201).count());
        assertEquals(1L,replies.stream().filter(value->value.status()==409).count());
        BigDecimal target=balance(fixture.target());
        assertTrue(target.compareTo(new BigDecimal("10.00"))==0 || target.compareTo(new BigDecimal("20.00"))==0);
        assertEquals(2L,transferRows());assertTotal("1000.00");assertReconciled();
    }
    @Test void replayComparisonMatchesJsonValuesRegardlessOfIntegerNodeWidthAndKeyOrder()throws Exception{
        JsonNode original=mapper.createObjectNode().put("sourceAccountId",1057L)
                .put("targetAccountId",1058L).put("amount","25.00").put("reference","synthetic-reference");
        JsonNode stored=mapper.readTree("""
                {"reference":"synthetic-reference","amount":"25.00","targetAccountId":1058,"sourceAccountId":1057}
                """);
        assertEquals(wireJson(original),wireJson(stored));
    }
    @Test void replayComparisonPreservesLargeIdsAndDetectsActualMoneyAndIdChanges()throws Exception{
        long largeId=9007199254740993L;
        var original=mapper.createObjectNode().put("sourceAccountId",largeId).put("amount","25.00");
        JsonNode normalized=wireJson(original);
        assertEquals(largeId,normalized.get("sourceAccountId").longValue());
        assertEquals("25.00",normalized.get("amount").textValue());
        assertNotEquals(normalized,wireJson(original.deepCopy().put("amount","25.01")));
        assertNotEquals(normalized,wireJson(original.deepCopy().put("sourceAccountId",largeId+1)));
    }
    private JsonNode wireJson(JsonNode value)throws java.io.IOException{
        // No float/double or narrowing integer casts. Monetary strings stay exact;
        // every field/value and array order still participates in strict equality.
        return mapper.readTree(mapper.writeValueAsBytes(value));
    }
    private IdempotentReply send(String key,long source,long target,String amount){
        return BankingFixtures.as(fixture,()->transfers.transfer(fixture.user(),key,new TransferRequest(source,target,new BigDecimal(amount),"Concurrent synthetic test")));
    }
    private <T>List<T> parallel(int count,IntFunction<Callable<T>> factory)throws Exception{
        CountDownLatch start=new CountDownLatch(1);
        try(ExecutorService executor=Executors.newFixedThreadPool(Math.min(4,count))){
            List<Future<T>> futures=new ArrayList<>();
            for(int i=0;i<count;i++){
                Callable<T> action=factory.apply(i);
                futures.add(executor.submit(()->{start.await();return action.call();}));
            }
            start.countDown();List<T> replies=new ArrayList<>();
            for(Future<T> future:futures)replies.add(future.get(30,TimeUnit.SECONDS));
            return replies;
        }
    }
    private BigDecimal balance(long id){return jdbc.queryForObject("SELECT balance FROM accounts WHERE id=?",BigDecimal.class,id);}
    private long transferRows(){return jdbc.queryForObject("SELECT COUNT(*) FROM transactions WHERE account_id IN (?,?) AND transaction_type IN ('TRANSFER_DEBIT','TRANSFER_CREDIT')",Long.class,fixture.source(),fixture.target());}
    private void assertMoney(String expected,BigDecimal actual){assertEquals(0,new BigDecimal(expected).compareTo(actual));}
    private void assertTotal(String expected){assertMoney(expected,balance(fixture.source()).add(balance(fixture.target())));}
    private void assertReconciled(){
        for(long id:new long[]{fixture.source(),fixture.target()}){
            BigDecimal ledger=jdbc.queryForObject("SELECT COALESCE(SUM(CASE WHEN direction='CREDIT' THEN amount ELSE -amount END),0.00) FROM transactions WHERE account_id=?",BigDecimal.class,id);
            assertEquals(0,balance(id).compareTo(ledger));
        }
    }
}
